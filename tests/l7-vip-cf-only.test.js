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
check('cliente não envia nome à porta VIP', !/participantName/.test(toggle));
check('cliente envia somente identidades estáveis', /identities:\s*identities/.test(toggle));
check('payload de identidade não rompe atributo onclick', /replace\(\/"\/g, '&quot;'\)/.test(client));
const server = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const cf = cut(server, 'exports.setTournamentParticipantVip = onCall', '\n/* ═══ GRUPO GERAL');
check('CF exige autenticação', /request\.auth/.test(cf));
check('CF normaliza UID ou ID manual, nunca nome', /_tournamentVip\.normalizeTargets\(data\)/.test(cf) && !/participantName/.test(cf));
check('CF valida organização no dado fresco', /_isTournamentOrgCaller\(rawTournament, callerUid\)/.test(cf));
check('CF carrega roster dentro da transação', /_loadCanonicalRosterForMutation\(tx, ref, rawTournament\)/.test(cf) && /_splitParts\.hidratar\(tx, ref, rawTournament\)/.test(cf));
check('CF confere as identidades no roster', /_tournamentVip\.rosterHasTargets\(roster, targets\)/.test(cf));
check('CF atualiza vips em transação', /db\.runTransaction/.test(cf) && /tx\.update\(ref, \{ vips/.test(cf));
check('CF limita o payload a identidade do participante', !/data\.(?:vips|participants|matches|rounds)/.test(cf));
console.log('\nL7 VIP: ' + ok + ' ok, ' + bad + ' falharam'); process.exitCode = bad ? 1 : 0;
