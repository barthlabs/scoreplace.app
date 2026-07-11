/* Trava do W.O. de Rei/Rainha (monarch) POR UID (js/views/liga-substitution.js
 * `_monWoApply` / `_monWoRevert`) — Parte 14 (ITEM 2) da varredura de uid.
 *
 * REPRODUZ a falha: o W.O. canônico (grupos monarch em t.matches) reescrevia o
 * NOME do slot (ausente → substituto) mas DEIXAVA o team1Uids/team2Uids com o uid
 * do AUSENTE. Como a classificação monarch (_computeMonarchStandings) chaveia cada
 * slot pelo uid (_monKey), os jogos do SUBSTITUTO eram creditados na linha do
 * AUSENTE. O fix carrega o uid do substituto pro slot (folga real = uid dela;
 * Jogador X = null, ghost não pontua). Casa por uid; nome só fallback (guest/legado).
 *
 * Cada asserção FALHA no comportamento antigo (uid do slot fica o do ausente) e
 * PASSA no novo (uid do slot vira o do substituto). Carrega a cadeia REAL
 * model→logic→liga-substitution (o `_monWoApply`/`_computeMonarchStandings` sob
 * teste NÃO são stubados).
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
sandbox.showAlertDialog = sandbox.showConfirmDialog = sandbox.showInputDialog = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };

sandbox._pName = (p) => typeof p === 'string' ? p : ((p && (p.displayName || p.name)) || '');
sandbox._isLigaFormat = (t) => !!(t && (t.format === 'Liga' || t.format === 'Ranking'));
sandbox._matchHasRealPlay = () => false; // jogos não começaram (revert liberado)
sandbox._rerenderBracket = () => {};

// AppStore.mutate roda o mutator UMA vez sobre o torneio (o motor é puro).
sandbox.AppStore = {
  tournaments: [],
  currentUser: { uid: 'org', displayName: 'Org' },
  mutate(tId, fn) { const t = this.tournaments.find(x => String(x.id) === String(tId)); if (t) fn(t); },
  logAction() {}, sync() {}, syncImmediate() {},
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find(t => String(t.id) === String(id)) || null;
sandbox._canManagePresence = () => true; // org pode gerenciar

vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..');
['js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/liga-substitution.js'].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});
const W = sandbox;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

console.log('──────────── tests/monarch-wo-uid-identity.test.js ────────────');
ok(typeof W._monWoApply === 'function', '_monWoApply carregou');
ok(typeof W._monWoRevert === 'function', '_monWoRevert carregou');
ok(typeof W._computeMonarchStandings === 'function', '_computeMonarchStandings carregou');

// Grupo Rei/Rainha de 4: João(uJ)=A, B(uB), C(uC), D(uD). Maria(uM) é folga (fora do grupo).
function makeT() {
  const gName = 'R1 Grupo A';
  function mk(id, t1, t1u, t2, t2u) {
    return { id, bracket: 'monarch', isMonarch: true, monarchGroup: 0, groupName: gName, phaseIndex: 0, round: 1,
      team1: t1.slice(), team1Uids: t1u.slice(), team2: t2.slice(), team2Uids: t2u.slice(),
      p1: t1.join(' / '), p2: t2.join(' / '), winner: null, scoreP1: null, scoreP2: null };
  }
  return {
    t: {
      id: 'mon1', format: 'Liga', ligaRoundFormat: 'rei_rainha',
      participants: [
        { displayName: 'João', uid: 'uJ' }, { displayName: 'B', uid: 'uB' },
        { displayName: 'C', uid: 'uC' }, { displayName: 'D', uid: 'uD' },
        { displayName: 'Maria', uid: 'uM' },
      ],
      ligaGhosts: [], history: [],
      matches: [
        mk('rr1', ['João', 'B'], ['uJ', 'uB'], ['C', 'D'], ['uC', 'uD']),
        mk('rr2', ['João', 'C'], ['uJ', 'uC'], ['B', 'D'], ['uB', 'uD']),
        mk('rr3', ['João', 'D'], ['uJ', 'uD'], ['B', 'C'], ['uB', 'uC']),
      ],
    }, gName,
  };
}

// ── (a) APPLY: W.O. no João → folga Maria; o slot troca UID, não só o nome ─────
(function () {
  const { t, gName } = makeT();
  W.AppStore.tournaments = [t];
  W._monWoApply('mon1', 0, gName, 'João', 'Maria', false); // folga real (isGuest=false)

  const rr1 = t.matches.find(m => m.id === 'rr1');
  eq(rr1.team1[0], 'Maria', 'apply: nome do slot vira Maria');
  eq(rr1.team1Uids[0], 'uM', 'apply: UID do slot vira uM (o do substituto) — falha no antigo (ficava uJ)');
  ok(rr1.team1Uids[0] !== 'uJ', 'apply: UID do slot NÃO é mais o do ausente (uJ)');
  eq(rr1.p1, 'Maria / B', 'apply: p1 (display) reconstruído');
  eq(rr1.team2Uids[0], 'uC', 'apply: lado do adversário intocado');
  const rr2 = t.matches.find(m => m.id === 'rr2');
  eq(rr2.team1Uids[0], 'uM', 'apply: substituição propaga por TODOS os jogos do grupo');
  // W.O. marker do João (0 pts), sem virar ghost (folga real pontua)
  const wm = t.matches.find(m => m.isSitOut && m.sitOutReason === 'wo');
  ok(!!wm && wm.p1 === 'João', 'apply: marcador W.O. do João criado');
  ok((t.ligaGhosts || []).indexOf('Maria') === -1, 'apply: folga real NÃO vira ghost');
})();

// ── (b) STANDINGS: o jogo do substituto é creditado ao UID DELE, não do ausente ─
(function () {
  const { t, gName } = makeT();
  W.AppStore.tournaments = [t];
  W._monWoApply('mon1', 0, gName, 'João', 'Maria', false);
  // Maria/B vence o jogo rr1 (team1)
  const rr1 = t.matches.find(m => m.id === 'rr1');
  rr1.winner = rr1.p1; rr1.scoreP1 = 6; rr1.scoreP2 = 3;

  // grupo como o render monta (players derivados dos jogos pós-sub, SEM playersUids)
  const playing = t.matches.filter(m => m.bracket === 'monarch' && !m.isSitOut);
  const names = {}; playing.forEach(m => (m.team1 || []).concat(m.team2 || []).forEach(n => { if (n) names[n] = 1; }));
  const st = W._computeMonarchStandings({ players: Object.keys(names), matches: playing }, t, null) || [];
  const rowMaria = st.find(r => r.name === 'Maria');
  ok(!!rowMaria, 'standings: linha de Maria existe');
  eq(rowMaria && rowMaria.uid, 'uM', 'standings: linha de Maria resolve pro uid uM (sanidade — o fix não quebra a classificação)');
  eq(rowMaria && rowMaria.wins, 1, 'standings: vitória creditada a Maria');
  // João não deve receber a vitória de Maria
  const rowJoao = st.find(r => r.uid === 'uJ');
  ok(!rowJoao || rowJoao.wins === 0, 'standings: João (uJ) NÃO recebe a vitória do substituto');
})();

// ── (c) REVERT: substituto sai, ausente volta com NOME e UID ──────────────────
(function () {
  const { t, gName } = makeT();
  W.AppStore.tournaments = [t];
  W._monWoApply('mon1', 0, gName, 'João', 'Maria', false);
  W._monWoRevert('mon1', 0, gName);

  const rr1 = t.matches.find(m => m.id === 'rr1');
  eq(rr1.team1[0], 'João', 'revert: nome do slot volta a João');
  eq(rr1.team1Uids[0], 'uJ', 'revert: UID do slot volta ao do João (uJ)');
  ok(!t.matches.some(m => m.isSitOut && m.sitOutReason === 'wo'), 'revert: marcador W.O. removido');
})();

// ── (d) JOGADOR X (guest, sem uid): slot fica com nome do guest + uid null ─────
(function () {
  const { t, gName } = makeT();
  W.AppStore.tournaments = [t];
  W._monWoApply('mon1', 0, gName, 'João', 'Jogador X', true); // isGuest

  const rr1 = t.matches.find(m => m.id === 'rr1');
  eq(rr1.team1[0], 'Jogador X', 'guest: nome do slot vira Jogador X');
  eq(rr1.team1Uids[0], null, 'guest: UID do slot é null (ghost não pontua)');
  ok((t.ligaGhosts || []).indexOf('Jogador X') !== -1, 'guest: Jogador X registrado como ghost');
})();

console.log(`  ${pass} asserts OK, ${fail} falhas`);
if (fail > 0) { console.error('❌ monarch-wo-uid-identity FALHOU'); process.exit(1); }
console.log('✅ monarch-wo-uid-identity: OK');
module.exports = { pass, fail };
