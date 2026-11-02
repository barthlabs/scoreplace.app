'use strict';

const { stable, digest, validTimestamp } = require('./backup-torneio-operacional-core.js');
const audit = require('./auditar-reconciliacao-espelhos-core.js');
const roster = require('../functions/match-roster.js');

const TARGETS = Object.freeze([
  { name: 'BT Corpus Christi 2026', kind: 'thirdPlace', count: 1 },
  { name: 'Torneio Misto FUTVOLEI', kind: 'groupRounds', count: 12 },
  { name: 'Duplas Mistas Sorteadas', kind: 'thirdPlace', count: 1 }
]);

function canonical(value) { return stable(stable(value)); }
function same(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
function hash(value) { return digest(JSON.stringify(canonical(value))); }
function requireValue(ok, message) { if (!ok) throw new Error(message); }

function inlineGames(data, kind) {
  const out = [];
  if (kind === 'thirdPlace') {
    if (data.thirdPlaceMatch) out.push({ game: data.thirdPlaceMatch, loc: { tipo: 'thirdPlace' } });
  } else if (kind === 'groupRounds') {
    (Array.isArray(data.groups) ? data.groups : []).forEach((group, gi) => {
      (group && Array.isArray(group.rounds) ? group.rounds : []).forEach((round, ri) => {
        requireValue(round && !Array.isArray(round), 'rodada de grupo inválida');
        (Array.isArray(round.matches) ? round.matches : []).forEach((game, mi) => {
          out.push({ game, loc: { tipo: 'groupRounds', gi, ri, mi } });
        });
      });
    });
  } else throw new Error('tipo de posição inválido');
  return out;
}

function verifyBackup(body, sidecar, raw) {
  requireValue(body && sidecar && body.schema === 'scoreplace/tournament-operational-backup/1' &&
    body.project === 'scoreplace-app' && sidecar.project === body.project &&
    sidecar.tournamentId === body.tournamentId && typeof raw === 'string' &&
    sidecar.sha256 === digest(raw),
  'backup inválido');
  requireValue(body.tournament && body.tournament.id === body.tournamentId &&
    validTimestamp(body.tournament.updateTime) && body.subcollections &&
    typeof body.subcollections === 'object', 'backup incompleto');
  return sidecar.sha256;
}

function validateTarget(target, root, collections, backup, backupHash) {
  requireValue(root && root.exists && root.id === backup.tournamentId &&
    root.data().name === target.name && backup.tournament.data.name === target.name,
  'alvo ausente ou divergente');
  requireValue(same(root.data(), backup.tournament.data) &&
    same(root.updateTime, backup.tournament.updateTime), 'raiz mudou desde o backup');
  const actualNames = Object.keys(collections).sort();
  const backupNames = Object.keys(backup.subcollections).sort();
  requireValue(same(actualNames, backupNames), 'subcoleções mudaram desde o backup');
  for (const name of actualNames) {
    const docs = collections[name];
    const saved = backup.subcollections[name];
    requireValue(Array.isArray(docs) && Array.isArray(saved) && docs.length === saved.length,
      'subcoleção mudou desde o backup');
    const byId = new Map(saved.map((entry) => [entry.id, entry.data]));
    requireValue(byId.size === saved.length, 'backup com documento duplicado');
    for (const doc of docs) requireValue(byId.has(doc.id) && same(doc.data(), byId.get(doc.id)),
      'documento mudou desde o backup');
  }
  const matches = new Map((collections.matches || []).map(doc => [doc.id, doc]));
  const results = new Map((collections.results || []).map(doc => [doc.id, doc]));
  requireValue(matches.size === (collections.matches || []).length &&
    results.size === (collections.results || []).length, 'ID duplicado em subcoleção');
  requireValue(root.data()._nJogos === matches.size && root.data()._nPartes &&
    root.data()._nPartes.matches === matches.size,
  'contadores físicos divergentes antes da migração');
  const games = inlineGames(root.data(), target.kind);
  requireValue(games.length === target.count &&
    roster.collectMatches(root.data()).length === target.count, 'jogos inline fora do lote');
  const ids = new Set();
  const entries = games.map(({ game, loc }) => {
    const id = game && game.id != null ? String(game.id) : '';
    requireValue(id && !id.includes('/') && !ids.has(id), 'ID inline ausente ou repetido');
    ids.add(id);
    requireValue(!matches.has(id), 'destino físico já ocupado');
    const result = results.get(id);
    requireValue(result && String(result.data().matchId) === id, 'resultado correspondente ausente');
    for (const field of roster.RESULT_FIELDS) {
      if (game[field] == null || result.data()[field] == null) continue;
      requireValue(!audit.difference(result.data(), game, field), 'resultado divergente');
    }
    return { id, loc, game: stable(game), gameHash: hash(game),
      destination: root.ref.path + '/matches/' + id,
      result: { path: result.ref.path, updateTime: stable(result.updateTime), hash: hash(result.data()) } };
  });
  return { name: target.name, root: { path: root.ref.path, updateTime: stable(root.updateTime),
    hash: hash(root.data()) }, backupHash, existingMatches: matches.size,
    existingResults: results.size, entries };
}

function buildManifest(targets) {
  requireValue(Array.isArray(targets) && targets.length === TARGETS.length &&
    targets.reduce((sum, item) => sum + item.entries.length, 0) === 14,
  'manifesto incompleto');
  const entries = targets.flatMap(item => item.entries.map(entry => item.root.path + '/' + entry.id));
  requireValue(new Set(entries).size === entries.length, 'ID repetido no manifesto');
  const manifest = { schema: 'scoreplace/e05-inline-preview/1', project: 'scoreplace-app',
    applicable: false, targets };
  manifest.digest = hash(manifest);
  return manifest;
}

function publicReport(manifest) {
  return { targets: manifest.targets.map(item => ({ name: item.name, games: item.entries.length,
    location: item.entries[0].loc.tipo, existingMatches: item.existingMatches })),
  games: 14, digest: manifest.digest, applicable: false, productionWrites: 0 };
}

module.exports = { TARGETS, same, hash, inlineGames, verifyBackup, validateTarget,
  buildManifest, publicReport };
