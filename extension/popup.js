/* popup.js — auto-import: puxa o histórico do usuário logado no letzplay, extrai,
 * normaliza e mostra. Reusa lib/letzplay-extract.js + lib/letzplay-import.js.
 * Roda na sessão logada (fetch com credentials → passa Cloudflare). Desktop.
 */
'use strict';
var X = window._spExtract, I = window._spImport, F = window._spFlow;
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

// Helpers do fluxo (detectMe / detectMaxPage / parseTotalGames / buildRaw) vivem em
// lib/letzplay-flow.js (window._spFlow) — compartilhados com content.js (import direto).

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
    '<div class="row"><span class="k">Histórico game-a-game</span><b>' + ((imp.games || []).length) + ' jogos</b></div>' +
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

// Manda o import pra aba do scoreplace (content.js relaya pra página, que grava no doc do
// usuário e devolve o resultado REAL — sucesso só quando o Firestore confirma a gravação).
var ERR_MSG = {
  'sem-login': '⚠️ Você não está logado no scoreplace. Faça login na aba e tente de novo.',
  'conta-diferente': '⚠️ O @ importado não bate com o do seu perfil no scoreplace.',
  'malformado': '⚠️ Import inválido. Rode "Importar meu histórico" de novo.',
  'sem-resposta': '⚠️ A aba do scoreplace não respondeu — recarregue-a e tente de novo.'
};
function sendToScoreplace(imp) {
  status('Enviando pro scoreplace…');
  chrome.tabs.query({ url: ['https://scoreplace.app/*', 'http://localhost/*'] }, function (tabs) {
    if (!tabs || !tabs.length) {
      status('⚠️ Abra o scoreplace.app numa aba (logado) e clique de novo.'); return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { __sp_lp: 'import', letzplayImport: imp }, function (resp) {
      if (chrome.runtime.lastError || !resp) {
        status('⚠️ Não falei com o scoreplace — recarregue a aba e tente de novo.'); return;
      }
      if (resp.ok) {
        var n = (resp.count != null) ? resp.count : ((imp.games || []).length);
        status('✅ Importado! ' + n + ' jogos no seu perfil. Abra 📊 Estatísticas → Histórico de jogos.');
      } else {
        status(ERR_MSG[resp.error] || ('⚠️ Falhou: ' + (resp.error || 'erro desconhecido')));
      }
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
    var me = F.detectMe(doc1);
    if (!me) throw new Error('Não encontrei jogos na sua conta.');
    var maxPage = F.detectMaxPage(doc1);
    var total = F.parseTotalGames(doc1);
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
    var raw = F.buildRaw(me, all);
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
