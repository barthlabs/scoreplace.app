// Identifica lados definidos para a agenda e para o próximo jogo da TV.
(function () {
  'use strict';
  function knownSide(side) {
    var value = String(side || '').trim();
    return !!value && !/^(?:TBD|BYE|a definir|(?:vencedor|vencedora|perdedor|perdedora) d[oea] jogo\b|(?:winner|loser) of match\b)/i.test(value);
  }
  function normalizeName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function sidePeople(match, side) {
    var index = side === 1 ? '1' : '2';
    var uidValue = match['team' + index + 'Uids'] || match['p' + index + 'Uid'];
    var manualValue = match['team' + index + 'ManualIds'] || match['p' + index + 'ManualId'];
    var uids = Array.isArray(uidValue) ? uidValue : (uidValue ? [uidValue] : []);
    var manualIds = Array.isArray(manualValue) ? manualValue : (manualValue ? [manualValue] : []);
    var names = Array.isArray(match['team' + index]) ? match['team' + index] :
      String(match['p' + index] || '').split(/\s*\/\s*/);
    return names.map(function (name, i) {
      return { uid: String(uids[i] || ''), manual: String(manualIds[i] || ''), name: normalizeName(name) };
    }).concat(uids.slice(names.length).map(function (uid) { return { uid: String(uid), manual: '', name: '' }; }));
  }
  function samePerson(a, b) {
    if (a.uid && b.uid) return a.uid === b.uid;
    if (a.manual && b.manual) return a.manual === b.manual;
    // Um lado pode ser inscrição manual ainda sem UID. Na falta de identidade
    // comparável dos dois lados, o mesmo nome impede uma chamada arriscada.
    return !!a.name && a.name === b.name;
  }
  function conflictsWithActive(candidate, active) {
    if (!candidate || !Array.isArray(active)) return false;
    var people = sidePeople(candidate, 1).concat(sidePeople(candidate, 2));
    return active.some(function (match) {
      if (!match || String(match.id) === String(candidate.id)) return false;
      return people.some(function (person) {
        return sidePeople(match, 1).concat(sidePeople(match, 2)).some(function (other) {
          return samePerson(person, other);
        });
      });
    });
  }
  function firstAvailable(candidates, matches, released) {
    var occupancy = window.ScoreplaceCourtOccupancy; // index.html carrega este módulo depois deste arquivo.
    if (!occupancy || typeof occupancy.occupiesCourt !== 'function') return candidates[0] || null;
    var active = (matches || []).filter(function (match) {
      return match && !(released || {})[String(match.id)] && occupancy.occupiesCourt(match);
    });
    return candidates.find(function (match) { return !conflictsWithActive(match, active); }) || null;
  }
  window.ScoreplaceNextMatch = { knownSide: knownSide, conflictsWithActive: conflictsWithActive, firstAvailable: firstAvailable };
})();
