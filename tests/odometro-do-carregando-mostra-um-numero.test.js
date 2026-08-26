/* O ODÔMETRO DO "CARREGANDO" MOSTRA UM NÚMERO, NÃO DOIS CORTADOS (2.0.118)
 * node tests/odometro-do-carregando-mostra-um-numero.test.js
 *
 * Relato do dono (26/ago): _"o % da barra de carregando está truncando no meio do
 * carregamento. aparece 2 números % um em cima do outro cortado dentro da barra."_
 *
 * ⛔ A CAUSA É ARITMÉTICA, não estética. A coluna do odômetro tem N células de H px; a
 * janela tem H px. Com `align-items:center`, o topo da coluna vai parar em
 *     −(N·H − H)/2  =  −(N−1)·H/2
 * e isso só cai numa borda de célula se (N−1) for PAR. Com N=20 dá −190px — 190 não é
 * múltiplo de 20, então a janela pega metade de uma célula e metade da seguinte.
 * MEDIDO no navegador, na página publicada: metade do "47%" em cima, metade do "52%"
 * embaixo. E era CONSTANTE, não intermitente — só passava despercebido porque a barra vive
 * poucos segundos e texto cortado parece "animação".
 * ⭐ Com `flex-start` o topo encosta em 0 e cada passo de H px cai exatamente numa célula.
 *
 * ⚠️ Este teste checa a ARITMÉTICA, não a string: assim ele continua valendo se alguém
 * mudar N ou H — que é justamente quando o defeito voltaria.
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

// ── a janela alinha no TOPO ─────────────────────────────────────────────────
const iPct = src.indexOf('class="sp-loader-pct"');
ok(iPct > 0, 'a janela do % existe');
const pct = _R.ateOFim(src, iPct);
ok(/align-items:flex-start/.test(pct),
  '⭐ a coluna encosta no TOPO da janela — centralizar a põe em meia célula');
ok(!/align-items:center/.test(pct),
  '⛔ e NÃO está centralizada: era isso que cortava dois números');
ok(/overflow:hidden/.test(pct), 'e a janela recorta o resto da coluna');

// ── a aritmética: passo do keyframe = altura da célula ──────────────────────
const mN = /_SP_ODO_N = (\d+), _SP_ODO_H = (\d+)/.exec(src);
ok(!!mN, 'as constantes do odômetro estão declaradas juntas');
const N = Number(mN[1]), H = Number(mN[2]);
ok(N > 1 && H > 0, 'N=' + N + ' células de H=' + H + 'px');

// o keyframe desloca (N-1)*H, e os passos são (N-1) → cada passo é exatamente H
ok(new RegExp('translateY\\(-' + "' \\+ \\(\\(_SP_ODO_N - 1\\) \\* _SP_ODO_H\\)").test(src) ||
   /translateY\(-' \+ \(\(_SP_ODO_N - 1\) \* _SP_ODO_H\)/.test(src),
  '⭐ o deslocamento total sai de (N−1)×H — nunca de um número cravado');
ok(/steps\(' \+ \(_SP_ODO_N - 1\)/.test(src),
  '⭐ e os passos são (N−1): cada um anda exatamente uma célula');

// a célula tem altura E line-height iguais a H — senão o número sai cortado dentro dela
const iOdo = src.indexOf('window._spOdoNumeros = function');
const odo = _R.ateOFim(src, iOdo);
ok(/height:' \+ h \+ 'px;line-height:' \+ h \+ 'px/.test(odo),
  '⛔ altura e line-height da célula saem do MESMO H — divergir corta o número dentro dela');

// ── e a prova aritmética do defeito, pra ninguém "consertar" voltando ao center
const deslocSeCentralizado = -((N * H) - H) / 2;
ok(deslocSeCentralizado % H !== 0,
  '⛔ com N=' + N + ' e H=' + H + ', centralizar deixaria a coluna em ' + deslocSeCentralizado +
  'px — que NÃO é múltiplo de ' + H + ', ou seja meia célula em cima e meia embaixo. ' +
  'É a demonstração de por que `center` não pode voltar.');

console.log((fail ? '✗' : '✓') + ' odometro-do-carregando-mostra-um-numero: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
