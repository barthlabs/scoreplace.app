'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const preview = require('../scripts/planejar-jogos-inline-e05-core.js');
const apply = require('../scripts/aplicar-jogos-inline-e05-core.js');
const cli = require('../scripts/aplicar-jogos-inline-e05.js');
const { stable } = require('../scripts/backup-torneio-operacional-core.js');

function fixture(target, index) {
  const id = 'fake-' + index;
  const games = Array.from({ length: target.count }, (_, i) =>
    ({ id: 'game-' + index + '-' + i, p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 4 }));
  const root = { _nPartes: { matches: 7, participants: 2 }, _nJogos: 7, name: target.name };
  if (target.kind === 'thirdPlace') root.thirdPlaceMatch = games[0];
  else root.groups = [{ rounds: [{ label: 'Rodada', matches: games }] }];
  const time = { __firestoreType: 'timestamp', seconds: 10, nanoseconds: 20 };
  const entries = preview.inlineGames(root, target.kind).map(({ game, loc }) => ({
    id: game.id, loc, game, gameHash: preview.hash(game),
    destination: 'tournaments/' + id + '/matches/' + game.id,
    result: { path: 'tournaments/' + id + '/results/' + game.id,
      updateTime: time, hash: preview.hash({ matchId: game.id }) }
  }));
  return { root, entry: { name: target.name, root: { path: 'tournaments/' + id,
    updateTime: time, hash: preview.hash(root) }, backupHash: 'backup',
    existingMatches: 7, existingResults: target.count, entries } };
}

const fixtures = preview.TARGETS.map(fixture);
const manifest = preview.buildManifest(fixtures.map(f => f.entry));
assert.equal(apply.validateManifest(manifest), manifest.digest);
assert.throws(() => apply.validateManifest({ ...manifest, digest: 'wrong' }), /digest/);
for (let i = 0; i < fixtures.length; i++) {
  const target = preview.TARGETS[i], f = fixtures[i];
  const mutation = apply.proposed(f.root, target, f.entry);
  assert.equal(mutation.records.length, target.count);
  assert.equal(mutation.patch._nPartes.matches, 7 + target.count);
  assert.equal(mutation.patch._nPartes.participants, 2);
  const migrated = { ...f.root, ...mutation.patch };
  if (target.kind === 'thirdPlace') delete migrated.thirdPlaceMatch;
  const records = new Map(mutation.records.map(x => [x._chave, x]));
  assert.equal(apply.validateApplied(migrated, records, target, f.entry), true);
  assert.throws(() => apply.validateApplied({ ...migrated, _nJogos: 0 }, records, target, f.entry), /contagem/);
  assert.throws(() => apply.proposed({ ...f.root, name: 'alterado' }, target, f.entry), /raiz diferente/);
}

function fakeDb(f, target, options = {}) {
  const calls = [];
  const refs = new Map();
  const ref = path => {
    if (!refs.has(path)) refs.set(path, { path, collection: name => ({
      path: path + '/' + name, doc: id => ref(path + '/' + name + '/' + id) }) });
    return refs.get(path);
  };
  const time = { seconds: 10, nanoseconds: 20, toDate() { return new Date(10000); } };
  const snapshots = new Map([[f.entry.root.path, { exists: true, data: () => options.root || f.root, updateTime: time }]]);
  for (const item of f.entry.entries) {
    snapshots.set(item.destination, { exists: false });
    snapshots.set(item.result.path, { exists: true, data: () => ({ matchId: item.id }), updateTime: time });
  }
  return { calls, db: { doc: ref, runTransaction: async fn => fn({
    get: async handle => handle.path.endsWith('/matches') ?
      { size: options.physicalCount == null ? 7 : options.physicalCount } :
      (snapshots.get(handle.path) || { exists: false }),
    create: (handle, value) => calls.push({ action: 'create', path: handle.path, value }),
    update: (handle, value, condition) => calls.push({ action: 'update', path: handle.path, value, condition })
  }) } };
}

(async () => {
  const target = preview.TARGETS[0], f = fixtures[0], fake = fakeDb(f, target);
  assert.equal(await cli.applyTarget(fake.db, target, f.entry), 'applied');
  assert.equal(fake.calls.filter(x => x.action === 'create').length, 1);
  assert.equal(fake.calls.filter(x => x.action === 'update').length, 1);
  assert.equal(fake.calls[1].value._nJogos, 8);
  assert(stable(fake.calls[1].condition.lastUpdateTime).seconds === 10);
  const stale = fakeDb(f, target, { root: { ...f.root, updatedAt: 'later' } });
  await assert.rejects(() => cli.applyTarget(stale.db, target, f.entry), /CAS da raiz/);
  assert.equal(stale.calls.length, 0);
  const changedCount = fakeDb(f, target, { physicalCount: 8 });
  await assert.rejects(() => cli.applyTarget(changedCount.db, target, f.entry), /contagem física mudou/);
  assert.equal(changedCount.calls.length, 0);
  assert.throws(() => cli.releaseGate(manifest.digest, {}), /recibo E20 ausente/);
  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e05-gate-'));
  try {
    const receiptFile = path.join(receiptDir, 'receipt.json');
    const env = { SCOREPLACE_E05_STAGE3_RELEASE_RECEIPT: receiptFile };
    const sha = value => crypto.createHash('sha256').update(value).digest('hex');
    const valid = { schema: 'scoreplace/stage3-release/1', project: 'scoreplace-app',
      manifestDigest: manifest.digest, stage3Published: true, hostingCommit: 'a'.repeat(40),
      readerSha256: 'b'.repeat(64), indexSha256: 'c'.repeat(64) };
    const write = value => fs.writeFileSync(receiptFile, JSON.stringify(value));
    write(valid);
    assert.deepEqual(cli.releaseGate(manifest.digest, env), valid,
      'o recibo web válido basta, sem bundles nativos');
    for (const invalid of [
      { ...valid, manifestDigest: 'outro' },
      { ...valid, stage3Published: false },
      { ...valid, hostingCommit: '' },
      { ...valid, hostingCommit: 'texto-livre' },
      { ...valid, readerSha256: '' },
      { ...valid, indexSha256: '' }
    ]) {
      write(invalid);
      assert.throws(() => cli.releaseGate(manifest.digest, env), /recibo E20 incompleto ou divergente/);
    }
    const publicDir = path.join(receiptDir, 'www');
    fs.mkdirSync(path.join(publicDir, 'js/views'), { recursive: true });
    const index = '<script src="js/views/tournament-split-core.js"></script>';
    const reader = 'function montar(x) { return x._inlineGamesExternalized; }';
    fs.writeFileSync(path.join(publicDir, 'index.html'), index);
    fs.writeFileSync(path.join(publicDir, 'js/views/tournament-split-core.js'), reader);
    const liveReceipt = { ...valid, indexSha256: sha(index), readerSha256: sha(reader) };
    const fetched = [];
    const get = async url => {
      fetched.push(url);
      return { ok: true, text: async () => url.includes('/index.html?') ? index : reader };
    };
    assert.equal(await cli.verifyPublishedReader(liveReceipt, get, publicDir), true);
    assert.equal(fetched.length, 2);
    await assert.rejects(cli.verifyPublishedReader({ ...liveReceipt, readerSha256: '0'.repeat(64) },
      get, publicDir), /artefato web local diverge/);
    await assert.rejects(cli.verifyPublishedReader(liveReceipt,
      async () => ({ ok: true, text: async () => 'código antigo' }), publicDir),
    /web publicada diverge/);
  } finally { fs.rmSync(receiptDir, { recursive: true, force: true }); }
  const command = spawnSync(process.execPath,
    ['scripts/aplicar-jogos-inline-e05.js', '--apply', manifest.digest],
    { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8' });
  assert.notEqual(command.status, 0);
  assert.match(command.stderr, /recibo E20 ausente|digest autorizado divergente/);
  console.log('E05: aplicador CAS e gate de release recusam alteração insegura');
})().catch(error => { console.error(error); process.exitCode = 1; });
