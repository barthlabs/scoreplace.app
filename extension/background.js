/* background.js — service worker (MV3). Faz o fetch cross-origin autenticado ao
 * letzplay.me (host_permissions + cookies da sessão) a pedido do content script.
 * O content script (que tem DOM) parseia; o app dispara tudo. Sem senha.
 *
 * Também AUTO-INJETA o content script nas abas do scoreplace JÁ ABERTAS quando a
 * extensão é instalada/ativada — assim o usuário NÃO precisa recarregar a página pra
 * o botão "Importar agora" aparecer (é o que acontece no fluxo real da loja: instalou,
 * o botão surge sozinho). Content scripts declarados no manifest só entram em page LOAD;
 * este re-injeta nas abas que já estavam abertas antes do install.
 */
var CS_MATCHES = ['https://scoreplace.app/*', 'https://scoreplace-staging.web.app/*', 'http://localhost/*'];
var CS_FILES = ['lib/letzplay-rating.js', 'lib/letzplay-import.js', 'lib/letzplay-extract.js', 'lib/letzplay-flow.js', 'content.js'];
function injectIntoOpenScoreplaceTabs() {
  if (!chrome.scripting || !chrome.tabs) return;
  chrome.tabs.query({ url: CS_MATCHES }, function (tabs) {
    (tabs || []).forEach(function (t) {
      if (!t.id) return;
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: CS_FILES })
        .catch(function () {}); // aba sem permissão / chrome:// / já injetada → ignora
    });
  });
}
chrome.runtime.onInstalled.addListener(injectIntoOpenScoreplaceTabs);
chrome.runtime.onStartup.addListener(injectIntoOpenScoreplaceTabs);
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
