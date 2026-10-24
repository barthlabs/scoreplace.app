#!/usr/bin/env node
'use strict';

// One-time fallback after removing the unscored thirdPlaceMatch from Neon.
// The released trigger skipped its write because old and new source both compute
// 96/96 with the new rule. Approved plan and owner authorization cover this
// single derived document. Run after sp_preparar_credencial_firebase; default is dry-run.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const admin = require(require.resolve('firebase-admin', { paths: [
  path.join(__dirname, '..', 'functions'),
  path.join(__dirname, '..', 'functions-autodraw'),
  path.join(os.homedir(), 'dev', 'scoreplace.app', 'functions')
] }));
const split = require('../functions-autodraw/vendor/tournament-split-core.js');
const summary = require('../functions-autodraw/tournament-summary-core.js');
const draw = require('../functions-autodraw/draw-core.js');
const ID = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Unknown option');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  throw new Error('Persistent service account credential is required');
}
admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(ID);
const summaryRef = db.collection('tournaments_summary').doc(ID);
const allowed = new Set(['matchesTotal', 'matchesDone', 'progressPct']);

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function calculate(tx) {
  const root = await tx.get(ref);
  const old = await tx.get(summaryRef);
  if (!root.exists || !old.exists) throw new Error('Tournament or summary absent');
  const t = root.data();
  if (!String(t.name || '').toUpperCase().includes('NEON NIGHTMARE') ||
      !Array.isArray(t.phases) || t.phases.length !== 1 ||
      t.phases[0]?.kind !== 'classification' || t.thirdPlaceMatch !== undefined) {
    throw new Error('Tournament identity, phase, or phantom state differs');
  }
  const H = summary.helpersDe(draw._window);
  if (!H.progress || !H.competitors || !H.waitlistPeople) throw new Error('Missing app helpers');
  if (t.canonicalRegistrationMigration?.fingerprint) {
    const expected = Number(t.canonicalRegistrationMigration.registrationCount);
    if (!Number.isInteger(expected) || expected < 0) throw new Error('Invalid registration receipt');
    const registrations = await tx.get(ref.collection('registrations').limit(expected + 1));
    const canonical = summary.canonicalCounts(registrations.docs.map(d => d.data()), expected);
    H.competitors = () => canonical;
    H.canonicalParticipants = canonical.people;
  }
  const cache = new Map();
  const readCollection = async name => {
    if (!cache.has(name)) {
      cache.set(name, (await tx.get(ref.collection(name))).docs.map(d => d.data()));
    }
    return cache.get(name);
  };
  const matchRows = await readCollection('matches');
  if (matchRows.length !== 96 || matchRows.some(row => {
    const m = row?.jogo;
    return !m || m.isThirdPlace ||
      !(m.winner || m.result || (m.score1 != null && m.score2 != null));
  })) throw new Error('Canonical matches differ from 96 finished matches');
  const full = await split.montarDoBanco(JSON.parse(JSON.stringify(t)), readCollection);
  const next = summary.buildSummary(full, ID, H);
  if (!next || next.matchesTotal !== 96 || next.matchesDone !== 96 ||
      next.progressPct !== 100) throw new Error('Computed summary is not 96/96/100');
  const previous = old.data();
  const changes = Object.keys({ ...previous, ...next })
    .filter(key => !same(previous[key], next[key]));
  if (changes.some(key => !allowed.has(key))) {
    throw new Error('Other summary fields changed: ' + changes.filter(key => !allowed.has(key)).join(','));
  }
  if (!changes.includes('matchesTotal') || !changes.includes('progressPct')) {
    throw new Error('Expected stale summary fields are absent');
  }
  return { next, changes: changes.sort(), oldUpdateTime: old.updateTime };
}

async function main() {
  const preview = await db.runTransaction(calculate, { readOnly: true });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', computed: '96/96',
    changedKeys: preview.changes }));
  if (!apply) return;
  await db.runTransaction(async tx => {
    const current = await calculate(tx);
    if (!current.oldUpdateTime.isEqual(preview.oldUpdateTime)) {
      throw new Error('Summary changed after preview');
    }
    tx.set(summaryRef, current.next);
  }, { maxAttempts: 1 });
  const [final, tournament, matches] = await Promise.all([
    summaryRef.get(), ref.get(), ref.collection('matches').get()
  ]);
  if (final.get('matchesTotal') !== 96 || final.get('matchesDone') !== 96 ||
      final.get('progressPct') !== 100 ||
      tournament.get('thirdPlaceMatch') !== undefined || matches.size !== 96) {
    throw new Error('Post-write verification failed; do not repeat --apply');
  }
  console.log(JSON.stringify({ summary: '96/96', pct: 100, canonicalMatches: 96,
    legacyThirdPlacePresent: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
