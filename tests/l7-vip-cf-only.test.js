/* L7 — VIP é intenção administrativa, nunca saveTournament de uma aba. */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); let ok = 0, bad = 0;
function check(n, yes) { if (yes) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n); } }
function cut(s, a, b) { const i=s.indexOf(a), j=s.indexOf(b, i+a.length); if (i<0||j<0) throw new Error('marcador ausente'); return s.slice(i,j); }
const client = fs.readFileSync(path.join(root, 'js/views/participants.js'), 'utf8');
const toggle = cut(client, 'window._toggleVip = function', '\n};\n\n// ── Declarar ausência');
check('cliente chama a porta VIP', /_callFn\('setTournamentParticipantVip'/.test(toggle));
check('cliente não salva torneio', !/saveTournament|mutateTournament|commitTournamentTx/.test(toggle));
check('cliente apenas aplica retorno confirmado', /t\.vips\s*=\s*out\.vips/.test(toggle));
const server = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const cf = cut(server, 'exports.setTournamentParticipantVip = onCall', '\n/* ═══ GRUPO GERAL');
check('CF exige autenticação', /request\.auth/.test(cf));
check('CF hidrata elenco para validar participante', /_lerTorneioComElenco\(db, tournamentId\)/.test(cf));
check('CF exige organização no dado fresco', /_isTournamentOrgCaller\(fresh, callerUid\)/.test(cf));
check('CF atualiza vips em transação', /db\.runTransaction/.test(cf) && /tx\.update\(ref, \{ vips/.test(cf));
check('CF limita o payload a identidade do participante', !/data\.(?:vips|participants|matches|rounds)/.test(cf));
console.log('\nL7 VIP: ' + ok + ' ok, ' + bad + ' falharam'); process.exitCode = bad ? 1 : 0;
