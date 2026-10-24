'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = require('./headless').window;
const t = require('./fixtures/neon-progress-sanitized.json');
const day = require('../js/domain/match-day.js');

assert.deepEqual({ ...W._getTournamentProgress(t) }, { total: 96, completed: 96, pct: 100 });
const stages = W._tProgByDay(t);
assert.deepEqual(stages.days.map(d => [d.day, d.completed, d.total]),
  [['2026-10-22', 48, 48], ['2026-10-23', 48, 48]]);
assert.equal(stages.activeIndex, 1, 'a última etapa com jogo iniciado é a atual');
assert.match(W._buildProgressInner(t), /Etapa 2 · 23\/10/);
assert.doesNotMatch(W._buildProgressInner(t), /Etapa 1 · 22\/10/);
assert.match(W._buildProgressInner(t), /TORNEIO COMPLETO/);
assert.match(W._buildProgressInner(t), /96\/96 jogos · 100%/);
assert.doesNotMatch(W._buildProgressInner(t), /19\/10|97 partidas/);
const unsafeWindow = { ...t, scheduleWindow: { days: t.scheduleWindow.days.map((d, i) =>
  i === 0 ? { ...d, startTime: '<img src=x onerror=alert(1)>' } : d) } };
assert.doesNotMatch(W._buildProgressInner(unsafeWindow), /<img/, 'horários da agenda devem ser escapados');
const first = { ...t, matches: t.matches.map(m => m.requiredDay === '2026-10-23' ? { ...m, winner: null, score1: null, score2: null, resultAt: null, startedAt: null } : m) };
assert.deepEqual(W._tProgByDay(first).days.map(d => [d.completed, d.total]), [[48, 48], [0, 48]]);
assert.equal(W._getTournamentProgress(first).completed, 48);
assert.equal(W._tProgByDay(first).activeIndex, 0);
assert.match(W._buildProgressInner(first), /Etapa 1 · 22\/10/);
assert.doesNotMatch(W._buildProgressInner(first), /Etapa 2 · 23\/10/);
assert.match(W._buildProgressInner(first), /48\/96 jogos · 50%/);
const secondStarted = { ...first, matches: first.matches.map(m => m.requiredDay === '2026-10-23' && m.id === first.matches.find(x => x.requiredDay === '2026-10-23').id
  ? { ...m, startedAt: '2026-10-23T21:00:00Z' } : m) };
assert.equal(W._tProgByDay(secondStarted).activeIndex, 1, 'a primeira chamada registrada troca a etapa antes do placar');
assert.match(W._buildProgressInner(secondStarted), /Etapa 2 · 23\/10/);
assert.doesNotMatch(W._buildProgressInner(secondStarted), /Etapa 1 · 22\/10/);
const noFirstStamp = { ...first, matches: first.matches.map(m => m.requiredDay === '2026-10-22'
  ? { ...m, startedAt: null, resultAt: null } : m) };
assert.equal(W._tProgByDay(noFirstStamp).activeIndex, 0, 'sem registro, não inventa início de etapa');
const thirdDayHtml = W._tProgByDayHtml({ days: [
  { day: '2026-10-22', total: 2, completed: 2, startTime: '18:00', endTime: '20:00', firstAt: 1, lastAt: 2 },
  { day: '2026-10-23', total: 2, completed: 2, startTime: '18:00', endTime: '20:00', firstAt: 3, lastAt: 4 },
  { day: '2026-10-24', total: 2, completed: 1, startTime: '18:00', endTime: '20:00', firstAt: 5, lastAt: null }
], activeIndex: 2, total: 6, completed: 5, zone: 'America/Sao_Paulo' });
assert.match(thirdDayHtml, /Etapa 3 · 24\/10/);
assert.doesNotMatch(thirdDayHtml, /Etapa [12] ·/);
assert.match(thirdDayHtml, /5\/6 jogos · 83%/);
const originalPlan = W._tournamentGamesPlan;
W._tournamentGamesPlan = () => ({ totalPlanned: 120, totalDone: 48 });
try {
  const futurePhase = W._tProgByDay(first);
  assert.equal(futurePhase.total, 120, 'a barra total inclui fase futura ainda não materializada');
  assert.match(W._tProgByDayHtml(futurePhase), /48\/120 jogos · 40%/);
} finally { W._tournamentGamesPlan = originalPlan; }
const oneStage = { status: 'in_progress', matches: [
  { id: 'one', p1: 'A', p2: 'B', winner: 'A', score1: 6, score2: 2,
    startedAt: 1730149200000, resultAt: 1730151000000 }
] };
assert.match(W._buildProgressInner(oneStage), /Torneio completo/,
  'o torneio de uma só etapa também apresenta o total abaixo da etapa atual');

const phantom = t.thirdPlaceMatch;
const mixedPhases = {
  phases: [{ kind: 'classification' }, { kind: 'elimination', elimination: { bracketType: 'single' } }],
  currentPhaseIndex: 0,
  matches: [
    { id: 'semi-a', round: 1, p1: 'A', p2: 'B', winner: 'A' },
    { id: 'semi-b', round: 1, p1: 'C', p2: 'D', winner: 'C' },
    { id: 'final', round: 2, p1: 'A', p2: 'C', winner: null }
  ],
  thirdPlaceMatch: { id: 'phantom', p1: 'B', p2: 'D', winner: null }
};
W._maybeGenerate3rdPlace(mixedPhases);
assert.equal(mixedPhases.thirdPlaceMatch, undefined,
  'a fase classificatória remove o placeholder de terceiro lugar na origem');
mixedPhases.currentPhaseIndex = 1;
W._maybeGenerate3rdPlace(mixedPhases);
assert.ok(mixedPhases.thirdPlaceMatch,
  'a fase eliminatória seguinte continua podendo gerar terceiro lugar');
const scoredThird = { ...mixedPhases, currentPhaseIndex: 0,
  thirdPlaceMatch: { id: 'historical', score1: 6, score2: 4, winner: 'B' } };
W._maybeGenerate3rdPlace(scoredThird);
assert.equal(scoredThird.thirdPlaceMatch.id, 'historical',
  'um resultado histórico nunca é apagado pela limpeza de classificatória');
assert.equal(W._getTournamentProgress({ ...t, thirdPlaceMatch: { ...phantom, winner: 'A' } }).total, 97,
  'terceiro lugar realmente jogado continua no total');
assert.equal(W._getTournamentProgress({ ...t, phases: [{ kind: 'elimination' }] }).total, 97,
  'fases eliminatórias preservam terceiro lugar');
assert.equal(W._getTournamentProgress({ ...t, thirdPlaceMatch: { ...phantom, resultAt: Date.now() } }).total, 96,
  'carimbo isolado sem placar não é jogo concluído');
const datedPhantom = { ...t, thirdPlaceMatch: { ...phantom, requiredDay: '2026-10-22' } };
assert.deepEqual(W._tProgByDay(datedPhantom).days.map(d => d.total), [48, 48],
  'terceiro lugar fantasma datado não remove o painel por etapas');

const zone = 'America/Sao_Paulo';
assert.equal(day.matchDay({ scheduledAt: '2026-10-23T02:59:00Z' }, zone), '2026-10-22');
assert.equal(day.matchDay({ scheduledAt: '2026-10-23T03:01:00Z' }, zone), '2026-10-23');
assert.equal(day.matchDay({ requiredDay: '2026-10-22', scheduledAt: '2026-10-23T03:01:00Z' }, zone), '2026-10-22');
assert.equal(day.eventZone({}), zone, 'o shim usa BRT quando _matchCardTimeZone está ausente');

require('../functions-autodraw/draw-core.js');
const summary = require('../functions-autodraw/tournament-summary-core.js');
const server = summary.buildSummary(t, t.id, summary.helpersDe(global.window));
assert.equal(server.matchesTotal, 96);
assert.equal(server.matchesDone, 96);
assert.equal(global.window.ScoreplaceMatchDay.matchDay({ scheduledAt: '2026-10-23T02:59:00Z' }, zone),
  day.matchDay({ scheduledAt: '2026-10-23T02:59:00Z' }, zone));

const root = path.join(__dirname, '..');
const tv = fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
assert.match(tv, /ScoreplaceMatchDay/);
assert.doesNotMatch(tv, /function matchDay\(/, 'a TV não pode manter segunda regra de dia');
assert.doesNotMatch(ui, /_canonicalBatchBtn|Converter inscrições|Converter .* torneios/);
assert.doesNotMatch(ui, /onclick=[^\n]*_materializeCanonicalRegistrations/);
const css = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
function luminance(hex) {
  const n = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return n[0] * .2126 + n[1] * .7152 + n[2] * .0722;
}
for (const bg of ['#0f766e', '#4338ca']) {
  assert.ok((1.05 / (luminance(bg) + .05)) >= 4.5, `${bg} precisa contrastar com branco`);
  assert.ok(css.includes(`background: ${bg} !important`), `a classe de árbitro usa ${bg}`);
}
console.log('✓ progresso Neon: 48+48, 96/96, dia BRT, resumo servidor e sem conversão na UI');
