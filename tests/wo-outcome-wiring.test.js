/* Fiação do DESFECHO do W.O. (Stage 1 — project_wo_outcome_negotiation_canon).
 * Exercita a cadeia REAL wo-claim → _applyClaimViaGate → _applyClaim → _applyWO com
 * AppStore.mutate mockado (roda o mutator + resolve). Prova:
 *  (a) organizador aplica W.O. individual de dupla → NÃO decide sozinho: abre o overlay
 *      de desfecho (needsOutcomeChoice) e o claim segue PENDENTE, jogo não decidido.
 *  (b) _woChooseOutcome('ghost') → Jogador X entra, parceiro segue, jogo não decidido,
 *      adversário não avança, claim vira 'applied'.
 *  (c) _woChooseOutcome('advance') → adversário vence por W.O., claim 'applied'.
 * FALHA no código antigo (o motor decidia sozinho; não havia overlay).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, body: {}, location: { hash: '' } };
sandbox.location = { hash: '' }; sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox._showLoading = sandbox._hideLoading = sandbox._rerenderBracket = sandbox._softRefreshView = () => {};
sandbox._sendUserNotification = () => {};
sandbox._opVoterName = () => '';
sandbox._canManagePresence = () => false;
sandbox._maybeFinishElimination = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };

const _pName = (p) => typeof p === 'string' ? p : ((p && (p.displayName || p.name)) || '');
sandbox._pName = _pName;
sandbox._participantUids = (p) => (p && typeof p === 'object' && p.uid) ? [p.uid] : [];
sandbox._displayNameForUid = (u, d) => ({ ua: 'A', ub: 'B', uc: 'C', ud: 'D' }[u] || d || '');
sandbox._isLigaFormat = (t) => !!(t && (t.format === 'Liga' || t.format === 'Ranking'));
sandbox._isMonarchFormat = () => false;
sandbox._resultEntryIncludes = (t, k) => { var re = t && t.resultEntry; return Array.isArray(re) ? re.indexOf(k) !== -1 : re === k; };
sandbox._idMapKey = (t, who) => ({ uid: (who && who.uid) || '', name: typeof who === 'string' ? who : ((who && (who.displayName || who.name)) || '') });
sandbox._idMapGet = (t, map, who) => { const k = sandbox._idMapKey(t, who); return (k.name && map) ? map[k.name] : undefined; };
sandbox._idMapHas = (t, map, who) => sandbox._idMapGet(t, map, who) !== undefined;
sandbox._idMapSet = (t, map, who, v) => { const k = sandbox._idMapKey(t, who); if (k.name && map) map[k.name] = v; };
sandbox._idMapDel = (t, map, who) => { const k = sandbox._idMapKey(t, who); if (k.name && map) delete map[k.name]; };
sandbox._getStandbyPool = (t) => (Array.isArray(t.standbyParticipants) ? t.standbyParticipants.slice() : []);
sandbox._woHistSet = sandbox._woHistGet = sandbox._woHistDel = () => {};

let _cu = { uid: 'org', displayName: 'Org' };
sandbox.AppStore = {
  tournaments: [],
  get currentUser() { return _cu; },
  isOrganizer: () => true,
  isCreator: () => false,
  logAction() {}, sync() {}, syncImmediate() {},
  // mock: roda o mutator no doc local e resolve (false = abortou/idempotência).
  mutate(tId, mutatorFn) {
    const t = sandbox.AppStore.tournaments.find(x => String(x.id) === String(tId));
    let r;
    try { r = mutatorFn(t); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(r !== false);
  },
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find(t => String(t.id) === String(id)) || null;
sandbox._woCloseOverlay = () => {};

vm.createContext(sandbox);
const ROOT = path.join(__dirname, '..');
['js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/participants.js', 'js/views/wo-claim.js']
  .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel }));
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');

function mkT(id) {
  const t = {
    id, name: 'T', format: 'Eliminatórias Simples', woScope: 'individual', resultEntry: ['organizer', 'players'],
    startDate: '2026-07-18T10:00', endDate: '2026-07-18T15:00',
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }, { displayName: 'C', uid: 'uc' }, { displayName: 'D', uid: 'ud' }],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', team1Uids: ['ua', 'ub'], team2Uids: ['uc', 'ud'], winner: null, nextMatchId: null }],
    woClaims: [{ id: 'wo1', scope: 'match', matchId: 'm1', byUid: 'ub', byName: 'B', absentName: 'A', absentUids: ['ua'], players: ['A / B', 'C / D'], status: 'pending', confirms: {} }],
  };
  W.AppStore.tournaments = [t];
  return t;
}

console.log('──── wo-outcome-wiring ────');
ok(typeof W._woOutcomeOverlay === 'function', '_woOutcomeOverlay existe');
ok(typeof W._woChooseOutcome === 'function', '_woChooseOutcome existe');

// (a) organizador aplica → abre overlay (needsOutcomeChoice), claim pendente, jogo não decidido
(async function () {
  const t = mkT('w1');
  let opened = null;
  W._woOutcomeOverlay = (tId, claimId, ctx) => { opened = { tId, claimId, ctx }; };
  W._woResolveApply('w1', 'wo1');
  await new Promise(r => setTimeout(r, 0));
  ok(opened && opened.claimId === 'wo1', 'oferece: overlay de desfecho foi aberto');
  ok(opened && opened.ctx && opened.ctx.partnerUid === 'ub', 'oferece: overlay recebeu o parceiro (ub)');
  eq(t.woClaims[0].status, 'pending', 'oferece: claim segue PENDENTE (não aplicou sozinho)');
  ok(!t.matches[0].winner, 'oferece: jogo NÃO decidido');
})().then(() => {
  // (b) ghost → parceiro segue, jogo não decide, claim applied
  return (async function () {
    const t = mkT('w2');
    W._woChooseOutcome('w2', 'wo1', 'ghost');
    await new Promise(r => setTimeout(r, 0));
    ok(!t.matches[0].winner, 'ghost: jogo NÃO decidido');
    ok(!t.matches[0].wo, 'ghost: sem W.O.');
    ok((t.matches[0].team1Uids || []).some(x => /^ghostwo_/.test(x)), 'ghost: Jogador X no slot');
    ok((t.matches[0].team1Uids || []).indexOf('ub') !== -1, 'ghost: parceiro ub segue');
    eq(t.woClaims[0].status, 'applied', 'ghost: claim virou applied');
  })();
}).then(() => {
  // (c) advance → adversário vence, claim applied
  return (async function () {
    const t = mkT('w3');
    W._woChooseOutcome('w3', 'wo1', 'advance');
    await new Promise(r => setTimeout(r, 0));
    eq(t.matches[0].winner, 'C / D', 'advance: adversário vence');
    ok(t.matches[0].wo, 'advance: m.wo=true');
    eq(t.woClaims[0].status, 'applied', 'advance: claim applied');
  })();
}).then(() => {
  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ wo-outcome-wiring FALHOU'); process.exit(1); }
  console.log('✅ wo-outcome-wiring: OK');
});
