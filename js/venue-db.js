// ========================================
// scoreplace.app — Venue Database Module
// ========================================
// CRUD for the `venues` collection. A venue represents a physical place
// where people play — gym, clube, quadra, etc. Can be:
//   - Claimed: ownerUid set → the proprietor manages the listing.
//   - Community: no ownerUid → just a reference (tournament venues that
//     nobody has claimed yet). Not created via this module in B1.
//
// Doc id = stable venue key:
//   - If Google Places placeId, use it directly.
//   - Else a slug 'custom:<slug>' — same scheme PresenceDB.venueKey uses,
//     so a venue and its presences share the same key.
//
// Schema:
//   placeId, name, address, city, lat, lon
//   sports: [string]           — normalized sport labels offered
//   courtCount: number         — how many courts/tables
//   courtType: string          — e.g. "areia + coberta"
//   priceRange: '$'|'$$'|'$$$' — rough hourly rate bucket
//   hours: string              — free-text schedule (structured later)
//   contact: { phone, whatsapp, email, instagram }
//   description: string        — short pitch
//   ownerUid, ownerEmail       — claim fields
//   verified: boolean          — admin-gated (manual for now)
//   plan: 'free' | 'pro'
//   createdAt, updatedAt, claimedAt

window.VenueDB = {
  get db() { return window.FirestoreDB && window.FirestoreDB.db; },

  // Reuse the presence venueKey helper so the two collections share IDs.
  venueKey: function(placeId, name) {
    if (window.PresenceDB && typeof window.PresenceDB.venueKey === 'function') {
      return window.PresenceDB.venueKey(placeId, name);
    }
    if (placeId) return String(placeId).trim();
    var slug = String(name || '').trim().toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F]+/gu, '-').replace(/^-+|-+$/g, '');
    return slug ? 'custom:' + slug : '';
  },

  async loadVenue(key) {
    if (!this.db || !key) return null;
    try {
      var doc = await this.db.collection('venues').doc(key).get();
      return doc.exists ? Object.assign({}, doc.data(), { _id: doc.id }) : null;
    } catch (e) {
      window._error('Erro ao carregar venue:', e);
      return null;
    }
  },

  // Save a venue. Any authenticated user may create or update; the caller
  // decides if they're also claiming ownership (via data.claimAsOwner).
  // Transaction prevents two people racing the same placeId.
  //
  // Ownership rules:
  //   - If doc has ownerUid === me, I can update anything.
  //   - If doc has ownerUid !== me (someone else owns it), block.
  //   - If ownerUid is null/missing and I pass claimAsOwner=true, I claim it.
  //   - Otherwise the doc stays "community": only createdByUid/Name set.
  async saveVenue(key, data) {
    if (!this.db || !key) throw new Error('key obrigatória');
    var self = this;
    var ref = this.db.collection('venues').doc(key);
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;
    var myName = (cu && cu.displayName) || (cu && cu.email) || '';
    return this.db.runTransaction(async function(tx) {
      var doc = await tx.get(ref);
      var now = Date.now();
      var base = doc.exists ? doc.data() : {};
      // Bloqueia alteração se já tem outro dono formal.
      if (base.ownerUid && base.ownerUid !== myUid) {
        throw new Error('venue-já-reivindicado');
      }
      var nextOwnerUid = base.ownerUid || null;
      var nextOwnerEmail = base.ownerEmail || null;
      var claimedAt = base.claimedAt || null;
      if (data.claimAsOwner && myUid) {
        nextOwnerUid = myUid;
        nextOwnerEmail = (cu.email || '').toLowerCase();
        claimedAt = claimedAt || now;
      }
      // Limpa o sentinel — não vai para o Firestore.
      var payload = Object.assign({}, data);
      delete payload.claimAsOwner;
      var merged = Object.assign({}, base, payload, {
        placeId: key,
        ownerUid: nextOwnerUid,
        ownerEmail: nextOwnerEmail,
        claimedAt: claimedAt,
        createdByUid: base.createdByUid || myUid || null,
        createdByName: base.createdByName || myName || '',
        updatedAt: now,
        createdAt: base.createdAt || now,
        plan: base.plan || 'free',
        verified: base.verified || false
      });
      var clean = window.FirestoreDB._cleanUndefined(merged);
      tx.set(ref, clean, { merge: true });
      return clean;
    });
  },

  // Retrocompat: claimVenue continua funcionando para chamadas legadas.
  // Apenas delega pro saveVenue marcando claimAsOwner=true.
  async claimVenue(key, data) {
    var payload = Object.assign({}, data, { claimAsOwner: true });
    return this.saveVenue(key, payload);
  },

  // Update a venue — only the owner can call this (enforced by rules).
  async updateVenue(key, updates) {
    if (!this.db || !key) return false;
    try {
      var clean = window.FirestoreDB._cleanUndefined(updates);
      clean.updatedAt = Date.now();
      await this.db.collection('venues').doc(key).update(clean);
      return true;
    } catch (e) {
      window._error('Erro ao atualizar venue:', e);
      return false;
    }
  },

  // Release ownership without deleting the doc so its presences/tournaments
  // don't lose the reference. Owner becomes null → reverts to community listing.
  async releaseVenue(key) {
    if (!this.db || !key) return false;
    try {
      await this.db.collection('venues').doc(key).update({
        ownerUid: null,
        ownerEmail: null,
        releasedAt: Date.now(),
        updatedAt: Date.now()
      });
      return true;
    } catch (e) {
      window._error('Erro ao liberar venue:', e);
      return false;
    }
  },

  // Hard-delete a venue document. Allowed only for the owner or the original
  // creator — enforced client-side here (Firestore rules should mirror). In
  // alpha-phase this is safe: referenced presences/tournaments become dangling
  // references but the app degrades gracefully (UI falls back to "sem ficha").
  // Reviews subcollection is intentionally NOT recursed into — they become
  // orphaned but unreachable from UI. If the venue is later recreated with
  // the same placeId, old reviews would resurface; acceptable in alpha.
  async deleteVenue(key) {
    if (!this.db || !key) throw new Error('key obrigatória');
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;
    if (!myUid) throw new Error('login obrigatório');
    var ref = this.db.collection('venues').doc(key);
    var doc = await ref.get();
    if (!doc.exists) return true; // Already gone.
    var data = doc.data() || {};
    var imOwner = data.ownerUid && data.ownerUid === myUid;
    var imCreator = data.createdByUid && data.createdByUid === myUid;
    if (!imOwner && !imCreator) {
      throw new Error('sem-permissão');
    }
    await ref.delete();
    return true;
  },

  // Paginated list for the public discovery view. Todos os filtros agora são
  // client-side — o filtro de sport *não* usa mais array-contains no servidor
  // porque venues recém-cadastrados (sem quadras ainda) têm sports[] vazio e
  // ficavam invisíveis na descoberta. Regra cliente: se o venue não declara
  // sports[] ou declara vazio, ele passa como wildcard; se declara, precisa
  // conter o esporte selecionado.
  async listVenues(filters, opts) {
    if (!this.db) return [];
    filters = filters || {};
    opts = opts || {};
    // Alpha-phase: pull até 1000 docs. limit(50) sem ordering retornava um
    // subset arbitrário — venues próximos do usuário ficavam de fora se o
    // Firestore decidisse retornar outros 50 primeiro. O filtro geográfico é
    // 100% client-side, então temos que trazer tudo e deixar o caller filtrar
    // por distância. Quando a base crescer para milhares, migrar para
    // GeoFirestore ou sharding por célula S2/geohash.
    var limit = Math.max(1, Math.min(1000, opts.limit || 500));
    var ref = this.db.collection('venues');
    try {
      var q = ref.limit(limit);
      var snap = await q.get();
      var list = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        list.push(d);
      });
      // Client-side filters.
      var cityQ = (filters.city || '').trim().toLowerCase();
      var priceQ = filters.priceRange || '';
      var minCourts = parseInt(filters.minCourts, 10) || 0;
      var sportQ = (filters.sport || '').trim();
      return list.filter(function(v) {
        if (cityQ && !(v.city || '').toLowerCase().includes(cityQ)) return false;
        if (priceQ && v.priceRange !== priceQ) return false;
        if (minCourts > 0) {
          // v2.1.62: total de quadras = SOMA dos count de cada grupo de courts[]
          // (cada grupo é uma modalidade com seu próprio count). courts.length
          // (nº de grupos) subcontava. Filtro de descoberta "≥N quadras" usa o
          // total real. Venues sem courts[] passam como wildcard.
          var effectiveCount = 0;
          if (Array.isArray(v.courts) && v.courts.length) {
            v.courts.forEach(function(c) { var n = parseInt(c && c.count, 10); effectiveCount += (isNaN(n) || n < 1) ? 1 : n; });
          } else if (typeof v.courtCount === 'number' && v.courtCount > 0) {
            effectiveCount = v.courtCount;
          }
          if (effectiveCount > 0 && effectiveCount < minCourts) return false;
          // effectiveCount === 0 passa como wildcard (venue ainda sem quadras).
        }
        if (sportQ) {
          var sportsArr = Array.isArray(v.sports) ? v.sports : [];
          // Venues sem sports declarados (cadastro novo, sem quadras) passam
          // como wildcard. Venues com sports declarados só passam se incluem
          // o esporte filtrado.
          if (sportsArr.length > 0 && sportsArr.indexOf(sportQ) === -1) return false;
        }
        return true;
      }).sort(function(a, b) {
        // Pro always ranks above Free; within a tier, verified first, then name.
        var ap = a.plan === 'pro' ? 1 : 0;
        var bp = b.plan === 'pro' ? 1 : 0;
        if (ap !== bp) return bp - ap;
        var av = a.verified ? 1 : 0;
        var bv = b.verified ? 1 : 0;
        if (av !== bv) return bv - av;
        return (a.name || '').localeCompare(b.name || '');
      });
    } catch (e) {
      window._error('Erro ao listar venues:', e);
      return [];
    }
  },

  // Atomic increment of the viewCount field using server-side FieldValue.
  // Called each time the detail modal opens (except for the owner, so the
  // owner's own curiosity doesn't inflate numbers). Write-only from client;
  // no reads needed. Small cost even at scale.
  async incrementViewCount(key) {
    if (!this.db || !key) return;
    try {
      await this.db.collection('venues').doc(key).update({
        viewCount: firebase.firestore.FieldValue.increment(1),
        lastViewedAt: Date.now()
      });
    } catch (e) {
      // Doc might not allow writes from visitor (rules: owner-only update).
      // That's expected — only owner-related writes will succeed in firestore.
      // For a permissive counter we'd relax rules; doing so lands in B5 proper.
    }
  },

  // ── Reviews (estrelas + texto opcional) ─────────────────────────────────
  // Um review por usuário por venue — usamos uid como doc id.

  async saveReview(venueKey, rating, text, anonymous) {
    if (!this.db || !venueKey) throw new Error('venueKey obrigatório');
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) throw new Error('login obrigatório');
    var n = parseInt(rating, 10);
    if (!(n >= 1 && n <= 5)) throw new Error('rating 1-5');
    var txt = String(text || '').trim().slice(0, 1000);
    // Star-only reviews (sem texto) podem ficar anônimos no display;
    // gravamos displayName de qualquer jeito para moderação, mas flag
    // anonymous=true diz à UI para ocultar o nome.
    var hideName = !!anonymous && !txt;
    var now = Date.now();
    var payload = {
      uid: cu.uid,
      displayName: cu.displayName || '',
      photoURL: cu.photoURL || '',
      rating: n,
      text: txt,
      anonymous: hideName,
      createdAt: now,
      updatedAt: now
    };
    await this.db.collection('venues').doc(venueKey)
      .collection('reviews').doc(cu.uid)
      .set(payload, { merge: true });
    return payload;
  },

  async loadReviews(venueKey, limit) {
    if (!this.db || !venueKey) return [];
    try {
      var q = this.db.collection('venues').doc(venueKey)
        .collection('reviews').orderBy('updatedAt', 'desc');
      if (limit) q = q.limit(limit);
      var snap = await q.get();
      var list = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        list.push(d);
      });
      return list;
    } catch (e) {
      window._error('Erro ao carregar reviews:', e);
      return [];
    }
  },

  async deleteReview(venueKey, reviewId) {
    if (!this.db || !venueKey || !reviewId) return false;
    try {
      await this.db.collection('venues').doc(venueKey)
        .collection('reviews').doc(reviewId).delete();
      return true;
    } catch (e) {
      window._error('Erro ao apagar review:', e);
      return false;
    }
  },

  // Denúncia de conteúdo gerado por usuário (moderação — Apple Guideline 1.2).
  // Grava na coleção top-level `reports` (write-only p/ usuários; revisada pela
  // equipe via console/Admin SDK). Nenhum PII do denunciante além do uid/nome.
  async reportReview(venueKey, reviewId, reviewedUid, reason) {
    if (!this.db || !venueKey || !reviewId) throw new Error('dados obrigatórios');
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) throw new Error('login obrigatório');
    await this.db.collection('reports').add({
      type: 'venue-review',
      venueKey: venueKey,
      reviewId: reviewId,
      reviewedUid: reviewedUid || '',
      reporterUid: cu.uid,
      reporterName: cu.displayName || '',
      reason: String(reason || '').slice(0, 500),
      status: 'open',
      createdAt: Date.now()
    });
    return true;
  },

  // ── Courts — armazenados como array no próprio doc do venue ─────────────
  // Guardar em subcollection (courts/{id}) exigiria regras Firestore separadas.
  // Em vez disso, gravamos um campo `courts: []` no doc principal do venue —
  // assim a transação de saveVenue cobre tudo sem permissões extras.
  //
  // Cada entrada:  { _id, sports[], count, shared, contributorUid, contributorName, createdAt, updatedAt }
  // sports[] é array de strings — shape válido no Firestore (array de maps
  // contendo arrays é permitido; só arrays-de-arrays diretos são proibidos).

  async _mutateCourts(venueKey, mutateFn) {
    if (!this.db || !venueKey) throw new Error('venueKey obrigatório');
    var self = this;
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;
    var ref = this.db.collection('venues').doc(venueKey);
    return this.db.runTransaction(async function(tx) {
      var doc = await tx.get(ref);
      var base = doc.exists ? doc.data() : {};
      if (base.ownerUid && base.ownerUid !== myUid) throw new Error('venue-já-reivindicado');
      var courts = Array.isArray(base.courts) ? base.courts.slice() : [];
      mutateFn(courts);
      // Sync sports[] top-level field = union of all court entries
      var allSports = {};
      courts.forEach(function(c) { (c.sports || []).forEach(function(s) { allSports[s] = 1; }); });
      // v2.1.62: NÃO denormalizar um courtCount "total" — quadras são POR
      // MODALIDADE (não se joga beach tennis em quadra de tênis). A verdade está
      // em courts[] (cada grupo {count, sports}); quem precisa do nº de quadras
      // deve somar o count da modalidade específica, não um total genérico.
      var merged = Object.assign({}, base, {
        courts: courts,
        sports: Object.keys(allSports),
        updatedAt: Date.now()
      });
      var clean = window.FirestoreDB._cleanUndefined(merged);
      tx.set(ref, clean, { merge: true });
    });
  },

  async addVenueCourt(venueKey, data) {
    if (!this.db || !venueKey) throw new Error('venueKey obrigatório');
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) throw new Error('login obrigatório');
    var now = new Date().toISOString();
    var sports = Array.isArray(data.sports)
      ? data.sports.map(function(s) { return String(s || '').trim(); }).filter(Boolean)
      : [];
    if (sports.length === 0) throw new Error('pelo menos uma modalidade é obrigatória');
    var seen = {};
    sports = sports.filter(function(s) { if (seen[s]) return false; seen[s] = 1; return true; });
    var newEntry = {
      _id: String(Date.now()) + '-' + Math.floor(Math.random() * 1e6),
      sports: sports,
      count: Math.max(1, Math.min(999, parseInt(data.count, 10) || 1)),
      shared: sports.length > 1,
      contributorUid: cu.uid,
      contributorName: cu.displayName || '',
      createdAt: now,
      updatedAt: now
    };
    await this._mutateCourts(venueKey, function(courts) { courts.push(newEntry); });
    return newEntry;
  },

  async listVenueCourts(venueKey) {
    if (!this.db || !venueKey) return [];
    try {
      var venue = await this.loadVenue(venueKey);
      return Array.isArray(venue && venue.courts) ? venue.courts : [];
    } catch (e) {
      window._warn('Erro ao carregar courts:', e && e.message);
      return [];
    }
  },

  async updateVenueCourt(venueKey, courtId, patch) {
    if (!this.db || !venueKey || !courtId) throw new Error('params obrigatórios');
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) throw new Error('login obrigatório');
    await this._mutateCourts(venueKey, function(courts) {
      var idx = courts.findIndex(function(c) { return c._id === courtId; });
      if (idx === -1) throw new Error('entrada não encontrada');
      var c = courts[idx];
      if (Array.isArray(patch.sports)) {
        var list = patch.sports.map(function(s) { return String(s || '').trim(); }).filter(Boolean);
        var seen = {}; list = list.filter(function(s) { if (seen[s]) return false; seen[s] = 1; return true; });
        if (list.length === 0) throw new Error('pelo menos uma modalidade é obrigatória');
        c.sports = list;
        c.shared = list.length > 1;
      }
      if ('count' in patch) c.count = Math.max(1, Math.min(999, parseInt(patch.count, 10) || 1));
      c.updatedAt = new Date().toISOString();
      courts[idx] = c;
    });
    return true;
  },

  async deleteVenueCourt(venueKey, courtId) {
    if (!this.db || !venueKey || !courtId) return false;
    try {
      await this._mutateCourts(venueKey, function(courts) {
        var idx = courts.findIndex(function(c) { return c._id === courtId; });
        if (idx !== -1) courts.splice(idx, 1);
      });
      return true;
    } catch (e) {
      window._error('Erro ao apagar court:', e);
      return false;
    }
  },

  // Agrega courts por modalidade pra exibição resumida. Retorna:
  //   { sports: ['Beach Tennis', 'Tênis'], totalCount: 12, bySport: { 'Tênis': {...} }, contributors: [{uid, name, count}] }
  async aggregateVenueCourts(venueKey) {
    var courts = await this.listVenueCourts(venueKey);
    var bySport = {};
    var contributorsMap = {};
    var total = 0;
    courts.forEach(function(c) {
      total += c.count || 0;
      // Uma entrada multi-sport soma o mesmo `count` sob cada modalidade —
      // "3 quadras Beach Tennis + Futvôlei" = 3 quadras em cada um dos dois
      // buckets, porque cada uma das 3 quadras físicas atende qualquer das
      // duas modalidades.
      var sportList = Array.isArray(c.sports) ? c.sports : [];
      sportList.forEach(function(key) {
        if (!bySport[key]) bySport[key] = { sport: key, count: 0, shared: false, entries: [] };
        bySport[key].count += c.count || 0;
        if (sportList.length > 1) bySport[key].shared = true;
        bySport[key].entries.push(c);
      });
      if (c.contributorUid) {
        if (!contributorsMap[c.contributorUid]) contributorsMap[c.contributorUid] = { uid: c.contributorUid, name: c.contributorName || '', count: 0 };
        contributorsMap[c.contributorUid].count += c.count || 0;
      }
    });
    var contributors = Object.keys(contributorsMap).map(function(k) { return contributorsMap[k]; });
    return {
      totalCount: total,
      sports: Object.keys(bySport),
      bySport: bySport,
      contributors: contributors,
      entries: courts
    };
  },

  async loadMyVenues(uid) {
    if (!this.db || !uid) return [];
    try {
      // Duas queries paralelas: venues que sou o dono formal + venues que eu
      // cadastrei (comunidade, sem reivindicação). Dedup por doc id.
      var seen = {};
      var list = [];
      var addSnap = function(snap) {
        snap.forEach(function(doc) {
          if (seen[doc.id]) return;
          seen[doc.id] = true;
          var d = doc.data();
          d._id = doc.id;
          list.push(d);
        });
      };
      await Promise.all([
        this.db.collection('venues').where('ownerUid', '==', uid).get().then(addSnap).catch(function(e) { window._warn('ownerUid query:', e && e.message); }),
        this.db.collection('venues').where('createdByUid', '==', uid).get().then(addSnap).catch(function(e) { window._warn('createdByUid query:', e && e.message); })
      ]);
      list.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
      return list;
    } catch (e) {
      window._error('Erro ao carregar meus venues:', e);
      return [];
    }
  }
};
