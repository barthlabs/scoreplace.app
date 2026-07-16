import SwiftUI
import WatchKit

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
    var onStart: () -> Void = {}                  // "Iniciar" a partida montada no celular
    var onSetServer: (Int, Int) -> Void = { _, _ in } // (time, índice do jogador)
    var onReiRainhaNext: () -> Void = {}          // próximo jogo da série de 3
    var onReiRainhaFinal: () -> Void = {}         // encerra a série → classificação
    @State private var replayDismissed = false   // Cancelar esconde o prompt
    @State private var reshuffle = false         // toggle "Re-sortear duplas"
    @State private var pickingServer = false     // seletor de sacador aberto
    @State private var pendingPick: ScoreState.ServeSlot? = nil  // escolha ainda não confirmada

    private var leftTeam: Int { state.leftTeam }
    private var rightTeam: Int { state.rightTeam }

    // Tamanho dos nomes por mostrador. Medido no simulador: num 40mm (altura útil
    // ~197pt) quatro linhas de 24pt + ponto + games + a barra "Desfazer" NÃO cabem
    // — a barra era empurrada pra fora da tela. 19pt cabe com folga e ainda é ~60%
    // maior que os 12pt antigos. De 42mm pra cima os 24pt (dobro do antigo) cabem
    // quebrando em 2 linhas, que é o alvo.
    private var isSmallWatch: Bool { WKInterfaceDevice.current().screenBounds.height < 210 }
    private var nameFontSize: CGFloat { isSmallWatch ? 19 : 24 }
    private var pointFontSize: CGFloat { isSmallWatch ? 54 : 62 }

    var body: some View {
        ZStack {
            mainContent
            // Montagem aberta no celular e nada ao vivo → oferece "Iniciar". Sem
            // isto o relógio só sabia dizer "Aguardando…" e a partida SÓ podia
            // começar pegando o celular.
            if !state.active && !state.isFinished && state.canStart { startOverlay }
            // Empate (5-5, 6-6, 7-7…) esperando decisão: cobre os botões +1 até
            // o usuário escolher prorrogar ou ativar o tie-break. Recorre a cada
            // empate enquanto ninguém vence por 2 (motor GSM = fonte única).
            if state.tieRulePending && !state.isFinished { tieOverlay }
            if state.isFinished { winnerOverlay }   // fim de jogo cobre os botões +1
            if pickingServer { serverPicker }       // cobre os +1 enquanto escolhe
        }
        .onChange(of: state.canSetServer) { can in
            if !can { pickingServer = false }  // saque travou → fecha o seletor
        }
        // Confirmação do 2º sacador ENTRE o 1º e o 2º game: quando a fase muda
        // (0 → 1), o relógio pergunta sozinho. Sem isto o motor assume um 2º
        // sacador por padrão (opponents[0]) e ninguém nunca confirma — a ordem
        // do set inteiro ficava travada num chute. Dispara em onChange (não no
        // render), então pergunta UMA vez por fase: Confirmar fecha e
        // não incomoda mais até a fase seguinte.
        .onChange(of: state.servePickPhase) { phase in
            pendingPick = nil   // fase nova → volta a acender quem ocupa o slot
            if phase == 1 { pickingServer = true }
            if phase == -1 { pickingServer = false }
        }
        // Variante de UMA closure de propósito: `onChange(of:initial:_:)` (duas
        // closures) é API de watchOS 10+ e barraria o Series 3 (watchOS 8) da Kelly.
        // Esta forma vale de watchOS 7 pra cima; está "deprecated" no 10+, mas é só
        // aviso e o comportamento é idêntico. NÃO "modernizar" sem antes subir o
        // WATCHOS_DEPLOYMENT_TARGET — senão o app some do Relógio, sem erro nenhum.
        .onChange(of: state.isFinished) { finished in
            if !finished { replayDismissed = false; reshuffle = false }  // recomeçou → reseta
        }
    }

    private var mainContent: some View {
        VStack(spacing: 0) {
            // Linha do relógio: Set + cadeado à esquerda, palavra GAMES
            // centralizada (o relógio do sistema fica à direita).
            ZStack {
                // No Rei/Rainha o rótulo vira "JOGO N/3": saber em que ponto da
                // série você está importa mais que a palavra GAMES, e as duplas
                // trocam a cada jogo — sem isto o relógio não dá nenhuma pista.
                Text(state.reiRainha && state.rrRound < 3
                     ? "JOGO \(state.rrRound + 1)/3" : "GAMES")
                    .font(.system(size: 9)).kerning(1)
                    .foregroundColor(state.reiRainha ? Color(hex: 0xF59E0B) : .spMetaDim)
                HStack(spacing: 4) {
                    if state.active {
                        // SETS só em melhor-de-N (showsSets). Em set único — Beach
                        // Tennis, Pickleball — o placar de games já basta, e essa
                        // linha só roubava altura dos nomes. É o que o próprio
                        // ScoreState.showsSets documenta; o relógio ignorava.
                        if state.showsSets {
                            Text("SETS").font(.system(size: 8)).foregroundColor(.spMetaDim)
                            Text(String(state.setsFor(leftTeam)))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(TeamPalette.of(leftTeam).point)
                            Text("-").font(.system(size: 10)).foregroundColor(.spDash)
                            Text(String(state.setsFor(rightTeam)))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(TeamPalette.of(rightTeam).point)
                        }
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
            bottomBar
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
            VStack(spacing: 2) {
                // O ponto fica num frame FLEXÍVEL (maxHeight: .infinity): ele absorve
                // a sobra e encolhe via minimumScaleFactor quando os nomes precisam de
                // 2 linhas. Antes era altura fixa + Spacers, e num 40mm os nomes de
                // 24pt empurravam a barra "Desfazer" pra FORA da tela.
                Text(state.point(team))
                    .font(.system(size: pointFontSize, weight: .semibold))
                    .foregroundColor(pal.point)
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                nameRow(p1, team: team, color: pal.name)
                nameRow(p2, team: team, color: pal.nameDim)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 2)
            .padding(.bottom, 6)
            .background(pal.tint)
        }
        .buttonStyle(.plain)
    }

    // Linha de um jogador. O nome dobrou de 12 → 24 e passa a QUEBRAR em até 2
    // linhas (antes era uma linha só de 12pt, ilegível a um braço de distância na
    // quadra). minimumScaleFactor deixa o SwiftUI encolher só o necessário quando
    // o nome é longo demais pra caber em 2 linhas, em vez de truncar com "…".
    private func nameRow(_ name: String, team: Int, color: Color) -> some View {
        HStack(alignment: .top, spacing: 3) {
            if state.isServing(team) && state.serverName == name && !name.isEmpty {
                Circle().fill(Color.spBall)
                    .frame(width: 10, height: 10)
                    .padding(.top, 6)
            }
            // fixedSize(vertical:) faz o nome valer o tamanho REAL de 24pt e QUEBRAR
            // em 2 linhas. Sem ele o minimumScaleFactor prefere encolher a fonte pra
            // caber em 1 linha — que é o oposto do pedido (nome grande e legível na
            // quadra). Quem cede espaço é o ponto (frame flexível + scale 0.4) e a
            // barra "Desfazer" está protegida por layoutPriority, então isto não
            // volta a empurrar nada pra fora da tela.
            Text(name)
                .font(.system(size: nameFontSize, weight: .semibold))
                .foregroundColor(color)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.45)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // Nome aceso no seletor: a escolha ainda não confirmada ou, na abertura, quem
    // JÁ ocupa o slot (servePickCurrent) — assim "Confirmar" sem mexer = manter.
    private var selectedServeName: String {
        pendingPick?.name ?? state.servePickCurrent
    }
    // O que o "Confirmar" vai mandar. Cai no slot atual quando o usuário não
    // tocou em nada; nil (botão apagado) se nem isso existir na lista elegível.
    private var resolvedServePick: ScoreState.ServeSlot? {
        pendingPick ?? state.serveEligible.first { $0.name == state.servePickCurrent }
    }

    // Todos os jogadores em pares (time, índice) — a lista do seletor de sacador.
    private var allSlots: [(team: Int, idx: Int, name: String)] {
        var out: [(team: Int, idx: Int, name: String)] = []
        for team in [leftTeam, rightTeam] {                 // na ordem dos lados
            let ns = state.players(team)
            for (i, n) in ns.enumerated() where !n.isEmpty {
                out.append((team: team, idx: i, name: n))
            }
        }
        return out
    }

    // Barra "🎾 Sacador: <nome>" — só existe enquanto a ordem pode mudar (duplas,
    // 2 primeiros jogos). É o equivalente no relógio a arrastar a bola no celular:
    // arrastar num mostrador de 40mm não funciona (as metades já são os botões de
    // +1 e um alvo de arrasto ali só geraria ponto errado), então o gesto vira
    // toque → lista → escolhe. Some sozinha quando o saque trava.
    private var serverBar: some View {
        Button(action: { pickingServer = true }) {
            HStack(spacing: 4) {
                Circle().fill(Color.spBall).frame(width: 8, height: 8)
                Text(state.serverName.isEmpty ? "Sacador" : state.serverName)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .foregroundColor(Color(hex: 0xF5D5A5))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(Color.spBall.opacity(0.14))
        }
        .buttonStyle(.plain)
    }

    // Lista de quem pode sacar. Cobre as metades → nenhum toque vira ponto por
    // engano enquanto escolhe. Fecha sozinha se o saque travar no meio (o motor
    // é quem manda; o relógio nunca decide isso).
    private var serverPicker: some View {
        // Fase 0 = quem ABRE o saque (os 4). Fase 1 = quem faz o 2º saque do set
        // (só o time que não abriu — o outro já travou). A lista vem PRONTA do
        // celular (serveEligible); o relógio não deriva a regra.
        let isSecond = state.servePickPhase == 1
        return ScrollView {
            VStack(spacing: 6) {
                // À esquerda E abaixo da faixa do relógio do sistema (canto
                // superior direito): centralizado ou colado no topo, o título
                // ficava POR BAIXO do horário e virava ilegível.
                HStack {
                    Text(isSecond ? "Quem saca o 2º game?" : "Quem abre o saque?")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.spNameBlue)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    Spacer()
                }
                .padding(.top, 22)
                // Escolher NÃO aplica: acende o nome (bola + destaque) e só o
                // "Confirmar" manda a intenção. Aplicar no toque não deixava ver
                // o que foi escolhido antes de valer, e um toque errado já
                // trocava o sacador.
                ForEach(state.serveEligible, id: \.self) { slot in
                    let isSel = slot.name == selectedServeName
                    Button(action: { pendingPick = slot }) {
                        HStack(spacing: 5) {
                            // A bola segue o SELECIONADO — é o feedback de "é este".
                            if isSel {
                                Circle().fill(Color.spBall).frame(width: 8, height: 8)
                            }
                            Text(slot.name)
                                .font(.system(size: 14, weight: isSel ? .bold : .regular))
                                .lineLimit(2)
                                .minimumScaleFactor(0.6)
                            Spacer()
                        }
                        .foregroundColor(isSel ? TeamPalette.of(slot.team).name
                                              : TeamPalette.of(slot.team).nameDim)
                        .padding(.vertical, 7)
                        .padding(.horizontal, 8)
                        .frame(maxWidth: .infinity)
                        .background(TeamPalette.of(slot.team).tint.opacity(isSel ? 1 : 0.4))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.spBall.opacity(isSel ? 0.9 : 0), lineWidth: 2)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
                Button(action: {
                    if let p = resolvedServePick { onSetServer(p.team, p.playerIdx) }
                    pendingPick = nil
                    pickingServer = false
                }) {
                    Text("Confirmar").font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 7)
                        .background(Color(hex: 0x10B981).opacity(resolvedServePick == nil ? 0.3 : 0.95))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .foregroundColor(resolvedServePick == nil ? Color(hex: 0x6A6A80) : Color(hex: 0x04342C))
                .disabled(resolvedServePick == nil)
                .padding(.top, 4)
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
        }
        .background(Color.spBg.ignoresSafeArea())
    }

    // Tela de "Iniciar": o celular está com a montagem aberta. Mostra modalidade
    // e quem vai jogar, e o botão que dispara a MESMA função do botão do celular.
    private var startOverlay: some View {
        ScrollView {
            VStack(spacing: 5) {
                Text("⚡").font(.system(size: 28))
                Text(state.sportName.isEmpty ? "Partida Casual" : state.sportName)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.spNameBlue)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.6)
                ForEach(allSlots, id: \.name) { slot in
                    Text(slot.name)
                        .font(.system(size: 12))
                        .foregroundColor(TeamPalette.of(slot.team).nameDim)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                Button(action: onStart) {
                    Text("Iniciar").font(.system(size: 15, weight: .bold))
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(Color(hex: 0x10B981).opacity(0.95)).clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .foregroundColor(Color(hex: 0x04342C))
                .padding(.top, 6)
                .padding(.horizontal, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
        .background(Color.spBg.ignoresSafeArea())
    }

    // Rodapé. "Sacador" e "Desfazer" DIVIDEM a mesma linha quando o saque ainda
    // pode mudar: num 40mm duas faixas empilhadas empurravam o "Desfazer" pra
    // fora da tela. Fora dos 2 primeiros jogos, o "Desfazer" ocupa a linha toda.
    private var bottomBar: some View {
        HStack(spacing: 4) {
            if state.canSetServer { serverBar }
            undoBar
        }
        .padding(.bottom, 10)   // #3: sem isto o "Desfazer" era cortado pela borda inferior
        // layoutPriority: o rodapé reserva a altura dele ANTES das metades dos times
        // (que são flexíveis). Sem isto, nomes grandes o empurravam pra fora da tela.
        .layoutPriority(1)
    }

    private var undoBar: some View {
        Button(action: onUndo) {
            HStack(spacing: 5) {
                Image(systemName: "arrow.uturn.backward").font(.system(size: 12))
                Text("Desfazer").font(.system(size: 12))
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            .foregroundColor(Color(hex: 0xD5D5E5))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.05))
        }
        .buttonStyle(.plain)
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
                // Troféu e nomes encolhem no 40mm: em tamanho cheio, o botão do
                // Rei/Rainha ("Jogo N de 3") caía abaixo da dobra e exigia rolar
                // pra achar a ação principal da tela. Medido no simulador.
                Text("🏆").font(.system(size: isSmallWatch ? 24 : 34))
                if w == 1 || w == 2 {
                    Text("Vencedor").font(.system(size: 11)).kerning(1).foregroundColor(.spMeta)
                    ForEach(state.winnerNames, id: \.self) { n in
                        Text(n)
                            .font(.system(size: isSmallWatch ? 17 : 22, weight: .semibold))
                            .foregroundColor(pal.name)
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.5)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 6)
                    }
                } else {
                    Text("Empate").font(.system(size: 18, weight: .semibold)).foregroundColor(.spMeta)
                }
                Text(finalScoreLine).font(.system(size: 12)).foregroundColor(.spMetaDim).padding(.top, 3)
                // Rei/Rainha manda no fim de jogo: a série de 3 continua (duplas
                // rotacionam), então NÃO é "jogar novamente" — é o próximo jogo.
                // Depois do 3º, a série encerra e vem a classificação individual.
                if state.reiRainha && state.rrRound < 3 {
                    reiRainhaControls.padding(.top, 8)
                } else if state.reiRainha {
                    rrStandingsView.padding(.top, 8)
                } else if state.canReplay && !replayDismissed {
                    replayControls.padding(.top, 10)
                } else {
                    // Sem esta linha a tela de vitória vira um beco sem saída MUDO:
                    // o overlay cobre os botões +1 e, sem controles, o usuário lê
                    // "travado" e mata o app. O celular é quem libera (empurra o
                    // estado inativo ao fechar o placar); aqui deixamos explícito
                    // que estamos esperando, em vez de parecer congelado.
                    Text("Aguardando o celular…")
                        .font(.system(size: 11))
                        .foregroundColor(.spMetaDim)
                        .padding(.top, 10)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
        }
        .background(Color.spBg.ignoresSafeArea())   // opaco: fim de jogo é tela definitiva
    }

    // Rei/Rainha, fim de um jogo da série: avança pro próximo (o celular rotaciona
    // as duplas) ou, no 3º, encerra e mostra a classificação. Os rótulos seguem os
    // do celular ("Jogo N de 3", "Ver Resultado Final") pra não inventar vocabulário.
    private var reiRainhaControls: some View {
        VStack(spacing: 5) {
            Text("Jogo \(min(state.rrRound + 1, 3)) de 3 concluído")
                .font(.system(size: 11))
                .foregroundColor(.spMetaDim)
            if state.rrRound < 2 {
                Button(action: onReiRainhaNext) {
                    Text("⚡ Jogo \(state.rrRound + 2) de 3")
                        .font(.system(size: 14, weight: .bold))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(Color(hex: 0xF59E0B).opacity(0.95)).clipShape(Capsule())
                }
                .buttonStyle(.plain).foregroundColor(Color(hex: 0x3A2600))
            } else {
                Button(action: onReiRainhaFinal) {
                    Text("👑 Resultado Final")
                        .font(.system(size: 14, weight: .bold))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(Color(hex: 0xB45309).opacity(0.95)).clipShape(Capsule())
                }
                .buttonStyle(.plain).foregroundColor(.white)
            }
        }
        .padding(.horizontal, 8)
    }

    // Classificação final da série (rrRound == 3). Vitórias por PESSOA — a dupla
    // mudou a cada jogo, então o mérito é individual. Invicto (3V) é o Rei/Rainha.
    // A ordenação e a contagem vêm prontas do celular.
    private var rrStandingsView: some View {
        VStack(spacing: 4) {
            Text("👑 Rei/Rainha")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(Color(hex: 0xF59E0B))
            ForEach(Array(state.rrStandings.enumerated()), id: \.element) { idx, p in
                HStack(spacing: 5) {
                    Text(idx == 0 ? "🥇" : idx == 1 ? "🥈" : idx == 2 ? "🥉" : "4️⃣")
                        .font(.system(size: 12))
                    Text(p.name)
                        .font(.system(size: 13, weight: p.wins == 3 ? .bold : .regular))
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Spacer()
                    Text("\(p.wins)V")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(p.wins == 3 ? Color(hex: 0xF59E0B) : .spMetaDim)
                }
                .foregroundColor(p.wins == 3 ? Color(hex: 0xFDE68A) : .spNameBlueD)
                .padding(.vertical, 5).padding(.horizontal, 8)
                .frame(maxWidth: .infinity)
                .background(Color(hex: 0xF59E0B).opacity(p.wins == 3 ? 0.18 : 0.05))
                .clipShape(RoundedRectangle(cornerRadius: 7))
            }
        }
        .padding(.horizontal, 8)
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
