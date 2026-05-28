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

  // Great-circle distance in metres between two (lat, lon) pairs.
  function haversineMeters(a, b) {
    if (a == null || b == null) return Infinity;
    var R = 6371000;
    var toRad = function(d) { return d * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat);
    var dLon = toRad(b.lon - a.lon);
    var s = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat)) *
            Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
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
    var msg = sport
      ? 'Você está em <b>' + (location.name || 'um local conhecido') + '</b>. Registrar presença em <b>' + sport + '</b>?'
      : 'Você está em <b>' + (location.name || 'um local conhecido') + '</b>. Registrar presença?';
    if (typeof window.showConfirmDialog !== 'function') return;
    window.showConfirmDialog(
      '📍 Registrar presença',
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
      { confirmText: 'Sim, registrar', cancelText: 'Agora não', type: 'info' }
    );
  }

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
    if (withCoords.length === 0) return;

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(function(pos) {
      var me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      var match = findMatch(me, withCoords);
      if (!match) return;
      if (alreadyHandled(match.location.placeId)) return;
      markHandled(match.location.placeId);

      var sport = firstPreferredSport(cu);

      if (cu.presenceAutoCheckin && sport) {
        autoRegister(cu, match.location, sport);
      } else {
        suggest(cu, match.location, sport);
      }
    }, function(err) {
      // User denied or error — don't retry this session.
      window._log('[PresenceGeo] geolocation skipped:', err && err.message);
    }, { timeout: 8000, maximumAge: 5 * 60 * 1000 });
  };
})();
