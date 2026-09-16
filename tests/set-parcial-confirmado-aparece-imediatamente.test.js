#!/usr/bin/env node
/* O SET CONFIRMADO APARECE SEM RECARREGAR
 *
 * Regressão real, Confra/Jogo 123 (16/set/2026): a callable persistiu 4-6 e 2-6 e
 * confirmou os dois lançamentos, mas o card ainda desenhava o segundo set como 0-0
 * até atualizar a página. A resposta da CF carrega só o torneio limpo, sem `matches`.
 * Este teste reproduz exatamente essa fronteira: a tela começa no Set 1, a Function
 * confirma o Set 2 e o estado usado pelo render passa a conter os dois sets na mesma
 * promessa, depois de ler o documento canônico `results/{matchId}` do servidor — sem
 * recarga ou novo lançamento.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = require('./recorte.js');
const ROOT = path.join(__dirname, '..');
let fails = 0;
function ok(value, message) {
  if (value) console.log('  ✓ ' + message);
  else { fails++; console.error('  ✗ ' + message); }
}

const source = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const start = source.indexOf('  async commitResultTx(tournamentId, matchId, payload, logMessage) {');
ok(start >= 0, 'commitResultTx existe');
const method = R.ateOFim(source, start);
ok(method.indexOf('loadMatchResult') >= 0, 'a confirmação usa a leitura canônica do resultado');

const tournament = {
  id: 'T1', name: 'Confra',
  matches: [{ id: 'M1', p1: 'A', p2: 'B', sets: [{ gamesP1: 4, gamesP2: 6 }], setsWonP1: 0, setsWonP2: 1 }],
  _results: { M1: { sets: [{ gamesP1: 4, gamesP2: 6 }], setsWonP1: 0, setsWonP2: 1 } }
};
let renders = 0;
const sandbox = {
  window: {
    _callApplyMatchResult: async () => ({ data: { ok: true, tournament: { id: 'T1', updatedAt: 'server' } } }),
    FirestoreDB: {
      loadMatchResult: async () => ({
        sets: [{ gamesP1: 4, gamesP2: 6 }, { gamesP1: 2, gamesP2: 6 }],
        setsWonP1: 0, setsWonP2: 2, startedAt: 123
      })
    },
    location: { hash: '#tournaments/T1' },
    _softRefreshView() { renders++; },
    _suppressSoftRefresh: true,
    _tdetailSig: 'old',
    _warn() {}, _captureException() {}
  },
  Object, String, Date, Promise, console,
  showNotification() {}
};
vm.createContext(sandbox);
vm.runInContext('var API = {' + method + '}; this.API = API;', sandbox);
const api = sandbox.API;
api.tournaments = [tournament];
api._saveToCache = function () {};

(async () => {
  const saved = await api.commitResultTx('T1', 'M1', {
    setsInProgress: true,
    sets: [{ gamesP1: 4, gamesP2: 6 }, { gamesP1: 2, gamesP2: 6 }],
    setsWonP1: 0, setsWonP2: 2, at: 123
  }, 'Set 2 confirmado');
  ok(saved === true, 'a callable confirmou a gravação');
  const m = tournament.matches[0];
  ok(m.sets.length === 2 && m.sets[1].gamesP1 === 2 && m.sets[1].gamesP2 === 6,
    'o card em memória recebe o Set 2 antes de qualquer reload');
  ok(tournament._results.M1.sets.length === 2,
    'o espelho local acompanha o card e não o reduz no próximo render');
  ok(renders === 1, 'a confirmação repinta a tela imediatamente');
  process.exit(fails ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
