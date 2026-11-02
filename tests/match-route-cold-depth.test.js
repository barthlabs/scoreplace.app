'use strict';

// Navegação fria pelo roteador REAL: a ficha de um jogo não hidrata o torneio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calls = { tournament: 0, roster: 0, ensure: 0, result: 0 };
const listeners = new Map();
const body = { innerHTML: '' };
const classList = { add() {}, remove() {}, contains() { return false; } };
const container = {
  style: {}, classList, _html: '',
  get innerHTML() { return this._html; },
  set innerHTML(value) {
    this._html = String(value);
    if (this._html.includes('id="fase-b-match-body"')) body.innerHTML = this._html;
  },
  get firstElementChild() { return this._html ? {} : null; }
};
const document = {
  documentElement: { scrollTop: 0 }, body: { scrollTop: 0 },
  querySelectorAll() { return []; },
  getElementById(id) {
    if (id === 'view-container') return container;
    if (id === 'fase-b-match-body' && container.innerHTML.includes('id="fase-b-match-body"')) return body;
    return null;
  }
};
const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const W = {
  location: { hash: '#match/fixture/game-1', search: '' },
  AppStore: { currentUser: { uid: 'fixture-user' }, _invitedTournamentIds: [] },
  FirestoreDB: {
    loadTournamentById() { calls.tournament++; return Promise.resolve(null); },
    loadCanonicalTournamentRoster() { calls.roster++; return Promise.resolve(null); },
    ensureDb() { return true; },
    loadCanonicalMatch() { calls.result++; return Promise.resolve({ id: 'game-1', p1: 'Equipe A', p2: 'Equipe B', scoreP1: 6, scoreP2: 4, winner: 'Equipe A' }); }
  },
  _ensureTournamentLoaded() { calls.ensure++; },
  _renderBackHeader() { return '<header>Voltar</header>'; },
  _reflowChrome() {},
  _spCor(value) { return value; },
  _log() {}, _warn() {}, scrollTo() {},
  addEventListener(name, fn) { listeners.set(name, fn); },
  removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
};
W.window = W;
const context = vm.createContext({
  window: W, document, history: { scrollRestoration: 'auto' },
  sessionStorage: storage, localStorage: storage,
  requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {},
  _t(key) { return key; },
  console
});
const root = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(root, 'js/views/tournaments-sharing.js'), 'utf8'), context,
  { filename: 'tournaments-sharing.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js/router.js'), 'utf8'), context,
  { filename: 'router.js' });

function flush() { return new Promise(resolve => setImmediate(resolve)); }
function assertNoHeavyRead() {
  assert.equal(calls.tournament, 0, 'não lê torneio inteiro');
  assert.equal(calls.roster, 0, 'não lê elenco canônico');
  assert.equal(calls.ensure, 0, 'não chama hidratação integral');
}
function navigate(matchId) {
  W.location.hash = '#match/fixture/' + matchId;
  const listener = listeners.get('hashchange');
  assert.equal(typeof listener, 'function', 'initRouter registrou hashchange real');
  listener();
}

(async () => {
  context.initRouter(); // execução fria passa pelo handleRoute completo
  assert.match(body.innerHTML, /Carregando o jogo/);
  await flush();
  assert.match(body.innerHTML, /Equipe A/);
  assert.match(body.innerHTML, /6 × 4/);
  assert.equal(calls.result, 1);
  assertNoHeavyRead();

  W.FirestoreDB.loadCanonicalMatch = () => { calls.result++; return Promise.resolve(null); };
  navigate('sem-ficha');
  await flush();
  assert.match(body.innerHTML, /ainda não tem ficha própria/);
  assert.equal(calls.result, 2);

  W.FirestoreDB.ensureDb = () => false;
  W.FirestoreDB.loadCanonicalMatch = function () {
    calls.result++;
    if (!this.ensureDb()) return Promise.reject(Object.assign(new Error('indisponível'), { code: 'unavailable' }));
    throw new Error('não deveria consultar');
  };
  navigate('banco-indisponivel');
  await flush();
  assert.match(body.innerHTML, /Erro ao carregar o jogo/,
    'banco indisponível deve ser erro visível');

  W.FirestoreDB.loadCanonicalMatch = () => { calls.result++; return Promise.reject(Object.assign(new Error('negado'), { code: 'permission-denied' })); };
  navigate('negado');
  await flush();
  assert.match(body.innerHTML, /Sem acesso a este jogo/);

  W.FirestoreDB.loadCanonicalMatch = () => { calls.result++; return Promise.reject(new Error('rede')); };
  navigate('falha');
  await flush();
  assert.match(body.innerHTML, /Erro ao carregar o jogo/);

  const readsBeforeEmptyId = calls.result;
  W.renderMatchPage(container, 'fixture', '');
  assert.match(body.innerHTML, /Jogo não encontrado/);
  assert.equal(calls.result, readsBeforeEmptyId, 'ID de jogo vazio não consulta o banco');
  assertNoHeavyRead();

  // Exercita o método real com Firestore falso: dois documentos, ambos do servidor.
  const databaseWindow = { _sbIdsConhecidos: {} };
  databaseWindow.window = databaseWindow;
  const databaseContext = vm.createContext({ window: databaseWindow, console });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8'), databaseContext,
    { filename: 'firebase-db.js' });
  const database = databaseWindow.FirestoreDB;
  const reads = [];
  const game = { id: 'game-1', p1: 'Equipe A', p2: 'Equipe B',
    scoreP1: 6, scoreP2: 4, winner: 'Equipe A', winnerUids: ['a'],
    team1Uids: ['a'], team2Uids: ['b'], sets: [{ gamesP1: 6, gamesP2: 4 }],
    wo: true, woAbsentSide: 'p2', pendingResult: { scoreP1: 6, scoreP2: 4 },
    _extraSecreto: 'não projetar' };
  const docs = {
    'tournaments/fixture/matches/game-1': { exists: true, data: () => ({ _chave: 'game-1', _loc: { parte: 'matches' }, jogo: game }) },
    'tournaments/fixture': { exists: true, data: () => ({ name: 'Torneio teste' }) }
  };
  let failRead = null;
  database.ensureDb = () => true;
  database.db = { collection(name) { return { doc(id) { const base = name + '/' + id; return {
    get(opts) { reads.push([base, opts.source]);
      return failRead === base ? Promise.reject(Object.assign(new Error('negado'), { code: 'permission-denied' }))
        : Promise.resolve(docs[base] || { exists: false }); },
    collection(sub) { return { doc(mid) { const key = base + '/' + sub + '/' + mid; return {
      get(opts) { reads.push([key, opts.source]);
        return failRead === key ? Promise.reject(Object.assign(new Error('negado'), { code: 'permission-denied' }))
          : Promise.resolve(docs[key] || { exists: false }); }
    }; } }; }
  }; } }; } };
  const projected = await database.loadCanonicalMatch('fixture', 'game-1');
  assert.equal(projected.scoreP1, 6);
  assert.equal(projected.winner, 'Equipe A');
  assert.equal(projected.woAbsentSide, 'p2');
  assert.equal(projected.pendingResult.scoreP1, 6);
  assert.equal(projected.tournamentName, 'Torneio teste');
  assert.equal(projected._extraSecreto, undefined);
  assert.equal(projected._chave, undefined);
  assert.deepEqual(reads, [
    ['tournaments/fixture/matches/game-1', 'server'], ['tournaments/fixture', 'server']
  ]);
  reads.length = 0;
  docs['tournaments/fixture/matches/game-1'] = { exists: true,
    data: () => ({ _chave: 'game-1', _loc: { parte: 'matches' },
      jogo: { ...game, id: undefined } }) };
  assert.equal((await database.loadCanonicalMatch('fixture', 'game-1')).scoreP1, 6,
    'ficha usa chave física quando jogo não tem id embutido');
  docs['tournaments/fixture/matches/game-1'] = { exists: true,
    data: () => ({ _chave: 'game-1', _loc: { parte: 'matches' }, jogo: game }) };
  reads.length = 0;
  assert.equal(await database.loadCanonicalMatch('fixture', 'missing'), null);
  assert.deepEqual(reads, [['tournaments/fixture/matches/missing', 'server']]);
  docs['tournaments/fixture/matches/game-1'] = { exists: true, data: () => ({ _chave: 'game-1', _loc: {}, jogo: { id: 'other' } }) };
  await assert.rejects(database.loadCanonicalMatch('fixture', 'game-1'), /canônico inválido/);
  docs['tournaments/fixture/matches/game-1'] = { exists: true, data: () => ({ _chave: 'game-1', _loc: {}, jogo: game }) };
  failRead = 'tournaments/fixture';
  await assert.rejects(database.loadCanonicalMatch('fixture', 'game-1'), { code: 'permission-denied' });
  failRead = 'tournaments/fixture/matches/game-1';
  await assert.rejects(database.loadCanonicalMatch('fixture', 'game-1'), { code: 'permission-denied' });
  failRead = null;
  await assert.rejects(database.loadCanonicalMatch('fixture', ''), /Identidade de jogo inválida/);
  database.ensureDb = () => false;
  await assert.rejects(database.loadCanonicalMatch('fixture', 'game-1'), { code: 'unavailable' });
  console.log('match-route-cold-depth: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
