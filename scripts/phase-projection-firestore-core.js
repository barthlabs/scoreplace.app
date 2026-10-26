'use strict';

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
function toFirestore(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: Array.from(value, toFirestore) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, toFirestore(child)])) } };
  return { nullValue: null };
}
function documentToObject(document) { return Object.fromEntries(Object.entries((document && document.fields) || {}).map(([key, value]) => [key, fromFirestore(value)])); }
async function listTournaments(accessToken) {
  const docs = []; let pageToken = '';
  do {
    const response = await fetch(BASE + '/tournaments?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!response.ok) throw new Error('leitura Firestore falhou: ' + response.status + ' ' + (await response.text()).slice(0, 160));
    const body = await response.json(); docs.push(...(body.documents || [])); pageToken = body.nextPageToken || '';
  } while (pageToken);
  return docs;
}
async function readTournament(accessToken, id) {
  const response = await fetch(BASE + '/tournaments/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!response.ok) throw new Error('falhou ao ler ' + id + ': ' + response.status + ' ' + (await response.text()).slice(0, 160));
  const document = await response.json();
  return { tournament: documentToObject(document), updateTime: String(document.updateTime || '') };
}
async function writePhaseProjection(accessToken, id, projection, updateTime) {
  if (!updateTime) throw new Error('documento sem updateTime; CAS indisponível');
  if (!projection || !Array.isArray(projection.phases)) throw new Error('projeção de fases inválida');
  const query = new URLSearchParams();
  query.append('updateMask.fieldPaths', 'phases');
  if (Number.isInteger(projection.currentPhaseIndex)) query.append('updateMask.fieldPaths', 'currentPhaseIndex');
  query.append('currentDocument.updateTime', updateTime);
  const fields = { phases: toFirestore(projection.phases) };
  if (Number.isInteger(projection.currentPhaseIndex)) fields.currentPhaseIndex = toFirestore(projection.currentPhaseIndex);
  const response = await fetch(BASE + '/tournaments/' + encodeURIComponent(id) + '?' + query.toString(), { method: 'PATCH', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error('CAS recusou a escrita de ' + id + ': ' + response.status + ' ' + (await response.text()).slice(0, 240));
}
module.exports = { fromFirestore, toFirestore, documentToObject, listTournaments, readTournament, writePhaseProjection };
