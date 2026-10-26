'use strict';
const { planLegacyPhaseProjection, verifyProjectedDocument } = require('../functions/legacy-phase-projection-core');
const { toFirestore, fromFirestore } = require('../scripts/phase-projection-firestore-core');
const { _window } = require('../functions-autodraw/draw-core.js');
let pass = 0, fail = 0;
function ok(value, message) { if (value) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }
const projector = (t) => {
  const phases = Array.isArray(t.phases) && t.phases.length ? t.phases.map((p) => Object.assign({}, p)) : [{ name: t.format || 'Eliminatória' }];
  let changed = !Array.isArray(t.phases) || !t.phases.length;
  phases.forEach((p) => { if (!p.kind) { p.kind = 'elimination'; p.elimination = { bracketType: 'single' }; changed = true; } });
  return { phases, changed, created: !Array.isArray(t.phases) || !t.phases.length };
};
const legacyWithScore = { format: 'Eliminatórias Simples', matches: [{ id: 'm1', scoreP1: 6 }] };
const legacyBefore = JSON.stringify(legacyWithScore);
let r = planLegacyPhaseProjection(legacyWithScore, projector);
ok(r.changed && r.reason === 'created-from-legacy', 'legado sem fases recebe plano de projeção');
ok(r.phases.length === 1 && r.phases[0].kind === 'elimination', 'plano contém somente a semântica canônica de fase');
ok(JSON.stringify(legacyWithScore) === legacyBefore, 'planejamento não altera jogo, placar ou documento de entrada');
r = planLegacyPhaseProjection({ phases: [{ kind: 'classification', classification: { structure: 'groups' } }], rounds: [{ matches: [{ id: 'm2' }] }] }, projector);
ok(!r.changed && r.reason === 'already-canonical', 'torneio já canônico não recebe escrita');
let threw = false; try { planLegacyPhaseProjection({}, () => ({ phases: [], changed: true })); } catch (_) { threw = true; }
ok(threw, 'projeção vazia aborta antes de qualquer escrita');
const realLegacy = { format: 'Liga', ligaMode: 'round_robin', rounds: [{ matches: [{ id: 'm3', scoreP1: 6 }] }] };
r = planLegacyPhaseProjection(realLegacy, _window.FORMAT2.projectLegacyPhases, { tournamentId: 't1', updateTime: 'u1' });
ok(r.changed && r.phases[0].kind === 'classification', 'projetor real traduz liga legada para classificação canônica');
const sameReceipt = planLegacyPhaseProjection(realLegacy, _window.FORMAT2.projectLegacyPhases, { tournamentId: 't1', updateTime: 'u1' });
ok(r.fingerprint === sameReceipt.fingerprint && r.protectedFingerprint, 'projeção emite recibo estável e fingerprint de campos protegidos');
const defaultReceipt = planLegacyPhaseProjection(realLegacy, _window.FORMAT2.projectLegacyPhases);
const repeatedDefaultReceipt = planLegacyPhaseProjection(realLegacy, _window.FORMAT2.projectLegacyPhases);
ok(defaultReceipt.fingerprint === repeatedDefaultReceipt.fingerprint && defaultReceipt.protectedFingerprint === repeatedDefaultReceipt.protectedFingerprint,
  'recibo também é estável para chamadores legados sem opções');
const legacySwiss = { format: 'Eliminatórias Simples', classifyFormat: 'swiss', currentStage: 'swiss', phases: [{ name: 'Classificatória', formatCode: 'liga', format: 'Suíço' }] };
r = planLegacyPhaseProjection(legacySwiss, _window.FORMAT2.projectLegacyPhases);
ok(r.changed && r.phases[0].classification && r.phases[0].classification.pairing && r.phases[0].classification.pairing.strategy === 'ranking_clusters', 'projetor traduz o marcador suíço legado para pareamento classificatório canônico');
const canonicalSwiss = Object.assign({}, legacySwiss, { phases: r.phases });
r = planLegacyPhaseProjection(canonicalSwiss, _window.FORMAT2.projectLegacyPhases);
ok(!r.changed && r.reason === 'already-canonical', 'pareamento classificatório já canônico não volta a parecer pendente por identidade de objeto');
const legacyMonarch = { phases: [{ name: 'Abertura', format: 'Rei/Rainha', drawMode: 'rei_rainha', reiRainha: true }] };
r = planLegacyPhaseProjection(legacyMonarch, _window.FORMAT2.projectLegacyPhases);
ok(r.changed && r.phases[0].kind === 'classification' && r.phases[0].formatCode === 'classification_rounds', 'Rei/Rainha legado sem código Liga continua uma classificatória');
ok(r.phases[0].classification && r.phases[0].classification.pairing && r.phases[0].classification.pairing.strategy === 'monarch_groups', 'Rei/Rainha legado preserva o modo de sorteio canônico');
const hybridFmt2 = {
  fmt2: { classifAtiva: true },
  format: 'Liga', classifyFormat: 'swiss', currentStage: 'swiss',
  phases: [{ name: 'Classificatória', formatCode: 'liga', format: 'Suíço' }],
  rounds: [{ matches: [{ id: 'preserved-score', scoreP1: 6, scoreP2: 3 }] }]
};
const hybridScores = JSON.stringify(hybridFmt2.rounds);
r = planLegacyPhaseProjection(hybridFmt2, _window.FORMAT2.projectLegacyPhases);
ok(r.changed && r.phases[0].kind === 'classification' && r.phases[0].formatCode === 'classification_rounds',
  'fmt2 não impede a tradução de uma fase híbrida legada');
ok(JSON.stringify(hybridFmt2.rounds) === hybridScores,
  'tradução do híbrido preserva jogos e placares materializados');
const legacyRoundLeague = {
  format: 'Liga', enrollmentMode: 'individual',
  phases: [{ name: 'Pontos Corridos', formatCode: 'liga' }]
};
r = planLegacyPhaseProjection(legacyRoundLeague, _window.FORMAT2.projectLegacyPhases);
ok(r.changed && r.phases[0].classification.pairing.strategy === 'ranking_clusters' &&
  r.phases[0].classification.pairing.entryMode === 'rotate',
  'Liga legada individual vira classificatória por clusters dinâmicos, sem modo paralelo');
const legacyFixedLeague = {
  format: 'Liga', enrollmentMode: 'teams',
  phases: [{ name: 'Duplas fixas', formatCode: 'liga', fixedPairs: true }]
};
r = planLegacyPhaseProjection(legacyFixedLeague, _window.FORMAT2.projectLegacyPhases);
ok(r.changed && r.phases[0].classification.pairing.strategy === 'ranking_clusters' &&
  r.phases[0].classification.pairing.entryMode === 'fixed',
  'Liga legada de equipes preserva a dupla fixa na classificação canônica');

const rawOptionalPhase = {
  kind: 'classification',
  classification: { structure: 'groups', optional: undefined, slots: [1, undefined, 3] },
  drawMode: undefined,
  explicitNull: null
};
const optionalBefore = { format: 'Liga', matches: [{ id: 'm4', scoreP1: 6 }] };
const optionalProjector = (t) => ({
  phases: Array.isArray(t.phases) && t.phases.length ? t.phases : [rawOptionalPhase],
  changed: !(Array.isArray(t.phases) && t.phases.length),
  created: !(Array.isArray(t.phases) && t.phases.length)
});
const optionalPlan = planLegacyPhaseProjection(optionalBefore, optionalProjector, { tournamentId: 'optional', updateTime: 'u2' });
ok(!Object.hasOwn(optionalPlan.phases[0], 'drawMode') &&
  !Object.hasOwn(optionalPlan.phases[0].classification, 'optional') &&
  optionalPlan.phases[0].classification.slots[1] === null &&
  optionalPlan.phases[0].classification.slots.length === 3 &&
  optionalPlan.phases[0].explicitNull === null,
  'plano remove undefined recursivo de objetos, conserva posições de array e null explícito');
ok(Object.hasOwn(rawOptionalPhase, 'drawMode') &&
  Object.hasOwn(rawOptionalPhase.classification, 'optional') &&
  rawOptionalPhase.classification.slots[1] === undefined,
  'normalização da projeção não muta a fonte');
const roundtrip = fromFirestore(toFirestore(optionalPlan.phases));
const optionalAfter = Object.assign({}, optionalBefore, { phases: roundtrip });
let optionalVerified = false;
try { optionalVerified = verifyProjectedDocument('optional', optionalBefore, optionalAfter, optionalPlan, optionalProjector).ok; }
catch (_) { optionalVerified = false; }
ok(optionalVerified && JSON.stringify(roundtrip) === JSON.stringify(optionalPlan.phases),
  'roundtrip REST preserva a projeção e passa pela verificação pós-CAS');
ok(optionalAfter.matches[0].scoreP1 === 6, 'roundtrip de fases não altera placar protegido');
const directPayload = toFirestore({ optional: undefined, nested: { absent: undefined, present: null }, positions: [1, undefined, 3] });
ok(!Object.hasOwn(directPayload.mapValue.fields, 'optional') &&
  !Object.hasOwn(directPayload.mapValue.fields.nested.mapValue.fields, 'absent') &&
  directPayload.mapValue.fields.nested.mapValue.fields.present.nullValue === null &&
  directPayload.mapValue.fields.positions.arrayValue.values[1].nullValue === null,
  'serializer REST omite undefined só em objeto e mantém nullValue em array');
const persistedWithNulls = { format: 'Eliminatórias Simples', phases: [{ kind: 'elimination',
  formatCode: 'elim_simples', drawMode: null, reiRainha: null, rounds: null,
  gruposCount: null, gruposClassified: null, elimination: { bracketType: 'single' } }] };
const nullPlan = planLegacyPhaseProjection(persistedWithNulls, _window.FORMAT2.projectLegacyPhases);
ok(!nullPlan.changed, 'fase eliminatória já persistida com campos opcionais null permanece canônica');
console.log((fail ? '✗' : '✓') + ' legacy-phase-projection-core: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
