/* REGRAS DE PONTUAÇÃO POR MODALIDADE — node tests/sport-scoring-rules.test.js
 *
 * Congela os defaults GSM de TORNEIO (window._sportScoringDefaults, create-tournament.js REAL)
 * contra as REGRAS OFICIAIS pesquisadas (jun/2026). Trava duas decisões:
 *  (a) VANTAGEM (deuce/AD a 40-40) = SÓ no Tênis. Padel = golden point (no-ad); demais = sem deuce.
 *  (b) Sistema sets/games/pontos por modalidade bate com a federação:
 *      - Tênis (ITF): melhor de 3, sets a 6 games, tiebreak, DEUCE.
 *      - Beach Tennis (ITF): 1 set a 6 games, tiebreak (ganhar por 2 NO TIEBREAK), no-ad.
 *      - Pickleball (USAP): 11 pontos, numérico, ganhar por 2 NOS PONTOS (twoPointAdvantage, engine).
 *      - Tênis de Mesa (ITTF): melhor de 5 (setsToWin 3), 11 pontos, numérico.
 *      - Padel (FIP): melhor de 3, 6 games, tiebreak, super-TB 10, GOLDEN POINT (no-ad).
 *      - Vôlei de Praia (FIVB): melhor de 3, 21 pontos, 3º set 15, numérico, ganhar por 2 nos pontos.
 *      - Futevôlei (FIFV): melhor de 3, 18 pontos, 3º set 15, numérico, ganhar por 2 nos pontos.
 * Obs: "ganhar por 2 nos pontos" = `twoPointAdvantage` (set-level, default ON no motor, bracket-ui.js)
 * — eixo SEPARADO do `tiebreakMargin` (beach tennis/tênis: ganhar por 2 no tiebreak) e do deuce (só tênis).
 */
const H = require('./headless.js');
H.load('create-tournament.js');
const D = H.window._sportScoringDefaults;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function expect(sport, field, val) {
  ok(D[sport] && D[sport][field] === val, '[' + sport + '] ' + field + ' = ' + JSON.stringify(val) + ' (got ' + JSON.stringify(D[sport] && D[sport][field]) + ')');
}

ok(D && typeof D === 'object', '_sportScoringDefaults existe');

// (a) DEUCE/AD só no Tênis
var withAd = Object.keys(D).filter((s) => D[s].advantageRule === true);
ok(withAd.length === 1 && withAd[0] === 'Tênis', 'deuce/AD SÓ no Tênis (got [' + withAd.join(',') + '])');

// (b) sistema por modalidade — valores oficiais
// Tênis (ITF)
expect('Tênis', 'setsToWin', 2); expect('Tênis', 'gamesPerSet', 6);
expect('Tênis', 'tiebreakEnabled', true); expect('Tênis', 'countingType', 'tennis'); expect('Tênis', 'advantageRule', true);
// Beach Tennis (ITF) — ganhar por 2 NO TIEBREAK, no-ad
expect('Beach Tennis', 'setsToWin', 1); expect('Beach Tennis', 'gamesPerSet', 6);
expect('Beach Tennis', 'tiebreakEnabled', true); expect('Beach Tennis', 'tiebreakMargin', 2); expect('Beach Tennis', 'advantageRule', false);
// Pickleball (USAP) — 11 pontos numérico
expect('Pickleball', 'gamesPerSet', 11); expect('Pickleball', 'countingType', 'numeric'); expect('Pickleball', 'advantageRule', false);
// Tênis de Mesa (ITTF) — melhor de 5, 11 pontos
expect('Tênis de Mesa', 'setsToWin', 3); expect('Tênis de Mesa', 'gamesPerSet', 11); expect('Tênis de Mesa', 'countingType', 'numeric'); expect('Tênis de Mesa', 'advantageRule', false);
// Padel (FIP) — golden point (no-ad), super-TB 10
expect('Padel', 'setsToWin', 2); expect('Padel', 'gamesPerSet', 6); expect('Padel', 'tiebreakEnabled', true);
expect('Padel', 'superTiebreakPoints', 10); expect('Padel', 'advantageRule', false);
// Vôlei de Praia (FIVB) — 21 pontos, 3º set 15, ganhar por 2 nos pontos
expect('Vôlei de Praia', 'setsToWin', 2); expect('Vôlei de Praia', 'gamesPerSet', 21);
expect('Vôlei de Praia', 'superTiebreakPoints', 15); expect('Vôlei de Praia', 'countingType', 'numeric'); expect('Vôlei de Praia', 'advantageRule', false);
// Futevôlei (FIFV) — 18 pontos, 3º set 15
expect('Futevôlei', 'setsToWin', 2); expect('Futevôlei', 'gamesPerSet', 18);
expect('Futevôlei', 'superTiebreakPoints', 15); expect('Futevôlei', 'countingType', 'numeric'); expect('Futevôlei', 'advantageRule', false);

// derivação canônica da vantagem existe (toggle manual removido)
ok(typeof H.window._gsmGetAdvantageForSport === 'function', '_gsmGetAdvantageForSport (derivação) existe');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' sport-scoring-rules: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
