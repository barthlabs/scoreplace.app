/* O "ENTRAR" DA LANDING NUNCA PODE FICAR MUDO.
 *
 * INCIDENTE (relatado ao vivo, 12/ago/2026): "quando você atualiza, volta pra landing com o
 * botão Entrar quebrado; clica, clica, clica e não entra e não mostra nenhum feedback".
 *
 * CAUSA: a landing é um snapshot ESTÁTICO (prerender) — ela pinta assim que o HTML chega.
 * Mas o `onclick` dela tentava, nesta ordem, `_enterApp` → `openModal` → `handleGoogleLogin`,
 * e as TRÊS moram em js/ carregado com `defer`. Enquanto nenhuma existe, o clique caía no
 * vazio: sem ação, sem aviso, sem fila. A janela fica enorme logo DEPOIS DE UM UPDATE,
 * porque `_applyUpdate` apaga os caches e desregistra o SW — aí todo o JS vem da rede.
 *
 * A REGRA: o primeiro toque SEMPRE responde. Se o app ainda não subiu, o botão avisa que
 * está entrando e o toque fica GUARDADO pra disparar sozinho quando subir — o usuário não
 * toca duas vezes.
 *
 * Este teste trava as três pernas: o handler existe, roda ANTES dos scripts com defer
 * (senão ele próprio não estaria pronto no clique), e os CTAs do snapshot apontam pra ele.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const landing = fs.readFileSync(path.join(ROOT, 'js', 'views', 'landing.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── entrar nunca fica mudo ────');

// ── 1. O handler existe e é INLINE (sem src, sem defer) ────────────────────────────────
const mHandler = /<script>\s*\(function \(\) \{[\s\S]*?window\._spEnterClick[\s\S]*?\}\)\(\);\s*<\/script>/.exec(html);
ok(!!mHandler, 'o handler _spEnterClick tem que existir como <script> INLINE no index.html');

// ── 2. Ele roda ANTES do primeiro script com defer ─────────────────────────────────────
const posHandler = html.indexOf('window._spEnterClick');
const posPrimeiroDefer = html.search(/<script src="[^"]+" defer><\/script>/);
ok(posHandler !== -1 && posPrimeiroDefer !== -1 && posHandler < posPrimeiroDefer,
   'o handler precisa ser definido ANTES do primeiro <script defer> — senão ele mesmo ' +
   'não existe na hora do toque (handler ' + posHandler + ', 1º defer ' + posPrimeiroDefer + ')');

// ── 3. Os CTAs (no fonte E no snapshot prerenderizado) apontam pro handler ─────────────
const ctasFonte = (landing.match(/onclick="if\(window\._spEnterClick\)/g) || []).length;
ok(ctasFonte === 2, 'os 2 CTAs de landing.js usam _spEnterClick — achei ' + ctasFonte);
const ctasSnap = (html.match(/onclick="if\(window\._spEnterClick\)/g) || []).length;
ok(ctasSnap === 2, 'o snapshot prerenderizado carrega os 2 CTAs novos — achei ' + ctasSnap);
ok(!/onclick="if\(window\._enterApp\)window\._enterApp\(this\);else/.test(html),
   'REGRESSÃO: nenhum CTA pode voltar ao onclick antigo (que ficava mudo sem o JS)');

// ── 4. COMPORTAMENTO: roda o handler REAL extraído do index.html ───────────────────────
if (mHandler) {
  const codigo = mHandler[0].replace(/^<script>/, '').replace(/<\/script>$/, '');

  function botaoFalso() {
    const l1 = { textContent: 'Entrar' };
    return { _l1: l1, attrs: {}, style: {},
      querySelector: () => l1,
      hasAttribute(k) { return k in this.attrs; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      removeAttribute(k) { delete this.attrs[k]; } };
  }
  function sandbox() {
    const sb = { console };
    sb.window = sb; sb.globalThis = sb;
    sb.document = { querySelector: () => null };
    sb.setInterval = (fn, ms) => { sb._tick = fn; return 1; };
    sb.clearInterval = () => { sb._tick = null; };
    sb.abriu = [];
    vm.createContext(sb);
    vm.runInContext(codigo, sb, { filename: 'handler.js' });
    return sb;
  }

  // (a) app ainda NÃO subiu: responde na hora e guarda o toque
  const sb = sandbox();
  const btn = botaoFalso();
  sb._spEnterClick(btn);
  ok(btn._l1.textContent === 'Entrando…',
     'sem o app carregado, o toque muda o rótulo pra "Entrando…" — veio "' + btn._l1.textContent + '"');
  ok(btn.getAttribute('aria-busy') === 'true' && btn.style.opacity,
     'e marca o botão como ocupado (aria-busy + opacidade), pra não parecer morto');

  // (b) tocar de novo não empilha
  const antes = sb._tick;
  sb._spEnterClick(btn);
  ok(sb._tick === antes, 'clicar de novo enquanto espera NÃO empilha outra espera');

  // (c) o app sobe → o toque guardado dispara SOZINHO e o botão volta ao normal
  sb.openModal = (id) => sb.abriu.push(id);
  sb._tick();
  ok(sb.abriu.length === 1 && sb.abriu[0] === 'modal-login',
     'quando o app sobe, o toque guardado abre o login sozinho — abriu ' + JSON.stringify(sb.abriu));
  ok(btn._l1.textContent === 'Entrar' && btn.getAttribute('aria-busy') === null,
     'e o botão volta ao rótulo original, sem ficar preso em "Entrando…"');

  // (d) app JÁ pronto: caminho direto, sem estado intermediário
  const sb2 = sandbox();
  sb2.openModal = (id) => sb2.abriu.push(id);
  const btn2 = botaoFalso();
  sb2._spEnterClick(btn2);
  ok(sb2.abriu.length === 1 && btn2._l1.textContent === 'Entrar',
     'com o app pronto, abre direto e nem mexe no rótulo');

  // (e) desistir depois de 15s em vez de deixar "Entrando…" pra sempre
  const sb3 = sandbox();
  const btn3 = botaoFalso();
  sb3.showNotification = (t, m, k) => sb3.abriu.push(k);
  sb3._spEnterClick(btn3);
  for (let i = 0; i < 130 && sb3._tick; i++) sb3._tick();   // 130 * 120ms > 15s
  ok(btn3._l1.textContent === 'Entrar' && sb3.abriu.indexOf('error') !== -1,
     'se o app não subir, o botão destrava e AVISA — não troca um silêncio por outro');
}

console.log(fail === 0 ? '  ✓ ' + pass + ' asserções' : '  ' + pass + ' ok / ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
