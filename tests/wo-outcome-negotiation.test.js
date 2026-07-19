/* Negociação do DESFECHO do W.O. por PARTICIPANTE (Stage 2 —
 * project_wo_outcome_negotiation_canon). Exercita a cadeia REAL
 * wo-claim → _outcomeCtx → _woEnterNegotiation → _woProposeOutcome →
 * _woAcceptOutcome / _woRejectOutcome → escala ao organizador, com AppStore.mutate
 * mockado (roda o mutator + resolve). Regras confirmadas pelo dono (18-jul-2026):
 *  • quando o W.O. é INDIVIDUAL de dupla (o parceiro segue) e vem de PARTICIPANTE, o
 *    desfecho é NEGOCIADO: o adversário CONFIRMA a falta → NÃO decide sozinho; entra
 *    em 'awaiting-proposal'. O PARCEIRO que ficou PROPÕE; o ADVERSÁRIO aceita/rejeita;
 *    sem acordo ESCALA pro organizador.
 *  • W.O. de TIME (dupla inteira faltou) / 1×1 continua auto-resolvendo na confirmação.
 * FALHA no código antigo (o _woConfirm aplicava o W.O. na hora — jogo decidia, sem
 * sub-estado de desfecho).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let lastOverlay = '';
const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
sandbox.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => { const el = { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelectorAll: () => [], _h: '' }; Object.defineProperty(el, 'innerHTML', { set(v) { el._h = v; lastOverlay = v; }, get() { return el._h; } }); return el; },
  addEventListener() {}, body: { appendChild() {} }, location: { hash: '' }
};
sandbox.location = { hash: '' }; sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox._showLoading = sandbox._hideLoading = sandbox._rerenderBracket = sandbox._softRefreshView = () => {};
sandbox._sendUserNotification = () => {};
sandbox._notifyOrgAndCoHosts = () => {};
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
  isOrganizer: () => _cu && _cu.uid === 'org',
  isCreator: () => false,
  logAction() {}, sync() {}, syncImmediate() {},
  mutate(tId, mutatorFn) {
    const t = sandbox.AppStore.tournaments.find(x => String(x.id) === String(tId));
    let r;
    try { r = mutatorFn(t); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(r !== false);
  },
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find(t => String(t.id) === String(id)) || null;

vm.createContext(sandbox);
const ROOT = path.join(__dirname, '..');
['js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/participants.js', 'js/views/wo-claim.js']
  .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel }));
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');
const as = (u) => { _cu = { uid: u, displayName: ({ ua: 'A', ub: 'B', uc: 'C', ud: 'D' }[u] || u) }; };
const tick = () => new Promise(r => setTimeout(r, 0));

// A / B (dupla) vs C / D. B apontou que A faltou → claim pending, confirmadores = C, D.
function mkT(id, absentUids) {
  const t = {
    id, name: 'T', format: 'Eliminatórias Simples', woScope: 'individual', resultEntry: ['organizer', 'players'],
    startDate: '2026-07-18T10:00', endDate: '2026-07-18T15:00', creatorUid: 'org',
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }, { displayName: 'C', uid: 'uc' }, { displayName: 'D', uid: 'ud' }],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', team1Uids: ['ua', 'ub'], team2Uids: ['uc', 'ud'], winner: null, nextMatchId: null }],
    woClaims: [{ id: 'wo1', scope: 'match', matchId: 'm1', byUid: 'ub', byName: 'B', absentName: 'A', absentUids: absentUids || ['ua'], players: ['A / B', 'C / D'], status: 'pending', confirms: {} }],
  };
  W.AppStore.tournaments = [t];
  return t;
}

console.log('──── wo-outcome-negotiation ────');
ok(typeof W._woProposeOutcome === 'function', '_woProposeOutcome existe');
ok(typeof W._woAcceptOutcome === 'function', '_woAcceptOutcome existe');
ok(typeof W._woRejectOutcome === 'function', '_woRejectOutcome existe');

(async function () {
  // (a) adversário confirma a falta → NÃO decide; entra em negociação
  const t = mkT('n1');
  as('uc'); // adversário
  W._woConfirm('n1', 'wo1');
  await tick();
  const c = t.woClaims[0];
  eq(c.status, 'pending', 'confirmar: claim segue pendente (falta confirmada, desfecho a negociar)');
  eq(c.outcomeStage, 'awaiting-proposal', 'confirmar: entra em awaiting-proposal');
  eq(c.outcomePartnerUid, 'ub', 'confirmar: parceiro que ficou = ub');
  ok((c.outcomeOppUids || []).indexOf('uc') !== -1, 'confirmar: adversário uc registrado');
  ok(!t.matches[0].winner, 'confirmar: jogo NÃO decidido (o antigo decidia aqui)');
  ok(!t.absent['ua'], 'confirmar: ausência ainda NÃO marcada');
})().then(() => (async function () {
  // (b) parceiro propõe 'advance' → proposta registrada
  const t = mkT('n2'); as('uc'); W._woConfirm('n2', 'wo1'); await tick();
  as('ub'); // parceiro
  W._woProposeOutcome('n2', 'wo1', 'advance');
  await tick();
  const c = t.woClaims[0];
  eq(c.outcomeStage, 'proposed', 'propor: vira proposed');
  eq(c.outcomeProposal && c.outcomeProposal.choice, 'advance', 'propor: choice=advance');
  eq(c.outcomeProposal && c.outcomeProposal.byUid, 'ub', 'propor: byUid=ub');
  ok(!t.matches[0].winner, 'propor: jogo ainda NÃO decidido');
})()).then(() => (async function () {
  // (c) adversário ACEITA → aplica o desfecho
  const t = mkT('n3'); as('uc'); W._woConfirm('n3', 'wo1'); await tick();
  as('ub'); W._woProposeOutcome('n3', 'wo1', 'advance'); await tick();
  as('uc'); W._woAcceptOutcome('n3', 'wo1'); await tick();
  const c = t.woClaims[0];
  eq(c.status, 'applied', 'aceitar: claim virou applied');
  eq(t.matches[0].winner, 'C / D', 'aceitar: adversário vence por W.O.');
  ok(t.matches[0].wo, 'aceitar: m.wo=true');
})()).then(() => (async function () {
  // (d) parceiro NÃO pode aceitar (só o adversário)
  const t = mkT('n4'); as('uc'); W._woConfirm('n4', 'wo1'); await tick();
  as('ub'); W._woProposeOutcome('n4', 'wo1', 'advance'); await tick();
  as('ub'); W._woAcceptOutcome('n4', 'wo1'); await tick(); // proponente tentando aceitar
  const c = t.woClaims[0];
  eq(c.status, 'pending', 'aceite-inválido: proponente NÃO aplica');
  ok(!t.matches[0].winner, 'aceite-inválido: jogo não decidido');
})()).then(() => (async function () {
  // (e) adversário REJEITA → escala pro organizador
  const t = mkT('n5'); as('uc'); W._woConfirm('n5', 'wo1'); await tick();
  as('ub'); W._woProposeOutcome('n5', 'wo1', 'advance'); await tick();
  as('uc'); W._woRejectOutcome('n5', 'wo1'); await tick();
  const c = t.woClaims[0];
  eq(c.outcomeStage, 'escalated', 'rejeitar: vira escalated');
  ok(!t.matches[0].winner, 'rejeitar: jogo NÃO decidido — o organizador decide');
})()).then(() => (async function () {
  // (f) organizador resolve o escalado via _woChooseOutcome('ghost')
  const t = mkT('n6'); as('uc'); W._woConfirm('n6', 'wo1'); await tick();
  as('ub'); W._woProposeOutcome('n6', 'wo1', 'advance'); await tick();
  as('uc'); W._woRejectOutcome('n6', 'wo1'); await tick();
  as('org'); W._woChooseOutcome('n6', 'wo1', 'ghost'); await tick();
  const c = t.woClaims[0];
  eq(c.status, 'applied', 'org resolve: applied');
  ok((t.matches[0].team1Uids || []).some(x => /^ghostwo_/.test(x)), 'org resolve: Jogador X entrou');
  ok(!t.matches[0].winner, 'org resolve: ghost não decide o jogo');
})()).then(() => (async function () {
  // (g) W.O. de TIME (dupla inteira) confirmado → auto-resolve (SEM negociação)
  const t = mkT('n7', ['ua', 'ub']); as('uc'); W._woConfirm('n7', 'wo1'); await tick();
  const c = t.woClaims[0];
  ok(!c.outcomeStage, 'time: sem negociação (não é individual)');
  eq(t.matches[0].winner, 'C / D', 'time: adversário vence direto por W.O.');
})()).then(() => (async function () {
  // ─── RENDER smoke: cada estágio produz os controles certos, sem exceção ───
  const ctxKey = 'm|m1';
  // awaiting-proposal, visto pelo PARCEIRO → botão "Propor desfecho"
  const t = mkT('r1'); as('uc'); W._woConfirm('r1', 'wo1'); await tick();
  as('ub'); lastOverlay = ''; W._woOpenClaim('r1', ctxKey);
  ok(/Propor desfecho/.test(lastOverlay), 'render: parceiro vê "Propor desfecho"');
  ok(/_woOutcomeOverlay\(/.test(lastOverlay) && /'propose'/.test(lastOverlay), 'render: botão abre overlay em modo propose');
  // awaiting-proposal, visto pelo ADVERSÁRIO → só aguardando
  as('uc'); lastOverlay = ''; W._woOpenClaim('r1', ctxKey);
  ok(/Aguardando/.test(lastOverlay) && !/Propor desfecho/.test(lastOverlay), 'render: adversário aguarda proposta');
  // overlay em modo propose (parceiro) → handler _woProposeOutcome
  as('ub'); lastOverlay = ''; W._woOutcomeOverlay('r1', 'wo1', null, 'propose');
  ok(/_woProposeOutcome\(/.test(lastOverlay), 'render: overlay propose usa _woProposeOutcome');
  ok(/'advance'/.test(lastOverlay) && /'ghost'/.test(lastOverlay), 'render: overlay propose lista as opções');
  // propõe → proposed → adversário vê Aceitar/Rejeitar
  W._woProposeOutcome('r1', 'wo1', 'ghost'); await tick();
  as('uc'); lastOverlay = ''; W._woOpenClaim('r1', ctxKey);
  ok(/_woAcceptOutcome\(/.test(lastOverlay) && /_woRejectOutcome\(/.test(lastOverlay), 'render: adversário vê Aceitar e Rejeitar');
  ok(/Jogador X/.test(lastOverlay), 'render: mostra a proposta (Jogador X)');
  // escalated visto pelo ORG → "Decidir o desfecho (org.)"
  as('uc'); W._woRejectOutcome('r1', 'wo1'); await tick();
  as('org'); lastOverlay = ''; W._woOpenClaim('r1', ctxKey);
  ok(/Decidir o desfecho/.test(lastOverlay), 'render: org vê "Decidir o desfecho" no escalado');
  ok(/'org'/.test(lastOverlay), 'render: botão do org abre overlay em modo org');
  // overlay modo org → handler _woChooseOutcome
  as('org'); lastOverlay = ''; W._woOutcomeOverlay('r1', 'wo1', null, 'org');
  ok(/_woChooseOutcome\(/.test(lastOverlay), 'render: overlay org usa _woChooseOutcome');
})()).then(() => {
  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ wo-outcome-negotiation FALHOU'); process.exit(1); }
  console.log('✅ wo-outcome-negotiation: OK');
});
