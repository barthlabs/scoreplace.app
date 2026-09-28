/* FOLGA NÃO ENTRA NO HISTÓRICO DO JOGADOR
 * node tests/folga-nao-entra-no-historico-do-jogador.test.js
 *
 * Executa o popup real de histórico. Uma folga/W.O. pode carregar dois rótulos para
 * explicar a rodada, mas nunca pode se tornar adversário, vitória ou partida.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
let fail = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.error('  ✗ ' + msg); fail++; } }

function extraiHistorico(src) {
  const ini = src.indexOf('window._showPlayerHistory = function');
  const fim = src.indexOf('\n};', ini);
  if (ini < 0 || fim < 0) throw new Error('não encontrei _showPlayerHistory real');
  return src.slice(ini, fim + 3);
}

const t = {
  id: 'historico-folga',
  rounds: [{ matches: [
    { id: 'real', p1: 'Ana', p2: 'Bia', winner: 'Ana', scoreP1: 6, scoreP2: 4 },
    // É marcador, não confronto: dois rótulos não o tornam jogo.
    { id: 'folga', p1: 'Ana', p2: 'FOLGA', isSitOut: true, sitOutReason: 'wo', winner: 'Ana' }
  ] }]
};
let dialog = null;
const W = {
  _findTournamentById: (id) => id === t.id ? t : null,
  _getUnifiedRounds: () => null,
  _groupDisplayName: () => '',
  _t: (k) => k,
  showAlertDialog: (title, html) => { dialog = { title, html }; }
};
new Function('window', 'with (window) { ' + extraiHistorico(SRC) + ' }')(W);

console.log('──── folga não entra no histórico individual ────');
W._showPlayerHistory(t.id, 'Ana');
ok(!!dialog, 'o diálogo real foi aberto');
ok(/1 partidas/.test(dialog && dialog.html), '⭐⭐ o contador mostra somente o confronto real');
ok(!/FOLGA/.test(dialog && dialog.html), '⛔ a folga não vira adversária na tabela');
ok((dialog && dialog.html.match(/✅/g) || []).length === 1, '⛔ uma única vitória real, sem vitória de folga');
console.log(fail ? '\n❌ ' + fail + ' falha(s)' : '\n✅ folga-nao-entra-no-historico-do-jogador: OK');
process.exit(fail ? 1 : 0);
