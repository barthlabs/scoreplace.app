'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../scripts/planejar-indice-canonico-e08-core.js');
const cli = require('../scripts/planejar-indice-canonico-e08.js');

const rootPath = 'projects/scoreplace-app/databases/(default)/documents/tournaments/private-root';
const stamp = '2026-11-01T00:00:00.000000Z';
const doc = (name, fields) => ({ name, fields, updateTime: stamp });
const config = { id: 'private-root', _nPartes: { matches: 1, participants: 0, opponentHistory: 0 } };
const game = { _chave: 'private-match', _loc: { tipo: 'matches', mi: 0 },
  jogo: { id: 'private-match', phaseIndex: 0, scoreP1: 6, scoreP2: 4 } };
const baseline = () => ({ root: doc(rootPath, config),
  matches: [doc(rootPath + '/matches/private-match', game)],
  extras: { inscritos: [], opponentHistory: [] } });
const plan = fixture => core.planRoot(fixture.root, fixture.matches, fixture.extras, item => item.fields);
function fsValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, fsValue(item)])) } };
}
function wire(document) { return { ...document, fields: Object.fromEntries(Object.entries(document.fields)
  .map(([key, item]) => [key, fsValue(item)])) }; }

(async () => {
  const valid = await plan(baseline());
  assert.equal(valid.eligible, true);
  assert.equal(valid.targets.length, 1);
  assert.equal(valid.targets[0].phase, 0);
  assert.equal(valid.census.counts.ausente, 1);
  assert.deepEqual(valid.readSet.extraCollections, ['inscritos', 'opponentHistory']);
  assert.equal(valid.readSet.matches.length, 1);
  const reordered = baseline();
  reordered.root.fields = { _nPartes: { opponentHistory: 0, participants: 0, matches: 1 }, id: 'private-root' };
  reordered.matches[0].fields = { jogo: { scoreP2: 4, scoreP1: 6, phaseIndex: 0, id: 'private-match' },
    _loc: { mi: 0, tipo: 'matches' }, _chave: 'private-match' };
  assert.equal((await plan(reordered)).digest, valid.digest,
    'ordem das chaves REST não altera o digest');
  assert.equal(core.aggregate([valid], stamp).targetGames, 1);
  const printed = JSON.stringify(core.aggregate([valid], stamp));
  assert.doesNotMatch(printed, /private-root|private-match|scoreP1/);
  assert.equal(JSON.parse(printed).applicable, false);

  const divergent = baseline(); divergent.matches[0].fields = { ...game, _phaseIndex: 1 };
  assert.equal((await plan(divergent)).reason, 'cobertura');
  const ambiguous = baseline(); ambiguous.matches[0].fields = {
    ...game, jogo: { ...game.jogo, phaseIndex: null } };
  assert.equal((await plan(ambiguous)).reason, 'cobertura');
  const phaseConflict = baseline(); phaseConflict.root.fields = {
    ...config, rounds: [{ matches: [] }] };
  phaseConflict.matches[0].fields = { ...game,
    _loc: { tipo: 'rounds', ri: 0, mi: 0 },
    jogo: { ...game.jogo, phaseIndex: 1 } };
  assert.equal((await plan(phaseConflict)).reason, 'cobertura');
  const mismatched = baseline(); mismatched.root.fields = {
    ...config, _nPartes: { ...config._nPartes, matches: 2 } };
  assert.equal((await plan(mismatched)).reason, 'cobertura');
  const unmounted = baseline(); unmounted.matches[0].fields = {
    ...game, _loc: { tipo: 'matches', mi: 4 } };
  assert.equal((await plan(unmounted)).eligible, false);
  const duplicate = baseline(); duplicate.matches.push(duplicate.matches[0]);
  await assert.rejects(plan(duplicate), /repetido/);
  const wrongPhysicalId = baseline(); wrongPhysicalId.matches[0].name = rootPath + '/matches/outra-chave';
  await assert.rejects(plan(wrongPhysicalId), /identidade/);
  const extraCollection = baseline(); extraCollection.extras.grupos = [];
  assert.notEqual((await plan(extraCollection)).digest, valid.digest);

  const requests = [];
  const f = baseline();
  const fetched = await cli.preview(async (url, options) => {
    const pathname = decodeURIComponent(url.pathname).split('/documents/')[1];
    requests.push({ pathname, method: options.method, readTime: url.searchParams.get('readTime') });
    const documents = pathname === 'tournaments' ? [wire(f.root)] :
      pathname === 'tournaments/private-root/matches' ? f.matches.map(wire) : [];
    return { ok: true, json: async () => ({ documents }) };
  }, 'private-token', stamp);
  assert.equal(fetched.report.targetGames, 1);
  assert(requests.every(request => request.method === 'GET' && request.readTime === stamp));
  assert(requests.every(request => !request.pathname.includes('/results')));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e08-'));
  try {
    const filename = path.join(tmp, 'manifest.json');
    fs.writeFileSync(filename + '.partial', 'execução interrompida', { mode: 0o600 });
    cli.savePrivate([valid], filename);
    assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8')).length, 1);
    assert.equal(fs.readFileSync(filename + '.partial', 'utf8'), 'execução interrompida');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  for (const filename of ['planejar-indice-canonico-e08-core.js', 'planejar-indice-canonico-e08.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', filename), 'utf8');
    assert.doesNotMatch(source, /\b(?:PATCH|POST|DELETE|commit|runTransaction)\b/);
    const calls = [...source.matchAll(/\.(?:set|update|delete|create|batch)\s*\(/g)]
      .map(match => source.slice(source.lastIndexOf('\n', match.index) + 1,
        source.indexOf('\n', match.index)));
    assert(calls.every(line => /\b(?:byId\.set|visibleById\.set|createHash\('sha256'\)\.update)\(/.test(line)),
      'Firestore write call in GET-only preview');
  }
  console.log('E08: prévia de fase canônica sem escrita ou vazamento');
})().catch(error => { console.error(error); process.exitCode = 1; });
