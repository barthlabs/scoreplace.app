const fs = require('fs');
const s = fs.readFileSync('js/store.js', 'utf8');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
const tick = s.slice(s.indexOf('// v1.6.66-beta: auto-expirar prazo'), s.indexOf('// ─── Soft refresh:', s.indexOf('// v1.6.66-beta: auto-expirar prazo')));
const boot = s.slice(s.indexOf('window._autoCloseExpiredEnrollments = function'), s.indexOf('// v1.6.68-beta:', s.indexOf('window._autoCloseExpiredEnrollments = function')));
ok(/_requestExpiredEnrollmentClose\(tId, _appT\)/.test(tick), 'tick pede o fecho ao servidor');
ok(!/commitTournamentTx|\.update\(/.test(tick), 'tick não escreve status no navegador');
ok(/_requestExpiredEnrollmentClose\(t\.id, t\)/.test(boot), 'fechamento no boot pede a Function');
ok(!/commitTournamentTx|t\.status = 'closed'/.test(boot), 'boot não altera status localmente');
const tournaments = fs.readFileSync('js/views/tournaments.js', 'utf8');
const render = tournaments.slice(tournaments.indexOf('// Auto-close: if deadline passed'), tournaments.indexOf('// Self-heal:', tournaments.indexOf('// Auto-close: if deadline passed')));
ok(/_requestExpiredEnrollmentClose\(String\(t\.id\), t\)/.test(render), 'render usa a mesma deduplicação canônica');
ok(!/_callCF\('closeExpiredEnrollment'|_autoClosedByDeadline/.test(render), 'render não cria chamada paralela nem estado local');
if (fail) process.exit(1);
