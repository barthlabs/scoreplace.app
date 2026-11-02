'use strict';

// E05: classificação privada para uma migração futura; nunca produz plano aplicável.
const split = require('../js/views/tournament-split-core.js');
const roster = require('../functions/match-roster.js');
const audit = require('./auditar-reconciliacao-espelhos-core.js');
const { stable, digest } = require('./backup-torneio-operacional-core.js');

const knownResultFields = new Set(['matchId', 'tournamentId', 'tournamentName', 'updatedAt',
  'playerUids', 'p1', 'p2', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid', 'roundLabel',
  'replay', ...roster.RESULT_FIELDS]);
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const hash = value => digest(JSON.stringify(stable(value)));
const present = value => value !== undefined && value !== null;

function requireSnapshot(snapshot, collection) {
  if (!snapshot || !snapshot.exists || typeof snapshot.data !== 'function' ||
      !snapshot.id || !snapshot.updateTime || !snapshot.ref ||
      !snapshot.ref.path.startsWith(collection + '/')) throw new Error('snapshot inválido');
  return snapshot.data();
}

function indexDocs(docs, prefix) {
  if (!Array.isArray(docs)) throw new Error('coleção incompleta');
  const byId = new Map();
  for (const doc of docs) {
    if (!doc || !doc.exists || !doc.id || !doc.updateTime ||
        doc.ref?.path !== prefix + '/' + doc.id || byId.has(doc.id)) throw new Error('documento inválido');
    byId.set(doc.id, doc);
  }
  return byId;
}

function classify(sandbox, origin, sandboxMatches, sourceMatches, results) {
  const sb = requireSnapshot(sandbox, 'sandboxes');
  const src = requireSnapshot(origin, 'tournaments');
  if (sandbox.ref.path !== 'sandboxes/' + sandbox.id ||
      origin.ref.path !== 'tournaments/' + origin.id ||
      sb.isSandbox !== true || sb.sbState !== 'ready' ||
      sb.sandboxOf !== origin.id || !sandbox.id.startsWith('sb_' + origin.id + '_') ||
      src.isSandbox === true) throw new Error('origem do sandbox não comprovada');

  const local = indexDocs(sandboxMatches, sandbox.ref.path + '/matches');
  const source = indexDocs(sourceMatches, origin.ref.path + '/matches');
  const resultDocs = indexDocs(results, sandbox.ref.path + '/resultsSandbox');
  const sourceParts = [...source.values()].map(doc => doc.data());
  for (const [id, doc] of source) {
    const part = doc.data();
    if (!part || !part.jogo || String(part.jogo.id) !== id || !part._loc) {
      throw new Error('partida física da origem sem posição');
    }
  }
  const remounted = split.remontar({ config: sb, matches: sourceParts });
  if (!remounted) throw new Error('posição da origem não remonta no sandbox');
  const visible = roster.collectMatches(remounted);
  const visibleIds = visible.map(game => String(game && game.id || ''));
  if (visibleIds.length !== source.size || new Set(visibleIds).size !== source.size ||
      visibleIds.some(id => !source.has(id))) throw new Error('partida da origem não remonta uma vez');

  const entries = [], blocked = [];
  const counts = { results: resultDocs.size, localMatches: local.size,
    sourceMatches: source.size, orphanResults: 0, sourceCandidates: 0,
    unresolved: 0, conflicts: 0, unknownFields: 0, uidNeedsProof: 0 };
  for (const [id, doc] of resultDocs) {
    const result = doc.data();
    if (!result || String(result.matchId) !== id) throw new Error('ID interno divergente');
    if (local.has(id)) continue;
    counts.orphanResults++;
    const physical = source.get(id);
    if (!physical) {
      counts.unresolved++;
      blocked.push({ matchId: id, reason: 'source-match-absent', resultPath: doc.ref.path,
        resultUpdateTime: stable(doc.updateTime), resultHash: hash(result) });
      continue;
    }
    const game = physical.data().jogo;
    let conflict = false;
    for (const field of roster.RESULT_FIELDS) {
      if (present(result[field]) && present(game[field]) && audit.difference(result, game, field)) {
        conflict = true;
      }
    }
    if (present(result.replay) && present(game.replay) && !same(result.replay, game.replay)) conflict = true;
    const unknown = Object.keys(result).filter(field => !knownResultFields.has(field));
    counts.unknownFields += unknown.length;
    if (unknown.length) conflict = true;
    const gameUids = physical.data().playerUids;
    const resultUids = result.playerUids;
    if (Array.isArray(gameUids) && gameUids.length && Array.isArray(resultUids) && resultUids.length &&
        roster.rosterKey(gameUids) !== roster.rosterKey(resultUids)) conflict = true;
    const needsUidProof = !Array.isArray(gameUids) || !gameUids.length;
    if (needsUidProof) counts.uidNeedsProof++;
    if (conflict) {
      counts.conflicts++;
      blocked.push({ matchId: id, reason: 'field-conflict', resultPath: doc.ref.path,
        resultUpdateTime: stable(doc.updateTime), resultHash: hash(result),
        sourcePath: physical.ref.path, sourceUpdateTime: stable(physical.updateTime),
        sourceHash: hash(physical.data()) });
      continue;
    }
    counts.sourceCandidates++;
    entries.push({ matchId: id, sourcePath: physical.ref.path, sourceUpdateTime: stable(physical.updateTime),
      sourceHash: hash(physical.data()), resultPath: doc.ref.path,
      resultUpdateTime: stable(doc.updateTime), resultHash: hash(result), needsUidProof });
  }
  if (counts.orphanResults !== counts.sourceCandidates + counts.unresolved + counts.conflicts) {
    throw new Error('censo incompleto');
  }
  const manifest = { schema: 'scoreplace/e05-sandbox-preview/1', project: 'scoreplace-app',
    applicable: false, sandbox: { path: sandbox.ref.path, updateTime: stable(sandbox.updateTime), hash: hash(sb) },
    origin: { path: origin.ref.path, updateTime: stable(origin.updateTime), hash: hash(src) },
    counts, entries, blocked };
  manifest.digest = hash(manifest);
  return manifest;
}

function publicReport(manifests) {
  const counts = { sandboxes: manifests.length, results: 0, orphanResults: 0,
    sourceCandidates: 0, unresolved: 0, conflicts: 0, uidNeedsProof: 0 };
  for (const manifest of manifests) for (const key of Object.keys(counts)) {
    if (key !== 'sandboxes') counts[key] += manifest.counts[key] || 0;
  }
  return { counts, digest: hash(manifests), applicable: false, productionWrites: 0 };
}

module.exports = { classify, publicReport };
