'use strict';
const assert = require('assert');
const { sandbox } = require('../tests/render-harness');
const { initialMonarchIndividualEnrollment: server } = require('./monarch-pair-policy');

const base = { enrollmentMode: 'individual', currentPhaseIndex: 0,
  phases: [{ reiRainha: true, drawMode: 'rei_rainha' }, { drawMode: 'sorteio' }] };
const cases = [
  ['48 inscritos individuais, fase 0', base, true],
  ['fase 1', { ...base, currentPhaseIndex: 1 }, false],
  ['índice ausente', { ...base, currentPhaseIndex: undefined }, true],
  ['índice NaN', { ...base, currentPhaseIndex: 'abc' }, false],
  ['índice negativo', { ...base, currentPhaseIndex: -1 }, false],
  ['índice fora da faixa', { ...base, currentPhaseIndex: 99 }, false],
  ['misto', { ...base, enrollmentMode: 'misto' }, false],
  ['equipes', { ...base, enrollmentMode: 'teams' }, false],
  ['outra fase', { ...base, phases: [{ drawMode: 'sorteio' }] }, false],
  ['reiRainha false com drawMode', { ...base, phases: [{ reiRainha: false, drawMode: 'rei_rainha' }] }, true],
  ['lista vazia não herda topo', { ...base, phases: [], drawMode: 'rei_rainha' }, false],
  ['null herda topo', { ...base, phases: null, drawMode: 'rei_rainha' }, true],
  ['objeto herda topo', { ...base, phases: {}, ligaRoundFormat: 'rei_rainha' }, true],
  ['fase inválida', { ...base, phases: [null] }, false],
  ['sem fases nem topo', { ...base, phases: undefined }, false],
];
for (const [label, tournament, expected] of cases) {
  assert.strictEqual(server(tournament), expected, label + ' servidor');
  assert.strictEqual(server(tournament), sandbox._initialMonarchIndividualEnrollment(tournament), label + ' paridade cliente');
}
console.log('✓ política de duplas Rei/Rainha: ' + cases.length + ' vetores em paridade');
