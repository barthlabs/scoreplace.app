'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const grid = require('../js/domain/phase-grid-plan.js');
const plan = require('./fixtures/camis-interleaved-plan.js');

async function run() {
  const elements = new Map();
  function element() {
    let id = '';
    return {
      get id() { return id; }, set id(value) { id = value; elements.set(value, this); },
      innerHTML:'', style:{}, hidden:false, isConnected:true,
      querySelector() { return null; }, querySelectorAll() { return []; },
      remove() { elements.delete(id); this.isConnected = false; }
    };
  }
  const body = element();
  body.appendChild = child => { elements.set(child.id, child); };
  const document = { body, activeElement:null, createElement:element,
    getElementById:id => elements.get(id) || null, addEventListener() {} };
  const tournament = {
    id:'camis', courtCount:8, gameDuration:30, callTime:5, warmupTime:5,
    scheduleWindow:{ mode:'organizer', days:[{ day:'2026-11-13', startTime:'08:00', endTime:'21:00' }],
      interleavedPlan:plan }
  };
  const calls = [], draws = [];
  const window = { document, ScoreplacePhaseGridPlan:grid,
    _findTournamentById:id => id === 'camis' ? tournament : null,
    FirestoreDB:{ _ehSandbox:() => false, async _callFn(name, payload) {
      calls.push({ name, payload }); return { ok:true };
    } },
    generateDrawFunction:id => draws.push(id), matchMedia:() => ({ matches:true }) };
  window.window = window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/views/phase-grid-editor.js'), 'utf8'), window);

  assert.equal(window._openMonarchPreDrawReview('camis'), true);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Revisar a grade antes do sorteio/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Grupo A1 · 3 jogos/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /JOGO 1 <small>\(1\/3\) · 08:00/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Quadra 8/);
  assert.deepEqual(draws, []);

  const last = window._phaseCallOrderState.tiles.at(-1);
  assert.equal(last.startTime, '20:20');
  window._phaseGridDrop({ preventDefault() {}, stopPropagation() {},
    dataTransfer:{ getData:() => last.id }, currentTarget:{ getBoundingClientRect:() => ({ top:0 }) },
    clientY:2220 }, 3);
  assert.equal(window._phaseCallOrderState.tiles.find(tile => tile.id === last.id).court, 3);
  assert.equal(grid.validate(window._phaseCallOrderState.tiles, plan, tournament.scheduleWindow.days), null);
  await window._phaseGridSaveAndDraw();
  assert.equal(calls.length, 1, 'a alteração precisa ser salva no servidor antes do sorteio');
  assert.equal(calls[0].name, 'updateTournamentConfiguration');
  assert.equal(calls[0].payload.patch.scheduleWindow.interleavedPlan.editorVersion, 2);
  assert.equal(calls[0].payload.patch.scheduleWindow.interleavedPlan.blocks.some(block =>
    block.kind === 'elimination' && block.category === 'Fem Prata' && block.round === 4 &&
    block.startTime === '20:20' && block.courts.includes(3)), true);
  assert.deepEqual(draws, ['camis']);
  assert.equal(elements.has('phase-grid-overlay'), false);

  tournament.scheduleWindow.interleavedPlan = null;
  assert.equal(window._openMonarchPreDrawReview('camis'), false);
  assert.deepEqual(draws, ['camis'], 'grade ausente não pode sortear');
  console.log('Pré-sorteio: grade real, ajuste de quadra, gravação antes do sorteio');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
