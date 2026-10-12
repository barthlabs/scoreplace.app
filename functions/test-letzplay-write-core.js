'use strict';
const assert = require('assert/strict');
const core = require('./letzplay-write-core');

const base = {
  source: 'letzplay', handle: '@atleta', footprint: [], observations: [],
  games: [{ date: '07/08/25', club: 'clube', competition: 'D', tourneyId: '7', oppHandles: ['b', 'c'], myScore: 6, oppScore: 4 }],
  importedVia: 'organizer', importedAt: 'forjado',
};
const saved = core.normalizeOwnImport(base);
assert.equal(saved.handle, '@atleta');
assert.equal(saved.importedVia, undefined);
assert.equal(saved.importedAt, undefined);
assert.throws(() => core.normalizeOwnImport(Object.assign({}, base, { source: 'outro' })), /malformado/);
assert.throws(() => core.normalizeOwnImport(Object.assign({}, base, { handle: '' })), /handle/);
assert.equal(core.gameCount({ games: [1], gamesTotal: 4 }), 4);
assert.ok(core.isSameHandle('@Atleta', '@atleta'));
assert.equal(core.isSameHandle('@Atleta', '@outra'), false);
console.log('✅ letzplay-write-core: 7 verificações');
