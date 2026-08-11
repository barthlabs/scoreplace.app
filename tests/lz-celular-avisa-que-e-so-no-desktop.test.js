#!/usr/bin/env node
/* NO CELULAR, A TELA DIZ QUE A LEITURA SÓ ROLA NO COMPUTADOR.
 *
 * Bronca do dono (11/ago/2026, print do app no iPhone via TestFlight):
 *   "não sendo no chrome desktop onde existem as extensões (no celular por exemplo) não
 *    pode ficar sem a informação de que isso só pode ser feito num desktop no chrome com
 *    extensão. JÁ TRATAMOS DISSO E PARECE QUE NUNCA FUNCIONOU. no celular aparece o botão
 *    sem qualquer informação disso."
 *
 * ELE ESTÁ CERTO NAS DUAS PARTES, e a segunda explica a primeira. MEDIDO no código:
 *   • o botão JÁ desabilitava no celular, e a explicação estava num `title=` — que é
 *     TOOLTIP: precisa de hover, e no toque não existe hover. Botão cinza e mudo.
 *   • o aviso do topo tinha `if (movel) { caixa.innerHTML = ''; return; }` com o comentário
 *     "no celular a mensagem é outra". A mensagem diferente NUNCA FOI ESCRITA — o código
 *     só esvaziava a caixa.
 *   • a detecção de mobile vivia DENTRO de cada view, com regex própria; a da Análise não
 *     cobria iPad em "modo computador" nem o app nativo. `grep _isMobile` nesse arquivo
 *     dava ZERO.
 * Ou seja: "tratamos disso" no onboarding, e a tela onde o botão aparece nunca soube.
 *
 * Uso:  node tests/lz-celular-avisa-que-e-so-no-desktop.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const raiz = path.resolve(__dirname, '..');
let ok = 0, bad = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { bad++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

console.log('\n1. A DETECÇÃO É FONTE ÚNICA (não regex solta por view)');
const store = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
t('window._spLetzplayPrecisaDesktop existe no store.js', () => {
  assert.ok(/window\._spLetzplayPrecisaDesktop\s*=/.test(store),
    'a detecção voltou pra dentro das views — a próxima tela nasce sem ela');
});

// roda a função REAL
const win = { navigator: {} };
const i = store.indexOf('window._spLetzplayPrecisaDesktop');
let j = store.indexOf('{', store.indexOf('function', i)), d = 0, k = j;
for (; k < store.length; k++) { if (store[k] === '{') d++; else if (store[k] === '}') { d--; if (!d) break; } }
const corpo = store.slice(i, k + 1) + ';';
function precisa(ua, plat, touch) {
  const w = { SCOREPLACE_PLATFORM: plat, navigator: { userAgent: ua, maxTouchPoints: touch || 0 } };
  new Function('window', 'navigator', corpo)(w, w.navigator);
  return w._spLetzplayPrecisaDesktop();
}
console.log('\n2. A FUNÇÃO ACERTA OS CASOS REAIS');
[
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'web', 0, true, 'iPhone no Safari'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'ios', 5, true, 'app NATIVO iOS (o do print)'],
  ['Mozilla/5.0 (Linux; Android 14)', 'android', 5, true, 'app nativo Android'],
  ['Mozilla/5.0 (Linux; Android 14) Chrome/120', 'web', 5, true, 'Chrome do Android — não aceita extensão'],
  ['Mozilla/5.0 (iPad; CPU OS 17_0)', 'web', 5, true, 'iPad'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'web', 5, true, 'iPad em "modo computador" (se diz Mac, mas tem toque)'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120', 'web', 0, false, 'Mac de verdade — aqui PODE'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120', 'web', 0, false, 'Windows — aqui PODE']
].forEach(([ua, plat, touch, esperado, nota]) => {
  t(nota + ' → ' + (esperado ? 'precisa desktop' : 'pode ler'), () => {
    assert.strictEqual(precisa(ua, plat, touch), esperado);
  });
});

console.log('\n3. NO CELULAR: TELA IGUAL À DO DESKTOP, AVISO NO TOQUE');
// Desenho definido pelo dono: "o certo é o botão apertado abrir um popup com o aviso e só
// com um outro botão fechar" · "o resto tudo igual ao desktop". As duas tentativas
// anteriores (title= e faixa fixa) estão descritas no cabeçalho — a 1ª era invisível no
// toque, a 2ª sujava a tela e deixava o celular capenga em relação ao computador.
const rep = fs.readFileSync(path.join(raiz, 'js/views/tournaments-enrollment-report.js'), 'utf8');
t('usa a fonte única, não regex própria', () => {
  assert.ok(/_spLetzplayPrecisaDesktop/.test(rep), 'voltou a decidir sozinha');
});
t('o BOTÃO é o mesmo do desktop — nada de disabled nem de faixa fixa', () => {
  const fn = rep.slice(rep.indexOf('function _botaoPuxar'), rep.indexOf('window._lzAvisoSoNoDesktop = function'));
  assert.ok(!/disabled/.test(fn), 'o botão voltou a nascer desabilitado no celular');
  assert.ok(!/_avisoDesktopHtml/.test(fn), 'a faixa de aviso fixa voltou pra tela');
  assert.ok(fn.indexOf('onclick="window._lzPuxarDoTopo()"') >= 0, 'o botão perdeu o clique');
});
t('existe o POPUP, com um botão só pra fechar', () => {
  assert.ok(/window\._lzAvisoSoNoDesktop\s*=/.test(rep), 'o popup sumiu');
  const fn = rep.slice(rep.indexOf('window._lzAvisoSoNoDesktop = function'), rep.indexOf('window._lzAvisoSoNoDesktop = function') + 1400);
  assert.ok(/showAlertDialog/.test(fn), 'não usa o diálogo de 1 botão');
  assert.ok(!/showConfirmDialog/.test(fn), 'confirm tem 2 botões — aqui só há uma ação possível');
  assert.ok(/só dá no computador|extensão do Chrome/i.test(fn), 'o popup não explica o motivo');
});
t('o CLIQUE é interceptado antes de tentar ler', () => {
  const fn = rep.slice(rep.indexOf('window._lzPuxarDoTopo = function'), rep.indexOf('window._lzPuxarDoTopo = function') + 1400);
  assert.ok(fn.indexOf('_spLetzplayPrecisaDesktop()') >= 0, 'o clique no celular voltaria a falhar em silêncio');
  assert.ok(fn.indexOf('_lzAvisoSoNoDesktop(); return;') >= 0, 'o clique não abre o aviso');
  assert.ok(fn.indexOf('!window._lzExtVer') >= 0, 'com extensão viva na aba o caminho tem que seguir normal');
});
t('o topo NÃO manda instalar extensão no celular', () => {
  const i2 = rep.indexOf('var movel =');
  const bloco = rep.slice(i2, i2 + 900);
  assert.ok(!/Chrome Web Store|instale/i.test(bloco), 'instruir instalação no celular é impossível de cumprir');
});

console.log('\n4. E O ONBOARDING CONTINUA AVISANDO (não regrediu)');
const onb = fs.readFileSync(path.join(raiz, 'js/views/letzplay-onboarding.js'), 'utf8');
t('o onboarding tem o aviso de "no computador"', () => {
  assert.ok(/no computador/i.test(onb), 'o aviso do onboarding sumiu');
});

console.log('\n' + (bad ? '❌' : '✅') + ' lz-celular-avisa-que-e-so-no-desktop: ' + ok + ' passaram, ' + bad + ' falharam');
process.exit(bad ? 1 : 0);
