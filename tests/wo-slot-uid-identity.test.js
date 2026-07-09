/* Trava do motor de W.O. POR UID (js/views/participants.js `_applyWO` /
 * `_absentInSlot`) — Parte 14 da varredura de identidade-por-uid.
 *
 * REPRODUZ a falha do matching por NOME (o que existia antes): o slot de match
 * é casado contra o ausente pela IDENTIDADE (uid do slot ∩ uid do ausente), não
 * pela string de nome. Cada caso FALHA no comportamento antigo (por-nome) e
 * PASSA no novo (por-uid):
 *   (a) HOMÔNIMO — dois "João" (uids distintos), W.O. num só → por-nome atinge
 *       AMBOS os slots; por-uid só o do uid alvo.
 *   (b) RENAME — slot com o nome do SORTEIO ("João"), pessoa renomeada depois
 *       ("João Silva") → por-nome NÃO acha o slot; por-uid (via team1Obj.uid) sim.
 *   (c) GUEST sem conta — slot sem uid → NOME segue sendo a identidade legítima
 *       (nenhuma regressão pra informal/legado).
 *
 * Carrega a cadeia REAL model→logic→participants (o `_slotUids` e o `_applyWO`
 * sob teste NÃO são stubados; só data-helpers periféricos do store.js).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, body: {}, location: { hash: '' } };
sandbox.location = { hash: '' };
sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };

// ── data-helpers periféricos do store.js (NÃO são a lógica sob teste) ──────────
const _pName = (p) => typeof p === 'string' ? p : ((p && (p.displayName || p.name)) || '');
sandbox._pName = _pName;
sandbox._participantUids = (p) => (p && typeof p === 'object' && p.uid) ? [p.uid] : [];
sandbox._isLigaFormat = (t) => !!(t && (t.format === 'Liga' || t.format === 'Ranking'));
sandbox._isMonarchFormat = () => false;
sandbox._memberNameByUid = (t, k) => {
  const parts = Array.isArray(t.participants) ? t.participants : [];
  const found = parts.find(p => typeof p === 'object' && p.uid === k);
  return found ? _pName(found) : '';
};
sandbox._idMapKey = (t, who) => ({ uid: (who && who.uid) || '', name: typeof who === 'string' ? who : ((who && (who.displayName || who.name)) || '') });
sandbox._idMapGet = (t, map, who) => { const k = sandbox._idMapKey(t, who); return (k.name && map) ? map[k.name] : undefined; };
sandbox._idMapHas = (t, map, who) => sandbox._idMapGet(t, map, who) !== undefined;
sandbox._idMapSet = (t, map, who, v) => { const k = sandbox._idMapKey(t, who); if (k.name && map) map[k.name] = v; };
sandbox._idMapDel = (t, map, who) => { const k = sandbox._idMapKey(t, who); if (k.name && map) delete map[k.name]; };
sandbox._getStandbyPool = (t) => {
  const sp = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
  const wl = Array.isArray(t.waitlist) ? t.waitlist : [];
  const seen = new Set(sp.map(_pName));
  const out = sp.slice();
  wl.forEach(w => { const n = _pName(w); if (n && !seen.has(n)) out.push(w); });
  return out;
};
sandbox._woHistSet = () => {};
sandbox._woHistGet = () => null;
sandbox._woHistDel = () => {};
sandbox._woIsKnockoutMatch = (t, m) => {
  if (!t || !m) return false;
  if (m.group !== undefined) return false;
  const f = t.format || '';
  return f === 'Eliminatórias Simples' || f === 'Dupla Eliminatória' || m.nextMatchId != null;
};

sandbox.AppStore = {
  tournaments: [],
  currentUser: { uid: 'org', displayName: 'Org' },
  logAction() {}, sync() {}, syncImmediate() {},
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find(t => String(t.id) === String(id)) || null;

vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..');
['js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/participants.js'].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});
const W = sandbox;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }
function register(t) { W.AppStore.tournaments = [t]; return t; }

console.log('──────────── tests/wo-slot-uid-identity.test.js ────────────');
ok(typeof W._applyWO === 'function', '_applyWO carregou');
ok(typeof W._slotUids === 'function', '_slotUids carregou (identidade por slot)');

// ── (a) HOMÔNIMO: dois "João" (uJ1, uJ2). W.O. no uJ2 → SÓ o jogo do uJ2 ───────
// Por NOME, "João" casaria os DOIS slots → o jogo do uJ1 também tomaria W.O.
// (regressão). Por UID, só o slot cujo team1Obj.uid === uJ2.
(function () {
  const m1 = { id: 'm1', p1: 'João', p2: 'Rival1', team1Obj: { uid: 'uJ1', displayName: 'João' }, team2Obj: { uid: 'uR1', displayName: 'Rival1' }, winner: null, nextMatchId: null };
  const m2 = { id: 'm2', p1: 'João', p2: 'Rival2', team1Obj: { uid: 'uJ2', displayName: 'João' }, team2Obj: { uid: 'uR2', displayName: 'Rival2' }, winner: null, nextMatchId: null };
  const t = register({
    id: 'h1', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [
      { displayName: 'João', uid: 'uJ1' }, { displayName: 'João', uid: 'uJ2' },
      { displayName: 'Rival1', uid: 'uR1' }, { displayName: 'Rival2', uid: 'uR2' },
    ],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [m1, m2],
  });
  // caller conhece o uid alvo (caminho wo-claim: absentUids explícito)
  const r = W._applyWO(t, { absentName: 'João', absentUids: ['uJ2'], scope: 'match', noSubBehavior: 'escalate' });
  eq(r.outcome, 'woApplied', 'homônimo: W.O. aplicado');
  eq(m2.winner, 'Rival2', 'homônimo: SÓ o jogo do uJ2 recebe W.O. (Rival2 vence)');
  ok(!m1.winner, 'homônimo: jogo do OUTRO João (uJ1) fica INTOCADO — falharia no matching por nome');
  ok(!!t.absent['uJ2'] && !t.absent['uJ1'], 'homônimo: ausência marcada só no uid alvo');
})();

// ── (b) RENAME: slot "João" (nome do sorteio) → pessoa vira "João Silva" ───────
// team1Obj.uid é estável (uJ1); o nome do slot ficou velho. Por NOME o slot não
// casa "João Silva" → 'noMatch'. Por UID (team1Obj.uid ∩ absentUids) casa.
(function () {
  const m1 = { id: 'm1', p1: 'João', p2: 'Rival', team1Obj: { uid: 'uJ1', displayName: 'João' }, team2Obj: { uid: 'uR', displayName: 'Rival' }, winner: null, nextMatchId: null };
  const t = register({
    id: 'r1', format: 'Eliminatórias Simples', woScope: 'individual',
    // perfil atual já renomeado
    participants: [{ displayName: 'João Silva', uid: 'uJ1' }, { displayName: 'Rival', uid: 'uR' }],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [m1],
  });
  const r = W._applyWO(t, { absentName: 'João Silva', absentUids: ['uJ1'], scope: 'match', noSubBehavior: 'escalate' });
  eq(r.outcome, 'woApplied', 'rename: W.O. aplicado apesar do nome do slot estar velho (por-nome daria noMatch)');
  eq(m1.winner, 'Rival', 'rename: adversário vence');
  eq(m1.woAbsentSide, 'p1', 'rename: lado ausente = slot com o uid do renomeado');
})();

// ── (c) GUEST sem conta: slot sem uid → NOME segue como identidade (sem regressão)
(function () {
  const m1 = { id: 'm1', p1: 'Guest A', p2: 'B', team2Obj: { uid: 'uB', displayName: 'B' }, winner: null, nextMatchId: null };
  const t = register({
    id: 'g1', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'Guest A' }, { displayName: 'B', uid: 'uB' }], // guest sem uid
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [m1],
  });
  // sem absentUids (guest não tem uid) → motor deriva [] → cai no fallback por nome
  const r = W._applyWO(t, { absentName: 'Guest A', scope: 'match', noSubBehavior: 'escalate' });
  eq(r.outcome, 'woApplied', 'guest: W.O. por NOME (fallback) — nenhuma regressão pra informal/legado');
  eq(m1.winner, 'B', 'guest: adversário vence');
})();

// ── (d) DUPLA por uid: slot "p1 / p2", ausente é o p2 (uid) ────────────────────
// team2Uids carrega os 2 uids; W.O. individual no membro pelo uid dele.
(function () {
  const m1 = { id: 'm1', p1: 'C / D', p2: 'A / P', team1Uids: ['uC', 'uD'], team2Uids: ['uA', 'uP'], winner: null, nextMatchId: null };
  const t = register({
    id: 'd1', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'A / P', p1Uid: 'uA', p2Uid: 'uP', uid: 'uA' }, { displayName: 'C / D', p1Uid: 'uC', p2Uid: 'uD', uid: 'uC' }],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [m1],
  });
  const r = W._applyWO(t, { absentName: 'A', absentUids: ['uP'], scope: 'match', noSubBehavior: 'escalate' });
  eq(r.outcome, 'woApplied', 'dupla-uid: W.O. aplicado no slot que contém o uid ausente');
  eq(m1.winner, 'C / D', 'dupla-uid: adversário (C / D) vence');
  eq(m1.woAbsentSide, 'p2', 'dupla-uid: lado ausente = p2 (team2Uids contém uP)');
})();

console.log(`  ${pass} asserts OK, ${fail} falhas`);
if (fail > 0) { console.error('❌ wo-slot-uid-identity FALHOU'); process.exit(1); }
console.log('✅ wo-slot-uid-identity: OK');
module.exports = { pass, fail };
