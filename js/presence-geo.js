// ========================================
// scoreplace.app — Presence Geolocation
// ========================================
// On app load (3s post-login), if the user opted in:
//   1. Request Geolocation permission (browser prompts once).
//   2. Compute distance (Haversine) to each preferredLocations[] entry
//      that has lat/lng set.
//   3. If within MATCH_RADIUS_M of one — and the user has a preferredSports
//      entry — either auto check-in (presenceAutoCheckin: true) or show a
//      one-click confirm dialog (default).
//
// All side effects respect:
//   - presenceMuteUntil  — active mute short-circuits everything.
//   - presenceVisibility === 'off'  — same.
//   - presenceAutoCheckin — false = suggest, true = auto-register.
//   - sessionStorage '_presenceGeoHandled' — one suggestion per tab per day.

(function() {
  var MATCH_RADIUS_M = 150;
  var SESSION_KEY = '_presenceGeoHandled';
  // v2.8.31 (#3): abrir o app perto de um venue REGISTRADO em N dias distintos
  // → sugerir adicioná-lo aos preferidos (se ainda não for).
  var FREQUENT_DAYS = 5;
  var VENUE_DAYS_PREFIX = 'scoreplace_venue_days_'; // + uid → contagem por usuário
  var FREQ_SESSION_KEY = '_freqVenueChecked';        // 1 checagem por sessão

  // Great-circle distance in metres between two (lat, lon) pairs.
  // v2.8.36: delega ao canônico window._haversineKm (km) × 1000.
  function haversineMeters(a, b) {
    if (a == null || b == null) return Infinity;
    return window._haversineKm(a.lat, a.lon, b.lat, b.lon) * 1000;
  }

  // Pick the closest preferred location within the match radius. Input
  // expects [{placeId, name, lat, lng|lon}]; returns null if none match.
  function findMatch(pos, preferredLocations) {
    var best = null;
    var bestDist = Infinity;
    (preferredLocations || []).forEach(function(p) {
      if (!p) return;
      var plat = p.lat;
      var plon = (p.lng != null ? p.lng : p.lon);
      if (plat == null || plon == null) return;
      var d = haversineMeters(pos, { lat: Number(plat), lon: Number(plon) });
      if (d < bestDist) { best = p; bestDist = d; }
    });
    if (!best || bestDist > MATCH_RADIUS_M) return null;
    // v4.x: preferido guarda o nome em `label` (não `name`) e a long. em `lng`/`lon`.
    // Normaliza p/ um shape único (com `name`) — senão buildPayload grava venueName vazio
    // e o match por nome do plano/check-in (_myVenueState) NUNCA casa (regredia pro pop-up).
    var loc = {
      lat: best.lat,
      lng: (best.lng != null ? best.lng : best.lon),
      lon: (best.lon != null ? best.lon : best.lng),
      placeId: best.placeId || '',
      name: best.name || best.label || ''
    };
    return { location: loc, distance: Math.round(bestDist) };
  }

  // Already handled this venue today? Key is date + placeId so user who
  // moves between multiple venues still gets prompts per venue.
  function alreadyHandled(placeId) {
    try {
      var key = new Date().toISOString().slice(0, 10) + '|' + placeId;
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      return raw.indexOf(key) !== -1;
    } catch (e) { return false; }
  }
  function markHandled(placeId) {
    try {
      var key = new Date().toISOString().slice(0, 10) + '|' + placeId;
      var raw = sessionStorage.getItem(SESSION_KEY) || '';
      sessionStorage.setItem(SESSION_KEY, raw + ';' + key);
    } catch (e) {}
  }

  // Pull user's first preferred sport (CSV) — used for auto-registering a
  // sensible default modality. If unavailable, fall back to any previously
  // used tournament sport.
  function firstPreferredSport(cu) {
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
    return '';
  }

  // Todas as modalidades preferidas do usuário (normalizadas).
  function preferredSportsAll(cu) {
    var pref = cu && cu.preferredSports;
    if (!pref) return [];
    return String(pref).split(/[,;]/).map(function(s) { return window.PresenceDB.normalizeSport(s); }).filter(Boolean);
  }
  // ÚLTIMA config de check-in (modalidades + janela = horário de saída) — salva por
  // PresenceDB.savePresence. "Mantém o que o usuário costuma usar" ao confirmar a presença.
  function lastPresenceCfg(cu) {
    try {
      var raw = localStorage.getItem('scoreplace_presence_lastcfg_' + cu.uid);
      if (!raw) return null;
      var c = JSON.parse(raw);
      var sports = Array.isArray(c.sports) ? c.sports.map(window.PresenceDB.normalizeSport).filter(Boolean) : [];
      return { sports: sports, windowMs: Number(c.windowMs) || window.PresenceDB.CHECKIN_WINDOW_MS };
    } catch (e) { return null; }
  }
  // Config a aplicar no check-in automático: ÚLTIMA usada; senão modalidades preferidas + janela padrão.
  function resolveCfg(cu) {
    var last = lastPresenceCfg(cu);
    if (last && last.sports.length) return last;
    return { sports: preferredSportsAll(cu), windowMs: window.PresenceDB.CHECKIN_WINDOW_MS };
  }

  // Build the presence payload identical to manual check-in. cfg = { sports:[], windowMs }.
  function buildPayload(cu, location, cfg) {
    var now = Date.now();
    var sports = (cfg && Array.isArray(cfg.sports)) ? cfg.sports : [];
    var windowMs = (cfg && cfg.windowMs) || window.PresenceDB.CHECKIN_WINDOW_MS;
    return {
      uid: cu.uid,
      email_lower: (cu.email || '').toLowerCase(),
      displayName: cu.displayName || '',
      photoURL: cu.photoURL || '',
      placeId: window.PresenceDB.venueKey(location.placeId || '', location.name || ''),
      venueName: location.name || '',
      venueLat: Number(location.lat) || null,
      venueLon: (location.lng != null ? Number(location.lng) : (location.lon != null ? Number(location.lon) : null)),
      sport: sports[0] || '', // fallback de leitura/dedup (savePresence lê d.sport)
      sports: sports,         // array normalizado (query de exibição usa array-contains)
      type: 'checkin',
      startsAt: now,
      endsAt: now + windowMs,
      dayKey: window.PresenceDB.dayKey(new Date(now)),
      visibility: cu.presenceVisibility || 'friends',
      cancelled: false,
      createdAt: now,
      source: 'geo'
    };
  }

  function autoRegister(cu, location, cfg) {
    var payload = buildPayload(cu, location, cfg);
    var label = (cfg && cfg.sports && cfg.sports.length) ? cfg.sports.join('/') : '';
    window.PresenceDB.savePresence(payload).then(function() {
      if (window.showNotification) {
        window.showNotification('📍 Check-in automático', 'Registrado em ' + (location.name || 'local') + (label ? ' — ' + label : '') + '. Amigos já podem ver.', 'success');
      }
    }).catch(function(e) {
      window._warn('Auto check-in falhou:', e);
    });
  }

  function suggest(cu, location, cfg) {
    var place = location.name || 'um local conhecido';
    var sports = (cfg && cfg.sports) || [];
    var label = sports.join('/');
    var msg = label
      ? 'Parece que você chegou em <b>' + place + '</b>. Está para jogar <b>' + label + '</b>? Confirmando, seus amigos poderão ver que você está no local.'
      : 'Parece que você chegou em <b>' + place + '</b>. Está para jogar? Confirmando, seus amigos poderão ver que você está no local.';
    if (typeof window.showConfirmDialog !== 'function') return;
    window.showConfirmDialog(
      '📍 Você está aqui?',
      msg,
      function() {
        if (sports.length) {
          autoRegister(cu, location, cfg); // mantém modalidades + horário de saída da última vez
        } else {
          // No preferred sport — drop into the manual view pre-filled with this venue.
          try {
            sessionStorage.setItem('_presencePrefill', JSON.stringify({
              placeId: location.placeId,
              venueName: location.name || '',
              sports: [],
              lat: location.lat,
              lon: location.lng != null ? location.lng : location.lon
            }));
          } catch (e) {}
          window.location.hash = '#presence';
        }
      },
      null,
      { confirmText: 'Sim, estou aqui', cancelText: 'Agora não', type: 'info' }
    );
  }

  // v2.8.30: normaliza nome de local (trim/lower/sem acento) pra casar o preferido
  // ↔ presença salva quando o placeId difere (preferido sintético vs Google).
  function _normName(s) {
    var v = String(s || '').trim().toLowerCase();
    try { return v.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { return v; }
  }

  // Estado do usuário NESTE local: { checkedIn, planned }. Lê as presenças ativas
  // (loadMyActive) e casa por placeId canônico OU nome normalizado. Sem DB/uid,
  // devolve tudo falso (cai no caminho de perguntar).
  function _myVenueState(cu, location, cb) {
    if (!window.PresenceDB || typeof window.PresenceDB.loadMyActive !== 'function' || !cu.uid) {
      cb({ checkedIn: false, planned: false }); return;
    }
    var key = window.PresenceDB.venueKey(location.placeId || '', location.name || '');
    var nm = _normName(location.name);
    var _todayKey = (typeof window.PresenceDB.dayKey === 'function') ? window.PresenceDB.dayKey(new Date()) : null;
    window.PresenceDB.loadMyActive(cu.uid).then(function(list) {
      var ci = false, pl = false, planSports = [], planWindowMs = 0;
      var W = 2 * 60 * 60 * 1000, nowMs = Date.now();
      (list || []).forEach(function(d) {
        if (!d) return;
        var hit = (d.placeId && d.placeId === key) || (nm && d.venueName && _normName(d.venueName) === nm);
        if (!hit) return;
        // v4.x: um PLANO só conta como "ida PRO HORÁRIO" se o horário planejado está dentro
        // de ±2h de agora (margem pra frente e pra trás). Fora dessa janela (ou plano de outro
        // dia), trata como SEM plano → cai no pop-up "Você está aqui?". Com plano no horário,
        // o check-in é DIRETO usando as modalidades + horário de saída DO PRÓPRIO PLANO.
        if (d.type === 'planned') {
          var ps = d.startsAt || 0, pe = d.endsAt || ps;
          var inWindow = ps ? (nowMs >= (ps - W) && nowMs <= (pe + W)) : true;
          if (inWindow) {
            pl = true;
            planSports = Array.isArray(d.sports) ? d.sports.slice() : (d.sport ? [d.sport] : []);
            planWindowMs = (d.endsAt && d.startsAt) ? (d.endsAt - d.startsAt) : 0;
          }
        } else ci = true;
      });
      cb({ checkedIn: ci, planned: pl, planSports: planSports, planWindowMs: planWindowMs });
    }).catch(function() { cb({ checkedIn: false, planned: false }); });
  }

  // ─── #3: sugerir local frequente como preferido ──────────────────────────
  // O venue já é preferido do usuário? Casa por placeId, nome normalizado ou
  // coordenadas (~200m). Venue usa lat/lon; preferido usa lat/lng.
  function _isPreferredVenue(cu, venue) {
    var prefs = Array.isArray(cu.preferredLocations) ? cu.preferredLocations : [];
    var vnm = _normName(venue.name);
    var vpid = venue.placeId || venue._id || '';
    var vlat = Number(venue.lat);
    var vlon = Number(venue.lon != null ? venue.lon : venue.lng);
    return prefs.some(function(l) {
      if (!l) return false;
      if (vpid && l.placeId && l.placeId === vpid) return true;
      var lnm = _normName(l.label || l.name);
      if (vnm && lnm && lnm === vnm) return true;
      var llat = Number(l.lat), llon = Number(l.lng != null ? l.lng : l.lon);
      if (!isNaN(llat) && !isNaN(llon) && !isNaN(vlat) && !isNaN(vlon)) {
        return Math.abs(llat - vlat) < 0.002 && Math.abs(llon - vlon) < 0.002;
      }
      return false;
    });
  }

  // Registra +1 dia DISTINTO de uso do app neste venue; ao cruzar FREQUENT_DAYS,
  // sugere adicioná-lo aos preferidos (uma vez por venue/dispositivo).
  function _recordVenueDay(cu, venue) {
    var storeKey = VENUE_DAYS_PREFIX + cu.uid;
    var vkey = window.VenueDB.venueKey(venue.placeId || venue._id || '', venue.name || '');
    var today = new Date().toISOString().slice(0, 10);
    var store = {};
    try { store = JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch (e) { store = {}; }
    var rec = store[vkey] || {
      name: venue.name || '',
      lat: Number(venue.lat) || null,
      lng: Number(venue.lon != null ? venue.lon : venue.lng) || null,
      placeId: venue.placeId || venue._id || '',
      days: [],
      suggested: false
    };
    if (rec.days.indexOf(today) === -1) rec.days.push(today);
    if (venue.name) rec.name = venue.name;
    store[vkey] = rec;
    try { localStorage.setItem(storeKey, JSON.stringify(store)); } catch (e) {}
    if (rec.days.length >= FREQUENT_DAYS && !rec.suggested) {
      rec.suggested = true;
      store[vkey] = rec;
      try { localStorage.setItem(storeKey, JSON.stringify(store)); } catch (e) {}
      _suggestPreferred(cu, rec);
    }
  }

  function _suggestPreferred(cu, rec) {
    if (typeof window.showConfirmDialog !== 'function') return;
    var place = rec.name || 'este local';
    window.showConfirmDialog(
      '🌟 Local frequente',
      'Notamos que você abriu o app em <b>' + place + '</b> em ' + rec.days.length +
        ' dias diferentes. Quer adicioná-lo aos seus <b>locais preferidos</b>? ' +
        'Assim você vê quem está lá e recebe avisos dos amigos.',
      function() {
        window._addPreferredLocationDirect({ lat: rec.lat, lng: rec.lng, label: rec.name, placeId: rec.placeId });
      },
      null,
      { confirmText: 'Adicionar', cancelText: 'Agora não', type: 'info' }
    );
  }

  // Acha o venue REGISTRADO mais próximo dentro do raio; se não for preferido,
  // contabiliza o dia. 1x por sessão (evita reler venues a cada tick).
  function _trackFrequentVenue(cu, me) {
    if (!window.VenueDB || typeof window.VenueDB.listVenues !== 'function') return;
    if (Array.isArray(cu.preferredLocations) && cu.preferredLocations.length >= 5) return; // sem espaço
    try { if (sessionStorage.getItem(FREQ_SESSION_KEY)) return; sessionStorage.setItem(FREQ_SESSION_KEY, '1'); } catch (e) {}
    window.VenueDB.listVenues({}).then(function(venues) {
      var best = null, bestD = Infinity;
      (venues || []).forEach(function(v) {
        if (!v) return;
        var vlat = v.lat, vlon = (v.lon != null ? v.lon : v.lng);
        if (vlat == null || vlon == null) return;
        var d = haversineMeters(me, { lat: Number(vlat), lon: Number(vlon) });
        if (d < bestD) { bestD = d; best = v; }
      });
      if (!best || bestD > MATCH_RADIUS_M) return;
      if (_isPreferredVenue(cu, best)) return;
      _recordVenueDay(cu, best);
    }).catch(function() {});
  }

  // Adiciona um local aos preferidos do usuário e PERSISTE no Firestore (merge).
  // Usado pela sugestão de local frequente; exposto pra reuso. Preferido = {lat,lng,label,placeId?}.
  window._addPreferredLocationDirect = function(loc) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !loc || loc.lat == null || loc.lng == null) return;
    var arr = Array.isArray(cu.preferredLocations) ? cu.preferredLocations.slice() : [];
    if (arr.length >= 5) {
      if (window.showNotification) window.showNotification('Limite de locais', 'Você já tem 5 locais preferidos. Gerencie no seu perfil.', 'warning');
      return;
    }
    var dup = arr.some(function(l) {
      if (!l) return false;
      if (loc.placeId && l.placeId) return loc.placeId === l.placeId;
      var llng = (l.lng != null ? l.lng : l.lon);
      return Math.abs((l.lat || 0) - loc.lat) < 0.002 && Math.abs((llng || 0) - loc.lng) < 0.002;
    });
    if (dup) {
      if (window.showNotification) window.showNotification('Já é preferido', (loc.label || 'O local') + ' já está nos seus preferidos.', 'info');
      return;
    }
    var entry = { lat: Number(loc.lat), lng: Number(loc.lng), label: loc.label || (Number(loc.lat).toFixed(4) + ', ' + Number(loc.lng).toFixed(4)) };
    if (loc.placeId) entry.placeId = loc.placeId;
    arr.push(entry);
    cu.preferredLocations = arr;
    if (Array.isArray(window._profileLocations)) window._profileLocations = arr.slice();
    try {
      if (window.FirestoreDB && window.FirestoreDB.db) {
        window.FirestoreDB.db.collection('users').doc(cu.uid).set({ preferredLocations: arr }, { merge: true })
          .then(function() { if (window.showNotification) window.showNotification('⭐ Local adicionado', entry.label + ' agora é um dos seus preferidos.', 'success'); })
          .catch(function(e) { if (window._warn) window._warn('add preferred falhou:', e); if (window.showNotification) window.showNotification('Erro ao salvar', 'Não foi possível salvar o local agora.', 'error'); });
      }
    } catch (e) {}
  };

  // Public entry point — called by auth.js after simulateLoginSuccess.
  window._presenceGeoCheck = function(opts) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) return;

    // Respect user's preferences — early-return on every short-circuit.
    if (cu.presenceVisibility === 'off') return;
    var until = Number(cu.presenceMuteUntil || 0);
    if (until > Date.now()) return;

    var prefs = Array.isArray(cu.preferredLocations) ? cu.preferredLocations : [];
    var withCoords = prefs.filter(function(p) {
      return p && p.lat != null && (p.lng != null || p.lon != null);
    });
    // v2.8.31: NÃO retorna aqui se withCoords vazio — o #3 (local frequente) roda
    // mesmo sem preferidos, DESDE QUE haja GPS já disponível (cache). O prompt de
    // GPS continua só pra quem tem preferidos (#2) — ver abaixo.

    if (!navigator.geolocation) return;

    function _doGeoCheck(lat, lon) {
      var me = { lat: lat, lon: lon };
      // #2 — está num local PREFERIDO?
      var match = withCoords.length ? findMatch(me, withCoords) : null;
      if (match) {
        if (alreadyHandled(match.location.placeId)) return;
        markHandled(match.location.placeId);
        var cfg = resolveCfg(cu); // últimas modalidades + horário de saída (ou preferidas)
        // NÃO faz check-in silencioso. Decide pelo estado do usuário NESTE local:
        //  • já presente → nada;
        //  • TEM plano de ida pro HORÁRIO (±2h) → presença DIRETA, sem perguntar, com as
        //    modalidades + horário de saída DO PLANO (fallback: última config / preferidas);
        //  • SEM plano pro horário → PERGUNTA "Você está aqui?" (confirma/cancela; cancelar = nada).
        _myVenueState(cu, match.location, function(state) {
          if (state.checkedIn) return;
          if (state.planned) {
            var planCfg = {
              sports: (state.planSports && state.planSports.length) ? state.planSports : cfg.sports,
              windowMs: state.planWindowMs || cfg.windowMs
            };
            if (planCfg.sports.length) { autoRegister(cu, match.location, planCfg); return; }
          }
          suggest(cu, match.location, cfg);
        });
        return; // num preferido → não roda o #3 (não faz sentido sugerir o que já é)
      }
      // #3 — não está num preferido: rastreia venue REGISTRADO frequente.
      _trackFrequentVenue(cu, me);
    }

    // v1.8.42-beta: cache compartilhado com venues.js (scoreplace_gps_cache).
    var _GPS_CACHE_KEY = 'scoreplace_gps_cache';
    var _GPS_CACHE_TTL = 10 * 60 * 1000;
    var _GPS_SESSION_KEY = '_gpsRequested';
    var _fresh = !!(opts && opts.fresh); // ABERTURA/RETOMADA: quer posição NOVA, ignora o cache

    // Login (não-fresh): se há coords frescas no cache (<10min), usa sem buscar GPS.
    if (!_fresh) {
      try {
        var _raw = localStorage.getItem(_GPS_CACHE_KEY);
        if (_raw) {
          var _cached = JSON.parse(_raw);
          if (_cached && _cached.lat && _cached.lng && (Date.now() - _cached.ts) < _GPS_CACHE_TTL) {
            _doGeoCheck(_cached.lat, _cached.lng);
            return;
          }
        }
      } catch (e) {}
    }

    // Só busca GPS se há preferidos com coords (#2). #3 (frequente) só usa o cache acima.
    if (withCoords.length === 0) return;

    function _fetchPos() {
      navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        try { localStorage.setItem(_GPS_CACHE_KEY, JSON.stringify({ lat: lat, lng: lng, ts: Date.now() })); } catch (e) {}
        _doGeoCheck(lat, lng);
      }, function(err) {
        window._log('[PresenceGeo] geolocation skipped:', err && err.message);
      }, { timeout: 8000, maximumAge: _fresh ? 30 * 1000 : 5 * 60 * 1000 });
    }

    function _onceThenFetch() {
      try { if (sessionStorage.getItem(_GPS_SESSION_KEY)) return; sessionStorage.setItem(_GPS_SESSION_KEY, '1'); } catch (e) {}
      _fetchPos();
    }
    // Permissão JÁ concedida → busca posição a CADA abertura/retomada SEM prompt (é isso que
    // faz "chegar no clube e abrir o app" voltar a funcionar). Permissão ainda 'prompt' →
    // pede 1x por sessão no login; numa retomada não força dialog. 'denied' → nada.
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function(st) {
        if (st.state === 'granted') { _fetchPos(); return; }
        if (st.state === 'denied') return;
        if (_fresh) return;
        _onceThenFetch();
      }).catch(function() { _onceThenFetch(); });
    } else {
      _onceThenFetch();
    }
  };

  // v4.x HOTFIX: roda o check ao ABRIR/RETOMAR o app — não só no login. Antes só o login
  // (auth.js, no setTimeout pós-login) disparava; quem chega no clube já está logado e só
  // traz o app pra frente (resume) → o login NÃO re-dispara → o GPS nunca rodava nesse
  // momento ("não funcionou pra ninguém"). visibilitychange/pageshow/focus disparam (throttle
  // 90s) buscando posição fresca quando a permissão já foi concedida.
  var _lastGeoResume = 0;
  function _geoOnResume() {
    if (Date.now() - _lastGeoResume < 90 * 1000) return;
    _lastGeoResume = Date.now();
    if (window._log) window._log('[PresenceGeo] resume check');
    if (typeof window._presenceGeoCheck === 'function') {
      try { window._presenceGeoCheck({ fresh: true }); } catch (e) {}
    }
  }
  try {
    document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') _geoOnResume(); });
    window.addEventListener('pageshow', _geoOnResume);
    window.addEventListener('focus', _geoOnResume);
  } catch (e) {}
})();
