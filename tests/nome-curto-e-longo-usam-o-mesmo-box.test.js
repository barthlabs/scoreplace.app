'use strict';
/* A dupla não pode punir o nome curto por ter uma parceira de nome longo.
 * Cenário real informado: "Leila Arida" cabe em uma linha; "Lucia Helena Silva Cerri"
 * ocupa as duas linhas reservadas, com fonte menor. Os dois boxes têm a mesma altura e
 * o vão entre participantes é o mesmo em dashboard e chave. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CSS = read('css/components.css');
const STORE = read('js/store.js');
const BRACKET = read('js/views/bracket.js');
const DASHBOARD = read('js/views/dashboard.js');
const i = STORE.indexOf('window._fitNameToBox = _fitOne;');
const FIT = STORE.slice(STORE.lastIndexOf('\n(function() {', i), STORE.indexOf('\n})();', i) + 6);
let ok = 0;
function must(v, m) { assert.ok(v, m); ok++; console.log('  ✓ ' + m); }

must(/twoLineMaxRem/.test(read('js/views/bracket-model.js')),
  'a geometria canônica declara um teto específico para duas linhas');
must(/data-two-line-maxrem/.test(BRACKET) && /data-two-line-maxrem/.test(DASHBOARD),
  'chave e dashboard passam o mesmo teto ao motor');
must(!/data-fit-group/.test(BRACKET) && !/data-fit-group/.test(DASHBOARD),
  'nenhum render força o nome curto a acompanhar a quebra do parceiro');
must(/\.sp-mc-col\{[^}]*gap:2px/.test(CSS) && /class="sp-mc-col" style="flex:1;min-width:0;"/.test(DASHBOARD),
  'dashboard e chave usam o mesmo vão vertical de 2px entre integrantes da dupla');

(async function () {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 300 } });
  const pessoa = (id, nome) => '<div class="sp-mc-side"><i style="width:22px;height:22px;flex:0 0 22px"></i>' +
    '<div class="sp-mc-box" style="--sp-box-h:1.89rem"><span id="' + id + '" class="sp-name-fit sp-mc-nm" ' +
    'data-maxrem="0.86" data-minrem="0.44" data-two-line-maxrem="0.71">' + nome + '</span></div></div>';
  await p.setContent('<style>' + CSS + '</style><main style="width:130px"><div class="sp-mc-col" id="dupla">' +
    pessoa('leila', 'Leila Arida') + pessoa('lucia', 'Lucia Helena Silva Cerri') + '</div></main>');
  await p.evaluate((code) => { eval(code); window._fitNames(document, 0); }, FIT);
  await p.waitForTimeout(250);
  const m = await p.evaluate(() => {
    const one = (id) => {
      const el = document.getElementById(id), box = el.parentElement;
      const range = document.createRange(); range.selectNodeContents(el);
      const cs = getComputedStyle(el), root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return { lines: [...range.getClientRects()].length, fs: parseFloat(cs.fontSize) / root,
        height: box.getBoundingClientRect().height, cut: el.scrollWidth > box.clientWidth + 1 || el.scrollHeight > box.clientHeight + 1 };
    };
    return { leila: one('leila'), lucia: one('lucia'), gap: parseFloat(getComputedStyle(document.getElementById('dupla')).gap) };
  });
  await b.close();
  must(m.leila.lines === 1, 'Leila Arida permanece em uma linha');
  must(m.lucia.lines === 2, 'Lucia Helena Silva Cerri usa duas linhas');
  must(m.leila.fs > m.lucia.fs, 'o nome curto fica maior que o nome longo');
  must(Math.abs(m.leila.height - m.lucia.height) < 0.5, 'os dois nomes ocupam caixas de mesma altura');
  must(m.gap === 2, 'o espaço entre participantes foi reduzido para 2px');
  must(!m.leila.cut && !m.lucia.cut, 'nenhum dos dois nomes é truncado');
  console.log('\n✅ nome curto e longo no mesmo box — ' + ok + ' verificações');
})();
