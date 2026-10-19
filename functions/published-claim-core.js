'use strict';

// A published draw is immutable as a schedule. Claiming a manual slot may
// replace only that slot's identity and the indexes derived from it.
const split = require('./vendor/tournament-split-core');
const { RESULT_FIELDS } = require('./match-roster');

const signal = (value) => typeof value === 'number' ? value !== 0 :
  typeof value === 'string' ? value.trim() !== '' :
  Array.isArray(value) ? value.length > 0 :
  value && typeof value === 'object' ? Object.keys(value).length > 0 : value === true;
const hasOutcome = (item) => !!(item && (
  RESULT_FIELDS.some((key) => key !== 'fixedSet' && signal(item[key])) ||
  ['pending', 'winnerId', 'liveState', 'isLive', 'score', 'replay'].some((key) => signal(item[key]))
));

function hasManualIdentity(value, manualId) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, part]) =>
    ((key === 'manualParticipantId' || /ManualId$/.test(key)) && part === manualId) ||
    hasManualIdentity(part, manualId));
}

function plan(manualId, oldPairId, newPairId, uid, participantDocs, matchDocs, resultDocs) {
  if (!manualId || !oldPairId || !newPairId || !uid) throw new Error('identidade incompleta');
  const participants = [];
  const matches = [];
  const resultsById = new Map((resultDocs || []).map((doc) => [doc.id, doc]));
  const participantHits = [];
  for (const doc of participantDocs || []) {
    const data = doc.data || {};
    const item = data.item || data;
    const slots = ['p1', 'p2'].filter((slot) => item[slot + 'ManualId'] === manualId);
    if (!slots.length) continue;
    if (slots.length !== 1 || item.fixedPair !== true ||
        (item.fixedPairId && item.fixedPairId !== oldPairId) || item[slots[0] + 'Uid']) {
      throw new Error('espelho da dupla ambíguo');
    }
    const slot = slots[0];
    const nextItem = Object.assign({}, item);
    delete nextItem[slot + 'ManualId'];
    nextItem[slot + 'Uid'] = uid;
    nextItem.fixedPairId = newPairId;
    const nextKey = split.chaveDoInscrito(nextItem);
    if (!nextKey || !doc.id || nextKey === doc.id) throw new Error('chave de inscrição inconsistente');
    participants.push({ id: doc.id, newId: nextKey, data: data.item ? Object.assign({}, data, { _k: nextKey, item: nextItem }) : nextItem });
    participantHits.push(doc.id);
  }
  if (participantHits.length !== 1) throw new Error('espelho da dupla ausente ou ambíguo');

  for (const doc of matchDocs || []) {
    const data = doc.data || {};
    const game = data.jogo || data;
    let updated = null;
    for (const n of [1, 2]) {
      const side = (updated || game)['team' + n + 'Obj'];
      if (!side || typeof side !== 'object') continue;
      const slots = ['p1', 'p2'].filter((slot) => side[slot + 'ManualId'] === manualId);
      if (!slots.length) continue;
      if (slots.length !== 1 || side.fixedPairId !== oldPairId || side[slots[0] + 'Uid']) {
        throw new Error('referência de jogo ambígua');
      }
      if (hasOutcome(game)) throw new Error('jogo iniciado ou com resultado; chame a organização');
      const slot = slots[0];
      const nextSide = Object.assign({}, side);
      delete nextSide[slot + 'ManualId'];
      nextSide[slot + 'Uid'] = uid;
      nextSide.fixedPairId = newPairId;
      updated = Object.assign({}, updated || game, { ['team' + n + 'Obj']: nextSide });
      const teamUids = [nextSide.p1Uid, nextSide.p2Uid].filter(Boolean);
      updated['team' + n + 'Uids'] = teamUids;
      updated['p' + n + 'Uid'] = teamUids.length === 1 ? teamUids[0] : null;
    }
    if (!updated) continue;
    const id = String(game.id || doc.id);
    if (!id || id !== doc.id) throw new Error('ID de jogo inconsistente');
    const result = resultsById.get(id);
    if (result && hasOutcome(result.data)) throw new Error('resultado de jogo existente; chame a organização');
    const playerUids = Array.from(new Set([].concat(updated.team1Uids || [], updated.team2Uids || [])));
    matches.push({ id, data: data.jogo ? Object.assign({}, data, { jogo: updated, playerUids }) : updated,
      result: result ? { id, playerUids } : null });
  }
  if (!matches.length) throw new Error('jogos da vaga não encontrados');
  if (matches.length > 100) throw new Error('vínculo grande demais; chame a organização');
  const replacementParticipant = participants[0];
  const finalParticipants = (participantDocs || []).map((doc) =>
    doc.id === replacementParticipant.id ? replacementParticipant.data : doc.data);
  const matchById = new Map(matches.map((match) => [match.id, match.data]));
  const finalMatches = (matchDocs || []).map((doc) => matchById.get(doc.id) || doc.data);
  if (finalParticipants.some((data) => hasManualIdentity(data, manualId)) ||
      finalMatches.some((data) => hasManualIdentity(data, manualId))) {
    throw new Error('referência antiga restante; chame a organização');
  }
  return { participants, matches };
}

module.exports = { plan, hasOutcome };
