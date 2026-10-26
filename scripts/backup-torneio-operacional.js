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

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
const { stable, digest, buildOperationalBackup } = require('./backup-torneio-operacional-core');
const PROJECT = 'scoreplace-app';
// O snapshot contém dados de participantes. Por padrão ele fica local, fora do
// repositório e sem transferência para serviços externos.
const DEFAULT_OUTPUT = '/Users/rtb/Documents/Codex/backups-operacionais';

function preflight() {
  // Este utilitário é autocontido: não pode depender de um helper local que uma
  // restauração ou checkout administrativo talvez não traga junto.
  const emulator = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();
  if (emulator) fail('FIRESTORE_EMULATOR_HOST está ativo; recusei gravar um backup operacional do emulador');
  console.log('▸ backup-torneio-operacional');
  console.log('  projectId:              ' + PROJECT);
  console.log('  FIRESTORE_EMULATOR_HOST: (ausente)');
  console.log('  alvo efetivo:           PRODUÇÃO (Firestore real)');
  console.log('');
}

function arg(name) {
  const prefix = '--' + name + '=';
  const hit = process.argv.find((v) => v.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}
function fail(message) { throw new Error('BACKUP ABORTADO: ' + message); }
(async () => {
  const tournamentId = arg('tournament');
  const output = arg('output') || DEFAULT_OUTPUT;
  if (!tournamentId) fail('use --tournament=<id>');
  preflight();
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
  const { payload, body, sha256, entities, manifest } = buildOperationalBackup(tournament, subcollections, createdAt, PROJECT);
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
