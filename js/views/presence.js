// ========================================
// scoreplace.app — Presença (Quem está no local)
// ========================================
// Public view: pick a venue + sport → see who's playing now and who plans to
// play through the day. Friends appear as avatars; non-friends show as an
// aggregated count ("+N"). Tournament events at the same venue/sport/day
// also populate the timeline.
//
// Route: #presence
//   Optional query (via sessionStorage _presencePrefill) to land on a specific
//   venue/sport when arriving from a dashboard widget or from a tournament
//   page.
// ========================================

(function() {
  // Sliding window de 13 horas no gráfico (6 antes + atual + 6 depois). Hora
  // atual fica sempre centralizada. Ver _currentWindow() — valores
  // recalculados em cada render.
  var WINDOW_HOURS = 13;
  // Auto-refresh: o gráfico se redesenha a cada minuto para mostrar a janela
  // rolando naturalmente conforme o tempo passa.
  var _chartTickInterval = null;

  // Sport → emoji map (shared with the rest of the app — mirrors dashboard.js
  // getSportIcon). Keeps icons in the chips consistent everywhere.
  // v0.17.16: delega ao resolver global em store.js (centralização).
  function _sportIcon(sport) { return window._sportIcon ? window._sportIcon(sport) : '🏆'; }

  // Concatenate dedup'd icons for a list of sports.
  function _sportsIcons(sports) {
    if (!sports || !sports.length) return '';
    var seen = {};
    var out = '';
    sports.forEach(function(s) {
      var icon = _sportIcon(s);
      if (icon && !seen[icon]) { seen[icon] = true; out += icon; }
    });
    return out;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _safe(s) {
    return (window._safeHtml ? window._safeHtml(s) : String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;'));
  }

  // v0.17.2: delega ao helper global em store.js (era duplicado aqui e em
  // venues.js — auditoria L4.2). A versão global é mais defensiva (filter(Boolean)
  // antes de checar length), comportamento idêntico no uso real.
  function _initials(name) { return window._initials(name); }

  function _hourOf(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    return d.getHours();
  }

  function _fmtTime(ts) {
    if (!ts) return '';
    return window._formatHHMM(new Date(ts));
  }

  // Build a deduplicated list of venues the user has a relationship with:
  // profile-saved preferred locations first, then tournament venues.
  // Returns [{placeId, name, lat, lon}].
  function _venuesFromTournaments() {
    var list = [];
    var seen = {};
    var push = function(pid, name, lat, lon) {
      var key = window.PresenceDB.venueKey(pid || '', name || '');
      if (!key || seen[key]) return;
      seen[key] = true;
      list.push({ placeId: key, name: name || pid || '', lat: lat || null, lon: lon || null });
    };
    var cu = window.AppStore && window.AppStore.currentUser;
    // Profile map picker stores locations as { lat, lng, label } — no placeId
    // and the human-readable text lives in `label`, not `name`. Map both
    // possible shapes so entries saved by the old and new code both work.
    // Strip the address tail so the dropdown shows only the venue name.
    (cu && Array.isArray(cu.preferredLocations) ? cu.preferredLocations : [])
      .forEach(function(p) {
        if (!p) return;
        var cleaned = _cleanVenueName(p.name || p.label || '');
        push(p.placeId, cleaned || p.label, p.lat, (p.lng != null ? p.lng : p.lon));
      });
    var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
    tournaments.forEach(function(t) {
      if (!t) return;
      if (!t.venuePlaceId && !t.venue) return;
      push(t.venuePlaceId, t.venue, t.venueLat, t.venueLon);
    });
    return list;
  }

  // Sports derived from user tournament history + sensible defaults.
  function _sportOptions() {
    var defaults = ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel'];
    var seen = {};
    defaults.forEach(function(s) { seen[s] = true; });
    var out = defaults.slice();
    var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
    tournaments.forEach(function(t) {
      var s = window.PresenceDB.normalizeSport(t && t.sport);
      if (s && !seen[s]) { seen[s] = true; out.push(s); }
    });
    return out;
  }

  // v0.17.2: delega ao helper global em store.js (auditoria L4.3).
  function _cleanVenueName(label) { return window._cleanVenueName(label); }

  function _defaultVenue() {
    // Profile preference takes priority — user explicitly saved these.
    var cu = window.AppStore && window.AppStore.currentUser;
    var prefLocs = (cu && Array.isArray(cu.preferredLocations)) ? cu.preferredLocations : [];
    if (prefLocs.length > 0) {
      var p = prefLocs[0];
      var humanName = _cleanVenueName(p.name || p.label || '');
      return {
        placeId: window.PresenceDB.venueKey(p.placeId || '', humanName || p.label || ''),
        name: humanName || p.placeId || '',
        lat: p.lat || null,
        lon: (p.lng != null ? p.lng : p.lon) || null
      };
    }
    var venues = _venuesFromTournaments();
    if (venues.length > 0) return venues[0];
    return null;
  }

  function _defaultSport() {
    var cu = window.AppStore && window.AppStore.currentUser;
    var pref = cu && cu.preferredSports;
    if (pref) {
      var first = String(pref).split(/[,;]/)[0];
      var norm = window.PresenceDB.normalizeSport(first);
      if (norm) return norm;
    }
    var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
    for (var i = 0; i < tournaments.length; i++) {
      var s = window.PresenceDB.normalizeSport(tournaments[i] && tournaments[i].sport);
      if (s) return s;
    }
    return 'Beach Tennis';
  }

  // All sports the user marked as preferred in profile, normalized. Used to
  // seed the multi-select pills so someone who plays Padel + Beach Tennis at
  // the same clube sees both in one view.
  function _defaultSports() {
    var cu = window.AppStore && window.AppStore.currentUser;
    var out = [];
    var seen = {};
    var push = function(s) {
      var norm = window.PresenceDB.normalizeSport(s);
      if (norm && !seen[norm]) { seen[norm] = true; out.push(norm); }
    };
    if (cu && cu.preferredSports) {
      String(cu.preferredSports).split(/[,;]/).forEach(push);
    }
    if (out.length === 0) {
      var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
      tournaments.forEach(function(t) { if (t) push(t.sport); });
    }
    if (out.length === 0) out = ['Beach Tennis'];
    return out;
  }

  // Read prefill set by dashboard/tournaments page, if any.
  function _readPrefill() {
    try {
      var raw = sessionStorage.getItem('_presencePrefill');
      if (!raw) return null;
      sessionStorage.removeItem('_presencePrefill');
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  // ── State ─────────────────────────────────────────────────────────────────

  var state = {
    venue: null,      // {placeId, name, lat, lon}
    sports: [],       // Selected modalities — todas gravadas no doc; queries usam array-contains
    dayKey: '',
    presences: [],    // from PresenceDB (filtered visibility)
    tournaments: [],  // same venue+sport+day, treated as scheduled "presences"
    myActive: [],     // my own active presences
    friendsUids: {},  // { uid: true }
    loading: true
  };

  // ── Rendering ─────────────────────────────────────────────────────────────

  function render(container) {
    var back = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({ href: '#dashboard', label: 'Voltar' })
      : '';

    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) {
      container.innerHTML = back +
        '<div class="card" style="max-width:600px;margin:2rem auto;padding:2rem;text-align:center;">' +
          '<h2 style="margin:0 0 1rem 0;">Presença no local</h2>' +
          '<p style="color:var(--text-muted);margin-bottom:1rem;">Faça login para ver quem está no local e registrar sua presença.</p>' +
          '<button class="btn btn-primary" onclick="if(typeof openModal===\'function\')openModal(\'modal-login\')">Entrar</button>' +
        '</div>';
      return;
    }

    // Build friends set
    state.friendsUids = {};
    var friends = (cu.friends || []);
    friends.forEach(function(u) { state.friendsUids[u] = true; });

    container.innerHTML = back +
      '<div style="max-width:820px;margin:0 auto;padding:0 4px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem;flex-wrap:wrap;">' +
          '<h2 style="margin:0;font-size:1.45rem;font-weight:800;color:var(--text-bright);flex:1;">📍 Presença no local</h2>' +
        '</div>' +
        '<div id="presence-picker" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:14px;margin-bottom:14px;"></div>' +
        '<div id="presence-myactive" style="margin-bottom:14px;"></div>' +
        '<div id="presence-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;"></div>' +
        '<div id="presence-chart" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:14px;margin-bottom:14px;overflow:hidden;"></div>' +
        '<div id="presence-now" style="margin-bottom:14px;"></div>' +
        '<div id="presence-upcoming" style="margin-bottom:1.5rem;"></div>' +
      '</div>';

    renderPicker();
    renderActions();
    refreshData();
  }

  function renderPicker() {
    var picker = document.getElementById('presence-picker');
    if (!picker) return;
    var venues = _venuesFromTournaments();
    var sports = _sportOptions();

    var venueOpts = '';
    venues.forEach(function(v) {
      var sel = (state.venue && state.venue.placeId === v.placeId) ? ' selected' : '';
      venueOpts += '<option value="' + _safe(v.placeId) + '"' + sel + '>' + _safe(v.name) + '</option>';
    });
    if (venues.length === 0) {
      venueOpts = '<option value="">— nenhum local conhecido —</option>';
    }
    venueOpts += '<option value="__custom__">✏️ Digitar outro local…</option>';
    // When the dropdown is empty (no preferredLocations AND no tournament
    // venues) we surface a CTA pointing straight to the profile so the user
    // can add places — without it the "— nenhum —" option feels like a dead end.
    var emptyHint = (venues.length === 0)
      ? '<div style="margin-top:8px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.3);border-radius:10px;padding:10px 12px;font-size:0.78rem;color:var(--text-bright);">' +
          '<span style="margin-right:4px;">💡</span>Adicione seus locais de jogo em <b>Perfil → Locais de preferência</b> e eles aparecerão aqui automaticamente. ' +
          '<a href="#" onclick="event.preventDefault(); if(typeof window._showProfileModal===\'function\')window._showProfileModal(); else if(typeof openModal===\'function\')openModal(\'modal-profile\');" style="color:#a5b4fc;font-weight:700;text-decoration:underline;">Abrir perfil</a>' +
        '</div>'
      : '';

    var sportsActive = state.sports || [];
    var sportsPills = sports.map(function(s) {
      var active = sportsActive.indexOf(s) !== -1;
      var style = 'padding:6px 12px;border-radius:999px;font-size:0.75rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;font-weight:' + (active ? '700' : '500') + ';' +
        'border:' + (active ? '2px solid #fbbf24' : '1.5px solid var(--border-color)') + ';' +
        'background:' + (active ? 'rgba(251,191,36,0.18)' : 'transparent') + ';' +
        'color:' + (active ? '#fbbf24' : 'var(--text-muted)') + ';';
      return '<button type="button" onclick="window._presenceToggleSport(\'' + _safe(s) + '\')" style="' + style + '">' + _safe(s) + '</button>';
    }).join('');

    var today = new Date();
    var dateLabel = String(today.getDate()).padStart(2,'0') + '/' + String(today.getMonth()+1).padStart(2,'0') + '/' + today.getFullYear();

    picker.innerHTML =
      '<div>' +
        '<label style="display:block;font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;">Local</label>' +
        '<select id="presence-venue-select" onchange="window._presenceOnVenueChange(this.value)" style="width:100%;padding:8px 10px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.9rem;">' +
          venueOpts +
        '</select>' +
        '<input id="presence-venue-custom" type="text" placeholder="Nome do local" style="display:none;width:100%;padding:8px 10px;margin-top:6px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.9rem;" oninput="window._presenceOnCustomVenue(this.value)">' +
        emptyHint +
      '</div>' +
      '<div style="margin-top:10px;">' +
        '<label style="display:block;font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;">Modalidades <span style="font-weight:400;">(selecione uma ou mais)</span></label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + sportsPills + '</div>' +
      '</div>' +
      '<div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted);">Hoje, ' + _safe(dateLabel) + ' · avatares = amigos · números = outros usuários</div>';
  }

  function renderActions() {
    var box = document.getElementById('presence-actions');
    if (!box) return;
    var hasVenue = !!(state.venue && state.venue.placeId);
    var hasSport = Array.isArray(state.sports) && state.sports.length > 0;
    var disabled = (!hasVenue || !hasSport) ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
    box.innerHTML =
      '<button class="btn btn-success hover-lift" ' + disabled + ' onclick="window._spinButton(this, \'Registrando...\'); window._presenceCheckIn()" style="flex:1;min-width:140px;padding:10px 14px;font-weight:700;">📍 Estou aqui agora</button>' +
      '<button class="btn btn-indigo hover-lift" ' + disabled + ' onclick="window._presencePlanDialog()" style="flex:1;min-width:140px;padding:10px 14px;font-weight:700;">🗓️ Planejar ida</button>';
  }

  function renderMyActive() {
    var box = document.getElementById('presence-myactive');
    if (!box) return;
    var selSports = (state.sports || []).map(window.PresenceDB.normalizeSport);
    var selSet = {}; selSports.forEach(function(s) { selSet[s] = true; });
    // Match if ANY of the presence's sports overlaps with ANY selected sport —
    // with multi-sport presences the primary `sport` alone isn't enough.
    var here = state.myActive.filter(function(p) {
      if (p.placeId !== (state.venue && state.venue.placeId)) return false;
      var pSports = Array.isArray(p.sports) ? p.sports : [];
      if (selSports.length === 0) return true;
      return pSports.some(function(s) { return selSet[window.PresenceDB.normalizeSport(s)]; });
    });
    if (here.length === 0) { box.innerHTML = ''; return; }
    var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    here.forEach(function(p) {
      var label;
      if (p.type === 'checkin') {
        var leftMs = p.endsAt - Date.now();
        var leftMin = Math.max(0, Math.round(leftMs / 60000));
        label = '✅ Você está aqui · expira em ' + leftMin + ' min';
      } else if (p.openEnded) {
        // Open-ended plan: show only the start, since the user explicitly
        // didn't commit to an end time.
        label = '🗓️ Você planejou estar aqui a partir de ' + _fmtTime(p.startsAt);
      } else {
        label = '🗓️ Você planejou estar aqui ' + _fmtTime(p.startsAt) + '–' + _fmtTime(p.endsAt);
      }
      // Calendar button só pra 'planned' — check-in é "agora", não faz sentido
      // botar na agenda evento já em andamento. Mesmo padrão que torneios
      // (v0.15.16): picker com Google/Outlook/.ics.
      var calBtn = (p.type === 'planned')
        ? '<button class="btn btn-sm" onclick="window._presenceAddToCalendar(\'' + _safe(p._id) + '\')" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.35);color:#a5b4fc;padding:4px 10px;font-size:0.75rem;font-weight:600;" title="Adicionar à agenda">📅</button>'
        : '';
      html += '<div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<span style="flex:1;min-width:160px;color:var(--text-bright);font-size:0.88rem;">' + _safe(label) + '</span>' +
        calBtn +
        '<button class="btn btn-sm" onclick="window._presenceCancel(\'' + _safe(p._id) + '\')" style="background:transparent;color:var(--danger-color);border:1px solid var(--danger-color);padding:4px 10px;font-size:0.75rem;">Cancelar</button>' +
      '</div>';
    });
    html += '</div>';
    box.innerHTML = html;
  }

  // Calendar export para uma presença planejada — reaproveita o picker
  // criado em tournaments-sharing.js (v0.15.16) via o pattern de preencher
  // window._calPendingPayload + abrir o overlay #cal-picker-overlay. A
  // função aqui constrói o payload específico de presença (título com
  // emoji 📍, local, descrição apontando pra #presence) e delega o picker.
  window._presenceAddToCalendar = function(presenceId) {
    var p = state.myActive.find(function(x) { return x._id === presenceId; });
    if (!p) p = state.presences.find(function(x) { return x._id === presenceId; });
    if (!p || p.type !== 'planned') return;
    var start = new Date(p.startsAt);
    if (isNaN(start.getTime())) return;
    var end;
    if (p.openEnded) {
      // Sem hora de saída fixa — bota 2h como duração padrão pra agenda
      // não virar evento de 12h (cap interno do presence-db).
      end = new Date(p.startsAt + 2 * 3600 * 1000);
    } else {
      end = new Date(p.endsAt);
      if (isNaN(end.getTime())) end = new Date(p.startsAt + 2 * 3600 * 1000);
    }
    var base = window.SCOREPLACE_URL || 'https://scoreplace.app';
    var url = base + '/#venues/' + encodeURIComponent(p.placeId);
    var pSportsLabel = (Array.isArray(p.sports) && p.sports.length) ? p.sports.join(' / ') : '';
    var title = '📍 ' + (p.venueName || 'Local') + ' · ' + pSportsLabel;
    var desc = 'Presença planejada no scoreplace.app\n\n' +
               'Modalidade: ' + (pSportsLabel || '—') + '\n' +
               'Local: ' + (p.venueName || '—') + '\n\n' +
               'Ver movimento do local:\n' + url;
    // Monta o payload no mesmo formato que tournaments-sharing espera pra
    // que window._calPick reuse os helpers _googleCalendarUrl / _outlookCalendarUrl
    // / _icsDownload sem duplicação.
    window._calPendingPayload = {
      title: title,
      start: start,
      end: end,
      location: p.venueName || '',
      description: desc,
      url: url
    };
    var safeName = (p.venueName || 'presenca').replace(/[^a-zA-Z0-9À-ü\s-]/g, '').replace(/\s+/g, '_');
    window._calPendingFilename = 'presenca_' + safeName + '.ics';
    // Abre o picker overlay. Se a função utilitária existir (carregada após
    // tournaments-sharing.js), reutiliza; senão, faz fallback direto no
    // Google Calendar.
    if (typeof window._tournamentAddToCalendar !== 'function') {
      // Shouldn't happen em produção, mas defende contra carregamento parcial.
      try {
        var params = new URLSearchParams({
          action: 'TEMPLATE',
          text: title,
          dates: start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z/' + end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z',
          details: desc,
          location: p.venueName || ''
        });
        window.open('https://calendar.google.com/calendar/render?' + params.toString(), '_blank', 'noopener');
      } catch(e) {}
      return;
    }
    // Renderiza o overlay manualmente — o mesmo que _tournamentAddToCalendar
    // renderiza. Copiamos o markup aqui pra evitar chamar a função do
    // torneio com um id bobo que não encontraria.
    var prev = document.getElementById('cal-picker-overlay');
    if (prev) prev.remove();
    var overlay = document.createElement('div');
    overlay.id = 'cal-picker-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10020;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:22px;max-width:440px;width:100%;text-align:center;">' +
        '<div style="font-size:2rem;margin-bottom:8px;">📅</div>' +
        '<div style="font-weight:800;color:var(--text-bright);font-size:1.05rem;margin-bottom:6px;">Adicionar à agenda</div>' +
        '<div style="color:var(--text-muted);font-size:0.82rem;margin-bottom:16px;">' + _safe(title) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<button class="btn hover-lift" onclick="window._calPick(\'google\')" style="background:#4285f4;color:#fff;border:none;font-weight:700;padding:10px 16px;border-radius:10px;">🟦 Google Calendar</button>' +
          '<button class="btn hover-lift" onclick="window._calPick(\'outlook\')" style="background:#0078d4;color:#fff;border:none;font-weight:700;padding:10px 16px;border-radius:10px;">🔷 Outlook.com</button>' +
          '<button class="btn hover-lift" onclick="window._calPick(\'ics\')" style="background:#6366f1;color:#fff;border:none;font-weight:700;padding:10px 16px;border-radius:10px;">📄 Apple/Outlook (.ics)</button>' +
        '</div>' +
        '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'cal-picker-overlay\').remove()" style="margin-top:14px;">Cancelar</button>' +
      '</div>';
    overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  };

  // Classify a presence as "friend" / "me" / "other" given the current user.
  function _classify(p) {
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && (cu.uid || '');
    if (myUid && p.uid === myUid) return 'me';
    if (p.uid && state.friendsUids[p.uid]) return 'friend';
    return 'other';
  }

  // Convert a tournament row into "virtual presences" for counting purposes:
  // one entry per distinct participant anchored at the tournament start time.
  // We only show these in the chart buckets as aggregated counts (the
  // "Agora"/"Upcoming" lists still use real presences for friend avatars).
  function _tournamentOccupancy(t, dayKeyStr) {
    var out = [];
    if (!t || !t.startDate) return out;
    var start = new Date(t.startDate);
    if (isNaN(start.getTime())) return out;
    if (window.PresenceDB.dayKey(start) !== dayKeyStr) return out;
    var endMs = start.getTime() + (3 * 60 * 60 * 1000); // default 3h block
    if (t.endDate) {
      var end = new Date(t.endDate);
      if (!isNaN(end.getTime()) && end.getTime() > start.getTime()) endMs = end.getTime();
    }
    var parts = Array.isArray(t.participants) ? t.participants : [];
    var count = Math.max(parts.length, 1);
    for (var i = 0; i < count; i++) {
      var p = parts[i] || {};
      out.push({
        _virtual: true,
        _tournamentId: t.id,
        _tournamentName: t.name || 'Torneio',
        uid: p.uid || null,
        email_lower: (p.email || '').toLowerCase(),
        displayName: p.displayName || p.name || '',
        photoURL: p.photoURL || '',
        startsAt: start.getTime(),
        endsAt: endMs,
        visibility: 'public',
        type: 'tournament'
      });
    }
    return out;
  }

  // Janela de horas centrada na hora atual. Permite valores fora de 0–23
  // (ex: 10pm atual → slot 02h de amanhã aparece como 2 sem dados). Para
  // comparar com presenças, normalizamos via (h+24)%24 ao indexar buckets.
  function _currentWindow() {
    var nowH = new Date().getHours();
    var half = Math.floor(WINDOW_HOURS / 2);
    var out = [];
    for (var i = -half; i <= WINDOW_HOURS - half - 1; i++) out.push(nowH + i);
    return { hours: out, nowH: nowH };
  }

  function renderChart() {
    var box = document.getElementById('presence-chart');
    if (!box) return;

    var win = _currentWindow();

    // Buckets 0..23 — indexamos por hora real do doc (presences são sempre
    // de hoje pela query). Horas fora do dia no window ficam como 0.
    var buckets = {};
    for (var h = 0; h < 24; h++) buckets[h] = { friends: 0, me: 0, others: 0 };

    var allPresences = state.presences.slice();
    // Add tournament-derived occupancy
    state.tournaments.forEach(function(t) {
      _tournamentOccupancy(t, state.dayKey).forEach(function(p) { allPresences.push(p); });
    });

    allPresences.forEach(function(p) {
      var startH = _hourOf(p.startsAt);
      var endH = _hourOf(p.endsAt);
      if (startH == null || endH == null) return;
      var klass = _classify(p);
      for (var h = startH; h <= endH; h++) {
        if (!buckets[h]) continue;
        if (klass === 'me') buckets[h].me += 1;
        else if (klass === 'friend') buckets[h].friends += 1;
        else buckets[h].others += 1;
      }
    });

    // Max só olha os slots da janela — mantém proporção visual estável.
    var maxPerBucket = 1;
    win.hours.forEach(function(slot) {
      if (slot < 0 || slot > 23) return;
      var b = buckets[slot];
      var total = b.friends + b.me + b.others;
      if (total > maxPerBucket) maxPerBucket = total;
    });

    var bars = '';
    win.hours.forEach(function(slot) {
      var inDay = slot >= 0 && slot <= 23;
      var labelH = ((slot % 24) + 24) % 24;
      var b = inDay ? buckets[slot] : { friends: 0, me: 0, others: 0 };
      var total = b.friends + b.me + b.others;
      var totalPct = total > 0 ? Math.round((total / maxPerBucket) * 100) : 0;
      var friendsPct = total > 0 ? Math.round((b.friends + b.me) / total * 100) : 0;
      var isNow = slot === win.nowH;
      var labelColor = isNow ? 'var(--primary-color)' : (inDay ? 'var(--text-muted)' : 'rgba(107,114,128,0.5)');
      bars += '<div title="' + labelH + 'h: ' + (b.friends + b.me) + ' amigo(s) · ' + b.others + ' outro(s)" style="flex:0 0 28px;display:flex;flex-direction:column;align-items:center;gap:2px;' + (isNow ? 'transform:scale(1.05);' : '') + '">' +
        '<div style="height:90px;width:20px;display:flex;flex-direction:column-reverse;border-radius:4px;background:' + (isNow ? 'rgba(99,102,241,0.1)' : 'rgba(150,150,150,0.08)') + ';overflow:hidden;position:relative;' + (isNow ? 'outline:2px solid rgba(99,102,241,0.4);' : '') + '">' +
          (total > 0
            ? '<div style="height:' + totalPct + '%;width:100%;display:flex;flex-direction:column-reverse;">' +
                '<div style="flex:' + (100 - friendsPct) + ';background:#6b7280;"></div>' +
                '<div style="flex:' + friendsPct + ';background:#fbbf24;"></div>' +
              '</div>'
            : '') +
        '</div>' +
        '<span style="font-size:0.65rem;color:' + labelColor + ';font-weight:' + (isNow ? 700 : 500) + ';">' + labelH + '</span>' +
      '</div>';
    });

    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">' +
        '<span style="font-weight:700;color:var(--text-bright);font-size:0.95rem;">Movimento hoje</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-muted);"><span style="width:10px;height:10px;background:#fbbf24;border-radius:2px;"></span> amigos</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-muted);"><span style="width:10px;height:10px;background:#6b7280;border-radius:2px;"></span> outros</span>' +
      '</div>' +
      '<div style="display:flex;gap:2px;overflow-x:auto;padding-bottom:4px;justify-content:space-between;">' + bars + '</div>';
  }

  function renderNow() {
    var box = document.getElementById('presence-now');
    if (!box) return;
    var now = Date.now();
    var active = state.presences.filter(function(p) {
      return p.startsAt <= now && p.endsAt > now && p.type === 'checkin';
    });
    // Also fold active tournament occupancies
    state.tournaments.forEach(function(t) {
      _tournamentOccupancy(t, state.dayKey).forEach(function(p) {
        if (p.startsAt <= now && p.endsAt > now) active.push(p);
      });
    });

    if (active.length === 0) {
      box.innerHTML =
        '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:20px;text-align:center;color:var(--text-muted);">' +
          '<div style="font-size:1.8rem;margin-bottom:6px;">🏖️</div>' +
          '<div style="font-size:0.92rem;">Ninguém registrou presença agora.</div>' +
          '<div style="font-size:0.78rem;margin-top:4px;">Se você estiver no local, registre para avisar seus amigos.</div>' +
        '</div>';
      return;
    }

    var friendsHtml = [];
    var seenFriends = {};
    var otherCount = 0;
    active.forEach(function(p) {
      var klass = _classify(p);
      if (klass === 'me' || klass === 'friend') {
        var key = p.uid || (p.displayName + '|' + p.startsAt);
        if (seenFriends[key]) return;
        seenFriends[key] = true;
        var name = p.displayName || 'Amigo';
        var subtitle;
        if (p.type === 'tournament') subtitle = '🏆 ' + (p._tournamentName || 'torneio');
        else {
          var mins = Math.max(0, Math.round((Date.now() - p.startsAt) / 60000));
          subtitle = 'há ' + mins + ' min';
        }
        var avatar = p.photoURL
          ? '<img src="' + _safe(p.photoURL) + '" alt="" style="width:44px;height:44px;min-width:44px;flex-shrink:0;border-radius:50%;object-fit:cover;border:2px solid ' + (klass === 'me' ? '#10b981' : '#fbbf24') + ';">'
          : '<div style="width:44px;height:44px;min-width:44px;flex-shrink:0;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;border:2px solid ' + (klass === 'me' ? '#10b981' : '#fbbf24') + ';">' + _safe(_initials(name)) + '</div>';
        // Prefix sports icons so friends see which modalities this person is
        // available to play right now. Same _sportsIcons helper used in
        // Próximas horas — keeps the two sections visually consistent.
        var nowSports = Array.isArray(p.sports) ? p.sports : [];
        var nowIcons = _sportsIcons(nowSports);
        var iconsHtml = nowIcons
          ? '<span title="' + _safe(nowSports.join(', ')) + '" style="font-size:1rem;line-height:1;flex-shrink:0;">' + nowIcons + '</span>'
          : '';
        friendsHtml.push(
          '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-darker);border-radius:10px;">' +
            iconsHtml +
            avatar +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:600;font-size:0.88rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _safe(name) + (klass === 'me' ? ' (você)' : '') + '</div>' +
              '<div style="font-size:0.72rem;color:var(--text-muted);">' + _safe(subtitle) + '</div>' +
            '</div>' +
          '</div>'
        );
      } else if (p.visibility === 'public' || p.type === 'tournament') {
        otherCount += 1;
      }
    });

    var othersPill = otherCount > 0
      ? '<div style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(107,114,128,0.15);border:1px solid rgba(107,114,128,0.3);border-radius:999px;color:var(--text-bright);font-weight:600;font-size:0.85rem;">👥 +' + otherCount + ' outro' + (otherCount === 1 ? '' : 's') + '</div>'
      : '';

    var friendsGrid = friendsHtml.length > 0
      ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:10px;">' + friendsHtml.join('') + '</div>'
      : '<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:10px;">Nenhum amigo registrado agora.</div>';

    box.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:14px;">' +
        '<div style="font-weight:700;color:var(--text-bright);margin-bottom:10px;font-size:0.95rem;display:flex;align-items:center;gap:6px;">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>' +
          'Agora no local' +
        '</div>' +
        friendsGrid +
        othersPill +
      '</div>';
  }

  function renderUpcoming() {
    var box = document.getElementById('presence-upcoming');
    if (!box) return;
    var now = Date.now();
    var rows = [];

    // Planned presences that haven't started yet
    state.presences.forEach(function(p) {
      if (p.type === 'planned' && p.startsAt > now) rows.push(p);
    });
    // Tournament occupancies starting later today
    state.tournaments.forEach(function(t) {
      _tournamentOccupancy(t, state.dayKey).forEach(function(p) {
        if (p.startsAt > now) rows.push(p);
      });
    });

    if (rows.length === 0) { box.innerHTML = ''; return; }

    // Group by hour bucket
    var groups = {};
    rows.forEach(function(p) {
      var h = _hourOf(p.startsAt);
      if (!groups[h]) groups[h] = [];
      groups[h].push(p);
    });
    var hours = Object.keys(groups).map(Number).sort(function(a,b) { return a - b; });

    var html =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:14px;">' +
        '<div style="font-weight:700;color:var(--text-bright);margin-bottom:10px;font-size:0.95rem;">🗓️ Próximas horas</div>';

    hours.forEach(function(h) {
      var list = groups[h];
      var friendsSet = {};
      var friendChips = [];
      var otherCount = 0;
      var tournamentBadge = '';
      list.forEach(function(p) {
        if (p.type === 'tournament' && !tournamentBadge) {
          tournamentBadge = '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;background:rgba(251,191,36,0.18);border:1px solid rgba(251,191,36,0.35);color:#fbbf24;padding:2px 8px;border-radius:999px;cursor:pointer;" onclick="window.location.hash=\'#tournaments/' + _safe(p._tournamentId) + '\'">🏆 ' + _safe(p._tournamentName) + '</span>';
        }
        var klass = _classify(p);
        if (klass === 'me' || klass === 'friend') {
          var key = p.uid || p.displayName;
          if (friendsSet[key]) return;
          friendsSet[key] = true;
          var name = klass === 'me' ? 'Você' : (p.displayName || 'Amigo');
          var borderColor = klass === 'me' ? '#10b981' : '#fbbf24';
          // flex-shrink:0 keeps the circle perfectly round inside the flex
          // container — without it, tight rows squish the image horizontally.
          var avatar = p.photoURL
            ? '<img src="' + _safe(p.photoURL) + '" alt="" style="width:28px;height:28px;min-width:28px;flex-shrink:0;border-radius:50%;object-fit:cover;border:2px solid ' + borderColor + ';">'
            : '<div style="width:28px;height:28px;min-width:28px;flex-shrink:0;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.72rem;border:2px solid ' + borderColor + ';">' + _safe(_initials(name)) + '</div>';
          // Chip: [sport icons] avatar [name]. Icons come before the avatar so
          // friends know at a glance which modalities this person will play.
          var chipSports = Array.isArray(p.sports) ? p.sports : [];
          var iconStr = _sportsIcons(chipSports);
          friendChips.push(
            '<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);border-radius:999px;padding:3px 10px 3px 6px;max-width:100%;min-width:0;">' +
              (iconStr ? '<span title="' + _safe(chipSports.join(', ')) + '" style="font-size:0.9rem;line-height:1;flex-shrink:0;">' + iconStr + '</span>' : '') +
              avatar +
              '<span style="font-size:0.78rem;color:var(--text-bright);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _safe(name) + '</span>' +
            '</div>'
          );
        } else if (p.visibility === 'public' || p.type === 'tournament') {
          otherCount += 1;
        }
      });
      html +=
        '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border-color);">' +
          '<div style="min-width:40px;font-weight:700;color:var(--text-bright);font-size:0.9rem;flex-shrink:0;">' + h + 'h</div>' +
          '<div style="flex:1;display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0;">' +
            friendChips.join('') +
            (otherCount > 0 ? '<span style="background:rgba(107,114,128,0.18);border:1px solid rgba(107,114,128,0.3);color:var(--text-bright);font-size:0.75rem;font-weight:600;padding:2px 10px;border-radius:999px;">+' + otherCount + '</span>' : '') +
            tournamentBadge +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    box.innerHTML = html;
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  // Set of docIds cancelled locally in this session. Defends against two
  // edge cases that were letting cancelled presences reappear in "Agora no
  // local": (a) a real-time snapshot arriving right before the server write
  // lands still has cancelled=false; (b) optimistic-write rollback if the
  // server ever rejects. Any id here is treated as cancelled by every
  // render/filter path, no matter what the snapshot says. Entries expire
  // after 60s — enough for the write to settle — so the set stays tiny.
  var _cancelledIds = {};
  function _markCancelled(id) {
    if (!id) return;
    _cancelledIds[id] = Date.now();
    setTimeout(function() { delete _cancelledIds[id]; }, 60000);
  }
  function _isCancelled(id) { return !!_cancelledIds[id]; }

  // Tear down any previous Firestore listener — called before attaching a
  // new one and when the user navigates away.
  function _teardownListener() {
    try {
      if (typeof window._presenceUnsubscribe === 'function') {
        window._presenceUnsubscribe();
      }
    } catch (e) {}
    window._presenceUnsubscribe = null;
    if (_chartTickInterval) { clearInterval(_chartTickInterval); _chartTickInterval = null; }
  }

  // Re-render the chart every minute so the window keeps the current hour
  // centered — as time passes, the whole bar strip slides right to reveal
  // the next hour and drop the oldest.
  function _startChartAutoTick() {
    if (_chartTickInterval) return;
    _chartTickInterval = setInterval(function() {
      if (!document.getElementById('presence-chart')) {
        clearInterval(_chartTickInterval);
        _chartTickInterval = null;
        return;
      }
      renderChart();
    }, 60 * 1000);
  }

  // Attach a real-time listener for the venue/day — one snapshot whenever
  // any presence there is created/updated/cancelled. Filters by sport and
  // visibility client-side. Without this, friends' check-ins only showed up
  // after the user reloaded.
  function _attachListener() {
    _teardownListener();
    var db = window.FirestoreDB && window.FirestoreDB.db;
    if (!db || !state.venue || !state.venue.placeId || !state.dayKey) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) return;
    var myUid = cu.uid;
    try {
      window._presenceUnsubscribe = db.collection('presences')
        .where('placeId', '==', state.venue.placeId)
        .where('dayKey', '==', state.dayKey)
        .onSnapshot(function(snap) {
          var list = [];
          snap.forEach(function(doc) {
            var d = doc.data();
            if (!d || d.cancelled) return;
            if (_isCancelled(doc.id)) return; // just cancelled locally, snapshot may still be stale
            d._id = doc.id;
            list.push(d);
          });
          // Apply sport filter (match any of state.sports) and visibility.
          var sel = (state.sports || []).map(window.PresenceDB.normalizeSport);
          var selSet = {}; sel.forEach(function(s) { selSet[s] = true; });
          var filtered = list.filter(function(p) {
            var docSports = Array.isArray(p.sports) ? p.sports : [];
            var sportMatch = sel.length === 0 || docSports.some(function(s) { return selSet[window.PresenceDB.normalizeSport(s)]; });
            if (!sportMatch) return false;
            if (!p.uid) return p.visibility === 'public';
            if (p.uid === myUid) return true;
            if (state.friendsUids[p.uid]) return true;
            return p.visibility === 'public';
          });
          state.presences = filtered;
          // Also refresh state.myActive from the same snapshot so the
          // "Você está aqui · Cancelar" banner persists for the whole stay.
          // Previously we only loaded it once on mount and it could fall out
          // of sync with real-time updates.
          var nowTs = Date.now();
          state.myActive = list.filter(function(p) {
            return p.uid === myUid && p.endsAt > nowTs;
          });
          renderMyActive();
          renderChart();
          renderNow();
          renderUpcoming();
        }, function(err) {
          window._warn('Presence listener error:', err && err.message);
        });
    } catch (e) {
      window._warn('Failed to attach presence listener:', e);
    }
  }

  function refreshData() {
    var cu = window.AppStore && window.AppStore.currentUser;
    // When muted, we don't fetch or display anyone's presences — consistent
    // with "não informar e não receber" semantics of the profile toggle.
    if (_muted(cu)) {
      state.presences = [];
      state.tournaments = [];
      state.myActive = [];
      renderChart();
      renderMyActive();
      var now = document.getElementById('presence-now');
      if (now) now.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:16px;text-align:center;color:var(--text-muted);font-size:0.88rem;">🔕 Presença silenciada no seu perfil. Desative para ver e registrar presenças.</div>';
      var up = document.getElementById('presence-upcoming');
      if (up) up.innerHTML = '';
      return;
    }
    var hasSports = Array.isArray(state.sports) && state.sports.length > 0;
    if (!state.venue || !state.venue.placeId || !hasSports) {
      // Can't query without both — just render empty chart
      _teardownListener();
      state.presences = [];
      state.tournaments = [];
      state.myActive = [];
      renderChart();
      renderNow();
      renderUpcoming();
      renderMyActive();
      return;
    }
    // Subscribe to real-time updates so friends' new presences appear
    // without the user having to reload.
    _attachListener();
    _startChartAutoTick();
    state.loading = true;
    state.dayKey = window.PresenceDB.dayKey(new Date());
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;

    // Presences — one call per sport, merge results. Small N (1–8 modalities);
    // Firestore costs scale linearly with selected sports, which is fine.
    var selSports = state.sports.map(window.PresenceDB.normalizeSport);
    Promise.all(selSports.map(function(s) {
      return window.PresenceDB.loadForVenueSportDay(state.venue.placeId, s, state.dayKey);
    })).then(function(pages) {
      var merged = [];
      var seen = {};
      pages.forEach(function(list) {
        list.forEach(function(p) {
          if (!p || !p._id || seen[p._id]) return;
          seen[p._id] = true;
          merged.push(p);
        });
      });
      // Visibility filter: drop "friends"-scoped presences from non-friends.
      state.presences = merged.filter(function(p) {
        if (!p.uid) return p.visibility === 'public';
        if (p.uid === myUid) return true;
        if (state.friendsUids[p.uid]) return true;
        return p.visibility === 'public';
      });
      renderChart();
      renderNow();
      renderUpcoming();
    });

    // Tournaments at same venue + ANY of the selected sports + day.
    var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
    var selSportSet = {}; selSports.forEach(function(s) { selSportSet[s] = true; });
    state.tournaments = tournaments.filter(function(t) {
      if (!t) return false;
      var tKey = window.PresenceDB.venueKey(t.venuePlaceId, t.venue);
      if (tKey !== state.venue.placeId) return false;
      if (!selSportSet[window.PresenceDB.normalizeSport(t.sport)]) return false;
      if (!t.startDate) return false;
      return window.PresenceDB.dayKey(new Date(t.startDate)) === state.dayKey;
    });
    renderChart();
    renderUpcoming();

    // My active presences (for banner + cancel action)
    if (myUid) {
      window.PresenceDB.loadMyActive(myUid).then(function(list) {
        state.myActive = list;
        renderMyActive();
      });
    }
  }

  // ── Event handlers (exposed globally) ─────────────────────────────────────

  window._presenceOnVenueChange = function(value) {
    var custom = document.getElementById('presence-venue-custom');
    if (value === '__custom__') {
      if (custom) { custom.style.display = 'block'; custom.focus(); }
      state.venue = { placeId: '', name: '', lat: null, lon: null };
      renderActions();
      refreshData();
      return;
    }
    if (custom) custom.style.display = 'none';
    var venues = _venuesFromTournaments();
    var match = venues.filter(function(v) { return v.placeId === value; })[0];
    state.venue = match || null;
    renderActions();
    refreshData();
  };

  window._presenceOnCustomVenue = function(value) {
    var name = String(value || '').trim();
    if (!name) { state.venue = null; renderActions(); return; }
    state.venue = {
      placeId: window.PresenceDB.venueKey('', name),
      name: name, lat: null, lon: null
    };
    renderActions();
    // Debounce the data refresh so we don't query on every keystroke
    clearTimeout(window._presenceCustomDebounce);
    window._presenceCustomDebounce = setTimeout(refreshData, 400);
  };

  window._presenceOnSportChange = function(value) {
    state.sports = value ? [value] : [];
    renderActions();
    refreshData();
  };

  // Multi-select: toggle a sport pill. When all pills get turned off we fall
  // back to the first preferred sport so queries have something to go on.
  window._presenceToggleSport = function(sport) {
    if (!sport) return;
    if (!Array.isArray(state.sports)) state.sports = [];
    var idx = state.sports.indexOf(sport);
    if (idx === -1) state.sports.push(sport);
    else state.sports.splice(idx, 1);
    if (state.sports.length === 0) {
      // Guard: at least one must stay selected, otherwise writes have no target.
      state.sports = [sport];
    }
    renderPicker();
    renderActions();
    refreshData();
  };

  // Is the current user under an active mute?
  function _muted(cu) {
    if (!cu) return false;
    var until = Number(cu.presenceMuteUntil || 0);
    return until > Date.now();
  }

  window._presenceCheckIn = function() {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !state.venue) return;
    if (cu.presenceVisibility === 'off') {
      if (window.showNotification) window.showNotification('Presença desligada no seu perfil. Ative em Amigos ou Todos para registrar.', 'info');
      return;
    }
    if (_muted(cu)) {
      if (window.showNotification) window.showNotification('Presença silenciada. Desative em Perfil → Presença para registrar.', 'info');
      return;
    }
    // All selected sports are stored on the same presence doc — the user is
    // "at this venue and available to play any of these modalities". No more
    // "pick one" prompt; a single doc represents the whole session.
    var sports = Array.isArray(state.sports) ? state.sports : [];
    if (sports.length === 0) return;
    // Prevent duplicate check-in at same venue+sport (qualquer sport da
    // presença ativa que coincida com os sports atuais conta como dup).
    var normCurrent = sports.map(function(s) { return window.PresenceDB.normalizeSport(s); });
    var dup = state.myActive.filter(function(p) {
      if (p.type !== 'checkin' || p.placeId !== state.venue.placeId) return false;
      var pSports = Array.isArray(p.sports) ? p.sports.map(function(s) { return window.PresenceDB.normalizeSport(s); }) : [];
      return pSports.some(function(ns) { return normCurrent.indexOf(ns) !== -1; });
    })[0];
    if (dup) {
      if (window.showNotification) window.showNotification('Você já está registrado neste local.', 'info');
      return;
    }
    // Race guard: double-tap on "Estou aqui agora" creates two docs porque o
    // dup-check acima lê state.myActive, mas o push pra myActive só acontece
    // no .then() do save. Flag síncrono bloqueia a segunda chamada enquanto
    // a primeira ainda está em voo.
    if (state._savingCheckin) return;
    state._savingCheckin = true;
    var now = Date.now();
    var normSports = sports.map(window.PresenceDB.normalizeSport).filter(Boolean);
    var payload = {
      uid: cu.uid,
      email_lower: (cu.email || '').toLowerCase(),
      displayName: cu.displayName || '',
      photoURL: cu.photoURL || '',
      placeId: state.venue.placeId,
      venueName: state.venue.name || '',
      venueLat: state.venue.lat || null,
      venueLon: state.venue.lon || null,
      sports: normSports,
      type: 'checkin',
      startsAt: now,
      endsAt: now + window.PresenceDB.CHECKIN_WINDOW_MS,
      dayKey: window.PresenceDB.dayKey(new Date(now)),
      visibility: ((window.AppStore.currentUser && window.AppStore.currentUser.presenceVisibility) || 'friends'),
      cancelled: false,
      createdAt: now
    };
    window.PresenceDB.savePresence(payload).then(function(id) {
      if (window.showNotification) window.showNotification('Presença registrada! Seus amigos já podem ver.', 'success');
      // NÃO fazer push manual em state.myActive/presences aqui. O onSnapshot
      // ouvindo a coleção (ver attachListener) rebuilda ambos do Firestore
      // toda vez que um doc é criado. Push manual + rebuild do snapshot gerava
      // duplicata visual quando o snapshot chegava ANTES do .then (race real
      // observada em produção). O listener é agora a única fonte de verdade.
      payload._id = id;
      // Trophy hook — check-in milestone
      setTimeout(function() {
        try { if (typeof window._trophyOnCheckin === 'function') window._trophyOnCheckin(payload); } catch(_te) {}
      }, 500);
      _notifyFriendsOfCheckin(payload);
    }).catch(function(e) {
      window._error(e);
      if (window.showNotification) window.showNotification('Erro ao registrar presença.', 'error');
    }).finally(function() {
      state._savingCheckin = false;
    });
  };

  // Notifica amigos quando o usuário faz check-in imediato. Throttling via
  // localStorage: uma notificação por (placeId + sport + dia) pra evitar
  // spam se o usuário fizer múltiplos check-ins. Chave inclui dayKey pra
  // resetar todo dia. Semântica "vem jogar agora" é mais atraente que
  // "planejando" — por isso notificamos (antes de v0.15.13 só plan avisava).
  function _notifyFriendsOfCheckin(payload) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) return;
    // v0.17.5: dedup pra evitar "várias notificações em cada evento" quando
    // cu.friends tem mesmo amigo em formatos diferentes (email + uid).
    var friends = (typeof window._dedupFriendsForNotify === 'function')
      ? window._dedupFriendsForNotify(cu.friends, cu.uid)
      : (Array.isArray(cu.friends) ? cu.friends : []);
    if (friends.length === 0) return;
    if (typeof window._sendUserNotification !== 'function') return;
    // Respeita visibilidade — 'off' bloqueia upstream; 'public' e 'friends'
    // ambos permitem friends verem, então ambos notificam.
    if (cu.presenceVisibility === 'off') return;

    // Throttle — 1 notif por amigo/local/sports/dia. Usa sports.join pra uma
    // chave estável quando o usuário está registrado em múltiplas modalidades.
    var sportsKeyPart = (Array.isArray(payload.sports) && payload.sports.length > 0)
      ? payload.sports.slice().sort().join(',')
      : '';
    var throttleKey = 'scoreplace_checkin_notified_' + payload.placeId + '_' +
                      sportsKeyPart + '_' + payload.dayKey;
    try {
      if (localStorage.getItem(throttleKey)) return; // já notificou hoje
      localStorage.setItem(throttleKey, '1');
    } catch (e) {}

    var sportLabel = (Array.isArray(payload.sports) && payload.sports.length > 0)
      ? payload.sports.join('/')
      : 'agora';
    var msg = (cu.displayName || 'Um amigo') + ' chegou em ' +
              (payload.venueName || 'um local') + ' pra jogar ' +
              sportLabel + '. Vem junto!';

    friends.forEach(function(friendUid) {
      if (!friendUid) return;
      window._sendUserNotification(friendUid, {
        type: 'presence_checkin',
        message: msg,
        level: 'all',
        venueName: payload.venueName || '',
        placeId: payload.placeId,
        sports: payload.sports,
        startsAt: payload.startsAt
      }).catch(function(e) { window._warn('Presence check-in notify failed:', e); });
    });
  }

  // v0.16.41: _pickSportThen removido. Era dead code (zero call sites) e
  // apresentava o mesmo dialog "Qual modalidade agora?" que o usuário pediu pra
  // eliminar. Multi-modalidade agora se resolve via overlays multi-pill em
  // venues.js (_openInlineCheckInOverlay / _openInlinePlanOverlay).

  // v0.16.69: UNIFICAÇÃO. Antes presence.js tinha modal próprio com SOMENTE
  // os campos Chegada/Saída — sem pills de modalidade, sem pills Hoje/Amanhã,
  // sem destaque do nome do local — e cada melhoria no overlay de venues.js
  // (multi-pill modalidade v0.16.15, Hoje/Amanhã v0.16.36, default Chegada+2h
  // v0.16.25, campos compactos v0.16.68, etc) ficava de fora aqui. Resultado:
  // o usuário via comportamentos diferentes em cada caminho do app e perdia
  // confiança nos fixes. Agora _presencePlanDialog é APENAS um wrapper que
  // delega pro overlay único de venues.js (window._openInlinePlanOverlay).
  // Single source of truth — qualquer melhoria futura aparece nos DOIS
  // caminhos automaticamente.
  window._presencePlanDialog = function() {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !state.venue) return;
    var sports = Array.isArray(state.sports) ? state.sports : [];
    if (sports.length === 0) return;
    if (typeof window._openInlinePlanOverlay !== 'function') {
      // Defesa: venues.js não carregou. Toast informativo em vez de silêncio.
      if (window.showNotification) window.showNotification('Erro ao abrir overlay. Recarregue a página.', '', 'error');
      return;
    }
    // state.venue tem { placeId, name, lat, lon, sports[] } — formato
    // compatível com o que _openInlinePlanOverlay espera. state.sports é
    // o array de modalidades selecionadas no #presence — passa direto.
    window._openInlinePlanOverlay(state.venue, sports);
  };

  window._presenceConfirmPlan = function() {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !state.venue) return;
    var sports = Array.isArray(state.sports) ? state.sports : [];
    if (sports.length === 0) return;
    if (cu.presenceVisibility === 'off') {
      if (window.showNotification) window.showNotification('Presença desligada no seu perfil.', 'info');
      return;
    }
    if (_muted(cu)) {
      if (window.showNotification) window.showNotification('Presença silenciada. Desative em Perfil → Presença para planejar.', 'info');
      return;
    }
    var startStr = (document.getElementById('plan-start') || {}).value;
    var endStr = (document.getElementById('plan-end') || {}).value;
    if (!startStr) return;
    var now = new Date();
    var build = function(hm) {
      var parts = hm.split(':').map(Number);
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parts[0] || 0, parts[1] || 0, 0, 0);
      return d.getTime();
    };
    var startsAt = build(startStr);
    var endsAt;
    var openEnded = false;
    if (endStr) {
      endsAt = build(endStr);
      if (endsAt <= startsAt) {
        if (window.showNotification) window.showNotification('Horário final deve ser maior que o inicial.', 'error');
        return;
      }
    } else {
      // Open-ended plan: cap at 12h after start so the doc still satisfies
      // endsAt-based queries and isn't indefinite. UI shows "a partir de HH:mm".
      openEnded = true;
      endsAt = startsAt + 12 * 60 * 60 * 1000;
    }
    var normSports = sports.map(window.PresenceDB.normalizeSport).filter(Boolean);
    // Duplicate check: existe plano ativo no mesmo local com sports que
    // intersectam e janela de tempo que se sobrepõe? Se sim, não cria de novo.
    var dup = state.myActive.filter(function(p) {
      if (p.type !== 'planned' || p.placeId !== state.venue.placeId) return false;
      var pSports = Array.isArray(p.sports) ? p.sports : [];
      var sportsOverlap = pSports.some(function(ns) { return normSports.indexOf(ns) !== -1; });
      if (!sportsOverlap) return false;
      var pStart = p.startsAt || 0;
      var pEnd = p.endsAt || (pStart + 12 * 60 * 60 * 1000);
      return (startsAt < pEnd && endsAt > pStart);
    })[0];
    if (dup) {
      if (window.showNotification) window.showNotification('Você já tem um plano para este local neste horário.', 'info');
      var ov0 = document.getElementById('presence-plan-overlay');
      if (ov0) ov0.remove();
      return;
    }
    // Race guard: evita criar dois docs num double-tap no Confirmar enquanto
    // o save ainda está em voo.
    if (state._savingPlan) return;
    state._savingPlan = true;
    var payload = {
      uid: cu.uid,
      email_lower: (cu.email || '').toLowerCase(),
      displayName: cu.displayName || '',
      photoURL: cu.photoURL || '',
      placeId: state.venue.placeId,
      venueName: state.venue.name || '',
      venueLat: state.venue.lat || null,
      venueLon: state.venue.lon || null,
      sports: normSports,
      type: 'planned',
      startsAt: startsAt,
      endsAt: endsAt,
      openEnded: openEnded,
      dayKey: window.PresenceDB.dayKey(new Date(startsAt)),
      visibility: ((window.AppStore.currentUser && window.AppStore.currentUser.presenceVisibility) || 'friends'),
      cancelled: false,
      createdAt: Date.now()
    };
    window.PresenceDB.savePresence(payload).then(function(id) {
      if (window.showNotification) window.showNotification('Planejamento registrado! Amigos podem se programar.', 'success');
      var ov = document.getElementById('presence-plan-overlay');
      if (ov) ov.remove();
      payload._id = id;
      // onSnapshot rebuilda state.myActive/presences do Firestore — push manual
      // aqui causava duplicata visual quando o snapshot chegava antes do .then.
      // Trophy hook — plan creation milestone
      setTimeout(function() {
        try { if (typeof window._trophyOnPlanCreated === 'function') window._trophyOnPlanCreated(payload); } catch(_te) {}
      }, 500);
      _notifyFriendsOfPlan(payload);
    }).catch(function(e) {
      window._error(e);
      if (window.showNotification) window.showNotification('Erro ao planejar ida.', 'error');
    }).finally(function() {
      state._savingPlan = false;
    });
  };

  // Send a low-priority notification to each friend when a planned presence
  // is created. Respects each friend's notifyLevel via _sendUserNotification.
  function _notifyFriendsOfPlan(payload) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) return;
    // v0.17.5: dedup (ver _notifyFriendsOfCheckin)
    var friends = (typeof window._dedupFriendsForNotify === 'function')
      ? window._dedupFriendsForNotify(cu.friends, cu.uid)
      : (Array.isArray(cu.friends) ? cu.friends : []);
    if (friends.length === 0) return;
    if (typeof window._sendUserNotification !== 'function') return;

    var d = new Date(payload.startsAt);
    var hhmm = window._formatHHMM(d);
    var sportLabel = (Array.isArray(payload.sports) && payload.sports.length > 0)
      ? payload.sports.join('/')
      : 'algo';
    var msg = (cu.displayName || 'Um amigo') + ' vai jogar ' + sportLabel +
      ' em ' + (payload.venueName || 'um local') + ' às ' + hhmm + ' hoje. Quer ir junto?';

    friends.forEach(function(friendUid) {
      if (!friendUid) return;
      window._sendUserNotification(friendUid, {
        type: 'presence_plan',
        message: msg,
        level: 'all',
        venueName: payload.venueName || '',
        placeId: payload.placeId,
        sports: payload.sports,
        startsAt: payload.startsAt
      }).catch(function(e) { window._warn('Presence plan notify failed:', e); });
    });
  }

  window._presenceCancel = function(docId) {
    if (!docId) return;
    // Mark locally BEFORE the async write so any listener snapshot that
    // arrives while the write is in flight still treats the doc as gone.
    _markCancelled(docId);
    state.myActive = state.myActive.filter(function(p) { return p._id !== docId; });
    state.presences = state.presences.filter(function(p) { return p._id !== docId; });
    renderMyActive();
    renderChart();
    renderNow();
    renderUpcoming();
    window.PresenceDB.cancelPresence(docId).then(function(ok) {
      if (!ok) {
        // Server rejected — un-mark so the doc comes back on the next snapshot.
        delete _cancelledIds[docId];
        if (window.showNotification) window.showNotification('Não foi possível cancelar. Tente novamente.', 'error');
        return;
      }
      if (window.showNotification) window.showNotification('Presença cancelada.', 'info');
    });
  };

  // Entry point
  window.renderPresence = function(container) {
    // Any listener from a previous visit must go — otherwise it keeps
    // pushing snapshots into stale state/DOM.
    _teardownListener();
    // Initialize state from prefill or defaults
    var pre = _readPrefill();
    if (pre && pre.placeId) {
      state.venue = { placeId: pre.placeId, name: pre.venueName || pre.placeId, lat: pre.lat || null, lon: pre.lon || null };
    } else {
      state.venue = _defaultVenue();
    }
    if (pre && Array.isArray(pre.sports) && pre.sports.length > 0) {
      state.sports = pre.sports.slice();
    } else {
      state.sports = _defaultSports();
    }
    state.dayKey = window.PresenceDB.dayKey(new Date());
    render(container);
    // Auto-abrir o modal "Planejar ida" quando veio da modal de venue via
    // botão "🗓️ Planejar ida" — evita que o usuário precise localizar o
    // botão na view depois da navegação.
    if (pre && pre._openPlanDialog) {
      setTimeout(function() {
        if (typeof window._presencePlanDialog === 'function') window._presencePlanDialog();
      }, 450);
    }
  };
})();
