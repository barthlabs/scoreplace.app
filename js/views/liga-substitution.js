// liga-substitution.js — W.O. + substituição em grupos de Liga (Rei/Rainha). v2.4.30
//
// Quando um jogador não consegue fazer seus jogos da rodada, os demais do grupo
// (ou o organizador) podem dar W.O. (o ausente faz 0 pts na rodada) e preencher
// a vaga de duas formas:
//   (a) CONVIDAR um jogador da MESMA categoria que ficou de fora no sorteio
//       (folga). Ele recebe um convite e precisa ACEITAR; aceitando, joga no
//       lugar do ausente e PONTUA de verdade.
//   (b) JOGADOR X — qualquer pessoa presente na arena. Entra na hora, sem
//       convite, e NÃO pontua (não entra na classificação); só permite que os
//       demais joguem sua rodada.
//
// Estado guardado no grupo (round.monarchGroups[i]):
//   group.woAbsent     — nome de quem levou W.O. (fixa o ausente)
//   group.subStatus    — 'pending' (convite aberto) | 'filled' (preenchido)
//   group.subName      — nome do substituto/convidado uma vez preenchido
//   group.subIsGuest   — true se foi Jogador X (ghost, não pontua)
//   group.pendingInviteId — id do convite pendente
// Convites: t.ligaSubInvites[] ; ghosts (Jogador X): t.ligaGhosts[].

(function () {
'use strict';

function _esc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function _safe(s) { return (window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s)); }
function _findT(tId) { return window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); }); }
function _save(t) { try { if (window.FirestoreDB && window.FirestoreDB.saveTournament) window.FirestoreDB.saveTournament(t); else if (window.AppStore.sync) window.AppStore.sync(); } catch (e) {} }
function _rerender(tId) {
  try {
    var hash = (window.location && window.location.hash) || '';
    if (hash.indexOf('#bracket/') === 0 && typeof window._rerenderBracket === 'function') window._rerenderBracket(tId);
    else if (hash.indexOf('#tournaments/' + tId) === 0 && typeof window.renderTournaments === 'function') window.renderTournaments(document.getElementById('view-container'), tId);
    else if (typeof window._rerenderBracket === 'function') window._rerenderBracket(tId);
  } catch (e) {}
}

// Nome de exibição do usuário logado.
function _meName() { var u = window.AppStore && window.AppStore.currentUser; return u ? (u.displayName || u.name || '') : ''; }
function _meUid() { var u = window.AppStore && window.AppStore.currentUser; return u ? (u.uid || '') : ''; }

// Quem pode dar W.O./substituir num grupo: organizador/co-org/árbitro OU um
// jogador do próprio grupo ("os demais podem dar WO").
function _canManageGroup(t, group) {
  if (typeof window._canManagePresence === 'function' && window._canManagePresence(t, window.AppStore.currentUser)) return true;
  var me = _meName();
  if (!me || !group || !Array.isArray(group.players)) return false;
  return group.players.some(function (n) {
    if (!n) return false;
    if (n === me) return true;
    if (n.indexOf('/') !== -1) return n.split('/').map(function (s) { return s.trim(); }).indexOf(me) !== -1;
    return false;
  });
}
window._ligaCanManageGroup = _canManageGroup;

// Localiza um grupo monarch pelo nome dentro de t.rounds[roundIndex].
function _getGroup(t, roundIndex, groupName) {
  var round = (t.rounds || [])[roundIndex];
  if (!round || !Array.isArray(round.monarchGroups)) return null;
  return round.monarchGroups.filter(function (g) { return g && g.name === groupName; })[0] || null;
}
function _groupCategory(group) {
  var m = (group && group.matches || []).filter(function (x) { return x && x.category; })[0];
  return m ? m.category : null;
}

// Mapa nome → uid (top-level + sub-participantes de dupla).
function _nameUidMap(t) {
  var map = {};
  (Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {})).forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    var nm = p.displayName || p.name || '';
    if (nm && p.uid) map[nm] = p.uid;
    (p.participants || []).forEach(function (sp) { if (sp && (sp.displayName || sp.name) && sp.uid) map[sp.displayName || sp.name] = sp.uid; });
  });
  return map;
}

// ── Mutações de baixo nível ─────────────────────────────────────────────────
function _rewriteSlot(group, fromName, toName, clearResults) {
  (group.matches || []).forEach(function (m) {
    if (Array.isArray(m.team1)) m.team1 = m.team1.map(function (n) { return n === fromName ? toName : n; });
    if (Array.isArray(m.team2)) m.team2 = m.team2.map(function (n) { return n === fromName ? toName : n; });
    if (m.team1 && m.team2) { m.p1 = m.team1.join(' / '); m.p2 = m.team2.join(' / '); }
    if (clearResults) { m.winner = null; m.scoreP1 = null; m.scoreP2 = null; m.sets = null; delete m.pendingResult; delete m.draw; }
  });
  if (Array.isArray(group.players)) group.players = group.players.map(function (n) { return n === fromName ? toName : n; });
}
function _removeSitOut(round, name) {
  if (Array.isArray(round.matches)) round.matches = round.matches.filter(function (m) { return !(m.isSitOut && m.p1 === name); });
}
function _addWoMarker(t, round, roundIndex, name, category) {
  _removeSitOut(round, name); // não pode ser folga E W.O.
  if (!Array.isArray(round.matches)) round.matches = [];
  var o = {
    id: 'wo-r' + (roundIndex + 1) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
    round: roundIndex + 1, roundIndex: roundIndex,
    p1: name, p2: 'W.O.', isSitOut: true, sitOutReason: 'wo', sitOutPoints: 0,
    label: 'R' + (roundIndex + 1) + ' • W.O.'
  };
  if (category) o.category = category;
  round.matches.push(o);
}
function _addFolgaMarker(t, round, roundIndex, name, category) {
  if (!Array.isArray(round.matches)) round.matches = [];
  // evita duplicar
  if (round.matches.some(function (m) { return m.isSitOut && m.p1 === name; })) return;
  var pts = (typeof window._sitOutComp === 'function') ? window._sitOutComp(t, name, category) : 0;
  var o = {
    id: 'folga-r' + (roundIndex + 1) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
    round: roundIndex + 1, roundIndex: roundIndex,
    p1: name, p2: 'FOLGA', isSitOut: true, sitOutReason: 'remainder', sitOutPoints: pts,
    label: 'R' + (roundIndex + 1) + ' • Folga'
  };
  if (category) o.category = category;
  round.matches.push(o);
}
function _addGhost(t, name) { if (!Array.isArray(t.ligaGhosts)) t.ligaGhosts = []; if (t.ligaGhosts.indexOf(name) === -1) t.ligaGhosts.push(name); }
function _removeGhost(t, name) { if (Array.isArray(t.ligaGhosts)) t.ligaGhosts = t.ligaGhosts.filter(function (n) { return n !== name; }); }

// ── Passo 1: escolher o ausente ─────────────────────────────────────────────
window._ligaAbsentFlow = function (tId, roundIndex, groupName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) { if (window.showNotification) window.showNotification('W.O.', 'Só o organizador ou um jogador do grupo pode fazer isso.', 'info'); return; }
  // Se já tem um ausente definido (convite recusado / aguardando preencher), pula direto pro fill.
  if (group.woAbsent && group.subStatus !== 'filled') { window._ligaPickFill(tId, roundIndex, groupName, group.woAbsent); return; }
  var players = (group.players || []).slice();
  var rows = players.map(function (p) {
    return '<button class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;" onclick="window._ligaPickFill(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(p) + '\')">' + _safe(p) + '</button>';
  }).join('');
  if (window.showAlertDialog) {
    window.showAlertDialog('Quem não pôde jogar?',
      '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;">O jogador escolhido leva <b>W.O.</b> (0 pontos nesta rodada). Em seguida você escolhe quem entra no lugar dele.</div>' + rows,
      function () {}, { type: 'warning', confirmText: 'Fechar' });
  }
};

// ── Passo 2: escolher o preenchimento (convidar folga OU Jogador X) ──────────
window._ligaPickFill = function (tId, roundIndex, groupName, absentName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  var cat = _groupCategory(group);
  var round = (t.rounds || [])[roundIndex];
  var uidMap = _nameUidMap(t);
  // Folga players da MESMA categoria, com conta (uid) pra poder aceitar.
  var folgas = (round && round.matches || []).filter(function (m) {
    return m && m.isSitOut && m.sitOutReason === 'remainder' && (!cat || m.category === cat) && uidMap[m.p1];
  }).map(function (m) { return { name: m.p1, uid: uidMap[m.p1] }; });
  // dedup
  var seen = {}; folgas = folgas.filter(function (f) { if (seen[f.uid]) return false; seen[f.uid] = 1; return true; });

  var catLbl = cat ? (window._displayCategoryName ? window._displayCategoryName(cat) : cat) : '';
  var html = '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;"><b>' + _safe(absentName) + '</b> leva W.O. (0 pts). Quem entra no lugar?</div>';
  if (folgas.length > 0) {
    html += '<div style="font-size:0.74rem;font-weight:700;color:#4ade80;margin:10px 0 6px;">Convidar quem ficou de fora' + (catLbl ? ' (' + _safe(catLbl) + ')' : '') + ' — pontua de verdade</div>';
    html += folgas.map(function (f) {
      return '<button class="btn btn-outline" style="width:100%;margin-bottom:6px;text-align:left;border-color:rgba(16,185,129,0.4);color:#4ade80;" onclick="window._ligaInviteSub(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(absentName) + '\',\'' + _esc(f.uid) + '\',\'' + _esc(f.name) + '\')">📨 ' + _safe(f.name) + '</button>';
    }).join('');
  } else {
    html += '<div style="font-size:0.74rem;color:var(--text-muted);margin:8px 0;">Ninguém da mesma categoria ficou de fora nesta rodada para convidar.</div>';
  }
  html += '<div style="font-size:0.74rem;font-weight:700;color:#fbbf24;margin:12px 0 6px;">Jogador X — qualquer pessoa presente (não pontua)</div>';
  html += '<button class="btn btn-outline" style="width:100%;border-color:rgba(251,191,36,0.4);color:#fbbf24;" onclick="window._ligaFillGuestPrompt(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(absentName) + '\')">🎾 Completar com Jogador X</button>';

  if (window.showAlertDialog) window.showAlertDialog('Substituto', html, function () {}, { type: 'info', confirmText: 'Fechar' });
};

// ── Jogador X (guest, não pontua) ───────────────────────────────────────────
window._ligaFillGuestPrompt = function (tId, roundIndex, groupName, absentName) {
  if (window.showInputDialog) {
    window.showInputDialog('Jogador X', 'Nome de quem vai completar a rodada (opcional):', function (val) {
      var name = (val || '').trim() || 'Jogador X';
      window._ligaFillGuest(tId, roundIndex, groupName, absentName, name);
    }, { placeholder: 'Jogador X', confirmText: 'Completar' });
  } else {
    window._ligaFillGuest(tId, roundIndex, groupName, absentName, 'Jogador X');
  }
};
window._ligaFillGuest = function (tId, roundIndex, groupName, absentName, guestName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  var round = t.rounds[roundIndex];
  var cat = _groupCategory(group);
  // Evita colisão de nome com um jogador real: se já existe, sufixa.
  var existing = {}; (group.players || []).forEach(function (n) { existing[n] = 1; });
  var gname = guestName; var k = 2;
  while (existing[gname] || (Array.isArray(t.ligaGhosts) && t.ligaGhosts.indexOf(gname) !== -1 && gname !== guestName)) { gname = guestName + ' ' + k; k++; }
  _addWoMarker(t, round, roundIndex, absentName, cat);
  _rewriteSlot(group, absentName, gname, true);
  _addGhost(t, gname);
  group.woAbsent = absentName; group.subStatus = 'filled'; group.subName = gname; group.subIsGuest = true;
  delete group.pendingInviteId;
  // Completar com Jogador X supera qualquer convite pendente do grupo — cancela
  // pra não deixar convite órfão (que um jogador real poderia aceitar depois).
  if (Array.isArray(t.ligaSubInvites)) {
    t.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
  }
  t.updatedAt = new Date().toISOString();
  _save(t);
  if (window.showNotification) window.showNotification('Rodada liberada', absentName + ' levou W.O. · ' + gname + ' completa o grupo (sem pontuar).', 'success');
  _rerender(tId);
};

// ── Convite a um folga (precisa aceitar) ────────────────────────────────────
window._ligaInviteSub = function (tId, roundIndex, groupName, absentName, inviteeUid, inviteeName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  var round = t.rounds[roundIndex];
  var cat = _groupCategory(group);
  if (!Array.isArray(t.ligaSubInvites)) t.ligaSubInvites = [];
  var inviteId = 'sub-' + Date.now() + '-' + Math.floor(Math.random() * 1e5);
  // Cancela qualquer convite pendente anterior do mesmo grupo.
  t.ligaSubInvites = t.ligaSubInvites.filter(function (iv) { return !(iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending'); });
  t.ligaSubInvites.push({
    id: inviteId, roundIndex: roundIndex, groupName: groupName, absentName: absentName,
    category: cat || null, inviteeUid: inviteeUid, inviteeName: inviteeName,
    byUid: _meUid(), byName: _meName(), status: 'pending', createdAt: new Date().toISOString()
  });
  _addWoMarker(t, round, roundIndex, absentName, cat); // W.O. já vale (ausente = 0)
  group.woAbsent = absentName; group.subStatus = 'pending'; group.pendingInviteId = inviteId; delete group.subName; delete group.subIsGuest;
  t.updatedAt = new Date().toISOString();
  _save(t);
  if (typeof window._sendUserNotification === 'function') {
    try {
      window._sendUserNotification(inviteeUid, {
        type: 'liga-sub-invite', level: 'fundamental', tournamentId: String(t.id), tournamentName: t.name || 'torneio',
        message: 'Você foi convidado pra entrar no lugar de ' + absentName + ' no ' + groupName + ' do torneio "' + (t.name || 'torneio') + '". Abra o torneio pra aceitar e jogar (vale pontos).'
      });
    } catch (e) {}
  }
  if (window.showNotification) window.showNotification('Convite enviado', inviteeName + ' precisa aceitar pra entrar no lugar de ' + absentName + '.', 'success');
  _rerender(tId);
};

// Banner pro convidado aceitar/recusar (aparece no topo do bracket do torneio).
window._ligaInviteBannerHtml = function (t) {
  if (!t || !Array.isArray(t.ligaSubInvites)) return '';
  var uid = _meUid(); if (!uid) return '';
  var mine = t.ligaSubInvites.filter(function (iv) { return iv.status === 'pending' && iv.inviteeUid === uid; });
  if (mine.length === 0) return '';
  return mine.map(function (iv) {
    var idE = _esc(iv.id), tE = _esc(t.id);
    return '<div style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.45);border-radius:12px;padding:12px 14px;margin-bottom:1rem;">' +
      '<div style="font-weight:700;font-size:0.9rem;color:#4ade80;margin-bottom:4px;">📨 Convite pra substituir</div>' +
      '<div style="font-size:0.84rem;color:var(--text-bright);margin-bottom:10px;">Entre no lugar de <b>' + _safe(iv.absentName) + '</b> no <b>' + _safe(iv.groupName) + '</b>. Você joga e <b>pontua de verdade</b>.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button onclick="window._ligaAcceptSub(\'' + tE + '\',\'' + idE + '\')" style="background:#10b981;color:#fff;border:none;padding:8px 16px;border-radius:9px;font-weight:700;font-size:0.82rem;cursor:pointer;">✅ Aceitar e jogar</button>' +
        '<button onclick="window._ligaDeclineSub(\'' + tE + '\',\'' + idE + '\')" style="background:transparent;color:#ef4444;border:1px solid rgba(239,68,68,0.5);padding:8px 16px;border-radius:9px;font-weight:700;font-size:0.82rem;cursor:pointer;">❌ Recusar</button>' +
      '</div></div>';
  }).join('');
};

window._ligaAcceptSub = function (tId, inviteId) {
  var t = _findT(tId); if (!t || !Array.isArray(t.ligaSubInvites)) return;
  var iv = t.ligaSubInvites.filter(function (x) { return x.id === inviteId && x.status === 'pending'; })[0]; if (!iv) return;
  if (_meUid() !== iv.inviteeUid) { if (window.showNotification) window.showNotification('Convite', 'Esse convite não é pra você.', 'info'); return; }
  var group = _getGroup(t, iv.roundIndex, iv.groupName);
  var round = t.rounds[iv.roundIndex];
  if (!group || !round) { iv.status = 'expired'; _save(t); return; }
  var cat = _groupCategory(group);
  _removeSitOut(round, iv.inviteeName);     // não é mais folga — vai jogar
  _rewriteSlot(group, iv.absentName, iv.inviteeName, true);
  group.subStatus = 'filled'; group.subName = iv.inviteeName; group.subIsGuest = false; delete group.pendingInviteId;
  iv.status = 'accepted'; iv.resolvedAt = new Date().toISOString();
  t.updatedAt = new Date().toISOString();
  _save(t);
  // Notifica quem convidou.
  if (iv.byUid && typeof window._sendUserNotification === 'function') {
    try { window._sendUserNotification(iv.byUid, { type: 'liga-sub-result', level: 'all', tournamentId: String(t.id), tournamentName: t.name || 'torneio', message: iv.inviteeName + ' aceitou e entrou no lugar de ' + iv.absentName + ' no ' + iv.groupName + '.' }); } catch (e) {}
  }
  if (window.showNotification) window.showNotification('Você está jogando!', 'Entrou no lugar de ' + iv.absentName + ' no ' + iv.groupName + '. Boa partida!', 'success');
  _rerender(tId);
};

window._ligaDeclineSub = function (tId, inviteId) {
  var t = _findT(tId); if (!t || !Array.isArray(t.ligaSubInvites)) return;
  var iv = t.ligaSubInvites.filter(function (x) { return x.id === inviteId && x.status === 'pending'; })[0]; if (!iv) return;
  if (_meUid() !== iv.inviteeUid) return;
  iv.status = 'declined'; iv.resolvedAt = new Date().toISOString();
  var group = _getGroup(t, iv.roundIndex, iv.groupName);
  if (group && group.pendingInviteId === inviteId) { group.subStatus = 'open'; delete group.pendingInviteId; } // W.O. permanece; grupo volta a precisar de substituto
  t.updatedAt = new Date().toISOString();
  _save(t);
  if (iv.byUid && typeof window._sendUserNotification === 'function') {
    try { window._sendUserNotification(iv.byUid, { type: 'liga-sub-result', level: 'fundamental', tournamentId: String(t.id), tournamentName: t.name || 'torneio', message: iv.inviteeName + ' recusou o convite pra substituir ' + iv.absentName + ' no ' + iv.groupName + '. Escolha outro substituto ou um Jogador X.' }); } catch (e) {}
  }
  if (window.showNotification) window.showNotification('Convite recusado', 'Você recusou. O grupo vai escolher outro substituto.', 'info');
  _rerender(tId);
};

// Cancelar convite pendente (quem acionou) e escolher outro caminho.
window._ligaCancelInvite = function (tId, roundIndex, groupName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  if (Array.isArray(t.ligaSubInvites)) {
    t.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
  }
  group.subStatus = 'open'; delete group.pendingInviteId;
  _save(t);
  _rerender(tId);
  window._ligaPickFill(tId, roundIndex, groupName, group.woAbsent);
};

// Convidado demorou/vai recusar → cancela o convite pendente e completa JÁ com
// Jogador X (sem esperar). O ausente continua com W.O. (0 pts).
window._ligaSwitchToGuest = function (tId, roundIndex, groupName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  if (Array.isArray(t.ligaSubInvites)) {
    t.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
  }
  group.subStatus = 'open'; delete group.pendingInviteId;
  _save(t);
  window._ligaFillGuestPrompt(tId, roundIndex, groupName, group.woAbsent);
};

// Reverter o W.O. (desfaz tudo: substituto sai, ausente volta).
window._ligaRevertWo = function (tId, roundIndex, groupName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  var round = t.rounds[roundIndex];
  var cat = _groupCategory(group);
  var absent = group.woAbsent;
  if (!absent) return;
  // Trava: se o substituto já jogou (algum jogo do grupo com placar lançado /
  // placar ao vivo iniciado), não dá pra reverter — reverter zeraria resultados
  // reais dos jogos do grupo.
  if (group.subStatus === 'filled' && typeof window._matchHasRealPlay === 'function'
      && Array.isArray(group.matches) && group.matches.some(function (m) { return window._matchHasRealPlay(m); })) {
    if (window.showNotification) window.showNotification('W.O. não pode ser revertido', 'Os jogos do grupo já começaram (placar lançado ou placar ao vivo iniciado). O W.O. não é mais reversível.', 'warning');
    return;
  }
  var doRevert = function () {
    if (group.subStatus === 'filled' && group.subName) {
      _rewriteSlot(group, group.subName, absent, true); // substituto → ausente de volta
      if (group.subIsGuest) _removeGhost(t, group.subName);
      else _addFolgaMarker(t, round, roundIndex, group.subName, cat); // folga volta pro substituto real
    }
    _removeSitOut(round, absent); // remove o marcador de W.O.
    // cancela convites pendentes do grupo
    if (Array.isArray(t.ligaSubInvites)) t.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
    delete group.woAbsent; delete group.subStatus; delete group.subName; delete group.subIsGuest; delete group.pendingInviteId;
    t.updatedAt = new Date().toISOString();
    _save(t);
    if (window.showNotification) window.showNotification('W.O. revertido', absent + ' voltou ao grupo.', 'success');
    _rerender(tId);
  };
  if (window.showConfirmDialog) window.showConfirmDialog('Reverter W.O.?', 'Isso desfaz o W.O. de ' + absent + ', tira o substituto e reabre os jogos do grupo.', doRevert, null, { type: 'warning', confirmText: 'Reverter' });
  else doRevert();
};

// True quando o grupo está aguardando aceite de convite (trava lançamento).
window._ligaGroupPending = function (group) { return !!(group && group.subStatus === 'pending'); };

// HTML dos controles de W.O./substituição no cabeçalho do grupo.
window._ligaGroupControlsHtml = function (t, roundIndex, group) {
  if (!t || !group) return '';
  var isLiga = window._isLigaFormat && window._isLigaFormat(t);
  if (!isLiga || t.status === 'finished') return '';
  var gDone = (group.matches || []).length > 0 && (group.matches || []).every(function (m) { return !!m.winner; });
  var manage = _canManageGroup(t, group);
  var tE = _esc(t.id), gE = _esc(group.name);
  // Botões de AÇÃO = classe de botão padrão do app (.btn .btn-outline .btn-sm),
  // com tom suave por inline. Indicadores de STATUS continuam como pills.
  var poBtnStyle = 'font-size:0.72rem;padding:3px 11px;';
  // Estado: pendente de aceite
  if (group.subStatus === 'pending') {
    var who = '';
    if (Array.isArray(t.ligaSubInvites)) { var iv = t.ligaSubInvites.filter(function (x) { return x.id === group.pendingInviteId; })[0]; if (iv) who = iv.inviteeName; }
    var s = '<span style="font-size:0.66rem;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);padding:2px 8px;border-radius:6px;">⏳ ' + _safe(group.woAbsent) + ' levou W.O. · ' + _safe(who || 'substituto') + ' convidado, aguardando confirmação</span>';
    // Demorou ou vai recusar? Os jogadores não ficam travados: convidam outro
    // folga OU completam com Jogador X na hora.
    if (manage) {
      s += ' <button type="button" class="btn btn-outline btn-sm" onclick="window._ligaCancelInvite(\'' + tE + '\',' + roundIndex + ',\'' + gE + '\')" style="' + poBtnStyle + 'color:#4ade80;border-color:rgba(16,185,129,0.4);">📨 Convidar outro</button>';
      s += ' <button type="button" class="btn btn-outline btn-sm" onclick="window._ligaSwitchToGuest(\'' + tE + '\',' + roundIndex + ',\'' + gE + '\')" style="' + poBtnStyle + 'color:#fbbf24;border-color:rgba(251,191,36,0.45);">🎾 Jogador X</button>';
      // Reverter W.O. também no estado pendente — enquanto os jogos não começaram,
      // o organizador pode desfazer o W.O. (cancela o convite e reabre o grupo).
      var _woPlayedP = (typeof window._matchHasRealPlay === 'function')
        && Array.isArray(group.matches) && group.matches.some(function (m) { return window._matchHasRealPlay(m); });
      if (!_woPlayedP) s += ' ' + window._woBtnHtml("window._ligaRevertWo('" + tE + "'," + roundIndex + ",'" + gE + "')", false, { label: '↩️ Reverter W.O.' });
    }
    return s;
  }
  // Estado: preenchido (W.O. ativo)
  if (group.subStatus === 'filled' && group.woAbsent) {
    var lbl = group.subIsGuest ? (_safe(group.subName) + ' (Jogador X)') : _safe(group.subName);
    var s2 = '<span style="font-size:0.66rem;font-weight:700;color:#a78bfa;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);padding:2px 8px;border-radius:6px;">🔁 ' + _safe(group.woAbsent) + ' W.O. → ' + lbl + '</span>';
    // Some quando os jogos do grupo já começaram — W.O. não é mais reversível.
    var _woPlayed = (typeof window._matchHasRealPlay === 'function')
      && Array.isArray(group.matches) && group.matches.some(function (m) { return window._matchHasRealPlay(m); });
    if (manage && !_woPlayed) s2 += ' ' + window._woBtnHtml("window._ligaRevertWo('" + tE + "'," + roundIndex + ",'" + gE + "')", false, { label: '↩️ Reverter W.O.' });
    return s2;
  }
  // Estado: W.O. declarado mas sem substituto (recusa) — precisa preencher
  if (group.woAbsent && (group.subStatus === 'open' || !group.subStatus) && manage) {
    return '<button type="button" class="btn btn-outline btn-sm" onclick="window._ligaPickFill(\'' + tE + '\',' + roundIndex + ',\'' + gE + '\',\'' + _esc(group.woAbsent) + '\')" style="' + poBtnStyle + 'color:#fbbf24;border-color:rgba(251,191,36,0.45);">⚠️ ' + _safe(group.woAbsent) + ' levou W.O. · escolher substituto</button>';
  }
  // Estado normal: oferece declarar ausência (só se grupo não terminou)
  if (!gDone && manage) {
    return window._woBtnHtml("window._ligaAbsentFlow('" + tE + "'," + roundIndex + ",'" + gE + "')", true,
      { label: '⚠️ Faltou alguém?', title: 'Algum jogador não pôde vir? Dê W.O. e chame um substituto.' });
  }
  return '';
};

})();
