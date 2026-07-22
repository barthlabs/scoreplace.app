// TIE-BREAK configurável por torneio (dono, jul/2026): scoring.tiebreakAt 'g-1' (5-5 → set 6-5) ou
// 'g' (6-6 → set 7-6). Fallback por ESPORTE (Beach Tennis = 5-5; resto = 6-6). O gatilho é os GAMES
// DO PERDEDOR no set decidido no TB — _tbLoserGames — que _isTiebreakSetScore usa pra revelar o campo.
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const lg = (sc, sport) => W._tbLoserGames(sc, sport);
const isTB = (a, b, l) => W._isTiebreakSetScore(a, b, l);

// ── fallback por esporte ──
ok(lg({ gamesPerSet: 6 }, 'Beach Tennis') === 5, 'Beach Tennis (default 5-5): perdedor=5');
ok(isTB(6, 5, lg({ gamesPerSet: 6 }, 'Beach Tennis')) === true, 'Beach Tennis: 6-5 É tie-break');
ok(isTB(7, 6, lg({ gamesPerSet: 6 }, 'Beach Tennis')) === false, 'Beach Tennis: 7-6 NÃO é (max é 6)');
ok(isTB(6, 4, lg({ gamesPerSet: 6 }, 'Beach Tennis')) === false, 'Beach Tennis: 6-4 é vitória normal (não TB)');

ok(lg({ gamesPerSet: 6 }, 'Tênis') === 6, 'Tênis (default 6-6): perdedor=6');
ok(isTB(7, 6, lg({ gamesPerSet: 6 }, 'Tênis')) === true, 'Tênis: 7-6 É tie-break');
ok(isTB(6, 5, lg({ gamesPerSet: 6 }, 'Tênis')) === false, 'Tênis: 6-5 NÃO é tie-break');

// ── override por torneio (scoring.tiebreakAt) — vence o default do esporte ──
ok(lg({ gamesPerSet: 6, tiebreakAt: 'g' }, 'Beach Tennis') === 6, 'Beach Tennis + tiebreakAt=g → 7-6');
ok(isTB(7, 6, lg({ gamesPerSet: 6, tiebreakAt: 'g' }, 'Beach Tennis')) === true, 'BT override g: 7-6 É TB');
ok(isTB(6, 5, lg({ gamesPerSet: 6, tiebreakAt: 'g' }, 'Beach Tennis')) === false, 'BT override g: 6-5 NÃO é');
ok(lg({ gamesPerSet: 6, tiebreakAt: 'g-1' }, 'Tênis') === 5, 'Tênis + tiebreakAt=g-1 → 6-5');
ok(isTB(6, 5, lg({ gamesPerSet: 6, tiebreakAt: 'g-1' }, 'Tênis')) === true, 'Tênis override g-1: 6-5 É TB');

// ── outros gamesPerSet ──
ok(lg({ gamesPerSet: 11, tiebreakAt: 'g' }, 'Pickleball') === 11, 'gp11 + g → perdedor 11 (12-11)');
ok(isTB(12, 11, lg({ gamesPerSet: 11, tiebreakAt: 'g' }, 'Pickleball')) === true, 'gp11 g: 12-11 É TB');
ok(lg({ gamesPerSet: 4, tiebreakAt: 'g-1' }, 'X') === 3, 'gp4 + g-1 → perdedor 3 (4-3)');
ok(isTB(4, 3, lg({ gamesPerSet: 4, tiebreakAt: 'g-1' }, 'X')) === true, 'gp4 g-1: 4-3 É TB');

console.log('\n' + (fail === 0 ? '✅ tiebreak-trigger: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
