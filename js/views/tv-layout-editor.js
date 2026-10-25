/* Editor da tela No ar: a prévia usa o mesmo renderer da janela de produção. */
(function () {
  'use strict';
  var Core = window.ScoreplaceTvLayout;
  if (!Core) return;
  var labels = { header: 'Cabeçalho', courts: 'Em quadra', upcoming: 'Próximo jogo', rankings: 'Classificação', results: 'Últimos resultados', qr: 'QR do aplicativo' };
  var cardLabels = { court: 'Quadra', number: 'Número do jogo', category: 'Categoria', teams: 'Times', players: 'Atletas', score: 'Placar', timer: 'Relógio' };
  var draft = null, touched = false, mounted = null, pendingSet = false, resizeObserver = null, snapshot = null;
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function current() { return draft || Core.defaults(); }
  function previewSnapshot(layout) {
    var t = window._editingTournament;
    var editField = document.getElementById('edit-tournament-id');
    if (editField && String(editField.value || '') !== String(t && t.id || '')) return null;
    if (!t || !t.id || typeof window._tvLivePreviewDocument !== 'function' ||
        typeof window._tvLiveIsComplete !== 'function' || typeof window._tvLiveBuildSnapshot !== 'function' ||
        !window._tvLiveIsComplete(t)) return null;
    var games = [];
    try { games = typeof window._collectAllMatches === 'function' ? window._collectAllMatches(t) || [] : t.matches || []; }
    catch (e) { return null; }
    if (!games.length) return null;
    // _assignGlobalGameNumbers escreve _gameNum em objetos compartilhados.
    // O editor restaura cada valor, inclusive a ausência da propriedade.
    var seen = new Set(), previous = [];
    games.forEach(function (game) {
      if (!game || seen.has(game)) return;
      seen.add(game);
      previous.push({ game: game, had: Object.prototype.hasOwnProperty.call(game, '_gameNum'), value: game._gameNum });
    });
    try { return window._tvLiveBuildSnapshot(Object.assign({}, t, { tvLayout: Core.normalize(layout) }), Date.now()); }
    catch (e) { if (window._warn) window._warn('Prévia da TV indisponível', e); return null; }
    finally { previous.forEach(function (p) { if (p.had) p.game._gameNum = p.value; else delete p.game._gameNum; }); }
  }
  function fitPreview(doc, section) {
    if (!doc || !doc.defaultView) return;
    var root = section || doc;
    root.querySelectorAll('.tv-team-tag,.tv-result-team,.tv-score').forEach(function (el) {
      el.style.fontSize = '';
      var box = el.closest('.tv-side,.tv-result-side');
      if (!box || !box.clientHeight || !el.clientHeight) return;
      var size = parseFloat(doc.defaultView.getComputedStyle(el).fontSize) || 12;
      var min = el.classList.contains('tv-score') ? 12 : 7;
      while (el.scrollHeight > el.clientHeight + 1 && size > min) {
        size = Math.max(min, size - .5); el.style.fontSize = size + 'px';
      }
    });
    root.querySelectorAll('.tv-upcoming .tv-result-players').forEach(function (box) {
      var names = box.querySelectorAll('span');
      names.forEach(function (el) { el.style.fontSize = ''; });
      if (!box.clientHeight || !names.length) return;
      var size = parseFloat(doc.defaultView.getComputedStyle(names[0]).fontSize) || 12;
      while (box.scrollHeight > box.clientHeight + 1 && size > 10) {
        size = Math.max(10, size - .5);
        names.forEach(function (el) { el.style.fontSize = size + 'px'; });
      }
    });
  }
  function scale(host) {
    var canvas = host.querySelector('[data-tv-canvas]'), frame = host.querySelector('[data-tv-frame]');
    if (canvas && frame) frame.style.transform = 'scale(' + (canvas.clientWidth / 1280) + ')';
  }
  function boxHtml(id, b) {
    return '<div data-tv-box="' + id + '" role="group" tabindex="0" aria-label="' + labels[id] + '" style="position:absolute;z-index:2;left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%;height:' + b.h + '%;border:2px solid #67e8f9;border-radius:5px;cursor:move;touch-action:none;box-shadow:inset 0 0 0 1px #06121a88">' +
      '<span style="position:absolute;top:0;left:0;max-width:calc(100% - 29px);padding:2px 6px;background:#06121ae6;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + labels[id] + '</span>' +
      '<button type="button" data-tv-remove="' + id + '" aria-label="Remover ' + labels[id] + '" title="Remover ' + labels[id] + '" style="position:absolute;right:0;top:0;z-index:3;width:26px;height:26px;background:#991b1b;color:#fff;border:1px solid #fff;border-radius:0 3px 0 5px;font-size:18px;line-height:20px;cursor:pointer">×</button>' +
      '<span data-tv-resize="' + id + '" aria-label="Redimensionar ' + labels[id] + '" title="Arraste para redimensionar" style="position:absolute;right:0;bottom:0;width:18px;height:18px;background:#fbbf24;border:1px solid #111;cursor:nwse-resize;touch-action:none"></span></div>';
  }
  function render() {
    var host = document.getElementById('tv-layout-editor');
    if (!host) return;
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    if (!draft) draft = Core.defaults();
    var layout = draft;
    snapshot = previewSnapshot(layout);
    var documentHtml = snapshot ? window._tvLivePreviewDocument(snapshot) : '';
    var visible = Core.IDS.filter(function (id) { return layout.sections[id].visible; });
    var removed = Core.IDS.filter(function (id) { return !layout.sections[id].visible; });
    host.innerHTML = '<div style="border-top:1px solid #475569;padding-top:1rem;color:var(--text-main)">' +
      '<h3 style="margin:0 0 .4rem">📺 Tela No ar</h3>' +
      '<p style="font-size:.8rem;color:var(--text-muted)">Arraste as seções para posicioná-las e o canto inferior direito para mudar o tamanho. O X retira a seção; você pode recolocá-la abaixo. As alterações entram no ar ao salvar o torneio.</p>' +
      '<label style="display:flex;gap:.6rem;align-items:center;margin-bottom:.6rem">Cor de fundo <input data-tv-background type="color" value="' + esc(layout.background) + '"></label>' +
      '<div data-tv-canvas aria-label="Prévia da tela No ar" style="position:relative;width:100%;aspect-ratio:16/9;background:' + esc(layout.background) + ';border:2px solid #818cf8;border-radius:8px;overflow:hidden;touch-action:none;user-select:none">' +
      (documentHtml ? '<iframe data-tv-frame title="Prévia com dados do torneio" sandbox="allow-same-origin" tabindex="-1" style="position:absolute;left:0;top:0;width:1280px;height:720px;border:0;transform-origin:top left;pointer-events:none"></iframe>' :
        '<div data-tv-empty style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:1rem;text-align:center;color:#cbd5e1;font-size:.9rem">Salve e configure os jogos do torneio para visualizar os dados reais nesta prévia.</div>') +
      visible.map(function (id) { return boxHtml(id, layout.sections[id]); }).join('') + '</div>' +
      '<div data-tv-removed style="margin:.8rem 0"><strong style="font-size:.8rem">Seções retiradas</strong><div style="display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.35rem">' +
      (removed.length ? removed.map(function (id) { return '<button type="button" data-tv-restore="' + id + '" class="btn btn-secondary" style="font-size:.8rem">+ ' + labels[id] + '</button>'; }).join('') :
        '<span style="font-size:.8rem;color:var(--text-muted)">Nenhuma</span>') + '</div></div>' +
      '<fieldset style="border:1px solid #475569;border-radius:8px"><legend>Informações nos cards em quadra</legend><div style="display:flex;flex-wrap:wrap;gap:.7rem;font-size:.8rem">' +
      Core.CARD_IDS.map(function (id) { return '<label><input type="checkbox" data-tv-card="' + id + '" ' + (layout.card[id] ? 'checked' : '') + '> ' + cardLabels[id] + '</label>'; }).join('') + '</div></fieldset>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin:.8rem 0"><button type="button" data-tv-default class="btn btn-secondary">Restaurar padrão</button><button type="button" data-tv-save-template class="btn btn-primary">Salvar modelo de TV</button><select data-tv-template-list aria-label="Modelos de TV" style="max-width:220px;background:#0f172a;color:white;border:1px solid #64748b"><option value="">Modelos de TV...</option></select><button type="button" data-tv-load-template class="btn btn-secondary">Usar modelo</button><button type="button" data-tv-delete-template class="btn btn-secondary">Excluir modelo</button></div></div>';
    var frame = host.querySelector('[data-tv-frame]');
    if (frame) {
      frame.onload = function () { scale(host); fitPreview(frame.contentDocument); };
      frame.srcdoc = documentHtml; scale(host);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(function () { scale(host); });
        resizeObserver.observe(host.querySelector('[data-tv-canvas]'));
      }
    }
    host.querySelector('[data-tv-background]').oninput = function (event) {
      layout.background = event.target.value; touched = true;
      host.querySelector('[data-tv-canvas]').style.background = layout.background;
      var board = frame && frame.contentDocument && frame.contentDocument.querySelector('.tv-custom-board');
      if (board) board.style.background = layout.background;
    };
    host.querySelectorAll('[data-tv-card]').forEach(function (input) { input.onchange = function () {
      layout.card[input.dataset.tvCard] = input.checked; touched = true;
      if (snapshot && frame) { snapshot.tvLayout = Core.normalize(layout); frame.srcdoc = window._tvLivePreviewDocument(snapshot); }
    }; });
    host.querySelectorAll('[data-tv-remove]').forEach(function (button) { button.onclick = function (event) {
      event.stopPropagation(); layout.sections[button.dataset.tvRemove].visible = false; touched = true; render();
    }; });
    host.querySelectorAll('[data-tv-restore]').forEach(function (button) { button.onclick = function () {
      layout.sections[button.dataset.tvRestore].visible = true; touched = true; render();
    }; });
    function updateBox(id) {
      var b = layout.sections[id], el = host.querySelector('[data-tv-box="' + id + '"]');
      if (!el) return;
      el.style.left = b.x + '%'; el.style.top = b.y + '%'; el.style.width = b.w + '%'; el.style.height = b.h + '%';
      var inside = frame && frame.contentDocument && frame.contentDocument.querySelector('.tv-custom-' + id);
      if (inside) {
        inside.style.left = b.x + '%'; inside.style.top = b.y + '%';
        inside.style.width = b.w + '%'; inside.style.height = b.h + '%';
        fitPreview(frame.contentDocument, inside);
      }
    }
    host.querySelectorAll('[data-tv-box]').forEach(function (box) { box.onpointerdown = function (event) {
      if (event.target.closest('[data-tv-remove]') || (event.button !== 0 && event.pointerType === 'mouse')) return;
      event.preventDefault();
      var id = box.dataset.tvBox, b = layout.sections[id], resize = !!event.target.closest('[data-tv-resize]');
      var rect = host.querySelector('[data-tv-canvas]').getBoundingClientRect();
      var x0 = event.clientX, y0 = event.clientY, initial = { x: b.x, y: b.y, w: b.w, h: b.h };
      box.setPointerCapture(event.pointerId);
      box.onpointermove = function (move) {
        var dx = (move.clientX - x0) / rect.width * 100, dy = (move.clientY - y0) / rect.height * 100;
        var round = function (n) { return Math.round(n * 10) / 10; };
        if (resize) {
          b.w = round(Math.max(5, Math.min(100 - b.x, initial.w + dx)));
          b.h = round(Math.max(5, Math.min(100 - b.y, initial.h + dy)));
        } else {
          b.x = round(Math.max(0, Math.min(100 - b.w, initial.x + dx)));
          b.y = round(Math.max(0, Math.min(100 - b.h, initial.y + dy)));
        }
        touched = true; updateBox(id);
      };
      box.onpointerup = box.onpointercancel = function () { box.onpointermove = null; };
    }; });
    host.querySelector('[data-tv-default]').onclick = function () { draft = Core.defaults(); touched = true; render(); };
    host.querySelector('[data-tv-save-template]').onclick = saveTemplate;
    host.querySelector('[data-tv-load-template]').onclick = function () {
      var select = host.querySelector('[data-tv-template-list]');
      var template = (window._tvTemplateCache || []).find(function (item) { return item._id === select.value; });
      if (template) window._tvEditorSetLayout(template.tvLayout);
    };
    host.querySelector('[data-tv-delete-template]').onclick = async function () {
      var select = host.querySelector('[data-tv-template-list]');
      var uid = window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid;
      if (!select.value || !uid) return;
      await window.FirestoreDB.deleteTvTemplate(uid, select.value); await loadTemplates();
    };
    loadTemplates();
  }
  async function loadTemplates() {
    var host = document.getElementById('tv-layout-editor');
    var uid = window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid;
    if (!host || !uid || !window.FirestoreDB) return;
    try {
      var all = await window.FirestoreDB.getTvTemplates(uid); window._tvTemplateCache = all;
      var select = host.querySelector('[data-tv-template-list]');
      if (select) select.innerHTML = '<option value="">Modelos de TV...</option>' +
        all.map(function (t) { return '<option value="' + esc(t._id) + '">' + esc(t.name) + '</option>'; }).join('');
    } catch (e) { if (window._warn) window._warn('Modelos de TV indisponíveis', e); }
  }
  function saveTemplate() {
    var uid = window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid;
    if (!uid || !window.FirestoreDB || typeof window.showInputDialog !== 'function') return;
    window.showInputDialog('Nome do modelo de TV', 'Minha tela No ar', async function (name) {
      if (!name || !name.trim()) return;
      try {
        await window.FirestoreDB.saveTvTemplate(uid, name.trim(), window._tvEditorReadLayout() || Core.defaults());
        await loadTemplates();
        if (window.showNotification) window.showNotification('Modelo de TV salvo', '', 'success');
      } catch (e) { if (window.showNotification) window.showNotification('Não foi possível salvar o modelo de TV', e.message || '', 'error'); }
    });
  }
  window._tvEditorSetLayout = function (value) {
    try { draft = value ? Core.normalize(value) : null; touched = !!value; }
    catch (e) { draft = null; touched = false; }
    pendingSet = true;
    if (mounted && mounted.isConnected) { pendingSet = false; render(); }
  };
  window._tvEditorReadLayout = function () { return touched ? Core.normalize(current()) : null; };
  function mount() {
    var details = document.getElementById('tv-personalization');
    var phase = document.getElementById('fase1-box');
    var host = document.getElementById('tv-layout-editor');
    if (!details || !phase || !host || mounted === host) return;
    phase.parentNode.insertBefore(details, phase); mounted = host;
    if (!pendingSet) {
      draft = null; touched = false;
      var editField = document.getElementById('edit-tournament-id');
      if (window._editingTournament && (!editField || String(editField.value || '') === String(window._editingTournament.id || ''))) {
        try { draft = window._editingTournament.tvLayout ? Core.normalize(window._editingTournament.tvLayout) : null; touched = !!draft; }
        catch (e) { draft = null; touched = false; }
      }
    }
    pendingSet = false; render();
  }
  var observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true }); mount();
})();
