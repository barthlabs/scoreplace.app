'use strict';
/* ⛔ O SUBPONTO DO TIE-BREAK NÃO PODE COLAR NO NÚMERO SEGUINTE.
 * Relato do dono (12/set/2026, jogo 122 — 6 · 5⁽⁵⁾ · 14): _"entre o set 2 e 3, quando tem
 * tie-break, está colando. entre o set 1 e 2, quando o set 1 deu tie, não cola e tem um espaço
 * bacana. esse espaço precisa existir sempre"_.
 * MEDIDO no navegador, com esse placar e essa fonte (1,20rem, três colunas): a coluna de um
 * dígito deixa 8,7px de folga de cada lado; a coluna COM tie-break tinha texto de 32,2px numa
 * coluna de 31 — ESTOURAVA 1,2px e comia o vão de 3px até a coluna seguinte. O vão entre os
 * NÚMEROS caía de 15,3px (set 1→2) para 6,4px (set 2→3). Depois: 15,3 e 13,8.
 * A coluna com tie-break passa a nascer mais larga, pela mesma escada que já dimensiona tudo.
 * [[project_placar_por_sets_no_card]] · [[feedback_medir_com_dado_real_antes_de_teorizar]]
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-model.js'), 'utf8'),
  sandbox, { filename: 'bracket-model.js' });
const W = sandbox;
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const sc = { type: 'sets', setsToWin: 2, superTiebreak: true, superTiebreakPoints: 10 };
const sets = [
  { gamesP1: 6, gamesP2: 4 },
  { gamesP1: 5, gamesP2: 6, tiebreak: { pointsP1: 5, pointsP2: 7 } },
  { gamesP1: 14, gamesP2: 16 }
];
const plan = W._matchSetPlan(sc, { sets: sets, winner: 'p2' }, { sets: sets, done: true });
must(plan.columns.length === 3, 'as três colunas do jogo 122');
const [c1, c2, c3] = plan.columns;
must(c2.w > c1.w, '⛔ a coluna COM tie-break é mais larga que a de número simples (' + c2.w + ' > ' + c1.w + ')');
const esc = W._setColEscala(3);
// a largura de uma coluna = o maior entre o PISO (que é o rótulo) e o número que ela mostra,
// mais a folga do tie-break quando existe. É a mesma conta para todas — uma régua só.
const larguraEsperada = (digitos, kind, temTb) =>
  Math.max(kind === 'stb' ? esc.pisoStb : esc.piso, Math.ceil(digitos * esc.digito) + 3) + (temTb ? esc.tb : 0);
must(c2.w === larguraEsperada(1, 'set', true),
  'e o quanto ela cresce sai da MESMA escada que dimensiona tudo (+' + esc.tb + ')');
must(c1.w === larguraEsperada(1, 'set', false) && c3.w === larguraEsperada(2, 'stb', false),
  'as colunas sem tie-break medem o número que mostram — ninguém rouba largura do nome à toa');
must(c3.w > c1.w, '⭐ dois dígitos pedem mais que um — a coluna mede o DADO, não o pior caso (' + c3.w + ' > ' + c1.w + ')');
must(c1.w >= esc.piso, '⛔ e nunca menos que o piso: abaixo dele o rótulo "STB" quebraria em duas linhas');

// as duas linhas leem o mesmo set → medem o mesmo; é isso que mantém a grade casada
const p2 = W._matchSetPlan(sc, { sets: sets, winner: 'p1' }, { sets: sets, done: true });
must(p2.columns.map((c) => c.w).join() === plan.columns.map((c) => c.w).join(),
  'os dois lados chegam às MESMAS larguras — o subponto é do SET, não do lado');

// a escada inteira tem o valor, e ele acompanha a fonte de cada degrau
W._SET_COL_ESCALA.forEach((d) => {
  must(d.tb > 0, 'o degrau de ' + d.fs + 'rem tem folga de tie-break (' + d.tb + 'px)');
  must(d.digito > 0 && d.piso > 0 && d.pisoStb >= d.piso,
    'e tem largura de dígito e piso de rótulo (STB pede mais que um número)');
});
must(W._setColEscala(2).tb >= W._setColEscala(5).tb,
  'e quanto maior a fonte, maior a folga — o subponto cresce junto');

// sem tie-break, nada muda: a régua de antes continua de pé
const semTb = W._matchSetPlan(sc, { sets: [sets[0], { gamesP1: 3, gamesP2: 6 }] },
  { sets: [sets[0], { gamesP1: 3, gamesP2: 6 }], done: true });
must(semTb.columns.every((c) => c.w === larguraEsperada(1, c.kind, false)),
  '⛔ jogo sem tie-break nenhum fica no tamanho do número, sem folga sobrando');

console.log('✅ ' + ok + ' asserções — a coluna do tie-break tem o mesmo espaço das outras');
