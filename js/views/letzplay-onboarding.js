/* letzplay-onboarding.js — fluxo COMPLETO e guiado de importação do letzplay:
 * detecta a extensão (instalada / versão / ausente), guia o usuário passo a passo
 * (instalar → entrar no letzplay → importar → ver histórico) e reflete AO VIVO o
 * estado de cada etapa. Page-route #importar-letzplay (padrão centralizado).
 *
 * Detecção: o content.js da extensão anuncia {__sp_lp:'extension-present', version}
 * na carga e responde ao nosso {__sp_lp:'ext-ping'} (SPA muda de rota sem recarregar
 * o content script). Sem extensão → nenhum anúncio → mostramos "instalar".
 */
(function () {
  // Versão mínima esperada da extensão. Abaixo disso → pede atualização.
  // 1.12 é a 1ª com import DIRETO (service worker + orquestração no content script).
  var MIN_EXT_VERSION = '1.12';
  // URL da Chrome Web Store — null enquanto não publicado (mostra instruções manuais).
  var STORE_URL = null;

  var _ext = { present: false, version: null, seenAt: 0 };
  var _pollTimer = null;

  function _verGte(a, b) {
    var pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x > y) return true; if (x < y) return false;
    }
    return true;
  }

  function _isMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
      (window.SCOREPLACE_PLATFORM && window.SCOREPLACE_PLATFORM !== 'web');
  }

  function _esc(s) {
    return (typeof window._safeHtml === 'function') ? window._safeHtml(s == null ? '' : String(s))
      : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; });
  }

  // Escuta o anúncio da extensão (a qualquer momento).
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (!d || d.__sp_lp !== 'extension-present') return;
    _ext.present = true;
    _ext.version = d.version || null;
    _ext.seenAt = Date.now();
    if (document.getElementById('imp-steps')) _renderSteps();
  });

  function _ping() { try { window.postMessage({ __sp_lp: 'ext-ping' }, window.location.origin); } catch (e) {} }
  window._spExtPing = _ping;
  window._spExtState = function () { return _ext; };

  function _gamesCount() {
    var cu = window.AppStore && window.AppStore.currentUser;
    var g = cu && cu.letzplayImport && cu.letzplayImport.games;
    return Array.isArray(g) ? g.length : 0;
  }
  function _hasImport() {
    var cu = window.AppStore && window.AppStore.currentUser;
    return !!(cu && cu.letzplayImport);
  }

  // ── Import DIRETO disparado pelo app (extensão capaz) + overlay de progresso ──
  var _importActive = false;
  var _ERR = {
    'letzplay-login': 'Você não está logado no letzplay. Abra letzplay.me, entre e tente de novo.',
    'sem-jogos': 'Não encontrei jogos na sua conta do letzplay.',
    'sem-login': 'Entre na sua conta do scoreplace pra importar.',
    'conta-diferente': 'O @ do letzplay não bate com o do seu perfil no scoreplace.',
    'libs': 'A extensão precisa ser recarregada (chrome://extensions → ↻).',
    'sem-resposta': 'A extensão não respondeu. Recarregue a página e tente de novo.',
    'invalido': 'Não consegui montar o histórico. Tente de novo.'
  };

  function _overlayCard(html) {
    var o = document.getElementById('sp-import-overlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'sp-import-overlay';
      o.style.cssText = 'position:fixed;inset:0;z-index:100050;background:rgba(6,10,20,0.8);display:flex;align-items:center;justify-content:center;padding:20px;';
      o.innerHTML = '<div id="sp-import-card" style="background:var(--bg-card,#1e2235);border:1px solid var(--border-color,rgba(255,255,255,0.12));border-radius:18px;max-width:400px;width:100%;padding:22px;text-align:center;color:var(--text-main,#cbd5e1);box-shadow:0 20px 60px rgba(0,0,0,0.5);"></div>';
      document.body.appendChild(o);
    }
    var c = document.getElementById('sp-import-card');
    if (c) c.innerHTML = html;
  }
  window._spCloseImportOverlay = function () {
    var o = document.getElementById('sp-import-overlay');
    if (o && o.parentNode) o.parentNode.removeChild(o);
  };

  function _progressHtml(done, total, saving) {
    var pct = total ? Math.min(99, Math.round(done / total * 100)) : (done ? 60 : 8);
    return '<div style="font-size:2rem;margin-bottom:6px;">🎾</div>' +
      '<div style="font-weight:800;color:var(--text-bright,#fff);margin-bottom:12px;">' + (saving ? 'Salvando no seu perfil…' : 'Importando seu histórico…') + '</div>' +
      '<div style="height:12px;border-radius:999px;background:var(--bg-darker,#171a2b);overflow:hidden;border:1px solid var(--border-color,rgba(255,255,255,0.1));"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#84cc16,#65a30d);transition:width .3s;"></div></div>' +
      '<div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);margin-top:8px;">' + (total ? (done + ' de ' + total + ' jogos') : (done + ' jogos…')) + '</div>';
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data; if (!d) return;
    if (d.__sp_lp === 'import-progress') {
      if (_importActive) _overlayCard(_progressHtml(d.done || 0, d.total || null, !!d.saving));
      return;
    }
    if (d.__sp_lp === 'import-result') {
      if (!_importActive) return;
      _importActive = false;
      if (d.ok) {
        var n = (d.count != null) ? d.count : _gamesCount();
        _overlayCard('<div style="font-size:2rem;margin-bottom:6px;">✅</div>' +
          '<div style="font-weight:800;color:var(--text-bright,#fff);margin-bottom:6px;">Importado!</div>' +
          '<div style="font-size:0.85rem;color:var(--text-muted,#cbd5e1);margin-bottom:14px;">' + n + ' jogos do letzplay agora vivem no seu scoreplace.</div>' +
          '<a href="#historico" onclick="window._spCloseImportOverlay()" style="display:block;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-weight:800;padding:11px;border-radius:12px;text-decoration:none;margin-bottom:8px;">📜 Ver Histórico de jogos</a>' +
          '<button onclick="window._spCloseImportOverlay()" style="width:100%;background:transparent;border:1px solid var(--border-color,rgba(255,255,255,0.15));color:var(--text-muted,#cbd5e1);padding:9px;border-radius:12px;cursor:pointer;">Fechar</button>');
        if (document.getElementById('imp-steps')) _renderSteps();
      } else {
        var msg = _ERR[d.error] || ('Falhou: ' + (d.error || 'erro'));
        _overlayCard('<div style="font-size:2rem;margin-bottom:6px;">⚠️</div>' +
          '<div style="font-weight:800;color:var(--text-bright,#fff);margin-bottom:6px;">Não deu pra importar</div>' +
          '<div style="font-size:0.85rem;color:var(--text-muted,#cbd5e1);margin-bottom:14px;">' + _esc(msg) + '</div>' +
          '<a href="#importar-letzplay" onclick="window._spCloseImportOverlay()" style="display:block;background:var(--info-pill-bg,rgba(99,102,241,0.15));border:1px solid var(--border-color,rgba(255,255,255,0.12));color:var(--text-bright,#fff);font-weight:700;padding:10px;border-radius:12px;text-decoration:none;margin-bottom:8px;">Abrir o passo a passo</a>' +
          '<button onclick="window._spCloseImportOverlay()" style="width:100%;background:transparent;border:1px solid var(--border-color,rgba(255,255,255,0.15));color:var(--text-muted,#cbd5e1);padding:9px;border-radius:12px;cursor:pointer;">Fechar</button>');
      }
    }
  });

  // PONTO DE ENTRADA ÚNICO: extensão instalada+capaz → importa DIRETO; senão → tutorial.
  window._spStartImport = function () {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) {
      if (typeof showNotification === 'function') showNotification('Faça login', 'Entre pra importar seu histórico.', 'warning');
      return;
    }
    if (_isMobile()) { window.location.hash = '#importar-letzplay'; return; }
    _ping();
    var t0 = Date.now();
    (function wait() {
      if (_ext.present && _verGte(_ext.version, MIN_EXT_VERSION)) {
        _importActive = true;
        _overlayCard(_progressHtml(0, null, false));
        try { window.postMessage({ __sp_lp: 'run-import' }, window.location.origin); } catch (e) {}
        return;
      }
      if (Date.now() - t0 > 1300) { window.location.hash = '#importar-letzplay'; return; } // sem extensão (ou velha) → tutorial
      setTimeout(wait, 150);
    })();
  };

  // ── UI ────────────────────────────────────────────────────────────────
  function _stepShell(n, title, statusIcon, statusColor, bodyHtml) {
    return '' +
      '<div style="display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--border-color,rgba(255,255,255,0.1));border-radius:14px;margin-bottom:10px;background:var(--bg-card,#1e2235);">' +
        '<div style="flex:0 0 30px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.9rem;background:' + statusColor + ';color:#0b1020;">' + statusIcon + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:0.9rem;font-weight:700;color:var(--text-bright,#fff);margin-bottom:2px;">' + _esc(title) + '</div>' +
          '<div style="font-size:0.8rem;color:var(--text-muted,#cbd5e1);line-height:1.45;">' + bodyHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  var DONE = { ic: '✓', col: '#22c55e' };
  var CURRENT = { ic: '›', col: '#fbbf24' };
  var WAIT = { ic: '', col: 'rgba(148,163,184,0.4)' };
  var WARN = { ic: '!', col: '#f59e0b' };

  function _installStepBody() {
    if (_isMobile()) {
      return '<span style="color:#f59e0b;">A importação é feita <b>no computador</b> (Chrome/Edge/Brave). No celular não dá pra instalar extensão — abra o scoreplace no desktop pra importar.</span>';
    }
    if (_ext.present && _verGte(_ext.version, MIN_EXT_VERSION)) {
      return 'Extensão detectada e pronta. <b>v' + _esc(_ext.version) + '</b> ✓';
    }
    if (_ext.present && !_verGte(_ext.version, MIN_EXT_VERSION)) {
      return '<span style="color:#f59e0b;">Sua extensão é a <b>v' + _esc(_ext.version) + '</b> — atualize pra <b>v' + _esc(MIN_EXT_VERSION) + '</b>.</span>' + _installHelp('Como atualizar');
    }
    var installBtn = STORE_URL
      ? '<a href="' + _esc(STORE_URL) + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;background:linear-gradient(135deg,#84cc16,#65a30d);color:#0b1020;font-weight:800;padding:9px 16px;border-radius:10px;text-decoration:none;font-size:0.82rem;">🎾 Instalar extensão</a>'
      : '<div style="margin-top:6px;color:#94a3b8;">A extensão ainda não está na Chrome Web Store (em preparação). Por enquanto, instale em modo desenvolvedor:</div>';
    return 'Precisa da extensão do scoreplace pra ler seu histórico na sua sessão logada (sem senha).' + installBtn + _installHelp(STORE_URL ? 'Instalar manualmente' : 'Passo a passo (modo desenvolvedor)');
  }

  function _installHelp(label) {
    return '<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--primary-color,#818cf8);font-weight:600;">' + _esc(label) + '</summary>' +
      '<ol style="margin:8px 0 0;padding-left:20px;line-height:1.7;">' +
        '<li>Abra <code>chrome://extensions</code></li>' +
        '<li>Ligue o <b>Modo do desenvolvedor</b> (canto superior direito)</li>' +
        '<li><b>Carregar sem compactação</b> → selecione a pasta <code>extension/</code> do scoreplace</li>' +
        '<li>Volte aqui — esta tela detecta sozinha ✓</li>' +
        '<li><i>Já tinha instalado?</i> Clique em <b>↻ recarregar</b> no card da extensão pra pegar a versão nova</li>' +
      '</ol></details>';
  }

  function _renderSteps() {
    var host = document.getElementById('imp-steps');
    if (!host) return;

    var extOk = !_isMobile() && _ext.present && _verGte(_ext.version, MIN_EXT_VERSION);
    var games = _gamesCount();
    // "importado" = tem jogos game-a-game (o que alimenta o histórico). Um import
    // v1 antigo (letzplayImport sem games) NÃO conta — o usuário precisa reimportar.
    var imported = games > 0;

    // Passo 1 — extensão
    var s1 = extOk ? DONE : (_ext.present ? WARN : CURRENT);
    var html = _stepShell(1, 'Instalar a extensão (uma vez, no desktop)', s1.ic || '1', s1.col, _installStepBody());

    // Passo 2 — letzplay logado (não dá pra detectar cross-origin; instrução)
    var s2 = extOk ? CURRENT : WAIT;
    html += _stepShell(2, 'Entrar no letzplay', s2.ic || '2', s2.col,
      'Abra o letzplay e confirme que está logado (a extensão usa a SUA sessão — nenhuma senha passa pelo scoreplace).' +
      '<div style="margin-top:8px;"><a href="https://letzplay.me/u/matches/history" target="_blank" rel="noopener" style="color:var(--primary-color,#818cf8);font-weight:600;">Abrir meu histórico no letzplay ↗</a></div>');

    // Passo 3 — importar
    var s3 = imported ? DONE : (extOk ? CURRENT : WAIT);
    var s3body;
    if (imported) {
      s3body = '<div style="color:#22c55e;font-weight:700;">✅ Importado — ' + games + ' jogos no seu perfil.</div>' +
        '<button onclick="window._spStartImport&&window._spStartImport()" style="margin-top:8px;background:transparent;border:1px solid var(--border-color,rgba(255,255,255,0.15));color:var(--text-muted,#cbd5e1);padding:7px 12px;border-radius:9px;cursor:pointer;font-size:0.78rem;">🔄 Reimportar (atualizar)</button>';
    } else if (extOk) {
      s3body = 'Tudo pronto — importe com um clique (sem precisar clicar no ícone da extensão):' +
        '<div style="margin-top:8px;"><button onclick="window._spStartImport&&window._spStartImport()" style="background:linear-gradient(135deg,#84cc16,#65a30d);color:#0b1020;font-weight:800;padding:10px 18px;border-radius:11px;border:none;cursor:pointer;font-size:0.85rem;">🎾 Importar agora</button></div>';
    } else {
      s3body = 'Depois de instalar a extensão e entrar no letzplay, um botão <b>Importar agora</b> aparece aqui.';
    }
    html += _stepShell(3, 'Importar seu histórico', imported ? '✓' : '3', s3.col, s3body);

    // Passo 4 — histórico
    var s4 = imported ? DONE : WAIT;
    html += _stepShell(4, 'Ver seu histórico completo', imported ? '✓' : '4', s4.col,
      imported
        ? 'Pronto! Seu histórico do letzplay agora vive no scoreplace.<div style="margin-top:8px;"><a href="#historico" style="display:inline-block;background:var(--info-pill-bg,rgba(99,102,241,0.15));border:1px solid var(--border-color,rgba(255,255,255,0.12));color:var(--text-bright,#fff);font-weight:700;padding:9px 16px;border-radius:10px;text-decoration:none;font-size:0.82rem;">📜 Ver Histórico de jogos</a></div>'
        : 'Depois de importar, seus jogos aparecem aqui misturados aos do scoreplace — cronológicos, com filtro por fonte, local e competição.');

    host.innerHTML = html;
  }

  window._renderImportarLetzplayPage = function (container) {
    if (!container) container = document.getElementById('view-container');
    if (!container) return;

    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({ href: '#dashboard', label: 'Voltar', middleHtml: '<span style="font-weight:700;">🎾 Importar do letzplay</span>' })
      : '';

    var intro = '<div style="max-width:640px;margin:0 auto;padding:6px 14px 40px;">' +
      '<div style="background:rgba(132,204,22,0.08);border:1px solid rgba(132,204,22,0.35);border-radius:14px;padding:14px;margin-bottom:14px;">' +
        '<div style="font-size:0.95rem;font-weight:800;color:var(--text-bright,#fff);margin-bottom:4px;">Traga seu histórico do letzplay — e pare de depender dele.</div>' +
        '<div style="font-size:0.8rem;color:var(--text-muted,#cbd5e1);line-height:1.5;">Uma vez importado, seus jogos vivem no scoreplace pra sempre. <b>Sem senha</b>: a extensão lê na sua própria sessão logada. É um passo único, no computador.</div>' +
      '</div>' +
      '<div id="imp-steps"></div>' +
    '</div>';

    container.innerHTML = hdr + intro;
    _renderSteps();

    // Detecção viva: pinga a extensão e revê o estado enquanto a tela está aberta.
    _ping();
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(function () {
      if (!document.getElementById('imp-steps')) { clearInterval(_pollTimer); _pollTimer = null; return; }
      // extensão some do estado se não anunciar por >6s (ex: foi removida)
      if (_ext.present && (Date.now() - _ext.seenAt) > 6000) { _ext.present = false; _ext.version = null; }
      _ping();
      _renderSteps();
    }, 2000);
  };
})();
