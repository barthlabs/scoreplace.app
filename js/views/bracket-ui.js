// ── Bracket UI Handlers ──
var _t = window._t || function(k) { return k; };

// v1.3.31-beta: helper compartilhado pra computar estatísticas de tempo
// dos pontos a partir de um array de intervalos (ms entre pontos consecutivos,
// onde o primeiro intervalo é matchStart→primeiroPonto).
//
// Faz 2 filtragens:
//   1. Outliers CURTOS (taps de correção, < max(2s, 30% mediana)) — descartados
//      do cálculo de "ponto mais rápido", igual à v1.0.35.
//   2. AQUECIMENTO INICIAL — se o PRIMEIRO intervalo for > 2× a mediana
//      dos demais (após filtro de curtos), assume que foi tempo de
//      aquecimento e o EXCLUI do cálculo de avgMs e maxMs. O tempo total
//      do jogo (matchEndTime - matchStartTime) NÃO é afetado — o helper
//      retorna esse valor inalterado pra o caller usar.
//
// Bug reportado pelo dono: "caso o primeiro ponto demore muito mais do
// que a média de tempo dos pontos pode ser por causa de um aquecimento
// inicial bem comum. Desconsidere para efeito de ponto mais longo e para
// a média de tempo dos pontos na partida. pode considerar para o tempo
// total do jogo apenas".
//
// Retorna: { avgMs, maxMs, minMs, warmupSkipped, warmupMs, outlierFilteredCount }
//   - avgMs/maxMs: calculados sobre o set "limpo" (sem warmup)
//   - minMs: calculado com filtro de curtos
//   - warmupSkipped: bool — se o 1º intervalo foi tratado como aquecimento
//   - warmupMs: o intervalo descartado (pra debug / display opcional)
window._computeMatchTimeStats = function(intervals) {
  if (!intervals || intervals.length === 0) return null;
  var _median = function(arr) {
    if (!arr || arr.length === 0) return 0;
    var s = arr.slice().sort(function(a,b){return a-b;});
    return s.length % 2 === 1 ? s[Math.floor(s.length/2)] : (s[s.length/2 - 1] + s[s.length/2]) / 2;
  };
  // Mediana inicial sobre TODOS os intervalos pra setar threshold de curtos
  var medianAll = _median(intervals);
  var shortThreshold = Math.max(2000, Math.floor(medianAll * 0.3));

  // Detecta aquecimento: 1º intervalo > 2× mediana DOS DEMAIS (após
  // descartar os curtos). Precisa de pelo menos 2 intervalos no "rest"
  // pra ter mediana confiável — caso contrário pula a heurística.
  var warmupSkipped = false;
  var warmupMs = null;
  var medianRestForReplace = null;
  if (intervals.length >= 3) {
    var rest = [];
    for (var ri = 1; ri < intervals.length; ri++) {
      if (intervals[ri] >= shortThreshold) rest.push(intervals[ri]);
    }
    if (rest.length >= 2) {
      var medianRest = _median(rest);
      if (medianRest > 0 && intervals[0] > 2 * medianRest) {
        warmupSkipped = true;
        warmupMs = intervals[0];
        medianRestForReplace = medianRest;
      }
    }
  }

  // v1.3.32-beta: quando warmup é detectado, SUBSTITUI o 1º intervalo pela
  // MEDIANA DOS DEMAIS em vez de descartar. Assim o 1º ponto continua
  // contado normalmente — só a duração inflada pelo aquecimento é
  // substituída pelo valor "típico" da partida. Bug reportado: "considere
  // para o primeiro ponto o tempo médio".
  var workingSet;
  if (warmupSkipped && medianRestForReplace != null) {
    workingSet = [medianRestForReplace].concat(intervals.slice(1));
  } else {
    workingSet = intervals.slice();
  }
  if (workingSet.length === 0) {
    return { avgMs: null, maxMs: null, minMs: null, warmupSkipped: true, warmupMs: warmupMs, outlierFilteredCount: 0 };
  }

  var avgMs = Math.round(_median(workingSet));
  var maxMs = 0, filteredMin = Infinity, filteredCount = 0;
  for (var wi = 0; wi < workingSet.length; wi++) {
    if (workingSet[wi] > maxMs) maxMs = workingSet[wi];
    if (workingSet[wi] >= shortThreshold) {
      if (workingSet[wi] < filteredMin) filteredMin = workingSet[wi];
      filteredCount++;
    }
  }
  var sortedWorking = workingSet.slice().sort(function(a,b){return a-b;});
  var safeMin = filteredCount > 0 ? filteredMin : sortedWorking[0];
  return {
    avgMs: avgMs,
    maxMs: maxMs || null,
    minMs: safeMin,
    warmupSkipped: warmupSkipped,
    warmupMs: warmupMs,
    outlierFilteredCount: workingSet.length - filteredCount
  };
};

// v1.3.33-beta: handler de confirmação do casual_link_request. Chamado
// pelo botão da notificação na inbox quando o amigo aceita ou rejeita.
// Atualiza match doc:
//   - aceita: players[slotIndex].uid = userUid + remove pending. Notifica
//     o solicitante (casual_link_accepted).
//   - rejeita: remove pending. Notifica o solicitante (casual_link_rejected).
window._confirmCasualLinkRequest = async function(notif, accept) {
  if (!notif || !notif.casualMatchDocId) return;
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid) return;
  if (!window.FirestoreDB || !window.FirestoreDB.db) return;
  try {
    var docRef = window.FirestoreDB.db.collection('casualMatches').doc(notif.casualMatchDocId);
    var snap = await docRef.get();
    if (!snap.exists) {
      if (typeof showNotification === 'function') showNotification('Partida não encontrada', 'Pode ter sido apagada.', 'warning');
      return;
    }
    var data = snap.data();
    var pending = Array.isArray(data.pendingLinkRequests) ? data.pendingLinkRequests.slice() : [];
    var matchIdx = pending.findIndex(function(r) {
      return r.slotIndex === notif.casualSlotIndex && r.suggestedUid === cu.uid;
    });
    if (matchIdx === -1) {
      // Já processado ou expirou
      if (typeof showNotification === 'function') showNotification('Já processado', 'Esta sugestão já foi resolvida.', 'info');
      return;
    }
    var req = pending[matchIdx];
    pending.splice(matchIdx, 1);
    var updates = { pendingLinkRequests: pending };
    if (accept) {
      // Atualiza players[slotIndex].uid + denormalized arrays
      var players = Array.isArray(data.players) ? data.players.slice() : [];
      if (players[notif.casualSlotIndex]) {
        players[notif.casualSlotIndex] = Object.assign({}, players[notif.casualSlotIndex], {
          uid: cu.uid,
          displayName: cu.displayName || players[notif.casualSlotIndex].displayName || '',
          photoURL: cu.photoURL || players[notif.casualSlotIndex].photoURL || '',
          linkedViaConfirmation: true,
          linkedAt: new Date().toISOString()
        });
        updates.players = players;
        var playerUids = Array.isArray(data.playerUids) ? data.playerUids.slice() : [];
        if (playerUids.indexOf(cu.uid) === -1) {
          playerUids.push(cu.uid);
          updates.playerUids = playerUids;
        }
        var participants = Array.isArray(data.participants) ? data.participants.slice() : [];
        if (!participants.some(function(p) { return p.uid === cu.uid; })) {
          participants.push({
            uid: cu.uid,
            displayName: cu.displayName || '',
            photoURL: cu.photoURL || '',
            joinedAt: new Date().toISOString(),
            linkedViaConfirmation: true
          });
          updates.participants = participants;
        }
      }
    } else {
      // Rejeição: remove uid/photoURL do slot e tira o uid da lista denormalizada
      var rPlayers = Array.isArray(data.players) ? data.players.slice() : [];
      if (rPlayers[notif.casualSlotIndex]) {
        rPlayers[notif.casualSlotIndex] = Object.assign({}, rPlayers[notif.casualSlotIndex], { uid: null, photoURL: null });
        updates.players = rPlayers;
      }
      var rUids = Array.isArray(data.playerUids) ? data.playerUids.slice() : [];
      var rUidIdx = rUids.indexOf(cu.uid);
      if (rUidIdx !== -1) { rUids.splice(rUidIdx, 1); updates.playerUids = rUids; }
    }
    await docRef.update(updates);
    // Rejeição: apaga o registro do matchHistory do usuário que recusou
    if (!accept) {
      try {
        await window.FirestoreDB.db.collection('users').doc(cu.uid)
          .collection('matchHistory').doc('casual_' + notif.casualMatchDocId).delete();
      } catch (_mhE) { window._warn('[casual link] delete matchHistory err:', _mhE); }
    }
    // Marca notif como lida + envia confirmação de volta pro solicitante
    if (window.FirestoreDB.markNotificationRead && notif._id) {
      try { await window.FirestoreDB.markNotificationRead(cu.uid, notif._id); } catch(e) {}
    }
    if (typeof window._sendUserNotification === 'function' && req.suggestedBy) {
      await window._sendUserNotification(req.suggestedBy, {
        type: accept ? 'casual_link_accepted' : 'casual_link_rejected',
        level: 'all',
        message: (cu.displayName || 'Usuário') + (accept
          ? ' confirmou que jogou a partida casual com você. As estatísticas foram atribuídas a ele/ela.'
          : ' disse que não era ele/ela na partida casual.'),
        casualMatchDocId: notif.casualMatchDocId,
        casualRoomCode: notif.casualRoomCode || ''
      });
    }
    if (typeof showNotification === 'function') {
      showNotification(
        accept ? '✅ Vínculo confirmado' : '❌ Sugestão rejeitada',
        accept ? 'Esta partida agora conta nas suas estatísticas.' : 'O solicitante foi avisado.',
        accept ? 'success' : 'info'
      );
    }
  } catch (e) {
    window._warn('[casual link] confirm err:', e);
    if (typeof showNotification === 'function') showNotification('Erro', 'Não foi possível processar. Tente novamente.', 'error');
  }
};

// ─── Friend matching pra sugerir vínculo de jogador "guest" → user real ──
// v1.3.33-beta: pedido do dono — durante/após partida casual, se um nome
// digitado (slot sem uid) bater com nome de um amigo do user logado,
// sugerir "esse Andre é o André de tal (seu amigo)? Vincular?". Ao
// vincular, os dados da partida ficam atribuídos ao perfil do amigo.

// Normalizador de nomes — strip acentos + lowercase + trim. Comparação
// "Andre" === "André" === "ANDRÉ" === "andre ".
window._normalizeName = function(s) {
  if (!s) return '';
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
};

// Cache de perfis de amigos (uid → {displayName, photoURL}). Hidratado
// lazy quando precisar — não duplica os fetches que explore.js já faz.
window._friendProfilesCache = window._friendProfilesCache || {};

// Busca perfis dos amigos do user logado e popula cache. Idempotente —
// fetches paralelos só quando necessário, retorna a partir do cache em
// chamadas subsequentes.
window._loadFriendProfilesCached = async function() {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !Array.isArray(cu.friends) || cu.friends.length === 0) return [];
  if (!window.FirestoreDB || typeof window.FirestoreDB.loadUserProfile !== 'function') return [];
  var toFetch = cu.friends.filter(function(uid) { return uid && !window._friendProfilesCache[uid]; });
  if (toFetch.length > 0) {
    var fetched = await Promise.all(toFetch.map(function(uid) {
      return window.FirestoreDB.loadUserProfile(uid).then(function(p) {
        return { uid: uid, profile: p };
      }).catch(function() { return { uid: uid, profile: null }; });
    }));
    fetched.forEach(function(item) {
      if (item.profile) {
        window._friendProfilesCache[item.uid] = {
          uid: item.uid,
          displayName: item.profile.displayName || '',
          photoURL: item.profile.photoURL || '',
          gender: item.profile.gender || ''
        };
      }
    });
  }
  return cu.friends.map(function(uid) { return window._friendProfilesCache[uid]; }).filter(Boolean);
};

// Dado um nome digitado, retorna lista ordenada de amigos candidatos.
// Match em camadas (mais relevante primeiro):
//   1. Full name exato (normalized)
//   2. First name exato
//   3. Substring (any token of typed name in friend's normalized name)
// Ignora amigos cujo uid já aparece em excludeUids (jogadores já logados).
window._suggestFriendsForGuestName = function(typedName, excludeUids) {
  if (!typedName) return [];
  var excl = Array.isArray(excludeUids) ? excludeUids : [];
  var friends = (window._friendProfilesCache && Object.keys(window._friendProfilesCache).map(function(k){return window._friendProfilesCache[k];})) || [];
  var normTyped = window._normalizeName(typedName);
  var normTypedFirst = normTyped.split(/\s+/)[0];
  var fullMatches = [], firstMatches = [], partialMatches = [];
  friends.forEach(function(fr) {
    if (!fr || !fr.displayName) return;
    if (excl.indexOf(fr.uid) !== -1) return;
    var normFr = window._normalizeName(fr.displayName);
    var normFrFirst = normFr.split(/\s+/)[0];
    if (normFr === normTyped) { fullMatches.push(fr); return; }
    if (normFrFirst === normTypedFirst && normTypedFirst.length >= 2) { firstMatches.push(fr); return; }
    // Substring fallback: typed name é prefixo OU sufixo de friend (ex.: "Andre" em "Andre Marques")
    if (normTyped.length >= 3 && (normFr.indexOf(normTyped) !== -1 || normTyped.indexOf(normFr) !== -1)) {
      partialMatches.push(fr);
    }
  });
  return fullMatches.concat(firstMatches).concat(partialMatches);
};


// v0.16.87: propaga mutação de um match (m) pra todas as refs com mesmo id
// no tournament (chaves eliminatórias/grupos que podem repetir o match em mais
// de uma estrutura legada). Lista de campos cobre o que `_saveResultInline` e
// `_editResult` mexem.
// v4.4.69: o branch monarchGroups[gi].matches saiu daqui — Rei/Rainha agora é
// FONTE ÚNICA: group.matches são REFERÊNCIAS de round.matches (hidratadas no
// load), então mutar round.matches já muta o grupo. Nada a propagar/sincronizar.
function _propagateMatchUpdate(t, m) {
  if (!t || !m || !m.id) return;
  var FIELDS = ['winner', 'draw', 'scoreP1', 'scoreP2', 'sets', 'setsWonP1', 'setsWonP2', 'totalGamesP1', 'totalGamesP2', 'fixedSet', 'isBye', 'pendingResult', 'wo', 'woAbsentSide'];
  var updateRef = function(ref) {
    if (!ref || ref === m) return; // skip self (already mutated)
    if (ref.id !== m.id) return;
    FIELDS.forEach(function(f) {
      if (m[f] === undefined) {
        delete ref[f];
      } else {
        ref[f] = m[f];
      }
    });
  };
  // 1. Walk t.matches (flat elim list)
  if (Array.isArray(t.matches)) t.matches.forEach(updateRef);
  // 2. Walk t.rounds[i].matches — FONTE ÚNICA do Rei/Rainha (os grupos referenciam
  //    esses mesmos objetos, então não há segunda cópia pra sincronizar).
  if (Array.isArray(t.rounds)) {
    t.rounds.forEach(function(r) {
      if (!r) return;
      if (Array.isArray(r.matches)) r.matches.forEach(updateRef);
    });
  }
  // 3. Walk t.groups (group stage)
  if (Array.isArray(t.groups)) {
    t.groups.forEach(function(g) {
      if (!g) return;
      if (Array.isArray(g.matches)) g.matches.forEach(updateRef);
      if (Array.isArray(g.rounds)) {
        g.rounds.forEach(function(gr) {
          if (Array.isArray(gr)) gr.forEach(updateRef);
          else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(updateRef);
        });
      }
    });
  }
  // 4. Walk t.rodadas (legacy)
  if (Array.isArray(t.rodadas)) {
    t.rodadas.forEach(function(r) {
      if (!r) return;
      if (Array.isArray(r.matches)) r.matches.forEach(updateRef);
      if (Array.isArray(r.jogos)) r.jogos.forEach(updateRef);
      if (Array.isArray(r)) r.forEach(updateRef);
    });
  }
  // 5. thirdPlaceMatch
  if (t.thirdPlaceMatch) updateRef(t.thirdPlaceMatch);
}
window._propagateMatchUpdate = _propagateMatchUpdate;

// ─── v0.17.1: Result Approval Flow ─────────────────────────────────────────
// Quando jogador (não-organizador) lança placar de match em torneio, o
// resultado fica em m.pendingResult e o time adversário (+ organizador)
// recebe notificação pra aprovar. Só após aprovação m.winner/m.scoreP1/etc.
// são populados. Pedido do usuário: "quando o placar for lançado pelo
// usuário em torneios o time adversário deve ser notificado para aprovar
// o resultado e só ai é que o placar é considerado concluido. antes disso
// fica pendente. o organizador também pode aprovar um placar lançado pelo
// usuário."

// Retorna 1 ou 2 se user está num dos lados do match; 0 se em nenhum.
// Compara por uid (preferido), email e displayName.
// CANÔNICO (dono, 18/jul: "uid e nada mais sempre. nem nome, nem email, nem celular"):
// de que lado do jogo o `user` está? SÓ pelo UID do SLOT — window._slotUids lê a identidade
// estrutural do slot (team*Uids → p*Uid → team*Obj/_participantUids), a MESMA que o W.O. e o
// avanço usam. Nenhum casamento por nome/e-mail/substring: a barra do nome é tipografia, o
// displayName pode ter mudado, e homônimos colidiam. Sem uid no user → 0 (guest/informal não
// loga; não é "o usuário atual"). Cobre 1v1, dupla e Rei/Rainha (todos carregam uid no slot).
// Ver [[project_uid_identity_canon_locked]] / [[project_match_slot_uid_identity]].
function _userTeamInMatch(t, m, user) {
  if (!m || !user || !user.uid) return 0;
  var uid = user.uid;
  var _su = (typeof window._slotUids === 'function') ? window._slotUids : function () { return []; };
  if (_su(m, 'p1').indexOf(uid) !== -1) return 1;
  if (_su(m, 'p2').indexOf(uid) !== -1) return 2;
  return 0;
}

// Verifica se user é organizador ou co-host ativo (independente de viewMode —
// pra approval queremos a permissão real, não a visualização atual).
function _isUserOrgOrCoHost(t, user) {
  if (!t || !user) return false;
  var email = user.email;
  var uid = user.uid;
  // UID-based check first (works for phone-only accounts without email)
  if (uid) {
    if (t.creatorUid && t.creatorUid === uid) return true;
    if (Array.isArray(t.coHosts)) {
      if (t.coHosts.some(function(ch) { return ch.uid === uid && ch.status === 'active'; })) return true;
    }
  }
  // Email-based fallback
  if (email) {
    if (t.organizerEmail === email) return true;
    if (t.creatorEmail === email) return true;
    if (Array.isArray(t.coHosts)) {
      if (t.coHosts.some(function(ch) { return ch.email === email && ch.status === 'active'; })) return true;
    }
  }
  return false;
}

// Decide se um placar lançado por `user` precisa de aprovação do adversário.
// Regras: (a) torneio não permite participantes lançar → não precisa (org só);
//         (b) organizador/co-host → não precisa; (c) user não está em nenhum
//         dos times do match → não precisa (referee/external); (d) time
//         adversário não tem nenhum humano (uid presente) → não precisa
//         (auto-approve); (e) caso contrário → precisa.
function _resultNeedsApproval(t, m, user) {
  if (!t || !m || !user) return false;
  // Quando em disputa, só o organizador pode lançar — participantes bloqueados
  if (m.pendingResult && m.pendingResult.disputed) return false;
  // Só aplica quando a configuração permite participantes lançar resultado.
  // v2.6.60: resolve por FASE do match (fallback top-level).
  var _re = (typeof window._effectiveResultEntry === 'function') ? window._effectiveResultEntry(t, m) : (t.resultEntry || 'organizer');
  var _playersCanSubmit = _re === 'players' || _re === 'all' ||
    (Array.isArray(_re) && _re.indexOf('players') !== -1);
  if (!_playersCanSubmit) return false;
  if (_isUserOrgOrCoHost(t, user)) return false;
  var userSide = _userTeamInMatch(t, m, user);
  if (userSide === 0) return false;
  var oppSide = userSide === 1 ? 'p2' : 'p1';
  var opposingSideStr = m[oppSide];
  if (!opposingSideStr || opposingSideStr === 'TBD' || opposingSideStr === 'BYE') return false;
  // Adversário tem gente com conta (uid) pra aprovar? — UID direto do slot, nunca casando
  // nome. Sem uid no lado adversário (guest/informal) → auto-aprova (não há quem aprove).
  var _su = (typeof window._slotUids === 'function') ? window._slotUids : function () { return []; };
  return _su(m, oppSide).length > 0;
}

// Notifica o time adversário (cada player com uid) + organizador
// que há um resultado pendente de aprovação.
function _notifyPendingApproval(t, m, proposerName) {
  if (typeof window._sendUserNotification !== 'function') return;
  var pr = m.pendingResult || {};
  // v2.1.18: placar por TIME (cada time com a sua pontuação), pra montar a
  // mensagem quebrada em linhas (melhor leitura em e-mail/WhatsApp/plataforma).
  var sA, sB;
  if (pr.useSets && Array.isArray(pr.sets) && pr.sets.length > 0) {
    sA = pr.sets.map(function(s) { return s.gamesP1; }).join(' ');
    sB = pr.sets.map(function(s) { return s.gamesP2; }).join(' ');
  } else {
    sA = (pr.scoreP1 != null ? pr.scoreP1 : '?');
    sB = (pr.scoreP2 != null ? pr.scoreP2 : '?');
  }
  // Mensagem em linhas: "Fulano lançou: \n TimeA X \n vs \n TimeB Y"
  var notifData = {
    type: 'match-pending-approval',
    title: '⏳ Resultado precisa de aprovação',
    message: (proposerName || 'Alguém') + ' lançou:\n' +
             (m.p1 || '?') + ' ' + sA + '\n' +
             'vs\n' +
             (m.p2 || '?') + ' ' + sB,
    tournamentId: t.id,
    tournamentName: t.name,
    matchId: m.id,
    level: 'fundamental',
    timestamp: Date.now()
  };
  // Lado do proponente E adversário — SÓ pelo UID do slot (nunca casando nome). Notifica
  // TODOS os uids do lado adversário; o proponente é pulado. Ver [[project_uid_identity_canon_locked]].
  var _su = (typeof window._slotUids === 'function') ? window._slotUids : function () { return []; };
  var u1 = _su(m, 'p1'), u2 = _su(m, 'p2');
  var proposerSide = pr.proposedBy ? (u1.indexOf(pr.proposedBy) !== -1 ? 1 : u2.indexOf(pr.proposedBy) !== -1 ? 2 : 0) : 0;
  var oppUids = proposerSide === 1 ? u2 : proposerSide === 2 ? u1 : [];
  var skipUids = {};
  (proposerSide === 1 ? u1 : proposerSide === 2 ? u2 : (pr.proposedBy ? [pr.proposedBy] : [])).forEach(function(u) { if (u) skipUids[u] = true; });
  oppUids.forEach(function(u) {
    if (u && !skipUids[u]) { window._sendUserNotification(u, notifData); skipUids[u] = true; }
  });
  // Organizador + co-organizadores ativos — SÓ por uid (creatorUid / coHosts[].uid).
  var orgUid = t.creatorUid;
  if (orgUid && !skipUids[orgUid]) { window._sendUserNotification(orgUid, notifData); skipUids[orgUid] = true; }
  if (Array.isArray(t.coHosts)) {
    t.coHosts.forEach(function(ch) { if (ch && ch.status === 'active' && ch.uid && !skipUids[ch.uid]) { window._sendUserNotification(ch.uid, notifData); skipUids[ch.uid] = true; } });
  }
}

window._userTeamInMatch = _userTeamInMatch;
window._isUserOrgOrCoHost = _isUserOrgOrCoHost;
window._resultNeedsApproval = _resultNeedsApproval;

// v3.0.77 (Parte 8 uid): "este lado/nome (string de slot da chave) pertence ao
// `user`?" — UID-FIRST. O render-layer (bracket.js) só tem a STRING do lado
// (m.p1/m.p2, ou um nome dentro de um grupo). Resolvemos o objeto do
// participante pela string e checamos o uid (top-level + p1Uid/p2Uid + sub-
// participants[] via _participantUids). Nome/email são SÓ fallback (conta
// legada sem uid, ou jogador informal). Sem isso, o p2 de uma dupla — cujo
// displayName é só o nome do p1 (ex.: "Kelly Barth") — nunca casava por nome e
// ficava invisível em "seu jogo"/lançar placar/destaque de grupo. Espelha o
// checkSide interno de _userTeamInMatch, mas standalone (não toca o caminho
// crítico de aprovação).
function _sideBelongsToUser(t, sideStr, user) {
  if (!t || !sideStr || !user) return false;
  if (typeof sideStr !== 'string' || sideStr === 'TBD' || sideStr === 'BYE') return false;
  var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  var pp = null;
  for (var j = 0; j < parts.length; j++) {
    var p = parts[j];
    var pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
    // v4.0.78: casa também pelo nome canônico ("p1 / p2" — _entryDisplayName), igual ao
    // _userTeamInMatch (4.0.76). Sem isto, dupla formada (displayName = só o p1) não era
    // achada quando o lado é "A / B" → caía no fallback de nome/split, não no uid.
    var pCanon = (typeof window._entryDisplayName === 'function') ? window._entryDisplayName(p) : pName;
    if (pName === sideStr || pCanon === sideStr) { pp = p; break; }
  }
  if (pp && typeof pp === 'object') {
    if (user.uid) {
      var _uids = (typeof window._participantUids === 'function')
        ? window._participantUids(pp)
        : [pp.uid, pp.p1Uid, pp.p2Uid].filter(Boolean);
      if (_uids.indexOf(user.uid) !== -1) return true;
    }
    if (user.email && pp.email && pp.email === user.email) return true;
    if (user.email && pp.email_lower && pp.email_lower === (user.email || '').toLowerCase()) return true;
  }
  // Fallback nome/email (legado / informal): nome do usuário aparece no nome do
  // lado, incluindo dupla "A / B".
  var dn = user.displayName || '';
  var em = user.email || '';
  if (dn && (sideStr === dn || sideStr.indexOf(dn) !== -1)) return true;
  if (em && sideStr === em) return true;
  if (sideStr.indexOf('/') !== -1) {
    var members = sideStr.split('/').map(function(n) { return n.trim(); });
    for (var mi = 0; mi < members.length; mi++) {
      if (dn && members[mi] === dn) return true;
      if (em && members[mi] === em) return true;
    }
  }
  return false;
}
window._sideBelongsToUser = _sideBelongsToUser;

// Helper: org, co-host OR confirmed arbiter — these users confirm results directly
// without requiring approval from the opposing side.
function _isUserAuthority(t, user) {
  if (!t || !user) return false;
  if (_isUserOrgOrCoHost(t, user)) return true;
  if (user.uid && Array.isArray(t.arbitros)) {
    return t.arbitros.some(function(a) { return a.uid === user.uid && a.status === 'confirmed'; });
  }
  return false;
}
window._isUserAuthority = _isUserAuthority;

// ── v2.3.82: Presença — permissões ──────────────────────────────────────────
// Quem pode marcar/retirar a presença de QUALQUER inscrito: organizador,
// co-organizador ou árbitro confirmado. (Atalho legível pra _isUserAuthority.)
window._canManagePresence = function(t, user) {
  user = user || (window.AppStore && window.AppStore.currentUser);
  return _isUserAuthority(t, user);
};

// Torneio onde os PARTICIPANTES lançam o placar (resultEntry players/all) — só
// nesses o jogador pode marcar a PRÓPRIA presença (com GPS no local).
window._participantsSelfPresence = function(t) {
  var re = (t && t.resultEntry) || 'organizer';
  return re === 'players' || re === 'all' ||
    (Array.isArray(re) && (re.indexOf('players') !== -1 || re.indexOf('all') !== -1));
};

// `name` (indivíduo) é o PRÓPRIO usuário inscrito em t? Casamento seguro:
// (a) nome == displayName do usuário E o usuário é membro do torneio; ou
// (b) sub-participante com uid == user.uid e nome batendo. Falso-negativo só
// significa "peça ao organizador"; evita falso-positivo (marcar o parceiro).
window._isMyOwnPlayerName = function(t, name, user) {
  user = user || (window.AppStore && window.AppStore.currentUser);
  if (!t || !name || !user) return false;
  var uid = user.uid || '';
  var email = (user.email || '').toLowerCase();
  var dn = user.displayName || '';
  // v1.2.2: membro é uid em memberUids — sem fallback por e-mail.
  var isMember = (Array.isArray(t.memberUids) && uid && t.memberUids.indexOf(uid) !== -1);
  if (dn && name === dn && isMember) return true;
  // uid no objeto do participante (top-level ou sub-participante de dupla)
  if (uid && Array.isArray(t.participants)) {
    for (var i = 0; i < t.participants.length; i++) {
      var p = t.participants[i];
      if (!p || typeof p !== 'object') continue;
      var pn = p.displayName || p.name || '';
      if (pn === name && (p.uid === uid)) return true;
      if (Array.isArray(p.participants)) {
        for (var k = 0; k < p.participants.length; k++) {
          var sub = p.participants[k];
          if (sub && (sub.displayName || sub.name) === name && sub.uid === uid) return true;
        }
      }
    }
  }
  return false;
};

// GPS: o usuário está fisicamente no local do torneio? Promise<bool>. Exige
// venueLat/venueLon no torneio e permissão de localização. Raio 500m (quadras
// são grandes e o GPS é impreciso). Sem coords ou sem permissão → false.
window._isUserAtTournamentVenue = function(t) {
  return new Promise(function(resolve) {
    if (!t || t.venueLat == null || t.venueLon == null) { resolve(false); return; }
    if (!navigator.geolocation) { resolve(false); return; }
    navigator.geolocation.getCurrentPosition(function(pos) {
      var toRad = function(d) { return d * Math.PI / 180; };
      var lat1 = pos.coords.latitude, lon1 = pos.coords.longitude;
      var lat2 = Number(t.venueLat), lon2 = Number(t.venueLon);
      if (isNaN(lat2) || isNaN(lon2)) { resolve(false); return; }
      var dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      var dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      resolve(dist <= 500);
    }, function() { resolve(false); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });
};

// Helper: re-render bracket preserving scroll position (zero jump)
// Uses anchor-based approach: saves the viewport-relative offset of a reference
// element, re-renders, then scrolls so the same element is at the same offset.
// Uses anchor-based approach: saves the viewport-relative offset of a reference
// element, re-renders, then scrolls so the same element is at the same offset.
function _rerenderBracket(tId, anchorMatchId) {
  // Se o usuário está no dashboard, re-renderizar o dashboard — não o bracket.
  // Evita substituir a view atual por um bracket quando o resultado foi lançado
  // a partir da dashboard ou de qualquer view que não seja o bracket.
  var _hash = window.location.hash || '';
  if (_hash === '#dashboard' || _hash === '' || _hash === '#') {
    if (typeof window._softRefreshView === 'function') window._softRefreshView();
    return;
  }

  // 1. Find anchor element — prefer the specific match card, fallback to any visible card
  var anchorEl = null;
  var anchorOffsetY = 0;
  if (anchorMatchId) {
    anchorEl = document.getElementById('card-' + anchorMatchId);
  }
  if (!anchorEl) {
    // Find first match card visible in viewport
    var allCards = document.querySelectorAll('[id^="card-"]');
    for (var ci = 0; ci < allCards.length; ci++) {
      var rect = allCards[ci].getBoundingClientRect();
      if (rect.top >= -100 && rect.top <= window.innerHeight) {
        anchorEl = allCards[ci];
        break;
      }
    }
  }
  var anchorId = anchorEl ? anchorEl.id : null;
  if (anchorEl) {
    anchorOffsetY = anchorEl.getBoundingClientRect().top;
  }

  // v0.16.85: detecta contexto INLINE — quando o user está em #tournaments/<id>
  // o bracket vive dentro de #inline-bracket-container, NÃO em #view-container.
  // Antes, _rerenderBracket sempre re-renderizava em view-container, o que (a)
  // substituía a página inteira por bracket-only ou (b) o erro silencioso
  // deixava view-container vazio e o inline container ficava com a versão
  // PRÉ-save do bracket — botão continuava como "Confirmar" verde mesmo após
  // m.winner ter sido setado em memória. Agora detectamos o contexto pelo
  // anchor: se a card do match está dentro de #inline-bracket-container,
  // re-renderizamos APENAS o inline container (preservando a página de
  // detalhe do torneio). Caso contrário, behavior normal (view-container).
  var inlineContainer = anchorEl && anchorEl.closest
    ? anchorEl.closest('#inline-bracket-container')
    : null;
  // Fallback: se anchorEl não foi achado mas a página tem inline container,
  // ainda assim usa-o (ex: re-render após scroll diferente).
  if (!inlineContainer && document.getElementById('inline-bracket-container')) {
    // Só usa inline se NÃO estamos numa página que é dedicated bracket view.
    // Heurística: se view-container tem #inline-bracket-container como child,
    // estamos em #tournaments e o bracket é inline.
    var vc0 = document.getElementById('view-container');
    if (vc0 && vc0.querySelector('#inline-bracket-container')) {
      inlineContainer = document.getElementById('inline-bracket-container');
    }
  }

  // 2. Save horizontal scrolls
  var _sx = window.scrollX || window.pageXOffset || 0;
  var _sy = window.scrollY || window.pageYOffset || 0;
  var bracketWrapper = document.querySelector('.bracket-sticky-scroll-wrapper');
  var _bsx = bracketWrapper ? bracketWrapper.scrollLeft : 0;

  // v0.16.96: captura valores typed-but-unsaved de TODOS os inputs de placar
  // antes do re-render. Pedido do usuário: "quando o usuário está lançando
  // valores de placar o sistema registra, mas apaga assim que ele coloca o
  // resultado em outro jogo." Cenário: user digita 6-3 em match A + clica
  // Confirmar → _saveResultInline → _rerenderBracket → re-render destrói
  // OUTROS inputs (s1-B, s2-B) que tinham valores typed mas ainda não
  // confirmados. Restauração via dataset após o renderBracket completar.
  var _typedScores = {};
  document.querySelectorAll('input[id^="s1-"], input[id^="s2-"], input[id^="tb1-"], input[id^="tb2-"]').forEach(function(inp) {
    if (inp.value !== '' && inp.value != null) {
      _typedScores[inp.id] = inp.value;
    }
  });

  // 3. Suppress Firestore soft-refresh
  window._suppressSoftRefresh = true;
  clearTimeout(window._pendingSoftRefresh);

  var container = inlineContainer || document.getElementById('view-container');

  // v2.3.85: preserva o estado aberto/fechado dos <details> (ex.: "Demais jogos
  // da rodada", "Rodadas Anteriores") por índice — assim recalcular a
  // classificação a cada placar NÃO colapsa as seções que o usuário deixou
  // abertas/fechadas.
  var _detailsState = [];
  if (container) {
    try { container.querySelectorAll('details').forEach(function(d) { _detailsState.push(!!d.open); }); } catch (e) {}
  }

  // 4. Lock container height to prevent flash
  var prevHeight = container ? container.offsetHeight : 0;
  if (container && prevHeight > 0) {
    container.style.minHeight = prevHeight + 'px';
  }

  // v0.16.87: log diagnóstico — qual container, anchor encontrado, modo inline
  try {
    window._log('[_rerenderBracket v0.16.87]', {
      tId: tId,
      anchorMatchId: anchorMatchId,
      anchorElFound: !!anchorEl,
      anchorElParent: anchorEl && anchorEl.parentElement ? anchorEl.parentElement.tagName + (anchorEl.parentElement.id ? '#' + anchorEl.parentElement.id : '') : '(none)',
      inlineContainerFound: !!inlineContainer,
      containerId: container ? (container.id || '(no id)') : '(null)',
      isInlineFlag: !!inlineContainer
    });
  } catch (e) {}

  // 5. Re-render — passa isInline=true quando estamos no contexto de
  // tournament detail pra renderBracket usar o layout compacto sem cabeçalho
  // próprio (que duplicaria o header da página de detalhe).
  try {
    renderBracket(container, tId, !!inlineContainer);
    window._log('[_rerenderBracket v0.16.87] renderBracket completed OK');
  } catch (rerr) {
    window._error('[_rerenderBracket v0.16.87] renderBracket THREW:', rerr);
    // Fallback: tenta view-container se inlineContainer falhou
    if (inlineContainer) {
      var fallbackContainer = document.getElementById('view-container');
      if (fallbackContainer) {
        try {
          renderBracket(fallbackContainer, tId, false);
          window._log('[_rerenderBracket v0.16.87] fallback view-container render OK');
        } catch (fallbackErr) {
          window._error('[_rerenderBracket v0.16.87] fallback ALSO threw:', fallbackErr);
        }
      }
    }
  }

  // v2.3.85: restaura o estado dos <details> capturado antes do re-render.
  if (container && _detailsState.length) {
    try {
      var _newDetails = container.querySelectorAll('details');
      for (var _di = 0; _di < _newDetails.length && _di < _detailsState.length; _di++) {
        _newDetails[_di].open = _detailsState[_di];
      }
    } catch (e) {}
  }

  // v0.16.96: restaura valores typed-but-unsaved capturados antes do
  // re-render. Quando o user digita 6-3 em match A, confirma, o re-render
  // do bracket destruiria os inputs de match B onde ele já tinha digitado.
  // Agora os valores voltam após o re-render.
  Object.keys(_typedScores).forEach(function(inputId) {
    var inp = document.getElementById(inputId);
    if (inp && (inp.value === '' || inp.value == null)) {
      inp.value = _typedScores[inputId];
    }
  });
  // Re-aplica destaque visual de winner pros matches restaurados (tanto
  // s1- quanto s2- — _highlightWinner colore o lado vencedor).
  Object.keys(_typedScores).forEach(function(inputId) {
    var matchId = inputId.replace(/^s[12]-/, '').replace(/^tb[12]-/, '');
    if (matchId && typeof window._highlightWinner === 'function') {
      try { window._highlightWinner(matchId); } catch (e) {}
    }
  });

  // 6. Restore scroll anchored to the reference element
  function _restore() {
    var newAnchor = anchorId ? document.getElementById(anchorId) : null;
    if (newAnchor) {
      var newRect = newAnchor.getBoundingClientRect();
      var delta = newRect.top - anchorOffsetY;
      window.scrollBy(0, delta);
    } else {
      window.scrollTo(_sx, _sy);
    }
    var newWrapper = document.querySelector('.bracket-sticky-scroll-wrapper');
    if (newWrapper) newWrapper.scrollLeft = _bsx;
  }

  _restore();
  requestAnimationFrame(function() {
    _restore();
    requestAnimationFrame(function() {
      _restore();
      if (container) container.style.minHeight = '';
      setTimeout(function() { window._suppressSoftRefresh = false; }, 3000);
    });
  });
}
window._rerenderBracket = _rerenderBracket;

// Shared helper: resolve {name, team, uid, photoURL} list from m.p1/m.p2 by
// looking up uids/photos in t.participants. Returns null if either side is
// BYE/TBD or no participant has a registered uid.
function _buildMatchPlayersList(t, m) {
  if (!t || !m) return null;
  if (m.p1 === 'BYE' || m.p2 === 'BYE' || m.p1 === 'TBD' || m.p2 === 'TBD') return null;
  var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  var _splitSide = function(side) {
    if (!side || typeof side !== 'string') return [];
    return side.indexOf(' / ') !== -1 ? side.split(' / ').map(function(x){return x.trim();}).filter(Boolean) : [side.trim()];
  };
  var _resolveMeta = function(name) {
    var meta = { uid: null, photoURL: null };
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || typeof p === 'string') continue;
      var pn = p.displayName || p.name || '';
      // Participante individual ou dupla cujo nome completo bate
      if (pn === name) {
        meta.uid = p.uid || null;
        meta.photoURL = p.photoURL || p.photoUrl || null;
        return meta;
      }
      // Dupla: verifica se o nome é p1Name ou p2Name
      if (p.p1Name === name) { meta.uid = p.p1Uid || null; meta.photoURL = null; return meta; }
      if (p.p2Name === name) { meta.uid = p.p2Uid || null; meta.photoURL = null; return meta; }
      // Sub-participantes (formato array)
      if (Array.isArray(p.participants)) {
        for (var j = 0; j < p.participants.length; j++) {
          var sub = p.participants[j];
          var sn = sub && (sub.displayName || sub.name || '');
          if (sn === name) { meta.uid = (sub && sub.uid) || null; meta.photoURL = (sub && (sub.photoURL || sub.photoUrl)) || null; return meta; }
        }
      }
    }
    return meta;
  };
  var p1Names = _splitSide(m.p1);
  var p2Names = _splitSide(m.p2);
  if (p1Names.length === 0 || p2Names.length === 0) return null;
  var players = [];
  for (var a = 0; a < p1Names.length; a++) { var mA = _resolveMeta(p1Names[a]); players.push({ name: p1Names[a], team: 1, uid: mA.uid, photoURL: mA.photoURL }); }
  for (var b = 0; b < p2Names.length; b++) { var mB = _resolveMeta(p2Names[b]); players.push({ name: p2Names[b], team: 2, uid: mB.uid, photoURL: mB.photoURL }); }
  var hasAnyUid = players.some(function(p){ return !!p.uid; });
  if (!hasAnyUid) return null;
  return { players: players, p1Count: p1Names.length, p2Count: p2Names.length };
}

// Build and persist a minimal per-user matchHistory record for an inline
// tournament result. Called from _saveResultInline after syncImmediate so
// every participant's Estatísticas Detalhadas survives tournament deletion.
// Inline scoring has no pointLog/gameLog, so only games/sets aggregate —
// point-level analytics (holds, breaks, deuce, streaks) stay zero here.
function _persistInlineTournamentMatchRecord(t, m, s1, s2, tbP1, tbP2, isTiebreakEntry, useSets) {
  // Sandbox: resultados do SB NÃO vazam pro matchHistory (nem stats, nem troféus).
  if (window._isSandboxTournament && window._isSandboxTournament(t)) return;
  if (!window.FirestoreDB || !window.FirestoreDB.saveUserMatchRecords) return;
  var pl = _buildMatchPlayersList(t, m);
  if (!pl) return;
  var players = pl.players;
  var winnerTeam = 0;
  if (m.draw || m.winner === 'draw') winnerTeam = 0;
  else if (m.winner === m.p1) winnerTeam = 1;
  else if (m.winner === m.p2) winnerTeam = 2;
  var setsArr = [];
  if (useSets) {
    var setEntry = { gamesP1: s1, gamesP2: s2 };
    if (isTiebreakEntry && !isNaN(tbP1) && !isNaN(tbP2)) setEntry.tiebreak = { p1: tbP1, p2: tbP2 };
    setsArr.push(setEntry);
  }
  var setsT1 = useSets ? (s1 > s2 ? 1 : 0) : 0;
  var setsT2 = useSets ? (s2 > s1 ? 1 : 0) : 0;
  var zeroStats = { holdServed:0, held:0, longestStreak:0, biggestLead:0, servePtsPlayed:0, servePtsWon:0, receivePtsPlayed:0, receivePtsWon:0, deucePtsPlayed:0, deucePtsWon:0, breaks:0 };
  var team1 = Object.assign({ points: s1, games: s1, sets: setsT1 }, zeroStats);
  var team2 = Object.assign({ points: s2, games: s2, sets: setsT2 }, zeroStats);
  var recordId = 't_' + String(t.id) + '_' + String(m.id);
  var record = {
    matchId: recordId,
    matchType: 'tournament',
    tournamentId: t.id || null,
    tournamentName: t.name || null,
    sport: t.sport || t.modality || '',
    isDoubles: pl.p1Count > 1 || pl.p2Count > 1,
    finishedAt: new Date().toISOString(),
    startedAt: null,
    durationMs: null,
    timeStats: null,
    players: players,
    playerUids: players.filter(function(p){return !!p.uid;}).map(function(p){return p.uid;}),
    winnerTeam: winnerTeam,
    scoreSummary: s1 + '-' + s2,
    sets: setsArr,
    stats: { team1: team1, team2: team2 },
    playerStats: {}
  };
  try {
    var prom = window.FirestoreDB.saveUserMatchRecords(record);
    if (prom && typeof prom.catch === 'function') prom.catch(function(){});
  } catch(e) {}
}

// GSM (set-by-set) variant used by _saveSetResult. m.sets already holds the
// full per-set data so the record is richer than the inline path.
function _persistGSMTournamentMatchRecord(t, m, sets, p1Sets, p2Sets, totalGamesP1, totalGamesP2) {
  // Sandbox: resultados do SB NÃO vazam pro matchHistory (nem stats, nem troféus).
  if (window._isSandboxTournament && window._isSandboxTournament(t)) return;
  if (!window.FirestoreDB || !window.FirestoreDB.saveUserMatchRecords) return;
  var pl = _buildMatchPlayersList(t, m);
  if (!pl) return;
  var winnerTeam = 0;
  if (m.draw || m.winner === 'draw') winnerTeam = 0;
  else if (m.winner === m.p1) winnerTeam = 1;
  else if (m.winner === m.p2) winnerTeam = 2;
  var setsArr = (sets || []).map(function(s) {
    var e = { gamesP1: s.gamesP1, gamesP2: s.gamesP2 };
    if (s.tiebreak) {
      var _tb = s.tiebreak;
      var _p1 = (typeof _tb.p1 === 'number') ? _tb.p1 : (typeof _tb.pointsP1 === 'number' ? _tb.pointsP1 : null);
      var _p2 = (typeof _tb.p2 === 'number') ? _tb.p2 : (typeof _tb.pointsP2 === 'number' ? _tb.pointsP2 : null);
      if (_p1 !== null && _p2 !== null) e.tiebreak = { p1: _p1, p2: _p2 };
    }
    if (s.fixedSet) e.fixedSet = true;
    return e;
  });
  var zeroStats = { holdServed:0, held:0, longestStreak:0, biggestLead:0, servePtsPlayed:0, servePtsWon:0, receivePtsPlayed:0, receivePtsWon:0, deucePtsPlayed:0, deucePtsWon:0, breaks:0 };
  var team1 = Object.assign({ points: totalGamesP1 || 0, games: totalGamesP1 || 0, sets: p1Sets || 0 }, zeroStats);
  var team2 = Object.assign({ points: totalGamesP2 || 0, games: totalGamesP2 || 0, sets: p2Sets || 0 }, zeroStats);
  var scoreSummary = setsArr.map(function(s) {
    var base = s.gamesP1 + '-' + s.gamesP2;
    if (s.tiebreak) base += '(' + Math.min(s.tiebreak.p1, s.tiebreak.p2) + ')';
    return base;
  }).join(' ');
  var recordId = 't_' + String(t.id) + '_' + String(m.id);
  var record = {
    matchId: recordId,
    matchType: 'tournament',
    tournamentId: t.id || null,
    tournamentName: t.name || null,
    sport: t.sport || t.modality || '',
    isDoubles: pl.p1Count > 1 || pl.p2Count > 1,
    finishedAt: new Date().toISOString(),
    startedAt: null,
    durationMs: null,
    timeStats: null,
    players: pl.players,
    playerUids: pl.players.filter(function(p){return !!p.uid;}).map(function(p){return p.uid;}),
    winnerTeam: winnerTeam,
    scoreSummary: scoreSummary,
    sets: setsArr,
    stats: { team1: team1, team2: team2 },
    playerStats: {}
  };
  try {
    var prom = window.FirestoreDB.saveUserMatchRecords(record);
    if (prom && typeof prom.catch === 'function') prom.catch(function(){});
  } catch(e) {}
}


window._toggleBracketMode = function (tId) {
  window._bracketMirrorMode = !window._bracketMirrorMode;
  _rerenderBracket(tId);
};

window._setBracketZoom = function (tId, delta) {
  const steps = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  let cur = steps.indexOf(window._bracketZoom);
  if (cur === -1) cur = steps.length - 1; // default to 1.0
  cur = Math.max(0, Math.min(steps.length - 1, cur + delta));
  window._bracketZoom = steps[cur];
  // Apply zoom without full re-render for smooth experience
  const content = document.querySelector('.bracket-scroll-content');
  if (content) {
    content.style.transform = `scale(${window._bracketZoom})`;
    content.style.transformOrigin = 'top left';
  }
  // Update zoom label
  const label = document.getElementById('bracket-zoom-label');
  if (label) label.textContent = Math.round(window._bracketZoom * 100) + '%';
  // Sync slider
  const slider = document.getElementById('bracket-zoom-slider');
  if (slider) slider.value = cur;
  // Recalculate fixed scrollbar width
  _recalcFixedScrollbar();
};

window._resetBracketZoom = function (tId) {
  window._bracketZoom = 1;
  const content = document.querySelector('.bracket-scroll-content');
  if (content) {
    content.style.transform = '';
    content.style.transformOrigin = '';
  }
  const label = document.getElementById('bracket-zoom-label');
  if (label) label.textContent = '100%';
  const slider = document.getElementById('bracket-zoom-slider');
  if (slider) slider.value = 7; // index of 1.0 in steps array
  _recalcFixedScrollbar();
};

function _recalcFixedScrollbar() {
  const wrapper = document.querySelector('.bracket-sticky-scroll-wrapper');
  const content = wrapper ? wrapper.querySelector('.bracket-scroll-content') : null;
  const bar = document.getElementById('bracket-fixed-scrollbar');
  if (!wrapper || !content) return;
  const scaledWidth = content.scrollWidth * window._bracketZoom;
  wrapper.style.height = (content.scrollHeight * window._bracketZoom) + 'px';
  if (bar) {
    const inner = bar.firstChild;
    if (inner) inner.style.width = scaledWidth + 'px';
  }
}

window._togglePrevRoundsBlock = function (btn) {
  var card = btn && btn.closest ? btn.closest('.prev-rounds-card') : null;
  if (!card) return;
  var content = card.querySelector('.prev-rounds-content');
  if (!content) return;
  var willHide = content.style.display !== 'none';
  content.style.display = willHide ? 'none' : '';
  btn.textContent = willHide ? 'Mostrar' : 'Ocultar';
};

window._toggleRoundVisibility = function (tId, roundNum) {
  if (!window._hiddenRounds[tId]) window._hiddenRounds[tId] = new Set();
  const set = window._hiddenRounds[tId];
  const wasHidden = set.has(roundNum);
  if (wasHidden) {
    // "Mostrar" — unhide this round AND all rounds before it (restore everything up to this point)
    const toShow = [];
    set.forEach(r => { if (r <= roundNum) toShow.push(r); });
    toShow.forEach(r => set.delete(r));
  } else {
    // "Ocultar" — hide this round
    set.add(roundNum);
  }
  _rerenderBracket(tId);

  // After hiding, scroll so the next visible round's title ("QUARTAS DE FINAL"
  // etc.) sits at the very top of the viewport — accounting for the fixed
  // topbar and sticky back header so nothing covers the label.
  if (!wasHidden) {
    setTimeout(function () {
      var cols = document.querySelectorAll('.bracket-round-column[data-round-num]');
      var target = null;
      for (var i = 0; i < cols.length; i++) {
        var rn = parseInt(cols[i].getAttribute('data-round-num'), 10);
        if (!isNaN(rn) && rn > roundNum) { target = cols[i]; break; }
      }
      if (!target && cols.length > 0) target = cols[0];
      if (!target) return;

      // Measure fixed/sticky headers above the content so we can offset the
      // scroll position — otherwise the round title lands under them.
      var topbar = document.querySelector('.topbar');
      var backHeader = document.querySelector('.sticky-back-header');
      var offset = 0;
      if (topbar) {
        var tbRect = topbar.getBoundingClientRect();
        if (getComputedStyle(topbar).position === 'fixed' || tbRect.top <= 0) {
          offset += tbRect.height;
        }
      }
      if (backHeader) {
        offset += backHeader.getBoundingClientRect().height;
      }
      // Small breathing room so the label doesn't hug the header bottom edge
      offset += 8;

      var rect = target.getBoundingClientRect();
      var absoluteTop = rect.top + window.pageYOffset;
      var scrollY = Math.max(0, absoluteTop - offset);

      try {
        window.scrollTo({ top: scrollY, behavior: 'smooth' });
      } catch (e) {
        window.scrollTo(0, scrollY);
      }

      // Horizontal scroll for the bracket container (so the target round
      // is the leftmost visible column in wide brackets).
      var scrollParent = target.parentElement;
      while (scrollParent && scrollParent !== document.body) {
        var ov = getComputedStyle(scrollParent).overflowX;
        if (ov === 'auto' || ov === 'scroll') break;
        scrollParent = scrollParent.parentElement;
      }
      if (scrollParent && scrollParent !== document.body) {
        try {
          scrollParent.scrollTo({ left: target.offsetLeft - scrollParent.offsetLeft, behavior: 'smooth' });
        } catch (e) {
          scrollParent.scrollLeft = target.offsetLeft - scrollParent.offsetLeft;
        }
      }
    }, 50);
  }
};

// Revela apenas a rodada oculta mais recente (maior número) a cada clique.
// Clique sucessivo vai "desempilhando" as rodadas ocultas, da mais nova para a mais antiga.
window._showAllHiddenRounds = function (tId) {
  if (!window._hiddenRounds || !window._hiddenRounds[tId]) return;
  const set = window._hiddenRounds[tId];
  if (set.size === 0) return;
  let latest = -Infinity;
  set.forEach(r => { if (r > latest) latest = r; });
  if (isFinite(latest)) set.delete(latest);
  _rerenderBracket(tId);
};

// ── Swiss-past hidden columns (elim phase, past Swiss qualifier rounds) ──
// Kept in a separate Set per tournament so the round numbers don't collide
// with elim round numbers in window._hiddenRounds. Same LIFO reveal semantics
// as _toggleRoundVisibility / _showAllHiddenRounds.
if (!window._hiddenSwissPast) window._hiddenSwissPast = {};

window._toggleSwissPastVisibility = function (tId, roundNum) {
  if (!window._hiddenSwissPast[tId]) window._hiddenSwissPast[tId] = new Set();
  const set = window._hiddenSwissPast[tId];
  if (set.has(roundNum)) set.delete(roundNum);
  else set.add(roundNum);
  _rerenderBracket(tId);
};

window._showAllHiddenSwissPast = function (tId) {
  if (!window._hiddenSwissPast || !window._hiddenSwissPast[tId]) return;
  const set = window._hiddenSwissPast[tId];
  if (set.size === 0) return;
  let latest = -Infinity;
  set.forEach(r => { if (r > latest) latest = r; });
  if (isFinite(latest)) set.delete(latest);
  _rerenderBracket(tId);
};

// CANÔNICO (dono, 18/19-jul): o TIE-BREAK acontece no empate GATILHO configurado pelo organizador
// (o campo "games por set", `gamesPerSet`): um set de N games vai a N-N e joga o TB → placar FINAL
// (N+1, N). Ou seja gamesPerSet 6 → TB no 6-6 → final 7-6; gamesPerSet 5 → 5-5 → 6-5 (bate com o
// padrão ITF do Beach Tennis, project_sport_rules_canonical). Um set foi decidido no TB sse o placar
// difere por 1 E o PERDEDOR tem EXATAMENTE gamesPerSet (o vencedor gamesPerSet+1). RESPEITA a config
// (não é "qualquer empate"). O placar digitado é o FINAL (sem somar +1). FONTE ÚNICA revelar+salvar.
// (Antes o código usava gamesPerSet-1 → revelava no 6-5 e o 7-6 real não abria os campos — off-by-one.)
window._isTiebreakSetScore = function (g1, g2, gamesPerSet) {
  g1 = parseInt(g1); g2 = parseInt(g2);
  if (isNaN(g1) || isNaN(g2)) return false;
  var gp = parseInt(gamesPerSet) || 6;
  return Math.abs(g1 - g2) === 1 && Math.min(g1, g2) === gp;
};

window._highlightWinner = function (matchId) {
  const s1El = document.getElementById(`s1-${matchId}`);
  const s2El = document.getElementById(`s2-${matchId}`);
  if (!s1El || !s2El) return;
  const s1 = parseInt(s1El.value);
  const s2 = parseInt(s2El.value);

  // Reveal tiebreak inputs when both games equal the tiebreak trigger (e.g. 6-6)
  const tb1El = document.getElementById(`tb1-${matchId}`);
  const tb2El = document.getElementById(`tb2-${matchId}`);
  if (tb1El && tb2El) {
    var _trigger = null;
    try {
      var _tours = window.AppStore && window.AppStore.tournaments;
      if (Array.isArray(_tours)) {
        for (var ti = 0; ti < _tours.length; ti++) {
          var _tour = _tours[ti];
          var _matches = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(_tour) : (_tour.matches || []);
          for (var mi = 0; mi < _matches.length; mi++) {
            if (_matches[mi] && _matches[mi].id === matchId) {
              // v1.0.72-beta: trigger TB em qualquer torneio com tiebreakEnabled
              // (não exige type==='sets'). Permite TB inputs em torneios simples
              // que tenham tiebreak configurado.
              var _tsc = (typeof window._effectiveScoring === 'function') ? window._effectiveScoring(_tour, _matches[mi]) : _tour.scoring;
              if (_tsc && _tsc.tiebreakEnabled !== false &&
                  (_tsc.type === 'sets' || _tsc.gamesPerSet)) {
                // _trigger = games do PERDEDOR no TB (= gamesPerSet configurado). O TB acontece
                // no empate gamesPerSet×gamesPerSet → final (gamesPerSet+1, gamesPerSet). gp6 → 7-6.
                _trigger = (parseInt(_tsc.gamesPerSet) || 6);
              }
              break;
            }
          }
          if (_trigger !== null) break;
        }
      }
    } catch(e) {}
    // v1.0.77-beta: TB inputs uma vez mostrados NUNCA escondem (até re-render
    // do card). User: 'continua escondendo'. Abordagem v1.0.76 ainda escondia
    // em alguns casos por race do dataset.tbShown vs reflow. Agora: simples —
    // se trigger hit, mostra E marca data-tb-shown. Se data-tb-shown='1', fica.
    // Reset só quando card re-renderiza (input novo, sem o data attribute).
    // _trigger = gamesPerSet configurado pelo dono → revela os campos de TB SÓ no placar do
    // gatilho: gp6 → 7-6, gp5 → 6-5 (nunca 6-5 num set de 6, nem 8-7 — o set fecha no gatilho).
    var triggerHit = _trigger !== null && window._isTiebreakSetScore(s1, s2, _trigger);
    var alreadyShown = tb1El.getAttribute('data-tb-shown') === '1';
    if (triggerHit || alreadyShown) {
      tb1El.style.display = 'inline-block';
      tb2El.style.display = 'inline-block';
      tb1El.setAttribute('data-tb-shown', '1');
      tb2El.setAttribute('data-tb-shown', '1');
    }
    // NÃO esconde — uma vez visível, persiste. User pode deixar vazio se
    // não foi TB de fato. Save logic ignora valores vazios.
  }

  if (isNaN(s1) || isNaN(s2)) return;
  // Game count is authoritative for winner (7-6 ⇒ player with 7 wins the TB)
  s1El.style.color = s1 > s2 ? '#4ade80' : s1 < s2 ? '#f87171' : 'var(--text-bright)';
  s2El.style.color = s2 > s1 ? '#4ade80' : s2 < s1 ? '#f87171' : 'var(--text-bright)';
};


window._saveSetResult = function(tId, matchId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  const m = _findMatch(t, matchId);
  if (!m) return;
  // v2.6.96: placar efetivo do match (a fase pode ter GSM próprio).
  const sc = (typeof window._effectiveScoring === 'function') ? window._effectiveScoring(t, m) : t.scoring;
  if (!sc) return;
  const isFixedSet = sc.fixedSet === true;
  let sets = [];
  let p1Sets = 0, p2Sets = 0;

  if (isFixedSet) {
    // Fixed Set mode: single set with games won by each player
    const el1 = document.getElementById('set-p1-0');
    const el2 = document.getElementById('set-p2-0');
    if (!el1 || !el2) return;
    const g1 = parseInt(el1.value) || 0;
    const g2 = parseInt(el2.value) || 0;
    const setData = { gamesP1: g1, gamesP2: g2, fixedSet: true };

    if (g1 === g2) {
      // Tie — add tiebreak data
      const tbP1 = parseInt(document.getElementById('tb-p1')?.value) || 0;
      const tbP2 = parseInt(document.getElementById('tb-p2')?.value) || 0;
      setData.tiebreak = { pointsP1: tbP1, pointsP2: tbP2 };
      // Tiebreak winner gets the set
      if (tbP1 > tbP2) { setData.gamesP1 = g1 + 1; p1Sets = 1; }
      else if (tbP2 > tbP1) { setData.gamesP2 = g2 + 1; p2Sets = 1; }
    } else if (g1 > g2) {
      p1Sets = 1;
    } else {
      p2Sets = 1;
    }
    sets.push(setData);
  } else {
    // Standard set-by-set mode
    const totalSets = sc.setsToWin * 2 - 1;
    for (let i = 0; i < totalSets; i++) {
      const el1 = document.getElementById('set-p1-' + i);
      const el2 = document.getElementById('set-p2-' + i);
      if (!el1 || !el2) continue;
      const g1 = parseInt(el1.value);
      const g2 = parseInt(el2.value);
      if (isNaN(g1) || isNaN(g2)) break;

      const setData = { gamesP1: g1, gamesP2: g2 };

      // TB canônico: placar FINAL digitado (6-5/7-6/8-7) — difere por 1 e perdedor ≥ gamesPerSet-1.
      // Registra os pontos do TB SEM somar +1 (o games digitado já é o final). window._isTiebreakSetScore.
      if (window._isTiebreakSetScore(g1, g2, sc.gamesPerSet)) {
        const tbP1 = parseInt(document.getElementById('tb-p1')?.value) || 0;
        const tbP2 = parseInt(document.getElementById('tb-p2')?.value) || 0;
        if (tbP1 || tbP2) setData.tiebreak = { pointsP1: tbP1, pointsP2: tbP2 };
      }

      sets.push(setData);
      if (setData.gamesP1 > setData.gamesP2) p1Sets++;
      else if (setData.gamesP2 > setData.gamesP1) p2Sets++;

      if (p1Sets >= sc.setsToWin || p2Sets >= sc.setsToWin) break;
    }
  }

  let totalGamesP1Pre = 0, totalGamesP2Pre = 0;
  sets.forEach(function(s) { totalGamesP1Pre += s.gamesP1; totalGamesP2Pre += s.gamesP2; });

  // v0.17.1: aprovação do adversário no caminho GSM. Mesma regra do
  // _saveResultInline. Se user é jogador (não-org) e adversário tem humano,
  // resultado vai pra m.pendingResult e adversário/organizador aprovam.
  var _curUserGsm = window.AppStore && window.AppStore.currentUser;
  if (_curUserGsm && _resultNeedsApproval(t, m, _curUserGsm)) {
    var _proposedWinnerGsm = '';
    var _proposedDrawGsm = false;
    if (p1Sets > p2Sets) _proposedWinnerGsm = m.p1;
    else if (p2Sets > p1Sets) _proposedWinnerGsm = m.p2;
    else { _proposedWinnerGsm = 'draw'; _proposedDrawGsm = true; }
    var _scoreP1Gsm, _scoreP2Gsm;
    if (isFixedSet) {
      var _fs0g = sets[0];
      _scoreP1Gsm = _fs0g ? _fs0g.gamesP1 : p1Sets;
      _scoreP2Gsm = _fs0g ? _fs0g.gamesP2 : p2Sets;
    } else {
      _scoreP1Gsm = p1Sets;
      _scoreP2Gsm = p2Sets;
    }
    m.pendingResult = {
      kind: 'gsm',
      proposedBy: _curUserGsm.uid || null,
      proposedByEmail: _curUserGsm.email || null,
      proposedByName: _curUserGsm.displayName || _curUserGsm.email || 'Jogador',
      proposedAt: Date.now(),
      winner: _proposedWinnerGsm,
      draw: _proposedDrawGsm,
      sets: sets,
      setsWonP1: p1Sets,
      setsWonP2: p2Sets,
      scoreP1: _scoreP1Gsm,
      scoreP2: _scoreP2Gsm,
      totalGamesP1: totalGamesP1Pre,
      totalGamesP2: totalGamesP2Pre,
      useSets: true,
      isFixedSet: !!isFixedSet
    };
    var _ovGsm = document.getElementById('set-scoring-overlay');
    if (_ovGsm) _ovGsm.remove();
    _propagateMatchUpdate(t, m);
    var _pendingGsmObj = m.pendingResult;
    var _gsmPropLogMsg = 'Resultado proposto (sets): ' + m.p1 + ' vs ' + m.p2 + ' — aguardando aprovação (' + m.pendingResult.proposedByName + ')';
    window.AppStore.logAction(tId, _gsmPropLogMsg);
    // BLINDAGEM DE CORRIDA (project_concurrency_safe_saves): re-aplica a proposta GSM
    // (pendingResult) no match FRESCO via commitTournamentTx, em vez de syncImmediate
    // (doc inteiro → lost-update quando 2 propostas/resultados concorrem). Espelha o
    // caminho de proposta simples de _saveResultInline.
    window.AppStore.commitTournamentTx(tId, function (freshT) {
      var fm = window._findMatch(freshT, matchId);
      if (fm) {
        fm.pendingResult = _pendingGsmObj;
        if (typeof window._propagateMatchUpdate === 'function') window._propagateMatchUpdate(freshT, fm);
      }
      if (!Array.isArray(freshT.history)) freshT.history = [];
      freshT.history.push({ date: new Date().toISOString(), message: _gsmPropLogMsg });
    });
    // 4.1 DUAL-WRITE: espelha a proposta (sets) no doc do jogo.
    _dualWriteResult(tId, matchId);
    try { _notifyPendingApproval(t, m, m.pendingResult.proposedByName); } catch (e) { window._error('[pendingApproval gsm] notify failed', e); }
    showNotification('⏳ Resultado enviado', 'Aguardando aprovação do time adversário ou do organizador.', 'success');
    _rerenderBracket(tId, matchId);
    return;
  }

  m.sets = sets;
  m.setsWonP1 = p1Sets;
  m.setsWonP2 = p2Sets;
  if (isFixedSet) {
    m.fixedSet = true;
    // For fixed set, scoreP1/P2 show actual games (e.g. 4-2), not sets won
    var _fs0 = sets[0];
    m.scoreP1 = _fs0 ? _fs0.gamesP1 : p1Sets;
    m.scoreP2 = _fs0 ? _fs0.gamesP2 : p2Sets;
  } else {
    m.scoreP1 = p1Sets;
    m.scoreP2 = p2Sets;
  }

  let totalGamesP1 = 0, totalGamesP2 = 0;
  sets.forEach(s => {
    totalGamesP1 += s.gamesP1;
    totalGamesP2 += s.gamesP2;
  });
  m.totalGamesP1 = totalGamesP1;
  m.totalGamesP2 = totalGamesP2;

  if (p1Sets > p2Sets) {
    m.winner = m.p1;
    m.draw = false;
  } else if (p2Sets > p1Sets) {
    m.winner = m.p2;
    m.draw = false;
  }
  // v2.3.17: lançamento por sets — marca fim/início.
  m.resultAt = Date.now();
  if (!m.startedAt) m.startedAt = m.resultAt;
  if (m.pendingResult) delete m.pendingResult;

  const ov = document.getElementById('set-scoring-overlay');
  if (ov) ov.remove();

  const isGroupMatch = m.group !== undefined;
  const isRoundMatch = m.roundIndex !== undefined || (t.rounds && t.rounds.some(r => (r.matches || []).some(rm => rm.id === matchId)));

  if (!isGroupMatch && !isRoundMatch) {
    _advanceWinner(t, m);
    showNotification(_t('result.saved'), m.winner + ' vence ' + p1Sets + '-' + p2Sets + '!', 'success');
  } else if (isRoundMatch) {
    showNotification(_t('result.saved'), m.winner + ' vence ' + p1Sets + '-' + p2Sets + '!', 'success');
  } else {
    _checkGroupRoundComplete(t, m.group);
    showNotification(_t('result.saved'), m.winner + ' vence ' + p1Sets + '-' + p2Sets + '!', 'success');
  }

  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  [m.p1, m.p2].forEach(side => {
    if (!side || side === 'TBD' || side === 'BYE') return;
    const _names = side.includes(' / ') ? side.split(' / ').map(n => n.trim()).filter(Boolean) : [side];
    _names.forEach(nm => {
      // uid-first: resolve o nome do membro pro uid; nome só fallback.
      // Lançar resultado MARCA presença (quem jogou está presente) — CORRETO (dono
      // reafirmou 1-jul). O que NÃO pode é o SORTEIO marcar presença: o sorteio LIMPA
      // checkedIn/absent (ver _commitInitialDraw / _clearDrawRuntimeFlags).
      if (!window._idMapHas(t, t.checkedIn, nm)) window._idMapSet(t, t.checkedIn, nm, Date.now());
      window._idMapDel(t, t.absent, nm);
    });
  });
  if (!t.tournamentStarted) t.tournamentStarted = Date.now();

  const scoreText = sets.map(s => (typeof window._formatSetCombined === 'function')
    ? window._formatSetCombined(s, { html: false })
    : (s.gamesP1 + '-' + s.gamesP2)
  ).join(' ');

  var _gsmLogMsg = 'Resultado: ' + m.p1 + ' vs ' + m.p2 + ' — ' + scoreText + ' — Vencedor: ' + m.winner;
  window.AppStore.logAction(tId, _gsmLogMsg);
  // BLINDAGEM DE CORRIDA (project_concurrency_safe_saves): em vez de syncImmediate
  // (grava o doc INTEIRO → lost-update quando 2 resultados de jogos diferentes
  // concorrem, o último clobbera o outro), re-aplica o resultado GSM sobre o estado
  // FRESCO via commitResultTx → _applyResultToTournament(gsmFinal). A `t` local já
  // foi mutada acima (UI otimista); a transação reproduz a MESMA mutação no fresco.
  window.AppStore.commitResultTx(tId, matchId, {
    gsmFinal: true, sets: sets, setsWonP1: p1Sets, setsWonP2: p2Sets, isFixedSet: !!isFixedSet
  }, _gsmLogMsg);

  // Persist per-user matchHistory record (GSM path) — uses richer m.sets data.
  try { _persistGSMTournamentMatchRecord(t, m, sets, p1Sets, p2Sets, totalGamesP1, totalGamesP2); } catch(e) {}

  if (typeof window._sendUserNotification === 'function') {
    const _resultText = m.p1 + ' vs ' + m.p2 + ' — ' + scoreText + ' — Vencedor: ' + m.winner;
    const _notifData = {
      type: 'result',
      title: _t('bui.resultRegistered'),
      message: _resultText,
      tournamentId: tId,
      tournamentName: t.name,
      level: 'fundamental',
      timestamp: Date.now()
    };
    const _parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    [m.p1, m.p2].forEach(playerName => {
      if (!playerName || playerName === 'TBD' || playerName === 'BYE') return;
      const _found = _parts.find(p => {
        const pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
        return pName === playerName;
      });
      if (_found && typeof _found === 'object' && _found.uid) {
        window._sendUserNotification(_found.uid, _notifData);
      }
    });
  }

  _rerenderBracket(tId, matchId);
};

// v2.3.46: re-renderiza UM card de partida in-place (sem re-render do bracket
// inteiro). Usado pelo lançamento de placar em formatos por rodada (Liga/Suíço)
// enquanto a rodada NÃO está completa — assim a página fica estática:
// não pula scroll, não colapsa os "Demais jogos da rodada" e a classificação
// geral fica congelada onde está. A classificação só recomputa/sobe quando
// todos os placares da rodada forem lançados (re-render completo no fim da
// rodada). Reusa renderMatchCard (mesmo markup) pra evitar divergência visual.
// Retorna true se conseguiu substituir o card; false se deve cair no fallback
// (_rerenderBracket).
function _finalizeRoundCardInPlace(t, m, tId, matchId) {
  if (typeof window.renderMatchCard !== 'function') return false;
  var card = document.getElementById('card-' + matchId);
  if (!card) return false; // não está no DOM (ex: dashboard) → fallback
  // Contexto que renderMatchCard lê (coroa / sit-out / crown helper).
  window._currentBracketTournament = t;
  window._currentBracketTournamentId = String(tId);
  var isOrg = window.AppStore && typeof window.AppStore.isOrganizer === 'function'
    ? window.AppStore.isOrganizer(t) : false;
  var canEnterResult = isOrg
    || (typeof window._resultEntryIncludes === 'function'
        && (window._resultEntryIncludes(t, 'players') || window._resultEntryIncludes(t, 'referee')));
  var mn = card.getAttribute('data-match-num');
  var matchNum = (mn !== null && mn !== '') ? parseInt(mn, 10) : undefined;
  var html;
  try {
    html = window.renderMatchCard(m, canEnterResult, tId, matchNum);
  } catch (e) {
    window._error && window._error('[_finalizeRoundCardInPlace] renderMatchCard threw', e);
    return false;
  }
  if (!html) return false;
  card.outerHTML = html;
  return true;
}

// ── BLINDAGEM DE CONCORRÊNCIA (project_concurrency_safe_saves) ────────────────
// Mutação PURA de "lançar resultado" num torneio dado. Espelha EXATAMENTE o bloco
// de mutação de _saveResultInline (scores/sets/winner/draw/resultAt + advance OU
// checkGroupComplete + auto check-in + propagate), SEM side effects (notif/trophy/
// matchHistory/render) e SEM o caminho de fechar-última-rodada (esse defere ao
// _closeRound e NÃO passa por aqui). É rodada DENTRO de FirestoreDB.mutateTournament,
// sobre o estado FRESCO lido na transação — por isso a persistência do result-save
// é atômica (nenhum write concorrente se perde). NÃO recomputa isRoundMatch-last:
// o chamador (commitResultTx) só é invocado quando _deferSaveToTransition é false.
// payload: { s1, s2, useSets, isFixedSet, isTiebreakEntry, tbP1, tbP2 }.
// Retorna o match mutado (pra quem quiser ler winner), ou null se não achou.
window._applyResultToTournament = function (t, matchId, payload) {
  var m = window._findMatch(t, matchId);
  if (!m) return null;
  var s1 = payload.s1, s2 = payload.s2;
  var useSets = !!payload.useSets, isFixedSet = !!payload.isFixedSet;
  var isTiebreakEntry = !!payload.isTiebreakEntry, tbP1 = payload.tbP1, tbP2 = payload.tbP2;

  var isGroupMatch = m.group !== undefined;
  var isRoundMatch = m.roundIndex !== undefined || (t.rounds && t.rounds.some(function (r) {
    return (r.matches || []).some(function (rm) { return rm.id === matchId; });
  }));
  var allowDraw = isGroupMatch || isRoundMatch;

  if (payload.gsmFinal) {
    // Caminho GSM multi-set (best-of-N): a payload já traz o array de sets computado
    // por _saveSetResult. Espelha EXATAMENTE a mutação final daquela função (m.sets,
    // setsWon, fixedSet, scores, totalGames, winner). Re-aplicável sobre o doc FRESCO
    // dentro da transação (commitResultTx) → sem lost-update quando 2 resultados
    // concorrem. GSM final nunca é empate. project_concurrency_safe_saves.
    var _gs = payload.sets || [];
    m.sets = _gs;
    m.setsWonP1 = payload.setsWonP1; m.setsWonP2 = payload.setsWonP2;
    if (payload.isFixedSet) {
      m.fixedSet = true;
      var _gf0 = _gs[0];
      m.scoreP1 = _gf0 ? _gf0.gamesP1 : payload.setsWonP1;
      m.scoreP2 = _gf0 ? _gf0.gamesP2 : payload.setsWonP2;
    } else {
      m.scoreP1 = payload.setsWonP1; m.scoreP2 = payload.setsWonP2;
    }
    var _gtg1 = 0, _gtg2 = 0;
    _gs.forEach(function (s) { _gtg1 += (s.gamesP1 || 0); _gtg2 += (s.gamesP2 || 0); });
    m.totalGamesP1 = _gtg1; m.totalGamesP2 = _gtg2;
    if (payload.setsWonP1 > payload.setsWonP2) { m.winner = m.p1; m.draw = false; }
    else if (payload.setsWonP2 > payload.setsWonP1) { m.winner = m.p2; m.draw = false; }
  } else if (useSets) {
    var setData = { gamesP1: s1, gamesP2: s2 };
    if (isFixedSet) setData.fixedSet = true;
    if (isTiebreakEntry) setData.tiebreak = { pointsP1: tbP1, pointsP2: tbP2 };
    m.sets = [setData];
    m.setsWonP1 = s1 > s2 ? 1 : 0;
    m.setsWonP2 = s2 > s1 ? 1 : 0;
    if (isFixedSet) m.fixedSet = true;
    m.scoreP1 = s1; m.scoreP2 = s2;
    m.totalGamesP1 = s1; m.totalGamesP2 = s2;
  } else {
    m.scoreP1 = s1; m.scoreP2 = s2;
  }

  if (!payload.gsmFinal) {
    if (s1 === s2 && allowDraw) {
      m.winner = 'draw'; m.draw = true;
    } else {
      m.winner = s1 > s2 ? m.p1 : m.p2; m.draw = false;
    }
  }
  m.resultAt = Date.now();
  if (!m.startedAt) m.startedAt = m.resultAt;
  if (m.pendingResult) delete m.pendingResult;

  if (!isGroupMatch && !isRoundMatch) {
    if (typeof window._advanceWinner === 'function') window._advanceWinner(t, m);
  } else if (isGroupMatch) {
    if (typeof window._checkGroupRoundComplete === 'function') window._checkGroupRoundComplete(t, m.group);
  }
  // isRoundMatch (Liga/Suíço): nenhuma mutação estrutural aqui — standings é
  // recomputado no render; o fechamento de rodada é do _closeRound (deferido).

  // Auto check-in: marca presença dos jogadores deste jogo (e limpa ausência).
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  [m.p1, m.p2].forEach(function (side) {
    if (!side || side === 'TBD' || side === 'BYE') return;
    var _names = side.indexOf(' / ') !== -1 ? side.split(' / ').map(function (n) { return n.trim(); }).filter(Boolean) : [side];
    _names.forEach(function (nm) {
      // Lançar resultado MARCA presença (quem jogou está presente) — CORRETO (dono
      // reafirmou 1-jul). O que NÃO pode é o SORTEIO marcar presença: o sorteio LIMPA
      // checkedIn/absent (ver _commitInitialDraw / _clearDrawRuntimeFlags).
      if (!window._idMapHas(t, t.checkedIn, nm)) window._idMapSet(t, t.checkedIn, nm, Date.now());
      window._idMapDel(t, t.absent, nm);
    });
  });
  if (!t.tournamentStarted) t.tournamentStarted = Date.now();

  if (typeof window._propagateMatchUpdate === 'function') window._propagateMatchUpdate(t, m);
  return m;
};

window._saveResultInline = function (tId, matchId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  const m = _findMatch(t, matchId);
  if (!m) return;

  const s1El = document.getElementById(`s1-${matchId}`);
  const s2El = document.getElementById(`s2-${matchId}`);

  const s1 = s1El ? parseInt(s1El.value) : NaN;
  const s2 = s2El ? parseInt(s2El.value) : NaN;

  if (isNaN(s1) || isNaN(s2)) {
    showAlertDialog(_t('result.invalidScore'), _t('result.fillScore'), null, { type: 'warning' });
    return;
  }
  const isGroupMatch = m.group !== undefined;
  // Empate é permitido em: Grupos, Liga, Suíço, Ranking (rodadas)
  // Empate NÃO é permitido em: Eliminatórias (simples e dupla)
  const isRoundMatch = m.roundIndex !== undefined || (t.rounds && t.rounds.some(function(r) {
    return (r.matches || []).some(function(rm) { return rm.id === matchId; });
  }));
  const allowDraw = isGroupMatch || isRoundMatch;

  // GSM scoring compatibility: store inline scores as sets data when tournament uses GSM
  // v2.6.96: placar efetivo do match (a fase pode ter GSM próprio).
  const _isc = (typeof window._effectiveScoring === 'function') ? window._effectiveScoring(t, m) : t.scoring;
  const useSets = _isc && _isc.type === 'sets';
  const isFixedSet = useSets && _isc.fixedSet;
  const tbEnabled = useSets && _isc.tiebreakEnabled !== false;
  // TB no empate gamesPerSet×gamesPerSet → placar final (gamesPerSet+1, gamesPerSet). tbTrigger =
  // games do PERDEDOR no TB (= gamesPerSet); vencedor = tbTrigger+1. Ex.: gp6 → final 7-6.
  const tbTrigger = tbEnabled ? (parseInt(_isc.gamesPerSet) || 6) : null;

  // Tiebreak mode: o placar final (gamesPerSet+1, gamesPerSet), ex.: 7-6, implica que o set foi
  // decidido no tie-break. O vencedor já é conhecido por s1/s2; só pedimos os pontos do TB.
  var tbP1 = NaN, tbP2 = NaN;
  var isTiebreakEntry = false;
  if (tbEnabled && window._isTiebreakSetScore(s1, s2, tbTrigger)) {
    var tb1El = document.getElementById('tb1-' + matchId);
    var tb2El = document.getElementById('tb2-' + matchId);
    tbP1 = tb1El ? parseInt(tb1El.value) : NaN;
    tbP2 = tb2El ? parseInt(tb2El.value) : NaN;
    if (isNaN(tbP1) || isNaN(tbP2)) {
      showAlertDialog(_t('result.tbRequired'), _t('result.tbRequiredDetail', {trigger: (tbTrigger + 1) + '-' + tbTrigger}), null, { type: 'warning' });
      return;
    }
    // Tie-break winner must match the set winner (player with more games)
    var setWinnerIsP1 = s1 > s2;
    if ((setWinnerIsP1 && tbP1 <= tbP2) || (!setWinnerIsP1 && tbP2 <= tbP1)) {
      showAlertDialog(_t('result.tbWinnerMismatch'), _t('result.tbWinnerMismatchDetail'), null, { type: 'warning' });
      return;
    }
    isTiebreakEntry = true;
  }

  if (s1 === s2 && !allowDraw) {
    showAlertDialog(_t('result.drawNotAllowed'), '', null, { type: 'warning' });
    return;
  }

  // v0.17.1: aprovação do adversário. Se o user que está lançando o placar
  // está num dos times do match e NÃO é organizador/co-host, o resultado
  // vai pra m.pendingResult em vez de m.winner direto. Time adversário
  // recebe notificação pra aprovar.
  var _curUser = window.AppStore && window.AppStore.currentUser;
  if (_curUser && _resultNeedsApproval(t, m, _curUser)) {
    // TRAVA DE LÓGICA (item 3, incidente 18/jul): quando um lado já lançou (pendingResult
    // não-disputado), o input do OUTRO lado fica travado — o 2º lançamento NÃO sobrescreve a
    // proposta; o adversário confirma/edita/contesta. Antes o lock era só de RENDER, então um
    // 2º _saveResultInline do lado oposto (view stale / mini-card) clobberava o pendingResult.
    // Lado resolvido SÓ por uid (_userTeamInMatch). Mesmo lado (proponente relançando a própria
    // proposta antes do adversário agir) segue permitido. [[project_uid_identity_canon_locked]]
    var _existing = m.pendingResult;
    if (_existing && !_existing.disputed) {
      var _mySide = _userTeamInMatch(t, m, _curUser);
      var _propSide = _existing.proposedBy ? _userTeamInMatch(t, m, { uid: _existing.proposedBy }) : 0;
      if (_mySide > 0 && _propSide > 0 && _mySide !== _propSide) {
        showNotification('Já tem placar pra aprovar', 'O outro time já lançou. Use Confirmar, Editar ou Contestar.', 'info');
        _rerenderBracket(tId, matchId); // restaura o estado travado (Confirmar/Editar/Contestar)
        return;
      }
    }
    var _proposedWinner;
    var _proposedDraw = false;
    if (s1 === s2 && allowDraw) {
      _proposedWinner = 'draw';
      _proposedDraw = true;
    } else {
      _proposedWinner = s1 > s2 ? m.p1 : m.p2;
    }
    var _pendingPayload = {
      kind: 'inline',
      proposedBy: _curUser.uid || null,
      proposedByEmail: _curUser.email || null,
      proposedByName: _curUser.displayName || _curUser.email || 'Jogador',
      proposedAt: Date.now(),
      winner: _proposedWinner,
      draw: _proposedDraw,
      scoreP1: s1,
      scoreP2: s2,
      useSets: !!useSets,
      isFixedSet: !!isFixedSet,
      isTiebreakEntry: !!isTiebreakEntry,
      tbP1: isTiebreakEntry ? tbP1 : null,
      tbP2: isTiebreakEntry ? tbP2 : null
    };
    if (useSets) {
      var _setData = { gamesP1: s1, gamesP2: s2 };
      if (isFixedSet) _setData.fixedSet = true;
      if (isTiebreakEntry) _setData.tiebreak = { pointsP1: tbP1, pointsP2: tbP2 };
      _pendingPayload.sets = [_setData];
      _pendingPayload.setsWonP1 = s1 > s2 ? 1 : 0;
      _pendingPayload.setsWonP2 = s2 > s1 ? 1 : 0;
    }
    m.pendingResult = _pendingPayload;
    _propagateMatchUpdate(t, m);
    var _pendingLogMsg = 'Resultado proposto: ' + m.p1 + ' ' + s1 + ' × ' + s2 + ' ' + m.p2 + ' — aguardando aprovação (' + _pendingPayload.proposedByName + ')';
    window.AppStore.logAction(tId, _pendingLogMsg);
    // BLINDAGEM: persiste a proposta ATOMICAMENTE (re-aplica pendingResult no
    // match fresco + histórico), em vez de syncImmediate do doc inteiro. project_concurrency_safe_saves.
    window.AppStore.commitTournamentTx(tId, function (freshT) {
      var fm = window._findMatch(freshT, matchId);
      if (fm) {
        fm.pendingResult = _pendingPayload;
        if (typeof window._propagateMatchUpdate === 'function') window._propagateMatchUpdate(freshT, fm);
      }
      if (!Array.isArray(freshT.history)) freshT.history = [];
      freshT.history.push({ date: new Date().toISOString(), message: _pendingLogMsg });
    });
    // 4.1 DUAL-WRITE: espelha a proposta inicial (pendingResult) no doc do jogo.
    _dualWriteResult(tId, matchId);
    try { _notifyPendingApproval(t, m, _pendingPayload.proposedByName); } catch (e) { window._error('[pendingApproval] notify failed', e); }
    showNotification('⏳ Resultado enviado', 'Aguardando aprovação do time adversário ou do organizador.', 'success');
    _rerenderBracket(tId, matchId);
    return;
  }

  if (useSets) {
    // Store as a single set for GSM compatibility
    var setData = { gamesP1: s1, gamesP2: s2 };
    if (isFixedSet) setData.fixedSet = true;
    if (isTiebreakEntry) {
      setData.tiebreak = { pointsP1: tbP1, pointsP2: tbP2 };
    }
    m.sets = [setData];
    m.setsWonP1 = s1 > s2 ? 1 : 0;
    m.setsWonP2 = s2 > s1 ? 1 : 0;
    if (isFixedSet) m.fixedSet = true;
    m.scoreP1 = s1;
    m.scoreP2 = s2;
    m.totalGamesP1 = s1;
    m.totalGamesP2 = s2;
  } else {
    m.scoreP1 = s1;
    m.scoreP2 = s2;
  }

  if (s1 === s2 && allowDraw) {
    // Empate — ambos ganham 1 ponto (tratado na standings)
    m.winner = 'draw';
    m.draw = true;
  } else {
    m.winner = s1 > s2 ? m.p1 : m.p2;
    m.draw = false;
  }
  // v2.3.17: lançamento direto — marca fim; início = agora se não havia (sem
  // placar ao vivo não temos o 1º ponto, então é o melhor proxy disponível).
  m.resultAt = Date.now();
  if (!m.startedAt) m.startedAt = m.resultAt;
  // Se havia um pendingResult (proposta anterior) — agora foi finalizado
  // pelo organizador OU pelo adversário, libera o slot.
  if (m.pendingResult) delete m.pendingResult;

  // Som: resultado lançado/confirmado fora do placar ao vivo → fanfarra "Set".
  // (o caminho de proposta que precisa de aprovação já retornou acima.)
  if (window._sound) window._sound('set');

  // v2.3.46: quando true, o save NÃO re-renderiza o bracket inteiro — só
  // atualiza o card lançado in-place. Mantém a página estática (sem pulo de
  // scroll, sem colapsar "Demais jogos", sem mexer na classificação) enquanto
  // a rodada não está completa.
  var _inPlaceFinalize = false;
  // v4.0.102: quando a ÚLTIMA rodada completa (o auto-close vai transicionar Suíço→elim
  // ou encerrar), NÃO emitir o save intermediário deste result-save — ele grava o estado
  // Suíço (rodada 'active') e, como saveTournament é merge:true assíncrono, pode COMMITAR
  // DEPOIS do save da transição (via rede), sobrescrevendo currentStage/rounds/matches e
  // deixando as quartas vazias. A transição (_doCloseRound → generateDrawFunction) é o
  // save autoritativo (preserva os resultados em swissStandings/swissRoundsData).
  var _deferSaveToTransition = false;

  if (!isGroupMatch && !isRoundMatch) {
    // Eliminatórias — vencedor avança
    _advanceWinner(t, m);
    // Som: se este resultado encerrou a eliminatória → campeão coroado (segue o
    // "Set" que já tocou acima). Salvar num torneio já encerrado não ocorre, então
    // status 'finished' aqui = acabou de encerrar.
    if (t.status === 'finished' && window._sound) window._sound('campeao');
    showNotification(_t('result.saved'), `${m.winner} avança!`, 'success');
  } else if (isRoundMatch) {
    // Liga/Suíço/Ranking — atualizar standings
    showNotification(_t('result.saved'), m.draw ? _t('bui.draw') : _t('bui.matchWon', {winner: m.winner}), 'success');

    // Auto-close round + auto-advance to next round when all matches complete
    // (avoids requiring organizer to manually click "Encerrar Rodada")
    var _roundIdxAuto = -1;
    (t.rounds || []).forEach(function(r, idx) {
      (r.matches || []).forEach(function(rm) { if (rm.id === matchId) _roundIdxAuto = idx; });
    });
    if (_roundIdxAuto >= 0) {
      var _thisRound = t.rounds[_roundIdxAuto];
      var _thisComplete = (_thisRound.matches || []).every(function(rm) { return !!rm.winner; });
      var _isLast = _roundIdxAuto === (t.rounds.length - 1);
      if (_thisComplete && _isLast && _thisRound.status !== 'complete') {
        // Defer to close-round logic so Swiss/Liga dispatch & elim-transition run uniformly.
        // v4.0.102: o save deste result-save é PULADO (ver _deferSaveToTransition) — o
        // _closeRound faz o save autoritativo; evita a corrida que zerava as quartas.
        _deferSaveToTransition = true;
        // v0.17.27: passa matchId pra preservar scroll no re-render disparado por _doCloseRound.
        // BLINDAGEM (save #2): passa o resultCtx (matchId + payload) pra que a transação de
        // fecho RE-APLIQUE o resultado deste último jogo sobre o estado fresco — ele foi
        // DEFERIDO (não persistido por commitResultTx aqui), então sem isso o fresco não
        // teria o vencedor e a rodada pareceria incompleta. project_concurrency_safe_saves.
        var _closeResultCtx = { matchId: matchId, payload: {
          s1: s1, s2: s2, useSets: useSets, isFixedSet: isFixedSet,
          isTiebreakEntry: isTiebreakEntry, tbP1: tbP1, tbP2: tbP2
        } };
        setTimeout(function() {
          if (typeof window._closeRound === 'function') {
            window._closeRound(tId, _roundIdxAuto, matchId, _closeResultCtx);
          }
        }, 0);
      } else if (!_thisComplete) {
        // v2.3.85: a CLASSIFICAÇÃO precisa recalcular a CADA placar lançado
        // (pedido do usuário: "lançou um resultado já calcula e mostra os
        // valores"). Antes (v2.3.46) a tabela ficava congelada até a rodada
        // completar. Agora deixamos cair no rerender completo (_rerenderBracket),
        // que recomputa _computeStandings — e ele preserva scroll (âncora no
        // card) + estado dos <details> ("Demais jogos"), então a página não
        // "pula" nem colapsa as seções abertas.
        _inPlaceFinalize = false;
      }
      // _thisComplete && !_isLast → cai no rerender completo no fim (classificação
      // sobe + próxima rodada gerada), comportamento preservado.
    }
  } else {
    // Check if current group round is complete, activate next
    _checkGroupRoundComplete(t, m.group);
    showNotification(_t('result.saved'), m.draw ? _t('bui.draw') : _t('bui.matchWon', {winner: m.winner}), 'success');
  }

  // Auto check-in: marcar presença de todos os participantes deste jogo (e limpar ausência se existia)
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  [m.p1, m.p2].forEach(side => {
    if (!side || side === 'TBD' || side === 'BYE') return;
    const _names = side.includes(' / ') ? side.split(' / ').map(n => n.trim()).filter(Boolean) : [side];
    _names.forEach(nm => {
      // uid-first: resolve o nome do membro pro uid; nome só fallback.
      // Lançar resultado MARCA presença (quem jogou está presente) — CORRETO (dono
      // reafirmou 1-jul). O que NÃO pode é o SORTEIO marcar presença: o sorteio LIMPA
      // checkedIn/absent (ver _commitInitialDraw / _clearDrawRuntimeFlags).
      if (!window._idMapHas(t, t.checkedIn, nm)) window._idMapSet(t, t.checkedIn, nm, Date.now());
      window._idMapDel(t, t.absent, nm);
    });
  });
  if (!t.tournamentStarted) t.tournamentStarted = Date.now();

  // v0.16.87: CAUSA-RAIZ do "resultado em monarch Liga não persiste". Após
  // Firestore deserialização (onSnapshot dispara em todo save), as refs
  // entre `t.rounds[idx].matches[k]` e
  // `t.rounds[idx].monarchGroups[gi].matches[mi]` ficam SEPARADAS — antes
  // eram o mesmo object (criado uma vez em _generateReiRainhaRoundForPlayers
  // e referenciado nos dois lugares), mas JSON serialize/deserialize não
  // preserva identity de referência, só valores. _findMatch retorna a ref
  // de .matches, mutamos winner ali, mas o renderer (renderStandings →
  // currentRoundData.monarchGroups[gi].matches[mi]) lê da OUTRA ref que
  // ainda não foi mutada → showInputs=true → botão volta pra "Confirmar"
  // verde. Fix: após mutação, propagar os mesmos valores pra qualquer ref
  // do mesmo match (por id) em monarchGroups e t.rodadas legacy.
  // v2.3.46: no caminho in-place, suprime o soft-refresh ANTES do syncImmediate
  // pra que o echo do onSnapshot (nosso próprio save) não dispare initRouter()
  // e desmonte o layout estático (colapsando "Demais jogos" + recomputando a
  // classificação). Reset após 3s, igual ao _rerenderBracket.
  if (_inPlaceFinalize) {
    window._suppressSoftRefresh = true;
    clearTimeout(window._pendingSoftRefresh);
  }

  _propagateMatchUpdate(t, m);
  var _resultLogMsg = `Resultado: ${m.p1} ${s1} × ${s2} ${m.p2}${m.draw ? ' — Empate' : ' — Vencedor: ' + m.winner}`;
  window.AppStore.logAction(tId, _resultLogMsg);
  // v4.0.102: pula o save intermediário quando a transição da última rodada vai gravar
  // o estado autoritativo (evita a corrida de merge que zerava as quartas do Suíço→elim).
  // BLINDAGEM: persiste o resultado ATOMICAMENTE (transação, re-aplica em dado fresco)
  // em vez de syncImmediate (merge do doc inteiro, sujeito a lost-update quando 2
  // lançamentos concorrem). A `t` local já foi mutada acima (UI otimista); commitResultTx
  // re-aplica a MESMA mutação sobre o estado fresco + persiste a entrada de histórico.
  // project_concurrency_safe_saves.
  if (!_deferSaveToTransition) {
    window.AppStore.commitResultTx(tId, matchId, {
      s1: s1, s2: s2, useSets: useSets, isFixedSet: isFixedSet,
      isTiebreakEntry: isTiebreakEntry, tbP1: tbP1, tbP2: tbP2
    }, _resultLogMsg);
  }

  // Persist a per-user matchHistory record so the player's Estatísticas
  // Detalhadas survive tournament deletion. Inline scoring has no pointLog,
  // so we derive minimal stats (games/points/sets) from s1/s2 directly.
  try { _persistInlineTournamentMatchRecord(t, m, s1, s2, tbP1, tbP2, isTiebreakEntry, useSets); } catch(e) {}

  // Trophy hook — resultado de partida de torneio
  try {
    if (typeof window._trophyOnTournamentMatchResult === 'function') {
      window._trophyOnTournamentMatchResult({ matchId: matchId, winner: m.winner, draw: m.draw, tournamentId: tId });
    }
  } catch(_te) {}

  // Notify match participants about the result
  if (typeof window._sendUserNotification === 'function') {
    var _resultText = m.draw
      ? (m.p1 + ' ' + s1 + ' × ' + s2 + ' ' + m.p2 + ' — ' + _t('bui.drawResult'))
      : (m.p1 + ' ' + s1 + ' × ' + s2 + ' ' + m.p2 + ' — ' + _t('bui.matchWon', {winner: m.winner}));
    var _notifData = {
      type: 'result',
      title: _t('bui.resultRegistered'),
      message: _resultText,
      tournamentId: tId,
      tournamentName: t.name,
      level: 'fundamental',
      timestamp: Date.now()
    };
    // Find UIDs for both players and send notifications
    var _parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    [m.p1, m.p2].forEach(function(playerName) {
      if (!playerName || playerName === 'TBD' || playerName === 'BYE') return;
      var _found = _parts.find(function(p) {
        var pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
        return pName === playerName;
      });
      if (_found && typeof _found === 'object' && _found.uid) {
        window._sendUserNotification(_found.uid, _notifData);
      }
    });
  }

  // v2.3.46: rodada incompleta em formato por rodada → atualiza só o card
  // lançado (página estática). Se a finalização in-place falhar (card fora do
  // DOM, etc.), cai no rerender completo. Rodada completa / eliminatórias /
  // grupos seguem no rerender completo (classificação sobe, próxima rodada).
  if (_inPlaceFinalize && _finalizeRoundCardInPlace(t, m, tId, matchId)) {
    setTimeout(function() { window._suppressSoftRefresh = false; }, 3000);
  } else {
    window._suppressSoftRefresh = false;
    _rerenderBracket(tId, matchId);
  }
};

// v0.17.1: aprovar resultado pendente. Disponível pra: (a) qualquer membro
// do time adversário (uid bate com participante daquele lado); (b)
// organizador/co-host. Usuário que propôs não pode aprovar a própria
// proposta (UI esconde o botão pra ele).
// ── Helpers compartilhados do consenso (placar + W.O.), extraídos v4.0.121 ──────
// _isOpposingProposer: o usuário atual está no time ADVERSÁRIO ao proponente do
// pendingResult? (usado por aprovar/contestar).
function _isOpposingProposer(t, m, cu) {
  if (!cu || !m || !m.pendingResult) return false;
  var pr = m.pendingResult;
  var proposerSide = (pr.proposedBy || pr.proposedByEmail) ? _userTeamInMatch(t, m, { uid: pr.proposedBy, email: pr.proposedByEmail }) : 0;
  var userSide = _userTeamInMatch(t, m, cu);
  return userSide > 0 && userSide !== proposerSide;
}
// _notifyOrgAndCoHosts: notifica o organizador (uid, ou resolvido por email/participante)
// + co-organizadores ativos, com dedup. Escalação de disputa (placar e, futuramente, W.O.).
function _notifyOrgAndCoHosts(t, notifData) {
  if (typeof window._sendUserNotification !== 'function') return;
  var seen = {};
  var orgUid = t.creatorUid;
  if (orgUid) { seen[orgUid] = true; window._sendUserNotification(orgUid, notifData); }
  else {
    var orgEmail = t.organizerEmail || t.creatorEmail;
    var parts = Array.isArray(t.participants) ? t.participants : [];
    var orgPart = parts.find(function(p){ return typeof p === 'object' && ((t.creatorUid && p.uid === t.creatorUid) || (orgEmail && p.email === orgEmail)); });
    if (orgPart && orgPart.uid) { seen[orgPart.uid] = true; window._sendUserNotification(orgPart.uid, notifData); }
  }
  if (Array.isArray(t.coHosts)) {
    t.coHosts.forEach(function(ch){ if (ch && ch.status === 'active' && ch.uid && !seen[ch.uid]) { seen[ch.uid] = true; window._sendUserNotification(ch.uid, notifData); } });
  }
}
// Exposto no window pra reuso cross-file: o consenso de W.O. (wo-claim.js) escala a
// disputa pelo MESMO helper, incluindo co-hosts (paridade com o placar).
window._notifyOrgAndCoHosts = _notifyOrgAndCoHosts;

// Mutação PURA de aplicar um resultado APROVADO (pending → final) sobre o `t`
// passado: aplica scores/sets/winner, auto check-in, delete pendingResult, e o
// advance/checkGroupComplete conforme o contexto. Sem save. Retorna o contexto
// (kind, deferred, roundIdx, s1/s2, winner) pro chamador decidir toast/defer/save.
// Extraída de _approveResult na blindagem (v4.0.121).
// 4.1 (project_match_result_docs, inc 3a): espelha o resultado do jogo (já aplicado
// otimista no match LOCAL pelo caller) no doc próprio tournaments/{id}/results/{matchId}.
// Fire-and-forget best-effort — a leitura ainda é autoritativa no doc do torneio, então
// uma falha aqui NUNCA afeta o fluxo (a virada da leitura pro subdoc é a Fase B).
function _dualWriteResult(tId, matchId) {
  try {
    if (window.AppStore && typeof window.AppStore._dualWriteMatchResult === 'function') {
      var _p = window.AppStore._dualWriteMatchResult(tId, matchId);
      if (_p && typeof _p.catch === 'function') _p.catch(function(){});
    }
  } catch (e) {}
}

window._applyApprovedResult = function(t, matchId, pr) {
  var m = _findMatch(t, matchId);
  if (!m) return { ok: false };
  var _pr = pr || m.pendingResult;
  if (!_pr) return { ok: false };
  var s1 = _pr.scoreP1, s2 = _pr.scoreP2;
  if (_pr.useSets && Array.isArray(_pr.sets)) {
    m.sets = _pr.sets.slice();
    m.setsWonP1 = _pr.setsWonP1 || 0;
    m.setsWonP2 = _pr.setsWonP2 || 0;
    if (_pr.isFixedSet) m.fixedSet = true;
    m.scoreP1 = s1; m.scoreP2 = s2;
    m.totalGamesP1 = _pr.totalGamesP1 != null ? _pr.totalGamesP1 : s1;
    m.totalGamesP2 = _pr.totalGamesP2 != null ? _pr.totalGamesP2 : s2;
  } else {
    m.scoreP1 = s1; m.scoreP2 = s2;
  }
  m.winner = _pr.winner;
  m.draw = !!_pr.draw;
  m.resultAt = Date.now(); if (!m.startedAt) m.startedAt = m.resultAt;
  delete m.pendingResult;
  // Auto check-in pros participantes do match
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  [m.p1, m.p2].forEach(function(side) {
    if (!side || side === 'TBD' || side === 'BYE') return;
    var _names = side.indexOf(' / ') !== -1 ? side.split(' / ').map(function(n){ return n.trim(); }).filter(Boolean) : [side];
    _names.forEach(function(nm) {
      // Lançar resultado MARCA presença (quem jogou está presente) — CORRETO (dono
      // reafirmou 1-jul). O que NÃO pode é o SORTEIO marcar presença: o sorteio LIMPA
      // checkedIn/absent (ver _commitInitialDraw / _clearDrawRuntimeFlags).
      if (!window._idMapHas(t, t.checkedIn, nm)) window._idMapSet(t, t.checkedIn, nm, Date.now());
      window._idMapDel(t, t.absent, nm);
    });
  });
  if (!t.tournamentStarted) t.tournamentStarted = Date.now();
  var isGroupMatch = m.group !== undefined;
  var isRoundMatch = m.roundIndex !== undefined || (t.rounds && t.rounds.some(function(r) {
    return (r.matches || []).some(function(rm) { return rm.id === matchId; });
  }));
  var ctx = { ok: true, s1: s1, s2: s2, winner: m.winner, draw: m.draw, kind: 'elim', deferred: false, roundIdx: -1, m: m };
  if (!isGroupMatch && !isRoundMatch) {
    if (typeof window._advanceWinner === 'function') window._advanceWinner(t, m);
    ctx.kind = 'elim';
  } else if (isRoundMatch) {
    ctx.kind = 'round';
    var ri = -1;
    (t.rounds || []).forEach(function(r, idx) { (r.matches || []).forEach(function(rm) { if (rm.id === matchId) ri = idx; }); });
    ctx.roundIdx = ri;
    if (ri >= 0) {
      var _tr = t.rounds[ri];
      var _complete = (_tr.matches || []).every(function(rm) { return !!rm.winner; });
      var _isLast = ri === (t.rounds.length - 1);
      if (_complete && _isLast && _tr.status !== 'complete') ctx.deferred = true;
    }
  } else {
    if (typeof window._checkGroupRoundComplete === 'function') window._checkGroupRoundComplete(t, m.group);
    ctx.kind = 'group';
  }
  if (typeof window._propagateMatchUpdate === 'function') window._propagateMatchUpdate(t, m);
  return ctx;
};

window._approveResult = function(tId, matchId) {
  var t = window._findTournamentById(tId);
  if (!t) return;
  var m = _findMatch(t, matchId);
  if (!m || !m.pendingResult) {
    showNotification('Sem proposta ativa', 'Esse jogo não tem resultado pendente.', 'warning');
    return;
  }
  var pr = m.pendingResult;
  var cu = window.AppStore && window.AppStore.currentUser;
  // Permission: org OR opposing team member
  var canApprove = !!(cu && (_isUserOrgOrCoHost(t, cu) || _isOpposingProposer(t, m, cu)));
  if (!canApprove) {
    showNotification('Sem permissão', 'Só o time adversário ou o organizador pode aprovar.', 'warning');
    return;
  }

  // Aplica pending → final no LOCAL (UI otimista) via a mutação pura.
  var _ctx = window._applyApprovedResult(t, matchId, pr);
  if (!_ctx.ok) { showNotification('Sem proposta ativa', '', 'warning'); return; }
  var s1 = _ctx.s1, s2 = _ctx.s2;
  // Toast por contexto
  if (_ctx.kind === 'elim') showNotification('✅ Resultado aprovado', m.winner + ' avança!', 'success');
  else showNotification('✅ Resultado aprovado', _ctx.draw ? _t('bui.draw') : _t('bui.matchWon', {winner: _ctx.winner}), 'success');
  // Som: resultado confirmado fora do placar ao vivo → fanfarra do "Set".
  if (window._sound) window._sound('set');

  var _logMsg = 'Resultado aprovado: ' + m.p1 + ' ' + s1 + ' × ' + s2 + ' ' + m.p2 + (m.draw ? ' — Empate' : ' — Vencedor: ' + m.winner);
  window.AppStore.logAction(tId, _logMsg);
  if (_ctx.deferred) {
    // BLINDAGEM (save #2): fecho da última rodada deferido pro _closeRound (transação
    // atômica) — NÃO persiste aqui (senão grava a rodada ainda-aberta e sobrescreve o
    // fecho pela rede). resultCtx re-aplica o resultado aprovado sobre o fresco.
    var _approveResultCtx = { matchId: matchId, payload: {
      s1: s1, s2: s2, useSets: !!pr.useSets, isFixedSet: !!pr.isFixedSet,
      isTiebreakEntry: !!pr.isTiebreakEntry, tbP1: pr.tbP1, tbP2: pr.tbP2
    } };
    setTimeout(function() {
      if (typeof window._closeRound === 'function') window._closeRound(tId, _ctx.roundIdx, matchId, _approveResultCtx);
    }, 0);
  } else {
    // BLINDAGEM (v4.0.121): persiste ATÔMICO pelo portão — re-aplica a aprovação
    // (via a mesma mutação pura, com o `pr` capturado) sobre o doc fresco.
    window.AppStore.commitTournamentTx(tId, function (ft) {
      window._applyApprovedResult(ft, matchId, pr);
      if (!Array.isArray(ft.history)) ft.history = [];
      ft.history.push({ date: new Date().toISOString(), message: _logMsg });
    });
  }
  // 4.1 DUAL-WRITE (project_match_result_docs, inc 3a): espelha o resultado aprovado
  // (já aplicado otimista no `m` local por _applyApprovedResult) no doc do jogo.
  // Best-effort — nunca derruba o save principal.
  _dualWriteResult(tId, matchId);

  // Notifica participantes do match (proposer + opposing team)
  // Bug 5 fix: choose persist function based on how the result was entered
  try {
    if (pr.kind === 'gsm' && typeof _persistGSMTournamentMatchRecord === 'function') {
      _persistGSMTournamentMatchRecord(t, m);
    } else {
      _persistInlineTournamentMatchRecord(t, m, s1, s2, pr.tbP1, pr.tbP2, !!pr.isTiebreakEntry, !!pr.useSets);
    }
  } catch(e) {}
  if (typeof window._sendUserNotification === 'function') {
    var resultText = m.p1 + ' ' + s1 + ' × ' + s2 + ' ' + m.p2 + ' — ' + (m.draw ? _t('bui.drawResult') : _t('bui.matchWon', {winner: m.winner}));
    var notifData = {
      type: 'result',
      title: '✅ Resultado confirmado',
      message: resultText,
      tournamentId: tId,
      tournamentName: t.name,
      level: 'fundamental',
      timestamp: Date.now()
    };
    // Notifica os dois lados — SÓ pelos UIDs do slot (nunca casando nome). [[project_uid_identity_canon_locked]]
    var _su = (typeof window._slotUids === 'function') ? window._slotUids : function () { return []; };
    var notifSeen = {};
    _su(m, 'p1').concat(_su(m, 'p2')).forEach(function(u) {
      if (u && !notifSeen[u]) { notifSeen[u] = true; window._sendUserNotification(u, notifData); }
    });
  }

  _rerenderBracket(tId, matchId);
};


// _contestResult: time adversário discorda do placar proposto e escala ao
// organizador. Marca m.pendingResult.disputed=true e notifica o organizador
// para apurar e lançar o resultado definitivo (ou desclassificar uma dupla).
window._contestResult = function(tId, matchId) {
  var t = window._findTournamentById(tId);
  if (!t) return;
  var m = _findMatch(t, matchId);
  if (!m || !m.pendingResult) {
    showNotification('Sem proposta ativa', 'Esse jogo não tem resultado pendente.', 'warning');
    return;
  }
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu) { showNotification('Login necessário', '', 'warning'); return; }

  var pr = m.pendingResult;
  if (!_isOpposingProposer(t, m, cu)) {
    showNotification('Sem permissão', 'Só o time adversário pode contestar.', 'warning');
    return;
  }

  showConfirmDialog(
    '❌ Contestar resultado',
    'O organizador será notificado para apurar e lançar o resultado definitivo. Confirma a contestação?',
    function() {
      // Som: placar não aprovado (contestado) → "dois pra baixo".
      if (window._sound) window._sound('rejeicao');
      var _disputedByName = cu.displayName || cu.email || 'Jogador';
      // BLINDAGEM (v4.0.121): marca a disputa ATÔMICO pelo portão (local + fresco).
      window.AppStore.mutate(tId, function (ft) {
        var fm = _findMatch(ft, matchId);
        if (!fm || !fm.pendingResult) return;
        fm.pendingResult.disputed = true;
        fm.pendingResult.disputedBy = cu.uid || null;
        fm.pendingResult.disputedByName = _disputedByName;
        fm.pendingResult.disputedAt = Date.now();
        if (typeof window._propagateMatchUpdate === 'function') window._propagateMatchUpdate(ft, fm);
      }, 'Resultado contestado por ' + (cu.displayName || cu.email) + ': ' + m.p1 + ' vs ' + m.p2);
      // 4.1 DUAL-WRITE: espelha a disputa (pendingResult.disputed) no doc do jogo.
      _dualWriteResult(tId, matchId);

      var scoreText = (pr.scoreP1 != null ? pr.scoreP1 : '?') + ' × ' + (pr.scoreP2 != null ? pr.scoreP2 : '?');
      _notifyOrgAndCoHosts(t, {
        type: 'match-disputed',
        title: '🚨 Resultado em disputa',
        message: m.p1 + ' vs ' + m.p2 + ' — placar ' + scoreText + ' contestado por ' + _disputedByName + '. Intervenha para resolver.',
        tournamentId: t.id, tournamentName: t.name, matchId: m.id, level: 'fundamental', timestamp: Date.now()
      });
      showNotification('❌ Contestação enviada', 'O organizador foi notificado para resolver o resultado.', 'success');
      _rerenderBracket(tId, matchId);
    }
  );
};

// Helper: notifica todos os UIDs individuais dos participantes de um match
// (p1Uid + p2Uid de duplas, via _participantUids). Usado por organizador na
// resolução de disputas (Fase 4) e refazer partida.
function _notifyMatchParticipants(t, m, notifData) {
  if (typeof window._sendUserNotification !== 'function') return;
  var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  var _allUids = typeof window._participantUids === 'function' ? window._participantUids : function(p) { return p && p.uid ? [p.uid] : []; };
  var seen = {};
  [m.p1, m.p2].forEach(function(side) {
    if (!side || side === 'TBD' || side === 'BYE') return;
    var p = parts.find(function(pp) {
      return typeof pp === 'object' && (pp.displayName || pp.name || '') === side;
    });
    _allUids(p).forEach(function(u) {
      if (u && !seen[u]) { seen[u] = true; window._sendUserNotification(u, notifData); }
    });
  });
}

// Fase 4 — Resolução do organizador: REFAZER partida.
// O organizador zera o placar (volta a 0×0 / sem resultado) para que a
// partida seja jogada novamente. Limpa pendingResult + disputed. Notifica
// todos os participantes individuais. Só autoridade (org/co-host) pode.
window._organizerResetMatch = function(tId, matchId) {
  var t = window._findTournamentById(tId);
  if (!t) return;
  var m = _findMatch(t, matchId);
  if (!m) { showNotification('Jogo não encontrado', '', 'warning'); return; }
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu) { showNotification('Login necessário', '', 'warning'); return; }
  if (!_isUserAuthority(t, cu)) {
    showNotification('Sem permissão', 'Só o organizador pode refazer a partida.', 'warning');
    return;
  }
  showConfirmDialog(
    '🔄 Refazer partida',
    'Você está atuando como ORGANIZADOR. O placar voltará para 0×0 e a partida deverá ser jogada novamente. Os participantes serão notificados. Confirma?',
    function() {
      // BLINDAGEM (v4.0.121): zera o resultado/proposta/disputa ATÔMICO pelo portão.
      window.AppStore.mutate(tId, function (ft) {
        var fm = _findMatch(ft, matchId);
        if (!fm) return;
        delete fm.pendingResult; delete fm.winner; delete fm.draw;
        delete fm.scoreP1; delete fm.scoreP2;
        delete fm.sets; delete fm.setsWonP1; delete fm.setsWonP2;
        delete fm.totalGamesP1; delete fm.totalGamesP2;
        delete fm.fixedSet;
        if (typeof window._propagateMatchUpdate === 'function') window._propagateMatchUpdate(ft, fm);
      }, 'Organizador refez a partida (placar zerado): ' + m.p1 + ' vs ' + m.p2);
      // 4.1 DUAL-WRITE: o match local foi ZERADO → o espelho completo REMOVE os
      // campos de resultado do doc do jogo (senão o subdoc guardaria o placar velho).
      _dualWriteResult(tId, matchId);

      _notifyMatchParticipants(t, m, {
        type: 'match-reset',
        title: '🔄 Partida reaberta pelo organizador',
        message: m.p1 + ' vs ' + m.p2 + ' — o organizador zerou o placar. A partida deve ser jogada novamente.',
        tournamentId: t.id,
        tournamentName: t.name,
        matchId: m.id,
        level: 'fundamental',
        timestamp: Date.now()
      });

      showNotification('🔄 Partida reaberta', 'O placar foi zerado. A partida deve ser jogada novamente.', 'success');
      _rerenderBracket(tId, matchId);
    }
  );
};

// Reverter / desfazer um W.O. de partida de torneio.
// Aplica-se SÓ quando a partida foi decidida por W.O. de TIME (m.wo === true) —
// isto é, o adversário venceu por ausência sem substituto disponível. (W.O. com
// substituição da lista de espera é revertido pelo botão "Reverter" do painel
// de Lista de Espera, via _markAbsent.) Esta função:
//  1. Desfaz o avanço do vencedor (próximo jogo) e do perdedor (chave inferior).
//  2. Limpa a classificação progressiva dos dois lados.
//  3. Zera o resultado e a flag m.wo → partida volta a 0×0 (jogável de novo).
//  4. Remove os jogadores do estado de ausência (t.absent) e do histórico de
//     W.O. (t.woHistory) — voltam a ficar disponíveis.
//  5. Recalcula a classificação (Liga/Suíço) e reabre o torneio se estava
//     encerrado por esse jogo.
// Só autoridade (organizador/co-host) pode reverter.
window._revertWO = function(tId, matchId) {
  var t = window._findTournamentById(tId);
  if (!t) return;
  var m = _findMatch(t, matchId);
  if (!m) { showNotification('Jogo não encontrado', '', 'warning'); return; }
  if (!m.wo) { showNotification('Não é um W.O.', 'Esta partida não foi decidida por W.O.', 'warning'); return; }
  // Trava: depois que o jogo foi jogado de verdade (placar lançado, sets, placar
  // ao vivo aberto/usado, jogo iniciado), o W.O. não pode mais ser revertido.
  if (typeof window._matchHasRealPlay === 'function' && window._matchHasRealPlay(m)) {
    showNotification('W.O. não pode ser revertido', 'A partida já foi jogada (placar lançado ou placar ao vivo iniciado). O W.O. não é mais reversível.', 'warning');
    return;
  }
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu) { showNotification('Login necessário', '', 'warning'); return; }
  if (typeof _isUserAuthority === 'function' && !_isUserAuthority(t, cu)) {
    showNotification('Sem permissão', 'Só o organizador pode reverter um W.O.', 'warning');
    return;
  }
  showConfirmDialog(
    '↩️ Reverter W.O.',
    'O W.O. de "' + m.p1 + ' vs ' + m.p2 + '" será desfeito. O placar volta a 0×0, o avanço do vencedor é cancelado e os jogadores marcados como ausentes voltam a ficar disponíveis. A partida deverá ser jogada novamente. Confirma?',
    function() {
      var prevWinner = m.winner;
      var oldLoser = m.winner === m.p1 ? m.p2 : m.p1;

      // 1. Desfaz avanço do vencedor (próximo jogo) — só se ainda não decidido.
      if (m.nextMatchId) {
        var next = _findMatch(t, m.nextMatchId);
        if (next && !next.winner) {
          if (next.p1 === prevWinner) { next.p1 = 'TBD'; delete next.p1FromBye; }
          if (next.p2 === prevWinner) { next.p2 = 'TBD'; delete next.p2FromBye; }
        }
      }
      // 2. Desfaz avanço do perdedor (chave inferior, Dupla Eliminatória).
      if (m.loserMatchId) {
        var lm = _findMatch(t, m.loserMatchId);
        if (lm && !lm.winner) {
          if (lm.p1 === oldLoser) lm.p1 = 'TBD';
          if (lm.p2 === oldLoser) lm.p2 = 'TBD';
        }
      }
      // 3. Limpa classificação progressiva dos dois lados.
      if (t.classification) {
        delete t.classification[prevWinner];
        delete t.classification[oldLoser];
      }

      // 4. Zera o resultado + flag W.O. → partida volta a indecisa (jogável).
      delete m.wo;
      delete m.woAbsentSide;
      m.winner = null;
      m.draw = undefined;
      m.scoreP1 = undefined; m.scoreP2 = undefined;
      m.sets = undefined; m.setsWonP1 = undefined; m.setsWonP2 = undefined;
      m.totalGamesP1 = undefined; m.totalGamesP2 = undefined;
      m.fixedSet = undefined;
      delete m.pendingResult;

      // 5. Remove ausência + histórico de W.O. dos jogadores deste jogo (ambos
      //    os lados, desmembrando duplas). Voltam a ficar disponíveis.
      var _clearAbsenceFor = function(side) {
        if (!side || side === 'TBD' || side === 'BYE') return;
        var members = side.indexOf(' / ') !== -1 ? side.split(' / ')
          : (side.indexOf('/') !== -1 ? side.split('/') : [side]);
        members.forEach(function(n) {
          var nm = (n || '').trim();
          if (!nm) return;
          window._idMapDel(t, t.absent, nm);
          window._woHistDel(t, nm); // uid-key + nome legado
        });
      };
      _clearAbsenceFor(m.p1);
      _clearAbsenceFor(m.p2);

      // 6. Liga/Suíço: reabre a rodada e recalcula a classificação.
      if (m.roundIndex !== undefined && Array.isArray(t.rounds) && t.rounds[m.roundIndex]) {
        t.rounds[m.roundIndex].status = 'active';
      }
      if (typeof window._computeStandings === 'function' && Array.isArray(t.rounds) && t.rounds.length) {
        try { t.standings = window._computeStandings(t); } catch (_e) {}
      }
      // Reabre o torneio se este jogo o havia encerrado.
      if (t.status === 'finished') {
        t.status = 'active';
        delete t.finishedAt;
      }

      _propagateMatchUpdate(t, m);
      window.AppStore.logAction(tId, 'W.O. revertido: ' + m.p1 + ' vs ' + m.p2 + ' (vitória por W.O. de ' + prevWinner + ' desfeita) — partida reaberta');
      window.AppStore.syncImmediate(tId);

      if (typeof _notifyMatchParticipants === 'function') {
        _notifyMatchParticipants(t, m, {
          type: 'match-reset',
          title: '↩️ W.O. revertido pelo organizador',
          message: m.p1 + ' vs ' + m.p2 + ' — o organizador desfez o W.O. A partida está reaberta e deve ser jogada.',
          tournamentId: t.id,
          tournamentName: t.name,
          matchId: m.id,
          level: 'fundamental',
          timestamp: Date.now()
        });
      }

      showNotification('↩️ W.O. revertido', 'A partida foi reaberta (0×0). Os jogadores voltam a ficar disponíveis.', 'success');
      _rerenderBracket(tId, matchId);
    },
    null,
    { type: 'warning', confirmText: 'Reverter W.O.', cancelText: 'Cancelar' }
  );
};

// Editar resultado pendente: modifica o card IN-PLACE sem re-renderizar.
// Substitui os spans de placar por inputs pré-preenchidos e troca os botões
// por Cancelar + Propor. Ao propor, cria novo pendingResult e notifica o
// time original (que propôs primeiro) para aprovar ou contestar.
window._editPendingResult = function(tId, matchId) {
  var t = window.AppStore && window._findTournamentById(tId);
  if (!t) return;
  var m = _findMatch(t, matchId);
  if (!m) {
    var allM = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (t.matches || []);
    if (!matchId && allM.length === 1) m = allM[0];
    if (!m) return;
  }
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu) return;

  var pr = m.pendingResult;
  var userSide = _userTeamInMatch(t, m, cu);
  var proposerSide = pr && (pr.proposedBy || pr.proposedByEmail)
    ? _userTeamInMatch(t, m, { uid: pr.proposedBy, email: pr.proposedByEmail }) : 0;
  var isProposerSelf = !!(pr && ((cu.uid && pr.proposedBy === cu.uid) || (cu.email && pr.proposedByEmail === cu.email)));
  var canEdit = _isUserAuthority(t, cu) || isProposerSelf || (userSide > 0 && userSide !== proposerSide);
  if (!canEdit) { showNotification('Sem permissão', 'Você não pode editar este resultado.', 'warning'); return; }

  // Valores do pendingResult para pré-preencher
  var s1 = pr && pr.scoreP1 != null ? pr.scoreP1 : 0;
  var s2 = pr && pr.scoreP2 != null ? pr.scoreP2 : 0;

  // Modifica o card IN-PLACE: substitui spans de placar por inputs
  var inputStyle = 'width:52px;text-align:center;font-size:0.95rem;font-weight:700;' +
    'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);' +
    'color:var(--text-bright);border-radius:6px;padding:4px 6px;';
  var sp1 = document.getElementById('score-p1-' + matchId);
  var sp2 = document.getElementById('score-p2-' + matchId);
  if (!sp1 || !sp2) {
    // Elementos não encontrados no DOM atual — navega para o bracket sem loop
    window.location.hash = '#bracket/' + tId;
    return;
  }
  // Suprime re-renders enquanto o usuário edita (evita dashboard destruir os inputs)
  window._suppressSoftRefresh = true;
  sp1.innerHTML = '<input id="s1-' + matchId + '" type="number" min="0" value="' + s1 + '" onclick="event.stopPropagation()" style="' + inputStyle + '">';
  sp2.innerHTML = '<input id="s2-' + matchId + '" type="number" min="0" value="' + s2 + '" onclick="event.stopPropagation()" style="' + inputStyle + '">';

  // Troca botões do header por Cancelar + Confirmar
  var headerBtnArea = document.getElementById('header-btns-' + matchId);
  if (headerBtnArea) {
    headerBtnArea.innerHTML =
      '<button id="cancel-pending-edit-' + matchId + '" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#f87171;border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;">✕ Cancelar</button>' +
      '<button id="confirm-pending-edit-' + matchId + '" style="background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.5);color:#4ade80;border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;margin-left:4px;">✅ Confirmar</button>';
  }
  // v1.9.89: enquanto edita, esconde os botões do banner (Editar/Confirmar) —
  // só ficam o Cancelar/Confirmar do header. O re-render (cancelar/confirmar)
  // restaura o banner. Pedido: "enquanto estiver editando deve ficar apenas o
  // cancelar e confirmar".
  var _bannerBtns = document.getElementById('pending-banner-btns-' + matchId);
  if (_bannerBtns) _bannerBtns.style.display = 'none';

  var cancelBtn = document.getElementById('cancel-pending-edit-' + matchId);
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      window._suppressSoftRefresh = false;
      _rerenderBracket(tId, matchId);
    });
  }

  var confirmBtn = document.getElementById('confirm-pending-edit-' + matchId);
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var s1v = parseInt((document.getElementById('s1-' + matchId) || {}).value, 10);
      var s2v = parseInt((document.getElementById('s2-' + matchId) || {}).value, 10);
      if (isNaN(s1v) || isNaN(s2v)) { showNotification('Placar inválido', 'Preencha os dois campos.', 'warning'); return; }
      var isGroupMatch = m.group !== undefined;
      var isRoundMatch = m.roundIndex !== undefined || (t.rounds && t.rounds.some(function(r) {
        return (r.matches || []).some(function(rm) { return rm.id === matchId; });
      }));
      var allowDraw = isGroupMatch || isRoundMatch;
      if (s1v === s2v && !allowDraw) { showNotification('Empate não permitido', 'Eliminatórias não permitem empate.', 'warning'); return; }
      var winner = s1v === s2v ? 'draw' : (s1v > s2v ? m.p1 : m.p2);
      // v1.9.76: AUTORIDADE (organizador/co-host/árbitro) FINALIZA direto — não
      // cria contra-proposta. Cobre a Fase 4 (resolução de disputa via "⚖️
      // Lançar placar definitivo") e qualquer edição feita pelo organizador.
      // BUG anterior: este handler sempre criava contra-proposta (isCounterProposal),
      // então o organizador resolvendo a disputa só gerava NOVO pending sem botões
      // (disputed perdido) — o jogo ficava preso pendente. 0×0 = refazer a partida.
      if (typeof _isUserAuthority === 'function' && _isUserAuthority(t, cu)) {
        window._suppressSoftRefresh = false;
        if (s1v === 0 && s2v === 0) {
          if (typeof window._organizerResetMatch === 'function') window._organizerResetMatch(tId, matchId);
          return;
        }
        // Grava o placar do organizador como pending e finaliza pelo caminho
        // comprovado _approveResult (que, sendo autoridade, aplica como definitivo).
        m.pendingResult = {
          kind: 'inline',
          proposedBy: cu.uid || null,
          proposedByEmail: cu.email || null,
          proposedByName: cu.displayName || cu.email || 'Organizador',
          proposedAt: Date.now(),
          winner: winner,
          draw: s1v === s2v,
          scoreP1: s1v,
          scoreP2: s2v
        };
        if (typeof window._approveResult === 'function') window._approveResult(tId, matchId);
        return;
      }
      // v1.9.89: preserva a proposta ORIGINAL (Time A) — pra o organizador ver,
      // na disputa, "proposto por A: X" + "revisado por B: Y".
      var _prevPending = m.pendingResult || {};
      var _origProp = _prevPending.originalProposal || (_prevPending.proposedByName ? {
        proposedByName: _prevPending.proposedByName,
        scoreP1: _prevPending.scoreP1,
        scoreP2: _prevPending.scoreP2
      } : null);
      var _counter = {
        kind: 'inline',
        proposedBy: cu.uid || null,
        proposedByEmail: cu.email || null,
        proposedByName: cu.displayName || cu.email || 'Jogador',
        proposedAt: Date.now(),
        winner: winner,
        draw: s1v === s2v,
        scoreP1: s1v,
        scoreP2: s2v,
        isCounterProposal: true,  // marca fase 2: time original verá Confirmar + Contestar
        originalProposal: _origProp
      };
      m.pendingResult = _counter; // local otimista
      // BLINDAGEM (v4.0.121): grava a contra-proposta ATÔMICO pelo portão.
      window.AppStore.mutate(tId, function (ft) {
        var fm = _findMatch(ft, matchId);
        if (!fm) return;
        fm.pendingResult = _counter;
        if (typeof window._propagateMatchUpdate === 'function') window._propagateMatchUpdate(ft, fm);
      }, 'Contra-proposta: ' + m.p1 + ' ' + s1v + ' × ' + s2v + ' ' + m.p2 + ' por ' + (cu.displayName || cu.email));
      // 4.1 DUAL-WRITE: espelha a contra-proposta (novo pendingResult) no doc do jogo.
      _dualWriteResult(tId, matchId);
      try { _notifyPendingApproval(t, m, _counter.proposedByName); } catch(e2) {}
      showNotification('⏳ Contra-proposta enviada', 'O time adversário foi notificado para aprovar ou contestar.', 'success');
      window._suppressSoftRefresh = false;
      _rerenderBracket(tId, matchId);
    });
  }

  // Não auto-focar no mobile — iOS scroll ao focar input causa UX confusa
};

window._editResult = function (tId, matchId) {
  showConfirmDialog(
    _t('bui.editResultTitle'),
    _t('bui.editResultConfirm'),
    () => {
      const t = window._findTournamentById(tId);
      if (!t) return;
      const m = _findMatch(t, matchId);
      if (!m) return;

      // Undo winner advancement: clear p1/p2 from next match where this winner was placed
      if (m.nextMatchId) {
        const next = _findMatch(t, m.nextMatchId);
        if (next && !next.winner) {
          if (next.p1 === m.winner) next.p1 = 'TBD';
          if (next.p2 === m.winner) next.p2 = 'TBD';
        }
      }
      // Undo loser advancement in double elimination (lower bracket)
      if (m.loserMatchId) {
        const lm = _findMatch(t, m.loserMatchId);
        if (lm && !lm.winner) {
          const oldLoser = m.winner === m.p1 ? m.p2 : m.p1;
          if (lm.p1 === oldLoser) lm.p1 = 'TBD';
          if (lm.p2 === oldLoser) lm.p2 = 'TBD';
        }
      }
      // Clear progressive classification entries
      if (t.classification) {
        var oldLoser2 = m.winner === m.p1 ? m.p2 : m.p1;
        delete t.classification[m.winner];
        delete t.classification[oldLoser2];
      }

      const prevWinner = m.winner;
      m.winner = null;
      m.scoreP1 = undefined;
      m.scoreP2 = undefined;
      m.draw = undefined;
      // Clear GSM data
      m.sets = undefined;
      m.setsWonP1 = undefined;
      m.setsWonP2 = undefined;
      m.totalGamesP1 = undefined;
      m.totalGamesP2 = undefined;
      // v0.16.87: propaga reset pra outras refs do mesmo match (monarch
      // groups, t.rodadas legacy) que ficaram separadas após Firestore
      // deserialização.
      _propagateMatchUpdate(t, m);

      window.AppStore.logAction(tId, `Resultado editado: partida ${m.label || matchId} reaberta`);
      window.AppStore.syncImmediate(tId);
      _rerenderBracket(tId);
    },
    null,
    { type: 'warning', confirmText: _t('btn.deleteReedit'), cancelText: _t('btn.cancel') }
  );
};

// ─── Edit result inline (DOM swap: static scores → inputs, Edit → Confirm) ──
window._editResultInline = function(tId, matchId) {
  var card = document.getElementById('card-' + matchId);
  if (!card) return;
  var t = window._findTournamentById(tId);
  if (!t) return;
  var m = window._findMatch ? window._findMatch(t, matchId) : null;
  if (!m) return;

  var _esc = function(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); };
  var inputStyle = 'width:52px;text-align:center;font-size:0.95rem;font-weight:700;background:rgba(255,255,255,0.06);border:1px solid rgba(245,158,11,0.4);color:var(--text-bright);border-radius:6px;padding:4px 6px;';

  // If this is a GSM set match with tiebreak enabled, also render hidden TB inputs
  // pre-filled with any existing tiebreak points from the saved set.
  var _esc2 = (typeof window._effectiveScoring === 'function') ? window._effectiveScoring(t, m) : t.scoring;
  var _useSets = _esc2 && _esc2.type === 'sets';
  var _tbEnabled = _useSets && _esc2.tiebreakEnabled !== false;
  var _existingTb = (m.sets && m.sets[0] && m.sets[0].tiebreak) || null;
  var _tbInputStyle = 'width:40px;text-align:center;font-size:0.75rem;font-weight:700;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.4);color:var(--text-bright);border-radius:5px;padding:3px 4px;';

  // Replace score containers by their explicit IDs
  var p1ScoreDiv = document.getElementById('score-p1-' + matchId);
  if (p1ScoreDiv) {
    var tb1Html = _tbEnabled
      ? '<input type="number" id="tb1-' + matchId + '" min="0" placeholder="tb" title="Tie-break"' +
        (_existingTb && _existingTb.pointsP1 != null ? ' value="' + _existingTb.pointsP1 + '"' : '') +
        ' style="' + _tbInputStyle + 'display:none;margin-left:4px;" oninput="window._highlightWinner(\'' + _esc(matchId) + '\')">'
      : '';
    p1ScoreDiv.innerHTML = '<input type="number" id="s1-' + matchId + '" min="0" placeholder="0"' +
      (m.scoreP1 != null ? ' value="' + m.scoreP1 + '"' : '') +
      ' style="' + inputStyle + '" oninput="window._highlightWinner(\'' + _esc(matchId) + '\')">' + tb1Html;
  }
  var p2ScoreDiv = document.getElementById('score-p2-' + matchId);
  if (p2ScoreDiv) {
    var tb2Html = _tbEnabled
      ? '<input type="number" id="tb2-' + matchId + '" min="0" placeholder="tb" title="Tie-break"' +
        (_existingTb && _existingTb.pointsP2 != null ? ' value="' + _existingTb.pointsP2 + '"' : '') +
        ' style="' + _tbInputStyle + 'display:none;margin-left:4px;" oninput="window._highlightWinner(\'' + _esc(matchId) + '\')">'
      : '';
    p2ScoreDiv.innerHTML = '<input type="number" id="s2-' + matchId + '" min="0" placeholder="0"' +
      (m.scoreP2 != null ? ' value="' + m.scoreP2 + '"' : '') +
      ' style="' + inputStyle + '" oninput="window._highlightWinner(\'' + _esc(matchId) + '\')">' + tb2Html;
  }

  // Reveal TB inputs now if the score is a TB scoreline (e.g. 7-6)
  if (typeof window._highlightWinner === 'function') {
    try { window._highlightWinner(matchId); } catch(e) {}
  }

  // Swap Edit button → Confirm button in the header
  var headerDiv = card.querySelector('div:first-child > div:last-child');
  if (headerDiv) {
    headerDiv.innerHTML = '<button id="confirm-' + matchId + '" onclick="window._saveResultInline(\'' + _esc(tId) + '\',\'' + _esc(matchId) + '\')"' +
      ' style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#4ade80;border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;transition:all 0.2s;"' +
      ' onmouseover="this.style.background=\'rgba(16,185,129,0.3)\'" onmouseout="this.style.background=\'rgba(16,185,129,0.15)\'">✓ ' +
      (typeof _t === 'function' ? _t('bracket.confirm') : 'Confirmar') + '</button>';
  }

  // Hide winner badge and sets display
  var allDivs = card.children;
  for (var i = 0; i < allDivs.length; i++) {
    var st = allDivs[i].getAttribute('style') || '';
    if (st.indexOf('margin-top:6px') !== -1 && (st.indexOf('#4ade80') !== -1 || st.indexOf('monospace') !== -1)) {
      allDivs[i].style.display = 'none';
    }
  }

  // Focus first input
  var s1 = document.getElementById('s1-' + matchId);
  if (s1) { s1.focus(); s1.select(); }
};

// ─── Share match result ──────────────────────────────────────────────────────
window._shareMatchResult = function(tId, matchId) {
  var t = window._findTournamentById(tId);
  if (!t) return;
  // Find match in all structures
  var sources = (typeof window._collectAllMatches === 'function')
    ? window._collectAllMatches(t)
    : [];
  var m = sources.find(function(mx) { return mx && String(mx.id) === String(matchId); });
  if (!m || !m.winner) return;

  var isDraw = m.winner === 'draw' || m.draw;
  var score = (m.scoreP1 !== undefined && m.scoreP1 !== null) ? (m.scoreP1 + ' x ' + m.scoreP2) : '';
  var resultText = isDraw ? _t('bui.drawResult') : ('🏆 ' + m.winner);
  var text = '⚔️ ' + (m.p1 || '?') + ' vs ' + (m.p2 || '?');
  if (score) text += ' (' + score + ')';
  text += '\n' + resultText;
  text += '\n📋 ' + (t.name || 'Torneio');
  if (t.sport) text += ' — ' + t.sport;
  // FASE B: compartilha o deep-link do JOGO (#match/:tId/:matchId) — abre a tela
  // leve que renderiza só aquele jogo (subdoc), sem carregar o torneio inteiro.
  var _shareUrl = (typeof window._matchUrl === 'function') ? window._matchUrl(tId, matchId) : window._tournamentUrl(tId);
  text += '\n\n🔗 ' + _shareUrl;

  if (navigator.share) {
    navigator.share({ title: _t('bui.resultShareTitle', {name: t.name}), text: text, url: _shareUrl }).catch(function() {});
  } else {
    // Clipboard fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        if (typeof window.showAlertDialog === 'function') {
          window.showAlertDialog(_t('bui.resultCopiedTitle'), _t('bui.resultCopiedMsg'));
        }
      }).catch(function() {});
    }
  }
};

// ─── Print bracket ───────────────────────────────────────────────────────────
window._printBracket = function() {
  window.print();
};

// ─── Sort standings table by clicking column headers ─────────────────────────
window._sortStandingsTable = function(thElement) {
  var table = thElement.closest('table');
  if (!table) return;
  var tbody = table.querySelector('tbody');
  if (!tbody) return;
  var colIdx = parseInt(thElement.getAttribute('data-sort-col'));
  var sortType = thElement.getAttribute('data-sort-type') || 'num';
  var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
  if (rows.length === 0) return;

  // Determine sort direction
  var currentDir = thElement.getAttribute('data-sort-dir') || 'none';
  var newDir = (currentDir === 'desc') ? 'asc' : 'desc';
  // Default: first click on # is asc, first click on text cols is asc, first click on numeric cols is desc
  if (currentDir === 'none') {
    newDir = (colIdx === 0 || sortType === 'text') ? 'asc' : 'desc';
  }

  // Reset all arrows in this table header
  var allThs = table.querySelectorAll('th[data-sort-col]');
  allThs.forEach(function(th) {
    th.setAttribute('data-sort-dir', 'none');
    var arrow = th.querySelector('.sort-arrow');
    if (arrow) { arrow.textContent = '⇅'; arrow.style.opacity = '0.4'; }
  });

  // Set active arrow
  thElement.setAttribute('data-sort-dir', newDir);
  var activeArrow = thElement.querySelector('.sort-arrow');
  if (activeArrow) {
    activeArrow.textContent = newDir === 'desc' ? '▼' : '▲';
    activeArrow.style.opacity = '1';
  }

  // Sort rows
  rows.sort(function(a, b) {
    var cellA = a.querySelectorAll('td')[colIdx];
    var cellB = b.querySelectorAll('td')[colIdx];
    if (!cellA || !cellB) return 0;
    var valA = cellA.textContent.trim();
    var valB = cellB.textContent.trim();

    if (sortType === 'text') {
      var cmp = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' });
      return newDir === 'asc' ? cmp : -cmp;
    } else {
      // Parse numeric: handle medals (🥇=1, 🥈=2, 🥉=3), +/- signs
      var numA = parseFloat(valA.replace(/[^\d\-\.]/g, '')) || 0;
      var numB = parseFloat(valB.replace(/[^\d\-\.]/g, '')) || 0;
      // Special handling for medal emojis in position column
      if (colIdx === 0) {
        if (valA.includes('🥇')) numA = 1;
        else if (valA.includes('🥈')) numA = 2;
        else if (valA.includes('🥉')) numA = 3;
        else numA = parseInt(valA.replace(/[^\d]/g, '')) || 999;
        if (valB.includes('🥇')) numB = 1;
        else if (valB.includes('🥈')) numB = 2;
        else if (valB.includes('🥉')) numB = 3;
        else numB = parseInt(valB.replace(/[^\d]/g, '')) || 999;
      }
      return newDir === 'asc' ? (numA - numB) : (numB - numA);
    }
  });

  // Re-insert sorted rows
  rows.forEach(function(row) { tbody.appendChild(row); });
};


window._tvModeInterval = null;

// Build "Próximos Jogos" section for TV mode
window._tvBuildNextMatches = function(t) {
  var allMatches = [];
  var unified = (typeof window._getUnifiedRounds === 'function') ? window._getUnifiedRounds(t) : null;
  var hasUnifiedColumns = unified && Array.isArray(unified.columns) && unified.columns.length > 0;

  if (hasUnifiedColumns) {
    // Canonical path: each column already carries a humane label
    // ("Final" / "Semifinais" / "Grande Final" / "Grupos" / "Rodada N"),
    // so TV mode can surface those instead of generic "Rodada N".
    unified.columns.forEach(function(c) {
      if (!c || c.phase === 'swiss-past' || c.historical) return;

      if ((c.phase === 'groups' || c.phase === 'monarch') && Array.isArray(c.subgroups)) {
        // Label per subgroup (e.g., "Grupo A")
        c.subgroups.forEach(function(sg, gi) {
          var label = window._groupDisplayName(sg, gi);
          (sg && sg.matches || []).forEach(function(m) {
            if (m.p1 && m.p2 && !m.winner && !m.isBye) {
              m._roundLabel = label;
              allMatches.push(m);
            }
          });
        });
      } else {
        (c.matches || []).forEach(function(m) {
          if (m.p1 && m.p2 && !m.winner && !m.isBye) {
            if (c.label) m._roundLabel = c.label;
            allMatches.push(m);
          }
        });
      }
    });
  } else {
    // Legacy fallback (adapter not loaded)
    if (Array.isArray(t.matches)) {
      t.matches.forEach(function(m) { if (m.p1 && m.p2 && !m.winner && !m.isBye) allMatches.push(m); });
    }
    if (Array.isArray(t.rounds)) {
      t.rounds.forEach(function(r, ri) {
        (r.matches || []).forEach(function(m) {
          if (m.p1 && m.p2 && !m.winner) { m._roundLabel = _t('bracket.round', {n: ri + 1}); allMatches.push(m); }
        });
      });
    }
    if (Array.isArray(t.groups)) {
      t.groups.forEach(function(g, gi) {
        (g.matches || []).forEach(function(m) {
          if (m.p1 && m.p2 && !m.winner) { m._roundLabel = window._groupDisplayName(g, gi); allMatches.push(m); }
        });
      });
    }
  }
  var upcoming = allMatches.slice(0, 6);
  if (upcoming.length === 0) return '';
  var html = '<div style="margin-bottom:1.5rem;">';
  html += '<div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.4);margin-bottom:12px;">' + _t('bui.nextGames') + '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">';
  upcoming.forEach(function(m) {
    var courtInfo = m.court ? '<div style="font-size:0.7rem;color:#818cf8;margin-top:4px;">📍 ' + window._safeHtml(m.court) + '</div>' : '';
    var roundInfo = m._roundLabel ? '<div style="font-size:0.65rem;color:rgba(255,255,255,0.3);margin-top:2px;">' + window._safeHtml(m._roundLabel) + '</div>' : '';
    var presenceP1 = m.presenceP1 ? '✅' : '⏳';
    var presenceP2 = m.presenceP2 ? '✅' : '⏳';
    html += '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px 16px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<div style="flex:1;text-align:center;">';
    // v4.5.68: nome vivo por uid do slot (Modo TV).
    var _rsl = (typeof window._resolveSideLive === 'function') ? window._resolveSideLive : function(_t, s) { return s; };
    var _tvN1 = _rsl(t, m.p1 || 'TBD', (window._slotUids ? window._slotUids(m, 'p1') : (m.p1Uid || m.team1Uids)));
    var _tvN2 = _rsl(t, m.p2 || 'TBD', (window._slotUids ? window._slotUids(m, 'p2') : (m.p2Uid || m.team2Uids)));
    html += '<div style="font-size:1rem;font-weight:700;color:white;">' + presenceP1 + ' ' + window._safeHtml(_tvN1) + '</div>';
    html += '</div>';
    html += '<div style="font-size:0.9rem;font-weight:800;color:rgba(255,255,255,0.25);margin:0 12px;">VS</div>';
    html += '<div style="flex:1;text-align:center;">';
    html += '<div style="font-size:1rem;font-weight:700;color:white;">' + window._safeHtml(_tvN2) + ' ' + presenceP2 + '</div>';
    html += '</div>';
    html += '</div>';
    html += courtInfo + roundInfo;
    html += '</div>';
  });
  html += '</div></div>';
  return html;
};

// Build attendance/presence summary for TV mode
window._tvBuildAttendance = function(t) {
  var allMatches = (typeof window._collectAllMatches === 'function')
    ? window._collectAllMatches(t)
    : [];
  var pending = allMatches.filter(function(m) { return m.p1 && m.p2 && !m.winner && !m.isBye; });
  if (pending.length === 0) return '';
  var waitingPresence = pending.filter(function(m) { return !m.presenceP1 || !m.presenceP2; });
  if (waitingPresence.length === 0) return '';
  var html = '<div style="margin-bottom:1.5rem;padding:14px 18px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:12px;">';
  html += '<div style="display:flex;align-items:center;gap:10px;">';
  html += '<span style="font-size:1.5rem;">⏳</span>';
  html += '<div>';
  html += '<div style="font-size:0.95rem;font-weight:700;color:#fbbf24;">' + _t('bui.waitingPresence') + '</div>';
  html += '<div style="font-size:0.8rem;color:rgba(255,255,255,0.5);margin-top:2px;">' + _t('bui.waitingPresenceCount', {n: waitingPresence.length}) + '</div>';
  html += '</div></div></div>';
  return html;
};

window._tvMode = function(tId) {
  var t = window._findTournamentById(tId);
  if (!t) {
    if (typeof showAlertDialog === 'function') showAlertDialog(_t('bui.tournNotFoundTitle'), _t('bui.tournNotFoundAlertMsg'), null, { type: 'warning' });
    return;
  }
  var safeName = window._safeHtml ? window._safeHtml(t.name) : t.name;

  // Create overlay
  var overlay = document.createElement('div');
  overlay.id = 'tv-mode-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#0a0e1a;z-index:99999;overflow:auto;display:flex;flex-direction:column;';

  // Hero section with venue photo background
  // v4.0.21: foto de fundo custom do organizador tem prioridade sobre a do Google.
  var heroBg = t.coverPhotoData
    ? 'background-image:linear-gradient(to bottom,rgba(10,14,26,0.3),rgba(10,14,26,0.95)),url(' + t.coverPhotoData + ');background-size:cover;background-position:center;'
    : t.venuePhotoUrl
      ? 'background-image:linear-gradient(to bottom,rgba(10,14,26,0.3),rgba(10,14,26,0.95)),url(' + t.venuePhotoUrl + ');background-size:cover;background-position:center;'
      : 'background:linear-gradient(135deg,#1e293b 0%,#0f172a 50%,#1e1b4b 100%);';
  // v4.0.14: re-busca a foto fresca pelo placeId (token salvo expira → 400).
  // v4.0.21: desligado quando há foto custom.
  var _heroVphoto = (!t.coverPhotoData && t.venuePhotoUrl && t.venuePlaceId)
    ? ' data-vphoto-pid="' + window._safeHtml(t.venuePlaceId) + '" data-vphoto-overlay="linear-gradient(to bottom,rgba(10,14,26,0.3),rgba(10,14,26,0.95))" data-vphoto-w="1200" data-vphoto-h="600"'
    : '';
  var hero = '<div' + _heroVphoto + ' style="' + heroBg + 'padding:30px 40px;flex-shrink:0;position:relative;">';
  // Exit button (top right)
  hero += '<button onclick="window._exitTvMode()" style="position:absolute;top:16px;right:20px;background:rgba(239,68,68,0.25);color:#f87171;border:1px solid rgba(239,68,68,0.4);padding:10px 20px;border-radius:10px;cursor:pointer;font-size:0.9rem;font-weight:700;z-index:1;">✕ Sair do Modo TV</button>';
  // Clock (top right, below exit)
  hero += '<div style="position:absolute;top:60px;right:20px;text-align:right;">';
  hero += '<div id="tv-mode-clock" style="color:rgba(255,255,255,0.7);font-size:1.4rem;font-weight:700;font-variant-numeric:tabular-nums;"></div>';
  hero += '<div id="tv-mode-refresh-indicator" style="color:rgba(255,255,255,0.3);font-size:0.7rem;margin-top:2px;">Auto-refresh: 30s</div>';
  hero += '</div>';
  // Tournament info
  hero += '<div style="display:flex;align-items:center;gap:20px;">';
  if (t.logoData) hero += '<img src="' + t.logoData + '" style="width:72px;height:72px;border-radius:' + window._tournamentLogoRadius(t) + ';object-fit:cover;box-shadow:0 4px 20px rgba(0,0,0,0.4);">';
  hero += '<div>';
  hero += '<h1 style="margin:0;color:white;font-size:2.2rem;font-weight:900;text-shadow:0 2px 10px rgba(0,0,0,0.5);">' + safeName + '</h1>';
  hero += '<div style="color:rgba(255,255,255,0.6);font-size:1rem;margin-top:4px;display:flex;gap:16px;flex-wrap:wrap;">';
  hero += '<span>' + window._safeHtml(t.format || '') + '</span>';
  hero += '<span>•</span><span>' + window._safeHtml(t.sport || '') + '</span>';
  if (t.venue) hero += '<span>•</span><span>📍 ' + window._safeHtml(t.venue) + '</span>';
  // CANÔNICO: PESSOAS inscritas (dupla=2), não entradas. Ver _countCompetitors.
  var partCount = typeof window._countCompetitors === 'function' ? window._countCompetitors(t).people : (Array.isArray(t.participants) ? t.participants.length : 0);
  hero += '<span>•</span><span>👤 ' + partCount + ' inscritos</span>';
  hero += '</div></div></div>';

  // Progress bar inside hero
  var progHtml = '';
  if (typeof window._getTournamentProgress === 'function') {
    var prog = window._getTournamentProgress(t);
    // Multi-fase: header do torneio INTEIRO (soma as fases), não só a fase atual.
    if (window._isMultiPhase && window._isMultiPhase(t) && typeof window._tournamentGamesPlan === 'function') {
      var _gpBH = window._tournamentGamesPlan(t);
      if (_gpBH && _gpBH.totalPlanned > 0) prog = { total: _gpBH.totalPlanned, completed: _gpBH.totalDone, pct: _gpBH.pct };
    }
    if (prog.total > 0) {
      var barCol = prog.pct === 100 ? '#10b981' : (prog.pct > 50 ? '#3b82f6' : '#f59e0b');
      progHtml = '<div style="margin-top:20px;">';
      progHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
      progHtml += '<span style="font-size:0.8rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.4);">Progresso do Torneio</span>';
      progHtml += '<span style="font-size:1rem;font-weight:800;color:white;">' + prog.completed + '/' + prog.total + ' partidas (' + prog.pct + '%)</span>';
      progHtml += '</div>';
      progHtml += '<div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">';
      progHtml += '<div style="width:' + prog.pct + '%;height:100%;background:' + barCol + ';border-radius:4px;transition:width 0.5s;"></div>';
      progHtml += '</div></div>';
    }
  }
  hero += progHtml + '</div>';

  // Next matches + Attendance
  var nextMatchesHtml = window._tvBuildNextMatches(t);
  var attendanceHtml = window._tvBuildAttendance(t);

  // Content: grab existing bracket/standings content
  var viewContainer = document.getElementById('view-container');
  var contentHtml = '';
  if (viewContainer) {
    var cards = viewContainer.querySelectorAll('.bracket-container, table, .card');
    var tempDiv = document.createElement('div');
    cards.forEach(function(el) {
      var clone = el.cloneNode(true);
      var btns = clone.querySelectorAll('button, .btn, a.btn');
      btns.forEach(function(b) { b.remove(); });
      var forms = clone.querySelectorAll('select, input');
      forms.forEach(function(f) { f.remove(); });
      tempDiv.appendChild(clone);
    });
    contentHtml = tempDiv.innerHTML;
  }

  var tvStyles = '<style>' +
    '#tv-mode-overlay table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }' +
    '#tv-mode-overlay table th { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); padding: 10px 14px; font-size: 0.85rem; font-weight: 700; text-align: left; border-bottom: 2px solid rgba(255,255,255,0.15); }' +
    '#tv-mode-overlay table td { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); font-size: 0.95rem; }' +
    '#tv-mode-overlay table tr:hover td { background: rgba(255,255,255,0.03); }' +
    '#tv-mode-overlay .bracket-container { overflow: visible; }' +
    '#tv-mode-overlay .bracket-match { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); }' +
    '#tv-mode-overlay .match-player { color: rgba(255,255,255,0.8); border-bottom-color: rgba(255,255,255,0.08); }' +
    '#tv-mode-overlay .match-player.winner { color: #4ade80; background: rgba(16,185,129,0.1); }' +
    '#tv-mode-overlay .match-score { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); color: white; }' +
    '#tv-mode-overlay .bracket-round-title { color: rgba(255,255,255,0.5); }' +
    '#tv-mode-overlay details { color: rgba(255,255,255,0.7); }' +
    '#tv-mode-overlay h3, #tv-mode-overlay h4 { color: white; }' +
    '#tv-mode-overlay .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: white; }' +
    '</style>';

  overlay.innerHTML = hero +
    '<div id="tv-mode-content" style="flex:1;overflow:auto;padding:24px 40px;color:white;">' +
    tvStyles + attendanceHtml + nextMatchesHtml + contentHtml +
    '</div>';

  document.body.appendChild(overlay);

  // Try fullscreen
  if (overlay.requestFullscreen) overlay.requestFullscreen().catch(function() {});
  else if (overlay.webkitRequestFullscreen) overlay.webkitRequestFullscreen();

  // Clock update
  function updateClock() {
    var clockEl = document.getElementById('tv-mode-clock');
    if (clockEl) {
      var now = new Date();
      clockEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  updateClock();
  window._tvModeClockInterval = setInterval(updateClock, 1000);

  // Auto-refresh every 30s
  window._tvModeInterval = setInterval(function() {
    var ov = document.getElementById('tv-mode-overlay');
    if (!ov) { clearInterval(window._tvModeInterval); clearInterval(window._tvModeClockInterval); return; }
    // Reload tournament data
    var tNow = window._findTournamentById(tId);
    if (!tNow) return;
    var vc = document.getElementById('view-container');
    if (vc && typeof renderBracket === 'function') {
      renderBracket(vc, tId);
      setTimeout(function() {
        var contentDiv = document.getElementById('tv-mode-content');
        if (!contentDiv || !vc) return;
        var newCards = vc.querySelectorAll('.bracket-container, table, .card');
        var tmp = document.createElement('div');
        newCards.forEach(function(el) {
          var cl = el.cloneNode(true);
          var bs = cl.querySelectorAll('button, .btn, a.btn, select, input');
          bs.forEach(function(b) { b.remove(); });
          tmp.appendChild(cl);
        });
        var styleTag = contentDiv.querySelector('style');
        var newAttendance = window._tvBuildAttendance(tNow);
        var newNextMatches = window._tvBuildNextMatches(tNow);
        contentDiv.innerHTML = (styleTag ? styleTag.outerHTML : '') + newAttendance + newNextMatches + tmp.innerHTML;

        var ind = document.getElementById('tv-mode-refresh-indicator');
        if (ind) {
          ind.textContent = _t('bui.updated');
          ind.style.color = '#4ade80';
          setTimeout(function() { if (ind) { ind.textContent = _t('bui.autoRefresh'); ind.style.color = 'rgba(255,255,255,0.3)'; } }, 2000);
        }
      }, 500);
    }
  }, 30000);

  // ESC to exit
  window._tvModeEscHandler = function(e) {
    if (e.key === 'Escape') window._exitTvMode();
  };
  document.addEventListener('keydown', window._tvModeEscHandler);

  // Exit on fullscreen change
  window._tvModeFullscreenHandler = function() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      var ov = document.getElementById('tv-mode-overlay');
      if (ov) window._exitTvMode();
    }
  };
  document.addEventListener('fullscreenchange', window._tvModeFullscreenHandler);
  document.addEventListener('webkitfullscreenchange', window._tvModeFullscreenHandler);
};

window._exitTvMode = function() {
  if (window._tvModeInterval) { clearInterval(window._tvModeInterval); window._tvModeInterval = null; }
  if (window._tvModeClockInterval) { clearInterval(window._tvModeClockInterval); window._tvModeClockInterval = null; }
  var overlay = document.getElementById('tv-mode-overlay');
  if (overlay) overlay.remove();
  if (document.fullscreenElement) document.exitFullscreen().catch(function() {});
  else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  if (window._tvModeEscHandler) { document.removeEventListener('keydown', window._tvModeEscHandler); window._tvModeEscHandler = null; }
  if (window._tvModeFullscreenHandler) {
    document.removeEventListener('fullscreenchange', window._tvModeFullscreenHandler);
    document.removeEventListener('webkitfullscreenchange', window._tvModeFullscreenHandler);
    window._tvModeFullscreenHandler = null;
  }
};

// ─── Player match history popup ──────────────────────────────────────────────
// v2.3.21: long-press (segurar o touch) num cabeçalho da classificação abre a
// explicação da coluna. No desktop o `title` (hover) já cobre isso. Listeners
// delegados no document, anexados uma única vez — sobrevivem a re-renders.
window._ensureStHeaderExplainer = function() {
  if (window._stExplainerOn) return;
  window._stExplainerOn = true;
  var timer = null, longFired = false, startX = 0, startY = 0, MOVE_TOL = 12;
  var findTh = function(el) { return (el && el.closest) ? el.closest('th[data-explain]') : null; };
  var fire = function(th) {
    longFired = true;
    try {
      var ttl = th.getAttribute('data-explain-title') || 'Coluna';
      var msg = th.getAttribute('data-explain') || '';
      if (window._haptic) window._haptic('tap');
      if (window.showAlertDialog) window.showAlertDialog(ttl, msg, null, { type: 'info' });
    } catch (_e) {}
  };
  var cancel = function() { if (timer) { clearTimeout(timer); timer = null; } };
  document.addEventListener('touchstart', function(e) {
    var th = findTh(e.target);
    if (!th) return;
    longFired = false;
    var tch = e.touches && e.touches[0];
    startX = tch ? tch.clientX : 0;
    startY = tch ? tch.clientY : 0;
    cancel();
    timer = setTimeout(function() { fire(th); }, 380);
  }, { passive: true });
  // só cancela se o dedo se moveu além da tolerância (micro-drift não conta)
  document.addEventListener('touchmove', function(e) {
    if (!timer) return;
    var tch = e.touches && e.touches[0];
    if (!tch) { cancel(); return; }
    if (Math.abs(tch.clientX - startX) > MOVE_TOL || Math.abs(tch.clientY - startY) > MOVE_TOL) cancel();
  }, { passive: true });
  document.addEventListener('touchcancel', function() { cancel(); }, { passive: true });
  document.addEventListener('touchend', function() {
    cancel();
    if (longFired) {
      // impede o "click" de ordenação que dispara logo após o long-press
      window._stSuppressClick = true;
      longFired = false;
      setTimeout(function() { window._stSuppressClick = false; }, 800);
    }
  });
  // captura: consome o próximo click após long-press (antes do onclick inline do th)
  document.addEventListener('click', function(e) {
    if (window._stSuppressClick && findTh(e.target)) {
      window._stSuppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
};

window._showPlayerHistory = function(tId, playerName, filter) {
  var _flt = filter || 'all'; // 'all' | 'wins' | 'losses'
  var t = window._findTournamentById(tId);
  if (!t) return;
  var matches = [];
  // Prefer canonical adapter: picks up thirdPlace + rodadas + sub-rounds,
  // and supplies semantic labels ("Semifinais", "Final", "Grupo A", "Disputa 3º lugar").
  var _unified = (typeof window._getUnifiedRounds === 'function') ? window._getUnifiedRounds(t) : null;
  if (_unified && Array.isArray(_unified.columns) && _unified.columns.length > 0) {
    _unified.columns.forEach(function(c) {
      if (!c) return;
      // Groups/Monarch columns expose matches via subgroups[i].matches,
      // not c.matches — walk both so player history covers every phase.
      if ((c.phase === 'groups' || c.phase === 'monarch') && Array.isArray(c.subgroups)) {
        c.subgroups.forEach(function(sg, gi) {
          var gname = window._groupDisplayName(sg, gi);
          (sg && sg.matches || []).forEach(function(m) {
            if (m && (m.p1 === playerName || m.p2 === playerName)) {
              matches.push({ label: gname, m: m });
            }
          });
        });
        return;
      }
      if (!Array.isArray(c.matches)) return;
      c.matches.forEach(function(m) {
        if (m && (m.p1 === playerName || m.p2 === playerName)) {
          matches.push({ label: c.label || '', m: m });
        }
      });
    });
  } else {
    // Defensive fallback: adapter not loaded.
    (t.rounds || []).forEach(function(r, ri) {
      (r.matches || []).forEach(function(m) {
        if (m.p1 === playerName || m.p2 === playerName) matches.push({ round: ri + 1, m: m });
      });
    });
    if (Array.isArray(t.matches)) {
      t.matches.forEach(function(m) {
        if (m.p1 === playerName || m.p2 === playerName) matches.push({ round: null, m: m });
      });
    }
    if (Array.isArray(t.groups)) {
      t.groups.forEach(function(g, gi) {
        (g.matches || []).forEach(function(m) {
          if (m.p1 === playerName || m.p2 === playerName) matches.push({ round: null, m: m, label: window._groupDisplayName(g, gi) });
        });
      });
    }
  }

  if (matches.length === 0) {
    showAlertDialog(_t('bui.h2hTitle', { name: playerName }), _t('bui.h2hEmpty'), null, { type: 'info' });
    return;
  }

  var wins = 0, losses = 0, draws = 0;
  var rowObjs = matches.map(function(item) {
    var m = item.m;
    var opponent = m.p1 === playerName ? m.p2 : m.p1;
    var isDraw = m.winner === 'draw' || m.draw;
    var isWin = m.winner === playerName;
    var isLoss = m.winner && !isDraw && !isWin;
    if (isWin) wins++;
    else if (isDraw) draws++;
    else if (isLoss) losses++;
    var scoreStr = (m.scoreP1 !== undefined && m.scoreP1 !== null)
      ? (m.p1 === playerName ? m.scoreP1 + ' × ' + m.scoreP2 : m.scoreP2 + ' × ' + m.scoreP1)
      : (m.winner ? '' : '—');
    var resultIcon = isDraw ? '🤝' : (isWin ? '✅' : (isLoss ? '❌' : '⏳'));
    var roundLabel = item.label || (item.round ? 'Rodada ' + item.round : (m.label || ''));
    return {
      type: isWin ? 'win' : (isLoss ? 'loss' : (isDraw ? 'draw' : 'pending')),
      html: '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
        '<td style="padding:8px 10px;font-size:0.8rem;color:var(--text-muted);">' + roundLabel + '</td>' +
        '<td style="padding:8px 10px;font-size:0.8rem;font-weight:600;color:var(--text-bright);">' + (opponent || 'BYE') + '</td>' +
        '<td style="padding:8px 10px;font-size:0.8rem;text-align:center;">' + scoreStr + '</td>' +
        '<td style="padding:8px 10px;font-size:0.85rem;text-align:center;">' + resultIcon + '</td>' +
        '</tr>'
    };
  });
  // v2.3.21: filtro (clique em V → só vitórias; D → só derrotas).
  var shown = rowObjs.filter(function(r) {
    if (_flt === 'wins') return r.type === 'win';
    if (_flt === 'losses') return r.type === 'loss';
    return true;
  });
  var rows = shown.map(function(r) { return r.html; }).join('');

  var summary = '<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">' +
    '<span style="font-weight:700;color:#4ade80;">' + wins + 'V</span>' +
    '<span style="font-weight:700;color:#94a3b8;">' + draws + 'E</span>' +
    '<span style="font-weight:700;color:#f87171;">' + losses + 'D</span>' +
    '<span style="color:var(--text-muted);">' + matches.length + ' partidas</span>' +
    '</div>';

  var _ttl = _flt === 'wins' ? ('✅ Vitórias — ' + playerName)
    : (_flt === 'losses' ? ('❌ Derrotas — ' + playerName)
    : _t('bui.h2hTitle', { name: playerName }));

  if (shown.length === 0) {
    var _emptyMsg = _flt === 'wins' ? 'Nenhuma vitória até agora.'
      : (_flt === 'losses' ? 'Nenhuma derrota até agora.' : _t('bui.h2hEmpty'));
    showAlertDialog(_ttl, summary + '<div style="color:var(--text-muted);font-size:0.85rem;">' + _emptyMsg + '</div>', null, { type: 'info' });
    return;
  }

  var tableHtml = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">' +
    '<thead><tr style="border-bottom:2px solid var(--border-color);">' +
    '<th style="padding:6px 10px;text-align:left;font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Fase</th>' +
    '<th style="padding:6px 10px;text-align:left;font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Adversário</th>' +
    '<th style="padding:6px 10px;text-align:center;font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Placar</th>' +
    '<th style="padding:6px 10px;text-align:center;font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;">Resultado</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';

  showAlertDialog(_ttl, summary + tableHtml, null, { type: 'info' });
};

// ─── Advanced Points breakdown popup ─────────────────────────────────────────
// ── Interação da coluna 💯 PA: MOBILE = toque-e-segure (long-press); DESKTOP = clique.
// Abre _showAdvancedPointsBreakdown. Estado compartilhado + handlers inline (sobrevive
// a re-render). Tap CURTO no mobile NÃO abre (evita abrir sem querer ao rolar a tabela).
// _paCellHandlers (helper de string do RENDER) vive em bracket.js — carregado no
// render-harness. Aqui ficam só os handlers de RUNTIME (disparados no toque/clique).
window._paPress = window._paPress || { timer: null, touch: false };
window._paTouchStart = function (tId, name, cat) {
  window._paPress.touch = true;
  clearTimeout(window._paPress.timer);
  window._paPress.timer = setTimeout(function () {
    if (typeof window._haptic === 'function') { try { window._haptic('medium'); } catch (e) {} }
    window._showAdvancedPointsBreakdown(tId, name, cat);
  }, 420);
};
window._paTouchCancel = function () { clearTimeout(window._paPress.timer); };
window._paClick = function (tId, name, cat) {
  // touch: o long-press já cuidou (tap curto não abre). mouse: clique abre.
  if (window._paPress.touch) { window._paPress.touch = false; return; }
  window._showAdvancedPointsBreakdown(tId, name, cat);
};

window._showAdvancedPointsBreakdown = function(tId, playerName, category) {
  var t = window._findTournamentById(tId);
  if (!t || typeof window._calcAdvancedPoints !== 'function') return;
  var result = window._calcAdvancedPoints(t, playerName, category || null);
  var itemLabels = {
    participation: '🎾 Participação',
    match_won: '🏆 Vitória',
    game_won: '✅ Game ganho',
    game_lost: '❌ Game perdido',
    tiebreak_point: '⚡ Ponto em tie-break',
    killing_point: '💥 Killing point',
    point_scored: '➕ Ponto feito',
    floor: '⚓ Piso (mín. 0)',
    sitout_avg: '🪑 Folga (média das rodadas jogadas)',
    wo_penalty: '🚫 Punição por W.O.'
  };
  // v2.4.26: matriz — linhas = categoria de pontos. Ordem de colunas pedida pelo
  // usuário: Categoria | Total | Média | rodadas em ordem DECRESCENTE (última
  // rodada registrada logo após Média, primeira rodada na ponta direita).
  // Folgas por sorteio aparecem como coluna marcada "folga" com a média das
  // rodadas jogadas em cada linha; rodadas em que o jogador ficou de fora
  // (inativo) aparecem como coluna "inativo" com zero em cada linha.
  var CAT_ORDER = ['participation', 'match_won', 'game_won', 'game_lost', 'tiebreak_point', 'killing_point', 'point_scored', 'floor'];
  var cellVal = {};         // catKey -> { roundNum -> somaValores } (rodadas jogadas)
  var cellCount = {};       // catKey -> { roundNum -> somaContagens }
  var catUnit = {};         // catKey -> valor unitário (constante por categoria)
  var roundTotalsPlayed = {}; // roundNum -> total da rodada (jogada)
  var catPlayedTotal = {};  // catKey -> total da categoria nas rodadas jogadas
  var playedRoundSet = {};

  var _woPenaltyTotal = 0; // punição de W.O. — vira linha de resumo, não coluna de rodada
  result.breakdown.forEach(function(mb) {
    if (mb.isSitOutComp) return; // a folga vira coluna(s); ignora o lump aqui
    if (mb.isWoPenalty) { _woPenaltyTotal += (mb.total || 0); return; } // W.O. = linha à parte
    var rk = mb.round || 0;
    playedRoundSet[rk] = true;
    roundTotalsPlayed[rk] = (roundTotalsPlayed[rk] || 0) + (mb.total || 0);
    (mb.items || []).forEach(function(it) {
      if (!cellVal[it.key]) { cellVal[it.key] = {}; cellCount[it.key] = {}; }
      cellVal[it.key][rk] = (cellVal[it.key][rk] || 0) + it.value;
      cellCount[it.key][rk] = (cellCount[it.key][rk] || 0) + it.count;
      catPlayedTotal[it.key] = (catPlayedTotal[it.key] || 0) + it.value;
      catUnit[it.key] = it.unit;
    });
  });

  // Varre todas as partidas pra classificar cada rodada do torneio: jogada,
  // folga (sit-out por sorteio/remainder) ou inativo (sit-out inativo OU rodada
  // em que o jogador simplesmente não entrou).
  function _paInSide(side) {
    if (Array.isArray(side)) return side.indexOf(playerName) !== -1;
    if (typeof side !== 'string') return false;
    if (side === playerName) return true;
    return side.split(' / ').indexOf(playerName) !== -1;
  }
  var _allM = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : null;
  if (!_allM) { _allM = []; (t.rounds || []).forEach(function(r) { (r.matches || []).forEach(function(m) { _allM.push(m); }); }); }
  var roundStatus = {};  // roundNum -> 'played' | 'folga' | 'inativo'
  var allRoundSet = {};
  Object.keys(playedRoundSet).forEach(function(rk) { roundStatus[rk] = 'played'; allRoundSet[rk] = true; });
  // v4.4.113: uma rodada só entra como folga/inativo se REALMENTE COMEÇOU (tem ao menos
  // 1 jogo com resultado). Sem isto, uma rodada gerada mas ainda SEM placar (ex.: R2
  // sorteada e não jogada) aparecia como "inativo" pro jogador — confuso ("por que inativo
  // na R2 se ela nem foi jogada?"). Rodada pendente não conta folga/inatividade.
  var _roundStarted = {};
  _allM.forEach(function(m) {
    if (!m || m.isSitOut || m.isBye) return;
    if (category && m.category !== category) return;
    if (m.winner) _roundStarted[m.round || m.roundNumber || 0] = true;
  });
  _allM.forEach(function(m) {
    if (category && m.category !== category) return;
    var rk = m.round || m.roundNumber || 0;
    if (!rk) return;
    if (roundStatus[rk] !== 'played' && !_roundStarted[rk]) return; // rodada pendente (sem resultado) — ignora
    allRoundSet[rk] = true;
    if (roundStatus[rk] === 'played') return;
    if (m.isSitOut && (m.p1 === playerName || _paInSide(m.p1))) {
      roundStatus[rk] = (m.sitOutReason === 'inactive') ? 'inativo' : 'folga';
    }
  });
  // Ordem DECRESCENTE: última rodada primeiro, primeira na ponta direita.
  var rounds = Object.keys(allRoundSet).map(Number).sort(function(a, b) { return b - a; });
  rounds.forEach(function(rk) { if (!roundStatus[rk]) roundStatus[rk] = 'inativo'; });

  var cats = CAT_ORDER.filter(function(k) { return cellVal[k]; });
  Object.keys(cellVal).forEach(function(k) { if (cats.indexOf(k) === -1) cats.push(k); });

  var playedCount = Object.keys(playedRoundSet).length;
  var folgaCount = rounds.filter(function(rk) { return roundStatus[rk] === 'folga'; }).length;
  var inativoCount = rounds.filter(function(rk) { return roundStatus[rk] === 'inativo'; }).length;

  // Média por linha (categoria) = média das rodadas JOGADAS. É também o valor
  // que preenche cada célula das colunas de folga (folga = recebe sua média).
  var catAvg = {};
  cats.forEach(function(k) { catAvg[k] = playedCount ? Math.round((catPlayedTotal[k] || 0) / playedCount) : 0; });

  // v4.2.8 (pedido do dono): QUANTIDADE de itens por célula, ao lado do valor —
  // ex.: "(3) +450" (3 participações), "(1) +150" (1 vitória). catPlayedCount = soma
  // das contagens nas rodadas jogadas; média = por rodada jogada; total = jogadas + folgas.
  var catPlayedCount = {};
  cats.forEach(function(k) {
    var c = 0;
    Object.keys(playedRoundSet).forEach(function(rk) { c += (cellCount[k] && cellCount[k][rk]) || 0; });
    catPlayedCount[k] = c;
  });
  var catAvgCount = {};
  cats.forEach(function(k) { catAvgCount[k] = playedCount ? Math.round(catPlayedCount[k] / playedCount) : 0; });
  var catTotalCount = {};
  cats.forEach(function(k) { catTotalCount[k] = catPlayedCount[k] + catAvgCount[k] * folgaCount; });
  var _cntPfx = function(n) {
    if (!n) return '';
    return '<span style="color:var(--text-muted);opacity:0.6;font-weight:600;font-size:0.72rem;">(' + n + ')</span> ';
  };

  // Total por rodada de folga: distribui a compensação real (result.total menos
  // o que veio das rodadas jogadas) entre as colunas de folga, pra que o rodapé
  // some EXATAMENTE result.total (fonte autoritativa, igual à classificação).
  var totalPlayed = 0; Object.keys(roundTotalsPlayed).forEach(function(rk) { totalPlayed += roundTotalsPlayed[rk]; });
  var comp = (result.total || 0) - totalPlayed;
  var folgaColTotal = {};
  if (folgaCount > 0) {
    var per = Math.round(comp / folgaCount);
    var fi = 0;
    rounds.forEach(function(rk) {
      if (roundStatus[rk] !== 'folga') return;
      folgaColTotal[rk] = (fi === folgaCount - 1) ? (comp - per * (folgaCount - 1)) : per;
      fi++;
    });
  }
  var avgTotal = playedCount ? Math.round(totalPlayed / playedCount) : 0;

  var _fmtVal = function(v) {
    if (v === 0 || v == null) return '<span style="color:var(--text-muted);opacity:0.35;">·</span>';
    var sign = v > 0 ? '+' : '';
    return '<span style="color:' + (v >= 0 ? '#4ade80' : '#f87171') + ';font-weight:700;">' + sign + v + '</span>';
  };
  var _fmtZero = '<span style="color:var(--text-muted);opacity:0.5;">0</span>';

  var _subParts = [playedCount + ' jogada' + (playedCount === 1 ? '' : 's')];
  if (folgaCount > 0) _subParts.push(folgaCount + ' folga' + (folgaCount === 1 ? '' : 's'));
  if (inativoCount > 0) _subParts.push(inativoCount + ' inativa' + (inativoCount === 1 ? '' : 's'));
  var summary = '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
    '<span style="font-size:1.4rem;font-weight:900;color:#fbbf24;">💯 ' + (result.total || 0) + '</span>' +
    '<span style="color:var(--text-muted);font-size:0.8rem;">pontos avançados · ' + _subParts.join(' · ') + '</span>' +
    '</div>';
  // Punição de W.O. (quando houve): linha explícita — explica o desconto no total.
  if (_woPenaltyTotal !== 0) {
    summary += '<div style="margin:-4px 0 12px;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);border-radius:10px;font-size:0.82rem;color:#f87171;font-weight:700;">🚫 Punição por W.O.: ' + _woPenaltyTotal + ' <span style="opacity:0.75;font-weight:500;">(já incluído no total acima)</span></div>';
  }

  var tableHtml;
  if (result.breakdown.length === 0 && folgaCount === 0 && inativoCount === 0) {
    tableHtml = '<div style="padding:14px;text-align:center;color:var(--text-muted);">Sem partidas computadas.</div>';
  } else {
    var _thBase = 'padding:7px 10px;font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;';
    var _tdBase = 'padding:7px 10px;font-size:0.82rem;text-align:center;white-space:nowrap;';
    // Categoria fixa à esquerda enquanto Total/Média/rodadas rolam na horizontal.
    var _stkL = 'position:sticky;left:0;background:var(--bg-card);z-index:1;';
    var _bgFolga = 'background:rgba(245,158,11,0.06);';
    var _bgInativo = 'background:rgba(248,113,113,0.05);';
    var _roundTag = function(st) {
      if (st === 'folga') return '<div style="font-size:0.58rem;color:#fbbf24;font-weight:700;letter-spacing:0;">folga</div>';
      if (st === 'inativo') return '<div style="font-size:0.58rem;color:#f87171;font-weight:700;letter-spacing:0;">inativo</div>';
      return '';
    };
    var _roundBg = function(st) { return st === 'folga' ? _bgFolga : (st === 'inativo' ? _bgInativo : ''); };

    // Cabeçalho: Categoria | Total | Média | R(desc)…
    var head = '<thead><tr style="border-bottom:2px solid var(--border-color);">' +
      '<th style="' + _thBase + 'text-align:left;' + _stkL + 'z-index:2;">Categoria</th>' +
      '<th style="' + _thBase + 'text-align:center;color:#fbbf24;">Total</th>' +
      '<th style="' + _thBase + 'text-align:center;">Média</th>';
    rounds.forEach(function(rk) {
      var st = roundStatus[rk];
      head += '<th style="' + _thBase + 'text-align:center;' + _roundBg(st) + '">R' + rk + _roundTag(st) + '</th>';
    });
    head += '</tr></thead>';

    // Corpo: uma linha por categoria
    var body = '<tbody>';
    cats.forEach(function(catKey) {
      var lbl = itemLabels[catKey] || catKey;
      var catTotal = (catPlayedTotal[catKey] || 0) + (catAvg[catKey] || 0) * folgaCount;
      body += '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
        '<td style="' + _tdBase + 'text-align:left;color:var(--text-bright);' + _stkL + '">' + lbl + '</td>' +
        '<td style="' + _tdBase + 'font-weight:800;color:var(--text-bright);">' + _cntPfx(catTotalCount[catKey]) + _fmtVal(catTotal) + '</td>' +
        '<td style="' + _tdBase + 'opacity:0.85;" title="média por rodada jogada">' + _cntPfx(catAvgCount[catKey]) + _fmtVal(catAvg[catKey] || 0) + '</td>';
      rounds.forEach(function(rk) {
        var st = roundStatus[rk];
        if (st === 'played') {
          var v = (cellVal[catKey] && cellVal[catKey][rk] != null) ? cellVal[catKey][rk] : null;
          var cnt = (cellCount[catKey] && cellCount[catKey][rk]) || 0;
          var ttl = (v != null && cnt) ? (' title="' + cnt + ' × ' + ((catUnit[catKey] >= 0 ? '+' : '') + catUnit[catKey]) + '"') : '';
          body += '<td style="' + _tdBase + '"' + ttl + '>' + _cntPfx(cnt) + _fmtVal(v) + '</td>';
        } else if (st === 'folga') {
          body += '<td style="' + _tdBase + _bgFolga + '" title="Folga (sorteio) — média das rodadas jogadas"><span style="opacity:0.7;">' + _cntPfx(catAvgCount[catKey]) + _fmtVal(catAvg[catKey] || 0) + '</span></td>';
        } else {
          body += '<td style="' + _tdBase + _bgInativo + '">' + _fmtZero + '</td>';
        }
      });
      body += '</tr>';
    });
    body += '</tbody>';

    // Rodapé: Total geral | média do total | total por coluna (rodada)
    var foot = '<tfoot><tr style="border-top:2px solid var(--border-color);">' +
      '<td style="' + _tdBase + 'text-align:left;font-weight:800;color:var(--text-muted);text-transform:uppercase;' + _stkL + 'z-index:2;">Total</td>' +
      '<td style="' + _tdBase + 'font-weight:900;color:#fbbf24;font-size:0.95rem;">' + (result.total || 0) + '</td>' +
      '<td style="' + _tdBase + 'font-weight:800;color:#fbbf24;opacity:0.85;" title="média por rodada jogada">' + avgTotal + '</td>';
    rounds.forEach(function(rk) {
      var st = roundStatus[rk];
      var val = st === 'played' ? (roundTotalsPlayed[rk] || 0) : (st === 'folga' ? (folgaColTotal[rk] || 0) : 0);
      foot += '<td style="' + _tdBase + 'font-weight:800;color:#fbbf24;' + _roundBg(st) + '">' + (st === 'inativo' ? '0' : val) + '</td>';
    });
    foot += '</tr></tfoot>';

    tableHtml = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:max-content;">' + head + body + foot + '</table></div>' +
      '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:8px;line-height:1.4;">' +
        '<b style="color:#fbbf24;">Folga</b> (saiu por sorteio): recebe a média das rodadas jogadas em cada linha. ' +
        '<b style="color:#f87171;">Inativo</b> (ficou de fora da rodada): zero em cada linha.' +
      '</div>';
  }
  showAlertDialog('💯 Pontos Avançados — ' + playerName, summary + tableHtml, null, { type: 'info', okText: '‹ Voltar' });
};

// ─── Advance from Groups to Elimination ─────────────────────────────────────
window._advanceToElimination = function (tId) {
  const t = window._findTournamentById(tId);
  if (!t || !t.groups) return;

  const classified = t.gruposClassified || 2;
  const qualifiedPlayers = [];

  t.groups.forEach(g => {
    const scoreMap = {};
    g.participants.forEach(name => {
      scoreMap[name] = { name, points: 0, wins: 0, draws: 0, losses: 0, pointsDiff: 0, played: 0 };
    });
    (g.rounds || []).forEach(r => {
      (r.matches || []).forEach(m => {
        if (!m.winner && !m.draw) return;
        const s1 = parseInt(m.scoreP1) || 0; const s2 = parseInt(m.scoreP2) || 0;
        // Handle draws
        if (m.winner === 'draw' || m.draw) {
          if (!scoreMap[m.p1]) scoreMap[m.p1] = { name: m.p1, points: 0, wins: 0, draws: 0, losses: 0, pointsDiff: 0, played: 0 };
          if (!scoreMap[m.p2]) scoreMap[m.p2] = { name: m.p2, points: 0, wins: 0, draws: 0, losses: 0, pointsDiff: 0, played: 0 };
          scoreMap[m.p1].draws++; scoreMap[m.p1].points += 1; scoreMap[m.p1].played++;
          scoreMap[m.p2].draws++; scoreMap[m.p2].points += 1; scoreMap[m.p2].played++;
          scoreMap[m.p1].pointsDiff += (s1 - s2); scoreMap[m.p2].pointsDiff += (s2 - s1);
          return;
        }
        const loser = m.winner === m.p1 ? m.p2 : m.p1;
        if (!scoreMap[m.winner]) scoreMap[m.winner] = { name: m.winner, points: 0, wins: 0, draws: 0, losses: 0, pointsDiff: 0, played: 0 };
        if (!scoreMap[loser]) scoreMap[loser] = { name: loser, points: 0, wins: 0, draws: 0, losses: 0, pointsDiff: 0, played: 0 };
        scoreMap[m.winner].wins++; scoreMap[m.winner].points += 3; scoreMap[m.winner].played++;
        scoreMap[loser].losses++; scoreMap[loser].played++;
        if (m.winner === m.p1) { scoreMap[m.p1].pointsDiff += (s1 - s2); scoreMap[m.p2].pointsDiff += (s2 - s1); }
        else { scoreMap[m.p2].pointsDiff += (s2 - s1); scoreMap[m.p1].pointsDiff += (s1 - s2); }
      });
    });
    const sorted = Object.values(scoreMap).sort((a, b) => b.points - a.points || b.wins - a.wins || b.pointsDiff - a.pointsDiff);
    qualifiedPlayers.push(...sorted.slice(0, classified).map(s => s.name));
  });

  // Shuffle qualified slightly (cross-seed: 1st of group A vs 2nd of group B etc)
  // Simple cross-seeding: group winners in one half, runners-up in other half
  const groupWinners = [];
  const groupRunnersUp = [];
  t.groups.forEach(g => {
    const scoreMap = {};
    g.participants.forEach(name => {
      scoreMap[name] = { name, points: 0, wins: 0, draws: 0, pointsDiff: 0 };
    });
    (g.rounds || []).forEach(r => {
      (r.matches || []).forEach(m => {
        if (!m.winner && !m.draw) return;
        const s1 = parseInt(m.scoreP1) || 0; const s2 = parseInt(m.scoreP2) || 0;
        if (m.winner === 'draw' || m.draw) {
          if (!scoreMap[m.p1]) scoreMap[m.p1] = { name: m.p1, points: 0, wins: 0, draws: 0, pointsDiff: 0 };
          if (!scoreMap[m.p2]) scoreMap[m.p2] = { name: m.p2, points: 0, wins: 0, draws: 0, pointsDiff: 0 };
          scoreMap[m.p1].draws++; scoreMap[m.p1].points += 1;
          scoreMap[m.p2].draws++; scoreMap[m.p2].points += 1;
          scoreMap[m.p1].pointsDiff += (s1 - s2); scoreMap[m.p2].pointsDiff += (s2 - s1);
          return;
        }
        if (!scoreMap[m.winner]) scoreMap[m.winner] = { name: m.winner, points: 0, wins: 0, draws: 0, pointsDiff: 0 };
        scoreMap[m.winner].wins++; scoreMap[m.winner].points += 3;
        if (m.winner === m.p1) scoreMap[m.p1].pointsDiff += (s1 - s2);
        else scoreMap[m.p2].pointsDiff += (s2 - s1);
      });
    });
    const sorted = Object.values(scoreMap).sort((a, b) => b.points - a.points || b.wins - a.wins || b.pointsDiff - a.pointsDiff);
    if (sorted[0]) groupWinners.push(sorted[0].name);
    if (sorted[1]) groupRunnersUp.push(sorted[1].name);
    // Additional classified beyond 2
    for (let i = 2; i < classified && i < sorted.length; i++) {
      groupRunnersUp.push(sorted[i].name);
    }
  });

  // Cross-seed: 1st of group A vs runner-up from opposite group
  const seeded = [];
  const numGroups = t.groups.length;
  for (let i = 0; i < groupWinners.length; i++) {
    seeded.push(groupWinners[i]);
    const oppositeIdx = (numGroups - 1 - i) % groupRunnersUp.length;
    if (groupRunnersUp[oppositeIdx]) {
      seeded.push(groupRunnersUp[oppositeIdx]);
    }
  }
  // Add any remaining runners-up
  groupRunnersUp.forEach(r => { if (!seeded.includes(r)) seeded.push(r); });

  // Generate elimination bracket
  const ts = Date.now();
  const matches = [];
  for (let i = 0; i < seeded.length; i += 2) {
    const p1 = seeded[i];
    const p2 = i + 1 < seeded.length ? seeded[i + 1] : 'BYE (Avança Direto)';
    const isBye = p2 === 'BYE (Avança Direto)';
    matches.push({
      id: `elim-${ts}-${i}`,
      round: 1,
      p1, p2,
      winner: isBye ? p1 : null,
      isBye
    });
  }

  t.matches = matches;
  t.currentStage = 'elimination';
  window._buildNextMatchLinks(t);

  window.AppStore.logAction(tId, `Fase Eliminatória iniciada com ${seeded.length} classificados`);
  window.AppStore.syncImmediate(tId);

  showNotification(_t('bui.knockoutPhase'), _t('bui.knockoutPhaseMsg', {n: seeded.length}), 'success');
  _rerenderBracket(tId);
};

// Rei/Rainha NÃO é formato de fase: o antigo _advanceMonarchToElimination (avanço standalone
// Fase-0 monarch → eliminatória, exigia t.groups nativo) foi APAGADO na campanha
// kill-monarch-format (jul/2026). O avanço de fase agora é 100% do motor de empilhamento de
// fases (_advanceMultiPhase) — Rei/Rainha é só ligaRoundFormat de uma fase Pontos Corridos.

// ─── Live Scoring Overlay (full-screen, point-by-point) ─────────────────────
// Opens when player clicks "📡 Ao Vivo" on their own match card.
// Supports both simple scoring and GSM (Game-Set-Match) with tennis rules.
// Also supports casual mode: _openLiveScoring(null, null, { scoring, p1Name, p2Name, title })

// v2.8.20: resolver CANÔNICO da config de pontuação do placar ao vivo. Garante que,
// pra esporte com padrão GSM (Beach Tennis, Tênis, Padel…), o placar NUNCA caia em
// "games direto" (gamesPerSet=1) por config vazia/incompleta — bug intermitente em
// partida casual quando o scoring chegava {} (race/doc stale). Regras:
//   (a) já é GSM (type:'sets') → completa campos faltantes (countingType etc.) pelo padrão do esporte;
//   (b) config VAZIA + esporte tem padrão GSM → usa o padrão (evita numeric/games-direto);
//   (c) escolha explícita de placar livre (tem campos, sem type:'sets') OU esporte sem padrão → respeita.
window._resolveLiveScoring = function(rawSc, sportName) {
  var sc = (rawSc && typeof rawSc === 'object') ? rawSc : {};
  var defs = window._sportScoringDefaults || {};
  var key = String(sportName || '').replace(/^[^\wÀ-ɏ]+/u, '').trim();
  var def = defs[key];
  var hasKeys = Object.keys(sc).length > 0;
  if (sc.type === 'sets') {
    if (def && def.type === 'sets') {
      var merged = {}, k;
      for (k in def) if (Object.prototype.hasOwnProperty.call(def, k)) merged[k] = def[k];
      for (k in sc) if (Object.prototype.hasOwnProperty.call(sc, k) && sc[k] !== undefined) merged[k] = sc[k];
      return merged;
    }
    return sc;
  }
  if (!hasKeys && def && def.type === 'sets') {
    var c = {}, k2;
    for (k2 in def) if (Object.prototype.hasOwnProperty.call(def, k2)) c[k2] = def[k2];
    return c;
  }
  return sc;
};

window._openLiveScoring = function(tId, matchId, opts) {
  var isCasual = !!(opts && opts.casual);
  var t = null, m = null;
  if (!isCasual) {
    t = window._findTournamentById(tId);
    if (!t) return;
    m = _findMatch(t, matchId);
    if (!m) return;
    // v2.3.17: marca o INÍCIO da partida (placar ao vivo) = abertura do placar,
    // proxy do 1º ponto. Só pra partida ainda não decidida.
    if (m && !m.startedAt && !m.winner) m.startedAt = Date.now();
  }

  var sc = isCasual
    ? window._resolveLiveScoring(opts.scoring, opts.sportName)
    : (((typeof window._effectiveScoring === 'function') ? window._effectiveScoring(t, m) : t.scoring) || {});
  var useSets = sc.type === 'sets';
  // v2.1.35: se o torneio não tem GSM configurado mas o ESPORTE tem padrão
  // (Beach Tennis, Tênis, Padel, Pickleball, Vôlei de Praia, Futevôlei…), usa o
  // padrão do esporte — o placar ao vivo passa a contar games/sets/tiebreak em
  // vez de pontos soltos. Persiste em t.scoring pra o card do bracket bater.
  if (!isCasual && !useSets && !(m && m.phaseIndex) && window._sportScoringDefaults) {
    var _sportKey = String(t.sport || '').replace(/^[^\wÀ-ɏ]+/u, '').trim();
    var _sportDef = window._sportScoringDefaults[_sportKey];
    if (_sportDef && _sportDef.type === 'sets') {
      sc = Object.assign({}, _sportDef);
      useSets = true;
      t.scoring = sc;
      if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
        try { window.FirestoreDB.saveTournament(t); } catch (e) {}
      }
    }
  }
  // v2.8.20: completa campos faltantes do GSM (ex.: countingType) pelo padrão do esporte —
  // mesma canonização do casual; nunca rebaixa GSM já configurado pra numeric.
  if (!isCasual) { sc = window._resolveLiveScoring(sc, t.sport); useSets = sc.type === 'sets'; }
  var p1Name = isCasual ? (opts.p1Name || '') : (m.p1 || '');
  var p2Name = isCasual ? (opts.p2Name || '') : (m.p2 || '');
  var casualTitle = isCasual ? (opts.title || (typeof _t === 'function' ? _t('casual.title') : 'Partida Casual')) : '';
  var _esc = function(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); };

  // Remove existing overlay
  var existing = document.getElementById('live-scoring-overlay');
  if (existing) existing.remove();

  // ── Parse player names (doubles: "Ana/Bruno" → ["Ana","Bruno"]) ──
  var p1Players = p1Name.indexOf('/') > 0 ? p1Name.split('/').map(function(s){return s.trim();}).filter(Boolean) : (p1Name.trim() ? [p1Name.trim()] : []);
  var p2Players = p2Name.indexOf('/') > 0 ? p2Name.split('/').map(function(s){return s.trim();}).filter(Boolean) : (p2Name.trim() ? [p2Name.trim()] : []);
  var isDoubles = p1Players.length > 1 || p2Players.length > 1 || !!(opts && opts.isDoubles);
  // Default names when empty
  // v4.0.6: placeholders POSICIONAIS (Jogador 1-4), iguais pra todos — sem mais
  // "Parceiro"/"Adversário N" relativos ao espectador. Duplas: T1=1,2 T2=3,4.
  if (isDoubles) {
    if (p1Players.length === 0) p1Players = ['Jogador 1', 'Jogador 2'];
    if (p1Players.length === 1) p1Players.push('Jogador 2');
    if (p2Players.length === 0) p2Players = ['Jogador 3', 'Jogador 4'];
    if (p2Players.length === 1) p2Players.push('Jogador 4');
  } else {
    if (p1Players.length === 0) p1Players = ['Jogador 1'];
    if (p2Players.length === 0) p2Players = ['Jogador 2'];
  }

  // ── Placeholders POSICIONAIS (v4.0.6) ──
  // Slots sem uid/nome digitado viram "Jogador N" pela POSIÇÃO (iguais pra todos
  // os clientes) — fim do esquema relativo "Parceiro/Adversário" por perspectiva.
  // Duplas: T1 = Jogador 1,2 · T2 = Jogador 3,4. Simples: T1 = Jogador 1 · T2 = Jogador 2.
  // Também CONVERTE rótulos antigos persistidos ("Parceiro"/"Adversário N"/
  // "Oponente N") pra posicional — backward-compat de partidas já salvas. É
  // idempotente (re-normaliza "Jogador N" pra a posição certa). Mantém o nome
  // _localizeRoleLabels porque os handlers de sync remoto chamam essa função
  // depois de reescrever p1Players/p2Players.
  var _roleRe = /^(Parceiro|Advers[áa]rio\s*\d+|Oponente\s*\d+|Jogador\s*\d+)$/;
  function _localizeRoleLabels() {
    function remap(arr, team) {
      for (var j = 0; j < arr.length; j++) {
        if (_roleRe.test((arr[j] || '').trim())) {
          arr[j] = isDoubles ? ('Jogador ' + ((team === 1 ? 0 : 2) + j + 1)) : ('Jogador ' + (team === 1 ? 1 : 2));
        }
      }
    }
    // Mutate in place so outer references to the same arrays see the change.
    remap(p1Players, 1);
    remap(p2Players, 2);
  }
  _localizeRoleLabels();

  // Player metadata map (name → { uid, photoURL }) for avatar display
  var _playerMeta = {};
  if (opts && Array.isArray(opts.players)) {
    for (var pmi = 0; pmi < opts.players.length; pmi++) {
      var pm = opts.players[pmi];
      if (pm.name) _playerMeta[pm.name] = { uid: pm.uid || null, photoURL: pm.photoURL || null };
    }
  }
  // Also add current user's info for self-matching.
  // Coach mode: técnico não é jogador — pular para não atribuir foto/uid do
  // técnico a um jogador cujo nome coincida com o primeiro nome do técnico.
  if (!opts || !opts.coachMode) (function() {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (cu && cu.photoURL) {
      // Match by first name or displayName in any player name
      var allP = p1Players.concat(p2Players);
      for (var api = 0; api < allP.length; api++) {
        var pn = allP[api];
        if (cu.displayName && (pn === cu.displayName.split(' ')[0] || pn === cu.displayName)) {
          if (!_playerMeta[pn]) _playerMeta[pn] = {};
          if (!_playerMeta[pn].photoURL) _playerMeta[pn].photoURL = cu.photoURL;
          if (!_playerMeta[pn].uid) _playerMeta[pn].uid = cu.uid;
        }
      }
    }
  })();

  // Helper: build small avatar HTML for a player name (from metadata)
  // Falls back to first-name and substring matches so display names like
  // "Maria" still find metadata stored under "Maria Silva".
  // v1.8.9-beta: delegates to window._avatarHtml for HTML generation.
  function _liveAvatarHtml(name, size) {
    var meta = _playerMeta[name];
    if (!meta || !meta.photoURL) {
      // Try first-name / substring fallback
      var firstName = (name || '').split(' ')[0].toLowerCase();
      var lowerName = (name || '').toLowerCase();
      var keys = Object.keys(_playerMeta);
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki];
        var mm = _playerMeta[k];
        if (!mm || !mm.photoURL) continue;
        var kLower = k.toLowerCase();
        var kFirst = kLower.split(' ')[0];
        if (kFirst === firstName || kLower === lowerName || kLower.indexOf(lowerName) === 0 || lowerName.indexOf(kFirst) === 0) {
          meta = mm;
          break;
        }
      }
    }
    return window._avatarHtml({ photoURL: meta && meta.photoURL, displayName: name }, size || 28);
  }

  // Sport emoji for serve picker
  // v0.17.16: delega ao resolver global em store.js (centralização).
  var _sportBall = (function() {
    var sn = isCasual ? (opts.sportName || '') : (t && t.sport ? t.sport : '');
    return window._sportIcon ? window._sportIcon(sn) : '🎾';
  })();

  // v2.2.24-beta: toggles da tela de estatísticas (Sortear Duplas / Duplas
  // Mistas / Rei-Rainha) referenciados pelo finished-render do _render. Estes
  // identificadores existiam SÓ no escopo do _openCasualMatch (setup/lobby);
  // o _render do placar ao vivo está em OUTRO escopo (_openLiveScoring) e, ao
  // encerrar uma partida de DUPLAS, lançava `ReferenceError:
  // _canShowMixedToggle is not defined` — a exceção abortava o re-render, então
  // o ponto não subia na tela e a partida nunca encerrava. Declarados aqui no
  // escopo correto. _statsToggleShuffle/_statsToggleMixed (window) e
  // _liveScoreGoToSetup escrevem/leem estas mesmas vars do closure.
  var autoShuffle = (opts && typeof opts.autoShuffle === 'boolean') ? opts.autoShuffle : true;
  var _mixedDoublesEnabled = (opts && typeof opts.mixedDoubles === 'boolean') ? opts.mixedDoubles : true;
  function _canShowMixedToggle() {
    if (!isDoubles) return false;
    var male = 0, female = 0;
    var src = (opts && Array.isArray(opts.players)) ? opts.players : [];
    for (var _gi = 0; _gi < src.length; _gi++) {
      var _g = src[_gi] && (src[_gi].gender || src[_gi].sexo);
      if (_g === 'male' || _g === 'masculino' || _g === 'm' || _g === 'M') male++;
      else if (_g === 'female' || _g === 'feminino' || _g === 'f' || _g === 'F') female++;
    }
    return male === 2 && female === 2;
  }

  // v2.2.26-beta: consenso de "Jogar Novamente" na tela de estatísticas —
  // espelha o fluxo "ready" do lobby (_casualReadyClick). Quem clica em Jogar
  // fica em "⏳ Aguardando +N"; os demais precisam confirmar (clicar também),
  // com pelo menos 1 de cada time. Quando a condição é atendida, UM cliente
  // (o de menor uid entre os prontos, pra não bifurcar) dispara a nova partida.
  var _myRestartClicked = false;
  var _restartInitiated = false;
  function _restartConditionMet(readyUids, freshDoc) {
    if (!Array.isArray(readyUids) || readyUids.length < 1) return false;
    var pls = (freshDoc && Array.isArray(freshDoc.players)) ? freshDoc.players
      : ((opts && Array.isArray(opts.players)) ? opts.players : []);
    // v2.2.41-beta: conjunto de TODOS os uids reais na partida — de todas as
    // fontes. Crucial: quem entra pela sala via link fica em `playerUids` mas
    // pode ter `uid:null` no slot de `players[]` (entrou sem reivindicar slot
    // com a conta). Se confiarmos só em `players[].team/uid`, o time do
    // adversário fica "sem reais" → auto-OK → a revanche começava com UM clique
    // (bug reportado). Espelhamos o lobby: com 2+ reais, exige ≥2 confirmações.
    var realSet = {};
    if (freshDoc && Array.isArray(freshDoc.playerUids)) freshDoc.playerUids.forEach(function(u) { if (u) realSet[u] = 1; });
    pls.forEach(function(p) { if (p && p.uid) realSet[p.uid] = 1; });
    if (Array.isArray(_knownPlayerUids)) _knownPlayerUids.forEach(function(u) { if (u) realSet[u] = 1; });
    var realCount = Object.keys(realSet).length;
    // 0 ou 1 real → ninguém além de quem clicou pra confirmar → pode iniciar.
    if (realCount <= 1) return true;
    // 2+ reais → exige pelo menos 2 confirmações DISTINTAS (espelha o lobby,
    // que tem o mesmo guard de `length < 2`). Garante que o outro time confirme.
    var readyReal = readyUids.filter(function(u) { return realSet[u]; });
    if (readyReal.length < 2) return false;
    // E, quando os times estão rotulados em players[], exige ≥1 de cada time
    // que tenha reais. Time só de convidados é auto-OK (ninguém pra clicar).
    function _teamReady(team) {
      var realUids = pls.filter(function(p) { return p && p.team === team && p.uid; })
                        .map(function(p) { return p.uid; });
      if (realUids.length === 0) return true; // time só de convidados → auto-OK
      return realUids.some(function(u) { return readyUids.indexOf(u) !== -1; });
    }
    return _teamReady(1) && _teamReady(2);
  }
  // Eu sou o cliente designado pra disparar (menor uid entre os prontos)?
  function _amRestartStarter(readyUids) {
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;
    if (!myUid || !Array.isArray(readyUids) || !readyUids.length) return false;
    var sorted = readyUids.slice().sort();
    return sorted[0] === myUid;
  }
  // Atualiza o botão "Iniciar" da tela de stats: "⏳ Aguardando o outro time"
  // pra quem já clicou; "Iniciar (N pronto)" pra quem ainda não.
  function _updateRestartButtonUI(readyUids) {
    var btn = document.getElementById('live-restart-btn');
    if (!btn) return;
    var cnt = Array.isArray(readyUids) ? readyUids.length : 0;
    if (_myRestartClicked) {
      // v1.1.4: continua CLICÁVEL — 2º toque força o início (escape do fantasma).
      btn.disabled = false;
      btn.onclick = function() { window._liveScoreGoToSetup(); };
      btn.style.background = 'rgba(251,191,36,0.14)';
      btn.style.color = '#fbbf24';
      btn.style.boxShadow = 'none';
      btn.textContent = '⏳ Aguardando o outro — toque p/ iniciar já';
    } else if (cnt > 0) {
      btn.textContent = '🔄 Iniciar (' + cnt + ' pronto' + (cnt > 1 ? 's' : '') + ')';
    }
  }

  // ── State ──
  var state = {
    sets: [], // Array of { gamesP1, gamesP2, tiebreak: { p1, p2 } | null }
    currentGameP1: 0,  // Points in current game
    currentGameP2: 0,
    isTiebreak: false,  // Currently in tiebreak within a set
    isFinished: false,
    winner: null,
    // GSM config
    setsToWin: useSets ? (sc.setsToWin || 1) : 1,
    gamesPerSet: useSets ? (sc.gamesPerSet || 6) : 1,
    tiebreakEnabled: useSets ? (sc.tiebreakEnabled !== false) : false,
    tiebreakPoints: useSets ? (sc.tiebreakPoints || 7) : 7,
    tiebreakMargin: useSets ? (sc.tiebreakMargin || 2) : 2,
    superTiebreak: useSets ? (sc.superTiebreak === true) : false,
    superTiebreakPoints: useSets ? (sc.superTiebreakPoints || 10) : 10,
    countingType: useSets ? (sc.countingType || 'numeric') : 'numeric',
    // deuceRule: game-level 40-40 → AD. Prefer explicit deuceRule; fall back to legacy advantageRule.
    deuceRule: useSets ? (sc.deuceRule !== undefined ? sc.deuceRule === true : sc.advantageRule === true) : false,
    // twoPointAdvantage: set-level 2-game lead. Default ON.
    twoPointAdvantage: useSets ? (sc.twoPointAdvantage !== false) : false,
    isFixedSet: useSets && sc.fixedSet === true,
    fixedSetGames: useSets && sc.fixedSet ? (sc.fixedSetGames || sc.gamesPerSet || 6) : 0,
    tieRule: sc.tieRule || null, // 'extend'|'tiebreak'|'ask'|null (null = standard 2-game lead)
    tieRulePending: false, // true when waiting for user choice at tie
    // Serve tracking — progressive: defined at each player's first serve
    serveOrder: [],      // [{team:1|2, name:'Ana'}, ...] rotation cycle (2 for singles, 4 for doubles)
    serveSkipped: false, // user chose to skip serve tracking
    servePending: false, // true when waiting for user to pick a server
    secondServerPicked: false, // Tela 2 (duplas): 2º sacador (do outro time) já foi escolhido?
    totalGamesPlayed: 0, // total games completed (for serve rotation)
    gameLog: [],         // [{winner:1|2, serverName, serverTeam}] per completed normal game
    pointLog: []         // [{team:1|2, endSet:bool}] every point scored, set boundaries marked
  };
  var serveSlots = isDoubles ? 4 : 2; // total rotation length
  var _courtLeft = 1; // Which team is on the left side of the court (1 or 2)
  var _matchStartTime = null; // Timestamp when first point is scored
  var _matchEndTime = null;   // Timestamp when match finishes
  var _resultSaved = false;   // Guards idempotent save on restart/close
  // v1.7.5-beta: "Últimas Partidas" — função armazenada pelo render de stats;
  // chamada de _saveResult().then() APÓS o write confirmar, garantindo que a
  // partida recém terminada já está no Firestore antes de consultar.
  var _hydrateStatsLastMatchesSlotFn = null;
  var _statsSlotWriteConfirmed = false;

  // Initialize first set
  state.sets.push({ gamesP1: 0, gamesP2: 0, tiebreak: null });

  // v1.3.62-beta: synchronous initial state from history cache — avoids the
  // blank-scoring flash when opening a past match in viewOnly mode.
  // _casualOpenPastMatch passes opts.initialLiveState (already in memory),
  // so the first _render() at the bottom of this function immediately shows
  // the finished stats screen instead of the empty scoring UI.
  if (opts && opts.initialLiveState && opts.initialLiveState._ts) {
    var _ils = opts.initialLiveState;
    if (_ils.sets && _ils.sets.length) state.sets = _ils.sets;
    if (_ils.currentGameP1 != null) state.currentGameP1 = _ils.currentGameP1;
    if (_ils.currentGameP2 != null) state.currentGameP2 = _ils.currentGameP2;
    state.isTiebreak = !!_ils.isTiebreak;
    state.isFinished = !!_ils.isFinished;
    if (_ils.winner != null) state.winner = _ils.winner;
    state.tieRulePending = !!_ils.tieRulePending;
    if (_ils.totalGamesPlayed) state.totalGamesPlayed = _ils.totalGamesPlayed;
    if (_ils.tieRule) state.tieRule = _ils.tieRule;
    if (Array.isArray(_ils.serveOrder) && _ils.serveOrder.length) state.serveOrder = _ils.serveOrder;
    if (state.serveOrder.length > 0) state.secondServerPicked = true; // partida retomada → não re-perguntar
    state.serveSkipped = !!_ils.serveSkipped;
    if (Array.isArray(_ils.gameLog)) state.gameLog = _ils.gameLog.slice();
    if (Array.isArray(_ils.pointLog)) state.pointLog = _ils.pointLog.slice();
    if (_ils.courtLeft) _courtLeft = _ils.courtLeft;
    if (_ils.matchStartTime) _matchStartTime = _ils.matchStartTime;
    if (_ils.matchEndTime) _matchEndTime = _ils.matchEndTime;
    if (Array.isArray(_ils.p1Players)) {
      for (var _ilsI = 0; _ilsI < _ils.p1Players.length && _ilsI < p1Players.length; _ilsI++) p1Players[_ilsI] = _ils.p1Players[_ilsI];
    }
    if (Array.isArray(_ils.p2Players)) {
      for (var _ilsJ = 0; _ilsJ < _ils.p2Players.length && _ilsJ < p2Players.length; _ilsJ++) p2Players[_ilsJ] = _ils.p2Players[_ilsJ];
    }
    _localizeRoleLabels();
  }

  // Som: apito de árbitro ao ABRIR uma partida nova pra jogar ao vivo. Só numa
  // partida realmente nova — não em modo visualização, não retomando estado
  // salvo (initialLiveState/casualDocId), não já finalizada, sem pontos ainda.
  if (window._sound && !(opts && opts.viewOnly) && !(opts && opts.initialLiveState)
      && !(opts && opts.casualDocId) && !state.isFinished && !_matchStartTime) {
    window._sound('apito');
  }

  // If joining an active match, try to load initial liveState from Firestore immediately
  var _initDocId = isCasual && opts ? opts.casualDocId : null;
  if (_initDocId && window.FirestoreDB && window.FirestoreDB.db) {
    (function() {
      try {
        window.FirestoreDB.db.collection('casualMatches').doc(_initDocId).get().then(function(doc) {
          if (doc.exists && doc.data().liveState && doc.data().liveState._ts) {
            var remote = doc.data().liveState;
            // Apply remote state
            state.sets = remote.sets || state.sets;
            state.currentGameP1 = remote.currentGameP1 != null ? remote.currentGameP1 : 0;
            state.currentGameP2 = remote.currentGameP2 != null ? remote.currentGameP2 : 0;
            state.isTiebreak = !!remote.isTiebreak;
            state.isFinished = !!remote.isFinished;
            state.winner = remote.winner != null ? remote.winner : null;
            state.tieRulePending = !!remote.tieRulePending;
            state.totalGamesPlayed = remote.totalGamesPlayed || 0;
            state.tieRule = remote.tieRule || state.tieRule;
            if (Array.isArray(remote.serveOrder) && remote.serveOrder.length > 0) { state.serveOrder = remote.serveOrder; state.secondServerPicked = true; }
            state.serveSkipped = !!remote.serveSkipped;
            if (Array.isArray(remote.gameLog)) state.gameLog = remote.gameLog.slice();
            if (Array.isArray(remote.pointLog)) state.pointLog = remote.pointLog.slice();
            if (remote.courtLeft) _courtLeft = remote.courtLeft;
            if (remote.matchStartTime) _matchStartTime = remote.matchStartTime;
            if (remote.matchEndTime) _matchEndTime = remote.matchEndTime;
            if (Array.isArray(remote.p1Players)) {
              for (var i = 0; i < remote.p1Players.length && i < p1Players.length; i++) p1Players[i] = remote.p1Players[i];
            }
            if (Array.isArray(remote.p2Players)) {
              for (var j = 0; j < remote.p2Players.length && j < p2Players.length; j++) p2Players[j] = remote.p2Players[j];
            }
            // Re-localize role labels from the viewer's perspective — the host
            // pushes its own perspective (e.g. "Parceiro" for their partner)
            // and without this, every client would see the host's labels.
            _localizeRoleLabels();
            _render();
          }
        });
      } catch(e) {}
    })();
  }

  // Check if this is the deciding set (super tiebreak)
  function _isDecidingSet() {
    var totalSets = state.setsToWin * 2 - 1;
    return state.superTiebreak && state.sets.length === totalSets;
  }

  // Get current set
  function _currentSet() {
    return state.sets[state.sets.length - 1];
  }

  // Count sets won (includeAll=true counts the current/last set too — used when set just finished)
  function _setsWon(player, includeAll) {
    var count = 0;
    var limit = includeAll ? state.sets.length : state.sets.length - 1;
    for (var i = 0; i < limit; i++) {
      var s = state.sets[i];
      if (player === 1 && s.gamesP1 > s.gamesP2) count++;
      if (player === 2 && s.gamesP2 > s.gamesP1) count++;
    }
    return count;
  }

  // Format game points for display
  function _formatGamePoint(pts, oppPts, isTb) {
    if (isTb) return String(pts);
    if (state.countingType === 'tennis' && !state.isFixedSet) {
      // Tennis counting: 0, 15, 30, 40, AD
      if (pts >= 3 && oppPts >= 3) {
        if (state.deuceRule) {
          if (pts === oppPts) return '40';
          if (pts > oppPts) return 'AD';
          return '40';
        }
        return '40'; // No deuce: sudden death (golden point) at 40-40
      }
      var map = [0, 15, 30, 40];
      return String(pts < 4 ? map[pts] : 40);
    }
    return String(pts);
  }

  // Check if game is won
  function _checkGameWon() {
    var p1 = state.currentGameP1;
    var p2 = state.currentGameP2;

    if (state.isTiebreak || _isDecidingSet()) {
      // Tiebreak rules
      var tbPts = _isDecidingSet() ? state.superTiebreakPoints : state.tiebreakPoints;
      var margin = state.tiebreakMargin || 2;
      if (p1 >= tbPts && p1 - p2 >= margin) return 1;
      if (p2 >= tbPts && p2 - p1 >= margin) return 2;
      return 0;
    }

    if (state.isFixedSet) {
      // Fixed set: just count points, no game concept within
      var total = state.fixedSetGames;
      if (p1 + p2 >= total) {
        return p1 > p2 ? 1 : (p2 > p1 ? 2 : 0);
      }
      return 0;
    }

    if (state.countingType === 'tennis') {
      if (!state.deuceRule) {
        // Golden point / sudden death — first to 4 points wins, NO 2-point
        // lead required. At 40-40 (3-3), the next point closes the game.
        if (p1 >= 4) return 1;
        if (p2 >= 4) return 2;
        return 0;
      }
      // AD rule: need 4 points AND 2-point lead (continues past 40-40 with AD)
      if (p1 >= 4 && p1 - p2 >= 2) return 1;
      if (p2 >= 4 && p2 - p1 >= 2) return 2;
      return 0;
    }

    // Numeric counting: each point IS a game — always return winner after 1 point
    if (p1 > p2) return 1;
    if (p2 > p1) return 2;
    return 0;
  }

  // Check if set is won
  function _checkSetWon() {
    var cs = _currentSet();
    var g = state.gamesPerSet;

    if (state.isFixedSet) return 0; // Handled in _checkGameWon
    if (_isDecidingSet()) return 0; // handled by tiebreak game

    // twoPointAdvantage OFF: set ends as soon as someone reaches g games —
    // e.g. a 6-game set ends at 5-6 with no extension, no tiebreak.
    if (state.twoPointAdvantage === false) {
      if (cs.gamesP1 >= g) return 1;
      if (cs.gamesP2 >= g) return 2;
      return 0;
    }

    // tieRule logic: at (g-1)-(g-1) and every subsequent tie, ask or apply rule
    // e.g. at 5-5 in a 6-game set, 2-game lead is impossible with 1 more game
    if (state.tieRule && cs.gamesP1 === cs.gamesP2 && cs.gamesP1 >= g - 1) {
      var rule = state.tieRule;
      if (rule === 'ask' && !state.tieRulePending) {
        // Pause and ask the user
        state.tieRulePending = true;
        _showTieRuleDialog();
        return -2; // Signal: paused, waiting for user choice
      }
      if (rule === 'extend') {
        // Prorrogar: play on with 2-game lead required
        // Don't enter tiebreak, just continue — standard 2-game lead check below
      }
      if (rule === 'tiebreak') {
        state.isTiebreak = true;
        state.currentGameP1 = 0;
        state.currentGameP2 = 0;
        return -1;
      }
      if (rule === 'supertiebreak') {
        state.isTiebreak = true;
        state.tiebreakPoints = state.superTiebreakPoints || 10;
        state.currentGameP1 = 0;
        state.currentGameP2 = 0;
        return -1;
      }
    }

    // tieRule 'extend': standard 2-game lead — whoever reaches 2 games ahead wins
    if (state.tieRule === 'extend') {
      if (cs.gamesP1 >= g && cs.gamesP1 - cs.gamesP2 >= 2) return 1;
      if (cs.gamesP2 >= g && cs.gamesP2 - cs.gamesP1 >= 2) return 2;
      return 0;
    }

    // Standard rules: first to 'g' games with 2-game lead, or tiebreak at (g-1)-(g-1)
    if (cs.gamesP1 >= g && cs.gamesP1 - cs.gamesP2 >= 2) return 1;
    if (cs.gamesP2 >= g && cs.gamesP2 - cs.gamesP1 >= 2) return 2;

    // Standard tiebreak trigger at (g-1)-(g-1) — e.g. 5-5 in a 6-game set.
    // Consistente com rules.js (exibe "TB em 5-5, final 6-5") e com o save
    // path em _saveSetResult que detecta TB a (g-1)-(g-1). Vencedor do TB
    // recebe +1 game → set termina 6-5.
    if (state.tiebreakEnabled && cs.gamesP1 === g - 1 && cs.gamesP2 === g - 1) {
      state.isTiebreak = true;
      state.currentGameP1 = 0;
      state.currentGameP2 = 0;
      return -1;
    }

    return 0;
  }

  // Dialog shown when tieRule is 'ask' and games are tied
  function _showTieRuleDialog(viewerCanDecide) {
    var cs = _currentSet();
    var tiedAt = cs.gamesP1; // Both are equal
    var contentEl = document.getElementById('live-score-content');
    if (!contentEl) return;
    var bodyHtml;
    if (viewerCanDecide === false) {
      // Non-player viewers wait for one of the registered players in the match to decide
      bodyHtml =
        '<div style="display:flex;flex-direction:column;gap:10px;align-items:center;padding:4px 6px;">' +
          '<div style="font-size:1.8rem;">⏳</div>' +
          '<div style="font-size:0.9rem;font-weight:700;color:var(--text-bright);text-align:center;">Aguardando decisão dos jogadores</div>' +
          '<div style="font-size:0.72rem;color:var(--text-muted);text-align:center;line-height:1.4;">Somente jogadores cadastrados envolvidos na partida podem escolher entre prorrogar ou tie-break.</div>' +
        '</div>';
    } else {
      bodyHtml =
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<button onclick="window._liveResolveTie(\'extend\')" style="padding:14px;border-radius:12px;border:2px solid rgba(16,185,129,0.3);background:rgba(16,185,129,0.08);cursor:pointer;text-align:left;">' +
            '<div style="font-size:0.88rem;font-weight:700;color:#10b981;">Prorrogar</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">Continuar até vantagem de 2 games</div>' +
          '</button>' +
          '<button onclick="window._liveResolveTie(\'tiebreak\')" style="padding:14px;border-radius:12px;border:2px solid rgba(192,132,252,0.3);background:rgba(192,132,252,0.08);cursor:pointer;text-align:left;">' +
            '<div style="font-size:0.88rem;font-weight:700;color:#c084fc;">Tie-break (7 pts)</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">Tie-break a 7 pontos com margem de 2</div>' +
          '</button>' +
        '</div>';
    }
    contentEl.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:1rem;">' +
        '<div style="background:var(--bg-card,#1e293b);border-radius:16px;border:1px solid rgba(192,132,252,0.3);padding:1.5rem;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
          '<div style="text-align:center;margin-bottom:1rem;">' +
            '<div style="font-size:1.5rem;margin-bottom:4px;">⚖️</div>' +
            '<div style="font-size:1rem;font-weight:800;color:var(--text-bright);">Empate ' + tiedAt + ' × ' + tiedAt + '</div>' +
            '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">Como desempatar?</div>' +
          '</div>' +
          bodyHtml +
        '</div>' +
      '</div>';
  }

  // Handler for tie rule dialog choice — restricted to registered players in the match
  // (casual matches bypass uid check — the match creator is always a player)
  window._liveResolveTie = function(rule) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!isCasual) {
      if (cu && cu.uid) {
        var names = p1Players.concat(p2Players);
        var ok = false;
        for (var i = 0; i < names.length; i++) {
          var mm = _playerMeta[names[i]];
          if (mm && mm.uid === cu.uid) { ok = true; break; }
        }
        if (!ok) { _render(); return; }
      } else {
        // Not logged in — can't make the decision
        _render();
        return;
      }
    }
    state.tieRulePending = false;

    if (rule === 'extend') {
      // v4.5.42: PRORROGAR é POR EMPATE — NÃO fixa 'extend'. Mantém 'ask' para
      // REPERGUNTAR no próximo empate (6-6, 7-7, 8-8, … até alguém abrir 2 de
      // vantagem ou ativar o tie-break). Só zera o pending e o jogo continua;
      // o check de 2-game-lead (padrão) segue funcionando com tieRule='ask'.
      // (antes: state.tieRule='extend' travava a pergunta em definitivo.)
    } else if (rule === 'tiebreak') {
      state.tieRule = 'tiebreak';
      state.isTiebreak = true;
      state.currentGameP1 = 0;
      state.currentGameP2 = 0;
    }
    _render();
    _watchNotify(); // v4.5.43: sincroniza o relógio após a decisão (some o prompt)
  };

  // Check if match is won (called from _finishSet, so include the just-finished set)
  function _checkMatchWon() {
    if (_setsWon(1, true) >= state.setsToWin) return 1;
    if (_setsWon(2, true) >= state.setsToWin) return 2;
    return 0;
  }

  // v1.0.36-beta: snapshot pra global undo (ver window._liveScoreUndoLastPoint).
  // Captura o estado COMPLETO antes de qualquer mutação. Permite desfazer
  // ponto-a-ponto através de transições de game/set/finish — diferente do
  // _liveScoreMinus que só decrementa o game corrente. Cenário reportado:
  // "num jogo 40-40 o ponto vitorioso ser marcado por acidente para o lado
  // errado e atualmente não temos como corrigir". Agora tem.
  // Limita a 30 snapshots (~150KB max em memória) — rolling window.
  function _makeUndoSnapshot() {
    var stateCopy = {};
    for (var k in state) {
      if (Object.prototype.hasOwnProperty.call(state, k) && k !== '_undoSnapshots') {
        stateCopy[k] = state[k];
      }
    }
    return JSON.stringify({
      state: stateCopy,
      matchStartTime: _matchStartTime,
      matchEndTime: _matchEndTime
    });
  }

  // Add point to player
  function _addPoint(player) {
    if (state.isFinished) return;
    if (state.tieRulePending) return; // Waiting for tie resolution dialog
    if (_needsServePick()) return; // Waiting for serve selection

    // v1.0.36-beta: snapshot ANTES de qualquer mutação — primeira coisa após
    // os early returns. Garante que undo restaura exatamente pra antes do
    // tap acidental, mesmo que o ponto tenha disparado fim de game/set/match.
    if (!state._undoSnapshots) state._undoSnapshots = [];
    state._undoSnapshots.push(_makeUndoSnapshot());
    if (state._undoSnapshots.length > 30) state._undoSnapshots.shift();

    // Haptic feedback — pulso curto a cada ponto. Confirma tap sem precisar
    // olhar a tela (útil com celular na trave). Android + iPhone (iOS 17.4+).
    if (window._haptic) window._haptic('tap');

    // Track match start time on first point
    if (!_matchStartTime) {
      _matchStartTime = Date.now();
      // v1.0.59-beta: GA4 — só pra partidas casuais (não polui com tournament matches)
      if (isCasual) {
        try {
          if (typeof window._trackCasualMatchStarted === 'function') {
            window._trackCasualMatchStarted({
              sport: (opts && opts.sportName) || '',
              teamSize: isDoubles ? 2 : 1
            });
          }
        } catch (_e) {}
      }
    }

    // Capture context BEFORE incrementing so pointLog reflects the state at which this point was contested
    var _p1Before = state.currentGameP1;
    var _p2Before = state.currentGameP2;
    var _wasTiebreak = !!state.isTiebreak;
    var _srvNow = (typeof _getCurrentServer === 'function') ? _getCurrentServer() : null;

    if (player === 1) state.currentGameP1++;
    else state.currentGameP2++;

    // Log every point scored with rich context for analytics, including the
    // timestamp so we can compute time-per-point analytics (avg/longest/fastest
    // interval, longest rally gap, etc.).
    // v1.0.35-beta: Correção rápida via STACK de timestamps (não mais single-
    // shot). Bug reportado: usuário marca 2 pontos pro time errado (15+30),
    // descobre, desfaz os 2, marca 2 pra time certo (15+30). Score corrige,
    // mas timing dos novos pontos era Date.now() do clique de correção —
    // intervalos ficavam ~0s. Agora _recentUndoStack guarda timestamps em
    // ordem cronológica reversa (LIFO); cada novo _addPoint pop'a o mais
    // antigo que ainda esteja válido (stack-recent < 15s, item original < 30s
    // pra evitar contaminação inter-rally). Funciona pra N undos consecutivos
    // de um time, seguidos de N adds pro outro — intervalos preservados.
    var _pointTs = Date.now();
    if (Array.isArray(state._recentUndoStack) && state._recentUndoStack.length > 0) {
      // Limpa entradas stale do topo (mais recente) — se o último undo foi
      // há mais de 15s, considera o stack inteiro stale e descarta.
      var lastEntry = state._recentUndoStack[state._recentUndoStack.length - 1];
      if (_pointTs - lastEntry.undoneAt > 15000) {
        state._recentUndoStack.length = 0;
      } else {
        // LIFO: o último undo é o mais "novo" cronologicamente. Mas pra
        // recuperar timestamps na ordem que o usuário pretendia (15 primeiro,
        // 30 depois), precisamos pegar o mais ANTIGO (bottom of stack).
        // Ex: undo 30→push T2; undo 15→push T1. Stack=[T2, T1].
        // Add 15 (correto)→ shift T2... espera, queremos T1 primeiro!
        // Cuidado: o usuário desfaz na ORDEM REVERSA (último primeiro), mas
        // quer recuperar na ORDEM ORIGINAL. Stack após "undo 30, undo 15" é
        // [T2, T1] (push 30 antes, push 15 depois). Pra recuperar T1 primeiro
        // (15 correto agora), pop. Pra T2 depois (30 correto), pop de novo.
        // Confere: pop = retira do topo = último pushed = T1. ✓
        var recovered = state._recentUndoStack.pop();
        // Validar que o ponto original não é absurdamente antigo (>30s do
        // momento atual) — caso contrário o intervalo sairia distorcido.
        if (recovered && recovered.ts && (_pointTs - recovered.ts) < 30000) {
          _pointTs = recovered.ts;
        }
      }
    }
    // Compat: limpa o single-shot legado se ainda existir.
    state._recentUndoTs = null;
    state.pointLog.push({
      team: player,
      server: _srvNow ? _srvNow.name : null,
      serverTeam: _srvNow ? _srvNow.team : null,
      p1Before: _p1Before,
      p2Before: _p2Before,
      isTiebreak: _wasTiebreak,
      t: _pointTs
    });

    if (!useSets || state.isFixedSet) {
      // Simple scoring or fixed set: each tap is 1 point
      if (state.isFixedSet) {
        var cs = _currentSet();
        if (player === 1) cs.gamesP1 = state.currentGameP1;
        else cs.gamesP2 = state.currentGameP2;
        // Check if fixed set is done
        if (state.currentGameP1 + state.currentGameP2 >= state.fixedSetGames) {
          if (state.currentGameP1 === state.currentGameP2 && state.tiebreakEnabled) {
            // Tie in fixed set → go to tiebreak
            state.isTiebreak = true;
            state.currentGameP1 = 0;
            state.currentGameP2 = 0;
          } else {
            var winner = state.currentGameP1 > state.currentGameP2 ? 1 : 2;
            _finishSet(winner);
          }
        }
      } else if (!useSets) {
        // Simple mode: just track score
        _render();
        return;
      }
      _render();
      return;
    }

    // GSM: check if game is won
    var gameWinner = _checkGameWon();
    if (gameWinner > 0) {
      // Game won — add to set games
      var cs = _currentSet();
      if (state.isTiebreak) {
        // Tiebreak won → set is won by this player
        cs.tiebreak = { p1: state.currentGameP1, p2: state.currentGameP2 };
        if (gameWinner === 1) cs.gamesP1++;
        else cs.gamesP2++;
        state.isTiebreak = false;
        _finishSet(gameWinner);
      } else if (_isDecidingSet()) {
        // Super tiebreak won
        cs.tiebreak = { p1: state.currentGameP1, p2: state.currentGameP2 };
        if (gameWinner === 1) cs.gamesP1++;
        else cs.gamesP2++;
        _finishSet(gameWinner);
      } else {
        // Normal game won — log server and winner for stats
        var _srvIdx = state.serveOrder.length > 0 ? (state.totalGamesPlayed % state.serveOrder.length) : -1;
        var _srvEntry = _srvIdx >= 0 ? state.serveOrder[_srvIdx] : null;
        state.gameLog.push({
          winner: gameWinner,
          serverName: _srvEntry ? _srvEntry.name : null,
          serverTeam: _srvEntry ? _srvEntry.team : null
        });
        if (gameWinner === 1) cs.gamesP1++;
        else cs.gamesP2++;
        state.currentGameP1 = 0;
        state.currentGameP2 = 0;
        state.totalGamesPlayed++;

        // Check if set is won
        var setResult = _checkSetWon();
        if (setResult > 0) {
          _finishSet(setResult);
        } else {
          // Som: ganhou um game e o set continua → toque curto "Game".
          // setResult === -1 = entrou em tiebreak (game foi ganho, toca);
          // setResult === -2 = aguardando diálogo de regra de empate (não toca).
          if (setResult !== -2 && window._sound) window._sound('game');
        }
      }
    }

    _render();
  }

  function _finishSet(setWinner) {
    // Mark the last point as set-ending (for momentum graph set boundaries)
    if (state.pointLog.length > 0) state.pointLog[state.pointLog.length - 1].endSet = true;
    state.currentGameP1 = 0;
    state.currentGameP2 = 0;
    state.isTiebreak = false;

    // Check match winner
    var matchWinner = _checkMatchWon();
    if (matchWinner > 0 || (!useSets && state.isFixedSet)) {
      // For fixed set: check directly
      if (state.isFixedSet) matchWinner = setWinner;
      state.isFinished = true;
      state.winner = matchWinner;
      _matchEndTime = Date.now();
      // Som: partida vencida no placar ao vivo → torcida (crescendo de gol).
      if (window._sound) window._sound('vitoria');
      // v2.1.39: TORNEIO — grava o resultado na chave AUTOMATICAMENTE no último
      // ponto (sem botão "Confirmar"). Idempotente via _resultSaved. keepOpen
      // mantém o resumo/estatísticas na tela; o "Voltar" leva à chave já gravada.
      if (!isCasual) { try { _saveResult({ keepOpen: true, silent: true }); } catch (e) {} }
      // v1.0.59-beta: GA4 — só pra partidas casuais
      if (isCasual) {
        try {
          if (typeof window._trackCasualMatchFinished === 'function') {
            var _durMin = (_matchStartTime && _matchEndTime)
              ? Math.round((_matchEndTime - _matchStartTime) / 60000)
              : 0;
            window._trackCasualMatchFinished({
              sport: (opts && opts.sportName) || '',
              durationMin: _durMin
            });
          }
        } catch (_e) {}
        // Trophy hook — partida casual encerrada
        try {
          if (typeof window._trophyOnCasualMatchFinished === 'function') {
            window._trophyOnCasualMatchFinished({
              sport: (opts && opts.sportName) || '',
              winner: matchWinner,
              wasComeback: false  // futuramente pode detectar via pointLog
            });
          }
        } catch (_e2) {}
        // v1.6.11-beta: AUTOSAVE crítico — sem isso, o doc Firestore fica eternamente
        // com status:'active' se o usuário fechar o app na tela de stats sem clicar
        // Fechar/Recomeçar/Desparear. Partida não aparece em "últimas partidas"
        // porque o filtro é status==='finished'. Antes só salvava por ação manual.
        // Fix bate em ambos os clientes (host + guest) — idempotente via _resultSaved.
        if (!_resultSaved) {
          try { _saveResult({ keepOpen: true, silent: true }); } catch (_e3) {}
        }
      }
    } else {
      // Start new set
      state.sets.push({ gamesP1: 0, gamesP2: 0, tiebreak: null });
      // Som: set fechado e a partida continua → fanfarra "Set".
      if (window._sound) window._sound('set');
    }
  }

  // Undo last point
  function _undoPoint() {
    // Simple undo: remove last point. For complex GSM state, we use a history approach.
    // For now, decrement the higher score or last-incremented
    if (state.isFinished) return;
    // Cannot undo if both are 0 in current game
    if (state.currentGameP1 === 0 && state.currentGameP2 === 0) {
      // Try to undo a set (go back to previous set's last game)
      // This is complex — for MVP, just ignore
      return;
    }
    // We need to track history for proper undo. For MVP, just warn.
    showNotification(_t('bui.undo'), _t('bui.undoMsg'), 'info');
  }

  // Build a self-contained record of this finished match and persist it to each
  // registered player's matchHistory subcollection so the stats survive deletion
  // of the tournament / casual match. Used by both casual and tournament paths.
  function _buildAndPersistMatchRecord(extraContext) {
    // v1.3.63-beta: abandoned/force-finished matches (no clear winner) are
    // never persisted — they would pollute stats with incomplete data.
    if (state.winner !== 1 && state.winner !== 2) return;

    // Record is built regardless of Firestore availability — the localStorage
    // v2 cache must be written for every casual match so the stats modal can
    // render the full detailed metric set even when Firestore writes fail.
    var pts = state.pointLog || [];
    var gmL = state.gameLog || [];
    var team = { 1: { points:0, games:0, sets:0, holdServed:0, held:0, longestStreak:0, biggestLead:0,
                      servePtsPlayed:0, servePtsWon:0, receivePtsPlayed:0, receivePtsWon:0,
                      deucePtsPlayed:0, deucePtsWon:0, breaks:0 },
                 2: { points:0, games:0, sets:0, holdServed:0, held:0, longestStreak:0, biggestLead:0,
                      servePtsPlayed:0, servePtsWon:0, receivePtsPlayed:0, receivePtsWon:0,
                      deucePtsPlayed:0, deucePtsWon:0, breaks:0 } };
    var curStreak = { 1:0, 2:0 }, cum = 0;
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i];
      team[pt.team].points++;
      if (pt.team === 1) { curStreak[1]++; curStreak[2]=0; cum++; }
      else { curStreak[2]++; curStreak[1]=0; cum--; }
      if (curStreak[pt.team] > team[pt.team].longestStreak) team[pt.team].longestStreak = curStreak[pt.team];
      if (cum > team[1].biggestLead) team[1].biggestLead = cum;
      if (-cum > team[2].biggestLead) team[2].biggestLead = -cum;
      if (pt.serverTeam === 1 || pt.serverTeam === 2) {
        var srvT = pt.serverTeam, recT = srvT === 1 ? 2 : 1;
        team[srvT].servePtsPlayed++; team[recT].receivePtsPlayed++;
        if (pt.team === srvT) team[srvT].servePtsWon++;
        else team[recT].receivePtsWon++;
        if (!pt.isTiebreak && pt.p1Before === 3 && pt.p2Before === 3) {
          team[1].deucePtsPlayed++; team[2].deucePtsPlayed++;
          team[pt.team].deucePtsWon++;
        }
      }
    }
    for (var g = 0; g < gmL.length; g++) {
      var ge = gmL[g];
      team[ge.winner].games++;
      if (ge.serverTeam && ge.winner !== ge.serverTeam) team[ge.winner].breaks++;
    }
    for (var s = 0; s < state.sets.length; s++) {
      var ss = state.sets[s];
      if (ss.gamesP1 > ss.gamesP2) team[1].sets++;
      else if (ss.gamesP2 > ss.gamesP1) team[2].sets++;
    }
    // Per-player stats
    var plrs = {};
    var allNames = p1Players.concat(p2Players);
    for (var pi = 0; pi < allNames.length; pi++) {
      plrs[allNames[pi]] = { name: allNames[pi], team: pi < p1Players.length ? 1 : 2,
        served:0, held:0, longestHoldStreak:0, _streak:0, servePtsPlayed:0, servePtsWon:0 };
    }
    for (var gg = 0; gg < gmL.length; gg++) {
      var en = gmL[gg];
      if (!en.serverName || !plrs[en.serverName]) continue;
      var sp = plrs[en.serverName];
      sp.served++;
      if (en.winner === en.serverTeam) {
        sp.held++; sp._streak++;
        if (sp._streak > sp.longestHoldStreak) sp.longestHoldStreak = sp._streak;
      } else sp._streak = 0;
    }
    for (var pj = 0; pj < pts.length; pj++) {
      var p2pt = pts[pj];
      if (!p2pt.server || !plrs[p2pt.server]) continue;
      plrs[p2pt.server].servePtsPlayed++;
      if (p2pt.team === p2pt.serverTeam) plrs[p2pt.server].servePtsWon++;
    }
    // Strip internal flags before persisting
    Object.keys(plrs).forEach(function(k) { delete plrs[k]._streak; });

    // Player list with uid/photo (for each registered participant)
    var recordPlayers = [];
    for (var k = 0; k < allNames.length; k++) {
      var nm = allNames[k];
      var meta = _playerMeta[nm] || {};
      recordPlayers.push({
        name: nm,
        team: k < p1Players.length ? 1 : 2,
        uid: meta.uid || null,
        photoURL: meta.photoURL || null
      });
    }

    // Build score summary string (e.g. "6-4 3-6 7-6")
    var scoreSummaryStr = '';
    if (useSets && !state.isFixedSet) {
      for (var si2 = 0; si2 < state.sets.length; si2++) {
        var _ss = state.sets[si2];
        scoreSummaryStr += (typeof window._formatSetCombined === 'function')
          ? window._formatSetCombined(_ss, { html: false })
          : (_ss.gamesP1 + '-' + _ss.gamesP2);
        if (si2 < state.sets.length - 1) scoreSummaryStr += ' ';
      }
    } else {
      var sP1 = state.isFixedSet && state.sets[0] ? state.sets[0].gamesP1 : state.currentGameP1;
      var sP2 = state.isFixedSet && state.sets[0] ? state.sets[0].gamesP2 : state.currentGameP2;
      scoreSummaryStr = sP1 + '-' + sP2;
    }

    var startT = _matchStartTime || null;
    var endT = _matchEndTime || Date.now();
    var ctx = extraContext || {};

    // Time-per-point analytics from pointLog timestamps.
    // v1.3.31-beta: usa helper compartilhado window._computeMatchTimeStats
    // que aplica detecção de aquecimento inicial (1º intervalo > 2× mediana
    // dos demais → tratado como warmup, excluído de avg/max).
    var timeStatsRec = null;
    var ptsWithT = (state.pointLog || []).filter(function(p) { return !!p.t; });
    if (ptsWithT.length >= 2) {
      var recIntervals = [];
      var prevTs = startT;
      for (var rti = 0; rti < ptsWithT.length; rti++) {
        if (prevTs) recIntervals.push(ptsWithT[rti].t - prevTs);
        prevTs = ptsWithT[rti].t;
      }
      var rec = window._computeMatchTimeStats(recIntervals);
      if (rec) {
        timeStatsRec = {
          avgPointMs: rec.avgMs,
          longestPointMs: rec.maxMs,
          shortestPointMs: rec.minMs,
          pointsWithTime: ptsWithT.length,
          outlierFilteredCount: rec.outlierFilteredCount,
          warmupSkipped: rec.warmupSkipped,
          warmupMs: rec.warmupMs
        };
      }
    }

    var record = {
      matchId: ctx.matchId || ('m_' + Date.now() + '_' + Math.floor(Math.random() * 1e6)),
      matchType: ctx.matchType || (isCasual ? 'casual' : 'tournament'),
      tournamentId: ctx.tournamentId || null,
      tournamentName: ctx.tournamentName || null,
      sport: ctx.sport || (opts && opts.sportName) || '',
      isDoubles: isDoubles,
      finishedAt: new Date(endT).toISOString(),
      startedAt: startT ? new Date(startT).toISOString() : null,
      durationMs: startT ? (endT - startT) : null,
      timeStats: timeStatsRec,
      players: recordPlayers,
      playerUids: recordPlayers.filter(function(p) { return !!p.uid; }).map(function(p) { return p.uid; }),
      winnerTeam: state.winner || 0,
      scoreSummary: scoreSummaryStr,
      sets: state.sets.map(function(_s) {
        var e = { gamesP1: _s.gamesP1, gamesP2: _s.gamesP2 };
        if (_s.tiebreak) e.tiebreak = _s.tiebreak;
        return e;
      }),
      stats: { team1: team[1], team2: team[2] },
      playerStats: plrs
    };
    if (typeof window.FirestoreDB !== 'undefined' && window.FirestoreDB.saveUserMatchRecords) {
      try {
        var p = window.FirestoreDB.saveUserMatchRecords(record);
        if (p && typeof p.catch === 'function') p.catch(function(){});
      } catch(e) {}
    }
    // Mirror casual records into localStorage so the hero-box "Minhas
    // estatísticas" view can render the full detailed metric set even when
    // Firestore matchHistory is unavailable (no uid, permission denied,
    // offline). Same schema as Firestore records — consumed by
    // _renderPersistentMatchStats in tournaments-analytics.js.
    if (record.matchType === 'casual') {
      try {
        var histKey = 'scoreplace_casual_history_v2';
        var hist2 = JSON.parse(localStorage.getItem(histKey) || '[]');
        hist2.unshift(record);
        if (hist2.length > 100) hist2 = hist2.slice(0, 100);
        localStorage.setItem(histKey, JSON.stringify(hist2));
      } catch(e) {}
    }
  }

  // Save result to match
  // opts.keepOpen  — don't remove the overlay (used by restart path)
  // opts.silent    — don't show the "Resultado salvo" toast
  function _saveResult(opts) {
    opts = opts || {};
    if (_resultSaved) {
      if (!opts.keepOpen) {
        var _ovDup = document.getElementById('live-scoring-overlay');
        if (_ovDup) _ovDup.remove();
      }
      return;
    }
    _resultSaved = true;
    if (isCasual) {
      // Casual mode: show result, save to Firestore, and close
      var winnerName = state.winner === 1 ? p1Name : (state.winner === 2 ? p2Name : 'Empate');
      if (!opts.keepOpen) {
        var ov = document.getElementById('live-scoring-overlay');
        if (ov) ov.remove();
      }
      // Build summary for casual
      var summary = '';
      var setsData = null;
      if (useSets) {
        setsData = [];
        for (var si = 0; si < state.sets.length; si++) {
          var ss = state.sets[si];
          summary += (typeof window._formatSetCombined === 'function')
            ? window._formatSetCombined(ss, { html: false })
            : (ss.gamesP1 + '-' + ss.gamesP2);
          if (si < state.sets.length - 1) summary += '  ';
          var setEntry = { gamesP1: ss.gamesP1, gamesP2: ss.gamesP2 };
          if (ss.tiebreak) setEntry.tiebreak = { pointsP1: ss.tiebreak.p1, pointsP2: ss.tiebreak.p2 };
          setsData.push(setEntry);
        }
      } else {
        summary = state.currentGameP1 + ' × ' + state.currentGameP2;
      }
      if (!opts.silent) showNotification(_t('bui.matchClosed'), (state.winner === 0 ? winnerName : _t('bui.matchWon', {winner: winnerName})) + ' — ' + summary, 'success');
      // Save to casual match history in localStorage
      try {
        var hist = JSON.parse(localStorage.getItem('scoreplace_casual_history') || '[]');
        hist.unshift({ p1: p1Name, p2: p2Name, winner: winnerName, summary: summary, date: new Date().toISOString(), sport: opts.sportName || '' });
        if (hist.length > 50) hist = hist.slice(0, 50);
        localStorage.setItem('scoreplace_casual_history', JSON.stringify(hist));
      } catch(e) {}
      // Save to Firestore if we have a doc ID.
      // IMPORTANT: do NOT declare a local `var _casualDocId` here — that would
      // shadow the outer closure variable (set at _openLiveScoring call time)
      // and cause the Firestore update to be skipped whenever _saveResult is
      // called without opts.casualDocId (e.g. from _liveScoreRestart / Desparear).
      // Use the outer _casualDocId from the _openLiveScoring closure directly.
      if (typeof window.FirestoreDB !== 'undefined' && window.FirestoreDB.db) {
        // Compute result payload unconditionally so it's available for both
        // the update path (_casualDocId exists) and the fallback create path.
        var resultData = {
          winner: state.winner, // 1, 2, or 0
          summary: summary,
          p1Score: useSets ? null : state.currentGameP1,
          p2Score: useSets ? null : state.currentGameP2
        };
        if (setsData) resultData.sets = setsData;
        var _plForUids = (opts && opts.players && opts.players.length) ? opts.players : _casualPlayers;
        var playerUids = _plForUids.filter(function(p) { return !!p.uid; }).map(function(p) { return p.uid; });
        try { clearTimeout(_syncTimer); } catch(_e) {}
        var _finalLiveState = null;
        try { _finalLiveState = _serializeState(); } catch(_e) {}
        // v2.2.22-beta: estabelece o baseline de sync NO MOMENTO do encerramento
        // local. Sem isto, um snapshot 'active' em trânsito (de um ponto anterior,
        // _ts menor) chegava DEPOIS do finish e revertia o estado finalizado via
        // o branch "Jogar Novamente" (status==='active' && state.isFinished) que
        // não tinha guarda de _ts — sintoma: "marquei o match point e nada
        // aconteceu". Com _lastSyncTs = _ts do finish, qualquer 'active' mais
        // antigo é ignorado; só um Jogar Novamente real (com _ts maior) reverte.
        if (_finalLiveState && _finalLiveState._ts) { _lastSyncTs = _finalLiveState._ts; }
        var _playersForUpdate = [];
        var _allForUpdate = p1Players.concat(p2Players);
        for (var _upi = 0; _upi < _allForUpdate.length; _upi++) {
          var _upnm = _allForUpdate[_upi];
          var _upmt = _playerMeta[_upnm] || {};
          _playersForUpdate.push({
            name: _upnm,
            team: _upi < p1Players.length ? 1 : 2,
            uid: _upmt.uid || null,
            photoURL: _upmt.photoURL || null
          });
        }
        var _finishedAt = new Date().toISOString();

        // Helper to trigger history refresh after write confirms
        function _afterSave() {
          _statsSlotWriteConfirmed = true;
          setTimeout(function() {
            if (typeof window._casualLoadLastMatches === 'function') window._casualLoadLastMatches();
            if (typeof _hydrateStatsLastMatchesSlotFn === 'function') _hydrateStatsLastMatchesSlotFn();
          }, 150);
        }

        if (_casualDocId) {
          // Normal path: update existing doc
          var _updatePayload = {
            status: 'finished',
            finishedAt: _finishedAt,
            result: resultData,
            playerUids: playerUids,
            players: _playersForUpdate,
            isDoubles: isDoubles
          };
          if (_finalLiveState) _updatePayload.liveState = _finalLiveState;
          try {
            window._lastCasualSaveResult = {
              docId: _casualDocId, playerUids: playerUids,
              winner: state.winner, hasLiveState: !!_finalLiveState,
              at: _finishedAt
            };
          } catch(_e) {}
          var _updatePromise = window.FirestoreDB.updateCasualMatch(_casualDocId, _updatePayload);
          if (_updatePromise && typeof _updatePromise.then === 'function') {
            _updatePromise.then(_afterSave).catch(function() {
              // v1.7.7-beta: mesmo em erro de write, tenta mostrar seção
              _statsSlotWriteConfirmed = true;
              setTimeout(function() {
                if (typeof _hydrateStatsLastMatchesSlotFn === 'function') _hydrateStatsLastMatchesSlotFn();
              }, 200);
            });
          }
        } else if (_casualCreatedBy) {
          // v1.8.5-beta: fallback — _casualDocId é null porque saveCasualMatch
          // falhou em "Iniciar" (rede ou Firestore indisponível). Criar doc
          // completo com status:'finished' agora para que a partida apareça
          // no histórico de "Últimas Partidas".
          var _fallbackPayload = {
            createdBy: _casualCreatedBy,
            createdAt: _finishedAt,
            finishedAt: _finishedAt,
            sport: (opts && opts.sportName) || '',
            scoring: (opts && opts.scoring) || null,
            isDoubles: isDoubles,
            roomCode: _casualRoomCode || null,
            status: 'finished',
            result: resultData,
            playerUids: playerUids,
            players: _playersForUpdate
          };
          if (_finalLiveState) _fallbackPayload.liveState = _finalLiveState;
          var _createPromise = window.FirestoreDB.saveCasualMatch(_fallbackPayload);
          if (_createPromise && typeof _createPromise.then === 'function') {
            _createPromise.then(function(newId) {
              try { window._lastCasualSaveResult = { docId: newId, fallback: true, winner: state.winner, at: _finishedAt }; } catch(_e) {}
              _afterSave();
            }).catch(function(e) {
              window._warn('[Casual] fallback-save err:', e);
              _afterSave();
            });
          }
        }
      }
      // Persist detailed stats in each registered player's account so they
      // survive even after the casual match doc is deleted/expired.
      _buildAndPersistMatchRecord({
        matchId: _casualDocId ? ('casual_' + _casualDocId) : null,
        matchType: 'casual',
        sport: opts && opts.sportName
      });
      // v1.6.52-beta: auto-dispara sugestão de vínculo para slots vinculados
      // via autocomplete. O matchHistory já foi gravado com o uid do amigo —
      // se ele rejeitar a notificação, o registro é apagado.
      var _preLinked = _slotLinkedUid ? _slotLinkedUid.slice() : [];
      if (_preLinked.some(function(u) { return !!u; })) {
        setTimeout(function() {
          for (var _sli = 0; _sli < _preLinked.length; _sli++) {
            if (_preLinked[_sli] && window._suggestCasualLink) {
              window._suggestCasualLink(_sli, _preLinked[_sli]);
            }
          }
        }, 1000);
      }
      return;
    }

    if (useSets) {
      // Save as GSM sets data
      m.sets = state.sets.map(function(s) {
        var setData = { gamesP1: s.gamesP1, gamesP2: s.gamesP2 };
        if (s.tiebreak) setData.tiebreak = { pointsP1: s.tiebreak.p1, pointsP2: s.tiebreak.p2 };
        if (state.isFixedSet) setData.fixedSet = true;
        return setData;
      });
      var totalSetsP1 = 0, totalSetsP2 = 0, totalGamesP1 = 0, totalGamesP2 = 0;
      for (var i = 0; i < state.sets.length; i++) {
        var s = state.sets[i];
        if (s.gamesP1 > s.gamesP2) totalSetsP1++;
        else if (s.gamesP2 > s.gamesP1) totalSetsP2++;
        totalGamesP1 += s.gamesP1;
        totalGamesP2 += s.gamesP2;
      }
      m.setsWonP1 = totalSetsP1;
      m.setsWonP2 = totalSetsP2;
      m.scoreP1 = totalSetsP1;
      m.scoreP2 = totalSetsP2;
      m.totalGamesP1 = totalGamesP1;
      m.totalGamesP2 = totalGamesP2;
      if (state.isFixedSet) {
        m.fixedSet = true;
        m.scoreP1 = totalGamesP1;
        m.scoreP2 = totalGamesP2;
      }
    } else {
      // Simple scoring
      m.scoreP1 = state.currentGameP1;
      m.scoreP2 = state.currentGameP2;
    }

    if (state.winner === 1) m.winner = m.p1;
    else if (state.winner === 2) m.winner = m.p2;
    else if (state.currentGameP1 === state.currentGameP2) {
      m.winner = 'draw';
      m.draw = true;
    } else {
      m.winner = state.currentGameP1 > state.currentGameP2 ? m.p1 : m.p2;
    }
    m.liveScored = true;
    // v2.3.17: marca o FIM (último ponto) da partida.
    m.resultAt = Date.now();
    if (!m.startedAt) m.startedAt = m.resultAt;

    // Check-in both teams — having played the match proves both were present.
    // Mirrors the logic in _saveSetResult so live-scored matches don't leave
    // losers marked absent and trigger WO flows. Handles both doubles separators
    // ("A / B" from the standard match flow and "A/B" from live-scoring names).
    if (!t.checkedIn) t.checkedIn = {};
    if (!t.absent) t.absent = {};
    var _sidesToCheckIn = [m.p1, m.p2];
    for (var _si = 0; _si < _sidesToCheckIn.length; _si++) {
      var _side = _sidesToCheckIn[_si];
      if (!_side || _side === 'TBD' || _side === 'BYE') continue;
      var _names = _side.indexOf(' / ') !== -1 ? _side.split(' / ')
                 : _side.indexOf('/') !== -1 ? _side.split('/')
                 : [_side];
      for (var _ni = 0; _ni < _names.length; _ni++) {
        var _nm = _names[_ni].trim();
        if (!_nm) continue;
        if (!window._idMapHas(t, t.checkedIn, _nm)) window._idMapSet(t, t.checkedIn, _nm, Date.now());
        window._idMapDel(t, t.absent, _nm);
      }
    }
    if (!t.tournamentStarted) t.tournamentStarted = Date.now();

    // Advance winner BEFORE re-render so the next round's card shows the
    // new competitor immediately (not on the next sync tick).
    if (typeof window._advanceWinner === 'function') window._advanceWinner(t, m);
    if (typeof window._maybeFinishElimination === 'function') window._maybeFinishElimination(t);

    // BLINDAGEM DE CORRIDA (project_concurrency_safe_saves): antes eram DOIS saves de
    // doc inteiro (syncImmediate + saveTournament) → lost-update quando 2 jogos são
    // finalizados ao mesmo tempo. Agora re-aplica os campos JÁ computados do resultado
    // no match FRESCO (+ check-in + advance no fresco), atomicamente. A `t` local já foi
    // mutada acima (UI otimista).
    var _liveResult = {
      sets: m.sets, setsWonP1: m.setsWonP1, setsWonP2: m.setsWonP2,
      scoreP1: m.scoreP1, scoreP2: m.scoreP2,
      totalGamesP1: m.totalGamesP1, totalGamesP2: m.totalGamesP2,
      fixedSet: m.fixedSet, winner: m.winner, draw: m.draw,
      liveScored: true, resultAt: m.resultAt, startedAt: m.startedAt
    };
    var _liveSides = [m.p1, m.p2];
    var _liveLogMsg = 'Resultado (ao vivo): ' + m.p1 + ' vs ' + m.p2 + (m.winner === 'draw' ? ' — Empate' : ' — Vencedor: ' + m.winner);
    window.AppStore.logAction(tId, _liveLogMsg);
    window.AppStore.commitTournamentTx(tId, function (freshT) {
      var fm = window._findMatch(freshT, matchId);
      if (!fm) return;
      Object.keys(_liveResult).forEach(function (k) { if (_liveResult[k] !== undefined) fm[k] = _liveResult[k]; });
      if (!freshT.checkedIn) freshT.checkedIn = {};
      if (!freshT.absent) freshT.absent = {};
      _liveSides.forEach(function (side) {
        if (!side || side === 'TBD' || side === 'BYE') return;
        var _ns = side.indexOf(' / ') !== -1 ? side.split(' / ')
                : side.indexOf('/') !== -1 ? side.split('/') : [side];
        _ns.forEach(function (raw) {
          var nm = raw.trim();
          if (!nm) return;
          if (!window._idMapHas(freshT, freshT.checkedIn, nm)) window._idMapSet(freshT, freshT.checkedIn, nm, Date.now());
          window._idMapDel(freshT, freshT.absent, nm);
        });
      });
      if (!freshT.tournamentStarted) freshT.tournamentStarted = Date.now();
      if (typeof window._advanceWinner === 'function') window._advanceWinner(freshT, fm);
      if (typeof window._maybeFinishElimination === 'function') window._maybeFinishElimination(freshT);
      if (!Array.isArray(freshT.history)) freshT.history = [];
      freshT.history.push({ date: new Date().toISOString(), message: _liveLogMsg });
    });

    // Persist detailed tournament match stats in each registered participant's
    // account so their per-user history outlives the tournament.
    _buildAndPersistMatchRecord({
      matchId: 'tourn_' + (t && t.id ? t.id : 'x') + '_' + (m && m.id ? m.id : 'x'),
      matchType: 'tournament',
      tournamentId: t && t.id ? t.id : null,
      tournamentName: t && t.name ? t.name : null,
      sport: t && t.sport ? t.sport : ''
    });

    // Close overlay
    if (!opts.keepOpen) {
      var ov = document.getElementById('live-scoring-overlay');
      if (ov) ov.remove();
    }

    if (!opts.silent) showNotification(_t('bui.resultSaved'), m.winner === 'draw' ? _t('bui.draw') : _t('bui.matchWon', {winner: m.winner}), 'success');
    _rerenderBracket(tId, matchId);
  }

  // ── Serve tracking — progressive definition ──
  // The serve order is built game by game as each player serves for the first time.
  // Singles: 2 slots (game 1: pick, game 2: auto). Doubles: 4 slots (game 1: pick anyone,
  // game 2: other team pick player, game 3+4: auto remaining players).

  // Get which players are already in the serve order from a specific team
  function _serveOrderPlayersForTeam(team) {
    var names = [];
    for (var i = 0; i < state.serveOrder.length; i++) {
      if (state.serveOrder[i].team === team) names.push(state.serveOrder[i].name);
    }
    return names;
  }

  // Determine which team should serve at a given slot index (alternates)
  function _teamForSlot(slotIdx) {
    if (state.serveOrder.length === 0) return 0; // Not yet determined
    var firstTeam = state.serveOrder[0].team;
    return (slotIdx % 2 === 0) ? firstTeam : (firstTeam === 1 ? 2 : 1);
  }

  // Get eligible players for the next serve slot
  function _getEligibleServers() {
    var slot = state.serveOrder.length;
    if (slot === 0) {
      // First serve — any player from any team
      var all = [];
      for (var i = 0; i < p1Players.length; i++) all.push({ team: 1, name: p1Players[i] });
      for (var j = 0; j < p2Players.length; j++) all.push({ team: 2, name: p2Players[j] });
      return all;
    }
    // Subsequent slots: must be from the alternating team, and not yet in serveOrder
    var team = _teamForSlot(slot);
    var used = _serveOrderPlayersForTeam(team);
    var teamPlayers = team === 1 ? p1Players : p2Players;
    var eligible = [];
    for (var k = 0; k < teamPlayers.length; k++) {
      if (used.indexOf(teamPlayers[k]) === -1) eligible.push({ team: team, name: teamPlayers[k] });
    }
    return eligible;
  }

  // Quem PODE ser escolhido como sacador AGORA. Espelha EXATAMENTE a regra de
  // aceitação do _liveSetServer — se divergir, o relógio oferece um nome que o
  // celular ignora em silêncio e o botão fica morto (o _liveSetServer rejeita
  // com `if (state.serveOrder[1].team !== team) return;`).
  //   1º game (totalGamesPlayed 0) → os 4 jogadores: define quem abre o saque.
  //   2º game (totalGamesPlayed 1) → só os 2 do time que saca em 2º; o time que
  //                                   abriu já está travado.
  //   daí em diante           → ninguém (hard lock no _liveSetServer).
  // A regra vive AQUI (celular); o relógio só desenha a lista que receber.
  function _serveEligibleNow() {
    if (state.serveSkipped || !isDoubles || state.isFinished) return [];
    if (state.totalGamesPlayed >= 2) return [];
    var out = [], i;
    if (state.totalGamesPlayed === 0) {
      for (i = 0; i < p1Players.length; i++) {
        if (p1Players[i]) out.push({ team: 1, playerIdx: i, name: p1Players[i] });
      }
      for (i = 0; i < p2Players.length; i++) {
        if (p2Players[i]) out.push({ team: 2, playerIdx: i, name: p2Players[i] });
      }
      return out;
    }
    if (state.serveOrder.length < 4) return [];
    var t = state.serveOrder[1].team;
    var ps = t === 1 ? p1Players : p2Players;
    for (i = 0; i < ps.length; i++) {
      if (ps[i]) out.push({ team: t, playerIdx: i, name: ps[i] });
    }
    return out;
  }

  // Serve picker overlay no longer used — serve is set inline via draggable ball
  function _needsServePick() {
    if (state.serveSkipped) return false;
    if (state.isFinished || state.tieRulePending) return false;
    // Tela 1: antes do 1º game e nenhum sacador escolhido.
    if (state.totalGamesPlayed === 0 && state.serveOrder.length === 0) return true;
    // Tela 2 (só duplas): entre o 1º e o 2º game, 2º sacador (do outro time) ainda não escolhido.
    if (isDoubles && state.totalGamesPlayed === 1 && state.serveOrder.length >= 2 && !state.secondServerPicked) return true;
    return false;
  }

  // Auto-fill serve slot if only 1 eligible player
  function _tryAutoFillServe() {
    if (state.serveSkipped) return;
    while (state.serveOrder.length < serveSlots) {
      var eligible = _getEligibleServers();
      if (eligible.length === 1) {
        state.serveOrder.push(eligible[0]);
      } else {
        break;
      }
    }
  }

  // Get current server based on completed serveOrder + totalGamesPlayed
  function _getCurrentServer() {
    if (state.serveSkipped || state.serveOrder.length === 0) return null;
    var idx;
    if (state.isTiebreak || _isDecidingSet()) {
      // In tiebreak: advance serve position every 2 points (first server serves 1, then 2 each)
      var totalPts = state.currentGameP1 + state.currentGameP2;
      var tbOffset = (totalPts === 0) ? 0 : Math.floor((totalPts + 1) / 2);
      idx = (state.totalGamesPlayed + tbOffset) % state.serveOrder.length;
    } else {
      idx = state.totalGamesPlayed % state.serveOrder.length;
    }
    return state.serveOrder[idx] || null;
  }

  // Proposed serve order — alternating teams: T1[0], T2[0], T1[1], T2[1]
  // Team slots are FIXED (even = firstTeam, odd = secondTeam).
  // Only which player within a team occupies the slot can be swapped.
  var _proposedOrder = [];
  var _firstServeTeam = 1; // Which team serves first (can be toggled)
  (function() {
    var maxLen = Math.max(p1Players.length, p2Players.length);
    for (var i = 0; i < maxLen; i++) {
      if (i < p1Players.length) _proposedOrder.push({ team: 1, name: p1Players[i], pIdx: i });
      if (i < p2Players.length) _proposedOrder.push({ team: 2, name: p2Players[i], pIdx: i });
    }
  })();

  // Rebuild proposed order: ensure strict T-T alternation from _firstServeTeam
  function _rebuildProposedOrder() {
    var tA = _firstServeTeam;
    var tB = tA === 1 ? 2 : 1;
    var playersA = _proposedOrder.filter(function(p) { return p.team === tA; });
    var playersB = _proposedOrder.filter(function(p) { return p.team === tB; });
    var newOrder = [];
    var maxLen = Math.max(playersA.length, playersB.length);
    for (var i = 0; i < maxLen; i++) {
      if (i < playersA.length) newOrder.push(playersA[i]);
      if (i < playersB.length) newOrder.push(playersB[i]);
    }
    _proposedOrder = newOrder;
  }

  // Apply a serve drag: player at fromIdx dragged to toIdx.
  // The dragged player lands at toIdx. Their team fills same-parity slots (0,2 or 1,3).
  // The other team fills opposite-parity slots. Alternation always enforced.
  function _applyServeDrag(fromIdx, toIdx) {
    if (_proposedOrder.length < 4) return;
    var dragged = _proposedOrder[fromIdx];
    var dragTeam = dragged.team;
    // Find teammate and opponents (preserving current order)
    var teammate = null;
    var opponents = [];
    for (var i = 0; i < _proposedOrder.length; i++) {
      if (i === fromIdx) continue;
      if (_proposedOrder[i].team === dragTeam) teammate = _proposedOrder[i];
      else opponents.push(_proposedOrder[i]);
    }
    if (!teammate || opponents.length < 2) return;
    // Target parity determines which slots this team occupies
    var parity = toIdx % 2; // 0 → even slots (0,2), 1 → odd slots (1,3)
    var teamSlots = parity === 0 ? [0, 2] : [1, 3];
    var otherSlots = parity === 0 ? [1, 3] : [0, 2];
    var newOrder = [null, null, null, null];
    // Dragged player at target, teammate at the other same-parity slot
    newOrder[toIdx] = dragged;
    newOrder[teamSlots[0] === toIdx ? teamSlots[1] : teamSlots[0]] = teammate;
    // Opponents fill opposite-parity slots (preserve their relative order)
    newOrder[otherSlots[0]] = opponents[0];
    newOrder[otherSlots[1]] = opponents[1];
    _proposedOrder = newOrder;
    _firstServeTeam = _proposedOrder[0].team;
    _showServePickerOverlay();
  }

  // ── Serve order picker ──
  // Simple vertical list of 4 cards in serve order. Drag to swap.
  // Rule: alternation T1-T2-T1-T2 always enforced after any drag.
  var _serveDragIdx = null;
  var _serveDragGhost = null;

  // v1.3.11 (dono, 18-jul): tela de SACADOR por CLIQUE (não arrastar), em 2 estágios.
  //   Tela 1 (antes do 1º game): escolher o 1º sacador entre TODOS. Botão verde "Iniciar".
  //   Tela 2 (duplas, entre o 1º e o 2º game): escolher o 2º sacador SÓ do outro time. "Confirmar".
  //   Clique num nome → box em volta + bolinha da modalidade à esquerda do nome. 1º pré-selecionado.
  //   Fechar (esq) = pula o rastreio de saque. Layout scroll-safe (nada corta; ver mock).
  var _pickerSel = null; // { team, idx } — jogador selecionado

  function _serveStage() { return (state.totalGamesPlayed === 0) ? 1 : 2; }

  function _servePickerPlayers(stage) {
    var out = [];
    if (stage === 2 && state.serveOrder.length >= 2) {
      var t2 = state.serveOrder[1].team; // o time que saca no 2º game
      var arr = t2 === 1 ? p1Players : p2Players;
      for (var i = 0; i < arr.length; i++) out.push({ team: t2, idx: i, name: arr[i] });
    } else {
      for (var a = 0; a < p1Players.length; a++) out.push({ team: 1, idx: a, name: p1Players[a] });
      for (var b = 0; b < p2Players.length; b++) out.push({ team: 2, idx: b, name: p2Players[b] });
    }
    return out;
  }

  function _showServePickerOverlay() {
    var container = document.getElementById('live-score-content');
    if (!container) return;
    var stage = _serveStage();
    var players = _servePickerPlayers(stage);
    if (!players.length) return;
    // pré-seleção: mantém a atual se ainda válida; senão o 1º da lista (já vem escolhido).
    var _valid = _pickerSel && players.some(function (p) { return p.team === _pickerSel.team && p.idx === _pickerSel.idx; });
    if (!_valid) _pickerSel = { team: players[0].team, idx: players[0].idx };

    var title = stage === 1 ? 'Quem saca primeiro?' : 'Quem saca no 2º game?';
    var confirmLabel = stage === 1 ? 'Iniciar' : 'Confirmar';

    var cardsHtml = players.map(function (p) {
      var sel = (_pickerSel.team === p.team && _pickerSel.idx === p.idx);
      var clr = p.team === 1 ? '#3b82f6' : '#ef4444';
      var bg = sel ? (p.team === 1 ? 'rgba(59,130,246,0.16)' : 'rgba(239,68,68,0.16)') : 'rgba(255,255,255,0.03)';
      var bd = sel ? clr : 'rgba(255,255,255,0.10)';
      var ball = sel ? '<span style="font-size:1.15rem;line-height:1;flex-shrink:0;">' + _sportBall + '</span>' : '';
      return '<button type="button" onclick="window._liveServeSelect(' + p.team + ',' + p.idx + ')" ' +
        'style="box-sizing:border-box;width:100%;max-width:360px;flex-shrink:0;display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:12px;cursor:pointer;text-align:left;' +
        'border:2px solid ' + bd + ';background:' + bg + ';transition:background 0.12s,border-color 0.12s;">' +
          _liveAvatarHtml(p.name, 34) + ball +
          '<span style="flex:1;min-width:0;font-size:1rem;font-weight:700;color:' + clr + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(p.name) + '</span>' +
        '</button>';
    }).join('');

    // Layout scroll-safe: barra FIXA (Fechar esq · título · Iniciar/Confirmar dir) + lista ROLÁVEL.
    container.innerHTML =
      '<div style="height:100%;display:flex;flex-direction:column;align-items:stretch;">' +
        '<div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 12px;background:#0a0e1a;border-bottom:1px solid rgba(255,255,255,0.05);">' +
          '<button onclick="window._liveSkipServe()" style="flex-shrink:0;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;background:rgba(255,255,255,0.05);color:var(--text-muted);font-size:0.82rem;font-weight:600;">Fechar</button>' +
          '<div style="flex:1;min-width:0;text-align:center;font-size:0.9rem;font-weight:800;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + title + '</div>' +
          '<button onclick="window._liveServeConfirm()" style="flex-shrink:0;padding:10px 20px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:0.9rem;font-weight:800;box-shadow:0 2px 12px rgba(16,185,129,0.3);">' + confirmLabel + '</button>' +
        '</div>' +
        '<div id="serve-order-list" style="flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;padding:14px 1rem calc(14px + env(safe-area-inset-bottom, 0px));">' + cardsHtml + '</div>' +
      '</div>';
  }

  // clique num nome → seleciona (box + bolinha) e re-renderiza a tela.
  window._liveServeSelect = function (team, idx) {
    _pickerSel = { team: team, idx: idx };
    _showServePickerOverlay();
  };

  // Iniciar (tela 1) / Confirmar (tela 2) → aplica o sacador escolhido via _liveSetServer
  // (constrói/atualiza a serveOrder e re-renderiza; a tela some porque _needsServePick vira false).
  window._liveServeConfirm = function () {
    if (!_pickerSel) return;
    var sel = _pickerSel;
    if (!isDoubles) {
      // SIMPLES: 1º sacador escolhido; o 2º é o outro jogador. serveOrder = 2 entradas (não 4 —
      // _liveSetServer é feito p/ duplas e criaria jogadores-fantasma). Sem Tela 2 (só 2 pessoas).
      var otherTeam = sel.team === 1 ? 2 : 1;
      var srvName = (sel.team === 1 ? p1Players : p2Players)[sel.idx] || '';
      var otherName = (otherTeam === 1 ? p1Players : p2Players)[0] || '';
      state.serveOrder = [{ team: sel.team, name: srvName, pIdx: 0 }, { team: otherTeam, name: otherName, pIdx: 0 }];
      state.secondServerPicked = true;
      _render();
      _watchNotify();
      return;
    }
    if (state.totalGamesPlayed === 1) state.secondServerPicked = true;
    _liveSetServer(sel.team, sel.idx);
  };

  function _setupServeDragDrop() {
    var cards = document.querySelectorAll('[data-serve-idx]');
    if (!cards.length) return;

    // Desktop drag
    cards.forEach(function(card) {
      card.addEventListener('dragstart', function(e) {
        _serveDragIdx = parseInt(card.getAttribute('data-serve-idx'));
        card.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function() {
        card.style.opacity = '1';
        _serveDragIdx = null;
        document.querySelectorAll('[data-serve-idx]').forEach(function(c) { c.style.transform = ''; });
      });
      card.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (_serveDragIdx === null) return;
        var tgt = parseInt(card.getAttribute('data-serve-idx'));
        if (tgt !== _serveDragIdx) card.style.transform = 'scale(1.04)';
      });
      card.addEventListener('dragleave', function() { card.style.transform = ''; });
      card.addEventListener('drop', function(e) {
        e.preventDefault();
        card.style.transform = '';
        if (_serveDragIdx === null) return;
        var tgt = parseInt(card.getAttribute('data-serve-idx'));
        if (tgt !== _serveDragIdx) {
          var src = _serveDragIdx;
          _serveDragIdx = null;
          _applyServeDrag(src, tgt);
        }
      });
    });

    // Touch drag (mobile)
    var _touchIdx = null;
    cards.forEach(function(card) {
      card.addEventListener('touchstart', function(e) {
        _touchIdx = parseInt(card.getAttribute('data-serve-idx'));
        card.style.opacity = '0.6';
      }, { passive: true });
      card.addEventListener('touchmove', function(e) {
        if (_touchIdx === null) return;
        e.preventDefault();
        if (!_serveDragGhost) {
          _serveDragGhost = card.cloneNode(true);
          _serveDragGhost.style.cssText = 'position:fixed;z-index:200000;opacity:0.85;pointer-events:none;width:' + card.offsetWidth + 'px;box-shadow:0 8px 30px rgba(0,0,0,0.5);border-radius:12px;';
          document.body.appendChild(_serveDragGhost);
        }
        var t = e.touches[0];
        _serveDragGhost.style.left = (t.clientX - 40) + 'px';
        _serveDragGhost.style.top = (t.clientY - 20) + 'px';
        document.querySelectorAll('[data-serve-idx]').forEach(function(c) { c.style.transform = ''; });
        var el = document.elementFromPoint(t.clientX, t.clientY);
        var targ = el;
        while (targ) {
          if (targ.dataset && targ.dataset.serveIdx !== undefined) {
            var ti = parseInt(targ.dataset.serveIdx);
            if (ti !== _touchIdx) targ.style.transform = 'scale(1.04)';
            break;
          }
          targ = targ.parentElement;
        }
      }, { passive: false });
      card.addEventListener('touchend', function(e) {
        card.style.opacity = '1';
        if (_serveDragGhost) { _serveDragGhost.remove(); _serveDragGhost = null; }
        document.querySelectorAll('[data-serve-idx]').forEach(function(c) { c.style.transform = ''; });
        if (_touchIdx === null) return;
        var t = e.changedTouches[0];
        var el = document.elementFromPoint(t.clientX, t.clientY);
        var targ = el;
        while (targ) {
          if (targ.dataset && targ.dataset.serveIdx !== undefined) {
            var ti = parseInt(targ.dataset.serveIdx);
            if (ti !== _touchIdx) {
              var src = _touchIdx;
              _touchIdx = null;
              _applyServeDrag(src, ti);
              return;
            }
            break;
          }
          targ = targ.parentElement;
        }
        _touchIdx = null;
      });
    });
  }

  // Confirm the proposed order
  window._liveConfirmServeOrder = function() {
    state.serveOrder = _proposedOrder.map(function(p) { return { team: p.team, name: p.name, pIdx: p.pIdx }; });
    state.serveSkipped = false;
    state.servePending = false;
    _render();
    _watchNotify(); // relógio sai do "Iniciar" e passa a mostrar o placar/sacador
  };

  // Skip serve tracking
  window._liveSkipServe = function() {
    state.serveSkipped = true;
    state.servePending = false;
    _render();
    _watchNotify(); // relógio começa sem rastrear sacador
  };

  // v1.3.11: NÃO auto-preenche a ordem de saque — a Tela 1 (escolher o 1º sacador) é
  // obrigatória em partida nova (dono, 18-jul). serveOrder vazio → _needsServePick() dispara
  // a tela. Retomada/sync já traz serveOrder e não re-pergunta (ver blocos acima).

  // Set 1st server by dragging ball to a player name (inline, on the live scoring screen)
  // Before game 1: any player can be set as 1st server → auto-sets 3rd (teammate)
  // Before game 2: only the other team's players → sets 2nd server → auto-sets 4th
  // After game 2: locked
  window._liveSetServer = function(team, playerIdx) {
    // HARD LOCK: after 2 games, nobody's serve order can change — ever.
    if (state.totalGamesPlayed >= 2) { _render(); return; }
    var players = team === 1 ? p1Players : p2Players;
    var name = players[playerIdx];
    if (!name) return;

    if (state.totalGamesPlayed === 0) {
      // Setting 1st server: this player + teammate fills slots 0,2. Other team fills 1,3.
      var teammate = null;
      var teamAll = team === 1 ? p1Players : p2Players;
      for (var i = 0; i < teamAll.length; i++) {
        if (teamAll[i] !== name) { teammate = teamAll[i]; break; }
      }
      var otherTeam = team === 1 ? 2 : 1;
      var opponents = otherTeam === 1 ? p1Players.slice() : p2Players.slice();
      state.serveOrder = [
        { team: team, name: name, pIdx: 0 },
        { team: otherTeam, name: opponents[0] || ('Jogador ' + (otherTeam === 1 ? 1 : 3)), pIdx: 0 },
        { team: team, name: teammate || ('Jogador ' + (team === 1 ? 2 : 4)), pIdx: 1 },
        { team: otherTeam, name: opponents[1] || ('Jogador ' + (otherTeam === 1 ? 2 : 4)), pIdx: 1 }
      ];
    } else if (state.totalGamesPlayed === 1) {
      // Setting 2nd server: MUST be from the team that serves 2nd (serveOrder[1].team).
      // The team that started serving (serveOrder[0].team) is already locked.
      if (state.serveOrder.length < 4) { _render(); return; }
      if (state.serveOrder[1].team !== team) { _render(); return; }
      // This player should serve 2nd, their teammate serves 4th
      var otherPlayer = null;
      var teamP = team === 1 ? p1Players : p2Players;
      for (var j = 0; j < teamP.length; j++) {
        if (teamP[j] !== name) { otherPlayer = teamP[j]; break; }
      }
      state.serveOrder[1] = { team: team, name: name };
      state.serveOrder[3] = { team: team, name: otherPlayer || state.serveOrder[3].name };
    }
    _render();
    _watchNotify(); // relógio reflete a troca de sacador feita no celular
  };

  // ── Render function ──
  function _render() {
    var container = document.getElementById('live-score-content');
    if (!container) return;

    // Determine whether the current viewer is a registered player in this match.
    // Used to gate match-control actions (tie-rule choice, tie-break button, restart) —
    // they must only be operable by registered users actually playing.
    // Casual matches always allow the viewer to control (creator is always a player).
    var _curUser = window.AppStore && window.AppStore.currentUser;
    var _isViewerInMatch = isCasual; // casual: always true; tournament: check uid
    if (!isCasual && _curUser && _curUser.uid) {
      var _mn = p1Players.concat(p2Players);
      for (var _mni = 0; _mni < _mn.length; _mni++) {
        var _mm = _playerMeta[_mn[_mni]];
        if (_mm && _mm.uid === _curUser.uid) { _isViewerInMatch = true; break; }
      }
    }

    // Check if we need a serve pick before continuing
    if (_needsServePick()) {
      _showServePickerOverlay();
      return;
    }

    // Show tie rule dialog if pending (must render AFTER the full UI, not via insertAdjacentHTML)
    if (state.tieRulePending) {
      _showTieRuleDialog(_isViewerInMatch);
      return;
    }

    // ── FINISHED STATE: render result summary instead of plates ──
    if (state.isFinished && state.winner) {  // v1.4.23-beta: guard against race where isFinished=true but winner not yet set (iOS instrument)
      var winTeam = state.winner; // 1 or 2
      var winPlayers = winTeam === 1 ? p1Players : p2Players;
      var losePlayers = winTeam === 1 ? p2Players : p1Players;
      var winClr = winTeam === 1 ? '#3b82f6' : '#ef4444';
      var loseClr = winTeam === 1 ? '#ef4444' : '#3b82f6';
      // v1.7.6-beta: cores fixas por time — TIME 1 sempre azul, TIME 2 sempre vermelho
      var p1Clr = '#3b82f6';
      var p2Clr = '#ef4444';

      // Build score summary
      var scoreSummary = '';
      if (useSets && !state.isFixedSet) {
        // Sets summary: "6-4  3-6  7-6(5)"
        var setsP1 = 0, setsP2 = 0, totalGP1 = 0, totalGP2 = 0;
        for (var si = 0; si < state.sets.length; si++) {
          var ss = state.sets[si];
          if (ss.gamesP1 > ss.gamesP2) setsP1++; else if (ss.gamesP2 > ss.gamesP1) setsP2++;
          totalGP1 += ss.gamesP1; totalGP2 += ss.gamesP2;
          var setClr = ss.gamesP1 > ss.gamesP2 ? '#60a5fa' : (ss.gamesP2 > ss.gamesP1 ? '#f87171' : 'var(--text-muted)');
          var _combinedHtml = (typeof window._formatSetCombined === 'function')
            ? window._formatSetCombined(ss, { html: true })
            : (ss.gamesP1 + '-' + ss.gamesP2);
          scoreSummary += '<span style="font-size:clamp(1.3rem,4vw,2rem);font-weight:900;color:' + setClr + ';font-variant-numeric:tabular-nums;">' + _combinedHtml + '</span>';
          if (si < state.sets.length - 1) scoreSummary += '<span style="color:rgba(255,255,255,0.15);margin:0 clamp(4px,1vw,8px);">·</span>';
        }
      } else {
        // Simple or fixed set score
        var scP1 = state.isFixedSet ? state.sets[0].gamesP1 : state.currentGameP1;
        var scP2 = state.isFixedSet ? state.sets[0].gamesP2 : state.currentGameP2;
        scoreSummary = '<span style="font-size:clamp(1.8rem,6vw,3rem);font-weight:900;color:#60a5fa;font-variant-numeric:tabular-nums;">' + scP1 + '</span>' +
          '<span style="color:rgba(255,255,255,0.25);margin:0 8px;font-size:1.2rem;">×</span>' +
          '<span style="font-size:clamp(1.8rem,6vw,3rem);font-weight:900;color:#f87171;font-variant-numeric:tabular-nums;">' + scP2 + '</span>';
      }

      // Elapsed time
      var elapsedStr = '';
      if (_matchStartTime) {
        var endT = _matchEndTime || Date.now();
        var elapsedMs = endT - _matchStartTime;
        var mins = Math.floor(elapsedMs / 60000);
        var secs = Math.floor((elapsedMs % 60000) / 1000);
        if (mins >= 60) {
          var hrs = Math.floor(mins / 60);
          elapsedStr = hrs + 'h' + String(mins % 60).padStart(2, '0') + 'min';
        } else {
          elapsedStr = mins + 'min' + String(secs).padStart(2, '0') + 's';
        }
      }

      // Total points
      var totalPtsP1 = 0, totalPtsP2 = 0;
      for (var pi = 0; pi < state.sets.length; pi++) {
        var ps = state.sets[pi];
        totalPtsP1 += ps.gamesP1; totalPtsP2 += ps.gamesP2;
        if (ps.tiebreak) { totalPtsP1 += ps.tiebreak.p1; totalPtsP2 += ps.tiebreak.p2; }
      }
      var totalPts = totalPtsP1 + totalPtsP2;

      // Win percentage
      var winPct = totalPts > 0 ? Math.round((winTeam === 1 ? totalPtsP1 : totalPtsP2) / totalPts * 100) : 50;
      var losePct = 100 - winPct;

      // Compute team + per-player stats from gameLog + pointLog
      var _computeMatchStats = function() {
        var pts = state.pointLog || [], gmL = state.gameLog || [];
        var teamStats = {
          1: { points: 0, games: 0, sets: 0, holdServed: 0, held: 0, longestStreak: 0, biggestLead: 0,
               servePtsPlayed: 0, servePtsWon: 0, receivePtsPlayed: 0, receivePtsWon: 0,
               deucePtsPlayed: 0, deucePtsWon: 0, breaks: 0 },
          2: { points: 0, games: 0, sets: 0, holdServed: 0, held: 0, longestStreak: 0, biggestLead: 0,
               servePtsPlayed: 0, servePtsWon: 0, receivePtsPlayed: 0, receivePtsWon: 0,
               deucePtsPlayed: 0, deucePtsWon: 0, breaks: 0 }
        };
        var curStreak = { 1: 0, 2: 0 }, cum = 0;
        var deuceThresh = 3; // 40-40 in tennis counting (numeric points 3-3)
        for (var i = 0; i < pts.length; i++) {
          var pt = pts[i];
          teamStats[pt.team].points++;
          if (pt.team === 1) { curStreak[1]++; curStreak[2] = 0; cum++; }
          else { curStreak[2]++; curStreak[1] = 0; cum--; }
          if (curStreak[pt.team] > teamStats[pt.team].longestStreak) teamStats[pt.team].longestStreak = curStreak[pt.team];
          if (cum > teamStats[1].biggestLead) teamStats[1].biggestLead = cum;
          if (-cum > teamStats[2].biggestLead) teamStats[2].biggestLead = -cum;
          // Serve/receive stats only for points with server context
          if (pt.serverTeam === 1 || pt.serverTeam === 2) {
            var srvT = pt.serverTeam;
            var recT = srvT === 1 ? 2 : 1;
            teamStats[srvT].servePtsPlayed++;
            teamStats[recT].receivePtsPlayed++;
            if (pt.team === srvT) teamStats[srvT].servePtsWon++;
            else teamStats[recT].receivePtsWon++;
            // Deuce (killer point): p1Before === p2Before === 3 in a normal game (not tiebreak)
            if (!pt.isTiebreak && pt.p1Before === deuceThresh && pt.p2Before === deuceThresh) {
              teamStats[1].deucePtsPlayed++;
              teamStats[2].deucePtsPlayed++;
              teamStats[pt.team].deucePtsWon++;
            }
          }
        }
        for (var g = 0; g < gmL.length; g++) {
          var ge = gmL[g];
          teamStats[ge.winner].games++;
          if (ge.serverTeam && ge.winner !== ge.serverTeam) {
            // Receiving team won a game = break
            teamStats[ge.winner].breaks++;
          }
        }
        for (var s = 0; s < state.sets.length; s++) {
          var ss = state.sets[s];
          if (ss.gamesP1 > ss.gamesP2) teamStats[1].sets++;
          else if (ss.gamesP2 > ss.gamesP1) teamStats[2].sets++;
        }
        var playerStats = {};
        var allPlayers = p1Players.concat(p2Players);
        for (var pi = 0; pi < allPlayers.length; pi++) {
          playerStats[allPlayers[pi]] = {
            served: 0, held: 0, team: pi < p1Players.length ? 1 : 2,
            _streak: 0, longestHoldStreak: 0,
            servePtsPlayed: 0, servePtsWon: 0
          };
        }
        for (var gg = 0; gg < gmL.length; gg++) {
          var entry = gmL[gg];
          if (!entry.serverName || !playerStats[entry.serverName]) continue;
          var psp = playerStats[entry.serverName];
          psp.served++;
          if (entry.winner === entry.serverTeam) {
            psp.held++;
            psp._streak++;
            if (psp._streak > psp.longestHoldStreak) psp.longestHoldStreak = psp._streak;
          } else {
            psp._streak = 0;
          }
          teamStats[entry.serverTeam].holdServed++;
          if (entry.winner === entry.serverTeam) teamStats[entry.serverTeam].held++;
        }
        // Per-player point-level serve stats from pointLog
        for (var pj = 0; pj < pts.length; pj++) {
          var ppt = pts[pj];
          if (!ppt.server || !playerStats[ppt.server]) continue;
          playerStats[ppt.server].servePtsPlayed++;
          if (ppt.team === ppt.serverTeam) playerStats[ppt.server].servePtsWon++;
        }
        return { teamStats: teamStats, playerStats: playerStats };
      };

      var _matchStats = _computeMatchStats();
      var winT = _matchStats.teamStats[winTeam] || {};
      var losT = _matchStats.teamStats[winTeam === 1 ? 2 : 1] || {};
      var hasServeData = state.gameLog && state.gameLog.length > 0 && !state.serveSkipped;
      // v1.7.6-beta: stats por time FIXO (1 e 2) para a comparação com cores corretas
      var t1T = winTeam === 1 ? winT : losT;
      var t2T = winTeam === 1 ? losT : winT;

      // Player detail modal — called from chip onclick. Uses closure over _computeMatchStats + helpers.
      window._showPlayerMatchStats = function(playerName) {
        var st = _computeMatchStats();
        var ps = st.playerStats[playerName];
        if (!ps) return;
        var accent = ps.team === 1 ? '#60a5fa' : '#f87171';
        var accentBg = ps.team === 1 ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)';
        var holdPct = ps.served > 0 ? Math.round(ps.held / ps.served * 100) : 0;
        var teamMates = ps.team === 1 ? p1Players : p2Players;
        var teamLabel = teamMates.join(' / ');
        var isWinner = ps.team === winTeam;
        // Count points scored while this player was serving (derive from gameLog + pointLog)
        // Simplified: points team won per game × team while this player served
        var ptsServedOn = 0, ptsWonWhileServing = 0;
        // Walk through pointLog and reconstruct which game each point is in by tracking running game totals.
        // For simplicity: we don't have explicit mapping, skip detailed per-point serve attribution.

        var modal = document.createElement('div');
        modal.id = 'player-match-stats-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);backdrop-filter:blur(4px);z-index:100020;display:flex;align-items:center;justify-content:center;padding:1rem;';
        var _boxStat = function(label, value, icon) {
          return '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 6px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">' +
            '<span style="font-size:1rem;">' + icon + '</span>' +
            '<span style="font-size:1.1rem;font-weight:900;color:' + accent + ';font-variant-numeric:tabular-nums;line-height:1;">' + value + '</span>' +
            '<span style="font-size:0.55rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;text-align:center;">' + label + '</span>' +
          '</div>';
        };
        modal.innerHTML =
          '<div style="background:#0f172a;border:1.5px solid ' + accent + ';border-radius:18px;max-width:380px;width:100%;padding:1.25rem;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">' +
            // Header
            '<div style="display:flex;align-items:center;gap:12px;">' + _liveAvatarHtml(playerName, 52) +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:1.15rem;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(playerName) + '</div>' +
                '<div style="font-size:0.7rem;color:' + accent + ';font-weight:700;display:flex;align-items:center;gap:6px;">' +
                  (isWinner ? '🏆 ' : '') + 'Time ' + ps.team + ' · ' + window._safeHtml(teamLabel) +
                '</div>' +
              '</div>' +
              /* x-canon-exempt: fechar modal/overlay — não é cancelar/remover; pendente decisão do dono */ '<button onclick="document.getElementById(\'player-match-stats-modal\').remove()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--text-bright);border-radius:8px;padding:6px 10px;font-size:0.7rem;font-weight:700;cursor:pointer;">✕</button>' +
            '</div>' +
            // Serve stats grid
            (hasServeData ? (
              '<div style="display:flex;flex-direction:column;gap:6px;">' +
                '<div style="font-size:0.55rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;text-align:center;">🎾 Saque · Por Game</div>' +
                '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">' +
                  _boxStat('Games servidos', ps.served, '🎾') +
                  _boxStat('Games mantidos', ps.held, '🏆') +
                  _boxStat('Aproveit.', holdPct + '%', '📊') +
                  _boxStat('Maior sequência', ps.longestHoldStreak, '🔥') +
                '</div>' +
                (ps.servePtsPlayed > 0 ? (
                  '<div style="font-size:0.55rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;text-align:center;margin-top:4px;">🚀 Saque · Por Ponto</div>' +
                  '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">' +
                    _boxStat('Pts servidos', ps.servePtsPlayed, '🎯') +
                    _boxStat('Pts ganhos', ps.servePtsWon, '✅') +
                    _boxStat('% no saque', (ps.servePtsPlayed > 0 ? Math.round(ps.servePtsWon / ps.servePtsPlayed * 100) : 0) + '%', '📈') +
                  '</div>'
                ) : '') +
              '</div>'
            ) : '<div style="text-align:center;font-size:0.72rem;color:var(--text-muted);padding:10px;">Sem dados de saque (tracking desativado)</div>') +
            // Team context
            '<div style="padding:10px;border-radius:10px;background:' + accentBg + ';border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:4px;">' +
              '<div style="font-size:0.55rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Seu time na partida</div>' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:0.8rem;font-weight:800;color:#fff;">' +
                '<span>' + st.teamStats[ps.team].points + ' pts · ' + st.teamStats[ps.team].games + ' games · ' + st.teamStats[ps.team].sets + ' sets</span>' +
              '</div>' +
            '</div>' +
            '<button onclick="document.getElementById(\'player-match-stats-modal\').remove()" style="padding:12px;border-radius:10px;border:none;background:rgba(99,102,241,0.2);color:#818cf8;font-weight:700;cursor:pointer;font-size:0.9rem;">Fechar</button>' +
          '</div>';
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
      };

      // Clickable player chip builder — avatar+name taps stats only.
      // v1.3.60-beta: 🔗 unpair removed from inside chip; standalone dashed
      // pill placed between winner/loser sections (matches setup screen style).
      var _playerChip = function(name, bigSize, accentClr) {
        var sz = bigSize ? 32 : 26;
        var fs = bigSize ? 'clamp(0.92rem,3vw,1.15rem)' : 'clamp(0.8rem,2.6vw,0.95rem)';
        var pad = bigSize ? '8px 10px' : '6px 8px';
        var borderClr = accentClr + (bigSize ? '66' : '40');
        var escName = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return (
          '<button type="button" onclick="window._showPlayerMatchStats(\'' + escName + '\')" title="Ver estatísticas" ' +
            'style="display:flex;align-items:center;gap:8px;padding:' + pad + ';background:rgba(255,255,255,0.05);border:1px solid ' + borderClr + ';border-radius:10px;cursor:pointer;color:#fff;font-family:inherit;width:100%;min-width:0;transition:all 0.15s;" ' +
            'onmouseover="this.style.background=\'rgba(255,255,255,0.09)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.05)\'">' +
            _liveAvatarHtml(name, sz) +
            '<span style="font-size:' + fs + ';font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">' + window._safeHtml(name) + '</span>' +
            '<span style="font-size:0.55rem;color:var(--text-muted);margin-left:2px;flex-shrink:0;" aria-hidden="true">📊</span>' +
          '</button>'
        );
      };

      // v1.3.65-beta: in casual doubles, insert a 🔗 pill between the two
      // player chips inside winner AND loser sections (centered, calls
      // _liveScoreUnpair). No separate section — the chain sits right between
      // the partners' names where the user expects it.
      // v1.3.69-beta: usa _liveScoreUnpairFromStats (sem confirm, reabre setup
      // com jogadores corretos mesmo em viewOnly/histórico)
      var _chainBetweenChips = (isCasual && isDoubles)
        ? '<div style="display:flex;justify-content:center;padding:1px 0;">' +
            '<button type="button" onclick="window._liveScoreUnpairFromStats()" title="Desparear — volta à tela de formação de times" ' +
              'style="display:flex;align-items:center;justify-content:center;width:40px;height:22px;' +
              'border-radius:11px;border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.04);' +
              'cursor:pointer;font-size:0.85rem;line-height:1;color:var(--text-muted);transition:all 0.18s;' +
              '-webkit-tap-highlight-color:transparent;padding:0;">🔗</button>' +
          '</div>'
        : '';
      var winChipsHtml = '';
      for (var wi = 0; wi < winPlayers.length; wi++) {
        winChipsHtml += _playerChip(winPlayers[wi], true, winClr);
        if (wi === 0 && winPlayers.length > 1) winChipsHtml += _chainBetweenChips;
      }
      var loseChipsHtml = '';
      for (var li = 0; li < losePlayers.length; li++) {
        loseChipsHtml += _playerChip(losePlayers[li], false, loseClr);
        if (li === 0 && losePlayers.length > 1) loseChipsHtml += _chainBetweenChips;
      }

      // Comparative stats bar builder.
      // v1.0.33-beta: barras agora são SHARE-OF-TOTAL pra raw counts (sum=100%)
      // ou ABSOLUTE-PCT pra estatísticas que já são percentuais (maxCap=100).
      // Antes: max-relative (lado maior sempre em 100%) — dava impressão errada
      // de domínio. Bug reportado: "as barras coloridas de todas as estatisticas
      // percentuais tivessem o tamanho relativo (barra cheia em 100% e vazia
      // em 0% e do tamanho proporcional em qualquer valor entre cheia e
      // vazia)". Animação on-scroll via data-stat-bar + data-stat-count
      // (IntersectionObserver em window._initStatsAnimation).
      // v1.7.6-beta: _compareBar usa TIME 1 (direita, azul p1Clr) vs TIME 2 (esquerda, vermelho p2Clr).
      // Antes era vencedor/perdedor — ambas as barras podiam aparecer na mesma cor quando
      // o user confundia o mapeamento. Agora cores são FIXAS por time independente de quem ganhou.
      var _compareBar = function(label, icon, p1Val, p2Val, fmt, maxCap) {
        fmt = fmt || function(v) { return v; };
        var p1PctBar, p2PctBar;
        if (maxCap === 100) {
          // Stat já é percentual — barra reflete o valor diretamente.
          p1PctBar = Math.max(0, Math.min(100, p1Val));
          p2PctBar = Math.max(0, Math.min(100, p2Val));
        } else {
          // Raw counts — cada um pega sua fatia do total (sum=100%).
          var sum = (p1Val || 0) + (p2Val || 0);
          if (sum > 0) {
            p1PctBar = Math.round((p1Val || 0) / sum * 100);
            p2PctBar = 100 - p1PctBar;
          } else {
            p1PctBar = 0;
            p2PctBar = 0;
          }
        }
        var fmtSample = fmt(p1Val);
        var hasPctSuffix = (typeof fmtSample === 'string' && fmtSample.indexOf('%') !== -1);
        var dataSuffix = hasPctSuffix ? '%' : '';
        return (
          '<div style="display:flex;flex-direction:column;gap:4px;">' +
            '<div style="text-align:center;font-size:0.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">' + icon + ' ' + label + '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span data-stat-count="' + p2Val + '" data-stat-count-suffix="' + dataSuffix + '" style="flex:0 0 auto;min-width:36px;text-align:right;font-size:0.9rem;font-weight:900;color:' + p2Clr + ';font-variant-numeric:tabular-nums;">0' + dataSuffix + '</span>' +
              '<div style="flex:1;height:9px;border-radius:5px;overflow:hidden;background:rgba(255,255,255,0.05);display:flex;justify-content:flex-end;position:relative;">' +
                '<div data-stat-bar="' + p2PctBar + '" style="width:0%;height:100%;background:linear-gradient(90deg,' + p2Clr + '44,' + p2Clr + ');border-radius:5px 0 0 5px;transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>' +
              '</div>' +
              '<div style="width:1px;height:14px;background:rgba(255,255,255,0.2);"></div>' +
              '<div style="flex:1;height:9px;border-radius:5px;overflow:hidden;background:rgba(255,255,255,0.05);display:flex;">' +
                '<div data-stat-bar="' + p1PctBar + '" style="width:0%;height:100%;background:linear-gradient(90deg,' + p1Clr + ',' + p1Clr + '44);border-radius:0 5px 5px 0;transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>' +
              '</div>' +
              '<span data-stat-count="' + p1Val + '" data-stat-count-suffix="' + dataSuffix + '" style="flex:0 0 auto;min-width:36px;font-size:0.9rem;font-weight:900;color:' + p1Clr + ';font-variant-numeric:tabular-nums;">0' + dataSuffix + '</span>' +
            '</div>' +
          '</div>'
        );
      };

      var winHoldPct = winT.holdServed > 0 ? Math.round(winT.held / winT.holdServed * 100) : 0;
      var losHoldPct = losT.holdServed > 0 ? Math.round(losT.held / losT.holdServed * 100) : 0;
      var winServePctPts = winT.servePtsPlayed > 0 ? Math.round(winT.servePtsWon / winT.servePtsPlayed * 100) : 0;
      var losServePctPts = losT.servePtsPlayed > 0 ? Math.round(losT.servePtsWon / losT.servePtsPlayed * 100) : 0;
      var winRecvPct = winT.receivePtsPlayed > 0 ? Math.round(winT.receivePtsWon / winT.receivePtsPlayed * 100) : 0;
      var losRecvPct = losT.receivePtsPlayed > 0 ? Math.round(losT.receivePtsWon / losT.receivePtsPlayed * 100) : 0;
      var hasPointServeData = (winT.servePtsPlayed + losT.servePtsPlayed) > 0;
      var hasDeuceData = (winT.deucePtsPlayed + losT.deucePtsPlayed) > 0;
      // v1.7.6-beta: percentuais por time fixo (para _compareBar com p1Clr/p2Clr)
      var t1HoldPct = t1T.holdServed > 0 ? Math.round(t1T.held / t1T.holdServed * 100) : 0;
      var t2HoldPct = t2T.holdServed > 0 ? Math.round(t2T.held / t2T.holdServed * 100) : 0;
      var t1ServePctPts = t1T.servePtsPlayed > 0 ? Math.round(t1T.servePtsWon / t1T.servePtsPlayed * 100) : 0;
      var t2ServePctPts = t2T.servePtsPlayed > 0 ? Math.round(t2T.servePtsWon / t2T.servePtsPlayed * 100) : 0;
      var t1RecvPct = t1T.receivePtsPlayed > 0 ? Math.round(t1T.receivePtsWon / t1T.receivePtsPlayed * 100) : 0;
      var t2RecvPct = t2T.receivePtsPlayed > 0 ? Math.round(t2T.receivePtsWon / t2T.receivePtsPlayed * 100) : 0;

      // Comparative stats section — v1.7.6-beta: TIME 1 (azul) sempre direita, TIME 2 (vermelho) sempre esquerda
      var _t1Label = p1Players.length ? p1Players[0] : 'Time 1';
      var _t2Label = p2Players.length ? p2Players[0] : 'Time 2';
      var comparativeSection =
        '<div style="width:100%;max-width:380px;padding:clamp(12px,2.2vh,18px);border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);display:flex;flex-direction:column;gap:clamp(8px,1.6vh,14px);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
            '<span style="font-size:0.65rem;font-weight:800;color:' + p2Clr + ';text-transform:uppercase;letter-spacing:0.5px;max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">← ' + window._safeHtml(_t2Label) + '</span>' +
            '<span style="font-size:0.55rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;">⚖</span>' +
            '<span style="font-size:0.65rem;font-weight:800;color:' + p1Clr + ';text-transform:uppercase;letter-spacing:0.5px;max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;">' + window._safeHtml(_t1Label) + ' →</span>' +
          '</div>' +
          (useSets && !state.isFixedSet ? _compareBar('Sets', '🏅', t1T.sets, t2T.sets) : '') +
          (state.totalGamesPlayed > 0 ? _compareBar('Games', '🎾', t1T.games, t2T.games) : '') +
          _compareBar('Pontos', '🎯', t1T.points, t2T.points) +
          (hasPointServeData ? _compareBar('% Pontos no Saque', '🚀', t1ServePctPts, t2ServePctPts, function(v) { return v + '%'; }, 100) : '') +
          (hasPointServeData ? _compareBar('% Pontos na Recepção', '🎯', t1RecvPct, t2RecvPct, function(v) { return v + '%'; }, 100) : '') +
          (hasServeData ? _compareBar('Games Mantidos (saque)', '📊', t1HoldPct, t2HoldPct, function(v) { return v + '%'; }, 100) : '') +
          (hasServeData ? _compareBar('Quebras de Saque', '💥', t1T.breaks, t2T.breaks) : '') +
          (hasDeuceData ? _compareBar('Killer Points (40-40)', '⚡', t1T.deucePtsWon, t2T.deucePtsWon) : '') +
          _compareBar('Maior Sequência', '🔥', t1T.longestStreak, t2T.longestStreak) +
          _compareBar('Maior Vantagem', '📈', t1T.biggestLead, t2T.biggestLead) +
        '</div>';

      // Winner section: crown + clickable chips + score
      var winnerSection =
        '<div style="width:100%;max-width:380px;padding:clamp(10px,2vh,16px) clamp(10px,2vw,16px);border-radius:14px;background:linear-gradient(180deg,rgba(' + (winTeam === 1 ? '59,130,246' : '239,68,68') + ',0.16),rgba(' + (winTeam === 1 ? '59,130,246' : '239,68,68') + ',0.04));border:1px solid rgba(' + (winTeam === 1 ? '59,130,246' : '239,68,68') + ',0.4);display:flex;flex-direction:column;align-items:center;gap:clamp(6px,1.2vh,10px);">' +
          '<div style="font-size:clamp(1.8rem,6vw,2.8rem);line-height:1;">🏆</div>' +
          '<div style="font-size:0.6rem;font-weight:800;color:' + winClr + ';text-transform:uppercase;letter-spacing:2px;">Vencedor</div>' +
          '<div style="display:flex;flex-direction:column;align-items:stretch;gap:6px;width:100%;max-width:280px;">' + winChipsHtml + '</div>' +
          '<div style="display:flex;align-items:center;justify-content:center;gap:0;margin:4px 0 2px;">' + scoreSummary + '</div>' +
          '<div style="font-size:0.55rem;color:var(--text-muted);text-align:center;">💡 toque nos jogadores para ver estatísticas</div>' +
        '</div>';

      // Loser section: names as clickable chips
      var loserSection =
        '<div style="width:100%;max-width:380px;padding:clamp(8px,1.8vh,14px) clamp(10px,2vw,16px);border-radius:14px;background:linear-gradient(180deg,rgba(' + (winTeam === 1 ? '239,68,68' : '59,130,246') + ',0.08),rgba(' + (winTeam === 1 ? '239,68,68' : '59,130,246') + ',0.02));border:1px solid rgba(' + (winTeam === 1 ? '239,68,68' : '59,130,246') + ',0.25);display:flex;flex-direction:column;align-items:center;gap:clamp(4px,1vh,8px);opacity:0.94;">' +
          '<div style="font-size:0.6rem;font-weight:700;color:' + loseClr + ';text-transform:uppercase;letter-spacing:2px;opacity:0.8;">Perdedor</div>' +
          '<div style="display:flex;flex-direction:column;align-items:stretch;gap:4px;width:100%;max-width:260px;">' + loseChipsHtml + '</div>' +
        '</div>';

      var durationRow = elapsedStr
        ? '<div style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:0.75rem;color:var(--text-muted);"><span>⏱</span><span style="font-weight:700;color:var(--text-bright);">' + elapsedStr + '</span><span>de jogo</span></div>'
        : '';

      // Time-per-point analytics from pointLog timestamps
      function _fmtSec(ms) {
        if (ms == null) return '—';
        var s = Math.max(0, Math.round(ms / 1000));
        if (s < 60) return s + 's';
        var m = Math.floor(s / 60), ss = s % 60;
        return m + 'm' + String(ss).padStart(2, '0') + 's';
      }
      // v1.3.31-beta: refatorado pra usar window._computeMatchTimeStats
      // (mesmo helper de timeStatsRec, com filtro de curtos + detecção de
      // aquecimento). Tempo total do jogo (totalMs) NÃO é afetado pelo
      // warmup — usa o intervalo bruto de _matchStartTime → _matchEndTime
      // direto. avg/max/min usam o set "limpo".
      var _timeStats = null;
      if (state.pointLog && state.pointLog.length >= 2) {
        var tsPts = state.pointLog;
        var intervals = [];
        var prevT = _matchStartTime || null;
        for (var tpi = 0; tpi < tsPts.length; tpi++) {
          var ti = tsPts[tpi].t;
          if (!ti) continue;
          if (prevT) intervals.push(ti - prevT);
          prevT = ti;
        }
        var ts = window._computeMatchTimeStats(intervals);
        if (ts) {
          _timeStats = {
            totalMs: _matchStartTime && _matchEndTime ? (_matchEndTime - _matchStartTime) : null,
            avgMs: ts.avgMs,
            minMs: ts.minMs,
            maxMs: ts.maxMs,
            pointCount: tsPts.length,
            outlierFilteredCount: ts.outlierFilteredCount,
            warmupSkipped: ts.warmupSkipped,
            warmupMs: ts.warmupMs
          };
        }
      }
      var timeStatsSection = '';
      if (_timeStats) {
        var _tsBox = function(label, value, color) {
          return '<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);">' +
            '<span style="font-size:0.95rem;font-weight:800;color:' + (color || '#fff') + ';font-variant-numeric:tabular-nums;">' + value + '</span>' +
            '<span style="font-size:0.55rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;text-align:center;">' + label + '</span>' +
          '</div>';
        };
        // v1.3.32-beta: hint discreto quando o helper detectou aquecimento
        // inicial e SUBSTITUIU o 1º intervalo pela mediana (em vez de
        // excluir). Tempo total continua íntegro.
        var warmupHint = '';
        if (_timeStats.warmupSkipped && _timeStats.warmupMs) {
          warmupHint = '<div style="text-align:center;font-size:0.55rem;color:var(--text-muted);opacity:0.7;font-style:italic;">🏃 Aquecimento de ' + _fmtSec(_timeStats.warmupMs) + ' detectado — 1º ponto contado com tempo médio</div>';
        }
        timeStatsSection =
          '<div style="width:100%;max-width:380px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:8px;">' +
            '<div style="text-align:center;font-size:0.6rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;">⏱ Tempo</div>' +
            '<div style="display:flex;align-items:stretch;gap:6px;">' +
              _tsBox('Duração', _timeStats.totalMs ? _fmtSec(_timeStats.totalMs) : '—', '#fff') +
              _tsBox('Tempo/pt', _fmtSec(_timeStats.avgMs), '#60a5fa') +
              _tsBox('Mais longo', _fmtSec(_timeStats.maxMs), '#fbbf24') +
              _tsBox('Mais curto', _fmtSec(_timeStats.minMs), '#22c55e') +
            '</div>' +
            warmupHint +
          '</div>';
      }

      // Momentum graph: two cumulative lines (P1 blue, P2 red) with progressive draw animation
      var momentumSection = '';
      if (state.pointLog && state.pointLog.length >= 2) {
        var pts = state.pointLog;
        var width = 320, height = 140, padX = 26, padY = 18, padB = 22;
        var innerW = width - padX * 2, innerH = height - padY - padB;
        var p1Cum = [], p2Cum = [], setEnds = [], p1 = 0, p2 = 0;
        for (var gi = 0; gi < pts.length; gi++) {
          if (pts[gi].team === 1) p1++; else p2++;
          p1Cum.push(p1); p2Cum.push(p2);
          if (pts[gi].endSet) setEnds.push(gi);
        }
        var maxY = Math.max(p1, p2, 1);
        var xOf = function(i) { return padX + (pts.length === 1 ? innerW / 2 : i / (pts.length - 1) * innerW); };
        var yOf = function(v) { return padY + innerH - (v / maxY) * innerH; };
        // Build polyline points
        var p1Pts = '', p2Pts = '';
        for (var j = 0; j < pts.length; j++) {
          p1Pts += xOf(j).toFixed(1) + ',' + yOf(p1Cum[j]).toFixed(1) + ' ';
          p2Pts += xOf(j).toFixed(1) + ',' + yOf(p2Cum[j]).toFixed(1) + ' ';
        }
        // Horizontal grid lines with Y-axis labels
        var grid = '';
        var gridStep = maxY <= 10 ? 2 : (maxY <= 30 ? 5 : 10);
        for (var gv = 0; gv <= maxY; gv += gridStep) {
          var gy = yOf(gv).toFixed(1);
          grid += '<line x1="' + padX + '" y1="' + gy + '" x2="' + (width - padX) + '" y2="' + gy + '" stroke="rgba(255,255,255,0.05)" stroke-width="1" />';
          grid += '<text x="' + (padX - 5) + '" y="' + (parseFloat(gy) + 3) + '" fill="rgba(255,255,255,0.4)" font-size="8" text-anchor="end" font-family="monospace">' + gv + '</text>';
        }
        // Set boundaries (vertical dashed lines with S1/S2 labels at top)
        var setLines = '';
        for (var si2 = 0; si2 < setEnds.length; si2++) {
          var sx = xOf(setEnds[si2]).toFixed(1);
          setLines += '<line x1="' + sx + '" y1="' + padY + '" x2="' + sx + '" y2="' + (height - padB) + '" stroke="rgba(255,255,255,0.18)" stroke-width="1" stroke-dasharray="3,3" />';
          setLines += '<text x="' + sx + '" y="' + (padY - 5) + '" fill="rgba(255,255,255,0.55)" font-size="9" text-anchor="middle" font-family="monospace" font-weight="700">S' + (si2 + 1) + '</text>';
        }
        // Final score labels at end of each line
        var endX = xOf(pts.length - 1).toFixed(1);
        var p1EndY = yOf(p1).toFixed(1);
        var p2EndY = yOf(p2).toFixed(1);
        var p1Label = p1Players.length > 1 ? p1Players.join(' / ') : (p1Players[0] || 'Time 1');
        var p2Label = p2Players.length > 1 ? p2Players.join(' / ') : (p2Players[0] || 'Time 2');
        // Unique animation name — re-triggers the CSS animation every time the finish state renders
        var animId = 'mom-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);

        momentumSection =
          '<div style="width:100%;max-width:380px;padding:clamp(10px,2vh,14px) clamp(8px,1.5vw,12px);border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px;">' +
              '<div style="font-size:0.6rem;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:1.5px;">📈 Momentum da Partida</div>' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<div style="font-size:0.58rem;color:var(--text-muted);font-weight:600;">' + pts.length + ' pts</div>' +
                '<button id="mom-replay-btn" style="padding:3px 8px;border-radius:6px;font-size:0.6rem;font-weight:700;border:1px solid rgba(251,191,36,0.35);cursor:pointer;background:rgba(251,191,36,0.1);color:#fbbf24;">↻ Replay</button>' +
              '</div>' +
            '</div>' +
            '<style>' +
              '@keyframes ' + animId + ' { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }' +
              '@keyframes ' + animId + '-pop { 0%,80%{transform:scale(0);opacity:0} 100%{transform:scale(1);opacity:1} }' +
              '.' + animId + '-line { stroke-dasharray: 100; stroke-dashoffset: 100; animation: ' + animId + ' 2.8s cubic-bezier(0.4,0,0.2,1) forwards; }' +
              '.' + animId + '-dot { transform-origin: center; transform-box: fill-box; animation: ' + animId + '-pop 3s ease-out forwards; }' +
            '</style>' +
            '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" style="max-width:' + width + 'px;display:block;margin:0 auto;overflow:visible;">' +
              grid +
              setLines +
              // Baseline (x-axis)
              '<line x1="' + padX + '" y1="' + (height - padB) + '" x2="' + (width - padX) + '" y2="' + (height - padB) + '" stroke="rgba(255,255,255,0.3)" stroke-width="1" />' +
              // P1 line (blue)
              '<polyline class="' + animId + '-line" points="' + p1Pts + '" pathLength="100" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 3px rgba(59,130,246,0.5));" />' +
              // P2 line (red)
              '<polyline class="' + animId + '-line" points="' + p2Pts + '" pathLength="100" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 3px rgba(239,68,68,0.5));" />' +
              // End markers (appear after animation finishes)
              '<circle class="' + animId + '-dot" cx="' + endX + '" cy="' + p1EndY + '" r="4.5" fill="#3b82f6" stroke="#fff" stroke-width="1.8" />' +
              '<circle class="' + animId + '-dot" cx="' + endX + '" cy="' + p2EndY + '" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.8" />' +
              // Final score labels next to end markers
              '<text class="' + animId + '-dot" x="' + (parseFloat(endX) + 8) + '" y="' + (parseFloat(p1EndY) + 3) + '" fill="#60a5fa" font-size="10" font-weight="700" font-family="monospace">' + p1 + '</text>' +
              '<text class="' + animId + '-dot" x="' + (parseFloat(endX) + 8) + '" y="' + (parseFloat(p2EndY) + 3) + '" fill="#f87171" font-size="10" font-weight="700" font-family="monospace">' + p2 + '</text>' +
            '</svg>' +
            '<div style="display:flex;align-items:center;justify-content:center;gap:14px;padding:0 4px;font-size:0.6rem;">' +
              '<span style="display:flex;align-items:center;gap:5px;"><span style="width:14px;height:3px;border-radius:2px;background:#3b82f6;"></span><span style="color:#60a5fa;font-weight:700;">' + window._safeHtml(p1Label) + '</span></span>' +
              '<span style="display:flex;align-items:center;gap:5px;"><span style="width:14px;height:3px;border-radius:2px;background:#ef4444;"></span><span style="color:#f87171;font-weight:700;">' + window._safeHtml(p2Label) + '</span></span>' +
            '</div>' +
          '</div>';
      }

      // Finish-screen action section.
      // Tournament match: single "Confirmar Resultado" button that persists the
      // result, advances the winner in the bracket, and closes the overlay so
      // the user lands on the bracket (already anchored to the match card).
      // Casual match: original "Jogar Novamente" + optional "Re-sortear duplas"
      // toggle for doubles — both stay within thumb-reach at the top.
      var restartSection = '';
      if (!isCasual) {
        // v2.1.39: resultado já foi salvo na chave no último ponto (auto). Aqui
        // não há "Confirmar" — só "Voltar" (topo-esquerda), que leva ao jogo na chave.
        restartSection =
          '<div style="display:flex;"><button onclick="window._liveScoreBackToBracket()" class="live-vol" style="display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:14px;font-size:1.05rem;font-weight:800;border:none;cursor:pointer;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;">← Voltar</button></div>';
      } else if (isDoubles) {
        // v1.6.11-beta: Rei/Rainha — botão contextual por rodada
        if (_reiRainhaMode) {
          if (_reiRainhaRound < 2) {
            var _rrNextNum = _reiRainhaRound + 2; // ex: rodada 0→mostra "Jogo 2"
            restartSection =
              '<button onclick="window._reiRainhaNextRound()" style="width:100%;padding:13px 18px;border-radius:14px;font-size:1rem;font-weight:800;border:none;cursor:pointer;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;box-shadow:0 4px 20px rgba(245,158,11,0.4);display:flex;align-items:center;justify-content:center;gap:8px;">' +
                '<span>⚡ Jogo ' + _rrNextNum + ' de 3</span>' +
                '<span style="font-size:1.1rem;">→</span>' +
              '</button>';
          } else {
            restartSection =
              '<button onclick="window._reiRainhaShowFinal()" style="width:100%;padding:13px 18px;border-radius:14px;font-size:1rem;font-weight:800;border:none;cursor:pointer;background:linear-gradient(135deg,#f59e0b,#b45309);color:white;box-shadow:0 4px 20px rgba(245,158,11,0.5);display:flex;align-items:center;justify-content:center;gap:8px;">' +
                '<span>👑 Ver Resultado Final</span>' +
              '</button>';
          }
        } else {
        // v2.2.1-beta: 3 toggles na página de estatísticas (Sortear, Mistas, Rei/Rainha)
        var _statsMixedRow = _canShowMixedToggle()
          ? '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:10px;background:rgba(236,72,153,0.07);border:1px solid rgba(236,72,153,0.18);cursor:pointer;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:0.9rem;">⚤</span>' +
                '<span style="font-size:0.72rem;font-weight:700;color:#f472b6;">Duplas Mistas</span>' +
              '</div>' +
              '<span class="toggle-switch toggle-sm" style="flex-shrink:0;">' +
                '<input type="checkbox" id="chk-stats-mixed" ' + (_mixedDoublesEnabled ? 'checked' : '') + ' onchange="window._statsToggleMixed(this)" />' +
                '<span class="toggle-slider"></span>' +
              '</span>' +
            '</label>'
          : '';
        restartSection =
          '<div style="display:flex;flex-direction:column;gap:6px;width:100%;">' +
            '<button id="live-restart-btn" onclick="window._liveScoreGoToSetup()" style="width:100%;padding:12px;border-radius:12px;font-size:0.92rem;font-weight:800;border:none;cursor:pointer;background:linear-gradient(135deg,#10b981,#059669);color:white;box-shadow:0 4px 20px rgba(16,185,129,0.4);">🔄 Iniciar</button>' +
            '<button onclick="window._liveStatsClose()" style="width:100%;padding:9px;border-radius:10px;font-size:0.8rem;font-weight:700;border:1px solid rgba(255,255,255,0.12);cursor:pointer;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);">✕ Encerrar</button>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:10px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.18);cursor:pointer;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:0.9rem;">🔀</span>' +
                '<span style="font-size:0.72rem;font-weight:700;color:#fbbf24;">Sortear Duplas</span>' +
              '</div>' +
              '<span class="toggle-switch toggle-sm" style="flex-shrink:0;">' +
                '<input type="checkbox" id="chk-stats-shuffle" ' + (autoShuffle ? 'checked' : '') + ' onchange="window._statsToggleShuffle(this)" />' +
                '<span class="toggle-slider"></span>' +
              '</span>' +
            '</label>' +
            _statsMixedRow +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:10px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);cursor:pointer;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:0.9rem;">👑</span>' +
                '<span style="font-size:0.72rem;font-weight:700;color:#f59e0b;">Rei/Rainha</span>' +
              '</div>' +
              '<span class="toggle-switch toggle-sm" style="flex-shrink:0;">' +
                '<input type="checkbox" id="chk-stats-rr" onchange="window._statsToggleReiRainha(this)" />' +
                '<span class="toggle-slider"></span>' +
              '</span>' +
            '</label>' +
          '</div>';
        }
      } else {
        restartSection =
          '<div style="display:flex;gap:8px;width:100%;">' +
            '<button id="live-restart-btn" onclick="window._liveScoreGoToSetup()" style="flex:1;padding:14px;border-radius:12px;font-size:0.95rem;font-weight:800;border:none;cursor:pointer;background:linear-gradient(135deg,#10b981,#059669);color:white;box-shadow:0 4px 20px rgba(16,185,129,0.4);">🔄 Iniciar</button>' +
            '<button onclick="window._liveScoreShareCasual()" title="Compartilhar resultado" style="flex:0 0 auto;padding:14px 16px;border-radius:12px;font-size:0.95rem;font-weight:800;border:none;cursor:pointer;background:#25d366;color:white;box-shadow:0 4px 20px rgba(37,211,102,0.3);">📤</button>' +
            /* x-canon-exempt: fechar modal/overlay — não é cancelar/remover; pendente decisão do dono */ '<button onclick="window._liveStatsClose()" title="Encerrar" style="flex:0 0 auto;padding:14px 16px;border-radius:12px;font-size:0.95rem;font-weight:800;border:none;cursor:pointer;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);">✕</button>' +
          '</div>';
      }

      // v1.3.33-beta: slot pra sugestões de vínculo guest→user real.
      // Hidratado async (precisa fetch de friend profiles). Empty quando
      // não há candidatos ou não é casual.
      var linkSuggestionsSlot = isCasual ? '<div id="casual-link-suggestions-slot" style="width:100%;max-width:380px;"></div>' : '';

      // v1.7.4-beta: slot para as últimas partidas na modalidade —
      // populado async após render. Exibido tanto em casuais quanto em
      // torneios, filtrando pela mesma modalidade da partida atual.
      var liveStatsLastMatchesSlot = '<div id="live-stats-last-matches-slot" style="width:100%;max-width:420px;"></div>';

      // Chain pill is now injected inline between chips — no separate section.
      var unpairChainHtml = '';

      // Action section pinned at the TOP — "Jogar Novamente" (and optional
      // shuffle toggle for doubles) are always within thumb-reach. Clicking
      // "Jogar Novamente" or "✕ Fechar" both persist the result as confirmed.
      container.innerHTML =
        '<div style="flex-shrink:0;padding:calc(8px + env(safe-area-inset-top, 0px)) 1rem 8px;display:flex;flex-direction:column;gap:8px;background:#0a0e1a;border-bottom:1px solid rgba(255,255,255,0.06);">' +
          restartSection +
        '</div>' +
        '<div style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;width:100%;padding:clamp(8px,2vh,16px) clamp(12px,3vw,24px) calc(8px + env(safe-area-inset-bottom, 0px));gap:clamp(8px,1.5vh,14px);">' +
          winnerSection +
          unpairChainHtml +
          momentumSection +
          comparativeSection +
          loserSection +
          timeStatsSection +
          (timeStatsSection ? '' : durationRow) +
          linkSuggestionsSlot +
          liveStatsLastMatchesSlot +
        '</div>';
      // v1.3.33-beta: hidrata sugestões de vínculo guest→friend
      if (isCasual && typeof window._hydrateCasualLinkSuggestions === 'function') {
        setTimeout(function() { window._hydrateCasualLinkSuggestions(); }, 200);
      }
      // v1.7.5-beta: "Últimas Partidas" populado APÓS write confirmado.
      // _hydrateStatsLastMatchesSlotFn é chamada de _saveResult().then() em vez
      // de um timeout fixo que podia disparar antes da escrita chegar ao servidor.
      // Fallback: se _statsSlotWriteConfirmed (re-render com escrita já concluída),
      // dispara com delay pequeno para garantir que o DOM slot está disponível.
      (function() {
        var _statsSlotSport = isCasual ? (opts && opts.sportName || '') : (t && t.sport || '');
        var _statsSlotIsCasual = isCasual;
        _hydrateStatsLastMatchesSlotFn = function() {
          var slot = document.getElementById('live-stats-last-matches-slot');
          if (!slot) return;
          var cu = window.AppStore && window.AppStore.currentUser;
          if (!cu || !cu.uid || !window.FirestoreDB || typeof window.FirestoreDB.loadRecentCasualMatchesForUser !== 'function') return;
          window.FirestoreDB.loadRecentCasualMatchesForUser(cu.uid, 15).then(function(allMatches) {
            if (!allMatches || allMatches.length === 0) return;
            // Apenas partidas concluídas com vencedor definido
            allMatches = allMatches.filter(function(m) {
              var w = m.result && m.result.winner;
              return w === 1 || w === 2;
            });
            // Filtro por modalidade quando disponível
            var filtered = _statsSlotSport
              ? allMatches.filter(function(m) { return (m.sport || '') === _statsSlotSport; })
              : allMatches;
            // v1.7.7-beta: filtro de segurança — só exibe partidas com roomCode
            // (partidas antigas podem não ter roomCode; sem ele o botão navega pra fora do overlay)
            allMatches = allMatches.filter(function(m) { return !!m.roomCode; });
            filtered = _statsSlotSport
              ? allMatches.filter(function(m) { return (m.sport || '') === _statsSlotSport; })
              : allMatches;
            // Máximo 3 partidas; se não há para a modalidade, usa todas
            var matches = (filtered.length > 0 ? filtered : allMatches).slice(0, 3);
            if (matches.length === 0) return;

            // Atualiza cache global (para _casualOpenPastMatch)
            if (!window._casualPastMatchesCache) window._casualPastMatchesCache = {};
            matches.forEach(function(m) { if (m.roomCode) window._casualPastMatchesCache[m.roomCode] = m; });

            var cardsHtml = window._buildCasualMatchCardsHtml(matches, cu);

            // Ordem de exibição: mais recente à esquerda (grid da esquerda pra direita = índice 0=último, 1=penúltimo, 2=antepenúltimo)
            var typeLabel = _statsSlotIsCasual ? '⚡ Casual' : '🏆 Torneio';
            slot.innerHTML =
              '<div style="font-size:0.6rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;text-align:left;">' +
                typeLabel + (_statsSlotSport ? (' · ' + window._safeHtml(_statsSlotSport)) : '') + ' — Últimas Partidas' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">' + cardsHtml + '</div>' +
              '<div style="text-align:center;font-size:0.54rem;color:var(--text-muted);opacity:0.7;font-style:italic;margin-top:5px;">Toque pra ver as estatísticas</div>';
          }).catch(function(e) { window._warn('[LiveStats] last matches err:', e); });
        };
        // Fallback para re-render quando write já confirmou anteriormente
        if (_statsSlotWriteConfirmed) {
          setTimeout(_hydrateStatsLastMatchesSlotFn, 150);
        }
        // v1.7.7-beta: fallback incondicional de 1500ms — garante que a seção
        // aparece mesmo quando _saveResult não foi chamado (torneios, re-renders)
        // ou quando a Promise de write demora além do esperado.
        setTimeout(function() {
          if (typeof _hydrateStatsLastMatchesSlotFn === 'function') {
            _hydrateStatsLastMatchesSlotFn();
          }
        }, 1500);
      })();
      // v1.0.33-beta: dispara animação on-scroll de barras + contadores nos
      // blocos de stats (_compareBar, etc).
      if (typeof window._initStatsAnimation === 'function') {
        window._initStatsAnimation(container);
      }

      // v2.2.18-beta: casual — stats aparecem automaticamente para todos os
      // UIDs reais; ✕ Fechar desnecessário (encerramento via botão no próprio
      // painel). Torneio: mantém ✕ (único caminho pra sair do overlay).
      var hdrActions = document.getElementById('live-score-header-actions');
      if (hdrActions) {
        if (isCasual) {
          hdrActions.style.display = 'none';
        } else {
          hdrActions.style.display = '';
          var resetBtn = hdrActions.querySelector('button[onclick*="_liveScoreReset"]');
          if (resetBtn) resetBtn.style.display = 'none';
        }
      }
      // Wire up Replay button — re-renders the finish view to re-trigger the SVG draw animation
      setTimeout(function() {
        var replayBtn = document.getElementById('mom-replay-btn');
        if (replayBtn) {
          replayBtn.addEventListener('click', function() {
            _render();
          });
        }
      }, 0);
      _syncLiveState();
      return;
    }

    // v2.2.34-beta: ESTADO ATIVO — garante que os botões do cabeçalho
    // (⚙️ Ajustar / ↺ Resetar / ✕ Fechar) estejam VISÍVEIS. O finished-render
    // os esconde (v2.2.18 casual) e, no Rei/Rainha, o MESMO overlay é reusado
    // pra próxima rodada — sem isto, o cabeçalho sumia após iniciar a rodada.
    var _hdrAct = document.getElementById('live-score-header-actions');
    if (_hdrAct) {
      _hdrAct.style.display = 'flex';
      var _rstBtn = _hdrAct.querySelector('button[onclick*="_liveScoreReset"]');
      if (_rstBtn) _rstBtn.style.display = '';
    }

    // Current game display — no "GAME" label, only special states
    var gameLabel = '';
    var p1Display, p2Display;
    if (!useSets || state.isFixedSet) {
      gameLabel = '';
      p1Display = String(state.currentGameP1);
      p2Display = String(state.currentGameP2);
    } else if (_isDecidingSet()) {
      gameLabel = 'SUPER TIE-BREAK';
      p1Display = String(state.currentGameP1);
      p2Display = String(state.currentGameP2);
    } else if (state.isTiebreak) {
      gameLabel = 'TIE-BREAK';
      p1Display = String(state.currentGameP1);
      p2Display = String(state.currentGameP2);
    } else {
      gameLabel = '';
      p1Display = _formatGamePoint(state.currentGameP1, state.currentGameP2, false);
      p2Display = _formatGamePoint(state.currentGameP2, state.currentGameP1, false);
    }

    // v1.3.66-beta: killing point (40-40 / deuce) detection — plates turn
    // orange with white text. Only in GSM tennis mode when both players have
    // 3+ raw points AND are equal (pure deuce, not advantage state).
    var _isDeuce = useSets && !state.isFixedSet && !state.isTiebreak && !_isDecidingSet() &&
      state.currentGameP1 >= 3 && state.currentGameP2 >= 3 &&
      state.currentGameP1 === state.currentGameP2 && !state.isFinished;

    // Games in current set
    var gamesP1Str = '', gamesP2Str = '';
    var showGamesBox = useSets && !state.isFixedSet && !state.isFinished;
    if (showGamesBox) {
      var cs = _currentSet();
      gamesP1Str = String(cs.gamesP1);
      gamesP2Str = String(cs.gamesP2);
    }

    // Sets display — suppressed (already shown in the games box below)
    var setsRow = '';

    // Serving info
    var serverInfo = _getCurrentServer();

    // Build stacked player names in team box (bracket-style)
    // Serve ball inside team box, left of the serving player's row, draggable to change server
    var _canDragServe = !state.isFinished && !state.serveSkipped && isDoubles && state.totalGamesPlayed < 2;
    var _buildNameStack = function(team, mirror) {
      // mirror=true (usado no time DIREITO em paisagem): nome à esquerda, foto/
      // ícone à DIREITA, texto alinhado à direita (espelha o lado esquerdo).
      var _mirrorCard = mirror ? 'flex-direction:row-reverse;' : '';
      var _mirrorText = mirror ? 'text-align:right;' : '';
      var players = team === 1 ? p1Players : p2Players;
      var clr = team === 1 ? '#3b82f6' : '#ef4444';
      var bgClr = team === 1 ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.12)';
      var bdrClr = team === 1 ? 'rgba(59,130,246,0.30)' : 'rgba(239,68,68,0.30)';
      var cards = '';
      // v4.0.4: a bola de saque deve aparecer em UM jogador só. Quando os 2
      // jogadores do time têm o mesmo nome (ex.: "Parceiro"/"Parceiro"), casar
      // por nome acendia a bola nos DOIS. Casa por pIdx (posição) quando existe;
      // senão, mostra no 1º que bate o nome (guarda _ballShown).
      var _ballShown = false;
      for (var ni = 0; ni < players.length; ni++) {
        var pn = players[ni];
        var isServing = false;
        if (serverInfo && !state.isFinished && serverInfo.team === team) {
          if (serverInfo.pIdx != null) {
            isServing = (serverInfo.pIdx === ni);
          } else if (serverInfo.name === pn && !_ballShown) {
            isServing = true;
          }
          if (isServing) _ballShown = true;
        }
        var fullName = window._safeHtml(pn);
        var avatar = '<span class="live-av-wrap">' + _liveAvatarHtml(pn, 30) + '</span>';

        // Serve ball: shown for the current server. Draggable when serve can still be changed.
        var servBall = '';
        if (isServing) {
          var dragAttr = _canDragServe ? ' draggable="true" data-serve-ball="true"' : '';
          var dragStyle = _canDragServe ? 'cursor:grab;' : 'cursor:default;';
          var ballTitle = _canDragServe ? 'Arraste para trocar sacador' : 'Ordem de saque travada (após 2 jogos)';
          // Dimmer glow + subtle 🔒 badge when locked
          var ballGlow = _canDragServe ? 'filter:drop-shadow(0 0 4px rgba(255,200,0,0.6));' : 'filter:drop-shadow(0 0 2px rgba(255,200,0,0.3));opacity:0.85;';
          // v1.9.70: cadeado ABAIXO da bola (em coluna), não ao lado — economiza
          // largura pra foto/ícone e nome dos jogadores.
          var lockBadge = _canDragServe ? '' : '<span style="font-size:0.5rem;line-height:1;opacity:0.85;margin-top:3px;" aria-hidden="true">🔒</span>';
          servBall = '<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;line-height:1;gap:0;">' +
            '<span' + dragAttr + ' title="' + ballTitle + '" style="font-size:0.85rem;line-height:1;' + dragStyle + ballGlow + '">' + _sportBall + '</span>' +
            lockBadge +
          '</span>';
        }

        // Drop target: each player row is a drop target for the serve ball
        var dropAttr = _canDragServe ? ' data-serve-drop="' + team + '-' + ni + '"' : '';
        // v1.3.14-beta: card inteiro do jogador-sacador vira zona de drag da
        // bola — antes só o span do ícone reagia, e o card vazava o touchstart
        // pro court-side, fazendo "trocar bola" virar "trocar lado da quadra".
        // User: "se o usuário clicar na bolinha (ou perto dela), arrasta a
        // bolinha e não o lado da quadra".
        var ballCardAttr = (isServing && _canDragServe) ? ' data-serve-ball-card="true"' : '';

        // Individual player box
        cards += '<div' + dropAttr + ballCardAttr + ' onclick="window._liveEditName(' + team + ',' + ni + ')" style="cursor:pointer;display:flex;' + _mirrorCard + 'align-items:center;gap:5px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);transition:transform 0.15s,background 0.15s;min-width:0;">' +
          servBall +
          avatar +
          '<span style="flex:1;min-width:0;' + _mirrorText + 'font-size:calc(clamp(0.72rem,2.2vw,0.88rem) * var(--live-name-scale,1));font-weight:' + (isServing ? '800' : '600') + ';color:' + (isServing ? '#fbbf24' : 'rgba(255,255,255,0.92)') + ';white-space:normal;overflow-wrap:break-word;word-break:normal;hyphens:none;line-height:1.15;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;">' + fullName + '</span>' +
        '</div>';
      }
      // Team box wrapping all players
      // v1.9.68: classe live-namestack → equalização de altura pós-render
      // pra os dois lados (esquerdo/direito) ficarem na mesma altura,
      // alinhando placares e botões mesmo com nomes de tamanhos diferentes.
      return '<div class="live-namestack" style="display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:4px;padding:8px 10px;border-radius:12px;background:' + bgClr + ';border:1px solid ' + bdrClr + ';">' + cards + '</div>';
    };

    // Arrow button builder — extra large for courtside tapping (passo 1 do
    // caminho mobile-first: tap target gordo, tipografia XL, cores atuais).
    var _upBtn = function(player) {
      var clr = player === 1 ? '#3b82f6' : '#ef4444';
      return '<button class="live-vol" onclick="window._liveScorePoint(' + player + ')" style="width:100%;padding:0;border:none;cursor:pointer;background:' + clr + ';color:#fff;font-size:calc(clamp(3.8rem,9vw,5rem) * var(--live-btn-scale,1));font-weight:900;border-radius:18px 18px 0 0;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;min-height:calc(clamp(120px,22vh,180px) * var(--live-btn-scale,1));box-shadow:0 4px 14px rgba(0,0,0,0.4);transition:transform 0.08s;" ontouchstart="this.style.transform=\'scale(0.96)\'" ontouchend="this.style.transform=\'\'">▲</button>';
    };
    var _downBtn = function(player) {
      return '<button class="live-vol-sm" onclick="window._liveScoreMinus(' + player + ')" style="width:100%;padding:0;border:none;cursor:pointer;background:rgba(255,255,255,0.08);color:var(--text-muted);font-size:1.2rem;font-weight:700;border-radius:0 0 16px 16px;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;min-height:clamp(52px,8vh,72px);border-top:1px solid rgba(255,255,255,0.06);" ontouchstart="this.style.background=\'rgba(255,255,255,0.15)\'" ontouchend="this.style.background=\'\'">▼</button>';
    };

    // Finish button (isFinished handled above with early return)
    var finishBtn = '';
    if (!useSets) {
      finishBtn = '<div style="padding:0 1rem;flex-shrink:0;margin-top:auto;padding-bottom:1rem;"><button class="live-vol" onclick="window._liveScoreFinish()" style="width:100%;padding:20px;border-radius:16px;font-size:1.15rem;font-weight:800;border:2px solid rgba(16,185,129,0.35);cursor:pointer;min-height:64px;' +
        'background:rgba(16,185,129,0.12);color:#10b981;">Encerrar Partida</button></div>';
    }

    // ── FULLSCREEN LAYOUT ──
    // Portrait: names above plates, games below.
    // Landscape (wider than tall): names on outer sides, games between plates.
    // Detect via JS — CSS media queries won't work for inline styles.
    var isLandscape = window.innerWidth > window.innerHeight;

    // Game label color (only for special states)
    var labelClr = state.isFinished ? '#10b981' : '#c084fc';

    // Court sides state: which team is on left vs right (swappable)
    // v1.9.64: "fixar lados" DESATIVADO (padrão) → o time SACADOR fica sempre à
    // esquerda e o recebedor à direita; como o sacador alterna a cada game, os
    // lados invertem a cada novo saque (lê-se o placar: sacador primeiro). As
    // CORES seguem o TIME (azul/vermelho), não o lado — preservadas na virada.
    // ATIVADO → lados fixos (_courtLeft só muda por arrasto manual).
    // v2.3.72 FIX: NO TIE-BREAK os lados NÃO invertem por saque. Bug grave: o
    // saque alterna a cada 1-2 pontos no tie-break, então os times trocavam de
    // lado quase a cada ponto — o usuário tocava pela POSIÇÃO e marcava no time
    // ERRADO, deixando o placar empatado pra sempre (nunca atingindo a margem
    // de 2 e não terminando). Durante o tie-break os lados ficam congelados.
    if (!_liveScorePrefs.fixSides && !state.isTiebreak && !_isDecidingSet() &&
        serverInfo && (serverInfo.team === 1 || serverInfo.team === 2)) {
      _courtLeft = serverInfo.team;
    }
    var leftTeam = _courtLeft; // 1 or 2
    var rightTeam = leftTeam === 1 ? 2 : 1;

    // Games center column — colors follow court sides (left team color left, right team color right)
    var _gamesLeftStr = leftTeam === 1 ? gamesP1Str : gamesP2Str;
    var _gamesRightStr = rightTeam === 1 ? gamesP1Str : gamesP2Str;
    var _gamesLeftClr = leftTeam === 1 ? '#60a5fa' : '#f87171';
    var _gamesRightClr = rightTeam === 1 ? '#60a5fa' : '#f87171';
    var gamesCenter = '';
    if (showGamesBox) {
      gamesCenter =
        '<div class="live-games-box" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:4px clamp(14px,3.5vw,22px);">' +
          '<span style="font-size:0.62rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Games</span>' +
          '<div style="display:flex;align-items:center;gap:clamp(10px,3vw,18px);">' +
            '<span style="font-size:calc(clamp(3rem,11vw,5rem) * var(--live-score-scale,1));font-weight:900;color:' + _gamesLeftClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + _gamesLeftStr + '</span>' +
            '<span style="font-size:calc(clamp(1.6rem,5vw,2.6rem) * var(--live-score-scale,1));font-weight:300;color:rgba(255,255,255,0.25);">–</span>' +
            '<span style="font-size:calc(clamp(3rem,11vw,5rem) * var(--live-score-scale,1));font-weight:900;color:' + _gamesRightClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + _gamesRightStr + '</span>' +
          '</div>' +
        '</div>';
    }

    // Score plate builder — extra large for visibility from afar.
    // v1.3.66-beta: orange background + white text at deuce (40-40).
    var _buildPlate = function(player) {
      var clr = player === 1 ? 'rgba(59,130,246,0.25)' : 'rgba(239,68,68,0.25)';
      var display = player === 1 ? p1Display : p2Display;
      var plateBg = _isDeuce ? '#f97316' : '#fff';
      var plateClr = _isDeuce ? '#fff' : '#111';
      // v4.5.31: a placa BRANCA abraça o número (height:auto). Raio e padding
      // FIXOS (não escalam com o slider — senão só cresceria vazio/arredondamento).
      // O número preenche a MAIOR parte da placa; _fitLivePlateText dimensiona por
      // referência FIXA de 2 dígitos → 0/15/30/40/AD TODOS no MESMO tamanho e peso.
      // overflow:hidden é rede de segurança contra estouro em escalas extremas.
      return '<div class="ls-plate-box" style="width:100%;height:auto;background:' + plateBg + ';border-radius:16px;padding:3px 8px;box-shadow:0 6px 36px rgba(0,0,0,0.5),0 0 0 4px ' + clr + ';display:flex;align-items:center;justify-content:center;overflow:hidden;">' +
        '<span class="ls-plate-num" style="font-size:calc(clamp(3rem,30vw,9rem) * var(--live-plate-scale,1));font-weight:900;color:' + plateClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + display + '</span>' +
      '</div>';
    };

    // v4.5.33: dimensiona o número das metades (.ls-score-half) medindo a FONTE
    // REAL — cria um "40" invisível a 100px, mede a largura de 2 dígitos e calcula
    // o font-size pra "40" caber ~90% da largura da metade. Assim NUNCA estoura
    // (independente de aparelho/fonte), TODOS os valores ficam no MESMO tamanho
    // (a referência é sempre "40", não o valor atual → sem glitch por conteúdo),
    // e o slider "Placar" cresce até ~99% e trava (não clipa). Mede clientWidth em
    // DUPLO RAF (layout assentado). Também limita pela altura da metade.
    var _doFitLivePlateText = function(ov) {
      var halves = ov.querySelectorAll('.ls-score-half');
      if (!halves.length) return;
      var ps = parseFloat(getComputedStyle(ov).getPropertyValue('--live-plate-scale')) || 1;
      if (!(ps > 0)) ps = 1;
      // largura de "40" (pior caso) a 100px, medindo a fonte real da 1ª metade.
      var probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;font-weight:900;font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;font-size:100px;';
      probe.textContent = '40';
      halves[0].appendChild(probe);
      var w2 = probe.scrollWidth;
      if (probe.parentNode) probe.parentNode.removeChild(probe);
      if (w2 <= 0) return;
      var minW = Infinity, minH = Infinity;
      halves.forEach(function(h) {
        if (h.clientWidth > 10 && h.clientWidth < minW) minW = h.clientWidth;
        if (h.clientHeight > 10 && h.clientHeight < minH) minH = h.clientHeight;
      });
      if (minW === Infinity) return;
      // "40" ocupa 96% da largura no padrão (ps=1) — o máximo que cabe em 2
      // dígitos lado a lado sem clipar; teto = 99% (nunca estoura). Em retrato a
      // LARGURA é o limite físico (não dá pra fazer o número muito mais alto sem
      // 2 dígitos passarem da metade da tela).
      var baseFs = 0.96 * minW * 100 / w2;
      var capFs  = 0.99 * minW * 100 / w2;
      var fs = Math.min(baseFs * ps, capFs);
      // v4.5.41: scaleY SÓ no retrato (metade estreita e alta → estica pra
      // preencher). Em PAISAGEM a metade é larga e baixa → scaleY=1 deixa o
      // número MUITO maior (limitado só pela altura real, não por altura*1.35).
      var SY = (window.innerWidth > window.innerHeight) ? 1 : 1.35;
      // a altura VISUAL é fs*SY; garante que não passe da altura da metade.
      if (minH !== Infinity && fs * SY > minH * 0.96) fs = minH * 0.96 / SY;
      fs = Math.floor(fs);
      if (fs < 12) return;
      halves.forEach(function(h) {
        var n = h.querySelector('.ls-plate-num');
        if (n) { n.style.fontSize = fs + 'px'; n.style.transform = 'scaleY(' + SY + ')'; }
      });
    };
    var _fitLivePlateText = function() {
      var ov = document.getElementById('live-scoring-overlay');
      if (!ov) return;
      // v4.5.34: SÍNCRONO primeiro — mede o DOM recém-inserido (a leitura de
      // clientWidth força o reflow), então o número já sai no tamanho certo sem
      // depender do rAF (que às vezes não aplicava → número no fallback do CSS,
      // clipando em telas estreitas). rAF + timeout reforçam pós-fontes/fotos.
      _doFitLivePlateText(ov);
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          var el = document.getElementById('live-scoring-overlay');
          if (el) _doFitLivePlateText(el);
        });
      });
      setTimeout(function() {
        var el = document.getElementById('live-scoring-overlay');
        if (el) _doFitLivePlateText(el);
      }, 180);
    };
    window._fitLivePlateText = _fitLivePlateText;
    // v4.5.34: re-ajusta ao mudar a largura (rotação/resize) — antes o número
    // ficava com o tamanho medido na largura anterior e CLIPAVA quando estreitava.
    // Hook global único; _fitLivePlateText sai cedo se o overlay não existe.
    if (!window._liveScoreResizeHooked) {
      window._liveScoreResizeHooked = true;
      var _lsRefit = function() { if (window._fitLivePlateText) window._fitLivePlateText(); };
      window.addEventListener('resize', _lsRefit);
      window.addEventListener('orientationchange', _lsRefit);
    }

    // Buttons column builder
    var _buildBtns = function(player) {
      if (state.isFinished) return '';
      return '<div style="width:100%;display:flex;flex-direction:column;">' + _upBtn(player) + _downBtn(player) + '</div>';
    };

    // Column backgrounds with team color at 50% opacity
    var leftBg = leftTeam === 1 ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.12)';
    var rightBg = rightTeam === 1 ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.12)';
    var leftBdr = leftTeam === 1 ? 'rgba(59,130,246,0.20)' : 'rgba(239,68,68,0.20)';
    var rightBdr = rightTeam === 1 ? 'rgba(59,130,246,0.20)' : 'rgba(239,68,68,0.20)';

    // Swap hint — só quando lados FIXOS (com fixSides OFF os lados seguem o
    // sacador automaticamente, então arrastar não faz sentido).
    var swapHint = (!state.isFinished && _liveScorePrefs.fixSides) ? '<div style="text-align:center;font-size:0.55rem;color:var(--text-muted);opacity:0.5;margin-top:4px;">← arraste para trocar lado →</div>' : '';

    // ─────────────────────────────────────────────────────────────────────
    // v4.5.39: MODELO ÚNICO (Apple Watch) — os MESMOS construtores em RETRATO
    // e PAISAGEM. Só o ARRANJO muda (retrato empilha; paisagem põe nomes nas
    // laterais e as metades grandes no meio). Antes a paisagem usava layout
    // velho (placas brancas + ▲/▼) → inconsistente. Agora tudo consistente.
    // SETS COMPLETOS apenas (false) → respeita a config de games/set.
    var _setsLeftN = 0, _setsRightN = 0;
    try { _setsLeftN = _setsWon(leftTeam, false); _setsRightN = _setsWon(rightTeam, false); } catch (e) {}
    var _showSets = useSets;
    var _setsLine = _showSets
      ? '<div style="display:flex;flex-direction:column;align-items:center;margin-bottom:4px;">' +
          '<span style="font-size:0.6rem;font-weight:600;letter-spacing:1px;color:var(--text-muted);text-transform:uppercase;">Sets</span>' +
          '<div style="display:flex;align-items:center;gap:9px;margin-top:1px;">' +
            '<span style="font-size:1.3rem;font-weight:800;color:' + (leftTeam === 1 ? '#60A5FA' : '#F87171') + ';font-variant-numeric:tabular-nums;line-height:1;">' + _setsLeftN + '</span>' +
            '<span style="font-size:0.95rem;color:rgba(255,255,255,0.25);">–</span>' +
            '<span style="font-size:1.3rem;font-weight:800;color:' + (rightTeam === 1 ? '#60A5FA' : '#F87171') + ';font-variant-numeric:tabular-nums;line-height:1;">' + _setsRightN + '</span>' +
          '</div>' +
        '</div>'
      : '';
    // GAMES menor em paisagem (altura curta → usa vh); retrato usa vw.
    var _gBig  = isLandscape ? 'clamp(2rem,7vh,3.4rem)' : 'clamp(3.15rem,14.4vw,5.85rem)';
    var _gDash = isLandscape ? 'clamp(1.2rem,4vh,2rem)' : 'clamp(1.8rem,5.4vw,2.7rem)';
    var _topBlock = showGamesBox
      ? '<div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:clamp(6px,1.4vh,14px) 0 clamp(3px,0.8vh,7px);">' +
          _setsLine +
          '<span style="font-size:0.66rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Games</span>' +
          '<div style="display:flex;align-items:center;gap:clamp(12px,3.6vw,22px);margin-top:1px;">' +
            '<span style="font-size:calc(' + _gBig + ' * var(--live-score-scale,1));font-weight:800;color:' + _gamesLeftClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + _gamesLeftStr + '</span>' +
            '<span style="font-size:calc(' + _gDash + ' * var(--live-score-scale,1));font-weight:300;color:rgba(255,255,255,0.25);">–</span>' +
            '<span style="font-size:calc(' + _gBig + ' * var(--live-score-scale,1));font-weight:800;color:' + _gamesRightClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + _gamesRightStr + '</span>' +
          '</div>' +
        '</div>'
      : '';
    // Metade tocável por time (cor do time, tinta de fundo, número colorido).
    // A metade INTEIRA é o botão +1. Sem placa branca, sem ▲/▼.
    var _scoreHalf = function(team) {
      var clr = team === 1 ? '#60A5FA' : '#F87171';
      var tint = team === 1 ? 'rgba(96,165,250,0.16)' : 'rgba(248,113,113,0.15)';
      var display = team === 1 ? p1Display : p2Display;
      var tag = state.isFinished ? 'div' : 'button';
      var act = state.isFinished ? '' : 'onclick="window._liveScorePoint(' + team + ')" ontouchstart="this.style.transform=\'scale(0.97)\'" ontouchend="this.style.transform=\'\'"';
      return '<' + tag + ' class="ls-score-half" ' + act + ' style="flex:1;min-width:0;height:100%;border:none;cursor:' + (state.isFinished ? 'default' : 'pointer') + ';background:' + tint + ';border-radius:16px;display:flex;align-items:center;justify-content:center;padding:0;overflow:hidden;-webkit-tap-highlight-color:transparent;transition:transform 0.08s;">' +
        '<span class="ls-plate-num" style="font-size:clamp(2.5rem,16vw,7rem);font-weight:900;color:' + clr + ';font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;transform:scaleY(1.35);transform-origin:center;">' + display + '</span>' +
      '</' + tag + '>';
    };
    // Desfazer — ÚNICO botão, full-width, abaixo de tudo (safe-area).
    var _undoBar = (!state.isFinished)
      ? '<button onclick="window._liveScoreUndoLastPoint()" style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:none;cursor:pointer;background:rgba(255,255,255,0.06);color:#D5D5E5;padding:13px 0 calc(13px + env(safe-area-inset-bottom,0px));font-size:0.95rem;font-weight:700;-webkit-tap-highlight-color:transparent;">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>Desfazer</button>'
      : '';
    var _gameLabelRow = gameLabel ? '<div style="flex:0 0 auto;text-align:center;font-size:clamp(0.65rem,2vw,0.8rem);font-weight:700;color:' + labelClr + ';text-transform:uppercase;letter-spacing:2px;padding:2px 0;">' + gameLabel + '</div>' : '';
    var _portFinishRow = finishBtn; finishBtn = '';

    if (isLandscape) {
      // ── PAISAGEM (v4.5.41): SETS/GAMES compactos NO TOPO (liberam o centro);
      // cada time = NOME em UMA LINHA ("P1 / P2", avatar por jogador) em cima +
      // PLACAR colorido GRANDE embaixo. Sem scaleY (o fit deixa o número encher a
      // altura da metade larga → muito maior que no 3-colunas). Time DIREITO
      // espelhado (nome à esquerda, foto à DIREITA, alinhado à direita).
      var _lsTopBar = showGamesBox
        ? '<div style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:clamp(16px,4vw,40px);padding:clamp(4px,1vh,8px) 0;">' +
            (_showSets ? '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:0.62rem;font-weight:600;letter-spacing:1px;color:var(--text-muted);text-transform:uppercase;">Sets</span>' +
              '<span style="font-size:1.3rem;font-weight:800;color:' + (leftTeam === 1 ? '#60A5FA' : '#F87171') + ';font-variant-numeric:tabular-nums;">' + _setsLeftN + '</span>' +
              '<span style="font-size:0.9rem;color:rgba(255,255,255,0.25);">–</span>' +
              '<span style="font-size:1.3rem;font-weight:800;color:' + (rightTeam === 1 ? '#60A5FA' : '#F87171') + ';font-variant-numeric:tabular-nums;">' + _setsRightN + '</span>' +
            '</div>' : '') +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:0.62rem;font-weight:600;letter-spacing:1px;color:var(--text-muted);text-transform:uppercase;">Games</span>' +
              '<span style="font-size:calc(1.7rem * var(--live-score-scale,1));font-weight:800;color:' + _gamesLeftClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + _gamesLeftStr + '</span>' +
              '<span style="font-size:calc(1.1rem * var(--live-score-scale,1));color:rgba(255,255,255,0.25);">–</span>' +
              '<span style="font-size:calc(1.7rem * var(--live-score-scale,1));font-weight:800;color:' + _gamesRightClr + ';font-variant-numeric:tabular-nums;line-height:1;">' + _gamesRightStr + '</span>' +
            '</div>' +
          '</div>'
        : '';
      // Nome em UMA linha: [🎾?] [av]Nome1 / [av]Nome2 (mirror = nome[av], à direita).
      var _lsNameLine = function(team, mirror) {
        var players = team === 1 ? p1Players : p2Players;
        var nameClr = team === 1 ? '#DBEAFE' : '#FECACA';
        var bgClr = team === 1 ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.12)';
        var bdrClr = team === 1 ? 'rgba(59,130,246,0.30)' : 'rgba(239,68,68,0.30)';
        var _ballShown = false, ballHtml = '', chunks = [];
        for (var ni = 0; ni < players.length; ni++) {
          var pn = players[ni], isServing = false;
          if (serverInfo && !state.isFinished && serverInfo.team === team) {
            if (serverInfo.pIdx != null) isServing = (serverInfo.pIdx === ni);
            else if (serverInfo.name === pn && !_ballShown) isServing = true;
            if (isServing) _ballShown = true;
          }
          var fullName = window._safeHtml(pn);
          var avatar = '<span class="live-av-wrap">' + _liveAvatarHtml(pn, 24) + '</span>';
          var nameSpan = '<span onclick="window._liveEditName(' + team + ',' + ni + ')" style="cursor:pointer;font-size:calc(clamp(0.85rem,2.4vw,1.15rem) * var(--live-name-scale,1));font-weight:' + (isServing ? '800' : '700') + ';color:' + (isServing ? '#fbbf24' : nameClr) + ';white-space:nowrap;">' + fullName + '</span>';
          if (isServing) {
            var dragAttr = _canDragServe ? ' draggable="true" data-serve-ball="true"' : '';
            var dragStyle = _canDragServe ? 'cursor:grab;' : 'cursor:default;';
            var ballGlow = _canDragServe ? 'filter:drop-shadow(0 0 4px rgba(255,200,0,0.6));' : 'filter:drop-shadow(0 0 2px rgba(255,200,0,0.3));opacity:0.85;';
            ballHtml = '<span' + dragAttr + ' data-serve-drop="' + team + '-' + ni + '" style="font-size:0.9rem;line-height:1;flex-shrink:0;' + dragStyle + ballGlow + '">' + _sportBall + '</span>';
          }
          chunks.push('<span data-serve-drop="' + team + '-' + ni + '" style="display:inline-flex;align-items:center;gap:5px;min-width:0;">' + (mirror ? nameSpan + avatar : avatar + nameSpan) + '</span>');
        }
        var body = chunks.join('<span style="color:rgba(255,255,255,0.25);font-weight:700;flex-shrink:0;">/</span>');
        var inner = mirror ? body + ballHtml : ballHtml + body;
        return '<div class="court-side" data-court-side="' + (mirror ? 'right' : 'left') + '" style="flex:0 0 auto;max-width:100%;display:flex;align-items:center;gap:6px;justify-content:' + (mirror ? 'flex-end' : 'flex-start') + ';padding:6px 10px;background:' + bgClr + ';border:1px solid ' + bdrClr + ';border-radius:12px;overflow:hidden;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;transition:transform 0.15s,opacity 0.15s;">' + inner + '</div>';
      };
      var _lsTeamCol = function(team, mirror) {
        return '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;padding:2px;' + (mirror ? 'align-items:flex-end;' : 'align-items:flex-start;') + '">' +
            _lsNameLine(team, mirror) +
            '<div style="flex:1;min-height:0;width:100%;display:flex;">' + _scoreHalf(team) + '</div>' +
          '</div>';
      };
      container.innerHTML =
        '<div style="display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;gap:0;">' +
          _gameLabelRow +
          _lsTopBar +
          '<div style="flex:1;min-height:0;display:flex;align-items:stretch;width:100%;gap:8px;padding:2px clamp(6px,1.5vw,12px) 4px;">' +
            _lsTeamCol(leftTeam, false) +
            _lsTeamCol(rightTeam, true) +
          '</div>' +
          swapHint +
          _undoBar +
          _portFinishRow +
        '</div>';
      _fitLivePlateText();
      setTimeout(function() { _setupCourtSwapDrag(); }, 30);
    } else {
      // ── PORTRAIT: 5 linhas proporcionais preenchendo a tela inteira ──
      // Ordem: Games+Desfazer → Times → Placares → Botões ↑ → Botões ↓
      container.style.overflow = 'hidden';
      container.style.padding = '0';

      // v4.5.39: construtores agora são COMPARTILHADOS (definidos antes do split
      // isLandscape) — _topBlock, _scoreHalf, _undoBar, _gameLabelRow, _portFinishRow.
      container.innerHTML =
        '<div style="display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;gap:0;">' +
          // Sets row (compacto, topo)
          setsRow +
          // Rótulo especial (TIE-BREAK, vencedor)
          _gameLabelRow +
          // SETS + GAMES (topo)
          _topBlock +
          // Times (fotos/ícones + nomes) — v4.0.9: a linha tem a ALTURA DO
          // CONTEÚDO (flex:0 0 auto) e NÃO encolhe (flex-shrink:0). Antes era
          // flex:2 (proporcional): quando o GAMES box ficava grande, a linha era
          // espremida abaixo do conteúdo e o overflow:hidden CORTAVA nome/foto.
          // Agora a linha sempre cabe o conteúdo inteiro (verificado: nunca corta,
          // nem com GAMES grande, Nomes 185% ou tela curta) e os placares/botões
          // (flex, encolhem) absorvem o resto — aumentar Nomes/Foto cresce este
          // box e reduz os outros proporcionalmente.
          '<div style="flex:0 0 auto;flex-shrink:0;display:flex;align-items:stretch;width:100%;gap:4px;padding:4px clamp(4px,1.5vw,10px) 2px;">' +
            '<div class="court-side" data-court-side="left" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:center;background:transparent;border:none;padding:0;overflow:hidden;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;transition:transform 0.15s,opacity 0.15s;">' +
              _buildNameStack(leftTeam) +
            '</div>' +
            '<div class="court-side" data-court-side="right" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:center;background:transparent;border:none;padding:0;overflow:hidden;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;transition:transform 0.15s,opacity 0.15s;">' +
              _buildNameStack(rightTeam) +
            '</div>' +
          '</div>' +
          // Placar — v4.5.34: metades tocáveis por time (Apple Watch style).
          // flex:4 (divide o espaço com GAMES flex:2 e nomes flex:1.5 → a tinta
          // não desperdiça, sobra vai pros outros infos). A metade é o botão +1.
          '<div style="flex:4;min-height:0;display:flex;align-items:stretch;width:100%;gap:4px;padding:2px clamp(4px,1.5vw,10px);">' +
            _scoreHalf(leftTeam) + _scoreHalf(rightTeam) +
          '</div>' +
          // Dica de troca de lado (só com fixSides ativo)
          swapHint +
          // Desfazer — ÚNICO botão, full-width, abaixo de tudo (compartilhado)
          _undoBar +
          // Botão Encerrar Partida (apenas partidas casuais sem sets)
          _portFinishRow +
        '</div>';

      // v2.2.16-beta: fit text to fill plate boxes and buttons
      _fitLivePlateText();
      // Attach court-side drag-and-drop (swap sides)
      setTimeout(function() { _setupCourtSwapDrag(); }, 30);
    }

    // v1.9.68: equaliza a altura dos dois name stacks (esquerdo/direito) pra
    // que placares e botões fiquem alinhados mesmo quando um lado tem nome que
    // quebra em mais linhas (ex.: "Rodrigo Barth" vs "Adversário 1").
    // v1.9.71: SÍNCRONO (não setTimeout) — mede e ajusta antes do primeiro
    // paint, senão o lado mais curto pinta curto e depois "pula" pra altura
    // equalizada a cada clique. offsetHeight força layout síncrono; o browser
    // pinta uma vez só com o estado final.
    try {
      var _nstacks = container.querySelectorAll('.live-namestack');
      if (_nstacks.length === 2) {
        _nstacks[0].style.minHeight = ''; _nstacks[1].style.minHeight = '';
        var _nh = Math.max(_nstacks[0].offsetHeight, _nstacks[1].offsetHeight);
        if (_nh > 0) { _nstacks[0].style.minHeight = _nh + 'px'; _nstacks[1].style.minHeight = _nh + 'px'; }
      }
    } catch (e) {}

    // Attach serve ball drag-and-drop (change server inline)
    if (_canDragServe) {
      setTimeout(function() { _setupServeBallDrag(); }, 40);
    }

    // Append finish button at bottom
    if (finishBtn) {
      container.insertAdjacentHTML('beforeend', finishBtn);
    }

    // Show persistent tie-break button during Prorrogação (extend mode)
    // Only visible to registered users playing the match — others can't change the tie rule.
    // O botão só existe quando o tie-break É UMA DECISÃO REAL: os games têm de
    // estar EMPATADOS no deuce da modalidade (gamesPerSet-1) ou além. Antes a
    // condição não olhava o placar, então em Prorrogação o botão aparecia desde
    // 0-0 — oferecendo desempate antes de existir qualquer ponto.
    var _tbEligible = state.tieRule === 'extend' && !state.isFinished && !state.isTiebreak && _isViewerInMatch;
    var _cs = _tbEligible ? _currentSet() : null;
    var _tbReady = !!_cs && _cs.gamesP1 === _cs.gamesP2 && _cs.gamesP1 >= state.gamesPerSet - 1;
    if (_tbEligible && _tbReady) {
      var tbLabel = 'Ir para Tie-break (' + _cs.gamesP1 + '×' + _cs.gamesP2 + ')';
      var tbStyle = 'width:100%;padding:16px;border-radius:14px;font-size:1.05rem;font-weight:800;border:none;cursor:pointer;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 4px 20px rgba(139,92,246,0.45);transition:transform 0.1s;animation:tb-pulse 1.5s ease-in-out infinite;';
      container.insertAdjacentHTML('beforeend',
        '<style>@keyframes tb-pulse{0%,100%{box-shadow:0 4px 20px rgba(139,92,246,0.45)}50%{box-shadow:0 4px 30px rgba(139,92,246,0.7),0 0 40px rgba(139,92,246,0.25)}}</style>' +
        '<div style="padding:0 1rem 1rem;flex-shrink:0;">' +
          '<button onclick="window._liveResolveTie(\'tiebreak\')" style="' + tbStyle + '">' +
          '⚡ ' + tbLabel +
        '</button></div>'
      );
    }

    // Sync state to Firestore for real-time collaboration
    _syncLiveState();
  }

  // ── Court side swap drag-and-drop ──
  var _courtDragSide = null;
  var _courtDragGhost = null;

  function _setupCourtSwapDrag() {
    var sides = document.querySelectorAll('.court-side');
    if (sides.length < 2) return;

    sides.forEach(function(side) {
      // v1.3.29-beta: helper — drag/swap só dispara em área neutra do
      // court-side. Tocar em BUTTON, INPUT, ou qualquer elemento com
      // data-no-swap-drag NÃO inicia swap. Bug reportado: arrastar
      // estava atrapalhando marcação de pontos — usuários acidentalmente
      // disparavam swap quando queriam apenas tocar botão de placar.
      var _isInteractive = function(target) {
        if (!target) return false;
        var t = target;
        while (t && t !== side) {
          if (!t.tagName) { t = t.parentNode; continue; }
          var tag = t.tagName;
          if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'A') return true;
          if (t.getAttribute && (t.getAttribute('role') === 'button' || t.hasAttribute('data-no-swap-drag'))) return true;
          t = t.parentNode;
        }
        return false;
      };

      // Desktop drag
      side.addEventListener('dragstart', function(e) {
        if (_isInteractive(e.target)) { e.preventDefault(); return; }
        _courtDragSide = side.getAttribute('data-court-side');
        side.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
      });
      side.addEventListener('dragend', function() {
        side.style.opacity = '1';
        _courtDragSide = null;
        sides.forEach(function(s) { s.style.transform = ''; });
      });
      side.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (!_courtDragSide) return;
        var targetSide = side.getAttribute('data-court-side');
        if (targetSide !== _courtDragSide) side.style.transform = 'scale(1.02)';
      });
      side.addEventListener('dragleave', function() { side.style.transform = ''; });
      side.addEventListener('drop', function(e) {
        e.preventDefault();
        side.style.transform = '';
        if (!_courtDragSide) return;
        var targetSide = side.getAttribute('data-court-side');
        if (targetSide !== _courtDragSide) {
          _courtDragSide = null;
          _courtLeft = _courtLeft === 1 ? 2 : 1;
          _render();
        }
      });

      // Touch drag — só inicia se o toque foi em área neutra (não-botão)
      var _touchSide = null;
      side.addEventListener('touchstart', function(e) {
        if (_isInteractive(e.target)) { _touchSide = null; return; }
        _touchSide = side.getAttribute('data-court-side');
        side.style.opacity = '0.6';
      }, { passive: true });
      side.addEventListener('touchmove', function(e) {
        if (!_touchSide) return;
        e.preventDefault();
        if (!_courtDragGhost) {
          _courtDragGhost = document.createElement('div');
          _courtDragGhost.style.cssText = 'position:fixed;z-index:200000;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4);pointer-events:none;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:white;';
          _courtDragGhost.textContent = '⇄';
          document.body.appendChild(_courtDragGhost);
        }
        var t = e.touches[0];
        _courtDragGhost.style.left = (t.clientX - 30) + 'px';
        _courtDragGhost.style.top = (t.clientY - 30) + 'px';
      }, { passive: false });
      side.addEventListener('touchend', function(e) {
        side.style.opacity = '1';
        if (_courtDragGhost) { _courtDragGhost.remove(); _courtDragGhost = null; }
        if (!_touchSide) return;
        var t = e.changedTouches[0];
        var el = document.elementFromPoint(t.clientX, t.clientY);
        var target = el;
        while (target) {
          if (target.classList && target.classList.contains('court-side')) {
            if (target.getAttribute('data-court-side') !== _touchSide) {
              _touchSide = null;
              _courtLeft = _courtLeft === 1 ? 2 : 1;
              _render();
              return;
            }
            break;
          }
          target = target.parentElement;
        }
        _touchSide = null;
      });
    });
  }

  // ── Serve ball drag-and-drop (inline server change) ──
  // v1.3.14-beta: zona de drag estendida do span do ícone pro card inteiro
  // do jogador-sacador. Threshold de 8px de movimento separa "tap" (edita
  // nome) de "drag" (arrasta bola). stopPropagation impede que court-side
  // receba o evento e dispare swap-de-lados em paralelo.
  var _serveBallDragging = false;
  var _serveBallGhost = null;
  var DRAG_THRESHOLD_PX = 8; // distância antes de virar drag (vs tap)

  function _setupServeBallDrag() {
    // Sources: ball span E card inteiro do sacador (ambos disparam drag).
    var sources = document.querySelectorAll('[data-serve-ball], [data-serve-ball-card]');
    if (sources.length === 0) return;
    var drops = document.querySelectorAll('[data-serve-drop]');

    function _highlightValidDrops() {
      drops.forEach(function(d) {
        var parts = d.getAttribute('data-serve-drop').split('-');
        var dropTeam = parseInt(parts[0]);
        var canDrop = (state.totalGamesPlayed === 0) || (state.totalGamesPlayed === 1 && state.serveOrder.length > 1 && dropTeam === state.serveOrder[1].team);
        if (canDrop) d.style.background = 'rgba(255,200,0,0.15)';
      });
    }
    function _clearDrops() {
      drops.forEach(function(d) { d.style.background = ''; d.style.transform = ''; });
    }
    function _commitServer(target) {
      if (!target || !target.dataset || target.dataset.serveDrop === undefined) return false;
      var parts = target.dataset.serveDrop.split('-');
      var dropTeam = parseInt(parts[0]);
      var dropIdx = parseInt(parts[1]);
      if (state.totalGamesPlayed >= 2) return false;
      if (state.totalGamesPlayed === 1 && state.serveOrder.length > 1 && dropTeam !== state.serveOrder[1].team) return false;
      window._liveSetServer(dropTeam, dropIdx);
      return true;
    }

    // Drop targets — atribuídos uma vez (compartilhados com sources).
    drops.forEach(function(drop) {
      drop.addEventListener('dragover', function(e) {
        if (!_serveBallDragging) return;
        e.preventDefault();
        e.stopPropagation();
        drop.style.transform = 'scale(1.05)';
      });
      drop.addEventListener('dragleave', function() { drop.style.transform = ''; });
      drop.addEventListener('drop', function(e) {
        if (!_serveBallDragging) return;
        e.preventDefault();
        e.stopPropagation();
        drop.style.transform = '';
        _serveBallDragging = false;
        _commitServer(drop);
      });
    });

    sources.forEach(function(src) {
      // Desktop drag — só ativo no span da bola (card inteiro não é
      // draggable=true, senão drag iniciaria mesmo em clique normal).
      if (src.hasAttribute('data-serve-ball')) {
        src.addEventListener('dragstart', function(e) {
          _serveBallDragging = true;
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          _highlightValidDrops();
        });
        src.addEventListener('dragend', function(e) {
          e.stopPropagation();
          _serveBallDragging = false;
          _clearDrops();
        });
      }

      // Touch drag — ativo no span E no card. Threshold separa tap de drag.
      var _touch = { active: false, startX: 0, startY: 0, dragging: false };
      src.addEventListener('touchstart', function(e) {
        var t = e.touches[0];
        _touch = { active: true, startX: t.clientX, startY: t.clientY, dragging: false };
        // stopPropagation impede court-side touchstart de rodar (que setaria
        // opacity:0.6 e _touchSide). preventDefault NÃO é chamado pra
        // preservar o click event de editar nome quando user só dá tap.
        e.stopPropagation();
      }, { passive: true });

      src.addEventListener('touchmove', function(e) {
        if (!_touch.active) return;
        var t = e.touches[0];
        var dx = t.clientX - _touch.startX;
        var dy = t.clientY - _touch.startY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (!_touch.dragging) {
          if (dist < DRAG_THRESHOLD_PX) return; // ainda pode ser tap
          _touch.dragging = true;
          _serveBallDragging = true;
          _highlightValidDrops();
        }
        // Drag iniciado — agora bloqueia comportamento default (scroll, etc.)
        // e impede que court-side processe o touch como swap.
        e.preventDefault();
        e.stopPropagation();
        if (!_serveBallGhost) {
          _serveBallGhost = document.createElement('div');
          _serveBallGhost.style.cssText = 'position:fixed;z-index:200000;font-size:1.5rem;pointer-events:none;filter:drop-shadow(0 0 8px rgba(255,200,0,0.8));';
          _serveBallGhost.innerHTML = _sportBall;
          document.body.appendChild(_serveBallGhost);
        }
        _serveBallGhost.style.left = (t.clientX - 15) + 'px';
        _serveBallGhost.style.top = (t.clientY - 15) + 'px';
        drops.forEach(function(d) { d.style.transform = ''; d.style.background = ''; });
        var el = document.elementFromPoint(t.clientX, t.clientY);
        var target = el;
        while (target) {
          if (target.dataset && target.dataset.serveDrop !== undefined) {
            target.style.transform = 'scale(1.05)';
            target.style.background = 'rgba(255,200,0,0.15)';
            break;
          }
          target = target.parentElement;
        }
      }, { passive: false });

      src.addEventListener('touchend', function(e) {
        if (_serveBallGhost) { _serveBallGhost.remove(); _serveBallGhost = null; }
        drops.forEach(function(d) { d.style.transform = ''; d.style.background = ''; });
        var wasDragging = _touch.dragging;
        _touch = { active: false, startX: 0, startY: 0, dragging: false };
        _serveBallDragging = false;
        if (!wasDragging) {
          // Tap — deixa o onclick original (editar nome) rolar normalmente.
          // Importante: não chamar preventDefault aqui.
          return;
        }
        // Drag concluído — commit no drop target sob o dedo. preventDefault
        // pra cancelar o synthetic click event que o browser geraria.
        e.preventDefault();
        e.stopPropagation();
        var t = e.changedTouches[0];
        var el = document.elementFromPoint(t.clientX, t.clientY);
        var target = el;
        while (target) {
          if (_commitServer(target)) return;
          if (target.dataset && target.dataset.serveDrop !== undefined) return; // not commitable
          target = target.parentElement;
        }
      });
    });
  }

  // ── Edit player name inline ──
  window._liveEditName = function(team, playerIdx) {
    var players = team === 1 ? p1Players : p2Players;
    var current = players[playerIdx] || '';
    showInputDialog(
      'Editar nome',
      'Nome do jogador:',
      current,
      function(newName) {
        newName = (newName || '').trim();
        if (!newName) return;
        // Transfer avatar metadata to new name
        if (_playerMeta[current]) {
          _playerMeta[newName] = _playerMeta[current];
          if (current !== newName) delete _playerMeta[current];
        }
        players[playerIdx] = newName;
        // Also update serveOrder if this player is there
        for (var i = 0; i < state.serveOrder.length; i++) {
          if (state.serveOrder[i].team === team && state.serveOrder[i].name === current) {
            state.serveOrder[i].name = newName;
          }
        }
        _render();
      }
    );
  };

  // ── Firestore real-time sync for casual matches ──
  var _casualDocId = isCasual && opts ? opts.casualDocId : null;
  var _casualCreatedBy = isCasual && opts ? (opts.createdBy || null) : null;
  var _casualRoomCode = isCasual && opts ? (opts.roomCode || null) : null;
  // v1.3.56-beta: flag para saber se o overlay foi aberto sobre uma partida
  // já finalizada (viewOnly=true). Quando o usuário clica "Jogar" a partir
  // do histórico, precisamos desvincullar o novo jogo do doc antigo para
  // que _closeLiveScoring não chame cancelCasualMatch no doc original.
  var _viewOnly = !!(opts && opts.viewOnly);
  // v1.3.33-beta: cópia local dos players da partida casual (mesmo shape
  // do match.players[] no Firestore). Usado pra render das sugestões de
  // vínculo guest→friend. Mantido sincronizado via _applyRemoteState.
  var _casualPlayers = (isCasual && opts && Array.isArray(opts.players)) ? opts.players.slice() : [];
  // v1.6.103-beta: _slotLinkedUid precisa existir no escopo do _openLiveScoring
  // para que _hydrateCasualLinkSuggestions (definida aqui) consiga lê-la.
  // Antes era referenciada de _openCasualMatch via closure não-existente,
  // causando ReferenceError (SCOREPLACE-WEB-1B) em iOS Safari toda vez que
  // o slot de sugestões estava no DOM.
  var _slotLinkedUid = (isCasual && opts && Array.isArray(opts.slotLinkedUid))
    ? opts.slotLinkedUid.slice()
    : [null, null, null, null];

  // v1.6.11-beta: Rei/Rainha da Praia state (inside live-scoring closure)
  var _reiRainhaMode = !!(opts && opts.reiRainhaMode);
  var _reiRainhaRound = 0;          // 0=1º jogo, 1=2º, 2=3º
  var _reiRainhaPlayers = null;     // [P1,P2,P3,P4] fixo após 1º jogo
  var _reiRainhaWins = [0, 0, 0, 0]; // vitórias por jogador (índice fixo)
  // Pairings canônicos: Round 0: T1=[0,1] vs T2=[2,3]
  //                    Round 1: T1=[0,2] vs T2=[1,3]
  //                    Round 2: T1=[0,3] vs T2=[1,2]
  var _reiRainhaPairings = [
    { t1: [0, 1], t2: [2, 3] },
    { t1: [0, 2], t2: [1, 3] },
    { t1: [0, 3], t2: [1, 2] }
  ];
  // v2.2.1-beta: histórico de jogos na sessão para ativação retroativa do Rei/Rainha.
  // Cada entrada: { p1:[names], p2:[names], winner:1|2|0 }
  // v2.2.33-beta: SEMEADO de opts.sessionHistory — cada partida é um closure
  // NOVO (doc novo por jogo), então sem isto o histórico era zerado a cada jogo
  // e o Rei/Rainha retroativo só "via" o jogo atual (bug: "Jogo 2 de 3" e
  // pareava com o 1º parceiro de novo, ignorando os jogos anteriores). Agora o
  // histórico flui pelo encadeamento de docs (_doRestartNow grava sessionHistory
  // no doc novo; _renderCasualJoin repassa em opts).
  var _sessionGameHistory = (opts && Array.isArray(opts.sessionHistory))
    ? opts.sessionHistory.map(function(g) { return { p1: (g.p1||[]).slice(), p2: (g.p2||[]).slice(), winner: g.winner || 0 }; })
    : [];

  // v1.3.33-beta: render das sugestões de vínculo guest→friend.
  // Pra cada slot SEM uid em _casualPlayers, busca matches em
  // window._friendProfilesCache via _suggestFriendsForGuestName e
  // renderiza um card "Esse [name] é o [Friend]?" com botão "Sugerir
  // vínculo" — que dispara notificação pro friend confirmar.
  window._hydrateCasualLinkSuggestions = async function() {
    var slot = document.getElementById('casual-link-suggestions-slot');
    if (!slot) return;
    if (!isCasual || !_casualDocId) { slot.innerHTML = ''; return; }
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !Array.isArray(cu.friends) || cu.friends.length === 0) {
      slot.innerHTML = ''; return;
    }
    // Hidrata cache de perfis dos amigos (idempotente)
    try { await window._loadFriendProfilesCached(); } catch(e) {}
    // Coleta uids já logados (incluindo o current user) pra excluir das sugestões
    var loggedUids = [cu.uid];
    _casualPlayers.forEach(function(p) { if (p && p.uid) loggedUids.push(p.uid); });
    // Coleta pending requests do match (carregados quando _applyRemoteState rodou)
    var pendingByName = {};
    if (Array.isArray(_casualPendingLinks)) {
      _casualPendingLinks.forEach(function(req) {
        if (req && req.guestName) pendingByName[window._normalizeName(req.guestName) + '|' + req.suggestedUid] = req;
      });
    }
    var suggestions = [];
    _casualPlayers.forEach(function(p, idx) {
      if (!p || p.uid) return; // já vinculado via lobby/login
      // Slot autocompletado: vínculo já registrado e notificação disparada pelo
      // auto-trigger ao fim da partida — não exibir sugestão redundante.
      if (_slotLinkedUid && _slotLinkedUid[idx]) return;
      var typed = (p.name || p.displayName || '').trim();
      if (!typed) return;
      var matches = window._suggestFriendsForGuestName(typed, loggedUids);
      matches.slice(0, 3).forEach(function(fr) {
        var key = window._normalizeName(typed) + '|' + fr.uid;
        suggestions.push({
          guestName: typed,
          slotIndex: idx,
          friend: fr,
          pending: !!pendingByName[key]
        });
      });
    });
    if (suggestions.length === 0) { slot.innerHTML = ''; return; }
    var rowsHtml = suggestions.map(function(s) {
      var photo = s.friend.photoURL
        ? '<img src="' + window._safeHtml(s.friend.photoURL) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1.5px solid rgba(251,191,36,0.4);" onerror="this.style.display=\'none\'">'
        : '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);display:flex;align-items:center;justify-content:center;font-size:13px;color:white;font-weight:700;flex-shrink:0;">' + window._safeHtml((s.friend.displayName || '?')[0].toUpperCase()) + '</div>';
      var btnHtml = s.pending
        ? '<span style="padding:7px 12px;border-radius:8px;font-size:0.7rem;font-weight:700;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;flex-shrink:0;">⏳ Aguardando</span>'
        : '<button onclick="window._suggestCasualLink(' + s.slotIndex + ',\'' + s.friend.uid.replace(/'/g, "\\'") + '\')" style="padding:7px 12px;border-radius:8px;font-size:0.7rem;font-weight:700;cursor:pointer;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.35);color:#fbbf24;flex-shrink:0;white-space:nowrap;">🤝 Sugerir vínculo</button>';
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);">' +
        photo +
        '<div style="flex:1;min-width:0;">' +
          // Nome digitado na partida (em cima) — pode truncar, costuma ser curto
          '<div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(s.guestName) + ' <span style="opacity:0.65;">(na partida)</span></div>' +
          // Nome do usuário sugerido (embaixo) — completo, quebra em 2 linhas se preciso
          '<div style="font-size:0.84rem;font-weight:700;color:var(--text-bright);line-height:1.25;word-break:break-word;">↳ ' + window._safeHtml(s.friend.displayName) + '</div>' +
          '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">Seu amigo no scoreplace</div>' +
        '</div>' +
        btnHtml +
      '</div>';
    }).join('');
    slot.innerHTML =
      '<div style="padding:12px;border-radius:14px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.20);display:flex;flex-direction:column;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:0.62rem;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:1.2px;">🤝 Vincular jogadores</div>' +
        '<div style="font-size:0.68rem;color:var(--text-muted);line-height:1.4;">Esses nomes podem ser amigos seus já cadastrados. Sugerir vínculo envia uma notificação pra eles confirmarem — só após confirmação a partida conta nas estatísticas deles.</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' + rowsHtml + '</div>' +
      '</div>';
  };

  // Action: dispara sugestão pro amigo. Cria entry em pendingLinkRequests
  // do match doc + envia notificação casual_link_request com payload pro
  // friend confirmar.
  window._suggestCasualLink = async function(slotIndex, friendUid) {
    if (!_casualDocId || !window.FirestoreDB || !window.FirestoreDB.db) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid) return;
    var slotPlayer = _casualPlayers[slotIndex];
    if (!slotPlayer) return;
    var guestName = (slotPlayer.name || slotPlayer.displayName || '').trim();
    if (!guestName) return;
    var friend = window._friendProfilesCache && window._friendProfilesCache[friendUid];
    if (!friend) return;
    try {
      // Adiciona ao pendingLinkRequests do match (atomic update via firestore arrayUnion-like)
      var docRef = window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId);
      var snap = await docRef.get();
      if (!snap.exists) return;
      var data = snap.data();
      var pending = Array.isArray(data.pendingLinkRequests) ? data.pendingLinkRequests.slice() : [];
      // Idempotente: não duplica
      var dup = pending.some(function(r) { return r.slotIndex === slotIndex && r.suggestedUid === friendUid; });
      if (dup) {
        if (typeof showNotification === 'function') showNotification('Sugestão já enviada', 'Aguardando confirmação de ' + friend.displayName + '.', 'info');
        return;
      }
      pending.push({
        slotIndex: slotIndex,
        guestName: guestName,
        suggestedUid: friendUid,
        suggestedAt: new Date().toISOString(),
        suggestedBy: cu.uid,
        suggestedByName: cu.displayName || ''
      });
      await docRef.update({ pendingLinkRequests: pending });
      // Atualiza cópia local pra UI refletir
      _casualPendingLinks = pending;
      // Notificação pro amigo
      if (typeof window._sendUserNotification === 'function') {
        var sportLabel = (opts && opts.sportName) || (opts && opts.title) || 'Partida casual';
        var summary = '';
        if (data.result && data.result.summary) summary = ' (' + data.result.summary + ')';
        await window._sendUserNotification(friendUid, {
          type: 'casual_link_request',
          level: 'all',
          message: cu.displayName + ' diz que você jogou uma partida casual de ' + sportLabel + summary + '. Confirma?',
          casualMatchDocId: _casualDocId,
          casualRoomCode: _casualRoomCode,
          casualSlotIndex: slotIndex,
          casualGuestName: guestName,
          casualSport: sportLabel
        });
      }
      if (typeof showNotification === 'function') showNotification('🤝 Sugestão enviada', 'Aguardando confirmação de ' + friend.displayName + '.', 'success');
      // Re-render
      try { window._hydrateCasualLinkSuggestions(); } catch(e) {}
    } catch (e) {
      window._warn('[casual link] suggest err:', e);
      if (typeof showNotification === 'function') showNotification('Erro', 'Não foi possível enviar a sugestão. Tente novamente.', 'error');
    }
  };

  // Tracking local de pending link requests do match (sincronizado via
  // _applyRemoteState quando a snapshot recebe pendingLinkRequests).
  var _casualPendingLinks = [];
  var _syncTimer = null;
  var _isRemoteUpdate = false; // true when receiving from Firestore
  var _unsubFirestore = null;
  var _casualCancelled = false; // local flag so we don't double-evacuate
  var _myCloseClicked = false;  // v2.2.12: este cliente iniciou consenso de encerramento
  var _closePendingTimer = null; // v2.2.19: auto-fecha se ninguém confirmar em 8s
  // v2.2.15: pré-populado de _casualPlayers para que o consenso funcione mesmo
  // antes do primeiro onSnapshot (race condition: "Fechar" clicado rápido)
  var _knownPlayerUids = _casualPlayers.reduce(function(arr, p) {
    if (p && p.uid) arr.push(p.uid);
    return arr;
  }, []);

  // Serialize state for Firestore
  function _serializeState() {
    return {
      sets: JSON.parse(JSON.stringify(state.sets)),
      currentGameP1: state.currentGameP1,
      currentGameP2: state.currentGameP2,
      isTiebreak: state.isTiebreak,
      isFinished: state.isFinished,
      winner: state.winner,
      tieRulePending: state.tieRulePending,
      totalGamesPlayed: state.totalGamesPlayed,
      serveOrder: state.serveOrder.map(function(s) { return { team: s.team, name: s.name }; }),
      serveSkipped: state.serveSkipped,
      gameLog: Array.isArray(state.gameLog) ? state.gameLog.slice() : [],
      pointLog: Array.isArray(state.pointLog) ? state.pointLog.slice() : [],
      tieRule: state.tieRule,
      courtLeft: _courtLeft,
      p1Players: p1Players.slice(),
      p2Players: p2Players.slice(),
      matchStartTime: _matchStartTime,
      matchEndTime: state.isFinished ? (_matchEndTime || Date.now()) : null,
      _ts: Date.now() // timestamp for conflict resolution
    };
  }

  // Apply remote state from Firestore
  function _applyRemoteState(remote) {
    if (!remote || !remote._ts) return;
    state.sets = remote.sets || state.sets;
    state.currentGameP1 = remote.currentGameP1 != null ? remote.currentGameP1 : state.currentGameP1;
    state.currentGameP2 = remote.currentGameP2 != null ? remote.currentGameP2 : state.currentGameP2;
    state.isTiebreak = !!remote.isTiebreak;
    state.isFinished = !!remote.isFinished;
    state.winner = remote.winner != null ? remote.winner : state.winner;
    state.tieRulePending = !!remote.tieRulePending;
    state.totalGamesPlayed = remote.totalGamesPlayed || 0;
    state.tieRule = remote.tieRule || state.tieRule;
    if (Array.isArray(remote.serveOrder) && remote.serveOrder.length > 0) {
      state.serveOrder = remote.serveOrder;
      state.secondServerPicked = true;
    }
    state.serveSkipped = !!remote.serveSkipped;
    if (Array.isArray(remote.gameLog)) state.gameLog = remote.gameLog.slice();
    if (Array.isArray(remote.pointLog)) state.pointLog = remote.pointLog.slice();
    if (remote.courtLeft) _courtLeft = remote.courtLeft;
    if (remote.matchStartTime) _matchStartTime = remote.matchStartTime;
    if (remote.matchEndTime) _matchEndTime = remote.matchEndTime;
    // Update player names if changed remotely
    if (Array.isArray(remote.p1Players)) {
      for (var i = 0; i < remote.p1Players.length && i < p1Players.length; i++) p1Players[i] = remote.p1Players[i];
    }
    if (Array.isArray(remote.p2Players)) {
      for (var j = 0; j < remote.p2Players.length && j < p2Players.length; j++) p2Players[j] = remote.p2Players[j];
    }
    // Re-apply perspective-based role labels — the host's "Parceiro"/"Adversário N"
    // labels must be remapped locally for every viewer that isn't the host.
    _localizeRoleLabels();
  }

  // v2.2.21-beta: "Fechar agora" DISSOLVE a sala. O usuário ficou preso
  // aguardando uma confirmação que nunca chegou (sozinho, com UIDs fantasma no
  // _knownPlayerUids). Antes (v2.2.19/20) só fechava o overlay local e tentava
  // limpar o ponteiro — mas (a) deixava o doc da partida vivo (status:active),
  // então o resume puxava de volta toda vez, e (b) ao remover o overlay o
  // usuário caía na tela de loading do _renderCasualJoin (a "ampulheta na tela
  // preta") em vez do dashboard. Agora: deleta o doc (cancelCasualMatch ignora
  // finished = histórico preservado), limpa o ponteiro com suppress longo, e
  // navega pro dashboard de forma explícita. Doc deletado = mesmo que o clear
  // do ponteiro corra, o próximo resume cai no self-heal (loadCasualMatch null).
  function _closePendingForceClose() {
    if (_closePendingTimer) { clearInterval(_closePendingTimer); _closePendingTimer = null; }
    var b = document.getElementById('close-pending-banner');
    if (b) b.remove();
    var _cuFC = window.AppStore && window.AppStore.currentUser;
    // 1) Limpa o ponteiro de resume ANTES de qualquer await — suppress de 10s
    //    cobre a janela até a navegação assentar.
    try {
      if (_cuFC && _cuFC.uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
        window._suppressCasualResumeUntil = Date.now() + 10000;
        window.FirestoreDB.saveUserProfile(_cuFC.uid, { activeCasualRoom: null }).catch(function() {});
      }
      if (_cuFC) _cuFC.activeCasualRoom = null;
    } catch (e) {}
    try { sessionStorage.removeItem('_activeCasualRoom'); } catch (e) {}
    // 2) Cleanup local (listeners, wake lock, overlay). _liveScoreCloseStats
    //    também grava hostClosed se for host de partida finalizada.
    if (typeof window._liveScoreCloseStats === 'function') {
      try { window._liveScoreCloseStats(); } catch (e) {}
    }
    // 3a) v2.2.29-beta: evacua os OUTROS clientes. Sem isto, quando a partida
    //     está FINALIZADA (tela de stats), cancelCasualMatch NÃO apaga o doc
    //     (histórico permanente) e, se quem fechou não é o host, ninguém escreve
    //     hostClosed → o outro ficava como "fantasma" na tela. Gravar hostClosed
    //     aqui (preserva status:finished) faz todos saírem via o handler.
    if (_casualDocId && window.FirestoreDB && window.FirestoreDB.db) {
      try {
        window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId)
          .update({ hostClosed: true, closePending: firebase.firestore.FieldValue.delete() })
          .catch(function() {});
      } catch (e) {}
    }
    // 3b) Dissolve a sala se a partida NÃO está finalizada (mid-game).
    //     cancelCasualMatch pula docs finished (são histórico permanente).
    if (_casualDocId && window.FirestoreDB && typeof window.FirestoreDB.cancelCasualMatch === 'function') {
      try {
        var p = window.FirestoreDB.cancelCasualMatch(_casualDocId);
        if (p && typeof p.catch === 'function') p.catch(function() {});
      } catch (e) {}
    }
    // 4) Sai da rota #casual/CODE → dashboard. Sem isto o usuário fica na tela
    //    de loading do _renderCasualJoin que ficou por baixo do overlay.
    try { window.location.replace('#dashboard'); } catch (e) { window.location.hash = '#dashboard'; }
  }

  // v2.2.12-beta: banner de consenso de encerramento — iniciador ou convidado
  function _showClosePendingBanner(isInitiator, byName) {
    var existing = document.getElementById('close-pending-banner');
    if (existing) existing.remove();
    if (_closePendingTimer) { clearInterval(_closePendingTimer); _closePendingTimer = null; }
    var banner = document.createElement('div');
    banner.id = 'close-pending-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100003;background:rgba(0,0,0,0.8);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;box-sizing:border-box;';
    if (isInitiator) {
      // v2.2.32-beta: a CONFIRMAÇÃO do outro jogador é o caminho padrão. O
      // "Fechar agora" (que dissolve sem esperar) NÃO aparece de imediato —
      // antes o usuário clicava nele achando que confirmava e fechava pros dois
      // sem o outro responder. Agora o iniciador só vê "Aguardando confirmação"
      // + "Cancelar"; o escape "Fechar agora" só surge após 12s (caso ninguém
      // responda — sala com fantasmas).
      banner.innerHTML =
        '<div style="background:rgba(251,191,36,0.12);border:1.5px solid rgba(251,191,36,0.45);border-radius:20px;padding:28px 32px;text-align:center;max-width:320px;width:100%;box-sizing:border-box;">' +
          '<div style="font-size:2rem;margin-bottom:10px;">⏳</div>' +
          '<div style="color:#fbbf24;font-weight:800;font-size:1.1rem;margin-bottom:8px;">Aguardando confirmação</div>' +
          '<div style="color:rgba(255,255,255,0.65);font-size:0.87rem;line-height:1.5;">O outro jogador precisa confirmar o encerramento.</div>' +
        '</div>' +
        '<div id="close-pending-initiator-btns" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">' +
          '<button class="btn btn-danger" onclick="window._casualCloseCancel()">Cancelar</button>' +
        '</div>';
      document.body.appendChild(banner);
      // Escape "Fechar agora" só depois de 12s sem resposta (sala fantasma).
      if (_closePendingTimer) { clearTimeout(_closePendingTimer); _closePendingTimer = null; }
      _closePendingTimer = setTimeout(function() {
        var _btns = document.getElementById('close-pending-initiator-btns');
        if (!_btns || document.getElementById('close-pending-forcebtn')) return;
        var _fb = document.createElement('button');
        _fb.id = 'close-pending-forcebtn';
        _fb.textContent = 'Fechar agora';
        _fb.setAttribute('onclick', 'window._closePendingForceClose()');
        _fb.className = 'btn btn-warning';
        _btns.appendChild(_fb);
      }, 12000);
      return; // banner já appendado
    } else {
      var _safeName = byName ? byName.replace(/[<>"'&]/g, function(c){ return {'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]; }) : 'Alguém';
      banner.innerHTML =
        '<div style="background:rgba(239,68,68,0.1);border:1.5px solid rgba(239,68,68,0.4);border-radius:20px;padding:28px 32px;text-align:center;max-width:320px;width:100%;box-sizing:border-box;">' +
          '<div style="font-size:2rem;margin-bottom:10px;">🚪</div>' +
          '<div style="color:#f87171;font-weight:800;font-size:1.1rem;margin-bottom:8px;">' + _safeName + ' quer encerrar</div>' +
          '<div style="color:rgba(255,255,255,0.65);font-size:0.87rem;line-height:1.5;">Confirme para todos voltarem à sala de espera da partida.</div>' +
        '</div>' +
        '<div style="display:flex;gap:12px;">' +
          '<button class="btn btn-outline" onclick="window._casualCloseCancel()">Recusar</button>' +
          '<button class="btn btn-success" onclick="window._casualCloseConfirm()">Confirmar</button>' +
        '</div>';
    }
    document.body.appendChild(banner);
  }

  // Sync local state to Firestore (debounced 300ms)
  function _syncLiveState() {
    if (!_casualDocId || !window.FirestoreDB || !window.FirestoreDB.db) return;
    if (_isRemoteUpdate) return; // Don't echo back remote updates
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function() {
      // v2.2.13-beta: lastActivityAt atualizado em cada sync para que a Cloud
      // Function de limpeza dissolva salas sem atividade por 2h.
      window.FirestoreDB.updateCasualMatch(_casualDocId, {
        liveState: _serializeState(),
        lastActivityAt: Date.now()
      });
    }, 300);
  }

  // Listen for Firestore changes (real-time)
  function _startFirestoreListener() {
    if (!_casualDocId || !window.FirestoreDB || !window.FirestoreDB.db) return;
    try {
      _unsubFirestore = window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId)
        .onSnapshot(function(doc) {
          // Organizer cancelled (deleted doc) or doc disappeared — evacuate everyone
          // still watching so they don't get stuck on a ghost match.
          if (!doc.exists) {
            if (_casualCancelled) return;
            _casualCancelled = true;
            if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
            try { window.removeEventListener('resize', _onResize); } catch(e) {}
            try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
      try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
            try { _releaseWakeLock(); } catch(e) {}
            var ov = document.getElementById('live-scoring-overlay');
            if (ov) ov.remove();
            _watchTeardown();
            var cu = window.AppStore && window.AppStore.currentUser;
            var wasOrganizer = cu && _casualCreatedBy && cu.uid === _casualCreatedBy;
            if (!wasOrganizer && typeof showNotification === 'function') {
              showNotification(_t('casual.matchCancelled'), _t('casual.matchCancelledMsg'), 'info');
            }
            try { window.location.hash = '#dashboard'; } catch(e) {}
            return;
          }
          var data = doc.data();
          // v2.2.12: mantém lista local de UIDs dos jogadores reais
          if (data && Array.isArray(data.playerUids)) _knownPlayerUids = data.playerUids;
          // v1.7.3-beta: na 1ª invocação, inicializa _lastKnownSetupAt com
          // o valor atual do doc (evita falso-positivo de "setup" no attach).
          if (!_firstSnapshotSeen) {
            _firstSnapshotSeen = true;
            _lastKnownSetupAt = (data && data.setupAt) || null;
          }
          // v2.1.93: host fechou a partida — evacua guests do live-scoring-overlay.
          // hostClosed:true é escrito pelo organizador ao clicar Fechar (inclusive
          // quando status='finished', onde leaveCasualMatch não é chamado).
          // Status 'finished' não é alterado para preservar o histórico.
          if (data && data.hostClosed === true && !_casualCancelled) {
            var _cuHC = window.AppStore && window.AppStore.currentUser;
            var _wasHostHC = _cuHC && _casualCreatedBy && _cuHC.uid === _casualCreatedBy;
            // v2.2.29-beta: em partida FINALIZADA, QUALQUER cliente que ainda
            // está vendo as stats evacua ao receber hostClosed — inclusive o
            // host (quando NÃO foi ele que fechou; quem fechou já saiu e
            // desinscreveu o listener). Antes só guests saíam, então o host
            // remanescente ficava "fantasma" se um guest encerrasse.
            if (!_wasHostHC || (data && data.status === 'finished')) {
              _casualCancelled = true;
              if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
              try { _releaseWakeLock(); } catch(e) {}
              var _ovHC = document.getElementById('live-scoring-overlay');
              if (_ovHC) _ovHC.remove();
              _watchTeardown();
              // v2.2.16-beta: limpa referência de sala para o guest não ficar
              // com ponteiro morto para uma sala encerrada pelo host.
              try {
                window._suppressCasualResumeUntil = Date.now() + 6000;
                sessionStorage.removeItem('_activeCasualRoom');
                if (_cuHC && _cuHC.uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
                  window.FirestoreDB.saveUserProfile(_cuHC.uid, { activeCasualRoom: null }).catch(function(){});
                }
              } catch(e) {}
              if (typeof showNotification === 'function') showNotification('Partida encerrada', 'O host encerrou a partida.', 'info');
              try { window.location.hash = '#dashboard'; } catch(e) {}
            }
            return;
          }
          // v2.2.12-beta: consenso de encerramento — um jogador quer fechar
          // e aguarda confirmação dos demais antes de voltar à sala.
          var _cp = data && data.closePending;
          var _cuCP = window.AppStore && window.AppStore.currentUser;
          var _myUidCP = _cuCP && _cuCP.uid;
          if (_cp && _myUidCP && !_casualCancelled) {
            var _amInitiator = _cp.by === _myUidCP;
            var _confirmed = Array.isArray(_cp.confirmedBy) && _cp.confirmedBy.indexOf(_myUidCP) !== -1;
            var _existingBanner = document.getElementById('close-pending-banner');
            if (!_existingBanner) {
              _showClosePendingBanner(_amInitiator, _cp.byName || '');
            } else if (!_amInitiator && !_confirmed) {
              // banner já existe e eu ainda não confirmei — nada a fazer
            }
          } else {
            // closePending foi removido (Recusar/Cancelar) — remove o banner e
            // reseta o flag local pra TODOS resumirem o placar e poderem
            // re-iniciar um encerramento depois. v2.2.23-beta: sem o reset de
            // _myCloseClicked, o iniciador ficava travado (próximo ✕ caía no
            // confirm dialog em vez do consenso) após um Recusar do outro.
            var _bannerToRemove = document.getElementById('close-pending-banner');
            if (_bannerToRemove) _bannerToRemove.remove();
            if (_closePendingTimer) { clearInterval(_closePendingTimer); _closePendingTimer = null; }
            _myCloseClicked = false;
          }
          // v2.2.30-beta: a sala apontou pra uma NOVA sala (o "Iniciar" criou um
          // novo doc pra a próxima partida). SEGUE pra lá. ROOT FIX do bug
          // "quem clicou Iniciar em segundo ficou preso no Aguardando": o
          // cliente que aguardava estava escutando o doc ANTIGO; quando o
          // starter criava o novo doc + nextRoomCode, o branch status==='finished'
          // abaixo dava `return` ANTES de qualquer lógica de follow — então o
          // cliente nunca migrava. Agora detectamos nextRoomCode aqui no topo e
          // navegamos pro novo placar, levando AMBOS pra mesma partida.
          if (data && data.nextRoomCode && !_casualCancelled) {
            var _nrc = String(data.nextRoomCode);
            _casualCancelled = true;
            if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
            try { window.removeEventListener('resize', _onResize); } catch(e) {}
            try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
            try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
            try { _releaseWakeLock(); } catch(e) {}
            var _bnr = document.getElementById('close-pending-banner');
            if (_bnr) _bnr.remove();
            var _ovNR = document.getElementById('live-scoring-overlay');
            if (_ovNR) _ovNR.remove();
            try { sessionStorage.setItem('_activeCasualRoom', _nrc); } catch(e) {}
            if (typeof window._navigateToScannedRoute === 'function') {
              window._navigateToScannedRoute('#casual/' + _nrc);
            } else {
              try { window.location.hash = '#casual/' + _nrc; } catch(e) {}
            }
            return;
          }
          // v1.7.3-beta: Match ended (status='finished') — APLICA o
          // liveState final no overlay e deixa o usuário ver a tela de
          // stats (renderizada quando state.isFinished=true).
          // Bug reportado: amigo participante de partida casual não viu
          // estatísticas ao final. Antes redirecionávamos pra
          // _renderCasualJoin → "result screen" mostrava só placar e
          // vencedor, sem comparativeSection (% saque, recepção, breaks,
          // killer points etc). Agora o overlay continua aberto no
          // finished state com TODAS as stats visíveis. Usuário fecha
          // manualmente quando quiser.
          if (data && data.status === 'finished' && !_casualCancelled) {
            // Aplica o liveState final (com isFinished=true e todos os
            // dados de pointLog/gameLog/sets pra render das stats).
            // _isRemoteUpdate mantido true DURANTE o _render() para que
            // _syncLiveState() não escreva de volta no Firestore e cause
            // um loop infinito (listener → render → sync → listener → ...).
            _isRemoteUpdate = true;
            if (data.liveState) {
              _applyRemoteState(data.liveState);
              state.isFinished = true; // garantia, caso liveState nao tenha
              if (data.liveState.winner != null) state.winner = data.liveState.winner;
              _matchEndTime = _matchEndTime || Date.now();
              // v2.2.22-beta: baseline = _ts do finish, para que só um Jogar
              // Novamente real (com _ts maior) re-abra o placar — snapshots
              // 'active' em trânsito (mais antigos) não revertem as stats.
              if (data.liveState._ts) _lastSyncTs = data.liveState._ts;
            }
            // v2.2.25-beta: aplica a config de stats compartilhada (Sortear /
            // Mistas / Rei-Rainha) escrita por outro jogador, pra que todos
            // vejam os mesmos toggles. _isRemoteUpdate=true já impede eco.
            try { _applyRemoteStatsConfig(data.statsConfig); } catch (e) {}
            // NÃO para o listener — mantém vivo para detectar se alguém
            // clicar "Jogar Novamente" (status volta pra 'active').
            // Re-render no estado finished — comparativeSection com stats
            // detalhadas aparece automaticamente no _render() quando
            // isFinished=true.
            try { _render(); } catch(e) {}
            _isRemoteUpdate = false;
            // v2.2.26-beta: consenso de "Jogar Novamente". Atualiza o botão
            // (mostra "N pronto" / "Aguardando os outros") com o restartReady
            // remoto e, se a condição foi atingida, o cliente designado (menor
            // uid entre os prontos) dispara a nova partida — os demais seguem.
            try {
              var _rr = (data && Array.isArray(data.restartReady)) ? data.restartReady : [];
              _updateRestartButtonUI(_rr);
              if (_myRestartClicked && !_restartInitiated &&
                  _restartConditionMet(_rr, data) && _amRestartStarter(_rr)) {
                _restartInitiated = true;
                _doRestartNow();
              }
            } catch (e) {}
            // Notificação leve pro guest saber que jogo acabou (host não
            // recebe esta — ele já viu o confirm dialog).
            // v2.2.18-beta: stats aparecem automaticamente — sem notificação de ✕
            return;
          }
          // v1.7.3-beta: "Jogar Novamente" / "Desparear" — sinaliza via
          // campo setupAt (não mais status:'setup', que destruía o registro
          // histórico ao sobrescrever status:'finished').
          // Compatibilidade: continua reagindo a status:'setup' de versões
          // antigas de outros clientes na mesma sala.
          var _newSetupAt = data && data.setupAt;
          var _setupSignal = (data && data.status === 'setup') ||
            (_newSetupAt && _newSetupAt !== _lastKnownSetupAt);
          if (_setupSignal && !_casualCancelled) {
            _lastKnownSetupAt = _newSetupAt || _lastKnownSetupAt;
            setTimeout(function() {
              if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
              try { window.removeEventListener('resize', _onResize); } catch(e) {}
              try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
              try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
              try { _releaseWakeLock(); } catch(e) {}
              var ov = document.getElementById('live-scoring-overlay');
              if (ov) ov.remove();
              _watchTeardown();
              if (typeof window._casualReopenSetup === 'function') {
                // v1.6.60-beta: keepSession preserva _sessionDocId para que
                // gêneros e formação de duplas sejam propagados via Firestore.
                window._casualReopenSetup({ keepSession: true });
              } else {
                _goToSetupLocally();
              }
            }, 50);
            return;
          }
          // Alguém clicou "Jogar Novamente" nas stats —
          // status voltou pra 'active'. Reseta state e re-renderiza o
          // placar ao vivo para todos os demais logados que estavam
          // vendo as stats.
          // v2.2.22-beta: só reverte pro placar (Jogar Novamente) se o liveState
          // remoto for GENUINAMENTE mais novo que o nosso baseline. Um snapshot
          // 'active' em trânsito (de antes do encerramento, _ts menor) NÃO pode
          // mais des-finalizar a partida — era a causa de "match point não fez
          // nada" no modo multiplayer.
          if (data && data.status === 'active' && state.isFinished && !_casualCancelled &&
              data.liveState && data.liveState._ts && data.liveState._ts > _lastSyncTs) {
            _isRemoteUpdate = true;
            if (data.liveState) {
              _applyRemoteState(data.liveState);
            } else {
              state.isFinished = false;
              state.winner = null;
            }
            _isRemoteUpdate = false;
            _resultSaved = false;
            _matchStartTime = null;
            _matchEndTime = null;
            _lastSyncTs = (data.liveState && data.liveState._ts) || 0;
            try { _render(); } catch(e) {}
            return;
          }
          if (!data.liveState || !data.liveState._ts) return;
          // Only apply if remote timestamp is newer than ours
          var localTs = _lastSyncTs || 0;
          if (data.liveState._ts > localTs) {
            _isRemoteUpdate = true;
            _applyRemoteState(data.liveState);
            _lastSyncTs = data.liveState._ts;
            _render();
            _isRemoteUpdate = false;
          }
        });
    } catch(e) {
      window._warn('[LiveScore] Firestore listener error:', e);
    }
  }
  var _lastSyncTs = 0;
  // v1.7.3-beta: rastreia o último setupAt visto no Firestore.
  // Inicializado como null e setado no 1º snapshot para que mudanças
  // posteriores (Jogar Novamente / Desparear) disparem o go-to-setup
  // sem falso-positivo no attach inicial do listener.
  var _lastKnownSetupAt = null;
  var _firstSnapshotSeen = false;

  // Start listener if we have a casual doc
  if (_casualDocId) {
    _startFirestoreListener();
  }

  // ── Global handlers (attached to window for onclick access) ──
  window._liveScorePoint = function(player) { _addPoint(player); _watchNotify(); };

  // ── Ponte pro smartwatch (fase 4, contrato docs/smartwatch-bridge.md) ──
  // Leitor read-only do estado do placar, indexado por TIME (1/2). Vive aqui
  // dentro do closure pra enxergar state/_formatGamePoint/_currentSet/etc.
  // Na web ninguém consome (WatchBridge é inerte) → zero efeito.
  // Nome curto SÓ PRO RELÓGIO — exceção deliberada à regra de sempre mostrar o
  // nome de perfil inteiro (a tela do relógio é pequena). Primeiro nome; se dois
  // jogadores têm o MESMO primeiro nome, desempata com a inicial do sobrenome
  // (Rodrigo B / Rodrigo U). Vive AQUI, no caminho exclusivo do snapshot do
  // relógio — o app (celular) nunca abrevia. Ver feedback_maximize_screen_area.
  function _watchShortNames(names) {
    var map = {};
    var first = function (n) { return String(n || '').trim().split(/\s+/)[0] || String(n || ''); };
    var lastIni = function (n) {
      var p = String(n || '').trim().split(/\s+/);
      return p.length > 1 ? (p[p.length - 1].charAt(0) || '').toUpperCase() : '';
    };
    var firstCount = {};
    names.forEach(function (n) { var f = first(n).toLowerCase(); if (f) firstCount[f] = (firstCount[f] || 0) + 1; });
    names.forEach(function (n) {
      if (map[n] !== undefined) return;
      var f = first(n);
      if (firstCount[f.toLowerCase()] > 1) {
        var li = lastIni(n);
        map[n] = li ? (f + ' ' + li) : f;
      } else { map[n] = f; }
    });
    // Se "Rodrigo B" ainda colide (mesmo 1º nome E mesma inicial), cai pro nome
    // inteiro pra não confundir dois jogadores.
    var sc = {};
    Object.keys(map).forEach(function (k) { var s = map[k].toLowerCase(); sc[s] = (sc[s] || 0) + 1; });
    Object.keys(map).forEach(function (k) { if (sc[map[k].toLowerCase()] > 1) map[k] = k; });
    return map;
  }

  window._getLiveScoreState = function() {
    var cs = _currentSet();
    var srv = _getCurrentServer();
    // Mapa de abreviação construído da UNIÃO de todos os nomes da partida
    // (inclui os 4 do Rei/Rainha, que rotacionam) pra a abreviação ser estável.
    var _allNames = p1Players.concat(p2Players);
    if (_reiRainhaMode && _reiRainhaPlayers) _allNames = _allNames.concat(_reiRainhaPlayers);
    var _wnMap = _watchShortNames(_allNames);
    var _wn = function (n) { return _wnMap[n] !== undefined ? _wnMap[n] : (String(n || '').trim().split(/\s+/)[0] || n); };
    // Listas abreviadas (uma vez). Todo campo de nome do relógio passa por _wn —
    // é a consistência que faz o matching por nome (bola no sacador, item aceso
    // no seletor) continuar batendo: os dois lados abreviam igual.
    var _elig = _serveEligibleNow().map(function (e) { return { team: e.team, playerIdx: e.playerIdx, name: _wn(e.name) }; });
    var _rr = _rrStandingsNow().map(function (r) { return { name: _wn(r.name), wins: r.wins }; });
    var _spCurRaw = (state.serveOrder && state.serveOrder[state.totalGamesPlayed])
      ? (state.serveOrder[state.totalGamesPlayed].name || '') : '';
    return {
      v: 1,
      type: 'state',
      active: !state.isFinished,
      setLabel: 'Set ' + state.sets.length,
      points: [
        _formatGamePoint(state.currentGameP1, state.currentGameP2, state.isTiebreak),
        _formatGamePoint(state.currentGameP2, state.currentGameP1, state.isTiebreak)
      ],
      games: cs ? [cs.gamesP1, cs.gamesP2] : [0, 0],
      isTiebreak: !!state.isTiebreak,
      courtLeft: _courtLeft,
      server: srv ? { team: srv.team, name: _wn(srv.name) } : null,
      teams: {
        '1': { players: p1Players.map(_wn) },
        '2': { players: p2Players.map(_wn) }
      },
      // Sets ganhos por time [time1, time2]. Durante o jogo conta só sets
      // FECHADOS (o set atual em curso não é "ganho" ainda); ao encerrar,
      // includeAll=true inclui o set decisivo. O relógio só desenha isto pra
      // melhor-de-N (setsToWin>1) — em 1 set (Beach Tennis) fica oculto.
      sets: [_setsWon(1, !!state.isFinished), _setsWon(2, !!state.isFinished)],
      setsToWin: state.setsToWin || 1,
      // "Jogar novamente" só faz sentido em partida casual (recomeça com os
      // mesmos jogadores). Em torneio o resultado é definitivo → sem botão.
      // No Rei/Rainha NÃO se aplica: o fim de um jogo leva ao PRÓXIMO da série
      // de 3 (duplas rotacionam), não a um recomeço — o relógio oferece
      // "Jogo N de 3" no lugar.
      canReplay: !!isCasual && !_reiRainhaMode,
      // ⚡ casual · 🏆 torneio — o relógio mostra o ícone certo na faixa da modalidade.
      isCasual: !!isCasual,
      // Modalidade (pra faixa "⚡/🏆 <modalidade>" no seletor de sacador, igual ao
      // Iniciar). Casual = opts.sportName; torneio = t.sport.
      sportName: (isCasual ? ((opts && opts.sportName) || '') : (t && t.sport ? t.sport : '')),
      // ── Rei/Rainha: 3 jogos, 4 pessoas, duplas trocam a cada jogo ──
      // rrRound: 0=1º jogo · 1=2º · 2=3º · 3=série encerrada (sentinela do motor).
      // O relógio usa isto pra mostrar "Jogo N de 3" e oferecer avançar/ver final.
      reiRainha: !!_reiRainhaMode,
      rrRound: _reiRainhaRound,
      // Vitórias por PESSOA, já ordenado — a dupla muda todo jogo, o mérito é
      // individual. O relógio só desenha; a contagem é toda do motor.
      rrStandings: _rr,
      // Duplas → o relógio pode oferecer o toggle "Re-sortear duplas".
      isDoubles: !!isDoubles,
      // Sugestão de Rei/Rainha no fim de jogo (2 pares distintos jogados, falta o
      // 3º) → o toggle "Re-sortear" vira "👑 Rei/Rainha" e o Iniciar (ligado)
      // dispara o rrActivate (ativa a série retroativa e começa o 3º jogo).
      rrSuggest: _rrSuggestNow(),
      // Seleção de sacador. A REGRA é toda daqui — o relógio recebe a lista
      // pronta e só desenha. canSetServer sai da própria lista (vazia = travado),
      // então o seletor nunca aparece oferecendo alguém que o _liveSetServer
      // recusaria em silêncio.
      canSetServer: _elig.length > 0,
      serveEligible: _elig,
      // Fase da escolha: 0 = quem ABRE o saque (4 nomes) · 1 = quem faz o 2º
      // saque do set (só o time que não abriu) · -1 = travado. O relógio usa a
      // MUDANÇA de fase pra pedir confirmação entre o 1º e o 2º game.
      servePickPhase: _elig.length > 0 ? state.totalGamesPlayed : -1,
      // Quem OCUPA o slot em disputa agora (o motor sempre tem um padrão —
      // no 2º saque é opponents[0], escolhido sem ninguém confirmar). O relógio
      // abre o seletor já com este nome aceso, então "Confirmar" sem mexer em
      // nada = manter o que está. Abreviado (_wn) igual à lista, pra o "aceso" casar.
      servePickCurrent: _wn(_spCurRaw),
      isFinished: !!state.isFinished,
      winner: state.winner || null,
      // v4.5.43: empate esperando decisão (prorrogar vs tie-break). O relógio
      // mostra o prompt e devolve a intenção 'resolveTie'. Recorre a cada empate.
      tieRulePending: !!state.tieRulePending,
      tiedAt: (state.tieRulePending && cs) ? cs.gamesP1 : null
    };
  };
  // Classificação do Rei/Rainha (vitórias por PESSOA — a dupla muda a cada jogo,
  // o mérito é individual). Mesmo critério do _reiRainhaShowFinal: mais vitórias
  // primeiro, nome como desempate. _reiRainhaPlayers só existe depois da 1ª
  // rotação, então antes disso montamos a partir dos times atuais.
  function _rrStandingsNow() {
    if (!_reiRainhaMode) return [];
    var names = _reiRainhaPlayers || p1Players.slice().concat(p2Players.slice());
    var out = [];
    for (var i = 0; i < 4 && i < names.length; i++) {
      if (names[i]) out.push({ name: names[i], wins: _reiRainhaWins[i] || 0 });
    }
    out.sort(function (a, b) { return b.wins - a.wins || a.name.localeCompare(b.name); });
    return out;
  }

  // Sugestão de Rei/Rainha no relógio: casual + duplas, NÃO já em Rei/Rainha, e
  // com EXATAMENTE 2 PARES DISTINTOS já jogados (partida atual + histórico da
  // sessão, deduplicados por chave de partição) entre os MESMOS 4 jogadores — ou
  // seja, só falta o 3º par pra fechar a série. Mesma regra de partição do
  // _activateReiRainhaRetroactive; o relógio só desenha o toggle "👑 Rei/Rainha".
  function _rrSuggestNow() {
    if (_reiRainhaMode) return false;
    if (!isCasual || !isDoubles) return false;
    var cur1 = p1Players.slice(), cur2 = p2Players.slice();
    if (cur1.length + cur2.length !== 4) return false;
    var playerSet = cur1.concat(cur2).slice().sort().join('\x00');
    function _pk(t1, t2) {
      var s1 = t1.slice().sort().join('|'), s2 = t2.slice().sort().join('|');
      return [s1, s2].sort().join('::');
    }
    var keys = {};
    keys[_pk(cur1, cur2)] = true;
    for (var i = 0; i < _sessionGameHistory.length; i++) {
      var gh = _sessionGameHistory[i];
      if (!gh || !gh.p1 || !gh.p2) continue;
      if (gh.p1.concat(gh.p2).slice().sort().join('\x00') !== playerSet) continue; // outros jogadores
      keys[_pk(gh.p1, gh.p2)] = true;
    }
    return Object.keys(keys).length === 2;
  }

  // Empurra o estado atual pro relógio (no-op se a ponte não estiver ativa/web).
  function _watchNotify() {
    if (window.WatchBridge && window.WatchBridge._onEngineState) {
      try { window.WatchBridge._onEngineState(window._getLiveScoreState()); } catch (e) {}
    }
  }
  // Desfaz a fiação do relógio quando o placar fecha. TEM de rodar em TODO
  // caminho de fechamento: sem isto o relógio nunca sabe que acabou e fica
  // preso na tela de vitória (o overlay de vencedor cobre os botões +1 e, se o
  // usuário já dispensou o "Jogar novamente", não sobra saída nenhuma — só
  // matando o app do relógio). Bug real: o ✕ "Encerrar" (_liveScoreCloseStats)
  // removia o overlay mas não avisava a ponte, enquanto _closeLiveScoring avisava.
  // Agora os dois chamam ESTA função — o teardown é único de fato.
  function _watchTeardown() {
    window._getLiveScoreState = null;
    window._liveScorePoint = null;
    window._liveScoreUndoLastPoint = null;
    if (window.WatchBridge && window.WatchBridge.pushInactive) {
      try { window.WatchBridge.pushInactive(); } catch (e) {}
    }
  }
  // Estado INICIAL pro relógio assim que o placar abre (torneio, Rei/Rainha OU
  // casual — todos passam por aqui). Sem isso o relógio só atualizaria no
  // próximo hello/ponto; no "jogar novamente" ficaria com o placar anterior.
  _watchNotify();
  window._liveScoreFinish = function() {
    // For simple scoring: finish and set winner
    if (state.currentGameP1 === state.currentGameP2 && state.currentGameP1 === 0) {
      showNotification(_t('bui.emptyScore'), _t('bui.emptyScoreMsg'), 'warning');
      return;
    }
    state.isFinished = true;
    if (state.currentGameP1 > state.currentGameP2) state.winner = 1;
    else if (state.currentGameP2 > state.currentGameP1) state.winner = 2;
    else state.winner = 0; // draw
    _matchEndTime = Date.now();
    // v1.6.11-beta: autosave imediato em modo casual — mesma razão do bloco
    // em _finishSet. Sem isso a partida não persiste status:'finished' e some
    // do histórico. winner===0 (empate) também precisa salvar pra histórico.
    if (isCasual && !_resultSaved) {
      try { _saveResult({ keepOpen: true, silent: true }); } catch (_e) {}
    }
    _render();
    _watchNotify(); // relógio reflete o encerramento (mostra vencedor)
  };

  // Minus handler: subtract a point (correction)
  window._liveScoreMinus = function(player) {
    if (state.isFinished) return;
    if (state.tieRulePending) return;
    // Haptic distintivo do +ponto — padrão de 2 pulsos curtos para sinalizar
    // "desfeito" vs 1 pulso do ponto adicionado.
    if (window._haptic) window._haptic('warning');
    if (player === 1) {
      if (state.currentGameP1 > 0) state.currentGameP1--;
    } else {
      if (state.currentGameP2 > 0) state.currentGameP2--;
    }
    // Remove a última entrada do pointLog correspondente a ESTE jogador
    // para manter stats de tempo coerentes. Push o timestamp original num
    // STACK para o próximo _addPoint pop'ar — assim o intervalo "antes →
    // correto" ignora os segundos gastos na correção, mesmo se houver
    // múltiplos undos consecutivos. v1.0.35-beta: era single-shot
    // _recentUndoTs antes (perdia timestamps quando 2+ undos seguidos).
    var log = state.pointLog || [];
    for (var i = log.length - 1; i >= 0; i--) {
      if (log[i].team === player) {
        var popped = log.splice(i, 1)[0];
        if (popped && popped.t && (Date.now() - popped.t) < 30000) {
          if (!Array.isArray(state._recentUndoStack)) state._recentUndoStack = [];
          state._recentUndoStack.push({ ts: popped.t, undoneAt: Date.now() });
        }
        break;
      }
    }
    // For fixed set, sync back to the set object
    if (state.isFixedSet) {
      var cs = _currentSet();
      cs.gamesP1 = state.currentGameP1;
      cs.gamesP2 = state.currentGameP2;
    }
    _render();
    _watchNotify(); // relógio reflete a correção de −1
  };

  // v1.0.36-beta: Global undo do último ponto via snapshot de estado.
  // Diferente do _liveScoreMinus (que só decrementa o game corrente), esse
  // undo desfaz a ÚLTIMA mutação de _addPoint completa — atravessa
  // transições de game/set/finish. Cenário-alvo reportado: "num jogo 40-40
  // o ponto vitorioso ser marcado por acidente para o lado errado e
  // atualmente não temos como corrigir". Agora basta clicar ↶ Desfazer no
  // header da tela de placar e o estado volta exatamente pra antes do tap.
  window._liveScoreUndoLastPoint = function() {
    if (state.tieRulePending) {
      showNotification('Aguarde', 'Termine a transição de set antes de desfazer.', 'warning');
      return;
    }
    if (!Array.isArray(state._undoSnapshots) || state._undoSnapshots.length === 0) {
      showNotification('↶ Nada pra desfazer', 'Não há pontos registrados nesta partida ainda.', 'info');
      return;
    }
    var snapJson = state._undoSnapshots.pop();
    var snap;
    try {
      snap = JSON.parse(snapJson);
    } catch (e) {
      window._error('[liveScoreUndo] snapshot parse failed', e);
      showNotification('Erro', 'Não foi possível desfazer (snapshot corrompido).', 'error');
      return;
    }
    // Restaura todas as keys do snapshot. Apaga keys novas que não existiam
    // no snapshot pra evitar lixo (ex: state._tempFlag temporário).
    var keysInSnap = Object.keys(snap.state);
    for (var k in state) {
      if (Object.prototype.hasOwnProperty.call(state, k)
          && k !== '_undoSnapshots'
          && keysInSnap.indexOf(k) === -1) {
        delete state[k];
      }
    }
    keysInSnap.forEach(function(kk) { state[kk] = snap.state[kk]; });
    _matchStartTime = snap.matchStartTime;
    _matchEndTime = snap.matchEndTime;
    // Haptic distintivo — 3 pulsos curtos pra "voltei no tempo".
    if (window._haptic) window._haptic('undo');
    // Re-render. Se o último ponto tinha encerrado o match (state.isFinished
    // true), agora volta pra false e _render renderiza a UI de live scoring
    // de novo no lugar do finish screen.
    _render();
    _watchNotify();
    var remaining = state._undoSnapshots.length;
    showNotification('↶ Ponto desfeito', remaining > 0 ? ('Pode desfazer mais ' + remaining + ' ponto(s) se precisar.') : 'Estado anterior restaurado.', 'success');
  };

  // Rebuild _proposedOrder from current player arrays and re-fill serveOrder.
  // Used by reset/restart so the serve ball re-appears on a fresh match.
  function _reinitServeOrderForNewMatch() {
    _proposedOrder.length = 0;
    var _mx = Math.max(p1Players.length, p2Players.length);
    for (var _pi = 0; _pi < _mx; _pi++) {
      if (_pi < p1Players.length) _proposedOrder.push({ team: 1, name: p1Players[_pi], pIdx: _pi });
      if (_pi < p2Players.length) _proposedOrder.push({ team: 2, name: p2Players[_pi], pIdx: _pi });
    }
    // v1.3.11: partida nova/reiniciada → zera a ordem de saque pra a Tela 1 (escolher o 1º
    // sacador) reaparecer. Antes auto-preenchia com a ordem padrão, pulando a tela.
    state.serveOrder = [];
    state.secondServerPicked = false;
  }

  // Reset handler: zero all points, restart from scratch — always available
  window._liveScoreReset = function() {
    showConfirmDialog(
      'Reiniciar contagem?',
      'Deseja reiniciar a contagem? Todos os pontos marcados serão zerados.',
      function() {
        state.sets = [{ gamesP1: 0, gamesP2: 0, tiebreak: null }];
        state.currentGameP1 = 0;
        state.currentGameP2 = 0;
        state.isTiebreak = false;
        state.isFinished = false;
        state.winner = null;
        state.tieRulePending = false;
        state.totalGamesPlayed = 0;
        state.serveOrder = [];
        state.serveSkipped = false;
        state.servePending = false;
        state.secondServerPicked = false;
        state.gameLog = [];
        state.pointLog = [];
        // Reset tieRule to original value from scoring config
        state.tieRule = sc.tieRule || null;
        // v1.0.36-beta: limpa snapshots de undo + recovery stack — após reset
        // não faz sentido voltar pra estado antes do reset.
        state._undoSnapshots = [];
        state._recentUndoStack = [];
        _matchStartTime = null;
        _matchEndTime = null;
        _reinitServeOrderForNewMatch();
        _render();
      }
    );
  };

  // ── v1.6.11-beta: Rei/Rainha da Praia ────────────────────────────────────────

  // v1.6.105-beta: salva snapshot de 1 round como doc separado em casualMatches.
  // Permite que as 3 rodadas apareçam individualmente no histórico "Últimas Partidas".
  // Chamado ANTES de resetar o state (para capturar placar/sets do round concluído).
  var _saveReiRainhaRoundSnapshot = function(roundIndex, t1Names, t2Names, winnerSide) {
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    var createdByUid = (opts && opts.createdBy) || (cu && cu.uid) || '';
    if (!createdByUid) return;
    // Build score summary
    var _rrSummary = '';
    if (useSets) {
      _rrSummary = state.sets.map(function(ss) { return ss.gamesP1 + '-' + ss.gamesP2; }).join('  ');
    } else {
      _rrSummary = state.currentGameP1 + ' × ' + state.currentGameP2;
    }
    // Build players array, matching UIDs from _casualPlayers
    var _buildTeam = function(names, teamNum) {
      return (names || []).map(function(nm) {
        var found = null;
        for (var ci = 0; ci < (_casualPlayers || []).length; ci++) {
          var cp = _casualPlayers[ci];
          if (cp.name === nm || cp.displayName === nm) { found = cp; break; }
        }
        return { name: nm, displayName: nm, uid: (found && found.uid) || '', team: teamNum };
      });
    };
    var roundPlayers = _buildTeam(t1Names, 1).concat(_buildTeam(t2Names, 2));
    var roundUids = roundPlayers.filter(function(p) { return !!p.uid; }).map(function(p) { return p.uid; });
    var sessionCode = (opts && opts.roomCode) || '';
    var roundRoomCode = sessionCode ? (sessionCode + '_rr' + roundIndex) : ('rr_' + Date.now() + '_' + roundIndex);
    var setsData = null;
    if (useSets) {
      setsData = state.sets.map(function(ss) {
        var se = { gamesP1: ss.gamesP1, gamesP2: ss.gamesP2 };
        if (ss.tiebreak) se.tiebreak = { pointsP1: ss.tiebreak.p1, pointsP2: ss.tiebreak.p2 };
        return se;
      });
    }
    var resultData = {
      winner: winnerSide,
      summary: _rrSummary,
      p1Score: useSets ? null : state.currentGameP1,
      p2Score: useSets ? null : state.currentGameP2
    };
    if (setsData) resultData.sets = setsData;
    var payload = {
      createdBy: createdByUid,
      createdByName: (cu && cu.displayName) || '',
      createdAt: new Date().toISOString(),
      sport: (opts && opts.sportName) || '',
      isDoubles: true,
      status: 'finished',
      result: resultData,
      players: roundPlayers,
      playerUids: roundUids,
      roomCode: roundRoomCode,
      reiRainhaRound: roundIndex,
      reiRainhaSessionId: _casualDocId || ''
    };
    try {
      window.FirestoreDB.db.collection('casualMatches').add(payload).catch(function(e) {
        window._warn('[ReiRainha] round snapshot save err r' + roundIndex + ':', e);
      });
    } catch(e) {}
  };

  // Avança para o próximo jogo: salva resultado, rotaciona duplas e reinicia placar.
  window._reiRainhaNextRound = function() {
    // 1. Captura jogadores fixos na transição round 0→1
    if (!_reiRainhaPlayers) {
      _reiRainhaPlayers = p1Players.slice().concat(p2Players.slice());
      // garante exatamente 4 entradas
      while (_reiRainhaPlayers.length < 4) _reiRainhaPlayers.push('Jogador ' + (_reiRainhaPlayers.length + 1));
    }

    // 2. Salva resultado do jogo atual (silencioso — não fecha overlay)
    if (state.isFinished && !_resultSaved) {
      try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {}
    }
    _resultSaved = false;

    // 3. Registra vitórias do round atual e salva snapshot independente para histórico
    var pairing = _reiRainhaPairings[_reiRainhaRound];
    if (state.winner === 1) {
      pairing.t1.forEach(function(i) { _reiRainhaWins[i]++; });
    } else if (state.winner === 2) {
      pairing.t2.forEach(function(i) { _reiRainhaWins[i]++; });
    }
    // empate: ninguém ganha
    // v1.6.105-beta: salva doc separado para este round aparecer no histórico
    _saveReiRainhaRoundSnapshot(_reiRainhaRound, p1Players.slice(), p2Players.slice(), state.winner || 0);

    // 4. Avança rodada
    _reiRainhaRound++;

    // 5. Define novas duplas com base no pairing da próxima rodada
    var nextPairing = _reiRainhaPairings[_reiRainhaRound];
    p1Players.length = 0;
    nextPairing.t1.forEach(function(i) { p1Players.push(_reiRainhaPlayers[i]); });
    p2Players.length = 0;
    nextPairing.t2.forEach(function(i) { p2Players.push(_reiRainhaPlayers[i]); });

    // 6. Reinicia estado de placar
    state.sets = [{ gamesP1: 0, gamesP2: 0, tiebreak: null }];
    state.currentGameP1 = 0; state.currentGameP2 = 0;
    state.isTiebreak = false; state.isFinished = false;
    state.winner = null; state.tieRulePending = false;
    state.totalGamesPlayed = 0; state.serveOrder = [];
    state.serveSkipped = false; state.servePending = false;
    state.gameLog = []; state.pointLog = [];
    state.tieRule = sc.tieRule || null;
    state._undoSnapshots = []; state._recentUndoStack = [];
    _matchStartTime = null; _matchEndTime = null;
    _courtLeft = 1;
    _reinitServeOrderForNewMatch();

    // 7. Atualiza Firestore (sinaliza nova partida pra todos)
    if (_casualDocId && window.FirestoreDB && window.FirestoreDB.db) {
      try {
        window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId).update({
          status: 'active',
          liveState: _serializeState()
        }).catch(function(e) { window._warn('[ReiRainha] next-round write err:', e); });
      } catch(e) {}
    }

    _render();
    // Faltava: sem isto o relógio ficava congelado no jogo ANTERIOR (placar do
    // jogo que acabou, duplas velhas) enquanto o celular já estava no próximo.
    _watchNotify();
    if (typeof window.showNotification === 'function') {
      window.showNotification('👑 Jogo ' + (_reiRainhaRound + 1) + ' de 3',
        p1Players.join(' & ') + ' vs ' + p2Players.join(' & '), 'info');
    }
  };

  // ─── v2.2.1-beta: handlers dos toggles da página de estatísticas ─────────────
  // Atualizam variáveis do closure diretamente; chamados via onchange no DOM.

  // v2.2.25-beta: sincroniza as configurações da tela de estatísticas (Sortear
  // Duplas / Duplas Mistas / Rei-Rainha) para TODOS os jogadores da sala via
  // Firestore. Quando um jogador mexe num toggle, os outros veem a mesma
  // configuração — a próxima partida sai igual pra todos.
  function _syncStatsConfig() {
    if (!_casualDocId || !window.FirestoreDB || !window.FirestoreDB.db) return;
    if (_isRemoteUpdate) return; // não ecoa de volta um apply remoto
    try {
      window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId).update({
        statsConfig: {
          autoShuffle: !!autoShuffle,
          mixedDoubles: !!_mixedDoublesEnabled,
          reiRainha: !!_reiRainhaMode,
          _ts: Date.now()
        }
      }).catch(function() {});
    } catch (e) {}
  }
  // Aplica a config remota nos toggles locais. Retorna true se algo mudou
  // (pra o caller re-renderizar). Não escreve no Firestore (evita loop).
  function _applyRemoteStatsConfig(cfg) {
    if (!cfg) return false;
    var changed = false;
    if (typeof cfg.autoShuffle === 'boolean' && cfg.autoShuffle !== autoShuffle) {
      autoShuffle = cfg.autoShuffle; changed = true;
    }
    if (typeof cfg.mixedDoubles === 'boolean' && cfg.mixedDoubles !== _mixedDoublesEnabled) {
      _mixedDoublesEnabled = cfg.mixedDoubles; changed = true;
    }
    if (typeof cfg.reiRainha === 'boolean' && cfg.reiRainha !== _reiRainhaMode) {
      if (cfg.reiRainha) {
        _reiRainhaMode = true;
        try { _activateReiRainhaRetroactive(); } catch (e) {}
      } else {
        _reiRainhaMode = false;
        _reiRainhaRound = 0;
        _reiRainhaPlayers = null;
        _reiRainhaWins = [0, 0, 0, 0];
        _reiRainhaPairings = [
          { t1: [0, 1], t2: [2, 3] },
          { t1: [0, 2], t2: [1, 3] },
          { t1: [0, 3], t2: [1, 2] }
        ];
      }
      changed = true;
    }
    return changed;
  }

  window._statsToggleShuffle = function(chk) {
    autoShuffle = !!chk.checked;
    _syncStatsConfig();
  };

  window._statsToggleMixed = function(chk) {
    _mixedDoublesEnabled = !!chk.checked;
    _syncStatsConfig();
  };

  // Ativa/desativa Rei/Rainha a partir da página de estatísticas.
  // Ao ativar, chama _activateReiRainhaRetroactive() para retroativamente
  // reconhecer jogos anteriores da mesma sessão, desde que com pairings distintos.
  window._statsToggleReiRainha = function(chk) {
    if (chk.checked) {
      _reiRainhaMode = true;
      _activateReiRainhaRetroactive();
      _render();
    } else {
      _reiRainhaMode = false;
      _reiRainhaRound = 0;
      _reiRainhaPlayers = null;
      _reiRainhaWins = [0, 0, 0, 0];
      _reiRainhaPairings = [
        { t1: [0, 1], t2: [2, 3] },
        { t1: [0, 2], t2: [1, 3] },
        { t1: [0, 3], t2: [1, 2] }
      ];
      // v2.2.37-beta: se o cabeçalho foi SEQUESTRADO pelo _reiRainhaShowFinal
      // (pódio + toggles no topo), restaura o cabeçalho original ANTES do
      // _render. Sem isto, o _render reconstrói a restartSection normal no
      // conteúdo e fica DUPLICADO (Iniciar + toggles no topo E embaixo).
      try {
        var _tbRR = document.querySelector('#live-scoring-overlay > div:first-child');
        if (_tbRR && _tbRR.innerHTML.indexOf('Resultado Final') !== -1) {
          _tbRR.outerHTML = headerHtml;
        }
      } catch (e) {}
      _render();
    }
    _syncStatsConfig(); // v2.2.25-beta: propaga pros outros jogadores
  };

  // Reconstrói o estado Rei/Rainha retroativamente a partir de _sessionGameHistory.
  //
  // Regras:
  //  - Os 4 jogadores devem ser os mesmos em todos os jogos reconhecidos.
  //  - Cada jogo deve ter um pairing distinto (nunca repetir o mesmo time).
  //  - Jogos com pairing repetido são descartados da série.
  //
  // Ao ativar no jogo N, os jogos anteriores válidos contam como rodadas iniciais.
  // O jogo atual (stats page) não tem wins pré-contados — será registrado
  // quando o usuário clicar no botão "Jogo N" (via _reiRainhaNextRound).
  // Exceção: se há 2 históricos válidos + atual = 3 rodadas completas,
  // conta wins do atual imediatamente e mostra "Ver Resultado Final".
  function _activateReiRainhaRetroactive() {
    var curP1 = p1Players.slice();
    var curP2 = p2Players.slice();
    if (curP1.length + curP2.length !== 4) return;

    var allFour = curP1.concat(curP2);
    var playerSet = allFour.slice().sort().join('\x00');

    // Chave canônica de partição: independe da ordem dos times ou jogadores.
    function _pk(t1, t2) {
      var s1 = t1.slice().sort().join('|');
      var s2 = t2.slice().sort().join('|');
      return [s1, s2].sort().join('::');
    }

    // Constrói o conjunto de partições já vistas, começando pela partida atual.
    var seenKeys = {};
    seenKeys[_pk(curP1, curP2)] = true;

    // Jogos históricos válidos: mesmos 4 jogadores, pairing distinto.
    var validHistory = [];
    for (var hi = 0; hi < _sessionGameHistory.length; hi++) {
      var gh = _sessionGameHistory[hi];
      var ghSet = gh.p1.concat(gh.p2).slice().sort().join('\x00');
      if (ghSet !== playerSet) continue; // jogadores diferentes
      var gk = _pk(gh.p1, gh.p2);
      if (seenKeys[gk]) continue; // pairing repetido — invalida
      seenKeys[gk] = true;
      validHistory.push(gh);
    }

    // Fixa os jogadores a partir da partida atual.
    _reiRainhaPlayers = allFour.slice(); // [P0, P1, P2, P3]

    // Zera vitórias e pré-conta apenas os jogos históricos.
    // As vitórias da partida atual são registradas pelo _reiRainhaNextRound.
    _reiRainhaWins = [0, 0, 0, 0];
    for (var hi2 = 0; hi2 < validHistory.length; hi2++) {
      var vg = validHistory[hi2];
      var t1i = vg.p1.map(function(n) { return _reiRainhaPlayers.indexOf(n); });
      var t2i = vg.p2.map(function(n) { return _reiRainhaPlayers.indexOf(n); });
      if (vg.winner === 1) { t1i.forEach(function(i) { if (i >= 0) _reiRainhaWins[i]++; }); }
      else if (vg.winner === 2) { t2i.forEach(function(i) { if (i >= 0) _reiRainhaWins[i]++; }); }
    }

    // Todas as 3 partições possíveis para 4 jogadores.
    var A = allFour[0], B = allFour[1], C = allFour[2], D = allFour[3];
    var allThree = [
      { t1: [A, B], t2: [C, D] },
      { t1: [A, C], t2: [B, D] },
      { t1: [A, D], t2: [B, C] }
    ];

    // Ordem dos pairings: histórico (mais antigo→recente) + atual + faltantes.
    var playedPairings = validHistory.map(function(vg) { return { t1: vg.p1.slice(), t2: vg.p2.slice() }; });
    playedPairings.push({ t1: curP1.slice(), t2: curP2.slice() });
    var missingPartitions = allThree.filter(function(part) {
      return !seenKeys[_pk(part.t1, part.t2)];
    });
    var orderedPairings = playedPairings.concat(missingPartitions).slice(0, 3);

    // Reconstrói _reiRainhaPairings com índices para _reiRainhaPlayers.
    for (var ri = 0; ri < orderedPairings.length; ri++) {
      var part = orderedPairings[ri];
      _reiRainhaPairings[ri] = {
        t1: part.t1.map(function(n) { return _reiRainhaPlayers.indexOf(n); }),
        t2: part.t2.map(function(n) { return _reiRainhaPlayers.indexOf(n); })
      };
    }

    var numHistory = validHistory.length;

    if (numHistory >= 2) {
      // Todos os 3 jogos já foram disputados — conta o atual e vai direto ao final.
      var curT1i = curP1.map(function(n) { return _reiRainhaPlayers.indexOf(n); });
      var curT2i = curP2.map(function(n) { return _reiRainhaPlayers.indexOf(n); });
      if (state.winner === 1) { curT1i.forEach(function(i) { if (i >= 0) _reiRainhaWins[i]++; }); }
      else if (state.winner === 2) { curT2i.forEach(function(i) { if (i >= 0) _reiRainhaWins[i]++; }); }
      _reiRainhaRound = 3; // sentinela: _reiRainhaShowFinal não re-conta
    } else {
      // numHistory = 0 ou 1:
      //   round = numHistory → partida atual é a rodada numHistory no sistema.
      //   _reiRainhaPairings[numHistory] = pairing da partida atual.
      //   _reiRainhaNextRound usará state.winner para registrar essa vitória.
      _reiRainhaRound = numHistory;
    }
  }

  // Exibe o resultado final após os 3 jogos do Rei/Rainha.
  window._reiRainhaShowFinal = function() {
    // Garante captura de jogadores
    if (!_reiRainhaPlayers) {
      _reiRainhaPlayers = p1Players.slice().concat(p2Players.slice());
      while (_reiRainhaPlayers.length < 4) _reiRainhaPlayers.push('Jogador ' + (_reiRainhaPlayers.length + 1));
    }

    // Salva resultado do último jogo
    if (state.isFinished && !_resultSaved) {
      try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {}
    }
    _resultSaved = false;

    // Registra vitórias do round 2 (se ainda não registrado)
    if (_reiRainhaRound === 2) {
      var pairing = _reiRainhaPairings[2];
      if (state.winner === 1) {
        pairing.t1.forEach(function(i) { _reiRainhaWins[i]++; });
      } else if (state.winner === 2) {
        pairing.t2.forEach(function(i) { _reiRainhaWins[i]++; });
      }
      // v1.6.105-beta: snapshot do round 2 para histórico independente
      _saveReiRainhaRoundSnapshot(2, p1Players.slice(), p2Players.slice(), state.winner || 0);
      _reiRainhaRound = 3; // sentinela: bloqueia re-registro
    }

    // Classifica jogadores por vitórias
    var playerResults = _reiRainhaPlayers.map(function(name, i) {
      return { name: name, wins: _reiRainhaWins[i], losses: 3 - _reiRainhaWins[i] };
    });
    playerResults.sort(function(a, b) { return b.wins - a.wins || a.name.localeCompare(b.name); });

    function _rrClassify(wins) {
      if (wins === 3) return { title: 'Rei/Rainha', icon: '👑', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' };
      if (wins === 2) return { title: 'Vice', icon: '🥈', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.3)' };
      if (wins === 1) return { title: 'Peão', icon: '🏅', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.25)' };
      return { title: 'Plebeu', icon: '🫠', color: '#6b7280', bg: 'rgba(107,114,128,0.07)', border: 'rgba(107,114,128,0.2)' };
    }

    // v3.0.x: gênero por nome (vem do perfil em opts.players) p/ a coroa do invicto.
    var _rrGmap = (typeof _genderByNameLS === 'function') ? _genderByNameLS() : {};
    var cardsHtml = playerResults.map(function(p, rank) {
      var cls = _rrClassify(p.wins);
      var rankEmoji = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : '4️⃣';
      // v3.0.x: vencedor da SÉRIE de 3 jogos (invicto, 3V) ganha a COROA por gênero
      // (A=Rainha/fem, B=Rei/masc) — mesma honraria do torneio Rei/Rainha. Os demais
      // mantêm o ícone/título de colocação (Vice/Peão/Plebeu).
      var _isKing = p.wins === 3;
      var _kGender = _rrGmap[p.name] || '';
      var _iconHtml = (_isKing && typeof window._reiRainhaCrownByGender === 'function')
        ? window._reiRainhaCrownByGender(_kGender, 28)
        : '<span style="font-size:1.3rem;">' + cls.icon + '</span>';
      var _titleTxt = (_isKing && typeof window._genderWord === 'function')
        ? window._genderWord(_kGender, 'Rei', 'Rainha')
        : cls.title;
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:' + cls.bg + ';border:1px solid ' + cls.border + ';width:100%;box-sizing:border-box;">' +
        '<span style="font-size:1.5rem;flex-shrink:0;">' + rankEmoji + '</span>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:0.95rem;font-weight:800;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window._safeHtml(p.name) + '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">' + p.wins + 'V · ' + p.losses + 'D</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;">' +
          _iconHtml +
          '<span style="font-size:0.65rem;font-weight:700;color:' + cls.color + ';text-transform:uppercase;letter-spacing:0.04em;">' + _titleTxt + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    // Monta painel de resultado final no container do overlay
    var container = document.querySelector('#live-scoring-overlay > div:first-child');
    if (!container) {
      // fallback: pega o primeiro filho do overlay
      var ov2 = document.getElementById('live-scoring-overlay');
      if (ov2) container = ov2.firstElementChild;
    }

    // Substitui restartSection (topo) pelo resumo Rei/Rainha.
    // v2.2.35-beta: inclui o CABEÇALHO (⚙️/↺/✕) e os TOGGLES (Sortear/Mistas/
    // Rei-Rainha) — antes o resultado final substituía o header e omitia os
    // toggles, deixando o usuário sem como fechar/resetar nem reconfigurar a
    // próxima partida.
    var _rrMixedRow = _canShowMixedToggle()
      ? '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:10px;background:rgba(236,72,153,0.07);border:1px solid rgba(236,72,153,0.18);cursor:pointer;">' +
          '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:0.9rem;">⚤</span><span style="font-size:0.72rem;font-weight:700;color:#f472b6;">Duplas Mistas</span></div>' +
          '<span class="toggle-switch toggle-sm" style="flex-shrink:0;"><input type="checkbox" id="chk-stats-mixed" ' + (_mixedDoublesEnabled ? 'checked' : '') + ' onchange="window._statsToggleMixed(this)" /><span class="toggle-slider"></span></span>' +
        '</label>'
      : '';
    var topBar = document.querySelector('#live-scoring-overlay > div:first-child');
    if (topBar) {
      topBar.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:10px;width:100%;">' +
          // Cabeçalho: Ajustar / Resetar / Fechar
          '<div id="live-score-header-actions" style="display:flex;gap:6px;align-items:center;justify-content:flex-end;">' +
            '<button class="live-vol-sm" onclick="window._liveScoreOpenSizeSettings&&window._liveScoreOpenSizeSettings()" style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--text-bright);border-radius:8px;padding:6px 10px;font-size:0.7rem;font-weight:600;cursor:pointer;"><span style="font-size:0.88rem;line-height:1;">⚙️</span>Ajustar</button>' +
            '<button class="live-vol-sm" onclick="window._liveScoreReset()" style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;border-radius:8px;padding:6px 10px;font-size:0.7rem;font-weight:600;cursor:pointer;">↺ Resetar</button>' +
            '<button class="live-vol-sm" onclick="window._liveStatsClose()" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:var(--text-bright);border-radius:8px;padding:6px 10px;font-size:0.7rem;font-weight:600;cursor:pointer;">✕ Fechar</button>' +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:center;gap:8px;">' +
            '<span style="font-size:1.3rem;">👑</span>' +
            '<span style="font-size:1.1rem;font-weight:900;color:#f59e0b;">Resultado Final · Rei/Rainha</span>' +
          '</div>' +
          cardsHtml +
          '<button id="live-restart-btn" onclick="window._liveScoreGoToSetup()" style="width:100%;padding:11px;border-radius:12px;font-size:0.88rem;font-weight:800;border:none;cursor:pointer;background:linear-gradient(135deg,#10b981,#059669);color:white;box-shadow:0 4px 16px rgba(16,185,129,0.35);margin-top:2px;">🔄 Iniciar</button>' +
          // Toggles da próxima partida
          '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:10px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.18);cursor:pointer;">' +
            '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:0.9rem;">🔀</span><span style="font-size:0.72rem;font-weight:700;color:#fbbf24;">Sortear Duplas</span></div>' +
            '<span class="toggle-switch toggle-sm" style="flex-shrink:0;"><input type="checkbox" id="chk-stats-shuffle" ' + (autoShuffle ? 'checked' : '') + ' onchange="window._statsToggleShuffle(this)" /><span class="toggle-slider"></span></span>' +
          '</label>' +
          _rrMixedRow +
          '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:10px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);cursor:pointer;">' +
            '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:0.9rem;">👑</span><span style="font-size:0.72rem;font-weight:700;color:#f59e0b;">Rei/Rainha</span></div>' +
            '<span class="toggle-switch toggle-sm" style="flex-shrink:0;"><input type="checkbox" id="chk-stats-rr" checked onchange="window._statsToggleReiRainha(this)" /><span class="toggle-slider"></span></span>' +
          '</label>' +
        '</div>';
    }
    // Faltava: o relógio precisa saber que a SÉRIE acabou (rrRound=3) pra sair
    // do "Jogo N de 3" e mostrar a classificação final. Sem isto ele ficava
    // oferecendo avançar uma rodada que não existe mais.
    _watchNotify();
  };

  // ── fim Rei/Rainha ────────────────────────────────────────────────────────────

  // Restart handler: reset score and optionally re-shuffle teams
  window._liveScoreRestart = function(skipConfirm, shuffleOverride) {
    var shuffleChk = document.getElementById('chk-shuffle-teams');
    // Do relógio (skipConfirm) o "re-sortear" vem no override; senão lê o
    // checkbox do celular.
    var shouldShuffle = (typeof shuffleOverride === 'boolean')
      ? shuffleOverride
      : (shuffleChk && shuffleChk.checked);
    // skipConfirm: acionado pelo relógio ("Jogar novamente" já confirmado lá),
    // então recomeça direto sem o diálogo do celular.
    var doRestart = function() {
        // Persist the finished result as confirmed before wiping state.
        if (state.isFinished && !_resultSaved) {
          try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {}
        }
        // v1.3.x: registra o jogo que ACABOU no histórico da sessão ANTES de
        // re-sortear (a mesma coisa que _doRestartNow e _liveScoreGoToSetup já
        // fazem). Sem isto, o "re-sortear" vindo do RELÓGIO (que cai aqui, e não
        // nos fluxos do celular) nunca acumulava pares jogados → _rrSuggestNow
        // travava em 1 par e a sugestão "👑 Rei/Rainha" jamais aparecia no
        // relógio (bug reportado: 3º jogo mostrava re-sortear normal). Usa os
        // times ATUAIS, antes do shuffle abaixo mutar p1Players/p2Players.
        if (isCasual && isDoubles && state.isFinished && state.winner != null) {
          _sessionGameHistory.push({
            p1: p1Players.slice(),
            p2: p2Players.slice(),
            winner: state.winner || 0
          });
        }
        // v1.3.56-beta: se o overlay foi aberto sobre uma partida já finalizada
        // (viewOnly — histórico), desvincula o novo jogo do doc antigo ANTES de
        // resetar o estado. Sem isso, _closeLiveScoring chama cancelCasualMatch
        // no doc original e deleta a partida do histórico do usuário.
        if (_viewOnly) {
          _casualDocId = null;
          _casualRoomCode = null;
          _viewOnly = false;
          // Cancela o listener Firestore do doc antigo — não queremos mais
          // receber updates desse doc no novo jogo.
          if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
        }
        // Allow next completed match to be saved again.
        _resultSaved = false;
        // Shuffle teams if requested
        if (shouldShuffle && isDoubles) {
          var allPlayers = p1Players.concat(p2Players);
          // Fisher-Yates shuffle
          for (var fi = allPlayers.length - 1; fi > 0; fi--) {
            var fj = Math.floor(Math.random() * (fi + 1));
            var tmp = allPlayers[fi]; allPlayers[fi] = allPlayers[fj]; allPlayers[fj] = tmp;
          }
          // Split into two teams
          var half = Math.ceil(allPlayers.length / 2);
          p1Players.length = 0; p2Players.length = 0;
          for (var si = 0; si < allPlayers.length; si++) {
            if (si < half) p1Players.push(allPlayers[si]);
            else p2Players.push(allPlayers[si]);
          }
        }
        // Reset state
        state.sets = [{ gamesP1: 0, gamesP2: 0, tiebreak: null }];
        state.currentGameP1 = 0;
        state.currentGameP2 = 0;
        state.isTiebreak = false;
        state.isFinished = false;
        state.winner = null;
        state.tieRulePending = false;
        state.totalGamesPlayed = 0;
        state.serveOrder = [];
        state.serveSkipped = false;
        state.servePending = false;
        state.secondServerPicked = false;
        state.gameLog = [];
        state.pointLog = [];
        state.tieRule = sc.tieRule || null;
        // v1.0.36-beta: limpa snapshots — nova partida não deve poder
        // desfazer pra antes do recomeço.
        state._undoSnapshots = [];
        state._recentUndoStack = [];
        _matchStartTime = null;
        _matchEndTime = null;
        _courtLeft = 1;
        _reinitServeOrderForNewMatch();
        // v1.6.37-beta: escreve sinal de restart no Firestore para que
        // todos os demais logados (que estavam nas stats) vejam o placar
        // ao vivo aparecer automaticamente. Re-anexa listener se parou.
        if (_casualDocId && window.FirestoreDB && window.FirestoreDB.db) {
          if (!_unsubFirestore) _startFirestoreListener();
          window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId).update({
            status: 'active',
            liveState: _serializeState()
          }).catch(function(e) { window._warn('[Casual] restart write err:', e); });
        }
        _render();
        _watchNotify(); // relógio reflete o recomeço (0×0 no relógio)
    };
    if (skipConfirm) { doRestart(); return; }
    showConfirmDialog(
      'Recomeçar partida?',
      shouldShuffle ? 'O resultado atual será salvo. As duplas serão re-sorteadas e uma nova partida começará.' : 'O resultado atual será salvo e uma nova partida começará.',
      doRestart
    );
  };

  // Desparear: salva resultado, fecha o placar e volta à tela de formação
  // de times com os mesmos jogadores mas sem duplas definidas — permite
  // re-parear manualmente ou re-sortear. Ideal para séries Rei/Rainha e
  // re-equilíbrio de forças entre partidas.
  window._liveScoreUnpair = function() {
    showConfirmDialog(
      'Desparear jogadores?',
      'O resultado será salvo. As duplas serão desfeitas e você poderá montar novos times livremente.',
      function() {
        // Persiste resultado antes de fechar
        if (state.isFinished && !_resultSaved) {
          try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {}
        }
        // Cleanup (espelha _closeLiveScoring)
        if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
        try { window.removeEventListener('resize', _onResize); } catch(e) {}
        try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
      try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
        try { _releaseWakeLock(); } catch(e) {}
        var ov = document.getElementById('live-scoring-overlay');
        if (ov) ov.remove();
        // Volta pra tela de setup com os mesmos jogadores, times desfeitos.
        // _casualReopenSetup re-appenda o overlay (removido quando _casualStart
        // foi chamado) e zera _teamAssignments para nova formação de duplas.
        if (typeof window._casualReopenSetup === 'function') {
          window._casualReopenSetup();
        } else if (typeof window._casualResetTeams === 'function') {
          window._casualResetTeams(); // fallback
        }
      }
    );
  };

  // v1.6.41-beta: lógica comum de "voltar ao setup" usada por
  // _liveScoreUnpairFromStats (botão Desparear) e _liveScoreGoToSetup
  // ("Jogar Novamente"). Fecha o overlay e reabre _openCasualMatch com
  // os mesmos jogadores sem times definidos.
  function _goToSetupLocally() {
    if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
    try { window.removeEventListener('resize', _onResize); } catch(e) {}
    try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
    try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
    try { _releaseWakeLock(); } catch(e) {}
    var ov = document.getElementById('live-scoring-overlay');
    if (ov) ov.remove();
    // Mapeia _casualPlayers → formato de participants do _openCasualMatch
    var participants = [];
    if (_casualPlayers && _casualPlayers.length > 0) {
      _casualPlayers.forEach(function(p) {
        if (!p) return;
        participants.push({
          uid: p.uid || '',
          displayName: p.name || p.displayName || '',
          photoURL: p.photoURL || '',
          joinedAt: new Date().toISOString()
        });
      });
    }
    // Fallback: extrai de p1Name / p2Name (format "A / B") quando _casualPlayers vazio
    if (!participants.length) {
      var allNames = (p1Name + ' / ' + p2Name).split(' / ')
        .map(function(n) { return n.trim(); }).filter(Boolean);
      allNames.forEach(function(name) {
        participants.push({ uid: '', displayName: name, photoURL: '', joinedAt: new Date().toISOString() });
      });
    }
    var matchSport = (opts && (opts.sportName || opts.title)) || 'Beach Tennis';
    if (typeof window._openCasualMatch === 'function') {
      // v2.2.15: passa docId/roomCode/createdBy para retornar à sala existente
      // (sem isso, convidados que entraram em partida ativa criariam sala nova)
      window._openCasualMatch({
        sport: matchSport,
        isDoubles: !!isDoubles,
        participants: participants,
        docId: opts && opts.casualDocId,
        roomCode: opts && opts.roomCode,
        createdBy: opts && opts.createdBy
      });
    }
  }

  // Fecha o live-scoring-overlay e reabre o setup overlay reutilizando a
  // mesma sala (via _casualReopenSetup). Chamado por _liveScoreUnpairFromStats
  // e _liveScoreGoToSetup. Fallback pra _goToSetupLocally quando
  // _casualReopenSetup não está disponível (ex: partida aberta do histórico).
  function _closeLiveScoringAndReopenSetup(opts) {
    if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
    try { window.removeEventListener('resize', _onResize); } catch(e) {}
    try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
    try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
    try { _releaseWakeLock(); } catch(e) {}
    var ov = document.getElementById('live-scoring-overlay');
    if (ov) ov.remove();
    if (typeof window._casualReopenSetup === 'function') {
      window._casualReopenSetup(opts);
    } else {
      _goToSetupLocally();
    }
  }

  // v1.3.69-beta: versão SEM confirm dialog para a tela de estatísticas
  // (a partida já foi encerrada e salva — não há nada a confirmar).
  // v1.7.3-beta: escreve setupAt (não mais status:'setup') para preservar
  // status:'finished' no doc — essencial para o histórico de partidas.
  // Multi-device: outros clientes reagem a setupAt mudando (onSnapshot).
  window._liveScoreUnpairFromStats = function() {
    if (state.isFinished && !_resultSaved) {
      try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {}
    }
    // Sinaliza para outros dispositivos via campo setupAt (sem alterar status)
    if (_casualDocId && window.FirestoreDB && window.FirestoreDB.db) {
      try {
        window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId)
          .update({ setupAt: new Date().toISOString() })
          .catch(function(e) { window._warn('[LiveScore] unpair setupAt write failed:', e); });
      } catch(e) {}
    }
    _closeLiveScoringAndReopenSetup({ keepSession: true, isInitiator: true });
  };

  // v1.6.41-beta: "Jogar Novamente" nas stats — propaga sinal para que
  // TODOS os participantes logados voltem ao setup.
  // v1.7.3-beta: usa setupAt em vez de status:'setup' para não destruir
  // o registro histórico (status:'finished' precisa ser preservado para
  // loadRecentCasualMatchesForUser encontrar essa partida).
  // v2.2.26-beta: inicia DE FATO a nova partida (corpo extraído do antigo
  // _liveScoreGoToSetup). Chamado direto no solo, ou pelo cliente "starter"
  // quando o consenso de Jogar é atingido no multiplayer.
  // v2.2.31-beta: helpers do restart in-place (criar próxima partida como novo
  // doc, sem reabrir o lobby).
  function _genRoomCodeLS() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  function _shuffleArrLS(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function _genderByNameLS() {
    var m = {}; var src = (opts && Array.isArray(opts.players)) ? opts.players : [];
    for (var i = 0; i < src.length; i++) { if (src[i] && src[i].name) m[src[i].name] = src[i].gender || ''; }
    return m;
  }
  // Times da próxima partida: embaralha se autoShuffle; respeita duplas mistas.
  function _computeRestartTeams() {
    var t1 = p1Players.slice(), t2 = p2Players.slice();
    if (!isDoubles || !autoShuffle) return { t1: t1, t2: t2 };
    var all = p1Players.concat(p2Players);
    if (all.length < 4) return { t1: t1, t2: t2 };
    var gmap = _genderByNameLS();
    var males = all.filter(function(n) { return gmap[n] === 'masculino'; });
    var females = all.filter(function(n) { return gmap[n] === 'feminino'; });
    if (_mixedDoublesEnabled && males.length === 2 && females.length === 2) {
      _shuffleArrLS(males); _shuffleArrLS(females);
      return { t1: [males[0], females[0]], t2: [males[1], females[1]] };
    }
    var arr = _shuffleArrLS(all.slice());
    return { t1: [arr[0], arr[1]], t2: [arr[2], arr[3]] };
  }
  function _buildRestartPlayers(t1, t2) {
    var gmap = _genderByNameLS();
    var out = [];
    function add(name, team, slot) {
      var mm = _playerMeta[name] || {};
      out.push({ slot: slot, name: name, team: team, uid: mm.uid || null, photoURL: mm.photoURL || null, gender: gmap[name] || null });
    }
    t1.forEach(function(n, i) { add(n, 1, i); });
    t2.forEach(function(n, i) { add(n, 2, t1.length + i); });
    return out;
  }

  function _doRestartNow() {
    if (state.isFinished && !_resultSaved) {
      try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {}
    }
    // v2.2.1-beta: salva no histórico de sessão para ativação retroativa do Rei/Rainha.
    if (isCasual && isDoubles && state.isFinished && state.winner != null) {
      _sessionGameHistory.push({
        p1: p1Players.slice(),
        p2: p2Players.slice(),
        winner: state.winner || 0
      });
    }
    var _cuR = window.AppStore && window.AppStore.currentUser;
    // SOLO (ou sem Firestore) → caminho antigo: reabre setup + autoStart.
    if (!_casualDocId || !window.FirestoreDB || !window.FirestoreDB.db ||
        typeof window.FirestoreDB.saveCasualMatch !== 'function') {
      _closeLiveScoringAndReopenSetup({ keepSession: true, isInitiator: true, autoStart: true, autoShuffle: !!autoShuffle });
      return;
    }
    // v2.2.31-beta: MULTIPLAYER — cria a próxima partida como NOVO doc DIRETO e
    // navega TODOS via #casual/<novaSala> (eu agora; os outros via nextRoomCode).
    // Antes o starter chamava _closeLiveScoringAndReopenSetup → window._casualReopenSetup
    // (closure do lobby) + autoStart; no 3º jogo essa cadeia cross-closure
    // quebrava e deixava o starter com TELA PRETA (erro engolido, sem Sentry).
    // Agora starter e seguidores percorrem o MESMO caminho (_renderCasualJoin),
    // simétrico e sem reabrir o lobby. Histórico preservado (doc antigo fica
    // finished). _restartInitiated já está true (não refaz).
    var teams = _computeRestartTeams();
    var newPlayers = _buildRestartPlayers(teams.t1, teams.t2);
    var cfg = (opts && opts.scoring) ? opts.scoring : {};
    var newRoom = _genRoomCodeLS();
    var oldDocId = _casualDocId;
    window.FirestoreDB.saveCasualMatch({
      createdBy: _casualCreatedBy || (_cuR && _cuR.uid) || null,
      createdByName: (_cuR && _cuR.displayName) || '',
      createdAt: new Date().toISOString(),
      sport: (opts && opts.sportName) || '',
      scoring: cfg,
      isDoubles: isDoubles,
      teamsFormed: true,
      players: newPlayers,
      playerUids: newPlayers.filter(function(p) { return !!p.uid; }).map(function(p) { return p.uid; }),
      roomCode: newRoom,
      status: 'active',
      result: null,
      // v2.2.32-beta: carrega a configuração dos toggles pra próxima partida —
      // sem isto, autoShuffle/Mistas/Rei-Rainha voltavam ao default (ligado) a
      // cada jogo (bug: "sempre sorteava dupla mista mesmo desligando").
      statsConfig: {
        autoShuffle: !!autoShuffle,
        mixedDoubles: !!_mixedDoublesEnabled,
        reiRainha: !!_reiRainhaMode,
        _ts: Date.now()
      },
      // v2.2.33-beta: carrega o histórico de jogos da sessão (já inclui o jogo
      // que acabou) pro Rei/Rainha retroativo reconhecer todas as partidas.
      sessionHistory: _sessionGameHistory.slice(0, 8)
    }).then(function(newDocId) {
      if (!newDocId) throw new Error('saveCasualMatch returned null');
      // Aponta o doc ANTIGO pra nova sala — seguidores migram via o handler de
      // nextRoomCode no listener do placar (v2.2.30).
      try {
        window.FirestoreDB.db.collection('casualMatches').doc(oldDocId)
          .update({ nextRoomCode: newRoom }).catch(function() {});
      } catch (e) {}
      // Navega EU pra nova sala (mesmo caminho do seguidor).
      _casualCancelled = true;
      if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
      try { window.removeEventListener('resize', _onResize); } catch(e) {}
      try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
      try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
      try { _releaseWakeLock(); } catch(e) {}
      var ovR = document.getElementById('live-scoring-overlay'); if (ovR) ovR.remove();
      try { sessionStorage.setItem('_activeCasualRoom', newRoom); } catch(e) {}
      if (_cuR && _cuR.uid && window.FirestoreDB.saveUserProfile) {
        window.FirestoreDB.saveUserProfile(_cuR.uid, { activeCasualRoom: newRoom }).catch(function() {});
      }
      if (typeof window._navigateToScannedRoute === 'function') {
        window._navigateToScannedRoute('#casual/' + newRoom);
      } else { try { window.location.hash = '#casual/' + newRoom; } catch(e) {} }
    }).catch(function(e) {
      window._warn && window._warn('[restart] new doc failed — fallback reopen', e);
      _restartInitiated = false;
      try {
        _closeLiveScoringAndReopenSetup({ keepSession: true, isInitiator: true, autoStart: true, autoShuffle: !!autoShuffle });
      } catch(e2) {}
    });
  }

  window._liveScoreGoToSetup = function() {
    var cu = window.AppStore && window.AppStore.currentUser;
    var myUid = cu && cu.uid;
    // Conta UIDs reais na partida pra decidir solo vs multiplayer.
    var _uidSet = {};
    try {
      var _allNm = (p1Players || []).concat(p2Players || []);
      for (var _ui = 0; _ui < _allNm.length; _ui++) {
        var _mt = _playerMeta[_allNm[_ui]];
        if (_mt && _mt.uid) _uidSet[_mt.uid] = 1;
      }
      if (Array.isArray(_knownPlayerUids)) {
        for (var _ki = 0; _ki < _knownPlayerUids.length; _ki++) _uidSet[_knownPlayerUids[_ki]] = 1;
      }
    } catch(e) {}
    var _isSolo = Object.keys(_uidSet).length <= 1;
    // Solo (ou sem Firestore) → inicia imediatamente, sem consenso.
    if (_isSolo || !myUid || !_casualDocId || !window.FirestoreDB || !window.FirestoreDB.db) {
      _doRestartNow();
      return;
    }
    // v2.2.26-beta: MULTIPLAYER — consenso de Jogar (espelha o lobby). Quem
    // clica fica "⏳ Aguardando os outros"; os demais precisam clicar também
    // (pelo menos 1 de cada time). Quando atingido, o cliente de menor uid
    // dispara a nova partida; os outros seguem pelo nextRoomCode/setupAt.
    // v1.1.4: 2º toque enquanto aguarda = INICIAR MESMO ASSIM. Sem isto o
    // usuário ficava PRESO em "Aguardando o outro time" quando o outro lado é
    // fantasma (1 device com contas de amigos, ou uid stale) e nunca respondia.
    // O 1º toque continua sendo só "pronto/aguardar" (não reintroduz a revanche
    // de um clique só); é preciso um 2º toque deliberado pra forçar. Os demais
    // ainda conectados migram pela nextRoomCode.
    if (_myRestartClicked) {
      if (!_restartInitiated) { _restartInitiated = true; _doRestartNow(); }
      return;
    }
    _myRestartClicked = true;
    if (state.isFinished && !_resultSaved) { try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {} }
    if (isCasual && isDoubles && state.isFinished && state.winner != null) {
      _sessionGameHistory.push({ p1: p1Players.slice(), p2: p2Players.slice(), winner: state.winner || 0 });
    }
    _updateRestartButtonUI([myUid]);
    window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId).update({
      restartReady: firebase.firestore.FieldValue.arrayUnion(myUid)
    }).then(function() {
      return window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId).get();
    }).then(function(snap) {
      var fresh = snap && snap.exists ? snap.data() : null;
      var ready = (fresh && Array.isArray(fresh.restartReady)) ? fresh.restartReady : [myUid];
      _updateRestartButtonUI(ready);
      if (!_restartInitiated && _restartConditionMet(ready, fresh) && _amRestartStarter(ready)) {
        _restartInitiated = true;
        _doRestartNow();
      }
    }).catch(function() {
      _myRestartClicked = false;
      _updateRestartButtonUI([]);
    });
  };

  // Compartilhar resultado da partida casual — tournament match já tem o
  // próprio _shareMatchResult (bracket). Aqui montamos um payload específico
  // pra casual (sem tournamentId) usando o estado corrente do overlay.
  // Mobile: navigator.share dispara dialog nativo (WhatsApp, Instagram DM,
  // etc). Desktop ou browsers sem Web Share: clipboard com toast.
  window._liveScoreShareCasual = function() {
    if (!isCasual || !state.isFinished) return;
    var emoji = { 1: '🏆', 2: '🏆' };
    var winnerLabel = state.winner === 1 ? p1Name : (state.winner === 2 ? p2Name : 'Empate');
    var scoreLine = '';
    if (useSets && Array.isArray(state.sets) && state.sets.length > 0) {
      scoreLine = state.sets.map(function(s) {
        var line = (s.gamesP1 != null ? s.gamesP1 : 0) + '-' + (s.gamesP2 != null ? s.gamesP2 : 0);
        if (s.tiebreak && (s.tiebreak.pointsP1 != null || s.tiebreak.p1 != null)) {
          var tbp = (s.tiebreak.pointsP1 != null ? s.tiebreak.pointsP1 : s.tiebreak.p1);
          line += '(' + tbp + ')';
        }
        return line;
      }).join(' · ');
    } else {
      // Simple scoring: atuais points are in currentGameP1/P2, but melhor usar
      // setsWon ou setsLost como placar final. Pra simple use current points.
      scoreLine = state.currentGameP1 + ' x ' + state.currentGameP2;
    }
    var title = '⚡ ' + (casualTitle || 'Partida Casual');
    var text = title + '\n' +
               '🎾 ' + p1Name + ' vs ' + p2Name + '\n' +
               '📊 ' + scoreLine + '\n' +
               (state.winner === 0 || state.winner == null ? '🤝 Empate' : '🏆 Vitória: ' + winnerLabel) + '\n\n' +
               '🔗 scoreplace.app';
    var url = window.SCOREPLACE_URL || 'https://scoreplace.app';
    if (navigator.share) {
      try {
        navigator.share({ title: title, text: text, url: url }).catch(function(e) {
          if (e && e.name === 'AbortError') return;
          // Fallback pro clipboard se share falha por outra razão
          if (navigator.clipboard) navigator.clipboard.writeText(text);
        });
      } catch (e) {
        if (navigator.clipboard) navigator.clipboard.writeText(text);
      }
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        if (typeof showNotification === 'function') showNotification('Resultado copiado!', 'Cole no WhatsApp ou em qualquer rede.', 'success');
      }).catch(function() {});
    }
  };

  // Tournament confirm: persist the finished result, advance the winner in the
  // bracket, close the overlay, and clean up listeners. The user lands on the
  // bracket view already anchored to the match card (see _rerenderBracket).
  window._liveScoreConfirmTournament = function() {
    if (isCasual) return;
    if (!state.isFinished) return;
    try { _saveResult({ keepOpen: true, silent: false }); } catch(e) {}
    if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
    try { window.removeEventListener('resize', _onResize); } catch(e) {}
    try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
      try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
    try { _releaseWakeLock(); } catch(e) {}
    var ov = document.getElementById('live-scoring-overlay');
    if (ov) ov.remove();
  };

  // v2.1.39: "Voltar" do placar de torneio — o resultado JÁ foi gravado no último
  // ponto; aqui só garante (idempotente), limpa e leva direto ao jogo na chave.
  // Sem diálogo de confirmação (diferente do "Fechar").
  window._liveScoreBackToBracket = function() {
    if (isCasual) return;
    try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {}
    if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
    try { window.removeEventListener('resize', _onResize); } catch(e) {}
    try { document.removeEventListener('visibilitychange', _onVisibility); } catch(e) {}
    try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
    try { _releaseWakeLock(); } catch(e) {}
    var ov = document.getElementById('live-scoring-overlay');
    if (ov) ov.remove();
    var _bHash = '#bracket/' + tId;
    if ((window.location.hash || '') === _bHash) {
      var _vc = document.getElementById('view-container');
      if (_vc && typeof window.renderBracket === 'function') { try { window.renderBracket(_vc); } catch(e) {} }
    } else {
      window.location.hash = _bHash;
    }
  };

  // ── Build overlay ──
  // Use dynamic viewport (100dvh) so mobile browsers' shrinking/expanding URL
  // bar never crops the pinned bottom action buttons.
  var overlay = document.createElement('div');
  overlay.id = 'live-scoring-overlay';
  // v0.17.52: bg respeita tema (var(--bg-darker)) em vez de hardcoded.
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;height:100%;background:var(--bg-darker);z-index:100002;display:flex;flex-direction:column;overflow:hidden;touch-action:manipulation;';

  // Header — 3-column: [AO VIVO + info] [Sets display center] [Reset + Close]
  var headerBg = 'linear-gradient(135deg,#1e293b 0%,#0f172a 100%)';
  var matchLabel = isCasual ? (opts.sportName || 'Partida Casual') : (m.roundIndex !== undefined ? 'Rodada ' + (m.roundIndex + 1) : (m.round || ''));
  // v4.3.23: padding-top com env(safe-area-inset-top) — no app nativo/PWA o overlay
  // é position:fixed;top:0 full-bleed sob a status bar/ilha; sem o inset o "AO VIVO"
  // e os botões Ajustar/Resetar/Fechar encavalavam no relógio/bateria do sistema.
  // Inerte na web (insets=0). Depende de viewport-fit=cover estar ativo (preservado).
  // O padding-top segue a MESMA fórmula da .topbar (layout.css), que foi calibrada
  // no aparelho: o inset reserva ~59px mas a status bar/ilha ocupam menos, então
  // puxa 12px pra cima — o máximo antes de encavalar no relógio. Antes aqui era
  // `10px + inset` (22px a MAIS que a topbar), desperdiçando faixa no cabeçalho.
  // max() protege quem não tem notch (inset=0).
  var headerPadTop = 'max(8px, calc(env(safe-area-inset-top, 0px) - 12px))';
  var headerHtml = '<div style="background:' + headerBg + ';padding:' + headerPadTop + ' 12px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;gap:4px;">' +
    // Left: AO VIVO + match info
    '<div style="display:flex;align-items:center;gap:6px;flex:0 0 auto;min-width:0;">' +
      '<span style="font-size:1rem;">📡</span>' +
      '<div style="min-width:0;">' +
        '<div style="font-size:0.78rem;font-weight:800;color:#f87171;">AO VIVO</div>' +
        '<div style="font-size:0.6rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(isCasual ? casualTitle : (t && t.name || matchLabel)) + '</div>' +
      '</div>' +
    '</div>' +
    // Spacer
    '<div style="flex:1;"></div>' +
    // Right: Undo + Reset + Close (Reset hidden on finish screen in
    // tournament mode; Undo permanece visível em todos os contextos)
    '<div id="live-score-header-actions" style="display:flex;gap:6px;align-items:center;flex:0 0 auto;">' +
      // v1.9.69: botão "⚙️ Configurar" no header, no lugar do antigo "Desfazer"
      // (que era redundante — o undo real é a setinha ↺ ao lado do placar de
      // games, que desfaz ponto a ponto). Engrenagem + texto = visível em quadra.
      '<button class="live-vol-sm" onclick="window._liveScoreOpenSizeSettings&&window._liveScoreOpenSizeSettings()" title="Ajustar tamanhos" aria-label="Ajustar tamanhos" style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--text-bright);border-radius:8px;padding:6px 10px;font-size:0.7rem;font-weight:600;cursor:pointer;"><span style="font-size:0.88rem;line-height:1;">⚙️</span>Ajustar</button>' +
      '<button class="live-vol-sm" onclick="window._liveScoreReset()" style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;border-radius:8px;padding:6px 10px;font-size:0.7rem;font-weight:600;cursor:pointer;">↺ Resetar</button>' +
      '<button class="live-vol-sm" onclick="window._closeLiveScoring()" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:var(--text-bright);border-radius:8px;padding:6px 10px;font-size:0.7rem;font-weight:600;cursor:pointer;">✕ Fechar</button>' +
    '</div>' +
  '</div>';

  // Content area (no info bar — sets are in header now)
  overlay.innerHTML = headerHtml +
    // v2.1.85: scroll-safe — antes era overflow:hidden + justify-content:center,
    // que CORTAVA o topo e a base quando o conteúdo não cabia (Android). Agora
    // `safe center` centraliza quando cabe e alinha ao topo (rolável) quando não
    // cabe — nada é cortado e os botões/placar sempre ficam alcançáveis.
    '<div id="live-score-content" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:0.5rem 0.5rem;display:flex;flex-direction:column;justify-content:safe center;"></div>';

  // ── Tamanhos do placar (v1.9.63) ──────────────────────────────────────────
  // Escalas RELATIVAS (0.5–1.5 = 50%–150%) aplicadas via CSS vars sobre os
  // clamp() responsivos: tamanho final = clamp(device) × percentual → sempre
  // proporcional ao dispositivo (retrato/paisagem/tablet), nunca absoluto.
  // Fonte de verdade: users/{uid}.liveScorePrefs; cache instantâneo: localStorage.
  function _clampLiveScale(v, d) {
    v = parseFloat(v);
    if (isNaN(v)) return d;
    return Math.max(0.1, Math.min(4, v)); // 10%–400%
  }
  function _loadLiveScorePrefs() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem('scoreplace_livescore_prefs') || '{}') || {}; } catch(e) {}
    var _cu = window.AppStore && window.AppStore.currentUser;
    if (_cu && _cu.liveScorePrefs && typeof _cu.liveScorePrefs === 'object') {
      p = Object.assign({}, p, _cu.liveScorePrefs); // perfil vence o cache
    }
    return {
      nameScale: _clampLiveScale(p.nameScale, 1),
      photoScale: _clampLiveScale(p.photoScale, 1),
      scoreScale: _clampLiveScale(p.scoreScale, 1),
      plateScale: _clampLiveScale(p.plateScale, 1),
      btnScale: _clampLiveScale(p.btnScale, 1),
      // v1.9.64: "fixar lados". false (padrão) = sacador sempre à esquerda,
      // inverte a cada novo sacador. true = lados fixos (troca só manual).
      fixSides: !!p.fixSides
    };
  }
  function _applyLiveScorePrefs(prefs) {
    // v1.9.65: usa a variável `overlay` do closure (não getElementById) —
    // _applyLiveScorePrefs roda na abertura ANTES do overlay entrar no DOM,
    // então getElementById retornava null e as vars NUNCA eram aplicadas (os
    // tamanhos voltavam ao padrão na partida seguinte mesmo com a pref salva).
    var ov = overlay || document.getElementById('live-scoring-overlay');
    if (!ov) return;
    ov.style.setProperty('--live-name-scale', prefs.nameScale);
    ov.style.setProperty('--live-photo-scale', prefs.photoScale);
    ov.style.setProperty('--live-score-scale', prefs.scoreScale);
    ov.style.setProperty('--live-plate-scale', prefs.plateScale);
    ov.style.setProperty('--live-btn-scale', prefs.btnScale);
  }
  function _saveLiveScorePrefs(prefs) {
    try { localStorage.setItem('scoreplace_livescore_prefs', JSON.stringify(prefs)); } catch(e) {}
    var _cu = window.AppStore && window.AppStore.currentUser;
    if (_cu) _cu.liveScorePrefs = prefs;
    if (_cu && _cu.uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
      try { window.FirestoreDB.saveUserProfile(_cu.uid, { liveScorePrefs: prefs }).catch(function(){}); } catch(e) {}
    }
  }
  var _liveScorePrefs = _loadLiveScorePrefs();
  _applyLiveScorePrefs(_liveScorePrefs);
  // Style único: escala a foto/ícone do jogador (width/height/font reflowam,
  // sem transform — não vaza pra metade do outro time).
  if (!document.getElementById('live-photo-scale-style')) {
    var _ps = document.createElement('style');
    _ps.id = 'live-photo-scale-style';
    _ps.textContent = '#live-scoring-overlay .live-av-wrap{display:inline-flex;flex-shrink:0;}'
      + '#live-scoring-overlay .live-av-wrap > *{width:calc(30px*var(--live-photo-scale,1))!important;height:calc(30px*var(--live-photo-scale,1))!important;font-size:calc(13px*var(--live-photo-scale,1))!important;}';
    document.head.appendChild(_ps);
  }

  // Painel de sliders (toggle). Sliders 10%–400%, oninput aplica ao vivo via
  // CSS var (sem re-render), onchange persiste (localStorage + perfil).
  // Painel transparente (backdrop-filter) para ver o placar ao vivo enquanto ajusta.
  window._liveScoreOpenSizeSettings = function() {
    var ex = document.getElementById('live-size-settings');
    if (ex) { ex.remove(); return; }
    function row(key, label, cssVar) {
      var pct = Math.round((_liveScorePrefs[key] || 1) * 100);
      return '<div style="margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.82rem;color:rgba(255,255,255,0.9);font-weight:600;margin-bottom:5px;"><span>' + label + '</span><span id="lss-val-' + key + '" style="color:#fbbf24;font-weight:800;">' + pct + '%</span></div>' +
        '<input type="range" min="10" max="400" step="5" value="' + pct + '" data-lss-key="' + key + '" data-lss-var="' + cssVar + '" style="width:100%;accent-color:#fbbf24;height:26px;" />' +
      '</div>';
    }
    var panel = document.createElement('div');
    panel.id = 'live-size-settings';
    // Outer: quase-transparente e pointer-events:none → toques fora fecham pelo botão
    // ou caem no placar (para ver mudanças em tempo real)
    panel.style.cssText = 'position:fixed;inset:0;z-index:100012;background:transparent;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;';
    panel.innerHTML = '<div style="pointer-events:all;background:rgba(10,14,26,0.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.18);border-radius:18px 18px 0 0;padding:16px 18px calc(22px + env(safe-area-inset-bottom));width:100%;max-width:480px;box-shadow:0 -8px 32px rgba(0,0,0,0.6);max-height:calc(100% - 10px);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div style="font-size:1.1rem;font-weight:800;color:#fff;">Ajustar</div>' +
        /* x-canon-exempt: fechar modal/overlay — não é cancelar/remover; pendente decisão do dono */ '<button onclick="document.getElementById(\'live-size-settings\').remove()" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.75);font-size:1rem;cursor:pointer;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>' +
      '</div>' +
      row('scoreScale', 'Games', '--live-score-scale') +
      row('nameScale', 'Nomes', '--live-name-scale') +
      row('photoScale', 'Foto / ícone', '--live-photo-scale') +
      row('plateScale', 'Placar', '--live-plate-scale') +
      row('btnScale', 'Botões', '--live-btn-scale') +
      // Toggle Fixar lados
      '<div style="margin:6px 0 12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
          '<div style="font-size:0.82rem;color:rgba(255,255,255,0.9);font-weight:600;">Fixar lados</div>' +
          '<label class="toggle-switch" style="flex-shrink:0;"><input type="checkbox" id="lss-fixsides-input"' + (_liveScorePrefs.fixSides ? ' checked' : '') + ' onchange="window._liveScoreToggleFixSides()"><span class="toggle-slider"></span></label>' +
        '</div>' +
        '<div style="font-size:0.66rem;color:rgba(255,255,255,0.45);line-height:1.35;margin-top:5px;">Desativado: o sacador fica sempre à esquerda. Ativado: lados fixos.</div>' +
      '</div>' +
      '<button onclick="window._liveScoreResetSizes()" style="width:100%;margin-top:2px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.55);border-radius:10px;padding:10px;font-size:0.8rem;font-weight:600;cursor:pointer;">Restaurar (100%)</button>' +
    '</div>';
    document.body.appendChild(panel);
    panel.querySelectorAll('input[type=range]').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var key = inp.getAttribute('data-lss-key');
        var cssVar = inp.getAttribute('data-lss-var');
        var scale = parseInt(inp.value, 10) / 100;
        _liveScorePrefs[key] = scale;
        var ov = document.getElementById('live-scoring-overlay');
        if (ov) ov.style.setProperty(cssVar, scale);
        var lbl = document.getElementById('lss-val-' + key);
        if (lbl) lbl.textContent = inp.value + '%';
        // v2.2.16-beta: re-fit after scale change (layout shifts with CSS var)
        requestAnimationFrame(function() { if (window._fitLivePlateText) window._fitLivePlateText(); });
      });
      inp.addEventListener('change', function() { _saveLiveScorePrefs(_liveScorePrefs); });
    });
  };
  window._liveScoreToggleFixSides = function() {
    // v4.0.5: toggle canônico (.toggle-switch) — o <input> já alternou
    // nativamente; usa o estado dele como verdade (o CSS cuida do visual).
    var inp = document.getElementById('lss-fixsides-input');
    _liveScorePrefs.fixSides = inp ? !!inp.checked : !_liveScorePrefs.fixSides;
    _saveLiveScorePrefs(_liveScorePrefs);
    // Re-renderiza o placar com a nova regra de lados
    try { _render(); } catch(e) {}
  };
  window._liveScoreResetSizes = function() {
    // Reseta só os tamanhos — preserva a preferência fixSides.
    _liveScorePrefs = { nameScale: 1, photoScale: 1, scoreScale: 1, plateScale: 1, btnScale: 1, fixSides: !!_liveScorePrefs.fixSides };
    _applyLiveScorePrefs(_liveScorePrefs);
    _saveLiveScorePrefs(_liveScorePrefs);
    var ex = document.getElementById('live-size-settings');
    if (ex) ex.remove();
    window._liveScoreOpenSizeSettings();
  };

  document.body.appendChild(overlay);

  // v2.1.85: trava a altura do overlay no viewport VISÍVEL real. Android Chrome/
  // WebView sem suporte a 100dvh cai pra 100vh, que é MAIOR que a tela visível
  // (barra de URL/sistema) → sobra espaço no topo e o placar/botões estouram
  // embaixo. visualViewport.height (fallback innerHeight) é a altura visível em
  // TODOS os browsers; o px explícito vence o 100dvh do cssText. Re-ajusta em
  // resize/rotação. iOS já estava ok — isto não o atrapalha (mesmo valor que dvh).
  var _fitLiveOverlay = function() {
    var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
    if (h > 0) overlay.style.height = Math.round(h) + 'px';
  };
  _fitLiveOverlay();
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', _fitLiveOverlay);
  }
  window.addEventListener('resize', _fitLiveOverlay);
  window.addEventListener('orientationchange', _fitLiveOverlay);
  overlay._fitLiveOverlay = _fitLiveOverlay; // pra remover no _closeLiveScoring

  // ── Screen Wake Lock ──
  // Keep screen on while live scoring is open so the device doesn't sleep
  // mid-match. v1.3.29-beta: agora com fallback NoSleep-style pra iOS
  // Safari (que tem suporte parcial e flaky ao Wake Lock API). Bug
  // reportado: "iPhone do meu adversário ficava bloqueando a tela
  // durante o placar ao vivo".
  //
  // Estratégia em 3 camadas:
  //   1. Wake Lock API nativa (Chrome/Edge/Safari ≥16.4) — preferida.
  //   2. NoSleep fallback: <video> muted+looping em loop. iOS WebKit
  //      considera vídeo ativo como "tela em uso" e não auto-bloqueia.
  //      Funciona até em iOS antigo. Custo: ~50KB de RAM, batt drain
  //      desprezível pra um vídeo de 1 frame.
  //   3. Re-request no visibilitychange (browsers liberam wake lock
  //      quando aba fica hidden — re-pegamos ao voltar).
  var _wakeLock = null;
  var _noSleepVideo = null;
  var _wakeHeartbeat = null;
  var _ensureNoSleepVideo = function() {
    if (_noSleepVideo) return _noSleepVideo;
    try {
      var v = document.createElement('video');
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.muted = true;
      v.loop = true;
      v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0;z-index:-1;';
      // Tiny 1-frame MP4 base64 — Apple silicon-compatible. Source:
      // NoSleep.js minimal blob (apache 2.0). Loops forever, ~1KB.
      v.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAACyttZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0MiByMjM4OSA5NTZjOGQ4IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTYgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTUgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAwZYiEAD//8m+P5OXfBeLGOfKE3xkODvFZuBflHv/+VwJIta6cbpIo4ABLoKBaYTkTAAAC7m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAPoAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAIVdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAPoAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAACAAAAAgAAAAAAAJG1kaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAQAAAAEAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAcBtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAGAc3RibAAAALhzdHNkAAAAAAAAAAEAAACoYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAACAAIASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAANmF2Y0MBZAAK/+EAGWdkAAqs2V/JfzgIAAADAAgAAAMA8DxgxlgBAAZo6+PLIsAAAAAcdXVpZGtoQPJfJE/Fr0RNo3+tDSEAAAAAAAAACGZpZWwBAAAAE2NvbHJuY2x4AAEAAQABAAAAABBwYXNwAAAAAQAAAAEAAAAYc3R0cwAAAAAAAAABAAAAAQAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAALSAAAAAQAAABRzdGNvAAAAAAAAAAEAAAAsAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY1Ni40MC4xMDE=';
      document.body.appendChild(v);
      _noSleepVideo = v;
      // Tentar tocar — pode falhar sem user gesture; aceita falha.
      var p = v.play();
      if (p && typeof p.catch === 'function') p.catch(function() {});
      return v;
    } catch (e) { return null; }
  };
  var _stopNoSleepVideo = function() {
    if (_noSleepVideo) {
      try { _noSleepVideo.pause(); } catch (e) {}
      if (_noSleepVideo.parentNode) _noSleepVideo.parentNode.removeChild(_noSleepVideo);
      _noSleepVideo = null;
    }
  };
  var _requestWakeLock = function() {
    // Camada 1: Wake Lock API nativa (Chrome Android, iOS Safari 16.4+).
    try {
      if ('wakeLock' in navigator && !_wakeLock) {
        navigator.wakeLock.request('screen').then(function(lock) {
          _wakeLock = lock;
          lock.addEventListener('release', function() { _wakeLock = null; });
        }).catch(function() {});
      }
    } catch(e) {}
    // Camada 2: vídeo NoSleep SEMPRE em paralelo (v1.9.53). No iPhone a Wake
    // Lock API é inconsistente — versão-dependente e libera quando a tela
    // escurece, sem disparar visibilitychange — então a tela apagava no meio
    // do placar ao vivo (bug reportado no iPhone da amiga). Prioridade do
    // usuário: "aberto o placar ao vivo não trava a tela, pra marcação de
    // pontos por terceiros". O vídeo muted 1px em loop mantém o WebKit
    // considerando a tela em uso. Roda junto com a Wake Lock API — qualquer
    // uma das duas mantém a tela acesa. Trade-off aceito: durante o placar
    // ao vivo a tela não bloqueia sozinha (é o comportamento desejado aqui).
    _ensureNoSleepVideo();
    if (_noSleepVideo && _noSleepVideo.paused) {
      var p = _noSleepVideo.play();
      if (p && typeof p.catch === 'function') p.catch(function() {});
    }
    // Camada 3: heartbeat (v1.9.54) — a cada 12s garante que a tela continua
    // acesa. No Android, battery-saver/data-saver podem liberar a Wake Lock ou
    // pausar o vídeo sem disparar visibilitychange; no iOS o vídeo às vezes
    // pausa sozinho. O heartbeat re-toca o vídeo se pausado e re-adquire a
    // Wake Lock se foi solta — enquanto o overlay de placar ao vivo existir.
    if (!_wakeHeartbeat) {
      _wakeHeartbeat = setInterval(function() {
        if (!document.getElementById('live-scoring-overlay')) {
          clearInterval(_wakeHeartbeat); _wakeHeartbeat = null; return;
        }
        if (document.visibilityState !== 'visible') return;
        if (_noSleepVideo && _noSleepVideo.paused) {
          var pp = _noSleepVideo.play();
          if (pp && typeof pp.catch === 'function') pp.catch(function() {});
        }
        if (!_wakeLock && 'wakeLock' in navigator) {
          try {
            navigator.wakeLock.request('screen').then(function(lock) {
              _wakeLock = lock;
              lock.addEventListener('release', function() { _wakeLock = null; });
            }).catch(function() {});
          } catch(e) {}
        }
      }, 12000);
    }
  };
  var _releaseWakeLock = function() {
    try {
      if (_wakeLock) { _wakeLock.release().catch(function(){}); _wakeLock = null; }
    } catch(e) { _wakeLock = null; }
    if (_wakeHeartbeat) { try { clearInterval(_wakeHeartbeat); } catch(e) {} _wakeHeartbeat = null; }
    _stopNoSleepVideo();
  };
  // Re-acquire on visibility change (browsers auto-release when tab hidden)
  // v1.6.11-beta: também faz autosave de SEGURANÇA em modo casual — se a aba
  // ficar oculta (lock screen, troca de app, fechar PWA) e o jogo já terminou,
  // garante que o status:'finished' chega no Firestore mesmo que o usuário
  // nunca clique Fechar/Recomeçar. Idempotente via _resultSaved.
  var _onVisibility = function() {
    if (document.visibilityState === 'visible' && document.getElementById('live-scoring-overlay')) {
      _requestWakeLock();
    }
    if (document.visibilityState === 'hidden' && isCasual && state.isFinished && !_resultSaved) {
      try { _saveResult({ keepOpen: true, silent: true }); } catch (_e) {}
    }
  };
  document.addEventListener('visibilitychange', _onVisibility);
  // pagehide: último gatilho disparado quando aba é descarregada (PWA fechado,
  // navegação pra fora). Mesmo guard, defesa-em-profundidade contra perda de save.
  var _onPagehide = function() {
    if (isCasual && state.isFinished && !_resultSaved) {
      try { _saveResult({ keepOpen: true, silent: true }); } catch (_e) {}
    }
  };
  window.addEventListener('pagehide', _onPagehide);
  _requestWakeLock();

  // v2.2.18-beta: encerra as stats sem dialog — chamado pelo botão "✕ Encerrar"
  // no painel de estatísticas (substitui o ✕ Fechar do header). Para o host de
  // partida casual finalizada: grava hostClosed:true (evacua guests). Para
  // qualquer usuário: fecha o overlay local sem pedir confirmação.
  // v1.1.4: "✕ Encerrar" da tela de stats — SEM consenso. A partida JÁ terminou
  // (esta tela só existe com isFinished=true) e o resultado já foi salvo, então
  // sair é uma ação PESSOAL: nunca pode depender da confirmação de outro jogador.
  // Antes (v2.2.26) o consenso multiplayer gravava closePending e mostrava
  // "Aguardando confirmação" travando a tela quando o outro lado era um fantasma
  // (partida de 1 device com contas de amigos inscritas, ou uid stale em
  // playerUids) — a partida ficava "presa" e nunca encerrava. Agora fecha direto:
  // _liveScoreCloseStats já trata os dois casos (host → grava hostClosed:true e
  // evacua os demais; guest → apenas sai da própria vaga e limpa o ponteiro).
  window._liveStatsClose = function() {
    window._liveScoreCloseStats();
  };

  window._liveScoreCloseStats = function() {
    if (!_resultSaved) {
      try { _saveResult({ keepOpen: true, silent: true }); } catch(_e) {}
    }
    var _cuCS = window.AppStore && window.AppStore.currentUser;
    var _isHostCS = _cuCS && _cuCS.uid && _casualCreatedBy && _cuCS.uid === _casualCreatedBy;
    // Host de partida finalizada: sinaliza hostClosed para evacuar guests
    if (isCasual && _isHostCS && _casualDocId && state.isFinished && window.FirestoreDB && window.FirestoreDB.db) {
      try {
        window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId)
          .update({ hostClosed: true }).catch(function() {});
      } catch(_e2) {}
    }
    // v2.2.20-beta ROOT FIX (Request 3): limpa o ponteiro activeCasualRoom do
    // perfil + sessionStorage. SEM isto, quem fecha via ✕ "Encerrar" (este
    // caminho no-dialog, incluindo o auto-close v2.2.19) NUNCA limpava o
    // ponteiro — então toda vez que reabria o app o startRealtimeListener
    // lia o activeCasualRoom ainda setado e jogava o usuário de volta na
    // sala morta (populada com nomes digitados + UIDs stale). O _closeLiveScoring
    // (caminho com confirm dialog) já fazia isto; aqui faltava. Sufoca o resume
    // por 6s pra um snapshot stale não puxar de volta logo após o clear.
    if (isCasual) {
      try {
        if (_cuCS && _cuCS.uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
          window._suppressCasualResumeUntil = Date.now() + 6000;
          window.FirestoreDB.saveUserProfile(_cuCS.uid, { activeCasualRoom: null }).catch(function(){});
        }
        if (_cuCS) _cuCS.activeCasualRoom = null;
      } catch(_eACR) {}
      try { sessionStorage.removeItem('_activeCasualRoom'); } catch(_eSS) {}
    }
    // Cleanup e fecha overlay
    if (_unsubFirestore) { try { _unsubFirestore(); } catch(_e3) {} _unsubFirestore = null; }
    try { window.removeEventListener('resize', _onResize); } catch(_e4) {}
    try { document.removeEventListener('visibilitychange', _onVisibility); } catch(_e5) {}
    try { window.removeEventListener('pagehide', _onPagehide); } catch(_e6) {}
    try {
      window.removeEventListener('resize', _fitLiveOverlay);
      window.removeEventListener('orientationchange', _fitLiveOverlay);
      if (window.visualViewport && window.visualViewport.removeEventListener) {
        window.visualViewport.removeEventListener('resize', _fitLiveOverlay);
      }
    } catch(_e7) {}
    _releaseWakeLock();
    var _ovCS = document.getElementById('live-scoring-overlay');
    if (_ovCS) _ovCS.remove();
    // Faltava aqui: sem o teardown o relógio ficava preso na tela de vitória.
    _watchTeardown();
  };

  // Close handler — always confirms before leaving
  window._closeLiveScoring = function() {
    // v2.2.12-beta: consenso de encerramento para casual multiplayer.
    // Em vez do confirm dialog, escreve closePending no Firestore e mostra
    // o banner de "Aguardando confirmação" para o iniciador. Os outros jogadores
    // veem o banner via onSnapshot e podem Confirmar ou Recusar.
    var _cuCL = window.AppStore && window.AppStore.currentUser;
    var _myUidCL = _cuCL && _cuCL.uid;
    if (isCasual && _casualDocId && _myUidCL && _knownPlayerUids.length > 1 && !_myCloseClicked) {
      _myCloseClicked = true;
      var _dbCL = window.FirestoreDB && window.FirestoreDB.db;
      if (_dbCL) {
        _dbCL.collection('casualMatches').doc(_casualDocId).update({
          closePending: {
            by: _myUidCL,
            byName: (_cuCL.displayName || _cuCL.email || 'Alguém'),
            at: Date.now(),
            confirmedBy: []
          }
        }).catch(function(e) {
          _myCloseClicked = false;
          window._warn('[closeConsensus] update failed', e);
          showNotification('Erro', 'Não foi possível solicitar encerramento. Tente novamente.', 'error');
        });
      }
      _showClosePendingBanner(true, '');
      return;
    }
    var _cleanup = function() {
      if (_unsubFirestore) { try { _unsubFirestore(); } catch(e) {} _unsubFirestore = null; }
      window.removeEventListener('resize', _onResize);
      document.removeEventListener('visibilitychange', _onVisibility);
      try { window.removeEventListener('pagehide', _onPagehide); } catch(e) {}
      // v2.1.85: remove os listeners do fit de viewport (Android)
      try {
        window.removeEventListener('resize', _fitLiveOverlay);
        window.removeEventListener('orientationchange', _fitLiveOverlay);
        if (window.visualViewport && window.visualViewport.removeEventListener) window.visualViewport.removeEventListener('resize', _fitLiveOverlay);
      } catch(e) {}
      _releaseWakeLock();
      var ov = document.getElementById('live-scoring-overlay');
      if (ov) ov.remove();
      // Ponte do relógio: o placar fechou → desfaz a fiação (pra o próximo hello
      // do relógio responder "inativo") e empurra um estado inativo agora, senão
      // o relógio fica com o placar anterior "congelado". No-op na web (inerte).
      _watchTeardown();
    };
    var cu = window.AppStore && window.AppStore.currentUser;
    var isOrganizer = isCasual && cu && cu.uid && _casualCreatedBy && cu.uid === _casualCreatedBy;
    var _title, _msg;
    var _matchFinished = state.isFinished && !_resultSaved;
    if (isCasual && isOrganizer) {
      _title = 'Encerrar partida casual?';
      _msg = _matchFinished
        ? 'O resultado será salvo como confirmado. A partida casual será encerrada para TODOS os jogadores — eles voltarão ao dashboard automaticamente.'
        : 'Todos os jogadores voltarão à sala de organização da partida para uma nova rodada.';
    } else if (isCasual) {
      _title = 'Abandonar partida?';
      _msg = _matchFinished
        ? 'O resultado será salvo como confirmado. Sua vaga ficará livre para outro jogador.'
        : 'Deseja abandonar a partida casual? Sua vaga ficará livre para outro jogador.';
    } else {
      _title = 'Fechar placar?';
      _msg = _matchFinished ? 'O resultado será salvo como confirmado.' : 'Deseja fechar o placar ao vivo?';
    }
    showConfirmDialog(
      _title,
      _msg,
      function() {
        // Persist the finished result as confirmed before closing/cleanup.
        if (state.isFinished && !_resultSaved) {
          try { _saveResult({ keepOpen: true, silent: true }); } catch(e) {}
        }
        var _matchIsComplete = state.isFinished || _resultSaved;
        // v1.9.60: criador E guest, ao abandonar ANTES de terminar, apenas SAEM
        // da sala (leaveCasualMatch). A sala vive enquanto houver ≥1 usuário
        // cadastrado (uid) e só se dissolve quando o ÚLTIMO uid sai (auto-
        // dissolução em leaveCasualMatch). Antes o CRIADOR chamava
        // cancelCasualMatch e matava a sala mesmo com outros jogadores dentro —
        // contra a regra do dono ("vive enquanto houver 1 cadastrado"). Match
        // finalizado mantém o doc intacto (status=finished) como histórico,
        // independente de quem fecha — e os participantes não são removidos
        // (a query de "últimas partidas" depende de playerUids).
        if (isCasual && isOrganizer) _casualCancelled = true; // gate do reopen-setup
        // v2.2.16-beta: comportamento diferente para match completo vs. mid-game.
        // Match completo: fecha para todos via hostClosed:true (histórico preservado).
        // Mid-game: retorna todos ao mesmo lobby via status:'setup' — _setupSignal
        // disparado no onSnapshot dos guests; sessão reutilizada (mesma sala).
        if (isCasual && isOrganizer && _casualDocId && window.FirestoreDB && window.FirestoreDB.db) {
          try {
            if (_matchIsComplete) {
              window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId)
                .update({ hostClosed: true })
                .catch(function() {});
            } else {
              // Mid-game: sinaliza retorno ao lobby sem encerrar a sala
              window.FirestoreDB.db.collection('casualMatches').doc(_casualDocId)
                .update({ status: 'setup', setupAt: Date.now() })
                .catch(function() {});
            }
          } catch(e) {}
        }
        // leaveCasualMatch removido do mid-game: sala permanece ativa para guests
        // retornarem via _setupSignal. Match completo: condição !_matchIsComplete
        // já impedia o call antes, sem mudança necessária.
        // Clear activeCasualRoom from the profile + suppress resume for
        // 6s so a stale snapshot doesn't yank the user back into the
        // match they just closed. (MutationObserver normally handles
        // this when going via setup→live; explicit clear here covers
        // the direct-join case where no observer was attached.)
        if (isCasual) {
          try {
            var _cuC = window.AppStore && window.AppStore.currentUser;
            if (_cuC && _cuC.uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
              window._suppressCasualResumeUntil = Date.now() + 6000;
              window.FirestoreDB.saveUserProfile(_cuC.uid, { activeCasualRoom: null }).catch(function(){});
            }
          } catch(e) {}
          // v0.17.48: limpa sessionStorage também — sem isto, o boot
          // check da v0.17.48 reabriria a sala fechada.
          try { sessionStorage.removeItem('_activeCasualRoom'); } catch(e) {}
        }
        _cleanup();
        // v1.7.1-beta: organizador volta ao setup de partida casual para poder
        // iniciar nova partida imediatamente. Guests (sem overlay de setup em
        // memória) vão ao dashboard — _casualReopenSetup só faz sentido pra
        // quem iniciou a partida (referência `overlay` no closure do setup).
        if (isCasual) {
          if (isOrganizer && typeof window._casualReopenSetup === 'function') {
            try { window._casualReopenSetup({ keepSession: !_matchIsComplete }); } catch(e) {
              try { window.location.hash = '#dashboard'; } catch(e2) {}
            }
          } else {
            try { window.location.hash = '#dashboard'; } catch(e) {}
          }
        }
      }
    );
  };

  // expõe force-close para o botão "Fechar agora" no banner
  window._closePendingForceClose = _closePendingForceClose;

  // v2.2.12-beta: cancelar consenso de encerramento — iniciador ou convidado recusa
  window._casualCloseCancel = function() {
    _myCloseClicked = false;
    if (_closePendingTimer) { clearInterval(_closePendingTimer); _closePendingTimer = null; }
    var _db = window.FirestoreDB && window.FirestoreDB.db;
    if (_db && _casualDocId) {
      _db.collection('casualMatches').doc(_casualDocId).update({
        closePending: firebase.firestore.FieldValue.delete()
      }).catch(function(e) { window._warn('[closeConsensus] cancel failed', e); });
    }
    var b = document.getElementById('close-pending-banner');
    if (b) b.remove();
  };

  // v2.2.12-beta: confirmar encerramento — convidado confirma, voltar à sala
  window._casualCloseConfirm = async function() {
    var _cuCC = window.AppStore && window.AppStore.currentUser;
    var _myUidCC = _cuCC && _cuCC.uid;
    if (!_myUidCC || !_casualDocId || !window.FirestoreDB || !window.FirestoreDB.db) return;
    var _db = window.FirestoreDB.db;
    try {
      // Adiciona meu UID na lista de confirmados atomicamente
      await _db.collection('casualMatches').doc(_casualDocId).update({
        'closePending.confirmedBy': firebase.firestore.FieldValue.arrayUnion(_myUidCC)
      });
      // Lê o doc para verificar se todos os não-iniciadores confirmaram
      var snap = await _db.collection('casualMatches').doc(_casualDocId).get();
      if (!snap.exists) return;
      var d = snap.data();
      var cp = d && d.closePending;
      if (!cp) return; // já foi cancelado
      var allUids = Array.isArray(d.playerUids) ? d.playerUids : _knownPlayerUids;
      var nonInitiators = allUids.filter(function(u) { return u !== cp.by; });
      var confirmed = Array.isArray(cp.confirmedBy) ? cp.confirmedBy : [];
      // v2.2.22-beta: basta UM outro jogador real confirmar. Antes exigia que
      // TODOS os nonInitiators confirmassem (`every`), mas UIDs fantasma (gente
      // que saiu sem limpar playerUids) nunca confirmam → o "todos confirmaram"
      // nunca era verdade → "Confirmar não fazia nada". Em partida casual, se o
      // iniciador quer encerrar e ao menos mais um confirma, encerra pra todos.
      var someoneConfirmed = confirmed.some(function(u) {
        return u !== cp.by && nonInitiators.indexOf(u) !== -1;
      });
      if (someoneConfirmed) {
        // Todos confirmaram — cancela timer do iniciador (se ainda ativo) e fecha
        if (_closePendingTimer) { clearInterval(_closePendingTimer); _closePendingTimer = null; }
        // Remove closePending e sinaliza volta à sala (setupAt)
        var _newSetupAt = Date.now();
        await _db.collection('casualMatches').doc(_casualDocId).update({
          closePending: firebase.firestore.FieldValue.delete(),
          setupAt: _newSetupAt,
          status: 'setup'
        });
        // O próprio onSnapshot vai detectar _setupSignal e chamar _casualReopenSetup
      }
    } catch(e) {
      window._warn('[closeConsensus] confirm failed', e);
      showNotification('Erro', 'Não foi possível confirmar. Tente novamente.', 'error');
    }
  };

  // Re-render on orientation/resize change for landscape layout
  var _resizeTimer = null;
  var _onResize = function() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function() {
      if (document.getElementById('live-scoring-overlay')) _render();
    }, 150);
  };
  window.addEventListener('resize', _onResize);

  // Initial render
  _render();
};

// ─── Scan QR Code / Enter Room Code ─────────────────────────────────────────
// Opens from dashboard "Escanear QR" button. Camera-based scanner with
// manual code input fallback.

// v2.1.7-beta: o leitor de QR ficou GERAL — entra em partida casual OU em
// torneio (ou qualquer rota do scoreplace) conforme o destino do QR lido.
// Resolve o texto cru do QR para uma rota hash de destino, ou null se não for
// um QR do scoreplace.
window._routeFromScannedQR = function(text) {
  text = (text || '').trim();
  if (!text) return null;
  // Torneio: #tournaments/<id> ou #bracket/<id>
  var mTour = text.match(/#(?:tournaments|bracket)\/([A-Za-z0-9_\-]+)/);
  if (mTour) return '#tournaments/' + mTour[1];
  // Partida casual: #casual/CODE
  var mCasual = text.match(/#casual\/([A-Za-z0-9]{4,8})/);
  if (mCasual) return '#casual/' + mCasual[1].toUpperCase();
  // Convite do app
  if (/#invite\b/.test(text)) return '#invite';
  // Qualquer URL scoreplace.app com hash de rota → passa a rota adiante
  if (/scoreplace\.app/i.test(text)) {
    var hi = text.indexOf('#');
    if (hi !== -1) { var h = text.slice(hi); if (/^#[a-z]/i.test(h)) return h; }
    return '#dashboard';
  }
  // Código curto (4-8 alfanum) → assume sala casual (compat com QR antigos que
  // só carregavam o código da sala, sem URL)
  var plain = text.replace(/[^A-Za-z0-9]/g, '');
  if (plain.length >= 4 && plain.length <= 8) return '#casual/' + plain.toUpperCase();
  return null;
};

// Navega pro destino resolvido. Em casual, força re-render se já estiver na
// rota (hashchange não dispara). Em torneio/outros, basta setar o hash.
window._navigateToScannedRoute = function(route) {
  if (!route) return;
  if (window.location.hash === route) {
    var mC = route.match(/^#casual\/([A-Za-z0-9]{4,8})$/);
    var vc = document.getElementById('view-container');
    if (mC && vc && typeof window._renderCasualJoin === 'function') {
      window._renderCasualJoin(vc, mC[1].toUpperCase());
    } else if (typeof window.handleRoute === 'function') {
      window.handleRoute();
    }
  } else {
    window.location.hash = route;
  }
};

window._openScanQR = function() {
  // v1.6.105-beta: Chrome iOS (CriOS) não suporta getUserMedia/streaming camera.
  // Redireciona para o scanner via input de arquivo que funciona em qualquer browser iOS.
  if (/CriOS/i.test(navigator.userAgent)) {
    if (typeof window._openScanQRNative === 'function') { window._openScanQRNative(); return; }
  }

  var existing = document.getElementById('scan-qr-overlay');
  if (existing) existing.remove();

  // v1.6.19-beta: UI reformulada estilo scanner nativo iOS — fullscreen com
  // câmera ocupando a tela inteira, mira centralizada (4 cantos brancos),
  // texto sutil no topo, X pra fechar no canto. Entrada manual como link
  // discreto no rodapé. Sem overlay competindo com o feed da câmera.
  var ov = document.createElement('div');
  ov.id = 'scan-qr-overlay';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;height:100%;background:#000;z-index:100003;display:flex;flex-direction:column;overflow:hidden;';

  var _scanStream = null;
  var _scanInterval = null;
  var _scanFound = false;

  // v1.6.23-beta: registry global de TODOS os streams criados pelo scanner
  // nessa sessão. iOS PWA standalone pode segurar streams órfãos se o user
  // abriu/fechou scanner múltiplas vezes — esses streams não estão em
  // _scanStream (que aponta só ao último). Registry pega todos.
  window._scanStreamRegistry = window._scanStreamRegistry || [];

  // v1.6.23-beta: cleanup ainda mais agressivo. v1.6.21 já tinha
  // video.pause()/srcObject=null/load(), mas iOS PWA standalone ainda
  // manteve o badge "câmera em uso" em alguns casos. 3 defesas extras:
  //   (a) Para TODOS os streams do registry (pega órfãos de sessions anteriores)
  //   (b) srcObject = new MediaStream() vazia em vez de null — bug iOS
  //       conhecido onde null não libera o stream em alguns builds
  //   (c) Navegação/remove DOM com 150ms de delay pra iOS processar a
  //       liberação dos recursos antes do video element ser destruído
  function _cleanupScanner() {
    if (_scanInterval) {
      try { clearInterval(_scanInterval); } catch(e) {}
      _scanInterval = null;
    }
    // (a) Para TODOS os streams do registry primeiro — defesa contra
    // streams órfãos de sessions anteriores que ficaram com tracks ativos.
    try {
      window._scanStreamRegistry.forEach(function(s) {
        if (s && s.getTracks) {
          try {
            s.getTracks().forEach(function(t) {
              try { t.stop(); } catch(e) {}
            });
          } catch(e) {}
        }
      });
      window._scanStreamRegistry.length = 0;
    } catch(e) {}

    var v = document.getElementById('scan-qr-video');
    if (v) {
      try { v.pause(); } catch(e) {}
      // Para QUALQUER stream attached ao video (defesa em camadas — o
      // registry deve ter pegado, mas garante).
      var attachedStream = null;
      try { attachedStream = v.srcObject; } catch(e) {}
      if (attachedStream && attachedStream.getTracks) {
        try {
          attachedStream.getTracks().forEach(function(t) {
            try { t.stop(); } catch(e) {}
          });
        } catch(e) {}
      }
      // (b) Substitui srcObject por MediaStream vazia em vez de null.
      // iOS PWA standalone bug: srcObject = null não libera o stream em
      // alguns builds; MediaStream vazia força o browser a desconectar.
      try {
        if (typeof MediaStream !== 'undefined') {
          v.srcObject = new MediaStream();
        } else {
          v.srcObject = null;
        }
      } catch(e) {
        try { v.srcObject = null; } catch(_e) {}
      }
      try { v.removeAttribute('src'); } catch(e) {}
      try { v.load(); } catch(e) {}
    }
    if (_scanStream) {
      try {
        _scanStream.getTracks().forEach(function(t) {
          try { t.stop(); } catch(e) {}
        });
      } catch(e) {}
      _scanStream = null;
    }
  }

  function _closeOverlay() {
    _cleanupScanner();
    // (c) Pequeno delay pra iOS processar liberação dos recursos antes
    // do video element ser destruído. Sem isto, em iOS PWA standalone o
    // badge da câmera persistia mesmo após track.stop().
    setTimeout(function() {
      var o = document.getElementById('scan-qr-overlay');
      if (o) o.remove();
    }, 150);
  }

  function _navigateToRoom(code) {
    if (_scanFound) return;
    _scanFound = true;
    // Cleanup ANTES de tudo — para tracks imediatamente.
    _cleanupScanner();
    // (c) Pequeno delay antes de remover DOM e navegar. iOS Safari PWA
    // standalone precisa de tempo pra processar a liberação dos recursos
    // de mídia antes do video element ser destruído pelo o.remove().
    // Sem este delay, o badge "câmera em uso" persiste no topo apesar
    // de track.stop() ter sido chamado.
    setTimeout(function() {
      var o = document.getElementById('scan-qr-overlay');
      if (o) o.remove();
      var _targetHash = '#casual/' + code.toUpperCase();
      if (window.location.hash === _targetHash) {
        // v1.6.63-beta: hash já é o destino — hashchange não dispara e o
        // router não re-executa. Chama _renderCasualJoin diretamente para
        // que o join funcione mesmo quando o usuário escaneia QR code
        // estando já na rota #casual/CODE (ex: após Desparear sem navegar).
        var _vc = document.getElementById('view-container');
        if (_vc && typeof window._renderCasualJoin === 'function') {
          window._renderCasualJoin(_vc, code.toUpperCase());
        }
      } else {
        window.location.hash = _targetHash;
      }
    }, 150);
  }

  // Try extracting room code from URL or raw code
  function _extractRoomCode(text) {
    text = (text || '').trim();
    var urlMatch = text.match(/#casual\/([A-Za-z0-9]{4,8})/);
    if (urlMatch) return urlMatch[1].toUpperCase();
    var plain = text.replace(/[^A-Za-z0-9]/g, '');
    if (plain.length >= 4 && plain.length <= 8) return plain.toUpperCase();
    return null;
  }

  // Build UI — fullscreen scanner estilo iOS
  ov.innerHTML =
    // Camera video fullscreen como background
    '<video id="scan-qr-video" autoplay playsinline muted style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:none;"></video>' +
    '<canvas id="scan-qr-canvas" style="display:none;"></canvas>' +

    // Placeholder enquanto câmera inicia
    '<div id="scan-qr-placeholder" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:rgba(255,255,255,0.85);">' +
      '<div style="font-size:3rem;">📷</div>' +
      '<div style="font-size:0.85rem;">Iniciando câmera…</div>' +
    '</div>' +

    // Top bar — texto sutil + X pra fechar
    '<div style="position:absolute;top:0;left:0;right:0;padding:env(safe-area-inset-top,12px) 16px 16px;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg,rgba(0,0,0,0.7),transparent);z-index:2;">' +
      '<div style="color:#fff;font-size:0.95rem;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.5);">Aponte para o QR code</div>' +
      '<button id="scan-qr-close-btn" aria-label="Fechar" style="width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:1.2rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;">×</button>' +
    '</div>' +

    // Center viewfinder — 4 cantos brancos como iOS scanner
    '<div id="scan-qr-viewfinder" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(70vw,280px);aspect-ratio:1;pointer-events:none;z-index:1;">' +
      // 4 cantos
      '<div style="position:absolute;top:0;left:0;width:36px;height:36px;border-top:4px solid #fff;border-left:4px solid #fff;border-radius:6px 0 0 0;"></div>' +
      '<div style="position:absolute;top:0;right:0;width:36px;height:36px;border-top:4px solid #fff;border-right:4px solid #fff;border-radius:0 6px 0 0;"></div>' +
      '<div style="position:absolute;bottom:0;left:0;width:36px;height:36px;border-bottom:4px solid #fff;border-left:4px solid #fff;border-radius:0 0 0 6px;"></div>' +
      '<div style="position:absolute;bottom:0;right:0;width:36px;height:36px;border-bottom:4px solid #fff;border-right:4px solid #fff;border-radius:0 0 6px 0;"></div>' +
    '</div>' +

    // Bottom — botão pra entrada manual de código (link discreto)
    '<div style="position:absolute;bottom:0;left:0;right:0;padding:24px 16px env(safe-area-inset-bottom,24px);display:flex;flex-direction:column;align-items:center;gap:12px;background:linear-gradient(0deg,rgba(0,0,0,0.7),transparent);z-index:2;">' +
      '<button id="scan-qr-manual-btn" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);color:#fff;border-radius:22px;padding:10px 22px;font-size:0.88rem;font-weight:600;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);">⌨️ Digitar código</button>' +
    '</div>' +

    // Manual code dialog (hidden inicialmente)
    '<div id="scan-qr-manual-overlay" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:3;align-items:center;justify-content:center;padding:1.5rem;">' +
      '<div style="background:var(--bg-darker,#1a1a2e);border-radius:18px;padding:24px;max-width:360px;width:100%;">' +
        '<div style="font-size:1.1rem;font-weight:800;color:#fff;margin-bottom:14px;text-align:center;">Digite o código da sala</div>' +
        '<input type="text" id="scan-qr-code-input" placeholder="Ex: ABC123" maxlength="8" style="width:100%;box-sizing:border-box;padding:14px 16px;border-radius:12px;background:rgba(255,255,255,0.06);border:2px solid rgba(168,85,247,0.3);color:#fff;font-size:1.3rem;font-weight:800;letter-spacing:4px;text-align:center;text-transform:uppercase;outline:none;font-family:monospace;margin-bottom:14px;" onfocus="this.style.borderColor=\'rgba(168,85,247,0.7)\'" onblur="this.style.borderColor=\'rgba(168,85,247,0.3)\'" />' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="scan-qr-manual-cancel-btn" style="flex:1;padding:14px;border-radius:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:0.95rem;font-weight:600;cursor:pointer;">Cancelar</button>' +
          '<button id="scan-qr-go-btn" style="flex:1;padding:14px;border-radius:12px;background:linear-gradient(135deg,#a855f7,#7c3aed);border:none;color:white;font-size:0.95rem;font-weight:700;cursor:pointer;">Entrar</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(ov);

  // v1.6.21-beta: cleanup defensivo se o user navegar/fechar aba — sem isto
  // o stream poderia ficar pendurado se um hashchange acontecesse por outro
  // caminho que não _navigateToRoom ou _closeOverlay (raro mas possível).
  // Listener auto-removível pra não vazar event handlers entre sessões.
  var _onPageHideScan = function() {
    _cleanupScanner();
    try { window.removeEventListener('pagehide', _onPageHideScan); } catch(e) {}
    try { window.removeEventListener('hashchange', _onHashChangeScan); } catch(e) {}
  };
  var _onHashChangeScan = function() {
    // Se hash mudou e overlay ainda existe (caso edge — user voltou via
    // browser back, etc.), garante cleanup antes de remover overlay.
    if (document.getElementById('scan-qr-overlay')) {
      _cleanupScanner();
      var o2 = document.getElementById('scan-qr-overlay');
      if (o2) o2.remove();
    }
    try { window.removeEventListener('pagehide', _onPageHideScan); } catch(e) {}
    try { window.removeEventListener('hashchange', _onHashChangeScan); } catch(e) {}
  };
  window.addEventListener('pagehide', _onPageHideScan);
  window.addEventListener('hashchange', _onHashChangeScan);

  // Wire up close
  document.getElementById('scan-qr-close-btn').onclick = _closeOverlay;

  // Wire up manual entry dialog (hidden by default; toggled by button)
  var manualOv = document.getElementById('scan-qr-manual-overlay');
  var manualBtn = document.getElementById('scan-qr-manual-btn');
  var manualCancelBtn = document.getElementById('scan-qr-manual-cancel-btn');
  var goBtn = document.getElementById('scan-qr-go-btn');
  var codeInput = document.getElementById('scan-qr-code-input');
  manualBtn.onclick = function() {
    manualOv.style.display = 'flex';
    setTimeout(function() { if (codeInput) codeInput.focus(); }, 80);
  };
  manualCancelBtn.onclick = function() {
    manualOv.style.display = 'none';
    if (codeInput) codeInput.value = '';
  };
  function _tryManualCode() {
    var code = _extractRoomCode(codeInput.value);
    if (code) {
      _navigateToRoom(code);
    } else {
      codeInput.style.borderColor = '#ef4444';
      setTimeout(function() { codeInput.style.borderColor = 'rgba(168,85,247,0.3)'; }, 1000);
    }
  }
  goBtn.onclick = _tryManualCode;
  codeInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') _tryManualCode();
  });

  // v1.6.20-beta: scanner reescrito com robustez + diagnóstico.
  // Bugs anteriores prováveis:
  //   1. video.play() não disparava em alguns navegadores apesar de autoplay
  //   2. resolução padrão do getUserMedia era muito baixa pra jsQR decodificar
  //   3. jsQR carregava DEPOIS da câmera abrir, criando race window
  //   4. erro de permissão era logado só em console (user não via)
  //   5. inversionAttempts: 'dontInvert' falha em QRs invertidos
  // Diagnóstico exposto em window._scanDebug pra inspeção via DevTools.
  var video = document.getElementById('scan-qr-video');
  var canvas = document.getElementById('scan-qr-canvas');
  var placeholder = document.getElementById('scan-qr-placeholder');
  var hasBarcodeAPI = typeof window.BarcodeDetector !== 'undefined';
  window._scanDebug = {
    hasBarcodeAPI: hasBarcodeAPI,
    jsQRLoaded: !!window.jsQR,
    framesProcessed: 0,
    lastError: null,
    lastDetectionAttempt: null,
    cameraOpened: false,
    videoWidth: 0,
    videoHeight: 0,
    decoderReady: false
  };

  function _showError(emoji, msg) {
    placeholder.style.display = 'flex';
    placeholder.innerHTML =
      '<div style="font-size:2.5rem;">' + emoji + '</div>' +
      '<div style="font-size:0.88rem;color:rgba(255,255,255,0.9);padding:0 1.5rem;text-align:center;line-height:1.5;max-width:300px;">' + msg + '</div>';
  }

  function _showStatus(emoji, msg) {
    placeholder.innerHTML =
      '<div style="font-size:2.5rem;">' + emoji + '</div>' +
      '<div style="font-size:0.85rem;color:rgba(255,255,255,0.85);">' + msg + '</div>';
  }

  // Pré-carrega jsQR em paralelo se BarcodeDetector não existir.
  // Garante que decoder está pronto quando câmera abrir.
  function _ensureJsQR() {
    return new Promise(function(resolve, reject) {
      if (window.jsQR) { window._scanDebug.jsQRLoaded = true; resolve(); return; }
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      script.onload = function() { window._scanDebug.jsQRLoaded = true; resolve(); };
      script.onerror = function() { reject(new Error('jsQR CDN load failed')); };
      document.head.appendChild(script);
    });
  }

  function _onDetected(rawValue) {
    if (_scanFound) return;
    window._scanDebug.lastDetectionAttempt = (rawValue || '').slice(0, 80);
    // v2.1.7-beta: resolve geral (casual OU torneio OU outra rota).
    var route = window._routeFromScannedQR(rawValue);
    if (route) {
      if (typeof showNotification === 'function') showNotification('QR detectado!', route, 'success');
      _scanFound = true;
      _cleanupScanner();
      setTimeout(function() {
        var o = document.getElementById('scan-qr-overlay');
        if (o) o.remove();
        window._navigateToScannedRoute(route);
      }, 150);
    }
  }

  function _startScanning(decodeMethod) {
    // Solicita resolução decente pra jsQR funcionar bem.
    // 1280x720 é suportado por basicamente todo celular moderno.
    var constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      _showError('🚫', 'Seu navegador não suporta acesso à câmera. Use o botão "Digitar código" abaixo.');
      window._scanDebug.lastError = 'no-mediaDevices';
      return;
    }
    _showStatus('📷', 'Iniciando câmera…');
    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
      window._scanDebug.cameraOpened = true;
      _scanStream = stream;
      // v1.6.23-beta: registra no registry pra cleanup pegar streams órfãos
      try { window._scanStreamRegistry.push(stream); } catch(e) {}
      video.srcObject = stream;
      video.style.display = 'block';
      placeholder.style.display = 'none';

      // play() explícito — em iOS Safari standalone PWA, autoplay nem sempre
      // funciona apesar dos atributos. Catch silencioso porque autoplay
      // geralmente cobre, e a única forma de saber pra certeza é tentar.
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function(_e) { /* autoplay deve cobrir */ });
      }

      // Aguarda o vídeo ter dimensões antes de iniciar o loop.
      // Polling em vez de loadedmetadata pra ser robusto contra eventos perdidos.
      var startedLoop = false;
      function _tryStartLoop() {
        if (startedLoop) return;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          startedLoop = true;
          window._scanDebug.videoWidth = video.videoWidth;
          window._scanDebug.videoHeight = video.videoHeight;
          window._scanDebug.decoderReady = true;
          var ctx = canvas.getContext('2d');
          _scanInterval = setInterval(function() {
            if (_scanFound || !video.videoWidth) return;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              window._scanDebug.framesProcessed++;
              decodeMethod(canvas, ctx);
            } catch (e) {
              window._scanDebug.lastError = String(e && e.message || e);
            }
          }, 200); // 200ms = 5fps, bom balance bateria/responsividade
          return;
        }
        setTimeout(_tryStartLoop, 80);
      }
      _tryStartLoop();
    }).catch(function(err) {
      window._scanDebug.lastError = String(err && err.name || err);
      var msg = 'Não consegui acessar a câmera.';
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        msg = 'Permissão de câmera negada. Habilite no menu do navegador (cadeado ao lado da URL → Câmera → Permitir) e tente de novo.';
      } else if (err && err.name === 'NotFoundError') {
        msg = 'Nenhuma câmera encontrada no dispositivo.';
      } else if (err && err.name === 'NotReadableError') {
        msg = 'Câmera ocupada por outro app. Feche aplicativos de câmera e tente novamente.';
      } else if (err && err.name === 'OverconstrainedError') {
        // Tenta de novo sem constraints de resolução
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
          .then(function(s) {
            window._scanDebug.cameraOpened = true;
            window._scanDebug.lastError = 'overconstrained-fallback';
            _scanStream = s;
            // v1.6.23-beta: registra stream pra cleanup pegar
            try { window._scanStreamRegistry.push(s); } catch(e) {}
            video.srcObject = s;
            video.style.display = 'block';
            placeholder.style.display = 'none';
            video.play().catch(function(){});
          })
          .catch(function() {
            _showError('🚫', 'Não consegui usar a câmera traseira. ' + msg);
          });
        return;
      }
      _showError('🚫', msg);
    });
  }

  // Inicializa scanner: BarcodeDetector quando disponível (super rápido,
  // nativo do SO), senão jsQR como fallback.
  if (hasBarcodeAPI) {
    var detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    _startScanning(function(cvs) {
      detector.detect(cvs).then(function(barcodes) {
        if (barcodes && barcodes.length > 0) _onDetected(barcodes[0].rawValue);
      }).catch(function(e) {
        window._scanDebug.lastError = 'detect:' + String(e && e.message || e);
      });
    });
  } else {
    // Pré-carrega jsQR em paralelo com pedir câmera — sem esperar antes da UX
    _ensureJsQR().then(function() {
      _startScanning(function(cvs, ctx) {
        var imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
        // attemptBoth (regular + invertido) cobre QRs em fundos pretos/claros.
        // Marginal mais lento que dontInvert mas garante detecção.
        var qr = window.jsQR(imageData.data, cvs.width, cvs.height, { inversionAttempts: 'attemptBoth' });
        if (qr && qr.data) _onDetected(qr.data);
      });
    }).catch(function() {
      _showError('⌨️', 'Não consegui carregar o leitor de QR. Sem internet? Use o botão "Digitar código" abaixo.');
    });
  }
};

// ─── Native Camera Capture QR Scanner ───────────────────────────────────────
// v1.6.18-beta: usa <input type="file" accept="image/*" capture="environment">
// pra abrir o app de câmera NATIVO do celular (UI nativa do iOS/Android,
// sem overlay customizado). Usuário tira foto do QR code, foto retorna
// pro app, jsQR decodifica, navega pra #casual/<roomCode>.
//
// LIMITAÇÃO TÉCNICA: PWA web não consegue abrir o "Scanner de Código" nativo
// do iOS via URL scheme (não existe API pública). O fluxo "tirar foto +
// decodificar" é o mais próximo de nativo possível em web — interface da
// câmera é 100% do SO, sem overlay customizado.
window._openScanQRNative = function() {
  // Helper: extrai roomCode de URL completa ou texto curto
  function _extractRoomCode(text) {
    text = (text || '').trim();
    var urlMatch = text.match(/#casual\/([A-Za-z0-9]{4,8})/);
    if (urlMatch) return urlMatch[1].toUpperCase();
    var plain = text.replace(/[^A-Za-z0-9]/g, '');
    if (plain.length >= 4 && plain.length <= 8) return plain.toUpperCase();
    return null;
  }

  // Helper: carrega jsQR (CDN) sob demanda
  function _ensureJsQR(callback) {
    if (window.jsQR) return callback();
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.onload = callback;
    script.onerror = function() { callback(); }; // segue mesmo se falhar, callback checa window.jsQR
    document.head.appendChild(script);
  }

  // Helper: dialog simples pra entrada manual quando decode falha
  function _showManualCodeDialog(reason) {
    if (typeof showAlertDialog !== 'function' && typeof window.showAlertDialog !== 'function') {
      alert(reason || 'Não consegui ler o QR. Digite o código manualmente.');
      return;
    }
    var msg = reason || 'Não consegui detectar o QR code na foto.';
    var inputHtml = '<div style="margin-top:14px;"><input type="text" id="_qr-manual-input" placeholder="Ex: ABC123" maxlength="8" style="width:100%;box-sizing:border-box;padding:14px;border-radius:10px;background:rgba(255,255,255,0.06);border:2px solid rgba(168,85,247,0.3);color:#fff;font-size:1.2rem;font-weight:800;letter-spacing:4px;text-align:center;text-transform:uppercase;outline:none;font-family:monospace;"></div>';
    (window.showAlertDialog || showAlertDialog)('Digite o código da sala', msg + inputHtml, function() {
      var v = document.getElementById('_qr-manual-input');
      if (!v) return;
      var code = _extractRoomCode(v.value);
      if (code) window.location.hash = '#casual/' + code;
    });
    setTimeout(function() {
      var el = document.getElementById('_qr-manual-input');
      if (el) el.focus();
    }, 250);
  }

  // Helper: decodifica imagem File via jsQR
  function _decodeQRFromFile(file, callback) {
    var reader = new FileReader();
    reader.onerror = function() { callback(null); };
    reader.onload = function(ev) {
      var img = new Image();
      img.onerror = function() { callback(null); };
      img.onload = function() {
        try {
          var canvas = document.createElement('canvas');
          // Limita dimensão pra evitar OOM em fotos de alta resolução
          var maxDim = 1280;
          var w = img.naturalWidth, h = img.naturalHeight;
          if (w > maxDim || h > maxDim) {
            var scale = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var imageData = ctx.getImageData(0, 0, w, h);
          _ensureJsQR(function() {
            if (!window.jsQR) return callback(null);
            var qr = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
            if (qr && qr.data) {
              // v2.1.7-beta: resolve geral (casual OU torneio OU outra rota).
              callback(window._routeFromScannedQR(qr.data));
            } else {
              callback(null);
            }
          });
        } catch (_err) {
          callback(null);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Cria input invisível com capture pra abrir câmera nativa do SO
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // câmera traseira em mobile; ignorado em desktop
  input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

  // Pré-carrega jsQR em paralelo pra reduzir delay depois de tirar foto
  _ensureJsQR(function() {});

  input.onchange = function(e) {
    var file = e.target.files && e.target.files[0];
    if (input.parentNode) input.parentNode.removeChild(input);
    if (!file) return; // usuário cancelou
    _decodeQRFromFile(file, function(route) {
      if (route) {
        window._navigateToScannedRoute(route);
      } else {
        _showManualCodeDialog('Não consegui detectar o QR code na foto. Tente outra foto ou digite o código manualmente.');
      }
    });
  };

  // Safety: se o usuário cancelar a câmera (sem trigger de change em alguns
  // navegadores), remove o input depois de 60s pra não vazar.
  setTimeout(function() {
    if (input.parentNode && !(input.files && input.files.length)) {
      input.parentNode.removeChild(input);
    }
  }, 60000);

  document.body.appendChild(input);
  input.click();
};

// ─── Casual Match Setup Screen ──────────────────────────────────────────────
// Opens from dashboard "Partida Casual" button. Shows sport picker, player
// names, scoring config summary + gear icon, then launches live scoring.

window._openCasualMatch = function(restoreOpts) {
  // Remove existing
  var existing = document.getElementById('casual-match-overlay');
  if (existing) existing.remove();

  // Detect user's preferred sport. Aceita array (forma moderna) ou string
  // CSV (legacy) — v0.15.19 migrou o profile pra array mas docs antigos em
  // Firestore ainda podem vir como string.
  var cu = window.AppStore && window.AppStore.currentUser;
  var userSport = '';
  if (cu && cu.preferredSports) {
    if (Array.isArray(cu.preferredSports)) {
      userSport = cu.preferredSports[0] || '';
    } else {
      userSport = String(cu.preferredSports).split(/[,;]/)[0].trim();
    }
  }

  // Available sports
  var sports = [
    { key: 'Beach Tennis', icon: (typeof window !== 'undefined' && window._BEACH_TENNIS_ICON) || '🟠', label: 'Beach Tennis', defaultDoubles: true },
    { key: 'Pickleball', icon: (typeof window !== 'undefined' && window._sportIcon && window._sportIcon('Pickleball')) || '🟡', label: 'Pickleball', defaultDoubles: true },
    { key: 'Tênis', icon: '🎾', label: 'Tênis', defaultDoubles: false },
    { key: 'Tênis de Mesa', icon: '🏓', label: 'Tênis de Mesa', defaultDoubles: false },
    { key: 'Padel', icon: (typeof window !== 'undefined' && window._sportIcon && window._sportIcon('Padel')) || '🏓', label: 'Padel', defaultDoubles: true },
    // Vôlei de Praia e Futevôlei são sempre disputados em dupla vs dupla
    // (regra oficial) — sem opção de individual.
    { key: 'Vôlei de Praia', icon: '🏐', label: 'Vôlei de Praia', defaultDoubles: true },
    { key: 'Futevôlei', icon: '⚽', label: 'Futevôlei', defaultDoubles: true }
  ];

  // Resolve initial sport: (1) last-used persisted choice → (2) profile preferredSport → (3) Beach Tennis (most common casual match)
  var initialSport = '';
  var persistedDoubles = null;
  try {
    var _lastPrefs = {};
    try { _lastPrefs = JSON.parse(localStorage.getItem('scoreplace_casual_last') || '{}') || {}; } catch(e) {}
    // O perfil VENCE o cache: o localStorage é limpo periodicamente pelo iOS, e
    // quando isso acontecia a escolha do usuário sumia e caíamos no primeiro
    // esporte preferido do perfil (ex: Pickleball). Espelha _loadLiveScorePrefs.
    var _cuLast = window.AppStore && window.AppStore.currentUser;
    if (_cuLast && _cuLast.casualLast && typeof _cuLast.casualLast === 'object') {
      _lastPrefs = Object.assign({}, _lastPrefs, _cuLast.casualLast);
    }
    if (_lastPrefs.sport && sports.find(function(s){ return s.key === _lastPrefs.sport; })) {
      initialSport = _lastPrefs.sport;
      if (typeof _lastPrefs.isDoubles === 'boolean') persistedDoubles = _lastPrefs.isDoubles;
    }
  } catch(e) {}
  if (!initialSport) {
    for (var si = 0; si < sports.length; si++) {
      if (userSport && userSport.toLowerCase().indexOf(sports[si].key.toLowerCase()) !== -1) {
        initialSport = sports[si].key; break;
      }
      if (userSport && sports[si].key.toLowerCase().indexOf(userSport.toLowerCase().replace(/[^\w\u00C0-\u024F]/gu, '')) !== -1) {
        initialSport = sports[si].key; break;
      }
    }
  }
  if (!initialSport) initialSport = 'Beach Tennis';

  // State — default to doubles ON, sortear ON (auto-drives from team formation)
  // restoreOpts overrides defaults when coming back from a SW-update reload
  var selectedSport = (restoreOpts && restoreOpts.sport) || initialSport;
  var spMatch = sports.find(function(s) { return s.key === selectedSport; });
  var isDoubles = (restoreOpts && typeof restoreOpts.isDoubles === 'boolean') ? restoreOpts.isDoubles
    : (persistedDoubles !== null) ? persistedDoubles : (spMatch ? spMatch.defaultDoubles : true);
  // autoShuffle mirrors team-formation state: ON until a team is formed via
  // drag-and-drop, then OFF; if the team is broken, it flips back to ON.
  var autoShuffle = true;
  // Mixed-doubles toggle — appears only when we detect 2M+2F in lobby. Defaults ON.
  var _mixedDoublesEnabled = true;
  // Coach mode: user stays on screen to manage score for 4 other players (not playing).
  // Frees their own slot (editable), all name inputs become editable.
  var _coachMode = false;
  // v1.6.11-beta: Rei/Rainha da Praia mode — 3 jogos rotativos entre 4 jogadores
  var _reiRainhaMode = false;
  // v1.6.51-beta: uid de amigos vinculados via autocomplete por slot. Quando
  // o técnico ou organizador vincula um nome a um amigo, o uid é armazenado
  // aqui e propagado para _buildPlayers() — assim as stats pós-partida são
  // atribuídas ao perfil correto via casual_link_request notification.
  var _slotLinkedUid = (restoreOpts && Array.isArray(restoreOpts.slotLinkedUid))
    ? restoreOpts.slotLinkedUid.slice()
    : [null, null, null, null];
  // Pré-carrega perfis dos amigos vinculados via restoreOpts para que o avatar
  // esteja disponível no primeiro render (sem esperar o próximo poll de 3s).
  (function() {
    for (var _ri = 0; _ri < _slotLinkedUid.length; _ri++) {
      var _rUid = _slotLinkedUid[_ri];
      if (_rUid && window._friendProfilesCache && !window._friendProfilesCache[_rUid]) {
        (function(_u) {
          if (window.FirestoreDB && window.FirestoreDB.loadUserProfile) {
            window.FirestoreDB.loadUserProfile(_u).then(function(p) {
              if (p) {
                window._friendProfilesCache[_u] = {
                  uid: _u, displayName: p.displayName || '',
                  photoURL: p.photoURL || '', gender: p.gender || ''
                };
                if (document.getElementById('casual-match-overlay')) _renderSetup();
              }
            }).catch(function() {});
          }
        })(_rUid);
      }
    }
  })();
  var _acTimerSlot = [null, null, null, null];
  // Gender cache keyed by uid: 'masculino' | 'feminino' | '' (checked, missing) | undefined (not loaded yet)
  var _participantGenders = {};
  if (cu && cu.uid) _participantGenders[cu.uid] = cu.gender || '';
  // v1.6.26-beta: gender per slot (override por partida). Quando o slot
  // tem participante logado com gender no perfil, é usado como default;
  // caso contrário (guest ou logado sem gender), usuário pode setar via
  // ícone clicável no card. Sincronizado via Firestore (campo slotGenders).
  // Format: { 0: 'masculino'|'feminino'|null, ... }
  var _slotGenders = (restoreOpts && restoreOpts.slotGenders) ? Object.assign({}, restoreOpts.slotGenders) : {};
  // Helper canônico: gênero efetivo do slot. Override por partida (_slotGenders)
  // tem prioridade sobre o gender do perfil do usuário logado naquele slot.
  function _resolveSlotGender(slotIdx) {
    // Coach mode: slots foram liberados — só vale o override manual da partida.
    if (_coachMode) return _slotGenders[slotIdx] || null;
    var lp = _lobbyParticipants[slotIdx];
    // v2.2.28-beta: o gênero do PERFIL é AUTORITATIVO. Uma marcação manual de
    // outro usuário (override por partida) NUNCA sobrepõe o gênero que o dono
    // definiu no próprio perfil. Override só vale quando NÃO há gênero de perfil
    // (participante digitado/guest, ou usuário real com uid mas sem gênero).
    if (lp && lp.uid && _participantGenders[lp.uid]) return _participantGenders[lp.uid];
    if (_slotGenders[slotIdx]) return _slotGenders[slotIdx];
    return null;
  }
  // True quando o slot tem um usuário real cujo gênero veio do PERFIL — nesse
  // caso ninguém pode re-marcar (o ícone vira somente-leitura).
  function _slotGenderIsFromProfile(slotIdx) {
    if (_coachMode) return false;
    var lp = _lobbyParticipants[slotIdx];
    return !!(lp && lp.uid && _participantGenders[lp.uid]);
  }
  // Restore participants from the existing Firestore doc when re-entering after reload
  var _lobbyParticipants = (restoreOpts && Array.isArray(restoreOpts.participants) && restoreOpts.participants.length > 0)
    ? restoreOpts.participants
    : (cu ? [{ uid: cu.uid, displayName: cu.displayName || '', photoURL: cu.photoURL || '', joinedAt: new Date().toISOString() }] : []);
  // v1.6.11-beta: slot 0 = primeiro participante da sala (criador), não
  // o current user. Antes, cada cliente via o próprio nome no slot 0, o que
  // criava inconsistência entre A e B (cada um se via como "Jogador 1"). Agora
  // todos veem a MESMA ordem — sala única, sem hierarquia host/guest. O
  // current user vê seu próprio nome no slot em que ele está em
  // _lobbyParticipants (ordenado por joinedAt).
  var p1Name = (_lobbyParticipants[0] && _lobbyParticipants[0].displayName)
    ? _lobbyParticipants[0].displayName
    : (cu && cu.displayName ? cu.displayName : '');
  var _setupRefreshInterval = null;
  var _sessionReopened = false; // v1.6.62-beta: true quando voltamos ao setup com keepSession

  // Async-load gender for any lobby participant we haven't seen yet, then
  // re-render the setup view so the mixed-doubles toggle can appear when
  // the 2M+2F condition is satisfied.
  function _loadMissingGenders() {
    if (!window.FirestoreDB || !window.FirestoreDB.loadUserProfile) return;
    var needed = [];
    for (var i = 0; i < _lobbyParticipants.length; i++) {
      var lp = _lobbyParticipants[i];
      if (lp && lp.uid && !(lp.uid in _participantGenders)) needed.push(lp.uid);
    }
    if (!needed.length) return;
    // Mark as loading so we don't re-dispatch
    for (var j = 0; j < needed.length; j++) _participantGenders[needed[j]] = undefined;
    var pending = needed.length;
    needed.forEach(function(uid) {
      window.FirestoreDB.loadUserProfile(uid).then(function(prof) {
        _participantGenders[uid] = (prof && prof.gender) ? prof.gender : '';
        // v1.6.33-beta: propaga gender do perfil para _slotGenders se ainda não
        // há override manual, para que outros clientes vejam via Firestore sync.
        if (_participantGenders[uid]) {
          for (var _si = 0; _si < _lobbyParticipants.length; _si++) {
            if (_lobbyParticipants[_si] && _lobbyParticipants[_si].uid === uid && !_slotGenders[_si]) {
              _slotGenders[_si] = _participantGenders[uid];
            }
          }
        }
      }).catch(function() {
        _participantGenders[uid] = '';
      }).then(function() {
        pending--;
        if (pending === 0) {
          _syncCasualSetupDebounced();
          if (document.getElementById('casual-match-overlay')) _renderSetup();
        }
      });
    });
  }

  // v1.6.26-beta: agora conta gênero por SLOT (0-3), não por logado.
  // Antes só logados com gender no perfil contavam — guests não contavam.
  // Agora _resolveSlotGender considera override por partida + perfil do
  // logado, fazendo o toggle Misto aparecer SEMPRE que houver 2M+2F entre
  // os 4 slots (logados + guests com gênero setado pelo organizador).
  function _genderCounts() {
    var m = 0, f = 0, unknown = 0;
    for (var i = 0; i < 4; i++) {
      var g = _resolveSlotGender(i);
      if (g === 'masculino') m++;
      else if (g === 'feminino') f++;
      else unknown++;
    }
    return { male: m, female: f, unknown: unknown };
  }

  // Toggle Misto aparece quando há 2M+2F entre os 4 slots.
  function _canShowMixedToggle() {
    if (!isDoubles) return false;
    var c = _genderCounts();
    return c.male === 2 && c.female === 2;
  }
  // Team assignments for drag-and-drop (keyed by card index 0-3): { idx: 1 or 2 }
  // When empty, no teams formed yet. When set, idx→1 = Team 1 (blue), idx→2 = Team 2 (red).
  var _teamAssignments = {};

  // Casual default config per sport (overrides _sportScoringDefaults for casual).
  // deuceRule: game-level 40-40 → AD rule (tennis/padel only).
  // DERIVADO da FONTE ÚNICA window.SPORT_RULES (js/views/sport-rules.js). Regra muda? Muda LÁ.
  // Projeção casual: advantageRule→deuceRule + twoPointAdvantage + tieRule (comportamento de empate).
  var _casualDefaults = window._casualScoringDefaultsMap();

  // Config de placar por esporte. Fonte de verdade: users/{uid}.casualPrefs;
  // localStorage é só cache instantâneo. Antes vivia SÓ no localStorage e o iOS
  // limpa o storage periodicamente — a config configurada pelo usuário sumia.
  function _readCasualPrefs() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem('scoreplace_casual_prefs') || '{}') || {}; } catch(e) {}
    var _cu = window.AppStore && window.AppStore.currentUser;
    if (_cu && _cu.casualPrefs && typeof _cu.casualPrefs === 'object') {
      p = Object.assign({}, p, _cu.casualPrefs); // perfil vence o cache
    }
    return p;
  }
  function _writeCasualPrefs(prefs) {
    try { localStorage.setItem('scoreplace_casual_prefs', JSON.stringify(prefs)); } catch(e) {}
    var _cu = window.AppStore && window.AppStore.currentUser;
    if (_cu) _cu.casualPrefs = prefs;
    if (_cu && _cu.uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
      try { window.FirestoreDB.saveUserProfile(_cu.uid, { casualPrefs: prefs }).catch(function(){}); } catch(e) {}
    }
  }

  function _getConfig() {
    // v1.7.1-beta: defaults usados como base — prefs armazenadas sem 'type'
    // causavam useSets=false, bypassing GSM completamente e mostrando 0/1/2/3
    // em vez de 15/30/40 mesmo com countingType:'tennis' configurado.
    var _defaults = _casualDefaults[selectedSport] || { type:'sets', setsToWin:1, gamesPerSet:6, tiebreakEnabled:false, tiebreakPoints:7, tiebreakMargin:2, superTiebreak:false, superTiebreakPoints:10, countingType:'tennis', deuceRule:false, twoPointAdvantage:true, tieRule:'ask' };
    try {
      var prefs = _readCasualPrefs();
      if (prefs[selectedSport]) {
        var stored = prefs[selectedSport];
        // Migrate legacy advantageRule → deuceRule and DROP the old key so it
        // doesn't override a user-toggled deuceRule via the state-init OR fallback.
        if (stored.advantageRule !== undefined) {
          if (stored.deuceRule === undefined) stored.deuceRule = !!stored.advantageRule;
          delete stored.advantageRule;
          prefs[selectedSport] = stored;
          _writeCasualPrefs(prefs);
        }
        if (stored.twoPointAdvantage === undefined) stored.twoPointAdvantage = true;
        // Merge: defaults first, then stored on top — garante que campos ausentes
        // (como 'type') venham dos defaults sem sobrescrever escolhas do usuário.
        var merged = {}, k;
        for (k in _defaults) { if (Object.prototype.hasOwnProperty.call(_defaults, k)) merged[k] = _defaults[k]; }
        for (k in stored)   { if (Object.prototype.hasOwnProperty.call(stored,   k)) merged[k] = stored[k];   }
        // Vantagem (deuce/AD), ganhar-por-2 (twoPointAdvantage) e comportamento de EMPATE
        // (tieRule/tiebreakEnabled) são REGRA DA MODALIDADE — não escolha do usuário. Força do
        // default do esporte, ignorando prefs antigas (toggles removidos da UI). A decisão de
        // tie-break é tomada EM QUADRA (botão do placar ao vivo no empate), não na config.
        merged.deuceRule = _defaults.deuceRule;
        merged.twoPointAdvantage = _defaults.twoPointAdvantage !== false;
        merged.tieRule = _defaults.tieRule;
        merged.tiebreakEnabled = _defaults.tiebreakEnabled;
        return merged;
      }
    } catch(e) {}
    return _defaults;
  }

  var _tieRuleLabels = { 'ask': 'Perguntar no jogo', 'extend': 'Prorrogar (vantagem de 2)', 'tiebreak': 'Tie-break 7pts', 'supertiebreak': 'Super tie-break 10pts' };

  function _configSummary() {
    var cfg = _getConfig();
    if (!cfg.type || cfg.type !== 'sets') return 'Placar livre (sem sets/games)';
    var parts = [];
    parts.push(cfg.setsToWin + ' set' + (cfg.setsToWin > 1 ? 's' : ''));
    parts.push(cfg.gamesPerSet + ' games');
    if (cfg.countingType === 'tennis') parts.push('15-30-40');
    else parts.push('1-2-3');
    if (cfg.deuceRule) parts.push('AD');
    if (cfg.twoPointAdvantage !== false) {
      // v4.5.42: 'ask' (perguntar a cada empate) é o PADRÃO → não polui o resumo.
      // Só mostra quando a regra é diferente do padrão (tie-break direto / prorrogar fixo).
      var tr = cfg.tieRule || 'ask';
      if (tr !== 'ask') parts.push('Empate: ' + (_tieRuleLabels[tr] || tr));
    } else {
      parts.push('Sem vantagem de 2');
    }
    return parts.join(' · ');
  }

  // Build avatar HTML for a participant (photo or initial fallback)
  // v1.8.9-beta: delegates to window._avatarHtml (store.js).
  function _avatarHtml(pp, size) {
    return window._avatarHtml(pp, size);
  }

  // Build lobby HTML showing participants who joined
  function _buildLobbyHtml() {
    var totalNeeded = isDoubles ? 4 : 2;
    var count = _lobbyParticipants.filter(Boolean).length;
    var myUid = cu ? cu.uid : null;
    if (count <= 1) return ''; // Only the creator — nothing to show yet

    var h = '<div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:12px;padding:10px 12px;">' +
      '<div style="font-size:0.72rem;font-weight:600;color:#22c55e;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">' +
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;animation:casualPulse 1.5s ease-in-out infinite;"></span>' +
        _t('casual.inRoom', {count: count, total: totalNeeded}) +
      '</div>' +
      '<style>@keyframes casualPulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}</style>';
    for (var i = 0; i < _lobbyParticipants.length; i++) {
      var pp = _lobbyParticipants[i];
      if (!pp) continue; // slot liberado — não renderizar
      var isMe = myUid && pp.uid === myUid;
      var isHost = pp.uid === (cu ? cu.uid : '');
      h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;margin-bottom:3px;' +
        'background:' + (isMe ? 'rgba(34,197,94,0.06)' : 'transparent') + ';">' +
        _avatarHtml(pp, 28) +
        '<div style="font-size:0.82rem;font-weight:600;color:var(--text-bright);flex:1;min-width:0;word-break:break-word;overflow-wrap:anywhere;">' + window._safeHtml(pp.displayName || _t('casual.playerFallback')) +
          (isHost ? ' <span style="font-size:0.65rem;color:#fbbf24;">👑</span>' : '') +
          (isMe ? ' <span style="font-size:0.62rem;color:#22c55e;">(' + _t('casual.you') + ')</span>' : '') +
        '</div>' +
        '<span style="font-size:0.75rem;">✅</span>' +
      '</div>';
    }
    h += '</div>';
    return h;
  }

  // Update only the lobby section without re-rendering the whole setup (preserves input values)
  function _updateLobbySection() {
    var section = document.getElementById('casual-lobby-section');
    if (section) section.innerHTML = _buildLobbyHtml();
    // Also fill empty player inputs with lobby participant names
    _fillInputsFromLobby();
    // Re-render the setup cards so each registered guest's avatar + name
    // appears on their card. _renderSetup captures current input values
    // before re-rendering, so anything the host typed is preserved.
    _renderSetup();
  }

  // Fill player name inputs with lobby participants' displayNames
  function _fillInputsFromLobby() {
    if (_lobbyParticipants.length <= 1) return;
    var names = _lobbyParticipants.map(function(p) { return p.displayName || ''; }).filter(function(n) { return !!n; });
    if (isDoubles) {
      var inputs = [
        document.getElementById('casual-p1a-name'),
        document.getElementById('casual-p1b-name'),
        document.getElementById('casual-p2a-name'),
        document.getElementById('casual-p2b-name')
      ];
      for (var i = 0; i < inputs.length && i < names.length; i++) {
        if (inputs[i] && (!inputs[i].value || inputs[i].value === inputs[i].placeholder)) {
          inputs[i].value = names[i];
        }
      }
    } else {
      var inp1 = document.getElementById('casual-p1-name');
      var inp2 = document.getElementById('casual-p2-name');
      if (inp1 && names[0] && (!inp1.value || inp1.value === inp1.placeholder)) inp1.value = names[0];
      if (inp2 && names[1] && (!inp2.value || inp2.value === inp2.placeholder)) inp2.value = names[1];
    }
  }

  function _renderSetup() {
    var content = document.getElementById('casual-setup-content');
    if (!content) return;

    // Sport label for config summary
    var sportIcon = '';
    var sportLabel = selectedSport;
    for (var si = 0; si < sports.length; si++) {
      if (sports[si].key === selectedSport) { sportIcon = sports[si].icon; sportLabel = sports[si].label; break; }
    }

    // Sortear toggle (doubles only). Auto-drives from drag-and-drop team
    // formation: ON while no team is formed, OFF when a team is paired via
    // the chain, back to ON when the team is broken.
    var togglesHtml = '';
    if (isDoubles) {
      togglesHtml =
        '<div style="margin-bottom:0.8rem;display:flex;flex-direction:column;gap:6px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:12px;background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.12);">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span style="font-size:1rem;">🔀</span>' +
              '<div>' +
                '<span style="font-size:0.85rem;font-weight:700;color:var(--text-bright);">' + _t('casual.shuffleTeams') + '</span>' +
                '<div style="font-size:0.65rem;color:var(--text-muted);">' + _t('casual.shuffleSubtitle') + '</div>' +
              '</div>' +
            '</div>' +
            '<label class="toggle-switch" style="--toggle-on-bg:#fbbf24;"><input type="checkbox" ' + (autoShuffle ? 'checked' : '') + ' onchange="window._casualSetShuffle(this.checked)"><span class="toggle-slider"></span></label>' +
          '</div>';
      if (_canShowMixedToggle()) {
        togglesHtml +=
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:12px;background:rgba(236,72,153,0.05);border:1px solid rgba(236,72,153,0.15);">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span style="font-size:1rem;">⚤</span>' +
              '<div>' +
                '<span style="font-size:0.85rem;font-weight:700;color:var(--text-bright);">' + _t('casual.mixedDoubles') + '</span>' +
                '<div style="font-size:0.65rem;color:var(--text-muted);">' + _t('casual.mixedSubtitle') + '</div>' +
              '</div>' +
            '</div>' +
            '<label class="toggle-switch" style="--toggle-on-bg:#ec4899;"><input type="checkbox" ' + (_mixedDoublesEnabled ? 'checked' : '') + ' onchange="window._casualSetMixedDoubles(this.checked)"><span class="toggle-slider"></span></label>' +
          '</div>';
      }
      // v1.6.11-beta: Rei/Rainha toggle — 3 jogos rotativos com 4 jogadores
      togglesHtml +=
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:12px;background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.18);">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:1rem;">👑</span>' +
            '<div>' +
              '<span style="font-size:0.85rem;font-weight:700;color:var(--text-bright);">Rei/Rainha</span>' +
              '<div style="font-size:0.65rem;color:var(--text-muted);">3 jogos rotativos · duplas trocam a cada partida</div>' +
            '</div>' +
          '</div>' +
          '<label class="toggle-switch" style="--toggle-on-bg:#f59e0b;"><input type="checkbox" ' + (_reiRainhaMode ? 'checked' : '') + ' onchange="window._casualSetReiRainha(this.checked)"><span class="toggle-slider"></span></label>' +
        '</div>';
      togglesHtml += '</div>';
    }

    // Coach toggle — inline com o label de participantes (só se logado)
    var coachToggleHtml = cu ?
      '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">' +
        '<span style="font-size:0.65rem;font-weight:600;color:' + (_coachMode ? '#22c55e' : 'var(--text-muted)') + ';white-space:nowrap;">🎽 Técnico</span>' +
        '<label class="toggle-switch toggle-sm" style="--toggle-on-bg:#22c55e;">' +
          '<input type="checkbox" ' + (_coachMode ? 'checked' : '') + ' onchange="window._casualToggleCoachMode(this.checked)">' +
          '<span class="toggle-slider"></span>' +
        '</label>' +
      '</div>' : '';

    // Player names — same 4-card grid for both Sortear ON and OFF
    // v1.6.26-beta: helper pra renderizar ícone de gênero do slot.
    // v1.7.2-beta FIX: moved outside if(isDoubles) block — was block-scoped in V8
    // causing "TypeError: _genderIconHtml is not a function" in singles mode.
    function _genderIconHtml(ci) {
      var g = _resolveSlotGender(ci);
      // v2.2.28-beta: gênero vindo do PERFIL é somente-leitura — ninguém
      // re-marca o gênero de quem já tem no perfil. Editável só pra guest
      // digitado ou usuário real sem gênero no perfil.
      var _fromProfile = _slotGenderIsFromProfile(ci);
      var sym, clr, title, bg, bdr, pulseClass;
      if (g === 'masculino') {
        sym = '♂'; clr = '#60a5fa'; title = _fromProfile ? 'Masculino (do perfil)' : 'Masculino — toque pra mudar';
        bg = 'rgba(255,255,255,0.06)'; bdr = 'rgba(255,255,255,0.12)'; pulseClass = '';
      } else if (g === 'feminino') {
        sym = '♀'; clr = '#f472b6'; title = _fromProfile ? 'Feminino (do perfil)' : 'Feminino — toque pra mudar';
        bg = 'rgba(255,255,255,0.06)'; bdr = 'rgba(255,255,255,0.12)'; pulseClass = '';
      } else {
        // Estado não definido — visualmente chamativo
        sym = '?'; clr = '#fbbf24'; title = 'Toque pra definir o gênero';
        bg = 'rgba(251,191,36,0.15)'; bdr = 'rgba(251,191,36,0.5)';
        pulseClass = ' _casual-gender-pulse';
      }
      // Somente-leitura: <span> sem onclick (não abre o picker).
      if (_fromProfile) {
        return '<span data-gender-slot="' + ci + '" ' +
          'title="' + title + '" aria-label="' + title + '" ' +
          'style="width:26px;height:26px;min-width:26px;border-radius:50%;background:' + bg + ';' +
          'border:1px solid ' + bdr + ';color:' + clr + ';font-size:0.95rem;font-weight:800;' +
          'display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;line-height:1;cursor:default;">' + sym + '</span>';
      }
      return '<button type="button" data-gender-slot="' + ci + '" class="' + pulseClass.trim() + '" ' +
        'onclick="event.stopPropagation();window._casualSetSlotGender(' + ci + ')" ' +
        'title="' + title + '" aria-label="' + title + '" ' +
        'style="width:26px;height:26px;min-width:26px;border-radius:50%;background:' + bg + ';' +
        'border:1px solid ' + bdr + ';color:' + clr + ';font-size:0.95rem;font-weight:800;' +
        'display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;flex-shrink:0;' +
        'transition:background 0.15s,transform 0.15s;-webkit-tap-highlight-color:transparent;line-height:1;" ' +
        'onmouseover="this.style.transform=\'scale(1.1)\'" ' +
        'onmouseout="this.style.transform=\'\'">' + sym + '</button>';
    }
    var playersHtml = '';
    if (isDoubles) {
      // Build avatar helper for input cards
      // v1.6.11-beta: idx 0 vem sempre de _lobbyParticipants[0] (criador) pra
      // consistência entre clientes — não mais hardcoded em `cu`.
      function _inputAvatar(idx) {
        var pp = null;
        if (idx < _lobbyParticipants.length) pp = _lobbyParticipants[idx];
        // NOTE: sem fallback para cu aqui — se o slot 0 está vazio (criador saiu),
        // não mostrar o avatar de quem está vendo (causava foto errada após saída).
        if (!pp || (!pp.photoURL && !pp.displayName)) return '';
        // Coach mode: ocultar todos os avatares — todos os slots ficam livres para edição
        if (_coachMode) return '';
        if (pp.photoURL) {
          return '<img src="' + window._safeHtml(pp.photoURL) + '" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1.5px solid rgba(255,255,255,0.15);" onerror="this.style.display=\'none\'">';
        }
        return '<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:700;flex-shrink:0;">' + window._safeHtml((pp.displayName || 'J')[0].toUpperCase()) + '</div>';
      }

      // Check if teams are formed (drag-and-drop assigned all 4 slots)
      var _teamsFormed = _teamAssignments[0] !== undefined && _teamAssignments[1] !== undefined && _teamAssignments[2] !== undefined && _teamAssignments[3] !== undefined;

      var _inputStyle = 'flex:1;padding:0;border:none;background:transparent;font-size:0.82rem;font-weight:600;outline:none;min-width:0;width:100%;resize:none;font-family:inherit;overflow:hidden;line-height:1.3;word-break:break-word;white-space:pre-wrap;';

      // Setup screen: neutral cards, or team-colored when teams formed via drag-and-drop
      var inputIds = ['casual-p1a-name', 'casual-p1b-name', 'casual-p2a-name', 'casual-p2b-name'];
      var inputPlaceholders = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4'];
      // Canonical names: registered participants always come from the data source,
      // never from a previously-rendered DOM value (prevents photoURL corruption).
      // v1.6.32-beta: slot 0 derivado de _lobbyParticipants[0] ao invés de p1Name
      // (closure stale) — p1Name era definido uma vez na criação e nunca atualizado,
      // causando nome antigo no slot após quem estava em slot 0 sair da sala.
      // Coach mode: não pré-preencher nomes dos participantes — técnico preenche do zero
      var inputValues = _coachMode ? ['', '', '', ''] : [
        (_lobbyParticipants[0] && _lobbyParticipants[0].displayName) ? _lobbyParticipants[0].displayName : '',
        '', '', ''
      ];
      // Slots 1–3: if there's a registered lobby participant, seed from their displayName
      if (!_coachMode) {
        for (var _ri = 1; _ri < _lobbyParticipants.length && _ri < 4; _ri++) {
          if (_lobbyParticipants[_ri] && _lobbyParticipants[_ri].displayName) {
            inputValues[_ri] = _lobbyParticipants[_ri].displayName;
          }
        }
      }
      // Preserve input values across re-renders ONLY for unregistered (editable) slots.
      // When coming back from the config screen the DOM inputs no longer exist
      // (config replaced content.innerHTML), so fall back to _savedPlayerNames
      // which was snapshotted just before _casualOpenConfig() ran.
      for (var _ii = 0; _ii < inputIds.length; _ii++) {
        // Coach mode: todos os slots são editáveis
        var _isRegSlot = !_coachMode && !!(
          _ii < _lobbyParticipants.length && _lobbyParticipants[_ii] &&
          (_lobbyParticipants[_ii].uid || _lobbyParticipants[_ii].photoURL));
        if (!_isRegSlot) {
          var _el = document.getElementById(inputIds[_ii]);
          if (_el) {
            inputValues[_ii] = _el.value;
          } else if (!_coachMode && _savedPlayerNames[_ii] !== undefined && _savedPlayerNames[_ii] !== '') {
            // DOM was replaced by config screen — restore from pre-config snapshot
            // Coach mode: nunca restaurar nomes antigos — técnico preenche do zero
            inputValues[_ii] = _savedPlayerNames[_ii];
          }
        }
      }
      function _buildSetupCard(ci) {
        var avatar = _inputAvatar(ci);
        var team = _teamAssignments[ci]; // 1, 2, or undefined
        var bg, bdr, textClr;
        if (_teamsFormed && team === 1) {
          bg = 'rgba(59,130,246,0.10)'; bdr = 'rgba(59,130,246,0.35)'; textClr = '#60a5fa';
        } else if (_teamsFormed && team === 2) {
          bg = 'rgba(239,68,68,0.10)'; bdr = 'rgba(239,68,68,0.35)'; textClr = '#f87171';
        } else {
          bg = 'rgba(255,255,255,0.04)'; bdr = 'rgba(255,255,255,0.12)'; textClr = 'var(--text-bright)';
        }
        var isDraggable = true;
        var dragStyle = 'cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;';
        // Registered users (lobby participant with uid/photo, or the host): textarea
        // must be readonly so a stray touch-focus can't let the user edit their name.
        // pointer-events:none on the textarea directs all touch events to the outer
        // div (which carries draggable="true"), so drag-start never fights focus.
        // v1.6.32-beta: removido hardcode (ci === 0) — slot 0 só é "registrado"
        // se realmente tem um participante logado lá. Antes, mesmo com slot 0
        // vazio (criador saiu), era tratado como readonly e mostrava avatar errado.
        // Coach mode: todos os slots ficam editáveis (nomes e gêneros livres).
        var _isRegCard = !_coachMode && !!(ci < _lobbyParticipants.length && _lobbyParticipants[ci] &&
          (_lobbyParticipants[ci].uid || _lobbyParticipants[ci].photoURL));
        // v1.6.52-beta: slot vinculado via autocomplete — visual igual ao registrado
        // v1.6.57-beta: _coachMode não bloqueia mais _isLinkedCard — amigo vinculado
        // mostra avatar mesmo em modo técnico (⠿ só aparece em slots SEM vínculo).
        var _isLinkedCard = !_isRegCard && !!_slotLinkedUid[ci];
        var _linkedFriendProfile = _isLinkedCard && window._friendProfilesCache ? window._friendProfilesCache[_slotLinkedUid[ci]] : null;
        // Fallback: se uid vinculado mas perfil ainda não está no cache (ex: Device B antes do
        // fetch async completar), usa nome do input para mostrar iniciais imediatamente.
        if (_isLinkedCard && !_linkedFriendProfile) {
          _linkedFriendProfile = {
            displayName: inputValues[ci] || '',
            photoURL: '',
            gender: _slotGenders[ci] || ''
          };
        }
        if (_isLinkedCard) { bg = 'rgba(99,102,241,0.10)'; bdr = 'rgba(99,102,241,0.40)'; textClr = 'var(--text-bright)'; }
        var _readonlyAttr = (_isRegCard || _isLinkedCard) ? 'readonly ' : '';
        var _regExtraStyle = (_isRegCard || _isLinkedCard) ? 'pointer-events:none;cursor:inherit;' : '';
        // Em modo técnico sem vínculo: handle ⠿ para arrastar (único ponto de
        // toque que inicia drag via touchstart). Quando há amigo vinculado,
        // mostra o avatar dele — drag funciona via draggable="true" no card.
        var _leftEl;
        if (_coachMode && !_isLinkedCard) {
          _leftEl = '<div data-drag-handle="1" style="width:22px;min-width:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:grab;color:var(--text-muted);font-size:1.1rem;line-height:1;-webkit-user-select:none;user-select:none;touch-action:none;" title="Arrastar para formar dupla">⠿</div>';
        } else if (_isLinkedCard && _linkedFriendProfile) {
          var _lfi = ((_linkedFriendProfile.displayName || '?')[0] || '?').toUpperCase();
          var _lfAvHtml = _linkedFriendProfile.photoURL
            ? '<img src="' + window._safeHtml(_linkedFriendProfile.photoURL) + '" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1.5px solid rgba(99,102,241,0.5);" onerror="this.style.display=\'none\'">'
            : '<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:700;flex-shrink:0;">' + window._safeHtml(_lfi) + '</div>';
          _leftEl = '<div style="position:relative;flex-shrink:0;" title="' + window._safeHtml(_linkedFriendProfile.displayName || '') + '">' +
            _lfAvHtml +
            '<button type="button" class="cancel-x-btn" onmousedown="event.preventDefault()" onclick="window._casualUnlinkSlot(' + ci + ')" style="--cx-size:16px;position:absolute;bottom:-3px;right:-4px;" title="Desvincular">✕</button>' +
            '</div>';
        } else if (_coachMode) {
          _leftEl = '<div data-drag-handle="1" style="width:22px;min-width:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:grab;color:var(--text-muted);font-size:1.1rem;line-height:1;-webkit-user-select:none;user-select:none;touch-action:none;" title="Arrastar para formar dupla">⠿</div>';
        } else {
          _leftEl = avatar;
        }
        // Valor do textarea: usa displayName completo quando vinculado via autocomplete
        var _textareaVal = (_isLinkedCard && _linkedFriendProfile) ? (_linkedFriendProfile.displayName || '') : inputValues[ci];
        // Autocomplete só em slots editáveis (não registrados, não vinculados, não coach)
        var _acInput = (_isRegCard || _isLinkedCard) ? '' : 'window._casualSlotAutocomplete(this,' + ci + ');';
        return '<div style="position:relative;" data-casual-ac-wrapper="' + ci + '">' +
          '<div data-casual-idx="' + ci + '"' + (isDraggable ? ' draggable="true"' : '') + ' style="display:flex;align-items:center;gap:6px;padding:8px 8px;border-radius:12px;background:' + bg + ';border:1px solid ' + bdr + ';box-sizing:border-box;min-width:0;overflow:hidden;transition:transform 0.15s,border-color 0.2s,background 0.2s;' + dragStyle + '">' +
          _leftEl +
          '<textarea id="' + inputIds[ci] + '" ' + _readonlyAttr + 'rows="1" placeholder="' + inputPlaceholders[ci] + '" oninput="window._syncCasualSetupFromInput && window._syncCasualSetupFromInput();window._autosizeCasualInput && window._autosizeCasualInput(this);window._equalizeCasualCards && window._equalizeCasualCards();' + _acInput + '" style="' + _inputStyle + _regExtraStyle + 'color:' + textClr + ';">' + window._safeHtml(_textareaVal) + '</textarea>' +
          _genderIconHtml(ci) +
          '</div>' +
        '</div>';
      }

      var cardsHtml;
      if (_teamsFormed) {
        // Teams formed: T1 stacked left, T2 stacked right, with a clickable
        // chain icon between each pair. Clicking the chain breaks teams.
        var _t1Idxs = [], _t2Idxs = [];
        for (var _gi = 0; _gi < 4; _gi++) {
          if (_teamAssignments[_gi] === 1) _t1Idxs.push(_gi);
          else _t2Idxs.push(_gi);
        }
        var _chainBtn = '<button type="button" onclick="window._casualResetTeams()" title="' + _t('casual.breakTeams') + '" aria-label="' + _t('casual.breakTeams') + '" ' +
          'style="margin:4px auto;display:flex;align-items:center;justify-content:center;width:40px;height:28px;' +
          'border-radius:14px;border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.04);' +
          'cursor:pointer;font-size:0.95rem;line-height:1;color:var(--text-muted);transition:all 0.18s;' +
          '-webkit-tap-highlight-color:transparent;padding:0;" ' +
          'onmouseover="this.style.background=\'rgba(239,68,68,0.15)\';this.style.borderColor=\'rgba(239,68,68,0.45)\';this.style.color=\'#f87171\';this.style.transform=\'scale(1.08)\'" ' +
          'onmouseout="this.style.background=\'rgba(255,255,255,0.04)\';this.style.borderColor=\'rgba(255,255,255,0.18)\';this.style.color=\'var(--text-muted)\';this.style.transform=\'\'" ' +
          'ontouchstart="this.style.background=\'rgba(239,68,68,0.2)\';this.style.transform=\'scale(0.94)\'" ' +
          'ontouchend="this.style.background=\'rgba(255,255,255,0.04)\';this.style.transform=\'\'">🔗</button>';
        cardsHtml =
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div style="display:flex;flex-direction:column;align-items:stretch;gap:0;">' +
              _buildSetupCard(_t1Idxs[0]) + _chainBtn + _buildSetupCard(_t1Idxs[1]) +
            '</div>' +
            '<div style="display:flex;flex-direction:column;align-items:stretch;gap:0;">' +
              _buildSetupCard(_t2Idxs[0]) + _chainBtn + _buildSetupCard(_t2Idxs[1]) +
            '</div>' +
          '</div>';
      } else {
        cardsHtml =
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            _buildSetupCard(0) + _buildSetupCard(1) + _buildSetupCard(2) + _buildSetupCard(3) +
          '</div>';
      }

      var subtitle;
      if (autoShuffle) {
        subtitle = '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;text-align:center;">' + _t('casual.shuffleOnStart') + '</div>';
      } else if (_teamsFormed) {
        subtitle = '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;text-align:center;">' + _t('casual.breakTeamsHint') + '</div>';
      } else {
        subtitle = '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;text-align:center;">' + _t('casual.dragToForm') + '</div>';
      }

      playersHtml =
        '<div style="margin-bottom:0.8rem;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<label style="font-size:0.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">' + _t('casual.participants') + '</label>' +
            coachToggleHtml +
          '</div>' +
          '<div id="casual-team-cards">' +
            cardsHtml +
          '</div>' +
          subtitle +
        '</div>';
    } else {
      // Singles — show current user avatar next to their input
      // Coach mode: não mostrar avatar (slot liberado para outro jogador)
      var _cuAvatarSingles = '';
      if (!_coachMode) {
        if (cu && cu.photoURL) {
          _cuAvatarSingles = '<img src="' + window._safeHtml(cu.photoURL) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;position:absolute;left:10px;top:50%;transform:translateY(-50%);border:1.5px solid rgba(59,130,246,0.3);" onerror="this.style.display=\'none\'">';
        } else if (cu && cu.displayName) {
          _cuAvatarSingles = '<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:12px;color:white;font-weight:700;position:absolute;left:10px;top:50%;transform:translateY(-50%);">' + window._safeHtml((cu.displayName || 'J')[0].toUpperCase()) + '</div>';
        }
      }
      var _hasSinglesAvatar = !_coachMode && !!(cu && (cu.photoURL || cu.displayName));
      // Coach mode: preservar o que o técnico digitou no p1 across re-renders;
      // na primeira ativação o _casualToggleCoachMode já limpou o DOM.
      var _singlesP1Value = _coachMode
        ? (function() { var _d = document.getElementById('casual-p1-name'); return _d ? _d.value : ''; }())
        : p1Name;
      playersHtml =
        '<div style="margin-bottom:1.2rem;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<label style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">' + _t('casual.players') + '</label>' +
            coachToggleHtml +
          '</div>' +
          '<div style="display:flex;gap:10px;">' +
            '<div style="flex:1;display:flex;align-items:center;gap:6px;">' +
              '<div style="flex:1;position:relative;">' + _cuAvatarSingles +
                '<input type="text" id="casual-p1-name" value="' + window._safeHtml(_singlesP1Value) + '" placeholder="Jogador 1" style="width:100%;padding:10px 14px;' + (_hasSinglesAvatar ? 'padding-left:44px;' : '') + 'border-radius:10px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);color:var(--text-bright);font-size:0.95rem;font-weight:600;outline:none;box-sizing:border-box;">' +
              '</div>' +
              _genderIconHtml(0) +
            '</div>' +
            '<div style="flex:1;display:flex;align-items:center;gap:6px;">' +
              '<input type="text" id="casual-p2-name" value="' + window._safeHtml(_savedPlayerNames[5] || '') + '" placeholder="Jogador 2" style="flex:1;padding:10px 14px;border-radius:10px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--text-bright);font-size:0.95rem;font-weight:600;outline:none;box-sizing:border-box;">' +
              _genderIconHtml(1) +
            '</div>' +
          '</div>' +
        '</div>';
    }

    var casualUrl = (window.SCOREPLACE_URL || 'https://scoreplace.app') + '/#casual/' + _sessionRoomCode;

    content.innerHTML =
      // Config summary: sport + mode + scoring in one compact row
      '<div onclick="window._casualOpenConfig()" style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:12px;padding:8px 12px;margin-bottom:0.8rem;display:flex;align-items:center;gap:10px;cursor:pointer;">' +
        '<div style="font-size:1.3rem;flex-shrink:0;">' + sportIcon + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:0.85rem;font-weight:700;color:var(--text-bright);">' + window._safeHtml(sportLabel) + ' · ' + (isDoubles ? _t('casual.doubles') : _t('casual.single')) + '</div>' +
          '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">' + window._safeHtml(_configSummary()) + '</div>' +
        '</div>' +
        '<div style="color:#818cf8;font-size:1.1rem;flex-shrink:0;">⚙️</div>' +
      '</div>' +

      // Toggles: Sortear, Misto (doubles only)
      togglesHtml +

      // Players
      playersHtml +

      // Lobby: participants who joined via QR/code
      '<div id="casual-lobby-section" style="margin-bottom:0.6rem;">' + _buildLobbyHtml() + '</div>' +

      // Inline QR code + room code + Convidar + Join room — all in one box
      '<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:14px;padding:10px;margin-bottom:0.6rem;display:flex;gap:12px;">' +
        '<img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(casualUrl) + '&bgcolor=1a1e2e&color=ffffff&margin=4" alt="QR" style="width:112px;height:112px;border-radius:10px;flex-shrink:0;align-self:center;" />' +
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;justify-content:center;">' +
          // Room code + Convidar row
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:0.6rem;font-weight:600;color:#a855f7;text-transform:uppercase;letter-spacing:1px;">' + _t('casual.yourRoom') + '</div>' +
              '<div style="font-size:1.25rem;font-weight:900;letter-spacing:5px;color:#fbbf24;font-family:monospace;">' + window._safeHtml(_sessionRoomCode) + '</div>' +
            '</div>' +
            '<button class="btn btn-cyan btn-micro" onclick="window._casualInvite()" style="font-size:0.7rem;white-space:nowrap;flex-shrink:0;">📲 ' + _t('casual.invite') + '</button>' +
          '</div>' +
          // Join room input row — input left, button right-aligned, same height (44px matches mobile button min-height)
          '<div style="display:flex;gap:4px;align-items:stretch;min-height:44px;">' +
            '<input type="text" id="casual-join-code" placeholder="' + _t('casual.joinRoomPlaceholder') + '" maxlength="6" style="flex:1;min-width:0;min-height:44px;padding:0 8px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--text-bright);font-size:0.8rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;outline:none;font-family:monospace;text-align:center;box-sizing:border-box;" />' +
            '<button class="btn btn-purple btn-micro" onclick="window._casualJoinRoom()" style="font-size:0.72rem;padding:0 14px;white-space:nowrap;flex-shrink:0;">' + _t('casual.join') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // v1.3.32-beta: slot pra "Últimas três partidas" — populado async
      // após render. Helper window._casualLoadLastMatches roda 1× e
      // injeta os 3 botões aqui (ou esconde a seção se não há histórico).
      // v1.3.48-beta: movido para imediatamente abaixo da seção "Sua Sala"
      // (QR + código da sala + entrar na sala de amigo), conforme pedido.
      '<div id="casual-last-matches-slot" style="margin-top:1.2rem;"></div>' +

      // espaço extra no fim da tela
      '<div style="height:0.5rem;"></div>' +
      '';
    // Clear snapshot after use so stale names don't bleed into later re-renders.
    // Placed here (after content.innerHTML) so it runs for BOTH doubles and singles paths.
    _savedPlayerNames = {};

    // Attach drag-and-drop for team building (Doubles — always, regardless of
    // autoShuffle state). Dragging to form a team automatically turns shuffle
    // OFF via _formTeam(), so there is no reason to block the listeners when
    // shuffle is still ON. Without this, the cards look draggable (cursor:grab)
    // but fire no events — the bug reported in v1.3.44-beta.
    // v2.3.75: síncrono (os cards já existem após o innerHTML acima). Antes era
    // setTimeout(30) — deixava uma janela de ~30ms logo após clicar 🔗 (quebrar
    // duplas) em que arrastar não fazia nada, exigindo várias tentativas.
    if (isDoubles) {
      _setupDragDrop();
    }
    // v1.3.32-beta: hidrata "Últimas três partidas"
    setTimeout(function() {
      if (typeof window._casualLoadLastMatches === 'function') window._casualLoadLastMatches();
    }, 200);
    // Ponte do relógio: o lobby (re)renderizou — empurra pro relógio trocar
    // "Aguardando…" por "Iniciar" e refletir nomes/modalidade atuais. Este é o
    // ponto único: o polling do lobby também passa por aqui a cada mudança.
    _watchNotifySetup();
  }

  // v1.8.6-beta: shared card renderer — builds the "Últimas Partidas" grid HTML
  // used by both _casualLoadLastMatches (setup overlay) and
  // _hydrateStatsLastMatchesSlotFn (post-match stats screen).
  // Returns the cardsHtml string (grid content only, no wrapper).
  window._buildCasualMatchCardsHtml = function(matches, cu) {
    function _pname(p, mDoc, isFirstT1) {
      // v4.5.72: identidade-por-uid — o nome de cada jogador resolve do perfil vivo
      // (users/{uid}); o nome gravado no doc da partida só sobra como fallback pra
      // não ficar em branco (e é a identidade legítima do guest sem conta).
      // v2.2.38-beta: REMOVIDO o heurístico "isFirstT1 && createdBy===cu → displayName"
      // — assumia que o 1º do time 1 era o criador, mas com duplas SORTEADAS quase
      // nunca é → trocava o nome de outra pessoa pelo do criador.
      if (p.uid) {
        var _live = (typeof window._nameForUid === 'function') ? window._nameForUid(p.uid) : '';
        if (_live) return _live;
        if (cu && p.uid === cu.uid && cu.displayName) return cu.displayName;
      }
      return p.displayName || p.name || null;
    }
    function _teamBlock(st, players, score, win) {
      var nameColor = win ? '#fff' : 'rgba(255,255,255,0.72)';
      var nameWeight = win ? '700' : '600';
      var realNames = players.filter(function(nm) { return nm != null; });
      var namesHtml = (realNames.length ? realNames : ['—']).map(function(nm) {
        return '<div style="font-size:0.73rem;font-weight:' + nameWeight + ';color:' + nameColor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;line-height:1.3;">' + window._safeHtml(nm) + '</div>';
      }).join('');
      return '<div style="' + st + '">' +
        '<div style="flex:1;overflow:hidden;min-width:0;">' + namesHtml + '</div>' +
        (score ? '<span style="font-weight:800;font-size:0.85rem;color:' + (win ? '#4ade80' : 'var(--text-muted)') + ';font-variant-numeric:tabular-nums;flex-shrink:0;padding-left:4px;align-self:center;">' + window._safeHtml(score) + '</span>' : '') +
      '</div>';
    }

    var cardsHtml = '';
    matches.forEach(function(m) {
      var sport = m.sport || '';
      var dateStr = '';
      var _finTs = m.finishedAt || m.createdAt;
      if (_finTs) {
        var d = (typeof _finTs === 'string') ? new Date(_finTs) : (_finTs && typeof _finTs.toMillis === 'function' ? new Date(_finTs.toMillis()) : null);
        if (d && !isNaN(d.getTime())) {
          var _dd = String(d.getDate()).padStart(2,'0');
          var _mm = String(d.getMonth()+1).padStart(2,'0');
          var _hh = String(d.getHours()).padStart(2,'0');
          var _mn = String(d.getMinutes()).padStart(2,'0');
          dateStr = _dd + '/' + _mm + ' ' + _hh + 'h' + _mn;
        }
      }
      var icon = window._sportIcon ? window._sportIcon(sport) : '🎾';
      var safeRoomCode = (m.roomCode || '').replace(/'/g, "\\'");

      var t1Players = [], t2Players = [];
      if (Array.isArray(m.players)) {
        m.players.forEach(function(p) {
          var isFirstT1 = (p.team !== 2 && t1Players.length === 0);
          var nm = _pname(p, m, isFirstT1);
          if (p.team === 2) t2Players.push(nm);
          else t1Players.push(nm);
        });
      }
      if (!m.isDoubles && t2Players.length === 0 && t1Players.length >= 2)
        t2Players = t1Players.splice(1);

      var winner = (m.result && m.result.winner) || 0;
      var t1Win = (winner === 1), t2Win = (winner === 2), isDecided = (t1Win || t2Win);

      var p1ScoreStr = '', p2ScoreStr = '';
      if (m.result) {
        if (m.result.p1Score != null && m.result.p2Score != null) {
          p1ScoreStr = String(m.result.p1Score);
          p2ScoreStr = String(m.result.p2Score);
        } else if (m.result.sets && m.result.sets.length > 0) {
          p1ScoreStr = m.result.sets.map(function(s) { return s.gamesP1; }).join(' ');
          p2ScoreStr = m.result.sets.map(function(s) { return s.gamesP2; }).join(' ');
        } else if (m.result.summary) {
          var sp = m.result.summary.split(/\s*[×]\s*/);
          if (sp.length === 2) { p1ScoreStr = sp[0].trim(); p2ScoreStr = sp[1].trim(); }
        }
      }

      var wRow = 'padding:5px 6px;border-radius:7px;display:flex;justify-content:space-between;align-items:flex-start;background:rgba(16,185,129,0.18);border-left:3px solid #10b981;';
      var lRow = 'padding:5px 6px;border-radius:7px;display:flex;justify-content:space-between;align-items:flex-start;background:rgba(0,0,0,0.2);border-left:3px solid rgba(255,255,255,0.08);opacity:0.5;';
      var oRow = 'padding:5px 6px;border-radius:7px;display:flex;justify-content:space-between;align-items:flex-start;background:rgba(0,0,0,0.25);border-left:3px solid rgba(99,102,241,0.5);';
      var p1Style = isDecided ? (t1Win ? wRow : lRow) : oRow;
      var p2Style = isDecided ? (t2Win ? wRow : lRow) : oRow;

      cardsHtml +=
        '<button onclick="window._casualOpenPastMatch(\'' + safeRoomCode + '\')" ' +
          'style="display:block;text-align:left;border-radius:12px;padding:9px 9px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:var(--text-bright);cursor:pointer;transition:all 0.15s;font-family:inherit;min-width:0;width:100%;" ' +
          'onmouseover="this.style.background=\'rgba(251,191,36,0.07)\';this.style.borderColor=\'rgba(251,191,36,0.30)\'" ' +
          'onmouseout="this.style.background=\'rgba(255,255,255,0.04)\';this.style.borderColor=\'rgba(255,255,255,0.10)\'">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;border-bottom:1px solid rgba(255,255,255,0.07);padding-bottom:4px;">' +
            '<span style="font-size:0.72rem;">' + icon + '</span>' +
            '<span style="font-size:0.57rem;color:var(--text-muted);font-weight:600;">' + window._safeHtml(dateStr || '—') + '</span>' +
          '</div>' +
          _teamBlock(p1Style, t1Players, p1ScoreStr, t1Win) +
          '<div style="text-align:center;font-size:0.52rem;color:var(--text-muted);font-weight:800;letter-spacing:1.5px;padding:2px 0;">VS</div>' +
          _teamBlock(p2Style, t2Players, p2ScoreStr, t2Win) +
        '</button>';
    });
    return cardsHtml;
  };

  // v1.3.32-beta: carrega últimas 3 partidas casuais finalizadas do user
  // e renderiza 3 botões. Click → abre overlay de live scoring com o
  // liveState salvo (mesma tela de stats que aparece no fim de cada
  // partida). Sem histórico = seção fica oculta.
  // v1.3.55-beta: header alinhado à esq, nomes empilhados, filtro por modalidade
  window._casualLoadLastMatches = async function() {
    var slot = document.getElementById('casual-last-matches-slot');
    if (!slot) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !window.FirestoreDB || typeof window.FirestoreDB.loadRecentCasualMatchesForUser !== 'function') {
      slot.innerHTML = '';
      return;
    }
    try {
      // Load 15 so we have enough after filtering by selected sport
      var allMatches = await window.FirestoreDB.loadRecentCasualMatchesForUser(cu.uid, 15);
      if (!allMatches || allMatches.length === 0) { slot.innerHTML = ''; return; }

      // v1.3.63-beta: só partidas CONCLUÍDAS (vencedor definido) — partidas
      // abandonadas (force-finish sem vencedor, winner===0, ou sem result)
      // são excluídas do histórico e do cache.
      allMatches = allMatches.filter(function(m) {
        var w = m.result && m.result.winner;
        return w === 1 || w === 2;
      });
      if (allMatches.length === 0) { slot.innerHTML = ''; return; }

      // v1.3.62-beta: cache concluded matches so _casualOpenPastMatch
      // can look up any card by roomCode without a Firestore round-trip.
      window._casualPastMatchesCache = {};
      allMatches.forEach(function(m) {
        if (m.roomCode) window._casualPastMatchesCache[m.roomCode] = m;
      });

      // v1.6.105-beta: mostra as 3 últimas partidas independente de modalidade.
      // Filtro por sport era muito restritivo (Rei/Rainha salva doc com sport do
      // momento; se user abre setup com outra modalidade, nunca via o histórico).
      var matches = allMatches.slice(0, 3);
      if (matches.length === 0) { slot.innerHTML = ''; return; }

      var cardsHtml = window._buildCasualMatchCardsHtml(matches, cu);

      slot.innerHTML =
        '<div style="font-size:0.6rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;text-align:left;">📊 Últimas Partidas</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">' + cardsHtml + '</div>' +
        '<div style="text-align:center;font-size:0.54rem;color:var(--text-muted);opacity:0.7;font-style:italic;margin-top:5px;">Toque pra ver as estatísticas</div>';
    } catch (e) {
      window._warn('[Casual] _casualLoadLastMatches err:', e);
      slot.innerHTML = '';
    }
  };

  // v1.3.62-beta: Click handler — abre overlay de live scoring com o
  // liveState final salvo, mostrando as stats do jogo encerrado (mesma
  // tela do fim de partida). Usa cache pre-carregado por _casualLoadLastMatches
  // e chama _openLiveScoring diretamente (sem hash navigation) para que:
  // (a) o overlay de setup NÃO seja descartado pelo router; e
  // (b) a tela de stats apareça imediatamente via opts.initialLiveState
  //     (sem flash de scoring UI em branco).
  // Clicar "Jogar" nas stats desvincula do doc antigo (_viewOnly flag) e
  // inicia novo jogo com os mesmos jogadores. Clicar ✕ fecha as stats
  // e retorna ao overlay de setup.
  window._casualOpenPastMatch = function(roomCode) {
    if (!roomCode) return;
    var match = window._casualPastMatchesCache && window._casualPastMatchesCache[roomCode];
    if (!match || match.status !== 'finished') {
      // Cache miss ou match não-finalizado — fallback via hash
      try { window.location.hash = '#casual/' + roomCode; } catch(e) {}
      return;
    }
    var players = Array.isArray(match.players) ? match.players : [];
    var sportName = match.sport || (typeof _t === 'function' ? _t('casual.title') : 'Partida Casual');
    var p1Names = players.filter(function(p) { return p.team === 1; }).map(function(p) { return p.name; });
    var p2Names = players.filter(function(p) { return p.team === 2; }).map(function(p) { return p.name; });
    try {
      window._openLiveScoring(null, null, {
        casual: true,
        scoring: match.scoring || {},
        p1Name: p1Names.join(' / '),
        p2Name: p2Names.join(' / '),
        title: sportName,
        sportName: sportName,
        isDoubles: match.isDoubles || false,
        casualDocId: match._docId,
        createdBy: match.createdBy,
        roomCode: roomCode,
        players: players,
        viewOnly: true,
        initialLiveState: match.liveState || null
      });
    } catch(e) {
      window._warn('[Casual] _casualOpenPastMatch err:', e);
      try { window.location.hash = '#casual/' + roomCode; } catch(e2) {}
    }
  };

  // Drag-and-drop to form teams: drag player A onto player B → they become Team 1
  // Remaining two automatically become Team 2. Current user always ends in Team 1.
  var _teamDragIdx = null;
  var _teamDragGhost = null;

  function _setupDragDrop() {
    var cards = document.querySelectorAll('[data-casual-idx]');
    if (!cards.length) return;

    // v2.3.75: durante um arraste, neutraliza os <textarea> dos cards
    // (pointer-events:none) pra que o campo editável NÃO capture o gesto de
    // drop. Sem isso, soltar sobre o textarea de um jogador genérico (editável)
    // era intermitente — exigia 2-3 tentativas. Estilo injetado uma única vez.
    if (!document.getElementById('casual-drag-style')) {
      var _ds = document.createElement('style');
      _ds.id = 'casual-drag-style';
      _ds.textContent = '#casual-team-cards.casual-drag-active textarea{pointer-events:none !important;}';
      document.head.appendChild(_ds);
    }
    var _cardsContainer = document.getElementById('casual-team-cards');

    // Helper: form team from two card indices
    function _formTeam(idx1, idx2) {
      if (idx1 === idx2) return;
      // In coach mode no user slot exists — dragged pair is always Team 1.
      // Otherwise: ensure current user (slot 0) is always on Team 1.
      var userInPair = _coachMode ? true : (idx1 === 0 || idx2 === 0);
      _teamAssignments = {};
      if (userInPair) {
        _teamAssignments[idx1] = 1;
        _teamAssignments[idx2] = 1;
        for (var i = 0; i < 4; i++) {
          if (i !== idx1 && i !== idx2) _teamAssignments[i] = 2;
        }
      } else {
        // Dragged pair does NOT include user → they become Team 2, user's side = Team 1
        _teamAssignments[idx1] = 2;
        _teamAssignments[idx2] = 2;
        for (var j = 0; j < 4; j++) {
          if (j !== idx1 && j !== idx2) _teamAssignments[j] = 1;
        }
      }
      // Teams are now fixed — shuffle is redundant and misleading, so flip OFF
      autoShuffle = false;
      // v1.7.5-beta: auto-desativa "Dupla Mista" quando o time formado não é misto
      // (ambos jogadores do Team 1 com o mesmo gênero). Só aplica em duplas com
      // 2M+2F detectados — se não há gênero declarado, não interferimos.
      if (isDoubles) {
        var _t1Gend = [];
        for (var _fti = 0; _fti < 4; _fti++) {
          if (_teamAssignments[_fti] === 1) _t1Gend.push(_resolveSlotGender(_fti));
        }
        // Team 1 é não-misto quando ambos os gêneros são conhecidos E iguais
        if (_t1Gend.length >= 2 && _t1Gend[0] && _t1Gend[1] && _t1Gend[0] === _t1Gend[1]) {
          _mixedDoublesEnabled = false;
        }
      }
      _renderSetup();
      // Broadcast team formation to other players in the lobby
      _syncCasualSetupDebounced();
    }

    // Desktop drag events
    cards.forEach(function(card) {
      card.addEventListener('dragstart', function(e) {
        _teamDragIdx = parseInt(card.getAttribute('data-casual-idx'));
        // setData é OBRIGATÓRIO: um arraste sem dados é rejeitado por campos
        // editáveis (textarea) como alvo de drop no WebKit → drop não dispara.
        try { e.dataTransfer.setData('text/plain', String(_teamDragIdx)); } catch (_e) {}
        e.dataTransfer.effectAllowed = 'move';
        card.style.opacity = '0.4';
        if (_cardsContainer) _cardsContainer.classList.add('casual-drag-active');
      });
      card.addEventListener('dragend', function() {
        card.style.opacity = '1';
        _teamDragIdx = null;
        if (_cardsContainer) _cardsContainer.classList.remove('casual-drag-active');
        document.querySelectorAll('[data-casual-idx]').forEach(function(c) { c.style.transform = ''; });
      });
      card.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (_teamDragIdx === null) return;
        e.dataTransfer.dropEffect = 'move';
        // Resolve o card-alvo por closest() — soltar sobre o textarea, o ícone
        // de gênero ou o avatar ainda destaca/forma a dupla corretamente.
        var tc = (e.target && e.target.closest) ? e.target.closest('[data-casual-idx]') : card;
        if (tc && parseInt(tc.getAttribute('data-casual-idx')) !== _teamDragIdx) tc.style.transform = 'scale(1.05)';
      });
      card.addEventListener('dragleave', function() { card.style.transform = ''; });
      card.addEventListener('drop', function(e) {
        e.preventDefault();
        var tc = (e.target && e.target.closest) ? e.target.closest('[data-casual-idx]') : card;
        if (tc) tc.style.transform = '';
        var srcIdx = _teamDragIdx;
        if (srcIdx === null || isNaN(srcIdx)) {
          try { srcIdx = parseInt(e.dataTransfer.getData('text/plain')); } catch (_e) {}
        }
        _teamDragIdx = null;
        if (_cardsContainer) _cardsContainer.classList.remove('casual-drag-active');
        if (!tc || srcIdx === null || isNaN(srcIdx)) return;
        var targetIdx = parseInt(tc.getAttribute('data-casual-idx'));
        if (isNaN(targetIdx) || targetIdx === srcIdx) return;
        _formTeam(srcIdx, targetIdx);
      });
    });

    // Touch drag support (mobile)
    var _touchIdx = null;
    cards.forEach(function(card) {
      card.addEventListener('touchstart', function(e) {
        // Textarea editável sempre recebe foco — drag nunca começa ao tocar nela.
        if (e.target && e.target.tagName === 'TEXTAREA' && !e.target.readOnly) {
          _touchIdx = null;
          return;
        }
        // Botão (ex: ícone de gênero) deixa o click disparar normalmente.
        var _bt = e.target;
        while (_bt && _bt !== card) {
          if (_bt.tagName === 'BUTTON') { _touchIdx = null; return; }
          _bt = _bt.parentElement;
        }
        // Em modo técnico, drag só começa pelo handle ⠿ (data-drag-handle).
        // Qualquer outro toque no card (ex: padding) não inicia drag — garante
        // que a textarea possa ser tocada sem conflito em toda a área do card.
        if (_coachMode) {
          var _hdl = e.target;
          var _onHandle = false;
          while (_hdl && _hdl !== card) {
            if (_hdl.getAttribute && _hdl.getAttribute('data-drag-handle')) { _onHandle = true; break; }
            _hdl = _hdl.parentElement;
          }
          if (!_onHandle) { _touchIdx = null; return; }
        }
        // preventDefault impede o browser de focar elementos dentro do card
        // antes do gesto de drag começar. Deve ser {passive:false} para funcionar.
        e.preventDefault();
        _touchIdx = parseInt(card.getAttribute('data-casual-idx'));
        card.style.opacity = '0.6';
      }, { passive: false });
      card.addEventListener('touchmove', function(e) {
        if (_touchIdx === null) return;
        e.preventDefault();
        if (!_teamDragGhost) {
          _teamDragGhost = card.cloneNode(true);
          _teamDragGhost.style.cssText = 'position:fixed;z-index:200000;opacity:0.85;pointer-events:none;width:' + card.offsetWidth + 'px;box-shadow:0 8px 30px rgba(0,0,0,0.5);border-radius:12px;';
          document.body.appendChild(_teamDragGhost);
        }
        var t = e.touches[0];
        _teamDragGhost.style.left = (t.clientX - 40) + 'px';
        _teamDragGhost.style.top = (t.clientY - 20) + 'px';
        // Highlight card under finger
        document.querySelectorAll('[data-casual-idx]').forEach(function(c) { c.style.transform = ''; });
        var el = document.elementFromPoint(t.clientX, t.clientY);
        var target = el;
        while (target) {
          if (target.dataset && target.dataset.casualIdx !== undefined) {
            if (parseInt(target.dataset.casualIdx) !== _touchIdx) target.style.transform = 'scale(1.05)';
            break;
          }
          target = target.parentElement;
        }
      }, { passive: false });
      card.addEventListener('touchend', function(e) {
        card.style.opacity = '1';
        if (_teamDragGhost) { _teamDragGhost.remove(); _teamDragGhost = null; }
        document.querySelectorAll('[data-casual-idx]').forEach(function(c) { c.style.transform = ''; });
        if (_touchIdx === null) return;
        var t = e.changedTouches[0];
        var el = document.elementFromPoint(t.clientX, t.clientY);
        var target = el;
        while (target) {
          if (target.dataset && target.dataset.casualIdx !== undefined) {
            var targetIdx = parseInt(target.dataset.casualIdx);
            if (targetIdx !== _touchIdx) {
              var srcIdx = _touchIdx;
              _touchIdx = null;
              _formTeam(srcIdx, targetIdx);
              return;
            }
            break;
          }
          target = target.parentElement;
        }
        _touchIdx = null;
      });
    });

    // After render: autosize textareas and equalize card heights
    setTimeout(function() {
      var tas = document.querySelectorAll('#casual-team-cards textarea');
      for (var ti = 0; ti < tas.length; ti++) {
        if (window._autosizeCasualInput) window._autosizeCasualInput(tas[ti]);
      }
      if (window._equalizeCasualCards) window._equalizeCasualCards();
    }, 0);
  }

  // Auto-resize a casual-setup textarea to fit its content (wraps long names)
  window._autosizeCasualInput = function(el) {
    if (!el) return;
    el.style.height = 'auto';
    var h = el.scrollHeight;
    if (h > 0) el.style.height = h + 'px';
  };

  // Keep all 4 casual-setup player cards at the same (tallest) height for visual consistency
  window._equalizeCasualCards = function() {
    var cards = document.querySelectorAll('#casual-team-cards [data-casual-idx]');
    if (!cards.length) return;
    for (var i = 0; i < cards.length; i++) cards[i].style.minHeight = '';
    var max = 0;
    for (var j = 0; j < cards.length; j++) {
      var h = cards[j].getBoundingClientRect().height;
      if (h > max) max = h;
    }
    if (max > 0) {
      var px = Math.ceil(max) + 'px';
      for (var k = 0; k < cards.length; k++) cards[k].style.minHeight = px;
    }
  };

  // Reset team assignments — teams are no longer fixed, so shuffle flips back ON
  window._casualResetTeams = function() {
    _teamAssignments = {};
    autoShuffle = true;
    _renderSetup();
    _syncCasualSetupDebounced();
  };

  // v1.3.50-beta: chamado por _liveScoreUnpair para voltar à tela de setup
  // mantendo os mesmos jogadores. A casual-match-overlay é removida quando
  // _casualStart() é chamado (para dar lugar ao live-scoring-overlay), então
  // precisamos re-appendá-la ao body. A referência `overlay` ainda existe no
  // closure — só foi desanexada do DOM.
  window._casualReopenSetup = function(opts) {
    var keepSession = !!(opts && opts.keepSession);
    // isInitiator=true: quem clicou Desparear/Jogar Novamente (host).
    // isInitiator=false: demais dispositivos detectaram status:'setup' via
    // Firestore listener e entraram aqui automaticamente.
    var isInitiator = !!(opts && opts.isInitiator);
    // v1.9.72: autoStart=true → "Jogar" solo: renderiza o setup oculto e dispara
    // _casualStart() imediatamente (nova partida direto, sem o usuário ver o
    // setup). autoShuffle do opts honra o toggle "Re-sortear".
    var autoStart = !!(opts && opts.autoStart);
    // Zera times para formar novos pares livremente
    _teamAssignments = {};
    autoShuffle = (autoStart && opts && typeof opts.autoShuffle === 'boolean') ? opts.autoShuffle : true;
    if (!keepSession) {
      // Reseta sessão: próximo Iniciar cria novo doc no Firestore
      _sessionDocId = null;
      _sessionReopened = false;
      _myReadyClicked = false; // v2.2.10-beta
      _startInitiated = false; // v2.2.10-beta
      // v1.6.50-beta: para o polling de refresh — sem isso, o interval continua
      // lendo o Firestore com _sessionRoomCode antigo e sobrescreve os nomes
      // digitados nos slots com "Jogador X, Y, Z" após alguns segundos.
      if (_setupRefreshInterval) { clearInterval(_setupRefreshInterval); _setupRefreshInterval = null; }
    } else {
      // v1.6.62-beta: keepSession=true — preserva _sessionDocId para que o
      // polling continue lendo do doc correto, mas marca que ao Iniciar a
      // próxima partida deve criar um novo doc (em vez de reactivar o antigo
      // com result stale, que faria _openLiveScoring pular direto às stats).
      _sessionReopened = true;
      _myReadyClicked = false; // v2.2.10-beta
      _startInitiated = false; // v2.2.10-beta
    }
    // Re-appenda overlay (ainda em memória no closure)
    if (!document.getElementById('casual-match-overlay')) {
      // v1.9.72: em autoStart, mantém o overlay invisível — o usuário nunca vê
      // a tela de setup; _casualStart() vai removê-lo e abrir o placar. Em
      // reopen normal, SEMPRE restaura a visibilidade (o mesmo elemento pode ter
      // ficado 'hidden' de um autoStart anterior).
      try { overlay.style.visibility = autoStart ? 'hidden' : ''; } catch(e) {}
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
      if (_metaVp) {
        // v4.3.23: preserva viewport-fit=cover (idem abertura do setup) — sem ele
        // o WKWebView reflowa e env(safe-area-inset-*) zera. Ver a nota no append
        // original do overlay.
        _metaVp.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
      }
      // Re-observa para restaurar scroll/viewport quando fechar
      try { _ovObs.observe(document.body, { childList: true }); } catch(e) {}
    }
    // Renderiza setup com os jogadores já presentes
    _renderSetup();
    if (autoStart) {
      // v1.9.72: dispara a nova partida imediatamente (mesmo caminho do botão
      // Iniciar), sem mostrar o setup. Restaura visibilidade se algo falhar.
      setTimeout(function() {
        try {
          if (typeof window._casualStart === 'function') { window._casualStart(); }
          else { try { overlay.style.visibility = ''; } catch(e) {} }
        } catch(e) {
          try { overlay.style.visibility = ''; } catch(_e) {}
          window._warn && window._warn('[Casual] autoStart falhou:', e);
        }
      }, 0);
      return;
    }
    if (keepSession) {
      if (isInitiator) {
        // Iniciador (host) escreve gêneros/times atuais no Firestore logo que
        // volta ao setup. Debounce 500ms. Polling começa com delay de 1500ms
        // para garantir que a escrita chegou ao Firestore antes da 1ª leitura
        // — evita que o poll leia dados stale e sobrescreva _slotGenders local.
        _syncCasualSetupDebounced();
        setTimeout(function() { _startSetupRefresh(); }, 1500);
      } else {
        // Não-iniciador: NÃO escreve no Firestore (evita sobrescrever gêneros
        // do host com dados locais potencialmente desatualizados). Apenas lê
        // via polling, com delay de 2000ms para o host ter escrito primeiro.
        setTimeout(function() { _startSetupRefresh(); }, 2000);
      }
    }
    // Hidrata "Últimas partidas" (pode ter nova partida agora)
    setTimeout(function() {
      if (typeof window._casualLoadLastMatches === 'function') window._casualLoadLastMatches();
    }, 300);
  };

  // Track if config screen is open
  var _configOpen = false;
  // Snapshot of player name inputs saved before config screen replaces the DOM,
  // so _renderSetup() can restore them when returning from config.
  // Keyed by slot index 0-3. Cleared after use in _renderSetup().
  var _savedPlayerNames = {};

  // Persist last-used sport + doubles toggle so the next casual match opens with the same defaults
  function _persistLastCasualChoice() {
    var _last = { sport: selectedSport, isDoubles: !!isDoubles };
    try { localStorage.setItem('scoreplace_casual_last', JSON.stringify(_last)); } catch(e) {}
    // Grava TAMBÉM no perfil (fonte de verdade). Sem isto, a escolha vive só no
    // localStorage e some quando o iOS limpa o storage. Espelha _saveLiveScorePrefs.
    var _cu = window.AppStore && window.AppStore.currentUser;
    if (_cu) _cu.casualLast = _last;
    if (_cu && _cu.uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
      try { window.FirestoreDB.saveUserProfile(_cu.uid, { casualLast: _last }).catch(function(){}); } catch(e) {}
    }
  }

  // Sport selection handler — also resets doubles default
  window._casualSelectSport = function(key) {
    selectedSport = key;
    var sp = sports.find(function(s) { return s.key === key; });
    if (sp) isDoubles = sp.defaultDoubles;
    _persistLastCasualChoice();
    if (_configOpen) window._casualOpenConfig();
    else _renderSetup();
  };

  // Doubles toggle
  window._casualSetDoubles = function(val) {
    isDoubles = val;
    _persistLastCasualChoice();
    if (_configOpen) window._casualOpenConfig();
    else _renderSetup();
    _syncCasualSetupDebounced();
  };

  // Shuffle toggle. Turning ON breaks any formed teams so the start-of-match
  // shuffle has a clean slate. Turning OFF just stores the preference — teams
  // still need to be formed via drag-and-drop before Iniciar.
  window._casualSetShuffle = function(val) {
    autoShuffle = !!val;
    if (val) _teamAssignments = {};
    _renderSetup();
    _syncCasualSetupDebounced();
  };

  // Mixed-doubles toggle. Only meaningful when we detect 2M+2F in the lobby;
  // when ON, shuffle at match-start assigns 1M+1F to each team.
  window._casualSetMixedDoubles = function(val) {
    _mixedDoublesEnabled = !!val;
    _renderSetup();
    _syncCasualSetupDebounced();
  };

  // v1.6.11-beta: Rei/Rainha toggle handler
  window._casualSetReiRainha = function(val) {
    _reiRainhaMode = !!val;
    _renderSetup();
  };

  window._casualToggleCoachMode = function(checked) {
    var activating = !!checked && !_coachMode;
    _coachMode = !!checked;
    _slotLinkedUid = [null, null, null, null]; // v1.6.51: limpa vínculos ao trocar modo
    if (activating) {
      // Limpa nome e gênero de todos os slots — todos ficam livres para edição
      var _coachInputIds = isDoubles
        ? ['casual-p1a-name', 'casual-p1b-name', 'casual-p2a-name', 'casual-p2b-name']
        : ['casual-p1-name', 'casual-p2-name'];
      for (var _cii = 0; _cii < _coachInputIds.length; _cii++) {
        var _cel = document.getElementById(_coachInputIds[_cii]);
        if (_cel) _cel.value = '';
        delete _slotGenders[_cii];
      }
    }
    _renderSetup();
  };

  // v1.6.51-beta: autocomplete de amigos nos slots editáveis.
  // Chamado a cada keystroke (com debounce 220ms). Filtra amigos via
  // _suggestFriendsForGuestName e renderiza dropdown abaixo do card.
  window._casualSlotAutocomplete = function(inputEl, ci) {
    if (_acTimerSlot[ci]) clearTimeout(_acTimerSlot[ci]);
    _acTimerSlot[ci] = setTimeout(function() {
      _acTimerSlot[ci] = null;
      var val = (inputEl.value || '').trim();
      // Encontra o wrapper (data-casual-ac-wrapper)
      var wrapper = null;
      var p = inputEl.parentElement;
      while (p) {
        if (p.getAttribute && p.getAttribute('data-casual-ac-wrapper') !== null) { wrapper = p; break; }
        p = p.parentElement;
      }
      if (!wrapper) return;
      // Remove dropdown existente
      var existing = wrapper.querySelector('[data-casual-ac-dropdown]');
      if (existing) existing.parentNode.removeChild(existing);
      if (val.length < 2) return;
      // Exclui uids já em outros slots ou já no lobby
      var excludeUids = [];
      for (var _ei = 0; _ei < _slotLinkedUid.length; _ei++) {
        if (_ei !== ci && _slotLinkedUid[_ei]) excludeUids.push(_slotLinkedUid[_ei]);
      }
      for (var _li = 0; _li < (_lobbyParticipants || []).length; _li++) {
        if (_lobbyParticipants[_li] && _lobbyParticipants[_li].uid) excludeUids.push(_lobbyParticipants[_li].uid);
      }
      window._loadFriendProfilesCached && window._loadFriendProfilesCached().then(function() {
        var sugs = window._suggestFriendsForGuestName ? window._suggestFriendsForGuestName(val, excludeUids) : [];
        if (!sugs || sugs.length === 0) return;
        var dd = document.createElement('div');
        dd.setAttribute('data-casual-ac-dropdown', String(ci));
        dd.style.cssText = 'position:absolute;left:0;right:0;top:calc(100% + 2px);z-index:9999;' +
          'background:var(--bg-card,#1e293b);border:1px solid rgba(99,102,241,0.4);' +
          'border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.45);';
        sugs.slice(0, 5).forEach(function(s) {
          var item = document.createElement('div');
          item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;transition:background 0.12s;font-size:0.84rem;';
          var initLetter = (s.displayName || '?')[0].toUpperCase();
          var avatarHtml = s.photoURL
            ? '<img src="' + window._safeHtml(s.photoURL) + '" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'">'
            : '<div style="width:26px;height:26px;border-radius:50%;background:rgba(99,102,241,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.7rem;color:#a5b4fc;">' + window._safeHtml(initLetter) + '</div>';
          item.innerHTML = avatarHtml + '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window._safeHtml(s.displayName || '') + '</span>';
          item.onmouseover = function() { this.style.background = 'rgba(99,102,241,0.15)'; };
          item.onmouseout = function() { this.style.background = ''; };
          item.onmousedown = function(e) { e.preventDefault(); }; // evita blur antes de onclick
          (function(friend) {
            item.onclick = function() {
              window._casualSelectSlotFriend(ci, friend.uid, friend.displayName, friend.photoURL || null, friend.gender || null);
            };
          })(s);
          dd.appendChild(item);
        });
        wrapper.appendChild(dd);
        // Fecha dropdown ao perder foco
        var _onBlur = function() {
          setTimeout(function() {
            var d = wrapper.querySelector('[data-casual-ac-dropdown]');
            if (d) d.parentNode.removeChild(d);
          }, 180);
          inputEl.removeEventListener('blur', _onBlur);
        };
        inputEl.addEventListener('blur', _onBlur);
      });
    }, 220);
  };

  // Seleciona um amigo para o slot ci: preenche o nome, guarda uid, re-renderiza.
  window._casualSelectSlotFriend = function(ci, friendUid, friendName, friendPhotoURL, friendGender) {
    _slotLinkedUid[ci] = friendUid || null;
    var ids = isDoubles
      ? ['casual-p1a-name','casual-p1b-name','casual-p2a-name','casual-p2b-name']
      : ['casual-p1-name','casual-p2-name'];
    var inputId = ids[ci];
    var inp = inputId ? document.getElementById(inputId) : null;
    if (inp) {
      inp.value = friendName || '';
      if (window._autosizeCasualInput) window._autosizeCasualInput(inp);
    }
    // Garante que o perfil está no cache (usa os dados do dropdown como fallback imediato)
    if (friendUid) {
      if (!window._friendProfilesCache[friendUid]) {
        window._friendProfilesCache[friendUid] = {
          uid: friendUid,
          displayName: friendName || '',
          photoURL: friendPhotoURL || '',
          gender: friendGender || ''
        };
      }
    }
    // Auto-preenche gênero: prioriza parâmetro > cache
    var _fg = friendGender;
    if (!_fg && friendUid && window._friendProfilesCache && window._friendProfilesCache[friendUid]) {
      _fg = window._friendProfilesCache[friendUid].gender;
    }
    if (_fg) _slotGenders[ci] = _fg;
    // Remove dropdown imediatamente
    var wrapper = document.querySelector('[data-casual-ac-wrapper="' + ci + '"]');
    if (wrapper) {
      var dd = wrapper.querySelector('[data-casual-ac-dropdown]');
      if (dd) dd.parentNode.removeChild(dd);
    }
    if (window._syncCasualSetupFromInput) window._syncCasualSetupFromInput();
    _renderSetup();
  };

  // Remove vínculo de amigo do slot ci.
  window._casualUnlinkSlot = function(ci) {
    _slotLinkedUid[ci] = null;
    _renderSetup();
  };

  // v1.6.26-beta: picker de gênero por slot. Abre dialog minimal com
  // Masculino/Feminino. Propaga via _syncCasualSetupDebounced.
  window._casualSetSlotGender = function(slotIdx) {
    var current = _resolveSlotGender(slotIdx);
    var options = [
      { value: 'masculino', label: '♂  Masculino', color: '#60a5fa' },
      { value: 'feminino',  label: '♀  Feminino',  color: '#f472b6' }
    ];
    var ov = document.createElement('div');
    ov.id = '_gender-picker-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:100010;display:flex;align-items:center;justify-content:center;padding:1rem;';
    var btnsHtml = options.map(function(o) {
      var isCur = current === o.value || (current == null && o.value == null);
      return '<button data-gv="' + (o.value === null ? '__null__' : o.value) + '" ' +
        'style="display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:12px;background:' +
        (isCur ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)') + ';' +
        'border:1px solid ' + (isCur ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)') + ';' +
        'color:' + o.color + ';font-size:1rem;font-weight:700;cursor:pointer;text-align:left;width:100%;">' +
        o.label + '</button>';
    }).join('');
    ov.innerHTML =
      '<div style="background:var(--bg-darker,#0f172a);border-radius:18px;padding:22px;max-width:340px;width:100%;">' +
        '<div style="font-size:1.05rem;font-weight:800;color:#fff;margin-bottom:14px;text-align:center;">Gênero do jogador</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">' + btnsHtml + '</div>' +
        '<button id="_gender-picker-cancel" style="width:100%;padding:12px;border-radius:10px;background:transparent;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);font-size:0.88rem;font-weight:600;cursor:pointer;">Cancelar</button>' +
      '</div>';
    document.body.appendChild(ov);
    function _close() { try { ov.remove(); } catch(e) {} }
    ov.addEventListener('click', function(e) {
      if (e.target === ov) _close();
    });
    document.getElementById('_gender-picker-cancel').onclick = _close;
    ov.querySelectorAll('[data-gv]').forEach(function(btn) {
      btn.onclick = function() {
        var v = btn.getAttribute('data-gv');
        var _gv = (v === '__null__') ? null : v;
        // v2.2.28-beta: se o slot é do PRÓPRIO usuário logado, marcar o gênero
        // aqui ALIMENTA o perfil global dele (não é override por partida). Assim
        // vira autoritativo e propaga via participantGenders pros demais — e
        // ninguém mais consegue re-marcar (vira somente-leitura).
        var _lpG = _lobbyParticipants[slotIdx];
        var _cuG = window.AppStore && window.AppStore.currentUser;
        var _isOwnSlot = !!(_lpG && _cuG && _lpG.uid && _cuG.uid && _lpG.uid === _cuG.uid);
        if (_isOwnSlot && _gv) {
          _cuG.gender = _gv;
          _participantGenders[_cuG.uid] = _gv;
          try { delete _slotGenders[slotIdx]; } catch (e) {} // perfil manda; limpa override
          if (window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
            window.FirestoreDB.saveUserProfile(_cuG.uid, { gender: _gv }).catch(function () {});
          }
          _publishMyGender();
        } else {
          // Guest digitado ou usuário sem perfil → override manual por partida.
          _slotGenders[slotIdx] = _gv;
        }
        _close();
        _renderSetup();
        _syncCasualSetupDebounced();
      };
    });
  };

  // Join a friend's room by code
  window._casualJoinRoom = function() {
    var inp = document.getElementById('casual-join-code');
    if (!inp) return;
    var code = (inp.value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (code.length >= 4) {
      var ov = document.getElementById('casual-match-overlay');
      if (ov) ov.remove();
      _watchSetupTeardown(); // entrando na sala de outro — este lobby morreu
      window.location.hash = '#casual/' + code;
    } else {
      inp.style.borderColor = '#ef4444';
      setTimeout(function() { inp.style.borderColor = 'rgba(255,255,255,0.12)'; }, 1000);
    }
  };

  // Config gear handler — opens inline config editor
  window._casualOpenConfig = function() {
    // Snapshot player names before overwriting the DOM so _renderSetup()
    // can restore them when the user navigates back from config.
    _savedPlayerNames = {};
    var _snapIds = ['casual-p1a-name', 'casual-p1b-name', 'casual-p2a-name', 'casual-p2b-name',
                    'casual-p1-name', 'casual-p2-name'];
    _snapIds.forEach(function(id, i) {
      var el = document.getElementById(id);
      if (el) _savedPlayerNames[i] = el.value;
    });
    _configOpen = true;
    // v4.0.4: na tela de Configuração, esconde o "Iniciar" do topo (só faz
    // sentido no lobby). Reaparece ao voltar pro lobby (_casualCloseConfig).
    var _sbHide = document.getElementById('casual-header-start');
    if (_sbHide) _sbHide.style.display = 'none';
    var cfg = _getConfig();
    var content = document.getElementById('casual-setup-content');
    if (!content) return;

    var tr = cfg.tieRule || 'ask';

    // Sport buttons for config screen
    var cfgSportBtns = '';
    for (var csi = 0; csi < sports.length; csi++) {
      var csp = sports[csi];
      var csActive = csp.key === selectedSport;
      cfgSportBtns += '<button onclick="window._casualSelectSport(\'' + csp.key.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')" style="' +
        'padding:8px 14px;border-radius:10px;font-size:0.82rem;cursor:pointer;transition:all 0.15s;white-space:nowrap;' +
        'border:2px solid ' + (csActive ? '#fbbf24' : 'rgba(255,255,255,0.12)') + ';' +
        'background:' + (csActive ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)') + ';' +
        'color:' + (csActive ? '#fbbf24' : 'var(--text-muted)') + ';font-weight:' + (csActive ? '700' : '500') + ';' +
        '">' + csp.icon + ' ' + csp.label + '</button>';
    }

    content.innerHTML =
      '<div style="margin-bottom:1rem;">' +
        // v4.0.4: "Voltar" interno removido — o Voltar do topo (back-header) já
        // volta pro lobby quando _configOpen está ativo. Dois Voltar confundiam.
        '<div style="display:flex;align-items:center;margin-bottom:1rem;">' +
          '<div style="font-size:0.9rem;font-weight:700;color:var(--text-bright);">⚙️ ' + _t('casual.config') + '</div>' +
        '</div>' +

        // Sport picker
        '<div style="margin-bottom:1rem;">' +
          '<label style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;display:block;">' + _t('casual.sport') + '</label>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + cfgSportBtns + '</div>' +
        '</div>' +

        // Dupla toggle
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:12px;background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.12);margin-bottom:1rem;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:1rem;">' + (isDoubles ? '👥' : '👤') + '</span>' +
            '<span style="font-size:0.85rem;font-weight:700;color:var(--text-bright);">' + (isDoubles ? _t('casual.doubles') : _t('casual.single')) + '</span>' +
          '</div>' +
          '<label class="toggle-switch" style="--toggle-on-bg:#38bdf8;"><input type="checkbox" ' + (isDoubles ? 'checked' : '') + ' onchange="window._casualSetDoubles(this.checked)"><span class="toggle-slider"></span></label>' +
        '</div>' +

        // GSM options
        '<div style="display:flex;flex-direction:column;gap:12px;">' +
          // Sets to win
          '<div style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span style="font-size:0.82rem;color:var(--text-bright);">' + _t('casual.setsToWin') + '</span>' +
            '<div style="display:flex;gap:4px;">' +
              [1,2,3].map(function(n) {
                var active = (cfg.setsToWin || 1) === n;
                return '<button onclick="window._casualSetCfg(\'setsToWin\',' + n + ')" style="width:36px;height:36px;border-radius:8px;font-size:0.85rem;font-weight:700;cursor:pointer;border:1px solid ' + (active ? '#818cf8' : 'rgba(255,255,255,0.12)') + ';background:' + (active ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)') + ';color:' + (active ? '#818cf8' : 'var(--text-muted)') + ';">' + n + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          // Games per set
          '<div style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span style="font-size:0.82rem;color:var(--text-bright);">' + _t('casual.gamesPerSet') + '</span>' +
            '<div style="display:flex;gap:4px;">' +
              [4,6,8,11].map(function(n) {
                var active = (cfg.gamesPerSet || 6) === n;
                return '<button onclick="window._casualSetCfg(\'gamesPerSet\',' + n + ')" style="width:36px;height:36px;border-radius:8px;font-size:0.85rem;font-weight:700;cursor:pointer;border:1px solid ' + (active ? '#818cf8' : 'rgba(255,255,255,0.12)') + ';background:' + (active ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)') + ';color:' + (active ? '#818cf8' : 'var(--text-muted)') + ';">' + n + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          // Counting type
          '<div style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span style="font-size:0.82rem;color:var(--text-bright);">' + _t('casual.counting') + '</span>' +
            '<div style="display:flex;gap:4px;">' +
              '<button onclick="window._casualSetCfg(\'countingType\',\'tennis\')" style="padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:600;cursor:pointer;border:1px solid ' + (cfg.countingType === 'tennis' ? '#818cf8' : 'rgba(255,255,255,0.12)') + ';background:' + (cfg.countingType === 'tennis' ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)') + ';color:' + (cfg.countingType === 'tennis' ? '#818cf8' : 'var(--text-muted)') + ';">15-30-40</button>' +
              '<button onclick="window._casualSetCfg(\'countingType\',\'numeric\')" style="padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:600;cursor:pointer;border:1px solid ' + (cfg.countingType !== 'tennis' ? '#818cf8' : 'rgba(255,255,255,0.12)') + ';background:' + (cfg.countingType !== 'tennis' ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)') + ';color:' + (cfg.countingType !== 'tennis' ? '#818cf8' : 'var(--text-muted)') + ';">1-2-3</button>' +
            '</div>' +
          '</div>' +
          // Vantagem (AD), ganhar-por-2 e o comportamento de EMPATE (tie-break) são REGRA DA
          // MODALIDADE — SEM toggle aqui. A decisão de tie-break é tomada EM QUADRA, no botão do
          // placar ao vivo quando dá empate (5-5 / 6-6 / 7-7…). Não se decide antes na config.
        '</div>' +
      '</div>';
  };

  // Temp config object for editing
  var _tempCfg = null;

  window._casualSetCfg = function(key, value) {
    if (!_tempCfg) _tempCfg = Object.assign({}, _getConfig());
    _tempCfg[key] = value;
    _saveTempCfg();
    window._casualOpenConfig();
  };

  function _saveTempCfg() {
    if (!_tempCfg) return;
    try {
      var prefs = _readCasualPrefs();
      prefs[selectedSport] = _tempCfg;
      _writeCasualPrefs(prefs);
    } catch(e) {}
  }

  window._casualCloseConfig = function() {
    _configOpen = false;
    _tempCfg = null;
    // v4.0.4: voltou pro lobby → "Iniciar" do topo reaparece.
    var _sbShow = document.getElementById('casual-header-start');
    if (_sbShow) _sbShow.style.display = '';
    _renderSetup();
  };

  // Generate a 6-char alphanumeric room code
  function _generateRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }

  // Build players array from form inputs
  // v1.6.22-beta: REWRITE. Pra slots de logados, _lobbyParticipants é
  // source of truth — não os inputs do DOM. Inputs eram corruptíveis por
  // race conditions (sync polling, touch focus, DOM duplicado em re-render
  // parcial), causando bugs reportados como "Nelson nos 2 times" onde
  // todos os slots viraram o mesmo nome.
  // Inputs editáveis só pra slots SEM logado (guests digitados).
  // Diagnóstico exposto em window._lastBuildPlayers pra debug.
  function _buildPlayers() {
    var players = [];
    var cu = window.AppStore && window.AppStore.currentUser;
    var inputIds = ['casual-p1a-name', 'casual-p1b-name', 'casual-p2a-name', 'casual-p2b-name'];
    if (isDoubles) {
      var resolved = [null, null, null, null];
      for (var slotIdx = 0; slotIdx < 4; slotIdx++) {
        var lp = _lobbyParticipants[slotIdx];
        // Coach mode: técnico não joga — ignorar lobby e sempre ler do input.
        // Sem _coachMode: participante logado (uid+displayName) é source of truth.
        if (!_coachMode && lp && lp.uid && lp.displayName) {
          // Slot com participante logado — _lobbyParticipants é source of truth.
          resolved[slotIdx] = {
            name: lp.displayName,
            uid: lp.uid,
            photoURL: lp.photoURL || null,
            source: 'lobby'
          };
        } else {
          // Slot vazio ou coach mode — lê o input (nome digitado pelo técnico/org)
          var inp = document.getElementById(inputIds[slotIdx]);
          var v = inp ? (inp.value || '').trim() : '';
          if (!v) v = 'Jogador ' + (slotIdx + 1);
          // v1.6.51: uid de amigo vinculado via autocomplete
          var _lUid = _slotLinkedUid[slotIdx] || null;
          var _lProf = _lUid && window._friendProfilesCache ? window._friendProfilesCache[_lUid] : null;
          resolved[slotIdx] = {
            name: v,
            uid: _lUid,
            photoURL: _lProf ? (_lProf.photoURL || null) : null,
            source: _lUid ? 'linked' : 'input'
          };
        }
      }
      var hasTeamDnD = _teamAssignments[0] !== undefined;
      for (var pi = 0; pi < 4; pi++) {
        players.push({
          slot: pi,
          name: resolved[pi].name,
          team: hasTeamDnD ? _teamAssignments[pi] : (pi < 2 ? 1 : 2),
          uid: resolved[pi].uid,
          photoURL: resolved[pi].photoURL,
          gender: _resolveSlotGender(pi) || null
        });
      }
    } else {
      // Singles
      var lp0 = _lobbyParticipants[0];
      var lp1 = _lobbyParticipants[1];
      var n1, u1, ph1;
      var n2, u2, ph2;
      if (!_coachMode && lp0 && lp0.uid && lp0.displayName) {
        n1 = lp0.displayName;
        u1 = lp0.uid; ph1 = lp0.photoURL || null;
      } else {
        var inp1 = document.getElementById('casual-p1-name');
        n1 = (inp1 && inp1.value ? inp1.value.trim() : '') || 'Jogador 1';
        // v1.6.51: amigo vinculado tem prioridade sobre uid do técnico
        var _s0Uid = _slotLinkedUid[0] || null;
        var _s0Prof = _s0Uid && window._friendProfilesCache ? window._friendProfilesCache[_s0Uid] : null;
        u1 = _s0Uid || ((!_coachMode && cu && cu.uid) || null);
        ph1 = (_s0Prof ? (_s0Prof.photoURL || null) : null) || ((!_coachMode && cu && cu.photoURL) || null);
      }
      if (!_coachMode && lp1 && lp1.uid && lp1.displayName) {
        n2 = lp1.displayName;
        u2 = lp1.uid; ph2 = lp1.photoURL || null;
      } else {
        var inp2 = document.getElementById('casual-p2-name');
        n2 = (inp2 && inp2.value ? inp2.value.trim() : '') || 'Jogador 2';
        // v1.6.51: amigo vinculado no slot 1
        var _s1Uid = _slotLinkedUid[1] || null;
        var _s1Prof = _s1Uid && window._friendProfilesCache ? window._friendProfilesCache[_s1Uid] : null;
        u2 = _s1Uid || null;
        ph2 = _s1Prof ? (_s1Prof.photoURL || null) : null;
      }
      players.push({ slot: 0, name: n1, displayName: n1, team: 1, uid: u1, photoURL: ph1, gender: _resolveSlotGender(0) || null });
      players.push({ slot: 1, name: n2, displayName: n2, team: 2, uid: u2, photoURL: ph2, gender: _resolveSlotGender(1) || null });
    }
    // Diagnostic — permite debug remoto sem DevTools no celular
    try {
      var domInputValues = inputIds.map(function(id) {
        var e = document.getElementById(id);
        return e ? e.value : null;
      });
      window._lastBuildPlayers = {
        at: new Date().toISOString(),
        cu: cu ? { uid: cu.uid, displayName: cu.displayName } : null,
        isDoubles: isDoubles,
        lobbyParticipants: (_lobbyParticipants || []).map(function(p) {
          return p ? { uid: p.uid, displayName: p.displayName } : null;
        }),
        domInputValues: domInputValues,
        output: players.map(function(p) {
          return { slot: p.slot, name: p.name, team: p.team, uid: p.uid };
        })
      };
    } catch (_e) {}
    return players;
  }

  // Room code state for this session (persists across invite/start).
  // When restoring after a SW-update reload, reuse the existing room code
  // and docId so we don't create a duplicate Firestore doc.
  var _sessionRoomCode = (restoreOpts && restoreOpts.roomCode) || _generateRoomCode();
  var _sessionDocId = (restoreOpts && restoreOpts.docId) || null;

  // v2.2.10-beta: controle do fluxo "ready" — jogo só começa com ≥2 prontos
  var _myReadyClicked = false;   // este cliente já clicou em Iniciar
  var _startInitiated = false;   // _casualStart já foi disparado (evita duplo-trigger)

  function _checkAndStart() {
    if (_startInitiated) return;
    _startInitiated = true;
    window._casualStart();
  }

  // True when the organizer has explicitly paired the 4 players into teams
  // (not autoShuffle, all 4 slots assigned via drag-and-drop). Guests use this
  // to decide whether to show the "Times Formados" preview in the lobby.
  function _isTeamsFormed() {
    return !!(isDoubles && !autoShuffle &&
      _teamAssignments[0] !== undefined &&
      _teamAssignments[1] !== undefined &&
      _teamAssignments[2] !== undefined &&
      _teamAssignments[3] !== undefined);
  }

  // v2.2.42-beta: conta participantes REAIS (com uid) atualmente na sala.
  // O fluxo "ready / Aguardando +N" só faz sentido quando há 2+ pessoas
  // logadas para confirmar. Quando só o criador é real (os demais slots são
  // convidados sem conta, nomes default "Jogador 01/02/03" ou nomes do
  // autocompletar que ainda não entraram na sala), não há ninguém pra dar o
  // segundo "ready" — então o jogo deve iniciar direto, sem aguardar +1.
  function _realUidParticipantCount() {
    var seen = {};
    for (var i = 0; i < _lobbyParticipants.length; i++) {
      var p = _lobbyParticipants[i];
      if (p && p.uid) seen[p.uid] = true;
    }
    return Object.keys(seen).length;
  }

  // v2.2.10-beta: condição para iniciar — ≥2 UIDs prontos; se times formados,
  // precisa de pelo menos 1 pronto em cada time.
  function _readyConditionMet(readyUids, freshDoc) {
    if (!Array.isArray(readyUids) || readyUids.length < 2) return false;
    var tf = freshDoc && freshDoc.teamsFormed;
    if (!tf) return true;
    var pls = (freshDoc && Array.isArray(freshDoc.players)) ? freshDoc.players : [];
    var t1Ok = pls.some(function(p) { return p && p.team === 1 && readyUids.indexOf(p.uid) !== -1; });
    var t2Ok = pls.some(function(p) { return p && p.team === 2 && readyUids.indexOf(p.uid) !== -1; });
    return t1Ok && t2Ok;
  }

  // Atualiza o botão Iniciar: amber "Aguardando +N" para quem já clicou,
  // label com contagem para quem ainda não clicou.
  function _updateReadyButtonUI(readyUids) {
    var btn = document.getElementById('casual-header-start');
    if (!btn) return;
    var cnt = Array.isArray(readyUids) ? readyUids.length : 0;
    if (_myReadyClicked) {
      var needed = Math.max(0, 2 - cnt);
      btn.disabled = true;
      btn.onclick = null;
      btn.style.cssText = 'background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.45);color:#fbbf24;border-radius:10px;padding:7px 14px;font-size:0.82rem;font-weight:800;cursor:default;box-shadow:none;flex-shrink:0;white-space:nowrap;-webkit-tap-highlight-color:transparent;';
      btn.textContent = needed > 0 ? ('⏳ Aguardando +' + needed) : '⏳ Iniciando…';
    } else if (cnt > 0) {
      btn.textContent = _t('casual.start') + ' (' + cnt + ' pronto' + (cnt > 1 ? 's' : '') + ')';
    } else {
      btn.textContent = _t('casual.start');
    }
  }

  // Handler do clique em Iniciar — registra UID no readyPlayers do Firestore,
  // mostra amber tag, e inicia quando condições são atendidas.
  window._casualReadyClick = async function() {
    if (_myReadyClicked) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    var cuUid = cu && cu.uid;
    // Sem UID (guest não logado) — cai na lógica original direta
    if (!cuUid || !_sessionDocId) {
      await window._casualStart();
      return;
    }
    // v2.2.42-beta: só há 1 participante real na sala (o próprio criador) —
    // ninguém pra dar o segundo "ready". Inicia direto, sem "Aguardando +1".
    if (_realUidParticipantCount() < 2) {
      await window._casualStart();
      return;
    }
    _myReadyClicked = true;
    _updateReadyButtonUI([]); // mostra "⏳ Aguardando +1" imediatamente
    try {
      await window.FirestoreDB.db.collection('casualMatches').doc(_sessionDocId).update({
        readyPlayers: firebase.firestore.FieldValue.arrayUnion(cuUid)
      });
      // Verifica se condição já é atendida logo após salvar
      var fresh = await window.FirestoreDB.loadCasualMatch(_sessionRoomCode);
      if (fresh && _readyConditionMet(fresh.readyPlayers || [], fresh)) {
        _checkAndStart();
      } else {
        _updateReadyButtonUI((fresh && Array.isArray(fresh.readyPlayers)) ? fresh.readyPlayers : [cuUid]);
      }
    } catch(e) {
      // Falha no save — reverte estado para o usuário tentar de novo
      _myReadyClicked = false;
      _updateReadyButtonUI([]);
    }
  };

  // Broadcast setup state (players + teams + scoring) to Firestore so invited
  // users watching the lobby see team formations in real time. Debounced so
  // rapid edits (typing names, drag-and-drop) don't spam writes.
  var _syncCasualSetupT = null;
  function _syncCasualSetupDebounced() {
    if (!_sessionDocId || typeof window.FirestoreDB === 'undefined' || !window.FirestoreDB.updateCasualMatch) return;
    clearTimeout(_syncCasualSetupT);
    _syncCasualSetupT = setTimeout(function() {
      try {
        // v1.6.34-beta: semeia _slotGenders com gêneros de perfil já conhecidos
        // (incluindo o criador, cujo gender é carregado de cu.gender no init mas
        // nunca escrito em _slotGenders, então outros clientes sempre viam '?').
        // Faz isso antes de cada save para garantir consistência.
        for (var _sgi = 0; _sgi < _lobbyParticipants.length; _sgi++) {
          var _sgp = _lobbyParticipants[_sgi];
          if (_sgp && _sgp.uid && !_slotGenders[_sgi] && _participantGenders[_sgp.uid]) {
            _slotGenders[_sgi] = _participantGenders[_sgp.uid];
          }
        }
        // v1.6.26-beta: também sincroniza slotGenders pra que o toggle Misto
        // apareça/desapareça consistentemente entre todos os clientes da sala.
        window.FirestoreDB.updateCasualMatch(_sessionDocId, {
          players: _buildPlayers(),
          scoring: _getConfig(),
          isDoubles: isDoubles,
          teamsFormed: _isTeamsFormed(),
          slotGenders: _slotGenders,
          slotLinkedUid: _slotLinkedUid.slice()
        });
        _publishMyGender();
      } catch(e) {}
    }, 500);
  }
  // v2.2.27-beta: propaga o gênero por UID. Cada cliente publica o PRÓPRIO
  // gênero (do perfil) no doc da sala via dot-path participantGenders.<uid> —
  // sem clobber entre clientes. Todos leem e mergeiam (snapshot + poll). Assim
  // o gênero do criador (Nelson) chega a quem entra (Rodrigo) e vice-versa,
  // independente de ler o perfil alheio ou da ordem dos slots. Resolve o
  // toggle Duplas Mistas e o ícone de gênero ficarem inconsistentes entre
  // dispositivos. Escrita direta (não via updateCasualMatch) pra preservar a
  // chave com ponto (dot-path) sem o _cleanUndefined reaninhar o objeto.
  function _publishMyGender() {
    var _cuPG = window.AppStore && window.AppStore.currentUser;
    if (!_cuPG || !_cuPG.uid || !_cuPG.gender || !_sessionDocId) return;
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;
    try {
      var _upd = {};
      _upd['participantGenders.' + _cuPG.uid] = _cuPG.gender;
      window.FirestoreDB.db.collection('casualMatches').doc(_sessionDocId).update(_upd).catch(function() {});
    } catch (e) {}
  }
  // Exposed for oninput handlers on name fields
  window._syncCasualSetupFromInput = _syncCasualSetupDebounced;

  // Invite players via QR code (from setup screen, BEFORE starting)
  window._casualInvite = async function() {
    var players = _buildPlayers();
    var cfg = _getConfig();
    var cu = window.AppStore && window.AppStore.currentUser;
    var sportLabel = selectedSport;

    var roomCode = _sessionRoomCode;

    // Save to Firestore if not saved yet
    if (!_sessionDocId && typeof window.FirestoreDB !== 'undefined' && window.FirestoreDB.db && cu && cu.uid) {
      try {
        _sessionDocId = await window.FirestoreDB.saveCasualMatch({
          createdBy: cu.uid,
          createdByName: cu.displayName || '',
          createdAt: new Date().toISOString(),
          sport: sportLabel,
          scoring: cfg,
          isDoubles: isDoubles,
          teamsFormed: _isTeamsFormed(),
          players: players,
          participants: [{ uid: cu.uid, displayName: cu.displayName || '', photoURL: cu.photoURL || '', joinedAt: new Date().toISOString() }],
          playerUids: players.filter(function(p) { return !!p.uid; }).map(function(p) { return p.uid; }),
          roomCode: roomCode,
          status: 'waiting',
          result: null
        });
      } catch (e) { window._warn('Casual invite save failed:', e); }
    } else if (_sessionDocId) {
      // Update existing with current players/config
      try {
        window.FirestoreDB.updateCasualMatch(_sessionDocId, { players: players, scoring: cfg, isDoubles: isDoubles, teamsFormed: _isTeamsFormed() });
      } catch(e) {}
    }

    var casualUrl = (window.SCOREPLACE_URL || 'https://scoreplace.app') + '/#casual/' + roomCode;
    var qrSize = 300;
    var qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=' + qrSize + 'x' + qrSize + '&data=' + encodeURIComponent(casualUrl) + '&bgcolor=1a1e2e&color=ffffff&margin=10';

    var qrOv = document.createElement('div');
    qrOv.id = 'casual-qr-overlay';
    // v1.9.66: 100dvh + scroll interno (align-items:flex-start) — em iPhone
    // pequeno o conteúdo (QR 280px + código + botões) passava da tela e ficava
    // cortado com align-items:center sem overflow. overscroll-behavior:contain
    // impede o scroll de vazar pra dashboard atrás.
    qrOv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;height:100%;background:#0a0e1a;z-index:100003;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:1.5rem 1rem calc(1.5rem + env(safe-area-inset-bottom));box-sizing:border-box;';

    qrOv.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;width:100%;max-width:400px;">' +
        '<div style="font-size:1.3rem;font-weight:800;color:#38bdf8;margin-bottom:3px;">📲 ' + _t('casual.invitePlayers') + '</div>' +
        '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:clamp(0.8rem,3vh,1.5rem);">' + _t('casual.inviteInstructions') + '</div>' +
        // QR code — centered
        '<img src="' + window._safeHtml(qrImgUrl) + '" alt="QR Code" style="width:min(70vw,280px);height:min(70vw,280px);border-radius:14px;margin-bottom:clamp(0.6rem,2vh,1rem);" />' +
        // Room code
        '<div style="font-size:clamp(1.8rem,7vw,2.5rem);font-weight:900;letter-spacing:8px;color:#fbbf24;font-family:monospace;margin-bottom:4px;">' + window._safeHtml(roomCode) + '</div>' +
        '<div style="font-size:0.65rem;color:var(--text-muted);word-break:break-all;margin-bottom:clamp(0.6rem,2vh,1rem);">' + window._safeHtml(casualUrl) + '</div>' +
        // Share buttons
        '<div style="display:flex;gap:8px;margin-bottom:8px;width:100%;max-width:320px;">' +
          '<button onclick="navigator.clipboard.writeText(\'' + casualUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\');if(typeof showNotification===\'function\')showNotification(_t(\'casual.linkCopied\'),\'\',\'success\');" style="flex:1;padding:12px;border-radius:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--text-bright);font-size:0.82rem;font-weight:600;cursor:pointer;">📋 ' + _t('casual.copyLink') + '</button>' +
          '<a href="https://wa.me/?text=' + encodeURIComponent(_t('casual.whatsappMsg', {sport: sportLabel, code: roomCode, url: casualUrl})) + '" target="_blank" rel="noopener" style="flex:1;padding:12px;border-radius:10px;background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);color:#25d366;font-size:0.82rem;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;">💬 WhatsApp</a>' +
        '</div>' +
        // Imprimir flyer da partida casual (v2.3.54)
        '<button onclick="window._openInvitePrint({kind:\'casual\',url:\'' + casualUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\',title:\'' + String(sportLabel).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\',subtitle:\'Código da sala: ' + roomCode.replace(/'/g, "\\'") + '\'})" style="width:100%;max-width:320px;padding:12px;border-radius:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--text-bright);font-size:0.82rem;font-weight:600;cursor:pointer;margin-bottom:8px;">🖨️ Imprimir convite</button>' +
        // Convidar amigos da scoreplace via notificação — mais direto que
        // WhatsApp pra quem já usa o app. Throttle: desabilita após 1 clique.
        (cu && Array.isArray(cu.friends) && cu.friends.length > 0
          ? '<button id="casual-notify-friends-btn" onclick="window._casualNotifyFriends(\'' + roomCode.replace(/'/g, "\\'") + '\', \'' + sportLabel.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')" style="width:100%;max-width:320px;padding:12px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;color:#fff;font-size:0.82rem;font-weight:700;cursor:pointer;margin-bottom:clamp(0.6rem,2vh,1rem);">👥 Avisar meus ' + cu.friends.length + ' amigo' + (cu.friends.length === 1 ? '' : 's') + ' do scoreplace</button>'
          : '<div style="width:100%;max-width:320px;margin-bottom:clamp(0.6rem,2vh,1rem);"></div>') +
        // Back button
        '<button onclick="var ov=document.getElementById(\'casual-qr-overlay\');if(ov)ov.remove();" style="padding:12px 28px;border-radius:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--text-bright);font-size:0.88rem;font-weight:600;cursor:pointer;">← ' + _t('casual.back') + '</button>' +
      '</div>';

    document.body.appendChild(qrOv);
  };

  // Avisa todos os amigos da scoreplace sobre a partida casual criada.
  // Dispara notificação tipo 'casual_invite' pra cada amigo com roomCode +
  // sport + link. Throttle: desabilita o botão após 1 clique pra evitar
  // spam (o usuário não deve precisar mandar 2x).
  window._casualNotifyFriends = async function(roomCode, sportLabel) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !Array.isArray(cu.friends) || cu.friends.length === 0) return;
    if (typeof window._sendUserNotification !== 'function') return;
    // v0.17.8: usa o helper de dedup (call site missed na v0.17.5). Filtra
    // emails legados, próprio uid e duplicatas pra evitar notificação spam.
    var friendsList = (typeof window._dedupFriendsForNotify === 'function')
      ? window._dedupFriendsForNotify(cu.friends, cu.uid)
      : cu.friends;
    if (friendsList.length === 0) return;
    var btn = document.getElementById('casual-notify-friends-btn');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.65';
      btn.style.cursor = 'default';
      btn.textContent = '⏳ Enviando...';
    }
    var base = window.SCOREPLACE_URL || 'https://scoreplace.app';
    var url = base + '/#casual/' + roomCode;
    var msg = (cu.displayName || 'Um amigo') + ' começou uma partida casual de ' +
              (sportLabel || 'scoreplace') + '. Entra junto: ' + roomCode;
    var sent = 0;
    var fails = 0;
    var total = friendsList.length;
    for (var i = 0; i < friendsList.length; i++) {
      try {
        await window._sendUserNotification(friendsList[i], {
          type: 'casual_invite',
          message: msg,
          level: 'all',
          roomCode: roomCode,
          sport: sportLabel,
          url: url
        });
        sent++;
      } catch (e) { fails++; }
    }
    if (btn) {
      btn.textContent = '✅ Avisou ' + sent + ' amigo' + (sent === 1 ? '' : 's');
    }
    if (typeof showNotification === 'function') {
      showNotification('Convites enviados!', sent + ' de ' + total + ' amigos notificados.', 'success');
    }
  };

  // ── Ponte do relógio: estado do LOBBY ──────────────────────────────────────
  // Enquanto a montagem da partida casual está aberta, o relógio deixa de dizer
  // só "Aguardando…" e passa a oferecer "Iniciar" — antes NÃO existia jeito de
  // começar a partida sem pegar o celular. Retorna null quando a montagem não
  // está no ar (aí a ponte cai no estado inativo normal).
  window._getCasualSetupState = function() {
    if (!document.getElementById('casual-match-overlay')) return null;
    var ids = isDoubles
      ? ['casual-p1a-name', 'casual-p1b-name', 'casual-p2a-name', 'casual-p2b-name']
      : ['casual-p1-name', 'casual-p2-name'];
    var names = [];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      // placeholder como fallback: slot vazio mostra "Jogador 3" no relógio,
      // igual o celular — em vez de um vazio que não diz nada.
      names.push(el ? (el.value || el.placeholder || '') : '');
    }
    return {
      canStart: true,
      sportName: selectedSport,
      isDoubles: !!isDoubles,
      teams: isDoubles
        ? { '1': { players: [names[0], names[1]] }, '2': { players: [names[2], names[3]] } }
        : { '1': { players: [names[0]] }, '2': { players: [names[1]] } }
    };
  };
  // Empurra o lobby pro relógio (no-op na web / sem ponte).
  function _watchNotifySetup() {
    if (window.WatchBridge && window.WatchBridge.pushCurrent) {
      try { window.WatchBridge.pushCurrent(); } catch (e) {}
    }
  }
  // O lobby saiu do ar → avisa o relógio pra tirar o "Iniciar".
  //
  // NÃO anula window._getCasualSetupState de propósito: ele já se protege sozinho
  // (retorna null quando a overlay não existe), e anular quebrava o retorno ao
  // lobby — _casualReopenSetup reusa ESTE closure e nunca re-executa a atribuição,
  // então depois de "iniciar → fechar → voltar ao lobby" o relógio nunca mais
  // ofereceria "Iniciar". Um _openCasualMatch novo sobrescreve o getter naturalmente.
  //
  // skipPush=true quando o placar ao vivo abre logo em seguida: ele empurra o
  // próprio estado, e mandar "inativo" antes faria o relógio piscar
  // "Aguardando…" por um instante entre o lobby e a partida.
  function _watchSetupTeardown(skipPush) {
    if (!skipPush && window.WatchBridge && window.WatchBridge.pushInactive) {
      try { window.WatchBridge.pushInactive(); } catch (e) {}
    }
  }

  // Start the match (directly opens live scoring)
  window._casualStart = async function() {
    // Persiste a modalidade + dupla/individual escolhidos AO INICIAR — não só no
    // clique do seletor. Assim, se o usuário aceitar o esporte que já veio
    // pré-selecionado (sem tocar no botão), essa escolha também fica lembrada
    // pra próxima partida. A config de placar (sets/games/contagem) já é salva
    // por esporte em scoreplace_casual_prefs quando alterada. Espelha o comportamento
    // da "ida planejada", que grava a config no confirmar.
    _persistLastCasualChoice();
    // Stop lobby refresh
    if (_setupRefreshInterval) { clearInterval(_setupRefreshInterval); _setupRefreshInterval = null; }
    var players = _buildPlayers();

    // Enrich player names from lobby participants (people who joined via QR/code)
    if (_sessionDocId && typeof window.FirestoreDB !== 'undefined') {
      try {
        var freshMatch = await window.FirestoreDB.loadCasualMatch(_sessionRoomCode);
        if (freshMatch && Array.isArray(freshMatch.participants)) {
          var lobbyNames = freshMatch.participants.map(function(p) { return p.displayName || ''; }).filter(function(n) { return !!n; });
          // Coach mode: técnico não é jogador — não enriquecer slots com dados do lobby.
          // Sem coach mode: preencher slots padrão e enriquecer foto/uid dos personalizados.
          if (!_coachMode) {
          var usedLobby = 0;
          for (var pi = 0; pi < players.length; pi++) {
            var defaultNames = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4', 'Parceiro', 'Adversário 1', 'Adversário 2', 'Oponente 1', 'Oponente 2'];
            var isDefault = !players[pi].name || defaultNames.indexOf(players[pi].name) !== -1;
            if (isDefault && usedLobby < lobbyNames.length) {
              players[pi].name = lobbyNames[usedLobby];
              if (freshMatch.participants[usedLobby]) {
                players[pi].uid = freshMatch.participants[usedLobby].uid || null;
                players[pi].photoURL = freshMatch.participants[usedLobby].photoURL || null;
              }
              usedLobby++;
            } else if (!isDefault) {
              // Already has a custom name — try to match with a lobby participant
              // Still enrich photoURL if available
              if (freshMatch.participants[usedLobby]) {
                if (!players[pi].photoURL) players[pi].photoURL = freshMatch.participants[usedLobby].photoURL || null;
                if (!players[pi].uid) players[pi].uid = freshMatch.participants[usedLobby].uid || null;
              }
              usedLobby++;
            }
          }
          }
        }
      } catch(e) {}
    }

    var cu = window.AppStore && window.AppStore.currentUser;
    var cuUid = cu && cu.uid;

    // Is this player the current logged-in user?
    function _isCurrentUser(p) {
      if (!p) return false;
      if (cuUid && p.uid === cuUid) return true;
      if (cu && cu.displayName && p.name) {
        if (p.name === cu.displayName) return true;
      }
      return false;
    }

    // Rename unnamed team-1 / team-2 slots to role names. Rules:
    //  - the current user is never renamed to "Parceiro";
    //  - only ONE team-1 player becomes "Parceiro" (the one who isn't the user);
    //  - adversaries are numbered by their position within team 2.
    function _renameRoles() {
      var defaultNames = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4', 'Parceiro', 'Adversário 1', 'Adversário 2'];
      var t1List = [], t2List = [];
      for (var ii = 0; ii < players.length; ii++) {
        if (players[ii].team === 1) t1List.push(players[ii]);
        else if (players[ii].team === 2) t2List.push(players[ii]);
      }
      // v4.0.6: numeração POSICIONAL — duplas T1=1,2 T2=3,4 · simples T1=1 T2=2.
      var _isDbl = (t1List.length > 1 || t2List.length > 1);
      // v1.9.72: APENAS UM slot do time 1 pode ser o usuário atual. Sem essa
      // guarda, se um segundo slot batia em _isCurrentUser (por uid herdado ou
      // por nome já igual ao do usuário), AMBOS recebiam cu.displayName → a
      // dupla virava "Rodrigo Barth / Rodrigo Barth". O 1º match fica como
      // usuário; os demais do time 1 viram "Parceiro".
      var userTaken = false;
      for (var ti = 0; ti < t1List.length; ti++) {
        var p1p = t1List[ti];
        var isDefault1 = !p1p.name || defaultNames.indexOf(p1p.name) !== -1;
        if (!userTaken && _isCurrentUser(p1p)) {
          userTaken = true;
          if (isDefault1 && cu && cu.displayName) {
            p1p.name = cu.displayName;
          }
          continue;
        }
        if (isDefault1) {
          p1p.name = 'Jogador ' + (ti + 1);
        }
      }
      for (var tj = 0; tj < t2List.length; tj++) {
        var p2p = t2List[tj];
        var isDefault2 = !p2p.name || defaultNames.indexOf(p2p.name) !== -1;
        if (isDefault2) p2p.name = 'Jogador ' + (_isDbl ? (tj + 3) : 2);
      }
      // v1.9.72: dedupe de segurança — dois jogadores do MESMO time nunca
      // podem ter o mesmo nome (ex.: slot do parceiro carregando o nome real
      // do usuário, não-default, que escaparia das regras acima). O duplicado
      // é renomeado pro papel genérico.
      function _dedupeTeam(list, isTeam1) {
        var seen = {};
        for (var di = 0; di < list.length; di++) {
          var nmk = (list[di].name || '').trim().toLowerCase();
          if (!nmk) continue;
          if (seen[nmk]) {
            list[di].name = isTeam1 ? ('Jogador ' + (di + 1)) : ('Jogador ' + (_isDbl ? (di + 3) : 2));
          } else {
            seen[nmk] = true;
          }
        }
      }
      _dedupeTeam(t1List, true);
      _dedupeTeam(t2List, false);
    }

    // Sortear ON: randomly assign 4 players into 2 teams. User always stays on Team 1.
    // Unnamed players get labeled based on which team they land on.
    // Sortear OFF: teams are fixed from setup (slots 0,1=T1, slots 2,3=T2) — no shuffle.
    if (isDoubles && autoShuffle && players.length === 4) {
      var _mixedApplied = false;
      if (_mixedDoublesEnabled && _canShowMixedToggle()) {
        // Mixed-doubles shuffle: ensure each team has 1M + 1F.
        // v2.1.99: usa players[gi].gender (já resolvido via _resolveSlotGender, que
        // inclui _slotGenders definidos manualmente) em vez de apenas _participantGenders
        // (que só contém perfis carregados assincronamente). Fix: 2 homens no mesmo time.
        var males = [], females = [];
        for (var gi = 0; gi < players.length; gi++) {
          var gUid = players[gi].uid;
          var gg = players[gi].gender || (gUid ? (_participantGenders[gUid] || '') : '');
          if (gg === 'masculino') males.push(players[gi]);
          else if (gg === 'feminino') females.push(players[gi]);
        }
        if (males.length === 2 && females.length === 2) {
          // Randomly pick which male pairs with which female for Team 1.
          var mIdx = Math.floor(Math.random() * 2);
          var fIdx = Math.floor(Math.random() * 2);
          var t1a = males[mIdx], t1b = females[fIdx];
          var t2a = males[1 - mIdx], t2b = females[1 - fIdx];
          // If current user exists and isn't in Team 1, swap with same-gender Team-1 member.
          if (cuUid) {
            // cuGender: prioriza gender já resolvido no array players
            var cuGender = '';
            for (var _cgi = 0; _cgi < players.length; _cgi++) {
              if (players[_cgi].uid === cuUid) { cuGender = players[_cgi].gender || ''; break; }
            }
            if (!cuGender) cuGender = _participantGenders[cuUid] || '';
            if (t1a.uid !== cuUid && t1b.uid !== cuUid) {
              if (cuGender === 'masculino' && t2a.uid === cuUid) { var sA = t1a; t1a = t2a; t2a = sA; }
              else if (cuGender === 'feminino' && t2b.uid === cuUid) { var sB = t1b; t1b = t2b; t2b = sB; }
            }
          }
          // Randomize team-2 internal order for variety; team-1 keeps user first.
          if (Math.random() < 0.5) { var swapT2 = t2a; t2a = t2b; t2b = swapT2; }
          // Put user first on Team 1 if present.
          if (cuUid && t1b.uid === cuUid) { var swapT1 = t1a; t1a = t1b; t1b = swapT1; }
          players[0] = t1a; players[1] = t1b; players[2] = t2a; players[3] = t2b;
          players[0].team = 1; players[1].team = 1;
          players[2].team = 2; players[3].team = 2;
          _mixedApplied = true;
        }
      }
      if (!_mixedApplied) {
        // Fisher-Yates shuffle
        for (var j = players.length - 1; j > 0; j--) {
          var k = Math.floor(Math.random() * (j + 1));
          var tmp = players[j]; players[j] = players[k]; players[k] = tmp;
        }
        // Assign teams by position
        players[0].team = 1; players[1].team = 1;
        players[2].team = 2; players[3].team = 2;
        // Ensure current user is in Team 1
        if (cuUid) {
          for (var si = 2; si < 4; si++) {
            if (players[si].uid === cuUid) {
              var swp = players[0]; players[0] = players[si]; players[si] = swp;
              players[0].team = 1; players[si].team = 2;
              break;
            }
          }
        }
      }
      _renameRoles();
    }

    // Sortear OFF: teams fixed from setup (0,1=T1, 2,3=T2). Rename unnamed to role names.
    if (isDoubles && !autoShuffle && players.length === 4) {
      _renameRoles();
    }

    var n1, n2;
    if (isDoubles) {
      var t1 = players.filter(function(p) { return p.team === 1; });
      var t2 = players.filter(function(p) { return p.team === 2; });
      n1 = t1.map(function(p) { return p.name; }).join(' / ');
      n2 = t2.map(function(p) { return p.name; }).join(' / ');
    } else {
      n1 = players[0].name;
      n2 = players[1].name;
    }

    var cfg = _getConfig();
    var sportLabel = selectedSport;

    // v1.7.3-beta: se voltamos ao setup via Desparear/Jogar Novamente
    // (_sessionReopened=true), criar um NOVO documento Firestore para esta
    // partida em vez de reutilizar/sobrescrever o doc anterior.
    // Motivação: reutilizar o mesmo doc apagava result + resetava createdAt
    // para a data da sessão original, quebrando o histórico de partidas
    // (usuário via datas antigas de dia 10/15 mesmo jogando hoje).
    // Novo roomCode gerado junto com o novo doc para que convites (QR code)
    // apontem para a sala correta.
    var _isReopen = _sessionReopened;
    _sessionReopened = false;

    // If not yet saved to Firestore, save now
    if (!_sessionDocId && typeof window.FirestoreDB !== 'undefined' && window.FirestoreDB.db && cu && cu.uid) {
      try {
        _sessionDocId = await window.FirestoreDB.saveCasualMatch({
          createdBy: cu.uid,
          createdByName: cu.displayName || '',
          createdAt: new Date().toISOString(),
          sport: sportLabel,
          scoring: cfg,
          isDoubles: isDoubles,
          teamsFormed: _isTeamsFormed(),
          players: players,
          playerUids: players.filter(function(p) { return !!p.uid; }).map(function(p) { return p.uid; }),
          roomCode: _sessionRoomCode,
          status: 'active',
          result: null
        });
      } catch (e) { window._warn('Casual start save failed:', e); }
    } else if (_sessionDocId && _isReopen) {
      // v1.7.3-beta: voltou ao setup após partida concluída — criar NOVO doc.
      // O doc anterior (status:'finished') fica intacto no Firestore e aparece
      // no histórico com a data correta. Novo roomCode evita conflito de lookup.
      //
      // v1.7.4-beta: para o _setupRefreshInterval ANTES de trocar _sessionRoomCode.
      // Sem isso, o intervalo usa o novo roomCode na próxima tick e, se o novo doc
      // ainda não chegou ao Firestore, loadCasualMatch retorna null → branch "doc
      // deletado" → remove overlay e redireciona para dashboard, destruindo a
      // sessão e fazendo a primeira partida desaparecer do histórico.
      if (_setupRefreshInterval) { clearInterval(_setupRefreshInterval); _setupRefreshInterval = null; }
      // v2.1.93: preserva docId antigo para sinalizar guests via nextRoomCode.
      var _prevDocIdReopen = _sessionDocId;
      _sessionRoomCode = _generateRoomCode();
      try {
        _sessionDocId = await window.FirestoreDB.saveCasualMatch({
          createdBy: cu.uid,
          createdByName: cu.displayName || '',
          createdAt: new Date().toISOString(),
          sport: sportLabel,
          scoring: cfg,
          isDoubles: isDoubles,
          teamsFormed: _isTeamsFormed(),
          players: players,
          playerUids: players.filter(function(p) { return !!p.uid; }).map(function(p) { return p.uid; }),
          roomCode: _sessionRoomCode,
          status: 'active',
          result: null,
          slotGenders: _slotGenders,
          slotLinkedUid: _slotLinkedUid.slice()
        });
        // v2.1.93: sinaliza guests sobre o novo roomCode via doc antigo.
        // Guests fazem polling do roomCode antigo e ao detectar nextRoomCode
        // seguem para o novo doc (novo jogo) sem perder a sessão.
        if (_prevDocIdReopen && window.FirestoreDB && window.FirestoreDB.db) {
          window.FirestoreDB.db.collection('casualMatches').doc(_prevDocIdReopen)
            .update({ nextRoomCode: _sessionRoomCode })
            .catch(function(e) { window._warn('[Casual] nextRoomCode write failed:', e); });
        }
      } catch (e) { window._warn('Casual reopen save failed:', e); }
    } else if (_sessionDocId) {
      // Update existing match to active with current players (sem reopen).
      try {
        window.FirestoreDB.updateCasualMatch(_sessionDocId, {
          status: 'active', players: players, scoring: cfg,
          isDoubles: isDoubles, teamsFormed: _isTeamsFormed()
        });
      } catch(e) {}
    }

    // v2.1.77 ROOT FIX: ponteiro activeCasualRoom setado AQUI — a partida iniciou
    // de verdade (status:active, com jogadores). É o caso real de "retomar em
    // outro dispositivo" (o celular cai durante o placar ao vivo). Movido do
    // abrir-setup pra cá pra não criar fantasmas em setups abandonados.
    try {
      if (cu && cu.uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
        window.FirestoreDB.saveUserProfile(cu.uid, { activeCasualRoom: _sessionRoomCode }).catch(function() {});
      }
      sessionStorage.setItem('_activeCasualRoom', _sessionRoomCode);
    } catch (e) {}

    // Save typed player names before destroying setup DOM so that if the user
    // unlinks/re-pairs after this match, _casualReopenSetup → _renderSetup can
    // restore them via the existing _savedPlayerNames fallback (slot index 0-3).
    for (var _saveIdx = 0; _saveIdx < players.length && _saveIdx < 4; _saveIdx++) {
      _savedPlayerNames[_saveIdx] = players[_saveIdx].name || '';
    }

    // Close setup overlay
    var ov = document.getElementById('casual-match-overlay');
    if (ov) ov.remove();
    // skipPush: _openLiveScoring logo abaixo empurra o estado ao vivo.
    _watchSetupTeardown(true);
    var qrOv = document.getElementById('casual-qr-overlay');
    if (qrOv) qrOv.remove();

    // Open live scoring
    window._openLiveScoring(null, null, {
      casual: true,
      scoring: cfg,
      p1Name: n1,
      p2Name: n2,
      title: _t('casual.title'),
      sportName: sportLabel,
      isDoubles: isDoubles,
      casualDocId: _sessionDocId,
      createdBy: cu && cu.uid,
      roomCode: _sessionRoomCode,
      players: players,
      coachMode: !!_coachMode,
      reiRainhaMode: _reiRainhaMode,  // v1.6.11-beta
      slotLinkedUid: _slotLinkedUid.slice()  // v1.6.103-beta: fix SCOREPLACE-WEB-1B
    });
  };

  // Build overlay
  var overlay = document.createElement('div');
  overlay.id = 'casual-match-overlay';
  // v0.17.52: bg respeita tema (var(--bg-darker)) em vez de hardcoded #0a0e1a.
  // v1.9.66: 100dvh (fallback 100vh) — no iPhone, 100vh é MAIOR que a área
  // visível (inclui atrás da barra do Safari), então a parte de baixo do
  // conteúdo (QR + Últimas Partidas) ficava fora da tela e o scroll interno
  // não alcançava. 100dvh = viewport visível real → tudo cabe e scrolla.
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;height:100%;background:var(--bg-darker);z-index:100002;display:flex;flex-direction:column;overflow:hidden;touch-action:manipulation;';
  // v1.6.27-beta: animação pulse pro ícone "?" de gênero indefinido —
  // chama atenção do user de que é clicável (cinza sem pulse era ignorado).
  // Append em <head> em vez de overlay div pra garantir parse como CSS
  // global (style dentro de div arbitrário não é universalmente parseado).
  if (!document.getElementById('_casual-gender-pulse-style')) {
    var _genderPulseStyle = document.createElement('style');
    _genderPulseStyle.id = '_casual-gender-pulse-style';
    _genderPulseStyle.textContent =
      '@keyframes _casual-gender-pulse-kf { 0%,100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.5); } 50% { box-shadow: 0 0 0 6px rgba(251,191,36,0); } }' +
      '._casual-gender-pulse { animation: _casual-gender-pulse-kf 1.6s ease-out infinite; }';
    document.head.appendChild(_genderPulseStyle);
  }

  var _chdr = typeof window._renderBackHeader === 'function'
    ? window._renderBackHeader({
        label: _t('btn.back'),
        // Use registered callback (not inline string) so iOS Safari executes it
        // reliably — inline JS strings go through new Function() which can fail
        // silently when the attribute value is ambiguous after HTML encoding.
        onClickOverride: function() { window._casualSetupClose && window._casualSetupClose(); },
        middleHtml: '<div style="flex:1;display:flex;align-items:center;gap:8px;justify-content:center;"><span style="font-size:1rem;">⚡</span><span style="font-size:0.95rem;font-weight:800;color:#38bdf8;">' + _t('casual.title') + '</span></div>',
        rightHtml: '<button id="casual-header-start" onclick="window._casualReadyClick()" style="background:linear-gradient(135deg,#10b981,#059669);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:10px;padding:7px 16px;font-size:0.85rem;font-weight:800;cursor:pointer;box-shadow:0 2px 10px rgba(16,185,129,0.35);-webkit-tap-highlight-color:transparent;flex-shrink:0;">' + _t('casual.start') + '</button>'
      })
    : '<div></div>';
  overlay.innerHTML = _chdr +
    // v1.9.66: overscroll-behavior:contain impede o rubber-band do scroll
    // interno de encadear pro body → a dashboard atrás não se mexe mais.
    // padding-bottom com safe-area pra o último card não ficar sob o notch/home.
    '<div id="casual-setup-content" style="flex:1;overflow-y:auto;overscroll-behavior:contain;padding:1rem 0.8rem calc(1.5rem + env(safe-area-inset-bottom)) 0.8rem;-webkit-overflow-scrolling:touch;"></div>';

  document.body.appendChild(overlay);
  // Prevent body scroll and pinch-zoom while casual overlay is open
  document.body.style.overflow = 'hidden';
  var _metaVp = document.querySelector('meta[name="viewport"]');
  var _origVpContent = _metaVp ? _metaVp.getAttribute('content') : '';
  // v4.3.20: MANTÉM viewport-fit=cover ao travar o zoom. No app nativo o meta
  // base (index.html) tem viewport-fit=cover; se a gente o REMOVE aqui, o
  // WKWebView do iOS faz um reflow do layout viewport (a área que estava full-
  // bleed sob a ilha dinâmica passa a ser inset pelo sistema) com as coordenadas
  // de toque desatualizadas → o clique cai "fora de posição" (Voltar não
  // responde, Iniciar acerta o card de config). Além disso env(safe-area-inset-*)
  // zera sem viewport-fit=cover. Na WEB o token é inerte (sem notch, insets=0).
  if (_metaVp) _metaVp.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
  // Restore on close
  var _ovObs = new MutationObserver(function(muts) {
    if (!document.getElementById('casual-match-overlay') && !document.getElementById('live-scoring-overlay')) {
      document.body.style.overflow = '';
      if (_metaVp && _origVpContent) _metaVp.setAttribute('content', _origVpContent);
      _ovObs.disconnect();
      // Clear active casual room from profile
      try {
        var _cu = window.AppStore && window.AppStore.currentUser;
        var _uid = _cu && (_cu.uid || _cu.email);
        if (_uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
          // Suppress profile-listener resume for 6s so a stale snapshot
          // delivered after this close doesn't hijack navigation back
          // into the match the user just left.
          window._suppressCasualResumeUntil = Date.now() + 6000;
          window.FirestoreDB.saveUserProfile(_uid, { activeCasualRoom: null }).catch(function() {});
        }
        // v0.17.48: limpa sessionStorage backup também
        try { sessionStorage.removeItem('_activeCasualRoom'); } catch(e) {}
      } catch (e) {}
    }
  });
  _ovObs.observe(document.body, { childList: true });

  _renderSetup();

  // Auto-save to Firestore immediately so QR code works before clicking anything
  if (!_sessionDocId && typeof window.FirestoreDB !== 'undefined' && window.FirestoreDB.db && cu && cu.uid) {
    var sportLabel = selectedSport;
    window.FirestoreDB.saveCasualMatch({
      createdBy: cu.uid,
      createdByName: cu.displayName || '',
      createdAt: new Date().toISOString(),
      sport: sportLabel,
      scoring: _getConfig(),
      isDoubles: isDoubles,
      teamsFormed: false,
      players: [],
      participants: [{ uid: cu.uid, displayName: cu.displayName || '', photoURL: cu.photoURL || '', joinedAt: new Date().toISOString() }],
      playerUids: [cu.uid],
      roomCode: _sessionRoomCode,
      status: 'waiting',
      result: null
    }).then(function(docId) {
      if (docId) { _sessionDocId = docId; window._debug('[Casual] Saved to Firestore, docId:', docId, 'roomCode:', _sessionRoomCode); }
      else window._warn('[Casual] saveCasualMatch returned null — check Firestore rules for casualMatches collection');
    }).catch(function(e) {
      window._error('[Casual] Auto-save failed:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'casualMatchAutoSave', roomCode: _sessionRoomCode, code: e && e.code });
      }
    });
    // v2.1.77 ROOT FIX: NÃO seta mais o ponteiro activeCasualRoom aqui (ao ABRIR
    // o setup). Antes, abrir o setup e abandonar (fechar aba / navegar / reload /
    // app cair) deixava o ponteiro apontando pra uma sala AINDA VAZIA (players=[]),
    // e o "resume" puxava o usuário pra esse fantasma. O ponteiro agora é setado
    // só quando a partida REALMENTE INICIA (window._casualStart) — que é o caso
    // real de retomar em outro dispositivo. O doc da sala continua criado aqui
    // pra o QR/código funcionar; sem ninguém, ele é dissolvido (12h ou ao sair).
  }

  // Start polling for new participants joining the room
  function _startSetupRefresh() {
    if (_setupRefreshInterval) return;
    _setupRefreshInterval = setInterval(function() {
      if (!_sessionDocId || !_sessionRoomCode) return;
      if (!document.getElementById('casual-match-overlay')) {
        // Overlay closed — stop polling
        clearInterval(_setupRefreshInterval); _setupRefreshInterval = null; return;
      }
      window.FirestoreDB.loadCasualMatch(_sessionRoomCode).then(function(fresh) {
        if (!fresh) {
          // Doc deleted externally (another device cancelled) — evacuate creator
          clearInterval(_setupRefreshInterval); _setupRefreshInterval = null;
          var _ov = document.getElementById('casual-match-overlay');
          if (_ov) _ov.remove();
          _watchSetupTeardown();
          if (typeof showNotification === 'function') showNotification(_t('casual.matchCancelled'), _t('casual.matchCancelledMsg'), 'info');
          try { window.location.hash = '#dashboard'; } catch(e) {}
          return;
        }
        // v2.1.93: host encerrou a partida — evacua guests que ainda estão
        // no lobby (setup overlay). Caso normal: host fecha via "Fechar"
        // depois do jogo terminar. Guests com overlay aberto são redirecionados
        // ao dashboard com aviso.
        if (fresh.hostClosed === true) {
          clearInterval(_setupRefreshInterval); _setupRefreshInterval = null;
          var _ovHCSetup = document.getElementById('casual-match-overlay');
          if (_ovHCSetup) _ovHCSetup.remove();
          _watchSetupTeardown();
          var _ovQRHC = document.getElementById('casual-qr-overlay');
          if (_ovQRHC) _ovQRHC.remove();
          if (typeof showNotification === 'function') showNotification(_t('casual.matchCancelled'), _t('casual.matchCancelledMsg'), 'info');
          try { window.location.hash = '#dashboard'; } catch(e) {}
          return;
        }

        // v2.1.93: host iniciou um NOVO jogo (reopen). O doc antigo recebe
        // nextRoomCode apontando para o novo doc. Guests que ainda fazem
        // polling do roomCode antigo detectam aqui e seguem para o novo jogo.
        if (fresh.nextRoomCode && fresh.nextRoomCode !== _sessionRoomCode) {
          _sessionRoomCode = fresh.nextRoomCode;
          // Carrega o novo doc imediatamente para não esperar o próximo tick
          window.FirestoreDB.loadCasualMatch(_sessionRoomCode).then(function(freshNew) {
            if (!freshNew) return; // novo doc ainda não chegou — próximo tick pega
            if (freshNew._docId) _sessionDocId = freshNew._docId;
            // Sincroniza gêneros do novo doc antes de abrir o live scoring
            if (freshNew.slotGenders && typeof freshNew.slotGenders === 'object') {
              for (var _ngi = 0; _ngi < 4; _ngi++) {
                if (freshNew.slotGenders[_ngi]) _slotGenders[_ngi] = freshNew.slotGenders[_ngi];
              }
            }
            if (freshNew.status === 'active') {
              clearInterval(_setupRefreshInterval); _setupRefreshInterval = null;
              var _ovAN = document.getElementById('casual-match-overlay');
              if (_ovAN) _ovAN.remove();
              _watchSetupTeardown(true); // o placar ao vivo abre em seguida
              var _qrAN = document.getElementById('casual-qr-overlay');
              if (_qrAN) _qrAN.remove();
              var _newPlayers = Array.isArray(freshNew.players) ? freshNew.players : [];
              var _np1n = _newPlayers.filter(function(p) { return p.team === 1; }).map(function(p) { return p.name; }).join(' / ');
              var _np2n = _newPlayers.filter(function(p) { return p.team === 2; }).map(function(p) { return p.name; }).join(' / ');
              if (typeof window._openLiveScoring === 'function') {
                window._openLiveScoring(null, null, {
                  casual: true,
                  scoring: freshNew.scoring || {},
                  p1Name: _np1n,
                  p2Name: _np2n,
                  title: freshNew.sport || _t('casual.title'),
                  sportName: freshNew.sport || '',
                  isDoubles: !!freshNew.isDoubles,
                  casualDocId: freshNew._docId || _sessionDocId,
                  createdBy: freshNew.createdBy || null,
                  roomCode: _sessionRoomCode,
                  players: _newPlayers
                });
              }
              if (typeof showNotification === 'function') showNotification(_t('casual.matchStarted'), '', 'success');
            }
            // se novo doc ainda é 'setup', o próximo tick do polling (com novo _sessionRoomCode) o detecta
          }).catch(function() {});
          return;
        }

        // v1.6.11-beta: sala única — se OUTRO participante clicou Iniciar
        // (status virou 'active' no Firestore), transiciona TODOS pra live
        // scoring. Antes só o criador podia iniciar; entrantes ficavam
        // presos no lobby readonly. Agora qualquer um pode iniciar e os
        // demais clientes detectam aqui via polling.
        if (fresh.status === 'active') {
          clearInterval(_setupRefreshInterval); _setupRefreshInterval = null;
          var _ovA = document.getElementById('casual-match-overlay');
          if (_ovA) _ovA.remove();
          _watchSetupTeardown(true); // o placar ao vivo abre em seguida
          var _qrA = document.getElementById('casual-qr-overlay');
          if (_qrA) _qrA.remove();
          var _freshPlayers = Array.isArray(fresh.players) ? fresh.players : [];
          var _p1n = _freshPlayers.filter(function(p) { return p.team === 1; }).map(function(p) { return p.name; }).join(' / ');
          var _p2n = _freshPlayers.filter(function(p) { return p.team === 2; }).map(function(p) { return p.name; }).join(' / ');
          if (typeof window._openLiveScoring === 'function') {
            // v1.6.63-beta: usa fresh._docId (ID real do doc atual retornado pelo
            // loadCasualMatch) em vez de _sessionDocId do closure, que pode estar
            // stale se o host reutilizou o mesmo doc com result:null (reopen).
            // Sincroniza _sessionDocId para que referências futuras também batam.
            var _liveDocId = fresh._docId || _sessionDocId;
            if (fresh._docId) _sessionDocId = fresh._docId;
            window._openLiveScoring(null, null, {
              casual: true,
              scoring: fresh.scoring || {},
              p1Name: _p1n,
              p2Name: _p2n,
              title: fresh.sport || _t('casual.title'),
              sportName: fresh.sport || '',
              isDoubles: !!fresh.isDoubles,
              casualDocId: _liveDocId,
              createdBy: fresh.createdBy || null,
              roomCode: _sessionRoomCode,
              players: _freshPlayers
            });
          }
          if (typeof showNotification === 'function') showNotification(_t('casual.matchStarted'), '', 'success');
          return;
        }
        var newParts = Array.isArray(fresh.participants) ? fresh.participants : [];
        // v1.7.3-beta: se fresh.participants está vazio, o doc nunca recebeu
        // entradas de QR invite (partida sem convite). NÃO interpretar como
        // "todos saíram" — sem esta guarda, o código resetava _slotGenders para
        // null em todos os slots e fazia re-render, fazendo gêneros virarem "?"
        // quando o usuário voltava ao setup após "Desparear" ou "Jogar Novamente".
        if (newParts.length > 0 && newParts.length !== _lobbyParticipants.length) {
          var countDecreased = newParts.length < _lobbyParticipants.length;
          // Figure out who left so we can clear their typed-in name from
          // the host's setup cards — freeing the slot for another joiner.
          var _leftNames = [];
          if (countDecreased) {
            var _stillInUids = {};
            for (var _si = 0; _si < newParts.length; _si++) {
              if (newParts[_si] && newParts[_si].uid) _stillInUids[newParts[_si].uid] = true;
            }
            for (var _pi = 0; _pi < _lobbyParticipants.length; _pi++) {
              var _gone = _lobbyParticipants[_pi];
              if (_gone && _gone.uid && !_stillInUids[_gone.uid] && _gone.displayName) {
                _leftNames.push(_gone.displayName);
              }
            }
          }
          if (countDecreased) {
            // v1.6.32-beta: preserva posições de slot quando alguém sai.
            // Antes: _lobbyParticipants = newParts re-indexava todos — Rodrigo
            // (slot 1) virava slot 0. Resultado: inputValues[0] = p1Name stale
            // (ex: "Nelson Barth") + _inputAvatar(0) = foto de Rodrigo (index 0).
            // Agora: quem saiu vira null no seu slot original. Rodrigo fica em
            // slot 1. Slot 0 vira vazio → editável → placeholder "Jogador 1".
            var _newByUid = {};
            for (var _nbi = 0; _nbi < newParts.length; _nbi++) {
              if (newParts[_nbi] && newParts[_nbi].uid) _newByUid[newParts[_nbi].uid] = true;
            }
            var _preserved = [];
            for (var _psi = 0; _psi < _lobbyParticipants.length; _psi++) {
              var _op = _lobbyParticipants[_psi];
              _preserved[_psi] = (_op && _op.uid && _newByUid[_op.uid]) ? _op : null;
            }
            _lobbyParticipants = _preserved;
          } else {
            _lobbyParticipants = newParts;
          }
          _loadMissingGenders();
          if (countDecreased) {
            _teamAssignments = {};
            autoShuffle = true;
            // v1.6.34-beta: limpa DOM inputs e _savedPlayerNames para slots
            // recém-liberados ANTES de _renderSetup. Sem isso, o loop de
            // preservação de valores editáveis lê o valor antigo do DOM
            // (ex: "Nelson Barth" que estava readonly) e re-injeta o nome
            // de quem saiu no campo agora editável — slot continua "ocupado".
            var _vacatedIds = ['casual-p1a-name','casual-p1b-name','casual-p2a-name','casual-p2b-name'];
            for (var _vsi = 0; _vsi < _preserved.length && _vsi < _vacatedIds.length; _vsi++) {
              if (_preserved[_vsi] === null) {
                var _vEl = document.getElementById(_vacatedIds[_vsi]);
                if (_vEl) _vEl.value = '';
                _savedPlayerNames[_vsi] = '';
                _slotGenders[_vsi] = null; // reseta gênero do slot para ? (editável)
              }
            }
            if (typeof showNotification === 'function' && _leftNames.length > 0) {
              showNotification(_t('casual.playerLeft'), _t('casual.playerLeftRoom', {name: _leftNames[0]}), 'info');
            }
            try { _renderSetup(); } catch(_e) {}
            return; // re-render já cobre _updateLobbySection
          }
          _updateLobbySection();
          if (!countDecreased && newParts.length > 1) {
            var latest = newParts[newParts.length - 1];
            if (latest && latest.uid !== (cu ? cu.uid : '')) {
              if (typeof showNotification === 'function') showNotification(_t('casual.newPlayer'), _t('casual.playerJoinedRoom', {name: latest.displayName || _t('casual.someone')}), 'success');
            }
          }
        }
        // v1.6.12-beta: sincroniza nomes digitados pelos OUTROS clientes
        // (sala única). Antes só checava participants.length — se A digitava
        // "Maria" no slot 2, B não via no input dele. Agora reflete os
        // players[] do Firestore nos inputs do DOM. Skip:
        //   (a) slot que tem participante logado (input é readonly, vem de displayName)
        //   (b) input que está atualmente focado (estou digitando agora — last-write-wins)
        //   (c) valor já idêntico (não rerenderiza desnecessariamente)
        var _freshPl = Array.isArray(fresh.players) ? fresh.players : [];
        if (_freshPl.length > 0 && fresh.isDoubles !== false) {
          var _syncInputIds = ['casual-p1a-name', 'casual-p1b-name', 'casual-p2a-name', 'casual-p2b-name'];
          var _focusedEl = document.activeElement;
          for (var _spi = 0; _spi < _syncInputIds.length && _spi < _freshPl.length; _spi++) {
            var _inpSync = document.getElementById(_syncInputIds[_spi]);
            if (!_inpSync) continue;
            if (_inpSync === _focusedEl) continue; // estou digitando — não sobrescreve
            var _isRegSlotSync = (_spi < _lobbyParticipants.length) &&
              _lobbyParticipants[_spi] &&
              (_lobbyParticipants[_spi].uid || _lobbyParticipants[_spi].photoURL);
            if (_isRegSlotSync) continue; // displayName dos logados não vem de input editável
            if (_slotLinkedUid[_spi]) continue; // slot vinculado via autocomplete — controlado por slotLinkedUid + cache
            var _remoteName = (_freshPl[_spi] && _freshPl[_spi].name) ? String(_freshPl[_spi].name) : '';
            // Pula nomes default — se o outro cliente nunca digitou nada
            // pra esse slot, players[idx].name vem "Jogador N" e isso não
            // deve sobrescrever um input que o usuário local começou a
            // editar e ainda não atingiu o debounce de 500ms.
            var _defaults = ['Jogador 1','Jogador 2','Jogador 3','Jogador 4','Parceiro','Adversário 1','Adversário 2'];
            if (_defaults.indexOf(_remoteName) !== -1) continue;
            if (_inpSync.value === _remoteName) continue;
            _inpSync.value = _remoteName;
            // Autosize textarea se a função existir
            try { if (typeof window._autosizeCasualInput === 'function') window._autosizeCasualInput(_inpSync); } catch(e) {}
          }
        }

        // v1.6.25-beta: sincroniza _teamAssignments (formação de duplas via
        // drag-drop) a partir de fresh.players[].team. Antes desta versão,
        // quando A formava duplas via drag-drop, _formTeam gravava players
        // com .team correto no Firestore — mas o polling de B SÓ sincronizava
        // nomes (inputs), NUNCA aplicava o .team no _teamAssignments local.
        // Resultado: time formado por A não aparecia visualmente pra B.
        // Agora derivamos _teamAssignments do fresh.players[].team quando
        // todos os 4 slots têm team definido + teamsFormed=true no Firestore.
        if (_freshPl.length === 4 && fresh.teamsFormed === true) {
          var _allTeamsValid = _freshPl.every(function(p) {
            return p && (p.team === 1 || p.team === 2);
          });
          if (_allTeamsValid) {
            var _newAssignments = {};
            for (var _tai = 0; _tai < 4; _tai++) {
              var _pSlot = (typeof _freshPl[_tai].slot === 'number') ? _freshPl[_tai].slot : _tai;
              _newAssignments[_pSlot] = _freshPl[_tai].team;
            }
            // Aplica só se mudou (evita re-render desnecessário)
            var _changed = false;
            for (var _tak = 0; _tak < 4; _tak++) {
              if (_teamAssignments[_tak] !== _newAssignments[_tak]) { _changed = true; break; }
            }
            if (_changed) {
              _teamAssignments = _newAssignments;
              autoShuffle = false;
              try { _renderSetup(); } catch(e) {}
            }
          }
        } else if (fresh.teamsFormed === false && _teamAssignments[0] !== undefined) {
          // Outro cliente desfez os times (clicou no ícone 🔗 de break)
          _teamAssignments = {};
          autoShuffle = true;
          try { _renderSetup(); } catch(e) {}
        }

        // v1.6.26-beta: sincroniza slotGenders de outros clientes
        // v1.7.7-beta: só sobrescreve quando o remoto tem valor — nunca apaga
        // gênero local definido com valor nulo vindo do Firestore (race condition
        // onde o snapshot chega antes do campo ser preenchido no outro cliente).
        if (fresh.slotGenders && typeof fresh.slotGenders === 'object') {
          var _gChanged = false;
          for (var _gk = 0; _gk < 4; _gk++) {
            var _remoteG = fresh.slotGenders[_gk] || null;
            var _localG = _slotGenders[_gk] || null;
            if (_remoteG && _remoteG !== _localG) {
              _slotGenders[_gk] = _remoteG;
              _gChanged = true;
            }
          }
          if (_gChanged) {
            try { _renderSetup(); } catch(e) {}
          }
        }

        // v2.2.27-beta: propaga gênero por UID. Mergeia participantGenders
        // (uid → gênero) publicado por cada cliente. Robusto a ordem de slots e
        // independe de ler o perfil alheio — o gênero do criador chega a quem
        // entra e vice-versa. Só sobrescreve com valor não-vazio.
        if (fresh.participantGenders && typeof fresh.participantGenders === 'object') {
          var _pgChanged = false;
          for (var _pgk in fresh.participantGenders) {
            if (!Object.prototype.hasOwnProperty.call(fresh.participantGenders, _pgk)) continue;
            var _pgv = fresh.participantGenders[_pgk];
            if (_pgv && _participantGenders[_pgk] !== _pgv) {
              _participantGenders[_pgk] = _pgv;
              _pgChanged = true;
            }
          }
          if (_pgChanged) { try { _renderSetup(); } catch(e) {} }
        }
        // Garante que o meu gênero está publicado (caso o doc tenha sido criado
        // depois do primeiro sync, ou re-entrada na sala).
        _publishMyGender();

        // v1.6.55-beta: sincroniza slotLinkedUid de outros clientes para que
        // o avatar/foto e nome do amigo vinculado via autocomplete apareçam
        // em todos os dispositivos da sala, não só no dispositivo do criador.
        if (Array.isArray(fresh.slotLinkedUid)) {
          var _luChanged = false;
          for (var _luk = 0; _luk < 4; _luk++) {
            var _remoteUid = fresh.slotLinkedUid[_luk] || null;
            var _localUid = _slotLinkedUid[_luk] || null;
            if (_remoteUid !== _localUid) {
              _slotLinkedUid[_luk] = _remoteUid;
              // Pré-carrega perfil do amigo no cache se ainda não está disponível
              if (_remoteUid && window._friendProfilesCache && !window._friendProfilesCache[_remoteUid]) {
                (function(_uid) {
                  if (window.FirestoreDB && window.FirestoreDB.loadUserProfile) {
                    window.FirestoreDB.loadUserProfile(_uid).then(function(p) {
                      if (p) {
                        window._friendProfilesCache[_uid] = {
                          uid: _uid,
                          displayName: p.displayName || '',
                          photoURL: p.photoURL || '',
                          gender: p.gender || ''
                        };
                        // Re-renderiza após o perfil carregar para exibir avatar/nome corretos
                        try { if (document.getElementById('casual-match-overlay')) _renderSetup(); } catch(e) {}
                      }
                    }).catch(function() {});
                  }
                })(_remoteUid);
              }
              _luChanged = true;
            }
          }
          if (_luChanged) {
            try { _renderSetup(); } catch(e) {}
          }
        }

        // v2.2.10-beta: sincroniza readyPlayers e verifica condição de início
        var _freshReady = Array.isArray(fresh.readyPlayers) ? fresh.readyPlayers : [];
        _updateReadyButtonUI(_freshReady);
        if (_myReadyClicked && !_startInitiated && _readyConditionMet(_freshReady, fresh)) {
          _checkAndStart();
        }
      }).catch(function() {});
    }, 3000);
  }

  // Start refresh after save
  setTimeout(function() { _startSetupRefresh(); }, 2000);

  // Cleanup on overlay close
  var origClose = overlay.querySelector('button');
  if (origClose) {
    var origOnclick = origClose.getAttribute('onclick') || '';
    origClose.setAttribute('onclick', 'if(window._casualSetupCleanup)window._casualSetupCleanup();' + origOnclick);
  }
  window._casualSetupCleanup = function() {
    if (_setupRefreshInterval) { clearInterval(_setupRefreshInterval); _setupRefreshInterval = null; }
  };

  // v1.6.11-beta: SALA ÚNICA — "Voltar" não cancela mais a partida pra
  // todos automaticamente. Comportamento agora:
  //   - sou o ÚNICO na sala → deleta o doc (cancel) — não tem ninguém prejudicado
  //   - há outros → só libera minha vaga (leave) — sala continua pros outros
  // Antes esta versão, sempre cancelava — modelo antigo onde quem criou era
  // "dono" da sala. Agora todos são iguais, então sair = liberar slot.
  window._casualSetupClose = function() {
    // v4.0.4: na tela de Configuração, o Voltar do topo volta pro LOBBY da
    // partida que está sendo configurada (não fecha a partida nem vai pra
    // dashboard). Só fecha de verdade quando já está no lobby.
    if (_configOpen) { window._casualCloseConfig(); return; }
    // 1. Stop polling interval
    try { if (window._casualSetupCleanup) window._casualSetupCleanup(); } catch(e) {}

    var _cu2 = window.AppStore && window.AppStore.currentUser;
    var _uid2 = _cu2 && (_cu2.uid || _cu2.email);
    // v1.6.33-beta: filter nulls — após leave, _lobbyParticipants tem null nos slots
    // liberados. Contar length bruto causava _isSolo=false mesmo com 1 real participante.
    var _participantsCount = Array.isArray(_lobbyParticipants) ? _lobbyParticipants.filter(Boolean).length : 0;
    // Sou o único? Conta a si mesmo se estou logado E em _lobbyParticipants.
    var _meInLobby = !!(_cu2 && _cu2.uid && _lobbyParticipants && _lobbyParticipants.some(function(p) { return p && p.uid === _cu2.uid; }));
    var _isSolo = (_participantsCount <= 1) || (_meInLobby && _participantsCount === 1);

    // 2a. Solo: cancel match (deleta doc). Outros polls detectam doc deletado e evacuam.
    if (_isSolo) {
      try {
        if (window.FirestoreDB && typeof window.FirestoreDB.cancelCasualMatch === 'function') {
          if (_sessionDocId) {
            window.FirestoreDB.cancelCasualMatch(_sessionDocId).catch(function(){});
          } else if (_sessionRoomCode && typeof window.FirestoreDB.loadCasualMatch === 'function') {
            window.FirestoreDB.loadCasualMatch(_sessionRoomCode).then(function(m) {
              if (m && m._docId) window.FirestoreDB.cancelCasualMatch(m._docId).catch(function(){});
            }).catch(function(){});
          }
        }
      } catch(e) {}
    } else {
      // 2b. Outros estão na sala — só leave (libera minha vaga). Sala continua viva pros demais.
      try {
        if (_uid2 && _sessionDocId && window.FirestoreDB && typeof window.FirestoreDB.leaveCasualMatch === 'function') {
          var _leaveP = window.FirestoreDB.leaveCasualMatch(_sessionDocId, _uid2);
          if (_leaveP && typeof _leaveP.catch === 'function') _leaveP.catch(function(){});
        }
      } catch(e) {}
    }

    // 3. Clear active-room marker on profile so no device auto-resumes this room
    try {
      if (_uid2 && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
        window._suppressCasualResumeUntil = Date.now() + 6000;
        window.FirestoreDB.saveUserProfile(_uid2, { activeCasualRoom: null }).catch(function() {});
      }
      sessionStorage.removeItem('_activeCasualRoom');
    } catch(e) {}

    // 4. Remove overlays
    var ov = document.getElementById('casual-match-overlay');
    if (ov) ov.remove();
    var qrOv = document.getElementById('casual-qr-overlay');
    if (qrOv) qrOv.remove();

    // 5. Feedback contextual + navigate to dashboard
    try {
      if (typeof showNotification === 'function') {
        if (_isSolo) {
          showNotification(_t('casual.matchCancelled') || 'Partida encerrada', _t('casual.matchCancelledByYouMsg') || 'Partida desmobilizada — sala fechada.', 'info');
        } else {
          showNotification(_t('casual.leftMatch') || 'Você saiu da partida', '', 'info');
        }
      }
    } catch(e) {}
    try {
      if (window.location.hash === '#dashboard' || window.location.hash === '') {
        var _vc = document.getElementById('view-container');
        if (_vc && typeof window.renderDashboard === 'function') window.renderDashboard(_vc);
      } else {
        window.location.hash = '#dashboard';
      }
    } catch(e) {}
  };

  // O autofocus no nome do adversário foi REMOVIDO: no celular ele subia o
  // teclado sozinho ao abrir a partida, empurrando a tela toda pra cima antes
  // do usuário pedir qualquer coisa. O teclado só deve aparecer quando o
  // usuário TOCA num campo de nome.
};

// ─── Casual Match Join Screen (route: #casual/{roomCode}) ─────────────────────
window._renderCasualJoin = function(container, roomCode) {
  if (!container) return;
  // v1.9.53: observabilidade do join casual. Bug reportado: "leu o código no
  // QR (toast apareceu) mas não entrou na partida; digitar o código também
  // não entrou". Como o fluxo é multi-device e difícil de reproduzir, logamos
  // cada etapa para a próxima tentativa real apontar onde trava.
  try {
    var _cuDbg = window.AppStore && window.AppStore.currentUser;
    var _dbg = { room: roomCode, hasUser: !!(_cuDbg && _cuDbg.uid), authResolved: !!window._authStateResolved, hasDB: !!(window.FirestoreDB && window.FirestoreDB.db) };
    // v2.3.89: só breadcrumb (anexa a erros reais). Antes mandava _captureMessage
    // 'info' que criava ISSUE no Sentry — poluía o painel com logs de rotina.
    if (window._log) window._log('[CasualJoin] start', _dbg);
  } catch(e) {}
  var _safe = window._safeHtml || function(s) { return s; };
  var _backHtml = typeof window._renderBackHeader === 'function'
    ? window._renderBackHeader({ href: '#dashboard', label: 'Voltar' }) : '';
  function _setBody(html) {
    var body = document.getElementById('casual-join-body');
    if (body) { body.innerHTML = html; return; }
    container.innerHTML = _backHtml + '<div id="casual-join-body">' + html + '</div>';
  }

  // v2.2.21-beta: bola de tênis girando (loader canônico) em vez da ampulheta.
  _setBody(
    (typeof window._renderBallLoader === 'function')
      ? window._renderBallLoader(_t('casual.loading'), { minHeight: '60vh' })
      : '<div style="display:flex;justify-content:center;align-items:center;min-height:60vh;">' +
          '<div style="text-align:center;">' +
            '<div style="font-size:2rem;margin-bottom:1rem;">🎾</div>' +
            '<p style="color:var(--text-muted);font-size:0.9rem;">' + _t('casual.loading') + '</p>' +
          '</div>' +
        '</div>'
  );

  // Wait for Firebase Auth to rehydrate before deciding "logged-in vs anon".
  // On Safari/iOS the IndexedDB-backed auth state can take several hundred ms
  // to restore after a cold page load. Without this wait, an already-logged-in
  // user who opens a #casual/CODE link sees the "login to join" screen and is
  // sent through a fresh Google OAuth flow (including 2FA) for no reason.
  // We always wait when auth hasn't resolved yet — the presence of authCache
  // alone isn't reliable on Safari (ITP can clear it), but the wait is cheap.
  var _cuNow = window.AppStore && window.AppStore.currentUser;
  var _isLoggedInNow = !!(_cuNow && _cuNow.uid);
  if (!_isLoggedInNow && !window._authStateResolved) {
    var _waited = 0;
    var _tick = function() {
      var cuLater = window.AppStore && window.AppStore.currentUser;
      if (window._authStateResolved || (cuLater && cuLater.uid)) {
        window._renderCasualJoin(container, roomCode);
        return;
      }
      _waited += 200;
      if (_waited >= 6000) {
        // Timeout — fall through and render whatever we have (likely login screen)
        window._authStateResolved = true;
        window._renderCasualJoin(container, roomCode);
        return;
      }
      setTimeout(_tick, 200);
    };
    setTimeout(_tick, 200);
    return;
  }

  if (typeof window.FirestoreDB === 'undefined' || !window.FirestoreDB.db) {
    _setBody(
      '<div style="text-align:center;padding:3rem 1rem;">' +
        '<div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>' +
        '<div style="font-size:1.1rem;font-weight:700;color:var(--text-bright);margin-bottom:0.5rem;">' + _t('casual.offline') + '</div>' +
        '<p style="color:var(--text-muted);font-size:0.85rem;">' + _t('casual.offlineMsg') + '</p>' +
        '<button class="btn btn-primary" onclick="window.location.hash=\'#dashboard\';" style="margin-top:1rem;">' + _t('casual.goToDashboard') + '</button>' +
      '</div>'
    );
    return;
  }

  window.FirestoreDB.loadCasualMatch(roomCode).then(function(match) {
    try {
      var _md = match ? { found: true, status: match.status, players: (match.players||[]).length } : { found: false };
      // v2.3.89: só breadcrumb — sem _captureMessage 'info' (poluía o Sentry).
      if (window._log) window._log('[CasualJoin] loadCasualMatch', roomCode, _md);
    } catch(e) {}
    if (!match) {
      // v2.1.75: sala não existe (dissolvida por inatividade 12h, cancelada, ou
      // ponteiro pendurado). SELF-HEAL pra TODO MUNDO: limpa o activeCasualRoom
      // do perfil + sessionStorage (senão o usuário é puxado pra cá toda vez) e
      // manda pra dashboard — fallback seguro, sem ficar preso numa tela morta.
      try { sessionStorage.removeItem('_activeCasualRoom'); } catch (e) {}
      try {
        var _cuNF = window.AppStore && window.AppStore.currentUser;
        var _acr = _cuNF && _cuNF.activeCasualRoom;
        if (_cuNF && _cuNF.uid && _acr && String(_acr).toUpperCase() === String(roomCode).toUpperCase()) {
          window._suppressCasualResumeUntil = Date.now() + 8000;
          if (window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
            window.FirestoreDB.saveUserProfile(_cuNF.uid, { activeCasualRoom: null }).catch(function () {});
          }
          _cuNF.activeCasualRoom = null;
        }
      } catch (e) {}
      if (typeof showNotification === 'function') showNotification('Sala encerrada', 'Essa partida casual não existe mais.', 'info');
      try { window.location.replace('#dashboard'); } catch (e) { window.location.hash = '#dashboard'; }
      return;
    }

    var players = Array.isArray(match.players) ? match.players : [];
    // v2.1.77: o guard "sala vazia" do v2.1.76 foi REMOVIDO daqui — após mover o
    // ponteiro activeCasualRoom pra o INÍCIO da partida, o "resume" nunca aponta
    // pra um setup vazio, então não há o que barrar. E barrar aqui quebrava quem
    // entra por QR num setup ainda em montagem. Salas vazias abandonadas (sem
    // ponteiro) são dissolvidas pelo cleanup de 12h.

    var sportName = match.sport || _t('casual.title');
    var creatorName = match.createdByName || _t('casual.someone');
    var docId = match._docId;

    // v0.17.49: substitui o back-header inicial (href='#dashboard' simples)
    // por um que faz cancel/leave da partida ao voltar. Pedido do usuário:
    // "na partida casual o botão voltar antes da partida começar deve
    // retirar o participante efetivamente da partida. Se for o organizador
    // deve desmobilizar a partida casual e retirar a todos os demais
    // participantes." Lógica em uma função global pra capturar o estado
    // atual (createdBy/uid) no momento do clique.
    function _smartBack() {
      var _cuBack = (typeof _resolveCurrentUser === 'function') ? _resolveCurrentUser() : null;
      var _myUid = _cuBack && _cuBack.uid;
      var _isCreator = !!(_myUid && match.createdBy === _myUid);
      // Match já começou (active)? Apenas navega — não cancela uma partida
      // em andamento por engano. Mesma lógica do live scoring.
      var _matchStarted = match.status === 'active';
      if (_matchStarted) {
        if (typeof _evacuateToDashboard === 'function') _evacuateToDashboard();
        else { try { window.location.replace('#dashboard'); } catch(e) { window.location.hash = '#dashboard'; } }
        return;
      }
      if (_isCreator) {
        // Organizador volta → cancela a partida pra todos. cancelCasualMatch
        // deleta o doc; o lobby polling de cada guest detecta e evacua.
        try {
          if (docId && window.FirestoreDB && typeof window.FirestoreDB.cancelCasualMatch === 'function') {
            var p = window.FirestoreDB.cancelCasualMatch(docId);
            if (p && typeof p.catch === 'function') p.catch(function(){});
          }
        } catch(e) {}
        // Limpa marca de "partida ativa" do perfil + sessionStorage
        try {
          if (_myUid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
            window._suppressCasualResumeUntil = Date.now() + 6000;
            window.FirestoreDB.saveUserProfile(_myUid, { activeCasualRoom: null }).catch(function(){});
          }
        } catch(e) {}
        if (typeof showNotification === 'function') {
          showNotification(_t('casual.matchCancelled') || 'Partida cancelada', _t('casual.matchCancelledByYouMsg') || 'Partida desmobilizada — todos os participantes foram retornados ao dashboard.', 'info');
        }
        if (typeof _evacuateToDashboard === 'function') _evacuateToDashboard();
        else { try { window.location.replace('#dashboard'); } catch(e) { window.location.hash = '#dashboard'; } }
      } else {
        // Participante volta → libera só o slot dele. _casualLeaveMatch já
        // existe e faz tudo: leaveCasualMatch + cleanup + evacuate.
        if (typeof window._casualLeaveMatch === 'function') {
          window._casualLeaveMatch();
        } else if (typeof _evacuateToDashboard === 'function') {
          _evacuateToDashboard();
        } else {
          try { window.location.replace('#dashboard'); } catch(e) { window.location.hash = '#dashboard'; }
        }
      }
    }

    // Substitui o back-header existente no DOM por um com onClickOverride.
    if (container && typeof window._renderBackHeader === 'function') {
      try {
        var _newBackHtml = window._renderBackHeader({
          label: _t('btn.back') || 'Voltar',
          onClickOverride: _smartBack
        });
        var _existingBackHdr = container.querySelector('.sticky-back-header');
        if (_existingBackHdr) {
          _existingBackHdr.outerHTML = _newBackHtml;
        }
      } catch(e) {}
    }
    // Resolve the viewer identity — prefer the live AppStore.currentUser, but
    // fall back to the cached auth payload. On Safari/iOS the live currentUser
    // can briefly go null between transient onAuthStateChanged events; without
    // this fallback the lobby would flicker to the login screen and back.
    function _resolveCurrentUser() {
      var live = window.AppStore && window.AppStore.currentUser;
      if (live && live.uid) return live;
      try {
        var cached = JSON.parse(localStorage.getItem('scoreplace_authCache') || 'null');
        if (cached && cached.uid) return cached;
      } catch(e) {}
      return null;
    }
    var cu = _resolveCurrentUser();

    if (match.status === 'finished') {
      // Show result
      var result = match.result || {};
      var winnerTeam = result.winner;
      var winnerLabel = '';
      if (winnerTeam === 1) {
        winnerLabel = players.filter(function(p) { return p.team === 1; }).map(function(p) { return p.name; }).join(' / ');
      } else if (winnerTeam === 2) {
        winnerLabel = players.filter(function(p) { return p.team === 2; }).map(function(p) { return p.name; }).join(' / ');
      } else {
        winnerLabel = _t('casual.draw');
      }
      // v1.3.30-beta: abre o overlay de live scoring com o liveState
      // final salvo (state.isFinished=true), o que dispara automaticamente
      // a tela de comparativeSection com todas as estatísticas detalhadas
      // (pontos no saque, recepção, breaks, killer points, maior sequência,
      // maior vantagem, sets, games etc). Antes só mostrava placar resumido.
      // Bug reportado: amigo participante não viu stats ao final.
      if (match.liveState) {
        var p1NamesFin = players.filter(function(p) { return p.team === 1; }).map(function(p) { return p.name; });
        var p2NamesFin = players.filter(function(p) { return p.team === 2; }).map(function(p) { return p.name; });
        var scFin = match.scoring || {};
        // _openLiveScoring vai abrir overlay e o snapshot listener apply
        // o liveState (já contém isFinished=true), levando ao render da
        // tela de stats automaticamente. O overlay não vai redirecionar
        // de volta pra _renderCasualJoin (a guarda v1.3.30 mudou comportamento).
        try {
          window._openLiveScoring(null, null, {
            casual: true,
            scoring: scFin,
            p1Name: p1NamesFin.join(' / '),
            p2Name: p2NamesFin.join(' / '),
            title: sportName,
            sportName: sportName,
            isDoubles: match.isDoubles || false,
            casualDocId: docId,
            createdBy: match.createdBy,
            roomCode: roomCode,
            players: players,
            viewOnly: true
          });
          return;
        } catch (e) { /* fallback pro result screen abaixo */ }
      }
      // Fallback: liveState não disponível (cancel-after-finish edge case)
      // → mostra result screen simples com placar + vencedor.
      _setBody(
        '<div style="text-align:center;padding:2rem 1rem;max-width:500px;margin:0 auto;">' +
          '<div style="font-size:2.5rem;margin-bottom:0.5rem;">🏆</div>' +
          '<div style="font-size:1.2rem;font-weight:800;color:#fbbf24;margin-bottom:0.3rem;">' + _t('casual.closed') + '</div>' +
          '<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1.5rem;">' + _safe(sportName) + '</div>' +
          '<div style="background:var(--bg-darker);border-radius:14px;padding:1.2rem;margin-bottom:1rem;">' +
            '<div style="display:flex;justify-content:center;align-items:center;gap:1rem;margin-bottom:0.8rem;">' +
              '<div style="text-align:center;flex:1;">' +
                '<div style="font-size:0.95rem;font-weight:700;color:' + (winnerTeam === 1 ? '#22c55e' : 'var(--text-bright)') + ';">' + _safe(players.filter(function(p){return p.team===1;}).map(function(p){return p.name;}).join(' / ')) + '</div>' +
                '<div style="font-size:0.7rem;color:var(--text-muted);">' + _t('casual.team', {n: '1'}) + '</div>' +
              '</div>' +
              '<div style="font-size:1.5rem;font-weight:900;color:var(--text-muted);">vs</div>' +
              '<div style="text-align:center;flex:1;">' +
                '<div style="font-size:0.95rem;font-weight:700;color:' + (winnerTeam === 2 ? '#22c55e' : 'var(--text-bright)') + ';">' + _safe(players.filter(function(p){return p.team===2;}).map(function(p){return p.name;}).join(' / ')) + '</div>' +
                '<div style="font-size:0.7rem;color:var(--text-muted);">' + _t('casual.team', {n: '2'}) + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="font-size:1.3rem;font-weight:800;color:#38bdf8;letter-spacing:1px;">' + _safe(result.summary || '') + '</div>' +
            (winnerTeam !== 0 ? '<div style="font-size:0.82rem;color:#22c55e;margin-top:0.4rem;font-weight:600;">🏆 ' + _safe(winnerLabel) + '</div>' : '') +
          '</div>' +
          '<button class="btn btn-primary" onclick="window.location.hash=\'#dashboard\';" style="margin-top:0.5rem;">' + _t('casual.goToDashboard') + '</button>' +
        '</div>'
      );
      return;
    }

    if (match.status === 'active') {
      // v2.2.36-beta: ANTI-TRAVA. Um crash pode deixar uma sala 'active' parada
      // (todos saíram sem encerrar) e o resume jogava o usuário lá pra sempre.
      // Se a sala está ATIVA mas sem atividade há > 20min, é abandonada →
      // auto-dissolve: limpa ponteiro + sessionStorage, apaga o doc (se eu for
      // o criador) e vai pro dashboard, em vez de prender o usuário.
      var _laRaw = match.lastActivityAt;
      var _laMs = (typeof _laRaw === 'number') ? _laRaw : (_laRaw ? parseInt(_laRaw, 10) : 0);
      var _staleMs = 20 * 60 * 1000;
      if (_laMs && (Date.now() - _laMs) > _staleMs) {
        try { sessionStorage.removeItem('_activeCasualRoom'); } catch (e) {}
        try {
          var _cuStale = window.AppStore && window.AppStore.currentUser;
          if (_cuStale && _cuStale.uid) {
            window._suppressCasualResumeUntil = Date.now() + 8000;
            if (window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
              window.FirestoreDB.saveUserProfile(_cuStale.uid, { activeCasualRoom: null }).catch(function () {});
            }
            _cuStale.activeCasualRoom = null;
            // Só o criador apaga o doc (evita corrida). cancelCasualMatch pula
            // docs finished — aqui é active, então dissolve.
            if (match.createdBy && _cuStale.uid === match.createdBy && docId &&
                window.FirestoreDB && typeof window.FirestoreDB.cancelCasualMatch === 'function') {
              var _pStale = window.FirestoreDB.cancelCasualMatch(docId);
              if (_pStale && _pStale.catch) _pStale.catch(function () {});
            }
          }
        } catch (e) {}
        if (typeof showNotification === 'function') showNotification('Sala encerrada', 'A partida casual estava parada e foi encerrada.', 'info');
        try { window.location.replace('#dashboard'); } catch (e) { window.location.hash = '#dashboard'; }
        return;
      }
      // Open the live scoring overlay in real-time mode so all players can see and interact
      var p1Names = players.filter(function(p) { return p.team === 1; }).map(function(p) { return p.name; });
      var p2Names = players.filter(function(p) { return p.team === 2; }).map(function(p) { return p.name; });
      var p1Str = p1Names.join(' / ');
      var p2Str = p2Names.join(' / ');
      var sc = match.scoring || {};
      // v2.2.32-beta: carrega a config dos toggles persistida no doc pra que a
      // tela de estatísticas da nova partida volte com a MESMA configuração do
      // jogo anterior (e não sempre com Duplas Mistas ligado).
      var _scfg = (match.statsConfig && typeof match.statsConfig === 'object') ? match.statsConfig : {};
      var _liveOpts = {
        casual: true,
        scoring: sc,
        p1Name: p1Str,
        p2Name: p2Str,
        title: sportName,
        sportName: sportName,
        isDoubles: match.isDoubles || false,
        casualDocId: docId,
        createdBy: match.createdBy,
        roomCode: roomCode,
        players: players
      };
      if (typeof _scfg.autoShuffle === 'boolean') _liveOpts.autoShuffle = _scfg.autoShuffle;
      if (typeof _scfg.mixedDoubles === 'boolean') _liveOpts.mixedDoubles = _scfg.mixedDoubles;
      if (typeof _scfg.reiRainha === 'boolean') _liveOpts.reiRainhaMode = _scfg.reiRainha;
      // v2.2.33-beta: repassa o histórico da sessão pro Rei/Rainha retroativo.
      if (Array.isArray(match.sessionHistory)) _liveOpts.sessionHistory = match.sessionHistory;
      window._openLiveScoring(null, null, _liveOpts);
      // Show a brief toast so user knows they joined
      if (typeof showNotification === 'function') {
        showNotification(_t('casual.liveTitle'), _t('casual.liveConnectedMsg', {name: _safe(creatorName)}), 'success');
      }
      return;
    }

    // Status: waiting — auto-join + lobby
    var participants = Array.isArray(match.participants) ? match.participants : [];
    var _lobbyInterval = null;

    // v1.6.11-beta: SALA ÚNICA — todos os logados caem na MESMA tela de setup,
    // independente de quem criou. Não há mais host vs guest, todos têm os
    // mesmos poderes (editar nomes, formar times via drag-drop, mudar scoring,
    // iniciar a partida). Quando 2+ pessoas editam ao mesmo tempo, last-write
    // wins via debounce de 500ms no _syncCasualSetupDebounced + polling 3s
    // que ressincroniza _lobbyParticipants. Antes desta versão só o criador
    // caía em _openCasualMatch (v1.3.58-beta SW update edge case); entrantes
    // ficavam presos numa lobby readonly "Aguardando organizador iniciar".
    // joinCasualMatch é idempotente (arrayUnion) — se já estou em participants
    // não duplica; senão adiciona com displayName/photoURL atuais.
    if (cu && cu.uid) {
      var _meAlreadyIn = participants.some(function(p) { return p.uid === cu.uid; });
      if (!_meAlreadyIn) {
        // Insere localmente pra _openCasualMatch ter o estado correto desde
        // o primeiro render; persistência via joinCasualMatch em paralelo.
        participants.push({
          uid: cu.uid,
          displayName: cu.displayName || '',
          photoURL: cu.photoURL || '',
          joinedAt: new Date().toISOString()
        });
        try {
          if (docId && window.FirestoreDB && typeof window.FirestoreDB.joinCasualMatch === 'function') {
            var _joinPromise = window.FirestoreDB.joinCasualMatch(docId, cu.uid, cu.displayName || '', cu.photoURL || '');
            if (_joinPromise && typeof _joinPromise.catch === 'function') _joinPromise.catch(function(){});
          }
        } catch(e) {}
      }
      window._openCasualMatch({
        roomCode: roomCode,
        docId: docId,
        sport: match.sport || 'Beach Tennis',
        isDoubles: typeof match.isDoubles === 'boolean' ? match.isDoubles : true,
        participants: participants,
        players: players,
        scoring: match.scoring || null,
        createdBy: match.createdBy || null,
        slotLinkedUid: Array.isArray(match.slotLinkedUid) ? match.slotLinkedUid : null,
        slotGenders: (match.slotGenders && typeof match.slotGenders === 'object') ? match.slotGenders : null
      });
      return;
    }

    // Remember that we want to auto-join this casual match after login
    if (!cu || !cu.uid) {
      try { sessionStorage.setItem('_pendingCasualRoom', roomCode); } catch(e) {}
    }

    function _renderLobby() {
      if (_hasLeft) return;
      // Re-resolve identity on each render so we pick up the latest auth state
      // (Safari can have transient null/populated transitions between polls).
      cu = _resolveCurrentUser();
      var isLoggedIn = !!(cu && cu.uid);
      var myUid = isLoggedIn ? cu.uid : null;
      var alreadyJoined = myUid && participants.some(function(p) { return p.uid === myUid; });
      var isCreator = myUid && match.createdBy === myUid;
      var totalNeeded = match.isDoubles ? 4 : 2;

      var html;
      if (!isLoggedIn) {
        // Elegant login-first screen: minimal header + login buttons at top.
        // All sign-in methods (Google, email/password, magic link, SMS) via modal-login.
        html =
          '<div style="max-width:440px;margin:0 auto;padding:1.5rem 1rem;">' +
            // Elegant minimal header — just sport + creator, no giant icons
            '<div style="text-align:center;padding:1rem 0 1.25rem;border-bottom:1px solid var(--border-color, rgba(255,255,255,0.08));margin-bottom:1.25rem;">' +
              '<div style="font-size:0.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;">' + _t('casual.title') + '</div>' +
              '<div style="font-size:1rem;font-weight:700;color:var(--text-bright);margin-top:4px;">' + _safe(sportName) + (match.isDoubles ? ' · ' + _t('casual.doubles') : ' · ' + _t('casual.single')) + '</div>' +
              '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">' + _t('casual.createdBy', {name: _safe(creatorName)}) + '</div>' +
            '</div>' +
            // Login card at the top
            '<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:14px;padding:1.25rem 1rem;text-align:center;">' +
              '<div style="font-size:1rem;font-weight:700;color:var(--text-bright);margin-bottom:0.35rem;">' + _t('casual.loginToJoin') + '</div>' +
              '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem;">' + _t('casual.loginToJoinMsg') + '</div>' +
              '<button class="btn btn-primary" style="width:100%;margin-bottom:8px;font-weight:700;" onclick="if(typeof openModal===\'function\')openModal(\'modal-login\');">' +
                '🔐 ' + _t('casual.loginBtn') +
              '</button>' +
              '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.5rem;">' + _t('casual.loginMethodsHint') + '</div>' +
            '</div>' +
            // Participants preview below login, subdued
            '<div style="margin-top:1.5rem;opacity:0.75;">' +
              '<div style="font-size:0.68rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;text-align:center;">' +
                _t('casual.playersInRoom', {count: participants.length, total: totalNeeded}) +
              '</div>';
        for (var li = 0; li < participants.length; li++) {
          var lpp = participants[li];
          var lAvH = lpp.photoURL ?
            '<img src="' + _safe(lpp.photoURL) + '" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
            '<div style="display:none;width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);align-items:center;justify-content:center;font-size:0.75rem;color:white;font-weight:700;flex-shrink:0;">' + _safe((lpp.displayName || 'J')[0].toUpperCase()) + '</div>' :
            '<div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:white;font-weight:700;flex-shrink:0;">' + _safe((lpp.displayName || 'J')[0].toUpperCase()) + '</div>';
          html += '<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;margin-bottom:3px;">' +
            lAvH +
            '<span style="font-size:0.8rem;color:var(--text-bright);">' + _safe(lpp.displayName || _t('casual.playerFallback')) + '</span>' +
          '</div>';
        }
        html += '</div>' +
          // v0.17.49: removido botão "Voltar ao Dashboard" do final — o
          // "Voltar" do topo já navega pro dashboard.
        '</div>';
        _setBody(html);
        return;
      }

      // v0.17.51: padding/margens reduzidos pra caber melhor em mobile.
      // padding 1.5rem → 0.5rem top + 1rem horizontal; ⚡ font 2.5→1.8rem;
      // h2 1.3→1.15rem; title margin-bottom 0.2→0.15rem; sub margin
      // 0.3→0.2rem; "Criada por" margin-bottom 1.5→0.8rem; participants
      // list margin-bottom 1.5→0.8rem. Hierarquia preservada.
      html =
        '<div style="text-align:center;padding:0.5rem 1rem 1rem;max-width:500px;margin:0 auto;">' +
          '<div style="font-size:1.8rem;margin-bottom:0.25rem;line-height:1;">⚡</div>' +
          '<div style="font-size:1.15rem;font-weight:800;color:#38bdf8;margin-bottom:0.15rem;">' + _t('casual.title') + '</div>' +
          '<div style="font-size:0.88rem;color:var(--text-muted);margin-bottom:0.2rem;">' + _safe(sportName) + (match.isDoubles ? ' · ' + _t('casual.doubles') : ' · ' + _t('casual.single')) + '</div>' +
          '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:0.8rem;">' + _t('casual.createdBy', {name: _safe(creatorName)}) + '</div>';

      // v1.6.11-beta: pré-calcula guests nomeados pelo host pra que o contador
      // "N de M jogadores" reflita a realidade (logados + guests digitados).
      var _matchPlayersPre = Array.isArray(match.players) ? match.players : [];
      var _defaultNamesPre = ['Jogador 1','Jogador 2','Jogador 3','Jogador 4','Parceiro','Adversário 1','Adversário 2'];
      var _loggedUidsPre = {};
      for (var _lpiPre = 0; _lpiPre < participants.length; _lpiPre++) {
        if (participants[_lpiPre] && participants[_lpiPre].uid) _loggedUidsPre[participants[_lpiPre].uid] = true;
      }
      var _guestCount = 0;
      for (var _mpiPre = 0; _mpiPre < _matchPlayersPre.length; _mpiPre++) {
        var _mpPre = _matchPlayersPre[_mpiPre];
        if (!_mpPre || !_mpPre.name) continue;
        var _nmPre = String(_mpPre.name).trim();
        if (!_nmPre || _defaultNamesPre.indexOf(_nmPre) !== -1) continue;
        if (_mpPre.uid && _loggedUidsPre[_mpPre.uid]) continue;
        _guestCount++;
      }
      _guestCount = Math.min(_guestCount, totalNeeded - participants.length);
      var _effectiveCount = participants.length + _guestCount;

      // Participants list
      html += '<div style="margin-bottom:0.8rem;">' +
        '<div style="font-size:0.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">' + _t('casual.playersInRoom', {count: _effectiveCount, total: totalNeeded}) + '</div>';

      for (var i = 0; i < participants.length; i++) {
        var pp = participants[i];
        var isMe = myUid && pp.uid === myUid;
        var isHost = pp.uid === match.createdBy;
        var avatarH = pp.photoURL ?
          '<img src="' + _safe(pp.photoURL) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(255,255,255,0.15);" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div style="display:none;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);align-items:center;justify-content:center;font-size:0.85rem;color:white;font-weight:700;flex-shrink:0;">' + _safe((pp.displayName || 'J')[0].toUpperCase()) + '</div>' :
          '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:0.85rem;color:white;font-weight:700;flex-shrink:0;">' + _safe((pp.displayName || 'J')[0].toUpperCase()) + '</div>';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;margin-bottom:6px;' +
          'background:' + (isMe ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)') + ';' +
          'border:1px solid ' + (isMe ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)') + ';">' +
          avatarH +
          '<div style="flex:1;text-align:left;">' +
            '<div style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">' + _safe(pp.displayName || _t('casual.playerFallback')) +
              (isMe ? ' <span style="color:#22c55e;font-size:0.68rem;">(' + _t('casual.you') + ')</span>' : '') +
              (isHost ? ' <span style="color:#fbbf24;font-size:0.68rem;">👑</span>' : '') +
            '</div>' +
          '</div>' +
          (isMe && !isHost ? '<button class="btn btn-danger btn-micro" onclick="window._casualLeaveMatch()" style="font-size:0.7rem;white-space:nowrap;">' + _t('casual.leave') + '</button>' : '<div style="font-size:1rem;">✅</div>') +
        '</div>';
      }

      // v1.6.11-beta: guests nomeados pelo host (slots com nome non-default mas
      // sem uid logado) agora aparecem no lobby da amiga. Antes o loop "Empty
      // slots" mostrava só "Aguardando jogador..." pra todo slot não-logado,
      // mesmo quando o host já tinha digitado "Maria" / "João". Agora o lobby
      // reflete os players[] que o setup persiste no Firestore via
      // _syncCasualSetupDebounced (debounce 500ms a cada keystroke).
      var _matchPlayersAll = Array.isArray(match.players) ? match.players : [];
      var _defaultNames = ['Jogador 1','Jogador 2','Jogador 3','Jogador 4','Parceiro','Adversário 1','Adversário 2'];
      var _loggedUids = {};
      for (var _lpi = 0; _lpi < participants.length; _lpi++) {
        if (participants[_lpi] && participants[_lpi].uid) _loggedUids[participants[_lpi].uid] = true;
      }
      // Coletar guests nomeados: nome non-default + (sem uid OU uid não está em loggedUids)
      var _namedGuests = [];
      for (var _mpi = 0; _mpi < _matchPlayersAll.length; _mpi++) {
        var _mp = _matchPlayersAll[_mpi];
        if (!_mp || !_mp.name) continue;
        var _nm = String(_mp.name).trim();
        if (!_nm || _defaultNames.indexOf(_nm) !== -1) continue;
        if (_mp.uid && _loggedUids[_mp.uid]) continue; // already in participants list above
        _namedGuests.push(_mp);
      }
      // Renderiza guests até preencher os slots restantes
      var _slotsLeft = totalNeeded - participants.length;
      var _guestsToShow = Math.min(_namedGuests.length, _slotsLeft);
      for (var _gi = 0; _gi < _guestsToShow; _gi++) {
        var _g = _namedGuests[_gi];
        var _gAvH = _g.photoURL ?
          '<img src="' + _safe(_g.photoURL) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(255,255,255,0.15);" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div style="display:none;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#64748b,#475569);align-items:center;justify-content:center;font-size:0.85rem;color:white;font-weight:700;flex-shrink:0;">' + _safe((_g.name || 'J')[0].toUpperCase()) + '</div>' :
          '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#64748b,#475569);display:flex;align-items:center;justify-content:center;font-size:0.85rem;color:white;font-weight:700;flex-shrink:0;">' + _safe((_g.name || 'J')[0].toUpperCase()) + '</div>';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;margin-bottom:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);">' +
          _gAvH +
          '<div style="flex:1;text-align:left;">' +
            '<div style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">' + _safe(_g.name) +
              ' <span style="color:var(--text-muted);font-size:0.65rem;font-weight:500;">(convidado)</span>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:1rem;">✅</div>' +
        '</div>';
      }
      // Slots realmente vazios (totalNeeded - logados - guests nomeados)
      var _emptySlots = _slotsLeft - _guestsToShow;
      for (var j = 0; j < _emptySlots; j++) {
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;margin-bottom:6px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);">' +
          '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:0.85rem;color:var(--text-muted);flex-shrink:0;">?</div>' +
          '<div style="flex:1;text-align:left;">' +
            '<div style="font-size:0.82rem;color:var(--text-muted);">' + _t('casual.waitingPlayer') + '</div>' +
          '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-muted);">⏳</div>' +
        '</div>';
      }
      html += '</div>';

      // Live team preview — show the teams the organizer is assembling (visible to invited players too)
      // Only render when the organizer has explicitly formed teams (drag-and-drop),
      // so breaking teams on the host propagates instantly to every guest.
      var matchPlayers = Array.isArray(match.players) ? match.players : [];
      var hasNamedPlayer = matchPlayers.some(function(mp) {
        if (!mp || !mp.name) return false;
        var defaults = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4', 'Parceiro', 'Adversário 1', 'Adversário 2'];
        return defaults.indexOf(mp.name) === -1;
      });
      if (match.isDoubles && matchPlayers.length === 4 && hasNamedPlayer && match.teamsFormed === true) {
        var t1 = matchPlayers.filter(function(mp) { return mp.team === 1; });
        var t2 = matchPlayers.filter(function(mp) { return mp.team === 2; });
        var _teamCard = function(team, clr, bg, bdr) {
          var chips = team.map(function(mp) {
            var avH;
            if (mp.photoURL) {
              avH = '<img src="' + _safe(mp.photoURL) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1.5px solid ' + clr + ';" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
                '<div style="display:none;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);align-items:center;justify-content:center;font-size:0.7rem;color:white;font-weight:700;flex-shrink:0;">' + _safe((mp.name || 'J')[0].toUpperCase()) + '</div>';
            } else {
              avH = '<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:white;font-weight:700;flex-shrink:0;">' + _safe((mp.name || 'J')[0].toUpperCase()) + '</div>';
            }
            return '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,0.04);">' + avH +
              '<span style="font-size:0.8rem;font-weight:700;color:' + clr + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _safe(mp.name || '—') + '</span></div>';
          }).join('');
          return '<div style="flex:1;min-width:0;padding:10px;border-radius:12px;background:' + bg + ';border:1px solid ' + bdr + ';display:flex;flex-direction:column;gap:5px;">' +
            '<div style="font-size:0.55rem;font-weight:800;color:' + clr + ';text-transform:uppercase;letter-spacing:1px;text-align:center;">' + _t('casual.team', {n: team === t1 ? '1' : '2'}) + '</div>' +
            chips +
          '</div>';
        };
        html += '<div style="margin-bottom:1.2rem;">' +
          '<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">' + _t('casual.teamsFormed') + '</div>' +
          '<div style="display:flex;gap:8px;align-items:stretch;">' +
            _teamCard(t1, '#60a5fa', 'rgba(59,130,246,0.08)', 'rgba(59,130,246,0.25)') +
            '<div style="display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:900;color:var(--text-muted);">VS</div>' +
            _teamCard(t2, '#f87171', 'rgba(239,68,68,0.08)', 'rgba(239,68,68,0.25)') +
          '</div>' +
        '</div>';
      }

      // Status messages — v0.17.51: padding 14→10px, margin 1rem→0.6rem
      if (alreadyJoined) {
        html += '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:10px 12px;margin-bottom:0.6rem;display:flex;align-items:center;gap:10px;text-align:left;">' +
          '<div style="font-size:1.2rem;flex-shrink:0;">✅</div>' +
          '<div>' +
            '<div style="font-size:0.82rem;color:#22c55e;font-weight:700;">' + _t('casual.youreIn') + '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:1px;">' + _t('casual.waitOrganizerStart') + (_effectiveCount < totalNeeded ? ' (' + _t(totalNeeded - _effectiveCount > 1 ? 'casual.slotsLeft' : 'casual.slotLeft', {n: totalNeeded - _effectiveCount}) + ')' : '') + '</div>' +
          '</div>' +
        '</div>';
      }

      // Animated waiting indicator — v0.17.51: padding 12→6px, margin 1rem→0
      html += '<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:6px;margin-bottom:0;">' +
        '<div style="width:8px;height:8px;border-radius:50%;background:#38bdf8;animation:casualPulse 1.5s ease-in-out infinite;"></div>' +
        '<div style="width:8px;height:8px;border-radius:50%;background:#38bdf8;animation:casualPulse 1.5s ease-in-out 0.3s infinite;"></div>' +
        '<div style="width:8px;height:8px;border-radius:50%;background:#38bdf8;animation:casualPulse 1.5s ease-in-out 0.6s infinite;"></div>' +
        '<span style="font-size:0.75rem;color:var(--text-muted);margin-left:4px;">' + _t('casual.autoUpdate') + '</span>' +
      '</div>' +
      '<style>@keyframes casualPulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}</style>';

      // v0.17.49: removido botão "Voltar ao Dashboard" do final — a partir
      // dessa versão o "Voltar" do topo já faz cancel (organizador) ou
      // leave (participante) automaticamente. Botão extra duplicava função.
      html += '</div>';

      _setBody(html);
    }

    // Auto-join: add logged-in user to match participants
    async function _autoJoin() {
      if (_hasLeft) return;
      cu = _resolveCurrentUser();
      if (!cu || !cu.uid || !docId) return;
      var alreadyIn = participants.some(function(p) { return p.uid === cu.uid; });
      if (alreadyIn) return;
      var ok = await window.FirestoreDB.joinCasualMatch(docId, cu.uid, cu.displayName || '', cu.photoURL || '');
      if (_hasLeft) return; // User left while the request was in flight
      if (ok) {
        participants.push({ uid: cu.uid, displayName: cu.displayName || '', photoURL: cu.photoURL || '', joinedAt: new Date().toISOString() });
        _renderLobby();
        if (typeof showNotification === 'function') showNotification(_t('casual.joinedMatch'), _t('casual.waitOrganizer'), 'success');
        // v0.17.48: backup síncrono em sessionStorage pra guests também —
        // se o auto-update fizer reload no meio da partida, o boot check
        // do app reabre a sala. Sem isto o guest dependia só da URL.
        try { sessionStorage.setItem('_activeCasualRoom', roomCode); } catch(e) {}
      }
    }

    // Force-navigate the guest back to the dashboard. Relying only on
    // `window.location.hash = '#dashboard'` is fragile in in-app browsers
    // (iOS QR scanner, WhatsApp webview) where hashchange sometimes doesn't
    // fire — so we also clear the container and render the dashboard directly.
    // v0.17.48: limpeza adicional + força re-route quando hash já é #dashboard.
    function _evacuateToDashboard() {
      // Limpa marca de "estou em partida" — sem isto, o boot check do app
      // reabriria a sala no próximo load.
      try { sessionStorage.removeItem('_activeCasualRoom'); } catch(e) {}
      try { sessionStorage.removeItem('_pendingCasualRoom'); } catch(e) {}
      // Render dashboard imediatamente no container atual — visualmente
      // tira o usuário da página de partida sem esperar o router.
      try {
        var _vc = container || document.getElementById('view-container');
        if (_vc && typeof renderDashboard === 'function') {
          _vc.innerHTML = '';
          renderDashboard(_vc);
        }
      } catch(e) {}
      // Em paralelo, atualiza o hash. Se já estiver em #dashboard (caso
      // raro mas observado em alguns reloads), força re-route via initRouter
      // pra garantir que o estado interno do app reflita a navegação.
      try {
        if (window.location.hash !== '#dashboard') {
          window.location.replace('#dashboard');
        } else if (typeof window.initRouter === 'function') {
          window.initRouter();
        }
      } catch(e) {
        try { window.location.hash = '#dashboard'; } catch(e2) {}
      }
    }
    // Expose so inline onclick handlers (non-logged-in button) can reach it

    // Periodic refresh to see new players and detect match start
    function _startLobbyRefresh() {
      _lobbyInterval = setInterval(async function() {
        if (_hasLeft) return;
        try {
          var fresh = await window.FirestoreDB.loadCasualMatch(roomCode);
          // Guard: user clicked "Sair" during the in-flight await. Without this,
          // the resolved callback would overwrite the dashboard with the lobby
          // HTML and the guest would appear stuck on the match screen.
          if (_hasLeft) return;
          // Match was cancelled/deleted by the organizer — evacuate everyone
          // still on the lobby screen so they don't stay stuck on a ghost room.
          if (!fresh || fresh.status === 'cancelled') {
            _hasLeft = true;
            _casualLobbyCleanup();
            if (typeof showNotification === 'function') showNotification(_t('casual.matchCancelled'), _t('casual.matchCancelledMsg'), 'info');
            _evacuateToDashboard();
            return;
          }
          // Match started? Switch to live scoring
          if (fresh.status === 'active') {
            _casualLobbyCleanup();
            var pp = Array.isArray(fresh.players) ? fresh.players : [];
            var p1n = pp.filter(function(p) { return p.team === 1; }).map(function(p) { return p.name; }).join(' / ');
            var p2n = pp.filter(function(p) { return p.team === 2; }).map(function(p) { return p.name; }).join(' / ');
            window._openLiveScoring(null, null, {
              casual: true, scoring: fresh.scoring || {}, p1Name: p1n, p2Name: p2n,
              title: fresh.sport || _t('casual.title'), sportName: fresh.sport || '',
              isDoubles: fresh.isDoubles || false, casualDocId: fresh._docId,
              createdBy: fresh.createdBy,
              roomCode: roomCode, players: pp
            });
            if (typeof showNotification === 'function') showNotification(_t('casual.matchStarted'), '', 'success');
            return;
          }
          // Update participants and keep match snapshot in sync so the lobby
          // re-renders with latest team assignments set by the organizer.
          participants = Array.isArray(fresh.participants) ? fresh.participants : [];
          match = fresh;
          if (_hasLeft) return;
          _renderLobby();
        } catch(e) {}
      }, 3000);
    }

    // Flag so an in-flight _autoJoin doesn't re-add the user right after they leave
    var _hasLeft = false;

    // Leave match handler — releases the slot, stops refresh, and navigates to dashboard
    // regardless of how the leave request resolves (user must never stay stuck).
    window._casualLeaveMatch = function() {
      if (_hasLeft) return;
      _hasLeft = true;
      _casualLobbyCleanup();
      var _cuLeave = _resolveCurrentUser();
      var userUid = _cuLeave && _cuLeave.uid;
      // Fire-and-forget leave so the user isn't blocked by a slow Firestore round-trip
      if (userUid && docId && window.FirestoreDB && typeof window.FirestoreDB.leaveCasualMatch === 'function') {
        try {
          var p = window.FirestoreDB.leaveCasualMatch(docId, userUid);
          if (p && typeof p.catch === 'function') p.catch(function(){});
        } catch(e) {}
      }
      if (typeof showNotification === 'function') showNotification(_t('casual.leftMatch'), '', 'info');
      // Clear any auto-rejoin pointer so the guest doesn't get pulled back in
      try { sessionStorage.removeItem('_pendingCasualRoom'); } catch(e) {}
      // Navigate immediately — render dashboard directly AND update the hash,
      // so in-app browsers that swallow hashchange still see the dashboard.
      _evacuateToDashboard();
    };

    // Cleanup on leave
    function _casualLobbyCleanup() {
      if (_lobbyInterval) { clearInterval(_lobbyInterval); _lobbyInterval = null; }
    }
    window._casualLobbyCleanup = _casualLobbyCleanup;

    _renderLobby();
    _autoJoin();
    _startLobbyRefresh();
  }).catch(function(err) {
    window._error('Error loading casual match:', err);
    try { if (window._captureException) window._captureException(err, { area: 'renderCasualJoin', roomCode: roomCode }); } catch(e) {}
    _setBody(
      '<div style="text-align:center;padding:3rem 1rem;">' +
        '<div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>' +
        '<div style="font-size:1.1rem;font-weight:700;color:var(--text-bright);margin-bottom:0.5rem;">' + _t('casual.loadError') + '</div>' +
        '<p style="color:var(--text-muted);font-size:0.85rem;">' + _t('casual.loadErrorMsg') + '</p>' +
        '<button class="btn btn-primary" onclick="window.location.hash=\'#dashboard\';" style="margin-top:1rem;">' + _t('casual.goToDashboard') + '</button>' +
      '</div>'
    );
  });
};

// _closeRound is in bracket-logic.js
