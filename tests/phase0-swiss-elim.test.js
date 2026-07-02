/* Reprodução do bug "quartas do CASAIS" (project_gold_silver_format / project_progress_end_multiphase):
 * uma classificatória Suíço/Liga como FASE 0 do construtor de fases → eliminatória
 * na FASE 1. Os jogos da fase-0 Liga moram em t.rounds (storage nativo, via
 * _generateNextRound), NÃO taggeados bracket:'league' (isso é só fase 1+).
 *
 * BUG: prevPhaseGroups(t) só entende monarchGroups / t.groups / tagged bracket:'group'
 * → devolve [] pra uma classificatória Liga na fase 0. Consequências:
 *   (1) phaseComplete(t)=false → a fase nunca fecha → a eliminatória (quartas) nunca gera;
 *   (2) o total de jogos do torneio não soma a eliminatória → progresso "100%" precoce.
 *
 * Este teste FALHA no motor atual e deve PASSAR após ensinar a fase 0 a tratar Liga
 * (espelhando o ramo 'league' que bracketPhaseGroups já tem pras fases 1+).
 *
 * node tests/phase0-swiss-elim.test.js
 */
var g = globalThis;
if (!g.window) g.window = g;
g.window._t = function (k, v) { return (v && v.name) ? v.name : k; };
g.window._warn = function () {}; g.window._log = function () {}; g.window._error = function () {};

require('../js/views/tournaments-utils.js');
require('../js/views/tournaments-categories.js');
require('../js/views/bracket-model.js');
require('../js/views/bracket-logic.js');       // _computeStandings
var E = require('../js/views/phases-engine.js');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ FALHOU:', m); } }

// 8 duplas, classificatória Suíço/Liga (fase 0) de 1 rodada = 4 jogos, todos decididos.
// Top 4 avançam pra eliminatória (fase 1): semis (2) + final (1) [+ 3º/4º].
function mkTournament() {
  var teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return {
    id: 'tSwissElim',
    format: 'Eliminatórias Simples', // formato do topo do form (vira a fase 1)
    phases: [
      { name: 'Classificatória', formatCode: 'liga', rounds: 1 },
      // fixedPairs:false → os classificados entram como INDIVÍduos (top 4 → 2 semis),
      // pra o teste exercitar uma chave de vários jogos (não o pareamento em duplas).
      { name: 'Eliminatória', formatCode: 'elim', fixedPairs: false, source: { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 4 }] } }
    ],
    currentPhaseIndex: 0,
    rounds: [
      { round: 1, status: 'active', matches: [
        { id: 's1', round: 1, p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 2 },
        { id: 's2', round: 1, p1: 'C', p2: 'D', winner: 'C', scoreP1: 6, scoreP2: 3 },
        { id: 's3', round: 1, p1: 'E', p2: 'F', winner: 'E', scoreP1: 6, scoreP2: 1 },
        { id: 's4', round: 1, p1: 'G', p2: 'H', winner: 'G', scoreP1: 6, scoreP2: 4 }
      ] }
    ],
    matches: [],
    participants: teams.map(function (n) { return { displayName: n, name: n, uid: 'u' + n }; })
  };
}

var t = mkTournament();

// ── (1) prevPhaseGroups reconhece a classificatória Liga da fase 0 ──
var groups = E.prevPhaseGroups(t);
ok(Array.isArray(groups) && groups.length >= 1, 'prevPhaseGroups devolve ≥1 grupo pra classificatória Liga na fase 0 (veio ' + (groups ? groups.length : 'null') + ')');
if (groups && groups.length) {
  var players = groups[0].players || (groups[0].standings || []).map(function (s) { return s.name || s.displayName; });
  ok(players && players.length === 8, 'o grupo da classificatória tem os 8 participantes (veio ' + (players ? players.length : 0) + ')');
}

// ── (2) phaseComplete: classificatória de 1 rodada, todos decididos → completa ──
ok(E.phaseComplete(t) === true, 'phaseComplete=true (classificatória de 1 rodada, todos os 4 jogos decididos)');

// ── (3) materializeNextPhase gera a eliminatória (fase 1) a partir do top 4 ──
// MESMA função de standings que o advanceMultiPhase REAL usa pra fase-0 não-monarca
// (phases-engine.js:1405 → _groupTeamStandings). Valida o caminho de produção.
var cs = function (grp) { return E.groupTeamStandings(grp, { tiebreakers: t.tiebreakers }); };

var res = E.materializeNextPhase(t, cs, 'm');
ok(res && res.ok, 'materializeNextPhase ok (' + (res ? (res.error || 'ok') : 'null') + ')');
var elimMs = (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === 1 && !m.isBye; });
ok(elimMs.length >= 2, 'eliminatória (fase 1) materializada: ≥2 jogos de semi a partir do top 4 (veio ' + elimMs.length + ')');
// os classificados são o TOPO da classificação (os 4 vencedores), não aleatórios.
var elimNames = {};
elimMs.forEach(function (m) { [m.p1, m.p2].forEach(function (n) { if (n && n !== 'TBD' && !/BYE/i.test(n)) elimNames[n] = 1; }); });
['A', 'C', 'E', 'G'].forEach(function (w) { ok(!!elimNames[w], 'classificado ' + w + ' (vencedor da classificatória) está na eliminatória'); });
['B', 'D', 'F', 'H'].forEach(function (l) { ok(!elimNames[l], 'eliminado ' + l + ' (perdedor) NÃO está na eliminatória'); });
ok(E.phaseComplete(t) === false || (t.currentPhaseIndex === 1), 'avançou pra fase 1 (currentPhaseIndex=' + t.currentPhaseIndex + ')');

console.log((fail === 0 ? '✅' : '❌') + ' phase0-swiss-elim: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
