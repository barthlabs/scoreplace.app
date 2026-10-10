'use strict';

const fs = require('fs');
let failed = 0;
function ok(condition, message) { if (condition) console.log('✓ ' + message); else { console.error('✗ ' + message); failed++; } }

const server = fs.readFileSync('functions/index.js', 'utf8');
const start = server.indexOf('exports.reclassifyCanonicalRegistration = onCall(');
const end = server.indexOf('// Prévia da migração I1:', start);
const block = server.slice(start, end);

ok(start >= 0 && /_isTournamentOrgCaller\(tournament, callerUid\)/.test(block),
  'mudança canônica de categoria exige organização autenticada');
ok(/canonicalRegistrationMigration/.test(block) && /torneio ainda não usa inscrições canônicas/.test(block),
  'a callable não cai no roster legado quando o recibo canônico falta');
ok(/categoryIdsFromTypedIds\(definitions, \[fromCategoryId, toCategoryId\]\)/.test(block),
  'origem e destino são IDs tipados, não rótulos visíveis');
ok(/_registrationMutations\.reclassify\(/.test(block) && /_writeCanonicalRosterChanges\(/.test(block),
  'a transição usa núcleo puro e grava retirada/criação no mesmo commit');
ok(/movedPair: !!changes\.fixedPairId/.test(block),
  'a resposta informa quando a dupla fixa inteira foi transferida');
ok(/function _writeCanonicalRosterChanges\(/.test(server) && /applyChanges\(canonicalTournament, registrations, updates, creates\)/.test(server),
  'writer único valida o recibo antes de tocar nos documentos canônicos');

process.exitCode = failed ? 1 : 0;
