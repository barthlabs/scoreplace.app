'use strict';
// O cliente não pode desmontar um time a partir de sua fotografia. A Function
// roda o mesmo motor puro sobre o torneio recém-lido e persiste somente participantes.
const fs = require('fs');
const client = fs.readFileSync('js/views/tournaments-draw-prep.js', 'utf8');
const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const a = client.indexOf('window._saveDissolveResolution = function');
const b = client.indexOf('// ─── VERIFICAÇÃO 2:', a);
const handler = client.slice(a, b);
const c = server.indexOf('exports.dissolveIncompleteTeams = onCall');
const d = server.indexOf('// ─── Decisões entre fases', c);
const fn = server.slice(c, d);
let fail=0; function ok(v,m){if(v)console.log('✓ '+m);else{fail++;console.error('✗ '+m)}}
ok(/_callCF\('dissolveIncompleteTeams'/.test(handler), 'dissolver só despacha a intenção');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(handler), 'dissolver não grava um snapshot local');
ok(/drawWindow\._dissolveIncompleteTeams\(t\)/.test(fn) && /db\.runTransaction/.test(fn), 'Function calcula a dissolução sobre o documento fresco');
ok(/t\.participants = outcome\.participants/.test(fn), 'Function altera exclusivamente a lista de participantes');
ok(!/(?:t\.|request\.data).*matches\s*=/.test(fn) && !/(?:t\.|request\.data).*(?:scoreP1|scoreP2|sets)\s*=/.test(fn), 'dissolver preserva jogos e placares concorrentes');
ok(/_antesDoMotor/.test(fn) && /_gravaTorneio/.test(fn) && /tournament:b\.clean/.test(fn), 'a gravação é canônica e devolve o documento fresco');
if(fail)process.exit(1);
