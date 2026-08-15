import Foundation

/**
 * POSSE + DIÁRIO do relógio (Caminho B, fiação — docs/smartwatch-bridge.md).
 *
 * É a peça que responde a UMA pergunta a cada instante: **o que a tela desenha,
 * o motor LOCAL ou o espelho do celular?** — e que acumula o diário de eventos
 * enquanto o celular não está ouvindo (bolso, tela apagada, JS suspenso: a causa
 * do incidente de 13/ago, em que os toques enfileiravam e chegavam em rajada).
 *
 * REGRAS, e o porquê de cada uma:
 *
 * 1. **Sem `matchEpoch`/`scoring` no snapshot → motor local DESLIGADO.** É o app
 *    do celular antigo (o campo não existia). Comportamento = exatamente o de
 *    hoje (espelho), nunca pior.
 *
 * 2. **O motor local só arma no COMEÇO da partida.** Se o relógio chega no meio
 *    (0-0 já passou), ele espelha até a próxima partida. Semear um motor a
 *    partir de um snapshot seria uma superfície nova, fora dos vetores de
 *    paridade — ou seja, drift sem rede. O caso que importa (começar a partida e
 *    jogar com o celular guardado) tem o relógio presente desde o 0-0.
 *
 * 3. **Tocou no relógio → a posse é do relógio.** O evento entra no diário
 *    (numeração `n` por dispositivo) e a tela passa a desenhar o motor local:
 *    resposta imediata, sem ida e volta.
 *
 * 4. **Snapshot do celular que NÃO bate com o motor local → o motor local está
 *    velho (alguém pontuou no celular) → DESARMA e volta a espelhar.** Nunca
 *    mostrar um placar local errado: no pior caso o relógio degrada pro
 *    comportamento de hoje, que é conhecido.
 *
 * 5. **O diário NUNCA é limpo por adoção** — só por partida nova (época). O
 *    receptor do celular deduplica por `deviceId#n`, então reenviar é de graça
 *    e é o que garante entrega quando a conexão volta.
 */
final class WatchMatchSession {

    enum Owner { case phone, watch }

    /// Evento do diário, na forma que viaja pro celular.
    struct JournalEvent {
        let n: Int
        let t: Double          // epoch em ms (só registro; o celular não reordena por ele)
        let kind: String
        let team: Int?
        let playerIdx: Int?
        let rule: String?

        func asDictionary() -> [String: Any] {
            var d: [String: Any] = ["n": n, "t": t, "kind": kind]
            if let team = team { d["team"] = team }
            if let playerIdx = playerIdx { d["playerIdx"] = playerIdx }
            if let rule = rule { d["rule"] = rule }
            return d
        }
    }

    // ── estado da sessão ──
    private(set) var owner: Owner = .phone
    private(set) var engine: ScoreEngine? = nil
    private(set) var journal: [JournalEvent] = []
    private(set) var mirrored = ScoreState()      // último snapshot do celular
    private var epoch: String = ""
    private var nextN = 1
    /// Relógio de teste (o runner injeta um determinístico).
    var now: () -> Double = { Date().timeIntervalSince1970 * 1000 }

    init() {}

    /// O que a TELA desenha agora.
    var displayState: ScoreState {
        if owner == .watch, let e = engine, let s = try? Self.decode(e.snapshot(), like: mirrored) {
            return s
        }
        return mirrored
    }

    /// Diário pendente pro celular (`evlog`). Reenviar é idempotente de propósito.
    func pendingEvlog(deviceId: String) -> [String: Any]? {
        guard !journal.isEmpty, !epoch.isEmpty else { return nil }
        return ["v": 1, "type": "evlog", "deviceId": deviceId, "matchEpoch": epoch,
                "events": journal.map { $0.asDictionary() }]
    }

    // ── entrada: snapshot do celular ──
    func ingest(_ s: ScoreState) {
        // Partida NOVA (ou primeira): zera diário e decide se o motor local arma.
        if s.matchEpoch != epoch {
            epoch = s.matchEpoch
            journal.removeAll()
            nextN = 1
            owner = .phone
            engine = Self.armIfAtStart(s)
            mirrored = s
            return
        }
        mirrored = s
        // Regra 4: o celular andou por conta própria (alguém pontuou lá) e o
        // motor local ficou velho → desarma e volta a espelhar. Só compara
        // quando a posse é do relógio; com posse do celular já estamos
        // espelhando e não há o que decidir.
        if owner == .watch, let e = engine {
            if let mine = try? Self.decode(e.snapshot(), like: s), !Self.sameScore(mine, s) {
                // O celular ainda pode não ter visto o nosso diário: só desarma
                // se ele JÁ reproduziu tudo o que mandamos (senão a divergência
                // é a esperada, e some no próximo snapshot).
                if journalWasApplied(by: s) {
                    engine = nil
                    owner = .phone
                }
            } else {
                owner = .phone   // convergiu: o celular é a fonte de novo
            }
        }
    }

    // ── entrada: toque no relógio ──
    /// Aplica no motor local, registra no diário e passa a posse pro relógio.
    /// Devolve `false` quando não há motor local armado (o chamador cai no
    /// caminho antigo: manda a intenção unitária pro celular).
    @discardableResult
    func localEvent(_ ev: EngineEvent) -> Bool {
        guard let e = engine else { return false }
        e.apply(ev)
        journal.append(Self.journalEntry(ev, n: nextN, t: now()))
        nextN += 1
        owner = .watch
        seqAtLastLocalEvent = mirrored.seq   // régua do "o celular já teve chance"
        return true
    }

    // ── auxiliares ──

    /// Arma o motor local SÓ quando o snapshot é o começo da partida (regra 2).
    private static func armIfAtStart(_ s: ScoreState) -> ScoreEngine? {
        guard s.active, !s.isFinished, let sc = s.scoring, !s.matchEpoch.isEmpty else { return nil }
        let zeroed = s.games == [0, 0] && s.sets == [0, 0]
            && (s.points.first ?? "0") == "0" && (s.points.last ?? "0") == "0"
        guard zeroed else { return nil }
        var cfg = EngineConfig()
        cfg.type = sc.type
        cfg.setsToWin = sc.setsToWin
        cfg.gamesPerSet = sc.gamesPerSet
        cfg.tiebreakEnabled = sc.tiebreakEnabled
        cfg.tiebreakPoints = sc.tiebreakPoints
        cfg.tiebreakMargin = sc.tiebreakMargin
        cfg.superTiebreak = sc.superTiebreak
        cfg.superTiebreakPoints = sc.superTiebreakPoints
        cfg.countingType = sc.countingType
        cfg.deuceRule = sc.deuceRule
        cfg.twoPointAdvantage = sc.twoPointAdvantage
        cfg.tieRule = sc.tieRule
        cfg.fixedSet = sc.fixedSet
        cfg.fixedSetGames = sc.fixedSetGames
        let p1 = (s.teams["1"]?.players ?? []).joined(separator: "/")
        let p2 = (s.teams["2"]?.players ?? []).joined(separator: "/")
        guard !p1.isEmpty, !p2.isEmpty else { return nil }
        return ScoreEngine(config: cfg, p1Name: p1, p2Name: p2,
                           isDoubles: s.isDoubles, sportName: s.sportName, isCasual: s.isCasual)
    }

    /// O celular JÁ TEVE CHANCE de aplicar o nosso diário?
    ///
    /// Enquanto ele não teve, divergir é o ESPERADO (nossos eventos ainda não
    /// chegaram lá) e desarmar o motor local seria jogar fora o placar certo.
    /// A régua é o `seq` do celular, que ele incrementa a cada snapshot: um
    /// snapshot GERADO depois do nosso último toque tem seq maior que o que
    /// tínhamos naquele instante. Conservador de propósito — na dúvida, mantém
    /// o motor local (o pior caso do outro lado seria mostrar placar velho).
    private func journalWasApplied(by s: ScoreState) -> Bool {
        return journal.isEmpty || s.seq > seqAtLastLocalEvent
    }
    private var seqAtLastLocalEvent: Int = 0

    private static func journalEntry(_ ev: EngineEvent, n: Int, t: Double) -> JournalEvent {
        switch ev {
        case .point(let team):
            return JournalEvent(n: n, t: t, kind: "point", team: team, playerIdx: nil, rule: nil)
        case .undo:
            return JournalEvent(n: n, t: t, kind: "undo", team: nil, playerIdx: nil, rule: nil)
        case .serveSelect(let team, let idx):
            return JournalEvent(n: n, t: t, kind: "serveSelect", team: team, playerIdx: idx, rule: nil)
        case .serveConfirm:
            return JournalEvent(n: n, t: t, kind: "serveConfirm", team: nil, playerIdx: nil, rule: nil)
        case .resolveTie(let rule):
            return JournalEvent(n: n, t: t, kind: "resolveTie", team: nil, playerIdx: nil, rule: rule)
        }
    }

    /// Snapshot do motor (dicionário) → ScoreState, PELO MESMO decoder do
    /// snapshot do celular. Um caminho só de construção — não há segunda forma
    /// de montar a tela. Os campos que o motor não conhece (matchEpoch, scoring,
    /// hrMax, seq) vêm do espelho, que é quem os recebe.
    static func decode(_ dict: [String: Any], like mirror: ScoreState) throws -> ScoreState {
        var d = dict
        d["matchEpoch"] = mirror.matchEpoch
        d["hrMax"] = mirror.hrMax
        d["seq"] = mirror.seq
        d["epoch"] = mirror.epoch
        // ⚠️ CONHECIMENTO QUE É DO CELULAR, NÃO DO MOTOR (v1.8.71). O motor local
        // sabe o PLACAR desta partida; ele não tem como saber o que aconteceu nas
        // partidas ANTERIORES da sessão — e é disso que sai a série Rei/Rainha
        // (2 pares distintos já jogados entre os mesmos 4 ⇒ sugere o 3º). Sem
        // repassar, o toggle "👑 Rei/Rainha" SUMIA da tela de fim assim que a
        // posse era do relógio: defeito que a fiação introduziu, relatado pelo
        // dono ("depois de rodar 2 sets com parceiros diferentes deveria sugerir").
        // `canReplay` idem: no celular ele é `isCasual && !reiRainhaMode`.
        d["rrSuggest"] = mirror.rrSuggest
        d["reiRainha"] = mirror.reiRainha
        d["rrRound"] = mirror.rrRound
        d["rrStandings"] = mirror.rrStandings.map { ["name": $0.name, "wins": $0.wins] }
        d["canReplay"] = mirror.canReplay
        // Os 3 interruptores da tela de fim são do CELULAR (🎲 é local, mas
        // 👑/⚥ são configuração da sessão). O motor local não os conhece —
        // sem carregar do espelho, o relógio apagaria as chaves ao assumir.
        d["shuffleOn"] = mirror.shuffleOn
        d["mixedOn"] = mirror.mixedOn
        d["canMix"] = mirror.canMix
        let data = try JSONSerialization.data(withJSONObject: d)
        return try JSONDecoder().decode(ScoreState.self, from: data)
    }

    /// Igualdade de PLACAR (não do snapshot inteiro: seq/epoch/hrMax mudam sem
    /// que nada do jogo tenha mudado).
    static func sameScore(_ a: ScoreState, _ b: ScoreState) -> Bool {
        return a.points == b.points && a.games == b.games && a.sets == b.sets
            && a.isTiebreak == b.isTiebreak && a.isFinished == b.isFinished
            && a.winner == b.winner && a.tieRulePending == b.tieRulePending
            && a.servePickOpen == b.servePickOpen && a.courtLeft == b.courtLeft
            && (a.server?.team) == (b.server?.team) && (a.server?.name) == (b.server?.name)
    }
}
