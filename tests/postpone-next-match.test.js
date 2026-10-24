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
const reloadStart = source.indexOf('window._bracketReloadCourtState = function', start);
const reloadEnd = source.indexOf('window._bracketEnsureCourtReleaseListener = function', reloadStart);
assert(reloadStart > start && reloadEnd === end);
let resolveRead;
let sourceOption;
context.window.FirestoreDB = { db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
  get: option => { sourceOption = option; return new Promise(resolve => { resolveRead = resolve; }); }
}) }) }) }) } };
context.Promise = Promise;
const entry = { ready: true, revision: 7, postponed: ['j1'] };
const pending = context.window._bracketReloadCourtState('tour_test', entry);
assert.equal(entry.ready, false, 'segundo clique fica bloqueado até ler a revisão nova');
assert.equal(sourceOption.source, 'server');
resolveRead({ exists: true, data: () => ({ revision: 8, postponed: ['j1', 'j2'] }) });
pending.then(() => {
  assert.equal(entry.ready, true);
  assert.equal(entry.revision, 8);
  assert.deepEqual(Array.from(entry.postponed), ['j1', 'j2']);
  console.log('✓ pular jogo repetidamente usa a revisão confirmada do servidor');
}).catch(error => { console.error(error); process.exitCode = 1; });
