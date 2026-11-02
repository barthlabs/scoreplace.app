'use strict';

// Toda escrita transacional em results disputa este mesmo documento com a
// transição de visibilidade. Ler apenas a raiz não protege inserções após a
// consulta de results; o fence escrito pelos dois lados elimina esse phantom.
function refFor(tournamentRef) {
  return tournamentRef.collection('resultVisibilityFence').doc('state');
}

async function read(tx, tournamentRef) {
  return tx.get(refFor(tournamentRef));
}

function write(tx, tournamentRef, FieldValue) {
  if (!FieldValue || typeof FieldValue.increment !== 'function') {
    throw new Error('result_visibility_fence_increment_unavailable');
  }
  tx.set(refFor(tournamentRef), { revision: FieldValue.increment(1) }, { merge: true });
}

module.exports = { refFor, read, write };
