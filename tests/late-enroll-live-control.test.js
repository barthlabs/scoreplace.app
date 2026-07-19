/* Controle AO VIVO da inscrição da FASE (item 2, incidente 18/jul —
 * project_late_enrollment_per_phase). O organizador abre/fecha a inscrição da fase EM
 * ANDAMENTO — inclusive DESTRAVAR uma eliminatória que ficou 'closed' e negava inscrição
 * ("Inscrições encerradas"). Exercita _phaseLateEnrollControlHtml (o controle) e
 * _setPhaseLateEnrollment (o writer, com AppStore.mutate mockado).
 *
 * FALHA no código antigo: essas funções não existiam; com le='closed' pós-sorteio NÃO
 * havia como o organizador reabrir a inscrição da fase (lateEnrollManaged=false → sem botão).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
sandbox.document = { getElementById: () => null };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox._showLoading = sandbox._hideLoading = sandbox._softRefreshView = () => {};
sandbox.renderTournaments = () => {};
sandbox._pName = (p) => typeof p === 'string' ? p : ((p && (p.displayName || p.name)) || '');
sandbox._participantUids = (p) => (p && typeof p === 'object' && p.uid) ? [p.uid] : [];
sandbox._isLigaFormat = (t) => !!(t && (t.format === 'Liga' || t.format === 'Ranking'));
sandbox._effectiveLateEnrollment = function (t) {
  if (!t) return undefined;
  var ph = (Array.isArray(t.phases) && t.phases[t.currentPhaseIndex || 0]) || null;
  return (ph && ph.lateEnrollment) || t.lateEnrollment;
};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };
sandbox.FirestoreDB = { saveTournament: () => Promise.resolve() };

let _isOrg = true;
sandbox.AppStore = {
  tournaments: [],
  isOrganizer: () => _isOrg, isCreator: () => false,
  logAction() {},
  mutate(tId, mutatorFn) {
    const t = sandbox.AppStore.tournaments.find(x => String(x.id) === String(tId));
    try { mutatorFn(t); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(true);
  },
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find(t => String(t.id) === String(id)) || null;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-enrollment.js'), 'utf8'), sandbox, { filename: 'tournaments-enrollment.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');
const tick = () => new Promise(r => setTimeout(r, 0));

// Torneio 2-fases NA ELIMINATÓRIA (cpi=1), com a elim 'closed' (o incidente).
function mkT(le, opts) {
  opts = opts || {};
  const t = {
    id: 't1', name: 'T', format: 'Eliminatórias Simples', status: opts.status || 'active',
    currentPhaseIndex: 1,
    phases: [{ name: 'Classificatória', lateEnrollment: 'expand' }, { name: 'Eliminatória', lateEnrollment: le }],
    lateEnrollment: 'expand',
    matches: opts.noDraw ? [] : [{ id: 'm1', p1: 'A', p2: 'B', winner: null }],
  };
  W.AppStore.tournaments = [t];
  return t;
}

console.log('──── late-enroll-live-control ────');
ok(typeof W._setPhaseLateEnrollment === 'function', '_setPhaseLateEnrollment existe');
ok(typeof W._phaseLateEnrollControlHtml === 'function', '_phaseLateEnrollControlHtml existe');

// (a) elim 'closed' pós-sorteio (org) → controle APARECE, com as 3 opções e 'closed' ativo
(function () {
  _isOrg = true;
  const t = mkT('closed');
  const html = W._phaseLateEnrollControlHtml(t);
  ok(html && html.length > 0, 'controle aparece quando elim closed pós-sorteio (o antigo não tinha)');
  ok(/_setPhaseLateEnrollment\('t1','closed'\)/.test(html), 'opção Fechadas');
  ok(/_setPhaseLateEnrollment\('t1','standby'\)/.test(html), 'opção Suplentes');
  ok(/_setPhaseLateEnrollment\('t1','expand'\)/.test(html), 'opção Novos Confrontos');
})();

// (b) writer: closed → expand grava na FASE corrente E no topo (reconcilia) → destrava o guard
(async function () {
  _isOrg = true;
  const t = mkT('closed');
  eq(W._effectiveLateEnrollment(t), 'closed', 'antes: efetivo=closed (negava)');
  W._setPhaseLateEnrollment('t1', 'expand');
  await tick();
  eq(t.phases[1].lateEnrollment, 'expand', 'writer grava na fase corrente (phases[1])');
  eq(t.lateEnrollment, 'expand', 'writer espelha no top-level (reconcilia top vs fase)');
  eq(W._effectiveLateEnrollment(t), 'expand', 'depois: efetivo=expand → guard aceita');
})().then(() => {
  // (c) valor inválido → no-op
  const t = mkT('closed');
  W._setPhaseLateEnrollment('t1', 'banana');
  eq(t.phases[1].lateEnrollment, 'closed', 'valor inválido não muda nada');
}).then(async () => {
  // (d) NÃO-organizador → no-op
  _isOrg = false;
  const t = mkT('closed');
  W._setPhaseLateEnrollment('t1', 'expand');
  await tick();
  eq(t.phases[1].lateEnrollment, 'closed', 'não-org não muda');
  ok(W._phaseLateEnrollControlHtml(t) === '', 'não-org não vê o controle');
  _isOrg = true;
}).then(() => {
  // (e) gates: pré-sorteio / finalizado / Liga → sem controle
  ok(W._phaseLateEnrollControlHtml(mkT('closed', { noDraw: true })) === '', 'pré-sorteio: sem controle (usa Encerrar Inscrições)');
  ok(W._phaseLateEnrollControlHtml(mkT('closed', { status: 'finished' })) === '', 'finalizado: sem controle');
  const liga = mkT('closed'); liga.format = 'Liga';
  ok(W._phaseLateEnrollControlHtml(liga) === '', 'Liga: sem controle (gerencia inscrição própria)');
}).then(() => {
  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ late-enroll-live-control FALHOU'); process.exit(1); }
  console.log('✅ late-enroll-live-control: OK');
});
