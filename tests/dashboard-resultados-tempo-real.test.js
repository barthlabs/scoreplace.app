'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), acorn = require('acorn');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
function property(name) {
  let found;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Property' && n.key && n.key.name === name) found = source.slice(n.start, n.end);
    Object.keys(n).forEach(k => { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); });
  })(acorn.parse(source, { ecmaVersion: 'latest' }));
  assert.ok(found, name); return found;
}
let callback, unsubscribed = 0, paints = 0, saves = 0;
const query = { orderBy(field, dir) { assert.equal(field, 'updatedAt'); assert.equal(dir, 'desc'); return this; }, limit(n) { assert.equal(n, 40); return this; }, onSnapshot(opts, ok) { callback = ok; return () => { unsubscribed++; }; } };
const window = {
  FirestoreDB: { db: {}, _tSub() { return query; } },
  _isRemoteFirestoreSnapshot: snap => !snap.metadata.fromCache,
  _collectAllMatches: t => t.matches,
  _dashPedirRepintura() { paints++; }
};
const store = vm.runInNewContext('({' + [property('_carimboDeLote'), property('ouvirResultadosDaDashboard'), property('pararDeOuvirResultadosDaDashboard')].join(',') + '})', { window, String, Array, Object });
store.tournaments = [{ id: 't', matches: [{ id: 'm', scoreP1: 0 }] }];
store._overlayResultOnMatch = (m, r) => Object.assign(m, r);
store._saveToCache = () => { saves++; };
store.ouvirResultadosDaDashboard(['t']);
assert.equal(typeof callback, 'function', 'a dashboard assina a subcoleção de resultados');
callback({ metadata: { fromCache: false }, docChanges() { return [{ type: 'modified', doc: { id: 'm', data() { return { scoreP1: 6, scoreP2: 4, updatedAt: 'agora' }; } } }]; } });
assert.equal(store.tournaments[0].matches[0].scoreP1, 6, 'resultado remoto é sobreposto no jogo vivo');
assert.equal(paints, 1, 'resultado remoto pede repintura da dashboard');
assert.equal(saves, 1, 'resultado remoto atualiza o cache local');
store.ouvirResultadosDaDashboard(['t']);
assert.equal(unsubscribed, 0, 'mesma janela não abre outro listener');
store.pararDeOuvirResultadosDaDashboard();
assert.equal(unsubscribed, 1, 'listener é solto ao sair da dashboard');
const router = fs.readFileSync(path.join(root, 'js/router.js'), 'utf8');
assert.match(router, /pararDeOuvirResultadosDaDashboard/, 'router solta o listener ao navegar para outra tela');
console.log('✓ dashboard: resultado remoto sobreposto, repintura imediata e listener liberado');
