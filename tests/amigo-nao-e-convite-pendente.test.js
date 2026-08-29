/* A INVARIANTE "AMIGO NÃO É CONVITE PENDENTE" — agora na autoridade nova.
 * node tests/amigo-nao-e-convite-pendente.test.js
 *
 * ⛔ ESTE ARQUIVO FOI REESCRITO em 29/ago/2026 (v2.1.48, 6ª auditoria externa, ponto 10).
 * Ele protegia `js/views/amizade-core.js` e a cópia byte-idêntica em `functions/vendor/` —
 * implementação que ficou SEM CHAMADOR RUNTIME depois que a fusão passou a projetar o
 * cache do cânone. Só os testes a mantinham viva. Implementação morta não se conserva por
 * causa de teste; o que se conserva é a REGRA.
 *
 * A REGRA (ordem do dono, 27/ago/2026): _"amigos nao podem estar como convites pendetes.
 * aceitou, virou amigo, nao tem convite pendente. em nenhuma dessas telas."_
 * MEDIDO à época: 12 usuários, 11 pares — o dono via os próprios amigos como "pendentes".
 *
 * Onde ela vive agora, e por que é mais forte:
 *   · `projetarCache` aplica na SAÍDA — o cache é derivado do cânone, então a contradição
 *     não tem como nascer (antes dependia de um segundo arrayRemove chegar depois);
 *   · `decidir('aceitar')` produz `accepted`, e o service tira o uid dos dois arrays de
 *     convite dos DOIS perfis na MESMA transação em que grava a relação.
 */
const core = require('../functions/amizade-authority-core');

let pass = 0, fail = 0;
const ok = (m, c) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const A = 'uid_ana', B = 'uid_bia', C = 'uid_carla';
const T0 = 't0', T1 = 't1';
const rel = (u1, u2, status, by) => {
  const p = core.parOrdenado(u1, u2);
  return { id: core.pairId(u1, u2), doc: { uidA: p.uidA, uidB: p.uidB, status, requestedBy: by, createdAt: T0, acceptedAt: status === 'accepted' ? T1 : null } };
};

console.log('──── amigo não é convite pendente ────');

// ⛔ O CASO DO BUG: o cânone diz amizade; nenhum convite pode sobreviver na projeção.
let c = core.projetarCache([rel(A, B, 'accepted', A)], A);
ok('quem é amigo aparece em friends', c.friends.join() === B);
ok('⛔ e NÃO aparece em friendRequestsSent', c.friendRequestsSent.length === 0);
ok('⛔ nem em friendRequestsReceived', c.friendRequestsReceived.length === 0);

// pendente aparece só no sentido certo
c = core.projetarCache([rel(A, C, 'pending', A)], A);
ok('convite ENVIADO aparece só em sent', c.friendRequestsSent.join() === C && c.friendRequestsReceived.length === 0);
c = core.projetarCache([rel(A, C, 'pending', C)], A);
ok('convite RECEBIDO aparece só em received', c.friendRequestsReceived.join() === C && c.friendRequestsSent.length === 0);
ok('e nenhum dos dois vira amizade', c.friends.length === 0);

// amizade + convite residual do mesmo par: a amizade é o estado FORTE
c = core.projetarCache([rel(A, B, 'accepted', A), { id: 'x', doc: { uidA: A, uidB: B, status: 'pending', requestedBy: A, createdAt: T0, acceptedAt: null } }], A);
ok('⛔ par duplicado (amizade + pendência): a AMIZADE vence e o convite some',
  c.friends.join() === B && c.friendRequestsSent.length === 0);

// aceitar, pela autoridade, tira dos convites
const pend = rel(A, B, 'pending', A).doc;
const aceito = core.decidir('aceitar', pend, B, A, T1);
ok('aceitar produz accepted', aceito.ok && aceito.doc.status === 'accepted');
ok('e abre o acesso', aceito.acesso === 'criar');
ok('⛔ e o cache resultante não tem convite nenhum',
  core.projetarCache([{ id: 'y', doc: aceito.doc }], A).friendRequestsReceived.length === 0);

// legacy_unverified não é amigo NEM convite
c = core.projetarCache([rel(A, B, 'legacy_unverified', A)], A);
ok('legacy_unverified não vira amizade nem convite',
  c.friends.length === 0 && c.friendRequestsSent.length === 0 && c.friendRequestsReceived.length === 0);

// ⛔ e a implementação morta REALMENTE saiu
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
ok('⛔ js/views/amizade-core.js foi REMOVIDO', !fs.existsSync(path.join(ROOT, 'js', 'views', 'amizade-core.js')));
ok('⛔ functions/vendor/amizade-core.js foi REMOVIDO', !fs.existsSync(path.join(ROOT, 'functions', 'vendor', 'amizade-core.js')));
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('⛔ e o <script> saiu do index.html', !/amizade-core\.js/.test(idx));
const fidx = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
ok('⛔ e o import morto saiu do functions/index.js', !/vendor\/amizade-core/.test(fidx));
ok('⛔ e nenhum comentário diz mais que o merge usa reconciliarAmizade',
  !/reconciliarAmizade/.test(fidx));

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
