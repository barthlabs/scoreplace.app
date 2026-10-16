'use strict';
// Confra: a entrada em J195 acertava o eixo vertical, mas mostrava J126
// porque a coluna de J195 ficava fora do scroller horizontal da chave.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
const start = source.indexOf('function _bracketEntryHorizontalGap(card, align) {');
const end = source.indexOf('\nwindow._bracketEntryHorizontalGap =', start);
assert.ok(start > 0 && end > start, 'auxiliar horizontal disponível');
const gap = vm.runInNewContext('(' + source.slice(start, end) + ')');

function fixture(left, maxLeft) {
  const scroller = {
    scrollLeft: left, scrollWidth: maxLeft + 436, clientWidth: 436,
    getBoundingClientRect: () => ({ left: 53 }),
  };
  const column = { getBoundingClientRect: () => ({ left: 1427 - scroller.scrollLeft }) };
  const card = { closest: selector => selector === '.bracket-scroll-container' ? scroller : column };
  return { scroller, card };
}

const middle = fixture(0, 2432);
assert.equal(gap(middle.card, false), 1366, 'mede a coluna distante sem mover');
assert.equal(middle.scroller.scrollLeft, 0);
assert.equal(gap(middle.card, true), 1366, 'alinha a coluna do jogo');
assert.equal(middle.scroller.scrollLeft, 1366);

const endOfTrack = fixture(0, 1000);
assert.equal(gap(endOfTrack.card, true), 1000, 'limita ao fim da faixa');
assert.equal(gap(endOfTrack.card, false), 0, 'no limite, a reafirmação fica estável');
assert.equal(gap({ closest: () => null }, true), 0, 'agenda operacional não é afetada');

const goMineStart = source.indexOf('    var _goMine = function (behavior) {');
const goMine = source.slice(goMineStart, source.indexOf('    setTimeout(function () { _goMine', goMineStart));
assert.match(goMine, /_bracketEntryHorizontalGap\(_target, true\)/, 'entrada alinha o eixo X');
const reaffirmStart = source.indexOf('    var _reafirmar = function () {');
const reaffirm = source.slice(reaffirmStart, source.indexOf('    _reafirmar();', reaffirmStart));
assert.match(reaffirm, /_erroX = _bracketEntryHorizontalGap\(_el, false\)/, 'reafirmação mede X');
assert.match(reaffirm, /_erro <= 3 && _erroX <= 3/, 'reafirmação exige X e Y estáveis');
console.log('✅ Alinhamento horizontal da entrada na chave: 9 verificações');
