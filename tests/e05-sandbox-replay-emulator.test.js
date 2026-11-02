'use strict';
// node tests/e05-sandbox-replay-emulator.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e05-sb-'));
  try {
    const port = Number(execFileSync(process.execPath, ['-e',
      "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"],
    { encoding: 'utf8' }).trim());
    const config = path.join(dir, 'firebase.json');
    fs.writeFileSync(config, JSON.stringify({ firestore: {
      rules: path.join(root, 'tests/concurrency/firestore.allow.rules') },
      emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false },
        singleProjectMode: true } }));
    const result = spawnSync('firebase', ['emulators:exec', '--only', 'firestore',
      '--config', config, '--project', 'demo-scoreplace',
      'node tests/e05-sandbox-replay-emulator.test.js'],
    { cwd: root, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH } });
    process.stdout.write((result.stdout || '') + (result.stderr || ''));
    if (result.error) console.error(result.error);
    process.exit(result.status === 0 ? 0 : 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST));
const fb = require('firebase/compat/app');
require('firebase/compat/firestore');
const app = fb.initializeApp({ projectId: 'demo-scoreplace', apiKey: 'emulator', appId: 'e05-sb-emulator' }, 'e05-sb');
const db = app.firestore();
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
db.useEmulator(host, Number(port));
const win = { _tSplit: require('../js/views/tournament-split-core.js') };
global.window = win;
global.firebase = fb;
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8'),
  { filename: 'firebase-db.js' });
const client = win.FirestoreDB;
client.db = db;
client._tSub = (_id, name) => db.collection('sandboxes/e05-sb/' + name);
const ref = db.doc('sandboxes/e05-sb/matches/m');
const reg = (jogo) => ({ _chave: 'm', _loc: { tipo: 'rounds', ri: 0, mi: 0 }, jogo });

(async () => {
  const antigo = reg({ id: 'm', winner: null, scoreP1: 0, scoreP2: 0, label: 'Jogo 1' });
  await ref.set(antigo);
  await ref.update({ 'jogo.replay': { v: 2, points: [{ p: 1 }] },
    'jogo.scoreP1': 6, 'jogo.scoreP2': 3 });
  const novo = reg({ ...antigo.jogo, winner: 'p1', label: 'Jogo 1' });
  assert.equal(await client._sbGravaPartes('e05-sb', { matches: [antigo] },
    { matches: [novo] }, ['matches']), 1);
  let saved = (await ref.get()).data();
  assert.equal(saved.jogo.winner, 'p1');
  assert.equal(saved.jogo.scoreP1, 6);
  assert.equal(saved.jogo.scoreP2, 3);
  assert.deepEqual(saved.jogo.replay, { v: 2, points: [{ p: 1 }] });

  const semLabel = reg({ ...novo.jogo });
  delete semLabel.jogo.label;
  await client._sbGravaPartes('e05-sb', { matches: [novo] }, { matches: [semLabel] }, ['matches']);
  saved = (await ref.get()).data();
  assert.equal(Object.hasOwn(saved.jogo, 'label'), false);
  assert.deepEqual(saved.jogo.replay, { v: 2, points: [{ p: 1 }] });

  await assert.rejects(client._sbGravaPartes('e05-sb', { matches: [semLabel] },
    { matches: [reg({ ...semLabel.jogo, replay: { v: 3 } })] }, ['matches']), /replay só pode/);
  const bad = reg({ ...semLabel.jogo, 'campo.invalido': true });
  await assert.rejects(client._sbGravaPartes('e05-sb', { matches: [semLabel] },
    { matches: [bad] }, ['matches']), /campo de jogo inválido/);
  const special = reg({ ...semLabel.jogo, constructor: 'invalido' });
  await assert.rejects(client._sbGravaPartes('e05-sb', { matches: [semLabel] },
    { matches: [special] }, ['matches']), /campo de jogo inválido/);

  await ref.delete();
  await assert.rejects(client._sbGravaPartes('e05-sb', { matches: [semLabel] },
    { matches: [reg({ ...semLabel.jogo, winner: 'p2' })] }, ['matches']));
  assert.equal((await ref.get()).exists, false);
  console.log('E05 sandbox: replay e placar concorrentes preservados; exclusão e ausência verificadas');
  await app.delete();
})().catch(async (error) => {
  console.error(error);
  await app.delete();
  process.exitCode = 1;
});
