'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('js/store.js', 'utf8');
const start = src.indexOf('  ouvirTorneioAberto(tournamentId) {');
const end = src.indexOf('  // v1.9.92: listener leve em `discoveryFeed`', start);
assert(start > 0 && end > start);

const callbacks = [];
let unsubscribed = 0;
let painted = 0;
let parts = 0;
const browser = {
  FirestoreDB: { db: {}, _tRef: id => ({ onSnapshot: (options, next, error) => {
    assert.equal(id, 'public-tournament');
    assert.equal(options.includeMetadataChanges, true);
    callbacks.push({ next, error });
    return () => { unsubscribed++; };
  } }) },
  _isRemoteFirestoreSnapshot: snap => !snap.metadata.fromCache,
  _preservaPartesMontadas: (next, previous) => ({ ...previous, ...next }),
  _softRefreshView: () => { painted++; }
};
const methods = new Function('window', 'return ({' + src.slice(start, end) + '});')(browser);
const store = {
  ...methods, tournaments: [], publicDiscovery: [],
  ouvirPartesDoTorneio: () => { parts++; }
};
store.ouvirTorneioAberto('public-tournament');
assert.equal(callbacks.length, 1, 'link público abre um ouvinte direto do documento');
const snapshot = (data, fromCache = false) => ({ exists: true, metadata: { fromCache }, data: () => data });
callbacks[0].next(snapshot({ id: 'public-tournament', matches: [{ id: 'm1', courtClockBaseAt: 'old' }] }, true));
assert.equal(store.publicDiscovery.length, 0, 'snapshot de cache não é mostrado como estado atual');
callbacks[0].next(snapshot({ id: 'public-tournament', matches: [{ id: 'm1', courtClockBaseAt: 'old' }] }));
assert.equal(painted, 1);
assert.equal(store.publicDiscovery[0].matches[0].courtClockBaseAt, 'old');
callbacks[0].next(snapshot({ id: 'public-tournament', matches: [{ id: 'm1', courtClockBaseAt: 'new' }] }));
assert.equal(store.publicDiscovery[0].matches[0].courtClockBaseAt, 'new', 'FF remoto chega sem recarga');
assert.equal(painted, 2, 'mudança remota solicita redesenho da tela aberta');
assert.equal(parts, 1, 'partes divididas são ouvidas após a primeira carga completa');
store.ouvirTorneioAberto('public-tournament');
assert.equal(callbacks.length, 1, 're-render não duplica assinaturas');
store.pararDeOuvirTorneioAberto();
assert.equal(unsubscribed, 1, 'sair da página solta a assinatura');
callbacks[0].next(snapshot({ id: 'public-tournament', matches: [{ id: 'm1', courtClockBaseAt: 'later' }] }));
assert.equal(painted, 2, 'assinatura encerrada não repinta depois da saída');

console.log('✓ tournament-open-realtime: navegador público recebe estado remoto sem refresh');
