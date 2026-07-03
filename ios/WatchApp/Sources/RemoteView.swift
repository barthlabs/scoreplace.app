import SwiftUI

// Cores espelhadas do placar ao vivo (bracket-ui.js):
// time 1 = azul, time 2 = vermelho; bola de saque = laranja Beach Tennis.
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

struct RemoteView: View {
    // Dados mock — virão do iPhone via WatchConnectivity na fase seguinte.
    let pointLeft = "40"
    let pointRight = "30"
    let gamesLeft = "1"
    let gamesRight = "2"
    let setLabel = "Set 1"
    let serverIsLeft = true

    var body: some View {
        VStack(spacing: 0) {
            // Status no topo: Set + cadeado à esquerda (o relógio do sistema
            // fica à direita), liberando a faixa central pros games maiores.
            // Linha do relógio: Set + cadeado à esquerda, palavra GAMES
            // centralizada (o relógio do sistema fica à direita).
            ZStack {
                // GAMES centralizado no eixo da tela (alinha com o 1 - 2).
                Text("GAMES").font(.system(size: 9)).kerning(1).foregroundColor(.spMetaDim)
                // Set + cadeado fixos à esquerda (padding só aqui, não desloca o centro).
                HStack {
                    Text(setLabel).font(.system(size: 12)).foregroundColor(.spMeta)
                    Image(systemName: "lock.open").font(.system(size: 10)).foregroundColor(.spMetaDim)
                    Spacer()
                }
                .padding(.leading, 12)
            }
            .padding(.top, 2)

            // Placar de games 1 - 2 centralizado, nas cores dos times.
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(gamesLeft).font(.system(size: 30, weight: .semibold)).foregroundColor(.spBlue)
                Text("-").font(.system(size: 20)).foregroundColor(.spDash)
                Text(gamesRight).font(.system(size: 30, weight: .semibold)).foregroundColor(.spRed)
            }
            .padding(.top, 1)

            // Duas metades borda a borda: sacador (azul) à esquerda.
            HStack(spacing: 0) {
                teamHalf(
                    tint: Color.spBlue.opacity(0.16),
                    point: pointLeft, pointColor: .spBlue,
                    p1: "Rodrigo", p2: "Nelson",
                    nameColor: .spNameBlue, nameColorDim: .spNameBlueD,
                    serving: serverIsLeft
                )
                teamHalf(
                    tint: Color.spRed.opacity(0.15),
                    point: pointRight, pointColor: .spRed,
                    p1: "Kelly", p2: "Zilda",
                    nameColor: .spNameRed, nameColorDim: .spNameRedD,
                    serving: !serverIsLeft
                )
            }
            undoBar
        }
        .background(Color.spBg.ignoresSafeArea())
    }

    // Metade de um time: ponto grande em cima, nomes embaixo, bola no sacador.
    private func teamHalf(
        tint: Color, point: String, pointColor: Color,
        p1: String, p2: String, nameColor: Color, nameColorDim: Color,
        serving: Bool
    ) -> some View {
        VStack(spacing: 4) {
            Spacer(minLength: 6)
            Text(point)
                .font(.system(size: 76, weight: .semibold))
                .foregroundColor(pointColor)
            Spacer(minLength: 6)
            HStack(spacing: 4) {
                if serving {
                    Circle().fill(Color.spBall).frame(width: 8, height: 8)
                }
                Text(p1).font(.system(size: 12)).foregroundColor(nameColor)
            }
            Text(p2).font(.system(size: 12)).foregroundColor(nameColorDim)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 8)
        .background(tint)
    }

    // Rodapé: Desfazer.
    private var undoBar: some View {
        HStack(spacing: 6) {
            Image(systemName: "arrow.uturn.backward").font(.system(size: 13))
            Text("Desfazer").font(.system(size: 12))
        }
        .foregroundColor(Color(hex: 0xD5D5E5))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.05))
    }
}

#Preview {
    RemoteView()
}
