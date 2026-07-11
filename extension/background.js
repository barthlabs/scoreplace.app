/* background.js — service worker (MV3). Faz o fetch cross-origin autenticado ao
 * letzplay.me (host_permissions + cookies da sessão) a pedido do content script.
 * O content script (que tem DOM) parseia; o app dispara tudo. Sem senha.
 */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'lp-fetch' && typeof msg.url === 'string' &&
      msg.url.indexOf('https://letzplay.me/') === 0) {
    fetch(msg.url, { credentials: 'include' })
      .then(function (r) {
        return r.text().then(function (html) {
          sendResponse({ ok: r.ok, status: r.status, html: html });
        });
      })
      .catch(function (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); });
    return true; // resposta assíncrona
  }
});
