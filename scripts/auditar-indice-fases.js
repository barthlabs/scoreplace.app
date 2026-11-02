#!/usr/bin/env node
/* Censo somente-leitura. Saída agregada, sem identificadores ou dados de jogos. */
'use strict';

const core = require('./auditar-indice-fases-core.js');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token.js');

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const MATCH_MASK = Object.freeze(['_loc', 'jogo', 'jogo.phaseIndex', '_phaseIndex']);
const TOURNAMENT_MASK = Object.freeze(['_nPartes']);

function assertMatchMask(mask) {
  if (!Array.isArray(mask) || !['_loc', 'jogo', 'jogo.phaseIndex', '_phaseIndex'].every((field) => mask.includes(field))) {
    throw new Error('projeção de jogos incompleta');
  }
}

function fromFirestore(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, fromFirestore(child)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestore);
  return null;
}

function documentToObject(document) {
  return Object.fromEntries(Object.entries((document && document.fields) || {}).map(([key, value]) => [key, fromFirestore(value)]));
}

async function listCollection(fetchImpl, url, token, mask, stage) {
  const docs = [];
  const seenTokens = new Set();
  let pageToken = null;
  do {
    const query = new URLSearchParams({ pageSize: '500' });
    for (const field of mask) query.append('mask.fieldPaths', field);
    if (pageToken) query.append('pageToken', pageToken);
    const response = await fetchImpl(url + '?' + query.toString(), { method: 'GET', headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('leitura Firestore falhou em ' + stage + ': HTTP ' + response.status);
    const body = await response.json();
    docs.push(...(Array.isArray(body.documents) ? body.documents : []));
    pageToken = body.nextPageToken || null;
    if (pageToken) {
      if (seenTokens.has(pageToken)) throw new Error('paginação repetida em ' + stage);
      seenTokens.add(pageToken);
    }
  } while (pageToken);
  return docs;
}

async function audit(fetchImpl, token) {
  assertMatchMask(MATCH_MASK);
  const tournaments = await listCollection(fetchImpl, BASE + '/tournaments', token, TOURNAMENT_MASK, 'torneios');
  const reports = [];
  for (let offset = 0; offset < tournaments.length; offset += 6) {
    const batch = await Promise.all(tournaments.slice(offset, offset + 6).map(async (document) => {
      const name = String(document && document.name || '');
      if (!/^projects\/[^/]+\/databases\/[^/]+\/documents\/tournaments\/[^/]+$/.test(name)) {
        throw new Error('referência de torneio inválida');
      }
      const docs = await listCollection(fetchImpl, BASE + '/' + name.split('/documents/')[1] + '/matches', token, MATCH_MASK, 'jogos');
      return core.report(documentToObject(document), docs.map(documentToObject));
    }));
    reports.push(...batch);
  }
  return core.aggregate(reports);
}

async function main() {
  if (process.argv.length !== 2) throw new Error('censo somente-leitura não aceita opções');
  const token = await accessTokenForServiceAccount();
  const total = await audit(fetch, token);
  process.stdout.write(JSON.stringify(total, null, 2) + '\n');
}

module.exports = { MATCH_MASK, assertMatchMask, fromFirestore, documentToObject, listCollection, audit };
if (require.main === module) main().catch((error) => {
  // Nunca imprimir URL, corpo da resposta, referência, token ou stack.
  const safe = error && error.message || '';
  console.error(/^(leitura Firestore falhou em |paginação repetida em |referência de torneio inválida|censo somente-leitura não aceita opções|credencial persistente indisponível|a conta de serviço não devolveu access token)/.test(safe)
    ? safe.replace(/credencial persistente indisponível:.*/, 'credencial persistente indisponível')
    : 'censo indisponível');
  process.exitCode = 1;
});
