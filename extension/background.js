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
/* ── FILA GLOBAL: o letzplay é UM recurso compartilhado (v1.36) ────────────────
 * TUDO que toca o letzplay (fetch same-origin OU navegação do perfil) passa por
 * aqui, UMA operação por vez. Motivo: existe UMA aba do letzplay; `scanProfileViaTab`
 * NAVEGA essa aba. Duas buscas ao mesmo tempo (o organizador clicou de novo, ou duas
 * abas do scoreplace abertas) navegavam a MESMA aba em paralelo → uma lia o perfil da
 * outra, e o `closeAutoScanTab` da primeira matava a segunda no meio. Serializado:
 * clicar de novo NUNCA quebra — no máximo entra na fila e demora mais.
 *
 * ESPAÇAMENTO ADAPTATIVO: o letzplay/Cloudflare limita rajadas (403/429). O intervalo
 * entre requisições CRESCE sozinho a cada rate-limit e volta a encolher depois de
 * sucessos. Preferimos demorar a falhar — o content.js ainda re-tenta por cima disto.
 */
// PASSO APRENDIDO (v1.37) — medimos o letzplay e alargamos até ele parar de travar.
//
// Três defeitos que faziam a "adaptação" da v1.36 não adaptar nada:
//  1. O passo vivia SÓ em memória. O service worker MV3 é reciclado a cada ~30s ocioso,
//     então o gap aprendido voltava pro piso a toda hora e a rajada recomeçava do zero.
//     Agora persiste em chrome.storage.local: o que aprendemos vale entre buscas, entre
//     reciclagens e entre sessões.
//  2. Acelerava a cada sucesso ISOLADO (×0.85), então logo depois de um bloqueio voltava
//     a correr e tomava bloqueio de novo — oscilava em vez de convergir. Agora é
//     assimétrico: sobe rápido no bloqueio, só desce depois de MUITO sucesso seguido e
//     nunca abaixo do piso aprendido (_floor), que é o maior passo onde já apanhamos.
//  3. Teto de 10s era baixo demais pra bloqueio sustentado do Cloudflare. Vai a 60s.
// Preferimos SEMPRE demorar a falhar: o organizador aceita esperar, não aceita "busca
// concluída" com zero jogos (que foi o que aconteceu em 14/jul/2026).
// CADÊNCIA HUMANA (o plano original): a captura tem que PARECER navegação de gente.
// `gap` é o tempo BASE entre operações — nunca a espera literal. A espera real é sorteada
// numa faixa em torno dele (_qWait), porque intervalo cravado e idêntico é assinatura de
// robô: o Cloudflare barra por PADRÃO, não só por volume. Piso de ~1,8s = o tempo mínimo
// plausível pra alguém ler uma página e clicar na próxima; abaixo disso nenhum humano vai.
var _Q_DEFAULTS = { gap: 2600, floor: 2000, min: 1800, max: 60000 };
var _q = { chain: Promise.resolve(), busy: 0, last: 0, okStreak: 0, blocks: 0,
  gap: _Q_DEFAULTS.gap, floor: _Q_DEFAULTS.floor, min: _Q_DEFAULTS.min, max: _Q_DEFAULTS.max };
// Espera REAL de uma operação: base sorteada 0,7×–1,8× (nunca duas iguais) + uma pausa
// longa ocasional (~8%), que é o equivalente a olhar pro lado / ler com calma. Sem esse
// ruído, 30 requisições espaçadas identicamente denunciam automação mesmo devagar.
function _qWait() {
  var lo = _q.gap * 0.7, hi = _q.gap * 1.8;
  var w = lo + Math.random() * (hi - lo);
  if (Math.random() < 0.08) w += 2000 + Math.random() * 4000;
  return Math.round(w);
}
var _Q_KEY = 'sp_lz_pace';
// Carrega o passo aprendido assim que o SW sobe (a reciclagem do MV3 não pode nos fazer
// esquecer o que já medimos). É best-effort: se falhar, seguimos com o default.
try {
  chrome.storage && chrome.storage.local && chrome.storage.local.get([_Q_KEY], function (o) {
    var s = o && o[_Q_KEY];
    if (!s) return;
    if (typeof s.gap === 'number') _q.gap = Math.min(_q.max, Math.max(_q.min, s.gap));
    if (typeof s.floor === 'number') _q.floor = Math.min(_q.max, Math.max(_q.min, s.floor));
  });
} catch (e) {}
var _qSaveT = null;
// `now` = grava JÁ. Usado ao FREAR: o service worker MV3 pode ser morto a qualquer
// instante, e perder um "vá mais devagar" recém-aprendido significa rajar de novo e
// apanhar de novo. Perder um "pode acelerar" não custa nada — esse pode esperar o debounce.
function _qSave(now) {
  var write = function () {
    try { chrome.storage && chrome.storage.local && chrome.storage.local.set(_qDump()); } catch (e) {}
  };
  if (now) { if (_qSaveT) { clearTimeout(_qSaveT); _qSaveT = null; } write(); return; }
  if (_qSaveT) return;   // agrupa gravações (a fila muda o gap várias vezes por busca)
  _qSaveT = setTimeout(function () { _qSaveT = null; write(); }, 500);
}
function _qDump() { var o = {}; o[_Q_KEY] = { gap: _q.gap, floor: _q.floor, at: Date.now() }; return o; }
// Estado medido, pro app MOSTRAR (nunca mais "travado" sem explicação).
function _qStats() { return { gap: _q.gap, floor: _q.floor, blocks: _q.blocks, busy: _q.busy }; }
function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
// BLOQUEIO → alarga o passo E sobe o PISO: este ritmo comprovadamente não é seguro, então
// não voltamos a ele nem depois de mil sucessos. É o "aumentando até não travar mais".
function _qSlower() {
  _q.gap = Math.min(_q.max, Math.round(_q.gap * 2) + 400);
  _q.floor = Math.min(_q.max, Math.max(_q.floor, Math.round(_q.gap * 0.75)));
  _q.okStreak = 0; _q.blocks++;
  _qSave(true);   // freio grava na hora — o SW pode morrer antes de um debounce
}
// Só afrouxa depois de 12 sucessos SEGUIDOS, e só 10% de cada vez — e jamais abaixo do
// piso aprendido. Descer rápido é o que recriava a rajada.
function _qFaster() {
  _q.okStreak++;
  if (_q.okStreak < 12) return;
  _q.okStreak = 0;
  var next = Math.max(_q.floor, Math.round(_q.gap * 0.9));
  if (next !== _q.gap) { _q.gap = next; _qSave(); }
}
// Marca o resultado vindo de QUALQUER caminho — fetch, navegação, ou página de desafio
// devolvida com status 200 (`blocked`). Um desafio do Cloudflare É um bloqueio: contar
// como sucesso fazia a fila acelerar exatamente quando devia frear.
function _qNoteStatus(st, blocked) {
  if (blocked || st === 403 || st === 429 || st === 503) _qSlower();
  else if (st >= 200 && st < 300) _qFaster();
}
function enqueue(fn) {
  _q.busy++;
  var run = _q.chain.then(function () {
    // Espera SORTEADA a cada operação (nunca o mesmo intervalo duas vezes) e medida a
    // partir do fim da anterior — é o ritmo de quem lê a página antes de ir pra próxima.
    var wait = _qWait() - (Date.now() - _q.last);
    return (wait > 0 ? _sleep(wait) : Promise.resolve()).then(fn);
  });
  // a CORRENTE nunca quebra: um erro numa operação não pode travar a fila inteira.
  _q.chain = run.then(function () { _q.last = Date.now(); }, function () { _q.last = Date.now(); });
  function dec(v) { _q.busy = Math.max(0, _q.busy - 1); return v; }
  return run.then(dec, function (e) { dec(); throw e; });
}

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
// Só fecha a aba quando a fila esvaziou. Antes, o fim de UMA busca fechava a aba de
// OUTRA ainda rodando (organizador clicou de novo) → "no-letzplay-tab" no meio.
function closeAutoScanTab() {
  if (_q.busy > 0) return;   // ainda tem operação na fila usando a aba
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

// NAVEGA a aba do letzplay pra uma URL (v1.46 — pedido do dono: o puxar individual tem
// que ABRIR a página do jogador automaticamente, como o scan antigo fazia). Além de
// mostrar onde a busca está, a navegação REAL resolve o desafio do Cloudflare no
// contexto da página — sem ela, com o CF desconfiado, TODOS os fetches voltavam
// bloqueados e a busca "não achava nada". Sonda o desafio e espera ele resolver.
function navLetzplayTab(url, cb) {
  if (!chrome.tabs || !chrome.scripting) { cb({ ok: false, error: 'no-tabs' }); return; }
  ensureLetzplayTab(function (tabId) {
    if (!tabId) { cb({ ok: false, error: 'no-letzplay-tab' }); return; }
    var navDone = false;
    function settle() {
      var n = 0;
      (function check() {
        setTimeout(function () {
          chrome.scripting.executeScript({ target: { tabId: tabId }, func: _spProbeTab })
            .then(function (pr) {
              var probe = (pr && pr[0] && pr[0].result) || null;
              if (probe && probe.challenge) { _qSlower(); if (n < 6) { n++; check(); return; } cb({ ok: true, challenge: true }); return; }
              _qFaster(); cb({ ok: true });
            })
            .catch(function () { cb({ ok: true }); });
        }, Math.max(1200, Math.min(9000, Math.round(_q.gap * 0.8))));
      })();
    }
    function onUpd(tid, info) { if (tid === tabId && info.status === 'complete' && !navDone) { navDone = true; try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {} settle(); } }
    chrome.tabs.onUpdated.addListener(onUpd);
    chrome.tabs.update(tabId, { url: url }, function () {
      if (chrome.runtime.lastError && !navDone) { navDone = true; try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {} cb({ ok: false, error: chrome.runtime.lastError.message }); }
    });
    setTimeout(function () { if (!navDone) { navDone = true; try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {} settle(); } }, 12000);
  });
}

// EXTRATOR do PERFIL PÚBLICO — roda no DOM RENDERIZADO da aba do letzplay (o perfil
// é SPA: rankings/torneios/jogos vêm por JS e NÃO estão no HTML cru do fetch).
// Self-contained; extrai TUDO que a página atual expõe (base OU /rankings OU /tournaments).
// A PÁGINA BASE (/{handle}) mostra torneios + jogos recentes + totais; a de RANKINGS
// (/{handle}/rankings) mostra a categoria REAL de cada ranking com a banda (ex: "Fem C+/B-")
// e status Ativo/Inativo — é DE LÁ que sai o nível competitivo real (o principal só lista
// torneios, cuja categoria pode ser mais baixa por falta de experiência oficial).
// SONDA: a aba está no perfil de verdade, ou o Cloudflare pôs o desafio na frente?
// Sem isto, um desafio na aba era indistinguível de "perfil ainda renderizando" — o
// extrator voltava vazio, tentávamos de novo no mesmo ritmo, e o resultado era um scan
// vazio sem nenhuma pista. Roda no mundo da página (executeScript sem args).
function _spProbeTab() {
  var t = document.title || '';
  var b = (document.body && document.body.textContent || '').slice(0, 2000);
  return {
    challenge: /Just a moment|Verifying you are human|Checking your browser|Attention Required/i.test(t + ' ' + b) ||
      !!document.querySelector('#challenge-form, #cf-challenge-running, [class*="cf-browser-verification"]'),
    title: t.slice(0, 120)
  };
}
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
      // A NAVEGAÇÃO também mede. Antes só o fetch alimentava a fila: se o Cloudflare
      // mostrasse o desafio na ABA, a extração só voltava vazia e nós tentávamos de novo
      // no mesmo ritmo — sem nunca aprender que precisávamos ir mais devagar.
      // Espera também CRESCE com o passo aprendido: se o letzplay está limitando, dar
      // 1.3s pro SPA renderizar é otimismo; usamos o gap medido como base.
      var n = 0;
      function attempt() {
        // Tempo de "ler a página" antes de extrair: sorteado, derivado do passo aprendido.
        // Era 1600/1300ms cravado — além de ser pouco quando o letzplay está limitando, é
        // regular demais pra passar por gente.
        var base = Math.max(1500, Math.min(9000, Math.round(_q.gap * 0.8 * (0.75 + Math.random() * 0.9))));
        setTimeout(function () {
          chrome.scripting.executeScript({ target: { tabId: tabId }, func: _spProbeTab })
            .then(function (pr) {
              var probe = (pr && pr[0] && pr[0].result) || null;
              // Desafio do Cloudflare NA ABA → é bloqueio: alarga o passo e tenta de novo
              // (até 8x). Desistir aqui devolvia perfil vazio como se fosse "sem dados".
              if (probe && probe.challenge) {
                _qSlower();
                if (n < 8) { n++; attempt(); return; }
                done(null); return;
              }
              return chrome.scripting.executeScript({ target: { tabId: tabId }, func: _spExtractProfileInTab, args: [handle] })
                .then(function (res) {
                  var data = (res && res[0] && res[0].result) || null;
                  if (data && need(data)) { _qFaster(); done(data); return; }
                  // Ainda não renderizou (ou veio vazio): re-tenta com paciência. 8 tentativas
                  // com espera derivada do passo medido — "demora mais, mas não falha".
                  if (n >= 8) { done(data); return; }
                  n++; attempt();
                });
            })
            .catch(function () { if (n >= 8) done(null); else { n++; attempt(); } });
        }, n === 0 ? base : Math.min(15000, base + n * 900));
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
    // pela FILA: uma requisição por vez, espaçada (nunca em rajada → nunca toma 429).
    enqueue(function () {
      return new Promise(function (res) { fetchViaLetzplayTab(msg.url, res, !!msg.noCreateTab); });
    }).then(function (r) {
      // `blocked` = desafio do Cloudflare devolvido COM status 200 (inject.js detecta).
      // Passar isso adiante é o que faz a fila frear no caso que antes lia como sucesso.
      _qNoteStatus(r && r.status, r && r.blocked);
      if (r && typeof r === 'object') r.pace = _qStats();   // o app mostra o ritmo medido
      sendResponse(r);
    }, function (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); });
    return true; // resposta assíncrona
  }
  // Passo medido, sob demanda — o app usa pra explicar a espera ("letzplay limitando,
  // indo de 1,2s pra 9,6s por página") em vez de parecer travado.
  if (msg && msg.type === 'lp-pace') { sendResponse(_qStats()); return true; }
  // Navegação da aba compartilhada (v1.46) — serializada na MESMA fila dos fetches:
  // navegar no meio de uma leitura de outra operação seria pisar no pé dela.
  if (msg && msg.type === 'lp-nav' && typeof msg.url === 'string' &&
      msg.url.indexOf('https://letzplay.me/') === 0) {
    enqueue(function () {
      return new Promise(function (res) { navLetzplayTab(msg.url, res); });
    }).then(sendResponse, function (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); });
    return true; // assíncrona
  }
  if (msg && msg.type === 'lp-scan-profile' && typeof msg.handle === 'string') {
    // NAVEGA a aba compartilhada → obrigatoriamente serializado com todo o resto.
    enqueue(function () {
      return new Promise(function (res) { scanProfileViaTab(msg.handle, msg.mode === 'full' ? 'full' : 'essential', res); });
    }).then(sendResponse, function (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); });
    return true; // assíncrona
  }
  if (msg && msg.type === 'lp-close-scan-tab') { closeAutoScanTab(); sendResponse({ ok: true }); return true; }
});
