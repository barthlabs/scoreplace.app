// REPRODUZ o bug do dono (jul/2026): "onde esta o tie break 5-5/6-6? regressao."
// No SB (Beach Tennis) o placar REVELAVA os campos de tie-break (tbReveal hit:true) mas a tela de
// CONFIG escondia o seletor 5-5/6-6 — duas verdades diferentes pro MESMO torneio.
//
// CAUSA: _reSyncTbAt (create-tournament.js) tinha lógica PRÓPRIA de "usa sets" (`gsm-type==='sets'`),
// enquanto o placar usa a FONTE CANÔNICA window._scoringUsesSets. Torneios reais gravam
// `type:'simple'` COM gamesPerSet + tiebreakEnabled (o doc do dono: type simple, 6 games, TB on) →
// canônica diz SETS, a pirata dizia SIMPLES → seletor sumia.
//
// REGRA TRAVADA: "usa sets" é decidido SEMPRE por _scoringUsesSets. [[project_sport_rules_canonical]]
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

ok(typeof W._scoringUsesSets === 'function', '_scoringUsesSets (fonte canônica) existe');

// o scoring REAL do torneio do dono (tour_1784660138198_sb)
const REAL = { gamesPerSet: 6, setsToWin: 1, type: 'simple', tiebreakEnabled: true,
               countingType: 'numeric', tiebreakPoints: 7, tiebreakMargin: 2 };

ok(W._scoringUsesSets(REAL) === true,
   '✅ o scoring REAL do SB (type:"simple" + gamesPerSet + TB on) USA SETS pela fonte canônica');
// a lógica pirata que existia dizia o contrário — é o que sumia com o seletor
ok((REAL.type === 'sets') === false, 'gate PIRATA (type===sets) diria NÃO — era o furo');

// placar simples DE VERDADE não deve mostrar o seletor
ok(W._scoringUsesSets({ type: 'simple', tiebreakEnabled: false }) === false,
   'placar simples de verdade (sem TB) NÃO usa sets — seletor segue escondido');
// e sets explícito também usa
ok(W._scoringUsesSets({ type: 'sets', gamesPerSet: 6, tiebreakEnabled: true }) === true, 'type sets → usa sets');

// o gatilho do TB derivado do scoring do dono: Beach Tennis → 'g-1' → 6 games ⇒ perdedor com 5 (6-5)
ok(typeof W._tbLoserGames === 'function', '_tbLoserGames existe');
ok(W._tbLoserGames(REAL, 'Beach Tennis') === 5,
   'Beach Tennis: TB em 6-5 (gatilho 5) — bate com o tbReveal {"s":"6-5","trigger":5} do dono');
ok(W._tbLoserGames({ gamesPerSet: 6, tiebreakEnabled: true }, 'Tênis') === 6, 'Tênis: TB em 7-6 (gatilho 6)');

console.log('\n' + (fail === 0 ? '✅ tiebreak-at-visibility: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
