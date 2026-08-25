/* A COR VIVE NA TABELA, NÃO NO SELETOR (2.0.94)
 * node tests/cor-vive-na-tabela-nao-no-seletor.test.js
 *
 * O tema claro remapeava contraste com ~1.943 regras `[style*="cor"]` — casamento de
 * SUBSTRING DE ATRIBUTO, o pior caso do seletor CSS: nenhum índice do navegador (tag,
 * classe, id) filtra antes, então cada regra é testada contra cada elemento, e o custo é
 * LINEAR no número delas. Eram 29% de todo o CSS do app.
 *
 * MEDIDO no WebKit, mesma tela de 5.117 elementos (scripts/medir-custo-css.js):
 *     antes  1.194 ms de recálculo de estilo   ·   depois  18 ms
 * O remap agora é uma tabela de variáveis (css/paleta.css), resolvida por HERANÇA.
 *
 * Este teste trava as três coisas que fazem o desenho valer:
 *   ① a paleta existe, está ligada no index.html e vem ANTES das outras folhas;
 *   ② o CSS não voltou a ganhar regra de atributo pra cor;
 *   ③ a tarja de leitura continua tendo como devolver a paleta escura.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const paleta = path.join(ROOT, 'css', 'paleta.css');
ok(fs.existsSync(paleta), 'falta css/paleta.css (a tabela de cor)');
const P = fs.readFileSync(paleta, 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ① ligada, e ANTES das outras folhas — variável tem que existir antes de quem a usa
ok(/href="css\/paleta\.css/.test(idx), 'a paleta não está ligada no index.html');
const posPaleta = idx.indexOf('css/paleta.css');
const posStyle = idx.indexOf('css/style.css');
ok(posPaleta !== -1 && posStyle !== -1 && posPaleta < posStyle,
  'a paleta tem que vir ANTES de css/style.css');

// a tabela tem substância: os três blocos que fazem o trabalho
ok(/:root\s*\{/.test(P), 'a paleta não define a base em :root (o valor do tema escuro)');
ok(/\[data-theme="light"\]\s*\{/.test(P), 'a paleta não redefine nada no tema claro');
const tokens = (P.match(/--sp-[a-z]-[a-z0-9-]+\s*:/g) || []).length;
ok(tokens > 150, 'a paleta parece vazia: só ' + tokens + ' declarações de token');

// ② o CSS não pode voltar a remapear cor por seletor de atributo
const CSS = ['style.css', 'components.css', 'layout.css', 'bracket.css', 'responsive.css', 'trophies.css']
  .filter((f) => fs.existsSync(path.join(ROOT, 'css', f)))
  .map((f) => ({ nome: f, txt: fs.readFileSync(path.join(ROOT, 'css', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));
const attrCor = [];
CSS.forEach((f) => {
  (f.txt.match(/\[style[*^$]="[^"]*"\]/g) || []).forEach((sel) => {
    // remap de COR é o que saiu; `[style*="linear-gradient"]` e afins são outra família
    if (/#[0-9a-fA-F]{3,8}|rgba?\(/.test(sel)) attrCor.push(f.nome + ' ' + sel);
  });
});
ok(attrCor.length <= 14, 'voltaram regras de atributo pra COR no CSS: ' + attrCor.length +
  ' (as 12 do .weather-box são as únicas toleradas)\n      ex.: ' + attrCor.slice(0, 3).join(' | '));

// style.css era 3.009 linhas quase só disso — não pode voltar a inchar
const linhas = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8').split('\n').length;
ok(linhas < 1200, 'css/style.css voltou a inchar: ' + linhas + ' linhas (era 670 depois da poda)');

// ③ a tarja: a linha única que devolve a paleta escura, e o marcador que ela procura
ok(/\[style\*="--sp-tarja"\]/.test(P), 'a paleta não tem a linha que devolve a cor escura dentro da tarja');
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
ok(/--sp-tarja/.test(store),
  'a tarja não carrega mais o marcador `--sp-tarja` — sem ele a linha da paleta não casa ' +
  'e o texto fica escuro sobre tarja escura (regressão de contraste já paga uma vez)');

// a fonte congelada, que é de onde a paleta é derivada — sem ela não dá pra regerar nem auditar
ok(fs.existsSync(path.join(ROOT, 'scripts', 'regras-de-cor-originais.css')),
  'sumiu scripts/regras-de-cor-originais.css: é a prova de que nenhum tom foi inventado');

// as inline styles de fato leem a tabela
const bracket = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
ok((bracket.match(/var\(--sp-[cb]-/g) || []).length > 20,
  'js/views/bracket.js quase não usa a tabela — a migração das inline styles não pegou');

console.log((fail ? '✗' : '✓') + ' cor-vive-na-tabela-nao-no-seletor: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
