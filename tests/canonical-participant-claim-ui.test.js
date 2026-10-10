'use strict';
const fs = require('fs'), path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8');
let fail = 0;
function ok(name, value) { console.log((value ? '✓ ' : '✗ ') + name); if (!value) fail++; }
ok('pedido canônico seleciona callable própria', /requestCanonicalParticipantClaim/.test(source) && /canonicalRegistrationMigration/.test(source));
ok('aceite canônico envia claimId, não requestId', /resolveCanonicalParticipantClaim/.test(source) && /claimId/.test(source));
ok('pendência canônica é localizada por accountUid', /pendingCanonicalParticipantClaims[\s\S]{0,180}accountUid/.test(source));
ok('aviso canônico não promete herdar jogos', /vínculo só pode ocorrer antes do sorteio/.test(source));
process.exitCode = fail ? 1 : 0;
