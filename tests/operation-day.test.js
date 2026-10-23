'use strict';
const assert = require('node:assert/strict');
const { civilDay, operationDay } = require('../functions-autodraw/operation-day');

(async () => {
  assert.equal(civilDay('2026-10-23T02:59:59Z', 'America/Sao_Paulo'), '2026-10-22');
  assert.equal(civilDay('2026-10-23T03:00:00Z', 'America/Sao_Paulo'), '2026-10-23');
  const noRead = { get: async () => { throw new Error('perfil não deveria ser lido'); } };
  assert.equal(await operationDay({ timeZone: 'America/Sao_Paulo' }, noRead, {},
    '2026-10-23T03:00:00Z'), '2026-10-23');
  await assert.rejects(operationDay({}, noRead, {}, '2026-10-23T03:00:00Z'), /Fuso/);
  console.log('✓ dia operacional segue o fuso do torneio, inclusive na virada civil');
})().catch(error => { console.error(error); process.exitCode = 1; });
