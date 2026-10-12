#!/usr/bin/env node
/*
 * Gera um manifesto SOMENTE DE LEITURA para revisar uma futura materialização
 * canônica. Não aceita --apply, não grava no Firestore e não inclui PII.
 *
 * Uso: node scripts/planejar-materializacao-inscricoes-canonicas.js > /tmp/plano.json
 */
'use strict';

const path = require('path');
const split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
const registration = require(path.join(__dirname, '..', 'functions', 'registration-core.js'));
const materialization = require(path.join(__dirname, '..', 'functions', 'registration-migration-core.js'));
const batch = require(path.join(__dirname, '..', 'functions', 'registration-batch-plan-core.js'));
const legacyCategoryDefinitions = require(path.join(__dirname, '..', 'functions', 'legacy-category-definition-core.js'));
const { accessTokenForServiceAccount } = require('./firebase-service-account-token');

if (process.argv.length > 2) {
  console.error('Este planejador é somente leitura e não aceita opções.');
  process.exit(1);
}

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';

function fromFirestore(value) {
  if (value == null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestore);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, fromFirestore(child)]));
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
  return documents.map((doc) => ({ sourceKey: doc.name.split('/').pop(), entry: documentToObject(doc).item || documentToObject(doc) }));
}

async function inspectTournament(document, token) {
  const id = document.name.split('/').pop();
  const tournament = documentToObject(document);
  const root = BASE + '/' + document.name.replace(/^.*\/documents\//, '');
  const [mirror, canonical] = await Promise.all([
    listCollection(root + '/' + encodeURIComponent(split.colecaoDaParte('participants')), token),
    listCollection(root + '/registrations', token)
  ]);
  const entries = mirror.length ? entriesFromMirror(mirror) : (Array.isArray(tournament.participants) ? tournament.participants : []);
  const existing = Object.fromEntries(canonical.map((doc) => [doc.name.split('/').pop(), documentToObject(doc)]));
  // A prévia administrativa precisa atravessar exatamente a mesma ponte que
  // a Function transacional. Sem isso um rótulo legado poderia parecer um
  // categoryId válido no censo e o lote só falharia depois do clique.
  let categories;
  try {
    categories = legacyCategoryDefinitions.resolve(tournament, entries);
  } catch (error) {
    throw new Error('torneio ' + id + ': definições de categoria incompatíveis com a migração (' + error.message + ')');
  }
  const report = registration.projectLegacyRoster(id, entries, categories.categoryIdForLegacyLabel, categories.defaultCategoryId);
  const decision = materialization.decideMaterialization(id, report, existing);
  return {
    tournamentId: id,
    fingerprint: report.fingerprint,
    updateTime: String(document.updateTime || ''),
    registrations: report.registrations.length,
    formedPairs: report.formedPairs.length,
    conflicts: report.conflicts.length,
    unsupported: report.unsupported.length,
    divergent: decision.conflicts.length,
    existing: Object.keys(existing).length,
    creates: decision.creates.length,
    already: decision.already.length
  };
}

async function main() {
  const token = await accessTokenForServiceAccount();
  const tournaments = await listCollection(BASE + '/tournaments', token);
  const inspected = [];
  for (let offset = 0; offset < tournaments.length; offset += 8) {
    inspected.push(...await Promise.all(tournaments.slice(offset, offset + 8).map((document) => inspectTournament(document, token))));
  }
  // O planejador aborta inteiro se uma única fotografia deixar de ser segura.
  // Assim não existe manifesto parcial que pareça pronto para aplicação.
  const plan = batch.planBatch(inspected, new Date().toISOString());
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
}

main().catch((error) => {
  console.error('Planejamento abortado:', error && error.message ? error.message : error);
  process.exit(1);
});
