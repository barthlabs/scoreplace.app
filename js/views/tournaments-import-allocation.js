/* A ordem da fonte decide qual vaga da MESMA categoria será ocupada. */
(function (root) {
  'use strict';
  function playerNumber(name) {
    var match = String(name || '').trim().match(/^Jogador\s*0*(\d+)$/i);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }
  function rank(slot) {
    return Math.min.apply(null, (slot.members || []).map(function (member) { return playerNumber(member.name); }));
  }
  function orderedSlots(slots) {
    return (slots || []).slice().sort(function (a, b) {
      return rank(a) - rank(b) || String(a.pairId).localeCompare(String(b.pairId));
    });
  }
  function allocate(rows, slots) {
    var available = orderedSlots(slots), used = new Set();
    return (rows || []).map(function (row) {
      if (row.saved) return { slot: null, error: '' };
      if (!row.categoryId) return { slot: null, error: 'Categoria não identificada na fonte. Envie uma foto mais nítida.' };
      var slot = available.find(function (item) { return item.categoryId === row.categoryId && !used.has(item.pairId); });
      if (!slot) return { slot: null, error: 'Não há outra dupla-placeholder nesta categoria.' };
      used.add(slot.pairId);
      return { slot: slot, error: '' };
    });
  }
  function peopleForBackend(row, slot) {
    if (!slot || !Array.isArray(slot.members) || slot.members.length !== 2) throw new Error('Vaga inválida');
    var members = slot.members;
    var firstIndex = playerNumber(members[0].name) <= playerNumber(members[1].name) ? 0 : 1;
    var result = [];
    result[firstIndex] = row.people[0];
    result[1 - firstIndex] = row.people[1];
    return result;
  }
  function repeatedUid(rows) {
    var seen = new Set();
    for (var row of rows || []) for (var person of row.people || []) {
      var uid = String(person.uid || '').trim();
      if (uid && seen.has(uid)) return uid;
      if (uid) seen.add(uid);
    }
    return '';
  }
  var api = { playerNumber: playerNumber, orderedSlots: orderedSlots, allocate: allocate,
    peopleForBackend: peopleForBackend, repeatedUid: repeatedUid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TournamentImportAllocation = api;
})(typeof window !== 'undefined' ? window : globalThis);
