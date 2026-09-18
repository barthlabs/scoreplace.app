/* Card de rodada estreita usa a largura útil e preserva espaço para nomes legíveis.
 * Exercita a regra CSS real e a régua canônica, não uma cópia do layout. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
const model = fs.readFileSync(path.join(root, 'js/views/bracket-model.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
let ok = 0;
function must(value, label) { assert.ok(value, label); ok++; console.log('  ✓ ' + label); }

const W = { window: null }; W.window = W;
vm.runInNewContext(model, W);
const dupla = W._cardNomeGeo(2), solo = W._cardNomeGeo(1);
must(dupla.maxRem >= 0.86 && solo.maxRem >= 0.94,
  'a régua canônica entrega fonte legível para dupla e individual');
must(dupla.boxH >= dupla.maxRem * 2.1 && solo.boxH >= solo.maxRem * 2.1,
  'a caixa canônica reserva duas linhas antes de reduzir a fonte');
must(/\.bracket-sticky-scroll-wrapper\s*\{[\s\S]{0,900}container-type\s*:\s*inline-size/.test(css) &&
  /\.bracket-scroll-container\s*\{[\s\S]{0,220}container-type\s*:\s*inline-size/.test(css) &&
  /\.bracket-columns-track\s*\{[\s\S]{0,340}width\s*:\s*100%\s*!important[\s\S]{0,160}min-width\s*:\s*100%\s*!important/.test(css) &&
  /@container\s*\(min-width\s*:\s*736px\)[\s\S]{0,600}width\s*:\s*calc\(\(100% - 1rem\) \/ 2\)\s*!important/.test(css) &&
  /@container\s*\(min-width\s*:\s*1112px\)[\s\S]{0,600}width\s*:\s*calc\(\(100% - 2rem\) \/ 3\)\s*!important/.test(css),
  'a grade usa uma, duas ou três colunas conforme a largura útil do painel');
must(/bracket-scroll-container[\s\S]{0,260}bracket-columns-track/.test(bracket) &&
  /bracket-round-column[\s\S]{0,160}min-width:280px/.test(bracket),
  'todos os renderizadores de chave entregam o mesmo trilho e as mesmas colunas');
must(/_dashProfileUids[\s\S]{0,900}add\(m && m\.p1Uid\)[\s\S]{0,80}add\(m && m\.p2Uid\)/.test(dashboard),
  'a dashboard pré-carrega também os UIDs de jogos individuais');
must(/\['team1Uids', 'p1', 'p1Uid'\][\s\S]{0,450}!uids\.length && m && m\[lado\[2\]\]/.test(dashboard),
  'a reserva de nome cobre o UID individual depois de confirmar a ausência do perfil público');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 844 } });
  const cards = (n) => Array.from({ length:n }, (_, i) =>
    '<div class="bracket-round-column" style="display:flex;min-width:280px"><div class="sp-match-card" style="padding:14px">Jogo ' + i + '</div></div>').join('');
  const track = (id, width, count, legacy) =>
    '<div id="' + id + '" class="' + (legacy ? 'bracket-scroll-container' : 'bracket-sticky-scroll-wrapper') + '" style="width:' + width + 'px;overflow-x:auto">' +
      '<div class="' + (legacy ? 'bracket-columns-track' : 'bracket-scroll-content') + '" style="display:inline-flex;gap:32px;min-width:max-content">' + cards(count) + '</div></div>';
  await page.setContent('<style>' + css + '</style>' + track('phone', 500, 2, true) + track('medium', 760, 3, true) + track('wide', 1120, 4, false));
  const r = await page.evaluate(() => {
    const sizes = (id) => Array.from(document.querySelector('#' + id).querySelectorAll('.bracket-round-column')).map((col) => ({ col: col.getBoundingClientRect().width, card: col.querySelector('.sp-match-card').getBoundingClientRect().width }));
    return { phone: sizes('phone'), medium: sizes('medium'), wide: sizes('wide') };
  });
  await browser.close();
  must(r.phone[0].col >= 498 && r.phone[0].card >= r.phone[0].col - 1,
    'em painel estreito o card ocupa a largura inteira (' + r.phone[0].col.toFixed(0) + 'px)');
  must(r.medium.slice(0, 2).every((x) => x.col >= 371 && x.col <= 373 && x.card >= x.col - 1),
    'em painel médio duas rodadas dividem a largura útil (' + r.medium[0].col.toFixed(0) + 'px cada)');
  must(r.wide.slice(0, 3).every((x) => x.col >= 361 && x.col <= 364 && x.card >= x.col - 1),
    'em painel largo três rodadas dividem a largura útil (' + r.wide[0].col.toFixed(0) + 'px cada)');
  console.log('\n✓ ' + ok + '/' + ok + ' passaram');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
