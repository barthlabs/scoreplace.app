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
const split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
const registration = require(path.join(__dirname, '..', 'functions', 'registration-core.js'));
const materialization = require(path.join(__dirname, '..', 'functions', 'registration-migration-core.js'));
const legacyCategoryDefinitions = require(path.join(__dirname, '..', 'functions', 'legacy-category-definition-core.js'));
const canonicalBoundary = require(path.join(__dirname, '..', 'functions', 'canonical-registration-boundary-core.js'));
const audit = require('./auditar-inscricoes-canonicas-core');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token');

if (process.argv.length > 2) {
  console.error('Este censo é somente leitura e não aceita opções.');
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
    // A chave do documento é o único insumo seguro para gerar, em preview,
    // manualParticipantId de convidado legado. Nunca usamos nome ou índice.
    return { sourceKey: doc.name.split('/').pop(), entry: data.item || data };
  });
}

async function entriesForTournament(document, token) {
  const tournament = documentToObject(document);
  const collection = split.colecaoDaParte('participants');
  const mirrored = await listCollection(BASE + '/' + document.name.replace(/^.*\/documents\//, '') + '/' + encodeURIComponent(collection), token);
  // Todo torneio nasce dividido. O fallback preserva a leitura de fotografias
  // antigas sem espelho, sem inferir/reescrever nenhuma identidade.
  if (mirrored.length) return entriesFromMirror(mirrored);
  // Todo torneio corrente é dividido; este fallback só mantém o diagnóstico de
  // fotografias antigas legível e deliberadamente não inventa uma sourceKey.
  return Array.isArray(tournament.participants) ? tournament.participants : [];
}

async function canonicalRegistrationsForTournament(document, token) {
  const url = BASE + '/' + document.name.replace(/^.*\/documents\//, '') + '/registrations';
  const docs = await listCollection(url, token);
  const byId = {};
  docs.forEach((doc) => { byId[doc.name.split('/').pop()] = documentToObject(doc); });
  return byId;
}

async function main() {
  const token = await accessTokenForServiceAccount();
  const tournaments = await listCollection(BASE + '/tournaments', token);
  const totals = {
    tournaments: tournaments.length, canonicalTournaments: 0, legacyTournaments: 0,
    canonicalVerified: 0, canonicalBlocked: 0, canonicalDocuments: 0,
    entries: 0, registrations: 0, formedPairs: 0, conflicts: 0, unsupported: 0,
    legacyExisting: 0, legacyMissing: 0, legacyAlready: 0,
    legacyHistorical: 0, legacyRepairable: 0, legacyDivergent: 0,
    legacyUnexpected: 0, legacyBlocked: 0
  };
  const unsupportedByReason = {};
  const unsupportedSchemas = {};
  const flagged = [];

  // Lotes pequenos evitam tanto o serial de dezenas de round-trips quanto uma
  // explosão de consultas simultâneas contra o Firestore.
  for (let offset = 0; offset < tournaments.length; offset += 8) {
    const reports = await Promise.all(tournaments.slice(offset, offset + 8).map(async (document) => {
      const id = document.name.split('/').pop();
      const tournament = documentToObject(document);
      // A rota vem ANTES de qualquer leitura ou projeção do espelho legado.
      // Depois do recibo, `registrations` é a única autoridade do elenco.
      if (audit.routeFor(tournament) === 'canonical') {
        const existing = await canonicalRegistrationsForTournament(document, token);
        try {
          const items = audit.canonicalDocuments(existing);
          canonicalBoundary.verifiedRoster(Object.assign({}, tournament, { id }), items);
          return { id, kind: 'canonical', existingCount: items.length, validationError: null };
        } catch (error) {
          return { id, kind: 'canonical', existingCount: Object.keys(existing).length,
            validationError: error && error.message ? error.message : String(error) };
        }
      }
      const [entries, existing] = await Promise.all([entriesForTournament(document, token), canonicalRegistrationsForTournament(document, token)]);
      let categories;
      try { categories = legacyCategoryDefinitions.resolve(tournament, entries); }
      catch (error) { return { id: id, kind: 'legacy', entries: entries, report: { registrations: [], formedPairs: [], conflicts: [], unsupported: [] }, existing: existing, decision: null, materializationError: error && error.message ? error.message : String(error) }; }
      const report = registration.projectLegacyRoster(id, entries, categories.categoryIdForLegacyLabel, categories.defaultCategoryId);
      let decision = null;
      let materializationError = null;
      try { decision = materialization.decideMaterialization(id, report, existing); }
      catch (error) { materializationError = error && error.message ? error.message : String(error); }
      return { id: id, kind: 'legacy', entries: entries, report: report, existing: existing, decision: decision, materializationError: materializationError };
    }));
    reports.forEach(({ id, kind, entries, report, existing, decision, materializationError, existingCount, validationError }) => {
      if (kind === 'canonical') {
        totals.canonicalTournaments++;
        totals.canonicalDocuments += existingCount;
        if (validationError) {
          totals.canonicalBlocked++;
          flagged.push({ id, kind, blocked: validationError });
        } else totals.canonicalVerified++;
        return;
      }
      totals.legacyTournaments++;
      totals.entries += entries.length;
      totals.registrations += report.registrations.length;
      totals.formedPairs += report.formedPairs.length;
      totals.conflicts += report.conflicts.length;
      totals.unsupported += report.unsupported.length;
      totals.legacyExisting += Object.keys(existing).length;
      if (decision) {
        totals.legacyMissing += decision.creates.length;
        totals.legacyAlready += decision.already.length;
        totals.legacyHistorical += decision.historicalExisting.length;
        totals.legacyRepairable += decision.reconciliationCandidates.length;
        totals.legacyDivergent += decision.conflicts.length;
        totals.legacyUnexpected += decision.unexpectedExisting.length;
      } else {
        totals.legacyBlocked++;
      }
      report.unsupported.forEach((item) => {
        unsupportedByReason[item.reason] = (unsupportedByReason[item.reason] || 0) + 1;
        const record = entries[item.index] || {};
        const entry = record && record.entry ? record.entry : record;
        const schema = Object.keys(entry).sort().join(',') || '(primitive-or-empty)';
        const key = item.reason + ' :: ' + schema;
        unsupportedSchemas[key] = (unsupportedSchemas[key] || 0) + 1;
      });
      if (report.conflicts.length || report.unsupported.length || (decision && (decision.conflicts.length || decision.unexpectedExisting.length)) || materializationError) {
        flagged.push({ id: id, kind: 'legacy', entries: entries.length, conflicts: report.conflicts.length, unsupported: report.unsupported.length,
          legacyDivergent: decision ? decision.conflicts.length : 0, legacyUnexpected: decision ? decision.unexpectedExisting.length : 0, legacyRepairable: decision ? decision.reconciliationCandidates.length : 0, blocked: materializationError || '' });
      }
    });
  }

  console.log('Censo de inscrições canônicas (somente leitura)');
  console.log('  torneios: ' + totals.tournaments);
  console.log('  canônico — torneios com recibo: ' + totals.canonicalTournaments);
  console.log('  canônico — torneios íntegros: ' + totals.canonicalVerified);
  console.log('  canônico — torneios bloqueados: ' + totals.canonicalBlocked);
  console.log('  canônico — documentos validados ou examinados: ' + totals.canonicalDocuments);
  console.log('  legado — torneios por migrar: ' + totals.legacyTournaments);
  console.log('  legado — entradas: ' + totals.entries);
  console.log('  legado — inscrições projetáveis: ' + totals.registrations);
  console.log('  legado — duplas formadas preserváveis: ' + totals.formedPairs);
  console.log('  legado — conflitos: ' + totals.conflicts);
  console.log('  legado — entradas sem suporte: ' + totals.unsupported);
  console.log('  legado — registros já compatíveis: ' + totals.legacyAlready);
  console.log('  legado — histórico canônico aposentado: ' + totals.legacyHistorical);
  console.log('  legado — cópias sem categoria reparáveis: ' + totals.legacyRepairable);
  console.log('  legado — documentos existentes: ' + totals.legacyExisting);
  console.log('  legado — inscrições ainda a materializar: ' + totals.legacyMissing);
  console.log('  legado — inscrições divergentes: ' + totals.legacyDivergent);
  console.log('  legado — documentos fora da projeção: ' + totals.legacyUnexpected);
  console.log('  legado — torneios bloqueados para materialização: ' + totals.legacyBlocked);
  Object.keys(unsupportedByReason).sort().forEach((reason) => {
    console.log('  sem-suporte[' + reason + ']: ' + unsupportedByReason[reason]);
  });
  Object.keys(unsupportedSchemas).sort().forEach((schema) => {
    console.log('  estrutura[' + schema + ']: ' + unsupportedSchemas[schema]);
  });
  flagged.forEach((item) => {
    if (item.kind === 'canonical') {
      console.log('  exceção canônica ' + item.id + ': bloqueado=' + item.blocked);
    } else {
      console.log('  exceção legada ' + item.id + ': entradas=' + item.entries + ', conflitos=' + item.conflicts + ', sem-suporte=' + item.unsupported +
        ', divergentes=' + item.legacyDivergent + ', fora-da-projeção=' + item.legacyUnexpected + ', reparáveis=' + item.legacyRepairable + (item.blocked ? ', bloqueado=' + item.blocked : ''));
    }
  });
  process.exit((totals.canonicalBlocked || totals.conflicts || totals.unsupported || totals.legacyDivergent || totals.legacyUnexpected || totals.legacyBlocked) ? 2 : 0);
}

console.log('Iniciando censo de inscrições canônicas (somente leitura)…');
main().catch((error) => {
  console.error('Censo abortado:', error && error.message ? error.message : error);
  process.exit(1);
});
