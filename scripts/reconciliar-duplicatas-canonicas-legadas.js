#!/usr/bin/env node
'use strict';

/* Reparo pontual de dois recibos canônicos antigos. Padrão: somente leitura.
 * --tournament=<ID> [--apply --plan-sha256=<hash> --backup=<arquivo>]
 * A transação relê integralmente o mesmo estado da prévia e aborta se mudou.
 * Não apaga inscrições, jogos ou resultados.
 */
const crypto = require('crypto');
const fs = require('fs');
const admin = require('../functions/node_modules/firebase-admin');
const split = require('../functions/split-parts');
const legacyCategories = require('../functions/legacy-category-definition-core');
const projection = require('../functions/registration-core');
const migration = require('../functions/registration-migration-core');
const boundary = require('../functions/canonical-registration-boundary-core');

const PROJECT = 'scoreplace-app';
const NEON_ID = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const TARGETS = new Set(['tour_1780602875089', 'tour_1783511910924']);
const AUTHORIZATION = 'Criador: pedido Codex de 2026-10-18, "investigue e resolva"; incidente getCanonicalTournamentRoster';
const arg = (name) => {
  const prefix = '--' + name + '=';
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
};
const fail = (message) => { throw new Error(message); };
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const id = arg('tournament');
const apply = process.argv.includes('--apply');
if (!TARGETS.has(id)) fail('torneio fora da lista exata de reparo');
if (process.env.FIRESTORE_EMULATOR_HOST) fail('emulador não é o alvo deste reparo');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) fail('credencial persistente ausente');
if (apply && (!/^[a-f0-9]{64}$/.test(arg('plan-sha256')) || !arg('backup'))) {
  fail('execução exige --plan-sha256 e --backup');
}
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(id);
const neonRef = db.collection('tournaments').doc(NEON_ID);
const time = (snap) => snap.updateTime && snap.updateTime.toDate().toISOString();

async function readState(tx, collectionNames) {
  const get = (target) => tx ? tx.get(target) : target.get();
  const root = await get(ref);
  const neon = await get(neonRef);
  if (!root.exists || !neon.exists) fail('torneio ou referência do criador ausente');
  const tournament = Object.assign({ id }, root.data());
  if (!tournament.creatorUid || tournament.creatorUid !== neon.data().creatorUid) {
    fail('criador difere do organizador solicitante');
  }
  if (Array.isArray(tournament.coHosts) && tournament.coHosts.length) fail('co-hosts exigem nova autorização');
  const collections = {};
  for (const name of collectionNames) collections[name] = await get(ref.collection(name));
  const records = await split.lerRegistrosDaParte(tx || null, ref, 'participants');
  const signature = {
    root: time(root), updatedAt: tournament.updatedAt && tournament.updatedAt.toMillis && tournament.updatedAt.toMillis(),
    fingerprint: tournament.canonicalRegistrationMigration && tournament.canonicalRegistrationMigration.fingerprint,
    collections: Object.fromEntries(Object.entries(collections).map(([name, snap]) =>
      [name, snap.docs.map((doc) => [doc.id, time(doc)]).sort((a, b) => a[0].localeCompare(b[0]))])),
  };
  return { root, tournament, collections, records, signature, planSha256: sha256(JSON.stringify(signature)) };
}

function inspect(state) {
  const { tournament, collections } = state;
  const categories = legacyCategories.resolve(tournament, state.records);
  const report = projection.projectLegacyRoster(id, state.records, categories.categoryIdForLegacyLabel, categories.defaultCategoryId);
  const receipt = tournament.canonicalRegistrationMigration || {};
  if (!receipt.fingerprint || receipt.fingerprint !== report.fingerprint || receipt.registrationCount !== 16) {
    fail('fingerprint/recibo divergem da projeção legada atual');
  }
  const registrationSnap = collections.registrations;
  if (!registrationSnap || registrationSnap.size !== 32 || report.registrations.length !== 16) {
    fail('contagem fora do incidente conhecido');
  }
  const existing = Object.fromEntries(registrationSnap.docs.map((doc) => [doc.id, doc.data()]));
  const decision = migration.decideMaterialization(id, report, existing);
  if (decision.creates.length || decision.conflicts.length || decision.already.length !== 16 ||
      decision.unexpectedExisting.length !== 16 || decision.reconciliationCandidates.length !== 16) {
    fail('núcleo de migração não identificou exatamente 16 excedentes reparáveis');
  }
  const candidates = decision.reconciliationCandidates;
  const candidateIds = new Set(candidates.map((item) => item.registrationId));
  if (candidateIds.size !== 16 || decision.unexpectedExisting.some((value) => !candidateIds.has(value))) {
    fail('excedentes não coincidem com candidatos');
  }
  const oldPairs = new Map();
  candidates.forEach((candidate) => {
    const old = existing[candidate.registrationId];
    const target = existing[candidate.supersededByRegistrationId];
    if (!old || !target || old.categoryId === projection.UNCATEGORIZED_CATEGORY_ID ||
        target.categoryId !== projection.UNCATEGORIZED_CATEGORY_ID || target.status !== 'confirmed' ||
        old.status !== 'confirmed' || old.validationState !== 'legacy_imported' ||
        old.participantKey !== target.participantKey || !old.fixedPairId || old.fixedPairId !== target.fixedPairId) {
      fail('candidato não é cópia tipada da mesma dupla e identidade');
    }
    oldPairs.set(old.fixedPairId, (oldPairs.get(old.fixedPairId) || 0) + 1);
  });
  if (oldPairs.size !== 8 || [...oldPairs.values()].some((count) => count !== 2)) {
    fail('coerência das oito duplas antigas falhou');
  }
  // UID e fixedPairId são compartilhados pelos dois lotes; não distinguem um
  // documento excedente. Referências ao registrationId distinguem.
  const rootText = JSON.stringify(state.root.data());
  if (candidates.some((item) => rootText.includes(item.registrationId))) {
    fail('documento-base referencia ID excedente');
  }
  Object.entries(collections).forEach(([name, snap]) => {
    if (name === 'registrations') return;
    snap.docs.forEach((doc) => {
      const body = JSON.stringify(doc.data());
      if (candidates.some((item) => body.includes(item.registrationId))) {
        fail('subcoleção ' + name + ' referencia ID excedente');
      }
    });
  });
  const next = Object.fromEntries(Object.entries(existing).map(([key, value]) => [key, Object.assign({}, value)]));
  candidates.forEach((candidate) => Object.assign(next[candidate.registrationId], {
    status: 'withdrawn', validationState: 'superseded_legacy_category_projection',
    withdrawnReason: 'category_projection_superseded',
    supersededByRegistrationId: candidate.supersededByRegistrationId, fixedPairId: null,
  }));
  const nextTournament = Object.assign({}, tournament, {
    canonicalRegistrationMigration: Object.assign({}, receipt, { registrationCount: 32 }),
  });
  const verified = boundary.verifiedRoster(nextTournament, Object.values(next));
  const second = migration.decideMaterialization(id, report, next);
  if (verified.participants.length !== 8 ||
      Object.values(next).filter((item) => item.status === 'confirmed').length !== 16 ||
      second.creates.length || second.conflicts.length || second.unexpectedExisting.length ||
      second.historicalExisting.length !== 16) fail('fotografia pós-reparo inválida');
  return { candidates, report, receipt };
}

function checkBackup(file, state) {
  if (!file || !fs.existsSync(file) || !fs.existsSync(file + '.manifest.json')) fail('backup ausente');
  const raw = fs.readFileSync(file, 'utf8');
  const backup = JSON.parse(raw), manifest = JSON.parse(fs.readFileSync(file + '.manifest.json', 'utf8'));
  if (backup.project !== PROJECT || backup.tournamentId !== id || manifest.sha256 !== sha256(raw) ||
      backup.subcollections.registrations.length !== 32 ||
      Object.keys(backup.subcollections).sort().join(',') !== Object.keys(state.collections).sort().join(',')) {
    fail('backup não corresponde à operação');
  }
  const backupIds = backup.subcollections.registrations.map((doc) => doc.id).sort();
  const currentIds = state.collections.registrations.docs.map((doc) => doc.id).sort();
  if (backupIds.join(',') !== currentIds.join(',')) fail('backup não contém os mesmos registros');
}

(async () => {
  const collectionRefs = await ref.listCollections();
  const collectionNames = collectionRefs.map((item) => item.id).sort();
  if (!collectionNames.includes('participants') || !collectionNames.includes('registrations')) {
    fail('subcoleções esperadas ausentes');
  }
  if (!apply) {
    const state = await readState(null, collectionNames);
    const result = inspect(state);
    console.log(JSON.stringify({ mode: 'dry-run', tournamentId: id, planSha256: state.planSha256,
      physical: 32, activeAfter: 16, pairsAfter: 8, retiring: result.candidates.length,
      collectionsChecked: collectionNames.length }));
    return;
  }
  const before = await readState(null, collectionNames);
  if (before.planSha256 !== arg('plan-sha256')) fail('estado mudou desde a prévia assinada');
  checkBackup(arg('backup'), before);
  const result = await db.runTransaction(async (tx) => {
    const state = await readState(tx, collectionNames);
    if (state.planSha256 !== arg('plan-sha256')) fail('estado mudou dentro da transação');
    const checked = inspect(state);
    const marker = admin.firestore.FieldValue.serverTimestamp();
    checked.candidates.forEach((candidate) => tx.update(ref.collection('registrations').doc(candidate.registrationId), {
      status: 'withdrawn', validationState: 'superseded_legacy_category_projection',
      withdrawnReason: 'category_projection_superseded',
      supersededByRegistrationId: candidate.supersededByRegistrationId,
      fixedPairId: null, updatedAt: marker,
    }));
    tx.update(ref, {
      canonicalRegistrationMigration: Object.assign({}, checked.receipt, {
        registrationCount: 32, reconciledLegacyCategoryProjectionAt: marker,
        reconciledLegacyCategoryProjectionBy: state.tournament.creatorUid,
      }),
      canonicalRegistrationReconciliationAudit: {
        at: marker, by: state.tournament.creatorUid, authorization: AUTHORIZATION,
        fingerprint: checked.report.fingerprint, planSha256: state.planSha256,
        retiredRegistrationIds: checked.candidates.map((item) => item.registrationId).sort(),
        reason: 'superseded_typed_legacy_category_projection',
      },
      updatedAt: marker,
    });
    return { retired: checked.candidates.length };
  });
  const after = await readState(null, collectionNames);
  const receipt = after.tournament.canonicalRegistrationMigration;
  const docs = after.collections.registrations.docs.map((doc) => doc.data());
  const verified = boundary.verifiedRoster(after.tournament, docs);
  if (receipt.registrationCount !== 32 || docs.filter((item) => item.status === 'confirmed').length !== 16 ||
      verified.participants.length !== 8) fail('gravação ocorreu, mas pós-verificação falhou');
  console.log(JSON.stringify({ mode: 'applied', tournamentId: id, retired: result.retired,
    physical: docs.length, active: 16, pairs: verified.participants.length }));
})().catch((error) => { console.error('REPARO ABORTADO: ' + error.message); process.exitCode = 1; });
