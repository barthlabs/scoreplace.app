'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw-prep.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j); }
const apply = between(client, 'window._applyPollResult = function', 'window._handleP2Option = function');
const helper = between(client, 'window._applyDrawPollResult = function', 'window._reopenDrawEnrollment = function');
const fn = between(server, 'exports.applyDrawPollResult = onCall', '// ─── Decisões entre fases');
ok(/_callCF\('applyDrawPollResult'/.test(helper) && /_applyCFTournament/.test(helper), 'cliente pede apuração e aplica recibo canônico');
ok(/_applyDrawPollResult\(tId, pollId\)/.test(apply), 'interface só pede apuração ao servidor');
ok(/data\.changed === false/.test(apply), 'recibo idempotente não redespacha a ação vencedora');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(apply), 'interface não grava resultado localmente');
ok(/db\.runTransaction/.test(fn) && /_isTournamentAdmin/.test(fn), 'Function transaciona e exige organização');
ok(/poll\.status !== 'closed'/.test(fn), 'Function exige enquete encerrada');
ok(/counts/.test(fn) && /poll\.votes/.test(fn) && /winnerKey/.test(fn), 'Function apura vencedor a partir dos votos frescos');
ok(/poll\.resolved = true/.test(fn) && /poll\.resolvedOption = winnerKey/.test(fn), 'Function fixa decisão uma única vez');
ok(/_pollSuspended/.test(fn) && /tournament:b\.clean/.test(fn), 'Function restaura inscrições e devolve recibo');
ok(!/request\.data.*(?:winner|votes|participants)/.test(fn), 'payload não escolhe vencedor nem envia retrato');
process.exit(failed ? 1 : 0);
