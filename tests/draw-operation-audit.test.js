'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const start = source.indexOf('function _recordSeededDraw(t, details) {');
const end = source.indexOf('\n// L6.R1', start);
assert(start >= 0 && end > start);
const record = new Function('createHash', source.slice(start, end) + '\nreturn _recordSeededDraw;')(createHash);
const t = { rulesContractVersion: 2, currentPhaseIndex: 0, fmt2: {}, rounds: [{}],
  participants: Array.from({ length: 137 }, (_, i) => ({ uid: 'athlete-' + i + '-' + randomUUID() })) };
assert.throws(() => record(t, { operationId: 'op' }), /semente/);
for (let i = 0; i < 200; i++) record(t, { seed: randomUUID(), operationId: randomUUID(), at: '2026-11-03' });
assert.equal(t.drawOperationsV2.length, 200);
assert(t.drawOperationsV2.every(row => row.eligibleCount === 137 && /^[a-f0-9]{64}$/.test(row.eligibleKeysHash)));
assert(t.drawOperationsV2.every(row => row.eligibleKeys === undefined));
assert(Buffer.byteLength(JSON.stringify(t.drawOperationsV2)) < 100000,
  '200 rodadas com 137 inscritos não aproximam o documento do limite de 1 MiB');
console.log('✓ auditoria guarda hash e contagem estáveis sem acumular elenco por rodada');
