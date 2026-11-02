#!/usr/bin/env node
'use strict';

// E08: GET-only. O manifesto é prova para estudo, nunca recibo de aplicação.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const split = require('../js/views/tournament-split-core.js');
const { listFull } = require('./backfill-indice-fases.js');
const { documentToObject } = require('./auditar-indice-fases.js');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token.js');
const core = require('./planejar-indice-canonico-e08-core.js');

const manifestFile = path.resolve(__dirname, '../.claude/tmp/e08-indice-canonico-manifest-private.json');

async function preview(fetchImpl, token, readTime) {
  const roots = await listFull(fetchImpl, 'tournaments', token, readTime);
  const plans = [];
  for (const root of roots) {
    const relative = String(root && root.name || '').split('/documents/')[1];
    if (!/^tournaments\/[^/]+$/.test(relative || '')) throw new Error('raiz inválida');
    const config = documentToObject(root);
    const matches = await listFull(fetchImpl, relative + '/matches', token, readTime);
    const requested = split.partesDe(config).map(split.colecaoDaParte);
    if ((Array.isArray(config._semPesados) && config._semPesados.includes('grupos')) ||
        (config._nPartes && Number.isSafeInteger(config._nPartes.grupos) && config._nPartes.grupos > 0) ||
        (Number.isSafeInteger(config._nGrupos) && config._nGrupos > 0)) requested.push('grupos');
    const extraNames = new Set(requested.filter(name => name !== 'matches' && name !== 'results'));
    const extras = {};
    for (const name of extraNames) {
      extras[name] = await listFull(fetchImpl, relative + '/' + name, token, readTime);
    }
    plans.push(await core.planRoot(root, matches, extras, documentToObject));
  }
  return { plans, report: core.aggregate(plans, readTime) };
}

function savePrivate(plans, filename = manifestFile) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = filename + '.partial-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temporary, JSON.stringify(plans, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try {
    fs.renameSync(temporary, filename);
    fs.chmodSync(filename, 0o600);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) {}
    throw error;
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== '--preview') throw new Error('somente --preview é permitido');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('emulador ativo');
  const token = await accessTokenForServiceAccount();
  const readTime = new Date(Date.now() - 6000).toISOString();
  const { plans, report } = await preview(fetch, token, readTime);
  savePrivate(plans);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

module.exports = { preview, savePrivate, main };
if (require.main === module) main().catch(() => {
  console.error('prévia E08 indisponível; nenhuma escrita de produção');
  process.exitCode = 1;
});
