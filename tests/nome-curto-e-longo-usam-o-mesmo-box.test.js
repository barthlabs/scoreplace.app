'use strict';
/* A dupla não pode punir o nome curto por ter uma parceira de nome longo.
 * Cenário real informado: "Leila Arida" cabe em uma linha; "Lucia Helena Silva Cerri"
 * usa duas linhas com fonte menor. A caixa curta encolhe depois do fit; a longa preserva
 * duas linhas, e o vão entre participantes permanece canônico em todos os cards. */
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
const recentIni = DASHBOARD.indexOf('// ── Últimos resultados confirmados');
const recentFim = DASHBOARD.indexOf('// Agrupa por (grupo + torneio)', recentIni);
const recent = DASHBOARD.slice(recentIni, recentFim);
must(/data-two-line-maxrem/.test(BRACKET) && /data-sp-card-name-box/.test(BRACKET) &&
  recent.includes('window.renderMatchCard(m2'),
  'Últimos Resultados usa o mesmo contrato adaptativo da chave, por delegação');
must(!/data-fit-group/.test(BRACKET) && !/data-fit-group/.test(DASHBOARD),
  'nenhum render força o nome curto a acompanhar a quebra do parceiro');
must(/--sp-match-team-member-gap:4px/.test(CSS) && /\.sp-mc-col\{[^}]*gap:var\(--sp-match-team-member-gap\)/.test(CSS) && recent.includes('window.renderMatchCard(m2'),
  'dashboard e chave usam a mesma variável canônica de 4px entre integrantes da dupla');

(async function () {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 300 } });
  const pessoa = (id, nome) => '<div class="sp-mc-side"><i style="width:22px;height:22px;flex:0 0 22px"></i>' +
    '<div class="sp-mc-box" data-sp-card-name-box data-sp-one-line-h="1.03rem" data-sp-two-line-h="1.89rem" style="--sp-box-h:1.89rem"><span id="' + id + '" class="sp-name-fit sp-mc-nm" ' +
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
    const a = document.getElementById('leila').parentElement.parentElement.getBoundingClientRect();
    const b = document.getElementById('lucia').parentElement.parentElement.getBoundingClientRect();
    return { leila: one('leila'), lucia: one('lucia'), gap: parseFloat(getComputedStyle(document.getElementById('dupla')).gap), rowGap: b.top - a.bottom };
  });
  await b.close();
  must(m.leila.lines === 1, 'Leila Arida permanece em uma linha');
  must(m.lucia.lines === 2, 'Lucia Helena Silva Cerri usa duas linhas');
  must(m.leila.fs > m.lucia.fs, 'o nome curto fica maior que o nome longo');
  must(m.leila.height < m.lucia.height, 'a caixa do nome curto encolhe e a do nome longo preserva duas linhas');
  must(m.gap === 4 && Math.abs(m.rowGap - 4) < 0.5, 'o espaço canônico entre participantes é 4px, sem linha vazia');
  must(!m.leila.cut && !m.lucia.cut, 'nenhum dos dois nomes é truncado');
  console.log('\n✅ nome curto e longo no mesmo box — ' + ok + ' verificações');
})();
