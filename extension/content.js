/* content.js — roda no scoreplace.app. Ponte extensão ↔ página + orquestra o IMPORT
 * DIRETO disparado pelo app (sem o usuário clicar no ícone da extensão):
 *   app → postMessage {run-import} → content busca (via background) + extrai + normaliza
 *       → postMessage {import} → letzplay-bridge.js grava e devolve {import-result}.
 * Também: anuncia presença (extension-present) + responde ao ping do app.
 * Libs (_spExtract/_spImport/_spFlow) carregam antes deste arquivo (ver manifest).
 */
(function () {
  var EXT_VERSION = '1.53';

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
  async function fillTourneyNames(raw, onProg) {
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
    for (var i = 0; i < uniq.length; i++) {
      // Progresso: 'names' pro import do próprio usuário; onProg quando é a busca do
      // organizador (Análise de Inscritos), que tem barra própria.
      if (onProg) onProg({ phase: 'torneios', note: (i + 1) + ' de ' + uniq.length });
      else post({ __sp_lp: 'import-progress', phase: 'names', done: i, total: uniq.length });
      var u = uniq[i];
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
        if (nm) { resolved++; } else { failed.push(u.categoryRaw || u.id); }
      } catch (e) { cache[u.id] = null; failed.push(u.categoryRaw || u.id); }
    }
    if (!onProg) post({ __sp_lp: 'import-progress', phase: 'names', done: uniq.length, total: uniq.length });
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
    return { total: uniq.length, resolved: resolved, failed: failed };
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
  function _gameKey(m) {
    return [m.date || '', m.club || '', (m.tourneyId || m.rankingId || ''), (m.categoryRaw || m.competition || ''),
      m.myScore, m.oppScore, (m.partnerHandle || ''), (m.oppHandles || []).slice().sort().join('+')].join('|').toLowerCase();
  }
  // games GRAVADOS (schema salvo) → shape de "match cru" que o buildRaw espera.
  function _gamesToMatches(games) {
    return (games || []).map(function (g) {
      return {
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

  var _athleteImportRunning = null, _athleteImportUid = null;
  function runAthleteImport(handle, uid, tournamentId, prior, cursor) {
    if (_athleteImportRunning) {
      // Ocupado com OUTRO atleta → responde na hora (antes: silêncio total e o
      // organizador achava que "não puxa mais ninguém").
      if (_athleteImportUid !== uid) {
        post({ __sp_lp: 'athlete-import-result', tournamentId: tournamentId, uid: uid || null, handle: handle, ok: false, error: 'ocupado — outra leitura em andamento; aguarde ela terminar' });
      }
      return _athleteImportRunning;
    }
    _athleteImportUid = uid;
    _athleteImportRunning = _runAthleteImport(handle, uid, tournamentId, prior, cursor)
      .catch(function () {})
      .then(function () { _athleteImportRunning = null; _athleteImportUid = null; });
    return _athleteImportRunning;
  }
  // Pipeline EM ETAPAS, checkpointando a cada passo:
  //   1) lista de TORNEIOS da pessoa (/{handle}/tournaments — HTML cru, confiável);
  //   2) POR TORNEIO (mais recente primeiro): nome+categoria+CLASSIFICAÇÃO (página do
  //      torneio) e os JOGOS do torneio (/{...}/matches) → PARCIAL gravado a cada um;
  //   3) jogos gerais (/{handle}/matches paginado, recente→antigo) → parcial a cada
  //      3 páginas. O que já veio NUNCA se perde; a próxima rodada continua de onde parou.
  // `prior` = fullImport de rodada anterior (nomes/classificações já resolvidos);
  // `cursor` = ONDE a leitura parou (etapas concluídas, última página lida).
  //
  // ⛔ POR QUE O PRAZO DE 4 MINUTOS SAIU (medido, caso Camila — 472 jogos / 35 torneios /
  // 29 rankings): a rodada era time-boxed em 240s, mas o trabalho de um perfil desse
  // tamanho são ~140 requisições, e o espaçamento humano da fila (gap 2600ms sorteado
  // entre 0,7× e 1,8×) dá ~4s cada → 9,2 MINUTOS. O prazo matava a rodada em 43% do
  // trabalho, SEMPRE, e sempre dentro da ETAPA 2 — a ETAPA 3, onde vivem ~400 dos 472
  // jogos, nunca era alcançada. Um perfil pequeno (Rodrigo: 37 requisições ≈ 2,4 min)
  // cabia folgado; é exatamente por isso que "funciona com o meu e não com o da Camila".
  // O prazo não estava protegendo de nada: ele ERA o defeito. A proteção real contra
  // travar é OCIOSIDADE (o app corta em 3 min sem NENHUMA notícia) — e progresso é
  // emitido a cada página, cada torneio e cada espera.
  async function _runAthleteImport(handle, uid, tournamentId, prior, cursor) {
    var X = window._spExtract, I = window._spImport, F = window._spFlow;
    // prog agora carrega pct (0–100, barra REAL), feed (linha do que acabou de ser lido)
    // e counts (x/y ao vivo das 3 barras Torneios/Rankings/Jogos que o app exibe).
    function prog(extra) {
      extra = extra || {};
      var cur = { uid: uid || null, handle: handle, phase: extra.phase || null, note: extra.note || null };
      post({ __sp_lp: 'athlete-import-progress', tournamentId: tournamentId, uid: uid || null, handle: handle,
        current: cur, pct: (extra.pct != null ? extra.pct : null), feed: extra.feed || null, counts: liveCounts() });
    }
    // Contagens AO VIVO pras barras do app. y = o total DECLARADO pelo perfil ("35
    // Torneios"), que é a verdade; x = quanto disso já foi LIDO.
    //
    // ⚠️ x É "LIDO", NÃO "CONHECIDO" — e confundir os dois produziu dois absurdos na tela
    // (30/jul): "🏆 35 de 35 (100%)" enquanto o rodapé dizia "torneio 16 de 35", e depois
    // "38 de 35 (100%)". Antes, x contava todo tourneyId CITADO por qualquer jogo do
    // acumulado; como o acumulado entra semeado pela rodada anterior, x nascia no total (ou
    // acima dele, porque o histórico dela referencia mais torneios do que o perfil declara).
    // Torneio LIDO = aquele cuja página foi aberta nesta rodada (`tourneyDetails`) ou já
    // vinha marcada no cursor (`C.toursDone`). E x é CAPADO em y: o declarado é o total, e
    // 35 de 35 é 100% — nunca 38 de 35 (regra explícita do dono).
    function liveCounts() {
      var rS = {}, nG = 0, tLidos = {};
      try {
        (all || []).forEach(function (m) {
          nG++;
          if (!m.official && m.rankingId != null) rS['r/' + (m.club || '') + '/' + m.rankingId] = 1;
        });
        // lidos NESTA rodada + marcados no cursor + os que já tinham nome/classificação
        // resolvidos numa rodada ANTERIOR (priorNames) — esses foram lidos de verdade, e sem
        // eles a barra voltava pra zero numa retomada e ficava em 0 quando o perfil não tem
        // lista pública de torneios (aí quem resolve os nomes é a etapa final).
        Object.keys(tourneyDetails || {}).forEach(function (k) { if (tourneyDetails[k]) tLidos[k] = 1; });
        Object.keys(C.toursDone || {}).forEach(function (k) { tLidos[k] = 1; });
        Object.keys(priorNames || {}).forEach(function (k) { if (k.charAt(0) === 't') tLidos[k] = 1; });
      } catch (e) { return null; }
      var gY = (declaredGamesTotal != null) ? declaredGamesTotal : ((prior && prior.declaredGames != null) ? prior.declaredGames : null);
      var tY = (declaredTournTotal != null) ? declaredTournTotal : ((prior && prior.declaredTournaments != null) ? prior.declaredTournaments : null);
      // A lista ENUMERADA manda quando é maior que o contador do perfil: o perfil da Camila
      // diz "35 Torneios" e a lista pública tem mais entradas — era assim que a barra
      // fechava "35 de 35 (100%)" com torneios ainda por ler. Contador que a gente não sabe
      // o que conta perde de uma lista que a gente consegue contar.
      if (parts && parts.length) tY = (tY != null) ? Math.max(tY, parts.length) : parts.length;
      var rY = (declaredRankingsTotal != null) ? declaredRankingsTotal : ((prior && prior.declaredRankings != null) ? prior.declaredRankings : null);
      function cap(x, y) { return (y != null && y > 0) ? Math.min(x, y) : x; }
      return {
        g: cap(nG, gY), t: cap(Object.keys(tLidos).length, tY), r: cap(Object.keys(rS).length, rY),
        gY: gY, tY: tY, rY: rY
      };
    }
    function fail(code) { post({ __sp_lp: 'athlete-import-result', tournamentId: tournamentId, uid: uid || null, handle: handle, ok: false, error: code }); }
    if (!X || !I || !F) { fail('libs'); return; }
    // CURSOR: onde a leitura parou. É o que faz uma retomada custar ZERO releitura — sem
    // ele a ETAPA 3 recomeçava da página 1 em toda rodada, e num perfil de 35 páginas a
    // rodada gastava o tempo relendo o que já tinha.
    var C = (cursor && typeof cursor === 'object') ? cursor : {};
    C.v = 3;
    if (!C.toursDone || typeof C.toursDone !== 'object') C.toursDone = {};
    C.pageDone = (typeof C.pageDone === 'number' && C.pageDone > 0) ? C.pageDone : 0;
    C.complete = false;
    try {
      // SEMENTE: o acumulado da PÁGINA (rodadas encadeadas não se reconstroem) mais os
      // nomes/classificações já resolvidos, que não são re-buscados.
      var A = _accFor(handle, prior);
      var all = A.all, seen = A.seen, tourneyDetails = A.tourDet;
      var priorNames = {};
      ((prior && prior.footprint) || []).forEach(function (f) {
        var id = (f.official ? 't/' : 'r/') + (f.club || '') + '/' + (f.tourneyId || f.rankingId || '');
        if (f.name && f.name !== f.categoryRaw) {
          // MELHOR CONHECIDO VENCE: com o footprint fragmentado (várias entradas do mesmo
          // torneio), a última não pode apagar a classificação que a anterior trouxe.
          var ja = priorNames[id];
          priorNames[id] = {
            name: f.name || (ja && ja.name) || null,
            standings: f.standings || (ja && ja.standings) || null,
            logo: f.logo || (ja && ja.logo) || null
          };
        }
      });
      // TER NOME + CLASSIFICAÇÃO **É** ESTAR LIDO. O cursor sozinho não bastava: ele
      // registrou 18 torneios enquanto o footprint já provava 21, e os 3 de diferença eram
      // rebuscados a cada rodada — o dono viu isso como "se já puxou 21 de 35, não deveria
      // começar do 1 de novo". A prova está no DADO, não no contador: se a classificação
      // daquele torneio já está gravada, não há o que reler.
      Object.keys(priorNames).forEach(function (id) {
        if (id.charAt(0) === 't' && priorNames[id].standings) C.toursDone[id] = 1;
      });
      function addMatches(list) {
        var n = 0;
        (list || []).forEach(function (m) { if (!m) return; var k = _gameKey(m); if (seen[k]) return; seen[k] = 1; all.push(m); n++; });
        return n;
      }
      var realHandle = C.handle || handle;
      function buildRawWithDetails() {
        var raw = F.buildRaw(realHandle, all);
        (raw.tournaments || []).forEach(function (t) {
          if (!t.tourneyId || !t.club) return;
          var d = tourneyDetails['t/' + t.club + '/' + t.tourneyId] || priorNames['t/' + t.club + '/' + t.tourneyId];
          if (d) { if (d.name) t.name = d.name; if (d.standings) t.standings = d.standings; if (d.logo) t.logo = d.logo; }
        });
        (raw.rankings || []).forEach(function (r) {
          if (!r.rankingId || !r.club) return;
          var d = priorNames['r/' + r.club + '/' + r.rankingId];
          // standings herdados de gravação ANTIGA podem estar completos → slim de novo
          if (d) { if (d.name) r.name = d.name; if (d.standings) r.standings = slimRankingStandings(d.standings, realHandle); if (d.logo) r.logo = d.logo; }
        });
        return raw;
      }
      var parts = [];                     // participações em torneios (lista pública)
      var declaredGamesTotal = null;      // quantos jogos o letzplay DIZ que existem
      var declaredRankingsTotal = null, declaredTournTotal = null;
      // maxPage/lastPageRead nascem DO CURSOR: se esta rodada parar antes da ETAPA 3 (por
      // exemplo no meio dos torneios), o cursor tem que sair dela com a mesma posição de
      // página com que entrou — não zerada. Zerar aqui fazia a rodada seguinte reler o
      // histórico geral desde a página 1.
      var maxPage = (typeof C.pagesTotal === 'number' && C.pagesTotal > 0) ? C.pagesTotal : 1;
      var parcial = null, pausado = false, lastPageRead = C.pageDone;
      // TETO DE SEGURANÇA da rodada — NÃO é prazo de trabalho (ver o comentário grande em
      // cima da função). É folgado de propósito: só existe pra uma rodada não ficar
      // pendurada pra sempre se algo patológico acontecer. Escala com o tamanho do perfil
      // e, ao estourar, CHECKPOINTA (grava o cursor) e o app encadeia a rodada seguinte —
      // ninguém precisa clicar de novo.
      var deadline = Date.now() + 1800000;   // 30 min
      function checkDeadline() { if (Date.now() > deadline) { var e = new Error('teto da rodada'); e.code = 'rate-budget'; throw e; } }
      function stampDeclared(imp) {
        // mesmo critério do liveCounts: o MAIOR entre declarado e enumerado
        var _tDecl = (declaredTournTotal != null) ? declaredTournTotal : ((prior && prior.declaredTournaments) || null);
        imp.declaredTournaments = (parts.length && _tDecl != null) ? Math.max(_tDecl, parts.length)
          : (parts.length || _tDecl);
        imp.declaredRankings = (declaredRankingsTotal != null) ? declaredRankingsTotal : ((prior && prior.declaredRankings) || null);
        if (declaredGamesTotal != null) imp.declaredGames = declaredGamesTotal;
        else if (prior && prior.declaredGames != null) imp.declaredGames = prior.declaredGames;
        // v1.48: a LISTA de torneios (título já traz a categoria) é PERSISTIDA — o app
        // mostra todos no dialog (lidos e pendentes) e a rodada seguinte pula a releitura
        // da lista quando ela já está completa. Pedido do dono: "se leu 2 de 2, já
        // deveria ter todos os torneios dela com a categoria".
        if (parts.length) imp.tournamentsList = parts.map(function (Pp) { return { club: Pp.club, tid: Pp.tid, title: Pp.title || null }; });
        else if (prior && Array.isArray(prior.tournamentsList) && prior.tournamentsList.length) imp.tournamentsList = prior.tournamentsList;
        imp.lzCursor = { v: 3, handle: realHandle, toursDone: C.toursDone,
          pageDone: lastPageRead, pagesTotal: maxPage || null, complete: C.complete === true };
        return boundImportDoc(imp);
      }
      // Só o que ENTROU desde o último flush. Antes cada parcial re-enviava e REGRAVAVA o
      // histórico inteiro: 46 parciais × 472 partidas = 24.656 escritas de documento por
      // rodada (28 MB no doc resumo), o que por si só engasgava a aba e comia o tempo da
      // leitura. Agora um parcial custa o tamanho do que acabou de ser lido.
      function deltaGames(imp) {
        var out = [];
        (imp.games || []).forEach(function (g) {
          var k = _gameKey(g);
          if (A.flushed[k]) return;
          A.flushed[k] = 1;
          out.push(g);
        });
        return out;
      }
      function postPartial(stage, done, total) {
        try {
          if (!all.length) return;
          var imp = I.normalize(buildRawWithDetails(), { importedAt: new Date().toISOString() });
          imp.partialReason = 'parcial: ' + stage + ' ' + done + '/' + total;   // rodada em curso — nunca marca completo
          var delta = deltaGames(imp);
          imp = stampDeclared(imp);
          post({ __sp_lp: 'athlete-import-partial', tournamentId: tournamentId, uid: uid || null, handle: handle,
            stage: stage, done: done, total: total, scan: scanFromImport(realHandle, imp),
            fullImport: imp, gamesDelta: delta, cursor: imp.lzCursor });
        } catch (e) {}
      }
      // Barra REAL 0–100: torneios ocupam 2→30%, páginas de jogos 30→95%, final 97%.
      function pctTour(i) { return Math.min(30, 2 + Math.round((i / Math.max(1, parts.length)) * 28)); }
      function pctPage(p, mx) { return Math.min(95, 30 + Math.round((p / Math.max(1, mx)) * 65)); }
      // Posição do atleta na classificação do torneio (pros feeds e pro dialog do app).
      function myPos(standings, h) {
        var low = String(h || '').toLowerCase(), out = null;
        (standings || []).forEach(function (g) {
          (g.rows || []).forEach(function (r) {
            if (out == null && r.pos != null && (r.handles || []).some(function (x) { return String(x).toLowerCase() === low; })) out = r.pos;
          });
        });
        return out;
      }
      function isPause(e) { return !!(e && e.code === 'rate-budget'); }
      // Jogos da atleta JÁ acumulados num torneio + mínimo ESPERADO (V+D da linha dela
      // na classificação). Base do skip honesto e da paginação com parada (v1.45).
      function countTid(tid) {
        var n = 0; all.forEach(function (m) { if (m.official && String(m.tourneyId) === String(tid)) n++; });
        return n;
      }
      function expGames(standings, h) {
        var low = String(h || '').toLowerCase(), out = null;
        (standings || []).forEach(function (g) {
          (g.rows || []).forEach(function (r) {
            if (out == null && (r.handles || []).some(function (x) { return String(x).toLowerCase() === low; }) &&
              (r.wins != null || r.losses != null)) out = (r.wins || 0) + (r.losses || 0);
          });
        });
        return out;
      }

      // Orçamento de paciência inicial (provisório); é recalculado logo abaixo, quando o
      // perfil disser quantos jogos/torneios/rankings existem de verdade.
      _rateBudget = _newRateBudget((prior && prior.declaredGames) ? (prior.declaredGames / 3) : 40);

      try {   // ── etapas 1–3: um 'rate-budget' aqui dentro CHECKPOINTA (grava e sai) ──
      // ── ABRE o perfil do jogador NA ABA do letzplay (v1.46 — automático, como o scan
      // antigo). A navegação real resolve o desafio do Cloudflare no contexto da página;
      // sem ela, com o CF desconfiado, os fetches voltavam bloqueados e "não achava nada".
      prog({ phase: 'perfil', note: 'abrindo o perfil de @' + handle + ' no letzplay', pct: 1 });
      await new Promise(function (rNav) {
        try {
          chrome.runtime.sendMessage({ type: 'lp-nav', url: 'https://letzplay.me/' + encodeURIComponent(handle) },
            function () { void chrome.runtime.lastError; rNav(); });
        } catch (eNav) { rNav(); }
      });
      // ── ETAPA 0: TOTAIS do perfil público ("472 Jogos · 29 Rankings · 35 Torneios") —
      // vêm no HTML cru e viram os "de y" das barras (jogos/rankings/torneios).
      prog({ phase: 'perfil', note: 'lendo os totais do perfil', pct: 1 });
      try {
        var dprof = await bgFetchDoc('https://letzplay.me/' + encodeURIComponent(handle));
        var btxt = ((dprof.body && dprof.body.textContent) || '').replace(/\s+/g, ' ');
        var mJ = btxt.match(/(\d+)\s*Jogos/); if (mJ) declaredGamesTotal = +mJ[1];
        var mR = btxt.match(/(\d+)\s*Rankings/); if (mR) declaredRankingsTotal = +mR[1];
        var mT = btxt.match(/(\d+)\s*Torneios/); if (mT) declaredTournTotal = +mT[1];
        prog({ pct: 2, feed: '👤 perfil: ' + (declaredGamesTotal != null ? declaredGamesTotal : '?') + ' jogos · ' + (declaredRankingsTotal != null ? declaredRankingsTotal : '?') + ' rankings · ' + (declaredTournTotal != null ? declaredTournTotal : '?') + ' torneios' });
        // ORÇAMENTO DIMENSIONADO PELO TRABALHO REAL: uma requisição por página de jogos
        // (~13,5 por página), duas por torneio e uma por ranking. É esta conta que faz o
        // perfil de 472 jogos receber paciência de 472 jogos, e não a de 81.
        _rateBudget = _newRateBudget(Math.ceil((declaredGamesTotal || 0) / 13) + 2 * (declaredTournTotal || 0) + (declaredRankingsTotal || 0) + 6);
      } catch (e0) { if (isPause(e0)) throw e0; }
      // ── ETAPA 1: lista de torneios da pessoa (PAGINADA — 35 não cabem numa página).
      // v1.48: lista COMPLETA de rodada anterior é reusada SEM fetch (só relê quando o
      // total declarado do perfil cresceu — torneio novo).
      var priorList = (prior && Array.isArray(prior.tournamentsList)) ? prior.tournamentsList : null;
      function seedFromPriorList() {
        (priorList || []).forEach(function (Pp) {
          if (Pp && Pp.club && Pp.tid) parts.push({ club: Pp.club, tid: Pp.tid, title: Pp.title || '' });
        });
      }
      if (priorList && priorList.length && (declaredTournTotal == null || priorList.length >= declaredTournTotal)) {
        seedFromPriorList();
        prog({ phase: 'torneios', note: 'lista de torneios já gravada (' + parts.length + ') — pulando releitura', pct: 2 });
        if (declaredTournTotal == null) declaredTournTotal = parts.length;
      } else {
      prog({ phase: 'torneios', note: 'lendo a lista de torneios', pct: 2 });
      try {
        var tBase = 'https://letzplay.me/' + encodeURIComponent(handle) + '/tournaments';
        var seenT = {};
        function collectParts(docL) {
          [].slice.call(docL.querySelectorAll('a[href]')).forEach(function (a) {
            var h = a.getAttribute('href') || '';
            var mm = h.match(/^\/([^\/]+)\/tournaments\/(\d+)$/);
            if (!mm || seenT[h]) return; seenT[h] = 1;
            parts.push({ club: mm[1], tid: mm[2], title: (a.textContent || '').replace(/\s+/g, ' ').trim() });
          });
        }
        var dl = await bgFetchDoc(tBase);
        collectParts(dl);
        var tMax = F.detectMaxPage(dl);
        for (var tp = 2; tp <= tMax; tp++) {
          checkDeadline();
          prog({ phase: 'torneios', note: 'lista de torneios — página ' + tp + ' de ' + tMax, pct: 2 });
          collectParts(await bgFetchDoc(tBase + '?page=' + tp));
        }
        if (declaredTournTotal == null && parts.length) declaredTournTotal = parts.length;
      } catch (eT) { if (isPause(eT)) throw eT; }   // sem lista pública → segue pros jogos gerais
      // fetch da lista falhou/veio vazio mas a rodada anterior tinha → usa a gravada
      if (!parts.length && priorList && priorList.length) seedFromPriorList();
      }

      // ── ETAPA 2: por torneio (a lista já vem do mais recente pro mais antigo) ──
      for (var ti = 0; ti < parts.length; ti++) {
        checkDeadline();
        var P = parts[ti], key = 't/' + P.club + '/' + P.tid;
        var labelT = 'torneio ' + (ti + 1) + ' de ' + parts.length;
        var priorDet = priorNames[key] || tourneyDetails[key] || null;
        // SKIP PELO CURSOR: o torneio marcado como concluído numa rodada anterior não é
        // tocado de novo — zero requisição. Antes o "já gravado" tinha que ser DEDUZIDO
        // comparando jogos acumulados com o V+D da classificação, o que só funcionava se
        // as classificações tivessem sobrevivido no doc; quando o doc era enxugado por
        // tamanho, a dedução falhava e a rodada relia tudo de novo, pra sempre.
        if (C.toursDone[key] && priorDet) {
          tourneyDetails[key] = priorDet;
          prog({ phase: 'torneios', note: labelT + ' — já lido, pulando', pct: pctTour(ti + 1) });
          continue;
        }
        // SKIP HONESTO (v1.45): só pula se os jogos gravados ≥ V+D da linha dela na
        // classificação. Antes bastava 1 jogo pra "já gravado, pulando" — a página de
        // jogos do torneio é PAGINADA e só a 1ª era lida, então torneio ficava
        // eternamente com 1-2 jogos (caso Camila: 13 torneios · 15 jogos).
        var expPrior = priorDet ? expGames(priorDet.standings, realHandle) : null;
        if (priorDet && priorDet.standings && countTid(P.tid) > 0 &&
            expPrior != null && countTid(P.tid) >= expPrior) {
          tourneyDetails[key] = priorDet;
          C.toursDone[key] = 1;
          prog({ phase: 'torneios', note: labelT + ' — já gravado, pulando', pct: pctTour(ti + 1) });
          continue;
        }
        // RETOMADA SEM RELER (v1.47, pedido do dono: "não parece estar pulando o já
        // obtido"): nome+classificação de rodada anterior são REUSADOS (zero fetch) —
        // só busca a página do torneio quando ainda não temos a classificação dele.
        if (priorDet && priorDet.standings) {
          tourneyDetails[key] = priorDet;
        } else {
          prog({ phase: 'torneios', note: labelT + ' — nome, categoria e classificação', pct: pctTour(ti) });
          try {
            var dp = await bgFetchDoc('https://letzplay.me/' + P.club + '/tournaments/' + P.tid);
            tourneyDetails[key] = { name: tourneyNameFromDoc(dp), standings: tourneyStandingsFromDoc(dp), logo: tourneyLogoFromDoc(dp) };
          } catch (e1) { if (isPause(e1)) throw e1; tourneyDetails[key] = priorDet || null; }
        }
        // Jogos do torneio: página é de TODOS os participantes → PAGINA até o fim
        // (cap 15 págs) e para cedo quando alcança o V+D esperado da classificação.
        // Se o acumulado JÁ alcança o esperado, nem a página 1 é buscada (retomada).
        // Jogos de playoff além do V+D chegam pela ETAPA 3 (histórico pessoal) e dedupe.
        try {
          var expT = expGames((tourneyDetails[key] || {}).standings, realHandle);
          if (!(expT != null && countTid(P.tid) >= expT)) {
            prog({ phase: 'torneios', note: labelT + ' — lendo os jogos', pct: pctTour(ti) });
            var tmBase = 'https://letzplay.me/' + P.club + '/tournaments/' + P.tid + '/matches';
            var dm = await bgFetchDoc(tmBase);
            addMatches(X.extractMatchesFromDoc(dm, handle));
            var tmMax = Math.min(15, F.detectMaxPage(dm));
            for (var tgp = 2; tgp <= tmMax; tgp++) {
              if (expT != null && countTid(P.tid) >= expT) break;
              checkDeadline();
              prog({ phase: 'torneios', note: labelT + ' — jogos, página ' + tgp + ' de ' + tmMax, pct: pctTour(ti) });
              addMatches(X.extractMatchesFromDoc(await bgFetchDoc(tmBase + '?page=' + tgp), handle));
            }
          }
        } catch (e2) { if (isPause(e2)) throw e2; }
        // FEED: o que acabou de ser lido — nome (com categoria), classificação e nº de jogos.
        var det2 = tourneyDetails[key] || {};
        var nG = 0; all.forEach(function (m) { if (m.official && String(m.tourneyId) === String(P.tid)) nG++; });
        var posMe = myPos(det2.standings, realHandle);
        // CONCLUÍDO = tem classificação e os jogos dela já alcançaram o V+D esperado (ou
        // não há V+D declarado pra cobrar). É o que o cursor grava — a próxima rodada
        // confia nisso e não abre a página de novo.
        var expDone = expGames(det2.standings, realHandle);
        if (det2.standings && (expDone == null || countTid(P.tid) >= expDone)) C.toursDone[key] = 1;
        prog({ phase: 'torneios', pct: pctTour(ti + 1),
          feed: '🏆 ' + (det2.name || P.title || ('torneio ' + P.tid)) + (posMe != null ? (' · ' + posMe + 'º lugar') : '') + ' · ' + nG + ' jogo(s)' });
        postPartial('torneios', ti + 1, parts.length);   // grava a cada torneio
      }

      // ── ETAPA 3: jogos gerais (rankings + torneios fora da lista), recente→antigo ──
      // RETOMA NA PÁGINA DO CURSOR. Antes esta etapa recomeçava SEMPRE na página 1: num
      // perfil de 35 páginas, a rodada seguinte gastava o orçamento inteiro relendo o que
      // já tinha e nunca chegava no fim da lista. Com o cursor, a página 12 continua na 13.
      var base = 'https://letzplay.me/' + encodeURIComponent(handle) + '/matches';
      // Etapa 3 JÁ terminada numa rodada anterior (só faltava o acabamento dos nomes) →
      // não busca nada aqui. Sem isto a retomada pedia a página pagesTotal+1, que não existe.
      var skipStage3 = (C.pagesTotal > 0 && C.pageDone >= C.pagesTotal);
      if (skipStage3) { C.complete = true; prog({ phase: 'jogos', note: 'histórico geral já lido (' + C.pageDone + ' páginas)', pct: 95 }); }
      var startPage = Math.max(1, C.pageDone + 1);
      if (!skipStage3) {
      prog({ phase: 'jogos', note: (startPage > 1 ? ('retomando o histórico na página ' + startPage) : 'abrindo o histórico geral'), pct: pctPage(C.pageDone, C.pagesTotal || 1) });
      // A página 1 é lida SEMPRE quando ainda não há cursor; retomando, a primeira busca é
      // a própria página do cursor (a paginação do letzplay é estável e vem recente→antigo,
      // e o dedupe por chave de conteúdo cobre qualquer deslocamento por jogo novo).
      var d1 = await bgFetchDoc(startPage > 1 ? (base + '?page=' + startPage) : base);
      var cards1 = d1.querySelectorAll('.row.match').length;
      var page1 = X.extractMatchesFromDoc(d1, realHandle);
      if (!page1.length && cards1 > 0) {
        // O @ digitado não casa com os cards → detecta o @ REAL predominante da página
        // (na página de jogos do atleta, é ele). Cobre variação/typo de handle.
        var det = F.detectMe(d1);
        if (det && det.toLowerCase() !== String(realHandle).toLowerCase()) {
          realHandle = det;
          page1 = X.extractMatchesFromDoc(d1, det);
          prog({ phase: 'jogos', note: '@ real detectado: ' + det });
        }
      }
      if (!cards1 && !all.length && !page1.length) { fail('pagina-sem-cards'); return; }
      maxPage = Math.max(F.detectMaxPage(d1), startPage);
      var totG = F.parseTotalGames(d1);
      if (totG != null) declaredGamesTotal = totG;
      var add1 = addMatches(page1);
      lastPageRead = startPage;
      prog({ phase: 'jogos', pct: pctPage(startPage, maxPage), feed: '🎾 página ' + startPage + ' de ' + maxPage + ': +' + add1 + ' jogo(s) · total ' + all.length });
      // Rodada anterior COMPLETA → pode PARAR quando uma página inteira já é conhecida
      // (dali pra trás está tudo gravado). Rodada anterior parcial → lê até o fim.
      var priorComplete = !!(prior && !prior.partialReason && prior.declaredGames != null &&
        (prior.gamesTotal != null ? prior.gamesTotal : (prior.games || []).length) >= prior.declaredGames);
      for (var p = startPage + 1; p <= maxPage; p++) {
        checkDeadline();
        prog({ phase: 'jogos', note: 'página ' + p + ' de ' + maxPage, pct: pctPage(p - 1, maxPage) });
        var d = await bgFetchDoc(base + '?page=' + p);
        var list = X.extractMatchesFromDoc(d, realHandle);
        var added = addMatches(list);
        lastPageRead = p;
        prog({ phase: 'jogos', pct: pctPage(p, maxPage), feed: '🎾 página ' + p + ' de ' + maxPage + ': +' + added + ' jogo(s) · total ' + all.length });
        if (p % 3 === 0) postPartial('jogos', p, maxPage);   // grava a cada 3 páginas
        if (priorComplete && added === 0 && list.length > 0) {
          prog({ phase: 'jogos', note: 'daqui pra trás já está gravado — parando' });
          lastPageRead = maxPage;
          break;
        }
      }
      // Chegou ao fim da lista: as etapas de leitura acabaram. O que falta (nome de
      // ranking) é acabamento e roda no FINAL.
      if (lastPageRead >= maxPage) C.complete = true;
      }   // fim do if (!skipStage3)
      } catch (eStg) {   // fim das etapas 1–3
        // PAUSA (regra do dono, caso Camila 11/20): rate-limit demais → NÃO espera sem
        // fim, NÃO joga fora — grava o que veio e sai avisando pra retomar depois.
        if (isPause(eStg)) { pausado = true; }
        else if (!all.length) { throw eStg; }
        else { parcial = String((eStg && eStg.message) || eStg).slice(0, 100); }
      }
      if (!all.length) { fail('sem-jogos'); return; }

      // ── FINAL: nomes/classificações que ainda faltam (1 fetch por competição SEM nome).
      // Pausado → NÃO busca mais nada; só consolida e entrega o parcial.
      var rawF = buildRawWithDetails();
      if (!pausado) {
        try { await fillTourneyNames(rawF, prog); }
        catch (e) { if (isPause(e)) { pausado = true; C.complete = false; } }
      }
      var impF = I.normalize(rawF, { importedAt: new Date().toISOString() });
      var deltaF = deltaGames(impF);
      impF = stampDeclared(impF);
      if (pausado) impF.partialReason = 'pausado: limite do letzplay — retomando';
      else if (parcial) impF.partialReason = String(parcial).slice(0, 120);
      var v = I.validate(impF);
      if (!v || !v.valid) { fail('invalido'); return; }
      // RELATÓRIO da rodada (pedido do dono): o que PUXOU e o que NÃO puxou — por
      // torneio (nome, classificação, nº de jogos) e nos jogos gerais (páginas/total).
      var report = {
        tournaments: parts.map(function (Pp) {
          var kk = 't/' + Pp.club + '/' + Pp.tid;
          var dd = tourneyDetails[kk] || priorNames[kk] || null;
          var ng = 0; all.forEach(function (m) { if (m.official && String(m.tourneyId) === String(Pp.tid)) ng++; });
          return { title: (dd && dd.name) || Pp.title || ('torneio ' + Pp.tid), got: !!(dd || ng),
            games: ng, pos: dd ? myPos(dd.standings, realHandle) : null };
        }),
        pagesRead: lastPageRead, maxPage: maxPage,
        games: all.length, declared: (impF.declaredGames != null) ? impF.declaredGames : null
      };
      // `done` = não há mais nada pra ler. Quando é false o app dispara a rodada seguinte
      // SOZINHO, com este cursor — o organizador não clica de novo pra continuar.
      var doneAll = !pausado && C.complete === true;
      if (doneAll) { try { chrome.runtime.sendMessage({ type: 'lp-close-scan-tab' }); } catch (e) {} }
      post({ __sp_lp: 'athlete-import-result', tournamentId: tournamentId, uid: uid || null, handle: handle,
        ok: true, done: doneAll, paused: !!pausado, report: report, cursor: impF.lzCursor,
        gamesDelta: deltaF, scan: scanFromImport(realHandle, impF), fullImport: impF });
    } catch (e) {
      var em = String((e && e.message) || e);
      fail(em.slice(0, 140));
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
