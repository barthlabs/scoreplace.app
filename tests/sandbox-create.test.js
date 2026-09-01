/* Sandbox (SB) — criação do clone. Clona num torneio novo, PRIVADO, com killswitch de
 * notificação e marcado isSandbox — dev-only. Deep-copy do roster; NADA escrito no
 * original; segunda chamada abre o mesmo SB.
 *
 * ⚠️ O QUE A SEÇÃO (5) TRAVA, e por que ela nasceu (13/ago/2026): CRIAR o SB PRESERVA o
 * estado — sorteio, grupos, jogos, placares, W.O. e substituições. Isso sempre foi verdade
 * (é deep-copy) mas NUNCA estava travado nem escrito, e por isso o dono e eu descrevemos o
 * comportamento errado ("criar SB reseta o sorteio") e chegamos a construir uma bifurcação
 * inútil pra oferecer um modo que já existia. Quem zera é o "Resetar" de DENTRO do SB
 * (_resyncSandboxRoster + _clearTournamentDraw, em tournaments-draw.js) — as duas metades
 * já cobriam os dois usos. A bifurcação foi removida; estas asserções ficam pra ninguém
 * mais precisar adivinhar o que a criação faz.
 *
 * ⚠️ 2.1.86 — A CRIAÇÃO VIROU ASSÍNCRONA, e por um motivo de fundo: ela NÃO pode mais clonar
 * o objeto do AppStore. Num torneio DIVIDIDO esse objeto é o documento MAGRO (elenco e jogos
 * moram em subcoleção e chegam depois), e o SB nascia com 14 inscritos e 0 jogos. Agora ela
 * lê o original COMPLETO por `FirestoreDB.loadTournamentById` e PROVA a igualdade antes de
 * gravar — por isso o teste precisa de um `FirestoreDB` e de `await`.
 * Ver tests/sandbox-e-replica-fiel.test.js, que cobre a cópia fiel em si.
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
/* A porta canônica que a criação passou a usar. Aqui ela devolve o original do AppStore —
 * neste teste os torneios são INTEIROS (sem `_semPesados`), então a conferência de partes
 * aprova de graça e o que se mede continua sendo o que este arquivo sempre mediu. */
W.FirestoreDB = {
  db: true,
  async loadTournamentById(id) {
    var t = (W.AppStore.tournaments || []).filter(function (x) { return String(x.id) === String(id); })[0];
    return t ? JSON.parse(JSON.stringify(t)) : null;
  },
  async saveTournament() { return true; }
};

(async () => {
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
await W._openOrCreateSandbox('ORIG');
ok(W.AppStore.tournaments.length === 1, '0: não-dev não cria SB');

// (1) dev → cria o SB.
W.AppStore.tournaments = [mkOrig()];
W.AppStore.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
await W._openOrCreateSandbox('ORIG');
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
await W._openOrCreateSandbox('ORIG');
ok(W.AppStore.tournaments.length === before, '3: segunda chamada não cria outro SB');
ok(W._findSandboxOf('ORIG').id === sb.id, '3: _findSandboxOf acha o SB');


// ── (5) CRIAR PRESERVA O ESTADO, contra um original COM sorteio ───────────────
// É o que permite simular a virada de fase a partir do sorteio REAL.
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
await W._openOrCreateSandbox('ORIG');
var sbE = W.AppStore.tournaments.find(function (t) { return t.isSandbox; });
ok(!!sbE && (sbE.rounds || []).length === 1, '5: modo ESTADO preserva a rodada sorteada');
ok(!!sbE && (sbE.rounds[0].monarchGroups || []).length === 1, '5: preserva os grupos');
ok(!!sbE && sbE.rounds[0].matches[0].winner === 'Ana', '5: preserva o placar já lançado');
ok(!!sbE && sbE.isSandbox === true && sbE.notificationsMuted === true, '5: e continua isolado/mudo');

var origS = W.AppStore.tournaments.find(function (t) { return t.id === 'ORIG'; });
ok(!!origS && (origS.rounds || []).length === 1, '5: o ORIGINAL não perde o sorteio');
ok(!!sbE && sbE.status === 'active', '5: criar NÃO devolve o SB pro estado de inscrições');
ok(!/_clearTournamentDraw/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-organizer.js'), 'utf8')),
  '5: a CRIAÇÃO não chama _clearTournamentDraw — zerar é do "Resetar", não daqui');




console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-create FALHOU'); process.exit(1); }
console.log('✅ sandbox-create: OK');
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(1); });
