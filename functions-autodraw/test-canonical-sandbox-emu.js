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
  const testDeveloperUid = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
  const testDeveloper = await token(testDeveloperUid);

  // Desligar o teste sem repetir a preferência precisa limpar a configuração
  // antiga antes das validações e restaurar a visibilidade anterior.
  const resetConfigId = 'tour_1234567890123_' + 'a'.repeat(32);
  const resetConfigRef = db.collection('tournaments').doc(resetConfigId);
  await resetConfigRef.set({ id:resetConfigId, creatorUid:testDeveloperUid, memberUids:[testDeveloperUid],
    testModeEnabled:true, preserveDrawOnTestReset:true,
    testModeVisibilityBefore:{ isPublic:true, membersOnly:false, organizerOnly:false },
    isPublic:false, membersOnly:false, organizerOnly:true, rulesContractVersion:1,
    participants:[], matches:[], rounds:[], groups:[], phases:[] });
  const testOff = await callFn('updateTournamentConfiguration', { tournamentId:resetConfigId,
    patch:{ testModeEnabled:false } }, testDeveloper);
  assert.equal(testOff.status, 200, JSON.stringify(testOff.body));
  const testOffSaved = (await resetConfigRef.get()).data();
  assert.equal(testOffSaved.testModeEnabled, false);
  assert.equal(testOffSaved.preserveDrawOnTestReset, false,
    'desligar teste limpa automaticamente a preferência de preservar sorteio');
  assert.equal(testOffSaved.isPublic, true, 'desligar teste restaura a visibilidade anterior');
  console.log('✓ desligar teste com preservar sorteio ativo retorna ao estado normal sem erro');

  const lateId='tour_1234567890123_'+'b'.repeat(32), lateRef=db.collection('tournaments').doc(lateId);
  const officialGame={id:'official-1',p1:'A',p2:'B',team1:['A','B'],team2:['C','D'],scoreP1:null,scoreP2:null,winner:null};
  await lateRef.set({id:lateId,creatorUid:testDeveloperUid,memberUids:[testDeveloperUid],
    testModeEnabled:true,preserveDrawOnTestReset:false,isPublic:false,organizerOnly:true,
    rulesContractVersion:1,participants:[],matches:[],_semPesados:['matches'],_nJogos:1,rounds:[],groups:[],phases:[],currentPhaseIndex:0});
  await lateRef.collection('matches').doc(officialGame.id).set({_chave:officialGame.id,_loc:{tipo:'matches',mi:0},jogo:officialGame});
  const late=await callFn('updateTournamentConfiguration',{tournamentId:lateId,patch:{preserveDrawOnTestReset:true}},testDeveloper);
  assert.equal(late.status,200,JSON.stringify(late.body));
  const lateSaved=(await lateRef.get()).data();
  assert.equal(lateSaved.drawCheckpoint.state,'active');assert.equal(lateSaved.testModeEnabled,true);
  assert.equal(lateSaved.preserveDrawOnTestReset,true);
  const beforeReset=require('./tournament-rehearsal').fingerprint(lateSaved.matches);
  const staleReset=await callFn('resetTournamentToEnrollment',{tournamentId:lateId,restoreMode:'testModePreDraw'},testDeveloper);
  assert.equal(staleReset.status,400,JSON.stringify(staleReset.body));
  assert.equal(require('./tournament-rehearsal').fingerprint((await lateRef.get()).data().matches),beforeReset);
  const forced=await callFn('drawRound',{tournamentId:lateId,allowRedraw:true},testDeveloper);
  assert.notEqual(forced.status,200,'forced redraw must refuse preserved baseline');
  const restoreLate=await callFn('resetTournamentToEnrollment',{tournamentId:lateId,restoreMode:'testModePostDraw'},testDeveloper);
  assert.equal(restoreLate.status,200,JSON.stringify(restoreLate.body));
  assert.equal(require('./tournament-rehearsal').fingerprint((await lateRef.get()).data().matches),beforeReset);
  console.log('✓ callable real preserva sorteio existente e bloqueia reset pré-sorteio/re-sorteio');

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
  const visibility = await callFn('updateTournamentConfiguration', { tournamentId:routedId,
    sandbox:true, patch:{ isPublic:false, membersOnly:true, organizerOnly:false, endTimeEstimated:true } }, owner);
  assert.equal(visibility.status, 200, JSON.stringify(visibility.body));
  assert.equal((await routed.get()).data().membersOnly, true,
    'organizador muda visibilidade mesmo com horário final estimado no formulário');
  assert.equal((await routed.get()).data().endTimeEstimated, true);
  assert.equal(JSON.stringify((await real.get()).data()), realBefore);
  const legacyConfig = await callFn('updateTournamentConfiguration', { tournamentId:routedId,
    patch:{ courtOrder:['Quadra 2'] } }, owner);
  assert.equal(legacyConfig.status, 200, 'cliente sem flag usa o prefixo privado do ID');
  assert.deepEqual((await routed.get()).data().courtOrder, ['Quadra 2']);
  assert.equal(JSON.stringify((await real.get()).data()), realBefore, 'cliente sem flag não altera original');
  console.log('✓ configuração do sandbox grava só na coleção privada');

  // Categoria com zero vagas: campo ausente segue compatível, a edição grava
  // somente categorias ativas, não cria definições legadas e permite reativar.
  const zeroId = 'sb_zero-capacity-canonical';
  const zeroRef = db.collection('sandboxes').doc(zeroId);
  await zeroRef.set({ id:zeroId, isSandbox:true, sandboxOf:id, sandboxOwnerUid:'sb-owner', sbState:'ready', notificationsMuted:true,
    creatorUid:'sb-owner', adminUids:['sb-owner'], combinedCategories:['A','B'],
    categoryDefinitions:[{ id:'cat-a', label:'A', dimension:'skill' }, { id:'cat-b', label:'B', dimension:'skill' }],
    canonicalRegistrationMigration:{ fingerprint:'zero-capacity-empty', registrationCount:0 },
    maxParticipantsPerCategory:8, maxParticipants:16, maxParticipantsByCategory:{} });
  const excludedA = await callFn('updateTournamentConfiguration', { tournamentId:zeroId, sandbox:true,
    patch:{ combinedCategories:['B'], excludedCategories:['A'], maxParticipantsPerCategory:8, maxParticipants:8,
      maxParticipantsByCategory:{} } }, owner);
  assert.equal(excludedA.status, 200, JSON.stringify(excludedA.body));
  let zeroSaved = (await zeroRef.get()).data();
  assert.deepEqual(zeroSaved.combinedCategories, ['B']);
  assert.deepEqual(zeroSaved.excludedCategories, ['A']);
  assert.deepEqual(zeroSaved.categoryDefinitions.map(item => item.label), ['B']);
  const reactivated = await callFn('updateTournamentConfiguration', { tournamentId:zeroId, sandbox:true,
    patch:{ combinedCategories:['A','B'], excludedCategories:[], maxParticipantsPerCategory:8, maxParticipants:16,
      maxParticipantsByCategory:{} } }, owner);
  assert.equal(reactivated.status, 200, JSON.stringify(reactivated.body));
  zeroSaved = (await zeroRef.get()).data();
  assert.deepEqual(zeroSaved.excludedCategories, []);
  assert.deepEqual(zeroSaved.categoryDefinitions.map(item => item.label), ['A','B']);
  assert.equal(zeroSaved.canonicalRegistrationMigration.registrationCount, 0);
  const missingExclusions = await callFn('updateTournamentConfiguration', { tournamentId:zeroId, sandbox:true,
    patch:{ name:'Compatível sem migração' } }, owner);
  assert.equal(missingExclusions.status, 200, 'campo ausente permanece equivalente a lista vazia');
  console.log('✓ zero vagas exclui uma categoria isolada e valor positivo a reativa no contrato canônico');

  const assignedZeroId = 'sb_zero-capacity-assigned';
  const assignedZeroRef = db.collection('sandboxes').doc(assignedZeroId);
  await assignedZeroRef.set({ id:assignedZeroId, isSandbox:true, sandboxOf:id, sandboxOwnerUid:'sb-owner', sbState:'ready', notificationsMuted:true,
    creatorUid:'sb-owner', adminUids:['sb-owner'], combinedCategories:['A','B'],
    categoryDefinitions:[{ id:'cat-a', label:'A', dimension:'skill' }, { id:'cat-b', label:'B', dimension:'skill' }],
    canonicalRegistrationMigration:{ fingerprint:'zero-capacity-assigned', registrationCount:1 },
    maxParticipantsPerCategory:8, maxParticipants:16, maxParticipantsByCategory:{} });
  await assignedZeroRef.collection('registrations').doc('assigned-a').set({
    registrationId:'assigned-a', status:'confirmed', participantKind:'manual', participantKey:'manual:assigned-a',
    manualParticipantId:'assigned-a', manualDisplayName:'Inscrito A', categoryId:'cat-a', enrollSeq:1 });
  const assignedRemoval = await callFn('updateTournamentConfiguration', { tournamentId:assignedZeroId, sandbox:true,
    patch:{ combinedCategories:['B'], excludedCategories:['A'], maxParticipantsPerCategory:8, maxParticipants:8,
      maxParticipantsByCategory:{} } }, owner);
  assert.equal(assignedRemoval.body.error.status, 'FAILED_PRECONDITION', 'categoria com inscrição vinculada não pode ser zerada');
  assert.deepEqual((await assignedZeroRef.get()).data().combinedCategories, ['A','B'], 'recusa não grava parte da exclusão');
  console.log('✓ exclusão de categoria vinculada a inscrição é recusada sem escrita');

  // Trocar a tela exibida durante os jogos é uma atualização pontual: não
  // regrava as posições salvas nem a tela principal do torneio.
  const tvCore = require('./tv-layout-core');
  const mainScreen = tvCore.defaults();
  const otherScreen = tvCore.defaults();
  otherScreen.backgroundMode = 'custom';
  otherScreen.background = '#223344';
  await routed.update({ status:'ongoing', rulesContractVersion:2, tvLayout:mainScreen,
    tvScreens:[{ phaseIndex:0, layout:mainScreen }, { phaseIndex:1, layout:otherScreen }] });
  const tvBefore = (await routed.get()).data();
  const showOther = await callFn('updateTournamentConfiguration', { tournamentId:routedId,
    sandbox:true, patch:{ tvActiveScreen:1 } }, owner);
  assert.equal(showOther.status, 200, JSON.stringify(showOther.body));
  const tvAfter = (await routed.get()).data();
  assert.equal(tvAfter.tvActiveScreen, 1);
  assert.deepEqual(tvAfter.tvLayout, tvBefore.tvLayout);
  assert.deepEqual(tvAfter.tvScreens, tvBefore.tvScreens);
  const missingScreen = await callFn('updateTournamentConfiguration', { tournamentId:routedId,
    sandbox:true, patch:{ tvActiveScreen:2 } }, owner);
  assert.equal(missingScreen.body.error.status, 'INVALID_ARGUMENT');
  const invalidScreen = await callFn('updateTournamentConfiguration', { tournamentId:routedId,
    sandbox:true, patch:{ tvActiveScreen:12 } }, owner);
  assert.equal(invalidScreen.body.error.status, 'INVALID_ARGUMENT');
  const removedActive = await callFn('updateTournamentConfiguration', { tournamentId:routedId,
    sandbox:true, patch:{ tvScreens:[{ phaseIndex:0, layout:mainScreen }] } }, owner);
  assert.equal(removedActive.body.error.status, 'INVALID_ARGUMENT',
    'remover a tela ativa exige selecionar outra no mesmo salvamento');
  assert.deepEqual((await routed.get()).data().tvScreens, tvBefore.tvScreens);
  assert.equal(JSON.stringify((await real.get()).data()), realBefore);
  console.log('✓ troca de tela ao vivo preserva o layout principal e recusa índice inexistente');

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
  assert.equal(legacyNoVersion.body.result.changed, false,
    'reenviar só a versão implícita da agenda não grava uma mudança');
  assert.deepEqual((await legacyRef.get()).data().scheduleWindow, { days },
    'a escrita redundante não acrescenta metadados ao torneio legado');
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

  const artRequest = { ...imageRequest, type:'tvArt', dataUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' };
  const deniedArt = await callFn('uploadTournamentImage', artRequest, stranger);
  assert.equal(deniedArt.body.error.status, 'NOT_FOUND');
  assert.equal((await callFn('uploadTournamentImage', { ...artRequest, sandbox:false }, owner)).body.error.status, 'NOT_FOUND');
  const sbArt = await callFn('uploadTournamentImage', artRequest, owner);
  assert.equal(sbArt.status,200,JSON.stringify(sbArt.body));
  const sbUrl = sbArt.body.result.url;
  assert.match(decodeURIComponent(sbUrl), new RegExp('tournamentTvArt/' + routedId + '/[a-f0-9-]+\\.gif'));
  const png = { ...artRequest, sandbox:false, tournamentId:id, dataUrl:imageRequest.dataUrl };
  const visitor = await token('sb-tv-participant');
  await real.update({ coHosts:[{uid:'sb-owner',status:'active'}], memberUids:['sb-member','sb-tv-participant'] });
  assert.equal((await callFn('uploadTournamentImage',png,visitor)).body.error.status,'PERMISSION_DENIED');
  const ownerArt = await callFn('uploadTournamentImage',png,member);
  const cohostArt = await callFn('uploadTournamentImage',png,owner);
  assert.equal(ownerArt.status,200,JSON.stringify(ownerArt.body));
  assert.equal(cohostArt.status,200,JSON.stringify(cohostArt.body));
  const url = ownerArt.body.result.url;
  assert.notEqual(url,cohostArt.body.result.url);
  const foreign = sbUrl;
  const config = { enabled:true, mainDurationSeconds:3, mode:'interleaved', slides:[
    { id:'partner', name:'Clube', durationSeconds:7, assets:[url,cohostArt.body.result.url] }] };
  async function update(target, rotation, actor) {
    return callFn('updateTournamentConfiguration',{ tournamentId:target, patch:{ tvRotation:rotation } },actor);
  }
  assert.equal((await update(id,config,visitor)).body.error.status,'PERMISSION_DENIED');
  const unauth = await fetch(base + 'updateTournamentConfiguration',{ method:'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({data:{tournamentId:id,patch:{tvRotation:config}}}) });
  assert.equal((await unauth.json()).error.status,'UNAUTHENTICATED');
  assert.equal((await update(id,config,member)).status,200);
  assert.equal((await update(id,config,owner)).status,200);
  const wrong = { ...config, slides:[{ ...config.slides[0], assets:[foreign] }] };
  assert.equal((await update(id,wrong,owner)).body.error.status,'INVALID_ARGUMENT');
  assert.equal((await update(routedId,wrong,owner)).status,200);
  assert.equal((await update(id,{...config,placement:'banana'},owner)).body.error.status,'INVALID_ARGUMENT');
  assert.deepEqual((await real.get()).data().tvRotation,config);
  const court = {...config,placement:'court'};
  const combined = await callFn('updateTournamentConfiguration', {tournamentId:id,patch:{name:'Open local',tvRotation:court}},owner);
  assert.equal(combined.status,200,JSON.stringify(combined.body));
  for(const stale of [null,{},config,{...config,placement:null}]) {
    assert.equal((await update(id,stale,owner)).body.error.status,'FAILED_PRECONDITION');
    assert.deepEqual((await real.get()).data().tvRotation,court);
  }
  assert.equal((await callFn('updateTournamentConfiguration',{ tournamentId:id,patch:{name:'Open local 2'} },owner)).status,200);
  assert.deepEqual((await real.get()).data().tvRotation,court);
  const tooLarge={...court,slides:Array.from({length:12},(_,i)=>({...config.slides[0],id:String(i),assets:Array(12).fill(url.padEnd(1600,'a'))}))};
  const refused=await callFn('updateTournamentConfiguration',{ tournamentId:id,patch:{name:'não deve ser salvo',tvRotation:tooLarge} },owner);
  assert.equal(refused.body.error.status,'INVALID_ARGUMENT');
  assert.match(refused.body.error.message,/100 KB/);
  assert.equal((await real.get()).data().name,'Open local 2');
  assert.deepEqual((await real.get()).data().tvRotation,court);
  const cloneId = 'tour_' + Date.now() + '_' + 'e'.repeat(32);
  const create = { tournamentId:cloneId, config:{name:'Cópia', sport:'Tênis', format:'Liga'}, tvRotationSourceId:id };
  assert.equal((await callFn('createTournament',create,visitor)).body.error.status,'PERMISSION_DENIED');
  const copied = await callFn('createTournament',create,owner);
  assert.equal(copied.status,200,JSON.stringify(copied.body));
  assert.deepEqual(copied.body.result.tournament.tvRotation,court);
  assert.equal((await update(cloneId,{ ...court, mainDurationSeconds:18 },owner)).status,200);
  assert.equal((await update(cloneId,{...wrong,placement:'court'},owner)).body.error.status,'INVALID_ARGUMENT');
  assert.equal((await update(id,{...config,placement:'screen'},owner)).status,200);
  const savedScreen=(await real.get()).data().tvRotation;
  assert.equal(Object.hasOwn(savedScreen,'placement'),false); assert.deepEqual(savedScreen,config);
  const ownId = 'tour_' + Date.now() + '_' + 'c'.repeat(32);
  const ownConfig = { ...court, slides:[{...config.slides[0],assets:[url.replace(encodeURIComponent('/' + id + '/'),encodeURIComponent('/' + ownId + '/'))]}] };
  const own = { tournamentId:ownId, config:{ ...create.config, tvRotation:ownConfig } };
  assert.equal((await callFn('createTournament',{ ...own, config:{...own.config,tvRotation:config} },owner)).body.error.status,'INVALID_ARGUMENT');
  const created = await callFn('createTournament',own,owner);
  assert.equal(created.status,200,JSON.stringify(created.body));
  assert.deepEqual(created.body.result.tournament.tvRotation,ownConfig);
  console.log('✓ patrocinadores: uploads exclusivos, autorização, configuração, clone e referências herdadas');
  console.log('✓ comandos autodraw mantêm o sandbox isolado do torneio original');
})().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
