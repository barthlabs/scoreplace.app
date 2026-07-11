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
    var onReplay: (Bool) -> Void = { _ in }      // Bool = re-sortear duplas
    var onResolveTie: (String) -> Void = { _ in } // "extend" (prorrogar) | "tiebreak"
    @State private var replayDismissed = false   // Cancelar esconde o prompt
    @State private var reshuffle = false         // toggle "Re-sortear duplas"

    private var leftTeam: Int { state.leftTeam }
    private var rightTeam: Int { state.rightTeam }

    var body: some View {
        ZStack {
            mainContent
            // Empate (5-5, 6-6, 7-7…) esperando decisão: cobre os botões +1 até
            // o usuário escolher prorrogar ou ativar o tie-break. Recorre a cada
            // empate enquanto ninguém vence por 2 (motor GSM = fonte única).
            if state.tieRulePending && !state.isFinished { tieOverlay }
            if state.isFinished { winnerOverlay }   // fim de jogo cobre os botões +1
        }
        .onChange(of: state.isFinished) { _, finished in
            if !finished { replayDismissed = false; reshuffle = false }  // recomeçou → reseta
        }
    }

    private var mainContent: some View {
        VStack(spacing: 0) {
            // Linha do relógio: Set + cadeado à esquerda, palavra GAMES
            // centralizada (o relógio do sistema fica à direita).
            ZStack {
                Text("GAMES").font(.system(size: 9)).kerning(1).foregroundColor(.spMetaDim)
                HStack(spacing: 4) {
                    if state.active {
                        // SETS no lugar do rótulo do set: 0-0 no início, preenche
                        // conforme os sets fecham (cor segue o time, ordem dos lados).
                        Text("SETS").font(.system(size: 8)).foregroundColor(.spMetaDim)
                        Text(String(state.setsFor(leftTeam)))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(TeamPalette.of(leftTeam).point)
                        Text("-").font(.system(size: 10)).foregroundColor(.spDash)
                        Text(String(state.setsFor(rightTeam)))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(TeamPalette.of(rightTeam).point)
                    } else {
                        Text("Aguardando…").font(.system(size: 12)).foregroundColor(.spMeta)
                    }
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
        .padding(.bottom, 10)   // #3: sem isto o "Desfazer" era cortado pela borda inferior
    }

    // Empate → escolha do desempate (espelha o overlay do celular). ⚖️ + "Empate
    // N–N" + Prorrogar (verde) / Tie-break (roxo). Cobre as metades → os toques
    // +1 não valem enquanto pende. Recorre a cada empate até vencer por 2 ou
    // ativar o tie-break — a recorrência é decidida no motor, não aqui.
    private var tieOverlay: some View {
        let tied = state.tiedAt ?? state.gamesFor(leftTeam)
        return VStack(spacing: 0) {
            Spacer(minLength: 4)
            Text("⚖️").font(.system(size: 30))
            Text("Empate \(tied)–\(tied)")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.spNameBlue)
                .padding(.top, 2)
            Text("Como desempatar?")
                .font(.system(size: 11)).foregroundColor(.spMeta)
                .padding(.top, 1)
            Spacer(minLength: 6)
            VStack(spacing: 7) {
                Button(action: { onResolveTie("extend") }) {
                    Text("Prorrogar").font(.system(size: 13, weight: .bold))
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(Color(hex: 0x10B981).opacity(0.9)).clipShape(Capsule())
                }.buttonStyle(.plain).foregroundColor(Color(hex: 0x04342C))
                Button(action: { onResolveTie("tiebreak") }) {
                    Text("Tie-break").font(.system(size: 13, weight: .bold))
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(Color(hex: 0xA855F7).opacity(0.9)).clipShape(Capsule())
                }.buttonStyle(.plain).foregroundColor(.white)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.spBg.ignoresSafeArea())   // opaco: bloqueia os +1 até decidir
    }

    // Tela de fim de jogo: 🏆 + nomes do time vencedor (cor do time) ou "Empate",
    // com o placar final. Cobre as metades → os toques +1 não valem mais.
    private var winnerOverlay: some View {
        let w = state.winner ?? 0
        let pal = TeamPalette.of(w == 2 ? 2 : 1)
        return ScrollView {
            VStack(spacing: 3) {
                Text("🏆").font(.system(size: 34))
                if w == 1 || w == 2 {
                    Text("Vencedor").font(.system(size: 11)).kerning(1).foregroundColor(.spMeta)
                    ForEach(state.winnerNames, id: \.self) { n in
                        Text(n).font(.system(size: 16, weight: .semibold)).foregroundColor(pal.name)
                    }
                } else {
                    Text("Empate").font(.system(size: 18, weight: .semibold)).foregroundColor(.spMeta)
                }
                Text(finalScoreLine).font(.system(size: 12)).foregroundColor(.spMetaDim).padding(.top, 3)
                if state.canReplay && !replayDismissed { replayControls.padding(.top, 10) }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
        }
        .background(Color.spBg.ignoresSafeArea())   // opaco: fim de jogo é tela definitiva
    }

    // "Jogar novamente?" (só casual): a pergunta em cima + Cancelar/Confirmar
    // juntos. Confirmar manda a intenção pro celular recomeçar (mesmos
    // jogadores, 0×0); Cancelar apenas dispensa o prompt.
    private var replayControls: some View {
        VStack(spacing: 6) {
            Text("Jogar novamente?")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(hex: 0xDBEAFE))
            HStack(spacing: 8) {
                Button(action: { replayDismissed = true }) {
                    Text("Cancelar").font(.system(size: 12))
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(Color.white.opacity(0.08)).clipShape(Capsule())
                }.buttonStyle(.plain).foregroundColor(Color(hex: 0xD5D5E5))
                Button(action: { onReplay(reshuffle) }) {
                    Text("Confirmar").font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(Color.spBlue.opacity(0.9)).clipShape(Capsule())
                }.buttonStyle(.plain).foregroundColor(.white)
            }
            // Só em duplas: ligado → Confirmar re-sorteia as duplas; desligado
            // → mantém os mesmos times do último jogo.
            if state.isDoubles {
                Toggle(isOn: $reshuffle) {
                    Text("Re-sortear duplas").font(.system(size: 11)).foregroundColor(.spMeta)
                }
                .toggleStyle(SwitchToggleStyle(tint: .spBlue))
                .padding(.top, 2)
            }
        }
        .padding(.horizontal, 10)
    }

    // Placar final por lado (esquerda–direita): sets em melhor-de-N, senão games.
    private var finalScoreLine: String {
        if state.showsSets {
            return "Sets \(state.setsFor(leftTeam))–\(state.setsFor(rightTeam))"
        }
        return "Games \(state.gamesFor(leftTeam))–\(state.gamesFor(rightTeam))"
    }
}

#Preview {
    RemoteView(state: .mock)
}
