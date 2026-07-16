import Foundation

// Modelo do snapshot recebido do celular (contrato docs/smartwatch-bridge.md).
// TUDO indexado por TIME (1/2), nunca por lado — o relógio mapeia time→lado com
// `courtLeft`. As strings de exibição do ponto ("15/30/40/Ad", número no
// tie-break) vêm PRONTAS do motor GSM (fonte única no JS); o relógio só desenha.
struct ScoreState: Decodable {
    var v: Int = 1
    var seq: Int = 0
    var active: Bool = false
    var setLabel: String = ""
    var points: [String] = ["–", "–"]   // [time1, time2]
    var games: [Int] = [0, 0]           // [time1, time2]
    var isTiebreak: Bool = false
    var courtLeft: Int = 1              // qual TIME está à esquerda
    var server: Server? = nil
    var teams: [String: Team] = [:]     // "1"/"2" → jogadores
    var sets: [Int] = [0, 0]            // sets ganhos [time1, time2]
    var setsToWin: Int = 1              // melhor-de-N (1 = set único, ex. Beach Tennis)
    var canReplay: Bool = false         // partida casual → oferece "Jogar novamente"
    var isDoubles: Bool = false         // duplas → oferece o toggle "Re-sortear duplas"
    var isFinished: Bool = false
    var winner: Int? = nil
    var tieRulePending: Bool = false    // empate esperando decisão (prorrogar/tie-break)
    var tiedAt: Int? = nil              // games empatados (5, 6, 7…) no momento do prompt
    // Montagem da partida casual aberta no celular → o relógio oferece "Iniciar"
    // em vez de só "Aguardando…". Vem do lobby, não do motor GSM.
    var canStart: Bool = false
    var sportName: String = ""          // modalidade do lobby (ex. "Beach Tennis")
    // A ordem de saque ainda pode mudar (duplas, 2 primeiros jogos). Espelha o
    // _canDragServe do celular; o hard lock de verdade vive no motor.
    var canSetServer: Bool = false
    // Quem pode ser escolhido AGORA — lista pronta, vinda do celular (regra em
    // _serveEligibleNow). O relógio NUNCA deriva isso: no 2º game só o time que
    // não abriu o saque é aceito, e oferecer o outro dava botão morto.
    var serveEligible: [ServeSlot] = []
    // 0 = escolhendo quem ABRE o saque · 1 = confirmando o 2º saque do set
    // · -1 = travado. A MUDANÇA de fase é o gatilho da confirmação no relógio.
    var servePickPhase: Int = -1
    // Quem OCUPA o slot em disputa agora. O seletor abre com este nome já aceso,
    // então "Confirmar" sem tocar em nada = manter o que o motor já assumiu.
    var servePickCurrent: String = ""

    struct ServeSlot: Decodable, Hashable {
        let team: Int
        let playerIdx: Int
        let name: String
    }

    struct Server: Decodable { let team: Int; let name: String }
    struct Team: Decodable { let players: [String] }

    // Decoding tolerante: o snapshot sempre traz as chaves-base, mas `server` e
    // `winner` podem vir null e chaves opcionais (sets/matchId) podem faltar.
    enum CodingKeys: String, CodingKey {
        case v, seq, active, setLabel, points, games, isTiebreak, courtLeft, server, teams, sets, setsToWin, canReplay, isDoubles, isFinished, winner, tieRulePending, tiedAt
        case canStart, sportName, canSetServer, serveEligible, servePickPhase, servePickCurrent
    }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        v          = (try? c.decodeIfPresent(Int.self, forKey: .v)) ?? 1
        seq        = (try? c.decodeIfPresent(Int.self, forKey: .seq)) ?? 0
        active     = (try? c.decodeIfPresent(Bool.self, forKey: .active)) ?? false
        setLabel   = (try? c.decodeIfPresent(String.self, forKey: .setLabel)) ?? ""
        points     = (try? c.decodeIfPresent([String].self, forKey: .points)) ?? ["–", "–"]
        games      = (try? c.decodeIfPresent([Int].self, forKey: .games)) ?? [0, 0]
        isTiebreak = (try? c.decodeIfPresent(Bool.self, forKey: .isTiebreak)) ?? false
        courtLeft  = (try? c.decodeIfPresent(Int.self, forKey: .courtLeft)) ?? 1
        server     = (try? c.decodeIfPresent(Server.self, forKey: .server)) ?? nil
        teams      = (try? c.decodeIfPresent([String: Team].self, forKey: .teams)) ?? [:]
        sets       = (try? c.decodeIfPresent([Int].self, forKey: .sets)) ?? [0, 0]
        setsToWin  = (try? c.decodeIfPresent(Int.self, forKey: .setsToWin)) ?? 1
        canReplay  = (try? c.decodeIfPresent(Bool.self, forKey: .canReplay)) ?? false
        isDoubles  = (try? c.decodeIfPresent(Bool.self, forKey: .isDoubles)) ?? false
        isFinished = (try? c.decodeIfPresent(Bool.self, forKey: .isFinished)) ?? false
        winner     = (try? c.decodeIfPresent(Int.self, forKey: .winner)) ?? nil
        tieRulePending = (try? c.decodeIfPresent(Bool.self, forKey: .tieRulePending)) ?? false
        tiedAt     = (try? c.decodeIfPresent(Int.self, forKey: .tiedAt)) ?? nil
        canStart   = (try? c.decodeIfPresent(Bool.self, forKey: .canStart)) ?? false
        sportName  = (try? c.decodeIfPresent(String.self, forKey: .sportName)) ?? ""
        canSetServer = (try? c.decodeIfPresent(Bool.self, forKey: .canSetServer)) ?? false
        serveEligible = (try? c.decodeIfPresent([ServeSlot].self, forKey: .serveEligible)) ?? []
        servePickPhase = (try? c.decodeIfPresent(Int.self, forKey: .servePickPhase)) ?? -1
        servePickCurrent = (try? c.decodeIfPresent(String.self, forKey: .servePickCurrent)) ?? ""
    }

    // ── Acessores por TIME (1/2) ──
    var leftTeam: Int { courtLeft == 2 ? 2 : 1 }
    var rightTeam: Int { leftTeam == 1 ? 2 : 1 }
    func point(_ team: Int) -> String {
        let i = team - 1
        return (i >= 0 && i < points.count) ? points[i] : "–"
    }
    func gamesFor(_ team: Int) -> Int {
        let i = team - 1
        return (i >= 0 && i < games.count) ? games[i] : 0
    }
    func setsFor(_ team: Int) -> Int {
        let i = team - 1
        return (i >= 0 && i < sets.count) ? sets[i] : 0
    }
    func players(_ team: Int) -> [String] { teams[String(team)]?.players ?? [] }
    func isServing(_ team: Int) -> Bool { server?.team == team }
    var serverName: String { server?.name ?? "" }
    // Mostra a linha de sets só em melhor-de-N (setsToWin>1); em set único
    // (Beach Tennis/Pickleball) o placar de games já basta.
    var showsSets: Bool { setsToWin > 1 }
    // Nomes do time vencedor (para a tela de fim de jogo); vazio se empate/aberto.
    var winnerNames: [String] { (winner == 1 || winner == 2) ? players(winner!) : [] }

    // Lobby aberto no celular, nada ao vivo → o relógio oferece "Iniciar".
    static var mockLobby: ScoreState {
        var s = ScoreState()
        s.active = false
        s.canStart = true
        s.sportName = "Beach Tennis"
        s.isDoubles = true
        s.teams = [
            "1": Team(players: ["Rodrigo Barth", "Jogador 2"]),
            "2": Team(players: ["Jogador 3", "Jogador 4"])
        ]
        return s
    }

    // Fase 0 — escolhendo quem ABRE o saque: os 4 nomes.
    static var mockServe: ScoreState {
        var s = ScoreState.mock
        s.canSetServer = true
        s.isDoubles = true
        s.servePickPhase = 0
        s.servePickCurrent = "Jogador 01"
        s.serveEligible = [
            ServeSlot(team: 1, playerIdx: 0, name: "Jogador 01"),
            ServeSlot(team: 1, playerIdx: 1, name: "Jogador 02"),
            ServeSlot(team: 2, playerIdx: 0, name: "Jogador 03"),
            ServeSlot(team: 2, playerIdx: 1, name: "Jogador 04")
        ]
        return s
    }

    // Fase 1 — confirmando o 2º saque do set: SÓ o time que não abriu (aqui o
    // time 1 abriu, então só o time 2 aparece).
    static var mockServe2nd: ScoreState {
        var s = ScoreState.mock
        s.canSetServer = true
        s.isDoubles = true
        s.servePickPhase = 1
        s.servePickCurrent = "Jogador 03"
        s.serveEligible = [
            ServeSlot(team: 2, playerIdx: 0, name: "Jogador 03"),
            ServeSlot(team: 2, playerIdx: 1, name: "Jogador 04")
        ]
        return s
    }

    // Estado de exemplo — usado no #Preview e no app de preview standalone.
    static var mock: ScoreState {
        var s = ScoreState()
        s.active = true
        s.setLabel = "Set 1"
        s.points = ["40", "30"]
        s.games = [1, 2]
        s.courtLeft = 1
        s.server = Server(team: 1, name: "Jogador 01")
        s.teams = [
            "1": Team(players: ["Jogador 01", "Jogador 02"]),
            "2": Team(players: ["Jogador 03", "Jogador 04"])
        ]
        return s
    }
}
