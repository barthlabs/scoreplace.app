'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');

async function driver() {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8093';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9092';
  const admin = require('../functions/node_modules/firebase-admin');
  const fb = require('firebase/compat/app');
  require('firebase/compat/auth'); require('firebase/compat/functions');
  const { registrationId } = require('../functions/registration-core');
  const { canonicalPairId } = require('../functions/registration-mutations-core');
  const projectId = 'demo-scoreplace';
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  for (const [uid, displayName] of [['org-edit', 'Organizador'], ['old-edit', 'Conta antiga'], ['new-edit', 'Conta nova']]) {
    await admin.auth().createUser({ uid, email: uid + '@edit.test', password: 'senha123' });
    await db.doc('usersPublic/' + uid).set({ displayName, displayName_lower: displayName.toLowerCase() });
  }
  const firebase = fb.default || fb;
  const app = firebase.initializeApp({ apiKey: 'fake', projectId, authDomain: 'localhost' });
  app.auth().useEmulator('http://127.0.0.1:9092', { disableWarnings: true });
  app.functions('us-central1').useEmulator('127.0.0.1', 5011);
  await app.auth().signInWithEmailAndPassword('org-edit@edit.test', 'senha123');
  const call = (payload) => app.functions('us-central1').httpsCallable('editCanonicalTournamentSlot')({ operation: 'replace', ...payload }).then((r) => r.data);
  for (const [kind, sourceUid, targetUid] of [
    ['manual-manual', false, false], ['manual-uid', false, true],
    ['uid-manual', true, false], ['uid-uid', true, true],
  ]) {
    const tid = 'tour-edit-' + kind, sid = 'sb_' + tid, cat = 'fem-light';
    const sourceKey = sourceUid ? 'uid:old-edit' : 'manual:typed-a';
    const idA = registrationId(sourceKey, cat), idB = registrationId('manual:typed-b', cat);
    const pairId = canonicalPairId(tid, cat, [idA, idB]);
    const first = { registrationId: idA, tournamentId: tid, categoryId: cat, originCategoryId: cat,
      participantKey: sourceKey, participantKind: sourceUid ? 'account' : 'manual',
      participantUid: sourceUid ? 'old-edit' : null, manualParticipantId: sourceUid ? null : 'typed-a',
      status: 'confirmed', validationState: 'approved', fixedPairId: pairId };
    if (!sourceUid) first.manualDisplayName = 'Pessoa antiga';
    const second = { registrationId: idB, tournamentId: tid, categoryId: cat, originCategoryId: cat,
      participantKey: 'manual:typed-b', participantKind: 'manual', participantUid: null,
      manualParticipantId: 'typed-b', manualDisplayName: 'Parceira',
      status: 'confirmed', validationState: 'approved', fixedPairId: pairId };
    const side = { fixedPair: true, fixedPairId: pairId, categoryId: cat, p1Name: sourceUid ? 'Conta antiga' : 'Pessoa antiga',
      p2ManualId: 'typed-b', p2Name: 'Parceira' };
    side[sourceUid ? 'p1Uid' : 'p1ManualId'] = sourceUid ? 'old-edit' : 'typed-a';
    const root = { creatorUid: 'org-edit', adminUids: ['org-edit'], memberUids: sourceUid ? ['old-edit'] : [],
      name: 'Teste troca ' + kind, categoryDefinitions: [{ id: cat, label: 'Fem Light' }],
      canonicalRegistrationMigration: { fingerprint: 'edit-fixture', registrationCount: 2 },
      rounds: [], matches: [], standings: [{ name: 'Equipe Azul', wins: 1 }] };
    await db.doc('tournaments/' + tid).set(root);
    await db.doc('sandboxes/' + sid).set({ ...root, isSandbox: true, sbState: 'ready', sandboxOf: tid,
      sandboxOwnerUid: 'org-edit', notificationsMuted: true, pendingDraw: { kind: 'initial', private: true } });
    for (const collection of ['tournaments/' + tid, 'sandboxes/' + sid]) {
      await db.doc(collection + '/registrations/' + idA).set(first);
      await db.doc(collection + '/registrations/' + idB).set(second);
      await db.doc(collection + '/inscritos/pair').set({ item: side });
    }
    const match = { id: 'game-1', team1Obj: side, team2Obj: { p1ManualId: 'other', p2ManualId: 'else' },
      team1Uids: sourceUid ? ['old-edit'] : [], team2Uids: [] };
    await db.doc('sandboxes/' + sid + '/privateDraws/initial').set({ kind: 'initial',
      draft: { participants: [side], matches: [match], competitionPairAssignments: [{ fixedPairId: pairId }] } });
    await db.doc('tournaments/' + tid + '/matches/game-1').set({ _chave: 'game-1', _loc: { tipo: 'matches', mi: 0 },
      playerUids: sourceUid ? ['old-edit'] : [], jogo: { ...match, p1: side.p1Name + ' / Parceira',
        p2: 'Outra dupla', scheduledAt: '2026-10-22T18:00:00Z', court: 'Quadra 4',
        scoreP1: 0, scoreP2: 0, winner: null } });
    await db.doc('tournaments/' + tid + '/results/game-1').set({ matchId: 'game-1',
      p1: side.p1Name + ' / Parceira', p2: 'Outra dupla',
      playerUids: sourceUid ? ['old-edit'] : [], scoreP1: 0, scoreP2: 0, winner: null });
    await db.doc('tournaments/' + tid + '/matches/game-0').set({ _chave: 'game-0',
      _loc: { tipo: 'matches', mi: 1 }, playerUids: sourceUid ? ['old-edit'] : [],
      jogo: { ...match, id: 'game-0', p1: side.p1Name + ' / Parceira', p2: 'Outra dupla',
        scoreP1: 6, scoreP2: 3, winner: 1, endedAt: '2026-10-22T19:00:00Z' } });
    await db.doc('tournaments/' + tid + '/results/game-0').set({ matchId: 'game-0',
      p1: side.p1Name + ' / Parceira', p2: 'Outra dupla',
      playerUids: sourceUid ? ['old-edit'] : [], scoreP1: 6, scoreP2: 3,
      winner: 1, endedAt: '2026-10-22T19:00:00Z' });
    await db.doc('tournaments/' + tid + '/matches/game-1').update({ 'jogo.startedAt': '2026-10-22T19:10:00Z' });
    await db.doc('tournaments/' + tid + '/checkedIn/' + (sourceUid ? 'old-edit' : 'typed-a')).set({ present: true });
    await db.doc('tournaments/' + tid).update({
      checkedInConfirmed: { [sourceUid ? 'old-edit' : 'typed-a']: true },
      absent: { [sourceUid ? 'old-edit' : 'typed-a']: false },
      opponentHistory: { [pairId]: ['past-opponent'] },
      woLog: [{ matchId: 'historical', absentName: side.p1Name, note: 'registro anterior' }],
    });
    const historicalBefore = (await db.doc('tournaments/' + tid + '/matches/game-0').get()).data();
    const historicalResultBefore = (await db.doc('tournaments/' + tid + '/results/game-0').get()).data();
    const result = await call({ tournamentId: sid, sandbox: true, uid: sourceUid ? 'old-edit' : '',
      manualParticipantId: sourceUid ? '' : 'typed-a', categoryId: cat,
      expectedName: sourceUid ? 'Conta antiga' : 'Pessoa antiga',
      newName: targetUid ? '' : 'Pessoa nova', targetUid: targetUid ? 'new-edit' : '' });
    assert.equal(result.ok, true, kind);
    const regs = (await db.collection('sandboxes/' + sid + '/registrations').get()).docs.map((doc) => doc.data());
    assert(regs.some((item) => item.participantKind === (targetUid ? 'account' : 'manual') &&
      item.status === 'confirmed' && item.fixedPairId &&
      (targetUid ? item.participantUid === 'new-edit' : item.manualDisplayName === 'Pessoa nova')), kind);
    const mirror = (await db.doc('sandboxes/' + sid + '/inscritos/pair').get()).data().item;
    assert.equal(mirror.p1Name, targetUid ? 'Conta nova' : 'Pessoa nova', kind);
    assert.equal(mirror.p1Uid || '', targetUid ? 'new-edit' : '', kind);
    const draft = (await db.doc('sandboxes/' + sid + '/privateDraws/initial').get()).data().draft;
    assert.equal(draft.matches[0].team1Obj.p1Name, mirror.p1Name, kind);
    assert.equal(draft.matches[0].team1Obj.p1Uid || '', mirror.p1Uid || '', kind);
    assert.equal((await db.doc('tournaments/' + tid + '/registrations/' + idA).get()).data().status, 'confirmed', kind);
    assert.equal((await db.doc('tournaments/' + tid + '/inscritos/pair').get()).data().item.p1Name, side.p1Name, kind);
    if (kind === 'manual-manual') {
      const tournamentRef = db.doc('tournaments/' + tid);
      for (const [field, value] of [
        ['standings', [{ name: 'Pessoa antiga / Parceira', wins: 1 }]],
        ['phaseRounds', { 1: { rounds: [{ matches: [{ team1Obj: side }] }] } }],
        ['woHistory', { 'typed-a': { absentName: 'Pessoa antiga' } }],
      ]) {
        await tournamentRef.update({ [field]: value });
        await assert.rejects(call({ tournamentId: tid, sandbox: false, manualParticipantId: 'typed-a',
          categoryId: cat, expectedName: 'Pessoa antiga', newName: 'Pessoa nova' }),
        /failed-precondition|referenciada|referência|classificação|rodada|histórico|pontuação|W\.O\./i, field);
        await tournamentRef.update({ [field]: admin.firestore.FieldValue.delete() });
      }
    }
    const published = await call({ tournamentId: tid, sandbox: false,
      uid: sourceUid ? 'old-edit' : '', manualParticipantId: sourceUid ? '' : 'typed-a',
      categoryId: cat, expectedName: sourceUid ? 'Conta antiga' : 'Pessoa antiga',
      newName: targetUid ? '' : 'Pessoa nova', targetUid: targetUid ? 'new-edit' : '' });
    assert.equal(published.ok, true, 'chave publicada: ' + kind);
    const rosterHistory = (await db.doc('tournamentRosterHistory/' + tid).get()).data();
    assert.equal(rosterHistory.events.length, 1, 'histórico público da troca: ' + kind);
    assert.equal(rosterHistory.events[0].fromName, sourceUid ? 'Conta antiga' : 'Pessoa antiga');
    assert.equal(rosterHistory.events[0].toName, targetUid ? 'Conta nova' : 'Pessoa nova');
    assert.equal((await db.doc('tournamentRosterHistory/' + sid).get()).exists, false, 'sandbox não escreve histórico público');
    const edited = (await db.doc('tournaments/' + tid + '/matches/game-1').get()).data().jogo;
    assert.equal(edited.p1, (targetUid ? 'Conta nova' : 'Pessoa nova') + ' / Parceira', kind);
    assert.equal(edited.court, 'Quadra 4', kind);
    assert.equal(edited.scoreP1, 0, kind);
    assert.equal(edited.team1Obj.p1Uid || '', targetUid ? 'new-edit' : '', kind);
    assert.equal((await db.doc('tournaments/' + tid + '/matches/game-1').get()).data().playerUids.includes('new-edit'),
      targetUid, kind);
    assert.deepEqual((await db.doc('tournaments/' + tid + '/matches/game-0').get()).data(), historicalBefore, kind);
    assert.deepEqual((await db.doc('tournaments/' + tid + '/results/game-0').get()).data(), historicalResultBefore, kind);
    assert.equal(edited.startedAt, '2026-10-22T19:10:00Z', kind);
    assert.equal(edited.team1Obj.fixedPairId, pairId, kind);
    assert.equal((await db.doc('tournaments/' + tid + '/checkedIn/' + (sourceUid ? 'old-edit' : 'typed-a')).get()).exists, true, kind);
    const tournamentAfter = (await db.doc('tournaments/' + tid).get()).data();
    assert.equal((tournamentAfter.checkedInConfirmed || {})[sourceUid ? 'old-edit' : 'typed-a'], true, kind);
    assert.equal((tournamentAfter.absent || {})[sourceUid ? 'old-edit' : 'typed-a'], false, kind);
    const activeReplacement = (await db.collection('tournaments/' + tid + '/registrations').get()).docs
      .map((doc) => doc.data()).find((item) => item.status === 'confirmed' &&
        (targetUid ? item.participantUid === 'new-edit' : item.manualDisplayName === 'Pessoa nova'));
    assert(activeReplacement, kind);
    assert.notEqual(activeReplacement.manualParticipantId || activeReplacement.participantUid,
      sourceUid ? 'old-edit' : 'typed-a', kind);
    assert.deepEqual(tournamentAfter.opponentHistory, { [pairId]: ['past-opponent'] }, kind);
    assert.deepEqual(tournamentAfter.woLog, [{ matchId: 'historical', absentName: side.p1Name,
      note: 'registro anterior' }], kind);
    assert.equal((await db.doc('tournaments/' + tid + '/registrations/' + idA).get()).data().status,
      'withdrawn', kind);
  }
  // Individual entries in published rotating groups, with explicit points policy.
  for(const sourceUid of [true,false]) for(const targetUid of [true,false]) for(const policy of ['inherit','reset']) {
    const tid='tour-solo-'+sourceUid+'-'+targetUid+'-'+policy,cat='fem-light',base='tournaments/'+tid;
    const sourceKey=sourceUid?'uid:old-edit':'manual:solo-old';
    const entries=[sourceKey,'manual:partner','manual:rival1','manual:rival2'].map((key,i)=>({registrationId:registrationId(key,cat),tournamentId:tid,
      categoryId:cat,originCategoryId:cat,participantKey:key,participantKind:key.startsWith('uid:')?'account':'manual',participantUid:key.startsWith('uid:')?key.slice(4):null,
      manualParticipantId:key.startsWith('manual:')?key.slice(7):null,...(key.startsWith('manual:')?{manualDisplayName:i?'Jogadora '+i:'Antiga'}:{}),
      status:'confirmed',validationState:'approved',fixedPairId:null}));
    await db.doc(base).set({creatorUid:'org-edit',name:'Grupo solo',status:'active',categoryDefinitions:[{id:cat,label:'Fem Light'}],
      canonicalRegistrationMigration:{fingerprint:'solo-fixture',registrationCount:4},checkedInConfirmed:{'old-edit':true},currentPhaseIndex:0,matches:[],rounds:[],groups:[]});
    for(const [i,r] of entries.entries()) {
      await db.doc(base+'/registrations/'+r.registrationId).set(r);
      const item={categoryId:cat,category:'Fem Light',...(r.participantUid?{uid:r.participantUid}:{manualParticipantId:r.manualParticipantId,name:r.manualDisplayName,displayName:r.manualDisplayName})};
      const split=require('../functions/vendor/tournament-split-core');
      await db.doc(base+'/inscritos/'+split.chaveDoInscrito(item)).set({_idx:i,item});
    }
    const names=[sourceUid?'Conta antiga':'Antiga','Jogadora 1','Jogadora 2','Jogadora 3'];
    const game={id:'solo-future',phaseIndex:0,category:'Fem Light',categoryId:cat,isMonarch:true,groupIdx:0,p1:names.slice(0,2).join(' / '),p2:names.slice(2).join(' / '),
      team1:names.slice(0,2),team2:names.slice(2),team1Uids:[sourceUid?'old-edit':null,null],team2Uids:[null,null],team1SlotIds:[sourceKey,'manual:partner'],team2SlotIds:['manual:rival1','manual:rival2'],
      round:2,scheduledAt:'2026-11-29T10:00:00Z',court:'Q1',scoreP1:0,scoreP2:0,winner:null};
    const history={...game,id:'solo-history',round:1,scoreP1:4,scoreP2:3,winner:'p1'};
    await db.doc(base+'/matches/solo-future').set({jogo:game,_chave:'solo-future',_loc:{tipo:'matches',mi:0}});
    await db.doc(base+'/matches/solo-history').set({jogo:history,_chave:'solo-history',_loc:{tipo:'matches',mi:1}});
    await db.doc(base+'/grupos/g0').set({category:'Fem Light',categoryId:cat,groupIdx:0,players:names,playersUids:[sourceUid?'old-edit':null,null,null,null],playersSlotIds:entries.map(r=>r.participantKey)});
    await db.doc(base).update({rounds:[{round:2,matches:[game]}]});
    if(sourceUid && targetUid && policy==='inherit') {
      const payload={tournamentId:tid,uid:'old-edit',categoryId:cat,expectedName:names[0],targetUid:'new-edit',pointsPolicy:policy};
      await db.doc(base+'/matches/solo-future').update({'jogo.liveScored':true});
      const rootBefore=(await db.doc(base).get()).data();
      await assert.rejects(call(payload),/parcial/);
      assert.deepEqual((await db.doc(base).get()).data(),rootBefore,'partial refusal writes nothing to root');
      assert.equal((await db.doc(base+'/registrations/'+entries[0].registrationId).get()).data().status,'confirmed');
      await db.doc(base+'/matches/solo-future').update({'jogo.liveScored':admin.firestore.FieldValue.delete()});
    }
    const result=await call({tournamentId:tid,uid:sourceUid?'old-edit':'',manualParticipantId:sourceUid?'':'solo-old',categoryId:cat,
      expectedName:names[0],newName:targetUid?'':'Nova manual',targetUid:targetUid?'new-edit':'',pointsPolicy:policy});
    assert.equal(result.ok,true);
    const rosterHistory = (await db.doc('tournamentRosterHistory/' + tid).get()).data();
    assert.equal(rosterHistory.events.length, 1);
    assert.equal(rosterHistory.events[0].kind, 'substitution');
    assert.equal(rosterHistory.events[0].fromName, names[0]);
    assert.equal(rosterHistory.events[0].toName, targetUid ? 'Conta nova' : 'Nova manual');
    assert.deepEqual((await db.doc(base+'/matches/solo-history').get()).data().jogo,history);
    const nextGame=(await db.doc(base+'/matches/solo-future').get()).data().jogo;
    assert.equal(nextGame.team1Uids[0],targetUid?'new-edit':null);assert.equal(nextGame.scheduledAt,game.scheduledAt);assert.equal(nextGame.court,game.court);
    const nextRoot=(await db.doc(base).get()).data();assert.equal(nextRoot.rounds[0].matches[0].team1Uids[0],targetUid?'new-edit':null);
    assert.equal(nextRoot.participantSlotReplacements.events[0].pointsPolicy,policy);
    assert.equal(nextRoot.checkedInConfirmed['old-edit'],true);assert(!nextRoot.checkedInConfirmed['new-edit']);
    const regs=(await db.collection(base+'/registrations').get()).docs.map(d=>d.data());
    assert.equal(regs.find(r=>r.registrationId===entries[0].registrationId).status,'withdrawn');
    assert(regs.some(r=>r.status==='confirmed' && (targetUid?r.participantUid==='new-edit':r.manualDisplayName==='Nova manual')));
  }
  console.log('✓ EMULATOR_SLOT_EDIT_OK: quatro transições e produção preservada');
  process.exit(0);
}

if (process.argv.includes('--driver')) driver().catch((error) => { console.error(error.stack || error); process.exit(1); });
else {
  const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore,auth,functions',
    '--config', path.join(ROOT, 'firebase.sandbox.json'), '--project', 'demo-scoreplace',
    'node tests/edit-canonical-slot-emulator.test.js --driver'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH },
  });
  assert(output.includes('EMULATOR_SLOT_EDIT_OK'), output.slice(-4000));
  console.log('✓ edição de vaga validada no Firebase Emulator');
}
