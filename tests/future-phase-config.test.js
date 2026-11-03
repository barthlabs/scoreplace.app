'use strict';
const assert = require('node:assert/strict');
const F = require('../functions-autodraw/draw-core.js')._window.FORMAT2;
const future = require('../functions-autodraw/future-phase-config-core');
const validate = require('../functions-autodraw/format-intent-validation-core').validateNewFormatIntent;
class FormatError extends Error { constructor(code, message) { super(message); this.code = code; } }

const original = F.defaultConfig('Beach Tennis');
original.grupos = 2;
const compiled = F.compileToPhases(original, { sport: 'Beach Tennis' });
const t = { rulesContractVersion: 2, status: 'active', sport: 'Beach Tennis', teamSize: 2,
  fmt2: compiled.cfg, phases: compiled.phases, currentPhaseIndex: 0, _phaseMaterialized: 0,
  matches: [{ id: 'played-in-current-phase', phaseIndex: 0, winner: 'A' }] };
const proposed = structuredClone(t.fmt2);
proposed.classificados = 4;
proposed.eliminatoria.linhas = 3;
proposed.eliminatoria.nomes = ['Céu', 'Mar', 'Terra'];
const oldPhase = structuredClone(t.phases[0]);
const result = future.plan(t, proposed, F.compileToPhases, validate, FormatError);
assert.ok(result);
assert.equal(result.phases[0].mapping.length, 3);
assert.deepEqual(t.phases[0], oldPhase, 'a fase sorteada não é tocada');
assert.equal(t.matches[0].winner, 'A');
assert.equal(future.plan({ ...t, currentPhaseIndex: 1 }, proposed, F.compileToPhases, validate, FormatError), null);
assert.equal(future.plan({ ...t, matches: [{ phaseIndex: 1 }] }, proposed, F.compileToPhases, validate, FormatError), null);
assert.equal(future.plan({ ...t, phaseTieDecisions: { 0: { tie: { status: 'pending' } } } },
  proposed, F.compileToPhases, validate, FormatError), null);
const changedCurrent = structuredClone(proposed); changedCurrent.grupos = 4;
assert.equal(future.plan(t, changedCurrent, F.compileToPhases, validate, FormatError), null);
const removedFuture = structuredClone(proposed); removedFuture.eliminatoria.ativa = false;
assert.equal(future.plan(t, removedFuture, F.compileToPhases, validate, FormatError), null);
console.log('future-phase-config: OK');
