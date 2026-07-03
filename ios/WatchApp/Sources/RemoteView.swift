import SwiftUI

// Cores espelhadas do placar ao vivo (bracket-ui.js):
// time 1 = azul, time 2 = vermelho; bola de saque = laranja Beach Tennis.
// COR SEGUE O TIME, nunca o lado — igual ao overlay ao vivo do app.
extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: 1.0
        )
    }
    static let spBg        = Color(hex: 0x0F0F23)
    static let spBlue      = Color(hex: 0x60A5FA)
    static let spRed       = Color(hex: 0xF87171)
    static let spBall      = Color(hex: 0xF97316)
    static let spNameBlue  = Color(hex: 0xDBEAFE)
    static let spNameBlueD = Color(hex: 0x93A3C2)
    static let spNameRed   = Color(hex: 0xFECACA)
    static let spNameRedD  = Color(hex: 0xCC9A9A)
    static let spMeta      = Color(hex: 0x9A9AB0)
    static let spMetaDim   = Color(hex: 0x7A7A95)
    static let spDash      = Color(hex: 0x5A5A70)
}

// Paleta por TIME (1 = azul, 2 = vermelho).
private struct TeamPalette {
    let point: Color, tint: Color, name: Color, nameDim: Color
    static func of(_ team: Int) -> TeamPalette {
        team == 2
            ? TeamPalette(point: .spRed,  tint: Color.spRed.opacity(0.15),
                          name: .spNameRed,  nameDim: .spNameRedD)
            : TeamPalette(point: .spBlue, tint: Color.spBlue.opacity(0.16),
                          name: .spNameBlue, nameDim: .spNameBlueD)
    }
}

// Tela de controle — PRESENTATION-ONLY. Recebe o estado (indexado por time) e
// dispara intenções via closures. Zero regra de placar aqui (fica no motor GSM).
struct RemoteView: View {
    let state: ScoreState
    var onPoint: (Int) -> Void = { _ in }
    var onUndo: () -> Void = {}

    private var leftTeam: Int { state.leftTeam }
    private var rightTeam: Int { state.rightTeam }

    var body: some View {
        VStack(spacing: 0) {
            // Linha do relógio: Set + cadeado à esquerda, palavra GAMES
            // centralizada (o relógio do sistema fica à direita).
            ZStack {
                Text("GAMES").font(.system(size: 9)).kerning(1).foregroundColor(.spMetaDim)
                HStack {
                    Text(state.active ? state.setLabel : "Aguardando…")
                        .font(.system(size: 12)).foregroundColor(.spMeta)
                    Image(systemName: "lock.open").font(.system(size: 10)).foregroundColor(.spMetaDim)
                    Spacer()
                }
                .padding(.leading, 12)
            }
            .padding(.top, 2)

            // Placar de games (por time, cor do time), na ordem dos lados.
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(String(state.gamesFor(leftTeam)))
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundColor(TeamPalette.of(leftTeam).point)
                Text("-").font(.system(size: 20)).foregroundColor(.spDash)
                Text(String(state.gamesFor(rightTeam)))
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundColor(TeamPalette.of(rightTeam).point)
            }
            .padding(.top, 1)

            // Duas metades borda a borda. O TIME em cada lado vem do courtLeft.
            HStack(spacing: 0) {
                teamHalf(team: leftTeam)
                teamHalf(team: rightTeam)
            }
            undoBar
        }
        .background(Color.spBg.ignoresSafeArea())
    }

    // Metade de um time: ponto grande em cima, nomes embaixo, bola no sacador.
    // A metade inteira é o botão de +1 daquele time.
    private func teamHalf(team: Int) -> some View {
        let pal = TeamPalette.of(team)
        let names = state.players(team)
        let p1 = names.count > 0 ? names[0] : ""
        let p2 = names.count > 1 ? names[1] : ""
        return Button(action: { onPoint(team) }) {
            VStack(spacing: 4) {
                Spacer(minLength: 6)
                Text(state.point(team))
                    .font(.system(size: 76, weight: .semibold))
                    .foregroundColor(pal.point)
                Spacer(minLength: 6)
                HStack(spacing: 4) {
                    if state.isServing(team) && state.serverName == p1 && !p1.isEmpty {
                        Circle().fill(Color.spBall).frame(width: 8, height: 8)
                    }
                    Text(p1).font(.system(size: 12)).foregroundColor(pal.name)
                }
                HStack(spacing: 4) {
                    if state.isServing(team) && state.serverName == p2 && !p2.isEmpty {
                        Circle().fill(Color.spBall).frame(width: 8, height: 8)
                    }
                    Text(p2).font(.system(size: 12)).foregroundColor(pal.nameDim)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, 8)
            .background(pal.tint)
        }
        .buttonStyle(.plain)
    }

    // Rodapé: Desfazer.
    private var undoBar: some View {
        Button(action: onUndo) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.uturn.backward").font(.system(size: 13))
                Text("Desfazer").font(.system(size: 12))
            }
            .foregroundColor(Color(hex: 0xD5D5E5))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.05))
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    RemoteView(state: .mock)
}
