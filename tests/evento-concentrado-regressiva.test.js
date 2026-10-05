/* Regressão: anular a chave não muda o relógio do evento concentrado.
 * Neon tem uma janela operacional explícita; antes dela o card mostra o início,
 * depois dela mostra o fim. Confra não tem essa janela e continua fora desta regra. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-utils.js'), 'utf8');
const dash = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
const detail = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
const W = {};

function load(name) {
  const start = src.indexOf('window.' + name + ' = function');
  if (start < 0) throw new Error('função ausente: ' + name);
  const end = src.indexOf('\n};', start);
  if (end < 0) throw new Error('fim ausente: ' + name);
  new Function('window', 'with (window) { ' + src.slice(start, end + 3) + ' }')(W);
}
load('_tournamentScheduledWindow');
load('_concentratedTournamentCountdownEvent');

let pass = 0, fail = 0;
function ok(condition, message) {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}

const neon = {
  startDate: '2026-10-22T18:00', endDate: '2026-10-23T23:59',
  scheduleWindow: { days: [
    { day: '2026-10-22', startTime: '18:00', endTime: '23:59' },
    { day: '2026-10-23', startTime: '18:00', endTime: '23:59' }
  ] }
};
const before = W._concentratedTournamentCountdownEvent(neon, new Date('2026-10-05T12:00:00').getTime());
const during = W._concentratedTournamentCountdownEvent(neon, new Date('2026-10-22T19:00:00').getTime());
const confra = { startDate: '2026-10-22T18:00', endDate: '2026-11-12T23:00' };

console.log('──── regressiva de evento concentrado ────');
ok(before && before.kind === 'tournament-start' && before.ts === new Date('2026-10-22T18:00').getTime(),
  'antes do evento concentrado mostra Início do torneio, mesmo sem chave');
ok(during && during.kind === 'tournament-end' && during.ts === new Date('2026-10-23T23:59').getTime(),
  'depois do início mostra Fim do torneio');
ok(W._concentratedTournamentCountdownEvent(confra, new Date('2026-10-05T12:00:00').getTime()) === null,
  'torneio distribuído não recebe a regra de evento concentrado');
ok(dash.includes('_concentratedTournamentCountdownEvent(t, _now)') && detail.includes('_concentratedTournamentCountdownEvent(t, _now)'),
  'dashboard e detalhe usam a mesma regra canônica');
ok(dash.includes('_dashNum(individualCount, t, _ccDash.confiavel)') && detail.includes('_dashNum(individualCount, t, _ccDetail.confiavel)'),
  'os dois cartões mostram contagem confirmada do resumo sem esperar a chave');

console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
