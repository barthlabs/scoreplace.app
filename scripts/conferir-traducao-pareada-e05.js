#!/usr/bin/env node
'use strict';

// Lê somente um backup local íntegro. A saída contém contagens, jamais dados do torneio.
const fs = require('node:fs');
const crypto = require('node:crypto');
const split = require('../functions/vendor/tournament-split-core.js');
const translator = require('./traduzir-resultado-pareado-e05-core.js');

async function inspectBackup(filename) {
  const body = fs.readFileSync(filename, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(filename + '.manifest.json', 'utf8'));
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  if (manifest.sha256 !== digest) throw new Error('integridade do backup inválida');
  const backup = JSON.parse(body);
  if (backup.schema !== 'scoreplace/tournament-operational-backup/1' ||
      !backup.tournament || !backup.tournament.data || !backup.subcollections ||
      !Array.isArray(backup.subcollections.matches) ||
      !Array.isArray(backup.subcollections.results)) throw new Error('backup incompleto');
  const loaded = backup.subcollections;
  const mounted = await split.montarDoBanco(backup.tournament.data, (collection) => {
    // O backup enumera todas as subcoleções existentes; a ausência significa coleção vazia.
    const entries = Object.hasOwn(loaded, collection) ? loaded[collection] : [];
    if (!Array.isArray(entries)) throw new Error('subcoleção inválida');
    return entries.map((entry) => entry.data);
  });
  const matches = loaded.matches.map((entry) => ({ id: entry.id, data: entry.data }));
  const results = loaded.results.map((entry) => ({ id: entry.id, data: entry.data }));
  return translator.translateCollection(mounted, matches, results).report;
}

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length || files.some((value) => value.startsWith('-'))) {
    console.error('Uso: node scripts/conferir-traducao-pareada-e05.js <backup.json> [...]');
    process.exitCode = 2;
  } else {
    Promise.all(files.map(inspectBackup)).then((reports) => {
      // O índice ordinal não revela nome, caminho, ID nem conteúdo do backup.
      for (let i = 0; i < reports.length; i++) console.log(JSON.stringify({ backup: i + 1, ...reports[i] }));
    }).catch(() => { console.error('Falha ao conferir backup'); process.exitCode = 1; });
  }
}

module.exports = { inspectBackup };
