/* Publicar uma chave em revisão é uma transição estreita. Se chegou um placar enquanto
 * o organizador a revisava, a publicação não pode salvar a cópia antiga e apagá-lo. */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/bracket-logic.js', 'utf8');
const start = src.indexOf('window._publishPendingDraw = async function');
const end = src.indexOf('window._annulPendingDraw = function', start);
if (start < 0 || end < 0) throw new Error('não encontrei _publishPendingDraw');

let notification = null;
let command = null;
const sandbox = {
  window: null, console,
  _callCF: async (name, payload) => { command = { name, payload }; return { data: { changed: true } }; },
  showNotification: (...args) => { notification = args; }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox, { filename: 'bracket-logic.js:_publishPendingDraw' });

(async () => {
  await sandbox._publishPendingDraw('T1');
  let fail = 0;
  function ok(value, msg) { if (value) console.log('✓ ' + msg); else { fail++; console.error('✗ ' + msg); } }
  ok(command && command.name === 'resolvePendingDraw' && command.payload.action === 'publish',
    'envia a publicação à CF canônica');
  const cf = fs.readFileSync('functions-autodraw/index.js', 'utf8');
  const body = cf.slice(cf.indexOf('exports.resolvePendingDraw'), cf.indexOf('exports.resolvePendingDraw') + 5000);
  ok(/runTransaction/.test(body) && /_gravaTorneio/.test(body), 'a CF publica o documento fresco transacionalmente');
  ok(/pendingDraw/.test(body) && /result/.test(cf), 'a CF preserva o domínio de resultados fora da cópia cliente');
  ok(notification && notification[0] === '🚀 Sorteio publicado!', 'notifica somente depois da gravação confirmada');
  ok(!/AppStore\.mutate|FirestoreDB\.saveTournament|syncImmediate\(/.test(src.slice(start, end)),
    'sem mutação cliente, não há fallback que publique o snapshot inteiro');
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });
