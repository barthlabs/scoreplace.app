'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const split = require('../js/views/tournament-split-core');
const plan = require('../functions-autodraw/write-plan');
const roster = require('../functions/result-visibility-roster-core');
const vendoredRoster = require('../functions-autodraw/vendor/result-visibility-roster-core');

const before = { id: 't', name: 'T', isPublic: true, organizerOnly: false,
  matches: [{ id: 'm', p1: 'Ana', p2: 'Bia', p1Uid: 'ana', p2Uid: 'bia' }],
  participants: [] };
const ctx = (visibilityResults, extras = []) => ({ split, boundary: (t) => ({ persist: t }),
  agoraIso: '2026-10-31T00:00:00.000Z', visibilityResults, extras });
const results = (p) => p.ops.filter((op) => op.colecao === 'results');

const hidden = { ...before, isPublic: false, organizerOnly: true };
const hide = plan.planWrites(before, hidden, ctx({ mode: 'hide', entries: [{ id: 'm' }, { id: 'orphan' }] }));
assert.equal(results(hide).length, 2, 'até resultado órfão perde o índice');
assert(results(hide).every((op) => op.merge && op.apagarCampos.join() === 'playerUids'));
assert.equal(hide.ops.filter((op) => op.colecao === null).length, 1, 'raiz e resultados no mesmo plano');
assert.equal(hide.ops.filter((op) => op.colecao === 'matches').length, 0, 'nenhum jogo foi alterado');

const release = plan.planWrites(hidden, before,
  ctx({ mode: 'release', entries: [{ id: 'm', playerUids: ['ana', 'bia', 'ana'] }] },
    [{ colecao: 'notificationOutbox', chave: 'release', doc: { kind: 'tournament-notification' } }]));
assert.deepEqual(results(release).map((op) => op.doc.playerUids), [['ana', 'bia']]);
assert.equal(release.ops.at(-1).colecao, 'notificationOutbox', 'aviso conta no plano');
assert.equal(release.totais.operacoes, 4);
const operations = [];
const fakeRef = { collection: (c) => ({ doc: (id) => `${c}/${id}` }) };
plan.applyPlan({ set: (...args) => operations.push(args), delete: () => assert.fail('não deve apagar documento') },
  fakeRef, hide, { FieldValue: { delete: () => 'DELETE_FIELD', increment: () => 'INCREMENT_ONE' } });
assert.equal(operations.length, 4);
assert.equal(operations[0][1].playerUids, 'DELETE_FIELD');
assert(operations.some(([ref, doc]) => ref === 'resultVisibilityFence/state' && doc.revision === 'INCREMENT_ONE'));
assert.deepEqual(operations.find(([ref]) => ref === 'resultVisibilityFence/state')[2], { merge: true },
  'fence ausente é criado por set com merge e increment, inclusive no primeiro revision');

const counted = (n) => plan.planWrites(before, hidden, ctx({ mode: 'hide',
  entries: Array.from({ length: n }, (_, i) => ({ id: `m${i}` })) }));
assert.equal(counted(0).totais.operacoes, 2, 'zero resultados ainda escreve raiz e fence');
assert.equal(counted(398).totais.operacoes, 400);
assert.equal(plan.checaTeto(counted(398)), null);
assert.equal(counted(399).totais.operacoes, 401);
assert.match(plan.checaTeto(counted(399)), /excede o teto/);
const tooMany = counted(400);
assert.match(plan.checaTeto(tooMany), /excede o teto/);
let writes = 0;
assert.throws(() => plan.applyPlan({ set: () => writes++ }, fakeRef, tooMany, {}), /excede o teto/);
assert.equal(writes, 0);

assert.throws(() => plan.planWrites(before, hidden,
  ctx({ mode: 'hide', entries: [{ id: 'm' }, { id: 'm' }] })), /identidade única/);
assert.throws(() => plan.planWrites(before, hidden,
  ctx({ mode: 'release', entries: [{ id: 'm', playerUids: [null] }] })), /sem prova/);

const structural = { ...before.matches[0] };
assert.deepEqual(roster.releasePlayerUids(before, structural), ['ana', 'bia']);
assert.deepEqual(vendoredRoster.releasePlayerUids(before, structural), ['ana', 'bia']);
assert.equal(roster.releasePlayerUids(before, { ...structural, p1Uid: null }), null,
  'lado ocupado sem UID ou inscrição única falha fechado');
assert.equal(roster.releasePlayerUids(before, { ...structural, p1: 'Ana / Carla', team1Uids: ['ana'] }), null,
  'dupla com só um UID falha fechado');
assert(fs.readFileSync(require.resolve('../functions/result-visibility-roster-core'))
  .equals(fs.readFileSync(require.resolve('../functions-autodraw/vendor/result-visibility-roster-core'))));
console.log('result-visibility-write-plan: ocultação, liberação, limite, órfão e vendor OK');
