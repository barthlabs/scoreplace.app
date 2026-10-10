'use strict';

/*
 * Transições puras do elenco canônico.
 *
 * A Function decide autorização, janela de inscrição e elegibilidade antes de
 * chegar aqui. Este módulo só protege a forma dos registros e produz a próxima
 * fotografia da subcoleção `registrations`: não lê/grava Firestore e não
 * conhece nomes, e-mails, fotos, partidas ou a projeção legada `participants`.
 */

const crypto = require('crypto');
const { participantKey, registrationId } = require('./registration-core');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function clone(value) { return Object.assign({}, value || {}); }

function canonicalPairId(tournamentId, categoryId, registrationIds) {
  const ids = (Array.isArray(registrationIds) ? registrationIds : []).map(text).filter(Boolean).sort();
  if (ids.length !== 2 || ids[0] === ids[1]) throw new Error('dupla exige duas inscrições diferentes');
  return 'pair-' + crypto.createHash('sha256')
    .update(text(tournamentId) + '\u0000' + text(categoryId) + '\u0000' + ids.join('\u0000'))
    .digest('hex').slice(0, 32);
}

function validateRegistration(tournamentId, registration) {
  const item = clone(registration);
  const tid = text(tournamentId);
  if (!tid || item.tournamentId !== tid) throw new Error('inscrição fora do torneio');
  const categoryId = text(item.categoryId);
  const key = participantKey({ uid: item.participantUid, manualParticipantId: item.manualParticipantId });
  const expectedId = registrationId(key, categoryId);
  if (!categoryId || item.registrationId !== expectedId || item.participantKey !== key) {
    throw new Error('inscrição canônica inválida');
  }
  return item;
}

function indexRegistrations(tournamentId, registrations) {
  const byId = new Map();
  const participantCategories = new Set();
  (Array.isArray(registrations) ? registrations : []).forEach((registration) => {
    const item = validateRegistration(tournamentId, registration);
    if (byId.has(item.registrationId)) throw new Error('inscrição duplicada');
    const categoryKey = item.participantKey + '\u0000' + item.categoryId;
    if (participantCategories.has(categoryKey)) throw new Error('participante duplicado na categoria');
    participantCategories.add(categoryKey);
    byId.set(item.registrationId, item);
  });
  return byId;
}

function statusCanPair(status) {
  return status === 'confirmed' || status === 'pending';
}

/* Cria somente inscrições que ainda não existam. A elegibilidade, a janela e
 * a decisão entre confirmado/espera pertencem à Function; este núcleo recebe
 * apenas o resultado já validado para manter a transição testável e livre de
 * perfil, nome ou I/O. Repetir exatamente o mesmo pedido é idempotente. */
function enroll(tournamentId, registrations, participant, categoryIds, options) {
  const byId = indexRegistrations(tournamentId, registrations);
  const tid = text(tournamentId);
  const key = participantKey(participant || {});
  const categoryList = Array.from(new Set((Array.isArray(categoryIds) ? categoryIds : [])
    .map(text).filter(Boolean)));
  if (!categoryList.length) throw new Error('inscrição exige ao menos uma categoria');
  const raw = options && typeof options === 'object' ? options : {};
  const status = raw.status === 'waitlisted' ? 'waitlisted' : (raw.status === 'pending' ? 'pending' : 'confirmed');
  const validationState = text(raw.validationState) || 'approved';
  const identity = key.indexOf('uid:') === 0
    ? { participantKind: 'account', participantUid: key.slice(4), manualParticipantId: null }
    : { participantKind: 'manual', participantUid: null, manualParticipantId: key.slice(7) };
  const creates = [];
  const already = [];
  categoryList.forEach((categoryId) => {
    const id = registrationId(key, categoryId);
    const existing = byId.get(id);
    if (existing) { already.push(id); return; }
    const next = Object.assign({
      registrationId: id,
      tournamentId: tid,
      categoryId: categoryId,
      participantKey: key,
      status: status,
      validationState: validationState,
      fixedPairId: null,
    }, identity);
    if (identity.participantKind === 'manual' && text(raw.manualDisplayName)) {
      next.manualDisplayName = text(raw.manualDisplayName);
    }
    creates.push(next);
  });
  return { outcome: creates.length ? 'enrolled' : 'alreadyRegistered', creates, already };
}

function pair(tournamentId, registrations, registrationIds) {
  const byId = indexRegistrations(tournamentId, registrations);
  const ids = (Array.isArray(registrationIds) ? registrationIds : []).map(text).filter(Boolean);
  if (ids.length !== 2 || ids[0] === ids[1]) throw new Error('dupla exige duas inscrições diferentes');
  const entries = ids.map((id) => byId.get(id));
  if (entries.some((item) => !item)) throw new Error('inscrição não encontrada');
  if (entries[0].categoryId !== entries[1].categoryId) throw new Error('dupla exige a mesma categoria');
  if (entries.some((item) => !statusCanPair(item.status))) throw new Error('inscrição sem status elegível para dupla');
  if (entries.some((item) => item.fixedPairId)) throw new Error('inscrição já pertence a uma dupla');
  const fixedPairId = canonicalPairId(tournamentId, entries[0].categoryId, ids);
  const updates = entries.map((item) => Object.assign({}, item, { fixedPairId }));
  return { outcome: 'paired', fixedPairId, updates };
}

/* A UI pode conhecer dois participantes em várias categorias paralelas. Nome
 * jamais desempata essa situação: a categoria explícita é parte da identidade
 * da vaga. Estas fachadas transformam somente UID/ID manual + categoryId nos
 * document IDs determinísticos antes de chamar o mesmo motor de dupla. */
function pairParticipants(tournamentId, registrations, first, second, categoryId) {
  const category = text(categoryId);
  if (!category) throw new Error('formar dupla exige categoryId explícito');
  const firstId = registrationId(participantKey(first || {}), category);
  const secondId = registrationId(participantKey(second || {}), category);
  return pair(tournamentId, registrations, [firstId, secondId]);
}

function split(tournamentId, registrations, registrationIds) {
  const byId = indexRegistrations(tournamentId, registrations);
  const ids = (Array.isArray(registrationIds) ? registrationIds : []).map(text).filter(Boolean);
  if (ids.length !== 2 || ids[0] === ids[1]) throw new Error('desfazer dupla exige duas inscrições diferentes');
  const entries = ids.map((id) => byId.get(id));
  if (entries.some((item) => !item)) throw new Error('inscrição não encontrada');
  if (!entries[0].fixedPairId || entries[0].fixedPairId !== entries[1].fixedPairId) {
    throw new Error('as inscrições não formam a mesma dupla');
  }
  return { outcome: 'split', updates: entries.map((item) => Object.assign({}, item, { fixedPairId: null })) };
}

function splitParticipants(tournamentId, registrations, first, second, categoryId) {
  const category = text(categoryId);
  if (!category) throw new Error('desfazer dupla exige categoryId explícito');
  const firstId = registrationId(participantKey(first || {}), category);
  const secondId = registrationId(participantKey(second || {}), category);
  return split(tournamentId, registrations, [firstId, secondId]);
}

function transitionStatus(tournamentId, registrations, participant, fromStatuses, toStatus) {
  const byId = indexRegistrations(tournamentId, registrations);
  const key = participantKey(participant || {});
  const accepted = new Set(fromStatuses || []);
  const updates = Array.from(byId.values())
    .filter((item) => item.participantKey === key && accepted.has(item.status))
    .map((item) => Object.assign({}, item, { status: toStatus, fixedPairId: null }));
  return { outcome: updates.length ? 'changed' : 'notFound', updates };
}

function withdraw(tournamentId, registrations, participant) {
  const byId = indexRegistrations(tournamentId, registrations);
  const key = participantKey(participant || {});
  const eligible = new Set(['pending', 'confirmed', 'waitlisted']);
  const mine = Array.from(byId.values()).filter((item) => item.participantKey === key && eligible.has(item.status));
  if (!mine.length) return { outcome: 'notFound', updates: [] };
  // Ao sair, uma pessoa não pode deixar o outro membro com `fixedPairId`
  // órfão. A dupla se dissolve, mas o parceiro continua inscrito com o mesmo
  // status. Isso é o equivalente canônico de a rota legada devolver o colega
  // como solo.
  const dissolvedPairIds = new Set(mine.map((item) => text(item.fixedPairId)).filter(Boolean));
  const updates = Array.from(byId.values()).filter((item) => {
    return mine.some((target) => target.registrationId === item.registrationId) ||
      (item.fixedPairId && dissolvedPairIds.has(item.fixedPairId));
  }).map((item) => {
    const leaving = mine.some((target) => target.registrationId === item.registrationId);
    return Object.assign({}, item, {
      status: leaving ? 'withdrawn' : item.status,
      fixedPairId: null,
    });
  });
  return { outcome: 'changed', updates };
}

function leaveWaitlist(tournamentId, registrations, participant) {
  return transitionStatus(tournamentId, registrations, participant, ['waitlisted'], 'withdrawn');
}

/* Trocar categoria não pode reescrever a projeção `participants`: categoryId faz
 * parte da identidade estrutural do documento. A transição preserva o registro
 * anterior como retirado e cria (ou reativa) a inscrição determinística da nova
 * categoria. Se a pessoa estiver em dupla fixa, a dupla inteira atravessa junta;
 * deixá-la em categorias diferentes produziria um pairId sem significado. */
function reclassify(tournamentId, registrations, participant, fromCategoryId, toCategoryId) {
  const byId = indexRegistrations(tournamentId, registrations);
  const key = participantKey(participant || {});
  const from = text(fromCategoryId), to = text(toCategoryId);
  if (!from || !to || from === to) throw new Error('mudança de categoria inválida');
  const source = Array.from(byId.values()).find((item) => (
    item.participantKey === key && item.categoryId === from && item.status !== 'withdrawn'
  ));
  if (!source) throw new Error('inscrição ativa na categoria de origem não encontrada');
  const cohort = source.fixedPairId
    ? Array.from(byId.values()).filter((item) => item.fixedPairId === source.fixedPairId)
    : [source];
  if (cohort.length !== (source.fixedPairId ? 2 : 1) || cohort.some((item) => item.categoryId !== from || item.status === 'withdrawn')) {
    throw new Error('dupla canônica inválida para mudança de categoria');
  }
  const targetIds = cohort.map((item) => registrationId(item.participantKey, to));
  const nextPairId = cohort.length === 2 ? canonicalPairId(tournamentId, to, targetIds) : null;
  const updates = [], creates = [];
  cohort.forEach((item, index) => {
    updates.push(Object.assign({}, item, { status: 'withdrawn', fixedPairId: null }));
    const targetId = targetIds[index], existing = byId.get(targetId);
    if (existing && existing.status !== 'withdrawn') {
      throw new Error('participante já possui inscrição ativa na categoria de destino');
    }
    if (existing) {
      updates.push(Object.assign({}, existing, { status: item.status, fixedPairId: nextPairId }));
      return;
    }
    creates.push(Object.assign({}, item, {
      registrationId: targetId,
      categoryId: to,
      fixedPairId: nextPairId,
    }));
  });
  return { outcome: 'reclassified', updates, creates, fromCategoryId: from, toCategoryId: to, fixedPairId: nextPairId };
}

module.exports = {
  canonicalPairId,
  indexRegistrations,
  enroll,
  pair,
  pairParticipants,
  split,
  splitParticipants,
  withdraw,
  leaveWaitlist,
  reclassify,
};
