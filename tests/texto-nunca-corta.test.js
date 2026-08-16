/* TEXTO NUNCA CORTA — e o encolhedor de nome não pode virar enfeite.
 *
 * POR QUE ESTE ARQUIVO EXISTE (16/ago/2026). Duas broncas do dono, no mesmo dia:
 *   "porque esta cortado o texto aqui porra? pode diminuir a porra da fonte para nao
 *    cortar quando nao consegue quebrar a linha"
 *   "se ja investimos tempo e dinheiro criando as coisas porque nao sao usadas caralho?"
 *
 * O caso: um torneio chamado "…de viniciusna1@hotmail.com" saía CORTADO no card. E o
 * app JÁ TINHA a solução — `_fitNameToBox`/`.sp-name-fit` (store.js, v1.2.30), o
 * encolhedor canônico de nome. Ele estava aplicado em 2 lugares e a própria memória do
 * projeto dizia "FALTA propagar pro resto". Coisa construída, paga, e não usada.
 *
 * AS DUAS CAUSAS TÉCNICAS, as duas travadas aqui:
 *
 * 1) `overflow-wrap: break-word` é a armadilha. Ele PERMITE quebrar a palavra, mas NÃO
 *    reduz a largura MÍNIMA (min-content) do elemento. Num flex/grid o item então não
 *    encolhe, e o texto vaza e é cortado. Quem reduz a largura mínima é `anywhere`.
 *    Como `anywhere` quebra tudo que `break-word` quebra E ainda encolhe o item, não há
 *    caso neste app onde `break-word` seja preferível — por isso ele é PROIBIDO aqui.
 *    Eram 7 ocorrências (nome de local, endereço, nome de torneio); todas trocadas.
 *
 * 2) Restauração de cor em SUPERFÍCIE INVERTIDA não pode ser presa a TAG. A regra que
 *    clareia os tons dentro da caixa da previsão era `span[style*=…]` — e a descrição,
 *    a linha de umidade/vento e "PRÓXIMOS DIAS" são <div>. Pegava metade, e a outra
 *    metade ficou escura sobre fundo escuro. O que decide é ESTAR DENTRO da caixa,
 *    nunca a tag.
 *
 * ⚠️ E a lição de método, que vale mais que as duas: eu "verifiquei" o conserto com
 * markup que EU MESMO escrevi, usando <span> — e passou. O markup real usava <div>.
 * Teste que constrói o próprio alvo não prova nada: por isso as asserções abaixo leem
 * o CÓDIGO REAL do repo.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

function arquivosJs(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules' || e.name === 'vendor') continue; arquivosJs(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const FILES = arquivosJs(path.join(ROOT, 'js'));
const JS = FILES.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const components = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');

console.log('\n== Texto nunca corta ==');

// ── 1. `overflow-wrap: break-word` é proibido ────────────────────────────────
(function () {
  const culpados = [];
  FILES.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    const linhas = src.split('\n');
    linhas.forEach((l, i) => {
      if (/overflow-wrap:\s*break-word/.test(l)) culpados.push(path.relative(ROOT, f) + ':' + (i + 1));
    });
  });
  ok(culpados.length === 0,
    '`overflow-wrap:break-word` não existe no js/ (não reduz a largura mínima → corta em flex). Achado em: ' + culpados.join(', '));
  // e o substituto tem que estar realmente em uso — senão "0 break-word" seria só
  // porque ninguém trata quebra em lugar nenhum.
  const anywhere = (JS.match(/overflow-wrap:\s*anywhere/g) || []).length;
  ok(anywhere >= 20, 'o substituto `overflow-wrap:anywhere` está em uso (' + anywhere + ' ocorrências)');
})();

// ── 2. o encolhedor canônico existe E está ligado ────────────────────────────
(function () {
  ok(/window\._fitNameToBox\s*=/.test(store), '_fitNameToBox existe (store.js)');
  ok(/window\._fitNames\s*=\s*function/.test(store), '_fitNames existe (store.js)');
  // ligado de verdade: alguém chama, e há observer pra DOM novo
  ok(/_fitNames\(/.test(store) && /MutationObserver/.test(store),
    '_fitNames é chamado e há MutationObserver — o helper não é código morto');
})();

// ── 3. quem usa `.sp-name-fit` tem que passar os limites ─────────────────────
// Sem data-maxrem/data-minrem o helper não tem teto nem piso pra iterar: a classe
// vira enfeite e o nome volta a cortar sem ninguém perceber.
(function () {
  const usos = [];
  FILES.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    // pega a tag inteira que contém a classe
    const re = /<[a-zA-Z][^>]*sp-name-fit[^>]*>/g;
    let m; while ((m = re.exec(src))) usos.push({ arq: path.relative(ROOT, f), tag: m[0] });
  });
  // CATRACA: o número só pode CRESCER. O helper foi construído na v1.2.30 e ficou em
  // 2 usos porque nada cobrava; o piso aqui impede que alguém o remova em silêncio, e
  // sobe junto quando ele for propagado pra mais telas.
  const PISO = 7;
  ok(usos.length >= PISO,
    'a classe .sp-name-fit está em uso em pelo menos ' + PISO + ' lugares (achado: ' + usos.length + ')');
  const semLimite = usos.filter(u => !/data-maxrem/.test(u.tag) || !/data-minrem/.test(u.tag))
    .map(u => u.arq);
  ok(semLimite.length === 0,
    'toda marcação .sp-name-fit traz data-maxrem E data-minrem (sem eles o helper não age): ' + semLimite.join(', '));
  // rem, nunca px — o cânone da escala por área proíbe px aqui
  const comPx = usos.filter(u => /data-(max|min)rem="[^"]*px/.test(u.tag)).map(u => u.arq);
  ok(comPx.length === 0, 'os limites são em REM, nunca px (escala por área): ' + comPx.join(', '));
})();

// ── 4. o título do card do torneio — o caso do relato ────────────────────────
(function () {
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
  // pega a TAG INTEIRA que carrega a classe (ela é multilinha) — fatiar por índice
  // pegava o `>` de um comentário logo acima e media a coisa errada.
  const mTag = dash.match(/<h4[^>]*sp-name-fit[^>]*>/);
  ok(!!mTag, 'o título do card da dashboard usa o encolhedor canônico');
  if (!mTag) return;
  const tag = mTag[0];
  ok(/min-width:\s*0/.test(tag),
    'o título tem min-width:0 — sem isso o item do flex não encolhe e o texto vaza mesmo com anywhere');
  ok(/overflow-wrap:\s*anywhere/.test(tag), 'o título quebra com `anywhere`');
})();

// ── 5. superfície invertida: restauração NÃO pode ser presa a tag ────────────
// Foi assim que metade da caixa da previsão ficou ilegível: `span[style*=…]` enquanto
// a descrição/umidade/"PRÓXIMOS DIAS" são <div>.
(function () {
  const bloco = components.slice(components.indexOf('[data-vphoto-on] .weather-box'));
  const trecho = bloco.slice(0, 2500);
  const presos = (trecho.match(/\.weather-box\s+(?:span|div|p|h[1-6])\[style/g) || []);
  ok(presos.length === 0,
    'a restauração de cor dentro da caixa da previsão NÃO restringe por tag: ' + presos.join(', '));
  ok(/\[data-vphoto-on\] \.weather-box \[style\*="#cbd5e1"\]/.test(components),
    'o tom de apoio #cbd5e1 é restaurado por seletor sem tag');
  ok(/\[data-vphoto-on\] \.weather-box \[style\*="#94a3b8"\]/.test(components),
    'o tom de apoio #94a3b8 é restaurado por seletor sem tag');
  // a caixa declara os próprios tokens invertidos — é o que resolve `var(--text-bright)`
  ok(/\[data-theme="light"\] \[data-vphoto-on\] \.weather-box\s*\{[^}]*--text-bright/.test(components),
    'a caixa da previsão declara os tokens INVERTIDOS no tema claro (resolve var(--text-bright) preto sobre tarja)');
})();

console.log('\n' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
