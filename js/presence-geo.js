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
    return { location: best, distance: Math.round(bestDist) };
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

  // Build the presence payload identical to manual check-in.
  function buildPayload(cu, location, sport) {
    var now = Date.now();
    return {
      uid: cu.uid,
      email_lower: (cu.email || '').toLowerCase(),
      displayName: cu.displayName || '',
      photoURL: cu.photoURL || '',
      placeId: window.PresenceDB.venueKey(location.placeId || '', location.name || ''),
      venueName: location.name || '',
      venueLat: Number(location.lat) || null,
      venueLon: (location.lng != null ? Number(location.lng) : (location.lon != null ? Number(location.lon) : null)),
      sport: sport,
      type: 'checkin',
      startsAt: now,
      endsAt: now + window.PresenceDB.CHECKIN_WINDOW_MS,
      dayKey: window.PresenceDB.dayKey(new Date(now)),
      visibility: cu.presenceVisibility || 'friends',
      cancelled: false,
      createdAt: now,
      source: 'geo'
    };
  }

  function autoRegister(cu, location, sport) {
    var payload = buildPayload(cu, location, sport);
    window.PresenceDB.savePresence(payload).then(function() {
      if (window.showNotification) {
        window.showNotification('📍 Check-in automático', 'Registrado em ' + (location.name || 'local') + ' — ' + sport + '. Amigos já podem ver.', 'success');
      }
    }).catch(function(e) {
      window._warn('Auto check-in falhou:', e);
    });
  }

  function suggest(cu, location, sport) {
    var place = location.name || 'um local conhecido';
    var msg = sport
      ? 'Parece que você chegou em <b>' + place + '</b>. Confirmar sua presença em <b>' + sport + '</b>? Seus amigos poderão ver que você está no local.'
      : 'Parece que você chegou em <b>' + place + '</b>. Confirmar sua presença? Seus amigos poderão ver que você está no local.';
    if (typeof window.showConfirmDialog !== 'function') return;
    window.showConfirmDialog(
      '📍 Você está aqui?',
      msg,
      function() {
        if (sport) {
          autoRegister(cu, location, sport);
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
      var ci = false, pl = false;
      (list || []).forEach(function(d) {
        if (!d) return;
        var hit = (d.placeId && d.placeId === key) || (nm && d.venueName && _normName(d.venueName) === nm);
        if (!hit) return;
        // v2.8.58: um PLANO só conta como "ida programada" se for de HOJE. Antes
        // qualquer plano futuro (ex.: torneio daqui a 9 dias) marcava planned=true →
        // estando no local hoje, o GPS fazia check-in direto e NÃO mostrava o pop-up
        // de "você está aqui?". Plano de outro dia é ignorado aqui.
        if (d.type === 'planned') {
          var _planKey = d.dayKey || (d.startsAt ? (typeof window.PresenceDB.dayKey === 'function' ? window.PresenceDB.dayKey(new Date(d.startsAt)) : null) : null);
          if (!_todayKey || !_planKey || _planKey === _todayKey) pl = true;
        } else ci = true;
      });
      cb({ checkedIn: ci, planned: pl });
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
  window._presenceGeoCheck = function() {
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
        var sport = firstPreferredSport(cu);
        // v2.8.30: NÃO faz mais check-in silencioso. Decide pelo estado do usuário
        // NESTE local: já presente → nada; IDA PROGRAMADA (plan) → check-in direto
        // (já planejou jogar); senão → PERGUNTA (pop-up confirma/cancela), pra
        // qualquer usuário com o local como preferido.
        _myVenueState(cu, match.location, function(state) {
          if (state.checkedIn) return;
          if (state.planned && sport) { autoRegister(cu, match.location, sport); return; }
          suggest(cu, match.location, sport);
        });
        return; // num preferido → não roda o #3 (não faz sentido sugerir o que já é)
      }
      // #3 — não está num preferido: rastreia venue REGISTRADO frequente.
      _trackFrequentVenue(cu, me);
    }

    // v1.8.42-beta: cache compartilhado com venues.js (scoreplace_gps_cache).
    // Se coords frescas existem (< 10 min), usar sem pedir GPS.
    // Se não, pedir GPS uma única vez por sessão (sessionStorage _gpsRequested).
    var _GPS_CACHE_KEY = 'scoreplace_gps_cache';
    var _GPS_CACHE_TTL = 10 * 60 * 1000;
    var _GPS_SESSION_KEY = '_gpsRequested';

    try {
      var _raw = localStorage.getItem(_GPS_CACHE_KEY);
      if (_raw) {
        var _cached = JSON.parse(_raw);
        if (_cached && _cached.lat && _cached.lng && (Date.now() - _cached.ts) < _GPS_CACHE_TTL) {
          _doGeoCheck(_cached.lat, _cached.lng);
          return;
        }
      }
    } catch(e) {}

    // v2.8.31: sem cache de GPS — só PEDE permissão se há preferidos com coords (#2).
    // O #3 (local frequente) nunca dispara um prompt novo: ele aproveita só o GPS
    // já concedido (cache acima, populado por #2 ou pela tela de locais).
    if (withCoords.length === 0) return;

    // Já pediu nesta sessão → não re-pede (evita segundo dialog)
    try { if (sessionStorage.getItem(_GPS_SESSION_KEY)) return; } catch(e) {}
    try { sessionStorage.setItem(_GPS_SESSION_KEY, '1'); } catch(e) {}

    navigator.geolocation.getCurrentPosition(function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      try { localStorage.setItem(_GPS_CACHE_KEY, JSON.stringify({ lat: lat, lng: lng, ts: Date.now() })); } catch(e) {}
      _doGeoCheck(lat, lng);
    }, function(err) {
      window._log('[PresenceGeo] geolocation skipped:', err && err.message);
    }, { timeout: 8000, maximumAge: 5 * 60 * 1000 });
  };
})();
