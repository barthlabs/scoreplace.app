import SwiftUI

// scoreplace Watch — PREVIEW estático standalone (projeto ScoreplaceWatchPreview,
// gerado por xcodegen). Mostra a tela travada com dados mock; NÃO pareia com o
// iPhone. O app companion DE VERDADE (que pareia e usa WatchConnectivity → motor
// GSM no JS) vive no target watchOS dentro de ios/App/App.xcodeproj e reaproveita
// RemoteView/ScoreState deste mesmo diretório (fonte única das views).
@main
struct ScoreplaceWatchApp: App {
    var body: some Scene {
        WindowGroup {
            RemoteView(state: .mockLobby)
        }
    }
}
