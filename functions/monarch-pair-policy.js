'use strict';

// Espelha _initialMonarchIndividualEnrollment e _sorteioDaFaseEhReiRainha
// do cliente. A paridade é verificada em test-monarch-pair-policy.js.
function initialMonarchIndividualEnrollment(t) {
  if (!t || t.enrollmentMode !== 'individual' || Number(t.currentPhaseIndex || 0) !== 0) return false;
  const phases = Array.isArray(t.phases) ? t.phases : null;
  if (phases) {
    if (!phases.length) return false;
    const i = 0;
    if (!(i >= 0 && i < phases.length)) return false;
    const phase = phases[i];
    if (!phase || typeof phase !== 'object') return false;
    if (phase.reiRainha === true) return true;
    return phase.drawMode === 'rei_rainha';
  }
  return t.drawMode === 'rei_rainha' || t.ligaRoundFormat === 'rei_rainha';
}

module.exports = { initialMonarchIndividualEnrollment };
