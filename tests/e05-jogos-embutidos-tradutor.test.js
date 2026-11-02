'use strict';
const assert = require('node:assert/strict');
const split = require('../js/views/tournament-split-core.js');

const game = id => ({ id, p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 4, winner: 'A' });
const group = { groups: [{ rounds: [{ matches: Array.from({ length: 12 }, (_, i) => game('g' + i)), round: 1 }] }],
  classifCongelada: ['A', 'B'] };
const third = { thirdPlaceMatch: game('bronze'), rounds: [{ matches: [game('final')] }] };
const existing = { matches: [game('m')], rounds: [{ matches: [game('r')] }],
  phaseRounds: { '2': { rounds: [{ matches: [game('p')] }] } } };

for (const original of [group, third, existing]) {
  const copy = JSON.parse(JSON.stringify(original));
  const ordinary = split.dividir(original, ['matches']);
  assert.deepEqual(original, copy);
  assert.deepEqual(split.remontar(ordinary), original);
  if (original === group) {
    assert.equal(ordinary.matches.length, 0);
    assert.equal(ordinary.config.groups[0].rounds[0].matches.length, 12);
    assert.equal(split.dividir(original).matches.length, 0);
  }
  if (original === third) {
    assert.equal(ordinary.matches.length, 1);
    assert.equal(ordinary.config.thirdPlaceMatch.id, 'bronze');
  }
  const admin = split.dividir(original, ['matches'], { migracaoAdministrativa: true });
  assert.deepEqual(split.remontar(admin), original);
  assert.deepEqual(split.remontar({ ...admin, matches: admin.matches.slice().reverse() }), original);
  if (original === group) {
    assert.equal(admin.matches.length, 12);
    assert(admin.matches.every(x => x._loc.tipo === 'groupRounds' && !Object.hasOwn(x, '_phaseIndex')));
    assert.equal(admin.config.groups[0].rounds[0].matches.length, 0);
    const marked = split.dividir({ ...original, _inlineGamesExternalized: true }, ['matches']);
    assert.equal(marked.matches.length, 12);
    assert.equal(split.dividir({ ...original, _inlineGamesExternalized: true }).matches.length, 12);
    assert.deepEqual(split.remontar(marked).groups, original.groups);
  }
  if (original === third) {
    assert.equal(admin.matches.length, 2);
    assert(!Object.hasOwn(admin.config, 'thirdPlaceMatch'));
    assert(admin.matches.some(x => x._loc.tipo === 'thirdPlace' && !Object.hasOwn(x, '_phaseIndex')));
  }
}

const groupParts = split.dividir(group, ['matches'], { migracaoAdministrativa: true });
assert.equal(split.remontar({ config: groupParts.config, matches: [
  { ...groupParts.matches[0], _loc: { tipo: 'unknown' } }
]}), null);
assert.equal(split.remontar({ config: groupParts.config, matches: [
  { ...groupParts.matches[0], _loc: undefined }
]}), null);
assert.equal(split.remontar({ config: { _inlineGamesExternalized: true }, matches: [
  { _chave: 'r', _loc: { tipo: 'rounds', ri: 0, mi: 0 }, jogo: game('r') }
]}), null);
assert.equal(split.remontar({ config: { _inlineGamesExternalized: true, phaseRounds: {} }, matches: [
  { _chave: 'p', _loc: { tipo: 'phaseRounds', fase: '2', ri: 0, mi: 0 }, jogo: game('p') }
]}), null);
assert.equal(split.remontar({ config: { groups: [] }, matches: [groupParts.matches[0]] }), null);
assert.equal(split.remontar({ config: { ...group, _inlineGamesExternalized: true },
  matches: [groupParts.matches[0]] }), null);
assert.equal(split.remontar({ config: groupParts.config,
  matches: [groupParts.matches[0], groupParts.matches[0]] }), null);
assert.throws(() => split.dividir({ matches: [game('same')], thirdPlaceMatch: game('same') },
  ['matches'], { migracaoAdministrativa: true }), /ID de jogo repetido/);
console.log('E05: tradutor conserva antes, extrai após marcador e remonta sem perda');
