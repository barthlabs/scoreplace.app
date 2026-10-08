'use strict';

// Decisão pura do encerramento de temporada. A data/fuso é decidido pelo
// servidor chamador; este núcleo só transforma o estado fresco e é testável
// sem Firebase nem DOM.
//
// A temporada pertence à FASE classificatória de pontos corridos, não ao
// rótulo histórico do torneio. Um torneio que nasceu como "Liga" pode estar
// hoje na sua eliminatória; encerrar a temporada nesse momento pelo campo de
// topo apaga a semântica da fase atual. Documentos ainda não projetados seguem
// usando o rótulo somente como ponte de leitura.
function isLeagueFormat(t) {
  if (!t) return false;
  if (Array.isArray(t.phases)) {
    if (!t.phases.length) return false;
    var index = Number(t.currentPhaseIndex || 0);
    if (!(index >= 0 && index < t.phases.length)) return false;
    var phase = t.phases[index] || {};
    return phase.kind === 'classification' &&
      (!phase.classification || phase.classification.structure !== 'groups');
  }
  return t.format === 'Liga' || t.format === 'Ranking';
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
