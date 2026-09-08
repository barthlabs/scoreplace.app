const fs = require('fs');
const s = fs.readFileSync('js/store.js', 'utf8');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
const tick = s.slice(s.indexOf('// v1.6.66-beta: auto-expirar prazo'), s.indexOf('// ─── Soft refresh:', s.indexOf('// v1.6.66-beta: auto-expirar prazo')));
const boot = s.slice(s.indexOf('window._autoCloseExpiredEnrollments = function'), s.indexOf('// v1.6.68-beta:', s.indexOf('window._autoCloseExpiredEnrollments = function')));
ok(/commitTournamentTx/.test(tick) && /ft\.status = 'closed'/.test(tick), 'tick de prazo fecha no documento fresco');
ok(!/saveTournament\(_appT\)/.test(tick), 'tick não regrava snapshot do AppStore');
ok(/commitTournamentTx/.test(boot) && /ft\.status = 'closed'/.test(boot), 'fechamento no boot usa documento fresco');
ok(!/saveTournament\(t\)/.test(boot), 'boot não regrava snapshot inteiro');
if (fail) process.exit(1);
