/* scoreplace.app — letzplay-extract.js
 * EXTRATOR: roda na página do letzplay (extensão do organizador / bookmarklet, na
 * sessão logada do navegador — passa o Cloudflare) e produz o `raw` que
 * letzplay-import.js normaliza.
 *
 * Arquitetura em 2 camadas:
 *  - NÚCLEO PURO (handleFromHref, parseCategory, parseRankingRef, matchFromCard):
 *    zero DOM, 100% testável headless (tests/letzplay-extract.test.js).
 *  - CASCA DOM (extract*FromDoc): querySelector sobre o documento vivo; chama o núcleo.
 *    Finalizada/confirmada AO VIVO contra o letzplay logado.
 *
 * Observado no letzplay (jul/2026): categoria linka pra /{clube}/rankings/{id};
 * jogadores linkam pra /{handle} (sem /u/); cada card de jogo tem 2 "times" com placar.
 */
(function () {
  var root = (typeof window !== 'undefined') ? window
           : (typeof global !== 'undefined') ? global : this;

  // ── NÚCLEO PURO ─────────────────────────────────────────────────────

  /** '/GersomOtsu' -> 'GersomOtsu'. Ignora rotas do app (/u/…), rankings, torneios. */
  function handleFromHref(href) {
    if (!href || typeof href !== 'string') return null;
    if (!/^\/[A-Za-z0-9_.\-]+$/.test(href)) return null;            // um único segmento
    if (/^\/u(\/|$)/.test(href)) return null;
    if (href.indexOf('/rankings') >= 0 || href.indexOf('/tournaments') >= 0
        || href.indexOf('/replacements') >= 0 || href.indexOf('/student') >= 0) return null;
    var reserved = { '/login': 1, '/home': 1, '/about': 1, '/not-found': 1 };
    if (reserved[href]) return null;
    return href.replace(/^\//, '');
  }

  /** Categoria de RANKING ("Social Masc D+ / C- | 2026 Rodada: 9") ou de TORNEIO
   * ("Grupos • Finals … - Masculina D"). Torneio (tem "•"): categoria = último token
   * gênero+nível (evita pegar "de mistas" minúsculo). Ranking (tem "|"): antes do "|". */
  function parseCategory(catText) {
    var t = String(catText || '').replace(/\s+/g, ' ').trim();
    var round = null, rm = t.match(/Rodada:\s*(\d+)/i); if (rm) round = +rm[1];
    var year = null, ym = t.match(/\b(20\d{2})\b/); if (ym) year = +ym[1];
    var cat;
    if (t.indexOf('•') >= 0) {                                  // "•" = card de torneio
      var mm = t.match(/(Masculina|Feminina|Mista|Masc|Fem)\s*-?\s*([A-Z0-9][A-Z0-9+\/]*)/g);
      cat = (mm && mm.length) ? mm[mm.length - 1].replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim()
                              : t.split('•').pop().trim();
    } else {                                                        // card de ranking
      cat = t.split('|')[0].replace(/Rodada:.*$/i, '').trim();
    }
    return { categoryRaw: cat, year: year, round: round };
  }

  /** '/paineiras-bt/rankings/48552' -> { club:'paineiras-bt', rankingId:'48552' }. */
  function parseRankingRef(href) {
    var m = String(href || '').match(/^\/([^\/]+)\/rankings\/(\d+)/);
    return m ? { club: m[1], rankingId: m[2] } : { club: null, rankingId: null };
  }

  /** Monta um jogo a partir do card já decomposto em 2 times, resolvendo qual é o "meu"
   * lado (contém meHandle), o parceiro, os adversários e quem venceu (pelo placar).
   * card = { catHref, catText, dateText, teams:[{handles,names,score},{...}] }. */
  function matchFromCard(card, meHandle) {
    if (!card) return null;
    var cat = parseCategory(card.catText);
    var ref = parseRankingRef(card.catHref);
    var teams = Array.isArray(card.teams) ? card.teams : [];
    var myIdx = -1;
    for (var i = 0; i < teams.length; i++) {
      if ((teams[i].handles || []).indexOf(meHandle) >= 0) { myIdx = i; break; }
    }
    if (myIdx < 0) return null;                                     // não é jogo do usuário
    var mine = teams[myIdx] || { handles: [], names: [] };
    var opp = teams[1 - myIdx] || { handles: [], names: [] };
    var partnerHandle = null, partnerName = null;
    (mine.handles || []).forEach(function (h, ix) {
      if (h !== meHandle) { partnerHandle = h; partnerName = (mine.names || [])[ix] || null; }
    });
    var won = (typeof mine.score === 'number' && typeof opp.score === 'number')
      ? (mine.score > opp.score) : null;
    return {
      date: card.dateText || null,
      categoryRaw: cat.categoryRaw, round: cat.round, year: cat.year,
      official: card.official === true,                             // torneio = OFICIAL; ranking = recreativo
      kind: card.official === true ? 'tournament' : 'ranking',
      club: ref.club, rankingId: ref.rankingId,
      partnerHandle: partnerHandle, partnerName: partnerName,
      oppHandles: (opp.handles || []).slice(),
      oppNames: (opp.names || []).slice(),
      myScore: (typeof mine.score === 'number') ? mine.score : null,
      oppScore: (typeof opp.score === 'number') ? opp.score : null,
      won: won
    };
  }

  // ── CASCA DOM (roda na página) — VERIFICADA AO VIVO (jul/2026) ───────

  /** Decompõe o corpo do card (.col-xs-12) nos 2 times, em ordem do documento:
   * jogador+ → placar PRINCIPAL (número em DIV/STRONG; <sub> é o tiebreak, ignorado)
   * fecha o time e abre o próximo. O placar do vencedor vem em <strong>. */
  function extractTeamsFromBody(body) {
    var teams = [], cur = { handles: [], names: [], score: null };
    (function walk(n) {
      for (var i = 0; i < n.children.length; i++) {
        var c = n.children[i];
        if (c.tagName === 'A') {
          var h = handleFromHref(c.getAttribute('href'));
          if (h && cur.handles.indexOf(h) < 0) {
            cur.handles.push(h);
            cur.names.push((c.textContent || '').replace(/\s+/g, ' ').trim());
          }
        }
        var leaf = Array.prototype.slice.call(c.childNodes)
          .filter(function (x) { return x.nodeType === 3; })
          .map(function (x) { return x.textContent; }).join('').replace(/\s+/g, ' ').trim();
        var isScore = /^\d{1,3}$/.test(leaf) && c.querySelectorAll('a[href]').length === 0;
        if (isScore && c.tagName !== 'SUB' && cur.handles.length) {
          cur.score = +leaf;
          teams.push(cur);
          cur = { handles: [], names: [], score: null };
        }
        if (c.children.length) walk(c);
      }
    })(body);
    if (cur.handles.length) teams.push(cur);
    return teams;
  }

  /** Extrai os jogos da página de histórico. Cada jogo é um `.row.match`.
   * VERIFICADO AO VIVO: 14 jogos reais de @RodrigoBarth extraídos corretamente
   * (parceiro / adversários / placar / vitória). */
  function extractMatchesFromDoc(doc, meHandle) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return [];
    var out = [];
    var cards = Array.prototype.slice.call(doc.querySelectorAll('.row.match'));
    cards.forEach(function (card) {
      // Puxa TUDO: torneio (OFICIAL, /tournaments/) e ranking (recreativo, /rankings/).
      var tournLink = card.querySelector('a[href*="/tournaments/"]');
      var catLink = tournLink || card.querySelector('a[href*="/rankings/"]');
      var body = card.querySelector('.col-xs-12');
      if (!catLink || !body) return;
      var dateText = Array.prototype.slice.call(card.children)
        .map(function (c) { return (c.textContent || '').trim(); })
        .filter(function (t) { return /\d{2}\/\d{2}\/\d{2}/.test(t); })[0] || null;
      var m = matchFromCard({
        catHref: catLink.getAttribute('href'),
        catText: catLink.textContent,
        dateText: dateText,
        official: !!tournLink,
        teams: extractTeamsFromBody(body)
      }, meHandle);
      if (m) out.push(m);
    });
    return out;
  }

  root._spExtract = {
    handleFromHref: handleFromHref,
    parseCategory: parseCategory,
    parseRankingRef: parseRankingRef,
    matchFromCard: matchFromCard,
    extractTeamsFromBody: extractTeamsFromBody,
    extractMatchesFromDoc: extractMatchesFromDoc
  };
})();
