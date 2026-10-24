#!/usr/bin/env node
'use strict';

// One-time, narrowly scoped production repair. No match document is changed.
// Authorized by the owner: remove the phantom third-place field from the
// classification-only Neon tournament in production. Read-only dry-run run
// with sp_preparar_credencial_firebase: 96 canonical matches, 96 finished,
// phantom unscored, summary 96/97. The trigger may lag after the write; never
// repeat --apply on timeout. Run only after the persistent-credential helper.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const admin = require(require.resolve('firebase-admin', {
  paths: [path.join(__dirname, '..', 'functions'),
    path.join(__dirname, '..', 'functions-autodraw'),
    path.join(os.homedir(), 'dev', 'scoreplace.app', 'functions')]
}));
const ID = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const apply = process.argv.includes('--apply');
if (process.argv.some(arg => arg.startsWith('--') && arg !== '--apply')) {
  throw new Error('Unknown option');
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  throw new Error('Persistent service account credential is required');
}

admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const tRef = db.collection('tournaments').doc(ID);
const sRef = db.collection('tournaments_summary').doc(ID);

function assertTournament(t) {
  if (!String(t?.name || '').toUpperCase().includes('NEON NIGHTMARE')) {
    throw new Error('Tournament identity differs from Neon');
  }
  if (!t || !Array.isArray(t.phases) || t.phases.length !== 1 ||
      t.phases[0]?.kind !== 'classification') {
    throw new Error('Tournament is not exclusively classification');
  }
  const third = t.thirdPlaceMatch;
  if (!third || typeof third !== 'object' || !third.id) {
    throw new Error('Expected legacy thirdPlaceMatch is absent');
  }
  if (['winner', 'result', 'score1', 'score2', 'sets', 'resultAt', 'finishedAt']
      .some(key => third[key] != null && third[key] !== '')) {
    throw new Error('Legacy thirdPlaceMatch contains result evidence');
  }
}

function assertMatches(qs) {
  if (qs.size !== 96) throw new Error(`Expected 96 canonical matches; found ${qs.size}`);
  const days = {};
  for (const d of qs.docs) {
    const row = d.data();
    if (!row || !row.jogo || row.jogo.isThirdPlace) {
      throw new Error('Canonical match shape or phase differs');
    }
    const m = row.jogo;
    if (!(m.winner || m.result || (m.score1 != null && m.score2 != null))) {
      throw new Error('Canonical match without result');
    }
    const day = String(m.requiredDay || '');
    days[day] = (days[day] || 0) + 1;
  }
  if (days['2026-10-22'] !== 48 || days['2026-10-23'] !== 48 ||
      Object.keys(days).length !== 2) {
    throw new Error('Canonical day split differs from 48 + 48');
  }
}

async function main() {
  const [before, beforeSummary, beforeMatches] = await Promise.all([
    tRef.get(), sRef.get(), tRef.collection('matches').get()
  ]);
  if (!before.exists || !beforeSummary.exists) throw new Error('Tournament or summary absent');
  assertTournament(before.data());
  assertMatches(beforeMatches);
  if (beforeSummary.get('matchesTotal') !== 97 ||
      beforeSummary.get('matchesDone') !== 96) {
    throw new Error('Summary no longer has the expected 96/97 state');
  }
  const expectedUpdateTime = before.updateTime;
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run',
    canonicalMatches: beforeMatches.size, legacyThirdPlaceUnscored: true,
    summaryBefore: '96/97' }));
  if (!apply) return;

  await db.runTransaction(async tx => {
    const current = await tx.get(tRef);
    const matches = await tx.get(tRef.collection('matches'));
    const summary = await tx.get(sRef);
    if (!current.exists || !current.updateTime.isEqual(expectedUpdateTime)) {
      throw new Error('Tournament changed since preflight');
    }
    assertTournament(current.data());
    assertMatches(matches);
    if (!summary.exists || summary.get('matchesTotal') !== 97 ||
        summary.get('matchesDone') !== 96) {
      throw new Error('Summary changed since preflight');
    }
    tx.update(tRef, { thirdPlaceMatch: admin.firestore.FieldValue.delete() });
  }, { maxAttempts: 1 });
  console.log('Legacy field removed; waiting for the summary trigger.');

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const [t, summary, matches] = await Promise.all([
      tRef.get(), sRef.get(), tRef.collection('matches').get()
    ]);
    assertMatches(matches);
    if (t.get('thirdPlaceMatch') !== undefined) {
      throw new Error('Legacy field still exists after transaction');
    }
    const state = [summary.get('matchesDone'), summary.get('matchesTotal'),
      summary.get('progressPct')];
    if (state[0] === 96 && state[1] === 96 && state[2] === 100) {
      console.log(JSON.stringify({ canonicalMatches: matches.size,
        legacyThirdPlacePresent: false, summary: '96/96', pct: 100 }));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('Field removal committed, but summary trigger did not reach 96/96 within 90 seconds; inspect the summary without repeating --apply');
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });
