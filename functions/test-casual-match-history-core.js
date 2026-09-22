const core = require('./casual-match-history-core.js');

let ok = 0, fail = 0;
function t(label, value) {
  if (value) { ok++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
}

const canonical = {
  status: 'finished', finishedAt: '2026-09-21T15:00:00.000Z', sport: 'Beach Tennis', isDoubles: true,
  result: { winner: 2, summary: '4-6 6-3 10-8', sets: [
    { gamesP1: 4, gamesP2: 6 }, { gamesP1: 6, gamesP2: 3 }, { gamesP1: 10, gamesP2: 8 }
  ] },
  players: [
    { uid: 'a', team: 1, name: 'Nome que não entra' }, { uid: 'b', team: 1, photoURL: 'https://x' },
    { uid: 'c', team: 2, name: 'Outro nome' }, { uid: 'd', team: 2 }
  ],
  playerUids: ['a', 'b', 'c', 'd']
};

console.log('\n──── casual-match-history-core ────');
const out = core.buildCasualRecord('room_1', canonical);
t('gera ID determinístico', out && out.matchId === 'casual_room_1');
t('deriva todos os destinatários dos slots UID', out && out.recipients.join('|') === 'a|b|c|d');
t('não persiste nome ou foto do documento casual', out && out.record.players.every((p) =>
  Object.keys(p).join('|') === 'uid|team'));
t('preserva resultado e lados canônicos', out && out.record.winnerTeam === 2 && out.record.scoreSummary === '4-6 6-3 10-8');
t('recusa partida ainda não encerrada', core.buildCasualRecord('room_1', Object.assign({}, canonical, { status: 'active' })) === null);
t('recusa vencedor fora do contrato', core.buildCasualRecord('room_1', Object.assign({}, canonical, { result: { winner: 3, summary: 'x' } })) === null);
t('recusa UID presente nos dois lados', core.buildCasualRecord('room_1', Object.assign({}, canonical, {
  players: [{ uid: 'a', team: 1 }, { uid: 'a', team: 2 }]
})) === null);

console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
if (fail) process.exit(1);
console.log('✅ casual-match-history-core: OK');
