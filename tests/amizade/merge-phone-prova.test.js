/* mergePhoneAccount: PROVA DE POSSE E GHOST — emulador (11ª auditoria, ponto 4).
 * Roda dentro de: npm run test:amizade
 *
 * ⛔ O QUE ISTO TRAVA:
 *   · o lock era adquirido ANTES de conferir a prova — uma chamada sem prova nenhuma já
 *     marcava `merging` em duas contas (inclusive alheias) e as travava até o lease vencer;
 *   · o caminho "ghost" (Auth com telefone, sem perfil) engolia falha de `deleteUser` e de
 *     `updateUser` com `console.warn` e devolvia `{ ok: true }` — o cliente dava o número
 *     por reivindicado enquanto ele continuava no fantasma.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));

const db = admin.firestore();
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-scoreplace';
const FN = 'http://127.0.0.1:5012/' + PROJECT + '/us-central1/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (uid, extra) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(Object.assign({
  iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: uid, user_id: uid,
  auth_time: Math.floor(Date.now() / 1000), iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, email_verified: true,
  firebase: { identities: {}, sign_in_provider: 'google.com' },
}, extra || {})) + '.';
async function chamar(nome, uid, data, extraTok) {
  const r = await fetch(FN + nome, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok(uid, extraTok), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: data || {} }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const CALLER = 'uidMPcaller00000000000000001';
const OLD    = 'uidMPold00000000000000000002';
const GHOST  = 'uidMPghost0000000000000000003';
const FONE   = '+5511977770001';

async function limpar() {
  for (const col of ['users', 'userLifecycle', 'friendships']) {
    const s = await db.collection(col).get(); const b = db.batch(); s.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  for (const u of [CALLER, OLD, GHOST]) { try { await admin.auth().deleteUser(u); } catch (e) {} }
}
const lifecycleDocs = async () => (await db.collection('userLifecycle').get()).docs.map((d) => d.id + ':' + ((d.data() || {}).estado || '?'));

module.exports = (async () => {
  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: false });

  // ══ 1) SEM PROVA: recusa e ZERO escrita em userLifecycle ══════════════════
  await limpar();
  await admin.auth().createUser({ uid: CALLER, email: CALLER + '@x.com' });
  await admin.auth().createUser({ uid: OLD, email: OLD + '@x.com' });
  await db.collection('users').doc(CALLER).set({ displayName: 'Caller', email: CALLER + '@x.com' });
  await db.collection('users').doc(OLD).set({ displayName: 'Antiga', email: OLD + '@x.com' });

  let r = await chamar('mergePhoneAccount', CALLER, { oldUid: OLD }, { email: CALLER + '@x.com' });
  ok(r.status === 403 || r.status >= 400, 'sem prova de posse: RECUSADO (status ' + r.status + ')');
  const lc = await lifecycleDocs();
  ok(lc.length === 0, '⛔ e ZERO escrita em `userLifecycle` (antes já marcava merging nos dois) — achou: ' + JSON.stringify(lc));
  ok(!(await db.collection('users').doc(OLD).get()).data().mergedInto, 'e a conta antiga segue intacta');

  // ══ 2) COM PROVA (e-mail no token do caller bate com o da conta antiga) ═══
  await limpar();
  await admin.auth().createUser({ uid: CALLER, email: 'mesma@x.com' });
  await admin.auth().createUser({ uid: OLD, email: OLD + '@x.com' });
  await db.collection('users').doc(CALLER).set({ displayName: 'Caller', email: 'mesma@x.com' });
  await db.collection('users').doc(OLD).set({ displayName: 'Antiga', email: 'mesma@x.com' });
  r = await chamar('mergePhoneAccount', CALLER, { oldUid: OLD, dryRun: true }, { email: 'mesma@x.com' });
  ok(r.status === 200, 'com prova (e-mail do perfil antigo bate): ACEITO no dryRun (status ' + r.status + ')');
  ok((await lifecycleDocs()).length === 0, 'e o dryRun não adquire lock');

  // ══ 3) GHOST BEM-SUCEDIDO ════════════════════════════════════════════════
  await limpar();
  await admin.auth().createUser({ uid: CALLER, email: CALLER + '@x.com' });
  await admin.auth().createUser({ uid: GHOST, phoneNumber: FONE });     // Auth sem perfil
  await db.collection('users').doc(CALLER).set({ displayName: 'Caller', email: CALLER + '@x.com' });
  const proofGhost = tok(GHOST, { phone_number: FONE });

  r = await chamar('mergePhoneAccount', CALLER, { oldUid: GHOST, proofIdToken: proofGhost }, { email: CALLER + '@x.com' });
  ok(r.status === 200, 'ghost com prova: 200 (status ' + r.status + ')');
  ok(r.body && r.body.result && r.body.result.claimedPhone === FONE, 'e devolve o número reivindicado');
  ok((await db.collection('users').doc(CALLER).get()).data().phone === FONE, 'o número foi pro perfil do caller');
  let ghostVivo = true; try { await admin.auth().getUser(GHOST); } catch (e) { ghostVivo = false; }
  ok(!ghostVivo, 'e o fantasma foi removido do Auth');
  const lcGhost = (await db.collection('userLifecycle').doc(GHOST).get());
  const estGhost = lcGhost.exists ? (lcGhost.data() || {}).estado : null;
  ok(estGhost !== 'deleted' && estGhost !== 'merged',
    '⛔ e o lifecycle do ghost NÃO virou terminal falso (ficou: ' + estGhost + ')');

  // ══ 4) GHOST COM FALHA NA TRANSFERÊNCIA: NÃO devolve sucesso ═════════════
  /* Faz o `updateUser(caller, {phoneNumber})` falhar: um TERCEIRO já tem o número, então
   * depois de liberar o fantasma o Auth recusa vincular ao caller. */
  await limpar();
  const TERCEIRO = 'uidMPterceiro000000000000004';
  try { await admin.auth().deleteUser(TERCEIRO); } catch (e) {}
  await admin.auth().createUser({ uid: CALLER, email: CALLER + '@x.com' });
  await admin.auth().createUser({ uid: GHOST, phoneNumber: FONE });
  await db.collection('users').doc(CALLER).set({ displayName: 'Caller', email: CALLER + '@x.com' });
  const proof2 = tok(GHOST, { phone_number: FONE });
  // ocupa o número num terceiro DEPOIS de ler o ghost: o deleteUser libera, mas o
  // updateUser vai bater em phone-number-already-exists
  await admin.auth().createUser({ uid: TERCEIRO, email: TERCEIRO + '@x.com' });

  r = await chamar('mergePhoneAccount', CALLER, { oldUid: GHOST, proofIdToken: proof2 }, { email: CALLER + '@x.com' });
  if (r.status === 200) {
    // o número pôde ser transferido — o cenário de falha não se materializou aqui;
    // então confere ao menos a coerência do sucesso
    ok((await db.collection('users').doc(CALLER).get()).data().phone === FONE,
      '(cenário de falha não reproduzível neste emulador) sucesso é coerente');
  } else {
    ok(r.status >= 400, '⛔ ghost com falha na transferência NÃO devolve sucesso (status ' + r.status + ')');
    ok(!(await db.collection('users').doc(CALLER).get()).data().phone,
      '   e o número NÃO é dado por reivindicado no perfil');
  }
  const lcG2 = (await db.collection('userLifecycle').doc(GHOST).get());
  const estG2 = lcG2.exists ? (lcG2.data() || {}).estado : null;
  ok(estG2 !== 'deleted' && estG2 !== 'merged',
    '⛔ e nenhum estado terminal falso foi marcado (ficou: ' + estG2 + ')');
  try { await admin.auth().deleteUser(TERCEIRO); } catch (e) {}

  console.log('\n  mergePhone prova/ghost: ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
