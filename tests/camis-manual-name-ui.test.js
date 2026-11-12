'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/views/participants.js','utf8');
const start = source.indexOf('window._camisManualNameLinkHtml = function');
const end = source.indexOf('window._startTournament = function',start);
assert(start > 0 && end > start);

const calls = [], dialogs = [], inputs = [], notices = [], listeners = {};
let replaceClick, cancelClick;
const modal = { querySelector(selector) {
  if (selector === '#camis-replace-name-action') return { addEventListener(_name,fn) { replaceClick = fn; } };
  if (selector === '#confirm-cancel-btn') return { click() { cancelClick = true; } };
  return null;
} };
const document = {
  addEventListener(name,fn) { listeners[name] = fn; },
  getElementById() { return modal; }
};
const tournamentId = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const t = { id:tournamentId,participants:[{manualParticipantId:'manual-kelly',displayName:'Kelly Barth'}] };
const window = { _findTournamentById:() => t,_souOrganizador:() => true,
  _safeHtml:value => value,AppStore:{tournaments:[t]},FirestoreDB:{loadTournamentById:async () => t},
  _callCF:async (name,payload) => { calls.push({name,payload});return {data:{ok:true}}; }
};
const ctx = {window,document,setTimeout:fn => fn(),
  showConfirmDialog:(title,body,onConfirm,onCancel,options) => dialogs.push({title,body,onConfirm,onCancel,options}),
  showInputDialog:(title,body,onSubmit,options) => inputs.push({title,body,onSubmit,options}),
  showNotification:(title,body,type) => notices.push({title,body,type}),_reRenderParticipantsStable() {} };
vm.runInNewContext(source.slice(start,end),ctx,{filename:'camis-name-action'});
const linked = window._camisManualNameLinkHtml(t,'Kelly Barth','<b>Kelly Barth</b>');
assert(linked.includes('data-camis-manual-id="manual-kelly"'));
assert(linked.includes('<b>Kelly Barth</b>'));
assert(!linked.includes('data-bracket-presence-action'),'nome não intercepta o botão da foto');
assert.equal(window._camisManualNameLinkHtml(t,'Outra','<b>Outra</b>'),'<b>Outra</b>');

function clickName() {
  let prevented = false;
  listeners.click({ target:{ closest:() => ({getAttribute:key => ({
    'data-camis-tid':tournamentId,'data-camis-old-name':'Kelly Barth',
    'data-camis-manual-id':'manual-kelly'}[key] || '')}) },
    preventDefault() { prevented = true; },stopPropagation() {},stopImmediatePropagation() {} });
  assert(prevented,'nome manual abre a tela, sem depender do lápis');
}
(async()=>{
  clickName();
  assert(dialogs.at(-1).body.includes('Substituir atleta por outra pessoa'));
  dialogs.at(-1).onConfirm();
  assert(inputs.at(-1).title.includes('Corrigir nome'));
  inputs.at(-1).onSubmit('Kelly B.');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[0].name,'editCamisManualParticipant');
  assert.equal(calls[0].payload.action,'rename');
  assert.equal(calls[0].payload.manualParticipantId,'manual-kelly');
  assert.equal(Object.hasOwn(calls[0].payload,'uid'),false);

  clickName();
  replaceClick();
  assert.equal(cancelClick,true);
  assert(inputs.at(-1).title.includes('Substituir atleta'));
  inputs.at(-1).onSubmit('Pessoa Nova');
  dialogs.at(-1).onConfirm();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[1].payload.action,'replace');
  assert.equal(calls[1].payload.newName,'Pessoa Nova');
  assert.equal(Object.hasOwn(calls[1].payload,'uid'),false);
  window.FirestoreDB.loadTournamentById = async () => null;
  clickName();
  dialogs.at(-1).onConfirm();
  inputs.at(-1).onSubmit('Kelly Corrigida');
  await new Promise(resolve => setImmediate(resolve));
  assert(notices.some(item => item.title === 'Atleta salva' && item.type === 'warning'),
    'falha de leitura após commit pede atualização da tela');
  assert(!notices.some(item => item.title === 'Edição não concluída'),
    'leitura posterior falhou, mas a escrita já foi confirmada');
  console.log('✓ CAMIS: toque no nome oferece correção ou substituição manual, sem UID');
})().catch(error => { console.error(error);process.exitCode=1; });
