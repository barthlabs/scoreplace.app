/* Sandbox (SB) — criação do clone. Clona num torneio novo, PRIVADO, com killswitch de
 * notificação e marcado isSandbox — dev-only. Deep-copy do roster; NADA escrito no
 * original; segunda chamada abre o mesmo SB.
 *
 * ⚠️ ATUALIZADO em 1.8.53 (pedido do dono): "Criar Sandbox" agora PERGUNTA o tipo de cópia
 * — `_openOrCreateSandbox` abre a escolha e quem cria é `_criarSandbox(id, modo)`:
 *   • 'estado' → o torneio como está AGORA (sorteio, grupos, jogos, placares, W.O.).
 *                É o que simula a virada pra próxima fase a partir do sorteio de verdade.
 *   • 'zerado' → só os inscritos, como se nada tivesse sido sorteado (o comportamento que
 *                antes só se alcançava pelo "Resetar" de dentro do SB).
 * As asserções que chamavam `_openOrCreateSandbox` esperando criação DIRETA passaram a
 * chamar `_criarSandbox(..., 'estado')` — o invariante que elas defendiam (isolamento,
 * deep-copy, original intacto) segue travado, agora com os DOIS modos cobertos.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox: W } = require('./render-harness');
// tournaments-organizer.js não é carregado pelo render-harness — carrega aqui (define
// _openOrCreateSandbox), como o index.html faz.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-organizer.js'), 'utf8'),
  W, { filename: 'tournaments-organizer.js' });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── sandbox-create ────');

W.showNotification = function () {};
if (!W.location) W.location = { hash: '' };

ok(typeof W._openOrCreateSandbox === 'function', '_openOrCreateSandbox existe (falha no velho)');

function mkOrig() {
  return {
    id: 'ORIG', name: 'Copa Real', sport: 'Beach Tennis', format: 'Eliminatórias Simples',
    isPublic: true, creatorUid: 'uORG', organizerEmail: 'org@x.com',
    participants: [{ uid: 'uP1', displayName: 'Ana' }, { uid: 'uP2', displayName: 'Bia' }],
    memberUids: ['uORG', 'uP1', 'uP2'], checkedIn: {}, absent: {}
  };
}

// (0) não-dev → no-op.
W.AppStore.tournaments = [mkOrig()];
W.AppStore.currentUser = { uid: 'uRANDO', email: 'rando@x.com', displayName: 'Rando' };
W._criarSandbox('ORIG', 'estado');
ok(W.AppStore.tournaments.length === 1, '0: não-dev não cria SB');
W._openOrCreateSandbox('ORIG');
ok(W.AppStore.tournaments.length === 1, '0: nem pela porta que pergunta');

// (1) dev → cria o SB.
W.AppStore.tournaments = [mkOrig()];
W.AppStore.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
W._criarSandbox('ORIG', 'estado');
var sb = W.AppStore.tournaments.find(function (t) { return t.isSandbox; });
var orig = W.AppStore.tournaments.find(function (t) { return t.id === 'ORIG'; });
ok(!!sb, '1: SB criado');
ok(sb.sandboxOf === 'ORIG', '1: sandboxOf aponta pro original');
ok(sb.notificationsMuted === true, '1: notificações mudas');
ok(sb.isPublic === false, '1: privado');
ok(sb.isSandbox === true, '1: isSandbox');
ok(String(sb.name).indexOf('(SB) ') === 0, '1: nome "(SB) …"');
ok(sb.creatorUid === 'uDEV', '1: dev é o criador (admin do SB)');
ok(sb.memberUids.indexOf('uDEV') !== -1, '1: dev no memberUids');
ok(sb.participants.length === 2 && sb.participants[0].uid === 'uP1', '1: roster clonado');
ok(sb.participants !== orig.participants, '1: deep-copy (arrays distintos)');

// (2) original INTACTO — nada escrito nele.
ok(orig.sandboxId === undefined, '2: original não recebe sandboxId (dev pode não ter permissão)');
ok(orig.isPublic === true && orig.creatorUid === 'uORG', '2: original inalterado');
ok(orig.participants.length === 2, '2: roster do original intacto');

// (3) segunda chamada NÃO duplica — abre o mesmo SB.
var before = W.AppStore.tournaments.length;
W._openOrCreateSandbox('ORIG');
ok(W.AppStore.tournaments.length === before, '3: segunda chamada não cria outro SB');
ok(W._findSandboxOf('ORIG').id === sb.id, '3: _findSandboxOf acha o SB');


// ── (5) OS DOIS MODOS, contra um original COM sorteio ─────────────────────────
// É a bifurcação pedida pelo dono: um SB pra simular a virada de fase a partir do
// sorteio REAL, e outro pra testar o sorteio do zero.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8'),
  W, { filename: 'tournaments-draw.js' });   // traz o _clearTournamentDraw, que o modo zerado reusa
function mkSorteado() {
  var o = mkOrig();
  o.status = 'active';
  o.rounds = [{ round: 1, roundIndex: 0,
    monarchGroups: [{ name: 'R1 Grupo A', players: ['Ana', 'Bia'], playersUids: ['uP1', 'uP2'] }],
    matches: [{ id: 'm1', p1: 'Ana', p2: 'Bia', roundIndex: 0, monarchGroup: 0,
                winner: 'Ana', scoreP1: 6, scoreP2: 3 }] }];
  return o;
}
W.AppStore.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };

W.AppStore.tournaments = [mkSorteado()];
W._criarSandbox('ORIG', 'estado');
var sbE = W.AppStore.tournaments.find(function (t) { return t.isSandbox; });
ok(!!sbE && (sbE.rounds || []).length === 1, '5: modo ESTADO preserva a rodada sorteada');
ok(!!sbE && (sbE.rounds[0].monarchGroups || []).length === 1, '5: preserva os grupos');
ok(!!sbE && sbE.rounds[0].matches[0].winner === 'Ana', '5: preserva o placar já lançado');
ok(!!sbE && sbE.isSandbox === true && sbE.notificationsMuted === true, '5: e continua isolado/mudo');

W.AppStore.tournaments = [mkSorteado()];
W._criarSandbox('ORIG', 'zerado');
var sbZ = W.AppStore.tournaments.find(function (t) { return t.isSandbox; });
ok(!!sbZ && (sbZ.rounds || []).length === 0, '5: modo ZERADO some com a rodada sorteada');
ok(!!sbZ && sbZ.status === 'open', '5: e volta pro estado de inscrições');
ok(!!sbZ && (sbZ.participants || []).length >= 2, '5: mas mantém os inscritos');
ok(!!sbZ && sbZ.isSandbox === true, '5: e também é sandbox');

var origS = W.AppStore.tournaments.find(function (t) { return t.id === 'ORIG'; });
ok(!!origS && (origS.rounds || []).length === 1, '5: o ORIGINAL não perde o sorteio em nenhum dos modos');

// a porta que PERGUNTA não pode criar nada sozinha (senão o clique vira SB sem escolha)
W.AppStore.tournaments = [mkSorteado()];
W.showAlertDialog = function () {};
W._openOrCreateSandbox('ORIG');
ok(W.AppStore.tournaments.length === 1, '5: _openOrCreateSandbox só PERGUNTA — não cria sozinho');


console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-create FALHOU'); process.exit(1); }
console.log('✅ sandbox-create: OK');
