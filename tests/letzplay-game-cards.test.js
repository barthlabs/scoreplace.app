/* Os jogos do diálogo usam os MESMOS cards do #histórico — node tests/letzplay-game-cards.test.js
 * Pedido do dono (30/jul/2026), comparando as duas telas lado a lado: "essa apresentação
 * dos jogos deve ser como nas estatísticas". Eu tinha escrito uma lista de uma linha à
 * parte — é assim que duas telas que mostram a mesma coisa divergem.
 */
const { window, load } = require('./headless.js');
if (typeof global.document === 'undefined') global.document = { addEventListener: function () {} };
if (!window.document) window.document = global.document;
require('vm').runInContext(
  require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'letzplay-model.js'), 'utf8'),
  require('./headless.js').sandbox, { filename: 'letzplay-model.js' });
load('match-history.js');
load('tournaments-enrollment-report.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const imp = { handle: 'camilacalia', importedAt: '2026-07-30T20:21:51.665Z', games: [
  { lzId: '1', date: 'Quarta, 29/07/26', club: 'paineiras-bt', official: false, rankingId: '55291',
    competition: 'Fem C', myScore: 6, oppScore: 3, won: true,
    partnerName: 'Kelly Barth', partnerHandle: 'KellyBarth1', oppNames: ['Ana', 'Bia'], oppHandles: ['ana', 'bia'] },
  { lzId: '2', date: 'Terça, 28/07/26', club: 'paineiras-bt', official: true, tourneyId: '11',
    competition: 'Feminina C', myScore: 4, oppScore: 6, won: false,
    oppNames: ['Cris'], oppHandles: ['cris'] }
] };

ok(typeof window._spLzGameItems === 'function', 'match-history exporta o mapeamento de jogos');
ok(typeof window._spGameCard === 'function', 'match-history exporta o card');
ok(typeof window._lzGameCards === 'function', 'o diálogo tem o renderizador de cards');

const html = window._lzGameCards(imp, 'Camila Putignani');
ok(/Camila Putignani \/ Kelly Barth/.test(html), 'o card traz a dupla dela na linha de cima');
ok(/Ana \/ Bia/.test(html), 'e a dupla adversária na de baixo');
ok(/LetzPlay/.test(html), 'traz o selo da fonte, como no #histórico');
ok(/#22c55e/.test(html) && /#ef4444/.test(html), 'vencedor em verde e perdedor em vermelho');
ok(/Ranking · Fem C/.test(html) && /Torneio · Feminina C/.test(html), 'linha de contexto igual à do #histórico');
ok(/Paineiras/.test(html), 'mostra o local');
ok(html.indexOf('29') < html.indexOf('28'), 'mais recente primeiro');

// o card do diálogo é EXATAMENTE o do #histórico — nenhuma cópia paralela
const it = window._spLzGameItems(imp)[0];
ok(html.indexOf(window._spGameCard(it, 'Camila Putignani')) >= 0,
  'o HTML do diálogo contém o card gerado pela função do #histórico (sem markup paralelo)');

// e sem o módulo do histórico não quebra: cai na lista de uma linha
const salvo = window._spLzGameItems; window._spLzGameItems = undefined;
ok(window._lzGameCards(imp, 'x') === null, 'sem o módulo do histórico, devolve null pra cair no formato simples');
window._spLzGameItems = salvo;

console.log((fail ? '✗' : '✓') + ' letzplay-game-cards: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
