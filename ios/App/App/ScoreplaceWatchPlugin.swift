import Foundation
import Capacitor
import WatchConnectivity

/**
 * Plugin Capacitor da ponte pro smartwatch (fase 4, iOS) — lado do celular.
 * Espelha FUNCIONALMENTE o Android (ScoreplaceWatchPlugin.java), trocando o
 * Wear Data Layer por WatchConnectivity (WCSession). Contrato:
 * docs/smartwatch-bridge.md. O motor GSM (fonte única) roda no JS
 * (WatchBridge → bracket-ui.js); aqui só transportamos o JSON.
 *
 *   - JS→relógio: sendState(snapshot) → updateApplicationContext (último estado
 *     sempre disponível) + sendMessage quando alcançável (baixa latência).
 *   - relógio→JS: WCSession recebe a intenção → evento Capacitor "watchIntent".
 *
 * O payload trafega como STRING JSON (igual ao byte[] do Android): plist-safe,
 * tolera `null` (server/winner) que quebraria updateApplicationContext se fosse
 * mandado como dicionário cru com NSNull.
 */
@objc(ScoreplaceWatchPlugin)
public class ScoreplaceWatchPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "ScoreplaceWatchPlugin"
    public let jsName = "ScoreplaceWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sendState", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // JS → nativo: empurra o snapshot de estado pro relógio.
    @objc func sendState(_ call: CAPPluginCall) {
        guard let snapshot = call.getObject("snapshot") else { call.resolve(); return }
        pushStateToWatch(snapshot)
        call.resolve()
    }

    private func pushStateToWatch(_ dict: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        guard JSONSerialization.isValidJSONObject(dict),
              let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else { return }
        // 1) applicationContext: último estado, entregue mesmo se o relógio
        //    estava fechado/em background (coalesce ok — o que vale é o placar
        //    mais recente).
        try? session.updateApplicationContext(["state": json])
        // 2) sendMessage quando alcançável: atualização imediata a cada ponto.
        if session.isReachable {
            session.sendMessage(["state": json], replyHandler: nil, errorHandler: nil)
        }
    }

    // Intenção do relógio (chega como string JSON sob "intent") → JS.
    private func forwardIntent(_ json: String) {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let intent = obj as? [String: Any] else { return }
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("watchIntent", data: ["intent": intent])
        }
    }

    // ── WCSessionDelegate ──
    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    // iOS exige estes dois para suportar troca de relógio pareado.
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) {
        // Reativa para o novo relógio pareado.
        WCSession.default.activate()
    }

    // Intenção via mensagem (relógio alcançável).
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let json = message["intent"] as? String { forwardIntent(json) }
    }
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        if let json = message["intent"] as? String { forwardIntent(json) }
        replyHandler([:])
    }
    // Intenção enfileirada (relógio não alcançável no momento do toque).
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        if let json = userInfo["intent"] as? String { forwardIntent(json) }
    }
}
