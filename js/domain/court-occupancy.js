// Fonte única para a ocupação operacional da quadra no cliente e na Cloud Function.
(function (root) {
  'use strict';
  function isFinished(match) {
    return !!(match && (match.resultAt || match.winner != null || match.wo === true));
  }
  function occupiesCourt(match) {
    if (!match || !match.court || isFinished(match)) return false;
    return !!(match.courtCalledAt || match.startedAt || match.liveScored === true ||
      (Array.isArray(match.sets) && match.sets.length > 0) ||
      (typeof match.scoreP1 === 'number' && match.scoreP1 > 0) ||
      (typeof match.scoreP2 === 'number' && match.scoreP2 > 0));
  }
  function occupant(matches, court, exceptId) {
    if (!Array.isArray(matches) || !court) return null;
    return matches.find(function (match) {
      return match && String(match.id) !== String(exceptId) &&
        String(match.court || '') === String(court) && occupiesCourt(match);
    }) || null;
  }
  var api = { isFinished: isFinished, occupiesCourt: occupiesCourt, occupant: occupant };
  root.ScoreplaceCourtOccupancy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
