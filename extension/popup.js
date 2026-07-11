/* popup.js — auto-import: puxa o histórico do usuário logado no letzplay, extrai,
 * normaliza e mostra. Reusa lib/letzplay-extract.js + lib/letzplay-import.js.
 * Roda na sessão logada (fetch com credentials → passa Cloudflare). Desktop.
 */
'use strict';
var X = window._spExtract, I = window._spImport;
var elGo = document.getElementById('go');
var elFill = document.getElementById('fill');
var elStatus = document.getElementById('status');
var elResult = document.getElementById('result');
var lastImport = null;

function fill(pct) { elFill.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
function status(t) { elStatus.textContent = t || ''; }

async function fetchDoc(url) {
  var html = await fetch(url, { credentials: 'include' }).then(function (r) { return r.text(); });
  return new DOMParser().parseFromString(html, 'text/html');
}

// ME = handle que aparece em TODOS (ou quase) os cards — o usuário logado joga em todos.
function detectMe(doc) {
  var cards = [].slice.call(doc.querySelectorAll('.row.match'));
  var count = {};
  cards.forEach(function (c) {
    var hs = [].slice.call(c.querySelectorAll('a[href^="/"]'))
      .map(function (a) { return X.handleFromHref(a.getAttribute('href')); })
      .filter(Boolean);
    [].slice.call(new Set(hs)).forEach(function (h) { count[h] = (count[h] || 0) + 1; });
  });
  var me = null, best = 0;
  Object.keys(count).forEach(function (h) { if (count[h] > best) { best = count[h]; me = h; } });
  return me;
}

function detectMaxPage(doc) {
  var nums = [].slice.call(doc.querySelectorAll('a[href*="page="]')).map(function (a) {
    var m = a.getAttribute('href').match(/page=(\d+)/); return m ? +m[1] : 1;
  });
  return nums.length ? Math.max.apply(null, nums) : 1;
}

// Total de jogos do header ("81 Jogos • 39 Vitórias • 42 Derrotas") — pra barra por jogos.
function parseTotalGames(doc) {
  var t = (doc.body.textContent || '').replace(/\s+/g, ' ');
  var m = t.match(/(\d+)\s*Jogos\s*[•·]\s*\d+\s*Vit/i);
  return m ? +m[1] : null;
}

// Agrupa os jogos em competições (footprint): oficial (torneio) vs recreativo (ranking).
function buildRaw(me, matches) {
  var rankings = {}, tournaments = {};
  matches.forEach(function (m) {
    var bucket = m.official ? tournaments : rankings;
    var key = (m.club || '') + '|' + (m.categoryRaw || '') + '|' + (m.rankingId || '');
    if (!bucket[key]) bucket[key] = {
      name: m.categoryRaw, club: m.club, sport: 'Beach Tennis', categoryRaw: m.categoryRaw,
      year: m.year, status: 'done', wins: 0, losses: 0
    };
    if (m.won) bucket[key].wins++; else if (m.won === false) bucket[key].losses++;
  });
  var rk = Object.keys(rankings).map(function (k) {
    var r = rankings[k]; var n = r.wins + r.losses;
    r.winPct = n ? Math.round(r.wins / n * 1000) / 10 : null; return r;
  });
  var tn = Object.keys(tournaments).map(function (k) { return tournaments[k]; });
  var wins = matches.filter(function (m) { return m.won; }).length;
  var losses = matches.filter(function (m) { return m.won === false; }).length;
  // ladder: default masc (v1). Detecta fem se as categorias forem femininas.
  var fem = matches.some(function (m) { return /Feminina|Fem\b/.test(m.categoryRaw || ''); });
  return {
    handle: me, name: me, sports: ['Beach Tennis'], venues: [],
    totals: { matches: matches.length, wins: wins, losses: losses },
    ladder: fem ? 'beach-fem-2025' : 'beach-masc-2025',
    rankings: rk, tournaments: tn, matches: matches
  };
}

function showResult(imp) {
  var off = imp.officialCategory;
  var r = imp.rating || {};
  var footOff = (imp.footprint || []).filter(function (f) { return f.official; }).length;
  var footRec = (imp.footprint || []).filter(function (f) { return !f.official; }).length;
  elResult.style.display = 'block';
  elResult.innerHTML =
    '<div class="row"><span class="k">Conta</span><b>@' + imp.handle + '</b></div>' +
    '<div class="row"><span class="k">Categoria oficial</span><b class="off mono">' + (off ? off.categoryRaw : '—') + '</b></div>' +
    '<div class="row"><span class="k">Forma (recreativo)</span><b class="mono">' + (r.band || '—') + (r.value ? ' · ' + r.value : '') + '</b></div>' +
    '<div class="row"><span class="k">Jogos</span><b>' + imp.profile.totals.matches + ' (' + imp.profile.totals.wins + 'V/' + imp.profile.totals.losses + 'D)</b></div>' +
    '<div class="row"><span class="k">Footprint</span><b>' + footOff + ' oficiais · ' + footRec + ' recreativos</b></div>' +
    '<div class="row"><span class="k">Observações</span><b>' + (imp.observations || []).length + ' (ocultas)</b></div>' +
    '<button id="send" style="margin-top:10px;">📤 Enviar pro meu perfil no scoreplace</button>' +
    '<button id="copy" style="margin-top:8px;background:#1b2230;">📋 Copiar JSON</button>';
  document.getElementById('copy').onclick = function () {
    navigator.clipboard.writeText(JSON.stringify(imp, null, 2));
    document.getElementById('copy').textContent = '✓ Copiado';
  };
  document.getElementById('send').onclick = function () { sendToScoreplace(imp); };
}

// Manda o import pra aba do scoreplace (content.js relaya pra página, que grava no doc do usuário).
function sendToScoreplace(imp) {
  status('Enviando pro scoreplace…');
  chrome.tabs.query({ url: ['https://scoreplace.app/*', 'http://localhost/*'] }, function (tabs) {
    if (!tabs || !tabs.length) {
      status('⚠️ Abra o scoreplace.app numa aba (logado) e clique de novo.'); return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { __sp_lp: 'import', letzplayImport: imp }, function (resp) {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        status('⚠️ Não falei com o scoreplace — recarregue a aba do scoreplace e tente de novo.'); return;
      }
      status('✅ Enviado! Confira no seu Perfil (pode precisar reabrir).');
    });
  });
}

async function run() {
  elGo.disabled = true; elResult.style.display = 'none';
  try {
    status('Detectando sua conta…'); fill(5);
    var doc1 = await fetchDoc('https://letzplay.me/u/matches/history');
    if (/login|entrar/i.test((doc1.title || '')) || doc1.querySelector('input[type="password"]')) {
      throw new Error('Você não está logado no letzplay.me. Abra letzplay.me, faça login e tente de novo.');
    }
    var me = detectMe(doc1);
    if (!me) throw new Error('Não encontrei jogos na sua conta.');
    var maxPage = detectMaxPage(doc1);
    var total = parseTotalGames(doc1);
    var all = X.extractMatchesFromDoc(doc1, me);
    var prog = function () {
      if (total) { status(all.length + ' de ' + total + ' jogos importados'); fill(Math.min(96, all.length / total * 100)); }
      else { status(all.length + ' jogos importados…'); fill(all.length ? 45 : 5); }
    };
    prog();
    for (var p = 2; p <= maxPage; p++) {
      var d = await fetchDoc('https://letzplay.me/u/matches/history?page=' + p);
      all = all.concat(X.extractMatchesFromDoc(d, me));
      prog();
    }
    status('Montando seu histórico…'); fill(98);
    var raw = buildRaw(me, all);
    var imp = I.normalize(raw, { importedAt: new Date().toISOString() });
    var v = I.validate(imp);
    if (!v.valid) throw new Error('Estrutura inválida: ' + v.errors.join('; '));
    lastImport = imp;
    fill(100); status('✅ ' + all.length + (total ? ' de ' + total : '') + ' jogos importados.');
    showResult(imp);
  } catch (e) {
    fill(0); status('⚠️ ' + (e.message || e));
  } finally {
    elGo.disabled = false;
  }
}

elGo.addEventListener('click', run);
