'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('../scripts/planejar-jogos-inline-e05-core.js');
const cli = require('../scripts/planejar-jogos-inline-e05.js');
const { stable, digest } = require('../scripts/backup-torneio-operacional-core.js');

const time = { seconds: 10, nanoseconds: 20, toDate() { return new Date(10000); } };
const game = id => ({ id, p1: 'Jogador Um', p2: 'Jogador Dois', scoreP1: 6, scoreP2: 4, winner: 'Jogador Um' });
function fixture(target) {
  const id = 'fake-' + core.TARGETS.indexOf(target) + '-' + target.kind + '-' + target.count;
  const data = { name: target.name, _nJogos: 0, _nPartes: { matches: 0 } };
  const games = Array.from({ length: target.count }, (_, i) => game(id + '-' + i));
  if (target.kind === 'thirdPlace') data.thirdPlaceMatch = games[0];
  else data.groups = [{ rounds: [{ matches: games }] }];
  const rootPath = 'tournaments/' + id;
  const root = { id, exists: true, ref: { path: rootPath }, updateTime: time, data: () => data };
  const results = games.map(g => {
    const id = g.id;
    return { id, ref: { path: rootPath + '/results/' + id }, updateTime: time,
      data: () => ({ matchId: id, scoreP1: 6, scoreP2: 4, winner: 'Jogador Um' }) };
  });
  const collections = { matches: [], results };
  const backup = { schema: 'scoreplace/tournament-operational-backup/1', project: 'scoreplace-app',
    tournamentId: id, createdAt: '2026-11-01T00:00:00.000Z',
    tournament: { id, updateTime: stable(time), data: stable(data) },
    subcollections: { matches: [], results: results.map(d => ({ id: d.id, data: stable(d.data()) })) } };
  const backupText = JSON.stringify(backup, null, 2) + '\n';
  const sidecar = { project: 'scoreplace-app', tournamentId: id, sha256: digest(backupText) };
  return { target, root, collections, backup, sidecar, backupText };
}

const fixtures = core.TARGETS.map(fixture);
const entries = fixtures.map(f => {
  assert.equal(core.verifyBackup(f.backup, f.sidecar, f.backupText), f.sidecar.sha256);
  return core.validateTarget(f.target, f.root, f.collections, f.backup, f.sidecar.sha256);
});
const manifest = core.buildManifest(entries);
assert.equal(manifest.targets.flatMap(x => x.entries).length, 14);
assert.equal(core.publicReport(manifest).applicable, false);
assert(!JSON.stringify(core.publicReport(manifest)).includes('Jogador'));
assert(entries[1].entries.every(x => x.loc.tipo === 'groupRounds'));
assert(entries[0].entries[0].loc.tipo === 'thirdPlace');

const fail = (f, pattern) => assert.throws(() => core.validateTarget(f.target, f.root, f.collections,
  f.backup, f.sidecar.sha256), pattern);
{
  const f = fixture(core.TARGETS[1]);
  f.root.data().groups[0].rounds[0].matches[1].id = f.root.data().groups[0].rounds[0].matches[0].id;
  f.backup.tournament.data = stable(f.root.data());
  fail(f, /ID inline ausente ou repetido/);
}
{
  const f = fixture(core.TARGETS[0]);
  const id = f.root.data().thirdPlaceMatch.id;
  f.collections.matches.push({ id, data: () => ({ jogo: game(id) }) });
  f.backup.subcollections.matches.push({ id, data: { jogo: game(id) } });
  f.root.data()._nJogos = 1;
  f.root.data()._nPartes.matches = 1;
  f.backup.tournament.data = stable(f.root.data());
  fail(f, /destino físico já ocupado/);
}
{
  const f = fixture(core.TARGETS[0]);
  f.collections.results = [];
  f.backup.subcollections.results = [];
  fail(f, /resultado correspondente ausente/);
}
{
  const f = fixture(core.TARGETS[0]);
  f.collections.results[0].data = () => ({ matchId: f.collections.results[0].id, scoreP1: 7 });
  f.backup.subcollections.results[0].data = stable(f.collections.results[0].data());
  fail(f, /resultado divergente/);
}
{
  const f = fixture(core.TARGETS[0]);
  f.root.data().thirdPlaceMatch.scoreP1 = 9;
  fail(f, /raiz mudou desde o backup/);
  assert.throws(() => core.verifyBackup(f.backup, { ...f.sidecar, sha256: '0'.repeat(64) }, f.backupText), /backup inválido/);
  assert.throws(() => core.verifyBackup(f.backup, f.sidecar, f.backupText + ' '), /backup inválido/);
}
{
  const f = fixture(core.TARGETS[0]);
  f.root.data()._nJogos = 1;
  f.backup.tournament.data = stable(f.root.data());
  fail(f, /contadores físicos divergentes/);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'e05-inline-preview-'));
try {
  for (const [i, f] of fixtures.entries()) {
    const filename = path.join(directory, 'backup-' + i + '.json');
    fs.writeFileSync(filename, f.backupText);
    fs.writeFileSync(filename + '.manifest.json', JSON.stringify(f.sidecar));
  }
  assert.equal(cli.loadBackups(directory).size, 3);
  const output = path.join(directory, 'manifest.json');
  cli.saveManifest(manifest, output);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).digest, manifest.digest);
} finally { fs.rmSync(directory, { recursive: true, force: true }); }

const denied = spawnSync(process.execPath, ['scripts/planejar-jogos-inline-e05.js', '--apply', 'x'],
  { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
assert.notEqual(denied.status, 0);
assert.match(denied.stderr, /prévia E05 interrompida/);
assert(!/\b(?:db|tx|ref|doc)\.(?:set|update|create|commit)\(/.test(
  fs.readFileSync(path.join(__dirname, '../scripts/planejar-jogos-inline-e05.js'), 'utf8')));
console.log('E05: manifesto dos 14 jogos é privado, validado e somente leitura');
