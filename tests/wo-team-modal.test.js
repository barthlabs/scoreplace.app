'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
let overlay;
const match = {
  id: 'm1', p1: 'Ana / Bia', p2: 'Clara / Dora',
  team1Uids: ['ana'], team2Uids: ['clara', 'dora'],
  team1Obj: { p1Uid: 'ana', p2ManualId: 'manual-bia', p2Name: 'Bia' },
  team2Obj: { p1Uid: 'clara', p2Uid: 'dora' }
};
const t = { id: 'T', format: 'Eliminatórias Simples', woClaims: [], matches: [match], participants: [] };
const doc = { getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, remove() {}, innerHTML: '' }), body: { appendChild(node) { overlay = node; } } };
const names = { ana: 'Ana', clara: 'Clara', dora: 'Dora' };
const window = {
  AppStore: { currentUser: { uid: 'organizer' } },
  _findTournamentById: () => t, _souOrganizador: () => true,
  _safeHtml: x => String(x == null ? '' : x), _safeText: x => String(x == null ? '' : x),
  _slotUids: (m, side) => (side === 'p1' ? m.team1Uids : m.team2Uids) || [],
  _slotUidsPositional: (m, side) => side === 'p1' ? ['ana', ''] : ['clara', 'dora'],
  _displayNameForUid: (uid, fallback) => names[uid] || fallback,
  _spCor: x => x
};
const context = vm.createContext({ window, document: doc, console, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync('js/views/wo-claim.js', 'utf8'), context);
function html() {
  window._woClaimChip(t, { scope: 'match', matchId: 'm1' });
  window._woOpenClaim('T', 'm|m1');
  assert(overlay, 'diálogo abriu');
  return overlay.innerHTML;
}
let rendered = html();
assert.equal((rendered.match(/W\.O\.<br>dupla/g) || []).length, 2, 'um botão para cada dupla');
assert(rendered.indexOf('Ana') < rendered.indexOf('Bia') && rendered.indexOf('Bia') < rendered.indexOf('Clara'), 'atletas ficam agrupadas por lado');
assert(rendered.includes('manual-bia') === false, 'identificador manual não vaza no HTML');
assert(rendered.includes('title="Inscrição manual sem conta vinculada"'), 'atleta manual aparece sem W.O. individual enganoso');
assert(rendered.includes("_woDeclareTeam('T','m|m1','ana')"), 'primeira ação aponta apenas o UID do seu lado');
assert(rendered.includes("_woDeclareTeam('T','m|m1','clara,dora')"), 'segunda ação aponta o outro lado');
assert(rendered.includes('align-self:stretch'), 'botão ocupa a altura dos dois nomes');
match.team2Uids = [];
rendered = html();
assert.equal((rendered.match(/W\.O\.<br>dupla/g) || []).length, 0, 'sem UID no adversário não mostra controle que falharia');
match.team2Uids = ['clara', 'dora'];
const calls = [], notices = [];
window.FirestoreDB = { _callFn: (name, payload) => {
  calls.push({ name, payload });
  if (name === 'previewTournamentTeamWO') return Promise.resolve({ hasEligiblePair: true });
  return Promise.resolve({ ok: true, result: { outcome: 'subbed' } });
} };
context.showNotification = (...args) => notices.push(args);
(async () => {
  html();
  window._woDeclareTeam('T', 'm|m1', 'ana');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(overlay.innerHTML.includes('Chamar dupla suplente'), 'prévia oferece escolha quando há dupla elegível');
  assert(overlay.innerHTML.includes('Vitória por W.O.'), 'organizador também pode escolher W.O.');
  assert.equal(calls[0].name, 'previewTournamentTeamWO');
  window._woDeclareTeam('T', 'm|m1', 'ana', 'substitute');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls[1].payload.teamOutcome, 'substitute');
  assert.equal(calls[1].payload.teamDecisionV2, true);
  assert(notices.some(item => item[1] === 'A dupla suplente assumiu a vaga.'), 'toast usa o resultado transacional');
  const successes = notices.filter(item => item[2] === 'success').length;
  window.FirestoreDB._callFn = (name, payload) => {
    calls.push({ name, payload });
    return name === 'previewTournamentTeamWO' ? Promise.resolve({hasEligiblePair:false})
      : Promise.reject(new Error('A dupla suplente não está mais disponível. Reabra a escolha.'));
  };
  window._woDeclareTeam('T', 'm|m1', 'ana', 'substitute');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(notices.filter(item => item[2] === 'success').length, successes,
    'estado obsoleto não mostra sucesso');
  assert.equal(calls[calls.length - 1].name, 'previewTournamentTeamWO', 'erro relê a prévia');
  console.log('wo-team-modal: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
