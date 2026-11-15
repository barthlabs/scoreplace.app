'use strict';

const { normalizeName } = require('./manual-claim-link-core');
const { legacySlots, derivedManualParticipantId } = require('./registration-core');
const split = require('./vendor/tournament-split-core');

function nameKey(value) {
  const key = normalizeName(value);
  return key.split(' ').filter(Boolean).length >= 2 ? key : '';
}

function activeManual(registration) {
  return registration && registration.participantKind === 'manual' &&
    ['pending', 'confirmed', 'waitlisted'].includes(registration.status) &&
    typeof registration.manualParticipantId === 'string' && !!registration.manualParticipantId;
}

function accountPredatesTournament(creationTimeMs, tournament) {
  const when = Number(creationTimeMs);
  const start = tournament && tournament.startDate;
  const startMs = start && typeof start.toDate === 'function' ? start.toDate().getTime() : Date.parse(start);
  return Number.isFinite(when) && when > 0 && Number.isFinite(startMs) && when < startMs;
}

function uniqueManual(registrations, name, manualId) {
  const key = nameKey(name);
  if (!key) throw new Error('nome completo do perfil necessário');
  const sameName = (registrations || []).filter((item) =>
    item && item.participantKind === 'manual' && nameKey(item.manualDisplayName) === key);
  if (sameName.length !== 1 || !activeManual(sameName[0]) ||
      (manualId && sameName[0].manualParticipantId !== manualId)) {
    throw new Error('vaga ambígua ou indisponível; peça conferência à organização');
  }
  return sameName[0];
}

// Uma inscrição de conta homônima pode aparecer em jogos antigos sem UID.
// Nesse caso, o nome não identifica qual slot pertence à vaga manual.
function assertNoAccountHomonym(registrations, participantSlots, accountProfiles, name, uid) {
  const wanted = nameKey(name);
  for (const item of registrations || []) {
    if (!item || item.participantKind !== 'account') continue;
    const otherUid = String(item.participantUid || '');
    if (!otherUid) {
      throw new Error('identidade de outra inscrição indisponível; peça conferência à organização');
    }
    if (otherUid === uid) continue;
    const other = accountProfiles && accountProfiles[otherUid];
    if (!other || !nameKey(other.displayName)) {
      throw new Error('identidade de outra inscrição indisponível; peça conferência à organização');
    }
    if (nameKey(other.displayName) === wanted) {
      throw new Error('nome também pertence a outra conta neste torneio; peça conferência à organização');
    }
  }
  for (const slot of participantSlots || []) {
    if (slot.uid && slot.uid !== uid && nameKey(slot.name) === wanted) {
      throw new Error('nome também pertence a outra conta neste torneio; peça conferência à organização');
    }
  }
}

function planParticipantMirror(documents, tournamentId, manualId, name, uid) {
  const wanted = nameKey(name);
  if (!wanted || !uid || !manualId) throw new Error('identidade do espelho incompleta');
  const hits = [];
  for (const doc of documents || []) {
    const data = doc.data || {};
    const wrapped = Object.prototype.hasOwnProperty.call(data, 'item');
    const entry = wrapped ? data.item : data;
    for (const slot of legacySlots(entry)) {
      const slotId = slot.manualParticipantId || derivedManualParticipantId(tournamentId, doc.id, slot.slot);
      if (slotId === manualId) hits.push({ doc, data, entry, wrapped, slot });
    }
  }
  if (hits.length !== 1) throw new Error('espelho da vaga ausente ou ambíguo');
  const { doc, data, entry, wrapped, slot } = hits[0];
  if (wrapped && (!Number.isSafeInteger(data._idx) || data._idx < 0 ||
      (data._k != null && data._k !== doc.id))) {
    throw new Error('posição ou chave física do espelho inválida');
  }
  if (slot.uid || nameKey(slot.name) !== wanted) throw new Error('espelho da vaga divergente');
  let next;
  if (typeof entry === 'string') {
    next = { uid, displayName: entry };
  } else if (Array.isArray(entry.participants) && slot.slot.startsWith('member:')) {
    const index = Number(slot.slot.slice(7));
    const people = entry.participants.slice();
    const person = people[index];
    people[index] = typeof person === 'string' ? { uid, displayName: person } : { ...person, uid };
    if (typeof people[index] === 'object') delete people[index].manualParticipantId;
    next = { ...entry, participants: people };
  } else if (slot.slot === 'p1' || slot.slot === 'p2') {
    next = { ...entry, [slot.slot + 'Uid']: uid };
    delete next[slot.slot + 'ManualId'];
  } else if (slot.slot === 'solo') {
    next = { ...entry, uid };
    delete next.manualParticipantId;
  } else throw new Error('posição física da vaga inválida');
  const newId = split.chaveDoInscrito(next);
  if (!newId || newId === 'x' || (newId !== doc.id && documents.some((other) => other.id === newId))) {
    throw new Error('chave física de participante inválida ou ocupada');
  }
  const newData = wrapped ? { ...data, _k: newId, item: next } : next;
  return { oldId: doc.id, newId, before: data, after: newData, wrapped };
}

// O nome serve SOMENTE para achar o slot antigo. A identidade e o resultado
// continuam sendo os campos estruturais do jogo; nenhuma string de placar muda.
function patchMatch(physical, name, uid) {
  const game = physical && physical.jogo;
  if (!game || typeof game !== 'object' || !uid || !nameKey(name)) throw new Error('jogo ou identidade inválida');
  const wanted = nameKey(name);
  const patch = {};
  let hits = 0;
  for (const n of [1, 2]) {
    const team = game['team' + n];
    if (!Array.isArray(team)) continue;
    const matching = team.map((member, index) => nameKey(member) === wanted ? index : -1).filter((index) => index >= 0);
    if (!matching.length) continue;
    const raw = game['team' + n + 'Uids'];
    if (raw != null && (!Array.isArray(raw) || raw.length !== team.length)) throw new Error('slots de UID desalinhados');
    const uids = raw ? raw.slice() : team.map(() => null);
    for (const index of matching) {
      if (uids[index] && uids[index] !== uid) throw new Error('slot já pertence a outra conta');
      uids[index] = uid;
      hits++;
    }
    patch['jogo.team' + n + 'Uids'] = uids;
    const object = game['team' + n + 'Obj'];
    if (object != null) {
      if (!object || typeof object !== 'object' || Array.isArray(object)) {
        throw new Error('objeto estrutural do jogo inválido');
      }
      for (const index of matching) {
        const member = 'p' + (index + 1);
        if (nameKey(object[member + 'Name']) !== wanted ||
            (object[member + 'Uid'] && object[member + 'Uid'] !== uid)) {
          throw new Error('objeto estrutural do jogo diverge do slot nominal');
        }
        patch['jogo.team' + n + 'Obj.' + member + 'Uid'] = uid;
        if (object[member + 'ManualId']) patch['jogo.team' + n + 'Obj.' + member + 'ManualId'] = null;
      }
    }
    if (team.length === 1) {
      if (game['p' + n + 'Uid'] && game['p' + n + 'Uid'] !== uid) throw new Error('identidade individual divergente');
      patch['jogo.p' + n + 'Uid'] = uid;
    }
  }
  if (!hits) return null;
  if (hits !== 1) throw new Error('nome aparece em mais de um slot do jogo');
  const claimed = new Set(Array.isArray(game.historicalClaimUids) ? game.historicalClaimUids.filter(Boolean) : []);
  claimed.add(uid);
  patch['jogo.historicalClaimUids'] = Array.from(claimed).sort();
  const roster = new Set(Array.isArray(physical.playerUids) ? physical.playerUids.filter(Boolean) : []);
  [patch['jogo.team1Uids'] || game.team1Uids, patch['jogo.team2Uids'] || game.team2Uids].forEach((values) => {
    if (Array.isArray(values)) values.forEach((value) => { if (value) roster.add(value); });
  });
  patch.playerUids = Array.from(roster).sort();
  return patch;
}

function planMatches(documents, name, uid) {
  const patches = [];
  for (const doc of documents || []) {
    const data = doc.data || {};
    const game = data.jogo;
    if (!game || String(game.id || '') !== String(doc.id || '') ||
      (data._chave != null && data._chave !== doc.id)) throw new Error('jogo canônico inconsistente');
    const patch = patchMatch(data, name, uid);
    if (patch) patches.push({ id: doc.id, patch });
  }
  if (!patches.length) throw new Error('nenhum jogo desta vaga foi encontrado');
  if (patches.length > 100) throw new Error('vínculo grande demais para confirmação automática');
  return patches;
}

module.exports = { nameKey, activeManual, accountPredatesTournament, uniqueManual,
  assertNoAccountHomonym, planParticipantMirror, patchMatch, planMatches };
