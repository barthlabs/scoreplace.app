// ─── i18n: Internationalization infrastructure ─────────────────────────────
// Provides _t(key, params) for translated strings.
// Loaded BEFORE all view scripts so _t() is available everywhere.
//
// Lazy loading (v0.17.68): só o dict da lang ativa é carregado no boot,
// via injeção dinâmica em theme.js. _loadLang() abaixo carrega outros dicts
// sob demanda — chamado por _setLang() quando usuário troca idioma.
(function() {
  'use strict';

  // Current language — default 'pt'. Resolução de lang acontece em theme.js
  // (window._initialLang). Aqui usamos esse valor como fonte da verdade pra
  // não duplicar lógica (e pra que o dict carregado seja o que estamos usando).
  window._lang = window._initialLang || localStorage.getItem('scoreplace_lang') || 'pt';

  // Translation dictionaries keyed by language code
  // Populated por i18n-pt.js, i18n-en.js carregados sob demanda
  window._translations = window._translations || {};

  // Tracking de loads em voo pra evitar dupla injeção
  var _loadingPromises = {};
  var _LANG_CACHE_BUSTER = '0.17.70'; // bumpar quando dicts mudarem

  /**
   * Translate a key, with optional parameter interpolation.
   * @param {string} key - Dot-notation key (e.g. 'dashboard.title')
   * @param {Object} [params] - Interpolation values (e.g. {name: 'Ana'})
   * @returns {string} Translated string, or the key itself as fallback
   */
  window._t = function(key, params) {
    var dict = window._translations[window._lang];
    var str = (dict && dict[key]) || key;
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function(k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return str;
  };

  /**
   * Carrega dinamicamente o dict de uma lang se ainda não estiver carregado.
   * @param {string} lang - 'pt' ou 'en'
   * @returns {Promise<boolean>} true quando o dict estiver disponível, false em erro
   */
  window._loadLang = function(lang) {
    if (window._translations[lang]) return Promise.resolve(true);
    if (_loadingPromises[lang]) return _loadingPromises[lang];
    _loadingPromises[lang] = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'js/i18n-' + lang + '.js?v=' + _LANG_CACHE_BUSTER;
      s.async = true;
      s.onload = function () {
        delete _loadingPromises[lang];
        resolve(!!window._translations[lang]);
      };
      s.onerror = function () {
        delete _loadingPromises[lang];
        if (typeof window._warn === 'function') {
          window._warn('[i18n] Falha ao carregar dict:', lang);
        } else {
          window._warn('[i18n] Falha ao carregar dict:', lang);
        }
        resolve(false);
      };
      document.head.appendChild(s);
    });
    return _loadingPromises[lang];
  };

  /**
   * Switch language and re-render current view. Carrega o dict sob demanda
   * se ainda não foi carregado (caso o usuário vá de pt → en pela primeira vez).
   * @param {string} lang - Language code ('pt', 'en')
   */
  // v0.17.88: snapshot do estado do form de perfil pra preservar edições do
  // usuário ao trocar idioma. v0.17.87 rebuildava o modal mas perdia tudo
  // porque _populateProfileModalFields lê de currentUser/Firestore, não do
  // form atual. Snapshot captura values + window vars relevantes (sports[],
  // locations[]); restoreSnapshot reaplica após o rebuild.
  function _snapshotProfileForm() {
    var modal = document.getElementById('modal-profile');
    if (!modal) return null;
    var snap = { fields: {}, attrs: {}, sports: null, locations: null, presenceVis: null };
    // Inputs, selects, textareas: captura .value
    modal.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.id) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        snap.fields[el.id] = !!el.checked;
      } else {
        snap.fields[el.id] = el.value;
      }
      // Telefone tem data-digits separado do value formatado
      if (el.id === 'profile-edit-phone') {
        snap.attrs[el.id] = { 'data-digits': el.getAttribute('data-digits') || '' };
      }
    });
    // Window vars de seleção múltipla (sports, locations)
    if (Array.isArray(window._profileSelectedSports)) {
      snap.sports = window._profileSelectedSports.slice();
    }
    if (Array.isArray(window._profileLocations)) {
      snap.locations = window._profileLocations.slice();
    }
    // v1.3.6-beta: skillBySport map
    if (window._profileSkillBySport && typeof window._profileSkillBySport === 'object') {
      snap.skillBySport = Object.assign({}, window._profileSkillBySport);
    }
    // Visibilidade de presença (hidden input)
    var pv = document.getElementById('profile-presence-visibility');
    if (pv) snap.presenceVis = pv.value;
    return snap;
  }

  function _restoreProfileForm(snap) {
    if (!snap) return;
    Object.keys(snap.fields).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = !!snap.fields[id];
        // Dispara change pra triggerar handlers de toggle (estilos)
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_e) {}
      } else {
        el.value = snap.fields[id];
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_e) {}
      }
    });
    Object.keys(snap.attrs).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      Object.keys(snap.attrs[id]).forEach(function (a) {
        el.setAttribute(a, snap.attrs[id][a]);
      });
    });
    if (snap.sports) {
      window._profileSelectedSports = snap.sports.slice();
      // Re-render dos pills de esporte (helper exposto)
      if (typeof window._applyProfileSportsUI === 'function') {
        window._applyProfileSportsUI(snap.sports);
      }
    }
    if (snap.locations) {
      window._profileLocations = snap.locations.slice();
      // _renderProfileLocationsList é local-scope; re-abrir o modal já
      // popula via _populateProfileModalFields que lê window._profileLocations
      // — então só precisamos garantir que a window var esteja certa.
    }
    // v1.3.6-beta: restaurar skillBySport
    if (snap.skillBySport) {
      window._profileSkillBySport = Object.assign({}, snap.skillBySport);
      if (typeof window._renderProfileSkillBySport === 'function') {
        window._renderProfileSkillBySport();
      }
    }
    if (snap.presenceVis && typeof window._setPresenceVisibility === 'function') {
      window._setPresenceVisibility(snap.presenceVis);
    }
  }

  window._setLang = function(lang) {
    if (!lang) return;
    var apply = function () {
      window._lang = lang;
      try { localStorage.setItem('scoreplace_lang', lang); } catch (e) {}
      document.documentElement.setAttribute('lang', lang === 'pt' ? 'pt-BR' : lang);

      // v1.3.5-beta: perfil agora é rota #profile (não modal-overlay).
      // Detecção atualizada: modal-active OU rota=#profile.
      // Snapshot+restore preservam edições não-salvas durante troca de lang.
      var profileModal = document.getElementById('modal-profile');
      var profileWasOpen = (profileModal && profileModal.classList.contains('active'))
        || (window.location.hash === '#profile');

      if (profileWasOpen) {
        var snap = _snapshotProfileForm();
        // Remove qualquer instância antiga (em body OU em view-container)
        if (profileModal && profileModal.parentNode) profileModal.parentNode.removeChild(profileModal);
        // Limpa qualquer .modal residual no view-container (do route render anterior)
        var viewContainer = document.getElementById('view-container');
        if (viewContainer) {
          var staleModal = viewContainer.querySelector('.modal');
          if (staleModal) staleModal.remove();
        }
        // Rebuild com nova lang
        if (typeof window.setupProfileModal === 'function') {
          window.setupProfileModal();
        }
        // Re-render da página #profile (move .modal pro view-container).
        if (window.location.hash === '#profile' && typeof window.renderProfilePage === 'function' && viewContainer) {
          window.renderProfilePage(viewContainer);
        } else {
          // Profile estava como modal-overlay (legacy/outro contexto) —
          // ativa modal direto, sem reload async.
          var newModal = document.getElementById('modal-profile');
          if (newModal) newModal.classList.add('active');
        }
        // Restaura snapshot: preserva edições do usuário.
        _restoreProfileForm(snap);
        return; // NÃO chama initRouter — page já foi re-renderizada
      }

      // Fora do perfil: comportamento normal — re-render da view.
      if (typeof window.initRouter === 'function') {
        window.initRouter();
      }
    };
    if (window._translations[lang]) {
      apply();
    } else {
      window._loadLang(lang).then(function (ok) {
        if (ok) apply();
        else if (typeof window._warn === 'function') {
          window._warn('[i18n] Lang requested but failed to load:', lang);
        }
      });
    }
  };
})();
