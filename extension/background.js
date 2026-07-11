/* background.js — service worker (MV3).
 *
 * FETCH do letzplay: NÃO dá pra buscar do service worker (contexto da extensão =
 * cross-site → cookie de sessão + cf_clearance do Cloudflare com SameSite NÃO vão →
 * volta página deslogada, sem jogos). Solução: rodar o fetch DENTRO da aba do letzplay
 * (chrome.scripting.executeScript) → requisição same-origin → todos os cookies vão →
 * passa o Cloudflare + logado. É o mesmo caminho da extração que funcionou. Exige uma
 * aba do letzplay.me aberta (o Passo 2 pede pra logar/abrir).
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
// E no start do service worker (roda ao ativar/recarregar a extensão) — garante a
// injeção mesmo quando onInstalled não dispara (ex.: reativar extensão já instalada).
// A guarda no content.js torna injeções repetidas inofensivas.
injectIntoOpenScoreplaceTabs();
// Busca uma URL do letzplay DE DENTRO de uma aba do letzplay (same-origin → cookies +
// Cloudflare OK). Precisa de uma aba letzplay.me aberta.
function fetchViaLetzplayTab(url, cb) {
  if (!chrome.scripting || !chrome.tabs) { cb({ ok: false, error: 'no-scripting' }); return; }
  chrome.tabs.query({ url: 'https://letzplay.me/*' }, function (tabs) {
    if (!tabs || !tabs.length) { cb({ ok: false, error: 'no-letzplay-tab' }); return; }
    var injUrl = chrome.runtime.getURL('inject.js');
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      // ISOLATED (default) — carrega o inject.js (web-accessible) como <script src> na
      // página. Ele roda no mundo REAL da página → fetch page-initiated → cookie vai.
      // O func aguarda o resultado via postMessage (ISOLATED aguarda Promise; MAIN não).
      args: [url, injUrl],
      func: function (u, injSrc) {
        return new Promise(function (resolve) {
          var done = false;
          function finish(res) { if (done) return; done = true; try { window.removeEventListener('message', onMsg); } catch (e) {} resolve(res); }
          function onMsg(e) {
            if (e.source !== window) return;
            var d = e.data;
            if (!d || !d.__spInjRes || d.__spInjRes.url !== u) return;
            finish(d.__spInjRes.res);
          }
          window.addEventListener('message', onMsg);
          var s = document.createElement('script');
          s.src = injSrc;
          s.onload = function () { try { window.postMessage({ __spInjReq: { url: u } }, window.location.origin); } catch (e) {} };
          s.onerror = function () { finish({ ok: false, error: 'inject-load-fail' }); };
          (document.documentElement || document.head).appendChild(s);
          setTimeout(function () { finish({ ok: false, error: 'inject-timeout' }); }, 20000);
        });
      }
    }).then(function (res) {
      cb((res && res[0] && res[0].result) || { ok: false, error: 'exec-failed' });
    }).catch(function (e) { cb({ ok: false, error: String(e && e.message || e) }); });
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'lp-fetch' && typeof msg.url === 'string' &&
      msg.url.indexOf('https://letzplay.me/') === 0) {
    fetchViaLetzplayTab(msg.url, sendResponse);
    return true; // resposta assíncrona
  }
});
