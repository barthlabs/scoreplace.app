// scoreplace.app — Centralized logger wrapper
//
// Define window._log / _warn / _error / _debug compatíveis com console.log.
// Em desenvolvimento (localhost), passa direto pro console (mesmo comportamento).
// Em produção (hostname=scoreplace.app), silencia _log e _debug por default,
// mantém _warn/_error visíveis no console, e envia breadcrumbs pra Sentry
// (quando DSN estiver plugada — ver js/sentry-init.js).
//
// USO (não-bloqueante — call-sites antigos com console.log direto continuam
// funcionando):
//
//   window._log('foo', objeto);          // dev: console.log; prod: silenciado
//   window._warn('algo suspeito', err);  // sempre console.warn + breadcrumb
//   window._error('falhou:', err);       // sempre console.error + breadcrumb
//   window._debug('verbose state');      // dev: console.debug; prod: silenciado
//
// FORÇAR DEBUG EM PROD:
//   localStorage.setItem('scoreplace_debug', '1');  // numa aba qualquer
//   location.reload();
//
// Esse flag também ativa logs do AppStore/router/etc se eles passarem a usar
// o wrapper.

(function () {
  // Detecta se estamos em produção
  var isProd = location.hostname === 'scoreplace.app';
  // Permite forçar debug em prod via localStorage
  var forceDebug = false;
  try {
    forceDebug = localStorage.getItem('scoreplace_debug') === '1';
  } catch (e) {}
  var quietDebug = isProd && !forceDebug;

  // Detecta o Sentry pra enviar breadcrumbs quando disponível
  function _sendBreadcrumb(level, args) {
    if (!window.Sentry || typeof window.Sentry.addBreadcrumb !== 'function') return;
    try {
      // Concatena os args num message (preserva info útil mesmo serializado)
      var msg = Array.prototype.map.call(args, function (a) {
        if (a == null) return String(a);
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a).slice(0, 200); } catch (e) { return String(a); }
      }).join(' ');
      window.Sentry.addBreadcrumb({
        category: 'app',
        level: level, // 'debug' | 'info' | 'warning' | 'error'
        message: msg.slice(0, 500),
        timestamp: Date.now() / 1000
      });
    } catch (e) {
      // Nunca quebra o fluxo do app se breadcrumb falhar
    }
  }

  // _log / _debug: silenciados em prod (sem flag debug)
  window._log = function () {
    if (!quietDebug) {
      // eslint-disable-next-line no-console
      console.log.apply(console, arguments);
    }
    _sendBreadcrumb('info', arguments);
  };

  window._debug = function () {
    if (!quietDebug) {
      // eslint-disable-next-line no-console
      console.debug.apply(console, arguments);
    }
    _sendBreadcrumb('debug', arguments);
  };

  // _warn / _error: sempre visíveis no console + breadcrumb
  window._warn = function () {
    // eslint-disable-next-line no-console
    console.warn.apply(console, arguments);
    _sendBreadcrumb('warning', arguments);
  };

  window._error = function () {
    // eslint-disable-next-line no-console
    console.error.apply(console, arguments);
    _sendBreadcrumb('error', arguments);
  };

  /* ⛔ ESCRITA QUE FALHA CALADA É PONTO CEGO — e havia 23 delas.
   *
   * MEDIDO em 13/set/2026, varrendo `js/`: 23 gravações no Firestore terminavam em
   * `.catch(function () {})`. São escritas de "melhor esforço" de propósito — salvar o
   * token de push, os locais preferidos, o telefone vinculado, o estado da sessão ao vivo —
   * e é certo que elas NÃO derrubem a tela. O errado é sumirem: no dia em que uma delas
   * passar a falhar sempre (regra, rede, cota), o sintoma chega como "não salva meus clubes"
   * ou "não recebo notificação" e não há UMA linha em lugar nenhum para começar a olhar.
   *
   * ⭐ ESTA PORTA NÃO MUDA O COMPORTAMENTO: continua engolindo, a tela segue igual. O que
   * muda é que passa a deixar rastro — console + breadcrumb, e exceção reportada a partir da
   * segunda falha do MESMO ponto (a primeira pode ser rede de alguém no elevador; a segunda
   * já é sinal). [[feedback_try_catch_nao_pega_promessa]]
   *
   * Uso:  .catch(window._falhouCalado('preferredLocations'))
   */
  var _mudosVistos = {};
  window._falhouCalado = function (onde) {
    return function (err) {
      var n = (_mudosVistos[onde] = (_mudosVistos[onde] || 0) + 1);
      var cod = (err && (err.code || err.message)) || err;
      window._warn('[falhou calado] ' + onde + ' (' + n + 'ª): ' + cod);
      if (n >= 2 && typeof window._captureException === 'function') {
        try { window._captureException(err instanceof Error ? err : new Error(String(cod)),
          { area: 'escrita-melhor-esforco', onde: onde, vezes: n }); } catch (e) {}
      }
      return null;   // ⚠️ devolve para a cadeia continuar resolvida, como o `{}` fazia
    };
  };

  // Expor um snapshot do modo atual pra debug
  window._loggerMode = isProd ? (forceDebug ? 'prod-debug' : 'prod-quiet') : 'dev';
})();
