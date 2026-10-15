'use strict';

// Importação assistida: uma fotografia revisada de duplas ocupa apenas vagas
// manuais existentes. Não escolhe contas por nome e não toca no Firestore.
const crypto = require('crypto');
const boundary = require('./canonical-registration-boundary-core');
const claims = require('./registration-claim-core');
const mutations = require('./registration-mutations-core');
const manualNames = require('./manual-name-unique-core');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function active(item) { return item && (item.status === 'confirmed' || item.status === 'pending'); }
function placeholder(item) {
  return active(item) && item.participantKind === 'manual' &&
    /^Jogador\s+\d+$/i.test(text(item.manualDisplayName));
}
function slots(registrations) {
  const pairs = new Map();
  (registrations || []).forEach((item) => {
    if (!text(item.fixedPairId)) return;
    if (!pairs.has(item.fixedPairId)) pairs.set(item.fixedPairId, []);
    pairs.get(item.fixedPairId).push(item);
  });
  return Array.from(pairs.entries()).filter(([, members]) => members.length === 2 && members.every(placeholder) &&
    members[0].categoryId === members[1].categoryId)
    .map(([pairId, members]) => ({
      pairId,
      categoryId: members[0].categoryId,
      members: members.slice().sort((a, b) => a.registrationId.localeCompare(b.registrationId))
        .map((item) => ({ registrationId: item.registrationId, manualParticipantId: item.manualParticipantId, name: item.manualDisplayName })),
    })).sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.pairId.localeCompare(b.pairId));
}
function fingerprint(tournament, registrations) {
  const rows = (registrations || []).map((item) => [item.registrationId, item.status, item.categoryId,
    item.fixedPairId || '', item.manualDisplayName || '', item.participantUid || ''])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return crypto.createHash('sha256').update(JSON.stringify([tournament.id, tournament.canonicalRegistrationMigration, rows])).digest('hex');
}
function normalizedBlock(block) {
  if (!Array.isArray(block) || !block.length || block.length > 8) throw new Error('bloco exige de 1 a 8 duplas');
  const usedPairs = new Set(), usedUids = new Set();
  return block.map((row) => {
    const pairId = text(row && row.pairId), categoryId = text(row && row.categoryId);
    if (!pairId || !categoryId || usedPairs.has(pairId)) throw new Error('vaga de dupla inválida ou repetida');
    usedPairs.add(pairId);
    const people = row && row.people;
    if (!Array.isArray(people) || people.length !== 2) throw new Error('dupla exige duas pessoas');
    return { pairId, categoryId, people: people.map((person) => {
      const name = text(person && person.name).replace(/\s+/g, ' ');
      const uid = text(person && person.uid);
      if (name.length < 2 || name.length > 120 || /[<>\u0000-\u001f]/.test(name)) throw new Error('nome inválido');
      if (uid && (uid.length > 128 || usedUids.has(uid))) throw new Error('conta inválida ou repetida');
      if (uid) usedUids.add(uid);
      return { name, uid: uid || null }; // null é a escolha explícita “Nenhum destes”.
    }) };
  });
}
function payloadHash(block) {
  return crypto.createHash('sha256').update(JSON.stringify(normalizedBlock(block))).digest('hex');
}
function receiptNames(block) {
  return normalizedBlock(block).flatMap((row, pairIndex) => row.people.map((person, side) => ({
    pairIndex, side, name: person.name, uid: person.uid,
  })));
}
function applyReviewedBlock(tournament, registrations, rawBlock) {
  const block = normalizedBlock(rawBlock);
  const tid = text(tournament && tournament.id);
  if (!tid) throw new Error('torneio inválido');
  const original = boundary.verifiedRoster(tournament, registrations).registrations;
  let current = original.slice();
  for (const row of block) {
    const pair = current.filter((item) => item.fixedPairId === row.pairId && active(item));
    if (pair.length !== 2 || pair.some((item) => !placeholder(item) || item.categoryId !== pair[0].categoryId)) {
      throw new Error('vaga alterada; atualize a prévia');
    }
    const sorted = pair.slice().sort((a, b) => a.registrationId.localeCompare(b.registrationId));
    if (pair[0].categoryId !== row.categoryId) {
      const move = mutations.reclassify(tid, current,
        { manualParticipantId: sorted[0].manualParticipantId }, pair[0].categoryId, row.categoryId);
      current = boundary.applyChanges(Object.assign({}, tournament, {
        canonicalRegistrationMigration: Object.assign({}, tournament.canonicalRegistrationMigration, { registrationCount: current.length }),
      }), current, move.updates, move.creates).registrations;
    }
    for (let index = 0; index < 2; index++) {
      const source = current.find((item) => item.manualParticipantId === sorted[index].manualParticipantId &&
        item.categoryId === row.categoryId && active(item));
      if (!source) throw new Error('vaga reclassificada não encontrada');
      const person = row.people[index];
      let changes;
      if (person.uid) {
        changes = claims.claimManualParticipant(tid, current, source.manualParticipantId, person.uid);
      } else {
        changes = { updates: [Object.assign({}, source, { manualDisplayName: person.name })], creates: [] };
      }
      const next = boundary.applyChanges(Object.assign({}, tournament, {
        canonicalRegistrationMigration: Object.assign({}, tournament.canonicalRegistrationMigration, { registrationCount: current.length }),
      }), current, changes.updates, changes.creates);
      current = next.registrations;
    }
  }
  const names = current.filter((item) => active(item) && item.participantKind === 'manual')
    .map((item) => manualNames.normalizeName(item.manualDisplayName));
  if (new Set(names).size !== names.length) throw new Error('nomes manuais repetidos; revise antes de gravar');
  const before = new Map(original.map((item) => [item.registrationId, item]));
  return {
    updates: current.filter((item) => before.has(item.registrationId) && JSON.stringify(item) !== JSON.stringify(before.get(item.registrationId))),
    creates: current.filter((item) => !before.has(item.registrationId)),
  };
}
module.exports = { slots, fingerprint, normalizedBlock, payloadHash, receiptNames, applyReviewedBlock };
