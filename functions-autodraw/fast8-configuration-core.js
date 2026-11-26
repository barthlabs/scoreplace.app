'use strict';

const alternation = require('./vendor/group-alternation');
const copy = value => JSON.parse(JSON.stringify(value));
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);

function validateIntent(t, ErrorType, existingPhases) {
  const cfg=t && t.fmt2, value=cfg?.eliminatoria?.thirdPlaceEnabled;
  if (value !== undefined && (typeof value !== 'boolean' || !alternation.eightConfig(cfg,category=>alternation.population(t,category))))
    throw new ErrorType('invalid-argument','A opção de terceiro lugar é exclusiva do Super 8 e do Fast 8.');
  for (const phase of existingPhases ? [] : t.phases || []) {
    if (phase && phase.thirdPlacePolicy !== undefined &&
        (phase.thirdPlacePolicy !== 'optional_super8' || phase.kind !== 'elimination' || !alternation.eightConfig(cfg,category=>alternation.population(t,category)) ||
          phase.thirdPlace !== (value !== false)))
      throw new ErrorType('invalid-argument','A política de terceiro lugar deve corresponder ao formato compilado.');
  }
  if (t.scheduleWindow && t.scheduleWindow.groupAlternation !== undefined && typeof t.scheduleWindow.groupAlternation !== 'boolean')
    throw new ErrorType('invalid-argument','Alternância de grupos inválida.');
  if (alternation.enabled(t)) {
    const settings=alternation.config(t);
    if (!settings.eligible) throw new ErrorType('failed-precondition',settings.reason);
  }
}

// Usado tanto pelo endpoint autenticado quanto pela aplicação administrativa
// autorizada: nenhuma identidade fictícia e nenhuma escrita em jogos.
function prepare(before, incoming, context, ErrorType, drawn) {
  const patch=copy(incoming);
  if(patch.scheduleWindow) delete patch.scheduleWindow.groupAlternation;
  if(patch.fmt2 && Array.isArray(patch.fmt2.rotationCategoryRules)) patch.fmt2.rotationCategoryRules.forEach(rule=>{
    const old=before.fmt2?.rotationCategoryRules?.find(row=>row.category===rule.category);
    if(old && Object.hasOwn(old,'groupAlternation') && !Object.hasOwn(rule,'groupAlternation')) rule.groupAlternation=old.groupAlternation;
  });
  const flags=cfg=>(cfg?.rotationCategoryRules || []).filter(rule=>rule.groupAlternation===true).map(rule=>String(rule.category)).sort();
  const modeChanged=patch.fmt2 && !equal(flags(before.fmt2),flags(patch.fmt2));
  if(modeChanged && drawn) throw new ErrorType('failed-precondition','Altere a alternância antes de gerar os jogos da classificação.');
  if(modeChanged) {
    const target=Object.assign({},before,patch);
    require('./format-intent-validation-core').validateNewFormatIntent(patch.fmt2,ErrorType,before,before.teamSize,target.combinedCategories,
      category=>alternation.population(target,category));
    const compiled=context.FORMAT2.compileToPhases(patch.fmt2,{sport:target.sport,categories:target.combinedCategories || [],
      population:category=>alternation.population(target,category)});
    patch.fmt2=compiled.cfg;
    patch.phases=compiled.phases.map((phase,index)=>{
      const merged=Object.assign({},before.phases?.[index] || {},phase);
      if(!Object.hasOwn(phase,'thirdPlacePolicy')) delete merged.thirdPlacePolicy;
      return merged;
    });
    const schedule=Object.assign({},before.scheduleWindow || {},patch.scheduleWindow || {});
    delete schedule.groupAlternation;
    if(schedule.interleavedPlan) {
      const effective=Object.assign({},before,patch,{scheduleWindow:schedule});
      const proposed=context.ScoreplacePhaseGridPlan.suggestProjected(effective,schedule.days,context);
      if(proposed.error) throw new ErrorType('failed-precondition',proposed.error);
      schedule.interleavedPlan=proposed.plan;
    }
    patch.scheduleWindow=schedule;
  }
  const previous=before.fmt2 && before.fmt2.eliminatoria;
  if (patch.fmt2 && alternation.eightConfig(patch.fmt2,category=>alternation.population(Object.assign({},before,patch),category)) && previous && Object.hasOwn(previous,'thirdPlaceEnabled') &&
      patch.fmt2.eliminatoria && !Object.hasOwn(patch.fmt2.eliminatoria,'thirdPlaceEnabled'))
    patch.fmt2.eliminatoria.thirdPlaceEnabled=previous.thirdPlaceEnabled;
  const next=patch.fmt2 && patch.fmt2.eliminatoria;
  if (next && Object.hasOwn(next,'thirdPlaceEnabled') && alternation.eightConfig(patch.fmt2,category=>alternation.population(Object.assign({},before,patch),category))) next.terceiro=next.thirdPlaceEnabled!==false;
  const changed=!!next && alternation.eightConfig(patch.fmt2,category=>alternation.population(Object.assign({},before,patch),category)) && (next.thirdPlaceEnabled !== false) !== (!previous || previous.thirdPlaceEnabled !== false);
  const effective=Object.assign({},before,patch,{scheduleWindow:Object.assign({},before.scheduleWindow || {},patch.scheduleWindow || {})});
  if(modeChanged) delete effective.scheduleWindow.groupAlternation;
  // Fases existentes são recompiladas abaixo quando a intenção muda. Somente
  // fases fornecidas pelo cliente são validadas nesta etapa.
  validateIntent(effective,ErrorType,!patch.phases);
  let future=null;
  if (changed) {
    if (drawn && typeof context._collectAllMatches==='function' && context._collectAllMatches(before).some(m=>Number(m.phaseIndex || 0)>0))
      throw new ErrorType('failed-precondition','A disputa de terceiro lugar só pode mudar antes de gerar a eliminatória.');
    if (drawn) future=require('./future-phase-config-core').plan(before,patch.fmt2,context.FORMAT2.compileToPhases,
      require('./format-intent-validation-core').validateNewFormatIntent,ErrorType);
    else {
      require('./format-intent-validation-core').validateNewFormatIntent(patch.fmt2,ErrorType,before,before.teamSize);
      const compiled=context.FORMAT2.compileToPhases(patch.fmt2,{sport:before.sport,categories:before.combinedCategories || [],population:category=>alternation.population(Object.assign({},before,patch),category)});
      future={fmt2:compiled.cfg,phases:compiled.phases.slice(1),gruposClassified:compiled.topLevel.gruposClassified,politicaDaChave:compiled.topLevel.politicaDaChave};
    }
    if (!future) throw new ErrorType('failed-precondition','A disputa de terceiro lugar só pode mudar antes de gerar a eliminatória.');
    const preserved=['courtCount','courtNames','gameDuration','callTime','warmupTime','maxParticipants','maxParticipantsPerCategory','maxParticipantsByCategory','combinedCategories'];
    if (drawn && preserved.some(key=>Object.hasOwn(patch,key) && !equal(patch[key],before[key])))
      throw new ErrorType('failed-precondition','Altere a disputa de terceiro lugar sem modificar a classificação publicada.');
    effective.fmt2=future.fmt2; effective.phases=[before.phases[0]].concat(future.phases);
    if (before.scheduleWindow && before.scheduleWindow.interleavedPlan) {
      if (patch.scheduleWindow && patch.scheduleWindow.interleavedPlan &&
          !equal(patch.scheduleWindow.interleavedPlan,before.scheduleWindow.interleavedPlan))
        throw new ErrorType('failed-precondition','Atualize o aplicativo para editar a fase futura do Super 8 ou Fast 8.');
      try {
        const plan=context.ScoreplacePhaseGridPlan.rebuildFuture(before,effective,context);
        patch.scheduleWindow=Object.assign({},patch.scheduleWindow || {},{interleavedPlan:plan});
      } catch(error) { throw new ErrorType('failed-precondition',error.message); }
    }
    patch.fmt2=future.fmt2;
  }
  return {patch,futureOnly:drawn && changed,future};
}

function plan(before, intent, context, ErrorType, drawn) {
  const fmt2=copy(before.fmt2);
  if (Object.hasOwn(intent,'thirdPlaceEnabled')) fmt2.eliminatoria.thirdPlaceEnabled=intent.thirdPlaceEnabled;
  const incoming={fmt2};
  if (Object.hasOwn(intent,'groupAlternation')) {
    if(drawn) throw new ErrorType('failed-precondition','Migre a alternância antes de gerar os jogos.');
    const rules=fmt2.rotationCategoryRules;
    if(!Array.isArray(rules) || !rules.length) throw new ErrorType('failed-precondition','Confira as categorias dos grupos.');
    rules.forEach(rule=>{rule.groupAlternation=intent.groupAlternation===true;});
    incoming.scheduleWindow=copy(before.scheduleWindow || {});
    delete incoming.scheduleWindow.groupAlternation;
  }
  const prepared=prepare(before,incoming,context,ErrorType,drawn);
  const after=Object.assign({},copy(before),prepared.patch,
    {scheduleWindow:Object.assign({},before.scheduleWindow || {},prepared.patch.scheduleWindow || {})});
  if(Object.hasOwn(intent,'groupAlternation')) delete after.scheduleWindow.groupAlternation;
  if (prepared.future) after.phases=[before.phases[0]].concat(prepared.future.phases);
  validateIntent(after,ErrorType);
  return {after,patch:prepared.patch,future:prepared.future};
}

module.exports={prepare,plan,validateIntent};
