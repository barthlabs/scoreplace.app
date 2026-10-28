'use strict';

// Executa a porta real do navegador: um espectador sem sessão pode pedir a
// projeção pública, mas a decisão de acesso continua na Function.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calls = [];
const window = {
  firebase: {
    auth: () => ({ currentUser: null }),
    app: () => ({ options: { projectId: 'demo-scoreplace' } })
  }
};
const source = fs.readFileSync(path.join(__dirname, '../js/firebase-db.js'), 'utf8');
const context = { window, fetch: async (url, options) => {
  calls.push({ url, options });
  return { ok: true, json: async () => ({ result: {
    tournamentId: 'tour-public', registrationCount: 1,
    participants: [{ uid: 'u1', categoryId: 'cat-a' }], placeholderReservations: []
  } }) };
}};
vm.runInNewContext(source, context, { filename: 'firebase-db.js' });

(async () => {
  window.FirestoreDB._ehSandbox = () => false;
  const result = await window.FirestoreDB.loadCanonicalTournamentRoster('tour-public');
  assert.equal(result.participants.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://us-central1-demo-scoreplace.cloudfunctions.net/getCanonicalTournamentRoster');
  assert.equal(calls[0].options.headers.Authorization, undefined, 'espectador anônimo não forja login');
  assert.equal(JSON.parse(calls[0].options.body).data.sandbox, false);
  console.log('✓ espectador sem login chega à callable; autorização permanece no servidor');
})().catch((error) => { console.error(error); process.exitCode = 1; });
