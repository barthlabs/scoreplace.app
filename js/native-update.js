/* Política da loja: inerte na web/PWA. A autorização real continua no servidor. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  var platform = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : window.SCOREPLACE_PLATFORM;
  if (platform !== 'ios' && platform !== 'android') return;
  var core = window.NativeUpdatePolicy;
  if (!core) return;
  var key = 'scoreplace_native_update_policy_v1', policy = null, pending = null, lastFetch = 0;
  var dismissed = '', previousFocus = null;
  try { var cached = JSON.parse(localStorage.getItem(key)); if (core.validate(cached)) policy = cached; } catch (e) {}
  function remove() {
    var el = document.getElementById('sp-native-update');
    if (el) { if (typeof el.close === 'function') el.close(); el.remove(); }
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  function render() {
    if (!document.body || !policy) return;
    var state = core.evaluate(policy, platform, window.SCOREPLACE_VERSION, Date.now());
    if (state.mode === 'none') { remove(); return; }
    if (state.mode === 'invalid') return;
    var required = state.mode === 'required';
    var existing = document.getElementById('sp-native-update');
    if (existing && existing.dataset.mode === state.mode && existing.dataset.minimum === state.minimumVersion) return;
    // Nunca interromper placar/formulário. A exigência aparece ao voltar à tela inicial.
    if (typeof window._isSafeToReload !== 'function' || !window._isSafeToReload()) return;
    if (!required && dismissed === state.minimumVersion + state.enforceAt) return;
    var stores = window.SP_LOJAS || {}, store = stores[platform === 'ios' ? 'apple' : 'play'];
    if (!store || !store.on || !store.url) return;
    remove();
    var box = document.createElement(required ? 'dialog' : 'section');
    box.id = 'sp-native-update'; box.className = 'sp-native-update'; box.dataset.mode = state.mode; box.dataset.minimum = state.minimumVersion;
    if (!required) box.setAttribute('role', 'region');
    box.setAttribute('aria-labelledby', 'sp-native-update-title');
    var title = document.createElement('h2'); title.id = 'sp-native-update-title';
    title.textContent = window._t(required ? 'nativeUpdate.requiredTitle' : 'nativeUpdate.noticeTitle');
    var message = document.createElement('p');
    message.textContent = required ? window._t('nativeUpdate.requiredBody') : window._t('nativeUpdate.noticeBody', { date: new Date(state.enforceAt).toLocaleDateString(document.documentElement.lang || 'pt-BR') });
    var link = document.createElement('a'); link.className = 'btn btn-primary'; link.href = store.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = window._t('nativeUpdate.update', { store: store.nome });
    box.append(title, message, link);
    if (!required) {
      var later = document.createElement('button'); later.type = 'button'; later.className = 'btn btn-secondary'; later.textContent = window._t('nativeUpdate.later');
      later.onclick = function () { dismissed = state.minimumVersion + state.enforceAt; remove(); };
      box.appendChild(later);
    } else box.addEventListener('cancel', function (event) { event.preventDefault(); });
    document.body.appendChild(box);
    if (required) { previousFocus = document.activeElement; box.showModal(); link.focus(); }
  }
  function check() {
    if (document.visibilityState === 'hidden') return Promise.resolve();
    render();
    if (pending || Date.now() - lastFetch < 60000) return pending || Promise.resolve();
    lastFetch = Date.now();
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 10000);
    pending = fetch('https://scoreplace.app/native-update-policy.json', { cache: 'no-store', credentials: 'omit', signal: controller.signal })
      .then(function (r) { if (!r.ok) throw new Error('policy unavailable'); return r.json(); })
      .then(function (next) {
        if (!core.validate(next)) throw new Error('invalid native policy');
        policy = next;
        try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) {}
        render();
      }).catch(function () { /* Mantém somente a última política válida; sem inventar bloqueio. */ })
      .finally(function () { clearTimeout(timeout); pending = null; });
    return pending;
  }
  window._checkNativeUpdatePolicy = check;
  document.addEventListener('visibilitychange', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('hashchange', check);
  setInterval(check, 60000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, { once: true });
  else check();
})();
