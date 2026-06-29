/* RESOLUÇÃO DE PONTUAÇÃO (GSM) — node tests/live-scoring-resolve.test.js
 *
 * Congela `window._resolveLiveScoring` (bracket-ui.js REAL) — a resolução CANÔNICA da config de
 * placar que evita o bug "games direto" (memória project_live_scoring_canonical): sem config
 * explícita, cai no DEFAULT EM SETS do esporte; com config, faz merge (override do organizador
 * vence o default do esporte); 'simple' explícito é RESPEITADO mesmo num esporte de sets.
 * Defaults reais vêm de `window._sportScoringDefaults` (create-tournament.js). A acumulação
 * GSM na classificação (sets/games) já está travada em standings-tiebreakers.
 */
const H = require('./headless.js');
H.load('create-tournament.js'); // window._sportScoringDefaults
H.load('bracket-ui.js');        // window._resolveLiveScoring
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const R = (sc, sport) => W._resolveLiveScoring(sc, sport);

// ── sem config → DEFAULT EM SETS do esporte (anti "games direto") ───────────
(function () {
  const bt = R({}, 'Beach Tennis');
  ok(bt.type === 'sets', '[fallback BT] vira sets (não simples/games direto)');
  ok(bt.setsToWin === 1 && bt.gamesPerSet === 6 && bt.tiebreakEnabled === true, '[fallback BT] default real (1 set, 6 games, TB on)');
  const te = R(null, 'Tênis');
  ok(te.type === 'sets' && te.setsToWin === 2 && te.superTiebreak === true && te.advantageRule === true, '[fallback Tênis] 2 sets + super-TB + vantagem');
  const pk = R(undefined, 'Pickleball');
  ok(pk.type === 'sets' && pk.gamesPerSet === 11 && pk.tiebreakEnabled === false, '[fallback Pickleball] 11 pts, sem TB');
})();

// ── sc.type='sets' + esporte → MERGE (override do organizador vence) ────────
(function () {
  const m = R({ type: 'sets', setsToWin: 3 }, 'Tênis');
  ok(m.setsToWin === 3, '[merge] override setsToWin=3 vence o default (2)');
  ok(m.gamesPerSet === 6, '[merge] gamesPerSet herdado do default do esporte');
  ok(m.advantageRule === true, '[merge] advantageRule herdado do default (não sobrescrito)');
  // override com valor FALSY definido também vence
  const m2 = R({ type: 'sets', advantageRule: false }, 'Tênis');
  ok(m2.advantageRule === false, '[merge] override falsy (advantageRule:false) vence o default true');
})();

// ── 'simple' EXPLÍCITO é respeitado mesmo num esporte de sets ──────────────
(function () {
  const s = R({ type: 'simple' }, 'Beach Tennis');
  ok(s.type === 'simple', "[simple] escolha explícita 'simple' NÃO é forçada a sets");
})();

// ── esporte desconhecido → devolve a config como veio (sem contaminar) ──────
(function () {
  const custom = R({ type: 'sets', setsToWin: 5, gamesPerSet: 9 }, 'Xadrez');
  ok(custom.setsToWin === 5 && custom.gamesPerSet === 9, '[desconhecido+sets] mantém a config do organizador');
  const empty = R({}, 'Xadrez');
  ok(empty.type === undefined && Object.keys(empty).length === 0, '[desconhecido+vazio] sem default → fica vazio (sem forçar sets)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' live-scoring-resolve: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
