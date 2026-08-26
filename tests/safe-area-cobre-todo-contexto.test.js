/* O CABEÇALHO NUNCA INVADE O RELÓGIO — node tests/safe-area-cobre-todo-contexto.test.js
 *
 * Relato do dono (12/ago/2026): _"cabeçalho cagado no programa no celular (invadindo a
 * ilha e área do relógio, conexão, sinal etc). isso também na landing page."_ E, ao
 * cobrar a varredura: _"se quebrou em qualquer lugar, verifique todos os lugares para ter
 * certeza que ficará tudo certo."_
 *
 * O app roda em QUATRO contextos e cada um resolve a safe-area de um jeito:
 *   · navegador comum          → `env(safe-area-inset-top)` = 0, nada a fazer
 *   · PWA instalado (iOS)      → `apple-mobile-web-app-status-bar-style=black-translucent`
 *                                põe a status bar SOBRE o conteúdo → PRECISA do inset;
 *                                o <html> não tem classe nenhuma
 *   · nativo iOS (Capacitor)   → `html.sp-native.sp-ios`
 *   · nativo Android           → `html.sp-native.sp-android`
 *
 * A regra do PWA vivia dentro de `@media (display-mode: standalone)` no layout.css — e
 * estava MORTA, engolida por um bloco CSS sem `}` (ver tests/css-nao-perde-regra). Ou
 * seja: quem instalou o app pela tela de início ficou SEM safe-area nenhuma. É exatamente
 * o print do dono.
 *
 * Este teste confere COBERTURA por contexto — não a aparência. Se alguém apagar (ou
 * escopar errado) a regra de um dos quatro, fica vermelho apontando qual.
 *
 * ⚠️ DIVISÃO DE TRABALHO, e ela é essencial — MEDIDO: este teste NÃO pega o incidente que
 * o originou. Ele lê o TEXTO do CSS, e no bug a regra continuava escrita; quem a matava
 * era um bloco sem `}` mais acima, que faz o PARSER engolir tudo o que vem depois. Ou
 * seja:
 *   · `tests/css-nao-perde-regra.test.js` garante que a regra é ALCANÇÁVEL;
 *   · este aqui garante que a regra EXISTE pra cada contexto.
 * Um sem o outro deixa passar metade do problema — não remover nenhum dos dois achando
 * que são redundantes.
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

console.log('──── safe-area cobre todo contexto ────');

/* Junta as regras de todos os CSS que usam safe-area-inset-top no topo, guardando o
 * @media em que vivem. Parser simples de blocos — basta pra o que este teste pergunta. */
function regrasDeTopo() {
  const out = [];
  ['css/layout.css', 'css/components.css', 'css/responsive.css', 'css/style.css'].forEach((arq) => {
    const css = ler(arq);
    let media = '', prof = 0, mediaProf = -1;
    const linhas = css.split('\n');
    let selAtual = '';
    linhas.forEach((ln) => {
      const abre = (ln.match(/{/g) || []).length;
      const fecha = (ln.match(/}/g) || []).length;
      if (/@media/.test(ln)) { media = ln.replace(/[{].*/, '').trim(); mediaProf = prof; }
      if (/{\s*$/.test(ln) && !/@media/.test(ln)) selAtual = ln.replace(/\s*{\s*$/, '').trim();
      if (/safe-area-inset-top/.test(ln) && /padding/.test(ln)) {
        out.push({ arq, sel: selAtual, media, valor: ln.trim() });
      }
      prof += abre - fecha;
      if (mediaProf >= 0 && prof <= mediaProf) { media = ''; mediaProf = -1; }
    });
  });
  return out;
}

const regras = regrasDeTopo();
ok(regras.length >= 8, 'achou as regras de safe-area (' + regras.length + ')');

/* Casa o prefixo html.X / html:not(.X) do seletor contra as classes de um contexto. */
function casa(sel, classes) {
  const m = sel.match(/^html((?:\.[a-z-]+)*)(:not\(\.([a-z-]+)\))?/);
  if (!m) return true;                                   // sem prefixo html → vale sempre
  const exige = (m[1] || '').split('.').filter(Boolean);
  if (exige.some((c) => !classes.includes(c))) return false;
  if (m[3] && classes.includes(m[3])) return false;
  return true;
}

const CONTEXTOS = [
  { nome: 'PWA instalado (iOS)', classes: [], standalone: true },
  { nome: 'nativo iOS',          classes: ['sp-native', 'sp-ios'], standalone: false },
  { nome: 'nativo Android',      classes: ['sp-native', 'sp-android'], standalone: false }
];

// ── (1) A TOPBAR tem safe-area nos TRÊS contextos que precisam ────────────
// O navegador comum fica de fora de propósito: ali o inset é 0 e a topbar não vai sob nada.
CONTEXTOS.forEach((ctx) => {
  const aplicaveis = regras.filter((r) =>
    r.sel.includes('.topbar') &&
    casa(r.sel, ctx.classes) &&
    (!/display-mode/.test(r.media) || ctx.standalone)
  );
  ok(aplicaveis.length > 0,
     'a topbar tem safe-area em ' + ctx.nome + ' — sem isto o logo encavala no relógio/ilha');
});

// ── (2) A REGRA DO PWA existe e está no @media certo ──────────────────────
// Era ela que estava morta. `:not(.sp-native)` é obrigatório: sem o escopo ela venceria
// a do app nativo, que usa outra fórmula (lá o WKWebView reporta o inset diferente).
{
  const pwa = regras.filter((r) => r.sel.includes('.topbar') && /display-mode/.test(r.media));
  ok(pwa.length > 0, 'existe regra de topbar dentro de @media (display-mode: standalone)');
  ok(pwa.every((r) => /:not\(\.sp-native\)/.test(r.sel)),
     'a regra do PWA é escopada com :not(.sp-native) — não pode atropelar o app nativo');
}

// ── (3) O MODAL FULL-SCREEN (é o que abre no "Entrar") ───────────────────
{
  const mh = regras.filter((r) => r.sel.includes('.modal-header'));
  ok(mh.length > 0, 'o cabeçalho de modal tem safe-area');
  ok(mh.some((r) => !/^html/.test(r.sel)),
     'há uma regra de modal-header SEM escopo de plataforma — é ela que cobre o PWA');
}

// ── (4) OS OVERLAYS full-screen cobrem native E não-native ───────────────
// Eles tapam a topbar inteira, então o cabeçalho deles fica colado no relógio.
['#live-scoring-overlay', '#casual-match-overlay', '#venues-detail-overlay'].forEach((id) => {
  const doOverlay = regras.filter((r) => r.sel.includes(id));
  ok(doOverlay.length > 0, id + ' trata safe-area');
  ok(doOverlay.some((r) => /:not\(\.sp-native\)/.test(r.sel)),
     id + ' cobre também quem NÃO é app nativo (PWA/navegador)');
});

// ── (5) OS PRESSUPOSTOS que fazem tudo isso funcionar ────────────────────
{
  const html = ler('index.html');
  ok(/viewport-fit=cover/.test(html),
     'o viewport é viewport-fit=cover — sem isso env(safe-area-inset-*) é sempre 0');
  ok(/apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/.test(html),
     'a status bar do PWA é black-translucent (é POR ISSO que o inset é obrigatório ali)');
  ok(/classList\.add\('sp-native'\)/.test(html) && /classList\.add\('sp-'\s*\+\s*p\)/.test(html),
     'o <html> ganha sp-native + sp-<plataforma> — é o que separa os contextos');
}

// ── (6) O CONTEÚDO acompanha a topbar que CRESCEU ────────────────────────
// A topbar é fixed; com o inset ela fica mais alta. Se o back-header continuasse num
// `top` fixo, ele entraria por baixo dela. Quem resolve é o _reflowChrome, medindo a
// altura REAL — sem isso, consertar a topbar quebraria a tela logo abaixo.
{
  const store = ler('js/store.js');
  const i = store.indexOf('_reflowChrome = function');
  ok(i > 0, 'achou _reflowChrome');
  // A função é longa (comentários extensos) — vai até a próxima atribuição em window.
  const fim = store.indexOf('\nwindow.', i + 10);
  const corpo = _R.ateOFim(store, i);
  ok(/getBoundingClientRect\(\)\.height/.test(corpo), 'ele MEDE a altura real da topbar');
  ok(/bh\.style\.top\s*=/.test(corpo), 'e reposiciona o back-header por essa medida');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
