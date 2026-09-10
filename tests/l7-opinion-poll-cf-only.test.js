const fs = require('fs');
let fail = 0;
function ok(value, message) { if (value) console.log('✓ ' + message); else { fail++; console.error('✗ ' + message); } }
const ui = fs.readFileSync('js/views/opinion-poll.js', 'utf8');
const fn = fs.readFileSync('functions/index.js', 'utf8');
ok(/function _mutate\(t, action, payload\)/.test(ui), 'enquete despacha intenção tipada');
ok(/_callCF\('mutateOpinionPoll'/.test(ui), 'criação, voto e fechamento usam a porta CF');
ok(!/saveTournament|_sendUserNotification|_notifyTournamentParticipants/.test(ui), 'enquete não grava torneio nem entrega notificação pelo cliente');
ok(/exports\.mutateOpinionPoll\s*=\s*onCall/.test(fn), 'Function de enquete existe');
ok(/\["save", "vote", "close", "stamp-notification", "republish"\]/.test(fn), 'Function aceita somente ações declaradas');
ok(/_opPollCallerCanVote\(t, callerUid\)/.test(fn), 'voto é autorizado com elenco fresco');
ok(/_splitParts\.gravar\(tx, ref, t, \{ opinionPolls: polls/.test(fn), 'Function grava apenas o campo da enquete');
ok(/skipOpinionPollVoters/.test(fn) && /targetUids/.test(fn), 'fan-out server-side suporta reaviso seletivo e inscrito novo');
if (fail) process.exit(1);
