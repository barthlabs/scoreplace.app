'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const web = require('./headless');
web.load('tournaments-draw.js');
const draw = require('../functions-autodraw/draw-core');
const validate = require('../functions-autodraw/format-intent-validation-core').validateNewFormatIntent;
const categories = ['Azul', 'Verde'];
const rules = [
  { category:'Azul', groupFormation:{ mode:'size', value:6 }, gamesPerUnit:3 },
  { category:'Verde', groupFormation:{ mode:'count', value:1 }, gamesPerUnit:5 }
];
function config() {
  const cfg = draw._window.FORMAT2.defaultConfig('Beach Tennis');
  Object.assign(cfg, { disputa:'individual', parceria:null, grupos:1, groupCategoryRules:structuredClone(rules) });
  cfg.rodadas.modo = 'todos';
  cfg.eliminatoria.ativa = false;
  return cfg;
}
const participants = categories.flatMap((category, index) =>
  Array.from({length:index ? 8 : 12}, (_, i) => ({
    displayName:category + i, uid:category + i, category, categories:[category], ligaActive:true
  })));
function tournament() {
  return { id:'unit-test-group-category', sport:'Beach Tennis', fmt2:config(), combinedCategories:categories,
    participants:structuredClone(participants), rulesContractVersion:2, storageCanonico:true, status:'closed', matches:[], rounds:[] };
}
const cfg = config();
validate(cfg, Error, undefined, 1, categories);
const legacyEdit = config();
delete legacyEdit.groupCategoryRules;
validate(legacyEdit, Error, { fmt2:cfg, combinedCategories:categories }, 1);
assert.deepEqual(legacyEdit.groupCategoryRules, rules);
assert.throws(() => validate({...legacyEdit, groupCategoryRules:undefined}, Error, {fmt2:cfg}, 1, categories));
const incompatible = {...legacyEdit, disputa:'dupla', parceria:'rei_rainha'};
delete incompatible.groupCategoryRules;
assert.throws(() => validate(incompatible, Error, {fmt2:cfg, combinedCategories:categories}, 2));
const removed = {...incompatible, groupCategoryRules:[]};
validate(removed, Error, {fmt2:cfg, combinedCategories:categories}, 2);
assert.deepEqual(removed.groupCategoryRules, []);
for (const changes of [
  [rules[0], rules[0]], [rules[0]], [rules[0], {...rules[1], category:'Outra'}],
  [rules[0], {...rules[1], groupFormation:{mode:'size', value:1}}],
  [rules[0], {...rules[1], groupFormation:{mode:'count', value:0}}],
  [rules[0], {...rules[1], gamesPerUnit:2.4}]
]) assert.throws(() => validate({...cfg,groupCategoryRules:changes}, Error, undefined, 1, categories));
const webT = tournament(), serverT = tournament();
assert(draw.compileFromFmt2(serverT).ok);
Object.assign(webT, web.window.FORMAT2.compileToPhases(webT.fmt2, {categories, sport:webT.sport}).topLevel);
webT.phases = web.window.FORMAT2.compileToPhases(webT.fmt2, {categories, sport:webT.sport}).phases;
assert.equal(webT.phases[0].classification.structure,'groups');
const phase = web.window._buildPhase0Cfg(webT);
const random = Math.random;
let generated;
try {
  Math.random = () => 0.43;
  vm.runInContext('Math.random = () => 0.43', web.sandbox);
  const pool = web.window._buildPhase0Pool(webT, false, 1);
  generated = web.E.generatePhase(pool, phase, {t:webT, catOf:p => p.category, idPrefix:'web'});
  assert(draw.drawInitial(serverT, {idStamp:1}).ok);
} finally { Math.random = random; }
function pairs(matches) {
  return Array.from(matches, m => [m.category, m.groupIdx, ...[m.p1, m.p2].sort()].join('|')).sort();
}
assert.deepEqual(pairs(generated.matches), pairs(serverT.matches));
for (const [category, groupCount, games, expected] of [['Azul', 2, 3, 18], ['Verde',1,5,20]]) {
  const matches = serverT.matches.filter(m => m.category === category);
  assert.equal(matches.length, expected);
  assert.equal(new Set(matches.map(m => m.groupIdx)).size, groupCount);
  const count = new Map();
  for (const m of matches) for (const player of [m.p1, m.p2]) count.set(player, (count.get(player) || 0) + 1);
  assert([...count.values()].every(n => n === games));
  assert(!matches.some(m => m.isBye));
}
const format = web.window.FORMAT2;
const unequal = {...cfg, groupCategoryRules:[{category:'Azul', groupFormation:{mode:'count',value:2}, gamesPerUnit:3}]};
assert.match(format.groupPlanForCategory(unequal,'Azul',13,false).error,/incompatível/);
assert.equal(format.groupPlanForCategory(unequal,'Azul',13,true).assessment.waitlist,1);
assert.equal(format.groupPlanForCategory(unequal,'Azul',0,false).error,'');
const invalidTournament = tournament();
invalidTournament.fmt2 = unequal;
invalidTournament.participants.push({...participants[0],uid:'Azul12',displayName:'Azul12'});
assert(draw.compileFromFmt2(invalidTournament).ok);
assert.throws(() => draw.drawInitial(invalidTournament, {idStamp:1}), /incompatível/);
console.log('✓ Paridade de grupos por categoria na web e no servidor, 18/20 partidas, grau e compatibilidade de clientes.');

for (let n = 2; n <= 12; n++) {
  const pool = Array.from({length:n}, (_, i) => ({uid:String(i),displayName:'P' + i}));
  for (let games = 1; games <= 3 * (n - 1); games++) {
    const phase = {gruposCount:1, classification:{structure:'groups', schedule:{gamesPerUnit:games, mode:'structured', allowRepeat:true}}};
    if (n * games % 2) {
      assert.throws(() => web.E.genGroupsFromPool(pool, phase, 'p'), /incompatível/);
      continue;
    }
    const built = web.E.genGroupsFromPool(pool, phase, 'p');
    const ids = new Set(), pairs = new Map(), occupied = new Set(), degrees = new Map();
    for (const m of built.matches) {
      assert(!ids.has(m.id)); ids.add(m.id);
      assert.notEqual(m.p1, m.p2);
      const edge = [m.p1, m.p2].sort().join('|'); pairs.set(edge,(pairs.get(edge) || 0) + 1);
      for (const player of [m.p1, m.p2]) {
        const key = m.round + '|' + player;
        assert(!occupied.has(key)); occupied.add(key);
        degrees.set(player,(degrees.get(player) || 0) + 1);
      }
    }
    assert.equal(built.matches.length,n * games / 2);
    assert([...degrees.values()].every(d => d === games));
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const count = pairs.get([pool[a].displayName,pool[b].displayName].sort().join('|')) || 0;
      assert(count === Math.floor(games / (n - 1)) || count === Math.ceil(games / (n - 1)));
    }
  }
}
const squads = tournament();
squads.fmt2 = config();
Object.assign(squads.fmt2, {disputa:'dupla', parceria:'fixa', formacaoDupla:'manual', groupCategoryRules:
  categories.map((category,i) => ({category,groupFormation:{mode:'size',value:4},gamesPerUnit:i ? 7 : 14,allowRepeat:true}))});
squads.participants = categories.flatMap(category => Array.from({length:4},(_,i) => ({
  displayName:category+i+'A / '+category+i+'B', category, categories:[category], fixedPair:true,
  participants:['A','B'].map(k => ({uid:category+i+k, name:category+i+k, displayName:category+i+k}))
})));
assert(draw.compileFromFmt2(squads).ok);
assert(draw.drawInitial(squads,{idStamp:7}).ok);
assert.equal(squads.matches.filter(m => m.category === 'Azul').length,28);
assert.equal(squads.matches.filter(m => m.category === 'Verde').length,14);
const rotating = tournament();
Object.assign(rotating.fmt2, {disputa:'dupla', parceria:'rotation_groups_8', rotationAllowRepeatPartners:true,
  groupFormation:{mode:'size',value:8}, groupCategoryRules:[], rotationCategoryRules:categories.map(category => ({category,rounds:14,destination:'ranking'}))});
rotating.fmt2.rodadas.n = 14;
rotating.participants = rotating.participants.filter(p => Number(p.displayName.replace(/\D/g,'')) < 8);
validate(rotating.fmt2, Error, null, 2, categories);
assert.throws(() => validate({...rotating.fmt2,rotationAllowRepeatPartners:false},Error,null,2,categories));
assert.throws(() => validate({...rotating.fmt2,rotationAllowRepeatPartners:'false'},Error,null,2,categories));
assert(draw.compileFromFmt2(rotating).ok);
assert(draw.drawInitial(rotating,{idStamp:5}).ok);
for (const category of categories) {
  const matches = rotating.matches.filter(m => m.category === category);
  assert.equal(matches.length,28);
  const partners = new Set();
  for (let round = 1; round <= 14; round++) {
    const atRound = matches.filter(m => m.round === round);
    assert.equal(atRound.length,2);
    const teams = atRound.flatMap(m => [m.team1Uids,m.team2Uids]);
    assert.equal(new Set(teams.flat()).size,8);
    teams.forEach(team => partners.add([...team].sort().join('|')));
  }
  assert(partners.size < 56, 'um ciclo de 14 necessariamente repete parceiros');
}
assert.equal(draw.drawInitial(rotating,{idStamp:5}).reason,'already-drawn');
const legacySchedule = {gamesPerUnit:7,mode:'free'};
const legacyConfig = config();
legacyConfig.classificationSchedule = legacySchedule;
delete legacyConfig.groupCategoryRules;
assert.deepEqual(format.normalize(legacyConfig,'Beach Tennis').classificationSchedule.gamesPerUnit,7);
assert.equal(JSON.stringify(format.normalize(legacyConfig,'Beach Tennis').classificationSchedule),JSON.stringify(legacySchedule));
const updated = structuredClone(legacyConfig);
validate(updated, Error, {fmt2:{...legacyConfig,classificationSchedule:{...legacySchedule,allowRepeat:true}}},1,categories);
assert.equal(updated.classificationSchedule.allowRepeat,true);
assert.throws(() => validate({...updated,classificationSchedule:{...legacySchedule,allowRepeat:null}},Error,null,1,categories));
console.log('✓ Repetição convencional e rotativa, ciclos exatos pares/ímpares, 7/14 partidas por unidade, regras antigas conservadas.');

assert.throws(() => web.E.genGroupsFromPool([{displayName:'Único'}], {
  gruposCount:1, classification:{structure:'groups',schedule:{gamesPerUnit:14,allowRepeat:true}}
}, 'single'), /duas unidades/);
assert.throws(() => web.E.genGroupsFromPool(participants.slice(0,12), {
  gruposCount:1, maxDrawOperations:400, classification:{structure:'groups',schedule:{gamesPerUnit:128,allowRepeat:true}}
}, 'excess'), /capacidade de publicação/);

web.load('super-eight-core.js');
const ids = Array.from({length:8}, (_, i) => 'Pessoa ' + i);
const repeatedWeb = web.window.ScoreplaceSuperEight.buildWithRepeats(ids, 14, () => 0.23);
const repeatedServer = draw._window.ScoreplaceSuperEight.buildWithRepeats(ids, 14, () => 0.23);
assert.equal(JSON.stringify(repeatedWeb),JSON.stringify(repeatedServer));
assert.deepEqual(repeatedServer.rounds[0],repeatedServer.rounds[1]);
assert.throws(() => draw._window.ScoreplaceSuperEight.buildWithRepeats(ids.slice(1), 14), /oito atletas distintos/);
