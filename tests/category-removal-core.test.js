'use strict';
const assert = require('node:assert/strict');
const { plan, UNCATEGORIZED } = require('../functions/category-removal-core');
const { registrationId } = require('../functions/registration-core');
const tid = 'tour_category_removal';
const make = (person, categoryId, extra = {}) => ({
  registrationId:registrationId('uid:' + person, categoryId), tournamentId:tid,
  categoryId, participantKey:'uid:' + person, participantKind:'account',
  participantUid:person, status:'confirmed', validationState:'approved',
  fixedPairId:null, ...extra,
});
const a = make('a', 'old-a', { enrollSeq:1 });
const b = make('b', 'old-a', { fixedPairId:'pair-1' });
const c = make('c', 'old-a', { fixedPairId:'pair-1' });
const bOther = make('b', 'kept', { enrollSeq:2 });
const changed = plan(tid, [a, b, c, bOther], ['old-a']);
assert.equal(changed.affectedPeople, 3);
assert.equal(changed.uncategorizedPeople, 2);
assert.equal(changed.creates.length, 2);
assert(changed.creates.every(item => item.categoryId === UNCATEGORIZED && item.fixedPairId === null));
assert(changed.updates.filter(item => item.status === 'withdrawn').every(item =>
  item.withdrawnReason === 'category_removed' && item.fixedPairId === null));
assert.equal(changed.nextRegistrations.find(item => item.registrationId === bOther.registrationId).status, 'confirmed');
assert.equal(changed.nextRegistrations.filter(item => item.status === 'confirmed').length, 3);
assert.equal(changed.creates.find(item => item.participantKey === 'uid:a').enrollSeq, 1);
assert.equal(plan(tid, changed.nextRegistrations, ['old-a']).creates.length, 0, 'retry idempotente');

const prior = make('a', UNCATEGORIZED, { status:'withdrawn' });
const revived = plan(tid, [a, prior], ['old-a']);
assert.equal(revived.creates.length, 0);
assert.equal(revived.updates.find(item => item.categoryId === UNCATEGORIZED).status, 'confirmed');
assert.equal(revived.nextRegistrations.length, 2);

const both = plan(tid, [make('multi', 'old-a'), make('multi', 'old-b')], ['old-a', 'old-b']);
assert.equal(both.creates.length, 1, 'duas categorias removidas deixam uma inscrição sem categoria');
assert.equal(both.updates.length, 2);

const alreadyUncategorized = plan(tid,
  [make('multi', 'old-a'), make('multi', UNCATEGORIZED), make('multi', 'kept')], ['old-a']);
assert.equal(alreadyUncategorized.creates.length, 0);
assert.equal(alreadyUncategorized.nextRegistrations.filter(item => item.status === 'confirmed').length, 2,
  'sentinela e outra categoria já ativas não são duplicadas');

assert.throws(() => plan(tid,
  Array.from({ length:226 }, (_, index) => make('large-' + index, 'old-a')), ['old-a']),
  /grande demais para exclusão atômica/);

assert.throws(() => plan(tid, [make('paid', 'old-a', { paymentState:'paid', paymentDueCents:1000 })], ['old-a']),
  /acerto financeiro/);
assert.throws(() => plan(tid, [make('bad', 'old-a', { registrationId:'errado' })], ['old-a']),
  /Elenco canônico inválido/);
console.log('✓ exclusão preserva inscrições, outras categorias, sentinela e pares; cobrança protegida');
