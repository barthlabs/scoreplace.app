/* Eliminatória que ABRE com rodada Rei/Rainha (v4.5.51) — node tests/elim-reirainha-opening.test.js
 *
 * Nova alternativa da fase eliminatória (project_elim_rei_rainha_opening_round): a elim começa
 * por UMA rodada Rei/Rainha (grupos de 4 sorteados) e as duplas se formam DENTRO de cada grupo,
 * pela estratégia (performance 1º+2º/3º+4º · equilíbrio 1º+4º/2º+3º), com corte de X (2 ou 4) por
 * grupo de 4. Neste increment vale só na eliminação DIRETA (sem classificatória antes = 2 fases).
 *
 * Cobre 2 camadas REAIS:
 *   (1) COMPILADOR (format2.js): openReiRainha → emite [Rei/Rainha (1 rodada), elim per_group + corte].
 *   (2) TRANSIÇÃO (phases-engine.buildEntrantsByDest scope:'per_group'): forma as duplas DENTRO de
 *       cada grupo de 4, respeitando o corte e a estratégia. É a peça que carrega a feature.
 * Ver feedback_tests_must_reproduce_real_failure.
 */
const { window, load, E } = require('./headless.js');
load('format2.js');
const F = window.FORMAT2;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── (1) COMPILADOR ───────────────────────────────────────────────────────────
function cfg(over) {
  var base = {
    disputa: 'dupla', grupos: 1, classifAtiva: false,
    eliminatoria: { ativa: true, openReiRainha: true, reiRainhaCut: 4, formacao: 'performance', linhas: 1, dupla: false, terceiro: true }
  };
  if (over) Object.assign(base, over);
  return base;
}

(function () {
  var out = F.compileToPhases(cfg(), { sport: 'Beach Tennis' });
  ok(out.phases.length === 2, '(1) openRR direto → 2 fases (RR + elim) [' + out.phases.length + ']');
  var p0 = out.phases[0], p1 = out.phases[1];
  ok(p0.reiRainha === true && p0.rounds === 1, '(1) p0 = Rei/Rainha, 1 rodada');
  ok(p0.source && p0.source.type === 'enrollment', '(1) p0 vem do enrollment');
  ok(out.topLevel.drawMode === 'rei_rainha' && out.topLevel.format === 'Liga', '(1) topLevel espelha a fase RR');
  ok(p1.source && p1.source.type === 'previous_phase' && p1.source.scope === 'per_group', '(1) p1 lê a fase anterior POR GRUPO (não flatOverall)');
  ok(p1.source.qualifyTopN === 4, '(1) corte 4 → qualifyTopN 4');
  ok(p1.fixedPairs === true && p1.pairingStrategy === 'top', '(1) p1 forma duplas por performance (top)');
  ok(p1.mapping && p1.mapping[0].rankTo === 4, '(1) mapping rankTo = corte (4)');
})();

(function () {
  var out2 = F.compileToPhases(cfg({ eliminatoria: { ativa: true, openReiRainha: true, reiRainhaCut: 2, formacao: 'equilibrio', linhas: 1 } }), { sport: 'Beach Tennis' });
  ok(out2.phases[1].source.qualifyTopN === 2, '(1) corte 2 → qualifyTopN 2');
  ok(out2.phases[1].pairingStrategy === 'balanced', '(1) equilíbrio → balanced');
  ok(out2.phases[1].mapping[0].rankTo === 2, '(1) mapping rankTo = 2');
})();

// GATING: com classificatória (3 fases) é próximo passo → normalize desliga openRR neste increment.
(function () {
  var outC = F.normalize(cfg({ classifAtiva: true }), 'Beach Tennis');
  ok(outC.eliminatoria.openReiRainha === false, '(1) com classificatória → openRR normalizado pra OFF (increment atual)');
  var outI = F.normalize(cfg({ disputa: 'individual' }), 'Tênis'); // Tênis permite singles
  ok(outI.eliminatoria.openReiRainha === false, '(1) individual → openRR OFF (só duplas)');
})();

// ── (2) TRANSIÇÃO por-grupo (buildEntrantsByDest scope:'per_group') ───────────
// Grupos de 4 já RANQUEADOS (computeStandings devolve na ordem dada = classificação do grupo).
function grp(names) { return { players: names.map(function (n) { return { name: n, displayName: n }; }) }; }
var cs = function (g) { return g.players.map(function (p) { return { name: p.name, displayName: p.displayName }; }); };
var groups = [grp(['A1', 'A2', 'A3', 'A4']), grp(['B1', 'B2', 'B3', 'B4'])];
function members(team) { return (team.participants || []).map(function (m) { return m.name; }); }
function sameGroup(ns) { var pre = ns.map(function (n) { return n[0]; }); return pre.every(function (p) { return p === pre[0]; }); }

(function () {
  // corte 4, performance → cada grupo vira 2 duplas: (1º+2º),(3º+4º)
  var bd = E.buildEntrantsByDest(groups, [{ dest: 'main', rankFrom: 1, rankTo: 4 }], true, cs, 'top', { scope: 'per_group' });
  ok(bd.main.length === 4, '(2) cut4/perf: 2 grupos × 2 duplas = 4 duplas [' + bd.main.length + ']');
  ok(bd.main.every(function (t) { return members(t).length === 2 && sameGroup(members(t)); }), '(2) cut4/perf: cada dupla = 2 pessoas DO MESMO grupo de 4');
  var ps = bd.main.map(function (t) { return members(t).join('+'); }).sort();
  ok(ps.indexOf('A1+A2') !== -1 && ps.indexOf('A3+A4') !== -1, '(2) cut4/perf: grupo A → (A1+A2),(A3+A4)');
})();

(function () {
  // corte 2 → só os 2 melhores de cada grupo formam 1 dupla
  var bd = E.buildEntrantsByDest(groups, [{ dest: 'main', rankFrom: 1, rankTo: 2 }], true, cs, 'top', { scope: 'per_group' });
  ok(bd.main.length === 2, '(2) cut2: 1 dupla por grupo = 2 duplas [' + bd.main.length + ']');
  var ps = bd.main.map(function (t) { return members(t).join('+'); }).sort();
  ok(ps.join(',') === 'A1+A2,B1+B2', '(2) cut2: só os 2 melhores (A1+A2, B1+B2) [' + ps.join(',') + ']');
})();

(function () {
  // corte 4, equilíbrio → 1º+4º, 2º+3º dentro do grupo
  var bd = E.buildEntrantsByDest(groups, [{ dest: 'main', rankFrom: 1, rankTo: 4 }], true, cs, 'balanced', { scope: 'per_group' });
  var ps = bd.main.map(function (t) { return members(t).join('+'); }).sort();
  ok(ps.indexOf('A1+A4') !== -1 && ps.indexOf('A2+A3') !== -1, '(2) cut4/equil: grupo A → (A1+A4),(A2+A3) [' + ps.join(',') + ']');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' elim-reirainha-opening: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
