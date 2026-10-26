'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('./recorte.js');

const source = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
const start = source.indexOf('  async commitResultTx(tournamentId, matchId, payload, logMessage) {');
assert(start >= 0);
const method = R.ateOFim(source, start);
const match = { id: 'M1', p1: 'A', p2: 'B' };
const tournament = { id: 'T1', status: 'active', matches: [match] };
const button = { textContent: 'Confirmar', disabled: false, isConnected: true };
let resolveServer;
let calls = 0;
let redraws = 0;
let refreshes = 0;
let resultReads = 0;
const context = {
  document: { getElementById(id) { return id === 'confirm-M1' ? button : id === 'card-M1' ? { id } : null; } },
  window: {
    location: { hash: '#tournaments/T1' },
    _callApplyMatchResult() { calls++; return new Promise(resolve => { resolveServer = resolve; }); },
    FirestoreDB: {
      async loadTournamentById() { return { id: 'T1', status: 'active' }; },
      async loadMatchResult() { resultReads++; return { winner: 'A', scoreP1: 6, scoreP2: 4 }; }
    },
    _findMatch(t, id) { return t.matches.find(m => m.id === id); },
    _refreshConfirmedMatchCard(t, tid, mid) {
      assert.equal(tid, 'T1'); assert.equal(mid, 'M1');
      assert.equal(t.matches[0].winner, 'A');
      refreshes++;
      button.isConnected = false; // o novo card já contém Editar
      return true;
    },
    _rerenderBracket() { redraws++; },
    _softRefreshView() { redraws++; },
    _saveToCache() {}, _warn() {}, _captureException() {},
    _suppressSoftRefresh: false
  },
  Promise, Date, String, Object, console, setTimeout() { return 1; }, clearTimeout() {},
  showNotification() {}
};
vm.createContext(context);
vm.runInContext('this.API = {' + method + '};', context);
const store = context.API;
store.tournaments = [tournament];
store._saveToCache = () => {};

(async () => {
  const click = store.commitResultTx('T1', 'M1', { s1: 6, s2: 4 }, 'Resultado');
  assert.equal(button.disabled, true, 'o primeiro clique trava o botão enquanto espera a região');
  assert.equal(button.textContent, '⏳ Gravando…');
  assert.equal(calls, 1, 'uma intenção foi enviada');
  // A resposta curta é possível quando a porta devolve um recibo já aplicado.
  // O clique original precisa reler torneio e resultado, sem reenviar.
  resolveServer({ data: { ok: true } });
  assert.equal(await click, true);
  assert.equal(calls, 1, 'o alinhamento e a releitura não pedem segundo clique');
  assert.equal(resultReads, 1);
  assert.equal(match.winner, 'A');
  assert.equal(refreshes, 1, 'o card é trocado no próprio lugar pelo estado confirmado');
  assert.equal(redraws, 0, 'a grade inteira não é remontada');
  // A CF pode confirmar antes de o card voltar ao DOM. O Confirmar antigo
  // nunca pode ficar clicável nessa janela, mesmo com {ok:true}.
  button.isConnected = true;
  button.disabled = false;
  button.textContent = 'Confirmar';
  context.window._refreshConfirmedMatchCard = () => false;
  const lateCard = store.commitResultTx('T1', 'M1', { s1: 6, s2: 4 }, 'Resultado');
  resolveServer({ data: { ok: true } });
  assert.equal(await lateCard, true);
  assert.equal(button.disabled, true, 'resultado confirmado sem card redesenhado não reativa Confirmar');
  assert.equal(button.textContent, '⏳ Gravando…');
  let softRefreshes = 0;
  context.window.FirestoreDB.loadTournamentById = async () => null;
  context.window._softRefreshView = () => { softRefreshes++; };
  context.window._suppressSoftRefresh = true;
  button.disabled = false;
  button.textContent = 'Confirmar';
  const unreadable = store.commitResultTx('T1', 'M1', { s1: 6, s2: 4 }, 'Resultado');
  resolveServer({ data: { ok: true } });
  assert.equal(await unreadable, true);
  assert.equal(context.window._suppressSoftRefresh, false, 'o eco volta a funcionar quando a releitura falha');
  assert.equal(softRefreshes, 1, 'a tela tenta carregar o estado confirmado novamente');
  assert.equal(button.disabled, true, 'sem releitura não permite reenviar o placar');
  assert.equal(button.textContent, '✅ Gravado · sincronizando…');
  console.log('✓ primeiro clique confirma, relê resultado e troca o card sem desmontar a grade');
})().catch(error => { console.error(error); process.exitCode = 1; });
