'use strict';

// E05: classificação somente leitura. Nenhuma decisão aqui autoriza escrita.
const crypto = require('node:crypto');
const roster = require('../functions/match-roster.js');
const mirrorAudit = require('./auditar-reconciliacao-espelhos-core.js');

const ROOTS = Object.freeze({ tournaments: 'results', sandboxes: 'resultsSandbox' });
const INDEX_FIELDS = new Set(['matchId', 'tournamentId', 'tournamentName', 'updatedAt',
  'playerUids', 'p1', 'p2', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid', 'roundLabel']);
const RECORD_FIELDS = new Set(roster.RESULT_FIELDS);

function rootPath(document, kind) {
  if (!Object.hasOwn(ROOTS, kind)) throw new Error('tipo de raiz inválido');
  const name = String(document && document.name || '');
  const pattern = new RegExp('^projects/[^/]+/databases/[^/]+/documents/' + kind + '/[^/]+$');
  if (!pattern.test(name)) throw new Error('raiz inválida');
  return name.split('/documents/')[1];
}

function docsById(docs, root, collection, decode, isMatch) {
  if (!Array.isArray(docs)) throw new Error('coleção incompleta');
  const out = new Map();
  for (const document of docs) {
    const name = String(document && document.name || '');
    const prefix = root + '/' + collection + '/';
    const relative = name.split('/documents/')[1];
    if (!relative || !relative.startsWith(prefix) || relative.slice(prefix.length).includes('/') ||
        !relative.slice(prefix.length)) throw new Error('documento fora da coleção');
    const id = relative.slice(prefix.length);
    if (out.has(id)) throw new Error('ID duplicado');
    const data = decode(document);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('documento inválido');
    if (isMatch ? (!data.jogo || String(data.jogo.id) !== id) : String(data.matchId) !== id) {
      throw new Error('ID interno divergente');
    }
    out.set(id, { document, data });
  }
  return out;
}

function present(value) { return value !== undefined && value !== null; }
function same(a, b) { return roster.canonicalJson(a) === roster.canonicalJson(b); }

function classifyRoot(rootDocument, matchDocs, resultDocs, kind, decode) {
  const root = rootPath(rootDocument, kind);
  if (typeof decode !== 'function') throw new Error('decodificador ausente');
  const config = decode(rootDocument);
  const matches = docsById(matchDocs, root, 'matches', decode, true);
  const results = docsById(resultDocs, root, ROOTS[kind], decode, false);
  const inline = roster.collectMatches(config);
  const counts = { roots: 1, matches: matches.size, results: results.size, paired: 0,
    withoutResult: 0, orphan: 0, orphanWithRecordData: 0, orphanWithoutRecordData: 0,
    orphanWithReplay: 0, orphanInlineCandidate: 0, orphanInlineScoreConflict: 0,
    orphanInlineFieldConflict: 0,
    inlineGames: inline.length, inlineOnly: 0,
    inlineDuplicates: 0, inlineDuplicateIds: 0, inlineScoreConflict: 0,
    inlineFieldConflict: 0, blockedInlineGames: 0,
    scoreConflict: 0, resultFieldConflict: 0, replayConflict: 0,
    resultOnlyRecordField: 0, resultOnlyReplay: 0,
    uidConflict: 0, uidNeedsProof: 0, noUidIndex: 0, unknownResultFields: 0,
    blockedRecords: 0, transferRecords: 0 };
  const inlineIds = new Set();
  const inlineById = new Map();
  const duplicateInlineIds = new Set();
  for (const game of inline) {
    const id = game && game.id != null ? String(game.id) : '';
    if (!id) throw new Error('jogo embutido sem ID');
    if (inlineIds.has(id)) { counts.inlineDuplicateIds++; duplicateInlineIds.add(id); continue; }
    inlineIds.add(id);
    inlineById.set(id, game);
    // Qualquer cópia embutida impede afirmar fonte física única, mesmo idêntica.
    counts.blockedInlineGames++;
    const physical = matches.get(id);
    if (!physical) { counts.inlineOnly++; continue; }
    counts.inlineDuplicates++;
    for (const field of RECORD_FIELDS) {
      if (!present(game[field]) || !present(physical.data.jogo[field])) continue;
      const difference = mirrorAudit.difference(game, physical.data.jogo, field);
      if (difference === 'scoreDiff') counts.inlineScoreConflict++;
      else if (difference) counts.inlineFieldConflict++;
    }
  }
  for (const [id, entry] of results) {
    if (matches.has(id)) continue;
    counts.orphan++;
    if (roster.RESULT_FIELDS.some((field) => present(entry.data[field]))) counts.orphanWithRecordData++;
    else counts.orphanWithoutRecordData++;
    if (present(entry.data.replay)) counts.orphanWithReplay++;
    if (inlineById.has(id) && !duplicateInlineIds.has(id)) {
      counts.orphanInlineCandidate++;
      const game = inlineById.get(id);
      for (const field of RECORD_FIELDS) {
        if (!present(entry.data[field]) || !present(game[field])) continue;
        const difference = mirrorAudit.difference(entry.data, game, field);
        if (difference === 'scoreDiff') counts.orphanInlineScoreConflict++;
        else if (difference) counts.orphanInlineFieldConflict++;
      }
    }
    counts.blockedRecords++;
  }
  for (const [id, entry] of matches) {
    const r = results.get(id);
    if (!r) { counts.withoutResult++; if (!Array.isArray(entry.data.playerUids) || !entry.data.playerUids.length) counts.noUidIndex++; continue; }
    counts.paired++;
    const game = entry.data.jogo;
    const result = r.data;
    let blocked = false;
    let transfer = false;
    for (const field of RECORD_FIELDS) {
      const difference = mirrorAudit.difference(result, game, field);
      if (!difference) continue;
      if (present(result[field]) && present(game[field])) {
        if (difference === 'scoreDiff') counts.scoreConflict++;
        else counts.resultFieldConflict++;
        blocked = true;
      }
      else if (present(result[field])) { counts.resultOnlyRecordField++; transfer = true; }
    }
    if (present(result.replay)) {
      if (present(game.replay) && !same(game.replay, result.replay)) { counts.replayConflict++; blocked = true; }
      else if (!present(game.replay)) { counts.resultOnlyReplay++; transfer = true; }
    }
    const matchUids = entry.data.playerUids;
    const resultUids = result.playerUids;
    if (!Array.isArray(matchUids) || !matchUids.length) {
      counts.noUidIndex++;
      if (Array.isArray(resultUids) && resultUids.length) { counts.uidNeedsProof++; blocked = true; }
    } else if (Array.isArray(resultUids) && resultUids.length &&
               roster.rosterKey(matchUids) !== roster.rosterKey(resultUids)) {
      counts.uidConflict++; blocked = true;
    }
    const unknown = Object.keys(result).filter((field) => !INDEX_FIELDS.has(field) &&
      !RECORD_FIELDS.has(field) && field !== 'replay');
    if (unknown.length) { counts.unknownResultFields += unknown.length; blocked = true; }
    if (blocked) counts.blockedRecords++;
    else if (transfer) counts.transferRecords++;
  }
  return counts;
}

function aggregate(reports, readTime) {
  if (!Array.isArray(reports) || !/^\d{4}-\d\d-\d\dT/.test(readTime || '')) throw new Error('snapshot inválido');
  const counts = {};
  for (const report of reports) for (const [key, value] of Object.entries(report)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('contagem inválida');
    counts[key] = (counts[key] || 0) + value;
  }
  // Digest do resumo agregado, sem identificadores de documentos; não autoriza aplicação.
  const summaryDigest = crypto.createHash('sha256').update(JSON.stringify({ readTime, counts })).digest('hex');
  return { readTime, counts, summaryDigest, applicable: false };
}

module.exports = { ROOTS, rootPath, docsById, classifyRoot, aggregate };
