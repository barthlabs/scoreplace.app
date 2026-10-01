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
  // change fixa explicitamente um jogo; o restante pendente ocupa o primeiro horário livre.
  window._operationalSchedulePlan = function (t, change) {
    t = t || {}; change = change || null;
    var cs = courts(t), ms = all(t).filter(function (m) { return !m.isBye && !m.isSitOut; }).sort(order);
    var blocked = [], pending = [];
    ms.forEach(function (m) {
      var manual = m.scheduleLocked === true || m.scheduleSource === 'organizer';
      if (played(m) || manual || (change && String(change.matchId) === String(m.id))) blocked.push(m); else pending.push(m);
    });
    var occupied = {};
    function reserve(m, at, court) {
      if (!at || !court) return;
      var a = new Date(at).getTime(); if (isNaN(a)) return;
      (occupied[court] || (occupied[court] = [])).push({ a: a, b: a + duration(t, m) });
    }
    blocked.forEach(function (m) {
      var at = change && String(change.matchId) === String(m.id) ? change.scheduledAt : m.scheduledAt;
      var court = change && String(change.matchId) === String(m.id) ? change.court : m.court;
      reserve(m, at, court);
    });
    function free(court, at, len) { return !(occupied[court] || []).some(function (x) { return at < x.b && at + len > x.a; }); }
    var cursor = start(t), items = [];
    ms.forEach(function (m) {
      var isChange = change && String(change.matchId) === String(m.id);
      var manual = m.scheduleLocked === true || m.scheduleSource === 'organizer' || isChange;
      if (played(m)) return;
      if (manual) {
        var a = isChange ? change.scheduledAt : m.scheduledAt;
        var c = isChange ? change.court : m.court;
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
  window._renderOperationalSchedule = function (slot, t) {
    if (!slot || !t || !window._souOrganizador || !window._souOrganizador(t)) return;
    var plan = window._operationalSchedulePlan(t), total = plan.items.length;
    slot.innerHTML = '<section class="sp-operational-schedule" style="margin:12px 0;padding:12px 14px;border:1px solid rgba(56,189,248,.35);border-radius:12px;background:rgba(14,116,144,.10);display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:220px"><strong>📍 Agenda operacional</strong><div style="font-size:.82rem;opacity:.78;margin-top:3px">' + total + ' jogos pendentes · ' + plan.courts.map(esc).join(' · ') + '. A sugestão não é publicada até você aplicar.</div></div>' +
      '<button type="button" class="btn btn-primary" id="sp-agenda-apply-' + esc(t.id) + '">Aplicar sugestão</button></section>';
    var button = slot.querySelector('button[id^="sp-agenda-apply-"]');
    if (!button) return;
    button.onclick = function () {
      var fresh = (window._findTournamentById && window._findTournamentById(t.id)) || t;
      var draft = window._operationalSchedulePlan(fresh);
      if (!draft.items.length) { msg('Agenda atualizada', 'Não há jogos pendentes para realocar.', 'info'); return; }
      button.disabled = true; button.textContent = 'Aplicando agenda…';
      var db = window.FirestoreDB;
      if (!db || typeof db._callFn !== 'function') { button.disabled=false; button.textContent='Aplicar sugestão'; msg('Agenda não salva','Conexão indisponível.','error'); return; }
      db._callFn('setMatchSchedule', { tournamentId:String(fresh.id), operationId:uid(), baseScheduleRevision:draft.baseScheduleRevision, operational:true,
        jogos:draft.items.map(function (i) { return { matchId:i.matchId, court:i.court, scheduledAt:i.scheduledAt, scheduledKind:'estimate', scheduleLocked:i.scheduleLocked, scheduleSource:i.scheduleSource }; })
      }).then(function () { msg('Agenda aplicada', draft.items.length + ' jogos pendentes foram distribuídos pelas quadras.', 'success'); if (window.renderBracket) window.renderBracket(fresh.id); })
        .catch(function (e) { msg('Agenda não salva', (e && e.details && e.details.code === 'schedule-revision-stale') ? 'A agenda mudou em outra tela. A sugestão foi recalculada; aplique novamente.' : 'Não foi possível aplicar a agenda. Tente novamente.', 'error'); })
        .finally(function () { button.disabled=false; button.textContent='Aplicar sugestão'; });
    };
  };
}());
