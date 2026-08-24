/* O HISTÓRICO DE W.O. É GRAVADO, NÃO DEDUZIDO
 * node tests/wo-log-o-historico-e-gravado.test.js
 *
 * ORDEM DO DONO (24/ago/2026): _"termine isso. senão nunca mais arrumamos como deve."_
 *
 * POR QUE O REGISTRO EXISTE: o histórico de W.O. de um grupo era RECONSTRUÍDO no render, a
 * partir de coisas que são ESTADO de outra coisa — o slot único do grupo (`woAbsent`), o
 * marcador de folga da rodada e o rastro `woSubstituteFor`. Como estado muda, o passado
 * mudava junto. Quatro consertos em quatro dias, todos o mesmo defeito:
 *   2.0.53 grupo com 3 W.O.s mostrava 1 · 2.0.57 quem voltou pra fila sumia da lista ·
 *   2.0.58 a cadeia arrebentava sem nome no doc · 2.0.59 revertido virava W.O. fantasma.
 *
 * Este arquivo trava o contrato novo: quem APLICA grava; quem REVERTE marca revertido (não
 * apaga); a tela LÊ do registro; e mexer no estado (reativar, tirar marcador, renomear,
 * mandar pra espera) NÃO altera o que está escrito.
 */
const { window: W, load } = require('./headless.js');
load('liga-substitution.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const sec = (nome, fn) => { try { fn(); } catch (e) { fail++; console.error('  ✗ [' + nome + '] estourou:', e && e.stack); } };

console.log('──── o histórico de W.O. é gravado ────');

// ── ambiente mínimo (sem DOM/Firestore), igual ao dos outros testes de W.O. ──────
let _curT = null;
W._findTournamentById = () => _curT;
W.AppStore = W.AppStore || {};
W.AppStore.tournaments = [];
W.AppStore.currentUser = { uid: 'u-org', displayName: 'Org' };
W.AppStore.mutate = (tId, fn) => { try { fn(_curT); } catch (e) { console.error(e); } return Promise.resolve(true); };
W._canManagePresence = () => true;
W._sendUserNotification = () => {};
W.showNotification = () => {};
W.showConfirmDialog = (a, b, onC) => { if (onC) onC(); };
W.document = { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null };

function mkT() {
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const parts = names.map((n) => ({ displayName: n, name: n, uid: 'u' + n }));
  const P = ['A', 'B', 'C', 'D'];
  const ms = [{ t1: [P[0], P[1]], t2: [P[2], P[3]] }, { t1: [P[0], P[2]], t2: [P[1], P[3]] }, { t1: [P[0], P[3]], t2: [P[1], P[2]] }]
    .map((pr, mi) => ({ id: 'm' + mi, round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 0,
      team1: pr.t1.slice(), team2: pr.t2.slice(), p1: pr.t1.join(' / '), p2: pr.t2.join(' / '), winner: null }));
  return { id: 'T', format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
    participants: parts, ligaGhosts: [], monarchWaitlist: { _default_: ['E', 'F'] },
    rounds: [{ round: 1, status: 'active', matches: ms.slice(),
      monarchGroups: [{ name: 'R1 Grupo A', players: P.slice(), playersUids: P.map((n) => 'u' + n), matches: ms }] }] };
}
const grupo = () => _curT.rounds[0].monarchGroups[0];
const log = () => _curT.woLog || [];
const lista = () => W._ligaGroupWoList(_curT, grupo()) || [];

// ── 1. APLICAR grava o fato ──────────────────────────────────────────────────────
sec('aplicar grava', function () {
  _curT = mkT();
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }]);
  ok(log().length === 1, 'o W.O. entra no registro assim que é aplicado — ' + log().length + ' evento(s)');
  const ev = log()[0];
  ok(ev.absentUid === 'uB', 'com o UID de quem levou [' + ev.absentUid + ']');
  ok(ev.status === 'active' && !!ev.at, 'ativo e datado');
  ok(ev.groupName === 'R1 Grupo A' && ev.roundIndex === 0, 'amarrado à rodada e ao grupo');
  ok(!ev.subUid, 'sem substituto ainda — o W.O. vale mesmo antes de alguém assumir');
  ok(ev.byUid === 'u-org', 'e guarda quem aplicou');
});

// ── 2. O ACEITE carimba quem assumiu, no MESMO evento ───────────────────────────
sec('aceite preenche', function () {
  _curT = mkT();
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }]);
  W.AppStore.currentUser = { uid: 'uE', displayName: 'E' };
  W._ligaAcceptSub('T', _curT.ligaSubInvites[0].id);
  W.AppStore.currentUser = { uid: 'u-org', displayName: 'Org' };
  ok(log().length === 1, 'continua UM evento (o aceite não cria outro) — ' + log().length);
  ok(log()[0].subUid === 'uE', 'com o uid de quem assumiu [' + log()[0].subUid + ']');
  ok(!!log()[0].filledAt, 'e a hora em que a vaga foi preenchida');
});

// ── 3. A TELA LÊ DO REGISTRO ─────────────────────────────────────────────────────
sec('a tela lê do registro', function () {
  _curT = mkT();
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }]);
  W.AppStore.currentUser = { uid: 'uE' };
  W._ligaAcceptSub('T', _curT.ligaSubInvites[0].id);
  W.AppStore.currentUser = { uid: 'u-org' };
  const l = lista();
  ok(l.length === 1 && l[0].doRegistro === true, 'a lista vem do registro, não da reconstrução');
  ok(l[0].absentUid === 'uB' && l[0].subUid === 'uE', 'com as duas pontas por uid');
});

// ── 4. ⭐ O PASSADO NÃO MUDA QUANDO O ESTADO MUDA ────────────────────────────────
// É ISTO que os quatro bugs tinham em comum. Cada linha abaixo é um deles.
sec('o passado não muda', function () {
  _curT = mkT();
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }]);
  W.AppStore.currentUser = { uid: 'uE' };
  W._ligaAcceptSub('T', _curT.ligaSubInvites[0].id);
  W.AppStore.currentUser = { uid: 'u-org' };
  const antes = JSON.stringify(_curT.woLog);

  // (2.0.57) a pessoa reativa e vai pra fila: o marcador de folga some
  _curT.rounds[0].matches = _curT.rounds[0].matches.filter((m) => !m.isSitOut);
  ok(lista().length === 1, 'sem o marcador de folga, o W.O. continua no histórico');

  // (2.0.58) o doc não guarda nome de quem tem uid
  _curT.participants.forEach((p) => { delete p.displayName; delete p.name; });
  ok(lista().length === 1, 'sem NENHUM nome no doc, idem');

  // (2.0.59) o rastro é limpo
  _curT.participants.forEach((p) => { delete p.woSubstituteFor; delete p.woSubstituteForUid; });
  ok(lista().length === 1, 'sem o rastro na entrada da pessoa, idem');

  // (2.0.53) o slot único do grupo é sobrescrito por um W.O. novo
  delete grupo().woAbsent; delete grupo().woAbsentUid;
  ok(lista().length === 1, 'sem o estado do grupo, idem');

  // a pessoa sai do elenco (foi pra espera)
  _curT.participants = _curT.participants.filter((p) => p.uid !== 'uB');
  _curT.standbyParticipants = [{ uid: 'uB', ligaActive: true }];
  const l = lista();
  ok(l.length === 1 && l[0].absentUid === 'uB', 'e com ela na lista de espera, o fato segue escrito');
  ok(JSON.stringify(_curT.woLog) === antes, 'nada disso ESCREVEU no registro — ele só é lido');
});

// ── 5. REVERTER marca revertido; não apaga, e some da lista ─────────────────────
sec('reverter marca', function () {
  _curT = mkT();
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }]);
  W.AppStore.currentUser = { uid: 'uE' };
  W._ligaAcceptSub('T', _curT.ligaSubInvites[0].id);
  W.AppStore.currentUser = { uid: 'u-org' };
  W._ligaRevertWo('T', 0, 'R1 Grupo A', 'uB', 'B');
  ok(log().length === 1, 'o evento NÃO é apagado — append-only');
  ok(log()[0].status === 'reverted' && !!log()[0].revertedAt, 'fica marcado como revertido, com hora');
  ok(lista().length === 0, 'e some da lista que a tela mostra');
  // e o grupo REVERTIDO não cai no legado (que ressuscitaria o W.O. pelo rastro)
  ok(W._woLogCobreGrupo(_curT, 0, 'R1 Grupo A') === true,
     'o grupo segue COBERTO pelo registro — nada de voltar pra reconstrução');
});

// ── 6. IDEMPOTENTE: aplicar/reverter de novo não duplica ────────────────────────
sec('idempotência', function () {
  _curT = mkT();
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }]);
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uF', name: 'F' }]);   // reconvida
  ok(log().length === 1, 'reaplicar o mesmo W.O. não cria um segundo evento — ' + log().length);
  W._ligaRevertWo('T', 0, 'R1 Grupo A', 'uB', 'B');
  W._ligaRevertWo('T', 0, 'R1 Grupo A', 'uB', 'B');
  ok(log().filter((e) => e.status === 'reverted').length === 1, 'reverter duas vezes também não duplica');
});

// ── 7. DOIS W.O.s no mesmo grupo = dois eventos, cada um com o seu ──────────────
sec('dois no mesmo grupo', function () {
  _curT = mkT();
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }]);
  W.AppStore.currentUser = { uid: 'uE' };
  W._ligaAcceptSub('T', _curT.ligaSubInvites.filter((x) => x.status === 'pending')[0].id);
  W.AppStore.currentUser = { uid: 'u-org' };
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'C', [{ uid: 'uF', name: 'F' }]);
  ok(log().length === 2, 'dois eventos — ' + log().length);
  const l = lista();
  ok(l.length === 2 && l[0].absentUid === 'uB' && l[1].absentUid === 'uC', 'na ordem em que aconteceram');
  // reverter UM não encosta no outro
  W._ligaRevertWo('T', 0, 'R1 Grupo A', 'uC', 'C');
  const l2 = lista();
  ok(l2.length === 1 && l2[0].absentUid === 'uB', 'reverter um deixa o outro de pé');
});

// ── 8. DOC ANTIGO (sem registro) continua lendo pela reconstrução ───────────────
sec('legado', function () {
  _curT = mkT();
  // o estado de um doc gravado antes da 2.0.60: rastro + slot do grupo, e nenhum woLog
  const g = grupo();
  g.players = ['A', 'E', 'C', 'D']; g.playersUids = ['uA', 'uE', 'uC', 'uD'];
  g.woAbsent = 'B'; g.woAbsentUid = 'uB'; g.subStatus = 'filled'; g.subName = 'E'; g.subUid = 'uE';
  _curT.participants.filter((p) => p.uid === 'uE')[0].woSubstituteFor = 'B';
  ok(!_curT.woLog, 'o doc não tem registro (é o caso legado)');
  const l = lista();
  ok(l.length === 1 && l[0].absentUid === 'uB' && l[0].subName === 'E',
     'a reconstrução ainda serve esse doc — ninguém perde histórico na virada');
  ok(!l[0].doRegistro, 'e a lista se declara como reconstruída, não registro');
});

// ── 9. BACKFILL converte o legado, uma vez, sem duplicar ────────────────────────
sec('backfill', function () {
  _curT = mkT();
  const g = grupo();
  g.players = ['A', 'E', 'C', 'D']; g.playersUids = ['uA', 'uE', 'uC', 'uD'];
  g.woAbsent = 'B'; g.woAbsentUid = 'uB'; g.subStatus = 'filled'; g.subName = 'E'; g.subUid = 'uE';
  const derivado = W._ligaGroupWoList(_curT, g);
  const n = W._woLogBackfillGroup(_curT, 0, 'R1 Grupo A', derivado);
  ok(n === 1, 'converteu o W.O. deduzido em evento gravado — ' + n);
  ok(W._woLogBackfillGroup(_curT, 0, 'R1 Grupo A', derivado) === 0, 'rodar de novo não duplica');
  const l = lista();
  ok(l.length === 1 && l[0].doRegistro === true, 'e a partir daí a tela lê do registro');
  ok(l[0].absentUid === 'uB' && l[0].subUid === 'uE', 'com as duas pontas por uid');
});

console.log('  ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
