'use strict';

const assert = require('node:assert/strict');
const { protectedWrite } = require('./safe-test');
const req = (method, url) => ({ method: () => method, url: () => url });

assert.equal(protectedWrite(req('POST', 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel')), 'Firestore RPC');
assert.equal(protectedWrite(req('POST', 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Commit')), 'Firestore RPC');
assert.equal(protectedWrite(req('POST', 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents/tournaments')), 'Firestore REST');
assert.equal(protectedWrite(req('PATCH', 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents/tournaments/a')), 'Firestore REST');
assert.equal(protectedWrite(req('POST', 'https://us-central1-scoreplace-app.cloudfunctions.net/applyMatchResult')), 'Function');
assert.equal(protectedWrite(req('POST', 'https://scoreplace-operation-router-abc.run.app/applyMatchResult')), 'Function');
assert.equal(protectedWrite(req('POST', 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel')), null);
assert.equal(protectedWrite(req('POST', 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents:runQuery')), null);
assert.equal(protectedWrite(req('GET', 'https://scoreplace.app/index.html')), null);
console.log('safe-test-guard: 9/9');
