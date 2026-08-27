/* ✕ CANÔNICO de cancelar/remover — trava de lint. node tests/cancel-x-canon.test.js
 *
 * Cânone (components.css:555 + window._cancelXBtn em store.js): o símbolo de
 * cancelar/remover é SEMPRE o círculo vermelho, anel branco, X branco = a classe
 * `.cancel-x-btn`. O comentário do cânone já dizia, por escrito:
 *   "NUNCA reintroduzir ✕ solto colorido — usar sempre esta classe ou window._cancelXBtn"
 * …e mesmo assim havia 29 ✕ soltos espalhados. Dono (17/jul): "canonizamos isso para ser
 * sempre assim". O cânone estava só no comentário/memória, SEM teste — e derivou, igual aos
 * outros 2 bugs do dia (countdown e "Jogo N").
 *
 * ESTA É A TRAVA: qualquer ✕/×/✖ CLICÁVEL novo tem que (a) usar `class="cancel-x-btn"` ou
 * (b) declarar exceção explícita com o marcador `x-canon-exempt` na própria linha, dizendo
 * o porquê. Sem isso, o gate barra o deploy.
 *
 * Exceções HOJE (4): os ✕ de FECHAR modal/overlay — semântica diferente de cancelar/remover,
 * pendente decisão do dono. Estão marcados com `x-canon-exempt` no código.
 *
 * Ver project_cancel_x_canonical, project_game_numbering_canonical (mesmo padrão de drift).
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

const ROOT = path.join(__dirname, '..', 'js');
const GLYPH = /[✕×✖]/;

function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (f) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (f.endsWith('.js')) out.push(p);
  });
  return out;
}

const files = walk(ROOT, []);
ok(files.length > 10, 'varreu os arquivos de js/ (got ' + files.length + ')');

// Um "✕ solto" = linha que renderiza um glifo ✕/×/✖ como CONTEÚDO de um elemento clicável
// (tem onclick) e NÃO usa a classe canônica nem declara exceção.
const offenders = [];
files.forEach(function (p) {
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  lines.forEach(function (line, i) {
    // ⛔ COMENTÁRIO NÃO RENDERIZA NADA — e sem esta linha o teste se acusa sozinho: a nota
    // que EXPLICA o cânone cita `onclick` e o glifo entre sinais de maior/menor, e virava
    // "infração". Regra que pune quem a documenta ensina a não documentar.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    // o glifo tem que ser conteúdo de tag: >✕<
    if (!/>\s*[✕×✖]\s*</.test(line)) return;
    // JANELA de 3 linhas (atual + 2 anteriores): o markup às vezes quebra em várias linhas
    // e o class="cancel-x-btn" fica acima do >✕< (ex.: o próprio helper _cancelXBtn).
    const win = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
    // ⛔ 2.1.17 — O `onclick` É PROCURADO NA JANELA, NÃO SÓ NA LINHA DO GLIFO.
    // Este teste exigia os dois na MESMA linha, e por isso deixou passar um ✕ solto de
    // verdade: o botão de "Desfazer amizade" em explore.js tinha o onclick numa linha e o
    // >✕< duas linhas abaixo. Ele ficou cinza com opacity 0.5 até o dono reclamar
    // ("cade o cancelar paaro aqui porra?"), com a suíte verde o tempo todo.
    // ⚠️ A janela já existia — para achar a CLASSE canônica. Procurar a classe em 3 linhas
    // e o onclick em 1 era a assimetria que abria o furo: markup quebrado escapava.
    if (win.indexOf('onclick') === -1) return;
    if (win.indexOf('cancel-x-btn') !== -1) return;        // usa o cânone ✓
    if (win.indexOf('x-canon-exempt') !== -1) return;      // exceção declarada ✓
    offenders.push(path.relative(path.join(__dirname, '..'), p) + ':' + (i + 1));
  });
});

if (offenders.length) {
  console.log('\n  ⚠️  ✕ SOLTO COLORIDO (fora do cânone) em:');
  offenders.forEach(function (o) { console.log('     - ' + o); });
  console.log('  → Use class="cancel-x-btn" (com --cx-size) ou window._cancelXBtn().');
  console.log('  → Se for FECHAR modal (não cancelar/remover), marque a linha com x-canon-exempt.');
}
ok(offenders.length === 0, '[CANON] zero ✕ solto clicável fora do cânone (got ' + offenders.length + ')');

// O cânone tem que continuar existindo (classe + helper) — se sumirem, tudo cai calado.
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');
ok(/\.cancel-x-btn\s*\{/.test(css), '[CANON] a classe .cancel-x-btn existe em components.css');
ok(/background:\s*#dc2626/.test(css), '[CANON] .cancel-x-btn é círculo VERMELHO (#dc2626)');
ok(/border:\s*2px solid #fff/.test(css), '[CANON] .cancel-x-btn tem o anel BRANCO (2px solid #fff)');
ok(/border-radius:\s*50%/.test(css), '[CANON] .cancel-x-btn é CÍRCULO (border-radius:50%)');
const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
ok(/window\._cancelXBtn\s*=/.test(store), '[CANON] o helper window._cancelXBtn existe');

// ── [NESTED-BUTTON] regressão REAL da v1.2.39 (painel de resolução explodido) ──────────
// O card de opção do painel unificado É um <button> ('<button id="unif-opt-...'). Ao aplicar
// o cânone eu troquei o ✕ de <span> pra <button> → <button> DENTRO de <button> é HTML
// INVÁLIDO: o parser fecha o de fora e o conteúdo do card (rótulo, Nash, estimativa) VAZA
// pra fora. Provado no browser: com <button> aninhado, 3 nós vazam e o rótulo sai do card;
// com <span>, 0 vazam. O <span> original era DELIBERADO.
// REGRA: dentro de um elemento clicável que já é <button>/<a>, o ✕ canônico vai num <span
// class="cancel-x-btn" role="button"> — a classe é só CSS, o visual é idêntico.
const drawPrep = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw-prep.js'), 'utf8');
const excludeX = (drawPrep.match(/topRow \+= canExclude \?[^\n]*/) || [''])[0];
ok(excludeX.indexOf('cancel-x-btn') !== -1, '[NESTED-BUTTON] o ✕ de excluir opção usa o cânone');
ok(excludeX.indexOf('<button') === -1,
  '[NESTED-BUTTON] o ✕ de excluir opção NÃO pode ser <button> — o card da opção já é <button> (aninhar explode o painel)');
ok(/<span class="cancel-x-btn"/.test(excludeX), '[NESTED-BUTTON] usa <span class="cancel-x-btn"> (visual idêntico, HTML válido)');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' cancel-x-canon: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
