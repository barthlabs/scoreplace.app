'use strict';

const crypto = require('crypto');

/*
 * Núcleo puro do registro canônico de inscrição.
 *
 * A migração ainda não escreve esta estrutura: ela primeiro produz um censo
 * determinístico do roster legado. Isso impede que uma entrada de equipe ou
 * uma categoria ausente seja transformada silenciosamente em uma inscrição
 * individual errada.
 */

const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function participantKey(entry) {
  const uid = text(entry && entry.uid);
  const manualId = text(entry && entry.manualParticipantId);
  if (uid && manualId) throw new Error('participante não pode ter uid e manualParticipantId');
  if (uid) return 'uid:' + uid;
  if (manualId) return 'manual:' + manualId;
  throw new Error('participante sem identidade estável');
}

function categoryIds(entry) {
  const raw = Array.isArray(entry && entry.categories)
    ? entry.categories
    : [entry && entry.category];
  const ids = raw.map(text).filter(Boolean);
  return Array.from(new Set(ids)).sort().length ? Array.from(new Set(ids)).sort() : [UNCATEGORIZED_CATEGORY_ID];
}

function registrationId(key, categoryId) {
  // Base64url preserva a separação estrutural do id, inclusive quando rótulos
  // legados contêm '/' ou outros caracteres que não cabem em um document ID.
  return Buffer.from(String(key), 'utf8').toString('base64url') + '__' +
    Buffer.from(String(categoryId), 'utf8').toString('base64url');
}

function registrationsForEntry(tournamentId, entry) {
  const tid = text(tournamentId);
  if (!tid) throw new Error('tournamentId obrigatório');
  const key = participantKey(entry);
  return categoryIds(entry).map((categoryId) => ({
    tournamentId: tid,
    participantKey: key,
    categoryId: categoryId,
    registrationId: registrationId(key, categoryId),
  }));
}

function isCompositeEntry(entry) {
  return !!(entry && (text(entry.p1Uid) || text(entry.p2Uid) ||
    (Array.isArray(entry.participants) && entry.participants.length)));
}

function dryRunLegacyRoster(tournamentId, entries) {
  const registrations = [];
  const conflicts = [];
  const unsupported = [];
  const seen = new Set();
  (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
    if (isCompositeEntry(entry)) {
      unsupported.push({ index: index, reason: 'composite_entry' });
      return;
    }
    let generated;
    try { generated = registrationsForEntry(tournamentId, entry); }
    catch (error) {
      unsupported.push({ index: index, reason: error.message });
      return;
    }
    generated.forEach((registration) => {
      if (seen.has(registration.registrationId)) {
        conflicts.push({ index: index, registrationId: registration.registrationId });
        return;
      }
      seen.add(registration.registrationId);
      registrations.push(registration);
    });
  });
  // O fingerprint amarra a aprovação humana ao censo exato. Ele não inclui
  // nome, foto, e-mail ou telefone: só IDs de registro e posições de exceção.
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
    registrations: registrations.map((item) => item.registrationId).sort(),
    conflicts: conflicts.map((item) => item.registrationId).sort(),
    unsupported: unsupported.map((item) => item.reason + ':' + item.index).sort(),
  })).digest('hex');
  return { registrations: registrations, conflicts: conflicts, unsupported: unsupported, fingerprint: fingerprint };
}

module.exports = {
  UNCATEGORIZED_CATEGORY_ID,
  participantKey,
  categoryIds,
  registrationId,
  registrationsForEntry,
  dryRunLegacyRoster,
};
