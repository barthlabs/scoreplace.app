/* L7.P1.6 — iniciar torneio é uma intenção estreita, não um sync do snapshot.
 * O contrato protege o resultado que chega de outra sessão enquanto o organizador
 * inicia o torneio a partir de uma cópia antiga. */
'use strict';
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/participants.js'), 'utf8');
const startAt = source.indexOf('window._startTournament = function');
const start = source.slice(startAt, source.indexOf('window._setCheckInFilter', startAt));
const fnSource = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw/index.js'), 'utf8');
const fnAt = fnSource.indexOf('exports.startTournament');
const fn = fnSource.slice(fnAt, fnSource.indexOf('exports.resetTournamentCheckIn', fnAt));
let pass = 0, fail = 0;
function ok(value, label) { if (value) { pass++; console.log('✓ ' + label); } else { fail++; console.error('✗ ' + label); } }

ok(/_callCF\('startTournament'/.test(start), 'início só despacha a Cloud Function');
ok(!/AppStore\.mutate/.test(start), 'tela não executa mutação local do torneio');
ok(/db\.runTransaction/.test(fn) && /_isTournamentAdmin/.test(fn), 'Function relê e autoriza o documento fresco');
ok(/if \(!t\.tournamentStarted\) t\.tournamentStarted = agora\.getTime\(\);/.test(fn), 'carimbo de início é idempotente no fresco');
ok(/if \(!t\.startDate\) t\.startDate = startLocal;/.test(fn), 'data só preenche quando ainda falta no fresco');
ok(/t\.status = 'in_progress';/.test(fn), 'status é a única transição aplicada');
ok(!/t\.tournamentStarted\s*=/.test(start) && !/t\.status\s*=/.test(start), 'snapshot local não é mutado antes da transação');
ok(!/AppStore\.sync\(\);/.test(start), 'nenhum caminho usa sync amplo');
const safeStop = start.slice(start.indexOf("if (typeof window._callCF"), start.indexOf("window._callCF('startTournament'"));
ok(/Cloud Function indisponível/.test(safeStop) && /return;/.test(safeStop),
  'sem Function, a ação falha visivelmente em vez de gravar snapshot antigo');

console.log('iniciar-torneio-nao-sobrescreve-placar: ' + pass + ' passou, ' + fail + ' falhou');
process.exit(fail ? 1 : 0);
