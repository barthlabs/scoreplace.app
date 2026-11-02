'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = require('./recorte.js');
const source = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
const method = R.ateOFim(source, source.indexOf('  async commitResultTx(tournamentId, matchId, payload, logMessage) {'));
const apply = R.ateOFim(source, source.indexOf('  _applyPhysicalResultOnMatch: function'));

function harness({ physical, reply, initial, status = 'active', route = '#tournaments/t' }) {
  let reads = 0, cardRefreshes = 0, fullRefreshes = 0, podium = 0, notices = 0;
  const button = { textContent: 'Confirmar', disabled: false, isConnected: true };
  const tournament = { id: 't', status, matches: [{ id: 'm', p1: 'A', p2: 'B', ...initial }],
    _results: { m: { scoreP1: 1, winner: 'A' } } };
  const window = {
    location: { hash: route },
    _callApplyMatchResult: async () => ({ data: reply || { ok: true, tournament: { id: 't', status } } }),
    FirestoreDB: { async loadPhysicalMatchResult() { reads++; if (physical instanceof Error) throw physical; return physical; } },
    _findMatch(t, id) {
      const all = t.matches.slice();
      (t.groups || []).forEach(g => (g.rounds || []).forEach(r => all.push(...(r.matches || []))));
      if (t.thirdPlaceMatch) all.push(t.thirdPlaceMatch);
      return all.find(m => m.id === id);
    },
    _refreshConfirmedMatchCard(t) {
      assert.equal(t, tournament);
      cardRefreshes++;
      return true;
    },
    _softRefreshView() {
      fullRefreshes++;
      if (tournament.status === 'finished' && tournament.matches[0].winner === 'A') podium++;
    },
    _rerenderBracket() {
      fullRefreshes++;
      if (tournament.status === 'finished' && tournament.matches[0].winner === 'A') podium++;
    },
    _warn() {}, _captureException() {},
    _suppressSoftRefresh: false
  };
  const context = {
    window, document: { getElementById: id => id === 'confirm-m' ? button : id === 'card-m' ? { id } : null },
    Promise, Date, String, Object, console,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {}, showNotification() { notices++; }
  };
  vm.createContext(context);
  vm.runInContext('this.API = {' + method + ',' + apply + '};', context);
  const store = context.API;
  store.tournaments = [tournament];
  store._matchResultFields = ['scoreP1', 'scoreP2', 'winner', 'sets', 'pendingResult', 'wo'];
  store._saveToCache = () => {};
  return { store, tournament, button, window,
    counts: () => ({ reads, cardRefreshes, fullRefreshes, podium, notices }) };
}

(async () => {
  {
    const h = harness({ physical: { id: 'm', scoreP1: 6, scoreP2: 4 },
      initial: { scoreP1: 1, winner: 'A', pendingResult: { scoreP1: 1 }, wo: true } });
    assert.equal(await h.store.commitResultTx('t', 'm', {}, 'placar'), true);
    const match = h.tournament.matches[0];
    assert.equal(match.scoreP1, 6);
    assert.equal(match.winner, undefined, 'campo ausente no físico é removido');
    assert.equal(match.pendingResult, undefined);
    assert.equal(match.wo, undefined);
    assert.equal(h.tournament._results.m, undefined, 'espelho antigo não é reaplicado');
    assert.equal(h.store._resultReadEpochs.t, 1, 'save invalida hidratação iniciada antes da confirmação');
    assert.equal(h.counts().cardRefreshes, 1, 'card recebe o jogo vivo atualizado');
  }
  {
    const inline = { id: 'm', scoreP1: 8, scoreP2: 4, winner: 'A' };
    const h = harness({ physical: null, initial: { scoreP1: 1 },
      reply: { ok: true, tournament: { id: 't', status: 'active', groups: [{ rounds: [{ matches: [inline] }] }] } } });
    assert.equal(await h.store.commitResultTx('t', 'm', {}, 'placar'), true);
    assert.equal(h.tournament.matches[0].scoreP1, 8, 'jogo inline vem da resposta transacional');
    assert.equal(h.tournament._results.m, undefined);
    assert.equal(h.counts().cardRefreshes, 1);
  }
  {
    const inline = { id: 'm', scoreP1: 8, winner: 'A' };
    const h = harness({ physical: null, initial: { scoreP1: 1 },
      reply: { ok: true, tournament: { id: 't', status: 'active',
        groups: [{ rounds: [{ matches: [inline, { ...inline, scoreP1: 9 }] }] }] } } });
    assert.equal(await h.store.commitResultTx('t', 'm', {}, 'placar'), true);
    assert.equal(h.tournament.matches[0].scoreP1, 1, 'ID inline duplicado não escolhe um placar');
    assert.equal(h.tournament._results.m, undefined);
    assert.match(h.button.textContent, /exibição não confirmada/);
    assert.equal(h.counts().cardRefreshes, 0);
  }
  {
    const h = harness({ physical: null, initial: { scoreP1: 1 } });
    assert.equal(await h.store.commitResultTx('t', 'm', {}, 'placar'), true);
    assert.equal(h.tournament.matches[0].scoreP1, 1);
    assert.equal(h.tournament._results.m, undefined);
    assert.equal(h.button.disabled, true, 'segundo clique não sobrescreve gravação confirmada');
    assert.match(h.button.textContent, /exibição não confirmada/);
    assert.equal(h.counts().notices, 1, 'falha de exibição após escrita confirmada é avisada');
    assert.equal(h.counts().cardRefreshes, 0);
    assert.ok(h.counts().fullRefreshes >= 1, 'ouvinte e refresh ficam livres para recuperar');
  }
  {
    const h = harness({ physical: new Error('Jogo canônico inválido'), initial: { scoreP1: 1 } });
    assert.equal(await h.store.commitResultTx('t', 'm', {}, 'placar'), true);
    assert.equal(h.counts().reads, 1, 'erro de validação não é repetido');
    assert.equal(h.tournament._results.m, undefined);
    assert.match(h.button.textContent, /exibição não confirmada/);
  }
  {
    const h = harness({ physical: { id: 'm', scoreP1: 6, winner: 'A' },
      initial: { scoreP1: 1 }, status: 'active',
      reply: { ok: true, tournament: { id: 't', status: 'finished' } } });
    assert.equal(await h.store.commitResultTx('t', 'm', {}, 'final'), true);
    assert.equal(h.counts().cardRefreshes, 0, 'final não atualiza apenas um card');
    assert.equal(h.counts().podium, 1, 'final repinta a tela com pódio');
  }
  console.log('✓ E05 confirmação física: reset, inline, duplicata, ausência, erro e pódio');
})().catch(error => { console.error(error); process.exitCode = 1; });
