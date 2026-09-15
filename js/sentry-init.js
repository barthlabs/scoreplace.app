// scoreplace.app — Sentry observability bootstrap (boilerplate inativo até plugar DSN)
//
// COMO ATIVAR:
// 1. Crie um projeto em https://sentry.io e copie o DSN público (https://...@o000.ingest.sentry.io/000).
// 2. No `index.html`, ANTES da tag <script src="js/sentry-init.js">, adicione:
//      <script>window.SENTRY_DSN = "https://SEU_DSN_AQUI";</script>
//    (Não commitar DSN em PR's pra ambientes de teste — usar localStorage abaixo.)
//
// COMO ATIVAR EM DEV (sem commitar DSN):
//   localStorage.setItem('scoreplace_sentry_dsn', 'https://SEU_DSN');  // numa aba qualquer
//
// SEM DSN: o módulo é silencioso. Nenhuma rede, nenhum console.log. Apenas
// expõe `window._captureException` e `window._captureMessage` como no-ops
// pra que callers possam chamar sem checar disponibilidade.
//
// Buffer pré-init: errors que acontecem ANTES do Sentry SDK carregar são
// guardados num array e drenados quando o SDK terminar de carregar.

(function () {
  // ── 1. Resolver DSN (window > localStorage > nada) ─────────────────────────
  var DSN = (typeof window.SENTRY_DSN === 'string' && window.SENTRY_DSN) || '';
  if (!DSN) {
    try { DSN = localStorage.getItem('scoreplace_sentry_dsn') || ''; } catch (e) {}
  }

  // v1.0.4-beta: Skip init em qualquer ambiente que NÃO seja produção real
  // (scoreplace.app). Antes mandava `environment: preview` pra Sentry quando
  // hostname diferia, mas isso polui a inbox com erros do Karma test runner
  // (HeadlessChrome em http://localhost:9876/) — issue #2 com 13 events em
  // 14d. Localhost dev e CI ficam mudos por padrão; se precisar testar
  // observability em dev, setar `localStorage.scoreplace_force_sentry='1'`.
  var FORCE = false;
  try { FORCE = localStorage.getItem('scoreplace_force_sentry') === '1'; } catch (e) {}
  if (location.hostname !== 'scoreplace.app' && !FORCE) {
    DSN = ''; // forçar caminho no-op abaixo
  }

  // ── 2. Helpers no-op (sempre exportados, mesmo sem DSN) ────────────────────
  // Buffer de events que acontecem antes do SDK carregar
  var _preInitBuffer = [];
  var _sdkReady = false;

  window._captureException = function (err, ctx) {
    if (!DSN) return;
    if (_sdkReady && window.Sentry) {
      window.Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
    } else {
      _preInitBuffer.push({ kind: 'exception', err: err, ctx: ctx });
    }
  };

  window._captureMessage = function (msg, level) {
    if (!DSN) return;
    if (_sdkReady && window.Sentry) {
      window.Sentry.captureMessage(msg, level || 'info');
    } else {
      _preInitBuffer.push({ kind: 'message', msg: msg, level: level });
    }
  };

  // Sem DSN — sai limpo. Os no-ops acima já estão ativos.
  if (!DSN) return;

  // O Sentry precisa explicar a falha sem receber o contexto de quem a viveu.
  // Não tentar reconhecer nomes é frágil: a barreira é estrutural. Eventos levam
  // somente release, rota, tipo de exceção e a pilha sem payload, query ou vars.
  function _sentryFrame(frame) {
    var safe = {};
    if (frame && frame.filename) {
      safe.filename = String(frame.filename).split(/[?#]/)[0].slice(0, 240);
    }
    if (frame && frame.function) {
      safe.function = String(frame.function).replace(/[^A-Za-z0-9_.$<>]/g, '').slice(0, 120);
    }
    if (frame && typeof frame.lineno === 'number') safe.lineno = frame.lineno;
    if (frame && typeof frame.colno === 'number') safe.colno = frame.colno;
    if (frame && frame.in_app === true) safe.in_app = true;
    return safe;
  }

  /* A hash é controlada pelo navegador e pode conter texto arbitrário. A rota de
   * telemetria só pode ser uma das chaves que o router entende; qualquer outra
   * coisa perde o valor antes de chegar ao evento. */
  var _rotasSentry = {
    dashboard: 1, tournament: 1, tournaments: 1, pair: 1, cohost: 1,
    bracket: 1, match: 1, formato: 1, participants: 1, rules: 1,
    explore: 1, 'todos-torneios': 1, 'todas-pessoas': 1, notifications: 1,
    live: 1, casual: 1, presence: 1, venues: 1, place: 1, 'my-venues': 1,
    profile: 1, analise: 1, categorias: 1, comunicados: 1, participantes: 1,
    help: 1, 'novo-torneio': 1, support: 1, invite: 1, privacy: 1, terms: 1,
    'delete-account': 1, trofeus: 1, arbitros: 1, historico: 1,
    'importar-letzplay': 1, 'fase-final': 1
  };

  function _rotaSentrySegura(route) {
    route = String(route || '').toLowerCase();
    return _rotasSentry[route] ? route : 'unknown';
  }

  function _sanitizeSentryEvent(event) {
    event = event || {};
    var route = _rotaSentrySegura(event.tags && event.tags.route);
    event.tags = { route: route };

    delete event.user;
    delete event.extra;
    delete event.contexts;
    delete event.request;
    delete event.fingerprint;
    delete event.spans;
    event.transaction = route ? ('route:' + route) : 'route:unknown';
    event.message = '[mensagem suprimida por privacidade]';

    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.slice(-10).map(function (crumb) {
        var safe = { category: 'breadcrumb' };
        if (crumb && crumb.level) safe.level = String(crumb.level).slice(0, 20);
        if (crumb && typeof crumb.timestamp === 'number') safe.timestamp = crumb.timestamp;
        return safe;
      });
    } else {
      delete event.breadcrumbs;
    }

    if (event.exception && Array.isArray(event.exception.values)) {
      event.exception = {
        values: event.exception.values.map(function (value) {
          var safe = {
            type: String((value && value.type) || 'Error').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 80) || 'Error',
            value: '[detalhe suprimido por privacidade]'
          };
          if (value && value.stacktrace && Array.isArray(value.stacktrace.frames)) {
            safe.stacktrace = { frames: value.stacktrace.frames.map(_sentryFrame) };
          }
          return safe;
        })
      };
    }
    return event;
  }

  function _identificarEventoSentry(event) {
    event = event || {};
    var hash = (location.hash || '').replace('#', '').split('/')[0] || 'dashboard';
    event.tags = { route: _rotaSentrySegura(hash) };
    // A versão também é tardia: store.js pode ainda não ter terminado de carregar
    // quando o SDK CDN inicia, mas estará disponível ao enviar o evento.
    event.release = 'scoreplace@' + (window.SCOREPLACE_VERSION || 'unknown');
    return _sanitizeSentryEvent(event);
  }

  // ── 2b. Recuperação do bug FATAL do Firestore (SDK <10.12) ─────────────────
  // "INTERNAL ASSERTION FAILED: Unexpected state": a AsyncQueue do Firestore "falha" e
  // NÃO se recupera — TODA chamada seguinte morre em cascata (Sentry SCOREPLACE-WEB-66/67).
  // Único conserto em runtime é recarregar a página. Aqui: detecta o erro e faz UM reload
  // GUARDADO — só quando _isSafeToReload() (nunca no meio de um placar ao vivo) e no máximo
  // 1x por sessão. Se nunca for seguro em ~60s, desiste sem recarregar (não interrompe).
  // v1.3.27: FIX RAIZ aplicado — SDK subido 10.8.1 → 10.14.1 (as correções de "Unexpected
  // state" entraram em 10.12+). Este auto-reload guardado + synchronizeTabs removido
  // (firebase-db.js) seguem como rede de segurança enquanto se confirma no Sentry.
  // v1.9.73: o "Unexpected state" AINDA reincidia no 10.14.1 (WEB-69/65) → SDK subido
  // pra 12.17.1. O detector é por FRASE do erro, não por versão — a rede continua.
  var _fsRecovering = false;
  // v1.7.65 — "Database deleted by request of the user" entra na MESMA rede.
  //
  // MEDIDO no Sentry (06/ago 23:20:07 UTC, web, Mobile Safari iOS, 1.7.59) — 1min29s ANTES
  // de a Cristina criar a primeira das duas contas que ela abriu tentando entrar, e que
  // ficaram SEM perfil no Firestore. O erro é o IndexedDB da persistência sendo APAGADO com
  // a conexão aberta (Safari despejando storage, "limpar dados", ou a própria aba perdendo
  // a base). O efeito é idêntico ao do "Unexpected state": a AsyncQueue morre e TODA chamada
  // seguinte falha em cascata — inclusive a gravação do perfil no login, que é o que deixa a
  // pessoa presa na landing achando que o login não funcionou.
  //
  // O detector só reconhecia as duas frases do bug interno do SDK, então esta família ficava
  // de fora do auto-reload e não havia NADA que recuperasse a sessão. Mesma classe, mesma
  // cura: um reload guardado (só quando é seguro, no máximo 1x por sessão).
  function _fsFatal(s) {
    return /INTERNAL ASSERTION FAILED|Unexpected state|Database deleted by request of the user/i.test(String(s || ''));
  }
  /* ⛔ RECARREGAR SEM LIMPAR O CACHE É RECARREGAR PRA DENTRO DO MESMO DEFEITO.
   * MEDIDO no emulador Android (12/set/2026): o erro era
   * `INTERNAL ASSERTION FAILED … {"rl":"Failed to read large IndexedDB value"}` — o SDK não
   * consegue LER um valor que ele mesmo gravou em pedaços no IndexedDB. O reload relê o mesmo
   * valor quebrado e o app volta pra tela de erro; foi o que o dono viu repetir.
   * O cache do Firestore é DESCARTÁVEL — é espelho do servidor. Então antes de recarregar,
   * joga fora: `terminate()` (solta o IndexedDB) + `clearPersistence()`. Se a API falhar,
   * apaga o banco na unha. Com teto de tempo: recuperação que trava é pior que a doença.
   * ⚠️ O que se perde é a FILA OFFLINE — que neste estado já está morta de qualquer jeito
   * (a AsyncQueue do Firestore falhou; é isso que o erro significa). */
  /* ⛔ O NOME DO BANCO NÃO SE CHUTA — se ENUMERA.
   * O SDK monta `firestore/{chave}/{projectId}[.{database}]/…` (MEDIDO no
   * firebase-firestore-compat 12.17.1). Cravar esse nome à mão erraria em staging, em 2ª
   * base e em qualquer versão futura — e erraria em SILÊNCIO, que é o pior jeito.
   * [[project_ler_firestore_por_rest_erra_calado]] */
  function _apagarBancosDoFirestore() {
    return new Promise(function (pronto) {
      try {
        if (!indexedDB.databases) return pronto();
        indexedDB.databases().then(function (bancos) {
          var _alvos = (bancos || []).map(function (b) { return b && b.name; })
            .filter(function (n) { return n && n.indexOf('firestore/') === 0; });
          if (!_alvos.length) return pronto();
          var _falta = _alvos.length;
          var _menos = function () { if (--_falta <= 0) pronto(); };
          _alvos.forEach(function (nome) {
            try {
              var _r = indexedDB.deleteDatabase(nome);
              _r.onsuccess = _menos; _r.onerror = _menos; _r.onblocked = _menos;
            } catch (_) { _menos(); }
          });
        }).catch(function () { pronto(); });
      } catch (_) { pronto(); }
    });
  }
  function _limparCacheDoFirestore() {
    return new Promise(function (pronto) {
      var _teto = setTimeout(pronto, 3000);
      var _fim = function () { clearTimeout(_teto); pronto(); };
      try {
        if (typeof firebase === 'undefined' || typeof firebase.firestore !== 'function') return _fim();
        var _db = firebase.firestore();
        _db.terminate()
          .then(function () { return _db.clearPersistence(); })
          .then(_fim)
          .catch(function () { _apagarBancosDoFirestore().then(_fim); });
      } catch (_) { _fim(); }
    });
  }
  function _maybeRecoverFirestore(text) {
    if (_fsRecovering || !_fsFatal(text)) return;
    try { if (sessionStorage.getItem('sp_fsRecovered')) return; } catch (_) { }
    _fsRecovering = true;
    var tries = 0;
    (function attempt() {
      var safe = (typeof window._isSafeToReload !== 'function') || window._isSafeToReload();
      if (!safe) {
        if (tries++ < 12) { setTimeout(attempt, 5000); return; }
        _fsRecovering = false; return; // nunca ficou seguro → não interrompe o usuário
      }
      try { sessionStorage.setItem('sp_fsRecovered', '1'); } catch (_) { }
      try { if (typeof window.showNotification === 'function') window.showNotification('🔄 Reconectando', 'Recuperando a conexão com o servidor…', 'info'); } catch (_) { }
      _limparCacheDoFirestore().then(function () {
        setTimeout(function () { try { window.location.reload(); } catch (_) { } }, 400);
      });
    })();
  }

  /* ⛔ QUEM PEGA O ERRO NEM SEMPRE É O `onerror`. MEDIDO: no Android o erro estourou DENTRO do
   * render e foi capturado pela rede de erro do router (`try/catch` que desenha "Não consegui
   * desenhar esta tela") — ou seja, nunca chegou aqui, e a recuperação nunca rodou. Por isso
   * o detector fica exposto: quem engole um erro tem a obrigação de mostrá-lo a ele. */
  window._recuperarFirestoreSePreciso = function (texto) { try { _maybeRecoverFirestore(texto); } catch (_) {} };

  // ── 3. Capturar erros DO MOMENTO ZERO até o SDK carregar ───────────────────
  // window.onerror handler temporário que enche o buffer. Quando o SDK
  // termina de carregar e drena o buffer, o handler nativo do Sentry assume.
  var _origOnError = window.onerror;
  window.onerror = function (msg, src, line, col, err) {
    _preInitBuffer.push({ kind: 'onerror', msg: msg, src: src, line: line, col: col, err: err });
    _maybeRecoverFirestore((err && err.message) || msg);
    if (typeof _origOnError === 'function') return _origOnError.apply(this, arguments);
    return false;
  };

  var _origOnRejection = window.onunhandledrejection;
  window.onunhandledrejection = function (event) {
    var _reason = event && event.reason;
    _preInitBuffer.push({ kind: 'rejection', reason: _reason });
    _maybeRecoverFirestore(_reason && (_reason.message || _reason));
    if (typeof _origOnRejection === 'function') return _origOnRejection.apply(this, arguments);
  };

  // ── 4. Carregar o SDK CDN async ────────────────────────────────────────────
  // Sentry browser bundle (compatível com vanilla JS, sem ES Modules)
  // v0.17.81: hash SRI corrigido (computado via openssl dgst -sha384 do
  // arquivo CDN). O hash anterior era inventado e bloqueava silenciosamente
  // o load do SDK no browser, deixando observability inativa apesar da DSN
  // estar configurada. Validar hash sempre que bumpar a versão do SDK.
  var SDK_URL = 'https://browser.sentry-cdn.com/8.45.0/bundle.tracing.min.js';
  var SDK_INTEGRITY = 'sha384-2v8OMaiLyo5IQ6yjyGhZ8db0RBrxRo/GmWZE2FR+b1H7WCLNM8rUbYEX7G2g7n7+';

  var s = document.createElement('script');
  s.src = SDK_URL;
  s.integrity = SDK_INTEGRITY;
  s.crossOrigin = 'anonymous';
  s.async = true;
  s.onload = function () {
    if (!window.Sentry) return;
    try {
      window.Sentry.init({
        dsn: DSN,
        // release agora é definido lazy via beforeSend abaixo — antes ficava
        // travado no init com `SCOREPLACE_VERSION` que ainda era undefined
        // por race entre Sentry CDN async e store.js defer (issue v1.0.3-beta:
        // 14 events com release=scoreplace@unknown).
        environment: 'production',
        // ── ⛔ NÃO MEXER EM `maxValueLength` (1.9.100) ─────────────────────────
        // A 1.9.98 acrescentou `maxValueLength: 4000` aqui pra o relatório do
        // aparelho parar de chegar cortado em 250. Resultado medido: os relatórios
        // do dono PARARAM de chegar — o último foi na 1.9.96, e ele testou a 98
        // sem que nada aparecesse. Não provei a causalidade (o painel de navegador
        // aqui também não entrega evento nenhum, então pode ser bloqueio local),
        // mas relatório é a ÚNICA janela que eu tenho pro aparelho dele: entre
        // defender a minha mudança e voltar pro que comprovadamente reportava, a
        // escolha é óbvia.
        // O corte de 250 continua existindo — e agora é resolvido do NOSSO lado,
        // encurtando a mensagem (ver o relato do toque em store.js). Caber no
        // limite é mais barato que negociar com o limite.
        // Beta-readiness: 100% errors mas baixa amostragem de transações (custo).
        sampleRate: 1.0,
        tracesSampleRate: 0.05,
        // Reduzir noise — ignorar erros conhecidos do ecosistema Firebase / extensions
        ignoreErrors: [
          /Non-Error promise rejection captured/i,
          /ResizeObserver loop limit exceeded/i,
          /ResizeObserver loop completed/i,
          /Network request failed/i,            // Firestore offline transitório
          /Failed to fetch/i,                   // browser extensions, ad blockers
          /chrome-extension:\/\//i,
          /moz-extension:\/\//i,
          // v1.0.4-beta: 4 padrões novos baseados em audit de issues unresolved:
          /Script .* load failed/i,             // iOS Safari SW update transient (issue #3)
          /popup has been closed by the user/i, // user fechou popup OAuth (#5/#6)
          /popup_closed_by_user/i,              // mesma intenção, mensagem variante
          /Test event from beta-readiness/i     // eventos de teste manual (#7)
        ],
        beforeSend: function (event) {
          return _identificarEventoSentry(event);
        },
        beforeSendTransaction: function (event) {
          return _identificarEventoSentry(event);
        }
      });

      // Drenar buffer pré-init
      _sdkReady = true;
      while (_preInitBuffer.length > 0) {
        var ev = _preInitBuffer.shift();
        try {
          if (ev.kind === 'exception') {
            window.Sentry.captureException(ev.err, ev.ctx ? { extra: ev.ctx } : undefined);
          } else if (ev.kind === 'message') {
            window.Sentry.captureMessage(ev.msg, ev.level || 'info');
          } else if (ev.kind === 'onerror') {
            window.Sentry.captureException(ev.err || new Error(String(ev.msg)), {
              extra: { src: ev.src, line: ev.line, col: ev.col }
            });
          } else if (ev.kind === 'rejection') {
            window.Sentry.captureException(ev.reason || new Error('Unhandled promise rejection'));
          }
        } catch (drainErr) {
          // never break the page — silent fail
        }
      }
    } catch (initErr) {
      console.warn('[Sentry] init failed:', initErr);
    }
  };
  s.onerror = function () {
    // SDK falhou em carregar — buffer fica órfão (e libera GC ao próximo refresh)
    console.warn('[Sentry] CDN load failed; observability disabled this session');
  };
  document.head.appendChild(s);
})();
