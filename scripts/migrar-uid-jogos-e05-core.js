'use strict';

// E05: a identidade de consulta pertence ao jogo físico. O espelho antigo é
// conferência, nunca origem de um UID que não exista no próprio confronto.
const crypto = require('node:crypto');
const roster = require('../functions/match-roster.js');
const audit = require('./auditar-reconciliacao-espelhos-core.js');
const { stable } = require('./backup-torneio-operacional-core.js');

const MAX_WRITES = 400;
const MAX_BYTES = 4 * 1024 * 1024;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const present = value => value !== undefined && value !== null;

function snapshot(doc) {
  if (!doc || !doc.id || !doc.ref || !doc.ref.path || !doc.updateTime || typeof doc.data !== 'function') {
    throw new Error('snapshot sem identidade ou versão');
  }
  return { id: doc.id, path: doc.ref.path, updateTime: stable(doc.updateTime),
    hash: hash(doc.data()), data: stable(doc.data()) };
}

function index(docs, path) {
  if (!Array.isArray(docs)) throw new Error('coleção incompleta');
  const out = new Map();
  for (const doc of docs) {
    const item = snapshot(doc);
    if (item.path !== path + '/' + item.id || out.has(item.id)) throw new Error('coleção com caminho ou ID duplicado');
    out.set(item.id, item);
  }
  return out;
}

function structuralUids(game) {
  const left = roster.slotUids(game, 'p1');
  const right = roster.slotUids(game, 'p2');
  const all = left.concat(right);
  if (!all.length) return [];
  if (all.some(uid => typeof uid !== 'string' || !uid.trim()) ||
      new Set(all).size !== all.length) throw new Error('UID estrutural inválido ou repetido');
  return all;
}

function classify(rootDoc, matchDocs, resultDocs) {
  const root = snapshot(rootDoc);
  if (!/^tournaments\/[^/]+$/.test(root.path) || root.id !== root.path.split('/')[1] ||
      root.data.isSandbox === true) throw new Error('raiz real inválida');
  const matches = index(matchDocs, root.path + '/matches');
  const results = index(resultDocs, root.path + '/results');
  const count = matches.size;
  const nJogos = root.data._nJogos;
  const nPartes = root.data._nPartes && root.data._nPartes.matches;
  if (roster.collectMatches(root.data).length ||
      (count && (!Number.isSafeInteger(nJogos) || !Number.isSafeInteger(nPartes) ||
        nJogos !== count || nPartes !== count)) ||
      (nJogos != null && nJogos !== count) || (nPartes != null && nPartes !== count)) {
    throw new Error('jogos físicos sem prova de completude');
  }
  const bytes = Buffer.byteLength(JSON.stringify({ root: root.data,
    matches: [...matches.values()].map(x => x.data), results: [...results.values()].map(x => x.data) }));
  if (bytes > MAX_BYTES) throw new Error('alvo supera teto de bytes transacionais');
  const candidates = [];
  const counts = { matches: count, results: results.size, alreadyIndexed: 0,
    noStructuralUid: 0, candidates: 0, scoredCandidates: 0 };
  for (const [id, match] of matches) {
    const part = match.data, game = part.jogo;
    if (!part || part._chave !== id || !part._loc || typeof part._loc !== 'object' ||
        !game || typeof game !== 'object' || Array.isArray(game) ||
        typeof game.id !== 'string' || game.id !== id) throw new Error('jogo físico inválido');
    const result = results.get(id);
    if (!result || !result.data || result.data.matchId !== id) throw new Error('par de resultado ausente ou inválido');
    for (const field of roster.RESULT_FIELDS) {
      if (present(result.data[field]) && present(game[field]) &&
          audit.difference(result.data, game, field)) throw new Error('resultado divergente');
      if (present(result.data[field]) && !present(game[field])) throw new Error('campo de resultado só no espelho');
    }
    const uids = structuralUids(game);
    const existing = part.playerUids;
    if (Array.isArray(existing) && existing.length) {
      if (existing.some(uid => typeof uid !== 'string' || !uid.trim()) ||
          new Set(existing).size !== existing.length) throw new Error('índice físico inválido');
      if (uids.length && roster.rosterKey(existing) !== roster.rosterKey(uids)) {
        throw new Error('índice físico diverge do jogo');
      }
      if (Array.isArray(result.data.playerUids) && result.data.playerUids.length &&
          roster.rosterKey(existing) !== roster.rosterKey(result.data.playerUids)) {
        throw new Error('índice físico diverge do espelho');
      }
      counts.alreadyIndexed++;
      continue;
    }
    if (existing != null && (!Array.isArray(existing) || existing.length)) throw new Error('índice físico inválido');
    if (!uids.length) { counts.noStructuralUid++; continue; }
    if (!Array.isArray(result.data.playerUids) ||
        roster.rosterKey(result.data.playerUids) !== roster.rosterKey(uids)) {
      throw new Error('UID estrutural diverge do espelho');
    }
    candidates.push({ id, path: match.path, uids });
    counts.candidates++;
    if (game.scoreP1 != null && game.scoreP2 != null) counts.scoredCandidates++;
  }
  if (candidates.length > MAX_WRITES) throw new Error('alvo supera teto de escritas transacionais');
  const manifest = { schema: 'scoreplace/e05-uid-index/1', project: 'scoreplace-app',
    name: String(root.data.name || ''),
    root: { id: root.id, path: root.path, updateTime: root.updateTime, hash: root.hash },
    matches: [...matches.values()].map(({ id, path, updateTime, hash }) => ({ id, path, updateTime, hash })),
    results: [...results.values()].map(({ id, path, updateTime, hash }) => ({ id, path, updateTime, hash })),
    candidates, counts, bytes };
  manifest.digest = hash(manifest);
  return manifest;
}

function assertSame(actual, expected) {
  if (!expected || actual.digest !== expected.digest ||
      hash(actual) !== hash(expected)) throw new Error('prévia obsoleta ou divergente');
}

function assertAfter(before, after, expected) {
  const oldRoot = snapshot(before.root), newRoot = snapshot(after.root);
  if (oldRoot.hash !== newRoot.hash || hash(oldRoot.updateTime) !== hash(newRoot.updateTime) ||
      before.matches.length !== after.matches.length || before.results.length !== after.results.length) {
    throw new Error('pós-auditoria: raiz ou contagem mudou');
  }
  const previousResults = index(before.results, oldRoot.path + '/results');
  const currentResults = index(after.results, oldRoot.path + '/results');
  for (const [id, old] of previousResults) {
    const next = currentResults.get(id);
    if (!next || old.hash !== next.hash || hash(old.updateTime) !== hash(next.updateTime)) {
      throw new Error('pós-auditoria: espelho mudou');
    }
  }
  const oldMatches = index(before.matches, oldRoot.path + '/matches');
  const newMatches = index(after.matches, oldRoot.path + '/matches');
  const candidates = new Map(expected.candidates.map(item => [item.id, item]));
  for (const [id, old] of oldMatches) {
    const next = newMatches.get(id), candidate = candidates.get(id);
    if (!next) throw new Error('pós-auditoria: jogo ausente');
    if (!candidate) {
      if (old.hash !== next.hash || hash(old.updateTime) !== hash(next.updateTime)) {
        throw new Error('pós-auditoria: jogo não candidato mudou');
      }
    } else {
      const proposed = { ...old.data, playerUids: candidate.uids };
      if (next.hash !== hash(proposed) || hash(old.updateTime) === hash(next.updateTime)) {
        throw new Error('pós-auditoria: alteração além de playerUids');
      }
    }
  }
}

module.exports = { MAX_WRITES, MAX_BYTES, hash, snapshot, structuralUids, classify, assertSame, assertAfter };
