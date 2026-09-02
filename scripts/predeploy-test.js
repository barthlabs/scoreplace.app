#!/usr/bin/env node
/* ═══ A SUÍTE DO PREDEPLOY — UMA VEZ POR COMMIT, NÃO DUAS ═════════════════════════════
 *
 * Ordem do dono (02/set/2026), sobre o tempo de publicação: _"faça o corte"_.
 *
 * O QUE ERA, E QUANTO CUSTAVA (medido no mesmo dia, mesma máquina):
 *   · `scripts/deploy-hosting.sh` roda um PREFLIGHT: extrai o commit com `git archive`
 *     numa cópia limpa e executa ali a MESMA lista do `hosting.predeploy`, inclusive
 *     `npm test` — para que nada toque o `main` sem ter passado em tudo.
 *   · Em seguida o `firebase deploy` dispara o `hosting.predeploy`, que roda `npm test`
 *     OUTRA VEZ, sobre o mesmo commit.
 *   Com a suíte em série eram ~7min + ~7min; com o runner paralelo, ~5min20 + ~5min20.
 *   A segunda rodada nunca reprovou nada que a primeira não tivesse reprovado: ela é a
 *   MESMA lista, sobre o MESMO conteúdo.
 *
 * ⛔ POR QUE ISTO É DELICADO: o `hosting.predeploy` é o ÚLTIMO portão antes de subir byte.
 * Um atalho mal feito aqui não falha na hora — falha depois, com algo errado já no ar. Por
 * isso o corte é FECHADO POR PADRÃO: só se pula a suíte quando dá para provar que ela já
 * rodou sobre EXATAMENTE este conteúdo. Qualquer dúvida, roda.
 *
 * AS TRÊS CONDIÇÕES (todas, juntas):
 *   ① `SP_PREFLIGHT_OK` existe e é igual ao SHA de `HEAD` — o preflight exporta o SHA que
 *      ele aprovou; quem roda `firebase deploy` na mão não tem a variável e a suíte roda.
 *   ② a árvore está LIMPA — senão o que vai subir não é o commit que foi provado.
 *   ③ o `git` responde. Sem git não há como comparar nada, então roda.
 *
 * ⚠️ NÃO existe variável de "pular sempre". A única forma de pular é ter passado pelo
 * preflight, nesta mesma execução, com este mesmo commit. É de propósito: uma chave de
 * conveniência viraria a chave que alguém usa com pressa no dia errado.
 */
'use strict';
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const g = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function rodaSuite(motivo) {
  console.log('▸ predeploy: rodando a suíte (' + motivo + ')');
  const r = spawnSync('npm', ['test'], { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status === 0 ? 0 : (r.status || 1));
}

let head = '', sujo = '';
try {
  head = g('git rev-parse HEAD');
  sujo = g('git status --porcelain');
} catch (e) {
  rodaSuite('sem git — não dá para provar o que já foi testado');
}

const carimbo = String(process.env.SP_PREFLIGHT_OK || '').trim();

if (!carimbo) rodaSuite('sem carimbo do preflight');
if (carimbo !== head) {
  rodaSuite('o carimbo é de outro commit (' + carimbo.slice(0, 8) + ' ≠ ' + head.slice(0, 8) + ')');
}
if (sujo) rodaSuite('árvore SUJA — o que subiria não é o commit provado');

console.log('▸ predeploy: suíte PULADA — o preflight já a rodou sobre ' + head.slice(0, 8) +
            ', com a árvore limpa, nesta mesma publicação.');
console.log('  (o preflight roda a MESMA lista, numa cópia `git archive` deste commit)');
process.exit(0);
