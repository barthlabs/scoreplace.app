'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw-prep.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j); }
const incomplete = between(client, 'window._handleIncompleteOption = function', 'window.showLotteryIncompletePanel');
const dissolve = between(client, 'window._saveDissolveResolution = function', '// ─── VERIFICAÇÃO 2');
const reopenCF = between(server, 'exports.reopenDrawEnrollment = onCall', 'exports.dissolveIncompleteTeams = onCall');
const dissolveCF = between(server, 'exports.dissolveIncompleteTeams = onCall', '// ─── Decisões entre fases');
const odd = between(client, 'window._handleOddOption = function', '// ─── VERIFICAÇÃO 3: POTÊNCIA DE 2');
ok(/_reopenDrawEnrollment\(tId, 'incomplete'\)/.test(incomplete) && /_reopenDrawEnrollment\(tId, 'odd'\)/.test(odd), 'reaberturas por equipe incompleta e ímpar só chamam a Function');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(incomplete) && !/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(odd), 'reaberturas não persistem no navegador');
ok(/_callCF\('dissolveIncompleteTeams'/.test(dissolve) && !/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(dissolve), 'dissolução só despacha e espelha o recibo');
ok(/\['incomplete', 'odd'\]/.test(reopenCF) && /db\.runTransaction/.test(reopenCF) && /_isTournamentAdmin/.test(reopenCF), 'Function valida e reabre o documento fresco');
ok(/drawWindow\._dissolveIncompleteTeams/.test(dissolveCF) && /db\.runTransaction/.test(dissolveCF) && /_isTournamentAdmin/.test(dissolveCF), 'Function calcula e dissolve o elenco fresco');
ok(!/(?:participants|snapshot|waitlist)/.test(dissolve.slice(dissolve.indexOf("_callCF('dissolveIncompleteTeams'"), dissolve.indexOf("_callCF('dissolveIncompleteTeams'") + 220)), 'cliente não envia elenco para dissolução');
process.exit(failed ? 1 : 0);
