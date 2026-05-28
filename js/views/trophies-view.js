// scoreplace.app — Trophies View
// v1.0.0-beta
//
// Página de Troféus e Conquistas acessível via #trofeus.
// Mostra:
//   • XP total + nível + barra de progresso
//   • Estatísticas de resumo (troféus ganhos, milestones, rank)
//   • Ranking de amigos (métrica selecionável)
//   • Grid de troféus fixos (conquistados e não-conquistados)
//   • Lista de milestones com progresso visual (barra aritmética)
//
// Padrão: window.renderTrophiesPage(container) + _renderBackHeader + router #trofeus

(function() {
  'use strict';

  function _s(str) {
    if (typeof window._safeHtml === 'function') return window._safeHtml(str);
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Helpers visuais ──────────────────────────────────────────────────────

  function _tierBadge(tier) {
    var map = { bronze: '🥉 Bronze', prata: '🥈 Prata', ouro: '🥇 Ouro', platina: '✨ Platina' };
    return map[tier] || tier || '';
  }

  function _tierStyle(tier) {
    var c = (window.TROPHY_TIER_COLORS || {})[tier];
    if (!c) return '';
    return 'background:' + c.bg + ';border:1px solid ' + c.border + ';box-shadow:0 0 8px ' + c.glow + ';';
  }

  function _tierTextStyle(tier) {
    var c = (window.TROPHY_TIER_COLORS || {})[tier];
    if (!c) return '';
    return 'color:' + c.text + ';font-weight:700;';
  }

  // ─── Renderiza card de troféu individual ─────────────────────────────────
  // Route helper — maps a locked trophy to the section where user can earn it
  function _trophyRoute(trophy) {
    var cat = trophy.category;
    if (cat === 'perfil')   return '#profile';
    if (cat === 'casual')   return '__casual__';   // abre partida casual diretamente
    if (cat === 'presenca') return '#place';
    if (cat === 'social')   return '#explore';
    if (cat === 'torneio')  return '__torneio__';  // dashboard com inscrições ou cria torneio
    return null; // especial: sem rota específica
  }

  function _trophyCard(trophy, awarded, tier, pct) {
    var locked = !awarded;
    var style = locked ? '' : _tierStyle(tier);
    var nameStyle = locked ? 'color:var(--text-muted);' : _tierTextStyle(tier);
    var lockIcon = locked ? '🔒 ' : '';
    var iconOpacity = locked ? 'opacity:0.35;' : '';
    var pctLabel = (typeof pct === 'number') ? ' (' + pct + '%)' : '';
    var badgeHtml;
    if (!locked && tier) {
      // Conquistado: badge de tier + percentual de usuários que completou
      badgeHtml = '<div class="trophy-tier-badge" style="' + _tierTextStyle(tier) + 'font-size:0.7rem;margin-top:2px;">' + _tierBadge(tier) + pctLabel + '</div>';
    } else if (pctLabel) {
      // Não conquistado: só mostra raridade como dica
      badgeHtml = '<div class="trophy-tier-badge" style="color:var(--text-muted);font-size:0.68rem;margin-top:2px;opacity:0.8;">' + pct + '% completaram</div>';
    } else {
      badgeHtml = '';
    }
    var awardedHtml = (awarded && awarded.awardedAt)
      ? '<div class="trophy-awarded-date">Conquistado em ' + new Date(awarded.awardedAt).toLocaleDateString('pt-BR') + '</div>'
      : '';

    // Tick verde no canto superior direito dos trofeus conquistados
    var tickHtml = !locked ? '<div class="trophy-earned-tick">&#10003;</div>' : '';

    // Clique nos nao-conquistados navega/age para completar a missão
    var route      = locked ? _trophyRoute(trophy) : null;
    var clickAttr  = '';
    var extraStyle = '';
    var navHint    = '';
    if (!locked) {
      // Troféu já conquistado: replay do overlay ao clicar
      clickAttr  = 'onclick="if(typeof window._trophyReplayOverlay===\'function\')window._trophyReplayOverlay(\'' + trophy.id + '\')"';
      extraStyle = 'cursor:pointer;';
    } else if (route === '__casual__') {
      clickAttr  = 'onclick="if(typeof window._trophyOpenCasual===\'function\')window._trophyOpenCasual()"';
      extraStyle = 'cursor:pointer;';
      navHint    = '<div class="trophy-nav-hint">Iniciar partida →</div>';
    } else if (route === '__torneio__') {
      clickAttr  = 'onclick="if(typeof window._trophyGoToTournament===\'function\')window._trophyGoToTournament()"';
      extraStyle = 'cursor:pointer;';
      navHint    = '<div class="trophy-nav-hint">Ver torneios →</div>';
    } else if (route) {
      clickAttr  = 'onclick="window.location.hash=\'' + route + '\'"';
      extraStyle = 'cursor:pointer;';
      navHint    = '<div class="trophy-nav-hint">Ir lá →</div>';
    }

    return '<div class="trophy-card ' + (locked ? 'trophy-locked' : 'trophy-earned') + '" ' +
           clickAttr + ' ' +
           'style="' + extraStyle + style + '" ' +
           'title="' + _s(trophy.desc) + '">' +
      tickHtml +
      '<div class="trophy-card-icon" style="' + iconOpacity + '">' + (trophy.icon || '🏅') + '</div>' +
      '<div class="trophy-card-name" style="' + nameStyle + '">' + lockIcon + _s(trophy.title) + '</div>' +
      badgeHtml +
      '<div class="trophy-card-desc">' + _s(trophy.desc) + '</div>' +
      awardedHtml +
      navHint +
    '</div>';
  }

  // ─── Renderiza barra de progresso de milestone ───────────────────────────
  function _milestoneBar(milestone, currentValue, currentLevel) {
    currentValue = currentValue || 0;
    currentLevel = currentLevel || 0;

    var nextLevel = currentLevel + 1;
    var nextThreshold = window._milestoneThresholdAt
      ? window._milestoneThresholdAt(milestone, nextLevel)
      : (milestone.startAt + milestone.step * (nextLevel - 1));
    var prevThreshold = currentLevel > 0 && window._milestoneThresholdAt
      ? window._milestoneThresholdAt(milestone, currentLevel)
      : 0;

    var pct = 0;
    if (nextThreshold > prevThreshold) {
      pct = Math.min(100, Math.round(((currentValue - prevThreshold) / (nextThreshold - prevThreshold)) * 100));
    }
    if (currentValue >= nextThreshold) pct = 100;

    var tier = currentLevel > 0 && window._milestoneTierFromLevel
      ? window._milestoneTierFromLevel(currentLevel)
      : null;
    var nextTier = window._milestoneTierFromLevel ? window._milestoneTierFromLevel(nextLevel) : 'bronze';
    var tierC = (window.TROPHY_TIER_COLORS || {})[tier || 'bronze'] || {};
    var barColor = tierC.text || 'var(--primary-color)';
    var levelLabel = currentLevel > 0
      ? ('Nível ' + currentLevel + (tier ? ' · ' + _tierBadge(tier) : ''))
      : 'Ainda não iniciado';

    return '<div class="milestone-row">' +
      '<div class="milestone-header">' +
        '<span class="milestone-icon">' + (milestone.icon || '🏅') + '</span>' +
        '<span class="milestone-title">' + _s(milestone.titleFn ? milestone.titleFn(currentValue) : milestone.id) + '</span>' +
        '<span class="milestone-level">' + levelLabel + '</span>' +
      '</div>' +
      '<div class="milestone-progress">' +
        '<div class="milestone-bar-bg">' +
          '<div class="milestone-bar-fill" style="width:' + pct + '%;background:' + barColor + ';"></div>' +
        '</div>' +
        '<div class="milestone-progress-text">' +
          currentValue + ' / ' + nextThreshold +
          ' <span class="milestone-next-tier">→ ' + _tierBadge(nextTier) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Renderiza ranking de amigos ─────────────────────────────────────────
  function _renderFriendRanking(containerId, entries, uid) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (!entries || !entries.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:12px 0;">Adicione amigos para ver o ranking!</p>';
      return;
    }

    var html = '<ol class="trophy-ranking-list">';
    entries.forEach(function(e, i) {
      var isMe = e.uid === uid;
      var medals = ['🥇', '🥈', '🥉'];
      var medal = medals[i] || (i + 1) + '.';
      var meStyle = isMe ? 'background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);' : '';
      html += '<li class="trophy-ranking-item" style="' + meStyle + '">' +
        '<span class="trophy-ranking-pos">' + medal + '</span>' +
        '<span class="trophy-ranking-name">' + _s(e.name) + (isMe ? ' <span style="color:var(--primary-color);">(você)</span>' : '') + '</span>' +
        '<span class="trophy-ranking-value">' + e.value + '</span>' +
      '</li>';
    });
    html += '</ol>';
    el.innerHTML = html;
  }


  // ─── Friend trophy comparison ──────────────────────────────────────────────────
  // Loads friends' _trophyIds (flat array written by backfill/scheduler) and
  // renders a side-by-side comparison: you have / both have / friend has.
  async function _loadFriendsComparisonData(cu, myEarnedIds) {
    if (!cu || !cu.friends || !cu.friends.length) return [];
    var db = window.FirestoreDB && window.FirestoreDB.db;
    if (!db) return [];

    // Resolve friend UIDs (some entries may be emails from old schema)
    var friendUids = (cu.friends || []).filter(function(f) {
      return f && f.indexOf('@') === -1; // only UIDs
    }).slice(0, 20); // cap at 20 friends for performance

    if (!friendUids.length) return [];

    var mySet = {};
    (myEarnedIds || []).forEach(function(id) { mySet[id] = true; });

    var results = [];
    // Fetch in batches of 10
    for (var i = 0; i < friendUids.length; i += 10) {
      var batch = friendUids.slice(i, i + 10);
      var refs = batch.map(function(uid) { return db.collection('users').doc(uid); });
      try {
        var snaps = db.getAll
          ? await db.getAll.apply(db, refs)
          : await Promise.all(refs.map(function(r) { return r.get(); }));
        snaps.forEach(function(snap) {
          if (!snap.exists) return;
          var data = snap.data() || {};
          var name = data.displayName || data.email || snap.id;
          var trophyIds = Array.isArray(data._trophyIds) ? data._trophyIds : [];
          var friendSet = {};
          trophyIds.forEach(function(id) { friendSet[id] = true; });

          var onlyMe = myEarnedIds.filter(function(id) {
            var t = window.TROPHY_CATALOG_BY_ID && window.TROPHY_CATALOG_BY_ID[id];
            return t && !friendSet[id];
          });
          var both = myEarnedIds.filter(function(id) {
            var t = window.TROPHY_CATALOG_BY_ID && window.TROPHY_CATALOG_BY_ID[id];
            return t && friendSet[id];
          });
          var onlyFriend = trophyIds.filter(function(id) {
            var t = window.TROPHY_CATALOG_BY_ID && window.TROPHY_CATALOG_BY_ID[id];
            return t && !mySet[id];
          });

          results.push({
            uid: snap.id,
            name: name,
            photoURL: data.photoURL || '',
            trophyIds: trophyIds,
            onlyMe: onlyMe,
            both: both,
            onlyFriend: onlyFriend,
            totalFriend: trophyIds.length,
            totalMe: myEarnedIds.length
          });
        });
      } catch (e) {
        window._warn('[trophies] friend comparison load error:', e);
      }
    }

    // Sort: most similar first (most trophies in common)
    results.sort(function(a, b) { return b.both.length - a.both.length; });
    return results;
  }

  function _renderFriendComparison(container, friendsData, selectedFriendUid) {
    if (!friendsData || !friendsData.length) return;

    var selected = friendsData.find(function(f) { return f.uid === selectedFriendUid; }) || friendsData[0];
    var selUid = selected.uid;

    // Friend pills
    var pillsHtml = friendsData.map(function(f) {
      var isActive = f.uid === selUid;
      var initial = (f.name || '?')[0].toUpperCase();
      var avatarHtml = f.photoURL
        ? '<img src="' + _s(f.photoURL) + '" style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'">'
        : '<span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#4f46e5);display:inline-flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;flex-shrink:0;">' + initial + '</span>';
      var btnStyle = isActive
        ? 'display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;font-size:0.78rem;font-weight:600;cursor:pointer;'
        : 'display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border-color);font-size:0.78rem;font-weight:600;cursor:pointer;';
      var safeName = _s(window._firstToken(f.name));
      var safeUid = _s(f.uid);
      return '<button onclick="window._trophyCompareSelectFriend(\'' + safeUid + '\')" style="' + btnStyle + '">'
        + avatarHtml
        + '<span>' + safeName + '</span>'
        + '</button>';
    }).join('');

    // Stats row
    var friendFirstName = _s(window._firstToken(selected.name));
    var statsHtml =
      '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;margin-bottom:16px;text-align:center;">' +
        '<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:12px 8px;">' +
          '<div style="font-size:1.5rem;font-weight:800;color:#10b981;">' + selected.onlyMe.length + '</div>' +
          '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Só você</div>' +
        '</div>' +
        '<div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:12px 8px;">' +
          '<div style="font-size:1.5rem;font-weight:800;color:#6366f1;">' + selected.both.length + '</div>' +
          '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Em comum</div>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:12px 8px;">' +
          '<div style="font-size:1.5rem;font-weight:800;color:#fbbf24;">' + selected.onlyFriend.length + '</div>' +
          '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Só ' + friendFirstName + '</div>' +
        '</div>' +
      '</div>';

    // Trophy chips helper
    function _trophyChips(ids, accentColor, emptyMsg) {
      if (!ids || !ids.length) return '<p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 0;">' + emptyMsg + '</p>';
      return '<div style="display:flex;flex-wrap:wrap;gap:6px;">'
        + ids.slice(0, 12).map(function(id) {
          var t = window.TROPHY_CATALOG_BY_ID && window.TROPHY_CATALOG_BY_ID[id];
          if (!t) return '';
          return '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:20px;background:' + accentColor + ';font-size:0.72rem;font-weight:600;color:var(--text-bright);">'
            + t.icon + ' <span>' + _s(t.title) + '</span>'
            + '</span>';
        }).join('')
        + (ids.length > 12 ? '<span style="font-size:0.72rem;color:var(--text-muted);align-self:center;">+' + (ids.length - 12) + ' mais</span>' : '')
        + '</div>';
    }

    // Sections
    var sectionsHtml =
      (selected.onlyFriend.length > 0
        ? '<div style="margin-bottom:16px;">' +
            '<p style="font-size:0.8rem;font-weight:700;color:#fbbf24;margin:0 0 8px;">⭐ ' + friendFirstName + ' tem, você ainda não</p>' +
            _trophyChips(selected.onlyFriend, 'rgba(251,191,36,0.1)', '') +
          '</div>'
        : '') +
      (selected.onlyMe.length > 0
        ? '<div style="margin-bottom:16px;">' +
            '<p style="font-size:0.8rem;font-weight:700;color:#10b981;margin:0 0 8px;">✅ Você tem, ' + friendFirstName + ' ainda não</p>' +
            _trophyChips(selected.onlyMe, 'rgba(16,185,129,0.1)', '') +
          '</div>'
        : '') +
      (selected.both.length > 0
        ? '<div style="margin-bottom:0;">' +
            '<p style="font-size:0.8rem;font-weight:700;color:#6366f1;margin:0 0 8px;">🤝 Vocês dois conquistaram</p>' +
            _trophyChips(selected.both, 'rgba(99,102,241,0.1)', '') +
          '</div>'
        : '');

    container.innerHTML =
      '<div class="trophy-section">' +
        '<h2 class="trophy-section-title">🤝 Comparar com Amigos</h2>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' + pillsHtml + '</div>' +
        statsHtml +
        sectionsHtml +
      '</div>';
  }

  // ─── Página principal ─────────────────────────────────────────────────────
  window.renderTrophiesPage = function(container) {
    if (!container) return;

    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) {
      container.innerHTML = window._renderBackHeader({ label: 'Voltar', href: '#dashboard',
        middleHtml: '<h2 style="font-size:1rem;font-weight:700;flex:1;text-align:center;margin:0;">🏅 Troféus</h2>'
      }) + '<div style="padding:24px;text-align:center;color:var(--text-muted);">Faça login para ver seus troféus.</div>';
      return;
    }

    var uid = cu.uid;

    var hdr = window._renderBackHeader({
      label: 'Voltar',
      href: '#dashboard',
      middleHtml: '<h2 style="font-size:1rem;font-weight:700;flex:1;text-align:center;margin:0;">🏅 Troféus & Conquistas</h2>'
    });

    // Esqueleto enquanto carrega
    container.innerHTML = hdr +
      '<div id="trophies-page-body" style="padding:16px;max-width:760px;margin:0 auto;">' +
        '<div style="text-align:center;padding:48px 0;color:var(--text-muted);">Carregando conquistas...</div>' +
      '</div>';

    // Carrega dados em paralelo
    Promise.all([
      (window._loadUserTrophies ? window._loadUserTrophies(uid) : Promise.resolve({ trophies: {}, milestones: {} })),
      (window._getUserTrophyStats ? window._getUserTrophyStats(uid) : Promise.resolve({})),
      (window._loadTrophyStats ? window._loadTrophyStats() : Promise.resolve({ counts: {}, totalUsers: 1 }))
    ]).then(function(results) {
      var userTrophies = results[0].trophies || {};
      var userMilestones = results[0].milestones || {};
      var stats = results[1] || {};
      var tStats = results[2] || { counts: {}, totalUsers: 1 };

      // XP e nível
      var xp = window._calcUserXP ? window._calcUserXP(uid) : 0;
      var level = window._xpToLevel ? window._xpToLevel(xp) : 1;
      var rankInfo = window._levelToRankLabel ? window._levelToRankLabel(level) : { label: 'Bronze', icon: '🥉', color: '#cd7f32' };
      var xpInLevel = xp % 100;
      var earnedCount = Object.keys(userTrophies).length;
      var totalCount = (window.TROPHY_CATALOG || []).length;

      // ── SEÇÃO: XP + nível ──────────────────────────────────────────────
      var xpHtml =
        '<div class="trophy-xp-card">' +
          '<div class="trophy-xp-rank">' +
            '<span style="font-size:2rem;">' + rankInfo.icon + '</span>' +
            '<div>' +
              '<div style="font-size:1.1rem;font-weight:800;color:' + rankInfo.color + ';">' + rankInfo.label + ' · Nível ' + level + '</div>' +
              '<div style="font-size:0.82rem;color:var(--text-muted);">' + xp + ' XP total</div>' +
            '</div>' +
          '</div>' +
          '<div class="trophy-xp-bar-wrap">' +
            '<div class="trophy-xp-bar"><div class="trophy-xp-fill" style="width:' + xpInLevel + '%"></div></div>' +
            '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">' + xpInLevel + '/100 XP para nível ' + (level+1) + '</div>' +
          '</div>' +
          '<div class="trophy-xp-stats">' +
            '<div class="trophy-xp-stat"><span class="trophy-xp-stat-val">' + earnedCount + '</span><span class="trophy-xp-stat-lbl">Troféus</span></div>' +
            '<div class="trophy-xp-stat"><span class="trophy-xp-stat-val">' + (totalCount - earnedCount) + '</span><span class="trophy-xp-stat-lbl">Faltando</span></div>' +
            '<div class="trophy-xp-stat"><span class="trophy-xp-stat-val">' + Math.round((earnedCount/Math.max(1,totalCount))*100) + '%</span><span class="trophy-xp-stat-lbl">Completado</span></div>' +
          '</div>' +
        '</div>';

      // ── SEÇÃO: Ranking de amigos ───────────────────────────────────────
      // Botão admin (só visível para rstbarth@gmail.com) para popular _rankStats
      var isAdmin = cu && cu.email === 'rstbarth@gmail.com';
      var adminSyncBtn = isAdmin
        ? '<button id="trophy-ranking-sync-btn" onclick="window._trophyRankingSync()" ' +
          'style="margin-top:10px;font-size:0.75rem;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px 0;text-decoration:underline;">' +
          '🔄 Sincronizar dados de ranking</button>'
        : '';

      var rankingHtml =
        '<div class="trophy-section">' +
          '<h3 class="trophy-section-title">👥 Ranking de Amigos</h3>' +
          '<div class="trophy-ranking-tabs">' +
            '<button class="btn btn-sm btn-outline ranking-tab-btn active" onclick="window._switchRankingTab(\'casualMatchesPlayed\')">Partidas</button>' +
            '<button class="btn btn-sm btn-outline ranking-tab-btn" onclick="window._switchRankingTab(\'checkinsTotal\')">Check-ins</button>' +
            '<button class="btn btn-sm btn-outline ranking-tab-btn" onclick="window._switchRankingTab(\'tournamentsEnrolled\')">Torneios</button>' +
          '</div>' +
          '<div id="trophy-ranking-container"><p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">Carregando ranking...</p></div>' +
          adminSyncBtn +
        '</div>';

      // ── SEÇÃO: Troféus por categoria ───────────────────────────────────
      var categories = [
        { key: 'perfil',   label: '👤 Perfil' },
        { key: 'casual',   label: '⚡ Partidas Casuais' },
        { key: 'torneio',  label: '🏆 Torneios' },
        { key: 'presenca', label: '📍 Presença' },
        { key: 'social',   label: '👥 Social' },
        { key: 'especial', label: '🌟 Especiais' }
      ];

      var trophiesHtml = '<div class="trophy-section"><h3 class="trophy-section-title">🏅 Troféus</h3>';
      categories.forEach(function(cat) {
        var catTrophies = (window.TROPHY_CATALOG_BY_CATEGORY || {})[cat.key] || [];
        if (!catTrophies.length) return;
        trophiesHtml += '<div class="trophy-category">' +
          '<h4 class="trophy-category-title">' + cat.label + '</h4>' +
          '<div class="trophy-grid">';
        catTrophies.forEach(function(trophy) {
          var awarded = userTrophies[trophy.id];
          // Troféus hidden e não conquistados: não mostrar
          if (trophy.hidden && !awarded) return;
          var tier = awarded ? awarded.tier : null;
          var pct = Math.round(((tStats.counts || {})[trophy.id] || 0) / Math.max(1, tStats.totalUsers || 1) * 100);
          trophiesHtml += _trophyCard(trophy, awarded, tier, pct);
        });
        trophiesHtml += '</div></div>';
      });
      trophiesHtml += '</div>';

      // ── SEÇÃO: Milestones ──────────────────────────────────────────────
      var milestonesHtml = '<div class="trophy-section"><h3 class="trophy-section-title">📈 Marcos de Progresso</h3>' +
        '<p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 12px;">Progressão aritmética — cada passo tem o mesmo esforço.</p>';

      (window.MILESTONE_CATALOG || []).forEach(function(milestone) {
        var currentValue = stats[milestone.metric] || 0;
        var currentLevel = window._milestoneCurrentLevel
          ? window._milestoneCurrentLevel(milestone, currentValue)
          : 0;
        milestonesHtml += _milestoneBar(milestone, currentValue, currentLevel);
      });
      milestonesHtml += '</div>';

      // ── Monta página ───────────────────────────────────────────────────
      var body = document.getElementById('trophies-page-body');
      if (!body) return;
      body.innerHTML = xpHtml + rankingHtml + trophiesHtml + milestonesHtml;

      // Friend comparison section (async, non-blocking)
      var comparisonEl = document.createElement('div');
      comparisonEl.id = 'trophy-friend-comparison';
      body.appendChild(comparisonEl);

      // Build earnedTrophies id list for comparison
      var myEarnedIds = Object.keys(userTrophies);
      _loadFriendsComparisonData(cu, myEarnedIds).then(function(friendsData) {
        if (friendsData && friendsData.length) {
          window._trophyFriendsData = friendsData;
          window._trophyCompareSelectFriend = function(uid) {
            var el = document.getElementById('trophy-friend-comparison');
            if (el) _renderFriendComparison(el, friendsData, uid);
          };
          _renderFriendComparison(comparisonEl, friendsData, null);
        }
      });

      // Carrega ranking inicial (partidas casuais)
      window._currentRankingMetric = 'casualMatchesPlayed';
      _loadAndRenderRanking('casualMatchesPlayed', uid);
    }).catch(function(e) {
      var body = document.getElementById('trophies-page-body');
      if (body) body.innerHTML = '<p style="color:var(--text-muted);padding:24px;">Erro ao carregar conquistas.</p>';
    });
  };

  // ─── Troca de aba no ranking ──────────────────────────────────────────────
  window._switchRankingTab = function(metric) {
    window._currentRankingMetric = metric;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) return;

    // Atualiza visual das tabs
    document.querySelectorAll('.ranking-tab-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf(metric) !== -1) {
        btn.classList.add('active');
      }
    });

    _loadAndRenderRanking(metric, cu.uid);
  };

  function _loadAndRenderRanking(metric, uid) {
    var container = document.getElementById('trophy-ranking-container');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">Carregando...</p>';

    if (window._loadFriendRanking) {
      window._loadFriendRanking(metric).then(function(entries) {
        _renderFriendRanking('trophy-ranking-container', entries, uid);
      }).catch(function() {
        if (container) container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Sem dados de ranking.</p>';
      });
    }
  }

  // ─── Admin: sincroniza _rankStats para todos os usuários ─────────────────
  window._trophyRankingSync = function() {
    var btn = document.getElementById('trophy-ranking-sync-btn');
    if (btn) { btn.textContent = '⏳ Sincronizando...'; btn.disabled = true; }

    var fn = window.firebase && window.firebase.functions
      ? window.firebase.functions().httpsCallable('backfillAllUserTrophies')
      : null;

    if (!fn) {
      if (typeof window.showNotification === 'function') {
        window.showNotification('Erro', 'Firebase Functions não disponível.', 'error');
      }
      if (btn) { btn.textContent = '🔄 Sincronizar dados de ranking'; btn.disabled = false; }
      return;
    }

    fn({}).then(function(result) {
      var d = result.data || {};
      if (typeof window.showNotification === 'function') {
        window.showNotification(
          '✅ Ranking sincronizado',
          'Processados: ' + (d.processed || '?') + ' usuários.',
          'success'
        );
      }
      // Recarrega o ranking atual
      var cu = window.AppStore && window.AppStore.currentUser;
      if (cu && window._currentRankingMetric) {
        _loadAndRenderRanking(window._currentRankingMetric, cu.uid);
      }
      if (btn) { btn.textContent = '✅ Sincronizado'; btn.disabled = true; }
    }).catch(function(e) {
      if (typeof window.showNotification === 'function') {
        window.showNotification('Erro ao sincronizar', e.message || 'Tente novamente.', 'error');
      }
      if (btn) { btn.textContent = '🔄 Sincronizar dados de ranking'; btn.disabled = false; }
    });
  };

  // ─── Ação: abre partida casual diretamente ──────────────────────────────────
  window._trophyOpenCasual = function() {
    if (typeof window._openCasualMatch === 'function') {
      // Já estamos na página — abre direto
      window._openCasualMatch();
    } else {
      // Navega para o dashboard e tenta abrir após render
      window.location.hash = '#dashboard';
      var attempts = 0;
      var poll = setInterval(function() {
        attempts++;
        if (typeof window._openCasualMatch === 'function') {
          clearInterval(poll);
          window._openCasualMatch();
        } else if (attempts > 20) {
          clearInterval(poll);
        }
      }, 150);
    }
  };

  // ─── Ação: vai para torneios abertos ou abre criação com dica ────────────────
  window._trophyGoToTournament = function() {
    var all = ((window.AppStore && window.AppStore.tournaments) || [])
      .concat((window.AppStore && window.AppStore.publicDiscovery) || []);

    var hasOpen = all.some(function(t) {
      return t.status === 'open' || !t.status;
    });

    if (hasOpen) {
      // Há torneios com inscrições abertas — vai para o dashboard
      window.location.hash = '#dashboard';
    } else {
      // Nenhum torneio aberto — vai para o dashboard e abre "Novo Torneio" com dica
      window.location.hash = '#dashboard';
      setTimeout(function() {
        if (typeof openModal === 'function') openModal('modal-quick-create');
        if (typeof window.showNotification === 'function') {
          window.showNotification(
            '🏆 Crie um torneio!',
            'Não há torneios com inscrições abertas agora. Que tal criar o seu?',
            'info'
          );
        }
      }, 500);
    }
  };

  // ─── Replay: reabre overlay de conquista ao clicar no card conquistado ────
  window._trophyReplayOverlay = function(trophyId) {
    var trophy = window.TROPHY_CATALOG_BY_ID && window.TROPHY_CATALOG_BY_ID[trophyId];
    if (!trophy) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    var uid = cu && cu.uid;
    var db = window.FirestoreDB && window.FirestoreDB.db;
    if (uid && db) {
      db.collection('users').doc(uid).collection('trophies').doc(trophyId).get()
        .then(function(doc) {
          var tier = doc.exists ? (doc.data().tier || 'bronze') : 'bronze';
          if (typeof window._showTrophyUnlockOverlay === 'function') {
            window._showTrophyUnlockOverlay(trophy, tier);
          }
        })
        .catch(function() {
          if (typeof window._showTrophyUnlockOverlay === 'function') {
            window._showTrophyUnlockOverlay(trophy, 'bronze');
          }
        });
    } else {
      if (typeof window._showTrophyUnlockOverlay === 'function') {
        window._showTrophyUnlockOverlay(trophy, 'bronze');
      }
    }
  };

  window._log('[trophies-view] loaded');
})();
