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
function ensureLetzplayTab(cb, noCreate) {
  chrome.tabs.query({ url: 'https://letzplay.me/*' }, function (tabs) {
    if (tabs && tabs.length) { cb(tabs[0].id); return; }
    // noCreate: NÃO abre uma aba nova (usado pela checagem de login) — assim abrir o
    // scoreplace nunca abre o letzplay junto. Só o import/org-scan (ação explícita) cria.
    if (noCreate) { cb(null); return; }
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
function fetchViaLetzplayTab(url, cb, noCreate) {
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
  }, noCreate);
}

// EXTRATOR do PERFIL PÚBLICO — roda no DOM RENDERIZADO da aba do letzplay (o perfil
// é SPA: rankings/torneios/jogos vêm por JS e NÃO estão no HTML cru do fetch).
// Self-contained; extrai TUDO que a página atual expõe (base OU /rankings OU /tournaments).
// A PÁGINA BASE (/{handle}) mostra torneios + jogos recentes + totais; a de RANKINGS
// (/{handle}/rankings) mostra a categoria REAL de cada ranking com a banda (ex: "Fem C+/B-")
// e status Ativo/Inativo — é DE LÁ que sai o nível competitivo real (o principal só lista
// torneios, cuja categoria pode ser mais baixa por falta de experiência oficial).
function _spExtractProfileInTab(h) {
  var bt = (document.body && document.body.textContent || '').replace(/\s+/g, ' ');
  var num = function (re) { var m = bt.match(re); return m ? +m[1] : null; };
  var title = (document.title || '')
    .replace(/^\s*(Rankings|Torneios|Jogos)\s+de\s+/i, '')
    .replace(/\s*[-|]\s*Letzplay.*$/i, '').trim();
  var CAT_RE = /(Masculina|Feminina|Mista|Masc|Fem)\s*-?\s*([A-D][+\-]?(?:\s*\/\s*[A-D][+\-]?)?)/;
  var catFrom = function (tx) { var m = String(tx || '').match(CAT_RE); return m ? (m[1] + ' ' + m[2]).replace(/\s+/g, ' ').trim() : null; };
  // RANKINGS estruturados: sobe do <a> do ranking até o card e lê status + posição.
  var rankings = [], seenR = {};
  Array.prototype.slice.call(document.querySelectorAll('a[href*="/rankings/"]'))
    .filter(function (a) { return !/player-stats/.test(a.getAttribute('href') || ''); })
    .forEach(function (a) {
      var path = a.pathname || (a.getAttribute('href') || '');
      if (seenR[path]) return; seenR[path] = 1;
      var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var el = a; for (var i = 0; i < 5 && el.parentElement; i++) { el = el.parentElement; if (/ativo|inativo|rodada|jogadores/i.test(el.textContent || '')) break; }
      var block = (el.textContent || '').replace(/\s+/g, ' ').trim();
      var cat = catFrom(label) || catFrom(block);
      var active = !/\bInativo\b|\bConcluído\b|\bConcluido\b/i.test(block);
      var pos = (block.match(/(\d+)\s*º/) || [])[1];
      var field = (block.match(/(\d+)\s*Jogadores/i) || [])[1];
      rankings.push({ path: path, label: label, category: cat, active: active,
        position: pos ? +pos : null, fieldSize: field ? +field : null });
    });
  // TORNEIOS estruturados — colocação/título vem no prefixo do label ("Campeão • ...",
  // "QF • ...", "Vice • ..."). Título = campeão/vencedor (pesa na regra de subida).
  var tournaments = [], seenT = {};
  Array.prototype.slice.call(document.querySelectorAll('a[href*="/tournaments/"]'))
    .forEach(function (a) {
      var path = a.pathname || (a.getAttribute('href') || '');
      if (seenT[path] || /\/u\/tournaments/.test(path)) return; seenT[path] = 1;
      var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var cat = catFrom(label);
      if (!cat && !/\/tournaments\/\d/.test(path)) return; // ignora CTAs genéricos
      var pref = (label.split('•')[0] || '').trim();
      var champion = /Campe[ãa]o|Campe[ãa]|Campe[õo]es|Vencedor|Vencedora|Título|1[º°]\s*Lugar|🏆/i.test(pref);
      var placement = (pref && pref.length <= 24) ? pref : null; // "Campeão","Vice","SF","QF"…
      tournaments.push({ path: path, label: label, category: cat, champion: champion, placement: placement });
    });
  return {
    handle: h, name: title || null,
    rankings: rankings, tournaments: tournaments,
    totals: { matches: num(/(\d+)\s*Jogos/), rankings: num(/(\d+)\s*Rankings/), tournaments: num(/(\d+)\s*Torneios/) },
    lastPlayed: (bt.match(/Jogou h[áa]\s*(\d+\s*\w+)/) || [])[1] || null
  };
}
// Deriva os campos do scan a partir dos dados brutos das duas páginas (base + rankings).
// Banda REAL = categoria mais forte entre os rankings ATIVOS (fallback: todos rankings;
// fallback: torneios). Skill = letra mais forte da banda. Roda no background (plain JS).
function _spDeriveScan(handle, base, rk) {
  base = base || {}; rk = rk || {};
  var RANK = { A: 0, B: 1, C: 2, D: 3 }, LTR = ['A', 'B', 'C', 'D'];
  var rankings = (rk.rankings && rk.rankings.length) ? rk.rankings : (base.rankings || []);
  var tournaments = (base.tournaments && base.tournaments.length) ? base.tournaments : (rk.tournaments || []);
  function strongestOf(cats) {
    var ranks = [];
    cats.forEach(function (c) { (' ' + String(c || '').toUpperCase() + ' ').replace(/[\s\/]([A-D])[+\-]?(?=[\s\/])/g, function (_m, l) { ranks.push(RANK[l]); return _m; }); });
    return ranks.length ? Math.min.apply(null, ranks) : null;
  }
  var activeCats = rankings.filter(function (r) { return r.active && r.category; }).map(function (r) { return r.category; });
  var allRankCats = rankings.filter(function (r) { return r.category; }).map(function (r) { return r.category; });
  var tourCats = tournaments.filter(function (t) { return t.category; }).map(function (t) { return t.category; });
  var allCats = [];
  activeCats.concat(allRankCats).concat(tourCats).forEach(function (c) { if (c && allCats.indexOf(c) < 0) allCats.push(c); });
  // categoria oficial de referência = banda do ranking ativo mais forte (real), senão qualquer ranking, senão torneio
  var realRank = strongestOf(activeCats);
  var realCats = activeCats;
  if (realRank == null) { realRank = strongestOf(allRankCats); realCats = allRankCats; }
  if (realRank == null) { realRank = strongestOf(tourCats); realCats = tourCats; }
  // rótulo da categoria real = o primeiro que contém a letra mais forte
  var rankingCategory = null;
  if (realRank != null) { for (var i = 0; i < realCats.length; i++) { if (strongestOf([realCats[i]]) === realRank) { rankingCategory = realCats[i]; break; } } }
  var gender = /Feminina|\bFem\b/i.test(allCats.join(' ')) ? 'feminino' : (/Masculina|\bMasc\b/i.test(allCats.join(' ')) ? 'masculino' : null);
  var skill = realRank != null ? LTR[realRank] : null;
  // categoria REPRESENTATIVA pro perfil (checada): borda MAIS FRACA da banda ativa —
  // conservador (não força ninguém pra cima só por jogar em ranking mais forte).
  // Ex: "C+/B-" → C (não B). Título/domínio empurra pra cima é tratado no anti-gato.
  function weakestOf(catStr) { var rs = []; (' ' + String(catStr || '').toUpperCase() + ' ').replace(/[\s\/]([A-D])[+\-]?(?=[\s\/])/g, function (_m, l) { rs.push(RANK[l]); return _m; }); return rs.length ? Math.max.apply(null, rs) : null; }
  var profRank = rankingCategory ? weakestOf(rankingCategory) : realRank;
  var profileSkill = profRank != null ? LTR[profRank] : null;
  // Campeonatos (título) por categoria — regra da federação: campeão sobe.
  var champions = tournaments.filter(function (t) { return t.champion && t.category; }).map(function (t) { return t.category; });
  return {
    handle: handle, name: base.name || rk.name || null,
    rankingCategory: rankingCategory, allCategories: allCats,
    gender: gender, skill: skill, profileSkill: profileSkill, champions: champions,
    rankings: rankings, tournaments: tournaments,
    totals: base.totals || rk.totals || {},
    lastPlayed: base.lastPlayed || rk.lastPlayed || null, source: 'public-profile' };
}
// Navega a aba do letzplay pelo perfil. mode='essential' → só /rankings (rápido,
// pega a banda REAL do ranking ativo, suficiente pra flag anti-gato). mode='full' →
// base (/{handle}: nome, totais, torneios, jogos) + /rankings, mescla tudo (pra
// migrar a pessoa pro scoreplace). Espera o JS renderizar; retry.
function scanProfileViaTab(handle, mode, cb) {
  if (!chrome.scripting || !chrome.tabs) { cb({ ok: false, error: 'no-scripting' }); return; }
  ensureLetzplayTab(function (tabId) {
    if (!tabId) { cb({ ok: false, error: 'no-letzplay-tab' }); return; }
    var enc = encodeURIComponent(handle);
    // extrai a página atual com retry até render (need = função que valida o resultado)
    function extractWithRetry(need, done) {
      var n = 0;
      function attempt() {
        setTimeout(function () {
          chrome.scripting.executeScript({ target: { tabId: tabId }, func: _spExtractProfileInTab, args: [handle] })
            .then(function (res) {
              var data = (res && res[0] && res[0].result) || null;
              if ((data && need(data)) || n >= 4) { done(data); return; }
              n++; attempt();
            })
            .catch(function (e) { if (n >= 4) done(null); else { n++; attempt(); } });
        }, n === 0 ? 1600 : 1300);
      }
      attempt();
    }
    function goThen(url, next) {
      var navDone = false;
      function onUpd(tid, info) { if (tid === tabId && info.status === 'complete' && !navDone) { navDone = true; chrome.tabs.onUpdated.removeListener(onUpd); next(); } }
      chrome.tabs.onUpdated.addListener(onUpd);
      chrome.tabs.update(tabId, { url: url }, function () { if (chrome.runtime.lastError) { if (!navDone) { navDone = true; try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {} next(); } } });
      setTimeout(function () { if (!navDone) { navDone = true; try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {} next(); } }, 12000);
    }
    function doRankings(base) {
      // página de rankings: banda REAL por ranking (com status ativo/inativo)
      goThen('https://letzplay.me/' + enc + '/rankings', function () {
        extractWithRetry(function (d) { return d.rankings && d.rankings.length; }, function (rk) {
          cb({ ok: true, scan: _spDeriveScan(handle, base, rk) });
        });
      });
    }
    if (mode === 'full') {
      // base primeiro (nome, totais, torneios, jogos), depois rankings
      goThen('https://letzplay.me/' + enc, function () {
        extractWithRetry(function (d) { return d.name || (d.tournaments && d.tournaments.length) || (d.totals && d.totals.matches != null); }, doRankings);
      });
    } else {
      // essencial: só /rankings (a banda real está lá; o title dá o nome)
      doRankings({});
    }
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'lp-fetch' && typeof msg.url === 'string' &&
      msg.url.indexOf('https://letzplay.me/') === 0) {
    fetchViaLetzplayTab(msg.url, sendResponse, !!msg.noCreateTab);
    return true; // resposta assíncrona
  }
  if (msg && msg.type === 'lp-scan-profile' && typeof msg.handle === 'string') {
    scanProfileViaTab(msg.handle, msg.mode === 'full' ? 'full' : 'essential', sendResponse);
    return true; // assíncrona
  }
  if (msg && msg.type === 'lp-close-scan-tab') { closeAutoScanTab(); sendResponse({ ok: true }); return true; }
});
