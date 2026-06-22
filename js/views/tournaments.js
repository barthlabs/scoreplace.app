// Dynamically update stat-boxes after participant/waitlist changes
var _t = window._t || function(k) { return k; };

// v2.7.32: handlers de ação do inscrito (remover/split) definidos no NÍVEL DO MÓDULO
// — antes só eram criados dentro de renderTournaments, então abrir a página de
// Inscritos DIRETO (reload / rota direta, sem passar pelo detalhe) deixava
// window.removeParticipantFunction undefined → clicar na lixeira não fazia NADA (nem
// abria a confirmação). Definir aqui garante que existam assim que tournaments.js
// carrega. setupDone=true faz os blocos inline (em renderTournaments) virarem no-op.
window.removeParticipantFunction = function (tId, participantName) {
    showConfirmDialog(
        _t('tourn.removeParticipantTitle'),
        _t('tourn.removeParticipantMsg'),
        () => {
            const t = window._findTournamentById(tId);
            if (t) {
                // v2.7.54: casa nome CRU/FORMATADO (telefone "+5511981933576" vs
                // "+55 (11) 98193-3576") e remove TAMBÉM dos storages da lista de espera
                // — assim o organizador remove qualquer um, inclusive quem só está na espera.
                var _target = String(participantName).trim().toLowerCase();
                var _removedP = null;
                let arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
                var idx = arr.findIndex(function(p, i) {
                    var forms = (typeof window._nameForms === 'function') ? window._nameForms(p) : [String(window._pName(p) || '').toLowerCase()];
                    if (forms.indexOf(_target) !== -1) return true;
                    return ('participante ' + (i + 1)) === _target;
                });
                if (idx !== -1) { _removedP = arr[idx]; arr.splice(idx, 1); t.participants = arr; }
                var _removedFromWait = (typeof window._removeFromWaitlist === 'function') ? window._removeFromWaitlist(t, participantName) : false;
                if (idx === -1 && !_removedFromWait) return; // nada pra remover
                if (_removedP && typeof _removedP === 'object' && _removedP.uid && typeof window._sendUserNotification === 'function') {
                    var _cuRem = window.AppStore && window.AppStore.currentUser;
                    var _remover = (_cuRem && (_cuRem.displayName || _cuRem.email)) || 'o organizador';
                    var _whenStr = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    window._sendUserNotification(_removedP.uid, {
                        type: 'participant_removed',
                        message: 'Você foi removido do torneio "' + (t.name || 'Torneio') + '" por ' + _remover + ' em ' + _whenStr + '.',
                        tournamentId: String(t.id), tournamentName: t.name || '', level: 'fundamental'
                    });
                }
                if (typeof window.FirestoreDB !== 'undefined' && window.FirestoreDB.saveTournament) window.FirestoreDB.saveTournament(t);
                else if (typeof window.AppStore.sync === 'function') window.AppStore.sync();
                const container = document.getElementById('view-container');
                if (container) {
                    if ((window.location.hash || '').indexOf('#participants') === 0 && typeof window.renderParticipants === 'function') window.renderParticipants(container, tId);
                    else if (typeof renderTournaments === 'function') renderTournaments(container, tId);
                }
            }
        },
        null,
        { type: 'danger', confirmText: _t('btn.remove'), cancelText: _t('btn.cancel') }
    );
};
window.splitParticipantFunction = function (tId, participantName) {
    showConfirmDialog(
        _t('tourn.splitTeamTitle'),
        _t('tourn.splitTeamMsg'),
        () => {
            const t = window._findTournamentById(tId);
            if (t && t.participants) {
                let arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
                var idx = arr.findIndex(function(p) { return window._pName(p) === participantName; });
                if (idx === -1) return;
                const pStr = window._pName(arr[idx]);
                if (pStr.includes('/')) {
                    const parts = pStr.split('/').map(s => s.trim());
                    arr.splice(idx, 1);
                    arr.splice(idx, 0, ...parts);
                    t.participants = arr;
                    if (typeof window.FirestoreDB !== 'undefined' && window.FirestoreDB.saveTournament) window.FirestoreDB.saveTournament(t);
                    else if (typeof window.AppStore.sync === 'function') window.AppStore.sync();
                    const container = document.getElementById('view-container');
                    if (container) {
                        if ((window.location.hash || '').indexOf('#participants') === 0 && typeof window.renderParticipants === 'function') window.renderParticipants(container, tId);
                        else if (typeof renderTournaments === 'function') renderTournaments(container, tId);
                    }
                }
            }
        },
        null,
        { type: 'warning', confirmText: _t('btn.undo'), cancelText: _t('btn.keepTeam') }
    );
};

// Self-healing: when enrollments are open (status not 'closed' AND no draw yet),
// the waitlist/standby lists should always be empty. Anyone sitting there from a
// previous closed state gets promoted back to the main roster. Dedupe by
// email/uid/displayName/name. Returns the number of promoted entries.
// Call with { save: true } to persist to Firestore when any promotion happens.
window._drainWaitlistsIfOpen = function(t, opts) {
    if (!t) return 0;
    var hasDraw = (Array.isArray(t.matches) && t.matches.length > 0)
        || (Array.isArray(t.rounds) && t.rounds.length > 0)
        || (Array.isArray(t.groups) && t.groups.length > 0);
    var isReallyOpen = t.status !== 'closed' && t.status !== 'finished' && !hasDraw;
    if (!isReallyOpen) return 0;
    var hasStandby = Array.isArray(t.standbyParticipants) && t.standbyParticipants.length > 0;
    var hasWaitlist = Array.isArray(t.waitlist) && t.waitlist.length > 0;
    if (!hasStandby && !hasWaitlist) return 0;
    if (!Array.isArray(t.participants)) t.participants = t.participants ? Object.values(t.participants) : [];
    var promoted = 0;
    function promote(list) {
        if (!Array.isArray(list) || list.length === 0) return;
        list.forEach(function(sp) {
            var spEmail = (sp && sp.email) || '';
            var spUid = (sp && sp.uid) || '';
            var spName = (sp && (sp.displayName || sp.name)) || (typeof sp === 'string' ? sp : '');
            var already = t.participants.some(function(p) {
                if (typeof p === 'string') return (spEmail && p === spEmail) || (spName && p === spName);
                return (p.email && spEmail && p.email === spEmail)
                    || (p.uid && spUid && p.uid === spUid)
                    || (p.displayName && spName && p.displayName === spName)
                    || (p.name && spName && p.name === spName);
            });
            if (!already) { t.participants.push(sp); promoted++; }
        });
    }
    promote(t.standbyParticipants);
    promote(t.waitlist);
    t.standbyParticipants = [];
    t.waitlist = [];
    if (opts && opts.save && window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
        window.FirestoreDB.saveTournament(t).catch(function() {});
    }
    if (promoted > 0 && window.AppStore && typeof window.AppStore.logAction === 'function') {
        window.AppStore.logAction(t.id, promoted + ' participante(s) promovido(s) da lista de espera (inscrições abertas)');
    }
    return promoted;
};
window._updateStatBoxes = function(t) {
    var row = document.getElementById('stat-boxes-row');
    if (!row || !t) return;

    // Recount individuals — usa _getCompetitors (mesma lista do render inicial,
    // exclui org/cohost phantom solo mas mantém times) e conta MEMBROS:
    // 1 dupla = 1 equipe = 2 inscritos. Antes contava dupla-objeto como 1.
    var parts = (typeof window._getCompetitors === 'function')
        ? window._getCompetitors(t)
        : (Array.isArray(t.participants) ? t.participants : []);
    var indivCount = 0;
    var teamCount = 0;
    parts.forEach(function(p) {
        if (typeof p === 'object' && p !== null && Array.isArray(p.participants) && p.participants.length > 0) {
            teamCount++;
            indivCount += p.participants.length;
        } else {
            var nm = (typeof window._pName === 'function') ? window._pName(p) : (typeof p === 'string' ? p : ((p && (p.displayName || p.name)) || ''));
            if (nm && nm.indexOf('/') !== -1) {
                teamCount++;
                indivCount += nm.split('/').filter(function(n) { return n.trim().length > 0; }).length;
            } else if (p && typeof p === 'object' && p.p1Name && p.p2Name) {
                teamCount++;
                indivCount += 2;
            } else {
                indivCount++;
            }
        }
    });
    if (Array.isArray(t.waitlist)) indivCount += t.waitlist.length;

    // Update inscritos count
    var inscBox = row.querySelector('[data-stat="inscritos"] .stat-value');
    if (inscBox) inscBox.textContent = indivCount;

    // Update equipes count (se o box existir)
    var eqBox = row.querySelector('[data-stat="equipes"] .stat-value');
    if (eqBox) eqBox.textContent = teamCount;

    // Waitlist count
    var wlCount = (Array.isArray(t.standbyParticipants) ? t.standbyParticipants.length : 0)
        + (Array.isArray(t.waitlist) ? t.waitlist.length : 0);

    var wlBox = row.querySelector('[data-stat="waitlist"]');
    if (wlCount > 0 && !wlBox) {
        // Insert waitlist stat-box
        var div = document.createElement('div');
        div.className = 'stat-box';
        div.setAttribute('data-stat', 'waitlist');
        div.style.cssText = 'background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3);';
        div.innerHTML =
            '<span style="font-size: 1.1rem; margin-right: 4px;">⏳</span>' +
            '<span class="stat-value" style="font-size: 1.4rem; font-weight: 800; line-height: 1; color: #fbbf24;">' + wlCount + '</span>' +
            '<span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-left: 8px; color: #fbbf24; opacity: 0.9;">Lista de Espera</span>';
        row.appendChild(div);
    } else if (wlCount > 0 && wlBox) {
        var wlVal = wlBox.querySelector('.stat-value');
        if (wlVal) wlVal.textContent = wlCount;
    } else if (wlCount === 0 && wlBox) {
        wlBox.remove();
    }
};

// v2.1.16: Pódio do torneio encerrado — 1º lugar em cima (mais alto), 2º e 3º
// dividindo a linha de baixo ao meio (quase um pódio). Usado no topo do card.
window._buildPodiumHtml = function(p1, p2, p3, sub1, sub2, sub3) {
  var _sh = window._safeHtml || function(s){ return String(s == null ? '' : s); };
  if (!p1) return '';
  sub1 = sub1 || 'Campeão';
  sub2 = sub2 || '2º Lugar';
  sub3 = sub3 || '3º Lugar';
  var second = p2 ? (
    '<div style="flex:1;text-align:center;min-width:0;">' +
      '<div style="font-size:2rem;line-height:1;">🥈</div>' +
      '<div style="font-weight:700;color:#cbd5e1;font-size:1rem;margin-top:3px;word-break:break-word;">' + _sh(p2) + '</div>' +
      '<div style="font-size:0.72rem;color:var(--text-muted);">' + _sh(sub2) + '</div>' +
    '</div>'
  ) : '';
  var third = p3 ? (
    '<div style="flex:1;text-align:center;min-width:0;">' +
      '<div style="font-size:1.7rem;line-height:1;">🥉</div>' +
      '<div style="font-weight:700;color:#cd7f32;font-size:0.95rem;margin-top:3px;word-break:break-word;">' + _sh(p3) + '</div>' +
      '<div style="font-size:0.72rem;color:var(--text-muted);">' + _sh(sub3) + '</div>' +
    '</div>'
  ) : '';
  var bottomRow = (second || third)
    ? ('<div style="display:flex;gap:1rem;justify-content:center;align-items:flex-start;">' + second + third + '</div>')
    : '';
  return '<div style="text-align:center;margin:0 0 1.25rem 0;padding:1.5rem 1.25rem;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);border-radius:16px;">' +
    '<div style="font-size:1.35rem;font-weight:700;margin-bottom:1.1rem;color:#fff;">🏆 Torneio Encerrado</div>' +
    '<div style="text-align:center;margin-bottom:1.1rem;">' +
      '<div style="font-size:3rem;line-height:1;">🥇</div>' +
      '<div style="font-weight:800;color:#fbbf24;font-size:1.3rem;margin-top:5px;word-break:break-word;">' + _sh(p1) + '</div>' +
      '<div style="font-size:0.8rem;color:#fbbf24;font-weight:600;">' + _sh(sub1) + '</div>' +
    '</div>' +
    bottomRow +
  '</div>';
};

// v1.9.97: "Ver Chaves" NÃO navega mais pra tela restrita (#bracket/:id) —
// rola pra seção do chaveamento que JÁ está renderizada na página de detalhes
// (#inline-bracket-container). Posicionamento inteligente:
//   - Organizador → próximo jogo a ser realizado (o primeiro jogável na ordem
//     da chave).
//   - Participante → próximo jogo DELE (primeiro jogável em que ele está).
// Jogável = sem vencedor, não é BYE, e ambos os lados preenchidos (não TBD).
// Fallback seguro: se o bracket inline não existir (sem sorteio, ou chamado de
// um contexto sem a seção), navega pra #bracket/:id como antes — nada quebra.
// v2.0.8: aceita matchId opcional (rola direto pra esse jogo). A página de
// chaveamento standalone foi removida — o fallback agora navega pro DETALHE
// (#tournaments/:id) com uma flag de scroll, nunca mais pra #bracket/:id.
window._goToTournamentMatch = function(tId, matchId) {
  try { sessionStorage.setItem('sp_bracketScroll', JSON.stringify({ tId: String(tId), matchId: matchId ? String(matchId) : null })); } catch(e) {}
  window.location.hash = '#tournaments/' + tId;
};

window._scrollToBracketSection = function(tId, matchId) {
  var t = window.AppStore && window.AppStore.tournaments &&
          window.AppStore.tournaments.find(function(x){ return String(x.id) === String(tId); });
  var container = document.getElementById('inline-bracket-container');
  if (!t || !container) {
    // Detalhe ainda não está na tela → navega pra lá e deixa a flag pro render rolar.
    window._goToTournamentMatch(tId, matchId);
    return;
  }
  // Jogo específico pedido (ex.: "Ir para Torneio" de um card de resultado).
  if (matchId) {
    var _specific = document.getElementById('card-' + matchId);
    if (_specific) {
      try { _specific.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); }
      catch (e) { _specific.scrollIntoView(); }
      return;
    }
  }
  var cu = window.AppStore && window.AppStore.currentUser;
  var isOrg = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));
  var matches = (typeof window._collectAllMatches === 'function')
    ? window._collectAllMatches(t) : (t.matches || []);
  var playable = {}, mine = {};
  matches.forEach(function(m){
    if (!m || m.winner || m.isBye) return;
    if (!m.p1 || m.p1 === 'TBD' || !m.p2 || m.p2 === 'TBD') return;
    playable[String(m.id)] = true;
    if (cu && typeof window._userTeamInMatch === 'function' && window._userTeamInMatch(t, m, cu) > 0) {
      mine[String(m.id)] = true;
    }
  });
  // Encontra o card alvo na ORDEM do DOM (= ordem da chave: rodadas da esquerda
  // pra direita, de cima pra baixo). Participante: 1º jogo jogável dele.
  var cards = container.querySelectorAll('[id^="card-"]');
  var target = null, i, id;
  if (!isOrg) {
    for (i = 0; i < cards.length; i++) { id = cards[i].id.slice(5); if (mine[id]) { target = cards[i]; break; } }
  }
  if (!target) {
    for (i = 0; i < cards.length; i++) { id = cards[i].id.slice(5); if (playable[id]) { target = cards[i]; break; } }
  }
  var dest = target || container;
  try {
    dest.scrollIntoView({ behavior: 'smooth', block: target ? 'center' : 'start', inline: 'center' });
  } catch (e) {
    dest.scrollIntoView();
  }
};

// v2.7.85: funções de DUPLA em escopo de módulo (disponíveis no load — dashboard + drag).
// Forma a dupla de fato (caminho canônico, reusado por organizador e por aceite de convite).
window._formDuplaByUids = function(tId, name1, uid1, name2, uid2) {
    var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
    if (!t) return;
    var arr2 = Array.isArray(t.participants) ? t.participants : [];
    var fi1 = arr2.findIndex(function(p) { return uid1 ? (typeof p === 'object' && p.uid === uid1) : ((typeof p === 'string' ? p : (p.displayName||p.name||'')) === name1); });
    var fi2 = arr2.findIndex(function(p) { return uid2 ? (typeof p === 'object' && p.uid === uid2) : ((typeof p === 'string' ? p : (p.displayName||p.name||'')) === name2); });
    if (fi1 === -1 || fi2 === -1 || fi1 === fi2) return;
    var _p1 = arr2[fi1]; var _p2 = arr2[fi2];
    var _u1 = uid1 || (typeof _p1==='object' ? (_p1.uid||'') : '');
    var _u2 = uid2 || (typeof _p2==='object' ? (_p2.uid||'') : '');
    // v2.7.97: preserva o nº de inscrição ORIGINAL de cada membro (p1Seq/p2Seq) =
    // o enrollSeq que cada um tinha como solo, pra o card da dupla mostrar os dois.
    if (window._ensureEnrollSeqs) window._ensureEnrollSeqs(t);
    var _seq1 = (_p1 && typeof _p1==='object' && _p1.enrollSeq != null) ? _p1.enrollSeq : null;
    var _seq2 = (_p2 && typeof _p2==='object' && _p2.enrollSeq != null) ? _p2.enrollSeq : null;
    var newName = name1 + ' / ' + name2;
    var merged = { displayName: newName, name: newName, uid: _u1 || _u2 || '', p1Name: name1, p1Uid: _u1, p2Name: name2, p2Uid: _u2, p1Seq: _seq1, p2Seq: _seq2, ligaActive: true };
    var maxI = Math.max(fi1, fi2), minI = Math.min(fi1, fi2);
    arr2.splice(maxI, 1); arr2.splice(minI, 1); arr2.splice(minI, 0, merged);
    t.participants = arr2;
    if (!t.teamOrigins) t.teamOrigins = {};
    t.teamOrigins[newName] = 'formada';
    if (window._teamFormation && _u1 && _u2) window._teamFormation.dropRequestsInvolving(t, [_u1, _u2]);
    t.updatedAt = new Date().toISOString();
    window.FirestoreDB.saveTournament(t);
    if (typeof showNotification !== 'undefined') showNotification('👫 Dupla formada!', newName, 'success');
    if (_u2 && _u2 !== _u1 && typeof window._sendUserNotification === 'function') {
        var cu = window.AppStore.currentUser;
        window._sendUserNotification(_u2, { type: 'enrollment_new', title: '🤝 Dupla formada!', message: (cu && cu.displayName ? cu.displayName : 'O organizador') + ' formou dupla com você em ' + window._safeHtml(t.name || '') + ': ' + window._safeHtml(newName), tournamentId: String(t.id), tournamentName: t.name || '', level: 'fundamental' });
    }
    if (typeof window._softRefreshView === 'function') window._softRefreshView();
};
// Mensagens PT pros códigos de erro da máquina de pendência.
window._pairErrorMsg = function(code) {
    var m = {
        'participante-sem-permissao': 'Neste torneio, só o organizador forma as duplas.',
        'voce-ja-em-dupla': 'Você já está em uma dupla.',
        'alvo-ja-em-dupla': 'Essa pessoa já está em uma dupla.',
        'iniciante-ja-em-dupla': 'Quem te convidou já entrou em outra dupla.',
        'ja-tem-convite-pendente': 'Você já tem um convite pendente. Cancele-o antes de enviar outro.',
        'convite-ja-enviado': 'Convite já enviado para essa pessoa.',
        'nao-e-o-convidado': 'Só quem recebeu o convite pode aceitar.',
        'convite-nao-encontrado': 'Convite não encontrado (talvez já tenha sido respondido).',
        'sem-permissao': 'Você não pode cancelar este convite.',
        'mesma-pessoa': 'Selecione duas pessoas diferentes.',
        'nao-duplas': 'Este torneio não é de duplas.',
        'inscrito-nao-encontrado': 'Inscrito não encontrado.'
    };
    return m[code] || code;
};
// Aceitar um convite de dupla pendente (alvo) → forma via caminho canônico + comunicados.
window._acceptPairRequest = function(tId, reqId) {
    var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
    if (!t || !window._teamFormation) return;
    var myUid = (window.AppStore.currentUser || {}).uid;
    var res = window._teamFormation.acceptPair(t, reqId, myUid);
    if (!res.ok) {
        if (typeof showNotification !== 'undefined') showNotification('Não foi possível', window._pairErrorMsg(res.error), 'warning');
        if (typeof window._softRefreshView === 'function') window._softRefreshView();
        return;
    }
    window._formDuplaByUids(tId, res.inviterName, res.inviterUid, res.inviteeName, res.inviteeUid);
    // v2.7.84: comunicados de ACEITE — pro convidante (fundamental) + formação da dupla
    // pra todos os inscritos (caráter geral).
    var _t2 = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
    var _newTeam = (res.inviterName || '') + ' / ' + (res.inviteeName || '');
    if (res.inviterUid && typeof window._sendUserNotification === 'function') {
        window._sendUserNotification(res.inviterUid, { type: 'enrollment_new', title: '✅ Dupla aceita!', message: window._safeHtml(res.inviteeName || '') + ' aceitou formar dupla com você em ' + window._safeHtml((_t2 && _t2.name) || '') + ': ' + window._safeHtml(_newTeam), tournamentId: String(tId), tournamentName: (_t2 && _t2.name) || '', level: 'fundamental' });
    }
    if (_t2 && typeof window._notifyTournamentParticipants === 'function') {
        window._notifyTournamentParticipants(_t2, { type: 'enrollment_new', title: '👫 Nova dupla formada', message: 'A dupla ' + window._safeHtml(_newTeam) + ' foi formada em ' + window._safeHtml(_t2.name || '') + '.', tournamentId: String(tId), tournamentName: _t2.name || '', level: 'all' });
    }
};
// Cancelar/recusar um convite de dupla pendente (iniciante ou alvo).
window._cancelPairRequest = function(tId, reqId) {
    var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
    if (!t || !window._teamFormation) return;
    var myUid = (window.AppStore.currentUser || {}).uid;
    var res = window._teamFormation.cancelPair(t, reqId, myUid);
    if (!res.ok) { if (typeof showNotification !== 'undefined') showNotification('Não foi possível', window._pairErrorMsg(res.error), 'warning'); return; }
    t.updatedAt = new Date().toISOString();
    window.FirestoreDB.saveTournament(t);
    if (typeof showNotification !== 'undefined') showNotification('Convite cancelado', '', 'info');
    if (typeof window._softRefreshView === 'function') window._softRefreshView();
};

// v2.7.94: deep-link dos botões Aceitar/Recusar do EMAIL e do WHATSAPP.
// #pair/<accept|reject>/<tId>/<reqId> → executa a ação e pula pro torneio (card).
// Segurança: _acceptPairRequest/_cancelPairRequest já verificam que o usuário logado
// é o convidado/convidante (via currentUser.uid). Deslogado → guarda a intenção e abre
// o torneio (gate de login); auth.js retoma após o login (sp_pendingPairAction).
window._pairActionFromLink = async function(act, tId, reqId) {
    act = (act === 'accept') ? 'accept' : 'reject';
    if (!tId || !reqId) { window.location.hash = '#dashboard'; return; }
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) {
        try { sessionStorage.setItem('sp_pendingPairAction', JSON.stringify({ act: act, tId: String(tId), reqId: String(reqId) })); } catch (e) {}
        window.location.hash = '#tournaments/' + tId;
        return;
    }
    var _find = function () { return (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); }); };
    var t = _find();
    // logo após o login o realtime listener pode não ter populado ainda — espera um pouco.
    for (var i = 0; i < 12 && !t; i++) { await new Promise(function (r) { setTimeout(r, 250); }); t = _find(); }
    if (!t && window.FirestoreDB && typeof window.FirestoreDB.getTournament === 'function') {
        try { var doc = await window.FirestoreDB.getTournament(tId); if (doc) { (window.AppStore.tournaments = window.AppStore.tournaments || []).push(doc); t = doc; } } catch (e) {}
    }
    if (!t) { if (typeof showNotification !== 'undefined') showNotification('Torneio não encontrado', 'Abra pelo app.', 'warning'); window.location.hash = '#tournaments/' + tId; return; }
    if (act === 'accept') window._acceptPairRequest(String(tId), String(reqId));
    else window._cancelPairRequest(String(tId), String(reqId));
    try { sessionStorage.setItem('sp_scrollToMyCard', '1'); } catch (e) {}
    window.location.hash = '#tournaments/' + tId;
};

// v2.8.52: #cohost/<accept|reject>/<tId>/<type> → aceita/recusa o convite de
// co-organização. _acceptHostInvite/_rejectHostInvite já leem fresh do Firestore e
// validam pelo usuário logado. Deslogado → guarda a intenção (sp_pendingCohostAction)
// e abre o torneio (gate de login); auth.js retoma após o login.
window._coHostActionFromLink = async function(act, tId, inviteType) {
    act = (act === 'accept') ? 'accept' : 'reject';
    inviteType = (inviteType === 'transfer') ? 'transfer' : 'cohost';
    if (!tId) { window.location.hash = '#dashboard'; return; }
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) {
        try { sessionStorage.setItem('sp_pendingCohostAction', JSON.stringify({ act: act, tId: String(tId), inviteType: inviteType })); } catch (e) {}
        window.location.hash = '#tournaments/' + tId;
        return;
    }
    if (act === 'accept') { if (typeof window._acceptHostInvite === 'function') window._acceptHostInvite(String(tId), inviteType); }
    else { if (typeof window._rejectHostInvite === 'function') window._rejectHostInvite(String(tId), inviteType); }
    window.location.hash = '#tournaments/' + tId;
};

function renderTournaments(container, tournamentId = null) {
    if (!window.AppStore) return;
    // Clear one-time check flags for OTHER tournaments (keep current)
    if (tournamentId) {
        var _curKey = '_tournChecks_' + tournamentId;
        Object.keys(window).forEach(function(k) {
            if (k.indexOf('_tournChecks_') === 0 && k !== _curKey) delete window[k];
        });
    }
    var _t = window._t || function(k) { return k; };

    // v2.4.13: se o perfil ainda não terminou de carregar, o botão de inscrição
    // renderiza como "⏳ Carregando…" desabilitado (gate _profileReady abaixo).
    // venues/dashboard/auth re-renderizam ao evento scoreplace:profile-loaded —
    // a view de torneio NÃO escutava, então o botão ficava travado em "Carregando…"
    // ("fica processando e não inscreve") até um snapshot não-relacionado disparar
    // _softRefreshView. Sob carga (torneio com muitos inscritos satura as reads e
    // atrasa o loadUserProfile), essa janela pode ser longa. Listener one-shot +
    // safety-net espelham o padrão canônico do venues.js (v0.17.3).
    var _cuTourn = window.AppStore && window.AppStore.currentUser;
    if (_cuTourn && _cuTourn._profileLoaded !== true && !window._tournWaitingForProfile) {
      window._tournWaitingForProfile = true;
      var _onTournProfile = function() {
        window._tournWaitingForProfile = false;
        var _h = window.location.hash || '';
        if (_h.indexOf('#tournaments') === 0) {
          try { if (typeof window._softRefreshView === 'function') window._softRefreshView(); } catch (e) {}
        }
      };
      document.addEventListener('scoreplace:profile-loaded', _onTournProfile, { once: true });
      setTimeout(function() {
        if (window._tournWaitingForProfile) {
          window._tournWaitingForProfile = false;
          var _h = window.location.hash || '';
          if (_h.indexOf('#tournaments') === 0) {
            try { if (typeof window._softRefreshView === 'function') window._softRefreshView(); } catch (e) {}
          }
        }
      }, 5000);
    }

    let visible = window.AppStore.getVisibleTournaments() || [];

    // ── Drag-drop para formar duplas na seção "Sem Dupla" ─────────────────
    window._duplaDragStart = function(evt, uidOrName, tId) {
        evt.dataTransfer.setData('text/plain', JSON.stringify({ uidOrName: uidOrName, tId: tId }));
        evt.dataTransfer.effectAllowed = 'move';
        // v2.7.89: guarda onde o card foi pego (centra a seção compacta nesse ponto).
        window._spDragPickY = (typeof evt.clientY === 'number' && evt.clientY > 0) ? evt.clientY : (window.innerHeight / 2);
        // v2.7.86/87: esconde o card arrastado + compacta os outros (drop mais perto).
        setTimeout(function () { if (window._markDragSource) window._markDragSource(evt.target); if (window._setDragCompact) window._setDragCompact(true); }, 0);
        // v2.8.50: TAMBÉM popular _participantDragData + ativar a vaga de co-organização.
        // Sem isto, arrastar um card "Sem dupla" pra vaga de co-org lia null e "nada
        // acontecia" (só _duplaDragData era setado, que serve pra parear, não pra co-org).
        try {
          var _td = (window.AppStore && window.AppStore.tournaments || []).find(function(x){ return String(x.id) === String(tId); });
          var _pd = null;
          if (_td && Array.isArray(_td.participants)) {
            _pd = _td.participants.find(function(p){
              if (!p || typeof p !== 'object') return false;
              return (p.uid && p.uid === uidOrName) || ((p.displayName || p.name) === uidOrName) || (p.email && p.email === uidOrName);
            });
          }
          window._participantDragData = (_pd && typeof _pd === 'object') ? _pd : { displayName: uidOrName, name: uidOrName };
          window._participantDragTId = tId;
          if (window._setOrgDropActive) window._setOrgDropActive(true);
        } catch (e) {}
    };

    window._duplaDropOn = function(evt, targetUidOrName, tId) {
        var raw = evt.dataTransfer.getData('text/plain');
        if (!raw) return;
        var data;
        try { data = JSON.parse(raw); } catch(e) { return; }
        var sourceUidOrName = data.uidOrName;
        if (!sourceUidOrName || sourceUidOrName === targetUidOrName) return;

        var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
        if (!t) return;
        var arr = Array.isArray(t.participants) ? t.participants : [];

        function findP(uidOrName) {
            // Busca por uid primeiro, depois por nome
            var byUid = arr.findIndex(function(p) { return typeof p === 'object' && p && p.uid === uidOrName; });
            if (byUid !== -1) return byUid;
            return arr.findIndex(function(p) {
                var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
                return n === uidOrName;
            });
        }

        var i1 = findP(sourceUidOrName);
        var i2 = findP(targetUidOrName);
        if (i1 === -1 || i2 === -1 || i1 === i2) return;

        var p1 = arr[i1], p2 = arr[i2];
        var name1 = typeof p1 === 'string' ? p1 : (p1.displayName || p1.name || '');
        var name2 = typeof p2 === 'string' ? p2 : (p2.displayName || p2.name || '');
        if (!name1 || !name2 || name1.includes('/') || name2.includes('/')) return;

        var uid1 = typeof p1 === 'object' ? (p1.uid || '') : '';
        var uid2 = typeof p2 === 'object' ? (p2.uid || '') : '';
        // v1.8.88: se sourceUidOrName é um uid real (não um nome), usá-lo
        if (!uid1 && sourceUidOrName && !sourceUidOrName.includes(' ')) uid1 = sourceUidOrName;
        if (!uid2 && targetUidOrName && !targetUidOrName.includes(' ')) uid2 = targetUidOrName;

        var isOrg = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));

        // ── v2.7.78: CANONIZADO — mesmo fluxo do drag de card (handleDropTeam).
        //    Organizador → overlay (🔵 Formar equipe / 🔴 Mesclar / Cancelar);
        //    participante → pareia a si mesmo (convite com aceite). Sem confirm
        //    avulso "Formar dupla?" que destoava do resto.
        var _hasMatchesDD = (Array.isArray(t.matches) && t.matches.length) ||
                            (Array.isArray(t.rounds) && t.rounds.length) ||
                            (Array.isArray(t.groups) && t.groups.length);
        if (isOrg) {
            if (typeof window._showDropChoiceOverlay === 'function') {
                window._showDropChoiceOverlay({
                    tId: tId,
                    sourceName: name1, sourceUid: uid1,
                    targetName: name2, targetUid: uid2,
                    ruleAllowsTeam: (t.enrollmentMode !== 'individual'),
                    drawDone: !!_hasMatchesDD || t.status === 'started' || t.status === 'in_progress',
                    canMerge: (!!uid1) !== (!!uid2)
                });
            }
            return;
        }
        // Participante: pareia A SI MESMO (convite pendente que o parceiro aceita).
        if (typeof window._participantSelfPair === 'function') window._participantSelfPair(tId, name1, uid1, name2, uid2);
    };

    // v2.7.85: _formDuplaByUids / _pairErrorMsg / _acceptPairRequest / _cancelPairRequest
    // foram movidos pra ESCOPO DE MÓDULO (logo antes de renderTournaments) — antes só
    // existiam DEPOIS de abrir um torneio (eram atribuídos dentro de renderTournaments),
    // então o botão Confirmar/Cancelar no DASHBOARD quebrava. Agora estão no load.

    // Desfazer dupla: separa "Nome1 / Nome2" de volta em dois inscritos solo
    window._splitDupla = function(tId, teamName) {
        var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
        if (!t) return;
        var arr = Array.isArray(t.participants) ? t.participants : [];

        var idx = arr.findIndex(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            return n === teamName;
        });
        if (idx === -1) return;

        var entry = arr[idx];
        // Extrair os dois nomes e uids armazenados na entrada — v2.7.90: p1Name/p2Name
        // primeiro; split " / " só como fallback. Antes, dupla com displayName sem "/"
        // (ex.: "Kelly Barth") batia em parts.length<2 e o Desfazer não fazia nada.
        var nm = typeof entry === 'string' ? entry : (entry.displayName || entry.name || '');
        var parts = nm.split(' / ');
        var p1Name = (entry.p1Name || parts[0] || '').trim();
        var p2Name = (entry.p2Name || parts[1] || '').trim();
        if (!p1Name || !p2Name) return;
        var p1Uid  = entry.p1Uid || '';
        var p2Uid  = entry.p2Uid || '';

        // Criar entradas limpas para cada membro — v2.7.97: restaura o nº de inscrição
        // original (enrollSeq) que cada um tinha antes de formar a dupla.
        var solo1 = p1Uid ? { displayName: p1Name, name: p1Name, uid: p1Uid, ligaActive: true, enrollSeq: (entry.p1Seq != null ? entry.p1Seq : undefined) } : p1Name;
        var solo2 = p2Uid ? { displayName: p2Name, name: p2Name, uid: p2Uid, ligaActive: true, enrollSeq: (entry.p2Seq != null ? entry.p2Seq : undefined) } : p2Name;

        arr.splice(idx, 1, solo1, solo2);
        t.participants = arr;
        t.updatedAt = new Date().toISOString();

        window.FirestoreDB.saveTournament(t).then(function() {
            if (typeof showNotification !== 'undefined') showNotification('↩️ Dupla desfeita', p1Name + ' e ' + p2Name + ' voltaram para Sem Dupla.', 'info');
            if (typeof window._softRefreshView === 'function') window._softRefreshView();
        });
    };

    // Inscrever solo em torneio de duplas (sem parceiro definido) — mantido para compat
    window._enrollSoloInDoubles = function(tId) {
        var mod = document.getElementById('team-enroll-modal-' + tId);
        if (mod) mod.style.display = 'none';
        if (typeof window._doEnrollCurrentUser === 'function') {
            window._doEnrollCurrentUser(tId, null);
        }
    };

    // _showPartnerPicker removido — duplas agora são formadas pelo
    // arrastar e soltar na seção "Sem Dupla" do torneio (v1.8.81)
    window._showPartnerPicker = function(tId) { /* removido */ };

    // Auto-mover participantes solo para waitlist antes do sorteio em torneios de duplas
    window._autoMoveSoloToWaitlist = function(t) {
        if (!t) return 0;
        var enrollmentMode = t.enrollmentMode || t.enrollment || 'individual';
        var teamSize = parseInt(t.teamSize) || 1;
        if (!((enrollmentMode === 'time' || enrollmentMode === 'misto') && teamSize === 2)) return 0;

        var parts = Array.isArray(t.participants) ? t.participants : [];
        var solo = parts.filter(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            return n && !n.includes('/');
        });
        if (solo.length === 0) return 0;

        // Remove solos dos participants e adiciona à waitlist
        t.participants = parts.filter(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            return !n || n.includes('/');
        });
        if (!Array.isArray(t.waitlist)) t.waitlist = [];
        solo.forEach(function(p) {
            // Evita duplicata na waitlist
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            var already = t.waitlist.some(function(w) {
                var wn = typeof w === 'string' ? w : (w.displayName || w.name || '');
                return wn === n;
            });
            if (!already) t.waitlist.push(p);
        });
        return solo.length;
    };

    // Move jogadores marcados como ausentes (W.O.) de t.participants para
    // t.standbyParticipants antes do sorteio, para que o bracket não os inclua.
    // Eles ficam disponíveis para substituição durante o torneio.
    window._autoMoveAbsentToStandby = function(t) {
        if (!t || !t.absent || Object.keys(t.absent).length === 0) return 0;
        var absentMap = t.absent;
        var parts = Array.isArray(t.participants) ? t.participants : [];
        var toMove = parts.filter(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            return n && absentMap.hasOwnProperty(n);
        });
        if (toMove.length === 0) return 0;
        var moveSet = {};
        toMove.forEach(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            if (n) moveSet[n] = true;
        });
        t.participants = parts.filter(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            return !n || !moveSet[n];
        });
        if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
        toMove.forEach(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            var already = t.standbyParticipants.some(function(w) {
                var wn = typeof w === 'string' ? w : (w.displayName || w.name || '');
                return wn === n;
            });
            if (!already) t.standbyParticipants.push(p);
        });
        return toMove.length;
    };

    // v2.2.39: "Garantir sorteio só entre os presentes" — move todos os NÃO
    // presentes (sem check-in OU marcados ausentes) de t.participants para a
    // lista de espera, para que o sorteio inclua apenas quem fez a chamada.
    // Ausentes podem voltar depois (regra de 4 presentes acumulados na espera).
    // "Presente" = NÃO ausente E (nome com check-in direto OU, sendo dupla
    // "A / B", todos os membros com check-in) — espelha a regra canônica de
    // presença de equipe usada na substituição (participants.js).
    window._isParticipantPresent = function(t, name) {
        if (!t || !name) return false;
        var ci = t.checkedIn || {}, ab = t.absent || {};
        if (ab[name]) return false;
        if (ci[name]) return true;
        if (name.indexOf('/') !== -1) {
            var members = name.split('/').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
            if (members.length >= 2 && members.every(function(m) { return !!ci[m]; })) return true;
        }
        return false;
    };

    window._moveAbsentToWaitlistForPresentDraw = function(t) {
        if (!t) return 0;
        var parts = Array.isArray(t.participants) ? t.participants : [];
        var _nm = function(p) { return typeof p === 'string' ? p : (p && (p.displayName || p.name) || ''); };
        var notPresent = parts.filter(function(p) {
            var n = _nm(p);
            return n && !window._isParticipantPresent(t, n);
        });
        if (notPresent.length === 0) return 0;
        var moveSet = {};
        notPresent.forEach(function(p) { var n = _nm(p); if (n) moveSet[n] = true; });
        t.participants = parts.filter(function(p) { var n = _nm(p); return !n || !moveSet[n]; });
        if (!Array.isArray(t.waitlist)) t.waitlist = [];
        notPresent.forEach(function(p) {
            var n = _nm(p);
            var already = t.waitlist.some(function(w) { return _nm(w) === n; });
            if (!already) t.waitlist.push(p);
        });
        return notPresent.length;
    };

    // v2.2.39: diálogo de escolha do modo de sorteio quando as inscrições
    // seguem ABERTAS após o sorteio. Organizador escolhe entre sortear com
    // todos (antes da chamada) ou garantir o sorteio só entre os presentes.
    window._showPresenceDrawChoice = function(tId, startDraw) {
        var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
        if (!t) return;
        // v2.8.4: Liga/Pontos Corridos NÃO tem chamada/presença — é multi-dia, normalmente
        // auto-draw, ninguém "presente". O sorteio é entre TODOS OS ATIVOS (ligaActive) e
        // quem não fecha grupo de 4 (Rei/Rainha) vai pra lista de espera (o motor de rodada
        // já faz isso). O diálogo "Sortear com todos / Só entre os presentes" só faz sentido
        // em torneio PRESENCIAL de 1 dia (Eliminatórias / Fase de Grupos). Pular pra Liga.
        if (window._isLigaFormat && window._isLigaFormat(t)) { if (typeof startDraw === 'function') startDraw(); return; }
        var existing = document.getElementById('presence-draw-choice');
        if (existing) existing.remove();
        var dialog = document.createElement('div');
        dialog.id = 'presence-draw-choice';
        dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100010;';
        dialog.innerHTML =
            '<div style="background:var(--surface-color);border:1px solid var(--border-color);border-radius:16px;max-width:440px;width:90%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
              '<div style="background:rgba(59,130,246,0.1);border-bottom:1px solid var(--border-color);padding:1.25rem;display:flex;align-items:center;gap:12px;">' +
                '<span style="font-size:2rem;">🎲</span>' +
                '<div style="font-size:1.1rem;font-weight:700;color:var(--text-color);">Como deseja sortear?</div>' +
              '</div>' +
              '<div style="padding:1.1rem 1.25rem 0.5rem;color:var(--text-muted);font-size:0.92rem;line-height:1.55;">' +
                'As inscrições continuarão <b>abertas</b> após o sorteio. Escolha como montar a chave:' +
              '</div>' +
              '<div style="padding:0.75rem 1.25rem 1.25rem;display:flex;flex-direction:column;gap:10px;">' +
                '<button id="pdc-all" style="text-align:left;background:rgba(255,255,255,0.06);color:var(--text-main);border:1px solid rgba(255,255,255,0.15);padding:13px 16px;font-weight:600;font-size:0.92rem;border-radius:12px;cursor:pointer;line-height:1.4;">' +
                  '🎲 Sortear com todos<br><span style="font-weight:400;font-size:0.82rem;color:var(--text-muted);">Inclui todos os inscritos, presentes ou não (antes da chamada).</span>' +
                '</button>' +
                '<button id="pdc-present" style="text-align:left;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:13px 16px;font-weight:700;font-size:0.92rem;border-radius:12px;cursor:pointer;line-height:1.4;">' +
                  '✅ Só entre os presentes<br><span style="font-weight:400;font-size:0.82rem;color:rgba(255,255,255,0.85);">Ausentes vão para a lista de espera; entram depois quando 4 presentes se acumularem.</span>' +
                '</button>' +
                '<button id="pdc-cancel" style="background:transparent;color:var(--text-muted);border:none;padding:8px;font-weight:600;font-size:0.88rem;cursor:pointer;">Cancelar</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(dialog);
        var close = function() { dialog.remove(); };
        dialog.querySelector('#pdc-cancel').addEventListener('click', close);
        dialog.querySelector('#pdc-all').addEventListener('click', function() {
            close();
            startDraw();
        });
        dialog.querySelector('#pdc-present').addEventListener('click', function() {
            var tt = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
            if (!tt) { close(); return; }
            var _nm = function(p) { return typeof p === 'string' ? p : (p && (p.displayName || p.name) || ''); };
            var parts = Array.isArray(tt.participants) ? tt.participants : [];
            var presentCount = parts.filter(function(p) { return window._isParticipantPresent(tt, _nm(p)); }).length;
            if (presentCount < 2) {
                if (typeof showNotification !== 'undefined') {
                    showNotification('⚠️ Poucos presentes', 'Marque pelo menos 2 participantes presentes (check-in) antes de sortear só entre os presentes.', 'warning');
                }
                close();
                return;
            }
            var moved = window._moveAbsentToWaitlistForPresentDraw(tt);
            close();
            var proceed = function() {
                if (moved > 0 && typeof showNotification !== 'undefined') {
                    showNotification('✅ Sorteio entre presentes', moved + ' ausente(s) enviado(s) para a lista de espera.', 'info');
                }
                startDraw();
            };
            // persiste ANTES de sortear — senão o onSnapshot devolve os ausentes
            if (moved > 0 && window.AppStore && typeof window.AppStore.syncImmediate === 'function') {
                Promise.resolve(window.AppStore.syncImmediate(tId)).then(proceed).catch(proceed);
            } else {
                proceed();
            }
        });
    };

    window._handleSortearClick = function (tId, isAberto) {
        window._lastActiveTournamentId = tId;
        var _startDraw = function() {
            // Auto-mover solos para waitlist em torneios de duplas
            var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
            // v2.1.64: modo "Times Montados" SEM nenhum time formado (ex.: só
            // jogadores individuais). Não adianta abrir o painel de potência de 2
            // (que mostraria "0 times"). Avisa que os times precisam ser montados
            // (pelo organizador ou pelos participantes) e leva pra edição do Modo
            // de Inscrição. Intercepta ANTES de mover solos pra lista de espera.
            if (t) {
                var _enrM = t.enrollmentMode || t.enrollment || 'individual';
                if (_enrM === 'time' && typeof window._diagnoseAll === 'function') {
                    var _diagTeams = window._diagnoseAll(t);
                    // dispara quando há jogadores SEM equipe (individuais soltos)
                    // ou nenhum time formado — em ambos não dá pra sortear os times.
                    if (_diagTeams.individuals > 0 || _diagTeams.preFormedTeams === 0) {
                        if (typeof window._warnTeamsNotFormed === 'function') { window._warnTeamsNotFormed(tId); return; }
                    }
                }
            }
            var movedCount = t ? window._autoMoveSoloToWaitlist(t) : 0;
            if (movedCount > 0 && typeof showNotification !== 'undefined') {
                showNotification('🙋 ' + movedCount + ' participante(s) sem dupla', 'Movido(s) para lista de espera.', 'info');
            }
            var absentMovedCount = t ? window._autoMoveAbsentToStandby(t) : 0;
            if (absentMovedCount > 0 && typeof showNotification !== 'undefined') {
                showNotification('⚠️ ' + absentMovedCount + ' participante(s) ausente(s)', 'Removido(s) do sorteio e enviado(s) para lista de espera.', 'warning');
            }
            var _continueDraw = function() {
                if (typeof window.showUnifiedResolutionPanel === 'function') {
                    window.showUnifiedResolutionPanel(tId);
                } else if (typeof window.showFinalReviewPanel === 'function') {
                    window.showFinalReviewPanel(tId);
                }
            };
            // Se ausentes foram movidos, persistir no Firestore ANTES de abrir o painel.
            // O listener onSnapshot substitui store.tournaments inteiro quando chega
            // dados do servidor — sem salvar primeiro, os participantes originais
            // (com ausentes) voltam do Firestore e o sorteio os inclui mesmo assim.
            if (absentMovedCount > 0 && window.AppStore && typeof window.AppStore.syncImmediate === 'function') {
                var _doGenderThenDraw = function() {
                    if (typeof window._maybeShowGenderDrawDialog === 'function' &&
                        window._maybeShowGenderDrawDialog(tId, _continueDraw)) return;
                    _continueDraw();
                };
                Promise.resolve(window.AppStore.syncImmediate(tId)).then(_doGenderThenDraw).catch(_doGenderThenDraw);
                return;
            }
            // v2.1.20: em duplas mistas com sorteio livre (sem categoria masc/fem),
            // mostra o diálogo de gênero + modo (livre/equilibrado) antes do sorteio.
            if (typeof window._maybeShowGenderDrawDialog === 'function' &&
                window._maybeShowGenderDrawDialog(tId, _continueDraw)) {
                return;
            }
            _continueDraw();
        };
        // v2.1.2: se "Fechadas" está OFF (lateEnrollment 'standby'/'expand'), o
        // SORTEIO não encerra as inscrições — elas seguem abertas. Não mostra o
        // diálogo "encerrar prematuramente"; sorteia direto SEM setar 'closed'.
        var _tSort = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
        var _lateMode = !!(_tSort && (_tSort.lateEnrollment === 'standby' || _tSort.lateEnrollment === 'expand'));
        if (isAberto && _lateMode) {
            // v2.2.39: inscrições seguem abertas após o sorteio — perguntar se
            // sorteia com todos (antes da chamada) ou só entre os presentes.
            window._showPresenceDrawChoice(tId, _startDraw);
        } else if (isAberto) {
            showConfirmDialog(
                _t('org.closeRegConfirmTitle'),
                _t('org.closeRegConfirmMsg'),
                () => {
                    const t = window._findTournamentById(tId);
                    if (t) {
                        t.status = 'closed';
                        if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
                            window.FirestoreDB.saveTournament(t).then(function() {
                                _startDraw();
                            }).catch(function() {
                                window.AppStore.sync();
                                _startDraw();
                            });
                        } else {
                            window.AppStore.sync();
                            _startDraw();
                        }
                    }
                },
                null,
                { type: 'warning', confirmText: _t('btn.finishAndDraw'), cancelText: _t('btn.keepOpen') }
            );
        } else {
            _startDraw();
        }
    };

    if (!window.inviteModalSetupDone) {
        window.openInviteModal = function (id) {
            const mod = document.getElementById('invite-modal-' + id);
            if (mod) {
                mod.style.display = 'flex';
                // Force scroll to top of modal overlay and inner content
                requestAnimationFrame(function() {
                    mod.scrollTop = 0;
                    var children = mod.children;
                    for (var i = 0; i < children.length; i++) children[i].scrollTop = 0;
                });
            }
        };
        window.closeInviteModal = function (id) {
            const mod = document.getElementById('invite-modal-' + id);
            if (mod) mod.style.display = 'none';
        };

        // Convidar todos os amigos para o torneio (via notificação na plataforma)
        window._inviteFriendsToTournament = async function(tournamentId, inviteTextSafe) {
            var cu = window.AppStore.currentUser;
            if (!cu) return;
            if (!cu.friends || cu.friends.length === 0) {
                if (typeof showNotification === 'function') {
                    showNotification(_t('tourn.noFriends'), _t('tourn.noFriendsMsg'), 'info');
                }
                return;
            }
            var myUid = cu.uid || cu.email;
            var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
            if (!t) return;

            var btn = document.getElementById('invite-friends-btn-' + tournamentId);
            var statusDiv = document.getElementById('invite-friends-status-' + tournamentId);
            if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = _t('tourn.sending'); }

            var inviteUrl = window._tournamentUrl(t.id) + '?ref=' + encodeURIComponent(myUid);
            var sent = 0;
            var whatsappNumbers = [];
            var emailRecipients = [];

            for (var i = 0; i < cu.friends.length; i++) {
                var friendUid = cu.friends[i];
                try {
                    var profile = await window.FirestoreDB.loadUserProfile(friendUid);
                    if (!profile) continue;

                    // Check if already enrolled
                    var parts = Array.isArray(t.participants) ? t.participants : [];
                    var alreadyIn = parts.some(function(p) {
                        var str = typeof p === 'string' ? p : (p.email || p.displayName || '');
                        return str && profile.email && str === profile.email;
                    });
                    if (alreadyIn) continue;

                    // Send platform notification (always)
                    if (profile.notifyPlatform !== false) {
                        await window.FirestoreDB.addNotification(friendUid, {
                            type: 'tournament_invite',
                            fromUid: myUid,
                            fromName: cu.displayName || '',
                            fromPhoto: cu.photoURL || '',
                            tournamentId: String(t.id),
                            tournamentName: t.name || '',
                            message: _t('tourn.friendInvitedMsg', {name: cu.displayName || _t('tourn.aFriend'), tournament: t.name || ''}),
                            inviteUrl: inviteUrl,
                            createdAt: new Date().toISOString(),
                            read: false
                        });
                        sent++;
                    }

                    // Collect WhatsApp numbers for bulk share
                    if (profile.notifyWhatsApp !== false && profile.phone) {
                        var countryCode = profile.phoneCountry || '55';
                        var phoneDigits = (profile.phone || '').replace(/\D/g, '');
                        if (phoneDigits) whatsappNumbers.push(countryCode + phoneDigits);
                    }

                    // Collect emails for notification
                    if (profile.notifyEmail !== false && profile.email) {
                        emailRecipients.push(profile.email);
                    }
                } catch(e) {
                    window._warn('Error inviting friend', friendUid, e);
                }
            }

            // Update UI
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '👥 Convites Enviados!'; }
            var statusParts = [];
            if (sent > 0) statusParts.push(sent + ' convite' + (sent !== 1 ? 's' : '') + ' na plataforma');
            if (emailRecipients.length > 0) statusParts.push(emailRecipients.length + ' por e-mail');
            if (whatsappNumbers.length > 0) statusParts.push(whatsappNumbers.length + ' por WhatsApp');
            var statusMsg = statusParts.length > 0 ? statusParts.join(', ') + '.' : _t('tourn.noInvitesSent');
            if (statusDiv) statusDiv.textContent = statusMsg;
            if (typeof showNotification !== 'undefined') {
                showNotification(_t('tourn.invitesSent'), statusMsg, 'success');
            }

            // Open email with all recipients (bcc for privacy)
            if (emailRecipients.length > 0) {
                var emailSubject = encodeURIComponent('🏆 Convite para torneio: ' + t.name);
                var emailBody = encodeURIComponent('Olá!\n\nVocê foi convidado para o torneio "' + t.name + '" no scoreplace.app.\n\nAcesse o link abaixo para se inscrever:\n' + inviteUrl + '\n\nBoas partidas! 🎾');
                window.open('mailto:?bcc=' + emailRecipients.join(',') + '&subject=' + emailSubject + '&body=' + emailBody, '_self');
            }

            // Open WhatsApp with invite message
            if (whatsappNumbers.length > 0) {
                var inviteMsg = '🏆 Torneio: ' + t.name + '\nAcesse o link abaixo para se inscrever:\n' + inviteUrl;
                window.open(window._whatsappShareUrl(inviteMsg), '_blank');
            }
        };
        window.switchInviteTab = function (btn, tabName, id) {
            const modal = btn.closest('.invite-modal-container');
            modal.querySelectorAll('.invite-tab-btn').forEach(b => {
                b.style.borderBottom = '1px solid var(--border-color)';
                b.style.color = 'var(--text-muted)';
                b.style.fontWeight = '500';
            });
            btn.style.borderBottom = '2px solid var(--text-bright)';
            btn.style.color = 'var(--text-bright)';
            btn.style.fontWeight = '700';
            modal.querySelectorAll('.invite-tab-content').forEach(c => c.style.display = 'none');
            const content = modal.querySelector('#tab-' + tabName + '-' + id);
            if (content) content.style.display = 'block';
        };
        window.inviteModalSetupDone = true;
    }

    if (!window.addBotsFunctionSetup) {
        window.addBotsFunction = function (id) {
            const qtd = parseInt(prompt('🔧 TEST MODE\nQuantos bots deseja adicionar?', '8'), 10);
            if (isNaN(qtd) || qtd <= 0) return;

            const t = window.AppStore.tournaments.find(tour => tour.id.toString() === id.toString());
            if (t) {
                if (!t.participants) t.participants = [];
                if (!Array.isArray(t.participants)) {
                    t.participants = Object.values(t.participants);
                }
                const currentCount = t.participants.length;
                for (let i = 1; i <= qtd; i++) {
                    const numStr = String(currentCount + i).padStart(2, '0');
                    t.participants.push({
                        name: 'Bot ' + numStr,
                        displayName: 'Bot ' + numStr,
                        email: 'bot' + numStr + '@scoreplace.app',
                        uid: 'bot_' + numStr + '_' + Date.now(),
                        isBot: true
                    });
                }
                // Save directly to Firestore (sync() skips participants)
                if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
                    window.FirestoreDB.saveTournament(t).then(function() {
                        showNotification(_t('tourn.botsAdded'), _t('tourn.botsAddedMsg', { n: qtd }), 'success');
                    }).catch(function(err) {
                        window._error('Erro ao salvar bots:', err);
                        showNotification(_t('enroll.error'), _t('tourn.botError'), 'error');
                    });
                }

                // Recarrega view mantendo contexto de roteamento ID
                const container = document.getElementById('view-container');
                if (container) {
                    const param = window.location.hash.split('/')[1] || null;
                    renderTournaments(container, param);
                }
            }
        };
        window.addBotsFunctionSetup = true;
    }

    if (!window.addPlaceholdersFunctionSetup) {
        // v2.1.28: botão de teste do organizador — cria N inscritos "placeholder".
        // Antes do sorteio: vão pra INSCRITOS. Depois do sorteio: vão pra LISTA DE
        // ESPERA (o pool de tardios), útil pra testar o fluxo de inscrição tardia.
        window.addPlaceholdersFunction = function (id) {
            var raw = prompt('➕ Placeholders\nQuantos inscritos placeholder deseja incluir?', '8');
            if (raw === null) return;
            var qtd = parseInt(raw, 10);
            if (isNaN(qtd) || qtd <= 0) { showNotification('Número inválido', 'Informe um número maior que zero.', 'warning'); return; }
            if (qtd > 200) qtd = 200;
            var t = window.AppStore.tournaments.find(function (tour) { return tour.id.toString() === id.toString(); });
            if (!t) return;
            if (!Array.isArray(t.participants)) t.participants = t.participants ? Object.values(t.participants) : [];
            var hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
            // v2.1.34: coleta TODOS os nomes individuais já usados — inclusive os
            // embutidos em duplas ("Placeholder 19 / Placeholder 08") e nos jogos do
            // bracket — e numera a partir do MAIOR número existente. Antes o contador
            // por length quebrava quando placeholders viravam duplas (o nome individual
            // sumia das listas), recriando "Placeholder 19" em levas diferentes.
            var existingNames = {};
            var _addName = function (n) {
                if (!n) return;
                String(n).split(' / ').forEach(function (part) { var pn = part.trim(); if (pn) existingNames[pn] = true; });
            };
            (t.participants || []).concat(t.standbyParticipants || [], t.waitlist || []).forEach(function (p) {
                _addName(typeof p === 'string' ? p : (p && (p.displayName || p.name)));
            });
            var _allM = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
            (_allM || []).forEach(function (m) { if (m) { _addName(m.p1); _addName(m.p2); } });
            var maxNum = 0;
            Object.keys(existingNames).forEach(function (nm) {
                var mt = nm.match(/^(?:Jogador|Placeholder)\s+(\d+)$/i);
                if (mt) { var v = parseInt(mt[1], 10); if (v > maxNum) maxNum = v; }
            });
            var made = [];
            var k = maxNum;
            for (var i = 0; i < qtd; i++) {
                var numStr, nm;
                do { k++; numStr = String(k).padStart(2, '0'); nm = 'Jogador ' + numStr; } while (existingNames[nm]);
                existingNames[nm] = true;
                made.push({ name: nm, displayName: nm, email: 'jogador' + numStr + '@scoreplace.app', uid: 'jog_' + numStr + '_' + Date.now() + '_' + i, isPlaceholder: true });
            }
            var dest;
            if (hasDraw) {
                if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
                t.standbyParticipants = t.standbyParticipants.concat(made);
                dest = 'lista de espera';
            } else {
                t.participants = t.participants.concat(made);
                dest = 'inscritos';
            }
            if (window.AppStore && typeof window.AppStore.logAction === 'function') window.AppStore.logAction(id, qtd + ' placeholder(s) adicionado(s) em ' + dest);
            if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
                window.FirestoreDB.saveTournament(t).then(function () {
                    showNotification('Placeholders adicionados', qtd + ' placeholder(s) em ' + dest + '.', 'success');
                }).catch(function (err) { if (window._error) window._error('Erro ao salvar placeholders:', err); showNotification('Erro', 'Não foi possível salvar.', 'error'); });
            }
            var container = document.getElementById('view-container');
            if (container) { var param = window.location.hash.split('/')[1] || null; renderTournaments(container, param); }
        };
        window.addPlaceholdersFunctionSetup = true;
    }

    if (!window.editModalSetupDone) {
        window.openEditModal = function (id) {
            if (typeof window.openEditTournamentModal === 'function') {
                window.openEditTournamentModal(id);
            }
        };
        window.editModalSetupDone = true;
    }


    // ─── Invite fallback card — shown when tournament can't be loaded yet ─────
    window._renderInviteFallbackCard = function(container, tId) {
        // Show loading message for all users (logged in or visitor)
        container.innerHTML = '<div style="max-width:500px;width:100%;margin:2rem auto;text-align:center;padding:2rem;box-sizing:border-box;">' +
            '<div style="font-size:3rem;margin-bottom:1rem;">\u{1F3C6}</div>' +
            '<h2 style="color:var(--text-bright);margin-bottom:0.5rem;">Carregando torneio...</h2>' +
            '<p style="color:var(--text-muted);margin-bottom:1.5rem;">Aguarde enquanto carregamos os dados do torneio.</p>' +
            '<button class="btn hover-lift" onclick="window.location.hash=\'#dashboard\'" style="background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);font-weight:600;font-size:0.9rem;padding:10px 24px;border-radius:10px;">Voltar ao In\u00EDcio</button></div>';
    };

    // ========== Categories: moved to tournaments-categories.js ==========

    if (!window.enrollDeenrollSetupDone) {
        // ========== Enrollment: moved to tournaments-enrollment.js ==========
        // All functions below are now defined in tournaments-enrollment.js
        // They are loaded via a separate <script> tag in index.html

        window.enrollDeenrollSetupDone = true;
    }

    // [v0.4.3] Removed ~435 lines of dead code (old enrollment/delete functions
    // moved to tournaments-enrollment.js in v0.4.2). See git history if needed.

    if (tournamentId) {
        visible = visible.filter(t => t.id && t.id.toString() === tournamentId.toString());
        // If tournament not found in visible list, try loading it directly from Firestore
        if (visible.length === 0 && window.FirestoreDB && window.FirestoreDB.db) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted);">Carregando torneio...</div>';
            window.FirestoreDB.db.collection('tournaments').doc(String(tournamentId)).get().then(function(doc) {
                if (doc.exists) {
                    var t = doc.data();
                    // Add to AppStore if not there
                    var exists = window.AppStore.tournaments.some(function(x) { return String(x.id) === String(t.id); });
                    if (!exists) {
                        window.AppStore.tournaments.push(t);
                    }
                    // Track as invited
                    if (window.AppStore._invitedTournamentIds.indexOf(String(tournamentId)) === -1) {
                        window.AppStore._invitedTournamentIds.push(String(tournamentId));
                        try { sessionStorage.setItem('_invitedTournamentIds', JSON.stringify(window.AppStore._invitedTournamentIds)); } catch(e) {}
                    }
                    // Re-render
                    renderTournaments(container, tournamentId);
                } else {
                    // Tournament deleted or doesn't exist — go to dashboard
                    if (typeof showNotification === 'function') {
                        showNotification(_t('tournament.notFound'), '', 'warning');
                    }
                    window.location.hash = '#dashboard';
                }
            }).catch(function(err) {
                window._warn('Error loading tournament:', err);
                // Firestore read failed (permissions or network) — show invite card
                window._renderInviteFallbackCard(container, tournamentId);
            });
            return;
        }
    }

    // Fallback card for non-logged users or when Firestore can't load the tournament
    // Shows tournament name if available, and a single "Inscrever-se" button that handles everything
    if (tournamentId && visible.length === 0) {
        window._renderInviteFallbackCard(container, tournamentId);
        return;
    }

    const cleanSportName = (sport) => sport ? sport.replace(/^[^\w\u00C0-\u024F]+/u, '').trim() : '';
    // v0.17.16: delega ao resolver global em store.js (centralização).
    const getSportIcon = (sport) => window._sportIcon ? window._sportIcon(sport) : '🏆';

    const renderTournamentCard = (t, isOrg) => {
        const publicText = t.isPublic ? _t('tournament.public') : _t('tournament.private');

        const formatDateBr = (dStr) => {
            if (!dStr) return '';
            try {
                const datePart = dStr.includes('T') ? dStr.split('T')[0] : dStr;
                const timePart = dStr.includes('T') ? dStr.split('T')[1] : '';
                const [y, m, d] = datePart.split('-');
                if (y && m && d) {
                    let result = d + '/' + m + '/' + y;
                    if (timePart) result += ' ' + timePart.substring(0, 5);
                    return result;
                }
            } catch (e) { }
            return dStr;
        };

        const start = formatDateBr(t.startDate);
        const end = formatDateBr(t.endDate);
        const dates = start ? (end ? `${start} ${_t('tourn.dateTo')} ${end}` : `${start}`) : _t('tourn.dateTbd');
        // v2.6.23/24: data em grid — [🗓️ | data | hora] / ["A" | data | hora].
        // Colunas separadas de data e hora + tabular-nums = data e hora
        // PERFEITAMENTE alinhadas entre as duas linhas.
        const _dateToLbl = _t('tourn.dateTo');
        const _splitDT = (s) => { var p = String(s || '').trim().split(' '); return { d: p[0] || '', t: p.slice(1).join(' ') }; };
        const _sDT = _splitDT(start), _eDT = _splitDT(end);
        const datesGridHtml = (start && end)
          ? `<span style="display:grid;grid-template-columns:auto auto auto;column-gap:9px;row-gap:3px;align-items:center;font-variant-numeric:tabular-nums;">`
              + `<span style="font-size:1.1rem;justify-self:center;line-height:1;">🗓️</span><span style="white-space:nowrap;">${_sDT.d}</span><span style="white-space:nowrap;">${_sDT.t}</span>`
              + `<span style="justify-self:center;opacity:0.8;font-weight:700;">${_dateToLbl}</span><span style="white-space:nowrap;">${_eDT.d}</span><span style="white-space:nowrap;">${_eDT.t}</span>`
            + `</span>`
          : `<span style="display:inline-flex;align-items:center;gap:8px;"><span style="font-size:1.1rem;">🗓️</span><span style="font-variant-numeric:tabular-nums;">${dates}</span></span>`;
        const regLimit = formatDateBr(t.registrationLimit);
        const cats = (t.combinedCategories && t.combinedCategories.length) ? window._sortCategoriesBySkillOrder(t.combinedCategories, t.skillCategories).join(', ') : ((t.categories && t.categories.length) ? t.categories.join(', ') : _t('tourn.singleCat'));

        // Liga season auto-closure: se a temporada expirou, encerra automaticamente
        if (window._isLigaFormat(t) && t.status !== 'finished') {
          const _seasonMonths = t.ligaSeasonMonths || t.rankingSeasonMonths;
          if (_seasonMonths && t.startDate) {
            const _seasonStart = new Date(t.startDate);
            if (!isNaN(_seasonStart.getTime())) {
              const _seasonEnd = new Date(_seasonStart);
              _seasonEnd.setMonth(_seasonEnd.getMonth() + parseInt(_seasonMonths));
              if (new Date() >= _seasonEnd) {
                // Temporada expirou — marcar como finished
                t.status = 'finished';
                // Computar standings finais se necessário
                if (!t.standings || !t.standings.length) {
                  if (typeof window._computeStandings === 'function') {
                    var _cats = (t.combinedCategories && t.combinedCategories.length) ? t.combinedCategories : ['default'];
                    for (var _ci = 0; _ci < _cats.length; _ci++) {
                      var _st = window._computeStandings(t, _cats[_ci]);
                      if (_st && _st.length) { t.standings = _st; break; }
                    }
                  }
                }
                // Salvar no Firestore
                if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
                  window.FirestoreDB.saveTournament(t).catch(function() {});
                }
                // Notify participants of season end (flag persistida no Firestore — v1.8.45)
                if (!t.finishNotifiedAt && typeof window._notifyTournamentParticipants === 'function') {
                  t.finishNotifiedAt = new Date().toISOString();
                  window._notifyTournamentParticipants(t, {
                    type: 'tournament_finished',
                    message: _t('notif.tournamentFinished').replace('{name}', t.name || 'Torneio'),
                    tournamentName: t.name || '',
                    level: 'important'
                  });
                }
              }
            }
          }
        }

        // Inscrições fecham após sorteio (status 'active'), exceto Liga/Ranking com inscrições abertas na temporada
        const isFinished = t.status === 'finished';
        const sorteioRealizado = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
        // v2.1.6: torneio encerrado (campeão definido) SEMPRE fecha inscrição,
        // inclusive Liga — ligaAberta nunca vale com status 'finished'.
        const ligaAberta = !isFinished && window._isLigaFormat(t) && t.ligaOpenEnrollment !== false && sorteioRealizado;
        // v2.1.0: quando "Fechadas" está OFF (lateEnrollment 'standby'/'expand'),
        // o SORTEIO não encerra as inscrições — elas seguem abertas após o
        // sorteio e só fecham quando o organizador clica "Encerrar Inscrições"
        // (que seta status='closed'). lateEnrollManaged = quando esse modo está
        // ativo após o sorteio (pra mostrar o botão Encerrar/Reabrir).
        const lateEnrollManaged = sorteioRealizado && !isFinished && (t.lateEnrollment === 'standby' || t.lateEnrollment === 'expand');
        const lateEnrollOpen = lateEnrollManaged && t.status !== 'closed';
        const isAberto = (!isFinished && t.status !== 'closed' && !sorteioRealizado && (!t.registrationLimit || new Date(t.registrationLimit) >= new Date())) || ligaAberta || lateEnrollOpen;

        // Auto-close: if deadline passed but status hasn't been updated yet, close it now
        if (!isAberto && !isFinished && !sorteioRealizado && t.status !== 'closed' && t.registrationLimit && new Date(t.registrationLimit) < new Date()) {
          t.status = 'closed';
          if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
            window.FirestoreDB.saveTournament({ id: t.id, status: 'closed' }).catch(function() {});
          }
        }

        // Self-heal: enrollments open + no draw => drain any residual waitlist/standby into participants
        if (isAberto && !sorteioRealizado && typeof window._drainWaitlistsIfOpen === 'function') {
          window._drainWaitlistsIfOpen(t, { save: true });
        }

        // v1.3.35-beta: "Em Andamento" só quando o usuário clicou
        // explicitamente em "Iniciar Torneio" (t.tournamentStarted truthy
        // OU t.status === 'in_progress' que o handler também seta).
        // Antes, sorteio realizado já fazia o status ir pra "Em Andamento" —
        // mas o tempo só conta após o user iniciar de fato. Bug reportado:
        // "torneio com inscrições encerradas que aparece como em andamento,
        // mas o botão iniciar torneio ainda não foi clicado".
        const tournamentStarted = !!(t.tournamentStarted || t.status === 'in_progress');
        const statusText = isFinished
          ? '🏆 ' + _t('status.finished')
          : (ligaAberta ? _t('tournament.leagueOpenEnroll')
            : (isAberto ? _t('status.open')
              : (tournamentStarted ? _t('status.active')
                : _t('status.closed'))));
        const statusBg = isFinished
          ? 'rgba(251,191,36,0.15)'
          : (isAberto || ligaAberta ? '#fbbf24'
            : (tournamentStarted ? 'rgba(16,185,129,0.2)'
              : 'rgba(0,0,0,0.3)'));
        const statusColor = isFinished
          ? '#fbbf24'
          : (isAberto || ligaAberta ? '#78350f'
            : (tournamentStarted ? '#34d399'
              : '#fca5a5'));
        const statusFontWeight = isAberto ? '700' : '600';

        let enrollmentText = _t('enroll.modeMixed');
        if (t.enrollmentMode === 'individual') enrollmentText = _t('enroll.modeIndividual');
        else if (t.enrollmentMode === 'time') enrollmentText = _t('enroll.modeTeam');
        else if (t.enrollmentMode === 'misto') enrollmentText = _t('enroll.modeMixed');

        const sortearOnClick = `event.stopPropagation(); window._handleSortearClick('${t.id}', ${isAberto})`;

        let isParticipating = false;
        if (t.participants && window.AppStore.currentUser) {
            isParticipating = typeof window._isUserEnrolledInTournament === 'function'
              ? window._isUserEnrolledInTournament(window.AppStore.currentUser, t)
              : false;
        }

        // v2.1.3: usuário está na LISTA DE ESPERA (standby/waitlist)? Inscrição
        // tardia (pós-sorteio, Fechadas OFF) coloca o novo inscrito aqui — e o
        // detalhe precisa mostrar "Lista de espera" + "Sair", não "Inscrever-se".
        let _isInStandby = false;
        if (window.AppStore.currentUser) {
            var _cuStb = window.AppStore.currentUser;
            var _matchStb = function(p) {
                if (!p) return false;
                if (typeof p === 'string') return p === _cuStb.email || p === _cuStb.displayName;
                return (p.uid && _cuStb.uid && p.uid === _cuStb.uid) ||
                       (p.email && _cuStb.email && p.email === _cuStb.email) ||
                       (p.displayName && _cuStb.displayName && p.displayName === _cuStb.displayName);
            };
            _isInStandby = (Array.isArray(t.standbyParticipants) && t.standbyParticipants.some(_matchStb)) ||
                           (Array.isArray(t.waitlist) && t.waitlist.some(_matchStb));
        }

        // Card gradients adaptam ao tema — consistentes com dashboard.js
        // v0.17.32: paleta sincronizada com dashboard.js — dark themes
        // (Noturno/Oceano) usam deep tints pros 3 estados; Sunset agora é
        // light cream (corrigido pós v0.17.25 redesign).
        var _theme = (document.documentElement.getAttribute('data-theme') || 'dark');
        var _isLight = (_theme === 'light' || _theme === 'sunset');
        let bgGradient;
        if (_theme === 'light') {
            bgGradient = 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%)';
            if (isParticipating) bgGradient = 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)';
            else if (isOrg) bgGradient = 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)';
        } else if (_theme === 'sunset') {
            bgGradient = 'linear-gradient(135deg, #fdf6e3 0%, #f7e5cb 100%)';
            if (isParticipating) bgGradient = 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
            else if (isOrg) bgGradient = 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)';
        } else if (_theme === 'ocean') {
            bgGradient = 'linear-gradient(135deg, #1c3d5e 0%, #173352 100%)';
            if (isParticipating) bgGradient = 'linear-gradient(135deg, #0c4a6e 0%, #0e3a52 100%)';
            else if (isOrg) bgGradient = 'linear-gradient(135deg, #1e3a5f 0%, #1a2f4d 100%)';
        } else {
            bgGradient = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
            if (isParticipating) bgGradient = 'linear-gradient(135deg, #0f3a36 0%, #0d2826 100%)';
            else if (isOrg) bgGradient = 'linear-gradient(135deg, #1e1b4b 0%, #161339 100%)';
        }

        // Venue photo background — overlay gradient on top of photo
        let venuePhotoBg = '';
        if (t.venuePhotoUrl) {
            // v2.3.71: gradiente mais leve (foto mais visível); a leitura vem de
            // um box frosted sutil atrás do conteúdo (sem o contraste pesado).
            var overlayGradient = isOrg
                ? 'linear-gradient(135deg, rgba(67,56,202,0.5) 0%, rgba(99,102,241,0.42) 100%)'
                : isParticipating
                    ? 'linear-gradient(135deg, rgba(15,118,110,0.5) 0%, rgba(20,184,166,0.42) 100%)'
                    : 'linear-gradient(135deg, rgba(30,41,59,0.5) 0%, rgba(15,23,42,0.42) 100%)';
            venuePhotoBg = 'background-image: ' + overlayGradient + ', url(' + t.venuePhotoUrl + '); background-size: cover; background-position: center;';
        }

        let individualCount = 0;
        let teamCount = 0;
        if (t.participants) {
            const arr = typeof window._getCompetitors === 'function' ? window._getCompetitors(t) : (Array.isArray(t.participants) ? t.participants : Object.values(t.participants));
            arr.forEach(p => {
                if (typeof p === 'object' && p !== null && Array.isArray(p.participants)) {
                    teamCount++;
                    individualCount += p.participants.length;
                } else if (p && typeof p === 'object' && p.p1Name && p.p2Name) {
                    // v2.7.99: dupla ESTRUTURAL (p1Name/p2Name, displayName pode não ter "/")
                    // conta como 2 pessoas e 1 equipe. Antes contava 1 ("12 em vez de 13").
                    teamCount++;
                    individualCount += 2;
                } else {
                    const pStr = window._pName(p);
                    if (pStr.includes('/')) {
                        teamCount++;
                        individualCount += pStr.split('/').filter(n => n.trim().length > 0).length;
                    } else {
                        individualCount++;
                    }
                }
            });
        }
        // Include waitlist in total individual count
        if (Array.isArray(t.waitlist)) {
            individualCount += t.waitlist.length;
        }
        const standbyCount = (Array.isArray(t.standbyParticipants) ? t.standbyParticipants.length : 0)
            + (Array.isArray(t.waitlist) ? t.waitlist.length : 0);

        const expectedTeammates = Math.max(0, parseInt(t.teamSize || 2) - 1);
        // Para duplas (teamSize===2) usa o fluxo individual + partner picker.
        // Para times maiores (teamSize>2) mantém modal com inputs de texto.
        const isDoublesTournament = parseInt(t.teamSize || 2) === 2;

        // Participantes já inscritos individualmente (sem "/" = sem dupla ainda)
        const _enrolledSolo = (Array.isArray(t.participants) ? t.participants : [])
          .filter(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            var cu = window.AppStore && window.AppStore.currentUser;
            if (cu && (n === cu.displayName || (typeof p === 'object' && p.uid === cu.uid))) return false;
            return !n.includes(' / '); // sem dupla formada
          })
          .map(function(p) {
            return typeof p === 'string'
              ? { name: p, uid: '', photo: '' }
              : { name: p.displayName || p.name || '', uid: p.uid || '', photo: p.photoURL || '' };
          })
          .filter(function(p) { return p.name; });

        // Para duplas (teamSize===2): modal suprimido — fluxo é direto (inscrição + _showPartnerPicker)
        const teamEnrollModalHtml = isDoublesTournament ? '' : `
         <div id="team-enroll-modal-${t.id}" class="team-enroll-modal-container" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 10000; align-items: flex-start; justify-content: center; cursor: default; overflow-y: auto; padding: 2rem 0;" onclick="event.stopPropagation()">
            <div style="background: var(--bg-card); width: 90%; max-width: 450px; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 20px 40px rgba(0,0,0,0.4); margin: auto; animation: fadeIn 0.2s ease;">

               <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                  <h3 style="margin: 0; font-size: 1.2rem; color: var(--text-bright);">👥 ${isDoublesTournament ? 'Escolher parceiro(a)' : _t('enroll.team')}</h3>
                  <button style="background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer;" onclick="event.stopPropagation(); document.getElementById('team-enroll-modal-${t.id}').style.display='none'">&times;</button>
               </div>

               <div style="padding: 1.5rem; color: var(--text-main); font-size: 0.9rem; text-align: left;">
                  <div style="margin-bottom: 1.2rem;">
                     <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-muted);">Você</label>
                     <div style="padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.3); color: var(--text-muted); display:flex;align-items:center;gap:8px;">
                       ${window._avatarHtml(window.AppStore && window.AppStore.currentUser, 24)}
                       <span>${window.AppStore && window.AppStore.currentUser ? window._safeHtml(window.AppStore.currentUser.displayName || '') : ''}</span>
                     </div>
                  </div>

                  <form id="form-team-enroll-${t.id}" onsubmit="event.stopPropagation(); event.preventDefault(); window.submitTeamEnroll('${t.id}')">
                     <div id="team-members-inputs-${t.id}">
                        ${isDoublesTournament ? `
                        <!-- Picker inteligente de parceiro para duplas -->
                        <div style="margin-bottom:1rem;">
                           <label style="display:block;margin-bottom:6px;font-weight:600;color:var(--text-muted);">Parceiro(a)</label>
                           <div style="position:relative;">
                              <input type="text"
                                 id="partner-search-${t.id}"
                                 class="team-member-name-${t.id}"
                                 placeholder="Buscar por nome ou amigo..."
                                 autocomplete="off"
                                 style="width:100%;padding:10px 10px 10px 36px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-dark);color:var(--text-main);box-sizing:border-box;"
                                 oninput="window._partnerPickerSearch('${t.id}', this.value)"
                                 onfocus="window._partnerPickerInit('${t.id}'); window._partnerPickerSearch('${t.id}', this.value)"
                                 required>
                              <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:1rem;pointer-events:none;">🔍</span>
                              <div id="partner-chip-${t.id}" style="display:none;position:absolute;top:8px;left:8px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);border-radius:20px;padding:2px 8px 2px 6px;font-size:0.8rem;color:#a5b4fc;display:none;align-items:center;gap:5px;max-width:calc(100% - 40px);">
                                 <span id="partner-chip-name-${t.id}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                                 <button type="button" onclick="window._partnerPickerClear('${t.id}')" style="background:none;border:none;color:#a5b4fc;cursor:pointer;font-size:0.9rem;padding:0;line-height:1;">×</button>
                              </div>
                           </div>
                           <div id="partner-dropdown-${t.id}" style="display:none;position:absolute;z-index:1000;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:240px;overflow-y:auto;width:min(400px,calc(90vw - 3rem));margin-top:2px;"></div>
                        </div>
                        ` : Array.from({ length: expectedTeammates }).map((_, i) => `
                           <div style="margin-bottom: 1rem;">
                              <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-muted);">${i + 2}. Nome do Integrante:</label>
                              <input type="text" class="team-member-name-${t.id}" placeholder="Ex: Maria Souza" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-main);" required>
                           </div>
                        `).join('')}
                     </div>

                     <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 1.5rem; margin-top: 1rem;">
                        <button type="button" class="btn btn-outline hover-lift" onclick="event.stopPropagation(); document.getElementById('team-enroll-modal-${t.id}').style.display='none'">${_t('btn.cancel')}</button>
                        <button type="submit" class="btn btn-success hover-lift" id="partner-confirm-${t.id}">Confirmar dupla</button>
                     </div>
                  </form>
                  ${isDoublesTournament ? `
                  <div style="margin-top:1rem;padding-top:1rem;border-top:1px dashed rgba(255,255,255,0.1);text-align:center;">
                     <button type="button" class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._enrollSoloInDoubles('${t.id}')" style="font-size:0.8rem;opacity:0.75;">
                        🙋 Inscrever sem parceiro — escolher depois
                     </button>
                     <div style="font-size:0.68rem;color:var(--text-muted);margin-top:5px;">Quem não tiver dupla no sorteio vai para a lista de espera.</div>
                  </div>` : ''}
               </div>
            </div>
         </div>
      `;
        // Para duplas (teamSize===2): não renderizar o modal antigo.
        // O fluxo é: inscrever individual → _showPartnerPicker pós-inscrição.
        // Guardar lista de inscritos solo para o picker (acessada via window)
        window._partnerPickerEnrolled = window._partnerPickerEnrolled || {};
        window._partnerPickerEnrolled[t.id] = _enrolledSolo;

        // Botão inscrever/desinscrever — disponível em todos os contextos (detalhe e listagem)
        // Detect if user arrived via invite link for this tournament
        const _isInviteTarget = tournamentId && !isParticipating && isAberto && (
          window._pendingInviteHash === '#tournaments/' + t.id ||
          (function() { try { return sessionStorage.getItem('_pendingEnrollTournamentId') === String(t.id); } catch(e) { return false; } })()
        );
        const _enrollFlash = _isInviteTarget ? 'animation:enrollPulse 1.5s ease-in-out infinite;' : '';
        // Perfil carregado = currentUser existe E _profileLoaded = true.
        // Enquanto carrega, botão fica cinza desabilitado para evitar inscrições
        // com uid indefinido que gerariam participantes fantasmas no Firestore.
        const _profileReady = !!(window.AppStore.currentUser && window.AppStore.currentUser._profileLoaded);
        // v2.1.3: se está na LISTA DE ESPERA, mostra a tag + "Sair da lista de
        // espera" (tem prioridade sobre o botão "Inscrever-se", que aparecia
        // errado pra quem já entrou na espera via inscrição tardia).
        const enrollBtnHtml = _isInStandby ? `
             <div style="font-size: 0.6rem; font-weight: 800; color: #fbbf24; background: rgba(251,191,36,0.15); padding: 2px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.4px;">⏳ ${_t('enroll.onWaitlist') || 'Lista de espera'}</div>
             <button class="btn btn-sm btn-danger hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window._leaveStandby('${t.id}')">🛑 ${_t('enroll.leaveWaitlist') || 'Sair da lista de espera'}</button>
          ` : (isParticipating && isAberto) ? `
             <button class="btn btn-sm btn-danger hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window.deenrollCurrentUser('${t.id}')">🛑 ${_t('enroll.unenrollBtn')}</button>
          ` : (isAberto && !_profileReady && window.AppStore.currentUser) ? `
             <button class="btn btn-sm" disabled style="opacity:0.45;cursor:not-allowed;padding:6px 12px;font-size:0.78rem;background:var(--bg-darker);border:1px solid var(--border-color);border-radius:8px;color:var(--text-muted);">⏳ Carregando…</button>
          ` : (isAberto ? `
             <button class="btn btn-sm btn-success hover-lift" style="${_enrollFlash}" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window.enrollCurrentUser('${t.id}')">✅ ${_t('enroll.enrollBtn')}</button>
          ` : (isParticipating ? `
             <div style="font-size: 0.65rem; font-weight: 700; color: #fef08a; text-transform: uppercase; letter-spacing: 0.5px;">${_t('enroll.enrolled')} ✓</div>
          ` : ''));

        // v0.16.90: Liga active toggle ("Ativado/Desativado p/ próximo sorteio")
        // renderizado na linha acima do countdown (compartilhado entre card de
        // detalhe e card da lista de torneios na dashboard).
        let ligaActiveToggleHtml = (typeof window._buildLigaActiveToggleHtml === 'function')
          ? window._buildLigaActiveToggleHtml(t)
          : '';

        // ─── Pending co-org/transfer invite banner ───
        let pendingInviteBannerHtml = '';
        if (tournamentId && window.AppStore.currentUser) {
          const _cu = window.AppStore.currentUser;
          const _cuEmail = _cu.email || '';
          const _cuUid = _cu.uid || '';
          // Check co-host pending invite
          let _pendingType = '';
          if (Array.isArray(t.coHosts)) {
            const _pendingCh = t.coHosts.find(function(ch) {
              return ch.status === 'pending' && (ch.email === _cuEmail || (_cuUid && ch.uid === _cuUid));
            });
            if (_pendingCh) _pendingType = 'cohost';
          }
          // Check pending transfer
          if (!_pendingType && t.pendingTransfer && (t.pendingTransfer.targetEmail === _cuEmail || (_cuUid && t.pendingTransfer.targetUid === _cuUid))) {
            _pendingType = 'transfer';
          }
          if (_pendingType) {
            const _safeTid = String(t.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const _invLabel = _pendingType === 'transfer' ? _t('tourn.inviteTransfer') : _t('tourn.inviteCohost');
            const _invDesc = _pendingType === 'transfer'
              ? _t('tourn.inviteTransferDesc')
              : _t('tourn.inviteCoHostDesc');
            pendingInviteBannerHtml = `
              <div class="pending-invite-banner" style="margin-top:1rem;padding:18px 20px;background:linear-gradient(135deg,rgba(251,191,36,0.18),rgba(217,119,6,0.12));border:2px solid rgba(251,191,36,0.5);border-radius:16px;text-align:center;animation:invitePulse 2s ease-in-out infinite;">
                <div style="font-size:1.3rem;font-weight:800;color:#fbbf24;margin-bottom:6px;">${_invLabel}</div>
                <p style="color:#fef3c7;font-size:0.88rem;margin-bottom:14px;">${_invDesc}</p>
                <div style="display:flex;gap:10px;justify-content:center;">
                  <button class="btn btn-sm hover-lift" style="background:#fbbf24;color:#78350f;font-weight:700;border:none;padding:8px 24px;font-size:0.9rem;border-radius:10px;animation:inviteBtnPulse 1.5s ease-in-out infinite;" onclick="event.stopPropagation(); window._acceptHostInvite('${_safeTid}','${_pendingType}'); setTimeout(function(){var c=document.getElementById('view-container');if(c&&typeof renderTournaments==='function')renderTournaments(c,'${_safeTid}');},800);">✅ Aceitar</button>
                  <button class="btn btn-sm hover-lift" style="background:transparent;color:#f87171;border:1px solid rgba(239,68,68,0.5);padding:8px 24px;font-size:0.9rem;border-radius:10px;" onclick="event.stopPropagation(); window._rejectHostInvite('${_safeTid}','${_pendingType}'); setTimeout(function(){var c=document.getElementById('view-container');if(c&&typeof renderTournaments==='function')renderTournaments(c,'${_safeTid}');},800);">❌ Recusar</button>
                </div>
              </div>
            `;
          }
        }

        // Ações Específicas da tela Explore
        let actionsHtml = '';
        // v2.1.16: pódio do torneio encerrado agora vive no TOPO do card (logo
        // abaixo do nome), não dentro de actionsHtml. Declarado no escopo do card.
        let podiumHtml = '';
        const hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);

        // --- Variáveis de botões do organizador (escopo global do card para evitar ReferenceError) ---
        const allowsIndividual = !t.enrollmentMode || t.enrollmentMode === 'individual' || t.enrollmentMode === 'misto';
        const allowsTeams = t.enrollmentMode === 'time' || t.enrollmentMode === 'misto';
        // Para duplas (teamSize===2 com enrollmentMode=time): mostrar "+ Participante"
        // pois inscrições são individuais e duplas formadas por arrastar e soltar.
        const isDoublesMode = allowsTeams && parseInt(t.teamSize || 2) === 2;
        // v2.1.10: "+ Participante" fica disponível enquanto a INSCRIÇÃO não
        // estiver encerrada (isAberto já respeita late enrollment standby/expand
        // e Liga) — antes era só `!hasDraw`, então sumia após o sorteio mesmo
        // com inscrição aberta. O "+ Time" continua só antes do sorteio (o fluxo
        // de time não trata lista de espera). addParticipantFunction já roteia
        // pra lista de espera quando o sorteio já saiu.
        // v2.2.43: +Participante e +Placeholders seguem o estado REAL da inscrição
        // (isAberto) — ficam visíveis e funcionais enquanto as inscrições estiverem
        // abertas, INCLUSIVE depois do sorteio e do início do torneio (Liga aberta,
        // late enrollment standby/expand). addParticipantFunction e
        // addPlaceholdersFunction já roteiam pra lista de espera quando o sorteio
        // já saiu. +Time continua só antes do sorteio (o fluxo de time não trata
        // lista de espera).
        const addParticipantBtns = isOrg ? `
             ${((allowsIndividual || isDoublesMode) && isAberto) ? `<button class="btn btn-cyan hover-lift" onclick="event.stopPropagation(); window.addParticipantFunction('${t.id}')">👤 + Participante</button>` : ''}
             ${((allowsTeams && !isDoublesMode) && !sorteioRealizado) ? `<button class="btn btn-purple hover-lift" onclick="event.stopPropagation(); window.addTeamFunction('${t.id}')">👥 + Time</button>` : ''}
             ${isAberto ? `<button class="btn btn-outline hover-lift" onclick="event.stopPropagation(); window.addPlaceholdersFunction('${t.id}')">➕ Placeholders</button>` : ''}
        ` : '';

        // Categorias button removed — category management is now inline in "Inscritos Confirmados"
        const categoriasBtn = '';
        // v1.3.1-beta: botão de análise sempre visível pro organizador, mesmo
        // sem inscritos — modal trata empty state. User: 'Essa função de
        // relatório de inscritos deve estar entre os botoes ferramentas do
        // organizador no card de detalhe do torneio.'
        // v2.2.44: brilho de atenção nos botões do organizador.
        // _enoughForGame = inscritos confirmados (sem lista de espera) suficientes
        // pra montar pelo menos 1 jogo (2 lados de teamSize jogadores cada).
        const _confirmedPlayers = Math.max(0, (individualCount || 0) - (Array.isArray(t.waitlist) ? t.waitlist.length : 0));
        const _teamSizeN = parseInt(t.teamSize) || 1;
        const _enoughForGame = Math.floor(_confirmedPlayers / _teamSizeN) >= 2;
        const _glowGame = (_enoughForGame && !sorteioRealizado) ? ' btn-shine' : '';
        // v2.3.1: brilho de Análise e Editar usa o MESMO efeito dos botões
        // especiais da hero box (.btn-shine — sweep de luz periódico), não o
        // pulse box-shadow (sp-glow-*). Sempre ligado, igual à hero box.
        // v2.6.106: Análise CONTINUA visível pro organizador depois do sorteio/início
        // (analisa o perfil dos inscritos — útil a qualquer momento). Antes (v2.1.45)
        // sumia após o sorteio; o organizador pediu de volta.
        const enrollmentReportBtn = isOrg ? `<button class="btn btn-indigo hover-lift btn-shine" onclick="event.stopPropagation(); window._openEnrollmentReport('${t.id}')">📊 Análise</button>` : '';

        const isSuicoFormat = t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss' || t.currentStage === 'swiss';
        const isLigaFormat = window._isLigaFormat(t);
        const isLigaOpenEnroll = isLigaFormat && t.ligaOpenEnrollment !== false;
        // v2.1.0: mostra o botão Encerrar/Reabrir também APÓS o sorteio quando as
        // inscrições tardias estão ativas (lateEnrollManaged) — é o único jeito de
        // fechar as inscrições nesse modo (o sorteio não fecha).
        const toggleRegBtn = ((!hasDraw || lateEnrollManaged) && !isLigaOpenEnroll && isOrg) ? `<button class="btn ${t.status === 'closed' ? 'btn-success' : 'btn-danger'} hover-lift" onclick="event.stopPropagation(); window.toggleRegistrationStatus('${t.id}')">${t.status === 'closed' ? '✅ ' + _t('org.reopenRegistration') : '🛑 ' + _t('org.closeRegistration')}</button>` : '';

        // v0.16.55: Liga com sorteio automático (drawManual !== true) nunca mostra
        // botão Sortear nas ferramentas — o auto-draw cuida de tudo.
        // v0.16.56: regra agora exige `drawFirstDate` setado pra considerar
        // "auto-draw funcional". Liga auto SEM data agendada (estado inválido
        // que ligas antigas podem ter) volta a mostrar o botão manual como
        // fallback de recovery — assim organizador não fica preso sem ação.
        // Ligas novas criadas a partir da v0.16.56 sempre têm drawFirstDate
        // (default: amanhã 19:00) — esse fallback só pega legado.
        const isLigaAutoDraw = window._isLigaAutoDraw(t); // v2.7.5: canônico (store.js)
        const isAutoDrawFormat = isSuicoFormat || isLigaAutoDraw;
        let sortearBtn = '';
        let sortearAberto = '';
        if (isOrg) {
            if (isLigaAutoDraw) {
                // v2.7.82: o sorteio é automático, então o botão manual era OMITIDO.
                // Mas o organizador ainda pode precisar sortear na mão (ex.: auto-draw
                // não agendado pro futuro). Mostra o botão COM confirmação de que o
                // torneio é de sorteio automático. Vale pra todo organizador (não dev).
                if (t.status !== 'finished') {
                    var _adManualLbl = hasDraw ? '🎲 Próxima Rodada (manual)' : '🎲 Sortear agora (manual)';
                    sortearBtn = `<button class="btn btn-warning hover-lift${_glowGame}" onclick="event.stopPropagation(); window._confirmManualAutoDraw('${t.id}')">${_adManualLbl}</button>`;
                }
            } else if (isLigaFormat && t.drawManual) {
                sortearBtn = (t.status === 'closed' && !hasDraw) ? `<button class="btn btn-warning hover-lift${_glowGame}" onclick="event.stopPropagation(); window.generateDrawFunction('${t.id}')">🎲 Sortear</button>` : '';
                sortearAberto = (t.status !== 'closed' && !hasDraw) ? `<button class="btn btn-warning hover-lift${_glowGame}" onclick="${sortearOnClick}">🎲 Sortear</button>` : '';
                if (hasDraw) {
                    sortearBtn = `<button class="btn btn-warning hover-lift" onclick="event.stopPropagation(); window.generateDrawFunction('${t.id}')">🎲 Próxima Rodada</button>`;
                }
            } else {
                // v1.0.96-beta: status='closed' agora roteia via _handleSortearClick(false)
                // → showUnifiedResolutionPanel → painel correto (P2 / grupos / final review).
                // Antes chamava generateDrawFunction direto, que pulava painel de grupos
                // quando user havia cancelado antes — sorteava com defaults silenciosos.
                // User: 'quando coloquei para sortear depois de ter cancelado ele sorteou
                // direto sem me perguntar novamente a formação dos grupos.'
                sortearBtn = (t.status === 'closed' && !hasDraw) ? `<button class="btn btn-warning hover-lift${_glowGame}" onclick="event.stopPropagation(); window._handleSortearClick('${t.id}', false)">🎲 Sortear</button>` : '';
                sortearAberto = (t.status !== 'closed' && !hasDraw) ? `<button class="btn btn-warning hover-lift${_glowGame}" onclick="${sortearOnClick}">🎲 Sortear</button>` : '';
            }
        }

        if (tournamentId) {
            const _inviterUid = (window.AppStore.currentUser && (window.AppStore.currentUser.uid || window.AppStore.currentUser.email)) || '';
            const inviteUrl = window._tournamentUrl(t.id) + (_inviterUid ? '?ref=' + encodeURIComponent(_inviterUid) : '');
            const inviteText = (typeof window._tournamentInviteText === 'function')
                ? window._tournamentInviteText(t, inviteUrl)
                : ('🏆 Torneio: ' + t.name + '\nAcesse o link abaixo para se inscrever:\n' + inviteUrl);
            // Safe version for embedding in onclick attributes (escape quotes and newlines)
            const inviteTextSafe = inviteText.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
            const _friendCount = (window.AppStore.currentUser && window.AppStore.currentUser.friends && window.AppStore.currentUser.friends.length > 0) ? ' (' + window.AppStore.currentUser.friends.length + ')' : '';
            const inviteModalHtml = `
             <div id="invite-modal-${t.id}" class="invite-modal-container" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 9999; cursor: default; box-sizing: border-box;" onclick="event.stopPropagation()">
                <div style="position:absolute;top:1rem;left:50%;transform:translateX(-50%);background: var(--bg-card); width: calc(100% - 2rem); max-width: 340px; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 20px 40px rgba(0,0,0,0.4); animation: fadeIn 0.2s ease; box-sizing: border-box; overflow: hidden;">

                   <!-- Standard back header row -->
                   <div style="display:flex;align-items:center;gap:8px;padding:0.5rem 0.75rem;border-bottom:1px solid var(--border-color);">
                      <button onclick="event.stopPropagation();closeInviteModal('${t.id}')" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;border:1px solid var(--border-color);background:transparent;color:var(--text-color);cursor:pointer;font-size:0.78rem;font-weight:600;flex-shrink:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Voltar</button>
                      <div style="flex:1;text-align:center;font-size:0.85rem;font-weight:700;color:var(--text-bright);">Convidar para o Torneio</div>
                      <button class="back-hdr-ham" type="button" aria-label="Abrir menu" onclick="event.stopPropagation();typeof window._toggleHamburger==='function'&&window._toggleHamburger(this);" style="width:32px;height:32px;border:none;background:transparent;color:var(--text-color);cursor:pointer;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
                   </div>

                   <div style="padding: 0.6rem 0.85rem; display: flex; flex-direction: column; gap: 0.6rem; box-sizing: border-box;">

                      <!-- 3 buttons row -->
                      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                         <button class="btn btn-success btn-sm hover-lift" id="invite-friends-btn-${t.id}" style="flex-direction:column;gap:1px;padding:8px 4px;font-size:0.65rem;display:flex;align-items:center;justify-content:center;" onclick="event.stopPropagation(); window._inviteFriendsToTournament('${t.id}', '${inviteTextSafe}')">
                            <span style="font-size:1.1rem;">👥</span>Amigos${_friendCount}
                         </button>
                         <button class="btn btn-whatsapp btn-sm hover-lift" style="flex-direction:column;gap:1px;padding:8px 4px;font-size:0.65rem;display:flex;align-items:center;justify-content:center;" onclick="window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent('${inviteTextSafe}'), '_blank')">
                            <span style="font-size:1.1rem;">💬</span>WhatsApp
                         </button>
                         <button class="btn btn-primary btn-sm hover-lift" style="flex-direction:column;gap:1px;padding:8px 4px;font-size:0.65rem;display:flex;align-items:center;justify-content:center;" onclick="event.stopPropagation(); navigator.clipboard.writeText('${inviteTextSafe}').then(function(){showNotification(window._t('share.copied'),'Mensagem do convite copiada','success');}).catch(function(){try{var i=document.createElement('textarea');i.value='${inviteTextSafe}';document.body.appendChild(i);i.select();document.execCommand('copy');document.body.removeChild(i);showNotification(window._t('share.copied'),'Mensagem do convite copiada','success');}catch(e){showNotification('Link','${inviteUrl}','info');}})">
                            <span style="font-size:1.1rem;">📋</span>Copiar
                         </button>
                      </div>
                      <div id="invite-friends-status-${t.id}" style="font-size: 0.68rem; color: var(--text-muted); text-align: center; min-height:0;"></div>

                      <!-- QR Code centered -->
                      <div style="text-align: center;">
                         <div style="background: white; padding: 6px; border-radius: 10px; display: inline-block;">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&color=111111&data=${encodeURIComponent(inviteUrl)}" alt="QR Code" width="120" height="120" style="display: block;">
                         </div>
                         <div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 3px;">Escaneie para se inscrever</div>
                         <button class="btn btn-sm hover-lift" style="margin-top:8px;background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3);border-radius:10px;padding:7px 16px;font-size:0.72rem;font-weight:600;cursor:pointer;" onclick="event.stopPropagation(); window._openTournamentInvitePrint('${t.id}')">🖨️ Imprimir convite</button>
                      </div>

                      <!-- Email -->
                      <div style="font-size:0.65rem;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;">Convide por e-mail</div>
                      <div style="display: flex; gap: 6px; align-items: stretch; margin-top:-3px;">
                         <input type="email" placeholder="email@exemplo.com" id="invite-email-${t.id}" style="flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-main); font-size: 0.75rem; min-width: 0; box-sizing: border-box;">
                         <button class="btn btn-indigo btn-sm hover-lift" style="font-size:0.75rem;" onclick="event.stopPropagation(); window._sendTournamentInviteEmail('${t.id}')">E-mail</button>
                      </div>

                   </div>
                </div>
             </div>
          `;

            const editModalHtml = '';

            const tournamentStarted = !!t.tournamentStarted;

            if (isOrg) {
                // Botão "Iniciar Torneio" — SÓ aparece após sorteio realizado, antes de iniciar
                // Ao clicar: inicia o torneio E navega para o chaveamento
                const startTournamentBanner = (hasDraw && !tournamentStarted) ? `
                  <div style="margin-top:1.5rem;padding:20px;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.1));border:2px solid rgba(16,185,129,0.4);border-radius:16px;text-align:center;">
                      <p style="color:#94a3b8;font-size:0.85rem;margin-bottom:12px;">Sorteio realizado. Inicie o torneio para habilitar a chamada de presença.</p>
                      <button class="btn btn-success btn-cta hover-lift" onclick="event.stopPropagation(); window._startTournament('${t.id}'); window.location.hash='#bracket/${t.id}';">
                          ▶ Iniciar Torneio
                      </button>
                  </div>` : '';

                const startedBadge = tournamentStarted ? `
                  <div style="margin-top:1rem;display:flex;align-items:center;gap:8px;justify-content:center;">
                      <span style="width:10px;height:10px;border-radius:50%;background:#10b981;display:inline-block;animation:pulse 2s infinite;"></span>
                      <span style="font-size:0.85rem;font-weight:700;color:#4ade80;">Torneio em andamento</span>
                  </div>` : '';

                // Contagem regressiva de sorteio automático (Suíço com auto-draw; Liga usa o countdown com ticker na seção de eventos)
                let autoDrawCountdownHtml = '';
                if (isAutoDrawFormat && !isLigaFormat && !t.drawManual && t.drawFirstDate) {
                    const _nextDraw = window._calcNextDrawDate(t);
                    if (_nextDraw) {
                        const _now = new Date();
                        const _diff = _nextDraw.getTime() - _now.getTime();
                        if (_diff > 0) {
                            const _d = Math.floor(_diff / 86400000);
                            const _h = Math.floor((_diff % 86400000) / 3600000);
                            const _m = Math.floor((_diff % 3600000) / 60000);
                            const _parts = [];
                            if (_d > 0) _parts.push(_d + 'd');
                            if (_h > 0) _parts.push(_h + 'h');
                            _parts.push(_m + 'min');
                            autoDrawCountdownHtml = `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(251,146,60,0.12);border:1px solid rgba(251,146,60,0.3);border-radius:10px;font-size:0.8rem;">
                                <span style="color:#fb923c;font-weight:700;">⏱️ Próximo sorteio em</span>
                                <span style="color:#fb923c;font-weight:800;">${_parts.join(' ')}</span>
                            </div>`;
                        } else {
                            autoDrawCountdownHtml = `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:10px;font-size:0.8rem;">
                                <span style="color:#34d399;font-weight:700;">⏱️ Sorteio pendente</span>
                                <span style="color:var(--text-muted);">Rodada pronta para ser gerada</span>
                            </div>`;
                        }
                    }
                }

                // --- Build actionsHtml based on tournament state ---
                if (isFinished) {
                    // Torneio encerrado — mostrar pódio + Ver Chaves
                    podiumHtml = '';
                    // Prefer canonical adapter: look for the last elim/grand column
                    // with a decided winner; fall back to legacy t.matches scan.
                    let _finalMatch = null;
                    let _thirdPlace = null;
                    const _unif = (typeof window._getUnifiedRounds === 'function') ? window._getUnifiedRounds(t) : null;
                    if (_unif && Array.isArray(_unif.columns) && _unif.columns.length > 0) {
                        // Find the Grand Final (double-elim) or the last elim column.
                        const _gf = _unif.columns.filter(function(c) { return c && c.phase === 'grandfinal'; }).pop();
                        if (_gf && Array.isArray(_gf.matches) && _gf.matches.length > 0) {
                            _finalMatch = _gf.matches.find(function(m) { return m && m.winner && !m.isBye; });
                        }
                        if (!_finalMatch) {
                            const _elimCols = _unif.columns.filter(function(c) { return c && c.phase === 'elim'; });
                            const _lastElim = _elimCols[_elimCols.length - 1];
                            if (_lastElim && Array.isArray(_lastElim.matches)) {
                                _finalMatch = _lastElim.matches.find(function(m) { return m && m.winner && !m.isBye; });
                            }
                        }
                        const _tpCol = _unif.columns.find(function(c) { return c && c.phase === 'thirdplace'; });
                        if (_tpCol && Array.isArray(_tpCol.matches) && _tpCol.matches[0] && _tpCol.matches[0].winner) {
                            _thirdPlace = _tpCol.matches[0].winner;
                        }
                    }
                    if (!_finalMatch) {
                        // Legacy fallback: scan t.matches for highest round with decided winner.
                        const _allM = t.matches || [];
                        if (_allM.length > 0) {
                            const _roundNums = _allM.map(function(m) { return m.round || 0; });
                            const _lastR = Math.max.apply(null, _roundNums);
                            const _finalM = _allM.filter(function(m) { return m.round === _lastR && !m.isBye && m.winner; });
                            if (_finalM.length > 0) _finalMatch = _finalM[0];
                        }
                    }
                    if (!_thirdPlace && t.thirdPlaceMatch && t.thirdPlaceMatch.winner) {
                        _thirdPlace = t.thirdPlaceMatch.winner;
                    }
                    if (_finalMatch) {
                        const _1st = _finalMatch.winner;
                        const _2nd = _finalMatch.winner === _finalMatch.p1 ? _finalMatch.p2 : _finalMatch.p1;
                        const _3rd = _thirdPlace;
                            podiumHtml = window._buildPodiumHtml(_1st, _2nd, _3rd);
                    }
                    // Suíço/Liga: show standings-based podium
                    if (!podiumHtml && Array.isArray(t.rounds) && t.rounds.length > 0 && t.standings && t.standings.length > 0) {
                        const _top = t.standings.slice(0, 3);
                        const _nm = function(s){ return s ? (s.name || s.player || '') : ''; };
                        const _pts = function(s){ return (s && s.points != null) ? (s.points + ' pts') : ''; };
                        podiumHtml = window._buildPodiumHtml(
                            _nm(_top[0]), _nm(_top[1]), _nm(_top[2]),
                            'Campeão', _pts(_top[1]) || '2º Lugar', _pts(_top[2]) || '3º Lugar'
                        );
                    }
                    actionsHtml = `
                   ${inviteModalHtml}
                   <div class="tournament-action-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:1rem;">
                     <button class="btn btn-outline btn-sm hover-lift" onclick="window.location.hash='#rules/${t.id}'">📋 Regras</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="window.location.hash='#participants/${t.id}'">👥 Inscritos</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._printTournament('${t.id}')">🖨️ Imprimir</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._exportTournamentCSV('${t.id}')">📊 Exportar CSV</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._tvMode('${t.id}')">📺 Modo TV</button>
                   </div>
                 `;
                } else if (hasDraw) {
                    // Sorteio já feito — mostrar Iniciar Torneio ou badge Em Andamento
                    actionsHtml = `
                   ${inviteModalHtml}
                   ${isLigaFormat ? '' : startTournamentBanner}
                   ${isLigaFormat ? '' : startedBadge}
                   ${autoDrawCountdownHtml ? `<div style="margin-top:1rem;text-align:center;">${autoDrawCountdownHtml}</div>` : ''}
                   <div class="tournament-action-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:1rem;">
                     <button class="btn btn-outline btn-sm hover-lift" onclick="window.location.hash='#rules/${t.id}'">📋 Regras</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="window.location.hash='#participants/${t.id}'">👥 Inscritos</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._printTournament('${t.id}')">🖨️ Imprimir</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._exportTournamentCSV('${t.id}')">📊 Exportar CSV</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._tvMode('${t.id}')">📺 Modo TV</button>
                   </div>
                 `;
                } else {
                    // Antes do sorteio — Inscritos disponível pra fazer a CHAMADA
                    // (marcar presença) antes de sortear. v2.1.86: o organizador
                    // acessa a lista, marca quem está presente e decide o que
                    // fazer com os ausentes (desclassificar ou lista de espera).
                    actionsHtml = `
                   ${inviteModalHtml}
                   ${teamEnrollModalHtml}
                   <div class="tournament-action-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:1rem;">
                     <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window.location.hash='#rules/${t.id}'">📋 Regras</button>
                     <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window.location.hash='#participants/${t.id}'">👥 Inscritos / Chamada</button>
                   </div>
                   ${autoDrawCountdownHtml ? `<div style="margin-top:1rem;text-align:center;">${autoDrawCountdownHtml}</div>` : ''}
                 `;
                }
            } else if (!window.AppStore.currentUser) {
                // Non-logged-in visitor viewing tournament
                if (isAberto) {
                    // Enrollments open — show enroll CTA (login triggered on click)
                    actionsHtml = `
                   ${teamEnrollModalHtml}
                   <div id="visitor-enroll-cta" style="margin-top:1.5rem;padding:24px;background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(5,150,105,0.12));border:2px solid rgba(16,185,129,0.5);border-radius:16px;text-align:center;">
                      <h3 style="color:#4ade80;font-size:1.3rem;font-weight:800;margin-bottom:6px;">Participe deste torneio!</h3>
                      <p style="color:#94a3b8;font-size:0.9rem;margin-bottom:16px;">Clique abaixo para se inscrever.</p>
                      <button class="btn btn-success btn-cta hover-lift" onclick="event.stopPropagation(); window._spinButton(this, '${_t('enroll.processing')}'); window.enrollCurrentUser('${t.id}')">
                         \u2705 Inscrever-se
                      </button>
                   </div>
                 `;
                } else if (isFinished) {
                    // Tournament finished
                    actionsHtml = `
                   <div id="visitor-closed-cta" style="margin-top:1.5rem;padding:24px;background:linear-gradient(135deg,rgba(239,68,68,0.12),rgba(185,28,28,0.08));border:2px solid rgba(239,68,68,0.35);border-radius:16px;text-align:center;">
                      <h3 style="color:#f87171;font-size:1.15rem;font-weight:700;margin-bottom:6px;">Torneio Encerrado</h3>
                      <p style="color:#94a3b8;font-size:0.88rem;margin-bottom:16px;">Este torneio j\u00E1 foi finalizado. Que tal criar o seu pr\u00F3prio?</p>
                      <button class="btn btn-primary btn-cta hover-lift" onclick="event.stopPropagation(); window.location.hash='#dashboard'">
                         \u{1F3C6} Criar Meu Torneio
                      </button>
                   </div>
                 `;
                } else {
                    // Enrollments closed but tournament still running
                    actionsHtml = `
                   <div id="visitor-closed-cta" style="margin-top:1.5rem;padding:24px;background:linear-gradient(135deg,rgba(251,191,36,0.12),rgba(217,119,6,0.08));border:2px solid rgba(251,191,36,0.35);border-radius:16px;text-align:center;">
                      <h3 style="color:#fbbf24;font-size:1.15rem;font-weight:700;margin-bottom:6px;">Inscri\u00E7\u00F5es Encerradas</h3>
                      <p style="color:#94a3b8;font-size:0.88rem;margin-bottom:16px;">Infelizmente as inscri\u00E7\u00F5es deste torneio j\u00E1 foram encerradas. Que tal criar o seu pr\u00F3prio?</p>
                      <button class="btn btn-primary btn-cta hover-lift" onclick="event.stopPropagation(); window.location.hash='#dashboard'">
                         \u{1F3C6} Criar Meu Torneio
                      </button>
                   </div>
                 `;
                }
            } else {
                actionsHtml = `
               ${inviteModalHtml}
               ${teamEnrollModalHtml}
               ${hasDraw ? `
               <div style="margin-top:1rem;">
                 <button class="btn btn-primary hover-lift" style="width:100%;font-size:0.95rem;padding:12px;margin-bottom:10px;" onclick="window._scrollToBracketSection('${t.id}')">🏆 Ver Chaves</button>
                 <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                   <button class="btn btn-outline btn-sm hover-lift" onclick="window.location.hash='#rules/${t.id}'">📋 Regras</button>
                   <button class="btn btn-outline btn-sm hover-lift" onclick="window.location.hash='#participants/${t.id}'">👥 Inscritos</button>
                 </div>
               </div>` : `
               <div class="d-flex justify-between align-center mt-4 pt-4" style="border-top: 1px solid rgba(255,255,255,0.15);">
                  <div class="d-flex gap-2">
                     <button class="btn btn-sm hover-lift" style="background: rgba(255,255,255,0.2); color: white; border: none; font-weight: 600;" onclick="window.location.hash='#rules/${t.id}'">Regras</button>
                  </div>
               </div>`}
             `;
            }
        } else {
            actionsHtml = `
            ${teamEnrollModalHtml}
          `;
        }

        var _cardTextColor = (_isLight && !venuePhotoBg) ? '#1f2937' : 'white';
        // v2.3.72: SEM box no card inteiro (não mata a foto). Caixas de leitura
        // ficam SÓ nos blocos de info de fonte pequena/cor fraca (datas,
        // cronômetro, inscritos, formato/acesso). _pReadBg = fundo escuro legível
        // aplicado por bloco só quando há foto do local.
        var _photoPanel = '';
        // v2.6.43: read box theme-aware (escuro→box claro/texto escuro; claro→box escuro/texto claro)
        var _rb = (venuePhotoBg && typeof window._photoReadBox === 'function') ? window._photoReadBox() : null;
        var _pReadBg = _rb ? _rb.bg : '';
        var _pReadFg = _rb ? _rb.fg : '#f1f5f9';
        var _pReadBd = _rb ? _rb.border : 'rgba(255,255,255,0.12)';

        return `
        <div class="card mb-3${venuePhotoBg ? ' card-has-photo' : ''}" style="position:relative;${venuePhotoBg ? venuePhotoBg : 'background: ' + bgGradient + ';'} color: ${_cardTextColor}; border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: transform 0.2s; ${!tournamentId ? 'cursor: pointer;' : ''}" ${!tournamentId ? `onclick="window.location.hash='#tournaments/${t.id}'" onmouseover="this.style.transform='translateX(5px)'" onmouseout="this.style.transform='none'"` : ''}>
          <div class="card-body p-4" style="${_photoPanel}${isOrg ? 'padding-bottom: 38px;' : ''}">

            <!-- Top Row: Icon/Modality | Status (same line on mobile) -->
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; flex-wrap: wrap; gap: 4px;">
               <div style="display: flex; align-items: center; gap: 6px; opacity: 0.65; min-width: 0;">
                  <span style="font-size: 1.1rem;">${getSportIcon(t.sport)}</span>
                  <span>${cleanSportName(t.sport) || 'Esporte'}</span>
               </div>
               <div style="color: ${statusColor}; background: ${statusBg}; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: ${statusFontWeight}; white-space: nowrap; margin-left: auto;">
                  ${statusText}
               </div>
            </div>
            ${enrollBtnHtml ? `<div style="display: flex; flex-direction: column; align-items: flex-end; margin-top: 6px; gap: 4px;">
               ${enrollBtnHtml}
               ${tournamentId ? `<div style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6;">Inscrição: ${enrollmentText}</div>` : ''}
            </div>` : (tournamentId ? `<div style="display: flex; justify-content: flex-end; margin-top: 6px; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6;">Inscrição: ${enrollmentText}</div>` : '')}

            ${pendingInviteBannerHtml}

            <!-- Middle Left: Nome + Logo + Favorito -->
            <!-- Logo: na tela de detalhe ocupa 1/3 da largura do card (max 160px), cap responsivo via CSS min() -->
            <div style="display: flex; align-items: ${t.logoData && tournamentId ? 'flex-start' : 'center'}; gap: ${t.logoData && tournamentId ? '18px' : '14px'}; margin: 1.8rem 0 0.5rem 0;">
              ${t.logoData ? `
                <div style="position:relative;width:33%;min-width:100px;flex-shrink:0;">
                  <img src="${t.logoData}" alt="Logo"
                    style="width:100%;aspect-ratio:1/1;border-radius:${window._tournamentLogoRadius(t)};object-fit:cover;display:block;box-shadow:0 4px 20px rgba(0,0,0,0.45);${tournamentId && isOrg ? 'cursor:pointer;' : ''}"
                    ${tournamentId && isOrg ? `onclick="event.stopPropagation(); window._editTournamentLogoFromDetail('${window._safeHtml(t.id)}')" title="Clique para editar o logo"` : ''}
                  >
                </div>
              ` : ''}
              <div style="flex:1;min-width:0;">
                <h4 style="margin: 0; font-size: 1.8rem; font-weight: 800; color: white; line-height: 1.2; text-align: left; overflow-wrap: break-word;">
                  ${window._safeHtml(t.name)}
                </h4>
              </div>
              ${/* v2.7.36: coração de favorito SEMPRE à direita, alinhado à 1ª linha do nome
                    (align-self:flex-start + margin-top centra na primeira linha do h4). */ ''}
              ${tournamentId ? `<span data-fav-id="${t.id}" onclick="event.stopPropagation(); window._toggleFavorite('${t.id}', event)" title="${(typeof window._isFavorite === 'function' && window._isFavorite(t.id)) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" style="font-size:1.5rem;cursor:pointer;flex-shrink:0;align-self:flex-start;margin-top:6px;color:${(typeof window._isFavorite === 'function' && window._isFavorite(t.id)) ? '#f43f5e' : 'rgba(255,255,255,0.4)'};transition:all 0.2s;line-height:1;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">${(typeof window._isFavorite === 'function' && window._isFavorite(t.id)) ? '❤️' : '♡'}</span>` : ''}
              ${!tournamentId ? `<span data-fav-id="${t.id}" onclick="event.stopPropagation(); window._toggleFavorite('${t.id}', event)" style="font-size:1.8rem;cursor:pointer;flex-shrink:0;align-self:flex-start;color:${(typeof window._isFavorite === 'function' && window._isFavorite(t.id)) ? '#f43f5e' : 'rgba(255,255,255,0.4)'};transition:all 0.2s;line-height:1;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">${(typeof window._isFavorite === 'function' && window._isFavorite(t.id)) ? '❤️' : '♡'}</span>` : ''}
            </div>
            ${/* v2.8.67: enquete ativa → botão brilhante logo abaixo do nome */ ''}
            ${(tournamentId && typeof window._opButtonHtml === 'function') ? window._opButtonHtml(t) : ''}
            ${/* v2.3.85: linha direta com o desenvolvedor — logo abaixo do nome,
                  só pro organizador na página de detalhe do torneio. */ ''}
            ${(tournamentId && isOrg && typeof window._devWhatsAppBtnHtml === 'function') ? '<div style="margin:2px 0 12px;">' + window._devWhatsAppBtnHtml({ extra: 'height:38px;padding:0 16px;font-size:0.82rem;' }) + '</div>' : ''}
            ${/* v2.3.96: rede de segurança — sorteio em revisão (só organizador) */ ''}
            ${(typeof window._renderPendingDrawBanner === 'function') ? window._renderPendingDrawBanner(t) : ''}
            ${/* v2.1.16: pódio do torneio encerrado logo abaixo do nome/logo */ ''}
            ${(tournamentId && isFinished) ? podiumHtml : ''}
            ${tournamentId ? `<div style="margin-bottom: 1rem; display: flex; gap: 8px; flex-wrap: wrap;">
              ${!isFinished ? `<button class="btn btn-warning btn-sm hover-lift" onclick="event.stopPropagation(); openInviteModal('${t.id}')">📤 Convidar</button>` : ''}
              <button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._shareTournament('${t.id}');">📋 Compartilhar</button>
              ${(!isFinished && t.startDate) ? `<button class="btn btn-outline btn-sm hover-lift" onclick="event.stopPropagation(); window._tournamentAddToCalendar('${t.id}');">📅 Adicionar à agenda</button>` : ''}
            </div>` : ''}

            <!-- Below Name: Calendário + Data -->
            <div style="display: inline-block; font-size: 0.9rem; font-weight: 500; ${_pReadBg ? 'background:'+_pReadBg+';color:'+_pReadFg+' !important;border-radius:10px;padding:7px 11px;align-self:flex-start;' : 'opacity: 0.7;'}">
               ${datesGridHtml}
            </div>
            ${(() => {
              // v0.16.90: linha "Atualizado em..." + toggle Liga "Ativado/
              // Desativado" alinhados nas pontas (left/right). Se não há
              // updatedAt, left fica vazio e o toggle ocupa a direita; se
              // não há toggle (não-Liga ou user não inscrito), só "Atualizado".
              var _hasUpdated = !!(tournamentId && t.updatedAt);
              if (!_hasUpdated && !ligaActiveToggleHtml) return '';
              var _updatedHtml = _hasUpdated
                ? `<div style="display:inline-flex;align-items:center;gap:8px;font-size:0.75rem;font-weight:400;${_pReadBg ? 'background:'+_pReadBg+';color:'+_pReadFg+' !important;border-radius:10px;padding:6px 10px;' : 'opacity:0.5;'}">
                     <span>🔄</span>
                     <span>Atualizado em ${(() => { try { var d = new Date(t.updatedAt); return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}); } catch(e) { return t.updatedAt; } })()}</span>
                   </div>`
                : '<div></div>';
              // v2.6.21: o toggle agora é pílula sólida verde/vermelha (cor própria)
              // — não envolver em tarja escura (_pReadBg).
              // v2.7.41: toggle SEMPRE à direita (margin-left:auto) — mesmo quando
              // quebra pra linha de baixo (antes ia pra esquerda com space-between).
              var _toggleWrapped = ligaActiveToggleHtml ? '<div style="margin-left:auto;">' + ligaActiveToggleHtml + '</div>' : '';
              return `<div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;" onclick="event.stopPropagation();">${_updatedHtml}${_toggleWrapped}</div>`;
            })()}
            ${(typeof window._buildTimeEstimation === 'function') ? window._buildTimeEstimation(t) : ''}
            ${t.venue ? `
            <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.85rem; font-weight: 500; margin-top: 6px; ${_pReadBg ? 'background:'+_pReadBg+';color:'+_pReadFg+' !important;border-radius:10px;padding:8px 11px;' : 'opacity: 0.65;'}">
               <span style="font-size: 1rem; flex-shrink:0;">📍</span>
               <span style="display:flex; flex-direction:column; gap:1px;">
                 <span>${window._safeHtml(t.venue)}${t.courtCount > 1 ? ' — ' + t.courtCount + ' quadras' : t.courtCount === 1 ? ' — 1 quadra' : ''}</span>
                 ${t.venueAddress ? '<span style="font-size:0.75rem; font-weight:400; opacity:0.7;">' + window._safeHtml(t.venueAddress) + '</span>' : ''}
               </span>
               ${(t.venuePlaceId || t.venue) ? '<button onclick="event.stopPropagation();window._openVenueFromTournament(\'' + String(t.id).replace(/\\/g, '\\\\').replace(/\'/g, "\\'") + '\')" title="Ver detalhes do local (movimento, contatos, reviews)" style="background:rgba(14,165,233,0.15);border:1px solid rgba(14,165,233,0.35);color:#38bdf8;border-radius:8px;padding:4px 8px;font-size:0.72rem;font-weight:600;cursor:pointer;flex-shrink:0;">🏢 Local</button>' : ''}
               ${t.venueLat && t.venueLon ? '<a href="' + (t.venuePlaceId ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t.venue) + '&query_place_id=' + t.venuePlaceId : 'https://www.google.com/maps/search/?api=1&query=' + t.venueLat + ',' + t.venueLon) + '" target="_blank" title="Ver no mapa" style="color:#818cf8; text-decoration:none; font-size:1rem; flex-shrink:0;">🗺️</a>' : ''}
            </div>
            ${tournamentId && t.venueLat && t.venueLon ? '<div id="tournament-venue-map" data-lat="' + t.venueLat + '" data-lng="' + t.venueLon + '" data-venue="' + window._safeHtml(t.venue || '') + '" style="width:100%;height:180px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);margin-top:8px;background:#1a1a2e;"></div>' : ''}` : ''}

            ${(() => {
              if (isFinished) return '';
              var _now = Date.now();
              var _isLiga = window._isLigaFormat && window._isLigaFormat(t);

              // Liga: um único countdown excludente (início → próximo sorteio → fim da temporada)
              if (_isLiga) {
                var _ligaEvent = null;
                // 1. Torneio ainda não começou? → countdown para início
                if (t.startDate && !sorteioRealizado) {
                  var _sd = new Date(t.startDate).getTime();
                  if (!isNaN(_sd) && _sd > _now) _ligaEvent = { ts: _sd, label: _t('tourn.ligaStart'), icon: '🏁', color: '#10b981' };
                }
                // Fim do torneio: endDate (limite real, ex. "13/06 19:59") ou,
                // na ausência dela, o fim da temporada (ligaSeasonMonths).
                var _tEndTs = null;
                if (t.endDate) {
                  var _edStr = String(t.endDate).indexOf('T') > -1 ? t.endDate : (t.endDate + 'T23:59:59');
                  var _edMs = new Date(_edStr).getTime();
                  if (!isNaN(_edMs)) _tEndTs = _edMs;
                }
                if (_tEndTs == null) {
                  var _smEnd = t.ligaSeasonMonths || t.rankingSeasonMonths;
                  if (_smEnd && t.startDate) {
                    var _ssdEnd = new Date(t.startDate);
                    if (!isNaN(_ssdEnd.getTime())) {
                      var _seEnd = new Date(_ssdEnd);
                      _seEnd.setMonth(_seEnd.getMonth() + parseInt(_smEnd));
                      _tEndTs = _seEnd.getTime();
                    }
                  }
                }
                // v2.7.14: multi-fase → fim do torneio = fim da ÚLTIMA fase (janela
                // programada), não t.endDate (que é a fase ATUAL). Ex.: Confra acaba
                // 12/11 (fim da fase 1), não 19/06 (fim da fase 0).
                if (window._isMultiPhase && window._isMultiPhase(t) && typeof window._tournamentScheduledWindow === 'function') {
                  var _winEnd = window._tournamentScheduledWindow(t);
                  if (_winEnd && _winEnd.endMs) _tEndTs = _winEnd.endMs;
                }
                // 2. Já começou e AINDA HÁ sorteios por vir? → countdown para próximo sorteio.
                // v2.4.68: o último sorteio já feito (rodada atual = última planejada)
                // não tem "próximo sorteio" — cai pro countdown de fim do torneio (passo 3).
                if (!_ligaEvent && !t.drawManual && t.drawFirstDate && !(window._isMultiPhase && window._isMultiPhase(t)) && typeof window._calcNextDrawDate === 'function') {
                  var _lpDraw = (typeof window._ligaTournamentProgress === 'function') ? window._ligaTournamentProgress(t) : null;
                  var _moreDraws = !_lpDraw || _lpDraw.currentRoundNum < _lpDraw.roundsPlanned;
                  if (_moreDraws) {
                    var _nextDraw = window._calcNextDrawDate(t);
                    if (_nextDraw) {
                      var _ndTs = _nextDraw.getTime();
                      // Só mostra se o próximo sorteio está dentro do prazo do torneio (se houver)
                      if (!isNaN(_ndTs) && _ndTs > _now && (_tEndTs == null || _ndTs <= _tEndTs)) {
                        _ligaEvent = { ts: _ndTs, label: _t('tourn.nextDraw'), icon: '🎲', color: '#fb923c' };
                      }
                    }
                  }
                }
                // 3. Sem mais sorteios? → countdown para o fim do torneio
                if (!_ligaEvent && _tEndTs != null && _tEndTs > _now) {
                  _ligaEvent = { ts: _tEndTs, label: _t('event.tournamentEnd'), icon: '🏆', color: '#8b5cf6' };
                }
                if (!_ligaEvent) return '';
                var _countdownText = window._formatCountdown ? window._formatCountdown(_ligaEvent.ts - _now) : '';
                var _colorMap = { '#10b981': '16,185,129', '#fb923c': '251,146,60', '#8b5cf6': '139,92,246' };
                var _rgb = _colorMap[_ligaEvent.color] || '139,92,246';
                // v0.16.90: toggle Liga removido daqui — agora vive na linha
                // "Atualizado em..." acima (compartilhada entre lista e detalhe).
                // v2.6.21: em tarja escura (_pReadBg) o texto é CLARO (contraste);
                // sem tarja, usa a cor semântica sobre o tint claro.
                var _ctColor = _pReadBg ? _pReadFg : _ligaEvent.color;
                return '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 14px;background:' + (_pReadBg || ('rgba(' + _rgb + ',0.1)')) + ';border:1px solid rgba(' + _rgb + ',0.3);border-radius:12px;">' +
                  '<span style="font-size:1.3rem;">' + _ligaEvent.icon + '</span>' +
                  '<span style="font-size:0.85rem;font-weight:700;color:' + _ctColor + ';">' + _ligaEvent.label + '</span>' +
                  '<span data-countdown-target="' + _ligaEvent.ts + '" style="margin-left:auto;font-size:1.15rem;font-weight:900;color:' + _ctColor + ';font-variant-numeric:tabular-nums;letter-spacing:0.5px;">' + _countdownText + '</span>' +
                '</div>';
              }

              // Não-Liga: múltiplos countdowns (inscrições, início, fim)
              var _events = [];
              if (isAberto && t.registrationLimit) {
                var _rd = new Date(t.registrationLimit).getTime();
                if (!isNaN(_rd) && _rd > _now) _events.push({ ts: _rd, label: _t('event.enrollClose'), icon: '⏰', color: '#f59e0b' });
              }
              if (t.startDate) {
                var _sd2 = new Date(t.startDate).getTime();
                if (!isNaN(_sd2) && _sd2 > _now && !sorteioRealizado) _events.push({ ts: _sd2, label: _t('event.tournamentStart'), icon: '🏁', color: '#10b981' });
              }
              if (t.endDate) {
                var _ed = new Date(t.endDate).getTime();
                if (!isNaN(_ed) && _ed > _now) _events.push({ ts: _ed, label: _t('event.tournamentEnd'), icon: '🏆', color: '#8b5cf6' });
              }
              if (_events.length === 0) return '';
              _events.sort(function(a,b) { return a.ts - b.ts; });
              var _colorMap2 = { '#f59e0b': '245,158,11', '#10b981': '16,185,129', '#8b5cf6': '139,92,246' };
              var _next = _events[0];
              var _countdownText2 = window._formatCountdown ? window._formatCountdown(_next.ts - _now) : '';
              var _rgb2 = _colorMap2[_next.color] || '139,92,246';
              // v2.6.21: tarja escura → texto claro; sem tarja → cor semântica.
              var _ctColor2 = _pReadBg ? _pReadFg : _next.color;
              return '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 14px;background:' + (_pReadBg || ('rgba(' + _rgb2 + ',0.1)')) + ';border:1px solid rgba(' + _rgb2 + ',0.3);border-radius:12px;">' +
                '<span style="font-size:1.3rem;">' + _next.icon + '</span>' +
                '<span style="font-size:0.85rem;font-weight:700;color:' + _ctColor2 + ';">' + _next.label + '</span>' +
                '<span data-countdown-target="' + _next.ts + '" style="margin-left:auto;font-size:1.15rem;font-weight:900;color:' + _ctColor2 + ';font-variant-numeric:tabular-nums;letter-spacing:0.5px;">' + _countdownText2 + '</span>' +
              '</div>';
            })()}

            <!-- Linha separadora -->
            <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 1.8rem 0;"></div>

            <!-- Bottom Section -->
            <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center;">

               <!-- Stats Column -->
                <div style="display: inline-flex; flex-direction: column; gap: 8px; width: 100%;">
                    <div id="stat-boxes-row" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start;">
                        <div class="stat-box" data-stat="inscritos" ${_pReadBg ? 'style="background:'+_pReadBg+';color:'+_pReadFg+' !important;border:1px solid '+_pReadBd+';"' : ''}>
                           <span style="font-size: 1.1rem; margin-right: 4px;">👤</span>
                           <span class="stat-value" style="font-size: 1.4rem; font-weight: 800; line-height: 1; opacity: 0.95;">${individualCount}</span>
                           <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-left: 8px; opacity: 0.8;">Inscritos</span>
                        </div>
                        ${teamCount > 0 ? `
                        <div class="stat-box" data-stat="equipes" ${_pReadBg ? 'style="background:'+_pReadBg+';color:'+_pReadFg+' !important;border:1px solid '+_pReadBd+';"' : ''}>
                           <span style="font-size: 1.1rem; margin-right: 4px;">👥</span>
                           <span class="stat-value" style="font-size: 1.4rem; font-weight: 800; line-height: 1; opacity: 0.95;">${teamCount}</span>
                           <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-left: 8px; opacity: 0.8;">Equipes</span>
                        </div>
                        ` : ''}
                        ${standbyCount > 0 ? `
                        <div class="stat-box" data-stat="waitlist" style="background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3);">
                           <span style="font-size: 1.1rem; margin-right: 4px;">⏳</span>
                           <span class="stat-value" style="font-size: 1.4rem; font-weight: 800; line-height: 1; color: #fbbf24;">${standbyCount}</span>
                           <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; margin-left: 8px; color: #fbbf24; opacity: 0.9;">Lista de Espera</span>
                        </div>
                        ` : ''}
                    </div>
                    ${(typeof window._buildCategoryCountHtml === 'function') ? window._buildCategoryCountHtml(t) : ''}
                </div>

               <!-- Configuração Completa do Torneio (dinâmica, por formato) -->
               ${(typeof window._buildTournamentConfigBox === 'function')
                 ? window._buildTournamentConfigBox(t, { bg: _pReadBg || '', open: true })
                 : ''}
               ${(t.ligaSeasonMonths || t.rankingSeasonMonths) ? (() => {
                    const _sm = t.ligaSeasonMonths || t.rankingSeasonMonths;
                    if (!t.startDate) return '';
                    const _sd = new Date(t.startDate);
                    if (isNaN(_sd.getTime())) return '';
                    const _ed = new Date(_sd); _ed.setMonth(_ed.getMonth() + parseInt(_sm));
                    const _daysLeft = Math.ceil((_ed - new Date()) / 86400000);
                    if (!(_daysLeft > 0 && _daysLeft <= 7)) return '';
                    return `<div class="info-box" style="font-size:0.72rem;padding:5px 10px;border-radius:8px;margin-top:6px;color:#f59e0b;font-weight:700;${_pReadBg ? 'background:'+_pReadBg+';color:'+_pReadFg+' !important;border:1px solid '+_pReadBd+';' : ''}">⚠️ Temporada encerra em ${_daysLeft}d (${_ed.toLocaleDateString('pt-BR')})</div>`;
                  })() : ''}
            </div>

            ${(tournamentId && isOrg) ? (function() {
              // v1.6.1-beta: Árbitros button — só aparece quando resultEntry inclui 'referee'
              var _refEntry = t.resultEntry;
              var _hasRefereeEntry = Array.isArray(_refEntry)
                ? (_refEntry.indexOf('referee') !== -1)
                : (_refEntry === 'referee');
              var _arbitrosBtn = (_hasRefereeEntry && t.id)
                ? '<button class="btn hover-lift" style="background:linear-gradient(135deg,rgba(20,184,166,0.18),rgba(6,182,212,0.18));color:#2dd4bf;border:1px solid rgba(20,184,166,0.45);font-size:0.82rem;padding:8px 16px;border-radius:10px;font-weight:600;cursor:pointer;" onclick="event.stopPropagation();window.location.hash=\'#arbitros/' + t.id + '\'">🧑‍⚖️ Árbitros</button>'
                : '';
              return `
            <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.12);">
              <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.35); margin-bottom: 10px;">${_t('org.tools')}</div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${hasDraw ? `<button class="btn btn-primary hover-lift" onclick="window._scrollToBracketSection('${t.id}')">🏆 ${_t('btn.viewBracket')}</button>` : ''}
                ${!isFinished ? `<button class="btn btn-indigo hover-lift btn-shine" onclick="event.stopPropagation(); window.openEditModal('${t.id}')">✏️ ${_t('btn.edit')}</button>` : ''}
                ${t.status !== 'closed' ? `<button class="btn btn-purple hover-lift" onclick="event.stopPropagation(); window._sendOrgCommunication('${t.id}')">📢 ${_t('org.communicate')}</button>` : ''}
                <button class="btn btn-outline hover-lift" onclick="event.stopPropagation(); window._openCommunicationsPanel('${t.id}')">📊 Comunicados</button>
                ${addParticipantBtns}
                ${/* v1.9.98: CSV removido daqui — já está no grid de ações geral do organizador (Regras/Inscritos/Imprimir/CSV/Modo TV). Evita duplicação. */ ''}
                ${isOrg ? `<button class="btn btn-tool-amber hover-lift" onclick="event.stopPropagation(); window._saveAsTemplate('${t.id}')">💾 ${window._t ? window._t('btn.saveTemplate') : 'Salvar como Template'}</button>` : ''}
                ${categoriasBtn}
                ${enrollmentReportBtn}
                ${isOrg ? `<button class="btn btn-tool-indigo hover-lift" onclick="event.stopPropagation(); window._opOpenManage('${t.id}')">📊 Enquete</button>` : ''}
                ${_arbitrosBtn}
                ${toggleRegBtn}
                ${sortearBtn}
                ${sortearAberto}
                ${(!isFinished && hasDraw && !window._isLigaFormat(t)) ? `<button class="btn btn-tool-amber hover-lift" onclick="event.stopPropagation(); window.finishTournament('${t.id}')">🏁 ${_t('org.finishTournament')}</button>` : ''}
                ${/* v2.6.29/31: botão "Configurar Playoffs (Fase Final)" removido e o
                      módulo de playoff (tournaments-playoff.js, rota #fase-final,
                      _renderPlayoffSection) deletado de vez — confirmado que nenhum
                      torneio no banco usava. A fase final da Liga agora é uma fase do
                      construtor de fases (t.phases[]), adicionada em sequência à Liga. */ ''}
                ${(window.AppStore.isCreator(t) && hasDraw) ? `<button class="btn btn-tool-amber hover-lift" style="margin-top:4px;" onclick="event.stopPropagation(); window._resetTournamentToEnrollment('${t.id}')" title="Apaga sorteio, rodadas e fases; mantém os inscritos">🔄 Resetar (manter inscritos)</button>` : ''}
                ${(hasDraw && typeof window._isTestIdentity === 'function' && window._isTestIdentity()) ? `<button class="btn btn-purple hover-lift" style="margin-top:4px;" onclick="event.stopPropagation(); window._devSimulateCurrentPhase('${t.id}')" title="DEV (só você): simula os resultados da fase atual com horários reais">🎲 Simular fase (dev)</button>` : ''}
                ${window.AppStore.isCreator(t) ? `<button class="btn btn-danger hover-lift" style="margin-top:4px;" onclick="event.stopPropagation(); window.deleteTournamentFunction('${t.id}')">🗑️ ${_t('enroll.deleteTournament') || 'Apagar Torneio'}</button>` : ''}
              </div>
            </div>`;
            })() : ''}

            ${/* v2.1.51: box de progresso movido pra logo acima do badge
                  "Torneio em andamento" (topo do actionsHtml), abaixo das
                  Ferramentas do Organizador. */ ''}
            ${(tournamentId && typeof window._renderTournamentProgress === 'function') ? window._renderTournamentProgress(t) : ''}

            ${/* v2.1.13: ações gerais (Regras/Inscritos/Imprimir/CSV/Modo TV + pódio
                  quando encerrado) movidas pra DEPOIS das Ferramentas do Organizador,
                  ficando no pé do card. */ ''}
            ${actionsHtml}

          </div>
          ${isOrg ? `<div style="position:absolute;bottom:6px;right:8px;opacity:0.9;pointer-events:none;" title="Organizador">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(251,191,36,0.95)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </div>` : ''}
          ${(tournamentId && window.AppStore.isCreator(t)) ? `<div id="crown-org-btn" style="position:absolute;bottom:6px;right:8px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);box-shadow:0 4px 20px rgba(251,191,36,0.4),0 0 15px rgba(251,191,36,0.3);z-index:100;cursor:pointer;display:none;align-items:center;justify-content:center;transition:transform 0.2s,box-shadow 0.3s;animation:crownGlow 2s ease-in-out infinite;"
            ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';this.style.transform='scale(1.15)';"
            ondragleave="this.style.transform='scale(1)';"
            ondrop="this.style.transform='scale(1)';window._handleCrownDrop(event,'${t.id}')"
            onclick="window._openOrgPickerDialog('${t.id}')" title="${_t('org.organization')}">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#78350f"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </div>
          <style>@keyframes crownGlow{0%,100%{box-shadow:0 4px 20px rgba(251,191,36,0.4),0 0 15px rgba(251,191,36,0.3)}50%{box-shadow:0 4px 25px rgba(251,191,36,0.6),0 0 30px rgba(251,191,36,0.5)}}</style>` : ''}
        </div>
      `;
    };

    let gridHtml = '';
    if (visible.length === 0) {
        gridHtml = `<div class="card p-4 text-center" style="grid-column: 1/-1;"><p class="text-muted mt-3 mb-3">${_t('tournament.noTournamentsMsg')}</p></div>`;
    } else {
        gridHtml = visible.map(t => {
            const isOrg = typeof window.AppStore.isOrganizer === 'function' ? window.AppStore.isOrganizer(t) : false;
            return renderTournamentCard(t, isOrg);
        }).join('');
    }

    let headerHtml = (typeof window._renderBackHeader === 'function'
      ? window._renderBackHeader({ href: '#dashboard' })
      : '') + `
    <div class="d-flex justify-between align-center mb-4">
      <div>
        <h2>${_t('tournament.title')}</h2>
        <p class="text-muted">Gerencie ou inscreva-se nos torneios disponíveis.</p>
      </div>
    </div>
  `;

    let participantsHtml = '';
    var _organizersHtml = '';

    // ── One-time checks per tournament view (run once, not on every re-render from sort/scroll) ──
    var _checksKey = tournamentId ? ('_tournChecks_' + tournamentId) : null;
    var _checksRan = _checksKey && window[_checksKey];
    if (tournamentId && visible.length === 1 && !_checksRan) {
        if (_checksKey) window[_checksKey] = true;

        // v2.8.67: pop-up da enquete pro inscrito que ainda não votou (1x/sessão).
        if (typeof window._opMaybePopup === 'function') window._opMaybePopup(visible[0]);

        // Fix orphaned match names
        if (typeof window._fixOrphanedMatchNames === 'function') {
            var _orphanFixes = window._fixOrphanedMatchNames(visible[0]);
            if (_orphanFixes > 0) {
                setTimeout(function() { if (typeof window._softRefreshView === 'function') window._softRefreshView(); }, 600);
                return;
            }
        }

        // Auto-fix stale names (async Firestore check)
        if (typeof window._autoFixStaleNames === 'function') {
            window._autoFixStaleNames(visible[0].id).catch(function(e) { window._warn('Auto-fix stale names error:', e); });
        }

        // Deduplicação de participantes
        if (typeof window._deduplicateParticipants === 'function') {
            var _ddCount = window._deduplicateParticipants(visible[0]);
            if (_ddCount > 0 && window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
                window.FirestoreDB.saveTournament(visible[0]).catch(function() {});
            }
        }
    }

    // Build organizers section — always shown in detail view regardless of participants
    if (tournamentId && visible.length === 1) {
      (function() {
        var _t = visible[0];
        var _crownSvg = window._CROWN_SVG || '<svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(251,191,36,0.9)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        var _isCreatorNow = window.AppStore.isCreator(_t);
        var _competitors = typeof window._getCompetitors === 'function' ? window._getCompetitors(_t) : (_t.participants ? (Array.isArray(_t.participants) ? _t.participants : Object.values(_t.participants)) : []);

        var _orgCards = '';
        // Helper: build organizer card with avatar + crown next to name.
        // v2.4.83: quando isDropTarget=true (card do organizador principal, visto
        // pelo criador), o card vira ALVO DE SOLTAR — arrastar um inscrito até a
        // estrela do organizador "transforma" o card (pulsa + estrela brilha) e o
        // soltar abre o convite de co-organização (_handleCrownDrop).
        function _buildOrgCard(name, role, bgStyle, canRemove, removeEmail, isTapPicker) {
          var _oSeed = encodeURIComponent(name);
          var _oFallback = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _oSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
          var _oPhoto = (window._playerPhotoCache && window._playerPhotoCache[(name || '').toLowerCase()] && window._playerPhotoCache[(name || '').toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[(name || '').toLowerCase()] : _oFallback;
          var _safeTId = window._safeHtml(String(_t.id));
          // v2.8.52: card do organizador principal (criador) é TOCÁVEL → abre o seletor
          // de quem promover (entrada por toque, mobile). O ALVO de soltar é a VAGA
          // separada (_buildDropzone), que só aparece durante o arraste.
          var _tapAttrs = isTapPicker ? ' title="Toque para co-organizar" onclick="if(window._openOrgPickerDialog)window._openOrgPickerDialog(\'' + _safeTId + '\')"' : '';
          var _starSpan = '<span class="sp-org-star" style="display:inline-flex;align-items:center;flex-shrink:0;">' + _crownSvg + '</span>';
          return '<div class="sp-org-card"' + _tapAttrs + ' style="box-sizing:border-box;position:relative;' + (isTapPicker ? 'cursor:pointer;' : '') + 'display:flex;align-items:center;gap:8px;padding:8px 12px;' + bgStyle + 'border-radius:10px;flex:0 0 230px;height:58px;overflow:hidden;">' +
            '<img src="' + _oPhoto + '" onerror="this.onerror=null;this.src=\'' + _oFallback + '\'" data-player-name="' + window._safeHtml(name) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(99,102,241,0.3);" />' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="display:flex;align-items:center;gap:4px;font-weight:700;font-size:0.82rem;color:var(--text-bright);overflow:hidden;white-space:nowrap;">' + '<span style="overflow:hidden;text-overflow:ellipsis;min-width:0;">' + window._safeHtml(name) + '</span>' + _starSpan + '</div>' +
              '<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + role + '</div>' +
            '</div>' +
            (canRemove ? '<button style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.7rem;font-weight:900;padding:2px;line-height:1;flex-shrink:0;" title="Remover co-organizador" onclick="event.stopPropagation();window._removeCoHost(\'' + window._safeHtml(String(_t.id)) + '\',\'' + window._safeHtml(removeEmail) + '\')">✕</button>' : '') +
          '</div>';
        }
        // v2.8.48: convite de co-organização PENDENTE → box âmbar PONTILHADO ao lado
        // do organizador (onde a pessoa ficará se aceitar), já com a tag "Pendente de
        // aceite". Substitui o antigo "só na lista de inscritos". canRemove (criador)
        // mostra ✕ pra cancelar o convite.
        function _buildPendingOrgCard(name, removeKey, canRemove) {
          var _oSeed = encodeURIComponent(name || '?');
          var _oFallback = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _oSeed + '&backgroundColor=ffe7b3,ffd5dc,ffdfbf';
          var _lc = (name || '').toLowerCase();
          var _oPhoto = (window._playerPhotoCache && window._playerPhotoCache[_lc] && window._playerPhotoCache[_lc].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[_lc] : _oFallback;
          var _safeTId = window._safeHtml(String(_t.id));
          var _rmBtn = canRemove ? '<button style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.7rem;font-weight:900;padding:2px;line-height:1;flex-shrink:0;" title="Cancelar convite" onclick="event.stopPropagation();window._removeCoHost(\'' + _safeTId + '\',\'' + window._safeHtml(removeKey) + '\')">✕</button>' : '';
          return '<div class="sp-org-card sp-org-pending" style="box-sizing:border-box;position:relative;display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(251,191,36,0.08);border:2px dashed rgba(251,191,36,0.6);border-radius:10px;flex:0 0 230px;height:58px;overflow:hidden;">' +
            '<img src="' + _oPhoto + '" onerror="this.onerror=null;this.src=\'' + _oFallback + '\'" data-player-name="' + window._safeHtml(name) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(251,191,36,0.5);opacity:0.85;" />' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:700;font-size:0.82rem;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window._safeHtml(name) + '</div>' +
              '<div style="font-size:0.6rem;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:0.3px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">⭐ Pendente de aceite</div>' +
            '</div>' +
            _rmBtn +
          '</div>';
        }
        // v2.8.50: VAGA de co-organização — box dashed âmbar SEPARADO, à direita do
        // organizador, onde cai o co-org. É o alvo de soltar (drag) E o toque (picker).
        // Tem a classe .sp-org-droptarget → o listener global de dragstart o faz pulsar.
        function _buildDropzone() {
          var _safeTId = window._safeHtml(String(_t.id));
          // v2.8.52: MESMO tamanho do card do organizador; aparece SÓ durante o arraste
          // (CSS .sp-org-dropzone + body.sp-org-dragging). Estilo = barra dourada EM CIMA
          // (.sp-org-drop-hint) com estrela + "Arraste para co-organizar" (preferência do
          // dono); corpo limpo com estrela fraca, sem texto interno.
          return '<div class="sp-org-card sp-org-droptarget sp-org-dropzone" data-org-drop="1" title="Arraste um inscrito aqui para co-organizar" ' +
            'ondragover="event.preventDefault();event.dataTransfer.dropEffect=\'move\';this.classList.add(\'sp-org-drop-hover\');" ' +
            'ondragleave="this.classList.remove(\'sp-org-drop-hover\');" ' +
            'ondrop="this.classList.remove(\'sp-org-drop-hover\');if(window._handleCrownDrop)window._handleCrownDrop(event,\'' + _safeTId + '\')" ' +
            'style="box-sizing:border-box;position:relative;align-items:center;justify-content:center;padding:8px 12px;background:rgba(251,191,36,0.05);border:2px dashed rgba(251,191,36,0.55);border-radius:10px;flex:0 0 230px;height:58px;">' +
            '<div class="sp-org-drop-hint">⭐ Arraste para co-organizar</div>' +
            '<span class="sp-org-star" style="display:inline-flex;align-items:center;opacity:0.32;">' + _crownSvg + '</span>' +
          '</div>';
        }
        var _orgBgPrimary = 'background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1));border:1px solid rgba(99,102,241,0.3);';
        var _orgBgCohost = 'background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);';

        // Resolve organizer display name (prefer name, fallback to finding it from participants or current user)
        var _orgDisplayName = _t.organizerName;
        if (!_orgDisplayName && _t.organizerEmail) {
          // Try to find name from participants list
          var _partsArr = Array.isArray(_t.participants) ? _t.participants : (_t.participants ? Object.values(_t.participants) : []);
          for (var _oi = 0; _oi < _partsArr.length; _oi++) {
            var _op = _partsArr[_oi];
            if (typeof _op === 'object' && _op && (_op.email === _t.organizerEmail || _op.uid === _t.creatorUid)) {
              _orgDisplayName = _op.displayName || _op.name || '';
              break;
            }
          }
          // Try current user if they are the organizer
          if (!_orgDisplayName && window.AppStore.currentUser && window.AppStore.currentUser.email === _t.organizerEmail) {
            _orgDisplayName = window.AppStore.currentUser.displayName || '';
          }
        }
        if (!_orgDisplayName) _orgDisplayName = _t.organizerEmail;

        // Backfill organizerName if we found it and it was missing
        if (_orgDisplayName && _orgDisplayName !== _t.organizerEmail && !_t.organizerName) {
          _t.organizerName = _orgDisplayName;
        }

        // Primary organizer — always shown in Organização, regardless of self-enrollment
        var _gw = typeof window._genderWord === 'function' ? window._genderWord : function(_,m){return m;};
        var _cu2 = window.AppStore && window.AppStore.currentUser;
        // v2.4.6: rótulo de papel usa o gênero COLETIVO da organização. Em
        // português, basta UM homem na organização pra a forma ir pro masculino
        // ("Organizador"/"Co-organizador"); só vira feminino ("Organizadora"/
        // "Co-organizadora") quando TODA a organização é do gênero feminino.
        // Resolve o gênero de cada membro: usuário logado → participante → co-host.
        var _resolveOrgGender = function(email, uid) {
          var e = (email || '').toLowerCase();
          if (_cu2 && ((e && _cu2.email && String(_cu2.email).toLowerCase() === e) || (uid && _cu2.uid === uid)) && _cu2.gender) return _cu2.gender;
          var _pa = Array.isArray(_t.participants) ? _t.participants : (_t.participants ? Object.values(_t.participants) : []);
          for (var _gi = 0; _gi < _pa.length; _gi++) {
            var _pp = _pa[_gi];
            if (_pp && typeof _pp === 'object' && _pp.gender) {
              var _pe = (_pp.email || '').toLowerCase();
              if ((e && _pe === e) || (uid && _pp.uid === uid)) return _pp.gender;
            }
          }
          return '';
        };
        // v2.4.36: cada card de organização usa o gênero INDIVIDUAL daquela
        // pessoa — Organizador/Organizadora pro principal conforme o gênero dele,
        // Co-organizador/Co-organizadora pra cada co-org conforme o gênero dela.
        // Sem gênero conhecido → forma neutra "Organizador(a)" / "Co-organizador(a)".
        var _primaryGender = _resolveOrgGender(_t.organizerEmail, _t.creatorUid);
        var _orgRoleLabel = _gw(_primaryGender, 'Organizador', 'Organizadora');
        // Card principal vira alvo de soltar só pro CRIADOR (quem pode promover).
        // v2.8.50/52: o card do organizador NÃO é o alvo de soltar (sem dashed em
        // volta); o alvo é a VAGA separada (_buildDropzone, só aparece no arraste). O
        // card do CRIADOR é tocável → abre o seletor (entrada por toque no mobile).
        _orgCards += _buildOrgCard(_orgDisplayName, _orgRoleLabel, _orgBgPrimary, false, '', _isCreatorNow);
        if (Array.isArray(_t.coHosts)) {
          _t.coHosts.forEach(function(ch) {
            if (!ch) return;
            if (ch.status === 'active') {
              var _chGender = ch.gender || _resolveOrgGender(ch.email, ch.uid);
              var _chLabel = _gw(_chGender, 'Co-organizador', 'Co-organizadora');
              _orgCards += _buildOrgCard(ch.displayName || ch.email, _chLabel, _orgBgCohost, _isCreatorNow, ch.email);
            } else if (ch.status === 'pending') {
              // v2.8.48: convidado pendente aparece AQUI (box âmbar pontilhado, ao
              // lado do organizador), não mais só na lista de inscritos.
              _orgCards += _buildPendingOrgCard(ch.displayName || ch.email, ch.email || ch.uid || '', _isCreatorNow);
            }
          });
        }
        // VAGA de co-organização (alvo de drag + toque) — só pra quem pode promover.
        if (_isCreatorNow) _orgCards += _buildDropzone();
        // "Falar com o organizador" — visível só pra quem NÃO faz parte da
        // organização (participantes/visitantes logados). O próprio organizador
        // e co-organizadores não veem o botão.
        var _viewerIsOrg = (window.AppStore && typeof window.AppStore.isOrganizer === 'function') ? window.AppStore.isOrganizer(_t) : false;
        var _contactBtnHtml = '';
        // v2.4.82: botão canônico (padronizado com a dashboard) — azul=e-mail,
        // verde=WhatsApp via hidratação assíncrona conforme o telefone do org.
        if (_cu2 && !_viewerIsOrg && typeof window._contactOrgButtonHtml === 'function') {
          _contactBtnHtml = window._contactOrgButtonHtml(_t, {});
        }
        var _orgDropCss = '<style>' +
          '.sp-org-droptarget{transition:outline 0.15s,box-shadow 0.2s,transform 0.15s;}' +
          '.sp-org-droptarget .sp-org-star{transition:transform 0.2s,filter 0.2s;}' +
          '.sp-org-droptarget.sp-org-drag-active{outline:2px dashed rgba(251,191,36,0.7);outline-offset:3px;animation:spOrgPulse 1.3s ease-in-out infinite;}' +
          '.sp-org-droptarget.sp-org-drag-active .sp-org-star{transform:scale(1.45);filter:drop-shadow(0 0 6px rgba(251,191,36,0.9));}' +
          '.sp-org-droptarget.sp-org-drop-hover{outline:2px solid #fbbf24;outline-offset:4px;transform:scale(1.04);box-shadow:0 0 18px rgba(251,191,36,0.45);}' +
          '.sp-org-droptarget.sp-org-drop-hover .sp-org-star{transform:scale(1.7);filter:drop-shadow(0 0 8px rgba(251,191,36,1));}' +
          '.sp-org-drop-hint{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#1a1a2e;font-size:0.58rem;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);opacity:0;pointer-events:none;transition:opacity 0.15s;z-index:5;}' +
          '.sp-org-droptarget.sp-org-drag-active .sp-org-drop-hint{opacity:1;}' +
          // v2.8.52: a VAGA só aparece durante o arraste (body.sp-org-dragging).
          '.sp-org-dropzone{display:none !important;}' +
          'body.sp-org-dragging .sp-org-dropzone{display:flex !important;}' +
          '@keyframes spOrgPulse{0%,100%{box-shadow:0 0 0 rgba(251,191,36,0);}50%{box-shadow:0 0 16px rgba(251,191,36,0.4);}}' +
          '</style>';
        _organizersHtml = '<div style="margin-top:1.25rem;margin-bottom:0.5rem;">' + _orgDropCss +
          '<div style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:8px;">ORGANIZAÇÃO</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + _orgCards + '</div>' +
          _contactBtnHtml + '</div>';
      })();
    }

    if (tournamentId && visible.length === 1) {
        const t = visible[0];
        const isOrg = typeof window.AppStore.isOrganizer === 'function' ? window.AppStore.isOrganizer(t) : false;
        const _hasTournCats = (t.combinedCategories && t.combinedCategories.length > 0) || (t.genderCategories && t.genderCategories.length > 0) || (t.skillCategories && t.skillCategories.length > 0) || (t.ageCategories && t.ageCategories.length > 0);
        const parts = typeof window._getCompetitors === 'function' ? window._getCompetitors(t) : (t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : []);

        // Pre-load player photos for avatar display (async, updates DOM after load)
        if (typeof _preloadPlayerPhotos === 'function') {
            _preloadPlayerPhotos(t).then(function() {
                // Update all participant avatar images with real photos from cache
                var pImgs = container.querySelectorAll('img[data-player-name]');
                pImgs.forEach(function(img) {
                    var nm = img.getAttribute('data-player-name');
                    var real = window._playerPhotoCache && window._playerPhotoCache[(nm || '').toLowerCase()];
                    if (real && real.indexOf('dicebear.com') === -1 && img.src.indexOf('dicebear.com') !== -1) {
                        var fb = 'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(nm) + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                        img.onerror = function() { this.onerror = null; this.src = fb; };
                        img.src = real;
                    }
                });
            }).catch(function() {});
        }
        // v2.3.52: carrega perfis (gênero/nível/idade) e aplica nos badges de
        // meta dos cards de inscritos. Mesmos helpers compartilhados usados na
        // página #participants (store.js).
        // v2.4.70: hidrata pra TODOS os inscritos, não só o organizador — as
        // categorias são informação pública da chave.
        if (typeof window._loadParticipantProfilesByName === 'function') {
            window._loadParticipantProfilesByName(parts).then(function() {
                if (typeof window._patchProfileMetaSlots === 'function') window._patchProfileMetaSlots(container, t);
            }).catch(function() {});
        }
        // v2.7.97: conta PESSOAS (dupla = 2). Antes usava "/" no nome → dupla com
        // displayName sem "/" (ex.: "Kelly Barth", p1Name/p2Name) contava como 1
        // ("12 em vez de 13"). _personCount conta pela estrutura (p1Name && p2Name).
        let individualCountParts = (typeof window._personCount === 'function')
            ? window._personCount(t)
            : (function(){ var c = 0; parts.forEach(p => { const s = window._pName(p); c += s.includes('/') ? s.split('/').filter(n => n.trim().length > 0).length : 1; }); return c; })();

        if (parts.length > 0) {
            // Liga context: each participant has a ligaActive toggle (default ON; undefined ⇒ active)
            var _tIsLiga = !!(window._isLigaFormat && window._isLigaFormat(t));
            var _tCurUser = window.AppStore && window.AppStore.currentUser;
            var _tIsActive = function(p) {
              if (typeof p !== 'object' || !p) return true;
              return p.ligaActive !== false;
            };

            // Sort preference: alpha_asc/alpha_desc = alphabetical, chrono/chrono_desc = enrollment order, active_asc/active_desc = liga availability
            var _enrollSort = window._enrollSortMode || 'chrono';
            if (_enrollSort === 'alpha_asc' || _enrollSort === 'alpha_desc') {
                var _alphaDir = (_enrollSort === 'alpha_desc') ? -1 : 1;
                parts.sort(function(a, b) {
                    var nA = (typeof a === 'string' ? a : (a.displayName || a.name || '')).toLowerCase();
                    var nB = (typeof b === 'string' ? b : (b.displayName || b.name || '')).toLowerCase();
                    return _alphaDir * nA.localeCompare(nB, 'pt-BR', { sensitivity: 'base' });
                });
            } else if (_enrollSort === 'chrono_desc') {
                parts.reverse();
            } else if (_tIsLiga && (_enrollSort === 'active_asc' || _enrollSort === 'active_desc')) {
                var _actDir = (_enrollSort === 'active_desc') ? -1 : 1;
                parts.sort(function(a, b) {
                    var aA = _tIsActive(a) ? 0 : 1;
                    var bA = _tIsActive(b) ? 0 : 1;
                    return _actDir * (aA - bA);
                });
            }
            // (chrono = original array order = enrollment order, no sort needed)

            // Check-in state
            if (!t.checkedIn) t.checkedIn = {};
            const checkedIn = t.checkedIn;
            const hasMatches = (t.matches && t.matches.length > 0) || (t.rounds && t.rounds.length > 0) || (t.groups && t.groups.length > 0);
            const drawDone = hasMatches || t.status === 'started' || t.status === 'in_progress';

            // Check-in habilitado: sorteio feito E torneio iniciado (botão "Iniciar Torneio")
            const canCheckIn = drawDone && !!t.tournamentStarted;

            // Count check-in stats
            let totalIndividuals = 0;
            let checkedCount = 0;
            parts.forEach(p => {
                const pName = window._pName(p);
                if (pName.includes('/')) {
                    pName.split('/').forEach(n => {
                        const nm = n.trim();
                        if (nm) { totalIndividuals++; if (checkedIn[nm]) checkedCount++; }
                    });
                } else {
                    if (pName) { totalIndividuals++; if (checkedIn[pName]) checkedCount++; }
                }
            });

            // Current filter state
            const currentFilter = window._checkInFilter || 'all';

            // Build organizer emails + uids sets (shared by check-in and normal modes)
            // _orgUids é necessário para que co-organizadores com uid (mas sem email
            // no participant object) também mostrem a coroa.
            var _orgEmailsShared = {};
            var _orgUidsShared = {};
            _orgEmailsShared[t.organizerEmail] = true;
            if (t.creatorUid) _orgUidsShared[t.creatorUid] = true;
            if (Array.isArray(t.coHosts)) t.coHosts.forEach(function(ch) {
                if (ch.status === 'active') {
                    if (ch.email) _orgEmailsShared[ch.email] = true;
                    if (ch.uid)   _orgUidsShared[ch.uid]   = true;
                }
            });

            // ── Check-in mode: show each individual with checkbox ──
            let cardsStr = '';
            if (canCheckIn) {
                // Flatten all participants to individual names
                // v0.17.35: jogadores em t.woHistory pulam aqui — só aparecem
                // como cards solo via loop abaixo. Evita aparecer 2x.
                const _woHistCI = (t.woHistory && typeof t.woHistory === 'object') ? t.woHistory : {};
                const allIndividuals = [];
                parts.forEach((p, idx) => {
                    const pName = typeof p === 'string' ? p : (window._pName(p) || 'Participante ' + (idx + 1));
                    if (pName.includes('/')) {
                        // Find which team this person belongs to
                        pName.split('/').map(n => n.trim()).filter(n => n).forEach(n => {
                            if (_woHistCI[n]) return; // skip W.O.'d member
                            allIndividuals.push({ name: n, teamName: pName, teamIdx: idx });
                        });
                    } else {
                        if (_woHistCI[pName]) return;
                        allIndividuals.push({ name: pName, teamName: null, teamIdx: idx });
                    }
                });
                // v0.17.34: W.O.'d orphans (out of team, displayed solo with note)
                Object.keys(_woHistCI).forEach(woName => {
                    if (!woName) return;
                    const meta = _woHistCI[woName];
                    if (!meta || typeof meta !== 'object') return;
                    // Skip se o nome já existe na lista (foi re-adicionado de algum jeito)
                    const _exists = allIndividuals.some(ai => ai.name === woName);
                    if (_exists) return;
                    allIndividuals.push({ name: woName, teamName: null, teamIdx: -1, isWOOrphan: true, woMeta: meta });
                });

                // Sort: apply user preference, then unchecked first
                allIndividuals.sort((a, b) => {
                    const ac = !!checkedIn[a.name], bc = !!checkedIn[b.name];
                    if (ac !== bc) return ac ? 1 : -1; // unchecked first
                    if (_enrollSort === 'alpha_asc') return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
                    if (_enrollSort === 'alpha_desc') return b.name.localeCompare(a.name, 'pt-BR', { sensitivity: 'base' });
                    if (_enrollSort === 'chrono_desc') return b.teamIdx - a.teamIdx;
                    return 0; // chrono = original order
                });

                const _vipMapCI = t.vips || {};
                cardsStr = allIndividuals.map((ind, i) => {
                    const mc = !!checkedIn[ind.name];

                    // Filter
                    if (currentFilter === 'present' && !mc) return '';
                    if (currentFilter === 'absent' && mc) return '';

                    // v0.17.34: W.O. orphan branch
                    const _isWOOrphanCI = !!ind.isWOOrphan;
                    // v0.17.35: oculta membros W.O.'d do label do time —
                    // eles aparecem em cards solo separados; não devem
                    // poluir o time do parceiro.
                    let teamLabel = '';
                    if (ind.teamName) {
                      const _membersTL = ind.teamName.split('/').map(n => n.trim()).filter(n => n).filter(n => !_woHistCI[n]);
                      teamLabel = _membersTL.join(' / ');
                    }
                    const isVipCI = !!_vipMapCI[ind.name] || (ind.teamName && !!_vipMapCI[ind.teamName]);
                    const vipTagCI = isVipCI ? ' <span style="background:linear-gradient(135deg,#eab308,#fbbf24);color:#1a1a2e;font-size:0.55rem;font-weight:900;padding:1px 5px;border-radius:3px;letter-spacing:0.5px;">💎 VIP</span>' : '';

                    const _ciSeed = encodeURIComponent(ind.name);
                    const _ciAvatar = (window._playerPhotoCache && window._playerPhotoCache[ind.name.toLowerCase()] && window._playerPhotoCache[ind.name.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[ind.name.toLowerCase()] : 'https://api.dicebear.com/9.x/initials/svg?seed=' + _ciSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                    const _ciFallback = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _ciSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';

                    const _ciSafeName = ind.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const _ciSafeNameHtml = window._safeHtml(_ciSafeName);
                    const _ciIsOrg = typeof window._isOrgName === 'function' && window._isOrgName(ind.name, t);
                    const _ciCrownInline = _ciIsOrg ? ' <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(251,191,36,0.9)" style="flex-shrink:0;vertical-align:middle;margin-left:2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' : '';
                    const _ciPendBadge = (typeof window._pendingCoHostFor === 'function' && window._pendingCoHostFor(t, ind.name)) ? window._pendingCoHostBadgeHtml() : '';
                    var _ciMergeDrag = (isOrg && !_isWOOrphanCI) ? 'draggable="true" ondragstart="window._mergeDragStart(event, \'' + _ciSafeName + '\', \'' + t.id + '\')" ondragend="window._mergeDragEnd(event)" ondragover="event.preventDefault();event.dataTransfer.dropEffect=\'move\';" ondragenter="window._mergeDragEnter(event)" ondragleave="window._mergeDragLeave(event)" ondrop="event.stopPropagation();window._mergeDrop(event, \'' + _ciSafeName + '\', \'' + t.id + '\')"' : '';

                    if (_isWOOrphanCI && ind.woMeta) {
                      // v0.17.35: só "Estava no Jogo N com [parceiro]" — sem substituído.
                      const _woPartner = window._safeHtml(ind.woMeta.partner || '');
                      const _woMatchN = ind.woMeta.matchNum || '?';
                      return `
                        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);opacity:0.75;transition:all 0.2s;">
                            <img src="${_ciAvatar}" onerror="this.onerror=null;this.src='${_ciFallback}'" data-player-name="${window._safeHtml(ind.name)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(239,68,68,0.3);filter:grayscale(0.5);" />
                            <div style="flex:1;overflow:hidden;">
                                <div style="font-weight:600;font-size:0.92rem;color:#f87171;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:line-through;text-decoration-color:rgba(248,113,113,0.4);">${window._safeHtml(ind.name)}${_ciCrownInline}${vipTagCI}</div>
                                <div style="font-size:0.7rem;color:#f87171;margin-top:2px;font-weight:600;">❌ W.O. — Estava no Jogo ${_woMatchN}${_woPartner ? ` com <span style="color:#94a3b8;font-weight:500;">${_woPartner}</span>` : ''}</div>
                            </div>
                            <div style="font-size:0.7rem;font-weight:800;padding:2px 8px;border-radius:8px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);">W.O.</div>
                        </div>`;
                    }
                    return `
                      <div data-merge-name="${window._safeHtml(ind.name)}" ${_ciMergeDrag} style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:${mc ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)'};border:1px solid ${mc ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'};${isVipCI ? 'border-left:3px solid #fbbf24;' : ''}transition:all 0.2s;cursor:pointer;" onclick="window._toggleCheckIn('${t.id}', '${_ciSafeName}')">
                          <label class="toggle-switch toggle-sm" style="--toggle-on-bg:#10b981;--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:#10b981;" onclick="event.stopPropagation();"><input type="checkbox" ${mc ? 'checked' : ''} onclick="event.stopPropagation(); window._toggleCheckIn('${t.id}', '${_ciSafeName}');"><span class="toggle-slider"></span></label>
                          <img src="${_ciAvatar}" onerror="this.onerror=null;this.src='${_ciFallback}'" data-player-name="${window._safeHtml(ind.name)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${mc ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'};" />
                          <div style="flex:1;overflow:hidden;">
                              <div style="font-weight:600;font-size:0.92rem;color:${mc ? '#4ade80' : 'var(--text-bright)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${mc ? 'text-decoration:line-through;text-decoration-color:rgba(74,222,128,0.3);' : ''}">${window._safeHtml(ind.name)}${_ciCrownInline}${vipTagCI}${_ciPendBadge}</div>
                              ${teamLabel ? `<div style="font-size:0.7rem;color:var(--text-muted);opacity:0.5;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${window._safeHtml(teamLabel)}</div>` : ''}
                          </div>
                          <div style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:8px;${mc ? 'background:rgba(16,185,129,0.15);color:#4ade80;' : 'background:rgba(239,68,68,0.12);color:#f87171;'}">${mc ? 'Presente' : 'Ausente'}</div>
                      </div>`;
                }).join('');
            } else {
                // ── Normal mode: show teams/individuals with drag, split, delete, VIP ──
                const _vipMap = t.vips || {};
                // Use shared organizer emails + uids sets
                var _orgEmails = _orgEmailsShared;
                var _orgUidsSort = _orgUidsShared;

                // Sort: respect user sort preference, with organizers first as secondary.
                // For active_asc/active_desc we skip the organizer-first rule so the
                // availability axis is the dominant ordering (what the user asked for).
                var _sortedParts = parts.slice().sort(function(a, b) {
                  if (_tIsLiga && (_enrollSort === 'active_asc' || _enrollSort === 'active_desc')) {
                    var aActive = _tIsActive(a) ? 0 : 1;
                    var bActive = _tIsActive(b) ? 0 : 1;
                    if (aActive !== bActive) return (_enrollSort === 'active_desc' ? -1 : 1) * (aActive - bActive);
                    return parts.indexOf(a) - parts.indexOf(b);
                  }
                  var aEmail = (typeof a === 'object' ? (a.email || '') : '');
                  var bEmail = (typeof b === 'object' ? (b.email || '') : '');
                  var aUid   = (typeof a === 'object' ? (a.uid   || '') : '');
                  var bUid   = (typeof b === 'object' ? (b.uid   || '') : '');
                  var aIsOrg = (_orgEmails[aEmail] || _orgUidsSort[aUid]) ? 0 : 1;
                  var bIsOrg = (_orgEmails[bEmail] || _orgUidsSort[bUid]) ? 0 : 1;
                  if (aIsOrg !== bIsOrg) return aIsOrg - bIsOrg; // organizers first
                  if (_enrollSort === 'alpha_asc' || _enrollSort === 'alpha_desc') {
                    var nA = (typeof a === 'string' ? a : (a.displayName || a.name || '')).toLowerCase();
                    var nB = (typeof b === 'string' ? b : (b.displayName || b.name || '')).toLowerCase();
                    return (_enrollSort === 'alpha_desc' ? -1 : 1) * nA.localeCompare(nB, 'pt-BR', { sensitivity: 'base' });
                  }
                  // chrono / chrono_desc: o bloco de ordenação ACIMA já ordenou
                  // `parts` (inclusive o reverse no chrono_desc). Aqui só preservamos
                  // essa ordem — re-reverter anulava o toggle (bug: "não muda nada").
                  return parts.indexOf(a) - parts.indexOf(b);
                });

                // v2.7.92: número = ORDEM DE INSCRIÇÃO canônica (uid-keyed), igual em TODOS os cards
                // (inline, dupla, #participants). Antes o inline usava a posição na lista exibida.
                const _enrollOrderMap = window._buildEnrollOrderMap(t);
                cardsStr = _sortedParts.map((p, sortedIdx) => {
                    // Use original index in parts array for drag operations
                    var idx = parts.indexOf(p);
                    if (idx === -1) idx = sortedIdx;
                    const pName = typeof p === 'string' ? p : (window._pName(p) || 'Participante ' + (sortedIdx + 1));
                    const isTeam = pName.includes('/');
                    const isVip = !!_vipMap[pName];
                    const safeP = pName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                    let cardStyle = '';
                    if (isVip) {
                        cardStyle = 'background: linear-gradient(135deg, rgba(161,98,7,0.5) 0%, rgba(234,179,8,0.35) 100%); border: 2px solid rgba(251,191,36,0.7); box-shadow: 0 0 12px rgba(251,191,36,0.15);';
                    } else if (isTeam) {
                        cardStyle = 'background: linear-gradient(135deg, rgba(15, 118, 110, 0.6) 0%, rgba(20, 184, 166, 0.6) 100%); border: 1px solid rgba(20, 184, 166, 0.5);';
                    } else {
                        cardStyle = 'background: linear-gradient(135deg, rgba(67, 56, 202, 0.6) 0%, rgba(99, 102, 241, 0.6) 100%); border: 1px solid rgba(99, 102, 241, 0.5);';
                    }

                    let pNameHtml = '';
                    if (isTeam) {
                        const members = pName.split('/').map(n => n.trim()).filter(n => n);
                        pNameHtml = members.map((n, i) => {
                            const _mSeed = encodeURIComponent(n);
                            const _mPhoto = (window._playerPhotoCache && window._playerPhotoCache[n.toLowerCase()] && window._playerPhotoCache[n.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[n.toLowerCase()] : 'https://api.dicebear.com/9.x/initials/svg?seed=' + _mSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                            const _mFallback = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _mSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                            const _mIsOrg = typeof window._isOrgName === 'function' && window._isOrgName(n, t);
                            const _mCrown = _mIsOrg ? ' <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(251,191,36,0.9)" style="flex-shrink:0;margin-left:2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' : '';
                            const _mPend = (typeof window._pendingCoHostFor === 'function' && window._pendingCoHostFor(t, n)) ? window._pendingCoHostBadgeHtml() : '';
                            const _mNSafe = n.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                            return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;overflow:hidden;cursor:pointer;" onclick="event.stopPropagation();if(typeof window._openPlayerProfile==='function')window._openPlayerProfile('${_mNSafe}',{tournamentId:'${t.id}'})" title="Ver perfil de ${window._safeHtml(n)}"><img src="${_mPhoto}" onerror="this.onerror=null;this.src='${_mFallback}'" data-player-name="${window._safeHtml(n)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span style="font-weight:700;font-size:0.95rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${window._safeHtml(n)}</span>${_mCrown}${_mPend}</div>`;
                        }).join('');
                    } else {
                        const _pSeed = encodeURIComponent(pName);
                        const _pPhoto = (window._playerPhotoCache && window._playerPhotoCache[pName.toLowerCase()] && window._playerPhotoCache[pName.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[pName.toLowerCase()] : 'https://api.dicebear.com/9.x/initials/svg?seed=' + _pSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                        const _pFallback = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _pSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                        // Crown detection: uid é mais confiável que email.
                        // _orgUids inclui creatorUid + uids dos co-hosts ativos.
                        // _orgEmails inclui organizerEmail + emails dos co-hosts ativos.
                        // Fallback para email só quando não há uid (inscrições legadas).
                        // Evita coroa falsa por contaminação de sessão (phone-only com
                        // email errado gravado) — uid match é o critério primário.
                        var _pUid   = typeof p === 'object' ? (p.uid   || '') : '';
                        var _pEmail = typeof p === 'object' ? (p.email || '') : '';
                        var _orgEmails = _orgEmailsShared;
                        var _orgUids   = _orgUidsShared;
                        var _isOrgParticipant = _pUid
                          ? !!_orgUids[_pUid]                  // uid match: org ou co-host ativo
                          : (_pEmail && !!_orgEmails[_pEmail]); // fallback email para legados
                        var _crownInline = _isOrgParticipant ? ' <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(251,191,36,0.9)" style="flex-shrink:0;margin-left:2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' : '';
                        // v2.7.74: sem estrela VIP ao lado do nome — o card dourado + o botão
                        // VIP ativo já indicam (igual ao card #participants, canônico).
                        var _vipInline = '';
                        var _pPendBadge = (typeof window._pendingCoHostFor === 'function' && window._pendingCoHostFor(t, pName, _pUid, _pEmail)) ? window._pendingCoHostBadgeHtml() : '';
                        const _pNSafe = pName.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                        const _pUidOpts = _pUid ? (',uid:\''+_pUid+'\'') : '';
                        pNameHtml = `<div style="display:flex;align-items:center;gap:8px;overflow:hidden;cursor:pointer;" onclick="event.stopPropagation();if(typeof window._openPlayerProfile==='function')window._openPlayerProfile('${_pNSafe}',{tournamentId:'${t.id}'${_pUidOpts}})" title="Ver perfil de ${window._safeHtml(pName)}"><img src="${_pPhoto}" onerror="this.onerror=null;this.src='${_pFallback}'" data-player-name="${window._safeHtml(pName)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span style="font-weight:600;font-size:0.95rem;color:var(--text-bright);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">${window._safeHtml(pName)}</span>${_crownInline}${_vipInline}${_pPendBadge}</div>`;
                    }

                    const vipBadge = isVip ? '<span style="background:linear-gradient(135deg,#eab308,#fbbf24);color:#1a1a2e;font-size:0.6rem;font-weight:900;padding:1px 6px;border-radius:4px;letter-spacing:0.5px;margin-left:4px;">💎 VIP</span>' : '';
                    // Label de tipo: origem da equipe
                    const _teamOrigins = t.teamOrigins || {};
                    let _teamLabel = _t('tourn.individualEnroll');
                    if (isTeam) {
                        const origin = _teamOrigins[pName];
                        if (origin === 'inscrita') _teamLabel = _t('tourn.teamEnrolled');
                        else if (origin === 'sorteada') _teamLabel = _t('tourn.teamDrawn');
                        else if (origin === 'formada') _teamLabel = _t('tourn.teamFormed');
                        else _teamLabel = _t('tourn.teamFormed');
                    }
                    // Category badges — displayed below name as a separate row
                    const _pCatsRaw = window._getParticipantCategories(p);
                    const _validCats = (t.combinedCategories && t.combinedCategories.length > 0) ? t.combinedCategories : null;
                    const _pCats = _validCats ? _pCatsRaw.filter(function(c) { return _validCats.indexOf(c) !== -1; }) : _pCatsRaw;
                    const _pCatSource = typeof p === 'object' ? (p.categorySource || '') : '';
                    const _pWasUncat = typeof p === 'object' ? (p.wasUncategorized || false) : false;
                    // v2.4.39: a linha de cima (_profileMetaSlots) já mostra TUDO do
                    // perfil — gênero/habilidade/idade + tag "sem cat" colorida pros
                    // eixos que faltam. A linha de baixo é SÓ a atribuição do
                    // ORGANIZADOR pro torneio (categorySource 'organizador'), com
                    // "(org.)", quando ela difere da habilidade do perfil.
                    let catBadgeRow = '';
                    const _hasCatsForBadge = (t.combinedCategories && t.combinedCategories.length > 0) || (t.genderCategories && t.genderCategories.length > 0);
                    if (_hasCatsForBadge && _pCatSource === 'organizador' && _pCats.length > 0) {
                        var _orgSkill = window._profileMetaExtractSkill ? window._profileMetaExtractSkill(_pCats[0], t) : '';
                        var _profDoc = (window._partProfileByName && window._partProfileByName[String(pName).toLowerCase()]) || null;
                        var _profSkillRaw = (_profDoc && _profDoc.skillBySport && t.sport && _profDoc.skillBySport[t.sport])
                            || (typeof p === 'object' && p.skillBySport && t.sport ? p.skillBySport[t.sport] : '') || '';
                        var _profSkill = window._profileMetaExtractSkill ? window._profileMetaExtractSkill(_profSkillRaw, t) : '';
                        // mostra quando a categoria do org difere da habilidade do perfil
                        // (ou quando o perfil não tem habilidade — aí o org definiu mesmo).
                        if (!_profSkill || _profSkill !== _orgSkill) {
                            catBadgeRow = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;align-items:center;">' +
                                window._sortCategoriesBySkillOrder(_pCats, t.skillCategories).map(function(c) {
                                    return '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.25);">' + (window._displayCategoryName ? window._displayCategoryName(c) : c) + '</span>';
                                }).join('') +
                                ' <span style="font-size:0.55rem;color:var(--text-muted);opacity:0.7;">(org.)</span></div>';
                        }
                    }
                    // Enrollment type label — shown at bottom-left
                    // v2.7.74: sem tag VIP redundante (card dourado + botão VIP já indicam).
                    const typeLabel = _teamLabel;

                    let actionsHtml = '';
                    let dragProps = '';
                    // v2.0.2: botão Desfazer mesclagem quando o card resultou de mescla.
                    let undoMergeBtn = '';
                    if (isOrg && p && typeof p === 'object' && p._mergedFrom) {
                        undoMergeBtn = `<button title="Desfazer mesclagem" style="background:rgba(251,191,36,0.12);color:#fbbf24;border:1px dashed rgba(251,191,36,0.5);border-radius:6px;cursor:pointer;padding:2px 8px;font-size:0.75rem;transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='none'" onclick="event.stopPropagation(); window._undoMergeParticipant('${t.id}', '${safeP}');">↩️</button>`;
                    }
                    // Merge drag-and-drop: available for organizers AFTER draw (to fix duplicate names)
                    if (isOrg && drawDone) {
                        dragProps = `draggable="true" ondragstart="window._mergeDragStart(event, '${safeP}', '${t.id}')" ondragend="window._mergeDragEnd(event)" ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';" ondragenter="window._mergeDragEnter(event)" ondragleave="window._mergeDragLeave(event)" ondrop="window._mergeDrop(event, '${safeP}', '${t.id}')"`;
                    }
                    // v2.7.74: botões canônicos (btn-micro, altura fixa 24px) expostos pra
                    // montar a LINHA COMBINADA — VIP à esquerda com a meta; split/desfazer/excluir
                    // à direita. Igual ao card #participants.
                    let _vipBtn2 = '', _delBtn2 = '', _splitBtn2 = '';
                    if (isOrg && !drawDone) {
                        _vipBtn2 = `<button type="button" class="btn btn-micro" title="${isVip ? _t('tourn.removeVip') : _t('tourn.markVip')}" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.66rem;font-weight:800;border-radius:7px;flex-shrink:0;background: ${isVip ? 'linear-gradient(135deg,rgba(234,179,8,0.4),rgba(251,191,36,0.28))' : 'rgba(234,179,8,0.1)'}; color: ${isVip ? '#fbbf24' : '#d4a72a'}; border: 1px ${isVip ? 'solid rgba(251,191,36,0.65)' : 'dashed rgba(234,179,8,0.4)'};" onclick="event.stopPropagation(); window._toggleVip('${t.id}', '${safeP}');">💎 VIP</button>`;
                        _delBtn2 = `<button type="button" class="btn btn-micro" title="Remover" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.7rem;font-weight:800;flex-shrink:0;background:rgba(239,68,68,0.1);color:#ef4444;border:1px dashed rgba(239,68,68,0.5);" onclick="event.stopPropagation(); window.removeParticipantFunction('${t.id}', '${safeP}');">🗑️</button>`;
                        if (pName.includes('/')) {
                            _splitBtn2 = `<button type="button" class="btn btn-micro" title="Desfazer Equipe" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.7rem;font-weight:800;flex-shrink:0;background:rgba(14,165,233,0.1);color:#38bdf8;border:1px dashed #0ea5e9;" onclick="event.stopPropagation(); window.splitParticipantFunction('${t.id}', '${safeP}');">✂️</button>`;
                        }
                        dragProps = `draggable="true" ondragstart="window.handleDragStart(event, ${idx}, '${t.id}')" ondragend="window.handleDragEnd(event)" ondragover="window.handleDragOver(event)" ondragenter="window.handleDragEnter(event)" ondragleave="window.handleDragLeave(event)" ondrop="window.handleDropTeam(event, ${idx})"`;
                    }

                    // v2.7.92: ordem de inscrição canônica (uid-keyed); fallback p/ índice no array.
                    const bgNum = (window._enrollNumber ? window._enrollNumber(_enrollOrderMap, p) : '') || (idx + 1); // VIP aparece inline ao lado do nome

                    // Liga: per-card active/inactive toggle (default ON; undefined ⇒ active).
                    // Editable only for the current user's own entry; others render disabled.
                    // Positioned top-right aligned with the name — toggle is fixed, state label
                    // sits to the left of the toggle and its width varies with text ("ativado" / "desativado").
                    var ligaCardToggle = '';
                    if (_tIsLiga) {
                        var _lgActive = _tIsActive(p);
                        var _lgSelf = !!(_tCurUser && window._userMatchesParticipant && typeof p === 'object' && window._userMatchesParticipant(_tCurUser, p));
                        var _lgSafeTid = String(t.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        var _lgStateLabel = _lgActive ? 'ativado' : 'desativado';
                        var _lgStateColor = _lgActive ? '#34d399' : '#f87171';
                        var _lgToggleAttrs = _lgSelf
                            ? ('onclick="event.stopPropagation();" onchange="window._toggleLigaActive(\'' + _lgSafeTid + '\', this.checked)"')
                            : ('onclick="event.stopPropagation();" disabled');
                        var _lgWrapStyle = _lgSelf ? '' : 'opacity:0.6;cursor:not-allowed;';
                        var _lgTitle = _lgSelf
                            ? (_lgActive ? (_t('liga.clickToInactive') || 'Clique para ficar de fora do próximo sorteio') : (_t('liga.clickToActive') || 'Clique para voltar ao próximo sorteio'))
                            : (_t('liga.othersReadOnly') || 'Só o próprio participante pode alterar');
                        ligaCardToggle = '<div style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;margin-left:8px;position:relative;z-index:2;" title="' + window._safeHtml(_lgTitle) + '">' +
                            '<span style="font-size:0.68rem;font-weight:700;color:' + _lgStateColor + ';letter-spacing:0.2px;white-space:nowrap;text-align:right;">' + _lgStateLabel + '</span>' +
                            '<label class="toggle-switch toggle-sm" style="flex-shrink:0;' + _lgWrapStyle + '" onclick="event.stopPropagation();">' +
                                '<input type="checkbox" ' + (_lgActive ? 'checked' : '') + ' ' + _lgToggleAttrs + '>' +
                                '<span class="toggle-slider"></span>' +
                            '</label>' +
                        '</div>';
                    }

                    // v2.7.74: grupo de ações à direita da linha combinada (split/desfazer/excluir).
                    var _orgActions2 = (_splitBtn2 || undoMergeBtn || _delBtn2)
                        ? '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;margin-left:auto;">' + _splitBtn2 + undoMergeBtn + _delBtn2 + '</div>'
                        : '';

                    return `
                      <div class="participant-card" data-participant-name="${window._safeHtml(pName)}" data-merge-name="${window._safeHtml(pName)}" ${dragProps} style="${cardStyle} border-radius:12px;padding:12px;position:relative;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.1);transition:all 0.2s;${isOrg ? 'cursor:grab;' : ''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                          <div style="position:absolute;right:8px;bottom:6px;font-size:${String(bgNum).length > 2 ? '1.6rem' : '2rem'};font-weight:900;color:rgba(255,255,255,0.08);line-height:1;pointer-events:none;user-select:none;">${bgNum}</div>
                          <div style="position:relative;z-index:1;">
                              <!-- HEADER: avatar + nome + coroa (igual ao card #participants) | toggle ativado/desativado da Liga -->
                              <div style="display:flex;align-items:center;gap:8px;">
                                  <div style="flex:1;min-width:0;">${pNameHtml}</div>
                                  ${ligaCardToggle}
                              </div>
                              <!-- LINHA COMBINADA (canônica): VIP + meta + categoria (esquerda) | split/desfazer/excluir (direita) -->
                              <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                  <div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;">${_vipBtn2}${(typeof window._profileMetaSlots === 'function') ? window._profileMetaSlots(p, pName, isTeam, t, isOrg, { inline: true }) : ''}${catBadgeRow}</div>
                                  ${_orgActions2}
                              </div>
                              <!-- tipo de inscrição onde no pós-sorteio fica o jogo -->
                              ${typeLabel ? '<div style="font-size:0.65rem;color:var(--text-muted);opacity:0.5;margin-top:6px;">' + typeLabel + '</div>' : ''}
                          </div>
                      </div>`;
                }).join('');
            }

            // Filter buttons + progress (only when check-in is active)
            const absentCount = totalIndividuals - checkedCount;
            const pctPresent = totalIndividuals > 0 ? Math.round(checkedCount / totalIndividuals * 100) : 0;
            const checkInControls = canCheckIn ? `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem;flex-wrap:wrap;">
                    <button onclick="window._setCheckInFilter('${t.id}', 'all')" style="padding:6px 16px;border-radius:20px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid ${currentFilter === 'all' ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'all' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'all' ? '#a5b4fc' : 'var(--text-muted)'};">Todos (${totalIndividuals})</button>
                    <button onclick="window._setCheckInFilter('${t.id}', 'present')" style="padding:6px 16px;border-radius:20px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid ${currentFilter === 'present' ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'present' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'present' ? '#4ade80' : 'var(--text-muted)'};">Presentes (${checkedCount})</button>
                    <button onclick="window._setCheckInFilter('${t.id}', 'absent')" style="padding:6px 16px;border-radius:20px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid ${currentFilter === 'absent' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'absent' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'absent' ? '#f87171' : 'var(--text-muted)'};">Ausentes (${absentCount})</button>
                    <div style="flex:1;min-width:80px;background:rgba(255,255,255,0.06);border-radius:6px;height:8px;">
                        <div style="width:${pctPresent}%;height:100%;background:linear-gradient(90deg,#10b981,#4ade80);border-radius:6px;transition:width 0.3s;"></div>
                    </div>
                    <span style="font-size:0.8rem;color:#94a3b8;font-weight:700;">${pctPresent}%</span>
                    ${checkedCount > 0 ? `<button onclick="window._resetCheckIn('${t.id}')" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);padding:4px 12px;border-radius:8px;font-size:0.75rem;font-weight:600;cursor:pointer;">Limpar</button>` : ''}
                </div>
            ` : '';

            const gridStyle = canCheckIn
                ? 'display:flex;flex-direction:column;gap:6px;'
                : 'display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:1rem;';

            var _sortAlphaAsc = _enrollSort === 'alpha_asc';
            var _sortAlphaDesc = _enrollSort === 'alpha_desc';
            var _sortAlphaActive = _sortAlphaAsc || _sortAlphaDesc;
            var _sortChronoAsc = _enrollSort === 'chrono' || (!_enrollSort);
            var _sortChronoDesc = _enrollSort === 'chrono_desc';
            var _sortChronoActive = _sortChronoAsc || _sortChronoDesc;
            var _sortActiveAsc = _enrollSort === 'active_asc';
            var _sortActiveDesc = _enrollSort === 'active_desc';
            var _sortActiveActive = _sortActiveAsc || _sortActiveDesc;
            var _alphaLabel = _sortAlphaDesc ? _t('tourn.sortAlphaDesc') : _t('tourn.sortAlphaAsc');
            var _alphaNextMode = _sortAlphaAsc ? 'alpha_desc' : 'alpha_asc';
            var _chronoLabel = _sortChronoDesc ? '🕐 ↑' : '🕐 ↓';
            var _chronoNextMode = _sortChronoAsc ? 'chrono_desc' : 'chrono';
            var _activeLabel = _sortActiveDesc ? '🔴 ↑' : '🟢 ↓';
            var _activeNextMode = _sortActiveAsc ? 'active_desc' : 'active_asc';
            var _activeTitle = _sortActiveDesc ? (_t('liga.sortInactiveFirst') || 'Inativos primeiro') : (_t('liga.sortActiveFirst') || 'Ativos primeiro');
            var _ligaSortBtn = _tIsLiga ? `<button onclick="var _sy=window.scrollY;window._enrollSortMode='${_activeNextMode}';if(typeof renderTournaments==='function'){var c=document.getElementById('view-container');if(c)renderTournaments(c,'${t.id}');}setTimeout(function(){window.scrollTo(0,_sy);},50);" title="${_activeTitle}" style="padding:3px 10px;border-radius:0;font-size:0.72rem;font-weight:700;cursor:pointer;border:1px solid ${_sortActiveActive ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'};background:${_sortActiveActive ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)'};color:${_sortActiveActive ? '#a5b4fc' : 'var(--text-muted)'};transition:all 0.2s;border-left:0;">${_activeLabel}</button>` : '';
            var _alphaBtnRadius = 'border-radius:8px 0 0 8px;';
            var _chronoBtnRadius = _tIsLiga ? 'border-radius:0;' : 'border-radius:0 8px 8px 0;';
            var _activeBtnRadius = 'border-radius:0 8px 8px 0;';
            var _ligaSortBtnFinal = _ligaSortBtn.replace('border-radius:0;', _activeBtnRadius);
            var _sortBtns = `<div style="display:inline-flex;gap:2px;margin-left:auto;">
              <button onclick="var _sy=window.scrollY;window._enrollSortMode='${_alphaNextMode}';if(typeof renderTournaments==='function'){var c=document.getElementById('view-container');if(c)renderTournaments(c,'${t.id}');}setTimeout(function(){window.scrollTo(0,_sy);},50);" title="${_sortAlphaDesc ? _t('tourn.sortAlphaDesc') : _t('tourn.sortAlphaAsc')}" style="padding:3px 10px;${_alphaBtnRadius}font-size:0.72rem;font-weight:700;cursor:pointer;border:1px solid ${_sortAlphaActive ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'};background:${_sortAlphaActive ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)'};color:${_sortAlphaActive ? '#a5b4fc' : 'var(--text-muted)'};transition:all 0.2s;">${_alphaLabel}</button>
              <button onclick="var _sy=window.scrollY;window._enrollSortMode='${_chronoNextMode}';if(typeof renderTournaments==='function'){var c=document.getElementById('view-container');if(c)renderTournaments(c,'${t.id}');}setTimeout(function(){window.scrollTo(0,_sy);},50);" title="${_sortChronoDesc ? _t('tourn.sortChronoDesc') : _t('tourn.sortChronoAsc')}" style="padding:3px 10px;${_chronoBtnRadius}font-size:0.72rem;font-weight:700;cursor:pointer;border:1px solid ${_sortChronoActive ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'};background:${_sortChronoActive ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)'};color:${_sortChronoActive ? '#a5b4fc' : 'var(--text-muted)'};transition:all 0.2s;border-left:0;">${_chronoLabel}</button>
              ${_ligaSortBtnFinal}
            </div>`;

            // ── Torneios de duplas: layout em duas seções ─────────────────────────
            const _isDoublesTournament = (t.enrollmentMode === 'time' || t.enrollmentMode === 'misto') && parseInt(t.teamSize || 2) === 2;
            const _allParts = Array.isArray(t.participants) ? t.participants : [];
            // v2.7.90: dupla = entrada com p1Name E p2Name (verdade ESTRUTURAL) OU nome
            // "A / B" (legado). NÃO depender só de "/" no displayName: duplas formadas
            // pelo aceite de convite gravam displayName = só o nome do p1 (ex.: "Kelly
            // Barth", com p1Name/p2Name separados) — antes caíam em SOLO e o card da dupla
            // sumia (membros viravam solos fantasmas), por isso "os cards não indicavam".
            function _isPairEntry(p) {
              if (typeof p !== 'object' || !p) return false;
              if (p.p1Name && p.p2Name) return true;
              var n = p.displayName || p.name || '';
              return n.indexOf('/') !== -1;
            }
            const _pairedParticipants = _isDoublesTournament ? _allParts.filter(_isPairEntry) : [];
            // v2.7.92: número de inscrição CANÔNICO (uid-keyed) — mesmo em todos os cards.
            const _enrollOrderMapD = window._buildEnrollOrderMap(t);
            // v2.7.91/92: quem já é membro de uma dupla NUNCA aparece como solo — nem com
            // entrada solo DUPLICADA no participants[]. Identidade = UID; nome só entra como
            // chave pra membro SEM conta (princípio uid-first: nunca comparar conta por nome).
            var _pairedMemberKeys = {};
            _pairedParticipants.forEach(function(pp) {
              if (pp.p1Uid) _pairedMemberKeys['u:' + pp.p1Uid] = 1;
              else if (pp.p1Name) _pairedMemberKeys['n:' + String(pp.p1Name).trim().toLowerCase()] = 1;
              if (pp.p2Uid) _pairedMemberKeys['u:' + pp.p2Uid] = 1;
              else if (pp.p2Name) _pairedMemberKeys['n:' + String(pp.p2Name).trim().toLowerCase()] = 1;
            });
            const _soloParticipants = _isDoublesTournament ? _allParts.filter(function(p) {
              if (_isPairEntry(p)) return false;
              var u = typeof p === 'object' ? (p.uid || '') : '';
              if (u) return !_pairedMemberKeys['u:' + u];   // com conta: SÓ uid decide (nunca nome)
              var n = (typeof p === 'string' ? p : (p.displayName || p.name || '')).trim().toLowerCase();
              return !(n && _pairedMemberKeys['n:' + n]);    // sem conta: nome é o único id
            }) : [];

            function _duplaCard(p, draggable, tIdStr) {
              var nm   = typeof p === 'string' ? p : (p.displayName || p.name || '');
              var uid  = typeof p === 'object' ? (p.uid  || '') : '';
              var email= typeof p === 'object' ? (p.email|| '') : '';
              // Foto: busca do _playerPhotoCache (preloaded por uid no bracket.js)
              var _seed = encodeURIComponent(nm);
              var _fb   = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _seed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
              var _photo = (window._playerPhotoCache && window._playerPhotoCache[nm.toLowerCase()] && window._playerPhotoCache[nm.toLowerCase()].indexOf('dicebear.com') === -1)
                ? window._playerPhotoCache[nm.toLowerCase()] : _fb;
              // Coroa se for organizador
              var _isOrgP = uid ? !!_orgUidsShared[uid] : (email && !!_orgEmailsShared[email]);
              var _crown  = _isOrgP ? ' <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(251,191,36,0.9)" style="flex-shrink:0;margin-left:2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' : '';
              // Membros da dupla (para cards formados) — v2.7.90: p1Name/p2Name primeiro
              // (verdade estrutural), só caindo pro split "A / B" quando faltam os campos.
              var members = (typeof p === 'object' && p && p.p1Name && p.p2Name)
                ? [String(p.p1Name).trim(), String(p.p2Name).trim()].filter(Boolean)
                : (nm.includes('/') ? nm.split('/').map(function(s){return s.trim();}).filter(Boolean) : null);
              var nameHtml;
              if (members) {
                nameHtml = members.map(function(n) {
                  var ms='https://api.dicebear.com/9.x/initials/svg?seed='+encodeURIComponent(n)+'&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                  var mp=(window._playerPhotoCache&&window._playerPhotoCache[n.toLowerCase()]&&window._playerPhotoCache[n.toLowerCase()].indexOf('dicebear.com')===-1)?window._playerPhotoCache[n.toLowerCase()]:ms;
                  return '<div style="display:flex;align-items:center;gap:6px;overflow:hidden;margin-bottom:2px;"><img src="'+window._safeHtml(mp)+'" onerror="this.onerror=null;this.src=\''+ms+'\'" data-player-name="'+window._safeHtml(n)+'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span style="font-weight:700;font-size:0.92rem;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+window._safeHtml(n)+'</span></div>';
                }).join('');
              } else {
                nameHtml = '<div style="display:flex;align-items:center;gap:8px;overflow:hidden;"><img src="'+window._safeHtml(_photo)+'" onerror="this.onerror=null;this.src=\''+_fb+'\'" data-player-name="'+window._safeHtml(nm)+'" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span style="font-weight:600;font-size:0.95rem;color:var(--text-bright);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">'+window._safeHtml(nm)+'</span>'+_crown+'</div>';
              }
              // Estilo igual ao card normal
              var bgStyle = draggable
                ? 'background:linear-gradient(135deg,rgba(67,56,202,0.6),rgba(99,102,241,0.6));border:1px solid rgba(99,102,241,0.5);'
                : 'background:linear-gradient(135deg,rgba(15,118,110,0.6),rgba(20,184,166,0.6));border:1px solid rgba(20,184,166,0.5);';
              // v2.7.93: participante só pode arrastar pra formar dupla se a REGRA permitir
              // (manualPairing === 'open'); organizador sempre pode. Quando não pode, o card
              // de solo NEM fica arrastável (antes arrastava, soltava e só então dizia "não pode").
              var _canPairDrag = isOrg || (t && t.manualPairing === 'open');
              var dragAttrs = (draggable && _canPairDrag)
                ? 'draggable="true" ondragstart="window._duplaDragStart(event,\'' + _safeAttr(uid||nm) + '\',\'' + _safeAttr(tIdStr) + '\')" ondragover="event.preventDefault();this.style.outline=\'3px solid #f59e0b\'" ondragleave="this.style.outline=\'\'" ondrop="event.preventDefault();this.style.outline=\'\';window._duplaDropOn(event,\'' + _safeAttr(uid||nm) + '\',\'' + _safeAttr(tIdStr) + '\')"'
                : '';
              var labelHtml = !draggable
                ? '<div style="font-size:0.65rem;color:#34d399;margin-top:3px;">✅ Dupla formada</div>'
                : (_canPairDrag
                    ? '<div style="font-size:0.65rem;color:rgba(255,255,255,0.45);margin-top:3px;">Arraste para formar dupla</div>'
                    : '<div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:3px;">Sem dupla</div>');
              var desfazerBtn = (!draggable && isOrg)
                ? '<button type="button" class="btn btn-danger btn-micro" onclick="event.stopPropagation();window._splitDupla(\'' + _safeAttr(tIdStr) + '\',\'' + _safeAttr(nm) + '\')" title="Desfazer dupla" style="min-height:0;height:28px;line-height:1;padding:0 12px;font-size:0.72rem;font-weight:800;white-space:nowrap;flex-shrink:0;margin-left:6px;">↩️ Desfazer</button>'
                : '';
              // v2.7.87: DUPLA FORMADA em 2 colunas — cada pessoa com as categorias DELA
              // logo abaixo do nome; 1ª à esquerda, 2ª à direita (mesma linha quando couber).
              // v2.7.99: número de inscrição POR PESSOA, VISÍVEL (não marca-d'água atrás
              // da foto). Cada membro mostra o SEU nº de inscrição original na borda externa
              // do seu lado: membro da ESQUERDA → nº à esquerda; da DIREITA → nº à direita.
              var _s1 = (members && window._enrollNumber) ? window._enrollNumber(_enrollOrderMapD, { uid: (p && p.p1Uid) || '', displayName: (p && p.p1Name) || members[0], name: (p && p.p1Name) || members[0] }) : '';
              var _s2 = (members && members[1] && window._enrollNumber) ? window._enrollNumber(_enrollOrderMapD, { uid: (p && p.p2Uid) || '', displayName: (p && p.p2Name) || members[1], name: (p && p.p2Name) || members[1] }) : '';
              var _body;
              if (members) {
                var _memBlock = function(n, right) {
                  var _ms = 'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(n) + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                  var _mp = (window._playerPhotoCache && window._playerPhotoCache[n.toLowerCase()] && window._playerPhotoCache[n.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[n.toLowerCase()] : _ms;
                  var _img = '<img src="' + window._safeHtml(_mp) + '" onerror="this.onerror=null;this.src=\'' + _ms + '\'" data-player-name="' + window._safeHtml(n) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;">';
                  // v2.8.68: nome NÃO trunca — quebra em até 2 linhas e a fonte ENCOLHE
                  // (auto-fit JS _fitTwoLineNames) até caber na altura do avatar (28px).
                  // class sp-fit-name + data-fit-h/max alimentam o medidor; avatar acompanha
                  // (align-items:center). title = nome completo no hover.
                  var _nmSpan = '<span class="sp-fit-name" title="' + window._safeHtml(n) + '" data-fit-h="28" data-fit-max="13.5" style="font-weight:700;font-size:13.5px;color:var(--text-bright);line-height:1.1;max-height:28px;overflow:hidden;word-break:break-word;min-width:0;">' + window._safeHtml(n) + '</span>';
                  var _av = right
                    ? '<div style="display:flex;align-items:center;gap:7px;max-width:100%;min-width:0;justify-content:flex-end;">' + _img + _nmSpan + '</div>'
                    : '<div style="display:flex;align-items:center;gap:7px;max-width:100%;min-width:0;">' + _img + _nmSpan + '</div>';
                  var _meta = (typeof window._profileMetaSlots === 'function') ? window._profileMetaSlots({ displayName: n, name: n }, n, false, t, isOrg) : '';
                  return '<div style="min-width:0;display:flex;flex-direction:column;gap:4px;flex:1 1 42%;' + (right ? 'align-items:flex-end;text-align:right;' : 'align-items:flex-start;') + '">' + _av + _meta + '</div>';
                };
                _body = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' + _memBlock(members[0], false) + (members[1] ? _memBlock(members[1], true) : '') + '</div>';
              } else {
                _body = nameHtml + ((typeof window._profileMetaSlots === 'function') ? window._profileMetaSlots(p, nm, false, t, isOrg) : '');
              }
              // v2.8.49: número de inscrição como MARCA D'ÁGUA no fundo do card (igual ao
              // card individual). Solo: 1 nº no canto sup. dir. Dupla: o nº ORIGINAL de cada
              // pessoa no SEU lado — esquerda→canto sup. esquerdo, direita→canto sup. direito.
              function _wmNum(seq, side) {
                // v2.8.53: delega pro helper canônico (SVG 90% da altura do card).
                return (window._enrollNumberBadge) ? window._enrollNumberBadge(seq, side) : '';
              }
              var _enrollBadge = (!members && window._enrollNumberBadge && window._enrollNumber)
                ? window._enrollNumberBadge(window._enrollNumber(_enrollOrderMapD, p))
                : '';
              var _wmL = members ? _wmNum(_s1, 'left') : '';
              var _wmR = (members && members[1]) ? _wmNum(_s2, 'right') : '';
              return '<div class="participant-card" data-participant-name="' + window._safeHtml(nm) + '" ' + dragAttrs +
                ' style="' + bgStyle + 'border-radius:12px;padding:12px;position:relative;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.1);transition:all 0.2s;' + (draggable && _canPairDrag ? 'cursor:grab;' : '') + '" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'none\'">' +
                _enrollBadge + _wmL + _wmR +
                '<div style="position:relative;z-index:1;display:flex;flex-direction:column;gap:6px;">' +
                  _body +
                  '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                    labelHtml +
                    desfazerBtn +
                  '</div>' +
                '</div></div>';
            }
            function _safeAttr(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

            if (_isDoublesTournament && !drawDone) {
              // v2.7.89: convite pendente vira CARD DE DUPLA PENDENTE (âmbar) DENTRO da
              // seção "Sem dupla" — visível a todos. Os dois envolvidos saem da lista de
              // solos (estão em dupla pendente). Botões por papel: convidante = "Cancelar
              // convite"; convidado = "Confirmar/Cancelar"; demais = sem botão.
              var _cuUid = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid) || '';
              var _reqs = Array.isArray(t.pairRequests) ? t.pairRequests : [];
              var _pendUids = {};
              _reqs.forEach(function(r){ if (r && r.inviterUid) _pendUids[r.inviterUid] = 1; if (r && r.inviteeUid) _pendUids[r.inviteeUid] = 1; });
              var _soloAvailable = _soloParticipants.filter(function(p){ var u = typeof p === 'object' ? (p.uid || '') : ''; return !(u && _pendUids[u]); });
              // v2.7.93: bloco de membro do card PENDENTE — igual ao da dupla FORMADA
              // (avatar + nome + categorias da pessoa abaixo), 1º à esquerda, 2º à direita.
              var _pendMemBlock = function(n, right){
                var _ms = 'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(n) + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
                var _mp = (window._playerPhotoCache && window._playerPhotoCache[n.toLowerCase()] && window._playerPhotoCache[n.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[n.toLowerCase()] : _ms;
                var _av = '<div style="display:flex;align-items:center;gap:6px;overflow:hidden;max-width:100%;"><img src="' + window._safeHtml(_mp) + '" onerror="this.onerror=null;this.src=\'' + _ms + '\'" data-player-name="' + window._safeHtml(n) + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span style="font-weight:700;font-size:0.9rem;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window._safeHtml(n) + '</span></div>';
                var _meta = (typeof window._profileMetaSlots === 'function') ? window._profileMetaSlots({ displayName: n, name: n }, n, false, t, isOrg) : '';
                return '<div style="min-width:0;display:flex;flex-direction:column;gap:2px;flex:1 1 40%;' + (right ? 'align-items:flex-end;text-align:right;' : 'align-items:flex-start;') + '">' + _av + _meta + '</div>';
              };
              var _pendingCard = function(r){
                var amInvitee = _cuUid && r.inviteeUid === _cuUid;
                var amInviter = _cuUid && r.inviterUid === _cuUid;
                var tIdA = _safeAttr(String(t.id)), rIdA = _safeAttr(r.id);
                var _bConfirm = '<button type="button" class="btn btn-success btn-micro" style="min-height:0;height:28px;line-height:1;padding:0 11px;font-size:0.72rem;font-weight:800;" onclick="event.stopPropagation();window._acceptPairRequest(\'' + tIdA + '\',\'' + rIdA + '\')">✅ Confirmar</button>';
                var _bCancel = function(label){ return '<button type="button" class="btn btn-danger btn-micro" style="min-height:0;height:28px;line-height:1;padding:0 11px;font-size:0.72rem;font-weight:800;" onclick="event.stopPropagation();window._cancelPairRequest(\'' + tIdA + '\',\'' + rIdA + '\')">' + label + '</button>'; };
                var _btns = '';
                // v2.7.93: alinhados à DIREITA, embaixo. Convidado: Cancelar à ESQUERDA, Confirmar à DIREITA.
                if (amInvitee)      _btns = _bCancel('❌ Cancelar') + _bConfirm;
                else if (amInviter) _btns = _bCancel('Cancelar convite');
                else if (isOrg)     _btns = _bCancel('Cancelar');
                var _status = amInvitee ? ('⏳ ' + window._safeHtml(r.inviterName || 'Alguém') + ' te convidou — aceite ou recuse')
                            : amInviter ? ('⏳ Você convidou ' + window._safeHtml(r.inviteeName || '') + ' — aguardando aceite')
                            : '⏳ Dupla pendente — aguardando aceite';
                var _body = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' + _pendMemBlock(r.inviterName || '', false) + _pendMemBlock(r.inviteeName || '', true) + '</div>';
                return '<div style="background:linear-gradient(135deg,rgba(180,130,20,0.32),rgba(251,191,36,0.16));border:1px solid rgba(251,191,36,0.55);border-radius:12px;padding:10px 12px;box-shadow:0 4px 10px rgba(0,0,0,0.1);">' +
                  '<div style="display:flex;flex-direction:column;gap:8px;">' +
                    _body +
                    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
                      '<span style="font-size:0.72rem;color:#fbbf24;font-weight:600;min-width:0;flex:1 1 auto;">' + _status + '</span>' +
                      (_btns ? '<span style="display:flex;justify-content:flex-end;gap:6px;flex-shrink:0;white-space:nowrap;margin-left:auto;">' + _btns + '</span>' : '') +
                    '</div>' +
                  '</div></div>';
              };
              var _pendingCardsHtml = _reqs.length ? ('<div style="display:flex;flex-direction:column;gap:6px;' + (_soloAvailable.length ? 'margin-top:6px;' : '') + '">' + _reqs.map(_pendingCard).join('') + '</div>') : '';
              var _semDuplaTotal = _soloAvailable.length + _reqs.length;
              // Modo duplas pré-sorteio: Sem Dupla (solos arrastáveis + duplas pendentes âmbar) + Duplas formadas
              participantsHtml = `
                <div class="mt-5 mb-4">
                  <h3 style="margin-bottom:1.2rem;font-size:1.1rem;color:var(--text-bright);border-bottom:1px solid var(--border-color);padding-bottom:0.5rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    👥 Inscritos <span style="font-size:0.8rem;background:rgba(255,255,255,0.1);padding:3px 10px;border-radius:12px;font-weight:600;margin-left:5px;color:var(--text-muted);">${individualCountParts}</span>
                  </h3>

                  ${(_soloAvailable.length > 0 || _reqs.length > 0) ? `
                  <div style="margin-bottom:1.2rem;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
                      <span style="font-size:0.75rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:0.6px;">🙋 Sem dupla (${_semDuplaTotal})</span>
                      <span style="font-size:0.65rem;color:var(--text-muted);">${(isOrg || t.manualPairing === 'open') ? '— Arraste um card sobre outro para formar a dupla' : '— As duplas são formadas pelo organizador'}</span>
                    </div>
                    ${_soloAvailable.length > 0 ? `<div class="sp-dnd-host" style="display:flex;flex-direction:column;gap:6px;">${_soloAvailable.map(function(p) { return _duplaCard(p, true, String(t.id)); }).join('')}</div>` : ''}
                    ${_pendingCardsHtml}
                  </div>` : '<div style="margin-bottom:1rem;padding:10px 14px;border-radius:10px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);font-size:0.82rem;color:#34d399;text-align:center;">✅ Todos com dupla formada</div>'}

                  ${_pairedParticipants.length > 0 ? `
                  <div>
                    <div style="font-size:0.75rem;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">👫 Duplas formadas (${_pairedParticipants.length})</div>
                    <div class="sp-dnd-host" style="display:flex;flex-direction:column;gap:6px;">
                      ${_pairedParticipants.map(function(p) { return _duplaCard(p, false, String(t.id)); }).join('')}
                    </div>
                  </div>` : ''}

                  ${(_hasTournCats && isOrg) ? '<div id="inline-cat-mgr-' + t.id + '"></div>' : ''}
                </div>`;
            } else {
              // Modo normal (individual ou duplas pós-sorteio)
              participantsHtml = `
                <div class="mt-5 mb-4">
                   <h3 style="margin-bottom: 1.5rem; font-size: 1.3rem; color: var(--text-bright); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; display: flex; align-items: center; gap: 8px; flex-wrap:wrap;">
                      👥 Inscritos Confirmados <span style="font-size: 0.8rem; background: rgba(255,255,255,0.1); padding: 3px 10px; border-radius: 12px; font-weight: 600; margin-left: 5px; color: var(--text-muted);">${individualCountParts}</span>
                      ${_sortBtns}
                   </h3>
                   ${checkInControls}
                   ${isOrg && drawDone ? '<div style="font-size:0.72rem;color:var(--text-muted);opacity:0.6;margin-bottom:8px;font-style:italic;">💡 Segure e arraste um nome sobre outro para mesclar participantes duplicados</div>' : ''}
                   ${(window.AppStore.isCreator(t) && drawDone) ? '<div style="font-size:0.72rem;color:#fbbf24;margin-bottom:8px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.22);border-radius:8px;padding:6px 10px;">👑 <b>Compartilhar a organização:</b> arraste um inscrito até a <b>estrela do organizador</b> (no card da ORGANIZAÇÃO) — ela brilha quando você começa a arrastar. No celular, <b>toque na estrela do organizador</b> e escolha quem promover. Funciona durante o torneio também.</div>' : ''}
                   <div data-merge-container="${t.id}" class="sp-dnd-host" style="${gridStyle}">
                      ${cardsStr}
                   </div>
                   ${(_hasTournCats && isOrg) ? `<div id="inline-cat-mgr-${t.id}"></div>` : ''}
                </div>
            `;
            }
        }

        // Check if tournament has bracket content for "Só meus jogos" toggle
        const _hasDrawContent = visible.length > 0 && (
          (Array.isArray(visible[0].matches) && visible[0].matches.length > 0) ||
          (Array.isArray(visible[0].rounds) && visible[0].rounds.length > 0) ||
          (Array.isArray(visible[0].groups) && visible[0].groups.length > 0)
        );
        const _cuUser = window.AppStore && window.AppStore.currentUser;
        const _myToggleHtml = _cuUser && _hasDrawContent ? `
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;" class="no-print">
            <span style="font-size:0.72rem;font-weight:600;color:var(--text-muted);white-space:nowrap;">Só meus jogos</span>
            <label class="toggle-switch toggle-sm" style="--toggle-on-bg:#f59e0b;--toggle-on-glow:rgba(245,158,11,0.3);--toggle-on-border:#f59e0b;">
              <input type="checkbox" id="my-matches-toggle" onchange="window._toggleMyMatches(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>` : '';

        // Group nav buttons for Fase de Grupos
        const _grpTour = visible[0];
        const _isGruposFmt = _grpTour && (_grpTour.format === 'Fase de Grupos + Eliminatórias');
        const _hasGrpNav = _isGruposFmt && _grpTour.groups && _grpTour.groups.length > 0 && _grpTour.currentStage !== 'elimination';
        const _grpColors = ['#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];
        const _grpNavHtml = _hasGrpNav ? '<div style="display:flex;gap:5px;flex-wrap:nowrap;align-items:center;">' +
          _grpTour.groups.map(function(g, i) {
            var c = _grpColors[i % _grpColors.length];
            var letter = window._groupLetter(i);
            return '<button onclick="var el=document.getElementById(\'group-section-' + i + '\');if(el){el.scrollIntoView({behavior:\'smooth\',block:\'start\'});}" style="min-width:28px;height:28px;padding:0 8px;border-radius:8px;font-size:0.7rem;font-weight:700;cursor:pointer;border:1.5px solid ' + c + ';background:' + c + '20;color:' + c + ';transition:all 0.15s;white-space:nowrap;line-height:1;" onmouseover="this.style.background=\'' + c + '40\'" onmouseout="this.style.background=\'' + c + '20\'">' + letter + '</button>';
          }).join('') + '</div>' : '';

        // v2.8.1: nome do torneio NO MEIO do cabeçalho (entre Voltar e "Só meus jogos"),
        // pra lembrar que NÃO está na dashboard. Fonte e nº de linhas (até 2) escalam com
        // o tamanho do nome. Quando há nav de grupos, fica abaixo do nome.
        var _hdrNameHtml = function (nm) {
          nm = String(nm || '').trim(); if (!nm) return '';
          var len = nm.length;
          var fs = len <= 16 ? '1.05rem' : len <= 28 ? '0.95rem' : len <= 44 ? '0.83rem' : '0.74rem';
          return '<div title="' + window._safeHtml(nm) + '" style="font-weight:800;color:var(--text-bright);font-size:' + fs + ';line-height:1.15;text-align:center;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;padding:0 4px;">' + window._safeHtml(nm) + '</div>';
        };
        var _hdrMiddle = '<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;">' +
          _hdrNameHtml(_grpTour && _grpTour.name) +
          (_grpNavHtml ? '<div style="max-width:100%;overflow-x:auto;">' + _grpNavHtml + '</div>' : '') +
          '</div>';
        headerHtml = (typeof window._renderBackHeader === 'function'
          ? window._renderBackHeader({
              href: '#dashboard',
              middleHtml: _hdrMiddle,
              rightHtml: _myToggleHtml
            })
          : '');
    }

    // Se o torneio já tem chaveamento, ocultar inscritos (terá botão na tela de chaves)
    const hasDrawn = tournamentId && visible.length > 0 && (
      (Array.isArray(visible[0].matches) && visible[0].matches.length > 0) ||
      (Array.isArray(visible[0].rounds) && visible[0].rounds.length > 0) ||
      (Array.isArray(visible[0].groups) && visible[0].groups.length > 0)
    );

    // Poll banner for tournament detail view
    var pollBannerHtml = '';
    if (tournamentId && visible.length > 0 && window._renderPollBanner) {
        pollBannerHtml = window._renderPollBanner(visible[0]);
    }

    // Search/filter bar (only on list view, not detail)
    var filterBarHtml = '';
    if (!tournamentId && visible.length > 3) {
      filterBarHtml = `
        <div style="display:flex;gap:8px;margin-bottom:1.25rem;align-items:center;flex-wrap:wrap;">
          <input type="text" id="tourn-filter-input" class="form-control" placeholder="Filtrar por nome, esporte ou formato..." style="flex:1;min-width:180px;box-sizing:border-box;padding:8px 12px;font-size:0.85rem;">
          <select id="tourn-filter-status" class="form-control" style="width:auto;padding:8px 10px;font-size:0.85rem;background:var(--bg-darker);border:1px solid var(--border-color);cursor:pointer;">
            <option value="">Todos</option>
            <option value="open">Inscrições Abertas</option>
            <option value="active">Em Andamento</option>
            <option value="finished">Encerrados</option>
          </select>
        </div>
      `;
    }

    const html = `
    ${headerHtml}
    ${filterBarHtml}
    ${pollBannerHtml}

    <div class="tournaments-grid" id="tourn-grid-container" style="display: grid; grid-template-columns: ${tournamentId ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))'}; gap: 1.5rem;">
      ${gridHtml}
    </div>

    ${tournamentId ? _organizersHtml : ''}

    ${hasDrawn ? '' : participantsHtml}

    ${hasDrawn ? `
      <div class="mt-5">
         <h3 style="margin-bottom: 1.5rem; font-size: 1.3rem; color: var(--text-bright); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; display: flex; align-items: center; gap: 8px;">
            🎲 Chaveamento do Torneio
         </h3>
         <div id="inline-bracket-container"></div>
      </div>
    ` : ''}

    ${tournamentId ? `<div id="activity-log-section"></div>` : ''}
  `;
    container.innerHTML = html;

    // Hydrate inline category manager (when organizer views tournament detail with categories)
    if (tournamentId && typeof window._hydrateInlineCatMgr === 'function') {
        setTimeout(function() {
            var _inlineCatEl = document.getElementById('inline-cat-mgr-' + tournamentId);
            if (_inlineCatEl) window._hydrateInlineCatMgr(tournamentId);
        }, 0);
    }

    // Setup filter bar handlers
    var _filterInput = document.getElementById('tourn-filter-input');
    var _filterStatus = document.getElementById('tourn-filter-status');
    if (_filterInput || _filterStatus) {
      var _allCards = document.querySelectorAll('#tourn-grid-container > div');
      var _applyFilter = function() {
        var q = (_filterInput ? _filterInput.value : '').toLowerCase().trim();
        var statusFilter = _filterStatus ? _filterStatus.value : '';
        _allCards.forEach(function(card) {
          var text = (card.textContent || '').toLowerCase();
          var matchesText = !q || text.indexOf(q) !== -1;
          var matchesStatus = true;
          if (statusFilter) {
            var hasInscAbertas = text.indexOf('inscrições abertas') !== -1 || text.indexOf('liga ativa') !== -1;
            var hasEmAndamento = text.indexOf('em andamento') !== -1;
            var hasEncerrado = text.indexOf('encerrado') !== -1;
            if (statusFilter === 'open') matchesStatus = hasInscAbertas;
            else if (statusFilter === 'active') matchesStatus = hasEmAndamento;
            else if (statusFilter === 'finished') matchesStatus = hasEncerrado;
          }
          card.style.display = (matchesText && matchesStatus) ? '' : 'none';
        });
      };
      if (_filterInput) {
        _filterInput.addEventListener('input', _applyFilter);
      }
      if (_filterStatus) {
        _filterStatus.addEventListener('change', _applyFilter);
      }
    }

    // Check category/poll notifications (only once per tournament view, not on re-render)
    if (tournamentId && !_checksRan) {
        var _nt = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tournamentId); });
        if (_nt && window._checkCategoryNotifications) {
            window._checkCategoryNotifications(_nt);
        }
        if (_nt && window._checkPollNotifications) {
            window._checkPollNotifications(_nt);
        }
        // v2.7.75: pedido de vínculo (mescla) pendente pro usuário real aceitar/recusar
        if (_nt && window._checkPendingMerges) {
            window._checkPendingMerges(_nt);
        }
        // v2.1.67: sincroniza o "Planejar ida" do usuário com a data/hora/local
        // atuais do torneio — propaga mudanças feitas pelo organizador (cada um
        // atualiza o próprio plano ao abrir o torneio).
        if (_nt && typeof window._syncTournamentPresencePlan === 'function') {
            var _cuSync = window.AppStore && window.AppStore.currentUser;
            if (_cuSync && _cuSync.uid) { try { window._syncTournamentPresencePlan(_nt, _cuSync); } catch (_sp) {} }
        }
    }

    // Init merge touch drag for mobile (after DOM is ready)
    if (tournamentId && typeof window._initMergeTouchDrag === 'function') {
        window._initMergeTouchDrag(tournamentId);
    }

    // Renderiza a chave de forma transparente associada a esse torneio
    if (hasDrawn && typeof renderBracket === 'function') {
        const inlineContainer = document.getElementById('inline-bracket-container');
        if (inlineContainer) {
            try {
                renderBracket(inlineContainer, tournamentId, true);
            } catch (inlineErr) {
                window._error('[InlineBracket] Error:', inlineErr);
                inlineContainer.innerHTML = '<div style="padding:1rem;color:#f87171;font-size:0.85rem;">Erro ao renderizar chaveamento: ' + window._safeHtml(String(inlineErr)) + '</div>';
            }
        }
    }

    // v2.0.8: veio de #bracket/:id (redirecionado) ou de "Ir para Torneio"?
    // Rola até a seção de chaveamento (ou o jogo específico) após o render inline.
    try {
        const _bs = sessionStorage.getItem('sp_bracketScroll');
        if (_bs) {
            const _bso = JSON.parse(_bs);
            if (_bso && String(_bso.tId) === String(tournamentId)) {
                sessionStorage.removeItem('sp_bracketScroll');
                setTimeout(function() {
                    if (typeof window._scrollToBracketSection === 'function') {
                        window._scrollToBracketSection(tournamentId, _bso.matchId || null);
                    }
                }, 200);
            }
        }
    } catch (_bse) {}

    // Build activity log
    if (tournamentId && typeof window._buildActivityLog === 'function') {
        window._buildActivityLog(tournamentId);
    }

    // Init venue map if lat/lng available
    if (tournamentId) {
        var _mapEl = document.getElementById('tournament-venue-map');
        if (_mapEl) {
            window._initTournamentVenueMap(_mapEl);
        }
    }

    // Auto-scroll to Edit button after Quick Create (item 5)
    if (tournamentId) {
      try {
        var _scrollFlag = sessionStorage.getItem('scoreplace_scroll_to_edit');
        if (_scrollFlag === '1') {
          sessionStorage.removeItem('scoreplace_scroll_to_edit');
          setTimeout(function() {
            var editBtn = container.querySelector('[onclick*="openEditModal"]');
            if (editBtn) {
              editBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Force show the org-edit-new hint after scroll completes
              setTimeout(function() {
                if (typeof window._forceShowHint === 'function') {
                  window._forceShowHint('org-edit-new');
                }
              }, 600);
            }
          }, 300);
        }
      } catch (e) {}
    }

    // --- Invited visitor: scroll to enrollment CTA and show hint ---
    // Gate by sessionStorage so Voltar back to the same tournament doesn't
    // trigger another smooth-scroll (which left the user parked mid-page and
    // made the Voltar button look broken).
    var _ctaScrollKey = tournamentId ? ('_ctaScrolled_' + tournamentId) : null;
    var _alreadyScrolledCta = false;
    try { _alreadyScrolledCta = _ctaScrollKey && !!sessionStorage.getItem(_ctaScrollKey); } catch(e) {}
    if (tournamentId && !window.AppStore.currentUser && !_alreadyScrolledCta) {
      try { if (_ctaScrollKey) sessionStorage.setItem(_ctaScrollKey, '1'); } catch(e) {}
      var _isInvite = false;
      try {
        var _h = window.location.hash || '';
        _isInvite = _h.indexOf('ref=') !== -1 || !!sessionStorage.getItem('_inviteRefUid');
      } catch(e) {}
      // Scroll to CTA for any visitor viewing a tournament detail (invited or direct link)
      setTimeout(function() {
        var ctaEl = document.getElementById('visitor-enroll-cta') || document.getElementById('visitor-closed-cta');
        if (ctaEl) {
          ctaEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Pulse animation to draw attention
          ctaEl.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
          setTimeout(function() {
            ctaEl.style.transform = 'scale(1.03)';
            ctaEl.style.boxShadow = '0 0 20px rgba(16,185,129,0.4)';
            setTimeout(function() {
              ctaEl.style.transform = '';
              ctaEl.style.boxShadow = '';
            }, 600);
          }, 400);
        }
      }, 500);
    }
}

// ── Partner Picker para inscrição em duplas ───────────────────────────────
// Mostra dropdown com: (1) já inscritos solo no torneio; (2) amigos do usuário.
// Seleção preenche o input e mostra chip visual. Digitação livre também aceita.

window._partnerPickerSelected = {}; // tId → {name, uid}
window._partnerPickerFriendsCache = {}; // tId → [{name,uid,photo}]
window._partnerPickerDebounce = {}; // tId → timer

// Pré-carrega perfis dos amigos quando o modal abre
window._partnerPickerInit = async function(tId) {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !window.FirestoreDB || !window.FirestoreDB.db) return;
  var friendUids = (Array.isArray(cu.friends) ? cu.friends : [])
    .filter(function(id) { return typeof id === 'string' && !id.includes('@') && id !== cu.uid; });
  if (!friendUids.length) return;
  var cache = window._friendProfilesCache || {};
  var toLoad = friendUids.filter(function(uid) { return !cache[uid]; });
  // Carrega perfis ainda não em cache (em paralelo, até 10 por vez)
  var batches = [];
  for (var i = 0; i < toLoad.length; i += 10) batches.push(toLoad.slice(i, i + 10));
  for (var b = 0; b < batches.length; b++) {
    try {
      var snap = await window.FirestoreDB.db.collection('users')
        .where(window.firebase.firestore.FieldPath.documentId(), 'in', batches[b]).get();
      snap.forEach(function(doc) {
        var d = doc.data();
        if (!window._friendProfilesCache) window._friendProfilesCache = {};
        window._friendProfilesCache[doc.id] = { displayName: d.displayName || '', photoURL: d.photoURL || '' };
      });
    } catch(e) { window._warn('[partnerPicker] load friends:', e && e.message); }
  }
  // Montar lista de amigos filtrada para este tId
  var enrolled = (window._partnerPickerEnrolled && window._partnerPickerEnrolled[tId]) || [];
  var friends = [];
  friendUids.forEach(function(uid) {
    var prof = (window._friendProfilesCache || {})[uid];
    if (!prof) return;
    var nm = prof.displayName || '';
    if (!nm) return;
    if (enrolled.some(function(e) { return e.uid === uid || e.name === nm; })) return;
    friends.push({ name: nm, uid: uid, photo: prof.photoURL || '' });
  });
  window._partnerPickerFriendsCache[tId] = friends;
  // Mostrar sugestões iniciais (sem query)
  window._partnerPickerRender(tId, '', enrolled, friends, []);
};

// Renderiza o dropdown com as seções de resultados
window._partnerPickerRender = function(tId, q, enrolled, friends, searchResults) {
  var dropdown = document.getElementById('partner-dropdown-' + tId);
  if (!dropdown) return;

  function _item(p, badge, color) {
    var avatar = p.photo
      ? '<img src="' + window._safeHtml(p.photo) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'">'
      : '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,' + color + ');display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:#fff;font-weight:700;flex-shrink:0;">' + window._safeHtml((p.name[0]||'?').toUpperCase()) + '</div>';
    return '<div onclick="event.stopPropagation();window._partnerPickerSelect(\'' + tId + '\',\'' + _escAttr(p.name) + '\',\'' + _escAttr(p.uid||'') + '\')" ' +
      'style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:background 0.1s;" ' +
      'onmouseover="this.style.background=\'rgba(99,102,241,0.12)\'" onmouseout="this.style.background=\'none\'">' +
      avatar +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:0.88rem;font-weight:600;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window._safeHtml(p.name) + '</div>' +
        '<div style="font-size:0.68rem;color:var(--text-muted);">' + badge + '</div>' +
      '</div></div>';
  }

  function _section(title, items, badge, color, sep) {
    if (!items.length) return '';
    return (sep ? '<div style="height:1px;background:var(--border-color);margin:2px 0;"></div>' : '') +
      '<div style="padding:6px 12px 3px;font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">' + title + '</div>' +
      items.map(function(p) { return _item(p, badge, color); }).join('');
  }

  var html = '';
  html += _section('Já inscritos', enrolled, 'Inscrito(a)', '#3b82f6,#8b5cf6', false);
  html += _section('Meus amigos', friends, 'Amigo(a)', '#10b981,#059669', enrolled.length > 0);
  // v1.9.80: SEM busca de usuários arbitrários — você só vincula um USUÁRIO
  // (com conta) se ele for seu AMIGO. Qualquer outro nome é usado como TEXTO
  // simples (o input alimenta submitTeamEnroll direto). Sem a pergunta "Usar X
  // como nome" — basta digitar e confirmar.

  dropdown.innerHTML = html || '';
  dropdown.style.display = html ? 'block' : 'none';

  if (html) {
    setTimeout(function() {
      document.addEventListener('click', function _close() {
        if (dropdown) dropdown.style.display = 'none';
        document.removeEventListener('click', _close);
      }, { once: true });
    }, 50);
  }
};

window._partnerPickerSearch = function(tId, query) {
  var dropdown = document.getElementById('partner-dropdown-' + tId);
  var input    = document.getElementById('partner-search-' + tId);
  if (!dropdown || !input) return;
  if (window._partnerPickerSelected[tId] && window._partnerPickerSelected[tId].confirmed) return;

  var q = (query || '').trim().toLowerCase();
  var enrolled = (window._partnerPickerEnrolled && window._partnerPickerEnrolled[tId]) || [];
  var friends  = (window._partnerPickerFriendsCache && window._partnerPickerFriendsCache[tId]) || [];

  // Filtrar pelo query local (instantâneo)
  var filtEnrolled = q ? enrolled.filter(function(p) { return p.name.toLowerCase().includes(q); }) : enrolled;
  var filtFriends  = q ? friends.filter(function(p) { return p.name.toLowerCase().includes(q); }) : friends;

  // Renderizar imediatamente com resultados locais
  window._partnerPickerRender(tId, q, filtEnrolled, filtFriends, []);

  // v1.9.80: sem busca remota de usuários arbitrários — só amigos/inscritos no
  // autocomplete. Qualquer outro nome entra como texto simples.
  if (window._partnerPickerDebounce[tId]) { clearTimeout(window._partnerPickerDebounce[tId]); window._partnerPickerDebounce[tId] = null; }
};

window._partnerPickerSelect = function(tId, name, uid) {
  var input   = document.getElementById('partner-search-' + tId);
  var dropdown = document.getElementById('partner-dropdown-' + tId);
  var chip    = document.getElementById('partner-chip-' + tId);
  var chipName = document.getElementById('partner-chip-name-' + tId);
  if (!input) return;

  // Preenche o input (lido por submitTeamEnroll)
  input.value = name;
  // Armazena uid para uso futuro (notificações, vinculação de perfil)
  input.dataset.partnerUid = uid || '';

  // Mostra chip visual
  if (chip && chipName) {
    chipName.textContent = name;
    chip.style.display = 'flex';
    input.style.paddingLeft = '8px'; // empurra texto pra dar espaço ao chip
    input.style.color = 'transparent'; // esconde texto do input atrás do chip
  }

  if (dropdown) dropdown.style.display = 'none';
  window._partnerPickerSelected[tId] = { name: name, uid: uid, confirmed: true };
};

window._partnerPickerClear = function(tId) {
  var input   = document.getElementById('partner-search-' + tId);
  var chip    = document.getElementById('partner-chip-' + tId);
  if (input) {
    input.value = '';
    input.style.color = '';
    input.style.paddingLeft = '36px';
    input.focus();
    delete input.dataset.partnerUid;
  }
  if (chip) chip.style.display = 'none';
  if (window._partnerPickerSelected) delete window._partnerPickerSelected[tId];
};

function _escAttr(s) {
  return String(s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

// Linha direta participante → organização. Disparado pelo botão "Falar com o
// organizador" da seção ORGANIZAÇÃO (detalhe do torneio). Resolve o telefone do
// organizador no perfil dele (Firestore) e abre o WhatsApp com a mensagem já
// preenchida; sem telefone cai pro e-mail; sem nenhum dos dois avisa o usuário.
// v2.4.82: `_contactOrganizer` foi unificado e movido pra tournaments-organizer.js
// (mesma função pra dashboard e detalhe). Mantido aqui só este comentário pra
// evitar redefinição que sobrescreveria a versão canônica (tournaments.js carrega
// depois de tournaments-organizer.js).
