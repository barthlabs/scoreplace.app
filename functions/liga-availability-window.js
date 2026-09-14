'use strict';

// Adaptador mínimo para o codebase principal das Functions. Ele não importa o
// autoDraw (cada codebase é empacotado isoladamente), mas usa os mesmos domínios
// TypeScript gerados que o navegador e o motor vendorizado.
const identity = require('./vendor/participant-identity.js');
const waitlist = require('./vendor/waitlist.js');

function name(value) {
  if (typeof value === 'string') return value.trim();
  return String((value && (value.displayName || value.name || value.email)) || '').trim();
}
function memberUidByName(tournament, rawName) {
  const wanted = String(rawName || '').trim().toLowerCase();
  if (!wanted) return '';
  return (Array.isArray(tournament && tournament.participants) ? tournament.participants : []).find((entry) =>
    waitlist.nameForms(entry, helpers(tournament)).includes(wanted)
  )?.uid || '';
}
function helpers(tournament) {
  return {
    participantUids: identity.participantUids,
    displayName: name,
    memberUidByName: (tour, rawName) => memberUidByName(tour || tournament, rawName),
  };
}
function allWait(tournament) { return waitlist.getWaitlist(tournament, helpers(tournament)); }
function removeWait(tournament, target) { return waitlist.removeByName(tournament, target, helpers(tournament)); }
function playing(tournament, entry) { return waitlist.isPlayingCurrentPhase(tournament, entry, helpers(tournament)); }
function sanitize(tournament) {
  const inactive = new Set((tournament.participants || []).filter((entry) => entry && entry.ligaActive === false).flatMap(identity.participantUids));
  const waiting = new Set(allWait(tournament).flatMap(identity.participantUids));
  (tournament.rounds || []).forEach((round) => {
    if (!round || !Array.isArray(round.matches)) return;
    const inGroups = new Set((round.monarchGroups || []).flatMap((group) => (group.playersUids || []).map(String)));
    round.matches = round.matches.filter((match) => {
      if (!match || !match.isSitOut) return true;
      const uid = String(match.p1Uid || '');
      if (match.sitOutReason === 'inactive') return inactive.has(uid);
      if (match.sitOutReason === 'wo') return !(waiting.has(uid) && !inGroups.has(uid));
      return true;
    });
  });
}
module.exports = {
  _participantUids: identity.participantUids,
  _pName: name,
  _getWaitlist: allWait,
  _removeFromWaitlist: removeWait,
  _waitlistPushBack: (tournament, entry) => waitlist.pushBack(tournament, entry, helpers(tournament)),
  _phaseDrawDone: waitlist.phaseDrawDone,
  _isPlayingCurrentPhase: playing,
  _sanitizeSitOutsVsRoster: sanitize,
};
