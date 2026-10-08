'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
let pass = 0;
let fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }

function bodyAfter(marker, nextMarker) {
  const start = source.indexOf(marker);
  const end = source.indexOf(nextMarker, start + marker.length);
  return start === -1 ? '' : source.slice(start, end === -1 ? source.length : end);
}

const guard = bodyAfter('function _assertLegacyRosterStillAuthoritative', '// Prévia da migração I1');
ok('a trava reconhece apenas o marcador estrutural da migração',
  guard.includes('canonicalRegistrationMigration') &&
  guard.includes('migration.fingerprint') &&
  !/creatorEmail|adminEmails|displayName/.test(guard));

[
  ['inscrição legada', 'exports.enrollParticipant = onCall', '// "NÃO SOU EU"'],
  ['desinscrição legada', 'exports.deenrollParticipant = onCall', '// Sair da lista de espera'],
  ['saída da espera legada', 'exports.leaveStandby = onCall', '// Formar/desfazer DUPLA manual'],
  ['formação de dupla legada', 'exports.formPair = onCall', 'exports.splitPair = onCall'],
  ['desfazimento de dupla legado', 'exports.splitPair = onCall', '// ── Convite de CO-ORGANIZAÇÃO'],
].forEach(function (item) {
  const body = bodyAfter(item[1], item[2]);
  ok(item[0] + ' para antes de gravar projeção paralela',
    body.includes('_assertLegacyRosterStillAuthoritative('));
});

console.log((fail ? '❌' : '✅') + ' materializacao-nao-diverge-roster-legado: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
