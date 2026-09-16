'use strict';
const N = require('./match-ready-notifications-core.js');
let pass = 0, fail = 0;
function ok(value, message) { if (value) pass++; else { fail++; console.error('  ✗ ' + message); } }
function eq(value, expected, message) { ok(value === expected, message + ' — esperado ' + expected + ', veio ' + value); }

const tournament = {
  id: 'confra', name: 'Confra', startDate: '2026-09-01', endDate: '2026-10-31',
  phases: [{ rounds: 3, startDate: '2026-09-01', endDate: '2026-10-31',
    roundBounds: ['2026-09-16T23:59', '2026-10-16T23:59'] }]
};
const ready = { id: 'm128', round: 2, team1Uids: ['renata', 'adriana'], team2Uids: ['fernanda', 'eduardo'] };
const future = { id: 'm129', round: 3, p1Uid: 'kelly', p2Uid: 'marilia' };
const bye = { id: 'bye', round: 2, p1Uid: 'a', p2Uid: 'b', isBye: true };
const started = { id: 'started', round: 2, p1Uid: 'a', p2Uid: 'b', pendingResult: { proposedBy: 'a' } };
const all = [ready, future, bye, started];

console.log('\n▸ confronto definido: UID, prazo configurado e recibo individual');
eq(N.roundDeadlineMs(tournament, ready, all), Date.parse('2026-10-17T02:59:00.000Z'), 'rodada 2 usa o segundo limite configurado, 16/10 23:59 BRT');
const specs = N.readySpecs(tournament, all);
eq(specs.length, 6, 'só os dois confrontos jogáveis geram um recibo por participante');
const r = specs.filter(x => x.matchId === 'm128');
eq(r.length, 4, 'a dupla contra dupla recebe quatro avisos individuais');
ok(r.every(x => x.deadlineText === '16/10'), 'o texto de cada aviso mostra o prazo real da rodada');
ok(r.every(x => /Prazo da rodada: 16\/10\./.test(x.message)), 'a mensagem carrega o limite, não uma data inferida no texto');
ok(r.every(x => x.eventId.includes(x.recipientUid)), 'a chave deduplica por jogo e por destinatário UID');
ok(!specs.some(x => x.matchId === 'bye' || x.matchId === 'started'), 'bye e jogo já em aprovação não viram “liberados”');

console.log('▸ lembrete de 7 dias: só jogo pendente dentro da janela');
const beforeSevenDays = Date.parse('2026-10-10T03:00:00.000Z');
const reminders = N.deadlineReminderSpecs(tournament, all, beforeSevenDays);
eq(reminders.filter(x => x.matchId === 'm128').length, 4, 'faltando menos de sete dias, cada pessoa recebe um lembrete');
ok(reminders.filter(x => x.matchId === 'm128').every(x => /encerra em 16\/10/.test(x.message)), 'lembrete usa o mesmo prazo configurado');
const tooEarly = N.deadlineReminderSpecs(tournament, all, Date.parse('2026-10-01T03:00:00.000Z'));
eq(tooEarly.filter(x => x.matchId === 'm128').length, 0, 'antes da janela de sete dias não manda lembrete');

console.log('\n' + pass + ' passou · ' + fail + ' falhou');
process.exitCode = fail ? 1 : 0;
