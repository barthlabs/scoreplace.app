'use strict';

/* Regressão de integração: o recibo usa `currentDocument.updateTime` no REST.
 * A prova roda exclusivamente no emulador local; um timestamp impossível deve
 * ser rejeitado e não pode esvaziar `phases` nem alterar os outros campos. */
const assert = require('assert');
const child = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-phase-cas-'));
  const port = 18161;
  const config = path.join(dir, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore: { rules: path.join(__dirname, 'concurrency', 'firestore.allow.rules') },
    emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false }, singleProjectMode: true }
  }));
  const env = Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH });
  const out = child.spawnSync('firebase', [
    'emulators:exec', '--only', 'firestore', '--config', config, '--project', 'demo-scoreplace',
    'node ' + JSON.stringify(__filename)
  ], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 180000 });
  process.stdout.write((out.stdout || '') + (out.stderr || ''));
  if (out.status !== 0) process.exit(out.status || 1);
  process.exit(0);
}

(async () => {
  const admin = require('../functions/node_modules/firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
  const db = admin.firestore();
  const ref = db.collection('tournaments').doc('phase-cas');
  await ref.set({ format: 'Liga', matches: [{ id: 'm1', scoreP1: 6 }], participants: [{ uid: 'u1' }] });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const url = 'http://' + host + ':' + port +
    '/v1/projects/demo-scoreplace/databases/(default)/documents/tournaments/phase-cas?' +
    'updateMask.fieldPaths=phases&currentDocument.updateTime=' + encodeURIComponent('1970-01-01T00:00:00.000000Z');
  const response = await fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { phases: { arrayValue: { values: [] } } } })
  });
  const after = (await ref.get()).data();
  assert.strictEqual(response.ok, false, 'precondição vencida deve recusar PATCH REST');
  assert.strictEqual(after.phases, undefined, 'PATCH recusado não cria phases');
  assert.strictEqual(after.matches[0].scoreP1, 6, 'PATCH recusado preserva placar');
  assert.strictEqual(after.participants[0].uid, 'u1', 'PATCH recusado preserva elenco');
  console.log('✓ CAS REST do emulador rejeita updateTime vencido sem alterar o torneio');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
