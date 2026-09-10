'use strict';

// Adaptador mínimo, autocontido no codebase principal. A disponibilidade não
// pode importar functions-autodraw: cada codebase é empacotado isoladamente.
function uids(p) {
  const out = []; [p && p.uid, p && p.p1Uid, p && p.p2Uid].forEach(u => { if (u && !out.includes(String(u))) out.push(String(u)); });
  (Array.isArray(p && p.participants) ? p.participants : []).forEach(x => { if (x && x.uid && !out.includes(String(x.uid))) out.push(String(x.uid)); });
  return out;
}
function name(p) { return typeof p === 'string' ? p.trim() : String((p && (p.displayName || p.name || p.email)) || '').trim(); }
function forms(p) { return [name(p), p && p.displayName, p && p.name, p && p.email].filter(Boolean).map(x => String(x).trim().toLowerCase()); }
function allWait(t) {
  const out = [], seen = new Set();
  function add(p) { if (!p) return; const key = uids(p).join('|') || name(p).toLowerCase(); if (key && !seen.has(key)) { seen.add(key); out.push(p); } }
  [t.waitlist, t.standbyParticipants].forEach(a => (Array.isArray(a) ? a : []).forEach(add));
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object') Object.values(t.monarchWaitlist).forEach(a => (Array.isArray(a) ? a : []).forEach(add));
  return out;
}
function removeWait(t, target) {
  const needle = String(target || '').trim().toLowerCase(); if (!needle) return false;
  let removed = false; const keep = p => { const hit = forms(p).includes(needle); removed = removed || hit; return !hit; };
  ['waitlist', 'standbyParticipants'].forEach(k => { if (Array.isArray(t[k])) t[k] = t[k].filter(keep); });
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object') Object.keys(t.monarchWaitlist).forEach(k => { if (Array.isArray(t.monarchWaitlist[k])) t.monarchWaitlist[k] = t.monarchWaitlist[k].filter(keep); });
  return removed;
}
function playing(t, entry) {
  const ids = uids(entry), nm = name(entry).toLowerCase(); let hit = false;
  function check(m) { if (!m || m.isSitOut) return; const mi = [].concat(m.team1Uids || [], m.team2Uids || [], m.p1Uid || [], m.p2Uid || []).filter(Boolean).map(String); if (ids.length ? mi.some(x => ids.includes(x)) : [m.p1, m.p2].some(x => String(x || '').toLowerCase() === nm)) hit = true; }
  (t.rounds || []).forEach(r => { (r && r.matches || []).forEach(check); (r && r.monarchGroups || []).forEach(g => { if ((g.playersUids || []).map(String).some(x => ids.includes(x))) hit = true; }); });
  (t.matches || []).forEach(check); return hit;
}
function sanitize(t) {
  const inactive = new Set((t.participants || []).filter(p => p && p.ligaActive === false).flatMap(uids));
  const waiting = new Set(allWait(t).flatMap(uids));
  (t.rounds || []).forEach(r => {
    if (!r || !Array.isArray(r.matches)) return;
    const inGroups = new Set((r.monarchGroups || []).flatMap(g => (g.playersUids || []).map(String)));
    r.matches = r.matches.filter(m => {
      if (!m || !m.isSitOut) return true;
      const uid = String(m.p1Uid || '');
      if (m.sitOutReason === 'inactive') return inactive.has(uid);
      if (m.sitOutReason === 'wo') return !(waiting.has(uid) && !inGroups.has(uid));
      return true;
    });
  });
}
module.exports = {
  _participantUids: uids, _pName: name, _getWaitlist: allWait,
  _removeFromWaitlist: removeWait,
  _waitlistPushBack: (t, p) => { if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = []; const ids = uids(p); if (allWait(t).some(x => uids(x).some(u => ids.includes(u)))) return false; t.standbyParticipants.push(p); return true; },
  _phaseDrawDone: t => !!(t && (t.hasDraw === true || (t.matches || []).length || (t.rounds || []).length || (t.groups || []).length)),
  _isPlayingCurrentPhase: playing, _sanitizeSitOutsVsRoster: sanitize
};
