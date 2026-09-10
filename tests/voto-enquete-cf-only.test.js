'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw-prep.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j); }
const vote = between(client, 'window._castPollVote = function', '// ── Check for active polls');
const helper = between(client, 'window._castDrawPollVote = function', 'window._reopenDrawEnrollment = function');
const fn = between(server, 'exports.castDrawPollVote = onCall', '// ─── Decisões entre fases');
ok(/_callCF\('castDrawPollVote'/.test(helper) && /_applyCFTournament/.test(helper), 'cliente despacha voto e aplica recibo canônico');
ok(/_castDrawPollVote\(tId, pollId, optionKey\)/.test(vote), 'interface pede voto ao servidor');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(vote), 'interface não grava voto localmente');
ok(/db\.runTransaction/.test(fn) && /_leTorneio/.test(fn), 'Function relê e transaciona o torneio fresco');
ok(/_isTournamentAdmin/.test(fn) && /_isTournamentParticipant/.test(fn), 'Function exige participante ou organização');
ok(/Date\.now\(\) >= Number\(poll\.deadline\)/.test(fn), 'Function recusa voto após o prazo');
ok(/poll\.options/.test(fn) && /optionKey/.test(fn), 'Function aceita somente opção existente');
ok(/poll\.votes\[uid\] = optionKey/.test(fn), 'Function grava voto sob UID autenticado');
ok(!/email/.test(fn), 'Function não usa e-mail como identidade de voto');
ok(/tournament:b\.clean/.test(fn), 'Function devolve documento canônico');
process.exit(failed ? 1 : 0);
