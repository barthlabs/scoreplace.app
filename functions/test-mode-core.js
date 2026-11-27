'use strict';

const DEVELOPER_UID = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';

function active(tournament) {
  return !!(tournament && tournament.testModeEnabled === true);
}

function memberUids(tournament, normalUids) {
  return active(tournament)
    ? [...new Set([tournament.creatorUid, ...(tournament.adminUids || [])].filter(Boolean))]
    : normalUids;
}

function refereeUids(tournament, normalUids) {
  return normalUids;
}

function canAccess(tournament, uid) {
  return !active(tournament) || !!uid && (uid === tournament.creatorUid ||
    (tournament.adminUids || []).includes(uid) || (tournament.refereeUids || []).includes(uid));
}

function notificationTournamentId(item) {
  if (item && typeof item.tournamentId === 'string' && item.tournamentId.trim()) {
    return item.tournamentId.trim();
  }
  for (const key of ['tournamentUrl', 'ctaUrl']) {
    const url = String(item && item[key] || '');
    const match = url.match(/#(?:tournaments|bracket)\/([^/?#&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return '';
}

module.exports = { DEVELOPER_UID, active, memberUids, refereeUids, canAccess, notificationTournamentId };
