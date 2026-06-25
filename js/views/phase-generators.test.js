/* Teste headless do andaime canônico — node js/views/phase-generators.test.js
 * Increment 1: prova PARIDADE (zero mudança de comportamento) entre o módulo novo
 * (phase-generators) e o motor existente (phases-engine), + as funções puras novas.
 */
var P = require('./phase-generators.js');
var E = require('./phases-engine.js');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ FALHOU:', m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

// ── classifyPhaseFormat × _phaseIs* (paridade da decisão de formato) ─────────
[
  { cfg: { formatCode: 'grupos_mata' }, want: 'groups' },
  { cfg: { format: 'Fase de Grupos + Eliminatórias' }, want: 'groups' },
  { cfg: { formatCode: 'liga' }, want: 'league' },
  { cfg: { format: 'Liga' }, want: 'league' },
  { cfg: { format: 'Pontos Corridos' }, want: 'league' },
  { cfg: { format: 'Suíço' }, want: 'league' },
  { cfg: { formatCode: 'elim_dupla' }, want: 'elim' },
  { cfg: { formatCode: 'elim_simples' }, want: 'elim' },
  { cfg: { format: 'Dupla Eliminatória' }, want: 'elim' },
  { cfg: { formatCode: 'liga', reiRainha: true }, want: 'league' } // rei/rainha não muda o FORMATO; é modo de sorteio
].forEach(function (c) {
  // classifyPhaseFormat devolve o FORMATO (ortogonal ao modo de sorteio): Rei/Rainha
  // em Pontos Corridos continua 'league' como FORMATO; o roteamento do gerador
  // monarca é checado nas paridades abaixo (modo de sorteio tem precedência lá).
  eq(P.classifyPhaseFormat(c.cfg), c.want, 'classifyPhaseFormat ' + JSON.stringify(c.cfg));
});
// Coerência de ROTEAMENTO com os detectores legados (só casos NÃO-monarca, onde
// formato e roteamento coincidem 1:1):
[
  { cfg: { formatCode: 'grupos_mata' }, det: 'groups' },
  { cfg: { formatCode: 'liga' }, det: 'league' },
  { cfg: { formatCode: 'elim_dupla' }, det: 'elim' }
].forEach(function (c) {
  var cls = P.classifyPhaseFormat(c.cfg);
  ok((cls === 'groups') === !!E.phaseIsGroups(c.cfg), 'roteamento groups ' + JSON.stringify(c.cfg));
  ok((cls === 'league') === !!E.phaseIsLiga(c.cfg), 'roteamento league ' + JSON.stringify(c.cfg));
});
ok(P.isMonarchDraw({ reiRainha: true }), 'isMonarchDraw reiRainha');
ok(P.isMonarchDraw({ drawMode: 'rei_rainha' }), 'isMonarchDraw drawMode');
ok(!P.isMonarchDraw({ reiRainha: false }), 'isMonarchDraw false');

// ── normalizePhases ──────────────────────────────────────────────────────────
eq(P.normalizePhases({ phases: [{ name: 'A' }, { name: 'B' }] }).length, 2, 'normalize: multi-fase preserva length');
(function () {
  var single = { format: 'Liga', drawMode: 'rei_rainha', rounds: [{ round: 1 }], scoring: { type: 'gsm' }, phase1Name: 'Temporada' };
  var n = P.normalizePhases(single);
  eq(n.length, 1, 'normalize: fase única = pilha de 1');
  eq(n[0].format, 'Liga', 'normalize: preserva format');
  eq(n[0].reiRainha, true, 'normalize: reiRainha de drawMode');
  eq(n[0].scoring, { type: 'gsm' }, 'normalize: preserva scoring');
  eq(P.classifyPhaseFormat(n[0]), 'league', 'normalize: fase única Liga → league');
})();
(function () {
  var elim = { format: 'Dupla Eliminatória', rounds: [] };
  eq(P.classifyPhaseFormat(P.normalizePhases(elim)[0]), 'elim', 'normalize: fase única elim → elim');
})();

// ── PARIDADE dos geradores (generatePhase === buildPhase* atual) ─────────────
var prevG = [{ name: 'C', standings: [] }];
for (var i = 1; i <= 8; i++) prevG[0].standings.push({ name: 'P' + i, uid: 'u' + i });
var cs = function (g) { return g.standings; };
function ctx(id) { return { computeStandings: cs, idPrefix: id }; }
var srcAll = { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] };

// groups
(function () {
  var cfg = { name: 'G', formatCode: 'grupos_mata', gruposCount: 2, fixedPairs: false, source: srcAll };
  eq(P.generatePhase(prevG, cfg, ctx('x')), E.buildPhaseGroupStage(prevG, cfg, cs, 'x'), 'paridade groups');
})();
// rei/rainha (groups + reiRainha → buildPhaseMonarchStage)
(function () {
  var cfg = { name: 'M', format: 'liga', reiRainha: true, source: srcAll };
  eq(P.generatePhase(prevG, cfg, ctx('x')), E.buildPhaseMonarchStage(prevG, cfg, cs, 'x'), 'paridade rei/rainha');
})();
// league
(function () {
  var cfg = { name: 'L', formatCode: 'liga', source: srcAll };
  eq(P.generatePhase(prevG, cfg, ctx('x')), E.buildPhaseLeagueStage(prevG, cfg, cs, 'x'), 'paridade league');
})();
// elim
(function () {
  var cfg = { name: 'E', formatCode: 'elim_dupla', fixedPairs: true, grandFinal: true, thirdPlace: true,
    source: { mapping: [{ dest: 'upper', rankFrom: 1, rankTo: 2 }, { dest: 'lower', rankFrom: 3, rankTo: 4 }] } };
  eq(P.generatePhase(prevG, cfg, ctx('x')), E.buildPhaseBrackets(prevG, cfg, cs, 'x'), 'paridade elim');
})();
// selectQualifiers === buildEntrantsByDest
(function () {
  var cfg = { fixedPairs: false, pairingStrategy: 'top', source: srcAll };
  var got = P.selectQualifiers(prevG, cfg, ctx('x'));
  var want = E.buildEntrantsByDest(prevG, srcAll.mapping, false, cs, 'top', { scope: 'per_group', rankingBasis: 'individual' });
  eq(got, want, 'paridade selectQualifiers');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-generators: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
