// ========================================
// scoreplace.app — Descobrir Locais (Venues)
// ========================================
// Public discovery view: find places to play. Works without login so
// travellers landing on the domain can browse before signing up.
//
// Route: #venues (with optional detail via #venues/<placeId>, handled
// here via inline modal rather than sub-route so the back button behaves
// intuitively in the SPA).

(function() {
  // Mesma lista de modalidades de create-tournament.js / venue-owner.js.
  var SPORTS = ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'];
  var PRICE_OPTIONS = [
    { val: '',    label: 'Qualquer' },
    { val: '$',   label: '$' },
    { val: '$$',  label: '$$' },
    { val: '$$$', label: '$$$' }
  ];

  function _safe(s) { return window._safeHtml ? window._safeHtml(s) : String(s || ''); }

  // Filtros persistem entre sessões — usuário não precisa reajustar cada vez.
  var FILTER_STORAGE_KEY = 'scoreplace_venues_filters';
  function _loadSavedFilters() {
    try {
      var raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) { return {}; }
  }
  function _saveFilters() {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        location: state.location,
        sports: state.sports,
        priceRange: state.priceRange,
        minCourts: state.minCourts,
        distanceKm: state.distanceKm,
        center: state.center,
        centerFromGps: !!state.centerFromGps
      }));
    } catch (e) {}
  }
  var _saved = _loadSavedFilters();

  // Migração: v0.16.3 trocou dropdown único (_saved.sport) por pills multi-select
  // (_saved.sports). Preservamos a escolha antiga seeded no array se o usuário
  // tinha filtrado por 1 esporte antes.
  var _initialSports = Array.isArray(_saved.sports)
    ? _saved.sports.slice()
    : (_saved.sport ? [_saved.sport] : []);

  var state = {
    location: _saved.location || '',
    sports: _initialSports,
    priceRange: _saved.priceRange || '',
    minCourts: _saved.minCourts || 1,
    // v1.0.11-beta: default bump 10 → 25 km. 10km mascarava venues que o
    // usuário acabou de cadastrar fora do bairro imediato (ex: Paineiras +
    // outro venue na cidade). 25 km cobre metropolitanas brasileiras
    // tipicas. _saved.distanceKm preserva ajuste manual do usuário.
    distanceKm: _saved.distanceKm || 25,
    center: (_saved.center && _saved.center.lat != null) ? _saved.center : null,
    centerFromGps: !!_saved.centerFromGps,
    loading: false,
    results: [],
    googleResults: [],
    showAllSP: false,
    mode: 'map',
    selectedPlace: null,
    // v0.16.20: quando o usuário faz check-in/plano em um preferido, a seção
    // "⭐ Locais preferidos" colapsa pra mostrar só o focado + um gráfico de
    // barras com movimento por hora. Campo null = lista completa como antes.
    // Shape: { placeId, docId, type, startsAt, endsAt, sports[], venue, prefObj }
    focusedPreferred: null
  };

  // Google Maps state — persisted across re-renders so we don't re-init.
  var _map = null;
  var _markers = [];
  var _mapsLibs = null;
  var _selectedPlaceMarker = null;

  async function _ensureMap() {
    if (!window.google || !window.google.maps || !window.google.maps.importLibrary) return;
    if (!_mapsLibs) {
      try {
        var Maps = await google.maps.importLibrary('maps');
        var Marker = await google.maps.importLibrary('marker');
        _mapsLibs = { Map: Maps.Map, AdvancedMarkerElement: Marker.AdvancedMarkerElement, PinElement: Marker.PinElement };
      } catch (e) { window._warn('Google Maps load failed:', e); return; }
    }
    var el = document.getElementById('venues-map');
    if (!el) return;
    if (!_map) {
      // Prefer the resolved city center; if we don't have one yet just
      // show Brazil — the async geocode will re-center once it resolves.
      var initialCenter = state.center || { lat: -15.78, lng: -47.93 };
      var initialZoom = state.center ? 12 : 4;
      _map = new _mapsLibs.Map(el, {
        center: initialCenter,
        zoom: initialZoom,
        mapId: 'scoreplace-venues-map',
        disableDefaultUI: false,
        clickableIcons: false,
        // 'cooperative' on mobile requires two-finger pan to move the map
        // (single-finger scroll the page). On desktop, requires Ctrl+scroll
        // to zoom. Prevents the user from getting "stuck" on the map while
        // trying to scroll the page vertically. Combined with the side
        // gutter below, vertical scrolling always has a safe touch zone.
        gestureHandling: 'cooperative'
      });
    } else {
      // Nudge the map to recompute size when it was display:none during init.
      google.maps.event.trigger(_map, 'resize');
    }
    _renderMarkers();
  }

  function _clearMarkers() {
    _markers.forEach(function(m) { if (m && m.map) m.map = null; });
    _markers = [];
  }

  // Circle that visualizes the current search radius around state.center.
  // Redrawn on every _renderMarkers so it tracks center + distanceKm.
  var _radiusCircle = null;
  var _centerMarker = null;
  function _pinSelectedPlace(lat, lng, name) {
    if (!_map || !_mapsLibs) return;
    if (_selectedPlaceMarker) { _selectedPlaceMarker.map = null; _selectedPlaceMarker = null; }
    var pos = { lat: Number(lat), lng: Number(lng) };
    var pin = new _mapsLibs.PinElement({
      background: '#6366f1', borderColor: '#3730a3', glyph: '📍', glyphColor: '#fff', scale: 1.4
    });
    _selectedPlaceMarker = new _mapsLibs.AdvancedMarkerElement({
      map: _map, position: pos, title: name || 'local selecionado', content: pin.element, zIndex: 1000
    });
    _map.setCenter(pos);
    _map.setZoom(15);
  }

  function _renderRadiusCircle() {
    if (!_map || !window.google || !window.google.maps) return;
    if (_radiusCircle) { _radiusCircle.setMap(null); _radiusCircle = null; }
    if (_centerMarker) { _centerMarker.map = null; _centerMarker = null; }
    if (!state.center) return;
    // Círculo do raio — visual do que a busca cobre.
    if (state.distanceKm) {
      _radiusCircle = new google.maps.Circle({
        strokeColor: '#6366f1',
        strokeOpacity: 0.55,
        strokeWeight: 2,
        fillColor: '#6366f1',
        fillOpacity: 0.08,
        map: _map,
        center: state.center,
        radius: state.distanceKm * 1000
      });
    }
    // Pin na posição do usuário — cor distinta (verde) dos pins de venue.
    if (_mapsLibs && _mapsLibs.AdvancedMarkerElement && _mapsLibs.PinElement) {
      var pin = new _mapsLibs.PinElement({
        background: '#10b981',
        borderColor: '#064e3b',
        glyph: '📍',
        glyphColor: '#fff',
        scale: 1.2
      });
      _centerMarker = new _mapsLibs.AdvancedMarkerElement({
        map: _map,
        position: state.center,
        title: 'Sua localização',
        content: pin.element,
        zIndex: 999 // por cima dos pins de venue
      });
    }
  }

  function _renderMarkers() {
    if (!_map || !_mapsLibs) return;
    _clearMarkers();
    _renderRadiusCircle();
    var bounds = new google.maps.LatLngBounds();
    var anyPoints = 0;

    // 1) Pins dos locais cadastrados na scoreplace (âmbar = free, índigo = pro).
    state.results.forEach(function(v) {
      if (v.lat == null || v.lon == null) return;
      var pos = { lat: Number(v.lat), lng: Number(v.lon) };
      var pin = new _mapsLibs.PinElement({
        background: v.plan === 'pro' ? '#6366f1' : '#f59e0b',
        borderColor: '#1e293b',
        glyph: '🏢',
        glyphColor: '#fff',
        scale: 1.1
      });
      var marker = new _mapsLibs.AdvancedMarkerElement({
        map: _map,
        position: pos,
        title: v.name || '',
        content: pin.element
      });
      marker.addListener('click', function() {
        if (typeof window._venuesOpenDetail === 'function') window._venuesOpenDetail(v._id);
      });
      _markers.push(marker);
      bounds.extend(pos);
      anyPoints += 1;
    });

    // 2) Pins de sugestões do Google Places — cinza translúcido pra diferenciar
    // visualmente dos locais cadastrados (que ganham cor cheia). Antes os
    // Google suggestions só apareciam na lista abaixo do mapa, o que deixava
    // a visão espacial vazia em áreas sem venues claimed. Click abre o local
    // no Google Maps em nova aba (não abre modal interna porque ainda não
    // existe na base da scoreplace — o dono pode reivindicar depois).
    var g = state.googleResults || [];
    g.forEach(function(p) {
      if (p.lat == null || p.lng == null) return;
      // Skip se já tem um venue cadastrado com o mesmo placeId — evita duplicar
      // o mesmo lugar com pin cheio + pin translúcido no mesmo ponto.
      var dupInClaimed = state.results.some(function(v) { return v.placeId && v.placeId === p.placeId; });
      if (dupInClaimed) return;
      var pos = { lat: Number(p.lat), lng: Number(p.lng) };
      var pin = new _mapsLibs.PinElement({
        background: '#64748b',       // slate-500 — discreto vs âmbar/índigo dos claimed
        borderColor: '#1e293b',
        glyph: '🔎',
        glyphColor: '#e2e8f0',
        scale: 0.9                    // menor que claimed pra reforçar hierarquia visual
      });
      var marker = new _mapsLibs.AdvancedMarkerElement({
        map: _map,
        position: pos,
        title: (p.name || '') + ' (sugestão Google)',
        content: pin.element
      });
      marker.addListener('click', function() {
        var url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name || '') +
          (p.placeId ? '&query_place_id=' + encodeURIComponent(p.placeId) : '');
        try { window.open(url, '_blank', 'noopener'); } catch(e) {}
      });
      _markers.push(marker);
      bounds.extend(pos);
      anyPoints += 1;
    });

    // Zoom/fit lógica: com center resolvido (GPS ou geocoder), mantemos o
    // usuário centrado e o raio visível em vez de pular pra bounds dos pins,
    // que faria o mapa dar zoom-out excessivo quando um pin está longe.
    // Só usamos fitBounds quando NÃO temos center (fallback) e existem pins.
    if (state.center) {
      // Center já foi setado em refresh() — aqui só garantimos zoom minimo
      // pra mostrar o raio inteiro: zoom 13 cobre ~10km, zoom 11 cobre ~40km.
      // Heurística simples: zoom = 14 - log2(distanceKm / 2) aproximado.
      var z = 13;
      if (state.distanceKm > 30) z = 10;
      else if (state.distanceKm > 15) z = 11;
      else if (state.distanceKm > 7) z = 12;
      if (_map.getZoom && _map.getZoom() < z - 1) _map.setZoom(z);
    } else if (anyPoints === 1) {
      _map.setCenter(bounds.getCenter());
      _map.setZoom(14);
    } else if (anyPoints > 1) {
      _map.fitBounds(bounds, 60);
    }
  }

  // Sport icon helper (local copy — venue-owner.js has another in its closure).
  // Somente modalidades com times de até 2 jogadores (esportes com times >2
  // como vôlei indoor, basquete, futsal, futebol e handebol ficaram de fora).
  // v0.17.16: delega ao resolver global em store.js (centralização).
  function _sportIcon(sport) { return window._sportIcon ? window._sportIcon(sport) : '🎾'; }

  // v0.16.27: helpers portados de presence.js pras seções "Agora no local"
  // e "Próximas horas" do card focado.
  function _sportsIcons(list) {
    if (!Array.isArray(list) || list.length === 0) return '';
    var seen = {};
    var out = '';
    list.forEach(function(s) {
      var ic = _sportIcon(s);
      if (ic && !seen[ic]) { seen[ic] = true; out += ic; }
    });
    return out;
  }
  // v0.17.2: delega ao helper global em store.js (auditoria L4.2).
  function _initials(name) { return window._initials(name); }

  // Pills clicáveis e não-excludentes — usuário pode filtrar por 1, vários ou
  // nenhum esporte. Sem pill ativa = "todas as modalidades". Substitui o
  // <select> singular da v0.16.2- pra dar controle mais direto (tap 1x pra
  // ligar, tap 1x pra desligar, estado visível sem abrir dropdown).
  function _sportPillsHtml() {
    return SPORTS.map(function(s) {
      var sel = Array.isArray(state.sports) && state.sports.indexOf(s) !== -1;
      var bg = sel ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'var(--bg-card)';
      var bd = sel ? '#6366f1' : 'var(--border-color)';
      var col = sel ? '#ffffff' : 'var(--text-bright)';
      var shadow = sel ? 'box-shadow:0 0 0 2px rgba(99,102,241,0.18);' : '';
      var safeS = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return '<button type="button" onclick="window._venuesToggleSport(\'' + safeS + '\')" ' +
        'aria-pressed="' + sel + '" ' +
        'style="padding:7px 12px;border-radius:999px;border:1px solid ' + bd + ';' +
        'background:' + bg + ';color:' + col + ';font-size:0.78rem;font-weight:600;' +
        'cursor:pointer;white-space:nowrap;transition:all 0.15s;line-height:1;' + shadow + '">' +
        _sportIcon(s) + ' ' + _safe(s) + '</button>';
    }).join('');
  }

  function render(container) {
    _map = null;
    _markers = [];
    _selectedPlaceMarker = null;
    state.selectedPlace = null;
    state.showAllSP = false;

    // v0.17.3: se profile ainda não carregou, registra listener one-shot
    // pra re-disparar refresh() quando os dados chegam. Evita race que
    // mostrava "Marque seus lugares favoritos" mesmo com preferreds salvos
    // (auto-update + reload + render antes do loadUserProfile completar).
    var _cuRender = window.AppStore && window.AppStore.currentUser;
    if (_cuRender && !_cuRender._profileLoaded && !state._waitingForProfile) {
      state._waitingForProfile = true;
      var _onProfile = function() {
        state._waitingForProfile = false;
        // Só re-renderiza se ainda estamos em #place / #venues
        var hash = window.location.hash || '';
        if (hash.indexOf('#place') === 0 || hash.indexOf('#venues') === 0) {
          try { refresh(); } catch (e) { window._warn('[venues v0.17.3] retry refresh failed', e); }
        }
      };
      document.addEventListener('scoreplace:profile-loaded', _onProfile, { once: true });
      // Safety net: se profile demora >5s ou evento perde, força retry uma vez
      setTimeout(function() {
        if (state._waitingForProfile) {
          state._waitingForProfile = false;
          var hash = window.location.hash || '';
          if (hash.indexOf('#place') === 0 || hash.indexOf('#venues') === 0) {
            try { refresh(); } catch (e) {}
          }
        }
      }, 5000);
    }
    // Regra: toda vez que entra, re-dispara GPS a menos que o usuário tenha
    // digitado um endereço custom (state.location existe E não é o label do
    // fallback "Minha localização atual"). Antes a flag centerFromGps
    // persistida impedia re-pedir GPS em entradas subsequentes, o que fazia
    // o pin sumir até um click manual em 📍.
    var hasCustomAddress = state.location && state.location !== 'Minha localização atual';
    if (!hasCustomAddress) {
      var cu = window.AppStore && window.AppStore.currentUser;
      var profileCity = cu && cu.city ? String(cu.city).trim() : '';
      if (!state.location && profileCity) state.location = profileCity;
      _tryAutoGeolocate();
    }

    container.innerHTML =
      (typeof window._renderBackHeader === 'function' ? window._renderBackHeader({ href: '#dashboard', label: 'Voltar' }) : '') +
      // ── Sport pills (multi-select, não-excludentes) — full width, above map ──
      '<div style="padding:10px 16px;border-bottom:1px solid var(--border-color);">' +
        '<div id="venues-sport-pills" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">' +
          _sportPillsHtml() +
        '</div>' +
      '</div>' +
      // ── Map — padded + rounded to match the fields ──
      '<div style="padding:10px 16px 0;">' +
        '<div id="venues-map" style="width:100%;height:clamp(180px,30vh,280px);background:#0a0e1a;border-radius:12px;overflow:hidden;border:1px solid var(--border-color);display:block;"></div>' +
      '</div>' +
      // ── Search bar ──
      '<div style="padding:12px 16px 0;">' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<div style="flex:1;min-width:0;position:relative;">' +
            '<input type="text" id="venues-location" value="' + _safe(state.location) + '" placeholder="Buscar por nome, endereço ou bairro…" oninput="window._venuesOnLocation(this.value)" onfocus="this.select()" onclick="this.select()" onblur="setTimeout(function(){var b=document.getElementById(\'venues-suggestions\');if(b)b.style.display=\'none\';},200)" autocomplete="off" style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:12px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.9rem;outline:none;">' +
            '<div id="venues-suggestions" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:9999;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;overflow:hidden;max-height:260px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.5);"></div>' +
          '</div>' +
          '<button type="button" id="venues-geo-btn" onclick="window._venuesUseMyLocation(true)" title="Usar minha localização" style="flex-shrink:0;width:46px;height:46px;border-radius:12px;background:#6366f1;border:none;color:#fff;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">📍</button>' +
        '</div>' +
      '</div>' +
      // ── Results (appear after GPS / search) ──
      '<div id="venues-results" style="padding:12px 16px 2rem;"></div>';

    _ensureMap();
    refresh();
  }

  function _registerCtaHtml() {
    return '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
      '<span style="font-size:0.8rem;color:var(--text-muted);">Não encontrou seu local?</span>' +
      '<button id="venues-register-btn" class="btn btn-sm btn-primary hover-lift" onclick="window.location.hash=\'#my-venues\'" style="white-space:nowrap;">+ Cadastrar local</button>' +
    '</div>';
  }

  function _venueCard(v) {
    var sportsHtml = (Array.isArray(v.sports) ? v.sports : []).slice(0, 5).map(function(s) {
      return '<span style="font-size:0.65rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;padding:2px 8px;border-radius:999px;">' + _safe(s) + '</span>';
    }).join('');
    var officialBadge = v.ownerUid
      ? '<span style="font-size:0.6rem;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#10b981;padding:1px 7px;border-radius:999px;font-weight:700;">✅ oficial</span>'
      : (v.createdByName ? '<span style="font-size:0.6rem;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:#94a3b8;padding:1px 7px;border-radius:999px;">comunidade</span>' : '');
    var distText = '';
    if (state.center && v.lat != null && v.lon != null) {
      var d = _haversineKm(state.center, { lat: Number(v.lat), lng: Number(v.lon) });
      distText = d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km';
    }
    return '<div onclick="window._venuesOpenDetail(\'' + _safe(v._id) + '\')" class="hover-lift" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">' +
          '<span style="font-weight:700;color:var(--text-bright);font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🏢 ' + _safe(v.name) + '</span>' +
          officialBadge +
        '</div>' +
        (v.address ? '<div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">' + _safe(v.address) + '</div>' : '') +
        (sportsHtml ? '<div style="display:flex;flex-wrap:wrap;gap:3px;">' + sportsHtml + '</div>' : '') +
      '</div>' +
      (distText ? '<div style="flex-shrink:0;font-size:0.74rem;font-weight:600;color:var(--text-muted);text-align:right;min-width:36px;">' + _safe(distText) + '</div>' : '') +
    '</div>';
  }

  // Variante do _venueCard usada SÓ na seção "Locais preferidos" quando o
  // preferido bate com um venue registrado. Mantém a identidade do card mas
  // adiciona uma linha de ações de presença ("Estou aqui agora" / "Planejar
  // ida") direto no card, pra o usuário não precisar abrir o detalhe só pra
  // registrar presença no seu local favorito.
  //
  // Auto check-in via GPS (presence-geo.js) continua funcionando em paralelo:
  // quando o usuário ativa o toggle no perfil e chega fisicamente no local,
  // o sistema dispara check-in sozinho com o primeiro esporte preferido. Os
  // botões aqui cobrem os casos em que o usuário quer agir manualmente
  // (sem GPS, chegou antes do radar detectar, ou quer planejar pra depois).
  function _preferredCardMatched(v) {
    var sportsHtml = (Array.isArray(v.sports) ? v.sports : []).slice(0, 5).map(function(s) {
      return '<span style="font-size:0.65rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;padding:2px 8px;border-radius:999px;">' + _safe(s) + '</span>';
    }).join('');
    var officialBadge = v.ownerUid
      ? '<span style="font-size:0.6rem;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#10b981;padding:1px 7px;border-radius:999px;font-weight:700;">✅ oficial</span>'
      : (v.createdByName ? '<span style="font-size:0.6rem;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:#94a3b8;padding:1px 7px;border-radius:999px;">comunidade</span>' : '');
    var distText = '';
    if (state.center && v.lat != null && v.lon != null) {
      var d = _haversineKm(state.center, { lat: Number(v.lat), lng: Number(v.lon) });
      distText = d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km';
    }
    var safeId = _safe(v._id);
    var safePid = _safe(v.placeId || v._id);
    // v0.16.28: data-pref-placeid guarda o placeId real pra fetch de presenças
    // em _hydrateAllPreferredMovement. Venues comunitários sem placeId ficam
    // com string vazia — hidratação pula silenciosamente.
    var safeRealPid = _safe(v.placeId || '');
    var safeVenueName = _safe(v.name || '');
    // O botão-área clicável fica DENTRO do wrapper — o wrapper em si não é
    // clicável, assim os botões de presença podem ser siblings sem precisar
    // de stopPropagation pra não disparar o abrir-detalhe.
    return '<div class="pref-matched-card hover-lift" data-pref-pid="' + safePid + '" data-pref-placeid="' + safeRealPid + '" data-pref-venuename="' + safeVenueName + '" style="background:var(--bg-card);border:1px solid rgba(251,191,36,0.35);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">' +
      '<div onclick="window._venuesOpenDetail(\'' + safeId + '\')" style="cursor:pointer;display:flex;align-items:center;gap:10px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">' +
            '<span style="font-weight:700;color:var(--text-bright);font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">⭐ ' + _safe(v.name) + '</span>' +
            officialBadge +
          '</div>' +
          (v.address ? '<div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">' + _safe(v.address) + '</div>' : '') +
          (sportsHtml ? '<div style="display:flex;flex-wrap:wrap;gap:3px;">' + sportsHtml + '</div>' : '') +
        '</div>' +
        (distText ? '<div style="flex-shrink:0;font-size:0.74rem;font-weight:600;color:var(--text-muted);text-align:right;min-width:36px;">' + _safe(distText) + '</div>' : '') +
      '</div>' +
      '<div id="pref-presence-slot-' + safePid + '" data-pref-presence-slot="' + safePid + '" style="display:flex;gap:6px;flex-wrap:wrap;"></div>' +
      // v0.16.28: slots de movimento (chart + "Agora" + "Próximas horas") ficam
      // dentro de cada card preferido. Os render functions self-wrapam e limpam
      // silenciosamente quando não há atividade, então os 3 divs ficam ocultos
      // visualmente (zero altura) em locais sem movimento.
      '<div id="pref-chart-' + safePid + '"></div>' +
      '<div id="pref-now-' + safePid + '"></div>' +
      '<div id="pref-upcoming-' + safePid + '"></div>' +
    '</div>';
  }

  function _googleVenueCard(p) {
    var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name || '') + (p.placeId ? '&query_place_id=' + encodeURIComponent(p.placeId) : '');
    var distText = '';
    if (state.center && p.lat != null && p.lng != null) {
      var d = _haversineKm(state.center, { lat: Number(p.lat), lng: Number(p.lng) });
      distText = d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km';
    }
    // v1.1.6-beta: botão "+ Cadastrar" inline no card pra que organizadores
    // possam registrar o local diretamente da lista de Sugestões do Google,
    // sem precisar abrir #my-venues e re-buscar. User: 'onde está o botão
    // para cadastrar locais? seria legal e intuitivo que ele ficasse na
    // direita de cada local (ao lado da palavra google).'
    // Estrutura mudou de <a> wrapper pra <div> com áreas clicáveis distintas:
    // (1) corpo do card abre Maps em nova aba (preserva comportamento antigo)
    // (2) botão "+ Cadastrar" stash no sessionStorage e navega pra #my-venues
    // (3) badge "Google" só visual (não clicável)
    // v1.1.8-beta: NÃO usar .btn .btn-primary aqui — em mobile (≤767px) a
    // CSS responsiva força width:100% nessas classes (.view-container
    // .btn-primary), o botão ocupa o card inteiro e some o nome do local.
    // Usa botão inline com estilo próprio que escapa da regra responsiva.
    // User: 'no celular esse cadastrar ficou péssimo. ficou enorme e só
    // se ve ele (nem dá pra saber qual o lugar).'
    // v1.1.10-beta: em mobile (≤767px), CSS esconde .gv-register-label →
    // botão vira só "+" circular pra economizar espaço. Desktop mostra
    // "+ Cadastrar" normalmente. User: 'no celular por conta do tamanho
    // da tela o botao cadastrar poderia ser apenas um circulo com + dentro'.
    var registerBtn = p.placeId
      ? '<button class="gv-register-btn" onclick="event.stopPropagation();event.preventDefault();window._venuesRegisterFromGoogle(' +
        '\'' + _safe(String(p.placeId).replace(/'/g, "\\'")) + '\',' +
        '\'' + _safe(String(p.name || '').replace(/'/g, "\\'")) + '\',' +
        '\'' + _safe(String(p.address || '').replace(/'/g, "\\'")) + '\',' +
        (p.lat != null ? Number(p.lat) : 'null') + ',' +
        (p.lng != null ? Number(p.lng) : 'null') +
        ')" style="flex-shrink:0;white-space:nowrap;font-size:0.66rem;font-weight:700;padding:3px 9px;line-height:1.3;background:rgba(99,102,241,0.18);border:1px solid rgba(99,102,241,0.45);color:#a5b4fc;border-radius:999px;cursor:pointer;" title="Cadastrar este local no scoreplace">+<span class="gv-register-label"> Cadastrar</span></button>'
      : '';
    return '<div onclick="window.open(\'' + _safe(mapsUrl) + '\', \'_blank\', \'noopener\')" style="display:flex;align-items:center;gap:10px;background:var(--bg-darker);border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;cursor:pointer;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;color:var(--text-bright);font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;">🗺️ ' + _safe(p.name) + '</div>' +
        (p.address ? '<div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _safe(p.address) + '</div>' : '') +
      '</div>' +
      (distText ? '<div style="flex-shrink:0;font-size:0.74rem;font-weight:600;color:var(--text-muted);min-width:36px;text-align:right;">' + _safe(distText) + '</div>' : '') +
      registerBtn +
      '<span style="flex-shrink:0;font-size:0.64rem;background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);color:#94a3b8;padding:2px 8px;border-radius:999px;">Google</span>' +
    '</div>';
  }

  function _selectedPlaceCard(p) {
    var ev = p.existingVenue;
    var borderColor = ev ? '#10b981' : '#6366f1';
    var safeName = _safe(p.name || '');
    var safeId = _safe(p.placeId || '');
    if (ev) {
      // Registered → compact one-liner, click opens venue detail with courts etc.
      return '<div onclick="window._venuesOpenDetail(\'' + safeId + '\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-card);border:2px solid ' + borderColor + ';border-radius:12px;padding:10px 14px;margin-bottom:14px;">' +
        '<span style="font-weight:700;color:var(--text-bright);font-size:0.9rem;flex:1;min-width:0;word-break:break-word;">📍 ' + safeName + '</span>' +
        '<span style="flex-shrink:0;display:flex;align-items:center;gap:3px;font-size:0.78rem;font-weight:700;color:#10b981;white-space:nowrap;">✅ Score</span>' +
      '</div>';
    } else {
      var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name || '') +
        (p.placeId ? '&query_place_id=' + encodeURIComponent(p.placeId) : '');
      // Unregistered Google Place: offer a one-tap "Cadastrar este local" path
      // that deep-links into #my-venues with the place data pre-stashed, so
      // the user doesn't have to re-search the same place there.
      var registerBtn = p.placeId ? '<button onclick="window._venuesRegisterPlace(event)" class="btn btn-sm btn-primary hover-lift" style="flex-shrink:0;white-space:nowrap;font-size:0.72rem;padding:4px 10px;">+ Cadastrar</button>' : '';
      return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-card);border:2px solid ' + borderColor + ';border-radius:12px;padding:10px 14px;margin-bottom:14px;">' +
        '<span style="font-weight:700;color:var(--text-bright);font-size:0.9rem;flex:1;min-width:0;word-break:break-word;">📍 ' + safeName + '</span>' +
        registerBtn +
        '<a href="' + _safe(mapsUrl) + '" target="_blank" rel="noopener" style="flex-shrink:0;font-size:0.72rem;color:#94a3b8;white-space:nowrap;text-decoration:none;" title="Abrir no Google Maps">🗺️</a>' +
      '</div>';
    }
  }

  // v0.17.2: delega ao helper global em store.js (auditoria L4.3).
  function _cleanVenueName(label) { return window._cleanVenueName(label); }

  // Chave sintética estável pra preferreds sem placeId (profile antigo só
  // salvava {lat,lng,label}). Sem essa chave, cada preferred label-only viraria
  // um "null" colidindo com outros, e os slots de presença não conseguiriam
  // hidratar independentemente. A chave também é usada como `placeId` do doc
  // de presença — presenças feitas aqui ficam casadas com o mesmo preferred
  // em sessões futuras.
  function _prefSyntheticPid(p) {
    if (p && p.placeId) return p.placeId;
    var lat = p && p.lat != null ? Number(p.lat) : null;
    var lon = (p && (p.lng != null ? p.lng : (p.lon != null ? p.lon : null)));
    if (lat != null && lon != null) {
      return 'pref_' + Math.round(lat * 10000) + '_' + Math.round(lon * 10000);
    }
    var nm = String((p && (p.name || p.label)) || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    return 'pref_' + (nm || 'unknown');
  }

  // ----------------------------------------------------------------------
  // v0.16.20 — Gráfico de movimento por hora, portado de presence.js.
  // Quando o usuário faz check-in/plano em um preferido, a seção Preferidos
  // colapsa e mostra só o focado + este gráfico com a janela de 13h centrada
  // na hora atual. Barras amarelas = amigos+você, cinzas = outros usuários.
  // Inclui ocupação virtual derivada de torneios com startDate hoje.
  // ----------------------------------------------------------------------
  var WINDOW_HOURS = 13;
  var _chartTickInterval = null;

  function _hourOf(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    return d.getHours();
  }

  // Classify a presence as 'me' / 'friend' / 'other'. venues.js não mantém
  // um índice de amigos em state, então lemos direto de cu.friends a cada
  // chamada (lista é pequena — sem impacto de perf).
  function _classifyPresence(p) {
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && (cu.uid || '');
    if (myUid && p.uid === myUid) return 'me';
    var friends = (cu && Array.isArray(cu.friends)) ? cu.friends : [];
    if (p.uid && friends.indexOf(p.uid) !== -1) return 'friend';
    // v2.1.72: rede de segurança — participante/presença SEM uid (ex.: inscrito
    // no torneio só pelo nome, antes do auto-vínculo) casa pelo NOME contra os
    // perfis de amigos cacheados. Resolve "amigo cai no +N por falta de uid".
    var dn = p.displayName || p.name || '';
    if (dn && window._friendProfilesCache) {
      var norm = window._normalizeName ? window._normalizeName(dn) : String(dn).trim().toLowerCase();
      var cache = window._friendProfilesCache;
      for (var i = 0; i < friends.length; i++) {
        var prof = cache[friends[i]];
        var fn = prof && prof.displayName;
        if (fn && (window._normalizeName ? window._normalizeName(fn) : String(fn).trim().toLowerCase()) === norm) return 'friend';
      }
    }
    return 'other';
  }

  function _currentWindow() {
    var nowH = new Date().getHours();
    var half = Math.floor(WINDOW_HOURS / 2);
    var out = [];
    for (var i = -half; i <= WINDOW_HOURS - half - 1; i++) out.push(nowH + i);
    return { hours: out, nowH: nowH };
  }

  // Mesma lógica do presence.js: torneio com startDate hoje conta como N
  // "presenças virtuais" (1 por participante, ancoradas no startDate→endDate
  // ou 3h). Organizador fica fora pra não inflar as barras.
  function _tournamentOccupancy(t, dayKeyStr) {
    var out = [];
    if (!t || !t.startDate) return out;
    // v2.4.72-beta: Liga/Ranking NÃO presume presença no local. Numa Liga o
    // sorteio acontece e cada dupla combina o dia do seu jogo até o próximo
    // sorteio — não é um evento de dia único em que todos estão no clube. Logo,
    // nada de presença virtual ancorada no startDate. Vale só pra torneios de
    // dia único (eliminatórias, grupos, etc.).
    if (window._isLigaFormat && window._isLigaFormat(t)) return out;
    var start = new Date(t.startDate);
    if (isNaN(start.getTime())) return out;
    if (window.PresenceDB.dayKey(start) !== dayKeyStr) return out;
    var endMs = start.getTime() + (3 * 60 * 60 * 1000);
    if (t.endDate) {
      var end = new Date(t.endDate);
      if (!isNaN(end.getTime()) && end.getTime() > start.getTime()) endMs = end.getTime();
    }
    var parts = Array.isArray(t.participants) ? t.participants : [];
    var count = Math.max(parts.length, 1);
    for (var i = 0; i < count; i++) {
      var p = parts[i] || {};
      // v2.1.68: carrega displayName + photoURL do participante pra que AMIGOS
      // apareçam com nome/foto reais (antes vinham só com uid → fallback "Amigo").
      out.push({
        _virtual: true,
        uid: p.uid || null,
        displayName: p.displayName || p.name || '',
        photoURL: p.photoURL || p.photo || '',
        startsAt: start.getTime(),
        endsAt: endMs,
        type: 'tournament'
      });
    }
    return out;
  }

  // Renderiza o gráfico dentro do slot `boxId` usando as presenças passadas
  // (já carregadas por _hydrateAllPreferredMovement) + ocupação virtual de
  // torneios com startDate hoje no mesmo venue.
  // v0.16.28: aceita boxId direto (antes `safePid` com prefixo fixo) pra ser
  // reusável entre o modo focado e os cards não-focados de cada preferido.
  // Também self-wraps em container estilizado — assim o slot pode ficar vazio
  // quando não há atividade, sem poluir o card com bg/borda de placeholder.
  // v0.16.49: capacidade do venue = sum(court.count) × 4 jogadores por quadra.
  // Usado como denominador fixo do gráfico horário — barra cheia = venue lotado
  // (todas as quadras com 4 jogadores). Antes a escala era relativa ao máximo
  // bucket encontrado, então 1 amigo num venue vazio enchia a barra inteira,
  // dando impressão de movimento alto. Agora 1 pessoa em venue de 36 vagas
  // (Paineiras BT) renderiza barra de ~3% — visualmente "vazio".
  // Sem courts cadastrados: retorna 0 (caller cai no fallback de max-bucket).
  function _calcVenueCapacity(venue) {
    if (!venue) return 0;
    var courts = Array.isArray(venue.courts) ? venue.courts : [];
    var totalCourts = 0;
    courts.forEach(function(c) {
      var n = parseInt(c && c.count, 10);
      if (n > 0) totalCourts += n;
    });
    return totalCourts * 4; // 4 jogadores por quadra (default razoável pra todas as modalidades suportadas)
  }
  window._venuesCalcCapacity = _calcVenueCapacity;

  // v1.0.9-beta: opts.venueName/opts.realPid permitem renderizar CTA "Cadastrar
  // quadras" inline quando o venue não tem capacidade real cadastrada. Sem opts
  // (legacy callers), só não renderiza a CTA — comportamento anterior preservado.
  // v2.8.73: regra ÚNICA de visibilidade temporal pra presença/plano vindo de
  // TORNEIO — só "vale" a partir de 24h antes do evento (usa a data ATUAL do
  // torneio, não o startsAt defasado do doc). Plano/presença MANUAL (sem torneio)
  // é sempre visível. Usada no auto-focus (card PLANO ATIVO), no gráfico de
  // movimento e na detecção de plano ativo dos botões inline. Assim um torneio a
  // 9 dias para de aparecer como movimento/PLANO ATIVO no Place.
  function _tournamentStartMs(liveT) {
    if (!liveT) return 0;
    var w = (typeof window._computeTournamentPlanWindow === 'function') ? window._computeTournamentPlanWindow(liveT) : null;
    return (w && w.startsAt) || (liveT.startDate ? new Date(liveT.startDate).getTime() : 0);
  }
  function _tournVisibleNow(liveT) {
    var s = _tournamentStartMs(liveT);
    return !s || s <= (Date.now() + 24 * 3600000);
  }
  function _presenceVisibleNow(p) {
    if (!p) return false;
    var isTourn = !!(p.tournamentId || p.source === 'tournament' || p.type === 'tournament');
    if (!isTourn) return true; // manual: sempre visível
    var liveT = (p.tournamentId && typeof window._findTournamentById === 'function') ? window._findTournamentById(p.tournamentId) : null;
    if (liveT) return _tournVisibleNow(liveT);
    var s = p.startsAt || 0;
    return !s || s <= (Date.now() + 24 * 3600000);
  }

  function _renderPreferredChart(boxId, presences, tournaments, dayKeyStr, venueCapacity, opts) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var win = _currentWindow();

    var buckets = {};
    for (var h = 0; h < 24; h++) buckets[h] = { friends: 0, me: 0 };

    // v0.16.30: gráfico reflete apenas atividade real do usuário + amigos.
    // Strangers (klass='other') e ocupação virtual de torneios não são
    // contabilizados — evita o efeito de "mostrar gente genérica" mesmo
    // quando só o usuário tem plano/presença no local.
    // v0.16.33: dedup por uid por hora. Múltiplos docs do mesmo usuário
    // (ex: check-in + plano sobrepostos, ou check-ins antigos não encerrados)
    // contam como 1 pessoa única na barra daquela hora.
    // v0.16.34: dropa presenças já encerradas (endsAt < now) — defende contra
    // docs stale de testes antigos que ninguém cancelou.
    // v0.16.35: volta a contar o próprio usuário no gráfico. A v0.16.34 havia
    // excluído "me" achando que era redundante com "Agora"/"Próximas horas",
    // mas o usuário reportou via screenshot ("cade o grafico? se chego as 20h
    // tem que aparecer isso no grafico") que quer ver sua própria presença/plano
    // refletida na barra. Modelo mental natural: o gráfico é um mapa de quem
    // estará presente naquela hora, **incluindo o próprio usuário**. Mantém
    // dedup por uid (v0.16.33) pra evitar contar múltiplos docs da mesma pessoa
    // + filtro stale (v0.16.34) pra ignorar docs não encerrados.
    // v2.1.68: além das presenças reais, conta a ocupação virtual de torneios
    // (1 por participante) — mas só pra VOCÊ e AMIGOS (strangers continuam fora).
    // Assim o torneio do dia aparece no gráfico (ex.: barras às 17h). Dedup por
    // uid/hora (abaixo) evita contar 2x quem tem plano real + ocupação.
    // v2.8.73: planos vindos de torneio a >2 dias NÃO contam no movimento (antes
    // 19 inscritos de um torneio a 9 dias enchiam as barras).
    var _chartSource = (presences || []).filter(_presenceVisibleNow);
    (tournaments || []).forEach(function(tt) {
      if (!_tournVisibleNow(tt)) return; // v2.8.73: ocupação de torneio distante fora
      try { _tournamentOccupancy(tt, dayKeyStr).forEach(function(op) { _chartSource.push(op); }); } catch (e) {}
    });
    var nowMs = Date.now();
    var seenInBucket = {};
    for (var ih = 0; ih < 24; ih++) seenInBucket[ih] = {};
    _chartSource.forEach(function(p) {
      var klass = _classifyPresence(p);
      // v2.1.72: presença de TORNEIO conta sempre (todos os inscritos são
      // presença confirmada e conhecida — não são "estranhos"). Presença avulsa
      // de não-amigo continua fora.
      if (klass !== 'me' && klass !== 'friend' && p.type !== 'tournament') return;
      // Drop stale: presença já terminou
      var endTs = null;
      try {
        if (p.endsAt && typeof p.endsAt.toMillis === 'function') endTs = p.endsAt.toMillis();
        else if (p.endsAt instanceof Date) endTs = p.endsAt.getTime();
        else if (typeof p.endsAt === 'number') endTs = p.endsAt;
        else if (typeof p.endsAt === 'string') { var d = new Date(p.endsAt); if (!isNaN(d.getTime())) endTs = d.getTime(); }
      } catch (e) {}
      if (endTs != null && endTs < nowMs) return;
      var startH = _hourOf(p.startsAt);
      var endH = _hourOf(p.endsAt);
      if (startH == null || endH == null) return;
      var key = p.uid || p.displayName || '';
      if (!key) return;
      for (var h = startH; h <= endH; h++) {
        if (!buckets[h]) continue;
        if (seenInBucket[h][key]) continue;
        seenInBucket[h][key] = true;
        if (klass === 'me') buckets[h].me += 1;
        else buckets[h].friends += 1;
      }
    });

    // v2.1.68: a janela default é 13h centrada em AGORA. Mas se houver atividade
    // fora dela (ex.: torneio à noite às 17h enquanto agora são 9h), estende a
    // faixa de horas exibida pra incluí-la — assim o gráfico mostra o torneio.
    // O container tem overflow-x:auto, então a largura extra rola horizontalmente.
    var displayHours = win.hours.slice();
    var _actMin = null, _actMax = null;
    for (var _ah = 0; _ah < 24; _ah++) {
      if (buckets[_ah] && (buckets[_ah].friends + buckets[_ah].me) > 0) {
        if (_actMin === null) _actMin = _ah;
        _actMax = _ah;
      }
    }
    if (_actMin !== null) {
      var _lo = Math.min(displayHours[0], _actMin);
      var _hi = Math.max(displayHours[displayHours.length - 1], _actMax);
      displayHours = [];
      for (var _dh = _lo; _dh <= _hi; _dh++) displayHours.push(_dh);
    }
    // v2.8.74: estende a faixa pras horas do LOCAL (openingHours do dia) — assim o
    // gráfico no "Planejar ida" cobre hora atual + horas de funcionamento. Com
    // overflow-x:auto, o scroll lateral mostra tudo.
    if (opts && Array.isArray(opts.forceHours) && opts.forceHours.length) {
      var _flo = Math.min.apply(null, opts.forceHours);
      var _fhi = Math.max.apply(null, opts.forceHours);
      var _lo3 = Math.min(displayHours[0], _flo);
      var _hi3 = Math.max(displayHours[displayHours.length - 1], _fhi);
      displayHours = [];
      for (var _d3 = _lo3; _d3 <= _hi3; _d3++) displayHours.push(_d3);
    }

    // v0.16.49 / v1.0.8-beta: escala muda dependendo de ter capacidade do venue.
    //   - Com capacidade (courts cadastrados): denominador = capacidade fixa.
    //     1 pessoa em venue de 36 vagas = barra ~3% (visualmente "vazio").
    //   - Sem capacidade: fallback agora usa baseline mínimo (16 = 4 quadras × 4
    //     jogadores) em vez de max-bucket-relative. Antes, 1 pessoa em venue
    //     sem courts cadastrados → max-bucket=1 → barra 100% ("lotado!"
    //     visualmente quando deveria parecer "vazio"). Bug reportado: 1 pessoa
    //     em Paineiras (9 quadras, mas sem `courts[]` no doc OU placeId
    //     synthetic `pref_lat_lng` que não casa com loadVenue) enchia barra
    //     inteira. Baseline 16 garante 1 pessoa ≈ 6% bar — visualmente "vazio"
    //     mesmo quando não temos dado real de capacidade.
    var DEFAULT_FALLBACK_CAPACITY = 16; // 4 courts × 4 players — pequeno venue baseline
    var hasCapacity = venueCapacity && venueCapacity > 0;
    var maxPerBucket = hasCapacity ? venueCapacity : DEFAULT_FALLBACK_CAPACITY;
    if (!hasCapacity) {
      // Quando observamos pico maior que o baseline (raro, venue de fato
      // movimentado mas sem courts cadastrados), expande pra acomodar — o
      // pico fica em 100% e os demais escalonam proporcionalmente.
      displayHours.forEach(function(slot) {
        if (slot < 0 || slot > 23) return;
        var b = buckets[slot];
        var total = b.friends + b.me;
        if (total > maxPerBucket) maxPerBucket = total;
      });
    }

    var bars = '';
    displayHours.forEach(function(slot) {
      var inDay = slot >= 0 && slot <= 23;
      var labelH = ((slot % 24) + 24) % 24;
      var b = inDay ? buckets[slot] : { friends: 0, me: 0 };
      var total = b.friends + b.me;
      // Clamp em 100% pro caso (raro) de venue lotado além da capacidade declarada.
      var totalPct = total > 0 ? Math.min(100, Math.round((total / maxPerBucket) * 100)) : 0;
      var isNow = slot === win.nowH;
      var labelColor = isNow ? 'var(--primary-color)' : (inDay ? 'var(--text-muted)' : 'rgba(107,114,128,0.5)');
      var tooltipExtra = hasCapacity
        ? ' / ' + venueCapacity + ' (' + totalPct + '%)'
        : ' (escala estimada — local sem quadras cadastradas)';
      bars += '<div data-hour="' + slot + '" title="' + labelH + 'h: ' + total + ' pessoa(s)' + tooltipExtra + '" style="flex:0 0 28px;display:flex;flex-direction:column;align-items:center;gap:2px;' + (isNow ? 'transform:scale(1.05);' : '') + '">' +
        '<div style="position:relative;height:90px;width:20px;display:flex;flex-direction:column-reverse;border-radius:4px;background:' + (isNow ? 'rgba(99,102,241,0.1)' : 'rgba(150,150,150,0.08)') + ';overflow:hidden;' + (isNow ? 'outline:2px solid rgba(99,102,241,0.4);' : '') + '">' +
          (total > 0
            ? '<div style="height:' + totalPct + '%;width:100%;background:#fbbf24;"></div>'
            : '') +
          (total > 0 ? '<span style="position:absolute;top:2px;left:0;right:0;text-align:center;font-size:0.6rem;font-weight:700;color:var(--text-bright);text-shadow:0 1px 2px rgba(0,0,0,0.5);">' + total + '</span>' : '') +
        '</div>' +
        '<span style="font-size:0.65rem;color:' + labelColor + ';font-weight:' + (isNow ? 700 : 500) + ';">' + labelH + '</span>' +
      '</div>';
    });

    // v0.16.28: só renderiza se há atividade real na janela; senão limpa
    // silenciosamente (consistente com "Agora" e "Próximas horas"). Evita
    // poluir card com caixa vazia quando o local não tem movimento.
    // v0.16.35: volta a incluir o usuário no check — se o próprio usuário
    // tem check-in/plano no local, o gráfico aparece mesmo sem amigos.
    var hasActivity = false;
    for (var hh = 0; hh < 24; hh++) {
      if (buckets[hh] && (buckets[hh].friends + buckets[hh].me) > 0) {
        hasActivity = true; break;
      }
    }
    // v2.8.74: opts.alwaysShow força renderizar a grade de horas mesmo sem
    // movimento (usado no "Planejar ida" — a tabela hora-a-hora serve de
    // referência pra escolher o horário, mesmo com o local vazio).
    if (!hasActivity && !(opts && opts.alwaysShow)) { box.innerHTML = ''; return; }

    // v0.16.28: self-wraps em container estilizado — assim o slot pode ficar
    // vazio (sem bg/borda de placeholder) quando não há atividade, e o mesmo
    // renderer funciona tanto no card (dentro da lista) quanto no modo focado.
    // v0.16.30: legenda reduzida a só "você/amigos" (barra âmbar única) —
    // strangers/torneios não contribuem mais ao gráfico.
    // v0.16.35: legenda volta a "você e amigos" — o gráfico conta ambos de novo.
    // v0.16.50: label "escala: N (X quadras × 4)" removida do header — info
    // continua disponível no tooltip ao passar mouse na barra ("Nh: P / N (X%)").
    // v1.0.9-beta: CTA inline pra "Cadastrar quadras" quando venue não tem
    // capacidade cadastrada. Direciona pra #my-venues com o nome/coords
    // pré-preenchidos via sessionStorage (mesmo padrão do _venuesRegisterPlace).
    var registerCta = '';
    if (!hasCapacity) {
      var ctxName = (opts && opts.venueName) || '';
      var ctxPid  = (opts && opts.realPid) || '';
      var ctxLat  = (opts && opts.lat != null) ? opts.lat : null;
      var ctxLon  = (opts && opts.lon != null) ? opts.lon : null;
      // Stash via onclick — sessionStorage só pode ser setado em event handler;
      // não dá pra fazer no momento da render.
      var stashJson = JSON.stringify({
        placeId: ctxPid,
        name: ctxName,
        lat: ctxLat,
        lon: ctxLon
      }).replace(/"/g, '&quot;');
      var clickHandler = "try{sessionStorage.setItem('scoreplace_pending_venue_registration','" +
        stashJson.replace(/'/g, "\\'") + "');}catch(e){}window.location.hash='#my-venues';return false;";
      registerCta =
        '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(251,191,36,0.2);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<span style="font-size:0.7rem;color:var(--text-muted);flex:1;min-width:180px;">' +
            '⚠️ Escala estimada — local sem quadras cadastradas.' +
          '</span>' +
          '<a href="#my-venues" onclick="' + clickHandler + '" style="font-size:0.72rem;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);padding:4px 10px;border-radius:8px;text-decoration:none;white-space:nowrap;">🎾 Cadastrar quadras →</a>' +
        '</div>';
    }
    // v1.0.18-beta: título dinâmico — "Movimento hoje" / "Movimento amanhã"
    // / "Movimento em N dias" baseado em opts.dayLabel passado pelo caller.
    var titleLabel = (opts && opts.dayLabel)
      ? 'Movimento ' + opts.dayLabel
      : 'Movimento hoje';
    box.innerHTML =
      '<div style="background:var(--bg-darker);border:1px solid rgba(251,191,36,0.18);border-radius:12px;padding:10px 12px;margin-top:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">' +
          '<span style="font-weight:700;color:var(--text-bright);font-size:0.9rem;">' + titleLabel + '</span>' +
          '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.68rem;color:var(--text-muted);"><span style="width:10px;height:10px;background:#fbbf24;border-radius:2px;"></span> você e amigos</span>' +
        '</div>' +
        '<div data-bars-scroll="1" style="display:flex;gap:2px;overflow-x:auto;padding-bottom:4px;justify-content:space-between;">' + bars + '</div>' +
        registerCta +
      '</div>';
    // v2.8.74: foca o scroll na hora pedida (hora atual hoje / abertura do local
    // amanhã). Deferido pra garantir layout antes de medir offsetLeft.
    if (opts && typeof opts.scrollToHour === 'number') {
      setTimeout(function() {
        try {
          var _wrap = box.querySelector('[data-bars-scroll]');
          var _tgt = box.querySelector('[data-hour="' + opts.scrollToHour + '"]');
          if (_wrap && _tgt) _wrap.scrollLeft = Math.max(0, _tgt.offsetLeft - 70);
        } catch (e) {}
      }, 0);
    }
  }

  // v0.16.27 — "Agora no local": card com avatares+ícones de modalidade pros
  // amigos (e você) com presença ativa neste momento no venue. Outros
  // (não-amigos) agregam numa pill "+N". Portado do #presence (renderNowAtVenue
  // em presence.js linhas 580-656).
  // v0.16.28: aceita boxId direto pra ser reusável em cada card preferido
  // (não só no modo focado).
  function _renderNowAtVenueBox(boxId, presences, realPid) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var now = Date.now();
    function _hhmm(ts){ try{ var d=new Date(ts); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }catch(e){ return ''; } }
    // v2.8.95: ESTADA ALONGADA — check-in continua em "Agora no local" até 3h depois
    // do horário previsto de saída ("ia embora tal hora mas não foi") ou até cancelar.
    var _GRACE = 3 * 3600000;
    var active = (presences || []).filter(function(p) {
      return p && p.type !== 'planned' && p.startsAt <= now && ((p.endsAt || now) + _GRACE) > now;
    });
    if (active.length === 0) { box.innerHTML = ''; return; }
    // v2.8.95: menor horário planejado por uid → detecta "chegou antes" (check-in antes do plano)
    var _planStartByUid = {};
    (presences || []).forEach(function(q){ if (q && q.type === 'planned' && q.uid && (q.endsAt||q.startsAt) > now) { if (_planStartByUid[q.uid] == null || q.startsAt < _planStartByUid[q.uid]) _planStartByUid[q.uid] = q.startsAt; } });
    var seen = {};
    var friendsHtml = [];
    var otherCount = 0;
    active.forEach(function(p) {
      var klass = _classifyPresence(p);
      if (klass === 'me' || klass === 'friend') {
        var key = p.uid || (p.displayName + '|' + p.startsAt);
        if (seen[key]) return;
        seen[key] = true;
        // v0.16.30: nome do próprio usuário vira "Você" (sem displayName).
        // Pra amigos, mantém o nome real. Suffix "(você)" fica redundante.
        var name = klass === 'me' ? 'Você' : (p.displayName || 'Amigo');
        var mins = Math.max(0, Math.round((now - p.startsAt) / 60000));
        var subtitle = 'há ' + mins + ' min';
        // v2.8.95: passou do horário previsto de saída → estada "alongada"
        if (p.endsAt && p.endsAt < now) { subtitle = '⏱️ alongado · passou das ' + _hhmm(p.endsAt); }
        // v2.8.95: fez check-in ANTES do horário que tinha planejado chegar
        else if (p.uid && _planStartByUid[p.uid] != null && _planStartByUid[p.uid] > p.startsAt) { subtitle = '✅ chegou antes · planejou ' + _hhmm(_planStartByUid[p.uid]); }
        var borderColor = klass === 'me' ? '#10b981' : '#fbbf24';
        var avatar = p.photoURL
          ? '<img src="' + _safe(p.photoURL) + '" alt="" style="width:40px;height:40px;display:block;border-radius:50%;object-fit:cover;border:2px solid ' + borderColor + ';flex-shrink:0;">'
          : '<div style="width:40px;height:40px;min-width:40px;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;border:2px solid ' + borderColor + ';flex-shrink:0;">' + _safe(_initials(name)) + '</div>';
        // v0.16.32: botão "Sair" discreto, bold, maior, inline logo depois
        // do nome "Você" — sem círculo, sem sobreposição na foto.
        // v0.16.65: usa p.placeId do próprio doc com fallback pra realPid (igual
        // ao chip de "Próximas horas"). Sem essa relaxada, ✕ sumia em preferidos
        // label-only / venues comunitários sem Google placeId.
        var leaveBtn = '';
        var pidForLeave = p.placeId || realPid || '';
        if (klass === 'me' && p._id) {
          var docIdSafe = String(p._id).replace(/"/g, '&quot;');
          var pidSafe = String(pidForLeave).replace(/"/g, '&quot;');
          leaveBtn = '<button onclick=\'event.stopPropagation(); window._venuesCancelMyPresenceHere("' + docIdSafe + '","' + pidSafe + '","checkin")\' style="background:transparent;color:#ef4444;border:none;padding:0;margin:0;font-weight:900;font-size:1.15rem;line-height:1;cursor:pointer;flex-shrink:0;" title="Sair do local">✕</button>';
        }
        var nowSports = Array.isArray(p.sports) ? p.sports : [];
        var icons = _sportsIcons(nowSports);
        var iconsHtml = icons
          ? '<span title="' + _safe(nowSports.join(', ')) + '" style="font-size:1rem;line-height:1;flex-shrink:0;">' + icons + '</span>'
          : '';
        // v0.16.51: min-height fixo (60px) + box-sizing border-box garantem
        // que cards com ✕ (1.15rem) tenham mesma altura que cards sem ✕.
        // Avatar 40px + padding 8px*2 = 56px; 60px dá folga pro border.
        friendsHtml.push(
          '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-darker);border-radius:10px;min-height:60px;box-sizing:border-box;">' +
            iconsHtml + avatar +
            '<div style="flex:1;min-width:0;">' +
              '<div style="display:flex;align-items:center;gap:6px;min-width:0;">' +
                '<span style="font-weight:600;font-size:0.88rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _safe(name) + '</span>' +
                leaveBtn +
              '</div>' +
              '<div style="font-size:0.72rem;color:var(--text-muted);">' + _safe(subtitle) + '</div>' +
            '</div>' +
          '</div>'
        );
      } else if (p.visibility === 'public' || p.type === 'tournament') {
        otherCount += 1;
      }
    });
    if (friendsHtml.length === 0 && otherCount === 0) { box.innerHTML = ''; return; }
    var friendsGrid = friendsHtml.length > 0
      ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:' + (otherCount > 0 ? '10px' : '0') + ';">' + friendsHtml.join('') + '</div>'
      : '';
    var othersPill = otherCount > 0
      ? '<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(107,114,128,0.15);border:1px solid rgba(107,114,128,0.3);border-radius:999px;color:var(--text-bright);font-weight:600;font-size:0.8rem;">👥 +' + otherCount + ' outro' + (otherCount === 1 ? '' : 's') + '</div>'
      : '';
    box.innerHTML =
      '<div style="margin-top:10px;background:var(--bg-darker);border:1px solid rgba(16,185,129,0.25);border-radius:12px;padding:10px 12px;">' +
        '<div style="font-weight:700;color:var(--text-bright);margin-bottom:8px;font-size:0.88rem;display:flex;align-items:center;gap:6px;">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>' +
          'Agora no local' +
        '</div>' +
        friendsGrid + othersPill +
      '</div>';
  }

  // v0.16.27 — "Próximas horas": chips hora-a-hora dos amigos (e você) que
  // planejaram ir + ocupação virtual de torneios com startDate hoje. Portado
  // do #presence (renderUpcoming em presence.js linhas 659-740).
  // v0.16.28: aceita boxId direto pra ser reusável em cada card preferido.
  // v2.4.72-beta: opts.maxChips (>0) limita quantos amigos aparecem
  // nominalmente por grupo — os excedentes (ranqueados por menor interação)
  // são dobrados no "+N". Usado no dashboard pra não listar dezenas de nomes.
  // Sem opts/maxChips: mostra TODOS os nomes (detalhe do local).
  function _renderUpcomingBox(boxId, presences, tournaments, dayKeyStr, realPid, opts) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var maxChips = (opts && opts.maxChips) || 0;
    var _scoreCache = {};
    var now = Date.now();
    // v2.8.71: torneio (plano OU ocupação) só aparece em "Próximas horas" a partir de 2
    // dias antes do evento — antes um torneio a 9 dias já poluía como "8h". Usa a data
    // ATUAL do torneio (não o startsAt do doc, que pode estar defasado). Presença manual
    // (sem torneio) continua aparecendo normal.
    var _soonCut = now + 24 * 3600000;
    function _tournTooFar(liveT) {
      if (!liveT) return false;
      var w = (typeof window._computeTournamentPlanWindow === 'function') ? window._computeTournamentPlanWindow(liveT) : null;
      var s = (w && w.startsAt) || (liveT.startDate ? new Date(liveT.startDate).getTime() : 0);
      return !!(s && s > _soonCut);
    }
    // v2.8.95: quem JÁ fez check-in não aparece como plano (já está em "Agora no local").
    var _checkedInUids = {};
    (presences || []).forEach(function(p) {
      if (p && p.type !== 'planned' && p.startsAt <= now && ((p.endsAt || now) + 3*3600000) > now && p.uid) _checkedInUids[p.uid] = true;
    });
    var rows = [];
    (presences || []).forEach(function(p) {
      // v2.8.92: plano EM ANDAMENTO (já começou, ainda não acabou) também aparece —
      // antes o filtro era `startsAt > now`, então um plano 19-21h às 19:47 sumia
      // (não entra em "Agora no local", que é só check-in). Agora basta não ter acabado.
      if (p.type === 'planned' && ((p.endsAt || p.startsAt) > now)) {
        // v2.8.95: já fez check-in → não duplica como plano. Sem check-in e a hora
        // de chegada já passou → ATRASADO (⏰): o plano continua até endsAt/cancelar.
        if (p.uid && _checkedInUids[p.uid]) return;
        p._late = (p.startsAt < now);
        // v2.8.59: plano de presença vindo de TORNEIO ganha o nome do torneio (igual ao
        // dashboard) → cai no box "🏆 <torneio>" em vez de chip avulso sem contexto.
        if ((p.tournamentId || p.source === 'tournament') && typeof window._findTournamentById === 'function') {
          var _lt = p.tournamentId ? window._findTournamentById(p.tournamentId) : null;
          if (_tournTooFar(_lt)) return; // v2.8.71: torneio a >2 dias não entra
          if (_lt && !p._tournamentName) { p._tournamentName = _lt.name || ''; p._tournamentId = p.tournamentId || _lt.id || _lt._id || ''; }
        }
        rows.push(p);
      }
    });
    (tournaments || []).forEach(function(t) {
      if (_tournTooFar(t)) return; // v2.8.71: ocupação de torneio a >2 dias não entra
      _tournamentOccupancy(t, dayKeyStr).forEach(function(p) {
        if (p.startsAt > now) {
          p._tournamentName = t.name || 'torneio';
          p._tournamentId = t.id || t._id || '';
          rows.push(p);
        }
      });
    });
    if (rows.length === 0) { box.innerHTML = ''; return; }
    var groups = {};
    rows.forEach(function(p) {
      var h = _hourOf(p.startsAt);
      if (h == null) return;
      if (!groups[h]) groups[h] = [];
      groups[h].push(p);
    });
    var hours = Object.keys(groups).map(Number).sort(function(a, b) { return a - b; });
    var html =
      '<div style="margin-top:10px;background:var(--bg-darker);border:1px solid rgba(99,102,241,0.25);border-radius:12px;padding:10px 12px;">' +
        '<div style="font-weight:700;color:var(--text-bright);margin-bottom:8px;font-size:0.88rem;">🗓️ Próximas horas</div>';
    // chip de uma pessoa (você/amigo) — mesma marcação usada antes.
    function _hhmmU(ts){ try{ var d=new Date(ts); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }catch(e){ return ''; } }
    var _personChip = function(p, klass) {
      var name = klass === 'me' ? 'Você' : (p.displayName || 'Amigo');
      // v2.8.95: ATRASADO — plano cujo horário de chegada já passou (sem check-in).
      var late = !!p._late;
      var borderColor = late ? '#f59e0b' : (klass === 'me' ? '#10b981' : '#fbbf24');
      var lateIcon = late ? '<span title="Atrasado — planejou chegar às ' + _hhmmU(p.startsAt) + ', ainda sem check-in" style="font-size:0.85rem;line-height:1;flex-shrink:0;">⏰</span>' : '';
      var avatar = p.photoURL
        ? '<img src="' + _safe(p.photoURL) + '" alt="" style="width:26px;height:26px;display:block;border-radius:50%;object-fit:cover;border:2px solid ' + borderColor + ';box-sizing:border-box;flex-shrink:0;">'
        : '<div style="width:26px;height:26px;min-width:26px;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.68rem;border:2px solid ' + borderColor + ';box-sizing:border-box;flex-shrink:0;">' + _safe(_initials(name)) + '</div>';
      var cancelBtn = '';
      var pidForCancel = p.placeId || realPid || '';
      if (klass === 'me' && p._id) {
        var upDocIdSafe = String(p._id).replace(/"/g, '&quot;');
        var upPidSafe = String(pidForCancel).replace(/"/g, '&quot;');
        cancelBtn = '<button onclick=\'event.stopPropagation(); window._venuesCancelMyPresenceHere("' + upDocIdSafe + '","' + upPidSafe + '","planned")\' style="background:transparent;color:#ef4444;border:none;padding:0;margin:0;font-weight:900;font-size:1rem;line-height:1;cursor:pointer;flex-shrink:0;" title="Cancelar plano de ir">✕</button>';
      }
      var chipSports = Array.isArray(p.sports) ? p.sports : [];
      var iconStr = _sportsIcons(chipSports);
      return '<div title="' + (late ? 'Atrasado — sem check-in' : '') + '" style="display:inline-flex;align-items:center;gap:6px;background:' + (late ? 'rgba(245,158,11,0.16)' : 'rgba(251,191,36,0.08)') + ';border:1px solid ' + (late ? 'rgba(245,158,11,0.55)' : 'rgba(251,191,36,0.25)') + ';border-radius:999px;padding:3px 10px 3px 6px;min-width:0;height:36px;box-sizing:border-box;line-height:1;">' +
        lateIcon +
        (iconStr ? '<span title="' + _safe(chipSports.join(', ')) + '" style="font-size:0.88rem;line-height:1;flex-shrink:0;">' + iconStr + '</span>' : '') +
        avatar +
        '<span style="font-size:0.76rem;color:var(--text-bright);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1;">' + _safe(name) + '</span>' +
        cancelBtn +
      '</div>';
    };
    var _plusPill = function(n) {
      return '<span style="background:rgba(107,114,128,0.18);border:1px solid rgba(107,114,128,0.3);color:var(--text-bright);font-size:0.72rem;font-weight:600;padding:2px 10px;border-radius:999px;">+' + n + '</span>';
    };
    // v2.4.72-beta: ordena pessoas ("você" sempre 1º, depois amigos por
    // interação desc), aplica o cap de maxChips e devolve os chips HTML + o
    // número de excedentes pra somar ao "+N". scoreFn = _friendInteractionScore.
    var _renderPeople = function(people, otherCount) {
      people.sort(function(a, b) {
        if (a.klass === 'me' && b.klass !== 'me') return -1;
        if (b.klass === 'me' && a.klass !== 'me') return 1;
        var sa = window._friendInteractionScore ? window._friendInteractionScore(a.p.uid, _scoreCache) : 0;
        var sb = window._friendInteractionScore ? window._friendInteractionScore(b.p.uid, _scoreCache) : 0;
        return sb - sa;
      });
      var extra = otherCount;
      var shown = people;
      if (maxChips > 0 && people.length > maxChips) {
        shown = people.slice(0, maxChips);
        extra += (people.length - maxChips);
      }
      return {
        chips: shown.map(function(x) { return _personChip(x.p, x.klass); }).join(''),
        extra: extra,
        count: people.length
      };
    };
    var renderedAny = false;
    hours.forEach(function(h) {
      var list = groups[h];
      // v2.1.69: separa quem está ATENDENDO O TORNEIO (ocupação virtual) — que
      // vai DENTRO de um box com o nome do torneio — de quem tem presença avulsa
      // (não inscrita), que aparece FORA do box.
      var byTournament = {}; var tOrder = []; var enrolledUids = {};
      var loose = { people: [], seen: {}, other: 0 };
      // 1ª passada: inscritos (presenças do torneio), agrupados por torneio
      list.forEach(function(p) {
        // v2.8.59: ocupação virtual (type 'tournament') OU plano com nome de torneio
        // resolvido entram no box do torneio.
        if (p.type !== 'tournament' && !p._tournamentName) return;
        var tk = String(p._tournamentId || p._tournamentName || 'torneio');
        if (!byTournament[tk]) { byTournament[tk] = { name: p._tournamentName || 'torneio', id: p._tournamentId || '', people: [], seen: {}, other: 0 }; tOrder.push(tk); }
        var grp = byTournament[tk];
        if (p.uid) enrolledUids[p.uid] = true;
        var klass = _classifyPresence(p);
        if (klass === 'me' || klass === 'friend') {
          var key = p.uid || p.displayName;
          if (grp.seen[key]) return;
          grp.seen[key] = true;
          grp.people.push({ p: p, klass: klass });
        } else { grp.other += 1; }
      });
      // 2ª passada: presenças avulsas (não-torneio), pulando quem já está inscrito
      list.forEach(function(p) {
        if (p.type === 'tournament' || p._tournamentName) return; // tournament-grouped acima
        if (p.uid && enrolledUids[p.uid]) return; // já aparece no box do torneio
        var klass = _classifyPresence(p);
        if (klass === 'me' || klass === 'friend') {
          var key = p.uid || p.displayName;
          if (loose.seen[key]) return;
          loose.seen[key] = true;
          loose.people.push({ p: p, klass: klass });
        } else if (p.visibility === 'public') { loose.other += 1; }
      });
      var hasLoose = loose.people.length > 0 || loose.other > 0;
      if (tOrder.length === 0 && !hasLoose) return;
      renderedAny = true;
      var inner = '';
      tOrder.forEach(function(tk) {
        var grp = byTournament[tk];
        var titleAttr = grp.id
          ? ' style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:700;color:#fbbf24;margin-bottom:6px;cursor:pointer;" onclick="window.location.hash=\'#tournaments/' + _safe(grp.id) + '\'"'
          : ' style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:700;color:#fbbf24;margin-bottom:6px;"';
        var grpR = _renderPeople(grp.people, grp.other);
        inner += '<div style="background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.3);border-radius:10px;padding:8px 10px;">' +
          '<div' + titleAttr + '>🏆 ' + _safe(grp.name) + '</div>' +
          '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">' +
            grpR.chips +
            (grpR.extra > 0 ? _plusPill(grpR.extra) : '') +
            (grpR.count === 0 && grpR.extra === 0 ? '<span style="font-size:0.72rem;color:var(--text-muted);">Inscritos</span>' : '') +
          '</div>' +
        '</div>';
      });
      if (hasLoose) {
        var looseR = _renderPeople(loose.people, loose.other);
        inner += '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">' +
          looseR.chips +
          (looseR.extra > 0 ? _plusPill(looseR.extra) : '') +
        '</div>';
      }
      html +=
        '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-top:1px solid var(--border-color);">' +
          '<div style="min-width:36px;font-weight:700;color:var(--text-bright);font-size:0.88rem;flex-shrink:0;padding-top:2px;">' + h + 'h</div>' +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0;">' + inner + '</div>' +
        '</div>';
    });
    html += '</div>';
    if (!renderedAny) { box.innerHTML = ''; return; }
    box.innerHTML = html;
  }

  // v0.16.28: itera todos os `[data-pref-pid]` cards no DOM e hidrata os 3
  // slots de movimento (chart + "Agora" + "Próximas horas") de cada um.
  // Cards com placeId real (data-pref-placeid não-vazio) disparam fetch do
  // Firestore + ocupação virtual de torneios; cards label-only (synthetic
  // pid) pulam a hidratação — os slots ficam vazios sem poluir o layout.
  // Substitui o antigo _hydrateFocusedPreferredChart: mesma lógica, mas
  // aplicada N vezes (uma por card visível) em vez de só pro focado.
  async function _hydrateAllPreferredMovement() {
    var cards = document.querySelectorAll('[data-pref-pid]');
    if (!cards || cards.length === 0) return;
    // v2.4.72-beta: no dashboard, "Próximas horas" mostra no máx. 5 amigos
    // nominalmente (top por interação) + "+N". No #place/detalhe mostra todos.
    var _routeKey = String(window.location.hash || '').replace(/^#/, '').split(/[/?]/)[0];
    var _upcomingOpts = (_routeKey === 'dashboard') ? { maxChips: 5 } : null;
    // v2.1.72: garante o cache de perfis de amigos (uid→nome) pra o match por
    // NOME funcionar em participantes de torneio sem uid (_classifyPresence).
    try { if (typeof window._loadFriendProfilesCached === 'function') await window._loadFriendProfilesCached(); } catch (e) {}
    var todayKey = window.PresenceDB && window.PresenceDB.dayKey
      ? window.PresenceDB.dayKey(new Date())
      : '';
    // v1.0.18-beta: quando há plano ativo (state.focusedPreferred) com
    // startsAt em outro dia (típico: plano pra amanhã), o gráfico do CARD
    // FOCADO deve mostrar a movimentação do DIA DO PLANO, não de hoje.
    // Bug reportado: "ao planejar ida pra amanhã não aparece o gráfico de
    // barras por hora" — chart usava sempre dayKey(today), pra um plano
    // de amanhã não havia presenças hoje → hasActivity=false → bail
    // silencioso. Cards NÃO focados continuam usando today (relevante).
    var fp = state.focusedPreferred;
    var fpDayKey = null;
    var fpDateLabel = '';
    if (fp && fp.startsAt && window.PresenceDB && window.PresenceDB.dayKey) {
      try {
        var fpDate = new Date(fp.startsAt);
        if (!isNaN(fpDate.getTime())) {
          fpDayKey = window.PresenceDB.dayKey(fpDate);
          // Compara com today pra label do header do gráfico
          var todayDate = new Date();
          var dayDiff = Math.round((fpDate.setHours(0,0,0,0) - todayDate.setHours(0,0,0,0)) / 86400000);
          if (dayDiff === 0) fpDateLabel = '';        // hoje (mantém label default)
          else if (dayDiff === 1) fpDateLabel = 'amanhã';
          else if (dayDiff > 1) fpDateLabel = 'em ' + dayDiff + ' dias';
          else fpDateLabel = '';                       // datas no passado: cai pro default
        }
      } catch (e) {}
    }
    var fpPid = fp ? fp.placeId : null;
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;
    var friends = (cu && Array.isArray(cu.friends)) ? cu.friends : [];
    var tournaments = (window.AppStore && window.AppStore.tournaments) || [];

    // Dedup por placeId real — múltiplos cards com o mesmo placeId (raro,
    // mas possível se focused+lista coexistirem) compartilham o fetch.
    var seenPlaceIds = {};
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var safePid = card.getAttribute('data-pref-pid') || '';
      var realPid = card.getAttribute('data-pref-placeid') || '';
      var venueName = card.getAttribute('data-pref-venuename') || '';
      if (!safePid) continue;
      // Sem placeId real → nada a hidratar (label-only sem match). Slots
      // ficam vazios silenciosamente.
      if (!realPid) continue;
      // Cache por placeId pra não refazer fetch em cards duplicados.
      if (seenPlaceIds[realPid]) continue;
      seenPlaceIds[realPid] = true;

      // v1.0.18-beta: este card usa o dayKey do plano focado se ele bate
      // com o focusedPreferred; caso contrário usa today.
      var isFocused = (fpPid && realPid === fpPid);
      var dayKeyStr = (isFocused && fpDayKey) ? fpDayKey : todayKey;
      var dayLabel = isFocused ? fpDateLabel : '';
      // Fire-and-forget async por card — cada um renderiza independentemente.
      (function(safePid, realPid, venueName, dayKeyStr, dayLabel) {
        // v0.16.49: carrega venue em paralelo com presences pra ter capacidade
        // de quadras pro denominador do gráfico. Falha do loadVenue não bloqueia
        // o chart (cai no fallback de max-bucket).
        var venuePromise = window.VenueDB && typeof window.VenueDB.loadVenue === 'function'
          ? window.VenueDB.loadVenue(realPid).catch(function() { return null; })
          : Promise.resolve(null);
        Promise.all([
          window.PresenceDB.loadForVenueDay(realPid, dayKeyStr),
          venuePromise
        ]).then(function(results) {
          var presences = results[0];
          var venue = results[1];
          var capacity = _calcVenueCapacity(venue);
          // Visibility filter: 'public' sempre; 'friends' só self + friends.
          presences = (presences || []).filter(function(p) {
            if (!p) return false;
            if (p.visibility === 'friends') {
              if (myUid && p.uid === myUid) return true;
              return p.uid && friends.indexOf(p.uid) !== -1;
            }
            return true;
          });
          // Torneios cujo venue bate com este preferido.
          var pKey = window.PresenceDB.venueKey(realPid, venueName);
          var matchTournaments = tournaments.filter(function(t) {
            if (!t) return false;
            var tKey = window.PresenceDB.venueKey(t.venuePlaceId || '', t.venue || '');
            return tKey && tKey === pKey;
          });
          // v1.0.9-beta: passa contexto pra render da CTA "Cadastrar quadras"
          // quando capacity=0 (venue sem courts ou loadVenue null).
          // Tenta extrair lat/lon do venue (se loadVenue retornou) ou do
          // synthetic pid `pref_<lat4>_<lng4>` como fallback pra deep-link
          // pré-preencher localização ao cadastrar.
          var ctxLat = venue && venue.lat != null ? Number(venue.lat) : null;
          var ctxLon = venue && venue.lon != null ? Number(venue.lon) : null;
          if ((ctxLat == null || ctxLon == null) && typeof realPid === 'string' && realPid.indexOf('pref_') === 0) {
            var m = realPid.match(/^pref_(-?\d+\.\d+)_(-?\d+\.\d+)$/);
            if (m) {
              ctxLat = parseFloat(m[1]);
              ctxLon = parseFloat(m[2]);
            }
          }
          _renderPreferredChart('pref-chart-' + safePid, presences, matchTournaments, dayKeyStr, capacity, {
            venueName: venueName,
            realPid: realPid,
            lat: ctxLat,
            lon: ctxLon,
            dayLabel: dayLabel
          });
          _renderNowAtVenueBox('pref-now-' + safePid, presences, realPid);
          _renderUpcomingBox('pref-upcoming-' + safePid, presences, matchTournaments, dayKeyStr, realPid, _upcomingOpts);
        }).catch(function(e) {
          window._warn('[venues movement] load failed for', realPid, e);
        });
      })(safePid, realPid, venueName, dayKeyStr, dayLabel);
    }
  }
  // Exposto globalmente pra que handlers de mutação em outros módulos
  // (presence-geo, presence-db, etc.) também possam re-hidratar se precisarem.
  window._venuesHydrateAllPreferredMovement = _hydrateAllPreferredMovement;

  // v0.16.28: tick roda enquanto houver ao menos UM card [data-pref-pid]
  // no DOM (antes: só no modo focado). Permite que a janela hora-a-hora
  // deslize ao vivo em todos os preferidos visíveis simultaneamente.
  function _startChartAutoTick() {
    if (_chartTickInterval) return;
    _chartTickInterval = setInterval(function() {
      if (!document.querySelector('[data-pref-pid]')) {
        clearInterval(_chartTickInterval);
        _chartTickInterval = null;
        return;
      }
      _hydrateAllPreferredMovement();
    }, 60 * 1000);
  }

  function _stopChartAutoTick() {
    if (_chartTickInterval) {
      clearInterval(_chartTickInterval);
      _chartTickInterval = null;
    }
  }

  // Se placeId pertence a algum preferido do usuário (real ou sintético),
  // retorna o objeto preferred correspondente; senão null. Usado pra decidir
  // se um check-in/plano deve ativar o modo focado.
  // v0.16.26: aceita placeId string OU um objeto venue (`{placeId, name,
  // lat, lon}`). Preferreds salvos via `_addProfileLocation` são label-only
  // (sem placeId), então matching por placeId real do Google Places sempre
  // falhava. Fallback por nome limpo + proximidade de coordenadas (~200m)
  // — mesma regra que `resolvedPreferred` usa no `renderResults`.
  function _findPreferredByPid(placeIdOrVenue) {
    if (!placeIdOrVenue) return null;
    var cu = window.AppStore && window.AppStore.currentUser;
    var prefLocs = (cu && Array.isArray(cu.preferredLocations)) ? cu.preferredLocations : [];
    if (!prefLocs.length) return null;
    var placeId, venueName, venueLat, venueLon;
    if (typeof placeIdOrVenue === 'string') {
      placeId = placeIdOrVenue;
    } else {
      placeId = placeIdOrVenue.placeId || '';
      // aceita shape de venue ({name, lat, lon}) ou de presence doc
      // ({venueName, venueLat, venueLon})
      venueName = placeIdOrVenue.name || placeIdOrVenue.venueName || '';
      venueLat = (placeIdOrVenue.lat != null) ? placeIdOrVenue.lat : placeIdOrVenue.venueLat;
      venueLon = (placeIdOrVenue.lon != null) ? placeIdOrVenue.lon : placeIdOrVenue.venueLon;
    }
    var cleanName = venueName ? _cleanVenueName(venueName).toLowerCase() : '';
    for (var i = 0; i < prefLocs.length; i++) {
      var pl = prefLocs[i];
      if (!pl) continue;
      // 1. placeId exato
      if (placeId && pl.placeId && pl.placeId === placeId) return pl;
      // 2. pid sintético (quando caller passou pref_<lat4>_<lng4>)
      if (placeId && _prefSyntheticPid(pl) === placeId) return pl;
      // 3. nome limpo (label-only preferreds casando com venue real)
      if (cleanName) {
        var plClean = _cleanVenueName(pl.name || pl.label || '').toLowerCase();
        if (plClean && plClean === cleanName) return pl;
      }
      // 4. proximidade de coordenadas (~200m) — última defesa
      if (venueLat != null && venueLon != null && pl.lat != null) {
        var plLon = (pl.lng != null ? pl.lng : pl.lon);
        if (plLon != null) {
          var dKm = _haversineKm(
            { lat: Number(venueLat), lng: Number(venueLon) },
            { lat: Number(pl.lat), lng: Number(plLon) }
          );
          if (dKm < 0.2) return pl;
        }
      }
    }
    return null;
  }

  // v2.8.76: adiciona o local aos preferidos do perfil SILENCIOSAMENTE (sem toast)
  // e persiste — usado quando o usuário planeja uma ida (intenção de frequentar).
  // Retorna true se adicionou agora, false se já era preferido / não pôde.
  function _autoAddPreferredSilent(v) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !v || v.lat == null || v.lon == null) return false;
    if (_findPreferredByPid(v)) return false;          // já é preferido
    var arr = Array.isArray(cu.preferredLocations) ? cu.preferredLocations.slice() : [];
    if (arr.length >= 5) return false;                 // limite de 5
    var entry = { lat: Number(v.lat), lng: Number(v.lon), label: v.name || (Number(v.lat).toFixed(4) + ', ' + Number(v.lon).toFixed(4)) };
    if (v.placeId) entry.placeId = v.placeId;
    arr.push(entry);
    cu.preferredLocations = arr;
    if (Array.isArray(window._profileLocations)) window._profileLocations = arr.slice();
    try {
      if (window.FirestoreDB && window.FirestoreDB.db) {
        window.FirestoreDB.db.collection('users').doc(cu.uid).set({ preferredLocations: arr }, { merge: true }).catch(function() {});
      }
    } catch (e) {}
    return true;
  }

  // Escape hatch: usuário pode clicar "Ver outros preferidos" pra sair do
  // modo focado sem cancelar a presença.
  window._venuesClearFocusedPreferred = function() {
    state.focusedPreferred = null;
    _stopChartAutoTick();
    renderResults();
  };

  // Card de local preferido que NÃO bateu com nenhum venue cadastrado na
  // plataforma. Agora também renderiza os botões de presença ("Estou aqui
  // agora" / "Planejar ida") — presenças só precisam do placeId (real ou
  // sintético), não de uma ficha no Firestore. Consistência com mobile e com
  // o `_preferredCardMatched`: o usuário age direto no card, sem fricção.
  // Link pra Google Maps vira ação secundária (ícone discreto), não o
  // comportamento primário do card.
  function _preferredCardNoMatch(p) {
    var rawName = p.name || p.label || '';
    var name = _cleanVenueName(rawName) || rawName || 'Local preferido';
    var safeName = _safe(name);
    var lat = p.lat != null ? p.lat : null;
    var lon = (p.lng != null ? p.lng : (p.lon != null ? p.lon : null));
    var distText = '';
    if (state.center && lat != null && lon != null) {
      var d = _haversineKm(state.center, { lat: Number(lat), lng: Number(lon) });
      distText = d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km';
    }
    var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name) +
      (p.placeId ? '&query_place_id=' + encodeURIComponent(p.placeId) : '');
    var pid = _prefSyntheticPid(p);
    var safePid = _safe(pid);
    // v0.16.28: placeId real do profile quando disponível (raro em label-only);
    // vazio quando não há. data-pref-venuename é o nome limpo — usado pra casar
    // tournaments (por venueKey) mesmo em preferidos sem placeId.
    var safeRealPid = _safe(p.placeId || '');
    var safeVenueName = _safe(name);
    return '<div class="pref-nomatch-card hover-lift" data-pref-pid="' + safePid + '" data-pref-placeid="' + safeRealPid + '" data-pref-venuename="' + safeVenueName + '" style="background:var(--bg-card);border:1px solid rgba(251,191,36,0.25);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;color:var(--text-bright);font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">⭐ ' + safeName + '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">do seu perfil · não cadastrado</div>' +
        '</div>' +
        (distText ? '<div style="flex-shrink:0;font-size:0.74rem;font-weight:600;color:var(--text-muted);text-align:right;min-width:36px;">' + _safe(distText) + '</div>' : '') +
        '<a href="' + _safe(mapsUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation();" title="Ver no Google Maps" style="flex-shrink:0;font-size:0.85rem;color:#94a3b8;text-decoration:none;padding:4px 6px;border-radius:6px;">🗺️</a>' +
      '</div>' +
      '<div id="pref-presence-slot-' + safePid + '" data-pref-presence-slot="' + safePid + '" data-pref-synthetic="1" style="display:flex;gap:6px;flex-wrap:wrap;"></div>' +
      // v0.16.28: mesmos slots de movimento do matched card. Quando há placeId
      // real (raro nesse caminho — profile geralmente salva só {lat,lng,label}),
      // hidratação carrega presenças; senão fica vazio.
      '<div id="pref-chart-' + safePid + '"></div>' +
      '<div id="pref-now-' + safePid + '"></div>' +
      '<div id="pref-upcoming-' + safePid + '"></div>' +
    '</div>';
  }

  function renderResults() {
    var box = document.getElementById('venues-results');
    if (!box) return;
    var selHtml = state.selectedPlace ? _selectedPlaceCard(state.selectedPlace) : '';
    if (state.loading) {
      // v1.3.26-beta: usa helper canônico (🎾 girando). Antes era texto
      // estático; padroniza com boot loader e demais telas de loading.
      var loadingHtml = (typeof window._renderBallLoader === 'function')
        ? window._renderBallLoader('Buscando locais próximos…', { minHeight: '20vh', size: '2.4rem' })
        : '<div style="text-align:center;color:var(--text-muted);padding:1.5rem 0;font-size:0.88rem;">Buscando locais próximos…</div>';
      box.innerHTML = selHtml + loadingHtml;
      return;
    }
    var hasResults = state.results.length > 0 || (state.googleResults || []).length > 0;
    // v0.16.7: se o usuário está logado E tem locais preferidos, pula o
    // early-return "Onde você está?" e renderiza a seção Preferidos mesmo
    // sem GPS. Sem preferidos, o prompt de localização continua visível.
    var _cuEarly = window.AppStore && window.AppStore.currentUser;
    var _hasPrefs = _cuEarly && Array.isArray(_cuEarly.preferredLocations) && _cuEarly.preferredLocations.length > 0;
    if (!state.center && !hasResults && !state.selectedPlace && !_hasPrefs) {
      box.innerHTML =
        '<div style="text-align:center;padding:2rem 0;">' +
          '<div style="font-size:2.2rem;margin-bottom:8px;">📍</div>' +
          '<div style="font-weight:700;color:var(--text-bright);font-size:1rem;margin-bottom:6px;">Onde você está?</div>' +
          '<div style="color:var(--text-muted);font-size:0.84rem;max-width:280px;margin:0 auto;">Toque em 📍 para usar sua localização ou busque um endereço acima.</div>' +
        '</div>';
      return;
    }

    // Section 1: Locais preferidos (from user profile) — resolve against the
    // registered venue list first; unmatched preferreds render as plain cards.
    // Layout order (v0.16.4): Preferidos → Registrados → Sugestões Google.
    var cu = window.AppStore && window.AppStore.currentUser;
    var prefLocs = (cu && Array.isArray(cu.preferredLocations)) ? cu.preferredLocations : [];
    var prefCache = state.prefVenueCache || {};
    var resolvedPreferred = prefLocs.map(function(pl) {
      if (!pl) return null;
      var pid = pl.placeId || '';
      var plName = _cleanVenueName(pl.name || pl.label || '').toLowerCase();
      var match = state.results.find(function(v) {
        if (pid && v.placeId && v.placeId === pid) return true;
        if (plName && v.name && _cleanVenueName(v.name).toLowerCase() === plName) return true;
        return false;
      });
      // Fallback: se não veio em state.results (distância/filtro excluiu),
      // usa o cache preenchido em refresh(). Preferred COM placeId: cacheado
      // por placeId. Preferred SEM placeId (label-only, profile map antigo):
      // cacheado pelo pid sintético após match por nome/coord no allVenuesRaw.
      if (!match && pid && prefCache[pid]) match = prefCache[pid];
      if (!match) {
        var synthPid = _prefSyntheticPid(pl);
        if (synthPid && prefCache[synthPid]) match = prefCache[synthPid];
      }
      return { pref: pl, match: match || null };
    }).filter(function(x) { return x && (x.match || x.pref); });

    // Ordena por distância quando disponível (usa match se existir, senão coord do pref).
    if (state.center) {
      resolvedPreferred.sort(function(a, b) {
        function coord(x) {
          if (x.match && x.match.lat != null && x.match.lon != null) return { lat: Number(x.match.lat), lng: Number(x.match.lon) };
          var lat = x.pref.lat != null ? Number(x.pref.lat) : null;
          var lon = (x.pref.lng != null ? Number(x.pref.lng) : (x.pref.lon != null ? Number(x.pref.lon) : null));
          if (lat == null || lon == null) return null;
          return { lat: lat, lng: lon };
        }
        var ca = coord(a); var cb = coord(b);
        var da = ca ? _haversineKm(state.center, ca) : Infinity;
        var db = cb ? _haversineKm(state.center, cb) : Infinity;
        return da - db;
      });
    }

    // IDs dos matched para remover da seção de Registrados (evita duplicata).
    var preferredMatchIds = {};
    resolvedPreferred.forEach(function(x) {
      if (x.match && x.match._id) preferredMatchIds[x.match._id] = true;
    });

    // Section 2: Scoreplace registered venues sorted by distance (excluindo preferidos)
    var spResults = state.results.filter(function(v) { return !preferredMatchIds[v._id]; });
    // v1.0.11-beta: conta venues que existem no DB mas foram filtrados por
    // distância (state.results já tem filtro aplicado em refresh()). Usa
    // state.allVenuesRaw que tem a lista pré-filtro pra surfaceiar "X venues
    // fora do raio atual" no empty state — usuário entende que o app TEM
    // venues cadastrados, só que distantes, e pode expandir o raio.
    var venuesOutsideRadius = 0;
    if (Array.isArray(state.allVenuesRaw)) {
      var rawIds = {};
      state.results.forEach(function(v) { rawIds[v._id] = true; });
      state.allVenuesRaw.forEach(function(v) {
        if (rawIds[v._id]) return; // já está no resultado filtrado
        if (preferredMatchIds[v._id]) return; // ou é preferido
        venuesOutsideRadius++;
      });
    }
    if (state.center) {
      spResults.sort(function(a, b) {
        var da = (a.lat != null && a.lon != null) ? _haversineKm(state.center, { lat: Number(a.lat), lng: Number(a.lon) }) : Infinity;
        var db = (b.lat != null && b.lon != null) ? _haversineKm(state.center, { lat: Number(b.lat), lng: Number(b.lon) }) : Infinity;
        return da - db;
      });
    }
    var SHOW_LIMIT = 5;
    var displaySP = state.showAllSP ? spResults : spResults.slice(0, SHOW_LIMIT);

    // Section 3: Google Places deduplicated (também exclui os que já saem como preferidos).
    var gResults = (state.googleResults || []).filter(function(p) {
      if (state.results.some(function(v) { return v.placeId && v.placeId === p.placeId; })) return false;
      // Também filtra se já aparece como preferido com match por placeId.
      if (resolvedPreferred.some(function(x) { return x.pref.placeId && x.pref.placeId === p.placeId; })) return false;
      return true;
    });
    if (state.center) {
      gResults.sort(function(a, b) {
        var da = (a.lat != null && a.lng != null) ? _haversineKm(state.center, { lat: Number(a.lat), lng: Number(a.lng) }) : Infinity;
        var db = (b.lat != null && b.lng != null) ? _haversineKm(state.center, { lat: Number(b.lat), lng: Number(b.lng) }) : Infinity;
        return da - db;
      });
    }

    var html = selHtml;

    // 1) Locais preferidos (vem do perfil do usuário)
    // v0.16.7: seção SEMPRE visível quando o usuário está logado, mesmo sem
    // preferidos cadastrados — com CTA para adicionar via perfil.
    // v0.16.20: se state.focusedPreferred aponta pra uma presença ativa em
    // um preferido, colapsa a lista pra só ele + gráfico de movimento.
    var fp = state.focusedPreferred;
    // Valida: expirou? limpa silenciosamente.
    if (fp && fp.endsAt && fp.endsAt <= Date.now()) {
      state.focusedPreferred = null;
      fp = null;
      _stopChartAutoTick();
    }
    var focusedResolved = null;
    if (fp) {
      focusedResolved = resolvedPreferred.find(function(x) {
        var xPid = (x.match && x.match.placeId) || (x.pref && x.pref.placeId) || _prefSyntheticPid(x.pref);
        return xPid === fp.placeId;
      }) || null;
    }
    if (focusedResolved) {
      html += '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.25);border-radius:14px;padding:10px 12px;margin-bottom:14px;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">' +
        '<div style="font-size:0.7rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:0.5px;">⭐ ' + (fp.type === 'planned' ? 'Plano ativo' : 'Você está aqui') + '</div>' +
        '<button type="button" onclick="window._venuesClearFocusedPreferred()" style="background:none;border:none;color:#94a3b8;font-size:0.72rem;font-weight:600;cursor:pointer;padding:2px 6px;" title="Ver todos os preferidos">ver todos ↗</button>' +
      '</div>';
      // v0.16.28: slots de chart/agora/próximas agora vivem DENTRO do card
      // (pref-chart-* / pref-now-* / pref-upcoming-*), populados por
      // _hydrateAllPreferredMovement. Não precisamos mais de slots externos.
      html += '<div style="display:flex;flex-direction:column;gap:10px;">';
      if (focusedResolved.match) html += _preferredCardMatched(focusedResolved.match);
      else html += _preferredCardNoMatch(focusedResolved.pref);
      html += '</div></div>';
    } else if (resolvedPreferred.length > 0) {
      html += '<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.25);border-radius:14px;padding:10px 12px;margin-bottom:14px;">';
      html += '<div style="font-size:0.7rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">⭐ Locais preferidos</div>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;">';
      resolvedPreferred.forEach(function(x) {
        if (x.match) html += _preferredCardMatched(x.match);
        else html += _preferredCardNoMatch(x.pref);
      });
      html += '</div></div>';
    } else if (cu && cu._profileLoaded) {
      // v0.17.3: só mostra placeholder DEPOIS que o profile carregou de verdade.
      // Antes mostrava sempre que `cu` existia, o que disparava placeholder
      // errado durante o gap async entre simulateLoginSuccess e profile merge —
      // usuário com preferreds salvos via "Marque seus lugares" mesmo tendo.
      html += '<div style="background:rgba(251,191,36,0.06);border:1px dashed rgba(251,191,36,0.35);border-radius:14px;padding:10px 12px;margin-bottom:14px;">';
      html += '<div style="font-size:0.7rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">⭐ Locais preferidos</div>';
      html += '<div style="font-size:0.82rem;color:var(--text-muted);line-height:1.4;margin-bottom:8px;">Marque seus lugares favoritos no perfil e eles aparecem aqui primeiro.</div>';
      html += '<button type="button" onclick="if(window._openMyProfileModal)window._openMyProfileModal();else window.location.hash=\'#dashboard\';" style="background:rgba(251,191,36,0.14);border:1px solid rgba(251,191,36,0.4);color:#fbbf24;border-radius:10px;padding:6px 12px;font-size:0.78rem;font-weight:600;cursor:pointer;">Adicionar no perfil →</button>';
      html += '</div>';
    } else if (cu && !cu._profileLoaded) {
      // Profile ainda carregando — mostra loading sutil sem CTA enganoso.
      // O listener registrado no início de render() vai re-disparar refresh()
      // quando o profile chegar.
      html += '<div style="background:rgba(251,191,36,0.04);border:1px dashed rgba(251,191,36,0.18);border-radius:14px;padding:10px 12px;margin-bottom:14px;">';
      html += '<div style="font-size:0.7rem;font-weight:700;color:rgba(251,191,36,0.6);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">⭐ Locais preferidos</div>';
      html += (typeof window._renderBallLoaderInline === 'function' ? window._renderBallLoaderInline('Carregando perfil…') : '<div style="font-size:0.78rem;color:var(--text-muted);">Carregando perfil…</div>');
      html += '</div>';
    }

    // 2) Locais registrados na plataforma (próximos do centro atual)
    // v1.0.10-beta: header SEMPRE visível mesmo com 0 resultados — antes a
    // seção sumia inteira quando spResults.length === 0, criando um gap entre
    // PLANO ATIVO e SUGESTÕES DO GOOGLE que confundia o usuário ("cadê os
    // locais cadastrados?"). Empty state agora explica + dá CTA pra cadastrar.
    html += '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.22);border-radius:14px;padding:10px 12px;margin-bottom:14px;">';
    html += '<div style="font-size:0.7rem;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">🏢 Outros locais no scoreplace</div>';
    if (spResults.length > 0) {
      html += '<div style="display:flex;flex-direction:column;gap:6px;">';
      displaySP.forEach(function(v) { html += _venueCard(v); });
      html += '</div>';
      if (spResults.length > SHOW_LIMIT && !state.showAllSP) {
        html += '<button onclick="window._venuesShowAllSP()" style="margin-top:8px;background:none;border:none;color:#a5b4fc;font-size:0.82rem;cursor:pointer;padding:2px 0;">Mostrar mais (' + (spResults.length - SHOW_LIMIT) + ' locais) →</button>';
      }
    } else {
      // Empty state — diferencia 2 casos: (a) DB vazio na região e (b) tem
      // venues mas estão fora do raio. (b) é o caso típico do "cadastrei mas
      // não aparece" — usuário em SP cadastrou venue em outro lugar OU
      // distance default (25km) pequeno demais.
      if (venuesOutsideRadius > 0) {
        var newRadius = Math.max(50, state.distanceKm * 2);
        html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:180px;font-size:0.78rem;color:var(--text-muted);line-height:1.4;">' +
            '<b style="color:#a5b4fc;">' + venuesOutsideRadius + ' local(is)</b> cadastrado(s) fora do raio atual de <b>' + state.distanceKm + 'km</b>. Expandir busca?' +
          '</div>' +
          '<button type="button" onclick="window._venuesExpandRadius(' + newRadius + ')" class="btn btn-sm btn-primary hover-lift" style="white-space:nowrap;font-size:0.78rem;">📡 Expandir pra ' + newRadius + 'km</button>' +
        '</div>';
      } else {
        html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:180px;font-size:0.78rem;color:var(--text-muted);line-height:1.4;">' +
            'Nenhum local cadastrado por aqui ainda. Sabe um? Cadastre pra que apareça aqui pra todos os usuários.' +
          '</div>' +
          '<a href="#my-venues" class="btn btn-sm btn-primary hover-lift" style="white-space:nowrap;font-size:0.78rem;">+ Cadastrar local</a>' +
        '</div>';
      }
    }
    html += '</div>';

    // 3) Sugestões do Google — sempre renderiza header + slot. Quando
    // googleLoading=true, mostra mini-loader 🎾 dentro do slot. Resultados
    // vão chegando via re-render. v1.3.26-beta: secção visível mesmo
    // antes do fetch resolver pra usuário saber que vem mais.
    var hasGoogleSlot = state.googleLoading || gResults.length > 0;
    if (hasGoogleSlot) {
      var gTop = (resolvedPreferred.length > 0 || spResults.length > 0) ? 'margin-top:14px;margin-bottom:8px;' : 'margin-bottom:8px;';
      html += '<div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;' + gTop + '">📍 Sugestões do Google</div>';
      if (state.googleLoading && gResults.length === 0) {
        // Slot vazio com mini-loader enquanto fetch tá em voo.
        var inlineLoader = (typeof window._renderBallLoaderInline === 'function')
          ? window._renderBallLoaderInline('Buscando sugestões do Google…')
          : '<div style="color:var(--text-muted);font-size:0.82rem;padding:6px 0;">🎾 Buscando sugestões…</div>';
        html += '<div style="padding:4px 0;">' + inlineLoader + '</div>';
      } else {
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';
        gResults.forEach(function(p) { html += _googleVenueCard(p); });
        html += '</div>';
      }
    }

    if (resolvedPreferred.length === 0 && spResults.length === 0 && gResults.length === 0 && !state.googleLoading) {
      html += '<div style="text-align:center;padding:1.5rem 0;color:var(--text-muted);font-size:0.85rem;">Nenhum local encontrado nessa região.</div>';
    }

    html += _registerCtaHtml();
    box.innerHTML = html;
    // v0.16.14: popula os slots de presença dos cards da seção "Locais
    // preferidos" com os botões corretos (Estou aqui / Planejar ida, ou
    // Cancelar se já houver presença ativa naquele venue).
    _hydratePreferredPresenceSlots();
    // v0.16.28: hidrata movimento (chart + "Agora" + "Próximas horas") em
    // TODOS os cards preferidos visíveis — não só no modo focado. Cada card
    // mostra sua própria atividade do dia; cards sem movimento ficam limpos.
    _hydrateAllPreferredMovement();
    if (document.querySelector('[data-pref-pid]')) {
      _startChartAutoTick();
    } else {
      _stopChartAutoTick();
    }
  }

  // Itera todos os slots `[data-pref-presence-slot]` que o render deixou no
  // DOM e preenche cada um com os botões de presença no estado correto.
  // Compartilha a lógica com `_hydratePresenceButtonsForVenue` (detail modal)
  // mas adaptada pra múltiplos slots simultâneos — por isso os IDs dos
  // botões levam o placeId como sufixo pra não colidirem entre si.
  async function _hydratePreferredPresenceSlots() {
    var slots = document.querySelectorAll('[data-pref-presence-slot]');
    if (!slots || slots.length === 0) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !window.PresenceDB) {
      slots.forEach(function(s) { s.innerHTML = ''; });
      return;
    }
    var myActive = [];
    try { myActive = await window.PresenceDB.loadMyActive(cu.uid); } catch (e) {}
    var now = Date.now();
    slots.forEach(function(slot) {
      var pid = slot.getAttribute('data-pref-presence-slot') || '';
      var safePid = _safe(pid);
      var hereCheckin = null, herePlan = null;
      (myActive || []).forEach(function(p) {
        if (!p || p.placeId !== pid) return;
        if (p.type === 'checkin' && p.startsAt <= now && p.endsAt > now && !hereCheckin) hereCheckin = p;
        if (p.type === 'planned' && !herePlan && _presenceVisibleNow(p)) herePlan = p; // v1.9.86 + v2.8.73: plano de torneio distante (>2d) não conta como ativo aqui
      });
      var checkinBtn = hereCheckin
        ? '<button id="pref-checkin-btn-' + safePid + '" class="btn btn-sm hover-lift" onclick=\'event.stopPropagation(); window._venuesCancelMyPresenceHere("' + String(hereCheckin._id || '').replace(/"/g,'&quot;') + '","' + safePid + '","checkin")\' style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;font-weight:700;padding:6px 10px;font-size:0.75rem;flex:1;min-width:0;" title="Você está registrado aqui · clique pra sair">✕ Cancelar presença</button>'
        : '<button id="pref-checkin-btn-' + safePid + '" class="btn btn-sm hover-lift" onclick=\'event.stopPropagation(); window._venuesQuickCheckInPreferred("' + safePid + '")\' style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;font-weight:700;padding:6px 10px;font-size:0.75rem;flex:1;min-width:0;" title="Registra presença com suas modalidades preferidas neste local">📍 Estou aqui agora</button>';
      var planBtn = herePlan
        ? ('<button id="pref-plan-edit-' + safePid + '" class="btn btn-sm hover-lift" onclick=\'event.stopPropagation(); window._venuesEditPlanPreferred("' + safePid + '","' + String(herePlan._id || '').replace(/"/g,'&quot;') + '")\' style="background:#6366f1;color:#fff;border:none;font-weight:700;padding:6px 10px;font-size:0.72rem;flex:0 0 auto;" title="Editar horário/modalidade do plano">✏️ Editar</button>'
          + '<button id="pref-plan-btn-' + safePid + '" class="btn btn-sm hover-lift" onclick=\'event.stopPropagation(); window._venuesCancelMyPresenceHere("' + String(herePlan._id || '').replace(/"/g,'&quot;') + '","' + safePid + '","planned")\' style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;font-weight:700;padding:6px 10px;font-size:0.72rem;flex:0 0 auto;" title="Você tem plano ativo aqui · clique pra remover">✕ Cancelar</button>')
        : '<button id="pref-plan-btn-' + safePid + '" class="btn btn-sm hover-lift" onclick=\'event.stopPropagation(); window._venuesQuickPlanPreferred("' + safePid + '")\' style="background:#6366f1;color:#fff;border:none;font-weight:700;padding:6px 10px;font-size:0.75rem;flex:1;min-width:0;" title="Planejar ida com suas modalidades preferidas neste local">🗓️ Planejar ida</button>';
      slot.innerHTML = checkinBtn + planBtn;
    });
  }
  // Exposto globalmente pra que os handlers de mutação (check-in, plano,
  // cancelamento) possam re-hidratar os cards preferidos sem re-render total.
  window._venuesHydratePreferredPresenceSlots = _hydratePreferredPresenceSlots;

  window._venuesShowAllSP = function() { state.showAllSP = true; renderResults(); };

  // v1.0.11-beta: chamado pelo empty state da seção "Outros locais" quando há
  // venues fora do raio atual. Expande pra newKm e re-fetch — _saveFilters
  // persiste pro próximo carregamento; `refresh()` re-aplica filtro com novo
  // raio sem precisar reload.
  window._venuesExpandRadius = function(newKm) {
    var n = parseInt(newKm, 10);
    if (!n || n <= 0) return;
    state.distanceKm = n;
    _saveFilters();
    refresh();
  };

  // Deep-link from a selected-but-unregistered Google Place into the #my-venues
  // cadastro form. We stash what we already have (placeId/name/address/lat/lon)
  // so the user doesn't need to re-search; venue-owner.js picks it up on entry.
  window._venuesRegisterPlace = function(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var p = state.selectedPlace;
    if (!p || !p.placeId) return;
    try {
      sessionStorage.setItem('scoreplace_pending_venue_registration', JSON.stringify({
        placeId: p.placeId,
        name: p.name || '',
        address: p.address || '',
        lat: (p.lat != null ? p.lat : null),
        lon: (p.lng != null ? p.lng : null)
      }));
    } catch (e) {}
    window.location.hash = '#my-venues';
  };

  // v1.1.6-beta: variante que recebe dados inline via args (em vez de
  // ler state.selectedPlace). Usado pelos cards de Sugestões do Google
  // pra que cada card possa cadastrar SEU local sem precisar selecionar
  // primeiro. Stash + redirect pra #my-venues mesmo padrão.
  window._venuesRegisterFromGoogle = function(placeId, name, address, lat, lon) {
    if (!placeId) return;
    try {
      sessionStorage.setItem('scoreplace_pending_venue_registration', JSON.stringify({
        placeId: placeId,
        name: name || '',
        address: address || '',
        lat: (lat != null ? lat : null),
        lon: (lon != null ? lon : null)
      }));
    } catch (e) {}
    window.location.hash = '#my-venues';
  };

  // Stubs for old map-extras functions — new layout renders list inline below map.
  function _hydrateMapSummary() {}
  function _hydrateMapExtras() {}

  async function refresh() {
    state.loading = true;
    renderResults();
    // Reflete "Buscando…" no summary acima do mapa também, não só na lista.
    _hydrateMapSummary();
    // Resolve city → lat/lng so we can center the map AND apply the
    // distance filter. If the user hasn't typed a city, fall back to their
    // profile's preferred location or the Brazil default.
    var center = null;
    // GPS tem prioridade absoluta — não jogamos fora o lat/lng preciso
    // do dispositivo em troca do resultado aproximado do geocoder.
    if (state.centerFromGps && state.center) {
      center = state.center;
    } else if (state.location) {
      center = await _geocodeCity(state.location);
    }
    // Fallback preferredLocations removido: o usuário pediu explicitamente
    // que "quando clica na localização é pra usar o gps e não puxar dos
    // locais preferidos do perfil". Sem center válido → sem filtro de raio.
    state.center = center;
    _saveFilters();
    state.showAllSP = false;

    // 1) Our own claimed venues. Não filtramos mais pelo texto do campo
    // "Local" no doc — o raio (Haversine) cobre a proximidade, e texto livre
    // como "Av. Paulista 1000" nunca casaria com v.city gravado como "São
    // Paulo". Se o geocoder falhar e não resolver um centro, não filtramos
    // nada de localidade (mostra todos os venues). Campo `city` ainda é
    // aceito pelo VenueDB para compat mas passamos vazio aqui.
    // v1.0.11-beta: state.allVenuesRaw (era var local) pra renderResults
    // poder mostrar "X venues fora do raio atual" no empty state.
    var _allVenuesRaw = [];
    try {
      // Não passamos sport pro VenueDB — filtro multi-sport é aplicado aqui
      // client-side (VenueDB.listVenues aceita só 1 esporte single-string).
      var list = await window.VenueDB.listVenues({
        priceRange: state.priceRange,
        minCourts: state.minCourts
      });
      // Guarda cópia crua (pré-filtros modalidade/distância) para resolver
      // preferreds sem placeId na etapa (2) abaixo. Um preferred salvo via
      // profile map (`_addProfileLocation`) só tem {lat,lng,label} — sem
      // placeId a distance-filter exclui o venue de state.results e ele
      // cairia como "não cadastrado" mesmo existindo no Firestore.
      _allVenuesRaw = list.slice();
      state.allVenuesRaw = _allVenuesRaw; // expose pra renderResults
      // Filtro multi-esporte (pills): venue passa se oferece qualquer uma das
      // modalidades selecionadas, OU se não declarou sports[] (wildcard —
      // cadastro novo, ainda sem quadras). Sem pill ativa = sem filtro.
      var selSports = Array.isArray(state.sports) ? state.sports : [];
      if (selSports.length > 0) {
        list = list.filter(function(v) {
          var vs = Array.isArray(v.sports) ? v.sports : [];
          if (vs.length === 0) return true; // wildcard
          return selSports.some(function(s) { return vs.indexOf(s) !== -1; });
        });
      }
      // Apply distance filter when we have a center — keeps results relevant.
      if (center && state.distanceKm > 0) {
        list = list.filter(function(v) {
          if (v.lat == null || v.lon == null) return true; // sem coords = mantém, aparece na lista
          var d = _haversineKm(center, { lat: Number(v.lat), lng: Number(v.lon) });
          return d <= state.distanceKm;
        });
      }
      state.results = list;
    } catch (e) {
      window._warn('listVenues failed:', e);
      state.results = [];
    }

    // 2) Preferred venues — fetch direto por placeId, independente do filtro
    // de distância / modalidade aplicado acima em state.results. O usuário
    // explicitamente marcou esses locais como preferidos; distância/filtro
    // não deve esconder a ficha. Ex: usuário em SP tem Spazio Verde 1
    // (Sorocaba) como preferido — se state.distanceKm=50km, o venue cai fora
    // de state.results, mas ainda deve aparecer como "matched" na seção de
    // preferidos. (v0.16.17 bug fix)
    state.prefVenueCache = {};
    try {
      var cuForPref = window.AppStore && window.AppStore.currentUser;
      var prefList = (cuForPref && Array.isArray(cuForPref.preferredLocations)) ? cuForPref.preferredLocations : [];
      var pidsToFetch = prefList
        .map(function(pl) { return pl && pl.placeId; })
        .filter(function(pid) { return pid && !state.results.some(function(v) { return v.placeId === pid; }); });
      if (pidsToFetch.length > 0 && window.VenueDB) {
        var fetched = await Promise.all(pidsToFetch.map(function(pid) {
          return window.VenueDB.loadVenue(pid).catch(function() { return null; });
        }));
        fetched.forEach(function(v, i) {
          if (v) state.prefVenueCache[pidsToFetch[i]] = v;
        });
      }
      // Bug #1 (v0.16.22): preferreds salvos via profile map só têm
      // {lat,lng,label} — nunca placeId. A etapa acima nunca os casa com
      // a ficha cadastrada. Aqui varremos a lista CRUA (pré-distância,
      // pré-modalidade) casando por nome ou coordenada (~200m, mesmo
      // threshold do dedup em _addProfileLocation). Quando achamos match,
      // cacheamos sob o pid sintético do preferred (`pref_<lat4>_<lng4>`)
      // pra que o fallback no mapper de resolvedPreferred encontre.
      if (Array.isArray(_allVenuesRaw) && _allVenuesRaw.length > 0) {
        prefList.forEach(function(pl) {
          if (!pl || pl.placeId) return; // só label-only preferreds
          var synthPid = _prefSyntheticPid(pl);
          if (!synthPid || state.prefVenueCache[synthPid]) return;
          var plName = _cleanVenueName(pl.name || pl.label || '').toLowerCase();
          var plLat = pl.lat != null ? Number(pl.lat) : null;
          var plLon = (pl.lng != null ? Number(pl.lng) : (pl.lon != null ? Number(pl.lon) : null));
          var found = _allVenuesRaw.find(function(v) {
            // Match por nome limpo (case-insensitive)
            if (plName && v.name && _cleanVenueName(v.name).toLowerCase() === plName) return true;
            // Match por coordenada próxima (~200m em ambos eixos)
            if (plLat != null && plLon != null && v.lat != null && v.lon != null) {
              if (Math.abs(Number(v.lat) - plLat) < 0.002 && Math.abs(Number(v.lon) - plLon) < 0.002) return true;
            }
            return false;
          });
          if (found) state.prefVenueCache[synthPid] = found;
        });
      }
    } catch (e) {
      window._warn('preferred venue fetch failed:', e);
    }

    // v1.3.26-beta: PINTA AGORA com preferidos + registrados resolvidos.
    // Google nearby (16 chamadas paralelas) tipicamente leva 1-2s e o
    // usuário pediu pra preferidos aparecerem rápido. Marca loading como
    // false ANTES da chamada do Google — usuário vê seus locais favoritos
    // imediatamente; "Sugestões do Google" injetam-se quando chegarem.
    state.loading = false;
    state.googleLoading = !!center; // se vamos buscar, marca pra render mostrar mini-loader
    state.googleResults = state.googleResults || [];
    renderResults();
    _hydrateMapSummary();

    // 3) Google Places nearby — em BACKGROUND (não bloqueia render). Só
    // dispara quando temos center real (evita queimar quota Places).
    if (center) {
      _loadGoogleNearby(center, state.distanceKm, state.sports).then(function(results) {
        state.googleResults = results || [];
        state.googleLoading = false;
        renderResults();
        _hydrateMapSummary();
        // GA4 só dispara depois do round-trip completo — totais reais
        try {
          if (typeof window._trackVenueSearched === 'function') {
            var totalResults = (state.results ? state.results.length : 0) + state.googleResults.length;
            window._trackVenueSearched(state.location || '', totalResults);
          }
        } catch (_e) {}
      }).catch(function(e) {
        window._warn('Google nearby fetch failed:', e);
        state.googleLoading = false;
        state.googleResults = [];
        renderResults();
      });
    } else {
      state.googleResults = [];
      state.googleLoading = false;
    }

    // 4) Auto-focus preferred se usuário já tem presença ativa num local
    // preferido. Reabrir #place deve trazer de volta o foco+gráfico sem
    // exigir novo clique nos botões. v1.3.26-beta: não bloqueia render.
    // Roda em background; quando achar match, faz re-render. Só executa
    // na primeira render (state.focusedPreferred null) pra não sobrescrever
    // clear manual.
    if (!state.focusedPreferred) {
      var cuFocus = window.AppStore && window.AppStore.currentUser;
      if (cuFocus && cuFocus.uid && window.PresenceDB) {
        window.PresenceDB.loadMyActive(cuFocus.uid).then(function(myActive) {
          if (!Array.isArray(myActive) || myActive.length === 0) return;
          for (var mi = 0; mi < myActive.length; mi++) {
            var mp = myActive[mi];
            if (!mp || !mp.placeId) continue;
            if (!_presenceVisibleNow(mp)) continue; // v2.8.73: plano de torneio só foca ≤2 dias antes
            // v0.16.26: passa o presence doc inteiro — matching cai em
            // nome/coords quando placeId não casa (preferreds label-only).
            var prefForMp = _findPreferredByPid(mp);
            if (prefForMp) {
              state.focusedPreferred = {
                placeId: mp.placeId,
                docId: mp._id || null,
                type: mp.type || 'checkin',
                startsAt: mp.startsAt || Date.now(),
                endsAt: mp.endsAt || (Date.now() + 4 * 3600 * 1000),
                sports: Array.isArray(mp.sports) ? mp.sports : (mp.sport ? [mp.sport] : []),
                venueName: mp.venueName || '',
                prefObj: prefForMp
              };
              renderResults();
              break;
            }
          }
        }).catch(function(e) { window._warn('auto-focus preferred failed:', e); });
      }
    }

    // Mapa pinta junto da primeira render (não depende de Google nearby
    // nem de PresenceDB). Centraliza no GPS e desenha marcadores dos
    // venues registrados imediatamente.
    _hydrateMapExtras();
    if (_map) {
      if (center) {
        _map.setCenter(center);
        // When coming from Brazil default + a now-known center, zoom in.
        if (_map.getZoom && _map.getZoom() <= 5) _map.setZoom(12);
      }
      _renderMarkers(); // desenha venues + círculo do raio
    }
  }

  // ── Places autocomplete for the search field ──────────────────────────────
  var _venuesPlacesReady = false;
  async function _ensureVenuesPlaces() {
    if (_venuesPlacesReady) return;
    if (!window.google || !window.google.maps || !window.google.maps.importLibrary) return;
    try { await google.maps.importLibrary('places'); _venuesPlacesReady = true; } catch(e) {}
  }

  async function _doVenuesSearch(query) {
    var box = document.getElementById('venues-suggestions');
    if (!box) return;
    var q = String(query || '').trim();
    if (q.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.innerHTML = '';
    var hasAny = false;
    var qLow = q.toLowerCase();

    // Section 1: registered scoreplace venues matching query by name/address
    var matchedSP = (state.results || []).filter(function(v) {
      return (v.name && v.name.toLowerCase().indexOf(qLow) !== -1) ||
             (v.address && v.address.toLowerCase().indexOf(qLow) !== -1);
    }).slice(0, 5);
    if (matchedSP.length > 0) {
      var spHdr = document.createElement('div');
      spHdr.style.cssText = 'padding:5px 14px 4px;font-size:0.66rem;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;';
      spHdr.textContent = '🏢 No scoreplace';
      box.appendChild(spHdr);
      matchedSP.forEach(function(v) {
        var item = document.createElement('div');
        item.style.cssText = 'padding:9px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);';
        item.innerHTML = '<div style="color:var(--text-bright);font-size:0.88rem;font-weight:600;">✅ ' + _safe(v.name) + '</div>' +
          (v.address ? '<div style="color:var(--text-muted);font-size:0.74rem;margin-top:1px;">' + _safe(v.address) + '</div>' : '');
        item.addEventListener('mouseenter', function() { item.style.background = 'rgba(16,185,129,0.1)'; });
        item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
        item.addEventListener('mousedown', function(ev) {
          ev.preventDefault();
          box.style.display = 'none';
          window._venuesOpenDetail(v._id);
        });
        box.appendChild(item);
      });
      hasAny = true;
    }

    // Section 2: Google Places autocomplete
    await _ensureVenuesPlaces();
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      if (hasAny) box.style.display = 'block';
      return;
    }
    var sugs = [];
    try {
      var result = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        includedRegionCodes: ['br'],
        includedPrimaryTypes: ['establishment'],
        language: 'pt-BR'
      });
      sugs = (result.suggestions || []).filter(function(s) { return s.placePrediction; });
    } catch(e) {}
    if (sugs.length > 0) {
      if (hasAny) {
        var gHdr = document.createElement('div');
        gHdr.style.cssText = 'padding:5px 14px 4px;font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;border-top:1px solid rgba(255,255,255,0.08);';
        gHdr.textContent = '📍 Google Places';
        box.appendChild(gHdr);
      }
      sugs.slice(0, 6).forEach(function(s) {
        var pred = s.placePrediction;
        var main = pred.mainText ? pred.mainText.text : '';
        var sec = pred.secondaryText ? pred.secondaryText.text : '';
        var item = document.createElement('div');
        item.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);';
        item.innerHTML = '<div style="color:var(--text-bright);font-size:0.88rem;font-weight:500;">📍 ' + _safe(main) + '</div>' +
          (sec ? '<div style="color:var(--text-muted);font-size:0.75rem;margin-top:2px;">' + _safe(sec) + '</div>' : '');
        item.addEventListener('mouseenter', function() { item.style.background = 'rgba(99,102,241,0.12)'; });
        item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
        item.addEventListener('mousedown', function(ev) { ev.preventDefault(); _venuesSelectPlace(pred); });
        box.appendChild(item);
      });
      hasAny = true;
    }
    if (!hasAny) { box.style.display = 'none'; return; }
    box.style.display = 'block';
  }

  async function _venuesSelectPlace(pred) {
    var box = document.getElementById('venues-suggestions');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    var inp = document.getElementById('venues-location');
    try {
      var place = pred.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'id'] });
      var loc = place.location;
      var lat = loc ? loc.lat() : null;
      var lng = loc ? loc.lng() : null;
      var label = place.displayName || (pred.mainText && pred.mainText.text) || '';
      state.location = label;
      state.centerFromGps = false;
      if (inp) inp.value = label;
      if (lat != null && lng != null) {
        state.center = { lat: lat, lng: lng };
        _pinSelectedPlace(lat, lng, label);
      }
      // Check if this place is already registered in scoreplace
      var existingVenue = null;
      if (place.id && window.VenueDB) {
        try { existingVenue = await window.VenueDB.loadVenue(place.id); } catch(e) {}
      }
      state.selectedPlace = { name: label, address: place.formattedAddress || '', placeId: place.id || '', lat: lat, lng: lng, existingVenue: existingVenue };
    } catch(e) {
      var main = pred.mainText ? pred.mainText.text : '';
      state.location = main;
      state.selectedPlace = { name: main, address: '', placeId: '', existingVenue: null };
      if (inp) inp.value = main;
    }
    _saveFilters();
    renderResults(); // show detail card immediately (with existing venue status)
    refresh();       // search nearby in background
  }

  window._venuesOnLocation = function(v) {
    state.location = v;
    state.centerFromGps = false;
    _saveFilters();
    clearTimeout(window._venuesLocationDebounce);
    window._venuesLocationDebounce = setTimeout(function() { _doVenuesSearch(v); }, 200);
  };
  // Multi-select: toggle um esporte dentro/fora do array. Sem esporte = todas.
  window._venuesToggleSport = function(sport) {
    if (!Array.isArray(state.sports)) state.sports = [];
    var i = state.sports.indexOf(sport);
    if (i === -1) state.sports.push(sport);
    else state.sports.splice(i, 1);
    _saveFilters();
    // Atualiza visual das pills imediatamente (feedback snappy) antes do fetch.
    var pillsBox = document.getElementById('venues-sport-pills');
    if (pillsBox) pillsBox.innerHTML = _sportPillsHtml();
    refresh();
  };
  window._venuesSetDistance = function(v) {
    state.distanceKm = Math.max(1, Math.min(500, parseInt(v, 10) || 10));
    _saveFilters();
    clearTimeout(window._venuesDistDebounce);
    window._venuesDistDebounce = setTimeout(refresh, 250);
  };

  // Reverse geocode lat/lng into a legible "endereço, bairro, cidade".
  // Lazy-loads o Geocoder. Preferimos street_address → route → premise →
  // primeiro resultado, evitando retornar plus codes ou cell towers que o
  // Google às vezes devolve como results[0]. Retorna null se indisponível.
  async function _reverseGeocode(lat, lng) {
    if (!window.google || !window.google.maps || !window.google.maps.importLibrary) return null;
    try {
      await google.maps.importLibrary('geocoding');
      var geocoder = new google.maps.Geocoder();
      return await new Promise(function(resolve) {
        geocoder.geocode({ location: { lat: lat, lng: lng }, language: 'pt-BR', region: 'br' }, function(results, status) {
          if (status !== 'OK' || !results || results.length === 0) { resolve(null); return; }
          var preferred = ['street_address', 'route', 'premise', 'neighborhood', 'sublocality', 'locality'];
          for (var i = 0; i < preferred.length; i++) {
            var t = preferred[i];
            for (var j = 0; j < results.length; j++) {
              if ((results[j].types || []).indexOf(t) !== -1) {
                resolve(results[j].formatted_address);
                return;
              }
            }
          }
          resolve(results[0].formatted_address);
        });
      });
    } catch (e) { return null; }
  }

  // Ask the browser for GPS and populate state.location + state.center from
  // ── Cache de GPS (localStorage, TTL 10 min + sessionStorage flag) ─────────
  // Duas camadas:
  // 1. sessionStorage '_gpsRequested': GPS só é solicitado UMA VEZ por sessão.
  //    Evita múltiplos dialogs quando o usuário navega pelo app e volta ao #place.
  // 2. localStorage 'scoreplace_gps_cache': coordenadas cachadas por 10 min.
  //    Reutiliza sem chamar getCurrentPosition mesmo em sessões novas recentes.
  var _GPS_CACHE_KEY = 'scoreplace_gps_cache';
  var _GPS_CACHE_TTL = 10 * 60 * 1000; // 10 minutos
  var _GPS_SESSION_KEY = '_gpsRequested';

  function _readGpsCache() {
    try {
      var raw = localStorage.getItem(_GPS_CACHE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.lat || !d.lng || !d.ts) return null;
      if (Date.now() - d.ts > _GPS_CACHE_TTL) return null;
      return d;
    } catch(e) { return null; }
  }
  function _writeGpsCache(lat, lng) {
    try {
      localStorage.setItem(_GPS_CACHE_KEY, JSON.stringify({ lat: lat, lng: lng, ts: Date.now() }));
      sessionStorage.setItem(_GPS_SESSION_KEY, '1');
    } catch(e) {}
  }

  // Aplica coordenadas GPS ao estado da view e re-renderiza.
  async function _applyGpsCoords(lat, lng, btn) {
    state.center = { lat: lat, lng: lng };
    state.centerFromGps = true;
    _writeGpsCache(lat, lng);
    var address = await _reverseGeocode(lat, lng);
    state.location = address || 'Minha localização atual';
    _saveFilters();
    var inp = document.getElementById('venues-location');
    if (inp) inp.value = state.location;
    if (btn) { btn.disabled = false; btn.textContent = '📍'; }
    refresh();
  }

  // Botão 📍 explícito (userTriggered=true) ou auto-trigger silencioso.
  window._venuesUseMyLocation = function(userTriggered) {
    if (!navigator.geolocation) {
      if (userTriggered && window.showNotification) window.showNotification('GPS indisponível neste dispositivo.', '', 'error');
      return;
    }
    var btn = document.getElementById('venues-geo-btn');
    if (btn && userTriggered) { btn.disabled = true; btn.textContent = '⏳'; }

    // Cache fresco → usa sem chamar GPS (silencioso, sem dialog)
    if (!userTriggered) {
      var cached = _readGpsCache();
      if (cached) { _applyGpsCoords(cached.lat, cached.lng, btn); return; }
    }

    navigator.geolocation.getCurrentPosition(function(pos) {
      _applyGpsCoords(pos.coords.latitude, pos.coords.longitude, btn);
    }, function(err) {
      if (btn) { btn.disabled = false; btn.textContent = '📍'; }
      if (userTriggered && window.showNotification) {
        window.showNotification('Não foi possível obter sua localização.',
          err && err.message ? err.message : 'Verifique a permissão no navegador.', 'info');
      }
    }, { timeout: 8000, maximumAge: 5 * 60 * 1000 });
  };

  // Auto-geolocate ao abrir #place.
  // v1.8.42-beta: GPS pedido automaticamente, mas só UMA VEZ por sessão.
  // Cache de coords evita re-pedir dentro de 10 minutos.
  // O dialog de permissão aparece na primeira abertura da sessão; após
  // o usuário conceder, o iOS/Android persiste a decisão para sessões
  // futuras (PWA home screen iOS 16.4+, Chrome Android).
  function _tryAutoGeolocate() {
    // 1. Cache fresco de coords → usa sem pedir GPS
    var cached = _readGpsCache();
    if (cached) { _applyGpsCoords(cached.lat, cached.lng, null); return; }

    // 2. Já pediu GPS nesta sessão e não obteve coords (usuário negou)?
    //    Não re-pede para não irritar durante a mesma sessão.
    try { if (sessionStorage.getItem(_GPS_SESSION_KEY)) return; } catch(e) {}

    // 3. Primeira solicitação desta sessão — dispara GPS normalmente.
    //    Se usuário conceder: coords cacheadas por 10min, sessão marcada.
    //    Se negar: sessionStorage marca para não re-pedir nesta sessão.
    try { sessionStorage.setItem(_GPS_SESSION_KEY, '1'); } catch(e) {}
    window._venuesUseMyLocation(false);
  }

  // ── Geocoding: center the map on the typed city (or user's profile city).
  // Uses google.maps.Geocoder lazily. Cached so we don't repeat the same
  // lookup. Result also feeds the Haversine filter for the distance slider.
  var _geocodeCache = {};
  async function _geocodeCity(city) {
    if (!city) return null;
    var key = city.toLowerCase().trim();
    if (_geocodeCache[key]) return _geocodeCache[key];
    if (!window.google || !window.google.maps || !window.google.maps.importLibrary) return null;
    try {
      await google.maps.importLibrary('geocoding');
      var geocoder = new google.maps.Geocoder();
      return await new Promise(function(resolve) {
        geocoder.geocode({ address: city + ', Brasil' }, function(results, status) {
          if (status === 'OK' && results && results[0] && results[0].geometry) {
            var loc = results[0].geometry.location;
            var coords = { lat: loc.lat(), lng: loc.lng() };
            _geocodeCache[key] = coords;
            resolve(coords);
          } else {
            resolve(null);
          }
        });
      });
    } catch (e) { return null; }
  }

  // v2.8.36: delega ao canônico window._haversineKm (store.js). Mantém a
  // assinatura por OBJETOS {lat,lng} e o guard Infinity usados aqui.
  function _haversineKm(a, b) {
    if (!a || !b) return Infinity;
    return window._haversineKm(a.lat, a.lng, b.lat, b.lng);
  }

  // Places nearby: lightweight discovery of external venues (not yet claimed
  // em scoreplace). Free tier allows ~17k queries/month — debounced + gated
  // em um centro real pra não queimar cota.
  //
  // Estratégia atual (v0.16.2+): **queries paralelas por termo** em vez de
  // uma única query conjuntiva. Histórico: um único `searchByText` com
  // "quadra esportiva clube arena tênis padel beach tennis pickleball" mais
  // o label de localização aparentemente fazia o Google interpretar como
  // match conjuntivo — venues cujo nome não contém "arena" ou "quadra"
  // (ex: "Play Tennis Morumbi", "AB Academia de Tênis") eram deprioritizados
  // ou dropados do ranking, mesmo estando mais próximos que resultados que
  // apareciam. A cada termo rodamos uma busca focada e mergimos por placeId.
  //
  // Custo: 9 termos = 9 API calls por refresh. Refresh é debounced + só roda
  // quando o user muda filtros ou ganha GPS — tipicamente 5-30 refreshs por
  // sessão → 45-270 calls/sessão. Bem dentro do free tier.
  //
  // locationBias em vez de locationRestriction: vies SEM trava, então lugares
  // relevantes fora do raio também aparecem. O haversine client-side filtra
  // depois conforme state.distanceKm. Isso mata o cenário "zero resultados"
  // em áreas com poucos venues no raio estrito.
  //
  // NOTA: `state.location` (label textual do GPS/endereço) NÃO é mais anexado
  // ao textQuery — locationBias já resolve a geografia, e textos como
  // "Minha localização atual" poluíam o matching.
  async function _loadGoogleNearby(center, radiusKm, sports) {
    if (!center || !window.google || !window.google.maps || !window.google.maps.importLibrary) return [];
    try {
      var placesLib = await google.maps.importLibrary('places');
      if (!placesLib || !placesLib.Place || typeof placesLib.Place.searchByText !== 'function') return [];

      // Conjunto amplo de termos quando nenhuma modalidade específica está
      // ativa. Cobre vocabulário que o Google indexa bem em PT-BR —
      // modalidades + tipos de estabelecimento + redes conhecidas. Cada
      // termo retorna ~10 candidatos distintos; o merge por placeId remove
      // overlap e dá coverage muito maior que uma única query.
      var baseTerms = [
        'beach tennis',
        'padel',
        'tênis',
        'pickleball',
        'vôlei de praia',
        'futevôlei',
        'tênis de mesa',
        'academia de tênis',
        'escola de tênis',
        'arena esportiva',
        'clube esportivo',
        'quadra de tênis',
        'quadra de padel',
        'quadra de beach tennis'
      ];
      // Compat: aceita string (caminho legacy) OU array (multi-select da v0.16.3).
      var sportsArr = Array.isArray(sports) ? sports : (sports ? [sports] : []);
      // Se há modalidades selecionadas, usamos elas como termos primários +
      // genéricos multi-esporte (pega venues que oferecem a modalidade mas não
      // têm o nome dela, tipo "Clube X" que tem quadra de padel).
      var terms = sportsArr.length > 0
        ? sportsArr.concat(['arena esportiva', 'clube esportivo', 'academia de tênis', 'escola de tênis'])
        : baseTerms;

      // v1.0.15-beta: locationBias → locationRestriction strict.
      // v1.0.18-beta: REVERTIDO pra locationBias. JS SDK do
      // Place.searchByText (Places API New) aceita locationBias com Circle
      // OU Bounds, mas locationRestriction SÓ aceita Bounds (rectangle).
      // Passar Circle pra locationRestriction era silenciosamente
      // ignorado/mal interpretado em alguns casos — alguns user (em São
      // Paulo com PLANO ATIVO no Paineiras) recebiam ZERO results do
      // Google. Voltamos pro locationBias (que aceita Circle) e manter o
      // filtro haversine client-side abaixo como defesa-em-profundidade
      // contra leaks (que era o objetivo original do v1.0.15: bloquear
      // Brasil aparecendo pra usuária em Paris).
      var biasRadiusM = Math.min(50, Math.max(1, radiusKm)) * 1000;
      var biasCenter = new google.maps.LatLng(center.lat, center.lng);

      var promises = terms.map(function(term) {
        return placesLib.Place.searchByText({
          textQuery: term,
          fields: ['displayName', 'formattedAddress', 'location', 'id', 'types'],
          locationBias: {
            center: biasCenter,
            radius: biasRadiusM
          },
          maxResultCount: 10
        }).catch(function(e) {
          window._warn('[Places] term failed:', term, e && e.message);
          return null;
        });
      });

      var results = await Promise.all(promises);

      // Dedupe por placeId — primeiro termo a ver um venue ganha; como
      // sortamos por distância depois no caller, a ordem de inserção aqui
      // não importa muito.
      var byId = {};
      results.forEach(function(r) {
        var places = (r && r.places) || [];
        places.forEach(function(p) {
          if (!p || !p.id) return;
          if (byId[p.id]) return;
          byId[p.id] = p;
        });
      });

      var merged = Object.keys(byId).map(function(id) { return byId[id]; });
      var mapped = merged.map(function(p) {
        var loc = p.location;
        return {
          placeId: p.id,
          name: p.displayName || '',
          address: p.formattedAddress || '',
          lat: loc ? loc.lat() : null,
          lng: loc ? loc.lng() : null,
          types: p.types || []
        };
      });
      // Defense-in-depth client-side: mesmo com locationRestriction, dropa
      // qualquer venue que escape do raio (rare bug do Google API). O
      // usuário não deve ver resultados a 7000km do GPS atual.
      var maxKm = Math.min(50, Math.max(1, radiusKm));
      var filtered = mapped.filter(function(v) {
        if (v.lat == null || v.lng == null) return true;
        var d = _haversineKm(center, { lat: Number(v.lat), lng: Number(v.lng) });
        return d <= maxKm;
      });
      var droppedFar = mapped.length - filtered.length;
      if (droppedFar > 0) {
        window._warn('[Places] dropped ' + droppedFar + ' results outside ' + maxKm + 'km radius');
      }
      return filtered;
    } catch (e) {
      window._warn('Places nearby err:', e && e.message);
      return [];
    }
  }

  // Build a compact timeline slice for the venue detail modal: friends'
  // avatars who are here now + "+N outros", plus a one-line summary for
  // next hours. Uses the same classification rules as the presence view.
  // v2.1.70: detalhe do local usa os MESMOS renderers dos cards preferidos —
  // gráfico hora-a-hora + "Agora no local" + "Próximas horas" (com box do
  // torneio + amigos nomeados). _buildMovimentoHtml virou wrapper: hidrata os
  // slots e retorna '' (os call sites antigos não sobrescrevem).
  async function _buildMovimentoHtml(venue) {
    await _hydrateDetailMovement(venue);
    return '';
  }

  async function _hydrateDetailMovement(venue) {
    var slot = document.getElementById('venue-movimento-slot');
    if (!slot || !window.PresenceDB || !venue) return;
    // v2.1.72: cache de perfis de amigos pro match por NOME (participante de
    // torneio sem uid).
    try { if (typeof window._loadFriendProfilesCached === 'function') await window._loadFriendProfilesCached(); } catch (e) {}
    slot.innerHTML =
      '<div id="venue-chart-slot"></div>' +
      '<div id="venue-now-slot"></div>' +
      '<div id="venue-upcoming-slot"></div>';
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;
    var friends = (cu && Array.isArray(cu.friends)) ? cu.friends : [];
    var _todayKey = window.PresenceDB.dayKey(new Date());
    var dayKey = _todayKey;
    var _moveDayLabel = ''; // '' = hoje (rótulo padrão do gráfico)
    // v2.8.78: se o usuário tem ida(s) futura(s) neste local, o movimento mostra o
    // dia da ida MAIS PRÓXIMA (é quando ele vai estar lá). Sem ida → hoje.
    try {
      if (myUid) {
        var _myA = await window.PresenceDB.loadMyActive(myUid);
        var _mine = (_myA || []).filter(function(p) { return p && p.placeId === venue.placeId && p.type === 'planned' && p.startsAt > Date.now() && _presenceVisibleNow(p); });
        _mine.sort(function(a, b) { return a.startsAt - b.startsAt; });
        if (_mine.length) {
          var _near = new Date(_mine[0].startsAt);
          dayKey = window.PresenceDB.dayKey(_near);
          if (dayKey !== _todayKey) {
            var _tm = new Date(); _tm.setHours(0, 0, 0, 0);
            var _nm = new Date(_near); _nm.setHours(0, 0, 0, 0);
            var _dd = Math.round((_nm.getTime() - _tm.getTime()) / 86400000);
            _moveDayLabel = _dd === 1 ? 'amanhã' : ('em ' + _dd + ' dias');
          }
        }
      }
    } catch (e) {}
    var presences = [];
    try { presences = await window.PresenceDB.loadForVenueDay(venue.placeId, dayKey); } catch (e) {}
    presences = (presences || []).filter(function(p) {
      if (!p) return false;
      if (p.visibility === 'friends') {
        if (myUid && p.uid === myUid) return true;
        return p.uid && friends.indexOf(p.uid) !== -1;
      }
      return true;
    });
    var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
    var pKey = window.PresenceDB.venueKey(venue.placeId, venue.name);
    var tHere = tournaments.filter(function(t) {
      if (!t || !t.startDate) return false;
      var tKey = window.PresenceDB.venueKey(t.venuePlaceId || '', t.venue || '');
      if (tKey !== pKey) return false;
      var d = new Date(t.startDate);
      return !isNaN(d.getTime()) && window.PresenceDB.dayKey(d) === dayKey;
    });
    var capacity = _calcVenueCapacity(venue);
    try { _renderPreferredChart('venue-chart-slot', presences, tHere, dayKey, capacity, { venueName: venue.name, realPid: venue.placeId, lat: venue.lat != null ? Number(venue.lat) : null, lon: venue.lon != null ? Number(venue.lon) : null, dayLabel: _moveDayLabel }); } catch (e) {}
    try { _renderNowAtVenueBox('venue-now-slot', presences, venue.placeId); } catch (e) {}
    try { _renderUpcomingBox('venue-upcoming-slot', presences, tHere, dayKey, venue.placeId); } catch (e) {}
    var anyContent = ['venue-chart-slot', 'venue-now-slot', 'venue-upcoming-slot'].some(function(id) {
      var e = document.getElementById(id); return e && e.innerHTML.trim() !== '';
    });
    if (!anyContent) {
      slot.innerHTML = '<div style="background:var(--bg-darker);border:1px solid var(--border-color);border-radius:10px;padding:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">Ninguém registrou presença ou torneio ' + (_moveDayLabel || 'hoje') + ' neste local.</div>';
    }
  }

  // List of tournaments at this venue — upcoming + past (last 6 months).
  // Pulled from AppStore cache; no extra fetch. Empty string when none.
  function _buildTournamentsHtml(venue) {
    var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
    var here = tournaments.filter(function(t) {
      if (!t) return false;
      return window.VenueDB.venueKey(t.venuePlaceId, t.venue) === venue.placeId;
    });
    if (here.length === 0) return '';
    var now = Date.now();
    var sixMonthsAgo = now - 183 * 24 * 3600 * 1000;
    var upcoming = [];
    var past = [];
    here.forEach(function(t) {
      var start = t.startDate ? new Date(t.startDate).getTime() : 0;
      if (!start || isNaN(start)) return;
      if (start >= now) upcoming.push({ t: t, ts: start });
      else if (start >= sixMonthsAgo) past.push({ t: t, ts: start });
    });
    upcoming.sort(function(a, b) { return a.ts - b.ts; });
    past.sort(function(a, b) { return b.ts - a.ts; });
    if (upcoming.length === 0 && past.length === 0) return '';

    var row = function(entry) {
      var t = entry.t;
      var d = new Date(entry.ts);
      var when = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
      var sport = t.sport ? String(t.sport).replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : '';
      var parts = Array.isArray(t.participants) ? t.participants.length : 0;
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.82rem;cursor:pointer;" onclick="window.location.hash=\'#tournaments/' + _safe(t.id) + '\'">' +
        '<span style="min-width:72px;color:var(--text-muted);font-size:0.72rem;">' + when + '</span>' +
        '<span style="flex:1;color:var(--text-bright);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🏆 ' + _safe(t.name || 'Torneio') + '</span>' +
        (sport ? '<span style="color:var(--text-muted);font-size:0.7rem;">' + _safe(sport) + '</span>' : '') +
        (parts ? '<span style="color:var(--text-muted);font-size:0.7rem;margin-left:4px;">· ' + parts + '</span>' : '') +
      '</div>';
    };

    var html = '<div style="background:var(--bg-darker);border:1px solid var(--border-color);border-radius:10px;padding:12px;">' +
      '<div style="font-weight:700;color:var(--text-bright);font-size:0.88rem;margin-bottom:8px;">🏆 Torneios neste local</div>';
    if (upcoming.length > 0) {
      html += '<div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:4px 0 2px 0;">Próximos</div>';
      upcoming.slice(0, 4).forEach(function(e) { html += row(e); });
    }
    if (past.length > 0) {
      html += '<div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 2px 0;">Recentes</div>';
      past.slice(0, 4).forEach(function(e) { html += row(e); });
    }
    html += '</div>';
    return html;
  }

  // Owner-only analytics: counts of presences (last 7 days) + tournaments today.
  // All derived from client-side queries we already have — no Cloud Function.
  async function _buildOwnerStatsHtml(venue) {
    if (!window.PresenceDB) return '';
    var dayKey = window.PresenceDB.dayKey(new Date());
    var weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    var presencesToday = [];
    try { presencesToday = await window.PresenceDB.loadForVenueDay(venue.placeId, dayKey); } catch (e) {}
    // Lightweight count of presences this week by scanning 7 days backward.
    // For a modest number of venues this is cheap; when it grows we'll
    // denormalize via Cloud Function.
    var weekCount = 0;
    try {
      var days = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date(Date.now() - i * 24 * 3600 * 1000);
        days.push(window.PresenceDB.dayKey(d));
      }
      for (var j = 0; j < days.length; j++) {
        var list = await window.PresenceDB.loadForVenueDay(venue.placeId, days[j]);
        weekCount += list.length;
      }
    } catch (e) {}
    var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
    var totalTournaments = tournaments.filter(function(t) {
      return t && window.VenueDB.venueKey(t.venuePlaceId, t.venue) === venue.placeId;
    }).length;
    var views = venue.viewCount || 0;
    return '<div style="background:linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12));border:1px solid rgba(99,102,241,0.35);border-radius:10px;padding:12px;">' +
      '<div style="font-weight:700;color:var(--text-bright);font-size:0.85rem;margin-bottom:8px;">📊 Seu painel (dono)</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">' +
        '<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:800;color:#a5b4fc;">' + views + '</div><div style="font-size:0.68rem;color:var(--text-muted);">visualizações</div></div>' +
        '<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:800;color:#fbbf24;">' + weekCount + '</div><div style="font-size:0.68rem;color:var(--text-muted);">check-ins (7 dias)</div></div>' +
        '<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:800;color:#10b981;">' + totalTournaments + '</div><div style="font-size:0.68rem;color:var(--text-muted);">torneios no local</div></div>' +
      '</div>' +
    '</div>';
  }

  // Fecha o overlay de detalhe + restaura a back-header padrão da página que
  // estava por trás. Usado por todos os call sites que antes faziam
  // `document.getElementById('venues-detail-overlay').remove()` direto —
  // agora passam por aqui pra não vazar a classe `.venue-detail-open` no
  // body (que esconde a back-header da página durante o overlay).
  window._venuesCloseDetail = function() {
    var el = document.getElementById('venues-detail-overlay');
    if (el) el.remove();
    document.body.classList.remove('venue-detail-open');
  };

  // Detail: compact modal with contact actions + quick links into the rest of the app.
  window._venuesOpenDetail = async function(placeId) {
    var v = await window.VenueDB.loadVenue(placeId);
    if (!v) {
      // Invalid deep link or deleted venue — surface a friendly message
      // instead of silently doing nothing.
      var prev = document.getElementById('venues-detail-overlay');
      if (prev) prev.remove();
      var overlay = document.createElement('div');
      overlay.id = 'venues-detail-overlay';
      overlay.style.cssText = 'position:fixed;top:60px;left:0;right:0;bottom:0;background:var(--bg-dark);z-index:10010;display:flex;align-items:center;justify-content:center;padding:16px;';
      overlay.innerHTML =
        '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:24px;max-width:420px;width:100%;text-align:center;">' +
          '<div style="font-size:2rem;margin-bottom:8px;">🧭</div>' +
          '<div style="font-weight:800;color:var(--text-bright);font-size:1.05rem;margin-bottom:6px;">Local não encontrado</div>' +
          '<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;">Este link pode estar desatualizado, ou o dono liberou a reivindicação. Volte à busca para explorar outros locais.</div>' +
          '<button class="btn btn-primary" onclick="window._venuesCloseDetail()">Entendi</button>' +
        '</div>';
      document.body.appendChild(overlay);
      document.body.classList.add('venue-detail-open');
      return;
    }
    // Fire-and-forget viewCount bump. Skip when the owner is viewing their own
    // venue so owner curiosity doesn't inflate numbers. Also skip for anonymous
    // visitors — rules require auth, so writing would fail silently anyway.
    var cu = window.AppStore && window.AppStore.currentUser;
    if (cu && cu.uid && v.ownerUid !== cu.uid && typeof window.VenueDB.incrementViewCount === 'function') {
      window.VenueDB.incrementViewCount(placeId);
    }
    var prev = document.getElementById('venues-detail-overlay');
    if (prev) prev.remove();
    var sportsHtml = (Array.isArray(v.sports) ? v.sports : []).map(function(s) {
      return '<span style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;font-size:0.72rem;padding:3px 10px;border-radius:999px;margin-right:4px;">' + _safe(s) + '</span>';
    }).join('');
    var contactBits = [];
    var c = v.contact || {};
    if (c.phone) contactBits.push('<a href="tel:' + _safe(c.phone.replace(/\D/g,'')) + '" style="display:inline-flex;align-items:center;gap:6px;background:#3b82f6;color:#fff;padding:8px 14px;border-radius:10px;text-decoration:none;font-size:0.82rem;font-weight:600;">📞 Ligar</a>');
    if (c.whatsapp) {
      var wa = c.whatsapp.replace(/\D/g,'');
      if (wa && !wa.startsWith('55')) wa = '55' + wa;
      contactBits.push('<a href="https://wa.me/' + _safe(wa) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;background:#25d366;color:#fff;padding:8px 14px;border-radius:10px;text-decoration:none;font-size:0.82rem;font-weight:600;">💬 WhatsApp</a>');
    }
    if (c.instagram) {
      var ig = String(c.instagram).replace(/^@/, '');
      contactBits.push('<a href="https://instagram.com/' + _safe(ig) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);color:#fff;padding:8px 14px;border-radius:10px;text-decoration:none;font-size:0.82rem;font-weight:600;">📷 Instagram</a>');
    }
    if (c.email) contactBits.push('<a href="mailto:' + _safe(c.email) + '" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);padding:8px 14px;border-radius:10px;text-decoration:none;font-size:0.82rem;font-weight:600;">✉️ E-mail</a>');

    var mapsUrl = v.lat && v.lon
      ? 'https://www.google.com/maps/search/?api=1&query=' + v.lat + ',' + v.lon + (v.placeId && v.placeId.indexOf('custom:') !== 0 ? '&query_place_id=' + encodeURIComponent(v.placeId) : '')
      : ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v.name || ''));

    // Prefill data for cross-feature jumps into presence/create-tournament.
    var prefillJson = JSON.stringify({
      placeId: v.placeId,
      venueName: v.name,
      sports: Array.isArray(v.sports) ? v.sports : [],
      lat: v.lat, lon: v.lon
    });

    // Overlay começa ABAIXO da topbar (top:60px) pra manter o cabeçalho
    // padrão do app visível — logo + pódio ficam no topbar (z-index:100), e
    // o overlay (z-index:10010) cobre o conteúdo embaixo. Background opaco
    // (var(--bg-dark)) pra não bleedar o #venues por trás. O padrão
    // voltar+título+hamburger fica dentro do próprio card via
    // window._renderBackHeader — consistente com todas as outras views.
    var overlay = document.createElement('div');
    overlay.id = 'venues-detail-overlay';
    overlay.style.cssText = 'position:fixed;top:60px;left:0;right:0;bottom:0;background:var(--bg-dark);z-index:10010;display:flex;align-items:flex-start;justify-content:center;padding:0;overflow-y:auto;';
    // Tags de proveniência: "✅ Informações oficiais" quando reivindicado;
    // "📝 Cadastrado por [nome]" quando é cadastro comunitário.
    var ownershipTag = v.ownerUid
      ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.68rem;font-weight:600;color:#10b981;opacity:0.85;">✅ oficial</span>'
      : (v.createdByName
          ? '<span title="Cadastro comunitário — pode não refletir 100% a realidade até o proprietário reivindicar." style="display:inline-flex;flex-direction:column;font-size:0.65rem;color:#64748b;line-height:1.3;opacity:0.8;">🤝 comunidade<span>por ' + _safe(v.createdByName) + '</span></span>'
          : '');
    // Header buttons: Editar (always when user can edit) + Reivindicar (when
    // unclaimed and logged in). Reivindicar moved from body into the header's
    // top-right (replaces the old "Fechar" — close is now a proper "Voltar"
    // arrow on the left, matching the back-header pattern used app-wide).
    var isOwner = !!(cu && cu.uid && v.ownerUid === cu.uid);
    // Only non-public venues can be claimed. Public courts (beaches, praças,
    // parques) são de domínio público — não fazem sentido ter dono declarado.
    // Privadas (condominiais/comerciais) sim podem ser reivindicadas pelo
    // responsável. accessPolicy ausente ⇒ trata como 'public' (default seguro).
    var _effectiveAccessPolicy = v.accessPolicy || 'public';
    var canClaim = !!(cu && cu.uid && !v.ownerUid && _effectiveAccessPolicy !== 'public');
    // Community edit is allowed on unclaimed venues (saveVenue transaction
    // blocks non-owners on claimed ones). Owners can always edit. Para
    // quadras públicas, como não há dono possível, todo usuário logado pode
    // editar (mantém espírito comunitário — correções de endereço, horário,
    // etc.).
    var canCommunityEdit = !!(cu && cu.uid && !v.ownerUid);
    var canEdit = isOwner || canCommunityEdit;
    // v1.1.9-beta: Editar agora abre o form COMPLETO em #my-venues (mesmo
    // form do Cadastrar — esportes, quadras, horários, etc.) em vez do
    // form limitado inline. User: 'o botão editar deveria abrir uma tela
    // igual a de cadastrar local. não entendi porque aparece uma tela
    // muito limitada ao clicar em editar.'
    // skipPublicGuard:true porque Editar é correção comunitária, não
    // reivindicação — o guard de public-access só faz sentido pra Reivindicar.
    // Mobile: textos curtos via responsive — só ✏️/🏢 caso a tela aperte.
    var editBtn = canEdit
      ? '<button onclick=\'window._venueOwnerEditExisting("' + _safe(v.placeId) + '", {skipPublicGuard:true}); window._venuesCloseDetail(); window.location.hash="#my-venues"\' style="background:#6366f1;color:#fff;border:none;font-weight:700;flex-shrink:0;font-size:0.78rem;padding:6px 12px;border-radius:8px;cursor:pointer;white-space:nowrap;">✏️ <span class="venue-detail-btn-label">Editar</span></button>'
      : '';
    var claimBtn = canClaim
      ? '<button onclick=\'window._venueOwnerEditExisting("' + _safe(v.placeId) + '"); window._venuesCloseDetail(); window.location.hash="#my-venues"\' style="background:#10b981;color:#fff;border:none;font-weight:700;flex-shrink:0;font-size:0.78rem;padding:6px 12px;border-radius:8px;cursor:pointer;white-space:nowrap;">🏢 <span class="venue-detail-btn-label">Reivindicar</span></button>'
      : '';
    var headerBtns = editBtn + claimBtn;
    // Callback do voltar — fecha overlay + restaura back-header da página.
    // Registrado em window._backNavCallbacks via _renderBackHeader.
    var backCb = function() { if (typeof window._venuesCloseDetail === 'function') window._venuesCloseDetail(); };
    // v1.1.11-beta: nome do venue agora vai numa linha SEPARADA abaixo do
    // back-header. Antes ficava espremido entre Voltar e os botões Editar/
    // Reivindicar — em mobile truncava sempre. User: 'aqui o nome do lugar
    // poderia estar na linha de baixo (do voltar, editar e reinvindicar)
    // assim esses botoes ficam mais claros e com uma linha inteira para
    // o nome do lugar fica legal.'
    // Header agora: ← Voltar | (espaço) | ✏️ Editar | 🏢 Reivindicar
    // Logo abaixo: 🏢 Nome do Local em linha cheia + 📍 endereço
    var rightHtml = headerBtns
      ? '<div style="display:flex;gap:6px;flex-shrink:0;">' + headerBtns + '</div>'
      : '';
    var stdHeader = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({
          label: 'Voltar',
          middleHtml: '',
          rightHtml: rightHtml,
          extraStyle: 'background:var(--bg-card);padding:10px 14px;border-bottom:1px solid var(--border-color);',
          onClickOverride: backCb
        })
      : '';
    // Nome + endereço em linha cheia logo abaixo do header
    var nameRowHtml =
      '<div style="background:var(--bg-card);padding:14px 18px 12px;border-bottom:1px solid var(--border-color);">' +
        '<div style="font-weight:800;color:var(--text-bright);font-size:1.05rem;line-height:1.3;word-break:break-word;">🏢 ' + _safe(v.name) + '</div>' +
        (v.address ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;line-height:1.4;word-break:break-word;">📍 ' + _safe(v.address) + '</div>' : '') +
      '</div>';
    overlay.innerHTML =
      '<div id="venue-detail-card" style="background:var(--bg-card);width:100%;max-width:640px;min-height:100%;box-shadow:0 0 0 1px var(--border-color);">' +
        stdHeader +
        nameRowHtml +
        '<div id="venue-detail-body" style="padding:16px 18px;">' +
          (ownershipTag ? '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:12px;">' + ownershipTag + '</div>' : '') +
          (sportsHtml ? '<div style="margin-bottom:10px;">' + sportsHtml + '</div>' : '') +
          // Badge de política de acesso — informa claramente se o local é
          // público/só sócios/sócios+convidados/privado. Usuários sabem de
          // cara se podem "ir jogar lá" ou se precisam de convite.
          ((function() {
            var ap = v.accessPolicy || 'public';
            var apCfg = {
              public:              { icon: '🌐', category: 'Acesso público',   label: 'Aberto ao público',              bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
              members:             { icon: '🔒', category: 'Acesso restrito',  label: 'Só sócios',                     bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
              members_plus_guests: { icon: '🏆', category: 'Acesso restrito',  label: 'Sócios + convidados de torneios', bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24' },
              private:             { icon: '🔒', category: 'Acesso restrito',  label: 'Privado',                       bg: 'rgba(239,68,68,0.12)',   color: '#f87171' }
            }[ap] || null;
            if (!apCfg) return '';
            return '<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:' + apCfg.bg + ';color:' + apCfg.color + ';border:1px solid ' + apCfg.color + '40;font-size:0.72rem;font-weight:700;margin-bottom:10px;">' +
              apCfg.icon + ' <span>' + apCfg.category + '</span><span style="opacity:0.6;font-weight:400;font-size:0.68rem;">· ' + apCfg.label + '</span>' +
            '</div>';
          })()) +
          // Slot pras quadras detalhadas (subcollection courts). Populado
          // async após a modal abrir — não bloqueia a exibição inicial.
          '<div id="venue-courts-agg-slot" style="margin-bottom:12px;"></div>' +
          '<div id="venue-details-slot" style="margin-bottom:12px;"></div>' +
          (v.hours ? '<div style="font-size:0.82rem;color:var(--text-bright);margin-bottom:10px;">⏰ ' + _safe(v.hours) + '</div>' : '') +
          (contactBits.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">' + contactBits.join('') + '</div>' : '') +
          '<div id="venue-owner-stats-slot" style="margin-bottom:12px;"></div>' +
          '<div id="venue-movimento-slot" style="margin-bottom:12px;"></div>' +
          '<div id="venue-tournaments-slot" style="margin-bottom:12px;"></div>' +
          '<div id="venue-reviews-slot" style="margin-bottom:12px;"></div>' +
          // Histórico público de atualizações — quem cadastrou, quem mudou o
          // quê e quando. Hidratado async em _hydrateUpdateHistory.
          '<div id="venue-update-history-slot" style="margin-bottom:12px;"></div>' +
          // Check-in inline: slot hidratado async com os botões certos. Começa
          // com os botões "cheios" (Estou aqui agora + Planejar ida); se o
          // usuário já tiver check-in/plano ativo neste local, o slot é
          // substituído por "Cancelar presença" / "Cancelar plano" pra que ele
          // possa sair do local com um toque. Só aparece para usuários logados.
          (cu && cu.uid
            ? '<div id="venue-presence-btns-slot" data-placeid="' + _safe(v.placeId) + '" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>'
            : '') +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
            '<a href="' + _safe(mapsUrl) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none;">🗺️ Ver no mapa</a>' +
            '<button class="btn btn-sm" onclick=\'try{sessionStorage.setItem("_presencePrefill", ' + JSON.stringify(prefillJson) + ')}catch(e){}window.location.hash="#presence"\' style="background:#f59e0b;color:#1a0f00;border:none;font-weight:700;">📍 Ver presenças</button>' +
            '<button class="btn btn-sm btn-primary" onclick=\'window._venuesStartTournamentHere(' + JSON.stringify(prefillJson) + ')\'>🏆 Criar torneio aqui</button>' +
            '<button class="btn btn-sm" onclick=\'window._venuesShare("' + _safe(v.placeId) + '")\' style="background:#25d366;color:#fff;border:none;font-weight:700;">📤 Compartilhar</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    // Clique fora do card não fecha — com overlay full-width a margem é zero
    // e o usuário poderia fechar por engano. Voltar é explícito via botão.
    document.body.appendChild(overlay);
    // Esconde a back-header da página por trás do overlay. Sem isso, quando
    // o card não preenche a altura total, a back-header de #venues aparece
    // fora do card e vira um segundo "Voltar" visível. Restauração em
    // _venuesCloseDetail.
    document.body.classList.add('venue-detail-open');
    // Async: courts agregados por modalidade — mostra "4 quadras de Beach
    // Tennis (compartilhadas) · 2 de Tênis (saibro) · ..." antes do resto
    // pra dar contexto imediato das opções. Read público via rules.
    // v0.17.16: delega ao resolver global em store.js (centralização).
    var _sportIcon = function(s) { return window._sportIcon ? window._sportIcon(s) : '🏅'; };
    if (window.VenueDB && typeof window.VenueDB.aggregateVenueCourts === 'function') {
      window.VenueDB.aggregateVenueCourts(v.placeId).then(function(agg) {
        var slot = document.getElementById('venue-courts-agg-slot');
        if (!slot || !agg || agg.sports.length === 0) return;
        var rows = agg.sports.map(function(sportName) {
          var info = agg.bySport[sportName];
          var surfaceList = Object.keys(info.surfaces || {});
          var surfaceTxt = surfaceList.length > 0 ? ' <span style="opacity:0.6;font-weight:400;">(' + _safe(surfaceList.join(', ')) + ')</span>' : '';
          var sharedTxt = info.shared
            ? '<span style="font-size:0.62rem;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;padding:1px 6px;border-radius:10px;margin-left:4px;">🔁 compartilhada</span>'
            : '';
          return '<div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-bright);padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
            '<span style="font-size:1rem;flex-shrink:0;">' + _sportIcon(sportName) + '</span>' +
            '<b style="color:#a5b4fc;min-width:16px;text-align:right;">' + info.count + '</b>' +
            '<span>quadra' + (info.count === 1 ? '' : 's') + ' de <b>' + _safe(sportName) + '</b>' + surfaceTxt + '</span>' +
            sharedTxt +
          '</div>';
        }).join('');
        var contribLine = agg.contributors.length > 1
          ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;opacity:0.65;">Informações contribuídas por ' + agg.contributors.length + ' jogadores</div>'
          : '';
        slot.innerHTML =
          '<div style="background:var(--bg-darker);border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;">' +
            '<div style="font-weight:700;color:var(--text-bright);font-size:0.82rem;margin-bottom:8px;">🏟️ Quadras disponíveis</div>' +
            rows +
            contribLine +
          '</div>';
        // Detalhes / Preços box (logo após as quadras)
        var detailSlot = document.getElementById('venue-details-slot');
        if (detailSlot && (v.description || v.priceRange)) {
          var detailParts = '';
          if (v.priceRange) detailParts += '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:' + (v.description ? '8' : '0') + 'px;"><span style="flex-shrink:0;">💰</span><span style="font-size:0.82rem;color:var(--text-bright);font-weight:600;">' + _safe(v.priceRange) + '</span></div>';
          if (v.description) detailParts += '<div style="font-size:0.82rem;color:var(--text-muted);line-height:1.55;white-space:pre-wrap;">' + _safe(v.description) + '</div>';
          detailSlot.innerHTML =
            '<div style="background:var(--bg-darker);border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;">' +
              '<div style="font-weight:700;color:var(--text-bright);font-size:0.82rem;margin-bottom:8px;">📋 Detalhes</div>' +
              detailParts +
            '</div>';
        }
      }).catch(function(e) { window._warn('courts agg:', e); });
    } else if (v.description || v.priceRange) {
      // fallback quando courts DB não disponível — mostra o box de detalhes igualmente
      setTimeout(function() {
        var detailSlot = document.getElementById('venue-details-slot');
        if (!detailSlot) return;
        var detailParts = '';
        if (v.priceRange) detailParts += '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:' + (v.description ? '8' : '0') + 'px;"><span>💰</span><span style="font-size:0.82rem;color:var(--text-bright);font-weight:600;">' + _safe(v.priceRange) + '</span></div>';
        if (v.description) detailParts += '<div style="font-size:0.82rem;color:var(--text-muted);line-height:1.55;white-space:pre-wrap;">' + _safe(v.description) + '</div>';
        detailSlot.innerHTML =
          '<div style="background:var(--bg-darker);border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;">' +
            '<div style="font-weight:700;color:var(--text-bright);font-size:0.82rem;margin-bottom:8px;">📋 Detalhes</div>' +
            detailParts +
          '</div>';
      }, 0);
    }
    // Async: fetch presences + tournaments, inject into the slot so the
    // modal body stays snappy on open.
    _buildMovimentoHtml(v).then(function(html) {
      var slot = document.getElementById('venue-movimento-slot');
      if (slot && html) slot.innerHTML = html;
    });
    // Owner sees private analytics. Anyone else: slot stays empty.
    if (cu && cu.uid && v.ownerUid === cu.uid) {
      _buildOwnerStatsHtml(v).then(function(html) {
        var slot = document.getElementById('venue-owner-stats-slot');
        if (slot && html) slot.innerHTML = html;
      });
    }
    // Avaliações — estrelas + textos. Renderiza resumo + lista + botão
    // "Deixar avaliação".
    _hydrateReviews(v);
    // Histórico de atualizações (cadastro + edits da comunidade).
    _hydrateUpdateHistory(v);
    // Botões de presença — render inicial é "Estou aqui / Planejar ida" ou
    // "Cancelar presença / Cancelar plano" dependendo do estado atual do
    // usuário neste venue.
    if (cu && cu.uid) _hydratePresenceButtonsForVenue(v);
  };

  // Carrega as presenças ativas do usuário neste venue e substitui o conteúdo
  // do slot `#venue-presence-btns-slot` pelos botões corretos:
  // - Sem presença ativa: "📍 Estou aqui agora" + "🗓️ Planejar ida"
  // - Check-in ativo aqui: "❌ Cancelar presença" no lugar do Estou aqui
  // - Plano ativo aqui: "❌ Cancelar plano" no lugar do Planejar ida
  // Reusado após cada mutação (check-in, plano, cancel) pra refletir o novo
  // estado sem fechar/reabrir a modal.
  async function _hydratePresenceButtonsForVenue(v) {
    var slot = document.getElementById('venue-presence-btns-slot');
    if (!slot) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !window.PresenceDB) { slot.innerHTML = ''; return; }
    var myActive = [];
    try { myActive = await window.PresenceDB.loadMyActive(cu.uid); } catch (e) {}
    var now = Date.now();
    var hereCheckin = null;
    // v2.8.76: coleta TODAS as idas MANUAIS deste local (múltiplas idas). A ida
    // vinda de TORNEIO NÃO entra aqui — é gerida pelo torneio e não ocupa o card
    // (antes virava "Editar/Cancelar" e escondia o "Planejar ida").
    var manualPlans = [];
    (myActive || []).forEach(function(p) {
      if (!p || p.placeId !== v.placeId) return;
      if (p.type === 'checkin' && p.startsAt <= now && p.endsAt > now && !hereCheckin) hereCheckin = p;
      if (p.type === 'planned' && !p.tournamentId && p.source !== 'tournament' && p.startsAt > now) manualPlans.push(p);
    });
    manualPlans.sort(function(a, b) { return a.startsAt - b.startsAt; });
    // ter ida(s) manual(is) aqui = intenção de frequentar → vira preferido (silencioso).
    if (manualPlans.length) { try { _autoAddPreferredSilent(v); } catch (e) {} }
    var safePid = _safe(v.placeId);
    var checkinBtn = hereCheckin
      ? '<button id="venue-quickcheckin-btn" class="btn btn-sm hover-lift" onclick=\'window._venuesCancelMyPresenceHere("' + String(hereCheckin._id || '').replace(/"/g,'&quot;') + '","' + safePid + '","checkin")\' style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;font-weight:700;padding:8px 14px;" title="Você está registrado aqui agora · clique pra sair">✕ Cancelar presença</button>'
      : '<button id="venue-quickcheckin-btn" class="btn btn-sm hover-lift" onclick=\'window._venuesQuickCheckIn("' + safePid + '")\' style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;font-weight:700;padding:8px 14px;">📍 Estou aqui agora</button>';
    // v2.8.76: "Planejar ida" SEMPRE disponível (permite múltiplas idas).
    var planBtn = '<button id="venue-quickplan-btn" class="btn btn-sm hover-lift" onclick=\'window._venuesQuickPlan("' + safePid + '")\' style="background:#6366f1;color:#fff;border:none;font-weight:700;padding:8px 14px;">🗓️ Planejar ida</button>';
    // Lista das idas manuais já planejadas — cada uma com editar/cancelar.
    var plansList = '';
    if (manualPlans.length) {
      var hm = window._formatHHMM;
      var todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
      plansList = '<div style="display:flex;flex-direction:column;gap:5px;width:100%;margin-top:8px;">' +
        manualPlans.map(function(p) {
          var d1 = new Date(p.startsAt), d2 = new Date(p.endsAt);
          var pmid = new Date(p.startsAt); pmid.setHours(0, 0, 0, 0);
          var dd = Math.round((pmid.getTime() - todayMid.getTime()) / 86400000);
          var dayLbl = dd <= 0 ? 'hoje' : (dd === 1 ? 'amanhã' : ('em ' + dd + 'd'));
          var timeLbl = dayLbl + ' · ' + hm(d1) + (p.openEnded ? '' : '–' + hm(d2));
          var pid = String(p._id || '').replace(/"/g, '&quot;');
          return '<div style="display:flex;align-items:center;gap:8px;background:var(--bg-darker);border:1px solid var(--border-color);border-radius:10px;padding:6px 10px;box-sizing:border-box;">' +
              '<span style="flex:1;min-width:0;font-size:0.8rem;color:var(--text-bright);font-weight:600;">🗓️ ' + timeLbl + '</span>' +
              '<button class="btn btn-sm" onclick=\'window._venuesEditPlanPreferred("' + safePid + '","' + pid + '")\' style="background:#6366f1;color:#fff;border:none;font-weight:700;padding:4px 10px;font-size:0.72rem;" title="Editar esta ida">✏️</button>' +
              '<button class="btn btn-sm" onclick=\'window._venuesCancelMyPresenceHere("' + pid + '","' + safePid + '","planned")\' style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;font-weight:700;padding:4px 10px;font-size:0.72rem;" title="Cancelar esta ida">✕</button>' +
            '</div>';
        }).join('') +
      '</div>';
    }
    slot.innerHTML = checkinBtn + planBtn + plansList;
  }

  // Cancela presença/plano ativo no venue e re-hidrata:
  //  - Botões da modal (voltam a "Estou aqui / Planejar ida")
  //  - Bloco "Agora no local" (some da lista)
  //  - Widget de presença do dashboard (pill some quando usuário volta)
  // Protege contra double-tap desabilitando o botão até a operação completar.
  window._venuesCancelMyPresenceHere = async function(docId, placeId, type) {
    if (!docId || !window.PresenceDB) return;
    var label = type === 'planned' ? 'seu plano aqui' : 'sua presença aqui';
    var msg = 'Cancelar ' + label + '?';
    var doIt = async function() {
      var btn = type === 'planned'
        ? document.getElementById('venue-quickplan-btn')
        : document.getElementById('venue-quickcheckin-btn');
      if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
      try {
        await window.PresenceDB.cancelPresence(docId);
        if (window.showNotification) {
          window.showNotification(
            type === 'planned' ? 'Plano cancelado.' : 'Presença cancelada.',
            '',
            'info'
          );
        }
        // Re-hidrata: botões, movimento, e widget da dashboard.
        var v = await window.VenueDB.loadVenue(placeId);
        if (v) {
          _hydratePresenceButtonsForVenue(v);
          _buildMovimentoHtml(v).then(function(html) {
            var slot = document.getElementById('venue-movimento-slot');
            if (slot && html) slot.innerHTML = html;
          });
        }
        // Re-hidrata botões dos cards da seção "Locais preferidos" — se o
        // venue cancelado é um preferido, o botão volta a mostrar "Estou
        // aqui agora" / "Planejar ida".
        // v0.16.20: se o doc cancelado é o que tá sendo focado no modo
        // colapsado, limpa o foco e re-renderiza pra reabrir a lista.
        if (state.focusedPreferred && state.focusedPreferred.docId === docId) {
          state.focusedPreferred = null;
          _stopChartAutoTick();
          renderResults();
        } else {
          _hydratePreferredPresenceSlots();
          // v0.16.28: movimento também precisa refletir cancelamento.
          _hydrateAllPreferredMovement();
        }
        if (typeof window._hydrateMyActivePresenceWidget === 'function') {
          window._hydrateMyActivePresenceWidget();
        }
      } catch (e) {
        window._warn('Cancel venue presence failed:', e);
        if (window.showNotification) window.showNotification('Erro ao cancelar.', '', 'error');
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
      }
    };
    // Prefere o diálogo nativo do app (coeso com temas/i18n); cai em confirm.
    if (typeof window.showConfirmDialog === 'function') {
      window.showConfirmDialog(msg, '', doIt, null, { confirmText: 'Cancelar presença', cancelText: 'Voltar', type: 'danger' });
    } else if (window.confirm(msg)) {
      doIt();
    }
  };

  // Star widget com 5 posições. `value` determina quantas ficam cheias;
  // `interactive` faz cada estrela clicável para setar via window._venuesPickStars.
  function _starsHtml(value, size, interactive) {
    size = size || '1rem';
    var out = '';
    for (var i = 1; i <= 5; i++) {
      var filled = i <= value;
      var char = filled ? '★' : '☆';
      var color = filled ? '#fbbf24' : 'rgba(148,163,184,0.5)';
      if (interactive) {
        out += '<span onclick="window._venuesPickStars(' + i + ')" style="cursor:pointer;font-size:' + size + ';color:' + color + ';padding:0 2px;" data-star="' + i + '">' + char + '</span>';
      } else {
        out += '<span style="font-size:' + size + ';color:' + color + ';">' + char + '</span>';
      }
    }
    return out;
  }

  async function _hydrateReviews(venue) {
    var slot = document.getElementById('venue-reviews-slot');
    if (!slot || !window.VenueDB) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    var reviews = [];
    try { reviews = await window.VenueDB.loadReviews(venue.placeId, 50); } catch (e) {}
    var count = reviews.length;
    var avg = 0;
    if (count > 0) {
      var sum = 0;
      for (var i = 0; i < count; i++) sum += (parseInt(reviews[i].rating, 10) || 0);
      avg = sum / count;
    }
    var header = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
      '<div style="font-weight:700;color:var(--text-bright);font-size:0.92rem;">⭐ Avaliações</div>' +
      (count > 0
        ? '<div style="display:inline-flex;align-items:center;gap:6px;">' +
            '<span style="font-weight:700;color:#fbbf24;font-size:0.95rem;">' + avg.toFixed(1) + '</span>' +
            _starsHtml(Math.round(avg), '0.9rem', false) +
            '<span style="color:var(--text-muted);font-size:0.78rem;">(' + count + (count === 1 ? ' avaliação' : ' avaliações') + ')</span>' +
          '</div>'
        : '<span style="color:var(--text-muted);font-size:0.8rem;">Seja o primeiro a avaliar.</span>') +
      (cu && cu.uid
        ? '<button class="btn btn-sm btn-primary hover-lift" style="margin-left:auto;font-size:0.78rem;padding:4px 10px;" onclick="window._venuesOpenReviewDialog(\'' + _safe(venue.placeId) + '\')">✍️ Deixar avaliação</button>'
        : '')
    + '</div>';

    var list = '';
    reviews.slice(0, 8).forEach(function(r) {
      var hasText = r.text && r.text.trim();
      var anon = r.anonymous && !hasText;
      var name = anon ? 'Anônimo' : (r.displayName || 'Usuário');
      var initials = name.trim().split(/\s+/).map(function(s){return s.charAt(0);}).join('').substring(0,2).toUpperCase();
      var avatar = (!anon && r.photoURL)
        ? '<img src="' + _safe(r.photoURL) + '" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">'
        : '<div style="width:32px;height:32px;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.78rem;flex-shrink:0;">' + _safe(anon ? '?' : initials) + '</div>';
      var when = '';
      if (r.updatedAt) {
        try { when = new Date(r.updatedAt).toLocaleDateString((window._currentLang === 'en' ? 'en-US' : 'pt-BR'), { day: '2-digit', month: 'short' }); } catch (e) {}
      }
      var canDelete = cu && cu.uid === r.uid;
      var delBtn = canDelete
        ? '<button title="Apagar" onclick="window._venuesDeleteReview(\'' + _safe(venue.placeId) + '\',\'' + _safe(r._id) + '\')" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.8rem;padding:0 4px;opacity:0.5;">✕</button>'
        : '';
      list += '<div style="display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--border-color);">' +
        avatar +
        '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            '<span style="font-weight:600;color:var(--text-bright);font-size:0.85rem;">' + _safe(name) + '</span>' +
            _starsHtml(r.rating, '0.8rem', false) +
            (when ? '<span style="color:var(--text-muted);font-size:0.72rem;">· ' + _safe(when) + '</span>' : '') +
            delBtn +
          '</div>' +
          (hasText ? '<div style="font-size:0.82rem;color:var(--text-main);margin-top:4px;line-height:1.45;white-space:pre-wrap;">' + _safe(r.text) + '</div>' : '') +
        '</div>' +
      '</div>';
    });

    slot.innerHTML = '<div style="background:var(--bg-darker);border:1px solid var(--border-color);border-radius:10px;padding:12px;">' + header + list + '</div>';
  }

  // ── Histórico público de atualizações ─────────────────────────────────────
  // Mostra quem cadastrou o venue e quem fez updates depois, com lista dos
  // campos que foram alterados em cada edit. Dá transparência para a comunidade
  // entender de onde veio cada pedaço da informação.
  function _hydrateUpdateHistory(v) {
    var slot = document.getElementById('venue-update-history-slot');
    if (!slot) return;
    var hist = Array.isArray(v.updateHistory) ? v.updateHistory.slice() : [];
    // Entrada implícita de cadastro inicial — deriva de createdByName/createdAt
    // em vez de exigir que saveVenue populate um entry inicial.
    var entries = [];
    if (v.createdByName || v.createdAt) {
      entries.push({
        _created: true,
        userName: v.createdByName || 'alguém',
        timestamp: v.createdAt || 0,
        fields: []
      });
    }
    entries = entries.concat(hist);
    if (entries.length === 0) return;
    // Mais recente primeiro.
    entries.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
    var fmtDate = function(ts) {
      if (!ts) return '';
      try {
        var d = new Date(ts);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) +
               ' · ' + window._formatHHMM(d);
      } catch (e) { return ''; }
    };
    var rows = entries.map(function(e) {
      var icon = e._created ? '📝' : '✏️';
      var verb = e._created ? 'Cadastrado por' : 'Atualizado por';
      var fieldsTxt = Array.isArray(e.fields) && e.fields.length > 0
        ? ' · <span style="color:var(--text-main);">' + _safe(e.fields.join(', ')) + '</span>'
        : '';
      return '<div style="font-size:0.76rem;color:var(--text-muted);padding:5px 0;border-top:1px solid rgba(255,255,255,0.04);line-height:1.4;">' +
        icon + ' ' + verb + ' <b style="color:var(--text-bright);">' + _safe(e.userName || 'alguém') + '</b>' +
        ' · ' + fmtDate(e.timestamp) + fieldsTxt +
      '</div>';
    }).join('');
    slot.innerHTML =
      '<details style="background:var(--bg-darker);border:1px solid var(--border-color);border-radius:12px;padding:10px 14px;">' +
        '<summary style="font-weight:700;color:var(--text-bright);font-size:0.82rem;cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;">' +
          '<span>📜 Histórico de atualizações</span>' +
          '<span style="background:rgba(99,102,241,0.2);color:#a5b4fc;font-size:0.7rem;padding:2px 8px;border-radius:999px;font-weight:600;">' + entries.length + '</span>' +
        '</summary>' +
        '<div style="margin-top:6px;">' + rows + '</div>' +
      '</details>';
  }

  // ── Edit mode (community + owner editing) ────────────────────────────────
  // Swaps the detail modal body into a form with the editable venue fields.
  // Header swaps Voltar → Cancelar and Editar/Reivindicar → Salvar. Save flow:
  //   1. Collect form values + diff against the loaded doc.
  //   2. Build an updateHistory entry with the diff field labels.
  //   3. Call VenueDB.saveVenue (transaction) — which blocks if someone else
  //      owns the venue, otherwise merges the update + refreshes updatedAt.
  //   4. Re-open the modal fresh so all slots re-hydrate.

  // Fields the community can edit. Matches what the view mode displays.
  var _EDITABLE_FIELDS = [
    { id: 'edit-v-name',         key: 'name',         label: 'Nome',          type: 'text',     required: true,  placeholder: 'Nome do local' },
    { id: 'edit-v-address',      key: 'address',      label: 'Endereço',      type: 'text',     placeholder: 'Rua, número, bairro, cidade' },
    { id: 'edit-v-hours',        key: 'hours',        label: 'Horário',       type: 'text',     placeholder: 'Ex: Seg–Sex 7h às 22h · Fim de semana 8h às 20h' },
    { id: 'edit-v-description',  key: 'description',  label: 'Descrição',     type: 'textarea', placeholder: 'Detalhes sobre o local, estrutura, regras etc.' },
    { id: 'edit-v-priceRange',   key: 'priceRange',   label: 'Faixa de preço',type: 'select',   options: [
        { val: '',    label: '—' },
        { val: '$',   label: '$ (econômico)' },
        { val: '$$',  label: '$$ (médio)' },
        { val: '$$$', label: '$$$ (premium)' }
    ]},
    { id: 'edit-v-accessPolicy', key: 'accessPolicy', label: 'Política de acesso', type: 'select', options: [
        { val: 'public',              label: '🌐 Aberto ao público' },
        { val: 'members',             label: '🔒 Só sócios' },
        { val: 'members_plus_guests', label: '🏆 Sócios + convidados de torneios' },
        { val: 'private',             label: '🔒 Privado' }
    ]}
  ];
  // Contato é nested — separado pra render.
  var _CONTACT_FIELDS = [
    { id: 'edit-v-contact-phone',     key: 'phone',     label: 'Telefone',  placeholder: '(11) 99999-9999' },
    { id: 'edit-v-contact-whatsapp',  key: 'whatsapp',  label: 'WhatsApp',  placeholder: '(11) 99999-9999' },
    { id: 'edit-v-contact-email',     key: 'email',     label: 'E-mail',    placeholder: 'contato@local.com.br' },
    { id: 'edit-v-contact-instagram', key: 'instagram', label: 'Instagram', placeholder: '@handle' }
  ];

  function _buildEditFormHTML(v) {
    var contact = v.contact || {};
    var rows = _EDITABLE_FIELDS.map(function(f) {
      var cur = v[f.key];
      if (f.type === 'text') {
        return '<label style="display:block;margin-bottom:10px;"><span style="display:block;font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;">' + f.label + '</span>' +
          '<input id="' + f.id + '" type="text" value="' + _safe(cur || '') + '" placeholder="' + _safe(f.placeholder || '') + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-family:inherit;font-size:0.88rem;">' +
        '</label>';
      }
      if (f.type === 'textarea') {
        return '<label style="display:block;margin-bottom:10px;"><span style="display:block;font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;">' + f.label + '</span>' +
          '<textarea id="' + f.id + '" rows="3" placeholder="' + _safe(f.placeholder || '') + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-family:inherit;font-size:0.88rem;resize:vertical;">' + _safe(cur || '') + '</textarea>' +
        '</label>';
      }
      if (f.type === 'select') {
        var opts = (f.options || []).map(function(o) {
          var sel = String(cur || (f.key === 'accessPolicy' ? 'public' : '')) === o.val ? ' selected' : '';
          return '<option value="' + _safe(o.val) + '"' + sel + '>' + _safe(o.label) + '</option>';
        }).join('');
        return '<label style="display:block;margin-bottom:10px;"><span style="display:block;font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;">' + f.label + '</span>' +
          '<select id="' + f.id + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-family:inherit;font-size:0.88rem;">' + opts + '</select>' +
        '</label>';
      }
      return '';
    }).join('');
    var contactRows = _CONTACT_FIELDS.map(function(f) {
      var cur = contact[f.key];
      return '<label style="display:block;margin-bottom:10px;"><span style="display:block;font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;">' + f.label + '</span>' +
        '<input id="' + f.id + '" type="text" value="' + _safe(cur || '') + '" placeholder="' + _safe(f.placeholder || '') + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-family:inherit;font-size:0.88rem;">' +
      '</label>';
    }).join('');
    return (
      '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;padding:10px 12px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:10px;line-height:1.45;">' +
        'Você está editando este local para a comunidade. Suas alterações ficam visíveis publicamente e registradas no histórico.' +
      '</div>' +
      rows +
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-color);">' +
        '<div style="font-weight:700;color:var(--text-bright);font-size:0.88rem;margin-bottom:10px;">📞 Contato</div>' +
        contactRows +
      '</div>'
    );
  }

  function _rebuildHeaderForEdit(v) {
    var hdr = document.getElementById('venue-detail-header');
    if (!hdr) return;
    hdr.innerHTML =
      '<button class="btn btn-outline btn-sm hover-lift" type="button" onclick=\'window._venuesCancelEdit("' + _safe(v.placeId) + '")\' aria-label="Cancelar" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;flex-shrink:0;">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        'Cancelar' +
      '</button>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:800;color:var(--text-bright);font-size:0.95rem;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">✏️ Editando</div>' +
        '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _safe(v.name) + '</div>' +
      '</div>' +
      '<button class="btn btn-sm" onclick=\'window._venuesSaveEdit("' + _safe(v.placeId) + '")\' style="background:#10b981;color:#fff;border:none;font-weight:700;flex-shrink:0;">💾 Salvar</button>';
  }

  window._venuesToggleEdit = async function(placeId) {
    var v = await window.VenueDB.loadVenue(placeId);
    if (!v) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) {
      if (window.showNotification) window.showNotification('Faça login para editar.', 'info');
      return;
    }
    // Stash pra save flow comparar diff sem refetch.
    window._venueEditBaseline = v;
    var body = document.getElementById('venue-detail-body');
    if (!body) return;
    body.innerHTML = _buildEditFormHTML(v);
    _rebuildHeaderForEdit(v);
  };

  window._venuesCancelEdit = function(placeId) {
    window._venueEditBaseline = null;
    // Re-render do zero — evita risco de state desatualizado se o cache da
    // venue foi atualizado por outro cliente enquanto o form estava aberto.
    if (typeof window._venuesOpenDetail === 'function') window._venuesOpenDetail(placeId);
  };

  window._venuesSaveEdit = async function(placeId) {
    var base = window._venueEditBaseline;
    if (!base) {
      // Refetch por segurança — edit baseline sumiu de algum jeito.
      base = await window.VenueDB.loadVenue(placeId);
      if (!base) return;
    }
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) return;
    var getVal = function(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var newName = getVal('edit-v-name');
    if (!newName) {
      if (window.showNotification) window.showNotification('Nome é obrigatório.', 'error');
      return;
    }
    var newContact = {
      phone:     getVal('edit-v-contact-phone'),
      whatsapp:  getVal('edit-v-contact-whatsapp'),
      email:     getVal('edit-v-contact-email'),
      instagram: getVal('edit-v-contact-instagram')
    };
    var updates = {
      name:         newName,
      address:      getVal('edit-v-address'),
      hours:        getVal('edit-v-hours'),
      description:  getVal('edit-v-description'),
      priceRange:   getVal('edit-v-priceRange'),
      accessPolicy: getVal('edit-v-accessPolicy') || 'public',
      contact:      newContact
    };
    // Diff vs base pra montar entry de histórico com rótulos legíveis.
    var changedLabels = [];
    var baseContact = base.contact || {};
    var cmp = [
      { key: 'name',         label: 'nome',              cur: updates.name,         old: base.name || '' },
      { key: 'address',      label: 'endereço',          cur: updates.address,      old: base.address || '' },
      { key: 'hours',        label: 'horário',           cur: updates.hours,        old: base.hours || '' },
      { key: 'description',  label: 'descrição',         cur: updates.description,  old: base.description || '' },
      { key: 'priceRange',   label: 'faixa de preço',    cur: updates.priceRange,   old: base.priceRange || '' },
      { key: 'accessPolicy', label: 'política de acesso',cur: updates.accessPolicy, old: base.accessPolicy || 'public' }
    ];
    cmp.forEach(function(c) { if (c.cur !== c.old) changedLabels.push(c.label); });
    var contactChanged = false;
    ['phone','whatsapp','email','instagram'].forEach(function(k) {
      if ((newContact[k] || '') !== (baseContact[k] || '')) contactChanged = true;
    });
    if (contactChanged) changedLabels.push('contato');
    if (changedLabels.length === 0) {
      if (window.showNotification) window.showNotification('Nada foi alterado.', 'info');
      return;
    }
    var entry = {
      uid: cu.uid,
      userName: cu.displayName || cu.email || 'Alguém',
      timestamp: Date.now(),
      fields: changedLabels
    };
    updates.updateHistory = (Array.isArray(base.updateHistory) ? base.updateHistory.slice() : []).concat([entry]);
    try {
      await window.VenueDB.saveVenue(placeId, updates);
      if (window.showNotification) window.showNotification('Local atualizado.', 'Obrigado por contribuir!', 'success');
      window._venueEditBaseline = null;
      if (typeof window._venuesOpenDetail === 'function') window._venuesOpenDetail(placeId);
    } catch (e) {
      window._error('Erro ao salvar venue:', e);
      var msg = String(e && e.message || e);
      if (msg.indexOf('venue-já-reivindicado') !== -1) {
        if (window.showNotification) window.showNotification('Este local já tem um dono.', 'Só o proprietário pode editar.', 'error');
      } else {
        if (window.showNotification) window.showNotification('Erro ao salvar.', msg, 'error');
      }
    }
  };

  // ── Inline "Planejar ida" overlay ────────────────────────────────────────
  // Stays on top of the venue detail modal so the user never leaves the
  // venue's context. Fixes the v0.15.92 bug where navigating to #presence
  // would sometimes render with a stale `state.venue` (Paineiras) instead of
  // the MatchBall the user had just clicked.
  var _pendingPlanState = null;
  // v1.9.87: quando != null, o overlay está EDITANDO um plano existente — os
  // horários vêm dele (pré-preenchidos) e, ao confirmar, o plano antigo é
  // cancelado (substituído). {docId, startsAt, endsAt, sports}.
  var _editingPlanData = null;

  // v1.9.87: fecha o overlay de plano limpando o estado (inclusive edição).
  window._venuesClosePlanOverlay = function() {
    _editingPlanData = null;
    _pendingPlanState = null;
    var ov = document.getElementById('venue-plan-overlay');
    if (ov) ov.remove();
  };

  // v2.8.72: memória por-local do "Planejar ida" — lembra modalidades ativas/
  // inativas e horários (chegada/saída) usados da última vez NESTE local. Chave
  // estável por placeId (ou pid sintético / nome p/ preferidos label-only).
  function _planMemKey(v) {
    if (!v) return '';
    var k = v.placeId || (typeof _prefSyntheticPid === 'function' ? _prefSyntheticPid(v) : '') || v.name || '';
    return k ? ('scoreplace_planmem_' + k) : '';
  }
  function _loadPlanMem(v) {
    try { var k = _planMemKey(v); if (!k) return null; var raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function _savePlanMem(v, active, chegada, saida) {
    try { var k = _planMemKey(v); if (!k) return; localStorage.setItem(k, JSON.stringify({ active: active || [], chegada: chegada || '', saida: saida || '', savedAt: Date.now() })); } catch (e) {}
  }
  function _planNormEq(a, b) {
    try { var n = window.PresenceDB && window.PresenceDB.normalizeSport; return n ? (n(a) === n(b)) : (a === b); } catch (e) { return a === b; }
  }
  // v2.8.74: horas de funcionamento do local pra um dia da semana (0=dom..6=sáb),
  // a partir do grid flat 7×24 (openingHours.grid). Vazio se não cadastrado.
  function _venueOpenHoursForDay(venue, dow) {
    try {
      var grid = venue && venue.openingHours && Array.isArray(venue.openingHours.grid) ? venue.openingHours.grid : null;
      if (!grid || grid.length < 168) return [];
      var hours = [];
      for (var h = 0; h < 24; h++) { if (grid[dow * 24 + h]) hours.push(h); }
      return hours;
    } catch (e) { return []; }
  }
  // v2.8.74: renderiza o gráfico hora-a-hora dentro do "Planejar ida" pro dia
  // escolhido (hoje/amanhã), estendido pras horas do local + scroll focado.
  function _renderPlanMovementChart(v, selectedDay) {
    var slot = document.getElementById('plan-movement-slot');
    if (!slot || !v || !v.placeId || !window.PresenceDB || typeof window.PresenceDB.loadForVenueDay !== 'function') return;
    var baseDate = new Date();
    if (selectedDay === 'tomorrow') baseDate.setDate(baseDate.getDate() + 1);
    var dayKey = window.PresenceDB.dayKey(baseDate);
    var dow = baseDate.getDay();
    var venuePromise = (window.VenueDB && typeof window.VenueDB.loadVenue === 'function')
      ? window.VenueDB.loadVenue(v.placeId).catch(function() { return null; })
      : Promise.resolve(null);
    Promise.all([
      window.PresenceDB.loadForVenueDay(v.placeId, dayKey).catch(function() { return []; }),
      venuePromise
    ]).then(function(res) {
      if (!document.getElementById('plan-movement-slot')) return; // overlay fechou
      var presences = res[0] || [];
      var venue = res[1] || v;
      var capacity = _calcVenueCapacity(venue);
      var cu = window.AppStore && window.AppStore.currentUser;
      var myUid = cu && cu.uid;
      var friends = (cu && Array.isArray(cu.friends)) ? cu.friends : [];
      presences = presences.filter(function(p) {
        if (!p) return false;
        if (p.visibility === 'friends') { if (myUid && p.uid === myUid) return true; return p.uid && friends.indexOf(p.uid) !== -1; }
        return true;
      });
      var openHours = _venueOpenHoursForDay(venue, dow);
      var tournaments = (window.AppStore && window.AppStore.tournaments) || [];
      var pKey = window.PresenceDB.venueKey(v.placeId, v.name || '');
      var matchT = tournaments.filter(function(t) { if (!t) return false; var tk = window.PresenceDB.venueKey(t.venuePlaceId || '', t.venue || ''); return tk && tk === pKey; });
      var scrollTo = (selectedDay === 'tomorrow')
        ? (openHours.length ? openHours[0] : 7)
        : new Date().getHours();
      _renderPreferredChart('plan-movement-slot', presences, matchT, dayKey, capacity, {
        venueName: v.name, realPid: v.placeId,
        dayLabel: (selectedDay === 'tomorrow' ? 'amanhã' : 'hoje'),
        forceHours: openHours, scrollToHour: scrollTo, alwaysShow: true
      });
    }).catch(function() {});
  }
  window._venuesRenderPlanMovement = _renderPlanMovementChart;

  function _openInlinePlanOverlay(v, sports, editData) {
    // v2.1.8: contexto de edição vem SEMPRE explícito por parâmetro — fresh
    // (Planejar ida) passa undefined → null. Evita que uma edição anterior que
    // não fechou pelo handler (ex: re-render removeu o overlay) "vaze" para um
    // plano novo e acabe sobrescrevendo o plano antigo.
    _editingPlanData = editData || null;
    _pendingPlanState = { venue: v, sports: sports };
    var _planMem = _loadPlanMem(v); // v2.8.72: memória ativa/inativa + horários
    var prev = document.getElementById('venue-plan-overlay');
    if (prev) prev.remove();
    var now = new Date();
    var fmt = window._formatHHMM;
    // v1.9.87: edição → usa os horários do plano existente como default.
    var _editStart = (_editingPlanData && _editingPlanData.startsAt) ? new Date(_editingPlanData.startsAt) : null;
    var defStart = _editStart || new Date(now.getTime() + 2 * 60 * 60 * 1000);
    var defStartStr = fmt(defStart);
    // v0.16.25: default de Saída = Chegada + 2h. Autofill do browser venceu todas
    // as contra-medidas pra manter vazio — melhor assumir um default útil que o
    // usuário pode sobrescrever. Cap em 23:30 quando ultrapassa meia-noite.
    var _plusTwoHours = function(hmStr) {
      if (!hmStr) return '';
      var parts = hmStr.split(':');
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return '';
      var newH = h + 2;
      if (newH >= 24) return '23:30';
      return String(newH).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    };
    // v1.9.87: edição → fim vem do plano existente (se não for open-ended).
    var _editEnd = (_editingPlanData && _editingPlanData.endsAt && !_editingPlanData.openEnded) ? new Date(_editingPlanData.endsAt) : null;
    var defEndStr = _editEnd ? fmt(_editEnd) : _plusTwoHours(defStartStr);
    // v2.8.72: sem edição → se há memória de horário pra este local, usa os
    // horários da última vez (chegada/saída). Edição mantém os do próprio plano.
    if (!_editingPlanData && _planMem) {
      if (_planMem.chegada) defStartStr = _planMem.chegada;
      if (_planMem.saida) defEndStr = _planMem.saida;
      else if (_planMem.chegada) defEndStr = _plusTwoHours(defStartStr);
    }
    // v1.9.87: dia default (hoje/amanhã) também vem do plano em edição.
    var _editIsTomorrow = false;
    if (_editStart) {
      var _td = new Date(); _td.setHours(0,0,0,0);
      var _sd = new Date(_editStart); _sd.setHours(0,0,0,0);
      _editIsTomorrow = _sd.getTime() > _td.getTime();
    }
    // v0.16.24: pills de modalidade SEMPRE visíveis quando há pelo menos 1 esporte
    // na interseção venue∩preferências. Com só 1 opção, a pill confirma visualmente
    // qual modalidade será registrada. Todas ativas por padrão, clique desativa.
    // v2.8.72: estado ativo/inativo por modalidade. Prioridade: (1) plano em
    // edição → modalidades do próprio plano; (2) memória por-local; (3) 1ª vez →
    // modalidades que o LOCAL oferece (∩ as exibidas); (4) fallback → todas. Se o
    // resultado deixar tudo inativo, ativa todas (não dá pra confirmar vazio).
    var _venueSet = (v && Array.isArray(v.sports)) ? v.sports : [];
    var _editSports = (_editingPlanData && Array.isArray(_editingPlanData.sports)) ? _editingPlanData.sports : null;
    var _defActive = {};
    (sports || []).forEach(function(s) {
      if (_editSports) { _defActive[s] = _editSports.some(function(es) { return _planNormEq(es, s); }); }
      else if (_planMem && Array.isArray(_planMem.active)) { _defActive[s] = _planMem.active.indexOf(s) !== -1; }
      else if (_venueSet.length) { _defActive[s] = _venueSet.indexOf(s) !== -1; }
      else { _defActive[s] = true; }
    });
    if (!(sports || []).some(function(s) { return _defActive[s]; })) {
      (sports || []).forEach(function(s) { _defActive[s] = true; });
    }
    var _pillOn = 'padding:6px 12px;border-radius:999px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:1px solid rgba(99,102,241,0.45);font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.15s;';
    var _pillOff = 'padding:6px 12px;border-radius:999px;background:var(--bg-darker);color:var(--text-muted);border:1px solid var(--border-color);font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.15s;opacity:0.55;text-decoration:line-through;';
    var sportsPills = (sports || []).map(function(s) {
      var safeS = _safe(s);
      var on = !!_defActive[s];
      return '<button type="button" class="plan-sport-pill" data-sport="' + safeS + '" data-active="' + (on ? '1' : '0') + '" ' +
             'onclick="window._venuesTogglePlanSport(this)" ' +
             'style="' + (on ? _pillOn : _pillOff) + '">' +
             safeS + '</button>';
    }).join('');
    var sportsBlock = (sports && sports.length >= 1)
      ? '<div style="margin-bottom:12px;">' +
          '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">' +
          (sports.length > 1 ? 'Modalidades (clique para ativar/desativar):' : 'Modalidade:') +
          '</div>' +
          '<div id="plan-sport-pills" style="display:flex;gap:6px;flex-wrap:wrap;">' + sportsPills + '</div>' +
        '</div>'
      : '<div id="plan-sport-pills" style="display:none;"></div>';
    // v0.16.24: contextLine não repete mais a modalidade — ela já aparece na pill acima.
    // v0.16.36: removido "· hoje" hardcoded — o seletor Hoje/Amanhã abaixo
    // comunica o dia escolhido sem conflito de informação.
    var contextLine = _safe(v.name || v.placeId);
    // v0.16.36: pills Hoje/Amanhã (excludentes) acima do horário. Permitem ao
    // usuário planejar com 1 dia de antecedência e avisar amigos. Default = Hoje.
    var _onStyle = 'padding:6px 16px;border-radius:999px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:1px solid rgba(99,102,241,0.45);font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.15s;';
    var _offStyle = 'padding:6px 16px;border-radius:999px;background:var(--bg-darker);color:var(--text-muted);border:1px solid var(--border-color);font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.15s;';
    var dayBlock =
      '<div style="margin-bottom:12px;">' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Quando:</div>' +
        '<div id="plan-day-pills" style="display:flex;gap:6px;">' +
          '<button type="button" data-day="today" data-active="' + (_editIsTomorrow ? '0' : '1') + '" onclick="window._venuesTogglePlanDay(this)" ' +
            'style="' + (_editIsTomorrow ? _offStyle : _onStyle) + '">Hoje</button>' +
          '<button type="button" data-day="tomorrow" data-active="' + (_editIsTomorrow ? '1' : '0') + '" onclick="window._venuesTogglePlanDay(this)" ' +
            'style="' + (_editIsTomorrow ? _onStyle : _offStyle) + '">Amanhã</button>' +
        '</div>' +
      '</div>';
    var uniqSuffix = Date.now() + '-' + Math.floor(Math.random() * 10000);
    var overlay = document.createElement('div');
    overlay.id = 'venue-plan-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10030;display:flex;align-items:center;justify-content:center;padding:16px;';
    // v0.16.68: campos Chegada/Saída compactos. Antes (v0.16.40) `padding:10px 12px`
    // + font-size:1rem deixava cada input ~50px de altura. Em iPhone com inputs
    // type=time iOS aplica padding interno EXTRA, o que multiplica o efeito —
    // "11:05" parece flutuando dentro de uma caixa enorme à esquerda. Agora:
    // padding:7px 8px (compacto mas clicável), font-size:0.95rem (legível, sem
    // forçar zoom em mobile), text-align:center pra valor sentar no centro
    // horizontal (melhor balanço visual). Modal padding 22→18, gap entre
    // inputs 16→12, margin-bottom do grid 18→14 — tudo proporcionalmente mais
    // enxuto pra que os campos virem ELEMENTO do modal, não DOMINAREM ele.
    overlay.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:18px;max-width:420px;width:100%;box-sizing:border-box;max-height:88vh;overflow-y:auto;">' +
        '<h3 style="margin:0 0 10px 0;color:var(--text-bright);">🗓️ Planejar ida</h3>' +
        // v0.16.68/70: nome do local em destaque maior — usuário pediu (duas
        // vezes) mais ênfase. 1.05→1.2rem, font-weight 700.
        '<p style="margin:0 0 14px 0;color:var(--text-bright);font-size:1.2rem;font-weight:700;line-height:1.25;">' + contextLine + '</p>' +
        sportsBlock +
        '<form autocomplete="off" onsubmit="return false;" style="margin:0;">' +
          dayBlock +
          // v2.8.74: gráfico hora-a-hora do local (movimento você+amigos) pro dia
          // escolhido — ajuda a decidir o horário. Hidratado no setTimeout abaixo.
          '<div id="plan-movement-slot" style="margin:2px 0 6px 0;"></div>' +
          // v0.16.70: largura FIXA dos inputs em vez de grid 1fr 1fr.
          // v0.16.71: alinhamento robusto. (1) `align-items:flex-end` no flex
          // pai garante que os inputs SEMPRE ficam na mesma linha da base
          // mesmo se um label quebrar em 2 linhas (defense-in-depth). (2)
          // `white-space:nowrap` em cada label força "Saída (opcional)" a
          // ficar numa linha só — antes quebrava em 2 porque o label tinha
          // width=108px (= input) e não cabia o texto inteiro. (3) margin
          // do container subiu pra 18px top/bottom (era 14 só bottom) — mais
          // respiro acima e abaixo, conforme pedido do usuário.
          // v0.16.71/72: o label tem que ter EXATAMENTE 2 children pro flex
          // column funcionar (texto único + input). Quando tinha "Saída " +
          // <span>(opcional)</span>, esses viravam DOIS flex items distintos
          // (anonymous text node + element) — cada um em sua linha vertical.
          // Solução: wrap o texto inteiro num único <span> com nowrap, virando
          // 1 flex item. Aí align-items:flex-end no pai mantém a base alinhada.
          '<div style="display:flex;justify-content:center;align-items:flex-end;gap:28px;margin:18px 0 18px 0;">' +
            '<label style="font-size:0.72rem;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;box-sizing:border-box;">' +
              '<span style="white-space:nowrap;">Chegada</span>' +
              '<input id="venue-plan-start" name="pstart-' + uniqSuffix + '" type="time" autocomplete="off" value="' + defStartStr + '" style="display:block;width:108px;box-sizing:border-box;margin-top:6px;padding:7px 6px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.95rem;text-align:center;">' +
            '</label>' +
            '<label style="font-size:0.72rem;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;box-sizing:border-box;">' +
              '<span style="white-space:nowrap;">Saída <span style="font-weight:400;opacity:0.75;">(opcional)</span></span>' +
              '<input id="venue-plan-end" name="pend-' + uniqSuffix + '" type="time" autocomplete="off" value="' + defEndStr + '" style="display:block;width:108px;box-sizing:border-box;margin-top:6px;padding:7px 6px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.95rem;text-align:center;">' +
            '</label>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button type="button" class="btn btn-outline" onclick="window._venuesClosePlanOverlay()">Cancelar</button>' +
            '<button type="button" class="btn btn-primary" onclick="window._venuesConfirmInlinePlan()">Confirmar</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    // v0.16.25: forçar Chegada + defStartStr e Saída = Chegada+2h pós-insertion,
    // sobrepondo qualquer autofill do browser. Listener no Chegada recalcula
    // Saída automaticamente — mas só se o usuário ainda não editou Saída
    // manualmente (tracking via _autoEndValue que guarda o último valor auto).
    setTimeout(function() {
      var startEl = document.getElementById('venue-plan-start');
      var endEl = document.getElementById('venue-plan-end');
      if (startEl) {
        startEl.value = defStartStr;
        // v0.16.37: dataset.autoValue permite ao toggle Hoje/Amanhã saber se
        // Chegada ainda é o default (pode reescrever) ou foi editada manualmente
        // (deve preservar). Closure local não basta porque o toggle é window-scoped.
        startEl.dataset.autoValue = defStartStr;
      }
      if (endEl) {
        endEl.value = defEndStr;
        endEl.dataset.autoValue = defEndStr;
      }
      if (startEl && endEl) {
        startEl.addEventListener('input', function() {
          // v0.16.37: usuário editou Chegada manualmente — para de auto-tracker
          // pra que toggle Hoje/Amanhã não sobrescreva sua escolha.
          if (startEl.value !== startEl.dataset.autoValue) {
            startEl.dataset.autoValue = '';
          }
          var suggested = _plusTwoHours(startEl.value);
          if (!suggested) return;
          // só atualiza Saída se o valor atual = último auto-set (= usuário
          // não editou manualmente). Isso preserva escolhas manuais válidas.
          if (endEl.value === endEl.dataset.autoValue) {
            endEl.value = suggested;
            endEl.dataset.autoValue = suggested;
          }
        });
        // Se o usuário editar Saída diretamente, invalida o auto-tracking
        // pra que mudanças subsequentes em Chegada não sobrescrevam.
        endEl.addEventListener('input', function() {
          if (endEl.value !== endEl.dataset.autoValue) endEl.dataset.autoValue = '';
        });
      }
      // v2.8.74: hidrata o gráfico hora-a-hora do local pro dia inicial.
      try { _renderPlanMovementChart(v, _editIsTomorrow ? 'tomorrow' : 'today'); } catch (e) {}
    }, 0);
  }

  // Overlay de confirmação pós-check-in / pós-plano. Dá ao usuário mais do que
  // um toast: mostra o que foi registrado e um botão prominente pra cancelar
  // imediatamente caso tenha sido sem querer.
  function _showPresenceConfirmation(opts) {
    opts = opts || {};
    var prev = document.getElementById('venue-presence-confirm-overlay');
    if (prev) prev.remove();
    var isPlan = opts.type === 'planned';
    var title = isPlan ? '🗓️ Ida planejada' : '✅ Você está aqui agora';
    var subtitle = isPlan
      ? 'Seus amigos já podem ver que você pretende ir.'
      : 'Seus amigos já podem ver que você está no local.';
    var sportsLine = (Array.isArray(opts.sports) && opts.sports.length > 0)
      ? opts.sports.join(' · ')
      : '';
    var timeLine = opts.hmLabel || '';
    // v0.16.26: botão "Cancelar" removido daqui — usuário pediu explicitamente
    // ("o cancelar não deve ficar aqui"). Cancelamento é exclusivo do card
    // focado da seção ⭐ Locais preferidos (swap inline pra "❌ Cancelar
    // plano/presença" via `_hydratePreferredPresenceSlots`) OU dos botões no
    // slot `#venue-presence-btns-slot` da ficha do venue. Esse overlay é só
    // uma confirmação dispensável — OK pra fechar e ver o gráfico atrás.
    var overlay = document.createElement('div');
    overlay.id = 'venue-presence-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10035;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:22px;max-width:420px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.4);">' +
        '<h3 style="margin:0 0 10px 0;color:var(--text-bright);font-size:1.1rem;">' + title + '</h3>' +
        '<div style="color:var(--text-bright);font-weight:600;margin-bottom:4px;">' + _safe(opts.venueName || '') + '</div>' +
        (sportsLine ? '<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:4px;">' + _safe(sportsLine) + '</div>' : '') +
        (timeLine ? '<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:10px;">' + _safe(timeLine) + '</div>' : '') +
        '<p style="color:var(--text-muted);font-size:0.82rem;margin:0 0 16px 0;">' + subtitle + '</p>' +
        '<div style="display:flex;justify-content:flex-end;">' +
          '<button class="btn btn-primary btn-sm" onclick="document.getElementById(\'venue-presence-confirm-overlay\').remove()" style="padding:8px 24px;">OK</button>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // v0.16.69: expose o overlay globalmente pra que outros entry points
  // (presence.js _presencePlanDialog) deleguem aqui em vez de manter UI
  // duplicada. Single source of truth — qualquer melhoria no overlay (pills
  // de modalidade, pills Hoje/Amanhã, fix de tamanho dos campos) aparece
  // automaticamente em ambos os caminhos do app.
  window._openInlinePlanOverlay = _openInlinePlanOverlay;

  // Toggle de pill de modalidade no overlay de plano.
  window._venuesTogglePlanSport = function(btn) {
    if (!btn) return;
    var active = btn.getAttribute('data-active') === '1';
    if (active) {
      btn.setAttribute('data-active', '0');
      btn.style.background = 'var(--bg-darker)';
      btn.style.color = 'var(--text-muted)';
      btn.style.border = '1px solid var(--border-color)';
      btn.style.opacity = '0.55';
      btn.style.textDecoration = 'line-through';
    } else {
      btn.setAttribute('data-active', '1');
      btn.style.background = 'linear-gradient(135deg,#6366f1,#4f46e5)';
      btn.style.color = '#fff';
      btn.style.border = '1px solid rgba(99,102,241,0.45)';
      btn.style.opacity = '1';
      btn.style.textDecoration = 'none';
    }
  };

  // v0.16.36: toggle excludente Hoje/Amanhã no modal Planejar ida.
  // Permite planejar com 1 dia de antecedência. Comportamento radio: ativar
  // um desativa o outro. O dia escolhido é lido em _venuesConfirmInlinePlan
  // pra construir startsAt/endsAt no dia certo.
  // v0.16.37: ao clicar em Amanhã, sugere Chegada=07:00 (se ainda for o auto-value).
  // Hoje volta a sugerir now+2h. Saída recalcula via tracking de autoValue.
  window._venuesTogglePlanDay = function(btn) {
    if (!btn) return;
    var pills = document.querySelectorAll('#plan-day-pills [data-day]');
    pills.forEach(function(el) {
      el.setAttribute('data-active', '0');
      el.style.background = 'var(--bg-darker)';
      el.style.color = 'var(--text-muted)';
      el.style.border = '1px solid var(--border-color)';
    });
    btn.setAttribute('data-active', '1');
    btn.style.background = 'linear-gradient(135deg,#6366f1,#4f46e5)';
    btn.style.color = '#fff';
    btn.style.border = '1px solid rgba(99,102,241,0.45)';

    // v0.16.37: ajustar Chegada baseado no dia escolhido (preserva edição manual)
    var day = btn.getAttribute('data-day');
    // v2.8.74: re-renderiza o gráfico de movimento pro dia escolhido.
    if (_pendingPlanState && _pendingPlanState.venue) {
      try { _renderPlanMovementChart(_pendingPlanState.venue, day === 'tomorrow' ? 'tomorrow' : 'today'); } catch (e) {}
    }
    var startEl = document.getElementById('venue-plan-start');
    var endEl = document.getElementById('venue-plan-end');
    if (!startEl || !endEl) return;
    var stillAuto = startEl.dataset.autoValue && startEl.value === startEl.dataset.autoValue;
    if (!stillAuto) return; // usuário editou manualmente — não mexer
    var newStart;
    if (day === 'tomorrow') {
      newStart = '07:00';
    } else {
      var n = new Date(Date.now() + 2 * 60 * 60 * 1000);
      newStart = window._formatHHMM(n);
    }
    startEl.value = newStart;
    startEl.dataset.autoValue = newStart;
    // Recalcular Saída se ainda for o auto-value (inline +2h, helper é closure-local)
    if (endEl.dataset.autoValue && endEl.value === endEl.dataset.autoValue) {
      var parts = newStart.split(':');
      var nh = parseInt(parts[0], 10) + 2;
      var newEnd = (nh >= 24) ? '23:30' : String(nh).padStart(2, '0') + ':' + parts[1];
      endEl.value = newEnd;
      endEl.dataset.autoValue = newEnd;
    }
  };

  window._venuesConfirmInlinePlan = async function() {
    if (!_pendingPlanState) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !window.PresenceDB) return;
    if (cu.presenceVisibility === 'off') {
      if (window.showNotification) window.showNotification('Presença desligada no seu perfil.', 'info');
      return;
    }
    var v = _pendingPlanState.venue;
    // Lê modalidades ativas dos pills (se existirem); fallback para sports originais.
    var sports;
    var pillEls = document.querySelectorAll('#plan-sport-pills [data-sport]');
    if (pillEls && pillEls.length > 0) {
      sports = [];
      pillEls.forEach(function(el) {
        if (el.getAttribute('data-active') === '1') {
          sports.push(el.getAttribute('data-sport'));
        }
      });
      if (sports.length === 0) {
        if (window.showNotification) window.showNotification('Selecione ao menos uma modalidade.', '', 'warning');
        return;
      }
    } else {
      sports = _pendingPlanState.sports;
    }
    var startStr = (document.getElementById('venue-plan-start') || {}).value;
    var endStr = (document.getElementById('venue-plan-end') || {}).value;
    if (!startStr) return;
    // v2.8.72: memoriza por-local as modalidades ativas + horários desta vez,
    // pra restaurar no próximo "Planejar ida" neste mesmo local.
    try { _savePlanMem(v, sports, startStr, endStr); } catch (e) {}
    // v0.16.36: lê o dia escolhido nas pills (Hoje/Amanhã). Default = hoje.
    var selectedDay = 'today';
    var dayBtn = document.querySelector('#plan-day-pills [data-day][data-active="1"]');
    if (dayBtn) selectedDay = dayBtn.getAttribute('data-day') || 'today';
    var baseDate = new Date();
    if (selectedDay === 'tomorrow') baseDate.setDate(baseDate.getDate() + 1);
    var build = function(hm) {
      var parts = hm.split(':').map(Number);
      var d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), parts[0] || 0, parts[1] || 0, 0, 0);
      return d.getTime();
    };
    var startsAt = build(startStr);
    var endsAt, openEnded = false;
    if (endStr) {
      endsAt = build(endStr);
      if (endsAt <= startsAt) {
        if (window.showNotification) window.showNotification('Horário final deve ser maior que o inicial.', 'error');
        return;
      }
    } else {
      openEnded = true;
      endsAt = startsAt + 12 * 60 * 60 * 1000;
    }
    var normSports = sports.map(window.PresenceDB.normalizeSport).filter(Boolean);
    if (normSports.length === 0) {
      if (window.showNotification) window.showNotification('Modalidade não identificada.', 'error');
      return;
    }
    var payload = {
      uid: cu.uid,
      email_lower: (cu.email || '').toLowerCase(),
      displayName: cu.displayName || '',
      photoURL: cu.photoURL || '',
      placeId: v.placeId,
      venueName: v.name || '',
      venueLat: v.lat || null,
      venueLon: v.lon || null,
      sports: normSports,
      type: 'planned',
      startsAt: startsAt,
      endsAt: endsAt,
      openEnded: openEnded,
      dayKey: window.PresenceDB.dayKey(new Date(startsAt)),
      visibility: cu.presenceVisibility || 'friends',
      cancelled: false,
      createdAt: Date.now()
    };
    try {
      var docId;
      if (_editingPlanData && _editingPlanData.docId) {
        // v2.1.8: EDITANDO um plano existente — atualiza o doc direto. Antes
        // chamava savePresence(payload), mas o dedup de savePresence devolvia
        // o doc antigo (mesma venue/horário sobreposto) SEM gravar as
        // alterações → a edição se perdia. updatePresence grava de verdade.
        docId = _editingPlanData.docId;
        var _ok = await window.PresenceDB.updatePresence(docId, payload);
        if (!_ok) {
          // Fallback raro: se o update falhar, cria novo e cancela o antigo.
          docId = await window.PresenceDB.savePresence(payload);
          if (docId && String(docId) !== String(_editingPlanData.docId)) {
            try { await window.PresenceDB.cancelPresence(_editingPlanData.docId); } catch (e) {}
          }
        }
      } else {
        docId = await window.PresenceDB.savePresence(payload);
      }
      _editingPlanData = null;
      var ov = document.getElementById('venue-plan-overlay');
      if (ov) ov.remove();
      _pendingPlanState = null;
      var d1 = new Date(startsAt);
      var d2 = new Date(endsAt);
      var hm = window._formatHHMM;
      var dayLabel = (selectedDay === 'tomorrow') ? 'amanhã' : 'hoje';
      var timeLabel = dayLabel + ' · ' + hm(d1) + (openEnded ? '' : ' – ' + hm(d2));
      // v2.8.76: planejar uma ida = o local vira preferido automaticamente
      // (intenção de frequentar). Silencioso + nota no próprio toast do plano.
      var _newlyPreferred = false;
      try { _newlyPreferred = _autoAddPreferredSilent(v); } catch (e) {}
      // v0.16.26: toast leve em vez de overlay bloqueante. O foco visual fica
      // no card colapsado + gráfico de barras logo abaixo (via focusedPreferred
      // abaixo), com o botão "Cancelar plano" já inline no próprio card.
      if (window.showNotification) {
        window.showNotification('🗓️ Ida planejada', timeLabel + (_newlyPreferred ? ' · ⭐ salvo nos preferidos' : ''), 'success');
      }
      // Re-hidrata o bloco "Movimento no local" pra refletir a nova presença
      // sem precisar fechar e reabrir a modal do venue.
      _buildMovimentoHtml(v).then(function(html) {
        var slot = document.getElementById('venue-movimento-slot');
        if (slot && html) slot.innerHTML = html;
      });
      // Re-hidrata botões (swap pra "❌ Cancelar plano") + widget da dashboard
      _hydratePresenceButtonsForVenue(v);
      // v0.16.20: se o venue é um preferido, ativa modo focado + gráfico.
      // v0.16.26: passa o venue completo pra permitir match por nome/coords
      // (preferreds label-only não casavam via placeId real do Google).
      var prefObjPlan = _findPreferredByPid(v);
      if (prefObjPlan) {
        state.focusedPreferred = {
          placeId: v.placeId,
          docId: docId,
          type: 'planned',
          startsAt: startsAt,
          endsAt: endsAt,
          sports: normSports,
          venueName: v.name || '',
          prefObj: prefObjPlan
        };
        renderResults();
      } else {
        _hydratePreferredPresenceSlots();
        // v0.16.28: novo plano pode ser de um preferido visível na lista —
        // re-hidrata movimento pra refletir a presença planejada.
        _hydrateAllPreferredMovement();
      }
      if (typeof window._hydrateMyActivePresenceWidget === 'function') {
        window._hydrateMyActivePresenceWidget();
      }
      // Notifica amigos — compartilha o helper com o quick-checkin pra manter
      // throttle consistente.
      try { _notifyFriendsOfPlan(v, payload); } catch (e) { window._warn('Plan notify failed:', e); }
    } catch (e) {
      window._error('Save plan failed:', e);
      if (window.showNotification) window.showNotification('Erro ao planejar ida.', 'error');
    }
  };

  // Notificação pra amigos — mesmo shape que presence.js usa.
  function _notifyFriendsOfPlan(v, payload) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) return;
    // v0.17.5: dedup (ver _notifyFriendsOfQuickCheckin)
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
    // v0.16.36: detecta se o plano é pra hoje ou amanhã pra rotular a notificação
    // corretamente. Compara dia/mês/ano (não basta diff em ms — meia-noite truncada).
    var nowD = new Date();
    var sameDay = (d.getFullYear() === nowD.getFullYear() &&
                   d.getMonth() === nowD.getMonth() &&
                   d.getDate() === nowD.getDate());
    var dayLabel = sameDay ? 'hoje' : 'amanhã';
    var msg = (cu.displayName || 'Um amigo') + ' vai jogar ' + sportLabel +
      ' em ' + (payload.venueName || 'um local') + ' às ' + hhmm + ' ' + dayLabel + '. Quer ir junto?';
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
      }).catch(function(e) { window._warn('Plan notify failed:', e); });
    });
  }

  // Form flutuante: estrelas (obrigatório) + texto opcional. Se houver texto
  // o review é sempre identificado; se só estrelas, pode ser anônimo.
  window._venuesOpenReviewDialog = async function(placeId) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) return;
    // Pre-load review existente deste usuário para permitir editar.
    var existing = null;
    try {
      var ex = await window.VenueDB.loadReviews(placeId, 100);
      for (var i = 0; i < ex.length; i++) if (ex[i].uid === cu.uid) { existing = ex[i]; break; }
    } catch (e) {}
    window._venuesReviewState = {
      placeId: placeId,
      rating: existing ? (existing.rating || 0) : 0,
      text: existing ? (existing.text || '') : '',
      anonymous: existing ? !!existing.anonymous : false
    };
    var prev = document.getElementById('venues-review-overlay');
    if (prev) prev.remove();
    var overlay = document.createElement('div');
    overlay.id = 'venues-review-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10020;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:18px;max-width:440px;width:100%;">' +
        '<h3 style="margin:0 0 10px 0;color:var(--text-bright);">✍️ Deixar avaliação</h3>' +
        '<div id="venues-review-stars" style="margin-bottom:10px;font-size:1.6rem;text-align:center;"></div>' +
        '<textarea id="venues-review-text" rows="3" placeholder="Escreva sua opinião (opcional). Com texto, seu nome aparece." style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);resize:vertical;font-family:inherit;font-size:0.9rem;margin-bottom:10px;">' + _safe(window._venuesReviewState.text) + '</textarea>' +
        '<label style="display:flex;align-items:center;gap:6px;margin-bottom:14px;font-size:0.78rem;color:var(--text-muted);cursor:pointer;">' +
          '<input type="checkbox" id="venues-review-anon"' + (window._venuesReviewState.anonymous ? ' checked' : '') + '>' +
          '<span>Avaliação anônima (só se estrelas, sem texto)</span>' +
        '</label>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'venues-review-overlay\').remove()">Cancelar</button>' +
          '<button class="btn btn-primary btn-sm" onclick="window._spinButton(this, \'Salvando...\'); window._venuesSubmitReview()">Publicar</button>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    _renderReviewStars();
  };

  function _renderReviewStars() {
    var el = document.getElementById('venues-review-stars');
    if (!el) return;
    el.innerHTML = _starsHtml(window._venuesReviewState.rating || 0, '1.6rem', true);
  }

  window._venuesPickStars = function(n) {
    if (!window._venuesReviewState) return;
    window._venuesReviewState.rating = n;
    _renderReviewStars();
  };

  window._venuesSubmitReview = async function() {
    var st = window._venuesReviewState;
    if (!st) return;
    var rating = st.rating || 0;
    if (rating < 1 || rating > 5) {
      if (window.showNotification) window.showNotification('Escolha de 1 a 5 estrelas.', '', 'error');
      return;
    }
    var textEl = document.getElementById('venues-review-text');
    var anonEl = document.getElementById('venues-review-anon');
    var text = textEl ? textEl.value.trim() : '';
    var anonymous = !!(anonEl && anonEl.checked) && !text;
    try {
      await window.VenueDB.saveReview(st.placeId, rating, text, anonymous);
      var ov = document.getElementById('venues-review-overlay');
      if (ov) ov.remove();
      if (window.showNotification) window.showNotification('Avaliação publicada.', '', 'success');
      // Re-hidrata o bloco de reviews na modal de detalhe, se aberta.
      var venueDoc = await window.VenueDB.loadVenue(st.placeId);
      if (venueDoc) _hydrateReviews(venueDoc);
    } catch (e) {
      window._error(e);
      if (window.showNotification) window.showNotification('Erro ao publicar avaliação.', String(e.message || e), 'error');
    }
  };

  window._venuesDeleteReview = async function(placeId, reviewId) {
    if (!placeId || !reviewId) return;
    if (typeof window.showConfirmDialog !== 'function') return;
    window.showConfirmDialog('Apagar sua avaliação?', 'Esta ação não pode ser desfeita.', async function() {
      var ok = await window.VenueDB.deleteReview(placeId, reviewId);
      if (ok) {
        if (window.showNotification) window.showNotification('Avaliação apagada.', '', 'info');
        var v = await window.VenueDB.loadVenue(placeId);
        if (v) _hydrateReviews(v);
      }
    }, null, { confirmText: 'Apagar', cancelText: 'Cancelar', type: 'danger' });
  };

  // Bridge to tournament creation — stashes venue so create-tournament can read.
  window._venuesStartTournamentHere = function(prefillJson) {
    try { sessionStorage.setItem('_venuePrefill', prefillJson); } catch (e) {}
    if (typeof window._venuesCloseDetail === 'function') window._venuesCloseDetail();
    if (typeof openModal === 'function') openModal('modal-quick-create');
  };

  // Share venue — tenta navigator.share (mobile native dialog: WhatsApp,
  // Instagram, SMS, etc); fallback pra clipboard com toast de confirmação.
  // Link é canônico do scoreplace (#venues/<placeId>) pra que destinatário
  // caia direto na modal da venue com movimento + contatos — viral growth.
  window._venuesShare = async function(placeId) {
    var v = await window.VenueDB.loadVenue(placeId);
    if (!v) return;
    var base = window.SCOREPLACE_URL || 'https://scoreplace.app';
    var url = base + '/#venues/' + encodeURIComponent(placeId);
    var title = '🏢 ' + (v.name || 'Local no scoreplace');
    var sportsLine = (Array.isArray(v.sports) && v.sports.length > 0)
      ? v.sports.slice(0, 3).join(' · ') + '\n'
      : '';
    var addrLine = v.address ? v.address + '\n' : '';
    var text = title + '\n' + sportsLine + addrLine + '\n👉 ' + url;
    // Web Share API — mobile nativo. Desktop (Chrome/Edge) também suporta
    // em alguns casos. Em browsers sem suporte, cai no clipboard.
    if (navigator.share) {
      try {
        await navigator.share({ title: title, text: text, url: url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // user cancelou
        // Qualquer outro erro: cai no fallback
      }
    }
    // Fallback: copia pro clipboard + toast
    try {
      await navigator.clipboard.writeText(text);
      if (window.showNotification) window.showNotification('Link copiado!', 'Cole no WhatsApp ou em qualquer rede.', 'success');
    } catch (e) {
      // Último fallback: window.open mailto
      try { window.open('mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(text)); } catch (_) {}
    }
  };

  // ── Quick check-in from the venue detail modal ───────────────────────────
  // Closes the discovery→action loop in a single tap: user opens modal, sees
  // venue info, taps "Estou aqui". Same payload shape as presence.js writes,
  // just assembled inline so we don't need to navigate to #presence first.
  // Picks sport intelligently: venue's primary sport → user's preferred
  // sport → falls back to showing a picker if multiple options exist.
  function _pickSportForVenue(v) {
    var cu = window.AppStore && window.AppStore.currentUser;
    var venueSports = Array.isArray(v.sports) ? v.sports.slice() : [];
    if (venueSports.length === 1) return { sports: venueSports };
    if (venueSports.length === 0) {
      // Sem modalidades declaradas — usa a preferência do usuário se houver.
      var pref = (cu && Array.isArray(cu.preferredSports) && cu.preferredSports.length > 0)
        ? [cu.preferredSports[0]]
        : [];
      return { sports: pref };
    }
    // 2+ modalidades no venue: intersecta com preferências pra reduzir picker.
    if (cu && Array.isArray(cu.preferredSports) && cu.preferredSports.length > 0) {
      var inter = venueSports.filter(function(s) { return cu.preferredSports.indexOf(s) !== -1; });
      if (inter.length === 1) return { sports: inter };
      if (inter.length > 1) return { needsPicker: true, options: inter };
    }
    return { needsPicker: true, options: venueSports };
  }

  // v0.16.41: _pickSportOverlay removido por completo — todos os call sites
  // (check-in e plano) agora abrem direto o overlay multi-pill correspondente
  // (_openInlineCheckInOverlay verde / _openInlinePlanOverlay índigo).

  // ── v0.16.40: Inline "Estou aqui agora" overlay (multi-modalidade) ──────
  // Substitui o picker single-choice "Qual modalidade agora?". Pills toggleáveis
  // (mesmo padrão do _openInlinePlanOverlay) — todas pré-selecionadas, usuário
  // pode desativar as que não está jogando agora. Sem campos de horário porque
  // "agora" é implícito (startsAt = now, endsAt = now + CHECKIN_WINDOW_MS).
  var _pendingCheckInState = null;

  function _openInlineCheckInOverlay(v, sports) {
    _pendingCheckInState = { venue: v, sports: sports };
    var prev = document.getElementById('venue-checkin-overlay');
    if (prev) prev.remove();
    var nowDate = new Date();
    var nowLabel = window._formatHHMM(nowDate);
    var sportsPills = (sports || []).map(function(s) {
      var safeS = _safe(s);
      return '<button type="button" class="checkin-sport-pill" data-sport="' + safeS + '" data-active="1" ' +
             'onclick="window._venuesToggleCheckInSport(this)" ' +
             'style="padding:8px 14px;border-radius:999px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:1px solid rgba(16,185,129,0.45);font-size:0.85rem;font-weight:600;cursor:pointer;transition:all 0.15s;">' +
             safeS + '</button>';
    }).join('');
    var overlay = document.createElement('div');
    overlay.id = 'venue-checkin-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10030;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:22px;max-width:420px;width:100%;">' +
        '<h3 style="margin:0 0 8px 0;color:var(--text-bright);">📍 Estou aqui agora</h3>' +
        '<p style="margin:0 0 16px 0;color:var(--text-muted);font-size:0.85rem;">' + _safe(v.name || v.placeId) + ' · ' + nowLabel + '</p>' +
        '<div style="margin-bottom:18px;">' +
          '<div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:8px;">' +
          (sports.length > 1 ? 'Modalidades (clique para ativar/desativar):' : 'Modalidade:') +
          '</div>' +
          '<div id="checkin-sport-pills" style="display:flex;gap:8px;flex-wrap:wrap;">' + sportsPills + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button type="button" class="btn btn-outline" onclick="document.getElementById(\'venue-checkin-overlay\').remove()">Cancelar</button>' +
          '<button type="button" class="btn btn-primary" onclick="window._venuesConfirmInlineCheckIn()" style="background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;">Confirmar</button>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // Toggle de pill de modalidade no overlay de check-in (verde, mesma UX do plano).
  window._venuesToggleCheckInSport = function(btn) {
    if (!btn) return;
    var active = btn.getAttribute('data-active') === '1';
    if (active) {
      btn.setAttribute('data-active', '0');
      btn.style.background = 'var(--bg-darker)';
      btn.style.color = 'var(--text-muted)';
      btn.style.border = '1px solid var(--border-color)';
      btn.style.opacity = '0.55';
      btn.style.textDecoration = 'line-through';
    } else {
      btn.setAttribute('data-active', '1');
      btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
      btn.style.color = '#fff';
      btn.style.border = '1px solid rgba(16,185,129,0.45)';
      btn.style.opacity = '1';
      btn.style.textDecoration = 'none';
    }
  };

  // Confirma o check-in com as pills ativas. Bloqueia se nenhuma selecionada.
  window._venuesConfirmInlineCheckIn = function() {
    if (!_pendingCheckInState) return;
    var pills = document.querySelectorAll('#checkin-sport-pills [data-sport][data-active="1"]');
    if (pills.length === 0) {
      if (window.showNotification) window.showNotification('Selecione ao menos uma modalidade.', '', 'warning');
      return;
    }
    var sports = Array.prototype.slice.call(pills).map(function(p) { return p.getAttribute('data-sport'); });
    var v = _pendingCheckInState.venue;
    var ov = document.getElementById('venue-checkin-overlay');
    if (ov) ov.remove();
    _pendingCheckInState = null;
    _doQuickCheckIn(v, sports);
  };

  async function _doQuickCheckIn(v, sports) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !window.PresenceDB) return;
    if (cu.presenceVisibility === 'off') {
      if (window.showNotification) window.showNotification('Presença desligada no seu perfil.', 'info');
      return;
    }
    var normSports = sports.map(window.PresenceDB.normalizeSport).filter(Boolean);
    if (normSports.length === 0) {
      if (window.showNotification) window.showNotification('Modalidade não identificada.', 'error');
      return;
    }
    var now = Date.now();
    var payload = {
      uid: cu.uid,
      email_lower: (cu.email || '').toLowerCase(),
      displayName: cu.displayName || '',
      photoURL: cu.photoURL || '',
      placeId: v.placeId,
      venueName: v.name || '',
      venueLat: v.lat || null,
      venueLon: v.lon || null,
      sports: normSports,
      type: 'checkin',
      startsAt: now,
      endsAt: now + window.PresenceDB.CHECKIN_WINDOW_MS,
      dayKey: window.PresenceDB.dayKey(new Date(now)),
      visibility: cu.presenceVisibility || 'friends',
      cancelled: false,
      createdAt: now
    };
    try {
      var docId = await window.PresenceDB.savePresence(payload);
      var nowDate = new Date();
      var timeLabel = 'agora · ' + window._formatHHMM(nowDate);
      // v0.16.26: toast leve em vez de overlay bloqueante. Foco visual vai
      // pro card colapsado + gráfico de barras (focusedPreferred). Botão
      // "Cancelar presença" fica inline no próprio card.
      if (window.showNotification) {
        window.showNotification('📍 Você está aqui', timeLabel, 'success');
      }
      // Notifica amigos com "Fulano chegou em X pra jogar". Throttled pra
      // não spammar caso o usuário faça múltiplos check-ins no mesmo dia.
      _notifyFriendsOfQuickCheckin(v, payload);
      // Re-hidrata o bloco "Movimento no local" pra refletir a nova presença
      // sem o usuário precisar fechar e reabrir a modal.
      _buildMovimentoHtml(v).then(function(html) {
        var slot = document.getElementById('venue-movimento-slot');
        if (slot && html) slot.innerHTML = html;
      });
      // Re-hidrata botões (swap pra "❌ Cancelar presença") + widget da dashboard
      _hydratePresenceButtonsForVenue(v);
      // v0.16.20: se o venue é um preferido, ativa o modo focado e re-renderiza
      // a seção Preferidos pra colapsar demais cards + mostrar o gráfico.
      // v0.16.26: passa o venue completo (placeId real + nome + coords) pra
      // casar com preferreds label-only também.
      var prefObj = _findPreferredByPid(v);
      if (prefObj) {
        state.focusedPreferred = {
          placeId: v.placeId,
          docId: docId,
          type: 'checkin',
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          sports: normSports,
          venueName: v.name || '',
          prefObj: prefObj
        };
        renderResults();
      } else {
        // Venue não-preferido — atualiza só os slots como antes.
        _hydratePreferredPresenceSlots();
        // v0.16.28: check-in sempre re-hidrata movimento — pode haver outro
        // preferido na lista cujo movimento mudou (ex: usuário check-in em
        // venue vizinho notifica amigos que aparecem como "Agora" em todos).
        _hydrateAllPreferredMovement();
      }
      if (typeof window._hydrateMyActivePresenceWidget === 'function') {
        window._hydrateMyActivePresenceWidget();
      }
    } catch (e) {
      window._error('Quick check-in failed:', e);
      if (window.showNotification) window.showNotification('Erro ao registrar presença.', 'error');
    }
  }

  // Friend notification para o quick check-in inline na modal do venue.
  // Mesmo throttle + mesma semântica que presence.js — um único lugar na
  // UI geraria notificação duplicada se o usuário fizesse checkin via dois
  // caminhos, então a chave de throttle é compartilhada entre os dois.
  function _notifyFriendsOfQuickCheckin(v, payload) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) return;
    // v0.17.5: dedup pra evitar "várias notificações em cada evento" quando
    // cu.friends tem mesmo amigo como email + uid (legado pré-migração).
    var friends = (typeof window._dedupFriendsForNotify === 'function')
      ? window._dedupFriendsForNotify(cu.friends, cu.uid)
      : (Array.isArray(cu.friends) ? cu.friends : []);
    if (friends.length === 0) return;
    if (typeof window._sendUserNotification !== 'function') return;
    if (cu.presenceVisibility === 'off') return;

    // v0.16.23: payload tem sports[] (array), não sport (singular). Usar join
    // garante que a notificação mostra as modalidades reais em vez de
    // "undefined" / "agora". Throttle key usa sports.sort().join pra que
    // check-in com mesmos esportes mesmo venue mesmo dia não duplique.
    var sportsArr = Array.isArray(payload.sports) ? payload.sports.slice().sort() : [];
    var sportsLabel = sportsArr.length > 0 ? sportsArr.join('/') : 'algo';
    var throttleKey = 'scoreplace_checkin_notified_' + v.placeId + '_' +
                      sportsArr.join(',') + '_' + payload.dayKey;
    try {
      if (localStorage.getItem(throttleKey)) return;
      localStorage.setItem(throttleKey, '1');
    } catch (e) {}

    var msg = (cu.displayName || 'Um amigo') + ' chegou em ' +
              (v.name || 'um local') + ' pra jogar ' +
              sportsLabel + '. Vem junto!';

    friends.forEach(function(friendUid) {
      if (!friendUid) return;
      window._sendUserNotification(friendUid, {
        type: 'presence_checkin',
        message: msg,
        level: 'all',
        venueName: v.name || '',
        placeId: v.placeId,
        sports: payload.sports,
        startsAt: payload.startsAt
      }).catch(function(e) { window._warn('Quick checkin notify failed:', e); });
    });
  }

  window._venuesQuickCheckIn = async function(placeId) {
    var v = await window.VenueDB.loadVenue(placeId);
    if (!v) return;
    // v0.16.40: tela única — multi-pills sempre que há 2+ opções; direto quando só 1.
    var resolved = _pickSportForVenue(v);
    var sports = resolved.needsPicker
      ? (resolved.options || [])
      : (resolved.sports || []);
    if (sports.length === 0) {
      // Sem modalidade nem no venue nem no perfil — manda pro fluxo completo
      // em #presence onde o picker está montado com todas as opções.
      try {
        sessionStorage.setItem('_presencePrefill', JSON.stringify({
          placeId: v.placeId, venueName: v.name, lat: v.lat, lon: v.lon
        }));
      } catch(e) {}
      window.location.hash = '#presence';
      return;
    }
    if (sports.length === 1) {
      _doQuickCheckIn(v, sports);
      return;
    }
    _openInlineCheckInOverlay(v, sports);
  };

  // Entrada alternativa usada no card de "Locais preferidos": quando o
  // usuário tem preferidos cadastrados, skippa o picker de modalidade e
  // registra presença com TODAS as modalidades da interseção (preferidos
  // ∩ modalidades do venue). Alinha com o comportamento do auto check-in
  // por GPS (presence-geo.js), que também assume que um local preferido
  // com esportes preferidos não precisa de perguntas.
  // Resolve placeId (real ou sintético "pref_xxx") para um objeto venue-shape.
  // Primeiro tenta o Firestore (quando é placeId real e há doc cadastrado);
  // se não existe, constrói a partir de `cu.preferredLocations`. Preserva a
  // regra alpha: presença só precisa de placeId + name + lat/lng — ficha de
  // venue é opcional.
  async function _resolvePreferredVenue(placeId) {
    try {
      if (placeId && placeId.indexOf('pref_') !== 0 && window.VenueDB) {
        var v = await window.VenueDB.loadVenue(placeId);
        if (v) return v;
      }
    } catch (e) {}
    // v0.16.23: se o preferido é label-only (synthetic pid) mas a v0.16.22
    // casou com a ficha cadastrada via nome/coords em refresh(), o venue
    // real está em state.prefVenueCache[placeId]. Usar esse doc preserva
    // o campo `sports[]` e permite a dupla filtragem (venue ∩ preferências).
    if (state.prefVenueCache && state.prefVenueCache[placeId]) {
      return state.prefVenueCache[placeId];
    }
    var cu = window.AppStore && window.AppStore.currentUser;
    var prefLocs = (cu && Array.isArray(cu.preferredLocations)) ? cu.preferredLocations : [];
    var matched = prefLocs.find(function(pl) {
      if (!pl) return false;
      if (pl.placeId && pl.placeId === placeId) return true;
      return _prefSyntheticPid(pl) === placeId;
    });
    if (!matched) return null;
    var lat = matched.lat != null ? Number(matched.lat) : null;
    var lon = (matched.lng != null ? Number(matched.lng) : (matched.lon != null ? Number(matched.lon) : null));
    var name = _cleanVenueName(matched.name || matched.label || '') || matched.label || 'Local preferido';
    return {
      placeId: placeId,
      name: name,
      lat: lat,
      lon: lon,
      sports: [],            // ficha sem modalidades — preferido do usuário dita
      address: matched.label || ''
    };
  }

  window._venuesQuickCheckInPreferred = async function(placeId) {
    var v = await _resolvePreferredVenue(placeId);
    if (!v) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    var venueSports = Array.isArray(v.sports) ? v.sports.slice() : [];
    var prefSports = (cu && Array.isArray(cu.preferredSports)) ? cu.preferredSports.slice() : [];
    // v0.16.40: interseção venue ∩ preferências = pré-seleção das pills. Quando
    // a ficha do venue ainda não existe (preferred não cadastrado), venueSports
    // fica vazio — caímos em prefSports direto. Sem nenhum dos dois, lista padrão.
    var picks = venueSports.length > 0 && prefSports.length > 0
      ? venueSports.filter(function(s) { return prefSports.indexOf(s) !== -1; })
      : (venueSports.length === 0 ? prefSports : venueSports);
    if (picks.length === 0) {
      if (placeId && placeId.indexOf('pref_') !== 0) {
        window._venuesQuickCheckIn(placeId);
        return;
      }
      picks = ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'];
    }
    if (picks.length === 1) {
      _doQuickCheckIn(v, picks);
      return;
    }
    _openInlineCheckInOverlay(v, picks);
  };

  // Plano rápido no card preferido — mesma lógica: usa todos os preferidos
  // que o venue oferece sem abrir picker.
  window._venuesQuickPlanPreferred = async function(placeId, editData) {
    var v = await _resolvePreferredVenue(placeId);
    if (!v) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) {
      if (window.showNotification) window.showNotification('Faça login para planejar.', 'info');
      return;
    }
    var venueSports = Array.isArray(v.sports) ? v.sports.slice() : [];
    var prefSports = (cu && Array.isArray(cu.preferredSports)) ? cu.preferredSports.slice() : [];
    // v2.8.72: mostra TODAS as modalidades preferidas do perfil como pills. O
    // estado ativo/inativo (1ª vez = o que o LOCAL oferece ∩ preferidas; depois =
    // memória por-local) é resolvido dentro de _openInlinePlanOverlay.
    if (prefSports.length > 0) {
      _openInlinePlanOverlay(v, prefSports, editData);
      return;
    }
    // Sem modalidades preferidas no perfil — cai no comportamento anterior.
    if (venueSports.length > 0) {
      _openInlinePlanOverlay(v, venueSports, editData);
      return;
    }
    if (placeId && placeId.indexOf('pref_') !== 0) {
      window._venuesQuickPlan(placeId, editData);
      return;
    }
    // v0.16.41: sem interseção venue×preferidos — abre overlay multi-pill com a
    // lista completa de modalidades; usuário desativa as que não vai jogar.
    var SPORTS_LIST2 = ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'];
    _openInlinePlanOverlay(v, SPORTS_LIST2, editData);
  };

  // v1.9.87: EDITAR um plano de ida existente. Carrega os horários do plano,
  // abre o overlay pré-preenchido e, ao confirmar, substitui o plano antigo.
  window._venuesEditPlanPreferred = async function(placeId, docId) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !window.PresenceDB) return;
    var editData = null;
    try {
      var active = await window.PresenceDB.loadMyActive(cu.uid);
      var plan = (active || []).filter(function(p) { return p && p.type === 'planned' && String(p._id) === String(docId); })[0];
      editData = plan ? {
        docId: docId,
        startsAt: plan.startsAt || null,
        endsAt: plan.endsAt || null,
        openEnded: !!plan.openEnded,
        sports: Array.isArray(plan.sports) ? plan.sports.slice() : null
      } : null;
    } catch (e) { editData = null; }
    // v2.1.8: passa o contexto de edição explícito — só esta rota edita.
    window._venuesQuickPlanPreferred(placeId, editData);
  };

  // Planejar ida: abre overlay inline POR CIMA da modal do venue. Mantém o
  // contexto do local que o usuário está vendo — antes a função redirecionava
  // pra #presence com prefill, mas o state global da view de presence era
  // reaproveitado e às vezes disparava o dialog com a venue errada (bug
  // repetido em v0.15.92 com Paineiras). Inline elimina a dependência do
  // state cross-view e garante que a venue planejada é sempre a que está
  // visível na tela.
  window._venuesQuickPlan = async function(placeId, editData) {
    var v = await window.VenueDB.loadVenue(placeId);
    if (!v) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) {
      if (window.showNotification) window.showNotification('Faça login para planejar.', 'info');
      return;
    }
    // v0.16.41: nunca mais picker single-choice. _openInlinePlanOverlay já
    // suporta multi-pill desde v0.16.15 — passa o array direto e deixa o usuário
    // ativar/desativar cada modalidade na mesma tela.
    var resolved = _pickSportForVenue(v);
    var planSports;
    if (resolved.needsPicker) {
      planSports = resolved.options || [];
    } else if (resolved.sports && resolved.sports.length > 0) {
      planSports = resolved.sports;
    } else {
      planSports = ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'];
    }
    _openInlinePlanOverlay(v, planSports, editData);
  };

  // Public entry point. `deepLinkPlaceId` (optional, from #venues/<placeId>)
  // opens the detail modal right after the listing renders so shared links
  // land on the venue directly.
  window.renderVenues = function(container, deepLinkPlaceId) {
    // Re-hidrata filtros do localStorage a cada abertura da view — state é
    // singleton, mas o usuário pode ter mudado preferências em outra aba ou
    // voltado depois de um logout/login.
    var fresh = _loadSavedFilters();
    if (fresh.location) state.location = fresh.location;
    // v0.16.3: sports[] array (pills multi-select). Migra fresh.sport singular
    // se for o único dado disponível (estado antigo persistido).
    if (Array.isArray(fresh.sports)) state.sports = fresh.sports.slice();
    else if (fresh.sport) state.sports = [fresh.sport];
    if (fresh.priceRange != null) state.priceRange = fresh.priceRange;
    if (fresh.minCourts) state.minCourts = fresh.minCourts;
    if (fresh.distanceKm) state.distanceKm = fresh.distanceKm;
    render(container);
    if (deepLinkPlaceId && typeof window._venuesOpenDetail === 'function') {
      setTimeout(function() { window._venuesOpenDetail(deepLinkPlaceId); }, 150);
    }
    // v2.3.41: tour de coachmarks da tela Place (idle-driven, self-guardado)
    if (window._coach && typeof window._coach.startPlaceTour === 'function') window._coach.startPlaceTour();
  };
})();
