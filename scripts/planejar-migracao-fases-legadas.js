#!/usr/bin/env node
/*
 * Censo SOMENTE DE LEITURA da projeção canônica de fases. Ele não aceita
 * argumentos e nunca escreve: a aplicação continua individual, com recibo CAS,
 * pelo migrador já existente. O objetivo é impedir conversão em lote cega.
 */
'use strict';

const path = require('path');
const { accessTokenForServiceAccount } = require('./firebase-service-account-token');
const { _window } = require(path.join(__dirname, '..', 'functions-autodraw', 'draw-core.js'));
const { planLegacyPhaseProjection } = require(path.join(__dirname, '..', 'functions', 'legacy-phase-projection-core.js'));

if (process.argv.length !== 2) {
  console.error('Este planejador é somente leitura e não aceita opções.');
  process.exit(1);
}
const project = _window && _window.FORMAT2 && _window.FORMAT2.projectLegacyPhases;
if (typeof project !== 'function') throw new Error('projetor FORMAT2 indisponível');

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
function objectOf(document) { return Object.fromEntries(Object.entries((document && document.fields) || {}).map(([key, value]) => [key, fromFirestore(value)])); }
async function listCollection(url, token) {
  const docs = []; let pageToken = '';
  do {
    const response = await fetch(url + '?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('leitura Firestore falhou: ' + response.status + ' ' + (await response.text()).slice(0, 160));
    const body = await response.json(); docs.push(...(body.documents || [])); pageToken = body.nextPageToken || '';
  } while (pageToken);
  return docs;
}
function phaseSummary(plan) {
  return plan.phases.map((phase) => ({ kind: String(phase && phase.kind || ''), formatCode: String(phase && phase.formatCode || '') }));
}
function inspect(document) {
  const tournamentId = document.name.split('/').pop();
  const plan = planLegacyPhaseProjection(objectOf(document), project, { tournamentId, updateTime: String(document.updateTime || '') });
  return {
    tournamentId,
    updateTime: String(document.updateTime || ''),
    changed: !!plan.changed,
    reason: plan.reason,
    fingerprint: plan.fingerprint,
    protectedFingerprint: plan.protectedFingerprint,
    phases: phaseSummary(plan),
  };
}
async function main() {
  const token = await accessTokenForServiceAccount();
  const tournaments = await listCollection(BASE + '/tournaments', token);
  const reports = [], exceptions = [];
  tournaments.forEach((document) => {
    try { reports.push(inspect(document)); }
    catch (error) { exceptions.push({ tournamentId: document.name.split('/').pop(), reason: String(error && error.message || error) }); }
  });
  const changed = reports.filter((report) => report.changed);
  const manifest = {
    schemaVersion: 1,
    purpose: 'legacy-phase-projection-read-only',
    generatedAt: new Date().toISOString(),
    ready: exceptions.length === 0,
    totals: { tournaments: reports.length, pending: changed.length, alreadyCanonical: reports.length - changed.length, exceptions: exceptions.length },
    pending: changed,
    exceptions,
  };
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  if (exceptions.length) process.exitCode = 2;
}
main().catch((error) => { console.error('Planejamento abortado:', error && error.message ? error.message : error); process.exit(1); });
