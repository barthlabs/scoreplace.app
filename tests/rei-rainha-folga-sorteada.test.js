'use strict';
const assert = require('node:assert/strict');
const { window: W } = require('./headless');

function tournament(count, policy) {
  return {
    id: 'ranking-folgas-' + count, rulesContractVersion: 2, format: 'Liga', teamSize: 2,
    ligaRoundFormat: 'rei_rainha', ligaDrawMode: 'standard',
    rankingRemainderPolicy: policy, status: 'active', rounds: [], matches: [],
    participants: Array.from({ length: count }, (_, i) => ({
      uid: 'u' + i, displayName: 'P' + i, ligaActive: true
    }))
  };
}

const defaultCfg = W.FORMAT2.defaultConfig('Beach Tennis');
assert.equal(defaultCfg.rankingRemainderPolicy, 'lottery_average');
assert.equal(W.FORMAT2.normalize({ disputa: 'dupla', parceria: 'rei_rainha' }, 'Beach Tennis').rankingRemainderPolicy,
  'waitlist_legacy', 'configuração histórica sem campo não muda de regra');
const compiled = W.FORMAT2.compileToPhases({ ...defaultCfg, parceria: 'rei_rainha' }, { sport: 'Beach Tennis' });
assert.equal(compiled.topLevel.rankingRemainderPolicy, 'lottery_average');
assert.equal(compiled.phases[0].rankingRemainderPolicy, 'lottery_average');

const t = tournament(7, 'lottery_average');
for (let round = 0; round < 3; round++) {
  W._generateNextRound(t, { rnd: () => 0.5 });
  const current = t.rounds[round];
  assert.ok(current, 'rodada gerada');
  assert.equal(current.monarchGroups.length, 1, 'um quarteto completo');
  const sitouts = current.matches.filter(m => m.isSitOut && m.sitOutReason === 'remainder');
  assert.equal(sitouts.length, 3, 'três ativos de folga, sem completar quarteto');
  assert.ok(sitouts.every(m => m.p1Uid && !m.winner), 'folgas identificadas e sem vitória fictícia');
  current.matches.filter(m => !m.isSitOut).forEach(m => {
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
  });
}
const counts = Object.values(t.sitOutHistory._default_);
assert.equal(counts.length, 7, 'todos folgaram antes de um atleta receber segunda folga');
assert.equal(counts.reduce((sum, n) => sum + n, 0), 9);
assert.equal((t.monarchWaitlist && t.monarchWaitlist._default_ || []).length, 0,
  'sobra ativa não vai para lista de espera');
assert.equal(W._healMonarchRemainderToWaitlist(t), false, 'cura legada preserva as folgas novas');
assert.equal(W._onParticipantAddedToMonarchRound(t, 'Novo Atleta', null).formed, 0,
  'inscrição tardia não completa o quarteto depois do sorteio');

const average = tournament(5, 'lottery_average');
for (let round = 0; round < 2; round++) {
  W._generateNextRound(average, { rnd: () => 0.5 });
  average.rounds[round].matches.filter(m => !m.isSitOut).forEach(m => {
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
  });
}
assert.equal(W._playerRoundStats(average, 'P0', null).satOutCompensable, 1);
assert.equal(W._playerRoundStats(average, 'P0', null).played, 1);
assert.equal(W._computeStandings(average).find(s => s.name === 'P0').points,
  2 * W._computeAvgPointsPerRound(average, 'P0', null),
  'a folga da primeira rodada recebe a média atual depois que o atleta joga');

for (const n of [1, 2, 3]) {
  const few = tournament(n, 'lottery_average');
  W._generateNextRound(few, { rnd: () => 0.5 });
  assert.equal(few.rounds[0].monarchGroups.length, 0);
  assert.equal(few.rounds[0].matches.filter(m => m.isSitOut).length, n,
    'com menos de quatro ativos ninguém é pareado em jogo irregular');
}

const legacy = tournament(7, undefined);
legacy.rulesContractVersion = 1;
W._generateNextRound(legacy, { rnd: () => 0.5 });
assert.equal(legacy.rounds[0].matches.filter(m => m.isSitOut).length, 0,
  'torneio anterior mantém a lista de espera');
assert.equal((legacy.monarchWaitlist._default_ || []).length, 3);

const drawCore = require('../functions-autodraw/draw-core.js');
const serverTournament = Object.assign(tournament(7, 'lottery_average'), {
  sport: 'Beach Tennis', fmt2: { ...defaultCfg, parceria: 'rei_rainha',
    eliminatoria: { ...defaultCfg.eliminatoria, ativa: false } },
  groups: [], checkedIn: {}, absent: {}
});
assert.ok(drawCore.compileFromFmt2(serverTournament).ok);
assert.ok(drawCore.drawInitial(serverTournament, { idStamp: 1 }).ok);
assert.equal(serverTournament.rounds[0].monarchGroups.length, 1);
assert.equal(serverTournament.rounds[0].matches.filter(m => m.isSitOut).length, 3,
  'o sorteio inicial real do servidor aplica a política compilada');
console.log('Rei/Rainha: folga sorteada futura e compatibilidade histórica OK');
