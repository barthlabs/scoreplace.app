/* Leitura unificada do storage canônico de GRUPOS / monarca (modo Rei/Rainha) na fase 0 —
 * node tests/phase0-groups-canonical.test.js
 *
 * Contrato project_unify_initial_phase_canonical, passo (b): quando a fase 0 de grupos (ou
 * do MODO Rei/Rainha) é desenhada pelo motor (generatePhase → storePhase → t.matches
 * taggeado, SEM t.groups/t.rounds nativo), o AVANÇO pra próxima fase tem que funcionar:
 *   • prevPhaseGroups reconstrói grupos (players+matches) de t.matches taggeado;
 *   • phaseComplete vê todos os jogos decididos;
 *   • a transição classifica certo — grupos por TIME, Rei/Rainha por INDIVÍDUO (parceiro
 *     rotativo coroa 1 pessoa, nunca dupla).
 * Trava o que eu quebrei antes (prevPhaseGroups lia só t.groups → avanço travava).
 */
const { window: W, E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function pool(n) { var a = []; for (var i = 1; i <= n; i++) a.push({ displayName: 'J' + i, name: 'J' + i }); return a; }
var ELIM_CFG = { name: 'Eliminatória', format: 'Eliminatórias Simples', formatCode: 'elim_simples', bracketResolution: 'bye', source: { type: 'previous', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 1 }] } };

function buildPhase0(t, cfg0) {
  var built = E.generatePhase(pool(8), cfg0, { t: t, idPrefix: 'p0' });
  E.storePhase(t, 0, built);
  return built;
}
function decideAll(t) {
  (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === 0; }).forEach(function (m) {
    if (!m.winner && !m.isBye && !m.isSitOut) m.winner = m.p1;
  });
}

// ── GRUPOS (round-robin) na fase 0 → t.matches taggeado, avanço por TIME ──────
(function () {
  var cfg0 = { name: 'Fase de Grupos', format: 'Fase de Grupos + Eliminatórias', formatCode: 'grupos_mata', gruposCount: 2, gruposClassified: 1, source: { type: 'enrollment' } };
  var t = { id: 'g', phases: [cfg0, ELIM_CFG], currentPhaseIndex: 0, participants: pool(8) };
  buildPhase0(t, cfg0);
  ok(!t.groups && (t.matches || []).some(function (m) { return m.bracket === 'group' && (m.phaseIndex || 0) === 0; }), 'grupos fase 0 → t.matches taggeado bracket=group (sem t.groups nativo)');
  var rec = E.prevPhaseGroups(t);
  ok(rec.length === 2 && rec.every(function (g) { return g.players.length === 4 && g.matches.length === 6; }), 'prevPhaseGroups reconstrói 2 grupos (4 jogadores, 6 jogos round-robin cada) [' + rec.map(function (g) { return g.players.length + '/' + g.matches.length; }).join(',') + ']');
  ok(E.phaseComplete(t) === false, 'phaseComplete=false antes de decidir');
  decideAll(t);
  ok(E.phaseComplete(t) === true, 'phaseComplete=true depois de decidir todos os jogos');
  var res = E.materializeNextPhase(t, E.groupTeamStandings, 'ph1');
  ok(res && res.ok && (t.matches || []).some(function (m) { return (m.phaseIndex || 0) === 1; }), 'avanço grupos→elim: fase 1 materializada (jogos phaseIndex=1) [' + (res && res.error || 'ok') + ']');
})();

// ── MODO Rei/Rainha na fase 0 → rota league (t.rounds nativo), avanço por INDIVÍDUO ──
(function () {
  var cfg0 = { name: 'Rei/Rainha', format: 'Rei/Rainha da Praia', formatCode: 'grupos_mata', drawMode: 'rei_rainha', reiRainha: true, source: { type: 'enrollment' } };
  var t = { id: 'm', phases: [cfg0, ELIM_CFG], currentPhaseIndex: 0, participants: pool(8) };
  // Campanha kill-monarch-format: monarch NÃO passa por storePhase — generatePhase
  // aplica direto em t (rota league incremental, t.rounds[].monarchGroups nativo).
  var built = E.generatePhase(pool(8), cfg0, { t: t, idPrefix: 'p0' });
  ok(built && built.appliedToT === true, 'Rei/Rainha fase 0 → rota league (appliedToT, t.rounds nativo)');
  ok(t.ligaRoundFormat === 'rei_rainha', 'reroteio marca ligaRoundFormat=rei_rainha');
  ok(!(t.matches || []).length && Array.isArray(t.rounds) && t.rounds.length === 1 && (t.rounds[0].monarchGroups || []).length === 2, 't.rounds[0].monarchGroups com 2 grupos (nada no modelo antigo t.matches)');
  var rec = E.prevPhaseGroups(t);
  ok(rec.length === 2 && rec.every(function (g) { return g.players.length === 4 && g.matches.length === 3; }), 'prevPhaseGroups reconstrói 2 grupos de 4 (3 jogos rotativos cada) [' + rec.map(function (g) { return g.players.length + '/' + g.matches.length; }).join(',') + ']');
  // classificação INDIVIDUAL: cada grupo tem 4 PESSOAS no standing (não 2 duplas)
  var st0 = W._computeMonarchStandings({ players: rec[0].players, matches: rec[0].matches });
  ok(st0.length === 4, 'Rei/Rainha classifica por INDIVÍDUO: 4 pessoas no grupo (não duplas) [' + st0.length + ']');
  (t.rounds || []).forEach(function (r) { (r.matches || []).forEach(function (m) { if (!m.winner && !m.isBye && !m.isSitOut) m.winner = m.p1; }); });
  ok(E.phaseComplete(t) === true, 'phaseComplete=true (rodada monarca nativa decidida)');
  // avanço com cs INDIVIDUAL (replica a seleção do advanceMultiPhase via prevPhaseGroups+isMonarch)
  var _isMon = E.prevPhaseGroups(t).some(function (g) { return (g.matches || []).some(function (mm) { return mm.isMonarch; }); });
  ok(_isMon === true, 'advanceMultiPhase detectaria monarca via prevPhaseGroups (isMonarch nos jogos)');
  var csMon = function (g) { return W._computeMonarchStandings({ players: g.players || [], matches: g.matches || [] }); };
  var res = E.materializeNextPhase(t, csMon, 'ph1');
  ok(res && res.ok && (t.matches || []).some(function (m) { return (m.phaseIndex || 0) === 1; }), 'avanço rei→elim: fase 1 materializada [' + (res && res.error || 'ok') + ']');
  // os entrantes da elim são INDIVÍDUOS (nome simples), não duplas "A / B"
  var p1ms = (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === 1; });
  var anyDupla = p1ms.some(function (m) { return /\s\/\s/.test(String(m.p1 || '')) || /\s\/\s/.test(String(m.p2 || '')); });
  ok(!anyDupla, 'elim pós-Rei/Rainha tem INDIVÍDUOS (sem "A / B")');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase0-groups-canonical: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
