'use strict';

/* A renomeação do organizador não é cosmética: nomes antigos existem no elenco,
 * jogos, classificação e listas auxiliares. Este núcleo puro é usado só pela CF,
 * para que uma aba atrasada nunca regrave a fotografia inteira do torneio. */
function _same(v, oldName) { return typeof v === 'string' && v.trim() === oldName; }
function _replaceLabel(v, oldName, newName) {
  if (typeof v !== 'string') return v;
  if (_same(v, oldName)) return newName;
  if (v.indexOf(' / ') === -1) return v;
  return v.split(' / ').map(x => _same(x, oldName) ? newName : x.trim()).join(' / ');
}
function _replaceNameFields(obj, oldName, newName, fields) {
  let changed = false;
  if (!obj || typeof obj !== 'object') return changed;
  fields.forEach((field) => {
    const next = _replaceLabel(obj[field], oldName, newName);
    if (next !== obj[field]) { obj[field] = next; changed = true; }
  });
  return changed;
}
function _matchesIdentity(p, oldName, uid) {
  if (typeof p === 'string') return !uid && p.split(' / ').some(x => _same(x, oldName));
  if (!p || typeof p !== 'object') return false;
  const ids = [p.uid, p.p1Uid, p.p2Uid].concat(Array.isArray(p.participants) ? p.participants.map(x => x && x.uid) : []).filter(Boolean).map(String);
  if (uid) return ids.indexOf(uid) !== -1;
  const names = [p.displayName, p.name, p.p1Name, p.p2Name].concat(Array.isArray(p.participants) ? p.participants.map(x => x && (x.displayName || x.name)) : []).filter(Boolean);
  return names.some(x => _same(x, oldName));
}
function _forEachMatch(t, fn) {
  const seen = new Set();
  const visit = (m) => { if (m && typeof m === 'object' && !seen.has(m)) { seen.add(m); fn(m); } };
  (Array.isArray(t.matches) ? t.matches : []).forEach(visit);
  (Array.isArray(t.rounds) ? t.rounds : []).forEach(r => {
    if (!r) return;
    if (Array.isArray(r.matches)) r.matches.forEach(visit);
    if (Array.isArray(r.monarchGroups)) r.monarchGroups.forEach(g => { if (g && Array.isArray(g.matches)) g.matches.forEach(visit); });
  });
  (Array.isArray(t.groups) ? t.groups : []).forEach(g => {
    if (!g) return;
    if (Array.isArray(g.matches)) g.matches.forEach(visit);
    if (Array.isArray(g.monarchGroups)) g.monarchGroups.forEach(mg => { if (mg && Array.isArray(mg.matches)) mg.matches.forEach(visit); });
    if (Array.isArray(g.rounds)) g.rounds.forEach(gr => {
      if (Array.isArray(gr)) gr.forEach(visit); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(visit);
    });
  });
  if (t.phaseRounds && typeof t.phaseRounds === 'object') Object.keys(t.phaseRounds).forEach(k => {
    const slot = t.phaseRounds[k];
    if (slot && Array.isArray(slot.rounds)) slot.rounds.forEach(r => { if (r && Array.isArray(r.matches)) r.matches.forEach(visit); });
  });
  if (t.thirdPlaceMatch) visit(t.thirdPlaceMatch);
  (Array.isArray(t.rodadas) ? t.rodadas : []).forEach(r => {
    if (Array.isArray(r)) r.forEach(visit);
    else if (r && Array.isArray(r.matches)) r.matches.forEach(visit);
    else if (r && Array.isArray(r.jogos)) r.jogos.forEach(visit);
  });
}
function _renameParticipantEntry(p, oldName, newName) {
  if (typeof p === 'string') return _replaceLabel(p, oldName, newName);
  if (!p || typeof p !== 'object') return p;
  _replaceNameFields(p, oldName, newName, ['displayName', 'name', 'p1Name', 'p2Name']);
  if (Array.isArray(p.participants)) p.participants.forEach(x => _replaceNameFields(x, oldName, newName, ['displayName', 'name']));
  return p;
}
function renameTournamentParticipant(t, input) {
  const oldName = String(input && input.oldName || '').trim();
  const newName = String(input && input.newName || '').trim();
  const uid = String(input && input.uid || '').trim();
  if (!oldName || !newName) throw new Error('nome inválido');
  if (oldName === newName) return { changed: false, update: {} };
  if (newName.length > 160) throw new Error('nome muito longo');
  const roster = Array.isArray(t.participants) ? t.participants : [];
  const candidates = roster.filter(p => _matchesIdentity(p, oldName, uid));
  if (!candidates.length) throw new Error('participante não está inscrito');
  if (!uid && candidates.length !== 1) throw new Error('nome ambíguo: selecione o participante pelo cadastro');
  const changed = new Set();
  const mark = k => changed.add(k);
  roster.forEach((p, i) => { const next = _renameParticipantEntry(p, oldName, newName); if (next !== p) { roster[i] = next; mark('participants'); } else if (typeof p === 'object' && p && _matchesIdentity(p, oldName, uid)) mark('participants'); });
  let matchChanged = false;
  _forEachMatch(t, m => {
    if (_replaceNameFields(m, oldName, newName, ['p1', 'p2', 'winner'])) matchChanged = true;
    ['team1', 'team2'].forEach(k => {
      if (!Array.isArray(m[k])) return;
      const next = m[k].map(n => _replaceLabel(n, oldName, newName));
      if (next.some((x, i) => x !== m[k][i])) { m[k] = next; matchChanged = true; }
    });
  });
  // Jogos podem morar em qualquer uma destas árvores. Persistir todas as raízes
  // afetadas deixa o tradutor de partes calcular o diff sem adivinhar a origem.
  if (matchChanged) ['matches', 'rounds', 'groups', 'phaseRounds', 'thirdPlaceMatch', 'rodadas'].forEach(k => { if (t[k] !== undefined) mark(k); });
  (Array.isArray(t.groups) ? t.groups : []).forEach(g => {
    if (g && Array.isArray(g.players)) { const next = g.players.map(n => _replaceLabel(n, oldName, newName)); if (next.some((x, i) => x !== g.players[i])) { g.players = next; mark('groups'); } }
  });
  ['checkedIn', 'absent', 'vips', 'classification'].forEach(k => {
    const map = t[k]; if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    Object.keys(map).forEach(key => { const next = _replaceLabel(key, oldName, newName); if (next !== key) { map[next] = map[key]; delete map[key]; mark(k); } });
  });
  if (Array.isArray(t.standings)) t.standings.forEach(s => { if (_replaceNameFields(s, oldName, newName, ['name', 'player'])) mark('standings'); });
  ['sorteioRealizado', 'waitlist', 'standbyParticipants'].forEach(k => {
    if (!Array.isArray(t[k])) return;
    const before = t[k];
    const next = before.map(p => _renameParticipantEntry(p, oldName, newName));
    if (next.some((x, i) => x !== before[i])) { t[k] = next; mark(k); }
  });
  const update = {};
  changed.forEach(k => { update[k] = t[k]; });
  return { changed: changed.size > 0, update };
}
module.exports = { renameTournamentParticipant };
