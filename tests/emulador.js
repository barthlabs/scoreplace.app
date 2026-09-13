'use strict';
/* RODAR NO EMULADOR — um lugar só, porque a MESMA fragilidade estava copiada 12 vezes.
 *
 * ⛔ O QUE ACONTECE: `firebase emulators:exec` às vezes sai com código != 0 DEPOIS de o
 * script ter passado. A saída diz as duas coisas, nesta ordem:
 *     ✔  Script exited successfully (code 0)
 *     Error: An unexpected error has occurred.
 * É o DESLIGAMENTO do emulador, não o teste. MEDIDO em 13/set/2026: no
 * `l7-creation-replay-emulator` isso acontecia em 2 de 3 rodadas limpas, com o emulador
 * gravando `Transaction lock timeout` — e aquele teste PROVOCA disputa de transação de
 * propósito. Resultado: publicação barrada por sorteio.
 *
 * ⛔ QUEM DÁ O VEREDITO É O SCRIPT. O único caminho que perdoa é aquele em que a PRÓPRIA
 * CLI certificou que o script saiu com 0. Script que falha nunca imprime essa linha, e
 * continua reprovando — o perdão não engole falha de teste.
 *
 * ⚠️ E ISTO NÃO É "ignorar erro": é ler o erro certo. O erro do produto está no exit code do
 * DRIVER; o do desligamento está no da CLI. Antes os dois chegavam misturados.
 */
const { execFileSync } = require('child_process');

const MARCA_OK = /Script exited successfully \(code 0\)/;

/**
 * Roda `firebase emulators:exec` e devolve a saída (stdout+stderr).
 * Lança se o SCRIPT falhou; perdoa se só o desligamento da CLI falhou.
 */
function rodarNoEmulador(args, opts) {
  try {
    return execFileSync('firebase', args, Object.assign({ encoding: 'utf8' }, opts || {}));
  } catch (e) {
    const saida = String((e && e.stdout) || '') + String((e && e.stderr) || '');
    if (MARCA_OK.test(saida)) {
      process.stderr.write('\n⚠️  o script passou; quem falhou foi o desligamento do emulador ' +
        '(firebase-tools saiu com ' + (e && e.status) + ' depois de certificar ' +
        '"Script exited successfully (code 0)").\n');
      return saida;
    }
    throw e;
  }
}

module.exports = { rodarNoEmulador, MARCA_OK };
