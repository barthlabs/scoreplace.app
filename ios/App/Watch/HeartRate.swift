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
 * ⛔ O RELATO VOLTOU EM 04/set/2026 — "continuo com a sensação de que está mais baixo
 * do que a realidade" — e a causa NÃO era a de agosto (aquele conserto está de pé e
 * viajou nas builds publicadas). É a SESSÃO DE TREINO SENDO RECICLADA NO MEIO DA
 * PARTIDA, e o caminho é este:
 *
 *   ① `ScoreplaceWatchCompanionApp` liga/desliga o sensor por `.onChange(of:
 *      session.state.active)`.
 *   ② `active` vem do celular, e `js/watch-bridge.js` devolve `inactiveState()`
 *      (active:false) sempre que `window._getLiveScoreState` não existe ou lança —
 *      e ela só existe enquanto o overlay do placar está montado. Recarga do PWA,
 *      retomada do app, re-render do overlay ou um `hello()` do relógio caindo nesse
 *      intervalo mandam `active:false` COM A PARTIDA ROLANDO. Depois volta true.
 *   ③ Cada ida e volta virava `stop()` → `start()`. E `stop()` zerava `session` na
 *      HORA, enquanto o encerramento é ASSÍNCRONO (endCollection → finishWorkout):
 *      o `guard session == nil` de `beginSession()` já passava, e nascia uma SEGUNDA
 *      HKWorkoutSession com a primeira ainda encerrando. O watchOS não aceita duas —
 *      e TODO ERRO ERA DESCARTADO (`startActivity` sem checagem, `beginCollection
 *      { _, _ in }`). O delegate não voltava a disparar e quem sobrava alimentando a
 *      tela era o FALLBACK: de novo o vale de segundos atrás, nunca o pico.
 *
 * O QUE MUDOU AQUI, por isso:
 *   • CICLO DE VIDA SERIALIZADO — `stopping` impede começar enquanto a anterior
 *     encerra; o `finishWorkout` dispara o start que ficou pendente.
 *   • CARÊNCIA de 25s antes de desligar — `active:false` passageiro NÃO derruba o
 *     treino. Mata o dano do tremor na origem, e de quebra não perde o treino dos
 *     anéis por causa de um piscar.
 *   • ERRO PARA DE SER ENGOLIDO (`lastError`), e a coleta de BPM é pedida
 *     EXPLICITAMENTE ao data source em vez de depender do conjunto padrão.
 *   • IDADE e ORIGEM da amostra publicadas — é o que o diagnóstico lê.
 *
 * ⛔ SÓ VALIDA EM RELÓGIO REAL — o simulador do watchOS não gera batimento. Por isso
 * existe o diagnóstico (`diagLine`), que o celular liga com `sp_hr_debug` e o relógio
 * desenha discreto: origem · valor · idade · último erro. Sem ele, "consertado" seria
 * palpite outra vez.
 *
 * DEGRADA EM SILÊNCIO: sem permissão, sem sensor (simulador) ou com erro, `bpm` fica
 * nil e a UI simplesmente não mostra nada. Nunca bloqueia o placar.
 */
final class HeartRateMonitor: NSObject, ObservableObject, HKLiveWorkoutBuilderDelegate {
    /// Último BPM lido. nil = sem leitura (sem permissão / sem sensor / ainda medindo).
    @Published var bpm: Int? = nil
    /// Origem da última leitura publicada — é o que separa "está funcionando" de
    /// "caiu no fallback e você está vendo número velho". Lido pelo diagnóstico.
    @Published private(set) var source: String = "—"
    /// Última falha (autorização, sessão, coleta). Some quando a próxima dá certo.
    @Published private(set) var lastError: String? = nil

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var query: HKAnchoredObjectQuery?
    private var running = false
    /// ⛔ A trava que faltava: enquanto a sessão anterior encerra (assíncrono), NINGUÉM
    /// começa outra. Sem ela nascia uma segunda HKWorkoutSession por cima da primeira.
    private var stopping = false
    /// `start()` que chegou durante o encerramento — atendido quando ele termina.
    private var startPendente = false
    private var sessionStart: Date? = nil
    /// Fim da amostra mais nova já publicada — o desempate entre as DUAS fontes
    /// (delegate + query). Sem ele, uma amostra atrasada da query podia
    /// sobrescrever a fresca do delegate e o número "voltava no tempo".
    private var lastSampleEnd = Date.distantPast
    /// Carência do desligamento. `active:false` de um instante não derruba o treino.
    private var desligamento: DispatchWorkItem? = nil
    private let carenciaSegundos: TimeInterval = 25

    private let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
    private let hrUnit = HKUnit.count().unitDivided(by: .minute())

    /// Linha do diagnóstico (só é desenhada quando o celular manda `hrDebug`).
    /// Formato curto de propósito: cabe na tela do relógio e é lida de relance.
    var diagLine: String {
        let idade = bpm == nil ? "—" : String(Int(Date().timeIntervalSince(lastSampleEnd).rounded())) + "s"
        return "\(source) \(bpm.map(String.init) ?? "—") ha:\(idade)"
            + (lastError.map { " ⚠︎" + $0 } ?? "")
    }

    /// Liga a leitura (idempotente). Chamado quando a partida está AO VIVO.
    func start() {
        // Voltou a ficar ativa dentro da carência: cancela o desligamento e pronto —
        // a sessão nunca chegou a cair, então não há nada a recriar.
        desligamento?.cancel()
        desligamento = nil
        guard HKHealthStore.isHealthDataAvailable() else { return }
        if stopping { startPendente = true; return }
        guard !running else { return }
        running = true
        // `toShare: workoutType` = a partida é GRAVADA como treino no app Saúde ao
        // terminar (conta nos anéis). Sem isso o BPM apareceria na tela
        // mas o exercício seria descartado — jogar 1h não contaria nada.
        store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [hrType]) { [weak self] ok, erro in
            guard let self = self else { return }
            guard ok else {
                DispatchQueue.main.async {
                    self.running = false
                    self.lastError = "auth:" + (erro?.localizedDescription ?? "negada")
                }
                return
            }
            DispatchQueue.main.async { self.beginSession() }
        }
    }

    /// Pede o desligamento — mas só depois da CARÊNCIA. Ver o cabeçalho: `active:false`
    /// passageiro (recarga do PWA, re-render do overlay, `hello()` do relógio) é comum
    /// COM A PARTIDA ROLANDO, e derrubar o treino nesses instantes era o que empurrava
    /// a leitura pro fallback atrasado.
    func stop() {
        desligamento?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.encerrarAgora() }
        desligamento = item
        DispatchQueue.main.asyncAfter(deadline: .now() + carenciaSegundos, execute: item)
    }

    /// Desliga de verdade e SALVA o treino. Idempotente.
    ///
    /// `finishWorkout()` é o que faz a partida contar nos ANÉIS DE ATIVIDADE: sem ele a
    /// sessão só serviria pra ler BPM e o esforço seria jogado fora ao fechar o placar.
    /// A ordem importa — endCollection ANTES, finishWorkout no callback dele; invertido,
    /// o treino sai sem as amostras (0 kcal).
    private func encerrarAgora() {
        desligamento = nil
        guard running || session != nil else { return }
        running = false
        stopping = true
        if let q = query { store.stop(q); query = nil }
        let b = builder
        b?.delegate = nil
        session?.end()
        builder = nil
        session = nil
        sessionStart = nil
        lastSampleEnd = Date.distantPast
        source = "—"
        bpm = nil
        let terminou: () -> Void = { [weak self] in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.stopping = false
                // O `start()` que chegou no meio do encerramento é atendido AGORA —
                // com a sessão anterior de fato encerrada, e não por cima dela.
                if self.startPendente { self.startPendente = false; self.start() }
            }
        }
        if let b = b {
            b.endCollection(withEnd: Date()) { _, _ in
                b.finishWorkout { _, _ in terminou() }   // grava no app Saúde → anéis
            }
        } else {
            terminou()
        }
    }

    private func beginSession() {
        // ⛔ `session == nil` NÃO basta: `encerrarAgora()` zera a referência na hora e o
        // encerramento continua em voo. Quem manda aqui é o `stopping`.
        guard !stopping, session == nil else { return }
        let cfg = HKWorkoutConfiguration()
        cfg.activityType = .tennis          // raquete/areia — a família do app
        cfg.locationType = .outdoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: cfg)
            let b = s.associatedWorkoutBuilder()
            let ds = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: cfg)
            // Pedir o BPM EXPLICITAMENTE. O conjunto padrão do data source depende do
            // tipo de atividade; com a coleta declarada, não depende de nada.
            ds.enableCollection(for: hrType, predicate: nil)
            b.dataSource = ds
            b.delegate = self                // ← fonte PRIMÁRIA do BPM (ver cabeçalho)
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { [weak self] ok, erro in
                guard !ok else { return }
                DispatchQueue.main.async {
                    self?.lastError = "coleta:" + (erro?.localizedDescription ?? "recusada")
                }
            }
            session = s
            builder = b
            sessionStart = now
            lastError = nil
        } catch {
            running = false
            lastError = "sessao:" + error.localizedDescription
            return
        }
        observeHeartRate()
    }

    /// Publica um BPM se (e só se) a amostra for mais nova que a última mostrada.
    private func publish(_ value: Int, sampleEnd: Date, from origem: String) {
        guard value > 0, sampleEnd > lastSampleEnd else { return }
        lastSampleEnd = sampleEnd
        DispatchQueue.main.async {
            self.bpm = value
            self.source = origem
            self.lastError = nil
        }
    }

    // ── Fonte primária: delegate do live builder (amostra no instante da coleta) ──
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                        didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(hrType),
              let stats = workoutBuilder.statistics(for: hrType),
              let qty = stats.mostRecentQuantity() else { return }
        let end = stats.mostRecentQuantityDateInterval()?.end ?? Date()
        publish(Int(qty.doubleValue(for: hrUnit).rounded()), sampleEnd: end, from: "live")
    }
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    // ── Fallback: stream de amostras já gravadas no HealthKit ──
    /// Cobre o caso de o delegate não entregar (raro). Diferente da versão antiga:
    /// (a) predicado limita ao INÍCIO da sessão — nada de despejo histórico nem
    /// amostra de minutos atrás na abertura; (b) a escolha é pela amostra mais
    /// nova POR DATA (endDate), não pela posição no lote, que é ordem de inserção.
    /// ⚠️ Ver `source`: quando a tela está sendo alimentada por AQUI, o número é o do
    /// banco do HealthKit — mais velho por construção. É o sinal de que algo derrubou
    /// o delegate, e é isso que o diagnóstico existe pra mostrar.
    private func observeHeartRate() {
        let started = sessionStart ?? Date()
        let pred = HKQuery.predicateForSamples(withStart: started, end: nil, options: [])
        let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = {
            [weak self] _, samples, _, _, _ in
            guard let self = self,
                  let qs = samples as? [HKQuantitySample], !qs.isEmpty else { return }
            guard let newest = qs.max(by: { $0.endDate < $1.endDate }) else { return }
            self.publish(Int(newest.quantity.doubleValue(for: self.hrUnit).rounded()),
                         sampleEnd: newest.endDate, from: "query")
        }
        let q = HKAnchoredObjectQuery(type: hrType, predicate: pred,
                                      anchor: nil, limit: HKObjectQueryNoLimit,
                                      resultsHandler: handler)
        q.updateHandler = handler
        store.execute(q)
        query = q
    }
}
