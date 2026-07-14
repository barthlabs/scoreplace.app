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

  /** '/paineiras-bt/tournaments/38847' -> { club:'paineiras-bt', tourneyId:'38847' }.
   * O card do jogo linka via /tournaments/{id}; a página real é /{club}/tourneys/{id}
   * (o content.js busca lá o nome real do torneio). Aceita as duas grafias. */
  function parseTourneyRef(href) {
    var m = String(href || '').match(/^\/([^\/]+)\/(?:tournaments|tourneys)\/(\d+)/);
    return m ? { club: m[1], tourneyId: m[2] } : { club: null, tourneyId: null };
  }

  /** Monta um jogo a partir do card já decomposto em 2 times, resolvendo qual é o "meu"
   * lado (contém meHandle), o parceiro, os adversários e quem venceu (pelo placar).
   * card = { catHref, catText, dateText, teams:[{handles,names,score},{...}] }. */
  function matchFromCard(card, meHandle) {
    if (!card) return null;
    var cat = parseCategory(card.catText);
    var isT = card.official === true;
    var ref = isT ? parseTourneyRef(card.catHref) : parseRankingRef(card.catHref);
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
      club: ref.club, rankingId: isT ? null : ref.rankingId, tourneyId: isT ? ref.tourneyId : null,
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

  // normaliza p/ casar nome↔handle: sem acento, minúsculo, só alfanumérico.
  function _normName(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** VERIFICADO AO VIVO (jul/2026): o link do jogador no card é só o avatar (sem texto).
   * O NOME DE APRESENTAÇÃO real vive num <span class="match-players-double|single">
   * ("Gersom Otsu João Scassa"), na ordem dos avatares. Casa cada handle ao seu nome:
   * consome palavras enquanto a concatenação normalizada é prefixo do handle; o último
   * handle do time leva as palavras restantes. Ex.: [FabioSimaoB, msmano] +
   * "Fábio Simão Max Mano" → {FabioSimaoB:"Fábio Simão", msmano:"Max Mano"}. */
  function namesByHandleFromCard(card) {
    var map = {};
    var rows = Array.prototype.slice.call(card.querySelectorAll('.row.match-player'));
    rows.forEach(function (row) {
      var handles = Array.prototype.slice.call(row.querySelectorAll('.match-player-info a[href^="/"]'))
        .map(function (a) { return handleFromHref(a.getAttribute('href')); }).filter(Boolean);
      var span = row.querySelector('.match-players-double, .match-players-single');
      var namesText = span ? (span.textContent || '').replace(/\s+/g, ' ').trim() : '';
      var words = namesText ? namesText.split(' ').filter(Boolean) : [];
      var wi = 0;
      handles.forEach(function (h, hi) {
        var isLast = hi === handles.length - 1;
        if (isLast) { if (wi < words.length) { map[h] = words.slice(wi).join(' '); wi = words.length; } return; }
        var target = _normName(h).replace(/\d+$/, ''), acc = '', used = [];
        while (wi < words.length) {
          var cand = acc + _normName(words[wi]);
          if (target.indexOf(cand) === 0) { acc = cand; used.push(words[wi]); wi++; if (acc === target) break; }
          else break;
        }
        if (!used.length && wi < words.length) { used.push(words[wi]); wi++; } // não deixa faminto
        if (used.length) map[h] = used.join(' ');
      });
    });
    return map;
  }

  /** Extrai os jogos da página de histórico. Cada jogo é um `.row.match`.
   * VERIFICADO AO VIVO: jogos reais de @RodrigoBarth extraídos corretamente
   * (parceiro / adversários / NOME de apresentação / placar / vitória). */
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
      if (m) {
        // Resolve NOME de apresentação real (o card só traz avatar+handle no link).
        var nameByHandle = namesByHandleFromCard(card);
        if (m.partnerHandle && nameByHandle[m.partnerHandle]) m.partnerName = nameByHandle[m.partnerHandle];
        m.oppNames = (m.oppHandles || []).map(function (h, i) {
          return nameByHandle[h] || (m.oppNames && m.oppNames[i]) || '';
        });
        out.push(m);
      }
    });
    return out;
  }

  /** BUSCA ATIVA DO ORGANIZADOR (anti-gato): parseia o PERFIL PÚBLICO letzplay.me/{handle}
   * — categoria (nível), totais e última atividade. Não precisa do histórico completo:
   * a categoria do ranking é o indicador de nível pro flag de rebaixamento.
   * VERIFICADO AO VIVO (jul/2026) em /GersomOtsu. */
  function parsePublicProfile(doc, handle) {
    if (!doc) return null;
    var bt = (doc.body && doc.body.textContent || '').replace(/\s+/g, ' ');
    var num = function (re) { var m = bt.match(re); return m ? +m[1] : null; };
    // nome: <title> "Nome - Letzplay" (mais confiável que headers variáveis)
    var name = null;
    var tt = (doc.title || '').replace(/\s*[-|]\s*Letzplay.*$/i, '').trim();
    if (tt) name = tt;
    // categoria (nível) = token gênero+nível dos links de RANKING e TORNEIO. Perfis
    // variam: uns mostram ranking ("Rodada 9 • Social Masc D+ / C- | 2026"), outros
    // só torneios ("Interno Ciclo 2 - Feminina D Duplas"). Regex pega "Feminina D",
    // "Masc D+ / C-" etc. — preservando o range (D+/C-) pro flag de nível.
    var CAT_RE = /(Masculina|Feminina|Mista|Masc|Fem)\s*-?\s*([A-D][+\-]?(?:\s*\/\s*[A-D][+\-]?)?)/;
    var catFrom = function (tx) { var m = String(tx || '').match(CAT_RE); return m ? (m[1] + ' ' + m[2]).replace(/\s+/g, ' ').trim() : null; };
    var linkTexts = Array.prototype.slice.call(doc.querySelectorAll('a[href*="/rankings/"], a[href*="/tournaments/"]'))
      .map(function (a) { return (a.textContent || '').replace(/\s+/g, ' ').trim(); });
    var cats = [];
    linkTexts.forEach(function (tx) { var c = catFrom(tx); if (c && cats.indexOf(c) < 0) cats.push(c); });
    var lastPlayed = (bt.match(/Jogou h[áa]\s*(\d+\s*\w+)/) || [])[1] || null;
    return {
      handle: handle || null,
      name: name,
      rankingCategory: cats[0] || null,     // categoria do ranking (nível)
      allCategories: cats,
      totals: { matches: num(/(\d+)\s*Jogos/), rankings: num(/(\d+)\s*Rankings/), tournaments: num(/(\d+)\s*Torneios/) },
      lastPlayed: lastPlayed,
      source: 'public-profile'
    };
  }

  root._spExtract = {
    handleFromHref: handleFromHref,
    parsePublicProfile: parsePublicProfile,
    parseCategory: parseCategory,
    parseRankingRef: parseRankingRef,
    matchFromCard: matchFromCard,
    extractTeamsFromBody: extractTeamsFromBody,
    namesByHandleFromCard: namesByHandleFromCard,
    extractMatchesFromDoc: extractMatchesFromDoc
  };
})();
