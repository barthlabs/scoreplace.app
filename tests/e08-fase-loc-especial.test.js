'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const copies = [
  '../js/views/tournament-split-core.js',
  '../functions/vendor/tournament-split-core.js',
  '../functions-autodraw/vendor/tournament-split-core.js'
];

for (const filename of copies) {
  const split = require(path.resolve(__dirname, filename));
  for (const tipo of ['groupRounds', 'thirdPlace']) {
    const loc = { tipo };
    assert.equal(split.faseIndexavel({ phaseIndex: 0 }, loc), 0, `${filename}: ${tipo} fase zero`);
    assert.equal(split.faseIndexavel({ phaseIndex: 1 }, loc), 1, `${filename}: ${tipo} outra fase explícita`);
    for (const value of [-1, 1.5, '0', Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(split.faseIndexavel({ phaseIndex: value }, loc), null,
        `${filename}: ${tipo} recusa ${String(value)}`);
    }
    assert.equal(split.faseIndexavel({}, loc), null, `${filename}: ${tipo} sem tag`);
  }
  assert.equal(split.faseIndexavel({}, { tipo: 'rounds' }), 0, `${filename}: rounds estrutural`);
  assert.equal(split.faseIndexavel({ phaseIndex: 1 }, { tipo: 'rounds' }), null,
    `${filename}: rounds rejeita conflito`);
  assert.equal(split.faseIndexavel({}, { tipo: 'phaseRounds', fase: '2' }), 2,
    `${filename}: phaseRounds estrutural`);
  assert.equal(split.faseIndexavel({ phaseIndex: 1 }, { tipo: 'phaseRounds', fase: '2' }), null,
    `${filename}: phaseRounds rejeita conflito`);
}

console.log('E08: matriz de localização especial e fontes vendor passou');
