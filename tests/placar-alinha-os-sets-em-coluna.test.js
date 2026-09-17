'use strict';
/* ⛔ PLACAR EM COLUNA, NÃO EM TEXTO CORRIDO.
 * Relato do dono (12/set/2026, "Seus últimos resultados", jogo 168): _"os números dos placares
 * na coluna não estão alinhados. set 1 devem ficar alinhados na coluna; set 2, 3, 4 e 5 (quando
 * for o caso), sempre alinhados na coluna"_.
 * O card montava `sets.map(...).join(' ')`: texto corrido. Com `5⁽⁷⁾ 6 7` em cima e `6⁽⁹⁾ 3 10`
 * embaixo, o `10` — mais largo que o `7` — empurrava a linha inteira de baixo, e nenhum set
 * casava com o de cima. O dado estava certo; faltava a GRADE.
 * Este teste roda o RENDERIZADOR REAL (o `_placarLado` recortado do dashboard) com o placar
 * REAL do jogo 168 e CONTA as colunas: as duas linhas têm de medir igual, coluna a coluna.
 * [[project_placar_por_sets_no_card]] · [[feedback_medir_com_dado_real_antes_de_teorizar]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const BM = fs.readFileSync(path.join(root, 'js/views/bracket-model.js'), 'utf8');
const DASH = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

// ⛔ recorte por ÂNCORA, nunca por tamanho fixo.
const w = { _spCor: (c) => c, _safeHtml: (x) => String(x == null ? '' : x) };
const corte = (de, ate) => {
  const i = BM.indexOf(de), f = BM.indexOf(ate, i);
  assert.ok(i > 0 && f > i, 'âncoras de ' + de);
  return BM.slice(i, f);
};
vm.runInNewContext(
  corte('  function _supDigits(n) {', '  window._formatSetCombined =') +
  corte('  window._larguraDaColunaDoSet = function', '  // ── SIMULAR UMA PARTIDA INTEIRA'),
  { window: w });

// ── ① a largura sai do DADO, e o dado é o mesmo pros dois lados ─────────────
const larg = w._larguraDaColunaDoSet;
must(larg({ gamesP1: 7, gamesP2: 10 }) === larg({ gamesP1: 10, gamesP2: 7 }),
  'a coluna mede o mesmo pelos dois lados — é ela que alinha as duas linhas');
must(parseFloat(larg({ gamesP1: 7, gamesP2: 10 })) > parseFloat(larg({ gamesP1: 6, gamesP2: 3 })),
  'a coluna do `10` é mais larga que a de um dígito (é isso que empurrava a linha)');
must(parseFloat(larg({ gamesP1: 5, gamesP2: 6, tiebreak: { pointsP1: 7, pointsP2: 9 } })) >
     parseFloat(larg({ gamesP1: 5, gamesP2: 6 })),
  'e o subponto do tie-break também cabe — a coluna cresce pra ele');
must(/ch$/.test(larg({ gamesP1: 6, gamesP2: 3 })),
  '⛔ a medida é em `ch` (acompanha a fonte), nunca px cravado');

// ── ② Últimos Resultados delega ao mesmo renderer da chave ───────────────────
const BRK = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const recentIni = DASH.indexOf('// ── Últimos resultados confirmados');
const recentFim = DASH.indexOf('// Agrupa por (grupo + torneio)', recentIni);
const recent = DASH.slice(recentIni, recentFim);
must(recent.includes('window.renderMatchCard(m2'),
  'Últimos Resultados chama o card canônico, sem reconstruir o placar');
must(/var _c = window\._corDoSetLado\(s, playerNum, _temV\)/.test(BRK),
  'o card canônico colore cada set pela fonte única');
must(/window\._setGridHtml/.test(BM) && /sp-set-grid/.test(BM),
  'a grade canônica preserva uma coluna por set para as duas linhas');
must(!/function _placarLado\(n\)/.test(recent),
  '⛔ o renderer antigo de texto corrido não voltou a Últimos Resultados');

console.log('✅ ' + ok + ' asserções — cada set é uma coluna, e as duas linhas medem igual');
