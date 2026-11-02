#!/usr/bin/env node
/* Passo 3.2.8: somente GET e saída agregada. Não existe modo de aplicação. */
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const split = require('../functions/vendor/tournament-split-core.js');
const { listFull } = require('./backfill-indice-fases.js');
const { documentToObject } = require('./auditar-indice-fases.js');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token.js');
const core = require('./planejar-reconciliacao-espelhos-core.js');

const SOURCE_FILES = Object.freeze([
  'functions/match-roster.js', 'functions/vendor/tournament-split-core.js',
  'scripts/planejar-reconciliacao-espelhos-core.js', 'scripts/planejar-reconciliacao-espelhos.js',
]);

function sourceHashes(readFile = fs.readFileSync) {
  const out = {};
  for (const file of SOURCE_FILES) {
    out[file] = crypto.createHash('sha256').update(readFile(file)).digest('hex');
  }
  return out;
}

function localVersion(exec = execFileSync) {
  return {
    head: String(exec('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim(),
    worktreeStatus: String(exec('git', ['status', '--short'], { encoding: 'utf8' })).trim(),
  };
}

async function preview(fetchImpl, token, readTime, metadata = {}) {
  if (!readTime || !/^\d{4}-\d\d-\d\dT/.test(readTime)) throw new Error('readTime obrigatório');
  // A primeira requisição também prova que o servidor aceita o instante.
  const tournaments = await listFull(fetchImpl, 'tournaments', token, readTime);
  const plans = [];
  for (const tournament of tournaments) {
    const root = tournament.name.split('/documents/')[1];
    if (!/^tournaments\/[^/]+$/.test(root)) throw new Error('torneio inválido');
    const config = documentToObject(tournament);
    const [matches, results] = await Promise.all([
      listFull(fetchImpl, root + '/matches', token, readTime),
      listFull(fetchImpl, root + '/results', token, readTime),
    ]);
    const extras = {};
    for (const name of split.partesDe(config)) {
      const collection = split.colecaoDaParte(name);
      if (collection === 'matches' || collection === 'results' || Object.hasOwn(extras, collection)) continue;
      extras[collection] = await listFull(fetchImpl, root + '/' + collection, token, readTime);
    }
    if (Array.isArray(config._semPesados) && config._semPesados.includes('grupos') && !Object.hasOwn(extras, 'grupos')) {
      extras.grupos = await listFull(fetchImpl, root + '/grupos', token, readTime);
    }
    // O núcleo recebe somente coleções obtidas acima no mesmo readTime.
    plans.push(await core.planTournament(tournament, matches, results, extras, documentToObject, readTime));
  }
  const version = metadata.version || localVersion();
  return core.aggregate(plans, readTime, metadata.sourceHashes || sourceHashes(), version.head, version.worktreeStatus);
}

async function main() {
  if (process.argv.length !== 2) throw new Error('opções não permitidas');
  const token = await accessTokenForServiceAccount();
  const readTime = new Date(Date.now() - 5000).toISOString();
  const report = await preview(fetch, token, readTime);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

module.exports = { SOURCE_FILES, sourceHashes, localVersion, preview };
if (require.main === module) main().catch(() => {
  console.error('prévia indisponível; nenhum digest de aplicação foi emitido e nenhuma escrita foi feita');
  process.exitCode = 1;
});
