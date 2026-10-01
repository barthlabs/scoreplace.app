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
    return names.slice(0, n);
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
    var cs = courts(t), ms = all(t).filter(function (m) { return !m.isBye && !m.isSitOut; }).sort(order);
    var blocked = [], pending = [];
    ms.forEach(function (m) {
      var change = changesByMatch[String(m.id)];
      // Uma alocação já confirmada pelo organizador é um compromisso operacional,
      // mesmo se nasceu da sugestão. Recalcular não pode trocar quadra ou horário
      // de quem já recebeu um slot; só uma edição manual explícita pode fazê-lo.
      // [[regression_confirmed_court_never_moves_automatically]]
      var allocated = !!(m.court && m.scheduledAt);
      var manual = allocated || m.scheduleLocked === true || m.scheduleSource === 'organizer' || !!change;
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
      var allocated = !!(m.court && m.scheduledAt);
      var manual = allocated || m.scheduleLocked === true || m.scheduleSource === 'organizer' || !!change;
      if (played(m)) return;
      if (manual) {
        var a = change ? change.scheduledAt : m.scheduledAt;
        var c = change ? change.court : m.court;
        if (a && c) items.push({ matchId:String(m.id), court:String(c), scheduledAt:String(a), scheduleLocked:true, scheduleSource:'organizer' });
        return;
      }
      var len = duration(t, m), at = cursor, cidx = 0, guard = 0;
      while (guard++ < 2000) {
        var found = cs.find(function (c) { return free(c, at, len); });
        if (found) { cidx = cs.indexOf(found); break; }
        at += 5 * MIN;
      }
      var court = cs[cidx];
      reserve(m, iso(at), court);
      items.push({ matchId:String(m.id), court:court, scheduledAt:iso(at), scheduleLocked:false, scheduleSource:'estimate' });
      cursor = Math.min(cursor, at);
    });
    return { baseScheduleRevision:Number(t.scheduleRevision || 0), items:items, courts:cs };
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
  function gameLabel(t, id) {
    var m = all(t).find(function (x) { return String(x.id) === String(id); });
    return m && (m.number || m.matchNumber) ? 'Jogo ' + (m.number || m.matchNumber) : 'Jogo ' + String(id);
  }
  function dayKey(isoText) {
    var d = new Date(isoText || '');
    if (isNaN(d.getTime())) return 'sem-data';
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  function dayLabel(key, fallback) {
    if (key === 'sem-data') return 'Sem data';
    var d = new Date(key + 'T12:00:00');
    return isNaN(d.getTime()) ? fallback : d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' });
  }
  function timeLabel(isoText) {
    var d = new Date(isoText || '');
    return isNaN(d.getTime()) ? 'Sem horário' : d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  }
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
    var players = object.p1Name && object.p2Name ? object.p1Name + ' / ' + object.p2Name : pair;
    var teamName = team.name || id || 'Time a definir';
    var color = 'hsl(' + hue + ' ' + saturation + '% 55%)';
    return '<div style="border-left:4px solid ' + esc(color) + ';background:hsl(' + hue + ' ' + saturation + '% 14%);border-radius:7px;padding:5px 6px;margin-top:4px;min-width:0;">' +
      '<div style="font-size:.66rem;font-weight:800;color:' + esc(color) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(teamName) + '</div>' +
      '<div style="font-size:.69rem;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(players) + '</div>' +
      '<div style="font-size:.61rem;opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(category) + '</div></div>';
  }
  // Grade comum para o rascunho e para a agenda publicada. Cada linha é um horário;
  // cada coluna, uma quadra. Assim os IDs técnicos nunca são a informação principal.
  window._operationalScheduleGrid = function (t, plan, options) {
    options = options || {};
    var prefix = String(options.prefix || 'agenda'), matchById = {};
    all(t).forEach(function (m) { if (m) matchById[String(m.id)] = m; });
    var names = teamLookup(t), byDay = {};
    (plan.items || []).forEach(function (item) {
      var key = dayKey(item.scheduledAt); (byDay[key] || (byDay[key] = [])).push(item);
    });
    var days = Object.keys(byDay).sort(), activeDay = days.indexOf(options.activeDay) >= 0 ? options.activeDay : (days[0] || '');
    var tabs = days.map(function (key) { return '<button type="button" data-' + prefix + '-day="' + esc(key) + '" class="btn ' + (key === activeDay ? 'btn-primary' : 'btn-outline') + '" style="padding:6px 10px;font-size:.76rem;">' + esc(dayLabel(key, key)) + '</button>'; }).join('');
    var slots = {};
    (byDay[activeDay] || []).forEach(function (item) {
      var key = String(item.scheduledAt || ''); (slots[key] || (slots[key] = [])).push(item);
    });
    var headers = plan.courts.map(function (court) { return '<div style="font-size:.72rem;font-weight:800;text-align:center;padding:7px 4px;background:rgba(30,41,59,.92);border-radius:7px;white-space:nowrap;">' + esc(court) + '</div>'; }).join('');
    var rows = Object.keys(slots).sort().map(function (slot) {
      var byCourt = {}; slots[slot].forEach(function (item) { byCourt[String(item.court)] = item; });
      var cells = plan.courts.map(function (court) {
        var item = byCourt[String(court)];
        if (!item) return '<div style="min-height:118px;border:1px dashed rgba(148,163,184,.25);border-radius:8px;background:rgba(15,23,42,.24);"></div>';
        var m = matchById[String(item.matchId)] || {}, label = gameLabel(t, item.matchId);
        var optionsHtml = plan.courts.map(function (name) { return '<option value="' + esc(name) + '"' + (name === item.court ? ' selected' : '') + '>' + esc(name) + '</option>'; }).join('');
        return '<article data-' + prefix + '-match="' + esc(item.matchId) + '" style="min-height:118px;border:1px solid rgba(56,189,248,.32);border-radius:8px;padding:6px;background:rgba(15,23,42,.72);box-sizing:border-box;overflow:hidden;">' +
          '<div style="font-size:.64rem;color:#7dd3fc;font-weight:800;display:flex;justify-content:space-between;gap:4px;"><span>' + esc(label) + '</span><span>R' + esc(String(m.round || '—')) + '</span></div>' +
          sideHtml(t, m, 'p1', names) + sideHtml(t, m, 'p2', names) +
          '<div style="display:flex;gap:4px;margin-top:5px;"><input data-' + prefix + '-time="' + esc(item.matchId) + '" type="datetime-local" value="' + esc(localDateTime(item.scheduledAt)) + '" aria-label="Horário de ' + esc(label) + '" style="min-width:0;width:100%;font-size:.63rem;box-sizing:border-box"><select data-' + prefix + '-court="' + esc(item.matchId) + '" aria-label="Quadra de ' + esc(label) + '" style="min-width:0;width:68px;font-size:.63rem;box-sizing:border-box">' + optionsHtml + '</select></div>' +
          '</article>';
      }).join('');
      return '<div style="display:grid;grid-template-columns:72px repeat(' + plan.courts.length + ', minmax(176px,1fr));gap:6px;margin-top:6px;align-items:stretch"><div style="font-size:.82rem;font-weight:900;color:#fbbf24;display:flex;align-items:center;justify-content:center;text-align:center;">' + esc(timeLabel(slot)) + '</div>' + cells + '</div>';
    }).join('');
    return { activeDay:activeDay, days:days, html:'<div style="display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 8px;">' + tabs + '</div><div style="overflow:auto;border-top:1px solid rgba(148,163,184,.2);padding-top:7px;"><div style="min-width:' + (72 + plan.courts.length * 182) + 'px"><div style="display:grid;grid-template-columns:72px repeat(' + plan.courts.length + ', minmax(176px,1fr));gap:6px"><div></div>' + headers + '</div>' + (rows || '<div style="padding:16px;opacity:.72">Não há jogos neste dia.</div>') + '</div></div>' };
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
        '<div style="flex:1;min-width:220px"><strong>📍 Agenda operacional</strong><div style="font-size:.82rem;opacity:.78;margin-top:3px">' + total + ' jogos pendentes · ' + plan.courts.map(esc).join(' · ') + '. Alterar horário ou quadra fixa o jogo e reorganiza os demais; nada é salvo antes de aplicar.</div></div>' +
        '<button type="button" class="btn btn-primary" id="sp-agenda-apply-' + esc(fresh.id) + '">Aplicar agenda</button>' +
        '<div style="width:100%;margin-top:2px">' + board.html + '</div></section>';
      Array.prototype.forEach.call(slot.querySelectorAll('[data-agenda-day]'), function (control) { control.onclick = function () { activeDay = control.getAttribute('data-agenda-day'); render(); }; });
      Array.prototype.forEach.call(slot.querySelectorAll('[data-agenda-court]'), function (control) {
        control.onchange = function () {
          var id = control.getAttribute('data-agenda-court'), item = plan.items.find(function (x) { return String(x.matchId) === String(id); });
          if (!item) return;
          manual[id] = { matchId:id, court:control.value, scheduledAt:item.scheduledAt };
          render();
        };
      });
      Array.prototype.forEach.call(slot.querySelectorAll('[data-agenda-time]'), function (control) {
        control.onchange = function () {
          var id = control.getAttribute('data-agenda-time'), item = plan.items.find(function (x) { return String(x.matchId) === String(id); });
          var ms = new Date(control.value || '').getTime();
          if (!item || isNaN(ms)) return;
          manual[id] = { matchId:id, court:item.court, scheduledAt:iso(ms) };
          render();
        };
      });
      var button = slot.querySelector('button[id^="sp-agenda-apply-"]');
      if (!button) return;
      button.onclick = function () {
        var latest = draftForFresh(), fresh = latest.fresh, draft = latest.plan;
        if (!draft.items.length) { msg('Agenda atualizada', 'Não há jogos pendentes para realocar.', 'info'); return; }
        button.disabled = true; button.textContent = 'Aplicando agenda…';
        var db = window.FirestoreDB;
        if (!db || typeof db._callFn !== 'function') { button.disabled=false; button.textContent='Aplicar agenda'; msg('Agenda não salva','Conexão indisponível.','error'); return; }
        db._callFn('setMatchSchedule', { tournamentId:String(fresh.id), operationId:uid(), baseScheduleRevision:draft.baseScheduleRevision, operational:true,
          // Aplicar confirma cada slot da sugestão. A partir daqui não existe
          // realocação automática: para mudar, o organizador escolhe o jogo,
          // horário e/ou quadra nesta própria tela.
          jogos:draft.items.map(function (i) { return { matchId:i.matchId, court:i.court, scheduledAt:i.scheduledAt, scheduledKind:'estimate', scheduleLocked:true, scheduleSource:'organizer' }; })
        }).then(function () { msg('Agenda aplicada', draft.items.length + ' jogos pendentes foram distribuídos pelas quadras.', 'success'); if (window.renderBracket) window.renderBracket(fresh.id); })
          .catch(function (e) { msg('Agenda não salva', (e && e.details && e.details.code === 'schedule-revision-stale') ? 'A agenda mudou em outra tela. A sugestão foi recalculada; aplique novamente.' : 'Não foi possível aplicar a agenda. Tente novamente.', 'error'); })
          .finally(function () { button.disabled=false; button.textContent='Aplicar agenda'; });
      };
    }
    render();
  };
}());
