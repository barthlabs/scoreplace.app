'use strict';

/*
 * Estado privado de identidade.
 *
 * Esta entrega é deliberadamente de auditoria: `legacy` não reduz nenhuma
 * capacidade do usuário atual. A mudança de estado e os custom claims só
 * entram quando existir um fluxo completo de migração e recuperação aprovado.
 * Manter a normalização aqui evita que cada Callable invente seus próprios
 * significados para o mesmo documento privado.
 */

const STATES = new Set(['legacy', 'migration', 'verified', 'restricted', 'duplicate_review']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function initial(now) {
  return {
    state: 'legacy',
    canonicalUid: null,
    identityEpoch: 0,
    createdAt: now,
    updatedAt: now
  };
}

function read(raw, ownUid) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const state = STATES.has(text(source.state)) ? text(source.state) : 'legacy';
  const canonicalUid = text(source.canonicalUid);
  const epoch = Number.isInteger(source.identityEpoch) && source.identityEpoch >= 0
    ? source.identityEpoch : 0;

  // A única situação em que o alias é relevante é um estado explicitamente
  // restrito/revisão. Em `legacy` e `verified`, uma cópia arbitrária de UID no
  // documento não ganha significado nem chega ao cliente.
  const redirected = (state === 'restricted' || state === 'duplicate_review') && canonicalUid && canonicalUid !== ownUid;
  return {
    state,
    identityEpoch: epoch,
    canonicalUid: redirected ? canonicalUid : null,
    isCanonical: !redirected,
    auditOnly: state === 'legacy'
  };
}

module.exports = { STATES, initial, read };
