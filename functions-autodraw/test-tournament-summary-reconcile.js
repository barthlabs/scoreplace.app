'use strict';
const assert = require('assert/strict');
const { eventMicros, matchAffectsSummary, reconcile, markRequiresFullRead } = require('./tournament-summary-reconcile');
const Split = require('./vendor/tournament-split-core');
const Summary = require('./tournament-summary-core');
const helpers = Summary.helpersDe(require('./draw-core')._window);

assert.equal(eventMicros('2026-11-21T12:00:00Z'), Date.parse('2026-11-21T12:00:00Z') * 1000);
assert.equal(eventMicros('2026-11-21T12:00:00.123Z'), Date.parse('2026-11-21T12:00:00Z') * 1000 + 123000);
assert.equal(eventMicros('2026-11-21T12:00:00.123456Z'), Date.parse('2026-11-21T12:00:00Z') * 1000 + 123456);
assert.equal(eventMicros('2026-11-21T12:00:00.123456789Z'), Date.parse('2026-11-21T12:00:00Z') * 1000 + 123456);
assert.equal(matchAffectsSummary({ p1: 'A', p2: 'B', score1: 0, score2: 0 },
  { p1: 'A', p2: 'B', score1: 1, score2: 0 }), false, 'placar parcial não muda contagem de progresso');
assert.equal(matchAffectsSummary({ p1: 'A', p2: 'B' },
  { p1: 'A', p2: 'B', score1: 6, score2: 3 }), true, 'placar final passa a contar como concluído');
assert.equal(matchAffectsSummary(null, { p1: 'A', p2: 'B' }), true, 'jogo novo altera total');

const root = {
  id: 'tour_summary_fixture', name: 'Resumo transacional', sport: 'Tênis', format: 'Liga', status: 'open',
  isPublic: true, creatorUid: 'owner', memberUids: ['owner'], participants: [], standbyParticipants: [],
  matches: [], rounds: [], groups: [], phases: [], _semPesados: ['matches', 'participants', 'opponentHistory'],
  _nPartes: { matches: 0, participants: 0, opponentHistory: 0 }, _nJogos: 0, _nGrupos: 0,
  canonicalRegistrationMigration: { fingerprint: 'native:fixture', registrationCount: 0 }
};
const docs = new Map([
  ['tournaments/' + root.id, root],
  ['tournaments_summary/' + root.id, Object.assign(Summary.buildSummary(root, root.id,
    Summary.helpersComInscricoes(root, helpers, [])), { sourceVersionMicros: 100 })]
]);
const writes = [];
const collectionReads = [];
function ref(path) {
  return { path, collection: name => ({ path: path + '/' + name,
    limit: count => ({ path: path + '/' + name, limit: count }) }) };
}
const db = { collection: name => ({ doc: id => ref(name + '/' + id) }) };
const tx = {
  async get(target) {
    if (target.limit == null) return { exists: docs.has(target.path), data: () => docs.get(target.path) };
    collectionReads.push(target.path);
    const matches = [...docs.entries()].filter(([path]) => path.startsWith(target.path + '/'))
      .slice(0, target.limit).map(([path, data]) => ({ id: path.split('/').pop(), data: () => data }));
    return { size: matches.length, docs: matches };
  },
  set(target, data) { writes.push(['set', target.path, data]); docs.set(target.path, data); },
  update(target, fields) {
    writes.push(['update', target.path, fields]);
    docs.set(target.path, Object.assign({}, docs.get(target.path), fields));
  },
  delete(target) { writes.push(['delete', target.path]); docs.delete(target.path); }
};
const transactionOptions = [];
let injectConcurrentMatch = false;
db.runTransaction = async (callback, options) => {
  transactionOptions.push(options || {});
  if (options && options.maxAttempts === 5 && injectConcurrentMatch) {
    injectConcurrentMatch = false;
    docs.set('tournaments/' + root.id + '/matches/m_concurrent', {
      _chave: 'm_concurrent', _loc: { tipo: 'matches', mi: 1 },
      jogo: { id: 'm_concurrent', p1: 'C', p2: 'D', score1: 6, score2: 3 }
    });
  }
  return callback(tx);
};

(async () => {
  const unchanged = await reconcile({ db, tournamentId: root.id, split: Split,
    summaryCore: Summary, helpers, eventTime: '2026-11-21T12:00:00.000001Z' });
  assert.equal(unchanged.action, 'unchanged');
  assert.equal(writes.length, 0, 'reconciliação idempotente não regrava');
  assert.deepEqual(transactionOptions[0], { readOnly: true }, 'projeção lê snapshot sem locks de escrita');
  assert.deepEqual(transactionOptions[1], { maxAttempts: 5 }, 'commit transacional curto');
  assert(collectionReads.includes('tournaments/' + root.id + '/inscritos'),
    'callback lê a coleção física mapeada para participantes sem remapeá-la');

  docs.set('tournaments/' + root.id + '/matches/m1', {
    _chave: 'm1', _loc: { tipo: 'matches', mi: 0 }, jogo: { id: 'm1', p1: 'A', p2: 'B', score1: 6, score2: 3 }
  });
  const written = await reconcile({ db, tournamentId: root.id, split: Split,
    summaryCore: Summary, helpers, eventTime: '2026-11-21T12:00:00.000001Z' });
  assert.equal(written.action, 'written');
  assert.equal(writes.length, 1);
  assert.equal(writes[0][2].matchesDone, 1);
  assert.equal(writes[0][2].sourceVersionMicros, Date.parse('2026-11-21T12:00:00Z') * 1000 + 1);

  injectConcurrentMatch = true;
  const reconciledConcurrentWrite = await reconcile({ db, tournamentId: root.id, split: Split,
    summaryCore: Summary, helpers, eventTime: '2026-11-21T12:00:00.000002Z' });
  assert.equal(reconciledConcurrentWrite.action, 'written',
    'mudança em subcoleção durante projeção faz reler antes de gravar');
  assert.equal(docs.get('tournaments_summary/' + root.id).matchesDone, 2,
    'resumo final inclui a partida criada durante a primeira leitura');

  const locked = await reconcile({ db, tournamentId: root.id, split: Split,
    summaryCore: Summary, helpers, rehearsal: { locked: () => true } });
  assert.equal(locked.action, 'rehearsal-locked');
  docs.set('tournaments_summary/' + root.id, Object.assign({}, writes[0][2], { sourceVersionMicros: 9000000000000000 }));
  const stale = await reconcile({ db, tournamentId: root.id, split: Split, summaryCore: Summary,
    helpers, eventTime: '2026-11-21T11:59:59Z' });
  assert.equal(stale.action, 'stale-event', 'evento atrasado não sobrescreve resumo mais novo');

  root.testModeEnabled = true;
  docs.set('tournaments/' + root.id, root);
  const excluded = await reconcile({ db, tournamentId: root.id, split: Split, summaryCore: Summary, helpers });
  assert.equal(excluded.action, 'test-excluded');
  assert.equal(docs.has('tournaments_summary/' + root.id), false, 'torneio em teste não deixa resumo público');

  root.testModeEnabled = false;
  docs.set('tournaments/' + root.id, root);
  const recreated = await reconcile({ db, tournamentId: root.id, split: Split, summaryCore: Summary,
    helpers, eventTime: '2026-11-21T12:00:01Z' });
  assert.equal(recreated.action, 'written', 'torneio que sai de teste recria resumo');
  assert.equal(docs.has('tournaments_summary/' + root.id), true);

  const beforeFlag = docs.get('tournaments_summary/' + root.id);
  const fullRead = await markRequiresFullRead({ tx, db, tournamentId: root.id,
    summaryCore: Summary, helpers });
  assert.equal(fullRead.action, 'requires-full-read');
  const afterFlag = docs.get('tournaments_summary/' + root.id);
  assert.equal(afterFlag.requiresFullRead, true);
  assert.equal(afterFlag.matchesTotal, beforeFlag.matchesTotal,
    'fallback preserva números e não grava projeção vazia da raiz');
  assert.equal(afterFlag.sourceVersionMicros, beforeFlag.sourceVersionMicros,
    'fallback não avança versão à frente de eventos em trânsito');
  assert.equal(writes.at(-1)[0], 'update', 'fallback marca o resumo sem substituir a projeção');

  const metricsBeforeIndexRefresh = {
    matchesTotal: afterFlag.matchesTotal,
    matchesDone: afterFlag.matchesDone,
    competitors: afterFlag.competitors,
    sourceVersionMicros: afterFlag.sourceVersionMicros
  };
  root.memberUids = ['owner', 'new-member'];
  root.adminUids = ['admin'];
  root.refereeUids = ['referee'];
  docs.set('tournaments/' + root.id, root);
  const writesBeforeIndexRefresh = writes.length;
  const refreshedIndex = await markRequiresFullRead({ tx, db, tournamentId: root.id,
    summaryCore: Summary, helpers });
  assert.equal(refreshedIndex.action, 'index-refreshed',
    'marcador já existente ainda atualiza índice de membros');
  const refreshedSummary = docs.get('tournaments_summary/' + root.id);
  assert.deepEqual(refreshedSummary.memberUids, ['owner', 'new-member']);
  assert.deepEqual(refreshedSummary.adminUids, ['admin']);
  assert.deepEqual(refreshedSummary.refereeUids, ['referee']);
  assert.deepEqual({
    matchesTotal: refreshedSummary.matchesTotal,
    matchesDone: refreshedSummary.matchesDone,
    competitors: refreshedSummary.competitors,
    sourceVersionMicros: refreshedSummary.sourceVersionMicros
  }, metricsBeforeIndexRefresh, 'atualizar índice preserva métricas e versão de origem');
  assert.equal(writes.length, writesBeforeIndexRefresh + 1);
  const noOpRefresh = await markRequiresFullRead({ tx, db, tournamentId: root.id,
    summaryCore: Summary, helpers });
  assert.equal(noOpRefresh.action, 'already-marked');
  assert.equal(writes.length, writesBeforeIndexRefresh + 1,
    'índice atualizado não é regravado sem mudança');

  root.canonicalRegistrationMigration = { fingerprint: 'native:fixture', registrationCount: 1 };
  docs.set('tournaments/' + root.id, root);
  await assert.rejects(() => reconcile({ db, tournamentId: root.id, split: Split,
    summaryCore: Summary, helpers, eventTime: '2026-11-21T12:00:03Z' }),
  (error) => error.code === 'SUMMARY_REGISTRATION_COUNT_MISMATCH',
  'resumo não publica projeção se a coleção de inscrições diverge do total canônico');

  docs.delete('tournaments_summary/' + root.id);
  const missing = await markRequiresFullRead({ tx, db, tournamentId: root.id });
  assert.equal(missing.action, 'created-full-read-fallback');
  const fallback = docs.get('tournaments_summary/' + root.id);
  assert.equal(fallback.requiresFullRead, true, 'resumo ausente recebe marcador de leitura canônica');
  assert.equal(fallback.id, root.id, 'fallback ausente mantém metadados para localizar o torneio');
  assert.equal(fallback.sourceVersionMicros, 0, 'fallback não finge ter versão de evento');
  const fallbackIndex = Summary.summaryIndexFields(root, root.id);
  assert.equal(fallback.nameLower, fallbackIndex.nameLower, 'marcador mantém índice de busca por nome');
  assert.deepEqual(fallback.tokens, fallbackIndex.tokens, 'marcador mantém tokens para busca');
  assert.equal(Object.hasOwn(fallback, 'matchesTotal'), false,
    'marcador de leitura completa não publica contagem parcial de jogos');
  assert.equal(Object.hasOwn(fallback, 'matchesDone'), false,
    'marcador de leitura completa não publica progresso parcial');
  assert.equal(Object.hasOwn(fallback, 'competitors'), false,
    'marcador de leitura completa não publica contagem parcial de atletas');
  assert.deepEqual(fallback.memberUids, root.memberUids,
    'marcador mantém os campos de índice necessários para localizar o torneio');
  console.log('✓ tournament-summary-reconcile: frescor, filtro e transação consistentes');
})().catch(error => { console.error(error); process.exitCode = 1; });
