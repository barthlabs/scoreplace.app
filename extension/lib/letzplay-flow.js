/* letzplay-flow.js — helpers do FLUXO de import (detecção de conta, paginação,
 * total, agrupamento em competições). Compartilhado por popup.js (import via ícone)
 * e content.js (import direto disparado pelo app). window._spFlow.
 * Depende de window._spExtract (letzplay-extract.js).
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : this;
  // X (_spExtract) referenciado no MOMENTO DA CHAMADA — nunca capturado no load (se o
  // extract ainda não tivesse setado no load, detectMe ficava com X morto → null pra sempre).

  // ME = handle que aparece em TODOS (ou quase) os cards — o usuário logado joga em todos.
  function detectMe(doc) {
    var X = root._spExtract;
    if (!X) return null;
    var cards = [].slice.call(doc.querySelectorAll('.row.match'));
    var count = {};
    cards.forEach(function (c) {
      var hs = [].slice.call(c.querySelectorAll('a[href^="/"]'))
        .map(function (a) { return X.handleFromHref(a.getAttribute('href')); })
        .filter(Boolean);
      Array.from(new Set(hs)).forEach(function (h) { count[h] = (count[h] || 0) + 1; });
    });
    var me = null, best = 0;
    Object.keys(count).forEach(function (h) { if (count[h] > best) { best = count[h]; me = h; } });
    return me;
  }

  function detectMaxPage(doc) {
    var nums = [].slice.call(doc.querySelectorAll('a[href*="page="]')).map(function (a) {
      var m = a.getAttribute('href').match(/page=(\d+)/); return m ? +m[1] : 1;
    });
    return nums.length ? Math.max.apply(null, nums) : 1;
  }

  // Total de jogos do header ("81 Jogos • 39 Vitórias • 42 Derrotas") — pra barra por jogos.
  function parseTotalGames(doc) {
    var t = (doc.body.textContent || '').replace(/\s+/g, ' ');
    var m = t.match(/(\d+)\s*Jogos\s*[•·]\s*\d+\s*Vit/i);
    return m ? +m[1] : null;
  }

  // Agrupa os jogos em competições (footprint): oficial (torneio) vs recreativo (ranking).
  //
  // A CHAVE É O ID DA COMPETIÇÃO, NUNCA O TEXTO. Enquanto `categoryRaw` entrava na chave, um
  // texto que variasse entre jogos do MESMO torneio o partia em várias competições. Foi o
  // que aconteceu em produção (30/jul/2026, @camilacalia): o extrator pegava o link "Ver
  // trilha de X/Y" em vez do da categoria, e como a trilha muda de dupla pra dupla, 35
  // torneios viraram 55 entradas no footprint — a barra dizia "35 de 35 (100%)" com 14
  // torneios ainda por ler. O texto é ATRIBUTO da competição; a identidade é o id do
  // letzplay. Só cai no texto quando não há id nenhum (dado antigo).
  function buildRaw(me, matches) {
    var rankings = {}, tournaments = {};
    matches.forEach(function (m) {
      var bucket = m.official ? tournaments : rankings;
      var id = m.official ? m.tourneyId : m.rankingId;
      var key = (id != null && String(id))
        ? ((m.club || '') + '|#' + id)
        : ((m.club || '') + '|' + (m.categoryRaw || ''));
      if (!bucket[key]) bucket[key] = {
        name: m.categoryRaw, club: m.club, sport: 'Beach Tennis', categoryRaw: m.categoryRaw,
        year: m.year, status: 'done', wins: 0, losses: 0,
        tourneyId: m.tourneyId || null, rankingId: m.rankingId || null
      };
      // Categoria: o MELHOR texto entre os jogos da competição vence. Se o primeiro jogo
      // trouxe uma trilha ("Ver trilha de X/Y") e um seguinte trouxe a categoria de
      // verdade, é a categoria que fica — agrupar por id juntou os dois no mesmo balde,
      // e agora o balde não herda o pior texto só por ordem de chegada.
      var X = root._spExtract;
      if (X && X.isTrailText && X.isTrailText(bucket[key].categoryRaw) && m.categoryRaw && !X.isTrailText(m.categoryRaw)) {
        bucket[key].categoryRaw = m.categoryRaw;
        if (X.isTrailText(bucket[key].name) || !bucket[key].name) bucket[key].name = m.categoryRaw;
      }
      if (bucket[key].year == null && m.year != null) bucket[key].year = m.year;
      if (m.won) bucket[key].wins++; else if (m.won === false) bucket[key].losses++;
    });
    var rk = Object.keys(rankings).map(function (k) {
      var r = rankings[k]; var n = r.wins + r.losses;
      r.winPct = n ? Math.round(r.wins / n * 1000) / 10 : null; return r;
    });
    var tn = Object.keys(tournaments).map(function (k) { return tournaments[k]; });
    var wins = matches.filter(function (m) { return m.won; }).length;
    var losses = matches.filter(function (m) { return m.won === false; }).length;
    var fem = matches.some(function (m) { return /Feminina|Fem\b/.test(m.categoryRaw || ''); });
    return {
      handle: me, name: me, sports: ['Beach Tennis'], venues: [],
      totals: { matches: matches.length, wins: wins, losses: losses },
      ladder: fem ? 'beach-fem-2025' : 'beach-masc-2025',
      rankings: rk, tournaments: tn, matches: matches
    };
  }

  root._spFlow = {
    detectMe: detectMe,
    detectMaxPage: detectMaxPage,
    parseTotalGames: parseTotalGames,
    buildRaw: buildRaw
  };
})();
