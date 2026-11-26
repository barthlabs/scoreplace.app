'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const project = 'demo-scoreplace';

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const fs = require('node:fs');
    const os = require('node:os');
    const net = require('node:net');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-end-court-'));
    try {
      const port = await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on('error', reject).listen(0, '127.0.0.1', () => {
          const value = server.address().port;
          server.close(() => resolve(value));
        });
      });
      const config = path.join(temp, 'firebase.json');
      fs.writeFileSync(config, JSON.stringify({ emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled:false } } }));
      const output = require('./emulador').rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--project', project,
        '--config', config, 'node tests/end-court-remaining-emulator.test.js'], {
        cwd: path.resolve(__dirname, '..'), env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH },
        timeout: 120000, stdio:['ignore','pipe','pipe']
      });
      assert.match(output, /end-court physical: OK/);
    } finally { fs.rmSync(temp, { recursive:true, force:true }); }
    return;
  }
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
  process.env.GCLOUD_PROJECT = project;
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId:project });
  const cf = require('../functions-autodraw/index.js').endMatchOnCourt;
  const backend = createRequire(require.resolve('../functions-autodraw/index.js'));
  const db = backend('firebase-admin/firestore').getFirestore();
  const digest = backend('./court-capability-digest.js').digestFor(path.dirname(backend.resolve('./index.js')));
  await db.doc('operationRuntimeCapabilities/endMatchOnCourt').set({ ready:true, centralSourceDigest:digest });
  const ref = db.collection('tournaments').doc('tour_' + randomUUID());
  const when = '2026-11-13T12:00:00.000Z';
  const base = { isMonarch:true, monarchGroup:0, category:'A', round:1, phaseIndex:0, court:'Quadra 1', p1:'A / B', p2:'C / D' };
  const games = [
    { ...base, id:'j1', winner:'A / B', scoreP1:6, scoreP2:2, resultAt:when, courtCalledAt:when },
    { ...base, id:'j2', courtCalledAt:when }, { ...base, id:'j3', scoreP1:1 },
    { id:'single', court:'Quadra 2', courtCalledAt:when }
  ];
  const part = backend('./vendor/tournament-split-core.js').dividir({ matches:games }, ['matches']);
  const batch = db.batch();
  batch.set(ref, { creatorUid:'owner', name:'Synthetic', status:'active', _nJogos:games.length,
    _nPartes:{ matches:games.length }, matches:[], courtNames:['Quadra 1', 'Quadra 2'] });
  part.matches.forEach(record => batch.set(ref.collection('matches').doc(record._chave),record));
  await batch.commit();
  const physical = id => ref.collection('matches').doc(id);
  const audit = () => ref.collection('courtReleases').get();
  const state = () => ref.collection('courtState').doc('main').get();
  const release = (id, op = randomUUID(), uid = 'owner', whole = true) => cf.run({
    data:{ tournamentId:ref.id, matchId:id, action:'release', monarchEndWholeBlock:whole, operationId:op },
    auth:{ uid,token:{ uid } }, rawRequest:{ headers:{} }
  });
  await assert.rejects(release('j1',randomUUID(),'stranger'), { code:'permission-denied' });
  await assert.rejects(release('j1'), /placar parcial/);
  assert.equal((await audit()).size, 0);
  assert.equal((await state()).exists, false);
  await physical('j3').update('jogo.scoreP1', 0);
  const initial = (await physical('j1').get()).data();
  const id = randomUUID();
  const result = await release('j1',id);
  assert.deepEqual(result.releasedMatchIds,['j2','j3']);
  assert.deepEqual((await physical('j1').get()).data(),initial);
  assert.deepEqual(Object.keys((await state()).data().released).sort(),['j2','j3']);
  assert.equal((await physical('j2').get()).data().jogo.court,null);
  assert.equal((await physical('j3').get()).data().jogo.court,null);
  const replay = await release('j1',id);
  assert.equal(replay.replayed,true);
  assert.deepEqual(replay.releasedMatchIds,result.releasedMatchIds);
  assert.deepEqual((await release('j2')).releasedMatchIds,[]);
  assert.equal((await audit()).size,2);
  assert.deepEqual((await release('single')).releasedMatchIds,['single']);
  const original = (await state()).data();
  const restore = async mid => cf.run({ auth:{uid:'owner'},data:{ tournamentId:ref.id, matchId:mid,
    action:'restore',operationId:randomUUID() } });
  await restore('j3');
  const remaining = await release('j2');
  assert.deepEqual(remaining.releasedMatchIds,['j3'],'concluído e liberado preservados');
  assert.equal((await state()).data().released.j2,original.released.j2);
  assert.deepEqual((await physical('j1').get()).data(),initial);

  // Uma rodada A–H tem dois quartetos independentes, não a série de três
  // acima. Chamar/encerrar um deles não desloca o outro nem seus relógios.
  const draw = backend('./draw-core.js');
  const fmt = draw._window.FORMAT2;
  const cfg = fmt.defaultConfig('beach_tennis');
  cfg.parceria = 'rotation_groups_8';
  cfg.rodadas.n = 5;
  cfg.eliminatoria.ativa = false;
  const compiled = fmt.compileToPhases(cfg, {sport:'beach_tennis'});
  const people = Array.from({length:8}, (_, i) => ({uid:'rotation-' + i, displayName:'Atleta ' + i}));
  const rotation = draw._window._phasesEngine.genGroupsFromPool(people, compiled.phases[0], 'court-rotation');
  const rotationGames = rotation.matches.map((m, i) => Object.assign({}, m, {
    category:'Rodízio', phaseIndex:0, _gameNum:i + 1
  }));
  const firstRound = rotationGames.filter(m => m.round === 1);
  assert.equal(firstRound.length, 2);
  assert.equal(new Set(firstRound.flatMap(m => m.team1Uids.concat(m.team2Uids))).size, 8);
  const rotationRef = db.collection('tournaments').doc('tour_rotation_' + randomUUID());
  const rotationParts = backend('./vendor/tournament-split-core.js').dividir({matches:rotationGames}, ['matches']);
  const write = db.batch();
  write.set(rotationRef, { creatorUid:'owner', name:'Rodízio sintético', status:'active',
    testModeEnabled:true, format:'Liga', sport:'beach_tennis', resultEntry:'organizer',
    phases:compiled.phases, currentPhaseIndex:0, fmt2:cfg, combinedCategories:['Rodízio'],
    _nJogos:rotationGames.length, _nPartes:{matches:rotationGames.length}, matches:[],
    courtNames:['Quadra 1','Quadra 2'], participants:[] });
  rotationParts.matches.forEach(record => write.set(rotationRef.collection('matches').doc(record._chave), record));
  await write.commit();
  const functions = backend('./index.js');
  const invoke = (handler, data) => handler.run({auth:{uid:'owner',token:{uid:'owner'}},
    data:Object.assign({tournamentId:rotationRef.id,operationId:randomUUID()},data), rawRequest:{headers:{}}});
  for (let i = 0; i < firstRound.length; i++) {
    const called = await invoke(functions.assignMatchCourt, {matchId:firstRound[i].id, court:'Quadra ' + (i + 1), confirmCall:true});
    assert.equal(called.ok, true);
    if (i === 0) {
      const candidate = rotationGames.find(m => m.round === 2 &&
        m.team1Uids.concat(m.team2Uids).some(uid => firstRound[0].team1Uids.concat(firstRound[0].team2Uids).includes(uid)));
      assert(candidate);
      for (const court of ['Quadra 1','Quadra 2']) {
        await assert.rejects(invoke(functions.assignMatchCourt,{matchId:candidate.id,court,confirmCall:true}),
          /já está em quadra/, 'callable recusa atleta ocupado na mesma quadra ou em outra');
        assert(!(await rotationRef.collection('matches').doc(candidate.id).get()).data().jogo.courtCalledAt,
          'tentativa recusada não grava chamada');
      }
    }
  }
  const secondRef = rotationRef.collection('matches').doc(firstRound[1].id);
  const secondCalled = (await secondRef.get()).data().jogo;
  assert(secondCalled.courtCalledAt);
  await invoke(functions.endMatchOnCourt, {matchId:firstRound[0].id, action:'release'});
  const rotationState = rotationRef.collection('courtState').doc('main');
  const releasedOne = (await rotationState.get()).data().released;
  assert.deepEqual(Object.keys(releasedOne), [firstRound[0].id]);
  assert.deepEqual((await secondRef.get()).data().jogo, secondCalled,
    'encerrar o primeiro deixa a outra quadra e chamada intactas');
  const resultOne = await invoke(functions.applyMatchResult, {matchId:firstRound[0].id,
    payload:{s1:4,s2:3,useSets:false}});
  assert.equal(resultOne.ok, true, JSON.stringify(resultOne));
  const scored = (await rotationRef.collection('matches').doc(firstRound[0].id).get()).data().jogo;
  assert.equal(scored.scoreP1, 4);
  assert.equal(scored.scoreP2, 3);
  assert(scored.winner);
  assert.equal((await rotationState.get()).data().released[firstRound[0].id], undefined,
    'o placar confirmado retira somente sua própria pendência');
  assert.equal((await secondRef.get()).data().jogo.courtCalledAt, secondCalled.courtCalledAt);
  assert.equal((await secondRef.get()).data().jogo.court, 'Quadra 2');
  assert.equal((await rotationRef.get()).data().testModeEnabled, true);
  await invoke(functions.endMatchOnCourt,{matchId:firstRound[1].id,action:'release'});
  const nextRoundGame=rotationGames.find(m=>m.round===2);
  const afterRelease=await invoke(functions.assignMatchCourt,{matchId:nextRoundGame.id,court:'Quadra 1',confirmCall:true});
  assert.equal(afterRelease.ok,true,'após liberar todos os atletas a callable permite a próxima formação');
  console.log('✓ rodízio: duas quadras, encerramento individual, placar físico e teste preservado');
  // A global Fast 8 entry can use whichever court is released first.
  const rows=[['A','B',1,1,[1,2]],['B','B',2,2,[1,2]],['C','C',1,1,[3,4]],['D','C',2,1,[5,6]],['E','C',3,2,[3,4]],['F','C',4,2,[5,6]]]
    .map(([label,category,groupNumber,entry,courts])=>({label,category,groupNumber,entry,courts,phaseIndex:0}));
  const fastGames=[];
  for(const row of rows)for(let round=1;round<=2;round++)for(let lane=0;lane<2;lane++){
    const ids=(round===1?[0,1,2,3,4,5,6,7]:[0,4,1,5,2,6,3,7]).slice(lane*4,lane*4+4).map(n=>row.label+'-synthetic-'+n);
    fastGames.push({id:row.label+'-'+round+'-'+lane,isMonarch:true,groupIdx:row.groupNumber-1,round,phaseIndex:0,
      category:row.category,scheduledGroupLabel:row.label,_gameNum:fastGames.length+1,p1:ids.slice(0,2).join(' / '),p2:ids.slice(2).join(' / '),
      team1:ids.slice(0,2),team2:ids.slice(2),team1Uids:ids.slice(0,2),team2Uids:ids.slice(2)});
  }
  const fastRef=db.collection('tournaments').doc('tour_fast8_'+randomUUID());
  const fastParts=backend('./vendor/tournament-split-core.js').dividir({matches:fastGames},['matches']);
  const fw=db.batch();fw.set(fastRef,{creatorUid:'owner',name:'Fast8 synthetic',status:'active',courtCount:6,
    courtNames:Array.from({length:6},(_,i)=>'Quadra '+(i+1)),currentPhaseIndex:0,_nJogos:fastGames.length,_nPartes:{matches:fastGames.length},matches:[],participants:[],
    phases:[{kind:'classification',classification:{partnerRotation:'groups',rotationCategoryRules:['B','C'].map(category=>({category,rounds:2,groupFormation:{mode:'size',value:8},groupAlternation:true}))}}],
    scheduleWindow:{interleavedPlan:{schema:2,groupAssignments:rows}}});
  fastParts.matches.forEach(record=>fw.set(fastRef.collection('matches').doc(record._chave),record));await fw.commit();
  const fc=(matchId,court)=>functions.assignMatchCourt.run({auth:{uid:'owner',token:{uid:'owner'}},data:{tournamentId:fastRef.id,matchId,court,confirmCall:true,operationId:randomUUID()},rawRequest:{headers:{}}});
  const fe=matchId=>functions.endMatchOnCourt.run({auth:{uid:'owner',token:{uid:'owner'}},data:{tournamentId:fastRef.id,matchId,action:'release',operationId:randomUUID()},rawRequest:{headers:{}}});
  assert((await fc('B-1-0','Quadra 5')).ok,'organizador pode remanejar um jogo disponível fora da sugestão');
  await functions.endMatchOnCourt.run({auth:{uid:'owner',token:{uid:'owner'}},data:{tournamentId:fastRef.id,matchId:'B-1-0',action:'cancel-call',operationId:randomUUID()},rawRequest:{headers:{}}});
  for(const row of rows.filter(r=>r.entry===1))for(let lane=0;lane<2;lane++)assert((await fc(row.label+'-1-'+lane,'Quadra '+row.courts[lane])).ok);
  await fe('D-1-0');
  const freed=(await fastRef.collection('courtState').doc('main').get()).data().lastReleasedByCourt['Quadra 5'];
  assert.equal(freed.matchId,'D-1-0');assert(Number.isFinite(Date.parse(freed.releasedAt)));
  assert((await fc('B-1-0','Quadra 5')).ok,'a CF real chama B na quadra 5 que vagou primeiro');
  await fe('D-1-1');await fe('A-1-0');
  const races=await Promise.allSettled([fc('B-1-1','Quadra 6'),fc('B-1-1','Quadra 1')]);
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1,'a mesma formação não atende duas quadras em corrida');
  assert.equal(races.filter(r=>r.status==='rejected').length,1);
  const persisted=(await fastRef.collection('matches').doc('B-1-1').get()).data().jogo;
  assert(['Quadra 1','Quadra 6'].includes(persisted.court));
  assert.equal((await fc('B-1-1',persisted.court)).ok,true,'replay na mesma quadra é idempotente');
  await assert.rejects(fc('A-2-0',persisted.court==='Quadra 1'?'Quadra 6':'Quadra 1'),/rodada anterior/,'rodada seguinte aguarda os dois jogos do próprio grupo');
  const wo=await functions.applyTournamentWO.run({auth:{uid:'owner',token:{uid:'owner'}},data:{tournamentId:fastRef.id,
    matchId:'B-1-1',forceTeamWO:true,teamUids:fastGames.find(m=>m.id==='B-1-1').team1Uids},rawRequest:{headers:{}}});
  assert.equal(wo.ok,true);
  const freedByWO=(await fastRef.collection('courtState').doc('main').get()).data().lastReleasedByCourt[persisted.court];
  assert.equal(freedByWO.matchId,'B-1-1');assert(Number.isFinite(Date.parse(freedByWO.releasedAt)));
  console.log('✓ Fast8 real: remanejamento manual, corrida de chamada, W.O. libera a fila e barreira do próprio grupo');
  console.log('end-court physical: OK');
}
run().then(() => console.log('✓ callable real e documentos físicos de quadra')).catch(error => {
  console.error(error.stdout?.toString() || '',error.stderr?.toString() || '',error);
  process.exitCode = 1;
});
