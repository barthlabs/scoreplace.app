'use strict';
/* O eco de matches deve atualizar a chave a partir do jogo físico recém-chegado,
 * sem reaplicar um placar antigo guardado em _results. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
function property(name) {
  let found;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Property' && node.key && node.key.name === name) found = source.slice(node.start, node.end);
    Object.values(node).forEach(value => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    });
  }
  walk(acorn.parse(source, { ecmaVersion: 'latest' }));
  assert.ok(found, name);
  return found;
}
let callback, errors = 0, refreshes = 0;
const window = {
  FirestoreDB: {
    db: {},
    _tSub: () => ({ onSnapshot(opts, fn) { callback = fn; return () => {}; } }),
    _resultFromPhysicalMatch(doc, id) {
      if (doc._chave !== id || !doc.jogo || doc.jogo.id !== id) throw new Error('jogo inválido');
      return { ...doc.jogo, matchId: id };
    }
  },
  _tSplit: {
    partesDe: () => ['matches'],
    colecaoDaParte: x => x,
    remontar: partes => ({ matches: partes.matches.map(doc => doc.jogo) })
  },
  _isRemoteFirestoreSnapshot: () => true,
  _collectAllMatches: t => t.matches,
  _softRefreshView: () => { refreshes++; },
  _error: () => { errors++; }
};
const store = vm.runInNewContext('({' + [
  property('ouvirPartesDoTorneio'), property('_applyPhysicalResultOnMatch')
].join(',') + '})', { window, setTimeout });
store._matchResultFields = ['scoreP1', 'scoreP2', 'winner'];
store._partesQueMudamAoVivo = () => ['matches'];
store.pararDeOuvirJogos = () => {};
store.tournaments = [{ id: 't', matches: [{ id: 'm', scoreP1: 3 }], _results: { m: { scoreP1: 3 } } }];
store.ouvirPartesDoTorneio('t');
assert.equal(typeof callback, 'function');
function emit(score, valid = true) {
  const doc = { id: 'm', data: () => ({ _chave: valid ? 'm' : 'wrong', jogo: { id: 'm', scoreP1: score, scoreP2: 4 } }) };
  callback({ docChanges: () => [doc], forEach: fn => fn(doc) });
}
emit(6);
assert.equal(store.tournaments[0].matches[0].scoreP1, 6);
assert.equal(store.tournaments[0]._results.m.scoreP1, 6, 'cache passa a refletir o jogo físico');
assert.equal(store._resultReadEpochs.t, 1, 'snapshot invalida hidratação antiga');
emit(7);
assert.equal(store.tournaments[0].matches[0].scoreP1, 7, 'segundo eco não ressuscita o placar anterior');
emit(99, false);
assert.equal(store.tournaments[0].matches[0].scoreP1, 7, 'jogo inválido não altera o estado vivo');
assert.equal(errors, 1);
assert.equal(refreshes, 2);
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
assert.match(bracket, /_rotaMostraAChaveDeste\(window\.location\.hash, t\.id\)/);
console.log('✓ eco de matches: placar físico vence cache antigo, atualização seguinte e erro fechado');
