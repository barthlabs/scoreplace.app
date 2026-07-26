import Foundation
import WatchConnectivity

/**
 * Transporte do lado do relógio (companion) — espelha o Wear MainActivity do
 * Android, trocando o Data Layer por WatchConnectivity. Contrato:
 * docs/smartwatch-bridge.md. O relógio é BURRO: toque vira intenção enviada ao
 * celular; o estado renderizado é sempre o snapshot que o celular devolve
 * (motor GSM = fonte única no JS do app). Zero regra de placar aqui.
 */
final class WatchSession: NSObject, ObservableObject, WCSessionDelegate {
    @Published var state = ScoreState()
    private var lastSeq = -1

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    // ── Intenções (relógio → celular) ──
    func sendPoint(_ team: Int) {
        sendIntent(["v": 1, "type": "point", "team": team, "id": UUID().uuidString])
    }
    func sendUndo() {
        sendIntent(["v": 1, "type": "undo", "id": UUID().uuidString])
    }
    func sendReplay(shuffle: Bool) {
        sendIntent(["v": 1, "type": "replay", "shuffle": shuffle, "id": UUID().uuidString])
    }
    func sendResolveTie(_ rule: String) {   // "extend" (prorrogar) | "tiebreak"
        sendIntent(["v": 1, "type": "resolveTie", "rule": rule, "id": UUID().uuidString])
    }
    /// "Iniciar" — começa a partida casual que está montada no celular.
    func sendStart() {
        sendIntent(["v": 1, "type": "start", "id": UUID().uuidString])
    }
    /// Rei/Rainha: próximo jogo da série de 3 (o celular rotaciona as duplas).
    func sendReiRainhaNext() {
        sendIntent(["v": 1, "type": "rrNext", "id": UUID().uuidString])
    }
    /// Rei/Rainha: encerra a série e mostra a classificação final.
    func sendReiRainhaFinal() {
        sendIntent(["v": 1, "type": "rrFinal", "id": UUID().uuidString])
    }
    func sendReiRainhaStart() {
        sendIntent(["v": 1, "type": "rrActivate", "id": UUID().uuidString])
    }
    /// Escolhe o sacador nos 2 primeiros jogos (equivale a arrastar a bola no
    /// celular). O celular decide se ainda vale — o hard lock vive no motor.
    func sendSetServer(team: Int, playerIdx: Int) {
        sendIntent(["v": 1, "type": "setServer", "team": team,
                    "playerIdx": playerIdx, "id": UUID().uuidString])
    }
    func hello() {
        sendIntent(["v": 1, "type": "hello"])
    }

    private func sendIntent(_ intent: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: intent),
              let json = String(data: data, encoding: .utf8) else { return }
        if s.isReachable {
            s.sendMessage(["intent": json], replyHandler: nil, errorHandler: nil)
        } else {
            s.transferUserInfo(["intent": json]) // enfileira até reconectar
        }
    }

    // ── Estado (celular → relógio) ──
    /// - Parameter isCached: veio do `receivedApplicationContext` guardado (último estado
    ///   conhecido, possivelmente antigo). Renderiza, mas NÃO fixa o `lastSeq` — senão o
    ///   snapshot AO VIVO que chega logo depois seria descartado por ter `seq` menor.
    private func apply(_ json: String, isCached: Bool = false) {
        guard let data = json.data(using: .utf8),
              let s = try? JSONDecoder().decode(ScoreState.self, from: data) else { return }
        // `seq` monotônico: descarta snapshot mais antigo que o último visto (protege contra
        // reordenação do transporte). MAS o contador vive no JS do celular e REINICIA a cada
        // carga da WebView (relançar o app, recarregar) — quando isso acontece o `seq` novo
        // volta pra 1 e, com a regra crua, o relógio descartava TODO snapshot novo e
        // congelava no estado velho. Uma queda GRANDE = contador reiniciado, não reordenação.
        if !isCached && s.seq != 0 && s.seq < lastSeq && (lastSeq - s.seq) < 20 { return }
        if !isCached { lastSeq = s.seq }
        DispatchQueue.main.async { self.state = s }
    }

    // ── WCSessionDelegate ──
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        // 1) ÚLTIMO estado já entregue pelo celular (o applicationContext fica guardado no
        //    relógio). Antes só reagíamos a contexto NOVO — num boot frio, se o iPhone não
        //    respondesse, a tela ficava em "Aguardando…" mesmo havendo estado conhecido.
        if let json = session.receivedApplicationContext["state"] as? String { apply(json, isCached: true) }
        // 2) pede o estado atual
        hello()
        // 3) o `hello` é UM tiro: se o app do iPhone estava fechado/suspenso, ninguém
        //    respondia e o relógio esperava pra sempre. Re-tenta algumas vezes enquanto
        //    nenhum snapshot tiver chegado (para assim que `lastSeq` avança).
        retryHelloUntilAnswered()
    }

    /// Re-envia `hello` (3×, a cada 2s) enquanto nenhum estado tiver chegado.
    private func retryHelloUntilAnswered(attempt: Int = 0) {
        guard attempt < 3, lastSeq < 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self = self, self.lastSeq < 0 else { return }
            self.hello()
            self.retryHelloUntilAnswered(attempt: attempt + 1)
        }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let json = message["state"] as? String { apply(json) }
    }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        if let json = applicationContext["state"] as? String { apply(json) }
    }
    func sessionReachabilityDidChange(_ session: WCSession) {
        if session.isReachable { hello() } // reconectou → ressincroniza
    }
}
