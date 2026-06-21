// scoreplace.app — Árbitros do Torneio
// v1.6.7-beta
// Página #arbitros/<tId>: gestão de árbitros do torneio pelo organizador.
// Três seções: Confirmados (teal) · Convidados (amber) · Disponíveis (indigo)
//
// Schema em Firestore:
//   t.arbitros = [{ uid, name, photoURL, status: 'confirmed'|'invited', invitedAt, confirmedAt }]
//   users.refereeSports = ['Beach Tennis', ...] (array-contains query)
//   users.canRefereeBySport = { 'Beach Tennis': true } (granular)
//
// Regras:
// - Organizador convida → status 'invited'
// - Árbitro aceita (via notificação/botão) → status 'confirmed'
// - Organizador remove → entry removida

(function() {
  'use strict';

  // ─── Haversine distance (km) ────────────────────────────────────────────────
  // v2.8.36: delega ao canônico window._haversineKm (store.js).
  function _haversineKm(lat1, lon1, lat2, lon2) {
    return window._haversineKm(lat1, lon1, lat2, lon2);
  }

  // ─── Avatar helper ───────────────────────────────────────────────────────────
  function _arbAvatar(name, photoURL, size) {
    size = size || 38;
    var isReal = photoURL && photoURL.indexOf('dicebear.com') === -1;
    if (isReal) {
      return '<img src="' + window._safeHtml(photoURL) + '" alt="" '
        + 'style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;flex-shrink:0;" '
        + 'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
        + '<div style="display:none;width:' + size + 'px;height:' + size + 'px;border-radius:50%;'
        + 'background:linear-gradient(135deg,#0d9488,#0891b2);color:#fff;font-size:' + Math.floor(size * 0.38) + 'px;'
        + 'font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">'
        + window._safeHtml(_initials2(name)) + '</div>';
    }
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;'
      + 'background:linear-gradient(135deg,#0d9488,#0891b2);color:#fff;font-size:' + Math.floor(size * 0.38) + 'px;'
      + 'font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      + window._safeHtml(_initials2(name)) + '</div>';
  }

  function _initials2(name) {
    if (!name) return '?';
    var parts = String(name).trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return String(name).trim().substring(0, 2).toUpperCase();
  }

  // ─── Person card ────────────────────────────────────────────────────────────
  // status: 'confirmed' | 'invited' | 'available'
  function _arbCard(person, tId, status) {
    var name = person.name || person.displayName || 'Árbitro';
    var uid  = person.uid || '';
    var safe = window._safeHtml;
    var safeUid = String(uid).replace(/'/g, "\\'");
    var safeTid = String(tId).replace(/'/g, "\\'");

    // Sport badges
    var sportBadges = '';
    if (Array.isArray(person.refereeSports) && person.refereeSports.length > 0) {
      sportBadges = person.refereeSports.map(function(s) {
        return '<span style="font-size:0.6rem;padding:1px 6px;border-radius:4px;background:rgba(20,184,166,0.12);'
          + 'color:#2dd4bf;border:1px solid rgba(20,184,166,0.25);">' + safe(s) + '</span>';
      }).join('');
    }

    // City / location label
    var locLabel = '';
    if (person.city) {
      locLabel = '<span style="font-size:0.65rem;color:var(--text-muted);">📍 ' + safe(person.city) + '</span>';
    } else if (typeof person._distKm === 'number') {
      locLabel = '<span style="font-size:0.65rem;color:var(--text-muted);">~' + Math.round(person._distKm) + ' km</span>';
    }

    // Action button
    var actionBtn = '';
    if (status === 'confirmed') {
      actionBtn = '<button class="btn btn-sm" style="font-size:0.7rem;padding:5px 10px;background:rgba(239,68,68,0.1);'
        + 'color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:8px;" '
        + 'onclick="event.stopPropagation();window._arbitrosRemove(\'' + safeUid + '\',\'' + safeTid + '\')" '
        + 'title="Remover árbitro">✕ Remover</button>';
    } else if (status === 'invited') {
      actionBtn = '<button class="btn btn-sm" style="font-size:0.7rem;padding:5px 10px;background:rgba(239,68,68,0.1);'
        + 'color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:8px;" '
        + 'onclick="event.stopPropagation();window._arbitrosRemove(\'' + safeUid + '\',\'' + safeTid + '\')" '
        + 'title="Cancelar convite">✕ Cancelar</button>';
    } else if (status === 'available') {
      var isSelf = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid === uid);
      if (isSelf) {
        // Organizador se auto-confirma diretamente — sem fluxo de convite
        actionBtn = '<button class="btn btn-sm" style="font-size:0.7rem;padding:5px 10px;'
          + 'background:linear-gradient(135deg,rgba(20,184,166,0.18),rgba(13,148,136,0.18));'
          + 'color:#2dd4bf;border:1px solid rgba(20,184,166,0.4);border-radius:8px;" '
          + 'onclick="event.stopPropagation();window._arbitrosSelfConfirm(\'' + safeUid + '\',\'' + safeTid + '\')" '
          + 'title="Confirmar como árbitro deste torneio">✓ Arbitrarei</button>';
      } else {
        actionBtn = '<button class="btn btn-sm" style="font-size:0.7rem;padding:5px 10px;'
          + 'background:linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.18));'
          + 'color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);border-radius:8px;" '
          + 'onclick="event.stopPropagation();window._arbitrosInvite(\'' + safeUid + '\',\'' + safeTid + '\')" '
          + 'title="Convidar para arbitrar">+ Convidar</button>';
      }
    }

    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;'
      + 'background:var(--bg-card);border:1px solid var(--border-color);margin-bottom:6px;">'
      + _arbAvatar(name, person.photoURL, 38)
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:0.85rem;font-weight:600;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + safe(name) + '</div>'
        + '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:2px;">'
          + locLabel
          + sportBadges
        + '</div>'
      + '</div>'
      + '<div style="flex-shrink:0;">' + actionBtn + '</div>'
    + '</div>';
  }

  // ─── Section renderer ───────────────────────────────────────────────────────
  function _arbSection(title, icon, color, borderColor, bgColor, cards) {
    if (cards.length === 0) {
      return '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:14px;padding:14px 16px;margin-bottom:20px;">'
        + '<div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:' + color + ';margin-bottom:4px;">' + icon + ' ' + window._safeHtml(title) + '</div>'
        + '<div style="font-size:0.8rem;color:var(--text-muted);padding:8px 0;">Nenhum árbitro aqui ainda.</div>'
      + '</div>';
    }
    return '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:14px;padding:14px 16px;margin-bottom:20px;">'
      + '<div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:' + color + ';margin-bottom:10px;">' + icon + ' ' + window._safeHtml(title) + ' <span style="opacity:0.65;">(' + cards.length + ')</span></div>'
      + cards.join('')
    + '</div>';
  }

  // ─── Render page ────────────────────────────────────────────────────────────
  window.renderArbitrosPage = function(container, tId) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) {
      container.innerHTML = window._renderBackHeader({ href: '#tournaments/' + tId }) +
        '<div class="card" style="padding:2rem;text-align:center;"><p style="color:var(--text-muted);">Faça login para acessar esta página.</p></div>';
      return;
    }

    // Skeleton while loading
    container.innerHTML =
      window._renderBackHeader({ href: '#tournaments/' + tId, label: 'Torneio' }) +
      '<div style="max-width:800px;margin:0 auto;padding:0 0 32px;">' +
        '<h2 style="font-size:1.3rem;font-weight:700;margin-bottom:4px;color:var(--text-bright);">🧑‍⚖️ Árbitros</h2>' +
        '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:1.5rem;">Gerencie os árbitros do torneio — convide e confirme árbitros disponíveis.</p>' +
        '<div id="arbitros-content"><div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:0.85rem;">Carregando árbitros…</div></div>' +
      '</div>';

    // Load tournament + available referees in parallel
    var db = window.FirestoreDB && window.FirestoreDB.db;
    if (!db) {
      document.getElementById('arbitros-content').innerHTML =
        '<div style="color:#f87171;font-size:0.85rem;">Banco de dados indisponível.</div>';
      return;
    }

    // Fetch tournament
    db.collection('tournaments').doc(tId).get()
      .then(function(doc) {
        if (!doc.exists) throw new Error('Torneio não encontrado');
        var t = Object.assign({ id: doc.id }, doc.data());

        // Check organizer
        var isOrg = typeof window.AppStore.isOrganizer === 'function'
          ? window.AppStore.isOrganizer(t)
          : (t.organizerEmail === cu.email || t.creatorEmail === cu.email);
        if (!isOrg) {
          document.getElementById('arbitros-content').innerHTML =
            '<div style="color:#f87171;font-size:0.85rem;">Somente o organizador pode gerenciar árbitros.</div>';
          return;
        }

        var sport  = t.sport || '';
        var tLat   = t.venueLat   ? parseFloat(t.venueLat)   : null;
        var tLon   = t.venueLon   ? parseFloat(t.venueLon)   : null;

        // Current arbitros array
        var arbitros = Array.isArray(t.arbitros) ? t.arbitros : [];
        var confirmedUids = {};
        var invitedUids   = {};
        arbitros.forEach(function(a) {
          if (a.status === 'confirmed') confirmedUids[a.uid] = a;
          else invitedUids[a.uid] = a;
        });

        // Now query available referees
        var refQuery = db.collection('users');
        if (sport) {
          refQuery = refQuery.where('refereeSports', 'array-contains', sport);
        }
        // If no sport, just limit results
        return refQuery.limit(80).get().then(function(snap) {
          var available = [];
          snap.forEach(function(d) {
            var u = Object.assign({ uid: d.id }, d.data());
            var uid = u.uid || d.id;
            // Skip already confirmed/invited (but NOT self — organizer can arbitrate own tournament)
            if (confirmedUids[uid] || invitedUids[uid]) return;
            // Distance filter: if tournament has coordinates and user has preferredLocations
            if (tLat !== null && tLon !== null && Array.isArray(u.preferredLocations) && u.preferredLocations.length > 0) {
              var minDist = Infinity;
              u.preferredLocations.forEach(function(loc) {
                if (loc.lat && loc.lng) {
                  var d2 = _haversineKm(tLat, tLon, parseFloat(loc.lat), parseFloat(loc.lng));
                  if (d2 < minDist) minDist = d2;
                }
              });
              u._distKm = minDist;
              if (minDist > 100) return; // skip > 100 km
            }
            available.push(u);
          });

          // Sort available by distance if known
          available.sort(function(a, b) {
            var da = typeof a._distKm === 'number' ? a._distKm : 9999;
            var db2 = typeof b._distKm === 'number' ? b._distKm : 9999;
            return da - db2;
          });

          // Build confirmed/invited cards using t.arbitros data enriched by Firestore
          var confirmedList = arbitros.filter(function(a) { return a.status === 'confirmed'; });
          var invitedList   = arbitros.filter(function(a) { return a.status === 'invited'; });

          var confirmedCards = confirmedList.map(function(a) { return _arbCard(a, tId, 'confirmed'); });
          var invitedCards   = invitedList.map(function(a)   { return _arbCard(a, tId, 'invited');   });
          var availableCards = available.map(function(a)     { return _arbCard(a, tId, 'available'); });

          var html =
            _arbSection('Confirmados', '✅', '#2dd4bf', 'rgba(20,184,166,0.35)', 'rgba(20,184,166,0.06)', confirmedCards) +
            _arbSection('Convidados',  '⏳', '#fbbf24', 'rgba(251,191,36,0.35)',  'rgba(251,191,36,0.05)',  invitedCards)  +
            _arbSection('Disponíveis' + (sport ? ' em ' + sport : ''), '🔍', '#a5b4fc', 'rgba(99,102,241,0.35)', 'rgba(99,102,241,0.05)', availableCards);

          var el = document.getElementById('arbitros-content');
          if (el) el.innerHTML = html;

          // Expose tId for action handlers
          window._arbitrosCurrentTId = tId;
          window._arbitrosTournament  = t;
        });
      })
      .catch(function(err) {
        var el = document.getElementById('arbitros-content');
        if (el) el.innerHTML = '<div style="color:#f87171;font-size:0.85rem;">Erro ao carregar: ' + window._safeHtml(String(err.message || err)) + '</div>';
      });
  };

  // ─── Invite árbitro ─────────────────────────────────────────────────────────
  window._arbitrosInvite = function(uid, tId) {
    var db = window.FirestoreDB && window.FirestoreDB.db;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!db || !cu || !uid || !tId) return;

    db.collection('users').doc(uid).get()
      .then(function(snap) {
        if (!snap.exists) throw new Error('Usuário não encontrado');
        var u = snap.data();
        var entry = {
          uid:       uid,
          name:      u.displayName || u.name || uid,
          photoURL:  u.photoURL || '',
          email:     u.email || '',
          status:    'invited',
          invitedAt: new Date().toISOString(),
          invitedBy: cu.uid || cu.email
        };
        return db.collection('tournaments').doc(tId).update({
          arbitros: firebase.firestore.FieldValue.arrayUnion(entry)
        });
      })
      .then(function() {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Árbitro convidado', 'Convite enviado com sucesso.', 'success');
        }
        // Refresh page
        if (typeof window.renderArbitrosPage === 'function') {
          var vc = document.getElementById('view-container');
          if (vc) window.renderArbitrosPage(vc, tId);
        }
      })
      .catch(function(err) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Erro', String(err.message || err), 'error');
        }
      });
  };

  // ─── Self-confirm (organizer arbitrates own tournament) ─────────────────────
  window._arbitrosSelfConfirm = function(uid, tId) {
    var db = window.FirestoreDB && window.FirestoreDB.db;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!db || !cu || !tId) return;
    var entry = {
      uid:         cu.uid || uid,
      name:        cu.displayName || cu.name || uid,
      photoURL:    cu.photoURL || '',
      email:       cu.email || '',
      status:      'confirmed',
      confirmedAt: new Date().toISOString(),
      invitedBy:   cu.uid || cu.email
    };
    db.collection('tournaments').doc(tId).update({
      arbitros: firebase.firestore.FieldValue.arrayUnion(entry)
    }).then(function() {
      if (typeof window.showNotification === 'function') {
        window.showNotification('Árbitro confirmado', 'Você está confirmado como árbitro deste torneio.', 'success');
      }
      if (typeof window.renderArbitrosPage === 'function') {
        var vc = document.getElementById('view-container');
        if (vc) window.renderArbitrosPage(vc, tId);
      }
    }).catch(function(err) {
      if (typeof window.showNotification === 'function') {
        window.showNotification('Erro', String(err.message || err), 'error');
      }
    });
  };

  // ─── Remove / cancel invite ──────────────────────────────────────────────────
  window._arbitrosRemove = function(uid, tId) {
    var db = window.FirestoreDB && window.FirestoreDB.db;
    if (!db || !uid || !tId) return;

    // We need to find the exact entry to remove (arrayRemove needs deep equality)
    db.collection('tournaments').doc(tId).get()
      .then(function(snap) {
        if (!snap.exists) throw new Error('Torneio não encontrado');
        var t = snap.data();
        var arbitros = Array.isArray(t.arbitros) ? t.arbitros : [];
        var entry = null;
        for (var i = 0; i < arbitros.length; i++) {
          if (arbitros[i].uid === uid) { entry = arbitros[i]; break; }
        }
        if (!entry) throw new Error('Árbitro não encontrado');
        return db.collection('tournaments').doc(tId).update({
          arbitros: firebase.firestore.FieldValue.arrayRemove(entry)
        });
      })
      .then(function() {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Árbitro removido', 'Árbitro removido do torneio.', 'success');
        }
        if (typeof window.renderArbitrosPage === 'function') {
          var vc = document.getElementById('view-container');
          if (vc) window.renderArbitrosPage(vc, tId);
        }
      })
      .catch(function(err) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Erro', String(err.message || err), 'error');
        }
      });
  };

})();
