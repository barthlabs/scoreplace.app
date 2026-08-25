/* GERA css/paleta.css — a tabela de cor que substitui as ~1.943 regras `[style*=]`.
 *
 * A tabela NÃO é inventada: cada destino sai das regras que já existem no style.css
 * (scripts/tabela-de-cor.js as lê). Este arquivo só reorganiza a MESMA informação numa
 * forma que o navegador resolve por herança, em vez de por casamento de substring.
 *
 * ⛔ Notação não é cor: `#06b6d4` e `rgb(6, 182, 212)` são a MESMA cor e precisam do
 * MESMO token, senão a tarja devolve uma e esquece a outra. Tudo passa por `canon()`.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { montar, corDoLiteral, propDoLiteral } = require(path.join(__dirname, 'tabela-de-cor.js'));

/* Forma canônica de uma cor. Opaca vira hex minúsculo; com alpha vira rgba compacto com
 * o alpha normalizado (0.10 e 0.1 são o mesmo número e tinham tokens diferentes). */
function canon(c) {
  c = String(c || '').trim();
  let m = c.match(/^#([0-9a-fA-F]{3})$/);
  if (m) return '#' + m[1].toLowerCase().split('').map((x) => x + x).join('');
  m = c.match(/^#([0-9a-fA-F]{6})$/);
  if (m) return '#' + m[1].toLowerCase();
  m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    const hx = (n) => Number(n).toString(16).padStart(2, '0');
    if (a === 1) return '#' + hx(m[1]) + hx(m[2]) + hx(m[3]);
    return 'rgba(' + [m[1], m[2], m[3]].map(Number).join(',') + ',' + String(a) + ')';
  }
  return c;
}

/* ⛔ UM ESPAÇO DE TOKEN POR PROPRIEDADE — `--sp-c-` texto, `--sp-g-` fundo, `--sp-b-` borda.
 * Não é preciosismo: a mesma cor tem destino DIFERENTE conforme onde é usada, e um token
 * compartilhado aliasa os dois. MEDIDO em dois lugares:
 *   · `rgba(255,255,255,0.12)` vira `rgba(0,0,0,0.075)` como fundo e `rgba(0,0,0,0.16)`
 *     como borda (11 cores divergem assim);
 *   · dentro da tarja, o remap era desligado pro TEXTO e mantido pro FUNDO — com token
 *     único o fundo voltava ao escuro junto (a barra de progresso da tela inicial).
 * ⛔ BORDA TEM TABELA PRÓPRIA. A mesma cor de fundo e de borda NÃO vai pro mesmo lugar no
 * tema claro: `rgba(255,255,255,0.12)` vira `rgba(0,0,0,0.075)` como FUNDO e
 * `rgba(0,0,0,0.16)` como BORDA — 11 cores divergem assim. Dobrar as duas num token só
 * mudou 111 comparações na prova de cor. O prefixo separa os dois espaços. */
function nomeTokenBorda(corCanon) {
  return nomeToken(corCanon).replace('--sp-c-', '--sp-b-');
}
function nomeTokenFundo(corCanon) {
  return nomeToken(corCanon).replace('--sp-c-', '--sp-g-');
}
/* o prefixo certo pra cada propriedade — fonte única, pra migrador e prova usarem o mesmo */
function tokenPara(cor, prop) {
  if (prop === 'borda') return nomeTokenBorda(cor);
  if (prop === 'background' || prop === 'background-color') return nomeTokenFundo(cor);
  return nomeToken(cor);
}

function nomeToken(corCanon) {
  const h = corCanon.match(/^#([0-9a-f]{6})$/);
  if (h) return '--sp-c-' + h[1];
  const r = corCanon.match(/^rgba\(([\d.,]+)\)$/);
  if (r) return '--sp-c-' + r[1].split(',').map((x) => x.replace('.', '')).join('-');
  return '--sp-c-' + corCanon.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function gerar() {
  // ⛔ lê as regras CONGELADAS, não o style.css vivo: o style.css já não as tem (foi podado),
  // e um gerador que lê a própria saída produz paleta vazia — foi o que aconteceu uma vez.
  const css = fs.readFileSync(path.join(__dirname, 'regras-de-cor-originais.css'), 'utf8');
  const r = montar(css);

  const escuro = new Map();   // token -> valor original (tema escuro)
  const claro = new Map();    // token -> valor no tema claro
  const sunset = new Map();
  const naTarja = new Set();  // tokens que a tarja DEVOLVE ao valor escuro
  const usoProp = new Map();  // token -> Set de propriedades em que a regra o ancorava

  /* ⛔ SUNSET E OCEAN NÃO EXISTEM. Foram removidos da escolha na v2.6.27 (js/theme.js:
   * "SÓ 2 temas — escuro e claro"), mas sobraram regras deles no CSS antigo. Gerar tabela
   * pra um tema que ninguém consegue selecionar é ressuscitar código morto — e foi o que
   * me fez escrever "3 temas" num relatório. Ordem do dono: _"2 temas, que 3 temas?"_ */
  const TEMAS_VIVOS = { light: 1 };
  const registra = (cor, val, tema, prop) => {
    const cc = canon(cor);
    const tk = tokenPara(cc, prop);
    escuro.set(tk, cc);
    if (prop) (usoProp.get(tk) || usoProp.set(tk, new Set()).get(tk)).add(prop);
    if (val != null) {
      const alvo = canon(val);
      if (TEMAS_VIVOS[tema]) claro.set(tk, alvo);
    }
    return tk;
  };

  [...r.ancoradas.values()].forEach((e) => {
    Object.entries(e.temas).forEach(([tm, s]) => registra(e.cor, [...s][0], tm, e.prop));
  });
  [...r.nuas.values()].forEach((e) => {
    Object.entries(e.temas).forEach(([tm, s]) => registra(e.cor, [...s][0], tm, 'borda'));
  });
  // a TARJA: o segundo [style*=] diz qual cor ela devolve
  r.daTarja.forEach((x) => {
    if (!x.atributos || x.atributos.length < 2) return;
    const cor = corDoLiteral(x.atributos[1]);
    const prop = propDoLiteral(x.atributos[1]);
    // ⭐ o token da tarja é o do USO (texto x fundo): ela desligava o remap do TEXTO e
    // mantinha o do FUNDO. Restaurar os dois some com a barra de progresso no claro.
    const tk = registra(cor, null, x.tema, prop);
    naTarja.add(tk);
  });

  return { r, escuro, claro, sunset, naTarja, usoProp, canon, nomeToken };
}

function escrever() {
  const g = gerar();
  const linha = (tk, v) => '  ' + tk + ': ' + v + ';';
  const ordena = (a, b) => a[0].localeCompare(b[0]);

  let out = '';
  out += '/* css/paleta.css — A TABELA DE COR (gerado por scripts/gerar-paleta.js)\n' +
    ' *\n' +
    ' * ⛔ NÃO EDITE À MÃO. Rode `node scripts/gerar-paleta.js` — ele deriva tudo das\n' +
    ' * regras que existiam em css/style.css, pra que a migração não invente nenhum tom.\n' +
    ' *\n' +
    ' * POR QUE ISTO EXISTE (medido no WebKit, mesma tela de 5.482 elementos):\n' +
    ' *   CSS completo ......... 506 ms de casamento de seletor\n' +
    ' *   CSS mínimo ...........  12 ms\n' +
    ' *   sem as regras [style*=] 23 ms   (486 → 23)\n' +
    ' * Eram ~1.943 seletores de SUBSTRING DE ATRIBUTO — o pior caso do casamento CSS,\n' +
    ' * porque nenhum índice do navegador (tag/classe/id) filtra antes. O custo é LINEAR\n' +
    ' * no número dessas regras, e elas nasceram do trabalho de contraste do tema claro\n' +
    ' * (v2.1.84-beta / v2.1.90-beta) — que é quando o dono notou a piora.\n' +
    ' *\n' +
    ' * COMO FUNCIONA: a cor vira um TOKEN com o literal de fallback —\n' +
    ' *   color: var(--sp-c-a5b4fc, #a5b4fc)\n' +
    ' * O tema claro redefine o token. Variável CSS resolve por HERANÇA: custo ZERO de\n' +
    ' * casamento, e o valor original continua legível no ponto de uso.\n' +
    ' */\n\n';

  out += '/* ── A PALETA: o valor ORIGINAL de cada cor (é o que o tema escuro mostra) ── */\n';
  out += ':root {\n' + [...g.escuro.entries()].sort(ordena).map(([tk, v]) => linha(tk, v)).join('\n') + '\n}\n\n';

  out += '/* ── TEMA CLARO: o remap de contraste, exatamente o que as regras faziam ── */\n';
  out += '[data-theme="light"] {\n' + [...g.claro.entries()].sort(ordena).map(([tk, v]) => linha(tk, v)).join('\n') + '\n}\n\n';

  if (g.sunset.size) {
    out += '/* ── SUNSET: só o que ele já fazia (não herda o remap do claro) ── */\n';
    out += '[data-theme="sunset"] {\n' + [...g.sunset.entries()].sort(ordena).map(([tk, v]) => linha(tk, v)).join('\n') + '\n}\n\n';
  }

  out += '/* ── A TARJA DE LEITURA ────────────────────────────────────────────────────\n' +
    ' * Ela é escura NOS DOIS temas (fica sobre foto), então lá dentro o remap do claro\n' +
    ' * tem que ser DESLIGADO e a cor volta a ser a do tema escuro.\n' +
    ' * Isto custava 952 regras — uma por cor × 12 grafias da inline style. Agora é UMA:\n' +
    ' * a tarja redeclara os tokens, e a herança leva pra todos os filhos.\n' +
    ' * ⚠️ Devolve as 87 cores que as regras devolviam — nem uma a mais: cor que hoje\n' +
    ' * segue remapeada dentro da tarja tem que continuar assim. */\n';
  const daTarja = [...g.naTarja].filter((tk) => g.escuro.has(tk)).sort();
  out += '[data-theme="light"] [style*="--sp-tarja"] {\n' +
    daTarja.map((tk) => linha(tk, g.escuro.get(tk))).join('\n') + '\n}\n\n';

  out += '/* ── O RITMO DENTRO DA TARJA ────────────────────────────────────────────────────\n' +
    ' * Estas 3 regras substituem 12 do CSS antigo, e precisam manter DUAS coisas que o\n' +
    ' * token sozinho não carrega: o `!important` e a especificidade (0,3,0). É por elas que\n' +
    ' * o ritmo vence o `<style>` embutido da caixa de leitura (`.tourn-progress-live * {\n' +
    ' * color:… !important }`, que é (0,2,0)). MEDIDO: sem isso a regressiva do Confra\n' +
    ' * mudava de vermelha pra cinza — nos DOIS temas. */\n';
  [['emdia', '#34d399'], ['apertando', '#fbbf24'], ['atrasado', '#f87171']].forEach(function (par) {
    ['--sp-tarja', '--sp-leitura2'].forEach(function (marca, k) {
      out += '[style*="' + marca + '"] .sp-ritmo.sp-ritmo-' + par[0] + ',\n' +
             '[style*="' + marca + '"] .sp-ritmo.sp-ritmo-' + par[0] + ' *' +
             (k === 0 ? ',\n' : ' { color: ' + par[1] + ' !important; }\n');
    });
  });
  out += '\n';

  out += '/* ── O ritmo da rodada tem destino próprio no claro (não é o da inline style) ── */\n';
  out += '[data-theme="light"] {\n' +
    '  --sp-ritmo-emdia: #047857;\n  --sp-ritmo-apertando: #b45309;\n  --sp-ritmo-atrasado: #b91c1c;\n}\n' +
    '[data-theme="light"] [style*="--sp-tarja"] {\n' +
    '  --sp-ritmo-emdia: #34d399;\n  --sp-ritmo-apertando: #fbbf24;\n  --sp-ritmo-atrasado: #f87171;\n}\n\n';

  out += '/* ── Os overlays de placar escurecem por conta própria ── */\n';
  const porEscopo = new Map();
  g.r.escopadas.forEach((e) => {
    if (e.tema !== 'light') return;   // tema morto não entra (ver TEMAS_VIVOS)
    const k = e.tema + '|' + e.escopo;
    (porEscopo.get(k) || porEscopo.set(k, []).get(k)).push(e);
  });
  const grupos = new Map();
  [...porEscopo.entries()].forEach(([k, arr]) => {
    const [tema, escopo] = k.split('|');
    const corpo = arr.map((e) => linha(nomeToken(canon(e.cor)), canon(e.val))).sort().join('\n');
    (grupos.get(corpo) || grupos.set(corpo, []).get(corpo)).push('[data-theme="' + tema + '"] ' + escopo);
  });
  [...grupos.entries()].forEach(([corpo, sels]) => { out += sels.join(',\n') + ' {\n' + corpo + '\n}\n'; });

  fs.writeFileSync(path.join(ROOT, 'css', 'paleta.css'), out);

  /* ── O LADO DINÂMICO DA TABELA ────────────────────────────────────────────────────
   * Boa parte das cores não está escrita junto da propriedade: ela chega por argumento
   * e é concatenada (`'color:' + cor`). O texto não tem como saber que aquele `'#f87171'`
   * solto vai virar `color:` — mas a CONCATENAÇÃO sabe. Então o migrador troca
   * `'color:' + x` por `'color:' + _spCor(x)`, e este mapa faz a tradução em tempo de
   * execução. MEDIDO: eram 44 elementos da chave que ficavam sem o remap do tema claro. */
  /* ⛔ POR PROPRIEDADE, não por cor. As regras casavam a GRAFIA: `color:#fbbf24` existia,
   * `background:#fbbf24` NÃO — só `background: rgb(251, 191, 36)`. Uma tabela por cor
   * remapeava fundo hex que nunca foi remapeado (282 elementos da tela inicial mudaram).
   * E só a grafia SEM espaço entra: é a que a concatenação (`'color:' + cor`) produz. */
  const din = {};
  g.r.semEspaco.forEach((prop, chave) => {
    const cor = chave.slice(prop.length + 1);
    const tk = tokenPara(canon(cor), prop);
    if (!g.escuro.has(tk)) return;
    (din[prop] = din[prop] || {})[cor] = tk;
  });
  /* a BORDA entra como propriedade 'borda' com os tokens --sp-b-*: as regras dela eram
   * `[style*="solid rgba(...)"]`, e o destino no claro é outro (ver nomeTokenBorda). */
  [...g.r.nuas.values()].forEach((e) => {
    const cc = canon(e.cor);
    const tk = nomeTokenBorda(cc);
    if (!g.escuro.has(tk)) return;
    (din['borda'] = din['borda'] || {})[e.cor.toLowerCase().replace(/\s+/g, '')] = tk;
  });
  const linhasJs = Object.entries(din).sort().map(([prop, mapa]) =>
    "    '" + prop + "': {\n" +
    Object.entries(mapa).sort().map(([c, tk]) => "      '" + c + "': '" + tk + "'").join(',\n') +
    '\n    }').join(',\n');
  const nCores = Object.values(din).reduce((a, m) => a + Object.keys(m).length, 0);
  const js = "/* js/paleta-tabela.js — A TABELA DE COR, lado dinâmico (gerado por scripts/gerar-paleta.js)\n" +
    " *\n" +
    " * ⛔ NÃO EDITE À MÃO. Gêmeo de css/paleta.css: lá ficam os valores por tema, aqui o mapa\n" +
    " * cor -> token, pra quando a cor chega por variável (`'color:' + cor`).\n" +
    " *\n" +
    " * `_spCor('#f87171', 'color')` -> `var(--sp-c-f87171,#f87171)`.\n" +
    " * ⛔ A PROPRIEDADE IMPORTA: `color:#fbbf24` era remapeado no tema claro, `background:#fbbf24`\n" +
    " * NÃO (as regras de fundo só existiam com `rgb()`). Cor fora da tabela volta intacta —\n" +
    " * gradiente, `var()` já pronto, cor de marca.\n" +
    " * Carregado ANTES de tudo (index.html e tests/render-harness): quem desenha precisa dele.\n" +
    " */\n" +
    "(function () {\n" +
    "  var TABELA = {\n" + linhasJs + "\n  };\n" +
    "  window._spCor = function (c, prop) {\n" +
    "    if (!c || typeof c !== 'string') return c;\n" +
    "    var m = TABELA[prop || 'color'];\n" +
    "    if (!m) return c;\n" +
    "    var tk = m[c.toLowerCase().replace(/\\s+/g, '')];\n" +
    "    return tk ? ('var(' + tk + ',' + c + ')') : c;\n" +
    "  };\n" +
    "})();\n";
  fs.writeFileSync(path.join(ROOT, 'js', 'paleta-tabela.js'), js);
  const n = (s) => String(s).padStart(4);
  console.log('css/paleta.css gerado');
  console.log('  tokens na paleta ........ ' + n(g.escuro.size));
  console.log('  remapeados no claro ..... ' + n(g.claro.size));
  console.log('  remapeados no sunset .... ' + n(g.sunset.size));
  console.log('  devolvidos pela tarja ... ' + n(daTarja.length));
  console.log('  regras que ele substitui  ' + n(g.r.regras.length));
  console.log('  js/paleta-tabela.js ..... ' + n(nCores) + ' pares (propriedade, cor) no mapa dinamico');
  return g;
}

module.exports = { canon, nomeToken, nomeTokenBorda, nomeTokenFundo, tokenPara, gerar };
if (require.main === module) escrever();
