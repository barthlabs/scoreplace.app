'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
let pass = 0;
let fail = 0;
function ok(name, condition) {
  if (condition) pass++;
  else { fail++; console.error('✗ ' + name); }
}
function block(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to === -1 ? source.length : to);
}

// A leitura foi extraída para que a prévia unitária e a de lote não possam
// divergir. A porta unitária continua sendo responsável apenas por autenticar
// e exigir o tournamentId; o helper concentra a fotografia transacional.
const fn = block(index, 'exports.previewCanonicalRegistrationMigration', '/* Prévia administrativa curta');
const helper = block(index, 'async function _previewCanonicalRegistrationMigrationForOrganizer', '// Prévia da migração I1');
ok('Function de prévia existe', fn.length > 300 && helper.length > 900);
ok('identidade vem exclusivamente do token', /request\.auth && request\.auth\.uid/.test(fn));
ok('exige tournamentId', /tournamentId é obrigatório/.test(fn));
ok('lê o torneio e a parte participants em transação', /db\.runTransaction/.test(helper) && /_splitParts\.hidratar\(tx, ref, snap\.data\(\) \|\| \{\}, \["participants"\]\)/.test(helper));
ok('autoriza organização contra dado fresco', /_isTournamentOrgCaller\(tournament, callerUid\)/.test(helper));
ok('usa o núcleo puro sobre os registros físicos do elenco dividido',
  /_splitParts\.lerRegistrosDaParte\(tx, ref, "participants"\)/.test(helper) &&
  // A projeção recebe também a ponte explícita rótulo legado → categoryId. Sem
  // ela, nomes de categoria virariam identidade implícita durante a migração.
  /_registrationCore\.projectLegacyRoster\(tournamentId, records, categoryIdForLegacyLabel\)/.test(helper));
ok('prévia não cria nem atualiza documentos', !/\btx\.(?:set|update|delete)\b/.test(helper));
ok('retorno contém contadores, exceções e fingerprint', /summary: \{/.test(helper) && /conflicts: report\.conflicts/.test(helper) && /unsupported: report\.unsupported/.test(helper) && /fingerprint: report\.fingerprint/.test(helper));

console.log((fail ? '❌' : '✅') + ' registro-canonico-dry-run-cf: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
