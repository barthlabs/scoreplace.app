'use strict';

// Callable real no emulador: espectador de torneio geral vê somente entradas
// presentes nos jogos públicos. Não usa dados de produção.
// Execução manual (não cabe no gate unitário, que não sobe emuladores):
// PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --only functions,firestore,auth --project demo-scoreplace "node functions/test-public-canonical-roster-emu.js"
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const registrationCore = require('./registration-core');

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

function registration(tournamentId, uid, pairId) {
  const categoryId = 'cat-a';
  const participantKey = 'uid:' + uid;
  return {
    tournamentId, categoryId, participantKey,
    registrationId: registrationCore.registrationId(participantKey, categoryId),
    participantKind: 'account', participantUid: uid, manualParticipantId: null,
    fixedPairId: pairId || null, status: 'confirmed', validationState: 'approved',
    enrollSeq: uid === 'undefined' ? 7 : Number(uid.split('-').pop())
  };
}

async function call(tournamentId, idToken, sandbox) {
  const response = await fetch(base, { method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' },
      idToken ? { Authorization: 'Bearer ' + idToken } : {}),
    body: JSON.stringify({ data: { tournamentId, ...(sandbox ? { sandbox: true } : {}) } }) });
  return { status: response.status, body: await response.json() };
}

(async () => {
  const org = await token('pub-org');
  const pairMember = await token('pub-player-1');
  const member = await token('pub-player-3');
  const spectator = await token('pub-spectator');
  const id = 'public-roster-fixture';
  const ref = db.collection('tournaments').doc(id);
  const root = {
    id, creatorUid: 'pub-org', isPublic: true, status: 'finished',
    canonicalRegistrationMigration: { fingerprint: 'fixture', registrationCount: 7 },
    categoryDefinitions: [{ id: 'cat-a', label: 'Categoria A', dimension: 'skill',
      exclusivityGroup: 'skill', criteria: {} }],
    placeholderReservations: []
  };
  await ref.set(root);
  for (const [uid, pairId] of [['pub-player-1', 'pair-1'], ['pub-player-2', 'pair-1'], ['pub-player-3', null], ['undefined', null]]) {
    const entry = registration(id, uid, pairId);
    await ref.collection('registrations').doc(entry.registrationId).set(entry);
  }
  const manualKey = 'manual:pub-manual-1';
  const manualRegistrationId = registrationCore.registrationId(manualKey, 'cat-a');
  await ref.collection('registrations').doc(manualRegistrationId).set({
    tournamentId: id, categoryId: 'cat-a', participantKey: manualKey,
    registrationId: manualRegistrationId, participantKind: 'manual', participantUid: null,
    manualParticipantId: 'pub-manual-1', manualDisplayName: 'Ana',
    fixedPairId: null, status: 'confirmed', validationState: 'approved', enrollSeq: 4
  });
  for (const [manualId, displayName, seq] of [
    ['pub-manual-2', 'Juliana', 5], ['pub-manual-3', 'Paula', 6]
  ]) {
    const key = 'manual:' + manualId;
    const regId = registrationCore.registrationId(key, 'cat-a');
    await ref.collection('registrations').doc(regId).set({
      tournamentId: id, categoryId: 'cat-a', participantKey: key,
      registrationId: regId, participantKind: 'manual', participantUid: null,
      manualParticipantId: manualId, manualDisplayName: displayName,
      fixedPairId: 'pair-2', status: 'confirmed', validationState: 'approved', enrollSeq: seq
    });
  }
  await ref.collection('matches').doc('game-1').set({
    _loc: { tipo: 'matches', mi: 0 },
    playerUids: ['pub-player-1', 'pub-player-2'],
    jogo: { id: 'game-1', p1: 'Juliana', team1Obj: { fixedPairId: 'pair-1',
      p1Uid: 'pub-player-1', p2Uid: 'pub-player-2', displayName: 'Juliana e Paula' } }
  });
  await ref.collection('matches').doc('game-2').set({
    _loc: { tipo: 'matches', mi: 1 },
    jogo: { id: 'game-2', team1Obj: { fixedPairId: 'pair-2', displayName: 'Juliana e Paula' } }
  });
  // A identidade válida está depois da primeira página de 200 documentos.
  // Este cenário exercita a mesma paginação usada em produção, sem reduzir
  // artificialmente o tamanho da página apenas para o teste.
  for (let start = 0; start < 201; start += 50) {
    const batch = db.batch();
    for (let index = start; index < Math.min(start + 50, 201); index += 1) {
      batch.set(ref.collection('matches').doc('page-' + String(index).padStart(3, '0')),
        index === 200
          ? { _loc: { tipo: 'matches', mi: index + 2 }, jogo: { id: 'page-200', team2Obj: { uid: 'pub-player-3' } } }
          : { _loc: { tipo: 'matches', mi: index + 2 }, jogo: { id: 'page-' + index } });
    }
    await batch.commit();
  }

  const general = await call(id, spectator);
  assert.equal(general.status, 200, JSON.stringify(general.body));
  assert.equal(general.body.result.registrationCount, 7, 'recibo conserva contagem canônica integral');
  assert.equal(general.body.result.participants.length, 2, 'espectador vê somente inscritos nos jogos públicos, inclusive após a página 200');
  assert.equal(general.body.result.participants[0].fixedPairId, 'pair-1');
  assert.equal(general.body.result.participants.some(p => p.uid === 'pub-player-3'), true,
    'a identidade presente somente na última página é encontrada');
  assert.equal(general.body.result.participants.some(p => p.manualParticipantId || p.p1Name || p.p2Name), false,
    'nomes ou IDs manuais, inclusive o homônimo Ana/Juliana, não saem na projeção pública');
  assert.equal(general.body.result.participants.some(p => p.fixedPairId === 'pair-2'), false,
    'dupla totalmente manual não se liga ao jogo antigo apenas pelo ID da dupla');
  assert.deepEqual(Object.keys(general.body.result.participants[0]).sort(),
    ['categories', 'category', 'categoryId', 'fixedPair', 'fixedPairId', 'p1Uid', 'p2Uid'].sort(),
    'espectador recebe apenas a lista explícita de campos públicos');
  const anonymous = await call(id, null);
  assert.equal(anonymous.status, 200, JSON.stringify(anonymous.body));
  assert.equal(anonymous.body.result.participants.length, 2,
    'UID literal undefined nunca transforma anônimo em membro do elenco completo');
  assert.deepEqual(anonymous.body.result.placeholderReservations, []);
  await ref.collection('matches').doc('game-1').update({
    'jogo.team1Obj.p1Uid': 'pub-player-antigo'
  });
  const stalePair = await call(id, spectator);
  assert.equal(stalePair.status, 200, JSON.stringify(stalePair.body));
  assert.equal(stalePair.body.result.participants.length, 1,
    'ID da dupla antigo não revela UID de composição nova');
  await ref.collection('matches').doc('game-1').update({
    'jogo.team1Obj.p1Uid': 'pub-player-1'
  });

  const fullOrg = await call(id, org);
  assert.equal(fullOrg.status, 200, JSON.stringify(fullOrg.body));
  assert.equal(fullOrg.body.result.participants.length, 5, 'organização recebe elenco completo');
  const fullMember = await call(id, member);
  assert.equal(fullMember.status, 200, JSON.stringify(fullMember.body));
  assert.equal(fullMember.body.result.participants.length, 5, 'inscrito recebe elenco completo');

  await ref.update({ organizerOnly: true });
  assert.notEqual((await call(id, spectator)).status, 200, 'organizerOnly nega espectador');
  assert.notEqual((await call(id, null)).status, 200, 'organizerOnly nega anônimo');
  await ref.update({ organizerOnly: false, membersOnly: true });
  assert.notEqual((await call(id, spectator)).status, 200, 'membersOnly nega espectador');
  await ref.update({ membersOnly: false, isPublic: false });
  assert.notEqual((await call(id, spectator)).status, 200, 'privado nega espectador');

  const sbRef = db.collection('sandboxes').doc('sb-public-roster-fixture');
  await sbRef.set(Object.assign({}, root, { id: sbRef.id, isSandbox: true, sandboxOf: id,
    sandboxOwnerUid: 'pub-org', sbState: 'ready', notificationsMuted: true }));
  const canonicalDocs = await ref.collection('registrations').get();
  const copyBatch = db.batch();
  canonicalDocs.forEach((doc) => copyBatch.set(sbRef.collection('registrations').doc(doc.id), doc.data()));
  await copyBatch.commit();
  const ownSandbox = await call(sbRef.id, org, true);
  assert.equal(ownSandbox.status, 200, JSON.stringify(ownSandbox.body));
  assert.equal(ownSandbox.body.result.registrationCount, 7, 'dono vê somente cópia canônica validada');
  assert.notEqual((await call(sbRef.id, spectator, true)).status, 200, 'sandbox nega espectador');
  assert.notEqual((await call(sbRef.id, null, true)).status, 200, 'sandbox nega anônimo');
  console.log('✅ projeção pública do elenco canônico verificada');
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
