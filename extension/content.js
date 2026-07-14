/* content.js — roda no scoreplace.app. Ponte extensão ↔ página + orquestra o IMPORT
 * DIRETO disparado pelo app (sem o usuário clicar no ícone da extensão):
 *   app → postMessage {run-import} → content busca (via background) + extrai + normaliza
 *       → postMessage {import} → letzplay-bridge.js grava e devolve {import-result}.
 * Também: anuncia presença (extension-present) + responde ao ping do app.
 * Libs (_spExtract/_spImport/_spFlow) carregam antes deste arquivo (ver manifest).
 */
(function () {
  var EXT_VERSION = '1.37';

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
  async function bgFetchDoc(url, opts) {
    var last = null;
    for (var i = 0; i < 8; i++) {
      var r = await bgFetchRaw(url, opts);
      if (r && r.ok) return new DOMParser().parseFromString(r.html, 'text/html');
      last = r;
      if (_isRate(r)) {
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
      t = t.replace(/\s*-\s*Letzplay\s*$/i, '').replace(/^Informa[çc][õo]es do Torneio\s+/i, '');
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
    (raw.tournaments || []).forEach(function (t) {
      if (!t.tourneyId || !t.club) return;
      var id = 't/' + t.club + '/' + t.tourneyId;
      if (!seen[id]) { seen[id] = 1; uniq.push({ id: id, type: 't', club: t.club, cid: t.tourneyId, categoryRaw: t.categoryRaw || '' }); }
    });
    (raw.rankings || []).forEach(function (r) {
      if (!r.rankingId || !r.club) return;
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
        standCache[u.id] = (u.type === 't') ? tourneyStandingsFromDoc(d) : rankingStandingsFromDoc(d);
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
    for (var p = 2; p <= maxPage; p++) {
      // avisa a CADA página: sem isto a busca fica minutos em silêncio e parece travada
      if (onProg) onProg({ phase: 'jogos', note: 'página ' + p + ' de ' + maxPage });
      var d = await bgFetchDoc(base + '?page=' + p);   // espaçamento: fila do background
      all = all.concat(X.extractMatchesFromDoc(d, handle));
    }
    if (!all.length) return null;
    if (onProg) onProg({ phase: 'jogos', note: all.length + ' jogos lidos' });
    var raw = F.buildRaw(handle, all);
    try { await fillTourneyNames(raw, onProg); } catch (e) {}
    var imp = I.normalize(raw, { importedAt: new Date().toISOString() });
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
      var total = F.parseTotalGames(doc1);
      var all = X.extractMatchesFromDoc(doc1, me);
      post({ __sp_lp: 'import-progress', done: all.length, total: total });
      for (var p = 2; p <= maxPage; p++) {
        var d = await bgFetchDoc('https://letzplay.me/u/matches/history?page=' + p);   // espaçamento: fila do background
        all = all.concat(X.extractMatchesFromDoc(d, me));
        post({ __sp_lp: 'import-progress', done: all.length, total: total });
      }
      var raw = F.buildRaw(me, all);
      var nameStats = null;
      try { nameStats = await fillTourneyNames(raw); } catch (e) {}   // nome real dos torneios (best-effort)
      var imp = I.normalize(raw, { importedAt: new Date().toISOString() });
      if (nameStats) imp.tourneyNameStats = nameStats;   // observabilidade: X/Y nomes resolvidos
      var v = I.validate(imp);
      if (!v.valid) { post({ __sp_lp: 'import-result', ok: false, error: 'invalido' }); return; }
      post({ __sp_lp: 'import-progress', done: all.length, total: total, saving: true });
      // entrega pro bridge gravar; ele devolve o {import-result} final (ok/erro do Firestore).
      post({ __sp_lp: 'import', letzplayImport: imp });
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
