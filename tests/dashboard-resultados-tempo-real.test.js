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
let callback, unsubscribed = 0, paints = 0, saves = 0, warnings = 0;
const query = { onSnapshot(opts, ok) { callback = ok; return () => { unsubscribed++; }; } };
const window = {
  FirestoreDB: { db: {}, _tSub(tid, name) { assert.equal(name, 'matches'); return query; },
    _resultFromPhysicalMatch(doc, id) { assert.equal(doc._chave, id); return { ...doc.jogo, matchId: id }; } },
  _isRemoteFirestoreSnapshot: snap => !snap.metadata.fromCache,
  _collectAllMatches: t => t.matches,
  _dashPedirRepintura() { paints++; }, _t: key => key
};
const store = vm.runInNewContext('({' + [property('_applyPhysicalResultOnMatch'), property('_notifyInvalidPhysicalMatch'), property('ouvirResultadosDaDashboard'), property('pararDeOuvirResultadosDaDashboard')].join(',') + '})', { window, String, Array, Object, showNotification: () => { warnings++; } });
store.tournaments = [{ id: 't', matches: [{ id: 'm', scoreP1: 0 }, { id: 'n', scoreP1: 0 }] }];
store._matchResultFields = ['scoreP1', 'scoreP2', 'winner'];
store._saveToCache = () => { saves++; };
store.ouvirResultadosDaDashboard(['t']);
assert.equal(typeof callback, 'function', 'a dashboard assina a subcoleção de jogos');
callback({ metadata: { fromCache: false }, docChanges() { return [{ type: 'modified', doc: { id: 'm', data() { return { _chave: 'm', jogo: { id: 'm', scoreP1: 6, scoreP2: 4, updatedAt: 'agora' } }; } } }]; } });
assert.equal(store.tournaments[0].matches[0].scoreP1, 6, 'resultado remoto é sobreposto no jogo vivo');
assert.equal(store._resultReadEpochs.t, 1, 'eco físico invalida leitura anterior em voo');
assert.equal(paints, 1, 'resultado remoto pede repintura da dashboard');
assert.equal(saves, 1, 'resultado remoto atualiza o cache local');
callback({ metadata: { fromCache: false }, docChanges() { return [{ type: 'modified', doc: { id: 'm', data() { return { _chave: 'm', _phaseIndex: 1, jogo: { id: 'm', scoreP1: 6, scoreP2: 4, updatedAt: 'agora' } }; } } }]; } });
assert.equal(paints, 1, 'índice de fase isolado não repinta');
callback({ metadata: { fromCache: false }, docChanges() { return [{ type: 'modified', doc: { id: 'm', data() { return { _chave: 'm', jogo: { id: 'm', scoreP1: 7, scoreP2: 4 } }; } } }]; } });
assert.equal(paints, 2, 'novo placar repinta');
callback({ metadata: { fromCache: false }, docChanges() { return [{ type: 'modified', doc: { id: 'm', data() { return { _chave: 'm', jogo: { id: 'm', scoreP1: 7, scoreP2: 4, winnerUid: 'u-a' } }; } } }]; } });
assert.equal(paints, 3, 'identidade do vencedor repinta mesmo sem mudança numérica');
const invalidAndValid = { metadata: { fromCache: false }, docChanges() { return [
  { type: 'modified', doc: { id: 'm', data() { return { _chave: 'wrong', jogo: { id: 'm', scoreP1: 99 } }; } } },
  { type: 'modified', doc: { id: 'n', data() { return { _chave: 'n', jogo: { id: 'n', scoreP1: 3 } }; } } }
]; } };
callback(invalidAndValid);
assert.equal(store.tournaments[0].matches[0].scoreP1, 7, 'delta inválido não altera o placar anterior');
assert.equal(store.tournaments[0].matches[1].scoreP1, 3, 'delta válido da mesma entrega é aplicado');
assert.equal(warnings, 1, 'erro é avisado uma vez por torneio');
assert.equal(store.tournaments[0]._results.m.scoreP1, 7, 'cache do jogo inválido fica íntegro');
callback(invalidAndValid);
assert.equal(warnings, 1, 'snapshot repetido não duplica o aviso');
callback({ metadata: { fromCache: false }, docChanges() { return [{ type: 'removed', doc: { id: 'm' } }]; } });
assert.equal(paints, 5, 'remoção repinta após delta válido');
assert.equal(store.tournaments[0].matches[0].scoreP1, undefined, 'remoção limpa placar do cache');
store.ouvirResultadosDaDashboard(['t']);
assert.equal(unsubscribed, 0, 'mesma janela não abre outro listener');
store.pararDeOuvirResultadosDaDashboard();
assert.equal(unsubscribed, 1, 'listener é solto ao sair da dashboard');
const router = fs.readFileSync(path.join(root, 'js/router.js'), 'utf8');
assert.match(router, /pararDeOuvirResultadosDaDashboard/, 'router solta o listener ao navegar para outra tela');
console.log('✓ dashboard: jogo físico, placar, índice isolado, remoção e listener liberado');
