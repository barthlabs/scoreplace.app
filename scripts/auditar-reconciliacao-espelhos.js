#!/usr/bin/env node
/* Auditoria agregada somente-leitura; nenhuma escrita ou identificação sai no relatório. */
'use strict';

const split = require('../functions/vendor/tournament-split-core.js');
const backfill = require('./backfill-indice-fases-core.js');
const { listFull } = require('./backfill-indice-fases.js');
const { documentToObject } = require('./auditar-indice-fases.js');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token.js');
const core = require('./auditar-reconciliacao-espelhos-core.js');

async function audit(fetchImpl, token) {
  const tournaments = await listFull(fetchImpl, 'tournaments', token);
  const reports = [];
  for (let offset = 0; offset < tournaments.length; offset += 6) {
    const batch = await Promise.all(tournaments.slice(offset, offset + 6).map(async (document) => {
      const root = backfill.validTournament(document).split('/documents/')[1];
      const config = documentToObject(document);
      const [matches, results] = await Promise.all([
        listFull(fetchImpl, root + '/matches', token),
        listFull(fetchImpl, root + '/results', token)
      ]);
      const extras = {};
      for (const part of split.partesDe(config)) {
        const collection = split.colecaoDaParte(part);
        if (collection === 'matches' || collection === 'results' || Object.hasOwn(extras, collection)) continue;
        extras[collection] = await listFull(fetchImpl, root + '/' + collection, token);
      }
      if (Array.isArray(config._semPesados) && config._semPesados.includes('grupos') && !Object.hasOwn(extras, 'grupos')) {
        extras.grupos = await listFull(fetchImpl, root + '/grupos', token);
      }
      return core.analyze(document, matches, results, extras, documentToObject);
    }));
    reports.push(...batch);
  }
  return core.aggregate(reports);
}

function formatReport(report) {
  return JSON.stringify(report, null, 2) + '\n';
}

async function main() {
  if (process.argv.length !== 2) throw new Error('opções inválidas');
  const token = await accessTokenForServiceAccount();
  const report = await audit(fetch, token);
  process.stdout.write(formatReport(report));
  if (!report.healthy) {
    console.error('auditoria encontrou divergências; nenhuma alteração foi feita');
    process.exitCode = 1;
  }
}

module.exports = { audit, formatReport };
if (require.main === module) main().catch(() => {
  console.error('auditoria indisponível; nenhuma alteração foi feita');
  process.exitCode = 1;
});
