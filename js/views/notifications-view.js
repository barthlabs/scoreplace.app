// ========================================
// scoreplace.app — Notificações (View + Badge)
// ========================================

function renderNotifications(container) {
  var _t = window._t || function(k) { return k; };
  var cu = window.AppStore.currentUser;
  if (!cu) {
    container.innerHTML = '<div class="card" style="padding: 2rem; text-align: center;">' +
      '<p style="color: var(--text-muted); font-size: 1.1rem;">' + _t('notif.loginRequired') + '</p>' +
      '<button class="btn btn-primary" onclick="if(typeof openModal===\'function\')openModal(\'modal-login\');" style="margin-top: 1rem;">' + _t('notif.login') + '</button>' +
    '</div>';
    return;
  }

  var uid = cu.uid || cu.email;

  container.innerHTML =
    '<div style="max-width: 700px; margin: 0 auto;">' +
      (typeof window._renderBackHeader === 'function'
        ? window._renderBackHeader({ href: '#dashboard', label: _t('notif.back') })
        : '') +
      '<h2 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 1.5rem; color: var(--text-bright);">' + _t('notif.title') + '</h2>' +
      '<div id="notif-list" style="display: flex; flex-direction: column; gap: 10px;">' +
        '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">' + _t('notif.loading') + '</div>' +
      '</div>' +
    '</div>';

  window.FirestoreDB.getNotifications(uid, 50).then(function(notifs) {
    var listDiv = document.getElementById('notif-list');
    if (!listDiv) return;

    if (notifs.length === 0) {
      listDiv.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.3; margin-bottom: 1rem;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>' +
        '<p>' + _t('notif.empty') + '</p>' +
      '</div>';
      return;
    }

    // v2.1.17: cor por IMPORTÂNCIA (nível): 🔴 fundamental · 🟠 importante · 🟢 geral.
    var _LEVEL_META = {
      fundamental: { emoji: '🔴', color: '#ef4444', label: 'Fundamental' },
      important:   { emoji: '🟠', color: '#f59e0b', label: 'Importante' },
      all:         { emoji: '🟢', color: '#10b981', label: 'Geral' }
    };
    function _renderNotifCard(n) {
      var isUnread = !n.read;
      // Use centralized notification catalog for icon + IMPORTANCE (level) color.
      var _catEntry = (window.NOTIF_CATALOG && window.NOTIF_CATALOG[n.type]) || {};
      var icon = _catEntry.icon || '🔔';
      var _lvl = _catEntry.level || 'all';
      var _lvlMeta = _LEVEL_META[_lvl] || _LEVEL_META.all;
      var accentColor = _lvlMeta.color;

      var timeAgo = _timeAgo(n.createdAt);
      var unreadDot = isUnread ? '<div class="notif-unread-dot" style="width: 8px; height: 8px; border-radius: 50%; background: var(--primary-color); flex-shrink: 0;"></div>' : '';

      var actionHtml = '';
      var safeFromUid = (n.fromUid || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
      var safeNotifId = (n._id || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
      var safeTournamentId = (n.tournamentId || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
      if ((n.type === 'host_transfer_invite' || n.type === 'cohost_invite') && isUnread) {
        var _invType = n.type === 'host_transfer_invite' ? 'transfer' : 'cohost';
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background: var(--success-color); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 600;" onclick="event.stopPropagation(); window._acceptHostInvite(\'' + safeTournamentId + '\',\'' + _invType + '\'); _markNotifRead(\'' + safeNotifId + '\')">' + _t('notif.accept') + '</button>' +
          '<button class="btn btn-sm" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 4px 14px; font-size: 0.75rem;" onclick="event.stopPropagation(); window._rejectHostInvite(\'' + safeTournamentId + '\',\'' + _invType + '\'); _markNotifRead(\'' + safeNotifId + '\')">' + _t('notif.reject') + '</button>' +
        '</div>';
      } else if ((n.type === 'host_transfer_sent' || n.type === 'cohost_invite_sent') && isUnread) {
        var _cancelType = n.inviteType || 'cohost';
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 4px 14px; font-size: 0.75rem;" onclick="event.stopPropagation(); window._cancelHostInvite(\'' + safeTournamentId + '\',\'' + _cancelType + '\'); _markNotifRead(\'' + safeNotifId + '\')">' + _t('notif.cancelInvite') + '</button>' +
        '</div>';
      } else if (n.type === 'friend_request' && isUnread) {
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background: var(--success-color); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 600;" onclick="event.stopPropagation(); _acceptFriend(\'' + safeFromUid + '\'); _markNotifRead(\'' + safeNotifId + '\')">' + _t('notif.accept') + '</button>' +
          '<button class="btn btn-sm" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 4px 14px; font-size: 0.75rem;" onclick="event.stopPropagation(); _rejectFriend(\'' + safeFromUid + '\'); _markNotifRead(\'' + safeNotifId + '\')">' + _t('notif.reject') + '</button>' +
        '</div>';
      } else if (n.tournamentId && n.type !== 'tournament_deleted') {
        // For draw/result/new_round: navigate to bracket; for others: tournament detail
        var _navTarget = (n.type === 'draw' || n.type === 'new_round' || n.type === 'result' || n.type === 'tournament_finished') ? '#bracket/' : '#tournaments/';
        var _btnLabel = (n.type === 'draw' || n.type === 'new_round' || n.type === 'result' || n.type === 'tournament_finished') ? _t('notif.viewBracket') : _t('notif.viewTournament');
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background: var(--primary-color); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 600;" onclick="event.stopPropagation(); window.location.hash=\'' + _navTarget + safeTournamentId + '\'; _markNotifRead(\'' + safeNotifId + '\')">' + _btnLabel + '</button>' +
        '</div>';
      } else if ((n.type === 'presence_plan' || n.type === 'presence_checkin') && n.placeId) {
        // Amigo planejou/chegou num local — botão leva direto à modal do
        // venue onde o usuário pode fazer "Estou aqui" / "Planejar ida"
        // pra se juntar. Label muda de acordo com o tipo pra reforçar a
        // urgência: presence_checkin é "vem agora".
        var safePlaceId = String(n.placeId).replace(/'/g, "\\'").replace(/\\/g, "\\\\");
        var _presLabel = n.type === 'presence_checkin' ? '📡 Vou também' : '🏢 Ver local';
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background: var(--primary-color); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 600;" onclick="event.stopPropagation(); window.location.hash=\'#venues/' + safePlaceId + '\'; _markNotifRead(\'' + safeNotifId + '\')">' + _presLabel + '</button>' +
        '</div>';
      } else if (n.type === 'casual_invite' && n.roomCode) {
        // Convite pra partida casual — leva direto pra #casual/<room> que
        // abre o lobby/live scoring conforme o status da partida.
        var safeRoom = String(n.roomCode).replace(/'/g, "\\'").replace(/\\/g, "\\\\").toUpperCase();
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background:linear-gradient(135deg,#38bdf8,#0ea5e9); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 700;" onclick="event.stopPropagation(); window.location.hash=\'#casual/' + safeRoom + '\'; _markNotifRead(\'' + safeNotifId + '\')">⚡ Entrar na partida</button>' +
        '</div>';
      } else if (n.type === 'casual_link_request' && isUnread && n.casualMatchDocId) {
        // v1.3.33-beta: amigo do usuário sugere que ele jogou esta partida
        // casual. 2 botões: "Sim, era eu" / "Não". Sim → atualiza match doc
        // pra atribuir uid; Não → só registra rejeição. Ambos notificam de
        // volta o solicitante.
        var notifJsonSafe = JSON.stringify({
          _id: n._id,
          casualMatchDocId: n.casualMatchDocId,
          casualRoomCode: n.casualRoomCode || '',
          casualSlotIndex: n.casualSlotIndex,
          casualGuestName: n.casualGuestName || '',
          casualSport: n.casualSport || ''
        }).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap:wrap;">' +
          '<button class="btn btn-sm" style="background: var(--success-color); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 700;" onclick="event.stopPropagation(); var n=JSON.parse(this.getAttribute(\'data-notif\')); if(window._confirmCasualLinkRequest)window._confirmCasualLinkRequest(n,true);" data-notif="' + notifJsonSafe + '">✅ Sim, era eu</button>' +
          '<button class="btn btn-sm" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 4px 14px; font-size: 0.75rem;" onclick="event.stopPropagation(); var n=JSON.parse(this.getAttribute(\'data-notif\')); if(window._confirmCasualLinkRequest)window._confirmCasualLinkRequest(n,false);" data-notif="' + notifJsonSafe + '">❌ Não, era outra pessoa</button>' +
        '</div>';
      } else if ((n.type === 'casual_link_accepted' || n.type === 'casual_link_rejected') && n.casualRoomCode) {
        // Confirmação que veio de volta — botão pra revisar a partida.
        var safeRoomCfm = String(n.casualRoomCode).replace(/'/g, "\\'").replace(/\\/g, "\\\\").toUpperCase();
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background:linear-gradient(135deg,#38bdf8,#0ea5e9); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 700;" onclick="event.stopPropagation(); window.location.hash=\'#casual/' + safeRoomCfm + '\'; _markNotifRead(\'' + safeNotifId + '\')">📊 Ver partida</button>' +
        '</div>';
      }

      // Escape HTML in message to prevent XSS
      var safeMessage = (n.message || _t('notif.fallback')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

      var safeNotifIdOnclick = (n._id || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
      // Borda esquerda colorida pela IMPORTÂNCIA (sempre visível, lida ou não).
      return '<div class="card" style="padding: 1rem; display: flex; align-items: flex-start; gap: 12px; cursor: pointer; border-left: 4px solid ' + accentColor + ';' +
        (isUnread ? ' background: rgba(37, 99, 235, 0.05);' : ' opacity: 0.62;') + '" ' +
        (isUnread ? 'onclick="_markNotifRead(\'' + safeNotifIdOnclick + '\', this)"' : '') + '>' +
        '<div style="font-size: 1.5rem; flex-shrink: 0; line-height: 1;">' + icon + '</div>' +
        '<div style="flex: 1; min-width: 0;">' +
          '<div style="font-size: 0.9rem; color: var(--text-bright); font-weight: ' + (isUnread ? '600' : '400') + ';">' + safeMessage + '</div>' +
          '<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
            '<span style="display:inline-flex;align-items:center;gap:3px;color:' + accentColor + ';font-weight:700;">' + _lvlMeta.emoji + ' ' + _lvlMeta.label + '</span>' +
            '<span style="opacity:0.45;">·</span><span>' + timeAgo + '</span>' +
          '</div>' +
          actionHtml +
        '</div>' +
        unreadDot +
      '</div>';
    }

    // v2.1.17: não lidas EM CIMA, separadas das lidas. Dentro de cada grupo,
    // mantém a ordem do servidor (createdAt desc).
    var _unread = notifs.filter(function(n){ return !n.read; });
    var _read   = notifs.filter(function(n){ return n.read; });
    var html = '';
    if (_unread.length > 0) {
      html += '<div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:#60a5fa;margin:0 0 8px 2px;">🔵 ' + (_t('notif.unread') || 'Não lidas') + ' · ' + _unread.length + '</div>';
      html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">' + _unread.map(_renderNotifCard).join('') + '</div>';
    }
    if (_read.length > 0) {
      html += '<div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);opacity:0.7;margin:0 0 8px 2px;">' + (_t('notif.read') || 'Lidas') + ' · ' + _read.length + '</div>';
      html += '<div style="display:flex;flex-direction:column;gap:8px;">' + _read.map(_renderNotifCard).join('') + '</div>';
    }

    listDiv.innerHTML = html;

    // Mark all as read after viewing (skip notifications with pending actions)
    var _actionTypes = ['host_transfer_invite', 'cohost_invite', 'host_transfer_sent', 'cohost_invite_sent', 'friend_request', 'casual_link_request'];
    notifs.forEach(function(n) {
      if (!n.read && _actionTypes.indexOf(n.type) === -1) {
        window.FirestoreDB.markNotificationRead(uid, n._id);
      }
    });
    // Update badge after a delay
    setTimeout(function() { _updateNotificationBadge(); }, 1000);
  });
}

// Helper: relative time
function _timeAgo(dateStr) {
  if (!dateStr) return '';
  var _t = window._t || function(k) { return k; };
  var now = new Date();
  var date = new Date(dateStr);
  var diffMs = now - date;
  var diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return _t('notif.timeJustNow');
  if (diffMin < 60) return diffMin + ' ' + _t('notif.timeMinAgo');
  var diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return diffH + _t('notif.timeHoursAgo');
  var diffD = Math.floor(diffH / 24);
  if (diffD === 1) return _t('notif.timeYesterday');
  if (diffD < 30) return diffD + ' ' + _t('notif.timeDaysAgo');
  var lang = (window._currentLang && window._currentLang === 'en') ? 'en-US' : 'pt-BR';
  return date.toLocaleDateString(lang);
}

// Mark a single notification as read + update UI
window._markNotifRead = function(notifId, el) {
  var cu = window.AppStore.currentUser;
  if (!cu) return;
  var uid = cu.uid || cu.email;
  window.FirestoreDB.markNotificationRead(uid, notifId);
  if (el) {
    el.style.borderLeft = 'none';
    el.style.background = 'transparent';
    el.style.opacity = '0.7';
    var dot = el.querySelector('.notif-unread-dot');
    if (dot) dot.style.display = 'none';
  }
};

// Update the notification badge count in the header + show banner
window._updateNotificationBadge = function() {
  var cu = window.AppStore.currentUser;
  if (!cu) return;
  var uid = cu.uid || cu.email;
  window.FirestoreDB.getUnreadNotificationCount(uid).then(function(count) {
    // Update the small badge on the bell icon in nav
    var badge = document.getElementById('notif-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    // Update the header bell dot (visible in hamburger mode)
    var headerDot = document.getElementById('header-notif-dot');
    if (headerDot) {
      headerDot.style.display = count > 0 ? 'block' : 'none';
    }

    // Remove legacy notification banner if it exists (replaced by header bell)
    var banner = document.getElementById('notif-banner');
    if (banner) { banner.style.display = 'none'; }
  });
};
