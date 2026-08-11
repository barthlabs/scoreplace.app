#!/usr/bin/env node
/* check-release-notes.js — TRAVA: a NOTA DE VERSÃO tem que cobrir a versão que vai subir.
 *
 * POR QUE ISTO EXISTE — e por que é uma TRAVA e não mais um lembrete:
 * já falhou TRÊS vezes, sempre do mesmo jeito.
 *   • v1.7.8   — nota esquecida; virou a "lição" escrita no CLAUDE.md.
 *   • v1.7.49  — a nota parava na 1.7.35 e a build que ia pra loja era justamente a que
 *                levava a porta de conta duplicada. Descoberto na hora de arquivar, e o
 *                número teve que subir só por causa disso.
 *   • v1.8.11  — (11/ago/2026) submetida à Apple com a nota parando na v1.7. Como o dono
 *                já tinha testado a build 25 no TestFlight, trocar por uma build 26 não
 *                testada seria pior — a versão foi pra revisão com o "Novidades" mudo.
 * Reação do dono: _"tem como vc parar de fazer merda? colocar a porra de uma trava pra não
 * fazer mais isso? não é a primeira vez."_ Ele está certo: memória não resolveu nenhuma
 * das três. Exit code 1 resolve.
 *
 * O QUE ELA EXIGE: `js/release-notes.js` (o "Novidades" DENTRO do app) precisa ter uma
 * entrada da MINOR atual. Versão 1.8.11 → tem que existir `v1.8`. É a granularidade real
 * do arquivo: ele agrupa por MINOR (v1.6, v1.7…), não por patch.
 *
 * ⚠️ ONDE ELA RODA IMPORTA MAIS QUE ELA EXISTIR. O ponto crítico não é o deploy web — é o
 * ARQUIVAMENTO nativo: depois de arquivar e subir, consertar a nota exige build nova, e
 * build nova é build NÃO TESTADA pelo dono. Por isso ela é a primeira coisa do
 * ios-archive.sh e do android-release.sh, além do predeploy do hosting.
 *
 * Uso:  node scripts/check-release-notes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const versao = (fs.readFileSync(path.join(root, 'version.txt'), 'utf8') || '').trim();
const m = versao.match(/^(\d+)\.(\d+)/);
if (!m) {
  console.error('✗ version.txt ilegível: ' + JSON.stringify(versao));
  process.exit(1);
}
const minor = m[1] + '.' + m[2];

const p = path.join(root, 'js', 'release-notes.js');
if (!fs.existsSync(p)) {
  console.error('✗ js/release-notes.js não existe — a nota de versão do app sumiu.');
  process.exit(1);
}
const src = fs.readFileSync(p, 'utf8');

// A entrada aparece como `v1.8 —` / `v1.8 -` / `v1.8<` no HTML da nota.
const tem = new RegExp('v' + minor.replace('.', '\\.') + '(?![0-9])').test(src);
// ─── PARTE 2 · A NOTA NÃO PODE ESTAR ATRASADA EM RELAÇÃO AO CÓDIGO ───────────
// A parte 1 garante que a nota EXISTE. Não garante que está COMPLETA — e foi isso que
// falhou em 11/ago/2026: a nota da v1.8 foi escrita, passou verde, e mesmo assim omitia
// entregas e afirmava coisa errada. Reação do dono: "que merda de trava é essa que não
// trava nada?" (e ele estava certo duas vezes: na 1ª versão desta parte 2 eu a colei
// DEPOIS do process.exit — código morto, que nunca rodou).
//
// ⚠️ LIMITE HONESTO: nenhum script julga se um texto descreve certo o que o código faz —
// isso é leitura. O que DÁ pra travar é OMISSÃO: entregou código depois da última vez que
// escreveu a nota. É o caso comum, e é determinístico.
function checarAtraso() {
  const { execFileSync } = require('child_process');
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) { return ''; }
  };
  const ultimoDaNota = git(['log', '-1', '--format=%H', '--', 'js/release-notes.js']);
  if (!ultimoDaNota) return;   // sem git/histórico → só a parte 1 vale
  const depois = git(['log', ultimoDaNota + '..HEAD', '--format=%h|%s', '--',
    'js/', 'css/', 'index.html', ':!js/release-notes.js'])
    .split('\n').filter(Boolean);
  if (!depois.length) return;
  console.error('');
  console.error('✗ A NOTA ESTÁ ATRASADA — ' + depois.length + ' entrega(s) de código depois da última vez que ela foi escrita:');
  console.error('');
  depois.slice(0, 12).forEach((l) => {
    const [h, ...r] = l.split('|');
    console.error('  • ' + h + '  ' + r.join('|').slice(0, 100));
  });
  if (depois.length > 12) console.error('  … e mais ' + (depois.length - 12));
  console.error('');
  console.error('  Confira se cada uma aparece na nota da v' + minor + ' — e se o que está');
  console.error('  escrito é VERDADE. Esta trava pega OMISSÃO; ela não sabe julgar se o texto');
  console.error('  descreve certo o que o código faz. Isso já passou batido: a nota da v1.8');
  console.error('  dizia "nada é unido sozinho" quando o app funde sozinho com credencial');
  console.error('  autenticada.');
  console.error('');
  console.error('  Se a nota JÁ contempla tudo, toque-a no mesmo commit do código.');
  console.error('');
  process.exit(1);
}

if (tem) {
  checarAtraso();
  console.log('✓ nota de versão cobre a v' + minor + ' e está em dia com o código (app em ' + versao + ')');
  process.exit(0);
}

// Mostra até onde a nota vai, pra dizer o que falta — não só que falta.
const achadas = Array.from(new Set((src.match(/v\d+\.\d+(?![0-9])/g) || [])))
  .map((x) => x.slice(1))
  .sort((a, b) => {
    const A = a.split('.').map(Number), B = b.split('.').map(Number);
    return (A[0] - B[0]) || (A[1] - B[1]);
  });

console.error('');
console.error('✗ A NOTA DE VERSÃO NÃO COBRE A v' + minor + ' — e o app vai subir em ' + versao + '.');
console.error('');
console.error('  Quem instalar abre "Novidades" e NÃO acha a versão que está usando.');
console.error('  Já aconteceu 3x (1.7.8, 1.7.49, 1.8.11). Na 1.8.11 a versão foi pra revisão');
console.error('  da Apple com o "Novidades" mudo, porque consertar exigiria uma build nova —');
console.error('  e build nova é build que o dono NÃO testou no TestFlight.');
console.error('');
console.error('  A nota hoje vai até: v' + (achadas[achadas.length - 1] || '?') +
  '   (tem: ' + achadas.map((x) => 'v' + x).join(', ') + ')');
console.error('');
console.error('  O QUE FAZER: abra js/release-notes.js e acrescente a entrada da v' + minor + ',');
console.error('  no mesmo formato das outras — `v' + minor + ' — <o que mudou pro usuário>`.');
console.error('  Escreva ANTES de arquivar: depois de subir pra loja não dá pra corrigir sem');
console.error('  gerar outra build.');
console.error('');
process.exit(1);
