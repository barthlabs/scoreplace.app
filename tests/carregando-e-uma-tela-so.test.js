/* CARREGANDO É UMA TELA SÓ — node tests/carregando-e-uma-tela-so.test.js
 *
 * Ordem do dono (12/ago/2026): _"a tela de carregando deveria ser canônica sempre a mesma
 * em qualquer situação em que uma tela carregando aparece e isso não acontece. lá no meio
 * da experiência, ainda aparece em determinados momentos a tela de carregando antiga de
 * muito tempo atrás."_ — e antes disso: _"entre entrar e a dashboard não aparece o %"_.
 *
 * ELE ESTAVA CERTO, e eram CINCO apresentações (medidas no código):
 *   1. #scoreplace-boot-loader (index.html)  → bola + logo + barra COM %
 *   2. _ensureBootOverlay                    → bola + logo + barra indeterminada
 *   3. _showLoading                          → bola + msg, SEM logo, barra indeterminada
 *   4. _renderBallLoader SEM `bar`           → só bolinha + texto cinza   ← "a antiga"
 *   5. _renderBallLoader COM `bar`           → bola + barra indeterminada ← a do router
 * A (4) era o DEFAULT de ~10 telas do meio do app (histórico, troféus, ficha do jogador,
 * ferramentas do organizador, locais, casual…) — é a que ele via reaparecer. E a (5) é a
 * do `js/router.js`, a tela ENTRE o Entrar e a dashboard: por isso não tinha %.
 *
 * O que este teste trava:
 *  · a barra é montada num lugar SÓ (`_spLoaderBarHtml`) — ninguém pode escrever a sua;
 *  · toda barra tem % (`sp-loader-pct`), inclusive quem não pedia barra;
 *  · ninguém volta a usar a barra INDETERMINADA (`sp-rich-bar`), que era o que impedia
 *    o % de existir;
 *  · o boot inline do index.html (que é obrigatoriamente separado, porque roda antes de
 *    qualquer JS) continua tendo o seu próprio %.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

console.log('──── carregando é uma tela só ────');

const store = ler('js/store.js');

// ── (1) A BARRA TEM UM DONO SÓ ──────────────────────────────────────────────
{
  ok(/window\._spLoaderBarHtml\s*=\s*function/.test(store), 'existe a fonte única da barra');
  ok(/window\._spLoaderTick\s*=\s*function/.test(store), 'existe o relógio único que anima o %');
  ok(/window\._spLoaderFinish\s*=\s*function/.test(store), 'existe quem crava 100% ao terminar');

  // A pílula 3D é reconhecível pelo gradiente prata da moldura. Ela pode aparecer no
  // _spLoaderBarHtml e no boot inline — em mais nenhum lugar do JS.
  const molduras = (store.match(/#828c9a 0%,#b4bcc7 55%,#dfe4ea 100%/g) || []).length;
  ok(molduras === 1,
     'a moldura da barra é escrita UMA vez no store.js (achou ' + molduras + ' — cada cópia extra vira uma tela diferente)');
}

// ── (2) NINGUÉM MAIS MONTA BARRA POR CONTA ─────────────────────────────────
{
  const arquivos = ['js/store.js', 'js/router.js', 'js/main.js']
    .concat(fs.readdirSync(path.join(raiz, 'js/views')).filter(f => f.endsWith('.js')).map(f => 'js/views/' + f));
  const infratores = arquivos.filter((f) => {
    const src = ler(f);
    // a barra indeterminada é o padrão ANTIGO — era ela que não tinha como ter %
    return /sp-rich-bar\s+1\.05s/.test(src);
  });
  ok(infratores.length === 0,
     'ninguém usa mais a barra INDETERMINADA (sem %): ' + infratores.join(', '));
}

// ── (3) O CORPO DA TELA É UM SÓ, E TEM LOGO + BOLA + BARRA ────────────────
// Ordem do dono: _"se tiver bolinha carregando e barra % tem que ser uma tela só sempre.
// não 5."_ e _"logo sempre também."_ Não basta a barra ser a mesma: a COMPOSIÇÃO tem que
// ser a mesma — era aí que ainda havia diferença (umas telas com logo, outras sem).
{
  const i = store.indexOf('window._spLoaderBodyHtml = function');
  ok(i > 0, 'existe o corpo único da tela de carregando');
  const corpo = store.slice(i, store.indexOf('window._renderBallLoader = function'));
  ok(/_spLoaderLogoHtml\(/.test(corpo), 'o corpo único traz o LOGO — sempre');
  ok(/_TENNIS_BALL_SVG\(/.test(corpo), 'o corpo único traz a bola girando');
  ok(/_spLoaderBarHtml\(/.test(corpo), 'o corpo único traz a barra com %');
}

// ── (3b) O HELPER DE TELA SEMPRE ENTREGA O CORPO ÚNICO ────────────────────
// Era aqui que morava "a antiga": sem `opts.bar` o retorno não tinha barra nenhuma.
{
  const i = store.indexOf('window._renderBallLoader = function');
  ok(i > 0, 'achou _renderBallLoader');
  const corpo = store.slice(i, store.indexOf('window._renderBallLoaderInline'));
  ok(/_spLoaderBodyHtml\(/.test(corpo), '_renderBallLoader monta o corpo único');
  ok(!/opts\.bar\s*\?/.test(corpo),
     'a barra deixou de ser opcional (o `opts.bar ?` era o que produzia a tela antiga)');
  ok(!/_TENNIS_BALL_SVG\(/.test(corpo),
     '_renderBallLoader não desenha a bola por conta — delega ao corpo único');
}

// ── (4) AS DUAS TELAS CHEIAS USAM O MESMO CORPO ───────────────────────────
{
  [['_showLoading', 'a tela das ações (Sortear/Salvar)'],
   ['_ensureBootOverlay', 'o splash de fallback']].forEach(([fn, oque]) => {
    const i = store.indexOf('window.' + fn + ' = function');
    ok(i > 0, 'achou ' + fn);
    const corpo = store.slice(i, i + 4200);
    ok(/_spLoaderBodyHtml\(/.test(corpo), oque + ' monta o corpo único');
    ok(!/scoreplace-ball-spin 1\.2s linear infinite;">'\s*\+\s*(ballSvg|_ball)/.test(corpo),
       oque + ' não tem mais cópia local do desenho da bola');
  });
  // Terminar em "73%" lê como corte no meio — o 100% antes de sair é obrigatório.
  const h = store.indexOf('window._hideLoading = function');
  ok(h > 0 && /_spLoaderFinish\(/.test(store.slice(h, h + 900)),
     '_hideLoading crava 100% antes de tirar a tela');
}

// ── (5) O BOOT INLINE segue com o SEU % ────────────────────────────────────
// Ele NÃO pode usar as funções do store.js: roda antes de qualquer script carregar.
// Por isso é a única duplicação aceita — e tem que continuar tendo o %.
{
  const html = ler('index.html');
  ok(/id="scoreplace-boot-bar-pct"/.test(html), 'o boot inline tem o elemento de %');
  ok(/pctEl\.textContent\s*=\s*Math\.round\(progress\)/.test(html), 'o boot inline atualiza o % a cada frame');
  ok(/pctEl\.textContent\s*=\s*'100%'/.test(html), 'o boot inline crava 100% ao revelar a tela');
}

// ── (6) O ROUTER (Entrar → dashboard) passa pelo helper canônico ───────────
// Era esta a tela sem %.
{
  const r = ler('js/router.js');
  ok(/_renderBallLoader\(/.test(r), 'o router usa o helper canônico');
  ok(!/sp-rich-bar/.test(r), 'o router não monta barra própria');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
