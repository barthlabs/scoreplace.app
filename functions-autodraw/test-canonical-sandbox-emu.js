/* Regressão real da callable publicada: sandbox e torneio com o MESMO ID.
 * Rodar pelo emulador de Functions deste codebase, não pelo da raiz. */
'use strict';
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
const base = 'http://127.0.0.1:' + (process.env.FUNCTIONS_EMULATOR_PORT || '5001') +
  '/demo-scoreplace/us-central1/getCanonicalTournamentRoster';
const authUrl = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099') +
  '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';

async function token(uid) {
  const email = uid + '@teste.local';
  await admin.auth().createUser({ uid, email, password: 'senha-de-teste-123' });
  const response = await fetch(authUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'senha-de-teste-123', returnSecureToken: true }) });
  const body = await response.json();
  assert.ok(body.idToken, 'Auth emulator deve emitir token');
  return body.idToken;
}
async function call(id, sandbox, idToken) {
  const response = await fetch(base, { method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, idToken ? { Authorization: 'Bearer ' + idToken } : {}),
    body: JSON.stringify({ data: { tournamentId: id, ...(sandbox === undefined ? {} : { sandbox }) } }) });
  return { status: response.status, body: await response.json() };
}
async function callFn(name, data, idToken) {
  const url = base.replace('/getCanonicalTournamentRoster', '/' + name);
  const response = await fetch(url, { method:'POST',
    headers: { 'Content-Type':'application/json', Authorization:'Bearer ' + idToken },
    body: JSON.stringify({ data }) });
  return { status:response.status, body:await response.json() };
}
function registration(id, name) {
  return { registrationId: id, status: 'confirmed', participantKind: 'manual',
    participantKey: 'manual:' + id, manualParticipantId: id, manualDisplayName: name,
    categoryId: 'light', enrollSeq: 1 };
}
const receipt = { fingerprint: 'snapshot-fixture', registrationCount: 1 };
const categories = [{ id: 'light', label: 'Light' }];

(async () => {
  const owner = await token('sb-owner');
  const member = await token('sb-member');
  const stranger = await token('sb-stranger');
  const id = 'same-id-in-both-collections';
  const real = db.collection('tournaments').doc(id);
  const sb = db.collection('sandboxes').doc(id);
  await real.set({ id, creatorUid: 'sb-member', adminUids:['sb-owner'], memberUids: ['sb-member'],
    canonicalRegistrationMigration: receipt, categoryDefinitions: categories, participants: [] });
  await sb.set({ id, isSandbox: true, sandboxOf: id, sandboxOwnerUid: 'sb-owner', sbState: 'ready', notificationsMuted:true,
    creatorUid: 'sb-member', memberUids: ['sb-member'],
    canonicalRegistrationMigration: receipt, categoryDefinitions: categories, participants: [] });
  await real.collection('registrations').doc('real').set(registration('real', 'Pessoa real'));
  await sb.collection('registrations').doc('copy').set(registration('copy', 'Pessoa da cópia'));

  const own = await call(id, true, owner);
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.body.result.registrationCount, 1);
  assert.equal(own.body.result.participants[0].name, 'Pessoa da cópia');
  const normal = await call(id, undefined, member); // cliente antigo, sem flag
  assert.equal(normal.status, 200, JSON.stringify(normal.body));
  assert.equal(normal.body.result.participants[0].name, 'Pessoa real');
  assert.notEqual((await call(id, true, member)).status, 200, 'memberUids copiado não autoriza sandbox');
  assert.notEqual((await call(id, false, stranger)).status, 200, 'estranho não lê torneio normal');
  const absent = await call('sandbox-inexistente', true, owner);
  const denied = await call(id, true, member);
  assert.equal(absent.body.error.status, denied.body.error.status, 'inexistente e não dono são indistinguíveis');
  assert.notEqual((await call(id, true, null)).status, 200, 'sem autenticação é negado');

  // Mutação real do sandbox no emulador: o doc original é comparado byte a
  // byte. Isto pega a antiga rota que buscava `tournaments/{sb_id}`.
  const routedId = 'sb_' + id;
  const routed = db.collection('sandboxes').doc(routedId);
  await routed.set({ id:routedId, isSandbox:true, sandboxOf:id, sandboxOwnerUid:'sb-owner',
    sbState:'ready', notificationsMuted:true, creatorUid:'sb-owner', adminUids:['sb-owner'],
    canonicalRegistrationMigration:receipt, categoryDefinitions:categories, participants:[] });
  await routed.collection('registrations').doc('copy').set(registration('copy', 'Pessoa da cópia'));
  const realBefore = JSON.stringify((await real.get()).data());
  const configResult = await callFn('updateTournamentConfiguration', { tournamentId:routedId,
    sandbox:true, patch:{ courtOrder:['Quadra 1'] } }, owner);
  assert.equal(configResult.status, 200, JSON.stringify(configResult.body));
  assert.deepEqual((await routed.get()).data().courtOrder, ['Quadra 1']);
  assert.equal(JSON.stringify((await real.get()).data()), realBefore, 'configuração do sandbox não altera original');
  const legacyConfig = await callFn('updateTournamentConfiguration', { tournamentId:routedId,
    patch:{ courtOrder:['Quadra 2'] } }, owner);
  assert.equal(legacyConfig.status, 200, 'cliente sem flag usa o prefixo privado do ID');
  assert.deepEqual((await routed.get()).data().courtOrder, ['Quadra 2']);
  assert.equal(JSON.stringify((await real.get()).data()), realBefore, 'cliente sem flag não altera original');
  console.log('✓ configuração do sandbox grava só na coleção privada');

  const imageRequest = { tournamentId:routedId, sandbox:true, type:'logo',
    dataUrl:'data:image/png;base64,iVBORw0KGgo=' };
  const deniedImage = await callFn('uploadTournamentImage', imageRequest, stranger);
  assert.notEqual(deniedImage.status, 200, 'não dono não pode enviar imagem do sandbox');
  assert.equal(deniedImage.body.error.status, 'NOT_FOUND', 'sandbox privado não revela existência ao não dono');
  assert.equal(JSON.stringify((await real.get()).data()), realBefore, 'upload negado não altera o original');
  const ownerImage = await callFn('uploadTournamentImage', imageRequest, owner);
  assert.equal(ownerImage.status, 200, JSON.stringify(ownerImage.body));
  const imageUrl = new URL(ownerImage.body.result.url);
  const imageBucket = decodeURIComponent(imageUrl.pathname.split('/b/')[1].split('/o/')[0]);
  const imagePath = decodeURIComponent(imageUrl.pathname.split('/o/')[1]);
  assert.ok(imagePath.startsWith('sandboxes/' + routedId + '/logo-'), 'imagem do dono fica no namespace privado');
  assert.equal((await admin.storage().bucket(imageBucket).file(imagePath).exists())[0], true,
    'upload autorizado gravou o objeto no emulador de Storage');
  assert.equal(JSON.stringify((await real.get()).data()), realBefore, 'upload autorizado não altera original');

  for (const state of ['creating', 'failed']) {
    await sb.update({ sbState: state });
    assert.notEqual((await call(id, true, owner)).status, 200, state + ' é negado');
  }
  await sb.update({ sbState: 'ready', isSandbox: false });
  assert.notEqual((await call(id, true, owner)).status, 200, 'documento sem carimbo é negado');
  await sb.update({ isSandbox: admin.firestore.FieldValue.delete() });
  assert.notEqual((await call(id, true, owner)).status, 200, 'carimbo ausente é negado');
  await sb.update({ isSandbox: true, canonicalRegistrationMigration: { fingerprint: 'snapshot-fixture', registrationCount: 2 } });
  assert.notEqual((await call(id, true, owner)).status, 200, 'recibo divergente falha fechado');
  console.log('✓ callable canônica isola sandbox, recibo, dono e torneio normal');
})().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
