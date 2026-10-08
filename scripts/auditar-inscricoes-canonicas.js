#!/usr/bin/env node
/*
 * Censo somente de leitura do contrato de inscrição canônica.
 *
 * Lê os participantes do mesmo espelho/subcoleção que as Functions hidratam e
 * resume apenas contagens: não escreve, não imprime nomes, e-mails ou fotos.
 * Uso: node scripts/auditar-inscricoes-canonicas.js
 */
'use strict';

const path = require('path');
const { execSync } = require('child_process');
const split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
const registration = require(path.join(__dirname, '..', 'functions', 'registration-core.js'));

if (process.argv.length > 2) {
  console.error('Este censo é somente leitura e não aceita opções.');
  process.exit(1);
}
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const accessToken = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

function fromFirestore(value) {
  if (value == null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestore);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, fromFirestore(child)]));
  }
  return null;
}

function documentToObject(document) {
  return Object.fromEntries(Object.entries((document && document.fields) || {}).map(([key, value]) => [key, fromFirestore(value)]));
}

async function listCollection(url, token) {
  const docs = [];
  let pageToken = null;
  do {
    const response = await fetch(url + '?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!response.ok) throw new Error('leitura Firestore falhou: ' + response.status + ' ' + (await response.text()).slice(0, 160));
    const data = await response.json();
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return docs;
}

function entriesFromMirror(documents) {
  return documents.map((doc) => {
    const data = documentToObject(doc);
    return data.item || data;
  });
}

async function entriesForTournament(document, token) {
  const tournament = documentToObject(document);
  const collection = split.colecaoDaParte('participants');
  const mirrored = await listCollection(BASE + '/' + document.name.replace(/^.*\/documents\//, '') + '/' + encodeURIComponent(collection), token);
  // Todo torneio nasce dividido. O fallback preserva a leitura de fotografias
  // antigas sem espelho, sem inferir/reescrever nenhuma identidade.
  if (!mirrored.empty) return entriesFromMirror(mirrored);
  return Array.isArray(tournament.participants) ? tournament.participants : [];
}

async function main() {
  const token = accessToken();
  const tournaments = await listCollection(BASE + '/tournaments', token);
  const totals = { tournaments: tournaments.length, entries: 0, registrations: 0, conflicts: 0, unsupported: 0 };
  const unsupportedByReason = {};
  const unsupportedSchemas = {};
  const flagged = [];

  // Lotes pequenos evitam tanto o serial de dezenas de round-trips quanto uma
  // explosão de consultas simultâneas contra o Firestore.
  for (let offset = 0; offset < tournaments.length; offset += 8) {
    const reports = await Promise.all(tournaments.slice(offset, offset + 8).map(async (document) => {
      const id = document.name.split('/').pop();
      const entries = await entriesForTournament(document, token);
      return { id: id, entries: entries, report: registration.dryRunLegacyRoster(id, entries) };
    }));
    reports.forEach(({ id, entries, report }) => {
      totals.entries += entries.length;
      totals.registrations += report.registrations.length;
      totals.conflicts += report.conflicts.length;
      totals.unsupported += report.unsupported.length;
      report.unsupported.forEach((item) => {
        unsupportedByReason[item.reason] = (unsupportedByReason[item.reason] || 0) + 1;
        const entry = entries[item.index] || {};
        const schema = Object.keys(entry).sort().join(',') || '(primitive-or-empty)';
        const key = item.reason + ' :: ' + schema;
        unsupportedSchemas[key] = (unsupportedSchemas[key] || 0) + 1;
      });
      if (report.conflicts.length || report.unsupported.length) {
        flagged.push({ id: id, entries: entries.length, conflicts: report.conflicts.length, unsupported: report.unsupported.length });
      }
    });
  }

  console.log('Censo de inscrições canônicas (somente leitura)');
  console.log('  torneios: ' + totals.tournaments);
  console.log('  entradas: ' + totals.entries);
  console.log('  inscrições projetáveis: ' + totals.registrations);
  console.log('  conflitos: ' + totals.conflicts);
  console.log('  entradas sem suporte: ' + totals.unsupported);
  Object.keys(unsupportedByReason).sort().forEach((reason) => {
    console.log('  sem-suporte[' + reason + ']: ' + unsupportedByReason[reason]);
  });
  Object.keys(unsupportedSchemas).sort().forEach((schema) => {
    console.log('  estrutura[' + schema + ']: ' + unsupportedSchemas[schema]);
  });
  flagged.forEach((item) => {
    console.log('  exceção ' + item.id + ': entradas=' + item.entries + ', conflitos=' + item.conflicts + ', sem-suporte=' + item.unsupported);
  });
  process.exit((totals.conflicts || totals.unsupported) ? 2 : 0);
}

console.log('Iniciando censo de inscrições canônicas (somente leitura)…');
main().catch((error) => {
  console.error('Censo abortado:', error && error.message ? error.message : error);
  process.exit(1);
});
