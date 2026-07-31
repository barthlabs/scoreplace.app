/* content.js — roda no scoreplace.app. Ponte extensão ↔ página + orquestra o IMPORT
 * DIRETO disparado pelo app (sem o usuário clicar no ícone da extensão):
 *   app → postMessage {run-import} → content busca (via background) + extrai + normaliza
 *       → postMessage {import} → letzplay-bridge.js grava e devolve {import-result}.
 * Também: anuncia presença (extension-present) + responde ao ping do app.
 * Libs (_spExtract/_spImport/_spFlow) carregam antes deste arquivo (ver manifest).
 */
(function () {
  var EXT_VERSION = '1.79';

  function post(o) { try { window.postMessage(o, window.location.origin); } catch (e) {} }
  function announce() { post({ __sp_lp: 'extension-present', version: EXT_VERSION }); }

  announce();

  // ── Import DIRETO (via background fetch + parse aqui, que tem DOM) ──
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function bgFetchRaw(url, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'lp-fetch', url: url, noCreateTab: !!opts.noCreateTab }, function (r) {
        if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
        resolve(r || { ok: false, error: 'no-resp' });
      });
    });
  }
  // Busca PACIENTE: "demora mais, mas não falha" (v1.36). O letzplay/Cloudflare limita
  // rajadas (403/429) e o service worker da extensão pode ser reciclado no meio (MV3) —
  // ambos são TRANSITÓRIOS e reagir com backoff resolve; desistir na 4ª tentativa (como
  // antes) transformava um soluço passageiro em "não deu pra buscar".
  //   • rate-limit (403/429) → espera o `retry-after` que o SERVIDOR pediu; sem header,
  //     backoff exponencial (2s→4s→8s… teto 60s). Até 8 tentativas.
  //   • rede/SW morto ('Failed to fetch', 'port closed', 'no-resp') → também re-tenta,
  //     com espera menor. O background reinicia sozinho na mensagem seguinte.
  //   • erro DEFINITIVO (404, sem aba do letzplay) → não adianta insistir → sobe o erro.
  // O ESPAÇAMENTO entre requisições vive na fila do background.js — aqui é só a re-tentativa.
  // `blocked` = desafio do Cloudflare (às vezes servido com status 200 — ver inject.js).
  // Sem contar isso como rate-limit, bgFetchDoc devolvia a página de desafio como se
  // fosse o histórico: 0 jogos extraídos, "sem-jogos", zero retry. Foi o modo real de
  // falha de 14/jul/2026.
  function _isRate(r) {
    var st = r && r.status;
    return !!(r && r.blocked) || (st === 403 || st === 429 || st === 503) ||
      /\b(429|403)\b|too many|cf-challenge/i.test((r && r.error) || '');
  }
  function _isTransient(r) {
    var st = r && r.status;
    if (st >= 500) return true;   // erro do servidor → tentar de novo faz sentido
    return /Failed to fetch|NetworkError|network|load failed|ERR_|no-resp|port closed|message channel|Extension context|inject-timeout|exec-failed/i.test((r && r.error) || '');
  }
  // ORÇAMENTO DE PACIÊNCIA — quanto de espera de rate-limit a rodada aceita antes de
  // CHECKPOINTAR e devolver o cursor pro app continuar numa rodada nova.
  //
  // v1.49: o orçamento passou a ser PROPORCIONAL AO TRABALHO. Era fixo em 2 esperas /
  // 120s, calibrado num perfil de 37 requisições; num de 140 (Camila) tomar 2 pausas é
  // quase certo, então o orçamento estourava no meio e a leitura parava com quase nada.
  // Agora ele escala com o tamanho do perfil e — o que importa de verdade — estourar
  // NÃO é mais fim de linha: o cursor está gravado, o app dispara a rodada seguinte
  // sozinho e ela retoma no ponto exato. "Demorar é aceitável; falhar não."
  var _rateBudget = null;
  function _newRateBudget(reqEstimate) {
    var n = Math.max(8, reqEstimate || 40);
    return { waits: 0, totalMs: 0, maxWaits: Math.max(6, Math.ceil(n / 6)), maxMs: Math.max(180000, n * 3000) };
  }
  async function bgFetchDoc(url, opts) {
    var last = null;
    for (var i = 0; i < 8; i++) {
      var r = await bgFetchRaw(url, opts);
      if (r && r.ok) return new DOMParser().parseFromString(r.html, 'text/html');
      last = r;
      if (_isRate(r)) {
        if (_rateBudget && (_rateBudget.waits >= _rateBudget.maxWaits || _rateBudget.totalMs >= _rateBudget.maxMs)) {
          var eb = new Error('rate-budget'); eb.code = 'rate-budget'; eb.httpStatus = r && r.status;
          throw eb;
        }
        var ra = parseInt(r && r.retryAfter, 10);
        // Backoff com RUÍDO: 2s/4s/8s cravados são tão robóticos quanto a rajada que
        // causou o bloqueio. Quem volta exatamente no tempo do relógio é máquina. Quando
        // o servidor manda um retry-after, obedecemos e ainda somamos uma folga humana.
        var jit = 0.8 + Math.random() * 0.7;
        var waitMs = (ra > 0)
          ? Math.min(90000, Math.round(ra * 1000 + 500 + Math.random() * 2500))
          : Math.min(60000, Math.round(2000 * Math.pow(2, i) * jit));
        // A espera tem que ser VISÍVEL. Uma pausa de 60s calada é indistinguível de
        // travamento — e foi por isso que a busca "parecia funcionando" enquanto não
        // baixava nada. O app mostra isto na barra e rearma o watchdog de ociosidade.
        post({ __sp_lp: 'lz-throttle', waitMs: waitMs, attempt: i + 1,
          gap: (r && r.pace && r.pace.gap) || null, source: (ra > 0 ? 'retry-after' : 'backoff') });
        if (_rateBudget) { _rateBudget.waits++; _rateBudget.totalMs += waitMs; }
        await sleep(waitMs);
        continue;
      }
      if (_isTransient(r) && i < 4) { await sleep(Math.round(1500 * (i + 1) * (0.8 + Math.random() * 0.6))); continue; }
      break;   // erro definitivo (404, sem aba, etc.) → insistir não adianta
    }
    var e = new Error((last && last.error) || ('HTTP ' + (last && last.status)));
    e.url = url; e.httpStatus = last && last.status;
    throw e;
  }

  // Nome REAL do torneio a partir da página /{club}/tournaments/{id} (VERIFICADO AO VIVO
  // jul/2026: a URL é /tournaments/ COM "n" — /tourneys/ dá 404). Preferência:
  //   1) heading limpo <h2 class="title with-avatar"> = "Interno Ciclo 2 Competitivo - Masculina D"
  //      (nome exato, SEM o nome do clube grudado);
  //   2) fallback og:title "Informações do Torneio {nome} - {clube}" (tira prefixo/sufixo;
  //      ainda traz o clube no fim, por isso o h2 é preferido).
  // Nome de exibição do atleta na página de perfil do letzplay.
  function _nomeDoPerfilDoc(doc) {
    try {
      var h = doc.querySelector('h1, h2.title, .profile-name, .athlete-name');
      var n = h ? (h.textContent || '').replace(/\s+/g, ' ').trim() : '';
      if (!n) {
        var og = doc.querySelector('meta[property="og:title"]');
        n = og ? (og.getAttribute('content') || '') : '';
        n = n.replace(/\s*[-–|]\s*Letzplay\s*$/i, '').replace(/^\s*Jogos de\s+/i, '').trim();
      }
      if (!n || n.length > 60) return null;
      if (/letzplay/i.test(n)) return null;
      return n;
    } catch (e) { return null; }
  }

  function tourneyNameFromDoc(doc) {
    try {
      var h2 = doc.querySelector('h2.title.with-avatar, .title.with-avatar');
      if (h2) { var hn = (h2.textContent || '').replace(/\s+/g, ' ').trim(); if (hn) return hn; }
      var og = doc.querySelector('meta[property="og:title"]');
      var t = (og ? (og.getAttribute('content') || '') : (doc.title || '')).replace(/\s+/g, ' ').trim();
      t = t.replace(/\s*-\s*Letzplay\s*$/i, '').replace(/^(Informa[çc][õo]es|Chaves) do Torneio\s+/i, '');
      return t || null;
    } catch (e) { return null; }
  }

  function _rowNum(txt, re) { var m = txt.match(re); return m ? +m[1] : null; }

  // Classificação COMPLETA (todos os grupos + posições) da MESMA página do torneio —
  // server-rendered, vem no HTML CRU (verificado ao vivo jul/2026: `.table-group` +
  // "Posição" + nomes já estão no fetch, sem rodar JS). Cada `.table-group` é um grupo;
  // cada linha traz posição + nomes da dupla + handles + V/D. Guardada UMA vez por
  // torneio (raw.tournaments[].standings → footprint[].standings), NUNCA repetida nos
  // jogos. Retorna [{ group, rows:[{ pos, players[], handles[], wins, losses }] }] ou null.
  function tourneyStandingsFromDoc(doc) {
    try {
      var groups = [];
      var tgs = doc.querySelectorAll('.table-group');
      for (var i = 0; i < tgs.length; i++) {
        var tg = tgs[i];
        var titleEl = tg.querySelector('.table-field-title b');
        var title = titleEl ? (titleEl.textContent || '').replace(/\s+/g, ' ').trim() : ('Grupo ' + (i + 1));
        var rows = [];
        var kids = tg.children;
        for (var k = 0; k < kids.length; k++) {
          var row = kids[k];
          if (!row.classList || !row.classList.contains('row')) continue;
          var nmEl = row.querySelector('.break-line');
          if (!nmEl) continue;   // linha de cabeçalho (sem nomes)
          var players = (nmEl.innerHTML || '').split(/<br\s*\/?>/i)
            .map(function (s) { return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); })
            .filter(Boolean);
          var handles = [].slice.call(row.querySelectorAll('a[href^="/"]'))
            .map(function (a) { return a.getAttribute('href'); })
            .filter(function (h) { return /^\/[A-Za-z0-9_]+$/.test(h); })
            .map(function (h) { return h.slice(1); });
          var posM = ((row.querySelector('.points') || {}).textContent || '').match(/(\d+)\s*º/);
          var txt = (row.textContent || '').replace(/\s+/g, ' ');
          rows.push({
            pos: posM ? +posM[1] : null,
            players: players,
            handles: handles,
            wins: _rowNum(txt, /(\d+)\s*Vit/i),
            losses: _rowNum(txt, /(\d+)\s*Derrota/i)
          });
        }
        if (rows.length) groups.push({ group: title, rows: rows });
      }
      return groups.length ? groups : null;
    } catch (e) { return null; }
  }

  // Logo do torneio/ranking: imagem (cloudinary) do avatar ao lado do título
  // (`.title.with-avatar`). NÃO é o og:image (esse é o logo genérico da plataforma) nem
  // o logo do clube (esse é o 1º cloudinary do doc, no nav). Sobe até 4 ancestrais do
  // título procurando a 1ª <img cloudinary> — verificado ao vivo jul/2026.
  function tourneyLogoFromDoc(doc) {
    try {
      var tw = doc.querySelector('.title.with-avatar');
      if (!tw) return null;
      var p = tw;
      for (var up = 0; up < 4 && p; up++) {
        var img = p.querySelector('img[src*="cloudinary"]');
        if (img) { var s = img.getAttribute('src'); if (s) return s; }
        p = p.parentElement;
      }
      return null;
    } catch (e) { return null; }
  }

  // Classificação de RANKING (`.table-ranking`, estrutura diferente do torneio) — jogadores
  // (individual ou dupla) ordenados por PONTOS. A posição É a ordem na tabela (a página já
  // vem ordenada). Retorna [{ group:'Classificação', ranking:true, rows:[{pos,players,handles,points,inactive}] }].
  function rankingStandingsFromDoc(doc) {
    try {
      var tr = doc.querySelector('.table-ranking');
      if (!tr) return null;
      var rows = [], pos = 0;
      var kids = tr.children;
      for (var k = 0; k < kids.length; k++) {
        var row = kids[k];
        if (!row.classList || !row.classList.contains('row')) continue;
        var link = row.querySelector('a[href^="/"]');
        if (!link) continue;   // linha de cabeçalho (sem jogador)
        var players;
        var nmEl = row.querySelector('.break-line');
        if (nmEl) {
          players = (nmEl.innerHTML || '').split(/<br\s*\/?>/i)
            .map(function (s) { return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); })
            .filter(function (s) { return s && !/^(Inativo|Ativo)$/i.test(s); });
        }
        if (!players || !players.length) {
          players = [(link.textContent || '').replace(/\s+/g, ' ').trim()].filter(Boolean);
        }
        var handles = [].slice.call(row.querySelectorAll('a[href^="/"]'))
          .map(function (a) { return a.getAttribute('href'); })
          .filter(function (h) { return /^\/[A-Za-z0-9_]+$/.test(h); })
          .map(function (h) { return h.slice(1); });
        var ptsM = ((row.querySelector('.points') || {}).textContent || '').match(/(\d+)/);
        pos++;
        rows.push({
          pos: pos,
          players: players,
          handles: handles,
          points: ptsM ? +ptsM[1] : null,
          inactive: /Inativo/i.test(row.textContent || '')
        });
      }
      return rows.length ? [{ group: 'Classificação', ranking: true, rows: rows }] : null;
    } catch (e) { return null; }
  }
  // Preenche NOME REAL + CLASSIFICAÇÃO + LOGO de cada TORNEIO e cada RANKING, gravados UMA
  // VEZ por competição em raw.tournaments[]/raw.rankings[] (→ footprint[].name/.standings/.logo).
  // Cada jogo guarda só a REFERÊNCIA (club + tourneyId/rankingId) — o app resolve por
  // referência via window._spGameComp (nunca repetimos o nome em cada doc de partida). 1 fetch
  // por competição (nome + classificação + logo saem do MESMO fetch — zero requisição extra).
  // Torneio: /{club}/tournaments/{id} (.table-group). Ranking: /{club}/rankings/{id}
  // (.table-ranking). Best-effort: se falhar/404, mantém a categoria. Retorna {total, resolved}.
  // `limite` = resolve no máximo N competições nesta chamada, e `guarda` = onde gravar o
  // resultado pra não se perder entre chamadas. Servem pro INTERCALAMENTO: o dono viu
  // "Jogos 478 de 478 (100%)" com "Rankings 20 de 29" e reclamou com razão — os jogos
  // terminavam primeiro e as competições ficavam se resolvendo depois. Mas é a leitura dos
  // jogos que REVELA os rankings, então não dá pra resolvê-los antes; o que dá é resolver
  // um punhado a cada página lida, e aí tudo termina junto — com os jogos por último.
  async function fillTourneyNames(raw, onProg, limite, guarda) {
    var seen = {}, uniq = [];
    // Competições que JÁ têm nome real + classificação (etapa por-torneio desta rodada
    // ou herdadas de rodada anterior) são PULADAS — zero re-fetch do que já está pronto.
    function _done(x) { return !!(x.name && x.name !== x.categoryRaw && x.standings); }
    (raw.tournaments || []).forEach(function (t) {
      if (!t.tourneyId || !t.club || _done(t)) return;
      var id = 't/' + t.club + '/' + t.tourneyId;
      if (!seen[id]) { seen[id] = 1; uniq.push({ id: id, type: 't', club: t.club, cid: t.tourneyId, categoryRaw: t.categoryRaw || '' }); }
    });
    (raw.rankings || []).forEach(function (r) {
      if (!r.rankingId || !r.club || _done(r)) return;
      var id = 'r/' + r.club + '/' + r.rankingId;
      if (!seen[id]) { seen[id] = 1; uniq.push({ id: id, type: 'r', club: r.club, cid: r.rankingId, categoryRaw: r.categoryRaw || '' }); }
    });
    var cache = {}, standCache = {}, logoCache = {}, resolved = 0, failed = [];
    var teto = (typeof limite === 'number' && limite > 0) ? Math.min(limite, uniq.length) : uniq.length;
    for (var i = 0; i < teto; i++) {
      var u = uniq[i];
      // O TEXTO TEM QUE DIZER O QUE ESTÁ SENDO FEITO. Antes saía só "2 de 41" — número solto,
      // sem sujeito, que não informa nada a quem está olhando.
      var oQue = (u.type === 't' ? 'torneio' : 'ranking') + (u.categoryRaw ? (' · ' + u.categoryRaw) : '');
      if (onProg) onProg({ phase: 'torneios', note: 'nome e classificação — ' + oQue + ' (' + (i + 1) + ' de ' + teto + ')' });
      else post({ __sp_lp: 'import-progress', phase: 'names', done: i, total: teto });
      // (o espaçamento entre requisições é da FILA do background.js — ver enqueue())
      try {
        var url = 'https://letzplay.me/' + u.club + '/' + (u.type === 't' ? 'tournaments' : 'rankings') + '/' + u.cid;
        var d = await bgFetchDoc(url);
        var nm = tourneyNameFromDoc(d);
        cache[u.id] = nm || null;
        // Ranking: classificação ENXUTA (top 5 + o próprio atleta) — a completa do clube
        // (100+ duplas × N rankings) estourava o limite de 1MiB do doc no Firestore.
        standCache[u.id] = (u.type === 't') ? tourneyStandingsFromDoc(d) : slimRankingStandings(rankingStandingsFromDoc(d), raw.handle);
        logoCache[u.id] = tourneyLogoFromDoc(d);
        if (guarda) guarda[u.id] = { name: cache[u.id], standings: standCache[u.id], logo: logoCache[u.id] };
        if (nm) {
          resolved++;
          if (onProg) onProg({ phase: 'torneios', feed: (u.type === 't' ? '🏆 ' : '📊 ') + nm });
        } else { failed.push(u.categoryRaw || u.id); }
      } catch (e) { cache[u.id] = null; failed.push(u.categoryRaw || u.id); }
    }
    if (!onProg) post({ __sp_lp: 'import-progress', phase: 'names', done: teto, total: teto });
    // Aplica UMA VEZ por competição (nome + classificação + logo). Jogos só guardam a referência.
    (raw.tournaments || []).forEach(function (t) {
      if (!t.tourneyId || !t.club) return;
      var k = 't/' + t.club + '/' + t.tourneyId;
      if (cache[k]) t.name = cache[k];
      if (standCache[k]) t.standings = standCache[k];
      if (logoCache[k]) t.logo = logoCache[k];
    });
    (raw.rankings || []).forEach(function (r) {
      if (!r.rankingId || !r.club) return;
      var k = 'r/' + r.club + '/' + r.rankingId;
      if (cache[k]) r.name = cache[k];
      if (standCache[k]) r.standings = standCache[k];
      if (logoCache[k]) r.logo = logoCache[k];
    });
    return { total: uniq.length, resolved: resolved, failed: failed, pendentes: Math.max(0, uniq.length - teto) };
  }

  // Import COMPLETO de um participante a partir do perfil PÚBLICO /{handle}/matches
  // (paginado, sem login gate — mesmo shape do self-import). Usado só no org-scan modo
  // "completo". Retorna o letzplayImport normalizado (com nomes de torneio) ou null.
  async function importFromHandleMatches(handle, onProg) {
    var X = window._spExtract, I = window._spImport, F = window._spFlow;
    if (!X || !I || !F || !handle) return null;
    var base = 'https://letzplay.me/' + encodeURIComponent(handle) + '/matches';
    if (onProg) onProg({ phase: 'jogos', note: 'abrindo histórico' });
    var doc1 = await bgFetchDoc(base);
    var all = X.extractMatchesFromDoc(doc1, handle);
    var maxPage = F.detectMaxPage(doc1);
    var total = F.parseTotalGames(doc1);   // quantos o letzplay DIZ que existem (ver runDirectImport)
    // PARCIAL VALE MAIS QUE NADA: um erro na página 5 de 8 jogava fora as 4 primeiras.
    // O doc canônico é keyed por gid → a próxima passada completa, não duplica.
    var parcial = null;
    try {
      for (var p = 2; p <= maxPage; p++) {
        // avisa a CADA página: sem isto a busca fica minutos em silêncio e parece travada
        if (onProg) onProg({ phase: 'jogos', note: 'página ' + p + ' de ' + maxPage });
        var d = await bgFetchDoc(base + '?page=' + p);   // espaçamento: fila do background
        all = all.concat(X.extractMatchesFromDoc(d, handle));
      }
    } catch (errPag) {
      if (!all.length) throw errPag;
      parcial = (errPag && errPag.message) || 'paginação interrompida';
    }
    if (!all.length) return null;
    if (onProg) onProg({ phase: 'jogos', note: all.length + (total ? ' de ' + total : '') + ' jogos lidos' });
    var raw = F.buildRaw(handle, all);
    try { await fillTourneyNames(raw, onProg); } catch (e) {}
    var imp = I.normalize(raw, { importedAt: new Date().toISOString() });
    imp.declaredGames = (total != null) ? total : null;
    if (parcial) imp.partialReason = String(parcial).slice(0, 120);
    var v = I.validate(imp);
    return (v && v.valid) ? imp : null;
  }

  async function runDirectImport() {
    var X = window._spExtract, I = window._spImport, F = window._spFlow;
    if (!X || !I || !F) { post({ __sp_lp: 'import-result', ok: false, error: 'libs' }); return; }
    try {
      post({ __sp_lp: 'import-progress', done: 0, total: null });
      var doc1 = await bgFetchDoc('https://letzplay.me/u/matches/history');
      if (doc1.querySelector('input[type="password"]') || /\b(login|entrar)\b/i.test(doc1.title || '')) {
        post({ __sp_lp: 'import-result', ok: false, error: 'letzplay-login' }); return;
      }
      var me = F.detectMe(doc1);
      if (!me) { post({ __sp_lp: 'import-result', ok: false, error: 'sem-jogos' }); return; }
      var maxPage = F.detectMaxPage(doc1);
      // O PRIMEIRO DADO É QUANTOS JOGOS EXISTEM. O letzplay declara na própria página
      // ("81 Jogos • 36 Vit"), num fetch que já estamos fazendo. Guardado em
      // `declaredGames`, ele resolve três coisas de uma vez:
      //   • PROVA DE COMPLETUDE: 81 declarados e 81 guardados = pronto, nada a inferir;
      //   • NOVIDADE BARATA: uma semana depois lê 84 → faltam 3, busca só o começo da
      //     lista (o letzplay entrega o mais recente primeiro) em vez de repaginar tudo;
      //   • critério do VERDE (coerente) sem chute — ver _lzScanComplete no app.
      // Antes ele era lido e JOGADO FORA: só alimentava a barra de progresso.
      var total = F.parseTotalGames(doc1);
      var all = X.extractMatchesFromDoc(doc1, me);
      post({ __sp_lp: 'import-progress', done: all.length, total: total });
      // PARCIAL VALE MAIS QUE NADA. Se a paginação morrer no meio (rate-limit, aba
      // fechada, rede), o que já veio é histórico REAL do atleta e fica mais perto de
      // completar. Antes, um erro na página 5 de 8 jogava fora as 4 primeiras. É seguro
      // porque o doc canônico é keyed por gid: a próxima passada COMPLETA, não duplica.
      var parcial = null;
      try {
        for (var p = 2; p <= maxPage; p++) {
          var d = await bgFetchDoc('https://letzplay.me/u/matches/history?page=' + p);   // espaçamento: fila do background
          all = all.concat(X.extractMatchesFromDoc(d, me));
          post({ __sp_lp: 'import-progress', done: all.length, total: total });
        }
      } catch (errPag) {
        if (!all.length) throw errPag;          // nada veio → é falha mesmo
        parcial = (errPag && errPag.message) || 'paginação interrompida';
      }
      var raw = F.buildRaw(me, all);
      var nameStats = null;
      try { nameStats = await fillTourneyNames(raw); } catch (e) {}   // nome real dos torneios (best-effort)
      var imp = I.normalize(raw, { importedAt: new Date().toISOString() });
      if (nameStats) imp.tourneyNameStats = nameStats;   // observabilidade: X/Y nomes resolvidos
      imp.declaredGames = (total != null) ? total : null;
      if (parcial) imp.partialReason = String(parcial).slice(0, 120);
      var v = I.validate(imp);
      if (!v.valid) { post({ __sp_lp: 'import-result', ok: false, error: 'invalido' }); return; }
      post({ __sp_lp: 'import-progress', done: all.length, total: total, saving: true });
      // O histórico COMPLETO vai pro acervo canônico (1 doc por partida, sem teto); o doc
      // do perfil leva o resumo com os jogos recentes. Sem esse limite, um perfil grande
      // estoura 1MiB e o Firestore recusa a gravação INTEIRA — o import "dava certo" e
      // nada aparecia.
      var todosOsJogos = (imp.games || []).slice();   // ANTES do corte — boundImportDoc trunca no lugar
      post({ __sp_lp: 'import', letzplayImport: boundImportDoc(imp), allGames: todosOsJogos });
    } catch (err) {
      // Diagnóstico honesto: separa erro de REDE ('Failed to fetch') dos demais e leva a
      // mensagem crua + a URL que falhou pro app mostrar (fim do "erro sem nenhuma dica").
      var raw2 = (err && err.message) || 'fetch';
      var badUrl = (err && err.url) ? String(err.url).replace('https://letzplay.me', '') : null;
      var st2 = err && err.httpStatus;
      var code = (st2 === 403 || st2 === 429 || /\b(429|403)\b|too many/i.test(raw2)) ? 'rate'
        : /Failed to fetch|NetworkError|network|load failed|ERR_/i.test(raw2) ? 'net' : 'fetch';
      post({ __sp_lp: 'import-result', ok: false, error: code, detail: raw2 + (badUrl ? (' · ' + badUrl) : '') });
    }
  }

  // ── BUSCA ATIVA DO ORGANIZADOR (anti-gato) ──
  // O app manda uma lista de {uid, handle} de inscritos que autorizaram; buscamos o
  // PERFIL PÚBLICO de cada um (letzplay.me/{handle}), parseamos categoria/totais e
  // devolvemos pro app gravar em tournaments/{tId}/letzplayScans. Público → não expõe
  // dado privado; passa o Cloudflare pela sessão do navegador do organizador.
  // Busca o perfil via aba RENDERIZADA (o perfil letzplay é SPA — categoria vem por JS).
  function scanProfile(handle, mode) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'lp-scan-profile', handle: handle, mode: mode }, function (r) {
        if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
        resolve(r || { ok: false, error: 'no-resp' });
      });
    });
  }
  // Uma busca por vez NESTA aba: o organizador clicando de novo (ansioso, achando que
  // travou) não dispara uma segunda varredura em cima da primeira — recebe a mesma.
  // (A fila do background ainda protege contra 2 ABAS do scoreplace fazendo isso.)
  var _orgScanRunning = null;
  function runOrgScan(targets, tournamentId, mode) {
    if (_orgScanRunning) return _orgScanRunning;
    _orgScanRunning = _runOrgScan(targets, tournamentId, mode)
      .catch(function () {})
      .then(function () { _orgScanRunning = null; });
    return _orgScanRunning;
  }
  async function _runOrgScan(targets, tournamentId, mode) {
    targets = Array.isArray(targets) ? targets : [];
    var scans = [];
    function prog(i, tg, extra) {
      var cur = { uid: tg.uid || null, name: tg.name || null, handle: tg.handle };
      if (extra) { cur.phase = extra.phase || null; cur.note = extra.note || null; }
      post({ __sp_lp: 'org-scan-progress', tournamentId: tournamentId, done: i, total: targets.length, current: cur });
    }
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i] || {};
      if (!tg.handle) continue;
      // avisa QUEM está sendo carregado agora (nome + @) antes de buscar
      prog(i, tg, { phase: 'perfil', note: 'lendo o perfil' });
      var r = await scanProfile(tg.handle, mode);
      // Modo COMPLETO: além do resumo (anti-gato), puxa o histórico inteiro do
      // participante do perfil público → letzplayImport completo (vai pro perfil dele).
      // O motivo da falha do histórico PRECISA subir. Este catch era vazio: em 14/jul/2026
      // os 4 inscritos tomaram 403 do Cloudflare na paginação, o erro foi descartado, e a
      // busca reportou sucesso com ZERO jogos gravados — sem nenhuma pista do que houve.
      var fullImp = null, fullErr = null;
      if (r && r.ok && mode === 'full') {
        var onProg = (function (idx, t) { return function (e) { prog(idx, t, e); }; })(i, tg);
        try {
          fullImp = await importFromHandleMatches(tg.handle, onProg);
          if (!fullImp) fullErr = 'sem-jogos';   // página lida, mas nenhum jogo extraído
        } catch (e) {
          var em = String((e && e.message) || e);
          var st = e && e.httpStatus;
          fullErr = ((st === 403 || st === 429 || /\b(403|429)\b/.test(em)) ? 'rate: ' : 'erro: ') + em.slice(0, 120);
        }
      }
      scans.push({ uid: tg.uid || null, handle: tg.handle, name: tg.name || null, scan: (r && r.ok) ? r.scan : null, fullImport: fullImp, fullError: fullErr, error: r && r.error });
      prog(scans.length, tg);
      // ENTREGA PARCIAL: manda o que já tem a cada pessoa concluída. Se o navegador
      // fechar/a página recarregar no meio, o que já foi lido ESTÁ salvo — nunca se
      // perde uma varredura inteira por causa do último participante.
      post({ __sp_lp: 'org-scan-result', tournamentId: tournamentId, ok: true, partial: true, scans: scans.slice() });
    }
    // fecha a aba do letzplay que a extensão abriu (se abriu e a fila esvaziou)
    try { chrome.runtime.sendMessage({ type: 'lp-close-scan-tab' }); } catch (e) {}
    post({ __sp_lp: 'org-scan-result', tournamentId: tournamentId, ok: true, scans: scans });
  }

  // ── PUXAR UM ATLETA (individual) — o caminho do AUTOIMPORT, pelo @ público ──
  // O lote travava no scanProfileViaTab (navegar o perfil SPA numa aba, com retries).
  // Aqui NÃO navegamos nada: só fetch das páginas /{handle}/matches — exatamente o
  // caminho do import do próprio usuário, que funciona. O resumo anti-gato (banda,
  // gênero, categorias) é derivado do PRÓPRIO histórico importado.
  function scanFromImport(handle, imp) {
    var RANK = { A: 0, B: 1, C: 2, D: 3 }, LTR = ['A', 'B', 'C', 'D'];
    function lettersOf(c) { var rs = []; (' ' + String(c || '').toUpperCase() + ' ').replace(/[\s\/]([A-D])[+\-]?(?=[\s\/])/g, function (_m, l) { rs.push(RANK[l]); return _m; }); return rs; }
    function strongestOf(cats) { var all = []; (cats || []).forEach(function (c) { all = all.concat(lettersOf(c)); }); return all.length ? Math.min.apply(null, all) : null; }
    var fp = (imp && imp.footprint) || [];
    var rankCats = fp.filter(function (f) { return !f.official && f.categoryRaw; }).map(function (f) { return f.categoryRaw; });
    var tourCats = fp.filter(function (f) { return f.official && f.categoryRaw; }).map(function (f) { return f.categoryRaw; });
    var allCats = []; rankCats.concat(tourCats).forEach(function (c) { if (allCats.indexOf(c) < 0) allCats.push(c); });
    // banda real = categoria mais forte entre RANKINGS (sem status ativo/inativo aqui →
    // considera todos), fallback torneios — mesma regra do _spDeriveScan do background.
    var realRank = strongestOf(rankCats), realCats = rankCats;
    if (realRank == null) { realRank = strongestOf(tourCats); realCats = tourCats; }
    var rankingCategory = null;
    if (realRank != null) { for (var i = 0; i < realCats.length; i++) { if (strongestOf([realCats[i]]) === realRank) { rankingCategory = realCats[i]; break; } } }
    var gender = /Feminina|\bFem\b/i.test(allCats.join(' ')) ? 'feminino' : (/Masculina|\bMasc\b/i.test(allCats.join(' ')) ? 'masculino' : null);
    // categoria de perfil = borda MAIS FRACA da banda (conservador; ex "C+/B-" → C)
    var weak = rankingCategory ? (function () { var rs = lettersOf(rankingCategory); return rs.length ? Math.max.apply(null, rs) : null; })() : realRank;
    return {
      handle: handle, name: (imp.profile && imp.profile.name) || null,
      rankingCategory: rankingCategory, allCategories: allCats,
      gender: gender,
      skill: realRank != null ? LTR[realRank] : null,
      profileSkill: weak != null ? LTR[weak] : null,
      champions: fp.filter(function (f) { return f.title === true && f.categoryRaw; }).map(function (f) { return f.categoryRaw; }),
      rankings: fp.filter(function (f) { return !f.official; }).map(function (f) { return { name: f.name || f.categoryRaw, category: f.categoryRaw, active: null, wins: f.wins, losses: f.losses }; }),
      tournaments: fp.filter(function (f) { return f.official; }).map(function (f) { return { name: f.name || f.categoryRaw, category: f.categoryRaw, wins: f.wins, losses: f.losses, champion: f.title === true }; }),
      totals: (imp.profile && imp.profile.totals) || {},
      lastPlayed: null, source: 'public-matches'
    };
  }
  // Chave ESTÁVEL de um jogo — dedupe entre etapas e entre RODADAS (o que já foi
  // gravado numa rodada anterior entra como semente e nunca duplica).
  // A CATEGORIA NÃO ENTRA NA CHAVE — nem o id da competição. Uma partida é QUEM jogou +
  // QUANDO + o PLACAR; o resto é atributo, e atributo cuja CAPTURA varia entre caminhos não
  // pode decidir identidade. Medido em produção (@camilacalia): 24 partidas contadas DUAS
  // vezes porque a mesma partida vinha com categoryRaw "Ver trilha de X/Y" pela página do
  // torneio e com o nome real pela lista pessoal — mesma data, mesmo placar, mesmos
  // adversários, dois registros. Isso inflou "478 jogos" pra 569 na tela.
  // É a MESMA regra que js/letzplay-model.js já aplica no gid canônico (e por isso o acervo
  // canônico nunca duplicou) — aqui a chave de dedup em voo tinha ficado pra trás.
  // Chave de CONTEÚDO, sempre — vale para jogo com id e para jogo sem. É ela que responde
  // "esta partida já está aqui, ainda que sob outra identidade?". Sem isso, repor um jogo
  // velho (chave de conteúdo) em cima do mesmo jogo já lido com id (chave 'lz…') criava
  // DUAS entradas da mesma partida: foi assim que os 469 da Camila voltaram a 569.
  function _contentKey(m) {
    return [m.date || '', m.club || '', m.myScore, m.oppScore,
      (m.partnerHandle || ''), (m.oppHandles || []).slice().sort().join('+')].join('|').toLowerCase();
  }
  function _gameKey(m) {
    // O LETZPLAY DÁ ID POR PARTIDA (class="match-10004859-schedule") — medido: 20 cards,
    // 20 ids distintos, 100% presentes. Identidade dada pela fonte vence qualquer chave
    // que a gente derive. A de conteúdo fica só pra dado antigo, gravado antes de a
    // extensão capturar o id.
    if (m && m.lzId) return 'lz' + m.lzId;
    return _contentKey(m);
  }
  // games GRAVADOS (schema salvo) → shape de "match cru" que o buildRaw espera.
  // ⚠️ O `lzId` TEM QUE ATRAVESSAR. Esta função reconstrói os jogos GRAVADOS pra dentro da
  // rodada nova, e ela não copiava o id da partida: tudo que veio de uma rodada anterior
  // voltava sem id, era regravado sem id, e a prova de "lido pelo motor novo" evaporava
  // sozinha. Medido em 31/jul no doc da Kelly: 157 jogos, 157 SEM lzId no scan do
  // organizador, enquanto o import dela mesma (uma rodada só) tinha os 157 COM id.
  // Consequência visível: o nome ficava violeta depois de uma leitura correta.
  function _gamesToMatches(games) {
    return (games || []).map(function (g) {
      return {
        lzId: g.lzId || null,
        date: g.date || null, categoryRaw: g.competition || '', round: (g.round != null) ? g.round : null,
        year: (g.year != null) ? g.year : null, official: g.official === true,
        kind: g.kind || (g.official === true ? 'tournament' : 'ranking'),
        club: g.club || null, rankingId: (g.rankingId != null) ? g.rankingId : null,
        tourneyId: (g.tourneyId != null) ? g.tourneyId : null, tourneyName: g.tourneyName || null,
        partnerHandle: g.partnerHandle || null, partnerName: g.partnerName || null,
        oppHandles: (g.oppHandles || []).slice(), oppNames: (g.oppNames || []).slice(),
        myScore: (typeof g.myScore === 'number') ? g.myScore : null,
        oppScore: (typeof g.oppScore === 'number') ? g.oppScore : null,
        won: (g.won === true) ? true : (g.won === false ? false : null)
      };
    });
  }
  // Classificação de RANKING enxuta: top 5 + a(s) linha(s) do PRÓPRIO atleta. O ranking
  // completo do clube (100+ duplas × 29 rankings) estourava o limite de 1MiB do doc no
  // Firestore → TODOS os writes da Camila (472 jogos) falhavam em silêncio. O app só usa
  // a posição do atleta + o topo; o resto era peso morto fatal.
  function slimRankingStandings(st, handle) {
    var low = String(handle || '').toLowerCase();
    return (st || []).map(function (g) {
      var rows = (g.rows || []).filter(function (r) {
        var mine = (r.handles || []).some(function (x) { return String(x).toLowerCase() === low; });
        return mine || (r.pos != null && r.pos <= 5);
      });
      return { group: g.group, ranking: g.ranking === true, rows: rows };
    });
  }
  // Corte de emergência por TAMANHO (limite do doc Firestore = 1MiB): se ainda passar de
  // ~900KB, derruba standings dos rankings; depois standings/logos de tudo.
  function shrinkImport(imp) {
    function size(o) { try { return JSON.stringify(o).length; } catch (e) { return 0; } }
    if (size(imp) <= 900000) return imp;
    (imp.footprint || []).forEach(function (f) { if (!f.official) { delete f.standings; } });
    if (size(imp) <= 900000) { imp.slimmed = 'rank-standings'; return imp; }
    (imp.footprint || []).forEach(function (f) { delete f.standings; delete f.logo; });
    imp.slimmed = 'all-standings';
    return imp;
  }
  // Data do jogo → número de calendário (YYYYMMDD), pra ordenar/limitar os jogos que vão
  // no doc resumo. Mesma regra do js/letzplay-model.js (que não roda na extensão).
  function _dnum(raw) {
    var m = String(raw == null ? '' : raw).match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return 0;
    return +((m[3].length === 2 ? ('20' + m[3]) : m[3]) + m[2] + m[1]);
  }
  // Teto de jogos no doc RESUMO (letzplayScans/{uid}.fullImport). O histórico completo
  // vive no canônico (1 doc por partida), que não tem teto; aqui ficam só os mais
  // recentes, o suficiente pro card de nível e pro gráfico de forma. Sem esse teto o doc
  // cresce com o atleta e bate no limite de 1MiB do Firestore por volta de 1.200 jogos —
  // ou seja, o mesmo "grava em silêncio e some" só um pouco mais pra frente.
  var MAX_DOC_GAMES = 600;
  function boundImportDoc(imp) {
    // observations era 41% do doc (1.416 entradas, 257KB no perfil da Camila) e NUNCA é
    // lida por nenhuma tela — os handles dos 4 jogadores já vão em `players` no doc
    // canônico de cada partida, que é onde essa informação serve pra algo.
    imp.observationsCount = (imp.observations || []).length;
    imp.observations = [];
    var g = imp.games || [];
    if (g.length > MAX_DOC_GAMES) {
      imp.gamesTotal = g.length;
      imp.gamesTruncated = true;
      imp.games = g.slice().sort(function (a, b) { return _dnum(b.date) - _dnum(a.date); }).slice(0, MAX_DOC_GAMES);
    } else {
      imp.gamesTotal = g.length;
    }
    return shrinkImport(imp);
  }

  // ACUMULADOR entre RODADAS da mesma página: as rodadas são encadeadas pelo app no
  // mesmo documento, então o content script continua vivo e os jogos já lidos ficam aqui
  // — a rodada seguinte não relê nada nem precisa que o app devolva o histórico inteiro.
  var _acc = null;
  function _accFor(handle, prior) {
    var h = String(handle || '').toLowerCase();
    if (_acc && _acc.handle === h) return _acc;
    _acc = { handle: h, all: _gamesToMatches(prior && prior.games), seen: {}, flushed: {}, tourDet: {} };
    _acc.all.forEach(function (m) { var k = _gameKey(m); _acc.seen[k] = 1; _acc.flushed[k] = 1; });
    return _acc;
  }

  var _athleteImportRunning = null, _athleteImportUid = null, _athleteAbort = 0;
  // QUEM PEDIU AGORA TEM PRIORIDADE. Recusar com "ocupado — aguarde ela terminar" era
  // preguiça nossa: o organizador clicou na Kelly, ele quer a Kelly. A leitura anterior é
  // ABANDONADA (o número da geração muda, e a rodada velha para de emitir e de gravar ao
  // perceber que não é mais a atual) e a nova começa na hora. Pedir a MESMA pessoa que já
  // está sendo lida continua sendo no-op — aí sim não há o que fazer.
  function runAthleteImport(handle, uid, tournamentId, prior, cursor) {
    if (_athleteImportRunning && _athleteImportUid === uid) return _athleteImportRunning;
    if (_athleteImportRunning) _athleteAbort++;      // abandona a anterior
    var geracao = _athleteAbort;
    _athleteImportUid = uid;
    _athleteImportRunning = _runAthleteImport(handle, uid, tournamentId, prior, cursor, function () { return geracao !== _athleteAbort; })
      .catch(function () {})
      .then(function () {
        if (geracao !== _athleteAbort) return;       // outra leitura assumiu; não limpa o estado dela
        _athleteImportRunning = null; _athleteImportUid = null;
      });
    return _athleteImportRunning;
  }
  // ══════════════════════════════════════════════════════════════════════════════
  // LEITURA DO HISTÓRICO DE UM ATLETA — reescrita (30/jul/2026) na especificação do dono:
  //
  //   "tem que ver de cara quantos torneios, rankings e jogos,
  //    e não tem que duplicar porra nenhuma.
  //    puxa torneios, rankings e depois a porra dos jogos"
  //
  // As três coisas que ela determina, e como cada uma é garantida aqui:
  //
  // 1. TOTAIS DE CARA. A ETAPA 0 lê o perfil UMA vez e tira dali "N Jogos · N Rankings ·
  //    N Torneios". Esses três números são o denominador das barras e NÃO MUDAM mais
  //    durante a leitura. A versão anterior deixava o total crescer (nascia em 478 e
  //    virava 569 no meio), o que é indistinguível de erro pra quem olha.
  //
  // 2. ZERO DUPLICATA. Jogo entra por UM caminho só: o histórico pessoal (ETAPA 3). Antes
  //    também se lia a página de jogos de CADA torneio, e a mesma partida voltava pelos
  //    dois caminhos com categorias diferentes — medido no perfil da Camila: 24 partidas
  //    contadas duas vezes. A chave de dedup (`_gameKey`) é a MESMA identidade do gid
  //    canônico: quem jogou + quando + placar. Texto de categoria não entra em chave.
  //
  // 3. ORDEM TORNEIOS → RANKINGS → JOGOS. Cada etapa termina antes da seguinte começar,
  //    então as barras enchem em sequência e a de jogos é a última a fechar. Antes o
  //    ranking só era DESCOBERTO ao ler os jogos, e por isso "Jogos 100% / Rankings 0".
  //
  // E o que já estava certo e continua: a rodada NÃO tem prazo de trabalho (o prazo de 4
  // min era menor que o trabalho de um perfil grande — ~9 min — e matava a leitura em 43%
  // dela, sempre); a proteção contra travar é OCIOSIDADE, do lado do app; tudo o que é
  // lido vira CURSOR gravado, então retomar custa zero releitura; e os parciais mandam só
  // o DELTA (regravar o histórico inteiro a cada parcial dava ~25 mil escritas por leitura).
  //
  // `prior`  = fullImport da rodada anterior (nomes/classificações já resolvidos)
  // `cursor` = o que já foi concluído (torneios, rankings, página do histórico)
  async function _runAthleteImport(handle, uid, tournamentId, prior, cursor, abandonada) {
    var X = window._spExtract, I = window._spImport, F = window._spFlow;
    // `abandonada()` = outra leitura foi pedida e esta não é mais a atual. Checar isso
    // custa nada e evita que a rodada velha continue gastando requisições e gravando por
    // cima da nova.
    if (typeof abandonada !== 'function') abandonada = function () { return false; };

    // ── estado da rodada ────────────────────────────────────────────────────────
    var C = (cursor && typeof cursor === 'object') ? cursor : {};
    // ⚠️ LER A VERSÃO ANTES DE ESCREVER NELA. `C` é o MESMO objeto que `prior.lzCursor`
    // (o app passa a referência), então marcar `C.v = 4` aqui e só depois perguntar
    // "que versão era?" comparava a versão com ela mesma — a migração NUNCA rodava e a
    // retomada continuava usando a página do cursor velho. Sintoma exato: a leitura
    // começava na página 13 em vez da 1 e o total nunca fechava.
    var versaoAnterior = (C.v || (prior && prior.lzCursor && prior.lzCursor.v) || 0);
    C.v = 4;
    if (!C.toursDone || typeof C.toursDone !== 'object') C.toursDone = {};
    if (!C.ranksDone || typeof C.ranksDone !== 'object') C.ranksDone = {};
    C.pageDone = (typeof C.pageDone === 'number' && C.pageDone > 0) ? C.pageDone : 0;
    // QUAIS PÁGINAS JÁ FORAM LIDAS, não só "até onde fui". Guardar um número só obriga a
    // recomeçar em ordem: com 157 de 158 jogos o app relia as 8 páginas atrás de um jogo
    // que, se existisse, estaria numa ponta. O conjunto deixa a retomada ler EXATAMENTE o
    // que falta, na ordem que fizer sentido — e torna "guardar onde parou" literal.
    if (!C.pagesRead || typeof C.pagesRead !== 'object') C.pagesRead = {};
    // legado: cursor antigo só tinha pageDone → as 1..pageDone estão lidas
    for (var _lp = 1; _lp <= C.pageDone; _lp++) if (!C.pagesRead[_lp]) C.pagesRead[_lp] = 1;
    // A VARREDURA ANTERIOR CHEGOU AO FIM? Só isso autoriza a leitura incremental (parar na
    // primeira página sem novidade). Se ela parou no meio, as páginas do FIM nunca foram
    // lidas — e parar cedo perderia esses jogos pra sempre. Tem que ser lido ANTES de
    // zerar a flag, senão eu comparo com o valor que eu mesmo acabei de escrever (o mesmo
    // erro que já tinha matado a migração por carimbo).
    var _varreduraAnteriorFechou = (C.complete === true);
    C.complete = false;

    // ── MIGRAÇÃO: o que o pipeline VELHO gravou não serve de semente ────────────
    // Import feito antes desta reescrita (cursor < v4) tem jogos vindos das páginas de
    // torneio além do histórico pessoal — inclusive a MESMA partida duas vezes, porque a
    // chave de dedup antiga incluía a categoria. Medido no perfil da Camila: 569 jogos
    // gravados para 478 reais, 24 deles duplicatas puras. Semear a leitura nova com isso
    // carregaria o erro pra sempre: o total nunca fecharia e as duplicatas nunca sairiam.
    // Então os JOGOS antigos são descartados e o histórico é relido do começo — são ~36
    // requisições, baratas. O que NÃO é descartado é o caro: nome e classificação de cada
    // torneio/ranking já lido, que continuam valendo e seguem sendo pulados.
    // A PROVA DE QUE OS JOGOS SÃO BONS ESTÁ NELES, NÃO NUM CARIMBO. O carimbo `v` é posto
    // no INÍCIO da rodada e salvo no primeiro parcial — então uma rodada que começou, gravou
    // um parcial e foi suspensa deixava carimbo NOVO com dado VELHO, e a migração virava
    // impossível pra sempre. Foi exatamente o que aconteceu no perfil da Camila: cursor v4
    // convivendo com os 569 jogos sujos (478 reais + 24 duplicatas + resto), e a barra
    // fechando "569 de 569 (100%)" em cima de um total errado.
    // O pipeline novo carrega o ID DA PARTIDA do próprio letzplay (`lzId`). Jogo sem `lzId`
    // só pode ter vindo do pipeline velho. Isso é verificável a qualquer momento, em qualquer
    // rodada, e não depende de nada ter dado certo antes.
    var jogosSujos = ((prior && prior.games) || []).some(function (g) { return g && !g.lzId; });
    // ⚠️ UMA LEITURA NUNCA PODE DEIXAR O DADO PIOR DO QUE ESTAVA.
    // A migração jogava os jogos velhos fora ANTES de ler os novos. Se a rodada terminasse
    // no meio — e ela termina, por rate-limit, aba fechada, o que for — o documento era
    // regravado com o pouco que tinha dado tempo de ler. Foi o que aconteceu com a Kelly:
    // 158 jogos viraram 20, o conteúdo de UMA página. Perda de dado real, causada pela
    // limpeza.
    // Agora os velhos FICAM no acumulado (o doc nunca encolhe) e a limpeza acontece só no
    // FECHAMENTO, quando a varredura completou. Enquanto ela não completa, o pior caso é
    // conviver com os dois formatos por um tempo — que é infinitamente melhor que perder.
    var migrando = !!(prior && (versaoAnterior < 4 || jogosSujos));
    var limparNoFim = migrando;
    if (migrando) {
      _acc = null;                    // não reaproveita o acumulado desta página
      // O CONJUNTO DE PÁGINAS ZERA (tudo tem que ser relido), mas os JOGOS ficam.
      C.pageDone = 0; C.pagesTotal = 0; C.pagesRead = {};
    }
    var A = _accFor(handle, prior);
    // GUARDA-CHUVA CONTRA ENCOLHIMENTO. Não basta "não descartar" — qualquer caminho que
    // reconstrua o acumulado (cache de módulo trocado, rodada encadeada, migração) pode
    // deixar o doc menor do que estava. Este é o número que o documento JÁ tinha; nada do
    // que a gente escrever pode ficar abaixo dele enquanto a varredura não fechar.
    var _jogosAntes = _gamesToMatches((prior && prior.games) || []);
    var all = A.all, seen = A.seen, det = A.tourDet;   // det = nome/classificação por competição
    var realHandle = C.handle || handle;

    // TOTAIS DO PERFIL — fixos a partir da ETAPA 0. Semeados do que já foi lido antes pra
    // uma retomada não começar com as barras zeradas.
    var nomeExibicao = (prior && prior.profile && prior.profile.name) || null;
    var totJogos = (prior && prior.declaredGames != null) ? prior.declaredGames : null;
    var totTorneios = (prior && prior.declaredTournaments != null) ? prior.declaredTournaments : null;
    var totRankings = (prior && prior.declaredRankings != null) ? prior.declaredRankings : null;

    var toursList = (prior && Array.isArray(prior.tournamentsList)) ? prior.tournamentsList.slice() : [];
    var ranksList = (prior && Array.isArray(prior.rankingsList)) ? prior.rankingsList.slice() : [];
    var maxPage = (typeof C.pagesTotal === 'number' && C.pagesTotal > 0) ? C.pagesTotal : 1;
    var lastPageRead = C.pageDone;
    var parcial = null, pausado = false;

    // nomes/classificações que já vieram de rodadas anteriores (melhor-conhecido-vence:
    // com footprint fragmentado, a última entrada não pode apagar o que a anterior trouxe)
    var priorNames = {};
    ((prior && prior.footprint) || []).forEach(function (f) {
      // A PROVA DE QUE FOI LIDO É A CLASSIFICAÇÃO. Exigir `name !== categoryRaw` sozinho
      // era frágil e virou bug na reescrita: eu passei a gravar `categoryRaw` = título da
      // lista, que É o próprio nome do torneio — então todo torneio recém-lido voltava a
      // contar como NÃO lido e a rodada seguinte re-buscava os 35, um a um. Era isto que o
      // dono via como "repassando todos os torneios de novo".
      if (!f || !(f.standings || (f.name && f.name !== f.categoryRaw))) return;
      var id = (f.official ? 't/' : 'r/') + (f.club || '') + '/' + (f.tourneyId || f.rankingId || '');
      var ja = priorNames[id];
      priorNames[id] = {
        name: f.name || (ja && ja.name) || null,
        standings: f.standings || (ja && ja.standings) || null,
        logo: f.logo || (ja && ja.logo) || null
      };
    });
    // TER NOME + CLASSIFICAÇÃO **É** ESTAR LIDO — a prova está no dado, não num contador.
    // O cursor sozinho registrava menos do que o footprint já provava, e a diferença era
    // rebuscada a cada rodada ("se já puxou 21 de 35, não deveria começar do 1 de novo").
    Object.keys(priorNames).forEach(function (id) {
      if (!priorNames[id].standings) return;
      (id.charAt(0) === 't' ? C.toursDone : C.ranksDone)[id] = 1;
    });

    // ── comunicação com o app ───────────────────────────────────────────────────
    function contagens() {
      var jogos = all.length, tOk = 0, rOk = 0;
      Object.keys(C.toursDone).forEach(function () { tOk++; });
      Object.keys(C.ranksDone).forEach(function () { rOk++; });
      function cap(x, y) { return (y != null && y > 0) ? Math.min(x, y) : x; }
      // HISTÓRICO LIDO ATÉ O FIM → O TOTAL É O QUE A LISTA ENUMERA, não o contador do perfil.
      // MEDIDO no letzplay em 30/jul (24 páginas de @camilacalia): 478 CARDS mas só 469 ids
      // de partida distintos — 9 partidas aparecem duas vezes na lista deles. O "478 Jogos"
      // do perfil conta card, não partida. Enquanto o total vinha dele, a barra fechava em
      // "469 de 478" e o perfil ficava eternamente INCOMPLETO por 9 fantasmas.
      // Mesma regra que já vale pros torneios: lista que se pode contar vale mais que
      // contador cujo critério a gente não conhece.
      var gTot = (C.complete === true) ? jogos : totJogos;
      return {
        g: cap(jogos, gTot), t: cap(tOk, totTorneios), r: cap(rOk, totRankings),
        gY: gTot, tY: totTorneios, rY: totRankings
      };
    }
    function prog(e) {
      if (abandonada()) return;      // não pinta a tela de uma leitura que já foi substituída
      e = e || {};
      // O CURSOR VIAJA JUNTO DO PROGRESSO. Ele é minúsculo (o que já foi lido, por id, e a
      // página do histórico) e assim o app pode gravá-lo A CADA PÁGINA. Antes só ia dentro
      // do PARCIAL, que sai de 3 em 3 páginas — uma interrupção perdia até duas páginas de
      // trabalho e a retomada refazia. Guardar onde parou é o que torna barato retomar
      // jogos, torneios e rankings exatamente do ponto em que ficaram.
      post({ __sp_lp: 'athlete-import-progress', tournamentId: tournamentId, uid: uid || null, handle: handle,
        current: { uid: uid || null, handle: handle, phase: e.phase || null, note: e.note || null },
        pct: (e.pct != null ? e.pct : null), feed: e.feed || null, counts: contagens(),
        cursor: { v: 4, handle: realHandle, toursDone: C.toursDone, ranksDone: C.ranksDone,
                  pageDone: lastPageRead, pagesRead: C.pagesRead, pagesTotal: maxPage || null,
                  complete: C.complete === true } });
    }
    function fail(code) {
      post({ __sp_lp: 'athlete-import-result', tournamentId: tournamentId, uid: uid || null, handle: handle, ok: false, error: code });
    }
    if (!X || !I || !F) { fail('libs'); return; }

    // ── montagem do import ──────────────────────────────────────────────────────
    function addJogos(lista) {
      var n = 0;
      (lista || []).forEach(function (m) {
        if (!m) return;
        var k = _gameKey(m);
        if (seen[k]) return;
        seen[k] = 1; all.push(m); n++;
      });
      return n;
    }
    function detDe(id) { return det[id] || priorNames[id] || null; }
    // Monta o `raw` com os jogos lidos + o que sabemos de cada competição. Competição
    // conhecida SEM jogo (ranking em que ela não jogou nada ainda) entra assim mesmo — é o
    // que faz a barra de rankings poder fechar no total do perfil.
    function montarRaw() {
      var raw = F.buildRaw(realHandle, all);
      (raw.tournaments || []).forEach(function (t) {
        var d = t.tourneyId && t.club ? detDe('t/' + t.club + '/' + t.tourneyId) : null;
        if (d) { if (d.name) t.name = d.name; if (d.standings) t.standings = d.standings; if (d.logo) t.logo = d.logo; }
      });
      (raw.rankings || []).forEach(function (r) {
        var d = r.rankingId && r.club ? detDe('r/' + r.club + '/' + r.rankingId) : null;
        if (d) { if (d.name) r.name = d.name; if (d.standings) r.standings = slimRankingStandings(d.standings, realHandle); if (d.logo) r.logo = d.logo; }
      });
      var temT = {}, temR = {};
      (raw.tournaments || []).forEach(function (t) { if (t.tourneyId) temT['t/' + (t.club || '') + '/' + t.tourneyId] = 1; });
      (raw.rankings || []).forEach(function (r) { if (r.rankingId) temR['r/' + (r.club || '') + '/' + r.rankingId] = 1; });
      toursList.forEach(function (P) {
        var id = 't/' + P.club + '/' + P.tid;
        if (temT[id]) return;
        var d = detDe(id); if (!d) return;
        var _pt = _partirNome(d.name || P.title || '');
        raw.tournaments.push({ name: d.name || P.title || '', club: P.club, sport: 'Beach Tennis',
          categoryRaw: _pt.cat || '', year: null, status: 'done', wins: 0, losses: 0,
          tourneyId: P.tid, rankingId: null, standings: d.standings || null, logo: d.logo || null });
      });
      ranksList.forEach(function (R) {
        var id = 'r/' + R.club + '/' + R.rid;
        if (temR[id]) return;
        var d = detDe(id); if (!d) return;
        var _pr = _partirNome(d.name || R.title || '');
        raw.rankings.push({ name: d.name || R.title || '', club: R.club, sport: 'Beach Tennis',
          categoryRaw: _pr.cat || '', year: null, status: 'done', wins: 0, losses: 0,
          tourneyId: null, rankingId: R.rid, standings: d.standings || null, logo: d.logo || null });
      });
      return raw;
    }
    function carimbar(imp) {
      if (nomeExibicao) { imp.profile = imp.profile || {}; imp.profile.name = nomeExibicao; }
      imp.declaredGames = totJogos;
      imp.declaredTournaments = totTorneios;
      imp.declaredRankings = totRankings;
      if (toursList.length) imp.tournamentsList = toursList.map(function (P) { return { club: P.club, tid: P.tid, title: P.title || null, data: P.data || null, dataNum: P.dataNum || null }; });
      if (ranksList.length) imp.rankingsList = ranksList.map(function (R) { return { club: R.club, rid: R.rid, title: R.title || null, data: R.data || null, dataNum: R.dataNum || null }; });
      imp.lzCursor = { v: 4, handle: realHandle, toursDone: C.toursDone, ranksDone: C.ranksDone,
        pageDone: lastPageRead, pagesRead: C.pagesRead, pagesTotal: maxPage || null,
        complete: C.complete === true };
      return boundImportDoc(imp);
    }
    // Só o que ENTROU desde o último flush: regravar tudo a cada parcial custava ~25 mil
    // escritas de documento por leitura e engasgava a aba sozinho.
    function delta(imp) {
      var out = [];
      (imp.games || []).forEach(function (g) {
        var k = _gameKey(g);
        if (A.flushed[k]) return;
        A.flushed[k] = 1; out.push(g);
      });
      return out;
    }
    function parcialAgora(etapa, feito, total) {
      if (abandonada()) return;      // nem grava por cima da leitura nova
      try {
        var imp = I.normalize(montarRaw(), { importedAt: new Date().toISOString() });
        imp.partialReason = 'parcial: ' + etapa + ' ' + feito + '/' + total;
        var d = delta(imp);
        imp = carimbar(imp);
        post({ __sp_lp: 'athlete-import-partial', tournamentId: tournamentId, uid: uid || null, handle: handle,
          stage: etapa, done: feito, total: total, scan: scanFromImport(realHandle, imp),
          fullImport: imp, gamesDelta: d, cursor: imp.lzCursor });
      } catch (e) {}
    }

    function ehPausa(e) { return !!(e && e.code === 'rate-budget'); }
    function _medalha(p) { return p === 1 ? '🥇' : (p === 2 ? '🥈' : (p === 3 ? '🥉' : '🏅')); }
    // Separa a CATEGORIA do fim do nome, igual à lista do dialog — o nome do letzplay quase
    // sempre termina nela ("… Praia Brava Panamby - DUPLA FEMININA C"). Sem separar, ela vai
    // pro feed grudada no nome e sem cor nenhuma, que é o que o dono está vendo.
    function _pareceCat(x) {
      var t = String(x || '').trim();
      if (!t || t.length > 40 || /ver\s+trilha|trilha\s+de/i.test(t)) return false;
      if (/(masculin|feminin|mist[ao]|\bmasc\b|\bfem\b)/i.test(t)) return true;
      return t.length <= 20 && /(^|[\s\/])(FUN|[A-D])\s*[+\-]?\s*($|[\s\/])/i.test(t);
    }
    function _partirNome(nome) {
      var n = String(nome || '').trim();
      var partes = n.split(/\s+[-–—]\s+/);
      if (partes.length < 2) return { nome: n, cat: null };
      var ult = partes[partes.length - 1].trim();
      if (!_pareceCat(ult)) return { nome: n, cat: null };
      var corte = n.slice(0, n.length - ult.length).replace(/[\s\-–—·.,:]+$/, '').trim();
      return corte ? { nome: corte, cat: ult } : { nome: n, cat: null };
    }
    function minhaPos(st) {
      var low = String(realHandle || '').toLowerCase(), out = null;
      (st || []).forEach(function (g) {
        (g.rows || []).forEach(function (r) {
          if (out == null && r.pos != null && (r.handles || []).some(function (x) { return String(x).toLowerCase() === low; })) out = r.pos;
        });
      });
      return out;
    }
    // Teto de SEGURANÇA (não é prazo de trabalho): só existe pra uma rodada nunca ficar
    // pendurada pra sempre. Ao estourar, checkpointa e o app encadeia a seguinte.
    var limite = Date.now() + 1800000;
    function conferirTeto() {
      if (abandonada()) { var a = new Error('abandonada'); a.code = 'abandonada'; throw a; }
      if (Date.now() > limite) { var e = new Error('teto da rodada'); e.code = 'rate-budget'; throw e; }
    }

    // Lê uma lista paginada de competições (/{handle}/tournaments ou /rankings).
    // `esperado` = quantos o perfil declara. Se a paginação da página não for detectável
    // pelo padrão `?page=`, continua pedindo página por página ATÉ SECAR (uma página que
    // não acrescenta nada encerra). Foi o que travou os rankings em "7 de 29": a lista
    // entrega 7 por página e a detecção de paginação não pegava — a leitura parava na
    // primeira página e a barra nunca passava disso. Não depender do markup deles é o que
    // faz isso funcionar mesmo quando a página muda.
    // Junta à lista pública tudo o que já sabemos existir (footprint de rodadas anteriores
    // e o próprio cursor). `pre` é 't' ou 'r'; `campo` é 'tid' ou 'rid'.
    function unirConhecidos(lista, pre, campo) {
      var tem = {};
      (lista || []).forEach(function (x) { tem[pre + '/' + x.club + '/' + x[campo]] = 1; });
      var extras = {};
      Object.keys(priorNames).forEach(function (k) { if (k.charAt(0) === pre && !tem[k]) extras[k] = 1; });
      Object.keys(pre === 't' ? C.toursDone : C.ranksDone).forEach(function (k) { if (!tem[k]) extras[k] = 1; });
      Object.keys(extras).forEach(function (k) {
        var partes = k.split('/');                       // 't/clube/123'
        if (partes.length < 3 || !partes[1] || !partes[2]) return;
        var item = { club: partes[1], title: (priorNames[k] && priorNames[k].name) || null };
        item[campo] = partes[2];
        lista.push(item);
      });
      return lista;
    }

    // DATA DA COMPETIÇÃO, TIRADA DO PRÓPRIO CARD DA LISTA — sem requisição extra.
    // MEDIDO na página real (letzplay.me/KellyBarth1/tournaments, 31/jul/2026): o texto do
    // card traz "Terminou em 28/jun/2026" (concluído), "Jogos em 01/ago" (em andamento) ou
    // "Próximo Jogo: 01/ago as 11:00hs". O ano some quando é do ano corrente.
    var _MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
    function _dataDoCard(txt) {
      var t = String(txt || '');
      var m = t.match(/Terminou em\s+(\d{1,2})\/([a-zç]{3})\/?(\d{4})?/i)
           || t.match(/Jogos em\s+(\d{1,2})\/([a-zç]{3})\/?(\d{4})?/i)
           || t.match(/Pr[óo]ximo Jogo:\s*(\d{1,2})\/([a-zç]{3})\/?(\d{4})?/i);
      if (!m) return null;
      var mes = _MESES[String(m[2]).toLowerCase().slice(0, 3)];
      if (!mes) return null;
      var ano = m[3] ? +m[3] : new Date().getFullYear();
      var dia = +m[1];
      return { num: ano * 10000 + mes * 100 + dia,
               label: (dia < 10 ? '0' : '') + dia + ' ' + String(m[2]).toLowerCase().slice(0, 3) + ' ' + String(ano).slice(2) };
    }
    function _cardDe(a) {
      var c = a;
      for (var i = 0; i < 5 && c.parentElement; i++) { c = c.parentElement; if (/\brow\b|card|item/i.test(c.className || '')) break; }
      return c;
    }

    async function lerLista(url, re, campo, esperado) {
      var achados = [], visto = {};
      function colher(doc) {
        [].slice.call(doc.querySelectorAll('a[href]')).forEach(function (a) {
          var h = a.getAttribute('href') || '', m = h.match(re);
          if (!m) return;
          // DEDUP PELO ID DA COMPETIÇÃO, NUNCA PELO HREF. Verificado na página real
          // (letzplay.me/camilacalia/tournaments, 30/jul): são 59 links pra ~20 torneios —
          // cada torneio aparece 3 vezes, em /{id}, /{id}/players e /{id}/matches. Dedup
          // por href tratava os três como torneios diferentes, e a leitura percorria a
          // lista inteira de novo. O id é a identidade; a URL é só um caminho até ele.
          var chave = m[1] + '/' + m[2];
          if (visto[chave]) {
            // guarda o melhor título: o link base costuma ter o nome, /players e /matches não
            var t0 = (a.textContent || '').replace(/\s+/g, ' ').trim();
            var ja = visto[chave];
            if (t0 && (!ja.title || t0.length > ja.title.length)) ja.title = t0;
            if (!ja.data) { var _d2 = _dataDoCard((_cardDe(a).textContent || '')); if (_d2) { ja.data = _d2.label; ja.dataNum = _d2.num; } }
            return;
          }
          var item = { club: m[1], title: (a.textContent || '').replace(/\s+/g, ' ').trim() };
          var _dt = _dataDoCard((_cardDe(a).textContent || ''));
          if (_dt) { item.data = _dt.label; item.dataNum = _dt.num; }
          item[campo] = m[2];
          visto[chave] = item;
          achados.push(item);
        });
      }
      var d1 = await bgFetchDoc(url);
      colher(d1);
      var mx = F.detectMaxPage(d1);
      var p = 2;
      for (; p <= mx; p++) {
        conferirTeto();
        colher(await bgFetchDoc(url + '?page=' + p));
      }
      // ainda falta pro que o perfil declara? insiste até uma página não trazer nada novo
      var teto = 30;
      while ((esperado == null || achados.length < esperado) && p <= teto) {
        conferirTeto();
        var antes = achados.length;
        colher(await bgFetchDoc(url + '?page=' + p));
        if (achados.length === antes) break;      // secou
        p++;
      }
      return achados;
    }

    // Requisições simultâneas por lote. Casa com os slots da fila do background — mandar
    // mais que isso só faz a fila segurar do outro lado.
    var LOTE = 2;

    _rateBudget = _newRateBudget(((totJogos || 400) / 13) + 2 * (totTorneios || 30) + (totRankings || 25) + 8);

    try {
      try {
        // ── ETAPA 0: os três totais, de cara ───────────────────────────────────
        prog({ phase: 'perfil', note: 'abrindo o perfil de @' + handle, pct: 1 });
        // A navegação NÃO passa mais pela fila de trabalho: o app já mandou abrir a página
        // no instante do clique (`lz-open-profile` → `lp-nav-now`). Enfileirar aqui custava
        // um passo inteiro da fila — dezenas de segundos — antes de a leitura começar.
        try { chrome.runtime.sendMessage({ type: 'lp-nav-now', url: 'https://letzplay.me/' + encodeURIComponent(handle) }, function () { void chrome.runtime.lastError; }); }
        catch (e) {}
        prog({ phase: 'perfil', note: 'lendo quantos torneios, rankings e jogos existem', pct: 2 });
        try {
          var dp = await bgFetchDoc('https://letzplay.me/' + encodeURIComponent(handle));
          var txt = ((dp.body && dp.body.textContent) || '').replace(/\s+/g, ' ');
          var mJ = txt.match(/(\d+)\s*Jogos/); if (mJ) totJogos = +mJ[1];
          var mR = txt.match(/(\d+)\s*Rankings/); if (mR) totRankings = +mR[1];
          var mT = txt.match(/(\d+)\s*Torneios/); if (mT) totTorneios = +mT[1];
          // NOME DE EXIBIÇÃO DO LETZPLAY. Vem do h1/h2 do perfil ("Camila Calia") ou do
          // og:title. O app usa isso pra dar nome a quem entrou só com telefone/e-mail e
          // aparece como "Usuário" — ver _lzAplicarNomeDoLetzplay.
          nomeExibicao = _nomeDoPerfilDoc(dp) || nomeExibicao;
          prog({ pct: 3, feed: '👤 ' + (totTorneios != null ? totTorneios : '?') + ' torneios · ' +
            (totRankings != null ? totRankings : '?') + ' rankings · ' + (totJogos != null ? totJogos : '?') + ' jogos' });
        } catch (e0) { if (ehPausa(e0)) throw e0; }
        _rateBudget = _newRateBudget(Math.ceil((totJogos || 0) / 13) + (totTorneios || 0) + (totRankings || 0) + 8);

        // ── ETAPA 1: TORNEIOS ──────────────────────────────────────────────────
        if (!toursList.length || (totTorneios != null && toursList.length < totTorneios)) {
          prog({ phase: 'torneios', note: 'lendo a lista de torneios', pct: 4 });
          try { toursList = await lerLista('https://letzplay.me/' + encodeURIComponent(handle) + '/tournaments', /^\/([^\/]+)\/tournaments\/(\d+)(?:\/|$)/, 'tid', totTorneios); }
          catch (e1) { if (ehPausa(e1)) throw e1; }
        }
        // UNIÃO COM O QUE JÁ CONHECEMOS. A lista pública nem sempre traz tudo: competição
        // descoberta pelos JOGOS (etapa 3) existe de verdade mas não aparece em
        // /{handle}/tournaments — e como o laço só percorre a lista, ela nunca era lida e a
        // barra ficava eternamente "29 de 30". Conhecido e não lido tem que virar trabalho.
        toursList = unirConhecidos(toursList, 't', 'tid');
        if (totTorneios == null && toursList.length) totTorneios = toursList.length;
        // A CAIXA ENCHE JÁ COM A LISTA. Ler a página de cada torneio leva tempo (uma
        // requisição por torneio), e até a primeira voltar a caixa ficava só com a linha
        // dos totais — parecia parada. A lista pública já traz o TÍTULO de cada um: mostra
        // agora, em cinza-claro, e cada linha é substituída pela versão completa (com
        // categoria e colocação) quando aquele torneio for lido de fato.
        toursList.slice().sort(function (a, b) { return (b.dataNum || 0) - (a.dataNum || 0); })
          .slice(0, 12).forEach(function (P) {
            if (!P || !P.title) return;
            prog({ phase: 'torneios', feed: { icon: '🏆', data: P.data || null, nome: P.title } });
          });
        if (toursList.length > 12) prog({ phase: 'torneios', feed: '… e mais ' + (toursList.length - 12) + ' torneio(s) na lista' });
        // A FILA JÁ FAZ VÁRIAS AO MESMO TEMPO — mas o laço `await` por item as
        // serializava mesmo assim. Disparamos em blocos: o tempo total passa a ser
        // limitado pelo servidor, não pelo nosso laço.
        // EM BLOCOS, NÃO UMA POR VEZ. A fila do background aceita várias ao mesmo tempo,
        // mas este laço fazia `await` por item — nunca havia mais de UMA requisição em voo,
        // e o paralelismo da fila não servia pra nada. Medido pelo dono: 3 minutos pra ~16
        // páginas de competição. Agora vai de lote em lote; o tempo passa a ser limitado
        // pelo servidor, não pelo nosso laço.
        var _pendT = toursList.filter(function (P) {
          var tk = 't/' + P.club + '/' + P.tid;
          // pular é pular, sem anunciar e sem gastar requisição
          if (C.toursDone[tk]) { var d0 = detDe(tk); if (d0) det[tk] = d0; return false; }
          return true;
        });
        var _totT = totTorneios || toursList.length;
        for (var _bt = 0; _bt < _pendT.length; _bt += LOTE) {
          conferirTeto();
          // O RÓTULO CONTA O MESMO QUE A BARRA: o que já foi LIDO.
          prog({ phase: 'torneios',
            note: 'torneio ' + Math.min(Object.keys(C.toursDone).length, _totT) + ' de ' + _totT + ' — nome, categoria e classificação',
            pct: 4 + Math.round((_bt / Math.max(1, _pendT.length)) * 26) });
          await Promise.all(_pendT.slice(_bt, _bt + LOTE).map(async function (P) {
            var tk = 't/' + P.club + '/' + P.tid;
            try {
              var dT = await bgFetchDoc('https://letzplay.me/' + P.club + '/tournaments/' + P.tid);
              det[tk] = { name: tourneyNameFromDoc(dT), standings: tourneyStandingsFromDoc(dT), logo: tourneyLogoFromDoc(dT) };
              C.toursDone[tk] = 1;
              var pT = minhaPos(det[tk].standings);
              prog({ phase: 'torneios',
                note: 'torneio ' + Math.min(Object.keys(C.toursDone).length, _totT) + ' de ' + _totT + ' — nome, categoria e classificação',
                feed: Object.assign({ icon: '🏆', data: P.data || null },
                  _partirNome(det[tk].name || P.title || ('torneio ' + P.tid)),
                  { pos: (pT != null ? (_medalha(pT) + ' ' + pT + 'º') : null) }) });
            } catch (eT) { if (ehPausa(eT)) throw eT; }
          }));
          parcialAgora('torneios', Math.min(_bt + LOTE, _pendT.length), _pendT.length);
        }

        // ── ETAPA 2: RANKINGS ──────────────────────────────────────────────────
        if (!ranksList.length || (totRankings != null && ranksList.length < totRankings)) {
          prog({ phase: 'rankings', note: 'lendo a lista de rankings', pct: 31 });
          try { ranksList = await lerLista('https://letzplay.me/' + encodeURIComponent(handle) + '/rankings', /^\/([^\/]+)\/rankings\/(\d+)(?:\/|$)/, 'rid', totRankings); }
          catch (e2) { if (ehPausa(e2)) throw e2; }
        }
        ranksList = unirConhecidos(ranksList, 'r', 'rid');
        if (totRankings == null && ranksList.length) totRankings = ranksList.length;
        prog({ phase: 'rankings', pct: 31,
          note: 'ranking ' + Math.min(Object.keys(C.ranksDone).length, (totRankings || ranksList.length) || 1) + ' de ' + ((totRankings || ranksList.length) || '?') + ' — nome e classificação' });
        var _pendR = ranksList.filter(function (R) {
          var rk = 'r/' + R.club + '/' + R.rid;
          if (C.ranksDone[rk]) { var d0 = detDe(rk); if (d0) det[rk] = d0; return false; }
          return true;
        });
        var _totR = totRankings || ranksList.length;
        for (var _br = 0; _br < _pendR.length; _br += LOTE) {
          conferirTeto();
          prog({ phase: 'rankings',
            note: 'ranking ' + Math.min(Object.keys(C.ranksDone).length, _totR) + ' de ' + _totR + ' — nome e classificação',
            pct: 31 + Math.round((_br / Math.max(1, _pendR.length)) * 14) });
          await Promise.all(_pendR.slice(_br, _br + LOTE).map(async function (R) {
            var rk = 'r/' + R.club + '/' + R.rid;
            try {
              var dR = await bgFetchDoc('https://letzplay.me/' + R.club + '/rankings/' + R.rid);
              det[rk] = { name: tourneyNameFromDoc(dR), standings: slimRankingStandings(rankingStandingsFromDoc(dR), realHandle), logo: tourneyLogoFromDoc(dR) };
              C.ranksDone[rk] = 1;
              var pR = minhaPos(det[rk].standings);
              prog({ phase: 'rankings',
                note: 'ranking ' + Math.min(Object.keys(C.ranksDone).length, _totR) + ' de ' + _totR + ' — nome e classificação',
                feed: Object.assign({ icon: '📊', data: R.data || null },
                  _partirNome(det[rk].name || R.title || ('ranking ' + R.rid)),
                  { pos: (pR != null ? (pR + 'º') : null) }) });
            } catch (eR) { if (ehPausa(eR)) throw eR; }
          }));
          parcialAgora('rankings', Math.min(_br + LOTE, _pendR.length), _pendR.length);
        }

        // ── ETAPA 3: JOGOS (fonte ÚNICA — o histórico pessoal) ─────────────────
        var base = 'https://letzplay.me/' + encodeURIComponent(handle) + '/matches';
        var jaLeuTudo = (C.pagesTotal > 0 && C.pageDone >= C.pagesTotal);
        if (jaLeuTudo) {
          C.complete = true;
          prog({ phase: 'jogos', note: 'histórico já lido por inteiro (' + C.pageDone + ' páginas)', pct: 97 });
        } else {
          // JÁ TEMOS ACERVO? Então a leitura é INCREMENTAL e começa na página 1 (o novo
          // entra por cima), não na página seguinte à do cursor.
          // MIGRANDO nunca é incremental: os jogos velhos continuam no acumulado (pra o doc
          // não encolher), mas eles NÃO são prova de que a página foi lida — precisamos
          // varrer tudo de novo. Sem esta linha a leitura pararia na primeira página "sem
          // novidade" e a limpeza nunca aconteceria.
          var jaConhecidos = (!migrando && _varreduraAnteriorFechou) ? all.length : 0;
          // A PÁGINA 1 é onde entra jogo novo, então ela vem primeiro — MAS só quando faz
          // sentido: numa varredura ainda incompleta ela já foi lida e reler é desperdício
          // (o harness pegou: "não releu nenhuma página anterior à do cursor"). Regra: lê a
          // 1 quando ainda não foi lida, ou quando a varredura anterior FECHOU (aí ela é
          // justamente o lugar onde o novo apareceu).
          var _leAUm = !C.pagesRead[1] || _varreduraAnteriorFechou;
          var pIni = _leAUm ? 1 : (function () {
            for (var q = 1; q <= (C.pagesTotal || 1); q++) if (!C.pagesRead[q]) return q;
            return C.pageDone + 1;
          })();
          prog({ phase: 'jogos', note: (jaConhecidos > 0
              ? 'procurando jogos novos a partir do começo do histórico'
              : (pIni > 1 ? ('retomando o histórico na página ' + pIni) : 'abrindo o histórico de jogos')),
            pct: 46 });
          var d1 = await bgFetchDoc(pIni > 1 ? (base + '?page=' + pIni) : base);
          var cards = d1.querySelectorAll('.row.match').length;
          var pg1 = X.extractMatchesFromDoc(d1, realHandle);
          if (!pg1.length && cards > 0) {
            var det0 = F.detectMe(d1);
            if (det0 && det0.toLowerCase() !== String(realHandle).toLowerCase()) {
              realHandle = det0;
              pg1 = X.extractMatchesFromDoc(d1, det0);
              prog({ phase: 'jogos', note: '@ real detectado: ' + det0 });
            }
          }
          if (!cards && !all.length && !pg1.length) { fail('pagina-sem-cards'); return; }
          maxPage = Math.max(F.detectMaxPage(d1), pIni);
          var tg = F.parseTotalGames(d1);
          if (tg != null && totJogos == null) totJogos = tg;
          var add1 = addJogos(pg1);
          lastPageRead = pIni; C.pagesRead[pIni] = 1;
          var _lidas1 = 0; for (var _z = 1; _z <= maxPage; _z++) if (C.pagesRead[_z]) _lidas1++;
          var _falta1 = Math.max(0, maxPage - _lidas1);
          prog({ phase: 'jogos', pct: 46 + Math.round((_lidas1 / Math.max(1, maxPage)) * 51),
            note: 'página ' + pIni + ' · ' + _lidas1 + ' de ' + maxPage + ' lidas · ' +
              (_falta1 ? ('faltam ' + _falta1) : 'nenhuma falta'),
            feed: '🎾 página ' + pIni + ': +' + add1 + ' jogo(s) · ' + _lidas1 + ' de ' + maxPage +
              ' lidas · ' + (_falta1 ? ('faltam ' + _falta1) : 'nenhuma falta') });
          // nada novo já na primeira: o acervo está em dia, uma requisição resolveu
          if (jaConhecidos > 0 && add1 === 0) {
            C.complete = true;
            prog({ phase: 'jogos', pct: 97, feed: '✅ nada novo — o histórico já estava em dia' });
          }
          // O HISTÓRICO É MAIS-RECENTE-PRIMEIRO: jogo novo entra na PÁGINA 1 e empurra o
          // resto pra baixo. Então, numa releitura de quem já tem acervo, o que falta está
          // no COMEÇO — e varrer as 8 páginas até o fim pra achar 6 jogos novos é trabalho
          // jogado fora (pergunta do dono: "faltam 6 jogos e passa por 8 páginas?").
          // Regra: se já conhecíamos jogos antes desta leitura, paramos assim que uma
          // página inteira não trouxer NADA novo — dali pra trás é tudo o que já temos.
          // Numa leitura do zero (acervo vazio) segue varrendo até o fim, como antes.
          // Isso também conserta um defeito do cursor por PÁGINA: o número da página não é
          // estável num feed que cresce por cima — "página 8" hoje não é a de ontem.
          var _incremental = (jaConhecidos > 0);
          var _secas = 0;
          // VARREDURA COMPLETA vai em LOTE (não há como uma página cancelar a outra);
          // a INCREMENTAL segue página a página, porque ela precisa parar na primeira que
          // não trouxer novidade — e disparar 3 de uma vez leria páginas à toa.
          if (!_incremental) {
            // SÓ AS PÁGINAS QUE FALTAM, e das PONTAS PRO MEIO. O que é novo está no começo
            // e o que ficou pra trás numa leitura interrompida está no fim — o meio é o
            // menos provável. Com 157 de 158 jogos, o app relia as 8 páginas em ordem
            // atrás de um jogo que, se existisse, estaria numa ponta.
            var _faltam = [];
            for (var _q = 1; _q <= maxPage; _q++) if (!C.pagesRead[_q]) _faltam.push(_q);
            _faltam.sort(function (a, b) {
              // distância até a ponta mais próxima: 1ª página e última primeiro
              return Math.min(a - 1, maxPage - a) - Math.min(b - 1, maxPage - b);
            });
            for (var _bp = 0; _bp < _faltam.length; _bp += LOTE) {
              conferirTeto();
              var _grupo = _faltam.slice(_bp, _bp + LOTE);
              // RÓTULO INEQUÍVOCO. Lemos as páginas das PONTAS pro meio, então um lote é
              // "24 e 2" — e "página 24, 2 de 24" lia como "página 24, 2 de 24", que não
              // quer dizer nada. Agora diz quais páginas estão sendo lidas E quantas já
              // foram, que é o número que bate com o resto da tela.
              function _lidasAgora() {
                var n = 0; for (var z = 1; z <= maxPage; z++) if (C.pagesRead[z]) n++;
                return n;
              }
              // SEMPRE OS DOIS NÚMEROS: quantas já foram lidas e quantas realmente faltam.
              // "12 de 24" sozinho ainda obriga a fazer conta; e o que falta é o que
              // interessa pra saber se vale esperar.
              function _placar(lidas) {
                var falta = Math.max(0, maxPage - lidas);
                return lidas + ' de ' + maxPage + ' lidas · ' + (falta ? ('faltam ' + falta) : 'nenhuma falta');
              }
              var _rot = (_grupo.length > 1 ? 'páginas ' : 'página ') + _grupo.join(' e ');
              // O NÚMERO É QUANTAS PÁGINAS JÁ FORAM LIDAS, contando a que está sendo lida
              // agora — não quantas cabem no lote. Se 23 já foram e falta uma, é "24 de 24",
              // não "1 de 24": o trabalho que já existe não deixa de existir porque esta
              // rodada só precisa de uma página.
              var _pos = Math.min(_lidasAgora() + _grupo.length, maxPage);
              prog({ phase: 'jogos', note: _rot + ' · ' + _placar(_pos),
                pct: 46 + Math.round((_pos / Math.max(1, maxPage)) * 51) });
              var _docs = await Promise.all(_grupo.map(function (q) {
                return bgFetchDoc(q > 1 ? (base + '?page=' + q) : base);
              }));
              var _addLote = 0, _vazias = 0;
              _docs.forEach(function (d, _i) {
                // PÁGINA SEM CARD NÃO É PÁGINA LIDA. Um fetch que falha vira um documento
                // vazio aqui — e marcar isso como "lida" fazia a varredura se dar por
                // completa e a limpeza apagar o que estava bom. Foi assim que os 158 jogos
                // da Kelly viraram 20: as páginas 2..24 "falharam com sucesso".
                var _cards = 0;
                try { _cards = d.querySelectorAll('.row.match').length; } catch (e) {}
                _addLote += addJogos(X.extractMatchesFromDoc(d, realHandle));
                if (_cards > 0) {
                  C.pagesRead[_grupo[_i]] = 1;
                  if (_grupo[_i] > lastPageRead) lastPageRead = _grupo[_i];
                } else _vazias++;
              });
              if (_vazias) prog({ phase: 'jogos', feed: '⚠️ ' + _vazias + ' página(s) voltaram vazias — não contam como lidas' });
              prog({ phase: 'jogos', pct: 46 + Math.round((_lidasAgora() / Math.max(1, maxPage)) * 51),
                note: _rot + ' · ' + _placar(_lidasAgora()),
                feed: '🎾 ' + _rot + ': +' + _addLote + ' jogo(s) · ' + _placar(_lidasAgora()) });
              if (_bp + LOTE < _faltam.length) parcialAgora('jogos', _bp + _grupo.length, _faltam.length);
            }
            // completo = TODAS as páginas no conjunto, não "cheguei na última"
            var _todas = true;
            for (var _c = 1; _c <= maxPage; _c++) if (!C.pagesRead[_c]) { _todas = false; break; }
            if (_todas) C.complete = true;
          }
          // ⚠️ SÓ NO MODO INCREMENTAL. Este laço é o que para na primeira página sem
          // novidade; no modo completo quem lê é o bloco de lotes acima. Sem esta guarda os
          // dois rodavam em sequência: o segundo repassava as páginas (vazias, porque já
          // tinham falhado), marcava todas como lidas e declarava a varredura completa —
          // e aí a limpeza da migração apagava o histórico bom. Foi assim que os 158 jogos
          // da Kelly viraram 20.
          for (var p = pIni + 1; _incremental && p <= maxPage && !C.complete; p++) {
            conferirTeto();
            var _lidasP = 0; for (var _y = 1; _y <= maxPage; _y++) if (C.pagesRead[_y]) _lidasP++;
            var _posP = Math.min(_lidasP + 1, maxPage), _faltaP = Math.max(0, maxPage - _posP);
            prog({ phase: 'jogos',
              note: 'página ' + p + ' · ' + _posP + ' de ' + maxPage + ' lidas · ' +
                (_faltaP ? ('faltam ' + _faltaP) : 'nenhuma falta') + ' — procurando jogo novo',
              pct: 46 + Math.round((_lidasP / Math.max(1, maxPage)) * 51) });
            var add = addJogos(X.extractMatchesFromDoc(await bgFetchDoc(base + '?page=' + p), realHandle));
            // página vazia não é página lida (ver o mesmo cuidado no bloco de lotes)
            lastPageRead = p; if (add > 0) C.pagesRead[p] = 1;
            if (_incremental) {
              if (add === 0) _secas++; else _secas = 0;
              if (_secas >= 1) {
                // uma página inteira sem novidade = alcançamos o que já tínhamos
                C.complete = true;
                prog({ phase: 'jogos', pct: 97,
                  feed: '✅ alcancei o que já estava gravado na página ' + p + ' — parei aqui' });
                break;
              }
            }
            prog({ phase: 'jogos', pct: 46 + Math.round((p / Math.max(1, maxPage)) * 51),
              feed: '🎾 página ' + p + ' de ' + maxPage + ': +' + add + ' jogo(s)' });
            // NUNCA na última página: o fechamento vem logo atrás e as duas escritas
            // correm pro MESMO doc. Medido em produção: o doc final da Camila ficou com
            // `partialReason: "parcial: jogos 24/24"` (o parcial chegou depois), e por
            // causa disso a tela dizia "Perfil INCOMPLETO" numa leitura que fechou.
            if (p % 3 === 0 && p < maxPage) parcialAgora('jogos', p, maxPage);
          }
          if (lastPageRead >= maxPage) C.complete = true;
        }
      } catch (eEtapa) {
        if (eEtapa && eEtapa.code === 'abandonada') throw eEtapa;   // sai calado
        if (ehPausa(eEtapa)) pausado = true;
        else if (!all.length) throw eEtapa;
        else parcial = String((eEtapa && eEtapa.message) || eEtapa).slice(0, 100);
      }

      if (abandonada()) return;      // outra pessoa foi pedida: some em silêncio
      if (!all.length && !Object.keys(det).length) { fail('sem-jogos'); return; }

      // ── fechamento ─────────────────────────────────────────────────────────────
      // ── FECHAMENTO ────────────────────────────────────────────────────────────
      // O acumulado JÁ entra semeado com tudo o que estava gravado (_accFor(prior)) e nada
      // aqui remove jogo — então não existe nada a "repor". A reposição que existia aqui
      // nasceu na versão em que a migração APAGAVA os jogos velhos; depois que ela parou de
      // apagar, a reposição virou acréscimo do que já estava presente — e foi ela que
      // inflou o histórico da Camila (478 → 1038). Duplicar e depois desduplicar são dois
      // erros pra fazer um acerto: o certo é não duplicar.
      //
      // A ÚNICA operação do fechamento é a LIMPEZA da migração, e só quando as duas
      // condições valem: a varredura fechou E o conjunto limpo é pelo menos tão grande
      // quanto o que já existia. Se não valem, o acumulado segue como está — que já é, por
      // construção, tudo o que havia mais o que foi lido agora.
      if (limparNoFim && C.complete === true) {
        var _limpos = all.filter(function (m) { return m && m.lzId; });
        if (_limpos.length >= _jogosAntes.length) {
          all.length = 0; Array.prototype.push.apply(all, _limpos);
        } else {
          // "completou" mas com menos do que já tínhamos → isso não é limpeza, é perda.
          C.complete = false;
          prog({ phase: 'jogos', feed: '🛟 leitura incompleta (' + _limpos.length + ' de ' +
            _jogosAntes.length + ') — o histórico gravado foi preservado' });
        }
      }
      var imp = I.normalize(montarRaw(), { importedAt: new Date().toISOString() });
      var deltaFinal = delta(imp);
      imp = carimbar(imp);
      if (pausado) imp.partialReason = 'pausado: retomando';
      else if (parcial) imp.partialReason = String(parcial).slice(0, 120);
      // NULL EXPLÍCITO, não `delete`. O app grava com `set(..., {merge:true})`, e merge
      // preserva o que já está no documento quando a chave NÃO vem — então apagar a chave
      // do objeto deixava o `partialReason` de um parcial anterior gravado pra sempre.
      // Medido em 31/jul no doc da Kelly: leitura completa, 157 jogos com id, e o doc ainda
      // com "parcial: jogos 6/8" — e por causa dele `_lzImportComplete` dizia incompleto e
      // o nome ficava violeta.
      else imp.partialReason = null;
      var v = I.validate(imp);
      if (!v || !v.valid) { fail('invalido'); return; }

      var relatorio = {
        tournaments: toursList.map(function (P) {
          var d = detDe('t/' + P.club + '/' + P.tid);
          return { title: (d && d.name) || P.title || ('torneio ' + P.tid), got: !!d, games: 0, pos: d ? minhaPos(d.standings) : null };
        }),
        pagesRead: lastPageRead, maxPage: maxPage,
        games: all.length, declared: totJogos
      };
      var terminou = !pausado && C.complete === true;
      if (terminou) { try { chrome.runtime.sendMessage({ type: 'lp-close-scan-tab' }); } catch (e) {} }
      post({ __sp_lp: 'athlete-import-result', tournamentId: tournamentId, uid: uid || null, handle: handle,
        ok: true, done: terminou, paused: !!pausado, report: relatorio, cursor: imp.lzCursor,
        gamesDelta: deltaFinal, scan: scanFromImport(realHandle, imp), fullImport: imp });
    } catch (e) {
      // Leitura abandonada porque o organizador pediu outra pessoa não é erro dele —
      // não pode virar toast vermelho na tela.
      if (!(e && e.code === 'abandonada') && !abandonada()) {
        fail(String((e && e.message) || e).slice(0, 140));
      }
    } finally {
      _rateBudget = null;
    }
  }

  // TOTAIS do perfil público ("472 Jogos · 29 Rankings · 35 Torneios") pro DIALOG do
  // atleta mostrar as barras x de y ANTES mesmo de puxar. 1 fetch, HTML cru.
  async function profileCounts(handle) {
    try {
      var d = await bgFetchDoc('https://letzplay.me/' + encodeURIComponent(handle));
      var t = ((d.body && d.body.textContent) || '').replace(/\s+/g, ' ');
      function n(re) { var m = t.match(re); return m ? +m[1] : null; }
      post({ __sp_lp: 'lz-profile-counts-result', handle: handle,
        games: n(/(\d+)\s*Jogos/), rankings: n(/(\d+)\s*Rankings/), tournaments: n(/(\d+)\s*Torneios/) });
    } catch (e) {
      post({ __sp_lp: 'lz-profile-counts-result', handle: handle, error: String((e && e.message) || e).slice(0, 80) });
    }
  }

  // Checa se o usuário está logado no letzplay (o app não consegue — cross-origin;
  // a extensão consulta com os cookies da sessão e reporta). Alimenta o "Passo 2 verde".
  async function checkLetzplay() {
    try {
      // noCreateTab: a checagem de login NUNCA abre uma aba do letzplay — só usa uma já
      // aberta. Se não houver, fica "indefinido" (não abre nada). letzplay só abre quando
      // o usuário clica no botão "Abrir meu histórico no letzplay" ou manda importar.
      var doc = await bgFetchDoc('https://letzplay.me/u/matches/history', { noCreateTab: true });
      var cards = doc.querySelectorAll('.row.match').length;
      var hasPw = !!doc.querySelector('input[type="password"]');
      var loginTitle = /\b(login|entrar)\b/i.test(doc.title || '');
      // loggedIn confiável = achou cards; se não achou mas também não é tela de login, fica indefinido
      var loggedIn = cards > 0 ? true : ((hasPw || loginTitle) ? false : null);
      post({ __sp_lp: 'letzplay-status', loggedIn: loggedIn });
    } catch (e) {
      post({ __sp_lp: 'letzplay-status', loggedIn: null, error: (e && e.message) || 'fetch' });
    }
  }

  // Handler guardado em window: uma RE-INJEÇÃO (após recarregar/atualizar a extensão)
  // remove o handler velho e instala um novo com chrome.runtime válido — sem recarregar
  // a PÁGINA. E o guard `chrome.runtime.id` faz um content script MORTO (contexto
  // invalidado) ignorar mensagens, então só o vivo age (mata o "Extension context invalidated").
  if (window.__spLzpMsgHandler) { try { window.removeEventListener('message', window.__spLzpMsgHandler); } catch (e) {} }
  window.__spLzpMsgHandler = function (e) {
    if (e.source !== window) return;
    if (!chrome.runtime || !chrome.runtime.id) return; // content script órfão → ignora
    var d = e.data;
    if (!d) return;
    if (d.__sp_lp === 'ext-ping') { announce(); return; }
    if (d.__sp_lp === 'run-import') { runDirectImport(); return; }
    if (d.__sp_lp === 'check-letzplay') { checkLetzplay(); return; }
    if (d.__sp_lp === 'run-org-scan') { runOrgScan(d.targets, d.tournamentId, d.mode === 'full' ? 'full' : 'essential'); return; }
    if (d.__sp_lp === 'run-athlete-import') { runAthleteImport(d.handle, d.uid, d.tournamentId, d.prior || null, d.cursor || null); return; }
    if (d.__sp_lp === 'lz-profile-counts') { profileCounts(d.handle); return; }
    // Abrir o perfil da pessoa NA HORA do clique (fora da fila de trabalho).
    if (d.__sp_lp === 'lz-open-profile' && d.handle) {
      try {
        chrome.runtime.sendMessage({ type: 'lp-nav-now',
          url: 'https://letzplay.me/' + encodeURIComponent(d.handle) }, function () { void chrome.runtime.lastError; });
      } catch (e) {}
      return;
    }
  };
  window.addEventListener('message', window.__spLzpMsgHandler);

  // ── Relay do POPUP (import via clique no ícone) → página, com resultado real ──
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.__sp_lp === 'import' && msg.letzplayImport) {
      var done = false;
      function finish(res) {
        if (done) return; done = true;
        window.removeEventListener('message', onResult);
        try { sendResponse(res); } catch (e) {}
      }
      function onResult(e) {
        if (e.source !== window) return;
        var d = e.data;
        if (!d || d.__sp_lp !== 'import-result') return;
        finish({ ok: !!d.ok, error: d.error || null, count: d.count });
      }
      window.addEventListener('message', onResult);
      try { post({ __sp_lp: 'import', letzplayImport: msg.letzplayImport }); }
      catch (e) { finish({ ok: false, error: String(e) }); return true; }
      setTimeout(function () { finish({ ok: false, error: 'sem-resposta' }); }, 8000);
      return true;
    } else if (msg && msg.__sp_lp === 'ping') {
      sendResponse({ ok: true }); return true;
    }
  });
})();
