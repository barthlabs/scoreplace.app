'use strict';
/* Reexecuta somente o planejador puro sobre o retrato local do Neon. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { sandbox } = require('./render-harness');
const backupPath = process.env.NEON_BACKUP_PATH;
if (!backupPath) throw new Error('NEON_BACKUP_PATH obrigatório.');
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const originalBackup = JSON.stringify(backup);
assert.strictEqual(
  fs.readFileSync(path.join(__dirname, '..', 'js/views/schedule-poll.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw/vendor/schedule-poll.js'), 'utf8'),
  'sandbox e Function devem executar a mesma fonte do planejador'
);
const matches = backup.subcollections.matches.map(doc => {
  const game = { ...doc.data.jogo, id: doc.data.jogo.id || doc.id };
  // Cenário futuro somente em memória: mantém confrontos/dias/duplas, mas
  // limpa resultados já encerrados para o planejador poder estimar a grade.
  for (const key of ['winner', 'resultAt', 'completedAt', 'startedAt', 'liveScored', 'wo', 'scoreP1', 'scoreP2', 'sets',
    'scheduledAt', 'scheduledKind', 'scheduleLocked', 'scheduleSource', 'court']) delete game[key];
  return game;
});
const tournament = { ...backup.tournament.data, id: 'sb_neon_replay_local', isSandbox: true, matches };
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/schedule-poll.js'), 'utf8'), sandbox,
  { filename: 'schedule-poll.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/domain/court-occupancy.js'), 'utf8'), sandbox,
  { filename: 'court-occupancy.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/domain/next-match.js'), 'utf8'), sandbox,
  { filename: 'next-match.js' });
const W = sandbox;
W._collectAllMatches = copy => copy.matches;
W._minutosDaPartida = () => 35;
W._faseDoTorneio = () => null;
const slotsFor = flow => {
  const copy = { ...tournament, scheduleWindow: { ...tournament.scheduleWindow,
    days: tournament.scheduleWindow.days.map((item, index) => ({ ...item, categoryFlow: flow,
      startTime: flow === 'rounds' ? item.startTime : (index === 0 ? '16:50' : '15:40') })) } };
  const grade = W._schGradeEstimada(copy);
  assert(grade && grade.slots && grade.slots.length === 96, 'o planejador não retornou os 96 jogos');
  assert.strictEqual(grade.cabe, true, 'a janela da cópia deve comportar os jogos');
  const future = { ...copy, id:'future_neon_like_local', isSandbox:false };
  const futureGrade = W._schGradeEstimada(future);
  assert.strictEqual(futureGrade.cabe, grade.cabe, 'viabilidade divergiu entre sandbox e torneio futuro');
  assert.strictEqual(JSON.stringify(futureGrade.slots), JSON.stringify(grade.slots),
    'sandbox e torneio futuro devem produzir exatamente a mesma grade');
  return grade.slots;
};
const alternating = slotsFor('rounds');
const concentrated = slotsFor('categories');
const originalWindow = W._schGradeEstimada(tournament);
assert(originalWindow && originalWindow.cabe === true,
  'a janela original de 8 horários deve comportar Alternadas');
const sevenWaves = { ...tournament, scheduleWindow:{ ...tournament.scheduleWindow,
  days:tournament.scheduleWindow.days.map(day => ({ ...day, endTime:'22:05', categoryFlow:'rounds' })) } };
const overflow = W._schGradeEstimada(sevenWaves);
assert(overflow && overflow.cadenceValid === true && overflow.cabe === false && overflow.slots.length === 96,
  'sete faixas devem preservar o sorteio completo no rascunho: ' + JSON.stringify(overflow && {
    cabe:overflow.cabe, cadenceValid:overflow.cadenceValid, slots:overflow.slots.length, extra:overflow.extraMs }));
assert.deepStrictEqual(Array.from(overflow.extraPorDia), [35 * 60000, 35 * 60000]);
assert.strictEqual(overflow.slots.filter(slot => slot.extrapolaJanela).length, 12,
  'a oitava faixa de cada dia deve ser zebrada');
const overflowCopy = JSON.parse(JSON.stringify(sevenWaves));
assert.strictEqual(W._schAplicarGrade(overflowCopy, []), 96,
  'a prévia deve gravar todos os horários estimados no rascunho');
const concentratedOriginal = { ...tournament, scheduleWindow:{ ...tournament.scheduleWindow,
  days:tournament.scheduleWindow.days.map(day => ({ ...day, categoryFlow:'categories' })) } };
const concentratedOverflow = W._schGradeEstimada(concentratedOriginal);
assert(concentratedOverflow && concentratedOverflow.cadenceValid === true && concentratedOverflow.cabe === false &&
  concentratedOverflow.slots.length === 96 && concentratedOverflow.slots.some(slot => slot.extrapolaJanela),
  'Concentradas também devem mostrar todas as partidas excedentes');
const underway = { ...tournament, matches:matches.map((game, index) => index ? game : { ...game, winner:'p1' }) };
const remainingPlan = W._schGradeEstimada(underway);
assert(remainingPlan && remainingPlan.slots.length === 95,
  'torneio em andamento conserva a estimativa das partidas ainda pendentes');
const byId = new Map(matches.map(game => [String(game.id), game]));
const pairKey = (game, side) => String((game['team' + side + 'Obj'] || {}).fixedPairId || '');
const days = tournament.scheduleWindow.days.map(item => item.day);
let unfair = 0, overlapping = 0;
for (const [flow, slots, expectedWaves] of [['Alternadas', alternating, [8, 8]], ['Concentradas', concentrated, [10, 12]]]) {
  assert.strictEqual(new Set(slots.map(slot => slot.matchId)).size, matches.length, flow + ': jogo duplicado ou ausente');
  days.forEach((day, index) => {
    const daySlots = slots.filter(slot => slot.dia === index);
    assert.strictEqual(new Set(daySlots.map(slot => slot.ms)).size, expectedWaves[index], flow + ': número de horários');
    const perTime = new Map();
    for (const slot of daySlots) {
      const game = byId.get(slot.matchId);
      assert.strictEqual(game.requiredDay, day, flow + ': jogo mudou de dia');
      const at = perTime.get(slot.ms) || { games:0, pairs:new Set() };
      at.games++;
      for (const side of [1, 2]) {
        const pair = pairKey(game, side);
        assert(!at.pairs.has(pair), flow + ': dupla simultânea em duas quadras');
        at.pairs.add(pair);
      }
      perTime.set(slot.ms, at);
    }
    assert([...perTime.values()].every(item => item.games <= 6), flow + ': mais de seis quadras ocupadas');
    if (flow === 'Alternadas') assert([...perTime.values()].every(item => item.games === 6),
      'Alternadas: quadra vazia antes do fim da janela');
  });
}
for (let day = 0; day < days.length; day++) {
  const daySlots = alternating.filter(slot => slot.dia === day);
  const priorGames = new Map();
  for (const at of [...new Set(daySlots.map(slot => slot.ms))].sort((a, b) => a - b)) {
    const wave = daySlots.filter(slot => slot.ms === at);
    for (const slot of wave) {
      const game = byId.get(slot.matchId);
      assert.strictEqual(priorGames.get(pairKey(game, 1)) || 0, priorGames.get(pairKey(game, 2)) || 0,
        'adversários se encontram com números diferentes de jogos anteriores');
    }
    for (const slot of wave) for (const side of [1, 2]) {
      const pair = pairKey(byId.get(slot.matchId), side);
      priorGames.set(pair, (priorGames.get(pair) || 0) + 1);
    }
  }
  assert([...priorGames.values()].every(value => value === 3), 'dupla não fez exatamente três jogos');
  const categories = [...new Set(daySlots.map(slot => byId.get(slot.matchId).category))];
  if (day === 1) for (const at of [...new Set(daySlots.map(slot => slot.ms))]) {
    const inWave = new Set(daySlots.filter(slot => slot.ms === at).map(slot => byId.get(slot.matchId).category));
    assert(categories.every(category => inWave.has(category)),
      'Alternadas: categoria ausente de uma faixa do segundo dia');
  }
  if (day === 1) {
    const priority = tournament.categorySchedule.slots.filter(item => item.day === days[day])
      .sort((a, b) => a.order - b.order).map(item => item.category);
    const actual = daySlots.map(slot => byId.get(slot.matchId).category);
    assert(actual.every((category, index) => category === priority[index % priority.length]),
      'Alternadas: a sequência diária das categorias precisa seguir a prioridade escolhida: ' +
      JSON.stringify({ expected:priority, actual }));
  }
  for (const category of categories) {
    const categorySlots = daySlots.filter(slot => byId.get(slot.matchId).category === category);
    const perPair = new Map();
    for (const slot of categorySlots) for (const side of [1, 2]) {
      const key = pairKey(byId.get(slot.matchId), side);
      if (!perPair.has(key)) perPair.set(key, []);
      perPair.get(key).push(slot.ms);
    }
    const times = [...perPair.values()].map(values => values.sort((a, b) => a - b));
    if (Math.max(...times.map(values => values[0])) > daySlots[0].ms + 2 * 35 * 60000) unfair++;
    if (times.some(values => values[0] >= values[1] || values[1] >= values[2])) unfair++;
  }
  const ordered = tournament.categorySchedule.slots.filter(item => item.day === days[day]).sort((a, b) => a.order - b.order);
  const categoryTimes = ordered.map(item => concentrated.filter(slot => slot.dia === day && byId.get(slot.matchId).category === item.category).map(slot => slot.ms));
  for (let index = 0; index + 1 < categoryTimes.length; index++) {
    if (Math.max(...categoryTimes[index]) >= Math.min(...categoryTimes[index + 1])) overlapping++;
  }
}
assert.strictEqual(unfair, 0, 'Alternadas: estreia tardia ou dupla sem intervalo entre os próprios jogos');
assert.strictEqual(overlapping, 0, 'Concentradas: categorias invadiram o horário da seguinte');
assert.strictEqual(JSON.stringify(backup), originalBackup, 'o retrato do Neon foi alterado durante o re-teste');
console.log('NEON_SANDBOX_SCHEDULE_OK: 96 confrontos preservados; Alternadas 8/8 horários; Concentradas 10/12; zero conflitos de quadra ou cadência.');
const active = { ...matches[0], court:'Quadra 4', courtCalledAt:'2026-10-22T18:00:00.000Z' };
const activePair = pairKey(active, 1);
const blocked = matches.find(game => game.id !== active.id && [1, 2].some(side => pairKey(game, side) === activePair));
const other = matches.find(game => game.id !== active.id && game.id !== blocked.id &&
  !W.ScoreplaceNextMatch.conflictsWithActive(game, [active]));
assert(blocked && other);
assert.strictEqual(W.ScoreplaceNextMatch.conflictsWithActive(blocked, [active]), true);
assert.strictEqual(W.ScoreplaceNextMatch.firstAvailable([blocked, other], [active], {}), other);
console.log('Atleta em quadra na cópia: próximo jogo conflitante bloqueado; o seguinte elegível é escolhido.');
console.log('Nenhum dado do torneio ou do sandbox remoto foi escrito.');
