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
  console.log('end-court physical: OK');
}
run().then(() => console.log('✓ callable real e documentos físicos de quadra')).catch(error => {
  console.error(error.stdout?.toString() || '',error.stderr?.toString() || '',error);
  process.exitCode = 1;
});
