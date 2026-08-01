/* As três contagens saem de UM lugar — node tests/lz-contagem-unica.test.js
 *
 * REGRA DO DONO (01/ago/2026): "vamos parar com essa merda de conserta 1 coisa e quebra 2.
 * vc sabe como tem que ser, então faça direito garantindo que fique certo de uma vez."
 *
 * A causa nunca foi cada bug isolado: eram QUATRO lugares calculando os MESMOS três
 * números — o diálogo, o overlay ao vivo, o atualizador dos contadores do perfil e o
 * rótulo da extensão — cada um com uma regra própria. Cada correção num deles deixava os
 * outros divergirem, e o dono via a barra oscilar entre releituras: "35 de 35" ↔ "33 de 35",
 * "391 de 391" ↔ "391 de 397", verde ↔ violeta.
 *
 * Este teste EXECUTA a função com dados reais medidos e trava o comportamento inteiro.
 */
const path = require('path'), fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
const ctx = { window: {}, console, Object, Array, Math, JSON, String, Number, _LZ_COL: {} };
vm.createContext(ctx);
// só as peças de que a contagem depende
function trecho(de, ate) { const i = app.indexOf(de), j = app.indexOf(ate); return app.slice(i, j); }
vm.runInContext(
  trecho('function _lzTot(imp)', '// TORNEIO LIDO ≠ torneio conhecido') +
  trecho('window._lzTournamentsRead = function', '// Conta COMPETIÇÕES DISTINTAS') +
  trecho('function _lzCompsReais(imp, oficial)', '  window._lzContagens = function') +
  trecho('window._lzContagens = function (imp)', '  window._lzAthleteDialog = function'), ctx);
const conta = ctx.window._lzContagens;
ok(typeof conta === 'function', 'a função existe e carrega sozinha (sem contexto de tela)');

function jogos(n, comp) {
  return Array.from({ length: n }, (_, i) => ({
    lzId: 5000 + i, club: 'c', official: !!comp && comp.startsWith('t'),
    kind: (comp && comp.startsWith('t')) ? 'tournament' : 'ranking',
    tourneyId: (comp && comp.startsWith('t')) ? comp.slice(1) : null,
    rankingId: (comp && comp.startsWith('r')) ? comp.slice(1) : null
  }));
}

console.log('\n── Kelly: 158 linhas no perfil, 157 partidas de verdade ──');
{
  const imp = { games: jogos(157, 'r1'), declaredGames: 158, indexTotal: 157,
    totais: { fonte: 'indice', jogos: 157 },
    lzCursor: { complete: true, pageDone: 8, pagesTotal: 8, toursDone: {}, ranksDone: { 'r/c/1': 1 } } };
  const c = conta(imp);
  ok(c.g.y === 157, 'o total é o do ÍNDICE, não o contador do perfil (veio ' + c.g.y + ')');
  ok(c.g.x === 157, 'e fecha em 100%');
}

console.log('\n── Fabio: o contador do perfil diz 397, o índice diz 391 ──');
{
  const imp = { games: jogos(391, 'r1'), declaredGames: 397, indexTotal: 391,
    totais: { fonte: 'indice', jogos: 391 },
    lzCursor: { complete: true, pageDone: 20, pagesTotal: 20, toursDone: {}, ranksDone: {} } };
  ok(conta(imp).g.y === 391, 'o 397 não entra (veio ' + conta(imp).g.y + ')');
}

console.log('\n── competição só existe se tem jogo; e a que não abre também conta ──');
{
  const g = jogos(3, 't10').concat(jogos(2, 't11')).concat(jogos(4, 'r20'));
  const imp = { games: g, declaredGames: 9, indexTotal: 9, totais: { fonte: 'indice', jogos: 9 },
    tournamentsList: [{ club: 'c', tid: '10' }],            // a lista do perfil esquece o t11
    rankingsList: [{ club: 'c', rid: '20' }, { club: 'c', rid: '99' }],  // e inventa um sem jogo
    lzCursor: { complete: true, pageDone: 1, pagesTotal: 1,
      toursDone: { 't/c/10': 1, 't/c/11': 2 }, ranksDone: { 'r/c/20': 1 } } };
  const c = conta(imp);
  ok(c.t.y === 2, 'os 2 torneios COM JOGO contam, inclusive o que a lista esqueceu (veio ' + c.t.y + ')');
  ok(c.t.x === 2, 'e o que foi TENTADO e não abriu fecha a conta (veio ' + c.t.x + ')');
  ok(c.r.y === 1, 'o ranking listado SEM jogo nenhum não conta (veio ' + c.r.y + ')');
}

console.log('\n── x nunca passa de y, em nenhuma das três ──');
{
  const imp = { games: jogos(5, 'r1'), declaredGames: 3, indexTotal: 3, totais: { fonte: 'indice', jogos: 3 },
    lzCursor: { toursDone: { a: 1, b: 1, c: 1 }, ranksDone: { x: 1, y: 1 }, complete: false } };
  const c = conta(imp);
  ok(c.t.y == null || c.t.x <= c.t.y, 'torneios');
  ok(c.r.y == null || c.r.x <= c.r.y, 'rankings');
  ok(c.g.y == null || c.g.x <= c.g.y, 'jogos');
}

console.log('\n── leitura truncada mostra a verdade feia, não 100% ──');
{
  const imp = { games: jogos(20, 'r1'), declaredGames: 158,
    lzCursor: { complete: true, pageDone: 1, pagesTotal: 8, toursDone: {}, ranksDone: {} } };
  const c = conta(imp);
  ok(c.g.y === 158 && c.g.x === 20, '20 de 158 (veio ' + c.g.x + ' de ' + c.g.y + ')');
}

console.log('\n── e NINGUÉM MAIS calcula esses números por fora ──');
{
  const updBars = app.slice(app.indexOf('function _updBars(c) {'), app.indexOf('function _barsArr'));
  ok(/window\._lzContagens\(_impC\)/.test(updBars) && /var _impC = ultimoImp;/.test(updBars),
     'o overlay ao vivo usa a mesma função');
  ok(!/declaredGames/.test(updBars) && !/indexTotal/.test(updBars),
     'e não conhece mais nenhuma regra de total por conta própria');
  const dlg = app.slice(app.indexOf('window._lzAthleteDialog = function'), app.indexOf('function _montarAbas'));
  ok(/var _CT = window\._lzContagens\(imp\);/.test(dlg), 'o diálogo idem');
  ok(!/upd\('lz-ath-t'/.test(app) && !/upd\('lz-ath-r'/.test(app),
     'e os contadores ao vivo do perfil não escrevem mais em torneios/rankings');
}

console.log((fail ? '✗' : '✓') + ' lz-contagem-unica: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
