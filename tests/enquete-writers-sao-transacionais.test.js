'use strict';
const fs = require('fs');
const client = fs.readFileSync('js/views/tournaments-draw-prep.js', 'utf8');
const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
let fail = 0;
function ok(value, message) { if (value) console.log('✓ ' + message); else { fail++; console.error('✗ ' + message); } }
function body(text, start, end) { const a = text.indexOf(start); const b = text.indexOf(end, a + start.length); return a < 0 ? '' : text.slice(a, b < 0 ? text.length : b); }
const helpers = ['_createDrawPoll', '_castDrawPollVote', '_closeDrawPoll', '_reopenDrawPoll', '_applyDrawPollResult'];
helpers.forEach((name) => {
  const part = body(client, 'window.' + name + ' = function', '\n};');
  ok(/window\._callCF\(/.test(part), name + ' despacha somente a intenção à Function');
  ok(!/AppStore\.(?:mutate|commitTournamentTx)|saveTournament\(|AppStore\.sync\(/.test(part), name + ' não regrava snapshot no navegador');
});
['createDrawPoll', 'castDrawPollVote', 'closeDrawPoll', 'reopenDrawPoll', 'applyDrawPollResult'].forEach((name) => {
  const part = body(server, 'exports.' + name + ' = onCall', '\nexports.');
  ok(/db\.runTransaction/.test(part), name + ' lê e grava dentro da transação fresca');
  ok(/_isTournamentAdmin|_isTournamentParticipant/.test(part), name + ' valida identidade no servidor');
});
const create = body(server, 'exports.createDrawPoll = onCall', '\nexports.');
const apply = body(server, 'exports.applyDrawPollResult = onCall', '\nexports.');
const close = body(server, 'exports.closeDrawPoll = onCall', '\nexports.');
ok(/_seasonRecipientUids|memberUids/.test(create) && /pollNotifications/.test(create), 'criação deriva destinatários do elenco fresco');
ok(/winner|votes/.test(apply) && /poll/.test(apply), 'aplicação calcula vencedor no estado fresco da enquete');
ok(/poll/.test(close) && /deadline/.test(close), 'fechamento localiza e encerra a enquete no documento fresco');
process.exit(fail ? 1 : 0);
