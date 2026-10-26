'use strict';

const crypto = require('crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function' && value.seconds != null && value.nanoseconds != null) {
    return { __firestoreType: 'timestamp', seconds: Number(value.seconds), nanoseconds: Number(value.nanoseconds) };
  }
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (Buffer.isBuffer(value)) return { __firestoreType: 'bytes', base64: value.toString('base64') };
  const out = {};
  Object.keys(value).sort().forEach((key) => { out[key] = stable(value[key]); });
  return out;
}

function digest(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function validTimestamp(value) {
  return !!(value && value.__firestoreType === 'timestamp' &&
    Number.isSafeInteger(value.seconds) && Number.isInteger(value.nanoseconds) &&
    value.nanoseconds >= 0 && value.nanoseconds < 1000000000);
}

function countEntities(subcollections) {
  const records = subcollections.inscritos || [];
  const identities = new Set();
  let pairs = 0;
  for (const record of records) {
    const item = record.data && record.data.item || record.data || {};
    const first = ['p1Uid', 'p1ManualId', 'p1Id', 'p1Seq'].map((key) => item[key]).find(Boolean);
    const second = ['p2Uid', 'p2ManualId', 'p2Id', 'p2Seq'].map((key) => item[key]).find(Boolean);
    if (first && second) {
      pairs += 1;
      identities.add('p1:' + String(first));
      identities.add('p2:' + String(second));
      continue;
    }
    const individual = ['uid', 'manualId', 'id'].map((key) => item[key]).find(Boolean) || record.id;
    identities.add('individual:' + String(individual));
  }
  return { enrollmentRecords: records.length, participants: identities.size, pairs, teams: null };
}

function buildOperationalBackup(snapshot, subcollections, createdAt, project) {
  const updateTime = stable(snapshot && snapshot.updateTime);
  if (!validTimestamp(updateTime)) throw new Error('snapshot sem updateTime exato');
  if (!snapshot || !snapshot.id || typeof snapshot.data !== 'function') throw new Error('snapshot de torneio inválido');
  const payload = {
    schema: 'scoreplace/tournament-operational-backup/1',
    project,
    tournamentId: snapshot.id,
    createdAt,
    tournament: { id: snapshot.id, updateTime, data: stable(snapshot.data()) },
    subcollections
  };
  const body = JSON.stringify(payload, null, 2) + '\n';
  const sha256 = digest(body);
  const entities = countEntities(subcollections);
  const manifest = {
    schema: payload.schema, project, tournamentId: snapshot.id, createdAt, sha256,
    tournamentUpdateTime: updateTime,
    tournamentFields: Object.keys(payload.tournament.data).length,
    entities,
    subcollections: Object.fromEntries(Object.entries(subcollections).map(([name, docs]) => [name, docs.length]))
  };
  return { payload, body, sha256, entities, manifest };
}

module.exports = { stable, digest, validTimestamp, buildOperationalBackup };
