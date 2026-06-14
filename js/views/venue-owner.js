// ========================================
// scoreplace.app — Venue Owner (Claim + Edit)
// ========================================
// Section injected at the bottom of the profile modal so proprietors can
// claim venues they own and keep their details up to date. Uses the same
// Google Places autocomplete as the tournament create flow.
//
// Flow:
//   1. User types in the search box → Places suggestions drop down.
//   2. Selecting a suggestion fetches full place details and opens the
//      inline claim form pre-filled with name/address/lat/lon/city.
//   3. User fills optional fields (sports, courts, hours, prices, contacts)
//      and clicks "Reivindicar".
//   4. VenueDB.claimVenue runs a transaction: if the venue is already
//      claimed by somebody else we surface an error and suggest contacting
//      support; otherwise the doc is created/updated with ownerUid.
//   5. The list of "Meus locais" below refreshes.

(function() {
  var _placesLibReady = false;

  // ─── Mapa principal da página #my-venues ─────────────────────────────────
  // Distinto do pequeno mapa que aparece DENTRO do formulário (_initVenueMap
  // em #venue-owner-map). Este fica no topo da view e mostra todos os venues
  // cadastrados como pins fixos, ajudando o usuário a identificar se o lugar
  // que quer cadastrar já existe antes de preencher tudo. Quando ele digita,
  // sugestões do Google entram como pins translúcidos sobrepostos.
  var _ownerMap = null;
  var _ownerMarkers = [];
  var _ownerMapsLibs = null;
  var _registeredVenues = [];        // venues carregados na entrada da view
  var _googleSuggestionsForMap = []; // sugestões atuais do Google (map pins)
  var _selectedPinMarker = null;     // pin vermelho destacando venue selecionado
  var _currentEditingPlace = null;   // venue em edição no _renderForm atual

  // Modalidades suportadas — somente esportes com times de até 2 jogadores
  // (racket-family + beach + derivados). Vôlei indoor, basquete, futsal,
  // futebol e handebol ficaram de fora enquanto o app não suporta times >2.
  // Courts multi-sport permitem indicar que uma quadra atende várias
  // modalidades compartilhadas.
  // v0.17.17: Squash e Badminton removidos — não suportados no app por enquanto.
  var SPORTS = ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'];

  function _safe(s) { return window._safeHtml ? window._safeHtml(s) : String(s || ''); }

  // ─── Hours grid helpers (7 days × 24 hours) ───────────────────────────────
  // Internal day order: 0=Seg, 1=Ter, 2=Qua, 3=Qui, 4=Sex, 5=Sáb, 6=Dom.
  // Google Places API uses 0=Sun; we map via (googleDay + 6) % 7.
  var DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  function _emptyHoursGrid() {
    var g = [];
    for (var d = 0; d < 7; d++) {
      var row = [];
      for (var h = 0; h < 24; h++) row.push(0);
      g.push(row);
    }
    return g;
  }

  // Convert Google Places `regularOpeningHours.periods[]` into our 7×24
  // boolean grid. A period open→close spans whole hours; if close crosses
  // midnight (common for late-night venues), we wrap to the next day.
  // Tolerant to missing fields — returns an empty grid when input is absent.
  function _googleHoursToGrid(place) {
    var grid = _emptyHoursGrid();
    if (!place || !place.regularOpeningHours || !Array.isArray(place.regularOpeningHours.periods)) return grid;
    var periods = place.regularOpeningHours.periods;
    periods.forEach(function(p) {
      if (!p.open) return;
      var startDay = (p.open.day + 6) % 7;
      var startHour = p.open.hour || 0;
      var endDay, endHour;
      if (p.close) {
        endDay = (p.close.day + 6) % 7;
        endHour = p.close.hour || 0;
        if (p.close.minute && p.close.minute > 0) endHour += 1; // pad partial hour
      } else {
        // open with no close = 24h from start
        endDay = startDay;
        endHour = 24;
      }
      // Walk hour by hour from (startDay,startHour) to (endDay,endHour).
      // Cap at 7*24 iterations to guard against malformed input.
      var d = startDay, h = startHour, steps = 0;
      while (steps < 7 * 24) {
        if (d === endDay && h >= endHour) break;
        grid[d][h] = 1;
        h += 1;
        if (h >= 24) { h = 0; d = (d + 1) % 7; }
        steps += 1;
      }
    });
    return grid;
  }

  function _buildHoursGridHtml(grid) {
    grid = grid || _emptyHoursGrid();
    // Hour header row: 0, 2, 4, ..., 22 shown (every 2h to fit mobile width).
    var hourHdr = '';
    for (var h = 0; h < 24; h++) {
      hourHdr += '<div style="flex:1;min-width:0;text-align:center;font-size:0.55rem;color:var(--text-muted);">' + (h % 2 === 0 ? h : '') + '</div>';
    }
    var rows = '';
    for (var d = 0; d < 7; d++) {
      var cells = '';
      for (var hh = 0; hh < 24; hh++) {
        var open = grid[d] && grid[d][hh] ? 1 : 0;
        var bg = open ? 'background:#10b981;' : 'background:#7f1d1d;';
        cells += '<div class="hg-cell" data-day="' + d + '" data-hour="' + hh + '" data-open="' + open + '" style="flex:1;min-width:0;height:22px;' + bg + 'border-right:1px solid rgba(0,0,0,0.35);"></div>';
      }
      rows += '<div style="display:flex;align-items:stretch;gap:0;border-bottom:1px solid rgba(0,0,0,0.25);">' +
                '<div style="width:30px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:700;color:var(--text-muted);background:var(--bg-darker);">' + DAY_LABELS[d] + '</div>' +
                '<div style="flex:1;display:flex;">' + cells + '</div>' +
              '</div>';
    }
    return '<div id="venue-owner-hours-grid" style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;user-select:none;touch-action:none;">' +
             '<div style="display:flex;background:var(--bg-darker);padding:4px 0;">' +
               '<div style="width:30px;flex-shrink:0;"></div>' +
               '<div style="flex:1;display:flex;">' + hourHdr + '</div>' +
             '</div>' +
             rows +
           '</div>' +
           '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:6px;line-height:1.5;">' +
             '🟢 aberto · 🟥 fechado<br>' +
             '<b>Toque</b> numa célula pra alternar a cor · <b>Arraste</b> pra pintar várias com a mesma cor (oposta à célula inicial)<br>' +
             '<span style="opacity:0.8;">Errou? Toque de novo na célula errada — alterna pro lado certo. Arraste pra corrigir várias.</span>' +
           '</div>';
  }

  // Attach pointer handlers to the hours grid so the user can drag-paint
  // across cells. First tap sets the paint mode (invert current cell);
  // every cell the pointer enters while down gets painted the same color.
  function _setupHoursGridListeners() {
    var grid = document.getElementById('venue-owner-hours-grid');
    if (!grid) return;
    var painting = false;
    var paintTo = 1;

    function paintCell(el) {
      if (!el || !el.classList || !el.classList.contains('hg-cell')) return;
      el.setAttribute('data-open', String(paintTo));
      el.style.background = paintTo ? '#10b981' : '#7f1d1d';
    }

    grid.addEventListener('pointerdown', function(ev) {
      var target = ev.target;
      if (!target.classList || !target.classList.contains('hg-cell')) return;
      ev.preventDefault();
      painting = true;
      paintTo = target.getAttribute('data-open') === '1' ? 0 : 1;
      paintCell(target);
      try { grid.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    grid.addEventListener('pointermove', function(ev) {
      if (!painting) return;
      ev.preventDefault();
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      paintCell(el);
    });

    function stop() { painting = false; }
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);
    grid.addEventListener('pointerleave', stop);
  }

  function _readHoursGrid() {
    var grid = _emptyHoursGrid();
    document.querySelectorAll('#venue-owner-hours-grid .hg-cell').forEach(function(cell) {
      var d = parseInt(cell.getAttribute('data-day'), 10);
      var h = parseInt(cell.getAttribute('data-hour'), 10);
      if (isNaN(d) || isNaN(h)) return;
      grid[d][h] = cell.getAttribute('data-open') === '1' ? 1 : 0;
    });
    return grid;
  }

  // Any cell set? Used to decide whether to bother persisting the grid field.
  function _gridAny(grid) {
    if (!Array.isArray(grid)) return false;
    for (var d = 0; d < grid.length; d++) {
      if (!Array.isArray(grid[d])) continue;
      for (var h = 0; h < grid[d].length; h++) if (grid[d][h]) return true;
    }
    return false;
  }

  // Firestore não aceita arrays aninhados. O grid 7×24 é mantido como array 2D
  // em memória (shape esperado pela UI), mas persistido como array flat de 168
  // posições (index = day * 24 + hour).
  function _flattenGrid(grid) {
    var flat = [];
    for (var d = 0; d < 7; d++) {
      var row = (Array.isArray(grid) && Array.isArray(grid[d])) ? grid[d] : [];
      for (var h = 0; h < 24; h++) flat.push(row[h] ? 1 : 0);
    }
    return flat;
  }
  function _expandGrid(flat) {
    if (!Array.isArray(flat) || flat.length !== 168) return _emptyHoursGrid();
    var g = [];
    for (var d = 0; d < 7; d++) {
      var row = [];
      for (var h = 0; h < 24; h++) row.push(flat[d * 24 + h] ? 1 : 0);
      g.push(row);
    }
    return g;
  }

  // ─── Small read-only interactive Google Map below the venue name ──────────
  // Single-marker, centered at (lat, lon), zoom ~16. Loads maps+marker
  // libraries on demand (the places library is already loaded by ensurePlaces,
  // but Map/AdvancedMarker need explicit importLibrary calls).
  async function _initVenueMap(lat, lon) {
    var el = document.getElementById('venue-owner-map');
    if (!el || lat == null || lon == null) return;
    if (!window.google || !window.google.maps || !window.google.maps.importLibrary) return;
    try {
      var Maps = await google.maps.importLibrary('maps');
      var Marker = await google.maps.importLibrary('marker');
      var map = new Maps.Map(el, {
        center: { lat: lat, lng: lon },
        zoom: 16,
        disableDefaultUI: true,
        gestureHandling: 'cooperative',
        clickableIcons: false,
        mapId: 'SCOREPLACE_VENUE_OWNER_MAP'
      });
      if (Marker && Marker.AdvancedMarkerElement) {
        new Marker.AdvancedMarkerElement({
          map: map,
          position: { lat: lat, lng: lon }
        });
      }
    } catch (e) {
      // Fallback: show the address instead of a broken map iframe.
      window._warn('venue-owner map init failed:', e && e.message);
      el.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:0.78rem;text-align:center;">📍 mapa indisponível</div>';
    }
  }

  // Ensure Places library is loaded lazily — the profile modal opens before
  // the user necessarily needs it.
  async function ensurePlaces() {
    if (_placesLibReady) return;
    if (!window.google || !window.google.maps || !window.google.maps.importLibrary) return;
    try { await google.maps.importLibrary('places'); _placesLibReady = true; } catch (e) {}
  }

  // ─── Helpers do mapa principal #my-venues ────────────────────────────────
  // Inicialização lazy no container #venue-owner-main-map. Reutiliza o padrão
  // de venues.js (mesmo mapId, mesmo gesture handling) pra consistência.
  async function _ensureOwnerMap() {
    if (!window.google || !window.google.maps || !window.google.maps.importLibrary) return;
    if (!_ownerMapsLibs) {
      try {
        var Maps = await google.maps.importLibrary('maps');
        var Marker = await google.maps.importLibrary('marker');
        _ownerMapsLibs = { Map: Maps.Map, AdvancedMarkerElement: Marker.AdvancedMarkerElement, PinElement: Marker.PinElement };
      } catch (e) { window._warn('[owner-map] load failed:', e); return; }
    }
    var el = document.getElementById('venue-owner-main-map');
    if (!el) return;
    if (!_ownerMap) {
      // Center inicial: perfil do usuário > GPS > Brasil inteiro.
      var cu = window.AppStore && window.AppStore.currentUser;
      var initialCenter = { lat: -15.78, lng: -47.93 };
      var initialZoom = 4;
      if (cu && cu.lat != null && cu.lon != null) {
        initialCenter = { lat: Number(cu.lat), lng: Number(cu.lon) };
        initialZoom = 12;
      }
      _ownerMap = new _ownerMapsLibs.Map(el, {
        center: initialCenter,
        zoom: initialZoom,
        mapId: 'scoreplace-venue-owner-main-map',
        disableDefaultUI: false,
        clickableIcons: false,
        gestureHandling: 'cooperative'
      });
    } else {
      google.maps.event.trigger(_ownerMap, 'resize');
    }
    _renderOwnerMarkers();
  }

  function _clearOwnerMarkers() {
    _ownerMarkers.forEach(function(m) { if (m && m.map) m.map = null; });
    _ownerMarkers = [];
  }

  // Pins dos venues cadastrados (âmbar) + sugestões Google (cinza translúcido).
  // Clique em cadastrado → abre edit; clique em Google → preenche form novo.
  function _renderOwnerMarkers() {
    if (!_ownerMap || !_ownerMapsLibs) return;
    _clearOwnerMarkers();
    var bounds = new google.maps.LatLngBounds();
    var anyPoints = 0;
    (_registeredVenues || []).forEach(function(v) {
      if (v.lat == null || v.lon == null) return;
      var pos = { lat: Number(v.lat), lng: Number(v.lon) };
      var pin = new _ownerMapsLibs.PinElement({
        background: v.plan === 'pro' ? '#6366f1' : '#f59e0b',
        borderColor: '#1e293b',
        glyph: '🏢',
        glyphColor: '#fff',
        scale: 1.1
      });
      var m = new _ownerMapsLibs.AdvancedMarkerElement({
        map: _ownerMap, position: pos, title: v.name || '', content: pin.element
      });
      m.addListener('click', function() {
        if (typeof window._venueOwnerEditExisting === 'function') window._venueOwnerEditExisting(v.placeId);
      });
      _ownerMarkers.push(m);
      bounds.extend(pos);
      anyPoints += 1;
    });
    (_googleSuggestionsForMap || []).forEach(function(p) {
      if (p.lat == null || p.lng == null) return;
      // Dedup: se já há venue cadastrado com mesmo placeId, pula.
      var dup = _registeredVenues.some(function(v) { return v.placeId && p.placeId && v.placeId === p.placeId; });
      if (dup) return;
      var pos = { lat: Number(p.lat), lng: Number(p.lng) };
      var pin = new _ownerMapsLibs.PinElement({
        background: '#64748b',
        borderColor: '#1e293b',
        glyph: '🔎',
        glyphColor: '#e2e8f0',
        scale: 0.9
      });
      var m = new _ownerMapsLibs.AdvancedMarkerElement({
        map: _ownerMap, position: pos, title: (p.name || '') + ' (sugestão Google)', content: pin.element
      });
      // Clicar num pin do Google = atalho pra preencher o form desse lugar.
      m.addListener('click', function() {
        if (p.prediction) _selectPlace(p.prediction);
      });
      _ownerMarkers.push(m);
      bounds.extend(pos);
      anyPoints += 1;
    });
    if (anyPoints > 1) _ownerMap.fitBounds(bounds, 60);
    else if (anyPoints === 1) { _ownerMap.setCenter(bounds.getCenter()); _ownerMap.setZoom(14); }
  }

  // Carrega a primeira página de venues cadastrados pra popular o mapa. Usa
  // o mesmo limite/padrão que a view pública #venues — 50 é suficiente pra
  // visualização; a busca textual filtra além disso.
  async function _loadRegisteredVenues() {
    if (!window.VenueDB || typeof window.VenueDB.listVenues !== 'function') return;
    try {
      _registeredVenues = await window.VenueDB.listVenues({}, { limit: 50 });
    } catch (e) {
      window._warn('[owner-map] listVenues failed:', e);
      _registeredVenues = [];
    }
    _renderOwnerMarkers();
  }

  // Quando um venue é selecionado (via search ou pin), o mapa do topo zoom in
  // naquele ponto e ganha um pin vermelho destacando a escolha. Substitui o
  // mini-mapa que antes era renderizado DENTRO do formulário (duplicava).
  function _focusOwnerMapOn(place) {
    if (!_ownerMap || !_ownerMapsLibs || !place || place.lat == null || place.lon == null) return;
    var pos = { lat: Number(place.lat), lng: Number(place.lon) };
    if (_selectedPinMarker) { _selectedPinMarker.map = null; _selectedPinMarker = null; }
    var pin = new _ownerMapsLibs.PinElement({
      background: '#ef4444', borderColor: '#7f1d1d', glyph: '📌', glyphColor: '#fff', scale: 1.3
    });
    _selectedPinMarker = new _ownerMapsLibs.AdvancedMarkerElement({
      map: _ownerMap, position: pos, title: place.name || 'selecionado', content: pin.element, zIndex: 1000
    });
    _ownerMap.setCenter(pos);
    _ownerMap.setZoom(16);
  }

  // Inner block — map + search input + form wrap + "meus locais" list.
  // O mapa no topo mostra venues já cadastrados (pins âmbar) pra evitar que o
  // usuário cadastre duplicados; quando ele digita, sugestões do Google entram
  // como pins translúcidos e também aparecem no dropdown de busca em duas
  // seções distintas ("Já cadastrados" vs "Sugestões do Google").
  function _ownerInnerHtml() {
    return '<div id="venue-owner-main-map" style="width:100%;height:280px;border-radius:12px;overflow:hidden;border:1px solid var(--border-color);background:#0a0e1a;margin-bottom:10px;"></div>' +
      '<div style="position:relative;margin-bottom:8px;">' +
        '<input type="text" id="venue-owner-search" class="form-control" placeholder="Busque pelo nome — se já existir, você pode editar; se não, cadastre via Google" autocomplete="off" style="width:100%;box-sizing:border-box;font-size:0.9rem;" oninput="window._venueOwnerSearch(this.value)">' +
        '<div id="venue-owner-suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:9999;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;margin-top:4px;max-height:320px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.5);"></div>' +
      '</div>' +
      '<div id="venue-owner-form-wrap"></div>' +
      '<div id="venue-owner-list" style="margin-top:14px;"></div>';
  }

  // Dedicated, full-page venue management view. Conceptually separate from
  // the user profile — this is where a proprietor (not a player) works.
  window.renderMyVenues = function(container) {
    if (!container) return;
    var back = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({ href: '#venues', label: 'Voltar' })
      : '';
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) {
      container.innerHTML = back +
        '<div class="card" style="max-width:600px;margin:2rem auto;padding:2rem;text-align:center;">' +
          '<h2 style="margin:0 0 1rem 0;">Meus locais</h2>' +
          '<p style="color:var(--text-muted);margin-bottom:1rem;">Faça login para cadastrar ou gerenciar locais que você administra.</p>' +
          '<button class="btn btn-primary" onclick="if(typeof openModal===\'function\')openModal(\'modal-login\')">Entrar</button>' +
        '</div>';
      return;
    }
    container.innerHTML = back +
      // v1.3.16-beta: regra de overflow zero — inputs/selects/textareas dentro
      // do form NUNCA podem passar da largura do container. box-sizing:border-box
      // + min-width:0 + max-width:100%. Aplicado também a img (Google logos
      // colados às vezes vinham wider que o card) e ao próprio wrap.
      '<style>' +
        '#venue-owner-form-wrap, #venue-owner-form-wrap *{box-sizing:border-box;}' +
        '#venue-owner-form-wrap input,#venue-owner-form-wrap select,#venue-owner-form-wrap textarea{min-width:0;max-width:100%;width:100%;}' +
        '#venue-owner-form-wrap img,#venue-owner-form-wrap canvas,#venue-owner-form-wrap iframe{max-width:100%;height:auto;}' +
      '</style>' +
      '<div style="max-width:820px;margin:0 auto;padding:0 8px;box-sizing:border-box;overflow-x:hidden;">' +
        _ownerInnerHtml() +
      '</div>';
    // Mapa precisa de um tick pro container ter tamanho medido corretamente;
    // sem isso o Google Maps pode inicializar com 0x0 e não re-layout.
    _ownerMap = null; _ownerMarkers = []; _googleSuggestionsForMap = [];
    setTimeout(function() { _ensureOwnerMap(); _loadRegisteredVenues(); }, 50);
    ensurePlaces();
    window._loadMyVenuesList();

    // Deep-link de #venues: usuário clicou em "Cadastrar este local" num Google
    // Place não registrado. Pegamos o payload stashed e abrimos direto o form
    // com o que já temos — sem exigir que ele re-busque o mesmo endereço.
    var pending = null;
    try {
      var raw = sessionStorage.getItem('scoreplace_pending_venue_registration');
      if (raw) {
        pending = JSON.parse(raw);
        sessionStorage.removeItem('scoreplace_pending_venue_registration');
      }
    } catch (e) {}
    if (pending && pending.placeId) {
      setTimeout(function() { _startRegistrationFromData(pending); }, 200);
    }
  };

  // Abre o form de cadastro pré-preenchido com o que #venues já sabe sobre o
  // local (nome, endereço, lat/lon, placeId). Se já existir doc no Firestore
  // — race com outro usuário cadastrando o mesmo placeId — cai pro fluxo de
  // edição; caso contrário abre _renderForm limpo.
  async function _startRegistrationFromData(data) {
    if (!data || !data.placeId) return;
    var key = window.VenueDB.venueKey(data.placeId, data.name || '');
    var existing = null;
    try { existing = await window.VenueDB.loadVenue(key); } catch (e) {}
    var cu = window.AppStore && window.AppStore.currentUser;
    var otherOwner = existing && existing.ownerUid && (!cu || existing.ownerUid !== cu.uid);
    if (otherOwner) {
      _renderForm(null, { warning: 'Este local já foi reivindicado por outro usuário. Se você é o verdadeiro dono, escreva para scoreplace.app@gmail.com.' });
      return;
    }
    var alreadyCommunity = existing && !existing.ownerUid && existing.createdByName;
    _renderForm({
      placeId: key,
      name: data.name || '',
      address: data.address || '',
      city: '',
      lat: (data.lat != null ? Number(data.lat) : null),
      lon: (data.lon != null ? Number(data.lon) : null)
    }, {
      existing: existing || null,
      collaborativeBanner: !!alreadyCommunity,
      creatorName: alreadyCommunity ? existing.createdByName : ''
    });
    var form = document.getElementById('venue-owner-form-wrap');
    if (form) form.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // Places autocomplete — busca dinâmica (v0.15.28): 2 char mínimo + 150ms
  // debounce pra match com a busca do profile (v0.15.19). Resposta quase
  // imediata conforme o usuário digita "Ar" → já começa a mostrar "Arena X".
  var _searchTimer = null;
  window._venueOwnerSearch = function(query) {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function() { _doSearch(query); }, 150);
  };
  function _addSectionHeader(box, label) {
    var hdr = document.createElement('div');
    hdr.style.cssText = 'padding:8px 14px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted);background:var(--bg-darker);border-bottom:1px solid rgba(255,255,255,0.06);';
    hdr.textContent = label;
    box.appendChild(hdr);
  }

  function _addRegisteredItem(box, venue) {
    var address = venue.address || venue.city || '';
    var claimedTag = venue.ownerUid
      ? '<span style="font-size:0.62rem;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#10b981;padding:1px 6px;border-radius:10px;margin-left:6px;vertical-align:middle;">✓ oficial</span>'
      : '<span style="font-size:0.62rem;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;padding:1px 6px;border-radius:10px;margin-left:6px;vertical-align:middle;">🤝 comunitário</span>';
    var item = document.createElement('div');
    item.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);';
    item.innerHTML = '<div style="color:#e2e8f0;font-size:0.85rem;font-weight:500;">🏢 ' + _safe(venue.name || '') + claimedTag + '</div>' +
      (address ? '<div style="color:#94a3b8;font-size:0.75rem;margin-top:2px;">' + _safe(address) + '</div>' : '');
    item.addEventListener('mouseenter', function() { item.style.background = 'rgba(251,191,36,0.08)'; });
    item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
    item.addEventListener('mousedown', function(ev) {
      ev.preventDefault();
      var boxEl = document.getElementById('venue-owner-suggestions');
      if (boxEl) { boxEl.style.display = 'none'; boxEl.innerHTML = ''; }
      if (typeof window._venueOwnerEditExisting === 'function') window._venueOwnerEditExisting(venue.placeId);
    });
    box.appendChild(item);
  }

  function _addGoogleItem(box, pred) {
    var main = pred.mainText ? pred.mainText.text : '';
    var sec = pred.secondaryText ? pred.secondaryText.text : '';
    var item = document.createElement('div');
    item.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);';
    item.innerHTML = '<div style="color:#e2e8f0;font-size:0.85rem;font-weight:500;">📍 ' + _safe(main) + '</div>' +
      (sec ? '<div style="color:#94a3b8;font-size:0.75rem;margin-top:2px;">' + _safe(sec) + '</div>' : '');
    item.addEventListener('mouseenter', function() { item.style.background = 'rgba(129,140,248,0.15)'; });
    item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
    item.addEventListener('mousedown', function(ev) { ev.preventDefault(); _selectPlace(pred); });
    box.appendChild(item);
  }

  async function _doSearch(query) {
    var box = document.getElementById('venue-owner-suggestions');
    if (!box) return;
    var q = String(query || '').trim();
    if (q.length < 2) {
      box.style.display = 'none';
      box.innerHTML = '';
      // Limpa pins de sugestão Google do mapa quando a query esvazia.
      _googleSuggestionsForMap = [];
      _renderOwnerMarkers();
      return;
    }

    // ─── Seção 1: venues cadastrados (match por nome) ───────────────────────
    // Busca local, sem custo de rede. Limit 8 pra caber sem competir demais
    // com as sugestões do Google logo abaixo.
    var qLow = q.toLowerCase();
    var matched = (_registeredVenues || []).filter(function(v) {
      var n = (v.name || '').toLowerCase();
      var city = (v.city || '').toLowerCase();
      var addr = (v.address || '').toLowerCase();
      return n.indexOf(qLow) !== -1 || city.indexOf(qLow) !== -1 || addr.indexOf(qLow) !== -1;
    }).slice(0, 8);

    // ─── Seção 2: sugestões do Google ───────────────────────────────────────
    await ensurePlaces();
    var googleSugs = [];
    var googleError = null;
    if (window.google && window.google.maps && window.google.maps.places) {
      try {
        var result = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          includedRegionCodes: ['br'],
          includedPrimaryTypes: ['establishment'],
          language: 'pt-BR'
        });
        googleSugs = (result.suggestions || []).filter(function(s) { return s.placePrediction; });
      } catch (err) {
        window._error('Venue owner search error:', err);
        googleError = err && err.message;
      }
    } else {
      googleError = 'Google Places indisponível';
    }

    // Monta o dropdown. Se nada foi encontrado nos dois lados, mostra msg.
    box.innerHTML = '';
    if (matched.length === 0 && googleSugs.length === 0) {
      box.innerHTML = googleError
        ? '<div style="padding:10px;color:#f87171;font-size:0.8rem;">' + _safe(googleError) + '</div>'
        : '<div style="padding:10px;color:#94a3b8;font-size:0.8rem;">Nada encontrado.</div>';
      box.style.display = 'block';
      _googleSuggestionsForMap = [];
      _renderOwnerMarkers();
      return;
    }
    if (matched.length > 0) {
      _addSectionHeader(box, '🏢 Já cadastrados no scoreplace (' + matched.length + ')');
      matched.forEach(function(v) { _addRegisteredItem(box, v); });
    }
    if (googleSugs.length > 0) {
      _addSectionHeader(box, '📍 Sugestões do Google — novo cadastro');
      googleSugs.forEach(function(s) { _addGoogleItem(box, s.placePrediction); });
    }
    box.style.display = 'block';

    // Atualiza pins do mapa com as sugestões Google (só as que têm location —
    // predictions crus NÃO têm lat/lng; precisamos do place.fetchFields pra
    // obter. Pra não fazer N chamadas, mantemos o mapa só com cadastrados +
    // pins Google adicionados on-demand quando o usuário clicar/hover).
    // Por simplicidade nesta iteração, limpamos sugestões Google do mapa até
    // que alguma seja selecionada.
    _googleSuggestionsForMap = [];
    _renderOwnerMarkers();
  }

  async function _selectPlace(prediction) {
    var box = document.getElementById('venue-owner-suggestions');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    try {
      var place = prediction.toPlace();
      // Campos expandidos — pré-preenche telefone, website, horário,
      // faixa de preço do Google Places quando disponíveis. Reduz atrito
      // para o usuário cadastrando; o dono pode editar depois.
      await place.fetchFields({ fields: [
        'displayName', 'formattedAddress', 'location', 'addressComponents', 'id',
        'nationalPhoneNumber', 'websiteURI', 'regularOpeningHours', 'priceLevel'
      ] });
      var city = '';
      if (place.addressComponents) {
        for (var i = 0; i < place.addressComponents.length; i++) {
          var comp = place.addressComponents[i];
          if ((comp.types || []).indexOf('administrative_area_level_2') !== -1) { city = comp.longText || comp.shortText; break; }
          if ((comp.types || []).indexOf('locality') !== -1) { city = comp.longText || comp.shortText; break; }
        }
      }
      var name = place.displayName || '';
      var addr = place.formattedAddress || '';
      var lat = place.location ? place.location.lat() : null;
      var lon = place.location ? place.location.lng() : null;
      var pid = place.id || '';
      // Campos extras do Google para pré-preenchimento.
      var googlePhone = place.nationalPhoneNumber || '';
      var googleWebsite = place.websiteURI || '';
      var googleHoursGrid = _googleHoursToGrid(place);

      // Clear the search input so it doesn't look stale next to the form.
      var search = document.getElementById('venue-owner-search');
      if (search) search.value = name;

      // Dedup por placeId — se venue já existe, abre em modo EDIÇÃO
      // (colaborativo enquanto sem dono, oficial quando é meu).
      var existing = await window.VenueDB.loadVenue(window.VenueDB.venueKey(pid, name));
      var cu = window.AppStore && window.AppStore.currentUser;
      var otherOwner = existing && existing.ownerUid && (!cu || existing.ownerUid !== cu.uid);
      if (otherOwner) {
        _renderForm(null, {
          warning: 'Este local já foi reivindicado por outro usuário. Se você é o verdadeiro dono, escreva para scoreplace.app@gmail.com.'
        });
        return;
      }
      var alreadyCommunity = existing && !existing.ownerUid && existing.createdByName;
      // Pre-fill packet for the form. When editing an existing doc we only
      // use Google values as fallback for blank fields; fresh cadastro
      // adopts Google wholesale.
      var hasAnyGoogle = !!(googlePhone || googleWebsite || (googleHoursGrid && _gridAny(googleHoursGrid)));
      var prefillData = {
        contact: { phone: googlePhone, website: googleWebsite },
        website: googleWebsite,
        openingHours: googleHoursGrid && _gridAny(googleHoursGrid) ? { grid: _flattenGrid(googleHoursGrid) } : null
      };
      _renderForm({
        placeId: window.VenueDB.venueKey(pid, name),
        name: name, address: addr, city: city, lat: lat, lon: lon
      }, {
        existing: existing || null,
        googlePrefill: !existing && hasAnyGoogle,
        googlePrefillData: prefillData,
        collaborativeBanner: !!alreadyCommunity,
        creatorName: alreadyCommunity ? existing.createdByName : ''
      });
    } catch (err) {
      window._error('Place details error:', err);
    }
  }

  function _renderForm(place, opts) {
    var wrap = document.getElementById('venue-owner-form-wrap');
    if (!wrap) return;
    opts = opts || {};
    if (opts.warning) {
      wrap.innerHTML = '<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:12px;color:#fca5a5;font-size:0.82rem;">⚠️ ' + _safe(opts.warning) + '</div>';
      return;
    }
    _currentEditingPlace = place;
    if (!place) { wrap.innerHTML = ''; return; }

    // Merge prefill: existing venue doc > Google auto-fill > empty.
    var ex = opts.existing || {};
    if (opts.googlePrefillData && !opts.existing) {
      // On a fresh cadastro the only source of truth is Google — adopt its
      // defaults wholesale.
      ex = opts.googlePrefillData;
    } else if (opts.googlePrefillData && opts.existing) {
      // Editing an existing doc: only adopt Google defaults for blank fields.
      if (opts.googlePrefillData.contact) {
        if (!ex.contact) ex.contact = {};
        ['phone', 'website'].forEach(function(k) {
          if (!ex.contact[k] && opts.googlePrefillData.contact[k]) ex.contact[k] = opts.googlePrefillData.contact[k];
        });
      }
      if (!ex.openingHours && opts.googlePrefillData.openingHours) ex.openingHours = opts.googlePrefillData.openingHours;
    }

    var cu = window.AppStore && window.AppStore.currentUser;
    var imOwner = cu && opts.existing && opts.existing.ownerUid === cu.uid;
    var titleLabel;
    if (imOwner) titleLabel = '✏️ Editar meu local';
    else if (opts.existing) titleLabel = '✏️ Editar local cadastrado por ' + _safe(opts.creatorName || 'outro usuário');
    else titleLabel = '💾 Cadastrar local novo';

    var collabBanner = (opts.collaborativeBanner && !imOwner)
      ? '<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:0.76rem;color:var(--text-main);">🤝 Local já cadastrado por <b>' + _safe(opts.creatorName || '') + '</b>. Você pode completar/corrigir colaborativamente até o proprietário assumir.</div>'
      : '';
    var googleBanner = (opts.googlePrefill && !opts.existing)
      ? '<div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:0.76rem;color:var(--text-main);">📍 Preenchido automaticamente do Google (horário, telefone, site). Ajuste o que quiser antes de salvar.</div>'
      : '';

    // Opening hours persistido como flat 168 (Firestore não aceita array 2D).
    // Expande de volta pra 2D — shape esperado pela UI / pintura.
    var hoursGrid = (ex.openingHours && Array.isArray(ex.openingHours.grid))
      ? _expandGrid(ex.openingHours.grid)
      : _emptyHoursGrid();

    // Claim button state
    var imClaimed = imOwner;
    var hasOtherOwner = ex.ownerUid && !imOwner;
    var canClaim = !hasOtherOwner;
    var claimBtnHtml = canClaim
      ? '<button type="button" id="venue-owner-claim-btn" onclick="window._venueOwnerToggleClaim()" data-claimed="' + (imClaimed ? '1' : '0') + '" style="flex:1;padding:12px;border-radius:10px;font-weight:700;font-size:0.88rem;cursor:pointer;border:1px solid ' + (imClaimed ? 'rgba(16,185,129,0.5)' : 'rgba(251,191,36,0.4)') + ';background:' + (imClaimed ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.1)') + ';color:' + (imClaimed ? '#10b981' : '#fbbf24') + ';">' + (imClaimed ? '✅ Reivindicado por você' : '🏢 Reivindicar como proprietário') + '</button>'
      : '<button type="button" disabled style="flex:1;padding:12px;border-radius:10px;font-weight:700;font-size:0.88rem;border:1px solid var(--border-color);background:var(--bg-darker);color:var(--text-muted);cursor:not-allowed;" title="Já reivindicado por outro usuário">🔒 Já reivindicado</button>';

    // Courts button — if venue not yet saved, auto-saves first then opens courts.
    var safePlaceId = _safe(place.placeId).replace(/\\/g, '\\\\').replace(/\'/g, "\\'");
    var courtsBtnHtml = opts.existing
      ? '<button type="button" onclick=\'window._venueCourtAddDialog("' + safePlaceId + '")\' style="flex:1;padding:12px;border-radius:10px;font-weight:700;font-size:0.88rem;cursor:pointer;border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.15);color:#a5b4fc;">🎾 Cadastrar quadras</button>'
      : '<button type="button" onclick=\'window._venueSaveAndOpenCourts()\' style="flex:1;padding:12px;border-radius:10px;font-weight:700;font-size:0.88rem;cursor:pointer;border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.15);color:#a5b4fc;">🎾 Cadastrar quadras</button>';

    wrap.innerHTML =
      '<div style="background:var(--bg-darker);border:1px solid var(--border-color);border-radius:12px;padding:14px;margin-top:6px;">' +
        '<div style="font-weight:700;color:var(--text-bright);font-size:0.92rem;margin-bottom:8px;">' + titleLabel + '</div>' +
        collabBanner +
        googleBanner +

        // ── Nome + endereço ──
        // O mapa fica no topo da view (#venue-owner-main-map) e é zoom-ed
        // dinamicamente em _focusOwnerMapOn() quando este venue é selecionado;
        // não replica aqui dentro do form pra não duplicar (feedback v0.15.50).
        '<div style="margin-bottom:12px;">' +
          '<div style="font-weight:700;color:var(--text-bright);font-size:1rem;margin-bottom:2px;">' + _safe(place.name) + '</div>' +
          '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:8px;">' + _safe(place.address || '') + '</div>' +
        '</div>' +

        // ── Política de acesso ──
        '<label style="display:block;font-size:0.76rem;font-weight:600;color:var(--text-muted);margin-bottom:12px;">🔐 Política de acesso' +
          '<select id="venue-owner-access" style="display:block;width:100%;margin-top:4px;padding:10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.88rem;">' +
            '<option value="public"' + ((ex.accessPolicy || 'public') === 'public' ? ' selected' : '') + '>🌐 Público — aberto a qualquer pessoa</option>' +
            '<option value="members"' + (ex.accessPolicy === 'members' ? ' selected' : '') + '>👥 Só sócios</option>' +
            '<option value="members_plus_guests"' + (ex.accessPolicy === 'members_plus_guests' ? ' selected' : '') + '>👥+🏆 Sócios e convidados de torneios</option>' +
            '<option value="private"' + (ex.accessPolicy === 'private' ? ' selected' : '') + '>🔒 Privado</option>' +
          '</select>' +
        '</label>' +

        // ── Horário de funcionamento (7×24 grid) ──
        '<div style="margin-bottom:14px;">' +
          '<div style="font-size:0.76rem;font-weight:600;color:var(--text-muted);margin-bottom:6px;">🕐 Horário de funcionamento</div>' +
          _buildHoursGridHtml(hoursGrid) +
        '</div>' +

        // ── Contatos ──
        '<div style="font-size:0.76rem;font-weight:600;color:var(--text-muted);margin-bottom:6px;">📞 Contatos</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
          '<input type="tel" id="venue-owner-phone" value="' + _safe((ex.contact && ex.contact.phone) || '') + '" placeholder="📞 Telefone" style="padding:10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.88rem;">' +
          '<input type="tel" id="venue-owner-whatsapp" value="' + _safe((ex.contact && ex.contact.whatsapp) || '') + '" placeholder="💬 WhatsApp" style="padding:10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.88rem;">' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
          '<input type="text" id="venue-owner-insta" value="' + _safe((ex.contact && ex.contact.instagram) || '') + '" placeholder="📷 Instagram" style="padding:10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.88rem;">' +
          '<input type="text" id="venue-owner-facebook" value="' + _safe((ex.contact && ex.contact.facebook) || '') + '" placeholder="📘 Facebook" style="padding:10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.88rem;">' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
          '<input type="url" id="venue-owner-website" value="' + _safe((ex.contact && ex.contact.website) || '') + '" placeholder="🌐 Site" style="padding:10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.88rem;">' +
          '<input type="email" id="venue-owner-email" value="' + _safe((ex.contact && ex.contact.email) || '') + '" placeholder="✉️ E-mail" style="padding:10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.88rem;">' +
        '</div>' +

        // ── Botões de ação principal ──
        '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
          claimBtnHtml +
          courtsBtnHtml +
        '</div>' +

        // ── Salvar / Cancelar / Apagar ──
        // Apagar só aparece em edição (já existe no DB) e se eu sou dono OU
        // criador — outros usuários só podem editar colaborativamente. Fica
        // no canto esquerdo separado dos botões positivos (Cancelar/Salvar)
        // pra reduzir chance de clique acidental.
        '<div style="display:flex;gap:6px;justify-content:space-between;align-items:center;flex-wrap:wrap;">' +
          ((opts.existing && cu && cu.uid && (opts.existing.ownerUid === cu.uid || opts.existing.createdByUid === cu.uid))
            ? '<button type="button" class="btn btn-sm" onclick=\'window._venueOwnerDelete("' + safePlaceId + '")\' style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;">🗑️ Apagar local</button>'
            : '<span></span>') +
          '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-secondary btn-sm" onclick="window._venueOwnerCancel()">Cancelar</button>' +
            '<button type="button" class="btn btn-primary btn-sm" onclick=\'window._spinButton(this, "Salvando..."); window._venueOwnerSubmit(' + JSON.stringify(place).replace(/'/g, '&#39;') + ')\'>' + (opts.existing ? '💾 Salvar alterações' : '💾 Cadastrar local') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Setup hours grid painting + zoom the top map onto this venue.
    setTimeout(function() {
      _setupHoursGridListeners();
      _focusOwnerMapOn(place);
      // O mapa subiu pro topo da view — garante que o usuário veja o pin vermelho
      // + o card de edição juntos sem precisar rolar até o fim do form.
      var map = document.getElementById('venue-owner-main-map');
      if (map) map.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 30);
  }

  // Toggle claim state button. Stored as a data-attr on the button — read at
  // submit time. Kept as a button (not checkbox) per the updated UX spec.
  window._venueOwnerToggleClaim = function() {
    var btn = document.getElementById('venue-owner-claim-btn');
    if (!btn) return;
    var claimed = btn.getAttribute('data-claimed') === '1';
    var next = claimed ? '0' : '1';
    btn.setAttribute('data-claimed', next);
    if (next === '1') {
      btn.textContent = '✅ Reivindicado por você';
      btn.style.background = 'rgba(16,185,129,0.15)';
      btn.style.border = '1px solid rgba(16,185,129,0.5)';
      btn.style.color = '#10b981';
    } else {
      btn.textContent = '🏢 Reivindicar como proprietário';
      btn.style.background = 'rgba(251,191,36,0.1)';
      btn.style.border = '1px solid rgba(251,191,36,0.4)';
      btn.style.color = '#fbbf24';
    }
  };

  // v0.17.16: delega ao resolver global em store.js (centralização).
  function _sportIconFor(sport) { return window._sportIcon ? window._sportIcon(sport) : '🎾'; }

  // ─── Courts screen (new UX spec v0.15.43) ─────────────────────────────────
  // Full-screen overlay with venue name at top, "+" button to expand an
  // inline form (quantity + multi-sport checkboxes), and the list of
  // already-registered court entries below. Multi-sport entries represent
  // shared courts (e.g. one court where both Beach Tennis and Futvôlei can
  // be played).
  //
  // Entry points:
  //   • _venueCourtAddDialog(venueKey)        — open the screen (for this venue)
  //   • _venueCourtEditDialog(venueKey, id)   — open screen with edit form
  //                                              pre-expanded for that entry
  var _courtsDialogState = { venueKey: null, editingId: null };

  window._venueCourtAddDialog = function(venueKey) {
    _openCourtsScreen(venueKey, null);
  };
  window._venueCourtEditDialog = async function(venueKey, courtId) {
    _openCourtsScreen(venueKey, courtId);
  };

  async function _openCourtsScreen(venueKey, editingId) {
    _courtsDialogState.venueKey = venueKey;
    _courtsDialogState.editingId = editingId;
    var venue = await window.VenueDB.loadVenue(venueKey).catch(function() { return null; });
    var venueName = (venue && venue.name) || 'Local';
    var existing = null;
    if (editingId) {
      var all = await window.VenueDB.listVenueCourts(venueKey).catch(function() { return []; });
      existing = all.find(function(c) { return c._id === editingId; }) || null;
    }

    // Nuke any prior overlay before rendering so consecutive opens don't
    // stack half-torn-down DOM nodes.
    var prior = document.getElementById('court-dialog-overlay');
    if (prior) prior.remove();

    var overlay = document.createElement('div');
    overlay.id = 'court-dialog-overlay';
    // Full-screen z-index above every other app overlay including the venue
    // owner form (which is inline, no overlay).
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,24,0.96);z-index:10020;overflow-y:auto;padding:14px;';

    var safeKey = _safe(venueKey).replace(/\\/g, '\\\\').replace(/\'/g, "\\'");
    overlay.innerHTML =
      '<div style="max-width:720px;margin:0 auto;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
          '<button type="button" onclick="document.getElementById(\'court-dialog-overlay\').remove()" style="background:rgba(255,255,255,0.08);border:1px solid var(--border-color);color:var(--text-bright);border-radius:10px;padding:8px 14px;font-size:0.86rem;font-weight:600;cursor:pointer;">← Voltar</button>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:0.72rem;color:var(--text-muted);">Quadras de</div>' +
            '<div style="font-weight:800;color:var(--text-bright);font-size:1.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _safe(venueName) + '</div>' +
          '</div>' +
        '</div>' +

        // ── + (add) button + inline form placeholder ──
        '<div style="margin-bottom:12px;">' +
          '<button type="button" onclick="window._courtsToggleForm(null)" id="courts-add-btn" style="width:100%;padding:14px;border-radius:12px;background:rgba(99,102,241,0.15);border:2px dashed rgba(99,102,241,0.5);color:#a5b4fc;font-size:1rem;font-weight:700;cursor:pointer;">' +
            '➕ Adicionar quadras' +
          '</button>' +
          '<div id="courts-form-slot" style="margin-top:8px;"></div>' +
        '</div>' +

        // ── List of existing courts ──
        '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:6px;">Quadras cadastradas neste local</div>' +
        '<div id="courts-list-slot" data-venue-key="' + safeKey + '">' +
          (typeof window._renderBallLoaderInline === 'function' ? '<div style="padding:8px 0;">' + window._renderBallLoaderInline('Carregando…') + '</div>' : '<div style="font-size:0.8rem;color:var(--text-muted);padding:12px;">Carregando...</div>') +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // Load the list.
    _refreshCourtsScreenList(venueKey);

    // If we entered in edit mode, auto-open the form with the existing values.
    if (existing) {
      setTimeout(function() { window._courtsToggleForm(existing); }, 30);
    }
  }

  // Render the inline add/edit form (inside the courts screen) on demand.
  // Pass `existing` (court object) to pre-fill for edit; null for a new entry.
  window._courtsToggleForm = function(existing) {
    var slot = document.getElementById('courts-form-slot');
    if (!slot) return;
    // Toggle off if clicking the + button again with no edit target.
    if (slot.childElementCount > 0 && !existing) {
      slot.innerHTML = '';
      return;
    }
    var currentSports = Array.isArray(existing && existing.sports) ? existing.sports : [];

    var sportPills = SPORTS.map(function(s) {
      var on = currentSports.indexOf(s) !== -1;
      var onStyle = 'background:rgba(99,102,241,0.3);border-color:rgba(99,102,241,0.8);color:#c4b5fd;';
      var offStyle = 'background:var(--bg-darker);border-color:var(--border-color);color:var(--text-main);';
      return '<button type="button" class="court-form-sport-pill" data-sport="' + _safe(s) + '" data-active="' + (on ? '1' : '') + '" ' +
        'onclick="var a=!this.dataset.active;this.dataset.active=a?\'1\':\'\';this.style.cssText=\'padding:6px 12px;border-radius:999px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid \'+' +
        '(a?\'rgba(99,102,241,0.8)\':\'var(--border-color)\')+\';background:\'+' +
        '(a?\'rgba(99,102,241,0.3)\':\'var(--bg-darker)\')+\';color:\'+' +
        '(a?\'#c4b5fd\':\'var(--text-main)\')+\';\'" ' +
        'style="padding:6px 12px;border-radius:999px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid ' + (on ? 'rgba(99,102,241,0.8)' : 'var(--border-color)') + ';' +
        'background:' + (on ? 'rgba(99,102,241,0.3)' : 'var(--bg-darker)') + ';' +
        'color:' + (on ? '#c4b5fd' : 'var(--text-main)') + ';">' +
        _sportIconFor(s) + ' ' + _safe(s) +
      '</button>';
    }).join('');

    slot.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:14px;">' +
        '<div style="font-weight:700;color:var(--text-bright);margin-bottom:10px;">' + (existing ? '✏️ Editar entrada' : '➕ Nova entrada de quadras') + '</div>' +
        '<label style="display:block;font-size:0.76rem;color:var(--text-muted);margin-bottom:10px;">Número de quadras' +
          '<input type="number" id="court-form-count" min="1" max="999" value="' + _safe(existing ? existing.count : '1') + '" style="display:block;width:100%;margin-top:4px;padding:10px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-size:1rem;">' +
        '</label>' +
        '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:6px;">Modalidades (toque para selecionar; múltiplas = quadra compartilhada)</div>' +
        '<div id="court-form-sports" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">' +
          sportPills +
        '</div>' +
        '<div style="display:flex;gap:6px;justify-content:flex-end;">' +
          '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'courts-form-slot\').innerHTML=\'\'">Cancelar</button>' +
          '<button class="btn btn-primary btn-sm" onclick=\'window._courtsFormSave(' + (existing ? '"' + _safe(existing._id).replace(/\\/g, '\\\\').replace(/\'/g, "\\'") + '"' : 'null') + ')\'>💾 ' + (existing ? 'Salvar alterações' : 'Adicionar') + '</button>' +
        '</div>' +
      '</div>';
  };

  window._courtsFormSave = async function(courtId) {
    var venueKey = _courtsDialogState.venueKey;
    if (!venueKey) return;
    var count = parseInt((document.getElementById('court-form-count') || {}).value, 10) || 1;
    var sports = [];
    document.querySelectorAll('#court-form-sports .court-form-sport-pill[data-active="1"]').forEach(function(btn) {
      sports.push(btn.dataset.sport);
    });
    if (sports.length === 0) {
      if (window.showNotification) window.showNotification('Marque ao menos uma modalidade', '', 'warning');
      return;
    }
    try {
      if (courtId) {
        await window.VenueDB.updateVenueCourt(venueKey, courtId, { count: count, sports: sports });
      } else {
        await window.VenueDB.addVenueCourt(venueKey, { count: count, sports: sports });
      }
      // Collapse the form, refresh the list.
      var slot = document.getElementById('courts-form-slot');
      if (slot) slot.innerHTML = '';
      _courtsDialogState.editingId = null;
      _refreshCourtsScreenList(venueKey);
      if (window.showNotification) window.showNotification(courtId ? 'Entrada atualizada!' : 'Quadras adicionadas!', '', 'success');
    } catch (e) {
      window._error('courts form save:', e);
      if (window.showNotification) window.showNotification('Erro ao salvar: ' + (e && e.message || ''), '', 'error');
    }
  };

  async function _refreshCourtsScreenList(venueKey) {
    var box = document.getElementById('courts-list-slot');
    if (!box || !window.VenueDB) return;
    try {
      var courts = await window.VenueDB.listVenueCourts(venueKey);
      var venue = await window.VenueDB.loadVenue(venueKey).catch(function() { return null; });
      if (!courts || courts.length === 0) {
        box.innerHTML = '<div style="font-size:0.82rem;color:var(--text-muted);padding:14px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;text-align:center;">Nenhuma quadra cadastrada ainda. Toque no ➕ acima pra adicionar.</div>';
        return;
      }
      var cu = window.AppStore && window.AppStore.currentUser;
      var myUid = cu && cu.uid;
      var hasOwner = !!(venue && venue.ownerUid);
      var imOwner = hasOwner && venue.ownerUid === myUid;

      var safeKey = _safe(venueKey).replace(/\\/g, '\\\\').replace(/\'/g, "\\'");
      var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
      courts.forEach(function(c) {
        var canEdit = hasOwner ? imOwner : (c.contributorUid === myUid);
        var sportList = Array.isArray(c.sports) ? c.sports : [];
        var sportsText = sportList.map(function(s) { return _sportIconFor(s) + ' ' + _safe(s); }).join(' + ');
        var sharedTag = sportList.length > 1 ? '<span style="font-size:0.64rem;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;padding:2px 6px;border-radius:999px;margin-left:6px;">compartilhada</span>' : '';
        var safeId = _safe(c._id).replace(/\\/g, '\\\\').replace(/\'/g, "\\'");
        html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:700;color:var(--text-bright);font-size:0.9rem;">' + (c.count || 1) + ' quadra' + ((c.count || 1) === 1 ? '' : 's') + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-main);margin-top:2px;">' + sportsText + sharedTag + '</div>' +
            (c.contributorName ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">por ' + _safe(c.contributorName) + '</div>' : '') +
          '</div>' +
          (canEdit
            ? '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                '<button class="btn btn-sm" onclick="window._courtsToggleForm(' + JSON.stringify(c).replace(/'/g, '&#39;').replace(/"/g, '&quot;') + ')" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;padding:4px 10px;font-size:0.72rem;">Editar</button>' +
                '<button class="btn btn-sm" onclick="window._venueCourtDelete(\'' + safeKey + '\',\'' + safeId + '\')" style="background:transparent;border:1px solid var(--danger-color);color:var(--danger-color);padding:4px 10px;font-size:0.72rem;">✕</button>' +
              '</div>'
            : '') +
        '</div>';
      });
      html += '</div>';
      box.innerHTML = html;
    } catch (e) {
      window._warn('courts screen refresh:', e);
      box.innerHTML = '<div style="font-size:0.8rem;color:var(--danger-color);padding:10px;">Erro ao carregar quadras.</div>';
    }
  }

  window._venueCourtDelete = async function(venueKey, courtId) {
    if (!confirm('Apagar esta entrada de quadra?')) return;
    try {
      await window.VenueDB.deleteVenueCourt(venueKey, courtId);
      if (document.getElementById('courts-list-slot')) {
        _refreshCourtsScreenList(venueKey);
      }
      if (window.showNotification) window.showNotification('Entrada removida.', '', 'info');
    } catch (e) {
      if (window.showNotification) window.showNotification('Erro ao apagar.', '', 'error');
    }
  };

  window._venueOwnerCancel = function() {
    var wrap = document.getElementById('venue-owner-form-wrap');
    if (wrap) wrap.innerHTML = '';
    var search = document.getElementById('venue-owner-search');
    if (search) search.value = '';
    // Remove o pin vermelho do venue selecionado — o mapa volta a mostrar só
    // os cadastrados + eventuais sugestões Google.
    if (_selectedPinMarker) { _selectedPinMarker.map = null; _selectedPinMarker = null; }
  };

  window._venueOwnerSubmit = async function(place) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) return;
    // Pro inheritance: venues owned by a Pro user rank higher in discovery.
    var isUserPro = (typeof window._isPro === 'function' && window._isPro()) ||
                    (cu.plan === 'pro' && (!cu.planExpiresAt || new Date(cu.planExpiresAt) > new Date()));
    var claimBtn = document.getElementById('venue-owner-claim-btn');
    var claimAsOwner = !!(claimBtn && claimBtn.getAttribute('data-claimed') === '1');
    var accessPolicyEl = document.getElementById('venue-owner-access');
    var hoursGrid = _readHoursGrid();

    var payload = {
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      city: place.city || '',
      lat: place.lat,
      lon: place.lon,
      accessPolicy: (accessPolicyEl && accessPolicyEl.value) || 'public',
      // New shape: store the 7×24 grid. Keep in a nested object so it's easy
      // to add future fields (timezone, seasonal overrides) without churning
      // the top level.
      openingHours: _gridAny(hoursGrid) ? { grid: _flattenGrid(hoursGrid) } : null,
      contact: {
        phone: (document.getElementById('venue-owner-phone') || {}).value.trim() || '',
        whatsapp: (document.getElementById('venue-owner-whatsapp') || {}).value.trim() || '',
        instagram: (document.getElementById('venue-owner-insta') || {}).value.trim() || '',
        facebook: (document.getElementById('venue-owner-facebook') || {}).value.trim() || '',
        website: (document.getElementById('venue-owner-website') || {}).value.trim() || '',
        email: (document.getElementById('venue-owner-email') || {}).value.trim() || ''
      },
      plan: (claimAsOwner && isUserPro) ? 'pro' : 'free',
      claimAsOwner: claimAsOwner
    };
    try {
      await window.VenueDB.saveVenue(place.placeId, payload);
      if (window.showNotification) {
        var msg = claimAsOwner
          ? 'Jogadores que buscam sua modalidade poderão encontrar você.'
          : 'Obrigado por contribuir! Se você é o proprietário, marque a opção de proprietário na próxima edição.';
        var title = claimAsOwner ? 'Local reivindicado ✅' : 'Local cadastrado 🙌';
        window.showNotification(title, msg, 'success');
      }
      window._venueOwnerCancel();
      window._loadMyVenuesList();
    } catch (e) {
      if (String(e.message).indexOf('venue-já-reivindicado') !== -1) {
        if (window.showNotification) window.showNotification('Este local já tem um proprietário formal.', 'Escreva para scoreplace.app@gmail.com se você é o verdadeiro dono.', 'error');
      } else {
        window._error(e);
        if (window.showNotification) window.showNotification('Erro ao salvar local.', String(e.message || e), 'error');
      }
    }
  };

  // Saves the current venue (if not yet persisted) then opens the courts screen.
  window._venueSaveAndOpenCourts = async function() {
    var place = _currentEditingPlace;
    if (!place || !place.placeId) {
      if (window.showNotification) window.showNotification('Selecione um local antes de cadastrar quadras.', '', 'warning');
      return;
    }
    // Check if it already exists — if so, skip save and go straight to courts.
    var existing = await window.VenueDB.loadVenue(place.placeId).catch(function() { return null; });
    if (!existing) {
      // Save silently first (no redirect/cancel — just persist).
      var cu = window.AppStore && window.AppStore.currentUser;
      var isUserPro = (typeof window._isPro === 'function' && window._isPro()) ||
                      (cu && cu.plan === 'pro' && (!cu.planExpiresAt || new Date(cu.planExpiresAt) > new Date()));
      var claimBtn = document.getElementById('venue-owner-claim-btn');
      var claimAsOwner = !!(claimBtn && claimBtn.getAttribute('data-claimed') === '1');
      var accessPolicyEl = document.getElementById('venue-owner-access');
      var hoursGrid = _readHoursGrid();
      var payload = {
        placeId: place.placeId, name: place.name, address: place.address,
        city: place.city || '', lat: place.lat, lon: place.lon,
        accessPolicy: (accessPolicyEl && accessPolicyEl.value) || 'public',
        openingHours: _gridAny(hoursGrid) ? { grid: _flattenGrid(hoursGrid) } : null,
        plan: (claimAsOwner && isUserPro) ? 'pro' : 'free',
        // BUG FIX (v0.16.17): era `claimAsOwner: true` hardcoded — qualquer
        // usuário que clicava "Cadastrar quadras" antes de salvar virava dono
        // automático (venue ficava "✅ oficial"), mesmo sem ter tocado o botão
        // "Reivindicar como proprietário". Agora respeita a escolha real do
        // usuário via data-claimed do botão (mesma leitura que _venueOwnerSubmit).
        claimAsOwner: claimAsOwner
      };
      try {
        await window.VenueDB.saveVenue(place.placeId, payload);
      } catch (e) {
        if (window.showNotification) window.showNotification('Erro ao salvar local.', String(e.message || e), 'error');
        return;
      }
    }
    window._venueCourtAddDialog(place.placeId);
  };

  window._loadMyVenuesList = async function() {
    var box = document.getElementById('venue-owner-list');
    if (!box || !window.VenueDB) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) { box.innerHTML = ''; return; }
    var list = await window.VenueDB.loadMyVenues(cu.uid);
    if (list.length === 0) { box.innerHTML = ''; return; }
    var html = '<div style="font-size:0.78rem;color:var(--text-muted);margin:8px 0 8px 0;font-weight:600;letter-spacing:0.02em;">Locais cadastrados</div>';
    list.forEach(function(v) {
      var sportsText = (v.sports && v.sports.length) ? v.sports.join(' · ') : '';
      var safePid = _safe(v.placeId);
      // Botão lixeira só pro dono OU criador — alinha com a permissão do
      // deleteVenue em venue-db.js. event.stopPropagation pra não disparar
      // o abrir-edição do wrapper clicável.
      var canDelete = !!(cu && cu.uid && (v.ownerUid === cu.uid || v.createdByUid === cu.uid));
      var deleteBtn = canDelete
        ? '<button onclick="event.stopPropagation(); window._venueOwnerDelete(\'' + safePid + '\')" title="Apagar local" style="border:none;background:transparent;color:#ef4444;cursor:pointer;padding:4px 8px;border-radius:6px;font-size:1rem;line-height:1;" onmouseover="this.style.background=\'rgba(239,68,68,0.12)\'" onmouseout="this.style.background=\'transparent\'">🗑️</button>'
        : '';
      html += '<div class="hover-lift" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;background:var(--bg-darker);border:1px solid var(--border-color);border-radius:12px;margin-bottom:8px;">' +
        '<div onclick="window._venueOwnerEditExisting(\'' + safePid + '\')" style="flex:1;min-width:0;cursor:pointer;">' +
          '<div style="font-weight:600;color:var(--text-bright);font-size:0.9rem;margin-bottom:2px;">' + _safe(v.name) + '</div>' +
          (sportsText ? '<div style="font-size:0.75rem;color:var(--text-muted);">' + _safe(sportsText) + '</div>' : '') +
        '</div>' +
        deleteBtn +
      '</div>';
    });
    box.innerHTML = html;
  };

  window._venueOwnerEditExisting = async function(placeId, opts) {
    opts = opts || {};
    var v = await window.VenueDB.loadVenue(placeId);
    if (!v) return;
    // Defense-in-depth: public-access venues (beaches, praças, parques) são
    // de domínio público e não podem ter dono reivindicado. UI já esconde o
    // botão "Reivindicar" em venues.js, mas alguém chamando esta função
    // direto (via console/URL handoff) ainda cairia aqui — bloqueia e avisa.
    // Donos existentes passam (edição de venue próprio é sempre permitida).
    // v1.1.9-beta: opts.skipPublicGuard=true vindo do botão Editar bypassa
    // o guard — Editar é correção comunitária, não reivindicação. Reivindicar
    // continua sem opts (guard fires pra public).
    var cu = window.AppStore && window.AppStore.currentUser;
    var isOwnerAlready = !!(cu && cu.uid && v.ownerUid === cu.uid);
    var effectivePolicy = v.accessPolicy || 'public';
    if (!opts.skipPublicGuard && !isOwnerAlready && effectivePolicy === 'public') {
      if (window.showAlertDialog) {
        window.showAlertDialog(
          'Local público — sem dono',
          'Quadras públicas (praias, praças, parques) são de domínio público e não podem ter proprietário declarado. Use o botão ✏️ Editar na página do local para sugerir correções comunitárias.',
          'info'
        );
      }
      return;
    }
    _renderForm({
      placeId: v.placeId, name: v.name, address: v.address, city: v.city, lat: v.lat, lon: v.lon
    }, { existing: v });
    var form = document.getElementById('venue-owner-form-wrap');
    if (form) form.scrollIntoView({ block: 'center' });
  };

  // Apaga o venue em definitivo — só quem é dono ou criador pode chamar
  // (VenueDB.deleteVenue valida o myUid antes do delete). Presenças/torneios
  // que referenciavam o placeId ficam com referência pendurada mas a UI
  // degrada graciosamente (cai no fallback "sem ficha cadastrada"). Dupla
  // confirmação por ser operação destrutiva sem undo.
  window._venueOwnerDelete = async function(placeId) {
    if (typeof window.showConfirmDialog !== 'function') return;
    // v0.16.22: re-valida permissão com doc FRESH antes de abrir o diálogo.
    // Se a UI mostrou o botão com base em dados stale (cache, race), evita
    // frustração de "confirmar → erro de permissão". Caso realmente não tenha
    // permissão, atualiza a lista (o botão some no próximo render) e apenas
    // avisa o usuário sem mostrar o fluxo destrutivo.
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;
    if (!myUid) {
      if (window.showNotification) window.showNotification('Sessão ausente.', 'Entre novamente para apagar locais.', 'warning');
      return;
    }
    try {
      var fresh = await window.VenueDB.loadVenue(placeId);
      if (!fresh) {
        // Já sumiu — só atualiza a lista.
        if (typeof window._loadMyVenuesList === 'function') window._loadMyVenuesList();
        return;
      }
      var imOwner = fresh.ownerUid && fresh.ownerUid === myUid;
      var imCreator = fresh.createdByUid && fresh.createdByUid === myUid;
      if (!imOwner && !imCreator) {
        if (window.showNotification) window.showNotification('Sem permissão.', 'Só o dono ou o criador do cadastro pode apagar. Atualizando a lista.', 'warning');
        if (typeof window._loadMyVenuesList === 'function') window._loadMyVenuesList();
        return;
      }
    } catch (e) {
      // Falha de leitura — deixa a transação do delete tratar. Não bloqueia
      // o fluxo destrutivo por um erro transitório de rede.
      window._warn('[venue-delete] pre-check failed:', e && e.message);
    }
    window.showConfirmDialog(
      '🗑️ Apagar este local?',
      'Esta ação é permanente. O cadastro do local será removido do scoreplace — presenças/torneios que o referenciavam continuarão existindo mas sem ficha cadastrada. Você poderá recadastrar depois se quiser.',
      function() {
        // Segunda confirmação pra dar mais uma chance de voltar atrás
        window.showConfirmDialog(
          'Tem certeza?',
          'Não há como desfazer.',
          function() {
            window.VenueDB.deleteVenue(placeId).then(function(ok) {
              if (ok) {
                if (window.showNotification) window.showNotification('Local apagado.', '', 'success');
                // Fecha o form se estiver aberto e recarrega a lista
                if (typeof window._venueOwnerCancel === 'function') window._venueOwnerCancel();
                window._loadMyVenuesList();
                // Se tiver um marker ativo no mapa, limpa
                if (window._selectedPinMarker) {
                  try { window._selectedPinMarker.setMap(null); } catch (e) {}
                  window._selectedPinMarker = null;
                }
              }
            }).catch(function(e) {
              var msg = String(e && e.message || e);
              if (msg.indexOf('sem-permissão') !== -1) {
                if (window.showNotification) window.showNotification('Sem permissão.', 'Só o dono ou o criador do cadastro pode apagar. Atualizando a lista.', 'error');
                // Atualiza a lista — se a permissão realmente mudou, o botão some no re-render
                if (typeof window._loadMyVenuesList === 'function') window._loadMyVenuesList();
              } else {
                if (window.showNotification) window.showNotification('Erro ao apagar.', msg, 'error');
              }
            });
          }, null, { confirmText: 'Apagar definitivamente', cancelText: 'Voltar', type: 'danger' }
        );
      }, null, { confirmText: 'Apagar', cancelText: 'Cancelar', type: 'danger' }
    );
  };
})();
