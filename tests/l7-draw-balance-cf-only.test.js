'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); let bad = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) bad++; }
function block(source, start, end) { const a = source.indexOf(start), b = source.indexOf(end, a + start.length); return a < 0 ? '' : source.slice(a, b < 0 ? source.length : b); }
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw.js'), 'utf8');
const choice = block(client, 'window._applyDrawBalanceChoice = function', '\n// ─── PORTA 1:');
ok(/_callFn\('setDrawBalanceChoice'/.test(choice), 'cliente envia somente a intenção de equilíbrio');
ok(!/AppStore\.mutate|commitTournamentTx|saveTournament|httpsCallable\('setParticipantsGender'/.test(choice), 'cliente não grava torneio nem perfil de gênero');
const confirm = block(client, 'onConfirm: function (mode, assigned, ratioOpts)', '\n      }\n    });');
ok(/\.then\(function \(\) \{ if \(typeof onProceed/.test(confirm), 'o sorteio só começa após a resposta da Function');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const cf = block(server, 'exports.setDrawBalanceChoice = onCall', '\n// ─── Metadados');
ok(/request\.auth/.test(cf) && /_isTournamentAdmin/.test(cf), 'Function exige autenticação e organização');
ok(/db\.runTransaction/.test(cf) && /_leTorneio/.test(cf) && /_gravaTorneio/.test(cf), 'Function relê e grava o torneio fresco transacionalmente');
/* ⛔ INVERTIDO EM 23/set/2026. Este caso exigia que o equilíbrio gravasse o gênero no PERFIL
 * GLOBAL do inscrito — ou seja, exigia o defeito: ser organizador não prova consentimento, e
 * inscrever terceiro é fluxo suportado, então qualquer conta reescrevia o cadastro da vítima.
 * A decisão do organizador agora vive no INSCRITO, marcada com `genderSource`. */
ok(/participant\.gender/.test(cf) && /genderSource/.test(cf),
  'a decisão de gênero fica no INSCRITO, marcada com a procedência');
ok(!/users'\)\.doc/.test(cf), '⛔ e a Function NÃO toca no perfil global de ninguém');
ok(/t\._drawBalanceMode/.test(cf) && /t\.equilibrado/.test(cf) && /wlGroupBalance/.test(cf), 'Function mantém todos os campos consumidos pelo motor coerentes');
process.exitCode = bad ? 1 : 0;
