/* content.js — roda no scoreplace.app. Ponte entre o popup da extensão e a página.
 * A página (letzplay-bridge.js) escuta o postMessage e grava no doc do próprio usuário.
 */
(function () {
  // Sinaliza pra página que a extensão está presente (habilita botão "Importar do letzplay").
  try { window.postMessage({ __sp_lp: 'extension-present', version: '1.6' }, window.location.origin); } catch (e) {}

  // Relay: popup (chrome.runtime) → página (window.postMessage).
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.__sp_lp === 'import' && msg.letzplayImport) {
      try {
        window.postMessage({ __sp_lp: 'import', letzplayImport: msg.letzplayImport }, window.location.origin);
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: String(e) }); }
    } else if (msg && msg.__sp_lp === 'ping') {
      sendResponse({ ok: true });
    }
    return true;
  });
})();
