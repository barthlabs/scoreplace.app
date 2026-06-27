// schedule-poll.js — "Combinar jogos" (agendamento POR JOGO) — Frente F (v3.1.46)
//
// Deixa os JOGADORES de cada confronto da RODADA ATUAL combinarem quando jogar,
// dentro da janela da rodada, e ao haver consenso AGENDAR o jogo (grava data/hora
// no próprio match). Usado em torneios sem data/hora fixa por jogo (ex.: Confra
// fase 1 = 1 rodada Liga até o próximo sorteio; fase 2 = eliminatória multi-dia).
//
// ── DECISÕES DO DONO (que moldam o design) ───────────────────────────────────
//  1. ESCOPO = POR JOGO: cada confronto; os 2 jogadores (4 nas duplas) combinam.
//  2. Janela em fase de ELIMINAÇÃO = endDate da fase/torneio, dividida pelo nº de
//     rodadas restantes; em LIGA = próximo sorteio devido (_nextOwedDrawMs).
//  3. CONSENSO + OK FINAL: cada jogador marca disponibilidade; ao convergir, cada
//     um dá um OK final na opção escolhida; quando TODOS confirmam a MESMA opção →
//     agenda (m.scheduledAt), aparece chip no card e a UI de combinar colapsa.
//
// ── MODELO DE DADOS (no MATCH, sem container em opinionPolls) ─────────────────
//  m.schedule = {
//    enabledAt,                          // ISO, set no 1º write (auditoria)
//    options: [
//      { id, kind:'date',   dateISO:'2026-07-02', time:'17:00', byUid },
//      { id, kind:'weekly', weekdays:[2,4], time:'17:00', byUid }  // 0=Dom..6=Sáb
//    ],
//    votes:    { [uid]: { [optId]: 1 | -1 } },           // posso (1) / não posso (-1)
//    dayVotes: { [uid]: { [optId]: { [wd]: 1 | -1 } } }, // voto POR DIA (opções weekly)
//    scheduledOptId, scheduledWd
//  }
//  Consenso: opção 'date' com TODOS = 1 agenda; opção 'weekly' agenda no 1º dia em
//  que TODOS votaram 1 (ocorrência mais próxima). Legado avail/confirms migra p/ votes.
//  m.scheduledAt = ISO   // espelho TOP-LEVEL — dirige o chip + estado colapsado
//  m.scheduledBy = uid
//
// Rules: matches/rounds/groups/rodadas já estão na allowlist isParticipantBracketDiff
// → SEM mudança de firestore.rules. Mesmo padrão save→confirma-ou-reverte de _opVote.
//
// Módulo NOVO (window._sch*), espelha o ESTILO de opinion-poll.js sem tocá-lo.
(function () {
  'use strict';
  var WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var DAY = 86400000;
  var _schEdit = null; // { matchId, optId } — opção em edição inline

  function _esc(s) { return (window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s)); }
  function _attr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function _cu() { return window.AppStore && window.AppStore.currentUser; }
  function _rand() { return Math.floor(Math.random() * 1e6); }
  function _findT(tId) {
    if (typeof window._findTournamentById === 'function') return window._findTournamentById(tId);
    return window.AppStore && (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); });
  }
  // Promise do save — NUNCA engolir rejeição (classe do bug Confra).
  function _save(t) {
    try {
      if (window.FirestoreDB && window.FirestoreDB.saveTournament) return Promise.resolve(window.FirestoreDB.saveTournament(t));
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('FirestoreDB indisponível'));
  }
  function _isOrg(t) { return !!(window.AppStore && ((window.AppStore.isOrganizer && window.AppStore.isOrganizer(t)) || (window.AppStore.isCreator && window.AppStore.isCreator(t)))); }

  // ─── datas / formatação (BRT) ────────────────────────────────────────────────
  function _brtYmd(ms) {
    try { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
    catch (e) { return new Date(ms).toISOString().slice(0, 10); }
  }
  function _fmtDateTime(iso) {
    try {
      var d = new Date(iso); if (isNaN(d.getTime())) return String(iso || '');
      var dd = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
      var hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      return dd + ' às ' + hh;
    } catch (e) { return String(iso || ''); }
  }
  function _optLabel(o) {
    if (!o) return '';
    if (o.kind === 'date' && o.dateISO) {
      var p = String(o.dateISO).split('-');
      var dm = (p.length === 3) ? (p[2] + '/' + p[1]) : o.dateISO;
      return dm + (o.time ? ' às ' + o.time : '');
    }
    var days = (o.weekdays || []).slice().sort(function (a, b) { return a - b; }).map(function (w) { return WD[w] || '?'; }).join('+');
    return days + (o.time ? ' ' + o.time : '');
  }

  // ─── janela da rodada atual ───────────────────────────────────────────────────
  // Liga: até o próximo sorteio devido. Elim/Grupos/Monarch: divide [agora→endDate]
  // pelo nº de rodadas restantes.
  window._schWindow = function (t) {
    var now = Date.now();
    var endMs = null;
    try {
      var isLiga = t && (t.format === 'Liga' || t.format === 'Ranking');
      if (isLiga && typeof window._nextOwedDrawMs === 'function') {
        endMs = window._nextOwedDrawMs(t, now);
      }
      if (endMs == null) {
        // endDate da fase atual (multi-fase) ou do torneio
        var cur = (t && t.currentPhaseIndex) || 0;
        var pcfg = (t && Array.isArray(t.phases) && t.phases[cur]) || {};
        var endStr = pcfg.endDate || (t && t.endDate) || '';
        var endTime = pcfg.endTime || (t && t.endTime) || '23:59';
        var phaseEndMs = null;
        if (endStr) {
          var s = String(endStr); if (s.indexOf('T') !== -1) s = s.split('T')[0];
          var pe = new Date(s + 'T' + endTime + ':00-03:00').getTime();
          if (!isNaN(pe)) phaseEndMs = pe;
        }
        if (phaseEndMs != null && phaseEndMs > now) {
          // divide pelos rounds restantes (cross-formato via o adapter canônico)
          var remaining = 1;
          try {
            var ur = (typeof window._getUnifiedRounds === 'function') ? window._getUnifiedRounds(t) : { columns: [] };
            var cols = (ur && ur.columns) || [];
            var done = cols.filter(function (c) { return c && c.status === 'done'; }).length;
            remaining = Math.max(1, cols.length - done);
          } catch (e2) { remaining = 1; }
          var band = (phaseEndMs - now) / remaining;
          endMs = Math.min(phaseEndMs, now + band);
        } else if (phaseEndMs != null) {
          endMs = phaseEndMs; // já passou — deixa o usuário ver, mas no passado
        }
      }
    } catch (e) { endMs = null; }
    if (endMs == null || isNaN(endMs)) endMs = now + 14 * DAY; // fallback 14 dias
    var startMs = now;
    if (t && t.lastAutoDrawAt) { var la = new Date(t.lastAutoDrawAt).getTime(); if (!isNaN(la) && la < now) startMs = la; }
    return { startMs: startMs, endMs: Math.max(endMs, now + 60000) };
  };

  // ─── rodada atual (cross-formato) ──────────────────────────────────────────────
  function _filterPlayable(matches) {
    return (matches || []).filter(function (m) {
      if (!m) return false;
      if (m.isBye || m.isSitOut) return false;
      var a = m.p1, b = m.p2;
      if (a === 'BYE' || b === 'BYE' || a === 'TBD' || b === 'TBD') return false;
      if (!a || !b) return false;
      return true;
    });
  }
  window._schCurrentRoundMatches = function (t) {
    var empty = { round: null, matches: [], col: null };
    if (!t) return empty;
    var ur = (typeof window._getUnifiedRounds === 'function') ? window._getUnifiedRounds(t) : null;
    var cols = (ur && ur.columns) || [];
    if (!cols.length) return empty;
    var col = null;
    for (var i = cols.length - 1; i >= 0; i--) { if (cols[i] && cols[i].status !== 'done') { col = cols[i]; break; } }
    if (!col) col = cols[cols.length - 1];
    return { round: col.round, matches: _filterPlayable(col.matches), col: col };
  };

  // memo leve: o chip é chamado por CADA card; evita rodar o adapter N vezes/render.
  var _crCache = null;
  function _currentRoundIdSet(t) {
    var now = Date.now();
    if (_crCache && _crCache.tid === String(t.id) && (now - _crCache.at) < 1500) return _crCache.ids;
    var ids = {};
    try { window._schCurrentRoundMatches(t).matches.forEach(function (m) { if (m && m.id != null) ids[m.id] = 1; }); } catch (e) {}
    _crCache = { tid: String(t.id), ids: ids, at: now };
    return ids;
  }
  function _schIsCurrentRoundMatch(t, m) { return !!(m && m.id != null && _currentRoundIdSet(t)[m.id]); }

  // ─── uids dos jogadores do match (singles + duplas + monarch) ──────────────────
  function _schMatchUids(t, m) {
    if (!t || !m) return [];
    var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    var allUids = (typeof window._participantUids === 'function') ? window._participantUids : function (p) { return p && p.uid ? [p.uid] : []; };
    var out = {};
    function addByName(nm) {
      if (!nm || nm === 'TBD' || nm === 'BYE') return;
      var pp = parts.find(function (p) { return typeof p === 'object' && (p.displayName || p.name || '') === nm; });
      if (pp) allUids(pp).forEach(function (u) { if (u) out[u] = 1; });
    }
    if (m.isMonarch) {
      (Array.isArray(m.team1) ? m.team1 : []).forEach(addByName);
      (Array.isArray(m.team2) ? m.team2 : []).forEach(addByName);
    } else { addByName(m.p1); addByName(m.p2); }
    return Object.keys(out);
  }
  function _schUserIsPlayer(t, m, user) {
    if (!user) return false;
    if (typeof window._userTeamInMatch === 'function' && window._userTeamInMatch(t, m, user) > 0) return true;
    return !!(user.uid && _schMatchUids(t, m).indexOf(user.uid) !== -1);
  }

  function _schFindMatch(t, matchId) {
    var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
    return (all || []).find(function (m) { return m && String(m.id) === String(matchId); }) || null;
  }
  function _ensureSchedule(m) {
    if (!m.schedule || typeof m.schedule !== 'object') m.schedule = { options: [], votes: {}, dayVotes: {} };
    var s = m.schedule;
    if (!Array.isArray(s.options)) s.options = [];
    if (!s.votes || typeof s.votes !== 'object') s.votes = {};
    if (!s.dayVotes || typeof s.dayVotes !== 'object') s.dayVotes = {};
    // migração legado: avail (posso) → votes ; confirms vira voto posso na opção
    if (s.avail && typeof s.avail === 'object') {
      Object.keys(s.avail).forEach(function (u) { (s.avail[u] || []).forEach(function (oid) { (s.votes[u] = s.votes[u] || {})[oid] = 1; }); });
      delete s.avail;
    }
    if (s.confirms && typeof s.confirms === 'object') {
      Object.keys(s.confirms).forEach(function (u) { var oid = s.confirms[u]; if (oid) (s.votes[u] = s.votes[u] || {})[oid] = 1; });
      delete s.confirms;
    }
    if (!s.enabledAt) s.enabledAt = new Date().toISOString();
    return s;
  }

  // Resolve a opção escolhida → ISO concreto pra m.scheduledAt.
  function _schResolveISO(opt, t) {
    if (!opt) return '';
    if (opt.kind === 'date' && opt.dateISO) {
      var d = new Date(opt.dateISO + 'T' + (opt.time || '12:00') + ':00-03:00');
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    // weekly → próxima ocorrência do menor weekday dentro da janela (descritor
    // recorrente fica na option só pra exibição).
    var win = window._schWindow(t);
    var wds = (opt.weekdays || []).slice().sort(function (a, b) { return a - b; });
    if (!wds.length) return '';
    var tp = String(opt.time || '12:00').split(':');
    var hh = ('0' + (parseInt(tp[0], 10) || 0)).slice(-2), mm = ('0' + (parseInt(tp[1], 10) || 0)).slice(-2);
    for (var i = 0; i < 28; i++) {
      var ms = win.startMs + i * DAY;
      var ymd = _brtYmd(ms);
      var wd = new Date(ymd + 'T12:00:00-03:00').getDay(); // weekday em BRT
      if (wds.indexOf(wd) !== -1) {
        var d2 = new Date(ymd + 'T' + hh + ':' + mm + ':00-03:00');
        if (!isNaN(d2.getTime()) && d2.getTime() >= win.startMs) return d2.toISOString();
      }
    }
    return '';
  }

  // Resolve a próxima ocorrência de um weekday específico (BRT) dentro da janela.
  function _schResolveDayISO(time, wd, t) {
    var win = window._schWindow(t);
    var tp = String(time || '12:00').split(':');
    var hh = ('0' + (parseInt(tp[0], 10) || 0)).slice(-2), mm = ('0' + (parseInt(tp[1], 10) || 0)).slice(-2);
    for (var i = 0; i < 28; i++) {
      var ymd = _brtYmd(win.startMs + i * DAY);
      var d = new Date(ymd + 'T12:00:00-03:00').getDay();
      if (d === wd) {
        var d2 = new Date(ymd + 'T' + hh + ':' + mm + ':00-03:00');
        if (!isNaN(d2.getTime()) && d2.getTime() >= win.startMs) return d2.toISOString();
      }
    }
    return '';
  }

  // Consenso: TODOS os uids votaram "posso" (1) na MESMA opção (ou no MESMO dia, p/
  // weekly) → agenda na ocorrência mais próxima. Roda DENTRO do voto, ANTES do save
  // → escrita atômica. Retorna true se fechou agora.
  function _schTrySchedule(t, m) {
    var uids = _schMatchUids(t, m);
    if (uids.length < 2) return false;
    var s = m.schedule || {}; var votes = s.votes || {}, dayVotes = s.dayVotes || {};
    var opts = s.options || [];
    for (var k = 0; k < opts.length; k++) {
      var o = opts[k];
      if (o.kind === 'date') {
        if (uids.every(function (u) { return (votes[u] || {})[o.id] === 1; })) {
          var iso = _schResolveISO(o, t);
          if (iso) { s.scheduledOptId = o.id; s.scheduledWd = null; m.scheduledAt = iso; m.scheduledBy = (_cu() || {}).uid || ''; return true; }
        }
      } else {
        var wds = (o.weekdays || []).slice().sort(function (a, b) { return a - b; });
        var best = null, bestWd = null;
        wds.forEach(function (wd) {
          if (!uids.every(function (u) { return (((dayVotes[u] || {})[o.id]) || {})[wd] === 1; })) return;
          var di = _schResolveDayISO(o.time, wd, t);
          if (di && (!best || di < best)) { best = di; bestWd = wd; }
        });
        if (best) { s.scheduledOptId = o.id; s.scheduledWd = bestWd; m.scheduledAt = best; m.scheduledBy = (_cu() || {}).uid || ''; return true; }
      }
    }
    return false;
  }

  // ─── notificações (level fundamental) ──────────────────────────────────────────
  function _schKickoffData(t, m) {
    return {
      type: 'schedule', tournamentId: String(t.id), tournamentName: t.name || '', matchId: m.id,
      title: '📅 Combine seu jogo',
      message: 'Combine com o adversário quando jogar "' + (m.p1 || '') + ' vs ' + (m.p2 || '') + '" em "' + (t.name || '') + '".',
      level: 'fundamental', timestamp: Date.now()
    };
  }
  function _schScheduledData(t, m) {
    return {
      type: 'schedule', tournamentId: String(t.id), tournamentName: t.name || '', matchId: m.id,
      title: '📅 Jogo combinado',
      message: 'Seu jogo "' + (m.p1 || '') + ' vs ' + (m.p2 || '') + '" foi combinado para ' + _fmtDateTime(m.scheduledAt) + '.',
      level: 'fundamental', timestamp: Date.now()
    };
  }
  function _schNotifyScheduled(t, m) {
    if (typeof window._sendUserNotification !== 'function') return;
    var data = _schScheduledData(t, m);
    var uids = _schMatchUids(t, m);
    uids.forEach(function (u) { window._sendUserNotification(u, data); });
    if (t.creatorUid && uids.indexOf(t.creatorUid) === -1) window._sendUserNotification(t.creatorUid, data);
  }

  // ─── overlay (helpers) ─────────────────────────────────────────────────────────
  function _overlay(id, innerHtml) {
    var ex = document.getElementById(id); if (ex) ex.remove();
    var o = document.createElement('div');
    o.id = id;
    o.style.cssText = 'position:fixed;inset:0;z-index:100040;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';
    o.innerHTML = '<div style="background:var(--bg-card,#0f172a);width:96%;max-width:460px;max-height:90vh;overflow:auto;border-radius:16px;border:1px solid rgba(16,185,129,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);">' + innerHtml + '</div>';
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }
  function _close(id) { var o = document.getElementById(id); if (o) o.remove(); }
  window._schCloseOverlay = function () { _close('sch-overlay'); _close('sch-org-overlay'); };

  // ─── chip / botão no card ──────────────────────────────────────────────────────
  window._schCardChip = function (t, m) {
    try {
      if (!t || !m) return '';
      if (m.scheduledAt) {
        return '<div style="display:flex;justify-content:center;margin:8px 0 2px;"><span style="display:inline-flex;align-items:center;gap:5px;background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.45);color:#34d399;font-weight:800;font-size:0.78rem;border-radius:999px;padding:5px 12px;">📅 ' + _esc(_fmtDateTime(m.scheduledAt)) + '</span></div>';
      }
      if (m.winner || m.isBye || m.isSitOut) return '';
      if (!m.p1 || !m.p2 || m.p1 === 'BYE' || m.p2 === 'BYE' || m.p1 === 'TBD' || m.p2 === 'TBD') return '';
      var cu = _cu(); if (!cu || !cu.uid) return '';
      if (!_schIsCurrentRoundMatch(t, m)) return '';
      if (!_schUserIsPlayer(t, m, cu)) return '';
      var n = (m.schedule && Array.isArray(m.schedule.options)) ? m.schedule.options.length : 0;
      return '<div style="display:flex;justify-content:center;margin:8px 0 2px;">' +
        '<button class="btn btn-shine hover-lift" onclick="event.stopPropagation(); window._schOpenMatch(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" ' +
        'style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:11px;padding:8px 16px;font-weight:800;font-size:0.82rem;box-shadow:0 4px 14px rgba(16,185,129,0.4);">' +
        '📅 Combinar jogo' + (n ? ' <span style="background:rgba(255,255,255,0.25);border-radius:999px;padding:1px 7px;font-size:0.72rem;">' + n + '</span>' : '') +
        '</button></div>';
    } catch (e) { return ''; }
  };

  // ─── overlay por jogo ──────────────────────────────────────────────────────────
  window._schOpenMatch = function (tId, matchId) {
    var t = _findT(tId); if (!t) return;
    var m = _schFindMatch(t, matchId); if (!m) return;
    _renderMatch(t, m);
  };

  function _userName(t, u) { return (typeof window._opVoterName === 'function') ? window._opVoterName(t, u) : 'Jogador'; }
  function _avatarImg(t, u, size) {
    var nm = _userName(t, u); var sz = size || 24;
    var src = (typeof window._profileAvatarUrl === 'function') ? window._profileAvatarUrl(nm, '', sz)
      : ('https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(nm));
    return '<img src="' + _esc(src) + '" title="' + _esc(nm) + '" alt="' + _esc(nm) + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;object-fit:cover;border:2px solid var(--bg-card,#0f172a);flex-shrink:0;">';
  }
  function _avatarsFor(t, uids) {
    if (!uids || !uids.length) return '';
    return uids.map(function (u) {
      var nm = _userName(t, u);
      var src = (typeof window._profileAvatarUrl === 'function') ? window._profileAvatarUrl(nm, '', 26)
        : ('https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(nm));
      return '<img src="' + _esc(src) + '" title="' + _esc(nm) + '" alt="' + _esc(nm) + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:2px solid var(--bg-card,#0f172a);margin-left:-6px;flex-shrink:0;">';
    }).join('');
  }

  function _renderMatch(t, m) {
    var cu = _cu();
    var uid = cu && cu.uid;
    var isPlayer = _schUserIsPlayer(t, m, cu);
    var isOrg = _isOrg(t);
    var win = window._schWindow(t);
    var allUids = _schMatchUids(t, m);
    var sched = m.scheduledAt ? (m.schedule || {}) : _ensureSchedule(m);
    var header =
      '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#065f46,#047857);border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2;">' +
        '<button type="button" onclick="window._schCloseOverlay()" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);font-weight:700;">‹ Voltar</button>' +
        '<span style="font-weight:800;color:#fff;font-size:0.92rem;">📅 Combinar jogo</span>' +
        '<button type="button" onclick="window._schCloseOverlay()" class="btn btn-sm" style="background:rgba(16,185,129,0.9);color:#fff;border:1px solid rgba(255,255,255,0.35);font-weight:800;">Confirmar</button>' +
      '</div>';
    var matchLine = '<div style="font-weight:800;font-size:1.02rem;color:var(--text-bright);margin-bottom:2px;">' + _esc(m.p1 || '') + ' <span style="color:var(--text-muted);font-weight:600;">vs</span> ' + _esc(m.p2 || '') + '</div>';

    // ── estado AGENDADO (colapsado) ──
    if (m.scheduledAt) {
      var canUndo = isPlayer && !(typeof window._matchHasRealPlay === 'function' && window._matchHasRealPlay(m));
      var body =
        '<div style="padding:1.1rem;">' + matchLine +
          '<div style="margin-top:14px;text-align:center;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.4);border-radius:14px;padding:18px;">' +
            '<div style="font-size:2rem;line-height:1;">📅</div>' +
            '<div style="font-weight:900;font-size:1.1rem;color:#34d399;margin-top:8px;">Jogo combinado</div>' +
            '<div style="font-size:0.95rem;color:var(--text-bright);margin-top:4px;">' + _esc(_fmtDateTime(m.scheduledAt)) + '</div>' +
          '</div>' +
          (canUndo ? '<button type="button" onclick="window._schUnconfirm(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" class="btn" style="width:100%;margin-top:12px;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.4);font-weight:700;border-radius:11px;padding:9px;font-size:0.82rem;">↩️ Desfazer combinação</button>' : '') +
        '</div>';
      _overlay('sch-overlay', header + body);
      return;
    }

    // ── opções (agrupadas por quem propôs) + voto posso/não posso ──
    var votes = sched.votes || {}, dayVotes = sched.dayVotes || {};
    var myVotes = votes[uid] || {}, myDayVotes = dayVotes[uid] || {};
    var minD = _brtYmd(win.startMs), maxD = _brtYmd(win.endMs);

    // botão de voto (posso=1 / não posso=-1). `mine` = meu voto atual nesta célula.
    // Glifo CANÔNICO via window._opVoteGlyph: ✅ posso / 🚫 não posso (🚫 = proibido,
    // pra não confundir com o ✕ de apagar a opção).
    function _voteBtn(val, mine, onclick, big) {
      var on = mine === val, pos = val === 1;
      var bg = on ? (pos ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)') : 'rgba(255,255,255,0.05)';
      var col = on ? '#fff' : (pos ? '#34d399' : '#f87171');
      var bd = on ? 'none' : ('1px solid ' + (pos ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'));
      var pad = big ? '8px' : '5px 8px', fs = big ? '0.82rem' : '0.8rem';
      var g = (typeof window._opVoteGlyph === 'function') ? window._opVoteGlyph(pos ? 'yes' : 'no') : (pos ? '✅' : '🚫');
      var label = big ? (g + (pos ? ' Posso' : ' Não')) : g;
      return '<button type="button" onclick="' + onclick + '" class="btn" style="' + (big ? 'flex:1;' : '') + 'background:' + bg + ';color:' + col + ';border:' + bd + ';font-weight:800;border-radius:9px;padding:' + pad + ';font-size:' + fs + ';line-height:1;">' + label + '</button>';
    }

    function _renderOption(o) {
      var mine = o.byUid === uid;
      var canManage = mine || isOrg;
      var editing = _schEdit && _schEdit.matchId === String(m.id) && _schEdit.optId === o.id;
      var oa = "'" + _attr(t.id) + "','" + _attr(m.id) + "','" + _attr(o.id) + "'";

      // ── modo edição inline ──
      if (editing && canManage) {
        var ed;
        if (o.kind === 'date') {
          ed = '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
            '<input type="date" id="sch-edit-date" value="' + _esc(o.dateISO || '') + '" min="' + minD + '" max="' + maxD + '" style="flex:1;min-width:0;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
            '<input type="time" id="sch-edit-time" value="' + _esc(o.time || '17:00') + '" style="width:96px;flex-shrink:0;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;"></div>';
        } else {
          var wsel = (o.weekdays || []);
          ed = '<div id="sch-edit-weekdays" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">' +
            WD.map(function (w, i) { var on = wsel.indexOf(i) !== -1; return '<button type="button" data-wd="' + i + '" data-on="' + (on ? '1' : '0') + '" onclick="window._schToggleWd(this)" style="background:' + (on ? 'linear-gradient(135deg,#10b981,#059669)' : 'var(--bg-darker,#0b1220)') + ';border:1px solid ' + (on ? '#10b981' : 'rgba(255,255,255,0.14)') + ';color:' + (on ? '#fff' : 'var(--text-muted)') + ';border-radius:8px;padding:6px 9px;font-size:0.78rem;font-weight:700;cursor:pointer;">' + w + '</button>'; }).join('') +
            '</div>' +
            '<input type="time" id="sch-edit-weekly-time" value="' + _esc(o.time || '17:00') + '" style="width:96px;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;margin-bottom:8px;">';
        }
        return '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.4);border-radius:11px;padding:11px 12px;margin-bottom:9px;">' + ed +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" onclick="window._schCancelEdit(' + oa + ')" class="btn" style="flex:1;background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border-color);font-weight:700;border-radius:9px;padding:8px;font-size:0.8rem;">Cancelar</button>' +
            '<button type="button" onclick="window._schSaveEdit(' + oa + ')" class="btn" style="flex:1;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;font-weight:800;border-radius:9px;padding:8px;font-size:0.8rem;">Salvar</button>' +
          '</div></div>';
      }

      // ── ícones gerenciar (lápis / X) ──
      var manage = canManage ? (
        '<span style="display:inline-flex;gap:4px;flex-shrink:0;">' +
          '<button type="button" title="Editar" onclick="window._schEditOption(' + oa + ')" class="btn" style="background:rgba(255,255,255,0.06);color:#cbd5e1;border:1px solid var(--border-color);border-radius:7px;padding:3px 7px;font-size:0.82rem;line-height:1;">✏️</button>' +
          '<button type="button" title="Apagar" onclick="window._schDeleteOption(' + oa + ')" class="btn" style="background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:7px;padding:3px 7px;font-size:0.82rem;line-height:1;">✕</button>' +
        '</span>') : '';

      var rows = '';
      if (o.kind === 'date') {
        var yesU = allUids.filter(function (u) { return (votes[u] || {})[o.id] === 1; });
        var noN = allUids.filter(function (u) { return (votes[u] || {})[o.id] === -1; }).length;
        rows =
          (yesU.length ? '<div style="display:flex;align-items:center;padding-left:6px;margin-top:8px;">' + _avatarsFor(t, yesU) + '</div>' : '') +
          (isPlayer ? '<div style="display:flex;gap:8px;margin-top:9px;">' +
            _voteBtn(1, myVotes[o.id], 'window._schVote(' + oa + ',1)', true) +
            _voteBtn(-1, myVotes[o.id], 'window._schVote(' + oa + ',-1)', true) +
          '</div>' : '');
        return '<div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.22);border-radius:11px;padding:10px 12px;margin-bottom:9px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
            '<span style="font-weight:800;font-size:0.95rem;color:var(--text-bright);">' + _esc(_optLabel(o)) + '</span>' +
            '<span style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;"><span style="font-size:0.72rem;color:var(--text-muted);font-weight:700;">' + yesU.length + '/' + (allUids.length || '?') + ' ✅' + (noN ? ' · ' + noN + ' 🚫' : '') + '</span>' + manage + '</span>' +
          '</div>' + rows + '</div>';
      }
      // weekly → uma linha por dia, com voto por dia
      var wds = (o.weekdays || []).slice().sort(function (a, b) { return a - b; });
      var dayRows = wds.map(function (wd) {
        var yc = allUids.filter(function (u) { return (((dayVotes[u] || {})[o.id]) || {})[wd] === 1; }).length;
        var nc = allUids.filter(function (u) { return (((dayVotes[u] || {})[o.id]) || {})[wd] === -1; }).length;
        var mv = (myDayVotes[o.id] || {})[wd];
        var da = oa + ',' + wd;
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,0.06);">' +
          '<span style="font-weight:700;font-size:0.85rem;color:var(--text-bright);min-width:52px;">' + WD[wd] + (o.time ? ' <span style="color:var(--text-muted);font-weight:600;">' + _esc(o.time) + '</span>' : '') + '</span>' +
          '<span style="font-size:0.7rem;color:var(--text-muted);font-weight:700;flex:1;text-align:right;">' + yc + '/' + (allUids.length || '?') + ' ✅' + (nc ? ' · ' + nc + ' 🚫' : '') + '</span>' +
          (isPlayer ? '<span style="display:inline-flex;gap:5px;flex-shrink:0;">' +
            _voteBtn(1, mv, 'window._schVoteDay(' + da + ',1)', false) +
            _voteBtn(-1, mv, 'window._schVoteDay(' + da + ',-1)', false) +
          '</span>' : '') +
        '</div>';
      }).join('');
      return '<div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.22);border-radius:11px;padding:10px 12px;margin-bottom:9px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
          '<span style="font-weight:800;font-size:0.9rem;color:#34d399;">📆 Dias da semana ' + (o.time ? '· ' + _esc(o.time) : '') + '</span>' + manage +
        '</div>' + dayRows + '</div>';
    }

    // agrupa por quem propôs; meu box primeiro, depois por nome
    var byUser = {}, order = [];
    (sched.options || []).forEach(function (o) { if (!byUser[o.byUid]) { byUser[o.byUid] = []; order.push(o.byUid); } byUser[o.byUid].push(o); });
    order.sort(function (a, b) { if (a === uid) return -1; if (b === uid) return 1; return _userName(t, a).localeCompare(_userName(t, b)); });

    var optsHtml = order.map(function (puid) {
      var nm = _userName(t, puid) + (puid === uid ? ' (você)' : '');
      var inner = byUser[puid].map(_renderOption).join('');
      return '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:14px;padding:10px 11px 4px;margin-bottom:12px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;">' + _avatarImg(t, puid, 24) +
          '<span style="font-weight:800;font-size:0.86rem;color:var(--text-bright);">' + _esc(nm) + '</span>' +
          '<span style="font-size:0.7rem;color:var(--text-muted);font-weight:700;">propôs</span></div>' +
        inner + '</div>';
    }).join('');
    if (!(sched.options || []).length) optsHtml = '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:14px 0;">Ninguém propôs horário ainda. Proponha abaixo 👇</div>';

    var addHtml = isPlayer ? (
      '<div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--border-color);">' +
        '<div style="font-size:0.78rem;font-weight:800;color:#34d399;margin-bottom:8px;">Combinar até ' + _esc(_fmtDateTime(win.endMs)) + '</div>' +
        // data + hora
        '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
          '<input type="date" id="sch-date" min="' + minD + '" max="' + maxD + '" style="flex:1;min-width:0;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
          '<input type="time" id="sch-date-time" value="17:00" style="width:96px;flex-shrink:0;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
        '</div>' +
        '<button type="button" onclick="window._schProposeDate(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" class="btn" style="width:100%;background:rgba(16,185,129,0.12);border:1px dashed rgba(16,185,129,0.5);color:#34d399;font-weight:700;border-radius:9px;padding:9px;font-size:0.82rem;margin-bottom:14px;">＋ propor data e hora</button>' +
        // combo de dias
        '<div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:6px;">ou combo de dias da semana:</div>' +
        '<div id="sch-weekdays" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">' +
          WD.map(function (w, i) { return '<button type="button" data-wd="' + i + '" data-on="0" onclick="window._schToggleWd(this)" style="background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);color:var(--text-muted);border-radius:8px;padding:6px 9px;font-size:0.78rem;font-weight:700;cursor:pointer;">' + w + '</button>'; }).join('') +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<input type="time" id="sch-weekly-time" value="17:00" style="width:96px;flex-shrink:0;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
          '<button type="button" onclick="window._schProposeWeekly(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" class="btn" style="flex:1;background:rgba(16,185,129,0.12);border:1px dashed rgba(16,185,129,0.5);color:#34d399;font-weight:700;border-radius:9px;padding:9px;font-size:0.82rem;">＋ propor dias</button>' +
        '</div>' +
      '</div>'
    ) : (isOrg ? '<div style="margin-top:10px;font-size:0.78rem;color:var(--text-muted);text-align:center;">Você não joga este confronto — acompanhando como organizador.</div>' : '');

    var body = '<div style="padding:1rem 1.1rem;">' + matchLine +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin:2px 0 12px;">Quem joga propõe horários e marca o que consegue. Quando todos derem ✅ no mesmo, o jogo é combinado.</div>' +
      optsHtml + addHtml + '</div>';
    _overlay('sch-overlay', header + body);
  }

  // toggle visual dos chips de dia da semana
  window._schToggleWd = function (btn) {
    if (!btn) return; var on = btn.getAttribute('data-on') === '1';
    btn.setAttribute('data-on', on ? '0' : '1');
    if (on) { btn.style.background = 'var(--bg-darker,#0b1220)'; btn.style.color = 'var(--text-muted)'; btn.style.borderColor = 'rgba(255,255,255,0.14)'; }
    else { btn.style.background = 'linear-gradient(135deg,#10b981,#059669)'; btn.style.color = '#fff'; btn.style.borderColor = '#10b981'; }
  };

  // ─── mutadores (otimista + save/revert, espelhando _opVote) ────────────────────
  function _guardPlayer(t, m) {
    var cu = _cu();
    if (!cu || !cu.uid) { if (typeof showNotification === 'function') showNotification('Entre pra combinar', 'Faça login pra combinar o jogo.', 'warning'); return null; }
    if (!_schUserIsPlayer(t, m, cu)) { if (typeof showNotification === 'function') showNotification('Só os jogadores', 'Só quem joga este confronto pode combinar.', 'warning'); return null; }
    return cu;
  }
  function _saveSchedule(t, m, prevClone, scheduledNow) {
    return _save(t).then(function () {
      _renderMatch(t, m);
      if (scheduledNow) { try { _schNotifyScheduled(t, m); } catch (e) {} }
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
      _crCache = null;
    }).catch(function (err) {
      m.schedule = prevClone.schedule; m.scheduledAt = prevClone.scheduledAt; m.scheduledBy = prevClone.scheduledBy;
      var _msg = (err && (err.code || err.message)) ? String(err.code || err.message) : 'tente novamente';
      if (typeof showNotification === 'function') showNotification('⚠️ Não salvou', 'Não foi possível registrar no servidor (' + _msg + ').', 'error');
      try { console.error('[schedule-poll] rejeitado:', err); } catch (e) {}
      _renderMatch(t, m);
    });
  }
  function _snapshot(m) {
    return {
      schedule: m.schedule ? JSON.parse(JSON.stringify(m.schedule)) : undefined,
      scheduledAt: m.scheduledAt, scheduledBy: m.scheduledBy
    };
  }

  window._schProposeDate = function (tId, matchId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    var dEl = document.getElementById('sch-date'), tEl = document.getElementById('sch-date-time');
    var dateISO = dEl && dEl.value; var time = (tEl && tEl.value) || '17:00';
    if (!dateISO) { if (typeof showNotification === 'function') showNotification('Escolha a data', '', 'warning'); return; }
    var win = window._schWindow(t);
    var ms = new Date(dateISO + 'T' + time + ':00-03:00').getTime();
    if (isNaN(ms) || ms < win.startMs - DAY || ms > win.endMs + DAY) { if (typeof showNotification === 'function') showNotification('Fora do prazo', 'Escolha uma data dentro da janela da rodada.', 'warning'); return; }
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    s.options.push({ id: 'so_' + Date.now() + '_' + _rand(), kind: 'date', dateISO: dateISO, time: time, byUid: cu.uid });
    _saveSchedule(t, m, prev, false);
  };

  window._schProposeWeekly = function (tId, matchId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    var wds = [];
    document.querySelectorAll('#sch-weekdays [data-wd][data-on="1"]').forEach(function (b) { wds.push(parseInt(b.getAttribute('data-wd'), 10)); });
    var tEl = document.getElementById('sch-weekly-time'); var time = (tEl && tEl.value) || '17:00';
    if (!wds.length) { if (typeof showNotification === 'function') showNotification('Escolha os dias', 'Marque ao menos um dia da semana.', 'warning'); return; }
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    s.options.push({ id: 'so_' + Date.now() + '_' + _rand(), kind: 'weekly', weekdays: wds, time: time, byUid: cu.uid });
    _saveSchedule(t, m, prev, false);
  };

  // voto posso(1)/não posso(-1) numa opção 'date'. Clicar no voto ativo → neutro.
  window._schVote = function (tId, matchId, optId, val) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    var mine = s.votes[cu.uid] = s.votes[cu.uid] || {};
    if (mine[optId] === val) delete mine[optId]; else mine[optId] = val;
    if (!Object.keys(mine).length) delete s.votes[cu.uid];
    var scheduledNow = _schTrySchedule(t, m);
    _saveSchedule(t, m, prev, scheduledNow);
  };

  // voto posso/não posso POR DIA numa opção 'weekly'.
  window._schVoteDay = function (tId, matchId, optId, wd, val) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    wd = parseInt(wd, 10);
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    var mine = s.dayVotes[cu.uid] = s.dayVotes[cu.uid] || {};
    var perOpt = mine[optId] = mine[optId] || {};
    if (perOpt[wd] === val) delete perOpt[wd]; else perOpt[wd] = val;
    if (!Object.keys(perOpt).length) delete mine[optId];
    if (!Object.keys(mine).length) delete s.dayVotes[cu.uid];
    var scheduledNow = _schTrySchedule(t, m);
    _saveSchedule(t, m, prev, scheduledNow);
  };

  // apagar opção (proponente ou organizador) + votos associados.
  window._schDeleteOption = function (tId, matchId, optId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var s = _ensureSchedule(m);
    var opt = (s.options || []).find(function (o) { return o.id === optId; }); if (!opt) return;
    if (opt.byUid !== cu.uid && !_isOrg(t)) { if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só quem propôs (ou o organizador) pode apagar.', 'warning'); return; }
    var run = function () {
      var prev = _snapshot(m);
      s.options = s.options.filter(function (o) { return o.id !== optId; });
      Object.keys(s.votes).forEach(function (u) { delete s.votes[u][optId]; if (!Object.keys(s.votes[u]).length) delete s.votes[u]; });
      Object.keys(s.dayVotes).forEach(function (u) { delete s.dayVotes[u][optId]; if (!Object.keys(s.dayVotes[u]).length) delete s.dayVotes[u]; });
      _saveSchedule(t, m, prev, false);
    };
    if (typeof showConfirmDialog === 'function') showConfirmDialog('Apagar opção?', 'Remove "' + _optLabel(opt) + '" e os votos dela.', run, null, 'Apagar', 'Cancelar');
    else run();
  };

  // entrar/sair do modo edição inline de uma opção.
  window._schEditOption = function (tId, matchId, optId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var s = _ensureSchedule(m);
    var opt = (s.options || []).find(function (o) { return o.id === optId; }); if (!opt) return;
    if (opt.byUid !== cu.uid && !_isOrg(t)) { if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só quem propôs (ou o organizador) pode editar.', 'warning'); return; }
    _schEdit = { matchId: String(m.id), optId: optId };
    _renderMatch(t, m);
  };
  window._schCancelEdit = function (tId, matchId, optId) {
    _schEdit = null;
    var t = _findT(tId); var m = t && _schFindMatch(t, matchId);
    if (t && m) _renderMatch(t, m);
  };
  window._schSaveEdit = function (tId, matchId, optId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var s = _ensureSchedule(m);
    var opt = (s.options || []).find(function (o) { return o.id === optId; }); if (!opt) { _schEdit = null; _renderMatch(t, m); return; }
    if (opt.byUid !== cu.uid && !_isOrg(t)) return;
    var prev = _snapshot(m);
    if (opt.kind === 'date') {
      var dEl = document.getElementById('sch-edit-date'), tEl = document.getElementById('sch-edit-time');
      var dateISO = dEl && dEl.value; var time = (tEl && tEl.value) || '17:00';
      if (!dateISO) { if (typeof showNotification === 'function') showNotification('Escolha a data', '', 'warning'); return; }
      var win = window._schWindow(t);
      var ms = new Date(dateISO + 'T' + time + ':00-03:00').getTime();
      if (isNaN(ms) || ms < win.startMs - DAY || ms > win.endMs + DAY) { if (typeof showNotification === 'function') showNotification('Fora do prazo', 'Escolha uma data dentro da janela da rodada.', 'warning'); return; }
      opt.dateISO = dateISO; opt.time = time;
    } else {
      var wds = [];
      document.querySelectorAll('#sch-edit-weekdays [data-wd][data-on="1"]').forEach(function (b) { wds.push(parseInt(b.getAttribute('data-wd'), 10)); });
      var wt = document.getElementById('sch-edit-weekly-time'); var wtime = (wt && wt.value) || '17:00';
      if (!wds.length) { if (typeof showNotification === 'function') showNotification('Escolha os dias', 'Marque ao menos um dia da semana.', 'warning'); return; }
      opt.weekdays = wds; opt.time = wtime;
      // limpa votos por dia em dias que não existem mais
      Object.keys(s.dayVotes).forEach(function (u) { var po = s.dayVotes[u][optId]; if (po) Object.keys(po).forEach(function (wd) { if (wds.indexOf(parseInt(wd, 10)) === -1) delete po[wd]; }); });
    }
    _schEdit = null;
    var scheduledNow = _schTrySchedule(t, m);
    _saveSchedule(t, m, prev, scheduledNow);
  };

  window._schUnconfirm = function (tId, matchId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    if (typeof window._matchHasRealPlay === 'function' && window._matchHasRealPlay(m)) {
      if (typeof showNotification === 'function') showNotification('Jogo já começou', 'Não dá pra desfazer — o jogo já tem placar.', 'warning'); return;
    }
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    // remove meu voto na opção/dia agendado pra quebrar o consenso e não reagendar
    var oid = s.scheduledOptId, swd = s.scheduledWd;
    if (oid) {
      if (swd != null) { if (s.dayVotes[cu.uid] && s.dayVotes[cu.uid][oid]) { delete s.dayVotes[cu.uid][oid][swd]; } }
      else { if (s.votes[cu.uid]) delete s.votes[cu.uid][oid]; }
    }
    s.scheduledOptId = null; s.scheduledWd = null; m.scheduledAt = ''; m.scheduledBy = '';
    _saveSchedule(t, m, prev, false);
  };

  // ─── overlay do organizador (kickoff + overview) ───────────────────────────────
  window._schOpenOrganizer = function (tId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var cr = window._schCurrentRoundMatches(t);
    var rows = (cr.matches || []).map(function (m) {
      var status, color;
      if (m.scheduledAt) { status = '📅 ' + _fmtDateTime(m.scheduledAt); color = '#34d399'; }
      else if (m.schedule && (m.schedule.options || []).length) { status = '⏳ combinando (' + m.schedule.options.length + ' opç.)'; color = '#fbbf24'; }
      else { status = 'sem propostas'; color = 'var(--text-muted)'; }
      return '<div onclick="window._schOpenMatch(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:10px;margin-bottom:8px;cursor:pointer;">' +
        '<span style="font-size:0.88rem;color:var(--text-bright);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc((m.p1 || '') + ' vs ' + (m.p2 || '')) + '</span>' +
        '<span style="font-size:0.74rem;font-weight:700;color:' + color + ';flex-shrink:0;">' + _esc(status) + '</span>' +
      '</div>';
    }).join('');
    if (!rows) rows = '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:14px 0;">Sem jogos na rodada atual.</div>';
    var header =
      '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#065f46,#047857);border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2;">' +
        '<span style="font-weight:800;color:#fff;font-size:0.92rem;">📅 Combinar jogos</span>' +
        '<button type="button" onclick="window._schCloseOverlay()" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);">Fechar</button>' +
      '</div>';
    var body = '<div style="padding:1rem 1.1rem;">' +
      '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px;">Os jogadores de cada confronto combinam o horário entre eles, dentro do prazo da rodada. Toque num jogo pra acompanhar.</div>' +
      rows +
      '<button type="button" onclick="window._schNotifyRound(\'' + _attr(t.id) + '\')" class="btn btn-shine" style="width:100%;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;border:none;border-radius:11px;padding:11px;font-size:0.9rem;margin-top:6px;">📣 Notificar jogadores da rodada</button>' +
    '</div>';
    _overlay('sch-org-overlay', header + body);
  };

  window._schNotifyRound = function (tId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    if (typeof window._sendUserNotification !== 'function') { if (typeof showNotification === 'function') showNotification('Indisponível', 'Notificações indisponíveis.', 'warning'); return; }
    var cr = window._schCurrentRoundMatches(t);
    var n = 0;
    (cr.matches || []).forEach(function (m) {
      if (m.scheduledAt) return; // já combinado
      _ensureSchedule(m);
      _schMatchUids(t, m).forEach(function (u) { window._sendUserNotification(u, _schKickoffData(t, m)); n++; });
    });
    try { _save(t); } catch (e) {}
    window._schCloseOverlay();
    if (typeof showNotification === 'function') showNotification('📣 Notificados', n + ' aviso(s) enviado(s).', 'success');
  };
})();
