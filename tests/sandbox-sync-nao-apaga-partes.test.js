/* `AppStore.sync()` NÃO pode transformar uma cópia dividida em vazia.
 * Executa a porta real `FirestoreDB.saveTournament`, com o mesmo
 * `skipParticipants:true` que derrubou inscritos no sandbox da Confra. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let bad = 0;
const ok = (v, m) => { if (v) console.log('✓ ' + m); else { bad++; console.error('✗ ' + m); } };
const ROOT = process.env.SP_ROOT || path.join(__dirname, '..');
const W = { window: null, globalThis: null, console, navigator: { userAgent: 'node' },
  document: { getElementById: () => null, addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout, clearTimeout, _warn() {}, _error() {}, _log() {}, _debug() {},
  _safeHtml: String, _sbIdsConhecidos: { sb_sync: true },
  firebase: { firestore: Object.assign(() => ({}), { FieldValue: { delete: () => ({ _delete: true }) } }) }
};
W.window = W; W.globalThis = W;
vm.createContext(W);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8'), W);
const DB = W.FirestoreDB;
DB._cleanUndefined = (x) => JSON.parse(JSON.stringify(x));
DB._foldMonarchGroups = () => {};
DB._computeAdminEmails = DB._computeAdminUids = DB._computeMemberUids = () => [];

const before = { id: 'sb_sync', isSandbox: true,
  _semPesados: ['matches', 'participants', 'opponentHistory'],
  _nPartes: { matches: 2, participants: 2, opponentHistory: 1 }, _nJogos: 2,
  participants: [{ uid: 'a' }, { uid: 'b' }], opponentHistory: [{ id: 'h' }],
  nextDrawAt: 123, _faltamPesados: true, _faltaOQue: ['participants'],
  matches: [{ id: 'm1' }, { id: 'm2' }], rounds: [{ matches: [{ id: 'm1' }, { id: 'm2' }] }]
};
let saved = null, childReads = 0;
const ref = { get: async () => ({ exists: true, data: () => JSON.parse(JSON.stringify(before)) }),
  set: async (x) => { saved = x; }, collection: () => ({ get: async () => { childReads++; return { forEach() {} }; } }) };
DB.db = { collection: () => ({ doc: () => ref }) };

(async () => {
  await DB.saveTournament(JSON.parse(JSON.stringify(before)), { skipParticipants: true });
  ok(!!saved, 'sync ainda salva o documento administrativo');
  ok(saved && saved._nPartes === undefined && saved._nJogos === undefined,
    'sync não recalcula nem regrava marcadores de partes');
  ok(saved && saved.participants === undefined && saved.matches === undefined && saved.opponentHistory === undefined,
    'sync não envia partes divididas como lista vazia');
  ok(saved && saved.nextDrawAt === undefined && saved._faltamPesados === undefined && saved._faltaOQue === undefined,
    'sync não persiste agenda nem marcadores transitórios da tela');
  ok(childReads === 0, 'sync não lê nem chama o delta das subcoleções');
  console.log(bad ? `❌ ${bad} falha(s)` : '✅ sync do sandbox não apaga partes');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e.stack); process.exit(1); });
