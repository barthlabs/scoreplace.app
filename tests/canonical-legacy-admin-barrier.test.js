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
  'remoção legada entre fases',
  'atribuição legada de categoria',
  'formação legada de times',
  'marcadores legados de categoria',
  'sincronização legada de categoria do perfil',
  'decisão legada de categoria do perfil',
  'normalização legada de categorias',
  'enquadramento automático legado',
  'mesclagem legada de categorias',
  'exclusão legada de categoria',
  'desfazer legado de mesclagem de categorias',
  'desfazer legado de mesclagem inferida',
  'equilíbrio legado do sorteio',
  'configuração legada de categorias'
].forEach(function (operation) {
  ok(server.includes("_assertLegacyRosterMutationAllowed(t, '" + operation + "')"), operation + ' é recusada quando o elenco é canônico');
});
function bodyAfter(marker, until) {
  const start = server.indexOf(marker);
  const end = start < 0 ? -1 : server.indexOf(until, start + marker.length);
  return start < 0 ? '' : server.slice(start, end < 0 ? server.length : end);
}
const requestMerge = bodyAfter('exports.requestParticipantMerge =', 'exports.resolveParticipantMerge =');
const resolveMerge = bodyAfter('exports.resolveParticipantMerge =', 'function _woIdentitySlots');
ok(requestMerge.includes("_assertLegacyRosterMutationAllowed(t, 'vínculo legado de participante')"),
  'pedido de vínculo legado é recusado após a migração canônica');
ok(resolveMerge.includes("_assertLegacyRosterMutationAllowed(t, 'aceite legado de vínculo de participante')"),
  'aceite de vínculo legado é recusado após a migração canônica');
ok(resolveMerge.indexOf("if(action==='reject')") < resolveMerge.indexOf("_assertLegacyRosterMutationAllowed(t, 'aceite legado de vínculo de participante')"),
  'recusa de pendência antiga continua possível sem reescrever o elenco');
const client = fs.readFileSync('js/views/tournaments.js', 'utf8');
const a = client.indexOf('// Higiene do elenco é sempre canônica');
const b = client.indexOf('    }\n\n    // ── HTML', a);
const ui = client.slice(a, b);
ok(/_canonicalRoster/.test(ui) && /&& !_canonicalRoster/.test(ui),
  'a abertura da tela não dispara reconciliação legada em torneio canônico');
process.exitCode = failed ? 1 : 0;
