'use strict';
const assert = require('assert');
const { _placaresDe, runAbandonSweep } = require('./abandon-run');

const base = { status: 'active', format: 'Eliminatórias Simples',
  createdAt: '2026-06-01T00:00:00Z', endDate: '2026-06-01',
  _nJogos: 2, _nPartes: { matches: 2 } };
const match = (id, jogo) => ({ id, data: () => ({ _chave: id, _loc: { tipo: 'matches', mi: 0 },
  jogo: Object.assign({ id }, jogo) }) });
const dated = [match('a', { scoreP1: 0, scoreP2: 0, resultAt: 1782654280 }),
  match('b', { scoreP1: 2, scoreP2: 1, resultAt: '2026-06-28T14:00:00Z' })];

function fake(t, games, fail) {
  const calls = [], writes = [];
  const rootDoc = { id: 'fixture', data: () => t, ref: { update: async (v) => writes.push(v) } };
  const db = { collection(name) {
    calls.push(name);
    if (name !== 'tournaments') throw new Error('unexpected collection: ' + name);
    return { get: async () => ({ docs: [rootDoc], size: 1 }), doc() {
      return { collection(part) {
        calls.push(part);
        if (part !== 'matches') throw new Error('unexpected subcollection: ' + part);
        return { get: async () => {
          if (fail) throw new Error('query unavailable');
          return { size: games.length, forEach: (fn) => games.forEach(fn) };
        } };
      } };
    } };
  } };
  return { db, calls, writes };
}

(async () => {
  let f = fake(base, dated);
  assert.deepStrictEqual(await _placaresDe(f.db, 'fixture', base), {
    comPlacar: 2, primeiro: 1782654280000, ultimo: Date.parse('2026-06-28T14:00:00Z') });
  assert(!f.calls.includes('results'));

  for (const [label, t, games] of [
    ['um marcador presente e correto', { ...base, _nPartes: undefined }, dated],
    ['outro marcador presente e correto', { ...base, _nJogos: undefined }, dated]
  ]) assert((await _placaresDe(fake(t, games).db, 'fixture', t)).comPlacar === 2, label);

  const noGames = { ...base, _nJogos: undefined, _nPartes: undefined };
  assert.strictEqual((await _placaresDe(fake(noGames, []).db, 'fixture', noGames)).comPlacar, 0);
  for (const [label, t, games] of [
    ['marcadores divergentes', { ...base, _nJogos: 1 }, dated],
    ['sem marcadores com jogos', noGames, dated],
    ['jogo embutido', { ...base, matches: [{ id: 'a' }] }, dated],
    ['jogo físico inválido', base, [match('a', {}), { id: 'b', data: () => ({ _chave: 'wrong', jogo: { id: 'b' } }) }]],
    ['placar sem horário', base, [dated[0], match('b', { scoreP1: 1, scoreP2: 0 })]]
  ]) assert.strictEqual(await _placaresDe(fake(t, games).db, 'fixture', t), null, label);

  for (const [label, t, games, fail] of [
    ['terceiro placar sem horário', { ...base, _nJogos: 3, _nPartes: { matches: 3 } },
      [...dated, match('c', { scoreP1: 1, scoreP2: 0 })]],
    ['falha de consulta', base, dated, true],
    ['marcadores divergentes', { ...base, _nJogos: 1 }, dated],
    ['raiz inline', { ...base, rounds: [{ matches: [{ id: 'a' }] }] }, dated]
  ]) {
    f = fake(t, games, fail);
    const r = await runAbandonSweep(f.db, Date.parse('2026-11-01T12:00:00Z'));
    assert.strictEqual(r.indeterminados, 1, label);
    assert.strictEqual(r.avisados, 0, label);
    assert.strictEqual(r.encerrados, 0, label);
    assert.strictEqual(r.foraDaVitrine, 0, label);
    assert.strictEqual(f.writes.length, 0, label);
    assert(!f.calls.includes('results'), label);
  }

  f = fake({ ...base, format: 'Liga' }, dated);
  const liga = await runAbandonSweep(f.db, Date.parse('2026-11-01T12:00:00Z'));
  assert.strictEqual(liga.indeterminados, 0);
  assert(!f.calls.includes('matches'));

  f = fake(base, dated);
  const closed = await runAbandonSweep(f.db, Date.parse('2026-11-01T12:00:00Z'));
  assert.strictEqual(closed.encerrados, 1, 'placares físicos datados alimentam a decisão');
  assert.strictEqual(f.writes[0].status, 'finished');
  assert(!f.calls.includes('results'));

  f = fake(noGames, []);
  const empty = await runAbandonSweep(f.db, Date.parse('2026-11-01T12:00:00Z'));
  assert.strictEqual(empty.foraDaVitrine, 1, 'torneio sem jogos continua no caminho de leitura');
  assert.strictEqual(f.writes.length, 0);
  console.log('test-abandon-run: ok');
})().catch((e) => { console.error(e); process.exitCode = 1; });
