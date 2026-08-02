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
const path = require("path"), fs = require("fs"), vm = require("vm");
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

// ══ REGRA DO DONO (02/ago/2026): O NÚMERO DO LETZPLAY É O NÚMERO DO APP ══════════════
// "nossos números têm que bater com esses para dar tranquilidade aos organizadores... lemos
// 397 deles e concluímos que o número é outro — escreve o número deles, SEMPRE."
// O organizador lê 397 lá e precisa ler 397 aqui. Divergência, mesmo correta e explicada,
// obriga cada pessoa a conferir de novo — é a insegurança que a Análise existe pra tirar.
console.log('\n── Kelly: o perfil diz 158 → o app diz 158 ──');
{
  const imp = { games: jogos(157, 'r1'), declaredGames: 158, indexTotal: 157,
    totais: { fonte: 'indice', jogos: 157 },
    lzCursor: { complete: true, pageDone: 8, pagesTotal: 8, toursDone: {}, ranksDone: { 'r/c/1': 1 } } };
  const c = conta(imp);
  ok(c.g.y === 158, 'o total exibido é o do PERFIL (veio ' + c.g.y + ')');
  ok(c.g.x === 158, 'e a varredura fechada bate 100% — lemos tudo que a fonte enumera');
}

console.log('\n── Fabio: o perfil diz 397 → o app diz 397 ──');
{
  const imp = { games: jogos(391, 'r1'), declaredGames: 397, indexTotal: 391,
    declaredTournaments: 33, declaredRankings: 27,
    totais: { fonte: 'indice', jogos: 391 },
    lzCursor: { complete: true, pageDone: 20, pagesTotal: 20, toursDone: {}, ranksDone: {} } };
  const c = conta(imp);
  ok(c.g.y === 397 && c.g.x === 397, '397 de 397 (veio ' + c.g.x + ' de ' + c.g.y + ')');
  ok(c.t.y === 33, 'torneios: 33, como no perfil (veio ' + c.t.y + ')');
  ok(c.r.y === 27, 'rankings: 27, como no perfil (veio ' + c.r.y + ')');
}

console.log('\n── mas leitura PELA METADE não vira 100% ──');
{
  const imp = { games: jogos(20, 'r1'), declaredGames: 158, indexTotal: 157,
    lzCursor: { complete: true, pageDone: 1, pagesTotal: 8, toursDone: {}, ranksDone: {} } };
  const c = conta(imp);
  ok(c.g.y === 158 && c.g.x === 20, '20 de 158 — o acervo não cobre o índice (veio ' + c.g.x + ' de ' + c.g.y + ')');
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
  // MEDIDO no Fabio (02/ago/2026): a lista do perfil tem 27 rankings, os jogos citam 17 e
  // 1 deles está FORA da lista. O número que ele vê no letzplay é 27; o certo é a UNIÃO,
  // 28. Contar só "com jogo" derrubava pra 17 e divergia do que a fonte mostra.
  ok(c.r.y === 2, 'a lista do perfil conta, mesmo o ranking sem jogo (veio ' + c.r.y + ')');
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

console.log('\n── união medida no Fabio: 33 na lista + 2 achados pelos jogos ──');
{
  const listaT = Array.from({ length: 33 }, (_, i) => ({ club: 'c', tid: String(100 + i) }));
  const listaR = Array.from({ length: 27 }, (_, i) => ({ club: 'c', rid: String(500 + i) }));
  const g = [];
  // jogos citando 35 torneios: 33 da lista + 2 de fora
  for (let i = 0; i < 33; i++) g.push({ lzId: i, club: 'c', official: true, kind: 'tournament', tourneyId: String(100 + i) });
  g.push({ lzId: 901, club: 'c', official: true, kind: 'tournament', tourneyId: '40597' });
  g.push({ lzId: 902, club: 'c', official: true, kind: 'tournament', tourneyId: '194830' });
  // e 17 rankings com jogo, sendo 1 fora da lista
  for (let i = 0; i < 16; i++) g.push({ lzId: 1000 + i, club: 'c', official: false, kind: 'ranking', rankingId: String(500 + i) });
  g.push({ lzId: 999, club: 'c', official: false, kind: 'ranking', rankingId: '39908' });
  const imp = { games: g, tournamentsList: listaT, rankingsList: listaR,
    indexTotal: g.length, totais: { fonte: 'indice', jogos: g.length },
    lzCursor: { complete: true, pageDone: 20, pagesTotal: 20, toursDone: {}, ranksDone: {} } };
  const c = conta(imp);
  ok(c.t.y === 35, 'torneios: 33 da lista ∪ 2 de fora = 35 (veio ' + c.t.y + ')');
  ok(c.r.y === 28, 'rankings: 27 da lista ∪ 1 de fora = 28 (veio ' + c.r.y + ')');
}

console.log('\n── e a leitura não pula o que é novo ──');
{
  const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  ok(/var _faltamIds = \(_idx && _idsConhecidos > 0\)/.test(cnt), 'compara os ids do índice com o acervo');
  ok(/Math\.floor\(i \/ 20\) \+ 1/.test(cnt),
     'a posição no índice diz a PÁGINA de cada id que falta');
  ok(/if \(C\.pagesRead\) delete C\.pagesRead\[pg\];/.test(cnt),
     'e só essas páginas são desmarcadas — não rebobina o que já foi lido');
  ok(/_idsConhecidos > 0/.test(cnt),
     'e a comparação por id só vale quando o acervo tem id (documento do motor antigo não dispara isso)');
  ok(/jaLeuTudo = \(C\.pagesTotal > 0 && C\.pageDone >= C\.pagesTotal\) && _faltamIds === 0/.test(cnt),
     '"já li tudo" passa a exigir que não falte id nenhum');
  ok(/partida\(s\) nova\(s\) — lendo /.test(cnt), 'e a tela diz quantas novidades achou e quantas páginas vai ler');
}

console.log((fail ? '✗' : '✓') + ' lz-contagem-unica: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
