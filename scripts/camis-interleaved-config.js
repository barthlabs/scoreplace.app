#!/usr/bin/env node
'use strict';
// Prévia por padrão. A gravação exige --apply e o fingerprint mostrado na prévia.
// O ID identifica somente o torneio CAMIS deste corte; nada aqui muda outros torneios.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const plan = require('../tests/fixtures/camis-interleaved-plan');
const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const apply = process.argv.includes('--apply');
const expected = (process.argv.find(a => a.startsWith('--expected=')) || '').slice(11);
if (apply && !/^[a-f0-9]{64}$/.test(expected)) {
  throw Error('Para aplicar, informe --expected=<sha256 da prévia aprovada>.');
}
const key = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
admin.initializeApp({ credential:admin.credential.cert(key), projectId:'scoreplace-app' });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(ID);
const hash = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
function check(data) {
  if (!data) throw Error('Torneio ausente.');
  if ((data.matches || []).length || (data.rounds || []).length || (data.groups || []).length ||
      data.drawCompleted || data._canonicalDraw || data.pendingDraw || data.phaseCategoryMaterialized) {
    throw Error('Torneio já tem sorteio ou fase materializada; patch cancelado.');
  }
  const days = data.scheduleWindow && data.scheduleWindow.days;
  if (!Array.isArray(days) || days.length !== 1 || String(days[0].day) !== plan.day ||
      days[0].startTime !== '08:00' || days[0].endTime !== '19:30' ||
      data.endDate !== '2026-11-13T19:30' || data.politicaDaChave !== 'repescagem' ||
      data.rankingPrimary !== 'games_diff' ||
      JSON.stringify(data.tiebreakers) !== JSON.stringify(['saldo_games','sorteio']) ||
      data.fmt2?.tieResolution !== 'singles_then_draw' ||
      Number(data.fmt2?.tieSinglesPoints) !== 5 || Number(data.fmt2?.tieSinglesMargin) !== 1 ||
      data.scheduleWindow.interleavedPlan || Number(data.courtCount) !== 8 ||
      Number(data.gameDuration) !== 30 || Number(data.callTime) !== 5 ||
      Number(data.warmupTime) !== 5) {
    throw Error('Configuração de produção divergiu da prévia; patch cancelado.');
  }
  const source = data.phases && data.phases[1] && data.phases[1].source;
  if (!source || source.scope !== 'per_group' || Number(source.qualifyTopN) !== 2 ||
      !Array.isArray(source.mapping) || source.mapping.length !== 1 ||
      Number(source.mapping[0].rankFrom) !== 1 || Number(source.mapping[0].rankTo) !== 2 ||
      data.phases[1].fixedPairs !== true) {
    throw Error('Contrato 1º+2º por grupo mudou; patch cancelado.');
  }
}
function patch(data) {
  const days = data.scheduleWindow.days.map((day, i) => i === 0 ? { ...day, endTime:'21:00' } : day);
  return { 'scheduleWindow.days':days, 'scheduleWindow.interleavedPlan':plan,
    endDate:'2026-11-13T21:00', politicaDaChave:'bye', tiebreakers:[] };
}
(async () => {
  const snap = await ref.get();
  check(snap.data());
  const fingerprint = hash(snap.data());
  const proposed = patch(snap.data());
  console.log(JSON.stringify({ tournamentId:ID, fingerprint, before:{
    endDate:snap.data().endDate,
    scheduleEnd:snap.data().scheduleWindow.days[0].endTime,
    politicaDaChave:snap.data().politicaDaChave,
    tiebreakers:snap.data().tiebreakers,
    interleavedPlan:'ausente'
  }, after:{ endDate:proposed.endDate, scheduleEnd:'21:00',
    politicaDaChave:proposed.politicaDaChave, tiebreakers:[],
    interleavedPlan:{ day:plan.day, blocks:plan.blocks.length, totalGames:plan.totalGames,
      eliminationMinutes:plan.eliminationMinutes, lastEnd:'20:55' } } }, null, 2));
  if (!apply) return;
  if (expected !== fingerprint) throw Error('Fingerprint diferente da prévia aprovada; sem gravação.');
  const backupPath = path.join(os.tmpdir(), 'camis-before-interleaved-' + fingerprint.slice(0,12) + '.json');
  fs.writeFileSync(backupPath, JSON.stringify(snap.data(), null, 2), { flag:'wx', mode:0o600 });
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (hash(fresh.data()) !== expected) throw Error('Documento mudou desde a prévia; sem gravação.');
    check(fresh.data());
    tx.update(ref, patch(fresh.data()));
  });
  console.log(JSON.stringify({ applied:true, tournamentId:ID, backupPath,
    fingerprintBefore:fingerprint, receiptAt:new Date().toISOString() }));
})().catch(err => { console.error('Patch CAMIS recusado: ' + err.message); process.exitCode=1; });
