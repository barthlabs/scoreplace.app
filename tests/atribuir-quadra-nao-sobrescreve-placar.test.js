/* Atribuir quadra é uma mutação estreita. Uma aba que ainda não viu um resultado não
 * pode salvar sua fotografia inteira e apagar o placar ao escolher a quadra. */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/bracket.js', 'utf8');
const start = src.indexOf('window._assignMatchCourt = function');
const end = src.indexOf('// ─── Formação de duplas', start);
if (start < 0 || end < 0) throw new Error('não encontrei _assignMatchCourt');

const fresh = { id: 'T1', matches: [{ id: 'M1', winner: 'Time B', scoreP1: 1, scoreP2: 2 }] };
const local = { id: 'T1', matches: [{ id: 'M1' }] }; // cópia anterior ao resultado
let history = [];
const sandbox = {
  window: null, console, showNotification() {},
  AppStore: {
    tournaments: [local],
    mutate: async (id, fn, message) => { fn(local); fn(fresh); history.push(message); return true; }
  },
  _collectAllMatches: (t) => t.matches || []
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox, { filename: 'bracket.js:_assignMatchCourt' });

sandbox._assignMatchCourt('T1', 'M1', 'Quadra 4');
let fail = 0;
function ok(value, msg) { if (value) console.log('✓ ' + msg); else { fail++; console.error('✗ ' + msg); } }
ok(fresh.matches[0].court === 'Quadra 4', 'a quadra é aplicada ao documento fresco');
ok(fresh.matches[0].winner === 'Time B' && fresh.matches[0].scoreP1 === 1 && fresh.matches[0].scoreP2 === 2,
  'o placar que chegou depois da cópia local é preservado');
ok(history[0] === 'Quadra definida: Quadra 4', 'a alteração deixa histórico transacional');
sandbox._assignMatchCourt('T1', 'M1', '');
ok(!Object.prototype.hasOwnProperty.call(fresh.matches[0], 'court'), 'remover a quadra também é uma mutação estreita');
ok(!/syncImmediate\(|FirestoreDB\.saveTournament\(/.test(src.slice(start, end)),
  'sem mutação fresca, não há fallback que grave o snapshot inteiro');
if (fail) process.exit(1);
