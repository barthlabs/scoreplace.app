#!/usr/bin/env node
/*
 * Aplica a projeção canônica de fases em lote controlado. Sem --apply, somente
 * imprime o manifesto. Com --apply exige o fingerprint recém-conferido; cada
 * documento é CAS individual, verificado depois da escrita e retomável.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token');
const phaseStore = require('./phase-projection-firestore-core');
const { _window } = require(path.join(__dirname, '..', 'functions-autodraw', 'draw-core.js'));
const { planLegacyPhaseProjection } = require(path.join(__dirname, '..', 'functions', 'legacy-phase-projection-core.js'));
const { runOne } = require('./migrar-fases-legadas-core');
const { parseArgs, validateApprovals } = require('./aprovacao-fases-core');
const project = _window && _window.FORMAT2 && _window.FORMAT2.projectLegacyPhases;
if (typeof project !== 'function') throw new Error('projetor FORMAT2 indisponível');
const args = parseArgs(process.argv.slice(2));
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function summary(plan, tournamentId, updateTime) { return { tournamentId, updateTime, fingerprint: plan.fingerprint, protectedFingerprint: plan.protectedFingerprint, reason: plan.reason, phases: plan.phases.map((phase) => ({ kind: String(phase.kind || ''), formatCode: String(phase.formatCode || '') })) }; }
async function planAll(token) {
  const docs = await phaseStore.listTournaments(token), pending = [], exceptions = [];
  docs.forEach((doc) => {
    const tournamentId = doc.name.split('/').pop(), updateTime = String(doc.updateTime || '');
    try { const plan = planLegacyPhaseProjection(phaseStore.documentToObject(doc), project, { tournamentId, updateTime }); if (plan.changed) pending.push(summary(plan, tournamentId, updateTime)); }
    catch (error) { exceptions.push({ tournamentId, reason: String(error && error.message || error) }); }
  });
  const manifestFingerprint = hash({ schemaVersion: 1, pending, exceptions });
  return { schemaVersion: 1, purpose: 'legacy-phase-projection-batch', generatedAt: new Date().toISOString(), ready: exceptions.length === 0, manifestFingerprint, totals: { tournaments: docs.length, pending: pending.length, exceptions: exceptions.length }, pending, exceptions };
}
function readReceipts(approvals) {
  const receipts = new Map();
  for (const approval of approvals) {
    if (!approval || typeof approval.backupManifestPath !== 'string' || !approval.backupManifestPath.endsWith('.manifest.json')) {
      throw new Error('caminho de manifesto de backup inválido');
    }
    const manifestPath = approval.backupManifestPath;
    const bodyPath = manifestPath.slice(0, -'.manifest.json'.length);
    const body = fs.readFileSync(bodyPath, 'utf8');
    const backupManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const payload = JSON.parse(body);
    receipts.set(approval.tournamentId, {
      path: manifestPath,
      payload,
      manifest: backupManifest,
      sha256: crypto.createHash('sha256').update(body).digest('hex')
    });
  }
  return receipts;
}
async function main() {
  const token = await accessTokenForServiceAccount(), manifest = await planAll(token);
  if (!args.apply) { process.stdout.write(JSON.stringify(manifest, null, 2) + '\n'); if (!manifest.ready) process.exitCode = 2; return; }
  if (!manifest.ready) throw new Error('manifesto tem exceções; nenhuma escrita foi iniciada');
  if (args.expected !== manifest.manifestFingerprint) throw new Error('manifesto mudou; gere e revise uma nova prévia antes de aplicar');
  const approvals = JSON.parse(fs.readFileSync(args.approvalFile, 'utf8'));
  const approved = validateApprovals({ manifest, approvals, receipts: readReceipts(approvals) });
  const results = [];
  for (const item of approved) {
    try {
      const result = await runOne({ tournamentId: item.tournamentId, apply: true, fingerprint: item.fingerprint, project, load: (id) => phaseStore.readTournament(token, id), write: (id, projection, updateTime) => phaseStore.writePhaseProjection(token, id, projection, updateTime) });
      results.push({ tournamentId: item.tournamentId, outcome: result.outcome, verificationFingerprint: result.verificationFingerprint || null });
    } catch (error) { results.push({ tournamentId: item.tournamentId, outcome: 'blocked', reason: String(error && error.message || error) }); }
  }
  const blocked = results.filter((item) => item.outcome === 'blocked');
  process.stdout.write(JSON.stringify({ purpose: manifest.purpose, manifestFingerprint: manifest.manifestFingerprint, totals: { requested: approved.length, applied: results.length - blocked.length, blocked: blocked.length }, results }, null, 2) + '\n');
  if (blocked.length) process.exitCode = 2;
}
main().catch((error) => { console.error('Migração em lote abortada:', error && error.message ? error.message : error); process.exit(1); });
