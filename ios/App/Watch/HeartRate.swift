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
 * DEGRADA EM SILÊNCIO: sem permissão, sem sensor (simulador) ou com erro, `bpm` fica
 * nil e a UI simplesmente não mostra nada. Nunca bloqueia o placar.
 *
 * ⚠️ SÓ VALIDA EM RELÓGIO REAL — o simulador do watchOS não gera batimento.
 */
final class HeartRateMonitor: NSObject, ObservableObject {
    /// Último BPM lido. nil = sem leitura (sem permissão / sem sensor / ainda medindo).
    @Published var bpm: Int? = nil

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var query: HKAnchoredObjectQuery?
    private var running = false

    private let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
    private let hrUnit = HKUnit.count().unitDivided(by: .minute())

    /// Liga a leitura (idempotente). Chamado quando a partida está AO VIVO.
    func start() {
        guard !running, HKHealthStore.isHealthDataAvailable() else { return }
        running = true
        // `toShare: workoutType` = a partida é GRAVADA como treino no app Saúde ao
        // terminar (conta nos anéis de atividade). Sem isso o BPM apareceria na tela
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
        session?.end()
        b?.endCollection(withEnd: Date()) { _, _ in
            b?.finishWorkout { _, _ in }   // grava no app Saúde → anéis de atividade
        }
        builder = nil
        session = nil
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
            s.startActivity(with: Date())
            b.beginCollection(withStart: Date()) { _, _ in }
            session = s
            builder = b
        } catch {
            running = false
            return
        }
        observeHeartRate()
    }

    /// Stream de amostras de BPM. `HKAnchoredObjectQuery` com updateHandler entrega as
    /// novas amostras conforme chegam (não é polling).
    private func observeHeartRate() {
        let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = {
            [weak self] _, samples, _, _, _ in
            guard let self = self,
                  let last = (samples as? [HKQuantitySample])?.last else { return }
            let value = Int(last.quantity.doubleValue(for: self.hrUnit).rounded())
            guard value > 0 else { return }
            DispatchQueue.main.async { self.bpm = value }
        }
        let q = HKAnchoredObjectQuery(type: hrType, predicate: nil,
                                      anchor: nil, limit: HKObjectQueryNoLimit,
                                      resultsHandler: handler)
        q.updateHandler = handler
        store.execute(q)
        query = q
    }
}
