'use strict';

// A exclusão de uma categoria retira somente a inscrição naquela categoria.
// O documento retirado permanece no histórico; uma pessoa sem outra inscrição
// ativa recebe a sentinela canônica, sem ser inscrita numa categoria nova.
const UNCATEGORIZED = '__uncategorized__';
const MAX_REGISTRATION_WRITES = 450;
const FINANCIAL_FIELDS = [
  'paymentState', 'paymentDueCents', 'paymentCurrency', 'proofPath',
  'paymentMethod', 'paymentReviewedBy', 'paymentReviewEvidence',
  'paymentTransferredToRegistrationId', 'reclassifiedFromRegistrationId',
];

function registrationId(participantKey, categoryId) {
  return Buffer.from(participantKey, 'utf8').toString('base64url') + '__'
    + Buffer.from(categoryId, 'utf8').toString('base64url');
}

function plan(tournamentId, registrations, removedCategoryIds) {
  const removed = new Set((Array.isArray(removedCategoryIds) ? removedCategoryIds : [])
    .map(String).filter(id => id && id !== UNCATEGORIZED));
  const records = Array.isArray(registrations) ? registrations : [];
  const byId = new Map();
  const activeByPerson = new Map();
  const affected = new Map();
  for (const item of records) {
    if (!item || !item.registrationId || !item.participantKey || !item.categoryId ||
        byId.has(item.registrationId) ||
        item.registrationId !== registrationId(item.participantKey, item.categoryId)) {
      throw new Error('Elenco canônico inválido para excluir categoria.');
    }
    byId.set(item.registrationId, item);
    if (item.status === 'withdrawn') continue;
    const key = item.participantKey;
    if (!activeByPerson.has(key)) activeByPerson.set(key, []);
    activeByPerson.get(key).push(item);
    if (removed.has(item.categoryId)) {
      if (!affected.has(key)) affected.set(key, []);
      affected.get(key).push(item);
    }
  }
  const updates = [], creates = [];
  for (const [key, sources] of affected) {
    for (const source of sources) {
      if (FINANCIAL_FIELDS.some(field => source[field] !== undefined && source[field] !== null)) {
        throw new Error('Há inscrição com cobrança na categoria excluída; faça o acerto financeiro antes de removê-la.');
      }
      updates.push({ ...source, status:'withdrawn', fixedPairId:null,
        withdrawnReason:'category_removed' });
    }
    const survivors = activeByPerson.get(key).filter(item => !removed.has(item.categoryId));
    if (survivors.length) continue;
    const best = sources.slice().sort((a, b) => {
      const priority = { confirmed:0, pending:1, waitlisted:2 };
      return (priority[a.status] ?? 3) - (priority[b.status] ?? 3)
        || Number(a.enrollSeq ?? Infinity) - Number(b.enrollSeq ?? Infinity)
        || a.registrationId.localeCompare(b.registrationId);
    })[0];
    const id = registrationId(key, UNCATEGORIZED);
    const prior = byId.get(id);
    if (prior && prior.status !== 'withdrawn') {
      throw new Error('Inscrição sem categoria duplicada; nenhuma categoria foi removida.');
    }
    if (prior && FINANCIAL_FIELDS.some(field => prior[field] !== undefined && prior[field] !== null)) {
      throw new Error('Inscrição sem categoria tem histórico financeiro; faça o acerto antes de reativá-la.');
    }
    const next = { ...(prior || best), registrationId:id, categoryId:UNCATEGORIZED,
      originCategoryId:UNCATEGORIZED, status:best.status, fixedPairId:null,
      validationState:best.validationState, withdrawnReason:null };
    if (prior) updates.push(next);
    else creates.push(next);
  }
  // A transição é atômica: não iniciar uma transação que pode estourar o teto
  // de escritas do Firestore depois de preparar só parte do elenco.
  if (updates.length + creates.length > MAX_REGISTRATION_WRITES) {
    throw new Error('Categoria grande demais para exclusão atômica; divida a operação com suporte.');
  }
  const replacements = new Map(updates.map(item => [item.registrationId, item]));
  return { updates, creates, affectedPeople:affected.size,
    uncategorizedPeople:creates.length + updates.filter(item => item.categoryId === UNCATEGORIZED).length,
    nextRegistrations:records.map(item => replacements.get(item.registrationId) || item).concat(creates) };
}

module.exports = { UNCATEGORIZED, plan };
