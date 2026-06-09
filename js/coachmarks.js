// ─── scoreplace.app — Coachmarks (spotlight tour) ──────────────────────────
// v2.3.26-beta. Dicas no estilo "spotlight": escurece a tela ~55%, deixa só o
// alvo clicável e mostra um card curto apontando pra ele, com um CONTADOR
// circular (5→1) no canto superior direito. Guiado pela jornada de descoberta
// e DISPARADO POR INATIVIDADE (não pisca logo que a tela carrega):
//   • 1ª dica: 10s parado.
//   • Se a pessoa NÃO clicar em "Próximo" durante os 5s do contador, a dica
//     some — e volta após 15s de inatividade (a mesma dica de antes).
//   • Qualquer atividade reinicia o relógio de inatividade (enquanto não há dica
//     na tela) — quem está jogando não é interrompido.
//
// Jornada: menu (cada item) → dentro do perfil: campos que faltam
// (gênero/nascimento/cidade/modalidades/locais) → configurações
// (tamanho/presença/notificações/temas/idioma/desligar). Campo preenchido
// nunca mais aparece (skipIf). "Pular dicas" desliga de vez (reativa no perfil).
//
// Persistência: localStorage scoreplace_coach_v1 = { stepId: 1 } (vistos),
// scoreplace_coach_disabled = '1' (desligado). Tudo defensivo (try/catch).
(function () {
  'use strict';

  var SEEN_KEY = 'scoreplace_coach_v1';
  var DISABLED_KEY = 'scoreplace_coach_disabled';
  var Z = 2000001;
  var PAD = 8;            // padding do "buraco" em volta do alvo
  var IDLE_FIRST = 10000; // 1ª dica após 10s parado
  var IDLE_AGAIN = 15000; // dica volta após 15s parado
  var COUNTDOWN = 8;      // segundos do contador
  var CD_R = 22, CD_C = 2 * Math.PI * CD_R; // raio/circunferência do anel

  // ── persistência ──────────────────────────────────────────────────────────
  // v2.3.35: estado "visto" POR CONTA (uid). Antes era por navegador, então uma
  // conta nova no mesmo navegador herdava as dicas já vistas e nada disparava.
  function _seenKey() {
    var u = _user();
    var uid = (u && u.uid) ? String(u.uid) : 'anon';
    return SEEN_KEY + '_' + uid;
  }
  function _seen() { try { return JSON.parse(localStorage.getItem(_seenKey()) || '{}') || {}; } catch (e) { return {}; } }
  function _saveSeen(m) { try { localStorage.setItem(_seenKey(), JSON.stringify(m)); } catch (e) {} }
  function isStepSeen(id) { return !!_seen()[id]; }
  function markSeen(id) { var m = _seen(); m[id] = 1; _saveSeen(m); }
  function isDisabled() { try { return localStorage.getItem(DISABLED_KEY) === '1'; } catch (e) { return false; } }
  function setEnabled(on) {
    try { if (on) localStorage.removeItem(DISABLED_KEY); else localStorage.setItem(DISABLED_KEY, '1'); } catch (e) {}
    if (!on) _stop();
  }

  // ── estado runtime ──────────────────────────────────────────────────────────
  var _overlay = null;       // container fixo (presente só enquanto a dica aparece)
  var _provider = null;      // função → steps ordenados do contexto atual
  var _context = null;       // 'dashboard' | 'profile'
  var _watching = false;     // listeners de atividade ativos
  var _firstShow = true;     // 10s na 1ª, 15s nas demais
  var _idleTimer = null;
  var _cdTimer = null;
  var _resizeBound = null;
  var _activityBound = null;
  var _current = null;       // step atualmente exibido
  var _openedHam = false;    // abrimos o hamburger pra este step
  var _targetEl = null;      // elemento destacado (pra detectar "seguiu a dica")
  var _targetHandler = null;
  var _nextTimer = null;     // agenda a próxima dica 3s após clicar numa

  // ── helpers DOM ──────────────────────────────────────────────────────────
  function _user() { return (window.AppStore && window.AppStore.currentUser) || null; }
  function _isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    return true;
  }
  function _resolve(step) {
    try {
      if (typeof step.el === 'function') return step.el() || null;
      var list = document.querySelectorAll(step.el);
      for (var i = 0; i < list.length; i++) { if (_isVisible(list[i])) return list[i]; }
      return list.length ? list[0] : null;
    } catch (e) { return null; }
  }

  // ── estilos ──────────────────────────────────────────────────────────────
  function _ensureStyle() {
    if (document.getElementById('coach-style')) return;
    var s = document.createElement('style');
    s.id = 'coach-style';
    s.textContent =
      '@keyframes coachPulse{0%,100%{box-shadow:0 0 0 2px rgba(251,191,36,0.9),0 0 0 6px rgba(251,191,36,0.25)}50%{box-shadow:0 0 0 2px rgba(251,191,36,0.9),0 0 0 12px rgba(251,191,36,0.05)}}' +
      '.coach-mask{position:fixed;background:rgba(2,6,23,0.70);pointer-events:auto;transition:all 0.18s ease;}' +
      '.coach-ring{position:fixed;border-radius:12px;pointer-events:none;animation:coachPulse 1.6s ease-in-out infinite;transition:all 0.18s ease;}' +
      '.coach-cd{position:fixed;top:14px;left:14px;width:54px;height:54px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2;}' +
      '.coach-cd svg{position:absolute;top:0;left:0;transform:rotate(-90deg);}' +
      '.coach-cd-track{fill:none;stroke:rgba(255,255,255,0.18);stroke-width:4;}' +
      '.coach-cd-prog{fill:none;stroke:#fbbf24;stroke-width:4;stroke-linecap:round;}' +
      '.coach-cd-num{position:relative;font-size:1.2rem;font-weight:800;color:#fbbf24;font-variant-numeric:tabular-nums;text-shadow:0 1px 4px rgba(0,0,0,0.6);}' +
      '.coach-card{position:fixed;max-width:300px;background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid rgba(251,191,36,0.45);border-radius:14px;padding:16px 16px 14px;box-shadow:0 12px 40px rgba(0,0,0,0.55);pointer-events:auto;color:#e2e8f0;z-index:1;}' +
      '.coach-card h4{margin:0 0 6px;font-size:0.98rem;font-weight:800;color:#fbbf24;letter-spacing:0.2px;}' +
      '.coach-card p{margin:0 0 12px;font-size:0.86rem;line-height:1.45;color:#e2e8f0;}' +
      '.coach-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;}' +
      '.coach-skip{background:none;border:none;color:#94a3b8;font-size:0.74rem;cursor:pointer;text-decoration:underline;text-underline-offset:2px;padding:4px 2px;}' +
      '.coach-next{background:linear-gradient(135deg,#f59e0b,#fbbf24);border:none;color:#0f172a;font-size:0.84rem;font-weight:800;border-radius:9px;padding:9px 18px;cursor:pointer;box-shadow:0 4px 14px rgba(251,191,36,0.3);}' +
      '.coach-step{font-size:0.7rem;color:#64748b;font-weight:700;margin-bottom:8px;letter-spacing:0.5px;}' +
      '@media (max-width:600px){.coach-card{max-width:calc(100vw - 28px);}}';
    document.head.appendChild(s);
  }

  // ── teardown ──────────────────────────────────────────────────────────────
  function _clearCountdown() { if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null; } }
  function _clearNext() { if (_nextTimer) { clearTimeout(_nextTimer); _nextTimer = null; } }
  function _detachTarget() {
    if (_targetEl && _targetHandler) { try { _targetEl.removeEventListener('click', _targetHandler, true); } catch (e) {} }
    _targetEl = null; _targetHandler = null;
  }
  function _closeHamIfOpened() {
    if (_openedHam && typeof window._closeHamburger === 'function') { try { window._closeHamburger(); } catch (e) {} }
    _openedHam = false;
  }
  // remove só a dica da tela (mantém o watcher de inatividade)
  function _hide() {
    _clearCountdown();
    _clearNext();
    _detachTarget();
    if (_resizeBound) {
      window.removeEventListener('resize', _resizeBound);
      window.removeEventListener('scroll', _resizeBound, true);
      _resizeBound = null;
    }
    var node = _overlay;
    _overlay = null;
    _current = null;
    if (node) {
      // fade-out suave; durante o fade não bloqueia cliques (máscaras → none)
      try { var ms = node.querySelectorAll('.coach-mask'); for (var i = 0; i < ms.length; i++) ms[i].style.pointerEvents = 'none'; } catch (e) {}
      node.style.opacity = '0';
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 280);
    }
    _closeHamIfOpened();
  }
  // para tudo: esconde a dica E desliga o watcher
  function _stop() {
    _hide();
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    if (_activityBound) {
      ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(function (ev) {
        document.removeEventListener(ev, _activityBound, true);
      });
      _activityBound = null;
    }
    _watching = false;
    _provider = null;
    _context = null;
  }

  // ── inatividade ─────────────────────────────────────────────────────────
  function _armIdle() {
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    if (isDisabled() || !_provider || _overlay) return;
    _idleTimer = setTimeout(_idleFire, _firstShow ? IDLE_FIRST : IDLE_AGAIN);
  }
  function _onActivity() {
    // só conta enquanto NÃO há dica na tela (durante a dica o contador manda)
    if (_overlay) return;
    _armIdle();
  }
  function _startWatch() {
    if (_watching) return;
    _watching = true;
    _activityBound = function () { _onActivity(); };
    ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(function (ev) {
      document.addEventListener(ev, _activityBound, true);
    });
  }
  function _idleFire() {
    try {
      if (isDisabled() || !_provider || _overlay || !_user()) return;
      var pending = _pending();
      if (!pending.length) return; // nada a mostrar
      _showStep(pending[0]);
    } catch (e) { _hide(); }
  }
  function _pending() {
    if (!_provider) return [];
    var all;
    try { all = _provider() || []; } catch (e) { all = []; }
    return all.filter(function (s) {
      if (isStepSeen(s.id)) return false;
      if (typeof s.skipIf === 'function') { try { if (s.skipIf()) return false; } catch (e) {} }
      // waitFor: adia o step (NÃO marca visto) até a condição ser satisfeita —
      // ex.: dicas dos itens do menu esperam o usuário abrir o hamburger.
      if (typeof s.waitFor === 'function') { try { if (!s.waitFor()) return false; } catch (e) {} }
      return true;
    });
  }

  // ── render de um step ───────────────────────────────────────────────────────
  function _maskRect(x, y, w, h) {
    var d = document.createElement('div');
    d.className = 'coach-mask';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.width = Math.max(0, w) + 'px'; d.style.height = Math.max(0, h) + 'px';
    // clicar fora = dispensa antecipada (volta após 15s parado)
    d.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); _autoDismiss(); });
    return d;
  }

  function _showStep(step) {
    // v2.3.33: NÃO abrimos o hamburger automaticamente. As dicas dos itens do
    // menu têm waitFor=_menuReady e só aparecem depois que o USUÁRIO abre o
    // hamburger. Aqui é só renderizar.
    _render(step);
  }

  function _render(step) {
    var el = _resolve(step);
    // alvo indisponível (ex.: usuário fechou o hamburger no meio) → adia SEM
    // marcar visto; volta quando reabrir + ficar parado.
    if (!el) { _firstShow = false; _hide(); _armIdle(); return; }

    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch (e) {}

    requestAnimationFrame(function () {
      _ensureStyle();
      if (!_overlay) {
        _overlay = document.createElement('div');
        _overlay.id = 'coach-overlay';
        _overlay.style.cssText = 'position:fixed;inset:0;z-index:' + Z + ';pointer-events:none;opacity:0;transition:opacity 0.28s ease;';
        document.body.appendChild(_overlay);
        var _ov0 = _overlay;
        requestAnimationFrame(function () { if (_ov0) _ov0.style.opacity = '1'; }); // fade-in suave
        _resizeBound = function () { if (_overlay && _current) _render(_current); };
        window.addEventListener('resize', _resizeBound);
        window.addEventListener('scroll', _resizeBound, true);
      }
      _current = step;
      // "seguiu a dica": clicar no elemento destacado marca como vista (não volta).
      // Re-anexa a cada render (resize/scroll) sem empilhar listeners.
      _detachTarget();
      _targetEl = el;
      _targetHandler = function () { _engaged(step); };
      el.addEventListener('click', _targetHandler, true);
      _overlay.innerHTML = '';
      var vw = window.innerWidth, vh = window.innerHeight;
      var r = el.getBoundingClientRect();
      var hx = Math.max(0, r.left - PAD), hy = Math.max(0, r.top - PAD);
      var hw = r.width + PAD * 2, hh = r.height + PAD * 2;
      if (hx + hw > vw) hw = vw - hx;
      if (hy + hh > vh) hh = vh - hy;

      _overlay.appendChild(_maskRect(0, 0, vw, hy));
      _overlay.appendChild(_maskRect(0, hy + hh, vw, vh - hy - hh));
      _overlay.appendChild(_maskRect(0, hy, hx, hh));
      _overlay.appendChild(_maskRect(hx + hw, hy, vw - hx - hw, hh));

      var ring = document.createElement('div');
      ring.className = 'coach-ring';
      ring.style.left = hx + 'px'; ring.style.top = hy + 'px';
      ring.style.width = hw + 'px'; ring.style.height = hh + 'px';
      _overlay.appendChild(ring);

      // contador circular (canto superior ESQUERDO — sempre)
      var cd = document.createElement('div');
      cd.className = 'coach-cd';
      cd.innerHTML =
        '<svg width="54" height="54" viewBox="0 0 54 54">' +
          '<circle class="coach-cd-track" cx="27" cy="27" r="' + CD_R + '"></circle>' +
          '<circle class="coach-cd-prog" cx="27" cy="27" r="' + CD_R + '" stroke-dasharray="' + CD_C.toFixed(1) + '" stroke-dashoffset="' + CD_C.toFixed(1) + '"></circle>' +
        '</svg><span class="coach-cd-num">' + COUNTDOWN + '</span>';
      _overlay.appendChild(cd);

      // card — "X de N" estável: posição entre os steps APLICÁVEIS (ignora os
      // pulados por skipIf, mas conta os já vistos pra não regredir o total).
      var card = document.createElement('div');
      card.className = 'coach-card';
      var applicable = [];
      try {
        applicable = (_provider() || []).filter(function (s) {
          return !(typeof s.skipIf === 'function' && (function () { try { return s.skipIf(); } catch (e) { return false; } })());
        });
      } catch (e) { applicable = []; }
      var totalAppl = applicable.length;
      var curPos = 0; for (var i = 0; i < applicable.length; i++) { if (applicable[i].id === step.id) { curPos = i; break; } }
      var stepLine = totalAppl > 1 ? '<div class="coach-step">' + (curPos + 1) + ' de ' + totalAppl + '</div>' : '';
      var lastStep = (curPos + 1) >= totalAppl;
      card.innerHTML = stepLine + '<h4></h4><p></p>' +
        '<div class="coach-actions"><button class="coach-skip" type="button"></button><button class="coach-next" type="button"></button></div>';
      card.querySelector('h4').textContent = step.title || '';
      card.querySelector('p').textContent = step.text || '';
      card.querySelector('.coach-skip').textContent = 'Pular dicas';
      card.querySelector('.coach-next').textContent = lastStep ? 'Entendi' : 'Próximo →';
      card.querySelector('.coach-skip').addEventListener('click', function (e) { e.stopPropagation(); _skipAll(); });
      card.querySelector('.coach-next').addEventListener('click', function (e) { e.stopPropagation(); _engaged(step); });
      _overlay.appendChild(card);

      // posiciona o card
      requestAnimationFrame(function () {
        var cw = card.offsetWidth, ch = card.offsetHeight;
        var top, left = hx + hw / 2 - cw / 2;
        if (left < 12) left = 12;
        if (left + cw > vw - 12) left = vw - 12 - cw;
        var below = hy + hh + 12;
        if (below + ch <= vh - 12) top = below;
        else if (hy - ch - 12 >= 12) top = hy - ch - 12;
        else top = Math.max(12, Math.min(vh - ch - 12, hy + hh + 12));
        card.style.left = left + 'px';
        card.style.top = top + 'px';
      });

      // dispara o contador (anel preenche em COUNTDOWN s, número 5→1)
      _startCountdown(cd);
    });
  }

  function _startCountdown(cd) {
    _clearCountdown();
    var prog = cd.querySelector('.coach-cd-prog');
    var num = cd.querySelector('.coach-cd-num');
    var left = COUNTDOWN;
    if (num) num.textContent = left;
    // anel preenche de 0% → 100% ao longo de COUNTDOWN s
    if (prog) {
      prog.style.transition = 'none';
      prog.style.strokeDashoffset = CD_C.toFixed(1);
      requestAnimationFrame(function () {
        prog.style.transition = 'stroke-dashoffset ' + COUNTDOWN + 's linear';
        prog.style.strokeDashoffset = '0';
      });
    }
    _cdTimer = setInterval(function () {
      left--;
      if (left <= 0) { _clearCountdown(); _autoDismiss(); return; }
      if (num) num.textContent = left;
    }, 1000);
  }

  // ── transições ──────────────────────────────────────────────────────────
  // v2.3.37: ao clicar numa dica (botão "Próximo" OU o elemento destacado),
  // marca como vista e dispara a PRÓXIMA em 3s — nem imediato, nem esperando o
  // idle. Dá um respiro pra ação acontecer (ex.: o menu terminar de abrir).
  function _scheduleNext(ms) {
    _clearNext();
    _nextTimer = setTimeout(function () {
      _nextTimer = null;
      if (isDisabled() || !_provider || _overlay || !_user()) return;
      var next = _pending()[0];
      if (next) _showStep(next);
      else _armIdle(); // nada elegível agora (ex.: itens esperando o hamburger) → modo idle
    }, ms);
  }
  function _engaged(step) {
    if (step) markSeen(step.id);
    _firstShow = false;
    _hide();
    _scheduleNext(3000);
  }
  function _autoDismiss() {
    // não clicou durante o contador → some e volta após 15s parado
    _firstShow = false;
    _hide();
    _armIdle();
  }
  function _skipAll() {
    // desliga as dicas de vez (reativa no perfil)
    setEnabled(false);
  }

  // ── completude do perfil ────────────────────────────────────────────────
  function _filled(field) {
    var u = _user(); if (!u) return false;
    var v = u[field];
    if (Array.isArray(v)) return v.length > 0;
    return !!(v && String(v).trim());
  }
  // true se o campo já tem valor no perfil OU já foi digitado no DOM (mesmo
  // antes de salvar) — preencher encerra a dica.
  function _fieldHasValue(field, inputId) {
    if (_filled(field)) return true;
    try { var el = document.getElementById(inputId); if (el && el.value && String(el.value).trim()) return true; } catch (e) {}
    return false;
  }

  // ── re-engajamento (v2.3.36) ────────────────────────────────────────────────
  // Se o usuário some por 7+ dias E o comportamento não condiz com quem domina
  // o app (perfil incompleto, OU sem amigos, OU sem torneios/partidas), reseta
  // TODO o progresso das dicas pra rodar o tour completo de novo.
  function _profileIncomplete() {
    return !(_filled('gender') && _filled('birthDate') && _filled('city') &&
             _filled('preferredSports') && _filled('preferredLocations'));
  }
  function _noFriends() {
    var u = _user(); var f = u && u.friends;
    return !(Array.isArray(f) && f.length > 0);
  }
  function _noActivity() {
    try {
      var S = window.AppStore;
      if (S && typeof S.getMyParticipations === 'function' && (S.getMyParticipations() || []).length > 0) return false;
      if (S && typeof S.getMyOrganized === 'function' && (S.getMyOrganized() || []).length > 0) return false;
      var u = _user();
      if (u && Array.isArray(u.matchHistory) && u.matchHistory.length > 0) return false;
    } catch (e) {}
    return true;
  }
  function _looksNew() { return _profileIncomplete() || _noFriends() || _noActivity(); }
  var _reengageDone = false;
  function _maybeReengage() {
    if (_reengageDone) return;
    _reengageDone = true;
    try {
      var u = _user(); var uid = (u && u.uid) ? String(u.uid) : 'anon';
      var key = 'scoreplace_coach_seenat_' + uid;
      var last = parseInt(localStorage.getItem(key) || '0', 10);
      var now = Date.now();
      // 7+ dias longe E "parece novo" → reseta tudo (tour completo de novo)
      if (last && (now - last) >= 7 * 86400000 && _looksNew()) {
        _saveSeen({});
      }
      localStorage.setItem(key, String(now));
    } catch (e) {}
  }

  // ── definição dos tours ─────────────────────────────────────────────────
  function _menuScopeSel(inner) {
    var ham = document.querySelector('.hamburger-btn');
    var hamVisible = ham && window.getComputedStyle(ham).display !== 'none';
    return (hamVisible ? '#hamburger-dropdown ' : '.topbar-menu ') + inner;
  }
  function _hamVisible() {
    var ham = document.querySelector('.hamburger-btn');
    return !!(ham && window.getComputedStyle(ham).display !== 'none');
  }
  function _hamOpen() {
    var d = document.getElementById('hamburger-dropdown');
    return !!(d && d.classList.contains('open'));
  }
  // v2.3.39: as dicas do menu/hamburger SÓ podem aparecer na DASHBOARD — nunca
  // no perfil ou em outra página (mesmo que o contexto "vaze" via _scheduleNext).
  function _isDashboardRoute() {
    var h = (window.location.hash || '').toLowerCase();
    return h === '' || h === '#' || h.indexOf('#dashboard') === 0;
  }
  // menu "pronto" pras dicas dos itens: precisa estar na dashboard E (desktop
  // com menu inline OU o usuário já abriu o hamburger).
  function _menuReady() { return _isDashboardRoute() && (!_hamVisible() || _hamOpen()); }
  // 1ª dica: ensina a abrir o hamburger — SÓ na dashboard, com o menu fechado.
  function _menuOpenStep() {
    return { id: 'menu_open', el: function () { return document.querySelector('.hamburger-btn'); }, title: '☰ Abrir o menu', text: 'Toque aqui pra abrir o menu com tudo que o app oferece.', skipIf: function () { return !_hamVisible(); }, waitFor: function () { return _isDashboardRoute() && !_hamOpen(); } };
  }
  function _menuSteps() {
    // v2.3.35: com o menu aberto, as dicas seguem a ordem da DIREITA pra ESQUERDA
    // da topbar: Perfil (botão de login, mais à direita) → Ajuda → Tema →
    // Notificações → Início (mais à esquerda).
    return [
      _menuOpenStep(),
      { id: 'menu_perfil', waitFor: _menuReady, el: function () { return document.querySelector(_menuScopeSel('#btn-login')); }, title: '👤 Seu perfil', text: 'Toque aqui pra abrir e completar seu perfil — é o que destrava eventos do seu interesse.' },
      { id: 'menu_ajuda', waitFor: _menuReady, el: function () { return document.querySelector(_menuScopeSel('button[onclick*="#help"]')); }, title: '❓ Ajuda', text: 'O manual completo do app, sempre que precisar.' },
      { id: 'menu_tema', waitFor: _menuReady, el: function () { return document.querySelector(_menuScopeSel('#theme-toggle-btn')); }, title: '🎨 Aparência', text: 'Alterne entre os temas claro e escuro com um toque.' },
      { id: 'menu_notif', waitFor: _menuReady, el: function () { return document.querySelector(_menuScopeSel('a[href="#notifications"]')); }, title: '🔔 Notificações', text: 'Avisos de sorteios, jogos e convites chegam aqui.' },
      { id: 'menu_inicio', waitFor: _menuReady, el: function () { return document.querySelector(_menuScopeSel('a[href="#dashboard"]')); }, title: '🏠 Início', text: 'Sua central: torneios, partidas casuais e tudo que importa. Clique aqui a qualquer momento e volte para essa tela inicial.' }
    ];
  }
  function _profileSteps() {
    return [
      { id: 'pf_save', el: '#profile-save-btn', title: '💾 Salvar', text: 'Sempre que mudar algo no seu perfil, toque em Salvar pra gravar as alterações.' },
      { id: 'pf_gender', el: '#profile-edit-gender', title: '⚥ Seu gênero', text: 'Define em quais categorias dos torneios você se encaixa (feminino, masculino, misto).', skipIf: function () { return _fieldHasValue('gender', 'profile-edit-gender'); } },
      { id: 'pf_birth', el: '#profile-edit-birthdate', title: '🎂 Data de nascimento', text: 'Libera torneios por faixa etária (40+, 50+, 60+...) feitos pra você.', skipIf: function () { return _fieldHasValue('birthDate', 'profile-edit-birthdate'); } },
      { id: 'pf_city', el: '#profile-edit-city', title: '📍 Sua cidade', text: 'Aproxima você de eventos e quadras perto de onde você está.', skipIf: function () { return _fieldHasValue('city', 'profile-edit-city'); } },
      { id: 'pf_sports', el: '#profile-sports-pills', title: '🎾 Modalidades e nível', text: 'Escolha seus esportes e seu nível em cada um — filtramos eventos do seu nível.', skipIf: function () { return _filled('preferredSports'); } },
      { id: 'pf_locations', el: '#profile-location-search', title: '⭐ Locais preferidos', text: 'Cadastre onde você costuma jogar pra achar rapidinho os eventos por lá.', skipIf: function () { return _filled('preferredLocations'); } },
      { id: 'ps_uiscale', el: '#profile-ui-scale', title: '🔎 Tamanho da interface', text: 'Deixe tudo maior ou menor, do jeito mais confortável pra você.' },
      { id: 'ps_presence', el: '#presence-visibility-group', title: '📡 Presença no local', text: 'Decida se (e pra quem) o app mostra que você está jogando num local.' },
      { id: 'ps_notif', el: '#profile-notify-platform', title: '🔔 Notificações', text: 'Escolha o que você recebe e por onde: no app, e-mail ou WhatsApp.' },
      { id: 'ps_theme', el: '#theme-btn-group', title: '🎨 Temas', text: 'Quatro aparências pra deixar o app com a sua cara.' },
      { id: 'ps_lang', el: '#profile-lang-flags', title: '🌐 Idioma', text: 'Português ou inglês — você escolhe.' },
      { id: 'ps_hintsoff', el: '#profile-hints-enabled', title: '💡 Dicas', text: 'Quando quiser, desligue as dicas aqui. Elas somem sozinhas conforme você completa o perfil. 😉' }
    ];
  }

  // v2.3.41: helper — pula um step cujo alvo não existe/está invisível AGORA
  // (seções opcionais: convites, preferidos, etc.). Não marca visto → reaparece
  // numa próxima visita se o elemento existir.
  function _missing(sel) {
    try { var e = document.querySelector(sel); if (!e) return true; var r = e.getBoundingClientRect(); return r.width <= 0 || r.height <= 0; }
    catch (e2) { return true; }
  }
  function _miss(sel) { return function () { return _missing(sel); }; }

  // Botões da hero box da dashboard (Place, Pessoas, Ler QR, Convidar) — só na
  // rota da dashboard. Cobrem a "porta de entrada" de cada funcionalidade.
  function _heroSteps() {
    return [
      { id: 'dash_place', el: '#btn-place', waitFor: _isDashboardRoute, title: '📍 Place', text: 'Ache quadras e arenas perto de você e marque presença pra avisar os amigos.' },
      { id: 'dash_people', el: '#btn-people', waitFor: _isDashboardRoute, title: '👥 Pessoas', text: 'Encontre outros jogadores, adicione amigos e veja quem joga o quê.' },
      { id: 'dash_qr', el: '#btn-scan-qr', waitFor: _isDashboardRoute, title: '📷 Ler QR Code', text: 'Aponte a câmera num QR de torneio ou partida pra entrar na hora — ou digite o código.' },
      { id: 'dash_invite', el: '#btn-invite-app', waitFor: _isDashboardRoute, title: '📱 Convidar', text: 'Chame amigos pro app: mostre o QR ou compartilhe o link de convite.' }
    ];
  }
  function _dashboardSteps() { return _menuSteps().concat(_heroSteps()); }

  // Pessoas (#explore)
  function _exploreSteps() {
    return [
      { id: 'ex_search', el: '#explore-search-input', title: '🔍 Buscar pessoas', text: 'Procure jogadores por nome, cidade ou esporte.' },
      { id: 'ex_pending', el: '#explore-pending', title: '📨 Convites recebidos', text: 'Pedidos de amizade pra você aceitar ou recusar aparecem aqui.', skipIf: _miss('#explore-pending') },
      { id: 'ex_results', el: '#explore-results', title: '➕ Outros jogadores', text: 'Pessoas que ainda não são suas amigas — toque em adicionar pra mandar um pedido de amizade.', skipIf: _miss('#explore-results') },
      { id: 'ex_friends', el: '#explore-friends', title: '🤝 Seus amigos', text: 'Quem você já tem como amigo — veja perfis, parcerias e jogos em comum.', skipIf: _miss('#explore-friends') },
      { id: 'ex_sent', el: '#explore-sent', title: '✉️ Convites enviados', text: 'Pedidos que você mandou e aguardam resposta — dá pra cancelar.', skipIf: _miss('#explore-sent') }
    ];
  }

  // Place (#place / #venues)
  function _placeSteps() {
    return [
      { id: 'pl_sports', el: '#venues-sport-pills', title: '🎾 Modalidades', text: 'Filtre os locais pelas modalidades que você joga (pode escolher mais de uma).', skipIf: _miss('#venues-sport-pills') },
      { id: 'pl_search', el: '#venues-location', title: '🔎 Buscar local', text: 'Procure um local por nome, endereço ou bairro.', skipIf: _miss('#venues-location') },
      { id: 'pl_gps', el: '#venues-geo-btn', title: '📍 Sua localização', text: 'Use o GPS pra centrar o mapa e achar locais perto de você.', skipIf: _miss('#venues-geo-btn') },
      { id: 'pl_map', el: '#venues-map', title: '🗺️ Mapa', text: 'Os pins são os locais; o círculo mostra o seu raio de busca.', skipIf: _miss('#venues-map') },
      { id: 'pl_checkin', el: '[id^="pref-checkin-btn-"]', title: '📍 Estou aqui agora', text: 'Nos seus locais preferidos, avise que está jogando agora — os amigos veem.', skipIf: _miss('[id^="pref-checkin-btn-"]') },
      { id: 'pl_plan', el: '[id^="pref-plan-btn-"]', title: '🗓️ Planejar ida', text: 'Marque que vai jogar mais tarde e combine com a galera.', skipIf: _miss('[id^="pref-plan-btn-"]') },
      { id: 'pl_results', el: '#venues-results', title: '🏟️ Locais perto', text: 'Toque num card pra ver detalhes, horários e quem está por lá.', skipIf: _miss('#venues-results') },
      { id: 'pl_register', el: '#venues-register-btn', title: '➕ Cadastrar local', text: 'Não achou seu local? Cadastre você mesmo e adicione as quadras.', skipIf: _miss('#venues-register-btn') }
    ];
  }

  // Convidar (#invite)
  function _inviteSteps() {
    return [
      { id: 'iv_qr', el: '#qr-code-img', title: '📱 Convide com QR', text: 'Peça pro seu amigo apontar a câmera nesse QR pra entrar no app já te seguindo.' },
      { id: 'iv_copy', el: '#invite-copy-btn', title: '📋 Copiar link', text: 'Copie o link do convite pra mandar em qualquer app.', skipIf: _miss('#invite-copy-btn') },
      { id: 'iv_download', el: '#invite-download-btn', title: '💾 Baixar QR', text: 'Salve a imagem do QR pra postar ou enviar.', skipIf: _miss('#invite-download-btn') },
      { id: 'iv_print', el: '#invite-print-btn', title: '🖨️ Imprimir', text: 'Imprima o QR pra deixar no seu clube ou quadra.', skipIf: _miss('#invite-print-btn') }
    ];
  }

  // ── gatilhos públicos ─────────────────────────────────────────────────────
  function _init(context, providerFn) {
    try {
      if (isDisabled() || !_user()) { _stop(); return; }
      _maybeReengage(); // 1x por sessão: pode resetar o progresso e re-rodar o tour
      if (_context === context && _watching) return; // já rodando neste contexto
      _stop();
      _context = context;
      _provider = providerFn;
      _firstShow = true;
      _startWatch();
      _armIdle();
    } catch (e) { _stop(); }
  }
  function autoStartDashboard() { _init('dashboard', _dashboardSteps); }
  // v2.3.34: contas novas caem direto no perfil → aqui as dicas dos CAMPOS do
  // perfil vêm primeiro (sem o hamburger). As dicas do hamburger/menu rodam
  // no contexto da dashboard (autoStartDashboard / _menuSteps).
  function startProfileTour() {
    // visitou o perfil → não cobra mais a entrada no menu
    try { markSeen('profile_entry'); } catch (e) {}
    _init('profile', _profileSteps);
  }
  function startExploreTour() { _init('explore', _exploreSteps); }
  function startPlaceTour() { _init('place', _placeSteps); }
  function startInviteTour() { _init('invite', _inviteSteps); }

  // v2.3.41: cada tela tem seu próprio tour, escopado pela rota. Ao navegar,
  // para o tour atual — a render da nova tela rearma o tour dela. Soft-refresh
  // (snapshot, sem mudança de hash) não dispara hashchange, então não reseta.
  window.addEventListener('hashchange', function () { _stop(); });

  // ── shim de compat: o toggle do perfil chama window._hintSystem.* ───────────
  window._hintSystem = {
    init: function () {},
    enable: function () { setEnabled(true); },
    disable: function () { setEnabled(false); },
    isDisabled: isDisabled,
    reset: function () { _saveSeen({}); },
    dismiss: function () { _hide(); },
    forceShow: function () {}
  };
  window._HINTS_ENABLED = true;

  window._coach = {
    autoStartDashboard: autoStartDashboard,
    startProfileTour: startProfileTour,
    startExploreTour: startExploreTour,
    startPlaceTour: startPlaceTour,
    startInviteTour: startInviteTour,
    isDisabled: isDisabled,
    setEnabled: setEnabled,
    reset: function () { _saveSeen({}); },
    _stop: _stop,
    _teardown: _hide
  };
})();
