// ── Analytics & Details Functions ──

// ── Perfil de jogador ─────────────────────────────────────────────────────────
// _openPlayerProfile(name, {uid, tournamentId})
// - Próprio usuário → #profile (editável, propaga tudo)
// - Outro jogador → overlay com perfil, histórico compartilhado e troféus
window._openPlayerProfile = function(playerName, opts) {
  opts = opts || {};
  var uid = opts.uid || '';
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!playerName && !uid) return;

  var isSelf = (uid && cu && uid === cu.uid) ||
               (!uid && cu && cu.displayName &&
                cu.displayName.toLowerCase().trim() === String(playerName || '').toLowerCase().trim());
  if (isSelf) { window.location.hash = '#profile'; return; }

  var db = window.FirestoreDB && window.FirestoreDB.db;

  // ── helpers visuais ──
  var _sh = window._safeHtml || function(s){return String(s||'');};
  var _avatar = function(photo, name, size) {
    var sz = size || 72;
    var seed = encodeURIComponent(name||'?');
    var fb = 'https://api.dicebear.com/9.x/initials/svg?seed='+seed+'&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size='+sz;
    var src = (photo && photo.indexOf('dicebear.com')===-1) ? photo : fb;
    return '<img src="'+_sh(src)+'" onerror="this.onerror=null;this.src=\''+fb+'\'" style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;object-fit:cover;display:block;margin:0 auto;">';
  };
  var _pill = function(label, bg) {
    return '<span style="background:'+( bg||'rgba(99,102,241,0.15)')+';border:1px solid rgba(99,102,241,0.3);border-radius:20px;padding:2px 10px;font-size:0.72rem;color:#a5b4fc;">'+_sh(label)+'</span>';
  };

  // ── criar overlay vazio imediatamente ──
  var old = document.getElementById('player-profile-overlay');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'player-profile-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);z-index:10050;overflow-y:auto;';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML =
    '<div style="min-height:100%;display:flex;align-items:flex-start;justify-content:center;padding:0 0 40px;">' +
      '<div id="ppo-card" style="background:var(--bg-card,#1e293b);width:100%;max-width:520px;border-radius:0 0 16px 16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
        // header
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.08));">' +
          '<button onclick="document.getElementById(\'player-profile-overlay\').remove()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--text-muted,#94a3b8);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Voltar</button>' +
          '<div id="ppo-friend-btn"></div>' +
        '</div>' +
        '<div id="ppo-body" style="padding:0;">' + (typeof window._renderBallLoader === 'function' ? window._renderBallLoader('Carregando…', { minHeight: '22vh', size: '2.2rem' }) : '<div style="text-align:center;padding:32px;color:var(--text-muted);">Carregando…</div>') + '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  // ── buscar dados e montar ──
  var _build = function(profile, playerUid) {
    var name   = (profile && profile.displayName) || playerName || '?';
    var photo  = (profile && profile.photoURL) || (window._playerPhotoCache && window._playerPhotoCache[String(playerName||'').toLowerCase()]) || '';
    var city   = (profile && profile.city) || '';
    var sports = (profile && Array.isArray(profile.preferredSports)) ? profile.preferredSports : [];
    var skillBySport = (profile && profile.skillBySport) || {};

    var isFriend = cu && playerUid && Array.isArray(cu.friends) && cu.friends.indexOf(playerUid) !== -1;
    var _gw = typeof window._genderWord === 'function' ? window._genderWord : function(_,m,f){return m+(f?'/'+f:'');};
    var _amigoLabel   = _gw(profile, 'Amigo',    'Amiga');
    var _addAmigo     = '+ Adicionar ' + _gw(profile, 'amigo', 'amiga');
    var friendBtnHtml = '';
    if (playerUid && cu && cu.uid) {
      if (isFriend) {
        friendBtnHtml = '<span style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#34d399;border-radius:8px;padding:6px 12px;font-size:0.78rem;font-weight:600;">✅ '+_amigoLabel+'</span>';
      } else {
        friendBtnHtml = '<button onclick="window._sendFriendRequest&&window._sendFriendRequest(\''+playerUid+'\');this.textContent=\'Convite enviado\';this.disabled=true;" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;border-radius:8px;padding:6px 12px;font-size:0.78rem;font-weight:600;cursor:pointer;">'+_addAmigo+'</button>';
      }
    }
    var fBtn = document.getElementById('ppo-friend-btn');
    if (fBtn) fBtn.innerHTML = friendBtnHtml;

    // ── histórico compartilhado ──
    var tournaments = window.AppStore && window.AppStore.tournaments || [];
    var shared = { asPartner:[], asOpponent:[] };
    var cuName  = cu && cu.displayName || '';
    var _nameIn = function(str, n) { return str && n && (str.toLowerCase() === n.toLowerCase() || str.toLowerCase().indexOf(' / ') !== -1 && str.toLowerCase().split(' / ').some(function(p){return p.trim()===n.toLowerCase().trim();})); };
    tournaments.forEach(function(t) {
      var allParts = Array.isArray(t.participants) ? t.participants : [];
      var cuEntry = null, plEntry = null;
      allParts.forEach(function(p) {
        var n = window._pName ? window._pName(p) : (typeof p === 'string' ? p : (p.displayName||p.name||'')); // v3.0.x: canônico "A / B" pra dupla
        var _po = (typeof p === 'object' && p) ? p : null;
        if (_nameIn(n, cuName) || (cu&&cu.uid&&_po&&(_po.uid===cu.uid||_po.p1Uid===cu.uid||_po.p2Uid===cu.uid))) cuEntry = n;
        if (_nameIn(n, name) || (playerUid&&_po&&(_po.uid===playerUid||_po.p1Uid===playerUid||_po.p2Uid===playerUid))) plEntry = n;
      });
      if (!cuEntry || !plEntry) return;
      // Verificar se são no mesmo time (parceiros) ou times diferentes (adversários)
      var isPartner = cuEntry === plEntry || (cuEntry.indexOf('/') !== -1 && _nameIn(cuEntry, name));
      if (isPartner) { shared.asPartner.push(t); } else { shared.asOpponent.push(t); }
    });

    // Calcular W/D/L nos torneios compartilhados
    var _wdl = function(tList, mode) {
      var w=0,d=0,l=0;
      tList.forEach(function(t) {
        var allM = typeof window._collectAllMatches==='function' ? window._collectAllMatches(t) : [];
        allM.forEach(function(m) {
          var p1h = _nameIn(m.p1||'', mode==='partner' ? name : cuName);
          var p2h = _nameIn(m.p2||'', mode==='partner' ? name : cuName);
          if (!p1h && !p2h) return;
          if (!m.winner) return;
          var cuWon = _nameIn(m.winner, cuName) || _nameIn(m.winner, name);
          if (mode==='partner') {
            if (_nameIn(m.winner, name)) w++; else l++;
          } else {
            if (_nameIn(m.winner, cuName)) w++; else if (m.winner==='draw') d++; else l++;
          }
        });
      });
      return {w:w,d:d,l:l};
    };
    var partnerStats  = _wdl(shared.asPartner, 'partner');
    var opponentStats = _wdl(shared.asOpponent, 'opponent');

    var sharedHtml = '';
    if (shared.asPartner.length || shared.asOpponent.length) {
      sharedHtml =
        '<div style="padding:16px;border-top:1px solid var(--border-color,rgba(255,255,255,0.08));">' +
          '<div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">🏆 Histórico juntos</div>' +
          (shared.asPartner.length ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.82rem;"><span style="color:#34d399;font-weight:600;">🤝 Parceiros</span><span style="color:var(--text-muted);">'+shared.asPartner.length+' torneio(s)</span><span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">'+partnerStats.w+'V '+partnerStats.l+'D juntos</span></div>' : '') +
          (shared.asOpponent.length ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.82rem;"><span style="color:#f59e0b;font-weight:600;">⚔️ Adversários</span><span style="color:var(--text-muted);">'+shared.asOpponent.length+' torneio(s)</span><span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">'+opponentStats.w+'V '+opponentStats.d+(opponentStats.d?'E ':'')+opponentStats.l+'D (seu)</span></div>' : '') +
        '</div>';
    }

    // ── montar body ──
    var sportsHtml = sports.length ? '<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-top:8px;">' +
      sports.map(function(s) {
        var sk = skillBySport[s] ? ' <span style="font-size:0.6rem;color:#fbbf24;">'+_sh(skillBySport[s])+'</span>' : '';
        return isFriend ? _pill(s)+ sk : _pill(s);
      }).join('') + '</div>' : '';

    var body = document.getElementById('ppo-body');
    if (!body) return;
    body.innerHTML =
      // hero
      '<div style="text-align:center;padding:20px 20px 14px;">' +
        _avatar(photo, name, 80) +
        '<div style="font-size:1.2rem;font-weight:800;color:var(--text-bright,#f1f5f9);margin-top:10px;">' + _sh(name) + '</div>' +
        (isFriend && city ? '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:3px;">📍 '+_sh(city)+'</div>' : '') +
        sportsHtml +
      '</div>' +
      // histórico compartilhado
      sharedHtml +
      // troféus — só para amigos
      (isFriend ? '<div id="ppo-trophies" style="padding:0 16px 4px;border-top:1px solid var(--border-color,rgba(255,255,255,0.08));"><div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;padding:12px 0 8px;">🏅 Conquistas</div><div id="ppo-trophies-inner" style="font-size:0.8rem;color:var(--text-muted);">' + (typeof window._renderBallLoaderInline === 'function' ? window._renderBallLoaderInline('Carregando…') : 'Carregando…') + '</div></div>' : '') +
      // stats
      '<div style="padding:12px 16px 20px;border-top:1px solid var(--border-color,rgba(255,255,255,0.08));text-align:center;">' +
        '<button id="ppo-stats-btn" style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:10px;padding:8px 20px;font-size:0.82rem;cursor:pointer;">📊 Ver estatísticas detalhadas</button>' +
      '</div>';

    // Foto: popular no cache ANTES de abrir stats para aparecer corretamente
    var _realPhoto = photo && photo.indexOf('dicebear.com') === -1 ? photo : '';
    if (_realPhoto && name) {
      if (!window._playerPhotoCache) window._playerPhotoCache = {};
      window._playerPhotoCache[name.toLowerCase()] = _realPhoto;
    }
    var statsBtn = document.getElementById('ppo-stats-btn');
    if (statsBtn) {
      var _nameSafe = name;
      statsBtn.onclick = function() {
        // Esconder o perfil (não remover) para restaurar no Voltar
        var ppo = document.getElementById('player-profile-overlay');
        if (ppo) ppo.style.display = 'none';

        if (typeof window._showPlayerStats !== 'function') {
          if (ppo) ppo.style.display = '';
          return;
        }
        window._showPlayerStats(_nameSafe, opts.tournamentId);

        // MutationObserver: quando player-stats-overlay for removido do DOM,
        // restaura o overlay do perfil automaticamente (cobre Voltar e ×)
        var _obs = new MutationObserver(function() {
          if (!document.getElementById('player-stats-overlay')) {
            _obs.disconnect();
            var ppo2 = document.getElementById('player-profile-overlay');
            if (ppo2) ppo2.style.display = '';
          }
        });
        _obs.observe(document.body, { childList: true, subtree: false });
      };
    }

    // ── carregar troféus (só para amigos) ──
    if (isFriend && playerUid && cu && cu.uid) {
      var _loadFn = window._loadUserTrophies;
      if (!_loadFn) {
        var slot0 = document.getElementById('ppo-trophies-inner');
        if (slot0) slot0.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">—</div>';
      } else {
      Promise.all([
        _loadFn(cu.uid),
        _loadFn(playerUid)
      ]).then(function(results) {
          var cuTrophies    = (results[0] && results[0].trophies) || {};
          var theirTrophies = (results[1] && results[1].trophies) || {};
          var catalog = window.TROPHY_CATALOG || [];
          var tierColor = {platina:'#e879f9', ouro:'#fbbf24', prata:'#94a3b8', bronze:'#f97316'};
          var tierEmoji = {platina:'✨', ouro:'🥇', prata:'🥈', bronze:'🥉'};
          var tierOrder = {platina:0, ouro:1, prata:2, bronze:3};

          // Contar por tier
          var myCount   = {platina:0,ouro:0,prata:0,bronze:0,total:0};
          var theirCount= {platina:0,ouro:0,prata:0,bronze:0,total:0};
          Object.values(cuTrophies).forEach(function(t){var k=t.tier||'bronze'; if(myCount[k]!==undefined){myCount[k]++;myCount.total++;}});
          Object.values(theirTrophies).forEach(function(t){var k=t.tier||'bronze'; if(theirCount[k]!==undefined){theirCount[k]++;theirCount.total++;}});

          // Troféus em comum
          var both = catalog.filter(function(tr){return !!theirTrophies[tr.id] && !!(cuTrophies&&cuTrophies[tr.id]);});
          // Troféus de cada um, ordenados por tier
          var myList    = catalog.filter(function(tr){return !!(cuTrophies&&cuTrophies[tr.id]);})
                            .sort(function(a,b){var ta=cuTrophies[a.id]&&cuTrophies[a.id].tier||'bronze', tb=cuTrophies[b.id]&&cuTrophies[b.id].tier||'bronze'; return (tierOrder[ta]||3)-(tierOrder[tb]||3);});
          var theirList = catalog.filter(function(tr){return !!theirTrophies[tr.id];})
                            .sort(function(a,b){var ta=theirTrophies[a.id]&&theirTrophies[a.id].tier||'bronze', tb=theirTrophies[b.id]&&theirTrophies[b.id].tier||'bronze'; return (tierOrder[ta]||3)-(tierOrder[tb]||3);});

          var _tierBadge = function(tier, n) {
            if (!n) return '';
            return '<span style="font-size:0.7rem;color:'+tierColor[tier]+';font-weight:700;margin-right:4px;">'+tierEmoji[tier]+'×'+n+'</span>';
          };
          var _tRow = function(tr, t, highlight) {
            var tier = (t&&t.tier)||'bronze';
            var col  = tierColor[tier]||'#f97316';
            var bg   = highlight ? 'background:rgba(251,191,36,0.06);border-radius:6px;' : '';
            return '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;'+bg+'">' +
              '<span style="font-size:0.9rem;line-height:1;">'+_sh(tr.icon||'🏆')+'</span>' +
              '<span style="font-size:0.72rem;color:'+col+';font-weight:600;line-height:1.3;">'+_sh(tr.title)+'</span>' +
            '</div>';
          };

          var cuName0    = (cu&&cu.displayName)||'Você';
          var theirName0 = name;

          // União de todos os troféus que pelo menos um possui, por tier
          var allIds = {};
          catalog.forEach(function(tr) {
            var hasMe   = !!(cuTrophies    && cuTrophies[tr.id]);
            var hasThem = !!(theirTrophies && theirTrophies[tr.id]);
            if (hasMe || hasThem) allIds[tr.id] = tr;
          });
          var allTrs = Object.values(allIds).sort(function(a,b) {
            var ta = (cuTrophies[a.id]||theirTrophies[a.id]||{}).tier||'bronze';
            var tb = (cuTrophies[b.id]||theirTrophies[b.id]||{}).tier||'bronze';
            return (tierOrder[ta]||3)-(tierOrder[tb]||3);
          });

          if (!allTrs.length) {
            var slot = document.getElementById('ppo-trophies-inner');
            if (slot) slot.innerHTML = '<div style="color:var(--text-muted);font-size:0.78rem;padding:4px 0;text-align:center;">Nenhuma conquista ainda.</div>';
            return;
          }

          // Cabeçalho: nome esquerda | — | nome direita
          var headerHtml =
            '<div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:4px;align-items:center;padding:0 4px 8px;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.08));margin-bottom:8px;">' +
              '<div style="font-size:0.78rem;font-weight:700;color:var(--text-bright);text-align:left;">'+_sh(cuName0)+'</div>' +
              '<div style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-align:center;text-transform:uppercase;letter-spacing:0.5px;">Conquista</div>' +
              '<div style="font-size:0.78rem;font-weight:700;color:var(--text-bright);text-align:right;">'+_sh(theirName0)+'</div>' +
            '</div>';

          // Linhas: ✅/❌ | ícone nome conquista | ✅/❌
          var rowsHtml = allTrs.map(function(tr) {
            var hasMe   = !!(cuTrophies    && cuTrophies[tr.id]);
            var hasThem = !!(theirTrophies && theirTrophies[tr.id]);
            var tier    = (cuTrophies[tr.id]||theirTrophies[tr.id]||{}).tier || 'bronze';
            var col     = tierColor[tier] || '#f97316';
            var chk = '<span style="font-size:1rem;line-height:1;">✅</span>';
            var xmk = '<span style="font-size:1rem;line-height:1;opacity:0.35;">❌</span>';
            return '<div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:4px;align-items:center;padding:5px 4px;border-radius:6px;" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'none\'">' +
              '<div style="text-align:left;">'+(hasMe?chk:xmk)+'</div>' +
              '<div style="text-align:center;">' +
                '<span style="font-size:0.9rem;">'+_sh(tr.icon||'🏅')+'</span> ' +
                '<span style="font-size:0.72rem;color:'+col+';font-weight:600;">'+_sh(tr.title)+'</span>' +
              '</div>' +
              '<div style="text-align:right;">'+(hasThem?chk:xmk)+'</div>' +
            '</div>';
          }).join('');

          var html = headerHtml + rowsHtml;

          var slot = document.getElementById('ppo-trophies-inner');
          if (slot) slot.innerHTML = html;
        }).catch(function() {
          var slot = document.getElementById('ppo-trophies-inner');
          if (slot) slot.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">—</div>';
        }); // end Promise.all.then
      } // end else _loadFn
    } // end isFriend
  };

  // ── buscar perfil ──
  if (!db) { _build(null, uid); return; }
  if (uid) {
    db.collection('users').doc(uid).get()
      .then(function(doc) { _build(doc.exists ? doc.data() : null, uid); })
      .catch(function() { _build(null, uid); });
  } else {
    db.collection('users').where('displayName', '==', playerName).limit(1).get()
      .then(function(snap) {
        var docId = !snap.empty ? snap.docs[0].id : '';
        _build(!snap.empty ? snap.docs[0].data() : null, docId);
      })
      .catch(function() { _build(null, ''); });
  }
};

// Resolve a photoURL for a player name by checking currentUser and friends,
// plus looking through any matchHistory player records that carry photoURL.
window._resolvePlayerPhoto = function(playerName, opts) {
    opts = opts || {};
    var n = String(playerName || '').toLowerCase().trim();
    if (!n) return null;
    var cu = window.AppStore && window.AppStore.currentUser;
    var _eq = function(a, b) { return String(a || '').toLowerCase().trim() === String(b || '').toLowerCase().trim(); };
    if (cu && (_eq(cu.displayName, playerName) || (cu.displayName && _eq(cu.displayName.split(' ')[0], playerName)))) {
        if (cu.photoURL) return cu.photoURL;
    }
    var friends = (window.AppStore && Array.isArray(window.AppStore.friends)) ? window.AppStore.friends : [];
    for (var i = 0; i < friends.length; i++) {
        if (_eq(friends[i].displayName, playerName) && friends[i].photoURL) return friends[i].photoURL;
    }
    if (Array.isArray(opts.records)) {
        for (var r = 0; r < opts.records.length; r++) {
            var ps = opts.records[r].players || [];
            for (var j = 0; j < ps.length; j++) {
                if (_eq(ps[j].name, playerName) && ps[j].photoURL) return ps[j].photoURL;
            }
        }
    }
    // v1.8.79: verificar _playerPhotoCache (populado por _preloadPlayerPhotos
    // via Firestore uid lookup e por _openPlayerProfile)
    if (window._playerPhotoCache && window._playerPhotoCache[n]) {
        var cached = window._playerPhotoCache[n];
        if (cached && cached.indexOf('dicebear.com') === -1) return cached;
    }
    return null;
};

// Resolve a uid for a player name. Used to load persistent matchHistory.
window._resolvePlayerUid = function(playerName) {
    var n = String(playerName || '').toLowerCase().trim();
    if (!n) return null;
    var cu = window.AppStore && window.AppStore.currentUser;
    var _eq = function(a, b) { return String(a || '').toLowerCase().trim() === String(b || '').toLowerCase().trim(); };
    if (cu && cu.uid && (_eq(cu.displayName, playerName) || (cu.displayName && _eq(cu.displayName.split(' ')[0], playerName)))) return cu.uid;
    var friends = (window.AppStore && Array.isArray(window.AppStore.friends)) ? window.AppStore.friends : [];
    for (var i = 0; i < friends.length; i++) {
        if (_eq(friends[i].displayName, playerName) && friends[i].uid) return friends[i].uid;
    }
    // Fallback: search through tournament participants for a uid match
    var ts = (window.AppStore && Array.isArray(window.AppStore.tournaments)) ? window.AppStore.tournaments : [];
    for (var t = 0; t < ts.length; t++) {
        var ps = Array.isArray(ts[t].participants) ? ts[t].participants : [];
        for (var pi = 0; pi < ps.length; pi++) {
            var p = ps[pi];
            if (p && typeof p === 'object' && p.uid && _eq(p.displayName || p.name, playerName)) return p.uid;
        }
    }
    return null;
};

// Shared visual helpers — mirror the casual-match end-of-match cards (bracket-ui.js).
function _boxStat(label, value, icon, accent) {
    accent = accent || 'var(--text-bright,#fff)';
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 6px;border-radius:10px;background:var(--stat-box-bg);border:1px solid var(--border-color);">' +
      '<span style="font-size:1rem;">' + icon + '</span>' +
      '<span style="font-size:1.15rem;font-weight:900;color:' + accent + ';font-variant-numeric:tabular-nums;line-height:1;">' + value + '</span>' +
      '<span style="font-size:0.55rem;font-weight:700;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:0.5px;text-align:center;">' + label + '</span>' +
    '</div>';
}

function _sectionShell(id, title, icon, accent, badge) {
    return '<div id="' + id + '" style="margin-top:12px;padding:12px;border-radius:14px;background:var(--info-box-bg);border:1px solid ' + accent + '44;display:flex;flex-direction:column;gap:8px;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:1rem;">' + icon + '</span>' +
        '<span style="font-size:0.85rem;font-weight:900;color:' + accent + ';text-transform:uppercase;letter-spacing:0.8px;">' + title + '</span>' +
        '<span style="margin-left:auto;font-size:0.62rem;color:var(--text-muted,#94a3b8);font-weight:700;">' + badge + '</span>' +
      '</div>';
}

// Horizontal compare-bar — mirrors bracket-ui.js casual end-of-match "Comparação dos Times".
function _compareBar(label, icon, leftVal, rightVal, leftClr, rightClr, fmt, maxCap) {
    fmt = fmt || function(v) { return v; };
    var maxV = maxCap || Math.max(leftVal, rightVal, 1);
    var lp = Math.round(leftVal / maxV * 100);
    var rp = Math.round(rightVal / maxV * 100);
    return '<div style="display:flex;flex-direction:column;gap:4px;">' +
        '<div style="text-align:center;font-size:0.6rem;font-weight:700;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:0.8px;">' + icon + ' ' + label + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="flex:0 0 auto;min-width:36px;text-align:right;font-size:0.9rem;font-weight:900;color:' + leftClr + ';font-variant-numeric:tabular-nums;">' + fmt(leftVal) + '</span>' +
            '<div style="flex:1;height:9px;border-radius:5px;overflow:hidden;background:var(--stat-box-bg);display:flex;justify-content:flex-end;">' +
                '<div style="width:' + lp + '%;background:linear-gradient(90deg,' + leftClr + '44,' + leftClr + ');border-radius:5px 0 0 5px;transition:width 0.5s ease-out;"></div>' +
            '</div>' +
            '<div style="width:1px;height:14px;background:var(--border-color);"></div>' +
            '<div style="flex:1;height:9px;border-radius:5px;overflow:hidden;background:var(--stat-box-bg);display:flex;">' +
                '<div style="width:' + rp + '%;background:linear-gradient(90deg,' + rightClr + ',' + rightClr + '44);border-radius:0 5px 5px 0;transition:width 0.5s ease-out;"></div>' +
            '</div>' +
            '<span style="flex:0 0 auto;min-width:36px;font-size:0.9rem;font-weight:900;color:' + rightClr + ';font-variant-numeric:tabular-nums;">' + fmt(rightVal) + '</span>' +
        '</div>' +
    '</div>';
}

// Comparative shell — header + legend + compare-bar body (used by both legacy & persistent paths).
function _compareShell(badge, bodyHtml) {
    return '<div style="width:100%;padding:clamp(12px,2.2vh,18px);border-radius:14px;background:var(--info-box-bg);border:1px solid var(--border-color);display:flex;flex-direction:column;gap:clamp(8px,1.6vh,14px);margin-top:12px;">' +
        '<div style="text-align:center;font-size:0.6rem;font-weight:800;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:2px;">⚖ Casual vs Torneios' + (badge ? ' · ' + badge : '') + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;font-size:0.68rem;font-weight:700;">' +
            '<span style="color:#38bdf8;">📡 Casual</span>' +
            '<span style="color:#fbbf24;">Torneio 🏆</span>' +
        '</div>' +
        bodyHtml +
    '</div>';
}

// Organizer analytics block — rendered inside the _showPlayerStats modal
// when viewing own profile and user has organized 2+ tournaments. Uses the
// modal's _boxStat/_sectionShell helpers so it harmonizes visually with the
// rest of the stats overlay.
function _buildOrganizerAnalyticsForModal(playerName) {
    var t = window._t || function(k) { return k; };
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.displayName) return '';
    var viewingSelf = String(cu.displayName).toLowerCase().trim() === String(playerName).toLowerCase().trim();
    if (!viewingSelf) return '';

    var tours = (window.AppStore && Array.isArray(window.AppStore.tournaments)) ? window.AppStore.tournaments : [];
    var myEmail = (cu.email || '').toLowerCase().trim();
    var myUid = cu.uid || '';
    var organizados = tours.filter(function(tr) {
        var oe = String(tr.organizerEmail || tr.creatorEmail || '').toLowerCase().trim();
        var ou = String(tr.organizerUid || tr.creatorUid || '').trim();
        return (myEmail && oe === myEmail) || (myUid && ou === myUid);
    });
    if (organizados.length < 2) return '';

    var total = organizados.length;

    // Unique participants
    var participantSet = {};
    var totalParts = 0;
    organizados.forEach(function(tr) {
        var parts = tr.participants || [];
        parts.forEach(function(p) {
            var key = (typeof p === 'string') ? p : (p.email || p.displayName || p.uid || JSON.stringify(p));
            participantSet[key] = true;
        });
        totalParts += parts.length;
    });
    var uniqueCount = Object.keys(participantSet).length;
    var avgParts = total > 0 ? Math.round(totalParts / total) : 0;

    // By format / sport
    var formatCounts = {};
    var sportCounts = {};
    organizados.forEach(function(tr) {
        var f = (window._formatDisplayName ? window._formatDisplayName(tr.format) : tr.format) || t('common.other');
        formatCounts[f] = (formatCounts[f] || 0) + 1;
        var s = tr.sport ? String(tr.sport).replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : t('common.other');
        sportCounts[s] = (sportCounts[s] || 0) + 1;
    });

    // Best month
    var monthCounts = {};
    organizados.forEach(function(tr) {
        var d = tr.createdAt || tr.startDate;
        if (d) {
            var dt = new Date(d);
            if (!isNaN(dt.getTime())) {
                var mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
                monthCounts[mk] = (monthCounts[mk] || 0) + 1;
            }
        }
    });
    var bestMonth = '';
    var bestMonthCount = 0;
    Object.keys(monthCounts).forEach(function(mk) {
        if (monthCounts[mk] > bestMonthCount) {
            bestMonthCount = monthCounts[mk];
            bestMonth = mk;
        }
    });
    var bestMonthLabel = bestMonth ? (function() {
        var parts = bestMonth.split('-');
        var months = t('dashboard.monthAbbrevs').split(',');
        return months[parseInt(parts[1], 10) - 1] + '/' + parts[0];
    })() : '-';

    // Bar chart using modal's dark visual language
    function barChart(counts, accent) {
        var max = 0;
        Object.keys(counts).forEach(function(k) { if (counts[k] > max) max = counts[k]; });
        if (max === 0) return '';
        var html = '';
        Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; }).forEach(function(k) {
            var pct = Math.round((counts[k] / max) * 100);
            html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
                '<span style="min-width:90px;font-size:0.7rem;color:var(--text-muted,#94a3b8);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window._safeHtml(k) + '</span>' +
                '<div style="flex:1;height:10px;background:var(--stat-box-bg);border-radius:5px;overflow:hidden;">' +
                    '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,' + accent + '66,' + accent + ');border-radius:5px;"></div>' +
                '</div>' +
                '<span style="min-width:20px;font-size:0.72rem;color:var(--text-bright,#fff);font-weight:700;font-variant-numeric:tabular-nums;">' + counts[k] + '</span>' +
            '</div>';
        });
        return html;
    }

    var accent = '#a855f7';
    var badge = total + ' ' + (total > 1 ? 'torneios' : 'torneio');

    var sectionLabel = t('analytics.organizerSection');
    if (!sectionLabel || sectionLabel === 'analytics.organizerSection') sectionLabel = 'Organização';
    return _sectionShell('organizer-analytics-modal', sectionLabel, '📊', accent, badge) +
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">' +
            _boxStat(t('analytics.totalTournaments'), total, '🏆', accent) +
            _boxStat(t('analytics.uniqueParticipants'), uniqueCount, '👥', '#38bdf8') +
            _boxStat(t('analytics.avgParticipants'), avgParts, '📈', '#22c55e') +
            _boxStat(t('analytics.bestMonth'), bestMonthLabel, '🗓️', '#fbbf24') +
        '</div>' +
        '<div style="margin-top:10px;">' +
            '<div style="font-size:0.7rem;font-weight:700;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">' + t('analytics.byFormat') + '</div>' +
            barChart(formatCounts, accent) +
        '</div>' +
        '<div style="margin-top:8px;">' +
            '<div style="font-size:0.7rem;font-weight:700;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">' + t('analytics.bySport') + '</div>' +
            barChart(sportCounts, '#38bdf8') +
        '</div>' +
    '</div>';
}

// Show Player Stats Modal — consolidated stats across all tournaments + persistent
// matchHistory (casual + tournament) so records survive deletion of the source.
window._showPlayerStats = function(playerName, currentTournamentId) {
    if (!playerName) return;
    var safeN = window._safeHtml(playerName);
    var tournaments = window.AppStore.tournaments || [];
    var stats = {
        tournamentsPlayed: 0,
        tournamentNames: [],
        totalWins: 0,
        totalLosses: 0,
        totalDraws: 0,
        totalMatches: 0,
        titles: 0,      // 1st place finishes
        podiums: 0,      // top 3 finishes
        sports: {},
        formats: {}
    };

    // Helper: check if a player name matches (case-insensitive, partial)
    var _nameMatch = function(a, b) {
        if (!a || !b) return false;
        return a.toLowerCase().trim() === b.toLowerCase().trim();
    };

    // Helper: extract all matches from a tournament (delegates to canonical collector)
    var _getAllMatches = function(t) {
        if (typeof window._collectAllMatches === 'function') return window._collectAllMatches(t);
        // Defensive fallback if bracket-model.js didn't load
        var all = [];
        if (Array.isArray(t.matches)) all = all.concat(t.matches);
        if (Array.isArray(t.rounds)) t.rounds.forEach(function(r) { if (Array.isArray(r.matches)) all = all.concat(r.matches); });
        if (Array.isArray(t.groups)) t.groups.forEach(function(g) { if (Array.isArray(g.matches)) all = all.concat(g.matches); });
        if (Array.isArray(t.rodadas)) t.rodadas.forEach(function(rd) {
            if (Array.isArray(rd.matches)) all = all.concat(rd.matches);
            if (Array.isArray(rd.jogos)) all = all.concat(rd.jogos);
        });
        if (t.thirdPlaceMatch) all.push(t.thirdPlaceMatch);
        return all;
    };

    tournaments.forEach(function(t) {
        // Check if player is a participant
        var pList = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
        var isParticipant = pList.some(function(p) {
            var name = window._pName(p);
            return _nameMatch(name, playerName);
        });
        if (!isParticipant) return;

        stats.tournamentsPlayed++;
        stats.tournamentNames.push({ name: t.name, id: t.id, sport: t.sport || '', format: (window._formatDisplayName ? window._formatDisplayName(t.format) : t.format) || '' });

        // Track sports and formats
        if (t.sport) stats.sports[t.sport] = (stats.sports[t.sport] || 0) + 1;
        if (t.format) stats.formats[t.format] = (stats.formats[t.format] || 0) + 1;

        // Check standings for position (Liga/Suíço)
        if (typeof window._computeStandings === 'function' && (window._isLigaFormat(t) || t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss')) {
            var computed = window._computeStandings(t);
            for (var si = 0; si < computed.length; si++) {
                if (_nameMatch(computed[si].name, playerName)) {
                    stats.totalWins += computed[si].wins || 0;
                    stats.totalLosses += computed[si].losses || 0;
                    stats.totalDraws += computed[si].draws || 0;
                    stats.totalMatches += computed[si].played || 0;
                    if (si === 0 && (t.status === 'finished' || t.status === 'closed')) stats.titles++;
                    if (si < 3 && (t.status === 'finished' || t.status === 'closed')) stats.podiums++;
                    break;
                }
            }
        } else {
            // Elimination format — count from matches
            var matches = _getAllMatches(t);
            matches.forEach(function(m) {
                var p1 = m.p1 || m.player1 || '';
                var p2 = m.p2 || m.player2 || '';
                var winner = m.winner || '';
                var isP1 = _nameMatch(p1, playerName);
                var isP2 = _nameMatch(p2, playerName);
                if (!isP1 && !isP2) return;
                if (!winner && m.score1 === undefined) return; // unplayed
                stats.totalMatches++;
                if (_nameMatch(winner, playerName)) {
                    stats.totalWins++;
                } else if (winner && !_nameMatch(winner, playerName)) {
                    stats.totalLosses++;
                } else if (m.score1 !== undefined && m.score1 === m.score2) {
                    stats.totalDraws++;
                }
            });
            // Check if champion (final match winner). Prefer adapter to find
            // the true final across canonical + legacy shapes; fall back to
            // the last entry of t.matches for single-elim legacy data.
            if (t.status === 'finished' || t.status === 'closed') {
                var finalMatch = null;
                if (typeof window._getUnifiedRounds === 'function') {
                    var cols = window._getUnifiedRounds(t) || [];
                    var finalCol = null;
                    for (var fci = cols.length - 1; fci >= 0; fci--) {
                        var cc = cols[fci];
                        if (cc && (cc.phase === 'grandfinal' || cc.phase === 'elim')) {
                            finalCol = cc;
                            break;
                        }
                    }
                    if (finalCol && Array.isArray(finalCol.matches) && finalCol.matches.length > 0) {
                        finalMatch = finalCol.matches[finalCol.matches.length - 1];
                    }
                }
                if (!finalMatch && Array.isArray(t.matches) && t.matches.length > 0) {
                    finalMatch = t.matches[t.matches.length - 1];
                }
                if (finalMatch && _nameMatch(finalMatch.winner, playerName)) {
                    stats.titles++;
                    stats.podiums++;
                } else if (finalMatch && ((_nameMatch(finalMatch.p1, playerName) || _nameMatch(finalMatch.p2, playerName)))) {
                    stats.podiums++; // runner-up
                }
            }
        }
    });

    // Calculate win rate
    var winRate = stats.totalMatches > 0 ? Math.round((stats.totalWins / stats.totalMatches) * 100) : 0;
    var sportsStr = Object.keys(stats.sports).map(function(s) { return s + ' (' + stats.sports[s] + ')'; }).join(', ') || 'N/A';

    // Collect any available local records (v2 cache) so the initial render
    // can show real stats before the async Firestore fetch completes.
    function _collectLocalRecordsForPlayer(pName, pUid) {
        var cu = window.AppStore && window.AppStore.currentUser;
        var isCurUser = cu && cu.displayName && String(cu.displayName).toLowerCase().trim() === String(pName).toLowerCase().trim();
        if (!isCurUser) return [];
        try {
            var v2 = JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]');
            if (!Array.isArray(v2) || !v2.length) return [];
            var myUid = pUid || (cu && cu.uid) || null;
            var myDn = (cu.displayName || '').toLowerCase().trim();
            return v2.map(function(r) {
                var rc = Object.assign({}, r);
                rc.players = (r.players || []).map(function(p) {
                    var cp = Object.assign({}, p);
                    if (!cp.uid && cp.name && String(cp.name).toLowerCase().trim() === myDn) cp.uid = myUid;
                    return cp;
                });
                return rc;
            });
        } catch(e) { return []; }
    }

    // Remove previous modal
    var prev = document.getElementById('player-stats-overlay');
    if (prev) prev.remove();

    // Measure topbar so the overlay starts below it and the app menu stays visible + interactive.
    var _tb = document.querySelector('.topbar');
    var _tbH = _tb ? Math.round(_tb.getBoundingClientRect().height) : 60;
    if (!_tbH || _tbH < 40) _tbH = 60;

    var overlay = document.createElement('div');
    overlay.id = 'player-stats-overlay';
    // z-index 90 < topbar (100) so the menu renders above. Starts below the topbar
    // so clicks on menu items are never blocked. Backdrop tone blends both themes.
    overlay.style.cssText = 'position:fixed;top:' + _tbH + 'px;left:0;width:100%;height:calc(100% - ' + _tbH + 'px);background:var(--overlay-bg,rgba(0,0,0,0.55));z-index:90;display:flex;align-items:flex-start;justify-content:center;animation:fadeIn 0.2s ease;overflow-y:auto;padding:16px 12px 40px;';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-card,#1e2235);color:var(--text-main,#d1d5db);border:1px solid var(--border-color,rgba(255,255,255,0.1));border-radius:20px;padding:1.5rem;max-width:520px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);position:relative;';

    // Build tournament list HTML
    var tourListHtml = stats.tournamentNames.map(function(tn) {
        return '<a href="#tournaments/' + tn.id + '" onclick="document.getElementById(\'player-stats-overlay\').remove()" style="display:block;padding:8px 12px;border-radius:8px;background:var(--info-pill-bg);margin-bottom:4px;text-decoration:none;color:var(--text-bright,#fff);font-size:0.8rem;transition:background 0.2s;">' +
          '<span style="font-weight:600;">' + window._safeHtml(tn.name) + '</span>' +
          '<span style="color:var(--text-muted,#94a3b8);margin-left:8px;font-size:0.7rem;">' + window._safeHtml(tn.sport) + ' • ' + window._safeHtml(tn.format) + '</span>' +
        '</a>';
    }).join('');

    // Resolve photo + uid (for persistent match history lookup)
    var resolvedPhoto = window._resolvePlayerPhoto(playerName);
    var resolvedUid = window._resolvePlayerUid(playerName);
    var _initialChar = (playerName.charAt(0) || '?').toUpperCase();
    var avatarHtml = resolvedPhoto
      ? '<img src="' + window._safeHtml(resolvedPhoto) + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--primary-color,#3b82f6);margin-bottom:0.5rem;display:inline-block;" onerror="this.outerHTML=\'<div style=\\\'width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);display:inline-flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:700;color:#1a1e2e;margin-bottom:0.5rem;\\\'>' + _initialChar + '</div>\'">'
      : '<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);display:inline-flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:700;color:#1a1e2e;margin-bottom:0.5rem;">' + _initialChar + '</div>';

    // Initial render: always full metric grid (zeros if no data) so players
    // see what's trackable and are encouraged to play matches via the app.
    // If we have a uid, the async Firestore load will replace with real data.
    var _tourListFooter = (stats.tournamentsPlayed > 0
      ? '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:0.78rem;font-weight:600;color:var(--text-bright,#fff);padding:6px 0;">📋 Torneios Disputados (' + stats.tournamentsPlayed + ')</summary><div style="margin-top:6px;">' + tourListHtml + '</div></details>'
      : '');
    var _initialStatsHtml = (typeof window._renderPersistentMatchStats === 'function')
      ? (window._renderPersistentMatchStats(_collectLocalRecordsForPlayer(playerName, resolvedUid), resolvedUid) + _tourListFooter)
      : _buildLegacyStatsHtml(stats, sportsStr, winRate, tourListHtml);

    // Organizer analytics — only when viewing own stats and user has organized
    // 2+ tournaments. Harmonized with modal's _boxStat/_sectionShell helpers.
    var _organizerSectionHtml = _buildOrganizerAnalyticsForModal(playerName);

    modal.innerHTML = '' +
      ((typeof window._renderBackHeader === 'function')
        ? window._renderBackHeader({
            extraStyle: 'top:' + _tbH + 'px;',
            onClickOverride: "var _o=document.getElementById('player-stats-overlay');if(_o)_o.remove();",
            rightHtml: '<button onclick="var _o=document.getElementById(\'player-stats-overlay\');if(_o)_o.remove();" aria-label="Fechar" style="background:none;border:none;color:var(--text-muted,#94a3b8);font-size:1.5rem;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>'
          })
        : '') +
      // CSS `.sticky-back-header + *` already adds 50px margin-top for the sticky header clearance.
      // No extra spacer div needed — it was causing double padding (100px) above the avatar.
      '<div style="text-align:center;margin-bottom:0.75rem;padding-top:4px;">' +
        avatarHtml +
        '<h3 style="margin:0;font-size:1.3rem;color:var(--text-bright,#fff);">' + safeN + '</h3>' +
      '</div>' +
      // Main body: persistent matchHistory stats (primary)
      '<div id="player-stats-persistent">' +
        _initialStatsHtml +
      '</div>' +
      // Organizer analytics (if applicable)
      _organizerSectionHtml;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // v1.0.33-beta: dispara animação on-scroll de barras + contadores no
    // modal de stats. IntersectionObserver detecta quando cada elemento
    // entra na viewport do modal scrollable e anima 0 → target.
    if (typeof window._initStatsAnimation === 'function') {
        window._initStatsAnimation(modal);
    }

    // Helpers to build legacy AppStore-based stats (fallback when uid unknown or matchHistory empty)
    function _buildLegacyStatsHtml(s, sp, wr, tList) {
        // When viewing current user's stats, prefer the local rich cache
        // (scoreplace_casual_history_v2) written by bracket-ui._buildAndPersistMatchRecord.
        // That cache stores the full record schema (stats.team1/team2, playerStats,
        // timeStats, durationMs, players[].uid) so we can run the same detailed
        // aggregation used by the Firestore matchHistory path.
        var cu = window.AppStore && window.AppStore.currentUser;
        var isCurrentUser = cu && cu.displayName && String(cu.displayName).toLowerCase().trim() === String(playerName).toLowerCase().trim();
        if (isCurrentUser && typeof window._renderPersistentMatchStats === 'function') {
            try {
                var v2 = JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]');
                if (Array.isArray(v2) && v2.length > 0) {
                    // Seed records with current user's uid/name so _renderPersistentMatchStats
                    // can find "my slot" even when the saved player entry had no uid.
                    var myUid = cu.uid || null;
                    var myDn = (cu.displayName || '').toLowerCase().trim();
                    var seeded = v2.map(function(r) {
                        var rc = Object.assign({}, r);
                        rc.players = (r.players || []).map(function(p) {
                            var cp = Object.assign({}, p);
                            if (!cp.uid && cp.name && String(cp.name).toLowerCase().trim() === myDn) {
                                cp.uid = myUid;
                            }
                            return cp;
                        });
                        return rc;
                    });
                    // _renderPersistentMatchStats filters by uid — only renders matches
                    // where current user is found. That's exactly what we want.
                    return window._renderPersistentMatchStats(seeded, myUid);
                }
            } catch(e) {}
        }

        // Read localStorage casual history (legacy minimal format) — only for V/D/% fallback
        var cStats = { matches:0, wins:0, losses:0, draws:0 };
        try {
            if (isCurrentUser) {
                var casualHist = JSON.parse(localStorage.getItem('scoreplace_casual_history') || '[]');
                cStats.matches = casualHist.length;
                var dn = (cu.displayName || '').toLowerCase();
                for (var ci = 0; ci < casualHist.length; ci++) {
                    var ch = casualHist[ci];
                    if (ch.winner === 'Empate') cStats.draws++;
                    else if (ch.winner && String(ch.winner).toLowerCase() === dn) cStats.wins++;
                    else if (ch.winner) cStats.losses++;
                }
            }
        } catch(e) {}

        var html = '<p style="text-align:center;font-size:0.7rem;color:var(--text-muted,#94a3b8);margin:0 0 8px;">' + window._safeHtml(sp) + '</p>';

        // Empty state
        if (!cStats.matches && !s.tournamentsPlayed) {
            html += '<div style="text-align:center;padding:16px 10px;color:var(--text-muted,#94a3b8);font-size:0.85rem;line-height:1.5;">' +
              '🎯 Nenhuma partida registrada ainda.<br>' +
              '<span style="font-size:0.72rem;">Jogue uma partida casual ou participe de um torneio para ver suas estatísticas.</span>' +
            '</div>';
            return html;
        }

        var casualClr = '#38bdf8', tournClr = '#fbbf24';
        var cRate = cStats.matches > 0 ? Math.round(cStats.wins / cStats.matches * 100) : 0;
        var tRate = wr;

        // Preferred path: both sides have data — render side-by-side compare bars.
        if (cStats.matches > 0 && s.tournamentsPlayed > 0) {
            var body =
                _compareBar('Partidas', '🎯', cStats.matches, s.totalMatches, casualClr, tournClr) +
                _compareBar('Vitórias', '✅', cStats.wins, s.totalWins, casualClr, tournClr) +
                _compareBar('Derrotas', '❌', cStats.losses, s.totalLosses, casualClr, tournClr) +
                ((cStats.draws + s.totalDraws) > 0 ? _compareBar('Empates', '⚖', cStats.draws, s.totalDraws, casualClr, tournClr) : '') +
                _compareBar('Aproveitamento', '📊', cRate, tRate, casualClr, tournClr, function(v) { return v + '%'; }, 100) +
                (s.titles > 0 ? _compareBar('Títulos', '👑', 0, s.titles, casualClr, tournClr) : '') +
                (s.podiums > 0 ? _compareBar('Pódios', '🥉', 0, s.podiums, casualClr, tournClr) : '');
            html += _compareShell('', body);
            html += '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:0.78rem;font-weight:600;color:var(--text-bright,#fff);padding:6px 0;">📋 Torneios Disputados (' + s.tournamentsPlayed + ')</summary><div style="margin-top:6px;">' + tList + '</div></details>';
            return html;
        }

        // Single-side fallback: only casual OR only tournament has data.
        if (cStats.matches > 0) {
            var cClr = cRate >= 60 ? '#22c55e' : (cRate >= 40 ? '#fbbf24' : '#ef4444');
            var cBadge = cStats.matches + ' ' + (cStats.matches > 1 ? 'partidas' : 'partida');
            html += _sectionShell('legacy-stats-casual', 'Partidas Casuais', '📡', '#38bdf8', cBadge) +
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">' +
                    _boxStat('Vitórias', cStats.wins, '✅', '#22c55e') +
                    _boxStat('Derrotas' + (cStats.draws ? '/E' : ''), cStats.losses + (cStats.draws ? '/' + cStats.draws : ''), '❌', '#ef4444') +
                    _boxStat('Aproveit.', cRate + '%', '📊', cClr) +
                '</div>' +
            '</div>';
        }

        if (s.tournamentsPlayed > 0) {
            var tClr = tRate >= 60 ? '#22c55e' : (tRate >= 40 ? '#fbbf24' : '#ef4444');
            var tBadge = s.tournamentsPlayed + ' ' + (s.tournamentsPlayed > 1 ? 'torneios' : 'torneio');
            html += _sectionShell('legacy-stats-tournament', 'Torneios', '🏆', '#fbbf24', tBadge);
            if (s.totalMatches > 0) {
                html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">' +
                    _boxStat('Vitórias', s.totalWins, '✅', '#22c55e') +
                    _boxStat('Derrotas' + (s.totalDraws ? '/E' : ''), s.totalLosses + (s.totalDraws ? '/' + s.totalDraws : ''), '❌', '#ef4444') +
                    _boxStat('Aproveit.', tRate + '%', '📊', tClr) +
                '</div>';
            }
            html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">' +
                _boxStat('Títulos', s.titles, '👑', '#fbbf24') +
                _boxStat('Partidas', s.totalMatches, '🎯', '#a855f7') +
            '</div>' +
            '</div>';

            html += '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:0.78rem;font-weight:600;color:var(--text-bright,#fff);padding:6px 0;">📋 Torneios Disputados (' + s.tournamentsPlayed + ')</summary><div style="margin-top:6px;">' + tList + '</div></details>';
        }

        return html;
    }

    // Load persistent per-user matchHistory — primary data source, survives deletion
    if (resolvedUid && window.FirestoreDB && typeof window.FirestoreDB.loadUserMatchHistory === 'function') {
        var slot = modal.querySelector('#player-stats-persistent');
        // Merge Firestore records with localStorage v2 casual cache so the hero-box
        // always shows the full detailed metric set for casual matches — even if
        // the Firestore write failed (permission, offline, no uid at save time).
        function _mergeLocalCasualV2(firestoreRecs) {
            var curUser = window.AppStore && window.AppStore.currentUser;
            var viewingSelf = curUser && curUser.displayName && String(curUser.displayName).toLowerCase().trim() === String(playerName).toLowerCase().trim();
            if (!viewingSelf) return firestoreRecs || [];
            var merged = (firestoreRecs || []).slice();
            try {
                var v2 = JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]');
                if (Array.isArray(v2) && v2.length > 0) {
                    var seen = {};
                    for (var i = 0; i < merged.length; i++) { if (merged[i] && merged[i].matchId) seen[merged[i].matchId] = 1; }
                    var myUid = curUser.uid || null;
                    var myDn = (curUser.displayName || '').toLowerCase().trim();
                    for (var j = 0; j < v2.length; j++) {
                        var r = v2[j];
                        if (!r || (r.matchId && seen[r.matchId])) continue;
                        // Ensure my uid is present so _renderPersistentMatchStats can locate me.
                        var seeded = Object.assign({}, r);
                        seeded.players = (r.players || []).map(function(p) {
                            var cp = Object.assign({}, p);
                            if (!cp.uid && cp.name && String(cp.name).toLowerCase().trim() === myDn) {
                                cp.uid = myUid;
                            }
                            return cp;
                        });
                        merged.push(seeded);
                    }
                }
            } catch(e) {}
            return merged;
        }
        window.FirestoreDB.loadUserMatchHistory(resolvedUid).then(function(records) {
            if (!slot) return;
            var merged = _mergeLocalCasualV2(records || []);
            // Always render the full metric grid (zeros if no data) so players
            // see what's trackable and are encouraged to play matches via the app.
            slot.innerHTML = window._renderPersistentMatchStats(merged, resolvedUid) +
                (stats.tournamentsPlayed > 0 ? '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:0.78rem;font-weight:600;color:var(--text-bright,#fff);padding:6px 0;">📋 Torneios Disputados (' + stats.tournamentsPlayed + ')</summary><div style="margin-top:6px;">' + tourListHtml + '</div></details>' : '');
            // v1.0.37-beta: re-anima stats DEPOIS do innerHTML async — o
            // _initStatsAnimation inicial agarrou os elementos zerados que
            // foram substituídos. Bug reportado: "a animação das estatisticas
            // não funcionou. ficou tudo zerado".
            if (typeof window._initStatsAnimation === 'function') {
                window._initStatsAnimation(slot);
            }
        }).catch(function(e) {
            window._warn('[player-stats] loadUserMatchHistory failed', e);
            if (slot) {
                slot.innerHTML = window._renderPersistentMatchStats(_collectLocalRecordsForPlayer(playerName, resolvedUid), resolvedUid) +
                    (stats.tournamentsPlayed > 0 ? '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:0.78rem;font-weight:600;color:var(--text-bright,#fff);padding:6px 0;">📋 Torneios Disputados (' + stats.tournamentsPlayed + ')</summary><div style="margin-top:6px;">' + tourListHtml + '</div></details>' : '');
                if (typeof window._initStatsAnimation === 'function') {
                    window._initStatsAnimation(slot);
                }
            }
        });
    }

    // ESC to close
    var _escH = function(e) {
        if (e.key === 'Escape') {
            var el = document.getElementById('player-stats-overlay');
            if (el) el.remove();
            document.removeEventListener('keydown', _escH);
        }
    };
    document.addEventListener('keydown', _escH);
};

// Build Activity Log for a tournament (derived from tournament data, no extra DB)
window._buildActivityLog = function(tournamentId) {
    var t = window._findTournamentById(tournamentId); // tournaments + publicDiscovery (torneio descoberto)
    if (!t) return;
    var container = document.getElementById('activity-log-section');
    if (!container) return;

    var events = [];

    // 1. Tournament created
    if (t.createdAt) {
        events.push({ date: t.createdAt, icon: '🏁', text: 'Torneio criado', color: '#60a5fa' });
    }

    // 2. Participants enrolled (use enrolledAt if available, or createdAt)
    var pList = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    pList.forEach(function(p) {
        var name = window._pName(p, '?');
        var pDate = (typeof p === 'object' && p.enrolledAt) ? p.enrolledAt : null;
        if (name && name !== 'BYE') {
            events.push({ date: pDate || t.createdAt, icon: '👤', text: '<b>' + window._safeHtml(name) + '</b> se inscreveu', color: '#4ade80' });
        }
    });

    // 3. Registration closed
    if (t.status === 'closed' || t.status === 'active' || t.status === 'finished') {
        if (t.registrationClosedAt) {
            events.push({ date: t.registrationClosedAt, icon: '🔒', text: 'Inscrições encerradas', color: '#f59e0b' });
        }
    }

    // 4. Draw done
    var hasDrawContent = (t.matches && t.matches.length > 0) || (t.rounds && t.rounds.length > 0) || (t.groups && t.groups.length > 0);
    if (hasDrawContent) {
        var drawDate = t.drawDate || t.tournamentStartedAt || null;
        events.push({ date: drawDate, icon: '🎲', text: 'Sorteio realizado', color: '#a78bfa' });
    }

    // 5. Tournament started
    if (t.tournamentStarted || t.tournamentStartedAt) {
        events.push({ date: t.tournamentStartedAt || null, icon: '▶️', text: 'Torneio iniciado', color: '#10b981' });
    }

    // 6. Match results — prefer canonical adapter so the activity log shows
    // humane round names ("Final", "Semifinais", "Quartas", "Grupo A") instead
    // of generic "Rodada N" / "Partida N".
    var allMatches = [];
    var _unified = (typeof window._getUnifiedRounds === 'function') ? window._getUnifiedRounds(t) : null;
    var _hasUnified = _unified && Array.isArray(_unified.columns) && _unified.columns.length > 0;
    if (_hasUnified) {
        _unified.columns.forEach(function(c) {
            if (!c) return;
            if (c.phase === 'thirdplace') {
                // Match is included but with its dedicated label
                (c.matches || []).forEach(function(m) {
                    if (m && m.winner) allMatches.push({ m: m, label: 'Disputa 3º lugar' });
                });
                return;
            }
            if ((c.phase === 'groups' || c.phase === 'monarch') && Array.isArray(c.subgroups)) {
                c.subgroups.forEach(function(sg, gi) {
                    var label = window._groupDisplayName(sg, gi);
                    (sg && sg.matches || []).forEach(function(m) { allMatches.push({ m: m, label: label }); });
                });
                return;
            }
            var lbl = c.label || ('Rodada ' + c.round);
            (c.matches || []).forEach(function(m) { allMatches.push({ m: m, label: lbl }); });
        });
    } else {
        // Legacy fallback (adapter not loaded or no columns)
        if (Array.isArray(t.matches)) {
            t.matches.forEach(function(m, idx) { allMatches.push({ m: m, label: m.round ? 'Rodada ' + m.round : 'Partida ' + (idx+1) }); });
        }
        if (Array.isArray(t.rounds)) {
            t.rounds.forEach(function(r, ri) {
                (r.matches || []).forEach(function(m) { allMatches.push({ m: m, label: 'Rodada ' + (ri+1) }); });
            });
        }
        if (Array.isArray(t.groups)) {
            t.groups.forEach(function(g, gi) {
                (g.matches || []).forEach(function(m) { allMatches.push({ m: m, label: window._groupDisplayName(g, gi) }); });
            });
        }
        if (Array.isArray(t.rodadas)) {
            t.rodadas.forEach(function(rd, ri) {
                var ms = rd.matches || rd.jogos || [];
                ms.forEach(function(m) { allMatches.push({ m: m, label: 'Rodada ' + (ri+1) }); });
            });
        }
        if (t.thirdPlaceMatch && t.thirdPlaceMatch.winner) {
            allMatches.push({ m: t.thirdPlaceMatch, label: 'Disputa 3º lugar' });
        }
    }

    allMatches.forEach(function(item) {
        var m = item.m;
        if (!m.winner && (m.score1 === undefined || m.score1 === null)) return;
        var p1 = m.p1 || m.player1 || '?';
        var p2 = m.p2 || m.player2 || '?';
        if (p1 === 'BYE' || p2 === 'BYE' || p1 === 'TBD' || p2 === 'TBD') return;
        var score = '';
        if (m.scoreP1 !== undefined && m.scoreP1 !== null) score = m.scoreP1 + ' × ' + (m.scoreP2 || 0);
        else if (m.score1 !== undefined && m.score1 !== null) score = m.score1 + ' × ' + (m.score2 || 0);
        var winner = m.winner || '';
        var txt = '<b>' + window._safeHtml(p1) + '</b> vs <b>' + window._safeHtml(p2) + '</b>';
        if (score) txt += ' — ' + score;
        if (winner) txt += ' → <span style="color:#4ade80;">' + window._safeHtml(winner) + '</span>';
        txt += ' <span style="opacity:0.5;">(' + item.label + ')</span>';
        events.push({ date: m.updatedAt || m.resultAt || null, icon: '⚔️', text: txt, color: '#94a3b8' });
    });

    // 7. Tournament finished
    if (t.status === 'finished' || t.status === 'closed') {
        var finDate = t.finishedAt || t.closedAt || null;
        if (hasDrawContent) {
            events.push({ date: finDate, icon: '🏆', text: 'Torneio encerrado', color: '#fbbf24' });
        }
    }

    // Sort by date (known dates first, then unknown)
    events.sort(function(a, b) {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
    });

    if (events.length === 0) return;

    // Limit display to latest 20 by default, expandable
    var maxShow = 15;
    var hasMore = events.length > maxShow;
    var displayEvents = hasMore ? events.slice(events.length - maxShow) : events;

    var timelineHtml = displayEvents.map(function(ev) {
        var dateStr = '';
        if (ev.date) {
            try {
                var d = new Date(ev.date);
                dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                var timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                if (timeStr !== '00:00') dateStr += ' ' + timeStr;
            } catch(e) {}
        }
        return '<div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
            '<div style="font-size:1.1rem;flex-shrink:0;width:28px;text-align:center;">' + ev.icon + '</div>' +
            '<div style="flex:1;font-size:0.82rem;color:var(--text-bright,#fff);line-height:1.4;">' + ev.text + '</div>' +
            (dateStr ? '<div style="font-size:0.7rem;color:var(--text-muted,#94a3b8);white-space:nowrap;flex-shrink:0;">' + dateStr + '</div>' : '') +
          '</div>';
    }).join('');

    var allEventsHtml = '';
    if (hasMore) {
        allEventsHtml = events.slice(0, events.length - maxShow).map(function(ev) {
            var dateStr = '';
            if (ev.date) {
                try { var d = new Date(ev.date); dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); } catch(e) {}
            }
            return '<div style="display:flex;gap:12px;align-items:flex-start;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
                '<div style="font-size:1rem;flex-shrink:0;width:28px;text-align:center;">' + ev.icon + '</div>' +
                '<div style="flex:1;font-size:0.78rem;color:var(--text-muted,#94a3b8);line-height:1.4;">' + ev.text + '</div>' +
                (dateStr ? '<div style="font-size:0.65rem;color:var(--text-muted,#64748b);white-space:nowrap;flex-shrink:0;">' + dateStr + '</div>' : '') +
              '</div>';
        }).join('');
    }

    container.innerHTML = '<div class="mt-5">' +
      '<details>' +
        '<summary style="cursor:pointer;font-size:1.1rem;font-weight:700;color:var(--text-bright,#fff);padding:12px 0;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.1));">' +
          '📜 Histórico de Atividades <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted,#94a3b8);">(' + events.length + ' eventos)</span>' +
        '</summary>' +
        '<div style="padding:8px 0;">' +
          (hasMore ? '<details style="margin-bottom:8px;"><summary style="cursor:pointer;font-size:0.75rem;color:var(--text-muted,#64748b);padding:4px 0;">Ver ' + (events.length - maxShow) + ' eventos anteriores...</summary><div>' + allEventsHtml + '</div></details>' : '') +
          timelineHtml +
        '</div>' +
      '</details>' +
    '</div>';
};

// Renders the persistent matchHistory block for a given uid's records.
// Splits casual vs tournament, aggregates serve/receive/killer/breaks/streaks,
// and produces head-to-head + partnership tables. Records are written per-player
// to users/{uid}/matchHistory so they survive tournament/casual deletion.
window._renderPersistentMatchStats = function(records, uid) {
    var _safe = window._safeHtml || function(s) { return String(s == null ? '' : s); };
    var casual = [], tournament = [];
    for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.matchType === 'casual') casual.push(r);
        else if (r.matchType === 'tournament') tournament.push(r);
    }

    function _aggregate(recs) {
        // Process chronologically (oldest → newest) so the win-streak count is correct.
        var sorted = recs.slice().sort(function(a, b) { return (a.finishedAt || '').localeCompare(b.finishedAt || ''); });
        var agg = { matches:0, wins:0, losses:0, draws:0,
            setsWon:0, setsLost:0, gamesWon:0, gamesLost:0, pointsWon:0, pointsLost:0,
            breaks:0, killerPoints:0,
            servePts:0, servePtsWon:0, receivePts:0, receivePtsWon:0,
            holdsServed:0, holdsWon:0,
            longestPointStreak:0, longestWinStreak:0, biggestLead:0,
            totalDurationMs:0, durationMatches:0,
            longestPointMs:0, shortestPointMs:null,
            avgPointMsSum:0, avgPointMatches:0,
            tbWon:0, tbLost:0, tbPlayed:0, tbPointsSum:0, tbMaxPoints:0, tbMinPoints:null,
            tbWonPointsSum:0, tbLostPointsSum:0,
            tbWonMax:0, tbWonMin:null, tbLostMax:0, tbLostMin:null };
        var curWinStreak = 0;
        for (var i = 0; i < sorted.length; i++) {
            var r = sorted[i];
            // v1.3.63-beta: partidas sem vencedor definido (abandoned/force-finish
            // com empate ou winner===0) não contam nas estatísticas.
            if (r.winnerTeam !== 1 && r.winnerTeam !== 2) continue;
            var mySlot = (r.players || []).find(function(p) { return p.uid === uid; });
            if (!mySlot) continue;
            var myTeam = mySlot.team;
            var oppTeam = myTeam === 1 ? 2 : 1;
            agg.matches++;
            var w = r.winnerTeam;
            if (w === 0) { agg.draws++; curWinStreak = 0; }
            else if (w === myTeam) {
                agg.wins++; curWinStreak++;
                if (curWinStreak > agg.longestWinStreak) agg.longestWinStreak = curWinStreak;
            }
            else { agg.losses++; curWinStreak = 0; }
            var mine = r.stats && (myTeam === 1 ? r.stats.team1 : r.stats.team2);
            var theirs = r.stats && (oppTeam === 1 ? r.stats.team1 : r.stats.team2);
            if (mine) {
                agg.pointsWon += mine.points || 0;
                agg.gamesWon += mine.games || 0;
                agg.setsWon += mine.sets || 0;
                agg.breaks += mine.breaks || 0;
                agg.killerPoints += mine.deucePtsWon || 0;
                agg.servePts += mine.servePtsPlayed || 0;
                agg.servePtsWon += mine.servePtsWon || 0;
                agg.receivePts += mine.receivePtsPlayed || 0;
                agg.receivePtsWon += mine.receivePtsWon || 0;
                if ((mine.longestStreak || 0) > agg.longestPointStreak) agg.longestPointStreak = mine.longestStreak;
                if ((mine.biggestLead || 0) > agg.biggestLead) agg.biggestLead = mine.biggestLead;
            }
            if (theirs) {
                agg.pointsLost += theirs.points || 0;
                agg.gamesLost += theirs.games || 0;
                agg.setsLost += theirs.sets || 0;
            }
            // Tiebreak stats — iterate per-set tiebreak entries in r.sets[].
            // Schema varies: {p1,p2} (persistent record from state.sets) or
            // {pointsP1,pointsP2} (legacy tournament m.sets saves). Handle both.
            if (Array.isArray(r.sets)) {
                for (var sIdx = 0; sIdx < r.sets.length; sIdx++) {
                    var _tbSet = r.sets[sIdx];
                    var _tb = _tbSet && _tbSet.tiebreak;
                    if (!_tb) continue;
                    var _tbP1 = (typeof _tb.p1 === 'number') ? _tb.p1 : (typeof _tb.pointsP1 === 'number' ? _tb.pointsP1 : null);
                    var _tbP2 = (typeof _tb.p2 === 'number') ? _tb.p2 : (typeof _tb.pointsP2 === 'number' ? _tb.pointsP2 : null);
                    if (_tbP1 === null || _tbP2 === null) continue;
                    var _myPts = myTeam === 1 ? _tbP1 : _tbP2;
                    var _oppPts = myTeam === 1 ? _tbP2 : _tbP1;
                    if (_myPts > _oppPts) {
                        // Won TB: track MY (winning) score — max = highest I scored when winning
                        // a TB, min = tightest/lowest my winning score (e.g. clean 7-x sweep).
                        agg.tbWon++;
                        agg.tbWonPointsSum += _myPts;
                        if (_myPts > agg.tbWonMax) agg.tbWonMax = _myPts;
                        if (agg.tbWonMin === null || _myPts < agg.tbWonMin) agg.tbWonMin = _myPts;
                    } else if (_oppPts > _myPts) {
                        // Lost TB: track OPPONENT (winning) score — max = opponent's blow-out
                        // score when they beat me, min = opponent's closest winning score (e.g.
                        // 9-7 after extra points), not MY loser's score.
                        agg.tbLost++;
                        agg.tbLostPointsSum += _oppPts;
                        if (_oppPts > agg.tbLostMax) agg.tbLostMax = _oppPts;
                        if (agg.tbLostMin === null || _oppPts < agg.tbLostMin) agg.tbLostMin = _oppPts;
                    }
                    agg.tbPlayed++;
                    agg.tbPointsSum += _myPts;
                    if (_myPts > agg.tbMaxPoints) agg.tbMaxPoints = _myPts;
                    if (agg.tbMinPoints === null || _myPts < agg.tbMinPoints) agg.tbMinPoints = _myPts;
                }
            }
            // Per-player holds (saque mantido) — lives in playerStats[name], keyed by display name.
            var myPs = r.playerStats && mySlot.name && r.playerStats[mySlot.name];
            if (myPs) {
                agg.holdsServed += myPs.served || 0;
                agg.holdsWon += myPs.held || 0;
            }
            if (typeof r.durationMs === 'number' && r.durationMs > 0) {
                agg.totalDurationMs += r.durationMs; agg.durationMatches++;
            }
            if (r.timeStats) {
                if (typeof r.timeStats.avgPointMs === 'number' && r.timeStats.avgPointMs > 0) {
                    agg.avgPointMsSum += r.timeStats.avgPointMs; agg.avgPointMatches++;
                }
                if (typeof r.timeStats.longestPointMs === 'number' && r.timeStats.longestPointMs > agg.longestPointMs) {
                    agg.longestPointMs = r.timeStats.longestPointMs;
                }
                if (typeof r.timeStats.shortestPointMs === 'number' && r.timeStats.shortestPointMs > 0) {
                    if (agg.shortestPointMs === null || r.timeStats.shortestPointMs < agg.shortestPointMs) {
                        agg.shortestPointMs = r.timeStats.shortestPointMs;
                    }
                }
            }
        }
        return agg;
    }

    // Placeholder names from the casual setup screen (empty participant slots)
    // should never populate the Top 5 Parceiros / Adversários lists.
    function _isPlaceholderName(n) {
        if (!n) return true;
        var s = String(n).trim().toLowerCase();
        if (!s) return true;
        // Exact generic labels
        if (s === 'parceiro' || s === 'partner') return true;
        if (s === 'oponente' || s === 'opponent' || s === 'adversário' || s === 'adversario') return true;
        // Numbered placeholders: "Jogador 2", "Player 3", "Adversário 1", "Oponente 2", "Parceiro 1"
        if (/^(jogador|player|parceiro|partner|oponente|opponent|adversário|adversario)\s*\d+$/i.test(s)) return true;
        return false;
    }

    function _computeH2hAndPartners(recs) {
        var h2h = {}, partners = {};
        for (var i = 0; i < recs.length; i++) {
            var r = recs[i];
            var ps = r.players || [];
            var me = ps.find(function(p) { return p.uid === uid; });
            if (!me) continue;
            var myTeam = me.team, w = r.winnerTeam;
            var didWin = w === myTeam, didDraw = w === 0;
            for (var j = 0; j < ps.length; j++) {
                var pj = ps[j];
                if (pj === me || pj.name === me.name) continue;
                // Skip placeholder names with no uid — anonymous empty slots from casual setup.
                if (!pj.uid && _isPlaceholderName(pj.name)) continue;
                var key = pj.uid || ('name:' + (pj.name || ''));
                var map = pj.team === myTeam ? partners : h2h;
                if (!map[key]) map[key] = { name: pj.name, uid: pj.uid || null, photoURL: pj.photoURL || null, played:0, wins:0, losses:0, draws:0 };
                map[key].played++;
                if (didDraw) map[key].draws++;
                else if (didWin) map[key].wins++;
                else map[key].losses++;
            }
        }
        return { h2h: h2h, partners: partners };
    }

    function _fmtDuration(ms) {
        if (!ms || ms <= 0) return '—';
        var mins = Math.round(ms / 60000);
        if (mins < 60) return mins + 'm';
        var h = Math.floor(mins / 60), m = mins % 60;
        return h + 'h' + (m > 0 ? (' ' + m + 'm') : '');
    }
    function _fmtPointTime(ms) {
        if (!ms || ms <= 0) return '—';
        var s = Math.round(ms / 1000);
        if (s < 60) return s + 's';
        return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    }

    // Diverging bar row: three-part header (left label · center metric · right label),
    // icons+numbers pushed to the extreme left/right edges of the row, bars diverging
    // from center proportional to totals.
    // Left side = losses (red), right side = wins (green) by default.
    // Casual icon is ⚡ (matches the dashboard "Partida Casual" button).
    // opts.leftClr / opts.rightClr override the default red/green (used by TB min/max
    // rows where both sides belong to the same semantic group — all-won or all-lost).
    function _diffBarRow(centerLabel, leftLabel, rightLabel, leftCasual, leftTourn, rightCasual, rightTourn, opts) {
        opts = opts || {};
        var totalL = (leftCasual || 0) + (leftTourn || 0);
        var totalR = (rightCasual || 0) + (rightTourn || 0);
        // v1.0.33-beta: barras agora são SHARE-OF-TOTAL (sum=100%) em vez de
        // max-relative (lado maior sempre em 100%). Bug reportado: bars davam
        // impressão de domínio total quando na verdade era ratio normal.
        // Combinado com o fix de pct sum=100% abaixo, garante que metade
        // visual e label numérico contem a mesma história.
        var sumLR = totalL + totalR;
        var lp, rp;
        if (sumLR > 0) {
            lp = Math.round(totalL / sumLR * 100);
            rp = 100 - lp; // garante sum=100, evita Math.round artifact
        } else {
            lp = 0;
            rp = 0;
        }
        var leftClr = opts.leftClr || '#ef4444', rightClr = opts.rightClr || '#22c55e';
        // Percentages per source: left vs right within the same source (tournament
        // or casual). Ex: na linha Derrotas/Vitórias, derrota-tourn% = 0/(0+3)*100
        // e vitória-tourn% = 3/(0+3)*100. Dá "0 (0%) ... 3 (100%)" por fonte.
        // noPct=true desabilita para métricas de média/mín/máx onde o par não é
        // somável (ex: "TB Vencidos mínimo/máximo").
        // v1.0.33-beta fix: pct{L,R} = (100 - other) em vez de Math.round
        // independente — bug reportado pelo user "soma do realizado pelo meu
        // time e o time adversário não somavam 100%". Math.round em ambos pode
        // dar 50.5+50.5 → 51+51 = 102. Agora garantido sum=100 sempre.
        var tournSum = (leftTourn || 0) + (rightTourn || 0);
        var casualSum = (leftCasual || 0) + (rightCasual || 0);
        var pctLT = !opts.noPct && tournSum > 0 ? Math.round((leftTourn || 0) / tournSum * 100) : null;
        var pctRT = !opts.noPct && tournSum > 0 ? (100 - pctLT) : null;
        var pctLC = !opts.noPct && casualSum > 0 ? Math.round((leftCasual || 0) / casualSum * 100) : null;
        var pctRC = !opts.noPct && casualSum > 0 ? (100 - pctLC) : null;
        // Column layout: icon on top, value row below. When pct exists, pct is the
        // prominent large number and abs is small parenthetical on the right.
        // When pct is null (noPct mode: means/min/max), abs is shown large alone.
        // v1.0.33-beta: data-stat-count nos spans pra animação count-up 0→target.
        var col = function(icon, val, clr, pct) {
            var absVal = (val == null ? 0 : val);
            var mainRow;
            if (pct !== null && pct !== undefined) {
                mainRow = '<div style="display:flex;align-items:baseline;gap:3px;">' +
                    '<span data-stat-count="' + pct + '" data-stat-count-suffix="%" style="font-size:0.9rem;font-weight:900;color:' + clr + ';font-variant-numeric:tabular-nums;line-height:1;">0%</span>' +
                    '<span data-stat-count="' + absVal + '" data-stat-count-prefix="(" data-stat-count-suffix=")" style="font-size:0.58rem;font-weight:600;color:' + clr + ';opacity:0.65;font-variant-numeric:tabular-nums;line-height:1;">(0)</span>' +
                '</div>';
            } else {
                mainRow = '<span data-stat-count="' + absVal + '" style="font-size:0.9rem;font-weight:900;color:' + clr + ';font-variant-numeric:tabular-nums;line-height:1;">0</span>';
            }
            return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
                '<span style="font-size:0.7rem;opacity:0.85;line-height:1;">' + icon + '</span>' +
                mainRow +
            '</div>';
        };
        return '<div style="display:flex;flex-direction:column;gap:4px;padding:6px 0;">' +
            // Header: [left label] [center metric] [right label]
            '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:baseline;">' +
                '<div style="font-size:0.62rem;font-weight:700;color:' + leftClr + ';text-transform:uppercase;letter-spacing:0.6px;text-align:left;">' + (leftLabel || '') + '</div>' +
                '<div style="font-size:0.72rem;font-weight:800;color:var(--text-bright,#fff);text-transform:uppercase;letter-spacing:0.8px;text-align:center;white-space:nowrap;">' + (centerLabel || '') + '</div>' +
                '<div style="font-size:0.62rem;font-weight:700;color:' + rightClr + ';text-transform:uppercase;letter-spacing:0.6px;text-align:right;">' + (rightLabel || '') + '</div>' +
            '</div>' +
            // Icons + numbers row: tournament at extreme edge, casual halfway between
            // center and tournament (via flex:1 spacers on both sides of casual).
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:end;">' +
                '<div style="display:flex;align-items:end;">' +
                    col('🏆', leftTourn, leftClr, pctLT) +
                    '<div style="flex:1;"></div>' +
                    col('⚡', leftCasual, leftClr, pctLC) +
                    '<div style="flex:1;"></div>' +
                '</div>' +
                '<div style="display:flex;align-items:end;">' +
                    '<div style="flex:1;"></div>' +
                    col('⚡', rightCasual, rightClr, pctRC) +
                    '<div style="flex:1;"></div>' +
                    col('🏆', rightTourn, rightClr, pctRT) +
                '</div>' +
            '</div>' +
            // Bars row: diverge from center. Animação on-scroll via data-stat-bar.
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:center;">' +
                '<div style="height:8px;border-radius:4px 0 0 4px;background:var(--stat-box-bg);display:flex;justify-content:flex-end;overflow:hidden;">' +
                    '<div data-stat-bar="' + lp + '" style="width:0%;height:100%;background:linear-gradient(90deg,' + leftClr + '44,' + leftClr + ');transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>' +
                '</div>' +
                '<div style="height:8px;border-radius:0 4px 4px 0;background:var(--stat-box-bg);display:flex;justify-content:flex-start;overflow:hidden;border-left:2px solid var(--border-color);">' +
                    '<div data-stat-bar="' + rp + '" style="width:0%;height:100%;background:linear-gradient(90deg,' + rightClr + ',' + rightClr + '44);transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // Dual-value diverging bar row for non-V/P metrics.
    // Left side = casuais (casual button blue #38bdf8), right side = torneios
    // (novo-torneio button dark blue #1e40af).
    // v1.0.39-beta: detecção automática de stat percentual via display string
    // ("67%", "60%"). Pra esses, bar reflete o VALOR DIRETO 0-100 (não
    // normalizado pelo max). Bug reportado: "essas barras azuis percentuais
    // estão enchendo visualmente a 100%. seria legal que tivessem o tamanho
    // proporcional ao percentual efetivo". Aproveitamento 67% agora pinta
    // 67% da barra, não 100%. Pra stats não-percentuais (Quebras, Maior
    // Sequência, Tempo Total) mantém max-relative — não há scale natural
    // 0-100 pra eles.
    function _dualBarRow(label, casualRaw, tournRaw, casualDisplay, tournDisplay) {
        var cVal = Number(casualRaw) || 0;
        var tVal = Number(tournRaw) || 0;
        var isPctStat = (typeof casualDisplay === 'string' && /%\s*$/.test(casualDisplay))
                     || (typeof tournDisplay === 'string' && /%\s*$/.test(tournDisplay));
        var cp, tp;
        if (isPctStat) {
            // Percentual: usa o próprio valor (clamped 0-100). 67 → barra 67%.
            cp = Math.max(0, Math.min(100, Math.round(cVal)));
            tp = Math.max(0, Math.min(100, Math.round(tVal)));
        } else {
            // Absoluto sem scale natural — max-relative pra mostrar quem é maior.
            var maxV = Math.max(cVal, tVal, 1);
            cp = Math.round(cVal / maxV * 100);
            tp = Math.round(tVal / maxV * 100);
        }
        var casualClr = '#38bdf8';  // casual button
        var tournClr = '#1e40af';   // tournament button
        return '<div style="display:flex;flex-direction:column;gap:4px;padding:6px 0;">' +
            // Header: [casuais] [metric name] [torneios]
            '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:baseline;">' +
                '<div style="font-size:0.58rem;font-weight:700;color:' + casualClr + ';text-transform:uppercase;letter-spacing:0.6px;text-align:left;">casuais</div>' +
                '<div style="font-size:0.72rem;font-weight:800;color:var(--text-bright,#fff);text-transform:uppercase;letter-spacing:0.8px;text-align:center;white-space:nowrap;">' + label + '</div>' +
                '<div style="font-size:0.58rem;font-weight:700;color:' + tournClr + ';text-transform:uppercase;letter-spacing:0.6px;text-align:right;">torneios</div>' +
            '</div>' +
            // Icons + values pushed to extreme edges (⚡ left, 🏆 right).
            // v1.0.33-beta: spans com data-stat-count quando o display é
            // numérico simples (animação count-up). Strings de média/min/max
            // não são animáveis então renderizamos direto.
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:end;">' +
                '<div style="display:flex;justify-content:flex-start;gap:6px;align-items:baseline;">' +
                    '<span style="font-size:0.72rem;opacity:0.9;line-height:1;">⚡</span>' +
                    '<span style="font-size:0.92rem;font-weight:900;color:' + casualClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + casualDisplay + '</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:flex-end;gap:6px;align-items:baseline;">' +
                    '<span style="font-size:0.92rem;font-weight:900;color:' + tournClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + tournDisplay + '</span>' +
                    '<span style="font-size:0.72rem;opacity:0.9;line-height:1;">🏆</span>' +
                '</div>' +
            '</div>' +
            // Bars diverge from center — max-relative (valores independentes:
            // casuais vs torneios não somam 100%, são fontes diferentes).
            // Animação on-scroll via data-stat-bar.
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:center;">' +
                '<div style="height:8px;border-radius:4px 0 0 4px;background:var(--stat-box-bg);display:flex;justify-content:flex-end;overflow:hidden;">' +
                    '<div data-stat-bar="' + cp + '" style="width:0%;height:100%;background:linear-gradient(90deg,' + casualClr + '44,' + casualClr + ');transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>' +
                '</div>' +
                '<div style="height:8px;border-radius:0 4px 4px 0;background:var(--stat-box-bg);display:flex;justify-content:flex-start;overflow:hidden;border-left:2px solid var(--border-color);">' +
                    '<div data-stat-bar="' + tp + '" style="width:0%;height:100%;background:linear-gradient(90deg,' + tournClr + ',' + tournClr + '44);transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // Percentage helper — returns {raw, display}. raw is null when denominator is 0.
    function _pct(num, den) {
        if (!den || den <= 0) return { raw: 0, display: '—' };
        var p = Math.round(num / den * 100);
        return { raw: p, display: p + '%' };
    }

    // Unified stats block — merges casual + tournament into one section with diverging
    // bar rows for win/loss metrics and dual-value boxes for single-value metrics.
    function _unifiedStatsHtml(casualRecs, tournRecs, casualRel, tournRel) {
        var c = _aggregate(casualRecs || []);
        var t = _aggregate(tournRecs || []);
        var totalMatches = c.matches + t.matches;
        var badge = totalMatches + ' partida' + (totalMatches === 1 ? '' : 's') +
            ' · ⚡ ' + c.matches + ' · 🏆 ' + t.matches;

        // Percentage metrics — raw is the percent, display is "NN%" or "—"
        var apC = _pct(c.wins, c.matches), apT = _pct(t.wins, t.matches);
        var svC = _pct(c.servePtsWon, c.servePts), svT = _pct(t.servePtsWon, t.servePts);
        var rcC = _pct(c.receivePtsWon, c.receivePts), rcT = _pct(t.receivePtsWon, t.receivePts);
        var hdC = _pct(c.holdsWon, c.holdsServed), hdT = _pct(t.holdsWon, t.holdsServed);

        // Time metrics — raw is milliseconds, display is formatted
        var durCms = c.totalDurationMs || 0, durTms = t.totalDurationMs || 0;
        var durCdisp = durCms > 0 ? _fmtDuration(durCms) : '—';
        var durTdisp = durTms > 0 ? _fmtDuration(durTms) : '—';
        var avgPtCms = c.avgPointMatches > 0 ? (c.avgPointMsSum / c.avgPointMatches) : 0;
        var avgPtTms = t.avgPointMatches > 0 ? (t.avgPointMsSum / t.avgPointMatches) : 0;
        var avgPtCdisp = avgPtCms > 0 ? _fmtPointTime(avgPtCms) : '—';
        var avgPtTdisp = avgPtTms > 0 ? _fmtPointTime(avgPtTms) : '—';
        var longPtCms = c.longestPointMs || 0, longPtTms = t.longestPointMs || 0;
        var longPtCdisp = longPtCms > 0 ? _fmtPointTime(longPtCms) : '—';
        var longPtTdisp = longPtTms > 0 ? _fmtPointTime(longPtTms) : '—';
        var shortPtCms = c.shortestPointMs || 0, shortPtTms = t.shortestPointMs || 0;
        var shortPtCdisp = shortPtCms > 0 ? _fmtPointTime(shortPtCms) : '—';
        var shortPtTdisp = shortPtTms > 0 ? _fmtPointTime(shortPtTms) : '—';

        // Tiebreak split metrics — averages in won vs lost TBs, and min/max pts in a
        // single won TB / single lost TB. All values are "my" points scored in that TB.
        var tbAvgWonCraw = c.tbWon > 0 ? (c.tbWonPointsSum / c.tbWon) : 0;
        var tbAvgWonTraw = t.tbWon > 0 ? (t.tbWonPointsSum / t.tbWon) : 0;
        var tbAvgLostCraw = c.tbLost > 0 ? (c.tbLostPointsSum / c.tbLost) : 0;
        var tbAvgLostTraw = t.tbLost > 0 ? (t.tbLostPointsSum / t.tbLost) : 0;
        var tbWonMinCraw = c.tbWon > 0 && c.tbWonMin !== null ? c.tbWonMin : 0;
        var tbWonMinTraw = t.tbWon > 0 && t.tbWonMin !== null ? t.tbWonMin : 0;
        var tbWonMaxCraw = c.tbWon > 0 ? c.tbWonMax : 0;
        var tbWonMaxTraw = t.tbWon > 0 ? t.tbWonMax : 0;
        var tbLostMinCraw = c.tbLost > 0 && c.tbLostMin !== null ? c.tbLostMin : 0;
        var tbLostMinTraw = t.tbLost > 0 && t.tbLostMin !== null ? t.tbLostMin : 0;
        var tbLostMaxCraw = c.tbLost > 0 ? c.tbLostMax : 0;
        var tbLostMaxTraw = t.tbLost > 0 ? t.tbLostMax : 0;

        var html = _sectionShell('persist-stats-unified', 'Desempenho', '📊', '#a855f7', badge);

        // Diverging bar rows — row 1 has no center metric (wins/losses IS the metric),
        // rows 2+ show metric in center with "perdidos"/"vencidos" at the sides.
        // TB breakdown rows follow the Tiebreaks row so all tie-break metrics stay grouped.
        var tbBreakdownRows = '';
        if ((c.tbPlayed + t.tbPlayed) > 0) {
            tbBreakdownRows =
                _diffBarRow('Pontos TB Médios', 'perdidos', 'vencidos',
                    Math.round(tbAvgLostCraw * 10) / 10, Math.round(tbAvgLostTraw * 10) / 10,
                    Math.round(tbAvgWonCraw * 10) / 10, Math.round(tbAvgWonTraw * 10) / 10,
                    { noPct: true }) +
                _diffBarRow('TB Vencidos', 'mínimo', 'máximo',
                    tbWonMinCraw, tbWonMinTraw, tbWonMaxCraw, tbWonMaxTraw,
                    { leftClr: '#22c55e', rightClr: '#22c55e', noPct: true }) +
                _diffBarRow('TB Perdidos', 'mínimo', 'máximo',
                    tbLostMinCraw, tbLostMinTraw, tbLostMaxCraw, tbLostMaxTraw,
                    { leftClr: '#ef4444', rightClr: '#ef4444', noPct: true });
        }
        html += '<div style="display:flex;flex-direction:column;gap:2px;margin-top:2px;">' +
            _diffBarRow('', 'Derrotas', 'Vitórias', c.losses, t.losses, c.wins, t.wins) +
            _diffBarRow('Sets', 'perdidos', 'vencidos', c.setsLost, t.setsLost, c.setsWon, t.setsWon) +
            _diffBarRow('Games', 'perdidos', 'vencidos', c.gamesLost, t.gamesLost, c.gamesWon, t.gamesWon) +
            _diffBarRow('Pontos', 'perdidos', 'vencidos', c.pointsLost, t.pointsLost, c.pointsWon, t.pointsWon) +
            _diffBarRow('Tiebreaks', 'perdidos', 'vencidos', c.tbLost, t.tbLost, c.tbWon, t.tbWon) +
            tbBreakdownRows +
        '</div>';

        // Supplementary stats — casuais left (light blue), torneios right (dark blue)
        html += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:2px;">' +
            _dualBarRow('Aproveitamento', apC.raw, apT.raw, apC.display, apT.display) +
            _dualBarRow('% Saque', svC.raw, svT.raw, svC.display, svT.display) +
            _dualBarRow('% Recepção', rcC.raw, rcT.raw, rcC.display, rcT.display) +
            _dualBarRow('Games Mantidos', hdC.raw, hdT.raw, hdC.display, hdT.display) +
            _dualBarRow('Quebras', c.breaks, t.breaks, String(c.breaks), String(t.breaks)) +
            _dualBarRow('Maior Seq. Pontos', c.longestPointStreak, t.longestPointStreak, String(c.longestPointStreak), String(t.longestPointStreak)) +
            _dualBarRow('Maior Seq. Vitórias', c.longestWinStreak, t.longestWinStreak, String(c.longestWinStreak), String(t.longestWinStreak)) +
            _dualBarRow('Tempo Total', durCms, durTms, durCdisp, durTdisp) +
            _dualBarRow('Média por Ponto', avgPtCms, avgPtTms, avgPtCdisp, avgPtTdisp) +
            _dualBarRow('Ponto Mais Longo', longPtCms, longPtTms, longPtCdisp, longPtTdisp) +
            _dualBarRow('Ponto Mais Curto', shortPtCms, shortPtTms, shortPtCdisp, shortPtTdisp) +
        '</div>';

        // Top 5 Parceiros / Adversários — keep per-source separation (casual vs torneios
        // involve different relationships) but render inside the unified section.
        var relHtml = '';
        if (casualRel) {
            var cp = _tableHtml('⚡ Top 3 Parceiros — Casuais', casualRel.partners);
            var ch = _tableHtml('⚡ Top 3 Adversários — Casuais', casualRel.h2h);
            relHtml += cp + ch;
        }
        if (tournRel) {
            var tp = _tableHtml('🏆 Top 3 Parceiros — Torneios', tournRel.partners);
            var th = _tableHtml('🏆 Top 3 Adversários — Torneios', tournRel.h2h);
            relHtml += tp + th;
        }
        html += relHtml;
        html += '</div>';
        return html;
    }

    function _tableHtml(title, map) {
        var arr = Object.keys(map).map(function(k) { return map[k]; });
        if (!arr.length) return '';
        arr.sort(function(a, b) { return b.played - a.played; });
        var top = arr.slice(0, 3);
        var h = '<div style="margin-top:10px;">' +
            '<div style="font-size:0.72rem;font-weight:700;color:var(--text-bright,#fff);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">' + title + '</div>';
        for (var i = 0; i < top.length; i++) {
            var e = top[i];
            var wr = e.played > 0 ? Math.round(e.wins / e.played * 100) : 0;
            var av = window._avatarHtml({ photoURL: e.photoURL, displayName: e.name }, 26);
            h += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--info-pill-bg);border:1px solid var(--border-color);border-radius:8px;margin-bottom:3px;">' +
                av +
                '<span style="flex:1;min-width:0;font-size:0.78rem;color:var(--text-main,#e5e7eb);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _safe(e.name || 'Jogador') + '</span>' +
                '<span style="font-size:0.68rem;color:var(--success-color,#22c55e);font-weight:700;">' + e.wins + 'V</span>' +
                '<span style="font-size:0.68rem;color:var(--danger-color,#ef4444);font-weight:700;">' + e.losses + 'D</span>' +
                (e.draws ? '<span style="font-size:0.68rem;color:var(--text-muted,#94a3b8);font-weight:700;">' + e.draws + 'E</span>' : '') +
                '<span style="font-size:0.7rem;color:' + (wr >= 50 ? 'var(--success-color,#22c55e)' : 'var(--danger-color,#ef4444)') + ';font-weight:800;min-width:36px;text-align:right;">' + wr + '%</span>' +
            '</div>';
        }
        h += '</div>';
        return h;
    }

    var casualRel = _computeH2hAndPartners(casual);
    var tournRel = _computeH2hAndPartners(tournament);

    return '<div style="border-top:1px solid var(--border-color,rgba(255,255,255,0.1));padding-top:10px;">' +
        '<div style="font-size:0.82rem;font-weight:700;color:var(--text-bright,#fff);margin-bottom:4px;">📊 Estatísticas Detalhadas</div>' +
        '<div style="font-size:0.65rem;color:var(--text-muted,#94a3b8);margin-bottom:6px;">Partidas casuais ⚡ e torneios 🏆.</div>' +
        _unifiedStatsHtml(casual, tournament, casualRel, tournRel) +
    '</div>';
};
