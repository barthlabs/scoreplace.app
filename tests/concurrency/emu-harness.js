/* Harness de CONCORRÊNCIA — carrega o js/firebase-db.js REAL num contexto node,
 * com o SDK Firebase compat apontado pro EMULADOR do Firestore (Firestore de
 * verdade, local). É o padrão-ouro exigido pela memória project_concurrency_safe_saves:
 * um stub instantâneo torna a corrida IMPOSSÍVEL e testa AO REDOR do bug. Aqui os
 * saves REAIS batem no emulador, então a corrida acontece de verdade.
 *
 * Pré-requisito: rodar DENTRO de `firebase emulators:exec` (que sobe o Firestore
 * e injeta FIRESTORE_EMULATOR_HOST). Ver `npm run test:concurrency`.
 *
 * MODELO DE "2 CLIENTES": firebase-db.js usa o app DEFAULT (firebase.firestore()).
 * O app default é singleton no processo, então inicializamos UMA vez e apontamos
 * pro emulador. Cada makeClient() é um sandbox SEPARADO que recarrega o
 * firebase-db.js real (FirestoreDB próprio) mas compartilha a mesma conexão.
 * Isso basta pra reproduzir corrida: a semântica (lost-update no set-merge, e
 * conflito+retry na transação) é imposta pelo SERVIDOR do emulador, não pelo nº
 * de conexões; a divergência que causa lost-update vem das CÓPIAS locais do doc,
 * lidas separadamente pelo teste.
 *
 * Uso:
 *   const H = require('./emu-harness');
 *   const clientA = H.makeClient();
 *   await clientA.FirestoreDB.mutateTournament(id, mutatorFn);
 *   const doc = await H.readTournament(id);   // leitura crua
 */
const fs = require('fs');
const path = require('path');

const EMU_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-scoreplace';
const DB_FILE = path.join(__dirname, '..', '..', 'js', 'firebase-db.js');
const VIEWS = path.join(__dirname, '..', '..', 'js', 'views');

// Carrega firebase-db.js no REALM PRINCIPAL via `new Function` (não `vm`): assim
// os literais {}/[] criados dentro usam os intrínsecos do host, e o SDK Firebase
// aceita os objetos (o vm criaria objetos de outra realm → "custom Object object").
// firebase-db.js referencia só `window` e `firebase` como globais livres.
// Prepend dos CÂNONES que firebase-db.js delega (window._cleanUndefined/_computeMemberUids em
// persist-core; _participantUids/_entryTeamMembers em identity-core) — extraídos pra esses arquivos,
// senão _cleanUndefined cai no fallback e o save grava null. Mesma ordem do app (index.html).
const _coreCode = fs.readFileSync(path.join(VIEWS, 'identity-core.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(VIEWS, 'persist-core.js'), 'utf8') + '\n';
const _dbFactory = new Function('window', 'firebase',
  _coreCode + fs.readFileSync(DB_FILE, 'utf8') + '\n;return window.FirestoreDB;');

// ── App DEFAULT único, apontado pro emulador (uma vez por processo) ──────────
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
firebase.initializeApp({ projectId: PROJECT_ID }); // app default
const rawDb = firebase.firestore();
const [_host, _port] = EMU_HOST.split(':');
rawDb.useEmulator(_host, parseInt(_port, 10));

let _seq = 0;
function makeClient() {
  // `window` próprio por cliente = FirestoreDB próprio (sandbox lógico), mas
  // compartilhando o app default → mesma conexão (a semântica de corrida é do
  // servidor do emulador). Stubs de log; init() chama firebase.firestore().
  const win = {};
  win.window = win;
  win._warn = function () {};
  win._log = function () {};
  win._error = function () {};
  win._debug = function () {};
  const FirestoreDB = _dbFactory(win, firebase);
  FirestoreDB.init();
  if (!FirestoreDB.db) {
    throw new Error('makeClient: FirestoreDB.init falhou — ' + (FirestoreDB.lastInitError || '?'));
  }
  _seq++;
  return { id: _seq, FirestoreDB, firebase, rawDb, win };
}

async function readTournament(id) {
  const snap = await rawDb.collection('tournaments').doc(String(id)).get();
  return snap.exists ? snap.data() : null;
}

async function seedTournament(t) {
  await rawDb.collection('tournaments').doc(String(t.id)).set(t);
}

module.exports = { makeClient, readTournament, seedTournament, EMU_HOST, PROJECT_ID, rawDb, firebase };
