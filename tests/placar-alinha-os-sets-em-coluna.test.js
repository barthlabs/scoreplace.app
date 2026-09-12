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

// ── ② o RENDERIZADOR REAL, com o placar REAL do jogo 168 ────────────────────
const pIni = DASH.indexOf('        function _placarLado(n) {');
const pFim = DASH.indexOf('\n        }\n', pIni);
assert.ok(pIni > 0 && pFim > pIni, 'âncoras do _placarLado');
const jogo168 = {
  draw: false, winner: 'p2', scoreP1: 1, scoreP2: 2,
  sets: [
    { gamesP1: 5, gamesP2: 6, tiebreak: { pointsP1: 7, pointsP2: 9 } },
    { gamesP1: 6, gamesP2: 3 },
    { gamesP1: 7, gamesP2: 10 }
  ]
};
const render = (m) => {
  const ctx = {
    window: Object.assign({}, w, {
      _corDoSetLado: () => '#4ade80',
      _matchWinnerSide: (x) => (x.winner ? 2 : null)
    }),
    m2: m, _sf: (x) => String(x == null ? '' : x), out: null
  };
  vm.runInNewContext(DASH.slice(pIni, pFim) + '\n}\nout = [_placarLado(1), _placarLado(2)];', ctx);
  return ctx.out;
};
const [l1, l2] = render(jogo168);
const larguras = (h) => (h.match(/--w:([0-9.]+ch)/g) || []);
must(larguras(l1).length === 3 && larguras(l2).length === 3,
  'as DUAS linhas saem com uma coluna por set (3 sets ⇒ 3 colunas, contadas)');
must(larguras(l1).join('|') === larguras(l2).join('|'),
  '⛔ coluna a coluna, as duas linhas medem EXATAMENTE o mesmo — é isso que alinha o set 1 com o set 1');
must(/sp-set-grid/.test(l1) && /sp-set-grid/.test(l2), 'e usam a grade canônica da chave (.sp-set-grid)');
must(l1.indexOf('7') > 0 && l2.indexOf('10') > 0 && l1.indexOf('(7)') > 0,
  'sem perder nada do placar: games, o 10 do super tie-break e o subponto do tie-break');

// ── ③ UM set continua como estava (não se conserta o que não quebrou) ───────
const [u1] = render({ draw: false, winner: 'p1', sets: [{ gamesP1: 6, gamesP2: 4 }] });
must(!/sp-set-grid/.test(u1), 'placar de 1 set não ganha grade — uma coluna só já está alinhada');

// ── ④ o texto corrido não volta ──────────────────────────────────────────────
const bloco = DASH.slice(pIni, pFim);
must(!/\}\)\.join\(' '\);/.test(bloco.replace(/_cels\.join\(' '\)/g, '')),
  '⛔ o `map(...).join(" ")` — o texto corrido que desalinhava — não voltou pro caminho de vários sets');
must(/window\._corDoSetLado\(s, n,/.test(bloco), 'e a cor continua vindo da fonte única, por set');

console.log('✅ ' + ok + ' asserções — cada set é uma coluna, e as duas linhas medem igual');
