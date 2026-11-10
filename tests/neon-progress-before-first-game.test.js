'use strict';
const assert = require('node:assert/strict');
const W = require('./headless.js').window;
W._isConcentratedTournament = () => true;
W._photoReadBox = () => ({ bg: '#333', fg: '#fff', border: '#fff' });
const now = Date.now();
const first = now + 2 * 86400000;
const t = { id: 'sb_neon', name: 'Neon', format: 'Fase de Grupos + Eliminatórias', status: 'active',
  tournamentStarted: now - 86400000, startDate: new Date(now - 86400000).toISOString(),
  endDate: new Date(now + 3 * 86400000).toISOString(),
  matches: [{ id: 'm1', p1: 'A', p2: 'B', scheduledAt: new Date(first).toISOString() }] };
const html = W._buildProgressInner(t);
assert(t.tournamentStarted < now && first > now,
  'o teste reproduz o carimbo operacional de início anterior ao primeiro jogo futuro');
assert.match(html, /Aguardando início/);
assert.doesNotMatch(html, /Torneio em andamento/);
assert.match(html, new RegExp('data-sp-cd2l="' + first + '"'));
assert.match(html, /para o início/);
const startedGame = W._buildProgressInner({ ...t, matches: [{ ...t.matches[0], startedAt: now - 60000 }] });
assert.match(startedGame, /Torneio em andamento/,
  'se um jogo começou de fato antes da agenda, o progresso reconhece o início real');
const originalBar = W._progBarPct;
try {
  for (const offsetDays of [2, -2, 30, -30, 3650, -3650]) {
    const scheduled = now + offsetDays * 86400000;
    const playedAt = now - 60 * 60000;
    const blue = [];
    W._progBarPct = (pct, color) => { if (color === '#3b82f6') blue.push(pct); return ''; };
    W._buildProgressInner({ ...t,
      status: 'in_progress', tournamentStarted: now - 4 * 86400000,
      startDate: new Date(scheduled).toISOString(),
      endDate: new Date(scheduled + 10 * 3600000).toISOString(),
      matches: [{ ...t.matches[0], scheduledAt: new Date(scheduled).toISOString(),
        courtCalledAt: new Date(playedAt).toISOString() }] }, true);
    assert.equal(blue.length, 1);
    assert(Math.abs(blue[0] - 10) < 0.1,
      'barra azul conta 1h de 10h a partir da primeira chamada real, com grade adiantada ou atrasada');
    blue.length = 0;
    W._buildProgressInner({ ...t,
      status: 'in_progress', tournamentStarted: now - 40 * 86400000,
      startDate: new Date(scheduled).toISOString(),
      endDate: new Date(scheduled + 10 * 3600000).toISOString(),
      matches: [{ ...t.matches[0], scheduledAt: new Date(scheduled).toISOString(),
        resultAt: new Date(playedAt).toISOString(), score1: 6, score2: 3, winner: 'A' }] }, true);
    assert.equal(blue.length, 1);
    assert(Math.abs(blue[0] - 10) < 0.1,
      'primeiro placar também inicia a barra azul, mesmo sem chamada ou início de jogo');
  }
} finally { W._progBarPct = originalBar; }
W._isConcentratedTournament = () => false;
const ordinary = W._buildProgressInner({ ...t, id: 'tour_ordinary' });
assert.match(ordinary, /Torneio em andamento/,
  'torneio comum com início manual gravado preserva o início real mesmo com data configurada no futuro');
console.log('✓ progresso do Neon conta até o primeiro jogo agendado, sem antecipar “em andamento”');
