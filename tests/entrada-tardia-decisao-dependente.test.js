'use strict';
const assert = require('node:assert/strict');
const { nextPhaseLateEnrollment } = require('../functions-autodraw/phase-late-enrollment-core.js');

assert.deepEqual(nextPhaseLateEnrollment('closed'),
  { lateEnrollment: 'closed', newMatchups: false },
  'fechar inscrições desliga novos confrontos');
assert.deepEqual(nextPhaseLateEnrollment('expand'),
  { lateEnrollment: 'expand', newMatchups: true });
assert.deepEqual(nextPhaseLateEnrollment('standby'),
  { lateEnrollment: 'standby', newMatchups: false });
console.log('Entrada tardia: novos confrontos dependem de inscrições abertas OK');
