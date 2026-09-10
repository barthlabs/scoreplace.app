'use strict';
/* Disponibilidade de Liga: decisão pura usada pela CF. O cliente manda só true/false. */
function _uids(win, p) { return typeof win._participantUids === 'function' ? win._participantUids(p).filter(Boolean).map(String) : (p && p.uid ? [String(p.uid)] : []); }
function _same(win, p, uid) { return _uids(win, p).indexOf(String(uid)) !== -1; }
function applyLigaAvailability(t, callerUid, isActive, win) {
  if (!t || !callerUid) throw new Error('participante inválido');
  const arr = Array.isArray(t.participants) ? t.participants : [];
  let found = arr.find(p => _same(win, p, callerUid));
  let fromWait = false;
  if (!found && typeof win._getWaitlist === 'function') {
    found = win._getWaitlist(t).find(p => _same(win, p, callerUid)); fromWait = !!found;
  }
  if (!found) throw new Error('participante não está inscrito');
  const drawn = typeof win._phaseDrawDone === 'function' && win._phaseDrawDone(t);
  const name = (typeof win._pName === 'function' ? win._pName(found, '') : '') || found.displayName || found.name || '';
  if (fromWait) {
    found.ligaActive = !!isActive;
    if (isActive) {
      delete found.woSentToWaitlistAt;
      if (!drawn) { if (typeof win._removeFromWaitlist === 'function') win._removeFromWaitlist(t, name); arr.push(found); }
    } else {
      if (typeof win._removeFromWaitlist === 'function') win._removeFromWaitlist(t, name);
      if (found.woSentToWaitlistAt) { delete found.woSentToWaitlistAt; found.woDeactivatedAt = new Date().toISOString(); }
      arr.push(found);
    }
  } else {
    found.ligaActive = !!isActive;
    const levouWo = !!found.woDeactivatedAt;
    const playing = typeof win._isPlayingCurrentPhase === 'function' && win._isPlayingCurrentPhase(t, found);
    if (isActive && drawn && (levouWo || !playing)) {
      const idx = arr.indexOf(found); if (idx !== -1) arr.splice(idx, 1);
      if (levouWo) { delete found.woDeactivatedAt; found.woSentToWaitlistAt = new Date().toISOString(); }
      if (typeof win._waitlistPushBack === 'function') win._waitlistPushBack(t, found);
    }
  }
  if (typeof win._sanitizeSitOutsVsRoster === 'function') win._sanitizeSitOutsVsRoster(t);
  return { participants: t.participants, waitlist: t.waitlist, standbyParticipants: t.standbyParticipants, monarchWaitlist: t.monarchWaitlist, rounds: t.rounds };
}
module.exports = { applyLigaAvailability };
