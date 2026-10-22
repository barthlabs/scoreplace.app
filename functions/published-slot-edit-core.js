'use strict';

// Uma troca na chave publicada altera somente a identidade e os nomes da vaga.
// A agenda, a posição na chave e os campos de resultado permanecem intactos.
const split = require('./vendor/tournament-split-core');
const slot = require('./edit-canonical-slot-core');
const { hasOutcome } = require('./published-claim-core');

const replaceDisplay = (value, oldName, newName, required) => {
  if (typeof value !== 'string' || !oldName) {
    if (required) throw new Error('nome do lado do jogo ausente');
    return value;
  }
  let count = 0;
  const next = value.split(' / ').map((part) => {
    if (part !== oldName) return part;
    count++;
    return newName;
  }).join(' / ');
  if ((required && count !== 1) || count > 1) throw new Error('nome do lado do jogo ambíguo');
  if (count === 0 && value.includes(oldName)) throw new Error('nome do lado do jogo ambíguo');
  return next;
};

const started = (game, result) => {
  if (hasOutcome(game) || hasOutcome(result)) return true;
  if (game && game.liveScored === true) return true;
  return [game, result].some((item) => item && [
    'calledAt', 'warmupAt', 'startedAt', 'endedAt', 'finishedAt',
    'courtCalledAt', 'courtStartedAt', 'courtEndedAt', 'pendingResult',
  ].some((key) => item[key] != null && item[key] !== false && item[key] !== ''));
};

function plan(edit, participantDocs, matchDocs, resultDocs) {
  if (!edit || !edit.source || !edit.partner || !edit.newIdentity) throw new Error('edição incompleta');
  const mirror = slot.findLegacyMirror(participantDocs, edit);
  const oldItem = slot.legacyItem(mirror.data);
  const oldSlot = slot.sourceSlot(oldItem, edit);
  const nextItem = { ...oldItem };
  if (!slot.patchPair(nextItem, edit, { legacyMirror: true })) throw new Error('espelho da dupla ausente');
  for (const field of ['name', 'displayName']) {
    if (typeof oldItem[field] === 'string') {
      nextItem[field] = replaceDisplay(oldItem[field], oldItem[oldSlot + 'Name'], edit.newName);
    }
  }
  if (edit.newPairId !== edit.source.fixedPairId) nextItem.fixedPairId = edit.newPairId;
  const newId = split.chaveDoInscrito(nextItem);
  if (!newId || !mirror.ref || !mirror.ref.id) throw new Error('chave de espelho inválida');
  if (newId !== mirror.ref.id && participantDocs.some((item) => item.ref.id === newId)) {
    throw new Error('conta de destino já possui espelho no torneio');
  }
  const participantData = mirror.data.item
    ? { ...mirror.data, _k: newId, item: nextItem }
    : nextItem;
  const byResult = new Map(resultDocs.map((item) => [item.ref.id, item]));
  const matches = [];
  const results = [];
  for (const doc of matchDocs) {
    const data = doc.data;
    const game = data.jogo || data;
    let next = null;
    for (const n of [1, 2]) {
      const original = game['team' + n + 'Obj'];
      if (!original || original.fixedPairId !== edit.source.fixedPairId) continue;
      const side = { ...original };
      if (!slot.patchPair(side, edit)) continue;
      const sourceSlot = slot.sourceSlot(original, edit);
      const oldName = original[sourceSlot + 'Name'];
      for (const field of ['name', 'displayName']) {
        if (typeof original[field] === 'string') {
          side[field] = replaceDisplay(original[field], oldName, edit.newName);
        }
      }
      const resultDoc = byResult.get(doc.ref.id);
      if (started(game, resultDoc && resultDoc.data)) throw new Error('jogo já chamado, iniciado ou com placar');
      if (next) throw new Error('vaga em dois lados do mesmo jogo');
      const uids = [side.p1Uid, side.p2Uid].filter(Boolean);
      next = { ...game, ['team' + n + 'Obj']: side,
        ['team' + n + 'Uids']: uids,
        ['p' + n + 'Uid']: uids.length === 1 ? uids[0] : null,
        ['p' + n]: replaceDisplay(game['p' + n], oldName, edit.newName, true) };
    }
    if (!next) continue;
    if (String(game.id || doc.ref.id) !== doc.ref.id) throw new Error('ID de jogo inconsistente');
    if (typeof next.p1 !== 'string' || typeof next.p2 !== 'string') throw new Error('nomes do jogo incompletos');
    const playerUids = [...new Set([...(next.team1Uids || []), ...(next.team2Uids || [])])];
    const matchData = data.jogo ? { ...data, jogo: next, playerUids } : { ...next, playerUids };
    matches.push({ ref: doc.ref, data: matchData });
    const resultDoc = byResult.get(doc.ref.id);
    if (resultDoc) {
      results.push({ ref: resultDoc.ref, data: { ...resultDoc.data,
        p1: next.p1, p2: next.p2, team1Uids: next.team1Uids,
        team2Uids: next.team2Uids, p1Uid: next.p1Uid || null,
        p2Uid: next.p2Uid || null, playerUids } });
    }
  }
  if (!matches.length) throw new Error('jogos da vaga não encontrados');
  if (matches.length > 100 || 2 * matches.length + 8 > 450) throw new Error('edição grande demais');
  const sourceId = edit.source.participantKind === 'account'
    ? { uid: edit.source.participantUid } : { manualParticipantId: edit.source.manualParticipantId };
  const touched = new Set(matches.map((item) => item.ref.id));
  if (matchDocs.some((doc) => !touched.has(doc.ref.id) &&
      ['team1Obj', 'team2Obj'].some((key) => {
        const side = (doc.data.jogo || doc.data)[key];
        return side && side.fixedPairId === edit.source.fixedPairId && slot.hasIdentity(side, sourceId);
      }))) throw new Error('referência da vaga sem atualização');
  return { participant: { oldRef: mirror.ref, newId, data: participantData }, matches, results };
}

module.exports = { plan, started };
