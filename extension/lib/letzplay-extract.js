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
    // Casamento do @ CASE-INSENSITIVE: o organizador digita "camilaxyz" mas o card tem
    // "/CamilaXYZ" — com === estrito, ZERO jogos casavam e a busca reportava "sem-jogos"
    // (caso Camila, 14/jul/2026). URLs de handle no letzplay são únicas ignorando caixa.
    var meLow = String(meHandle || '').toLowerCase();
    function isMe(h) { return String(h || '').toLowerCase() === meLow; }
    var myIdx = -1;
    for (var i = 0; i < teams.length; i++) {
      if ((teams[i].handles || []).some(isMe)) { myIdx = i; break; }
    }
    if (myIdx < 0) return null;                                     // não é jogo do usuário
    var mine = teams[myIdx] || { handles: [], names: [] };
    var opp = teams[1 - myIdx] || { handles: [], names: [] };
    var partnerHandle = null, partnerName = null;
    (mine.handles || []).forEach(function (h, ix) {
      if (!isMe(h)) { partnerHandle = h; partnerName = (mine.names || [])[ix] || null; }
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

  /** Texto de link que NÃO é categoria: "Ver trilha de X/Y" é o caminho da dupla na chave. */
  function isTrailText(t) { return /ver\s+trilha|trilha\s+de/i.test(String(t || '')); }

  /** Primeiro link de competição do card que NÃO seja a trilha. Fallback: o primeiro que
   * existir (melhor um categoryRaw sujo que nenhuma referência de competição). */
  function _pickCatLink(card, tipo) {
    var links = Array.prototype.slice.call(card.querySelectorAll('a[href*="/' + tipo + '/"]'));
    if (!links.length) return null;
    for (var i = 0; i < links.length; i++) {
      if (!isTrailText(links[i].textContent)) return links[i];
    }
    return links[0];
  }

  // Extrai os jogos de /{handle}/matches. ESTRUTURA MEDIDA no browser (30/jul/2026,
  // @camilacalia) — nada aqui é suposição:
  //
  //   .row.match
  //   ├── .match-title > a[href="/{club}/(tournaments|rankings)/{id}"]   ← 1 SÓ por card
  //   ├── .row.match-player  ×2                                          ← sempre 2 times
  //   │   ├── .match-player-info > a[href="/{handle}"]                    ← 1..2 jogadores
  //   │   └── .match-results-points                                       ← O PLACAR
  //   └── span.match-{ID}-schedule  "Quarta, 29/07/26"                    ← DATA + ID DA PARTIDA
  //
  // Medido: 20 cards → 20 ids de partida distintos, 100% presentes; 0 card sem competição;
  // 0 card com mais de uma competição; todos com 2 times e placar.
  //
  // O QUE ISSO APAGA: o placar era achado procurando "nó folha com 1-3 dígitos e sem link",
  // os times por varredura, e a identidade da partida por data+placar+adversários — foi essa
  // heurística que produziu 24 partidas duplicadas no import da Camila. Agora o letzplay dá
  // o id; e o TEXTO do card não vira mais categoria (nome e categoria vêm da página da
  // competição), que é o que enfiava "Ver trilha de X/Y" no campo da categoria.
  function extractMatchesFromDoc(doc, meHandle) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return [];
    var meLow = String(meHandle || '').toLowerCase();
    var out = [];
    Array.prototype.slice.call(doc.querySelectorAll('.row.match')).forEach(function (card) {
      // competição: o id é a identidade; o texto é só dica de nome
      var comp = null, official = false;
      Array.prototype.slice.call(card.querySelectorAll('a[href]')).some(function (a) {
        var h = a.getAttribute('href') || '';
        var mt = h.match(/^\/([^\/]+)\/tournaments\/(\d+)/);
        if (mt) { comp = { club: mt[1], id: mt[2], text: (a.textContent || '').replace(/\s+/g, ' ').trim() }; official = true; return true; }
        var mr = h.match(/^\/([^\/]+)\/rankings\/(\d+)/);
        if (mr) { comp = { club: mr[1], id: mr[2], text: (a.textContent || '').replace(/\s+/g, ' ').trim() }; return true; }
        return false;
      });
      if (!comp) return;

      // ID DA PARTIDA dado pelo letzplay (class="match-10004859-schedule")
      var lzId = null;
      var sch = card.querySelector('[class*="-schedule"]');
      if (sch) { var mi = (sch.className || '').toString().match(/match-(\d+)-schedule/); if (mi) lzId = mi[1]; }
      if (!lzId) { var mi2 = (card.innerHTML || '').match(/match-(\d+)-schedule/); if (mi2) lzId = mi2[1]; }

      var dateText = sch ? (sch.textContent || '').replace(/\s+/g, ' ').trim() : null;
      if (!dateText || !/\d{2}\/\d{2}\/\d{2}/.test(dateText)) {
        dateText = Array.prototype.slice.call(card.children)
          .map(function (c) { return (c.textContent || '').replace(/\s+/g, ' ').trim(); })
          .filter(function (t) { return /\d{2}\/\d{2}\/\d{2}/.test(t); })[0] || dateText;
      }

      // TIMES: .row.match-player (exatamente 2). Placar pela classe própria.
      var nameByHandle = namesByHandleFromCard(card);
      var teams = Array.prototype.slice.call(card.querySelectorAll('.row.match-player')).map(function (tp) {
        var hs = Array.prototype.slice.call(tp.querySelectorAll('.match-player-info a[href^="/"]'))
          .map(function (a) { return handleFromHref(a.getAttribute('href')); }).filter(Boolean);
        var uniq = [];
        hs.forEach(function (h) { if (uniq.indexOf(h) < 0) uniq.push(h); });
        var pe = tp.querySelector('.match-results-points');
        var ptxt = pe ? (pe.textContent || '').replace(/\s+/g, ' ').trim() : '';
        var pm = ptxt.match(/(\d{1,3})/);
        return { handles: uniq, names: uniq.map(function (h) { return nameByHandle[h] || ''; }),
          score: pm ? +pm[1] : null };
      }).filter(function (t) { return t.handles.length; });
      if (teams.length < 2) {
        // sem os dois times não há jogo — cai no caminho antigo (dado/página fora do padrão)
        var body = card.querySelector('.col-xs-12');
        if (!body) return;
        teams = extractTeamsFromBody(body);
        if (teams.length < 2) return;
      }

      var myIdx = -1;
      for (var i = 0; i < teams.length; i++) {
        if ((teams[i].handles || []).some(function (h) { return String(h).toLowerCase() === meLow; })) { myIdx = i; break; }
      }
      if (myIdx < 0) return;                       // não é jogo desta pessoa
      var mine = teams[myIdx], opp = teams[1 - myIdx] || { handles: [], names: [] };
      var partnerHandle = null, partnerName = null;
      (mine.handles || []).forEach(function (h, ix) {
        if (String(h).toLowerCase() !== meLow) { partnerHandle = h; partnerName = (mine.names || [])[ix] || null; }
      });
      var cat = parseCategory(comp.text);
      out.push({
        lzId: lzId,                                // ← identidade dada pelo letzplay
        date: dateText || null,
        categoryRaw: cat.categoryRaw, round: cat.round, year: cat.year,
        official: official, kind: official ? 'tournament' : 'ranking',
        club: comp.club,
        tourneyId: official ? comp.id : null,
        rankingId: official ? null : comp.id,
        partnerHandle: partnerHandle, partnerName: partnerName,
        oppHandles: (opp.handles || []).slice(),
        oppNames: (opp.handles || []).map(function (h, i) { return nameByHandle[h] || (opp.names || [])[i] || ''; }),
        myScore: (typeof mine.score === 'number') ? mine.score : null,
        oppScore: (typeof opp.score === 'number') ? opp.score : null,
        won: (typeof mine.score === 'number' && typeof opp.score === 'number') ? (mine.score > opp.score) : null
      });
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
    isTrailText: isTrailText,
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
