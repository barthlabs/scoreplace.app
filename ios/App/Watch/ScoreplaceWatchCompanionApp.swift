import SwiftUI

// App do relógio (COMPANION do app.scoreplace) — pareia com o iPhone via
// WatchConnectivity. Reaproveita RemoteView/ScoreState (fonte única das views,
// em ios/WatchApp/Sources). Diferente do preview standalone, aqui o estado é
// alimentado ao vivo pelo celular e os toques viram intenções.
@main
struct ScoreplaceWatchCompanionApp: App {
    @StateObject private var session = WatchSession()
    // Batimento ao vivo. Só liga enquanto há partida AO VIVO — a HKWorkoutSession
    // custa bateria e não faz sentido com o placar parado. Ver HeartRate.swift.
    @StateObject private var heart = HeartRateMonitor()

    var body: some Scene {
        WindowGroup {
            RemoteView(
                state: session.state,
                onPoint: { team in session.sendPoint(team) },
                onUndo: { session.sendUndo() },
                onReplay: { shuffle in session.sendReplay(shuffle: shuffle) },
                onResolveTie: { rule in session.sendResolveTie(rule) },
                onStart: { session.sendStart() },
                onSetServer: { team, idx in session.sendSetServer(team: team, playerIdx: idx) },
                onReiRainhaNext: { session.sendReiRainhaNext() },
                onReiRainhaFinal: { session.sendReiRainhaFinal() },
                onReiRainhaStart: { session.sendReiRainhaStart() },
                onSetReiRainha: { on in session.sendSetReiRainha(on) },
                onSetMixed: { on in session.sendSetMixed(on) },
                onClose: { session.sendClose() },
                bpm: heart.bpm
            )
            .onAppear { session.hello() } // pede o estado atual ao aparecer
            // Liga/desliga o sensor conforme a partida está ao vivo.
            .onChange(of: session.state.active) { active in
                if active { heart.start() } else { heart.stop() }
            }
        }
    }
}
