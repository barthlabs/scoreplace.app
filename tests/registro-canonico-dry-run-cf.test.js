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

const fn = block(index, 'exports.previewCanonicalRegistrationMigration', '/* ─── deleteTournament');
ok('Function de prévia existe', fn.length > 300);
ok('identidade vem exclusivamente do token', /request\.auth && request\.auth\.uid/.test(fn));
ok('exige tournamentId', /tournamentId é obrigatório/.test(fn));
ok('lê o torneio e a parte participants em transação', /db\.runTransaction/.test(fn) && /_splitParts\.hidratar\(tx, ref, snap\.data\(\) \|\| \{\}, \["participants"\]\)/.test(fn));
ok('autoriza organização contra dado fresco', /_isTournamentOrgCaller\(tournament, callerUid\)/.test(fn));
ok('usa o núcleo puro para o censo', /_registrationCore\.dryRunLegacyRoster\(tournamentId, tournament\.participants\)/.test(fn));
ok('prévia não cria nem atualiza documentos', !/\btx\.(?:set|update|delete)\b/.test(fn));
ok('retorno contém contadores e exceções', /summary: \{/.test(fn) && /conflicts: report\.conflicts/.test(fn) && /unsupported: report\.unsupported/.test(fn));

console.log((fail ? '❌' : '✅') + ' registro-canonico-dry-run-cf: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
