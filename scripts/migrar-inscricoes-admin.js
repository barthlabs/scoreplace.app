#!/usr/bin/env node
'use strict';

/* Migração administrativa de UM elenco legado por execução. Dry-run é o padrão.
 * Nunca modifica jogos, resultados, participantes legados ou pares existentes.
 * A escrita requer backup operacional fresco, fingerprint e confirmação do alvo.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const admin = require(require.resolve('firebase-admin', { paths: [path.join(__dirname, '..', 'functions')] }));
const split = require('../functions/split-parts');
const categoriesCore = require('../functions/legacy-category-definition-core');
const registrationCore = require('../functions/registration-core');
const migrationCore = require('../functions/registration-migration-core');
const boundary = require('../functions/canonical-registration-boundary-core');
const { stable, digest, validTimestamp } = require('./backup-torneio-operacional-core');
const { preflight, PROD } = require('./preflight-alvo');

const TARGETS = new Set([
  'tour_1781797546400', 'tour_1782004359854', 'tour_1782605223900',
  'tour_1787057094560', 'tour_1787265336056', 'tour_1787282359208',
  'tour_1787494946496', 'tour_1787578519573', 'tour_1787601787842',
  'tour_1787942147965', 'tour_1788180124936', 'tour_1788653600899',
  'tour_1788808142684', 'tour_1789002187508',
  'tour_1789929887987_88a57f1865659002fb7fce2bc6d470ae',
  'tour_1789999302134_63ff6465cf855b68a4436f4466af5fe4',
  'tour_1791844371582_e096aa48f3b5c5464796a17b9b897c98',
]);
const emptyManifest = require('./migrar-inscricoes-vazias-manifest.json');
const TARGETS_VAZIOS = new Set(emptyManifest);
const NEON = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const CONFRA = 'tour_1780009816637';
if (emptyManifest.length !== 63 || TARGETS_VAZIOS.size !== 63 ||
    TARGETS_VAZIOS.has(NEON) || TARGETS_VAZIOS.has(CONFRA) ||
    [...TARGETS_VAZIOS].some((id) => TARGETS.has(id))) {
  throw new Error('manifesto dos 63 vazios inválido ou sobreposto');
}
const SENTINEL = 'admin-operacao-local';
const AUTHORIZATION = 'Minha autorização substitui as confirmações';
const AUTHORIZATION_VAZIOS = 'Dono em 26/10/2026: migre os torneios que estejam legados preservando os dados e traduzindo para o modelo novo';
const AUTH_CLI_17 = 'dono-2026-10-26';
const AUTH_CLI_VAZIOS = 'dono-vazios-2026-10-26';
// Qualquer marcador presente precisa falhar na rota canônica. Este valor não
// é uma aprovação: a autoridade vem da ausência do marcador, não de igualdade.
const LEGACY_ROUTE_SENTINEL = '__admin-legacy-route-only__';
// Local privado desta operação específica; não é caminho padrão do produto.
const RECEIPTS = '/Users/rtb/Documents/Codex/backups-operacionais/2026-10-26-inscricoes/recibos';
const allowedParentKeys = new Set([
  'updatedAt', 'categoryDefinitions', 'canonicalCategoryDefinitionMigration', 'canonicalRegistrationMigration',
]);
const arg = (name) => {
  const value = process.argv.find((item) => item.startsWith('--' + name + '='));
  return value ? value.slice(name.length + 3) : '';
};
const fail = (reason) => { throw new Error(reason); };
// `stable` converte Timestamp para um objeto literal. Normalizar novamente
// ordena as chaves desse objeto como as do JSON relido do backup.
const canonical = (value) => stable(stable(value));
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const hashes = (docs) => docs.map((doc) => [doc.id, digest(JSON.stringify(stable(doc.data)))])
  .sort((a, b) => a[0].localeCompare(b[0]));

function authorizationForTarget(id, supplied) {
  if (id === NEON || id === CONFRA) fail('torneio canônico protegido fora do escopo');
  const emptyRoute = TARGETS_VAZIOS.has(id);
  if (!emptyRoute && !TARGETS.has(id)) fail('alvo fora das autorizações específicas');
  const expected = emptyRoute ? AUTH_CLI_VAZIOS : AUTH_CLI_17;
  if (supplied !== expected) fail('autorização incompatível com a rota do alvo');
  return { emptyRoute, label: emptyRoute ? AUTHORIZATION_VAZIOS : AUTHORIZATION };
}

function checkGate() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script' });
  const declarations = ast.body.filter((node) => node.type === 'VariableDeclaration' && node.kind === 'const')
    .flatMap((node) => node.declarations)
    .filter((node) => node.id.type === 'Identifier' && node.id.name === '_CANONICAL_REGISTRATION_MUTATIONS_READY');
  if (declarations.length !== 1 || declarations[0].init.type !== 'Literal' || declarations[0].init.value !== true) {
    fail('gate canônico não é um único const true no servidor');
  }
  if (!source.includes('if (!_CANONICAL_REGISTRATION_MUTATIONS_READY)')) fail('callable não referencia gate canônico');
}

function loadBackup(filename, id) {
  if (!filename) fail('use --backup=<arquivo>');
  const mode = fs.statSync(filename).mode & 0o777;
  if (mode & 0o077) fail('permissões do backup expõem dados de participantes');
  const body = fs.readFileSync(filename, 'utf8');
  const payload = JSON.parse(body);
  const manifest = JSON.parse(fs.readFileSync(filename + '.manifest.json', 'utf8'));
  const sha256 = digest(body);
  if (payload.schema !== 'scoreplace/tournament-operational-backup/1' ||
      payload.project !== PROD || payload.tournamentId !== id ||
      manifest.project !== PROD || manifest.tournamentId !== id ||
      manifest.sha256 !== sha256 ||
      !validTimestamp(payload.tournament.updateTime) ||
      !equal(payload.tournament.updateTime, manifest.tournamentUpdateTime)) {
    fail('backup/manifesto inválido ou divergente');
  }
  const counts = Object.fromEntries(Object.entries(payload.subcollections || {})
    .map(([name, docs]) => [name, docs.length]));
  if (!equal(counts, manifest.subcollections) ||
      manifest.tournamentFields !== Object.keys(payload.tournament.data || {}).length ||
      Object.values(payload.subcollections || {}).some((docs) => !Array.isArray(docs) ||
        docs.some((doc) => !doc.id || !doc.data))) {
    fail('backup sem inventário íntegro');
  }
  return { filename, payload, manifest, sha256 };
}

function reserveReceipt(filename, payload) {
  fs.writeFileSync(filename, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

async function readState(ref, backup, tx) {
  const get = (target) => tx ? tx.get(target) : target.get();
  const snap = await get(ref);
  if (!snap.exists) fail('torneio ausente');
  const raw = snap.data() || {};
  const route = migrationCore.migrationRoute(raw, LEGACY_ROUTE_SENTINEL);
  if (route !== 'legacy') fail('rota recusada: ' + route);
  if (!equal(stable(snap.updateTime), backup.payload.tournament.updateTime) ||
      !equal(raw, backup.payload.tournament.data)) fail('documento do torneio mudou desde o backup');

  const tournament = await split.hidratar(tx || null, ref, Object.assign({}, raw), ['participants']);
  const records = await split.lerRegistrosDaParte(tx || null, ref, 'participants');
  const existingSnap = await get(ref.collection('registrations').orderBy(admin.firestore.FieldPath.documentId()));
  const expectedPhysical = (backup.payload.subcollections.registrations || []).length;
  if (existingSnap.size !== expectedPhysical) fail('contagem física de registrations mudou');

  const collections = {};
  for (const name of Object.keys(backup.payload.subcollections || {}).sort()) {
    const query = ref.collection(name).orderBy(admin.firestore.FieldPath.documentId());
    const found = await get(query);
    collections[name] = found.docs.map((doc) => ({ id: doc.id, data: stable(doc.data()) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  const expectedNames = Object.keys(backup.payload.subcollections || {}).sort();
  // Firestore não oferece listCollections transacional. Antes da transação,
  // conferir a lista completa; dentro dela, reler transacionalmente todos os
  // documentos conhecidos do backup. O pós-check repete a lista completa.
  if (!tx) {
    const beforeNames = (await ref.listCollections()).map((col) => col.id).sort();
    if (!equal(beforeNames, expectedNames)) fail('lista de subcoleções mudou desde o backup');
  }
  for (const name of expectedNames) {
    if (!equal(collections[name], backup.payload.subcollections[name])) {
      fail('subcoleção ' + name + ' mudou desde o backup');
    }
  }
  const existingById = Object.fromEntries(existingSnap.docs.map((doc) => {
    const data = doc.data() || {};
    if (data.registrationId !== doc.id) fail('ID físico canônico divergente');
    return [doc.id, data];
  }));
  return { snap, raw, tournament, records, existingById, existingSnap, collections };
}

function inspect(id, state, backup) {
  const categories = categoriesCore.resolve(state.tournament, state.records);
  const report = registrationCore.projectLegacyRoster(id, state.records,
    categories.categoryIdForLegacyLabel, categories.defaultCategoryId);
  if (report.conflicts.length || report.unsupported.length) fail('elenco legado com exceções');
  const decision = migrationCore.decideMaterialization(id, report, state.existingById);
  if (decision.reconciliationCandidates.length) fail('reconciliação pendente');
  if (decision.conflicts.length || decision.unexpectedExisting.length) fail('registrations existentes divergentes');
  if (TARGETS_VAZIOS.has(id)) {
    if (state.records.length || state.existingSnap.size || report.registrations.length ||
        report.formedPairs.length || decision.historicalExisting.length || decision.creates.length ||
        decision.desired.length || decision.already.length) {
      fail('alvo do manifesto deixou de ter elenco vazio');
    }
    if (!report.fingerprint) fail('fingerprint vazio inválido');
  } else if (!decision.creates.length) fail('marker_missing_no_creates');
  if (decision.creates.length + 1 > 500) fail('transação excede 500 escritas');
  const preview = {
    id, backupSha256: backup.sha256, rootUpdateTime: backup.payload.tournament.updateTime,
    fingerprint: report.fingerprint, registrations: report.registrations.length,
    historicalExisting: decision.historicalExisting.length, formedPairs: report.formedPairs.length,
    physicalExisting: state.existingSnap.size, creates: decision.creates.length,
  };
  return { categories, report, decision, preview, planSha256: digest(JSON.stringify(preview)) };
}

async function postCheck(ref, backup, expected, id) {
  const snap = await ref.get();
  const after = snap.data() || {};
  for (const key of Object.keys(backup.payload.tournament.data || {})) {
    if (allowedParentKeys.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(after, key) ||
        !equal(after[key], backup.payload.tournament.data[key])) fail('pós-check: campo protegido mudou: ' + key);
  }
  const registrations = await ref.collection('registrations').orderBy(admin.firestore.FieldPath.documentId()).get();
  const items = registrations.docs.map((doc) => {
    const data = doc.data();
    if (doc.id !== data.registrationId) fail('pós-check: ID físico divergente');
    return data;
  });
  boundary.verifiedRoster(Object.assign({ id }, after), items);
  if (registrations.size !== expected.preview.registrations + expected.preview.historicalExisting) {
    fail('pós-check: contagem canônica divergente');
  }
  const names = (await ref.listCollections()).map((col) => col.id).sort();
  const expectedNames = Array.from(new Set([...Object.keys(backup.payload.subcollections || {}),
    ...(expected.preview.registrations + expected.preview.historicalExisting ? ['registrations'] : [])])).sort();
  if (!equal(names, expectedNames)) fail('pós-check: lista de subcoleções mudou');
  for (const name of Object.keys(backup.payload.subcollections || {}).sort()) {
    if (name === 'registrations') continue;
    const docs = (await ref.collection(name).get()).docs.map((doc) => ({ id: doc.id, data: stable(doc.data()) }));
    if (!equal(hashes(docs), hashes(backup.payload.subcollections[name]))) {
      fail('pós-check: subcoleção protegida mudou: ' + name);
    }
  }
  return stable(snap.updateTime);
}

async function applyMigration(db, ref, id, backup, inspected) {
  return db.runTransaction(async (tx) => {
    const current = await readState(ref, backup, tx);
    const fresh = inspect(id, current, backup);
    if (fresh.planSha256 !== inspected.planSha256 ||
        fresh.preview.registrations + fresh.preview.historicalExisting !==
          inspected.preview.registrations + inspected.preview.historicalExisting ||
        fresh.preview.physicalExisting !== inspected.preview.physicalExisting) {
      fail('prévia mudou antes da escrita');
    }
    if (fresh.decision.creates.length + 1 > 500) fail('transação excede 500 escritas');
    // listCollections não participa do snapshot transacional no Firestore.
    // Rechecar imediatamente antes de enfileirar escritas estreita a janela;
    // o pós-check detecta criação posterior. Tal criação não é apagada nem
    // sobrescrita por esta migração: apenas registrations e campos permitidos
    // do pai são gravados. Não chamar essa checagem de CAS de subcoleções.
    const names = (await ref.listCollections()).map((col) => col.id).sort();
    if (!equal(names, Object.keys(backup.payload.subcollections || {}).sort())) {
      fail('lista de subcoleções mudou antes do commit');
    }
    for (const document of fresh.decision.creates) {
      tx.create(ref.collection('registrations').doc(document.registrationId), Object.assign({}, document, {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }));
    }
    tx.set(ref, {
      ...(fresh.categories.shouldPersist ? {
        categoryDefinitions: fresh.categories.definitions,
        canonicalCategoryDefinitionMigration: { source: fresh.categories.source,
          appliedBy: SENTINEL, appliedAt: admin.firestore.FieldValue.serverTimestamp() },
      } : {}),
      canonicalRegistrationMigration: {
        fingerprint: fresh.report.fingerprint,
        registrationCount: fresh.decision.desired.length + fresh.decision.historicalExisting.length,
        fixedPairCount: fresh.report.formedPairs.length, appliedBy: SENTINEL,
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { preUpdateTime: stable(current.snap.updateTime), created: fresh.decision.creates.length };
  });
}

async function main() {
  const id = arg('tournament');
  const emptyRoute = TARGETS_VAZIOS.has(id);
  if ((!TARGETS.has(id) && !emptyRoute) || id === NEON || id === CONFRA) {
    fail('alvo fora das autorizações específicas');
  }
  if (process.argv.some((value) => value.startsWith('--uid=') || value.startsWith('--caller-uid='))) fail('UID não é parâmetro administrativo');
  const apply = process.argv.includes('--apply');
  if (apply && (arg('confirm-tournament') !== id ||
      !/^[a-f0-9]{64}$/.test(arg('plan-sha256')))) {
    fail('aplicação exige ID confirmado, autorização excepcional e plan-sha256');
  }
  const authorization = apply ? authorizationForTarget(id, arg('authorization')) : null;
  preflight('migrar-inscricoes-admin', PROD);
  checkGate();
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile || !fs.existsSync(keyFile)) fail('credencial persistente explícita indisponível');
  const backup = loadBackup(arg('backup'), id);
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))), projectId: PROD });
  const db = admin.firestore();
  const ref = db.collection('tournaments').doc(id);
  const state = await readState(ref, backup, null);
  const inspected = inspect(id, state, backup);
  const summary = { id, fingerprint: inspected.preview.fingerprint, planSha256: inspected.planSha256,
    backupSha256: backup.sha256, registrations: inspected.preview.registrations,
    formedPairs: inspected.preview.formedPairs, creates: inspected.preview.creates };
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...summary }));
  if (!apply) return;
  if (arg('plan-sha256') !== inspected.planSha256) fail('hash da prévia diverge');
  fs.mkdirSync(RECEIPTS, { recursive: true, mode: 0o700 });
  const receiptFile = path.join(RECEIPTS, id + '.json');
  const pendingReceipt = { id, at: new Date().toISOString(), status: 'pending',
    authorization: authorization.label,
    governanceException: emptyRoute
      ? 'conversão dos 63 elencos vazios autorizada pelo dono em 26/10/2026'
      : 'confirmações individuais das organizações substituídas pelo dono em 26/10/2026',
    backupFile: backup.filename, backupSha256: backup.sha256,
    planSha256: inspected.planSha256, fingerprint: inspected.preview.fingerprint,
    registrations: inspected.preview.registrations,
    historicalExisting: inspected.preview.historicalExisting,
    formedPairs: inspected.preview.formedPairs };
  // Intenção durável antes do commit. Uma falha posterior deixa evidência
  // pendente para inspeção, nunca um commit sem rastro local.
  reserveReceipt(receiptFile, pendingReceipt);
  const outcome = await applyMigration(db, ref, id, backup, inspected);
  const postUpdateTime = await postCheck(ref, backup, inspected, id);
  const receipt = { id, at: new Date().toISOString(), status: 'migrated',
    authorization: authorization.label,
    governanceException: emptyRoute
      ? 'conversão dos 63 elencos vazios autorizada pelo dono em 26/10/2026'
      : 'confirmações individuais das organizações substituídas pelo dono em 26/10/2026',
    backupSha256: backup.sha256, planSha256: inspected.planSha256,
    preUpdateTime: outcome.preUpdateTime, postUpdateTime, created: outcome.created,
    registrations: inspected.preview.registrations, formedPairs: inspected.preview.formedPairs,
    protectedDataVerified: true };
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: 'migrated', id, created: outcome.created,
    protectedDataVerified: true, receiptFile }));
}

module.exports = { checkGate, loadBackup, reserveReceipt, readState, inspect, applyMigration, postCheck,
  TARGETS, TARGETS_VAZIOS, AUTH_CLI_17, AUTH_CLI_VAZIOS, authorizationForTarget };
if (require.main === module) {
  main().catch((error) => { console.error('MIGRAÇÃO ABORTADA: ' + (error && error.message || error)); process.exitCode = 1; });
}
