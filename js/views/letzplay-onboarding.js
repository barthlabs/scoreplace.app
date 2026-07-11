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
  // 1.18: busca no mundo MAIN da aba do letzplay (manda os cookies → jogos vêm).
  // 1.16/1.17 buscavam no mundo ISOLATED (sem cookies) → "sem jogos".
  var MIN_EXT_VERSION = '1.20';
  // URL da Chrome Web Store — null enquanto não publicado (mostra instruções manuais).
  var STORE_URL = null;

  var _ext = { present: false, version: null, seenAt: 0 };
  var _pollTimer = null;
  var _lzLoggedIn = null;   // null=desconhecido, true=logado no letzplay, false=deslogado
  var _lastLzCheck = 0;

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

  // Escuta o anúncio da extensão + o status de login do letzplay (a qualquer momento).
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (!d) return;
    if (d.__sp_lp === 'extension-present') {
      _ext.present = true;
      _ext.version = d.version || null;
      _ext.seenAt = Date.now();
      // ao detectar a extensão, já pergunta se está logado no letzplay (pro Passo 2 verde)
      if (_lzLoggedIn !== true) { _lastLzCheck = Date.now(); _checkLetzplay(); }
      _maybeRenderSteps();
      return;
    }
    if (d.__sp_lp === 'letzplay-status') {
      if (d.loggedIn === true || d.loggedIn === false) { _lzLoggedIn = d.loggedIn; _maybeRenderSteps(); }
      return;
    }
  });

  function _ping() { try { window.postMessage({ __sp_lp: 'ext-ping' }, window.location.origin); } catch (e) {} }
  function _checkLetzplay() { try { window.postMessage({ __sp_lp: 'check-letzplay' }, window.location.origin); } catch (e) {} }
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
    'no-letzplay-tab': 'Abra o letzplay.me numa aba (logado) e tente de novo — a leitura acontece dentro da sua sessão.',
    'sem-jogos': 'Não encontrei jogos na sua conta do letzplay (confira se está logado na aba do letzplay).',
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
          '<a href="#historico" onclick="window._spCloseImportOverlay()" class="btn btn-primary btn-block" style="margin-bottom:8px;">📜 Ver Histórico de jogos</a>' +
          '<button onclick="window._spCloseImportOverlay()" class="btn btn-outline btn-block">Fechar</button>');
        _maybeRenderSteps(true);
      } else {
        var msg = /context invalidated/i.test(d.error || '')
          ? 'A extensão foi atualizada — recarregue esta página (Cmd+R) e tente de novo.'
          : (_ERR[d.error] || ('Falhou: ' + (d.error || 'erro')));
        _overlayCard('<div style="font-size:2rem;margin-bottom:6px;">⚠️</div>' +
          '<div style="font-weight:800;color:var(--text-bright,#fff);margin-bottom:6px;">Não deu pra importar</div>' +
          '<div style="font-size:0.85rem;color:var(--text-muted,#cbd5e1);margin-bottom:14px;">' + _esc(msg) + '</div>' +
          '<a href="#importar-letzplay" onclick="window._spCloseImportOverlay()" class="btn btn-primary btn-block" style="margin-bottom:8px;">Abrir o passo a passo</a>' +
          '<button onclick="window._spCloseImportOverlay()" class="btn btn-outline btn-block">Fechar</button>');
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

  window._spIsMobile = _isMobile;

  // Entrada de importação: no DESKTOP = botão que dispara _spStartImport; no CELULAR
  // (nativo ou web mobile — Chrome do celular não instala extensão) = AVISO de que a
  // importação é feita no computador. Usado nas Estatísticas e no Histórico.
  window._spImportEntry = function (opts) {
    opts = opts || {};
    if (_isMobile()) {
      return '<div style="background:rgba(132,204,22,0.08);border:1px dashed rgba(132,204,22,0.4);border-radius:12px;padding:12px;font-size:0.8rem;color:var(--text-muted,#cbd5e1);line-height:1.5;">' +
        '🎾 <b>Importar do letzplay</b> é feito no <b>computador</b> — o navegador do celular não instala extensão. Abra o <b>scoreplace no desktop</b> (Chrome/Edge/Brave), logado no letzplay, pra trazer seu histórico.' +
      '</div>';
    }
    var label = opts.label || 'Importar do letzplay';
    if (opts.variant === 'solid') {
      return '<button onclick="window._spStartImport&&window._spStartImport()" class="btn btn-primary btn-sm">🎾 ' + _esc(label) + '</button>';
    }
    return '<button onclick="window._spStartImport&&window._spStartImport()" class="btn btn-primary btn-block" style="margin-top:8px;">🎾 ' + _esc(label) + '</button>';
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
      ? '<div style="margin-top:10px;"><a href="' + _esc(STORE_URL) + '" target="_blank" rel="noopener" class="btn btn-primary">🎾 Instalar extensão</a></div>'
      : '<div style="margin-top:6px;color:#94a3b8;">A extensão ainda não está na Chrome Web Store (em preparação). Por enquanto, instale em modo desenvolvedor:</div>';
    return 'Precisa da extensão do scoreplace pra ler seu histórico na sua sessão logada (sem senha).' + installBtn + _installHelp(STORE_URL ? 'Instalar manualmente' : 'Passo a passo (modo desenvolvedor)');
  }

  function _installHelp(label) {
    // chrome:// não pode ser aberto por link de um site (o Chrome bloqueia por
    // segurança). Então oferecemos um botão que COPIA o endereço pra colar na barra.
    var chromeLine = '<li>Na barra do Chrome, vá em <code>chrome://extensions</code> ' +
      '<button type="button" onclick="var b=this;if(navigator.clipboard){navigator.clipboard.writeText(\'chrome://extensions\').then(function(){b.textContent=\'copiado ✓\';})}" ' +
      'class="btn btn-outline btn-sm" style="margin-left:6px;padding:2px 10px;font-size:0.72rem;">📋 copiar</button>' +
      '<div style="opacity:0.7;font-size:0.72rem;margin-top:2px;">(o Chrome não deixa abrir esse endereço por link — cole na barra e dê Enter)</div></li>';
    return '<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--primary-color,#818cf8);font-weight:600;">' + _esc(label) + '</summary>' +
      '<div style="margin:8px 0 6px;padding:8px 10px;border-radius:8px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);font-size:0.74rem;color:var(--text-muted,#cbd5e1);">⚙️ Instalação <b>temporária</b>, só pra teste enquanto a extensão não está na loja. Quando publicar, vira <b>um clique</b> — nada disso abaixo.</div>' +
      '<ol style="margin:6px 0 0;padding-left:20px;line-height:1.75;">' +
        chromeLine +
        '<li>Nessa página, ligue o interruptor <b>Modo do desenvolvedor</b> (fica no canto superior direito).</li>' +
        '<li>Vai aparecer um botão <b>“Carregar sem compactação”</b> (o Chrome em inglês chama de <i>Load unpacked</i>) — é assim que ele instala uma extensão a partir de uma pasta do computador. Clique nele e escolha a pasta <b>extension</b> do scoreplace.</li>' +
        '<li>Pronto — volte aqui, esta tela reconhece sozinha ✓</li>' +
        '<li><i>Já tinha instalado?</i> No card da extensão, clique no <b>↻ (recarregar)</b> pra pegar a versão nova.</li>' +
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

    // Passo 2 — logado no letzplay (a extensão detecta na sessão do usuário).
    var s2 = (_lzLoggedIn === true) ? DONE : (extOk ? CURRENT : WAIT);
    var s2body = (_lzLoggedIn === true)
      ? 'Logado no letzplay ✓ — a extensão vai ler seu histórico na sua sessão (nenhuma senha passa pelo scoreplace).'
      : ('Abra o letzplay e confirme que está logado (a extensão usa a SUA sessão — nenhuma senha passa pelo scoreplace).' +
         (_lzLoggedIn === false ? '<div style="margin-top:4px;color:#f59e0b;">Ainda não detectei login no letzplay.</div>' : '') +
         '<div style="margin-top:10px;"><a href="https://letzplay.me/u/matches/history" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Abrir meu histórico no letzplay ↗</a></div>');
    html += _stepShell(2, 'Logar no letzplay', s2.ic || '2', s2.col, s2body);

    // Passo 3 — importar
    var s3 = imported ? DONE : (extOk ? CURRENT : WAIT);
    var s3body;
    if (imported) {
      s3body = '<div style="color:#22c55e;font-weight:700;">✅ Importado — ' + games + ' jogos no seu perfil.</div>' +
        '<button onclick="window._spStartImport&&window._spStartImport()" class="btn btn-outline btn-sm" style="margin-top:10px;">🔄 Reimportar</button>';
    } else if (extOk) {
      s3body = 'Tudo pronto — importe com um clique (sem precisar clicar no ícone da extensão):' +
        '<div style="margin-top:10px;"><button onclick="window._spStartImport&&window._spStartImport()" class="btn btn-primary btn-shine">🎾 Importar agora</button></div>';
    } else {
      s3body = 'Depois de instalar a extensão e logar no letzplay, um botão <b>Importar agora</b> aparece aqui.';
    }
    html += _stepShell(3, 'Importar seu histórico', imported ? '✓' : '3', s3.col, s3body);

    // Passo 4 — histórico
    var s4 = imported ? DONE : WAIT;
    html += _stepShell(4, 'Ver seu histórico completo', imported ? '✓' : '4', s4.col,
      imported
        ? 'Pronto! Seu histórico do letzplay agora vive no scoreplace.<div style="margin-top:10px;"><a href="#historico" class="btn btn-primary">📜 Ver Histórico de jogos</a></div>'
        : 'Depois de importar, seus jogos aparecem aqui misturados aos do scoreplace — cronológicos, com filtro por fonte, local e competição.');

    host.innerHTML = html;
  }

  // Só re-renderiza os passos quando o ESTADO muda (extensão presente/versão, jogos,
  // mobile). Sem isso, o poll de 2s re-renderizava sempre e FECHAVA o <details> que o
  // usuário tinha aberto (bug "abre e fecha sozinho"). force=true ignora a assinatura.
  var _lastStepsSig = null;
  function _stepsSig() {
    return [_isMobile(), _ext.present, _ext.version, _gamesCount(), _lzLoggedIn].join('|');
  }
  function _maybeRenderSteps(force) {
    if (!document.getElementById('imp-steps')) return;
    var sig = _stepsSig();
    if (!force && sig === _lastStepsSig) return;
    _lastStepsSig = sig;
    _renderSteps();
  }

  window._renderImportarLetzplayPage = function (container) {
    if (!container) container = document.getElementById('view-container');
    if (!container) return;

    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({ href: '#dashboard', label: 'Voltar', middleHtml: '<span style="font-weight:700;">🎾 Importar do letzplay</span>' })
      : '';

    var intro = '<div style="max-width:640px;margin:0 auto;padding:6px 14px 40px;">' +
      '<div style="background:rgba(132,204,22,0.08);border:1px solid rgba(132,204,22,0.35);border-radius:14px;padding:14px;margin-bottom:14px;">' +
        '<div style="font-size:0.95rem;font-weight:800;color:var(--text-bright,#fff);margin-bottom:4px;">Traga seu histórico do letzplay pro scoreplace.</div>' +
        '<div style="font-size:0.8rem;color:var(--text-muted,#cbd5e1);line-height:1.5;">Uma vez importado, seus jogos vivem no scoreplace pra sempre. <b>Sem senha</b>: a extensão lê na sua própria sessão logada. É um passo único, no computador.</div>' +
      '</div>' +
      '<div id="imp-steps"></div>' +
    '</div>';

    container.innerHTML = hdr + intro;
    _lastStepsSig = null;
    _lzLoggedIn = null;   // re-checa o login do letzplay a cada abertura da página
    _lastLzCheck = 0;
    _maybeRenderSteps(true);

    // Detecção viva: pinga a extensão e revê o estado enquanto a tela está aberta.
    _ping();
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(function () {
      if (!document.getElementById('imp-steps')) { clearInterval(_pollTimer); _pollTimer = null; return; }
      // extensão some do estado se não anunciar por >6s (ex: foi removida)
      if (_ext.present && (Date.now() - _ext.seenAt) > 6000) { _ext.present = false; _ext.version = null; }
      _ping();
      // com a extensão detectada e ainda sem confirmação de login, checa o letzplay
      // (throttle ~6s; para quando confirmar que está logado — 1 fetch por ciclo).
      var _extOk = !_isMobile() && _ext.present && _verGte(_ext.version, MIN_EXT_VERSION);
      if (_extOk && _lzLoggedIn !== true && (Date.now() - _lastLzCheck > 6000)) { _lastLzCheck = Date.now(); _checkLetzplay(); }
      _maybeRenderSteps(); // só re-renderiza se algo mudou → não fecha o <details> aberto
    }, 2000);
  };
})();
