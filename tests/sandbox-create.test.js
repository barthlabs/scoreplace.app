/* Sandbox (SB) — criação do clone (Etapa 2). _openOrCreateSandbox clona o estado ATUAL do
 * original num torneio novo, PRIVADO, com killswitch de notificação e marcado isSandbox —
 * dev-only. Deep-copy do roster; NADA escrito no original; segunda chamada abre o mesmo SB.
 *
 * Reproduz a falha: no código velho não existia _openOrCreateSandbox → sem clone isolado.
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
W._openOrCreateSandbox('ORIG');
ok(W.AppStore.tournaments.length === 1, '0: não-dev não cria SB');

// (1) dev → cria o SB.
W.AppStore.tournaments = [mkOrig()];
W.AppStore.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
W._openOrCreateSandbox('ORIG');
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

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-create FALHOU'); process.exit(1); }
console.log('✅ sandbox-create: OK');
