'use strict';
/* O RETRATO É CONGELADO; O NOME NÃO.
 * node tests/classificacao-congelada-reidrata-o-nome.test.js
 *
 * ⛔⛔ PERGUNTA DO DONO, 27/set/2026: _"a lista da classificacao tambem usa uid? me parece que nao"_.
 * Ele estava certo: o mapa da classificação é chaveado pelo RÓTULO do time.
 *
 * ⚠️ MEDIDO ANTES DE MEXER, para não consertar o que não quebrou: na Confra, 264 rótulos distintos
 * e ZERO com mais de uma identidade. Ou seja — o que ele tinha visto (a dupla da Betsy colocada
 * num jogo) veio do defeito da VAGA, consertado na 2.3.118, e não da chaveação da classificação.
 * Dizer isso importa: eu já perdi um dia inteiro hoje consertando o sintoma errado.
 *
 * ⛔ MAS HÁ UM PERIGO REAL, E É ESTE: a POSIÇÃO é fato e não muda; o NOME muda depois. No mesmo dia
 * "Marisa Roriz / Marilia Rodrigues" virou "Selena Kolberg / Marilia Rodrigues" quando o dono
 * aplicou um W.O. com substituição. Um retrato preso ao rótulo velho exibiria para sempre alguém
 * que já não está na chave — e ninguém percebe, porque a POSIÇÃO continua certa.
 *
 * ⇒ a posição vem do retrato; o nome é resolvido AGORA pelos uids que o retrato guardou.
 * ⚠️ E isto NÃO recalcula a classificação: recalcular faria a ordem publicada mudar sozinha, que é
 * exatamente o que o congelamento existe para impedir.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a classificação congelada reidrata o nome ────\n');

const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const i0 = codigo.indexOf('var _rotuloAtualPorUids = function (uids) {');
const bloco = i0 < 0 ? '' : codigo.slice(i0, codigo.indexOf('\n      };', i0));
ok(bloco.length > 200, '① o reidratador existe e foi achado pelo identificador');

/* ── ① A POSIÇÃO NÃO É RECALCULADA ─────────────────────────────────────────
 * ⛔ Esta é a asserção que protege o congelamento: se alguém trocar isto por um recálculo, a ordem
 * publicada volta a mudar sozinha — o defeito que o congelamento nasceu para matar. */
const iCong = codigo.indexOf('var _cong = t && t.classifFinalDaLinha');
const trecho = iCong < 0 ? '' : codigo.slice(iCong, codigo.indexOf('_renderClassifFromMap(_mapaCong', iCong));
ok(/x\.pos != null \? x\.pos : i \+ 1/.test(trecho),
  '① ⛔⛔ a POSIÇÃO continua vindo do retrato gravado');
ok(!/_lineClassifMap|_updateProgressiveClassification/.test(trecho),
  '① ⛔⛔ e nada é recalculado neste caminho');

/* ── ② O NOME VEM DO UID ───────────────────────────────────────────────────── */
ok(/_rotuloAtualPorUids\(x\.uids\)/.test(codigo),
  '② ⛔⛔ o nome exibido é resolvido pelos uids guardados no retrato');
ok(/_rotuloAtualPorUids\(x\.uids\) \|\| x\.name/.test(codigo),
  '② ⛔ e cai no rótulo guardado quando não há uid — retrato antigo não pode sumir da tela');
ok(/window\._slotUids\(m, sl\)/.test(bloco),
  '② a identidade do slot é lida pelo leitor canônico, não por campo escolhido a dedo');

/* ── ③ A COMPARAÇÃO É DO CONJUNTO, NÃO DE UM MEMBRO ────────────────────────
 * ⛔ Casar por UM uid faria a dupla (compartilhado, A) ser confundida com (compartilhado, B) —
 * o mesmo erro que já custou uma publicação hoje, na decisão do tardio. */
ok(/slice\(\)\.sort\(\)\.join\(','\)/.test(bloco),
  '③ ⛔⛔ compara o CONJUNTO ordenado de uids — uma pessoa em comum não faz duas duplas iguais');
const iAlvo = bloco.indexOf('var alvo =');
const iComp = bloco.indexOf('!== alvo');
ok(iAlvo > 0 && iComp > iAlvo, '③ e compara contra o conjunto do retrato');

/* ── ④ SLOT VAZIO NÃO VIRA NOME ────────────────────────────────────────────── */
ok(/if \(m\[sl\] && m\[sl\] !== 'TBD'\)/.test(bloco),
  '④ ⛔ vaga ainda não definida não é usada como nome — "A definir" não é gente');

/* ── ⑤ O RETRATO GUARDA OS UIDS ────────────────────────────────────────────
 * ⛔ Sem isto, o reidratador não tem do que partir e tudo acima vira enfeite. */
const bl = fs.readFileSync(path.join(ROOT, 'js/views/bracket-logic.js'), 'utf8');
ok(/uids: _uidsDoRotulo\(nome\)/.test(bl),
  '⑤ ⛔⛔ o congelamento grava os uids de cada posição');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
