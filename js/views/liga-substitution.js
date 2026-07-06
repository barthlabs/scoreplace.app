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
function _findT(tId) { return (typeof window._findTournamentById === 'function') ? window._findTournamentById(tId) : (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); }); } // v3.0.x: cobre torneio descoberto (publicDiscovery), p/ convidado de folga que veio pela descoberta
// Blindagem v4.0.118: persiste a mutação da Liga pelo portão AppStore.mutate
// (atômico no doc FRESCO da transação — sem lost-update do saveTournament
// doc-inteiro). O `mutatorFn(ft)` RE-RESOLVE group/round do `ft` (as refs locais
// não valem no doc fresco) e aplica a mudança. Efeitos interativos (diálogo,
// notificação) ficam FORA do mutator (ele roda 2×: local + fresco).
function _commitLiga(tId, mutatorFn) { return window.AppStore.mutate(String(tId), mutatorFn); }
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
  if (!group || !Array.isArray(group.players)) return false;
  // v3.0.81 (varredura uid): "sou um jogador deste grupo?" por UID primeiro.
  // group.players guarda NOMES (camada do bracket) — resolve cada nome (e cada
  // lado de uma dupla "A / B") pro uid via _memberUidByName e compara com o meu
  // uid. Sem isso, o p2 de uma dupla cujo slot mostra só o nome do p1 (ex.:
  // "Kelly Barth") não era reconhecido como jogador do grupo. Nome só fallback
  // (jogador informal sem conta, ou helper indisponível).
  var myUid = _meUid();
  var me = _meName();
  var resolve = (typeof window._memberUidByName === 'function')
    ? function (nm) { return window._memberUidByName(t, nm); } : function () { return ''; };
  return group.players.some(function (n) {
    if (!n) return false;
    var sides = (n.indexOf('/') !== -1) ? n.split('/').map(function (s) { return s.trim(); }) : [n];
    return sides.some(function (s) {
      if (!s) return false;
      var slotUid = resolve(s);
      // Ambos com uid ⇒ identidade decidida SÓ por uid (homônimo de uid distinto
      // NÃO casa). Nome só quando o slot é informal/legado (sem uid). Espelha a
      // regra cristalizada na Parte 7.
      if (myUid && slotUid) return slotUid === myUid;
      return me && s === me;
    });
  });
}

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

// Mapa nome → uid (top-level + slots de dupla p1Name/p2Name + sub-participantes).
// v3.0.81: inclui p1Name→p1Uid / p2Name→p2Uid (slot estrutural de dupla) — sem
// isso, um folga que é membro de dupla não resolvia pro uid e ficava de fora dos
// convidáveis.
function _nameUidMap(t) {
  var map = {};
  (Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {})).forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    var nm = p.displayName || p.name || '';
    if (nm && p.uid) map[nm] = p.uid;
    if (p.p1Name && p.p1Uid) map[p.p1Name] = p.p1Uid;
    if (p.p2Name && p.p2Uid) map[p.p2Name] = p.p2Uid;
    (p.participants || []).forEach(function (sp) { if (sp && (sp.displayName || sp.name) && sp.uid) map[sp.displayName || sp.name] = sp.uid; });
  });
  return map;
}

// ── Mutações de baixo nível ─────────────────────────────────────────────────
function _rewriteSlot(group, fromName, toName, clearResults, t) {
  // v4.4.117: além do NOME, reescreve o UID do slot (identidade por uid). O substituto é
  // outra pessoa — o jogo/elenco tem que apontar pro uid DELE (ou null se convidado sem
  // conta). Sem isto, o slot mantinha o uid do ausente e a classificação por uid confundia
  // o substituto com o ausente. toUid resolvido pelo perfil do substituto.
  var _toUid = null;
  try { var _n2u = (t && typeof window._buildNameToUid === 'function') ? window._buildNameToUid(t) : null; if (_n2u && Object.prototype.hasOwnProperty.call(_n2u, toName)) _toUid = _n2u[toName] || null; } catch (e) {}
  function _rw(names, uids) {
    if (!Array.isArray(names)) return names;
    return names.map(function (n, i) {
      if (n === fromName) { if (Array.isArray(uids)) uids[i] = _toUid; return toName; }
      return n;
    });
  }
  (group.matches || []).forEach(function (m) {
    if (Array.isArray(m.team1)) m.team1 = _rw(m.team1, m.team1Uids);
    if (Array.isArray(m.team2)) m.team2 = _rw(m.team2, m.team2Uids);
    if (m.team1 && m.team2) { m.p1 = m.team1.join(' / '); m.p2 = m.team2.join(' / '); }
    if (clearResults) { m.winner = null; m.scoreP1 = null; m.scoreP2 = null; m.sets = null; delete m.pendingResult; delete m.draw; }
  });
  if (Array.isArray(group.players)) group.players = _rw(group.players, group.playersUids);
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
  // Quem "ficou de fora nesta rodada" (MESMA categoria, com conta/uid pra aceitar):
  //  (a) folgas do sorteio (sit-out 'remainder' — modelo antigo/inativos re-sorteados);
  //  (b) LISTA DE ESPERA monarch (t.monarchWaitlist — desde v2.6.99 a sobra da divisão
  //      por 4 vira espera, NÃO folga; sem esta fonte o diálogo dizia "ninguém ficou
  //      de fora" mesmo com gente esperando).
  var folgas = (round && round.matches || []).filter(function (m) {
    return m && m.isSitOut && m.sitOutReason === 'remainder' && (!cat || m.category === cat) && uidMap[m.p1];
  }).map(function (m) { return { name: m.p1, uid: uidMap[m.p1] }; });
  if (typeof window._getMonarchWaitlist === 'function') {
    window._getMonarchWaitlist(t, cat).forEach(function (nm) {
      if (nm && uidMap[nm]) folgas.push({ name: nm, uid: uidMap[nm] });
    });
  }
  // fora: quem já está no grupo, o próprio ausente; dedup por uid
  var inGroup = {}; (group.players || []).forEach(function (n) { inGroup[n] = 1; });
  var seen = {};
  folgas = folgas.filter(function (f) {
    if (!f.uid || seen[f.uid] || inGroup[f.name] || f.name === absentName) return false;
    seen[f.uid] = 1; return true;
  });

  var catLbl = cat ? (window._displayCategoryName ? window._displayCategoryName(cat) : cat) : '';
  // Texto DINÂMICO conforme a regra do torneio: só menciona Pontos Avançados quando o
  // torneio usa PA E a punição de W.O. está ativa — com o VALOR configurado pelo org.
  var _woPenVal = (typeof window._woAdvPenalty === 'function') ? window._woAdvPenalty(t) : 0;
  var html = '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;"><b>' + _safe(absentName) + '</b> leva W.O. (0 pts na rodada' + (_woPenVal ? ', ' + _woPenVal + ' nos Pontos Avançados' : '') + '). Quem entra no lugar?</div>';
  if (folgas.length > 0) {
    html += '<div style="font-size:0.74rem;font-weight:700;color:#4ade80;margin:10px 0 6px;">Convidar quem ficou de fora' + (catLbl ? ' (' + _safe(catLbl) + ')' : '') + ' — o PRIMEIRO que aceitar entra e pontua de verdade</div>';
    html += '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px;">Toque pra marcar/desmarcar quem recebe o convite (todos marcados = convida todos).</div>';
    html += '<div id="liga-fill-cands">' + folgas.map(function (f) {
      return '<button type="button" class="btn btn-outline" data-cand="1" data-on="1" data-uid="' + _safe(f.uid) + '" data-name="' + _safe(f.name) + '" onclick="window._ligaToggleCand(this)" style="width:100%;margin-bottom:6px;text-align:left;border-color:rgba(16,185,129,0.55);color:#4ade80;">✅ ' + _safe(f.name) + '</button>';
    }).join('') + '</div>';
    html += '<button class="btn btn-success" style="width:100%;margin-top:4px;font-weight:800;" onclick="window._ligaInviteSelected(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(absentName) + '\')">📨 Convidar selecionados</button>';
  } else {
    html += '<div style="font-size:0.74rem;color:var(--text-muted);margin:8px 0;">Ninguém da mesma categoria ficou de fora nesta rodada para convidar.</div>';
  }
  html += '<div style="font-size:0.74rem;font-weight:700;color:#fbbf24;margin:12px 0 6px;">Jogador X — qualquer pessoa presente (não pontua)</div>';
  html += '<button class="btn btn-outline" style="width:100%;border-color:rgba(251,191,36,0.4);color:#fbbf24;" onclick="window._ligaFillGuestPrompt(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(absentName) + '\')">🎾 Completar com Jogador X</button>';

  if (window.showAlertDialog) window.showAlertDialog('Substituto', html, function () {}, { type: 'info', confirmText: 'Fechar' });
};

// Fecha os diálogos padrão do app (#custom-alert/confirm/input-dialog — notifications.js).
function _closeDialogs() {
  ['custom-alert-dialog', 'custom-confirm-dialog', 'custom-input-dialog'].forEach(function (id) {
    try { var o = document.getElementById(id); if (o) o.remove(); } catch (e) {}
  });
}

// Pill de candidato: marca/desmarca quem vai receber o convite.
window._ligaToggleCand = function (btn) {
  var on = btn.getAttribute('data-on') === '1';
  btn.setAttribute('data-on', on ? '0' : '1');
  btn.style.opacity = on ? '0.45' : '';
  btn.style.borderColor = on ? 'rgba(255,255,255,0.2)' : 'rgba(16,185,129,0.55)';
  btn.style.color = on ? 'var(--text-muted)' : '#4ade80';
  btn.innerHTML = (on ? '⬜ ' : '✅ ') + btn.innerHTML.replace(/^(✅|⬜)\s*/, '');
};

// Lê os candidatos marcados no diálogo e dispara o convite múltiplo.
window._ligaInviteSelected = function (tId, roundIndex, groupName, absentName) {
  var sel = [];
  document.querySelectorAll('#liga-fill-cands [data-cand][data-on="1"]').forEach(function (b) {
    sel.push({ uid: b.getAttribute('data-uid'), name: b.getAttribute('data-name') });
  });
  if (!sel.length) { if (window.showNotification) window.showNotification('Convite', 'Marque ao menos um jogador pra convidar.', 'info'); return; }
  _closeDialogs(); // convite disparado → o diálogo "Substituto" some
  window._ligaInviteSubMulti(tId, roundIndex, groupName, absentName, sel);
};

// ── Jogador X (guest, não pontua) ───────────────────────────────────────────
window._ligaFillGuestPrompt = function (tId, roundIndex, groupName, absentName) {
  // Confirmar/Cancelar EXPLÍCITOS antes de aplicar (pedido do dono): o Jogador X
  // entra nos jogos no lugar do W.O. mas NÃO pontua — merece um passo de confirmação.
  var _confirm = function (name) {
    var nm = (name || '').trim() || 'Jogador X';
    if (window.showConfirmDialog) {
      window.showConfirmDialog('Confirmar Jogador X?',
        '<b>' + _safe(nm) + '</b> entra nos jogos no lugar de <b>' + _safe(absentName) + '</b> só pra completar a rodada — <b>não pontua</b> na classificação (nem do grupo, nem geral).',
        function () { window._ligaFillGuest(tId, roundIndex, groupName, absentName, nm); },
        function () {}, { type: 'warning', confirmText: 'Confirmar', cancelText: 'Cancelar' });
    } else {
      window._ligaFillGuest(tId, roundIndex, groupName, absentName, nm);
    }
  };
  if (window.showInputDialog) {
    window.showInputDialog('Jogador X', 'Nome de quem vai completar a rodada (opcional):', _confirm,
      { placeholder: 'Jogador X', confirmText: 'Continuar' });
  } else {
    _confirm('');
  }
};
window._ligaFillGuest = function (tId, roundIndex, groupName, absentName, guestName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  // Jogador X CONFIRMADO → fecha o diálogo "Substituto" (e qualquer diálogo empilhado):
  // a vaga foi resolvida, a tela tem que sumir (pedido do dono). Os diálogos do app
  // são #custom-alert/confirm/input-dialog (notifications.js).
  _closeDialogs();
  var round = t.rounds[roundIndex];
  var cat = _groupCategory(group);
  // Evita colisão de nome com um jogador real: se já existe, sufixa.
  var existing = {}; (group.players || []).forEach(function (n) { existing[n] = 1; });
  var gname = guestName; var k = 2;
  while (existing[gname] || (Array.isArray(t.ligaGhosts) && t.ligaGhosts.indexOf(gname) !== -1 && gname !== guestName)) { gname = guestName + ' ' + k; k++; }
  _commitLiga(tId, function (ft) {
    var g = _getGroup(ft, roundIndex, groupName); var r = ft.rounds && ft.rounds[roundIndex];
    if (!g || !r) return;
    _addWoMarker(ft, r, roundIndex, absentName, cat);
    _rewriteSlot(g, absentName, gname, true, t);
    _addGhost(ft, gname);
    g.woAbsent = absentName; g.subStatus = 'filled'; g.subName = gname; g.subIsGuest = true;
    delete g.pendingInviteId;
    // Completar com Jogador X supera qualquer convite pendente do grupo — cancela
    // pra não deixar convite órfão (que um jogador real poderia aceitar depois).
    if (Array.isArray(ft.ligaSubInvites)) {
      ft.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
    }
  });
  if (window.showNotification) window.showNotification('Rodada liberada', absentName + ' levou W.O. · ' + gname + ' completa o grupo (sem pontuar).', 'success');
  _rerender(tId);
};

// ── Convite a folgas/espera (precisa aceitar; o 1º que aceitar joga) ─────────
// Cria UM convite por convidado (todos do mesmo grupo/rodada/ausente). O primeiro
// que aceitar preenche a vaga (entra como se tivesse sido sorteado e PONTUA); os
// demais convites são supersedidos no aceite.
window._ligaInviteSubMulti = function (tId, roundIndex, groupName, absentName, invitees) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  invitees = (invitees || []).filter(function (i) { return i && i.uid; });
  if (!invitees.length) return;
  var cat = _groupCategory(group);
  var _ts = Date.now();
  var list = invitees.map(function (i, idx) {
    return { id: 'sub-' + _ts + '-' + idx + '-' + Math.floor(Math.random() * 1e5), uid: i.uid, name: i.name };
  });
  var _byUid = _meUid(), _byName = _meName(), _createdAt = new Date().toISOString();
  _commitLiga(tId, function (ft) {
    var g = _getGroup(ft, roundIndex, groupName); var r = ft.rounds && ft.rounds[roundIndex];
    if (!g || !r) return;
    if (!Array.isArray(ft.ligaSubInvites)) ft.ligaSubInvites = [];
    // Cancela qualquer convite pendente anterior do mesmo grupo.
    ft.ligaSubInvites = ft.ligaSubInvites.filter(function (iv) { return !(iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending'); });
    list.forEach(function (li) {
      if (ft.ligaSubInvites.some(function (iv) { return iv.id === li.id; })) return; // idempotente por id
      ft.ligaSubInvites.push({
        id: li.id, roundIndex: roundIndex, groupName: groupName, absentName: absentName,
        category: cat || null, inviteeUid: li.uid, inviteeName: li.name,
        byUid: _byUid, byName: _byName, status: 'pending', createdAt: _createdAt
      });
    });
    _addWoMarker(ft, r, roundIndex, absentName, cat); // W.O. já vale (ausente = 0)
    g.woAbsent = absentName; g.subStatus = 'pending'; g.pendingInviteId = list[0].id; delete g.subName; delete g.subIsGuest;
  });
  if (typeof window._sendUserNotification === 'function') {
    list.forEach(function (li) {
      try {
        window._sendUserNotification(li.uid, {
          type: 'liga-sub-invite', level: 'fundamental', tournamentId: String(t.id), tournamentName: t.name || 'torneio',
          message: 'Você foi convidado pra entrar no lugar de ' + absentName + ' no ' + groupName + ' do torneio "' + (t.name || 'torneio') + '". O primeiro que aceitar joga (vale pontos). Abra o torneio pra aceitar.'
        });
      } catch (e) {}
    });
  }
  if (window.showNotification) {
    window.showNotification('Convite enviado', list.length === 1
      ? (list[0].name + ' precisa aceitar pra entrar no lugar de ' + absentName + '.')
      : (list.length + ' jogadores convidados — o primeiro que aceitar entra no lugar de ' + absentName + '.'), 'success');
  }
  _rerender(tId);
};
// Compat: convite único (chamadas antigas) delega no múltiplo.
window._ligaInviteSub = function (tId, roundIndex, groupName, absentName, inviteeUid, inviteeName) {
  window._ligaInviteSubMulti(tId, roundIndex, groupName, absentName, [{ uid: inviteeUid, name: inviteeName }]);
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
  if (!group || !round) { _commitLiga(tId, function (ft) { var x = (ft.ligaSubInvites || []).filter(function (y) { return y.id === inviteId; })[0]; if (x) x.status = 'expired'; }); return; }
  var _ri = iv.roundIndex, _gn = iv.groupName, _invName = iv.inviteeName, _absName = iv.absentName;
  // convites-irmãos pendentes (multi-convite: o 1º que aceita supera os demais) —
  // capturados ANTES do commit pra notificar depois.
  var _siblings = (t.ligaSubInvites || []).filter(function (x) {
    return x.id !== inviteId && x.status === 'pending' && x.groupName === _gn && x.roundIndex === _ri;
  });
  _commitLiga(tId, function (ft) {
    var fiv = (ft.ligaSubInvites || []).filter(function (x) { return x.id === inviteId && x.status === 'pending'; })[0]; if (!fiv) return;
    var g = _getGroup(ft, _ri, _gn); var r = ft.rounds && ft.rounds[_ri];
    if (!g || !r) { fiv.status = 'expired'; return; }
    _removeSitOut(r, _invName);     // não é mais folga — vai jogar
    // sai da LISTA DE ESPERA monarch (entra como se tivesse sido sorteado; a espera
    // não pode continuar contando com ele pra formar grupo novo).
    try {
      var _wlK = (fiv.category || '_default_').replace(/\s+/g, '_');
      if (ft.monarchWaitlist && Array.isArray(ft.monarchWaitlist[_wlK])) {
        ft.monarchWaitlist[_wlK] = ft.monarchWaitlist[_wlK].filter(function (n) { return n !== _invName; });
      }
    } catch (e) {}
    _rewriteSlot(g, _absName, _invName, true, t);
    g.subStatus = 'filled'; g.subName = _invName; g.subIsGuest = false; delete g.pendingInviteId;
    fiv.status = 'accepted'; fiv.resolvedAt = new Date().toISOString();
    // supersede os convites-irmãos (vaga preenchida pelo primeiro que aceitou)
    (ft.ligaSubInvites || []).forEach(function (x) {
      if (x.id !== inviteId && x.status === 'pending' && x.groupName === _gn && x.roundIndex === _ri) {
        x.status = 'superseded'; x.resolvedAt = new Date().toISOString();
      }
    });
  });
  // avisa os demais convidados que a vaga já foi preenchida
  if (typeof window._sendUserNotification === 'function') {
    _siblings.forEach(function (sx) {
      try { window._sendUserNotification(sx.inviteeUid, { type: 'liga-sub-result', level: 'all', tournamentId: String(t.id), tournamentName: t.name || 'torneio', message: 'A vaga no ' + _gn + ' do torneio "' + (t.name || 'torneio') + '" já foi preenchida (' + _invName + ' aceitou primeiro).' }); } catch (e) {}
    });
  }
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
  var _ri = iv.roundIndex, _gn = iv.groupName;
  _commitLiga(tId, function (ft) {
    var fiv = (ft.ligaSubInvites || []).filter(function (x) { return x.id === inviteId && x.status === 'pending'; })[0]; if (!fiv) return;
    fiv.status = 'declined'; fiv.resolvedAt = new Date().toISOString();
    // multi-convite: o grupo só REABRE quando NÃO resta nenhum convite pendente —
    // enquanto houver outro convidado que pode aceitar, segue 'pending'.
    var g = _getGroup(ft, _ri, _gn);
    var _still = (ft.ligaSubInvites || []).some(function (x) { return x.status === 'pending' && x.groupName === _gn && x.roundIndex === _ri; });
    if (g && !_still) { g.subStatus = 'open'; delete g.pendingInviteId; } // W.O. permanece; grupo volta a precisar de substituto
  });
  if (iv.byUid && typeof window._sendUserNotification === 'function') {
    var _remain = (t.ligaSubInvites || []).filter(function (x) { return x.id !== inviteId && x.status === 'pending' && x.groupName === _gn && x.roundIndex === _ri; }).length;
    var _msg = iv.inviteeName + ' recusou o convite pra substituir ' + iv.absentName + ' no ' + iv.groupName + '. ' +
      (_remain > 0 ? ('Ainda há ' + _remain + ' convite(s) pendente(s) — o 1º que aceitar joga.') : 'Escolha outro substituto ou um Jogador X.');
    try { window._sendUserNotification(iv.byUid, { type: 'liga-sub-result', level: 'fundamental', tournamentId: String(t.id), tournamentName: t.name || 'torneio', message: _msg }); } catch (e) {}
  }
  if (window.showNotification) window.showNotification('Convite recusado', 'Você recusou. O grupo vai escolher outro substituto.', 'info');
  _rerender(tId);
};

// Cancelar convite pendente (quem acionou) e escolher outro caminho.
window._ligaCancelInvite = function (tId, roundIndex, groupName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  var _absent = group.woAbsent;
  _commitLiga(tId, function (ft) {
    var g = _getGroup(ft, roundIndex, groupName); if (!g) return;
    if (Array.isArray(ft.ligaSubInvites)) ft.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
    g.subStatus = 'open'; delete g.pendingInviteId;
  });
  _rerender(tId);
  window._ligaPickFill(tId, roundIndex, groupName, _absent);
};

// Convidado demorou/vai recusar → cancela o convite pendente e completa JÁ com
// Jogador X (sem esperar). O ausente continua com W.O. (0 pts).
window._ligaSwitchToGuest = function (tId, roundIndex, groupName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  var _absent = group.woAbsent;
  _commitLiga(tId, function (ft) {
    var g = _getGroup(ft, roundIndex, groupName); if (!g) return;
    if (Array.isArray(ft.ligaSubInvites)) ft.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
    g.subStatus = 'open'; delete g.pendingInviteId;
  });
  window._ligaFillGuestPrompt(tId, roundIndex, groupName, _absent);
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
    _commitLiga(tId, function (ft) {
      var g = _getGroup(ft, roundIndex, groupName); var r = ft.rounds && ft.rounds[roundIndex];
      if (!g || !r) return;
      var _abs = g.woAbsent; if (!_abs) return; // já revertido (idempotência)
      if (g.subStatus === 'filled' && g.subName) {
        _rewriteSlot(g, g.subName, _abs, true, t); // substituto → ausente de volta
        if (g.subIsGuest) _removeGhost(ft, g.subName);
        else _addFolgaMarker(ft, r, roundIndex, g.subName, cat); // folga volta pro substituto real
      }
      _removeSitOut(r, _abs); // remove o marcador de W.O.
      // cancela convites pendentes do grupo
      if (Array.isArray(ft.ligaSubInvites)) ft.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
      delete g.woAbsent; delete g.subStatus; delete g.subName; delete g.subIsGuest; delete g.pendingInviteId;
    });
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
    // multi-convite: lista TODOS os pendentes do grupo (1 → nome; 2+ → contagem).
    var _pend = Array.isArray(t.ligaSubInvites) ? t.ligaSubInvites.filter(function (x) { return x.status === 'pending' && x.groupName === group.name && x.roundIndex === roundIndex; }) : [];
    var who = _pend.length === 1 ? (_pend[0].inviteeName + ' convidado, aguardando confirmação')
      : _pend.length > 1 ? (_pend.length + ' convidados — o 1º que aceitar joga')
      : 'substituto convidado, aguardando confirmação';
    var s = '<span style="font-size:0.66rem;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);padding:2px 8px;border-radius:6px;">⏳ ' + _safe(group.woAbsent) + ' levou W.O. · ' + _safe(who) + '</span>';
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
  // Estado normal: oferece declarar ausência (só se grupo não terminou).
  // v3.1.72: torneio multi-dia + jogadores lançam resultado → usa o fluxo CANÔNICO
  // confirmar/contesta (wo-claim.js), apontável pelos próprios jogadores. Caso
  // contrário, mantém o gatilho do organizador (imediato + reverter), como antes.
  if (!gDone) {
    if (typeof window._woClaimEnabled === 'function' && window._woClaimEnabled(t) && typeof window._woClaimChip === 'function') {
      return window._woClaimChip(t, { scope: 'group', roundIndex: roundIndex, groupName: group.name, players: group.players, matches: group.matches });
    }
    if (manage) {
      // Label padrão "W.O." (cosmético — pedido do dono; era "⚠️ Faltou alguém?").
      // O fluxo continua o mesmo: folga assume a vaga ou Jogador X.
      return window._woBtnHtml("window._ligaAbsentFlow('" + tE + "'," + roundIndex + ",'" + gE + "')", true,
        { label: 'W.O.', title: 'Algum jogador não pôde vir? Dê W.O. e chame um substituto.' });
    }
  }
  return '';
};

// ─── W.O. CANÔNICO em Rei/Rainha (fonte única = t.matches) ───────────────────
// v4.1.39: o sorteio canônico grava os grupos monarch em t.matches (bracket
// 'monarch', groupName, monarchGroup) — NÃO em t.rounds[i].monarchGroups. O fluxo
// antigo (_ligaAbsentFlow/_getGroup) lia t.rounds e ficou órfão após a
// canonização. Estas funções operam DIRETO em t.matches (sobrevive à
// serialização): troca o ausente pelo substituto nos jogos do grupo + marcador
// W.O. (0 pts) + ghost em t.ligaGhosts (Jogador X, não pontua) OU folga da rodada
// (joga e pontua). Estado 100% derivado de t.matches (sem objeto de grupo
// persistente). Botão W.O. padrão (não "Faltou alguém?").
function _monMatchesAll(t, pIdx) {
  return (t.matches || []).filter(function (m) { return m && m.bracket === 'monarch' && ((m.phaseIndex || 0) === (pIdx || 0)); });
}
function _monMatches(t, gName, pIdx) {
  return _monMatchesAll(t, pIdx).filter(function (m) { return m.groupName === gName; });
}
function _monPlaying(t, gName, pIdx) { return _monMatches(t, gName, pIdx).filter(function (m) { return !m.isSitOut; }); }
function _monWoMarker(t, gName, pIdx) { return _monMatches(t, gName, pIdx).filter(function (m) { return m.isSitOut && m.sitOutReason === 'wo'; })[0] || null; }
function _monPlayers(t, gName, pIdx) {
  var s = {};
  _monPlaying(t, gName, pIdx).forEach(function (m) { (m.team1 || []).concat(m.team2 || []).forEach(function (n) { if (n) s[n] = 1; }); });
  return Object.keys(s);
}
// Folgas da rodada = participantes solo, reais, que ficaram de fora de TODOS os
// grupos desta fase e não estão ausentes/ghost. São os candidatos a "chamar".
function _monRoundFolgas(t, pIdx) {
  var playing = {};
  _monMatchesAll(t, pIdx).forEach(function (m) { if (!m.isSitOut) (m.team1 || []).concat(m.team2 || []).forEach(function (n) { if (n) playing[n] = 1; }); });
  var ghosts = t.ligaGhosts || [];
  var out = [];
  (t.participants || []).forEach(function (p) {
    var nm = (typeof window._pName === 'function') ? window._pName(p) : (p && (p.displayName || p.name) || '');
    if (!nm || nm.indexOf('/') > -1) return;                 // só solo (Rei/Rainha é individual)
    if (playing[nm]) return;                                 // já joga nesta rodada
    if (ghosts.indexOf(nm) > -1) return;
    if (typeof window._idMapHas === 'function' && window._idMapHas(t, t.absent || {}, p)) return; // ausente
    out.push(nm);
  });
  return out;
}
function _monCanManage(t, gName, pIdx) { return _canManageGroup(t, { players: _monPlayers(t, gName, pIdx) }); }

// Aplica: troca ausente→substituto nos jogos do grupo + marcador W.O. + ghost/folga.
window._monWoApply = function (tId, pIdx, gName, absentName, fillName, isGuest) {
  pIdx = pIdx || 0;
  _commitLiga(tId, function (ft) {
    var playing = _monPlaying(ft, gName, pIdx);
    if (!playing.length) return;
    playing.forEach(function (m) {
      if (Array.isArray(m.team1)) m.team1 = m.team1.map(function (n) { return n === absentName ? fillName : n; });
      if (Array.isArray(m.team2)) m.team2 = m.team2.map(function (n) { return n === absentName ? fillName : n; });
      if (m.team1 && m.team2) { m.p1 = m.team1.join(' / '); m.p2 = m.team2.join(' / '); }
    });
    // remove marcador W.O. anterior deste grupo (idempotente)
    ft.matches = (ft.matches || []).filter(function (m) { return !(m.bracket === 'monarch' && m.groupName === gName && ((m.phaseIndex || 0) === pIdx) && m.isSitOut && m.sitOutReason === 'wo'); });
    var gIdx = (playing[0] && playing[0].monarchGroup != null) ? playing[0].monarchGroup : 0;
    ft.matches.push({
      id: 'monwo-' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
      bracket: 'monarch', isMonarch: true, monarchGroup: gIdx, groupIdx: gIdx, groupName: gName,
      phaseIndex: pIdx, round: (playing[0] && playing[0].round) || 1,
      isSitOut: true, sitOutReason: 'wo', sitOutPoints: 0, p1: absentName, p2: 'W.O.',
      woReplacedBy: fillName, woIsGuest: !!isGuest, label: 'W.O.',
      category: (playing[0] && playing[0].category) || undefined
    });
    if (isGuest) { _addGhost(ft, fillName); }              // Jogador X — não pontua
    else { _removeGhost(ft, fillName); }                    // folga real — pontua
    if (!Array.isArray(ft.history)) ft.history = [];
    ft.history.push({ date: new Date().toISOString(), message: 'W.O. (Rei/Rainha ' + gName + '): ' + absentName + ' → ' + fillName + (isGuest ? ' (Jogador X)' : '') });
  });
  if (window.showNotification) window.showNotification('🔁 W.O. aplicado', absentName + ' → ' + fillName + (isGuest ? ' (Jogador X — não pontua)' : ''), 'success');
  _rerender(tId);
};

// Reverte o W.O. de um grupo (só se os jogos ainda não começaram).
window._monWoRevert = function (tId, pIdx, gName) {
  pIdx = pIdx || 0;
  var t = _findT(tId); if (!t) return;
  var wm = _monWoMarker(t, gName, pIdx); if (!wm) return;
  var playing = _monPlaying(t, gName, pIdx);
  if (typeof window._matchHasRealPlay === 'function' && playing.some(function (m) { return window._matchHasRealPlay(m); })) {
    if (window.showNotification) window.showNotification('Não dá pra reverter', 'Os jogos do grupo já começaram.', 'warning');
    return;
  }
  var absentName = wm.p1, fillName = wm.woReplacedBy, isGuest = wm.woIsGuest;
  _commitLiga(tId, function (ft) {
    _monPlaying(ft, gName, pIdx).forEach(function (m) {
      if (Array.isArray(m.team1)) m.team1 = m.team1.map(function (n) { return n === fillName ? absentName : n; });
      if (Array.isArray(m.team2)) m.team2 = m.team2.map(function (n) { return n === fillName ? absentName : n; });
      if (m.team1 && m.team2) { m.p1 = m.team1.join(' / '); m.p2 = m.team2.join(' / '); }
    });
    ft.matches = (ft.matches || []).filter(function (m) { return !(m.bracket === 'monarch' && m.groupName === gName && ((m.phaseIndex || 0) === pIdx) && m.isSitOut && m.sitOutReason === 'wo'); });
    if (isGuest) _removeGhost(ft, fillName);
  });
  if (window.showNotification) window.showNotification('↩️ W.O. revertido', absentName + ' voltou ao grupo.', 'info');
  _rerender(tId);
};

// Passo 1: escolher quem faltou (jogadores do grupo).
window._monWoFlow = function (tId, pIdx, gName) {
  pIdx = pIdx || 0;
  var t = _findT(tId); if (!t) return;
  if (!_monCanManage(t, gName, pIdx)) { if (window.showNotification) window.showNotification('W.O.', 'Só o organizador ou um jogador do grupo pode fazer isso.', 'info'); return; }
  var players = _monPlayers(t, gName, pIdx);
  var rows = players.map(function (p) {
    return '<button class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;" onclick="window._monWoPickFill(\'' + _esc(tId) + '\',' + pIdx + ',\'' + _esc(gName) + '\',\'' + _esc(p) + '\')">' + _safe(p) + '</button>';
  }).join('');
  if (window.showAlertDialog) {
    window.showAlertDialog('Quem não pôde jogar? — ' + _safe(gName),
      '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;">O jogador escolhido leva <b>W.O.</b> (0 pontos nesta rodada). Em seguida você escolhe quem entra no lugar dele.</div>' + rows,
      function () {}, { type: 'warning', confirmText: 'Fechar' });
  }
};

// Passo 2: escolher o preenchimento — chamar uma FOLGA da rodada OU Jogador X.
window._monWoPickFill = function (tId, pIdx, gName, absentName) {
  pIdx = pIdx || 0;
  var t = _findT(tId); if (!t) return;
  var folgas = _monRoundFolgas(t, pIdx);
  var html = '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;"><b>' + _safe(absentName) + '</b> leva W.O. (0 pts). Quem entra no lugar?</div>';
  if (folgas.length) {
    html += '<div style="font-size:0.74rem;font-weight:700;color:#4ade80;margin:4px 0 6px;">Folga da rodada — entra e PONTUA</div>';
    html += folgas.map(function (f) {
      return '<button class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;border-color:rgba(16,185,129,0.4);color:#4ade80;" onclick="window._monWoApply(\'' + _esc(tId) + '\',' + pIdx + ',\'' + _esc(gName) + '\',\'' + _esc(absentName) + '\',\'' + _esc(f) + '\',false); window._dismissAllOverlays&&window._dismissAllOverlays();">🟢 ' + _safe(f) + '</button>';
    }).join('');
  } else {
    html += '<div style="font-size:0.72rem;opacity:0.7;margin-bottom:8px;">Nenhum jogador de folga nesta rodada.</div>';
  }
  html += '<div style="font-size:0.74rem;font-weight:700;color:#fbbf24;margin:12px 0 6px;">Jogador X — qualquer presente (NÃO pontua)</div>';
  html += '<button class="btn btn-outline" style="width:100%;border-color:rgba(251,191,36,0.4);color:#fbbf24;" onclick="window._monWoGuestPrompt(\'' + _esc(tId) + '\',' + pIdx + ',\'' + _esc(gName) + '\',\'' + _esc(absentName) + '\')">🎾 Completar com Jogador X</button>';
  if (window.showAlertDialog) window.showAlertDialog('Substituir ' + _safe(absentName), html, function () {}, { type: 'info', confirmText: 'Fechar' });
};

window._monWoGuestPrompt = function (tId, pIdx, gName, absentName) {
  if (typeof window.showInputDialog === 'function') {
    window.showInputDialog('Jogador X', 'Nome de quem vai completar a rodada (opcional):', function (val) {
      var name = (val || '').trim() || 'Jogador X';
      window._monWoApply(tId, pIdx, gName, absentName, name, true);
    }, { placeholder: 'Jogador X', confirmText: 'Completar' });
  } else {
    window._monWoApply(tId, pIdx, gName, absentName, 'Jogador X', true);
  }
};

// HTML do controle no cabeçalho do grupo (chamado por _renderMonarchStage).
window._monWoControlHtml = function (tId, pIdx, gName, groupDone) {
  pIdx = pIdx || 0;
  var t = _findT(tId); if (!t) return '';
  if (!(window._isLigaFormat && window._isLigaFormat(t)) || t.status === 'finished') return '';
  var manage = _monCanManage(t, gName, pIdx);
  var wm = _monWoMarker(t, gName, pIdx);
  if (wm) {
    var lbl = wm.woIsGuest ? (_safe(wm.woReplacedBy) + ' (Jogador X)') : _safe(wm.woReplacedBy);
    var s = '<span style="font-size:0.66rem;font-weight:700;color:#a78bfa;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);padding:2px 8px;border-radius:6px;">🔁 ' + _safe(wm.p1) + ' W.O. → ' + lbl + '</span>';
    var played = (typeof window._matchHasRealPlay === 'function') && _monPlaying(t, gName, pIdx).some(function (m) { return window._matchHasRealPlay(m); });
    if (manage && !played && typeof window._woBtnHtml === 'function') {
      s += ' ' + window._woBtnHtml("window._monWoRevert('" + _esc(tId) + "'," + pIdx + ",'" + _esc(gName) + "')", false, { label: '↩️ Reverter W.O.', size: 'btn-sm' });
    }
    return s;
  }
  if (!groupDone && manage && typeof window._woBtnHtml === 'function') {
    return window._woBtnHtml("window._monWoFlow('" + _esc(tId) + "'," + pIdx + ",'" + _esc(gName) + "')", true,
      { label: 'W.O.', size: 'btn-sm', title: 'Algum jogador não pôde vir? Dê W.O. e chame um substituto (folga ou Jogador X).' });
  }
  return '';
};

})();
