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
    }
}
