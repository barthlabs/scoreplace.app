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
  /\.bracket-scroll-content\s*>\s*\.bracket-round-column[\s\S]{0,280}width\s*:\s*100cqi[\s\S]{0,280}min-width\s*:\s*100cqi\s*!important/.test(css) &&
  /@container\s*\(min-width\s*:\s*760px\)[\s\S]{0,600}width\s*:\s*calc\(\(100cqi - 1rem\) \/ 2\)/.test(css),
  'a grade usa a largura útil do painel: uma coluna cheia ou duas quando cabem');
must(/_dashProfileUids[\s\S]{0,900}add\(m && m\.p1Uid\)[\s\S]{0,80}add\(m && m\.p2Uid\)/.test(dashboard),
  'a dashboard pré-carrega também os UIDs de jogos individuais');
must(/\['team1Uids', 'p1', 'p1Uid'\][\s\S]{0,450}!uids\.length && m && m\[lado\[2\]\]/.test(dashboard),
  'a reserva de nome cobre o UID individual depois de confirmar a ausência do perfil público');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 844 } });
  await page.setContent('<style>' + css + '</style><div id="narrow" class="bracket-sticky-scroll-wrapper" style="width:650px;overflow-x:auto"><div class="bracket-scroll-content" style="display:inline-flex;gap:32px;min-width:max-content"><div class="bracket-round-column" style="display:flex;min-width:280px"><div class="sp-match-card" style="padding:14px">Jogo</div></div><div class="bracket-round-column" style="display:flex;min-width:280px"><div class="sp-match-card">Próximo</div></div></div></div><div id="wide" class="bracket-sticky-scroll-wrapper" style="width:900px;overflow-x:auto"><div class="bracket-scroll-content" style="display:inline-flex;gap:32px;min-width:max-content"><div class="bracket-round-column" style="display:flex;min-width:280px"><div class="sp-match-card">Jogo</div></div><div class="bracket-round-column" style="display:flex;min-width:280px"><div class="sp-match-card">Próximo</div></div></div></div>');
  const r = await page.evaluate(() => {
    const sizes = (id) => Array.from(document.querySelector('#' + id).querySelectorAll('.bracket-round-column')).map((col) => ({ col: col.getBoundingClientRect().width, card: col.querySelector('.sp-match-card').getBoundingClientRect().width }));
    return { narrow: sizes('narrow'), wide: sizes('wide') };
  });
  await browser.close();
  must(r.narrow[0].col >= 648 && r.narrow[0].card >= r.narrow[0].col - 1,
    'em painel estreito a rodada e o card ocupam a largura inteira (' + r.narrow[0].col.toFixed(0) + 'px)');
  must(r.wide[0].col >= 440 && r.wide[0].col <= 445 && r.wide[1].col >= 440,
    'em painel largo duas rodadas dividem a largura útil (' + r.wide[0].col.toFixed(0) + 'px cada)');
  console.log('\n✓ ' + ok + '/' + ok + ' passaram');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
