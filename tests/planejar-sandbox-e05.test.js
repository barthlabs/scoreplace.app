'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../scripts/planejar-sandbox-e05-core.js');
const cli = require('../scripts/planejar-sandbox-e05.js');

const stamp = { seconds: 1, nanoseconds: 0, toDate: () => new Date(1000) };
function doc(collection, id, data) {
  return { id, exists: true, ref: { path: collection + '/' + id }, updateTime: stamp, data: () => data };
}
function fixture() {
  const originId = 'source-private';
  const sbId = 'sb_' + originId + '_123';
  const sandbox = doc('sandboxes', sbId, { id: sbId, isSandbox: true,
    sbState: 'ready', sandboxOf: originId, rounds: [{ matches: [] }] });
  const origin = doc('tournaments', originId, { id: originId, rounds: [{ matches: [] }] });
  const physical = doc('tournaments/' + originId + '/matches', 'secret-game', {
    _loc: { tipo: 'rounds', ri: 0, mi: 0 }, jogo: { id: 'secret-game', scoreP1: 6, scoreP2: 4 },
    playerUids: ['one', 'two']
  });
  const result = doc('sandboxes/' + sbId + '/resultsSandbox', 'secret-game', {
    matchId: 'secret-game', scoreP1: 6, scoreP2: 4, playerUids: ['two', 'one']
  });
  return { sandbox, origin, local: [], source: [physical], results: [result] };
}
function run(f) { return core.classify(f.sandbox, f.origin, f.local, f.source, f.results); }

{
  const f = fixture(); const manifest = run(f);
  assert.equal(manifest.counts.sourceCandidates, 1);
  assert.equal(manifest.counts.conflicts, 0);
  assert.equal(manifest.applicable, false);
  assert.equal(manifest.entries.length, 1);
  assert.equal(manifest.entries[0].needsUidProof, false);
  const report = JSON.stringify(core.publicReport([manifest]));
  assert.doesNotMatch(report, /secret-game|source-private|scoreP1|one|two/);
  assert.equal(JSON.parse(report).productionWrites, 0);
}
{
  const f = fixture(); f.results.push(doc('sandboxes/' + f.sandbox.id + '/resultsSandbox',
    'unresolved-private', { matchId: 'unresolved-private', scoreP1: 1 }));
  const m = run(f); assert.equal(m.counts.unresolved, 1); assert.equal(m.entries.length, 1);
  assert.equal(m.blocked[0].reason, 'source-match-absent');
}
{
  const f = fixture(); f.results[0] = doc(f.results[0].ref.path.slice(0, -'/secret-game'.length),
    'secret-game', { matchId: 'secret-game', scoreP1: 7 });
  assert.equal(run(f).counts.conflicts, 1);
  assert.equal(run(f).blocked[0].reason, 'field-conflict');
}
{
  const f = fixture(); f.sandbox = doc('sandboxes', f.sandbox.id, {
    ...f.sandbox.data(), sandboxOf: 'wrong-source'
  });
  assert.throws(() => run(f), /origem.*não comprovada/);
}
{
  const f = fixture(); f.source[0] = doc('tournaments/' + f.origin.id + '/matches', 'secret-game', {
    jogo: { id: 'secret-game' }, _loc: { tipo: 'rounds', ri: 9, mi: 0 }
  });
  assert.throws(() => run(f), /não remonta uma vez/);
}
{
  const f = fixture(); f.local = [doc('sandboxes/' + f.sandbox.id + '/matches',
    'secret-game', f.source[0].data())];
  assert.equal(run(f).counts.orphanResults, 0);
}
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e05-sb-'));
  try {
    const file = path.join(tmp, 'manifest.json');
    cli.savePrivate([run(fixture())], file);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 1);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
for (const filename of ['planejar-sandbox-e05-core.js', 'planejar-sandbox-e05.js']) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', filename), 'utf8');
  const calls = [...source.matchAll(/\.(?:set|update|delete|create|runTransaction|batch)\s*\(/g)]
    .map(match => source.slice(source.lastIndexOf('\n', match.index) + 1,
      source.indexOf('\n', match.index)));
  assert(calls.every(line => /\b(?:byId|out)\.set\(/.test(line)), 'Firestore write call in read-only script');
}
console.log('E05: sandbox classificado sem escrita, perda ou exposição no relatório');
