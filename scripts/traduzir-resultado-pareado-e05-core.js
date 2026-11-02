'use strict';

// E05: tradução em memória. Este módulo não abre conexão nem aplica escrita.
const roster = require('../functions/match-roster.js');
const audit = require('./auditar-reconciliacao-espelhos-core.js');

const DISPLAY_FIELDS = Object.freeze([
  'p1', 'p2', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid', 'tournamentName', 'roundLabel'
]);
const AUTHORITATIVE_FIELDS = Object.freeze([...roster.RESULT_FIELDS, 'replay', 'winnerUid', 'winnerUids']);
const ALLOWED_RESULT_FIELDS = new Set([
  'matchId', 'tournamentId', 'updatedAt', 'playerUids',
  ...AUTHORITATIVE_FIELDS, ...DISPLAY_FIELDS
]);
const REASONS = Object.freeze({
  invalidPair: 'invalid_pair', duplicateMatch: 'duplicate_match',
  duplicateResult: 'duplicate_result', orphanResult: 'orphan_result',
  unknownField: 'unknown_result_field', invalidUid: 'invalid_uid_index',
  uidConflict: 'uid_conflict', resultConflict: 'result_conflict'
});

function same(left, right) { return roster.canonicalJson(left) === roster.canonicalJson(right); }
function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validUids(value) {
  return value === undefined || (Array.isArray(value) && value.every((uid) =>
    typeof uid === 'string' && uid.length > 0) && new Set(value).size === value.length);
}
function sameUids(left, right) {
  return roster.rosterKey(left) === roster.rosterKey(right) &&
    same([...left].sort(), [...right].sort());
}
function blocked(reason) { return { status: 'blocked', reason }; }

function translatePair(tournament, matchId, match, resultId, result) {
  if (!isObject(tournament) || !isObject(match) || !isObject(match.jogo) ||
      !isObject(result) || typeof matchId !== 'string' || !matchId ||
      typeof resultId !== 'string' || matchId !== resultId ||
      String(match.jogo.id) !== matchId || String(result.matchId) !== matchId ||
      (result.tournamentId !== undefined &&
        (tournament.id === undefined || String(result.tournamentId) !== String(tournament.id)))) {
    return blocked(REASONS.invalidPair);
  }
  if (Object.keys(result).some((field) => !ALLOWED_RESULT_FIELDS.has(field))) {
    return blocked(REASONS.unknownField);
  }
  const derived = roster.matchRoster(tournament, match.jogo);
  if (!validUids(derived) || !validUids(match.playerUids) || !validUids(result.playerUids)) {
    return blocked(REASONS.invalidUid);
  }
  if ([match.playerUids, result.playerUids].some((value) =>
    Array.isArray(value) && value.length && !sameUids(value, derived))) {
    return blocked(REASONS.uidConflict);
  }

  const game = { ...match.jogo };
  let copied = 0;
  const conflictKinds = new Set();
  for (const field of AUTHORITATIVE_FIELDS) {
    if (result[field] === undefined) continue;
    if (game[field] === undefined) { game[field] = result[field]; copied++; continue; }
    if (!same(game[field], result[field])) {
      conflictKinds.add(field === 'replay' ? 'replay' : audit.difference(result, game, field) || 'otherDiff');
    }
  }
  if (conflictKinds.size) return { ...blocked(REASONS.resultConflict), conflictKinds: [...conflictKinds].sort() };

  const proposed = { ...match, jogo: game };
  let filledUidIndex = false;
  if (derived.length && (!Array.isArray(match.playerUids) || !match.playerUids.length)) {
    proposed.playerUids = derived;
    filledUidIndex = true;
  }
  const displayDifferences = DISPLAY_FIELDS.filter((field) =>
    result[field] !== undefined && !same(result[field],
      field === 'tournamentName' ? tournament.name :
      field === 'roundLabel' ? (game.label || game.roundName) : game[field])).length;
  return { status: 'ready', proposed, copied, filledUidIndex, displayDifferences };
}

function translateCollection(tournament, matches, results) {
  if (!Array.isArray(matches) || !Array.isArray(results)) throw new Error('coleção incompleta');
  const byMatch = new Map();
  const byResult = new Map();
  for (const entry of matches) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) throw new Error('entrada de jogo inválida');
    if (!byMatch.has(entry.id)) byMatch.set(entry.id, []);
    byMatch.get(entry.id).push(entry.data);
  }
  for (const entry of results) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) throw new Error('entrada de resultado inválida');
    if (!byResult.has(entry.id)) byResult.set(entry.id, []);
    byResult.get(entry.id).push(entry.data);
  }
  const report = { matches: matches.length, results: results.length, pairedReady: 0,
    pairedBlocked: 0, orphanResults: 0, withoutResult: 0,
    copiedFields: 0, filledUidIndexes: 0, displayDifferences: 0, reasons: {} };
  const proposals = new Map();
  const addReason = (reason) => { report.reasons[reason] = (report.reasons[reason] || 0) + 1; };
  for (const [id, entries] of byMatch) {
    const resultEntries = byResult.get(id);
    if (entries.length !== 1) { report.pairedBlocked++; addReason(REASONS.duplicateMatch); continue; }
    if (!resultEntries) { report.withoutResult++; continue; }
    if (resultEntries.length !== 1) { report.pairedBlocked++; addReason(REASONS.duplicateResult); continue; }
    const translated = translatePair(tournament, id, entries[0], id, resultEntries[0]);
    if (translated.status === 'blocked') {
      report.pairedBlocked++;
      addReason(translated.reason);
      continue;
    }
    proposals.set(id, translated.proposed);
    report.pairedReady++;
    report.copiedFields += translated.copied;
    report.filledUidIndexes += Number(translated.filledUidIndex);
    report.displayDifferences += translated.displayDifferences;
  }
  for (const [id, entries] of byResult) {
    if (byMatch.has(id)) continue;
    report.orphanResults += entries.length;
    addReason(REASONS.orphanResult);
  }
  return { proposals, report };
}

module.exports = { AUTHORITATIVE_FIELDS, DISPLAY_FIELDS, REASONS, translatePair, translateCollection };
