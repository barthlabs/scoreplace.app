'use strict';

// A propriedade de corrida continua obrigatória, mas desde a L7 ela pertence à
// Function. Esta prova complementa l7-extra-round-cf-only: impede o retorno do
// antigo retry/escritor do navegador e exige que a Function mantenha a dedupe
// sobre o estado fresco.
const fs = require('fs');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }

const ui = fs.readFileSync('js/views/tournaments-draw.js', 'utf8');
const start = ui.indexOf('window._generateExtraRound = function');
const end = ui.indexOf('// Monta a cfg', start);
const client = ui.slice(start, end);
const fn = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const serverStart = fn.indexOf('exports.generateExtraTournamentRound');
const serverEnd = fn.indexOf('// ─── Integração de TARDIOS', serverStart);
const server = fn.slice(serverStart, serverEnd);

ok(start >= 0 && end > start, 'a porta de rodada extra existe');
ok(/_callFn\('generateExtraTournamentRound'/.test(client), 'o cliente abre somente a intenção canônica');
ok(!/AppStore\.(?:mutate|commitTournamentTx)|saveTournament/.test(client),
  'o cliente não sorteia nem escreve cópia local');
ok(/db\.runTransaction/.test(server) && /_leTorneio/.test(server) && /_gravaTorneio/.test(server),
  'a Function relê e grava o documento fresco na transação');
ok(/max>=expectedRound/.test(server) && /_generateNextRound/.test(server),
  'a Function deduplica a rodada esperada antes de usar o motor');
ok(/_isTournamentAdmin/.test(server), 'a Function exige autorização administrativa');

console.log('rodada-extra-nao-duplica-nem-sobrescreve: ' + (6 - failed) + ' passou, ' + failed + ' falhou');
process.exit(failed ? 1 : 0);
