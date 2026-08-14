import Foundation

/**
 * Teste da POSSE + DIÁRIO do relógio (WatchMatchSession) — Caminho B, fiação.
 * Roda o tipo REAL do app do relógio (nenhuma réplica) contra snapshots
 * montados à mão, cobrindo as regras que decidem o que a tela mostra.
 *
 * Rodar: tests/watch-engine/run-swift-session.sh
 * ⚠️ Fora do npm test (exige Xcode) — mesmo regime do runner de paridade.
 */

var pass = 0, fail = 0
func ok(_ c: Bool, _ m: String) {
    if c { pass += 1 } else { fail += 1; print("  ✗ \(m)") }
}

// snapshot do celular, com o mínimo que a sessão lê
func snap(epoch: String, seq: Int, games: [Int] = [0, 0], sets: [Int] = [0, 0],
          points: [String] = ["0", "0"], active: Bool = true, finished: Bool = false,
          withScoring: Bool = true, doubles: Bool = true,
          servePickOpen: Bool = true, server: [String: Any]? = nil) -> ScoreState {
    var d: [String: Any] = [
        "v": 1, "type": "state", "seq": seq, "epoch": "carga-1",
        "active": active, "setLabel": "Set 1", "points": points, "games": games,
        "sets": sets, "setsToWin": 1, "isTiebreak": false, "courtLeft": 1,
        "teams": ["1": ["players": doubles ? ["Ana", "Bruno"] : ["Ana"]],
                  "2": ["players": doubles ? ["Caio", "Duda"] : ["Caio"]]],
        "isCasual": true, "isDoubles": doubles, "isFinished": finished,
        "sportName": "Beach Tennis", "servePickOpen": servePickOpen,
        "servePickPhase": servePickOpen ? 0 : -1, "canSetServer": doubles,
        "matchEpoch": epoch
    ]
    if let s = server { d["server"] = s }
    if withScoring {
        d["scoring"] = ["type": "sets", "setsToWin": 1, "gamesPerSet": 6,
                        "tiebreakEnabled": true, "tiebreakPoints": 7, "tiebreakMargin": 2,
                        "superTiebreak": false, "superTiebreakPoints": 10,
                        "countingType": "tennis", "deuceRule": false,
                        "twoPointAdvantage": true, "tieRule": "ask",
                        "fixedSet": false, "fixedSetGames": 0]
    }
    let data = try! JSONSerialization.data(withJSONObject: d)
    return try! JSONDecoder().decode(ScoreState.self, from: data)
}

func newSession() -> WatchMatchSession {
    let s = WatchMatchSession()
    s.now = { 1_723_600_000_000 }   // relógio fixo: o diário fica determinístico
    return s
}

print("──── watch-session (posse + diário) ────")

// ── 1. app do celular ANTIGO (sem matchEpoch/scoring) → motor local desligado ──
let a = newSession()
a.ingest(snap(epoch: "", seq: 1, withScoring: false))
ok(a.engine == nil, "🔒 sem matchEpoch/scoring o motor local NÃO arma (app do celular antigo → espelho, nunca pior que hoje)")
ok(a.localEvent(.point(team: 1)) == false, "toque sem motor devolve false — o chamador cai no caminho antigo (intent unitário)")
ok(a.pendingEvlog(deviceId: "w") == nil, "sem diário não há evlog a mandar")

// ── 2. partida do começo → arma; toque responde LOCAL e entra no diário ──
let b = newSession()
b.ingest(snap(epoch: "m1", seq: 1))
ok(b.engine != nil, "🔒 snapshot no 0-0 com config ARMA o motor local (o caso que importa: começar a partida com o relógio junto)")
ok(b.owner == .phone, "antes de qualquer toque a posse é do celular")
ok(b.localEvent(.serveSelect(team: 1, idx: 0)), "escolha de sacador entra no motor local")
ok(b.localEvent(.serveConfirm), "confirmação idem")
ok(b.localEvent(.point(team: 1)), "ponto idem")
ok(b.owner == .watch, "🔒 tocou no relógio → a POSSE é do relógio (a tela responde na hora, sem ida e volta)")
ok(b.displayState.points == ["15", "0"], "🔒 a tela mostra o placar do MOTOR LOCAL · achado: \(b.displayState.points)")
ok(b.journal.count == 3 && b.journal[0].n == 1 && b.journal[2].n == 3,
   "diário acumulou os 3 eventos com `n` sequencial")
let ev = b.pendingEvlog(deviceId: "watch-A")!
ok((ev["type"] as? String) == "evlog" && (ev["matchEpoch"] as? String) == "m1"
   && ((ev["events"] as? [[String: Any]])?.count ?? 0) == 3,
   "🔒 o evlog sai carimbado com a época da partida e o dispositivo")

// ── 3. o celular alcança (reproduziu o diário) → posse volta pra ele ──
b.ingest(snap(epoch: "m1", seq: 9, points: ["15", "0"], servePickOpen: false,
              server: ["team": 1, "name": "Ana"]))
ok(b.owner == .phone, "🔒 quando o celular converge no MESMO placar, a posse volta pra ele (o canônico manda)")
ok(b.engine != nil, "…e o motor local segue ARMADO pro próximo toque (não se perde a autonomia)")
ok(b.journal.count == 3, "🔒 o diário NÃO é limpo pela adoção — reenviar é de graça e é o que garante a entrega")

// ── 4. celular andou sozinho (alguém pontuou LÁ) → desarma e espelha ──
let c = newSession()
c.ingest(snap(epoch: "m2", seq: 1))
_ = c.localEvent(.serveSelect(team: 1, idx: 0))
_ = c.localEvent(.serveConfirm)
_ = c.localEvent(.point(team: 1))
c.ingest(snap(epoch: "m2", seq: 7, points: ["30", "15"], servePickOpen: false,
              server: ["team": 1, "name": "Ana"]))
ok(c.engine == nil && c.owner == .phone,
   "🔒 placar do celular que NÃO bate com o local (ele já viu nosso diário) DESARMA o motor — nunca mostrar placar local errado")
ok(c.displayState.points == ["30", "15"], "…e a tela passa a espelhar o celular · achado: \(c.displayState.points)")

// ── 5. divergência ANTES de o celular ver o diário NÃO desarma ──
let d = newSession()
d.ingest(snap(epoch: "m3", seq: 5))
_ = d.localEvent(.serveSelect(team: 1, idx: 0))
_ = d.localEvent(.serveConfirm)
_ = d.localEvent(.point(team: 1))
// snapshot ANTIGO (seq <= o que tínhamos no toque): ele ainda não viu nada
d.ingest(snap(epoch: "m3", seq: 5))
ok(d.engine != nil && d.owner == .watch,
   "🔒 enquanto o celular não teve chance de aplicar o diário, divergir é ESPERADO — o motor local continua mandando")
ok(d.displayState.points == ["15", "0"], "…e a tela segue no placar local · achado: \(d.displayState.points)")

// ── 6. partida NOVA (época) → diário zerado e motor re-armado ──
d.ingest(snap(epoch: "m4", seq: 30))
ok(d.journal.isEmpty, "🔒 época nova ZERA o diário (o `n` recomeça em 1 — senão o celular descartaria por dedup)")
ok(d.engine != nil && d.owner == .phone, "…e o motor local re-arma pra partida nova")
_ = d.localEvent(.point(team: 2))
ok(d.journal.first?.n == 1, "a numeração do diário recomeça em 1 na partida nova")

// ── 7. relógio que chega no MEIO da partida → espelha (sem semear motor) ──
let e = newSession()
e.ingest(snap(epoch: "m5", seq: 40, games: [3, 2], points: ["30", "40"], servePickOpen: false))
ok(e.engine == nil,
   "🔒 chegando no meio da partida o motor local NÃO arma — semear seria superfície fora dos vetores (drift sem rede)")
ok(e.displayState.games == [3, 2], "…e a tela espelha o celular normalmente")

// ── 8. o placar local passa pelo MESMO decoder do snapshot do celular ──
let f = newSession()
f.ingest(snap(epoch: "m6", seq: 3))
_ = f.localEvent(.serveSelect(team: 2, idx: 1))
_ = f.localEvent(.serveConfirm)
_ = f.localEvent(.point(team: 2))
let ds = f.displayState
ok(ds.server?.name == "Duda" && ds.server?.team == 2,
   "🔒 o estado local chega à tela com TODOS os campos (sacador, times, faixa) — um caminho só de construção")
ok(ds.matchEpoch == "m6" && ds.hrMax == f.mirrored.hrMax,
   "campos que o motor não conhece (época, ♥) vêm do espelho, que é quem os recebe")
ok(ds.teams["2"]?.players == ["Caio", "Duda"], "os nomes seguem os do celular")

print("watch-session: \(pass) ok, \(fail) falhas")
if fail > 0 { exit(1) }
