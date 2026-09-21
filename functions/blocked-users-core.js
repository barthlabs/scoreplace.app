'use strict';

// Contrato puro da intenção de bloquear/desbloquear. A existência do perfil
// alvo é decisão do servidor, dentro da transação que grava a lista.
function normalizeBlockedUserMutation(data, ownUid) {
  const targetUid = String(data && data.targetUid || '').trim();
  const block = data && data.block;
  if (!targetUid || targetUid.length > 128) throw new Error('usuário alvo inválido');
  if (typeof block !== 'boolean') throw new Error('ação de bloqueio inválida');
  if (targetUid === String(ownUid || '')) throw new Error('não é possível bloquear a própria conta');
  return { targetUid, block };
}

module.exports = { normalizeBlockedUserMutation };
