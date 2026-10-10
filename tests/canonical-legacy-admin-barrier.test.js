'use strict';
const fs = require('fs');
let failed = 0;
function ok(condition, message) { if (condition) console.log('✓ ' + message); else { console.error('✗ ' + message); failed++; } }
const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
ok(/function _assertLegacyRosterMutationAllowed\(t, operation\)/.test(server) && /migration\.fingerprint/.test(server),
  'barreira central identifica recibo canônico antes de writers legados');
[
  'remoção administrativa legada',
  'desmembramento legado de dupla',
  'deduplicação legada',
  'drenagem legada da lista de espera',
  'ocupação legada de placeholder',
  'promoção legada da lista de espera',
  'sorteio legado de vagas',
  'dissolução legada de times incompletos',
  'remoção legada entre fases'
].forEach(function (operation) {
  ok(server.includes("_assertLegacyRosterMutationAllowed(t, '" + operation + "')"), operation + ' é recusada quando o elenco é canônico');
});
const client = fs.readFileSync('js/views/tournaments.js', 'utf8');
const a = client.indexOf('// Higiene do elenco é sempre canônica');
const b = client.indexOf('    }\n\n    // ── HTML', a);
const ui = client.slice(a, b);
ok(/_canonicalRoster/.test(ui) && /&& !_canonicalRoster/.test(ui),
  'a abertura da tela não dispara reconciliação legada em torneio canônico');
process.exitCode = failed ? 1 : 0;
