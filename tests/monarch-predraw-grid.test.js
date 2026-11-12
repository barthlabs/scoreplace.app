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
      setAttribute() {}, removeAttribute() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      remove() { elements.delete(id); this.isConnected = false; }
    };
  }
  const body = element();
  body.appendChild = child => { elements.set(child.id, child); };
  const document = { body, activeElement:null, createElement:element,
    getElementById:id => elements.get(id) || null, addEventListener() {} };
  const tournament = {
    id:'camis', participants:[], courtCount:8, gameDuration:30, callTime:5, warmupTime:5,
    phases:[{ drawMode:'rei_rainha' }, { drawMode:'sorteio' }],
    scheduleWindow:{ days:[{ day:'2026-11-13', startTime:'08:00', endTime:'21:00' },
      { day:'2026-11-14', startTime:'08:00', endTime:'21:00' }],
      interleavedPlan:plan }
  };
  const calls = [], draws = [];
  const window = { document, ScoreplacePhaseGridPlan:grid,
    _findTournamentById:id => id === 'camis' ? tournament : null,
    _isMulticategoria:() => false,
    FirestoreDB:{ _ehSandbox:() => false, async _callFn(name, payload) {
      calls.push({ name, payload }); return { ok:true };
    } },
    _sorteioDaFaseEhReiRainha:t => t.phases[0].drawMode === 'rei_rainha',
    matchMedia:() => ({ matches:true }) };
  window.window = window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/views/phase-grid-editor.js'), 'utf8'), window);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/views/tournaments-draw.js'), 'utf8'), window);

  assert.equal(window._requiresMonarchPreDrawReview(tournament), true,
    'grade salva sem mode exige revisão, como o documento real do CAMIS');
  window.showFinalReviewPanel('camis');
  assert.equal(elements.has('final-review-panel'), false, 'painel verde antigo não pode aparecer');

  assert.equal(elements.has('phase-grid-overlay'), true, 'Sortear abre a grade real');
  elements.get('phase-grid-overlay').remove();
  window.generateDrawFunction('camis');
  assert.equal(elements.has('phase-grid-overlay'), true,
    'atalho direto também abre a grade em vez de gerar os jogos');
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Revisar a grade antes do sorteio/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Grupo A1 · 3 jogos/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /JOGO 1 <small>\(1\/3\) · 08:00/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Quadra 8/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Salvar grade e sortear/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Concentrar antes/);
  assert.match(elements.get('phase-grid-overlay').innerHTML, /Espalhar ao longo do torneio/);
  assert.doesNotMatch(elements.get('phase-grid-overlay').innerHTML,
    /Editar configuração do torneio|Posicionar bloco selecionado|phase-grid-summary/);
  assert.deepEqual(draws, []);

  const last = window._phaseCallOrderState.tiles.at(-1);
  assert.equal(last.startTime, '20:20');
  window._phaseGridDrop({ preventDefault() {}, stopPropagation() {},
    dataTransfer:{ getData:() => last.id }, currentTarget:{ getBoundingClientRect:() => ({ top:0 }) },
    clientY:2220 }, 3);
  assert.equal(window._phaseCallOrderState.tiles.find(tile => tile.id === last.id).court, 3);
  let draggedId;
  const transfer = {
    setData(type, id) { assert.equal(type, 'text/plain'); draggedId = id; },
    getData:type => type === 'text/plain' ? draggedId : ''
  };
  window._phaseGridDragStart({ dataTransfer:transfer }, last.id);
  assert.equal(draggedId, last.id, 'o bloco deve carregar seu ID no arrasto');
  window._phaseGridDropDay({ preventDefault() {}, stopPropagation() {}, dataTransfer:transfer }, '2026-11-14');
  assert.equal(window._phaseCallOrderState.tiles.find(tile => tile.id === last.id).day, '2026-11-14');
  assert.equal(window._phaseCallOrderState.tiles.find(tile => tile.id === last.id).court, 3);
  assert.equal(window._phaseCallOrderState.activeDay, '2026-11-14');
  assert.equal(grid.validate(window._phaseCallOrderState.tiles, plan, tournament.scheduleWindow.days), null);
  const realGenerateDrawFunction = window.generateDrawFunction;
  window.generateDrawFunction = id => draws.push(id);
  const drawButton = element();
  drawButton.id = 'phase-grid-draw-button';
  const drawing = window._phaseGridSaveAndDraw();
  assert.equal(elements.has('phase-grid-draw-progress'), true, 'o primeiro clique já mostra progresso');
  assert.equal(drawButton.disabled, true, 'o botão impede novo clique enquanto sorteia');
  assert.match(drawButton.innerHTML, /btn-spinner.*(?:Preparando sorteio|Salvando grade)/,
    'o próprio botão mostra o spinner desde o primeiro clique');
  assert.match(drawButton.style.filter, /grayscale/, 'o botão fica cinza enquanto sorteia');
  await drawing;
  assert.equal(calls.length, 1, 'a alteração precisa ser salva no servidor antes do sorteio');
  assert.equal(calls[0].name, 'updateTournamentConfiguration');
  assert.equal(calls[0].payload.patch.scheduleWindow.interleavedPlan.editorVersion, 2);
  assert.equal(calls[0].payload.patch.scheduleWindow.interleavedPlan.blocks.some(block =>
    block.kind === 'elimination' && block.category === 'Fem Prata' && block.round === 4 &&
    block.day === '2026-11-14' && block.startTime === '20:20' && block.courts.includes(3)), true);
  assert.deepEqual(draws, ['camis']);
  assert.equal(elements.has('phase-grid-overlay'), true, 'a grade não some enquanto o servidor sorteia');
  assert.equal(elements.has('phase-grid-draw-progress'), true, 'o clique mostra progresso imediatamente');
  assert.match(drawButton.innerHTML, /btn-spinner.*Sorteando/,
    'o spinner persiste durante o sorteio no servidor');
  window._phaseGridDrawFinished('camis');
  assert.equal(elements.has('phase-grid-draw-progress'), false);
  assert.equal(drawButton.disabled, false, 'a resposta libera o botão');
  assert.equal(drawButton.style.filter, '', 'a resposta restaura a cor do botão');
  assert.equal(elements.has('phase-grid-overlay'), false, 'a grade só fecha depois do resultado');

  window.generateDrawFunction = realGenerateDrawFunction;
  window.ScoreplaceTeamCompetition = { configurationForTournament:() => ({ enabled:true }) };
  window._showTeamCompetitionDrawReview = () => false;
  assert.equal(window._openMonarchPreDrawReview('camis'), true);
  await window._phaseGridSaveAndDraw();
  assert.equal(elements.has('phase-grid-draw-progress'), false,
    'revisão por equipes indisponível solta o progresso e permite tentar novamente');
  assert.equal(elements.has('phase-grid-overlay'), true);
  window._closePhaseGridEditor();
  window._showTeamCompetitionDrawReview = () => true;
  assert.equal(window._openMonarchPreDrawReview('camis'), true);
  await window._phaseGridSaveAndDraw();
  assert.equal(elements.has('phase-grid-draw-progress'), false,
    'revisão por equipes aberta substitui a espera do sorteio');
  assert.equal(elements.has('phase-grid-overlay'), false);
  delete window.ScoreplaceTeamCompetition;

  assert.equal(window._openMonarchPreDrawReview('camis'), true);
  window._findTournamentById = () => null;
  await window._phaseGridSaveAndDraw();
  assert.equal(elements.has('phase-grid-draw-progress'), false,
    'torneio que sumiu antes do sorteio não prende a tela inteira');
  window._closePhaseGridEditor();
  window._findTournamentById = id => id === 'camis' ? tournament : null;

  tournament.scheduleWindow.interleavedPlan = null;
  assert.equal(window._openMonarchPreDrawReview('camis'), false);
  assert.deepEqual(draws, ['camis'], 'grade ausente não pode sortear');
  tournament.scheduleWindow.mode = 'participants';
  tournament.scheduleWindow.interleavedPlan = plan;
  assert.equal(window._requiresMonarchPreDrawReview(tournament), false,
    'agenda escolhida pelos participantes não usa a revisão da grade');
  console.log('Pré-sorteio: grade real, ajuste de quadra, gravação antes do sorteio');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
