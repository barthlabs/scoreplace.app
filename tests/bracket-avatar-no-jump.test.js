'use strict';
const assert = require('node:assert/strict');
const H = require('./render-harness');
const W = H.sandbox;
require('./headless').load('participants.js');

(async () => {
  const t = { id: 'T', participants: [{ uid: 'u1', displayName: 'Pessoa' }],
    checkedIn: {}, checkedInConfirmed: {}, absent: {}, matches: [] };
  W.AppStore.tournaments = [t];
  W._bracketPresencePending = { 'T:u1': true };
  let rebuilds = 0;
  W._reRenderParticipantsStable = () => { rebuilds++; };
  W._updatePanelCardInPlace = () => false;
  W._updateCardPresenceInPlace = () => false;
  W._presenceBusyUntil = () => {};
  W.FirestoreDB = { setTournamentPresence: async () => ({ ok: true }) };
  const saved = await W._applyCheckInToggle('T', 'Pessoa', 'u1');
  assert.equal(saved, true);
  assert.equal(rebuilds, 0, 'o clique na foto não remonta a chave');
  assert.equal(!!t.checkedIn.u1, true, 'o recibo confirmado atualiza a presença local');
  delete W._bracketPresencePending['T:u1'];
  await W._applyCheckInToggle('T', 'Pessoa', 'u1');
  assert.equal(rebuilds, 1, 'outros controles preservam o fallback de atualização');
  console.log('✓ presença na foto confirma sem reconstruir a página');
})().catch(e => { console.error(e); process.exitCode = 1; });
