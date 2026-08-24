import UIKit
import Capacitor

/**
 * Bridge VC do app. Registra o plugin ScoreplaceWatch AQUI (via
 * registerPluginInstance) em vez de depender do `packageClassList` do
 * capacitor.config.json — que o `cap sync` REESCREVE por completo a cada
 * build (varre só os plugins do node_modules, apagaria um plugin app-local).
 * capacitorDidLoad() é o ponto de extensão oficial e sobrevive ao sync.
 */
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ScoreplaceWatchPlugin())
        // ── ⭐ TELA BRANCA AO DESTRAVAR (24/ago/2026, relato do dono) ──────────
        // O iOS mata o PROCESSO WEB da WKWebView em segundo plano (pressão de
        // memória) e o Capacitor NÃO trata webContentProcessDidTerminate
        // (conferido no fonte do @capacitor/ios): ao voltar, a view é um
        // retângulo BRANCO morto até matar o app. Não dá pra virar
        // navigationDelegate (o bridge já é); então, ao reativar, um
        // evaluateJavaScript barato detecta o processo morto (só falha quando
        // ele morreu — "1" não lança) e recarrega a página.
        NotificationCenter.default.addObserver(
            self, selector: #selector(spCheckWebAlive),
            name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func spCheckWebAlive() {
        guard let wv = self.webView else { return }
        wv.evaluateJavaScript("1") { _, err in
            if err != nil { wv.reload() }
        }
    }
}
