#!/usr/bin/env node
/* TRAVA: `firestore.rules` mudou e a suíte de REGRAS não rodou depois disso.
 *
 * ⛔ POR QUE EXISTE. MEDIDO em 13/set/2026: das 9 suítes de `npm run test:rules`, **4
 * estavam VERMELHAS** — e havia tempo. Ninguém viu porque `test:rules` sobe 10 emuladores
 * (~7 min) e por isso NÃO está no `npm test`. Suíte que não roda apodrece: as quatro
 * quebraram quando a regra de `create` de torneio mudou (leva L7) e ficaram
 * assim, silenciosamente, guardando nada.
 *
 * ⛔ E PÔR AS 10 NO `npm test` É PIOR: acrescenta ~7 min a CADA rodada, e o dono já reclamou
 * dos 20 minutos de publicação. A trava certa não é rodar sempre — é não deixar a regra
 * mudar sem que alguém rode.
 *
 * ⭐ COMO: `test:rules` carimba o SHA do `firestore.rules` quando passa. Esta trava compara
 * o carimbo com o arquivo de hoje. Rules igual ao testado → passa em milissegundos.
 * Rules diferente → reprova dizendo o comando.
 *
 * ⚠️ O carimbo é versionado (`.rules-testadas`), não fica no TMPDIR: quem publica pode não
 * ser quem rodou a suíte, e o que interessa é que ALGUÉM tenha rodado NESTAS regras.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const RULES = path.join(RAIZ, 'firestore.rules');
const CARIMBO = path.join(RAIZ, '.rules-testadas');

const sha = crypto.createHash('sha256').update(fs.readFileSync(RULES)).digest('hex').slice(0, 16);

if (process.argv.includes('--carimbar')) {
  fs.writeFileSync(CARIMBO, sha + '\n');
  console.log('✓ carimbado: as regras ' + sha + ' passaram na suíte');
  process.exit(0);
}

let gravado = null;
try { gravado = fs.readFileSync(CARIMBO, 'utf8').trim(); } catch (e) {}

if (gravado === sha) {
  console.log('✓ regras testadas (' + sha + ') — a suíte de rules rodou sobre estas regras');
  process.exit(0);
}

console.error('');
console.error('✗ `firestore.rules` MUDOU e a suíte de regras não rodou sobre esta versão.');
console.error('');
console.error('  no arquivo: ' + sha + '        testado: ' + (gravado || '(nunca)'));
console.error('');
console.error('  RODE:  npm run test:rules');
console.error('');
console.error('  ⛔ Não é burocracia: em 13/set/2026, 4 das 9 suítes de regras estavam');
console.error('     vermelhas há tempo, porque ninguém as roda — elas sobem 10 emuladores e');
console.error('     por isso ficam fora do `npm test`. Regra é a ÚNICA fronteira que vale');
console.error('     para cliente antigo; mudar regra sem rodar a suíte é mudar no escuro.');
process.exit(1);
