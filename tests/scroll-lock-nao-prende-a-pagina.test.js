#!/usr/bin/env node
/* A TRAVA DE SCROLL NUNCA PODE PRENDER A PÁGINA.
 *
 * INCIDENTE (11/ago/2026): "versao web nao abre no celular tela branca travada".
 * MEDIDO ao vivo em scoreplace.app, viewport de celular:
 *   • a landing ESTAVA montada — 4.216px de conteúdo, visibility visible, opacity 1
 *   • `document.documentElement.scrollHeight` preso em 812 (a altura da viewport)
 *   • `<body class="sp-scroll-locked">` → position:fixed + overflow:hidden
 *   • NENHUM overlay aberto (varredura dos filhos do body: zero candidatos)
 *   • `window._refreshScrollLock()` não resolvia
 *   • `requestAnimationFrame` NÃO DISPARAVA
 * Ou seja: a topbar aparecia e o resto da página existia, invisível.
 *
 * DUAS FALHAS EM SÉRIE, e cada uma sozinha bastaria:
 *  1. `schedule()` fazia `if (raf) return` e guardava o handle do rAF. Quando aquele frame
 *     nunca chega (aba em background no boot, bfcache do iOS, WebView suspensa), o handle
 *     fica pendente PARA SEMPRE e o schedule() nunca mais agenda nada — o mecanismo morre
 *     em silêncio.
 *  2. `apply()` só destravava com `!want && locked`, isto é, só desfazia o que ELE tivesse
 *     travado. Com a flag dessincronizada da classe, a classe fica presa e nada a remove.
 *
 * A REGRA: classe presa SEM overlay aberto é sempre erro, e nenhum agendamento pode
 * depender de um único callback que talvez não venha.
 *
 * Uso:  node tests/scroll-lock-nao-prende-a-pagina.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const raiz = path.resolve(__dirname, '..');
let ok = 0, bad = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { bad++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

const src = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
const i = src.indexOf('TRAVA DE SCROLL DE FUNDO');
assert.ok(i > 0, 'o bloco da trava de scroll sumiu do store.js');
const bloco = src.slice(i, src.indexOf('window._refreshScrollLock', i) + 200);

console.log('\n1. O AGENDAMENTO NÃO MORRE SE O FRAME NÃO VIER');
t('há timeout de reserva junto do requestAnimationFrame', () => {
  assert.ok(/setTimeout\(correr/.test(bloco),
    'o schedule() voltou a depender só do rAF — se o frame não vier, o mecanismo morre e a ' +
    'classe fica presa (foi o que derrubou a web no celular em 11/ago/2026)');
});
t('o handle é liberado quando qualquer um dos dois roda', () => {
  assert.ok(/raf = null/.test(bloco), 'sem soltar o handle, o schedule() trava no `if (raf) return`');
  assert.ok(/feito/.test(bloco), 'sem guarda de execução única, apply() rodaria 2x por agendamento');
});

console.log('\n2. A VERDADE É O DOM — classe presa sem overlay SEMPRE sai');
t('destrava olhando a CLASSE, não só a flag interna', () => {
  assert.ok(/classList\.contains\('sp-scroll-locked'\)/.test(bloco),
    'apply() voltou a confiar só na flag `locked`');
  assert.ok(/!want && \(locked \|\| temClasse\)/.test(bloco),
    'a condição de destravar voltou a ser `!want && locked`');
});

console.log('\n3. HÁ GATILHO ALÉM DA MUTAÇÃO NO DOM');
t('eventos de volta-ao-app re-checam', () => {
  ['pageshow', 'visibilitychange'].forEach((ev) => {
    assert.ok(bloco.indexOf("'" + ev + "'") >= 0, 'faltou re-checar em ' + ev);
  });
});
t('e há uma rede curta durante o boot', () => {
  assert.ok(/setInterval\(/.test(bloco) && /clearInterval\(/.test(bloco),
    'sem passadas no boot, a checagem do instante em que o loader some pode se perder');
});

console.log('\n4. O COMPORTAMENTO, RODANDO O CÓDIGO REAL');
// DOM mínimo: body com classe presa e NENHUM overlay — o estado exato do incidente.
const cls = new Set(['sp-scroll-locked']);
const body = {
  children: [],
  style: { top: '0px' },
  classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) }
};
Object.defineProperty(body, 'className', { get: () => Array.from(cls).join(' ') });
const win = {
  innerWidth: 375, innerHeight: 812, scrollY: 0, pageYOffset: 0,
  scrollTo: () => {}, getComputedStyle: () => ({ position: 'static' }),
  addEventListener: () => {}, requestAnimationFrame: () => null,   // rAF MORTO de propósito
  setTimeout: (fn) => { fn(); return 1; }, setInterval: () => 1, clearInterval: () => {},
  MutationObserver: function () { this.observe = () => {}; }
};
const doc = { body: body, addEventListener: () => {} };
t('com a classe presa e nenhum overlay, o código real DESTRAVA', () => {
  // recorta a IIFE inteira, contando chaves — fatiar por string cortava no meio
  const ini = src.indexOf('(function () {', i);
  let d = 0, k = src.indexOf('{', ini), fim = -1;
  for (; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { fim = k; break; } }
  }
  assert.ok(fim > ini, 'não consegui recortar a IIFE da trava de scroll');
  const iife = src.slice(ini, fim + 1) + ')();';
  new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame', 'setTimeout',
    'setInterval', 'clearInterval', iife)
    (win, doc, win.MutationObserver, win.requestAnimationFrame, win.setTimeout, win.setInterval, win.clearInterval);
  assert.ok(!cls.has('sp-scroll-locked'),
    'a classe continuou no body — a página ficaria presa na altura da viewport');
  assert.strictEqual(body.style.top, '', 'o `top` negativo continuou aplicado');
});

console.log('\n' + (bad ? '❌' : '✅') + ' scroll-lock-nao-prende-a-pagina: ' + ok + ' passaram, ' + bad + ' falharam');
process.exit(bad ? 1 : 0);
