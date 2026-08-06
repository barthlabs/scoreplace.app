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
// v1.7.21 — O AUSENTE DO W.O. GUARDA O UID, NÃO SÓ O NOME (regra do dono: "sempre por
// uid quando houver; só nome quando for nome digitado").
// `g.woAbsent` sempre foi NOME PURO, e isso vazava pra tela: na classificação do grupo o
// ausente ficava sem uid, o 💬 não aparecia e a ficha abria por nome — que nem resolve,
// porque o save stripa o nome de toda entrada com uid ([[project_uid_identity_canon_locked]]).
// Medido no Confra: a Thereza (R1 Grupo W) só tinha uid no marcador de W.O. da rodada.
// ⚠️ CHAMAR ANTES DE QUALQUER MUTAÇÃO. O `_rewriteSlot` troca o ausente pelo substituto
// no elenco do grupo; depois disso `players.indexOf(nome)` não acha mais nada e o uid se
// perde em silêncio. Foi essa ordem que já mordeu na v1.6.88 (slot com uid null).
// Devolve '' pra quem não tem conta (fictício/nome digitado) — aí o nome é tudo que há.
function _woAbsentUidOf(group, name) {
  if (!group || !name) return '';
  var i = (group.players || []).indexOf(name);
  var u = (i >= 0) ? (group.playersUids || [])[i] : null;
  return u ? String(u) : '';
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
  // v4.5.84 (ITEM 3 · Fase 3): nome VIVO por uid (perfil) — aditivo, resolve entrada só-uid
  // (sem p1Name/p2Name gravado, pós-Fase-4). Nunca sobrescreve a chave de nome gravado.
  var _live = (typeof window._nameForUid === 'function') ? window._nameForUid : null;
  function _putLive(uid) {
    if (!_live || !uid) return;
    var ln = String(_live(uid) || '').trim();
    if (ln && !map[ln]) map[ln] = uid;
  }
  (Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {})).forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    var nm = p.displayName || p.name || '';
    if (nm && p.uid) map[nm] = p.uid;
    if (p.p1Name && p.p1Uid) map[p.p1Name] = p.p1Uid;
    if (p.p2Name && p.p2Uid) map[p.p2Name] = p.p2Uid;
    (p.participants || []).forEach(function (sp) { if (sp && (sp.displayName || sp.name) && sp.uid) map[sp.displayName || sp.name] = sp.uid; });
    _putLive(p.p1Uid); _putLive(p.p2Uid); _putLive(p.uid);
    (p.participants || []).forEach(function (sp) { if (sp) _putLive(sp.uid); });
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
  // v4.5.71: identidade por uid no slot real (p1). W.O. é sentinela (sem uid).
  var _woUid = (typeof window._buildNameToUid === 'function') ? (window._buildNameToUid(t) || {})[name] : null;
  if (_woUid) { o.p1Uid = _woUid; o.team1Uids = [_woUid]; }
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
  // v4.5.71: identidade por uid no slot real (p1). FOLGA é sentinela (sem uid).
  var _foUid = (typeof window._buildNameToUid === 'function') ? (window._buildNameToUid(t) || {})[name] : null;
  if (_foUid) { o.p1Uid = _foUid; o.team1Uids = [_foUid]; }
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
  // v1.7.59: o passo seguinte é a CONFIRMAÇÃO do W.O. — não há mais escolha de destino
  // (W.O. SEMPRE desativa). Quem assume a vaga é o primeiro da fila, automaticamente.
  var rows = players.map(function (p) {
    return '<button class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;" onclick="window._ligaWoConfirm(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(p) + '\')">' + _safe(p) + '</button>';
  }).join('');
  if (window.showAlertDialog) {
    window.showAlertDialog('Quem não pôde jogar?',
      '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;">Quem for escolhido leva <b>W.O.</b> (0 pontos nesta rodada) e vai para os <b>Desativados</b> — e o primeiro da fila assume a vaga.</div>' + rows,
      function () {}, { type: 'warning', confirmText: 'Fechar' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PASSO 2 — W.O. DESATIVA. SEMPRE. (v1.7.59)
//
// ⚠️ ESTA REGRA SUBSTITUI A ESCOLHA 1×2 DA v1.6.88/v1.6.90 (desativados × fim da fila).
// Ordem do dono (06/ago/2026), depois do caso da Eliane Cinelli no Confra:
//   1. dar W.O. → o participante fica com status W.O. **e desativado** (toggle off);
//   2. se ele mesmo se reativar (toggle on) → aí sim vai pra **lista de espera**;
//   3. vale pra TODOS que levarem W.O. — não é decisão de ninguém, é o fluxo.
//
// POR QUE A ESCOLHA SAIU: o default do diálogo era 'waitlist' (o "menos punitivo"), e
// MEDIDO em produção foi exatamente isso que aconteceu — a Eliane levou W.O. no R1 Grupo Z
// e foi parar em `standbyParticipants` com `woSentToWaitlistAt`, sem nunca ter pedido pra
// voltar. Quem leva W.O. não escolheu jogar: colocá-lo direto na fila afirma uma
// disponibilidade que ele não declarou, e ainda o põe na frente de quem está esperando.
// A fila passa a ser consequência de um ATO DELE (religar o toggle), nunca do W.O.
//
// O que continua igual: 0 pts na rodada, o primeiro da fila assume a vaga e fica até o
// fim do torneio, e o ciclo notifica todo mundo ao fechar.
window._ligaWoConfirm = function (tId, roundIndex, groupName, absentName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  var sub = _ligaNextSuplente(t, group, absentName);
  var _woPenVal = (typeof window._woAdvPenalty === 'function') ? window._woAdvPenalty(t) : 0;

  var html = '<div style="font-size:0.85rem;opacity:0.9;margin-bottom:12px;"><b>' + _safe(absentName) + '</b> leva W.O. — 0 pts nesta rodada' + (_woPenVal ? ' e ' + _woPenVal + ' nos Pontos Avançados' : '') + '.</div>';

  // Quem assume — mostrado ANTES de confirmar: o organizador tem que saber quem entra.
  if (sub) {
    html += '<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:10px;margin-bottom:14px;">' +
      '<div style="font-size:0.72rem;font-weight:700;color:#4ade80;margin-bottom:4px;">✅ QUEM ASSUME A VAGA</div>' +
      '<div style="font-size:0.95rem;font-weight:700;">' + _safe(_wlDisplay(sub)) + '</div>' +
      '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Primeiro da lista de espera. Assume a vaga agora e <b>fica até o fim do torneio</b> — sai só se levar W.O.</div>' +
    '</div>';
  } else {
    html += '<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.3);border-radius:10px;padding:10px;margin-bottom:14px;font-size:0.78rem;color:#fbbf24;">' +
      '⚠️ <b>A lista de espera está vazia</b> — ninguém assume a vaga automaticamente. O grupo fica com a vaga aberta; você ainda pode convidar quem ficou de fora ou completar com Jogador X.' +
    '</div>';
  }

  // Sem escolha: o destino é UM só. O box explica o que acontece e como se volta.
  html += _ligaWoDestBox(absentName);
  html += '<button class="btn btn-danger" style="width:100%;font-weight:800;" onclick="window._ligaApplyWo(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(absentName) + '\')">🚫 Aplicar W.O.</button>';

  if (window.showAlertDialog) window.showAlertDialog('Confirmar W.O.?', html, function () {}, { type: 'warning', confirmText: 'Cancelar' });
};

// O SUPLENTE = primeiro da fila que atende a CATEGORIA do grupo. A ordem manda; a
// categoria só peneira (torneio sem categoria → o primeiro, ponto).
// [[project_wo_individual_substitution_rule]]: nunca colocar alguém que quebre a
// categoria — mas também nunca reordenar a fila por "melhor encaixe".
function _ligaNextSuplente(t, group, absentName) {
  var cat = _groupCategory(group);
  var inGroup = {}; (group.players || []).forEach(function (n) { inGroup[String(n)] = 1; });
  return window._waitlistFirst(t, function (e) {
    var nm = _wlDisplay(e);
    if (!nm || nm === absentName || inGroup[nm]) return false;
    if (nm.indexOf(' / ') !== -1) return false;      // dupla já formada não assume vaga individual
    if (!cat) return true;
    if (typeof window._participantInCategory === 'function') {
      try { return !!window._participantInCategory(e, cat, t); } catch (err) { return true; }
    }
    return true;
  });
}
window._ligaNextSuplente = _ligaNextSuplente;

// Aplica o W.O. inteiro numa mutação só: marca o ausente, DESATIVA-o e põe o primeiro da
// fila no lugar dele — no grupo E no elenco.
window._ligaApplyWo = function (tId, roundIndex, groupName, absentName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) { if (window.showNotification) window.showNotification('W.O.', 'Só o organizador ou um jogador do grupo pode fazer isso.', 'info'); return; }
  var _sub = _ligaNextSuplente(t, group, absentName);
  var _subName = _sub ? _wlDisplay(_sub) : '';
  var _cat = _groupCategory(group);
  _closeDialogs();

  _commitLiga(tId, function (ft) {
    var g = _getGroup(ft, roundIndex, groupName); var r = ft.rounds && ft.rounds[roundIndex];
    if (!g || !r) return;

    // (1) marca o W.O. da rodada (0 pts) — igual ao fluxo antigo
    var _absU = _woAbsentUidOf(g, absentName); // antes de qualquer mutação do elenco
    _addWoMarker(ft, r, roundIndex, absentName, _cat);
    g.woAbsent = absentName;
    g.woDest = 'inactive';   // v1.7.59: destino único — W.O. desativa
    if (_absU) g.woAbsentUid = _absU; else delete g.woAbsentUid;

    // (2) o suplente ASSUME — no grupo e no ELENCO. Entrar em participants é o que faz
    // "ocupa a posição até o final do torneio": em Liga cada rodada é sorteada de novo a
    // partir de participants, então quem fica só no grupo desta rodada sumiria na próxima.
    if (_subName) {
      var _subEntry = null;
      try { _subEntry = JSON.parse(JSON.stringify(_sub)); } catch (e) { _subEntry = _sub; }
      // ORDEM IMPORTA: entrar no ELENCO vem ANTES de reescrever o slot. _rewriteSlot
      // resolve o uid do substituto por _buildNameToUid(ft) — se ele ainda não está em
      // participants (e já saiu da espera), o mapa não o acha e o slot fica com uid null:
      // o jogo passaria a apontar pra ninguém. Bug pego pelo teste.
      if (_subEntry && typeof _subEntry === 'object') {
        _subEntry.ligaActive = true;
        _subEntry.woSubstituteFor = absentName;          // rastro: entrou por W.O., não por sorteio
        _subEntry.woSubstituteAt = new Date().toISOString();
        if (!Array.isArray(ft.participants)) ft.participants = ft.participants ? Object.values(ft.participants) : [];
        var _jaNoElenco = ft.participants.some(function (p) {
          if (!p || typeof p !== 'object') return false;
          if (_subEntry.uid && p.uid) return p.uid === _subEntry.uid;
          return _wlDisplay(p) === _subName;
        });
        if (!_jaNoElenco) ft.participants.push(_subEntry);
      }
      window._removeFromWaitlist(ft, _subName);          // sai da fila (assumiu)
      _removeSitOut(r, _subName);                        // não é mais folga — vai jogar
      _rewriteSlot(g, absentName, _subName, true, ft);
      g.subStatus = 'filled'; g.subName = _subName; g.subIsGuest = false; delete g.pendingInviteId;
    } else {
      g.subStatus = 'open';                              // fila vazia: vaga aberta (convite/Jogador X)
    }

    // (3) O AUSENTE É DESATIVADO — sempre (v1.7.59).
    _ligaWoDeactivate(ft, absentName);
  });

  if (window.showNotification) {
    window.showNotification('W.O. aplicado',
      _subName ? (absentName + ' foi para os Desativados. ' + _subName + ' assumiu a vaga e fica até o fim do torneio.')
               : (absentName + ' foi para os Desativados. A lista de espera está vazia — a vaga ficou aberta.'),
      'success');
  }
  _rerender(tId);
};


// ─────────────────────────────────────────────────────────────────────────────
// DESFECHO DO W.O. — PONTO ÚNICO (v1.7.59): quem leva W.O. FICA NO ELENCO, DESATIVADO.
//
// ⚠️ A escolha 1×2 da v1.6.88/v1.6.90 (desativados × fim da fila) FOI REMOVIDA por ordem
// do dono. Não é um parâmetro que virou default: o caminho pra fila deixou de existir
// AQUI de propósito, porque a fila só pode ser consequência de a pessoa se reativar.
// Se alguém reintroduzir um `dest` neste ponto, o teste `wo-sempre-desativa` fica vermelho.
//
// Ao reativar, `_toggleLigaActive` (tournaments-enrollment.js) o manda pro FIM da fila —
// é lá que mora a segunda metade da regra, e ela depende DESTA marca (`woDeactivatedAt`).
function _ligaWoDeactivate(ft, absentName) {
  var _parts = Array.isArray(ft.participants) ? ft.participants : (ft.participants ? Object.values(ft.participants) : []);
  var _i = -1;
  for (var k = 0; k < _parts.length; k++) {
    if (_parts[k] && typeof _parts[k] === 'object' && _wlDisplay(_parts[k]) === absentName) { _i = k; break; }
  }
  if (_i !== -1) {
    _parts[_i].ligaActive = false;
    _parts[_i].woDeactivatedAt = new Date().toISOString();
    // Marca do caminho antigo (ou de um W.O. anterior que foi pra fila): some, senão o
    // card leria "está na fila" enquanto a pessoa está desativada no elenco (store.js
    // testa `woSentToWaitlistAt` ANTES de `woDeactivatedAt`).
    delete _parts[_i].woSentToWaitlistAt;
  } else {
    // Não estava no elenco (veio da fila / doc legado): entra desativado — nunca fica
    // sem lugar nenhum, que é como o inscrito fantasma nasce.
    _parts.push({ name: absentName, displayName: absentName, ligaActive: false, woDeactivatedAt: new Date().toISOString() });
  }
  ft.participants = _parts;
  // Sai da espera: desativado e na fila ao mesmo tempo é estado impossível de explicar,
  // e é justamente onde a Eliane ficou.
  if (typeof window._removeFromWaitlist === 'function') window._removeFromWaitlist(ft, absentName);
}

function _wlDisplay(e) {
  if (typeof e === 'string') return e;
  return String((window._pName ? window._pName(e, '') : '') || (e && (e.displayName || e.name)) || '').trim();
}

// Box informativo do desfecho — não é escolha, é o que VAI acontecer. Fica no diálogo
// porque o organizador precisa saber o estado em que a pessoa cai e como ela volta.
function _ligaWoDestBox(absentName) {
  return '<div id="liga-wo-dest" style="border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.08);border-radius:10px;padding:10px 12px;margin:14px 0 10px;">' +
      // "fica desativado" concordaria em gênero com a pessoa — e o app não sabe (nem
      // presume) o gênero de ninguém. "vai para os Desativados" nomeia a LISTA, que é
      // como o app já a chama na tela, e serve pra qualquer pessoa.
      '<div style="font-size:0.8rem;font-weight:800;color:#f87171;">🔴 ' + _safe(absentName) + ' vai para os Desativados</div>' +
      '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:3px;">Fica de fora dos próximos sorteios. Ao ligar o botão <b>Ativado</b>, entra no <b>fim da lista de espera</b> e joga quando chegar a vez.</div>' +
    '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// FIM DO CICLO (v1.6.90) — quando a vaga é PREENCHIDA (suplente aceitou ou Jogador X
// entrou), todo mundo envolvido é avisado do que aconteceu, e quem levou o W.O. recebe
// a INSTRUÇÃO do que fazer pra voltar. Regra do dono: o ciclo não pode fechar em
// silêncio — quem ficou de fora precisa saber o caminho de volta.
function _ligaNotifyWoCycle(t, group, absentName, subName, isGuest) {
  if (typeof window._sendUserNotification !== 'function') return;
  var nome = t.name || 'torneio';
  var gName = (group && group.name) || '';
  var uidDe = function (n) {
    try { var m = (typeof window._buildNameToUid === 'function') ? (window._buildNameToUid(t) || {}) : {}; return m[n] || null; } catch (e) { return null; }
  };
  var base = { type: 'liga-sub-result', tournamentId: String(t.id), tournamentName: nome };
  var comoEntrou = isGuest ? (subName + ' entrou como Jogador X (não pontua)') : (subName + ' assumiu a vaga');

  // (a) o AUSENTE — o que aconteceu + O QUE FAZER pra voltar.
  var uAbs = uidDe(absentName);
  if (uAbs) {
    // v1.7.59: desfecho ÚNICO — desativado. A instrução é o caminho de volta, e ele
    // depende de um ATO da pessoa: religar o toggle é o que a põe na fila.
    var instr = 'Você ficou como DESATIVADO e não entra nos próximos sorteios. Para voltar: abra o torneio e ligue o botão "Ativado" — você entra no FIM da lista de espera e joga quando chegar a sua vez.';
    window._sendUserNotification(uAbs, Object.assign({}, base, {
      level: 'fundamental',
      message: 'Você levou W.O. no ' + gName + ' de "' + nome + '" — 0 pontos nesta rodada, e ' + comoEntrou + ' no seu lugar. ' + instr,
    }));
  }

  // (b) o SUBSTITUTO (só quem tem conta — Jogador X não tem).
  if (!isGuest) {
    var uSub = uidDe(subName);
    if (uSub) {
      window._sendUserNotification(uSub, Object.assign({}, base, {
        level: 'fundamental',
        message: 'Você entrou no ' + gName + ' de "' + nome + '" no lugar de ' + absentName + ' (W.O.). A vaga é sua até o fim do torneio — você pontua normalmente.',
      }));
    }
  }

  // (c) os DEMAIS do grupo — precisam saber com quem vão jogar.
  ((group && group.players) || []).forEach(function (n) {
    if (!n || n === subName || n === absentName) return;
    var u = uidDe(n);
    if (!u) return;
    window._sendUserNotification(u, Object.assign({}, base, {
      level: 'important',
      message: 'Mudança no ' + gName + ' de "' + nome + '": ' + absentName + ' levou W.O. e ' + comoEntrou + '. Seus jogos da rodada seguem valendo.',
    }));
  });
}
window._ligaNotifyWoCycle = _ligaNotifyWoCycle;

// ── Passo 2 (legado): convidar folga OU Jogador X — segue disponível pra vaga aberta ──
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
  // v1.6.89 — A LISTA DE ESPERA VEM DE _getWaitlist, POR UID. Bug ao vivo (Confra,
  // 02/ago): o diálogo dizia "ninguém ficou de fora nesta rodada para convidar" com DUAS
  // pessoas na fila. Duas causas, as duas aqui:
  //  (a) lia SÓ t.monarchWaitlist (via _getMonarchWaitlist). A espera vive em TRÊS
  //      storages e as duas estavam em standbyParticipants — _getWaitlist é a ÚNICA
  //      leitura correta (é literalmente o que o cânone da espera diz).
  //  (b) resolvia identidade por NOME (uidMap[nm]). Quem tem perfil tem o nome STRIPPADO
  //      no doc (v1.3.52) — displayName vem null e o lookup por nome não acha ninguém.
  //      O uid está NA ENTRADA; o nome se resolve a partir dele (_pName → perfil).
  // Categoria NÃO some mais com ninguém: quem não atende vem marcado (`offCat`) pro
  // organizador decidir — esconder era o que fazia a fila "não existir" na tela.
  // [[project_uid_identity_canon_locked]] [[project_wo_individual_substitution_rule]]
  (typeof window._getWaitlist === 'function' ? window._getWaitlist(t) : []).forEach(function (e) {
    var _u = (typeof window._participantUids === 'function') ? (window._participantUids(e) || [])[0] : (e && e.uid);
    var _nm = String((window._pName ? window._pName(e, '') : '') || (e && (e.displayName || e.name)) || '').trim();
    if (!_u && !_nm) return;
    if (_nm.indexOf(' / ') !== -1) return;                 // dupla formada não assume vaga individual
    var _ok = true;
    if (cat && typeof window._participantInCategory === 'function') {
      try { _ok = !!window._participantInCategory(e, cat, t); } catch (_ec) { _ok = true; }
    }
    folgas.push({ name: _nm || _u, uid: _u || '', offCat: !_ok, fromWaitlist: true });
  });
  // (a leitura antiga por _getMonarchWaitlist saiu: era 1 dos 3 storages e casava por nome)
  // fora: quem já está no grupo, o próprio ausente. Dedup por UID; sem uid, por nome —
  // antes `if (!f.uid) return false` DESCARTAVA silenciosamente quem não tem conta.
  var inGroup = {}; (group.players || []).forEach(function (n) { inGroup[n] = 1; });
  var seen = {};
  folgas = folgas.filter(function (f) {
    var k = f.uid ? ('u:' + f.uid) : ('n:' + String(f.name || '').toLowerCase());
    if (k === 'n:' || seen[k] || inGroup[f.name] || f.name === absentName) return false;
    seen[k] = 1; return true;
  });
  // A FILA PRIMEIRO, na ordem dela: quem espera tem precedência sobre folga da rodada, e
  // quem atende a categoria vem antes de quem não atende. Ordenação ESTÁVEL — dentro de
  // cada balde a ordem de chegada é preservada (é ela que define "o primeiro da fila").
  folgas = folgas
    .map(function (f, i) { return { f: f, i: i }; })
    .sort(function (a, b) {
      var ra = (a.f.offCat ? 2 : 0) + (a.f.fromWaitlist ? 0 : 1);
      var rb = (b.f.offCat ? 2 : 0) + (b.f.fromWaitlist ? 0 : 1);
      return ra !== rb ? ra - rb : a.i - b.i;
    })
    .map(function (x) { return x.f; });

  var catLbl = cat ? (window._displayCategoryName ? window._displayCategoryName(cat) : cat) : '';
  // Texto DINÂMICO conforme a regra do torneio: só menciona Pontos Avançados quando o
  // torneio usa PA E a punição de W.O. está ativa — com o VALOR configurado pelo org.
  var _woPenVal = (typeof window._woAdvPenalty === 'function') ? window._woAdvPenalty(t) : 0;
  var html = '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;"><b>' + _safe(absentName) + '</b> leva W.O. (0 pts na rodada' + (_woPenVal ? ', ' + _woPenVal + ' nos Pontos Avançados' : '') + '). Quem entra no lugar?</div>';
  if (folgas.length > 0) {
    var _souOrgHint = (typeof window._canManagePresence === 'function')
      ? !!window._canManagePresence(t, window.AppStore && window.AppStore.currentUser) : false;
    html += '<div style="font-size:0.74rem;font-weight:700;color:#4ade80;margin:10px 0 6px;">' + (_souOrgHint ? 'Substituir ou convidar' : 'Convidar') + ' da lista de espera / folgas' + (catLbl ? ' · categoria ' + _safe(catLbl) : '') + ' — o PRIMEIRO que aceitar entra e pontua de verdade</div>';
    html += '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px;">' +
      (_souOrgHint ? 'Marque <b>um</b> pra colocar na hora, ou <b>vários</b> pra convidar — aí o primeiro que aceitar entra.'
                   : 'Marque quem recebe o convite — o primeiro que aceitar entra.') + '</div>';
    // AUTORIDADE decide a tela: organizador vê "Colocar agora" em cada candidato; o
    // participante do grupo vê só o convite. [[project_wo_outcome_negotiation_canon]]
    var _souOrg = (typeof window._canManagePresence === 'function')
      ? !!window._canManagePresence(t, window.AppStore && window.AppStore.currentUser) : false;
    html += '<div id="liga-fill-cands">' + folgas.map(function (f) {
      // offCat NÃO some com a pessoa: mostra marcado, e o organizador decide se aceita a
      // quebra de categoria. Sumir era o que fazia a fila "não existir" na tela.
      var _tag = f.offCat
        ? '<span style="font-size:0.62rem;font-weight:800;background:rgba(251,191,36,0.2);color:#fbbf24;padding:1px 6px;border-radius:5px;flex:0 0 auto;">fora da categoria</span>'
        : (f.fromWaitlist ? '<span style="font-size:0.62rem;font-weight:700;background:rgba(255,255,255,0.08);color:var(--text-muted);padding:1px 6px;border-radius:5px;flex:0 0 auto;">espera</span>' : '');
      var _bd = f.offCat ? 'rgba(251,191,36,0.5)' : 'rgba(16,185,129,0.55)';
      var _co = f.offCat ? '#fbbf24' : '#4ade80';
      // v1.6.92: a linha é do NOME — largura inteira. O botão por linha (v1.6.91) comeu a
      // largura e picotou os nomes em duas linhas com a tag cortada. A AÇÃO virou UMA só,
      // no rodapé, e o que ela faz depende de quantos estão marcados (regra do dono).
      return '<button type="button" class="btn btn-outline" data-cand="1" data-on="1" data-uid="' + _safe(f.uid) + '" data-name="' + _safe(f.name) + '" onclick="window._ligaToggleCand(this)" style="width:100%;margin-bottom:6px;text-align:left;display:flex;align-items:center;gap:8px;border-color:' + _bd + ';color:' + _co + ';">' +
        '<span data-mark="1" style="flex:0 0 auto;">✅</span>' +
        '<span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _safe(f.name) + '</span>' +
        _tag +
      '</button>';
    }).join('') + '</div>';
    // AÇÃO ÚNICA (v1.6.92, regra do dono): "pode ser 1 botão colocar se apenas 1 estiver
    // selecionado ou convidar se mais de um estiver selecionado". O rótulo e o que ele faz
    // são recalculados a cada toque (_ligaSyncFillAction). Participante nunca vê "Colocar".
    html += '<button id="liga-fill-action" class="btn btn-success" style="width:100%;margin-top:4px;font-weight:800;" ' +
      'data-tid="' + _safe(tId) + '" data-ri="' + roundIndex + '" data-gn="' + _safe(groupName) + '" data-abs="' + _safe(absentName) + '" data-org="' + (_souOrg ? '1' : '0') + '" ' +
      'onclick="window._ligaFillAction(this)">📨 Convidar selecionados</button>';
  } else {
    // O texto antigo dizia "ninguém DA MESMA CATEGORIA" mesmo quando a lista de espera
    // tinha gente — a frase culpava a categoria por um defeito de leitura. Agora só é
    // dita quando a espera está REALMENTE vazia.
    html += '<div style="font-size:0.74rem;color:var(--text-muted);margin:8px 0;">A lista de espera está vazia e ninguém ficou de fora nesta rodada — não há quem convidar.</div>';
  }
  html += _ligaWoDestBox(absentName);
  html += '<div style="font-size:0.74rem;font-weight:700;color:#fbbf24;margin:12px 0 6px;">Jogador X — qualquer pessoa presente (não pontua)</div>';
  html += '<button class="btn btn-outline" style="width:100%;border-color:rgba(251,191,36,0.4);color:#fbbf24;" onclick="window._ligaFillGuestPrompt(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(absentName) + '\')">🎾 Completar com Jogador X</button>';

  if (window.showAlertDialog) window.showAlertDialog('Substituto', html, function () {}, { type: 'info', confirmText: 'Fechar' });
};


// ─────────────────────────────────────────────────────────────────────────────
// SUBSTITUIÇÃO DIRETA (v1.6.91) — regra do dono, ago/2026:
// _"no fluxo dos participantes eles CONVIDAM os da lista de espera. No fluxo do
// organizador ele SUBSTITUI DIRETAMENTE se quiser. Pode convidar, mas pode substituir
// diretamente."_
//
// Os dois fluxos moram no MESMO diálogo, e quem separa é a AUTORIDADE, não a tela:
//   • participante do grupo  → só CONVIDA (o convidado precisa aceitar).
//   • organizador/co-org/árbitro → vê também "▶️ Colocar agora", que resolve na hora.
// O convite continua disponível pro organizador — ele escolhe. O que não existia era o
// caminho direto: ele tinha que convidar e FICAR ESPERANDO alguém aceitar pra destravar
// a rodada, mesmo sendo ele a autoridade que decide.
//
// Fecha o ciclo inteiro numa mutação: suplente entra no grupo E no elenco, sai da fila,
// o ausente vai pro destino escolhido, e todo mundo é notificado.
window._ligaSubstituteNow = function (tId, roundIndex, groupName, absentName, subUid, subName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  // AUTORIDADE, não "pode gerir o grupo": substituição direta é do organizador.
  if (typeof window._canManagePresence === 'function' &&
      !window._canManagePresence(t, window.AppStore && window.AppStore.currentUser)) {
    if (window.showNotification) window.showNotification('Substituir', 'Só o organizador pode colocar alguém direto. Você pode convidar.', 'info');
    return;
  }
  var cat = _groupCategory(group);
  _closeDialogs();

  _commitLiga(tId, function (ft) {
    var g = _getGroup(ft, roundIndex, groupName); var r = ft.rounds && ft.rounds[roundIndex];
    if (!g || !r) return;
    var _absU2 = _woAbsentUidOf(g, absentName); // antes de qualquer mutação do elenco
    _addWoMarker(ft, r, roundIndex, absentName, cat);
    g.woAbsent = absentName; g.woDest = 'inactive';   // v1.7.59: destino único
    if (_absU2) g.woAbsentUid = _absU2; else delete g.woAbsentUid;

    // O suplente entra no ELENCO antes do _rewriteSlot — o slot resolve o uid dele por
    // _buildNameToUid(ft), e fora do elenco (e já fora da espera) o mapa não o acha:
    // o jogo ficaria apontando pra ninguém.
    var _entry = null;
    try {
      (window._getWaitlist ? window._getWaitlist(ft) : []).forEach(function (e) {
        if (_entry) return;
        var eu = (typeof window._participantUids === 'function') ? (window._participantUids(e) || []) : (e && e.uid ? [e.uid] : []);
        if ((subUid && eu.indexOf(subUid) !== -1) || _wlDisplay(e) === subName) { _entry = JSON.parse(JSON.stringify(e)); }
      });
    } catch (e) {}
    if (!_entry) _entry = { uid: subUid || undefined, displayName: subName, name: subName };
    _entry.ligaActive = true;
    _entry.woSubstituteFor = absentName;
    _entry.woSubstituteAt = new Date().toISOString();
    if (!Array.isArray(ft.participants)) ft.participants = ft.participants ? Object.values(ft.participants) : [];
    var _ja = ft.participants.some(function (p) {
      if (!p || typeof p !== 'object') return false;
      if (_entry.uid && p.uid) return p.uid === _entry.uid;
      return _wlDisplay(p) === subName;
    });
    if (!_ja) ft.participants.push(_entry);
    if (typeof window._removeFromWaitlist === 'function') window._removeFromWaitlist(ft, subName);
    _removeSitOut(r, subName);
    _rewriteSlot(g, absentName, subName, true, ft);
    g.subStatus = 'filled'; g.subName = subName; g.subIsGuest = false; delete g.pendingInviteId;
    // convites pendentes do grupo perdem o sentido — a vaga foi resolvida na mão.
    if (Array.isArray(ft.ligaSubInvites)) {
      ft.ligaSubInvites.forEach(function (iv) {
        if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled';
      });
    }
    _ligaWoDeactivate(ft, absentName);
    if (!Array.isArray(ft.history)) ft.history = [];
    ft.history.push({ date: new Date().toISOString(), message: 'W.O. (' + groupName + '): ' + absentName + ' → ' + subName + ' (substituição direta do organizador)' });
  });

  // FIM DO CICLO: resolveu na hora → todo mundo é avisado agora.
  try {
    var _tAf = _findT(tId);
    _ligaNotifyWoCycle(_tAf, _getGroup(_tAf, roundIndex, groupName), absentName, subName, false);
  } catch (e) {}
  if (window.showNotification) {
    window.showNotification('Substituição feita', subName + ' entrou no lugar de ' + absentName + ' e fica até o fim do torneio.', 'success');
  }
  _rerender(tId);
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
  // marca num <span> próprio — antes era regex no innerHTML inteiro, que agora carrega o
  // nome e a tag e seria reescrito junto.
  try { var mk = btn.querySelector('[data-mark]'); if (mk) mk.textContent = on ? '⬜' : '✅'; } catch (e) {}
  window._ligaSyncFillAction();
};

// Lê quantos estão marcados e reescreve o botão único: 1 → COLOCAR (organizador),
// 2+ → CONVIDAR, 0 → desabilitado. É a fonte única do rótulo e do comportamento.
window._ligaSyncFillAction = function () {
  var act;
  try { act = document.getElementById('liga-fill-action'); } catch (e) { act = null; }
  if (!act) return;
  var sel = [];
  try {
    document.querySelectorAll('#liga-fill-cands [data-cand][data-on="1"]').forEach(function (b) {
      sel.push({ uid: b.getAttribute('data-uid'), name: b.getAttribute('data-name') });
    });
  } catch (e) {}
  var org = act.getAttribute('data-org') === '1';
  if (!sel.length) {
    act.textContent = 'Marque quem entra ou recebe o convite';
    act.style.opacity = '0.5';
    return;
  }
  act.style.opacity = '';
  if (sel.length === 1 && org) {
    // 1 marcado + organizador → entra AGORA, sem aceite.
    act.textContent = '▶️ Colocar ' + sel[0].name;
  } else if (sel.length === 1) {
    act.textContent = '📨 Convidar ' + sel[0].name;
  } else {
    act.textContent = '📨 Convidar ' + sel.length + ' selecionados';
  }
};

// Despacha a ação única conforme a seleção do momento.
window._ligaFillAction = function (btn) {
  var tId = btn.getAttribute('data-tid'), ri = parseInt(btn.getAttribute('data-ri'), 10) || 0;
  var gn = btn.getAttribute('data-gn'), abs = btn.getAttribute('data-abs');
  var org = btn.getAttribute('data-org') === '1';
  var sel = [];
  try {
    document.querySelectorAll('#liga-fill-cands [data-cand][data-on="1"]').forEach(function (b) {
      sel.push({ uid: b.getAttribute('data-uid'), name: b.getAttribute('data-name') });
    });
  } catch (e) {}
  if (!sel.length) {
    if (window.showNotification) window.showNotification('Substituto', 'Marque quem entra no lugar.', 'info');
    return;
  }
  if (sel.length === 1 && org) {
    window._ligaSubstituteNow(tId, ri, gn, abs, sel[0].uid, sel[0].name);
    return;
  }
  window._ligaInviteSelected(tId, ri, gn, abs);
};

// Lê os candidatos marcados no diálogo e dispara o convite múltiplo.
window._ligaInviteSelected = function (tId, roundIndex, groupName, absentName) {
  var sel = [];
  document.querySelectorAll('#liga-fill-cands [data-cand][data-on="1"]').forEach(function (b) {
    sel.push({ uid: b.getAttribute('data-uid'), name: b.getAttribute('data-name') });
  });
  if (!sel.length) { if (window.showNotification) window.showNotification('Convite', 'Marque ao menos um jogador pra convidar.', 'info'); return; }
  _closeDialogs(); // convite disparado → o diálogo "Substituto" some
  // O W.O. já vale: DESATIVA agora e guarda no grupo, pra a notificação do fim do ciclo
  // (quando alguém aceitar) saber o que dizer a quem levou o W.O.
  _commitLiga(tId, function (ft) {
    var g = _getGroup(ft, roundIndex, groupName);
    if (g) {
      var _absU3 = _woAbsentUidOf(g, absentName);
      g.woDest = 'inactive'; g.woAbsent = absentName;
      if (_absU3) g.woAbsentUid = _absU3; else delete g.woAbsentUid;
    }
    _ligaWoDeactivate(ft, absentName);
  });
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
    // ⚠️ ANTES do _rewriteSlot: ele troca o ausente pelo Jogador X no elenco, e depois
    // disso o uid dele não é mais encontrável pelo nome.
    var _absU4 = _woAbsentUidOf(g, absentName);
    _addWoMarker(ft, r, roundIndex, absentName, cat);
    _rewriteSlot(g, absentName, gname, true, t);
    _addGhost(ft, gname);
    g.woAbsent = absentName; g.subStatus = 'filled'; g.subName = gname; g.subIsGuest = true;
    if (_absU4) g.woAbsentUid = _absU4; else delete g.woAbsentUid;
    g.woDest = 'inactive';   // v1.7.59: destino único
    delete g.pendingInviteId;
    _ligaWoDeactivate(ft, absentName);   // v1.7.59: W.O. sempre desativa
    // Completar com Jogador X supera qualquer convite pendente do grupo — cancela
    // pra não deixar convite órfão (que um jogador real poderia aceitar depois).
    if (Array.isArray(ft.ligaSubInvites)) {
      ft.ligaSubInvites.forEach(function (iv) { if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled'; });
    }
  });
  // FIM DO CICLO: Jogador X entrou → todo mundo é avisado agora.
  try {
    var _tAfter = _findT(tId);
    _ligaNotifyWoCycle(_tAfter, _getGroup(_tAfter, roundIndex, groupName), absentName, gname, true);
  } catch (e) {}
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
    var _absU5 = _woAbsentUidOf(g, absentName);
    g.woAbsent = absentName; g.subStatus = 'pending'; g.pendingInviteId = list[0].id; delete g.subName; delete g.subIsGuest;
    if (_absU5) g.woAbsentUid = _absU5; else delete g.woAbsentUid;
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
    // v1.6.90 — O SUPLENTE ASSUME A POSIÇÃO ATÉ O FIM DO TORNEIO (regra do dono).
    // Entrar em t.participants é o que sustenta isso: em Liga cada rodada é sorteada de
    // novo a partir do elenco, então quem fica só no grupo desta rodada SUMIRIA no
    // próximo sorteio. Vem ANTES do _rewriteSlot de propósito — ele resolve o uid do
    // substituto por _buildNameToUid(ft), e fora do elenco (e já fora da espera) o mapa
    // não o acha: o slot ficaria com uid null, apontando pra ninguém.
    var _subEntry = null;
    try {
      (window._getWaitlist ? window._getWaitlist(ft) : []).forEach(function (e) {
        if (!_subEntry && _wlDisplay(e) === _invName) { _subEntry = JSON.parse(JSON.stringify(e)); }
      });
    } catch (e) {}
    if (!_subEntry) _subEntry = { uid: fiv.inviteeUid || undefined, displayName: _invName, name: _invName };
    _subEntry.ligaActive = true;
    _subEntry.woSubstituteFor = _absName;
    _subEntry.woSubstituteAt = new Date().toISOString();
    if (!Array.isArray(ft.participants)) ft.participants = ft.participants ? Object.values(ft.participants) : [];
    var _ja = ft.participants.some(function (p) {
      if (!p || typeof p !== 'object') return false;
      if (_subEntry.uid && p.uid) return p.uid === _subEntry.uid;
      return _wlDisplay(p) === _invName;
    });
    if (!_ja) ft.participants.push(_subEntry);
    // sai da LISTA DE ESPERA — dos TRÊS storages, não só do monarchWaitlist (ele assumiu;
    // a espera não pode continuar contando com ele pra formar grupo novo).
    if (typeof window._removeFromWaitlist === 'function') window._removeFromWaitlist(ft, _invName);
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
  // FIM DO CICLO: a vaga foi preenchida por um jogador real → avisa todo mundo e diz ao
  // que levou o W.O. o que fazer pra voltar. A desativação já foi aplicada quando o
  // organizador convidou (v1.7.59: destino único, nada a ler do grupo).
  try {
    var _tAf = _findT(tId);
    var _gAf = _getGroup(_tAf, _ri, _gn);
    _ligaNotifyWoCycle(_tAf, _gAf, _absName, _invName, false);
  } catch (e) {}
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
    // v4.5.x (Parte 14 — identidade por uid no slot): além do NOME, troca o UID do
    // slot (ausente → substituto). Folga real = uid dela; Jogador X = null (ghost, não
    // pontua). Sem isto o slot mantinha o uid do AUSENTE enquanto o nome virava o do
    // substituto → a classificação por uid (_monKey) creditava os jogos do substituto
    // na linha do ausente. Casa o slot do ausente por uid quando ambos têm uid (nome só
    // fallback p/ slot/ausente sem uid — guest/legado). Espelha _rewriteSlot (v4.4.117).
    var _n2u = (typeof window._buildNameToUid === 'function') ? (window._buildNameToUid(ft) || {}) : {};
    var absentUid = _n2u[absentName] || null;
    var fillUid = isGuest ? null : (_n2u[fillName] || null);
    var _rwSide = function (m, nk, uk) {
      var names = m[nk]; if (!Array.isArray(names)) return;
      var uids = Array.isArray(m[uk]) ? m[uk].slice() : names.map(function () { return null; });
      names.forEach(function (n, i) {
        var hit = (absentUid && uids[i]) ? (uids[i] === absentUid) : (n === absentName);
        if (hit) { names[i] = fillName; uids[i] = fillUid; }
      });
      m[uk] = uids;
    };
    playing.forEach(function (m) {
      _rwSide(m, 'team1', 'team1Uids');
      _rwSide(m, 'team2', 'team2Uids');
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
      // v4.5.71: identidade por uid no slot real (p1 = ausente). W.O. é sentinela.
      p1Uid: ((typeof window._buildNameToUid === 'function') ? (window._buildNameToUid(ft) || {})[absentName] : null) || null,
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
    // v4.5.x (Parte 14): reverte NOME e UID do slot (substituto → ausente). Casa o slot
    // do substituto por uid quando ambos têm uid (Jogador X = null → cai no nome).
    var _n2u = (typeof window._buildNameToUid === 'function') ? (window._buildNameToUid(ft) || {}) : {};
    var absentUid = _n2u[absentName] || null;
    var fillUid = isGuest ? null : (_n2u[fillName] || null);
    var _rwSide = function (m, nk, uk) {
      var names = m[nk]; if (!Array.isArray(names)) return;
      var uids = Array.isArray(m[uk]) ? m[uk].slice() : names.map(function () { return null; });
      names.forEach(function (n, i) {
        var hit = (fillUid && uids[i]) ? (uids[i] === fillUid) : (n === fillName);
        if (hit) { names[i] = absentName; uids[i] = absentUid; }
      });
      m[uk] = uids;
    };
    _monPlaying(ft, gName, pIdx).forEach(function (m) {
      _rwSide(m, 'team1', 'team1Uids');
      _rwSide(m, 'team2', 'team2Uids');
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
