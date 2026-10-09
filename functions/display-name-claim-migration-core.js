'use strict';

/*
 * Plano puro para converter perfis legados em reservas canônicas de nome.
 *
 * Não escolhe "vencedor" numa colisão: nome repetido pode ser segunda conta
 * ou duas pessoas diferentes. Os dois casos exigem revisão humana; até ela, a
 * reserva de estado `conflict` impede que um terceiro tome o mesmo nome.
 */
const names = require('./name-unique-core.js');

function planDisplayNameClaims(profiles) {
  const groups = new Map();
  (Array.isArray(profiles) ? profiles : []).forEach((profile) => {
    if (!profile || !profile.uid || (profile.data && profile.data.mergedInto)) return;
    const data = profile.data || {};
    const displayName = String(data.displayName || '').trim().replace(/\s+/g, ' ');
    const key = names.normalizeDisplayNameKey(displayName);
    if (!key || names.isUnfriendlyName(displayName)) return;
    const row = { uid: String(profile.uid), displayName: displayName };
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  });

  const active = [];
  const conflicts = [];
  groups.forEach((rows, key) => {
    const uniqueRows = rows.filter((row, index, list) => list.findIndex((x) => x.uid === row.uid) === index)
      .sort((a, b) => a.uid.localeCompare(b.uid));
    const id = names.displayNameClaimId(key);
    if (uniqueRows.length === 1) {
      active.push({
        id,
        document: {
          state: 'active', uid: uniqueRows[0].uid, uids: [], key,
          displayName: uniqueRows[0].displayName, migration: 'legacy-display-name-claims-v1',
        },
      });
      return;
    }
    conflicts.push({
      id,
      key,
      displayName: uniqueRows[0].displayName,
      uids: uniqueRows.map((row) => row.uid),
      document: {
        state: 'conflict', uid: '', uids: uniqueRows.map((row) => row.uid), key,
        displayName: uniqueRows[0].displayName, migration: 'legacy-display-name-claims-v1',
      },
    });
  });
  active.sort((a, b) => a.id.localeCompare(b.id));
  conflicts.sort((a, b) => a.id.localeCompare(b.id));
  return { active, conflicts, scanned: Array.isArray(profiles) ? profiles.length : 0 };
}

module.exports = { planDisplayNameClaims };
