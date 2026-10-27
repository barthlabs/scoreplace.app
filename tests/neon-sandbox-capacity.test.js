'use strict';
/* Só lê o backup local. Imprime contagens, nunca nomes ou UIDs. */
const fs = require('fs');
const assert = require('assert');
const backupPath = process.env.NEON_BACKUP_PATH;
if (!backupPath) throw new Error('NEON_BACKUP_PATH obrigatório.');
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const t = backup.tournament.data;
const games = backup.subcollections.matches.map(doc => doc.data.jogo).filter(Boolean);
assert.strictEqual(games.length, 96);
assert.strictEqual(Number(t.courtCount), 6);
const dayKeys = t.scheduleWindow.days.map(item => item.day);
const byDay = dayKeys.map(day => games.filter(game => game.requiredDay === day));
assert.deepStrictEqual(byDay.map(list => list.length), [48, 48]);
const slots = t.scheduleWindow.days.map(item => {
  const minutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return 60 * h + m; };
  const slotMinutes = Number(t.gameDuration || 0) + Number(t.callTime || 0) + Number(t.warmupTime || 0);
  return Math.floor((minutes(item.endTime) - minutes(item.startTime)) / slotMinutes);
});
assert.deepStrictEqual(slots, [8, 8]);
const pairKey = (game, side) => String((game['team' + side + 'Obj'] || {}).fixedPairId || '');
const limits = byDay.map((matches, dayIndex) => {
  const categories = [...new Set(matches.map(game => game.category))];
  const groupStats = categories.map(category => {
    const list = matches.filter(game => game.category === category), degrees = new Map();
    for (const game of list) for (const side of [1, 2]) {
      const key = pairKey(game, side);
      assert(key, 'jogo sem dupla canônica');
      degrees.set(key, (degrees.get(key) || 0) + 1);
    }
    assert([...degrees.values()].every(value => value === 3), 'categoria/dia sem 3 jogos por dupla');
    return { matches: list.length, pairCount: degrees.size,
      concentratedMinimum: Math.max(Math.ceil(list.length / t.courtCount), ...degrees.values()) };
  });
  const concentrated = groupStats.reduce((sum, group) => sum + group.concentratedMinimum, 0);
  // Alternadas globais: em cada estágio, todas as duplas fazem exatamente um
  // jogo; só depois começa o estágio seguinte. Há 16 jogos por estágio/dia.
  const pairs = groupStats.reduce((sum, group) => sum + group.pairCount, 0);
  const alternating = 3 * Math.ceil((pairs / 2) / t.courtCount);
  assert.strictEqual(pairs, 32);
  return { day: dayIndex + 1, available: slots[dayIndex], alternating, concentrated };
});
assert.deepStrictEqual(limits.map(item => item.alternating), [9, 9]);
assert.deepStrictEqual(limits.map(item => item.concentrated), [10, 12]);
for (const item of limits) console.log('Dia ' + item.day + ': disponíveis ' + item.available + ' horários; mínimo Alternadas ' + item.alternating + '; mínimo Concentradas ' + item.concentrated + '.');
console.log('NEON_SANDBOX_CAPACITY_OK: nenhum modo estrito cabe na janela original de 8 horários.');
