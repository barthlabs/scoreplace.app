'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/views/bracket.js', 'utf8');
const start = source.indexOf('window._bracketPostponedOrder = function');
const end = source.indexOf('window._bracketEnsureCourtReleaseListener = function', start);
assert(start > 0 && end > start);
const context = { window: {}, Map, String, Array };
vm.runInNewContext(source.slice(start, end), context);
const ordered = (postponed) => Array.from(context.window._bracketPostponedOrder(
  [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }], postponed), m => m.id);

assert.deepEqual(ordered([]), ['j1', 'j2', 'j3']);
assert.deepEqual(ordered(['j1']), ['j2', 'j3', 'j1']);
assert.deepEqual(ordered(['j1', 'j2']), ['j3', 'j1', 'j2']);
assert.deepEqual(ordered(['j2', 'j1']), ['j3', 'j2', 'j1']);
assert.deepEqual(ordered(['j1', 'j2', 'j3']), ['j1', 'j2', 'j3']);
assert.deepEqual(ordered(['antigo', 'j1']), ['j2', 'j3', 'j1']);
console.log('✓ pular jogo repetidamente promove o próximo sem alterar a ordem restante');
