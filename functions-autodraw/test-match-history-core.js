const core = require('./match-history-core.js');

let ok = 0, fail = 0;
function t(label, cond, detail) {
  if (cond) { ok++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

const tournament = { id: 'tour_1', name: 'Torneio de teste', sport: 'Beach Tennis' };
function match(overrides) {
  return Object.assign({
    id: 'match_1', team1Uids: ['uid_a', 'uid_b'], team2Uids: ['uid_c', 'uid_d'],
    winner: 'rótulo que não decide', winnerUids: ['uid_a', 'uid_b'],
    scoreP1: 6, scoreP2: 4, resultAt: 10
  }, overrides || {});
}

console.log('\n──── match-history-core ────');

{
  const out = core.buildTournamentRecord(tournament, match(), '2026-09-21T12:00:00.000Z');
  t('deriva ID determinístico', out && out.record.matchId === 't_tour_1_match_1');
  t('destinatários vêm só dos slots UID', out && out.recipients.join('|') === 'uid_a|uid_b|uid_c|uid_d');
  t('não persiste nome ou foto de pessoa', out && out.record.players.every((p) => Object.keys(p).sort().join('|') === 'team|uid'));
  t('usa winnerUids, não o rótulo', out && out.record.winnerTeam === 1);
  t('deriva placar e estatística mínima canônicos', out && out.record.scoreSummary === '6-4' && out.record.stats.team1.games === 6 && out.record.stats.team2.games === 4);
}

{
  const out = core.buildTournamentRecord(tournament, match({ winnerUids: ['uid_c', 'uid_d'], sets: [
    { gamesP1: 6, gamesP2: 3 }, { gamesP1: 2, gamesP2: 6, tiebreak: { pointsP1: 7, pointsP2: 9 } }, { gamesP1: 10, gamesP2: 8, fixedSet: true }
  ] }), '2026-09-21T12:00:00.000Z');
  t('preserva sets derivados, incluindo tiebreak normalizado', out && out.record.winnerTeam === 2 && out.record.scoreSummary === '6-3 2-6(7) 10-8' && out.record.sets[1].tiebreak.p2 === 9);
}

[
  ['sem winnerUids não infere vencedor por nome/placar', match({ winnerUids: undefined })],
  ['winnerUids que não é um time canônico é recusado', match({ winnerUids: ['uid_a'] })],
  ['bye não gera estatística', match({ isBye: true })],
  ['W.O. não gera registro de jogo', match({ wo: true })],
  ['slot sem UID não recebe projeção parcial', match({ team2Uids: [] })]
].forEach(([label, data]) => t(label, core.buildTournamentRecord(tournament, data, '2026-09-21T12:00:00.000Z') === null));

{
  const out = core.buildTournamentRecord(tournament, match({ draw: true, winner: 'draw', winnerUids: undefined }), '2026-09-21T12:00:00.000Z');
  t('empate canônico é aceito sem vencedor', out && out.record.winnerTeam === 0);
}

console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
if (fail) process.exit(1);
console.log('✅ match-history-core: OK');
