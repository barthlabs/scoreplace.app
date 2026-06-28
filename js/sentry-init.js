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

  // ── 2b. Recuperação do bug FATAL do Firestore (SDK 10.8.1) ─────────────────
  // "INTERNAL ASSERTION FAILED: Unexpected state": a AsyncQueue do Firestore "falha" e
  // NÃO se recupera — TODA chamada seguinte morre em cascata (Sentry SCOREPLACE-WEB-67).
  // Único conserto em runtime é recarregar a página. Aqui: detecta o erro e faz UM reload
  // GUARDADO — só quando _isSafeToReload() (nunca no meio de um placar ao vivo) e no máximo
  // 1x por sessão. Se nunca for seguro em ~60s, desiste sem recarregar (não interrompe).
  // Causa-raiz atacada em paralelo: synchronizeTabs removido (firebase-db.js). Fix
  // definitivo = subir o SDK.
  var _fsRecovering = false;
  function _fsFatal(s) { return /INTERNAL ASSERTION FAILED|Unexpected state/i.test(String(s || '')); }
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
      setTimeout(function () { try { window.location.reload(); } catch (_) { } }, 1200);
    })();
  }

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
          // Tag útil pra agrupar issues por área do app
          var hash = (location.hash || '').replace('#', '').split('/')[0] || 'dashboard';
          event.tags = event.tags || {};
          event.tags.route = hash;
          // v1.0.4-beta: release lazy. Lê SCOREPLACE_VERSION na hora do envio,
          // não no init. Isso garante que mesmo se Sentry init rodar antes do
          // store.js defer carregar, todo evento sai com release correto assim
          // que store.js termina de parsear (~ms depois).
          event.release = 'scoreplace@' + (window.SCOREPLACE_VERSION || 'unknown');
          // Anonimização: jamais enviar email/displayName ao Sentry
          if (event.user) {
            delete event.user.email;
            delete event.user.username;
          }
          return event;
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
