'use strict';
const fs = require('fs');
let failed = 0;
function ok(condition, message) { if (condition) console.log('✓ ' + message); else { console.error('✗ ' + message); failed++; } }
const ui = fs.readFileSync('js/views/tournaments.js', 'utf8');
const a = ui.indexOf('window._addPlaceholdersCore');
const b = ui.indexOf('// v2.7.32:', a);
const block = ui.slice(a, b);
ok(/_callFn\('addTournamentPlaceholders'/.test(block) && !/commitTournamentTx/.test(block), 'placeholders só despacham a CF');
ok(/canonicalRegistrationMigration/.test(block) && /Escolha a categoria/.test(block), 'cliente não envia placeholder sem categoria para torneio canônico');
const fn = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const x = fn.indexOf('exports.addTournamentPlaceholders');
const y = fn.indexOf('// ─── Reset para inscrições', x);
const server = fn.slice(x, y);
ok(/_isTournamentAdmin/.test(server) && /runTransaction/.test(server) && /_gravaTorneio/.test(server), 'CF valida organizador e grava o elenco transacionalmente');
ok(/canonicalRegistrationMigration/.test(server) && /\+ Participante/.test(server), 'CF recusa chamada direta de placeholder em torneio canônico');
process.exitCode = failed ? 1 : 0;
