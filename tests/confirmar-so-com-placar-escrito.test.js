/* O "✓ CONFIRMAR" DO CARD SÓ APARECE COM PLACAR ESCRITO  (2.1.3)
 * node tests/confirmar-so-com-placar-escrito.test.js
 *
 * Ordem do dono (26/ago/2026, olhando o Grupo D do Confra): _"o botao confirmar poderia
 * aparecer onde esta em cada jogo apenas quando um resultado é escrito e está pronto para
 * confirmar. quando esta em 0-0 sem botao confirmar (apenas o ao vivo)."_
 *
 * Antes o botão saía em TODO jogo não decidido, ao lado do "Ao Vivo", convidando a gravar
 * um 0-0 que ninguém jogou.
 *
 * ⚠️ A ARMADILHA QUE ESTE TESTE GUARDA: **zero é placar válido**. Um 6-0 existe. Se a
 * condição fosse `if (s1 && s2)`, o `!0` esconderia o botão justamente no 6-0 e o
 * organizador não conseguiria confirmar — bug pior que o original, e silencioso. O teste
 * é sobre o campo estar PREENCHIDO (string não vazia), nunca sobre o número ser verdadeiro.
 *
 * ⚠️ E POR QUE O GANCHO É `_highlightWinner`: os inputs já chamam essa função no `oninput`.
 * Pendurar um listener novo por elemento morreria em tudo que nasce depois do render
 * (re-render, "ver mais", grupo que abre). [[feedback_montagem_preguicosa_mata_o_clique]]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── confirmar só com placar escrito ────');

/* ── ① o botão NASCE escondido no markup ──────────────────────────────────── */
const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const i = src.indexOf('id="confirm-${m.id}"');
ok('⭐ achei o botão no render', i > 0);
// ⛔ ancorado no FIM do construto, nunca numa janela fixa: um comentário novo empurraria
// a linha pra fora e o teste reprovaria sem defeito nenhum.
const trecho = src.slice(i, src.indexOf('</button>', i));
ok('⭐⭐ ele nasce com display:none', /display:none/.test(trecho),
  'sem isto ele aparece em 0-0, que é exatamente a bronca do dono');

/* ── ② o gancho é o `oninput` que JÁ existe ───────────────────────────────── */
const ui = fs.readFileSync(path.join(ROOT, 'js/views/bracket-ui.js'), 'utf8');
ok('⭐ `_syncConfirmBtn` existe', /window\._syncConfirmBtn\s*=/.test(ui));
const _hwIni = ui.indexOf('window._highlightWinner = function');
const hw = ui.slice(_hwIni, ui.indexOf('\n};', _hwIni));
ok('⭐⭐ `_highlightWinner` chama `_syncConfirmBtn` (gancho existente, não listener novo)',
  /_syncConfirmBtn\(/.test(hw));
ok('⛔ os inputs do card seguem chamando `_highlightWinner` no oninput',
  /oninput="window\._highlightWinner\(/.test(src));

/* ── ③ comportamento, com DOM de mentira ──────────────────────────────────── */
const els = {};
global.document = {
  getElementById: (id) => els[id] || null,
};
// carrega SÓ a função (o arquivo inteiro é do browser): recorta e avalia.
const ini = ui.indexOf('window._syncConfirmBtn = function');
const fim = ui.indexOf('window._highlightWinner = function');
global.window = {};
// eslint-disable-next-line no-eval
eval(ui.slice(ini, fim));
const sync = global.window._syncConfirmBtn;

const cenario = (v1, v2) => {
  els['confirm-M'] = { style: { display: 'none' } };
  els['live-M'] = { style: { display: '' } };
  els['s1-M'] = { value: v1 };
  els['s2-M'] = { value: v2 };
  sync('M');
  return els['confirm-M'].style.display;
};
const live = () => els['live-M'].style.display;

ok('⛔ 0-0 recém-aberto (campos VAZIOS) → escondido', cenario('', '') === 'none');
ok('⛔ só um lado preenchido → escondido (não está pronto)', cenario('6', '') === 'none');
ok('⛔ só o outro lado → escondido', cenario('', '4') === 'none');
ok('⭐ 6-4 escrito → APARECE', cenario('6', '4') === '');
ok('⭐⭐ 6-0 → APARECE (zero é placar válido; `!0` teria escondido)', cenario('6', '0') === '',
  'ESTA é a regressão perigosa: testar veracidade em vez de "campo preenchido"');
ok('⭐ 0-0 DIGITADO de propósito → aparece (é um placar escrito)', cenario('0', '0') === '');
ok('⛔ espaço em branco não conta como escrito', cenario('  ', '  ') === 'none');
/* ── ④ o PAR EXCLUDENTE: placar digitado ⇒ some o "Ao Vivo" ────────────────── */
// Ordem do dono: _"se a pessoa digitar um placar deve aparecer o confirmar e sumir o ao
// vivo (o jogo foi feito sem ao vivo)"_.
cenario('', '');
ok('⭐ 0-0 vazio → "Ao Vivo" VISÍVEL (é o único caminho oferecido)', live() === '');
cenario('6', '4');
ok('⭐⭐ placar escrito → "Ao Vivo" SOME', live() === 'none');
cenario('6', '0');
ok('⭐ 6-0 → "Ao Vivo" some também (zero não é exceção)', live() === 'none');
cenario('6', '');
ok('⛔ meio caminho → "Ao Vivo" CONTINUA (ainda não é um placar)', live() === '');
cenario('', '');
ok('⭐ apagou o que digitou → "Ao Vivo" VOLTA (nada é irreversível)', live() === '');

ok('⛔ card sem o botão não explode', (function () {
  els['confirm-M'] = null; els['s1-M'] = { value: '6' }; els['s2-M'] = { value: '4' };
  try { sync('M'); return true; } catch (e) { return false; }
})());

console.log(falhas === 0 ? '\n✅ confirmar-so-com-placar-escrito: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
