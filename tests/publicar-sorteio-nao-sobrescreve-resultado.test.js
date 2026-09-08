/* Publicar uma chave em revisão é uma transição estreita. Se chegou um placar enquanto
 * o organizador a revisava, a publicação não pode salvar a cópia antiga e apagá-lo. */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/bracket-logic.js', 'utf8');
const start = src.indexOf('window._publishPendingDraw = async function');
const end = src.indexOf('window._annulPendingDraw = function', start);
if (start < 0 || end < 0) throw new Error('não encontrei _publishPendingDraw');

const local = { id: 'T1', pendingDraw: { rounds: [{ round: 1, matches: [{ id: 'old' }] }], generatedAt: '2026-09-08T00:00:00.000Z' } };
const fresh = {
  id: 'T1',
  pendingDraw: { rounds: [{ round: 1, matches: [{ id: 'new' }] }], generatedAt: '2026-09-08T00:01:00.000Z', roundIndex: 0 },
  // Chegou do celular depois da cópia local do organizador.
  latestResult: { matchId: '160', scoreP1: 1, scoreP2: 2, winner: 'Time B' }
};
let notification = null;
let action = null;
const sandbox = {
  window: null, console,
  AppStore: {
    tournaments: [local],
    isOrganizer: () => true,
    mutate: async (id, fn, message) => { fn(local); fn(fresh); action = message; return true; }
  },
  showNotification: (...args) => { notification = args; }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox, { filename: 'bracket-logic.js:_publishPendingDraw' });

(async () => {
  await sandbox._publishPendingDraw('T1');
  let fail = 0;
  function ok(value, msg) { if (value) console.log('✓ ' + msg); else { fail++; console.error('✗ ' + msg); } }
  ok(!fresh.pendingDraw && fresh.rounds[0].matches[0].id === 'new', 'publica o sorteio presente no documento fresco');
  ok(fresh.latestResult && fresh.latestResult.matchId === '160' && fresh.latestResult.scoreP2 === 2,
    'preserva o placar que chegou depois da cópia local');
  ok(action === 'Sorteio em revisão publicado', 'registra a publicação no histórico transacional');
  ok(notification && notification[0] === '🚀 Sorteio publicado!', 'notifica somente depois da gravação confirmada');
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });
