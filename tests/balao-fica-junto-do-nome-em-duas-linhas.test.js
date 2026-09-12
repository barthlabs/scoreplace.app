'use strict';
/* ⛔ O BALÃO TEM DE CAIR DEPOIS DA ÚLTIMA PALAVRA — EM UMA OU EM DUAS LINHAS.
 * Relato do dono (12/set/2026, jogo 112): _"o balãozinho da Lucia Cerri tem alguma
 * inconsistência, não está junto ao nome dela"_.
 * MEDIDO no Chromium, com a geometria real do card (.sp-mc-box > .sp-mc-nm):
 *     leila arida (1 linha) .......... 6px do fim do nome   ← nunca deu problema
 *     Lucia Helena Silva Cerri (2) ... 44px
 *     Nádia Santiago Lazarin (2) ..... 61px
 * A causa é de LAYOUT, não de tamanho de fonte: em `inline-flex` o balão é item IRMÃO do
 * nome. Com uma linha ele cai logo depois e ninguém nota; com duas, o bloco do nome toma a
 * largura toda e o balão é empurrado para a borda, centrado no BLOCO e não na última linha.
 * Este teste mede no motor de verdade, porque foi assim que o defeito apareceu.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'css/components.css'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

/* a regra real do arquivo, não uma cópia — se alguém a mudar, este teste mede a mudança */
const regra = /\.sp-mc-nm\{[^}]*\}/.exec(CSS);
assert.ok(regra, 'âncora: a regra .sp-mc-nm em components.css');
must(!/display:inline-flex/.test(regra[0]),
  '⛔ .sp-mc-nm não é mais inline-flex — era isso que arrancava o balão do texto');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const caixa = /\.sp-mc-box\{[^}]*\}/.exec(CSS)[0];
  const card = (nome, duas) => `
    <div style="display:flex;align-items:center;gap:6px;width:120px;">
      <div class="sp-mc-box" style="--sp-box-h:${duas ? '2.1' : '1.05'}rem">
        <span class="sp-name-fit sp-mc-nm" style="font-size:0.8rem;${duas ? 'white-space:normal;text-wrap:balance;' : ''}"
          ><span data-uid-name>${nome}</span><span class="balao" style="font-size:0.78rem;margin-left:4px;flex-shrink:0;line-height:1;vertical-align:-0.12em;">💬</span></span>
      </div></div>`;
  await p.setContent('<style>' + caixa + regra[0] + '</style>' +
    card('leila arida', false) + card('Lucia Helena Silva Cerri', true) + card('Nádia Santiago Lazarin', true));
  const r = await p.evaluate(() => [...document.querySelectorAll('.sp-mc-box')].map((cx) => {
    const alvo = cx.querySelector('[data-uid-name]');
    const bal = cx.querySelector('.balao').getBoundingClientRect();
    const rg = document.createRange(); rg.selectNodeContents(alvo);
    const rects = [...rg.getClientRects()];
    const ult = rects[rects.length - 1];
    return {
      nome: alvo.textContent, linhas: rects.length,
      distancia: Math.round(bal.left - ult.right),
      desalinhoY: Math.round(Math.abs((bal.top + bal.height / 2) - (ult.top + ult.height / 2))),
      estoura: Math.round(bal.right - cx.getBoundingClientRect().right)
    };
  }));
  await b.close();

  const duasLinhas = r.filter((x) => x.linhas >= 2);
  must(duasLinhas.length === 2, 'o cenário do relato foi reproduzido: 2 nomes quebraram em duas linhas');
  r.forEach((x) => {
    must(x.distancia >= 0 && x.distancia <= 10,
      '"' + x.nome + '" (' + x.linhas + ' linha(s)): balão a ' + x.distancia + 'px do fim do nome — era 44 e 61');
    must(x.desalinhoY <= 6,
      '"' + x.nome + '": balão acompanha a ÚLTIMA linha (desalinho ' + x.desalinhoY + 'px), não o centro do bloco');
    must(x.estoura <= 0, '"' + x.nome + '": o balão não passa da borda da caixa');
  });
  console.log('\n✅ balão fica junto do nome em duas linhas — ' + ok + ' verificações');
})();
