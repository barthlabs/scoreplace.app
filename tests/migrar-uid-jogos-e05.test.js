'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rootDir = path.join(__dirname, '..');
const core = require('../scripts/migrar-uid-jogos-e05-core');
const cli = require('../scripts/migrar-uid-jogos-e05');

const stamp = (n) => ({ seconds: n, nanoseconds: 0, toDate: () => new Date(n * 1000) });
const doc = (pathName, data, n = 1) => ({ id: pathName.split('/').pop(),
  ref: { path: pathName }, updateTime: stamp(n), data: () => data });
function fixture(n = 102) {
  const base = 'tournaments/fixture';
  const root = doc(base, { name: 'Torneio fictício', _semPesados: ['matches'],
    _nJogos: n + 1, _nPartes: { matches: n + 1 }, rounds: [{ matches: [] }] });
  const matches = [], results = [];
  for (let i = 0; i < n; i++) {
    const id = 'm' + i, game = { id, p1: 'Mesmo Nome', p2: 'Mesmo Nome',
      p1Uid: 'left-' + i, p2Uid: 'right-' + i, scoreP1: 6, scoreP2: 4 };
    matches.push(doc(base + '/matches/' + id,
      { _chave: id, _loc: { tipo: 'rounds', ri: 0, mi: i }, jogo: game }));
    results.push(doc(base + '/results/' + id,
      { matchId: id, playerUids: ['right-' + i, 'left-' + i], scoreP1: 6, scoreP2: 4 }));
  }
  matches.push(doc(base + '/matches/no-uid', { _chave: 'no-uid',
    _loc: { tipo: 'rounds', ri: 0, mi: n },
    jogo: { id: 'no-uid', p1: 'Nome', p2: 'Outro', team1Obj: { name: 'Nome' } } }));
  results.push(doc(base + '/results/no-uid', { matchId: 'no-uid', scoreP1: null, scoreP2: null }));
  return { root, matches, results };
}

{
  const f = fixture();
  const m = core.classify(f.root, f.matches, f.results);
  assert.equal(m.counts.candidates, 102);
  assert.equal(m.counts.scoredCandidates, 102);
  assert.equal(m.counts.noStructuralUid, 1);
  assert.equal(m.candidates.length, 102);
  assert(m.bytes < core.MAX_BYTES);
  assert(!JSON.stringify({ name: m.name, counts: m.counts, digest: m.digest }).includes('left-0'));
  core.assertSame(core.classify(f.root, f.matches, f.results), m);
  assert.throws(() => core.assertSame(core.classify(doc(f.root.ref.path, f.root.data(), 2), f.matches, f.results), m), /obsoleta/);
  const mirrorVersion = fixture(); mirrorVersion.results[0] = doc(mirrorVersion.results[0].ref.path,
    mirrorVersion.results[0].data(), 2);
  assert.throws(() => core.assertSame(core.classify(mirrorVersion.root, mirrorVersion.matches,
    mirrorVersion.results), m), /obsoleta/, 'updateTime diferente, conteúdo igual');
  const changed = fixture(); changed.results[0] = doc(changed.results[0].ref.path,
    { ...changed.results[0].data(), scoreP1: 7 });
  assert.throws(() => core.classify(changed.root, changed.matches, changed.results), /resultado divergente/);
  const wrongUid = fixture(); wrongUid.results[0] = doc(wrongUid.results[0].ref.path,
    { ...wrongUid.results[0].data(), playerUids: ['other'] });
  assert.throws(() => core.classify(wrongUid.root, wrongUid.matches, wrongUid.results), /UID estrutural diverge/);
  const indexedMismatch = fixture(); indexedMismatch.matches[0] = doc(indexedMismatch.matches[0].ref.path,
    { ...indexedMismatch.matches[0].data(), playerUids: ['left-0', 'right-0'] });
  indexedMismatch.results[0] = doc(indexedMismatch.results[0].ref.path,
    { ...indexedMismatch.results[0].data(), playerUids: ['other'] });
  assert.throws(() => core.classify(indexedMismatch.root, indexedMismatch.matches,
    indexedMismatch.results), /índice físico diverge do espelho/);
  const duplicate = fixture(); duplicate.matches.push(duplicate.matches[0]);
  assert.throws(() => core.classify(duplicate.root, duplicate.matches, duplicate.results), /duplicado/);
  const inline = fixture(); inline.root = doc(inline.root.ref.path,
    { ...inline.root.data(), thirdPlaceMatch: { id: 'legacy' } });
  assert.throws(() => core.classify(inline.root, inline.matches, inline.results), /completude/);
  assert.deepEqual(core.structuralUids({ p1: 'Mesmo Nome', p2: 'Mesmo Nome' }), []);
  assert.deepEqual(core.structuralUids({ team1Obj: { name: 'Nome' } }), []);
  assert.throws(() => core.structuralUids({ p1Uid: 'same', p2Uid: 'same' }), /repetido/);
  assert.throws(() => cli.releaseGate({}), /recibo E20 ausente/);
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('node:child_process');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e05-uid-emulator-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
  { encoding: 'utf8' }).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({ firestore: { rules: path.join(rootDir, 'tests/concurrency/firestore.allow.rules') },
    emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false }, singleProjectMode: true } }));
  const result = spawnSync('firebase', ['emulators:exec', '--only', 'firestore', '--config', config,
    '--project', 'demo-scoreplace', 'node tests/migrar-uid-jogos-e05.test.js'], {
    cwd: rootDir, encoding: 'utf8', timeout: 180000,
    env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }
  });
  fs.rmSync(temp, { recursive: true, force: true });
  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);
  if (result.error) console.error(result.error);
  process.exit(result.status === 0 ? 0 : 1);
}

process.env.GCLOUD_PROJECT = 'demo-scoreplace';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-scoreplace' });
const admin = require('../functions/node_modules/firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });

(async () => {
  const db = admin.firestore(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e05-uid-backup-'));
  try {
    async function seed(suffix) {
      const ref = db.doc('tournaments/e05_uid_' + suffix);
      await ref.set({ name: 'Fixture ' + suffix, _semPesados: ['matches'],
        _nJogos: 103, _nPartes: { matches: 103 }, rounds: [{ matches: [] }] });
      let batch = db.batch(), count = 0;
      for (let i = 0; i < 102; i++) {
        const id = 'm' + i;
        batch.set(ref.collection('matches').doc(id), { _chave: id,
          _loc: { tipo: 'rounds', ri: 0, mi: i },
          jogo: { id, p1Uid: 'a' + i, p2Uid: 'b' + i, scoreP1: 6, scoreP2: 4 } });
        batch.set(ref.collection('results').doc(id), { matchId: id,
          playerUids: ['b' + i, 'a' + i], scoreP1: 6, scoreP2: 4 });
        count += 2;
        if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
      }
      batch.set(ref.collection('matches').doc('no-uid'), { _chave: 'no-uid',
        _loc: { tipo: 'rounds', ri: 0, mi: 102 }, jogo: { id: 'no-uid', p1: 'Nome' } });
      batch.set(ref.collection('results').doc('no-uid'), { matchId: 'no-uid' });
      await batch.commit();
      return ref;
    }
    const ref = await seed('ok');
    const before = await cli.readRelevant(ref);
    const expected = core.classify(before.root, before.matches, before.results);
    const resultBefore = before.results.map(doc => [doc.id, core.snapshot(doc)]);
    const done = await cli.applyTarget(db, expected, temp, temp);
    assert.equal(done.writes, 102);
    assert.equal(done.audit, 'ok');
    const after = await cli.readRelevant(ref);
    assert.equal(core.classify(after.root, after.matches, after.results).counts.candidates, 0);
    assert.equal((await ref.collection('matches').doc('m0').get()).data().playerUids.length, 2);
    assert.equal((await ref.collection('matches').doc('no-uid').get()).data().playerUids, undefined);
    for (const [id, old] of resultBefore) {
      const now = core.snapshot(after.results.find(doc => doc.id === id));
      assert.equal(now.hash, old.hash, 'espelho preservado');
      assert.deepEqual(now.updateTime, old.updateTime, 'espelho não regravado');
    }
    const backup = fs.readdirSync(temp).find(name => name.endsWith('.json') && name.startsWith('e05-uid-'));
    assert(backup);
    assert.equal(fs.statSync(path.join(temp, backup)).mode & 0o077, 0);
    const backed = JSON.parse(fs.readFileSync(path.join(temp, backup), 'utf8'));
    for (const [name, docs] of [['matches', before.matches], ['results', before.results]]) {
      assert.equal(backed.subcollections[name].length, docs.length);
      const byId = new Map(backed.subcollections[name].map(item => [item.id, item.data]));
      for (const item of docs) assert.equal(core.hash(byId.get(item.id)), core.hash(item.data()),
        'backup equivale à prévia validada: ' + name);
    }

    for (const [suffix, alter] of [
      ['root', async ref => { await ref.update({ updatedAt: 'concorrente' }); }],
      ['mirror', async ref => { await ref.collection('results').doc('m0').update({ updatedAt: 'concorrente' }); }],
      ['new', async ref => { await ref.collection('matches').doc('extra').set({ _chave: 'extra', jogo: { id: 'extra' } }); }]
    ]) {
      const raced = await seed(suffix);
      const initial = await cli.readRelevant(raced);
      const stale = core.classify(initial.root, initial.matches, initial.results);
      await alter(raced);
      await assert.rejects(cli.applyTarget(db, stale, temp, temp), undefined, 'CAS: ' + suffix);
      assert.equal((await raced.collection('matches').doc('m0').get()).data().playerUids, undefined,
        'CAS não aplicou lote parcial');
    }
    console.log('E05 UID físico: 102 atualizações atômicas, backup/CAS/auditoria, corridas recusadas');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
