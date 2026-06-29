/* FONTE ÚNICA DAS REGRAS DAS MODALIDADES — node tests/sport-rules-canonical.test.js
 *
 * Congela a CANONIZAÇÃO: window.SPORT_RULES (js/views/sport-rules.js) é a fonte única; os
 * defaults de TORNEIO (_sportScoringDefaultsMap) e de CASUAL (_casualScoringDefaultsMap)
 * derivam dela. Trava: (a) a fonte tem as 7 modalidades; (b) as duas projeções batem com a
 * fonte e ENTRE SI nos valores de scoring (sem divergência — se alguém reintroduzir um literal
 * divergente, este teste quebra); (c) o mapeamento advantageRule(torneio)↔deuceRule(casual).
 * sport-rules.js é carregado pelo harness base (tests/headless.js).
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const R = W.SPORT_RULES;
const SPORTS = ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'];
ok(R && typeof R === 'object', 'window.SPORT_RULES existe');
ok(SPORTS.every((s) => R[s]), 'fonte única tem as 7 modalidades');

const T = W._sportScoringDefaultsMap();
const C = W._casualScoringDefaultsMap();
const TEAM = W._sportTeamDefaultsMap();

SPORTS.forEach((s) => {
  const r = R[s];
  // (a) projeção TORNEIO bate com a fonte
  ok(T[s] && T[s].advantageRule === r.advantageRule && T[s].setsToWin === r.setsToWin && T[s].gamesPerSet === r.gamesPerSet,
    '[' + s + '] projeção torneio = fonte (adv/sets/games)');
  // (b) projeção CASUAL: advantageRule da fonte vira deuceRule
  ok(C[s] && C[s].deuceRule === r.advantageRule, '[' + s + '] casual.deuceRule = fonte.advantageRule (' + r.advantageRule + ')');
  ok(C[s] && C[s].twoPointAdvantage === true, '[' + s + '] casual.twoPointAdvantage = true (ganhar por 2)');
  ok(C[s] && C[s].tieRule === r.tieRule, '[' + s + '] casual.tieRule = fonte (' + r.tieRule + ')');
  // (c) CONSISTÊNCIA torneio↔casual: iguais EXCETO onde há casualOverride EXPLÍCITO
  // (divergência legítima por modalidade, ex.: Beach Tennis tiebreakEnabled no casual).
  const ov = r.casualOverride || {};
  ['type', 'setsToWin', 'gamesPerSet', 'countingType', 'tiebreakEnabled', 'tiebreakPoints', 'tiebreakMargin', 'superTiebreak', 'superTiebreakPoints'].forEach((k) => {
    if (k in ov) ok(C[s][k] === ov[k], '[' + s + '] casualOverride.' + k + ' aplicado (= ' + ov[k] + ')');
    else ok(T[s][k] === C[s][k], '[' + s + '] torneio.' + k + ' === casual.' + k + ' (' + T[s][k] + ')');
  });
  // (d) tamanho de time derivado da fonte
  ok(TEAM[s] === r.teamSize, '[' + s + '] teamSize = fonte (' + r.teamSize + ')');
});

// Divergência LEGÍTIMA Beach Tennis: torneio = tiebreak no 6-6 (ITF); casual = 'ask' (fluxo flexível,
// prorroga vai-a-7/8/9 com 2 de vantagem OU tiebreak, decidido no jogo). É o único casualOverride.
ok(T['Beach Tennis'].tiebreakEnabled === true, 'Beach Tennis TORNEIO = tiebreak no 6-6 (ITF)');
ok(C['Beach Tennis'].tiebreakEnabled === false && C['Beach Tennis'].tieRule === 'ask', "Beach Tennis CASUAL = 'ask' + sem tiebreak fixo");
ok(SPORTS.filter((s) => R[s].casualOverride).join(',') === 'Beach Tennis', 'casualOverride existe SÓ no Beach Tennis');

// AD (deuce) só no Tênis na FONTE
const withAd = SPORTS.filter((s) => R[s].advantageRule === true);
ok(withAd.length === 1 && withAd[0] === 'Tênis', 'na fonte, AD só no Tênis (got [' + withAd.join(',') + '])');
// projeção do mapa de vantagem
ok(JSON.stringify(W._gsmAdvantageDefaultMap()) === '{"Tênis":true}', '_gsmAdvantageDefaultMap = {Tênis:true}');

// torneio tem o fallback _default; casual não precisa (resolvido no _getConfig)
ok(T['_default'] && T['_default'].type === 'simple', 'torneio tem _default (placar livre)');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' sport-rules-canonical: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
