import Foundation
import HealthKit

/**
 * Batimento cardíaco AO VIVO no relógio (dono, 25/jul/2026: "coloca os batimentos
 * abaixo das horas — pode ser com um coração pulsando?").
 *
 * POR QUE UM HKWorkoutSession E NÃO SÓ UMA QUERY: o watchOS só entrega BPM com a
 * cadência de treino (~5s) enquanto há uma sessão de treino ativa; sem ela o sensor
 * lê de 5 em 5 MINUTOS e o número fica velho a partida inteira. De quebra a sessão
 * mantém o app EM PRIMEIRO PLANO durante a partida — que é exatamente o que faltava
 * pro relógio não ser suspenso no meio do jogo.
 *
 * FONTE PRIMÁRIA = O DELEGATE DO LIVE BUILDER (14/ago/2026, relato do dono: "no
 * Atividade meu batimento passa de 160; no scoreplace a faixa fica bem mais baixa
 * com a MESMA sensação"). A versão anterior lia por HKAnchoredObjectQuery — a
 * amostra precisava ser GRAVADA no banco do HealthKit antes de chegar aqui, e o
 * lote vinha em ordem de INSERÇÃO (o `.last` podia ser amostra velha). No tênis o
 * BPM oscila em picos (ponto → sobe; descanso → cai): com o atraso do round-trip,
 * a tela mostrava sistematicamente o VALE de segundos atrás, nunca o pico. O
 * delegate (`workoutBuilder(_:didCollectDataOf:)` → `mostRecentQuantity()`) entrega
 * a amostra no instante da coleta — é o caminho canônico de app de treino, a mesma
 * fonte que o app Atividade exibe. A query continua como FALLBACK (com predicado
 * de data e escolha por endDate), e um carimbo de tempo único garante que amostra
 * velha NUNCA sobrescreve mais nova, venha de onde vier.
 *
 * DEGRADA EM SILÊNCIO: sem permissão, sem sensor (simulador) ou com erro, `bpm` fica
 * nil e a UI simplesmente não mostra nada. Nunca bloqueia o placar.
 *
 * ⚠️ SÓ VALIDA EM RELÓGIO REAL — o simulador do watchOS não gera batimento.
 */
final class HeartRateMonitor: NSObject, ObservableObject, HKLiveWorkoutBuilderDelegate {
    /// Último BPM lido. nil = sem leitura (sem permissão / sem sensor / ainda medindo).
    @Published var bpm: Int? = nil

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var query: HKAnchoredObjectQuery?
    private var running = false
    private var sessionStart: Date? = nil
    /// Fim da amostra mais nova já publicada — o desempate entre as DUAS fontes
    /// (delegate + query). Sem ele, uma amostra atrasada da query podia
    /// sobrescrever a fresca do delegate e o número "voltava no tempo".
    private var lastSampleEnd = Date.distantPast

    private let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
    private let hrUnit = HKUnit.count().unitDivided(by: .minute())

    /// Liga a leitura (idempotente). Chamado quando a partida está AO VIVO.
    func start() {
        guard !running, HKHealthStore.isHealthDataAvailable() else { return }
        running = true
        // `toShare: workoutType` = a partida é GRAVADA como treino no app Saúde ao
        // terminar (conta nos anéis). Sem isso o BPM apareceria na tela
        // mas o exercício seria descartado — jogar 1h não contaria nada.
        store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [hrType]) { [weak self] ok, _ in
            guard let self = self, ok else { self?.running = false; return }
            DispatchQueue.main.async { self.beginSession() }
        }
    }

    /// Desliga (fim de partida / placar fechado) e SALVA o treino. Idempotente.
    ///
    /// `finishWorkout()` é o que faz a partida contar nos ANÉIS DE ATIVIDADE: sem ele a
    /// sessão só serviria pra ler BPM e o esforço seria jogado fora ao fechar o placar.
    /// A ordem importa — endCollection ANTES, finishWorkout no callback dele; invertido,
    /// o treino sai sem as amostras (0 kcal).
    func stop() {
        running = false
        if let q = query { store.stop(q); query = nil }
        let b = builder
        b?.delegate = nil
        session?.end()
        b?.endCollection(withEnd: Date()) { _, _ in
            b?.finishWorkout { _, _ in }   // grava no app Saúde → anéis de atividade
        }
        builder = nil
        session = nil
        sessionStart = nil
        lastSampleEnd = Date.distantPast
        DispatchQueue.main.async { self.bpm = nil }
    }

    private func beginSession() {
        guard session == nil else { return }
        let cfg = HKWorkoutConfiguration()
        cfg.activityType = .tennis          // raquete/areia — a família do app
        cfg.locationType = .outdoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: cfg)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: cfg)
            b.delegate = self                // ← fonte PRIMÁRIA do BPM (ver cabeçalho)
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
            session = s
            builder = b
            sessionStart = now
        } catch {
            running = false
            return
        }
        observeHeartRate()
    }

    /// Publica um BPM se (e só se) a amostra for mais nova que a última mostrada.
    private func publish(_ value: Int, sampleEnd: Date) {
        guard value > 0, sampleEnd > lastSampleEnd else { return }
        lastSampleEnd = sampleEnd
        DispatchQueue.main.async { self.bpm = value }
    }

    // ── Fonte primária: delegate do live builder (amostra no instante da coleta) ──
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                        didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(hrType),
              let stats = workoutBuilder.statistics(for: hrType),
              let qty = stats.mostRecentQuantity() else { return }
        let end = stats.mostRecentQuantityDateInterval()?.end ?? Date()
        publish(Int(qty.doubleValue(for: hrUnit).rounded()), sampleEnd: end)
    }
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    // ── Fallback: stream de amostras já gravadas no HealthKit ──
    /// Cobre o caso de o delegate não entregar (raro). Diferente da versão antiga:
    /// (a) predicado limita ao INÍCIO da sessão — nada de despejo histórico nem
    /// amostra de minutos atrás na abertura; (b) a escolha é pela amostra mais
    /// nova POR DATA (endDate), não pela posição no lote, que é ordem de inserção.
    private func observeHeartRate() {
        let started = sessionStart ?? Date()
        let pred = HKQuery.predicateForSamples(withStart: started, end: nil, options: [])
        let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = {
            [weak self] _, samples, _, _, _ in
            guard let self = self,
                  let qs = samples as? [HKQuantitySample], !qs.isEmpty else { return }
            guard let newest = qs.max(by: { $0.endDate < $1.endDate }) else { return }
            self.publish(Int(newest.quantity.doubleValue(for: self.hrUnit).rounded()),
                         sampleEnd: newest.endDate)
        }
        let q = HKAnchoredObjectQuery(type: hrType, predicate: pred,
                                      anchor: nil, limit: HKObjectQueryNoLimit,
                                      resultsHandler: handler)
        q.updateHandler = handler
        store.execute(q)
        query = q
    }
}
