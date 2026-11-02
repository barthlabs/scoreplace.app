#!/usr/bin/env node
'use strict';
// Prévia E05: GET-only, saída agregada, sem modo de aplicação.
const { listFull } = require('./backfill-indice-fases.js');
const { documentToObject } = require('./auditar-indice-fases.js');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token.js');
const core = require('./planejar-fonte-unica-e05-core.js');

async function preview(fetchImpl, token, readTime) {
  const reports = [];
  for (const kind of Object.keys(core.ROOTS)) {
    const roots = await listFull(fetchImpl, kind, token, readTime);
    for (const document of roots) {
      const path = core.rootPath(document, kind);
      const [matches, results] = await Promise.all([
        listFull(fetchImpl, path + '/matches', token, readTime),
        listFull(fetchImpl, path + '/' + core.ROOTS[kind], token, readTime),
      ]);
      reports.push(core.classifyRoot(document, matches, results, kind, documentToObject));
    }
  }
  return core.aggregate(reports, readTime);
}

function formatReport(report) { return JSON.stringify(report, null, 2) + '\n'; }

async function main() {
  if (process.argv.length !== 2) throw new Error('opções não permitidas');
  const token = await accessTokenForServiceAccount();
  const readTime = new Date(Date.now() - 6000).toISOString();
  const report = await preview(fetch, token, readTime);
  process.stdout.write(formatReport(report));
}

module.exports = { preview, formatReport, main };
if (require.main === module) main().catch(() => {
  console.error('prévia E05 indisponível; nenhuma escrita foi feita');
  process.exitCode = 1;
});
