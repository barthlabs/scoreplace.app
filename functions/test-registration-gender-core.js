'use strict';
const assert = require('node:assert/strict');
const G = require('./registration-gender-core');
const R = require('./registration-roster-core');
const M = require('./registration-mutations-core');
const C = require('./registration-core');
const Sweep = require('./uid-sweep');

assert.deepEqual(G.normalizeAssignments(undefined), []);
assert.deepEqual(G.normalizeAssignments([{ manualParticipantId:'m1', gender:'feminino' }]),
  [{ participantKey:'manual:m1', gender:'feminino' }]);
assert.throws(() => G.normalizeAssignments([{ manualParticipantId:'m1', gender:'outro' }]), /Gênero inválido/);
assert.throws(() => G.normalizeAssignments([{ manualParticipantId:'m1', gender:'feminino' },
  { manualParticipantId:'m1', gender:'masculino' }]), /repetida/);
const base = { registrationId:'r1',categoryId:'vitamina-c',participantKind:'manual',
  manualParticipantId:'m1',manualDisplayName:'Pessoa',status:'confirmed' };
const changed = G.apply(base,'feminino');
assert.equal(changed.genderSource,'organizador');
assert.equal(R.rosterFromRegistrations([changed])[0].gender,'feminino');
assert.equal(R.rosterFromRegistrations([changed])[0].genderSource,'organizador');
assert.equal(G.apply(changed,'feminino'),null);
assert.equal(G.apply(changed,'').gender,null);
assert.equal(R.rosterFromRegistrations([G.apply(changed,'')])[0].gender,undefined);

const id='tour_1234567890123_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const source={...base,...changed,tournamentId:id,participantKey:'manual:m1',
  registrationId:C.registrationId('manual:m1','vitamina-c')};
const move=M.reclassify(id,[source],{manualParticipantId:'m1'},'vitamina-c','retinal');
assert.equal(move.creates[0].gender,'feminino');
assert.equal(move.creates[0].genderSource,'organizador');
const oldDestination={...source,registrationId:C.registrationId('manual:m1','retinal'),
  categoryId:'retinal',status:'withdrawn',gender:'masculino',genderSource:'organizador'};
const reused=M.reclassify(id,[source,oldDestination],{manualParticipantId:'m1'},'vitamina-c','retinal');
assert.equal(reused.updates.find((item)=>item.categoryId==='retinal').gender,'feminino');
const partner={...source,participantKey:'uid:partner',participantKind:'account',
  participantUid:'partner',manualParticipantId:null,manualDisplayName:null,
  registrationId:C.registrationId('uid:partner','vitamina-c'),
  gender:'masculino',genderSource:'organizador',fixedPairId:'pair-1'};
const pair=R.rosterFromRegistrations([{...source,fixedPairId:'pair-1',enrollSeq:1},
  {...partner,enrollSeq:2}])[0];
assert.equal(pair.p1Gender,'feminino');
assert.equal(pair.p2Gender,'masculino');
assert.equal(pair.p1GenderSource,'organizador');
assert.equal(pair.p2GenderSource,'organizador');
const merged=Sweep.remapUid({...source,participantKind:'account',participantUid:'old-uid',
  participantKey:'uid:old-uid'},'old-uid','new-uid').value;
assert.equal(merged.gender,'feminino');
assert.equal(merged.genderSource,'organizador');
console.log('✓ gênero canônico: validação, projeção, limpeza e reclassificação');
