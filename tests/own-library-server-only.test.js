'use strict';
const fs = require('fs');
const path = require('path');
let fail = 0;
const ok = (value, message) => { console.log((value ? '✓ ' : '✗ ') + message); if (!value) fail++; };
const root = path.join(__dirname, '..');
const functions = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const client = fs.readFileSync(path.join(root, 'js', 'firebase-db.js'), 'utf8');
const transfer = fs.readFileSync(path.join(root, 'js', 'views', 'host-transfer.js'), 'utf8');

ok(functions.includes('exports.saveOwnTournamentTemplate = onCall') && functions.includes('exports.deleteOwnTournamentTemplate = onCall'),
  'templates pessoais só têm capabilities autenticadas');
ok(functions.includes('exports.markOwnNotificationsRead = onCall') && functions.includes('request.auth && request.auth.uid'),
  'leitura da própria caixa usa uid do token');
ok(/match \/templates\/\{templateId\} \{\s*allow read: if request\.auth != null && request\.auth\.uid == userId;\s*\/\/[^]*?allow write: if false;/s.test(rules),
  'Rules deixam template legível apenas ao dono e fecham escrita direta');
ok(/match \/notifications\/\{notifId\} \{[^]*?allow update, delete: if false;/s.test(rules),
  'Rules fecham update/delete direto de notificação');
ok(client.includes("_callFn('saveOwnTournamentTemplate'") && client.includes("_callFn('deleteOwnTournamentTemplate'") && client.includes("_callFn('markOwnNotificationsRead'"),
  'cliente usa as três capabilities canônicas');
ok(!/collection\('users'\)\.doc\(uid\)\.collection\('templates'\)\.add/.test(client) &&
   !/collection\('users'\)\.doc\(uid\)\.collection\('templates'\)\.doc\(templateId\)\.delete/.test(client),
  'cliente não mantém fallback de escrita direta de template');
ok(!/d\.ref\.update\(\{ read: true \}\)/.test(transfer) && transfer.includes('markNotificationsRead(me.uid, ids)'),
  'aceite de co-organização não atualiza notificação direto');
console.log(fail ? '❌ own-library-server-only: ' + fail + ' falharam' : '✅ own-library-server-only: OK');
process.exit(fail ? 1 : 0);
