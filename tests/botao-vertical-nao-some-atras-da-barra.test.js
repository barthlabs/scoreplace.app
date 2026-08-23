/* BOTÃO VERTICAL STICKY NÃO SOME ATRÁS DO CROMO GRUDADO NO TOPO.
 *
 * RELATO DO DONO (23/ago/2026, com print): _"a fase anterior está cortada."_ — o botão
 * vertical "👁 Fase anterior", à esquerda da chave, mostrava só "Fase a".
 *
 * A CAUSA MEDIDA — e o texto NÃO estava cortado: o botão estava ESCONDIDO. Ele grudava em
 * `top:112px`, um número fixo, enquanto o que fica colado no topo do app é topbar +
 * dropdown do hamburger + back-header + barra sticky de busca. Medido com o cromo real
 * (62+52+56 = 170px de barra): dos 120px do botão, **58px ficavam por baixo** — quase
 * metade. O texto que sobrava embaixo da barra era exatamente "Fase a".
 *
 * É o MESMO defeito que o `scroll-margin-top:120px` fixo já tinha causado nos cards e
 * caixas de grupo (v1.5.22) e que deu origem a `--scroll-anchor` — a FONTE ÚNICA de "tudo
 * que fica grudado no topo", medida a cada reflow em `_reflowChrome` (store.js). Os cinco
 * botões verticais do bracket seguiam com o número fixo, fora dessa fonte.
 *
 * A CURA: `top: var(--scroll-anchor, <antigo>)` nos cinco. O fallback preserva o valor de
 * hoje antes do 1º reflow.
 *
 * Cobre os dois lados:
 *   • ESTÁTICO: nenhum sticky vertical do bracket pode voltar a cravar `top:<n>px`;
 *   • MEDIDO: Chromium com o cromo real empilhado — o botão ancorado na variável fica
 *     100% visível, e o ancorado no número fixo FALHA na mesma régua.
 *
 * Roda com: node tests/botao-vertical-nao-some-atras-da-barra.test.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}

/* ── 1. ESTÁTICO ──────────────────────────────────────────────────────────────────── */
function varrerTopFixo() {
  console.log('\n① Sticky vertical ancorado em --scroll-anchor, nunca em px cravado');
  const src = read('js/views/bracket.js');
  // toda declaração de sticky que acompanha um writing-mode (= botão/aba vertical)
  const trechos = src.split('writing-mode');
  let comVar = 0;
  const cravados = [];
  for (let i = 1; i < trechos.length; i++) {
    // olha os ~160 chars ANTES do writing-mode, onde mora o `position:sticky;top:...`
    const antes = trechos[i - 1].slice(-160);
    const mSticky = antes.match(/position:sticky;top:([^;]+);/);
    if (!mSticky) continue;
    if (/var\(--scroll-anchor/.test(mSticky[1])) comVar++;
    else cravados.push(mSticky[1]);
  }
  ok(comVar >= 5, comVar + ' sticky(s) vertical(is) ancorado(s) em --scroll-anchor (esperado ≥ 5)');
  ok(cravados.length === 0, 'nenhum com top cravado' + (cravados.length ? ' — ' + cravados.join(', ') : ''));
}

/* ── 2. MEDIDO ────────────────────────────────────────────────────────────────────── */
const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
  .map(read).join('\n');

// o cromo REAL do app, empilhado: topbar + back-header + barra sticky de busca.
const TOPBAR = 62, BACKH = 52, BARRA = 56, RESPIRO = 12;
const ANCORA = TOPBAR + BACKH + BARRA + RESPIRO;

function botao(id, top) {
  return '<button id="' + id + '" class="btn btn-micro btn-outline" style="position:sticky;top:' + top +
    ';align-self:flex-start;writing-mode:vertical-rl;transform:rotate(180deg);padding:14px 7px;' +
    'flex-shrink:0;margin:0;line-height:1.15;white-space:nowrap;z-index:5;">👁 Fase anterior</button>';
}

async function medir() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(
    '<style>' + CSS + '</style><body style="background:#0b1220;margin:0;">' +
    '<div style="position:fixed;top:0;left:0;right:0;height:' + TOPBAR + 'px;background:#111827;z-index:50;"></div>' +
    '<div style="position:fixed;top:' + TOPBAR + 'px;left:0;right:0;height:' + BACKH + 'px;background:#0f172a;z-index:49;"></div>' +
    '<div id="barra" style="position:sticky;top:' + (TOPBAR + BACKH) + 'px;height:' + BARRA + 'px;background:#0b1220;' +
      'z-index:40;margin-top:' + (TOPBAR + BACKH) + 'px;"></div>' +
    '<div style="display:flex;align-items:flex-start;gap:10px;">' +
      botao('cravado', '112px') +
      botao('ancorado', ANCORA + 'px') +
      '<div style="flex:1;height:3000px;background:#111827;"></div>' +
    '</div></body>', { waitUntil: 'load' });
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(120);
  const out = await page.evaluate(() => {
    const fundo = document.getElementById('barra').getBoundingClientRect().bottom;
    const ler = (id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { altura: +r.height.toFixed(1), escondido: +Math.max(0, fundo - r.top).toFixed(1) };
    };
    return { cravado: ler('cravado'), ancorado: ler('ancorado') };
  });
  await browser.close();
  return out;
}

(async function () {
  varrerTopFixo();
  console.log('\n② Chromium com o cromo real (topbar+back-header+barra = ' + (ANCORA - RESPIRO) + 'px)');
  const m = await medir();
  ok(m.ancorado.escondido === 0,
    'ancorado em --scroll-anchor: 0px escondidos (altura ' + m.ancorado.altura + 'px)');
  ok(m.cravado.escondido > 10,
    'o top cravado de antes FALHA na mesma régua: ' + m.cravado.escondido + 'px de ' +
    m.cravado.altura + 'px por baixo da barra');

  console.log('\n' + (falhas ? '✗ ' + falhas + '/' + testes + ' falharam' : '✓ ' + testes + '/' + testes + ' passaram'));
  process.exit(falhas ? 1 : 0);
})();
