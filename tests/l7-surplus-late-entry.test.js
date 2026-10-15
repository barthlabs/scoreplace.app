'use strict';

const assert = require('assert');
const H = require('./headless.js');
H.load('bracket-policy.js');
H.load('chaves.js');
H.load('chaves-adapter.js');
const A = H.window._chavesAdapter;
const policy = H.window._bracketPolicy;
const people = n => Array.from({ length: n }, (_, i) => ({ uid: 'u' + (i + 1), displayName: 'P' + (i + 1) }));
const t = { id: 'late-sobra', format: 'Eliminatórias Simples', politicaDaChave: 'sobra_unica',
  currentPhaseIndex: 0, participants: people(5) };
t.matches = A.build(5, 'simples', {
  participantes: t.participants, ns: 'p0', phaseIndex: 0,
  politicaDaChave: 'sobra_unica',
  prepareSurplusDecision: ({ scope, eligible }) => policy.prepareTournamentSurplusDecision(t, scope, eligible)
}).matches;
const oldReceipt = Object.values(t.sobraUnicaDecisoesV1)[0];
assert(oldReceipt);
const before = JSON.stringify(t);
let result = A.integrarTardiosElim(t, [{ uid: 'u6', displayName: 'P6' }],
  { phaseIndex: 0, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(result.aplicados, 0);
assert(result.recusados.some(r => r.motivo === 'prefixo-com-folga'), JSON.stringify(result.recusados));
assert.strictEqual(JSON.stringify(t), before,
  'tardio não remonta silenciosamente confrontos já publicados para preencher folga');

const even = { id: 'late-sobra-even', format: 'Eliminatórias Simples', politicaDaChave: 'sobra_unica',
  currentPhaseIndex: 0, participants: people(6) };
even.matches = A.build(6, 'simples', { participantes: even.participants,
  ns: 'p0', phaseIndex: 0, politicaDaChave: 'sobra_unica' }).matches;
result = A.integrarTardiosElim(even, [{ uid: 'u7', displayName: 'P7' }],
  { phaseIndex: 0, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(result.aplicados, 0);
assert(result.recusados.some(r => r.motivo === 'falta-par'), JSON.stringify(result.recusados));

const twoLate = JSON.parse(before);
result = A.integrarTardiosElim(twoLate, [
  { uid: 'u6', displayName: 'P6' }, { uid: 'u7', displayName: 'P7' }
], { phaseIndex: 0, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(result.aplicados, 2, JSON.stringify(result.recusados));
const newReceipt = Object.values(twoLate.sobraUnicaDecisoesV1)[0];
assert(newReceipt && newReceipt.sourceIds.length === 7,
  'sobra ímpar revisa o recibo para o elenco completo antes de publicar');
assert(twoLate.matches.some(m => m.round === 1 && m.isBye && m.winner),
  'a primeira folga do novo desenho não fica pendente sem decisão');
assert.strictEqual(newReceipt.recipientIdentity, oldReceipt.recipientIdentity);

const growing = { id: 'late-sobra-grow', format: 'Eliminatórias Simples',
  politicaDaChave: 'sobra_unica', currentPhaseIndex: 0, participants: people(8) };
growing.matches = A.build(8, 'simples', { participantes: growing.participants,
  ns: 'p0', phaseIndex: 0, politicaDaChave: 'sobra_unica' }).matches;
result = A.integrarTardiosElim(growing, [
  { uid: 'u9', displayName: 'P9' }, { uid: 'u10', displayName: 'P10' }
], { phaseIndex: 0, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(result.aplicados, 2, JSON.stringify(result.recusados));
assert(growing.matches.some(m => m.round === 2 && m.isBye && m.sobraAguardaDecisao),
  'crescimento da R1 deixa folga da R2 pendente até todos os vencedores');
console.log('✓ tardio em sobra única preserva confronto publicado ou grava nova decisão');
