/* Remove de css/style.css os blocos cujo seletor casa `[style*=...]` / `[style^=...]`.
 * A tabela de cor (css/paleta.css) já faz o mesmo trabalho por herança.
 *
 * ⛔ Remove o BLOCO, não a faixa de linhas: dentro do mesmo trecho moram regras normais
 * (`.sp-ritmo`, entre outras) que precisam ficar. Apagar por intervalo levaria elas junto.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ARQ = path.join(ROOT, 'css', 'style.css');

const src = fs.readFileSync(ARQ, 'utf8');
let out = '', i = 0, tirados = 0, mantidos = 0;
const re = /([^{}]*)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(src))) {
  const antes = src.slice(i, m.index);
  const sel = m[1];
  if (/\[style[*^$]=/.test(sel)) {
    // some com o bloco E com o comentário/linha em branco que vinha colado nele
    out += antes.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/\s*$/, '');
    tirados++;
  } else {
    out += antes + m[0];
    mantidos++;
  }
  i = m.index + m[0].length;
}
out += src.slice(i);
out = out.replace(/\n{3,}/g, '\n\n');

const marca = '\n/* ⛔ AS ~1.943 REGRAS `[style*="..."]` SAÍRAM DAQUI (2.0.94) ─────────────────────\n' +
  ' * Elas remapeavam a cor do tema claro casando SUBSTRING do atributo `style`. MEDIDO no\n' +
  ' * WebKit, mesma tela de 5.482 elementos: com elas o casamento de seletor custava 486ms;\n' +
  ' * sem elas, 23ms. O custo era linear no número delas — e eram 29% de TODO o CSS do app.\n' +
  ' * O mesmo remap agora vive em css/paleta.css, como tabela de variáveis, resolvido por\n' +
  ' * herança (custo zero de casamento). Gerado por scripts/gerar-paleta.js; as inline\n' +
  ' * styles foram migradas por scripts/migrar-cores.js.\n' +
  ' * ⛔ Não reintroduza seletor de atributo pra cor: é exatamente o que foi removido. */\n';


/* O RITMO DA RODADA passa a ler a tabela. Ele tinha destino PRÓPRIO no tema claro
 * (#047857) — diferente do que a inline style usa pra mesma cor (#065f46) — e a exceção
 * dentro da tarja vinha em 12 regras de atributo que a poda acabou de levar. Token
 * próprio preserva os dois tons e a exceção vira uma linha na paleta. */
const RITMO_ANTES = `.sp-ritmo.sp-ritmo-emdia, .sp-ritmo.sp-ritmo-emdia * { color: #34d399; }
.sp-ritmo.sp-ritmo-apertando,     .sp-ritmo.sp-ritmo-apertando *     { color: #fbbf24; }
.sp-ritmo.sp-ritmo-atrasado,  .sp-ritmo.sp-ritmo-atrasado *  { color: #f87171; }
[data-theme="light"] .sp-ritmo.sp-ritmo-emdia, [data-theme="light"] .sp-ritmo.sp-ritmo-emdia * { color: #047857; }
[data-theme="light"] .sp-ritmo.sp-ritmo-apertando,     [data-theme="light"] .sp-ritmo.sp-ritmo-apertando *     { color: #b45309; }
[data-theme="light"] .sp-ritmo.sp-ritmo-atrasado,  [data-theme="light"] .sp-ritmo.sp-ritmo-atrasado *  { color: #b91c1c; }`;
const RITMO_DEPOIS = `/* ⭐ 2.0.94 — o estado do ritmo lê a TABELA DE COR (css/paleta.css). A classe DUPLA
 * continua de propósito: é ela que dá (0,3,0) contra o <style> de (0,2,0). */
.sp-ritmo.sp-ritmo-emdia, .sp-ritmo.sp-ritmo-emdia * { color: var(--sp-ritmo-emdia, #34d399); }
.sp-ritmo.sp-ritmo-apertando, .sp-ritmo.sp-ritmo-apertando * { color: var(--sp-ritmo-apertando, #fbbf24); }
.sp-ritmo.sp-ritmo-atrasado, .sp-ritmo.sp-ritmo-atrasado * { color: var(--sp-ritmo-atrasado, #f87171); }`;
if (out.indexOf(RITMO_ANTES) !== -1) { out = out.replace(RITMO_ANTES, RITMO_DEPOIS); console.log('sp-ritmo: migrado pra token'); }
else console.log('⚠️ sp-ritmo: bloco nao encontrado (ja migrado?)');

fs.writeFileSync(ARQ, out + marca);

/* Liga a paleta no index.html — ANTES das outras folhas: variável tem que existir antes
 * de quem a usa. */
const IDX = path.join(ROOT, 'index.html');
let idx = fs.readFileSync(IDX, 'utf8');
if (idx.indexOf('css/paleta.css') === -1) {
  const anc = idx.match(/^\s*<link rel="stylesheet" href="css\/style\.css[^>]*>/m);
  if (anc) {
    idx = idx.replace(anc[0],
      '  <!-- ⭐ A TABELA DE COR vem ANTES de tudo: ela só define variáveis. Substitui ~1.943\n' +
      '       regras `[style*=]` (29% do CSS) que custavam 486ms de casamento de seletor numa\n' +
      '       tela de 5.482 elementos — 23ms sem elas. Gerada por scripts/gerar-paleta.js. -->\n' +
      '  <link rel="stylesheet" href="css/paleta.css?v=2.0.94">\n' + anc[0]);
    fs.writeFileSync(IDX, idx);
    console.log('index.html: paleta ligada');
  } else console.log('⚠️ index.html: nao achei onde ligar a paleta');
} else console.log('index.html: paleta ja estava ligada');

/* E o lado DINÂMICO da tabela, como PRIMEIRO script do app: as views chamam `_spCor()`
 * ao montar inline style. Sem `defer` e antes de todos — quem desenha já precisa dele. */
idx = fs.readFileSync(IDX, 'utf8');
if (idx.indexOf('js/paleta-tabela.js') === -1) {
  const anc2 = idx.match(/^\s*<script src="js\/store\.js[^>]*><\/script>/m);
  if (anc2) {
    idx = idx.replace(anc2[0],
      '  <!-- ⭐ TABELA DE COR, lado dinâmico: traduz `cor -> var(--token, cor)` quando a cor\n' +
      '       chega por variável (`\'color:\' + cor`). Tem que vir ANTES de quem desenha. -->\n' +
      '  <script src="js/paleta-tabela.js?v=2.0.94"></script>\n' + anc2[0]);
    fs.writeFileSync(IDX, idx);
    console.log('index.html: paleta-tabela.js ligado');
  } else console.log('⚠️ index.html: nao achei onde ligar o paleta-tabela.js');
} else console.log('index.html: paleta-tabela.js ja estava ligado');
console.log('blocos removidos: ' + tirados);
console.log('blocos mantidos:  ' + mantidos);
console.log('linhas: ' + src.split('\n').length + ' -> ' + (out + marca).split('\n').length);
