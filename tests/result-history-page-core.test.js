'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PAGE_SIZE, readResultHistoryPage, decodeCursor } = require('../functions/result-history-page-core');

function fixture() {
  const data = new Map();
  const roots = new Map();
  const docs = [];
  const add = (path, value) => {
    const id = path.split('/').at(-1);
    const row = { id, ref: { path }, data: () => value,
      updateTime: { toDate: () => new Date('2026-01-01T00:00:00Z') } };
    docs.push(row);
    return row;
  };
  for (let i = 0; i < 50; i++) {
    const id = `m${String(i).padStart(2, '0')}`;
    add(`tournaments/hidden/matches/${id}`,
      { playerUids: ['player'], jogo: { id, scoreP1: i, scoreP2: 0 } });
  }
  add('tournaments/public/matches/m50', { playerUids: ['player'],
    jogo: { id: 'm50', scoreP1: 6, scoreP2: 4, p1: 'A', p2: 'B', resultAt: '2026-02-01' } });
  add('sandboxes/sb/matches/m51', { playerUids: ['sandbox-other'], jogo: { id: 'm51', scoreP1: 7 } });
  add('tournaments/orphan/matches/m52', { playerUids: ['player'], jogo: { id: 'm52' } });
  add('tournaments/other/matches/m53', { playerUids: ['other'], jogo: { id: 'm53' } });
  roots.set('hidden', { organizerOnly: true, creatorUid: 'owner' });
  roots.set('public', { isPublic: true });
  const counts = { queries: 0, rootReads: 0 };
  function rootRef(id) {
    return {
      path: `tournaments/${id}`,
      get: async () => {
        counts.rootReads++;
        return { exists: roots.has(id), data: () => roots.get(id) };
      }
    };
  }
  function query(after, targetUid, limit) {
    return {
      where: (_, __, uid) => query(after, uid, limit),
      orderBy: () => query(after, targetUid, limit),
      startAfter: ref => query(ref.path, targetUid, limit),
      limit: n => query(after, targetUid, n),
      get: async () => {
        counts.queries++;
        return { docs: docs.filter(doc => doc.data().playerUids.includes(targetUid))
          .filter(doc => !after || doc.ref.path > after)
          .sort((a, b) => a.ref.path.localeCompare(b.ref.path)).slice(0, limit) };
      }
    };
  }
  const db = {
    collectionGroup: name => { assert.equal(name, 'matches'); return query(null, null, Infinity); },
    collection: name => {
      assert.equal(name, 'tournaments');
      return { doc: rootRef };
    },
    doc: path => ({ path }),
    runTransaction: async fn => fn({ get: async ref => {
      if (typeof ref.get === 'function') return ref.get();
      return ref.get();
    } })
  };
  return { db, roots, counts, add };
}

async function main() {
  const { db, roots, counts, add } = fixture();
  const cursorKey = Buffer.alloc(32, 7);
  const params = { db, fieldPath: { documentId: () => '__name__' }, cursorKey,
    callerUid: 'viewer', targetUid: 'player' };
  const first = await readResultHistoryPage(params);
  assert.equal(PAGE_SIZE, 50);
  assert.equal(first.items.length, 0, 'página inteiramente oculta não deve vazar');
  assert.ok(first.cursor, 'página vazia não pode ser interpretada como fim');
  assert.equal(counts.rootReads, 2);
  assert.equal(decodeCursor(first.cursor, 'player', cursorKey), 'tournaments/hidden/matches/m49');
  assert.throws(() => decodeCursor(first.cursor, 'other', cursorKey), /cursor inválido/);
  assert.equal(Buffer.from(first.cursor, 'base64url').includes(Buffer.from('hidden')), false,
    'cursor não pode revelar o caminho oculto');

  const second = await readResultHistoryPage({ ...params, cursor: first.cursor });
  assert.deepEqual(second.items.map(item => item.id), ['m50']);
  assert.equal(second.items[0].matchId, 'm50');
  assert.equal(second.items[0].scoreP1, 6);
  assert.equal(second.items[0].updatedAt, '2026-02-01');
  assert.equal(second.items[0].tournamentId, 'public');
  assert.equal(second.cursor, null);
  assert.equal(counts.queries, 2);

  roots.set('public', { organizerOnly: true, creatorUid: 'owner' });
  const afterChange = await readResultHistoryPage({ ...params, cursor: first.cursor });
  assert.equal(afterChange.items.length, 0, 'visibilidade deve ser reavaliada em cada página');
  roots.set('public', { isPublic: true });
  const originalTransaction = db.runTransaction;
  db.runTransaction = async fn => {
    const snapshot = await originalTransaction(fn);
    roots.set('public', { organizerOnly: true, creatorUid: 'owner' });
    return snapshot;
  };
  const changedBetweenReads = await readResultHistoryPage({ ...params, cursor: first.cursor });
  assert.equal(changedBetweenReads.items.length, 0,
    'raiz ocultada depois da transação deve ser barrada na revalidação final');
  db.runTransaction = originalTransaction;
  roots.set('public', { isPublic: true });
  const owner = await readResultHistoryPage({ ...params, callerUid: 'owner' });
  assert.equal(owner.items.length, 50, 'organizador pode ler os próprios resultados ocultos');
  add('tournaments/hidden/matches/a-hidden-bad', { playerUids: ['bad'], scoreP1: 1 });
  add('tournaments/public/matches/z-public-bad', { playerUids: ['bad'], scoreP1: 2 });
  await assert.rejects(readResultHistoryPage({ ...params, targetUid: 'bad' }),
    error => error.message === 'jogo canônico inválido' && !error.message.includes('hidden'));
  add('tournaments/public/matches/z-id-bad', { playerUids: ['wrong-id'],
    jogo: { id: 'different', scoreP1: 6 } });
  await assert.rejects(readResultHistoryPage({ ...params, targetUid: 'wrong-id' }),
    /jogo canônico inválido/);
  for (let i = 0; i < 50; i++) add(`tournaments/hidden/matches/derived${String(i).padStart(2, '0')}`,
    { playerUids: ['derived'], _chave: `derived${String(i).padStart(2, '0')}`,
      jogo: { scoreP1: i, scoreP2: 0 } });
  add('tournaments/public/matches/r0-1', { playerUids: ['derived'], _chave: 'r0-1',
    jogo: { scoreP1: 6, scoreP2: 4, winner: 'A' } });
  const derivedFirst = await readResultHistoryPage({ ...params, targetUid: 'derived' });
  assert.deepEqual(derivedFirst.items, []);
  assert(derivedFirst.cursor, 'página filtrada ainda fornece cursor');
  const derivedNext = await readResultHistoryPage({ ...params, targetUid: 'derived',
    cursor: derivedFirst.cursor });
  assert.deepEqual(derivedNext.items.map(item => [item.id, item.matchId, item.scoreP1, item.scoreP2]),
    [['r0-1', 'r0-1', 6, 4]], 'chave física identifica jogo sem id e preserva placar');
  add('tournaments/public/matches/42', { playerUids: ['numeric-id'], _chave: '42',
    jogo: { id: 42, scoreP1: 7, scoreP2: 5 } });
  const numeric = await readResultHistoryPage({ ...params, targetUid: 'numeric-id' });
  assert.deepEqual(numeric.items.map(item => [item.id, item.matchId, item.scoreP1]),
    [['42', '42', 7]], 'id numérico compatível com a chave física');
  add('tournaments/public/matches/other-key', { playerUids: ['wrong-key'],
    _chave: 'different', jogo: { scoreP1: 6 } });
  await assert.rejects(readResultHistoryPage({ ...params, targetUid: 'wrong-key' }),
    /jogo canônico inválido/, 'chave física divergente falha fechada');
  for (let i = 0; i < 50; i++) add(`sandboxes/sb/matches/s${String(i).padStart(2, '0')}`,
    { playerUids: ['sandbox-player'], jogo: { id: `s${String(i).padStart(2, '0')}` } });
  add('tournaments/public/matches/s50', { playerUids: ['sandbox-player'], jogo: { id: 's50' } });
  const sandboxPage = await readResultHistoryPage({ ...params, targetUid: 'sandbox-player' });
  assert.equal(sandboxPage.items.length, 0);
  assert.ok(sandboxPage.cursor);
  const afterSandbox = await readResultHistoryPage({ ...params, targetUid: 'sandbox-player', cursor: sandboxPage.cursor });
  assert.deepEqual(afterSandbox.items.map(item => item.id), ['s50']);
  for (let i = 0; i < 50; i++) add(`matches/top${String(i).padStart(2, '0')}`,
    { playerUids: ['top-level'], jogo: { id: `top${String(i).padStart(2, '0')}` } });
  add('tournaments/public/matches/top50', { playerUids: ['top-level'], jogo: { id: 'top50' } });
  const topFirst = await readResultHistoryPage({ ...params, targetUid: 'top-level' });
  assert.equal(topFirst.items.length, 0);
  assert.equal(decodeCursor(topFirst.cursor, 'top-level', cursorKey), 'matches/top49');
  const topSecond = await readResultHistoryPage({ ...params,
    targetUid: 'top-level', cursor: topFirst.cursor });
  assert.deepEqual(topSecond.items.map(item => item.id), ['top50']);
  const iv = Buffer.alloc(12, 3);
  const cipher = crypto.createCipheriv('aes-256-gcm', cursorKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ v: 1, uid: 'player',
    path: 'tournaments/hidden/results/m49' })), cipher.final()]);
  const oldCursor = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  await assert.rejects(readResultHistoryPage({ ...params, cursor: oldCursor }), /cursor inválido/);
  await assert.rejects(readResultHistoryPage({ ...params, callerUid: '' }), /autenticação/);
  await assert.rejects(readResultHistoryPage({ ...params, cursor: 'invalido' }), /cursor inválido/);
  await assert.rejects(readResultHistoryPage({ ...params, cursorKey: null }), /chave de cursor/);
  console.log('✅ 3.2.8: histórico paginado filtra raízes e preserva cursor de página vazia');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
