/* Teste headless de window._applyRoundCloseToTournament (js/views/bracket-logic.js) —
 * a mutação PURA de fechar rodada extraída na blindagem (save #2). Trava a correção
 * FUNCIONAL no npm test (o teste de CORRIDA roda no emulador via test:concurrency).
 * Mesmo loader do apply-result.test.js (pura lógica, sem Firestore → vm serve).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, body: {} };
sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };
sandbox.AppStore = { tournaments: [], currentUser: null };
sandbox._idMapKey = (t, who) => ({ uid: (who && who.uid) || '', name: typeof who === 'string' ? who : ((who && (who.displayName || who.name)) || '') });
sandbox._idMapGet = (t, map, who) => { const k = sandbox._idMapKey(t, who); return (k.name && map) ? map[k.name] : undefined; };
sandbox._idMapHas = (t, map, who) => !!sandbox._idMapGet(t, map, who);
sandbox._idMapSet = (t, map, who, v) => { const k = sandbox._idMapKey(t, who); if (k.name && map) map[k.name] = v; };
sandbox._idMapDel = (t, map, who) => { const k = sandbox._idMapKey(t, who); if (k.name && map) delete map[k.name]; };
sandbox._memberUidByName = () => '';
vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..');
['js/views/sport-rules.js', 'js/views/tournaments-utils.js', 'js/views/tournaments-categories.js',
 'js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/bracket-ui.js'].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});
const W = sandbox;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

ok(typeof W._applyRoundCloseToTournament === 'function', '_applyRoundCloseToTournament carregou');

// ── 1. Suíço puro no fim → encerra ───────────────────────────────────────────
(function () {
  const t = {
    format: 'Suíço Clássico', swissRounds: 1, currentStage: 'swiss', p2Resolution: 'bye',
    participants: [{ displayName: 'A' }, { displayName: 'B' }],
    rounds: [{ status: 'active', matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: 'A' }] }],
  };
  const branch = W._applyRoundCloseToTournament(t, 0);
  eq(branch, 'pureSwissFinish', 'suíço puro no maxRounds → pureSwissFinish');
  eq(t.rounds[0].status, 'complete', 'rodada marcada complete');
  eq(t.status, 'finished', 'torneio encerrado');
})();

// ── 2. Suíço-como-classificação → só SINALIZA transição (não executa aqui) ────
(function () {
  const t = {
    format: 'Suíço Clássico', swissRounds: 1, currentStage: 'swiss', p2Resolution: 'swiss', p2TargetCount: 2,
    participants: [{ displayName: 'A' }, { displayName: 'B' }, { displayName: 'C' }, { displayName: 'D' }],
    rounds: [{ status: 'active', matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: 'A' }] }],
  };
  const branch = W._applyRoundCloseToTournament(t, 0);
  eq(branch, 'transition', 'suíço-classificação → sinaliza transition (é o item #3)');
  eq(t.rounds[0].status, 'complete', 'rodada marcada complete');
  ok(t.status !== 'finished', 'NÃO encerra (transição é do generateDrawFunction)');
  ok(t.currentStage === 'swiss', 'NÃO transiciona currentStage aqui');
})();

// ── 2b. Suíço-2-FASES (classificatória do construtor de fases) no maxRounds → NÃO encerra:
//    o avanço pra elim é do motor MULTIFASE (advanceMultiPhase), não o finish/transition
//    legado. REPRODUZ O BUG: como _buildSwissClassifDraw produz p2Resolution=null, o ramo
//    isSwissClassification é falso e caía em 'pureSwissFinish' (encerrava o torneio antes de
//    avançar pra fase 1). Ver project_draw_canonization_cf_phase23_deferred.
(function () {
  const t = {
    format: 'Eliminatórias Simples', swissRounds: 2, classifyFormat: 'swiss', currentStage: 'swiss',
    p2Resolution: null, p2TargetCount: null, currentPhaseIndex: 0,
    phases: [
      { name: 'Classificatória', formatCode: 'liga', format: 'Suíço', rounds: 2, source: { type: 'enrollment' } },
      { name: 'Elim', format: 'Eliminatórias Simples', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 8 }] } }
    ],
    participants: Array.from({ length: 12 }, (_, i) => ({ displayName: 'J' + i, name: 'J' + i, uid: 'u' + i })),
    rounds: [
      { round: 1, status: 'complete', matches: [] },
      { round: 2, status: 'active', matches: [{ id: 'm', p1: 'J0', p2: 'J1', winner: 'J0' }] }
    ],
  };
  const branch = W._applyRoundCloseToTournament(t, 1);
  eq(branch, 'phaseComplete', 'suíço-2-fases no maxRounds → phaseComplete (NÃO pureSwissFinish)');
  ok(t.status !== 'finished', 'NÃO encerra o torneio (avanço pra elim é do multifase)');
  eq(t.currentPhaseIndex, 0, 'ainda na fase 0 (o Avançar é separado)');
  eq(t.rounds[1].status, 'complete', 'rodada final marcada complete');
})();

// ── 3. Liga manual → ramo nextRound + fecha a rodada ─────────────────────────
(function () {
  const t = {
    format: 'Liga', drawManual: true,
    participants: [{ displayName: 'A' }, { displayName: 'B' }, { displayName: 'C' }, { displayName: 'D' }],
    rounds: [{ status: 'active', matches: [
      { id: 'm1', p1: 'A', p2: 'B', winner: 'A' },
      { id: 'm2', p1: 'C', p2: 'D', winner: 'C' },
    ] }],
  };
  let branch;
  try { branch = W._applyRoundCloseToTournament(t, 0); } catch (e) { branch = 'ERR:' + e.message; }
  eq(branch, 'nextRound', 'Liga manual → nextRound');
  eq(t.rounds[0].status, 'complete', 'rodada 0 marcada complete');
})();

// ── 4. Idempotência: se a próxima rodada JÁ existe, não gera duplicada ────────
(function () {
  const t = {
    format: 'Liga', drawManual: true,
    participants: [{ displayName: 'A' }, { displayName: 'B' }, { displayName: 'C' }, { displayName: 'D' }],
    rounds: [
      { status: 'complete', matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: 'A' }] },
      { status: 'active', matches: [{ id: 'm2', p1: 'A', p2: 'C', winner: 'A' }] }, // próxima já existe
    ],
  };
  const before = t.rounds.length;
  const branch = W._applyRoundCloseToTournament(t, 0); // re-fechar a rodada 0
  eq(branch, 'nextRound', 'idempotente: continua nextRound');
  eq(t.rounds.length, before, 'idempotente: NÃO gera rodada duplicada (rounds.length continua ' + before + ')');
})();

console.log((fail === 0 ? '✅' : '❌') + ' apply-round-close: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
