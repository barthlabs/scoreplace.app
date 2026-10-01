'use strict';

/* Uma pessoa por UID ocupa espera OU vaga ativa (dupla, grupo ou jogo futuro).
 * W.O. continua sendo o estado do slot do jogo, não uma quarta fila concorrente. */
function text(value) { return value == null ? '' : String(value).trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function addAll(target, values) { values.forEach((value) => { const uid = text(value); if (uid) target.add(uid); }); }

function uidsFromEntry(value) {
  /* Documento legado pode ter guardado o UID puro na fila. Não tratamos nome
   * solto como UID (evita apagar homônimo), mas um identificador Firebase é
   * inequívoco e precisa obedecer à mesma exclusividade. */
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{20,}$/.test(value.trim())) return [value.trim()];
  const entry = record(value);
  if (!entry) return [];
  const out = [entry.uid, entry.p1Uid, entry.p2Uid].map(text).filter(Boolean);
  array(entry.participants).forEach((person) => {
    const uid = text(record(person) && record(person).uid);
    if (uid) out.push(uid);
  });
  return [...new Set(out)];
}

function isFormedPair(entry) {
  const item = record(entry);
  if (!item) return false;
  if (text(item.p1Uid) && text(item.p2Uid)) return true;
  return array(item.participants).filter((person) => text(record(person) && record(person).uid)).length >= 2;
}

function unresolvedMatchUids(match) {
  const item = record(match);
  if (!item || item.winner || item.isBye || item.isSitOut) return [];
  const out = [item.p1Uid, item.p2Uid].map(text).filter(Boolean);
  array(item.team1Uids).concat(array(item.team2Uids)).forEach((uid) => {
    const value = text(uid); if (value) out.push(value);
  });
  return [...new Set(out)];
}

function removeAssignedFromQueue(entries, assigned) {
  return array(entries).filter((entry) => !uidsFromEntry(entry).some((uid) => assigned.has(uid)));
}

function reconcileRosterStates(tournament, options) {
  const t = record(tournament);
  if (!t) return { assignedUids: [], removed: 0 };
  const assigned = new Set();
  array(t.participants).forEach((entry) => { if (isFormedPair(entry)) addAll(assigned, uidsFromEntry(entry)); });

  const groups = [...array(t.groups)];
  array(t.rounds).forEach((round) => {
    const item = record(round);
    if (item) groups.push(...array(item.groups), ...array(item.monarchGroups));
  });
  groups.forEach((group) => {
    const item = record(group);
    if (!item) return;
    addAll(assigned, array(item.playersUids));
    array(item.players).forEach((player) => addAll(assigned, uidsFromEntry(player)));
  });

  let matches = array(t.matches);
  if (options && typeof options.collectMatches === 'function') {
    /* O coletor inclui grupos/fases que não vivem em `matches`, mas versões
     * históricas dele podem omitir a raiz. União, nunca substituição. */
    try { matches = matches.concat(array(options.collectMatches(t))); } catch (e) { /* usa matches raiz */ }
  }
  matches.forEach((match) => addAll(assigned, unresolvedMatchUids(match)));

  let before = 0;
  let after = 0;
  ['waitlist', 'standbyParticipants'].forEach((field) => {
    const values = array(t[field]);
    before += values.length;
    const clean = removeAssignedFromQueue(values, assigned);
    after += clean.length;
    t[field] = clean;
  });
  const monarch = record(t.monarchWaitlist);
  if (monarch) Object.keys(monarch).forEach((category) => {
    const values = array(monarch[category]);
    before += values.length;
    const clean = removeAssignedFromQueue(values, assigned);
    after += clean.length;
    monarch[category] = clean;
  });
  return { assignedUids: [...assigned].sort(), removed: before - after };
}

module.exports = { reconcileRosterStates, uidsFromEntry, unresolvedMatchUids };
