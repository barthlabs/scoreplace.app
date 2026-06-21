// ─── Email Templates: HTML email generators for Firestore "Trigger Email" ──
// Client-side only. Returns HTML strings written to the 'mail' collection.
// The email body carries the actual notification content, not a generic
// "open the app" stub — so recipients can read what happened without
// opening the webapp.
(function() {
  'use strict';

  var BRAND_COLOR = '#3b82f6';
  var BG_COLOR = '#111827';
  var TEXT_COLOR = '#e5e7eb';
  var MUTED_COLOR = '#9ca3af';

  // Friendly subtitle shown above the notification body. Maps notification
  // type → human-readable heading. Falls back to a generic label.
  var _TYPE_HEADINGS = {
    enrollment:                 { icon: '✅', title: 'Inscrição confirmada' },
    enrollment_new:             { icon: '✅', title: 'Nova inscrição' },
    enrollment_confirm:         { icon: '🎉', title: 'Inscrição confirmada' },
    enrollment_cancelled:       { icon: '🛑', title: 'Inscrição cancelada' },
    enrollment_cancelled_confirm: { icon: '🛑', title: 'Inscrição cancelada' },
    enrollments_closed:         { icon: '🔒', title: 'Inscrições encerradas' },
    enrollments_reopened:       { icon: '🔓', title: 'Inscrições reabertas' },
    tournament_created:         { icon: '🏆', title: 'Novo torneio' },
    tournament_deleted:         { icon: '🗑️', title: 'Torneio cancelado' },
    tournament_update:          { icon: '📢', title: 'Torneio atualizado' },
    tournament_finished:        { icon: '🏆', title: 'Torneio encerrado' },
    tournament_invite:          { icon: '🏆', title: 'Convite para torneio' },
    tournament_reminder:        { icon: '⏰', title: 'Lembrete de torneio' },
    tournament_nearby:          { icon: '📍', title: 'Torneio perto de você' },
    draw:                       { icon: '🎲', title: 'Chaveamento gerado' },
    new_round:                  { icon: '🔄', title: 'Nova rodada' },
    result:                     { icon: '🏅', title: 'Resultado registrado' },
    org_communication:          { icon: '📣', title: 'Comunicado do organizador' },
    participant_removed:        { icon: '🚫', title: 'Remoção de torneio' },
    cohost_invite:              { icon: '⭐', title: 'Convite de co-organização' },
    host_transfer_invite:       { icon: '⭐', title: 'Convite para assumir organização' },
    cohost_invite_sent:         { icon: '📨', title: 'Convite enviado' },
    host_transfer_sent:         { icon: '📨', title: 'Convite enviado' },
    host_invite_accepted:       { icon: '✅', title: 'Convite aceito' },
    host_invite_rejected:       { icon: '❌', title: 'Convite recusado' },
    cohost_removed:             { icon: '🚫', title: 'Co-organização removida' },
    friend_request:             { icon: '👋', title: 'Pedido de amizade' },
    friend_accepted:            { icon: '🤝', title: 'Amizade aceita' },
    poll:                       { icon: '🗳️', title: 'Nova enquete' },
    category_assignment:        { icon: '🏷️', title: 'Categoria atribuída' },
    reminder:                   { icon: '⏰', title: 'Lembrete' },
    info:                       { icon: '🔔', title: 'Notificação' }
  };

  function _heading(type) {
    return _TYPE_HEADINGS[type] || { icon: '🔔', title: 'Notificação' };
  }

  // v2.8.37 (canonização B-1): delega ao window._safeHtml (store.js); fallback
  // local preservado caso _safeHtml não esteja disponível.
  function _escape(s) {
    if (s == null) return '';
    if (typeof window._safeHtml === 'function') return window._safeHtml(s);
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Convert a plain-text message to safe HTML preserving newlines.
  function _messageToHtml(msg) {
    return _escape(msg).replace(/\n/g, '<br>');
  }

  function _header(heading) {
    return '<tr><td style="padding:24px 32px;text-align:center;background:' + BRAND_COLOR + ';">' +
      '<div style="font-size:2rem;line-height:1;margin-bottom:6px;">' + heading.icon + '</div>' +
      '<h1 style="margin:0;font-size:1.15rem;font-weight:700;color:#fff;letter-spacing:0.2px;">' + _escape(heading.title) + '</h1>' +
      '<p style="margin:6px 0 0;font-size:0.78rem;color:rgba(255,255,255,0.85);">scoreplace.app</p>' +
    '</td></tr>';
  }

  function _footer() {
    return '<tr><td style="padding:20px 32px;text-align:center;border-top:1px solid #374151;">' +
      '<p style="margin:0 0 8px;font-size:0.75rem;color:' + MUTED_COLOR + ';">scoreplace.app — Jogue em outro nível</p>' +
      '<p style="margin:0;font-size:0.72rem;color:' + MUTED_COLOR + ';">Para desativar e-mails, abra o app, toque no seu perfil e desligue "E-mail" em Canais de notificação.</p>' +
    '</td></tr>';
  }

  function _ctaButton(text, url) {
    // v2.0.9: mesmo aspecto 3D dos botões do app, em versão email-safe — o
    // "almofadado" (inset) não funciona em email, então o volume vem do
    // gradiente (claro→escuro) + borda inferior mais escura (a "base"). Fallback
    // sólido pra clientes sem gradiente (Outlook).
    return '<table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 8px;"><tr>' +
      '<td style="background:' + BRAND_COLOR + ';background:linear-gradient(180deg,#5b9af8 0%,#3b82f6 55%,#2563eb 100%);border-bottom:4px solid #1e40af;border-radius:12px;padding:14px 32px;box-shadow:0 4px 12px rgba(37,99,235,0.35);">' +
      '<a href="' + _escape(url) + '" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:800;font-size:1rem;letter-spacing:0.2px;text-shadow:0 1px 1px rgba(0,0,0,0.25);">' + _escape(text) + '</a>' +
    '</td></tr></table>';
  }

  function _body(type, data) {
    var bodyText = data.message ? _messageToHtml(data.message) : '';
    var tournamentLine = '';
    if (data.tournamentName) {
      tournamentLine = '<p style="margin:0 0 14px;font-size:0.82rem;color:' + MUTED_COLOR + ';letter-spacing:0.3px;text-transform:uppercase;font-weight:600;">' +
        '🏆 ' + _escape(data.tournamentName) + '</p>';
    }

    // Type-specific enrichments appended after the main message.
    var extra = '';
    if (type === 'result') {
      if (data.player1 || data.player2 || data.score1 != null || data.score2 != null) {
        var scoreLine = _escape(data.player1 || '?') + ' <b>' + _escape(String(data.score1 != null ? data.score1 : 0)) +
          '</b> × <b>' + _escape(String(data.score2 != null ? data.score2 : 0)) + '</b> ' + _escape(data.player2 || '?');
        extra += '<div style="margin-top:14px;padding:14px 16px;background:rgba(59,130,246,0.1);border-left:3px solid ' + BRAND_COLOR + ';border-radius:6px;font-size:1rem;font-weight:500;">' + scoreLine + '</div>';
      }
      if (data.winner) {
        extra += '<p style="margin:12px 0 0;font-size:0.92rem;">🏅 Vencedor: <b>' + _escape(data.winner) + '</b></p>';
      }
    } else if (type === 'tournament_update' && data.changes) {
      extra += '<div style="margin-top:14px;padding:14px 16px;background:rgba(245,158,11,0.1);border-left:3px solid #f59e0b;border-radius:6px;font-size:0.9rem;">' +
        '<b>Alterações:</b><br>' + _messageToHtml(data.changes) + '</div>';
    } else if (type === 'tournament_finished' && data.champion) {
      extra += '<p style="margin:16px 0 0;font-size:1rem;">🏆 <b>' + _escape(data.champion) + '</b> é o campeão!</p>';
    } else if (type === 'draw' || type === 'new_round') {
      // Rich draw block: os jogos DO JOGADOR (time numa linha, adversário na
      // outra) + prazo p/ lançar resultados (próximo sorteio) + lista completa.
      var _drawLines = Array.isArray(data.matchLines) ? data.matchLines : [];
      var _pName = data.playerName || '';
      // v2.3.83: prefere playerMatches[] (todos os jogos do jogador). Fallback
      // pro playerMatch único (compat com payloads antigos).
      var _pMatches = Array.isArray(data.playerMatches) ? data.playerMatches : [];
      if (_pMatches.length === 0 && data.playerMatch) {
        _pMatches = [{ label: 'Seu Jogo ' + (data.playerMatchNum || ''), p1: data.playerMatch.p1, p2: data.playerMatch.p2 }];
      }

      // Meta: local + PRAZO (data e hora até o próximo sorteio). Fallback p/
      // startDate (formatos sem próximo sorteio) só como data.
      var _metaParts = [];
      if (data.venue) _metaParts.push('📍 ' + _escape(data.venue));
      if (data.deadline) {
        _metaParts.push('⏰ Resultados até ' + _escape(data.deadline));
      } else if (data.startDate) {
        try {
          var _sd = new Date(data.startDate);
          if (!isNaN(_sd)) _metaParts.push('📅 ' + _sd.toLocaleDateString('pt-BR'));
        } catch(e) {}
      }
      if (_metaParts.length) {
        extra += '<p style="margin:0 0 14px;font-size:0.88rem;color:' + MUTED_COLOR + ';">' + _metaParts.join(' &nbsp;·&nbsp; ') + '</p>';
      }

      // Bloco dos jogos do jogador — cada jogo: rótulo + TIME (linha) / vs / ADVERSÁRIO (linha)
      if (_pMatches.length) {
        var _epn = _pName ? _escape(_pName) : '';
        var _hl = function(side) {
          var s = _escape(side || '');
          if (_epn) s = s.split(_epn).join('<b>' + _epn + ' (você)</b>');
          return s;
        };
        var _gamesHtml = _pMatches.map(function(pm) {
          return '<div style="margin-bottom:10px;padding:13px 16px;background:rgba(59,130,246,0.15);border-left:3px solid ' + BRAND_COLOR + ';border-radius:6px;">' +
            '<p style="margin:0 0 6px;font-size:0.74rem;color:' + MUTED_COLOR + ';text-transform:uppercase;font-weight:700;letter-spacing:0.4px;">' + _escape(pm.label || 'Seu jogo') + '</p>' +
            '<p style="margin:0;font-size:1.02rem;font-weight:600;color:#f3f4f6;">' + _hl(pm.p1) + '</p>' +
            '<p style="margin:3px 0;font-size:0.78rem;color:' + MUTED_COLOR + ';font-weight:400;">vs</p>' +
            '<p style="margin:0;font-size:1.02rem;font-weight:600;color:#f3f4f6;">' + _hl(pm.p2) + '</p>' +
          '</div>';
        }).join('');
        extra += '<p style="margin:0 0 8px;font-size:0.78rem;color:' + MUTED_COLOR + ';text-transform:uppercase;font-weight:700;letter-spacing:0.4px;">' +
          (_pMatches.length > 1 ? 'Seus jogos nesta rodada' : 'Seu jogo') + '</p>' + _gamesHtml;
      }

      // All matches in round
      if (_drawLines.length > 0) {
        var _myNums = {};
        _pMatches.forEach(function(pm) { if (pm && pm.num) _myNums[pm.num] = true; });
        if (data.playerMatchNum) _myNums[data.playerMatchNum] = true;
        var _allRows = _drawLines.reduce(function(acc, line, i) {
          var isMe = !!_myNums[i + 1];
          var rowStyle = isMe
            ? 'padding:8px 10px;border-radius:5px;margin-bottom:3px;background:rgba(59,130,246,0.08);font-weight:600;font-size:0.88rem;color:#f3f4f6;'
            : 'padding:8px 10px;border-radius:5px;margin-bottom:3px;font-size:0.88rem;color:#d1d5db;';
          return acc + '<div style="' + rowStyle + '">' + _escape(line) + '</div>';
        }, '');
        extra += '<div style="margin-top:6px;">' +
          '<p style="margin:0 0 6px;font-size:0.78rem;color:' + MUTED_COLOR + ';text-transform:uppercase;font-weight:700;letter-spacing:0.4px;">Todos os Jogos da Rodada</p>' +
          _allRows +
        '</div>';
      }
    }

    var ctaText = data.ctaText || (data.tournamentUrl ? 'Ver no scoreplace.app' : '');
    var ctaUrl = data.tournamentUrl || data.ctaUrl || '';

    return '<tr><td style="padding:28px 32px;color:' + TEXT_COLOR + ';">' +
      tournamentLine +
      (bodyText ? '<p style="margin:0;font-size:1rem;line-height:1.55;color:#f3f4f6;">' + bodyText + '</p>' : '') +
      extra +
      (ctaText && ctaUrl ? _ctaButton(ctaText, ctaUrl) : '') +
    '</td></tr>';
  }

  function _wrap(type, data) {
    var heading = _heading(type);
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="margin:0;padding:0;background:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
      '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:20px auto;background:' + BG_COLOR + ';border-radius:12px;overflow:hidden;border:1px solid #1f2937;">' +
      _header(heading) + _body(type, data) + _footer() +
      '</table></body></html>';
  }

  /**
   * Build a full HTML email for a notification. The body is the actual
   * notification message (data.message). Type drives the heading and any
   * type-specific enrichment (scores, changes list, champion, etc.).
   *
   * @param {string} type - notification type (matches NOTIF_CATALOG keys)
   * @param {Object} data - { message, tournamentName, tournamentUrl,
   *                          ctaText, ctaUrl,
   *                          // type-specific:
   *                          player1, player2, score1, score2, winner,
   *                          changes, champion, playerName, friendName,
   *                          days }
   * @returns {string} Complete HTML email string
   */
  window._emailTemplate = function(type, data) {
    data = data || {};
    // Back-compat: older callers passed `tournamentName` + no `message`.
    // Synthesize a reasonable fallback message so the body is never empty.
    if (!data.message) {
      var name = data.tournamentName || 'seu torneio';
      switch (type) {
        case 'enrollment':
        case 'enrollment_new':
        case 'enrollment_confirm':
          data.message = (data.playerName || 'Você') + ' foi inscrito(a) no torneio ' + name + '.';
          break;
        case 'reminder':
        case 'tournament_reminder':
          data.message = 'Seu torneio ' + name + ' começa em ' + (data.days || '?') + ' dias.';
          break;
        case 'tournament_update':
          data.message = 'O torneio ' + name + ' foi atualizado.';
          break;
        case 'tournament_deleted':
          data.message = 'O torneio ' + name + ' foi cancelado pelo organizador.';
          break;
        case 'draw':
          data.message = 'O chaveamento do torneio ' + name + ' foi gerado.';
          break;
        case 'tournament_finished':
          data.message = 'O torneio ' + name + ' foi encerrado.';
          break;
        case 'enrollments_closed':
          data.message = 'As inscrições do torneio ' + name + ' foram encerradas.';
          break;
        case 'new_round':
          data.message = 'Uma nova rodada foi gerada no torneio ' + name + '.';
          break;
        case 'participant_removed':
          data.message = 'Você foi removido(a) do torneio ' + name + '.';
          break;
        case 'tournament_created':
          data.message = (data.friendName || 'Um amigo') + ' criou o torneio ' + name + '.';
          break;
        default:
          data.message = 'Você tem uma nova notificação em ' + name + '.';
      }
    }
    // v2.3.92: cobrança de perfil → botão do e-mail abre o PERFIL (não o torneio).
    if (type === 'category-data-request') {
      data.ctaText = 'Abrir meu perfil';
      data.tournamentUrl = 'https://scoreplace.app/#profile';
    }
    return _wrap(type, data);
  };
})();
