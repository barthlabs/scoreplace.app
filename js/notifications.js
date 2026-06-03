// ========================================
// scoreplace.app — FCM Push Notifications
// ========================================
// Registers FCM token after user login, saves to Firestore user profile.
// The Cloud Function sendPushNotification reads this token to deliver pushes.
// Browser requires user gesture (click) to grant notification permission,
// so we show a banner prompting the user to enable notifications.

var _t = window._t || function(k) { return k; };
// Internal: register FCM token after permission is already granted
window._registerFCMToken = async function() {
  var user = window.AppStore && window.AppStore.currentUser;
  if (!user || !user.uid) return;
  if (!firebase || !firebase.messaging) return;

  try {
    var messaging = firebase.messaging();
    var swReg = await navigator.serviceWorker.ready;

    var vapidKey = 'BKLdZXuFwED9m1XmGz57ektn5vPPsH8TTsHmeAcBHsVwR4ZoRcPIIjv2kUY20S2Hf3kcCP3strJ9CbLGbKJmuSo';
    var token = await messaging.getToken({
      vapidKey: vapidKey,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      // Token obtained successfully
      if (window.FirestoreDB && window.FirestoreDB.db) {
        await window.FirestoreDB.db.collection('users').doc(user.uid).set({
          fcmToken: token,
          fcmTokenUpdatedAt: new Date().toISOString()
        }, { merge: true });
        // Token saved to Firestore
      }
    } else {
      window._warn('[FCM] No token received');
    }

    // Note: onTokenRefresh was removed in Firebase 10+. Token refresh is handled
    // automatically by getToken() on each page load, which already saves the latest token.

    // Handle foreground messages (show as toast notification)
    messaging.onMessage(function(payload) {
      // Foreground message received
      var title = (payload.notification && payload.notification.title) || 'scoreplace.app';
      var body = (payload.notification && payload.notification.body) || '';
      if (typeof showNotification === 'function') {
        showNotification(title, body, 'info');
      }
    });

  } catch (err) {
    window._warn('[FCM] Token registration error:', err);
  }
};

// Called from user click on the "Ativar Notificações" banner button
window._enablePushNotifications = async function() {
  try {
    var permission = await Notification.requestPermission();
    // Permission result received
    // Remove the banner regardless of result
    var banner = document.getElementById('fcm-permission-banner');
    if (banner) banner.remove();

    if (permission === 'granted') {
      // Save preference so banner doesn't show again
      try { localStorage.setItem('scoreplace_fcm_dismissed', 'granted'); } catch(e) {}
      await window._registerFCMToken();
      if (typeof showNotification === 'function') {
        showNotification(_t('notif.fcmEnabled'), _t('notif.fcmEnabledMsg'), 'success');
      }
    } else {
      try { localStorage.setItem('scoreplace_fcm_dismissed', 'denied'); } catch(e) {}
      if (typeof showNotification === 'function') {
        showNotification(_t('notif.fcmBlocked'), _t('notif.fcmBlockedMsg'), 'warning');
      }
    }
  } catch (err) {
    window._warn('[FCM] Permission request error:', err);
  }
};

// Dismiss the banner without asking permission
window._dismissFCMBanner = function() {
  var banner = document.getElementById('fcm-permission-banner');
  if (banner) {
    banner.style.transform = 'translateY(-100%)';
    banner.style.opacity = '0';
    setTimeout(function() { banner.remove(); }, 300);
  }
  try { localStorage.setItem('scoreplace_fcm_dismissed', 'later'); } catch(e) {}
};

// Main init: decides whether to show banner or silently register token
window._initFCM = async function() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    // Browser does not support push notifications
    return;
  }
  if (!firebase || !firebase.messaging) {
    window._warn('[FCM] Firebase Messaging SDK not loaded');
    return;
  }
  var user = window.AppStore && window.AppStore.currentUser;
  if (!user || !user.uid) {
    // No user logged in, skipping FCM init
    return;
  }

  var permission = Notification.permission;

  // Already granted — just register token silently
  if (permission === 'granted') {
    // Permission already granted, registering token
    await window._registerFCMToken();
    return;
  }

  // Already denied — nothing we can do
  if (permission === 'denied') {
    // Permission previously denied by user
    return;
  }

  // Permission is "default" — show a banner if not previously dismissed
  var dismissed = null;
  try { dismissed = localStorage.getItem('scoreplace_fcm_dismissed'); } catch(e) {}
  if (dismissed === 'granted' || dismissed === 'denied') {
    // Banner previously dismissed
    return;
  }

  // Show the permission banner
  // Showing notification permission banner
  var existing = document.getElementById('fcm-permission-banner');
  if (existing) existing.remove();

  var banner = document.createElement('div');
  banner.id = 'fcm-permission-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:center;gap:14px;font-size:0.9rem;box-shadow:0 4px 20px rgba(0,0,0,0.3);transform:translateY(-100%);opacity:0;transition:all 0.4s ease;flex-wrap:wrap;';
  banner.innerHTML =
    '<span style="font-size:1.3rem;">🔔</span>' +
    '<span>Quer receber notificações de torneios, rodadas e resultados?</span>' +
    '<button class="btn btn-sm" onclick="window._enablePushNotifications()" style="background:#fff;color:#3b82f6;">Ativar Notificações</button>' +
    '<button class="btn btn-ghost btn-sm" onclick="window._dismissFCMBanner()">Agora não</button>';
  document.body.appendChild(banner);

  // Animate in
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      banner.style.transform = 'translateY(0)';
      banner.style.opacity = '1';
    });
  });
};

// Helper: sanitize text for safe innerHTML injection
function _safeText(str) {
  if (typeof window._safeHtml === 'function') return window._safeHtml(str);
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Sistema Global de Notificações (Toastings)
// MAX_TOASTS: hard cap to avoid a pile-up when several flows fire in sequence
// (enroll + auto-follow + organizer notify, etc.). Dedup on title+message+type
// collapses near-duplicate bursts into a single toast with a "xN" counter.
var MAX_TOASTS = 3;
function showNotification(title, message, type = 'info') {
  title = _safeText(title);
  message = _safeText(message);

  // Cria o container de toasts se não existir
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 100011;
    `;
    document.body.appendChild(container);
  }

  // Dedup: if an identical toast (same title+message+type) is already showing,
  // bump its counter and restart its auto-dismiss timer instead of stacking.
  var dedupKey = type + '|' + title + '|' + message;
  var existing = container.querySelector('[data-toast-key="' + CSS.escape(dedupKey) + '"]');
  if (existing) {
    var count = parseInt(existing.getAttribute('data-toast-count') || '1', 10) + 1;
    existing.setAttribute('data-toast-count', String(count));
    var badge = existing.querySelector('[data-toast-badge]');
    if (!badge) {
      badge = document.createElement('span');
      badge.setAttribute('data-toast-badge', '1');
      badge.style.cssText = 'display:inline-block;margin-left:8px;padding:1px 7px;border-radius:10px;background:rgba(255,255,255,0.12);font-size:0.7rem;font-weight:700;color:var(--text-bright, #fff);vertical-align:middle;';
      var h4 = existing.querySelector('h4');
      if (h4) h4.appendChild(badge);
    }
    badge.textContent = '×' + count;
    // Restart dismiss timer
    if (existing._dismissTimer) clearTimeout(existing._dismissTimer);
    existing._dismissTimer = setTimeout(() => {
      existing.style.transform = 'translateX(100%)';
      existing.style.opacity = '0';
      setTimeout(() => existing.remove(), 300);
    }, 4000);
    return;
  }

  // Define cores baseadas no tipo
  let bg = 'var(--surface-color)';
  let border = 'var(--primary-color)';
  if(type === 'success') { border = 'var(--success-color)'; }
  else if(type === 'warning') { border = 'var(--warning-color)'; }
  else if(type === 'error') { border = 'var(--danger-color)'; }

  const toast = document.createElement('div');
  toast.setAttribute('data-toast-key', dedupKey);
  toast.setAttribute('data-toast-count', '1');
  toast.style.cssText = `
    background: var(--bg-card, #1e293b);
    border-left: 4px solid ${border};
    border: 1px solid rgba(255,255,255,0.12);
    border-left: 4px solid ${border};
    border-radius: 12px;
    padding: 0.85rem 1rem;
    box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    backdrop-filter: blur(12px);
    min-width: 240px;
    max-width: 320px;
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;

  toast.innerHTML = `
    <h4 style="margin: 0 0 5px 0; color: var(--text-color); font-size: 0.95rem;">${title}</h4>
    <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">${message}</p>
  `;

  container.appendChild(toast);

  // Cap: keep at most MAX_TOASTS visible — drop the oldest ones immediately.
  var toasts = container.querySelectorAll('[data-toast-key]');
  if (toasts.length > MAX_TOASTS) {
    for (var i = 0; i < toasts.length - MAX_TOASTS; i++) {
      var old = toasts[i];
      if (old._dismissTimer) clearTimeout(old._dismissTimer);
      old.style.transform = 'translateX(100%)';
      old.style.opacity = '0';
      setTimeout((function(n) { return function() { n.remove(); }; })(old), 300);
    }
  }

  // AnimIn
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  });

  // AnimOut after 4s
  toast._dismissTimer = setTimeout(() => {
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal de Confirmação Customizado
function showConfirmDialog(title, message, onConfirm, onCancel, options = {}) {
  title = _safeText(title);
  const { confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;
  
  let dialog = document.getElementById('custom-confirm-dialog');
  if (dialog) dialog.remove();

  dialog = document.createElement('div');
  dialog.id = 'custom-confirm-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100010;
  `;

  const colors = {
    warning: { icon: '⚠️', border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    danger: { icon: '🗑️', border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
    info: { icon: 'ℹ️', border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' }
  };
  const c = colors[type] || colors.warning;

  dialog.innerHTML = `
    <div style="
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      max-width: 400px;
      width: 90%;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    ">
      <div style="background: ${c.bg}; border-bottom: 1px solid var(--border-color); padding: 1.25rem; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 2rem;">${c.icon}</span>
        <div>
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-color);">${title}</div>
        </div>
      </div>
      <div style="padding: 1.25rem; color: var(--text-muted); font-size: 0.95rem; line-height: 1.6;">
        ${message}
      </div>
      <div style="padding: 1rem 1.25rem 1.25rem; display: flex; gap: 10px; justify-content: flex-end;">
        <button id="confirm-cancel-btn" style="
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-main);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 10px 20px;
          font-weight: 600;
          font-size: 0.9rem;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s;
        ">${cancelText}</button>
        <button id="confirm-ok-btn" style="
          background: linear-gradient(135deg, ${c.border}, ${c.border}dd);
          color: white;
          border: none;
          padding: 10px 20px;
          font-weight: 700;
          font-size: 0.9rem;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        ">${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeDialog = (result) => {
    dialog.style.opacity = '0';
    dialog.style.transform = 'scale(0.95)';
    setTimeout(() => {
      dialog.remove();
      if (result && typeof onConfirm === 'function') onConfirm();
      else if (!result && typeof onCancel === 'function') onCancel();
    }, 200);
  };

  dialog.querySelector('#confirm-cancel-btn').addEventListener('click', () => closeDialog(false));
  dialog.querySelector('#confirm-ok-btn').addEventListener('click', () => closeDialog(true));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(false); });
}

// Alert Customizado
function showAlertDialog(title, message, onOk, options = {}) {
  title = _safeText(title);
  const { okText = 'OK', type = 'info' } = options;
  
  let dialog = document.getElementById('custom-alert-dialog');
  if (dialog) dialog.remove();

  dialog = document.createElement('div');
  dialog.id = 'custom-alert-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100010;
  `;

  const colors = {
    success: { icon: '✅', border: '#10b981' },
    warning: { icon: '⚠️', border: '#f59e0b' },
    error: { icon: '❌', border: '#ef4444' },
    info: { icon: 'ℹ️', border: '#3b82f6' }
  };
  const c = colors[type] || colors.info;

  dialog.innerHTML = `
    <div style="
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      max-width: 380px;
      width: 90%;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    ">
      <div style="background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-color); padding: 1.25rem; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 2rem;">${c.icon}</span>
        <div>
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-color);">${title}</div>
        </div>
      </div>
      <div style="padding: 1.25rem; color: var(--text-muted); font-size: 0.95rem; line-height: 1.6;">
        ${message}
      </div>
      <div style="padding: 1rem 1.25rem 1.25rem; display: flex; justify-content: center;">
        <button id="alert-ok-btn" style="
          background: linear-gradient(135deg, ${c.border}, ${c.border}dd);
          color: white;
          border: none;
          padding: 10px 32px;
          font-weight: 700;
          font-size: 0.9rem;
          border-radius: 10px;
          cursor: pointer;
        ">${okText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeDialog = () => {
    dialog.style.opacity = '0';
    dialog.style.transform = 'scale(0.95)';
    setTimeout(() => {
      dialog.remove();
      if (typeof onOk === 'function') onOk();
    }, 200);
  };

  dialog.querySelector('#alert-ok-btn').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });
}

// Modal de Input Customizado (substitui prompt)
function showInputDialog(title, message, onSubmit, options = {}) {
  title = _safeText(title);
  const { placeholder = 'Digite aqui...', okText = 'Confirmar', cancelText = 'Cancelar', defaultValue = '' } = options;
  
  let dialog = document.getElementById('custom-input-dialog');
  if (dialog) dialog.remove();

  dialog = document.createElement('div');
  dialog.id = 'custom-input-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100010;
  `;

  dialog.innerHTML = `
    <div style="
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      max-width: 400px;
      width: 90%;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    ">
      <div style="background: rgba(59, 130, 246, 0.1); border-bottom: 1px solid var(--border-color); padding: 1.25rem; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 2rem;">📝</span>
        <div>
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-color);">${title}</div>
        </div>
      </div>
      <div style="padding: 1.25rem;">
        <div style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; margin-bottom: 1rem;">${message}</div>
        <input type="text" id="input-dialog-value" style="
          width: 100%;
          box-sizing: border-box;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background: var(--bg-dark);
          color: var(--text-main);
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
        " placeholder="${placeholder}" value="${defaultValue}">
      </div>
      <div style="padding: 1rem 1.25rem 1.25rem; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
        <button id="input-cancel-btn" style="
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-main);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 10px 20px;
          font-weight: 600;
          font-size: 0.9rem;
          border-radius: 10px;
          cursor: pointer;
        ">${cancelText}</button>
        <button id="input-ok-btn" style="
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          border: none;
          padding: 10px 20px;
          font-weight: 700;
          font-size: 0.9rem;
          border-radius: 10px;
          cursor: pointer;
        ">${okText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = dialog.querySelector('#input-dialog-value');
  input.focus();
  // v1.9.90: .select() lança InvalidStateError em inputs type=email/number em
  // alguns browsers (Sentry SCOREPLACE-WEB-1X/1H). Guarda defensiva.
  try { input.select(); } catch (e) {}

  const handleSubmit = () => {
    const value = input.value.trim();
    dialog.remove();
    if (typeof onSubmit === 'function') onSubmit(value);
  };

  dialog.querySelector('#input-cancel-btn').addEventListener('click', () => {
    dialog.remove();
  });
  dialog.querySelector('#input-ok-btn').addEventListener('click', handleSubmit);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSubmit(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
}

// Modal de Input Múltiplo (para times)
function showMultiInputDialog(title, items, onSubmit, options = {}) {
  const { okText = 'Confirmar', cancelText = 'Cancelar', itemLabel = 'Item' } = options;
  
  let dialog = document.getElementById('custom-multi-input-dialog');
  if (dialog) dialog.remove();

  dialog = document.createElement('div');
  dialog.id = 'custom-multi-input-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100010;
  `;

  const inputsHtml = items.map((item, i) => `
    <div style="margin-bottom: 12px;">
      <label style="display: block; color: var(--text-muted); font-size: 0.85rem; margin-bottom: 6px;">${itemLabel} ${i + 1}</label>
      <input type="text" class="multi-input-field" data-index="${i}" style="
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid var(--border-color);
        background: var(--bg-dark);
        color: var(--text-main);
        font-size: 0.95rem;
        outline: none;
      " placeholder="${item.placeholder || ''}">
    </div>
  `).join('');

  dialog.innerHTML = `
    <div style="
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      max-width: 420px;
      width: 90%;
      max-height: 80vh;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
    ">
      <div style="background: rgba(59, 130, 246, 0.1); border-bottom: 1px solid var(--border-color); padding: 1.25rem; display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
        <span style="font-size: 2rem;">👥</span>
        <div>
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-color);">${title}</div>
        </div>
      </div>
      <div style="padding: 1.25rem; overflow-y: auto; flex: 1;">
        ${inputsHtml}
      </div>
      <div style="padding: 1rem 1.25rem 1.25rem; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--border-color); flex-shrink: 0;">
        <button id="multi-input-cancel-btn" style="
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-main);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 10px 20px;
          font-weight: 600;
          font-size: 0.9rem;
          border-radius: 10px;
          cursor: pointer;
        ">${cancelText}</button>
        <button id="multi-input-ok-btn" style="
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          border: none;
          padding: 10px 20px;
          font-weight: 700;
          font-size: 0.9rem;
          border-radius: 10px;
          cursor: pointer;
        ">${okText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const inputs = dialog.querySelectorAll('.multi-input-field');
  if (inputs.length > 0) inputs[0].focus();

  const handleSubmit = () => {
    const values = Array.from(inputs).map(input => input.value.trim());
    dialog.remove();
    if (typeof onSubmit === 'function') onSubmit(values);
  };

  dialog.querySelector('#multi-input-cancel-btn').addEventListener('click', () => dialog.remove());
  dialog.querySelector('#multi-input-ok-btn').addEventListener('click', handleSubmit);
  
  inputs.forEach((input, i) => {
    input.addEventListener('keypress', (e) => { 
      if (e.key === 'Enter') {
        if (i === inputs.length - 1) handleSubmit();
        else inputs[i + 1].focus();
      }
    });
  });
  
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
}
