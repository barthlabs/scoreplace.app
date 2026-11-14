'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = source.indexOf('function _materializeInterleavedReadyCategories(');
const end = source.indexOf('\n// A chamada de fase é usada pelo navegador.', start);
assert(start > 0 && end > start);

for (const fits of [false, true]) {
  const group = { category:'Fem Prata', name:'Grupo A1', matches:[
    { id:'g1', winner:'p1' }, { id:'g2', winner:'p1' }, { id:'g3', winner:'p2' }
  ] };
  let scheduleApplied = 0;
  const tournament = {
    id:'tour_future', currentPhaseIndex:0, combinedCategories:['Fem Prata'],
    phases:[{}, {}], matches:group.matches.slice(),
    scheduleWindow:{ interleavedPlan:{ blocks:[
      { kind:'groups', category:'Fem Prata', courts:['Quadra 1'] },
      { kind:'elimination', category:'Fem Prata', courts:['Quadra 1'] }
    ] } }
  };
  const drawWindow = {
    _phasesEngine:{
      prevPhaseGroups:() => [group], projectPhaseCfg:() => ({}),
      materializeNextPhase:(t) => {
        t.matches.push({ id:'elim-1', category:'Fem Prata', phaseIndex:1,
          p1:'Ana', p2:'Bia' });
        t.phaseCategoryMaterialized = { 'Fem Prata':{ at:'2026-11-14T10:00:00Z' } };
        return { ok:true };
      }
    },
    _schGradeEstimada:(t) => ({ cabe:fits, interleaved:true,
      slots:fits ? t.matches.map(m => ({ matchId:m.id })) : [] }),
    _schAplicarGrade:() => { scheduleApplied++; },
    _collectAllMatches:t => t.matches,
    _assignGlobalGameNumbers:t => t.matches.forEach((m, i) => { m._gameNum = i + 1; })
  };
  const context = vm.createContext({
    drawWindow, phaseStandingsFn:() => [],
    _buildPhaseTieRuntime:() => ({ overall:false, pools:[{ id:'A1', group }] }),
    _phaseTieCore:{ resolvePhaseTies:() => ({ status:'ready', orderedPools:[{ id:'A1', rows:[] }] }) },
    HttpsError:Error, console:{ warn:() => {} }, Map, Set, Number, String, Array
  });
  vm.runInContext(source.slice(start, end), context);
  const result = vm.runInContext('_materializeInterleavedReadyCategories', context)(
    tournament, tournament.id, '2026-11-14T10:00:00Z');
  assert.equal(result[0], 'Fem Prata', 'a chave avança com a classificação decidida');
  assert.equal(tournament.matches.find(m => m.id === 'elim-1')._gameNum, 4);
  assert.equal(scheduleApplied, fits ? 1 : 0,
    'o horário só é reaplicado quando todos os jogos cabem na grade');
}
console.log('✓ resultado não é bloqueado por estimativa de agenda sem capacidade');
