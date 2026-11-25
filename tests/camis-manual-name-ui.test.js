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
const edits=[];
window._openTournamentAthleteEditor=(...args)=>edits.push(args);
clickName();
assert.deepEqual(edits[0],[tournamentId,'','manual-kelly','','Kelly Barth']);
assert.equal(dialogs.length,0,'nome do CAMIS usa o mesmo editor direto, sem menu intermediário');
assert.equal(inputs.length,0,'a entrada especial não cria outro formulário');
window._souOrganizador=()=>false;
clickName();assert.equal(edits.length,1,'não organizador não abre editor');
console.log('✓ CAMIS: nome e lápis encaminham ao mesmo editor direto com identidade manual');
