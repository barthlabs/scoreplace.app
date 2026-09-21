'use strict';

// A atualização do perfil é uma decisão de identidade: o navegador só declara
// a intenção. Este teste fecha as três fronteiras que evitam a regressão para
// set/update direto: cliente, Function transacional e Rules.
const fs = require('fs');
let failed = 0;
function ok(value, message) {
  console.log((value ? '✓ ' : '✗ ') + message);
  if (!value) failed++;
}

const fn = fs.readFileSync('functions/index.js', 'utf8');
const db = fs.readFileSync('js/firebase-db.js', 'utf8');
const auth = fs.readFileSync('js/views/auth.js', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');

const fnStart = fn.indexOf('exports.updateOwnProfile = onCall(');
const fnEnd = fn.indexOf('exports.updateOwnInterfacePreferences = onCall(', fnStart);
const fnBlock = fn.slice(fnStart, fnEnd);
ok(fnStart >= 0 && /request\.auth/.test(fnBlock) && /runTransaction/.test(fnBlock),
  'updateOwnProfile exige sessão e decide em transação');
ok(/_profileUpdate\.normalize/.test(fnBlock) && /normalizeEraseFields/.test(fnBlock),
  'Function aceita somente o contrato puro de perfil');
ok(/request\.auth\.token\.email/.test(fnBlock) && /telefone novo exige verificação/.test(fnBlock),
  'Function não aceita e-mail ou telefone novos só pela intenção do cliente');
ok(/displayNameClaims/.test(fnBlock) && /findDisplayNameConflict/.test(fnBlock),
  'troca de nome reserva a claim canônica');

const saveStart = db.indexOf('async saveUserProfile(uid, profileData, eraseFields)');
const saveEnd = db.indexOf('\n  },', saveStart);
const saveBlock = db.slice(saveStart, saveEnd);
ok(/_callFn\('updateOwnProfile'/.test(saveBlock) && !/collection\(['"]users['"]\)/.test(saveBlock),
  'cliente chama updateOwnProfile sem porta Firestore paralela');

const authStart = auth.indexOf('window.saveUserProfile = async function()');
const authEnd = auth.indexOf('\n  };', authStart);
const authBlock = auth.slice(authStart, authEnd);
ok(/FirestoreDB\.saveUserProfile\(uid, _profilePatch, _erased\)/.test(authBlock) && !/collection\(['"]users['"]\)\.doc\(uid\)\.set/.test(authBlock),
  'formulário usa a porta da Function, inclusive nas remoções');

ok(/function serverOwnedProfileFields\(\)/.test(rules) &&
  /affectedKeys\(\)\.hasAny\(serverOwnedProfileFields\(\)\)/.test(rules),
  'Rules recusam a escrita direta equivalente');
ok(/exports\.unlinkOwnLinkedPhone = onCall\([\s\S]*?runTransaction/.test(fn) &&
  /mergePhoneAccount[\s\S]*?computeLinkedIdentifiers/.test(fn),
  'celular secundário só nasce após prova de mesclagem e sai em transação');
ok(/unlinkOwnLinkedPhone\(cu\.uid, phone\)/.test(auth) &&
  !/collection\(['"]users['"]\)\.doc\(_cu\.uid\)\.update\(\{ linkedPhones/.test(auth),
  'cliente não tem escrita direta de celular vinculado');
const patchStart = auth.indexOf('function _patchProfileIfExists');
const patchEnd = auth.indexOf('// ─── CONTA ÓRFÃ', patchStart);
const patchBlock = auth.slice(patchStart, patchEnd);
ok(/saveUserProfile\(uid, identity\)/.test(patchBlock) && !/\.doc\(uid\)\.update\(fields\)/.test(patchBlock),
  'patch de identidade do login social usa a Function');

process.exitCode = failed ? 1 : 0;
