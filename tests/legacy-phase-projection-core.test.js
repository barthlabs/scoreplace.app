'use strict';
const { planLegacyPhaseProjection } = require('../functions/legacy-phase-projection-core');
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
r = planLegacyPhaseProjection(realLegacy, _window.FORMAT2.projectLegacyPhases);
ok(r.changed && r.phases[0].kind === 'classification', 'projetor real traduz liga legada para classificação canônica');
const legacySwiss = { format: 'Eliminatórias Simples', classifyFormat: 'swiss', currentStage: 'swiss', phases: [{ name: 'Classificatória', formatCode: 'liga', format: 'Suíço' }] };
r = planLegacyPhaseProjection(legacySwiss, _window.FORMAT2.projectLegacyPhases);
ok(r.changed && r.phases[0].classification && r.phases[0].classification.pairing && r.phases[0].classification.pairing.strategy === 'ranking_clusters', 'projetor traduz o marcador suíço legado para pareamento classificatório canônico');
const legacyMonarch = { phases: [{ name: 'Abertura', format: 'Rei/Rainha', drawMode: 'rei_rainha', reiRainha: true }] };
r = planLegacyPhaseProjection(legacyMonarch, _window.FORMAT2.projectLegacyPhases);
ok(r.changed && r.phases[0].kind === 'classification' && r.phases[0].formatCode === 'classification_rounds', 'Rei/Rainha legado sem código Liga continua uma classificatória');
ok(r.phases[0].classification && r.phases[0].classification.pairing && r.phases[0].classification.pairing.strategy === 'monarch_groups', 'Rei/Rainha legado preserva o modo de sorteio canônico');
console.log((fail ? '✗' : '✓') + ' legacy-phase-projection-core: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
