'use strict';
/* Integração de fronteira: `addNotification` não pode voltar a ser uma escrita
 * Firestore nem depender de uma view. Este teste carrega o firebase-db real,
 * deixa o transporte canônico montar a chamada e confere o protocolo callable
 * completo que chega à Function `sendRelatedNotification`. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
const calls = [];
const window = { _error() {}, _warn() {}, _log() {}, _noteFsReads() {} };
const user = { getIdToken: async () => 'token-de-usuario' };
const sandbox = {
  window, console, Date, JSON, Math, Object, Array, String, Number, Boolean, Promise, RegExp, Error, setTimeout,
  fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ result: { ok: true, delivered: true, notificationId: 'n1' } }) };
  },
  firebase: {
    auth: () => ({ currentUser: user }),
    app: () => ({ options: { projectId: 'scoreplace-app' } })
  }
};
window.firebase = sandbox.firebase;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'firebase-db.js' });

(async () => {
  const result = await window.FirestoreDB.addNotification('uid-destino', {
    type: 'schedule', tournamentId: 'tour_1', message: 'Jogo agendado', fromUid: 'forjado-no-browser'
  });
  assert.deepEqual(result, { ok: true, delivered: true, notificationId: 'n1' });
  assert.equal(calls.length, 1, 'a intenção gera exatamente uma chamada');
  const call = calls[0];
  assert.equal(call.url, 'https://us-central1-scoreplace-app.cloudfunctions.net/sendRelatedNotification');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.Authorization, 'Bearer token-de-usuario');
  assert.equal(call.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.options.body), {
    data: {
      targetUid: 'uid-destino',
      notification: {
        type: 'schedule', tournamentId: 'tour_1', message: 'Jogo agendado', fromUid: 'forjado-no-browser'
      }
    }
  });
  console.log('✓ notification-client-callable-contract: cliente → transporte canônico → Function');
})().catch((error) => { console.error(error); process.exitCode = 1; });
