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
    // v1.6.9: o convite de co-organização/transferência é ACIONÁVEL enquanto o convite
    // ESTIVER PENDENTE no torneio — não enquanto a notificação estiver "não lida".
    // Antes os botões Aceitar/Recusar eram gateados só por `isUnread` E o clique marcava
    // a notificação como lida NA HORA, antes de saber se o aceite tinha gravado. Um
    // aceite que falhava (era o caso de TODO convidado com conta antes da 1.6.1 —
    // permission-denied) queimava o convite: a notificação virava "lida", os botões
    // desapareciam e a pessoa não tinha mais como responder. Caso real: Raquel Unger
    // (Confra BT) clicou Aceitar 2× (30/mai e 29/jul), o organizador recebeu
    // "aceitou ser co-organizador" nas duas, e o card seguiu "Pendente de aceite".
    // Agora a verdade é o doc do torneio: se ainda há convite pendente pra MIM, os
    // botões estão lá — independente de leitura. Quem marca lida é o SUCESSO
    // (_markInviteNotifsRead no aceite/recusa aplicados). Ver [[project_cohost_invite_cf_uid_only]].
    function _findTourn(tId) {
      if (!tId || !window.AppStore || !Array.isArray(window.AppStore.tournaments)) return null;
      return window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); }) || null;
    }
    // Convite AINDA pendente PRA MIM (identidade = uid, sempre). Torneio não carregado
    // localmente → devolve null ("não sei"), e aí vale o comportamento antigo (isUnread).
    function _invitePendingForMe(tId, invType) {
      var t = _findTourn(tId);
      if (!t) return null;
      var myUid = cu && cu.uid;
      if (!myUid) return false;
      if (invType === 'transfer') {
        return !!(t.pendingTransfer && t.pendingTransfer.targetUid === myUid);
      }
      return !!(Array.isArray(t.coHosts) && t.coHosts.some(function (ch) {
        return ch && ch.status === 'pending' && ch.uid && ch.uid === myUid;
      }));
    }
    // Convite que EU enviei e ainda está pendente (botão Cancelar do organizador).
    function _sentInviteStillPending(tId, invType) {
      var t = _findTourn(tId);
      if (!t) return null;
      if (invType === 'transfer') return !!t.pendingTransfer;
      return !!(Array.isArray(t.coHosts) && t.coHosts.some(function (ch) { return ch && ch.status === 'pending'; }));
    }
    // O RESULTADO desta notificação ainda está PENDENTE? (v1.8.70)
    //
    // Relato do dono (print de 14/ago, três cards seguidos): "essas notificações
    // precisavam ser dinâmicas. na medida em que já foram aprovadas, não deveria
    // mais ter o confirmar ou contestar (apenas o editar)". A notificação é um
    // RETRATO do instante em que foi criada; o jogo continua andando. Oferecer
    // "Confirmar" pra um placar JÁ aprovado é pedir uma decisão que não existe
    // mais — e, pior, promete uma ação que a chave vai recusar.
    //
    // A régua é a MESMA do card da chave (bracket.js): pendente = tem
    // `pendingResult` E ainda não tem vencedor. Aqui não se reimplementa nada —
    // se as duas divergissem, a notificação voltaria a mentir por outro caminho.
    // Torneio/jogo não carregado localmente → null ("não sei"), e aí vale o
    // comportamento antigo, exatamente como nos convites logo acima.
    function _resultStillPending(n) {
      var t = _findTourn(n && n.tournamentId);
      if (!t) return null;
      if (!n.matchId || typeof window._findMatch !== 'function') return null;
      var m = window._findMatch(t, n.matchId);
      if (!m) return null;                       // jogo sumiu (re-sorteio) → não decide
      return !!m.pendingResult && !m.winner;
    }
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
      var _isInvite = (n.type === 'host_transfer_invite' || n.type === 'cohost_invite');
      var _isSent = (n.type === 'host_transfer_sent' || n.type === 'cohost_invite_sent');
      var _pend = _isInvite ? _invitePendingForMe(n.tournamentId, n.type === 'host_transfer_invite' ? 'transfer' : 'cohost') : null;
      var _sentPend = _isSent ? _sentInviteStillPending(n.tournamentId, n.inviteType || 'cohost') : null;
      if (_isInvite && (_pend === true || (_pend === null && isUnread))) {
        var _invType = n.type === 'host_transfer_invite' ? 'transfer' : 'cohost';
        // Sem _markNotifRead no clique: quem marca lida é o aceite/recusa APLICADO
        // (_markInviteNotifsRead). Se a gravação falhar, o convite continua respondível.
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 4px 14px; font-size: 0.75rem;" onclick="event.stopPropagation(); window._rejectHostInvite(\'' + safeTournamentId + '\',\'' + _invType + '\')">' + _t('notif.reject') + '</button>' +
          '<button class="btn btn-sm" style="background: var(--success-color); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 600;" onclick="event.stopPropagation(); window._acceptHostInvite(\'' + safeTournamentId + '\',\'' + _invType + '\')">' + _t('notif.accept') + '</button>' +
        '</div>';
      } else if (_isSent && (_sentPend === true || (_sentPend === null && isUnread))) {
        var _cancelType = n.inviteType || 'cohost';
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 4px 14px; font-size: 0.75rem;" onclick="event.stopPropagation(); window._cancelHostInvite(\'' + safeTournamentId + '\',\'' + _cancelType + '\'); _markNotifRead(\'' + safeNotifId + '\')">' + _t('notif.cancelInvite') + '</button>' +
        '</div>';
      } else if (n.type === 'friend_request' && isUnread) {
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 4px 14px; font-size: 0.75rem;" onclick="event.stopPropagation(); _rejectFriend(\'' + safeFromUid + '\'); _markNotifRead(\'' + safeNotifId + '\')">' + _t('notif.reject') + '</button>' +
          '<button class="btn btn-sm" style="background: var(--success-color); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 600;" onclick="event.stopPropagation(); _acceptFriend(\'' + safeFromUid + '\'); _markNotifRead(\'' + safeNotifId + '\')">' + _t('notif.accept') + '</button>' +
        '</div>';
      } else if (n.type === 'match-pending-approval' && n.tournamentId) {
        // v2.1.18: resultado pendente — botões Confirmar (verde) e Editar/Contestar
        // (âmbar) levam direto pra chave, onde a ação real acontece com o card
        // do jogo (Confirmar/Editar/Contestar bem testados). A mensagem já mostra
        // o placar quebrado em linhas, então a escolha é informada.
        //
        // v1.8.70 — E OS BOTÕES SEGUEM O JOGO, NÃO A NOTIFICAÇÃO: aprovado o
        // placar, "Confirmar" e "Contestar" saem de cena (não há mais o que
        // decidir) e sobra só EDITAR, que continua valendo — corrigir resultado
        // é sempre possível. `null` = não sei (torneio/jogo não carregado) →
        // mantém os dois, que é o comportamento antigo.
        var _pendRes = _resultStillPending(n);
        var _btnEditar =
          '<button class="btn btn-sm" style="background:#f59e0b;color:#1a1a2e;border:none;padding:6px 18px;font-size:0.78rem;font-weight:700;" onclick="event.stopPropagation(); window.location.hash=\'#bracket/' + safeTournamentId + '\'; _markNotifRead(\'' + safeNotifId + '\')">✏️ ' +
          (_pendRes === false ? 'Editar' : (_t('notif.editContest') || 'Editar / Contestar')) + '</button>';
        var _btnConfirmar = (_pendRes === false) ? '' :
          '<button class="btn btn-sm" style="background:#10b981;color:#fff;border:none;padding:6px 18px;font-size:0.78rem;font-weight:700;" onclick="event.stopPropagation(); window.location.hash=\'#bracket/' + safeTournamentId + '\'; _markNotifRead(\'' + safeNotifId + '\')">✅ ' + (_t('notif.confirm') || 'Confirmar') + '</button>';
        // Já resolvido: uma linha diz o que aconteceu, senão o card vira só um
        // botão solto e a pessoa não entende por que os outros sumiram.
        var _jaResolvido = (_pendRes === false)
          ? '<div style="margin-top:8px;font-size:0.74rem;color:var(--text-muted);display:flex;align-items:center;gap:6px;"><span>✅</span><span>Resultado já confirmado</span></div>'
          : '';
        actionHtml = _jaResolvido + '<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap:wrap;">' +
          _btnEditar + _btnConfirmar +
        '</div>';
      } else if (n.type === 'category-data-request') {
        // v2.3.92: inscrição pendente por falta de dado no perfil. Botão principal
        // abre o perfil; secundário leva ao torneio.
        actionHtml = '<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap:wrap;">' +
          '<button class="btn btn-sm" style="background:#f59e0b;color:#1a1a2e;border:none;padding:6px 18px;font-size:0.78rem;font-weight:700;" onclick="event.stopPropagation(); window.location.hash=\'#profile\'; _markNotifRead(\'' + safeNotifId + '\')">👤 Abrir meu perfil</button>' +
          (n.tournamentId ? '<button class="btn btn-sm" style="background: var(--primary-color); color: #fff; border: none; padding: 6px 14px; font-size: 0.78rem; font-weight: 600;" onclick="event.stopPropagation(); window.location.hash=\'#tournaments/' + safeTournamentId + '\'; _markNotifRead(\'' + safeNotifId + '\')">' + (_t('notif.viewTournament') || 'Ver torneio') + '</button>' : '') +
        '</div>';
      } else if (n.type === 'pair_invite' && n.tournamentId && n.pairRequestId) {
        // v2.7.94: convite de dupla — Recusar (vermelho) / Aceitar (verde), botões
        // padrão do app. Clicar faz a ação E pula pro card do usuário no torneio.
        var safePairReq = String(n.pairRequestId).replace(/'/g, "\\'").replace(/\\/g, "\\\\");
        actionHtml = '<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap:wrap;">' +
          '<button class="btn btn-sm" style="background: var(--danger-color); color:#fff; border:none; padding:6px 16px; font-size:0.78rem; font-weight:700;" onclick="event.stopPropagation(); if(window._cancelPairRequest)window._cancelPairRequest(\'' + safeTournamentId + '\',\'' + safePairReq + '\'); _markNotifRead(\'' + safeNotifId + '\'); window.location.hash=\'#tournaments/' + safeTournamentId + '\';">❌ Recusar</button>' +
          '<button class="btn btn-sm" style="background:#10b981; color:#fff; border:none; padding:6px 16px; font-size:0.78rem; font-weight:700;" onclick="event.stopPropagation(); if(window._acceptPairRequest)window._acceptPairRequest(\'' + safeTournamentId + '\',\'' + safePairReq + '\'); _markNotifRead(\'' + safeNotifId + '\'); window.location.hash=\'#tournaments/' + safeTournamentId + '\';">✅ Aceitar</button>' +
        '</div>';
      } else if (n.type === 'wa_group' && n.waGroupLink) {
        // v1.3.17: convite pro grupo de WhatsApp — o botão abre o link direto
        // (window.open), + "Ver torneio" secundário. Link do organizador (confiável); escapa
        // aspas/barras/aspas-duplas pro contexto onclick.
        // v1.7.25 — A TERCEIRA SUPERFÍCIE. O tipo `wa_group` serve aos DOIS grupos, e aqui
        // o botão era verde e dizia só "Entrar no grupo" — mesmo apontando pro GERAL do
        // torneio. É a confusão que a 1.7.24 desfez nos chips, viva na notificação.
        // Quem distingue é o payload: `matchId` só existe no grupo do JOGO
        // (ver `_notifyOthers` em wa-group.js). Verde = do jogo, azul = geral, e o rótulo
        // é o mesmo do chip — a pessoa lê a mesma frase nos dois lugares.
        var safeWaLink = String(n.waGroupLink).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '');
        var _waIsMatch = !!n.matchId;
        var _waBg = _waIsMatch ? '#25D366' : '#3b82f6';
        var _waLbl = _waIsMatch ? '💬 Seu grupo de whats de jogo' : '💬 Entrar no grupo geral oficial do torneio';
        actionHtml = '<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap:wrap;">' +
          '<button class="btn btn-sm" style="background:' + _waBg + '; color:#fff; border:none; padding:6px 16px; font-size:0.78rem; font-weight:700;" onclick="event.stopPropagation(); window.open(\'' + safeWaLink + '\',\'_blank\'); _markNotifRead(\'' + safeNotifId + '\')">' + _waLbl + '</button>' +
          (n.tournamentId ? '<button class="btn btn-sm" style="background: var(--primary-color); color: #fff; border: none; padding: 6px 14px; font-size: 0.78rem; font-weight: 600;" onclick="event.stopPropagation(); window.location.hash=\'#tournaments/' + safeTournamentId + '\'; _markNotifRead(\'' + safeNotifId + '\')">' + (_t('notif.viewTournament') || 'Ver torneio') + '</button>' : '') +
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
          '<button class="btn btn-sm" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 4px 14px; font-size: 0.75rem;" onclick="event.stopPropagation(); var n=JSON.parse(this.getAttribute(\'data-notif\')); if(window._confirmCasualLinkRequest)window._confirmCasualLinkRequest(n,false);" data-notif="' + notifJsonSafe + '">❌ Não, era outra pessoa</button>' +
          '<button class="btn btn-sm" style="background: var(--success-color); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 700;" onclick="event.stopPropagation(); var n=JSON.parse(this.getAttribute(\'data-notif\')); if(window._confirmCasualLinkRequest)window._confirmCasualLinkRequest(n,true);" data-notif="' + notifJsonSafe + '">✅ Sim, era eu</button>' +
        '</div>';
      } else if ((n.type === 'casual_link_accepted' || n.type === 'casual_link_rejected') && n.casualRoomCode) {
        // Confirmação que veio de volta — botão pra revisar a partida.
        var safeRoomCfm = String(n.casualRoomCode).replace(/'/g, "\\'").replace(/\\/g, "\\\\").toUpperCase();
        actionHtml = '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
          '<button class="btn btn-sm" style="background:linear-gradient(135deg,#38bdf8,#0ea5e9); color: #fff; border: none; padding: 4px 14px; font-size: 0.75rem; font-weight: 700;" onclick="event.stopPropagation(); window.location.hash=\'#casual/' + safeRoomCfm + '\'; _markNotifRead(\'' + safeNotifId + '\')">📊 Ver partida</button>' +
        '</div>';
      }

      // Escape HTML in message to prevent XSS — v2.8.37: via window._safeHtml (canônico).
      var safeMessage = window._safeHtml(n.message || _t('notif.fallback'));

      var safeNotifIdOnclick = (n._id || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
      // Borda esquerda colorida pela IMPORTÂNCIA (sempre visível, lida ou não).
      // v1.8.78: `data-notif-id` + `data-notif-autoread` alimentam o observador de
      // permanência em tela (ver `_observeNotifDwell` no fim do render). O id já existia,
      // mas só dentro da string do onclick — de onde não dá pra lê-lo.
      var _autoRead = isUnread && _AUTOREAD_TYPES_OK(n.type);
      return '<div class="card" data-notif-id="' + window._safeHtml(n._id || '') + '"' +
        (_autoRead ? ' data-notif-autoread="1"' : '') +
        ' style="padding: 1rem; display: flex; align-items: flex-start; gap: 12px; cursor: pointer; border-left: 4px solid ' + accentColor + ';' +
        (isUnread ? ' background: rgba(37, 99, 235, 0.05);' : ' opacity: 0.62;') + '" ' +
        (isUnread ? 'onclick="_markNotifRead(\'' + safeNotifIdOnclick + '\', this)"' : '') + '>' +
        '<div style="font-size: 1.5rem; flex-shrink: 0; line-height: 1;">' + icon + '</div>' +
        '<div style="flex: 1; min-width: 0;">' +
          '<div style="font-size: 0.9rem; color: var(--text-bright); font-weight: ' + (isUnread ? '600' : '400') + '; white-space: pre-line;">' + safeMessage + '</div>' +
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

    // ── v1.8.78: LIDA = FICOU 5s NA TELA ──────────────────────────────────────
    // Ordem do dono (15/ago): "quando abrimos as notificações, aquelas que aparecerem
    // na tela devem ser consideradas lidas se ficarem mais do que 5 segs na tela."
    // ⚠️ Isto RESTRINGE o comportamento anterior, não o amplia: até aqui o render
    // marcava TODAS como lidas de imediato (um `forEach` sobre a lista inteira), então
    // notificação que morava 20 telas abaixo da dobra — e que ninguém chegou a ver —
    // era carimbada como lida e o contador zerava. Agora só conta o que apareceu de
    // fato, e só depois de permanecer meio visível por 5 segundos: passar batido numa
    // rolagem rápida não marca nada.
    // Os tipos que pedem AÇÃO (convite, pedido de amizade, placar aguardando você)
    // seguem de fora — quem marca lida ali é a ação aplicada, e escondê-los por
    // permanência tiraria o convite da vista de quem ainda não respondeu.
    _observeNotifDwell(uid, listDiv);
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
// ── v1.8.78: leitura por PERMANÊNCIA EM TELA ────────────────────────────────
// Tipos que pedem uma AÇÃO do usuário nunca são marcados por permanência: quem os
// marca lida é a ação aplicada (aceitar/recusar/confirmar). Fonte única — o render
// e o observador consultam a MESMA lista; se divergissem, um convite poderia sumir
// da lista de não lidas sem ninguém ter respondido.
window._NOTIF_ACTION_TYPES = ['host_transfer_invite', 'cohost_invite', 'host_transfer_sent',
  'cohost_invite_sent', 'friend_request', 'casual_link_request', 'match-pending-approval'];
function _AUTOREAD_TYPES_OK(tipo) {
  return window._NOTIF_ACTION_TYPES.indexOf(tipo) === -1;
}

// Quanto tempo o cartão precisa ficar visível pra contar como lido, e o quanto dele
// precisa estar à vista. Meia altura evita que um cartão só espiando na borda da tela
// durante a rolagem já comece a contar.
window._NOTIF_DWELL_MS = 5000;
var _NOTIF_DWELL_RATIO = 0.5;

function _observeNotifDwell(uid, listDiv) {
  // Re-render cria cartões novos: o observador velho ficaria vigiando nós órfãos.
  if (window._notifDwellObserver) {
    try { window._notifDwellObserver.disconnect(); } catch (e) {}
    window._notifDwellObserver = null;
  }
  if (window._notifDwellTimers) {
    Object.keys(window._notifDwellTimers).forEach(function(k) { clearTimeout(window._notifDwellTimers[k]); });
  }
  window._notifDwellTimers = {};

  // Sem um container consultável não há o que vigiar. (Acontece de verdade: o
  // `listDiv` pode não existir ainda, e os testes de render usam um DOM mínimo.)
  var alvos = (listDiv && typeof listDiv.querySelectorAll === 'function')
    ? listDiv.querySelectorAll('[data-notif-autoread="1"]') : [];
  if (!alvos.length) return;

  // Sem IntersectionObserver (navegador antigo) o recurso não existe — e aí é melhor
  // marcar ao abrir do que nunca marcar, senão o contador do sininho nunca zera.
  if (typeof IntersectionObserver !== 'function') {
    Array.prototype.forEach.call(alvos, function(el) {
      var id = el.getAttribute('data-notif-id');
      if (id) window.FirestoreDB.markNotificationRead(uid, id);
    });
    setTimeout(function() { window._updateNotificationBadge(); }, 800);
    return;
  }

  var _pendentesDeBadge = 0;
  function _agendaBadge() {
    _pendentesDeBadge++;
    clearTimeout(window._notifBadgeTid);
    // Uma atualização só pro lote — o sininho não precisa piscar a cada cartão.
    window._notifBadgeTid = setTimeout(function() {
      _pendentesDeBadge = 0;
      window._updateNotificationBadge();
    }, 600);
  }

  window._notifDwellObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      var el = entry.target;
      var id = el.getAttribute('data-notif-id');
      if (!id) return;
      // Já marcado: o `unobserve` abaixo tira o cartão da vigilância, mas uma entrada
      // ENFILEIRADA antes disso ainda pode chegar — e marcaria a mesma notificação duas
      // vezes. A ausência do atributo é o registro de "esse já foi".
      if (!el.getAttribute('data-notif-autoread')) return;
      if (entry.isIntersecting && entry.intersectionRatio >= _NOTIF_DWELL_RATIO) {
        if (window._notifDwellTimers[id]) return;      // já contando
        window._notifDwellTimers[id] = setTimeout(function() {
          delete window._notifDwellTimers[id];
          el.removeAttribute('data-notif-autoread');   // não conta duas vezes
          try { window._notifDwellObserver.unobserve(el); } catch (e) {}
          window.FirestoreDB.markNotificationRead(uid, id);
          // o cartão mostra na hora que foi lido (o ponto azul some) — sem re-render,
          // que reordenaria a lista embaixo do dedo de quem está lendo.
          var dot = el.querySelector('.notif-unread-dot');
          if (dot) dot.style.display = 'none';
          el.style.background = 'transparent';
          el.style.opacity = '0.62';
          _agendaBadge();
        }, window._NOTIF_DWELL_MS);
      } else if (window._notifDwellTimers[id]) {
        // saiu da tela antes dos 5s — a contagem recomeça do zero na próxima vez
        clearTimeout(window._notifDwellTimers[id]);
        delete window._notifDwellTimers[id];
      }
    });
  }, { threshold: [0, _NOTIF_DWELL_RATIO, 1] });

  Array.prototype.forEach.call(alvos, function(el) { window._notifDwellObserver.observe(el); });
}

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
