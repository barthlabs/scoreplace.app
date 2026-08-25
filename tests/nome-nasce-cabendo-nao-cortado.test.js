/* O NOME NASCE CABENDO — a prova do "scroll cortado", no HTML REAL e no motor do Safari.
 *
 * RELATO DO DONO, repetido por dias: _"scroll cortado"_, _"quando scrolla vem cortado"_.
 * Já tinha sido atribuído ao `content-visibility` (banido), ao `contain:paint` (retirado)
 * e às fatias de render (mortas) — e VOLTAVA. A causa real é mais simples e estava à
 * vista: o nome NASCE sem caber.
 *
 * MEDIDO (24/ago/2026), no HTML que o `renderBracket` REAL produz para a chave REAL do
 * Confra (fixtures/confra-pos-sorteio), aberto no WebKit a 390px, ANTES de o motor de
 * ajuste rodar:
 *     324 de 324 nomes (100%) CORTADOS — texto de 17px numa caixa de 15px.
 * Ou seja: todo card que entra na tela ao rolar mostra o nome cortado até o ajuste
 * alcançá-lo. É exatamente o que a pessoa vê rolando.
 *
 * POR QUÊ: `.sp-name-fit` não tinha estilo NENHUM — o nome nascia com a fonte HERDADA do
 * corpo (~14,6px, line-height ~17px) dentro de `.sp-mc-box`, que tem altura FIXA e
 * `overflow:hidden` dimensionada para uma fonte menor.
 *
 * O QUE ESTE TESTE TRAVA: enquanto não ajustado (`:not([data-fitted])`), o nome cabe na
 * caixa POR CONSTRUÇÃO (fonte derivada de `--sp-box-h`). O motor então o faz CRESCER.
 * Nascer pequeno e crescer é incomparavelmente melhor que nascer cortado.
 *
 * ⚠️ Este teste NÃO lê CSS nem código: ele MEDE o layout do HTML de produção. É a única
 * régua que não mente sobre "cabe ou não cabe".
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let webkit;
try { webkit = require(path.join(ROOT, 'node_modules', 'playwright')).webkit; }
catch (e) { console.log('  · playwright ausente — teste pulado'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── o nome nasce cabendo (HTML real da chave, motor do Safari) ────');

// 1) gera o HTML REAL pelo renderizador de produção (não é markup de mentirinha)
const H = require('./render-harness');
const w = H.window;
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
const tour = fixture.tournament || fixture;
w.AppStore = { tournaments: [tour], currentUser: { uid: tour.creatorUid || 'u1', email: 'x@x.com', displayName: 'Dono' } };
w._currentBracketTournament = tour;
let html = '';
const box = {
  style: {}, dataset: {}, setAttribute() {}, getAttribute() { return null },
  querySelector() { return null }, querySelectorAll() { return [] }, appendChild() {},
  addEventListener() {}, classList: { add() {}, remove() {}, contains() { return false } }, children: [],
  set innerHTML(v) { html = v; }, get innerHTML() { return html; }
};
w.renderBracket(box, tour.id, true);
ok(html.length > 50000, 'o renderizador REAL produziu a chave (' + Math.round(html.length / 1024) + ' KB)');
const nSpans = (html.match(/sp-name-fit/g) || []).length;
ok(nSpans > 100, 'e ela tem nomes de verdade (' + nSpans + ' spans)');

const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
  .map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');

(async () => {
  let browser;
  try { browser = await webkit.launch(); }
  catch (e) {
    console.log('  · motor WebKit indisponível — teste PULADO (rode: npx playwright install webkit)');
    process.exit(0);
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.setContent(
    '<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' + CSS + '</style></head><body style="margin:0;background:#0f172a">' +
    '<div id="view-container">' + html + '</div></body></html>', { waitUntil: 'load' });

  const r = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.sp-name-fit'));
    let cortados = 0; const exemplos = [];
    els.forEach((el) => {
      const b = el.parentElement; if (!b) return;
      if (el.scrollWidth > b.clientWidth + 1 || el.scrollHeight > b.clientHeight + 1) {
        cortados++;
        if (exemplos.length < 4) exemplos.push({
          txt: (el.textContent || '').trim().slice(0, 22),
          fonte: getComputedStyle(el).fontSize,
          texto: el.scrollWidth + 'x' + el.scrollHeight,
          caixa: b.clientWidth + 'x' + b.clientHeight
        });
      }
    });
    return { total: els.length, cortados, exemplos };
  });
  await browser.close();

  console.log('  · ' + r.cortados + ' de ' + r.total + ' nomes cortados ANTES do ajuste');
  r.exemplos.forEach((e) => console.log('     ❌ fonte ' + e.fonte + '  texto ' + e.texto + '  caixa ' + e.caixa + '  "' + e.txt + '"'));

  // ⛔ ZERO. Não é "poucos": um card cortado na tela é o relato do dono.
  ok(r.cortados === 0,
    'NENHUM nome nasce cortado (era 324 de 324 antes da 2.0.66) — é isto que a pessoa vê ao rolar');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
  process.exit(fail ? 1 : 0);
})();
