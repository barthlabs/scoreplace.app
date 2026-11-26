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

// Fast 8 / terceiro opcional: o mesmo planner usado pela ficha e pelo admin.
{
  const {w,G,scenario,D}=require('./universal-phase-grid.test');
  const core=require('../functions-autodraw/fast8-configuration-core');
  const draft=scenario(['Divisão B','Divisão C'],[16,32],[8,8],[7,7],[4,2]);
  const compiled=F.compileToPhases(draft.fmt2,{sport:draft.sport,categories:draft.combinedCategories});
  const original=Object.assign({},draft,{fmt2:compiled.cfg,phases:compiled.phases,rulesContractVersion:2,
    currentPhaseIndex:0,status:'active',matches:[{id:'synthetic-played',phaseIndex:0,winner:'A'}]});
  const proposal=G.suggestProjected(original,D,w);
  assert(!proposal.error,proposal.error);
  original.scheduleWindow={mode:'organizer',days:D,interleavedPlan:proposal.plan};
  const before=structuredClone(original);
  const changed=core.plan(original,{groupAlternation:true,thirdPlaceEnabled:false},w,FormatError,true);
  assert(changed.after.scheduleWindow.groupAlternation);
  assert.equal(changed.after.fmt2.eliminatoria.thirdPlaceEnabled,false);
  assert.equal(changed.after.phases[1].thirdPlace,false);
  assert.equal(changed.after.phases[1].thirdPlacePolicy,'optional_super8');
  assert.deepEqual(changed.after.phases[0],before.phases[0]);
  assert.deepEqual(changed.after.matches,before.matches);
  assert.deepEqual(changed.after.scheduleWindow.interleavedPlan.blocks.filter(b=>b.phaseIndex===0),
    before.scheduleWindow.interleavedPlan.blocks.filter(b=>b.phaseIndex===0));
  G.assertPlan(changed.after,changed.after.scheduleWindow.interleavedPlan,D,w);
  assert.equal(changed.after.scheduleWindow.interleavedPlan.totalGames,proposal.plan.totalGames-2,
    'elimina exatamente a disputa de terceiro de cada categoria, preservando os jogos da classificação');
  assert.deepEqual(original,before,'planejar não altera o torneio de origem');
  const oldClient=structuredClone(changed.after.fmt2);
  delete oldClient.eliminatoria.thirdPlaceEnabled;oldClient.eliminatoria.terceiro=true;
  const keep=core.prepare(changed.after,{fmt2:oldClient},w,FormatError,true);
  assert.equal(keep.patch.fmt2.eliminatoria.thirdPlaceEnabled,false,'cliente antigo não religa o terceiro');
  const leaving=F.defaultConfig('Beach Tennis');leaving.parceria='fixa';
  const outside=core.prepare(changed.after,{fmt2:leaving,scheduleWindow:{groupAlternation:false}},w,FormatError,false);
  assert.equal(outside.patch.fmt2.eliminatoria.thirdPlaceEnabled,undefined,
    'sair do formato de oito não herda uma opção incompatível');

  assert.throws(()=>core.plan({...original,currentPhaseIndex:1},{thirdPlaceEnabled:false},w,FormatError,true),
    /antes de gerar a eliminatória/);
  assert.throws(()=>core.validateIntent({fmt2:{parceria:'fixa',eliminatoria:{thirdPlaceEnabled:false}}},FormatError),
    /exclusiva/);
  assert.throws(()=>core.validateIntent({fmt2:{parceria:'fixa'},phases:[{kind:'elimination',thirdPlacePolicy:'optional_super8',thirdPlace:false}]},FormatError),
    /corresponder/);
  assert.equal(w.ScoreplaceGroupAlternation.thirdPlace({thirdPlace:false}),true,'false histórico não desliga o jogo');
  console.log('Fast 8 config: fase publicada preservada, grade futura recomposta, terceiro opcional e compatibilidade OK');
}

{
  const {sameSnapshot,hash}=require('../scripts/configure-fast8');
  const frozen={rootVersion:'one',courtVersion:'two',partsHash:'three'};
  sameSnapshot(frozen,{...frozen});
  for (const key of Object.keys(frozen)) assert.throws(()=>sameSnapshot(frozen,{...frozen,[key]:'changed'}),/mudou desde/);
  assert.equal(hash({b:2,a:1}),hash({a:1,b:2}));
  assert.equal(hash({stamp:{toJSON:()=>({seconds:123,nanoseconds:456})}}),hash({stamp:{seconds:123,nanoseconds:456}}),
    'backup serializado preserva o hash de timestamps');
}
