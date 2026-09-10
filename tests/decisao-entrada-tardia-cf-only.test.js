'use strict';

// L7: a regra de tardios altera a chave futura e a suspensão temporária de
// inscrições. A aba só pode despachar a intenção; a Function decide sobre o
// documento fresco, valida administrador e devolve o documento canônico.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw-prep.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j); }

const panel = between(client, 'window._showLateConfrontosPanel = function', '// v2.0.75: CONTAGEM');
const fn = between(server, 'exports.setLateDrawDecision = onCall', '// ─── Decisões entre fases');
const resolution = between(client, '// Suspend enrollment while decision panel is open', '// Remainder gets its own dedicated panel');
const suspension = between(server, 'exports.setDrawPreparationSuspension = onCall', '// ─── Decisões entre fases');
ok(/_callCF\('setLateDrawDecision'/.test(panel), 'cliente despacha a decisão de tardios para a Function');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(panel), 'painel de tardios não grava no navegador');
ok(!/(?:participants|waitlist|snapshot)/.test(panel.slice(panel.indexOf("_callCF('setLateDrawDecision'"), panel.indexOf("_callCF('setLateDrawDecision'") + 240)), 'cliente não envia retrato do elenco');
ok(/db\.runTransaction/.test(fn) && /_isTournamentAdmin/.test(fn), 'Function transaciona documento fresco e exige organização');
ok(/\['repescagem', 'bye', 'standby'\]/.test(fn) && /_lateResolutionAck/.test(fn), 'Function aceita somente escolhas explícitas e registra a regra');
ok(/_suspendedByPanel/.test(fn) && /_previousStatus/.test(fn) && /tournament:b\.clean/.test(fn), 'Function restaura suspensão canônica e devolve o recibo');
ok(/_setDrawPreparationSuspension\(tId, 'suspend'\)/.test(resolution) && /_setDrawPreparationSuspension\(tId, 'resume'\)/.test(resolution), 'painel pede ao servidor para suspender e restaurar inscrições');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(resolution), 'resolução unificada não grava suspensão no navegador');
ok(/\['suspend', 'resume'\]/.test(suspension) && /db\.runTransaction/.test(suspension) && /_isTournamentAdmin/.test(suspension), 'Function valida e transaciona as duas transições de preparação');
process.exit(failed ? 1 : 0);
