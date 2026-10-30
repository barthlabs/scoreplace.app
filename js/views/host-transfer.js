/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
// ─── Host Transfer / Co-Host System ─────────────────────────────────────────
(function() {
  'use strict';
  var _tH = window._t || function(k) { return k; };

  function _inviteErrorMessage(e) {
    if (e && e.atualizacao === true) return 'Atualize o aplicativo e tente novamente.';
    var code = String((e && e.code) || '');
    if (code === 'functions/failed-precondition') return 'O convite não está disponível. Confira a amizade, a conta e o estado do torneio.';
    if (code === 'functions/permission-denied') return 'Sua conta não tem permissão para enviar este convite.';
    if (code === 'functions/unauthenticated') return 'Entre novamente na sua conta para enviar o convite.';
    if (code === 'functions/not-found') return 'O convite não está disponível. Atualize a página e tente novamente.';
    if (code === 'functions/unavailable' || (e && (e.message === 'sem conexão com o servidor' || e.message === 'Failed to fetch')))
      return 'Não foi possível alcançar o serviço de convites. Confira a conexão e tente novamente.';
    return 'O convite não foi salvo. Tente novamente em instantes.';
  }

  // Crown SVG reusable
  var CROWN_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(251,191,36,0.9)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  window._CROWN_SVG = CROWN_SVG;

  // Responder convite de co-organização/transferência = CF respondHostInvite (Admin SDK).
  // O cliente NUNCA grava isso: o aceite muda adminUids e a regra do participante não
  // cobre (era permission-denied determinístico). Devolve {applied, tournamentName,
  // orgUid, fromUid} pra camada de notificação abaixo. Ver functions/cohost-core.js.
  function _respondHostInviteCF(tId, inviteType, action) {
    if (!(window.FirestoreDB && typeof window.FirestoreDB.respondHostInvite === 'function')) {
      return Promise.reject(new Error('sem conexão com o servidor'));
    }
    return window.FirestoreDB.respondHostInvite(String(tId), String(inviteType), String(action))
      .then(function (res) { return (res && res.data) ? res.data : res; });
  }

  // ─── Open host transfer dialog ────────────────────────────────────────────
  window._openHostTransferDialog = function(participant, tId) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (!t) return;
    var pName = window._pName(participant);
    var pUid = typeof participant === 'object' ? (participant.uid || '') : '';

    var existing = document.getElementById('host-transfer-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'host-transfer-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;';

    var _selectedType = 'cohost';

    overlay.innerHTML = '<div style="background:var(--bg-card);width:94%;max-width:380px;border-radius:16px;border:1px solid rgba(251,191,36,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden;">' +
      // Sticky header with buttons
      '<div class="sp-host-invite-header" style="padding:0.75rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);">' +
        '<button type="button" onclick="document.getElementById(\'host-transfer-overlay\').remove()" class="btn btn-sm" style="background:var(--sp-g-255-255-255-015,rgba(255,255,255,0.15));color:var(--sp-c-fef3c7,#fef3c7);border:1px solid var(--sp-b-255-255-255-025,rgba(255,255,255,0.25));">' + _tH('org.cancel') + '</button>' +
        '<span style="font-weight:700;color:var(--sp-c-fef3c7,#fef3c7);font-size:0.9rem;">' + CROWN_SVG + ' ' + _tH('org.organization') + '</span>' +
        '<button type="button" id="btn-confirm-host-transfer" class="btn btn-sm sp-host-invite-confirm" style="font-weight:700;">' + _tH('org.confirm') + '</button>' +
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
          '<label class="sp-host-invite-option is-selected" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:12px;cursor:pointer;" id="opt-cohost">' +
            '<input type="radio" name="host-type" value="cohost" checked style="margin-top:2px;accent-color:#fbbf24;">' +
            '<div><div style="font-weight:700;color:var(--text-bright);font-size:0.88rem;">' + _tH('org.share') + '</div><div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">' + _tH('org.shareDesc') + '</div></div>' +
          '</label>' +
          '<label class="sp-host-invite-option" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:12px;cursor:pointer;" id="opt-transfer">' +
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
        document.getElementById('opt-cohost').classList.remove('is-selected');
        document.getElementById('opt-transfer').classList.remove('is-selected');
        var sel = document.getElementById('opt-' + r.value);
        if (sel) sel.classList.add('is-selected');
      });
    });

    // Confirm handler
    var confirm = document.getElementById('btn-confirm-host-transfer');
    var busy = false;
    confirm.addEventListener('click', function() {
      if (busy) return;
      var checked = overlay.querySelector('input[name="host-type"]:checked');
      var type = checked ? checked.value : 'cohost';
      busy = true; confirm.disabled = true;
      var action = type === 'transfer'
        ? window._initiateHostTransfer(tId, { uid: pUid, displayName: pName })
        : window._initiateCoHostInvite(tId, { uid: pUid, displayName: pName });
      Promise.resolve(action).then(function(result) {
        if (result && (result.ok || result.changed || result.alreadyInvited)) overlay.remove();
        else { busy = false; confirm.disabled = false; }
      }).catch(function() { busy = false; confirm.disabled = false; });
    });
  };

  // O cliente apenas declara a intenção. A Function relê o torneio e confirma a
  // alteração antes de qualquer notificação; não existe estado otimista de organização.
  function _mutateHostOrganization(tId, action, inviteType, targetUid) {
    if (typeof window._callCF !== 'function') return Promise.reject(new Error('sem conexão com o servidor'));
    return Promise.resolve(window._callCF('mutateHostOrganization', {
      tournamentId: String(tId), action: String(action), inviteType: String(inviteType), targetUid: String(targetUid || '')
    })).then(function (res) { return (res && res.data) ? res.data : (res || {}); });
  }

  // ─── Initiate host transfer ───────────────────────────────────────────────
  window._initiateHostTransfer = function(tId, target) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    var user = window.AppStore.currentUser;
    if (!t || !user || !target || !target.uid) return Promise.resolve({ error: true });
    return _mutateHostOrganization(tId, 'invite', 'transfer', target.uid).then(function (out) {
      if (!out.changed) throw new Error('convite já não está disponível');
      var name = out.targetName || target.displayName || '';
      _notifyUser(out.targetUid || target.uid, {
        type: 'host_transfer_invite', tournamentId: String(t.id), tournamentName: out.tournamentName || t.name,
        fromName: user.displayName, fromUid: user.uid,
        message: (user.displayName || _tH('org.theOrganizer')) + ' ' + _tH('org.wantsToTransfer') + ' "' + (out.tournamentName || t.name) + '".',
        level: 'fundamental'
      });
      _notifyUser(user.uid, {
        type: 'host_transfer_sent', tournamentId: String(t.id), tournamentName: out.tournamentName || t.name,
        targetName: name, message: _tH('org.transferInviteSent') + ' ' + name + '.', level: 'all', inviteType: 'transfer'
      });
      if (typeof showNotification === 'function') showNotification(_tH('org.inviteSent'), _tH('org.awaitingResponse') + ' ' + name, 'info');
      return { ok: true };
    }).catch(function (e) {
      window._warn('[co-org] transferência não gravada', e);
      if (typeof showNotification === 'function') showNotification('Não foi possível convidar', _inviteErrorMessage(e), 'error');
      return { error: true };
    });
  };

  // ─── Initiate co-host invite ──────────────────────────────────────────────
  window._initiateCoHostInvite = function(tId, target) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    var user = window.AppStore.currentUser;
    if (!t || !user || !target || !target.uid) return Promise.resolve({ error: true });
    return _mutateHostOrganization(tId, 'invite', 'cohost', target.uid).then(function (out) {
      if (!out.changed) {
        if (typeof showNotification === 'function') showNotification(_tH('org.alreadyInvited'), (target.displayName || _pName(target)) + ' ' + _tH('org.alreadyInvitedMsg'), 'warning');
        return { alreadyInvited: true };
      }
      var name = out.targetName || target.displayName || '';
      // O convite e o aviso ao destinatário são gravados juntos na Function.
      _notifyUser(user.uid, {
        type: 'cohost_invite_sent', tournamentId: String(t.id), tournamentName: out.tournamentName || t.name,
        targetName: name, message: _tH('org.cohostInviteSent') + ' ' + name + '.', level: 'all', inviteType: 'cohost'
      });
      if (!window.FirestoreDB || typeof window.FirestoreDB.sendCoHostInviteEmail !== 'function') return { enviado: false };
      return Promise.resolve(window.FirestoreDB.sendCoHostInviteEmail(String(t.id), String(out.targetUid || target.uid)))
        .catch(function (e) { window._warn('[co-org] e-mail falhou:', e && e.message); return { enviado: false }; });
    }).then(function (veredito) {
      if (veredito && veredito.alreadyInvited) return veredito;
      var quem = target.displayName || target.email || '';
      if (veredito && veredito.enviado) {
        if (typeof showNotification === 'function') showNotification(_tH('org.inviteSent'), _tH('org.awaitingResponse') + ' ' + quem, 'info');
      } else if (typeof showNotification === 'function') {
        showNotification('Convite registrado', quem + ' já pode ver o convite no app — mas o e-mail de aviso não pôde ser enviado agora.', 'warning');
      }
      return { changed: true };
    }).catch(function (e) {
      window._warn('[co-org] convite não gravado', e);
      if (typeof showNotification === 'function') showNotification('Não foi possível convidar',
        typeof _inviteErrorMessage === 'function' ? _inviteErrorMessage(e) : 'O convite não foi salvo. Tente novamente.', 'error');
      return { error: true };
    });
  };

  // A projeção do servidor decide quem pode receber convite. Perfil e nome são
  // apenas apresentação; users.friends não é prova de amizade aceita.
  window._openTournamentFriendInvitePicker = function(tId, role) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    var user = window.AppStore.currentUser;
    if (!t || !user || !window._souOrganizador(t) || (role !== 'cohost' && role !== 'referee')) return;
    var old = document.getElementById('tournament-friend-invite-overlay');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'tournament-friend-invite-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:1rem;';
    var panel = document.createElement('div');
    panel.style.cssText = 'width:min(100%,430px);max-height:80%;display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:16px;gap:10px;';
    var title = document.createElement('div');
    title.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--text-bright);font-weight:700;';
    title.textContent = role === 'cohost' ? 'Convidar organizador' : 'Convidar árbitro';
    var close = document.createElement('button');
    close.type = 'button'; close.className = 'btn btn-sm'; close.textContent = 'Fechar';
    close.addEventListener('click', function() { overlay.remove(); });
    title.appendChild(close);
    var input = document.createElement('input');
    input.type = 'search'; input.placeholder = 'Buscar amigo pelo nome';
    input.setAttribute('aria-label', 'Buscar amigo pelo nome');
    input.style.cssText = 'width:100%;padding:10px;border-radius:8px;background:var(--bg-input,#111827);color:var(--text-bright);border:1px solid var(--border-color);';
    var list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;min-height:80px;display:flex;flex-direction:column;gap:6px;';
    var confirmRow = document.createElement('div');
    confirmRow.style.cssText = 'display:none;align-items:center;justify-content:space-between;gap:8px;';
    var selectedName = document.createElement('span');
    selectedName.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--text-bright);';
    var send = document.createElement('button');
    send.type = 'button'; send.className = 'btn btn-sm'; send.textContent = 'Enviar convite';
    confirmRow.appendChild(selectedName); confirmRow.appendChild(send);
    panel.appendChild(title); panel.appendChild(input); panel.appendChild(list); panel.appendChild(confirmRow);
    overlay.appendChild(panel); document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    var normalize = function(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); };
    var busy = false;
    var friends = [];
    var selected = null;
    var accepted = new Set();
    var pendingReconfirmation = null;
    var loaded = false;
    function loadAcceptedFriendUids() {
      var db = window.FirestoreDB && window.FirestoreDB.db;
      if (!db) return Promise.reject(new Error('sem banco de amizades'));
      return db.collection('friendAccess').doc(user.uid).collection('accepted')
        .get({ source: 'server' }).then(function(snapshot) {
          var uids = [];
          snapshot.forEach(function(doc) {
            if (doc.id && doc.id !== user.uid) uids.push(doc.id);
          });
          return Array.from(new Set(uids));
        });
    }
    function availableForRole(uid) {
      if (role === 'cohost') return !(t.coHosts || []).some(function(ch) {
        return ch && ch.uid === uid && (ch.status === 'pending' || ch.status === 'active');
      });
      return !(t.arbitros || []).some(function(a) {
        return a && a.uid === uid && (a.status === 'invited' || a.status === 'confirmed');
      });
    }
    function loadFriends() {
      loaded = false;
      selected = null;
      confirmRow.style.display = 'none';
      list.textContent = 'Carregando amigos…';
      var legacyCall = window.FirestoreDB && window.FirestoreDB.listLegacyFriendships;
      var legacyOptional = Promise.resolve().then(function() {
        return typeof legacyCall === 'function' ? legacyCall.call(window.FirestoreDB) : [];
      })
        .catch(function() { return []; });
      return Promise.all([loadAcceptedFriendUids(), legacyOptional]).then(function(results) {
        var uids = results[0];
        var legacy = results[1];
        if (!Array.isArray(legacy)) throw new Error('lista de amizades inválida');
        var preload = typeof window._preloadUserProfiles === 'function'
          ? Promise.resolve(window._preloadUserProfiles(uids)).catch(function() {})
          : Promise.resolve();
        return preload.then(function() {
          if (!overlay.isConnected) return;
          accepted = new Set(uids);
          var cache = window._userProfileCache || {};
          var fallback = window._friendProfilesCache || {};
          friends = uids.filter(availableForRole).map(function(uid) {
            var p = cache[uid] || fallback[uid] || {};
            return { uid: uid, name: String(p.displayName || p.name || '').trim(),
              photo: p.photoURL || '', state: 'accepted' };
          }).filter(function(friend) { return !!friend.name; });
          legacy.forEach(function(r) {
            var uid = r && String(r.uid || '');
            if (!uid || accepted.has(uid) || uid === user.uid || !availableForRole(uid)) return;
            friends.push({ uid: uid, name: String(r.displayName || 'Amigo sem nome público').trim(),
              photo: r.photoURL || '', state: 'legacy' });
          });
          if (pendingReconfirmation && !accepted.has(pendingReconfirmation.uid)) {
            friends = friends.filter(function(f) { return f.uid !== pendingReconfirmation.uid; });
            friends.push({ uid: pendingReconfirmation.uid, name: pendingReconfirmation.name,
              photo: pendingReconfirmation.photo, state: 'pending' });
          }
          loaded = true;
          render();
          input.focus();
        });
      });
    }
    send.addEventListener('click', function() {
      if (busy || !loaded || !selected || !accepted.has(selected.uid)) return;
      busy = true; send.disabled = true;
      var invitation = role === 'cohost'
        ? window._initiateCoHostInvite(tId, { uid: selected.uid, displayName: selected.name })
        : (typeof window._arbitrosInvite === 'function' ? window._arbitrosInvite(selected.uid, tId) : null);
      Promise.resolve(invitation).then(function(result) {
        if (result == null || result.error) {
          busy = false; send.disabled = false;
          if (invitation === null && typeof showNotification === 'function')
            showNotification('Não foi possível convidar', 'A arbitragem está indisponível agora.', 'error');
          return;
        }
        if (result && result.changed) {
          // A Function já confirmou a gravação. Atualize somente a ficha local;
          // o snapshot autoritativo reconciliará o restante sem recarregar a página.
          if (role === 'cohost') {
            t.coHosts = Array.isArray(t.coHosts) ? t.coHosts : [];
            if (!t.coHosts.some(function(ch) { return ch && ch.uid === selected.uid; }))
              t.coHosts.push({ uid: selected.uid, status: 'pending', name: selected.name });
          } else {
            t.arbitros = Array.isArray(t.arbitros) ? t.arbitros : [];
            if (!t.arbitros.some(function(a) { return a && a.uid === selected.uid; }))
              t.arbitros.push({ uid: selected.uid, status: 'invited', name: selected.name, photoURL: selected.photo });
          }
          var view = document.getElementById('view-container');
          var scroll = window.scrollY || 0;
          overlay.remove();
          if (view && String(window.location.hash || '').indexOf('#tournaments/' + tId) === 0 && typeof renderTournaments === 'function') {
            renderTournaments(view, tId);
            window.scrollTo(0, scroll);
          }
          return;
        }
        overlay.remove();
      }).catch(function() { busy = false; send.disabled = false; });
    });
    var render = function() {
      list.replaceChildren();
      var q = normalize(input.value);
      var matches = friends.filter(function(f) { return !q || normalize(f.name).includes(q); });
      if (!matches.length) { list.textContent = friends.length ? 'Nenhum amigo com esse nome.' : 'Nenhum amigo disponível.'; return; }
      matches.forEach(function(friend) {
        var row = document.createElement(friend.state === 'accepted' ? 'button' : 'div');
        if (friend.state === 'accepted') { row.type = 'button'; row.className = 'btn btn-sm'; }
        row.style.cssText = 'display:flex;align-items:center;text-align:left;gap:10px;width:100%;padding:9px;';
        var img = document.createElement(friend.photo ? 'img' : 'span');
        if (friend.photo) { img.src = friend.photo; img.alt = ''; img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;'; }
        else { img.textContent = friend.name.slice(0, 1).toUpperCase(); img.style.cssText = 'width:32px;height:32px;border-radius:50%;background:#334155;display:grid;place-items:center;'; }
        var label = document.createElement('span'); label.textContent = friend.name;
        row.appendChild(img); row.appendChild(label);
        if (friend.state === 'accepted') {
          row.addEventListener('click', function() {
            if (busy || !loaded || !accepted.has(friend.uid)) return;
            selected = friend;
            selectedName.textContent = friend.name;
            confirmRow.style.display = 'flex';
          });
        } else if (friend.state === 'legacy') {
          var reconfirm = document.createElement('button');
          reconfirm.type = 'button'; reconfirm.className = 'btn btn-sm';
          reconfirm.textContent = 'Solicitar reconfirmação';
          reconfirm.style.marginLeft = 'auto';
          reconfirm.addEventListener('click', function() {
            if (busy || !loaded) return;
            busy = true; reconfirm.disabled = true; send.disabled = true;
            Promise.resolve(window.FirestoreDB.sendFriendRequest(user.uid, friend.uid)).then(function() {
              pendingReconfirmation = { uid: friend.uid, name: friend.name, photo: friend.photo };
              return loadFriends().then(function() {
                if (overlay.isConnected && typeof showNotification === 'function')
                  showNotification('Amizade', accepted.has(friend.uid) ? 'Amizade confirmada. Agora você pode convidar.' : 'Pedido de reconfirmação enviado.', 'info');
              }).catch(function() {
                if (overlay.isConnected) list.textContent = 'Pedido enviado. Não foi possível atualizar a lista agora.';
                loaded = false;
              });
            }).catch(function() {
              pendingReconfirmation = null;
              return loadFriends().then(function() {
                if (overlay.isConnected && typeof showNotification === 'function')
                  showNotification('Amizade', 'Não foi possível reconfirmar agora. Tente novamente.', 'error');
              }).catch(function() {
                if (overlay.isConnected) list.textContent = 'Não foi possível atualizar seus amigos. Feche e tente novamente.';
              });
            }).finally(function() { busy = false; send.disabled = false; });
          });
          row.appendChild(reconfirm);
        } else {
          var status = document.createElement('span');
          status.textContent = 'Pedido de reconfirmação enviado';
          status.style.marginLeft = 'auto';
          row.appendChild(status);
        }
        list.appendChild(row);
      });
    };
    input.addEventListener('input', render);
    loadFriends().catch(function() {
      if (overlay.isConnected) list.textContent = 'Não foi possível carregar seus amigos. Tente novamente.';
    });
  };

  // ─── Accept host invite ───────────────────────────────────────────────────
  // Marca apenas as notificações da PRÓPRIA conta. O aceite é confirmado pela
  // callable; marcar a caixa de outra pessoa no navegador exigia atravessar
  // users/{uid} e não faz parte da ação que a pessoa acabou de tomar.
  function _markInviteNotifsRead(uid, tId, types) {
    var me = window.AppStore && window.AppStore.currentUser;
    if (!uid || !me || String(uid) !== String(me.uid) || !tId || !window.FirestoreDB || !window.FirestoreDB.db) return;
    var db = window.FirestoreDB.db;
    types.forEach(function(typ) {
      db.collection('users').doc(me.uid).collection('notifications')
        .where('type', '==', typ).where('tournamentId', '==', String(tId)).where('read', '==', false)
        .get().then(function(snap) {
          var ids = snap.docs.map(function(d) { return d.id; });
          if (ids.length && window.FirestoreDB.markNotificationsRead) {
            // A caixa é própria, mas a mutação continua no servidor. Não há
            // atualização direta escondida no aceite de co-organização.
            window.FirestoreDB.markNotificationsRead(me.uid, ids);
          }
        }).catch(window._falhouCalado('aviso-transferencia'));
    });
    if (typeof window._updateNotificationBadge === 'function') {
      setTimeout(window._updateNotificationBadge, 500);
    }
  }

  window._acceptHostInvite = function(tId, inviteType) {
    var user = window.AppStore.currentUser;
    if (!user) return;
    // CF-ONLY (jul/2026). O aceite NUNCA foi gravável pelo cliente: promover o co-host a
    // 'active' muda `adminUids`, e a regra isCoHostAcceptanceDiff só permitia
    // hasOnly(['coHosts','adminEmails']) — como quem aceita ainda NÃO é admin, o Firestore
    // recusava com permission-denied em TODO convidado com conta (Sentry SCOREPLACE-WEB-6R).
    // Agora quem grava é a CF respondHostInvite (Admin SDK), que também exige que o
    // destinatário da TRANSFERÊNCIA seja quem aceita — antes qualquer participante assumia.
    // Identidade SÓ por uid. Ver functions/cohost-core.js.
    var _oldOrgUid, _orgRef, _tName = '', _entryFound = false, _applied = false;
    _respondHostInviteCF(tId, inviteType, 'accept').then(function (res) {
      _applied = !!(res && res.applied);
      _entryFound = _applied;
      _tName = (res && res.tournamentName) || '';
      _orgRef = (res && res.orgUid) || '';
      _oldOrgUid = (res && res.fromUid) || '';
      if (inviteType === 'transfer') {
        if (!_applied) return; // já transferido (idempotência) — nada a notificar
        _notifyUser(_oldOrgUid, { type: 'host_invite_accepted', tournamentId: String(tId), tournamentName: _tName, message: (user.displayName || _tH('org.theUser')) + ' ' + _tH('org.acceptedTransfer') + ' "' + _tName + '".', level: 'fundamental' });
        _markInviteNotifsRead(_oldOrgUid, tId, ['host_transfer_sent']);
        _notifyUser(user.uid, { type: 'host_invite_accepted', tournamentId: String(tId), tournamentName: _tName, message: _tH('org.youAcceptedTransfer') + ' "' + _tName + '".', level: 'fundamental' });
        _markInviteNotifsRead(user.uid, tId, ['host_transfer_invite']);
        if (typeof showNotification === 'function') showNotification(_tH('org.accepted'), _tH('org.youAreNow') + ' ' + _tH('org.organizerRole') + '.', 'success');
      } else if (inviteType === 'cohost') {
        if (!_entryFound) {
          if (typeof showNotification === 'function') showNotification(_tH('org.error'), 'Convite não encontrado. Peça ao organizador para re-enviar.', 'warning');
          return;
        }
        _notifyUser(_orgRef, { type: 'host_invite_accepted', tournamentId: String(tId), tournamentName: _tName, message: (user.displayName || _tH('org.theUser')) + ' ' + _tH('org.acceptedCohost') + ' "' + _tName + '".', level: 'important' });
        if (_orgRef) _markInviteNotifsRead(_orgRef, tId, ['cohost_invite_sent']);
        _notifyUser(user.uid, { type: 'host_invite_accepted', tournamentId: String(tId), tournamentName: _tName, message: _tH('org.youAcceptedCohost') + ' "' + _tName + '".', level: 'important' });
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
    // CF-ONLY (jul/2026): mesma via do aceite. Identidade SÓ por uid — a recusa deixa de
    // casar convite por e-mail. Ver functions/cohost-core.js.
    var _fromUid, _orgRef, _tName = '', _applied = false;
    _respondHostInviteCF(tId, inviteType, 'reject').then(function (res) {
      _applied = !!(res && res.applied);
      _tName = (res && res.tournamentName) || '';
      _orgRef = (res && res.orgUid) || '';
      _fromUid = (res && res.fromUid) || '';
      if (inviteType === 'transfer' && _applied) {
        _notifyUser(_fromUid, { type: 'host_invite_rejected', tournamentId: String(tId), tournamentName: _tName, message: (user.displayName || _tH('org.theUser')) + ' ' + _tH('org.rejectedTransfer') + ' "' + _tName + '".', level: 'important' });
        _markInviteNotifsRead(_fromUid, tId, ['host_transfer_sent']);
        _notifyUser(user.uid, { type: 'host_invite_rejected', tournamentId: String(tId), tournamentName: _tName, message: _tH('org.youRejectedTransfer') + ' "' + _tName + '".', level: 'important' });
        _markInviteNotifsRead(user.uid, tId, ['host_transfer_invite']);
      } else if (inviteType === 'cohost' && _applied) {
        _notifyUser(_orgRef, { type: 'host_invite_rejected', tournamentId: String(tId), tournamentName: _tName, message: (user.displayName || _tH('org.theUser')) + ' ' + _tH('org.rejectedCohost') + ' "' + _tName + '".', level: 'important' });
        if (_orgRef) _markInviteNotifsRead(_orgRef, tId, ['cohost_invite_sent']);
        _notifyUser(user.uid, { type: 'host_invite_rejected', tournamentId: String(tId), tournamentName: _tName, message: _tH('org.youRejectedCohost') + ' "' + _tName + '".', level: 'important' });
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
    var target = inviteType === 'transfer' ? (t.pendingTransfer || {}) : ((t.coHosts || []).find(function (ch) { return ch && ch.status === 'pending'; }) || {});
    if (!target.targetUid && !target.uid) return;
    _mutateHostOrganization(tId, 'cancel', inviteType, target.targetUid || target.uid).then(function (out) {
      if (!out.changed) return;
      var targetUid = out.targetUid || target.targetUid || target.uid;
      _notifyUser(targetUid, {
        type: 'cohost_removed', tournamentId: String(t.id), tournamentName: out.tournamentName || t.name,
        message: (user ? user.displayName : '') + ' ' + _tH('org.cancelledInviteFor') + ' "' + (out.tournamentName || t.name) + '".', level: 'important'
      });
      if (typeof showNotification === 'function') showNotification(_tH('org.cancelled'), _tH('org.inviteCancelled'), 'info');
    }).catch(function (e) { window._warn('[co-org] cancelamento falhou', e); if (typeof showNotification === 'function') showNotification(_tH('org.error'), _tH('org.errorProcessing'), 'error'); });
  };

  // ─── Remove co-host (creator only) ───────────────────────────────────────
  window._removeCoHost = function(tId, coHostKey) {
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (!t || !window.AppStore.isCreator(t)) return;
    var removed = (t.coHosts || []).find(function(ch) { return ch && ch.uid === coHostKey; });
    if (!removed) return;
    _mutateHostOrganization(tId, 'remove', 'cohost', coHostKey).then(function (out) {
      if (!out.changed) return;
      _notifyUser(out.targetUid || coHostKey, {
        type: 'cohost_removed', tournamentId: String(t.id), tournamentName: out.tournamentName || t.name,
        message: _tH('org.youWereRemoved') + ' "' + (out.tournamentName || t.name) + '".', level: 'important'
      });
      if (typeof showNotification === 'function') showNotification(_tH('org.removed'), (out.targetName || removed.displayName || coHostKey) + ' ' + _tH('org.removedFromOrg'), 'info');
      var container = document.getElementById('view-container');
      if (container && typeof renderTournaments === 'function') renderTournaments(container, String(tId));
    }).catch(function (e) { window._warn('[co-org] remoção falhou', e); if (typeof showNotification === 'function') showNotification(_tH('org.error'), _tH('org.errorProcessing'), 'error'); });
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
    // Só participantes com UID podem receber uma função organizadora. Vaga manual
    // sem UID não representa conta e não pode receber convite por rótulo/e-mail.
    var orgUids = [t.creatorUid];
    if (Array.isArray(t.coHosts)) t.coHosts.forEach(function(ch) { if (ch.uid && ch.status === 'active') orgUids.push(ch.uid); });
    var eligible = parts.filter(function(p) {
      if (typeof p === 'string') return false;
      var puid = p.uid || '';
      if (!puid) return false;
      if (puid === user.uid) return false;
      if (orgUids.indexOf(puid) !== -1) return false;
      return true;
    });

    // Also check for pending invites
    // Convites pendentes por UID. Convite legado sem UID é apenas histórico e não bloqueia
    // nem concede identidade a uma conta selecionada agora.
    var pendingUids = [];
    if (t.pendingTransfer) {
      if (t.pendingTransfer.targetUid) pendingUids.push(t.pendingTransfer.targetUid);
    }
    if (Array.isArray(t.coHosts)) t.coHosts.forEach(function(ch) { if (ch.status === 'pending' && ch.uid) pendingUids.push(ch.uid); });

    var overlay = document.createElement('div');
    overlay.id = 'org-picker-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;';

    var listHtml = '';
    if (eligible.length === 0) {
      listHtml = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;">' + _tH('org.noEligible') + '</div>';
    } else {
      eligible.forEach(function(p) {
        var name = p.displayName || p.name || '';
        var pUid = p.uid || '';
        var isPending = pUid && pendingUids.indexOf(pUid) !== -1;
        var safeUid = pUid.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var safeName = window._safeHtml(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        listHtml += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:' + (isPending ? 'default' : 'pointer') + ';background:' + window._spCor((isPending ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.03)'), 'background') + ';border:1px solid ' + window._spCor((isPending ? 'rgba(251,191,36,0.3)' : 'var(--border-color)'), 'borda') + ';transition:background 0.2s;" ' +
          (isPending ? '' : 'onmouseover="this.style.background=\'rgba(251,191,36,0.1)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.03)\'" onclick="document.getElementById(\'org-picker-overlay\').remove(); window._openHostTransferDialog({uid:\'' + safeUid + '\',displayName:\'' + safeName + '\'},\'' + String(tId).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')"') + '>' +
          // ⭐ PONTO ÚNICO: o uid está aqui (pUid) e o perfil pode não ter resolvido ainda.
          // Semear o avatar pelo NOME devolvia círculo mudo, e o nome escrito no HTML
          // congelava vazio. Ver `_personAvatarHtml` em store.js.
          window._personAvatarHtml(pUid, name, 'width:36px;height:36px;border-radius:50%;flex-shrink:0;') +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:0.88rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
              window._personNameHtml(pUid, name, '') + '</div>' +
          '</div>' +
          (isPending ? '<span style="font-size:0.65rem;color:var(--sp-c-fbbf24,#fbbf24);font-weight:600;white-space:nowrap;">' + _tH('org.pendingInvite') + '</span>' : '<span style="font-size:1rem;color:var(--text-muted);">›</span>') +
        '</div>';
      });
    }

    overlay.innerHTML = '<div style="background:var(--bg-card);width:94%;max-width:400px;border-radius:16px;border:1px solid rgba(251,191,36,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden;max-height:80%;display:flex;flex-direction:column;">' +
      '<div style="padding:0.75rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#78350f,#b45309);flex-shrink:0;">' +
        '<button type="button" onclick="document.getElementById(\'org-picker-overlay\').remove()" class="btn btn-sm" style="background:var(--sp-g-255-255-255-015,rgba(255,255,255,0.15));color:var(--sp-c-fef3c7,#fef3c7);border:1px solid var(--sp-b-255-255-255-025,rgba(255,255,255,0.25));">' + _tH('org.cancel') + '</button>' +
        '<span style="font-weight:700;color:var(--sp-c-fef3c7,#fef3c7);font-size:0.9rem;">' + CROWN_SVG + ' ' + _tH('org.organization') + '</span>' +
        '<div style="width:70px;"></div>' +
      '</div>' +
      '<div style="padding:1rem;font-size:0.8rem;color:var(--text-muted);text-align:center;border-bottom:1px solid var(--border-color);flex-shrink:0;">' + _tH('org.pickParticipant') + '</div>' +
      '<div style="padding:0.75rem;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">' + listHtml + '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  };

  // ─── Helper: send notification — uses _sendUserNotification (proven path) with fallback ──
  function _notifyUser(uid, data) {
    if (!uid) {
      window._warn('[host-transfer] notificação sem uid válido');
      return;
    }
    var cu = window.AppStore.currentUser || {};
    var payload = {
      type: data.type || 'info',
      fromUid: data.fromUid || cu.uid || '',
      fromName: data.fromName || cu.displayName || '',
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

    // Esta porta recebe exclusivamente UID das mutações confirmadas pela
    // Function. Não relê perfil nem aceita e-mail/nome como destino: além de
    // ser redundante, o fallback anterior usava um destino inexistente e podia
    // silenciar o aviso inteiro.
    _resolveAndSend(uid);
  }
})();
