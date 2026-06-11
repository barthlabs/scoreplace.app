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
    const hashPath = hash.substring(1);
    const parts = hashPath.split('/');
    const view = parts[0];
    const param = parts[1] || null;

    // --- Preserve ?ref= invite referrer in sessionStorage ---
    var _refMatch = hash.match(/[?&]ref=([^&]+)/);
    if (_refMatch) {
      try { sessionStorage.setItem('_inviteRefUid', decodeURIComponent(_refMatch[1])); } catch(e) {}
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

    // --- Auth gate: salva destino de convite para redirect pós-login ---
    // Se visitante não logado tenta acessar torneio via LINK DE CONVITE,
    // salva o ID para que o fluxo de auto-inscrição pós-login funcione.
    // v2.3.84: exige marcador de convite (?ref=/?invite=/?convite=) na URL.
    // BUG: antes bastava estar "deslogado" + ver um torneio. Mas no cold start
    // o auth é assíncrono → um usuário JÁ logado fica transitoriamente deslogado,
    // e só abrir o app na página de um torneio re-agendava a auto-inscrição.
    // Resultado reportado: conta de teste sendo RE-INSCRITA todo dia sozinha.
    var _isLoggedInEarly = !!(window.AppStore && window.AppStore.currentUser);
    var _hasInviteMarker = /[?&](ref|invite|convite)=/i.test(window.location.hash || '') ||
      /[?&](ref|invite|convite)=/i.test(window.location.search || '');
    if (!_isLoggedInEarly && view === 'tournaments' && cleanParam && _hasInviteMarker) {
      try { sessionStorage.setItem('_pendingEnrollTournamentId', cleanParam); } catch(e) {}
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
    if (!_shouldPreservePrerender) {
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
    // Exceções: #terms e #privacy (páginas legais sempre públicas).
    var _isLegalView = (view === 'privacy' || view === 'terms');
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
          viewContainer.innerHTML = (typeof window._renderBallLoader === 'function')
            ? window._renderBallLoader('Carregando…', { minHeight: '60vh' })
            : '<div style="text-align:center;padding:60vh 0 0;">Carregando…</div>';
          _firstRoute = false;
          return;
        }
      }

      if (!window._authStateResolved) {
        // Sem cache mas Firebase ainda não respondeu — pode ser usuário
        // com sessão no IndexedDB mas localStorage limpo pelo iOS.
        // Mostra spinner e aguarda até 3 s pelo onAuthStateChanged.
        viewContainer.innerHTML = (typeof window._renderBallLoader === 'function')
          ? window._renderBallLoader('Carregando…', { minHeight: '60vh' })
          : '<div style="text-align:center;padding:60vh 0 0;">Carregando…</div>';
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

    switch (view) {
      case '':
      case 'dashboard':
        renderDashboard(viewContainer);
        break;
      case 'tournament':
      case 'tournaments':
        if (cleanParam) {
          renderTournaments(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
        }
        break;
      case 'pre-draw':
        renderPreDraw(viewContainer, cleanParam);
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
          window.renderCreateTournamentPage(viewContainer);
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
      case 'fase-final':
        // Fase Final de temporada (playoffs de Liga). Param é o tId.
        if (typeof window.renderFaseFinalPage === 'function' && cleanParam) {
          window.renderFaseFinalPage(viewContainer, cleanParam);
        } else {
          window.location.replace('#dashboard');
          return;
        }
        break;
      default:
        // Rota desconhecida — redireciona para dashboard
        window.location.replace('#dashboard');
        return;
    }
  };

  if (window._routerHandler) {
    window.removeEventListener('hashchange', window._routerHandler);
  }
  window._routerHandler = handleRoute;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  // v1.0.32-beta: sinaliza pro boot loader esconder após primeiro render.
  // v1.9.43: se estiver aguardando o primeiro snapshot do Firestore
  // (_waitingForFirstSnapshot), o boot loader só some depois que os dados
  // chegarem (startRealtimeListener). Para usuários não-logados ou quando
  // Firestore não é usado, esconde aqui normalmente.
  if (typeof window._hideBootLoader === 'function' && !window._waitingForFirstSnapshot) {
    setTimeout(window._hideBootLoader, 150);
  }

  // Safety net: never leave a blank screen — if view-container is empty after 5s, go to dashboard
  setTimeout(function() {
    var vc = document.getElementById('view-container');
    if (vc && vc.innerHTML.trim() === '' && window.location.hash !== '#dashboard') {
      window.location.hash = '#dashboard';
    }
  }, 5000);
}
