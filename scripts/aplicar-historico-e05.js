#!/usr/bin/env node
'use strict';

// E05: consulta e prévia por padrão. --apply exige corte publicado, backup,
// autorização específica dos documentos e transação CAS única.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token.js');
const { stable, digest } = require('./backup-torneio-operacional-core.js');
const { slotUids } = require('../functions/match-roster.js');
const { releaseGate } = require('./aplicar-pares-e05.js');
const { verifyPublishedReader } = require('./aplicar-jogos-inline-e05.js');
const core = require('./aplicar-historico-e05-core.js');

const PROJECT = 'scoreplace-app';
const PRIVATE = path.resolve(__dirname, '../.claude/tmp');
const BACKUPS = '/Users/rtb/Documents/Codex/backups-operacionais';
const MANIFEST = path.join(PRIVATE, 'e05-matchhistory-manifest-private.json');

function privateWrite(filename, body) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const tmp = filename + '.partial-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, body, { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(tmp, filename); fs.chmodSync(filename, 0o600); }
  catch (error) { try { fs.unlinkSync(tmp); } catch (_) {} throw error; }
}

async function capture(db) {
  const snap = await db.collectionGroup('matchHistory').get();
  return snap.docs;
}

async function verifyCoverage(db, historyDocs) {
  const targets = historyDocs.filter(doc => (doc.data() || {}).matchType === 'tournament');
  const grouped = new Map();
  for (const doc of targets) {
    const id = doc.data().tournamentId;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(doc);
  }
  const physical = new Map();
  const orphanRoots = [];
  const uidMismatchNames = new Map();
  let linkedDocs = 0, orphanDocs = 0, nonCanonical = 0, uidMismatches = 0;
  for (const [id, docs] of grouped) {
    const rootRef = db.collection('tournaments').doc(id);
    const root = await rootRef.get();
    if (!root.exists) { orphanRoots.push(id); orphanDocs += docs.length; continue; }
    const games = (await rootRef.collection('matches').get()).docs;
    for (const history of docs) {
      const record = history.data();
      const matchId = record.matchId;
      const exact = games.filter(game => matchId === 't_' + id + '_' + game.id);
      const matches = exact.length ? exact : games.filter(game =>
        typeof matchId === 'string' && matchId.endsWith('_' + game.id));
      if (matches.length !== 1) throw new Error('[E05] histórico real sem jogo físico único');
      const game = matches[0];
      const physicalData = game.data() || {};
      const data = physicalData.jogo;
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
          String(data.id) !== game.id || physicalData._chave !== game.id) {
        throw new Error('[E05] histórico real sem jogo canônico');
      }
      if (String(record.scoreSummary || '').trim() &&
          (data.scoreP1 == null || data.scoreP2 == null) &&
          !(Array.isArray(data.sets) && data.sets.length)) {
        throw new Error('[E05] histórico pontuado sem placar físico');
      }
      const userUid = history.ref.path.split('/')[1];
      const physicalUids = (physicalData.playerUids || []).filter(Boolean)
        .concat(slotUids(data, 'p1'), slotUids(data, 'p2'));
      if (!physicalUids.includes(userUid)) {
        // A cópia pode pertencer a UID antigo de uma fusão. Registrar a exceção
        // no digest e pedir autorização explícita; nunca atribuir o placar por nome.
        uidMismatches++;
        const tournamentName = String((root.data() || {}).name || 'Sem nome');
        uidMismatchNames.set(tournamentName, (uidMismatchNames.get(tournamentName) || 0) + 1);
      }
      if (matchId !== 't_' + id + '_' + game.id) {
        nonCanonical++;
        const uids = (record.players || []).map(player => player && player.uid).filter(Boolean);
        if (!uids.some(uid => physicalUids.includes(uid))) {
          throw new Error('[E05] vínculo de histórico atípico sem UID compartilhado');
        }
      }
      physical.set(game.ref.path, { path: game.ref.path, updateTime: stable(game.updateTime) });
      linkedDocs++;
    }
  }
  const coverage = { physical: [...physical.values()].sort((a, b) => a.path.localeCompare(b.path)),
    orphanRoots: orphanRoots.sort(), linkedDocs, orphanDocs, nonCanonical, uidMismatches,
    uidMismatchesByTournament: [...uidMismatchNames].map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name)) };
  coverage.digest = digest(JSON.stringify(coverage));
  return coverage;
}

function backup(docs, outputDir = BACKUPS) {
  const body = JSON.stringify({ schema: 'scoreplace/e05-matchhistory-backup/1', project: PROJECT,
    createdAt: new Date().toISOString(),
    docs: docs.map(core.entry).sort((a, b) => a.path.localeCompare(b.path)) }, null, 2) + '\n';
  const sha256 = digest(body);
  const file = path.join(outputDir, 'e05-matchhistory-' + new Date().toISOString().replace(/[:.]/g, '-') +
    '-' + crypto.randomBytes(4).toString('hex') + '.json');
  privateWrite(file, body);
  if (digest(fs.readFileSync(file, 'utf8')) !== sha256) throw new Error('[E05] backup corrompido');
  return { file, sha256 };
}

function approvalGate(approval, plan, coverage, now = Date.now()) {
  if (!approval || approval.schema !== 'scoreplace/e05-matchhistory-approval/1' ||
      approval.project !== PROJECT || approval.digest !== plan.digest ||
      approval.coverageDigest !== coverage.digest || approval.count !== plan.count ||
      approval.uidMismatches !== coverage.uidMismatches ||
      JSON.stringify(approval.orphanRoots) !== JSON.stringify(coverage.orphanRoots) ||
      !approval.authorizedBy || !approval.authorizationRef ||
      !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now) {
    throw new Error('[E05] autorização específica do histórico ausente ou divergente');
  }
  return approval;
}

function receiptFile(plan) {
  return path.join(PRIVATE, 'e05-matchhistory-' + plan.digest + '-receipt-private.json');
}

function receipt(filename, plan, coverage, backupInfo, approval, status, error) {
  const body = { schema: 'scoreplace/e05-matchhistory-receipt/1', project: PROJECT,
    planDigest: plan.digest, coverageDigest: coverage.digest, count: plan.count,
    backupSha256: backupInfo.sha256, authorizationRef: approval.authorizationRef,
    status, observedAt: new Date().toISOString(),
    ...(error ? { failure: String(error.message || error).slice(0, 240) } : {}) };
  privateWrite(filename, JSON.stringify(body, null, 2) + '\n');
  return body;
}

async function run(db, mode, suppliedDigest = '', env = process.env, hooks = {}) {
  if (mode === 'check') {
    const docs = await capture(db);
    const plan = core.makePlan(docs);
    const coverage = await verifyCoverage(db, docs);
    if (coverage.linkedDocs + coverage.orphanDocs !== plan.count) {
      throw new Error('[E05] cobertura do histórico incompleta');
    }
    const backupInfo = backup(docs, hooks.backupDir);
    privateWrite(hooks.manifestFile || MANIFEST,
      JSON.stringify({ schema: 'scoreplace/e05-matchhistory-manifest/1', project: PROJECT,
        plan, coverage, backup: backupInfo }, null, 2) + '\n');
    return { digest: plan.digest, coverageDigest: coverage.digest, tournamentDocs: plan.count,
      physicalMatches: coverage.physical.length, linkedDocs: coverage.linkedDocs,
      orphanDocs: coverage.orphanDocs, orphanRoots: coverage.orphanRoots.length,
      nonCanonical: coverage.nonCanonical, untouched: plan.untouched,
      uidMismatches: coverage.uidMismatches,
      uidMismatchesByTournament: coverage.uidMismatchesByTournament,
      backupSha256: backupInfo.sha256, productionWrites: 0 };
  }
  if (mode !== 'apply') throw new Error('[E05] modo inválido');
  const manifest = JSON.parse(fs.readFileSync(hooks.manifestFile || MANIFEST, 'utf8'));
  if (manifest.schema !== 'scoreplace/e05-matchhistory-manifest/1' || manifest.project !== PROJECT ||
      suppliedDigest !== manifest.plan.digest || !manifest.backup ||
      digest(fs.readFileSync(manifest.backup.file, 'utf8')) !== manifest.backup.sha256) {
    throw new Error('[E05] manifesto ou backup da prévia inválido');
  }
  const plan = manifest.plan, coverage = manifest.coverage;
  const releaseFile = env.SCOREPLACE_E05_STAGE3_RELEASE_RECEIPT;
  if (!releaseFile || !path.isAbsolute(releaseFile)) throw new Error('[E05] recibo E20 ausente');
  if (!hooks.mainCommit) execFileSync('git', ['fetch', 'origin', 'main'],
    { cwd: path.resolve(__dirname, '..'), stdio: 'ignore', timeout: 30000 });
  const mainCommit = hooks.mainCommit || execFileSync('git', ['rev-parse', 'origin/main'],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
  const release = releaseGate(JSON.parse(fs.readFileSync(releaseFile, 'utf8')), mainCommit);
  if (release.historyWriterRetired !== true) throw new Error('[E05] escritor de histórico ainda ativo');
  await (hooks.verifyReader || verifyPublishedReader)(release);
  const approvalFile = env.SCOREPLACE_E05_HISTORY_APPROVAL_FILE;
  if (!approvalFile || !path.isAbsolute(approvalFile)) throw new Error('[E05] autorização ausente');
  const approval = approvalGate(JSON.parse(fs.readFileSync(approvalFile, 'utf8')), plan, coverage);
  const file = hooks.receiptFile || receiptFile(plan);
  if (fs.existsSync(file)) throw new Error('[E05] recibo anterior existe; revisão manual obrigatória');
  const freshDocs = await capture(db);
  const fresh = core.makePlan(freshDocs);
  const freshCoverage = await verifyCoverage(db, freshDocs);
  if (fresh.digest !== plan.digest || freshCoverage.digest !== coverage.digest) {
    throw new Error('[E05] prévia mudou; gere e autorize novo lote');
  }
  const backupInfo = backup(freshDocs, hooks.backupDir);
  receipt(file, plan, coverage, backupInfo, approval, 'PREPARED');
  try { await core.applyPlan(db, plan, coverage); }
  catch (error) { receipt(file, plan, coverage, backupInfo, approval, 'FALHA_APLICACAO_ESTADO_INCERTO', error); throw error; }
  try {
    if (hooks.afterCommit) await hooks.afterCommit();
    const after = core.makePlan(await capture(db));
    if (after.count !== 0) throw new Error('[E05] histórico de torneio remanescente');
    receipt(file, plan, coverage, backupInfo, approval, 'APPLIED_AUDITED');
  } catch (error) {
    receipt(file, plan, coverage, backupInfo, approval, 'FALHA_POS_AUDITORIA', error);
    throw error;
  }
  return { digest: plan.digest, deleted: plan.count, backupSha256: backupInfo.sha256,
    status: 'APPLIED_AUDITED' };
}

function serviceDb(env = process.env) {
  const key = JSON.parse(fs.readFileSync(credentialPath(env), 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) throw new Error('[E05] credencial inválida');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT });
  return admin.firestore();
}

async function main(args = process.argv.slice(2)) {
  const check = args.length === 1 && args[0] === '--check';
  const apply = args.length === 2 && args[0] === '--apply';
  if (!check && !apply) throw new Error('uso: --check | --apply <digest>');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('[E05] CLI real recusada no emulador');
  const result = await run(serviceDb(), check ? 'check' : 'apply', apply ? args[1] : '');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { capture, verifyCoverage, backup, approvalGate, run, serviceDb, main };
if (require.main === module) main().catch(error => {
  console.error('[E05] operação interrompida: ' + error.message);
  process.exitCode = 1;
});
