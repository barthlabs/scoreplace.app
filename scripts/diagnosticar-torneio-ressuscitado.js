#!/usr/bin/env node
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
require('./preflight-alvo').preflight('diagnostico-torneio-ressuscitado', 'scoreplace-app');

const TID = 'tour_1781996342871';
(async () => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore();
  const ref = db.collection('tournaments').doc(TID);
  const snap = await ref.get();
  if (!snap.exists) { console.log('✓ O torneio não existe na produção.'); return; }
  const data = snap.data() || {};
  const subs = await ref.listCollections();
  const sizes = {};
  for (const col of subs) {
    const count = await col.count().get();
    sizes[col.id] = count.data().count;
  }
  const logs = await db.collection('tournamentDeletions').where('tournamentId', '==', TID).get();
  console.log(JSON.stringify({
    id: TID,
    createTime: snap.createTime && snap.createTime.toDate().toISOString(),
    updateTime: snap.updateTime && snap.updateTime.toDate().toISOString(),
    name: data.name,
    status: data.status,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    nascidoEm: data._nascidoEm && data._nascidoEm.toDate ? data._nascidoEm.toDate().toISOString() : data._nascidoEm || null,
    creatorUid: data.creatorUid || null,
    subcollections: sizes,
    deletionLogs: logs.docs.map((d) => ({ id: d.id, ...d.data() })),
  }, null, 2));
})().catch((e) => { console.error('✗ ' + (e && e.stack || e)); process.exit(1); });
