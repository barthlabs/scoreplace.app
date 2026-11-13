'use strict';
const assert = require('node:assert/strict');
const { advance, estimateLegacyDurations, estimateAfterFinalResult } = require('../functions-autodraw/monarch-court-series.js');
const occupancy = require('../functions-autodraw/vendor/court-occupancy.js');
const timing = require('../functions-autodraw/vendor/match-timing.js');
const resultCore = require('../functions-autodraw/result-core.js');
const writePlan = require('../functions-autodraw/write-plan.js');
const split = require('../functions-autodraw/vendor/tournament-split-core.js');
const receiptCore = require('../functions-autodraw/operation-receipt-core.js');

const now = '2026-11-13T11:35:00.000Z';
function series() {
  return [1, 2, 3].map(n => ({ id:'a' + n, _gameNum:n, isMonarch:true,
    category:'Fem Diamante', phaseIndex:0, round:1, monarchGroup:0,
    court:'Quadra 1', team1:['Ana','Bia'], team2:['Cris','Dani'] }));
}
const tournament = { callTime:5, warmupTime:5, gameDuration:30,
  scheduleWindow:{ days:[{ day:'2026-11-13' }] } };
let games = series();
games[0].courtCalledAt = '2026-11-13T11:00:00.000Z';
games[0].resultAt = now;
let handoff = advance(tournament, games[0], games, now, occupancy, timing, {});
assert.equal(handoff.matchId, 'a2');
assert.equal(games[1].court, 'Quadra 1');
assert.equal(timing.phaseAt(Date.parse(games[1].courtClockBaseAt), timing.config(tournament), Date.parse(now)).phase, 'game');
assert.equal(advance(tournament, games[0], games, now, occupancy, timing, {}), null, 'replay não chama de novo');
games[1].resultAt = '2026-11-13T12:00:00.000Z';
handoff = advance(tournament, games[1], games, games[1].resultAt, occupancy, timing, {});
assert.equal(handoff.matchId, 'a3');
games[2].resultAt = '2026-11-13T12:25:00.000Z';
assert.equal(advance(tournament, games[2], games, games[2].resultAt, occupancy, timing, {}), null,
  'depois do terceiro jogo a quadra é liberada');

games = series(); games[0].courtCalledAt = now; games[0].resultAt = now;
assert.equal(advance(tournament, games[0], games, now, occupancy, timing, { a1:now }), null,
  'jogo liberado manualmente não transfere a quadra');
games = series(); games[0].courtCalledAt = now; games[0].resultAt = now;
games.push({ id:'outro', court:'Quadra 1', courtCalledAt:now });
assert.equal(advance(tournament, games[0], games, now, occupancy, timing, {}), null,
  'ocupante de outro grupo impede a transferência');

// Exercise the same result engine called by applyMatchResult, not just a match
// with a manually inserted resultAt field.
games = series();
games.forEach(game => Object.assign(game, { p1:'Ana / Bia', p2:'Cris / Dora',
  p1Uid:'u1', p2Uid:'u3', team1Uids:['u1','u2'], team2Uids:['u3','u4'] }));
games[0].courtCalledAt = '2026-11-13T11:00:00.000Z';
const realTournament = { ...tournament, id:'tour_series', name:'Série', format:'Rei/Rainha',
  status:'active', creatorUid:'org', organizerEmail:'org@x.com', resultEntry:'organizer',
  participants:['u1','u2','u3','u4'].map(uid => ({ uid })), matches:games, history:[] };
const beforeResult = structuredClone(realTournament);
for (let i = 0; i < 3; i++) {
  const result = resultCore.applyResult(realTournament, { matchId:games[i].id,
    actor:{ uid:'org', email:'org@x.com' }, now:Date.parse(now) + i * 1800000,
    payload:{ s1:6, s2:3, useSets:false } });
  assert.equal(result.outcome, 'applied', 'placar real do jogo ' + (i + 1));
  const transfer = advance(realTournament, games[i], games, new Date(Date.parse(now) + i * 1800000).toISOString(),
    occupancy, timing, {});
  assert.equal(transfer && transfer.matchId || null, i < 2 ? games[i + 1].id : null);
  if (i === 0) {
    const plan = writePlan.planWrites(beforeResult, realTournament, { split,
      boundary:t => ({ persist:t }), agoraIso:now });
    const stored = plan.ops.filter(op => op.tipo === 'set' && op.colecao === 'matches');
    assert.deepEqual(stored.map(op => op.chave).sort(), ['a1','a2'],
      'a mesma escrita física inclui o placar do primeiro e a chamada do segundo jogo');
    assert.equal(stored.find(op => op.chave === 'a2').doc.jogo.courtCalledAt, now);
    const prepared = receiptCore.prepare({ operationId:'c9b16d60-3fe7-42dc-8df6-8dd4b3f8740b',
      actorUid:'org', parentPath:'tournaments/tour_series', kind:'score', target:'a1', payload:{ s1:6, s2:3 } });
    const replay = receiptCore.replay(receiptCore.document(prepared,
      { ok:true, outcome:'applied', courtAdvance:transfer }, Date.parse(now)));
    assert.equal(replay.courtAdvance.matchId, 'a2', 'reenvio mantém a transferência no recibo');
  }
}
const legacy = series();
legacy[0].courtCalledAt = '2026-11-13T11:00:00.000Z';
assert.equal(estimateLegacyDurations(tournament, legacy, '2026-11-13T12:25:00.000Z', timing), 25 * 60000);
assert.deepEqual(legacy.map(game => game.estimatedDurationMs), [25 * 60000, 25 * 60000, 25 * 60000],
  'tempo efetivo total da série anterior à correção é repartido em três partes iguais');
assert.equal(estimateLegacyDurations(tournament, legacy, '2026-11-13T13:25:00.000Z', timing), null,
  'lançamento tardio dos placares não aumenta uma duração já fixada no encerramento');
const current = series();
current[0].courtCalledAt = legacy[0].courtCalledAt;
current[0].monarchTimingMode = 'perGame';
assert.equal(estimateLegacyDurations(tournament, current, '2026-11-13T12:25:00.000Z', timing), null,
  'série nova preserva os relógios individuais');
const scoredLegacy = series();
scoredLegacy[0].courtCalledAt = legacy[0].courtCalledAt;
scoredLegacy.forEach(game => { game.resultAt = '2026-11-13T12:25:00.000Z'; });
assert.equal(estimateAfterFinalResult(tournament, scoredLegacy[2], scoredLegacy,
  '2026-11-13T12:25:00.000Z', timing, occupancy), 25 * 60000,
  'lançar o terceiro placar também conclui o rateio sem precisar encerrar a quadra');
console.log('Série Rei/Rainha: jogos 1→2→3 na mesma quadra e tempo legado repartido');
