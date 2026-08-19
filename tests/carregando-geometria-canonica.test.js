/* A TELA DE CARREGANDO TEM UMA GEOMETRIA SÓ — SPLASH = CORPO ÚNICO, MEDIDA POR MEDIDA
 * node tests/carregando-geometria-canonica.test.js
 *
 * A FALHA REAL (dono, 19/ago/2026): _"o carregando continua com telas diferentes com os
 * mesmos elementos em tamanhos diferentes que se alternam e estragam e precarizam a
 * experiencia. tem que ser canonico sempre do mesmo tamanho nas mesmas posicoes todos os
 * elementos. a unica coisa que pode mudar é o texto, mas mesmo assim com a mesma fonte
 * de mesmo tamanho."_
 *
 * MEDIDO: as rodadas anteriores unificaram a BOLA (um tamanho) e o CORPO (uma composição),
 * mas o splash do index.html — que roda antes de qualquer script e por isso é a única
 * duplicação aceita — ainda divergia do corpo único em TRÊS medidas, e eram elas o "pulo"
 * visível na abertura (splash → tela seguinte):
 *   · logo 208×156 no splash vs 152×114 no corpo (a exceção "de propósito" da v1.8.75);
 *   · wordmark 1.8rem vs 1.2rem;
 *   · o TEXTO: 1.17rem/800 ABAIXO da barra no splash vs 0.88rem/600 ENTRE a bola e a
 *     barra no corpo — o mesmo elemento mudava de tamanho E de posição entre duas telas
 *     que aparecem em sequência.
 *
 * O CONTRATO: este teste LÊ as medidas do corpo único (store.js) e cobra as MESMAS no
 * splash (index.html) — logo, wordmark, bola (tamanho e margens), texto (tamanho, peso e
 * POSIÇÃO na ordem dos elementos) e barra (largura, altura, margem). Mexeu num lado sem
 * mexer no outro → quebra aqui.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const raiz = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(raiz, 'js', 'store.js'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

console.log('──── carregando: splash e corpo único têm a MESMA geometria ────');

// O trecho do splash (style + markup) e o do corpo único.
const splash = html.slice(html.indexOf('#scoreplace-boot-loader'), html.indexOf('</div>\n  </div>', html.indexOf('id="scoreplace-boot-loader"')) + 20);
const logoFn = store.slice(store.indexOf('window._spLoaderLogoHtml = function'), store.indexOf('window._spLoaderBodyHtml = function'));
const bodyFn = store.slice(store.indexOf('window._spLoaderBodyHtml = function'), store.indexOf('window._renderBallLoader ='));
const barFn = store.slice(store.indexOf('window._spLoaderBarHtml = function'), store.indexOf('window._spLoaderTick = function'));

// ── 1. LOGO: mesmo símbolo, mesmas dimensões ────────────────────────────────
{
  const m = logoFn.match(/<svg width="(\d+)" height="(\d+)"/);
  ok(!!m, 'o corpo único declara as dimensões do logo');
  ok(m && splash.indexOf('<svg width="' + m[1] + '" height="' + m[2] + '"') !== -1,
     'o splash usa o logo EXATAMENTE em ' + (m && m[1] + '×' + m[2]) + ' (era 208×156 — o 1º pulo visível)');
  ok(splash.indexOf('width="208"') === -1, 'o logo dobrado do splash (v1.8.75) morreu');
}

// ── 2. WORDMARK: mesma fonte, mesmo tamanho ────────────────────────────────
{
  const m = logoFn.match(/font-size:([\d.]+)rem;font-weight:800/);
  ok(!!m, 'o corpo único declara o tamanho do wordmark');
  ok(m && new RegExp('boot-brand \\{ font-size:' + m[1].replace('.', '\\.') + 'rem').test(splash),
     'o wordmark do splash tem o MESMO tamanho (' + (m && m[1]) + 'rem — era 1.8rem)');
}

// ── 3. BOLA: tamanho canônico e MESMAS margens ─────────────────────────────
{
  const canon = (store.match(/window\._SP_LOADER_BALL_SIZE\s*=\s*'([^']+)'/) || [])[1];
  ok(!!canon, 'existe o tamanho canônico da bola');
  ok(new RegExp('boot-ball \\{ width:' + canon.replace('.', '\\.') + '; height:' + canon.replace('.', '\\.')).test(splash),
     'a bola do splash usa o canônico (' + canon + ')');
  const marg = bodyFn.match(/margin:([\d.]+rem auto [\d.]+rem)/);
  ok(!!marg, 'o corpo único declara as margens da bola');
  ok(marg && splash.indexOf('margin:' + marg[1]) !== -1,
     'a bola do splash usa as MESMAS margens (' + (marg && marg[1]) + ') — posição idêntica');
}

// ── 4. TEXTO: mesma fonte, mesmo tamanho, MESMA POSIÇÃO (entre a bola e a barra) ──
{
  const m = bodyFn.match(/data-load-msg[^>]*font-size:([\d.]+)rem;font-weight:(\d+)/);
  ok(!!m, 'o corpo único declara fonte e peso da mensagem');
  ok(m && new RegExp('boot-tag \\{ font-size:' + m[1].replace('.', '\\.') + 'rem; font-weight:' + m[2]).test(splash),
     'o texto do splash tem a MESMA fonte (' + (m && m[1] + 'rem/' + m[2]) + ' — era 1.17rem/800)');
  // Ordem no corpo único: logo → bola → MENSAGEM → barra.
  const oBody = [bodyFn.indexOf('_spLoaderLogoHtml('), bodyFn.indexOf('_TENNIS_BALL_SVG('),
                 bodyFn.indexOf('data-load-msg'), bodyFn.indexOf('_spLoaderBarHtml(')];
  ok(oBody.every((v) => v > 0) && oBody[0] < oBody[1] && oBody[1] < oBody[2] && oBody[2] < oBody[3],
     'corpo único: logo → bola → texto → barra');
  // E no splash a MESMA ordem (o texto ficava DEPOIS da barra — mudava de posição).
  const mk = splash.slice(splash.indexOf('id="scoreplace-boot-loader"'));
  const oSplash = [mk.indexOf('scoreplace-boot-logo'), mk.indexOf('scoreplace-boot-ball'),
                   mk.indexOf('class="scoreplace-boot-tag"'), mk.indexOf('class="scoreplace-boot-bar"')];
  ok(oSplash.every((v) => v > 0) && oSplash[0] < oSplash[1] && oSplash[1] < oSplash[2] && oSplash[2] < oSplash[3],
     'splash: logo → bola → texto → barra (o texto saiu de baixo da barra)');
}

// ── 5. BARRA: mesma largura, altura e margem ───────────────────────────────
{
  const w = (barFn.match(/largura \|\| '(\d+px)'/) || [])[1];
  const h = (barFn.match(/height:(\d+px)/) || [])[1];
  const marg = (barFn.match(/margin:([\d.]+rem auto 0)/) || [])[1];
  ok(!!w && !!h && !!marg, 'o corpo único declara largura/altura/margem da barra');
  ok(w && new RegExp('boot-bar \\{[^}]*width:' + w).test(splash), 'a barra do splash tem a mesma largura (' + w + ')');
  ok(h && new RegExp('boot-bar \\{[^}]*height:' + h).test(splash), 'a barra do splash tem a mesma altura (' + h + ')');
  ok(marg && splash.indexOf('margin:' + marg) !== -1, 'a barra do splash tem a mesma margem (' + marg + ')');
}

// ── 6. A ESCALA DA RAIZ NASCE JUNTO COM O SPLASH ───────────────────────────
// O pulo que SOBRAVA depois de igualar o markup: o CSS usa var(--ui-scale, 1),
// mas o padrão real do app é 1.3 — aplicado pelo store.js DEPOIS do splash
// nascer. O splash inteiro pintava ~30% menor e tudo que é rem pulava quando a
// escala entrava. O boot inline aplica a escala ANTES da 1ª pintura, com os
// MESMOS números do store.js — este bloco trava a igualdade.
{
  const base = (store.match(/window\._UI_SCALE_BASE\s*=\s*([\d.]+)/) || [])[1];
  const stamp = (store.match(/window\._UI_SCALE_RESET\s*=\s*'([^']+)'/) || [])[1];
  const pctMin = Number((store.match(/window\._UI_PCT_MIN\s*=\s*(\d+)/) || [])[1]);
  const pctMax = Number((store.match(/window\._UI_PCT_MAX\s*=\s*(\d+)/) || [])[1]);
  ok(!!base && !!stamp && !!pctMin && !!pctMax, 'store.js declara base/carimbo/faixa da escala');
  const iBoot = html.indexOf('id="scoreplace-boot-loader"');
  const boot = html.slice(iBoot, html.indexOf('</script>', iBoot));
  ok(boot.indexOf("setProperty('--ui-scale'") !== -1,
     'o boot inline aplica --ui-scale ANTES da 1ª pintura (senão o splash pinta ~30% menor)');
  ok(boot.indexOf('_uiScale = ' + base) !== -1, 'o boot usa a MESMA base do store.js (' + base + ')');
  ok(boot.indexOf("'" + stamp + "'") !== -1, 'o boot usa o MESMO carimbo de reset do store.js');
  const min = (Number(base) * pctMin / 100).toFixed(2);
  const max = (Number(base) * pctMax / 100).toFixed(2);
  ok(boot.indexOf('Math.max(' + min + ', Math.min(' + max) !== -1,
     'o boot usa a MESMA faixa do store.js (' + min + '–' + max + ')');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
