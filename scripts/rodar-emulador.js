#!/usr/bin/env node
/* Roda `firebase emulators:exec` dando o veredito ao SCRIPT, não ao desligamento da CLI.
 *
 * ⛔ POR QUE. `emulators:exec` às vezes sai com código != 0 DEPOIS de o script ter passado,
 * imprimindo nesta ordem:
 *     ✔  Script exited successfully (code 0)
 *     Error: An unexpected error has occurred.
 * É o DESLIGAMENTO do emulador. MEDIDO em 13/set/2026: `test:concurrency` reprovava assim, e
 * no `l7-creation-replay-emulator` acontecia em 2 de 3 rodadas limpas — publicação barrada
 * por sorteio.
 *
 * ⛔ QUEM DÁ O VEREDITO É O SCRIPT: o único caminho que perdoa é aquele em que a PRÓPRIA CLI
 * certificou "Script exited successfully (code 0)". Script que falha nunca imprime isso.
 *
 * Uso:  node scripts/rodar-emulador.js --only firestore --config x.json --project p "node t.js"
 */
'use strict';
const { rodarNoEmulador } = require('../tests/emulador.js');

const args = ['emulators:exec'].concat(process.argv.slice(2));
try {
  const saida = rodarNoEmulador(args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env,
      { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }),
  });
  process.stdout.write(saida);
  process.exit(0);
} catch (e) {
  process.stdout.write(String((e && e.stdout) || ''));
  process.stderr.write(String((e && e.stderr) || ''));
  process.exit((e && e.status) || 1);
}
