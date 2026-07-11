import SwiftUI

// App do relógio (COMPANION do app.scoreplace) — pareia com o iPhone via
// WatchConnectivity. Reaproveita RemoteView/ScoreState (fonte única das views,
// em ios/WatchApp/Sources). Diferente do preview standalone, aqui o estado é
// alimentado ao vivo pelo celular e os toques viram intenções.
@main
struct ScoreplaceWatchCompanionApp: App {
    @StateObject private var session = WatchSession()

    var body: some Scene {
        WindowGroup {
            RemoteView(
                state: session.state,
                onPoint: { team in session.sendPoint(team) },
                onUndo: { session.sendUndo() },
                onReplay: { shuffle in session.sendReplay(shuffle: shuffle) },
                onResolveTie: { rule in session.sendResolveTie(rule) }
            )
            .onAppear { session.hello() } // pede o estado atual ao aparecer
        }
    }
}
