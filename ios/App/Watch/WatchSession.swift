import Foundation
import WatchConnectivity

/**
 * Transporte do lado do relógio (companion) — espelha o Wear MainActivity do
 * Android, trocando o Data Layer por WatchConnectivity. Contrato:
 * docs/smartwatch-bridge.md.
 *
 * ⚠️ O RELÓGIO DEIXOU DE SER BURRO (Caminho B, ago/2026). Este cabeçalho dizia
 * "toque vira intenção enviada ao celular; zero regra de placar aqui" — era
 * verdade até o incidente de 13/ago provar o limite: o motor vivia no JS da
 * WebView, e o iOS SUSPENDE esse JS com o celular bloqueado (o estado normal do
 * celular na beira da quadra). Os toques enfileiravam e chegavam em rajada.
 * Agora há um motor NATIVO (ScoreEngine.swift, paridade provada contra o motor
 * canônico por vetores) e a posse é decidida pelo WatchMatchSession.
 *
 * O que NÃO mudou, e é o que segura a arquitetura: o placar OFICIAL continua
 * saindo do motor JS do celular, que reproduz o diário de eventos daqui. Um
 * erro do motor nativo é cosmético e vira teste vermelho — nunca dado errado.
 * E sem os campos novos no snapshot (app do celular antigo) nada disto arma:
 * o caminho de intenção unitária segue intacto como fallback.
 */
final class WatchSession: NSObject, ObservableObject, WCSessionDelegate {
    @Published var state = ScoreState()
    private var lastSeq = -1
    private var lastEpoch = ""

    // ── CAMINHO B ── posse + diário (docs/smartwatch-bridge.md).
    // O relógio deixou de depender do celular ACORDADO a cada toque: quando a
    // partida começa com ele junto, um motor NATIVO conta aqui mesmo e o toque
    // responde na hora; o diário de eventos viaja pro celular quando dá, e é
    // sempre o motor JS canônico de lá que grava placar oficial/Firestore.
    // Sem os campos novos no snapshot (app do celular antigo) a sessão nem arma
    // e tudo segue exatamente como antes — o caminho de intenção unitária.
    private let match = WatchMatchSession()
    /// Identidade deste dispositivo no diário (a dedup do celular é por
    /// `deviceId#n`, então relógio e celular numerando igual não se apagam).
    private let deviceId = "watch-" + (UUID().uuidString.prefix(8).lowercased())

    /// Aplica no motor local e manda o diário. `false` = sem motor armado, o
    /// chamador cai no caminho antigo (intenção unitária pro celular).
    @discardableResult
    private func localFirst(_ ev: EngineEvent) -> Bool {
        guard match.localEvent(ev) else { return false }
        publishLocal()
        flushJournal()
        return true
    }
    /// A tela desenha o que a POSSE mandar (motor local × espelho do celular).
    private func publishLocal() {
        let s = match.displayState
        DispatchQueue.main.async { self.state = s }
    }
    /// Empurra o diário pendente. Reenviar é IDEMPOTENTE de propósito (o
    /// receptor deduplica por `deviceId#n`) — é assim que o lote sobrevive a
    /// celular suspenso, que foi a causa do incidente de 13/ago.
    private func flushJournal() {
        guard let evlog = match.pendingEvlog(deviceId: deviceId) else { return }
        sendIntent(evlog)
    }

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    // ── Intenções (relógio → celular) ──
    func sendPoint(_ team: Int) {
        if localFirst(.point(team: team)) { return }   // Caminho B: conta AQUI
        sendIntent(["v": 1, "type": "point", "team": team, "id": UUID().uuidString])
    }
    func sendUndo() {
        if localFirst(.undo) { return }
        sendIntent(["v": 1, "type": "undo", "id": UUID().uuidString])
    }
    func sendReplay(shuffle: Bool) {
        sendIntent(["v": 1, "type": "replay", "shuffle": shuffle, "id": UUID().uuidString])
    }
    /// ENCERRAR a partida pelo relógio (v1.7.67). Antes o "Fechar" da tela de fim
    /// só escondia o painel AQUI (`replayDismissed`), e o celular seguia com o placar
    /// aberto — o relógio ficava preso na tela de resultado. Agora a ordem viaja: o
    /// celular fecha o placar, volta à configuração e devolve um estado inativo, que
    /// é o que traz este app de volta para a espera.
    func sendClose() {
        sendIntent(["v": 1, "type": "close", "id": UUID().uuidString])
    }
    func sendResolveTie(_ rule: String) {   // "extend" (prorrogar) | "tiebreak"
        if localFirst(.resolveTie(rule: rule)) { return }
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
        // Caminho B: no motor o pick sao DOIS eventos (selecionar + confirmar) —
        // medido nos vetores; ponto com o seletor ABERTO e' bloqueado, entao
        // confirmar faz parte do gesto, nao e' enfeite.
        if match.localEvent(.serveSelect(team: team, idx: playerIdx)) {
            match.localEvent(.serveConfirm)
            publishLocal()
            flushJournal()
            return
        }
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
        // `seq` monotônico POR ÉPOCA: o contador vive no JS do celular e REINICIA a cada
        // carga da WebView (relançar o app, recarregar). A época identifica a carga:
        // época DIFERENTE = app recarregou → aceita o snapshot e zera o lastSeq; época
        // IGUAL = seq monotônico (descarta reordenação do transporte). A heurística
        // antiga ("queda ≥ 20 = contador reiniciou") tinha um buraco REAL: com lastSeq
        // pequeno (partida curta), a queda ficava < 20 e todo snapshot da carga nova era
        // descartado — o relógio congelava no fim de set com o jogo novo já rolando no
        // celular (incidente de 13/ago/2026). Ela sobrevive SÓ como fallback pra
        // snapshot sem época (app do celular antigo, contexto em cache de build velha).
        if !isCached {
            if !s.epoch.isEmpty && s.epoch != lastEpoch {
                lastEpoch = s.epoch
                lastSeq = -1                        // época nova: contador recomeçou
            } else if s.epoch.isEmpty
                      && s.seq != 0 && s.seq < lastSeq && (lastSeq - s.seq) >= 20 {
                lastSeq = -1                        // legado: queda grande = reinício
            }
            if s.seq != 0 && s.seq < lastSeq { return }
            lastSeq = s.seq
        }
        // Caminho B: a SESSAO decide o que a tela ve (motor local x espelho do
        // celular) e guarda este snapshot como espelho. Sem os campos novos
        // (app do celular antigo) ela nunca arma o motor e devolve o proprio
        // espelho — ou seja, exatamente o comportamento anterior.
        match.ingest(s)
        let shown = match.displayState
        DispatchQueue.main.async { self.state = shown }
        // Voltou a falar com o celular? Reenvia o diario pendente (idempotente).
        flushJournal()
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
