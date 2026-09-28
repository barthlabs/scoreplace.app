'use strict';

/*
 * Decisão pura da troca de nome no perfil. A transação de updateOwnProfile lê
 * as duas reservas e entrega seus donos aqui antes de escrever qualquer coisa.
 *
 * ⛔ HOMÔNIMO NÃO ENTRA POR RENOMEAÇÃO: cadastro e edição são a mesma porta de
 * identidade. Se a nova reserva pertencer a outro UID, a troca falha; nunca se
 * cria "Nome 2" e nunca se solta a reserva anterior antes de o novo nome estar
 * confirmado. Dados legados podem ter uma reserva antiga com outro dono: ela
 * também não pode ser apagada por quem não a possui.
 */

function uidOf(claim) {
  return claim && claim.exists ? String(((typeof claim.data === 'function' ? claim.data() : claim.data) || {}).uid || '') : '';
}

function decide({ uid, oldClaim, newClaim, sameClaim }) {
  const newOwner = uidOf(newClaim);
  if (newOwner && newOwner !== uid) return { conflict: true, releaseOld: false };

  // Só a reserva antiga do PRÓPRIO usuário pode ser removida. A inconsistência
  // legada é preservada para auditoria, em vez de liberar o nome de outra pessoa.
  const releaseOld = !sameClaim && uidOf(oldClaim) === uid;
  return { conflict: false, releaseOld };
}

module.exports = { uidOf, decide };
