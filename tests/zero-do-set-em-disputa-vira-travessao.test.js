'use strict';
/* ⛔ ZERO É UM PLACAR, NÃO UM VAZIO.
 * Jogo 112 do Confra (11/set/2026): 1×1, esperando o super tie-break. O card mostrava
 * `6 4 0` × `3 6 0` e o dono leu como "o STB deu 0×0 e o meu 10-8 sumiu". Conferido no dado:
 * `sets: [6-3, 4-6]`, `winner: null` — o STB nem existia ainda.
 * A coluna EM DISPUTA passa a mostrar travessão. ⚠️ E o zero REAL (set perdido por 0×6)
 * continua aparecendo: a diferença entre "não jogado" e "perdi de zero" é o que estava sumindo.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-model.js'), 'utf8');
const ini = src.indexOf('  function _spSetNum(c, side, italico) {');
const fim = src.indexOf('\n  // ── SIMULAR UMA PARTIDA INTEIRA', ini);
assert.ok(ini > 0 && fim > ini, 'âncoras do construtor read-only');
const ctx = { window: { _spCor: (c) => c, _safeHtml: (x) => String(x == null ? '' : x), _formatSetForPlayer: null } };
vm.runInNewContext(src.slice(ini, fim), ctx);
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const plano = {
  multi: true, numFs: 1.2,
  columns: [
    { i: 0, kind: 'set', label: '1', state: 'done', set: { gamesP1: 0, gamesP2: 6 }, w: 31 },
    { i: 1, kind: 'set', label: '2', state: 'done', set: { gamesP1: 6, gamesP2: 4 }, w: 31 },
    { i: 2, kind: 'stb', label: 'STB', state: 'live', set: null, w: 31 }
  ]
};
const html = ctx.window._setGridHtml(plano, 1);
const cols = html.split('sp-set-col').slice(1);
must(cols.length === 3, 'a grade desenha as três colunas');
must(cols[2].indexOf('>0<') === -1, '⛔ a coluna EM DISPUTA não mostra zero');
must(/–/.test(cols[2]), 'ela mostra o travessão — "ainda não jogado"');
must(cols[0].indexOf('0') !== -1, '⛔ e o zero REAL do set 0×6 continua lá (perdi de zero ≠ não joguei)');
must(cols[1].indexOf('6') !== -1, 'o set ganho segue mostrando o número');
must(html.indexOf('sp-set-zero') !== -1, 'a classe de tamanho não muda — a grade não encolhe nem cresce');

console.log('✅ ' + ok + ' asserções — set em disputa vira travessão, zero jogado continua zero');
