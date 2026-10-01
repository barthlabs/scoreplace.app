#!/usr/bin/env node
'use strict';

/*
 * Backup operacional de UM torneio antes de uma alteração de alto impacto (ex.: sorteio).
 * O documento-base dos torneios grandes é propositalmente leve; elenco, histórico e
 * notificações vivem em subcoleções. Portanto um backup só de `tournaments/{id}` não
 * permite voltar ao estado real. Este script fotografa o documento e TODAS as
 * subcoleções diretas, grava fora do repositório e só anuncia sucesso depois de reler
 * o arquivo e conferir SHA-256, contagens e conteúdo.
 *
 * Uso:
 *   node scripts/backup-torneio-operacional.js --tournament=<id>
 *   node scripts/backup-torneio-operacional.js --tournament=<id> --output=<pasta>
 *
 * Não escreve no Firestore. O JSON é um retrato restaurável/auditável; um restore deve
 * ser uma operação explícita, nunca consequência automática deste backup.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
const PROJECT = 'scoreplace-app';
// O snapshot contém dados de participantes. Por padrão ele fica local, fora do
// repositório e sem transferência para serviços externos.
const DEFAULT_OUTPUT = '/Users/rtb/Documents/Codex/backups-operacionais';

require('./preflight-alvo').preflight('backup-torneio-operacional', PROJECT);

function arg(name) {
  const prefix = '--' + name + '=';
  const hit = process.argv.find((v) => v.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}
function fail(message) { throw new Error('BACKUP ABORTADO: ' + message); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  // O Admin SDK serializa Timestamps como {_seconds,_nanoseconds}; preservar isso
  // explicitamente torna o retrato independente de versões do SDK.
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
  return {
    enrollmentRecords: records.length,
    participants: identities.size,
    pairs,
    // Times são criados pelo sorteio e não podem ser deduzidos de inscrições.
    teams: null
  };
}

(async () => {
  const tournamentId = arg('tournament');
  const output = arg('output') || DEFAULT_OUTPUT;
  if (!tournamentId) fail('use --tournament=<id>');
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();
  const ref = db.collection('tournaments').doc(tournamentId);
  const tournament = await ref.get();
  if (!tournament.exists) fail('torneio não encontrado: ' + tournamentId);

  const collections = await ref.listCollections();
  const subcollections = {};
  for (const collection of collections.sort((a, b) => a.id.localeCompare(b.id))) {
    const snapshot = await collection.get();
    subcollections[collection.id] = snapshot.docs
      .map((doc) => ({ id: doc.id, data: stable(doc.data()) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  const createdAt = new Date().toISOString();
  const payload = {
    schema: 'scoreplace/tournament-operational-backup/1',
    project: PROJECT,
    tournamentId,
    createdAt,
    tournament: { id: tournament.id, data: stable(tournament.data()) },
    subcollections
  };
  const body = JSON.stringify(payload, null, 2) + '\n';
  const sha256 = digest(body);
  const entities = countEntities(subcollections);
  const manifest = {
    schema: payload.schema,
    project: PROJECT,
    tournamentId,
    createdAt,
    sha256,
    tournamentFields: Object.keys(payload.tournament.data).length,
    entities,
    subcollections: Object.fromEntries(Object.entries(subcollections).map(([name, docs]) => [name, docs.length]))
  };
  const stamp = createdAt.replace(/[:.]/g, '-');
  const safeId = tournamentId.replace(/[^A-Za-z0-9_-]/g, '_');
  const filename = 'torneio-' + safeId + '-' + stamp + '.json';
  fs.mkdirSync(output, { recursive: true });
  const target = path.join(output, filename);
  if (fs.existsSync(target)) fail('já existe: ' + target);
  const temporary = target + '.partial';
  fs.writeFileSync(temporary, body, { mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.writeFileSync(target + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });

  const reread = fs.readFileSync(target, 'utf8');
  const readPayload = JSON.parse(reread);
  const readManifest = JSON.parse(fs.readFileSync(target + '.manifest.json', 'utf8'));
  if (digest(reread) !== sha256 || readManifest.sha256 !== sha256) fail('hash não confere após releitura');
  if (JSON.stringify(readPayload) !== JSON.stringify(payload)) fail('conteúdo não confere após releitura');
  for (const [name, docs] of Object.entries(subcollections)) {
    if (!Array.isArray(readPayload.subcollections[name]) || readPayload.subcollections[name].length !== docs.length) {
      fail('contagem da subcoleção ' + name + ' não confere após releitura');
    }
  }

  console.log('✓ backup operacional gravado e relido');
  console.log('  arquivo: ' + target);
  console.log('  SHA-256: ' + sha256);
  console.log('  entidades: participantes=' + entities.participants + ', duplas=' + entities.pairs + ', registros de inscrição=' + entities.enrollmentRecords + ', times=não sorteados');
  console.log('  subcoleções: ' + Object.entries(manifest.subcollections).map(([name, count]) => name + '=' + count).join(', '));
})().catch((error) => { console.error('✗ ' + (error && error.message || error)); process.exit(1); });
