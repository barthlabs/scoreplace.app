'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/firebase-db.js'), 'utf8');
const start = src.indexOf('  async loadMyMatchResults(uid, opts) {');
const end = src.indexOf('\n  },', start);
assert(start >= 0 && end > start);
const method = vm.runInNewContext('({' + src.slice(start, end + 5) + '})').loadMyMatchResults;

(async () => {
  const calls = [];
  const rows = {
    '': { items: [{ tournamentId: 't2', updatedAt: '2026-01-02' }], cursor: 'p1' },
    p1: { items: [], cursor: 'p2' },
    p2: { items: [{ tournamentId: 't1', updatedAt: '2026-01-03' }], cursor: null }
  };
  const client = { _callFn: async (name, payload) => {
    assert.equal(name, 'getTournamentResultHistoryPage');
    assert.equal(payload.targetUid, 'person');
    calls.push(payload.cursor || '');
    return rows[payload.cursor || ''];
  } };
  const all = await method.call(client, 'person');
  assert.equal(all.length, 2);
  assert.deepEqual(calls, ['', 'p1', 'p2'], 'página vazia com cursor não encerra a leitura');
  assert.equal(all[0].tournamentId, 't1', 'ordenação vem após reunir todas as páginas');
  const limited = await method.call(client, 'person', { limit: 1 });
  assert.equal(limited.length, 1);
  assert.equal(limited[0].tournamentId, 't1');

  client._callFn = async () => ({ items: [], cursor: 'same' });
  await assert.rejects(method.call(client, 'person'), /Cursor de histórico repetido/);
  client._callFn = async () => { throw new Error('offline'); };
  await assert.rejects(method.call(client, 'person'), /offline/);
  console.log('✅ 3.2.8: cliente reúne páginas, não trunca vazio e propaga falha');
})().catch(error => { console.error(error); process.exitCode = 1; });
