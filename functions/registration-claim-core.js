'use strict';

/*
 * Transição canônica de uma vaga manual para uma conta existente.
 *
 * Nome não participa desta decisão. A organização aponta somente o
 * manualParticipantId e a conta indicada precisa aceitar a solicitação em uma
 * camada superior. Este núcleo puro apenas constrói a mudança atômica dos
 * documentos de inscrição: o registro manual é retirado e a conta ocupa a
 * mesma categoria/estado. Uma dupla fixa ganha novo pairId porque o ID da
 * inscrição faz parte da sua identidade.
 */

const { registrationId } = require('./registration-core');
const { canonicalPairId, indexRegistrations } = require('./registration-mutations-core');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function active(item) { return ['pending', 'confirmed', 'waitlisted'].includes(item && item.status); }

function cloneForAccount(item, tournamentId, accountUid, fixedPairId) {
  const categoryId = text(item.categoryId);
  const participantKey = 'uid:' + accountUid;
  const next = Object.assign({}, item, {
    registrationId: registrationId(participantKey, categoryId),
    tournamentId: text(tournamentId),
    participantKey,
    participantKind: 'account',
    participantUid: accountUid,
    manualParticipantId: null,
    fixedPairId: fixedPairId || null,
  });
  delete next.manualDisplayName;
  return next;
}

/* Retorna updates/criações compatíveis com canonical-registration-boundary.
 *
 * A função não escolhe a pessoa por nome e não altera jogos: por isso quem a
 * chama deve exigir a etapa pré-sorteio. Caso a conta já tenha uma inscrição
 * retirada na categoria, ela é reativada em vez de criar outro documento.
 */
function claimManualParticipant(tournamentId, registrations, manualParticipantId, accountUid) {
  const tid = text(tournamentId), manualId = text(manualParticipantId), uid = text(accountUid);
  if (!tid || !manualId || !uid) throw new Error('vínculo canônico exige torneio, vaga manual e conta');
  const byId = indexRegistrations(tid, registrations);
  const all = Array.from(byId.values());
  const manual = all.filter((item) => item.participantKind === 'manual' &&
    text(item.manualParticipantId) === manualId && active(item));
  if (!manual.length) throw new Error('vaga manual ativa não encontrada');

  const updatesById = new Map();
  const creates = [];
  const usedAccountIds = new Set();
  const putUpdate = (item) => {
    if (updatesById.has(item.registrationId)) throw new Error('transição canônica com atualização duplicada');
    updatesById.set(item.registrationId, item);
  };

  manual.forEach((source) => {
    const targetId = registrationId('uid:' + uid, source.categoryId);
    const existing = byId.get(targetId);
    if (existing && active(existing)) {
      throw new Error('a conta já possui inscrição ativa nesta categoria');
    }
    if (usedAccountIds.has(targetId)) throw new Error('vaga manual duplicada na categoria');
    usedAccountIds.add(targetId);
    putUpdate(Object.assign({}, source, { status: 'withdrawn', fixedPairId: null, withdrawnReason: 'claimed_by_account' }));

    const pairId = text(source.fixedPairId);
    let nextPairId = null;
    if (pairId) {
      const pair = all.filter((item) => text(item.fixedPairId) === pairId && active(item));
      if (pair.length !== 2 || pair.some((item) => item.categoryId !== source.categoryId)) {
        throw new Error('dupla canônica inválida para vínculo de conta');
      }
      const partner = pair.find((item) => item.registrationId !== source.registrationId);
      if (!partner) throw new Error('dupla canônica sem parceiro');
      nextPairId = canonicalPairId(tid, source.categoryId, [targetId, partner.registrationId]);
      putUpdate(Object.assign({}, partner, { fixedPairId: nextPairId }));
    }

    const accountRegistration = cloneForAccount(source, tid, uid, nextPairId);
    if (existing) {
      putUpdate(Object.assign({}, existing, {
        status: source.status,
        validationState: source.validationState,
        fixedPairId: nextPairId,
        withdrawnReason: null,
      }));
    } else {
      creates.push(accountRegistration);
    }
  });
  return {
    outcome: 'claimed',
    updates: Array.from(updatesById.values()),
    creates,
    manualParticipantId: manualId,
    participantUid: uid,
  };
}

module.exports = { claimManualParticipant };
