/* Avançar grupos→eliminatória não pode salvar a fotografia velha do organizador.
 * O mutator real roda na cópia local e no documento fresco: a chave precisa nascer
 * dos resultados frescos, preservar novidades que chegaram depois e manter os mesmos
 * ids entre as duas execuções. */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/bracket-ui.js', 'utf8');
const start = src.indexOf('window._advanceToElimination = function (tId) {');
const end = src.indexOf('\n};\n\n// Rei/Rainha', start) + 3;
if (start < 0 || end < start) throw new Error('não encontrei _advanceToElimination');

function grupo(winner, score1, score2) {
  return [{ participants: ['Ana', 'Bia'], rounds: [{ matches: [{
    id: 'grupo-1', p1: 'Ana', p2: 'Bia', winner,
    scoreP1: score1, scoreP2: score2
  }] }] }];
}
const local = { id: 'T1', groups: grupo('Ana', 6, 4), gruposClassified: 1 };
const fresh = {
  id: 'T1', groups: grupo('Bia', 4, 6), gruposClassified: 1,
  // Resultado e novidade recebidos depois de a aba do organizador carregar.
  latestResult: { matchId: '160', winner: 'Time B', scoreP1: 1, scoreP2: 2 },
  novidades: [{ matchId: '160', at: '2026-09-08T09:00:00.000Z' }]
};
let note = null, rerenders = 0, history = null;
const sandbox = {
  window: null, console, Promise, Date,
  _t: (key, vars) => key === 'bui.knockoutPhaseMsg' ? 'com ' + vars.n : key,
  showNotification: (...args) => { note = args; },
  _rerenderBracket: () => { rerenders++; },
  _matchWinnerSide: (m) => m.winner === m.p1 ? 1 : 2,
  _buildNextMatchLinks: (t) => { (t.matches || []).forEach((m, i) => { m.nextMatchId = 'next-' + i; }); },
  _findTournamentById: () => local,
  AppStore: {
    tournaments: [local],
    mutate: async (_id, fn, message) => { fn(local); fn(fresh); history = message; return true; }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox, { filename: 'bracket-ui.js:_advanceToElimination' });

function ok(value, msg) { if (value) console.log('✓ ' + msg); else { console.error('✗ ' + msg); process.exitCode = 1; } }
(async () => {
  await sandbox._advanceToElimination('T1');
  ok(fresh.currentStage === 'elimination', 'avança a fase no documento fresco');
  ok(fresh.matches[0].p1 === 'Bia',
    'a primeira vaga da chave usa o vencedor do resultado fresco, não a cópia velha');
  ok(fresh.latestResult && fresh.latestResult.matchId === '160' && fresh.latestResult.scoreP2 === 2,
    'preserva o placar recebido depois da cópia local');
  ok(fresh.novidades && fresh.novidades[0].matchId === '160',
    'preserva a novidade recebida depois da cópia local');
  ok(local.matches[0].id === fresh.matches[0].id && local.matches[0].nextMatchId === fresh.matches[0].nextMatchId,
    'id e vínculos da chave são iguais na atualização local e na transação');
  ok(history === 'Fase Eliminatória iniciada', 'histórico passa pela mutação transacional');
  ok(note && note[0] === 'bui.knockoutPhase' && rerenders === 1,
    'notifica e redesenha somente depois da confirmação');

  note = null; rerenders = 0;
  local.currentStage = undefined; local.groups = grupo('Ana', 6, 4); delete local.matches;
  fresh.currentStage = 'elimination'; fresh.matches = [{ id: 'chave-do-servidor', p1: 'Bia', p2: 'Ana' }];
  sandbox.AppStore.mutate = async (_id, fn) => { fn(local); return fn(fresh) === false ? false : true; };
  await sandbox._advanceToElimination('T1');
  ok(fresh.matches[0].id === 'chave-do-servidor', 'eliminatória já criada no documento fresco não é regravada');
  ok(note && note[0] === 'Não foi possível avançar a fase' && rerenders === 0,
    'recusa transacional informa o organizador sem redesenhar uma chave não salva');
})().catch((err) => { console.error(err); process.exitCode = 1; });
