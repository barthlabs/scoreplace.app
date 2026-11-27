'use strict';
const assert = require('node:assert/strict');
const H = require('./headless.js');
H.load('bracket-logic.js');
const t = {
  currentPhaseIndex:1,
  phases:[{kind:'classification'}, {kind:'elimination',thirdPlacePolicy:'optional_super8',thirdPlace:false}],
  matches:[{id:'semi-1',phaseIndex:1,round:1},{id:'semi-2',phaseIndex:1,round:1},
    {id:'final',phaseIndex:1,round:2}],
  thirdPlaceMatch:{id:'legacy-third',label:'BUI.THIRDPLACEMATCH',p1:'TBD',p2:'TBD'}
};
H.window._maybeGenerate3rdPlace(t);
assert.equal(t.thirdPlaceMatch,undefined,'terceiro lugar desativado elimina o marcador legado sem resultado');
H.window._maybeGenerate3rdPlace(t);
assert.equal(t.thirdPlaceMatch,undefined,'recalcular a chave não recria o marcador');
console.log('✓ terceiro lugar opcional não reaparece na chave');
