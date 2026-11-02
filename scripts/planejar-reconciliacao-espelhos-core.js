'use strict';

/* Prévia pura da 3.2.8. Nunca escreve em Firestore e nunca usa nome para obter UID. */
const crypto = require('node:crypto');
const split = require('../functions/vendor/tournament-split-core.js');
const roster = require('../functions/match-roster.js');
const mirror = require('../functions/match-result-mirror-core.js');
const backfill = require('./backfill-indice-fases-core.js');

const IDENTITY_FIELDS = Object.freeze(['playerUids', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid']);
const OTHER_FIELDS = Object.freeze([...roster.RESULT_FIELDS, 'p1', 'p2', 'tournamentName', 'roundLabel']);

function digest(value) {
  return crypto.createHash('sha256').update(roster.canonicalJson(value)).digest('hex');
}

function sameIdentity(field, before, after) {
  if (field === 'playerUids' && Array.isArray(before) && Array.isArray(after)) {
    return roster.rosterKey(before) === roster.rosterKey(after);
  }
  return roster.canonicalJson(before) === roster.canonicalJson(after);
}

function explicitSide(game, side) {
  const array = side === 1 ? game.team1Uids : game.team2Uids;
  const single = side === 1 ? game.p1Uid : game.p2Uid;
  if (Array.isArray(array) && array.length) {
    if (array.some((uid) => typeof uid !== 'string' || !uid.length)) return [];
    if (single && !array.includes(single)) return [];
    return array;
  }
  return typeof single === 'string' && single.length ? [single] : [];
}

function occupied(game, side) {
  const label = side === 1 ? game.p1 : game.p2;
  return label != null && label !== '' && label !== 'TBD' && label !== 'BYE';
}

function registrationCounts(tournament) {
  const counts = new Map();
  const participants = Array.isArray(tournament.participants)
    ? tournament.participants : Object.values(tournament.participants || {});
  for (const participant of participants) {
    for (const uid of new Set(roster.participantUids(participant))) {
      counts.set(uid, (counts.get(uid) || 0) + 1);
    }
  }
  return counts;
}

function structuralIdentityProof(game, previous, desired, registrations) {
  const sides = [explicitSide(game, 1), explicitSide(game, 2)];
  if ([1, 2].some((side) => occupied(game, side) && !sides[side - 1].length)) return false;
  const union = [...new Set(sides.flat())];
  if (!union.length || sides[0].some((uid) => sides[1].includes(uid))) return false;
  if (sides.flat().length !== union.length ||
      roster.rosterKey(desired.playerUids) !== roster.rosterKey(union)) return false;
  if (union.some((uid) => registrations.get(uid) !== 1)) return false;
  if (Array.isArray(previous.playerUids) && previous.playerUids.length &&
      roster.rosterKey(previous.playerUids) !== roster.rosterKey(union)) return false;
  for (const side of [1, 2]) {
    const old = explicitSide(previous, side);
    if (!old.length) continue;
    if (roster.rosterKey(old) !== roster.rosterKey(sides[side - 1])) return false;
  }
  return true;
}

function decodeCollection(docs, collection, root, decode) {
  if (!Array.isArray(docs)) throw new Error('coleção incompleta');
  const byId = new Map();
  for (const doc of docs) {
    const name = backfill.validDocument(doc, collection);
    if (!name.startsWith(root + '/' + collection + '/')) throw new Error('coleção de outro torneio');
    const id = name.slice(name.lastIndexOf('/') + 1);
    if (byId.has(id)) throw new Error('documento duplicado');
    byId.set(id, { doc, data: decode(doc) });
  }
  return byId;
}

async function planTournament(tournamentDoc, matchDocs, resultDocs, extraCollections, decode, readTime) {
  if (!readTime) throw new Error('readTime obrigatório');
  const root = backfill.validTournament(tournamentDoc);
  const config = decode(tournamentDoc);
  const matches = decodeCollection(matchDocs, 'matches', root, decode);
  const results = decodeCollection(resultDocs, 'results', root, decode);
  const loaded = { matches: [...matches.values()].map((entry) => entry.data) };
  for (const [collection, docs] of Object.entries(extraCollections || {})) {
    loaded[collection] = [...decodeCollection(docs, collection, root, decode).values()].map((entry) => entry.data);
  }
  const mounted = await split.montarDoBanco(config, (collection, _name) => {
    if (!Object.hasOwn(loaded, collection)) throw new Error('subcoleção exigida não lida');
    return loaded[collection];
  });
  const registrations = registrationCounts(mounted);
  const summary = { matches: matches.size, results: results.size, candidates: 0,
    candidateFields: 0, unchanged: 0, blocked: 0, noUidProof: 0,
    nonIdentityDifference: 0, hiddenPreserved: 0, orphansPreserved: 0, missingMirrors: 0 };
  const targets = [];
  for (const [id, { doc, data }] of matches) {
    if (!data.jogo || String(data.jogo.id) !== id) throw new Error('ID de jogo divergente');
    const result = results.get(id);
    if (!result) { summary.missingMirrors++; summary.blocked++; continue; }
    if (String(result.data.matchId) !== id) throw new Error('ID de espelho divergente');
    const game = mirror.jogoPorId(mounted, id);
    if (!game) throw new Error('jogo não montado');
    const desired = roster.buildSeedDoc(mounted, game);
    const identity = IDENTITY_FIELDS.filter((field) => !sameIdentity(field, result.data[field], desired[field]));
    const other = OTHER_FIELDS.filter((field) =>
      roster.canonicalJson(result.data[field]) !== roster.canonicalJson(desired[field]));
    if (config.organizerOnly === true) {
      if (identity.length || other.length) summary.hiddenPreserved++;
      else summary.unchanged++;
      continue;
    }
    const tournamentId = root.slice(root.lastIndexOf('/') + 1);
    if (other.length || (result.data.tournamentId != null && String(result.data.tournamentId) !== tournamentId)) {
      summary.nonIdentityDifference++; summary.blocked++; continue;
    }
    if (!identity.length) { summary.unchanged++; continue; }
    if (!structuralIdentityProof(game, result.data, desired, registrations) ||
        identity.some((field) => desired[field] === undefined)) {
      summary.noUidProof++;
      summary.blocked++;
      continue;
    }
    summary.candidates++;
    summary.candidateFields += identity.length;
    targets.push({ match: doc.name, matchUpdateTime: doc.updateTime,
      result: result.doc.name, resultUpdateTime: result.doc.updateTime,
      fields: identity.map((field) => [field, desired[field]]) });
  }
  for (const id of results.keys()) if (!matches.has(id)) summary.orphansPreserved++;
  const snapshotDigest = digest({ tournamentDoc, matchDocs, resultDocs, extraCollections });
  return { summary, targets, snapshotDigest };
}

function aggregate(plans, readTime, sourceHashes, head, worktreeStatus) {
  if (!readTime || !/^\d{4}-\d\d-\d\dT/.test(readTime)) throw new Error('readTime obrigatório');
  const counts = { tournaments: plans.length, matches: 0, results: 0, candidates: 0,
    candidateFields: 0, unchanged: 0, blocked: 0, noUidProof: 0,
    nonIdentityDifference: 0, hiddenPreserved: 0, orphansPreserved: 0, missingMirrors: 0 };
  for (const plan of plans) for (const key of Object.keys(plan.summary)) counts[key] += plan.summary[key];
  const targets = plans.flatMap((plan) => plan.targets).sort((a, b) => a.result.localeCompare(b.result));
  const snapshots = plans.map((plan) => plan.snapshotDigest).sort();
  if (snapshots.some((value) => !/^[a-f0-9]{64}$/.test(value || ''))) throw new Error('snapshot incompleto');
  return { readTime, ...counts, sourceHashes, head, worktreeStatus,
    digest: digest({ readTime, counts, targets, snapshots, sourceHashes, head, worktreeStatus }) };
}

module.exports = { IDENTITY_FIELDS, OTHER_FIELDS, digest, sameIdentity,
  structuralIdentityProof, planTournament, aggregate };
