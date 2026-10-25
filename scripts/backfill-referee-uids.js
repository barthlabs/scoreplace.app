#!/usr/bin/env node
/* Sincroniza o índice de leitura dos árbitros já confirmados em torneios existentes.
 * Dry-run por padrão. --apply atualiza somente refereeUids, com precondição de versão
 * para não sobrescrever uma alteração concorrente da escala.
 */
'use strict';
const { accessTokenForServiceAccountSync } = require('./firebase-service-account-token');
const roster = require('../js/domain/referee-roster');
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const APPLY = process.argv.includes('--apply');
const allowed = process.argv.slice(2).every(arg => arg === '--apply');
if (!allowed) { console.error('Uso: node scripts/backfill-referee-uids.js [--apply]'); process.exit(2); }

function stringArray(field) {
  return (((field || {}).arrayValue || {}).values || []).map(value => value.stringValue).filter(Boolean);
}
function entries(field) {
  return (((field || {}).arrayValue || {}).values || []).map(value => {
    const fields = (value.mapValue && value.mapValue.fields) || {};
    return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, item.stringValue || '']));
  });
}

(async () => {
  const token = accessTokenForServiceAccountSync();
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const response = await fetch(BASE + ':runQuery', { method: 'POST', headers,
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'tournaments' }],
      select: { fields: [{ fieldPath: 'arbitros' }, { fieldPath: 'refereeUids' }, { fieldPath: 'isSandbox' }] }
    } }) });
  if (!response.ok) throw new Error('Leitura de torneios falhou: HTTP ' + response.status);
  const rows = await response.json();
  let scanned = 0, changed = 0, written = 0;
  for (const row of rows) {
    const doc = row.document;
    if (!doc) continue;
    scanned++;
    const fields = doc.fields || {};
    const desired = fields.isSandbox && fields.isSandbox.booleanValue === true ? [] :
      roster.sanitizeAll(entries(fields.arbitros)).filter(item => item.status === 'confirmed').map(item => item.uid).sort();
    const actual = stringArray(fields.refereeUids).sort();
    if (JSON.stringify(actual) === JSON.stringify(desired)) continue;
    changed++;
    if (!APPLY) continue;
    const query = new URLSearchParams({ 'updateMask.fieldPaths': 'refereeUids',
      'currentDocument.updateTime': doc.updateTime });
    const patch = await fetch('https://firestore.googleapis.com/v1/' + doc.name + '?' + query, {
      method: 'PATCH', headers, body: JSON.stringify({ fields: { refereeUids: {
        arrayValue: { values: desired.map(uid => ({ stringValue: uid })) }
      } } })
    });
    if (!patch.ok) throw new Error('Atualização interrompida: HTTP ' + patch.status);
    written++;
  }
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', scanned, changed, written }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
