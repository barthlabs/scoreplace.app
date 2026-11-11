// Editor visual da agenda de fases. Usa as mesmas reservas consumidas pelo sorteio.
(function () {
  'use strict';
  var model = window.ScoreplacePhaseGridPlan;
  var overlayOpen = false, previousBodyOverflow = '', previousFocus = null;
  var preDrawPreviousState = null;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];
  }); }
  function daysOf(state) {
    var staged = !state.preDrawId && typeof window._readEstimatedGameHours === 'function' ? window._readEstimatedGameHours() : null;
    if (staged && Array.isArray(staged.days) && staged.days.length) return staged.days;
    return state && state.tournament && state.tournament.scheduleWindow &&
      state.tournament.scheduleWindow.days || (state && state.day ? [state.day] : []);
  }
  function dayOf(state) {
    var days = daysOf(state);
    return days.find(function (day) { return day.day === state.activeDay; }) || days[0];
  }
  function section() { return document.getElementById('phase-grid-predraw-mount') || document.getElementById('phase-call-order-editor'); }
  function overlay() { return document.getElementById('phase-grid-overlay'); }
  function gridRoot() { return overlayOpen ? overlay() : section(); }
  function showError(message) {
    var el = document.getElementById('phase-grid-message');
    if (el) { el.textContent = message || ''; el.hidden = !message; }
  }
  function label(tile) {
    var category = tile.category.replace(/^Fem\s+/i, 'Feminino ').replace(/^Masc\s+/i, 'Masculino ');
    return (tile.kind === 'groups' ? 'Classificatória' : 'Eliminatórias') + ' · ' + category;
  }
  function timeMarks(tiles, tournament, start, last) {
    var blocks = new Set([start]);
    var games = new Set();
    tiles.forEach(function (tile) {
      blocks.add(model.minutes(tile.startTime));
      model.gameStarts(tile, tournament).forEach(function (time) { games.add(time); });
    });
    var selected = Array.from(blocks).sort(function (a, b) { return a - b; });
    Array.from(games).sort(function (a, b) { return a - b; }).forEach(function (time) {
      if (time >= start && time <= last && selected.every(function (mark) { return Math.abs(mark - time) >= 10; }))
        selected.push(time);
    });
    selected.sort(function (a, b) { return a - b; });
    if (last - selected[selected.length - 1] >= 10) selected.push(last);
    return selected;
  }
  function position(event, court) {
    var state = window._phaseCallOrderState, lane = event.currentTarget;
    var y = event.clientY - lane.getBoundingClientRect().top;
    var at = model.minutes(dayOf(state).startTime) + Math.max(0, Math.round(y / 15) * 5);
    return { court:court, startTime:model.clock(at) };
  }
  function redraw(keepScroll) {
    var mount = section(), state = window._phaseCallOrderState;
    if (!mount) { if (overlayOpen) window._closePhaseGridEditor(); return; }
    if (overlayOpen && !overlay()) {
      overlayOpen = false;
      document.body.style.overflow = previousBodyOverflow;
      if (state) state.selectedId = null;
    }
    var scheduleState = state && state.preDrawId ? null : window._estimatedGameHoursState;
    if (scheduleState && scheduleState.mode === 'participants') {
      if (overlayOpen) window._closePhaseGridEditor();
      mount.innerHTML = ''; return;
    }
    if (!state || !state.plan || !model || !state.tiles.length) {
      mount.innerHTML = '<div class="phase-grid-editor"><h3>Grade de fases e quadras</h3>' +
        '<p>Gere uma proposta com as vagas, quadras e durações configuradas. Depois ajuste os blocos na tela ampla.</p>' +
        '<div class="phase-grid-proposal"><label>Jogo eliminatório <input id="phase-grid-elimination-play" type="number" min="1" max="180" value="25" inputmode="numeric"> min</label>' +
        '<button type="button" class="btn btn-secondary" onclick="window._phaseGridSuggest()">Gerar proposta de grade</button></div>' +
        '<p id="phase-grid-proposal-message" role="alert" hidden></p></div>';
      return;
    }
    var day = dayOf(state), start = model.minutes(day && day.startTime), end = model.minutes(day && day.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      mount.innerHTML = '<div class="phase-grid-editor"><h3>Grade de fases e quadras</h3><p>Defina primeiro o horário do dia.</p></div>';
      return;
    }
    mount.innerHTML = '<section class="phase-grid-editor phase-grid-launcher" aria-label="Grade de fases e quadras">' +
      '<div><h3>Grade de fases e quadras</h3><p>' + state.tiles.length + ' blocos em ' + daysOf(state).length +
      ' dia(s). ' + (state.touched ? 'Ajustes pendentes de salvar no torneio.' : 'Abra para conferir e ajustar a programação.') + '</p></div>' +
      '<button type="button" class="btn btn-secondary" onclick="window._openPhaseGridEditor()">Abrir grade em tela ampla</button></section>';
    if (!overlayOpen) return;
    var root = overlay();
    if (!root) return;
    var oldViewport = root.querySelector('.phase-grid-viewport');
    var scrollTop = keepScroll && oldViewport ? oldViewport.scrollTop : 0;
    var scrollLeft = keepScroll && oldViewport ? oldViewport.scrollLeft : 0;
    var visible = state.tiles.filter(function (tile) { return (tile.day || state.plan.day) === day.day; });
    var last = visible.reduce(function (max, tile) { return Math.max(max, model.minutes(tile.startTime) + tile.duration); }, end);
    var height = (last - start) * 3, columns = Number(state.plan.courts);
    var numbers = model.numbered(state.tiles, state.plan);
    var eliminationNames = model.eliminationLabels(state.tiles);
    var overlapping = model.overlapIds(state.tiles, state.plan);
    var categories = Array.from(new Set(state.tiles.map(function (tile) { return tile.category; })));
    var marks = timeMarks(visible, state.tournament, start, last);
    var times = marks.map(function (time) {
      var firstHour = time === start, finalHour = time === last;
      return '<span class="phase-grid-hour" style="top:' + (firstHour ? 8 : finalHour ? height - 5 : (time - start) * 3) +
        'px' + (firstHour ? ';transform:none' : '') + '">' + model.clock(time) + '</span>';
    });
    var lines = marks.map(function (time) {
      return '<span class="phase-grid-time-line" style="top:' + (time - start) * 3 + 'px"></span>';
    }).join('');
    root.innerHTML = '<section class="phase-grid-editor phase-grid-fullscreen" role="dialog" aria-modal="true" aria-label="Programação visual das fases">' +
      '<div class="phase-grid-toolbar"><div class="phase-grid-toolbar-main"><h2>' + (state.preDrawId ? 'Revisar a grade antes do sorteio' : 'Fases na grade de quadras e horários') + '</h2>' +
      '<div class="phase-grid-days" aria-label="Data da grade">' + daysOf(state).map(function (d) {
        return '<button type="button" class="phase-grid-day' + (d.day === day.day ? ' active' : '') + '" onclick="window._phaseGridDay(\'' + esc(d.day) + '\')"' +
          (state.locked ? '' : ' ondragover="event.preventDefault()" ondrop="window._phaseGridDropDay(event,\'' + esc(d.day) + '\')"') +
          '>' + esc(new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR')) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="phase-grid-toolbar-actions">' + (state.preDrawId ?
        '<button type="button" class="btn btn-primary" id="phase-grid-draw-button" onclick="window._phaseGridSaveAndDraw()">Salvar grade e sortear</button>' : '') +
      '<button type="button" class="btn btn-secondary phase-grid-close" onclick="window._closePhaseGridEditor()">' + (state.preDrawId ? 'Voltar sem sortear' : 'Voltar à edição') + '</button></div></div>' +
      '<div class="phase-grid-controls">' +
      (state.locked ? '<p class="phase-grid-locked">O sorteio já publicou os jogos. A grade pode ser conferida; movê-la agora alteraria horários e números de jogos.</p>' :
      '<div class="phase-grid-presets"><button type="button" class="btn btn-secondary" onclick="window._phaseGridPreset(\'compact\')">Concentrar antes</button>' +
      '<button type="button" class="btn btn-secondary" onclick="window._phaseGridPreset(\'spread\')">Espalhar ao longo do torneio</button></div>' +
      '<p class="phase-grid-drag-help">Arraste sobre outro bloco para trocar posições; solte numa vaga livre para mover.</p>') + '</div>' +
      '<p id="phase-grid-message" class="phase-grid-error" role="alert" hidden></p>' +
      '<div class="phase-grid-viewport"><div class="phase-grid-head" style="--phase-grid-courts:' + columns + '"><span>Hora</span>' +
      Array.from({ length:columns }, function (_, i) { return '<span>' + esc((state.tournament.courtNames || [])[i] || ('Quadra ' + (i + 1))) + '</span>'; }).join('') +
      '</div><div class="phase-grid-body" style="height:' + height + 'px;grid-template-columns:66px repeat(' + columns + ',minmax(180px,1fr))">' +
      '<div class="phase-grid-times" style="height:' + height + 'px">' + times.join('') + '</div>' +
      Array.from({ length:columns }, function (_, i) {
        var court = i + 1;
        return '<div class="phase-grid-lane" style="height:' + height + 'px" data-court="' + court + '"' +
          (state.locked ? '' : ' ondragover="event.preventDefault()" ondrop="window._phaseGridDrop(event,' + court + ')"') + '>' +
          lines +
          visible.filter(function (tile) { return tile.court === court; }).map(function (tile) {
            var top = (model.minutes(tile.startTime) - start) * 3, tileHeight = tile.duration * 3 - 3;
            var id = esc(tile.id), groupName = model.groupLabel(tile);
            var title = tile.kind === 'groups' ? label(tile) : eliminationNames[tile.id];
            var short = tile.kind === 'groups' ? 'Grupo ' + groupName + ' · 3 jogos' : tile.category;
            var gameTimes = model.gameStarts(tile, state.tournament);
            var accent = 'phase-grid-cat-' + (categories.indexOf(tile.category) % 6);
            var overflow = model.outsideWindow(tile, day), collision = overlapping.has(tile.id);
            return '<div class="phase-grid-tile ' + (tile.kind === 'groups' ? 'phase-grid-group' : 'phase-grid-elim') + ' ' + accent +
              (overflow || collision ? ' phase-grid-overflow' : '') +
              (state.selectedId === tile.id ? ' selected' : '') + '" style="top:' + top + 'px;height:' + tileHeight + 'px"' +
              ' data-tile-id="' + id + '" tabindex="0" role="button" aria-label="' + esc(title + ', ' + short + ', quadra ' + court + ', ' + tile.startTime + (overflow ? ', ultrapassa o fim do dia' : '') + (collision ? ', sobreposto a outro bloco' : '')) + '"' +
              (state.locked ? '' : ' draggable="' + (window.matchMedia && window.matchMedia('(pointer:fine)').matches ? 'true' : 'false') + '"' +
                ' ondragstart="window._phaseGridDragStart(event,\'' + id + '\')" onkeydown="window._phaseGridKey(event,\'' + id + '\')"') + '>' +
              '<strong>' + esc(title) + '</strong><small>' + esc(short) + '</small>' +
              (tile.kind === 'groups' ? '<div class="phase-grid-series">' + [0,1,2].map(function (offset) {
                return '<span>JOGO ' + (numbers[tile.id] + offset) + ' <small>(' + (offset + 1) + '/3) · ' + model.clock(gameTimes[offset]) + '</small></span>';
              }).join('') + '</div>' : '<span class="phase-grid-single">JOGO ' + numbers[tile.id] + '</span>') +
              '<small>' + esc(tile.startTime) + '–' + esc(model.clock(model.minutes(tile.startTime) + tile.duration)) +
              (overflow ? ' · Excede o horário' : '') + (collision ? ' · Sobreposição' : '') + '</small></div>';
          }).join('') + '</div>';
      }).join('') + '</div></div></section>';
    var viewport = root.querySelector('.phase-grid-viewport');
    if (viewport) { viewport.scrollTop = scrollTop; viewport.scrollLeft = scrollLeft; }
    if (state.tiles.some(function (tile) {
      var target = daysOf(state).find(function (d) { return d.day === (tile.day || state.plan.day); });
      return !target || model.outsideWindow(tile, target);
    })) showError('Blocos listrados ultrapassam o horário do dia. Ajuste a grade ou amplie a janela antes de salvar.');
    else if (overlapping.size) showError('Blocos listrados ocupam a mesma quadra no mesmo horário. Ajuste-os antes de salvar.');
    else if (state.gridWarning) showError(state.gridWarning + ' Ajuste a sequência antes de salvar.');
  }
  function applyMove(id, court, startTime, targetDay, targetId) {
    var state = window._phaseCallOrderState;
    if (!state || state.locked || state.saving || state.presetBusy) return;
    var destination = targetDay || dayOf(state).day;
    var result = model.move(state.tiles, id, court, startTime, state.plan, daysOf(state), destination, targetId);
    if (result.error) { showError(result.error); return; }
    state.tiles = result.tiles; state.touched = true; state.selectedId = id;
    state.activeDay = destination;
    state.gridWarning = result.warning || null;
    redraw(true);
  }
  window._renderPhaseGridEditor = redraw;
  window._phaseGridSuggest = function () {
    var message = document.getElementById('phase-grid-proposal-message');
    function fail(value) { if (message) { message.hidden = false; message.textContent = value; } }
    var schedule = window._estimatedGameHoursState;
    if (!schedule || schedule.mode !== 'organizer') { fail('Selecione jogos determinados pelo organizador.'); return; }
    var cfg = typeof window._f2GetConfig === 'function' ? window._f2GetConfig() : null;
    if (!cfg || cfg.parceria !== 'rei_rainha' || cfg.classifAtiva === false ||
        !cfg.eliminatoria || cfg.eliminatoria.ativa === false) {
      fail('A proposta automática desta grade requer classificatória Rei/Rainha seguida de eliminatórias.'); return;
    }
    var categoryNames = window._getCreateFormCategoryData && window._getCreateFormCategoryData().combinedCategories || [];
    var custom = !!(document.getElementById('tourn-custom-category-capacity') || {}).checked;
    var capacity = {};
    try { capacity = JSON.parse((document.getElementById('tourn-max-by-category') || {}).value || '{}'); } catch (e) {}
    var general = Number((document.getElementById('tourn-max-per-category') || {}).value);
    var categories = categoryNames.map(function (name) {
      var participants = custom ? Number(capacity[name]) : general;
      return { name:name, groups:participants / 4 };
    });
    if (!categories.length || categories.some(function (cat) { return !Number.isInteger(cat.groups); })) {
      fail('Defina a capacidade de cada categoria em múltiplos de quatro atletas.'); return;
    }
    var dayKeys = typeof window._estimatedGameDays === 'function' ? window._estimatedGameDays() : [];
    var savedDays = schedule.saved && schedule.saved.days || [];
    var start = (document.getElementById('tourn-start-time') || {}).value || '08:00';
    var end = (document.getElementById('tourn-end-time') || {}).value || '21:00';
    var days = dayKeys.map(function (day) {
      var original = savedDays.find(function (row) { return row.day === day; }) || {};
      var changed = schedule.valuesByDay[day] || {};
      return { day:day, startTime:changed.startTime || original.startTime || start,
        endTime:changed.endTime || original.endTime || end };
    });
    var tournament = Object.assign({}, window._phaseCallOrderState && window._phaseCallOrderState.tournament || {}, {
      gameDuration:Number((document.getElementById('tourn-game-duration') || {}).value),
      callTime:Number((document.getElementById('tourn-call-time') || {}).value),
      warmupTime:Number((document.getElementById('tourn-warmup-time') || {}).value),
      courtNames:((document.getElementById('tourn-court-names') || {}).value || '').split(',').map(function (s) { return s.trim(); })
    });
    var result = model.suggest({ days:days, courts:Number((document.getElementById('tourn-court-count') || {}).value),
      gameDuration:tournament.gameDuration, callTime:tournament.callTime, warmupTime:tournament.warmupTime,
      eliminationPlayMinutes:Number((document.getElementById('phase-grid-elimination-play') || {}).value),
      categories:categories });
    if (result.error) { fail(result.error); return; }
    schedule.touched = true;
    window._phaseCallOrderState = { tournament:tournament, plan:result.plan, day:days[0], tiles:result.tiles,
      activeDay:days[0].day, locked:false, touched:true };
    redraw(false);
    window._openPhaseGridEditor();
  };
  window._openPhaseGridEditor = function () {
    var state = window._phaseCallOrderState;
    if (!state || !state.plan || !state.tiles.length) return;
    if (overlayOpen && overlay()) return;
    if (overlayOpen) window._closePhaseGridEditor();
    previousFocus = document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    var root = document.createElement('div');
    root.id = 'phase-grid-overlay';
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    overlayOpen = true;
    redraw(false);
    var close = root.querySelector('.phase-grid-close');
    if (close) close.focus({ preventScroll:true });
  };
  window._closePhaseGridEditor = function (resultReady) {
    if (window._phaseCallOrderState && window._phaseCallOrderState.saving) return;
    var root = overlay(); if (root) root.remove();
    overlayOpen = false;
    document.body.style.overflow = previousBodyOverflow;
    var state = window._phaseCallOrderState; if (state) state.selectedId = null;
    if (state && state.preDrawId) {
      var mount = document.getElementById('phase-grid-predraw-mount'); if (mount) mount.remove();
      window._phaseCallOrderState = preDrawPreviousState;
      preDrawPreviousState = null;
    }
    if (!resultReady && previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll:true });
  };
  window._openMonarchPreDrawReview = function (tId) {
    var tournament = typeof window._findTournamentById === 'function' && window._findTournamentById(tId);
    var plan = tournament && tournament.scheduleWindow && tournament.scheduleWindow.interleavedPlan;
    var days = tournament && tournament.scheduleWindow && tournament.scheduleWindow.days;
    if (!tournament || !plan || !Array.isArray(plan.blocks) || !plan.blocks.length || !Array.isArray(days) || !days.length) {
      if (typeof window.showAlertDialog === 'function') window.showAlertDialog('Grade de jogos ausente',
        'Configure as categorias, vagas, quadras e horários na edição do torneio antes de sortear.', null, { type:'warning' });
      return false;
    }
    if (overlayOpen) window._closePhaseGridEditor();
    preDrawPreviousState = window._phaseCallOrderState;
    var mount = document.createElement('div'); mount.id = 'phase-grid-predraw-mount'; mount.hidden = true;
    document.body.appendChild(mount);
    window._phaseCallOrderState = { tournament:tournament, plan:plan, day:days[0], activeDay:days[0].day,
      tiles:model.expand(plan, tournament), locked:false, touched:false, preDrawId:String(tId) };
    window._openPhaseGridEditor();
    return true;
  };
  window._phaseGridSaveAndDraw = async function () {
    var state = window._phaseCallOrderState;
    if (!state || !state.preDrawId || state.saving || state.presetBusy) return;
    var button = document.getElementById('phase-grid-draw-button');
    state.saving = true;
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Preparando sorteio…'; }
    var progress = document.createElement('div');
    progress.id = 'phase-grid-draw-progress';
    progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite');
    progress.innerHTML = '<span class="phase-grid-progress-spinner" aria-hidden="true"></span><strong data-phase-grid-progress-label>Preparando o sorteio…</strong><small>Aguarde a chave aparecer antes de continuar.</small>';
    document.body.appendChild(progress);
    var updateProgress = function (message) {
      var label = progress.querySelector('[data-phase-grid-progress-label]');
      if (label) label.textContent = message;
      if (button) button.textContent = message;
    };
    if (typeof window.setTimeout === 'function') state.progressDelayTimer = window.setTimeout(function () {
      if (state.saving) {
        updateProgress('Ainda aguardando o sorteio…');
        var detail = progress.querySelector('small');
        if (detail) detail.textContent = 'Aguarde a confirmação; não repita a ação.';
      }
    }, 20000);
    try {
      // Cede dois quadros para pintar o progresso, com saída em abas suspensas.
      if (typeof window.requestAnimationFrame === 'function') await new Promise(function (resolve) {
        var finished = false, fallback;
        var done = function () {
          if (finished) return;
          finished = true;
          if (fallback && typeof window.clearTimeout === 'function') window.clearTimeout(fallback);
          resolve();
        };
        if (typeof window.setTimeout === 'function') fallback = window.setTimeout(done, 150);
        window.requestAnimationFrame(function () { window.requestAnimationFrame(done); });
      });
      var error = model.validate(state.tiles, state.plan, daysOf(state));
      if (error) throw new Error(error);
      if (state.touched) {
        updateProgress('Salvando grade…');
        var plan = model.toPlan(state.plan, state.tiles);
        plan.editorVersion = 2;
        var db = window.FirestoreDB;
        if (!db || typeof db._callFn !== 'function') throw new Error('Serviço de gravação indisponível.');
        var result = await db._callFn('updateTournamentConfiguration', {
          tournamentId:state.preDrawId, sandbox:db._ehSandbox(state.preDrawId),
          patch:{ scheduleWindow:{ interleavedPlan:plan } }
        });
        if (!result || result.ok === false) throw new Error(result && result.message || 'A grade não foi salva.');
        state.tournament.scheduleWindow.interleavedPlan = plan;
      }
      var id = state.preDrawId;
      window._monarchDrawReviewApproved = window._monarchDrawReviewApproved || {};
      window._monarchDrawReviewApproved[id] = true;
      updateProgress('Sorteando…');
      window.generateDrawFunction(id);
    } catch (cause) {
      window._phaseGridDrawFinished(state.preDrawId, cause && cause.message || String(cause));
    }
  };
  window._phaseGridDrawFinished = function (tId, error) {
    var state = window._phaseCallOrderState;
    if (!state || String(state.preDrawId || '') !== String(tId) || !state.saving) return;
    if (state.progressDelayTimer && typeof window.clearTimeout === 'function') window.clearTimeout(state.progressDelayTimer);
    state.progressDelayTimer = null;
    var progress = document.getElementById('phase-grid-draw-progress');
    if (progress) progress.remove();
    state.saving = false;
    if (error) {
      var button = document.getElementById('phase-grid-draw-button');
      if (button) { button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = 'Salvar grade e sortear'; }
      showError('Sorteio não concluído: ' + error);
      return;
    }
    window._closePhaseGridEditor(true);
  };
  document.addEventListener('keydown', function (event) {
    if (overlayOpen && event.key === 'Escape') { event.preventDefault(); window._closePhaseGridEditor(); }
  });
  window._phaseGridDay = function (day) {
    var state = window._phaseCallOrderState; if (!state || !daysOf(state).some(function (d) { return d.day === day; })) return;
    state.activeDay = day; redraw(false);
  };
  window._phaseGridDragStart = function (event, id) {
    var state = window._phaseCallOrderState;
    if (!state || state.locked || !state.tiles.some(function (tile) { return tile.id === id; })) { event.preventDefault(); return; }
    event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move';
  };
  window._phaseGridDrop = function (event, court) {
    event.preventDefault(); event.stopPropagation();
    var state = window._phaseCallOrderState, id = event.dataTransfer.getData('text/plain');
    if (!state || !state.tiles.some(function (tile) { return tile.id === id; })) return;
    var target = position(event, court);
    var hovered = event.target && event.target.closest && event.target.closest('[data-tile-id]');
    applyMove(id, target.court, target.startTime, null,
      hovered && hovered.getAttribute('data-tile-id') !== id ? hovered.getAttribute('data-tile-id') : null);
  };
  window._phaseGridDropDay = function (event, destination) {
    event.preventDefault(); event.stopPropagation();
    var state = window._phaseCallOrderState, id = event.dataTransfer.getData('text/plain');
    var tile = state && state.tiles.find(function (candidate) { return candidate.id === id; });
    var day = state && daysOf(state).find(function (candidate) { return candidate.day === destination; });
    if (!tile || !day || state.locked) return;
    var start = Math.max(model.minutes(tile.startTime), model.minutes(day.startTime));
    applyMove(id, tile.court, model.clock(start), destination);
  };
  window._phaseGridKey = function (event, id) {
    var state = window._phaseCallOrderState, tile = state && state.tiles.find(function (t) { return t.id === id; });
    if (!tile) return;
    var step = { ArrowUp:[0,-5], ArrowDown:[0,5], ArrowLeft:[-1,0], ArrowRight:[1,0] }[event.key];
    if (!step) return;
    event.preventDefault();
    applyMove(id, tile.court + step[0], model.clock(model.minutes(tile.startTime) + step[1]));
    var focus = gridRoot().querySelector('[data-tile-id="' + id + '"]'); if (focus) focus.focus({ preventScroll:true });
  };
  window._phaseGridPreset = function (mode) {
    var state = window._phaseCallOrderState; if (!state || state.locked) return;
    var result = model.preset(state.tiles, state.plan, daysOf(state), mode);
    if (result.error) { showError(result.error); return; }
    state.tiles = result.tiles; state.touched = true; state.selectedId = null; state.gridWarning = null; redraw(true);
  };
  window._readPhaseGridPlan = function () {
    var state = window._phaseCallOrderState;
    if (!state || !state.touched || state.locked || !state.plan) return null;
    var error = model.validate(state.tiles, state.plan, daysOf(state));
    if (error) return { error:error };
    var result = model.toPlan(state.plan, state.tiles);
    result.editorVersion = 2;
    return result;
  };
})();
