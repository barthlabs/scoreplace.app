/* deleteAccount — O CAMINHO FELIZ, no emulador (10ª auditoria, pontos 1, 3 e 7).
 * Roda dentro de: npm run test:amizade
 *
 * ⛔ POR QUE ESTE ARQUIVO EXISTE: os testes de delete só exercitavam caminhos de RECUSA
 * (fase congelada, manutenção, lock alheio, guard de jogo pendente). Todos passavam — e
 * mesmo assim o CAMINHO FELIZ estava quebrado: uma segunda aquisição do mesmo lock
 * `deleting`, resto de uma correção anterior, fazia a função travar contra si mesma DEPOIS
 * de já ter apagado torneios. Teste que só prova a recusa não encontra isso.
 *
 * Cobre também a exclusão RETOMÁVEL: tombstone gravado + Auth sobrevivente não pode virar
 * conta em limbo (profile morto, login vivo, lifecycle `active`).
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));

const db = admin.firestore();
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-scoreplace';
const FN = 'http://127.0.0.1:5012/' + PROJECT + '/us-central1/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (uid) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
  iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: uid, user_id: uid,
  auth_time: Math.floor(Date.now() / 1000), iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, email: uid + '@x.com', email_verified: true,
  firebase: { identities: {}, sign_in_provider: 'google.com' },
}) + '.';
async function chamar(nome, uid, data) {
  const r = await fetch(FN + nome, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok(uid), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: data || {} }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const D1 = 'uidDELETEhappy0000000000001';
const D2 = 'uidDELETEamigo0000000000002';

async function limpar() {
  for (const col of ['friendships', 'users', 'userLifecycle', 'tournaments']) {
    const s = await db.collection(col).get(); const b = db.batch(); s.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  const acc = await db.collectionGroup('accepted').get();
  const b2 = db.batch(); acc.forEach((d) => b2.delete(d.ref)); await b2.commit();
  for (const u of [D1, D2]) { try { await admin.auth().deleteUser(u); } catch (e) {} }
}
const authVivo = async (uid) => { try { await admin.auth().getUser(uid); return true; } catch (e) { return false; } };
const lifecycleDe = async (uid) => { const d = await db.collection('userLifecycle').doc(uid).get(); return d.exists ? (d.data() || {}).estado : null; };

module.exports = (async () => {
  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: false });

  // ══ 1) HAPPY PATH SIMPLES ═════════════════════════════════════════════════
  await limpar();
  await admin.auth().createUser({ uid: D1, email: D1 + '@x.com' });
  await db.collection('users').doc(D1).set({ displayName: 'Vai Sair', email: D1 + '@x.com' });

  let r = await chamar('deleteAccount', D1, {});
  ok(r.status === 200, '⛔ HAPPY PATH: deleteAccount devolve 200 (deu ' + r.status + ')');
  ok(!(await authVivo(D1)), 'a conta de Auth some');
  const doc1 = (await db.collection('users').doc(D1).get()).data() || {};
  ok(doc1.deleted === true, 'o perfil vira tombstone `deleted:true`');
  ok(!doc1.displayName && !doc1.email, 'e sem dado pessoal');
  ok(await lifecycleDe(D1) === 'deleted', '⛔ e o lifecycle termina `deleted` (terminal, não `active`)');

  // ══ 2) HAPPY PATH COM AMIZADE ACEITA ══════════════════════════════════════
  await limpar();
  for (const u of [D1, D2]) {
    await admin.auth().createUser({ uid: u, email: u + '@x.com' });
    await db.collection('users').doc(u).set({ displayName: u, email: u + '@x.com' });
  }
  r = await chamar('sendFriendRequest', D1, { toUid: D2 });
  ok(r.status === 200, 'setup: convite enviado');
  r = await chamar('acceptFriendRequest', D2, { friendUid: D1 });
  ok(r.status === 200, 'setup: amizade aceita');
  const pid = [D1, D2].sort().join('__');
  ok((await db.collection('friendships').doc(pid).get()).exists, 'setup: relação existe');
  ok((await db.collection('friendAccess').doc(D1).collection('accepted').doc(D2).get()).exists,
    'setup: projeção existe');

  r = await chamar('deleteAccount', D1, {});
  ok(r.status === 200, '⛔ HAPPY PATH com amizade: 200 (deu ' + r.status + ')');
  ok(!(await db.collection('friendships').doc(pid).get()).exists, 'a relação some');
  ok(!(await db.collection('friendAccess').doc(D1).collection('accepted').doc(D2).get()).exists,
    'a projeção do excluído some');
  ok(!(await db.collection('friendAccess').doc(D2).collection('accepted').doc(D1).get()).exists,
    '⛔ e a projeção REVERSA também (autorização órfã é o pior resíduo)');
  const cacheD2 = (await db.collection('users').doc(D2).get()).data() || {};
  ok(!(cacheD2.friends || []).includes(D1), 'o cache do amigo não guarda o uid morto');
  ok(await lifecycleDe(D1) === 'deleted', 'lifecycle `deleted`');
  ok(await lifecycleDe(D2) !== 'deleted', 'e o amigo continua normal');

  // ══ 3) EXCLUSÃO RETOMÁVEL: tombstone gravado, Auth sobreviveu ═════════════
  /* Simula a falha real: o Firestore já virou tombstone e o `deleteUser` falhou. Antes,
   * o catch devolvia o lifecycle pra `active` e o retry era RECUSADO porque o profile já
   * dizia `deleted` — conta em limbo, sem caminho de saída. */
  await limpar();
  await admin.auth().createUser({ uid: D1, email: D1 + '@x.com' });
  await db.collection('users').doc(D1).set({ deleted: true, deletedAt: new Date().toISOString() });
  ok(await authVivo(D1), 'setup: profile morto, Auth VIVO (exclusão parcial)');

  r = await chamar('deleteAccount', D1, {});
  ok(r.status === 200, '⛔ o retry TERMINA a exclusão (deu ' + r.status + ')');
  ok(r.body && r.body.result && r.body.result.retomado === true, 'e se identifica como retomada');
  ok(!(await authVivo(D1)), '⛔ e o Auth finalmente some');
  /* ⚠️ 11ª auditoria (ponto 1): a retomada NÃO toca no `userLifecycle` — nem cria, nem
   * altera. Ela roda ANTES do lock justamente porque o estado pode já ser terminal, e
   * mexer ali só poderia ressuscitar um terminal. Aqui o doc nem existe (o setup limpou),
   * e isso é o desfecho certo: quem não tem lock não escreve lock. */
  ok(await lifecycleDe(D1) === null, 'e o lifecycle NÃO é criado pela retomada');

  // e uma conta já 100% excluída continua sendo recusada
  r = await chamar('deleteAccount', D1, {});
  ok(r.status >= 400, 'conta já excluída por completo é recusada');

  // ══ 4) RETRY COM LIFECYCLE JÁ TERMINAL (11ª auditoria, ponto 1) ══════════
  /* O caso real: a tentativa anterior gravou o tombstone, finalizou o lifecycle como
   * `deleted`, e o `deleteUser` falhou. Como `adquirir` recusa estado TERMINAL, a retomada
   * — que estava DENTRO do lock — nunca era alcançada: a pessoa ficava com profile morto,
   * login vivo e nenhuma chamada capaz de terminar. */
  await limpar();
  await admin.auth().createUser({ uid: D1, email: D1 + '@x.com' });
  await db.collection('users').doc(D1).set({ deleted: true, deletedAt: new Date().toISOString() });
  await db.collection('userLifecycle').doc(D1).set({
    estado: 'deleted', operationId: null, acquiredAt: null, expiresAt: null,
    terminalEm: new Date().toISOString() });
  ok(await lifecycleDe(D1) === 'deleted', 'setup: lifecycle JÁ terminal `deleted`');
  ok(await authVivo(D1), 'setup: e o Auth ainda vivo');

  const tSnap = await db.collection('tournaments').get();
  r = await chamar('deleteAccount', D1, {});
  ok(r.status === 200, '⛔ o retry FUNCIONA mesmo com lifecycle terminal (deu ' + r.status + ')');
  ok(r.body && r.body.result && r.body.result.retomado === true, 'e se identifica como retomada');
  ok(!(await authVivo(D1)), '⛔ e o Auth finalmente some');
  ok(await lifecycleDe(D1) === 'deleted', 'o lifecycle segue `deleted` — nada foi ressuscitado');
  ok((await db.collection('tournaments').get()).size === tSnap.size,
    '⛔ e NADA de torneio foi tocado de novo');

  console.log('\n  delete happy path: ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
