/* tournaments-org-tools.js — v4.0.90
 * Ferramentas do organizador CONSOLIDADAS em page-routes canônicas (padrão renderXxxPage +
 * _renderBackHeader + caso no router; nunca hack de modal). Tira 2 botões das ferramentas:
 *   • #comunicados/<tId>  = "Comunicar Inscritos" + "Comunicados" num só → escrever no topo,
 *     barra de filtro/busca dividindo, lista de comunicados enviados abaixo, Voltar.
 *   • #participantes/<tId> = "+ Participante" + "Placeholders" num só → campo nome + Adicionar,
 *     campo número de placeholders + Adicionar, Voltar.
 * Reaproveita a lógica EXISTENTE (fonte única): _confirmSendComm / _selectCommLevel (comunicação),
 * _doAddParticipant (enrollment.js), _addPlaceholdersCore (tournaments.js). Funciona em TODOS os
 * torneios. Ver memória feedback_use_centralized_pattern.
 */
(function () {
  var _t = window._t || function (k) { return k; };
  function _safe(s) { return window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s); }

  // guarda: existe + é organizador. Senão volta pro torneio/dashboard.
  function _guard(tId) {
    var t = window._findTournamentById ? window._findTournamentById(tId) : null;
    if (!t) { window.location.replace('#dashboard'); return null; }
    if (!window.AppStore || !window.AppStore.isOrganizer || !window.AppStore.isOrganizer(t)) {
      window.location.replace('#tournaments/' + tId); return null;
    }
    return t;
  }

  function _header(tId, titleHtml, belowHtml) {
    if (typeof window._renderBackHeader !== 'function') return '';
    return window._renderBackHeader({
      href: '#tournaments/' + tId,
      label: _t('btn.back') || 'Voltar',
      middleHtml: '<span style="font-size:0.9rem;font-weight:700;color:var(--text-bright);">' + titleHtml + '</span>',
      belowHtml: belowHtml || ''
    });
  }

  // ════════════════ 1) COMUNICADOS (escrever + lista com filtro) ════════════════
  var _commsCache = {}; // tId -> array de comunicados carregados (pra filtrar client-side)

  window.renderComunicadosPage = function (container, tId) {
    var t = _guard(tId); if (!t) return;
    var safeId = String(tId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var lvlBtn = function (level, emoji, label, active) {
      var c = { fundamental: 'rgba(239,68,68,', important: 'rgba(251,191,36,', all: 'rgba(16,185,129,' }[level];
      var color = { fundamental: '#f87171', important: '#fbbf24', all: '#10b981' }[level];
      var bg = active ? c + '0.25)' : c + '0.08)';
      var bd = active ? '2px solid ' + c + '0.7)' : '1px solid ' + c + '0.3)';
      var sh = active ? 'box-shadow:0 0 8px ' + c + '0.2);' : '';
      return '<button type="button" class="btn org-comm-level-btn" data-level="' + level + '" onclick="window._selectCommLevel(this, \'' + safeId + '\')" ' +
        'style="padding:8px 6px;border-radius:10px;font-size:0.72rem;font-weight:600;border:' + bd + ';background:' + bg + ';color:' + color + ';cursor:pointer;text-align:center;' + sh + '">' + emoji + ' ' + label + '</button>';
    };

    var writeBox =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:1.1rem;margin-bottom:1.25rem;">' +
        '<h3 style="margin:0 0 0.5rem;font-size:0.92rem;color:var(--text-bright);">📢 ' + (_t('org.commTitle') || 'Comunicar inscritos') + '</h3>' +
        '<p style="font-size:0.72rem;color:var(--text-muted);margin:0 0 0.85rem;">' + _safe(_t('org.commDesc', { name: t.name || '' })) + '</p>' +
        '<textarea id="org-comm-text-' + safeId + '" class="form-control" rows="4" placeholder="' + (_t('org.commPlaceholder') || 'Escreva o comunicado…') + '" style="width:100%;box-sizing:border-box;resize:vertical;margin-bottom:0.85rem;"></textarea>' +
        '<label class="form-label" style="font-size:0.78rem;font-weight:600;">' + (_t('org.commLevel') || 'Importância') + '</label>' +
        '<p style="font-size:0.64rem;color:var(--text-muted);margin:2px 0 8px;">' + (_t('org.commLevelDesc') || '') + '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:0.85rem;">' +
          lvlBtn('fundamental', '🔴', _t('org.levelFundamental') || 'Fundamental', false) +
          lvlBtn('important', '🟡', _t('org.levelImportant') || 'Importante', true) +
          lvlBtn('all', '🟢', _t('org.levelGeneral') || 'Geral', false) +
        '</div>' +
        '<input type="hidden" id="org-comm-level-' + safeId + '" value="important">' +
        '<button type="button" class="btn btn-primary hover-lift" style="width:100%;" onclick="window._pageSendComm(\'' + safeId + '\')">📨 ' + (_t('org.sendComm') || 'Enviar comunicado') + '</button>' +
      '</div>';

    // barra que DIVIDE as duas seções: título "enviados" + busca
    var divider =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
        '<h3 style="margin:0;font-size:0.92rem;color:var(--text-bright);">📊 Comunicados enviados</h3>' +
      '</div>' +
      '<input type="text" id="comms-search-' + safeId + '" placeholder="🔎 Filtrar comunicados…" oninput="window._filterComms(\'' + safeId + '\', this.value)" ' +
        'style="width:100%;box-sizing:border-box;margin-bottom:12px;padding:10px 14px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-darker);color:var(--text-color);font-size:0.85rem;outline:none;">';

    var listBox = '<div id="comms-list-' + safeId + '">' +
      (typeof window._renderBallLoader === 'function' ? window._renderBallLoader('Carregando…', { minHeight: '18vh', size: '2.2rem' }) : 'Carregando…') +
      '</div>';

    container.innerHTML = _header(tId, '📢 Comunicados') +
      '<div style="max-width:640px;margin:0 auto;padding:1rem;">' + writeBox + divider + listBox + '</div>';
    if (typeof window._reflowChrome === 'function') window._reflowChrome();
    window._loadComms(tId);
  };

  // envia (reusa _confirmSendComm — mesma lógica de Comunicar Inscritos) e recarrega a lista.
  window._pageSendComm = async function (tId) {
    try { await window._confirmSendComm(tId); } catch (e) { /* _confirmSendComm já trata erro */ }
    var ta = document.getElementById('org-comm-text-' + tId); if (ta) ta.value = '';
    window._loadComms(tId);
  };

  // carrega comunicados via Cloud Function (mesma de _openCommunicationsPanel) e cacheia.
  window._loadComms = async function (tId) {
    var listEl = document.getElementById('comms-list-' + tId);
    if (!listEl) return;
    try {
      var resp = await firebase.functions().httpsCallable('listCommunications')({ tournamentId: String(tId) });
      var comms = (resp && resp.data && resp.data.communications) || [];
      _commsCache[tId] = comms;
      window._renderCommsList(tId, '');
    } catch (e) {
      listEl.innerHTML = '<div style="text-align:center;color:#f87171;font-size:0.82rem;padding:1.2rem 0;">Erro ao carregar: ' + _safe((e && e.message) || String(e)) + '</div>';
    }
  };

  window._filterComms = function (tId, q) { window._renderCommsList(tId, q || ''); };

  window._renderCommsList = function (tId, q) {
    var listEl = document.getElementById('comms-list-' + tId);
    if (!listEl) return;
    var comms = _commsCache[tId] || [];
    var needle = String(q || '').trim().toLowerCase();
    if (needle) comms = comms.filter(function (c) { return ((c.rawMessage || '') + ' ' + (c.level || '')).toLowerCase().indexOf(needle) !== -1; });
    if (comms.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:1.2rem 0;">' +
        (needle ? 'Nenhum comunicado bate com a busca.' : 'Nenhum comunicado enviado ainda.') + '</div>';
      return;
    }
    var safeId = String(tId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var rows = comms.map(function (c) {
      var dt = c.sentAt ? new Date(c.sentAt) : null;
      var when = dt ? (dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) : '';
      var preview = _safe((c.rawMessage || '').slice(0, 90)) + ((c.rawMessage || '').length > 90 ? '…' : '');
      var cc = c.counts || {};
      var cid = String(c.commId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return '<div onclick="window._openCommunicationDetail(\'' + safeId + '\',\'' + cid + '\')" style="cursor:pointer;border:1px solid var(--border-color);border-radius:10px;padding:12px 14px;margin-bottom:10px;" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:6px;">' +
          '<span style="font-size:0.68rem;color:var(--text-muted);">' + (window._commLevelLabel ? window._commLevelLabel(c.level) : c.level) + ' · ' + when + '</span>' +
          '<span style="font-size:0.68rem;color:var(--text-muted);">' + (c.totalRecipients || 0) + ' inscrito(s) →</span>' +
        '</div>' +
        '<div style="font-size:0.85rem;color:var(--text-main);margin-bottom:8px;">' + (preview || '<i style="color:var(--text-muted);">(sem texto)</i>') + '</div>' +
        '<div style="display:flex;gap:12px;font-size:0.72rem;color:var(--text-muted);">' +
          '<span>📱 ' + (cc.platformSent || 0) + '</span><span>✉️ ' + (cc.emailSent || 0) + '</span><span>💬 ' + (cc.whatsappSent || 0) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
    listEl.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:10px;">📱 plataforma · ✉️ e-mail · 💬 WhatsApp — toque pra ver quem recebeu/abriu.</div>' + rows;
  };

  // ════════════════ 2) + PARTICIPANTE (nome + placeholders) ════════════════
  window.renderAddParticipantPage = function (container, tId) {
    var t = _guard(tId); if (!t) return;
    var safeId = String(tId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    // CANÔNICO: conta PESSOAS (dupla=2), nunca entradas. _countCompetitors (tournaments.js).
    var nParts = window._countCompetitors ? window._countCompetitors(t).people : (Array.isArray(t.participants) ? t.participants.length : 0);

    var fieldStyle = 'width:100%;box-sizing:border-box;padding:11px 14px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-darker);color:var(--text-color);font-size:0.9rem;outline:none;';

    var nameBox =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:1.1rem;margin-bottom:1.1rem;">' +
        '<label class="form-label" style="font-size:0.82rem;font-weight:600;">👤 Nome do participante</label>' +
        '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
          '<input type="text" id="addpart-name-' + safeId + '" placeholder="Ex.: Maria Silva" style="' + fieldStyle + 'flex:1;min-width:160px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();window._pageAddParticipant(\'' + safeId + '\');}">' +
          '<button type="button" id="addpart-name-btn-' + safeId + '" class="btn btn-cyan hover-lift" onclick="window._pageAddParticipant(\'' + safeId + '\')">Adicionar</button>' +
        '</div>' +
      '</div>';

    var phBox =
      '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:1.1rem;">' +
        '<label class="form-label" style="font-size:0.82rem;font-weight:600;">➕ Reservar vagas (placeholders)</label>' +
        '<p style="font-size:0.66rem;color:var(--text-muted);margin:4px 0 8px;">Cria N vagas "Jogador NN" que entram no sorteio como inscritos normais. Cada vaga pode ser ocupada depois por um jogador real que se inscrever.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<input type="number" min="1" max="200" value="8" id="addpart-ph-' + safeId + '" style="' + fieldStyle + 'width:110px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();window._pageAddPlaceholders(\'' + safeId + '\');}">' +
          '<button type="button" id="addpart-ph-btn-' + safeId + '" class="btn btn-cyan hover-lift" onclick="window._pageAddPlaceholders(\'' + safeId + '\')">Adicionar</button>' +
        '</div>' +
      '</div>';

    var countLine = '<div id="addpart-count-' + safeId + '" style="text-align:center;font-size:0.78rem;color:var(--text-muted);margin-bottom:1rem;">' + nParts + ' inscrito(s) no momento</div>';

    container.innerHTML = _header(tId, '👤 + Participante') +
      '<div style="max-width:560px;margin:0 auto;padding:1rem;">' + countLine + nameBox + phBox + '</div>';
    if (typeof window._reflowChrome === 'function') window._reflowChrome();
  };

  function _refreshCount(tId) {
    var t = window._findTournamentById(tId); if (!t) return;
    var el = document.getElementById('addpart-count-' + tId);
    var n = window._countCompetitors ? window._countCompetitors(t).people : (Array.isArray(t.participants) ? t.participants.length : 0);
    if (el) el.textContent = n + ' inscrito(s) no momento';
  }

  // v4.4.67: estado "Adicionando…" (cinza, desabilitado) enquanto grava; volta a azul/ativo
  // quando o callback dispara (após o toast). Safety-timeout restaura se o core não voltar.
  function _addBtnLoading(btnId, on) {
    var b = document.getElementById(btnId); if (!b) return;
    if (on) {
      if (b.dataset.origHtml == null) b.dataset.origHtml = b.innerHTML;
      b.dataset.loadStart = String(Date.now());
      b.disabled = true; b.innerHTML = 'Adicionando…';
      b.style.opacity = '0.55'; b.style.cursor = 'wait'; b.style.filter = 'grayscale(1)'; b.style.pointerEvents = 'none';
    } else {
      // v4.4.112: duração MÍNIMA visível (~450ms). Se o save voltou instantâneo (cache
      // Firestore), segura o cinza mais um pouco — senão pisca rápido demais e o dono lê
      // como "não aconteceu nada". Reverte pelo id (sobrevive a qualquer re-render).
      var _start = parseInt(b.dataset.loadStart, 10) || 0;
      var _elapsed = _start ? (Date.now() - _start) : 999;
      var _revert = function () {
        var bb = document.getElementById(btnId); if (!bb) return;
        bb.disabled = false; if (bb.dataset.origHtml != null) { bb.innerHTML = bb.dataset.origHtml; delete bb.dataset.origHtml; }
        bb.style.opacity = ''; bb.style.cursor = ''; bb.style.filter = ''; bb.style.pointerEvents = '';
        delete bb.dataset.loadStart;
      };
      if (_elapsed < 450) setTimeout(_revert, 450 - _elapsed); else _revert();
    }
  }

  window._pageAddParticipant = function (tId) {
    var inp = document.getElementById('addpart-name-' + tId);
    var name = inp ? inp.value.trim() : '';
    if (!name) { if (typeof showNotification === 'function') showNotification('Nome vazio', 'Digite o nome do participante.', 'warning'); return; }
    var btnId = 'addpart-name-btn-' + tId;
    _addBtnLoading(btnId, true);
    var _done = false, _finish = function () { if (_done) return; _done = true; _addBtnLoading(btnId, false); };
    var _to = setTimeout(_finish, 8000); // safety
    window._doAddParticipant(tId, name, null, null, function () {
      clearTimeout(_to); _finish();
      if (inp) { inp.value = ''; inp.focus(); }
      _refreshCount(tId);
    });
  };

  window._pageAddPlaceholders = function (tId) {
    var inp = document.getElementById('addpart-ph-' + tId);
    var n = inp ? parseInt(inp.value, 10) : NaN;
    if (isNaN(n) || n <= 0) { if (typeof showNotification === 'function') showNotification('Número inválido', 'Informe quantos placeholders (maior que zero).', 'warning'); return; }
    var btnId = 'addpart-ph-btn-' + tId;
    _addBtnLoading(btnId, true);
    var _done = false, _finish = function () { if (_done) return; _done = true; _addBtnLoading(btnId, false); };
    var _to = setTimeout(_finish, 12000); // safety (N placeholders demora mais)
    window._addPlaceholdersCore(tId, n, function () {
      clearTimeout(_to); _finish();
      if (inp) inp.value = '';
      _refreshCount(tId);
    });
  };

  // Compat: call-sites antigos que abram via função → navegam pra page-route.
  window._openComunicadosPage = function (tId) { if (tId) window.location.hash = '#comunicados/' + tId; };
  window._openAddParticipantPage = function (tId) { if (tId) window.location.hash = '#participantes/' + tId; };

  // ════════════════ 3) SUBSTITUIR VAGA (placeholder) POR JOGADOR REAL ════════════════
  // CORE (v4.0.95): troca uma vaga "Jogador NN" por um jogador REAL (uid) — inscrito
  // depois do sorteio, sem time — em TODAS as estruturas de match (p1/p2, "A / Jogador NN",
  // team1/team2 do Rei/Rainha) + na entrada de participants (solo ou slot de dupla) +
  // remove o real da lista de espera. A UI de arrastar-sobre-a-vaga chama isto no confirm.
  // Retorna true se achou e trocou a vaga. Modelado em _autoSubstituteWO/_declareAbsent.
  // Mutação PURA de substituição de placeholder ("Jogador NN" → jogador real):
  // muta só o `t` passado, sem save. Retorna se CASOU (o outer usa o bool). Blindagem
  // v4.0.117 — histórico via t.history.push (transaction-safe).
  window._applyPlaceholderSub = function (t, placeholderName, realPlayer) {
    if (!t || !placeholderName || !realPlayer) return false;
    var realName = (realPlayer.displayName || realPlayer.name || '').trim();
    if (!realName) return false;
    var phLc = String(placeholderName).trim().toLowerCase();
    var matched = false;

    // 1) MATCHES — troca o nome em p1/p2 (solo ou dentro de "A / Jogador NN") + team1/team2.
    var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
    var swapLabel = function (label) {
      if (typeof label !== 'string' || !label) return label;
      if (label.indexOf(' / ') !== -1) {
        return label.split(' / ').map(function (n) {
          if (n.trim().toLowerCase() === phLc) { matched = true; return realName; }
          return n.trim();
        }).join(' / ');
      }
      if (label.trim().toLowerCase() === phLc) { matched = true; return realName; }
      return label;
    };
    all.forEach(function (m) {
      if (!m) return;
      m.p1 = swapLabel(m.p1); m.p2 = swapLabel(m.p2);
      ['team1', 'team2'].forEach(function (tk) {
        if (Array.isArray(m[tk])) m[tk] = m[tk].map(function (n) {
          if (String(n).trim().toLowerCase() === phLc) { matched = true; return realName; }
          return n;
        });
      });
    });

    // 2) PARTICIPANTS — entrada solo OU slot de dupla (p1/p2) OU sub-participants[].
    (Array.isArray(t.participants) ? t.participants : []).forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      if (!p.p1Name && !p.p2Name && (p.displayName || p.name || '').trim().toLowerCase() === phLc) {
        p.name = realName; p.displayName = realName; p.uid = realPlayer.uid || p.uid;
        p.email = realPlayer.email || null; p.photoURL = realPlayer.photoURL || null; delete p.isPlaceholder; matched = true;
      }
      if ((p.p1Name || '').trim().toLowerCase() === phLc) { p.p1Name = realName; p.p1Uid = realPlayer.uid; p.p1Email = realPlayer.email; p.p1Photo = realPlayer.photoURL; matched = true; }
      if ((p.p2Name || '').trim().toLowerCase() === phLc) { p.p2Name = realName; p.p2Uid = realPlayer.uid; p.p2Email = realPlayer.email; p.p2Photo = realPlayer.photoURL; matched = true; }
      if (p.p1Name && p.p2Name && typeof p.displayName === 'string' && p.displayName.indexOf(' / ') !== -1) p.displayName = p.p1Name + ' / ' + p.p2Name;
      if (Array.isArray(p.participants)) p.participants = p.participants.map(function (s) {
        if (s && (s.displayName || s.name || '').trim().toLowerCase() === phLc) { matched = true; return { name: realName, displayName: realName, uid: realPlayer.uid, email: realPlayer.email, photoURL: realPlayer.photoURL }; }
        return s;
      });
    });

    if (!matched) return false;

    // 3) Remove o jogador real da espera (virou titular).
    var isReal = function (p) {
      if (!p) return false;
      if (realPlayer.uid && p.uid === realPlayer.uid) return true;
      return (p.displayName || p.name || '').trim().toLowerCase() === realName.toLowerCase();
    };
    if (Array.isArray(t.standbyParticipants)) t.standbyParticipants = t.standbyParticipants.filter(function (p) { return !isReal(p); });
    if (Array.isArray(t.waitlist)) t.waitlist = t.waitlist.filter(function (p) { return !isReal(p); });

    // 4) memberUids + histórico (sem save — o portão persiste).
    if (typeof window._computeMemberUids === 'function') { try { window._computeMemberUids(t); } catch (e) {} }
    if (!Array.isArray(t.history)) t.history = [];
    t.history.push({ date: new Date().toISOString(), message: '"' + realName + '" assumiu a vaga de "' + placeholderName + '"' });
    return true;
  };

  window._substitutePlaceholder = function (tId, placeholderName, realPlayer, onDone) {
    var t = window._findTournamentById(tId);
    if (!t || !placeholderName || !realPlayer) return false;
    var realName = (realPlayer.displayName || realPlayer.name || '').trim();
    if (!realName) return false;
    // Blindagem v4.0.117: aplica pelo portão AppStore.mutate (atômico no doc fresco).
    // O bool de "casou" vem da execução LOCAL (síncrona) — o chamador ainda o usa.
    var matchedLocal;
    window.AppStore.mutate(tId, function (ft) {
      var m = window._applyPlaceholderSub(ft, placeholderName, realPlayer);
      if (matchedLocal === undefined) matchedLocal = m;
    });
    matchedLocal = !!matchedLocal;
    if (matchedLocal && typeof onDone === 'function') onDone();
    return matchedLocal;
  };

  // ── UI canônica: arrastar jogador real (handle ⠿ na lista de espera) sobre uma VAGA
  //    "Jogador NN" na chave (QUALQUER formato), confirmar, e ocupar via _substitutePlaceholder.
  //    Mouse + touch unificados (clone flutuante). Detecção da vaga por elementFromPoint
  //    (não amarra a formato). Fiado por _wirePlaceholderDnD após cada render (bracket.js).
  window._isPlaceholderName = function (n) { return /^(Jogador|Placeholder)\s+\d+$/i.test(String(n == null ? '' : n).trim()); };

  window._placeholderNameAtPoint = function (x, y) {
    var el = document.elementFromPoint(x, y);
    for (var i = 0; el && i < 5; i++) {
      if (el.getAttribute) {
        var pn = el.getAttribute('data-player-name');
        if (pn && window._isPlaceholderName(pn)) return pn;
      }
      var txt = (el.textContent || '').trim();
      if (window._isPlaceholderName(txt)) return txt;
      el = el.parentElement;
    }
    // fallback: a vaga em algum lugar do card sob o ponto (drop "no card da vaga")
    var e2 = document.elementFromPoint(x, y);
    var card = e2 && e2.closest ? e2.closest('[data-my-match],.card') : null;
    if (card) {
      var nodes = card.querySelectorAll('[data-player-name]');
      for (var j = 0; j < nodes.length; j++) { var an = nodes[j].getAttribute('data-player-name'); if (window._isPlaceholderName(an)) return an; }
    }
    return null;
  };

  var _phDrag = null;
  function _phPoint(e) { return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e; }
  function _phStart(e, handle) {
    var name = handle.getAttribute('data-ph-drag'), uid = handle.getAttribute('data-ph-uid');
    if (!name) return;
    var pt = _phPoint(e);
    var clone = document.createElement('div');
    clone.textContent = '👤 ' + name;
    clone.style.cssText = 'position:fixed;z-index:100060;pointer-events:none;background:#0ea5e9;color:#fff;font-weight:700;font-size:0.8rem;padding:6px 12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.5);transform:translate(-50%,-160%);left:' + pt.clientX + 'px;top:' + pt.clientY + 'px;';
    document.body.appendChild(clone);
    _phDrag = { name: name, uid: uid, clone: clone, over: null, hi: null };
    document.body.style.userSelect = 'none';
    if (e.cancelable) e.preventDefault();
  }
  function _phMove(e) {
    if (!_phDrag) return;
    var pt = _phPoint(e);
    if (_phDrag.clone) { _phDrag.clone.style.left = pt.clientX + 'px'; _phDrag.clone.style.top = pt.clientY + 'px'; }
    if (_phDrag.hi) { _phDrag.hi.style.outline = ''; _phDrag.hi = null; }
    var phName = window._placeholderNameAtPoint(pt.clientX, pt.clientY);
    _phDrag.over = phName || null;
    if (phName) {
      var el = document.elementFromPoint(pt.clientX, pt.clientY);
      var card = (el && el.closest) ? (el.closest('[data-my-match],.card') || el) : el;
      if (card) { card.style.outline = '2px dashed #0ea5e9'; card.style.outlineOffset = '2px'; _phDrag.hi = card; }
    }
    if (e.cancelable) e.preventDefault();
  }
  function _phEnd(e) {
    if (!_phDrag) return;
    var d = _phDrag; _phDrag = null;
    if (d.clone) d.clone.remove();
    if (d.hi) { d.hi.style.outline = ''; }
    document.body.style.userSelect = '';
    var pt = _phPoint(e);
    var phName = window._placeholderNameAtPoint(pt.clientX, pt.clientY) || d.over;
    if (!phName) return;
    var t = window._currentBracketTournament;
    if (!t) return;
    var apply = function () {
      var oktrue = window._substitutePlaceholder(t.id, phName, { displayName: d.name, name: d.name, uid: d.uid }, function () {
        if (typeof window._rerenderBracket === 'function') window._rerenderBracket(String(t.id));
        if (typeof showNotification === 'function') showNotification('Vaga ocupada', _safe(d.name) + ' assumiu a vaga de ' + _safe(phName) + '.', 'success');
      });
      if (!oktrue && typeof showNotification === 'function') showNotification('Vaga não encontrada', 'Não consegui localizar essa vaga na chave.', 'warning');
    };
    if (typeof showConfirmDialog === 'function') {
      showConfirmDialog('Ocupar a vaga?',
        '<div style="text-align:left;line-height:1.8;">' +
          '<div><strong style="color:#94a3b8;">Vaga:</strong> ' + _safe(phName) + '</div>' +
          '<div><strong style="color:#4ade80;">Jogador:</strong> ' + _safe(d.name) + '</div>' +
        '</div>',
        apply, null, { type: 'success', confirmText: 'Confirmar', cancelText: 'Cancelar' });
    } else { apply(); }
  }

  window._wirePlaceholderDnD = function () {
    var t = window._currentBracketTournament;
    if (!t) return;
    if (!(window.AppStore && window.AppStore.isOrganizer && window.AppStore.isOrganizer(t))) return;
    var handles = document.querySelectorAll('[data-ph-drag]');
    for (var i = 0; i < handles.length; i++) {
      var h = handles[i];
      if (h._phWired) continue; h._phWired = true;
      (function (hh) {
        hh.addEventListener('mousedown', function (e) { _phStart(e, hh); });
        hh.addEventListener('touchstart', function (e) { _phStart(e, hh); }, { passive: false });
      })(h);
    }
    if (!window._phDndGlobalWired) {
      window._phDndGlobalWired = true;
      document.addEventListener('mousemove', _phMove);
      document.addEventListener('mouseup', _phEnd);
      document.addEventListener('touchmove', _phMove, { passive: false });
      document.addEventListener('touchend', _phEnd);
    }
  };
})();
