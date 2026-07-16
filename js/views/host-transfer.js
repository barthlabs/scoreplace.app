// ─── Host Transfer / Co-Host System ─────────────────────────────────────────
(function() {
  'use strict';
  var _tH = window._t || function(k) { return k; };

  // Crown SVG reusable
  var CROWN_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(251,191,36,0.9)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  window._CROWN_SVG = CROWN_SVG;

  // ─── Open host transfer dialog ────────────────────────────────────────────
  window._openHostTransferDialog = function(participant, tId) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (!t) return;
    var pName = window._pName(participant);
    var pEmail = typeof participant === 'object' ? (participant.email || '') : '';
    var pUid = typeof participant === 'object' ? (participant.uid || '') : '';

    var existing = document.getElementById('host-transfer-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'host-transfer-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;';

    var _selectedType = 'cohost';

    overlay.innerHTML = '<div style="background:var(--bg-card);width:94%;max-width:380px;border-radius:16px;border:1px solid rgba(251,191,36,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden;">' +
      // Sticky header with buttons
      '<div style="padding:0.75rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#78350f,#b45309);">' +
        '<button type="button" onclick="document.getElementById(\'host-transfer-overlay\').remove()" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fef3c7;border:1px solid rgba(255,255,255,0.25);">' + _tH('org.cancel') + '</button>' +
        '<span style="font-weight:700;color:#fef3c7;font-size:0.9rem;">' + CROWN_SVG + ' ' + _tH('org.organization') + '</span>' +
        '<button type="button" id="btn-confirm-host-transfer" class="btn btn-sm" style="background:#fbbf24;color:#78350f;font-weight:700;border:none;">' + _tH('org.confirm') + '</button>' +
      '</div>' +
      // Body
      '<div style="padding:1rem 1.25rem;">' +
        '<div style="text-align:center;margin-bottom:1rem;">' +
          '<div style="font-size:1.5rem;margin-bottom:4px;">⭐</div>' +
          '<div style="font-weight:700;color:var(--text-bright);font-size:0.95rem;">' + window._safeHtml(pName) + '</div>' +
          '<div style="font-size:0.75rem;color:var(--text-muted);">' + window._safeHtml(t.name) + '</div>' +
        '</div>' +
        // Options
        '<div style="display:flex;flex-direction:column;gap:8px;" id="host-transfer-options">' +
          '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;background:rgba(251,191,36,0.08);border:2px solid rgba(251,191,36,0.3);border-radius:12px;cursor:pointer;" id="opt-cohost">' +
            '<input type="radio" name="host-type" value="cohost" checked style="margin-top:2px;accent-color:#fbbf24;">' +
            '<div><div style="font-weight:700;color:var(--text-bright);font-size:0.88rem;">' + _tH('org.share') + '</div><div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">' + _tH('org.shareDesc') + '</div></div>' +
          '</label>' +
          '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;background:rgba(255,255,255,0.03);border:2px solid var(--border-color);border-radius:12px;cursor:pointer;" id="opt-transfer">' +
            '<input type="radio" name="host-type" value="transfer" style="margin-top:2px;accent-color:#fbbf24;">' +
            '<div><div style="font-weight:700;color:var(--text-bright);font-size:0.88rem;">' + _tH('org.transfer') + '</div><div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">' + _tH('org.transferDesc') + '</div></div>' +
          '</label>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);

    // Radio selection visual
    var radios = overlay.querySelectorAll('input[name="host-type"]');
    radios.forEach(function(r) {
      r.addEventListener('change', function() {
        document.getElementById('opt-cohost').style.borderColor = 'var(--border-color)';
        document.getElementById('opt-cohost').style.background = 'rgba(255,255,255,0.03)';
        document.getElementById('opt-transfer').style.borderColor = 'var(--border-color)';
        document.getElementById('opt-transfer').style.background = 'rgba(255,255,255,0.03)';
        var sel = document.getElementById('opt-' + r.value);
        if (sel) { sel.style.borderColor = 'rgba(251,191,36,0.3)'; sel.style.background = 'rgba(251,191,36,0.08)'; }
      });
    });

    // Confirm handler
    document.getElementById('btn-confirm-host-transfer').addEventListener('click', function() {
      var checked = overlay.querySelector('input[name="host-type"]:checked');
      var type = checked ? checked.value : 'cohost';
      overlay.remove();
      if (type === 'transfer') {
        window._initiateHostTransfer(tId, { email: pEmail, uid: pUid, displayName: pName });
      } else {
        window._initiateCoHostInvite(tId, { email: pEmail, uid: pUid, displayName: pName });
      }
    });
  };

  // ─── Initiate host transfer ───────────────────────────────────────────────
  window._initiateHostTransfer = function(tId, target) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    var user = window.AppStore.currentUser;
    if (!t || !user) return;

    var _pt = {
      targetEmail: target.email, targetUid: target.uid, targetName: target.displayName,
      fromEmail: user.email, fromUid: user.uid, createdAt: new Date().toISOString()
    };
    t.pendingTransfer = _pt;
    // Blindagem v4.0.119: persiste pelo portão AppStore.mutate (atômico no fresco).
    window.AppStore.mutate(tId, function (ft) { ft.pendingTransfer = _pt; });

    // Notify target
    _notifyByEmail(target.uid || target.email, {
      type: 'host_transfer_invite', tournamentId: String(t.id), tournamentName: t.name,
      fromName: user.displayName, fromUid: user.uid,
      message: (user.displayName || _tH('org.theOrganizer')) + ' ' + _tH('org.wantsToTransfer') + ' "' + t.name + '".',
      level: 'fundamental',
      _fallbackEmail: target.email || '', _fallbackName: target.displayName || ''
    });
    // Notify self
    _notifyByEmail(user.uid, {
      type: 'host_transfer_sent', tournamentId: String(t.id), tournamentName: t.name,
      targetName: target.displayName,
      message: _tH('org.transferInviteSent') + ' ' + (target.displayName || target.email) + '.',
      level: 'all', inviteType: 'transfer'
    });
    if (typeof showNotification === 'function') showNotification(_tH('org.inviteSent'), _tH('org.awaitingResponse') + ' ' + (target.displayName || target.email), 'info');
  };

  // ─── Initiate co-host invite ──────────────────────────────────────────────
  window._initiateCoHostInvite = function(tId, target) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    var user = window.AppStore.currentUser;
    if (!t || !user) return;

    if (!Array.isArray(t.coHosts)) t.coHosts = [];
    // Check if already invited/active — v2.8.50: por uid OU email (uid-only não casava
    // por email e podia duplicar o convite).
    var existing = t.coHosts.find(function(ch) {
      return (target.uid && ch.uid && ch.uid === target.uid) || (target.email && ch.email && ch.email === target.email);
    });
    if (existing) {
      if (typeof showNotification === 'function') showNotification(_tH('org.alreadyInvited'), (target.displayName || target.email || _pName(target)) + ' ' + _tH('org.alreadyInvitedMsg'), 'warning');
      return;
    }

    var _chEntry = {
      email: target.email, displayName: target.displayName, uid: target.uid,
      status: 'pending', type: 'cohost', invitedAt: new Date().toISOString()
    };
    t.coHosts.push(_chEntry);
    // Blindagem v4.0.119: portão AppStore.mutate; re-check existência no fresco (idempotência).
    window.AppStore.mutate(tId, function (ft) {
      if (!Array.isArray(ft.coHosts)) ft.coHosts = [];
      var ex = ft.coHosts.find(function (ch) { return (target.uid && ch.uid && ch.uid === target.uid) || (target.email && ch.email && ch.email === target.email); });
      if (ex) return;
      ft.coHosts.push(_chEntry);
    });

    // v2.8.52: deep-links Aceitar/Recusar (#cohost/<accept|reject>/<tId>/cohost) pra
    // o convite ter BOTÕES funcionais no e-mail e WhatsApp (não só um link pro torneio).
    var _chBase = 'https://scoreplace.app/#cohost/';
    _notifyByEmail(target.uid || target.email, {
      type: 'cohost_invite', tournamentId: String(t.id), tournamentName: t.name,
      fromName: user.displayName, fromUid: user.uid,
      inviterName: user.displayName || _tH('org.theOrganizer'),
      acceptUrl: _chBase + 'accept/' + encodeURIComponent(String(t.id)) + '/cohost',
      rejectUrl: _chBase + 'reject/' + encodeURIComponent(String(t.id)) + '/cohost',
      message: (user.displayName || _tH('org.theOrganizer')) + ' ' + _tH('org.invitedCohost') + ' "' + t.name + '".',
      level: 'fundamental',
      _fallbackEmail: target.email || '', _fallbackName: target.displayName || ''
    });
    _notifyByEmail(user.uid, {
      type: 'cohost_invite_sent', tournamentId: String(t.id), tournamentName: t.name,
      targetName: target.displayName,
      message: _tH('org.cohostInviteSent') + ' ' + (target.displayName || target.email) + '.',
      level: 'all', inviteType: 'cohost'
    });
    if (typeof showNotification === 'function') showNotification(_tH('org.inviteSent'), _tH('org.awaitingResponse') + ' ' + (target.displayName || target.email), 'info');
  };

  // ─── Accept host invite ───────────────────────────────────────────────────
  // Helper: mark all pending invite notifications as read for a user+tournament
  // Accepts a UID or email; if email (or UID doc not found), looks up the user by email first.
  function _markInviteNotifsRead(uidOrEmail, tId, types) {
    if (!uidOrEmail || !tId || !window.FirestoreDB || !window.FirestoreDB.db) return;
    var db = window.FirestoreDB.db;
    function _doMark(uid) {
      if (!uid) return;
      types.forEach(function(typ) {
        db.collection('users').doc(uid).collection('notifications')
          .where('type', '==', typ).where('tournamentId', '==', String(tId)).where('read', '==', false)
          .get().then(function(snap) {
            snap.forEach(function(d) { d.ref.update({ read: true }); });
          }).catch(function() {});
      });
      if (typeof window._updateNotificationBadge === 'function') {
        setTimeout(window._updateNotificationBadge, 500);
      }
    }
    // Looks like an email? Resolve to UID via users collection.
    if (String(uidOrEmail).indexOf('@') !== -1) {
      db.collection('users').where('email', '==', uidOrEmail).limit(1).get().then(function(snap) {
        if (!snap.empty) _doMark(snap.docs[0].id);
      }).catch(function() {});
      return;
    }
    // Assume UID — verify the doc exists; if not, nothing to do.
    db.collection('users').doc(uidOrEmail).get().then(function(doc) {
      if (doc.exists) _doMark(uidOrEmail);
    }).catch(function() { _doMark(uidOrEmail); });
  }

  window._acceptHostInvite = function(tId, inviteType) {
    var user = window.AppStore.currentUser;
    if (!user) return;
    // Blindagem v4.0.119: aceitação ATÔMICA pelo portão AppStore.mutate (lê fresco
    // DENTRO da transação — antes era get()+saveTournament, com janela de lost-update).
    // Campos p/ notificação são capturados de dentro do mutator (o aceitante pode nem
    // ter o torneio no AppStore local ainda).
    var _oldOrgUid, _orgRef, _tName = '', _entryFound = false, _applied = false;
    window.AppStore.mutate(tId, function (ft) {
      _tName = ft.name || '';
      if (inviteType === 'transfer' && ft.pendingTransfer) {
        if (!Array.isArray(ft.coHosts)) ft.coHosts = [];
        _oldOrgUid = ft.pendingTransfer.fromUid;
        ft.coHosts.push({ email: ft.organizerEmail, displayName: ft.organizerName, uid: ft.pendingTransfer.fromUid || '', status: 'active', type: 'cohost', invitedAt: new Date().toISOString() });
        ft.organizerEmail = user.email; ft.organizerName = user.displayName; ft.creatorEmail = user.email;
        ft.pendingTransfer = null;
        _applied = true;
      } else if (inviteType === 'cohost') {
        if (!Array.isArray(ft.coHosts)) ft.coHosts = [];
        var entry = ft.coHosts.find(function (ch) {
          if (ch.status !== 'pending') return false;
          if (user.uid && ch.uid && ch.uid === user.uid) return true;
          if (user.email && ch.email && ch.email === user.email) return true;
          return false;
        });
        if (entry) {
          entry.status = 'active';
          if (!Array.isArray(ft.adminEmails)) ft.adminEmails = [];
          var ce = user.email || entry.email || '';
          if (ce && !ft.adminEmails.includes(ce)) ft.adminEmails.push(ce);
          // v1.2.2: memberEmails saiu — o co-host entra em memberUids (recomputado no save).
          _orgRef = ft.creatorUid || ft.creatorEmail || ft.organizerEmail;
          _entryFound = true; _applied = true;
        }
      }
    }).then(function () {
      if (inviteType === 'transfer') {
        if (!_applied) return; // já transferido (idempotência) — nada a notificar
        _notifyByEmail(_oldOrgUid, { type: 'host_invite_accepted', tournamentId: String(tId), tournamentName: _tName, message: (user.displayName || _tH('org.theUser')) + ' ' + _tH('org.acceptedTransfer') + ' "' + _tName + '".', level: 'fundamental' });
        _markInviteNotifsRead(_oldOrgUid, tId, ['host_transfer_sent']);
        _notifyByEmail(user.uid, { type: 'host_invite_accepted', tournamentId: String(tId), tournamentName: _tName, message: _tH('org.youAcceptedTransfer') + ' "' + _tName + '".', level: 'fundamental' });
        _markInviteNotifsRead(user.uid, tId, ['host_transfer_invite']);
        if (typeof showNotification === 'function') showNotification(_tH('org.accepted'), _tH('org.youAreNow') + ' ' + _tH('org.organizerRole') + '.', 'success');
      } else if (inviteType === 'cohost') {
        if (!_entryFound) {
          if (typeof showNotification === 'function') showNotification(_tH('org.error'), 'Convite não encontrado. Peça ao organizador para re-enviar.', 'warning');
          return;
        }
        _notifyByEmail(_orgRef, { type: 'host_invite_accepted', tournamentId: String(tId), tournamentName: _tName, message: (user.displayName || _tH('org.theUser')) + ' ' + _tH('org.acceptedCohost') + ' "' + _tName + '".', level: 'important' });
        if (_orgRef) _markInviteNotifsRead(_orgRef, tId, ['cohost_invite_sent']);
        _notifyByEmail(user.uid, { type: 'host_invite_accepted', tournamentId: String(tId), tournamentName: _tName, message: _tH('org.youAcceptedCohost') + ' "' + _tName + '".', level: 'important' });
        _markInviteNotifsRead(user.uid, tId, ['cohost_invite']);
        if (typeof showNotification === 'function') showNotification(_tH('org.accepted'), _tH('org.youAreNow') + ' ' + _tH('org.coOrganizerRole') + '.', 'success');
      }
    }).catch(function(e) { window._warn('Accept host invite error:', e); if (typeof showNotification === 'function') showNotification(_tH('org.error'), _tH('org.errorProcessing'), 'error'); });
  };

  // ─── Reject host invite ───────────────────────────────────────────────────
  window._rejectHostInvite = function(tId, inviteType) {
    var user = window.AppStore.currentUser;
    if (!user) return;
    // Blindagem v4.0.119: recusa ATÔMICA pelo portão (lê fresco na transação).
    var _fromUid, _orgRef, _tName = '', _applied = false;
    window.AppStore.mutate(tId, function (ft) {
      _tName = ft.name || '';
      if (inviteType === 'transfer' && ft.pendingTransfer) {
        _fromUid = ft.pendingTransfer.fromUid;
        ft.pendingTransfer = null;
        _applied = true;
      } else if (inviteType === 'cohost' && Array.isArray(ft.coHosts)) {
        var before = ft.coHosts.length;
        // v2.8.79: casa o convite pendente por UID (primário) OU email.
        ft.coHosts = ft.coHosts.filter(function (ch) { return !(ch.status === 'pending' && ((user.uid && ch.uid && ch.uid === user.uid) || (user.email && ch.email && ch.email === user.email))); });
        if (ft.coHosts.length !== before) { _orgRef = ft.creatorUid || ft.creatorEmail || ft.organizerEmail; _applied = true; }
      }
    }).then(function () {
      if (inviteType === 'transfer' && _applied) {
        _notifyByEmail(_fromUid, { type: 'host_invite_rejected', tournamentId: String(tId), tournamentName: _tName, message: (user.displayName || _tH('org.theUser')) + ' ' + _tH('org.rejectedTransfer') + ' "' + _tName + '".', level: 'important' });
        _markInviteNotifsRead(_fromUid, tId, ['host_transfer_sent']);
        _notifyByEmail(user.uid, { type: 'host_invite_rejected', tournamentId: String(tId), tournamentName: _tName, message: _tH('org.youRejectedTransfer') + ' "' + _tName + '".', level: 'important' });
        _markInviteNotifsRead(user.uid, tId, ['host_transfer_invite']);
      } else if (inviteType === 'cohost' && _applied) {
        _notifyByEmail(_orgRef, { type: 'host_invite_rejected', tournamentId: String(tId), tournamentName: _tName, message: (user.displayName || _tH('org.theUser')) + ' ' + _tH('org.rejectedCohost') + ' "' + _tName + '".', level: 'important' });
        if (_orgRef) _markInviteNotifsRead(_orgRef, tId, ['cohost_invite_sent']);
        _notifyByEmail(user.uid, { type: 'host_invite_rejected', tournamentId: String(tId), tournamentName: _tName, message: _tH('org.youRejectedCohost') + ' "' + _tName + '".', level: 'important' });
        _markInviteNotifsRead(user.uid, tId, ['cohost_invite']);
      }
      if (typeof showNotification === 'function') showNotification(_tH('org.rejected'), _tH('org.inviteRejected'), 'info');
    }).catch(function(e) { window._warn('Reject host invite error:', e); if (typeof showNotification === 'function') showNotification(_tH('org.error'), _tH('org.errorProcessing'), 'error'); });
  };

  // ─── Cancel host invite (by organizer) ────────────────────────────────────
  window._cancelHostInvite = function(tId, inviteType) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (!t) return;
    var user = window.AppStore.currentUser;
    var targetUidOrEmail = null;
    var targetName = '';
    if (inviteType === 'transfer' && t.pendingTransfer) {
      targetUidOrEmail = t.pendingTransfer.targetUid || t.pendingTransfer.targetEmail;
      targetName = t.pendingTransfer.targetName || '';
      t.pendingTransfer = null;
    } else if (inviteType === 'cohost' && Array.isArray(t.coHosts)) {
      var pending = t.coHosts.filter(function(ch) { return ch.status === 'pending'; });
      if (pending.length > 0) {
        targetUidOrEmail = pending[0].uid || pending[0].email;
        targetName = pending[0].displayName || '';
      }
      t.coHosts = t.coHosts.filter(function(ch) { return ch.status !== 'pending'; });
    }
    // Blindagem v4.0.119: portão AppStore.mutate (re-aplica no fresco).
    window.AppStore.mutate(tId, function (ft) {
      if (inviteType === 'transfer') ft.pendingTransfer = null;
      else if (inviteType === 'cohost' && Array.isArray(ft.coHosts)) ft.coHosts = ft.coHosts.filter(function (ch) { return ch.status !== 'pending'; });
    });
    // Notify target that invite was cancelled
    if (targetUidOrEmail) {
      _notifyByEmail(targetUidOrEmail, {
        type: 'cohost_removed', tournamentId: String(t.id), tournamentName: t.name,
        message: (user ? user.displayName : '') + ' ' + _tH('org.cancelledInviteFor') + ' "' + t.name + '".',
        level: 'important'
      });
    }
    if (typeof showNotification === 'function') showNotification(_tH('org.cancelled'), _tH('org.inviteCancelled'), 'info');
  };

  // ─── Remove co-host (creator only) ───────────────────────────────────────
  window._removeCoHost = function(tId, coHostKey) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (!t || !window.AppStore.isCreator(t)) return;
    if (!Array.isArray(t.coHosts)) return;
    // v2.8.79: casa por UID (primário) OU email — co-host com email '' (conta por
    // telefone) era impossível de remover. Remove por REFERÊNCIA do objeto achado.
    var removed = t.coHosts.find(function(ch) { return ch && ((ch.uid && ch.uid === coHostKey) || (ch.email && ch.email === coHostKey)); });
    if (!removed) return;
    t.coHosts = t.coHosts.filter(function(ch) { return ch !== removed; });
    // Blindagem v4.0.119: portão AppStore.mutate — re-filtra no fresco por chave
    // (a ref do objeto `removed` não casa no doc fresco).
    window.AppStore.mutate(tId, function (ft) {
      if (!Array.isArray(ft.coHosts)) return;
      ft.coHosts = ft.coHosts.filter(function (ch) { return !(ch && ((ch.uid && ch.uid === coHostKey) || (ch.email && ch.email === coHostKey))); });
    });
    if (removed && typeof window._sendUserNotification === 'function') {
      _notifyByEmail(removed.uid || removed.email || coHostKey, {
        type: 'cohost_removed', tournamentId: String(t.id), tournamentName: t.name,
        message: _tH('org.youWereRemoved') + ' "' + t.name + '".',
        level: 'important'
      });
    }
    if (typeof showNotification === 'function') showNotification(_tH('org.removed'), (removed ? removed.displayName : coHostKey) + ' ' + _tH('org.removedFromOrg'), 'info');
    var container = document.getElementById('view-container');
    if (container && typeof renderTournaments === 'function') renderTournaments(container, String(tId));
  };

  // ─── Crown drop handler ───────────────────────────────────────────────────
  window._handleCrownDrop = function(event, tId) {
    event.preventDefault();
    var dragData = window._participantDragData;
    if (!dragData) return;
    window._openHostTransferDialog(dragData, tId);
  };

  // ─── Picker dialog: select participant to share/transfer ──────────────────
  window._openOrgPickerDialog = function(tId) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (!t) return;
    var user = window.AppStore.currentUser;
    if (!user) return;

    var existing = document.getElementById('org-picker-overlay');
    if (existing) existing.remove();

    var parts = Array.isArray(t.participants) ? t.participants : [];
    // Filter: only participants with email (can receive notification), exclude self and current org/coHosts
    var orgEmails = [t.organizerEmail];
    if (Array.isArray(t.coHosts)) t.coHosts.forEach(function(ch) { if (ch.email && ch.status === 'active') orgEmails.push(ch.email); });

    // v2.8.50: elegível por UID **ou** email (antes exigia email → inscritos só-uid,
    // comuns em torneios de duplas, NÃO apareciam e não dava pra promover). Exclui o
    // próprio usuário, o organizador e co-orgs ativos (por uid e por email).
    var orgUids = [t.creatorUid];
    if (Array.isArray(t.coHosts)) t.coHosts.forEach(function(ch) { if (ch.uid && ch.status === 'active') orgUids.push(ch.uid); });
    var eligible = parts.filter(function(p) {
      if (typeof p === 'string') return false;
      var email = p.email || '';
      var puid = p.uid || '';
      if (!email && !puid) return false; // precisa de algum identificador
      if (puid && user.uid && puid === user.uid) return false;
      if (email && user.email && email === user.email) return false;
      if (email && orgEmails.indexOf(email) !== -1) return false;
      if (puid && orgUids.indexOf(puid) !== -1) return false;
      return true;
    });

    // Also check for pending invites
    var pendingEmails = [];
    if (t.pendingTransfer) pendingEmails.push(t.pendingTransfer.targetEmail);
    if (Array.isArray(t.coHosts)) t.coHosts.forEach(function(ch) { if (ch.status === 'pending') pendingEmails.push(ch.email); });

    var overlay = document.createElement('div');
    overlay.id = 'org-picker-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;';

    var listHtml = '';
    if (eligible.length === 0) {
      listHtml = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;">' + _tH('org.noEligible') + '</div>';
    } else {
      eligible.forEach(function(p) {
        var name = p.displayName || p.name || p.email;
        var email = p.email || '';
        var pUid = p.uid || '';
        var isPending = pendingEmails.indexOf(email) !== -1;
        var safeEmail = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var safeUid = pUid.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var safeName = window._safeHtml(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var avatarSeed = encodeURIComponent(name);
        var avatarUrl = 'https://api.dicebear.com/9.x/initials/svg?seed=' + avatarSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
        listHtml += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:' + (isPending ? 'default' : 'pointer') + ';background:' + (isPending ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.03)') + ';border:1px solid ' + (isPending ? 'rgba(251,191,36,0.3)' : 'var(--border-color)') + ';transition:background 0.2s;" ' +
          (isPending ? '' : 'onmouseover="this.style.background=\'rgba(251,191,36,0.1)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.03)\'" onclick="document.getElementById(\'org-picker-overlay\').remove(); window._openHostTransferDialog({email:\'' + safeEmail + '\',uid:\'' + safeUid + '\',displayName:\'' + safeName + '\'},\'' + String(tId).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')"') + '>' +
          '<img src="' + avatarUrl + '" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:0.88rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(name) + '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(email) + '</div>' +
          '</div>' +
          (isPending ? '<span style="font-size:0.65rem;color:#fbbf24;font-weight:600;white-space:nowrap;">' + _tH('org.pendingInvite') + '</span>' : '<span style="font-size:1rem;color:var(--text-muted);">›</span>') +
        '</div>';
      });
    }

    overlay.innerHTML = '<div style="background:var(--bg-card);width:94%;max-width:400px;border-radius:16px;border:1px solid rgba(251,191,36,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden;max-height:80%;display:flex;flex-direction:column;">' +
      '<div style="padding:0.75rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#78350f,#b45309);flex-shrink:0;">' +
        '<button type="button" onclick="document.getElementById(\'org-picker-overlay\').remove()" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fef3c7;border:1px solid rgba(255,255,255,0.25);">' + _tH('org.cancel') + '</button>' +
        '<span style="font-weight:700;color:#fef3c7;font-size:0.9rem;">' + CROWN_SVG + ' ' + _tH('org.organization') + '</span>' +
        '<div style="width:70px;"></div>' +
      '</div>' +
      '<div style="padding:1rem;font-size:0.8rem;color:var(--text-muted);text-align:center;border-bottom:1px solid var(--border-color);flex-shrink:0;">' + _tH('org.pickParticipant') + '</div>' +
      '<div style="padding:0.75rem;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">' + listHtml + '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  };

  // ─── Helper: send notification — uses _sendUserNotification (proven path) with fallback ──
  function _notifyByEmail(uidOrEmail, data) {
    if (!uidOrEmail) { window._warn('[host-transfer] _notifyByEmail: no uidOrEmail'); return; }
    var cu = window.AppStore.currentUser || {};
    var payload = {
      type: data.type || 'info',
      fromUid: data.fromUid || cu.uid || cu.email || '',
      fromName: data.fromName || cu.displayName || '',
      fromPhoto: cu.photoURL || '',
      tournamentId: data.tournamentId || '',
      tournamentName: data.tournamentName || '',
      message: data.message || '',
      level: data.level || 'all',
      createdAt: new Date().toISOString(),
      read: false
    };
    if (data.inviteType) payload.inviteType = data.inviteType;

    // Primary: use _sendUserNotification (proven working path from tournaments-organizer.js)
    function _trySendUserNotification(uid) {
      if (typeof window._sendUserNotification === 'function') {
        window._sendUserNotification(uid, data).then(function() {
        }).catch(function(e) {
          window._warn('[host-transfer] _sendUserNotification failed, trying direct write:', e);
          _sendDirect(uid);
        });
        return true;
      }
      return false;
    }

    function _sendDirect(uid) {
      if (window.FirestoreDB && window.FirestoreDB.addNotification) {
        window.FirestoreDB.addNotification(uid, payload).then(function() {
        }).catch(function(e) {
          window._error('[host-transfer] addNotification FAILED for uid:', uid, e);
        });
      } else {
        window._warn('[host-transfer] FirestoreDB.addNotification not available');
      }
    }

    function _resolveAndSend(uid) {
      if (!_trySendUserNotification(uid)) {
        _sendDirect(uid);
      }
    }

    function _lookupByEmail(email, fallbackName) {
      if (!window.FirestoreDB || !window.FirestoreDB.db) return;
      window.FirestoreDB.db.collection('users').where('email', '==', email).limit(1).get().then(function(snap) {
        if (!snap.empty) {
          _resolveAndSend(snap.docs[0].id);
        } else if (fallbackName) {
          window.FirestoreDB.db.collection('users').where('displayName', '==', fallbackName).limit(1).get().then(function(snap2) {
            if (!snap2.empty) {
              _resolveAndSend(snap2.docs[0].id);
            } else {
              window._warn('[host-transfer] No user found for email:', email, 'or name:', fallbackName);
            }
          }).catch(function(e) { window._error('[host-transfer] Name lookup FAILED:', e); });
        } else {
          window._warn('[host-transfer] No user found for email:', email);
        }
      }).catch(function(e) { window._error('[host-transfer] Email lookup FAILED:', e); });
    }

    // If it looks like a UID (no @), try direct send + verify the doc exists
    if (uidOrEmail.indexOf('@') === -1) {
      if (window.FirestoreDB && window.FirestoreDB.db) {
        window.FirestoreDB.db.collection('users').doc(uidOrEmail).get().then(function(doc) {
          if (doc.exists) {
            _resolveAndSend(uidOrEmail);
          } else {
            window._warn('[host-transfer] UID doc not found:', uidOrEmail, '— trying email/name fallback');
            var fallbackEmail = data._fallbackEmail || '';
            var fallbackName = data._fallbackName || '';
            if (fallbackEmail) {
              _lookupByEmail(fallbackEmail, fallbackName);
            } else {
              window._warn('[host-transfer] No fallback email available for uid:', uidOrEmail);
            }
          }
        }).catch(function() { _resolveAndSend(uidOrEmail); });
      } else {
        _resolveAndSend(uidOrEmail);
      }
      return;
    }
    // Input has @ — it's an email, lookup uid
    _lookupByEmail(uidOrEmail, data._fallbackName || '');
  }
})();
