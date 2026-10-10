'use strict';

/*
 * A análise de inscrições já teve uma porta que encontrava o alvo pelo nome
 * mostrado no card. Com dois convidados manuais homônimos, ela alterava o
 * primeiro da lista. Esta prova executa o resolvedor real usado pela Function:
 * UID e manualParticipantId são exatos; nome é migração limitada a uma única
 * entrada legada e qualquer ambiguidade é recusada.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(value, message) {
  if (value) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'functions-autodraw', 'index.js'), 'utf8');
const start = server.indexOf('function _findEnrollmentAssignmentTarget(');
const end = server.indexOf('\n/* `invoker:', start);
ok(start >= 0 && end > start, 'encontrou o resolvedor real da Function');

let resolve;
if (start >= 0 && end > start) {
  const sandbox = { Array, Boolean, String, Object, console };
  vm.createContext(sandbox);
  vm.runInContext(server.slice(start, end) + '\nthis.resolve = _findEnrollmentAssignmentTarget;', sandbox);
  resolve = sandbox.resolve;
}

const roster = [
  { uid: 'uid-ana', displayName: 'Ana' },
  { manualParticipantId: 'manual-ana-1', name: 'Ana' },
  { manualParticipantId: 'manual-ana-2', name: 'Ana' },
  { p1Uid: 'uid-bia', p1Name: 'Bia', p2ManualId: 'manual-ca', p2Name: 'Ca' }
];

if (resolve) {
  let hit = resolve(roster, { uid: 'uid-ana' });
  ok(hit.target === roster[0] && !hit.ambiguous, 'UID resolve exatamente a conta, mesmo com homônimos');

  hit = resolve(roster, { manualParticipantId: 'manual-ana-2' });
  ok(hit.target === roster[2] && !hit.ambiguous, 'manualParticipantId resolve exatamente o convidado manual');

  hit = resolve([{ manualId: 'manual-legado', name: 'Ana' }], { manualParticipantId: 'manual-legado' });
  ok(hit.target && !hit.ambiguous, 'manualId legado continua resolvido pelo identificador estável');

  hit = resolve(roster, { manualParticipantId: 'manual-ca', pairMember: 'p2' });
  ok(hit.target === roster[3] && !hit.ambiguous, 'identidade manual do segundo membro da dupla encontra a dupla certa');

  hit = resolve([{ name: 'Legado único' }], { legacyName: 'Legado único' });
  ok(hit.target && !hit.ambiguous, 'nome legado único continua recuperável para materialização');

  hit = resolve(roster, { legacyName: 'Ana' });
  ok(!hit.target && hit.ambiguous, 'homônimo legado é recusado; nunca escolhe o primeiro card');
}

const categories = fs.readFileSync(path.join(root, 'js', 'views', 'tournaments-categories.js'), 'utf8');
const assignments = server.slice(start, server.indexOf('\n// ─── Formação manual', start));
ok(!/edits:\s*\[\{\s*uid:\s*p\.uid\s*\|\|\s*''\s*,\s*name:/.test(categories),
  'ações de categoria não voltam a despachar nome como identidade');
ok(categories.includes('function _assignmentParticipantIdentity') && categories.includes('legacyName: legacyName'),
  'a interface envia UID/manualParticipantId; nome só via campo explícito de legado');
ok(assignments.includes('legacyName:String(x&&(x.legacyName||x.name)||\'\')') && assignments.includes('e.uid?u.includes(e.uid):e.manualParticipantId?manual.includes(e.manualParticipantId)'),
  'cliente antigo é traduzido para legado; UID e ID manual continuam tendo precedência');
ok(assignments.includes('hits.length===1') && assignments.includes("'alvo ambíguo'"),
  'a Function exige unicidade antes de alterar inscrição legada');

console.log((fail ? '❌' : '✅') + ' atribuicao-categoria-identidade-estrutural: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
