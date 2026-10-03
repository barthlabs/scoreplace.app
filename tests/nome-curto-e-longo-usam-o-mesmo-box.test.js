'use strict';
/* A dupla não pode ter a geometria alterada pelo tamanho do nome.
 * Cenário real informado: "Leila Arida" cabe em uma linha; "Lucia Helena Silva Cerri"
 * usa duas linhas com fonte menor. Ambas reservam duas linhas: nome longo não aumenta
 * o card e nome curto não o encolhe. */
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
const TOURNAMENTS = read('js/views/tournaments.js');
const VENDOR_TOURNAMENTS = read('functions-autodraw/vendor/tournaments.js');
const CATEGORIES = read('js/views/tournaments-categories.js');
const VENDOR_CATEGORIES = read('functions-autodraw/vendor/tournaments-categories.js');
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
must(/--sp-match-team-member-gap:2px/.test(CSS) && /\.sp-mc-col\{[^}]*justify-content:flex-start[^}]*gap:var\(--sp-match-team-member-gap\)/.test(CSS) && recent.includes('window.renderMatchCard(m2'),
  'dashboard e chave usam a mesma variável canônica de 2px, sem vão elástico, entre integrantes da dupla');
must(/data-mr-card="1"/.test(DASHBOARD) && /data-nov-card="1"/.test(DASHBOARD),
  'todo wrapper de card de resultados e novidades declara o atributo que estica a fileira');
must(TOURNAMENTS === VENDOR_TOURNAMENTS && CATEGORIES === VENDOR_CATEGORIES,
  'vendor do AutoDraw é idêntico às fontes de detalhe e de duração total');

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
must(Math.abs(m.leila.height - m.lucia.height) < 0.5, 'nomes curtos e longos reservam a mesma altura de duas linhas');
  must(m.gap === 2 && Math.abs(m.rowGap - 2) < 0.5, 'o espaço canônico entre participantes é 2px, sem linha vazia');
  must(!m.leila.cut && !m.lucia.cut, 'nenhum dos dois nomes é truncado');
  console.log('\n✅ nome curto e longo no mesmo box — ' + ok + ' verificações');
})();
