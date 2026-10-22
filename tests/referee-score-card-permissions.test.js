'use strict';
const assert = require('node:assert/strict');
const { sandbox: app } = require('./render-harness');
const split = require('../js/views/tournament-split-core.js');

const tournament = {
  id: 'tour_referee_test', name: 'Teste', format: 'Liga', creatorUid: 'org',
  resultEntry: ['organizer', 'referee'],
  arbitros: [{ uid: 'ref', status: 'confirmed' }],
  participants: [], matches: [], rounds: []
};
app.AppStore.tournaments = [tournament];
app._findTournamentById = () => tournament;
app.AppStore.currentUser = { uid: 'ref', displayName: 'Árbitro' };

const match = {
  id: 'match', p1: 'Time A', p2: 'Time B', team1Uids: ['a'], team2Uids: ['b'],
  category: 'Fem Light', scoreP1: 6, scoreP2: 3, winner: 'Time A'
};
const decided = app.renderMatchCard(match, true, tournament.id, 1);
assert.match(decided, /onclick="window\._editResultInline\('tour_referee_test','match'\)"/,
  'árbitro confirmado vê a correção do placar decidido');

const pending = app.renderMatchCard({ ...match, winner: null,
  pendingResult: { scoreP1: 6, scoreP2: 3, proposedBy: 'a' }
}, true, tournament.id, 1);
assert.doesNotMatch(pending, /_editPendingResult|_approveResult|_contestResult/,
  'árbitro sem lado no jogo não recebe ações da proposta pendente');

const partitioned = split.dividir({ ...tournament, matches: [] });
assert.deepEqual(partitioned.config.arbitros, tournament.arbitros,
  'a escala de árbitros fica no documento principal, lido nos pré-gates');
assert(!split.partesDe(tournament).includes('arbitros'),
  'a escala não é parte externa do torneio');
console.log('✓ cartão do árbitro: corrigir decidido, não editar pendente; escala no documento principal');
