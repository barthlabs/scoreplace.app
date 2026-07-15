/* EXCLUIR CONTA de quem está em DUPLA → gerava uid ÓRFÃO (caso real: Michelle,
 * BT Corpus Christi, prod).
 *
 * A falha: `_executeDeleteAccount` (auth.js) filtrava os inscritos com
 *     participants.filter(p => p.email !== email && p.uid !== uid)
 * que só olha o slot SOLO. Quem estava como MEMBRO DE DUPLA (p1Uid/p2Uid) ou em
 * sub-participants[] NÃO era removido — o users/{uid} era apagado e a inscrição ficava
 * apontando pro uid morto. Resultado: uid órfão, e (com o strip de nomes) o uid CRU
 * vazando na tela. Pior: o filtro nunca tocava memberUids[], então a pessoa seguia
 * "membro" nas queries array-contains mesmo com a conta apagada.
 *
 * O fix não inventa regra: passa a usar a operação canônica de saída
 * (FirestoreDB.deenrollParticipant) — uid-first, slot-aware, e recomputa
 * memberUids/memberEmails. Este teste dirige as funções REAIS (_userMatchesParticipant do
 * store.js e _computeMemberUids do firebase-db.js) e compara com a réplica do filtro
 * ANTIGO, provando que o antigo deixava a dupla e o novo não.
 *
 * node tests/delete-account-dupla-orphan.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const W = require('./render-harness').window;

// firebase-db.js é objeto literal em window.FirestoreDB e não depende de db pra
// _computeMemberUids — carrega no MESMO sandbox pra testar o recomputo REAL.
const sandbox = require('./headless').sandbox;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8'), sandbox);
const DB = W.FirestoreDB;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(typeof W._userMatchesParticipant === 'function', '_userMatchesParticipant existe (store.js)');
ok(DB && typeof DB._computeMemberUids === 'function', '_computeMemberUids existe (firebase-db.js)');

// ── Cenário REAL: a pessoa que exclui a conta é o p2 de uma dupla ──────────────
// (Elide Luccas / Michelle Seawright — a Michelle é p2Uid e some do Auth)
const MICH = '16icWk5SHhgfa1l3Vsn4MYKt2pz2';
const mkTournament = () => ({
  id: 'tour_x',
  participants: [
    { uid: 'uSolo', email: 'solo@x.com', displayName: 'Solo' },
    { // dupla: p1 guest + p2 com conta (formato real do doc de prod)
      p1Name: 'Elide Luccas',
      p2Uid: MICH, p2Name: 'Michelle Seawright', p2Email: 'mmseawright@gmail.com',
      displayName: 'Elide Luccas / Michelle Seawright',
      participants: [{ name: 'Elide Luccas' }, { uid: MICH, displayName: 'Michelle Seawright' }],
    },
  ],
  memberUids: ['uSolo', MICH],
});
const DELETING = { uid: MICH, email: 'mmseawright@gmail.com', displayName: 'Michelle Seawright' };

// ── Réplica do filtro ANTIGO — prova que ele DEIXAVA a dupla ───────────────────
function oldFilter(participants, email, uid) {
  return participants.filter(p => p.email !== email && p.uid !== uid);
}
const tOld = mkTournament();
const keptOld = oldFilter(tOld.participants, DELETING.email, DELETING.uid);
ok(keptOld.length === 2,
  'ANTIGO: a dupla NÃO é removida — a conta some e a inscrição fica (got ' + keptOld.length + '/2 entradas)');
const orphanOld = keptOld.some(p => p.p2Uid === MICH);
ok(orphanOld === true, 'ANTIGO: uid da Michelle continua no doc = ÓRFÃO (esta é a falha)');
const muOld = DB._computeMemberUids({ participants: keptOld });
ok(muOld.indexOf(MICH) !== -1,
  'ANTIGO: memberUids AINDA tem o uid morto → ela segue "membro" nas queries (got ' + JSON.stringify(muOld) + ')');

// ── NOVO: UID ONLY, slot-aware (_participantUids) ──────────────────────────────
// Sem fallback por e-mail/nome: identidade é o uid e pronto. Fallback só existia pra
// cobrir writer que não gravava uid, e o preço era casar por nome (dois "Maira" → sai a
// errada) ou por e-mail (que a pessoa troca).
const isMe = (p) => W._participantUids(p).indexOf(MICH) !== -1;
const tNew = mkTournament();
const keptNew = tNew.participants.filter(p => !isMe(p));
ok(keptNew.length === 1,
  'NOVO: a dupla inteira sai (dupla não joga com uma pessoa só) (got ' + keptNew.length + '/1)');
ok(!keptNew.some(p => JSON.stringify(p).indexOf(MICH) !== -1),
  'NOVO: nenhum traço do uid nas entradas restantes');
const muNew = DB._computeMemberUids({ participants: keptNew });
ok(muNew.indexOf(MICH) === -1,
  'NOVO: memberUids recomputado SEM o uid morto (got ' + JSON.stringify(muNew) + ')');
ok(muNew.indexOf('uSolo') !== -1, 'NOVO: os outros membros continuam em memberUids');

// ── _participantUids pega TODOS os slots onde uma pessoa pode estar ────────────
ok(isMe({ p2Uid: MICH }) === true, 'slot p2Uid detectado');
ok(isMe({ p1Uid: MICH }) === true, 'slot p1Uid detectado');
ok(isMe({ uid: MICH }) === true, 'slot uid (solo) detectado');
ok(isMe({ participants: [{ uid: MICH }] }) === true, 'sub-participants[] detectado');
ok(isMe({ uid: 'outro' }) === false, 'não remove quem não é a pessoa');
ok(isMe({ p1Uid: 'uA', p2Uid: 'uB' }) === false, 'não remove dupla de terceiros');

// ── UID ONLY de verdade: e-mail e nome NÃO removem ninguém ────────────────────
ok(isMe({ email: 'mmseawright@gmail.com' }) === false,
  'UID ONLY: e-mail igual NÃO casa (identidade não é e-mail — a pessoa troca)');
ok(isMe({ displayName: 'Michelle Seawright' }) === false,
  'UID ONLY: nome igual NÃO casa (homônimo sairia no lugar da pessoa certa)');
ok(isMe({ p2Name: 'Michelle Seawright' }) === false,
  'UID ONLY: nome no slot de dupla NÃO casa');

// ── Lista de espera: mesmo critério, senão o uid morto reaparece no painel ─────
const espera = [{ uid: 'uOutro' }, { p1Uid: 'uX', p2Uid: MICH }];
const esperaNew = espera.filter(p => !isMe(p));
ok(esperaNew.length === 1, 'espera: entrada com a pessoa em slot de dupla também sai (got ' + esperaNew.length + '/1)');

// ── Ficto (organizador digitou o nome, sem uid) é intocado ────────────────────
// Não tem conta, não loga, não exclui conta. Some só pela mão do organizador.
ok(isMe({ name: 'Elide Luccas' }) === false, 'ficto sem uid não é removido junto');
ok(W._participantUids({ p1Name: 'Mari', p2Name: 'Flavia' }).length === 0,
  'dupla ficta (Mari / Flavia) não tem uid nenhum — invisível pra este caminho');

// ── O CALL SITE usa mesmo o canônico? ─────────────────────────────────────────
// Os asserts acima provam que as PEÇAS certas funcionam, mas não que auth.js as usa —
// _executeDeleteAccount depende de firebase.auth().currentUser + db + DOM e não roda aqui.
// Sem esta checagem, reverter o auth.js pro filtro caseiro deixaria a suíte VERDE com o
// bug de volta. É uma checagem estrutural (não substitui um E2E do fluxo de exclusão).
const authSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');
const delBlock = authSrc.slice(authSrc.indexOf('_executeDeleteAccount'), authSrc.indexOf('2c. Delete tournaments organized'));
ok(delBlock.length > 0, 'bloco de exclusão de conta localizado em auth.js');
ok(/p\.email\s*!==\s*email\s*&&\s*p\.uid\s*!==\s*uid/.test(delBlock) === false,
  'auth.js NÃO usa mais o filtro caseiro solo-only (o que gerava o órfão)');
ok(/_participantUids/.test(delBlock),
  'auth.js casa por UID ONLY, slot-aware (_participantUids)');
ok(/_userMatchesParticipant/.test(delBlock) === false,
  'auth.js NÃO usa matcher com fallback de e-mail/nome na exclusão');
ok(/deenrollParticipant/.test(delBlock),
  'auth.js usa a saída canônica (transação + recomputa memberUids)');
ok(/standbyParticipants/.test(delBlock) && /waitlist/.test(delBlock),
  'auth.js também limpa lista de espera/standby ao excluir conta');

// ── deenrollParticipant: uid only e SÓ memberUids ─────────────────────────────
const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
const deBlock = dbSrc.slice(dbSrc.indexOf('async deenrollParticipant'), dbSrc.indexOf('async deleteTournament'));
ok(deBlock.length > 0, 'bloco deenrollParticipant localizado');
ok(/_computeMemberEmails/.test(deBlock) === false,
  'deenroll NÃO recomputa memberEmails (só uid decide quem é membro)');
ok(/_computeMemberUids/.test(deBlock), 'deenroll recomputa memberUids');
ok(/userDisplayName/.test(deBlock) === false, 'deenroll não casa por nome (sem fallback)');
ok(/_emailLc/.test(deBlock) === false, 'deenroll não casa por e-mail (sem fallback)');

console.log(fail === 0
  ? '✅ delete-account-dupla-orphan: ' + pass + ' ok, 0 falharam'
  : '❌ delete-account-dupla-orphan: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
