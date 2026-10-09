'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const organizer = fs.readFileSync(path.join(root, 'js/views/tournaments-organizer.js'), 'utf8');
const tournaments = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
let pass = 0;
let fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }

const start = organizer.indexOf('window._materializeCanonicalRegistrations = function');
const end = organizer.indexOf('window._reopenAbandonedTournament = function', start);
const body = organizer.slice(start, end === -1 ? organizer.length : end);

ok('ferramenta explícita do organizador existe', start !== -1 && body.length > 1200);
ok('a ferramenta falha fechada enquanto as mutações canônicas não existem',
  body.includes('window._canonicalRegistrationMutationsReady !== true') &&
  body.indexOf('window._canonicalRegistrationMutationsReady !== true') < body.indexOf("_callCF('previewCanonicalRegistrationMigration'"));
ok('a prévia e a aplicação continuam atrás do bloqueio explícito',
  body.includes("_callCF('previewCanonicalRegistrationMigration'") &&
  /fingerprint:\s*fingerprint/.test(body) && body.includes("_callCF('applyCanonicalRegistrationMigration'"));
ok('a ferramenta não escreve Firestore pelo navegador',
  !/\.collection\([^\n]+\)\.(?:set|update|add|delete)\(/.test(body));
ok('botão não expõe a conversão incompleta à organização',
  !tournaments.includes("window._materializeCanonicalRegistrations('") &&
  !tournaments.includes('🧬 Conferir inscrições'));

console.log((fail ? '❌' : '✅') + ' materializacao-inscricoes-organizador: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
