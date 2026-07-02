/* Teste headless do brick 4 — node js/views/phase-brick4.test.js
 * Pontos Corridos RODADA A RODADA como fase POSTERIOR. Prova:
 *  (A) buildPhaseLeagueStage incremental devolve só o POOL (não pré-gera round-robin).
 *  (B) materializeNextPhase persiste t.phaseRounds[idx] (pool slim + rounds[]) sem mergear jogos em t.matches.
 *  (C) _phaseGenNextLeagueRound gera a 1ª rodada (duplas) em t.phaseRounds[idx].rounds, taggeada bracket:'league'.
 *  (D) Após jogar a rodada, gera a 2ª — opponentHistory acumula (anti-repetição) e as
 *      standings da fase refletem o resultado.
 *  (E) Modo default (todos contra todos) segue intacto: C(n,2) jogos de uma vez.
 *
 * Carrega a lógica REAL do cliente em Node via shim de `window` (igual draw-core.js).
 */
var g = globalThis;
if (!g.window) g.window = g;
var _I18N = { 'label.group': 'Grupo' };
g.window._t = function (k, v) { return _I18N[k] || ((v && v.name) ? v.name : k); };
g.window._warn = function () {};
g.window._log = function () {};
g.window._error = function () {};

require('./tournaments-utils.js');       // _isLigaFormat
require('./tournaments-categories.js');  // _sortCategoriesBySkillOrder, _participantInCategory…
require('./bracket-model.js');           // _appendCanonicalColumn
require('./bracket-logic.js');           // _computeStandings, _generateNextRoundForPlayers, _phaseGenNextLeagueRound
var E = require('./phases-engine.js');   // buildPhaseLeagueStage, materializeNextPhase

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ FALHOU:', m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }
// v3.1.16 (inc 8): jogos da Liga incremental moram em t.phaseRounds[idx].rounds[].matches.
function phaseRoundMatches(t, idx, roundNum) {
  var slot = (t.phaseRounds && t.phaseRounds[idx]) || {};
  var out = [];
  (slot.rounds || []).filter(function (r) { return (r.round || 1) === roundNum; })
    .forEach(function (r) { (r.matches || []).forEach(function (m) { out.push(m); }); });
  return out;
}

var srcAll = { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] };
var csId = function (gr) { return gr.standings; };

// ── (A) build incremental devolve POOL, não jogos ────────────────────────────
(function () {
  var prevG = [{ name: 'C', standings: [] }];
  for (var i = 1; i <= 8; i++) prevG[0].standings.push({ name: 'P' + i, uid: 'u' + i });
  var cfg = { name: 'Liga RR', formatCode: 'liga', ligaCadence: 'incremental', source: srcAll };
  var built = E.buildPhaseLeagueStage(prevG, cfg, csId, 'tl');
  ok(built.incrementalLeague === true, 'A: build marca incrementalLeague');
  eq(built.matches.length, 0, 'A: build NÃO pré-gera jogos');
  eq((built.pool || []).length, 8, 'A: pool com os 8 classificados');
})();

// ── (E) default (round_robin) segue intacto ──────────────────────────────────
(function () {
  var prevG = [{ name: 'C', standings: [] }];
  for (var i = 1; i <= 5; i++) prevG[0].standings.push({ name: 'P' + i, uid: 'u' + i });
  var cfg = { name: 'Liga RR', formatCode: 'liga', source: srcAll }; // sem ligaCadence
  var built = E.buildPhaseLeagueStage(prevG, cfg, csId, 'tl');
  eq(built.matches.length, 10, 'E: default = C(5,2)=10 jogos (round-robin estático)');
  ok(!built.incrementalLeague, 'E: default NÃO é incremental');
})();

// ── (B)(C)(D) materialize + driver rodada a rodada ───────────────────────────
(function () {
  var lcfg = { name: 'Temporada Final', formatCode: 'liga', ligaCadence: 'incremental', source: srcAll };
  var t = {
    id: 'tBrick4', phases: [{ name: 'F0' }, lcfg], currentPhaseIndex: 0,
    groups: [{ name: 'G', players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], matches: [] }],
    matches: []
  };
  var cs0 = function (gr) { return (gr.players || []).map(function (n) { return { name: n, displayName: n }; }); };

  // (B) materialize
  var res = E.materializeNextPhase(t, cs0, 'm');
  ok(res.ok && res.incrementalLeague === true, 'B: materialize ok + incrementalLeague');
  eq(res.phaseIndex, 1, 'B: phaseIndex=1');
  eq(t.currentPhaseIndex, 1, 'B: currentPhaseIndex avançou');
  eq((t.matches || []).length, 0, 'B: nenhum jogo mergeado em t.matches na materialização');
  ok(t.phaseRounds && t.phaseRounds[1], 'B: phaseRounds[1] criado');
  eq((t.phaseRounds[1].rounds || []).length, 0, 'B: rounds[] começa vazio (rodada 1 vem no driver)');
  eq((t.phaseRounds[1].pool || []).length, 8, 'B: pool persistido com 8');
  ok(t.phaseRounds[1].pool.every(function (p) { return p.displayName && !p.participants; }), 'B: pool é SLIM (displayName, sem participants aninhado)');

  // (C) round 1 via driver
  var ok1 = g.window._phaseGenNextLeagueRound(t, 1);
  ok(ok1 === true, 'C: driver gerou a 1ª rodada');
  eq((t.matches || []).length, 0, 'C: rodada NÃO foi pra t.matches (mora em phaseRounds)');
  var r1 = phaseRoundMatches(t, 1, 1);
  var r1real = r1.filter(function (m) { return !m.isSitOut; });
  eq(r1real.length, 2, 'C: 8 jogadores → 2 partidas de duplas na rodada 1');
  ok(r1real.every(function (m) { return Array.isArray(m.team1) && Array.isArray(m.team2) && m.isMonarch; }), 'C: partidas são duplas (team1/team2, isMonarch)');
  ok(r1real.every(function (m) { return m.phaseIndex === 1 && m.bracket === 'league'; }), 'C: taggeado phaseIndex+bracket');

  // joga a rodada 1: time1 vence sempre
  r1real.forEach(function (m) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 2; });

  // (D) round 2
  var ok2 = g.window._phaseGenNextLeagueRound(t, 1);
  ok(ok2 === true, 'D: driver gerou a 2ª rodada');
  var r2 = phaseRoundMatches(t, 1, 2).filter(function (m) { return !m.isSitOut; });
  eq(r2.length, 2, 'D: rodada 2 também tem 2 partidas');
  eq((t.phaseRounds[1].rounds || []).length, 2, 'D: phaseRounds[1].rounds tem 2 rodadas reais');
  var oppKeys = Object.keys((t.phaseRounds[1].opponentHistory || {})['_default_'] || {});
  ok(oppKeys.length > 0, 'D: opponentHistory acumulou (anti-repetição entre rodadas)');

  // standings da fase: quem venceu na rodada 1 está com pontos > 0 (via faux do render)
  var winners = {};
  r1real.forEach(function (m) { (m.team1 || []).forEach(function (n) { winners[n] = 1; }); });
  var faux = { participants: t.phaseRounds[1].pool.slice(), rounds: [{ matches: r1real }], matches: [] };
  var st = g.window._computeStandings(faux, null);
  var top = st[0];
  ok(top && winners[top.name] && top.points >= 3, 'D: standings — um vencedor da rodada 1 lidera (pts≥3)');
  eq(st.length, 8, 'D: standings lista os 8 jogadores da fase');
})();

// ── (F) MODO DE SORTEIO ortogonal: incremental REI/RAINHA (grupos de 4 rotativos) ──
// Prova que a cadência rodada-a-rodada vale também pro modo Rei/Rainha (não é formato).
(function () {
  var lcfg = { name: 'Temporada R/R', formatCode: 'liga', ligaCadence: 'incremental', reiRainha: true,
    source: srcAll };
  var t = {
    id: 'tBrick4RR', phases: [{ name: 'F0' }, lcfg], currentPhaseIndex: 0,
    groups: [{ name: 'G', players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], matches: [] }],
    matches: []
  };
  var cs0 = function (gr) { return (gr.players || []).map(function (n) { return { name: n, displayName: n }; }); };
  var res = E.materializeNextPhase(t, cs0, 'm');
  ok(res.ok && res.incrementalLeague === true, 'F: materialize R/R incremental ok (cadência ortogonal ao modo)');
  ok(g.window._phaseGenNextLeagueRound(t, 1), 'F: round 1 R/R gerada');
  var r1 = phaseRoundMatches(t, 1, 1).filter(function (m) { return !m.isSitOut; });
  eq(r1.length, 6, 'F: 8 jogadores → 2 grupos de 4 → 6 jogos (3 por grupo)');
  ok(r1.every(function (m) { return m.isMonarch && m.monarchGroup != null; }), 'F: jogos carregam a FORMA Rei/Rainha (isMonarch + monarchGroup)');
  ok(r1.every(function (m) { return m.bracket === 'league'; }), 'F: bracket=league (FORMATO Pontos Corridos, não "monarch")');
  var groupsSeen = {}; r1.forEach(function (m) { groupsSeen[m.monarchGroup] = 1; });
  eq(Object.keys(groupsSeen).length, 2, 'F: 2 grupos distintos na rodada');
  // joga a rodada → gera a 2ª (reshuffle)
  r1.forEach(function (m) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 2; });
  ok(g.window._phaseGenNextLeagueRound(t, 1), 'F: round 2 R/R gerada (temporada rodada a rodada)');
  var r2 = phaseRoundMatches(t, 1, 2).filter(function (m) { return m.isMonarch; });
  eq(r2.length, 6, 'F: round 2 também 6 jogos R/R');
})();

// ── (G) inc 8 — encadeamento: Liga incremental (rounds=2) NÃO-FINAL → phaseComplete ──
// + feed-forward. Prova que dá pra avançar de uma Liga incremental pra próxima fase
// (os jogos moram em phaseRounds, não em t.matches; phaseComplete e bracketPhaseGroups
// passaram a enxergá-los).
(function () {
  var lcfg = { name: 'Temporada', formatCode: 'liga', ligaCadence: 'incremental', rounds: 2, source: srcAll };
  var ecfg = { name: 'Final', formatCode: 'elim', sourceType: 'previous', source: { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 4 }] } };
  var t = {
    id: 'tChain', phases: [{ name: 'F0' }, lcfg, ecfg], currentPhaseIndex: 0,
    groups: [{ name: 'G', players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], matches: [] }],
    matches: []
  };
  var cs0 = function (gr) { return (gr.players || []).map(function (n) { return { name: n, displayName: n }; }); };
  E.materializeNextPhase(t, cs0, 'm'); // → fase 1 (liga incremental)
  eq(t.currentPhaseIndex, 1, 'G: avançou pra fase 1 (liga incremental)');
  ok(!E.phaseComplete(t), 'G: liga incompleta antes de gerar qualquer rodada');
  g.window._phaseGenNextLeagueRound(t, 1);
  phaseRoundMatches(t, 1, 1).forEach(function (m) { if (!m.isSitOut) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 2; } });
  ok(!E.phaseComplete(t), 'G: ainda incompleta com 1 de 2 rodadas (cap respeitado)');
  g.window._phaseGenNextLeagueRound(t, 1);
  phaseRoundMatches(t, 1, 2).forEach(function (m) { if (!m.isSitOut) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 2; } });
  ok(E.phaseComplete(t), 'G: liga COMPLETA com 2 de 2 rodadas jogadas');
  // feed-forward: bracketPhaseGroups enxerga os jogos da liga (em phaseRounds) e entrega standings
  var grp = E.bracketPhaseGroups(t, 1);
  ok(Array.isArray(grp) && grp.length >= 1 && grp[0].standings && grp[0].standings.length === 8, 'G: feed-forward da liga → 1 grupo com 8 classificados ordenados');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-brick4: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
