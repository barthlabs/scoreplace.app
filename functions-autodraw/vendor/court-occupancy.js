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
  function activeMatches(matches, released, tournament) {
    var regular = (matches || []).filter(function (match) {
      return match && !(released || {})[String(match.id)] && occupiesCourt(match);
    });
    var books = tournament && tournament.phaseTieDecisions || {};
    var ties = Object.keys(books).flatMap(function (phase) {
      var decisions = books[phase] || {};
      return Object.keys(decisions).flatMap(function (id) { return decisions[id] && decisions[id].matches || []; });
    }).filter(function (match) {
      return match && match.court && match.courtCalledAt && !match.courtReleasedAt &&
        !match.winnerKey && !match.woWinnerKey;
    }).map(function (match) {
      function uidOf(side) {
        if (!side || typeof side !== 'object') return '';
        if (side.uid) return String(side.uid);
        var key = String(side.key || '');
        return key.indexOf('uid:') === 0 ? key.slice(4) : '';
      }
      return Object.assign({}, match, {
        p1:match.p1 && match.p1.name || match.p1,
        p2:match.p2 && match.p2.name || match.p2,
        p1Uid: uidOf(match.p1) || match.p1Uid || '',
        p2Uid: uidOf(match.p2) || match.p2Uid || ''
      });
    });
    return regular.concat(ties);
  }
  function freeCourts(courts, active) {
    return (courts || []).filter(function (court) { return !occupant(active, court); });
  }
  var api = { isFinished: isFinished, occupiesCourt: occupiesCourt, occupant: occupant,
    activeMatches: activeMatches, freeCourts: freeCourts };
  root.ScoreplaceCourtOccupancy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
