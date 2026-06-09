// ─── scoreplace.app — Coachmarks (spotlight tour) ──────────────────────────
// v2.3.24-beta. Substitui o antigo sistema de balões por inatividade (hints.js,
// aposentado). Estilo "spotlight": escurece a tela ~55%, deixa só o elemento
// destacado clicável e mostra um card curto apontando pra ele. Guiado pela
// JORNADA de descoberta do usuário:
//   1) Menu (explica cada item) — uma vez.
//   2) Perfil (se incompleto) — destaca a entrada; some após visitar.
//   3) Dentro do perfil: gênero → nascimento → cidade → modalidades →
//      locais preferidos (só os campos AINDA não preenchidos).
//   4) Ainda no perfil: tamanho da interface → presença → notificações →
//      temas → idioma → como desligar as dicas. Cada uma só uma vez.
//
// Persistência: localStorage scoreplace_coach_v1 = { stepId: 1 }.
// Desligado: localStorage scoreplace_coach_disabled = '1'.
// Tudo é defensivo (try/catch) — coachmark NUNCA pode quebrar o app.
(function () {
  'use strict';

  var SEEN_KEY = 'scoreplace_coach_v1';
  var DISABLED_KEY = 'scoreplace_coach_disabled';
  var SNOOZE_KEY = 'scoreplace_coach_snooze_until';
  var Z = 2000001;
  var PAD = 8; // padding do "buraco" em volta do alvo
  var ARM_MS = 5000;      // após 5s, clicar fora pausa as dicas
  var SNOOZE_MS = 600000; // 10 minutos

  // ── persistência ──────────────────────────────────────────────────────────
  function _seen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function _saveSeen(map) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function isStepSeen(id) { return !!_seen()[id]; }
  function markSeen(id) { var m = _seen(); m[id] = 1; _saveSeen(m); }
  function _snoozeActive() {
    try {
      var until = parseInt(localStorage.getItem(SNOOZE_KEY) || '0', 10);
      return until && Date.now() < until;
    } catch (e) { return false; }
  }
  function isDisabled() {
    try { if (localStorage.getItem(DISABLED_KEY) === '1') return true; } catch (e) {}
    return _snoozeActive();
  }
  function snooze() {
    // pausa temporária (10 min) — pra quem "só quer jogar agora". Volta sozinho.
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch (e) {}
    _teardown();
  }
  function setEnabled(on) {
    try {
      if (on) { localStorage.removeItem(DISABLED_KEY); localStorage.removeItem(SNOOZE_KEY); }
      else localStorage.setItem(DISABLED_KEY, '1');
    } catch (e) {}
    if (!on) _teardown();
  }

  // ── estado runtime ──────────────────────────────────────────────────────────
  var _overlay = null;     // container fixo
  var _queue = [];         // steps restantes do tour atual
  var _idx = 0;            // índice no tour atual
  var _total = 0;          // total de steps visíveis no tour atual
  var _onDone = null;      // callback ao fim do tour
  var _resizeBound = null;
  var _armed = false;      // após 5s, clicar fora pausa as dicas
  var _armTimer = null;

  // ── helpers de DOM ──────────────────────────────────────────────────────────
  function _user() { return (window.AppStore && window.AppStore.currentUser) || null; }
  function _isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    return true;
  }
  // Resolve o alvo de um step. step.el pode ser uma função (retorna elemento) ou
  // um seletor CSS. Retorna o primeiro VISÍVEL.
  function _resolve(step) {
    try {
      if (typeof step.el === 'function') return step.el() || null;
      var list = document.querySelectorAll(step.el);
      for (var i = 0; i < list.length; i++) { if (_isVisible(list[i])) return list[i]; }
      return list.length ? list[0] : null;
    } catch (e) { return null; }
  }

  // ── estilos (injetados uma vez) ───────────────────────────────────────────
  function _ensureStyle() {
    if (document.getElementById('coach-style')) return;
    var s = document.createElement('style');
    s.id = 'coach-style';
    s.textContent =
      '@keyframes coachPulse{0%,100%{box-shadow:0 0 0 2px rgba(251,191,36,0.9),0 0 0 6px rgba(251,191,36,0.25)}50%{box-shadow:0 0 0 2px rgba(251,191,36,0.9),0 0 0 12px rgba(251,191,36,0.05)}}' +
      '.coach-mask{position:fixed;background:rgba(2,6,23,0.55);pointer-events:auto;transition:all 0.18s ease;}' +
      '.coach-hintout{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.35);color:#cbd5e1;font-size:0.74rem;font-weight:600;padding:8px 14px;border-radius:999px;pointer-events:none;opacity:0;transition:opacity 0.3s ease;white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,0.4);}' +
      '.coach-hintout.show{opacity:1;}' +
      '.coach-ring{position:fixed;border-radius:12px;pointer-events:none;animation:coachPulse 1.6s ease-in-out infinite;transition:all 0.18s ease;}' +
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

  // ── render de um step ───────────────────────────────────────────────────────
  function _teardown() {
    if (_armTimer) { clearTimeout(_armTimer); _armTimer = null; }
    _armed = false;
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
    if (_resizeBound) {
      window.removeEventListener('resize', _resizeBound);
      window.removeEventListener('scroll', _resizeBound, true);
      _resizeBound = null;
    }
  }

  function _maskRect(x, y, w, h) {
    var d = document.createElement('div');
    d.className = 'coach-mask';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.width = Math.max(0, w) + 'px'; d.style.height = Math.max(0, h) + 'px';
    // v2.3.25: clicar fora — depois de 5s (armado) pausa as dicas por 10 min,
    // pra quem "só quer jogar". Antes disso, dá tempo de ler (no-op).
    d.addEventListener('click', function (e) {
      e.stopPropagation(); e.preventDefault();
      if (_armed) snooze();
    });
    return d;
  }

  function _drawStep(step) {
    var el = _resolve(step);
    if (!el) { _next(); return; } // alvo sumiu → pula

    // rearma o "clicar fora" a cada passo (dá 5s de leitura antes de liberar)
    _armed = false;
    if (_armTimer) { clearTimeout(_armTimer); _armTimer = null; }

    // garante visível no viewport
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch (e) {}

    requestAnimationFrame(function () {
      if (!_overlay) return;
      _overlay.innerHTML = '';
      var vw = window.innerWidth, vh = window.innerHeight;
      var r = el.getBoundingClientRect();
      var hx = Math.max(0, r.left - PAD), hy = Math.max(0, r.top - PAD);
      var hw = r.width + PAD * 2, hh = r.height + PAD * 2;
      if (hx + hw > vw) hw = vw - hx;
      if (hy + hh > vh) hh = vh - hy;

      // 4 retângulos escuros em volta do buraco
      _overlay.appendChild(_maskRect(0, 0, vw, hy));               // topo
      _overlay.appendChild(_maskRect(0, hy + hh, vw, vh - hy - hh)); // base
      _overlay.appendChild(_maskRect(0, hy, hx, hh));              // esquerda
      _overlay.appendChild(_maskRect(hx + hw, hy, vw - hx - hw, hh)); // direita

      // anel pulsante em volta do alvo
      var ring = document.createElement('div');
      ring.className = 'coach-ring';
      ring.style.left = hx + 'px'; ring.style.top = hy + 'px';
      ring.style.width = hw + 'px'; ring.style.height = hh + 'px';
      _overlay.appendChild(ring);

      // card
      var card = document.createElement('div');
      card.className = 'coach-card';
      var stepLine = _total > 1 ? '<div class="coach-step">' + (_idx + 1) + ' de ' + _total + '</div>' : '';
      var lastStep = _idx >= _total - 1;
      card.innerHTML = stepLine +
        '<h4></h4><p></p>' +
        '<div class="coach-actions">' +
          '<button class="coach-skip" type="button"></button>' +
          '<button class="coach-next" type="button"></button>' +
        '</div>';
      card.querySelector('h4').textContent = step.title || '';
      card.querySelector('p').textContent = step.text || '';
      card.querySelector('.coach-skip').textContent = 'Pular dicas';
      card.querySelector('.coach-next').textContent = lastStep ? 'Entendi' : 'Próximo →';
      card.querySelector('.coach-skip').addEventListener('click', function (e) {
        e.stopPropagation(); _skipAll();
      });
      card.querySelector('.coach-next').addEventListener('click', function (e) {
        e.stopPropagation(); _next();
      });
      _overlay.appendChild(card);

      // aviso "toque fora pra pausar" — só aparece quando o clique-fora arma (5s)
      var hintOut = document.createElement('div');
      hintOut.className = 'coach-hintout';
      hintOut.textContent = '👆 Toque fora pra pausar as dicas por 10 min';
      _overlay.appendChild(hintOut);
      _armTimer = setTimeout(function () {
        _armed = true;
        if (hintOut && hintOut.parentNode) hintOut.classList.add('show');
      }, ARM_MS);

      // posiciona o card: abaixo do alvo se couber, senão acima; clampa horizontal
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
    });
  }

  function _next() {
    if (_idx < _queue.length) markSeen(_queue[_idx].id);
    _idx++;
    if (_idx >= _queue.length) { _finish(); return; }
    _drawStep(_queue[_idx]);
  }
  function _skipAll() {
    // marca todos os steps restantes como vistos (não reaparecem)
    for (var i = _idx; i < _queue.length; i++) markSeen(_queue[i].id);
    _finish();
  }
  function _finish() {
    _teardown();
    var cb = _onDone; _onDone = null;
    _queue = []; _idx = 0; _total = 0;
    if (typeof cb === 'function') { try { cb(); } catch (e) {} }
  }

  // ── runner de tour ──────────────────────────────────────────────────────────
  // steps: [{id, el, title, text, skipIf?}]. Filtra steps já vistos ou skipIf().
  function runTour(steps, onDone) {
    try {
      if (isDisabled()) { if (onDone) onDone(); return; }
      if (_overlay) { if (onDone) onDone(); return; } // já tem um tour rodando
      var pending = (steps || []).filter(function (s) {
        if (isStepSeen(s.id)) return false;
        if (typeof s.skipIf === 'function') { try { if (s.skipIf()) return false; } catch (e) {} }
        return true;
      });
      if (!pending.length) { if (onDone) onDone(); return; }
      _ensureStyle();
      _queue = pending; _idx = 0; _total = pending.length; _onDone = onDone || null;
      _overlay = document.createElement('div');
      _overlay.id = 'coach-overlay';
      _overlay.style.cssText = 'position:fixed;inset:0;z-index:' + Z + ';pointer-events:none;';
      document.body.appendChild(_overlay);
      _resizeBound = function () { if (_overlay && _idx < _queue.length) _drawStep(_queue[_idx]); };
      window.addEventListener('resize', _resizeBound);
      window.addEventListener('scroll', _resizeBound, true);
      _drawStep(_queue[0]);
    } catch (e) { _teardown(); if (onDone) try { onDone(); } catch (_e) {} }
  }

  // ── completude do perfil ────────────────────────────────────────────────────
  function _filled(field) {
    var u = _user(); if (!u) return false;
    var v = u[field];
    if (Array.isArray(v)) return v.length > 0;
    return !!(v && String(v).trim());
  }
  function _profileIncomplete() {
    return !(_filled('gender') && _filled('birthDate') && _filled('city') &&
             _filled('preferredSports') && _filled('preferredLocations'));
  }

  // ── definição dos tours ─────────────────────────────────────────────────────
  // Scope do menu: hamburger aberto (mobile) ou .topbar-menu inline (desktop).
  function _menuScopeSel(inner) {
    var ham = document.querySelector('.hamburger-btn');
    var hamVisible = ham && window.getComputedStyle(ham).display !== 'none';
    var scope = hamVisible ? '#hamburger-dropdown ' : '.topbar-menu ';
    return scope + inner;
  }
  function _menuSteps() {
    return [
      { id: 'menu_inicio', el: function () { return document.querySelector(_menuScopeSel('a[href="#dashboard"]')); }, title: '🏠 Início', text: 'Sua central: torneios, partidas casuais e tudo que importa começa por aqui.' },
      { id: 'menu_notif', el: function () { return document.querySelector(_menuScopeSel('a[href="#notifications"]')); }, title: '🔔 Notificações', text: 'Avisos de sorteios, jogos e convites chegam aqui.' },
      { id: 'menu_tema', el: function () { return document.querySelector(_menuScopeSel('#theme-toggle-btn')); }, title: '🎨 Aparência', text: 'Alterne entre os temas claro e escuro com um toque.' },
      { id: 'menu_ajuda', el: function () { return document.querySelector(_menuScopeSel('button[onclick*="#help"]')); }, title: '❓ Ajuda', text: 'O manual completo do app, sempre que precisar.' },
      { id: 'menu_perfil', el: function () { return document.querySelector(_menuScopeSel('#btn-login')); }, title: '👤 Seu perfil', text: 'Toque aqui pra abrir e completar seu perfil — é o que destrava eventos do seu interesse.' }
    ];
  }
  function _profileFieldSteps() {
    return [
      { id: 'pf_gender', el: '#profile-edit-gender', title: '⚥ Seu gênero', text: 'Define em quais categorias dos torneios você se encaixa (feminino, masculino, misto).', skipIf: function () { return _filled('gender'); } },
      { id: 'pf_birth', el: '#profile-edit-birthdate', title: '🎂 Data de nascimento', text: 'Libera torneios por faixa etária (40+, 50+, 60+...) feitos pra você.', skipIf: function () { return _filled('birthDate'); } },
      { id: 'pf_city', el: '#profile-edit-city', title: '📍 Sua cidade', text: 'Aproxima você de eventos e quadras perto de onde você está.', skipIf: function () { return _filled('city'); } },
      { id: 'pf_sports', el: '#profile-sports-pills', title: '🎾 Modalidades e nível', text: 'Escolha seus esportes e seu nível em cada um — filtramos eventos do seu nível.', skipIf: function () { return _filled('preferredSports'); } },
      { id: 'pf_locations', el: '#profile-location-search', title: '⭐ Locais preferidos', text: 'Cadastre onde você costuma jogar pra achar rapidinho os eventos por lá.', skipIf: function () { return _filled('preferredLocations'); } }
    ];
  }
  function _profileSettingsSteps() {
    return [
      { id: 'ps_uiscale', el: '#profile-ui-scale', title: '🔎 Tamanho da interface', text: 'Deixe tudo maior ou menor, do jeito mais confortável pra você.' },
      { id: 'ps_presence', el: '#presence-visibility-group', title: '📡 Presença no local', text: 'Decida se (e pra quem) o app mostra que você está jogando num local.' },
      { id: 'ps_notif', el: '#profile-notify-platform', title: '🔔 Notificações', text: 'Escolha o que você recebe e por onde: no app, e-mail ou WhatsApp.' },
      { id: 'ps_theme', el: '#theme-btn-group', title: '🎨 Temas', text: 'Quatro aparências pra deixar o app com a sua cara.' },
      { id: 'ps_lang', el: '#profile-lang-flags', title: '🌐 Idioma', text: 'Português ou inglês — você escolhe.' },
      { id: 'ps_hintsoff', el: '#profile-hints-enabled', title: '💡 Dicas', text: 'Quando quiser, desligue as dicas aqui. Elas somem sozinhas conforme você completa o perfil. 😉' }
    ];
  }

  // ── gatilhos públicos ─────────────────────────────────────────────────────
  // Chamado ao renderizar a dashboard (usuário logado).
  function autoStartDashboard() {
    try {
      if (isDisabled() || !_user()) return;
      if (_overlay) return;
      var menuPending = _menuSteps().some(function (s) { return !isStepSeen(s.id); });
      if (menuPending) {
        var hadDropdown = false;
        var ham = document.querySelector('.hamburger-btn');
        var hamVisible = ham && window.getComputedStyle(ham).display !== 'none';
        if (hamVisible && typeof window._toggleHamburger === 'function') {
          var dd = document.getElementById('hamburger-dropdown');
          if (dd && !dd.classList.contains('open')) { window._toggleHamburger(ham); hadDropdown = true; }
        }
        // pequeno atraso pra o dropdown pintar
        setTimeout(function () {
          runTour(_menuSteps(), function () {
            if (hadDropdown && typeof window._closeHamburger === 'function') window._closeHamburger();
            _maybeProfileEntry();
          });
        }, hadDropdown ? 220 : 60);
      } else {
        _maybeProfileEntry();
      }
    } catch (e) {}
  }
  function _maybeProfileEntry() {
    try {
      if (isDisabled() || !_user()) return;
      if (isStepSeen('profile_entry')) return;
      if (!_profileIncomplete()) { markSeen('profile_entry'); return; }
      runTour([{ id: 'profile_entry', el: '#btn-login', title: '👤 Complete seu perfil', text: 'Faltam alguns dados. Toque no seu perfil pra preencher e aproveitar melhor o app.' }]);
    } catch (e) {}
  }
  // Chamado quando o perfil abre.
  function startProfileTour() {
    try {
      if (isDisabled() || !_user()) return;
      markSeen('profile_entry'); // visitou o perfil → não cobra mais a entrada
      // pequeno atraso pra o form montar
      setTimeout(function () {
        var steps = _profileFieldSteps().concat(_profileSettingsSteps());
        runTour(steps);
      }, 400);
    } catch (e) {}
  }

  // ── shim de compat: o toggle do perfil chama window._hintSystem.* ───────────
  window._hintSystem = {
    init: function () {},
    enable: function () { setEnabled(true); },
    disable: function () { setEnabled(false); },
    isDisabled: isDisabled,
    reset: function () { _saveSeen({}); },
    dismiss: function () { _teardown(); },
    forceShow: function () {}
  };
  // mantém o toggle "dicas" visível no perfil (auth.js gateia por isto)
  window._HINTS_ENABLED = true;

  window._coach = {
    runTour: runTour,
    autoStartDashboard: autoStartDashboard,
    startProfileTour: startProfileTour,
    isDisabled: isDisabled,
    setEnabled: setEnabled,
    snooze: snooze,
    reset: function () { _saveSeen({}); },
    _teardown: _teardown
  };
})();
