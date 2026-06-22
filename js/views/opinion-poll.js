// opinion-poll.js — Enquete do organizador (v2.8.67)
// Ferramenta GENÉRICA de enquete (pergunta + opções) que os inscritos votam.
// Separada do "poll de resolução" (t.polls[] em tournaments-draw-prep.js, que resolve
// times incompletos/potência de 2). Aqui os dados ficam em t.opinionPolls[].
//
// Modelo: t.opinionPolls = [{ id, question, options:[{id,text}], multiSelect,
//   hideResultsUntilVote, votes:{ [uid]:[optId,...] }, createdAt, createdByUid, closed }]
// Ativa = última não-encerrada. Uma de cada vez.
//
// UI: botão "📊 Enquete" nas ferramentas do organizador; pop-up pro inscrito que ainda
// não votou (ao abrir o detalhe); botão brilhante abaixo do nome do torneio (dashboard +
// detalhe) enquanto não encerrada.
(function () {
  function _esc(s) { return (window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s)); }
  function _attr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function _cu() { return window.AppStore && window.AppStore.currentUser; }
  function _findT(tId) {
    if (typeof window._findTournamentById === 'function') return window._findTournamentById(tId);
    return window.AppStore && (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); });
  }
  function _save(t) { try { if (window.FirestoreDB && window.FirestoreDB.saveTournament) window.FirestoreDB.saveTournament(t); } catch (e) {} }
  function _isOrg(t) { return !!(window.AppStore && ((window.AppStore.isOrganizer && window.AppStore.isOrganizer(t)) || (window.AppStore.isCreator && window.AppStore.isCreator(t)))); }

  window._opActivePoll = function (t) {
    if (!t || !Array.isArray(t.opinionPolls)) return null;
    for (var i = t.opinionPolls.length - 1; i >= 0; i--) { if (t.opinionPolls[i] && !t.opinionPolls[i].closed) return t.opinionPolls[i]; }
    return null;
  };
  function _findPoll(t, pollId) {
    if (!t || !Array.isArray(t.opinionPolls)) return null;
    if (!pollId) return window._opActivePoll(t);
    return t.opinionPolls.find(function (p) { return p && p.id === pollId; }) || null;
  }
  function _hasVoted(poll, uid) { return !!(poll && poll.votes && uid && Array.isArray(poll.votes[uid]) && poll.votes[uid].length > 0); }
  function _optCount(poll, optId) {
    var n = 0; if (poll && poll.votes) Object.keys(poll.votes).forEach(function (u) { if ((poll.votes[u] || []).indexOf(optId) !== -1) n++; });
    return n;
  }
  function _totalVoters(poll) { return (poll && poll.votes) ? Object.keys(poll.votes).filter(function (u) { return (poll.votes[u] || []).length > 0; }).length : 0; }
  function _canVote(t) {
    var cu = _cu(); if (!cu || !cu.uid) return false;
    if (_isOrg(t)) return true;
    var mu = Array.isArray(t.memberUids) ? t.memberUids : [];
    if (mu.indexOf(cu.uid) !== -1) return true;
    var parts = Array.isArray(t.participants) ? t.participants : [];
    return parts.some(function (p) {
      if (!p || typeof p !== 'object') return false;
      var us = (typeof window._participantUids === 'function') ? window._participantUids(p) : [p.uid];
      return us && us.indexOf(cu.uid) !== -1;
    });
  }

  // ─── Botão brilhante abaixo do nome do torneio (dashboard + detalhe) ───────────
  window._opButtonHtml = function (t) {
    var poll = window._opActivePoll(t);
    if (!poll) return '';
    var cu = _cu();
    var voted = cu && _hasVoted(poll, cu.uid);
    var label = voted ? '📊 Ver enquete' : '📊 Responder enquete';
    var q = poll.question ? (' · ' + _esc(poll.question.length > 38 ? poll.question.slice(0, 38) + '…' : poll.question)) : '';
    return '<button class="btn btn-shine hover-lift" onclick="event.stopPropagation(); window._opOpenVote(\'' + _attr(t.id) + '\')" ' +
      'style="margin:8px 0 4px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:900;font-size:0.98rem;border:none;border-radius:12px;padding:14px 18px;box-shadow:0 0 16px rgba(139,92,246,0.6);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
      label + '<span style="font-weight:600;opacity:0.85;">' + q + '</span></button>';
  };

  // ─── Overlay helper ────────────────────────────────────────────────────────────
  function _overlay(id, innerHtml) {
    var ex = document.getElementById(id); if (ex) ex.remove();
    var o = document.createElement('div');
    o.id = id;
    o.style.cssText = 'position:fixed;inset:0;z-index:100040;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';
    o.innerHTML = '<div style="background:var(--bg-card,#0f172a);width:96%;max-width:440px;max-height:88vh;overflow:auto;border-radius:16px;border:1px solid rgba(99,102,241,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);">' + innerHtml + '</div>';
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }
  function _close(id) { var o = document.getElementById(id); if (o) o.remove(); }
  window._opCloseOverlay = function () { _close('op-create-overlay'); _close('op-vote-overlay'); };

  // ─── Criar enquete (organizador) ────────────────────────────────────────────────
  window._opOpenManage = function (tId) {
    var t = _findT(tId); if (!t) return;
    if (window._opActivePoll(t)) { window._opOpenVote(tId); return; } // já existe → ver/gerenciar
    window._opOpenCreate(tId);
  };

  function _optionRow(text, focus) {
    return '<div class="op-opt-row" style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
      '<input type="text" class="op-opt-input" value="' + _esc(text || '') + '" placeholder="Texto da opção" maxlength="80" ' +
      'style="flex:1;min-width:0;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:9px 11px;color:var(--text-bright,#f1f5f9);font-size:0.9rem;box-sizing:border-box;"' + (focus ? ' autofocus' : '') + '>' +
      '<button type="button" onclick="this.closest(\'.op-opt-row\').remove()" title="Remover opção" style="background:none;border:none;color:#ef4444;font-weight:900;font-size:0.9rem;cursor:pointer;flex-shrink:0;padding:4px;">✕</button>' +
    '</div>';
  }
  window._opAddOption = function () {
    var box = document.getElementById('op-options-box'); if (!box) return;
    box.insertAdjacentHTML('beforeend', _optionRow('', false));
    var ins = box.querySelectorAll('.op-opt-input'); if (ins.length) ins[ins.length - 1].focus();
  };

  window._opOpenCreate = function (tId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    // v2.8.69: usa o toggle-switch padrão do app (não checkbox). O <input> mantém o id
    // pra _opCreate ler .checked.
    var _tg = function (id, on, label, desc) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color,rgba(255,255,255,0.1));border-radius:12px;margin-bottom:8px;">' +
        '<div style="min-width:0;"><div style="font-weight:700;color:var(--text-bright);font-size:0.86rem;">' + label + '</div><div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">' + desc + '</div></div>' +
        '<label class="toggle-switch" style="--toggle-on-bg:#8b5cf6;--toggle-on-glow:rgba(139,92,246,0.3);--toggle-on-border:#8b5cf6;flex-shrink:0;"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
      '</div>';
    };
    var html =
      '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#4338ca,#6d28d9);border-radius:16px 16px 0 0;">' +
        '<button type="button" onclick="window._opCloseOverlay()" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);">Cancelar</button>' +
        '<span style="font-weight:800;color:#fff;font-size:0.95rem;">📊 Nova enquete</span>' +
        '<button type="button" onclick="window._opCreate(\'' + _attr(t.id) + '\')" class="btn btn-sm" style="background:#fff;color:#4338ca;font-weight:800;border:none;">Criar</button>' +
      '</div>' +
      '<div style="padding:1rem 1.1rem;">' +
        '<label style="display:block;font-size:0.78rem;color:var(--text-muted);font-weight:600;margin-bottom:6px;">PERGUNTA</label>' +
        '<input type="text" id="op-question" placeholder="Ex.: Qual horário prefere pra final?" maxlength="140" style="width:100%;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:11px 12px;color:var(--text-bright,#f1f5f9);font-size:0.95rem;box-sizing:border-box;margin-bottom:14px;">' +
        '<label style="display:block;font-size:0.78rem;color:var(--text-muted);font-weight:600;margin-bottom:6px;">OPÇÕES</label>' +
        '<div id="op-options-box">' + _optionRow('', true) + _optionRow('', false) + '</div>' +
        '<button type="button" onclick="window._opAddOption()" style="width:100%;background:rgba(99,102,241,0.12);border:1px dashed rgba(99,102,241,0.45);color:#a5b4fc;font-weight:700;border-radius:10px;padding:9px;font-size:0.85rem;cursor:pointer;margin-bottom:16px;">＋ opção</button>' +
        _tg('op-hide', true, 'Ocultar resultados até votar', 'O inscrito só vê os votos depois de votar (não influencia).') +
        _tg('op-multi', false, 'Permitir mais de uma opção', 'Quando ligado, dá pra marcar várias; senão, escolha única.') +
      '</div>';
    _overlay('op-create-overlay', html);
    var q = document.getElementById('op-question'); if (q) q.focus();
  };

  window._opCreate = function (tId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var qEl = document.getElementById('op-question');
    var question = qEl ? qEl.value.trim() : '';
    var opts = [];
    document.querySelectorAll('#op-options-box .op-opt-input').forEach(function (inp) {
      var v = (inp.value || '').trim(); if (v) opts.push({ id: 'o' + (opts.length + 1) + '_' + Math.floor(Math.random() * 1e6), text: v });
    });
    if (!question) { if (typeof showNotification === 'function') showNotification('Falta a pergunta', 'Escreva a pergunta da enquete.', 'warning'); return; }
    if (opts.length < 2) { if (typeof showNotification === 'function') showNotification('Poucas opções', 'Adicione pelo menos 2 opções.', 'warning'); return; }
    var cu = _cu();
    var poll = {
      id: 'op_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
      question: question, options: opts,
      multiSelect: !!(document.getElementById('op-multi') && document.getElementById('op-multi').checked),
      hideResultsUntilVote: !!(document.getElementById('op-hide') && document.getElementById('op-hide').checked),
      votes: {}, createdAt: new Date().toISOString(), createdByUid: (cu && cu.uid) || '', closed: false
    };
    if (!Array.isArray(t.opinionPolls)) t.opinionPolls = [];
    t.opinionPolls.push(poll);
    _save(t);
    window._opCloseOverlay();
    if (typeof showNotification === 'function') showNotification('📊 Enquete criada', 'Os inscritos já podem votar.', 'success');
    // notifica os inscritos
    try {
      if (typeof window._notifyTournamentParticipants === 'function') {
        window._notifyTournamentParticipants(t, {
          type: 'tournament_update', tournamentId: String(t.id), tournamentName: t.name,
          message: 'Nova enquete em "' + t.name + '": ' + question, level: 'important'
        }, (cu && cu.email) || '');
      }
    } catch (e) {}
    if (typeof window._softRefreshView === 'function') window._softRefreshView();
  };

  // ─── Votar / ver resultados ──────────────────────────────────────────────────
  window._opOpenVote = function (tId, pollId) {
    var t = _findT(tId); if (!t) return;
    var poll = _findPoll(t, pollId); if (!poll) return;
    _renderVote(t, poll);
  };

  function _renderVote(t, poll) {
    var cu = _cu();
    var uid = cu && cu.uid;
    var voted = _hasVoted(poll, uid);
    var isOrg = _isOrg(t);
    var canVote = _canVote(t) && !poll.closed;
    var showResults = poll.closed || voted || !poll.hideResultsUntilVote;
    var total = _totalVoters(poll);
    var myChoices = (uid && poll.votes && poll.votes[uid]) || [];

    var body = '';
    poll.options.forEach(function (o) {
      var c = _optCount(poll, o.id);
      var pct = total > 0 ? Math.round((c / total) * 100) : 0;
      var mine = myChoices.indexOf(o.id) !== -1;
      if (showResults && (voted || poll.closed || !canVote)) {
        // modo resultado (barra)
        body += '<div style="margin-bottom:10px;">' +
          '<div style="display:flex;justify-content:space-between;font-size:0.86rem;margin-bottom:3px;color:var(--text-bright);">' +
            '<span style="font-weight:' + (mine ? '800' : '600') + ';">' + (mine ? '✓ ' : '') + _esc(o.text) + '</span>' +
            '<span style="color:var(--text-muted);font-weight:700;">' + c + ' · ' + pct + '%</span>' +
          '</div>' +
          '<div style="height:9px;background:rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + (mine ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)') + ';border-radius:6px;transition:width 0.3s;"></div>' +
          '</div></div>';
      } else {
        // modo votação (botão/checkbox)
        var inputType = poll.multiSelect ? 'checkbox' : 'radio';
        body += '<label style="display:flex;align-items:center;gap:10px;padding:11px 13px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.3);border-radius:11px;cursor:pointer;margin-bottom:8px;">' +
          '<input type="' + inputType + '" name="op-choice" value="' + _esc(o.id) + '" style="width:18px;height:18px;accent-color:#8b5cf6;flex-shrink:0;">' +
          '<span style="font-size:0.92rem;color:var(--text-bright);font-weight:600;">' + _esc(o.text) + (showResults ? ' <span style="color:var(--text-muted);font-weight:500;">(' + c + ')</span>' : '') + '</span>' +
        '</label>';
      }
    });

    var footer = '';
    if (canVote && !voted) {
      footer += '<button type="button" onclick="window._opVote(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn btn-shine" style="width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:800;border:none;border-radius:11px;padding:12px;font-size:0.95rem;margin-top:6px;">✅ Votar</button>';
    } else if (voted && !poll.closed) {
      footer += '<div style="text-align:center;font-size:0.8rem;color:#34d399;font-weight:700;margin-top:4px;">✓ Você votou · ' + total + ' voto(s) no total</div>';
    } else if (poll.closed) {
      footer += '<div style="text-align:center;font-size:0.8rem;color:var(--text-muted);font-weight:700;margin-top:4px;">🔒 Enquete encerrada · ' + total + ' voto(s)</div>';
    }
    if (isOrg && !poll.closed) {
      footer += '<button type="button" onclick="window._opClose(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn" style="width:100%;background:rgba(239,68,68,0.14);color:#f87171;border:1px solid rgba(239,68,68,0.4);font-weight:700;border-radius:11px;padding:10px;font-size:0.85rem;margin-top:8px;">🔒 Encerrar enquete</button>';
    }

    var html =
      '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#4338ca,#6d28d9);border-radius:16px 16px 0 0;">' +
        '<span style="font-weight:800;color:#fff;font-size:0.92rem;">📊 Enquete</span>' +
        '<button type="button" onclick="window._opCloseOverlay()" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);">Fechar</button>' +
      '</div>' +
      '<div style="padding:1rem 1.1rem;">' +
        '<div style="font-weight:800;font-size:1.05rem;color:var(--text-bright);margin-bottom:4px;">' + _esc(poll.question) + '</div>' +
        '<div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:14px;">' + (poll.multiSelect ? 'Pode escolher mais de uma' : 'Escolha uma opção') + (poll.hideResultsUntilVote && !voted && !poll.closed ? ' · resultados após votar' : '') + '</div>' +
        body + footer +
      '</div>';
    _overlay('op-vote-overlay', html);
  }

  window._opVote = function (tId, pollId) {
    var t = _findT(tId); if (!t) return;
    var poll = _findPoll(t, pollId); if (!poll || poll.closed) return;
    var cu = _cu(); if (!cu || !cu.uid) { if (typeof showNotification === 'function') showNotification('Entre pra votar', 'Faça login pra votar na enquete.', 'warning'); return; }
    if (!_canVote(t)) { if (typeof showNotification === 'function') showNotification('Só inscritos votam', 'Inscreva-se no torneio pra votar.', 'warning'); return; }
    var checked = [];
    document.querySelectorAll('#op-vote-overlay input[name="op-choice"]:checked').forEach(function (i) { checked.push(i.value); });
    if (!checked.length) { if (typeof showNotification === 'function') showNotification('Escolha uma opção', '', 'warning'); return; }
    if (!poll.multiSelect) checked = [checked[0]];
    if (!poll.votes) poll.votes = {};
    poll.votes[cu.uid] = checked;
    _save(t);
    _renderVote(t, poll); // re-render no modo resultado
    if (typeof window._softRefreshView === 'function') window._softRefreshView();
  };

  window._opClose = function (tId, pollId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var poll = _findPoll(t, pollId); if (!poll) return;
    var go = function () {
      poll.closed = true; poll.closedAt = new Date().toISOString();
      _save(t); window._opCloseOverlay();
      if (typeof showNotification === 'function') showNotification('🔒 Enquete encerrada', '', 'success');
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
    };
    if (typeof window.showConfirmDialog === 'function') window.showConfirmDialog('Encerrar enquete?', 'Os inscritos não poderão mais votar. Os resultados continuam visíveis.', go, null, { confirmText: 'Encerrar', cancelText: 'Cancelar' });
    else go();
  };

  // ─── Pop-up automático pro inscrito que ainda não votou ─────────────────────────
  window._opMaybePopup = function (t) {
    try {
      if (!t) return;
      var poll = window._opActivePoll(t); if (!poll) return;
      var cu = _cu(); if (!cu || !cu.uid) return;
      if (!_canVote(t)) return;
      if (_hasVoted(poll, cu.uid)) return;
      var key = 'sp_opPopup_' + poll.id;
      if (sessionStorage.getItem(key)) return; // 1x por sessão (o botão fica pra reabrir)
      sessionStorage.setItem(key, '1');
      setTimeout(function () {
        var t2 = _findT(t.id); var p2 = t2 && window._opActivePoll(t2);
        if (p2 && p2.id === poll.id && !_hasVoted(p2, cu.uid)) window._opOpenVote(t.id, poll.id);
      }, 700);
    } catch (e) {}
  };
})();
