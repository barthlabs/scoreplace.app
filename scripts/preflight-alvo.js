/* preflight-alvo.js — QUAL BANCO ESTE SCRIPT VAI TOCAR?
 *
 * ⛔ 6ª auditoria (ponto 14): backup, restore e backfill defaultavam para `scoreplace-app`
 * e imprimiam "projeto: scoreplace-app" mesmo quando `FIRESTORE_EMULATOR_HOST` estava no
 * ambiente — ou seja, o cabeçalho dizia PRODUÇÃO enquanto o SDK falava com o emulador.
 * Metadata mentindo sobre o alvo é como um backup vira restore no lugar errado.
 *
 * A regra: alvo de PRODUÇÃO com emulador configurado ABORTA. Alvo de emulador exige
 * `SP_PROJECT` explícito — nunca se cai no emulador por acidente.
 */
'use strict';

const PROD = 'scoreplace-app';

function preflight(nome, projeto) {
  const emu = process.env.FIRESTORE_EMULATOR_HOST || '';
  const alvo = emu ? ('EMULADOR ' + emu) : 'PRODUÇÃO (Firestore real)';
  console.log('▸ ' + nome);
  console.log('  projectId:              ' + projeto);
  console.log('  FIRESTORE_EMULATOR_HOST: ' + (emu || '(ausente)'));
  console.log('  alvo efetivo:           ' + alvo + '\n');

  if (projeto === PROD && emu) {
    console.error('⛔ ABORTA: o projeto é "' + PROD + '" (produção) mas FIRESTORE_EMULATOR_HOST está');
    console.error('   definido (' + emu + '). O script falaria com o EMULADOR imprimindo o nome da');
    console.error('   produção. Limpe a variável, ou use SP_PROJECT=<projeto-de-teste>.');
    process.exit(1);
  }
  if (projeto !== PROD && !emu) {
    console.warn('⚠️  projeto "' + projeto + '" não é a produção e não há emulador configurado.');
  }
  return { projeto: projeto, emulador: emu || null, producao: projeto === PROD && !emu };
}

module.exports = { preflight, PROD };
