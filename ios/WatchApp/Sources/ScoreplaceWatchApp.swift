import SwiftUI

// scoreplace Watch — controle de placar ao vivo (preview estático).
// Escopo: placar grande + games no topo + bola no sacador + desfazer.
// Dados mock nesta etapa; a ponte ao vivo com o iPhone (WatchConnectivity →
// motor GSM no JS do app) é a fase seguinte.
@main
struct ScoreplaceWatchApp: App {
    var body: some Scene {
        WindowGroup {
            RemoteView()
        }
    }
}
