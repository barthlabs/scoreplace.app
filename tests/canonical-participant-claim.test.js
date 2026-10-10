'use strict';
const fs = require('fs'), path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
let failed = 0;
function ok(name, value) { console.log((value ? '✓ ' : '✗ ') + name); if (!value) failed++; }
function block(start, end) { const a = source.indexOf(start), b = source.indexOf(end, a + start.length); return a < 0 ? '' : source.slice(a, b < 0 ? undefined : b); }
const request = block('exports.requestCanonicalParticipantClaim =', 'exports.resolveCanonicalParticipantClaim =');
const resolve = block('exports.resolveCanonicalParticipantClaim =', '// Prévia da migração I1');
ok('pedido canônico exige organização por UID', /_isTournamentOrgCaller\(tournament, callerUid\)/.test(request));
ok('pedido usa apenas identidade estrutural', /manualParticipantId/.test(request) && /accountUid/.test(request) && !/genericName/.test(request));
ok('pedido recusa depois da chave', /_hasCanonicalTournamentDraw\(tournament\)/.test(request));
ok('aceite pertence exclusivamente à conta indicada', /claim\.accountUid !== callerUid/.test(resolve));
ok('aceite usa o núcleo canônico, sem projeção legada', /_registrationClaim\.claimManualParticipant/.test(resolve) && !/participants\s*=/.test(resolve));
ok('aceite remove a pendência no mesmo writer do roster', /_writeCanonicalRosterChanges[\s\S]*pendingCanonicalParticipantClaims/.test(resolve));
process.exitCode = failed ? 1 : 0;
