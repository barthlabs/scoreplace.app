'use strict';

const assert = require('assert');
const H = require('./headless.js');
H.load('chaves.js');
H.load('chaves-adapter.js');
const A = H.window._chavesAdapter;
const people = (prefix, n) => Array.from({ length: n }, (_, i) => ({ name: prefix + i, uid: prefix + i }));
const line = (index, marker) => {
  const matches = A.build(5, 'simples', {
    participantes: people('p' + index + '-', 5),
    politicaDaChave: 'bye', phaseIndex: index, ns: 'p' + index
  }).matches;
  if (!marker) matches.forEach(m => { delete m.phaseIndex; });
  return matches;
};

const historical = line(0, true);
const active = line(1, true);
const tournament = { id: 'l7-active', format: 'Eliminatórias Simples', politicaDaChave: 'bye',
  currentPhaseIndex: 1, matches: historical.concat(active) };
const historicalBefore = JSON.stringify(historical);
const result = A.integrarTardiosElim(tournament, [{ name: 'Tardio', uid: 'late-1' }],
  { phaseIndex: 1, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(result.propostas, 1, 'somente a fase atual recebe proposta');
assert.strictEqual(JSON.stringify(historical), historicalBefore, 'fase anterior não sofre mutação');
assert.deepStrictEqual(Object.keys(tournament.tardiosPendentesPorLinha), ['p1'],
  'pendência só da linha ativa');

const legacy = { id: 'l7-legacy', format: 'Eliminatórias Simples', politicaDaChave: 'bye',
  currentPhaseIndex: 0, matches: line(0, false) };
const legacyResult = A.integrarTardiosElim(legacy, [{ name: 'Tardio', uid: 'late-0' }],
  { phaseIndex: 0, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(legacyResult.propostas, 1, 'fase 0 legada sem phaseIndex continua ativa');
const doublePhase = { id: 'l7-double', format: 'Fase de Grupos', politicaDaChave: 'repescagem',
  currentPhaseIndex: 1,
  phases: [{ kind: 'classification' }, { kind: 'elimination', elimination: { bracketType: 'double' } }],
  matches: historical.concat(A.build(5, 'dupla', {
    participantes: people('double-', 5), phaseIndex: 1, ns: 'double'
  }).matches) };
const historicalDoubleBefore = JSON.stringify(historical);
const doubleResult = A.integrarTardiosElim(doublePhase, [{ name: 'Tardio', uid: 'late-double' }],
  { phaseIndex: 1, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(JSON.stringify(historical), historicalDoubleBefore, 'fase histórica intocada');
assert(doubleResult.aplicados || doubleResult.recusados.length,
  'fase dupla é encaminhada ao motor correto, sem silêncio');

const phasePolicy = { id: 'l7-phase-policy', format: 'Fase de Grupos', politicaDaChave: 'repescagem',
  currentPhaseIndex: 1, phases: [{ kind: 'classification' },
    { kind: 'elimination', elimination: { bracketType: 'single' }, politicaDaChave: 'bye' }],
  matches: historical.concat(line(1, true)) };
const policyResult = A.integrarTardiosElim(phasePolicy, [{ name: 'Tardio', uid: 'late-phase' }],
  { phaseIndex: 1, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(policyResult.propostas, 1, 'a fase bye prevalece sobre o topo repescagem');
assert.strictEqual(phasePolicy.tardiosPendentesPorLinha.p1.politica, 'bye');
console.log('✓ tardio isolado por fase ativa e fase 0 legada sem marcador');
