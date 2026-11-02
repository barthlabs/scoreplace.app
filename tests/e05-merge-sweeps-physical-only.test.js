'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const start = src.indexOf('async function _sweepTournamentSubcollections(');
const end = src.indexOf('async function _repairTournaments(', start);
assert(start >= 0 && end > start);
const updates = [];
const resultCol = { id: 'results', path: 'tournaments/t/results',
  doc: () => { throw new Error('results foi lido'); },
  get: () => { throw new Error('results foi varrido'); } };
const matchCol = { id: 'matches', path: 'tournaments/t/matches',
  doc: () => ({ get: async () => ({ exists: false }) }),
  get: async () => ({ docs: [{ id: 'm', ref: { path: 'tournaments/t/matches/m' },
    data: () => ({ playerUids: ['drop'] }) }] }) };
const context = {
  _uidSweep: { remapUid: (value, from, to) => ({ changed: true,
    value: { ...value, playerUids: value.playerUids.map(uid => uid === from ? to : uid) } }) },
  console: { log: () => {}, error: error => { throw new Error(error); } }
};
vm.runInNewContext(src.slice(start, end), context);

(async () => {
  const db = { batch: () => ({ update: (ref, payload) => updates.push([ref.path, payload]),
    commit: async () => {} }) };
  const tour = { id: 't', listCollections: async () => [resultCol, matchCol] };
  const changed = await context._sweepTournamentSubcollections(db, tour, 'drop', 'keep');
  assert.equal(changed, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], 'tournaments/t/matches/m');
  assert.deepEqual(Array.from(updates[0][1].playerUids), ['keep']);
  console.log('✅ E05: fusão atualiza o jogo físico sem tocar results');
})().catch(error => { console.error(error); process.exitCode = 1; });
