'use strict';
const fs = require('fs');
const client = fs.readFileSync('js/views/tournaments-draw-prep.js', 'utf8');
const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
let fail = 0;
function ok(value, message) { if (value) console.log('✓ ' + message); else { fail++; console.error('✗ ' + message); } }
function body(text, start, end) { const a = text.indexOf(start); const b = text.indexOf(end, a + start.length); return a < 0 ? '' : text.slice(a, b < 0 ? text.length : b); }
const ui = body(client, 'window._runVagasDraw = function', '// v4.0.73:');
const fn = body(server, 'exports.runEnrollmentSlotsDraw = onCall', '\n// ─── Encerramento manual');
ok(/_runEnrollmentSlotsDraw\(tId\)/.test(ui), 'a tela pede o sorteio canônico ao servidor');
ok(!/Math\.random|AppStore\.(?:mutate|commitTournamentTx)|saveTournament\(|AppStore\.sync\(/.test(ui), 'a tela não sorteia nem grava elenco');
ok(/db\.runTransaction/.test(fn) && /_isTournamentAdmin/.test(fn), 'Function transaciona o sorteio com autorização');
ok(/if \(t\.drawSelectionDone\)/.test(fn), 'Function aborta seleção já aplicada');
ok(/_hasTournamentDraw\(t\)/.test(fn), 'Function aborta se a chave já existe');
ok(/drawWindow\._entryHasVip/.test(fn) && /drawWindow\._entryTeamMembers/.test(fn), 'Function usa regras canônicas de VIP e time');
ok(/_leTorneio\(tx, ref, tId\)/.test(fn) && /_gravaTorneio\(tx, ref, t, before/.test(fn), 'Function calcula e grava somente sobre o elenco fresco');
process.exit(fail ? 1 : 0);
