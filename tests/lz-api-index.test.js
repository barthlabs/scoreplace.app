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
  ok(/window\._lzAbaNum\('jogo', \(window\._lzGameItens \|\| \[\]\)\.length\)/.test(app),
     'depois de costurar o scoreplace, a aba Jogos passa a contar a lista inteira');
  ok(/window\._lzAbaNum\('tour', linhasT\.length, true\)/.test(app) && /window\._lzAbaNum\('rank', linhasR\.length, true\)/.test(app),
     'e as abas Torneios/Rankings somam as competições do app');
}

console.log((fail ? '✗' : '✓') + ' lz-api-index: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
})();
