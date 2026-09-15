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
must(/\.bracket-scroll-content\s*>\s*\.bracket-round-column[\s\S]{0,350}width\s*:\s*calc\(100vw - 4rem\)[\s\S]{0,350}min-width\s*:\s*calc\(100vw - 4rem\)\s*!important/.test(css),
  'a regra móvel vence o min-width inline de 280px e usa a largura útil');
must(/_dashProfileUids[\s\S]{0,900}add\(m && m\.p1Uid\)[\s\S]{0,80}add\(m && m\.p2Uid\)/.test(dashboard),
  'a dashboard pré-carrega também os UIDs de jogos individuais');
must(/\['team1Uids', 'p1', 'p1Uid'\][\s\S]{0,450}!uids\.length && m && m\[lado\[2\]\]/.test(dashboard),
  'a reserva de nome cobre o UID individual depois de confirmar a ausência do perfil público');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent('<style>' + css + '</style><div class="bracket-sticky-scroll-wrapper" style="width:100%;overflow-x:auto"><div class="bracket-scroll-content" style="display:inline-flex;gap:32px;min-width:max-content"><div class="bracket-round-column" style="display:flex;min-width:280px"><div class="sp-match-card" style="padding:14px">Jogo</div></div><div class="bracket-round-column" style="display:flex;min-width:280px"><div class="sp-match-card">Próximo</div></div></div></div>');
  const r = await page.evaluate(() => {
    const col = document.querySelector('.bracket-round-column');
    const card = document.querySelector('.sp-match-card');
    return { col: col.getBoundingClientRect().width, card: card.getBoundingClientRect().width };
  });
  await browser.close();
  must(r.col >= 325 && r.card >= r.col - 1,
    'em 390px a rodada e seu card ocupam a coluna útil inteira (' + r.col.toFixed(0) + 'px)');
  console.log('\n✓ ' + ok + '/' + ok + ' passaram');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
