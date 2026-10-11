/* Regressão de fronteira: alterar displayName muda somente users/{uid}. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'views', 'auth.js'), 'utf8');
let pass = 0, fail = 0;
function ok(value, message) { if (value) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }
function between(source, start, end) {
  const i = source.indexOf(start); const j = i < 0 ? -1 : source.indexOf(end, i);
  return i < 0 ? '' : source.slice(i, j < 0 ? source.length : j);
}
const nameShell = between(auth, 'window._propagateNameChange', 'function _propagatePhotoToTournaments');

ok(!/exports\.propagateDisplayName\s*=/.test(server), 'não há trigger propagateDisplayName');
ok(!/require\(["']\.\/rename-propagate-core["']\)/.test(server), 'backend não carrega core de reescrita de nome');
ok(!/propagateDisplayName[\s\S]{0,1200}collection\(["']tournaments["']\)/.test(server),
  'nenhum caminho de propagação de nome consulta torneios');
ok(!/saveTournament|mutateTournament|commitTournamentTx/.test(nameShell),
  'casca de compatibilidade do cliente não grava torneio');
ok(/resolve por uid|users\/\{uid\}/.test(nameShell),
  'casca documenta resolução pelo perfil, não propagação');

console.log('\nprofile-name-never-writes-tournaments: ' + pass + ' ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
