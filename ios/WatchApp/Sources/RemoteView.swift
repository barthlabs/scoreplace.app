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
    var onReiRainhaStart: () -> Void = {}         // aceita a sugestão de Rei/Rainha (ativa retroativa + 3º jogo)
    @State private var replayDismissed = false   // Cancelar esconde o prompt
    @State private var reshuffle = false         // toggle "Re-sortear duplas"
    @State private var pickingServer = false     // seletor de sacador aberto
    @State private var pendingPick: ScoreState.ServeSlot? = nil  // escolha ainda não confirmada

    private var leftTeam: Int { state.leftTeam }
    private var rightTeam: Int { state.rightTeam }

    // ── CÂNONE DE ESCALA POR ÁREA (o mesmo do app todo — ver
    // project_web_area_scaling_canon / feedback_maximize_screen_area) ──
    // A tela REAL (screenBounds = tela cheia do relógio) contra a referência
    // 198×242 pt (Apple Watch 45mm, onde os tamanhos-base são desenhados).
    // scale = clamp(min(w/198, h/242), 0.60, 1.35). TODO tamanho e espaçamento
    // passa por sz(base) = base × scale — via ÚNICA, sem caminho alternativo.
    // O layout é desenhado no MENOR e o cânone dá zoom no maior.
    private var canonScale: CGFloat {
        let b = WKInterfaceDevice.current().screenBounds.size
        guard b.width > 0, b.height > 0 else { return 1 }
        return min(max(min(b.width / 198.0, b.height / 242.0), 0.60), 1.35)
    }
    private func sz(_ base: CGFloat) -> CGFloat { base * canonScale }
    private var nameFontSize: CGFloat { sz(17) }
    private var pointFontSize: CGFloat { sz(88) }

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
        // Abrir no meio da fase 1 (ex.: relógio conecta/abre já no 2º saque): o
        // onChange não dispara no estado inicial, então garante o seletor aqui.
        .onAppear { if state.servePickPhase == 1 { pickingServer = true } }
    }

    // Placar ao vivo pelo modelo de 3 SETORES (igual ao Iniciar): SETS na FAIXA DO
    // RELÓGIO (topo, alinhado com o relógio do sistema à direita), placar+nomes
    // FLUTUAM no meio, e Desfazer colado na BASE. GeometryReader EXTERNO (sem
    // ignoresSafeArea) lê o inset REAL do topo (= a faixa do relógio) e do corte
    // lateral; monta a tela cheia e reposiciona com offset.
    private var mainContent: some View {
        GeometryReader { root in
            let ins = root.safeAreaInsets
            let bandH = ins.top
            let fullW = root.size.width + ins.leading + ins.trailing
            let fullH = root.size.height + ins.top + ins.bottom
            // "1-2" colado LOGO ABAIXO do relógio VISÍVEL (não da faixa inteira, que
            // é bem maior que o relógio) → gamesY é fração da faixa, não a faixa toda.
            let gamesY = bandH * 0.52
            let topInset = gamesY + sz(36)                       // cromo do topo (relógio + games)
            let bottomInset = sz(34)                             // reserva da barra + FOLGA (nomes não colam no Desfazer)
            ZStack(alignment: .topLeading) {
                // ── BASE: metades coloridas do TOPO à BASE (como no Android). O
                //    conteúdo (ponto + nomes) fica inset abaixo do cromo. ──
                HStack(spacing: 0) {
                    teamHalf(team: leftTeam, topInset: topInset, bottomInset: bottomInset)
                    teamHalf(team: rightTeam, topInset: topInset, bottomInset: bottomInset)
                }
                .frame(width: fullW, height: fullH)

                // ── SETOR 1 (faixa do relógio): SETS à ESQUERDA, alinhado com o
                //    relógio (à direita). Só em melhor-de-N (showsSets). ──
                if state.active && state.showsSets {
                    HStack(spacing: sz(4)) {
                        Text("SETS").font(.system(size: sz(9))).foregroundColor(.spMetaDim)
                        Text(String(state.setsFor(leftTeam)))
                            .font(.system(size: sz(13), weight: .semibold))
                            .foregroundColor(TeamPalette.of(leftTeam).point)
                        Text("-").font(.system(size: sz(10))).foregroundColor(.spDash)
                        Text(String(state.setsFor(rightTeam)))
                            .font(.system(size: sz(13), weight: .semibold))
                            .foregroundColor(TeamPalette.of(rightTeam).point)
                        Spacer(minLength: 0)
                    }
                    .padding(.leading, ins.leading + sz(14))
                    .padding(.trailing, ins.trailing + sz(52))   // reserva do relógio
                    .frame(width: fullW, height: bandH)
                    .offset(y: -bandH * 0.10)                     // alinha com o relógio
                    .allowsHitTesting(false)
                }
                // ── GAMES (esquerda) + números "1 - 2" (centrados) LOGO ABAIXO da
                //    faixa do relógio. GAMES no tamanho de sempre; 1-2 não encolhe. ──
                if state.active {
                    ZStack {
                        HStack(alignment: .firstTextBaseline, spacing: sz(8)) {
                            Text(String(state.gamesFor(leftTeam)))
                                .font(.system(size: sz(30), weight: .semibold))
                                .foregroundColor(TeamPalette.of(leftTeam).point)
                            Text("-").font(.system(size: sz(20))).foregroundColor(.spDash)
                            Text(String(state.gamesFor(rightTeam)))
                                .font(.system(size: sz(30), weight: .semibold))
                                .foregroundColor(TeamPalette.of(rightTeam).point)
                        }
                        HStack {
                            Text(state.reiRainha && state.rrRound < 3
                                 ? "JOGO \(state.rrRound + 1)/3" : "GAMES")
                                .font(.system(size: sz(11))).kerning(1)
                                .foregroundColor(state.reiRainha ? Color(hex: 0xF59E0B) : .spMetaDim)
                            Spacer()
                        }
                        .padding(.leading, ins.leading + sz(12))
                    }
                    .frame(width: fullW)
                    .offset(y: gamesY)                           // colado logo abaixo do relógio
                    .allowsHitTesting(false)
                } else {
                    Text("Aguardando…").font(.system(size: sz(12)))
                        .foregroundColor(.spMeta)
                        .frame(width: fullW)
                        .offset(y: gamesY)
                }
                // ── Desfazer colado na BASE ──
                VStack(spacing: 0) { Spacer(minLength: 0); bottomBar }
                    .frame(width: fullW, height: fullH)
            }
            .frame(width: fullW, height: fullH)
            .offset(x: -ins.leading, y: -ins.top)                // cobre a tela física
        }
    }

    // Metade de um time (fundo colorido do topo à base): ponto grande CENTRADO no
    // miolo (entre o cromo do topo e a barra), nomes na base, bola no sacador. A
    // metade inteira é o botão de +1. topInset/bottomInset vêm do mainContent
    // (cromo do relógio+games no topo, barra Desfazer na base).
    private func teamHalf(team: Int, topInset: CGFloat, bottomInset: CGFloat) -> some View {
        let pal = TeamPalette.of(team)
        let names = state.players(team)
        let p1 = names.count > 0 ? names[0] : ""
        let p2 = names.count > 1 ? names[1] : ""
        return Button(action: { onPoint(team) }) {
            VStack(spacing: sz(1)) {
                // O ponto ocupa o frame FLEXÍVEL (maxHeight: .infinity) e empurra os
                // nomes pra BASE; encolhe via minimumScaleFactor só quando falta
                // espaço. Nomes já vêm curtos (primeiro nome) → 1 linha, colados.
                Text(state.point(team))
                    .font(.system(size: pointFontSize, weight: .semibold))
                    .foregroundColor(pal.point)
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .scaleEffect(x: 1, y: 1.28, anchor: .center)  // fonte ESTICADA na vertical (ocupa mais)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                nameRow(p1, team: team, color: pal.name)
                nameRow(p2, team: team, color: pal.nameDim)
            }
            .padding(.top, topInset)
            .padding(.bottom, bottomInset)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(pal.tint)
        }
        .buttonStyle(.plain)
    }

    // Linha de um jogador, COLADA no centro: time da esquerda alinhado à DIREITA,
    // time da direita alinhado à ESQUERDA (os nomes se encontram na divisa). A bola
    // do saque (maior) fica colada no lado de FORA do nome, só no sacador — some
    // (não reserva espaço) quando não saca, então o nome não sai do centro. Nome já
    // vem curto (primeiro nome) → 1 linha; minimumScaleFactor cobre nomes longos.
    private func nameRow(_ name: String, team: Int, color: Color) -> some View {
        let isLeft = (team == leftTeam)
        let serving = state.isServing(team) && state.serverName == name && !name.isEmpty
        let label = Text(name)
            .font(.system(size: nameFontSize, weight: .semibold))
            .foregroundColor(color)
            .lineLimit(1)
            // Nome NUNCA trunca (regra do dono): a fonte encolhe-pra-caber num box
            // fixo. Piso baixo o bastante pra qualquer primeiro nome realista caber
            // na metade da tela; abaixo dele o SwiftUI cortaria com "…".
            .minimumScaleFactor(0.3)
        let ball = Circle().fill(Color.spBall).frame(width: sz(11), height: sz(11))
        return HStack(spacing: sz(3)) {
            if isLeft {
                if serving { ball }          // fora = esquerda
                label
            } else {
                label
                if serving { ball }          // fora = direita
            }
        }
        .frame(maxWidth: .infinity, alignment: isLeft ? .trailing : .leading)
        .padding(isLeft ? .trailing : .leading, sz(6))
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
                    .minimumScaleFactor(0.4)   // nome nunca trunca — encolhe-pra-caber
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
    // Um nome selecionável no seletor de sacador — MESMO visual do startNameRow do
    // Iniciar (nome grande na cor FORTE do time, box + bola no selecionado).
    private func serveNameRow(_ slot: ScoreState.ServeSlot) -> some View {
        let isSel = slot.name == selectedServeName
        return Button(action: { pendingPick = slot }) {
            HStack(spacing: sz(4)) {
                Circle().fill(isSel ? Color.spBall : Color.clear)
                    .frame(width: sz(7), height: sz(7))
                Text(slot.name)
                    .font(.system(size: sz(23), weight: isSel ? .bold : .medium))
                    .foregroundColor(TeamPalette.of(slot.team).point)
                    .lineLimit(1).minimumScaleFactor(0.4)   // nome nunca trunca
                Spacer()
            }
            .padding(.vertical, sz(3)).padding(.horizontal, sz(6))
            .overlay(
                RoundedRectangle(cornerRadius: sz(8))
                    .stroke(Color.spBall.opacity(isSel ? 0.9 : 0), lineWidth: sz(1.5))
            )
        }
        .buttonStyle(.plain)
    }

    // Seletor de sacador com a MESMA cara do Iniciar (modelo de 3 setores). Dispara
    // sozinho ao fim do 1º game (fase 1 → escolher o 2º sacador); fase 0 = quem abre.
    // A lista vem PRONTA do celular (serveEligible; fase 1 = só o time que não abriu).
    private var serverPicker: some View {
        let isSecond = state.servePickPhase == 1
        return GeometryReader { root in
            let ins = root.safeAreaInsets
            let bandH = ins.top
            let fullW = root.size.width + ins.leading + ins.trailing
            let fullH = root.size.height + ins.top + ins.bottom
            ZStack(alignment: .topLeading) {
                Color.spBg
                // ⚡/🏆 + modalidade na faixa do relógio (esquerda), igual ao Iniciar.
                HStack(spacing: sz(4)) {
                    Text(state.isCasual ? "⚡" : "🏆").font(.system(size: sz(13)))
                    Text(state.sportName.isEmpty ? "Casual" : state.sportName)
                        .font(.system(size: sz(15), weight: .semibold))
                        .foregroundColor(.spMeta)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                }
                .padding(.leading, ins.leading + sz(16))
                .padding(.trailing, ins.trailing + sz(52))
                .frame(width: fullW, height: bandH, alignment: .leading)
                .offset(y: -bandH * 0.10)
                .allowsHitTesting(false)
                // SETORES 2+3: prompt + nomes num bloco de espaçamento FIXO colado
                // mais pra CIMA (Spacer só no fim empurra o conjunto pra cima);
                // "Confirmar" na base.
                VStack(spacing: 0) {
                    Color.clear.frame(height: bandH * 0.68)        // sobe pro espaço abaixo do relógio VISÍVEL (não da faixa toda)
                    VStack(spacing: sz(24)) {                      // espaçamento fixo entre prompt e nomes
                        Text(isSecond ? "2º sacador" : "1º sacador")
                            .font(.system(size: sz(18), weight: .bold))
                            .foregroundColor(.spNameBlue)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        ForEach(state.serveEligible, id: \.self) { slot in
                            serveNameRow(slot)
                        }
                    }
                    .padding(.top, sz(6))
                    .padding(.horizontal, sz(12))
                    Spacer(minLength: sz(4))                       // empurra o conjunto pra cima
                    // BOTÃO Confirmar = barra inferior (formato do Iniciar).
                    Button(action: {
                        if let p = resolvedServePick { onSetServer(p.team, p.playerIdx) }
                        pendingPick = nil
                        pickingServer = false
                    }) {
                        Text("Confirmar").font(.system(size: sz(15), weight: .bold))
                            .frame(maxWidth: .infinity)
                            .padding(.top, sz(4)).padding(.bottom, sz(5))
                            .background(Color(hex: 0x10B981).opacity(resolvedServePick == nil ? 0.3 : 1))
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(resolvedServePick == nil ? Color(hex: 0x6A6A80) : Color(hex: 0x04342C))
                    .disabled(resolvedServePick == nil)
                    .padding(.horizontal, -sz(16))                 // estoura pra encostar nas bordas
                }
                .frame(width: fullW, height: fullH, alignment: .top)
            }
            .frame(width: fullW, height: fullH)
            .offset(x: -ins.leading, y: -ins.top)
        }
    }

    // Tela de "Iniciar": o celular está com a montagem aberta. Mostra modalidade
    // e quem vai jogar, e o botão que dispara a MESMA função do botão do celular.
    // Uma linha de nome tappável na tela Iniciar. O sacador escolhido (server)
    // ganha box + bola à esquerda. Tocar manda a intenção de sacador inicial.
    private func startNameRow(team: Int, idx: Int, name: String) -> some View {
        let isSel = state.serverName == name && !name.isEmpty
        return Button(action: { onSetServer(team, idx) }) {
            HStack(spacing: sz(4)) {
                Circle().fill(isSel ? Color.spBall : Color.clear)
                    .frame(width: sz(7), height: sz(7))
                Text(name)
                    .font(.system(size: sz(23), weight: isSel ? .bold : .medium))
                    .foregroundColor(TeamPalette.of(team).point)   // cor FORTE do time (= nº 30-40 do placar)
                    .lineLimit(1).minimumScaleFactor(0.4)   // nome nunca trunca
                Spacer()
            }
            .padding(.vertical, sz(3)).padding(.horizontal, sz(6))
            .overlay(
                RoundedRectangle(cornerRadius: sz(8))
                    .stroke(Color.spBall.opacity(isSel ? 0.9 : 0), lineWidth: sz(1.5))
            )
        }
        .buttonStyle(.plain)
    }

    private var startOverlay: some View {
        // Tela de montagem = ESCOLHER O SACADOR INICIAL. Modalidade pequena no
        // canto superior ESQUERDO (há espaço; o relógio do sistema fica à direita).
        // No lugar dela, o prompt do saque, acima dos nomes. Cada nome é tappável:
        // o selecionado ganha box + bola à esquerda. "Iniciar" colado na base.
        // GeometryReader dando a TELA CHEIA (não a safe-area): a safe-area do
        // sistema NÃO é proporcional entre 40mm e 46mm, então ancorar nela fazia a
        // área útil do maior NÃO ser uma versão escalada da do menor (o Spacer
        // distribuía diferente = zoom infiel; e o botão não colava na base). Com a
        // tela cheia + zonas (relógio/base) reservadas por padding ESCALADO, tudo
        // escala junto: o maior vira zoom FIEL do menor E o botão cola na base.
        // O GeometryReader EXTERNO NÃO ignora a safe-area → lê o inset REAL do topo
        // (= a faixa do relógio) e o corte lateral. Monto a tela cheia manualmente
        // (safe-area + insets) e reposiciono com offset. Assim a modalidade fica
        // CENTRADA na faixa do relógio = na linha do relógio, em QUALQUER aparelho,
        // e nada depende de número mágico por tela.
        GeometryReader { root in
            let ins = root.safeAreaInsets
            let bandH = ins.top                                   // faixa do relógio
            let fullW = root.size.width + ins.leading + ins.trailing
            let fullH = root.size.height + ins.top + ins.bottom
            ZStack(alignment: .topLeading) {
                Color.spBg
                // ── SETOR 1: faixa do relógio — ícone (⚡ casual / 🏆 torneio) +
                //    modalidade à esquerda, alinhados verticalmente com o relógio.
                //    Recuo esquerdo = corte do canto; reserva à direita = relógio. ──
                HStack(spacing: sz(4)) {
                    Text(state.isCasual ? "⚡" : "🏆")
                        .font(.system(size: sz(13)))
                    Text(state.sportName.isEmpty ? "Casual" : state.sportName)
                        .font(.system(size: sz(15), weight: .semibold))
                        .foregroundColor(.spMeta)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                }
                .padding(.leading, ins.leading + sz(16))
                .padding(.trailing, ins.trailing + sz(52))        // reserva do relógio (não encavala)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: bandH, alignment: .center)         // alinhado NA linha do relógio
                .offset(y: bandH * 0.10)                          // desce ~pra o baseline do relógio (∝ faixa)
                // ── SETORES 2+3: central FLUTUA no meio (não cola em nenhuma das
                //    duas linhas) + botão MÍNIMO colado na linha de baixo ──
                VStack(spacing: 0) {
                    Color.clear.frame(height: bandH)               // faixa do relógio (topo)
                    Spacer(minLength: sz(4))                       // central NÃO cola na linha de cima
                    VStack(spacing: sz(6)) {                       // CENTRAL: rótulo + NOMES (grandes)
                        Text("1º sacador")
                            .font(.system(size: sz(14), weight: .bold))
                            .foregroundColor(.spNameBlue)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        VStack(spacing: sz(7)) {
                            ForEach(allSlots, id: \.name) { slot in
                                startNameRow(team: slot.team, idx: slot.idx, name: slot.name)
                            }
                        }
                    }
                    .padding(.horizontal, sz(12))
                    .offset(y: -sz(8))                             // sobe o bloco central um pouco
                    Spacer(minLength: sz(4))                       // central NÃO cola na linha de baixo
                    // BOTÃO: mínimo (o menor que funcione), colado na linha de baixo;
                    // topo RETO, estoura largura/base, cortado pela curva da tela.
                    Button(action: onStart) {
                        Text("Iniciar").font(.system(size: sz(15), weight: .bold))
                            .frame(maxWidth: .infinity)
                            .padding(.top, sz(4))
                            .padding(.bottom, sz(5))   // mínimo; o botão já chega na base pela estrutura (sem +ins.bottom, que inchava o 46)
                            .background(Color(hex: 0x10B981))
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(Color(hex: 0x04342C))
                }
                .frame(width: fullW, height: fullH, alignment: .top)
            }
            .frame(width: fullW, height: fullH)
            .offset(x: -ins.leading, y: -ins.top)                 // cobre a tela física
        }
    }

    // Rodapé. "Sacador" e "Desfazer" DIVIDEM a mesma linha quando o saque ainda
    // pode mudar: num 40mm duas faixas empilhadas empurravam o "Desfazer" pra
    // fora da tela. Fora dos 2 primeiros jogos, o "Desfazer" ocupa a linha toda.
    private var bottomBar: some View {
        // Sacador (pílula) ACIMA da barra Desfazer (full-bleed, colada na base) —
        // igual ao Wear. layoutPriority: reserva a altura ANTES das metades flex.
        VStack(spacing: sz(4)) {
            if state.canSetServer { serverBar }
            undoBar.padding(.horizontal, -sz(16))   // estoura pra encostar nas bordas
        }
        .padding(.bottom, 3)
        .layoutPriority(1)
    }

    // Desfazer = BARRA inferior (mesmo formato do Iniciar): fill sólido, topo reto,
    // largura cheia (estoura pra encostar nas bordas, cortada pela curva embaixo).
    private var undoBar: some View {
        Button(action: onUndo) {
            HStack(spacing: sz(5)) {
                Image(systemName: "arrow.uturn.backward").font(.system(size: sz(11)))
                Text("Desfazer").font(.system(size: sz(12)))
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            .foregroundColor(Color(hex: 0xD5D5E5))
            .frame(maxWidth: .infinity)
            .padding(.top, sz(3)).padding(.bottom, sz(5))
            .background(Color(hex: 0x26263A))
        }
        .buttonStyle(.plain)
    }

    // Empate → escolha do desempate (espelha o overlay do celular). ⚖️ + "Empate
    // N–N" + Prorrogar (verde) / Tie-break (roxo). Cobre as metades → os toques
    // +1 não valem enquanto pende. Recorre a cada empate até vencer por 2 ou
    // ativar o tie-break — a recorrência é decidida no motor, não aqui.
    // Botão CÁPSULA do empate (Apple = retângulo arredondado; barra full-bleed fica
    // estranha aqui, então cápsula). Altura por padding (intrínseca) → os dois iguais.
    private func tieCapsule(_ title: String, bg: UInt32, fg: UInt32, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: sz(27), weight: .bold))
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity).padding(.vertical, sz(9))
                .background(Color(hex: bg)).clipShape(Capsule())
        }
        .buttonStyle(.plain).foregroundColor(Color(hex: fg))
    }

    // Empate no Apple: Prorrogar (cápsula) ACIMA da balança · ⚖️ + placar MAIOR
    // (cor dos times) · Tie-break (cápsula) ABAIXO. Sem modalidade, centrado.
    private var tieOverlay: some View {
        let tied = state.tiedAt ?? state.gamesFor(leftTeam)
        return GeometryReader { root in
            let ins = root.safeAreaInsets
            let bandH = ins.top
            let fullW = root.size.width + ins.leading + ins.trailing
            let fullH = root.size.height + ins.top + ins.bottom
            ZStack(alignment: .topLeading) {
                Color.spBg
                VStack(spacing: 0) {
                    Color.clear.frame(height: bandH)
                    Spacer(minLength: sz(4))
                    VStack(spacing: sz(7)) {
                        tieCapsule("Prorrogar", bg: 0x10B981, fg: 0x04342C) { onResolveTie("extend") }
                        VStack(spacing: sz(1)) {                   // ⚖️ + placar MAIOR
                            Text("⚖️").font(.system(size: sz(27)))
                            HStack(spacing: sz(7)) {
                                Text("\(tied)").foregroundColor(TeamPalette.of(leftTeam).point)
                                Text("–").foregroundColor(.spDash)
                                Text("\(tied)").foregroundColor(TeamPalette.of(rightTeam).point)
                            }
                            .font(.system(size: sz(32), weight: .bold))
                        }
                        tieCapsule("Tie-break", bg: 0xA855F7, fg: 0xFFFFFF) { onResolveTie("tiebreak") }
                    }
                    .padding(.horizontal, sz(34))
                    .padding(.bottom, sz(12))
                    Spacer(minLength: sz(4))
                }
                .frame(width: fullW, height: fullH, alignment: .top)
            }
            .frame(width: fullW, height: fullH)
            .offset(x: -ins.leading, y: -ins.top)
        }
    }

    // Tela de fim de jogo pelo modelo de SETORES (igual às outras): faixa da
    // modalidade no topo, troféu + Vencedor + nomes + placar FLUTUAM no meio,
    // ação(ões) na BASE. Cobre as metades → os toques +1 não valem mais.
    private var winnerOverlay: some View {
        let w = state.winner ?? 0
        let pal = TeamPalette.of(w == 2 ? 2 : 1)
        let rrFinal = state.reiRainha && state.rrRound >= 3
        return GeometryReader { root in
            let ins = root.safeAreaInsets
            let bandH = ins.top
            let fullW = root.size.width + ins.leading + ins.trailing
            let fullH = root.size.height + ins.top + ins.bottom
            ZStack(alignment: .topLeading) {
                Color.spBg
                // ⚡/🏆 + modalidade na faixa do relógio (igual às outras telas).
                HStack(spacing: sz(4)) {
                    Text(state.isCasual ? "⚡" : "🏆").font(.system(size: sz(13)))
                    Text(state.sportName.isEmpty ? "Casual" : state.sportName)
                        .font(.system(size: sz(15), weight: .semibold)).foregroundColor(.spMeta)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                }
                .padding(.leading, ins.leading + sz(16)).padding(.trailing, ins.trailing + sz(52))
                .frame(width: fullW, height: bandH, alignment: .leading)
                .offset(y: -bandH * 0.10)
                .allowsHitTesting(false)
                VStack(spacing: 0) {
                    Color.clear.frame(height: bandH)
                    if rrFinal {
                        Spacer(minLength: sz(4))
                        rrStandingsView                          // classificação central
                        Spacer(minLength: sz(4))
                    } else {
                        Spacer(minLength: sz(4))
                        VStack(spacing: sz(2)) {                 // troféu → placar (sobe um pouco)
                            Text("🏆").font(.system(size: sz(24)))
                            if w == 1 || w == 2 {
                                Text("Vencedor").font(.system(size: sz(11))).kerning(1).foregroundColor(.spMeta)
                                ForEach(state.winnerNames, id: \.self) { n in
                                    Text(n)
                                        .font(.system(size: sz(20), weight: .bold))
                                        .foregroundColor(pal.point)
                                        .lineLimit(1).minimumScaleFactor(0.4)   // nome nunca trunca
                                }
                            } else {
                                Text("Empate").font(.system(size: sz(18), weight: .semibold)).foregroundColor(.spMeta)
                            }
                            HStack(spacing: sz(5)) {          // placar em games: vencedor VERDE, perdedor VERMELHO
                                Text("\(state.gamesFor(leftTeam))")
                                    .foregroundColor(w == 0 ? .spMetaDim : (leftTeam == w ? Color(hex: 0x10B981) : Color(hex: 0xEF4444)))
                                Text("–").foregroundColor(.spDash)
                                Text("\(state.gamesFor(rightTeam))")
                                    .foregroundColor(w == 0 ? .spMetaDim : (rightTeam == w ? Color(hex: 0x10B981) : Color(hex: 0xEF4444)))
                            }
                            .font(.system(size: sz(16), weight: .bold))
                            .padding(.top, sz(2))
                        }
                        .offset(y: -sz(6))
                        Spacer(minLength: sz(4))
                        winnerBottomControls
                    }
                }
                .frame(width: fullW, height: fullH, alignment: .top)
            }
            .frame(width: fullW, height: fullH)
            .offset(x: -ins.leading, y: -ins.top)
        }
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
                        .lineLimit(1).minimumScaleFactor(0.4)   // nome nunca trunca
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

    // Ações na BASE do fim de jogo. Casual = toggle "Re-sortear" (OFF por padrão)
    // ACIMA de uma barra dividida ao meio: Cancelar (VERMELHO, esquerda) +
    // Confirmar (VERDE, direita) — como o "Iniciar" cortado ao meio. Rei/Rainha no
    // meio da série = botão do próximo jogo. Torneio = "Aguardando o celular…".
    @ViewBuilder private var winnerBottomControls: some View {
        if state.reiRainha && state.rrRound < 3 {
            reiRainhaControls.padding(.bottom, sz(8))
        } else if state.canReplay && !replayDismissed {
            VStack(spacing: sz(14)) {
                if state.isDoubles {
                    // Toggle COMPACTO e centrado. VARIAÇÃO Rei/Rainha: quando 2 jogos
                    // com pares distintos já rolaram e só falta o 3º par (rrSuggest),
                    // o toggle vira "👑 Rei/Rainha" DOURADO e um pouco maior.
                    HStack(spacing: sz(6)) {
                        Text(state.rrSuggest ? "👑 Rei/\nRainha" : "Re-sortear\nduplas")
                            .font(.system(size: state.rrSuggest ? sz(13) : sz(11),
                                          weight: state.rrSuggest ? .bold : .regular))
                            .foregroundColor(state.rrSuggest ? Color(hex: 0xF59E0B) : .spMeta)
                            .multilineTextAlignment(.trailing)
                            .lineLimit(2)
                        Toggle("", isOn: $reshuffle)
                            .labelsHidden()
                            .toggleStyle(SwitchToggleStyle(tint: state.rrSuggest ? Color(hex: 0xF59E0B) : .spBlue))
                    }
                }
                HStack(spacing: 0) {
                    Button(action: { replayDismissed = true }) {
                        Text("Fechar").font(.system(size: sz(14), weight: .bold))
                            .frame(maxWidth: .infinity, alignment: .trailing)   // texto perto da divisa (centro)
                            .padding(.trailing, sz(16))
                            .padding(.top, sz(4)).padding(.bottom, sz(5))
                            .background(Color(hex: 0xEF4444))
                    }.buttonStyle(.plain).foregroundColor(.white)
                    Button(action: {
                        // RR ligado → aceita a sugestão de Rei/Rainha; senão, replay normal.
                        if state.rrSuggest && reshuffle { onReiRainhaStart() } else { onReplay(reshuffle) }
                    }) {
                        Text("Iniciar").font(.system(size: sz(14), weight: .bold))
                            .frame(maxWidth: .infinity, alignment: .leading)    // texto perto da divisa (centro)
                            .padding(.leading, sz(16))
                            .padding(.top, sz(4)).padding(.bottom, sz(5))
                            // Rei/Rainha ligado → Iniciar DOURADO (vai começar a série).
                            .background(state.rrSuggest && reshuffle ? Color(hex: 0xF59E0B) : Color(hex: 0x10B981))
                    }.buttonStyle(.plain)
                    .foregroundColor(state.rrSuggest && reshuffle ? Color(hex: 0x3A2600) : Color(hex: 0x04342C))
                }
                .padding(.horizontal, -sz(16))                 // estoura pra encostar nas bordas
            }
        } else {
            Text("Aguardando o celular…")
                .font(.system(size: sz(11))).foregroundColor(.spMetaDim).padding(.bottom, sz(10))
        }
    }

    // Placar final por lado (esquerda–direita) em GAMES (ex.: "6 – 4").
    private var finalScoreLine: String {
        return "\(state.gamesFor(leftTeam)) – \(state.gamesFor(rightTeam))"
    }
}

#Preview {
    RemoteView(state: .mock)
}
