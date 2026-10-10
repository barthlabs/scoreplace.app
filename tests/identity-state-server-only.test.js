'use strict';
const fs = require('fs');
const path = require('path');
let fail = 0;
const ok = (value, message) => { console.log((value ? '✓ ' : '✗ ') + message); if (!value) fail++; };
const root = path.join(__dirname, '..');
const functions = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const client = fs.readFileSync(path.join(root, 'js', 'firebase-db.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'functions', 'identity-state-core.js'), 'utf8');
const initStart = functions.indexOf('exports.initializeUserProfile = onCall');
const initEnd = functions.indexOf('exports.getOwnIdentityStatus = onCall', initStart);
const init = functions.slice(initStart, initEnd);
const statusStart = initEnd;
const statusEnd = functions.indexOf('\nexports.', statusStart + 8);
const status = functions.slice(statusStart, statusEnd < 0 ? functions.length : statusEnd);

ok(init.includes('identityRef') && init.includes('_identityState.initial') && init.includes('tx.create(identityRef'),
  'perfil e estado privado nascem na mesma transação');
ok(status.includes('request.auth && request.auth.uid') && status.includes('accountIdentity') && status.includes('_identityState.read'),
  'Callable devolve somente o estado normalizado da própria conta');
ok(/match \/accountIdentity\/\{userId\} \{\s*allow read, write: if false;/s.test(rules),
  'Rules negam leitura e escrita direta de accountIdentity');
ok(/match \/identityVerifications\/\{verificationId\} \{\s*allow read, write: if false;/s.test(rules),
  'Rules negam acesso direto às verificações');
ok(/match \/identityClaims\/\{providerSubjectHash\} \{\s*allow read, write: if false;/s.test(rules),
  'Rules negam acesso direto às claims de identidade');
ok(client.includes("_callFn('getOwnIdentityStatus', {})") && !/collection\(['\"]accountIdentity['\"]\)/.test(client),
  'cliente consulta o resumo por Callable e não acessa a coleção privada');
ok(core.includes("'legacy'") && core.includes("'duplicate_review'") && !/face|selfie|biometr/i.test(core),
  'núcleo limita estados e não recebe dado biométrico');
console.log(fail ? '❌ identity-state-server-only: ' + fail + ' falharam' : '✅ identity-state-server-only: OK');
process.exit(fail ? 1 : 0);
