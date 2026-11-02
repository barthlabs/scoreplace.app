'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');
const root = path.join(__dirname, '..');

function property(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  let found;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Property' && node.key && node.key.name === name) found = source.slice(node.start, node.end);
    Object.values(node).forEach(value => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    });
  }
  walk(acorn.parse(source, { ecmaVersion: 'latest' }));
  assert.ok(found, name);
  return found;
}

(async () => {
  const fields = {
    scoreP1: 6, scoreP2: 4, winner: 'A', draw: false,
    sets: [{ gamesP1: 6, gamesP2: 4 }], setsWonP1: 1, setsWonP2: 0,
    totalGamesP1: 6, totalGamesP2: 4, fixedSet: true,
    resultAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:01:00Z',
    startedAt: '2026-10-01T00:00:00Z', pendingResult: null,
    wo: false, woAbsent: null, woAbsentSide: null,
    p1: 'A', p2: 'B', team1Uids: ['a'], team2Uids: ['b'], p1Uid: 'a', p2Uid: 'b'
  };
  let reads = 0, collection;
  const docs = Array.from({ length: 213 }, (_, index) => {
    const id = 'm' + index;
    const jogo = { id, ...fields, updatedAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString() };
    return { id, data: () => ({ _chave: id, _loc: { tipo: 'matches' }, jogo, playerUids: ['a', 'b'] }) };
  });
  const db = vm.runInNewContext('({' + property('js/firebase-db.js', '_resultFromPhysicalMatch') + ',' +
    property('js/firebase-db.js', 'loadMatchResults') + '})');
  db.ensureDb = () => true;
  db._tSub = (tid, name) => {
    collection = name;
    return { get: async opts => {
      assert.equal(opts.source, 'server');
      reads += docs.length;
      return { forEach: fn => docs.forEach(fn) };
    } };
  };
  const partial = await db.loadMatchResults('t', { limit: 40 });
  assert.equal(collection, 'matches');
  assert.equal(reads, 213, 'a janela inclui todos os jogos físicos antes de selecionar os recentes');
  assert.equal(Object.keys(partial).length, 40);
  assert.ok(partial.m212 && !partial.m0, 'o jogo recente não some por ordem do Firestore');
  const full = await db.loadMatchResults('t');
  assert.equal(Object.keys(full).length, 213);
  for (const [key, value] of Object.entries(fields)) {
    if (key !== 'updatedAt') assert.deepEqual(full.m0[key], value, key);
  }
  assert.equal(full.m0.updatedAt, docs[0].data().jogo.updatedAt);
  assert.deepEqual(Array.from(full.m0.playerUids), ['a', 'b']);
  assert.equal(full.m0.matchId, 'm0');
  docs.push({ id: 'r0-1', data: () => ({ _chave: 'r0-1', _loc: { tipo: 'rounds' },
    jogo: { scoreP1: 6, scoreP2: 4 }, playerUids: ['a'] }) });
  assert.deepEqual([...(await db.loadMatchResults('t'))['r0-1'].playerUids], ['a']);
  assert.equal((await db.loadMatchResults('t'))['r0-1'].scoreP1, 6);
  assert.equal((await db.loadMatchResults('t'))['r0-1'].matchId, 'r0-1');
  docs.pop();
  docs.push({ id: '42', data: () => ({ _chave: '42', _loc: { tipo: 'matches' },
    jogo: { id: 42, scoreP1: 7 } }) });
  assert.equal((await db.loadMatchResults('t'))['42'].id, '42');
  docs.pop();
  docs.push({ id: 'broken', data: () => ({ _chave: 'outro', _loc: {}, jogo: { id: 'broken' } }) });
  await assert.rejects(db.loadMatchResults('t'), /Jogo canônico inválido/);

  let errors = 0, saves = 0, warnings = 0;
  const window = {
    FirestoreDB: { loadMatchResults: () => db.loadMatchResults('t') },
    _collectAllMatches: t => t.matches,
    _error: () => { errors++; }, _t: key => key
  };
  const store = vm.runInNewContext('({' + property('js/store.js', 'hydrateMatchResults') + ',' +
    property('js/store.js', '_applyPhysicalResultOnMatch') + ',' +
    property('js/store.js', '_notifyInvalidPhysicalMatch') + '})',
  { window, showNotification: () => { warnings++; } });
  store.currentUser = { uid: 'u' };
  store.tournaments = [{ id: 't', matches: [{ id: 'm0', scoreP1: 3 }, { id: 'inline', scoreP1: 8 }] }];
  store._matchResultFields = Object.keys(fields);
  store._saveToCache = () => { saves++; };
  assert.equal(await store.hydrateMatchResults('t'), false, 'documento inválido aborta toda a hidratação');
  assert.equal(errors, 1);
  assert.equal(warnings, 1, 'erro de jogo no lote tem aviso visível');
  assert.equal(saves, 0);
  assert.equal(store.tournaments[0]._resultsHydrated, undefined);
  assert.equal(store.tournaments[0].matches[0].scoreP1, 3, 'placar anterior não é sobrescrito parcialmente');
  assert.equal(await store.hydrateMatchResults('t'), false);
  assert.equal(warnings, 1, 'aviso de erro não repete na mesma sessão');
  docs.pop();
  assert.equal(await store.hydrateMatchResults('t'), true, 'leitura íntegra permite nova tentativa');
  assert.equal(store.tournaments[0].matches[0].scoreP1, 6);
  assert.equal(store.tournaments[0].matches[1].scoreP1, 8, 'jogo inline ainda visível antes da migração');
  assert.equal(saves, 1);
  console.log('✓ E05 leitor físico: 213 jogos, janela 40, campos completos, falha fechada e jogo inline preservado');
})().catch(error => { console.error(error); process.exitCode = 1; });
