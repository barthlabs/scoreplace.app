'use strict';

const split = require('../functions/vendor/tournament-split-core.js');
const roster = require('../functions/match-roster.js');
const mirror = require('../functions/match-result-mirror-core.js');
const phaseAudit = require('./auditar-indice-fases-core.js');
const backfill = require('./backfill-indice-fases-core.js');

const FIELDS = Object.freeze(['playerUids', ...roster.RESULT_FIELDS,
  'p1', 'p2', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid', 'tournamentName', 'roundLabel']);
const UID_FIELDS = new Set(['playerUids', 'team1Uids', 'team2Uids']);
const SCORE_FIELDS = new Set(['scoreP1', 'scoreP2', 'winner', 'draw', 'sets',
  'setsWonP1', 'setsWonP2', 'totalGamesP1', 'totalGamesP2', 'fixedSet', 'wo', 'woAbsent', 'woAbsentSide']);

function empty() {
  return { tournaments: 0, matches: 0, results: 0, phase: { ok: 0, ausente: 0, ambiguo: 0, divergente: 0 },
    counterMismatches: 0, duplicateMatches: 0, duplicateResults: 0, missingResults: 0, orphanResults: 0,
    invalidDocuments: 0, fields: { absentInMirror: 0, absentInMatch: 0, orderOnly: 0,
      emptyMirrorToDerivedUids: 0, differentUids: 0, pendingResultDiff: 0, scoreDiff: 0, otherDiff: 0 },
    evidence: { pairedMatches: 0, withoutMirror: 0, unmountableMatch: 0,
      uidStructuralEvidence: 0, uidEvidenceInsufficient: 0, uidSideConflict: 0,
      uidInsufficientSideConflict: 0, uidInsufficientMissingSide: 0,
      uidInsufficientOverlappingSides: 0, uidInsufficientNoExplicitUid: 0,
      uidInsufficientRegistration: 0, uidInsufficientOther: 0,
      orphanWithRecordedPlay: 0, orphanWithReplay: 0, orphanWithoutPlayEvidence: 0,
      orphanInlineRoot: 0,
      pendingMirrorOnly: 0, pendingMatchOnly: 0, pendingBothDifferent: 0,
      pendingWithoutEventTimestamp: 0 } };
}

function uidSet(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? [...new Set(value)].sort() : null;
}

function difference(previous, desired, field) {
  const before = previous[field];
  const after = desired[field];
  if (roster.canonicalJson(before) === roster.canonicalJson(after)) return null;
  if (before === undefined) return 'absentInMirror';
  if (after === undefined) return 'absentInMatch';
  if (UID_FIELDS.has(field)) {
    const oldSet = uidSet(before);
    const newSet = uidSet(after);
    if (oldSet && newSet && JSON.stringify(oldSet) === JSON.stringify(newSet)) return 'orderOnly';
    if (oldSet && newSet && oldSet.length === 0 && newSet.length > 0) return 'emptyMirrorToDerivedUids';
    return 'differentUids';
  }
  if (field === 'pendingResult') return 'pendingResultDiff';
  if (SCORE_FIELDS.has(field)) return 'scoreDiff';
  return 'otherDiff';
}

function explicitSide(game, side) {
  const array = side === 1 ? game.team1Uids : game.team2Uids;
  const single = side === 1 ? game.p1Uid : game.p2Uid;
  if (Array.isArray(array) && array.length) return array.filter((uid) => typeof uid === 'string' && uid.length);
  return typeof single === 'string' && single.length ? [single] : [];
}

function occupied(game, side) {
  const label = side === 1 ? game.p1 : game.p2;
  return label != null && label !== '' && label !== 'TBD' && label !== 'BYE';
}

function sideConflict(previous, game) {
  for (const side of [1, 2]) {
    const actual = explicitSide(game, side);
    const mirrored = explicitSide(previous, side);
    if (!actual.length || !mirrored.length) continue;
    if (JSON.stringify(uidSet(actual)) !== JSON.stringify(uidSet(mirrored))) return true;
  }
  return false;
}

function registrationCounts(mounted) {
  const counts = new Map();
  const entries = Array.isArray(mounted.participants) ? mounted.participants : Object.values(mounted.participants || {});
  for (const participant of entries) {
    for (const uid of new Set(roster.participantUids(participant))) {
      counts.set(uid, (counts.get(uid) || 0) + 1);
    }
  }
  return counts;
}

function classifyUidEvidence(game, registrations, conflict, evidence) {
  const sides = [1, 2].map((side) => explicitSide(game, side));
  const union = [...new Set(sides.flat())];
  const complete = [1, 2].every((side) => !occupied(game, side) || sides[side - 1].length > 0);
  const separate = sides[0].every((uid) => !sides[1].includes(uid));
  if (complete && separate && union.length && !conflict && union.every((uid) => registrations.get(uid) === 1)) {
    evidence.uidStructuralEvidence++;
  } else {
    evidence.uidEvidenceInsufficient++;
    if (conflict) evidence.uidInsufficientSideConflict++;
    else if (!complete) evidence.uidInsufficientMissingSide++;
    else if (!separate) evidence.uidInsufficientOverlappingSides++;
    else if (!union.length) evidence.uidInsufficientNoExplicitUid++;
    else if (union.some((uid) => registrations.get(uid) !== 1)) evidence.uidInsufficientRegistration++;
    else evidence.uidInsufficientOther++;
  }
}

function inlineMatchIds(tournament) {
  const counts = new Map();
  if (!Array.isArray(tournament.matches)) return new Set();
  for (const match of tournament.matches) {
    const value = match && match.id;
    if (!((typeof value === 'string' && value.length > 0) ||
      (typeof value === 'number' && Number.isFinite(value)))) continue;
    const id = String(value);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count === 1).map(([id]) => id));
}

function hasRecordedPlay(result) {
  return [...SCORE_FIELDS, 'resultAt', 'startedAt'].some((field) =>
    result[field] !== undefined && result[field] !== null) ||
    (result.pendingResult !== undefined && result.pendingResult !== null);
}

function classifyPending(previous, desired, evidence) {
  if (roster.canonicalJson(previous.pendingResult) === roster.canonicalJson(desired.pendingResult)) return;
  if (previous.pendingResult === undefined) evidence.pendingMatchOnly++;
  else if (desired.pendingResult === undefined) evidence.pendingMirrorOnly++;
  else evidence.pendingBothDifferent++;
  if (!previous.resultAt && !previous.startedAt && !desired.resultAt && !desired.startedAt) {
    evidence.pendingWithoutEventTimestamp++;
  }
}

function decodeDocs(docs, collection, root, decode, counts) {
  if (!Array.isArray(docs)) throw new Error('coleção incompleta');
  const result = [];
  const paths = new Set();
  for (const doc of docs) {
    let name;
    try {
      name = backfill.validDocument(doc, collection);
      if (!name.startsWith(root + '/' + collection + '/')) throw new Error('torneio divergente');
      if (paths.has(name)) {
        if (collection === 'matches') counts.duplicateMatches++;
        else if (collection === 'results') counts.duplicateResults++;
        else counts.invalidDocuments++;
        continue;
      }
      paths.add(name);
      const data = decode(doc);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('documento incompleto');
      result.push({ id: name.slice(name.lastIndexOf('/') + 1), data });
    } catch (_) {
      counts.invalidDocuments++;
    }
  }
  return result;
}

async function analyze(tournamentDoc, matchDocs, resultDocs, extraCollections, decode) {
  const counts = empty();
  counts.tournaments = 1;
  const root = backfill.validTournament(tournamentDoc);
  const tournament = decode(tournamentDoc);
  const inlineIds = inlineMatchIds(tournament);
  const matches = decodeDocs(matchDocs, 'matches', root, decode, counts);
  const results = decodeDocs(resultDocs, 'results', root, decode, counts);
  counts.matches = matches.length;
  counts.results = results.length;
  const byId = new Map();
  for (const item of matches) {
    const id = item.data && item.data.jogo && item.data.jogo.id;
    if (id == null || String(id) !== item.id) { counts.invalidDocuments++; continue; }
    if (byId.has(item.id)) { counts.duplicateMatches++; continue; }
    byId.set(item.id, item.data);
  }
  const resultById = new Map();
  for (const item of results) {
    if (item.data.matchId == null || String(item.data.matchId) !== item.id) {
      counts.invalidDocuments++;
      continue;
    }
    resultById.set(item.id, item.data);
  }
  for (const [id, result] of resultById) {
    if (byId.has(id)) continue;
    counts.orphanResults++;
    if (inlineIds.has(id)) counts.evidence.orphanInlineRoot++;
    if (hasRecordedPlay(result)) counts.evidence.orphanWithRecordedPlay++;
    if (result.replay != null) counts.evidence.orphanWithReplay++;
    if (!hasRecordedPlay(result) && result.replay == null) counts.evidence.orphanWithoutPlayEvidence++;
  }
  const phase = phaseAudit.report(tournament, matches.map((item) => item.data));
  counts.phase = phase.counts;
  if (!phase.counterMatches) counts.counterMismatches++;
  const loaded = { matches: matches.map((item) => item.data) };
  for (const [collection, docs] of Object.entries(extraCollections || {})) {
    loaded[collection] = decodeDocs(docs, collection, root, decode, counts).map((item) => item.data);
  }
  let mounted;
  try {
    mounted = await split.montarDoBanco(tournament, (collection) => {
      if (!Object.prototype.hasOwnProperty.call(loaded, collection)) throw new Error('subcoleção não lida');
      return loaded[collection];
    });
  } catch (_) {
    counts.invalidDocuments++;
    return counts;
  }
  const registrations = registrationCounts(mounted);
  for (const [id] of byId) {
    const previous = resultById.get(id);
    if (!previous) { counts.missingResults++; counts.evidence.withoutMirror++; continue; }
    const game = mirror.jogoPorId(mounted, id);
    if (!game) { counts.invalidDocuments++; counts.evidence.unmountableMatch++; continue; }
    counts.evidence.pairedMatches++;
    const desired = roster.buildSeedDoc(mounted, game);
    for (const field of FIELDS) {
      const kind = difference(previous, desired, field);
      if (kind) counts.fields[kind]++;
    }
    const conflict = sideConflict(previous, game);
    if (conflict) counts.evidence.uidSideConflict++;
    if (difference(previous, desired, 'playerUids')) {
      classifyUidEvidence(game, registrations, conflict, counts.evidence);
    }
    classifyPending(previous, desired, counts.evidence);
  }
  return counts;
}

function aggregate(reports) {
  const total = empty();
  for (const report of reports) {
    for (const key of ['tournaments', 'matches', 'results', 'counterMismatches', 'duplicateMatches',
      'duplicateResults', 'missingResults', 'orphanResults', 'invalidDocuments']) total[key] += report[key];
    for (const key of Object.keys(total.phase)) total.phase[key] += report.phase[key];
    for (const key of Object.keys(total.fields)) total.fields[key] += report.fields[key];
    for (const key of Object.keys(total.evidence)) total.evidence[key] += report.evidence[key];
  }
  total.healthy = total.counterMismatches === 0 && total.duplicateMatches === 0 &&
    total.duplicateResults === 0 && total.missingResults === 0 && total.orphanResults === 0 &&
    total.invalidDocuments === 0 && total.phase.ausente === 0 && total.phase.ambiguo === 0 &&
    total.phase.divergente === 0 && Object.values(total.fields).every((count) => count === 0);
  return total;
}

module.exports = { FIELDS, difference, analyze, aggregate };
