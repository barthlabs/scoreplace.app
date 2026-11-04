/* Regressão dos comandos de sandbox do pacote autodraw. A leitura canônica
 * pertence ao pacote principal e é testada no emulador da raiz. */
'use strict';
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
const base = 'http://127.0.0.1:' + (process.env.FUNCTIONS_EMULATOR_PORT || '5001') +
  '/demo-scoreplace/us-central1/';
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
async function callFn(name, data, idToken) {
  const url = base + name;
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

  // A confirmação do sorteio pode trazer dias de uma aba antiga sem a chave de
  // janelas. A callable mescla com o documento fresco da transação e devolve o
  // resultado para a prévia. Alterações explícitas seguem as mesmas regras.
  const windowId = 'sb_category-windows';
  const windowRef = db.collection('sandboxes').doc(windowId);
  const playDay = '2026-11-13';
  const days = [{ day:playDay, startTime:'08:00', endTime:'19:30' }];
  const categoryWindows = [{ category:'Diamante', day:playDay, startTime:'08:00', endTime:'15:00' }];
  await windowRef.set({ id:windowId, isSandbox:true, sandboxOf:id, sandboxOwnerUid:'sb-owner', sbState:'ready', notificationsMuted:true,
    creatorUid:'sb-owner', adminUids:['sb-owner'], combinedCategories:['Diamante','Ouro'],
    startDate:playDay + 'T08:00', endDate:playDay + 'T19:30',
    scheduleWindow:{ version:1, days, categoryWindows } });
  const merged = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ scheduleWindow:{ version:1, days } } }, owner);
  assert.equal(merged.status, 200, JSON.stringify(merged.body));
  assert.deepEqual(merged.body.result.scheduleWindow.categoryWindows, categoryWindows,
    'resposta devolve janelas frescas mescladas');
  assert.deepEqual((await windowRef.get()).data().scheduleWindow.categoryWindows, categoryWindows,
    'patch de uma aba antiga não apaga janelas de categoria');
  const categoryOnly = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ scheduleWindow:{ categoryWindows } } }, owner);
  assert.equal(categoryOnly.status, 200, 'editar apenas janelas preserva os dias do documento fresco');
  assert.deepEqual(categoryOnly.body.result.scheduleWindow.days, days);
  const nullWindow = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ scheduleWindow:null } }, owner);
  assert.equal(nullWindow.body.error.status, 'INVALID_ARGUMENT', 'agenda nula não apaga dias');
  for (const windowPatch of [
    { categoryWindows:null },
    { days:[{ day:playDay, startTime:'08:00', endTime:'14:00' }], categoryWindows:null }
  ]) {
    const invalid = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
      patch:{ scheduleWindow:windowPatch } }, owner);
    assert.equal(invalid.body.error.status, 'INVALID_ARGUMENT', 'null explícito não apaga janela nem quando dias mudam');
  }
  await windowRef.update({ 'scheduleWindow.extra':'outro-escritor' });
  const unknown = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ endDate:playDay + 'T19:30' } }, owner);
  assert.equal(unknown.body.error.status, 'FAILED_PRECONDITION', 'chave desconhecida existente não é descartada na edição');
  await windowRef.update({ 'scheduleWindow.extra':admin.firestore.FieldValue.delete() });
  const shortened = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ scheduleWindow:{ version:1, days:[{ day:playDay, startTime:'08:00', endTime:'14:00' }] } } }, owner);
  assert.equal(shortened.body.error.status, 'FAILED_PRECONDITION', 'encurtar dia não corta janela silenciosamente');
  const shortenedExplicit = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ scheduleWindow:{ version:1, days:[{ day:playDay, startTime:'08:00', endTime:'14:00' }], categoryWindows } } }, owner);
  assert.equal(shortenedExplicit.body.error.status, 'FAILED_PRECONDITION',
    'encurtar dia com janela reenviada também é conflito');
  const removedCategory = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ combinedCategories:['Ouro'] } }, owner);
  assert.equal(removedCategory.body.error.status, 'FAILED_PRECONDITION', 'remover categoria com janela é conflito');
  assert.match(removedCategory.body.error.message, /Diamante.*2026-11-13/);
  const shortenedPhase = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ endDate:'2026-11-12T19:30' } }, owner);
  assert.equal(shortenedPhase.body.error.status, 'FAILED_PRECONDITION', 'encurtar fase não descarta janela');
  assert.match(shortenedPhase.body.error.message, /Diamante.*2026-11-13/);
  const cleared = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ scheduleWindow:{ version:1, days, categoryWindows:[] } } }, owner);
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.deepEqual((await windowRef.get()).data().scheduleWindow.categoryWindows, [],
    'lista vazia explícita remove as janelas antes do sorteio');
  await windowRef.update({ 'scheduleWindow.categoryWindows':categoryWindows,
    matches:[{ id:'played-1', category:'Diamante' }] });
  const sameAfterDraw = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ scheduleWindow:{ version:1, days, categoryWindows } } }, owner);
  assert.equal(sameAfterDraw.status, 200, 'janela idêntica após sorteio é no-op');
  const changedAfterDraw = await callFn('updateTournamentConfiguration', { tournamentId:windowId,
    patch:{ scheduleWindow:{ version:1, days, categoryWindows:[{ category:'Diamante', day:playDay,
      startTime:'09:00', endTime:'15:00' }] } } }, owner);
  assert.equal(changedAfterDraw.body.error.status, 'FAILED_PRECONDITION', 'janela publicada não muda');
  const legacyId = 'sb_category-windows-legacy';
  const legacyRef = db.collection('sandboxes').doc(legacyId);
  await legacyRef.set({ id:legacyId, isSandbox:true, sandboxOf:id, sandboxOwnerUid:'sb-owner', sbState:'ready', notificationsMuted:true,
    creatorUid:'sb-owner', adminUids:['sb-owner'], combinedCategories:['Ouro'],
    startDate:playDay + 'T08:00', endDate:playDay + 'T19:30',
    scheduleWindow:{ version:1, days }, matches:[{ id:'played-1', category:'Ouro' }] });
  const legacyNoop = await callFn('updateTournamentConfiguration', { tournamentId:legacyId,
    patch:{ scheduleWindow:{ version:1, days } } }, owner);
  assert.equal(legacyNoop.status, 200, 'torneio sorteado legado aceita agenda idêntica sem categoryWindows');
  await legacyRef.update({ scheduleWindow:{ days } });
  const legacyNoVersion = await callFn('updateTournamentConfiguration', { tournamentId:legacyId,
    patch:{ scheduleWindow:{ version:1, days } } }, owner);
  assert.equal(legacyNoVersion.status, 200, 'versão ausente não bloqueia dias publicados idênticos');
  const invalidDrawId = 'sb_category-windows-invalid-draw';
  const invalidDrawRef = db.collection('sandboxes').doc(invalidDrawId);
  const invalidDraw = { id:invalidDrawId, isSandbox:true, sandboxOf:id, sandboxOwnerUid:'sb-owner',
    sbState:'ready', notificationsMuted:true, creatorUid:'sb-owner', adminUids:['sb-owner'],
    startDate:playDay + 'T08:00', endDate:playDay + 'T19:30', combinedCategories:['Ouro'],
    scheduleWindow:{ version:1, days, categoryWindows:[{ category:'Ouro', day:playDay,
      startTime:'07:00', endTime:'15:00' }] }, participants:[], matches:[], checkedIn:['athlete-1'], absent:['athlete-2'] };
  await invalidDrawRef.set(invalidDraw);
  const rejectedDraw = await callFn('drawRound', { tournamentId:invalidDrawId, sandbox:true }, owner);
  assert.equal(rejectedDraw.body.error.status, 'FAILED_PRECONDITION',
    'sorteio recusa janela inválida antes da hidratação e do cálculo');
  assert.deepEqual((await invalidDrawRef.get()).data().checkedIn, ['athlete-1']);
  assert.deepEqual((await invalidDrawRef.get()).data().absent, ['athlete-2']);
  const scalarId = 'sb_category-windows-scalar-legacy';
  const scalarRef = db.collection('sandboxes').doc(scalarId);
  await scalarRef.set({ ...invalidDraw, id:scalarId, scheduleWindow:'legacy-invalid' });
  const scalarDraw = await callFn('drawRound', { tournamentId:scalarId, sandbox:true }, owner);
  assert.doesNotMatch(JSON.stringify(scalarDraw.body), /Agenda de jogos inválida|Horários por categoria inválidos/,
    'agenda escalar legada sem janelas não recebe nova recusa de categoria');
  console.log('✓ janelas por categoria preservadas, editáveis antes e bloqueadas após sorteio');

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

  console.log('✓ comandos autodraw mantêm o sandbox isolado do torneio original');
})().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
