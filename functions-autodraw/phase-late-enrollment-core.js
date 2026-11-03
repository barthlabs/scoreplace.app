'use strict';

// Novos confrontos só são uma decisão quando a organização abre inscrições.
// Com a porta fechada, não existe entrada nova nem escolha de destino.
function nextPhaseLateEnrollment(mode) {
  return { lateEnrollment: mode, newMatchups: mode === 'expand' };
}

module.exports = { nextPhaseLateEnrollment };
