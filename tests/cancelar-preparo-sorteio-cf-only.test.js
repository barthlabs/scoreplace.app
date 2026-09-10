'use strict';

// L7.P1.36 — cancelar a preparação é uma intenção administrativa: a aba não pode
// reabrir inscrição ou limpar flags com a fotografia que ela guardou antes do painel.
const fs = require('fs');
const path = require('path');
const index = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
const prep = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw-prep.js'), 'utf8');
const drawCore = require(path.join(__dirname, '..', 'functions-autodraw', 'draw-core.js'));
let failed = 0;
function ok(value, label) { if (value) console.log('✓ ' + label); else { failed++; console.error('✗ ' + label); } }

const start = prep.indexOf('window._cancelDrawResolution = function');
const end = prep.indexOf('// Cancelar o painel de resto', start);
const client = prep.slice(start, end);
const cfStart = index.indexOf('exports.cancelDrawPreparation = onCall');
const cfEnd = index.indexOf('async function _notifyPublishedPendingDraw', cfStart);
const cf = index.slice(cfStart, cfEnd);

ok(start >= 0 && client.includes("_callCF('cancelDrawPreparation'") , 'cliente só despacha o cancelamento para a Function');
ok(!/AppStore\.(?:mutate|commitTournamentTx)|saveTournament|syncImmediate/.test(client), 'cliente não regrava o torneio ao cancelar');
const lateStart = prep.indexOf('window._lateConfrontosCancel = function');
const lateEnd = prep.indexOf('overlay.innerHTML =', lateStart);
const p2Start = prep.indexOf('window._cancelPowerOf2Panel = function');
const p2End = prep.indexOf('// (Check-in functions moved', p2Start);
const legacyCancels = prep.slice(lateStart, lateEnd) + prep.slice(p2Start, p2End);
ok(/window\._cancelDrawResolution\(tId\)/.test(legacyCancels), 'os cancelamentos auxiliares reutilizam o recibo canônico');
ok(!/AppStore\.(?:mutate|commitTournamentTx|sync)\s*\(/.test(legacyCancels), 'cancelamentos auxiliares não persistem no navegador');
ok(!/cancelDrawPreparation'[\s\S]{0,180}(?:snapshot|participants|waitlist)/.test(client) && !/request\.data[^;]{0,180}(?:snapshot|participants|waitlist)/.test(cf),
  'prévia de elenco não vira payload arbitrário: a Function conserva o roster fresco');
ok(cfStart >= 0 && cf.includes('request.auth && request.auth.uid') && cf.includes('_isTournamentAdmin(t, uid)'), 'Function exige autenticação e organização por UID');
ok(cf.includes('db.runTransaction') && cf.includes('_leTorneio(tx, ref, tId)') && cf.includes('_gravaTorneio(tx, ref, t, antes'), 'Function relê e grava somente na transação canônica');
ok(cf.includes('hasDrawnBracket && hasDrawnBracket(t)') && cf.includes('t.pendingDraw'), 'Function recusa apagar chave ou sorteio em revisão');
ok(cf.includes('drawWindow._clearDrawRuntimeFlags(t)') && cf.includes("delete t._phaseResInfo"), 'Function limpa os marcadores transitórios no estado fresco');

const t = { classifyFormat:'swiss', _suspendedByPanel:true, _previousStatus:'closed', _drawDecisions:{ p2:'bye' }, currentStage:'draw' };
drawCore._window._clearDrawRuntimeFlags(t);
ok(t.classifyFormat === null && t._suspendedByPanel === null && t._drawDecisions === null && t.currentStage === null,
  'motor canônico limpa os mesmos marcadores de preparação');

console.log('cancelar-preparo-sorteio-cf-only: ' + (10 - failed) + ' passou, ' + failed + ' falhou');
process.exit(failed ? 1 : 0);
