/* RESET completo do torneio — bug do dono: "resetei mas voltou pra fase 2".
 * _clearTournamentDraw deve zerar TODO estado de sorteio/fase/presença/W.O. e voltar
 * aos inscritos, como se nenhum sorteio tivesse sido feito. node tests/reset-tournament.test.js
 *
 * Causa: t.phaseRounds (rodadas da fase 2) NÃO era limpo → _collectAllMatches ainda via
 * os jogos → torneio "voltava" pra fase 2. Também faltavam presença e W.O.
 */
const { window: W, load } = require('./headless.js');

W.AppStore = W.AppStore || {};
W.AppStore.tournaments = [];
load('tournaments-draw.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// torneio multi-fase JÁ na fase 2, com presença, W.O., ghosts, folgas, datas de sorteio.
function mkPlayed() {
  return {
    id: 'R', format: 'Liga', status: 'active',
    participants: [
      { displayName: 'A', name: 'A', uid: 'ua' }, { displayName: 'B', name: 'B', uid: 'ub' },
      { displayName: 'C', name: 'C', uid: 'uc' }, { displayName: 'D', name: 'D', uid: 'ud' }
    ],
    phases: [{ name: 'F1', formatCode: 'liga' }, { name: 'F2', formatCode: 'elim_simples', bracketResolution: 'playin' }],
    currentPhaseIndex: 1, currentStage: 'phase1', _phaseMaterialized: 1, _canonicalDraw: true,
    matches: [{ id: 'm1', phaseIndex: 1, p1: 'A', p2: 'B', winner: 'A' }],
    rounds: [{ round: 1, matches: [{ id: 'r1', p1: 'A', p2: 'C', winner: 'A' }] }],
    // fase 2 posterior (Liga incremental) em t.phaseRounds — o que ficava grudado
    phaseRounds: { 1: { rounds: [{ round: 1, matches: [{ id: 'pr1', p1: 'A', p2: 'D', winner: 'A' }] }], pool: [{ displayName: 'A' }] } },
    standings: [{ name: 'A', points: 3 }],
    // presença + W.O.
    checkedIn: { ua: 123, ub: 456 }, absent: { uc: true },
    ligaSubInvites: [{ id: 'sub1', status: 'pending' }],
    woClaims: [{ id: 'wo1', status: 'pending' }],
    ligaGhosts: ['Jogador X'],
    monarchWaitlist: { _default_: ['E'] },
    woHistory: { A: { matchNum: 1 } },
    opponentHistory: { _default_: { A: ['B'] } },
    // datas/estado de sorteio
    lastAutoDrawAt: 999, nextDrawAt: 888, tournamentStarted: 777, finishedAt: 555,
    teamOrigins: {}
  };
}

// stubs mínimos que _clearTournamentDraw/_clearDrawRuntimeFlags usam
W._countCompetitors = W._countCompetitors || function (t) { return { people: (t.participants || []).length }; };

(function () {
  var t = mkPlayed();
  W._clearTournamentDraw(t);

  // ── ESTADO DE JOGO/FASE ZERADO ──
  ok((t.matches || []).length === 0, 'matches zerado');
  ok((t.rounds || []).length === 0, 'rounds zerado');
  ok(!t.phaseRounds || Object.keys(t.phaseRounds).length === 0, 'phaseRounds LIMPO (não volta mais pra fase 2) [' + JSON.stringify(t.phaseRounds) + ']');
  ok(t.currentPhaseIndex === 0, 'currentPhaseIndex volta a 0');
  ok(t._phaseMaterialized === 0, '_phaseMaterialized zerado');
  ok(!t._canonicalDraw, '_canonicalDraw desligado');
  ok(!t.standings, 'standings limpo');
  // _collectAllMatches NÃO deve mais achar jogo nenhum
  var _all = (typeof W._collectAllMatches === 'function') ? W._collectAllMatches(t) : [];
  ok(_all.length === 0, '_collectAllMatches vê ZERO jogos após reset [' + _all.length + ']');

  // ── PRESENÇA ZERADA ──
  ok(Object.keys(t.checkedIn || {}).length === 0, 'checkedIn (presença) zerado');
  ok(Object.keys(t.absent || {}).length === 0, 'absent zerado');

  // ── W.O. ZERADO ──
  ok(!t.ligaSubInvites || t.ligaSubInvites.length === 0, 'ligaSubInvites (convites W.O.) zerado');
  ok(!t.woClaims || t.woClaims.length === 0, 'woClaims (apontamentos) zerado');
  ok(!t.ligaGhosts || t.ligaGhosts.length === 0 || t.ligaGhosts === null, 'ligaGhosts (Jogador X) zerado');
  ok(!t.monarchWaitlist || Object.keys(t.monarchWaitlist).length === 0, 'monarchWaitlist (folgas) zerado');
  ok(!t.woHistory, 'woHistory zerado');

  // ── DATAS/ESTADO DE SORTEIO ──
  ok(!t.lastAutoDrawAt, 'lastAutoDrawAt zerado');
  ok(!t.tournamentStarted, 'tournamentStarted zerado');

  // ── INSCRITOS PRESERVADOS ──
  ok((t.participants || []).length === 4, 'os 4 inscritos MANTIDOS [' + (t.participants || []).length + ']');

  // ── bracketResolution da fase limpo (re-avanço reabre o painel) ──
  ok(!t.phases[1].bracketResolution, 'bracketResolution da fase 2 limpo (painel reabre no re-avanço)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' reset-tournament: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
