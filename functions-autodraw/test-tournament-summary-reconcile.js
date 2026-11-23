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
function ref(path) {
  return { path, collection: name => ({ path: path + '/' + name,
    limit: count => ({ path: path + '/' + name, limit: count }) }) };
}
const db = { collection: name => ({ doc: id => ref(name + '/' + id) }) };
const tx = {
  async get(target) {
    if (target.limit == null) return { exists: docs.has(target.path), data: () => docs.get(target.path) };
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
db.runTransaction = async (callback, options) => {
  transactionOptions.push(options || {});
  return callback(tx);
};

(async () => {
  const unchanged = await reconcile({ db, tournamentId: root.id, split: Split,
    summaryCore: Summary, helpers, eventTime: '2026-11-21T12:00:00.000001Z' });
  assert.equal(unchanged.action, 'unchanged');
  assert.equal(writes.length, 0, 'reconciliação idempotente não regrava');
  assert.deepEqual(transactionOptions[0], { readOnly: true }, 'projeção lê snapshot sem locks de escrita');
  assert.deepEqual(transactionOptions[1], { maxAttempts: 5 }, 'commit transacional curto');

  docs.set('tournaments/' + root.id + '/matches/m1', {
    _chave: 'm1', _loc: { tipo: 'matches', mi: 0 }, jogo: { id: 'm1', p1: 'A', p2: 'B', score1: 6, score2: 3 }
  });
  const written = await reconcile({ db, tournamentId: root.id, split: Split,
    summaryCore: Summary, helpers, eventTime: '2026-11-21T12:00:00.000001Z' });
  assert.equal(written.action, 'written');
  assert.equal(writes.length, 1);
  assert.equal(writes[0][2].matchesDone, 1);
  assert.equal(writes[0][2].sourceVersionMicros, Date.parse('2026-11-21T12:00:00Z') * 1000 + 1);

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
  const fullRead = await markRequiresFullRead({ tx, db, tournamentId: root.id });
  assert.equal(fullRead.action, 'requires-full-read');
  const afterFlag = docs.get('tournaments_summary/' + root.id);
  assert.equal(afterFlag.requiresFullRead, true);
  assert.equal(afterFlag.matchesTotal, beforeFlag.matchesTotal,
    'fallback preserva números e não grava projeção vazia da raiz');
  assert.equal(afterFlag.sourceVersionMicros, beforeFlag.sourceVersionMicros,
    'fallback não avança versão à frente de eventos em trânsito');
  assert.equal(writes.at(-1)[0], 'update', 'fallback marca o resumo sem substituir a projeção');
  console.log('✓ tournament-summary-reconcile: frescor, filtro e transação consistentes');
})().catch(error => { console.error(error); process.exitCode = 1; });
