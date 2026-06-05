// ========================================
// scoreplace.app — Presence Database Module
// ========================================
// CRUD for the `presences` collection.
// A presence = "I'm at (or will be at) venue X playing sport Y on day Z".
//
// Data model per presence doc:
//   uid, email_lower, displayName, photoURL
//   placeId        — Google Places place_id OR 'custom:<slug>' for free-typed venues
//   venueName, venueLat, venueLon (optional)
//   sport          — normalized sport name (no emoji prefix)
//   type           — 'checkin' | 'planned'
//   startsAt       — ms since epoch (checkin: now; planned: user-chosen)
//   endsAt         — ms since epoch (checkin: now + 4h; planned: user-chosen)
//   dayKey         — 'YYYY-MM-DD' in local TZ of startsAt (for cheap queries)
//   visibility     — 'friends' | 'public'
//   cancelled      — boolean (soft delete; queries filter it out)
//   createdAt      — ms since epoch
//
// Queries are composite: (placeId, sport, dayKey). Firestore auto-suggests the
// index link on first run.

window.PresenceDB = {
  get db() { return window.FirestoreDB && window.FirestoreDB.db; },

  CHECKIN_WINDOW_MS: 4 * 60 * 60 * 1000, // 4 hours

  // Format a Date as local YYYY-MM-DD.
  dayKey(date) {
    var d = date || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  },

  // Normalize a sport label: strip leading emojis / punctuation so stored
  // values match across UIs. "🎾 Beach Tennis" -> "Beach Tennis".
  normalizeSport(s) {
    if (!s) return '';
    return String(s).replace(/^[^\w\u00C0-\u024F]+/u, '').trim();
  },

  // Produce a stable venue key — Google placeId if available, otherwise a
  // slugged version of the free-typed venue name. Guarantees users typing
  // "Clube X" and "clube x" land on the same bucket.
  venueKey(placeId, venueName) {
    if (placeId && String(placeId).trim()) return String(placeId).trim();
    var slug = String(venueName || '').trim().toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    return slug ? 'custom:' + slug : '';
  },

  // In-flight registry: logical-key → Promise. Qualquer chamada concorrente
  // com a mesma chave lógica (uid+placeId+type+sports+janela) reusa o
  // Promise já em voo em vez de disparar outro add(). Fix síncrono pro race
  // "query → add" que o dedup puro via Firestore query sozinho não cobre —
  // duas chamadas simultâneas ambas consultavam antes de qualquer add()
  // completar, ambas viam "não tem", ambas inseriam.
  _inflight: {},

  _makeInflightKey(clean) {
    var sports = Array.isArray(clean.sports) ? clean.sports.slice().sort() : [];
    var win = '';
    if (clean.type === 'planned') {
      // Bucket por janela aproximada pra capturar double-confirm do mesmo plano.
      var s = Math.floor((clean.startsAt || 0) / 60000);
      var e = Math.floor((clean.endsAt || 0) / 60000);
      win = ':' + s + '-' + e;
    }
    return [clean.uid || '', clean.placeId || '', clean.type || '', sports.join(','), win].join('|');
  },

  // Create a check-in (now → now + window) or planned presence.
  // Dedup em duas camadas:
  //   1. In-flight registry síncrono (bloqueia concorrência antes do Firestore)
  //   2. Query Firestore por presenças ativas equivalentes (bloqueia chamadas
  //      sequenciais que chegam depois da primeira commitar)
  // Isso protege TODOS os caminhos (presence.js, venues.js, presence-geo.js)
  // contra double-tap, multi-tab, multi-codepath.
  savePresence(data) {
    if (!this.db) return Promise.reject(new Error('Firestore not initialized'));
    var self = this;
    var clean = window.FirestoreDB._cleanUndefined(data);
    clean.createdAt = clean.createdAt || Date.now();
    if (!clean.dayKey) clean.dayKey = this.dayKey(new Date(clean.startsAt || Date.now()));

    var key = this._makeInflightKey(clean);
    if (key && this._inflight[key]) {
      window._log('[PresenceDB] dedup in-flight: reusando promise para', key);
      return this._inflight[key];
    }

    var p = (async function() {
      if (clean.uid && clean.placeId && clean.type) {
        try {
          var now = Date.now();
          // v0.16.79: REMOVIDO where('endsAt', '>', now) — composto exigia
          // índice (uid, endsAt) que pode não existir. Mesmo bug fixado em
          // loadMyActive nesta versão e em loadForFriends na v0.16.47.
          // Filtro de endsAt agora é client-side junto com os outros filtros.
          var snap = await self.db.collection('presences')
            .where('uid', '==', clean.uid)
            .get();
          var reqSports = Array.isArray(clean.sports) ? clean.sports : [];
          var existingId = null;
          snap.forEach(function(doc) {
            if (existingId) return;
            var d = doc.data();
            if (!d || d.cancelled) return;
            if (!d.endsAt || d.endsAt <= now) return;  // só dedup contra docs ainda ativos
            if (d.type !== clean.type) return;
            if (d.placeId !== clean.placeId) return;
            var dSports = Array.isArray(d.sports) ? d.sports : (d.sport ? [d.sport] : []);
            if (reqSports.length === 0 || dSports.length === 0) {
              if (reqSports.length !== dSports.length) return;
            } else {
              var overlap = dSports.some(function(s) { return reqSports.indexOf(s) !== -1; });
              if (!overlap) return;
            }
            if (clean.type === 'planned') {
              var reqStart = clean.startsAt || 0;
              var reqEnd = clean.endsAt || reqStart;
              var dStart = d.startsAt || 0;
              var dEnd = d.endsAt || (dStart + 12 * 3600 * 1000);
              if (!(reqStart < dEnd && reqEnd > dStart)) return;
            }
            existingId = doc.id;
          });
          if (existingId) {
            window._log('[PresenceDB] dedup firestore: presença existente', existingId);
            return existingId;
          }
        } catch (e) {
          window._warn('[PresenceDB] dedup query falhou, seguindo com add:', e);
        }
      }
      var ref = await self.db.collection('presences').add(clean);
      // v1.0.59-beta: GA4 — presence_checkin event. Source distingue manual
      // (UI click) de auto_gps (presence-geo.js). type: checkin|planned.
      try {
        if (typeof window._trackPresenceCheckin === 'function') {
          var src = clean.source || (clean.autoGps ? 'auto_gps' : 'manual');
          var sportsCount = Array.isArray(clean.sports) ? clean.sports.length : (clean.sport ? 1 : 0);
          window._track && window._track('presence_' + (clean.type === 'planned' ? 'planned' : 'checkin'), {
            source: src,
            sports_count: sportsCount
          });
        }
      } catch (_e) {}
      return ref.id;
    })();

    if (key) {
      this._inflight[key] = p;
      p.finally(function() { delete self._inflight[key]; });
    }
    return p;
  },

  // Update own presence in place (edição de um plano/check-in existente).
  // v2.1.8: usado ao EDITAR um "planejar ida" — atualiza o doc direto em vez de
  // criar um novo via savePresence (cujo dedup devolvia o doc antigo sem gravar
  // as alterações, fazendo a edição se perder). Só campos seguros são tocados.
  async updatePresence(docId, partial) {
    if (!this.db || !docId || !partial) return false;
    var ALLOWED = ['sports', 'startsAt', 'endsAt', 'openEnded', 'dayKey',
      'venueName', 'venueLat', 'venueLon', 'visibility', 'type'];
    var patch = {};
    ALLOWED.forEach(function(k) { if (partial[k] !== undefined) patch[k] = partial[k]; });
    patch.cancelled = false;       // garante que continua ativo após editar
    patch.updatedAt = Date.now();
    try {
      var clean = window.FirestoreDB._cleanUndefined(patch);
      await this.db.collection('presences').doc(docId).update(clean);
      return true;
    } catch (e) {
      window._error('Erro ao editar presença:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'updatePresence', code: e && e.code });
      }
      return false;
    }
  },

  // Soft-cancel own presence.
  async cancelPresence(docId) {
    if (!this.db || !docId) return false;
    try {
      await this.db.collection('presences').doc(docId).update({ cancelled: true, cancelledAt: Date.now() });
      return true;
    } catch (e) {
      window._error('Erro ao cancelar presença:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'cancelPresence', code: e && e.code });
      }
      return false;
    }
  },

  // Load all presences for a given venue + sport on a given local day.
  // Matches on the multi-sport `sports[]` array (uma presença pode cobrir
  // várias modalidades) via array-contains. Visibility/friend filtering é
  // responsabilidade do caller.
  async loadForVenueSportDay(placeId, sport, dayKey) {
    if (!this.db || !placeId || !sport || !dayKey) return [];
    var normSport = this.normalizeSport(sport);
    try {
      var snap = await this.db.collection('presences')
        .where('placeId', '==', placeId)
        .where('sports', 'array-contains', normSport)
        .where('dayKey', '==', dayKey)
        .get();
      var list = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (d && !d.cancelled) {
          d._id = doc.id;
          list.push(d);
        }
      });
      return list;
    } catch (e) {
      window._error('Erro ao carregar presenças:', e);
      return [];
    }
  },

  // Load ALL presences at a venue on a given day — across every sport.
  // Used by the venue detail modal to show total movement without the user
  // having to pick a modality first. Requires composite index (placeId asc,
  // dayKey asc); Firestore will surface a one-click creation link on the
  // first query if it's missing.
  async loadForVenueDay(placeId, dayKey) {
    if (!this.db || !placeId || !dayKey) return [];
    try {
      var snap = await this.db.collection('presences')
        .where('placeId', '==', placeId)
        .where('dayKey', '==', dayKey)
        .get();
      var list = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (d && !d.cancelled) {
          d._id = doc.id;
          list.push(d);
        }
      });
      return list;
    } catch (e) {
      window._error('Erro ao carregar presenças do venue:', e);
      return [];
    }
  },

  // Load a single user's own active presences (check-in still running OR any
  // planned presence in the future). Used by dashboard to show "you're checked
  // in at X" and by the presence view to avoid duplicate check-ins.
  async loadMyActive(uid) {
    if (!this.db || !uid) {
      window._log('[loadMyActive v0.16.79] short-circuit: hasDb=' + !!this.db + ' uid=' + uid);
      return [];
    }
    try {
      var now = Date.now();
      // v0.16.79: REMOVIDO o `.where('endsAt', '>', now)`. Combinar dois
      // where (uid igualdade + endsAt inequality) exige índice composto
      // (uid asc, endsAt asc) que pode não existir — query falha silenciosa
      // e o catch retorna []. EXATO mesmo bug que afetou loadForFriends na
      // v0.16.47, sintoma "Nelson vê seu plano em Rodrigo (via loadForFriends
      // single-field) mas não vê em si mesmo (via loadMyActive composto)".
      // Filtro endsAt + cancelled agora é client-side em loop simples, custo
      // extra desprezível (poucos docs por uid em prática).
      var snap = await this.db.collection('presences')
        .where('uid', '==', uid)
        .get();
      var list = [];
      var droppedCancelled = 0, droppedExpired = 0, totalRaw = 0;
      snap.forEach(function(doc) {
        totalRaw++;
        var d = doc.data();
        if (!d || d.cancelled) { droppedCancelled++; return; }
        if (!d.endsAt || d.endsAt <= now) { droppedExpired++; return; }
        d._id = doc.id;
        list.push(d);
      });
      window._log('[loadMyActive v0.16.79]', {
        uid: String(uid).substring(0, 12) + '…',
        totalRaw: totalRaw,
        droppedCancelled: droppedCancelled,
        droppedExpired: droppedExpired,
        kept: list.length,
        sample: list[0] ? {
          type: list[0].type,
          venueName: list[0].venueName,
          placeId: list[0].placeId ? String(list[0].placeId).substring(0, 20) + '…' : '(empty)',
          startsAt: list[0].startsAt ? new Date(list[0].startsAt).toLocaleString('pt-BR') : 'N/A',
          endsAt: list[0].endsAt ? new Date(list[0].endsAt).toLocaleString('pt-BR') : 'N/A'
        } : null
      });
      return list;
    } catch (e) {
      window._error('[loadMyActive v0.16.79] erro:', e);
      // permission-denied = sessão expirada ou bot não autenticado — caminho
      // esperado, não vale ruído no Sentry.
      if (typeof window._captureException === 'function' &&
          (!e || e.code !== 'permission-denied')) {
        window._captureException(e, { area: 'loadMyActive', code: e && e.code });
      }
      return [];
    }
  },

  // Load presences from a set of uids (friends feed). Chunked in groups of 10
  // to stay within Firestore's `in` operator limit. Filters to currently-active
  // or upcoming presences within the next 48h.
  async loadForFriends(uids, windowMs) {
    if (!this.db || !Array.isArray(uids) || uids.length === 0) {
      window._log('[loadForFriends v0.16.47] short-circuit:', { hasDb: !!this.db, uidsLen: (uids||[]).length });
      return [];
    }
    var win = windowMs || (48 * 60 * 60 * 1000);
    var now = Date.now();
    var horizon = now + win;
    var chunks = [];
    for (var i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));
    var all = [];
    var droppedCancelled = 0, droppedExpired = 0, droppedHorizon = 0, totalRaw = 0;
    // v0.16.47: removido o `.where('endsAt', '>', now)` — combinação `in` +
    // inequality exigia índice composto (uid, endsAt) que não existia, a
    // query falhava silenciosamente e o try/catch retornava [] sem nenhum
    // sinal de erro. Filtro de tempo agora é client-side — custo extra é
    // desprezível (poucos docs por uid em prática) e elimina dependência
    // de índice externo. Confirmado pelo diag v0.16.46 que docs ativos
    // existiam mas a query principal devolvia 0.
    try {
      for (var c = 0; c < chunks.length; c++) {
        var snap = await this.db.collection('presences')
          .where('uid', 'in', chunks[c])
          .get();
        snap.forEach(function(doc) {
          totalRaw++;
          var d = doc.data();
          if (!d || d.cancelled) { droppedCancelled++; return; }
          if (!d.endsAt || d.endsAt <= now) { droppedExpired++; return; }
          if (d.startsAt && d.startsAt > horizon) { droppedHorizon++; return; }
          d._id = doc.id;
          all.push(d);
        });
      }
      window._log('[loadForFriends v0.16.47]', {
        uidsCount: uids.length,
        chunksCount: chunks.length,
        totalRaw: totalRaw,
        droppedCancelled: droppedCancelled,
        droppedExpired: droppedExpired,
        droppedHorizon: droppedHorizon,
        kept: all.length,
        sample: all[0] ? { uid: all[0].uid, type: all[0].type, venueName: all[0].venueName, startsAt: new Date(all[0].startsAt).toLocaleString() } : null
      });
      return all;
    } catch (e) {
      window._error('[loadForFriends v0.16.47] erro:', e);
      return [];
    }
  },

  // v0.17.4: real-time listeners — substituem o polling de 60s no dashboard.
  // Pedido do usuário: "sempre que um amigo fizer alguma alteração nesse
  // estado isso deve imediatamente refletir para ele e para seus amigos."
  // Mesmo padrão de query do loadMyActive/loadForFriends (single-field +
  // filter client-side pra evitar índice composto). Retorna função de
  // unsubscribe — caller deve chamar quando view sai do DOM.

  listenMyActive: function(uid, callback) {
    if (!this.db || !uid || typeof callback !== 'function') return function() {};
    var unsub = this.db.collection('presences')
      .where('uid', '==', uid)
      .onSnapshot(function(snap) {
        var now = Date.now();
        var list = [];
        snap.forEach(function(doc) {
          var d = doc.data();
          if (!d || d.cancelled) return;
          if (!d.endsAt || d.endsAt <= now) return;
          d._id = doc.id;
          list.push(d);
        });
        try { callback(list); } catch (e) { window._error('[listenMyActive cb]', e); }
      }, function(err) {
        window._error('[listenMyActive] err:', err);
      });
    return unsub;
  },

  listenForFriends: function(uids, callback, windowMs) {
    if (!this.db || !Array.isArray(uids) || uids.length === 0 || typeof callback !== 'function') {
      return function() {};
    }
    var win = windowMs || (48 * 60 * 60 * 1000);
    var chunks = [];
    for (var i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));
    var perChunk = chunks.map(function() { return []; });
    var unsubs = [];
    var emit = function() {
      var now = Date.now();
      var horizon = now + win;
      var all = [];
      perChunk.forEach(function(arr) {
        arr.forEach(function(d) {
          if (d.cancelled) return;
          if (!d.endsAt || d.endsAt <= now) return;
          if (d.startsAt && d.startsAt > horizon) return;
          all.push(d);
        });
      });
      try { callback(all); } catch (e) { window._error('[listenForFriends cb]', e); }
    };
    var self = this;
    chunks.forEach(function(chunk, idx) {
      var u = self.db.collection('presences')
        .where('uid', 'in', chunk)
        .onSnapshot(function(snap) {
          var arr = [];
          snap.forEach(function(doc) {
            var d = doc.data();
            d._id = doc.id;
            arr.push(d);
          });
          perChunk[idx] = arr;
          emit();
        }, function(err) {
          window._error('[listenForFriends chunk', idx, '] err:', err);
        });
      unsubs.push(u);
    });
    return function() { unsubs.forEach(function(u) { try { u(); } catch (e) {} }); };
  }
};
