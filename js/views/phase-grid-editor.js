// Editor visual da agenda de fases. Usa as mesmas reservas consumidas pelo sorteio.
(function () {
  'use strict';
  var model = window.ScoreplacePhaseGridPlan;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];
  }); }
  function daysOf(state) {
    var staged = typeof window._readEstimatedGameHours === 'function' ? window._readEstimatedGameHours() : null;
    if (staged && Array.isArray(staged.days) && staged.days.length) return staged.days;
    return state && state.tournament && state.tournament.scheduleWindow &&
      state.tournament.scheduleWindow.days || (state && state.day ? [state.day] : []);
  }
  function dayOf(state) {
    var days = daysOf(state);
    return days.find(function (day) { return day.day === state.activeDay; }) || days[0];
  }
  function section() { return document.getElementById('phase-call-order-editor'); }
  function showError(message) {
    var el = document.getElementById('phase-grid-message');
    if (el) { el.textContent = message || ''; el.hidden = !message; }
  }
  function label(tile) {
    var category = tile.category.replace(/^Fem\s+/i, 'Feminino ').replace(/^Masc\s+/i, 'Masculino ');
    return (tile.kind === 'groups' ? 'Classificatória' : 'Eliminatórias') + ' · ' + category;
  }
  function stats(tiles) {
    var result = [];
    tiles.forEach(function (tile) {
      var key = model.stageKey(tile), row = result.find(function (r) { return r.key === key; });
      if (!row) { row = { key:key, label:label(tile), count:0, games:0, kind:tile.kind }; result.push(row); }
      row.count++; row.games += tile.kind === 'groups' ? 3 : 1;
    });
    return result;
  }
  function position(event, court) {
    var state = window._phaseCallOrderState, lane = event.currentTarget;
    var y = event.clientY - lane.getBoundingClientRect().top;
    var at = model.minutes(dayOf(state).startTime) + Math.max(0, Math.round(y / 15) * 5);
    return { court:court, startTime:model.clock(at) };
  }
  function redraw(keepScroll) {
    var mount = section(), state = window._phaseCallOrderState;
    if (!mount || !state) return;
    var scheduleState = window._estimatedGameHoursState;
    if (scheduleState && scheduleState.mode === 'participants') { mount.innerHTML = ''; return; }
    if (!state.plan || !model || !state.tiles.length) {
      mount.innerHTML = '<div class="phase-grid-editor"><h3>Grade de fases e quadras</h3><p>A grade aparece quando a programação de grupos e eliminatórias está definida.</p></div>';
      return;
    }
    var day = dayOf(state), start = model.minutes(day && day.startTime), end = model.minutes(day && day.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      mount.innerHTML = '<div class="phase-grid-editor"><h3>Grade de fases e quadras</h3><p>Defina primeiro o horário do dia.</p></div>';
      return;
    }
    var oldViewport = mount.querySelector('.phase-grid-viewport');
    var scrollTop = keepScroll && oldViewport ? oldViewport.scrollTop : 0;
    var scrollLeft = keepScroll && oldViewport ? oldViewport.scrollLeft : 0;
    var visible = state.tiles.filter(function (tile) { return (tile.day || state.plan.day) === day.day; });
    var last = visible.reduce(function (max, tile) { return Math.max(max, model.minutes(tile.startTime) + tile.duration); }, end);
    var height = (last - start) * 3, columns = Number(state.plan.courts);
    var summary = stats(state.tiles), numbers = model.numbered(state.tiles, state.plan);
    var categories = Array.from(new Set(state.tiles.map(function (tile) { return tile.category; })));
    var times = [];
    for (var time = start; time <= last; time += 20) times.push('<span class="phase-grid-hour" style="top:' + ((time - start) * 3) + 'px">' + model.clock(time) + '</span>');
    mount.innerHTML = '<section class="phase-grid-editor" aria-label="Programação visual das fases">' +
      '<h3>Fases na grade de quadras e horários</h3>' +
      '<p>Cada bloco classificatório reserva uma quadra para três jogos do grupo. Cada eliminatória reserva uma partida. Arraste para outra quadra ou horário. Para mudar de dia, selecione o bloco, escolha o dia e clique na quadra.</p>' +
      '<div class="phase-grid-summary">' + summary.map(function (row) {
        return '<span>' + esc(row.label) + ': <strong>' + row.count + '</strong> ' + (row.kind === 'groups' ? 'grupos' : 'partidas') + '</span>';
      }).join('') + '</div>' +
      (state.locked ? '<p class="phase-grid-locked">O sorteio já publicou os jogos. A grade pode ser conferida; movê-la agora alteraria horários e números de jogos.</p>' :
      '<div class="phase-grid-presets"><button type="button" class="btn btn-secondary" onclick="window._phaseGridPreset(\'compact\')">Concentrar antes</button>' +
      '<button type="button" class="btn btn-secondary" onclick="window._phaseGridPreset(\'spread\')">Espalhar ao longo do torneio</button></div>') +
      '<div class="phase-grid-days">' + daysOf(state).map(function (d) {
        return '<button type="button" class="phase-grid-day' + (d.day === day.day ? ' active' : '') + '" onclick="window._phaseGridDay(\'' + esc(d.day) + '\')">' + esc(new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })) + '</button>';
      }).join('') + '</div>' +
      '<p id="phase-grid-message" class="phase-grid-error" role="alert" hidden></p>' +
      '<div class="phase-grid-viewport"><div class="phase-grid-head" style="--phase-grid-courts:' + columns + '"><span>Hora</span>' +
      Array.from({ length:columns }, function (_, i) { return '<span>' + esc((state.tournament.courtNames || [])[i] || ('Quadra ' + (i + 1))) + '</span>'; }).join('') +
      '</div><div class="phase-grid-body" style="height:' + height + 'px;grid-template-columns:66px repeat(' + columns + ',minmax(140px,1fr))">' +
      '<div class="phase-grid-times" style="height:' + height + 'px">' + times.join('') + '</div>' +
      Array.from({ length:columns }, function (_, i) {
        var court = i + 1;
        return '<div class="phase-grid-lane" style="height:' + height + 'px" data-court="' + court + '"' +
          (state.locked ? '' : ' onclick="window._phaseGridPlace(event,' + court + ')" ondragover="event.preventDefault()" ondrop="window._phaseGridDrop(event,' + court + ')"') + '>' +
          visible.filter(function (tile) { return tile.court === court; }).map(function (tile) {
            var top = (model.minutes(tile.startTime) - start) * 3, tileHeight = tile.duration * 3 - 3;
            var id = esc(tile.id), groupName = model.groupLabel(tile), short = tile.kind === 'groups' ? 'Grupo ' + groupName + ' · 3 jogos' : 'Rodada ' + tile.round;
            var accent = 'phase-grid-cat-' + (categories.indexOf(tile.category) % 6);
            var overflow = model.outsideWindow(tile, day);
            return '<div class="phase-grid-tile ' + (tile.kind === 'groups' ? 'phase-grid-group' : 'phase-grid-elim') + ' ' + accent +
              (overflow ? ' phase-grid-overflow' : '') +
              (state.selectedId === tile.id ? ' selected' : '') + '" style="top:' + top + 'px;height:' + tileHeight + 'px"' +
              ' data-tile-id="' + id + '" tabindex="0" role="button" aria-label="' + esc(label(tile) + ', ' + short + ', quadra ' + court + ', ' + tile.startTime + (overflow ? ', ultrapassa o fim do dia' : '')) + '"' +
              (state.locked ? '' : ' draggable="true" onclick="event.stopPropagation();window._phaseGridSelect(\'' + id + '\')"' +
                ' ondragstart="window._phaseGridDragStart(event,\'' + id + '\')" onkeydown="window._phaseGridKey(event,\'' + id + '\')"') + '>' +
              '<strong>' + esc(label(tile)) + '</strong><small>' + esc(short) + '</small>' +
              (tile.kind === 'groups' ? '<div class="phase-grid-series">' + [0,1,2].map(function (offset) {
                return '<span>JOGO ' + (numbers[tile.id] + offset) + ' <small>(' + (offset + 1) + '/3)</small></span>';
              }).join('') + '</div>' : '<span class="phase-grid-single">JOGO ' + numbers[tile.id] + '</span>') +
              '<small>' + esc(tile.startTime) + '–' + esc(model.clock(model.minutes(tile.startTime) + tile.duration)) +
              (overflow ? ' · Excede o horário' : '') + '</small></div>';
          }).join('') + '</div>';
      }).join('') + '</div></div></section>';
    var viewport = mount.querySelector('.phase-grid-viewport');
    if (viewport) { viewport.scrollTop = scrollTop; viewport.scrollLeft = scrollLeft; }
    if (state.tiles.some(function (tile) {
      var target = daysOf(state).find(function (d) { return d.day === (tile.day || state.plan.day); });
      return !target || model.outsideWindow(tile, target);
    })) showError('Blocos listrados ultrapassam o horário do dia. Ajuste a grade ou amplie a janela antes de salvar.');
  }
  function applyMove(id, court, startTime) {
    var state = window._phaseCallOrderState;
    if (!state || state.locked) return;
    var result = model.move(state.tiles, id, court, startTime, state.plan, daysOf(state), dayOf(state).day);
    if (result.error) { showError(result.error); return; }
    state.tiles = result.tiles; state.touched = true; state.selectedId = id;
    redraw(true);
  }
  window._renderPhaseGridEditor = redraw;
  window._phaseGridDay = function (day) {
    var state = window._phaseCallOrderState; if (!state || !daysOf(state).some(function (d) { return d.day === day; })) return;
    state.activeDay = day; redraw(false);
  };
  window._phaseGridSelect = function (id) {
    var state = window._phaseCallOrderState; if (!state || state.locked) return;
    state.selectedId = state.selectedId === id ? null : id;
    section().querySelectorAll('.phase-grid-tile').forEach(function (el) {
      el.classList.toggle('selected', el.dataset.tileId === state.selectedId);
    });
  };
  window._phaseGridDragStart = function (event, id) { event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; };
  window._phaseGridDrop = function (event, court) {
    event.preventDefault(); event.stopPropagation();
    var id = event.dataTransfer.getData('text/plain'), target = position(event, court);
    applyMove(id, target.court, target.startTime);
  };
  window._phaseGridPlace = function (event, court) {
    var state = window._phaseCallOrderState; if (!state || !state.selectedId) return;
    var target = position(event, court); applyMove(state.selectedId, target.court, target.startTime);
  };
  window._phaseGridKey = function (event, id) {
    var state = window._phaseCallOrderState, tile = state && state.tiles.find(function (t) { return t.id === id; });
    if (!tile) return;
    var step = { ArrowUp:[0,-5], ArrowDown:[0,5], ArrowLeft:[-1,0], ArrowRight:[1,0] }[event.key];
    if (!step) return;
    event.preventDefault();
    applyMove(id, tile.court + step[0], model.clock(model.minutes(tile.startTime) + step[1]));
    var focus = section().querySelector('[data-tile-id="' + id + '"]'); if (focus) focus.focus({ preventScroll:true });
  };
  window._phaseGridPreset = function (mode) {
    var state = window._phaseCallOrderState; if (!state || state.locked) return;
    var result = model.preset(state.tiles, state.plan, daysOf(state), mode);
    if (result.error) { showError(result.error); return; }
    state.tiles = result.tiles; state.touched = true; state.selectedId = null; redraw(true);
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
