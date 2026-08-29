/* O GATE DE WRITERS DETECTA DE VERDADE? — teste FUNCIONAL (6ª auditoria, ponto 1).
 * node tests/gate-amizade-detecta-alias.test.js
 *
 * ⛔ POR QUE ESTE TESTE EXISTE: o gate `check-amizade-client-writes.js` ficou VERDE por
 * semanas afirmando que só `amizade-lifecycle` e o backfill escreviam os quatro caches
 * sociais — enquanto `_amizadeAplicar`, dentro do `functions/index.js`, escrevia os quatro
 * usando aliases locais (`const AU = (v) => _FV.arrayUnion(v)`). A regex procurava o
 * OPERADOR na mesma linha e não via o alias.
 * Gate verde contradizendo o código é pior que gate nenhum: dá licença pra confiar.
 * Aqui o gate REAL roda contra sondas em disco, em cada estilo de escrita que já escapou.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

const ALVO = path.join(ROOT, 'js', 'views', '__sonda-gate-amizade.js');
function comSonda(codigo) {
  fs.writeFileSync(ALVO, codigo);
  try {
    return spawnSync('node', [path.join(ROOT, 'scripts', 'check-amizade-client-writes.js')],
      { cwd: ROOT, encoding: 'utf8' });
  } finally { fs.unlinkSync(ALVO); }
}

console.log('──── o gate de writers detecta? ────');

// 0) sem sonda, a árvore real passa
let r = spawnSync('node', [path.join(ROOT, 'scripts', 'check-amizade-client-writes.js')], { cwd: ROOT, encoding: 'utf8' });
ok(r.status === 0, 'a árvore real passa no gate (sem falso positivo)');

// 1) O ESTILO QUE ESCAPOU: alias local
r = comSonda(`
var _x = function (db, uid, outro) {
  var AU = function (v) { return FV.arrayUnion(v); };
  var AR = function (v) { return FV.arrayRemove(v); };
  return db.collection('users').doc(uid).update({ friends: AU(outro), friendRequestsSent: AR(outro) });
};
`);
ok(r.status !== 0, '⛔ ALIAS (AU/AR) é detectado — era exatamente o que escapava');
ok(/friends/.test(r.stdout + r.stderr), 'e o relatório nomeia o campo');

// 2) payload montado numa VARIÁVEL, longe da chamada
r = comSonda(`
var _y = function (db, uid, lista) {
  var payload = {
    displayName: 'x',
    friends: lista
  };
  return db.collection('users').doc(uid).set(payload, { merge: true });
};
`);
ok(r.status !== 0, '⛔ payload em VARIÁVEL, algumas linhas acima da escrita, é detectado');

// 3) valor literal, sem operador nenhum
r = comSonda(`
var _z = function (db, uid) {
  return db.collection('users').doc(uid).update({ friendRequestsReceived: [] });
};
`);
ok(r.status !== 0, '⛔ valor LITERAL (sem arrayUnion/FieldValue) é detectado');

// 4) caminho de campo com ponto (mapa)
r = comSonda(`
var _w = function (db, uid, outro) {
  var u = {};
  u['friendRequestsSentAt.' + outro] = new Date().toISOString();
  return db.collection('users').doc(uid).update(u);
};
`);
ok(r.status !== 0, '⛔ caminho de campo "friendRequestsSentAt.<uid>" é detectado');

// 5) CONTROLE: escrita em campo que NÃO é de amizade não pode acusar
r = comSonda(`
var _ok = function (db, uid) {
  return db.collection('users').doc(uid).update({ displayName: 'novo', city: 'SP' });
};
`);
ok(r.status === 0, 'controle: campo comum NÃO é acusado (gate não vira ruído)');

// 6) CONTROLE: objeto local com a palavra `friends` mas sem escrita no Firestore
r = comSonda(`
var _ok2 = function () {
  var buckets = {};
  for (var h = 0; h < 24; h++) buckets[h] = { friends: 0, me: 0 };
  return Object.create(buckets);
};
`);
ok(r.status === 0, 'controle: objeto local com `friends:` e Object.create NÃO é acusado');

console.log(pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
