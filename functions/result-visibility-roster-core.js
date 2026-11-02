'use strict';

// Fonte compartilhada com o autoDraw via copy-vendor.js. O roster de liberação
// exige prova para cada lado ocupado; o espelho antigo nunca é prova de UID.
const roster = require('./match-roster');

function occupied(name) {
  return typeof name === 'string' && name !== '' && name !== 'TBD' && name !== 'BYE';
}

function completeRosterProof(tournament, game) {
  const parts = Array.isArray(tournament && tournament.participants)
    ? tournament.participants : Object.values((tournament && tournament.participants) || {});
  for (const side of ['p1', 'p2']) {
    const name = game && game[side];
    if (!name || name === 'TBD' || name === 'BYE') continue;
    if (!occupied(name)) return false;
    const rawTeam = side === 'p1' ? game.team1Uids : game.team2Uids;
    if (Array.isArray(rawTeam) && rawTeam.length && rawTeam.some((uid) =>
      typeof uid !== 'string' || !uid.trim())) return false;
    const structural = roster.slotUids(game, side);
    // Um UID estrutural de uma dupla não prova o segundo integrante.
    if (structural.length) {
      if (name.includes('/') && structural.length < 2) return false;
      continue;
    }
    const exact = roster.uniqueParticipantByName(parts, name);
    const exactUids = exact ? roster.participantUids(exact) : [];
    if (exactUids.length && (!name.includes('/') || exactUids.length >= 2)) continue;
    const members = name.includes('/') ? name.split('/').map((entry) => entry.trim()) : [name];
    if (!members.every((entry) => {
      const person = roster.uniqueParticipantByName(parts, entry);
      return person && roster.participantUids(person).length === 1;
    })) return false;
  }
  return true;
}

function releasePlayerUids(tournament, game) {
  if (!completeRosterProof(tournament, game)) return null;
  const uids = roster.matchRoster(tournament, game);
  if (!Array.isArray(uids) || uids.some((uid) => typeof uid !== 'string' || !uid.trim())) return null;
  return [...new Set(uids)];
}

module.exports = { completeRosterProof, releasePlayerUids };
