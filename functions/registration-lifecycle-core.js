'use strict';

/* Transições puras do registro canônico diante do ciclo de vida da conta. */
function anonymizeForDeletedAccount(registration, uid) {
  if (!registration || typeof registration !== 'object' || Array.isArray(registration)) {
    throw new Error('registro canônico inválido');
  }
  if (!uid || String(registration.participantUid || '') !== String(uid)) {
    throw new Error('registro não pertence à conta excluída');
  }
  if (registration.participantKind !== 'account') {
    throw new Error('tipo de participante não é conta');
  }
  return {
    participantKind: 'deleted_account',
    participantUid: null,
    status: 'withdrawn',
    validationState: 'withdrawn',
    withdrawnReason: 'account_deleted',
  };
}

module.exports = { anonymizeForDeletedAccount };
