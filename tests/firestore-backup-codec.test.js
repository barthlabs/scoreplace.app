'use strict';
const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { makeCodec } = require('../scripts/firestore-backup-codec');

admin.initializeApp({ projectId: 'demo-scoreplace-backup' });
const db = admin.firestore();
const { encode, decode } = makeCodec(admin, db);
const original = {
  text: 'Atleta', count: 3, flag: true, empty: null,
  timestamp: new admin.firestore.Timestamp(1794750000, 123456789),
  location: new admin.firestore.GeoPoint(-23.55, -46.63),
  reference: db.doc('tournaments/example/registrations/athlete'),
  bytes: Buffer.from([0, 1, 255]), date: new Date('2026-11-15T12:00:00.000Z'),
  nested: [{ score: 7 }, { score: 5 }],
};
const restored = decode(JSON.parse(JSON.stringify(encode(original))));
assert.deepEqual(restored, original, 'backup JSON restaura os tipos Firestore e valores originais');
assert.throws(() => encode({ unsafe: new Set([1]) }), /não suportado/,
  'tipo desconhecido bloqueia a migração antes da escrita');
admin.app().delete();
console.log('✅ backup Firestore: ida e volta tipada e recusa de tipo desconhecido');
