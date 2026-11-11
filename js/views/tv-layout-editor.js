/* Editor da tela No ar: a prévia usa o mesmo renderer da janela de produção. */
(function () {
  'use strict';
  var Core = window.ScoreplaceTvLayout;
  if (!Core) return;
  var labels = { header: 'Cabeçalho', courts: 'Em quadra', upcoming: 'Próximo jogo', rankings: 'Classificação', results: 'Últimos resultados', qr: 'QR do aplicativo', logo: 'Logo do torneio',
    live1: 'Partida 1', live2: 'Partida 2', live3: 'Partida 3', live4: 'Partida 4',
    standing1: 'Classificação 1', standing2: 'Classificação 2', standing3: 'Classificação 3', standing4: 'Classificação 4' };
  var cardLabels = { court: 'Quadra', number: 'Número do jogo', category: 'Categoria', teams: 'Times', players: 'Atletas', score: 'Placar', timer: 'Relógio' };
  var draft = null, screens = null, activePhase = 0, touched = false, mounted = null, pendingSet = false, resizeObserver = null, snapshot = null;
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function current() { return draft || Core.defaults(); }
  function setState(layout, savedScreens) {
    var base = layout ? Core.normalize(layout) : Core.defaults();
    screens = savedScreens ? Core.normalizeScreens(savedScreens) : null;
    if (!screens) screens = [{ phaseIndex: 0, layout: base }];
    activePhase = screens[0].phaseIndex;
    draft = screens[0].layout;
    touched = !!layout || !!savedScreens;
  }
  function phaseNames() {
    var phases = window._editingTournament && window._editingTournament.phases || [];
    try {
      var cfg = typeof window._f2GetConfig === 'function' ? window._f2GetConfig() : null;
      if (cfg && window.FORMAT2 && typeof window.FORMAT2.compileToPhases === 'function')
        phases = window.FORMAT2.compileToPhases(cfg).phases || phases;
    } catch (e) { /* o formato ainda pode estar sendo editado */ }
    return phases.map(function (phase, i) { return String(phase && phase.name || 'Fase ' + (i + 1)); });
  }
  function sourceChoices(t, snapshotData) {
    if (snapshotData) return { matches: snapshotData.matchChoices || [], lines: snapshotData.lineChoices || [] };
    var matches = [];
    try { matches = typeof window._collectAllMatches === 'function' ? window._collectAllMatches(t) || [] : t && t.matches || []; }
    catch (e) { matches = t && t.matches || []; }
    var available = matches.filter(function (m) { return m && m.id && !m.isBye && !m.isSitOut; });
    var lines = Array.from(new Set(available.map(function (m) { return String(m.bracket || 'main'); })));
    return {
      matches: available.map(function (m) { return { id: String(m.id), label: 'JOGO ' +
        (m._gameNum || m.scheduledGameNumber || m.matchNumber || '') + ' · ' +
        String(m.bracket || m.category || '') + (m.isThirdPlace ? ' · 3º lugar' : '') }; }),
      lines: lines.map(function (key) { return { key: key, label: key === 'gold' ? 'Ouro' : key === 'silver' ? 'Prata' : key === 'main' ? 'Principal' : key }; })
    };
  }
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
    var field = function (id, fallback) { var el = document.getElementById(id); return el ? el.value : fallback; };
    var currentEdit = Object.assign({}, t, { tvScreens: null, tvLayout: Core.normalize(layout),
      coverColor: field('tourn-cover-color', t.coverColor),
      coverGradientColor: field('tourn-cover-gradient-color', t.coverGradientColor),
      coverGradientAngle: field('tourn-cover-gradient-angle', t.coverGradientAngle),
      coverGradientBalance: field('tourn-cover-gradient-balance', t.coverGradientBalance),
      coverGradientBlend: field('tourn-cover-gradient-blend', t.coverGradientBlend),
      coverGradientEnabled: (document.getElementById('tourn-cover-gradient-enabled') || {}).checked ?? t.coverGradientEnabled,
      titleColor: field('tourn-title-color', t.titleColor),
      logoUrl: field('tourn-logo-data', t.logoUrl || t.logoData), logoData: field('tourn-logo-data', t.logoData) });
    try { return window._tvLiveBuildSnapshot(currentEdit, Date.now()); }
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
    return '<div data-tv-box="' + id + '" role="group" tabindex="0" aria-label="' + labels[id] + '" style="position:absolute;z-index:' + (id === 'qr' ? 5 : 2) + ';left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%;height:' + b.h + '%;border:2px solid #67e8f9;border-radius:5px;cursor:move;touch-action:none;box-shadow:inset 0 0 0 1px #06121a88">' +
      '<span style="position:absolute;top:0;left:0;max-width:calc(100% - 29px);padding:2px 6px;background:#06121ae6;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + labels[id] + '</span>' +
      (id === 'qr' ? '' : '<button type="button" data-tv-remove="' + id + '" aria-label="Remover ' + labels[id] + '" title="Remover ' + labels[id] + '" style="position:absolute;right:0;top:0;z-index:3;width:26px;height:26px;background:#991b1b;color:#fff;border:1px solid #fff;border-radius:0 3px 0 5px;font-size:18px;line-height:20px;cursor:pointer">×</button>') +
      '<span data-tv-resize="' + id + '" aria-label="Redimensionar ' + labels[id] + '" title="Arraste para redimensionar" style="position:absolute;right:0;bottom:0;width:18px;height:18px;background:#fbbf24;border:1px solid #111;cursor:nwse-resize;touch-action:none"></span></div>';
  }
  function render() {
    var host = document.getElementById('tv-layout-editor');
    if (!host) return;
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    if (!screens) setState(null, null);
    var selected = screens.find(function (screen) { return screen.phaseIndex === activePhase; }) || screens[0];
    draft = selected.layout;
    var layout = draft;
    var names = phaseNames();
    var occupied = new Set(screens.map(function (screen) { return screen.phaseIndex; }));
    var count = Math.min(12, Math.max(names.length, activePhase + 1, screens.length + 1));
    var phaseOptions = Array.from({ length: count }, function (_, i) {
      return '<option value="' + i + '"' + (i === activePhase ? ' selected' : '') + (occupied.has(i) && i !== activePhase ? ' disabled' : '') + '>' + esc(names[i] || 'Fase ' + (i + 1)) + '</option>';
    }).join('');
    snapshot = previewSnapshot(layout);
    var choicesByKind = sourceChoices(window._editingTournament, snapshot);
    var documentHtml = snapshot ? window._tvLivePreviewDocument(snapshot) : '';
    var visible = Core.IDS.filter(function (id) { return layout.sections[id].visible; });
    var removed = Core.IDS.filter(function (id) { return !layout.sections[id].visible; });
    host.innerHTML = '<div style="border-top:1px solid #475569;padding-top:1rem;color:var(--text-main)">' +
      '<h3 style="margin:0 0 .4rem">📺 Tela No ar</h3>' +
      '<p style="font-size:.8rem;color:var(--text-muted)">Arraste as seções para posicioná-las e o canto inferior direito para mudar o tamanho. Bordas próximas se encaixam automaticamente. O QR permanece visível e pode ser movido. As alterações entram no ar ao salvar o torneio.</p>' +
      '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.6rem 0 .8rem"><label>Tela <select data-tv-screen-list aria-label="Selecionar tela No ar">' +
      screens.map(function (screen, i) { return '<option value="' + screen.phaseIndex + '"' + (screen.phaseIndex === activePhase ? ' selected' : '') + '>Tela ' + (i + 1) + ' · ' + esc(names[screen.phaseIndex] || 'Fase ' + (screen.phaseIndex + 1)) + '</option>'; }).join('') +
      '</select></label><label>Usar na fase <select data-tv-phase aria-label="Fase desta tela">' + phaseOptions + '</select></label>' +
      '<button type="button" data-tv-add-screen class="btn btn-secondary"' + (screens.length >= 12 ? ' disabled' : '') + '>+ Nova tela</button>' +
      (screens.length > 1 ? '<button type="button" data-tv-delete-screen class="btn btn-secondary">Excluir esta tela</button>' : '') + '</div>' +
      '<div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-bottom:.6rem"><button type="button" data-tv-finals-preset class="btn btn-secondary">Final Ouro e Prata</button><label>Fundo <select data-tv-background-mode aria-label="Origem das cores da tela"><option value="tournament"' + (layout.backgroundMode === 'tournament' ? ' selected' : '') + '>Cores do torneio</option><option value="custom"' + (layout.backgroundMode === 'custom' ? ' selected' : '') + '>Cor manual</option></select></label>' +
      '<label data-tv-manual-color' + (layout.backgroundMode === 'custom' ? '' : ' hidden') + '>Cor <input data-tv-background type="color" value="' + esc(layout.background) + '"></label>' +
      (!layout.sections.logo.visible ? '<button type="button" data-tv-add-logo class="btn btn-secondary">+ Colocar logo</button>' :
        '<label>Largura do logo <input data-tv-logo-size="w" type="number" min="5" max="100" step="0.1" value="' + layout.sections.logo.w + '" style="width:5rem">%</label><label>Altura <input data-tv-logo-size="h" type="number" min="5" max="100" step="0.1" value="' + layout.sections.logo.h + '" style="width:5rem">%</label>') + '</div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem">' +
      Core.IDS.filter(function (id) { return /^live[1-4]$|^standing[1-4]$/.test(id) && layout.sections[id].visible; }).map(function (id) {
        var choices = id.indexOf('live') === 0 ? choicesByKind.matches : choicesByKind.lines;
        var source = layout.sections[id].source || '';
        return '<label style="font-size:.8rem">' + labels[id] + ' <select data-tv-source="' + id + '" aria-label="' + labels[id] + '" style="max-width:12rem"><option value="">Selecionar...</option>' +
          choices.map(function (choice) { var value = choice.id || choice.key; return '<option value="' + esc(value) + '"' + (source === value ? ' selected' : '') + '>' + esc(choice.label) + '</option>'; }).join('') + '</select></label>';
      }).join('') + '</div>' +
      '<div data-tv-canvas aria-label="Prévia da tela No ar" style="position:relative;width:100%;aspect-ratio:16/9;background:' + esc(layout.backgroundMode === 'custom' ? layout.background : (snapshot && snapshot.theme && snapshot.theme.background || '#060d1a')) + ';border:2px solid #818cf8;border-radius:8px;overflow:hidden;touch-action:none;user-select:none">' +
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
    host.querySelector('[data-tv-background-mode]').onchange = function (event) {
      layout.backgroundMode = event.target.value; touched = true; render();
    };
    host.querySelector('[data-tv-background]').oninput = function (event) {
      layout.background = event.target.value; touched = true;
      if (layout.backgroundMode !== 'custom') return;
      host.querySelector('[data-tv-canvas]').style.background = layout.background;
      var board = frame && frame.contentDocument && frame.contentDocument.querySelector('.tv-custom-board');
      if (board) board.style.background = layout.background;
    };
    var addLogo = host.querySelector('[data-tv-add-logo]');
    if (addLogo) addLogo.onclick = function () { layout.sections.logo.visible = true; touched = true; render(); };
    host.querySelector('[data-tv-finals-preset]').onclick = function () {
      var t = window._editingTournament, matches = [];
      try { matches = typeof window._collectAllMatches === 'function' ? window._collectAllMatches(t) || [] : t && t.matches || []; }
      catch (e) { matches = t && t.matches || []; }
      selected.layout = Core.finalsPreset(layout, matches); draft = selected.layout; touched = true; render();
    };
    host.querySelectorAll('[data-tv-source]').forEach(function (input) { input.onchange = function () {
      layout.sections[input.dataset.tvSource].source = input.value; touched = true; render();
    }; });
    host.querySelector('[data-tv-screen-list]').onchange = function (event) {
      activePhase = Number(event.target.value); render();
    };
    host.querySelector('[data-tv-phase]').onchange = function (event) {
      selected.phaseIndex = Number(event.target.value); activePhase = selected.phaseIndex; touched = true; render();
    };
    host.querySelector('[data-tv-add-screen]').onclick = function () {
      var next = Array.from({ length: 12 }, function (_, i) { return i; }).find(function (i) { return !occupied.has(i); });
      if (next == null) return;
      var copy = Core.normalize(layout);
      screens.push({ phaseIndex: next, layout: copy }); activePhase = next; touched = true; render();
    };
    var removeScreen = host.querySelector('[data-tv-delete-screen]');
    if (removeScreen) removeScreen.onclick = function () {
      screens = screens.filter(function (screen) { return screen !== selected; });
      activePhase = screens[0].phaseIndex; touched = true; render();
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
      if (id === 'logo') host.querySelectorAll('[data-tv-logo-size]').forEach(function (input) { input.value = b[input.dataset.tvLogoSize]; });
    }
    host.querySelectorAll('[data-tv-logo-size]').forEach(function (input) { input.oninput = function () {
      var b = layout.sections.logo, key = input.dataset.tvLogoSize, value = Math.round(Number(input.value) * 10) / 10;
      if (!Number.isFinite(value)) return;
      b[key] = Math.max(5, Math.min(100 - b[key === 'w' ? 'x' : 'y'], value));
      touched = true; updateBox('logo');
    }; });
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
        var snapped = Core.snapBox(b, Core.IDS.filter(function (otherId) { return otherId !== id; }).map(function (otherId) { return layout.sections[otherId]; }), resize);
        Object.assign(b, snapped);
        touched = true; updateBox(id);
      };
      box.onpointerup = box.onpointercancel = function () { box.onpointermove = null; };
    }; });
    host.querySelector('[data-tv-default]').onclick = function () { selected.layout = Core.defaults(); draft = selected.layout; touched = true; render(); };
    host.querySelector('[data-tv-save-template]').onclick = saveTemplate;
    host.querySelector('[data-tv-load-template]').onclick = function () {
      var select = host.querySelector('[data-tv-template-list]');
      var template = (window._tvTemplateCache || []).find(function (item) { return item._id === select.value; });
      if (template) { selected.layout = Core.normalize(template.tvLayout); draft = selected.layout; touched = true; render(); }
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
    try { setState(value, null); }
    catch (e) { setState(null, null); }
    pendingSet = true;
    if (mounted && mounted.isConnected) { pendingSet = false; render(); }
  };
  window._tvEditorSetScreens = function (value) {
    try { if (value) setState(screens && screens[0] && screens[0].layout || current(), value); }
    catch (e) { setState(null, null); }
    pendingSet = true;
    if (mounted && mounted.isConnected) { pendingSet = false; render(); }
  };
  window._tvEditorReadLayout = function () { return touched ? Core.normalize(screens[0].layout) : null; };
  window._tvEditorReadScreens = function () { return touched ? Core.normalizeScreens(screens) : null; };
  window._tvEditorRefreshPreview = function () { if (mounted && mounted.isConnected) render(); };
  document.addEventListener('input', function (event) {
    if (event.target && /^tourn-(cover-|title-color)/.test(event.target.id || '')) window._tvEditorRefreshPreview();
  });
  function mount() {
    var details = document.getElementById('tv-personalization');
    var phase = document.getElementById('fase1-box');
    var host = document.getElementById('tv-layout-editor');
    if (!details || !phase || !host || mounted === host) return;
    phase.parentNode.insertBefore(details, phase); mounted = host;
    if (!pendingSet) {
      setState(null, null);
      var editField = document.getElementById('edit-tournament-id');
      if (window._editingTournament && (!editField || String(editField.value || '') === String(window._editingTournament.id || ''))) {
        try { setState(window._editingTournament.tvLayout || null, window._editingTournament.tvScreens || null); }
        catch (e) { setState(null, null); }
      }
    }
    pendingSet = false; render();
  }
  var observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true }); mount();
})();
