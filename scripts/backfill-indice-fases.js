#!/usr/bin/env node
/* Passo 3.2.5: prévia e aplicação administrativa com digest, backup e CAS.
 * Nenhuma aplicação é automática; a execução real exige autorização do digest exato. */
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const split = require('../functions/vendor/tournament-split-core.js');
const core = require('./backfill-indice-fases-core.js');
const auditor = require('./auditar-indice-fases-core.js');
const { documentToObject } = require('./auditar-indice-fases.js');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token.js');

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';

function docUrl(fullName) {
  const relative = String(fullName).split('/documents/')[1];
  if (!relative || !/^tournaments\/[^/]+(?:\/(?:matches|results)\/[^/]+)?$/.test(relative)) {
    throw new Error('referência de documento inválida');
  }
  return new URL(BASE + '/' + relative.split('/').map(encodeURIComponent).join('/'));
}

async function listFull(fetchImpl, path, token, readTime) {
  const docs = [];
  const seenTokens = new Set();
  let pageToken = null;
  do {
    const url = new URL(BASE + '/' + path);
    url.searchParams.set('pageSize', '500');
    if (readTime) url.searchParams.set('readTime', readTime);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetchImpl(url, { method: 'GET', headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('leitura Firestore indisponível');
    const body = await response.json();
    docs.push(...(Array.isArray(body.documents) ? body.documents : []));
    pageToken = body.nextPageToken || null;
    if (pageToken) {
      if (seenTokens.has(pageToken)) throw new Error('paginação repetida');
      seenTokens.add(pageToken);
    }
  } while (pageToken);
  return docs;
}

async function readSnapshot(fetchImpl, token) {
  const tournaments = await listFull(fetchImpl, 'tournaments', token);
  const plans = [];
  const snapshots = [];
  for (const tournament of tournaments) {
    const rootPath = core.validTournament(tournament).split('/documents/')[1];
    const config = documentToObject(tournament);
    const [matches, results] = await Promise.all([
      listFull(fetchImpl, rootPath + '/matches', token),
      listFull(fetchImpl, rootPath + '/results', token)
    ]);
    const extras = {};
    for (const part of split.partesDe(config)) {
      const collection = split.colecaoDaParte(part);
      if (collection === 'matches' || collection === 'results' || Object.prototype.hasOwnProperty.call(extras, collection)) continue;
      extras[collection] = await listFull(fetchImpl, rootPath + '/' + collection, token);
    }
    if (Array.isArray(config._semPesados) && config._semPesados.includes('grupos') && !Object.prototype.hasOwnProperty.call(extras, 'grupos')) {
      extras.grupos = await listFull(fetchImpl, rootPath + '/grupos', token);
    }
    const plan = await core.matchesToPlan(tournament, matches, results, documentToObject, extras);
    plans.push(plan);
    snapshots.push({ tournament, matches, results, extras, plan });
  }
  return { aggregate: core.aggregatePlans(plans), snapshots };
}

async function preview(fetchImpl, token) {
  return (await readSnapshot(fetchImpl, token)).aggregate;
}

function backupRoot(homeDir = os.homedir()) {
  const resolved = path.resolve(homeDir);
  if (resolved.includes('/CloudStorage/') || resolved.includes('/Documents/Codex/') ||
      resolved === path.resolve(process.cwd()) || resolved.startsWith(path.resolve(process.cwd()) + path.sep)) {
    throw new Error('diretório de backup proibido');
  }
  return path.join(resolved, '.local', 'share', 'scoreplace', 'phase-index-backups');
}

function assertNoSymlinks(target) {
  let cursor = path.parse(target).root;
  for (const segment of path.resolve(target).slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('symlink no caminho do backup');
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
}

function writeBackup(snapshot, digest, homeDir) {
  const directory = backupRoot(homeDir);
  assertNoSymlinks(directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertNoSymlinks(directory);
  if ((fs.statSync(directory).mode & 0o077) !== 0) throw new Error('permissões inseguras no backup');
  const filename = path.join(directory, 'phase-index-' + digest + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.json');
  const body = JSON.stringify({ digest, savedAt: new Date().toISOString(), tournaments: snapshot });
  const checksum = core.stableDigest(body);
  const descriptor = fs.openSync(filename, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, body, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  if ((fs.statSync(filename).mode & 0o077) !== 0 || core.stableDigest(fs.readFileSync(filename, 'utf8')) !== checksum) {
    throw new Error('backup não confirmado');
  }
  return filename;
}

async function getFull(fetchImpl, fullName, token) {
  const response = await fetchImpl(docUrl(fullName), {
    method: 'GET', headers: { Authorization: 'Bearer ' + token }
  });
  if (!response.ok) throw new Error('releitura Firestore indisponível');
  const document = await response.json();
  if (document.name !== fullName || !document.updateTime || !document.fields) throw new Error('releitura incompleta');
  return document;
}

async function patchPhase(fetchImpl, target, token) {
  const url = docUrl(target.path);
  url.searchParams.set('updateMask.fieldPaths', '_phaseIndex');
  url.searchParams.set('currentDocument.updateTime', target.updateTime);
  const response = await fetchImpl(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { _phaseIndex: { integerValue: String(target.phase) } } })
  });
  if (!response.ok) throw new Error('PATCH Firestore recusado');
}

async function apply(fetchImpl, token, expectedDigest, options = {}) {
  if (!/^[a-f0-9]{64}$/.test(String(expectedDigest || ''))) throw new Error('digest inválido');
  const before = await readSnapshot(fetchImpl, token);
  if (before.aggregate.digest !== expectedDigest) throw new Error('prévia obsoleta');
  const eligible = before.snapshots.filter((item) => item.plan.eligible);
  if (!eligible.length) throw new Error('nenhum alvo elegível');
  const backup = writeBackup(eligible.map(({ tournament, matches, results, extras }) => ({ tournament, matches, results, extras })),
    expectedDigest, options.homeDir);
  let patched = 0;
  try {
    for (const item of eligible) {
      const rootName = item.tournament.name;
      for (const target of item.plan.targets) {
        const freshRoot = await getFull(fetchImpl, rootName, token);
        if (freshRoot.updateTime !== item.tournament.updateTime) throw new Error('configuração alterada; lote interrompido');
        const game = item.plan.digestInput.games.find((entry) => entry.path === target.path);
        if (!game || !game.resultPath || !game.resultUpdateTime) throw new Error('espelho não comprovado');
        const freshResult = await getFull(fetchImpl, game.resultPath, token);
        if (freshResult.updateTime !== game.resultUpdateTime) throw new Error('espelho alterado; lote interrompido');
        await patchPhase(fetchImpl, target, token);
        patched++;
      }
    }
    const after = await readSnapshot(fetchImpl, token);
    const afterByName = new Map(after.snapshots.map((item) => [item.tournament.name, item]));
    for (const item of eligible) {
      const fresh = afterByName.get(item.tournament.name);
      if (!fresh || auditor.report(documentToObject(fresh.tournament), fresh.matches.map(documentToObject)).coverage !== 'completa') {
        throw new Error('auditoria pós-aplicação incompleta');
      }
    }
  } catch (error) {
    error.patched = patched;
    throw error;
  }
  return { patched, tournaments: eligible.length, backupConfirmed: Boolean(backup) };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--apply' && /^[a-f0-9]{64}$/.test(args[1]))) {
    throw new Error('opções inválidas');
  }
  const token = await accessTokenForServiceAccount();
  const result = args.length ? await apply(fetch, token, args[1]) : await preview(fetch, token);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { BASE, docUrl, listFull, readSnapshot, preview, backupRoot, assertNoSymlinks, writeBackup, getFull, patchPhase, apply };
if (require.main === module) main().catch((error) => {
  const count = Number.isSafeInteger(error && error.patched) ? ' após ' + error.patched + ' PATCH(es)' : '';
  console.error('operação interrompida' + count + '; consulte o estado e o backup antes de qualquer retomada');
  process.exitCode = 1;
});
