'use strict';
// Executa o painel REAL: a quota Neon usa safe() antes de renderizar os 24
// seletores de dia. Um teste que só procura texto no arquivo não vê o erro.
const { window: W, sandbox } = require('./render-harness');
const categories = ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'];
const counts = [24, 8, 8, 8, 8, 8];
let sequence = 1;
const participants = categories.flatMap((category, categoryIndex) => Array.from({ length: counts[categoryIndex] }, () => {
  const p1Seq = sequence;
  sequence += 2;
  return { category, fixedPairId: 'pair-' + p1Seq, p1Seq, p1Name: 'Atleta ' + p1Seq,
    p2Name: 'Atleta ' + (p1Seq + 1) };
}));
const tournament = {
  id: 'sb_neon_regression', startDate: '2026-10-22T18:00', endDate: '2026-10-23T22:40',
  categories, participants, courtCount: 6,
  teamCompetition: { enabled: true, teamCount: 8,
    teamNames: ['Blackout', 'Blast', 'Eclipse', 'Panic', 'Phantom', 'Venom', 'Volt', 'Vortex'],
    schedule: { enabled: true, gamesPerTeam: 3 } }
};
W._findTournamentById = () => tournament;
let overlay;
sandbox.document.createElement = () => {
  overlay = {
    style: {}, innerHTML: '', remove() {},
    querySelector(selector) { return selector === '#team-draw-cancel-top' ? {} : null; },
    querySelectorAll() { return []; }
  };
  return overlay;
};
let opened;
try { opened = W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded: true }); }
catch (error) { console.error('Painel Neon lançou:', error); process.exit(1); }
if (!opened || !overlay) throw new Error('Painel Neon não abriu');
const selectors = overlay.innerHTML.match(/<select data-pair-day=/g) || [];
if (selectors.length !== 24) throw new Error('Esperados 24 seletores de dia Fem Light; encontrados ' + selectors.length);
if (/O sorteio está bloqueado/.test(overlay.innerHTML)) throw new Error('Elenco Neon válido foi bloqueado');
console.log('✓ Painel Neon abriu com 64 duplas e 24 seletores de dia');
