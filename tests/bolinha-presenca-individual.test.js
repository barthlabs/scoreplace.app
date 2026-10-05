'use strict';
/* A bolinha de presença do card é de CADA atleta, não um resumo da dupla.
 * Trava a leitura que permite à organização ver exatamente quem já chegou. */
const assert = require('assert/strict');
const H = require('./render-harness');
const W = H.window;
let ok = 0;
const must = (condition, message) => { assert.ok(condition, message); ok++; console.log('  ✓ ' + message); };

console.log('\n──── bolinha de presença individual ────\n');
const now = Date.now();
const t = {
  id: 'presence-per-player', format: 'Liga', teamSize: 2, status: 'active',
  participants: [
    { uid: 'ana', displayName: 'Ana' }, { uid: 'bia', displayName: 'Bia' },
    { uid: 'clara', displayName: 'Clara' }, { uid: 'dani', displayName: 'Dani' }
  ],
  checkedIn: { ana: now, clara: now }, absent: {},
  scheduleWindow: { days: [{ day: '2026-10-22', startTime: '18:00', endTime: '23:59' }] },
  courtNames: ['Quadra 1'],
  matches: []
};
const m = {
  id: 'presence-per-player-r1', p1: 'Ana / Bia', p2: 'Clara / Dani',
  team1Uids: ['ana', 'bia'], team2Uids: ['clara', 'dani'],
  court: 'Quadra 1', scheduledAt: '2026-10-22T18:00:00-03:00', round: 1
};
t.matches = [m];
W.AppStore.tournaments = [t];
W.AppStore.currentUser = { uid: 'org', displayName: 'Organizador' };
W.AppStore.isOrganizer = () => true;
W._findTournamentById = (id) => String(id) === t.id ? t : null;

const html = String(W.renderMatchCard(m, true, t.id, 1));
const count = (needle) => (html.match(new RegExp(needle, 'g')) || []).length;
must(count('aria-label="Presente"') === 2, 'cada atleta presente recebe sua própria bolinha verde');
must(count('aria-label="Aguardando presença"') === 2, 'cada atleta ainda ausente recebe sua própria bolinha cinza');
must(!/title="Parcial"/.test(html), 'não resta bolinha resumindo a dupla como “parcial”');

console.log('\n✅ ' + ok + ' verificações');
