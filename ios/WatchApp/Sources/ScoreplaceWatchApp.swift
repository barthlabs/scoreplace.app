import SwiftUI

// scoreplace Watch — PREVIEW estático standalone (projeto ScoreplaceWatchPreview,
// gerado por xcodegen). Mostra a tela travada com dados mock; NÃO pareia com o
// iPhone. O app companion DE VERDADE (que pareia e usa WatchConnectivity → motor
// GSM no JS) vive no target watchOS dentro de ios/App/App.xcodeproj e reaproveita
// RemoteView/ScoreState deste mesmo diretório (fonte única das views).
//
// Qual tela aparece vem do ambiente (SP_MOCK), pra conferir TODAS as telas com UM
// build só em vários aparelhos:
//   SIMCTL_CHILD_SP_MOCK=live xcrun simctl launch <udid> app.scoreplace.watchpreview
// Sem a variável: a tela Iniciar (padrão histórico deste preview).
@main
struct ScoreplaceWatchApp: App {
    private var pick: String {
        ProcessInfo.processInfo.environment["SP_MOCK"] ?? "lobby"
    }
    /// BPM do preview (SP_BPM) — serve pra conferir as 5 FAIXAS DE QUEIMA sem
    /// precisar de sensor: com a FCmáx do mock (185), 100/120/135/152/170 caem
    /// uma em cada faixa.
    private var previewBpm: Int {
        Int(ProcessInfo.processInfo.environment["SP_BPM"] ?? "") ?? 128
    }
    var body: some Scene {
        WindowGroup {
            switch pick {
            case "live":    RemoteView(state: .mockLive, bpm: previewBpm)   // placar + ♥ BPM
            case "serve2":  RemoteView(state: .mockServe2nd)         // 2º sacador (entre o 1º e o 2º game)
            case "winner":  RemoteView(state: .mockWinner)
            case "tie":     RemoteView(state: .mockTie)
            default:        RemoteView(state: .mockLobby)            // Iniciar / 1º sacador
            }
        }
    }
}
