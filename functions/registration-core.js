'use strict';

const crypto = require('crypto');

/*
 * Núcleo puro do registro canônico de inscrição.
 *
 * A migração ainda não escreve esta estrutura: ela primeiro produz um plano
 * determinístico do roster legado. Duplas viram duas inscrições individuais
 * mais um vínculo de dupla; convidados sem conta ganham um identificador
 * manual opaco a partir da chave física do registro, nunca do nome.
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

function sourceKeyOf(record) {
  return text(record && record.sourceKey);
}

function valueOf(record) {
  return record && Object.prototype.hasOwnProperty.call(record, 'entry') ? record.entry : record;
}

function hasValue(value) {
  return text(value.uid) || text(value.manualParticipantId) || text(value.displayName) || text(value.name);
}

/*
 * Slots preservam posição deliberadamente. Duas pessoas homônimas numa dupla
 * continuam sendo duas pessoas — nome é apenas rótulo e não pode deduplicar a
 * identidade durante uma migração.
 */
function legacySlots(entry) {
  if (typeof entry === 'string') return text(entry) ? [{ slot: 'solo', name: text(entry) }] : [];
  if (!entry || typeof entry !== 'object') return [];
  if (Array.isArray(entry.participants) && entry.participants.length) {
    return entry.participants.map((person, index) => {
      if (typeof person === 'string') return { slot: 'member:' + index, name: text(person) };
      const item = person && typeof person === 'object' ? person : {};
      return { slot: 'member:' + index, uid: text(item.uid), manualParticipantId: text(item.manualParticipantId), name: text(item.displayName || item.name) };
    }).filter(hasValue);
  }
  const pair = text(entry.p1Uid) || text(entry.p2Uid) || text(entry.p1ManualId) || text(entry.p2ManualId) || text(entry.p1Name) || text(entry.p2Name);
  if (pair) {
    return [
      { slot: 'p1', uid: text(entry.p1Uid), manualParticipantId: text(entry.p1ManualId), name: text(entry.p1Name) },
      { slot: 'p2', uid: text(entry.p2Uid), manualParticipantId: text(entry.p2ManualId), name: text(entry.p2Name) },
    ].filter(hasValue);
  }
  return [{ slot: 'solo', uid: text(entry.uid), manualParticipantId: text(entry.manualParticipantId), name: text(entry.displayName || entry.name) }].filter(hasValue);
}

function derivedManualParticipantId(tournamentId, sourceKey, slot) {
  if (!sourceKey) return '';
  return 'legacy-manual-' + crypto.createHash('sha256')
    .update(String(tournamentId) + '\u0000' + sourceKey + '\u0000' + slot)
    .digest('hex').slice(0, 32);
}

function pairId(tournamentId, sourceKey, memberKeys) {
  const stable = sourceKey || memberKeys.slice().sort().join('\u0000');
  return 'legacy-pair-' + crypto.createHash('sha256')
    .update(String(tournamentId) + '\u0000' + stable)
    .digest('hex').slice(0, 32);
}

/*
 * Entrada do planejador: `{ sourceKey, entry }`. sourceKey é o ID físico do
 * documento no espelho split; sem ela, um convidado sem ID continua bloqueado
 * em vez de receber uma identidade que mudaria a cada releitura de um array.
 */
function projectLegacyRoster(tournamentId, records) {
  const registrations = [];
  const formedPairs = [];
  const conflicts = [];
  const unsupported = [];
  const seen = new Set();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const entry = valueOf(record);
    const sourceKey = sourceKeyOf(record);
    const slots = legacySlots(entry);
    if (!slots.length) {
      unsupported.push({ index: index, reason: 'participante sem identidade estável' });
      return;
    }
    if (slots.length > 2) {
      // A plataforma suporta time individual ou dupla. Não projetamos uma
      // fração de equipe inválida, porque a futura escrita precisa ser atômica.
      unsupported.push({ index: index, reason: 'equipe com mais de dois participantes' });
      return;
    }
    const memberKeys = [];
    for (const slot of slots) {
      const normalized = { uid: slot.uid, manualParticipantId: slot.manualParticipantId };
      if (!normalized.uid && !normalized.manualParticipantId) {
        normalized.manualParticipantId = derivedManualParticipantId(tournamentId, sourceKey, slot.slot);
      }
      if (!normalized.uid && !normalized.manualParticipantId) {
        unsupported.push({ index: index, reason: 'convidado sem sourceKey estável' });
        return;
      }
      let generated;
      try { generated = registrationsForEntry(tournamentId, Object.assign({}, entry || {}, normalized)); }
      catch (error) { unsupported.push({ index: index, reason: error.message }); return; }
      memberKeys.push(participantKey(normalized));
      generated.forEach((registration) => {
        if (seen.has(registration.registrationId)) {
          conflicts.push({ index: index, registrationId: registration.registrationId });
          return;
        }
        seen.add(registration.registrationId);
        registrations.push(registration);
      });
    }
    if (slots.length === 2) {
      formedPairs.push({
        tournamentId: text(tournamentId),
        pairId: pairId(tournamentId, sourceKey, memberKeys),
        memberKeys: memberKeys,
        categoryIds: categoryIds(entry),
        sourceKey: sourceKey || null,
      });
    }
  });
  // O fingerprint amarra a aprovação humana ao censo exato. Ele não inclui
  // nome, foto, e-mail ou telefone: só IDs de registro e posições de exceção.
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
    registrations: registrations.map((item) => item.registrationId).sort(),
    formedPairs: formedPairs.map((item) => item.pairId).sort(),
    conflicts: conflicts.map((item) => item.registrationId).sort(),
    unsupported: unsupported.map((item) => item.reason + ':' + item.index).sort(),
  })).digest('hex');
  return { registrations: registrations, formedPairs: formedPairs, conflicts: conflicts, unsupported: unsupported, fingerprint: fingerprint };
}

function dryRunLegacyRoster(tournamentId, entries) {
  return projectLegacyRoster(tournamentId, entries);
}

module.exports = {
  UNCATEGORIZED_CATEGORY_ID,
  participantKey,
  categoryIds,
  registrationId,
  registrationsForEntry,
  projectLegacyRoster,
  derivedManualParticipantId,
  dryRunLegacyRoster,
};
