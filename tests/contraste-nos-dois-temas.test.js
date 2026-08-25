/* CONTRASTE DO TEMA CLARO — o invariante, não os mecanismos.
 *
 * POR QUE ESTE ARQUIVO EXISTE (bronca do dono, 16/ago/2026):
 *   "já corrigimos os contrastes em cada tema… daí peço a previsão do tempo e no tema
 *    claro você coloca fonte preta em box escuro. Também nos placares do tema claro os
 *    box dos placares são quase da mesma tonalidade do box do jogo, ficando difícil de
 *    ver. reveja todo o tema claro. não mexa no tema escuro que esse eu acompanho
 *    sempre e está ok."
 *
 * A CAUSA É ESTRUTURAL, não foram dois descuidos: o app inteiro foi escrito olhando o
 * tema ESCURO. Lá, "destacar uma caixa" é CLAREAR o fundo (`rgba(255,255,255,0.06)`) e
 * "recuar" é ESCURECER (`rgba(0,0,0,0.25)`); e o texto de destaque é um PASTEL
 * (`#fde68a`, `#a5b4fc`). Os três hábitos INVERTEM de sentido no tema claro: o fundo
 * claro some no branco, o escuro vira lajota cinza, e o pastel vira texto invisível.
 * MEDIDO no js/: 254 fundos brancos translúcidos, ~200 bordas, 27 scrims escuros e 37
 * cores de texto claras sem remap nenhum.
 *
 * O INVARIANTE QUE ESTE ARQUIVO GUARDA:
 *   "todo hábito visual do tema escuro tem tradução declarada no tema claro, e nenhuma
 *    dessas traduções toca o tema escuro."
 *
 * ⚠️ MANUTENÇÃO: forma NOVA de quebrar contraste no claro entra NESTE arquivo. Foi
 * justamente cada correção anterior ter travado só o próprio caso que deixou o sintoma
 * voltar por outro caminho (fundo → texto → scrim → badge). Se um alpha ou uma cor nova
 * aparecer no js/, o teste fica VERMELHO pedindo a tradução — é esse o serviço dele.
 *
 * ⚠️ NÃO cobre texto sobre botão de cor SÓLIDA (W.O. vermelho, "Ao Vivo" laranja,
 * "Salvar" azul). Esses são idênticos nos dois temas — não são bug do tema claro, e o
 * dono disse explicitamente para não mexer no que o escuro já mostra.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

const style = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const components = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
const paleta = fs.readFileSync(path.join(ROOT, 'css', 'paleta.css'), 'utf8');
const CSS = style + '\n' + components + '\n' + paleta;

/* ⭐ 2.0.94 — A TRADUÇÃO MUDOU DE LUGAR, A GARANTIA NÃO.
 * Até aqui este teste perguntava "existe a regra `[data-theme="light"] [style*="cor"]`?".
 * Aquelas ~1.943 regras saíram (custavam 1.391ms de recálculo numa tela de 5.117
 * elementos; ver tests/cor-vive-na-tabela-nao-no-seletor) e o remap virou tabela de
 * variáveis em css/paleta.css.
 * A pergunta agora é MAIS DURA: não "existe uma regra", e sim "o token tem valor próprio
 * no tema claro?" — e, no caso do texto, "esse valor PASSA no AA?". Antes uma regra podia
 * existir apontando pra cor errada e o teste aprovava.
 */
function tabela() {
  const secoes = {};
  // ⛔ comentário fora ANTES de parsear: um `{` dentro de comentário quebra o bloco
  // seguinte e o leitor perde a seção inteira do tema claro (foi o que aconteceu).
  const limpo = paleta.replace(/\/\*[\s\S]*?\*\//g, '');
  // ⛔ SEM `(^|\})` no começo: esse prefixo CONSOME a chave de fechamento de um bloco como
  // início do próximo, e o parser pula um bloco sim, um não — foi assim que a seção do
  // tema claro (111 tokens) sumiu e o teste acusou "nada tem tradução".
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(limpo))) {
    const sel = m[1].trim();
    const corpo = m[2];
    const alvo = /^:root$/.test(sel) ? 'escuro'
      : (/^\[data-theme="light"\]$/.test(sel) ? 'claro'
      : (/--sp-tarja/.test(sel) ? 'tarja' : null));
    if (!alvo) continue;
    const rt = /(--sp-[a-z]-[a-z0-9-]+)\s*:\s*([^;]+);/g;
    let d;
    while ((d = rt.exec(corpo))) {
      (secoes[alvo] = secoes[alvo] || {})[d[1]] = d[2].trim();
    }
  }
  return secoes;
}
const TAB = tabela();
/* ⛔ O NOME DO TOKEN VEM DO GERADOR, não de uma cópia aqui. Escrevi a regra de nome duas
 * vezes e as duas versões divergiram no alpha (`-06` × `-006`): o teste passou a dizer que
 * NADA tinha tradução. Teste com lógica própria atesta um mecanismo que não é o que roda. */
const { canon, tokenPara } = require(path.join(ROOT, 'scripts', 'gerar-paleta.js'));
const nomeToken = (cor, prop) =>
  tokenPara(canon(cor), prop === 'fundo' ? 'background' : (prop === 'borda' ? 'borda' : 'color'));

/* tem tradução própria no claro? (existir com o MESMO valor não é tradução) */
function traduzido(cor, prop) {
  const tk = nomeToken(cor, prop);
  const claro = TAB.claro && TAB.claro[tk];
  const escuro = TAB.escuro && TAB.escuro[tk];
  return !!claro && claro !== escuro;
}
const luzDoToken = (cor, prop) => (TAB.claro || {})[nomeToken(cor, prop)] || null;

// ---------- utilidades de cor (WCAG 2.1) ----------
function hex(h) { h = h.replace('#', ''); const n = parseInt(h, 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function lum(c) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
function contraste(a, b) { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); }
// A "caixa tingida" é o pior fundo REAL do tema claro para texto: quase todo texto
// secundário do app mora dentro de um box com tinta de 6% (violeta/azul/verde) sobre
// branco. Medido na tela de criar torneio. Testar contra #fff puro seria fácil demais.
const CAIXA = { r: 238, g: 233, b: 247 };

// ---------- coleta o que o js/ realmente usa ----------
function arquivosJs(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules' || e.name === 'vendor') continue; arquivosJs(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const JS = arquivosJs(path.join(ROOT, 'js')).map(f => fs.readFileSync(f, 'utf8')).join('\n');

console.log('\n== Contraste nos DOIS temas ==');

// ---------- 1. FUNDO branco translúcido: some no branco se não houver tradução ----------
(function () {
  const alphas = new Set();
  // ⚠️ a cor agora vive como `var(--sp-g-…, rgba(255,255,255,α))` — o literal segue ali,
  // como fallback, e é ele que este teste colhe.
  const re = /background(?:-color)?: ?(?:var\(--sp-g-[a-z0-9-]+, ?)?rgba\(255, ?255, ?255, ?(0?\.\d+)\)/g;
  let m; while ((m = re.exec(JS))) alphas.add(m[1]);
  ok(alphas.size > 0, 'o js/ usa fundo branco translúcido (se zerou, este teste perdeu o sentido)');
  const semTraducao = [...alphas].filter((a) => !traduzido('rgba(255,255,255,' + a + ')', 'fundo'));
  ok(semTraducao.length === 0,
    'todo alpha de fundo branco tem tradução no tema claro — sem: ' + semTraducao.join(', '));
})();

// ---------- 2. BORDA branca translúcida ----------
(function () {
  const alphas = new Set();
  const re = /solid (?:var\(--sp-b-[a-z0-9-]+, ?)?rgba\(255, ?255, ?255, ?(0?\.\d+)\)/g;
  let m; while ((m = re.exec(JS))) alphas.add(m[1]);
  const semTraducao = [...alphas].filter((a) => !traduzido('rgba(255,255,255,' + a + ')', 'borda'));
  ok(semTraducao.length === 0,
    'toda borda branca translúcida tem tradução — sem: ' + semTraducao.join(', '));
})();

// ---------- 3. SCRIM escuro: vira lajota cinza no claro ----------
(function () {
  const alphas = new Set();
  const re = /background(?:-color)?: ?(?:var\(--sp-g-[a-z0-9-]+, ?)?rgba\(0, ?0, ?0, ?(0?\.\d+)\)/g;
  let m; while ((m = re.exec(JS))) { if (parseFloat(m[1]) <= 0.35) alphas.add(m[1]); }
  const semTraducao = [...alphas].filter((a) => !traduzido('rgba(0,0,0,' + a + ')', 'fundo'));
  ok(semTraducao.length === 0,
    'todo scrim escuro <= 0.35 tem tradução no claro — sem: ' + semTraducao.join(', '));

  // O teto de 0.35 é o que separa "recuo dentro de card" de "backdrop de modal".
  // Clarear backdrop seria o oposto do que ele existe pra fazer.
  const backdrops = [];
  const reB = /background: ?(?:var\(--sp-g-[a-z0-9-]+, ?)?rgba\(0, ?0, ?0, ?(0?\.\d+)\)/g;
  let b; while ((b = reB.exec(JS))) {
    const around = JS.slice(Math.max(0, reB.lastIndex - 220), reB.lastIndex);
    if (/position: ?fixed|inset: ?0/.test(around) && parseFloat(b[1]) <= 0.35) backdrops.push(b[1]);
  }
  ok(backdrops.length === 0,
    'nenhum backdrop de modal usa alpha <= 0.35 (senão a regra o clarearia): ' + backdrops.join(', '));
})();

// ---------- 4. TEXTO claro: todo hex que reprova o AA precisa de remap ----------
(function () {
  const usados = new Set();
  // A cor sai como `color:var(--sp-c-…, #hex)` — o literal segue lá, como fallback.
  // ⛔ SÓ os tokens da tabela: `var(--text-bright,#f8fafc)` é token de TEMA do app, que já
  // muda sozinho entre claro e escuro. Aceitar o fallback de qualquer `var()` acusava 5
  // cores "sem remap" que nunca precisaram de um.
  const re = /(?:^|[;"'\s{])color:\s*(?:var\(--sp-c-[a-z0-9-]+, ?)?(#[0-9a-fA-F]{6})\b/g;
  let m; while ((m = re.exec(JS))) usados.add(m[1].toLowerCase());
  const reprovam = [...usados].filter(h => contraste(hex(h), CAIXA) < 4.5);
  ok(reprovam.length > 0, 'existem cores de texto que reprovam o AA no claro (base do teste)');
  const semRemap = reprovam.filter((h) =>
    // branco puro fica de fora: só aparece sobre botão de cor sólida, igual nos 2 temas
    h !== '#ffffff' && !traduzido(h, 'texto'));
  ok(semRemap.length === 0,
    'toda cor de texto que reprova o AA tem remap no claro — sem: ' + semRemap.join(', '));
})();

// ---------- 5. os ALVOS do remap precisam PASSAR (senão o remap é decorativo) ----------
// ⭐ 2.0.94 — os alvos agora são os VALORES do tema claro na tabela. Mais duro que antes:
// a versão anterior varria o CSS atrás de regras e podia aprovar uma que apontasse pra
// cor errada; aqui cada tom que o tema claro realmente aplica é medido no AA.
(function () {
  const alvos = new Set();
  Object.entries(TAB.claro || {}).forEach(([tk, v]) => {
    if (tk.indexOf('--sp-c-') !== 0) return;          // só TEXTO (fundo/borda não são legibilidade)
    const h = String(v).trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(h)) alvos.add(h);
  });
  ok(alvos.size >= 10, 'o remap tem alvos (' + alvos.size + ')');
  const fracos = [...alvos].filter((h) => contraste(hex(h), CAIXA) < 4.5)
    .map((h) => h + '=' + contraste(hex(h), CAIXA).toFixed(2));
  ok(fracos.length === 0, 'todo alvo do remap passa o AA na caixa tingida — fracos: ' + fracos.join(', '));
})();

// ---------- 6. badges: a tinta de 15% fica quase branca no claro ----------
(function () {
  ['success', 'warning', 'info'].forEach(k => {
    ok(new RegExp('\\[data-theme="light"\\] \\.badge-' + k).test(components),
      '.badge-' + k + ' tem cor própria no tema claro (sem ela, success dava 1.88:1)');
  });
})();

// ---------- 7. O ESCURO NÃO É TOCADO — a garantia que o dono pediu ----------
// ⭐ 2.0.94 — antes isto se provava exigindo que cada regra nova fosse escopada em
// `[data-theme="light"]`. Com a tabela a garantia é estrutural e mais forte: o valor do
// tema ESCURO é o `:root`, e ele tem que ser o LITERAL ORIGINAL — o mesmo que continua
// escrito como fallback no código. Se alguém "melhorar" um tom, o escuro muda e cai aqui.
(function () {
  const amostra = [
    ['rgba(255,255,255,0.06)', 'fundo'], ['rgba(0,0,0,0.25)', 'fundo'],
    ['#fde68a', 'texto'], ['#fbbf24', 'texto']
  ];
  amostra.forEach(([cor, prop]) => {
    const tk = nomeToken(cor, prop);
    const raiz = (TAB.escuro || {})[tk];
    ok(!!raiz, 'a tabela tem o token de ' + cor + ' (' + tk + ')');
    if (!raiz) return;
    ok(raiz.replace(/\s+/g, '') === cor.replace(/\s+/g, ''),
      'no tema ESCURO ' + cor + ' segue sendo ele mesmo (veio ' + raiz + ')');
    ok(!!(TAB.claro || {})[tk], 'e tem tradução própria no tema claro');
  });
  // e nenhum token do bloco escuro do style.css pode ter sido alterado
  const blocoEscuro = style.slice(style.indexOf(':root, [data-theme="dark"]'), style.indexOf('[data-theme="light"] {'));
  ok(/--text-muted: #98989d/.test(blocoEscuro), 'o --text-muted do tema ESCURO segue #98989d');
  ok(/--text-main: #ebebf5/.test(blocoEscuro), 'o --text-main do tema ESCURO segue #ebebf5');
})();

// ---------- 8. A TARJA DE LEITURA inverte a polaridade OUTRA VEZ ----------
// _photoReadBox(): tema escuro → tarja CLARA + texto escuro; tema claro → tarja
// ESCURA + texto claro. Logo, DENTRO dela o remap do tema claro tem que se desligar,
// senão ele produz justamente o defeito que esta leva veio consertar.
(function () {
  const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
  const m = store.match(/bg: 'rgba\((\d+,\d+,\d+,[\d.]+)\)'/);
  ok(!!m, '_photoReadBox declara a cor da tarja do tema claro');
  // ⭐ 2.0.94 — eram 952 regras (uma por cor × 12 grafias); agora é UMA linha na tabela:
  // a tarja redeclara os tokens e a herança leva pros filhos.
  const naTarja = TAB.tarja || {};
  const textos = Object.keys(naTarja).filter((t) => t.indexOf('--sp-c-') === 0);
  ok(textos.length >= 40,
    'o remap de texto se DESLIGA dentro da tarja de leitura (' + textos.length + ' tokens devolvidos)');
  const voltamAoEscuro = textos.filter((t) => naTarja[t] === (TAB.escuro || {})[t]);
  ok(voltamAoEscuro.length === textos.length,
    'dentro da tarja o texto volta EXATAMENTE ao tom do tema escuro (senão vira escuro sobre escuro)');
  ok(Object.keys(naTarja).some((t) => t.indexOf('--sp-g-') === 0),
    'o fundo translúcido também volta ao valor escuro dentro da tarja');
  // se alguém trocar a cor da tarja no store.js, o marcador para de casar em silêncio —
  // este check amarra os dois lados.
  ok(store.indexOf('--sp-tarja,rgba(30,41,59,0.85)') >= 0,
    'a tarja no store.js carrega o marcador `--sp-tarja` que a tabela procura');
})();

// ---------- 9. O CÂNONE, nos DOIS temas (ordem do dono, 16/ago/2026) ----------
// "tudo sempre tem que apresentar essa regra de contraste. nos temas claro e escuro.
//  sempre. em tudo o que temos agora e em tudo o que viermos a criar."
(function () {
  // 9a. Os tokens de texto de CADA tema passam o AA sobre o fundo daquele tema.
  function tokens(bloco) {
    const o = {};
    ['--bg-darker', '--bg-card', '--text-main', '--text-muted', '--text-bright'].forEach(k => {
      const m = bloco.match(new RegExp(k + ':\\s*(#[0-9a-fA-F]{6})'));
      if (m) o[k] = m[1];
    });
    return o;
  }
  const iLight = style.indexOf('[data-theme="light"] {');
  const escuro = tokens(style.slice(style.indexOf(':root, [data-theme="dark"]'), iLight));
  const claro = tokens(style.slice(iLight, style.indexOf('[data-theme="sunset"]')));

  [['ESCURO', escuro], ['CLARO', claro]].forEach(([nome, t]) => {
    ok(Object.keys(t).length === 5, 'tema ' + nome + ': os 5 tokens de cor existem');
    if (Object.keys(t).length < 5) return;
    [['--text-main', 4.5], ['--text-bright', 4.5], ['--text-muted', 4.5]].forEach(([k, min]) => {
      ['--bg-darker', '--bg-card'].forEach(bg => {
        const r = contraste(hex(t[k]), hex(t[bg]));
        ok(r >= min, 'tema ' + nome + ': ' + k + ' sobre ' + bg + ' = ' + r.toFixed(2) + ':1 (mínimo ' + min + ')');
      });
    });
  });

  // 9b. A polaridade é OPOSTA entre os temas — é isso que faz a regra ser "a mesma
  // regra dos dois lados" em vez de dois conjuntos de cores soltos.
  ok(lum(hex(escuro['--bg-darker'])) < 0.2, 'o tema escuro tem fundo escuro');
  ok(lum(hex(claro['--bg-darker'])) > 0.7, 'o tema claro tem fundo claro');
  ok(lum(hex(escuro['--text-main'])) > lum(hex(escuro['--bg-darker'])),
    'no ESCURO o texto é mais claro que o fundo');
  ok(lum(hex(claro['--text-main'])) < lum(hex(claro['--bg-darker'])),
    'no CLARO o texto é mais escuro que o fundo');
})();


// ── O QUARTO HÁBITO: RECUAR COM `opacity` E TEXTO BRANCO CRAVADO ────────────
// (v1.8.92) Bronca do dono sobre "Últimas Partidas" da Partida Casual: "as partidas
// casuais aqui esta ilegivel, porra! nao ajustamos para ser sempre legivel nos 2 temas?
// em todo o programa!"
//
// A varredura da 1.8.78 cobriu TRÊS hábitos do tema escuro (fundo translúcido, borda,
// cor pastel). Este é o QUARTO, e passou justamente por isso: o time perdedor recuava
// com `opacity:0.5` na linha inteira, e os nomes eram BRANCO CRAVADO (`#fff` no
// vencedor, `rgba(255,255,255,0.72)` no perdedor).
//
// Por que só quebra no claro: esmaecer aproxima o texto do FUNDO. No escuro o fundo é
// escuro e o texto claro, então esmaecer ainda deixa contraste; no claro o fundo é
// branco e esmaecer texto claro o faz sumir. Branco cravado nem chega a ter chance.
//
// A REGRA: recuo se faz por TOM (`--text-muted`, que o gate já cobre), nunca por
// transparência; e texto sobre superfície do app usa TOKEN, nunca `#fff` literal.
(function () {
  const bu = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');

  const i = bu.indexOf('function _teamBlock(st, players, score, win)');
  ok(i > 0, 'o bloco de time das Últimas Partidas existe');
  if (i > 0) {
    const trecho = bu.slice(i, i + 1600);
    ok(!/nameColor = win \? '#fff'/.test(trecho),
      'o nome do vencedor não é mais branco cravado (invisível em card claro)');
    ok(/var nameColor = win \? 'var\(--text-bright\)' : 'var\(--text-muted\)'/.test(trecho),
      'os nomes saem de TOKEN — claro no tema escuro, escuro no tema claro');
  }

  const iL = bu.indexOf('var lRow = ');
  ok(iL > 0, 'a linha do time perdedor existe');
  if (iL > 0) {
    const linha = bu.slice(iL, bu.indexOf('\n', iL));
    ok(!/opacity\s*:/.test(linha),
      'a linha do perdedor NÃO recua por opacity — esmaecer contra fundo branco mata o contraste');
  }
})();

// ── ACENTO SOBRE SUPERFÍCIE INVERTIDA VEM DE CLASSE, NUNCA DE HEX INLINE (1.9.60) ──
// Forma NOVA de quebrar contraste, e por isso entra AQUI e não num teste ao lado.
//
// O cabeçalho do placar ao vivo é superfície INVERTIDA: gradiente escuro nos DOIS
// temas. O remap de contraste do tema claro age só sobre `style` INLINE — então um
// `style="color:#fbbf24"` ali dentro é reescrito pra #92400e e vira marrom escuro
// sobre fundo escuro. MEDIDO no navegador quando o selo "REPLAY" nasceu assim:
// 2,96:1 no tema claro contra 12,58:1 no escuro. Vindo de CLASSE (`.stat-accent`) o
// âmbar fica fora do remap e dá 10,69:1 nos dois.
//
// A regra é a mesma que components.css já documenta pra `.stat-box` (v1.8.78) —
// aqui ela é COBRADA, pra não depender de alguém lembrar.
(function () {
  const bu = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
  const i = bu.indexOf("(_replay ? 'REPLAY' : 'AO VIVO')");
  ok(i > 0, 'o selo REPLAY/AO VIVO do cabeçalho existe');
  if (i > 0) {
    const trecho = bu.slice(Math.max(0, i - 700), i + 120);
    ok(/class="stat-accent"/.test(trecho),
      'o acento do selo vem da CLASSE .stat-accent (fica fora do remap do tema claro)');
    ok(!/color:#(fbbf24|fde68a|fcd34d|f59e0b)/i.test(trecho),
      'e NÃO de hex âmbar inline, que o remap escureceria sobre o cabeçalho escuro');
  }
  // A barra da reprodução é tarja escura nos dois temas: texto branco ali é correto,
  // mas o FUNDO tem que ser opaco o bastante pra isso valer no tema claro também.
  const j = bu.indexOf("_rBar.style.cssText");
  ok(j > 0, 'a barra de controle da reprodução existe');
  if (j > 0) {
    const trecho = bu.slice(j, j + 600);
    ok(/background:rgba\(15,23,42,0\.9\d?\)/.test(trecho),
      'a barra é tarja escura OPACA (≥0.9) — texto branco lê nos dois temas');
  }
})();

console.log('\n' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
