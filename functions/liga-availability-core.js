'use strict';
/* Disponibilidade de Liga: decisão pura usada pela CF. O cliente manda só true/false. */
function _uids(win, p) { return typeof win._participantUids === 'function' ? win._participantUids(p).filter(Boolean).map(String) : (p && p.uid ? [String(p.uid)] : []); }
function _same(win, p, uid) { return _uids(win, p).indexOf(String(uid)) !== -1; }
/* Disponibilidade controla a escala de uma classificação por pontos corridos.
 * O rótulo histórico do torneio não decide isso: um torneio que começou como
 * Liga pode já estar na sua fase eliminatória. Documentos sem `phases` ainda
 * são lidos pela regra antiga até serem projetados para o modelo canônico. */
function allowsLigaAvailability(t) {
  if (!t) return false;
  if (Array.isArray(t.phases)) {
    if (!t.phases.length) return false;
    const index = Number(t.currentPhaseIndex || 0);
    if (!(index >= 0 && index < t.phases.length)) return false;
    const phase = t.phases[index];
    return !!(phase && phase.kind === 'classification' &&
      (!phase.classification || phase.classification.structure !== 'groups'));
  }
  return t.format === 'Liga' || t.format === 'Ranking';
}
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
  // A chamada é autenticada e `found` foi localizado pelo callerUid. Ao sair da fila,
  // a mesma identidade deve ser usada; remover pelo rótulo apagaria o homônimo errado.
  const waitKey = String((found && (found.uid || found.manualParticipantId)) || name || '');
  const removeFromWait = () => {
    if (typeof win._removeFromWaitlistByKey === 'function') return win._removeFromWaitlistByKey(t, waitKey);
    if (typeof win._removeFromWaitlist === 'function') return win._removeFromWaitlist(t, name);
    return false;
  };
  if (fromWait) {
    found.ligaActive = !!isActive;
    if (isActive) {
      delete found.woSentToWaitlistAt;
      if (!drawn) { removeFromWait(); arr.push(found); }
    } else {
      removeFromWait();
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
module.exports = { applyLigaAvailability, allowsLigaAvailability };
