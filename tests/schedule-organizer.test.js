const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8'), sandbox, { filename: 'schedule-poll.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-organizer.js'), 'utf8'), sandbox, { filename: 'schedule-organizer.js' });
const W = sandbox;
const organizerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-organizer.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── agenda operacional e quadras ────');
ok(/if \(m\.winner != null\) return true;/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8')),
  'o helper global também congela partida com vencedor, igual à validação do servidor');

const t = {
  id: 'agenda', startDate: '2026-10-01T09:00', endDate: '2026-10-01T18:00', courtCount: 2,
  gameDuration: 30, callTime: 5, warmupTime: 5, scheduleRevision: 4,
  matches: [
    { id: 'A', round: 1, p1: 'A', p2: 'B' },
    { id: 'B', round: 1, p1: 'C', p2: 'D' },
    { id: 'C', round: 2, p1: 'E', p2: 'F' },
    { id: 'D', round: 2, p1: 'G', p2: 'H' },
    { id: 'LIVE', round: 1, p1: 'K', p2: 'L', liveScored: true },
    { id: 'STARTED', round: 1, p1: 'M', p2: 'N', startedAt: '2026-10-01T10:00:00.000Z' },
    { id: 'RESULT', round: 1, p1: 'O', p2: 'P', resultAt: '2026-10-01T10:40:00.000Z' },
    { id: 'WITH_SETS', round: 1, p1: 'Q', p2: 'R', sets: [{ p1: 1, p2: 0 }] },
    { id: 'DONE', round: 1, p1: 'I', p2: 'J', winner: 'I', court: 'Quadra 1', scheduledAt: '2026-10-01T12:00:00.000Z' }
  ]
};
const p = W._operationalSchedulePlan(t, { matchId: 'A', court: 'Quadra 2', scheduledAt: '2026-10-01T15:00:00.000Z' });
const A = p.items.find(x => x.matchId === 'A');
const B = p.items.find(x => x.matchId === 'B');
const C = p.items.find(x => x.matchId === 'C');
ok(p.baseScheduleRevision === 4, 'envia a revisão da agenda lida');
ok(A && A.court === 'Quadra 2' && A.scheduleLocked === true && A.scheduleSource === 'organizer', 'mudança manual vira trava do organizador');
ok(B && B.court === 'Quadra 2' && B.scheduleLocked === false && B.scheduleSource === 'estimate', 'pendente evita a quadra ocupada e recebe a primeira livre como estimativa');
ok(C && new Date(C.scheduledAt).getTime() >= new Date(B.scheduledAt).getTime(), 'rodada seguinte não volta no tempo');
ok(!p.items.some(x => x.matchId === 'DONE'), 'jogo concluído não entra na realocação');
ok(!p.items.some(x => x.matchId === 'LIVE'), 'jogo com placar ao vivo não entra na realocação');
ok(!p.items.some(x => x.matchId === 'STARTED'), 'jogo iniciado não entra na realocação');
ok(!p.items.some(x => x.matchId === 'RESULT'), 'jogo com resultado registrado não entra na realocação');
ok(!p.items.some(x => x.matchId === 'WITH_SETS'), 'jogo com sets preenchidos não entra na realocação');

const multi = W._operationalSchedulePlan(t, [
  { matchId: 'A', court: 'Quadra 2', scheduledAt: '2026-10-01T15:00:00.000Z' },
  { matchId: 'B', court: 'Quadra 1', scheduledAt: '2026-10-01T15:00:00.000Z' }
]);
const multiA = multi.items.find(x => x.matchId === 'A');
const multiB = multi.items.find(x => x.matchId === 'B');
ok(multiA && multiB && multiA.scheduleLocked && multiB.scheduleLocked,
  'mais de uma intervenção manual permanece fixada no mesmo rascunho');
ok(multiA && multiB && multiA.court !== multiB.court,
  'duas alterações simultâneas podem distribuir jogos entre quadras diferentes');
ok(/data-agenda-court/.test(organizerSource) && /data-agenda-time/.test(organizerSource),
  'a tela entrega seletor de quadra e campo de horário por jogo');
ok(/Object\.keys\(manual\)\.map/.test(organizerSource),
  'cada edição recompõe o plano completo a partir de todas as intervenções manuais');
ok(/getTimezoneOffset\(\) \* 60000/.test(organizerSource),
  'o conversor do input de horário usa minutos em milissegundos explicitamente');
console.log('──── ' + pass + ' passaram, ' + fail + ' falharam ────');
process.exitCode = fail ? 1 : 0;
