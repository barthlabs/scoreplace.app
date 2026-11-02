'use strict';
const assert = require('assert');
const core = require('../scripts/auditar-indice-fases-core.js');
const audit = require('../scripts/auditar-indice-fases.js');

const record = (loc, jogo, phase) => Object.assign({ _loc: loc, jogo }, phase === undefined ? {} : { _phaseIndex: phase });
assert.strictEqual(core.classify(record({ tipo: 'rounds' }, {}, 0)), 'ok');
assert.strictEqual(core.classify(record({ tipo: 'phaseRounds', fase: '2' }, {}, 2)), 'ok');
assert.strictEqual(core.classify(record({ tipo: 'matches' }, { phaseIndex: 1 }, 1)), 'ok');
assert.strictEqual(core.classify(record({ tipo: 'matches' }, { phaseIndex: 1 })), 'ausente');
assert.strictEqual(core.classify(record({ tipo: 'matches' }, { phaseIndex: 1 }, 0)), 'divergente');
assert.strictEqual(core.classify(record({ tipo: 'matches' }, {}, 0)), 'ambiguo');
assert.strictEqual(core.classify(record({ tipo: 'matches', mi: 2 }, { round: 3, draw: 'some-draw' }, 0)), 'ambiguo',
  'número de rodada e desenho não provam a fase de matches[]');
assert.strictEqual(core.classify(record({ tipo: 'rounds' }, { phaseIndex: 1 }, 0)), 'ambiguo');
assert.strictEqual(core.classify(null), 'ambiguo');
assert.strictEqual(core.report({ _nPartes: { matches: 0 }, phases: [{}] }, []).coverage, 'sem_jogos');
assert.strictEqual(core.report({ _nPartes: { matches: 1 } }, [record({ tipo: 'rounds' }, {}, 0)]).coverage, 'completa');
assert.strictEqual(core.report({ _nPartes: { matches: 2 } }, [record({ tipo: 'rounds' }, {}, 0)]).coverage, 'incompleta');
assert.strictEqual(core.report({ _nPartes: { matches: 2 } }, [record({ tipo: 'rounds' }, {}, 0), record({ tipo: 'matches' }, {})]).coverage, 'incompleta');
const candidate = core.report({ _nPartes: { matches: 2 } }, [record({ tipo: 'rounds' }, {}), record({ tipo: 'matches' }, { phaseIndex: 1 })]);
assert.strictEqual(candidate.backfillCandidate, true);
assert.deepStrictEqual(core.aggregate([candidate]).backfillCandidates, { tournaments: 1, missingIndexes: 2 });
assert.strictEqual(core.report({ _nPartes: { matches: 1 } }, [record({ tipo: 'matches' }, {})]).backfillCandidate, false);
assert.strictEqual(core.report({ _nPartes: { matches: 2 } }, [record({ tipo: 'rounds' }, {})]).backfillCandidate, false);
assert.strictEqual(core.report({ _nPartes: { matches: 1 } }, [record({ tipo: 'rounds' }, {}, 2)]).backfillCandidate, false);

assert.throws(() => audit.assertMatchMask(['_loc', '_phaseIndex']), /incompleta/);
assert.throws(() => audit.assertMatchMask(['_loc', 'jogo', '_phaseIndex']), /incompleta/);
audit.assertMatchMask(audit.MATCH_MASK);

function fsValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fsValue(v)])) } };
}
const doc = (name, data) => ({ name, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) });
const name = 'projects/test/databases/(default)/documents/tournaments/private-tournament-id';
const fetched = [];
const fakeFetch = async (url, options) => {
  const parsed = new URL(url);
  fetched.push({ url: parsed, options });
  if (parsed.pathname.endsWith('/tournaments')) {
    if (!parsed.searchParams.has('pageToken')) return { ok: true, json: async () => ({
      documents: [doc(name, { _nPartes: { matches: 2 } })], nextPageToken: 'next-secret-page'
    }) };
    return { ok: true, json: async () => ({ documents: [] }) };
  }
  assert.deepStrictEqual(parsed.searchParams.getAll('mask.fieldPaths'), audit.MATCH_MASK);
  return { ok: true, json: async () => ({ documents: [
    doc(name + '/matches/secret-1', record({ tipo: 'matches' }, { phaseIndex: 0 }, 0)),
    doc(name + '/matches/secret-2', record({ tipo: 'matches' }, { phaseIndex: 1 }, 1))
  ] }) };
};

(async () => {
  const result = await audit.audit(fakeFetch, 'secret-token');
  assert.strictEqual(result.coverage.completa, 1);
  assert.strictEqual(result.games, 2);
  assert.strictEqual(result.counts.ok, 2);
  assert(fetched.some(({ url }) => url.searchParams.get('pageToken') === 'next-secret-page'));
  assert(fetched.every(({ options }) => options.method === 'GET'));
  assert(!JSON.stringify(result).includes('private-tournament-id'));
  assert(!JSON.stringify(result).includes('secret-token'));
  await assert.rejects(() => audit.listCollection(async () => ({ ok: false, status: 403 }), 'https://example.test', 'secret-token', audit.MATCH_MASK, 'jogos'),
    /^Error: leitura Firestore falhou em jogos: HTTP 403$/);
  console.log('auditar-indice-fases: classificação, projeção, paginação e privacidade OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
