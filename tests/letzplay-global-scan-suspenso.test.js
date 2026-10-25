/* Exercita os handlers reais da Análise: cliente nenhum grava scan global. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox, window } = require('./headless.js');

const file = path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js');
const source = fs.readFileSync(file, 'utf8');
const closing = source.lastIndexOf('})();');
if (closing < 0) throw new Error('fecho do módulo não encontrado');
const instrumented = source.slice(0, closing)
  + 'window.__testPersistScans = _lzPersistScans;\n'
  + 'window.__testSaveScansAndReload = _saveScansAndReload;\n'
  + source.slice(closing);
vm.runInContext(instrumented, sandbox, { filename: file });

let writes = 0;
let notices = 0;
window.firebase = { firestore: () => ({ collection: () => ({ doc: () => ({
  set: () => { writes++; return Promise.resolve(); },
}) }) }) };
window.showNotification = () => { notices++; };

async function main() {
  const fake = [{ uid: 'outra-pessoa', scan: { profileSkill: 'A' } }];
  await window.__testPersistScans('torneio', fake).then(
    () => { throw new Error('persistência deve ser recusada'); },
    (err) => { if (!/suspens/i.test(err.message)) throw err; }
  );
  let failure = null;
  window.__testSaveScansAndReload('torneio', fake, (message) => { failure = message; });
  if (!/suspens/i.test(failure || '')) throw new Error('fluxo completo deve avisar a suspensão');
  window._lzAthleteImport('outra-pessoa');
  window._lzOrgScan('torneio');
  if (writes !== 0) throw new Error('houve ' + writes + ' gravações globais');
  if (notices < 2) throw new Error('handlers públicos não avisaram a suspensão');
  console.log('✅ scan global suspenso: persistência, fluxo completo e handlers públicos sem escrita');
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
