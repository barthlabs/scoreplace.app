'use strict';

/*
 * Identidade e transição pura da marca VIP do torneio.
 *
 * VIP não é um apelido visual: é uma marca administrativa da pessoa inscrita.
 * Por isso a entrada aceita exclusivamente uid de conta ou manualParticipantId
 * do convidado criado pelo organizador. Nome nunca participa da leitura, da
 * validação ou da escrita — dois homônimos não podem alternar a mesma marca.
 */

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function normalizeIdentity(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const uid = text(raw.uid);
  const manualParticipantId = text(raw.manualParticipantId || raw.manualId);
  if ((uid && manualParticipantId) || (!uid && !manualParticipantId)) {
    throw new Error('VIP exige exatamente um UID ou ID manual');
  }
  return uid ? { uid } : { manualParticipantId };
}

function identityKey(identity) {
  const item = normalizeIdentity(identity);
  return item.uid ? 'uid:' + item.uid : 'manual:' + item.manualParticipantId;
}

function vipMapKey(identity) {
  const item = normalizeIdentity(identity);
  // UIDs preservam a chave pública já consumida pelo cliente. IDs manuais são
  // prefixados, evitando que um UID coincida com um identificador manual.
  return item.uid || 'manual:' + item.manualParticipantId;
}

function normalizeTargets(data) {
  const raw = data && typeof data === 'object' ? data : {};
  const list = Array.isArray(raw.identities) && raw.identities.length
    ? raw.identities
    : [{ uid: raw.uid, manualParticipantId: raw.manualParticipantId || raw.manualId }];
  if (!list.length || list.length > 2) throw new Error('VIP exige uma ou duas identidades');
  const seen = new Set();
  return list.map(normalizeIdentity).map((identity) => {
    const key = identityKey(identity);
    if (seen.has(key)) throw new Error('VIP recebeu a mesma identidade mais de uma vez');
    seen.add(key);
    return identity;
  });
}

function entryIdentities(entry) {
  if (!entry || typeof entry !== 'object') return [];
  const candidates = [];
  if (Array.isArray(entry.participants)) {
    entry.participants.forEach((person) => candidates.push(person));
  }
  candidates.push(
    { uid: entry.p1Uid, manualParticipantId: entry.p1ManualId },
    { uid: entry.p2Uid, manualParticipantId: entry.p2ManualId },
    { uid: entry.uid, manualParticipantId: entry.manualParticipantId }
  );
  const seen = new Set();
  return candidates.reduce((out, candidate) => {
    try {
      const identity = normalizeIdentity(candidate);
      const key = identityKey(identity);
      if (!seen.has(key)) { seen.add(key); out.push(identity); }
    } catch (_) { /* slots sem identidade estável não servem para VIP */ }
    return out;
  }, []);
}

function rosterHasTargets(roster, targets) {
  const available = new Set();
  (Array.isArray(roster) ? roster : []).forEach((entry) => {
    entryIdentities(entry).forEach((identity) => available.add(identityKey(identity)));
  });
  return targets.every((identity) => available.has(identityKey(identity)));
}

function toggle(vips, targets, timestamp) {
  const next = Object.assign({}, vips || {});
  const keys = targets.map(vipMapKey);
  const wasVip = keys.every((key) => !!next[key]);
  if (wasVip) keys.forEach((key) => { delete next[key]; });
  else keys.forEach((key) => { next[key] = timestamp; });
  return { vips: next, isVip: !wasVip };
}

module.exports = {
  normalizeIdentity,
  normalizeTargets,
  identityKey,
  vipMapKey,
  entryIdentities,
  rosterHasTargets,
  toggle,
};
