import Foundation

/**
 * MOTOR DE PONTUAÇÃO NATIVO do relógio (Caminho B, Leva 2) — transliteração 1:1
 * do motor GSM do celular (js/views/bracket-ui.js, placar ao vivo).
 *
 * ⚠️ ESTE ARQUIVO NÃO INVENTA REGRA NENHUMA. Cada função espelha a homônima do
 * JS (as referências de linha apontam pro bracket-ui.js): _addPoint,
 * _checkGameWon, _checkSetWon, _finishSet, _formatGamePoint, _getCurrentServer,
 * _liveSetServer, _liveServeConfirm, _liveResolveTie, _liveScoreUndoLastPoint e
 * o snapshot _getLiveScoreState. Quem prova a igualdade são os VETORES DE
 * PARIDADE (tests/watch-engine/vectors/), gerados do motor JS REAL e
 * re-executados aqui por tests/watch-engine/run-swift-parity.sh — divergiu,
 * fica vermelho. Mudou o motor JS? Regrave os vetores e rode a paridade de novo
 * (é o contrato de docs/smartwatch-bridge.md, seção "Caminho B").
 *
 * O motor é um FOLD puro sobre eventos (ponto, desfazer, escolha de sacador,
 * decisão de empate) → snapshot no MESMO contrato que o celular emite hoje
 * (ScoreState) — é isso que preserva as telas do relógio sem tocar em nada.
 * Event-sourcing: o diário de eventos é a verdade; o placar oficial continua
 * saindo do motor JS canônico reproduzindo o diário no celular.
 */

// ── Config resolvida (espelho do scoring resolvido por _resolveLiveScoring) ──
public struct EngineConfig {
    public var type: String = "sets"
    public var setsToWin = 1
    public var gamesPerSet = 6
    public var tiebreakEnabled = true
    public var tiebreakPoints = 7
    public var tiebreakMargin = 2
    public var superTiebreak = false
    public var superTiebreakPoints = 10
    public var countingType = "numeric"
    public var advantageRule = false
    public var deuceRule: Bool? = nil          // explícito vence o legado advantageRule
    public var twoPointAdvantage: Bool? = nil  // default ON
    public var tieRule: String? = nil          // casual sem regra → 'ask'
    public var fixedSet = false
    public var fixedSetGames: Int? = nil

    public init() {}
    /// Constrói do dicionário JSON do scoring resolvido (o `config` dos vetores).
    public init(json: [String: Any]) {
        type = (json["type"] as? String) ?? ""
        setsToWin = (json["setsToWin"] as? Int) ?? 1
        gamesPerSet = (json["gamesPerSet"] as? Int) ?? 6
        tiebreakEnabled = (json["tiebreakEnabled"] as? Bool) ?? true
        tiebreakPoints = (json["tiebreakPoints"] as? Int) ?? 7
        tiebreakMargin = (json["tiebreakMargin"] as? Int) ?? 2
        superTiebreak = (json["superTiebreak"] as? Bool) ?? false
        superTiebreakPoints = (json["superTiebreakPoints"] as? Int) ?? 10
        countingType = (json["countingType"] as? String) ?? "numeric"
        advantageRule = (json["advantageRule"] as? Bool) ?? false
        deuceRule = json["deuceRule"] as? Bool
        twoPointAdvantage = json["twoPointAdvantage"] as? Bool
        tieRule = json["tieRule"] as? String
        fixedSet = (json["fixedSet"] as? Bool) ?? false
        fixedSetGames = json["fixedSetGames"] as? Int
    }
}

// ── Evento do diário (contrato do Caminho B) ──
public enum EngineEvent {
    case point(team: Int)
    case undo
    case serveSelect(team: Int, idx: Int)
    case serveConfirm
    case resolveTie(rule: String)
}

public final class ScoreEngine {
    // ── estado (espelho de `state` do JS, bracket-ui.js:4156) ──
    struct SetScore { var gamesP1 = 0; var gamesP2 = 0; var tbP1: Int? = nil; var tbP2: Int? = nil }
    struct ServeSlot { var team: Int; var name: String }
    struct State {
        var sets: [SetScore] = [SetScore()]
        var currentGameP1 = 0
        var currentGameP2 = 0
        var isTiebreak = false
        var isFinished = false
        var winner: Int? = nil
        var tieRule: String? = nil
        var tieRulePending = false
        var tiebreakPoints: Int = 7            // mutável (regra 'supertiebreak' o troca)
        var serveOrder: [ServeSlot] = []
        var serveSkipped = false
        var secondServerPicked = false
        var totalGamesPlayed = 0
    }

    // config imutável (bracket-ui.js:4165-4184)
    let useSets: Bool
    let setsToWin: Int
    let gamesPerSet: Int
    let tiebreakEnabled: Bool
    let tiebreakMargin: Int
    let superTiebreak: Bool
    let superTiebreakPoints: Int
    let countingType: String
    let deuceRule: Bool
    let twoPointAdvantage: Bool
    let isFixedSet: Bool
    let fixedSetGames: Int

    let p1Players: [String]
    let p2Players: [String]
    let isDoubles: Bool
    let isCasual: Bool
    let sportName: String

    var state = State()
    /// jogador ACESO no seletor de sacador (closure var `_pickerSel` no JS —
    /// fica FORA de `state` de propósito: o undo não o restaura, igual lá).
    var pickerSel: (team: Int, idx: Int)? = nil
    /// pilha do desfazer (cópias do estado ANTES de cada ponto; janela de 30)
    var undoStack: [State] = []
    /// Com "fixar lados" DESLIGADO (o default), o lado esquerdo SEGUE O SACADOR —
    /// bracket-ui.js:6791: `_courtLeft = serverInfo.team`, atualizado no render do
    /// placar (as telas de picker/empate/fim retornam ANTES e congelam o lado).
    var courtLeft = 1

    public init(config: EngineConfig, p1Name: String, p2Name: String,
                isDoubles: Bool, sportName: String, isCasual: Bool = true) {
        func split(_ s: String) -> [String] {
            if let r = s.range(of: "/"), r.lowerBound > s.startIndex {
                return s.split(separator: "/").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            }
            let t = s.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? [] : [t]
        }
        var p1 = split(p1Name), p2 = split(p2Name)
        let dbl = p1.count > 1 || p2.count > 1 || isDoubles
        // placeholders posicionais (bracket-ui.js:4934) — Jogador 1..4
        if dbl {
            if p1.isEmpty { p1 = ["Jogador 1", "Jogador 2"] }
            if p1.count == 1 { p1.append("Jogador 2") }
            if p2.isEmpty { p2 = ["Jogador 3", "Jogador 4"] }
            if p2.count == 1 { p2.append("Jogador 4") }
        } else {
            if p1.isEmpty { p1 = ["Jogador 1"] }
            if p2.isEmpty { p2 = ["Jogador 2"] }
        }
        self.p1Players = p1
        self.p2Players = p2
        self.isDoubles = dbl
        self.isCasual = isCasual
        self.sportName = sportName

        self.useSets = config.type == "sets"
        self.setsToWin = useSets ? max(config.setsToWin, 1) : 1
        self.gamesPerSet = useSets ? max(config.gamesPerSet, 1) : 1
        self.tiebreakEnabled = useSets ? config.tiebreakEnabled : false
        self.tiebreakMargin = useSets ? max(config.tiebreakMargin, 1) : 2
        self.superTiebreak = useSets ? config.superTiebreak : false
        self.superTiebreakPoints = useSets ? config.superTiebreakPoints : 10
        self.countingType = useSets ? config.countingType : "numeric"
        self.deuceRule = useSets ? (config.deuceRule ?? config.advantageRule) : false
        self.twoPointAdvantage = useSets ? (config.twoPointAdvantage ?? true) : false
        self.isFixedSet = useSets && config.fixedSet
        self.fixedSetGames = isFixedSet ? (config.fixedSetGames ?? config.gamesPerSet) : 0

        state.tiebreakPoints = useSets ? config.tiebreakPoints : 7
        state.tieRule = config.tieRule ?? (isCasual ? "ask" : nil)
        render()   // o open renderiza: picker abre com o 1º pré-selecionado
    }

    // ── aplica um evento do diário ──
    public func apply(_ ev: EngineEvent) {
        switch ev {
        case .point(let team): addPoint(team)
        case .undo: undoLastPoint()
        case .serveSelect(let team, let idx):
            pickerSel = (team, idx)      // JS: _liveServeSelect
        case .serveConfirm: serveConfirm()
        case .resolveTie(let rule): resolveTie(rule)
        }
        render()   // todo entry point do JS termina em _render()
    }

    /// Espelho dos EFEITOS DE ESTADO do `_render()` do JS: (a) o picker revalida
    /// o pré-selecionado; (b) fora de picker/empate/fim, o lado esquerdo segue o
    /// time do sacador (bracket-ui.js:6791 — fixSides OFF é o default do casual).
    func render() {
        syncPicker()
        if !needsServePick() && !state.tieRulePending && !(state.isFinished && state.winner != nil) {
            if let srv = currentServer(), srv.team == 1 || srv.team == 2 {
                courtLeft = srv.team
            }
        }
    }

    // ── _needsServePick (bracket-ui.js:5423) ──
    func needsServePick() -> Bool {
        if state.serveSkipped { return false }
        if state.isFinished || state.tieRulePending { return false }
        if state.totalGamesPlayed == 0 && state.serveOrder.isEmpty { return true }
        if isDoubles && state.totalGamesPlayed == 1 && state.serveOrder.count >= 2 && !state.secondServerPicked { return true }
        return false
    }

    // jogadores do seletor (JS: _servePickerPlayers) — fase 0: todos; fase 1: o time do 2º saque
    func pickerPlayers() -> [(team: Int, idx: Int)] {
        guard needsServePick() else { return [] }
        var out: [(Int, Int)] = []
        if state.totalGamesPlayed == 0 {
            for i in p1Players.indices { out.append((1, i)) }
            for i in p2Players.indices { out.append((2, i)) }
            return out
        }
        guard state.serveOrder.count >= 2 else { return [] }
        let t = state.serveOrder[1].team
        let ps = t == 1 ? p1Players : p2Players
        for i in ps.indices { out.append((t, i)) }
        return out
    }

    // pré-seleção (JS: _showServePickerOverlay) — mantém a atual se válida; senão o 1º
    func syncPicker() {
        let players = pickerPlayers()
        guard !players.isEmpty else { return }
        if let sel = pickerSel, players.contains(where: { $0.team == sel.team && $0.idx == sel.idx }) { return }
        pickerSel = players[0]
    }

    // ── _liveServeConfirm (bracket-ui.js:5689) ──
    func serveConfirm() {
        guard let sel = pickerSel else { return }
        if !isDoubles {
            let otherTeam = sel.team == 1 ? 2 : 1
            let mine = sel.team == 1 ? p1Players : p2Players
            let srvName = sel.idx < mine.count ? mine[sel.idx] : ""
            let others = otherTeam == 1 ? p1Players : p2Players
            state.serveOrder = [ServeSlot(team: sel.team, name: srvName),
                                ServeSlot(team: otherTeam, name: others.first ?? "")]
            state.secondServerPicked = true
            return
        }
        if state.totalGamesPlayed == 1 { state.secondServerPicked = true }
        setServer(team: sel.team, playerIdx: sel.idx)
    }

    // ── _liveSetServer (bracket-ui.js:5826) ──
    func setServer(team: Int, playerIdx: Int) {
        if state.totalGamesPlayed >= 2 { return }        // HARD LOCK
        let players = team == 1 ? p1Players : p2Players
        guard playerIdx < players.count else { return }
        let name = players[playerIdx]
        if state.totalGamesPlayed == 0 {
            var teammate: String? = nil
            for p in players where p != name { teammate = p; break }
            let otherTeam = team == 1 ? 2 : 1
            let opponents = otherTeam == 1 ? p1Players : p2Players
            state.serveOrder = [
                ServeSlot(team: team, name: name),
                ServeSlot(team: otherTeam, name: opponents.count > 0 ? opponents[0] : "Jogador \(otherTeam == 1 ? 1 : 3)"),
                ServeSlot(team: team, name: teammate ?? "Jogador \(team == 1 ? 2 : 4)"),
                ServeSlot(team: otherTeam, name: opponents.count > 1 ? opponents[1] : "Jogador \(otherTeam == 1 ? 2 : 4)")
            ]
        } else if state.totalGamesPlayed == 1 {
            guard state.serveOrder.count >= 4, state.serveOrder[1].team == team else { return }
            var other: String? = nil
            for p in players where p != name { other = p; break }
            state.serveOrder[1] = ServeSlot(team: team, name: name)
            state.serveOrder[3] = ServeSlot(team: team, name: other ?? state.serveOrder[3].name)
        }
    }

    // ── _liveResolveTie (bracket-ui.js:4533) — casual: sempre pode decidir ──
    func resolveTie(_ rule: String) {
        guard rule == "extend" || rule == "tiebreak" else { return }
        state.tieRulePending = false
        if rule == "tiebreak" {
            state.tieRule = "tiebreak"
            state.isTiebreak = true
            state.currentGameP1 = 0
            state.currentGameP2 = 0
        }
        // 'extend' NÃO fixa a regra: mantém 'ask' pra reperguntar no próximo empate
    }

    // ── _isDecidingSet / _currentSet / _setsWon (bracket-ui.js:4299-4319) ──
    func isDecidingSet() -> Bool {
        superTiebreak && state.sets.count == setsToWin * 2 - 1
    }
    func setsWon(_ player: Int, includeAll: Bool) -> Int {
        var count = 0
        let limit = includeAll ? state.sets.count : state.sets.count - 1
        for i in 0..<max(limit, 0) {
            let s = state.sets[i]
            if player == 1 && s.gamesP1 > s.gamesP2 { count += 1 }
            if player == 2 && s.gamesP2 > s.gamesP1 { count += 1 }
        }
        return count
    }

    // ── _formatGamePoint (bracket-ui.js:4322) ──
    func formatGamePoint(_ pts: Int, _ oppPts: Int, isTb: Bool) -> String {
        if isTb { return String(pts) }
        if countingType == "tennis" && !isFixedSet {
            if pts >= 3 && oppPts >= 3 {
                if deuceRule {
                    if pts == oppPts { return "40" }
                    if pts > oppPts { return "AD" }
                    return "40"
                }
                return "40"
            }
            let map = [0, 15, 30, 40]
            return String(pts < 4 ? map[pts] : 40)
        }
        return String(pts)
    }

    // ── _checkGameWon (bracket-ui.js:4341) ──
    func checkGameWon() -> Int {
        let p1 = state.currentGameP1, p2 = state.currentGameP2
        if state.isTiebreak || isDecidingSet() {
            let tbPts = isDecidingSet() ? superTiebreakPoints : state.tiebreakPoints
            let margin = tiebreakMargin
            if p1 >= tbPts && p1 - p2 >= margin { return 1 }
            if p2 >= tbPts && p2 - p1 >= margin { return 2 }
            return 0
        }
        if isFixedSet {
            if p1 + p2 >= fixedSetGames { return p1 > p2 ? 1 : (p2 > p1 ? 2 : 0) }
            return 0
        }
        if countingType == "tennis" {
            if !deuceRule {
                if p1 >= 4 { return 1 }
                if p2 >= 4 { return 2 }
                return 0
            }
            if p1 >= 4 && p1 - p2 >= 2 { return 1 }
            if p2 >= 4 && p2 - p1 >= 2 { return 2 }
            return 0
        }
        if p1 > p2 { return 1 }
        if p2 > p1 { return 2 }
        return 0
    }

    // ── _checkSetWon (bracket-ui.js:4384) ── retorna 1/2 vencedor · 0 nada ·
    // -1 entrou em tiebreak · -2 pausado esperando a decisão do empate
    func checkSetWon() -> Int {
        let cs = state.sets[state.sets.count - 1]
        let g = gamesPerSet
        if isFixedSet { return 0 }
        if isDecidingSet() { return 0 }
        if !twoPointAdvantage {
            if cs.gamesP1 >= g { return 1 }
            if cs.gamesP2 >= g { return 2 }
            return 0
        }
        if let rule = state.tieRule, cs.gamesP1 == cs.gamesP2 && cs.gamesP1 >= g - 1 {
            if rule == "ask" && !state.tieRulePending {
                state.tieRulePending = true
                return -2
            }
            // rule == "extend": segue pro check padrão de 2 de vantagem
            if rule == "tiebreak" {
                state.isTiebreak = true
                state.currentGameP1 = 0
                state.currentGameP2 = 0
                return -1
            }
            if rule == "supertiebreak" {
                state.isTiebreak = true
                state.tiebreakPoints = superTiebreakPoints
                state.currentGameP1 = 0
                state.currentGameP2 = 0
                return -1
            }
        }
        if state.tieRule == "extend" {
            if cs.gamesP1 >= g && cs.gamesP1 - cs.gamesP2 >= 2 { return 1 }
            if cs.gamesP2 >= g && cs.gamesP2 - cs.gamesP1 >= 2 { return 2 }
            return 0
        }
        if cs.gamesP1 >= g && cs.gamesP1 - cs.gamesP2 >= 2 { return 1 }
        if cs.gamesP2 >= g && cs.gamesP2 - cs.gamesP1 >= 2 { return 2 }
        if tiebreakEnabled && cs.gamesP1 == g - 1 && cs.gamesP2 == g - 1 {
            state.isTiebreak = true
            state.currentGameP1 = 0
            state.currentGameP2 = 0
            return -1
        }
        return 0
    }

    // ── _finishSet (bracket-ui.js:4765) — sem os efeitos de persistência ──
    func finishSet(_ setWinner: Int) {
        state.currentGameP1 = 0
        state.currentGameP2 = 0
        state.isTiebreak = false
        var matchWinner = 0
        if setsWon(1, includeAll: true) >= setsToWin { matchWinner = 1 }
        else if setsWon(2, includeAll: true) >= setsToWin { matchWinner = 2 }
        if matchWinner > 0 || (!useSets && isFixedSet) {
            if isFixedSet { matchWinner = setWinner }
            state.isFinished = true
            state.winner = matchWinner
        } else {
            state.sets.append(SetScore())
        }
    }

    // ── _addPoint (bracket-ui.js:4597) — o fold ──
    func addPoint(_ player: Int) {
        if state.isFinished { return }
        if state.tieRulePending { return }
        if needsServePick() { return }   // render() do apply reabre o picker

        undoStack.append(state)                    // snapshot ANTES da mutação
        if undoStack.count > 30 { undoStack.removeFirst() }

        if player == 1 { state.currentGameP1 += 1 } else { state.currentGameP2 += 1 }

        if !useSets || isFixedSet {
            if isFixedSet {
                let i = state.sets.count - 1
                if player == 1 { state.sets[i].gamesP1 = state.currentGameP1 }
                else { state.sets[i].gamesP2 = state.currentGameP2 }
                if state.currentGameP1 + state.currentGameP2 >= fixedSetGames {
                    if state.currentGameP1 == state.currentGameP2 && tiebreakEnabled {
                        state.isTiebreak = true
                        state.currentGameP1 = 0
                        state.currentGameP2 = 0
                    } else {
                        finishSet(state.currentGameP1 > state.currentGameP2 ? 1 : 2)
                    }
                }
            }
            return
        }

        let gameWinner = checkGameWon()
        if gameWinner > 0 {
            let i = state.sets.count - 1
            if state.isTiebreak {
                state.sets[i].tbP1 = state.currentGameP1
                state.sets[i].tbP2 = state.currentGameP2
                if gameWinner == 1 { state.sets[i].gamesP1 += 1 } else { state.sets[i].gamesP2 += 1 }
                state.isTiebreak = false
                finishSet(gameWinner)
            } else if isDecidingSet() {
                state.sets[i].tbP1 = state.currentGameP1
                state.sets[i].tbP2 = state.currentGameP2
                if gameWinner == 1 { state.sets[i].gamesP1 += 1 } else { state.sets[i].gamesP2 += 1 }
                finishSet(gameWinner)
            } else {
                if gameWinner == 1 { state.sets[i].gamesP1 += 1 } else { state.sets[i].gamesP2 += 1 }
                state.currentGameP1 = 0
                state.currentGameP2 = 0
                state.totalGamesPlayed += 1
                let setResult = checkSetWon()
                if setResult > 0 { finishSet(setResult) }
            }
        }
    }

    // ── _liveScoreUndoLastPoint (bracket-ui.js:8656) ──
    func undoLastPoint() {
        if state.tieRulePending { return }
        guard let snap = undoStack.popLast() else { return }
        state = snap          // atravessa game/set/FIM — o snapshot restaura tudo
    }

    // ── _getCurrentServer (bracket-ui.js:5447) ──
    func currentServer() -> ServeSlot? {
        if state.serveSkipped || state.serveOrder.isEmpty { return nil }
        var idx: Int
        if state.isTiebreak || isDecidingSet() {
            let totalPts = state.currentGameP1 + state.currentGameP2
            let tbOffset = totalPts == 0 ? 0 : (totalPts + 1) / 2
            idx = (state.totalGamesPlayed + tbOffset) % state.serveOrder.count
        } else {
            idx = state.totalGamesPlayed % state.serveOrder.count
        }
        return idx < state.serveOrder.count ? state.serveOrder[idx] : nil
    }

    // ── _serveEligibleNow (bracket-ui.js:5400) ──
    func serveEligibleNow() -> [(team: Int, playerIdx: Int, name: String)] {
        if state.serveSkipped || !isDoubles || state.isFinished { return [] }
        if state.totalGamesPlayed >= 2 { return [] }
        var out: [(Int, Int, String)] = []
        if state.totalGamesPlayed == 0 {
            for (i, n) in p1Players.enumerated() where !n.isEmpty { out.append((1, i, n)) }
            for (i, n) in p2Players.enumerated() where !n.isEmpty { out.append((2, i, n)) }
            return out
        }
        guard state.serveOrder.count >= 4 else { return [] }
        let t = state.serveOrder[1].team
        let ps = t == 1 ? p1Players : p2Players
        for (i, n) in ps.enumerated() where !n.isEmpty { out.append((t, i, n)) }
        return out
    }

    // ── _watchShortNames (bracket-ui.js:8401) ──
    static func watchShortNames(_ names: [String]) -> [String: String] {
        func first(_ n: String) -> String {
            let parts = n.trimmingCharacters(in: .whitespaces).split(separator: " ", omittingEmptySubsequences: true)
            return parts.first.map(String.init) ?? n
        }
        func lastIni(_ n: String) -> String {
            let parts = n.trimmingCharacters(in: .whitespaces).split(separator: " ", omittingEmptySubsequences: true)
            guard parts.count > 1, let c = parts.last?.first else { return "" }
            return String(c).uppercased()
        }
        var map: [String: String] = [:]
        var firstCount: [String: Int] = [:]
        for n in names {
            let f = first(n).lowercased()
            if !f.isEmpty { firstCount[f, default: 0] += 1 }
        }
        for n in names {
            if map[n] != nil { continue }
            let f = first(n)
            if (firstCount[f.lowercased()] ?? 0) > 1 {
                let li = lastIni(n)
                map[n] = li.isEmpty ? f : (f + " " + li)
            } else {
                map[n] = f
            }
        }
        var shortCount: [String: Int] = [:]
        for (_, v) in map { shortCount[v.lowercased(), default: 0] += 1 }
        for (k, v) in map where (shortCount[v.lowercased()] ?? 0) > 1 { map[k] = k }
        return map
    }

    // ── _getLiveScoreState (bracket-ui.js:8439) — o contrato das telas ──
    public func snapshot() -> [String: Any] {
        let cs = state.sets[state.sets.count - 1]
        let srv = currentServer()
        let wnMap = ScoreEngine.watchShortNames(p1Players + p2Players)
        func wn(_ n: String) -> String {
            if let m = wnMap[n] { return m }
            let parts = n.trimmingCharacters(in: .whitespaces).split(separator: " ")
            return parts.first.map(String.init) ?? n
        }
        let elig = serveEligibleNow().map { ["team": $0.team, "playerIdx": $0.playerIdx, "name": wn($0.name)] as [String: Any] }
        // servePickCurrent (bracket-ui.js:8449): com o picker aberto, o ACESO;
        // senão, quem ocupa o slot do game atual na serveOrder
        var spCurRaw = ""
        if needsServePick(), let sel = pickerSel {
            let arr = sel.team == 1 ? p1Players : p2Players
            if sel.idx < arr.count { spCurRaw = arr[sel.idx] }
        }
        if spCurRaw.isEmpty && state.totalGamesPlayed < state.serveOrder.count {
            spCurRaw = state.serveOrder[state.totalGamesPlayed].name
        }
        var snap: [String: Any] = [
            "v": 1,
            "type": "state",
            "active": !state.isFinished,
            "setLabel": "Set \(state.sets.count)",
            "points": [formatGamePoint(state.currentGameP1, state.currentGameP2, isTb: state.isTiebreak),
                       formatGamePoint(state.currentGameP2, state.currentGameP1, isTb: state.isTiebreak)],
            "games": [cs.gamesP1, cs.gamesP2],
            "isTiebreak": state.isTiebreak,
            "courtLeft": courtLeft,
            "teams": ["1": ["players": p1Players.map(wn)],
                      "2": ["players": p2Players.map(wn)]],
            "sets": [setsWon(1, includeAll: state.isFinished), setsWon(2, includeAll: state.isFinished)],
            "setsToWin": setsToWin,
            "canReplay": isCasual,           // (sem Rei/Rainha no motor do relógio)
            "isCasual": isCasual,
            "sportName": sportName,
            "reiRainha": false,
            "rrRound": 0,
            "rrStandings": [Any](),
            "isDoubles": isDoubles,
            "rrSuggest": false,              // exige 2 pares distintos na sessão — 1 par ⇒ false
            "canSetServer": !elig.isEmpty,
            "serveEligible": elig,
            "servePickPhase": !elig.isEmpty ? state.totalGamesPlayed : -1,
            "servePickOpen": needsServePick(),
            "servePickCurrent": wn(spCurRaw),
            "isFinished": state.isFinished,
            "tieRulePending": state.tieRulePending
        ]
        snap["server"] = srv.map { ["team": $0.team, "name": wn($0.name)] as [String: Any] } ?? NSNull()
        snap["winner"] = state.winner ?? NSNull()
        snap["tiedAt"] = state.tieRulePending ? cs.gamesP1 : NSNull()
        return snap
    }
}
