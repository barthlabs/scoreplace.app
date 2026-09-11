'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); let bad = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) bad++; }
function block(source, start, end) { const a = source.indexOf(start), b = source.indexOf(end, a + start.length); return a < 0 ? '' : source.slice(a, b < 0 ? source.length : b); }
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw.js'), 'utf8');
const ui = block(client, 'window._setPhaseLateEnrollment = function', '\nwindow.generateDrawFunction');
ok(/_callFn\('setPhaseLateEnrollment'/.test(ui), 'cliente despacha somente a intenção de modo');
ok(!/AppStore\.mutate|commitTournamentTx|saveTournament/.test(ui), 'cliente não grava fase nem torneio');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const cf = block(server, 'exports.setPhaseLateEnrollment = onCall', '\nexports.setTournamentBranding');
ok(/request\.auth/.test(cf) && /_isTournamentAdmin/.test(cf), 'Function exige autenticação e organização');
ok(/db\.runTransaction/.test(cf) && /_leTorneio/.test(cf) && /_gravaTorneio/.test(cf), 'Function relê e grava o documento fresco');
ok(/phase\.lateEnrollment/.test(cf) && /phase\.newMatchups/.test(cf) && /t\.lateEnrollment/.test(cf), 'Function mantém a fase e o espelho do torneio coerentes');
process.exitCode = bad ? 1 : 0;
