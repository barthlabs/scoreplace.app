'use strict';

const DEVELOPER_UID = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';

function active(tournament) {
  return !!(tournament && tournament.testModeEnabled === true);
}

function memberUids(tournament, normalUids) {
  return active(tournament) ? [DEVELOPER_UID] : normalUids;
}

function refereeUids(tournament, normalUids) {
  return active(tournament) ? [] : normalUids;
}

function canAccess(tournament, uid) {
  return !active(tournament) || uid === DEVELOPER_UID;
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
