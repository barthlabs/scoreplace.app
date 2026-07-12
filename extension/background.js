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
// Garante uma aba do letzplay pra rodar o fetch same-origin (cookies + Cloudflare OK).
// Se já existe uma aba letzplay.me, reusa. Senão ABRE UMA em background (perfil público
// não exige login) e a lembra em _autoScanTabId pra fechar ao fim da busca do organizador.
var _autoScanTabId = null;
function ensureLetzplayTab(cb) {
  chrome.tabs.query({ url: 'https://letzplay.me/*' }, function (tabs) {
    if (tabs && tabs.length) { cb(tabs[0].id); return; }
    chrome.tabs.create({ url: 'https://letzplay.me/', active: false }, function (tab) {
      if (chrome.runtime.lastError || !tab || !tab.id) { cb(null); return; }
      _autoScanTabId = tab.id;
      var settled = false;
      function finish() { if (settled) return; settled = true; try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {} setTimeout(function () { cb(tab.id); }, 1600); }
      function onUpd(tabId, info) { if (tabId === tab.id && info.status === 'complete') finish(); }
      chrome.tabs.onUpdated.addListener(onUpd);
      setTimeout(function () { if (!settled) { settled = true; try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {} cb(tab.id); } }, 15000);
    });
  });
}
function closeAutoScanTab() {
  if (_autoScanTabId != null) { var id = _autoScanTabId; _autoScanTabId = null; try { chrome.tabs.remove(id, function () { void chrome.runtime.lastError; }); } catch (e) {} }
}
// Busca uma URL do letzplay DE DENTRO de uma aba do letzplay (same-origin → cookies +
// Cloudflare OK). Cria a aba se necessário (perfil público).
function fetchViaLetzplayTab(url, cb) {
  if (!chrome.scripting || !chrome.tabs) { cb({ ok: false, error: 'no-scripting' }); return; }
  var injUrl = chrome.runtime.getURL('inject.js');
  ensureLetzplayTab(function (tabId) {
    if (!tabId) { cb({ ok: false, error: 'no-letzplay-tab' }); return; }
    chrome.scripting.executeScript({
      target: { tabId: tabId },
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

// EXTRATOR do PERFIL PÚBLICO — roda no DOM RENDERIZADO da aba do letzplay (o perfil
// é SPA: categoria/torneios vêm por JS e NÃO estão no HTML cru do fetch). Self-contained.
function _spExtractProfileInTab(h) {
  var bt = (document.body && document.body.textContent || '').replace(/\s+/g, ' ');
  var num = function (re) { var m = bt.match(re); return m ? +m[1] : null; };
  var title = (document.title || '').replace(/\s*[-|]\s*Letzplay.*$/i, '').trim();
  var CAT_RE = /(Masculina|Feminina|Mista|Masc|Fem)\s*-?\s*([A-D][+\-]?(?:\s*\/\s*[A-D][+\-]?)?)/;
  var catFrom = function (tx) { var m = String(tx || '').match(CAT_RE); return m ? (m[1] + ' ' + m[2]).replace(/\s+/g, ' ').trim() : null; };
  var links = Array.prototype.slice.call(document.querySelectorAll('a[href*="/rankings/"], a[href*="/tournaments/"]'))
    .map(function (a) { return (a.textContent || '').replace(/\s+/g, ' ').trim(); });
  var cats = []; links.forEach(function (tx) { var c = catFrom(tx); if (c && cats.indexOf(c) < 0) cats.push(c); });
  // Deriva gênero + habilidade das categorias — pra alimentar o perfil da pessoa.
  var catStr = cats.join(' ');
  var gender = /Feminina|\bFem\b/i.test(catStr) ? 'feminino' : (/Masculina|\bMasc\b/i.test(catStr) ? 'masculino' : null);
  var RANK = { A: 0, B: 1, C: 2, D: 3 }, LTR = ['A', 'B', 'C', 'D'], ranks = [];
  (' ' + catStr.toUpperCase() + ' ').replace(/[\s\/]([A-D])[+\-]?(?=[\s\/])/g, function (_m, l) { ranks.push(RANK[l]); return _m; });
  var skill = ranks.length ? LTR[Math.min.apply(null, ranks)] : null;
  return { handle: h, name: title || null, rankingCategory: cats[0] || null, allCategories: cats,
    gender: gender, skill: skill,
    totals: { matches: num(/(\d+)\s*Jogos/), rankings: num(/(\d+)\s*Rankings/), tournaments: num(/(\d+)\s*Torneios/) },
    lastPlayed: (bt.match(/Jogou h[áa]\s*(\d+\s*\w+)/) || [])[1] || null, source: 'public-profile' };
}
// Navega a aba do letzplay pro perfil, espera o JS renderizar e extrai do DOM.
// Faz até 5 tentativas (o JS pode demorar a carregar torneios/rankings).
function scanProfileViaTab(handle, cb) {
  if (!chrome.scripting || !chrome.tabs) { cb({ ok: false, error: 'no-scripting' }); return; }
  ensureLetzplayTab(function (tabId) {
    if (!tabId) { cb({ ok: false, error: 'no-letzplay-tab' }); return; }
    var url = 'https://letzplay.me/' + encodeURIComponent(handle);
    chrome.tabs.update(tabId, { url: url }, function () {
      if (chrome.runtime.lastError) { cb({ ok: false, error: 'nav-fail' }); return; }
      var navDone = false;
      function onUpd(tid, info) { if (tid === tabId && info.status === 'complete' && !navDone) { navDone = true; chrome.tabs.onUpdated.removeListener(onUpd); attempt(0); } }
      chrome.tabs.onUpdated.addListener(onUpd);
      setTimeout(function () { if (!navDone) { navDone = true; try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {} attempt(0); } }, 12000);
      function attempt(n) {
        setTimeout(function () {
          chrome.scripting.executeScript({ target: { tabId: tabId }, func: _spExtractProfileInTab, args: [handle] })
            .then(function (res) {
              var scan = (res && res[0] && res[0].result) || null;
              if (scan && scan.rankingCategory) { cb({ ok: true, scan: scan }); return; } // achou categoria
              if (n < 4) { attempt(n + 1); return; }  // ainda não renderizou → tenta de novo
              cb({ ok: true, scan: scan });            // desiste: devolve o que tem (pode ser sem categoria)
            })
            .catch(function (e) { if (n < 4) attempt(n + 1); else cb({ ok: false, error: String(e && e.message || e) }); });
        }, n === 0 ? 1600 : 1300);
      }
    });
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'lp-fetch' && typeof msg.url === 'string' &&
      msg.url.indexOf('https://letzplay.me/') === 0) {
    fetchViaLetzplayTab(msg.url, sendResponse);
    return true; // resposta assíncrona
  }
  if (msg && msg.type === 'lp-scan-profile' && typeof msg.handle === 'string') {
    scanProfileViaTab(msg.handle, sendResponse);
    return true; // assíncrona
  }
  if (msg && msg.type === 'lp-close-scan-tab') { closeAutoScanTab(); sendResponse({ ok: true }); return true; }
});
