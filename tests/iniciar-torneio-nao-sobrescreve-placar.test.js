/* L7.P1.6 — iniciar torneio é uma mutação estreita, não um sync do snapshot.
 * O contrato protege o resultado que chega de outra sessão enquanto o organizador
 * inicia o torneio a partir de uma cópia antiga. */
'use strict';
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/participants.js'), 'utf8');
const startAt = source.indexOf('window._startTournament = function');
const start = source.slice(startAt, source.indexOf('window._setCheckInFilter', startAt));
let pass = 0, fail = 0;
function ok(value, label) { if (value) { pass++; console.log('✓ ' + label); } else { fail++; console.error('✗ ' + label); } }

ok(/AppStore\.mutate\(tId, applyStart\)/.test(start), 'início usa AppStore.mutate no documento fresco');
ok(/if \(!freshT\.tournamentStarted\) freshT\.tournamentStarted = startedAt;/.test(start), 'carimbo de início é idempotente no fresco');
ok(/if \(!freshT\.startDate\) freshT\.startDate = startDate;/.test(start), 'data só preenche quando ainda falta no fresco');
ok(/freshT\.status = 'in_progress';/.test(start), 'status é a única transição aplicada');
ok(!/t\.tournamentStarted\s*=/.test(start) && !/t\.status\s*=/.test(start), 'snapshot local não é mutado antes da transação');
ok(!/AppStore\.sync\(\);/.test(start), 'nenhum caminho usa sync amplo');
const safeStop = start.slice(start.indexOf("if (!window.AppStore"), start.indexOf('window.AppStore.mutate(tId, applyStart)'));
ok(/AppStore\.mutate indisponível/.test(safeStop) && /return;/.test(safeStop),
  'sem mutação fresca, a ação falha visivelmente em vez de gravar snapshot antigo');

console.log('iniciar-torneio-nao-sobrescreve-placar: ' + pass + ' passou, ' + fail + ' falhou');
process.exit(fail ? 1 : 0);
