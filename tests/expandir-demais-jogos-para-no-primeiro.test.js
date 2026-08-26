/* ABRIR "DEMAIS JOGOS" PÁRA NO PRIMEIRO, NÃO NO ÚLTIMO (2.0.111)
 * node tests/expandir-demais-jogos-para-no-primeiro.test.js
 *
 * Relato do dono (26/ago): _"ao expandir os demais jogos da rodada está indo para o último.
 * o certo seria ficar no primeiro."_
 *
 * ⛔ NÃO HAVIA SCRIPT NENHUM ali — é a ANCORAGEM DE ROLAGEM do navegador: ao abrir o
 * `<details>`, ele escolhe um elemento ABAIXO da expansão e o mantém parado, empurrando a
 * vista pro FIM do conteúdo recém-inserido. Quanto mais jogos, mais longe o pulo. Por isso
 * "não fizemos nada" não é defesa: o navegador faz por conta.
 *
 * São DOIS lugares (Liga e Rei/Rainha) e o do print do dono é o de Rei/Rainha — o que pode
 * nascer FECHADO quando o lote é adiado, ou seja o que mais é expandido.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');

// ── ① os dois expansores chamam a MESMA função ──────────────────────────────
const usos = (src.match(/ontoggle="window\._demaisJogosAoAbrir\(this\)"/g) || []).length;
ok(usos === 2, '⭐ os DOIS "Demais jogos" (Liga e Rei/Rainha) usam a mesma função (achei ' + usos + ')');
ok(!/ontoggle="if\(this\.open\)\{var s=/.test(src),
  '⛔ e nenhum tem o handler copiado no atributo — duas cópias divergem');

// ── ② a função, rodada de verdade ───────────────────────────────────────────
const i = src.indexOf('window._demaisJogosAoAbrir = function (el) {');
ok(i > 0, 'a função existe');
const corpo = src.slice(i, src.indexOf('\n};', i) + 3);

const chamadas = [];
let reflow = 0;
const alvo = { style: {}, scrollIntoView: (o) => chamadas.push(o) };
const ctx = {
  window: { _reflowChrome: () => { reflow++; } },
  requestAnimationFrame: (f) => f(),   // executa na hora, pra poder conferir
  setTimeout: (f) => f()
};
vm.createContext(ctx);
vm.runInContext(corpo + '\nthis.f = window._demaisJogosAoAbrir;', ctx);
const abrir = ctx.f;

// aberto → rola pro summary
abrir({ open: true, querySelector: () => alvo });
ok(chamadas.length === 1, '⭐ abrir ROLA (era isso que faltava)');
ok(chamadas[0] && chamadas[0].block === 'start',
  '   e ancora no TOPO do elemento — `block:start`, não `end` nem `nearest`');
ok(alvo.style.scrollMarginTop === 'var(--scroll-anchor, 0px)',
  '⚠️ com a margem de `--scroll-anchor`: sem ela o alvo pousa ATRÁS da barra sticky');
ok(reflow === 1,
  '⚠️ e RE-MEDE o chrome antes de rolar — a barra de busca pode ter nascido neste render');

// fechado → não mexe em nada
chamadas.length = 0; reflow = 0;
abrir({ open: false, querySelector: () => alvo });
ok(chamadas.length === 0, '⛔ FECHAR não rola — a pessoa está olhando o que está acima');

// sem summary → não explode
chamadas.length = 0;
abrir({ open: true, querySelector: () => null });
ok(chamadas.length === 0, 'e sem summary não explode (o card pode estar sendo trocado)');

// ── ③ espera o layout antes de medir ────────────────────────────────────────
ok(/requestAnimationFrame\(function \(\) \{ requestAnimationFrame\(rola\); \}\)/.test(corpo),
  '⚠️ dois quadros de espera: no Rei/Rainha o conteúdo é MONTADO na abertura (lote adiado),' +
  ' e rolar antes de ele existir ancora na altura velha');

console.log((fail ? '✗' : '✓') + ' expandir-demais-jogos-para-no-primeiro: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
