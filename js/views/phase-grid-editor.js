// Editor visual da agenda de fases. Usa as mesmas reservas consumidas pelo sorteio.
(function () {
  'use strict';
  var model = window.ScoreplacePhaseGridPlan;
  var overlayOpen = false, previousBodyOverflow = '', previousFocus = null;
  var pixelsPerMinute=6, dragging=false, refreshPending=false;
  var preDrawPreviousState = null;
  function datedOrganizer(t) {
    var schedule=t?.scheduleWindow;
    return Array.isArray(schedule?.days) && schedule.days.length>0 && (!schedule.mode || schedule.mode==='organizer');
  }
  var priorReview=window._requiresMonarchPreDrawReview;
  if (typeof priorReview==='function' && !priorReview.phaseGridBaseReview) {
    window._requiresMonarchPreDrawReview=function (t) {
      if (!t || Number(t.currentPhaseIndex || 0)>0 || window._tournamentHasDraw?.(t)) return false;
      return datedOrganizer(t) || priorReview(t);
    };
    window._requiresMonarchPreDrawReview.phaseGridBaseReview=priorReview;
  }
  if (window._renderPhaseGridEditor?.datedGridInstalled) return;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];
  }); }
  function daysOf(state) {
    var staged = !state.preDrawId && typeof window._readEstimatedGameHours === 'function' ? window._readEstimatedGameHours() : null;
    if (staged && Array.isArray(staged.days) && staged.days.length) return staged.days;
    return state && state.tournament && state.tournament.scheduleWindow &&
      state.tournament.scheduleWindow.days || (state && state.day ? [state.day] : []);
  }
  function displayDays(state) { return model.displayDays(state.plan,state.tiles,daysOf(state)); }
  function dayOf(state) {
    var days = displayDays(state);
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
  function tr(key,fallback) {
    var full='phaseGrid.'+key, text=window._t?.(full);
    return text && text!==full ? text : fallback;
  }
  function assignmentPanel(state) {
    if (state.locked || state.plan.schema!==2 || !state.tiles.some(tile=>tile.kind==='groups')) return '';
    var btn=(action,name)=>'<button type="button" class="btn btn-secondary" onclick="window._phaseGridAssignments(\''+
      action+'\')">'+esc(name)+'</button>';
    if (!state.assignmentDraft) return btn('open',tr('distribute','Distribuir grupos nas quadras'));
    var rows=state.assignmentDraft.map(function (r,i) {
      return '<fieldset data-assignment="'+i+'"><legend>'+esc(tr('phase','Fase')+' '+(r.phaseIndex+1)+' · '+
        r.category+' · '+tr('group','Grupo')+' '+r.groupNumber)+'</legend><label>'+esc(tr('name','Nome do grupo'))+
        ' <input type="text" data-field="label" value="'+esc(r.label)+'"></label><label>'+esc(tr('entry','Entrada'))+
        ' <input type="number" data-field="entry" min="1" max="400" value="'+esc(r.entry)+'"></label><div>'+
        Array.from({length:state.plan.courts},function (_,c) {
          var label=state.tournament.courtNames?.[c] || tr('court','Quadra')+' '+(c+1);
          return '<button type="button" class="phase-grid-day" data-assignment-court="'+(c+1)+'" aria-pressed="'+
            r.courts.includes(c+1)+'">'+esc(label)+'</button>';
        }).join(' ')+'</div></fieldset>';
    });
    return '<div class="phase-grid-assignments"><div class="phase-grid-assignment-rows">'+rows.join('')+
      '</div>'+btn('apply',tr('apply','Aplicar distribuição'))+btn('cancel',tr('cancel','Cancelar'))+
      (state.plan.groupAssignments?.length?btn('remove',tr('remove','Remover distribuição')):'')+'</div>';
  }
  window._phaseGridAssignments=function (action) {
    var state=window._phaseCallOrderState;
    if (!state || state.locked || state.saving || state.plan?.schema!==2) return;
    if (action==='open') {
      state.assignmentDraft=state.plan.groupAssignments?.length ? JSON.parse(JSON.stringify(state.plan.groupAssignments)) :
        model.suggestedAssignments(state.tiles,state.plan.courts,state.tournament);
    } else if (action==='cancel') delete state.assignmentDraft;
    else if (action==='apply' || action==='remove') {
      if (!state.assignmentDraft) return;
      var result=model.applyAssignments(state.tiles,state.plan,daysOf(state),action==='remove'?[]:state.assignmentDraft);
      if (result.error) {showError(result.error);return;}
      state.plan=result.plan; state.tiles=result.tiles; state.touched=true; state.selectedId=null;
      delete state.assignmentDraft;
      if (!state.preDrawId && typeof window._recalcDuration==='function') window._recalcDuration();
    } else return;
    redraw(true);
  };
  function editAssignment(event) {
    var el=event.target, row=el.closest?.('[data-assignment]');
    if (!row) return;
    var state=window._phaseCallOrderState, rule=state?.assignmentDraft?.[Number(row.dataset.assignment)];
    if (!rule || state.locked || state.saving) return;
    if (event.type==='input' && el.dataset.field==='label') rule.label=el.value;
    if (event.type==='input' && el.dataset.field==='entry') rule.entry=Number(el.value);
    if (event.type==='click' && el.dataset.assignmentCourt) {
      var court=Number(el.dataset.assignmentCourt), active=rule.courts.includes(court);
      rule.courts=active?rule.courts.filter(c=>c!==court):rule.courts.concat(court);
      el.setAttribute('aria-pressed',String(!active));
    }
  }
  document.addEventListener('click',editAssignment);
  document.addEventListener('input',editAssignment);
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
    var state = window._phaseCallOrderState;
    var lane=gridRoot()?.querySelector('.phase-grid-lane[data-court="'+Number(court)+'"]') || event.currentTarget;
    var y = event.clientY - lane.getBoundingClientRect().top;
    var at = model.minutes(dayOf(state).startTime) + Math.max(0, Math.round(y / (pixelsPerMinute*5)) * 5);
    return { court:court, startTime:model.clock(at) };
  }
  // Agrupamento de apresentação: nunca cria, remove ou altera uma reserva.
  function visualGroups(tiles) {
    var buckets=new Map(), result=[];
    tiles.filter(tile=>tile.kind==='groups' && tile.games===1).forEach(function(tile){
      var key=JSON.stringify([tile.phaseIndex,tile.category,tile.groupNumber,tile.day,tile.assignment?.alternating?tile.round:null]);
      if(!buckets.has(key)) buckets.set(key,[]); buckets.get(key).push(tile);
    });
    buckets.forEach(function(items){
      var courts=Array.from(new Set(items.map(tile=>tile.court))).sort((a,b)=>a-b);
      if(courts.length!==2 || courts[1]!==courts[0]+1) return;
      var rounds=Array.from(new Set(items.map(tile=>tile.round))).sort((a,b)=>a-b), end=null;
      for(var i=0;i<rounds.length;i++) {
        var pair=items.filter(tile=>tile.round===rounds[i]);
        if(pair.length!==2 || new Set(pair.map(tile=>tile.court)).size!==2 ||
          pair[0].startTime!==pair[1].startTime || pair[0].duration!==pair[1].duration ||
          pair[0].duration*pixelsPerMinute<132 || (i && rounds[i]!==rounds[i-1]+1)) return;
        var at=model.minutes(pair[0].startTime);
        if(at+pair[0].duration>1440) return;
        if(end!==null && end!==at) return; end=at+pair[0].duration;
      }
      result.push({tiles:items,courts:courts,rounds:rounds});
    });
    return result;
  }
  window._phaseGridVisualGroups=visualGroups;
  // Ilustração local: nunca entra no plano salvo nem representa o sorteio real.
  var illustrativeCache=new WeakMap();
  function illustrativeMatches(state,numbers) {
    var t=state.tournament, F=window.FORMAT2, core=window.ScoreplaceSuperEight;
    if(state.locked || t.sorteioDrawId || t.drawTimestamp || window._tournamentHasDraw?.(t) ||
      state.plan.schema!==2 || !F || !core || !t.fmt2) return {};
    var signature=JSON.stringify([t.fmt2,t.combinedCategories,t.maxParticipantsByCategory,t.maxParticipantsPerCategory,t.maxParticipants,
      state.tiles.map(tile=>[tile.id,tile.phaseIndex,tile.kind,tile.category,tile.groupNumber,tile.round,tile.sequence,tile.games]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
    var cached=illustrativeCache.get(state);
    if(cached?.signature===signature) return cached.matches;
    var matches={}, groups=new Map(), cycles=new Map();
    try {
      var categories=t.combinedCategories?.length?t.combinedCategories:[''];
      var phases=F.compileToPhases(t.fmt2,{sport:t.sport,categories:categories.filter(Boolean)}).phases;
      state.tiles.filter(tile=>tile.kind==='groups').forEach(function(tile){
        var key=JSON.stringify([tile.phaseIndex,tile.category,tile.groupNumber]);
        if(!groups.has(key)) groups.set(key,[]);groups.get(key).push(tile);
      });
      var nextPlayer=1;
      Array.from(groups.values()).sort((a,b)=>Math.min(...a.map(tile=>numbers[tile.id]))-Math.min(...b.map(tile=>numbers[tile.id]))).forEach(function(tiles){
        var first=tiles[0], phase=phases[first.phaseIndex], structure=phase?.classification;
        if(!['groups','unique_8'].includes(structure?.partnerRotation)) return;
        var people=Number(t.maxParticipantsByCategory?.[first.category] || t.maxParticipantsPerCategory ||
          (categories.length===1?t.maxParticipants:0)) || core.categoryPopulation(t,first.category);
        var layout=F.groupPlanForCategory(phase,first.category,people,false);
        var sizes=layout.sizes || (structure.partnerRotation==='unique_8' && people%8===0 ? Array(people/8).fill(8):[]);
        var rule=F.rotationRuleForCategory(structure,first.category), rounds=Number(rule?.rounds || structure.rotationRounds || phase.rounds);
        if(layout.error || sizes[first.groupNumber-1]!==8 || rule?.allowRepeatPartners ||
          !Number.isInteger(rounds) || rounds<1 || rounds>7 || tiles.length!==rounds*2) return;
        for(var round=1;round<=rounds;round++) {
          var pair=tiles.filter(tile=>tile.round===round);
          if(pair.length!==2 || pair.some(tile=>tile.games!==1) ||
            !pair.some(tile=>tile.sequence===1) || !pair.some(tile=>tile.sequence===2)) return;
        }
        if(!cycles.has(rounds)) cycles.set(rounds,core.buildGroups([0,1,2,3,4,5,6,7],rounds,false).rounds);
        var cycle=cycles.get(rounds);
        var names=new Map();
        cycle[0].flat(2).forEach(function(id){names.set(id,'J'+nextPlayer++);});
        tiles.forEach(function(tile){matches[tile.id]=cycle[tile.round-1][tile.sequence-1].map(pair=>pair.map(id=>names.get(id)));});
      });
    } catch(_error) { matches={}; }
    illustrativeCache.set(state,{signature:signature,matches:matches});return matches;
  }
  function illustrativeHtml(example) {
    return example?'<span class="phase-grid-example">'+example.map(pair=>'<span>'+esc(pair.join(' / '))+'</span>').join('<span>×</span>')+'</span>':'';
  }
  function renderGroupPanels(root,state,visible,start,columns,numbers,examples) {
    if(state.plan.schema!==2) return;
    var body=root.querySelector('.phase-grid-body');
    var MIN_GROUP_GAME_HEIGHT=54; // Número, confronto, padding e bordas do cartão compacto.
    var candidates=visualGroups(visible.filter(tile=>tile.day===dayOf(state).day)).map(function(group){
      var first=group.tiles.slice().sort((a,b)=>a.round-b.round || a.court-b.court)[0];
      var finish=Math.max(...group.tiles.map(tile=>model.minutes(tile.startTime)+tile.duration));
      var panel=document.createElement('section'); panel.className='phase-grid-super-group';
      var alternated=first.assignment?.alternating===true, headerHeight=alternated?56:96;
      var totalRounds=Math.max(...state.tiles.filter(tile=>tile.phaseIndex===first.phaseIndex && tile.category===first.category && tile.groupNumber===first.groupNumber).map(tile=>tile.round));
      panel.style.cssText='top:'+((model.minutes(first.startTime)-start)*pixelsPerMinute)+'px;height:'+((finish-model.minutes(first.startTime))*pixelsPerMinute-3)+'px;left:calc(66px + (100% - 66px) * '+(group.courts[0]-1)+' / '+columns+');width:calc((100% - 66px) * 2 / '+columns+');';
      var heading=document.createElement('header');
      heading.style.height='auto';
      heading.style.minHeight=headerHeight+'px';
      heading.innerHTML=alternated?'<strong>Grupo '+esc(first.assignment.label)+' · Rodada '+first.round+'/'+totalRounds+'</strong><span>'+esc(label(first))+'</span>':
        '<strong>'+esc(label(first))+'</strong><span>Grupo '+esc(first.assignment?.label || model.groupLabel(first))+'</span>';
      panel.appendChild(heading);
      if(!state.locked) {
        panel.addEventListener('dragover',function(event){event.preventDefault();});
        panel.addEventListener('drop',function(event){var target=event.target.closest('[data-tile-id]');window._phaseGridDrop(event,Number(target?.dataset.court || group.courts[0]));});
      }
      body.appendChild(panel);
      return {group:group,first:first,panel:panel,heading:heading};
    });
    // Todos os cabeçalhos estão na largura real antes da leitura em lote.
    candidates.forEach(function(candidate){
      candidate.headerHeight=candidate.heading.offsetHeight;
      candidate.panelHeight=candidate.panel.clientHeight;
    });
    candidates.forEach(function(candidate){
      var group=candidate.group,first=candidate.first,panel=candidate.panel,headerHeight=candidate.headerHeight;
      if(headerHeight<=0 || headerHeight+MIN_GROUP_GAME_HEIGHT>Math.min(first.duration*pixelsPerMinute-3,candidate.panelHeight)) {
        panel.remove(); return; // Cartões continuam intactos nas lanes originais.
      }
      candidate.originals=[];
      group.tiles.forEach(function(tile){
        var el=Array.from(root.querySelectorAll('[data-tile-id]')).find(el=>el.dataset.tileId===String(tile.id));
        if(!el) return;
        var firstRound=tile.round===group.rounds[0], left=tile.court===group.courts[0];
        candidate.originals.push({el:el,parent:el.parentNode,style:el.style.cssText,html:el.innerHTML});
        el.dataset.court=String(tile.court);
        el.style.top=((model.minutes(tile.startTime)-model.minutes(first.startTime))*pixelsPerMinute+(firstRound?headerHeight:0))+'px';
        el.style.height=(tile.duration*pixelsPerMinute-(firstRound?headerHeight:0)-3)+'px';
        el.style.left=left?'3px':'calc(50% + 3px)';el.style.right=left?'calc(50% + 3px)':'3px';
        el.innerHTML='<b class="phase-grid-group-game">Jogo '+numbers[tile.id]+'</b>'+
          illustrativeHtml(examples[tile.id])+'<span class="phase-grid-single" hidden>JOGO '+numbers[tile.id]+'</span>';
        panel.appendChild(el);
      });
    });
    // Valida o conteúdo sem intercalar leituras com as escritas dos grupos.
    var compact=candidates.filter(function(candidate){
      return candidate.originals && candidate.originals.some(function(item){return item.el.scrollHeight>item.el.clientHeight+1;});
    });
    compact.forEach(function(candidate){
      candidate.originals.forEach(function(item){item.el.style.cssText=item.style;item.el.innerHTML=item.html;item.parent.appendChild(item.el);});
      candidate.panel.remove();
    });
  }
  function assignmentsCompatible(rows,jobs,courts) {
    var keys=new Set(jobs.filter(j=>j.kind==='groups').map(j=>JSON.stringify([j.phaseIndex,j.category,j.groupNumber])));
    return rows.length===keys.size && rows.every(row=>keys.has(JSON.stringify([row.phaseIndex,row.category,row.groupNumber])) &&
      row.courts?.length && row.courts.every(c=>Number.isInteger(c) && c>=1 && c<=courts));
  }
  window._phaseGridAssignmentsCompatible=assignmentsCompatible;
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
      var dated=typeof window._estimatedGameDays==='function' && window._estimatedGameDays(true).length;
      mount.innerHTML = dated && !scheduleState.locked && !state?.locked
        ? '<button type="button" class="btn btn-secondary" onclick="window._phaseGridPrepareDated()">Definir horários e preparar grade de quadras</button>' : '';
      return;
    }
    if (!state || !state.plan || !model || !state.tiles.length) {
      // Depois do sorteio, a agenda já é a grade publicada. Não ofereça novamente
      // a ação de propor outra grade na tela de edição do torneio.
      if (state && state.locked) { mount.innerHTML = ''; return; }
      mount.innerHTML = '<div class="phase-grid-editor"><h3>Grade de fases e quadras</h3>' +
        '<p>Gere uma proposta com as vagas, quadras e durações configuradas. Depois ajuste os blocos na tela ampla.</p>' +
        '<div class="phase-grid-proposal"><button type="button" class="btn btn-secondary" onclick="window._phaseGridSuggest()">Gerar proposta de grade</button></div>' +
        '<p id="phase-grid-proposal-message" role="alert" hidden></p></div>';
      return;
    }
    var day = dayOf(state), start = model.minutes(day && day.startTime), end = model.minutes(day && day.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      mount.innerHTML = '<div class="phase-grid-editor"><h3>Grade de fases e quadras</h3><p>Defina primeiro o horário do dia.</p></div>';
      return;
    }
    mount.innerHTML = '<section class="phase-grid-editor phase-grid-launcher" aria-label="Grade de fases e quadras">' +
      '<div><h3>Grade de fases e quadras</h3><p>' + state.tiles.length + ' blocos em ' + displayDays(state).length +
      ' dia(s). ' + (state.touched ? 'Ajustes pendentes de salvar no torneio.' : 'Abra para conferir e ajustar a programação.') + '</p></div>' +
      (state.refreshNotice?'<p class="phase-grid-refresh-notice" role="status">'+esc(state.refreshNotice)+'</p>':'') +
      (!state.locked && !state.preDrawId ? '<button type="button" class="btn btn-secondary" onclick="window._phaseGridSuggest()">Gerar nova proposta</button><p id="phase-grid-proposal-message" role="alert" hidden></p>' : '') +
      '<button type="button" class="btn btn-secondary" onclick="window._openPhaseGridEditor()">Abrir grade em tela ampla</button></section>';
    if (!overlayOpen) return;
    var root = overlay();
    if (!root) return;
    var oldViewport = root.querySelector('.phase-grid-viewport');
    var scrollTop = keepScroll && oldViewport ? oldViewport.scrollTop : 0;
    var scrollLeft = keepScroll && oldViewport ? oldViewport.scrollLeft : 0;
    var dayOrigin=Date.parse(day.day+'T00:00:00Z')/60000;
    var visible = state.tiles.filter(function (tile) {
      var at=Date.parse((tile.day || state.plan.day)+'T00:00:00Z')/60000+model.minutes(tile.startTime);
      return at<dayOrigin+1440 && at+tile.duration>dayOrigin;
    });
    var last = visible.reduce(function (max, tile) { return Math.max(max, Math.min(1440,Date.parse(tile.day+'T00:00:00Z')/60000-dayOrigin+model.minutes(tile.startTime)+tile.duration)); }, end);
    var height = (last - start) * pixelsPerMinute, columns = Number(state.plan.courts);
    var numbers = model.numbered(state.tiles, state.plan);
    var descriptionKey=state.plan.inputSignature+'|'+JSON.stringify(state.plan.groupAssignments || []);
    if(!state.locked && state.descriptionKey!==descriptionKey && model.describeProjectedTiles && window.FORMAT2 && window._phasesEngine) {
      state.tiles=model.describeProjectedTiles(state.tournament,state.tiles,window);
      state.descriptionKey=descriptionKey;
    }
    var examples=illustrativeMatches(state,numbers);
    var eliminationNames = model.eliminationLabels(state.tiles);
    var overlapping = model.overlapIds(state.tiles, state.plan);
    var categories = Array.from(new Set(state.tiles.map(function (tile) { return tile.category; })));
    var marks = timeMarks(visible, state.tournament, start, last);
    var times = marks.map(function (time) {
      var firstHour = time === start, finalHour = time === last;
      return '<span class="phase-grid-hour" style="top:' + (firstHour ? 8 : finalHour ? height - 5 : (time - start) * pixelsPerMinute) +
        'px' + (firstHour ? ';transform:none' : '') + '">' + model.clock(time) + '</span>';
    });
    var lines = marks.map(function (time) {
      return '<span class="phase-grid-time-line" style="top:' + (time - start) * pixelsPerMinute + 'px"></span>';
    }).join('');
    root.innerHTML = '<section class="phase-grid-editor phase-grid-fullscreen" role="dialog" aria-modal="true" aria-label="Programação visual das fases">' +
      '<div class="phase-grid-toolbar"><div class="phase-grid-toolbar-main"><h2>' + (state.preDrawId ? 'Revisar a grade antes do sorteio' : 'Fases na grade de quadras e horários') + '</h2>' +
      '<div class="phase-grid-days" aria-label="Data da grade">' + displayDays(state).map(function (d) {
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
      '<button type="button" class="btn btn-secondary" onclick="window._phaseGridPreset(\'spread\')">Espalhar ao longo do torneio</button></div>' + assignmentPanel(state) +
      '<p class="phase-grid-drag-help">Arraste sobre outro bloco para trocar posições; solte numa vaga livre para mover.</p>') + '</div>' +
      (Object.keys(examples).length?'<p class="phase-grid-example-help">Exemplo de rodízio · J1, J2… são atletas hipotéticos.</p>':'')+
      (state.plan.alternatingCategories?.length?'<p class="phase-grid-example-help">Fast 8 · grupos alternados entre as rodadas. Os horários são uma previsão; a chamada segue a fila de cada quadra na súmula, com remanejamento manual pela organização.</p>':'')+
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
            var at=Date.parse(tile.day+'T00:00:00Z')/60000-dayOrigin+model.minutes(tile.startTime);
            var carry=at<0, segmentStart=Math.max(0,at), segmentEnd=Math.min(1440,at+tile.duration);
            var top = (segmentStart - start) * pixelsPerMinute, tileHeight = (segmentEnd-segmentStart) * pixelsPerMinute - 3;
            var id = esc(tile.id), groupName = model.groupLabel(tile);
            var title = tile.kind === 'groups' ? label(tile) : eliminationNames[tile.id]+' · '+tile.category;
            var matchup=model.matchupLabel?.(tile,state.tiles,state.plan) || '';
            var series = tile.kind === 'groups' && (state.plan.schema === 1 || tile.games === 3);
            var short = tile.kind==='groups' ? 'Grupo '+(tile.assignment?.label || groupName)+(series?' · 3 jogos':'')+
              (tile.assignment?.alternating?' · Rodada '+tile.round:'') : '';

            var accent = 'phase-grid-cat-' + (categories.indexOf(tile.category) % 6);
            var overflow = carry || model.outsideWindow(tile, day), collision = overlapping.has(tile.id);
            return '<div class="phase-grid-tile ' + (tile.kind === 'groups' ? 'phase-grid-group' : 'phase-grid-elim') + ' ' + accent +
              (examples[tile.id] ? ' phase-grid-illustrative' : '') +
              (overflow || collision ? ' phase-grid-overflow' : '') +
              (state.selectedId === tile.id ? ' selected' : '') + '" style="top:' + top + 'px;height:' + tileHeight + 'px"' +
              ' data-tile-id="' + id + '" tabindex="0" role="button" aria-label="' + esc('Jogo '+numbers[tile.id]+', '+title + ', ' + short + ', quadra ' + court + ', ' + tile.startTime + (overflow ? ', ultrapassa o fim do dia' : '') + (collision ? ', sobreposto a outro bloco' : '')) + '"' +
              (state.locked || carry ? '' : ' draggable="' + (window.matchMedia && window.matchMedia('(pointer:fine)').matches ? 'true' : 'false') + '"' +
                ' ondragend="window._phaseGridDragEnd()" ondragstart="window._phaseGridDragStart(event,\'' + id + '\')" onkeydown="window._phaseGridKey(event,\'' + id + '\')"') + '>' +
              (examples[tile.id] ? '<strong class="phase-grid-example-category">'+esc(tile.category+' · Grupo '+(tile.assignment?.label || groupName))+'</strong>'+
                '<span class="phase-grid-single">JOGO '+numbers[tile.id]+'</span>'+illustrativeHtml(examples[tile.id]) :
              (tile.kind==='groups'?'':'<b class="phase-grid-game-number">JOGO '+numbers[tile.id]+'</b>') +
              '<strong>' + esc(title) + '</strong>'+(short?'<small>'+esc(short)+'</small>':'') +
              (matchup?'<small class="phase-grid-matchup">'+esc(matchup)+'</small>':'')+
              (series ? '<div class="phase-grid-series">' + [0,1,2].map(function (offset) {
                return '<span>JOGO ' + (numbers[tile.id] + offset) + ' <small>(' + (offset + 1) + '/3)</small></span>';
              }).join('') + '</div>' : '<span class="phase-grid-single"'+(tile.kind==='groups'?'':' hidden')+'>JOGO ' + numbers[tile.id] + '</span>') )+
              (overflow || collision ? '<small>' + (overflow ? 'Excede o horário' : '') + (overflow && collision ? ' · ' : '') + (collision ? 'Sobreposição' : '') + '</small>' : '') + '</div>';
          }).join('') + '</div>';
      }).join('') + '</div></div></section>';
    renderGroupPanels(root,state,visible,start,columns,numbers,examples);
    var viewport = root.querySelector('.phase-grid-viewport');
    if (viewport) { viewport.scrollTop = scrollTop; viewport.scrollLeft = scrollLeft; }
    if (state.tiles.some(function (tile) {
      var target = daysOf(state).find(function (d) { return d.day === (tile.day || state.plan.day); });
      return !target || model.outsideWindow(tile, target);
    })) showError(state.plan.allowOverflow ? 'A grade usa tempo adicional. Os blocos em vermelho e cinza excedem o horário previsto e podem ser salvos.' : 'Blocos listrados ultrapassam o horário do dia. Gere uma nova proposta para usar tempo adicional.');
    else if (overlapping.size) showError('Blocos listrados ocupam a mesma quadra no mesmo horário. Ajuste-os antes de salvar.');
    else if (state.gridWarning) showError(state.gridWarning + ' Ajuste a sequência antes de salvar.');
    else if(state.refreshNotice) showError(state.refreshNotice);
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
  redraw.datedGridInstalled=true;
  window._phaseGridPrepareDated=function () {
    window._setEstimatedScheduleMode('organizer');
    if (window._estimatedGameHoursState?.mode==='organizer') window._phaseGridSuggest();
  };
  window._phaseGridSuggest = function (options) {
    options=options || {};
    var prior=window._phaseCallOrderState, failure=null;
    var message = document.getElementById('phase-grid-proposal-message');
    function fail(value) { failure={error:value}; if (message) { message.hidden = false; message.textContent = value; } return failure; }
    var schedule = window._estimatedGameHoursState;
    if (!schedule || schedule.mode !== 'organizer') { return fail('Selecione jogos determinados pelo organizador.'); }
    var cfg = typeof window._f2GetConfig === 'function' ? window._f2GetConfig() : null;
    if (!cfg) { return fail('Defina o formato das fases.'); }
    var categoryNames = window._getCreateFormCategoryData && window._getCreateFormCategoryData().combinedCategories || [];
    var custom = !!(document.getElementById('tourn-custom-category-capacity') || {}).checked;
    var capacity = {};
    try { capacity = JSON.parse((document.getElementById('tourn-max-by-category') || {}).value || '{}'); } catch (e) {}
    var general = Number((document.getElementById('tourn-max-per-category') || {}).value);
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
      fmt2:cfg, combinedCategories:categoryNames, sport:(document.getElementById('select-sport') || {}).value,
      maxParticipantsByCategory:custom ? capacity : {}, maxParticipantsPerCategory:general,
      maxParticipants:Number((document.getElementById('tourn-max-participants') || {}).value),
      courtCount:Number((document.getElementById('tourn-court-count') || {}).value),
      setupScope:(document.getElementById('setup-first-round-only') || {}).checked === false ? 'every_game' : 'first_round',
      gameDuration:Number((document.getElementById('tourn-game-duration') || {}).value) || 25,
      callTime:Number((document.getElementById('tourn-call-time') || {}).value),
      warmupTime:Number((document.getElementById('tourn-warmup-time') || {}).value),
      courtNames:((document.getElementById('tourn-court-names') || {}).value || '').split(',').map(function (s) { return s.trim(); })
    });
    var result, notice=prior?.refreshNotice || '';
    try {
      var limits=Object.fromEntries((categoryNames.length?categoryNames:['']).map(function (name) {
        return [name, name ? (custom ? Number(capacity[name]) : general) : tournament.maxParticipants];
      }));
      var projection=typeof window._f2ProjectCurrentPhases==='function' ? window._f2ProjectCurrentPhases(limits) : null;
      if (projection) tournament=Object.assign({},tournament,projection.tournament,{phases:projection.phases});
      var staged=typeof window._readEstimatedGameHours==='function' ? window._readEstimatedGameHours() : null;
      if (staged?.error) {return fail(staged.error);}
      tournament.scheduleWindow=Object.assign({},tournament.scheduleWindow || {},staged || {},{days:days});
      if (staged?.days?.length) {days=staged.days;tournament.scheduleWindow.days=days;}
      var activePlan=window._phaseCallOrderState?.plan;
      if(options.onlyIfStale && activePlan?.timingVersion===2) {
        try {model.assertPlan(tournament,model.toPlan(activePlan,prior.tiles),days,window);return null;} catch(error) {}
      }
      if (activePlan?.groupAssignments) {
        var jobs=projection?.jobs || model.project(tournament,window).jobs;
        if(activePlan.groupAssignments.length && !assignmentsCompatible(activePlan.groupAssignments,jobs,tournament.courtCount)) {
          delete tournament.scheduleWindow.interleavedPlan;
          notice='A configuração dos grupos mudou; a proposta foi recalculada e os ajustes anteriores de horários e quadras foram substituídos.';
        } else tournament.scheduleWindow.interleavedPlan=activePlan;
      }
      if(options.onlyIfStale && !notice) notice='Proposta atualizada; os ajustes anteriores de horários foram recalculados.';
      result=model.suggestProjected(tournament,days,window,projection);
    } catch(error) {return fail(error.message);}
    if (result.error) return fail(result.error);
    schedule.touched = true;
    window._phaseCallOrderState = { tournament:tournament, plan:result.plan, day:days[0], tiles:result.tiles,
      activeDay:days[0].day, locked:false, touched:true,refreshNotice:notice };
    redraw(!!options.quiet);
    if(!options.quiet) window._openPhaseGridEditor();
    return result;
  };
  window._phaseGridCategoryAlternationChanged=function() {
    var state=window._phaseCallOrderState;
    if(!state?.locked) return window._phaseGridRefreshDraft(true);
    if(state.preDrawId || state.tournament?.sorteioDrawId || window._tournamentHasDraw?.(state.tournament)) return null;
    var t=state.tournament, limits=t.maxParticipantsByCategory || {};
    var projection=window._f2ProjectCurrentPhases?.(limits);
    if(!projection) return null;
    var effective=Object.assign({},t,{fmt2:projection.cfg || projection.tournament.fmt2,phases:projection.phases});
    var result=model.suggestProjected(effective,daysOf(state),window);
    if(result.error) {showError(result.error);return result;}
    state.tournament=effective;state.plan=result.plan;state.tiles=result.tiles;
    // A mudança de modo é salva pelo endpoint; os controles de geometria continuam bloqueados.
    state.touched=false;
    redraw(true);return result;
  };
  window._phaseGridRefreshDraft=function(force) {
    var state=window._phaseCallOrderState;
    if(window._estimatedGameHoursState?.mode!=='organizer') return null;
    if(!state?.plan || state.locked || state.preDrawId || state.tournament?.sorteioDrawId || window._tournamentHasDraw?.(state.tournament)) return null;
    if(dragging && !force){refreshPending=true;return null;}
    return window._phaseGridSuggest({quiet:true,onlyIfStale:true});
  };
  window._phaseGridDragEnd=function(){dragging=false;if(refreshPending){refreshPending=false;window._phaseGridRefreshDraft();}};
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
    window._phaseGridDragEnd();
    if (window._phaseCallOrderState && window._phaseCallOrderState.saving) return;
    var root = overlay(); if (root) root.remove();
    overlayOpen = false;
    document.body.style.overflow = previousBodyOverflow;
    var state = window._phaseCallOrderState; if (state) {state.selectedId = null;delete state.assignmentDraft;}
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
    if (!tournament || Number(tournament.currentPhaseIndex || 0)>0 || window._tournamentHasDraw?.(tournament)) return false;
    var draft;
    if (!plan && datedOrganizer(tournament)) {
      draft=model.suggestProjected(tournament,days,window);
      if (draft.error) {
        window.showAlertDialog?.('Confira a grade antes do sorteio',draft.error,null,{type:'warning'});
        return false;
      }
      plan=draft.plan;
    }
    if (!plan || !Array.isArray(plan.blocks) || !plan.blocks.length || !Array.isArray(days) || !days.length) {
      if (typeof window.showAlertDialog === 'function') window.showAlertDialog('Grade de jogos ausente',
        'Configure as categorias, vagas, quadras e horários na edição do torneio antes de sortear.', null, { type:'warning' });
      return false;
    }
    if (overlayOpen) window._closePhaseGridEditor();
    preDrawPreviousState = window._phaseCallOrderState;
    var mount = document.createElement('div'); mount.id = 'phase-grid-predraw-mount'; mount.hidden = true;
    document.body.appendChild(mount);
    window._phaseCallOrderState = { tournament:tournament, plan:plan, day:days[0], activeDay:days[0].day,
      tiles:draft ? draft.tiles : model.expand(plan,tournament), locked:false, touched:!!draft, preDrawId:String(tId) };
    window._openPhaseGridEditor();
    return true;
  };
  window._phaseGridSaveAndDraw = async function () {
    var state = window._phaseCallOrderState;
    if (!state || !state.preDrawId || state.saving || state.presetBusy) return;
    if (state.assignmentDraft) {showError(tr('pending','Aplique ou cancele a distribuição antes de sortear.'));return;}
    var button = document.getElementById('phase-grid-draw-button');
    state.saving = true;
    if (button) {
      state.drawButtonStyle = { filter:button.style.filter, cursor:button.style.cursor, opacity:button.style.opacity };
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.style.filter = 'grayscale(0.9) brightness(0.82)';
      button.style.cursor = 'wait';
      button.style.opacity = '0.85';
      button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>Preparando sorteio…';
    }
    var progress = document.createElement('div');
    progress.id = 'phase-grid-draw-progress';
    progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite');
    progress.innerHTML = '<span class="phase-grid-progress-spinner" aria-hidden="true"></span><strong data-phase-grid-progress-label>Preparando o sorteio…</strong><small>Aguarde a chave aparecer antes de continuar.</small>';
    document.body.appendChild(progress);
    var updateProgress = function (message) {
      var label = progress.querySelector('[data-phase-grid-progress-label]');
      if (label) label.textContent = message;
      if (button) button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>' + message;
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
          patch:{ scheduleWindow:Object.assign({interleavedPlan:plan},plan.categoryPlacement==='grid'?{categoryWindows:[]}:{} ) }
        });
        if (!result || result.ok !== true) throw new Error(result && result.message || 'A grade não foi salva.');
        state.tournament.scheduleWindow.interleavedPlan = plan;
        if(plan.categoryPlacement==='grid') state.tournament.scheduleWindow.categoryWindows=[];
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
    var button = document.getElementById('phase-grid-draw-button');
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = 'Salvar grade e sortear';
      var style = state.drawButtonStyle || {};
      button.style.filter = style.filter || '';
      button.style.cursor = style.cursor || '';
      button.style.opacity = style.opacity || '';
    }
    state.drawButtonStyle = null;
    if (error) {
      showError('Sorteio não concluído: ' + error);
      return;
    }
    window._closePhaseGridEditor(true);
  };
  document.addEventListener('keydown', function (event) {
    if (overlayOpen && event.key === 'Escape') { event.preventDefault(); window._closePhaseGridEditor(); }
  });
  window._phaseGridDay = function (day) {
    var state = window._phaseCallOrderState; if (!state || !displayDays(state).some(function (d) { return d.day === day; })) return;
    state.activeDay = day; redraw(false);
  };
  window._phaseGridDragStart = function (event, id) {
    var state = window._phaseCallOrderState;
    if (!state || state.locked || !state.tiles.some(function (tile) { return tile.id === id; })) { event.preventDefault(); return; }
    dragging=true;
    event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move';
  };
  window._phaseGridDrop = function (event, court) {
    event.preventDefault(); event.stopPropagation();
    dragging=false;
    var state = window._phaseCallOrderState, id = event.dataTransfer.getData('text/plain');
    if (!state || !state.tiles.some(function (tile) { return tile.id === id; })) {window._phaseGridDragEnd();return;}
    var target = position(event, court);
    var hovered = event.target && event.target.closest && event.target.closest('[data-tile-id]');
    applyMove(id, target.court, target.startTime, null,
      hovered && hovered.getAttribute('data-tile-id') !== id ? hovered.getAttribute('data-tile-id') : null);
    window._phaseGridDragEnd();
  };
  window._phaseGridDropDay = function (event, destination) {
    event.preventDefault(); event.stopPropagation();
    dragging=false;
    var state = window._phaseCallOrderState, id = event.dataTransfer.getData('text/plain');
    var tile = state && state.tiles.find(function (candidate) { return candidate.id === id; });
    var day = state && displayDays(state).find(function (candidate) { return candidate.day === destination; });
    if (!tile || !day || state.locked) {window._phaseGridDragEnd();return;}
    var start = Math.max(model.minutes(tile.startTime), model.minutes(day.startTime));
    applyMove(id, tile.court, model.clock(start), destination);
    window._phaseGridDragEnd();
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
    if (!state || !state.touched || state.locked || !state.plan || window._estimatedGameHoursState?.mode!=='organizer') return null;
    var refreshed=window._phaseGridRefreshDraft(true);
    if(refreshed?.error) return refreshed;
    state = window._phaseCallOrderState;
    if (!state || !state.touched || state.locked || !state.plan) return null;
    var error = model.validate(state.tiles, state.plan, daysOf(state));
    if (error) return { error:error };
    var result = model.toPlan(state.plan, state.tiles);
    result.editorVersion = 2;
    return result;
  };
})();
