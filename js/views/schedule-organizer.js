/* Agenda operacional — uma sugestão de quadras que só vira agenda após Aplicar.
 * O plano é puro: a tela pode recalcular antes da publicação da chave e também
 * depois, sem mover jogos que já começaram, terminaram ou foram travados pelo org. */
(function () {
  'use strict';
  var MIN = 60000;
  function all(t) { return (window._collectAllMatches ? window._collectAllMatches(t) : (t.matches || [])).filter(Boolean); }
  function esc(x) { return window._safeHtml ? window._safeHtml(String(x == null ? '' : x)) : String(x == null ? '' : x); }
  // ⚠️ DUPLICAÇÃO INTENCIONAL — usa primeiro `_matchHasRealPlay()` de js/store.js e,
  // se ele ainda não estiver carregado, replica `_scheduleHasRealPlay()` de functions/index.js.
  // Servidor valida a aplicação; cliente calcula o plano local sem round-trip. Ao mudar a
  // definição de partida realizada, os dois lados precisam mudar juntos.
  function played(m) {
    if (!m || typeof m !== 'object') return false;
    if (typeof window._matchHasRealPlay === 'function' && window._matchHasRealPlay(m)) return true;
    if (m.liveScored === true || m.startedAt || m.resultAt || m.wo === true || m.winner != null) return true;
    if (Array.isArray(m.sets) && m.sets.length) return true;
    return ((typeof m.scoreP1 === 'number' && m.scoreP1 > 0) || (typeof m.scoreP2 === 'number' && m.scoreP2 > 0)) && !m.wo;
  }
  function courts(t) {
    var names = Array.isArray(t.courtNames) ? t.courtNames.filter(Boolean).map(String) : [];
    var n = Math.max(1, parseInt(t.courtCount, 10) || names.length || 1);
    while (names.length < n) names.push('Quadra ' + (names.length + 1));
    names = names.slice(0, n);
    // A prioridade é uma decisão operacional, não uma renomeação: ela define qual
    // coluna recebe o próximo jogo livre. Itens desconhecidos/duplicados nunca
    // entram na frente e a ordem padrão continua sendo Quadra 1, 2, 3…
    var chosen = Array.isArray(t.courtOrder) ? t.courtOrder.map(String) : [];
    var ordered = chosen.filter(function (court, index) { return names.indexOf(court) >= 0 && chosen.indexOf(court) === index; });
    names.forEach(function (court) { if (ordered.indexOf(court) < 0) ordered.push(court); });
    return ordered;
  }
  function start(t) {
    var g = window._schGradeEstimada && window._schGradeEstimada(t);
    if (g && g.slots && g.slots.length) return +g.slots[0].ms;
    var ms = new Date(t.startDate || '').getTime();
    return isNaN(ms) ? Date.now() : ms;
  }
  function duration(t, m) {
    var p = window._faseDoTorneio ? window._faseDoTorneio(t, m && m.phaseIndex) : null;
    return Math.max(5, Number(window._minutosDaPartida ? window._minutosDaPartida(t, p) : t.gameDuration || 40)) * MIN;
  }
  function order(a, b) {
    return (Number(a.phaseIndex || 0) - Number(b.phaseIndex || 0)) || (Number(a.round || 0) - Number(b.round || 0)) || String(a.id).localeCompare(String(b.id));
  }
  function iso(ms) { return new Date(ms).toISOString(); }
  // O excedente pertence ao SLOT ATUAL, nunca ao jogo que antes o ocupava. O
  // planejador é reexecutado a cada drag-and-drop; reaproveitar a marca da grade
  // inicial deixava a faixa zebrada grudada no card depois de ele voltar para
  // dentro da janela (e escondia o card que foi levado para fora).
  // [[regression_outside_window_follows_current_slot]]
  function exceedsConfiguredWindow(t, match, scheduledAt) {
    var at = new Date(scheduledAt || '').getTime();
    var windows = window._schJanelaTorneio && window._schJanelaTorneio(t);
    if (!windows || !Array.isArray(windows.dias) || !windows.dias.length || isNaN(at)) return false;
    // `at === fimMs` ainda pertence a esta janela para medir o excedente; ele
    // continua FORA porque a duração torna `at + duração > fimMs` logo abaixo.
    var day = windows.dias.find(function (item) { return at >= Number(item.iniMs) && at <= Number(item.fimMs); });
    return !day || at + duration(t, match) > Number(day.fimMs);
  }
  // `changes` fixa explicitamente um ou mais jogos; o restante pendente ocupa o
  // primeiro horário livre. Uma troca de quadra, portanto, reorganiza todos os
  // outros jogos que ainda estão livres, sem tocar em partida já realizada.
  window._operationalSchedulePlan = function (t, changes) {
    t = t || {};
    var listChanges = Array.isArray(changes) ? changes : (changes ? [changes] : []);
    var changesByMatch = {};
    listChanges.forEach(function (change) {
      if (change && change.matchId != null) changesByMatch[String(change.matchId)] = change;
    });
    // A grade estimada já conhece o dia/ordem declarados por categoria. A agenda
    // operacional usa essa mesma intenção como ponto de partida e só move jogos
    // quando precisa fugir de uma quadra ocupada ou de uma escolha manual.
    var grade = window._schGradeEstimada && window._schGradeEstimada(t), preferred = {};
    if (grade && Array.isArray(grade.slots)) grade.slots.forEach(function (slot) {
      preferred[String(slot.matchId)] = Number(slot.ms);
    });
    var hasGrade = !!(grade && Array.isArray(grade.slots));
    var cs = courts(t), ms = all(t).filter(function (m) { return !m.isBye && !m.isSitOut; }).sort(function (a, b) {
      var aa = preferred[String(a.id)], bb = preferred[String(b.id)];
      if (isFinite(aa) && isFinite(bb) && aa !== bb) return aa - bb;
      if (isFinite(aa) !== isFinite(bb)) return isFinite(aa) ? -1 : 1;
      return order(a, b);
    });
    var blocked = [], pending = [];
    ms.forEach(function (m) {
      var change = changesByMatch[String(m.id)];
      // Apenas escolhas explícitas congelam um slot. Uma estimativa materializada
      // continua sendo rascunho e precisa voltar à grade canônica para não deixar
      // quadras livres enquanto há jogo elegível em horário posterior. Documentos
      // legados, porém, já podem ter quadra/data sem qualquer marcador: como não
      // há prova de que eram estimativa, preservamos a alocação até o organizador
      // decidir de novo. Só estimativa EXPLÍCITA é automaticamente compactável.
      var legacyAllocated = !!(m.court && m.scheduledAt && m.scheduleLocked == null && !m.scheduleSource);
      var manual = m.scheduleLocked === true || m.scheduleSource === 'organizer' || legacyAllocated || !!change;
      if (played(m) || manual) blocked.push(m); else pending.push(m);
    });
    var occupied = {};
    function reserve(m, at, court) {
      if (!at || !court) return;
      var a = new Date(at).getTime(); if (isNaN(a)) return;
      (occupied[court] || (occupied[court] = [])).push({ a: a, b: a + duration(t, m) });
    }
    blocked.forEach(function (m) {
      var change = changesByMatch[String(m.id)];
      var at = change ? change.scheduledAt : m.scheduledAt;
      var court = change ? change.court : m.court;
      reserve(m, at, court);
    });
    function free(court, at, len) { return !(occupied[court] || []).some(function (x) { return at < x.b && at + len > x.a; }); }
    var cursor = start(t), items = [];
    ms.forEach(function (m) {
      var change = changesByMatch[String(m.id)];
      var legacyAllocated = !!(m.court && m.scheduledAt && m.scheduleLocked == null && !m.scheduleSource);
      var manual = m.scheduleLocked === true || m.scheduleSource === 'organizer' || legacyAllocated || !!change;
      if (played(m)) return;
      if (manual) {
        var a = change ? change.scheduledAt : m.scheduledAt;
        var c = change ? change.court : m.court;
        // O plano normaliza qualquer bloqueio — inclusive a alocação legada
        // sem marcador — para a forma explícita. Não mutar `m`: este cálculo é
        // puro e só a confirmação do organizador pode persistir uma agenda.
        if (a && c) items.push({ matchId:String(m.id), court:String(c), scheduledAt:String(a), scheduleLocked:true, scheduleSource:'organizer', extrapolaJanela:exceedsConfiguredWindow(t, m, a) });
        return;
      }
      // ⛔ LIMITE RÍGIDO DA JANELA: se a grade declarativa não encontrou
      // capacidade para este jogo, ele fica sem slot e a aplicação é bloqueada.
      // Nunca use o cursor de fallback para empurrá-lo para outro dia/horário:
      // isso já exibiu um sábado inexistente em evento de quinta e sexta.
      if (hasGrade && !isFinite(preferred[String(m.id)])) return;
      var len = duration(t, m), at = isFinite(preferred[String(m.id)]) ? preferred[String(m.id)] : cursor, cidx = 0, guard = 0;
      while (guard++ < 2000) {
        var found = cs.find(function (c) { return free(c, at, len); });
        if (found) { cidx = cs.indexOf(found); break; }
        at += 5 * MIN;
      }
      var court = cs[cidx];
      reserve(m, iso(at), court);
      items.push({ matchId:String(m.id), court:court, scheduledAt:iso(at), scheduleLocked:false, scheduleSource:'estimate', extrapolaJanela:exceedsConfiguredWindow(t, m, iso(at)) });
      cursor = Math.max(cursor, at);
    });
    // Aplicar/publicar precisa usar a MESMA verdade visual: se um arrasto trouxe
    // todos os cards de volta à janela, libera; se levou algum para fora, bloqueia.
    // A duração excedida é medida por dia (máximo de término em cada janela), não
    // somada por card, pois as quadras funcionam em paralelo.
    var windows = window._schJanelaTorneio && window._schJanelaTorneio(t);
    var overflowByDay = {};
    items.forEach(function (item) {
      var match = ms.find(function (candidate) { return String(candidate.id) === String(item.matchId); });
      var at = new Date(item.scheduledAt || '').getTime();
      if (isNaN(at) || !match || !windows || !Array.isArray(windows.dias)) return;
      var day = windows.dias.find(function (candidate) { return at >= Number(candidate.iniMs) && at <= Number(candidate.fimMs); });
      if (!day) return;
      overflowByDay[day.ymd] = Math.max(Number(overflowByDay[day.ymd] || 0), Math.max(0, at + duration(t, match) - Number(day.fimMs)));
    });
    var actualExtraMs = Object.keys(overflowByDay).reduce(function (sum, key) { return sum + overflowByDay[key]; }, 0);
    var actualOutside = items.some(function (item) { return item.extrapolaJanela === true; });
    // JOGO N é cronológico na agenda aprovada: seis quadras às 18:00 recebem
    // Jogos 1–6; o primeiro slot das 18:35 passa a ser o Jogo 7. Não usamos
    // categoria nem a ordem incidental do array para numerar. A prioridade de
    // quadra só desempata jogos que começam no mesmo instante.
    var _courtRank = {}; cs.forEach(function (court, index) { _courtRank[String(court)] = index; });
    items.slice().sort(function (a, b) {
      var at = Date.parse(a.scheduledAt || ''), bt = Date.parse(b.scheduledAt || '');
      if (at !== bt) return at - bt;
      var ac = _courtRank[String(a.court)], bc = _courtRank[String(b.court)];
      if (ac !== bc) return ac - bc;
      return String(a.matchId).localeCompare(String(b.matchId));
    }).forEach(function (item, index) { item.scheduledGameNumber = index + 1; });
    return { baseScheduleRevision:Number(t.scheduleRevision || 0), items:items, courts:cs,
      // A agenda por categoria não pode ser aplicada se uma categoria explicitamente
      // presa a um dia ultrapassa a janela desse dia.
      cabe: !actualOutside, extraMs:actualExtraMs,
      unscheduledCount:Math.max(0, pending.filter(function (m) { return !items.some(function (item) { return item.matchId === String(m.id); }); }).length) };
  };
  function uid() { return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){ var r=Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); }); }
  function msg(title, body, type) { if (typeof window.showNotification === 'function') window.showNotification(title, body, type); }
  function localDateTime(isoText) {
    var ms = new Date(isoText || '').getTime();
    if (isNaN(ms)) return '';
    // Não depende da constante de agenda: este conversor também é usado para
    // preencher o input nativo e precisa permanecer autocontido.
    var local = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  function labelDateTime(isoText) {
    var date = new Date(isoText || '');
    return isNaN(date.getTime()) ? 'Sem horário' : date.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }
  function gameLabel(t, id, scheduledNumber) {
    var games = all(t).filter(function (x) { return x && !x.isBye && !x.isSitOut; });
    var m = games.find(function (x) { return String(x.id) === String(id); });
    // O código interno (p0-…, c2-…) não é identificação para o organizador.
    // A numeração canônica, quando já existe, prevalece. Antes de ela existir,
    // a posição estável do jogo no torneio fornece o mesmo rótulo único sem vazar
    // o ID técnico para a agenda privada.
    var number = scheduledNumber != null ? scheduledNumber : (m && (m.number != null ? m.number : m.matchNumber));
    if (number == null || number === '') number = games.indexOf(m) + 1;
    return 'Jogo ' + String(number || '—');
  }
  function dayKey(isoText) {
    var d = new Date(isoText || '');
    if (isNaN(d.getTime())) return 'sem-data';
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  window._scheduleLocalDayKey = dayKey;
  function dayLabel(key, fallback) {
    if (key === 'sem-data') return 'Sem data';
    var d = new Date(key + 'T12:00:00');
    return isNaN(d.getTime()) ? fallback : d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' });
  }
  function timeLabel(isoText) {
    var d = new Date(isoText || '');
    return isNaN(d.getTime()) ? 'Sem horário' : d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  }
  function localTime(isoText) {
    var d = new Date(isoText || '');
    if (isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  // A aba já escolhe a data. Cada card edita apenas a hora, evitando repetir a
  // mesma data nove vezes por linha e evitando uma troca acidental de dia.
  window._scheduleIsoOnDay = function (key, time) {
    var match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/), clock = String(time || '').match(/^(\d{2}):(\d{2})$/);
    if (!match || !clock) return null;
    // O construtor numérico recebe o horário de parede local; toISOString faz a
    // conversão local → UTC uma única vez. Aplicar o offset manualmente aqui
    // deslocaria o horário duas vezes (14:30 em São Paulo viraria 11:30 na tela).
    var d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]), 0, 0);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };
  function teamLookup(t) {
    var names = {};
    var source = Array.isArray(t && t.competitionTeams) ? t.competitionTeams : [];
    source.forEach(function (team, index) {
      if (!team) return;
      names[String(team.id || ('team-' + (index + 1)))] = { name:team.name || ('Time ' + (index + 1)), hue:Number(team.hue) };
    });
    var configured = t && t.teamCompetition && t.teamCompetition.teamNames;
    if (Array.isArray(configured)) configured.forEach(function (name, index) {
      var id = 'team-' + (index + 1);
      if (!names[id]) names[id] = { name:name || ('Time ' + (index + 1)), hue:NaN };
    });
    return names;
  }
  function sideHtml(t, m, side, names) {
    var object = m && m[side === 'p1' ? 'team1Obj' : 'team2Obj'] || {};
    var id = String(m && m[side === 'p1' ? 'p1CompetitionTeamId' : 'p2CompetitionTeamId'] || object.competitionTeamId || '');
    var team = names[id] || {};
    var hue = Number(object.competitionTeamHue); if (!isFinite(hue)) hue = Number(team.hue); if (!isFinite(hue)) hue = 210;
    var saturation = Math.max(35, Math.min(100, Number(object.competitionTeamSaturation) || 58));
    var category = m && m.category || object.category || 'Sem categoria';
    var pair = m && m[side] || object.displayName || object.name || 'Dupla a definir';
    var players = object.p1Name && object.p2Name
      ? '<div>' + esc(object.p1Name) + '</div><div>' + esc(object.p2Name) + '</div>'
      : '<div>' + esc(pair) + '</div>';
    var teamName = team.name || id || 'Time a definir';
    var color = 'hsl(' + hue + ' ' + saturation + '% 55%)';
    return '<div style="border-left:4px solid ' + esc(color) + ';background:hsl(' + hue + ' ' + saturation + '% 14%);border-radius:7px;padding:5px 6px;margin-top:4px;min-width:0;">' +
      '<div style="font-size:.66rem;font-weight:800;color:' + esc(color) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(teamName) + '</div>' +
      '<div style="font-size:.69rem;font-weight:700;line-height:1.2;overflow:hidden;">' + players + '</div>' +
      '<div style="font-size:.61rem;opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(category) + '</div></div>';
  }
  // Grade comum para o rascunho e para a agenda publicada. Cada linha é um horário;
  // cada coluna, uma quadra. Assim os IDs técnicos nunca são a informação principal.
  window._operationalScheduleGrid = function (t, plan, options) {
    options = options || {};
    var prefix = String(options.prefix || 'agenda'), sticky = options.scrollOwner === 'parent', matchById = {};
    all(t).forEach(function (m) { if (m) matchById[String(m.id)] = m; });
    var names = teamLookup(t), byDay = {}, numberByMatch = {};
    // Durante a revisão do sorteio, o número é a sequência da agenda que o
    // organizador está vendo — trocar dois cards renumera imediatamente todos os
    // jogos. Ao aplicar, a Function grava esta mesma sequência no rascunho.
    if (options.renumberBySchedule === true) {
      (plan.items || []).slice().sort(function (a, b) {
        var at = Date.parse(a.scheduledAt || ''), bt = Date.parse(b.scheduledAt || '');
        if (at !== bt) return at - bt;
        var ac = plan.courts.indexOf(a.court), bc = plan.courts.indexOf(b.court);
        if (ac !== bc) return ac - bc;
        return String(a.matchId).localeCompare(String(b.matchId));
      }).forEach(function (item, index) { numberByMatch[String(item.matchId)] = index + 1; });
    }
    (plan.items || []).forEach(function (item) {
      var key = dayKey(item.scheduledAt); (byDay[key] || (byDay[key] = [])).push(item);
    });
    var days = Object.keys(byDay).sort(), activeDay = days.indexOf(options.activeDay) >= 0 ? options.activeDay : (days[0] || '');
    var tabs = days.map(function (key) { return '<button type="button" data-' + prefix + '-day="' + esc(key) + '" class="btn ' + (key === activeDay ? 'btn-primary' : 'btn-outline') + '" style="padding:6px 10px;font-size:.76rem;">' + esc(dayLabel(key, key)) + '</button>'; }).join('');
    var slots = {};
    (byDay[activeDay] || []).forEach(function (item) {
      var key = String(item.scheduledAt || ''); (slots[key] || (slots[key] = [])).push(item);
    });
    // Cabeçalhos sticky pertencem à mesma superfície canônica da busca/abas.
    // Token, não hex: em tema claro continuam legíveis e nunca abrem uma
    // emenda de cor diferente no topo da grade.
    var stickySurface = 'var(--bg-darker,#111114)';
    var stickyCorner = sticky ? 'position:sticky;top:0;left:0;z-index:5;background:' + stickySurface + ';' : '';
    var stickyHeader = sticky ? 'position:sticky;top:0;z-index:4;background:' + stickySurface + ';' : '';
    var stickyTime = sticky ? 'position:sticky;left:0;z-index:3;background:' + stickySurface + ';' : '';
    var headers = plan.courts.map(function (court) { return '<div style="' + stickyHeader + 'font-size:.72rem;font-weight:800;text-align:center;padding:7px 4px;background:' + (sticky ? stickySurface : 'rgba(30,41,59,.92)') + ';border-radius:7px;white-space:nowrap;">' + esc(court) + '</div>'; }).join('');
    var rows = Object.keys(slots).sort().map(function (slot) {
      var byCourt = {}; slots[slot].forEach(function (item) { byCourt[String(item.court)] = item; });
      var cells = plan.courts.map(function (court) {
        var item = byCourt[String(court)];
        if (!item) return '<div data-' + prefix + '-empty-slot data-' + prefix + '-court="' + esc(court) + '" data-' + prefix + '-time="' + esc(String(slot)) + '" title="Solte um jogo aqui" style="min-height:118px;border:1px dashed rgba(148,163,184,.25);border-radius:8px;background:rgba(15,23,42,.24);box-sizing:border-box;"></div>';
        var m = matchById[String(item.matchId)] || {};
        var excedente = item.extrapolaJanela === true;
        return '<article draggable="true" data-' + prefix + '-match="' + esc(item.matchId) + '"' + (excedente ? ' data-' + prefix + '-outside-window="true"' : '') + ' title="' + (excedente ? 'Este jogo ultrapassa o horário configurado do evento' : 'Arraste este jogo para trocar o horário e a quadra') + '" style="min-height:132px;border:1px solid ' + (excedente ? 'rgba(248,113,113,.9)' : 'rgba(56,189,248,.32)') + ';border-radius:8px;padding:6px;background:' + (excedente ? 'repeating-linear-gradient(45deg,rgba(239,68,68,.55) 0 10px,rgba(148,163,184,.42) 10px 20px),rgba(15,23,42,.86)' : 'rgba(15,23,42,.72)') + ';box-sizing:border-box;overflow:hidden;cursor:grab;">' +
          '<div style="font-size:.68rem;color:#7dd3fc;font-weight:900;display:flex;justify-content:space-between;gap:8px;"><span>' + esc(gameLabel(t, item.matchId, numberByMatch[String(item.matchId)])) + '</span><span>R' + esc(String(m.round || '—')) + '</span></div>' +
          (excedente ? '<div style="margin-top:4px;font-size:.62rem;font-weight:900;color:#fff;background:rgba(127,29,29,.88);border-radius:4px;padding:3px 4px;">⚠ FORA DO HORÁRIO</div>' : '') +
          sideHtml(t, m, 'p1', names) + sideHtml(t, m, 'p2', names) +
          '</article>';
      }).join('');
      return '<div style="display:grid;grid-template-columns:72px repeat(' + plan.courts.length + ', minmax(176px,1fr));gap:6px;margin-top:6px;align-items:stretch"><div style="' + stickyTime + 'font-size:.82rem;font-weight:900;color:#fbbf24;display:flex;align-items:center;justify-content:center;text-align:center;">' + esc(timeLabel(slot)) + '</div>' + cells + '</div>';
    }).join('');
    var tabsHtml = '<div style="display:flex;gap:7px;flex-wrap:wrap;">' + tabs + '</div>';
    var frameStart = sticky
      ? '<div style="border-top:1px solid rgba(148,163,184,.2);padding-top:7px;">'
      : '<div data-' + prefix + '-grid-scroll style="overflow:auto;border-top:1px solid rgba(148,163,184,.2);padding-top:7px;">';
    var gridHtml = frameStart + '<div style="min-width:' + (72 + plan.courts.length * 182) + 'px"><div style="display:grid;grid-template-columns:72px repeat(' + plan.courts.length + ', minmax(176px,1fr));gap:6px"><div style="' + stickyCorner + '"></div>' + headers + '</div>' + (rows || '<div style="padding:16px;opacity:.72">Não há jogos neste dia.</div>') + '</div></div>';
    return { activeDay:activeDay, days:days, tabsHtml:tabsHtml, gridHtml:gridHtml, html:'<div style="margin:10px 0 8px;">' + tabsHtml + '</div>' + gridHtml };
  };
  window._renderOperationalSchedule = function (slot, t) {
    if (!slot || !t || !window._souOrganizador || !window._souOrganizador(t)) return;
    var manual = {}, activeDay = '';
    function draftForFresh() {
      var fresh = (window._findTournamentById && window._findTournamentById(t.id)) || t;
      return { fresh:fresh, plan:window._operationalSchedulePlan(fresh, Object.keys(manual).map(function (id) { return manual[id]; })) };
    }
    function render() {
      var current = draftForFresh(), fresh = current.fresh, plan = current.plan, total = plan.items.length;
      var board = window._operationalScheduleGrid(fresh, plan, { prefix:'agenda', activeDay:activeDay }); activeDay = board.activeDay;
      slot.innerHTML = '<section class="sp-operational-schedule" style="margin:12px 0;padding:12px 14px;border:1px solid rgba(56,189,248,.35);border-radius:12px;background:rgba(14,116,144,.10);display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:220px"><strong>📍 Agenda operacional</strong><div style="font-size:.82rem;opacity:.78;margin-top:3px">' + total + ' jogos pendentes · ' + plan.courts.map(esc).join(' · ') + '. Cada horário aparece uma vez na régua vertical; arraste um jogo sobre outro para trocar seus slots. Nada é salvo antes de aplicar.</div></div>' +
        (!plan.cabe ? '<div style="width:100%;color:#fbbf24;font-size:.8rem;font-weight:700">A agenda não cabe nas janelas configuradas: faltam ' + Math.ceil((plan.extraMs || 0) / MIN) + ' min. Nenhum jogo será colocado fora dos dias/horários do evento.</div>' : '') +
        '<button type="button" class="btn btn-primary" id="sp-agenda-apply-' + esc(fresh.id) + '"' + (!plan.cabe ? ' disabled aria-disabled="true" style="opacity:.45;cursor:not-allowed"' : '') + '>Aplicar agenda</button>' +
        '<div style="width:100%;margin-top:2px">' + board.html + '</div></section>';
      Array.prototype.forEach.call(slot.querySelectorAll('[data-agenda-day]'), function (control) { control.onclick = function () { activeDay = control.getAttribute('data-agenda-day'); render(); }; });
      Array.prototype.forEach.call(slot.querySelectorAll('[data-agenda-match]'), function (card) {
        card.ondragstart = function (event) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.getAttribute('data-agenda-match')); };
        card.ondragover = function (event) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; };
        card.ondrop = function (event) {
          event.preventDefault(); var fromId = event.dataTransfer.getData('text/plain'), toId = card.getAttribute('data-agenda-match');
          var from = plan.items.find(function (x) { return String(x.matchId) === String(fromId); }), to = plan.items.find(function (x) { return String(x.matchId) === String(toId); });
          if (!from || !to || from.matchId === to.matchId) return;
          manual[from.matchId] = { matchId:from.matchId, court:to.court, scheduledAt:to.scheduledAt };
          manual[to.matchId] = { matchId:to.matchId, court:from.court, scheduledAt:from.scheduledAt };
          render();
        };
      });
      /* Uma vaga livre também é destino: antes só cards aceitavam drop, deixando
       * a organização incapaz de usar manualmente uma quadra vazia. */
      Array.prototype.forEach.call(slot.querySelectorAll('[data-agenda-empty-slot]'), function (empty) {
        empty.ondragover = function (event) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; };
        empty.ondrop = function (event) {
          event.preventDefault(); var fromId = event.dataTransfer.getData('text/plain');
          var from = plan.items.find(function (x) { return String(x.matchId) === String(fromId); });
          if (!from) return;
          manual[from.matchId] = { matchId:from.matchId, court:empty.getAttribute('data-agenda-court'), scheduledAt:new Date(Number(empty.getAttribute('data-agenda-time'))).toISOString() };
          render();
        };
      });
      var button = slot.querySelector('button[id^="sp-agenda-apply-"]');
      if (!button) return;
      button.onclick = function () {
        var latest = draftForFresh(), fresh = latest.fresh, draft = latest.plan;
        if (!draft.cabe) { msg('Agenda não cabe', 'Faltam ' + Math.ceil((draft.extraMs || 0) / MIN) + ' min nas janelas configuradas. Ajuste os dias, horários, ordem, duração ou quadras antes de aplicar.', 'error'); return; }
        if (!draft.items.length) { msg('Agenda atualizada', 'Não há jogos pendentes para realocar.', 'info'); return; }
        button.disabled = true; button.textContent = 'Aplicando agenda…';
        var db = window.FirestoreDB;
        if (!db || typeof db._callFn !== 'function') { button.disabled=false; button.textContent='Aplicar agenda'; msg('Agenda não salva','Conexão indisponível.','error'); return; }
        db._callFn('setMatchSchedule', { tournamentId:String(fresh.id), operationId:uid(), baseScheduleRevision:draft.baseScheduleRevision, operational:true,
          // Aplicar confirma cada slot da sugestão. A partir daqui não existe
          // realocação automática: para mudar, o organizador escolhe o jogo,
          // horário e/ou quadra nesta própria tela.
          jogos:draft.items.map(function (i) { return { matchId:i.matchId, court:i.court, scheduledAt:i.scheduledAt, scheduledGameNumber:i.scheduledGameNumber, scheduledKind:'estimate', scheduleLocked:true, scheduleSource:'organizer' }; })
        }).then(function () { msg('Agenda aplicada', draft.items.length + ' jogos pendentes foram distribuídos pelas quadras.', 'success'); if (window.renderBracket) window.renderBracket(fresh.id); })
          .catch(function (e) { msg('Agenda não salva', (e && e.details && e.details.code === 'schedule-revision-stale') ? 'A agenda mudou em outra tela. A sugestão foi recalculada; aplique novamente.' : 'Não foi possível aplicar a agenda. Tente novamente.', 'error'); })
          .finally(function () { button.disabled=false; button.textContent='Aplicar agenda'; });
      };
    }
    render();
  };
}());
