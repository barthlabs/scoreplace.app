/* Aprovação de placar por participantes — RESOLUÇÃO DE LADO POR UID E NADA MAIS
 * (dono, 18/jul: "uid e nada mais sempre. nem nome, nem email, nem celular"). O bug do
 * torneio real (duplas mistas): _userTeamInMatch achava o participante casando o NOME do
 * slot com o displayName e caía em fallback nome/email/substring → em dupla, quando o nome
 * do slot não bate exatamente com um inscrito, resolvia 0 → o adversário ficava sem
 * Confirmar/Contestar ("confirmar não confirmava" / limbo). Agora resolve SÓ pelo uid do
 * slot (_slotUids: team*Uids → p*Uid → team*Obj), sem tocar em nome.
 *
 * FALHA no código antigo: com t.participants SEM entrada de nome batendo, o antigo resolvia
 * 0 mesmo com o uid presente no slot (team1Obj.p1Uid/p2Uid). Ver [[project_uid_identity_canon_locked]]
 * / [[project_match_slot_uid_identity]].
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }), addEventListener() {}, body: { appendChild() {} }, location: { hash: '' } };
sandbox.location = { hash: '' }; sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k, v) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.showAlertDialog = sandbox.showConfirmDialog = () => {};
sandbox._rerenderBracket = sandbox._softRefreshView = sandbox._showLoading = sandbox._hideLoading = () => {};
sandbox._displayNameForUid = (u, d) => d || String(u || '');
sandbox._entryDisplayName = (p) => (p && (p.displayName || p.name)) || '';
sandbox._effectiveScoring = () => null;
sandbox._propagateMatchUpdate = () => {};
sandbox._advanceWinner = () => {};
sandbox._sound = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };
const _sent = [];
sandbox._sendUserNotification = (uid, data) => { _sent.push({ uid, data }); };
let _cu = null;
sandbox.AppStore = {
  tournaments: [],
  get currentUser() { return _cu; },
  isOrganizer: () => false, isCreator: () => false,
  logAction() {}, mutate() { return Promise.resolve(true); }, commitTournamentTx() { return Promise.resolve(true); },
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find(t => String(t.id) === String(id)) || null;

vm.createContext(sandbox);
const ROOT = path.join(__dirname, '..');
['js/views/identity-core.js', 'js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/bracket-ui.js']
  .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel }));
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');

// Dupla A(uA1,uA2) vs B(uB1,uB2). Os SLOTS carregam o uid via team1Obj/team2Obj (p1Uid/p2Uid),
// EXATAMENTE como o sorteio grava (verificado no doc de prod). t.participants tem nomes que NÃO
// batem com a string do slot (o cenário que quebrava o antigo).
function mkT() {
  const t = {
    id: 't1', name: 'T', format: 'Eliminatórias Simples', resultEntry: ['organizer', 'players'],
    creatorUid: 'org',
    participants: [
      { displayName: 'Dupla A', p1Uid: 'uA1', p2Uid: 'uA2', p1Name: 'Ana', p2Name: 'Alê' },
      { displayName: 'Dupla B', p1Uid: 'uB1', p2Uid: 'uB2', p1Name: 'Bia', p2Name: 'Bruno' },
    ],
    matches: [{
      id: 'm1', round: 0, bracket: 'main',
      p1: 'Ana Silva / Alê Costa', p2: 'Bia Souza / Bruno Reck', // string do slot NÃO bate com displayName
      team1Obj: { p1Uid: 'uA1', p2Uid: 'uA2', p1Name: 'Ana', p2Name: 'Alê', displayName: 'Ana / Alê' },
      team2Obj: { p1Uid: 'uB1', p2Uid: 'uB2', p1Name: 'Bia', p2Name: 'Bruno', displayName: 'Bia / Bruno' },
      winner: null,
    }],
  };
  W.AppStore.tournaments = [t];
  return t;
}

console.log('──── result-approval-uid ────');
// _slotUids lê os uids do slot via team*Obj (a base do cânone)
(function () {
  const t = mkT(), m = t.matches[0];
  ok(W._slotUids(m, 'p1').indexOf('uA1') !== -1 && W._slotUids(m, 'p1').indexOf('uA2') !== -1, 'slotUids p1 = [uA1,uA2]');
  ok(W._slotUids(m, 'p2').indexOf('uB1') !== -1 && W._slotUids(m, 'p2').indexOf('uB2') !== -1, 'slotUids p2 = [uB1,uB2]');
})();

// _userTeamInMatch — POR UID. Cada membro da dupla resolve o seu lado, mesmo com o nome do
// slot diferente do displayName (o antigo dava 0 aqui).
(function () {
  const t = mkT(), m = t.matches[0];
  eq(W._userTeamInMatch(t, m, { uid: 'uA1' }), 1, 'uA1 (membro da dupla A) → lado 1');
  eq(W._userTeamInMatch(t, m, { uid: 'uA2' }), 1, 'uA2 (parceiro da dupla A) → lado 1');
  eq(W._userTeamInMatch(t, m, { uid: 'uB1' }), 2, 'uB1 (dupla B) → lado 2');
  eq(W._userTeamInMatch(t, m, { uid: 'uB2' }), 2, 'uB2 (parceiro B) → lado 2');
  eq(W._userTeamInMatch(t, m, { uid: 'estranho' }), 0, 'uid de fora → 0');
  // NADA de nome/email: um usuário cujo NOME aparece no slot mas sem uid casando → 0
  eq(W._userTeamInMatch(t, m, { displayName: 'Ana Silva', email: 'ana@x.com' }), 0, 'sem uid (só nome/email) → 0 (uid e nada mais)');
})();

// _isOpposingProposer — proponente uA1 (lado 1); adversário uB1 (lado 2) → true; parceiro uA2 → false
(function () {
  const t = mkT(), m = t.matches[0];
  m.pendingResult = { proposedBy: 'uA1', scoreP1: 6, scoreP2: 3, winner: m.p1 };
  ok(W._isOpposingProposer(t, m, { uid: 'uB1' }), 'adversário uB1 é oposto ao proponente uA1');
  ok(W._isOpposingProposer(t, m, { uid: 'uB2' }), 'parceiro do adversário uB2 também é oposto');
  ok(!W._isOpposingProposer(t, m, { uid: 'uA2' }), 'parceiro do proponente uA2 NÃO é oposto');
  ok(!W._isOpposingProposer(t, m, { uid: 'uA1' }), 'o próprio proponente NÃO é oposto');
})();

// _resultNeedsApproval — jogador no jogo + adversário tem conta (uid) → true; via UID
(function () {
  const t = mkT(), m = t.matches[0];
  ok(W._resultNeedsApproval(t, m, { uid: 'uA1' }), 'uA1 lança → precisa aprovação (adversário tem uid)');
  ok(!W._resultNeedsApproval(t, m, { uid: 'org' }), 'organizador não precisa aprovação');
  ok(!W._resultNeedsApproval(t, m, { uid: 'estranho' }), 'quem não está no jogo não dispara aprovação');
  // adversário SEM uid (guest) → auto-aprova (não precisa)
  const t2 = mkT(), m2 = t2.matches[0];
  m2.team2Obj = { p1Name: 'Convidado', p2Name: 'Outro' }; // sem uid
  ok(!W._resultNeedsApproval(t2, m2, { uid: 'uA1' }), 'adversário sem conta (sem uid) → não precisa aprovação');
})();

// TRAVA DE LÓGICA em _saveResultInline: com proposta pendente do lado A, um 2º lançamento
// do lado B (adversário) NÃO sobrescreve — direciona pra Confirmar/Editar/Contestar.
(function () {
  const t = mkT(), m = t.matches[0];
  // Lado A (uA1) já lançou:
  m.pendingResult = { proposedBy: 'uA1', proposedByName: 'Ana', scoreP1: 6, scoreP2: 3, winner: m.p1 };
  // Mock dos inputs de placar do adversário (B tenta lançar 2×4):
  const inputs = { ['s1-m1']: { value: '2' }, ['s2-m1']: { value: '4' } };
  W.document.getElementById = (id) => (id in inputs ? inputs[id] : null);
  _cu = { uid: 'uB1', displayName: 'Bia' }; // adversário
  W._saveResultInline('t1', 'm1');
  eq(m.pendingResult && m.pendingResult.proposedBy, 'uA1', 'trava: proposta segue do lado A (B não sobrescreveu)');
  eq(m.pendingResult && m.pendingResult.scoreP1, 6, 'trava: placar original preservado (6×3)');
  ok(!m.winner, 'trava: jogo não decidido pelo 2º lançamento');
  // O MESMO lado (uA1) relançando a própria proposta É permitido (atualiza):
  inputs['s1-m1'].value = '6'; inputs['s2-m1'].value = '1';
  _cu = { uid: 'uA1', displayName: 'Ana' };
  W._saveResultInline('t1', 'm1');
  eq(m.pendingResult && m.pendingResult.proposedBy, 'uA1', 'mesmo lado: relançamento atualiza a própria proposta');
  eq(m.pendingResult && m.pendingResult.scoreP1, 6, 'mesmo lado: novo placar 6×1 aplicado');
  eq(m.pendingResult && m.pendingResult.scoreP2, 1, 'mesmo lado: score P2 atualizado');
  W.document.getElementById = () => null; _cu = null;
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ result-approval-uid FALHOU'); process.exit(1); }
console.log('✅ result-approval-uid: OK');
