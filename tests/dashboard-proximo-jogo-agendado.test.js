'use strict';
// Um jogo de sexta marcado e com adversário vence uma eliminatória sem data
// e ainda dependente do vencedor de outro jogo (regressão do Confra J195).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/dashboard.js'), 'utf8');
const tournamentSource = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments.js'), 'utf8');
const start = source.indexOf('window._dashboardNextMatchCompare = function');
const end = source.indexOf('// A tela só solicita o fecho', start);
assert(start >= 0 && end > start, 'comparador da dashboard localizado');
const context = { window: {} };
vm.runInNewContext(source.slice(start, end), context);
const compare = context.window._dashboardNextMatchCompare;
const within = context.window._dashboardWithinTournamentCompare;
const selectNext = context.window._dashboardSelectNextMatch;
const entry = (m, tId) => ({ item: { m, tId } });
const friday = entry({ id: 'neon-friday', round: 1, _gameNum: 20,
  p1: 'Dupla A', p2: 'Dupla B', scheduledAt: '2026-10-23T18:00:00-03:00', scheduledKind: 'organizer' }, 'neon');
const later = entry({ id: 'later', round: 1, _gameNum: 1,
  p1: 'Dupla A', p2: 'Dupla C', scheduledAt: '2026-10-30T18:00:00-03:00', scheduledKind: 'organizer' });
const confra = entry({ id: '195', round: 5, _gameNum: 195,
  p1: 'Dupla A', p2: 'TBD', deadline: '2026-11-05T23:00:00-03:00' }, 'confra');
const readyNoDate = entry({ id: 'ready', round: 2, _gameNum: 40,
  p1: 'Dupla A', p2: 'Dupla D' });
const estimated = entry({ id: 'estimate', round: 1, _gameNum: 10,
  p1: 'Dupla A', p2: 'Dupla E', scheduledAt: '2026-10-22T18:00:00-03:00', scheduledKind: 'estimate' });

assert.equal([confra, friday].sort(compare)[0], friday,
  'sexta marcada vence J195 sem adversário, mesmo com prazo em novembro');
assert.deepEqual([confra, later, readyNoDate, estimated, friday].sort(compare),
  [estimated, friday, later, readyNoDate, confra],
  'jogos datados em ordem temporal, jogáveis sem data e adversário pendente');
assert.equal([confra, readyNoDate].sort(compare)[0], readyNoDate,
  'partida jogável sem data vence confronto dependente de outra partida');
const earlierRound = entry({ id: 'r1', round: 1, _gameNum: 1,
  p1: 'Dupla A', p2: 'Dupla B' }, 'same-tournament');
const laterRound = entry({ id: 'r2', round: 2, _gameNum: 2,
  p1: 'Dupla A', p2: 'Dupla C', scheduledAt: '2026-10-23T18:00:00-03:00' }, 'same-tournament');
assert.equal([laterRound, earlierRound].sort(within)[0], earlierRound,
  'na mesma chave, R1 jogável continua antes da R2 mesmo sem data');
const firstT1 = entry({ id: 't1-r1', round: 1, p1: 'Dupla A', p2: 'TBD' }, 't1');
const secondT1 = entry({ id: 't1-r2', round: 2, p1: 'Dupla A', p2: 'Dupla B',
  scheduledAt: '2026-10-23T18:00:00-03:00' }, 't1');
const firstT2 = entry({ id: 't2-r1', round: 1, p1: 'Dupla A', p2: 'Dupla C',
  scheduledAt: '2026-10-24T18:00:00-03:00' }, 't2');
for (const order of [
  [secondT1, firstT2, firstT1], [secondT1, firstT1, firstT2],
  [firstT2, secondT1, firstT1], [firstT2, firstT1, secondT1],
  [firstT1, secondT1, firstT2], [firstT1, firstT2, secondT1]
]) assert.equal(selectNext(order), firstT2,
  'três jogos de dois torneios escolhem o mesmo representante em qualquer ordem de entrada');
assert.equal([entry({ id: 'loser', round: 1, p1: 'Dupla A', p2: 'Perdedor do jogo 186' }), readyNoDate].sort(compare)[0], readyNoDate,
  'slot do perdedor de outra partida também não é adversário definido');
const navStart = tournamentSource.indexOf('window._nextParticipantTournamentMatchTarget = function');
const navEnd = tournamentSource.indexOf('// Entrada genérica da dashboard:', navStart);
assert(navStart >= 0 && navEnd > navStart, 'resolvedor do destino de torneio localizado');
const tournamentContext = { window: {
  _dashboardWithinTournamentCompare: within,
  _collectAllMatches: t => t.matches,
  _userTeamInMatch: (_t, m) => m.owner === 'me' ? 1 : 0,
  AppStore: { currentUser: { uid: 'me' } }
} };
vm.runInNewContext(tournamentSource.slice(navStart, navEnd), tournamentContext);
const tournament = { matches: [
  { ...confra.item.m, owner: 'me' }, { ...friday.item.m, owner: 'me' }
] };
assert.equal(tournamentContext.window._nextParticipantTournamentMatchTarget(tournament).matchId,
  'neon-friday', 'entrada genérica no torneio escolhe o mesmo próximo jogo datado');
console.log('✓ dashboard-proximo-jogo-agendado: 12 cenários');
