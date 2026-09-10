'use strict';
// L7: o fechamento de enquete controla suspensão de inscrições. A aba apenas
// dispara a intenção; a Function decide sobre o documento fresco e devolve recibo.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw-prep.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j); }
const helper = between(client, 'window._closeDrawPoll = function', 'window._reopenDrawEnrollment = function');
const timer = between(client, '// Start countdown timer', '// ── Cast a vote ──');
const early = between(client, 'window._closePollEarly = function', '// ── Restore enrollments helper');
const fn = between(server, 'exports.closeDrawPoll = onCall', '// ─── Decisões entre fases');
ok(/_callCF\('closeDrawPoll'/.test(helper) && /_applyCFTournament/.test(helper), 'helper despacha a Function e aplica o recibo canônico');
ok(/_closeDrawPoll\(tId, poll\.id, false\)/.test(timer), 'expiração só pede encerramento ao servidor');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(timer), 'expiração não grava no navegador');
ok(/_closeDrawPoll\(tId, pollId, true\)/.test(early), 'organização pede encerramento antecipado à Function');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(early), 'encerramento antecipado não grava no navegador');
ok(/db\.runTransaction/.test(fn) && /_leTorneio/.test(fn), 'Function relê e transaciona o torneio fresco');
ok(/_isTournamentAdmin/.test(fn) && /_isTournamentParticipant/.test(fn), 'Function separa autoridade da organização e participante após prazo');
ok(/agora < Number\(poll\.deadline\)/.test(fn) && /early/.test(fn), 'Function bloqueia fechamento por participante antes do prazo');
ok(/poll\.status = 'closed'/.test(fn) && /t\.activePollId = null/.test(fn) && /_pollSuspended/.test(fn), 'Function fecha, libera a suspensão e atualiza enquete ativa');
ok(!/(?:matches|score|rounds)\s*=/.test(fn), 'Function de enquete não altera jogos ou placares');
ok(/tournament:b\.clean/.test(fn), 'Function devolve o documento canônico');
process.exit(failed ? 1 : 0);
