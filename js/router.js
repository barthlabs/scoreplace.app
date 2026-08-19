function initRouter() {
  // Disable browser scroll restoration — we manage scroll ourselves. Without
  // this, bfcache + hashchange combinations let the browser repopulate scrollY
  // AFTER our jump-to-top runs, leaving Voltar looking broken.
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch(e) {}

  const links = document.querySelectorAll('.nav-link');
  // v1.0.42-beta: var (não const) pra permitir re-fetch defensivo no handleRoute
  // se elemento #view-container não existe no boot inicial (race rara em
  // iOS Chrome Mobile reportada via Sentry).
  var viewContainer = document.getElementById('view-container');

  // Restore invited IDs from sessionStorage (survives page reloads)
  try {
    var saved = sessionStorage.getItem('_invitedTournamentIds');
    if (saved && window.AppStore) {
      var ids = JSON.parse(saved);
      ids.forEach(function(id) {
        if (window.AppStore._invitedTournamentIds.indexOf(id) === -1) {
          window.AppStore._invitedTournamentIds.push(id);
        }
      });
    }
  } catch(e) {}

  // Detecta prerender estático no DOM (gerado por tools/prerender-landing.js).
  // Se presente E primeira rota for landing-eligible (logged-out, dashboard),
  // pulamos o re-render pra evitar flicker prerendered → blank → re-render.
  // Marcado como "consumido" após a primeira rota — qualquer navegação
  // subsequente segue o flow normal (innerHTML limpo + render).
  var _hasPrerender = false;
  try {
    var vcInit = document.getElementById('view-container');
    _hasPrerender = !!(vcInit && vcInit.innerHTML.indexOf('prerender:start') !== -1);
  } catch (e) {}
  var _firstRoute = true;

  const handleRoute = () => {
    const hash = window.location.hash || '#dashboard';
    // Selo de diagnóstico do sorteio (SANDBOX) não pode sobreviver à troca de tela — ele só
    // se auto-removia no próximo _dtrace, então ficava por cima da dashboard. Ver store.js.
    try { if (typeof window._syncDrawTraceBadge === 'function') window._syncDrawTraceBadge(); } catch (e) {}
    const hashPath = hash.substring(1);
    const parts = hashPath.split('/');
    const view = parts[0];
    const param = parts[1] || null;

    // --- Preserve ?ref= invite referrer (hash OU query string) ---
    // O convite do APP gera `…/?ref=UID` (ref na query, sem hash); o convite de
    // TORNEIO gera `#tournaments/id?ref=UID` (ref no hash). Ler os DOIS — antes
    // só o hash era lido, então o convite do app nunca criava a amizade.
    var _refMatch = hash.match(/[?&]ref=([^&]+)/);
    if (!_refMatch && window.location.search) _refMatch = window.location.search.match(/[?&]ref=([^&]+)/);
    if (_refMatch) {
      try {
        var _refUidVal = decodeURIComponent(_refMatch[1]);
        var _cuRef = window.AppStore && window.AppStore.currentUser;
        if (_cuRef && (_cuRef.uid || _cuRef.email) && typeof window._autoFriendOnInvite === 'function') {
          // já logado: cria a amizade na hora (não passa pelo login pós-convite)
          try { window._autoFriendOnInvite(_refUidVal, _cuRef); } catch(e) {}
        } else {
          // ainda não logado: guarda pro consumo pós-login (auth.js)
          sessionStorage.setItem('_inviteRefUid', _refUidVal);
        }
      } catch(e) {}
    }
    // Clean param from query string if present
    var cleanParam = param ? param.split('?')[0] : null;

    // --- Track invited tournament IDs for visibility (memory + sessionStorage) ---
    if (view === 'tournaments' && cleanParam && window.AppStore) {
      if (window.AppStore._invitedTournamentIds.indexOf(cleanParam) === -1) {
        window.AppStore._invitedTournamentIds.push(cleanParam);
      }
      try {
        sessionStorage.setItem('_invitedTournamentIds', JSON.stringify(window.AppStore._invitedTournamentIds));
      } catch(e) {}
    }

    // --- Auth gate: salva o torneio só pra LEVAR o usuário até ele pós-login ---
    // Visitante deslogado abre #tournaments/<id> → guarda o id pra, depois do
    // login, NAVEGAR de volta à página do torneio. v2.3.88: NÃO inscreve mais
    // nada automaticamente — o consumo desse flag (auth.js) só faz navegar; a
    // inscrição SEMPRE exige clique em "Inscrever-se". Portanto guardar o id é
    // inofensivo (no máximo re-navega pra mesma página no cold start).
    var _isLoggedInEarly = !!(window.AppStore && window.AppStore.currentUser);
    if (!_isLoggedInEarly && view === 'tournaments' && cleanParam) {
      try { sessionStorage.setItem('_pendingEnrollTournamentId', cleanParam); } catch(e) {}
    }

    // ── JÁ LOGADO CHEGANDO POR CONVITE → JÁ INSCREVE (v1.8.33) ────────────────
    // Ordem do dono (12/ago/2026): _"mesmo que seja conta cadastrada. clicou em
    // convite de torneio já inscreve. sem precisar clicar no inscrever-se"_.
    // Este é o caminho que o auth.js NÃO alcança: quem já está logado não passa
    // por login nenhum, então `simulateLoginSuccess` nunca roda pra ele.
    // ⚠️ Exige `_refUidVal` — ou seja, um CONVITE de verdade. Abrir
    // `#tournaments/<id>` sem ref não inscreve ninguém, que é precisamente o
    // gatilho largo demais responsável pelo bug de jun/2026 (conta re-inscrita
    // todo dia). A trava de UM TIRO SÓ e o resto da decisão moram dentro de
    // `_autoEnrollFromInvite` — aqui só se informa que houve convite.
    if (_isLoggedInEarly && view === 'tournaments' && cleanParam && _refUidVal &&
        typeof window._autoEnrollFromInvite === 'function') {
      try { window._autoEnrollFromInvite(cleanParam, _refUidVal); } catch(e) {}
    }

    links.forEach(l => {
      l.classList.remove('active');
      if (l.getAttribute('href') === hash) l.classList.add('active');
    });

    // Prerender preservation: se primeira rota E HTML estático presente E
    // landing-eligible (logged-out, dashboard), NÃO limpa o innerHTML.
    // Detectado abaixo no landing gate; aqui só pula o clear.
    var _isLoggedInForPrerenderCheck = !!(window.AppStore && window.AppStore.currentUser);
    var _hasAuthCacheForPrerenderCheck = false;
    try { _hasAuthCacheForPrerenderCheck = !!localStorage.getItem('scoreplace_authCache'); } catch(e) {}
    var _shouldPreservePrerender = _firstRoute && _hasPrerender &&
      !_isLoggedInForPrerenderCheck && !_hasAuthCacheForPrerenderCheck &&
      (view === '' || view === 'dashboard');

    // v1.0.42-beta: defensive re-fetch pro viewContainer. Reportado via
    // Sentry: "TypeError: null is not an object (evaluating
    // 'viewContainer.innerHTML = '')" em iOS Chrome Mobile. Race rara onde
    // o elemento #view-container não existia no momento de initRouter.
    // Re-fetch defensivo aqui — se ainda null, bail silencioso pra não
    // quebrar a app.
    if (!viewContainer) viewContainer = document.getElementById('view-container');
    if (!viewContainer) {
      window._warn('[router] view-container missing on handleRoute — aborting');
      return;
    }
    // ── RE-ENTRADA NA MESMA ROTA = SOFT-REFRESH (1.9.74) ─────────────────────
    // Relato do dono: _"carrega, mostra uns instantes, volta a carregar, mostra de
    // novo, volta a carregar. varias vezes. uma merda total."_
    // MEDIDO: initRouter() é chamado de ~19 lugares — só o fluxo de auth re-chama
    // ~10 vezes enquanto login/perfil/merge resolvem, e i18n mais uma. Cada chamada
    // caía aqui com a MESMA hash e era tratada como NAVEGAÇÃO nova: o container era
    // ESVAZIADO (flash preto), o overlay "Carregando…" subia POR CIMA da tela já
    // pintada, e a view renderizava do zero com scroll no topo. Era essa a
    // metralhadora de loading.
    // A decisão mora AQUI, ANTES do esvaziamento (medido: decidir depois nunca via
    // conteúdo — o próprio router já tinha apagado tudo). Se a rota (hash+uid+
    // idioma) é a MESMA da última pintura e a tela TEM conteúdo: (1) NÃO esvazia —
    // a view escreve o innerHTML inteiro por cima quando renderizar; (2) a passada
    // vira _isSoftRefresh (setado logo antes do try, onde o finally garante
    // restauração) e todos os gates "Só em NAVEGAÇÃO" que já existem passam a
    // valer (sem loader, sem scroll-pro-topo, sem recolher seções).
    // ⚠️ uid e idioma entram na chave de propósito: login/logout e troca de língua
    // na mesma hash são navegações DE VERDADE (a tela muda de natureza).
    var _rotaKey = hash + '|' + ((window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid) || '') + '|' + (window._lang || '');
    var _reentrada = (window._ultimaRotaPintada === _rotaKey) && !!viewContainer.firstElementChild;
    if (!_shouldPreservePrerender && !_reentrada) {
      viewContainer.innerHTML = '';
    }
    const fixedBar = document.getElementById('bracket-fixed-scrollbar');
    if (fixedBar) fixedBar.remove();

    // v1.0.4-beta: NÃO fechar hamburger em soft-refresh.
    // Bug reproduzido via Chrome MCP: usuário abre menu → Firestore listener
    // dispara onSnapshot → _softRefreshView() → initRouter() → fechava menu.
    // Stack trace: handleRoute (router.js:84) ← initRouter ← _softRefreshView.
    // Sintoma reportado: "menu abre e fecha rapidamente na 1ª vez" (snapshots
    // iniciais chegam ~0.5-2s pós-load — janela do clique do usuário).
    // Soft-refresh re-renderiza a MESMA view; usuário não navegou; menu deve
    // permanecer aberto.
    if (typeof window._closeHamburger === 'function' && !window._isSoftRefresh) {
      window._closeHamburger();
    }

    // Dismiss any overlay that could survive navigation and mask the new view
    // (including Voltar) — TV mode, set-scoring, QR, player-stats and any
    // standard .modal-overlay.active are all handled by one helper.
    if (typeof window._dismissAllOverlays === 'function') {
      window._dismissAllOverlays();
    }

    // On soft refresh (remote data update), skip scroll reset and fade animation
    // to preserve user's current position and avoid visual disruption.
    // Também pulamos a animação se preservando prerender — caso contrário o
    // opacity:0 inicial faria o prerender "piscar" antes da animação de fade,
    // empurrando o LCP da paint estática (~200ms) pra fim da animação (~700ms+).
    if (!window._isSoftRefresh && !_shouldPreservePrerender) {
      // Jump to top (instant) ao navegar para nova view.
      // Um único scrollTo síncrono é suficiente — timeouts repetidos
      // brigavam com scrolls intencionais (ex: auto-scroll para pendentes).
      try { window.scrollTo(0, 0); } catch(e) {}
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;

      // Fade-in animation
      viewContainer.style.opacity = '0';
      viewContainer.style.transition = 'opacity 0.25s ease-in';
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          viewContainer.style.opacity = '1';
        });
      });
    }

    // Landing page gate — v1.3.39-beta: gate completo que nunca mostra a
    // landing prematuramente enquanto o Firebase ainda está rehydratando do
    // IndexedDB (~200-500ms). Lógica em camadas:
    //
    //  1. Logado → segue para a view normalmente (nenhuma landing)
    //  2. Não logado + authCache → spinner enquanto Firebase rehydrata
    //  3. Não logado + sem cache + Firebase NÃO resolveu → spinner +
    //     fallback de 3 s para o caso do Firebase nunca resolver
    //     (ex: offline total, script error)
    //  4. Não logado + sem cache + Firebase resolveu null → renderiza landing
    //
    // Este fluxo cobre o caso crítico de iOS Safari que limpa o localStorage
    // periodicamente: sem cache, mas o Firebase ainda tem sessão no IndexedDB.
    // O usuário NÃO deve ver a landing — apenas o spinner por ~300 ms até o
    // onAuthStateChanged resolver com o usuário de volta.
    var _isLoggedInNow = !!(window.AppStore && window.AppStore.currentUser);
    var _hasAuthCacheNow = false;
    try { _hasAuthCacheNow = !!localStorage.getItem('scoreplace_authCache'); } catch(e) {}
    window._log('[scoreplace-router] route', hash, 'loggedIn:', _isLoggedInNow, 'authCache:', _hasAuthCacheNow, 'authResolved:', !!window._authStateResolved);

    // v2.1.94-beta: gate expandido para TODAS as rotas. Usuário não logado
    // nunca vê dados de torneio (evita confusão com dados desatualizados).
    // Exceções: #terms, #privacy e #delete-account (páginas legais sempre públicas).
    var _isLegalView = (view === 'privacy' || view === 'terms' || view === 'delete-account');
    if (!_isLoggedInNow && !_isLegalView && typeof renderLanding === 'function') {

      if (_hasAuthCacheNow) {
        if (window._authStateResolved) {
          // v1.3.81-beta: authCache existe mas Firebase confirmou null (sessão
          // expirada / stale cache). Limpar cache e cair para renderizar landing
          // — sem precisar chamar initRouter() de fora, o que fecharia o hamburger.
          try { localStorage.removeItem('scoreplace_authCache'); } catch(e) {}
          // Não retorna — cai no bloco de renderização da landing abaixo.
        } else {
          // Cache presente, Firebase ainda não resolveu (pode ser sessão real
          // no IndexedDB com localStorage limpo pelo iOS) → spinner.
          // onAuthStateChanged chamará initRouter() quando resolver.
          // v2.4.74: durante TODO o boot (window._bootInProgress), NÃO renderiza
          // o loader antigo — nem atrás do splash. Antes checávamos só o
          // elemento do splash no DOM; se o splash sumia cedo (janela do login
          // em que _authStateResolved já é true mas currentUser ainda não), o
          // loader antigo vazava e piscava. Com _bootInProgress o velho nunca
          // aparece na abertura, independente do timing do splash.
          viewContainer.innerHTML = window._bootInProgress
            ? ''
            : ((typeof window._renderBallLoader === 'function')
              ? window._renderBallLoader('Carregando…', { minHeight: '60vh', bar: true })
              : '<div style="text-align:center;padding:60vh 0 0;">Carregando…</div>');
          _firstRoute = false;
          return;
        }
      }

      if (!window._authStateResolved) {
        // Sem cache mas Firebase ainda não respondeu — pode ser usuário
        // com sessão no IndexedDB mas localStorage limpo pelo iOS.
        // Mostra spinner e aguarda até 3 s pelo onAuthStateChanged.
        // v2.4.74: idem — durante o boot, o loader antigo nunca é desenhado.
        viewContainer.innerHTML = window._bootInProgress
          ? ''
          : ((typeof window._renderBallLoader === 'function')
            ? window._renderBallLoader('Carregando…', { minHeight: '60vh', bar: true })
            : '<div style="text-align:center;padding:60vh 0 0;">Carregando…</div>');
        clearTimeout(window._authNoCacheFallback);
        window._authNoCacheFallback = setTimeout(function() {
          window._authNoCacheFallback = null;
          // Se Firebase ainda não respondeu após 3 s, assume null e renderiza landing
          if (!window.AppStore || !window.AppStore.currentUser) {
            window._authStateResolved = true;
            if (typeof initRouter === 'function') initRouter();
          }
        }, 3000);
        _firstRoute = false;
        return;
      }

      // Firebase resolveu com null → renderizar landing
      // Prerender: se primeira rota E HTML estático já está visível, NÃO
      // limpa nem re-renderiza — evita flicker. Próxima navegação volta
      // ao flow normal.
      if (_firstRoute && _hasPrerender) {
        window._log('[scoreplace-router] → preserving prerendered LANDING (skip re-render)');
        _firstRoute = false;
        return;
      }
      window._log('[scoreplace-router] → rendering LANDING (not logged in, auth resolved null)');
      renderLanding(viewContainer);
      _firstRoute = false;
      return;
    }
    _firstRoute = false;

    // A re-entrada foi decidida LÁ EM CIMA (antes do esvaziamento do container);
    // aqui — onde o finally do try garante a restauração — a passada vira soft.
    var _prevSoftRefresh = window._isSoftRefresh;
    if (_reentrada) window._isSoftRefresh = true;

    // v2.8.82: marca render via NAVEGAÇÃO. Render functions checam isso pra NÃO
    // auto-preservar scroll aqui (o router já fez scrollTo(0,0) em navegação ou
    // preservou em soft-refresh). Limpa no próximo tick — fora do router (re-render
    // por ação) o flag fica false → as funções preservam o scroll do usuário.
    window._inRouterRender = true;
    setTimeout(function() { window._inRouterRender = false; }, 0);

    // ── v1.8.98: RENDER QUE FALHA NÃO PODE VIRAR TELA PRETA ─────────────────
    // Relato do dono (app nativo): "mostra a dash e tela preta. volta, ok. entra nas
    // notificacoes ok, sai e volta pra dash tela preta."
    //
    // A CAUSA ESTRUTURAL está logo acima: o router ESVAZIA o `#view-container` e SÓ
    // DEPOIS chama o render. Se o render lança, ninguém repõe nada — sobra o container
    // vazio, que no tema escuro é exatamente uma TELA PRETA. E como o erro morre sem
    // `catch`, não vai pro Sentry: fica sem rastro, e foi por isso que eu não achei o
    // defeito olhando log nenhum.
    //
    // O `try` aqui não conserta o bug que lança — ele garante que QUALQUER falha de
    // render vire uma tela que DIZ o que aconteceu, com o erro no Sentry e um caminho
    // de volta. Tela preta muda deixa de ser um desfecho possível.
    try {
    switch (view) {
      case '':
      case 'dashboard':
        // v1.8.78: "Novidades no seu torneio" e "Seus últimos resultados" voltam
        // RECOLHIDAS (só o jogo mais recente) sempre que se CHEGA na dashboard vindo
        // de outra tela — ordem do dono. A escolha de abrir vale só enquanto se está
        // aqui: apagando a chave, o default (fechada) volta a valer no próximo render.
        // ⚠️ Só em NAVEGAÇÃO: `_isSoftRefresh` marca o re-render disparado pelo
        // onSnapshot do Firestore, e recolher ali fecharia a seção embaixo do dedo de
        // quem está lendo, sem ninguém ter saído da tela.
        if (!window._isSoftRefresh) {
          try {
            localStorage.removeItem('scoreplace_collapse_novidades');
            localStorage.removeItem('scoreplace_collapse_myresults');
          } catch (e) {}
        }
        // ── A DASHBOARD TAMBÉM É ENTREGUE PRONTA (1.9.45) ──────────────────────
        // Ordem do dono: _"usa a merda do carregando para entregar a pagina pronto"_.
        // A tela pinta e DEPOIS quatro blocos assíncronos caem por cima dela — movimento
        // nos locais, banner de vínculo casual, presença ativa, "ao vivo agora" —, cada um
        // empurrando a lista pra baixo. É isso que faz o toque errar o card (o dedo mira,
        // a lista anda, o clique cai no vazio: o "triplo clique") e o que se vê como
        // piscada na abertura. Enquanto isso assenta, o CARREGANDO fica por cima.
        // ⚠️ TETO CURTO E DURO (1,2s): esta é a tela inicial do app; loader presa aqui é
        // pior que qualquer piscada. Se os blocos demorarem, a tela aparece do mesmo jeito.
        if (!window._isSoftRefresh && typeof window._showLoading === 'function') {
          try { window._showLoading('Carregando…'); } catch (e) {}
          var _saiuDash = false;
          var _fecharDash = function () {
            if (_saiuDash) return; _saiuDash = true;
            if (typeof window._hideLoading === 'function') { try { window._hideLoading(); } catch (e) {} }
          };
          setTimeout(_fecharDash, 1200);
          if (window._medirTrecho) window._medirTrecho('rota-dash', function () { renderDashboard(viewContainer); }); else renderDashboard(viewContainer);
          // sai quando o perfil chegou (é ele que destrava os blocos) + 2 quadros pra eles
          // pintarem; ou no teto acima, o que vier primeiro.
          var _apos = function () {
            requestAnimationFrame(function () { requestAnimationFrame(_fecharDash); });
          };
          if (window._profileLoaded) _apos();
          else document.addEventListener('scoreplace:profile-loaded', _apos, { once: true });
        } else {
          if (window._medirTrecho) window._medirTrecho('rota-dash', function () { renderDashboard(viewContainer); }); else renderDashboard(viewContainer);
        }
        break;
      case 'tournament':
      case 'tournaments':
        if (cleanParam) {
          // Scroll-pro-meu-jogo (CANÔNICO): captura a NAVEGAÇÃO aqui — síncrono, no momento
          // do route, onde _isSoftRefresh é confiável. Token DURÁVEL (não é resetado em
          // setTimeout como _inRouterRender): renderBracket roda async depois de carregar o
          // torneio e consome quando os cards existem — timing-independente (antes só rolava
          // com cache; sem cache o render vinha depois do reset e não rolava). Soft-refresh
          // (onSnapshot → initRouter) NÃO seta → re-render não re-scrolla.
          if (!window._isSoftRefresh) window._navScrollTid = String(cleanParam);
          // ── A TELA DO TORNEIO TAMBÉM É ENTREGUE PRONTA (1.9.49) ────────────────
          // Até aqui esta rota era a ÚNICA sem loader: a dashboard (acima) segura o
          // "Carregando" enquanto monta, e o torneio — que é a tela CARA — entrava
          // direto no render síncrono. Daí o relato do dono: _"clica e fica parado
          // sem feedback"_.
          // ⚠️ DOIS QUADROS ANTES DO RENDER, e isto é o ponto: mostrar o loader e
          // chamar o render no MESMO quadro não mostra nada — o navegador só pinta
          // quando a thread devolve o controle, e o render pesado não devolve. O
          // loader existia e nunca chegava à tela. Ceder 2 quadros custa ~32ms e é
          // a diferença entre "travou" e "está abrindo".
          // Só em NAVEGAÇÃO: soft-refresh (onSnapshot) segue síncrono, senão a tela
          // de quem está lendo pisca a cada placar alheio.
          if (!window._isSoftRefresh && typeof window._showLoading === 'function') {
            try { window._showLoading('Abrindo o torneio…'); } catch (e) {}
            window._spLoadingOwnedByNav = false; // a rota assumiu; a marca já serviu
            var _saiuTour = false;
            var _fecharTour = function () {
              if (_saiuTour) return; _saiuTour = true;
              if (typeof window._hideLoading === 'function') { try { window._hideLoading(); } catch (e) {} }
            };
            // teto de segurança: loader preso é pior que abertura feia. O backstop
            // global de 15s do _showLoading continua valendo por baixo deste.
            setTimeout(_fecharTour, 6000);
            var _pintaTorneio = function () {
              try {
                if (window._medirTrecho) window._medirTrecho('rota-torneio', function () { renderTournaments(viewContainer, cleanParam); });
                else renderTournaments(viewContainer, cleanParam);
              }
              finally {
                // sai só depois de a tela montada ter tido um quadro pra pintar
                requestAnimationFrame(function () { requestAnimationFrame(_fecharTour); });
              }
            };
            // 1.9.75 — CORRIDA rAF × timeout (com trava de uma vez): rAF não dispara em
            // aba de fundo nem quando o compositor está ocupado — a tela ficava no
            // loader até o teto de 6s. O timeout garante a pintura em ≤120ms.
            var _pintouTorneio = false;
            var _pintaUmaVez = function () {
              if (_pintouTorneio) return; _pintouTorneio = true;
              _pintaTorneio();
            };
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(function () { requestAnimationFrame(_pintaUmaVez); });
              setTimeout(_pintaUmaVez, 120);
            } else {
              setTimeout(_pintaUmaVez, 32);
            }
          } else {
            renderTournaments(viewContainer, cleanParam);
          }
        } else {
          window.location.replace('#dashboard');
        }
        break;
      case 'pair':
        // v2.7.94: deep-link dos botões Aceitar/Recusar (email/WhatsApp).
        // #pair/<accept|reject>/<tId>/<reqId> → executa a ação e pula pro card.
        if (typeof window._pairActionFromLink === 'function') {
          window._pairActionFromLink(parts[1], parts[2], parts[3]);
        } else {
          window.location.hash = '#tournaments/' + (parts[2] || '');
        }
        break;
      case 'cohost':
        // v2.8.52: deep-link dos botões Aceitar/Recusar do convite de co-organização.
        // #cohost/<accept|reject>/<tId>/<type> → executa a ação e abre o torneio.
        if (typeof window._coHostActionFromLink === 'function') {
          window._coHostActionFromLink(parts[1], parts[2], parts[3]);
        } else {
          window.location.hash = '#tournaments/' + (parts[2] || '');
        }
        break;
      case 'bracket':
        // v2.0.8: a página de chaveamento standalone foi removida. Toda
        // referência a #bracket/:id redireciona pro DETALHE do torneio
        // (#tournaments/:id) e rola até a seção de chaveamento, que já existe
        // inline lá. renderBracket continua existindo (usado inline no detalhe).
        if (cleanParam) {
          try { sessionStorage.setItem('sp_bracketScroll', JSON.stringify({ tId: String(cleanParam), matchId: null })); } catch (e) {}
          window.location.hash = '#tournaments/' + cleanParam;
        } else {
          window.location.hash = '#dashboard';
        }
        break;
      case 'match':
        // FASE B (project_match_result_docs): #match/:tId/:matchId → tela leve de
        // UM jogo, lendo só o subdoc results/{matchId} (sem carregar o torneio).
        if (cleanParam && typeof window.renderMatchPage === 'function') {
          var _mMatchId = (parts[2] || '').split('?')[0];
          window.renderMatchPage(viewContainer, cleanParam, _mMatchId);
        } else {
          window.location.hash = '#dashboard';
        }
        break;
      case 'formato':
        // v4.4.x — configurador ÚNICO de formato (reescrita). #formato/:tId
        if (cleanParam && typeof window.renderFormatoPage === 'function') {
          window.renderFormatoPage(viewContainer);
        } else {
          window.location.hash = '#dashboard';
        }
        break;
      case 'participants':
        renderParticipants(viewContainer, cleanParam);
        break;
      case 'rules':
        renderRules(viewContainer, cleanParam);
        break;
      case 'explore':
        renderExplore(viewContainer);
        break;
      case 'notifications':
        renderNotifications(viewContainer);
        break;
      // 🔴 #live/<id> — assistir um placar ao vivo (modo espectador). Rota própria pra
      // que o convite do sininho e o e-mail levem direto ao jogo, sem passar pela lista.
      case 'live':
        if (cleanParam && typeof window._openLiveSpectator === 'function') {
          window.location.replace('#dashboard');
          setTimeout(function () { window._openLiveSpectator(cleanParam); }, 60);
          return;
        }
        window.location.replace('#dashboard');
        return;

      case 'casual':
        if (cleanParam && typeof window._renderCasualJoin === 'function') {
          window._renderCasualJoin(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'presence':
        if (typeof window.renderPresence === 'function') {
          window.renderPresence(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'venues':
      case 'place':
        // `#place` é o alias oficial do botão "Place" do dashboard (v0.16.3+).
        // `#venues` continua funcionando para deep-links antigos.
        if (typeof window.renderVenues === 'function') {
          window.renderVenues(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'my-venues':
        if (typeof window.renderMyVenues === 'function') {
          window.renderMyVenues(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'profile':
        if (typeof window.renderProfilePage === 'function') {
          window.renderProfilePage(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'analise':
        // v1.3.9-beta: Análise de Inscritos como page-route. Param é o tId.
        if (typeof window.renderEnrollmentReportPage === 'function' && cleanParam) {
          window.renderEnrollmentReportPage(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'categorias':
        // v1.3.12-beta: Category Manager como page-route. Param é o tId.
        if (typeof window.renderCategoryManagerPage === 'function' && cleanParam) {
          window.renderCategoryManagerPage(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'comunicados':
        // v4.0.90: "Comunicar Inscritos" + "Comunicados" consolidados. Param é o tId.
        if (typeof window.renderComunicadosPage === 'function' && cleanParam) {
          window.renderComunicadosPage(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'participantes':
        // v4.0.90: "+ Participante" + "Placeholders" consolidados. Param é o tId.
        if (typeof window.renderAddParticipantPage === 'function' && cleanParam) {
          window.renderAddParticipantPage(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'help':
        // v1.3.11-beta: ajuda como page-route. Antes era modal-overlay.
        if (typeof window.renderHelpPage === 'function') {
          window.renderHelpPage(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'novo-torneio':
        // v1.3.13-beta: criar/editar torneio como page-route. Pre-population
        // dos campos (form.reset, sport, prefill) já aconteceu antes da
        // navegação — renderCreateTournamentPage move .modal pro container
        // preservando valores.
        if (typeof window.renderCreateTournamentPage === 'function') {
          window.renderCreateTournamentPage(viewContainer, param);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'support':
        if (typeof window.renderSupportPage === 'function') {
          window.renderSupportPage(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'invite':
        if (typeof window.renderInvitePage === 'function') {
          window.renderInvitePage(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'privacy':
        if (typeof window.renderPrivacy === 'function') {
          window.renderPrivacy(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'terms':
        if (typeof window.renderTerms === 'function') {
          window.renderTerms(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'delete-account':
        if (typeof window.renderDeleteAccount === 'function') {
          window.renderDeleteAccount(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'trofeus':
        if (typeof window.renderTrophiesPage === 'function') {
          window.renderTrophiesPage(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'arbitros':
        // v1.6.1-beta: página de árbitros do torneio. Param é o tId.
        if (typeof window.renderArbitrosPage === 'function' && cleanParam) {
          window.renderArbitrosPage(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'historico':
        // Histórico de jogos unificado (LetzPlay importado + Scoreplace), cronológico + filtros.
        if (typeof window._renderHistoricoPage === 'function') {
          window._renderHistoricoPage(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'importar-letzplay':
        // Fluxo guiado de importação do letzplay (detecção da extensão + passo a passo).
        if (typeof window._renderImportarLetzplayPage === 'function') {
          window._renderImportarLetzplayPage(viewContainer);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      case 'fase-final':
        // v2.6.31: playoff de Liga removido (módulo tournaments-playoff.js deletado —
        // nenhum torneio no banco usava). A fase final agora é uma fase do construtor
        // de fases. Deep-links antigos de #fase-final caem no dashboard.
        window.location.replace('#dashboard');
        return;
      default:
        // Rota desconhecida — redireciona para dashboard
        window.location.replace('#dashboard');
        return;
    }
    } catch (_erroRender) {
      // Reporta ANTES de desenhar: se o próprio desenho de erro falhar, o Sentry
      // já tem o original — que é o que interessa pra consertar.
      try {
        if (typeof window._captureException === 'function') {
          window._captureException(_erroRender, { tags: { view: String(view || 'dashboard') } });
        }
        window._warn('[router] render de "' + view + '" falhou:', _erroRender);
      } catch (_e2) {}
      try {
        var _msg = (_erroRender && _erroRender.message) ? String(_erroRender.message) : 'erro desconhecido';
        viewContainer.innerHTML =
          '<div style="max-width:520px;margin:2.5rem auto;padding:1.25rem;text-align:center;' +
          'background:var(--bg-card,#1e2235);border:1px solid var(--border-color,#333);border-radius:14px;">' +
            '<div style="font-size:2rem;line-height:1;margin-bottom:10px;">😕</div>' +
            '<div style="font-size:1rem;font-weight:800;color:var(--text-bright,#fff);margin-bottom:6px;">' +
              'Não consegui desenhar esta tela</div>' +
            '<div style="font-size:0.86rem;color:var(--text-muted,#94a3b8);line-height:1.5;margin-bottom:14px;">' +
              'O problema já foi reportado. Você pode tentar de novo ou voltar ao início.</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted,#94a3b8);opacity:0.8;font-family:ui-monospace,Menlo,monospace;' +
            'word-break:break-word;margin-bottom:16px;">' + (window._safeHtml ? window._safeHtml(_msg) : _msg) + '</div>' +
            '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
              '<button class="btn" style="background:var(--primary-color,#007aff);color:#fff;border:none;' +
              'padding:10px 20px;border-radius:10px;font-weight:700;cursor:pointer;" ' +
              'onclick="window.location.reload()">Tentar de novo</button>' +
              '<button class="btn" style="background:transparent;color:var(--text-main,#ddd);' +
              'border:1px solid var(--border-color,#444);padding:10px 20px;border-radius:10px;' +
              'font-weight:600;cursor:pointer;" onclick="window.location.hash=\'#dashboard\'">Início</button>' +
            '</div>' +
          '</div>';
      } catch (_e3) {}
    } finally {
      // Carimba a rota pintada e devolve o flag — inclusive nos `return` do meio do
      // switch e no erro de render (a próxima re-entrada da MESMA rota reconcilia
      // por cima, o que é exatamente o desejado).
      window._ultimaRotaPintada = _rotaKey;
      window._isSoftRefresh = _prevSoftRefresh;
    }

    // ── 4ª ENCARNAÇÃO DA TELA PRETA: A JANELA ENTRE ESVAZIAR E PINTAR ──────────
    // Relato do dono (17/ago/2026): "abrir a dash e tela preta E VOLTA". O "e volta"
    // é a assinatura do defeito: não há exceção (o Sentry ficou mudo, e a guarda
    // acima só pega EXCEÇÃO), não há travamento — o container é esvaziado lá em cima
    // e fica VAZIO até alguém escrever nele. Enquanto isso o que se vê é o fundo da
    // página, ou seja, preto. Depois o dado chega, re-renderiza, e "volta".
    //
    // Cada encarnação anterior travou o seu próprio MECANISMO e o sintoma voltou por
    // outro caminho. Esta guarda não olha mecanismo nenhum: ela olha o RESULTADO.
    // Se depois de renderizar o container está vazio, isso já é a tela preta — e aí
    // pinta o "Carregando", que é honesto (o dado não chegou) e nunca é preto.
    // Um render posterior sobrescreve isto normalmente, porque toda view escreve o
    // container inteiro.
    try {
      if (viewContainer && !viewContainer.firstChild) {
        viewContainer.innerHTML =
          '<div class="sp-view-vazia" style="display:flex;flex-direction:column;align-items:center;' +
          'justify-content:center;gap:12px;min-height:50vh;color:var(--text-muted,#94a3b8);">' +
            '<div style="width:26px;height:26px;border:3px solid var(--border-color,#333);' +
            'border-top-color:var(--primary-color,#007aff);border-radius:50%;' +
            'animation:sp-gira 0.8s linear infinite;"></div>' +
            '<div style="font-size:0.9rem;font-weight:600;">Carregando…</div>' +
          '</div>' +
          '<style>@keyframes sp-gira{to{transform:rotate(360deg)}}</style>';
      }
    } catch (_e4) {}
  };

  if (window._routerHandler) {
    window.removeEventListener('hashchange', window._routerHandler);
  }
  window._routerHandler = handleRoute;
  // ── UM listener de hashchange, SEMPRE (1.9.74) ─────────────────────────────
  // initRouter() é chamado de ~19 lugares (auth re-chama ~10x no login) e CADA
  // chamada registrava MAIS UM listener — eles acumulavam, e toda navegação
  // passava a rodar handleRoute N vezes (a tela do torneio leva ~2,5s pra pintar;
  // ×N é o "demora e recarrega várias vezes" no aparelho). Registro único: o
  // listener velho sai e entra o closure NOVO (que enxerga o viewContainer e o
  // estado mais recentes).
  if (window._spHashRouteListener) {
    try { window.removeEventListener('hashchange', window._spHashRouteListener); } catch (e) {}
  }
  window._spHashRouteListener = handleRoute;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  // v2.4.7b: o boot splash só é finalizado AQUI quando chegamos num estado
  // TERMINAL de DESLOGADO — o Firebase já resolveu (_authStateResolved) E não
  // há usuário (a landing / view legal é a tela final). NÃO finaliza:
  //   • enquanto esperamos o login (authCache rehidratando, auth não resolvido)
  //     — senão o splash some cedo demais e o loader antigo pisca;
  //   • quando logado — nesse caso quem finaliza é o startRealtimeListener,
  //     após PERFIL + 1º snapshot + settle (senão a dashboard aparece antes do
  //     perfil carregar).
  // Antes, o setter genérico disparava no 1º route (antes do auth resolver,
  // quando _waitingForFirstSnapshot ainda não existe), causando exatamente
  // esses dois sintomas (flicker novo↔antigo + dashboard sem perfil).
  // v2.4.74: RECHECK contra a janela do login. onAuthStateChanged seta
  // _authStateResolved=true no TOPO, antes do simulateLoginSuccess setar o
  // currentUser. Logo, durante o boot logado existe um intervalo em que
  // (_authStateResolved && !currentUser) é true — e o setter escondia o splash
  // cedo demais. Agora esperamos ~600ms e só finalizamos se, passada a janela,
  // AINDA não há usuário (deslogado real). Logado → currentUser aparece nesse
  // meio-tempo e quem finaliza é o startRealtimeListener (após perfil + dados).
  // v2.4.92: NÃO revelar como deslogado quando há sessão logada. Sinal
  // AUTORITATIVO = firebase.auth().currentUser (não depende do localStorage,
  // que o iOS pode limpar — por isso a v2.4.91, que olhava só o authCache, não
  // pegava). Esse era o BUG do "continua rápido / abre em ~1,5s": num usuário
  // LOGADO, durante o boot há a janela (_authStateResolved && !AppStore.user)
  // enquanto o login termina; este caminho 'deslogado' escondia o splash cedo.
  // Só finaliza pra DESLOGADO DE VERDADE: sem fb user, sem authCache, sem
  // AppStore.user. Logado → quem revela é o poller do dashboard, no tempo mínimo.
  var _fbUser = function() {
    try { return !!(typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser); } catch (e) { return false; }
  };
  var _hasCache = function() {
    try { return !!localStorage.getItem('scoreplace_authCache'); } catch (e) { return false; }
  };
  var _appUser = function() { return !!(window.AppStore && window.AppStore.currentUser); };
  if (window._authStateResolved && !_fbUser() && !_hasCache() && !_appUser()) {
    setTimeout(function() {
      if (!_fbUser() && !_hasCache() && !_appUser() && !window._waitingForFirstSnapshot) {
        if (typeof window._markBootReady === 'function') window._markBootReady('router-logged-out');
        else window._bootReady = true;
      }
    }, 900);
  }

  // Safety net: never leave a blank screen — if view-container is empty after 5s, go to dashboard.
  //
  // Duas correções (bug "Análise joga pra dashboard na 1ª vez"):
  //  (1) UM timer só. initRouter() roda a cada soft-refresh (onSnapshot), então os
  //      timeouts EMPILHAVAM — um deles vencia no meio de uma navegação posterior e
  //      chutava pra dashboard uma tela que só estava CARREGANDO.
  //  (2) Tela vazia COM loader na frente é carregamento em curso, não tela branca.
  //      Enquanto o loader global (ou o splash de boot) estiver no ar, o guard espera.
  //      Sem isso, qualquer view que busca da rede em >5s na 1ª abertura (Análise:
  //      um doc de perfil por inscrito, sem cache) era abortada.
  try { clearTimeout(window._blankScreenGuard); } catch (e) {}
  window._blankScreenGuard = setTimeout(function() {
    window._blankScreenGuard = null;
    var vc = document.getElementById('view-container');
    if (!vc || vc.innerHTML.trim() !== '') return;
    if (window.location.hash === '#dashboard') return;
    if (document.getElementById('sp-global-loading')) return;
    if (document.getElementById('scoreplace-boot-loader') || document.getElementById('sp-js-boot-overlay')) return;
    window._warn('[router] view-container vazio após 5s — voltando pra dashboard');
    window.location.hash = '#dashboard';
  }, 5000);
}
