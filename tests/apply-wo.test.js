/* Teste headless do MOTOR ÚNICO de W.O. window._applyWO (js/views/participants.js) —
 * a canonização (Fase-A-do-W.O. da campanha de concorrência): os DOIS gatilhos
 * (_declareAbsent do org e wo-claim do jogador) funilam neste motor. Este teste
 * exercita o _applyWO REAL + _processWoSubstitutions REAL (a lógica sob teste NÃO
 * é stubada — só os data-helpers periféricos do store.js). Trava os 5 desfechos:
 * subbed / woApplied / waitedTBD / partner→waitlist / waited.
 * A CORRIDA (2 W.O. concorrentes) roda no emulador via test:concurrency.
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
// idMap por NOME (os testes usam nomes; sem uid o motor cai no fallback por nome)
sandbox._idMapKey = (t, who) => ({ uid: (who && who.uid) || '', name: typeof who === 'string' ? who : ((who && (who.displayName || who.name)) || '') });
sandbox._idMapGet = (t, map, who) => { const k = sandbox._idMapKey(t, who); return (k.name && map) ? map[k.name] : undefined; };
sandbox._idMapHas = (t, map, who) => sandbox._idMapGet(t, map, who) !== undefined;
sandbox._idMapSet = (t, map, who, v) => { const k = sandbox._idMapKey(t, who); if (k.name && map) map[k.name] = v; };
sandbox._idMapDel = (t, map, who) => { const k = sandbox._idMapKey(t, who); if (k.name && map) delete map[k.name]; };
// _getStandbyPool: merge canônico standbyParticipants+waitlist dedup por nome
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
// _woIsKnockoutMatch: mata-mata = elim (o motor usa isto pra decidir _advanceWinner)
sandbox._woIsKnockoutMatch = (t, m) => {
  if (!t || !m) return false;
  if (m.group !== undefined) return false;
  const f = t.format || '';
  return f === 'Eliminatórias Simples' || f === 'Dupla Eliminatória' || m.nextMatchId != null;
};

let _saves = 0;
sandbox.AppStore = {
  tournaments: [],
  currentUser: { uid: 'org', displayName: 'Org' },
  logAction() {},
  sync() { _saves++; },
  syncImmediate() { _saves++; },
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find(t => String(t.id) === String(id)) || null;

vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..');
// carrega a cadeia REAL: model → logic → participants (motor _applyWO + _processWoSubstitutions)
['js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/participants.js'].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});
const W = sandbox;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

console.log('──────────── tests/apply-wo.test.js ────────────');
ok(typeof W._applyWO === 'function', '_applyWO carregou (motor único)');
ok(typeof W._processWoSubstitutions === 'function', '_processWoSubstitutions carregou (funil)');

function register(t) { W.AppStore.tournaments = [t]; return t; }

// ── 1. SUB: há substituto PRESENTE na lista → entra no lugar ───────────────────
(function () {
  const t = register({
    id: 't1', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }, { displayName: 'Sub', uid: 'us' }],
    standbyParticipants: [{ displayName: 'Sub', uid: 'us' }],
    checkedIn: { 'Sub': Date.now() }, absent: {},
    matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: null, nextMatchId: null }],
  });
  const r = W._applyWO(t, { absentName: 'A', scope: 'match', noSubBehavior: 'wait' });
  eq(r.ok, true, 'sub: ok');
  eq(r.outcome, 'subbed', 'sub: outcome subbed');
  eq(t.matches[0].p1, 'Sub', 'sub: A trocado por Sub no jogo');
  ok(!t.matches[0].winner, 'sub: jogo continua sem vencedor (segue sendo jogado)');
})();

// ── 2. SEM SUB, lista VAZIA → adversário vence por W.O. (escalate) ─────────────
(function () {
  const t = register({
    id: 't2', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: null, nextMatchId: null }],
  });
  const r = W._applyWO(t, { absentName: 'A', scope: 'match', noSubBehavior: 'wait' });
  eq(r.outcome, 'woApplied', 'escalate: outcome woApplied');
  eq(t.matches[0].winner, 'B', 'escalate: B vence');
  eq(t.matches[0].wo, true, 'escalate: m.wo=true');
  eq(t.matches[0].woAbsentSide, 'p1', 'escalate: lado ausente marcado p1');
  eq(t.matches[0].scoreP1, 'W.O.', "escalate: scoreP1='W.O.'");
})();

// ── 3. TBD-GUARD: adversário TBD → NÃO aplica W.O. (só marca ausente) ─────────
(function () {
  const t = register({
    id: 't3', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'A', uid: 'ua' }],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [{ id: 'm1', p1: 'A', p2: 'TBD', winner: null, nextMatchId: null }],
  });
  const r = W._applyWO(t, { absentName: 'A', scope: 'match', noSubBehavior: 'wait' });
  eq(r.outcome, 'waitedTBD', 'TBD-guard: outcome waitedTBD');
  ok(!t.matches[0].winner, 'TBD-guard: NÃO seta winner (não propaga TBD)');
  ok(!!t.absent['ua'], 'TBD-guard: ausência foi marcada (por uid)');
})();

// ── 4. W.O. INDIVIDUAL de dupla sem sub → parceiro vai pra lista de espera ─────
(function () {
  const t = register({
    id: 't4', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'A / P', uid: 'uap' }, { displayName: 'C / D', uid: 'ucd' }],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [{ id: 'm1', p1: 'A / P', p2: 'C / D', winner: null, nextMatchId: null }],
  });
  const r = W._applyWO(t, { absentName: 'A', scope: 'match', noSubBehavior: 'wait' });
  eq(r.outcome, 'woApplied', 'dupla-sem-sub: outcome woApplied');
  eq(r.partnerToWaitlist, 'P', 'dupla-sem-sub: parceiro P retornado');
  ok((t.standbyParticipants || []).some(p => W._pName(p) === 'P'), 'dupla-sem-sub: P entrou na lista de espera');
  eq(t.matches[0].winner, 'C / D', 'dupla-sem-sub: adversário vence');
})();

// ── 5. WAIT: lista NÃO-vazia mas ninguém presente → aguarda (org, não escala) ──
(function () {
  const t = register({
    id: 't5', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }, { displayName: 'Sub', uid: 'us' }],
    standbyParticipants: [{ displayName: 'Sub', uid: 'us' }],
    checkedIn: {}, absent: {}, // Sub NÃO está presente
    matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: null, nextMatchId: null }],
  });
  const r = W._applyWO(t, { absentName: 'A', scope: 'match', noSubBehavior: 'wait' });
  eq(r.outcome, 'waited', 'wait: outcome waited (não escala)');
  ok(!t.matches[0].winner, 'wait: NÃO aplica W.O. (aguarda substituto presente)');
  ok(!!t.absent['ua'], 'wait: ausência foi marcada (por uid)');
})();

// ── 6. ESCALATE mesmo com lista não-vazia sem presente (gatilho do CLAIM) ──────
(function () {
  const t = register({
    id: 't6', format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }, { displayName: 'Sub', uid: 'us' }],
    standbyParticipants: [{ displayName: 'Sub', uid: 'us' }],
    checkedIn: {}, absent: {},
    matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: null, nextMatchId: null }],
  });
  const r = W._applyWO(t, { absentName: 'A', scope: 'match', noSubBehavior: 'escalate' });
  eq(r.outcome, 'woApplied', 'claim-escalate: escala mesmo com lista não-vazia sem presente');
  eq(t.matches[0].winner, 'B', 'claim-escalate: B vence');
})();

// ── 7. GRUPOS via CLAIM: escopo group, matches pré-resolvidos, sem advance ─────
(function () {
  const gm = [
    { id: 'g1', p1: 'A', p2: 'B', winner: null, group: 'G1' },
    { id: 'g2', p1: 'A', p2: 'C', winner: null, group: 'G1' },
    { id: 'g3', p1: 'B', p2: 'C', winner: null, group: 'G1' },
  ];
  const t = register({
    id: 't7', format: 'Fase de Grupos + Eliminatórias', woScope: 'team',
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }, { displayName: 'C', uid: 'uc' }],
    standbyParticipants: [], checkedIn: {}, absent: {}, groups: [{ name: 'G1', matches: gm }],
  });
  const r = W._applyWO(t, { absentName: 'A', scope: 'group', matches: gm, noSubBehavior: 'escalate' });
  eq(r.outcome, 'woApplied', 'grupos-claim: outcome woApplied');
  eq(gm[0].winner, 'B', 'grupos-claim: jogo A×B → B vence');
  eq(gm[1].winner, 'C', 'grupos-claim: jogo A×C → C vence');
  ok(!gm[2].winner, 'grupos-claim: jogo B×C (sem ausente) intocado');
})();

// ── STAGE 1: DESFECHO oferecido a quem decreta (project_wo_outcome_negotiation_canon) ──
// Reproduz o furo: o motor decidia sozinho. Agora offerOutcomeChoice devolve a escolha, e
// outcomeChoice executa o desfecho (ghost = parceiro segue; advance = adversário vence).
W._displayNameForUid = (u, d) => ({ ua: 'A', ub: 'B', uc: 'C', ud: 'D' }[u] || d || '');
function mkDoubles(id) {
  return register({
    id: id, format: 'Eliminatórias Simples', woScope: 'individual',
    participants: [{ displayName: 'A', uid: 'ua' }, { displayName: 'B', uid: 'ub' }, { displayName: 'C', uid: 'uc' }, { displayName: 'D', uid: 'ud' }],
    standbyParticipants: [], checkedIn: {}, absent: {},
    matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', team1Uids: ['ua', 'ub'], team2Uids: ['uc', 'ud'], winner: null, nextMatchId: null }],
  });
}
// (a) offerOutcomeChoice → devolve needsOutcomeChoice SEM decidir o jogo
(function () {
  const t = mkDoubles('so1');
  const r = W._applyWO(t, { absentName: 'A', absentUids: ['ua'], scope: 'match', woScope: 'individual', offerOutcomeChoice: true });
  eq(r.outcome, 'needsOutcomeChoice', 'oferece: outcome needsOutcomeChoice');
  eq(r.partnerUid, 'ub', 'oferece: parceiro é ub');
  eq(r.oppName, 'C / D', 'oferece: adversário C / D');
  ok(!t.matches[0].winner, 'oferece: jogo NÃO foi decidido');
  ok(!(t.standbyParticipants || []).length, 'oferece: ninguém foi pra espera ainda');
})();
// (b) ghost (Jogador X) → parceiro segue, jogo não decide, adversário não avança
(function () {
  const t = mkDoubles('so2');
  const r = W._applyWO(t, { absentName: 'A', absentUids: ['ua'], scope: 'match', woScope: 'individual', outcomeChoice: 'ghost' });
  eq(r.outcome, 'ghostApplied', 'ghost: outcome ghostApplied');
  ok(!t.matches[0].winner, 'ghost: jogo NÃO decidido');
  ok(!t.matches[0].wo, 'ghost: NÃO marca W.O.');
  ok(Array.isArray(t.woGhosts) && t.woGhosts.length === 1, 'ghost: 1 ghost registrado');
  ok((t.matches[0].team1Uids || []).indexOf('ub') !== -1, 'ghost: parceiro ub segue no slot');
  ok((t.matches[0].team1Uids || []).some(x => /^ghostwo_/.test(x)), 'ghost: placeholder Jogador X no slot');
  ok(!(t.standbyParticipants || []).length, 'ghost: parceiro NÃO foi pra lista de espera');
  ok(/Jogador X/.test(t.matches[0].p1), 'ghost: rótulo mostra Jogador X');
})();
// (c) advance → adversário vence, MESMO com suplente presente (pula a substituição)
(function () {
  const t = mkDoubles('so3');
  t.participants.push({ displayName: 'Sub', uid: 'us' });
  t.standbyParticipants = [{ displayName: 'Sub', uid: 'us' }];
  t.checkedIn = { 'Sub': Date.now() };
  const r = W._applyWO(t, { absentName: 'A', absentUids: ['ua'], scope: 'match', woScope: 'individual', outcomeChoice: 'advance' });
  eq(r.outcome, 'woApplied', 'advance: outcome woApplied');
  eq(t.matches[0].winner, 'C / D', 'advance: adversário vence');
  ok(t.matches[0].wo, 'advance: m.wo=true');
  ok(!(t.matches[0].team1Uids || []).some(x => /^ghostwo_/.test(x)), 'advance: não virou ghost');
})();

console.log(`  ${pass} asserts OK, ${fail} falhas`);
if (fail > 0) { console.error('❌ apply-wo FALHOU'); process.exit(1); }
console.log('✅ apply-wo: OK');
module.exports = { pass, fail };
