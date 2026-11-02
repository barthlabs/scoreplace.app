/* Reforma 3.2b: índice de leitura só quando a fase é inequívoca. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const source = path.join(root, 'js/views/tournament-split-core.js');
const split = require(source);

for (const vendor of [
  'functions/vendor/tournament-split-core.js',
  'functions-autodraw/vendor/tournament-split-core.js'
]) {
  assert(fs.readFileSync(source).equals(fs.readFileSync(path.join(root, vendor))),
    vendor + ' divergiu da fonte canônica');
}

function record(place, phaseTag, hasTag, phaseKey, currentPhaseIndex) {
  const match = { id: 'm', p1: 'A', p2: 'B' };
  if (hasTag) match.phaseIndex = phaseTag;
  const t = { id: 't', currentPhaseIndex: currentPhaseIndex || 0 };
  if (place === 'rounds') t.rounds = [{ matches: [match] }];
  if (place === 'matches') t.matches = [match];
  if (place === 'phaseRounds') t.phaseRounds = { [phaseKey]: { rounds: [{ matches: [match] }] } };
  return { tournament: t, record: split.dividir(t, ['matches']).matches[0] };
}

function indexed(place, tag, hasTag, expected, key) {
  const reg = record(place, tag, hasTag, key || '2').record;
  assert(reg, 'registro precisa existir em ' + place);
  if (expected === null) assert(!Object.prototype.hasOwnProperty.call(reg, '_phaseIndex'),
    place + ' / ' + String(tag) + ' não pode ter índice');
  else assert.strictEqual(reg._phaseIndex, expected, place + ' / ' + String(tag));
}

for (const place of ['rounds', 'matches', 'phaseRounds']) {
  const structural = place === 'rounds' ? 0 : place === 'phaseRounds' ? 2 : null;
  indexed(place, undefined, false, structural);
  indexed(place, undefined, true, structural);
  indexed(place, null, true, null);
  indexed(place, '2', true, null);
  indexed(place, NaN, true, null);
  indexed(place, -1, true, null);
  indexed(place, 1.5, true, null);
}
indexed('rounds', 0, true, 0);
indexed('rounds', 1, true, null);
indexed('matches', 0, true, 0);
indexed('matches', 1, true, 1);
indexed('matches', 2, true, 2);
indexed('matches', Number.MAX_SAFE_INTEGER + 1, true, null);
indexed('phaseRounds', 2, true, 2);
indexed('phaseRounds', 1, true, null);
indexed('phaseRounds', undefined, false, null, '01');
indexed('phaseRounds', undefined, false, null, '1.0');
indexed('phaseRounds', undefined, false, 0, '0');

const historical = {
  id: 'history', currentPhaseIndex: 2,
  rounds: [{ matches: [{ id: 'old', p1: 'A' }] }],
  phaseRounds: { '2': { rounds: [{ matches: [{ id: 'active', p1: 'C' }] }] } }
};
const divided = split.dividir(historical, ['matches']);
assert.deepStrictEqual(divided.matches.map((r) => [r.jogo.id, r._phaseIndex]),
  [['old', 0], ['active', 2]], 'fase ativa não move rounds históricos');
assert.deepStrictEqual(split.remontar(divided), historical,
  'o índice de envelope não altera a volta do torneio');

const original = { _chave: 'm', _loc: { tipo: 'matches', mi: 0 }, jogo: { id: 'm', phaseIndex: 1, scoreP1: 6 } };
const indexedCopy = Object.assign({}, original, { _phaseIndex: 1 });
assert.deepStrictEqual(split.jogosQueMudaram([original], [indexedCopy]), { mudaram: [], sumiram: [] },
  'índice novo sozinho não regrava documento antigo');
assert(!Object.prototype.hasOwnProperty.call(original, '_phaseIndex'), 'diff não muta documento antigo');
assert.strictEqual(indexedCopy._phaseIndex, 1, 'diff não muta documento novo');
const changed = Object.assign({}, indexedCopy, { jogo: Object.assign({}, indexedCopy.jogo, { scoreP1: 7 }) });
assert.deepStrictEqual(split.jogosQueMudaram([indexedCopy], [changed]),
  { mudaram: [changed], sumiram: [] }, 'placar alterado continua detectado');

console.log('match-phase-index: índice estrutural, ambiguidades, diff e vendors OK');
