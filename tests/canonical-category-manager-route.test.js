'use strict';

const fs = require('fs');
let failed = 0;
function ok(condition, message) { if (condition) console.log('✓ ' + message); else { console.error('✗ ' + message); failed++; } }
function between(source, first, last) {
  const start = source.indexOf(first);
  const end = source.indexOf(last, start + first.length);
  return source.slice(start, end < 0 ? source.length : end);
}

const source = fs.readFileSync('js/views/tournaments-categories.js', 'utf8');
const move = between(source, 'window._moveBetweenCategories = function', '// Auto-reassign participants');
const remove = between(source, 'function _executeRemoveFromCategory', 'window._moveBetweenCategories');
const assign = between(source, 'function _assignParticipantCategory', '// Category assignment notification');
const bridge = between(source, 'function _isCanonicalCategoryRoster', 'function _assignParticipantCategory');

ok(/canonicalRegistrationMigration/.test(bridge) && /fingerprint/.test(bridge),
  'o gerenciador detecta exclusivamente o recibo da migração canônica');
ok(/participant\.categoryId/.test(bridge) && /categoryDefinitions/.test(bridge),
  'a ponte preserva o categoryId estrutural e traduz rótulo apenas na borda visual');
ok(/identity\.legacyName/.test(bridge) && /inscrição canônica sem identidade estável/.test(bridge),
  'a ponte canônica recusa nome como identidade de mutação');
ok(/_callFn\('reclassifyCanonicalRegistration'/.test(bridge) && /fromCategoryId/.test(bridge) && /toCategoryId/.test(bridge),
  'a mudança canônica chama a porta tipada com origem e destino');
ok(/_isCanonicalCategoryRoster\(t\)/.test(move) && /_reclassifyCanonicalCategory\(t, tId, p, targetCat, sourceCat\)/.test(move),
  'arrastar em torneio migrado usa a rota canônica');
ok(/if \(_isCanonicalCategoryRoster\(t\)\)[\s\S]*?return;[\s\S]*?var identity/.test(move),
  'a rota canônica não cai no fallback legado após uma falha');
ok(/_isCanonicalCategoryRoster\(t\)/.test(remove) && /não fica sem categoria/.test(remove),
  'remoção não cria estado sem categoria em torneio canônico');
ok(/_isCanonicalCategoryRoster\(t\)/.test(assign) && /return;[\s\S]*?applyEnrollmentAssignments/.test(assign),
  'atribuição de vaga vazia não contorna o roster canônico pela Function legada');

process.exitCode = failed ? 1 : 0;
