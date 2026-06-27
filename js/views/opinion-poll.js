// opinion-poll.js — Enquete do organizador (v3.1.44 — multi-seção + canonização)
// Ferramenta GENÉRICA de enquete (pergunta + opções) que os inscritos votam.
// Separada do "poll de resolução" (t.polls[] em tournaments-draw-prep.js, que resolve
// times incompletos/potência de 2). Aqui os dados ficam em t.opinionPolls[].
//
// ── MODELO CANÔNICO (v3.1.44) ────────────────────────────────────────────────────
// t.opinionPolls = [{ id, sections:[{ id, question, options:[{id,text}], multiSelect }],
//   hideResultsUntilVote, votes:{ [uid]: { [sectionId]:[optId,...] } },
//   createdAt, createdByUid, closed, closedAt, notifiedAt }]
//
// BACKWARD-COMPAT (legado, pergunta única): poll SEM `sections`, com
//   { question, options:[...], multiSelect, votes:{ [uid]:[optId,...] } }.
//   Lido via _opSections (sintetiza 1 seção `_s0`) e _opGetVote (array = seção _s0).
//   NUNCA acessar poll.options/poll.question/poll.votes[uid] cru fora dos acessores.
//
// UI: botão "📊 Enquete" nas ferramentas do organizador; pop-up pro inscrito que ainda
// não votou (a cada visita ao detalhe); botão brilhante abaixo do nome do torneio
// (dashboard + detalhe) enquanto não encerrada; org tem Editar enquete + Ver votos.
(function () {
  function _esc(s) { return (window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s)); }
  function _attr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function _cu() { return window.AppStore && window.AppStore.currentUser; }
  function _findT(tId) {
    if (typeof window._findTournamentById === 'function') return window._findTournamentById(tId);
    return window.AppStore && (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); });
  }
  // Retorna a Promise do save pra quem precisa saber se REALMENTE persistiu
  // (ex.: voto). NUNCA mais engolir a rejeição em silêncio — um catch vazio aqui
  // foi a causa do voto da Confra "salvar" na tela e sumir no servidor.
  function _save(t) {
    try {
      if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        return Promise.resolve(window.FirestoreDB.saveTournament(t));
      }
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('FirestoreDB indisponível'));
  }
  function _isOrg(t) { return !!(window.AppStore && ((window.AppStore.isOrganizer && window.AppStore.isOrganizer(t)) || (window.AppStore.isCreator && window.AppStore.isCreator(t)))); }
  function _rand() { return Math.floor(Math.random() * 1e6); }

  // ─── PASSO 1: ACESSORES CANÔNICOS ───────────────────────────────────────────────
  // Toda leitura de pergunta/opção/voto passa por aqui. Legado e multi-seção viram a
  // mesma forma. ID da seção legada = '_s0'.
  window._opSections = function (poll) {
    if (!poll) return [];
    if (Array.isArray(poll.sections) && poll.sections.length) return poll.sections;
    return [{ id: '_s0', question: poll.question || '', options: Array.isArray(poll.options) ? poll.options : [], multiSelect: !!poll.multiSelect }];
  };
  // v3.1.68: voto de seção multiSelect agora é TRI-ESTADO por opção — ✅ quero (yes) /
  // ❌ não quero (no) / neutro. Modelo no banco:
  //   - multiSelect:  votes[uid][secId] = { yes:[optIds], no:[optIds] }
  //   - single/radio: votes[uid][secId] = [optId]   (array = só "yes", como sempre)
  //   - legado:       votes[uid] = [optId]  (seção única)  →  yes=array, no=[]
  // _opGetVote SEMPRE devolve o array de YES (compat com toda a lógica de contagem);
  // _opGetVoteNo devolve o array de NO.
  function _opGetVote(poll, uid, sectionId) {
    if (!poll || !poll.votes || !uid) return [];
    var v = poll.votes[uid];
    if (v == null) return [];
    if (Array.isArray(v)) {
      // legado: array só faz sentido pra seção única (_s0 ou a 1ª seção sintetizada)
      var secs = window._opSections(poll);
      var only = secs.length === 1 ? secs[0].id : null;
      return (sectionId === '_s0' || (only && sectionId === only)) ? v.slice() : [];
    }
    var sv = v[sectionId];
    if (Array.isArray(sv)) return sv.slice();
    if (sv && typeof sv === 'object' && Array.isArray(sv.yes)) return sv.yes.slice();
    return [];
  }
  window._opGetVote = _opGetVote;
  function _opGetVoteNo(poll, uid, sectionId) {
    if (!poll || !poll.votes || !uid) return [];
    var v = poll.votes[uid];
    if (v == null || Array.isArray(v)) return []; // legado/array = só yes
    var sv = v[sectionId];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && Array.isArray(sv.no)) return sv.no.slice();
    return [];
  }
  window._opGetVoteNo = _opGetVoteNo;
  function _opEnsureUserMap(poll, uid) {
    if (!poll.votes) poll.votes = {};
    var v = poll.votes[uid];
    if (Array.isArray(v)) {
      var secs = window._opSections(poll);
      var legacyId = secs.length ? secs[0].id : '_s0';
      var migrated = {}; migrated[legacyId] = v.slice();
      v = poll.votes[uid] = migrated;
    } else if (v == null || typeof v !== 'object') {
      v = poll.votes[uid] = {};
    }
    return v;
  }
  // Grava o voto de uma seção (single/radio) — array de optIds.
  function _opSetVote(poll, uid, sectionId, optIds) {
    var v = _opEnsureUserMap(poll, uid);
    if (optIds && optIds.length) v[sectionId] = optIds.slice();
    else delete v[sectionId];
  }
  // Grava o voto de uma seção multiSelect — yes/no por opção.
  function _opSetVoteMulti(poll, uid, sectionId, yesArr, noArr) {
    var v = _opEnsureUserMap(poll, uid);
    var y = (yesArr || []).slice(), n = (noArr || []).slice();
    if (y.length || n.length) v[sectionId] = { yes: y, no: n };
    else delete v[sectionId];
  }
  function _opHasVotedSection(poll, sectionId, uid) {
    return _opGetVote(poll, uid, sectionId).length > 0 || _opGetVoteNo(poll, uid, sectionId).length > 0;
  }
  function _opHasVotedAny(poll, uid) {
    if (!poll || !uid) return false;
    return window._opSections(poll).some(function (s) { return _opHasVotedSection(poll, s.id, uid); });
  }
  window._opHasVotedAny = _opHasVotedAny;
  function _opOptCount(poll, sectionId, optId) {
    var n = 0; if (poll && poll.votes) Object.keys(poll.votes).forEach(function (u) {
      if (_opGetVote(poll, u, sectionId).indexOf(optId) !== -1) n++;
    });
    return n;
  }
  function _opOptCountNo(poll, sectionId, optId) {
    var n = 0; if (poll && poll.votes) Object.keys(poll.votes).forEach(function (u) {
      if (_opGetVoteNo(poll, u, sectionId).indexOf(optId) !== -1) n++;
    });
    return n;
  }
  function _opSectionVoters(poll, sectionId) {
    if (!poll || !poll.votes) return 0;
    return Object.keys(poll.votes).filter(function (u) { return _opGetVote(poll, u, sectionId).length > 0 || _opGetVoteNo(poll, u, sectionId).length > 0; }).length;
  }
  // Mapa nome/foto por uid (inscritos + p1/p2 de duplas + organizador). Reusado por avatares E tela nominal.
  function _opVoterInfoMap(t) {
    var info = {};
    var parts = (t && Array.isArray(t.participants)) ? t.participants : [];
    parts.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      if (p.uid && !info[p.uid]) info[p.uid] = { name: p.displayName || p.name || '', photo: p.photoURL || '' };
      if (p.p1Uid && !info[p.p1Uid]) info[p.p1Uid] = { name: p.p1Name || '', photo: p.p1PhotoURL || '' };
      if (p.p2Uid && !info[p.p2Uid]) info[p.p2Uid] = { name: p.p2Name || '', photo: p.p2PhotoURL || '' };
    });
    if (t && t.creatorUid && !info[t.creatorUid]) info[t.creatorUid] = { name: t.organizerName || 'Organizador', photo: '' };
    return info;
  }
  window._opVoterName = function (t, uid) {
    var i = _opVoterInfoMap(t)[uid];
    return (i && i.name) || 'Inscrito';
  };

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
  // v2.8.99: fotos/ícones de quem JÁ respondeu (qualquer seção) — mostra participação, não o voto.
  function _voterAvatarsHtml(t, poll) {
    if (!poll || !poll.votes) return '';
    var uids = Object.keys(poll.votes).filter(function (u) { return _opHasVotedAny(poll, u); });
    if (!uids.length) return '';
    var info = _opVoterInfoMap(t);
    var av = uids.map(function (u) {
      var i = info[u] || { name: '', photo: '' };
      var nm = i.name || 'Inscrito';
      var lc = nm.toLowerCase();
      var cached = (window._playerPhotoCache && window._playerPhotoCache[lc] && window._playerPhotoCache[lc].indexOf('dicebear') === -1) ? window._playerPhotoCache[lc] : '';
      var src = cached || (typeof window._profileAvatarUrl === 'function' ? window._profileAvatarUrl(nm, i.photo, 32) : ('https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(nm) + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf'));
      return '<img src="' + _esc(src) + '" title="' + _esc(nm) + '" alt="' + _esc(nm) + '" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid var(--bg-card,#0f172a);margin-left:-7px;box-sizing:border-box;flex-shrink:0;">';
    }).join('');
    return '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-color);">' +
      '<div style="font-size:0.74rem;color:var(--text-muted);font-weight:600;margin-bottom:8px;">✅ Já responderam (' + uids.length + ')</div>' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;padding-left:7px;row-gap:8px;">' + av + '</div>' +
      '</div>';
  }
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

  // ─── PASSO 5: Botão brilhante abaixo do nome (alto e estreito, não-barra) ────────
  window._opButtonHtml = function (t) {
    var poll = window._opActivePoll(t);
    if (!poll) return '';
    var cu = _cu();
    var secs = window._opSections(poll);
    var votedAll = cu && cu.uid && secs.length && secs.every(function (s) { return _opHasVotedSection(poll, s.id, cu.uid); });
    var q0 = (secs[0] && secs[0].question) || '';
    var qmore = secs.length > 1 ? (' +' + (secs.length - 1)) : '';
    var qline = q0 ? (_esc(q0.length > 34 ? q0.slice(0, 34) + '…' : q0) + qmore) : '';
    // v3.1.48: LARANJA pra chamar atenção + VOLUME real (inset canônico do .btn —
    // sem isso o box-shadow inline só com glow externo deixava o botão chapado) +
    // mais largo + fonte maior/mais pesada. Pedido do dono.
    return '<div style="display:flex;justify-content:center;margin:12px 0 8px;">' +
      '<button class="btn btn-shine hover-lift" onclick="event.stopPropagation(); window._opOpenVote(\'' + _attr(t.id) + '\')" ' +
      'style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;width:100%;max-width:380px;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#fff;border:none;border-radius:16px;padding:18px 28px;box-shadow:inset 0 2px 0 rgba(255,255,255,0.45),inset 0 6px 9px rgba(255,255,255,0.30),inset 0 -11px 14px rgba(0,0,0,0.26),inset 0 -2px 0 rgba(0,0,0,0.22),0 8px 24px rgba(234,88,12,0.55);">' +
        '<span style="font-size:1.7rem;line-height:1;">📊</span>' +
        '<span style="font-weight:900;font-size:1.3rem;line-height:1.1;letter-spacing:0.2px;">' + (votedAll ? 'Ver enquete' : 'Responder enquete') + '</span>' +
        (qline ? '<span style="font-weight:700;font-size:0.88rem;opacity:0.9;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + qline + '</span>' : '') +
      '</button>' +
    '</div>';
  };

  // ─── Overlay helper ────────────────────────────────────────────────────────────
  function _overlay(id, innerHtml) {
    var ex = document.getElementById(id); if (ex) ex.remove();
    var o = document.createElement('div');
    o.id = id;
    o.style.cssText = 'position:fixed;inset:0;z-index:100040;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';
    o.innerHTML = '<div style="background:var(--bg-card,#0f172a);width:96%;max-width:460px;max-height:90vh;overflow:auto;border-radius:16px;border:1px solid rgba(99,102,241,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);">' + innerHtml + '</div>';
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }
  function _close(id) { var o = document.getElementById(id); if (o) o.remove(); }
  window._opCloseOverlay = function () { _close('op-create-overlay'); _close('op-vote-overlay'); _close('op-tally-overlay'); };

  // ─── PASSO 2 + 4: Editor (criar/editar) com seções empilháveis ──────────────────
  window._opOpenManage = function (tId) {
    var t = _findT(tId); if (!t) return;
    if (window._opActivePoll(t)) { window._opOpenVote(tId); return; } // já existe → ver/gerenciar
    window._opOpenEditor(tId);
  };

  function _optionRow(text, optId) {
    return '<div class="op-opt-row" style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
      // v3.1.53: carrega o id EXISTENTE da opção (data-opt-id) pra que o save PRESERVE
      // o id ao re-salvar — sem isso, editar a enquete regenerava todos os ids e os
      // votos viravam órfãos (apareciam zerados). Opção nova fica sem o attr → gera id.
      '<input type="text" class="op-opt-input"' + (optId ? ' data-opt-id="' + _esc(optId) + '"' : '') + ' value="' + _esc(text || '') + '" placeholder="Texto da opção" maxlength="80" ' +
      'style="flex:1;min-width:0;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:9px 11px;color:var(--text-bright,#f1f5f9);font-size:0.9rem;box-sizing:border-box;">' +
      '<button type="button" onclick="this.closest(\'.op-opt-row\').remove()" title="Remover opção" style="background:none;border:none;color:#ef4444;font-weight:900;font-size:0.9rem;cursor:pointer;flex-shrink:0;padding:4px;">✕</button>' +
    '</div>';
  }
  // Adiciona opção na seção do botão clicado.
  window._opAddOption = function (btn) {
    var sec = btn && btn.closest ? btn.closest('.op-section') : null;
    var box = sec ? sec.querySelector('.op-sec-opts') : document.querySelector('.op-sec-opts');
    if (!box) return;
    box.insertAdjacentHTML('beforeend', _optionRow(''));
    var ins = box.querySelectorAll('.op-opt-input'); if (ins.length) ins[ins.length - 1].focus();
  };

  function _sectionToggleHtml(on) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color,rgba(255,255,255,0.1));border-radius:10px;margin-top:10px;">' +
      '<div style="min-width:0;"><div style="font-weight:700;color:var(--text-bright);font-size:0.84rem;">Permitir mais de uma opção</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">Ligado: marca várias. Desligado: escolha única.</div></div>' +
      '<label class="toggle-switch" style="--toggle-on-bg:#8b5cf6;--toggle-on-glow:rgba(139,92,246,0.3);--toggle-on-border:#8b5cf6;flex-shrink:0;"><input type="checkbox" class="op-sec-multi"' + (on ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
    '</div>';
  }
  // Bloco de uma seção (pergunta + opções + toggle multi). sec opcional (edição).
  function _sectionBlock(sec) {
    var opts = (sec && Array.isArray(sec.options) && sec.options.length) ? sec.options : [{ text: '' }, { text: '' }];
    var optsHtml = opts.map(function (o) { return _optionRow(o.text || '', o.id || ''); }).join('');
    // v3.1.53: data-sec-id preserva o id da seção no re-save (votos sobrevivem).
    return '<div class="op-section"' + (sec && sec.id ? ' data-sec-id="' + _esc(sec.id) + '"' : '') + ' style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.22);border-radius:12px;padding:12px;margin-bottom:12px;">' +
      // v3.1.54: sem rótulo "SEÇÃO" — só o ✕ pra remover (à direita). A PERGUNTA fica
      // em LARANJA + negrito, a MESMA fonte da visualização (pedido do dono).
      '<div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:8px;">' +
        '<button type="button" onclick="window._opRemoveSection(this)" title="Remover pergunta" style="background:none;border:none;color:#ef4444;font-weight:900;font-size:0.95rem;cursor:pointer;padding:2px 4px;">✕</button>' +
      '</div>' +
      '<input type="text" class="op-sec-q" value="' + _esc((sec && sec.question) || '') + '" placeholder="Pergunta da seção" maxlength="140" style="width:100%;background:var(--bg-darker,#0b1220);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:10px 12px;color:#f59e0b;font-weight:800;font-size:0.97rem;box-sizing:border-box;margin-bottom:10px;">' +
      '<div class="op-sec-opts">' + optsHtml + '</div>' +
      '<button type="button" onclick="window._opAddOption(this)" style="width:100%;background:rgba(99,102,241,0.12);border:1px dashed rgba(99,102,241,0.45);color:#a5b4fc;font-weight:700;border-radius:9px;padding:8px;font-size:0.83rem;cursor:pointer;">＋ opção</button>' +
      _sectionToggleHtml(!!(sec && sec.multiSelect)) +
    '</div>';
  }
  window._opRemoveSection = function (btn) {
    var box = document.getElementById('op-sections-box');
    if (!box) return;
    var secs = box.querySelectorAll('.op-section');
    if (secs.length <= 1) { if (typeof showNotification === 'function') showNotification('Mínimo 1 seção', 'A enquete precisa de pelo menos uma seção.', 'warning'); return; }
    var blk = btn && btn.closest ? btn.closest('.op-section') : null;
    if (blk) blk.remove();
    _renumberSections();
  };
  window._opAddSection = function () {
    // v3.1.49: guarda anti duplo-disparo — no mobile um toque às vezes vira 2 cliques
    // (ghost click), criando uma seção fantasma vazia. Ignora chamadas em < 500ms.
    var _now = Date.now();
    if (window._opLastAddSection && (_now - window._opLastAddSection) < 500) return;
    window._opLastAddSection = _now;
    var box = document.getElementById('op-sections-box'); if (!box) return;
    box.insertAdjacentHTML('beforeend', _sectionBlock(null));
    _renumberSections();
    var blocks = box.querySelectorAll('.op-section');
    if (blocks.length) { var q = blocks[blocks.length - 1].querySelector('.op-sec-q'); if (q) q.focus(); }
  };
  function _renumberSections() {
    var box = document.getElementById('op-sections-box'); if (!box) return;
    var blocks = box.querySelectorAll('.op-section');
    var multi = blocks.length > 1;
    blocks.forEach(function (b, i) {
      var t = b.querySelector('.op-sec-title');
      if (t) t.textContent = multi ? ('SEÇÃO ' + (i + 1)) : 'PERGUNTA';
    });
  }

  // Abre editor pra criar (pollId vazio) ou editar (pollId definido).
  window._opOpenEditor = function (tId, pollId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var editing = !!pollId;
    var poll = editing ? _findPoll(t, pollId) : null;
    if (editing && !poll) return;
    var secs = editing ? window._opSections(poll) : [null];
    var sectionsHtml = secs.map(function (s) { return _sectionBlock(s); }).join('');
    var hasVotes = editing && poll.votes && Object.keys(poll.votes).some(function (u) { return _opHasVotedAny(poll, u); });
    var _tg = function (id, on, label, desc) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color,rgba(255,255,255,0.1));border-radius:12px;margin-top:8px;">' +
        '<div style="min-width:0;"><div style="font-weight:700;color:var(--text-bright);font-size:0.86rem;">' + label + '</div><div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">' + desc + '</div></div>' +
        '<label class="toggle-switch" style="--toggle-on-bg:#8b5cf6;--toggle-on-glow:rgba(139,92,246,0.3);--toggle-on-border:#8b5cf6;flex-shrink:0;"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
      '</div>';
    };
    var saveCall = editing ? ("window._opSavePoll('" + _attr(t.id) + "','" + _attr(poll.id) + "')") : ("window._opSavePoll('" + _attr(t.id) + "')");
    var html =
      // v3.1.49: header STICKY — Cancelar/Salvar SEMPRE no topo, visíveis e funcionais
      // ao rolar (o container do overlay é o scroller; top:0 gruda nele). z-index alto
      // pra ficar acima dos blocos de seção.
      '<div style="position:sticky;top:0;z-index:10;padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#4338ca,#6d28d9);border-radius:16px 16px 0 0;">' +
        '<button type="button" onclick="window._opCloseOverlay()" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);">Cancelar</button>' +
        '<span style="font-weight:800;color:#fff;font-size:0.95rem;">📊 ' + (editing ? 'Editar enquete' : 'Nova enquete') + '</span>' +
        '<button type="button" onclick="' + saveCall + '" class="btn btn-sm" style="background:#fff;color:#4338ca;font-weight:800;border:none;">' + (editing ? 'Salvar' : 'Criar') + '</button>' +
      '</div>' +
      '<div style="padding:1rem 1.1rem;">' +
        (hasVotes ? '<div style="font-size:0.74rem;color:#fbbf24;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:9px;padding:8px 10px;margin-bottom:12px;">⚠️ Esta enquete já tem votos. Mudar/remover opções descarta os votos dados nelas.</div>' : '') +
        '<div id="op-sections-box">' + sectionsHtml + '</div>' +
        '<button type="button" onclick="window._opAddSection()" style="width:100%;background:rgba(16,185,129,0.12);border:1px dashed rgba(16,185,129,0.5);color:#34d399;font-weight:800;border-radius:11px;padding:11px;font-size:0.9rem;cursor:pointer;margin-bottom:14px;">＋ adicionar seção</button>' +
        _tg('op-hide', editing ? !!poll.hideResultsUntilVote : true, 'Ocultar resultados até votar', 'O inscrito só vê os votos depois de votar (não influencia).') +
      '</div>';
    _overlay('op-create-overlay', html);
    _renumberSections();
    var q = document.querySelector('#op-sections-box .op-sec-q'); if (q) q.focus();
  };

  // Lê o DOM do editor → monta sections. Cria (sem pollId) ou atualiza (com pollId).
  window._opSavePoll = function (tId, pollId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var blocks = document.querySelectorAll('#op-sections-box .op-section');
    var sections = [];
    var bad = '';
    blocks.forEach(function (b, i) {
      var qEl = b.querySelector('.op-sec-q');
      var question = qEl ? qEl.value.trim() : '';
      var opts = [];
      b.querySelectorAll('.op-sec-opts .op-opt-input').forEach(function (inp) {
        var v = (inp.value || '').trim();
        // v3.1.53: PRESERVA o id existente da opção (data-opt-id) — só gera id novo
        // pra opção nova. Sem isso, re-salvar regenerava ids e os votos viravam órfãos.
        if (v) opts.push({ id: inp.getAttribute('data-opt-id') || ('o' + (i + 1) + '_' + opts.length + '_' + _rand()), text: v });
      });
      var multi = !!(b.querySelector('.op-sec-multi') && b.querySelector('.op-sec-multi').checked);
      // v3.1.50: NÃO pula seção incompleta em silêncio — AVISA claramente o requisito
      // (pedido do dono). O duplo-disparo do "adicionar seção" (que criava a seção
      // fantasma) já é evitado pelo guard em _opAddSection, então um bloco incompleto
      // aqui é intencional e merece feedback explícito.
      if (!question || opts.length < 2) {
        if (!bad) bad = 'Seção ' + (i + 1) + ': cada seção precisa de 1 pergunta e pelo menos 2 opções.';
        return;
      }
      // v3.1.53: PRESERVA o id existente da seção (data-sec-id) — votos seguem válidos.
      sections.push({ id: b.getAttribute('data-sec-id') || ('s' + (i + 1) + '_' + _rand()), question: question, options: opts, multiSelect: multi });
    });
    if (bad) { if (typeof showNotification === 'function') showNotification('Revise a enquete', bad, 'warning'); return; }
    if (!sections.length) { if (typeof showNotification === 'function') showNotification('Sem seções', 'Adicione pelo menos uma seção.', 'warning'); return; }
    var hide = !!(document.getElementById('op-hide') && document.getElementById('op-hide').checked);
    var cu = _cu();

    if (pollId) {
      // edição: preserva id/votes/createdAt, troca conteúdo. Os ids das opções/seções são
      // novos (regenerados) → votos de opções alteradas naturalmente deixam de contar.
      var existing = _findPoll(t, pollId); if (!existing) return;
      existing.sections = sections;
      existing.hideResultsUntilVote = hide;
      // limpa campos legados pra não confundir os acessores
      delete existing.question; delete existing.options; delete existing.multiSelect;
      _save(t);
      window._opCloseOverlay();
      if (typeof showNotification === 'function') showNotification('✅ Enquete atualizada', '', 'success');
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
      return;
    }

    var poll = {
      id: 'op_' + Date.now() + '_' + _rand(),
      sections: sections,
      hideResultsUntilVote: hide,
      votes: {}, createdAt: new Date().toISOString(), createdByUid: (cu && cu.uid) || '', closed: false
    };
    if (!Array.isArray(t.opinionPolls)) t.opinionPolls = [];
    t.opinionPolls.push(poll);
    _save(t);
    window._opCloseOverlay();
    if (typeof showNotification === 'function') showNotification('📊 Enquete criada', 'Notificando os inscritos…', 'success');
    window._opNotifyEnrolled(t, poll, { excludeEmail: (cu && cu.email) || '' });
    if (typeof window._softRefreshView === 'function') window._softRefreshView();
  };

  // ─── PASSO 3: Votar / ver resultados (por seção, todas na tela) ──────────────────
  window._opOpenVote = function (tId, pollId) {
    var t = _findT(tId); if (!t) return;
    var poll = _findPoll(t, pollId); if (!poll) return;
    _renderVote(t, poll, null);
  };
  // reabre uma SEÇÃO em modo edição (opções pré-marcadas) pra trocar o voto.
  window._opEditVote = function (tId, pollId, secId) {
    var t = _findT(tId); if (!t) return;
    var poll = _findPoll(t, pollId); if (!poll || poll.closed) return;
    _renderVote(t, poll, secId);
  };

  // v3.1.69: GLIFOS CANÔNICOS de voto — compartilhados por TODAS as enquetes
  // (opinião + combinar jogo). Positivo = ✅; negativo = 🚫 (proibido) em vez de
  // ❌, pra NÃO confundir com o ❌ de cancelar/excluir uma opção. Qualquer enquete
  // nova deve usar window._opVoteGlyph(kind) em vez de hardcodar o símbolo.
  window._opVoteGlyph = function (kind) { return kind === 'yes' ? '✅' : '🚫'; };

  // v3.1.68: estilo dos botões ✅/🚫 das opções multiSelect (tri-estado).
  window._opVoteBtnStyle = function (kind, active) {
    var base = 'display:inline-flex;align-items:center;justify-content:center;width:42px;height:38px;border-radius:9px;font-size:1.05rem;cursor:pointer;flex-shrink:0;transition:all 0.15s;';
    if (kind === 'yes') {
      return base + (active
        ? 'background:rgba(16,185,129,0.85);border:1px solid #10b981;opacity:1;box-shadow:0 0 0 2px rgba(16,185,129,0.25);'
        : 'background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.35);opacity:0.55;');
    }
    return base + (active
      ? 'background:rgba(220,38,38,0.85);border:1px solid #ef4444;opacity:1;box-shadow:0 0 0 2px rgba(239,68,68,0.25);'
      : 'background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.35);opacity:0.55;');
  };
  // Toggle do voto de uma opção: ✅/❌/neutro (mutuamente exclusivos). Re-estiliza os 2 botões.
  window._opToggleVote = function (btn, kind) {
    var row = btn && btn.closest ? btn.closest('[data-opt-row]') : null;
    if (!row) return;
    var cur = row.getAttribute('data-vote') || '';
    var next = (cur === kind) ? '' : kind;
    row.setAttribute('data-vote', next);
    var yb = row.querySelector('[data-vote-btn="yes"]');
    var nb = row.querySelector('[data-vote-btn="no"]');
    if (yb) yb.setAttribute('style', window._opVoteBtnStyle('yes', next === 'yes'));
    if (nb) nb.setAttribute('style', window._opVoteBtnStyle('no', next === 'no'));
  };

  function _renderVote(t, poll, editSecId) {
    var cu = _cu();
    var uid = cu && cu.uid;
    var isOrg = _isOrg(t);
    var canVote = _canVote(t) && !poll.closed;
    var secs = window._opSections(poll);

    var body = '';
    secs.forEach(function (sec, si) {
      var voted = _opHasVotedSection(poll, sec.id, uid);
      var votingMode = canVote && (!voted || editSecId === sec.id);
      var showResults = poll.closed || voted || !poll.hideResultsUntilVote;
      var total = _opSectionVoters(poll, sec.id);
      var myChoices = _opGetVote(poll, uid, sec.id);

      // v3.1.54: sem rótulo "SEÇÃO N" — a própria PERGUNTA em LARANJA + negrito separa
      // as perguntas (pedido do dono). Mesma fonte usada no editor.
      body += '<div id="op-vsec-' + _esc(sec.id) + '" style="margin-bottom:18px;scroll-margin-top:170px;' + (si > 0 ? 'padding-top:16px;border-top:1px solid var(--border-color);' : '') + '">' +
        '<div style="font-weight:900;font-size:1.02rem;color:#f59e0b;margin-bottom:3px;">' + _esc(sec.question) + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:11px;">' + (sec.multiSelect ? 'Marque ✅ no que você quer e 🚫 no que não quer' : 'Escolha uma opção') + (poll.hideResultsUntilVote && !voted && !poll.closed ? ' · resultados após votar' : '') + '</div>';

      var myNo = _opGetVoteNo(poll, uid, sec.id);
      // v3.1.50: barra de resultado simples (seção de escolha ÚNICA).
      var _resultBar = function (o, c, pct, mine) {
        return '<div style="margin-bottom:10px;">' +
          '<div style="display:flex;justify-content:space-between;font-size:0.86rem;margin-bottom:3px;color:var(--text-bright);">' +
            '<span style="font-weight:' + (mine ? '800' : '600') + ';">' + (mine ? '✓ ' : '') + _esc(o.text) + '</span>' +
            '<span style="color:var(--text-muted);font-weight:700;">' + c + ' · ' + pct + '%</span>' +
          '</div>' +
          '<div style="height:9px;background:rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + (mine ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)') + ';border-radius:6px;transition:width 0.3s;"></div>' +
          '</div></div>';
      };
      // v3.1.68: barra de resultado DUPLA (multiSelect) — ✅ quero (verde) + ❌ não quero (vermelho).
      var _resultBarMulti = function (o) {
        var yc = _opOptCount(poll, sec.id, o.id), nc = _opOptCountNo(poll, sec.id, o.id);
        var yp = total > 0 ? Math.round((yc / total) * 100) : 0, np = total > 0 ? Math.round((nc / total) * 100) : 0;
        var mineY = myChoices.indexOf(o.id) !== -1, mineN = myNo.indexOf(o.id) !== -1;
        var _line = function (icon, pct, cnt, grad) {
          return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
            '<span style="font-size:0.72rem;width:16px;flex-shrink:0;text-align:center;">' + icon + '</span>' +
            '<div style="flex:1;height:7px;background:rgba(255,255,255,0.08);border-radius:5px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + grad + ';border-radius:5px;transition:width 0.3s;"></div></div>' +
            '<span style="font-size:0.74rem;color:var(--text-muted);font-weight:700;min-width:54px;text-align:right;flex-shrink:0;">' + cnt + ' · ' + pct + '%</span>' +
          '</div>';
        };
        return '<div style="margin-bottom:13px;">' +
          '<div style="font-size:0.84rem;font-weight:' + (mineY || mineN ? '800' : '600') + ';color:var(--text-bright);margin-bottom:4px;">' + (mineY ? '✅ ' : (mineN ? '🚫 ' : '')) + _esc(o.text) + '</div>' +
          _line('✅', yp, yc, 'linear-gradient(90deg,#10b981,#34d399)') +
          _line('🚫', np, nc, 'linear-gradient(90deg,#dc2626,#f87171)') +
        '</div>';
      };
      sec.options.forEach(function (o) {
        var mine = myChoices.indexOf(o.id) !== -1;
        if (!votingMode) {
          if (sec.multiSelect) { body += _resultBarMulti(o); }
          else { var c0 = _opOptCount(poll, sec.id, o.id); body += _resultBar(o, c0, total > 0 ? Math.round((c0 / total) * 100) : 0, mine); }
        } else if (sec.multiSelect) {
          // v3.1.68: linha tri-estado — ✅ quero / ❌ não quero / neutro. Estado em data-vote.
          var vs = mine ? 'yes' : (myNo.indexOf(o.id) !== -1 ? 'no' : '');
          body += '<div data-opt-row data-opt-id="' + _esc(o.id) + '" data-vote="' + vs + '" style="display:flex;align-items:center;gap:8px;padding:8px 11px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.25);border-radius:11px;margin-bottom:' + (showResults ? '4px' : '8px') + ';">' +
            '<span style="flex:1;min-width:0;font-size:0.92rem;color:var(--text-bright);font-weight:600;">' + _esc(o.text) + '</span>' +
            '<button type="button" data-vote-btn="yes" onclick="window._opToggleVote(this,\'yes\')" title="Quero" style="' + window._opVoteBtnStyle('yes', vs === 'yes') + '">✅</button>' +
            '<button type="button" data-vote-btn="no" onclick="window._opToggleVote(this,\'no\')" title="Não quero" style="' + window._opVoteBtnStyle('no', vs === 'no') + '">' + window._opVoteGlyph('no') + '</button>' +
          '</div>';
          if (showResults) body += _resultBarMulti(o);
        } else {
          var c = _opOptCount(poll, sec.id, o.id);
          var pct = total > 0 ? Math.round((c / total) * 100) : 0;
          body += '<label style="display:flex;align-items:center;gap:10px;padding:11px 13px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.3);border-radius:11px;cursor:pointer;margin-bottom:' + (showResults ? '4px' : '8px') + ';">' +
            '<input type="radio" name="op-choice-' + _esc(sec.id) + '" value="' + _esc(o.id) + '"' + (mine ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:#8b5cf6;flex-shrink:0;">' +
            '<span style="font-size:0.92rem;color:var(--text-bright);font-weight:600;">' + _esc(o.text) + '</span>' +
          '</label>';
          if (showResults) body += _resultBar(o, c, pct, mine);
        }
      });

      // rodapé da seção
      // v3.1.64: SEM botão "Votar" por seção — há um único "Confirmar voto(s)" fixo no
      // topo (window._opVoteAll). No modo EDIÇÃO de uma seção já votada, mantém só o
      // "Cancelar" pra abortar a alteração.
      if (votingMode) {
        if (voted) {
          body += '<button type="button" onclick="window._opOpenVote(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn" style="width:100%;background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border-color);font-weight:700;border-radius:11px;padding:8px;font-size:0.8rem;margin-top:6px;">↩️ Cancelar alteração</button>';
        }
      } else if (voted && !poll.closed) {
        body += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;">' +
          '<span style="font-size:0.78rem;color:#34d399;font-weight:700;">✓ Você votou · ' + total + ' voto(s)</span>' +
          '<button type="button" onclick="window._opEditVote(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\',\'' + _attr(sec.id) + '\')" class="btn" style="background:rgba(139,92,246,0.12);color:#a78bfa;border:1px solid rgba(139,92,246,0.4);font-weight:700;border-radius:10px;padding:7px 12px;font-size:0.8rem;">✏️ Alterar</button>' +
        '</div>';
      }
      body += '</div>';
    });

    // v3.1.63: botões do ORGANIZADOR no TOPO, sempre visíveis (sticky), em grade 2x2:
    //   Editar | Ver votos  /  Re-notificar | Encerrar
    // (com enquete encerrada, só Editar | Ver votos). O "Fechar" do topo vira "← Voltar".
    var _orgTop = '';
    if (isOrg) {
      var _cellStyle = 'border-radius:10px;padding:10px;font-size:0.82rem;font-weight:700;';
      var _cells =
        '<button type="button" onclick="window._opOpenEditor(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn" style="' + _cellStyle + 'background:rgba(99,102,241,0.16);color:#a5b4fc;border:1px solid rgba(99,102,241,0.45);">✏️ Editar</button>' +
        '<button type="button" onclick="window._opOpenTally(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn" style="' + _cellStyle + 'background:rgba(16,185,129,0.14);color:#34d399;border:1px solid rgba(16,185,129,0.45);">👁️ Ver votos</button>';
      if (!poll.closed) {
        // Re-notificar: cinza "Notificados" durante as 24h de cooldown (lê republishedAt).
        var _repubLast = poll.republishedAt ? Date.parse(poll.republishedAt) : 0;
        var _repubRest = _repubLast ? (24 * 3600000 - (Date.now() - _repubLast)) : 0;
        _cells += (_repubRest > 0)
          ? '<button type="button" onclick="window._opRepublish(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn" style="' + _cellStyle + 'background:rgba(255,255,255,0.04);color:var(--text-muted);border:1px solid var(--border-color);opacity:0.6;cursor:not-allowed;">✅ Notificados</button>'
          : '<button type="button" onclick="window._opRepublish(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn" style="' + _cellStyle + 'background:rgba(245,158,11,0.16);color:#fbbf24;border:1px solid rgba(245,158,11,0.5);">📣 Re-notificar</button>';
        _cells += '<button type="button" onclick="window._opClose(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn" style="' + _cellStyle + 'background:rgba(239,68,68,0.16);color:#f87171;border:1px solid rgba(239,68,68,0.45);">🔒 Encerrar</button>';
      }
      _orgTop = '<div style="padding:10px 1rem;border-bottom:1px solid var(--border-color);background:var(--bg-card,#0f172a);">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + _cells + '</div>' +
      '</div>';
    }
    // v3.1.64: UM ÚNICO botão "Confirmar voto(s)" no TOPO (sticky), pra TODAS as seções.
    // Aparece quando há ≥1 seção em modo de votação. Plural se a enquete tem >1 pergunta.
    var _hasVotingSecs = false;
    secs.forEach(function (s) { if (canVote && (!_opHasVotedSection(poll, s.id, uid) || editSecId === s.id)) _hasVotingSecs = true; });
    var _voteTop = '';
    if (_hasVotingSecs) {
      var _voteLabel = (secs.length > 1) ? '✅ Confirmar votos' : '✅ Confirmar voto';
      _voteTop = '<div style="padding:10px 1rem;border-bottom:1px solid var(--border-color);background:var(--bg-card,#0f172a);">' +
        '<button type="button" onclick="window._opVoteAll(\'' + _attr(t.id) + '\',\'' + _attr(poll.id) + '\')" class="btn btn-shine" style="width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:800;border:none;border-radius:11px;padding:12px;font-size:0.95rem;">' + _voteLabel + '</button>' +
      '</div>';
    }
    // rodapé: só o aviso de "encerrada" (os botões subiram pro topo).
    var footer = '';
    if (poll.closed) footer += '<div style="text-align:center;font-size:0.8rem;color:var(--text-muted);font-weight:700;margin-top:4px;">🔒 Enquete encerrada</div>';

    var html =
      // header + confirmar voto + botões do org juntos num bloco STICKY no topo.
      '<div style="position:sticky;top:0;z-index:4;border-radius:16px 16px 0 0;">' +
        '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#4338ca,#6d28d9);border-radius:16px 16px 0 0;">' +
          '<span style="font-weight:800;color:#fff;font-size:0.92rem;">📊 Enquete</span>' +
          '<button type="button" onclick="window._opCloseOverlay()" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);">← Voltar</button>' +
        '</div>' +
        _voteTop +
        _orgTop +
      '</div>' +
      '<div style="padding:1rem 1.1rem;">' +
        body + _voterAvatarsHtml(t, poll) + footer +
      '</div>';
    _overlay('op-vote-overlay', html);
  }

  window._opVote = function (tId, pollId, secId) {
    var t = _findT(tId); if (!t) return;
    var poll = _findPoll(t, pollId); if (!poll || poll.closed) return;
    var sec = window._opSections(poll).find(function (s) { return s.id === secId; }); if (!sec) return;
    var cu = _cu(); if (!cu || !cu.uid) { if (typeof showNotification === 'function') showNotification('Entre pra votar', 'Faça login pra votar na enquete.', 'warning'); return; }
    if (!_canVote(t)) { if (typeof showNotification === 'function') showNotification('Só inscritos votam', 'Inscreva-se no torneio pra votar.', 'warning'); return; }
    var checked = [];
    document.querySelectorAll('#op-vote-overlay input[name="op-choice-' + secId + '"]:checked').forEach(function (i) { checked.push(i.value); });
    if (!checked.length) { if (typeof showNotification === 'function') showNotification('Escolha uma opção', '', 'warning'); return; }
    if (!sec.multiSelect) checked = [checked[0]];
    var _wasVoted = _opHasVotedSection(poll, secId, cu.uid);
    var _prev = poll.votes && poll.votes[cu.uid]; // snapshot pra reverter se o save falhar
    var _prevClone = _prev == null ? undefined : (Array.isArray(_prev) ? _prev.slice() : JSON.parse(JSON.stringify(_prev)));
    _opSetVote(poll, cu.uid, secId, checked);
    // Só confirma DEPOIS que o servidor aceitar. Se a gravação for rejeitada (ex.: rule),
    // reverte o voto local e avisa de verdade — nunca mais "voto registrado" mentiroso.
    _save(t).then(function () {
      if (typeof showNotification === 'function') showNotification(_wasVoted ? '✓ Voto atualizado' : '✓ Voto registrado', '', 'success');
      _renderVote(t, poll, null);
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
    }).catch(function (err) {
      if (poll.votes) { if (_prevClone === undefined) { try { delete poll.votes[cu.uid]; } catch (e) {} } else poll.votes[cu.uid] = _prevClone; }
      var _msg = (err && (err.code || err.message)) ? String(err.code || err.message) : 'tente novamente';
      if (typeof showNotification === 'function') showNotification('⚠️ Voto NÃO salvo', 'Não foi possível registrar no servidor (' + _msg + ').', 'error');
      try { console.error('[opinion-poll] voto rejeitado:', err); } catch (e) {}
    });
  };

  // v3.1.64: confirma TODAS as seções em modo de votação de uma vez (botão único no topo).
  // Se alguma seção não tem opção marcada, ROLA até ela e pede o voto antes de confirmar.
  window._opVoteAll = function (tId, pollId) {
    var t = _findT(tId); if (!t) return;
    var poll = _findPoll(t, pollId); if (!poll || poll.closed) return;
    var cu = _cu(); if (!cu || !cu.uid) { if (typeof showNotification === 'function') showNotification('Entre pra votar', 'Faça login pra votar na enquete.', 'warning'); return; }
    if (!_canVote(t)) { if (typeof showNotification === 'function') showNotification('Só inscritos votam', 'Inscreva-se no torneio pra votar.', 'warning'); return; }
    var secs = window._opSections(poll);
    var toSave = [];
    var firstMissing = null;
    secs.forEach(function (sec) {
      var secEl = document.getElementById('op-vsec-' + sec.id);
      if (sec.multiSelect) {
        // v3.1.68: lê o tri-estado (data-vote) de cada linha de opção da seção.
        var rows = secEl ? secEl.querySelectorAll('[data-opt-row]') : [];
        if (!rows.length) return; // não está em modo votação (mostrando resultado)
        var yes = [], no = [];
        Array.prototype.forEach.call(rows, function (r) {
          var st = r.getAttribute('data-vote'), oid = r.getAttribute('data-opt-id');
          if (st === 'yes') yes.push(oid); else if (st === 'no') no.push(oid);
        });
        if (!yes.length && !no.length) { if (!firstMissing) firstMissing = sec.id; return; }
        toSave.push({ secId: sec.id, multi: true, yes: yes, no: no });
      } else {
        // Escolha única: lê o radio marcado.
        var inputs = document.querySelectorAll('#op-vote-overlay input[name="op-choice-' + sec.id + '"]');
        if (!inputs.length) return;
        var checked = [];
        document.querySelectorAll('#op-vote-overlay input[name="op-choice-' + sec.id + '"]:checked').forEach(function (i) { checked.push(i.value); });
        if (!checked.length) { if (!firstMissing) firstMissing = sec.id; return; }
        toSave.push({ secId: sec.id, multi: false, yes: [checked[0]] });
      }
    });
    if (firstMissing) {
      var el = document.getElementById('op-vsec-' + firstMissing);
      if (el && el.scrollIntoView) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); } }
      if (typeof showNotification === 'function') showNotification('Falta votar', 'Marque sua resposta nesta pergunta antes de confirmar.', 'warning');
      return;
    }
    if (!toSave.length) { if (typeof showNotification === 'function') showNotification('Nada a confirmar', '', 'info'); return; }
    var _prev = poll.votes && poll.votes[cu.uid]; // snapshot pra reverter se o save falhar
    var _prevClone = _prev == null ? undefined : (Array.isArray(_prev) ? _prev.slice() : JSON.parse(JSON.stringify(_prev)));
    toSave.forEach(function (s) { if (s.multi) _opSetVoteMulti(poll, cu.uid, s.secId, s.yes, s.no); else _opSetVote(poll, cu.uid, s.secId, s.yes); });
    _save(t).then(function () {
      if (typeof showNotification === 'function') showNotification(secs.length > 1 ? '✓ Votos registrados' : '✓ Voto registrado', '', 'success');
      _renderVote(t, poll, null);
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
    }).catch(function (err) {
      if (poll.votes) { if (_prevClone === undefined) { try { delete poll.votes[cu.uid]; } catch (e) {} } else poll.votes[cu.uid] = _prevClone; }
      var _msg = (err && (err.code || err.message)) ? String(err.code || err.message) : 'tente novamente';
      if (typeof showNotification === 'function') showNotification('⚠️ Voto NÃO salvo', 'Não foi possível registrar no servidor (' + _msg + ').', 'error');
      try { console.error('[opinion-poll] voto-all rejeitado:', err); } catch (e) {}
    });
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

  // v3.1.54: REPUBLICAR — re-avisa SÓ quem AINDA NÃO votou (quem já respondeu NÃO é
  // incomodado). Permissão: criador da enquete OU organizador/co-org. Cooldown anti-spam
  // usa poll.republishedAt (NÃO o notifiedAt da criação) → o 1º republish SEMPRE vale; o
  // aviso de "espere 24h" só aparece se a pessoa clicar de NOVO em < 24h.
  var _OP_REPUB_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  window._opRepublish = function (tId, pollId) {
    var t = _findT(tId); if (!t) return;
    var poll = _findPoll(t, pollId); if (!poll) return;
    var cu = _cu();
    var isPollCreator = !!(cu && cu.uid && poll.createdByUid && poll.createdByUid === cu.uid);
    if (!isPollCreator && !_isOrg(t)) { if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só o criador da enquete ou o organizador pode republicar.', 'warning'); return; }
    if (poll.closed) { if (typeof showNotification === 'function') showNotification('Enquete encerrada', 'Reabra ou crie uma nova pra notificar de novo.', 'warning'); return; }
    // Cooldown ancorado na ÚLTIMA REPUBLICAÇÃO (não na criação) → 1ª vez sempre passa.
    var last = poll.republishedAt ? Date.parse(poll.republishedAt) : 0;
    var now = Date.now();
    if (last && (now - last) < _OP_REPUB_COOLDOWN_MS) {
      var rest = _OP_REPUB_COOLDOWN_MS - (now - last);
      var h = Math.floor(rest / 3600000);
      var m = Math.ceil((rest % 3600000) / 60000);
      var when = h > 0 ? (h + 'h' + (m > 0 ? (' ' + m + 'min') : '')) : (m + 'min');
      if (typeof showNotification === 'function') showNotification('⏳ Já republicada', 'Você já republicou nas últimas 24h. Poderá reenviar em ' + when + '.', 'warning');
      return;
    }
    var go = function () {
      // Notifica SÓ quem ainda NÃO votou (e nunca o próprio que republicou).
      var info = (typeof _opVoterInfoMap === 'function') ? _opVoterInfoMap(t) : {};
      var myUid = (cu && cu.uid) || '';
      var data = (typeof _opPollNotifData === 'function') ? _opPollNotifData(t, poll) : null;
      var sent = 0;
      if (data && typeof window._sendUserNotification === 'function') {
        Object.keys(info).forEach(function (uid) {
          if (!uid || uid === myUid) return;
          if (_opHasVotedAny(poll, uid)) return;   // já votou → não incomoda
          try { window._sendUserNotification(uid, data); sent++; } catch (e) {}
        });
      }
      poll.republishedAt = new Date().toISOString();
      try { _save(t); } catch (e) {}
      // v3.1.57: RE-RENDERIZA a enquete (em vez de fechar) → o botão Republicar vira
      // CINZA "✅ Notificados" na hora. Volta ao normal sozinho depois de 24h.
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
      try { _renderVote(t, poll, null); } catch (e) {}
      // Confirmação explícita de que disparou (pedido do dono).
      var msg = sent > 0
        ? ('Avisamos de novo ' + sent + ' inscrito(s) que ainda não responderam. Quem já votou não foi incomodado.')
        : 'Todos os inscritos já responderam — não havia ninguém pra avisar.';
      if (typeof window.showAlertDialog === 'function') window.showAlertDialog('✅ Enquete republicada', msg);
      else if (typeof showNotification === 'function') showNotification('✅ Enquete republicada', msg, 'success');
    };
    if (typeof window.showConfirmDialog === 'function') window.showConfirmDialog('Republicar enquete?', 'Vamos avisar de novo SÓ quem ainda não respondeu. Quem já votou não será incomodado.', go, null, { confirmText: 'Republicar', cancelText: 'Cancelar' });
    else go();
  };

  // ─── PASSO 4: Ver votos nominalmente (org/creator) ──────────────────────────────
  window._opOpenTally = function (tId, pollId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var poll = _findPoll(t, pollId); if (!poll) return;
    var secs = window._opSections(poll);
    // v3.1.68: chip normal (índigo, quem marcou ✅) OU vermelho (quem marcou ❌). Em
    // multiseleção cada opção lista os dois grupos; em escolha única só há ✅.
    var nameChip = function (uid, isNo) {
      var nm = window._opVoterName(t, uid);
      if (isNo) {
        return '<span title="Marcou 🚫 (não quer)" style="display:inline-block;background:#dc2626;border:1px solid #ef4444;color:#fff;border-radius:999px;padding:3px 10px;font-size:0.8rem;font-weight:700;margin:0 6px 6px 0;">' + _esc(nm) + '</span>';
      }
      return '<span style="display:inline-block;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);color:var(--text-bright);border-radius:999px;padding:3px 10px;font-size:0.8rem;font-weight:600;margin:0 6px 6px 0;">' + _esc(nm) + '</span>';
    };
    var body = '';
    secs.forEach(function (sec, si) {
      // Votantes ✅ (yes) e ❌ (no, só multiseleção) de cada opção.
      var optYes = sec.options.map(function (o) {
        var vs = [];
        if (poll.votes) Object.keys(poll.votes).forEach(function (u) { if (_opGetVote(poll, u, sec.id).indexOf(o.id) !== -1) vs.push(u); });
        return vs;
      });
      var optNo = sec.options.map(function (o) {
        var vs = [];
        if (sec.multiSelect && poll.votes) Object.keys(poll.votes).forEach(function (u) { if (_opGetVoteNo(poll, u, sec.id).indexOf(o.id) !== -1) vs.push(u); });
        return vs;
      });
      // v3.1.58: opção mais ✅ da seção → box verde (1 por seção). Empate: 1º; sem votos: nenhum.
      var majIdx = -1, maxN = 0;
      optYes.forEach(function (vs, oi) { if (vs.length > maxN) { maxN = vs.length; majIdx = oi; } });
      if (maxN === 0) majIdx = -1;
      body += '<div style="margin-bottom:18px;' + (si > 0 ? 'padding-top:14px;border-top:1px solid var(--border-color);' : '') + '">' +
        '<div style="font-weight:900;font-size:0.98rem;color:#f59e0b;margin-bottom:10px;">' + _esc(sec.question) + '</div>';
      sec.options.forEach(function (o, oi) {
        var yesV = optYes[oi], noV = optNo[oi];
        var isMaj = (oi === majIdx);
        var wrapStyle = isMaj
          ? 'margin-bottom:11px;border:2px solid rgba(16,185,129,0.65);background:rgba(16,185,129,0.08);border-radius:10px;padding:8px 10px;'
          : 'margin-bottom:11px;';
        var countLabel = sec.multiSelect
          ? ('<span style="color:#34d399;font-weight:700;">✅ ' + yesV.length + '</span> <span style="color:#f87171;font-weight:700;">· 🚫 ' + noV.length + '</span>')
          : ('<span style="color:var(--text-muted);font-weight:600;">· ' + yesV.length + '</span>');
        var chips = '';
        if (yesV.length) chips += yesV.map(function (u) { return nameChip(u, false); }).join('');
        if (noV.length) chips += noV.map(function (u) { return nameChip(u, true); }).join('');
        if (!chips) chips = '<span style="font-size:0.78rem;color:var(--text-muted);">ninguém ainda</span>';
        body += '<div style="' + wrapStyle + '">' +
          '<div style="font-size:0.86rem;font-weight:700;color:var(--text-bright);margin-bottom:5px;">' + _esc(o.text) + ' ' + countLabel + '</div>' +
          '<div>' + chips + '</div>' +
        '</div>';
      });
      body += '</div>';
    });
    // quem não votou em NENHUMA seção (inscritos com uid conhecido)
    var info = _opVoterInfoMap(t);
    var voted = {};
    if (poll.votes) Object.keys(poll.votes).forEach(function (u) { if (_opHasVotedAny(poll, u)) voted[u] = 1; });
    var missing = Object.keys(info).filter(function (u) { return !voted[u]; });
    if (missing.length) {
      body += '<div style="padding-top:14px;border-top:1px solid var(--border-color);">' +
        '<div style="font-size:0.8rem;font-weight:700;color:#fbbf24;margin-bottom:8px;">⏳ Ainda não votaram (' + missing.length + ')</div>' +
        // v3.1.56: NÃO passar nameChip direto pro .map — o 2º arg do map é o ÍNDICE, que
        // a nameChip lia como "excluded" e pintava de vermelho a partir do 2º. Não-votantes
        // são sempre normais.
        '<div>' + missing.map(function (u) { return nameChip(u); }).join('') + '</div>' +
      '</div>';
    }
    var html =
      '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#065f46,#047857);border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2;">' +
        '<span style="font-weight:800;color:#fff;font-size:0.92rem;">👁️ Votos (nominal)</span>' +
        '<button type="button" onclick="window._opCloseOverlay()" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);">Fechar</button>' +
      '</div>' +
      '<div style="padding:1rem 1.1rem;">' + body + '</div>';
    _overlay('op-tally-overlay', html);
  };

  // ─── PASSO 6: Pop-up automático pro inscrito que ainda não votou (a cada visita) ──
  window._opMaybePopup = function (t) {
    try {
      if (!t) return;
      var poll = window._opActivePoll(t); if (!poll) return;
      var cu = _cu(); if (!cu || !cu.uid) return;
      if (!_canVote(t)) return;
      if (_opHasVotedAny(poll, cu.uid)) return;         // já engajou → não incomoda
      if (window._opPoppedPollId === poll.id) return;   // já popou nesta visita
      window._opPoppedPollId = poll.id;
      window._opPoppedTid = String(t.id);
      setTimeout(function () {
        var t2 = _findT(t.id); var p2 = t2 && window._opActivePoll(t2);
        if (p2 && p2.id === poll.id && !_opHasVotedAny(p2, cu.uid)) window._opOpenVote(t.id, poll.id);
      }, 700);
    } catch (e) {}
  };
  // Ao SAIR do detalhe do torneio que popou, libera a trava → reentrar re-popa.
  // Soft-refresh (mesmo hash, sem hashchange) não dispara → não re-popa.
  try {
    window.addEventListener('hashchange', function () {
      if (!window._opPoppedTid) return;
      var h = String(window.location.hash || '');
      if (h.indexOf('#tournaments/' + window._opPoppedTid) !== 0) {
        window._opPoppedPollId = null;
        window._opPoppedTid = null;
      }
    });
  } catch (e) {}

  // ─── Notificação da enquete (categoria FUNDAMENTAL) ─────────────────────────────
  function _opPollNotifData(t, poll) {
    var secs = window._opSections(poll);
    var q = (secs[0] && secs[0].question) ? secs[0].question : 'enquete';
    return {
      type: 'poll', pollId: (poll && poll.id) || '',
      tournamentId: String(t.id), tournamentName: t.name || '',
      title: '📊 Responda a enquete',
      message: 'O organizador abriu a enquete "' + q + '" em "' + (t.name || '') + '". Toque pra responder.',
      level: 'fundamental'
    };
  }

  // Notifica TODOS os inscritos — 1x por enquete (seta poll.notifiedAt). force re-dispara.
  window._opNotifyEnrolled = function (t, poll, opts) {
    opts = opts || {};
    if (!t || !poll) return;
    if (poll.notifiedAt && !opts.force) return;
    window._opNotifiedThisSession = window._opNotifiedThisSession || {};
    if (window._opNotifiedThisSession[poll.id] && !opts.force) return;
    window._opNotifiedThisSession[poll.id] = true;
    poll.notifiedAt = new Date().toISOString();
    try { _save(t); } catch (e) {}
    try {
      if (typeof window._notifyTournamentParticipants === 'function') {
        var cu = _cu();
        var excl = opts.excludeEmail != null ? opts.excludeEmail : ((cu && cu.email) || '');
        window._notifyTournamentParticipants(t, _opPollNotifData(t, poll), excl);
      }
    } catch (e2) {}
  };

  // Chamado pelo app do CRIADOR ao renderizar — dispara enquete ativa ainda não notificada.
  window._opMaybeNotifyExisting = function (t) {
    try {
      if (!t) return;
      if (!(window.AppStore && typeof window.AppStore.isCreator === 'function' && window.AppStore.isCreator(t))) return;
      var poll = window._opActivePoll(t); if (!poll || poll.closed) return;
      if (poll.notifiedAt) return;
      window._opNotifyEnrolled(t, poll, {});
    } catch (e) {}
  };

  // Notifica um inscrito recém-chegado se há enquete ativa que ele ainda não respondeu.
  window._opNotifyNewEnrollee = function (t, uid) {
    try {
      if (!t || !uid) return;
      var poll = window._opActivePoll(t); if (!poll || poll.closed) return;
      if (_opHasVotedAny(poll, uid)) return;
      if (typeof window._sendUserNotification === 'function') window._sendUserNotification(uid, _opPollNotifData(t, poll));
    } catch (e) {}
  };
})();
