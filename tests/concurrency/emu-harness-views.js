/* Harness de CONCORRÊNCIA com a LÓGICA DE VIEW REAL — carrega os arquivos de
 * js/views/*.js + js/firebase-db.js e prova, no emulador, que o piloto
 * (_saveResultInline via mutateTournament + _applyResultToTournament REAL)
 * não perde write numa corrida de dois lançamentos.
 *
 * Truque de carregamento (ver gotchas no checkpoint da memória):
 *  - NÃO usar `vm.createContext` (outra realm → o SDK Firebase rejeita os
 *    objetos como "custom Object/Array").
 *  - NÃO usar `new Function` (top-level `function _x(){}` fica LOCAL, não vira
 *    window._x — _findMatch/_advanceWinner sumiam).
 *  - USAR `vm.runInThisContext` com `global.window = global`: roda no realm
 *    PRINCIPAL (literais OK pro Firestore) E as funções/vars top-level aterrissam
 *    no global — que É o window. Igual ao browser (script tag no escopo global).
 *
 * Reusa o app default já inicializado por emu-harness (default app é singleton).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const base = require('./emu-harness'); // inicializa app default + useEmulator

const ROOT = path.join(__dirname, '..', '..');

// window === global (uma realm só, como no browser).
global.window = global;
global.document = {
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {} }; },
  addEventListener: function () {}, body: {},
};
global.navigator = { userAgent: 'node' };
global._t = function (k, v) {
  return (v && typeof k === 'string') ? k.replace(/\{(\w+)\}/g, function (_, n) { return v[n] != null ? v[n] : '{' + n + '}'; }) : k;
};
global._warn = global._log = global._error = global._debug = function () {};
global._safeHtml = global._safeText = function (s) { return String(s == null ? '' : s); };
global.showNotification = function () {};
global.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, clear: function () {} };
global.firebase = base.firebase;
global.AppStore = { tournaments: [], currentUser: null };
global.setTimeout = setTimeout; global.clearTimeout = clearTimeout;

// Stubs de _idMap* (chaveados por nome). Suficiente: o auto-check-in NÃO é a
// asserção do teste (que é sobre resultado/advance sobreviverem à corrida), e
// os _idMap* reais dependem de store.js inteiro (_memberUidByName etc.).
global._idMapKey = function (t, who) {
  return { uid: (who && who.uid) || '', name: typeof who === 'string' ? who : ((who && (who.displayName || who.name)) || '') };
};
global._idMapGet = function (t, map, who) { var k = global._idMapKey(t, who); return (k.name && map) ? map[k.name] : undefined; };
global._idMapHas = function (t, map, who) { return !!global._idMapGet(t, map, who); };
global._idMapSet = function (t, map, who, v) { var k = global._idMapKey(t, who); if (k.name && map) map[k.name] = v; };
global._idMapDel = function (t, map, who) { var k = global._idMapKey(t, who); if (k.name && map) delete map[k.name]; };
global._memberUidByName = function () { return ''; };

// Stubs dos data-helpers do store.js usados pelo motor de W.O. (participants.js).
// NÃO são a lógica sob teste (a asserção é que o W.O. sobrevive à corrida).
global._pName = function (p) { return typeof p === 'string' ? p : ((p && (p.displayName || p.name)) || ''); };
global._participantUids = function (p) { return (p && typeof p === 'object' && p.uid) ? [p.uid] : []; };
global._isLigaFormat = function (t) { return !!(t && (t.format === 'Liga' || t.format === 'Ranking')); };
global._isMonarchFormat = function () { return false; };
global._memberNameByUid = function (t, k) {
  var parts = Array.isArray(t.participants) ? t.participants : [];
  var f = parts.find(function (p) { return typeof p === 'object' && p.uid === k; });
  return f ? global._pName(f) : '';
};
global._getStandbyPool = function (t) {
  var sp = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
  var wl = Array.isArray(t.waitlist) ? t.waitlist : [];
  var seen = new Set(sp.map(global._pName));
  var out = sp.slice();
  wl.forEach(function (w) { var n = global._pName(w); if (n && !seen.has(n)) out.push(w); });
  return out;
};
global._woHistSet = function () {};
global._woIsKnockoutMatch = function (t, m) {
  if (!t || !m) return false;
  if (m.group !== undefined) return false;
  var f = t.format || '';
  return f === 'Eliminatórias Simples' || f === 'Dupla Eliminatória' || m.nextMatchId != null;
};
global._findTournamentById = function (id) { return (global.AppStore.tournaments || []).find(function (t) { return String(t.id) === String(id); }) || null; };
global.AppStore.logAction = function () {};
global.AppStore.sync = function () {};
global.AppStore.syncImmediate = function () {};

// Ordem = index.html / headless.js: utils → categorias → model → logic → ui → participants → db.
const FILES = [
  // CÂNONES base que firebase-db.js delega (window._cleanUndefined/_computeMemberUids etc.) — foram
  // extraídos pra estes arquivos; a lista tinha bit-rotado sem eles → _cleanUndefined caía no fallback
  // e o save gravava null. Carregar PRIMEIRO (mesma ordem do index.html).
  'js/views/identity-core.js',
  'js/views/persist-core.js',
  'js/views/sport-rules.js',
  'js/views/tournaments-utils.js',
  'js/views/tournaments-categories.js',
  'js/views/bracket-model.js',
  'js/views/bracket-logic.js',
  'js/views/bracket-ui.js',
  'js/views/participants.js',
  'js/firebase-db.js',
];
for (const rel of FILES) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel });
}
global.FirestoreDB.init();
if (!global.FirestoreDB.db) {
  throw new Error('emu-harness-views: FirestoreDB.init falhou — ' + (global.FirestoreDB.lastInitError || '?'));
}

module.exports = {
  FirestoreDB: global.FirestoreDB,
  applyResult: global._applyResultToTournament,
  applyDrawDelta: global._applyDrawDeltaToTournament,
  applyWO: global._applyWO,
  readTournament: base.readTournament,
  seedTournament: base.seedTournament,
};
