'use strict';

const crypto = require('crypto');
const { registrationId } = require('./registration-core');
const { canonicalPairId, indexRegistrations } = require('./registration-mutations-core');
const { normalizeName } = require('./manual-name-unique-core');

const text = (value) => typeof value === 'string' ? value.trim() : '';
const active = (item) => item && item.status === 'confirmed';

function plan(tournamentId, registrations, identity, categoryId, expectedName, newName, manualId, targetUid) {
  const name = text(newName).replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120 || /[<>\x00-\x1f]/.test(name)) throw new Error('nome inválido');
  const target = text(targetUid);
  const all = Array.from(indexRegistrations(tournamentId, registrations).values());
  const source = all.filter((item) => active(item) && item.categoryId === categoryId &&
    (identity.uid ? item.participantUid === identity.uid : item.manualParticipantId === identity.manualParticipantId));
  if (source.length !== 1 || !source[0].fixedPairId) throw new Error('vaga confirmada em dupla não encontrada');
  const current = source[0];
  if (current.participantKind !== (identity.uid ? 'account' : 'manual')) throw new Error('identidade divergente');
  if (current.participantKind === 'manual' && normalizeName(current.manualDisplayName) !== normalizeName(expectedName)) {
    throw new Error('nome da vaga mudou; atualize a análise');
  }
  const pair = all.filter((item) => active(item) && item.fixedPairId === current.fixedPairId);
  if (pair.length !== 2 || pair.some((item) => item.categoryId !== categoryId)) throw new Error('dupla canônica inconsistente');
  const partner = pair.find((item) => item.registrationId !== current.registrationId);
  if (!partner) throw new Error('parceiro não encontrado');
  const partnerName = partner.participantKind === 'manual' ? partner.manualDisplayName : '';
  if (partnerName && normalizeName(partnerName) === normalizeName(name)) throw new Error('os integrantes da dupla precisam ser diferentes');
  // Nome de conta vem do perfil público verificado pelo servidor; identidade é UID.
  // Homônimos conta/manual são válidos, mas nomes manuais seguem únicos.
  if (!target && all.some((item) => active(item) && item.registrationId !== current.registrationId &&
    item.participantKind === 'manual' && normalizeName(item.manualDisplayName) === normalizeName(name))) {
    throw new Error('já existe inscrito com este nome');
  }
  if (target) {
    if (target === current.participantUid || target === partner.participantUid) throw new Error('conta já ocupa esta dupla');
    const key = 'uid:' + target;
    const id = registrationId(key, categoryId);
    const existing = all.find((item) => item.registrationId === id);
    if (existing && (existing.participantKind !== 'account' || existing.participantUid !== target)) throw new Error('identidade de destino divergente');
    if (existing && existing.status !== 'withdrawn') throw new Error('conta já inscrita nesta categoria');
    if (existing && !['', 'left', 'organizer_replaced'].includes(text(existing.withdrawnReason))) throw new Error('inscrição histórica não pode ser reativada');
    const newPairId = canonicalPairId(tournamentId, categoryId, [id, partner.registrationId]);
    const updates = [Object.assign({}, current, { status: 'withdrawn', fixedPairId: null, withdrawnReason: 'organizer_replaced' }),
      Object.assign({}, partner, { fixedPairId: newPairId })];
    const creates = [];
    if (existing) updates.push(Object.assign({}, existing, { status: 'confirmed', validationState: 'approved', fixedPairId: newPairId, withdrawnReason: null }));
    else creates.push({ registrationId: id, tournamentId, categoryId, originCategoryId: categoryId,
      participantKey: key, participantKind: 'account', participantUid: target, manualParticipantId: null,
      status: 'confirmed', validationState: 'approved', fixedPairId: newPairId });
    return { source: current, partner, newName: name, newIdentity: { uid: target }, newPairId,
      changes: { updates, creates } };
  }
  if (current.participantKind === 'manual') {
    if (normalizeName(current.manualDisplayName) === normalizeName(name)) throw new Error('nome sem alteração');
    return { source: current, partner, newName: name, newIdentity: { manualParticipantId: current.manualParticipantId },
      newPairId: current.fixedPairId, changes: { updates: [Object.assign({}, current, { manualDisplayName: name })], creates: [] } };
  }
  const generated = text(manualId) || 'org-' + crypto.randomUUID();
  if (all.some((item) => item.manualParticipantId === generated)) throw new Error('identidade manual já existe');
  const key = 'manual:' + generated;
  const newId = registrationId(key, categoryId);
  const newPairId = canonicalPairId(tournamentId, categoryId, [newId, partner.registrationId]);
  const replacement = Object.assign({}, current, { registrationId: newId, participantKey: key,
    participantKind: 'manual', participantUid: null, manualParticipantId: generated, manualDisplayName: name,
    fixedPairId: newPairId, replacedParticipantUid: current.participantUid });
  delete replacement.withdrawnReason;
  return { source: current, partner, newName: name, newIdentity: { manualParticipantId: generated }, newPairId,
    changes: { updates: [Object.assign({}, current, { status: 'withdrawn', fixedPairId: null, withdrawnReason: 'organizer_replaced' }),
      Object.assign({}, partner, { fixedPairId: newPairId })], creates: [replacement] } };
}

function legacyItem(document) {
  return document && document.item && typeof document.item === 'object' ? document.item : document;
}

function findLegacyMirror(documents, edit) {
  const sourceField = edit.source.participantKind === 'account' ? 'Uid' : 'ManualId';
  const sourceValue = edit.source.participantKind === 'account' ? edit.source.participantUid : edit.source.manualParticipantId;
  const partnerField = edit.partner.participantKind === 'account' ? 'Uid' : 'ManualId';
  const partnerValue = edit.partner.participantKind === 'account' ? edit.partner.participantUid : edit.partner.manualParticipantId;
  const matches = (documents || []).filter((document) => {
    const entry = legacyItem(document.data);
    if (!entry || entry.fixedPair !== true) return false;
    return ['p1', 'p2'].some((slot) => {
      const other = slot === 'p1' ? 'p2' : 'p1';
      return entry[slot + sourceField] === sourceValue && entry[other + partnerField] === partnerValue;
    });
  });
  if (matches.length !== 1) throw new Error('espelho da dupla ausente ou ambíguo');
  return matches[0];
}

function sourceSlot(entry, edit) {
  const field = edit.source.participantKind === 'account' ? 'Uid' : 'ManualId';
  const value = edit.source.participantKind === 'account' ? edit.source.participantUid : edit.source.manualParticipantId;
  const matches = ['p1', 'p2'].filter((slot) => entry[slot + field] === value);
  if (matches.length !== 1) throw new Error('vaga de origem ausente ou ambígua');
  const slot = matches[0], other = slot === 'p1' ? 'p2' : 'p1';
  const partnerField = edit.partner.participantKind === 'account' ? 'Uid' : 'ManualId';
  const partnerValue = edit.partner.participantKind === 'account' ? edit.partner.participantUid : edit.partner.manualParticipantId;
  if (entry[other + partnerField] !== partnerValue) throw new Error('parceiro divergente');
  return slot;
}

function patchPair(entry, edit, options) {
  if (!entry || typeof entry !== 'object') return false;
  const oldField = edit.source.participantKind === 'account' ? 'Uid' : 'ManualId';
  const oldValue = edit.source.participantKind === 'account' ? edit.source.participantUid : edit.source.manualParticipantId;
  const slots = ['p1', 'p2'].filter((slot) => entry[slot + oldField] === oldValue);
  if (!slots.length) return false;
  const legacyMirror = !!(options && options.legacyMirror);
  if (slots.length !== 1 || (legacyMirror && entry.fixedPair !== true)) {
    throw new Error('referência de dupla ambígua');
  }
  if (entry.fixedPairId && entry.fixedPairId !== edit.source.fixedPairId) {
    if (legacyMirror) throw new Error('referência de dupla ambígua');
    return false;
  }
  const slot = slots[0];
  const other = slot === 'p1' ? 'p2' : 'p1';
  const partnerField = edit.partner.participantKind === 'account' ? 'Uid' : 'ManualId';
  const partnerValue = edit.partner.participantKind === 'account' ? edit.partner.participantUid : edit.partner.manualParticipantId;
  if (entry[other + partnerField] !== partnerValue) {
    // No rascunho, outra categoria pode repetir o mesmo UID sem ser a dupla
    // procurada. O chamador exige exatamente um participante e >=1 jogo alterado.
    if (!entry.fixedPairId) return false;
    throw new Error('parceiro divergente');
  }
  if (edit.source.participantKind !== 'manual' || edit.newIdentity.uid) {
    delete entry[slot + 'Uid'];
    delete entry[slot + 'ManualId'];
    if (edit.newIdentity.uid) entry[slot + 'Uid'] = edit.newIdentity.uid;
    else entry[slot + 'ManualId'] = edit.newIdentity.manualParticipantId;
    if (entry.fixedPairId) entry.fixedPairId = edit.newPairId;
  }
  const oldName = entry[slot + 'Name'];
  entry[slot + 'Name'] = edit.newName;
  if (typeof entry[slot] === 'string' && normalizeName(entry[slot]) === normalizeName(oldName)) entry[slot] = edit.newName;
  if (typeof entry.name === 'string') entry.name = [entry.p1Name, entry.p2Name].filter(Boolean).join(' / ');
  if (typeof entry.displayName === 'string') entry.displayName = [entry.p1Name, entry.p2Name].filter(Boolean).join(' / ');
  return true;
}

function mirrorWritePatch(document, edit, deleteFieldValue, oldSlot) {
  const mirror = legacyItem(document);
  const prefix = mirror === document ? '' : 'item.';
  const matches = (slot) => edit.newIdentity.uid
    ? mirror[slot + 'Uid'] === edit.newIdentity.uid
    : mirror[slot + 'ManualId'] === edit.newIdentity.manualParticipantId;
  const slot = oldSlot || (matches('p1') !== matches('p2') ? (matches('p1') ? 'p1' : 'p2') : '');
  if (!slot) throw new Error('vaga substituta ausente do espelho');
  const patch = { [prefix + slot + 'Name']: edit.newName };
  if (edit.source.participantKind !== 'manual' || edit.newIdentity.uid) {
    patch[prefix + slot + 'Uid'] = edit.newIdentity.uid || deleteFieldValue;
    patch[prefix + slot + 'ManualId'] = edit.newIdentity.manualParticipantId || deleteFieldValue;
    if (mirror.fixedPairId) patch[prefix + 'fixedPairId'] = edit.newPairId;
  }
  if (typeof mirror[slot] === 'string') patch[prefix + slot] = mirror[slot];
  if (typeof mirror.name === 'string') patch[prefix + 'name'] = mirror.name;
  if (typeof mirror.displayName === 'string') patch[prefix + 'displayName'] = mirror.displayName;
  return patch;
}

function hasIdentity(value, identity) {
  if (typeof value === 'string') return value === identity.uid || value === identity.manualParticipantId;
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value).some((key) => {
    const part = value[key];
    if (identity.uid && /(?:^uid$|Uid$|participantUid$)/.test(key) && part === identity.uid) return true;
    if (identity.manualParticipantId && /(?:^manualParticipantId$|ManualId$)/.test(key) && part === identity.manualParticipantId) return true;
    return hasIdentity(part, identity);
  });
}

function patchDraft(draft, edit) {
  if (!draft || !Array.isArray(draft.participants) || !Array.isArray(draft.matches)) throw new Error('rascunho incompleto');
  // Preserve Firestore Timestamp/GeoPoint and other non-JSON metadata in the
  // private draft. Only the structures actually edited receive shallow copies.
  const next = Object.assign({}, draft, {
    participants: draft.participants.map((item) => Object.assign({}, item)),
    matches: draft.matches.map((match) => Object.assign({}, match, {
      team1Obj: match.team1Obj && Object.assign({}, match.team1Obj),
      team2Obj: match.team2Obj && Object.assign({}, match.team2Obj),
    })),
    competitionPairAssignments: Array.isArray(draft.competitionPairAssignments)
      ? draft.competitionPairAssignments.map((item) => Object.assign({}, item)) : draft.competitionPairAssignments,
  });
  let participantCount = 0, matchCount = 0;
  next.participants.forEach((item) => { if (patchPair(item, edit)) participantCount++; });
  next.matches.forEach((match) => {
    ['team1Obj', 'team2Obj'].forEach((field, index) => {
      const side = match[field];
      if (!patchPair(side, edit)) return;
      matchCount++;
      const n = index + 1;
      match['team' + n + 'Uids'] = [side.p1Uid, side.p2Uid].filter(Boolean);
      match['p' + n + 'Uid'] = match['team' + n + 'Uids'].length === 1 ? match['team' + n + 'Uids'][0] : null;
      if (typeof match['team' + n] === 'string') match['team' + n] = [side.p1Name, side.p2Name].filter(Boolean).join(' / ');
    });
  });
  if (edit.newPairId !== edit.source.fixedPairId) {
    (next.competitionPairAssignments || []).forEach((item) => {
      if (item && item.fixedPairId === edit.source.fixedPairId) item.fixedPairId = edit.newPairId;
    });
  }
  if (participantCount !== 1 || matchCount < 1) throw new Error('referências incompletas no rascunho');
  return next;
}

module.exports = { plan, legacyItem, findLegacyMirror, sourceSlot, patchPair, mirrorWritePatch, patchDraft, hasIdentity };
