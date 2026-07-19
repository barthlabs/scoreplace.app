/* POPULAR loginRedirects na FUSÃO (item 9, dono, 19-jul). A resolveLoginRedirect LIA
 * `loginRedirects/{email|phone}` mas NADA escrevia → o redirect nunca disparava (feature morta:
 * quem funde 2 contas Google e loga pela "errada" caía numa conta vazia). Fix: a fusão grava
 * {credencial do DROP} → uid do sobrevivente, via _recordLoginRedirects.
 *
 * Este teste extrai o _recordLoginRedirects REAL do functions/index.js e:
 *  (a) prova, no SOURCE, que os motores de fusão passaram a CHAMAR o helper (falha no código
 *      antigo, onde a coleção nunca era escrita);
 *  (b) exercita a escrita contra um Firestore falso e assere a CHAVE exata que a
 *      resolveLoginRedirect LÊ (e-mail minúsculo / telefone E.164) → ownerUid.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── login-redirect-write ────');

// (a) SOURCE: a fusão agora escreve loginRedirects (chama o helper). No código ANTIGO não havia
//     nem o helper nem a chamada → estas asserções falhariam.
ok(src.indexOf('async function _recordLoginRedirects') !== -1, 'helper _recordLoginRedirects existe');
ok(/_mergeAccountsKeepOlder[\s\S]*?_recordLoginRedirects\(/.test(src), 'motor _mergeAccountsKeepOlder chama _recordLoginRedirects');
ok(/mergePhoneAccount[\s\S]*?_recordLoginRedirects\(/.test(src), 'mergePhoneAccount chama _recordLoginRedirects');
// _executeMerge = denominador comum (cobre o SCAN automático: _scanAndMergeByField / autoMergeOnProfileUpdate).
ok(/async function _executeMerge[\s\S]*?_recordLoginRedirects\(/.test(src), '_executeMerge chama _recordLoginRedirects (cobre merges de scan/auto)');
ok(src.indexOf('collection("loginRedirects").doc(') !== -1 && /\.set\(\s*\{ ownerUid/.test(src), 'grava loginRedirects/{k} → { ownerUid }');

// (b) FUNCIONAL: extrai os 2 helpers do source e roda a escrita contra um db falso.
function sliceFn(sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let b = src.indexOf('{', i), depth = 0, j = b;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(i, j);
}
const synSrc = sliceFn('function _isSyntheticAuthEmail');
const recSrc = sliceFn('async function _recordLoginRedirects');
ok(!!synSrc && !!recSrc, 'extraiu os 2 helpers do source');

const writes = {};
const fakeDb = { collection: (c) => ({ doc: (d) => ({ set: async (data) => { writes[c + '/' + d] = data; return; } }) }) };
const admin = { firestore: { FieldValue: { serverTimestamp: () => '<ts>' } } };
// define os 2 helpers num escopo com `admin`/`console` e devolve _recordLoginRedirects
const _recordLoginRedirects = new Function('admin', 'console',
  synSrc + '\n' + recSrc + '\nreturn _recordLoginRedirects;')(admin, console);

(async () => {
  // 2 Google fundidas: e-mail do DROP (maiúsculo no token real) → chave minúscula.
  await _recordLoginRedirects(fakeDb, 'uid_KEEP', 'Dudu.Mange@Gmail.com', null);
  ok(writes['loginRedirects/dudu.mange@gmail.com'] && writes['loginRedirects/dudu.mange@gmail.com'].ownerUid === 'uid_KEEP',
    'e-mail do drop vira chave MINÚSCULA → ownerUid (igual ao que resolveLoginRedirect lê)');

  // telefone E.164 vira chave crua.
  await _recordLoginRedirects(fakeDb, 'uid_P', null, '+5511999998888');
  ok(writes['loginRedirects/+5511999998888'] && writes['loginRedirects/+5511999998888'].ownerUid === 'uid_P',
    'telefone E.164 vira chave → ownerUid');

  // e-mail SINTÉTICO (phone-only) é ignorado — não é login real.
  const before = Object.keys(writes).length;
  await _recordLoginRedirects(fakeDb, 'uid_X', 'abc@phone.scoreplace.app', null);
  ok(Object.keys(writes).length === before, 'e-mail sintético (@phone.scoreplace.app) NÃO é gravado');

  // sem ownerUid → no-op.
  await _recordLoginRedirects(fakeDb, '', 'x@y.com', null);
  ok(!writes['loginRedirects/x@y.com'], 'sem ownerUid → não grava');

  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ login-redirect-write FALHOU'); process.exit(1); }
  console.log('✅ login-redirect-write: OK');
})();
