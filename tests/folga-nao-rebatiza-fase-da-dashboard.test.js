/* FOLGA NÃO REBATIZA A FASE DA DASHBOARD
 * node tests/folga-nao-rebatiza-fase-da-dashboard.test.js
 *
 * A dashboard calcula Final/Semifinal a partir dos jogos reais daquele bracket. Uma
 * folga é um marcador de estrutura e pode trazer dois rótulos (inclusive W.O.); por isso
 * filtrar apenas BYE/TBD a deixava inventar uma rodada. Esta prova executa o mini-card
 * real, não uma cópia da conta.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
let fail = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.error('  ✗ ' + msg); fail++; } }

function extraiBuildMyResults(src) {
  const ini = src.indexOf('function _buildMyResultsHtml() {');
  const fim = src.indexOf('return _upHtml + _novHtml + html;', ini);
  if (ini < 0 || fim < 0) throw new Error('não encontrei _buildMyResultsHtml real');
  return src.slice(ini, src.indexOf('}', fim) + 1);
}

const mem = {};
W.localStorage = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null,
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; }
};

function torneioComFolga() {
  return {
    id: 'folga-dashboard', name: 'Final com folga', format: 'Eliminatórias Simples', status: 'active',
    participants: [
      { uid: 'u-rb', displayName: 'Rodrigo Barth' }, { uid: 'u-ana', displayName: 'Ana' }
    ],
    matches: [
      { id: 'final-real', round: 1, bracket: 'main', p1: 'Rodrigo Barth', p2: 'Ana',
        team1Uids: ['u-rb'], team2Uids: ['u-ana'], winner: 'Rodrigo Barth', scoreP1: 6, scoreP2: 4, resultAt: Date.now() },
      // A forma acontece em Liga/WO: há dois rótulos, mas não houve confronto.
      { id: 'folga-wo', round: 2, bracket: 'main', p1: 'Bia', p2: 'FOLGA', isSitOut: true, sitOutReason: 'wo' }
    ]
  };
}

function render(t) {
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@example.test' };
  W.AppStore.isOrganizer = () => false;
  const fn = new Function('window', 'document', 'localStorage', 'participacoes',
    'with (window) { ' + extraiBuildMyResults(SRC) + ' return _buildMyResultsHtml; }'
  )(W, W.document, W.localStorage, [t]);
  return fn();
}

console.log('──── folga não cria rodada na dashboard ────');
const t = torneioComFolga();
const html = render(t);
ok(html.length > 0, 'o mini-card real foi renderizado');
ok(/Final/.test(html), '⭐⭐ um único jogo real continua sendo Final');
ok(!/Semifinal/.test(html), '⛔ a folga com dois rótulos não inventa Semifinal');
ok(/!mm\.isSitOut/.test(SRC) && /!mm\.isBye/.test(SRC),
  'a seleção que decide a fase exclui explicitamente folga e BYE');
console.log(fail ? '\n❌ ' + fail + ' falha(s)' : '\n✅ folga-nao-rebatiza-fase-da-dashboard: OK');
process.exit(fail ? 1 : 0);
