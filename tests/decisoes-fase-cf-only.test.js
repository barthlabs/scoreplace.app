'use strict';

// L7.P1.37 — as decisões que antecedem a próxima fase são intenções: o
// navegador envia somente a escolha e a Function relê elenco/fase no servidor.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js', 'views', 'tournaments-draw-prep.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw', 'index.js'), 'utf8');
let failed = 0;
function ok(value, label) { if (value) console.log('✓ ' + label); else { failed++; console.error('✗ ' + label); } }
function between(text, start, end) { const a = text.indexOf(start); const b = text.indexOf(end, a); return a < 0 ? '' : text.slice(a, b < 0 ? text.length : b); }

const inactiveClient = between(client, 'window._resolvePhaseInactives = function', '// Painel: manter inativos');
const promotionClient = between(client, 'window._setPhasePromotion = function', '// v1.3.60: painel');
const inactiveCF = between(server, 'exports.resolvePhaseInactives = onCall', 'exports.setPhasePromotion = onCall');
const promotionCF = between(server, 'exports.setPhasePromotion = onCall', 'async function _notifyPublishedPendingDraw');

ok(/_callCF\('resolvePhaseInactives'/.test(inactiveClient) && !/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(inactiveClient),
  'inativos/W.O. só despacham escolha para a Function');
ok(/_callCF\('setPhasePromotion'/.test(promotionClient) && !/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(promotionClient),
  'promoção entre fases só despacha escolha para a Function');
ok(/request\.auth && request\.auth\.uid/.test(inactiveCF) && /_isTournamentAdmin\(t, uid\)/.test(inactiveCF) && /db\.runTransaction/.test(inactiveCF),
  'Function de inativos autentica, autoriza e relê o documento em transação');
ok(/drawWindow\._phaseNonEntrants\(t\)/.test(inactiveCF) && /drawWindow\._purgePersonFromMaps/.test(inactiveCF),
  'remoção usa no servidor as mesmas entradas e mapas canônicos');
ok(/request\.auth && request\.auth\.uid/.test(promotionCF) && /_isTournamentAdmin\(t, uid\)/.test(promotionCF) && /t\.phases\[idx\]\._promoteLines/.test(promotionCF),
  'Function de promoção autentica, autoriza e grava a próxima fase fresca');
ok(!/request\.data[^;]{0,180}(?:participants|phases|snapshot)/.test(inactiveCF + promotionCF),
  'nenhuma fotografia de elenco ou fases é aceita do navegador');
console.log('decisoes-fase-cf-only: ' + (6 - failed) + ' passou, ' + failed + ' falhou');
process.exit(failed ? 1 : 0);
