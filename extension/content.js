/* content.js — roda no scoreplace.app. Ponte entre o popup da extensão e a página.
 * A página (letzplay-bridge.js) escuta o postMessage, grava no doc do próprio usuário
 * e devolve {__sp_lp:'import-result', ok, error, count}. Repassamos esse resultado REAL
 * pro popup (via sendResponse) — assim o popup mostra sucesso/erro honesto.
 */
(function () {
  // Sinaliza pra página que a extensão está presente (habilita "Importar do letzplay").
  try { window.postMessage({ __sp_lp: 'extension-present', version: '1.10' }, window.location.origin); } catch (e) {}

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.__sp_lp === 'import' && msg.letzplayImport) {
      var done = false;
      function finish(res) {
        if (done) return; done = true;
        window.removeEventListener('message', onResult);
        try { sendResponse(res); } catch (e) {}
      }
      function onResult(e) {
        if (e.source !== window) return;
        var d = e.data;
        if (!d || d.__sp_lp !== 'import-result') return;
        finish({ ok: !!d.ok, error: d.error || null, count: d.count });
      }
      window.addEventListener('message', onResult);
      try {
        window.postMessage({ __sp_lp: 'import', letzplayImport: msg.letzplayImport }, window.location.origin);
      } catch (e) {
        finish({ ok: false, error: String(e) }); return true;
      }
      // fallback: se a página não responder (bridge não carregou / aba velha), não trava o popup.
      setTimeout(function () { finish({ ok: false, error: 'sem-resposta' }); }, 8000);
      return true; // resposta assíncrona
    } else if (msg && msg.__sp_lp === 'ping') {
      sendResponse({ ok: true }); return true;
    }
  });
})();
