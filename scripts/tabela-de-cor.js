/* A TABELA DE COR — lê as regras `[style*=]` do css/style.css e devolve, por escrito,
 * qual token cada cor vira e o que cada tema faz com ele.
 *
 * POR QUE ISTO EXISTE: as ~1.936 regras `[style*="..."]` são casamento de SUBSTRING de
 * atributo — o pior caso do seletor CSS, porque derrota toda otimização do navegador.
 * MEDIDO no WebKit, mesma tela de 5.482 elementos: CSS completo 506ms × CSS mínimo 12ms;
 * removendo só essas regras, 486ms → 23ms. O custo é LINEAR no número de regras.
 * Uma variável CSS resolve por HERANÇA — custo zero de casamento.
 *
 * ⛔ A tabela é derivada das REGRAS, nunca inventada: cada destino aqui é o que o tema
 * claro já faz hoje. Inventar um tom "parecido" muda a tela, e a régua é pixel idêntico.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function partirSeletores(s) {
  const out = []; let cur = '', par = 0, asp = null;
  for (const ch of s) {
    if (asp) { cur += ch; if (ch === asp) asp = null; continue; }
    if (ch === '"' || ch === "'") { asp = ch; cur += ch; continue; }
    if (ch === '(') par++; if (ch === ')') par--;
    if (ch === ',' && par === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ATTR = /\[style[*^$]="([^"]*)"\]/;

/* Cada regra vira {tema, literal, escopo, sufixo, corpo}. O `literal` é a STRING EXATA
 * que o seletor exige na inline style — é ela que diz o que a regra de fato pegava.
 * Ler o literal em vez de supor "toda declaração de cor" é o que impede a migração de
 * recolorir coisa que hoje NÃO é recolorida (ex.: `border-color:#x`, que as grafias
 * `;color:` / ` color:` / `^color:` existem justamente pra não pegar). */
function lerRegras(cssTexto) {
  // ⛔ comentário fora primeiro: sem isso o texto de um comentário entra no seletor do
  // bloco seguinte e vira "escopo" — foi o que fez 6 regras normais parecerem escopadas.
  cssTexto = cssTexto.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocos = [...cssTexto.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((b) => /\[style[*^$]=/.test(b[1]));
  const regras = [];
  blocos.forEach((b) => {
    const corpo = b[2].trim();
    partirSeletores(b[1]).forEach((sel) => {
      const todos = sel.match(/\[style[*^$]="[^"]*"\]/g) || [];
      const m = sel.match(ATTR);
      if (!m) return;
      const tema = (sel.match(/\[data-theme="([^"]+)"\]/) || [])[1] || '*';
      let sufixo = sel.slice(sel.indexOf(m[0]) + m[0].length).trim();
      sufixo = sufixo.replace(/\[style[*^$]="[^"]*"\]/g, '').trim();
      const escopo = sel.slice(0, sel.indexOf(m[0])).replace(/\[data-theme="[^"]+"\]/, '').trim();
      // ⚠️ um seletor pode ter DOIS [style*=]: o de fora é o CONTEXTO (a tarja) e o de
      // dentro é a cor que ele devolve. Ler só o primeiro perdia justamente a informação
      // que a linha única precisa reproduzir.
      const atributos = todos.map((a) => a.replace(/^\[style[*^$]="|"\]$/g, ''));
      regras.push({ tema, literal: m[1], escopo, sufixo, corpo, sel, atributos });
    });
  });
  return regras;
}

/* Nome do token a partir da cor. MECÂNICO de propósito: um nome "semântico" que eu
 * invente pra 190 cores erra o significado em algumas e vira mentira no código. O
 * fallback carrega o literal, então o valor original fica legível no ponto de uso. */
function nomeToken(cor) {
  const hex = cor.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) return '--sp-c-' + hex[1].toLowerCase();
  const rgb = cor.match(/^rgba?\(([^)]*)\)$/);
  if (rgb) {
    const p = rgb[1].split(',').map((x) => x.trim().replace(/^0\./, '').replace(/\./g, ''));
    return '--sp-c-' + p.join('-');
  }
  return '--sp-c-' + cor.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

/* A propriedade que ancora o literal (ou null quando a regra casa a cor NUA, em
 * qualquer lugar da inline style — o caso da tarja de leitura). */
function propDoLiteral(lit) {
  const m = lit.match(/^[;\s]*([a-z-]+)\s*:\s*/);
  return m ? m[1] : null;
}
function corDoLiteral(lit) {
  return lit.replace(/^[;\s]*/, '').replace(/^[a-z-]+:\s*/, '').replace(/^solid\s+/, '').trim();
}

function montar(cssTexto) {
  const regras = lerRegras(cssTexto);
  // ⭐ A TARJA DE LEITURA não é "recolorir": é o contrário. Ela é escura NOS DOIS temas
  // (fica sobre foto), então dentro dela o tema claro tem que DESLIGAR o remap e devolver
  // a cor do tema escuro. Hoje isso custa 946 regras — uma por cor × 12 grafias. Com
  // token vira UMA: a tarja redeclara a paleta escura, e a herança faz o resto.
  const TARJAS = ['rgba(30,41,59,0.85)', 'rgba(0,0,0,0.60)'];
  const ancoradas = new Map();   // "prop|cor" -> {prop, cor, temas:{}}
  const nuas = new Map();        // cor -> {temas:{}}
  const escopadas = [];          // as que valem só dentro de um container
  const comSufixo = [];          // as que recolorem descendente
  const daTarja = [];            // as que DEVOLVEM a cor escura dentro da tarja

  regras.forEach((r) => {
    const cor = corDoLiteral(r.literal);
    if (TARJAS.indexOf(r.escopo.replace(/^\[style[*^$]="|"\]$/g, '')) !== -1 ||
        TARJAS.indexOf(cor) !== -1) { daTarja.push(r); return; }
    const prop = propDoLiteral(r.literal);
    const alvo = (r.corpo.match(/:\s*([^;!]+)/) || [])[1];
    const val = String(alvo || '').trim();
    if (r.sufixo) { comSufixo.push(r); return; }
    if (r.escopo) { escopadas.push({ escopo: r.escopo, tema: r.tema, cor, prop, val, corpo: r.corpo }); return; }
    if (prop) {
      const k = prop + '|' + cor;
      if (!ancoradas.has(k)) ancoradas.set(k, { prop, cor, temas: {} });
      (ancoradas.get(k).temas[r.tema] = ancoradas.get(k).temas[r.tema] || new Set()).add(val);
    } else {
      if (!nuas.has(cor)) nuas.set(cor, { cor, temas: {} });
      (nuas.get(cor).temas[r.tema] = nuas.get(cor).temas[r.tema] || new Set()).add(val);
    }
  });
  /* ⛔ A GRAFIA EXATA que cada regra exigia. É ela que decide se uma declaração era
   * remapeada — não a cor. MEDIDO: `background: #fbbf24` NUNCA foi remapeado (as regras de
   * `background` só existiam com `rgb()`, nunca com hex), e casar por cor canônica
   * remapeava — 282 elementos da tela inicial mudaram de cor por causa disso.
   * `semEspaco` é o subconjunto sem espaço depois dos dois-pontos: é a grafia que a
   * concatenação (`'color:' + cor`) produz, e a única que o caminho dinâmico pode assumir. */
  const literaisExatos = new Set();
  const semEspaco = new Map();
  regras.forEach((r) => {
    if (r.sufixo) return;
    const lit = r.literal.replace(/^[;\s]+/, '');
    literaisExatos.add(lit);
    const m = lit.match(/^([a-z-]+):([^\s].*)$/);
    if (m) semEspaco.set(m[1] + '|' + m[2].trim().toLowerCase().replace(/\s+/g, ''), m[1]);
  });
  return { regras, ancoradas, nuas, escopadas, comSufixo, daTarja, TARJAS, literaisExatos, semEspaco };
}

module.exports = { lerRegras, montar, nomeToken, propDoLiteral, corDoLiteral, partirSeletores };

if (require.main === module) {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const r = montar(css);
  console.log('regras lidas: ' + r.regras.length);
  console.log('ancoradas em propriedade: ' + r.ancoradas.size + ' pares (prop, cor)');
  console.log('cor NUA (casa em qualquer lugar): ' + r.nuas.size + ' -> ' + [...r.nuas.keys()].join(', '));
  console.log('escopadas a um container: ' + r.escopadas.length);
  r.escopadas.forEach((e) => console.log('     [' + e.tema + '] ' + e.escopo + '  ' + (e.prop || '(nua)') + ':' + e.cor + ' -> ' + e.val));
  console.log('da TARJA (devolvem a cor escura): ' + r.daTarja.length);
  console.log('que recolorem descendente: ' + r.comSufixo.length);
  const props = {};
  [...r.ancoradas.values()].forEach((e) => props[e.prop] = (props[e.prop] || 0) + 1);
  console.log('por propriedade ancorada: ' + JSON.stringify(props));
  const cores = new Set([...r.ancoradas.values()].map((e) => e.cor));
  console.log('cores distintas ancoradas: ' + cores.size);
  const ambiguos = [...r.ancoradas.values()].filter((e) => Object.values(e.temas).some((s) => s.size > 1));
  console.log('destinos ambiguos: ' + ambiguos.length);
  ambiguos.forEach((e) => console.log('   ' + e.prop + ':' + e.cor + ' -> ' +
    Object.entries(e.temas).map(([t, s]) => t + '=' + [...s].join('/')).join('  ')));
}
