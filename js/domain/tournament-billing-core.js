'use strict';

// Fonte única, sem acesso ao banco: a cobrança conta pessoas, nunca duplas ou
// vagas reservadas. O hash é calculado pelo servidor sobre este JSON canônico.
function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function rosterSnapshot(registrations, placeholderReservations) {
  if (!Array.isArray(registrations)) throw new Error('Inscrições canônicas ausentes.');
  const reserved = new Set((Array.isArray(placeholderReservations) ? placeholderReservations : [])
    .flatMap(item => [text(item && item.manualParticipantId), text(item && item.manualId), text(item && item.id)])
    .filter(Boolean));
  const seenIds = new Set();
  const seenPeople = new Set();
  let participantCount = 0;
  let unreviewedProofCount = 0;
  let unsettledPaymentCount = 0;
  const records = registrations.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Inscrição canônica inválida.');
    const registrationId = text(item.registrationId);
    if (!registrationId || seenIds.has(registrationId)) throw new Error('Inscrição sem ID estável ou duplicada.');
    seenIds.add(registrationId);
    const kind = text(item.participantKind);
    const uid = text(item.participantUid);
    const manualId = text(item.manualParticipantId);
    const personKey = kind === 'account' && uid && !manualId ? 'uid:' + uid
      : kind === 'manual' && manualId && !uid ? 'manual:' + manualId : '';
    if (!personKey) throw new Error('Inscrição sem identidade estável.');
    const status = text(item.status);
    const placeholder = item.isPlaceholder === true || (kind === 'manual' && reserved.has(manualId));
    const proofUnderReview = status !== 'withdrawn' && text(item.paymentState) === 'proof_submitted';
    const paymentUnsettled = status !== 'withdrawn' && !!text(item.paymentState)
      && text(item.paymentState) !== 'paid';
    if (proofUnderReview) unreviewedProofCount++;
    if (paymentUnsettled) unsettledPaymentCount++;
    if (status === 'confirmed' && !placeholder && !seenPeople.has(personKey)) {
      seenPeople.add(personKey);
      participantCount++;
    }
    // Categoria e dupla podem mudar até o sorteio, mas não alteram a dívida
    // por pessoa. O fingerprint financeiro rastreia identidade, elegibilidade
    // e comprovante ainda em conferência, sem depender de categoria ou dupla.
    return { registrationId, personKey, status, placeholder, proofUnderReview, paymentUnsettled };
  }).sort((a, b) => a.registrationId.localeCompare(b.registrationId));
  return { participantCount, unreviewedProofCount, unsettledPaymentCount, canonicalJson: JSON.stringify(records) };
}

function quote(snapshot, feeCentsPerPerson, discountCents = 0) {
  if (!snapshot || !Number.isSafeInteger(snapshot.participantCount) || snapshot.participantCount < 0 ||
      !Number.isSafeInteger(feeCentsPerPerson) || feeCentsPerPerson < 0 ||
      !Number.isSafeInteger(discountCents) || discountCents < 0) throw new Error('Valor da cobrança inválido.');
  const subtotalCents = snapshot.participantCount * feeCentsPerPerson;
  if (!Number.isSafeInteger(subtotalCents)) throw new Error('Cobrança acima do limite seguro.');
  return { participantCount: snapshot.participantCount, feeCentsPerPerson,
    subtotalCents, discountCents: Math.min(discountCents, subtotalCents),
    totalCents: Math.max(0, subtotalCents - discountCents) };
}

function structuralGeneration(before, after) {
  const list = value => Array.isArray(value) ? value.length : 0;
  return ['matches', 'rounds', 'groups', 'phaseRounds', 'phaseGroups'].some(key =>
    list(after && after[key]) > list(before && before[key]))
    || (!(before && before.drawSelectionDone) && !!(after && after.drawSelectionDone))
    || (!(before && before.pendingDraw) && !!(after && after.pendingDraw))
    || (!(before && before.tournamentStarted) && !!(after && after.tournamentStarted))
    || (before && before.status !== 'in_progress' && after && after.status === 'in_progress');
}

function assertCanDraw(before, after, liveFingerprint, unreviewedProofCount, unsettledPaymentCount) {
  const contract = after && after.billingContract || before && before.billingContract;
  if (!contract || contract.schema !== 1 || before && before.isSandbox === true) return;
  if (!structuralGeneration(before, after)) return;
  if (before && before.status === 'open' || after && after.status === 'open') {
    throw new Error('Feche as inscrições antes de sortear ou iniciar o torneio.');
  }
  if (!Number.isSafeInteger(unreviewedProofCount) || unreviewedProofCount < 0) {
    throw new Error('A conferência dos pagamentos não foi verificada nesta transação.');
  }
  if (unreviewedProofCount > 0) {
    throw new Error('Confira os comprovantes de inscrição pendentes antes do sorteio.');
  }
  if (!Number.isSafeInteger(unsettledPaymentCount) || unsettledPaymentCount < 0) {
    throw new Error('A situação dos pagamentos não foi verificada nesta transação.');
  }
  if (unsettledPaymentCount > 0) {
    throw new Error('Resolva as inscrições aguardando pagamento ou com comprovante recusado antes do sorteio.');
  }
  const settlement = before && before.billingSettlement;
  if (!liveFingerprint || !settlement || settlement.state !== 'paid' ||
      settlement.fingerprint !== liveFingerprint || settlement.quoteId !== contract.quoteId) {
    throw new Error('Taxa do torneio pendente ou elenco alterado. Feche as inscrições, atualize a cobrança e confirme o pagamento antes do sorteio.');
  }
}

function assertCanPublishPendingDraw(action, tournament) {
  if (action !== 'publish' || !tournament || tournament.isSandbox === true) return;
  const contract = tournament.billingContract;
  if (!contract || contract.schema !== 1) return;
  const settlement = tournament.billingSettlement;
  if (!settlement || settlement.state !== 'paid' || settlement.quoteId !== contract.quoteId) {
    throw new Error('A quitação da taxa não está válida para publicar este sorteio. Solicite conferência financeira.');
  }
}

const api = { rosterSnapshot, quote, structuralGeneration, assertCanDraw, assertCanPublishPendingDraw };
if (typeof module !== 'undefined') module.exports = api;
if (typeof window !== 'undefined') window.ScoreplaceTournamentBillingCore = api;
