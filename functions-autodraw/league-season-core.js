'use strict';

// Decisão pura do encerramento de temporada. A data/fuso é decidido pelo
// servidor chamador; este núcleo só transforma o estado fresco e é testável
// sem Firebase nem DOM.
function isLeagueFormat(t) {
  return !!(t && (t.format === 'Liga' || t.format === 'Ranking'));
}

function closeExpiredLeagueSeason(t, opts) {
  opts = opts || {};
  if (!isLeagueFormat(t) || !t || t.status === 'finished' || !opts.expired) {
    return { changed: false, reason: 'not-expired-or-not-league' };
  }

  t.status = 'finished';
  if (!t.finishedAt) t.finishedAt = String(opts.nowIso || new Date().toISOString());
  if ((!Array.isArray(t.standings) || !t.standings.length) && typeof opts.computeStandings === 'function') {
    var categories = (Array.isArray(t.combinedCategories) && t.combinedCategories.length)
      ? t.combinedCategories : ['default'];
    for (var i = 0; i < categories.length; i++) {
      var standings = opts.computeStandings(t, categories[i]);
      if (Array.isArray(standings) && standings.length) { t.standings = standings; break; }
    }
  }
  return { changed: true, reason: 'expired' };
}

module.exports = { isLeagueFormat, closeExpiredLeagueSeason };
