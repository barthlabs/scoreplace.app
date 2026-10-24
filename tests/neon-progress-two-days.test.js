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
assert.match(W._buildProgressInner(t), /96\/96 partidas · 100%/);
assert.doesNotMatch(W._buildProgressInner(t), /19\/10|97 partidas/);
const first = { ...t, matches: t.matches.map(m => m.requiredDay === '2026-10-23' ? { ...m, winner: null, score1: null, score2: null, resultAt: null, startedAt: null } : m) };
assert.deepEqual(W._tProgByDay(first).days.map(d => [d.completed, d.total]), [[48, 48], [0, 48]]);
assert.equal(W._getTournamentProgress(first).completed, 48);

const phantom = t.thirdPlaceMatch;
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
