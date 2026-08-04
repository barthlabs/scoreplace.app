/* O índice do histórico vem do JSON do letzplay — node tests/lz-api-index.test.js
 *
 * MEDIDO em 31/jul/2026 no letzplay real: é um app Rails renderizado no servidor, e toda
 * rota responde JSON com `.json`. /{handle}/matches.json?page=N devolve 20 por página, com
 * id da partida, data, id+tipo da competição e rodada — e a página seguinte à última
 * devolve `[]`.
 *
 * Isso troca DUAS inferências por fatos:
 *   • "quantos são": o contador do perfil conta CARDS (478 pra 469 partidas reais na
 *     Camila, 158 pra 157 na Kelly) — por isso a barra nunca fechava. O índice conta
 *     PARTIDAS.
 *   • "já li tudo": deixa de ser heurística de página (detectMaxPage lendo markup) e vira
 *     verificação — tenho todos os ids do índice?
 */
const path = require('path'), fs = require('fs'), vm = require('vm');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', 'lib', 'letzplay-api.js'), 'utf8'), ctx);
const API = ctx._spLzApi;
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

(async function () {
ok(!!API && typeof API.indice === 'function', 'a biblioteca expõe o índice');

// ── fixture: 158 partidas em 8 páginas (o caso real da Kelly), a 9ª vazia ──
function servidor(total, opts) {
  opts = opts || {};
  const todas = [];
  for (let i = 0; i < total; i++) {
    todas.push({ id: 10000000 + i, date: '2026-07-' + String((i % 28) + 1).padStart(2, '0'),
      matchable_id: 55000 + (i % 9), matchable_type: (i % 3 === 0) ? 'Tournament' : 'Ranking',
      round: (i % 7) + 1, status: 3 });
  }
  const hits = [];
  return { hits, todas, fetch: async function (u) {
    hits.push(u);
    if (opts.falharNaPagina && hits.length === opts.falharNaPagina) return null;
    const m = u.match(/[?&]page=(\d+)/);
    const p = m ? +m[1] : 1;
    const ini = (p - 1) * 20;
    let fatia = todas.slice(ini, ini + 20);
    if (opts.repetirPrimeira && p === 2) fatia = todas.slice(0, 20);   // fonte repetindo
    return fatia;
  } };
}

// 1) percorre até a página vazia e conta PARTIDAS
{
  const s = servidor(158);
  const r = await API.indice('KellyBarth1', s.fetch);
  ok(r.total === 158, 'traz as 158 partidas (veio ' + r.total + ')');
  ok(r.paginas === 8, 'em 8 páginas — parou na primeira vazia (veio ' + r.paginas + ')');
  ok(s.hits.length === 9, 'e fez exatamente 9 requisições: 8 com dado + a vazia que encerra');
  ok(!/detectMaxPage/.test(String(API.indice)), 'sem adivinhar o total de páginas pelo markup');
}

// 2) id manda: fonte que repete não infla
{
  const s = servidor(158, { repetirPrimeira: true });
  const r = await API.indice('KellyBarth1', s.fetch);
  ok(r.total === 138, 'a página repetida não acrescenta nada (20 dos 158 vieram duas vezes)');
  ok(Object.keys(r.porId).length === r.total, 'e o mapa por id bate com o total');
}

// 3) a competição sai pronta do índice, sem parse de texto
{
  const s = servidor(60);
  const r = await API.indice('x', s.fetch);
  const m = r.matches[0];
  ok(m.compId != null, 'cada partida traz o id da competição');
  ok(typeof m.oficial === 'boolean', 'e se é torneio (oficial) ou ranking');
  ok(r.matches.some((x) => x.oficial) && r.matches.some((x) => !x.oficial), 'os dois tipos são distinguidos');
  ok(Object.keys(r.comps).length === 9, 'as competições distintas são contadas pelo id (9)');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(m.dateISO), 'a data vem em formato de calendário, sem parse de texto');
}

// 4) falha de rede NÃO vira "acabou" — é erro, com a página onde parou
{
  const s = servidor(158, { falharNaPagina: 3 });
  let erro = null;
  try { await API.indice('x', s.fetch); } catch (e) { erro = e; }
  ok(!!erro, 'página que falha lança em vez de encerrar a lista');
  ok(erro && erro.pagina === 3, 'dizendo em qual página parou (veio ' + (erro && erro.pagina) + ')');
}

// 5) perfil vazio
{
  const s = servidor(0);
  const r = await API.indice('x', s.fetch);
  ok(r.total === 0 && r.paginas === 0, 'perfil sem jogos devolve zero, sem erro');
}

// 6) perfil MONSTRO
{
  const s = servidor(2000);
  const r = await API.indice('x', s.fetch);
  ok(r.total === 2000, 'perfil de 2000 jogos vem inteiro');
  ok(s.hits.length === 101, '100 páginas + a vazia (veio ' + s.hits.length + ')');
}


// ── O ÍNDICE REPETE LINHA: 158 entradas, 157 partidas (medido no perfil da Kelly) ────────
// A partida 9299283 vem na página 2 E na 3. O contador do perfil diz "158 Jogos" porque
// conta LINHAS. Não existe 158º jogo. Quem manda é o id.
{
  const paginas = {
    1: Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, date: '2026-01-01' })),
    2: Array.from({ length: 20 }, (_, i) => ({ id: 200 + i, date: '2026-01-01' })),
    3: [{ id: 219, date: '2026-01-01' }].concat(Array.from({ length: 19 }, (_, i) => ({ id: 300 + i, date: '2026-01-01' }))),
    4: []
  };
  const r = await API.indice('kelly', async (u) => { const m = u.match(/[?&]page=(\d+)/); return paginas[m ? +m[1] : 1] || []; });
  const entradas = 20 + 20 + 20;
  ok(entradas === 60, 'a fonte devolveu 60 LINHAS');
  ok(r.total === 59, 'e o índice contou 59 PARTIDAS distintas (veio ' + r.total + ')');
  ok(!r.parcial, 'varreu até a página vazia');
}

// ── O TOTAL TEM PROCEDÊNCIA: índice substitui declarado, inclusive pra baixo ─────────────
{
  const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  const b = cnt.slice(cnt.indexOf('var _idxOk = _indexTotal > 0;'), cnt.indexOf('var _idxOk = _indexTotal > 0;') + 1600);
  ok(/fonte: _idxOk \? 'indice' : 'declarado'/.test(b), 'o total gravado diz de onde veio');
  ok(/if \(_antesIdx\) t\.jogos = Math\.max/.test(b) && /t\.jogos = _totaisAntes\.jogos \|\| t\.jogos; t\.fonte = 'indice'/.test(b),
     'só disputa Math.max com total da mesma qualidade — e um declarado nunca rebaixa um índice');

  // simula a regra: declarado 158 gravado antes, índice 157 agora → tem que virar 157
  function totalDeJogos(indexTotal, declarado, antes) {
    const idxOk = indexTotal > 0;
    let jogos = indexTotal || declarado || 0;
    if (antes) {
      const antesIdx = antes.fonte === 'indice';
      if (idxOk) { if (antesIdx) jogos = Math.max(jogos, antes.jogos || 0); }
      else if (antesIdx) jogos = antes.jogos || jogos;
      else jogos = Math.max(jogos, antes.jogos || 0);
    }
    return jogos;
  }
  ok(totalDeJogos(157, 158, { jogos: 158, fonte: 'declarado' }) === 157, 'o índice CORRIGE o piso errado pra baixo');
  ok(totalDeJogos(0, 158, { jogos: 157, fonte: 'indice' }) === 157, 'e um declarado novo não estraga um índice antigo');
  ok(totalDeJogos(160, 160, { jogos: 157, fonte: 'indice' }) === 160, 'índice novo maior vence índice antigo');
  ok(totalDeJogos(0, 158, { jogos: 20, fonte: 'declarado' }) === 158, 'sem índice, o declarado ainda é piso e nunca cai');
}

// ── A TELA: índice > total gravado > declarado (piso) ────────────────────────────────────
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/var _idxT = \(imp && imp\.indexTotal > 0\) \? imp\.indexTotal/.test(app), 'a barra usa o índice antes de tudo');
  ok(/_T\.fonte === 'indice'/.test(app), 'e aceita o total gravado como índice quando ele diz que é');
  ok(app.indexOf('if (_idxT > 0) gY = _idxT;') < app.indexOf('else if (imp && imp.declaredGames > 0)'),
     'o contador do perfil só entra depois — como PISO, nunca como teto');
}

// ── O NÚMERO DA ABA É DAS DUAS FONTES ────────────────────────────────────────────────────
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/window\._lzAbaNum = function \(qual, n, somar\)/.test(app), 'existe quem reescreva o número da aba');
  // REVISADO em 02/ago/2026: a aba contava a LISTA renderizada (cards distintos) enquanto a
  // barra passou a mostrar o número do PERFIL — divergência dentro do mesmo diálogo. Agora
  // a aba é "número do letzplay + o que é nosso" (regra: os números do scoreplace SOMAM).
  ok(/window\._lzAbaNum\('jogo', \(_base\.jogo \|\| 0\) \+ _spJogos\)/.test(app),
     'depois de costurar o scoreplace, a aba Jogos soma os nossos AO número do letzplay');
  ok(/window\._lzAbaNum\('tour', \(_base\.tour \|\| 0\) \+ linhasT\.length\)/.test(app) &&
     /window\._lzAbaNum\('rank', \(_base\.rank \|\| 0\) \+ linhasR\.length\)/.test(app),
     'e as abas Torneios/Rankings somam as competições do app');
}

// ── VARREDURA FECHADA EXCLUI O JOGO FANTASMA (regra do dono) ────────────────────────────
// Prova aritmética: 20 por página. N páginas varridas ⇒ o total tem que cair em
// (20(N-1), 20N]. Serve pra distinguir "a fonte contou linha a mais" de "a leitura parou".
{
  function totalNaTela(gX, declarado, cur, indexTotal) {
    let idxT = indexTotal > 0 ? indexTotal : 0;
    if (!(idxT > 0) && cur && cur.complete === true && cur.pagesTotal > 0 &&
        cur.pageDone >= cur.pagesTotal && gX > (cur.pagesTotal - 2) * 20 && gX <= cur.pagesTotal * 20) idxT = gX;
    if (idxT > 0) return idxT;
    return declarado > 0 ? Math.max(declarado, gX) : gX;
  }
  const fechado = (n) => ({ complete: true, pageDone: n, pagesTotal: n });
  ok(totalNaTela(157, 158, fechado(8), 0) === 157, 'Kelly: 8 páginas varridas, 157 achados → 157 (o 158º não existe)');
  ok(totalNaTela(469, 478, fechado(24), 0) === 469, 'Camila: 24 páginas, 469 achados → 469');
  ok(totalNaTela(20, 158, { complete: true, pageDone: 1, pagesTotal: 8 }, 0) === 158,
     'leitura truncada em 1 de 8 páginas NÃO fecha — mostra 20 de 158');
  ok(totalNaTela(20, 158, fechado(8), 0) === 158,
     'cursor MENTINDO ("completo" com 20 em 8 páginas) não passa: 20 não cabe em (140,160]');
  ok(totalNaTela(80, 81, fechado(5), 0) === 80,
     'Rodrigo: varredura fechada achou 80 — o 81 é o contador de linhas do perfil');
  ok(totalNaTela(20, 158, fechado(8), 0) === 158,
     'e 20 em 8 páginas continua sem fechar (a faixa larga ainda separa perda de leitura)');
  ok(totalNaTela(160, 158, fechado(8), 0) === 160, 'página cheia no fim (20×8) é limite válido');
  ok(totalNaTela(150, 158, fechado(8), 157) === 157, 'quando o índice existe, é ele que manda');
}
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/gX > \(_cur\.pagesTotal - 2\) \* _POR_PG && gX <= _cur\.pagesTotal \* _POR_PG/.test(app),
     'a regra na tela é a aritmética da paginação, não a palavra do cursor');
}

// ── O SEGUNDO ESCRITOR DA BARRA TAMBÉM OBEDECE AO TETO ──────────────────────────────────
// Medido na tela do dono: "🏆 Torneios 4 de 2 (100%)". Quem escreveu não foi o barLine
// (que capa) nem o _updBars (que capa) — foi o atualizador dos contadores ao vivo.
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  const fn = app.slice(app.indexOf('function upd(id, y) {'), app.indexOf('upd(\'lz-ath-t\''));
  ok(/if \(y > 0 && x > y\) \{ x = y;/.test(fn), 'x nunca passa de y também aqui');
  ok(/if \(el\.getAttribute\('data-auth'\) === '1'\) return;/.test(fn),
     'e um total que é FATO não é rebaixado pelo contador de linhas do perfil');
  ok(/barLine\('lz-ath-g', '🎾', 'Jogos', gX, gY, _idxT > 0\)/.test(app),
     'a barra de jogos marca quando o total veio do índice/varredura');
}

// ── COMPETIÇÃO REAL = LISTADA NO PERFIL **OU** CITADA POR UM JOGO ───────────────────────
// Perfil do dono, medido: tournaments.json lista 2 (335721, 297385) e os jogos citam 4
// (mais 214672 e 214674 — um deles é o BTG). O contador teria apagado dois torneios que
// ele disputou. Do outro lado, o footprint conhecia 5 rankings onde existem 4.
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  const ini = app.indexOf('function _lzCompsReais(imp, oficial) {');
  const fim = app.indexOf('window._lzCompsReaisN = function');
  vm.runInContext(app.slice(ini, fim) + '\nwindow._lzCompsReaisN = function (i, o) { return Object.keys(_lzCompsReais(i, o)).length; };', ctx);
  const N = ctx.window._lzCompsReaisN;

  const imp = {
    tournamentsList: [{ club: 'c', tid: 335721 }, { club: 'c', tid: 297385 }],
    rankingsList: [{ club: 'c', rid: 48552 }, { club: 'c', rid: 13332 }, { club: 'c', rid: 7839 }, { club: 'c', rid: 33695 }],
    games: [
      { official: true, club: 'c', tourneyId: 214672 }, { official: true, club: 'c', tourneyId: 214674 },
      { official: true, club: 'c', tourneyId: 297385 }, { official: true, club: 'c', tourneyId: 335721 },
      { official: false, kind: 'ranking', club: 'c', rankingId: 7839 },
      { official: false, kind: 'ranking', club: 'c', rankingId: 33695 },
      { official: false, kind: 'ranking', club: 'c', rankingId: 48552 }
    ]
  };
  ok(N(imp, true) === 4, 'torneios: os 4 COM JOGO, incluindo os 2 fora da lista (o BTG volta) — veio ' + N(imp, true));
  // REVOGADO em 02/ago/2026 pelo dono, com medição: no perfil do Fabio a lista tem 27
  // rankings e os jogos citam 17 — o número que ele VÊ no letzplay é 27. Contar só "com
  // jogo" divergia da fonte. A lista é enumerável e verificável; ela conta. O que a regra
  // "com jogo" acrescenta é o que está FORA da lista (1 ranking, 2 torneios no caso dele).
  ok(N(imp, false) === 4, 'rankings: a lista do perfil conta, mesmo sem jogo (veio ' + N(imp, false) + ')');
  ok(N({ games: [{ official: true, club: 'c', tourneyId: 9 }] }, true) === 1, 'jogo sozinho prova a competição, mesmo fora da lista');
  ok(N({ tournamentsList: [{ club: 'c', tid: 9 }], games: [] }, true) === 1, 'a lista sozinha já conta — é o que o perfil mostra');
  ok(N({ footprint: [{ official: false, club: 'c', rankingId: 1 }] }, false) === 0,
     'footprint não cria competição enquanto os jogos estão no documento');
  ok(N({ gamesTruncated: true, games: [], footprint: [{ official: false, club: 'c', rankingId: 1 }] }, false) === 1,
     'só quando o acervo foi truncado a pegada do jogo antigo vale');
}

// ── O CONTADOR AO VIVO NUNCA ENCOLHE O TOTAL ────────────────────────────────────────────
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  const fn = app.slice(app.indexOf('function upd(id, y) {'), app.indexOf("upd('lz-ath-t'"));
  ok(/if \(yAtual > 0 && y < yAtual\) return;/.test(fn), 'um total menor vindo do perfil é ignorado');
  ok(!/upd\('lz-ath-t'/.test(app) && !/upd\('lz-ath-r'/.test(app),
     'e torneios/rankings não recebem mais nada do contador do perfil');
  ok(/data-y="' \+ \(y \|\| 0\) \+ '"/.test(app), 'e a barra guarda o total apurado pra poder comparar');
}

// ── QUEM TEM JOGO ENTRA NA LISTA DE LEITURA ─────────────────────────────────────────────
// A lista pública do perfil é incompleta (dono: 2 enumerados × 4 citados; Fabio: 33 × 35).
// Sem isso a barra fica em "33 de 35" pra sempre: a competição existe, tem jogo, e o
// leitor nunca abre a página dela porque ela não está na lista.
{
  const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  const fn = cnt.slice(cnt.indexOf('function unirConhecidos'), cnt.indexOf('function unirConhecidos') + 2400);
  ok(/COMPETIÇÃO CITADA POR UM JOGO TAMBÉM ENTRA NA LISTA/.test(fn), 'a regra está onde a lista é montada');
  ok(/prior && Array\.isArray\(prior\.games\)/.test(fn), 'olha os jogos já gravados…');
  ok(/\.concat\(all \|\| \[\]\)/.test(fn), '…e os lidos nesta rodada');
  ok(/if \(\(pre === 't'\) !== ehT\) return;/.test(fn), 'sem misturar torneio com ranking');
  ok(/var id = ehT \? g\.tourneyId : g\.rankingId;/.test(fn), 'a chave é club/id, como no resto');
}

// ── O TOTAL AO VIVO NÃO É TROCADO PELO CONTADOR DO PERFIL ───────────────────────────────
// Medido na tela do dono, 47s entre dois prints: "Jogos 391 de 391 (100%)" virou
// "391 de 397 (98%)" NO MEIO da leitura. 391 = índice (partidas distintas); 397 = contador
// de linhas do perfil. A barra ao vivo aceitava qualquer número que chegasse.
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  // 01/ago/2026, versão final: a barra ao vivo não tem MAIS NENHUMA regra própria —
  // ela chama a função única (_lzContagens), que já conhece a procedência do total.
  const fn = app.slice(app.indexOf('function _updBars(c) {'), app.indexOf('function _barsArr'));
  ok(/window\._lzContagens\(_impC\)/.test(fn), 'a barra ao vivo usa a função única');
  ok(/if \(_C\.g\.y != null\) _bs\.g\.y = _C\.g\.y;/.test(fn), 'e tira o total dela');
  ok(/\} else \{\s*\n\s*if \(c\.tY != null\)/.test(fn),
     'os contadores da extensão só entram enquanto não há import nenhum');
}

// ── TENTEI E NÃO ABRIU É UM RESULTADO, NÃO UM PENDENTE ETERNO ──────────────────────────
// "nunca completa e quando falta quase nada demora uma vida para fechar." Medido no Fabio:
// 2 dos 35 torneios (os que vêm dos jogos, fora da lista do perfil) devolvem erro. Como só
// entravam na conta ao ABRIR, a barra ficava em 33 de 35 pra sempre e toda releitura
// tentava os mesmos 2 de novo.
{
  const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  ok(/C\.toursDone\[tk\] = 2;/.test(cnt), 'torneio que não abre é marcado como TENTADO (2)');
  ok(/C\.ranksDone\[rk\] = 2;/.test(cnt), 'e o ranking também');
  ok((cnt.match(/não abriu — segue sem ele/g) || []).length === 2, 'e a tela fica sabendo dos dois');
  ok(/if \(C\.toursDone\[tk\] === 2\) return false;/.test(cnt) && /if \(C\.ranksDone\[rk\] === 2\) return false;/.test(cnt),
     'e o marcado como TENTADO não é rebuscado na rodada seguinte — mesmo sem detalhe nenhum');
}

// ── CARD REPETIDO ≠ LINHA PERDIDA — decidido por ARITMÉTICA, não por opinião ────────────
// Já errei este diagnóstico nas duas direções (primeiro "é duplicata", depois capitulei
// pro "são 397"). Medição final, JSON e HTML: Kelly 162 cards → 160 partidas (ids 7770348
// e 8894372 idênticos, byte a byte); Fabio 397 → 391 (6 repetidos, estáveis). A regra:
// linhas >= esperado → nada foi perdido, a diferença é card repetido DO LETZPLAY;
// linhas <  esperado → aí sim faltou página, repassa e funde.
{
  // Kelly: 9 páginas, 162 linhas, 160 distintos — SEM repasse (nada foi perdido)
  // 162 linhas = 160 partidas + 2 ids repetidos (como no perfil real dela)
  const stream = [];
  for (let i2 = 1; i2 <= 160; i2++) stream.push(i2);
  stream.splice(65, 0, 30);      // id 30 servido de novo
  stream.splice(85, 0, 50);      // id 50 servido de novo
  const paginas = {};
  for (let pi = 0; pi * 20 < stream.length; pi++)
    paginas[pi + 1] = stream.slice(pi * 20, pi * 20 + 20).map(x => ({ id: x, date: '2026-01-01' }));
  const porPag = Object.keys(paginas);
  let hits = 0;
  const r = await API.indice('kelly', async (u) => { hits++; const m = u.match(/[?&]page=(\d+)/); return paginas[m ? +m[1] : 1] || []; },
    { esperado: 162 });
  ok(r.linhas === 162, 'contou as 162 LINHAS servidas (veio ' + r.linhas + ')');
  ok(r.total === 160, 'e 160 partidas distintas (veio ' + r.total + ')');
  ok(r.passadas === 0, 'NENHUM repasse: linhas >= esperado prova que nada foi perdido (veio ' + r.passadas + ')');
  ok(hits === porPag.length + 1, 'uma varredura só + a página vazia (veio ' + hits + ')');
}
{
  // falha real: uma página não servida → linhas < esperado → repassa e recupera
  const boas = {}; for (let p2 = 1; p2 <= 3; p2++) boas[p2] = Array.from({ length: 20 }, (_, i) => ({ id: p2 * 100 + i, date: '2026-01-01' }));
  let falhouUma = false;
  const r2 = await API.indice('x', async (u) => {
    const m = u.match(/[?&]page=(\d+)/); const pg = m ? +m[1] : 1;
    if (pg === 2 && !falhouUma) { falhouUma = true; return []; }   // o servidor devolveu vazio no meio
    return boas[pg] || [];
  }, { esperado: 60 });
  ok(r2.passadas > 0, 'linhas < esperado dispara o repasse');
  ok(r2.total === 60, 'e o repasse recupera as 20 que a falha comeu (veio ' + r2.total + ')');
}
{
  const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  ok(/_cardsRepetidos = totJogos - _idx\.total;/.test(cnt), 'a extensão registra os cards repetidos do letzplay');
  ok(/cards repetidos lá — partidas reais/.test(cnt), 'e avisa na leitura');
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/são cards repetidos' \) \+ ' lá|é card repetido/.test(app.replace(/\n/g, ' ')) || /cards repetidos/.test(app),
     'a ficha EXPLICA a diferença — número divergente sem explicação é indistinguível de erro');
  ok(/cardsRepetidos/.test(app.slice(app.indexOf('out.totais = {'), app.indexOf('out.totais = {') + 700)),
     'e a união preserva o campo');
}

console.log((fail ? '✗' : '✓') + ' lz-api-index: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
})();
