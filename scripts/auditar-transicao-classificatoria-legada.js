#!/usr/bin/env node
/*
 * Censo SOMENTE DE LEITURA dos slots que uma transição classificatória
 * legada poderia precisar resolver. Nomes nunca são impressos: só contagens.
 *
 * Um homônimo sem UID/manualParticipantId no slot não pode ser adivinhado.
 * Antes de publicar um motor que falha fechado nesse caso, este portão prova
 * que nenhum torneio ainda marcado como classificatório o contém.
 */
'use strict';

const { accessTokenForServiceAccountSync } = require('./firebase-service-account-token');
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';

function token() { return accessTokenForServiceAccountSync(); }
function fromFirestore(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestore);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFirestore(x)]));
  return null;
}
function objectOf(document) {
  return Object.fromEntries(Object.entries((document && document.fields) || {}).map(([k, v]) => [k, fromFirestore(v)]));
}
async function listCollection(url, accessToken) {
  const all = []; let pageToken = '';
  do {
    const response = await fetch(url + '?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!response.ok) throw new Error('leitura Firestore falhou: ' + response.status);
    const body = await response.json();
    all.push(...(body.documents || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return all;
}
function isLegacyClassification(t) {
  return t.classifyFormat === 'swiss' || t.currentStage === 'swiss' || t.swissRounds != null || t.format === 'Suíço Clássico';
}
function labelOf(entry) {
  return String(typeof entry === 'string' ? entry : ((entry && (entry.displayName || entry.name)) || '')).trim();
}
function slotHasIdentity(match, side) {
  return !!(match && (match[side + 'Uid'] || match[side + 'ManualId'] || match[side + 'ManualParticipantId']));
}

async function main() {
  if (process.argv.length !== 2) throw new Error('este censo não aceita opções');
  const accessToken = token();
  const tournaments = (await listCollection(BASE + '/tournaments', accessToken)).filter((doc) => isLegacyClassification(objectOf(doc)));
  let ambiguousSlots = 0, affectedTournaments = 0;
  for (const document of tournaments) {
    const id = document.name.split('/').pop();
    const [rosterDocs, matchDocs] = await Promise.all([
      listCollection(BASE + '/tournaments/' + encodeURIComponent(id) + '/inscritos', accessToken),
      listCollection(BASE + '/tournaments/' + encodeURIComponent(id) + '/matches', accessToken)
    ]);
    const names = {};
    rosterDocs.map(objectOf).map((row) => row.item || row).forEach((entry) => {
      const label = labelOf(entry); if (label) names[label] = (names[label] || 0) + 1;
    });
    let here = 0;
    matchDocs.map(objectOf).map((row) => row.jogo || row).forEach((match) => {
      ['p1', 'p2'].forEach((side) => {
        const label = String((match && match[side]) || '').trim();
        if (label && names[label] > 1 && !slotHasIdentity(match, side)) here++;
      });
    });
    ambiguousSlots += here;
    if (here) affectedTournaments++;
  }
  console.log('Censo de transição classificatória legada (somente leitura)');
  console.log('  torneios com marcador classificatório: ' + tournaments.length);
  console.log('  slots ambíguos sem identidade: ' + ambiguousSlots);
  console.log('  torneios afetados: ' + affectedTournaments);
  process.exit(ambiguousSlots ? 2 : 0);
}
main().catch((error) => { console.error('Censo abortado:', error.message || error); process.exit(1); });
