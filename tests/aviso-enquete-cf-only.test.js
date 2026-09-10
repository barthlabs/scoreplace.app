'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw-prep.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j); }
const check = between(client, 'window._checkPollNotifications = function', '// ── Show active poll banner');
const helper = between(client, 'window._markDrawPollNotificationsRead = function', 'window._reopenDrawEnrollment = function');
const fn = between(server, 'exports.markDrawPollNotificationsRead = onCall', '// ─── Decisões entre fases');
ok(/_callCF\('markDrawPollNotificationsRead'/.test(helper) && /_applyCFTournament/.test(helper), 'cliente pede registro de leitura e aplica recibo');
ok(/_markDrawPollNotificationsRead\(t\.id, activePoll\.id\)/.test(check), 'aviso despacha leitura à Function');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(check), 'aviso não grava no navegador');
ok(/db\.runTransaction/.test(fn) && /_leTorneio/.test(fn), 'Function transaciona documento fresco');
ok(/notification\.targetUid === uid/.test(fn), 'Function marca apenas aviso do UID autenticado');
ok(/request\.auth\.token\.email/.test(fn) && /!notification\.targetUid/.test(fn), 'e-mail do token só cobre aviso legado sem UID');
ok(/String\(notification\.pollId/.test(fn) && /pollId/.test(fn), 'Function limita a leitura à enquete solicitada');
ok(/notification\.read = true/.test(fn) && /tournament:b\.clean/.test(fn), 'Function persiste leitura e devolve recibo canônico');
process.exit(failed ? 1 : 0);
