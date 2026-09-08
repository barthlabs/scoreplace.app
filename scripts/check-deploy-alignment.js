#!/usr/bin/env node
/* check-deploy-alignment.js — TRAVA: não se publica uma árvore local não verificável.
 *
 * POR QUE EXISTE (12/ago/2026). Produção ficou em 1.8.27 enquanto `origin/main` estava em
 * 1.8.24 — 5 commits atrás. Ninguém errou um comando: o desalinhamento é o COMPORTAMENTO
 * PADRÃO do fluxo. Cada sessão trabalha num branch/worktree próprio, o deploy sai de
 * `git archive HEAD` do lugar onde ela está, e publicar NÃO exige ter empurrado pro main.
 * O resultado é uma armadilha silenciosa e grave: a próxima leva publicada a partir do
 * `main` REBAIXA a produção, tirando do ar versões que já estavam servindo gente.
 *
 * Ordem do dono: _"porra as coisas precisam estar alinhadas caralho! quando mudamos uma
 * coisa ela nao pode causar esse desalinhamento. apenas as versoes da loja ficam
 * desalinhadas por um curto periodo de tempo por logistica apenas."_
 *
 * O GitHub é backup, não a rota de produção. A prova para Hosting é a árvore limpa e a
 * suíte integral do próprio predeploy; o backup pode acontecer depois sem bloquear uma
 * correção urgente no Firebase.
 *
 * ⚠️ POR QUE A TRAVA TEM DOIS RAMOS. O deploy documentado roda de uma cópia extraída com
 * `git archive` em /tmp — e essa cópia NÃO TEM `.git`. Uma trava que só soubesse consultar
 * o git passaria batida justamente no caminho recomendado. Então:
 *
 *   • TEM `.git`  → confere de verdade: árvore limpa e HEAD contido em `origin/main`.
 *   • NÃO tem     → exige o CARIMBO (`.deploy-alignment.json`) que o
 *                   `scripts/deploy-hosting.sh` escreve DEPOIS de fazer essas conferências
 *                   no repo de verdade. Sem carimbo não passa — é isso que impede um
 *                   `firebase deploy` solto de dentro de um /tmp qualquer.
 *
 * O carimbo tem que casar com o `version.txt` que está sendo publicado: assim ele não pode
 * ser reaproveitado de uma extração anterior (que é como se publicaria versão velha
 * carregando um carimbo válido).
 *
 * Uso: node scripts/check-deploy-alignment.js
 *      SP_SKIP_ALIGNMENT=1 pula — SÓ pra emergência declarada, e o motivo vai no console.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const raiz = path.resolve(__dirname, '..');
const versao = (fs.readFileSync(path.join(raiz, 'version.txt'), 'utf8') || '').trim();

function morre(msg, comoFazer) {
  console.error('\n✗ DEPLOY BLOQUEADO — a árvore local não é verificável.\n');
  console.error('  ' + msg + '\n');
  if (comoFazer) console.error('  O QUE FAZER:\n' + comoFazer + '\n');
  console.error('  POR QUÊ: o Hosting só pode receber uma árvore limpa, cuja suíte e versão');
  console.error('  possam ser verificadas nesta mesma publicação.\n');
  process.exit(1);
}

if (process.env.SP_SKIP_ALIGNMENT === '1') {
  console.log('⚠️  check-deploy-alignment PULADO por SP_SKIP_ALIGNMENT=1 (emergência declarada).');
  console.log('   O main vai ficar atrás do ar até alguém alinhar na mão. Anote no commit.');
  process.exit(0);
}

const temGit = fs.existsSync(path.join(raiz, '.git'));

// ─────────────────────────────────────────────────────────────────────────────
// RAMO 1 — dá pra perguntar ao git: pergunta.
// ─────────────────────────────────────────────────────────────────────────────
if (temGit) {
  const git = (args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

  let sujo = '';
  try { sujo = git(['status', '--porcelain']); } catch (e) {
    morre('não consegui rodar o git aqui: ' + e.message,
          '  conserte o repositório antes de publicar (o .git no Drive corrompe — reparar, nunca re-clonar).');
  }
  if (sujo) {
    morre('a árvore tem alteração não commitada — o que subiria não é o que está no git:\n\n' +
          sujo.split('\n').slice(0, 12).map((l) => '    ' + l).join('\n'),
          '  commite (ou guarde) e publique de novo.');
  }

  const head = git(['rev-parse', 'HEAD']);
  console.log('✓ alinhamento local ok — HEAD (' + head.slice(0, 8) + ', v' + versao + ') está limpo e identificável');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// RAMO 2 — cópia extraída (sem .git): só passa com o carimbo do script.
// ─────────────────────────────────────────────────────────────────────────────
const carimboP = path.join(raiz, '.deploy-alignment.json');
if (!fs.existsSync(carimboP)) {
  morre('esta é uma cópia sem `.git` e sem carimbo de alinhamento — não tenho como saber ' +
        'de qual commit ela saiu.',
        '  não rode `firebase deploy` direto numa extração. Use:\n' +
        '      scripts/deploy-hosting.sh\n' +
        '  Ele confere main + árvore limpa NO REPO, escreve o carimbo e então publica.');
}
let carimbo = null;
try { carimbo = JSON.parse(fs.readFileSync(carimboP, 'utf8')); } catch (e) {
  morre('o carimbo de alinhamento está ilegível: ' + e.message, '  regere com scripts/deploy-hosting.sh');
}
if (!carimbo || carimbo.alinhado !== true || !carimbo.commit) {
  morre('o carimbo existe mas não declara alinhamento: ' + JSON.stringify(carimbo).slice(0, 160),
        '  regere com scripts/deploy-hosting.sh');
}
// o carimbo é DESTA extração, não de uma anterior — senão publicaria-se versão velha com
// carimbo válido de outra leva.
if (String(carimbo.versao || '') !== versao) {
  morre('o carimbo é de outra versão (carimbo: v' + carimbo.versao + ' · esta cópia: v' + versao + ').',
        '  extraia de novo e publique com scripts/deploy-hosting.sh');
}
console.log('✓ alinhamento ok — carimbo de ' + String(carimbo.commit).slice(0, 8) + ' (v' + versao + '), ' +
            'conferido contra origin/main em ' + (carimbo.em || '?'));
