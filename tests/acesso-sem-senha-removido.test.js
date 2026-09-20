'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const auth = fs.readFileSync(path.join(root, 'js/views/auth.js'), 'utf8');
const functions = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const oldClientApi = 'signInWith' + 'EmailLink';
const oldServerApi = 'generateSignInWith' + 'EmailLink';
const oldCallable = String.fromCharCode(115, 101, 110, 100, 77, 97, 103, 105, 99, 76, 105, 110, 107);
const oldCollection = String.fromCharCode(109, 97, 103, 105, 99, 76, 105, 110, 107, 115);

async function main() {
  assert.ok(!auth.includes(oldClientApi), 'o cliente não autentica por URL');
  assert.ok(!functions.includes(oldServerApi), 'o servidor não gera URL de autenticação');
  assert.ok(!functions.includes(oldCallable), 'a callable removida não reapareceu');
  assert.ok(!rules.includes(oldCollection), 'as Rules não expõem a coleção desativada');
  assert.match(functions, /generateEmailVerificationLink/);
  assert.match(functions, /mode=verifyEmail/);
  assert.match(functions, /55 \* 60 \* 1000/);
  assert.match(auth, /qs\.get\('ml'\)/);
  assert.match(auth, /Este acesso por link não está mais disponível/);

  const begin = functions.indexOf('async function _wrapVerificationLink');
  const end = functions.indexOf('\nasync function _queueVerificationEmail', begin);
  assert.ok(begin >= 0 && end > begin, 'âncoras do invólucro de confirmação');
  const createWrapper = new Function('admin', 'require', functions.slice(begin, end) + '\nreturn _wrapVerificationLink;');
  const wrap = createWrapper({}, require);
  await assert.rejects(
    () => wrap('https://example.invalid/?mode=' + 'sign' + 'In'),
    /apenas links de confirmação/,
    'o invólucro rejeita URL que não seja de confirmação'
  );
  console.log('✅ acesso sem senha removido: APIs antigas ausentes e confirmação isolada');
}

main().catch((error) => { console.error(error); process.exit(1); });
