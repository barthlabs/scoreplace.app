/* A ficha usa a porta paginada; falha não vira lista vazia ou fallback parcial. */
'use strict';
const assert = require('node:assert/strict');
const { window, load } = require('./headless.js');
load('bracket-model.js');
load('tournaments-enrollment-report.js');

const uid = 'u';
const row = { tournamentId: 't', matchId: 'm', p1: 'Eu / P', p2: 'A / B',
  scoreP1: 6, scoreP2: 2, winner: 'Eu / P', playerUids: [uid],
  team1Uids: [uid, 'p'], team2Uids: ['a', 'b'] };
window._slotUids = (game, side) => side === 'p1' ? game.team1Uids || [] : game.team2Uids || [];
window._slotUidsPositional = window._slotUids;

(async () => {
  let called = 0;
  window.FirestoreDB = {
    loadMyMatchResults: async targetUid => { called++; assert.equal(targetUid, uid); return [row]; },
    db: { collectionGroup: () => { throw new Error('consulta global no navegador'); },
      collection: () => { throw new Error('fallback local automático'); } }
  };
  const items = await window._lzJogosDoScoreplace(uid, 'Eu');
  assert.equal(called, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].result, 'V');

  window.FirestoreDB.loadMyMatchResults = async () => { throw Object.assign(new Error('offline'),
    { code: 'functions/unavailable' }); };
  await assert.rejects(window._lzJogosDoScoreplace(uid, 'Eu'), /offline/);
  assert.equal((await window._lzJogosDoScoreplace('', 'Eu')).length, 0);
  console.log('✓ ficha usa porta autorizada e propaga falha sem fallback parcial');
})().catch(error => { console.error(error); process.exitCode = 1; });
