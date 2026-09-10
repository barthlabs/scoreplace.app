'use strict';
// A reabertura deixou de executar uma transação na aba. A garantia que importa é
// o servidor alterar somente estado de inscrição no documento fresco, sem aceitar
// nem reconstruir jogos/placares de um snapshot que pode estar atrasado.
const fs = require('fs');
const client = fs.readFileSync('js/views/tournaments-draw-prep.js', 'utf8');
const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const a = server.indexOf('exports.reopenDrawEnrollment = onCall');
const b = server.indexOf('exports.dissolveIncompleteTeams = onCall', a);
const fn = server.slice(a, b);
const i = client.indexOf('window._handleIncompleteOption = function');
const j = client.indexOf('window.showLotteryIncompletePanel', i);
const k = client.indexOf('window._handleOddOption = function');
const l = client.indexOf('// ─── VERIFICAÇÃO 3:', k);
const handlers = client.slice(i, j) + client.slice(k, l);
let fail = 0; function ok(v,m){ if(v) console.log('✓ '+m); else { fail++; console.error('✗ '+m); } }
ok(/_reopenDrawEnrollment\(tId, 'incomplete'\)/.test(handlers) && /_reopenDrawEnrollment\(tId, 'odd'\)/.test(handlers), 'reabrir times e ímpar despacham a intenção para a Function');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(handlers), 'os handlers não escrevem uma cópia local');
ok(/db\.runTransaction/.test(fn) && /_leTorneio/.test(fn) && /_isTournamentAdmin/.test(fn), 'a Function relê o documento fresco e exige a organização');
ok(/t\.status = 'open'/.test(fn) && /reason === 'incomplete'/.test(fn), 'a Function altera só o estado de inscrição previsto');
ok(!/(?:t\.|request\.data).*matches\s*=/.test(fn) && !/(?:t\.|request\.data).*(?:scoreP1|scoreP2|sets)\s*=/.test(fn), 'reabrir não regrava jogos nem placares');
ok(/_antesDoMotor/.test(fn) && /_gravaTorneio/.test(fn) && /tournament:b\.clean/.test(fn), 'a persistência canônica preserva os campos concorrentes e devolve o recibo');
if(fail) process.exit(1);
