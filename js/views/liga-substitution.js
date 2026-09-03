/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
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
// uid de quem levou o W.O. O SLOT do grupo manda (identidade canônica). Quando o slot não
// tem uid — doc legado, sorteado antes de os grupos gravarem `playersUids` — cai na ponte
// nome→uid, que é a MESMA conversão que `_addWoMarker` já fazia pro marcador (`_uidDoNome`).
// ⛔ 2.0.58: sem essa segunda linha, `g.woAbsentUid` ficava vazio em doc legado e TUDO que
// depende dele nascia por nome — o convite, o rastro do substituto e a tag da classificação.
// A ponte é lida UMA vez, na entrada, e vira uid dali pra frente; nunca se decide por nome
// depois. [[project_uid_identity_canon_locked]]
function _woAbsentUidOf(group, name, t) {
  if (!group || !name) return '';
  var i = (group.players || []).indexOf(name);
  var u = (i >= 0) ? (group.playersUids || [])[i] : null;
  if (u) return String(u);
  var viaNome = t ? _uidDoNome(t, name) : null;
  return viaNome ? String(viaNome) : '';
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
// Este jogo é PASSADO? Qualquer uma das marcas basta — e `resultAt` entra de propósito:
// foi a única que sobreviveu quando o `clearResults` zerou o resto, e é ela que denuncia um
// jogo que JÁ foi lançado mesmo com placar apagado por engano.
function _jogoJaTemPlacar(m) {
  if (!m) return false;
  if (m.isSitOut) return false;                       // folga/W.O. não é jogo disputado
  return !!(m.winner || m.scoreP1 != null || m.scoreP2 != null ||
            m.resultAt || (Array.isArray(m.sets) && m.sets.length));
}
window._jogoJaTemPlacar = _jogoJaTemPlacar;

function _rewriteSlot(group, fromName, toName, clearResults, t) {
  // v4.4.117: além do NOME, reescreve o UID do slot (identidade por uid). O substituto é
  // outra pessoa — o jogo/elenco tem que apontar pro uid DELE (ou null se convidado sem
  // conta). Sem isto, o slot mantinha o uid do ausente e a classificação por uid confundia
  // o substituto com o ausente. toUid resolvido pelo perfil do substituto.
  var _toUid = null, _fromUid = null;
  try {
    var _n2u = (t && typeof window._buildNameToUid === 'function') ? window._buildNameToUid(t) : null;
    if (_n2u && Object.prototype.hasOwnProperty.call(_n2u, toName)) _toUid = _n2u[toName] || null;
    if (_n2u && Object.prototype.hasOwnProperty.call(_n2u, fromName)) _fromUid = _n2u[fromName] || null;
  } catch (e) {}
  // O uid do ausente pode já não estar no mapa (ele sai do elenco antes em alguns fluxos) —
  // o slot do grupo ainda o guarda, e é dele que o retrato congelado precisa pra casar.
  if (!_fromUid && Array.isArray(group.players)) {
    var _fi = group.players.indexOf(fromName);
    if (_fi >= 0 && (group.playersUids || [])[_fi]) _fromUid = group.playersUids[_fi];
  }
  // ⛔ 2.0.56 — O SLOT SE DECIDE POR UID; nome só quando o slot NÃO tem uid.
  // Medido no Confra (Grupo A, 24/ago): o W.O. Carol→Karla trocou a classificação e
  // DEIXOU OS JOGOS PRA TRÁS — os slots tinham o uid da Carol com o RÓTULO VELHO
  // "Denise Mamesso" (rótulo gravado envelhece; o nome vivo é resolvido no render), e
  // o casamento por `n === fromName` não achou nada. O dado foi reparado por script;
  // esta é a regra canônica que impede a repetição ("nada por nome. tudo por uid a
  // menos que seja nome digitado sem uid"). O nome VIVO também casa (fromName é o que
  // o organizador vê na tela) — mas só decide onde não há uid pra decidir.
  function _rw(names, uids) {
    if (!Array.isArray(names)) return names;
    return names.map(function (n, i) {
      var slotU = (Array.isArray(uids) && uids[i]) ? String(uids[i]) : '';
      var hit = (slotU && _fromUid) ? (slotU === String(_fromUid)) : (!slotU && n === fromName);
      if (hit) { if (Array.isArray(uids)) uids[i] = _toUid; return toName; }
      return n;
    });
  }
  (group.matches || []).forEach(function (m) {
    // ⛔ JOGO COM PLACAR NÃO SE TOCA — nem o nome, nem o resultado.
    //
    // Ordem do dono (22/ago/2026, depois de eu quebrar o R1 Grupo M do Confra):
    // _"a pessoa que sai mantém o que fez e a que entra herda a posição. nenhum placar
    //  alterado ou apagado. SEMPRE."_
    //
    // O QUE ACONTECEU: apliquei W.O. num grupo com os 3 jogos JÁ LANÇADOS. Este laço
    // trocou "Juliana Reis" por "Erika Muller" DENTRO dos jogos e o `clearResults` zerou
    // scoreP1/scoreP2/winner/sets. Sobrou só o `resultAt` — foi ele que provou que ali
    // havia resultado. Os três tiveram de ser restaurados do backup.
    //
    // A SEPARAÇÃO É DE DOIS EIXOS, e este guard é a fronteira:
    //   · PASSADO (jogo com placar) → é de quem JOGOU. Imutável.
    //   · FUTURO (vaga no grupo, posição na classificação) → é de quem ENTRA. Segue
    //     valendo logo abaixo, em `group.players`, que é o que faz o suplente herdar a
    //     colocação — no Grupo M a Juliana era 4ª, a Erika virou 4ª, e é isso que a põe
    //     como parceira do Marco na linha Prata.
    //
    // O W.O. foi desenhado pro caso normal (falta ANTES de jogar, o suplente joga no
    // lugar). Aplicado num grupo já encerrado, a troca RETROAGE. Não é hipótese.
    if (_jogoJaTemPlacar(m)) return;
    if (Array.isArray(m.team1)) m.team1 = _rw(m.team1, m.team1Uids);
    if (Array.isArray(m.team2)) m.team2 = _rw(m.team2, m.team2Uids);
    if (m.team1 && m.team2) { m.p1 = m.team1.join(' / '); m.p2 = m.team2.join(' / '); }
    if (clearResults) { m.winner = null; m.scoreP1 = null; m.scoreP2 = null; m.sets = null; delete m.pendingResult; delete m.draw; }
  });
  if (Array.isArray(group.players)) group.players = _rw(group.players, group.playersUids);
  // ⭐ A POSIÇÃO PUBLICADA TAMBÉM É HERDADA (W.O. pós-jogos, caso Adele — 24/ago/2026).
  //
  // Grupo que TERMINOU tem a ordem gravada em `classifCongelada` ([[project_classificacao_
  // publicada_congela]]), e a tela LÊ o retrato. Trocar só `group.players` deixava a
  // suplente FORA do retrato — e quem não está nele vai pro fim da tabela (ordem 9999),
  // o contrário de "a que entra herda a posição" (ordem do dono, 22/ago/2026, caso
  // Juliana Reis → Erika Muller: a Juliana era a 4ª, a Erika virou a 4ª).
  //
  // A régua de identidade é a canônica ([[project_wo_lives_in_four_places]], "quem manda
  // é a MARCA"): entrada do retrato COM uid só casa por uid; entrada SEM uid (doc legado,
  // nome digitado) casa por nome. Os números não mudam — o retrato congela a ORDEM.
  if (Array.isArray(group.classifCongelada)) {
    group.classifCongelada.forEach(function (l) {
      if (!l) return;
      var hit = l.uid ? (!!_fromUid && String(l.uid) === String(_fromUid)) : (l.name === fromName);
      if (hit) { l.name = toName; l.uid = _toUid || null; }
    });
  }
}
// ── 2.0.39 · O MARCADOR DE FOLGA/W.O. TAMBÉM SE RESOLVE POR uid ──────────────
// Ordem do dono: _"nada por nome. tudo por uid a menos que seja nome digitado pelo
// organizador sem uid."_ Estes marcadores JÁ nasciam com `p1Uid`/`team1Uids` (v4.5.71) —
// mas eram ACHADOS por `m.p1 === name`. Duas consequências reais: homônimo no mesmo grupo
// apagava a folga do outro, e quem se renomeia entre o sorteio e o W.O. deixava o marcador
// velho de pé (a pessoa aparecia jogando E de folga).
// A régua é a MESMA de `_meuStatusNoTorneio` (store.js), pra não haver duas: o marcador que
// TEM uid é decidido só por uid; o marcador SEM uid (doc legado, ou nome digitado pelo
// organizador) é decidido pelo nome — senão o legado nunca mais seria removido.
function _sitOutUids(m) {
  return [].concat((m && m.team1Uids) || [], (m && m.p1Uid) || []).filter(Boolean).map(String);
}
function _mesmoSitOut(m, name, uid) {
  var us = _sitOutUids(m);
  if (us.length) return uid ? us.indexOf(String(uid)) !== -1 : false;
  return m.p1 === name;
}
// ⛔ 2.0.58 · O RASTRO TEM QUE POUSAR NA ENTRADA QUE FICA NO DOC.
// Os três fluxos de substituição montam uma CÓPIA do suplente, carimbam o rastro nela e
// só a inserem em `participants` se ele ainda não estiver lá. Quem JÁ ERA DO ELENCO caía
// no `if (!ja)` e a cópia carimbada era JOGADA FORA: o rastro nunca existia, e o histórico
// do grupo perdia aquele elo pra sempre (é o que apagava substituições da lista). Este
// helper aplica as marcas na entrada REAL — a que sobrevive ao save.
function _marcaRastroWo(entry, absentName, absentUid) {
  if (!entry || typeof entry !== 'object' || !absentName) return;
  entry.ligaActive = true;
  entry.woSubstituteFor = absentName;                       // rótulo, pra quem não tem conta
  if (absentUid) entry.woSubstituteForUid = String(absentUid); // identidade (uid manda)
  entry.woSubstituteAt = new Date().toISOString();
}
// Em que rodada mora este grupo? `_ligaGroupWoList` recebe só o objeto do grupo, e o
// registro de W.O. é indexado por (rodada, grupo) — sem isso, dois grupos de mesmo nome em
// rodadas diferentes ("R1 Grupo A" da temporada que recomeça) compartilhariam histórico.
// Casa pela IDENTIDADE do objeto primeiro; o nome é só desempate pra cópia serializada.
function _roundIndexDoGrupo(t, group) {
  var rounds = (t && Array.isArray(t.rounds)) ? t.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    var gs = (rounds[i] && rounds[i].monarchGroups) || [];
    if (gs.indexOf(group) !== -1) return i;
  }
  for (var j = 0; j < rounds.length; j++) {
    var gs2 = (rounds[j] && rounds[j].monarchGroups) || [];
    for (var k = 0; k < gs2.length; k++) if (gs2[k] && gs2[k].name === group.name) return j;
  }
  return 0;
}

// ⭐ 2.0.60 · PONTE ÚNICA PRO REGISTRO DE W.O. (js/views/wo-log.js).
// Todo fluxo que aplica, preenche ou reverte um W.O. passa por aqui — uma chamada só, com
// `typeof` guard, pra que nenhum caminho fique sem gravar e pra que o módulo possa faltar
// (teste headless que não o carrega) sem derrubar a substituição, que é a operação crítica
// na quadra. `quem` é 'add' | 'fill' | 'revert'.
function _woLog(quem, ft, ev) {
  try {
    var fn = window['_woLog' + quem.charAt(0).toUpperCase() + quem.slice(1)];
    if (typeof fn === 'function') {
      if (!ev.byUid) ev.byUid = _meUid() || null;
      return fn(ft, ev);
    }
  } catch (e) { if (window._warn) window._warn('[wo-log]', e); }
  return null;
}

// ⛔ 2.0.59 · DESFEZ O W.O., APAGA O RASTRO — e casa por UID.
// Espelho de `_marcaRastroWo`: reverter uma substituição sem tirar o rastro deixa o elo
// vivo no histórico do grupo (a lista o reconstrói dali), e o botão de reverter voltaria a
// oferecer desfazer o que já foi desfeito. Varre o ELENCO e os storages da ESPERA, porque a
// entrada viaja entre eles ([[project_sitout_vs_waitlist_canon]]). O par (substituto ↔
// ausente) é conferido por uid dos DOIS lados; nome só decide onde não existe uid — o
// fictício, a ressalva do dono.
function _limpaRastroWo(ft, subUid, subName, absentUid, absentName) {
  var listas = [ft.participants, ft.standbyParticipants, ft.waitlist];
  listas.forEach(function (arr) {
    if (!Array.isArray(arr)) return;
    arr.forEach(function (p) {
      if (!p || typeof p !== 'object' || !p.woSubstituteFor) return;
      // é ESTE substituto?
      var ehSub = (subUid && p.uid) ? (String(p.uid) === String(subUid))
                                    : (!subUid && !p.uid && (p.displayName || p.name) === subName);
      if (!ehSub) return;
      // e o rastro aponta pra ESTE ausente?
      var ehAusente = (absentUid && p.woSubstituteForUid)
        ? (String(p.woSubstituteForUid) === String(absentUid))
        : (p.woSubstituteFor === absentName);
      if (!ehAusente) return;
      delete p.woSubstituteFor; delete p.woSubstituteForUid; delete p.woSubstituteAt;
    });
  });
}
// Acha no elenco a entrada da pessoa — por uid quando há; nome só pro fictício.
function _entradaNoElenco(ft, uid, nome) {
  var arr = Array.isArray(ft.participants) ? ft.participants : [];
  for (var i = 0; i < arr.length; i++) {
    var p = arr[i];
    if (!p || typeof p !== 'object') continue;
    if (uid && p.uid) { if (String(p.uid) === String(uid)) return p; continue; }
    if (!uid && !p.uid && _wlDisplay(p) === nome) return p;
  }
  return null;
}
// Semente name→uid pra quem chama sem uid em mãos. É a ÚNICA resolução por nome aceita:
// converter um rótulo em identidade uma vez, na entrada — nunca decidir por nome depois.
function _uidDoNome(t, name) {
  if (!name) return null;
  var u = (typeof window._buildNameToUid === 'function') ? (window._buildNameToUid(t) || {})[name] : null;
  // 2.0.58: o mapa canônico mora em bracket-logic.js — quando ele não está carregado, a
  // semente cai no mapa LOCAL deste módulo em vez de devolver null. Devolver null aqui
  // significa "esta pessoa não tem uid", e é mentira quando o elenco tem: o W.O. inteiro
  // nascia por nome a partir daí (estado do grupo, convite e rastro do substituto).
  if (!u) { try { u = (_nameUidMap(t) || {})[name] || null; } catch (e) { u = null; } }
  return u || null;
}
function _removeSitOut(round, name, uid) {
  if (Array.isArray(round.matches)) {
    round.matches = round.matches.filter(function (m) {
      return !(m && m.isSitOut && _mesmoSitOut(m, name, uid));
    });
  }
}
function _addWoMarker(t, round, roundIndex, name, category, uid) {
  var _woUid = uid || _uidDoNome(t, name);
  _removeSitOut(round, name, _woUid); // não pode ser folga E W.O.
  if (!Array.isArray(round.matches)) round.matches = [];
  var o = {
    id: 'wo-r' + (roundIndex + 1) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
    round: roundIndex + 1, roundIndex: roundIndex,
    p1: name, p2: 'W.O.', isSitOut: true, sitOutReason: 'wo', sitOutPoints: 0,
    label: 'R' + (roundIndex + 1) + ' • W.O.'
  };
  // v4.5.71: identidade por uid no slot real (p1). W.O. é sentinela (sem uid).
  if (_woUid) { o.p1Uid = _woUid; o.team1Uids = [_woUid]; }
  if (category) o.category = category;
  round.matches.push(o);
}
function _addFolgaMarker(t, round, roundIndex, name, category, uid) {
  if (!Array.isArray(round.matches)) round.matches = [];
  var _foUid = uid || _uidDoNome(t, name);
  // evita duplicar
  if (round.matches.some(function (m) { return m && m.isSitOut && _mesmoSitOut(m, name, _foUid); })) return;
  var pts = (typeof window._sitOutComp === 'function') ? window._sitOutComp(t, name, category) : 0;
  var o = {
    id: 'folga-r' + (roundIndex + 1) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
    round: roundIndex + 1, roundIndex: roundIndex,
    p1: name, p2: 'FOLGA', isSitOut: true, sitOutReason: 'remainder', sitOutPoints: pts,
    label: 'R' + (roundIndex + 1) + ' • Folga'
  };
  // v4.5.71: identidade por uid no slot real (p1). FOLGA é sentinela (sem uid).
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
  // v1.8.45 — os PERFIS entram em cache já no passo 1: o gênero (que decide quem assume
  // pela proporção) mora no perfil, não na entrada do doc. Disparado aqui, fire-and-forget,
  // porque até o organizador escolher o ausente no diálogo a carga já chegou.
  try {
    if (typeof window._preloadUserProfiles === 'function') {
      var _preUids = ((group.playersUids || []).filter(Boolean))
        .concat(((typeof window._getWaitlist === 'function' ? window._getWaitlist(t) : []) || []).map(function (e) {
          return (typeof window._participantUids === 'function') ? ((window._participantUids(e) || [])[0] || '') : (e && e.uid) || '';
        }).filter(Boolean));
      window._preloadUserProfiles(_preUids);
    }
  } catch (_ePre) {}
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
  // ⛔ O confirmador não pode esconder a FILA numa segunda tela. A seleção canônica
  // (1 marcado → substitui agora; vários → convida; Jogador X) já mora em
  // `_ligaPickFill`; este é só o primeiro ponto de entrada dela.
  window._ligaPickFill(tId, roundIndex, groupName, absentName, { confirmTitle: 'Confirmar W.O.?' });
};

// 2.0.61 — o atalho do botão "W.O. + Jogador X" do diálogo de confirmação: fecha o
// diálogo e cai no fluxo canônico do Jogador X (_ligaFillGuestPrompt → _ligaFillGuest,
// que marca o W.O. inteiro: marcador, slots, ghost, desativação, notificação).
window._ligaWoConfirmGuest = function (tId, roundIndex, groupName, absentName) {
  _closeDialogs();
  window._ligaFillGuestPrompt(tId, roundIndex, groupName, absentName);
};

// O SUPLENTE = primeiro da fila que atende a CATEGORIA do grupo — e, desde a v1.8.45,
// a PROPORÇÃO DE GÊNERO reordena. Ordem do dono (13/ago/2026, dando W.O. na Glauce
// Assunção do R1 Grupo R — 4 mulheres, fila Fem → Fem → Masc): _"deve buscar garantir a
// proporção de 25/75. como nesse grupo não há nenhum homem, o homem na lista de espera
// passa na frente das mulheres e vai compor um grupo que estava 0/100 para virar 25/75."_
//
// ⚠️ Isto REVISA o "nunca reordenar a fila por melhor encaixe" da v1.6.88: a CATEGORIA
// continua só peneirando (nunca fura), mas a proporção passa a decidir ENTRE gêneros —
// dentro da mesma distância a ordem de chegada segue mandando. E NÃO é um portão: se
// ninguém deixa o grupo melhor (fila só de mulheres pra um grupo todo feminino), o
// primeiro da fila entra do mesmo jeito — trocar mulher por mulher mantém o grupo como
// estava, e vaga aberta por causa de proporção seria pior que a composição que já
// existia. Por isso a régua é DISTÂNCIA (`_ratioDistance`), não o booleano.

// A peneira de "quem pode assumir" — compartilhada entre quem ESCOLHE (_ligaNextSuplente)
// e quem EXPLICA (_ligaWoConfirm mostra se alguém furou a fila pela proporção).
function _ligaSuplenteServe(t, group, absentName) {
  var cat = _groupCategory(group);
  var inGroup = {}; (group.players || []).forEach(function (n) { inGroup[String(n)] = 1; });
  return function (e) {
    var nm = _wlDisplay(e);
    if (!nm || nm === absentName || inGroup[nm]) return false;
    if (nm.indexOf(' / ') !== -1) return false;      // dupla já formada não assume vaga individual
    if (!cat) return true;
    if (typeof window._participantInCategory === 'function') {
      try { return !!window._participantInCategory(e, cat, t); } catch (err) { return true; }
    }
    return true;
  };
}

// Gênero de UMA pessoa, na ordem de confiança: perfil pelo uid (cânone — o que está
// gravado na entrada envelhece) → campo `gender` da entrada (fictício/legado, que não
// tem perfil) → prefixo da CATEGORIA DE INSCRIÇÃO ("Fem D"/"Masc C" DECLARAM gênero;
// "C"/"D"/"Misto" não dizem nada). O prefixo é declaração de alguém (a pessoa ou o
// organizador escolheu a categoria), não presunção — presumir gênero é proibido.
function _entryGender(t, entry) {
  var u = '';
  if (entry && typeof entry === 'object') {
    u = (typeof window._participantUids === 'function')
      ? ((window._participantUids(entry) || [])[0] || '')
      : (entry.uid || '');
  }
  var g = '';
  if (u && typeof window._genderForUid === 'function') g = String(window._genderForUid(u) || '');
  if (!g && entry && entry.gender) g = String(entry.gender);
  if (!g) {
    var src = entry;
    // entrada do GRUPO só tem uid — a categoria mora na entrada do ELENCO
    if ((!src || (!src.category && !src.categories)) && u) {
      var lst = (t && Array.isArray(t.participants)) ? t.participants : [];
      for (var i = 0; i < lst.length; i++) { if (lst[i] && lst[i].uid === u) { src = lst[i]; break; } }
    }
    var cats = src ? [].concat(src.category || [], src.categories || []) : [];
    for (var j = 0; j < cats.length && !g; j++) {
      var c = String(cats[j] || '').trim().toLowerCase();
      if (c.indexOf('fem') === 0) g = 'feminino';
      else if (c.indexOf('masc') === 0) g = 'masculino';
    }
  }
  g = String(g).trim().toLowerCase();
  if (g.indexOf('masc') === 0) return 'masculino';
  if (g.indexOf('fem') === 0) return 'feminino';
  return '';
}

// A RÉGUA DA PROPORÇÃO pra esta vaga. Devolve null quando a proporção não decide nada
// (sorteio livre, categoria que separa gênero, ou alguém do grupo sem gênero resolvível
// — aí vale a ordem pura da fila, que era a regra até a v1.8.44). Senão devolve
// { ratio, rank(entry)→distância }: 0 = entrando, o grupo ATENDE a proporção exata.
// A proporção vem de `_ratioForPhase` — COM default (25/75) de propósito: preencher vaga
// de grupo formado é o mesmo caminho da formação por espera, onde a regra dura já valia
// (ver gender-ratio-core). ⚠️ A v1.7.90 lia `t.wlGenderRatio || t.genderRatio` CRU — e o
// Confra não tem nenhum dos dois (a proporção dele É o default): a régua estava morta e
// o pré-marcado caía na ordem pura. Também chamava `_genderForUid(t, u)` e
// `_pGender(t, p)` com assinatura errada (recebem só uid / só entrada) — gênero sempre
// resolvia vazio. Os dois defeitos nunca apareceram porque um escondia o outro.
function _ligaRatioRank(t, group, absentName) {
  if (typeof window._ratioForPhase !== 'function' || typeof window._ratioDistance !== 'function') return null;
  var cat = _groupCategory(group);
  var ratio = window._ratioForPhase(t, null, cat);
  if (!ratio) return null;
  var base = [];
  var players = (group && group.players) || [];
  for (var i = 0; i < players.length; i++) {
    if (String(players[i]) === String(absentName)) continue;
    var u = (group.playersUids || [])[i];
    var g = _entryGender(t, u ? { uid: u } : { name: players[i] });
    if (!g) return null;     // grupo sem gênero medível → a proporção não decide (ordem pura)
    base.push({ gender: g });
  }
  return {
    ratio: ratio,
    rank: function (entry) {
      var g = _entryGender(t, entry);
      if (!g) return 9;      // candidato sem gênero: nunca fura a fila (mas segue elegível)
      var d = window._ratioDistance(base.concat([{ gender: g }]), ratio);
      return (d == null) ? 9 : d;
    }
  };
}

function _ligaNextSuplente(t, group, absentName) {
  var serve = _ligaSuplenteServe(t, group, absentName);
  var rr = _ligaRatioRank(t, group, absentName);
  if (!rr) return window._waitlistFirst(t, serve);
  // menor distância vence; empate → ordem de chegada. O "primeiro que serve" continua
  // valendo DENTRO de cada distância — a proporção só decide entre gêneros diferentes.
  var best = null, bestD = Infinity;
  var q = (typeof window._getWaitlist === 'function') ? (window._getWaitlist(t) || []) : [];
  for (var i = 0; i < q.length; i++) {
    if (!serve(q[i])) continue;
    var d = rr.rank(q[i]);
    if (d < bestD) { best = q[i]; bestD = d; }
  }
  return best;
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
    var _absU = _woAbsentUidOf(g, absentName, ft); // antes de qualquer mutação do elenco
    _addWoMarker(ft, r, roundIndex, absentName, _cat, _absU);
    g.woAbsent = absentName;
    g.woDest = 'inactive';   // v1.7.59: destino único — W.O. desativa
    if (_absU) g.woAbsentUid = _absU; else delete g.woAbsentUid;
    // ⭐ 2.0.60 — O FATO VAI PRO REGISTRO (t.woLog), no ato. Tudo acima é ESTADO e muda
    // com a vida do torneio; o registro é o que sobrevive. Ver js/views/wo-log.js.
    _woLog('add', ft, { roundIndex: roundIndex, groupName: groupName, category: _cat,
      absentUid: _absU || null, absentName: absentName,
      subUid: (_sub && _sub.uid) || null, subName: _subName || '', subIsGuest: false });

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
        // ⛔ 2.0.58 — O RASTRO GUARDA O **UID**. Ordem do dono: _"sempre uid. nunca por
        // nome."_ O `woSubstituteFor` (nome) nasceu rótulo e por isso a cadeia do histórico
        // dependia de reconverter nome→uid na leitura — que falha quando o nome não está
        // gravado (o save strippa nome de entrada com uid) e quando o marcador de W.O. já
        // saiu. Foi o que apagou a Denise Mamesso do histórico do Grupo A. O nome fica só
        // como rótulo de exibição pra quem NÃO TEM conta.
        _marcaRastroWo(_subEntry, absentName, _absU);
        if (!Array.isArray(ft.participants)) ft.participants = ft.participants ? Object.values(ft.participants) : [];
        // quem JÁ é do elenco não recebe cópia nova — a marca vai na entrada REAL, senão
        // ela morre junto com a cópia descartada (ver _marcaRastroWo).
        var _jaEntry = _entradaNoElenco(ft, _subEntry.uid, _subName);
        if (_jaEntry) _marcaRastroWo(_jaEntry, absentName, _absU);
        else ft.participants.push(_subEntry);
      }
      window._removeFromWaitlist(ft, _subName);          // sai da fila (assumiu)
      _removeSitOut(r, _subName, (_subEntry && _subEntry.uid) || null);                        // não é mais folga — vai jogar
      _rewriteSlot(g, absentName, _subName, true, ft);
      // v1.7.63 — O SUPLENTE GUARDA O UID, espelhando o que `woAbsentUid` já fazia pro
      // ausente (v1.7.21). `subName` sozinho é rótulo, e rótulo ENVELHECE: quem troca o
      // displayName depois vira um `subName` que não resolve pra ninguém. Vazio de
      // propósito pra quem não tem conta — ali o nome é a identidade (ressalva do dono).
      g.subStatus = 'filled'; g.subName = _subName; g.subIsGuest = false; delete g.pendingInviteId;
      if (_sub && _sub.uid) g.subUid = String(_sub.uid); else delete g.subUid;
    } else {
      g.subStatus = 'open';                              // fila vazia: vaga aberta (convite/Jogador X)
    }

    // (3) O AUSENTE É DESATIVADO — sempre (v1.7.59).
    _ligaWoDeactivate(ft, absentName, _absU);
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
// ⛔ QUEM É A PESSOA: uid (v2.0.37). O nome só decide pra quem NÃO tem conta.
// Ordem do dono (24/ago/2026): _"nada por nome porra. só uid. a menos que seja digitado sem
// uid."_ Aqui o elenco era varrido comparando o NOME EXIBIDO — e o nome exibido é resolvido
// do perfil vivo, então ele MUDA quando a pessoa se renomeia. Quando não casava, o `else`
// abaixo empurrava uma entrada NOVA com o nome: a mesma pessoa duas vezes no elenco (uma
// só-uid, outra só-nome) — inscrito fantasma e +1 na contagem. Com o uid (que os 4 pontos
// de chamada já calculam ANTES de mexer no slot, via `_woAbsentUidOf`) a busca é exata.
// [[feedback_uid_controls_everything_name_only_ficticio]] · [[project_wo_lives_in_four_places]]
function _ligaWoDeactivate(ft, absentName, absentUid) {
  var _parts = Array.isArray(ft.participants) ? ft.participants : (ft.participants ? Object.values(ft.participants) : []);
  var _uidsDe = function (x) {
    if (!x || typeof x !== 'object') return [];
    return (typeof window._participantUids === 'function') ? window._participantUids(x)
         : [x.uid, x.p1Uid, x.p2Uid].filter(Boolean);
  };
  var _u = absentUid ? String(absentUid)
        : ((typeof window._memberUidByName === 'function') ? String(window._memberUidByName(ft, absentName) || '') : '');
  var _i = -1;
  for (var k = 0; k < _parts.length; k++) {
    var _p = _parts[k];
    if (!_p || typeof _p !== 'object') continue;
    if (_u) {                                   // TEM uid → só o uid decide
      if (_uidsDe(_p).indexOf(_u) !== -1) { _i = k; break; }
      continue;
    }
    // sem uid = nome digitado/fictício: aí, e só aí, o nome é a identidade — e a entrada
    // do outro lado também precisa ser sem uid (senão é gente diferente com nome parecido).
    if (!_uidsDe(_p).length && _wlDisplay(_p) === absentName) { _i = k; break; }
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
    // sem lugar nenhum, que é como o inscrito fantasma nasce. ⚠️ Com uid conhecido, a
    // entrada nasce COM ele (o nome vai junto só como rótulo de doc legado): sem uid a
    // pessoa volta a existir duas vezes na contagem de inscritos.
    var _nova = { name: absentName, displayName: absentName, ligaActive: false, woDeactivatedAt: new Date().toISOString() };
    if (_u) _nova.uid = _u;
    _parts.push(_nova);
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
      '<div style="font-size:0.8rem;font-weight:800;color:var(--sp-c-f87171,#f87171);">🔴 ' + _safe(absentName) + ' vai para os Desativados</div>' +
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
  // subName VAZIO = o W.O. acabou de ser dado e a vaga ainda não foi preenchida. Ordem do
  // dono (13/ago): "ao dar o W.O., todos os que estão no grupo e o que entrou no lugar
  // devem receber notificação automaticamente" — o aviso não pode esperar o suplente
  // aparecer. Mesmo notificador nos dois momentos, pra as duas mensagens não divergirem.
  var semSub = !subName;
  var comoEntrou = semSub ? 'a vaga está aberta'
    : (isGuest ? (subName + ' entrou como Jogador X (não pontua)') : (subName + ' assumiu a vaga'));

  // (a) o AUSENTE — o que aconteceu + O QUE FAZER pra voltar.
  var uAbs = uidDe(absentName);
  if (uAbs) {
    // v1.7.59: desfecho ÚNICO — desativado. A instrução é o caminho de volta, e ele
    // depende de um ATO da pessoa: religar o toggle é o que a põe na fila.
    var instr = 'Você ficou como DESATIVADO e não entra nos próximos sorteios. Para voltar: abra o torneio e ligue o botão "Ativado" — você entra no FIM da lista de espera e joga quando chegar a sua vez.';
    window._sendUserNotification(uAbs, Object.assign({}, base, {
      level: 'fundamental',
      message: (semSub
        ? 'Você levou W.O. no ' + gName + ' de "' + nome + '" — 0 pontos nesta rodada. ' + instr
        : 'Você levou W.O. no ' + gName + ' de "' + nome + '" — 0 pontos nesta rodada, e ' + comoEntrou + ' no seu lugar. ' + instr),
    }));
  }

  // (b) o SUBSTITUTO (só quem tem conta — Jogador X não tem; e só quando já existe).
  if (!isGuest && !semSub) {
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
    if (!n || (subName && n === subName) || n === absentName) return;
    var u = uidDe(n);
    if (!u) return;
    window._sendUserNotification(u, Object.assign({}, base, {
      level: 'important',
      message: (semSub
        ? 'Mudança no ' + gName + ' de "' + nome + '": ' + absentName + ' levou W.O. e a vaga está aberta. Seus jogos da rodada seguem valendo.'
        : 'Mudança no ' + gName + ' de "' + nome + '": ' + absentName + ' levou W.O. e ' + comoEntrou + '. Seus jogos da rodada seguem valendo.'),
    }));
  });
}
window._ligaNotifyWoCycle = _ligaNotifyWoCycle;

// ── Passo 2 (legado): convidar folga OU Jogador X — segue disponível pra vaga aberta ──
window._ligaPickFill = function (tId, roundIndex, groupName, absentName, opts) {
  opts = opts || {};
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  var cat = _groupCategory(group);
  var round = (t.rounds || [])[roundIndex];
  var uidMap = _nameUidMap(t);
  // v1.8.45 — perfis em cache (gênero mora no perfil); este diálogo também abre direto
  // pelo botão "escolher substituto", sem passar pelo passo 1 que já pré-carrega.
  try {
    if (typeof window._preloadUserProfiles === 'function') {
      window._preloadUserProfiles(((group.playersUids || []).filter(Boolean))
        .concat(((typeof window._getWaitlist === 'function' ? window._getWaitlist(t) : []) || []).map(function (e) {
          return (typeof window._participantUids === 'function') ? ((window._participantUids(e) || [])[0] || '') : (e && e.uid) || '';
        }).filter(Boolean)));
    }
  } catch (_ePre2) {}
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
    folgas.push({ name: _nm || _u, uid: _u || '', offCat: !_ok, fromWaitlist: true, entry: e });
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
  // v1.8.45 — a PROPORÇÃO reordena (ordem do dono, W.O. da Glauce no R1 Grupo R): quem
  // deixa o grupo NA proporção passa na frente. A distância de cada candidato é medida
  // AQUI, antes da ordenação, pela mesma régua do suplente automático (_ligaRatioRank —
  // nunca uma régua paralela). `dist = 0` pra todos quando a proporção não decide nada.
  var _rr = _ligaRatioRank(t, group, absentName);
  folgas.forEach(function (f) { f.dist = _rr ? _rr.rank(f.entry || f) : 0; });
  // ORDEM: categoria pesa mais que tudo (fora da categoria nunca fura, e vem marcado);
  // depois a PROPORÇÃO (menor distância primeiro — o homem fura a fila de mulheres num
  // grupo 0/100 em 25/75); depois fila antes de folga; e dentro de cada balde a ordem de
  // chegada é preservada (é ela que define "o primeiro da fila"). Ordenação ESTÁVEL.
  folgas = folgas
    .map(function (f, i) { return { f: f, i: i }; })
    .sort(function (a, b) {
      var ra = (a.f.offCat ? 100 : 0) + (a.f.dist * 10) + (a.f.fromWaitlist ? 0 : 1);
      var rb = (b.f.offCat ? 100 : 0) + (b.f.dist * 10) + (b.f.fromWaitlist ? 0 : 1);
      return ra !== rb ? ra - rb : a.i - b.i;
    })
    .map(function (x) { return x.f; });

  var catLbl = cat ? (window._displayCategoryName ? window._displayCategoryName(cat) : cat) : '';
  // Texto DINÂMICO conforme a regra do torneio: só menciona Pontos Avançados quando o
  // torneio usa PA E a punição de W.O. está ativa — com o VALOR configurado pelo org.
  var _woPenVal = (typeof window._woAdvPenalty === 'function') ? window._woAdvPenalty(t) : 0;
  var html = '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;"><b>' + _safe(absentName) + '</b> leva W.O. (0 pts na rodada' + (_woPenVal ? ', ' + _woPenVal + ' nos Pontos Avançados' : '') + '). Quem entra no lugar?</div>';
  // Jogos com placar pertencem a quem os disputou. O seletor completo substituiu a
  // janela resumida, mas esse aviso continua obrigatório antes de confirmar o W.O.
  if ((group.matches || []).some(_jogoJaTemPlacar)) {
    html += '<div style="background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:8px;padding:7px 9px;margin:0 0 8px;font-size:0.7rem;color:var(--sp-c-93c5fd,#93c5fd);">📌 Há jogos disputados: eles <b>não mudam</b>. Quem entrar assume a vaga e os jogos futuros.</div>';
  }
  if (folgas.length > 0) {
    var _souOrgHint = (typeof window._canManagePresence === 'function')
      ? !!window._canManagePresence(t, window.AppStore && window.AppStore.currentUser) : false;
    html += '<div style="font-size:0.74rem;font-weight:700;color:var(--sp-c-4ade80,#4ade80);margin:10px 0 6px;">' + (_souOrgHint ? 'Substituir ou convidar' : 'Convidar') + ' da lista de espera / folgas' + (catLbl ? ' · categoria ' + _safe(catLbl) : '') + ' — o PRIMEIRO que aceitar entra e pontua de verdade</div>';
    html += '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px;">' +
      (_souOrgHint ? 'Marque <b>um</b> pra colocar na hora, ou <b>vários</b> pra convidar — aí o primeiro que aceitar entra.'
                   : 'Marque quem recebe o convite — o primeiro que aceitar entra.') + '</div>';
    // AUTORIDADE decide a tela: organizador vê "Colocar agora" em cada candidato; o
    // participante do grupo vê só o convite. [[project_wo_outcome_negotiation_canon]]
    var _souOrg = (typeof window._canManagePresence === 'function')
      ? !!window._canManagePresence(t, window.AppStore && window.AppStore.currentUser) : false;
    // v1.7.90 — SÓ O PRIMEIRO QUE RESPEITA A PROPORÇÃO NASCE MARCADO.
    //
    // Ordem do dono, depois de operar o W.O. da Denise Mamesso ao vivo: "o padrao certo
    // é só vir o primeiro que respeitar a proporcao".
    //
    // Antes TODOS nasciam com `data-on="1"`: o diálogo abriu com Carol Moresco E Daniel
    // Oliveira marcados e o rodapé em "Convidar 2 selecionados". Confirmar ali teria
    // CONVIDADO os dois em vez de COLOCAR a primeira da fila — o oposto da regra, que é
    // "o próximo assume". Pior: o Daniel é homem e o grupo tinha 1H/2M + a vaga; entrar
    // ele daria 2H/2M e quebraria a proporção 25/75 travada do torneio.
    //
    // ⚠️ CORRIGIDO NA v1.8.45 (o erro fica registrado, não apagado): a implementação da
    // v1.7.90 lia `t.wlGenderRatio || t.genderRatio` cru — campos que o Confra NÃO tem
    // (a proporção dele é o default 25/75 de `_ratioForPhase`) — e resolvia gênero com
    // `_genderForUid(t, u)` / `_pGender(t, p)`, assinaturas erradas que devolvem sempre
    // vazio. A régua nasceu MORTA: o pré-marcado sempre caía na ordem pura, e no caso da
    // Denise parecia certo porque a primeira da fila POR ACASO mantinha a proporção.
    // Agora a régua é a MESMA do suplente automático (_ligaRatioRank → _ratioDistance),
    // já computada em `f.dist` antes da ordenação: marcado nasce o primeiro com dist 0.
    var _jaMarcou = false;
    html += '<div id="liga-fill-cands">' + folgas.map(function (f) {
      // offCat NÃO some com a pessoa: mostra marcado, e o organizador decide se aceita a
      // quebra de categoria. Sumir era o que fazia a fila "não existir" na tela.
      var _tag = f.offCat
        ? '<span style="font-size:0.62rem;font-weight:800;background:rgba(251,191,36,0.2);color:var(--sp-c-fbbf24,#fbbf24);padding:1px 6px;border-radius:5px;flex:0 0 auto;">fora da categoria</span>'
        : (f.fromWaitlist ? '<span style="font-size:0.62rem;font-weight:700;background:var(--sp-g-255-255-255-008,rgba(255,255,255,0.08));color:var(--text-muted);padding:1px 6px;border-radius:5px;flex:0 0 auto;">espera</span>' : '');
      // v1.8.45 — quem quebraria a proporção NÃO some (esconder é o que fez a fila "não
      // existir" na tela): vem marcado, e o organizador decide se aceita a quebra.
      if (_rr && f.dist > 0 && !f.offCat) {
        _tag += '<span style="font-size:0.62rem;font-weight:800;background:rgba(251,191,36,0.2);color:var(--sp-c-fbbf24,#fbbf24);padding:1px 6px;border-radius:5px;flex:0 0 auto;margin-left:4px;">quebra ' + _safe(_rr.ratio) + '</span>';
      }
      var _bd = f.offCat ? 'rgba(251,191,36,0.5)' : 'rgba(16,185,129,0.55)';
      var _co = f.offCat ? '#fbbf24' : '#4ade80';
      // v1.6.92: a linha é do NOME — largura inteira. O botão por linha (v1.6.91) comeu a
      // largura e picotou os nomes em duas linhas com a tag cortada. A AÇÃO virou UMA só,
      // no rodapé, e o que ela faz depende de quantos estão marcados (regra do dono).
      // Marca UM só: o primeiro da fila que mantém a proporção (dist 0 — a lista já vem
      // ordenada por distância, então é o primeiro da tela). Os demais entram
      // desmarcados e podem ser ligados no toque (é assim que se convida vários).
      var _on = (!_jaMarcou && !f.offCat && f.dist === 0);
      if (_on) _jaMarcou = true;
      return '<button type="button" class="btn btn-outline" data-cand="1" data-on="' + (_on ? '1' : '0') + '" data-uid="' + _safe(f.uid) + '" data-name="' + _safe(f.name) + '" onclick="window._ligaToggleCand(this)" style="width:100%;margin-bottom:6px;text-align:left;display:flex;align-items:center;gap:8px;border-color:' + window._spCor(_bd, 'color') + ';color:' + window._spCor(_co, 'color') + ';' + (_on ? '' : 'opacity:0.6;') + '">' +
        '<span data-mark="1" style="flex:0 0 auto;">' + (_on ? '✅' : '⬜') + '</span>' +
        // ⚠️ NOME NÃO SE COMPRIME. Era `nowrap + ellipsis`: com a tag "quebra 25/75" ao
        // lado sobravam 132px pra um nome que precisa de 206 e virava "Fabi…" / "Nath…" —
        // o organizador escolhendo suplente SEM conseguir ler de quem se trata. Agora
        // quebra em duas linhas: altura é barata, nome cortado não. [[project_name_fit_box_canonical]]
        '<span style="flex:1 1 auto;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.25;">' + _safe(f.name) + '</span>' +
        _tag +
      '</button>';
    }).join('') + '</div>';
  } else {
    // O texto antigo dizia "ninguém DA MESMA CATEGORIA" mesmo quando a lista de espera
    // tinha gente — a frase culpava a categoria por um defeito de leitura. Agora só é
    // dita quando a espera está REALMENTE vazia.
    html += '<div style="font-size:0.74rem;color:var(--text-muted);margin:8px 0;">A lista de espera está vazia e ninguém ficou de fora nesta rodada — não há quem convidar.</div>';
  }
  html += '<div style="font-size:0.74rem;font-weight:700;color:var(--sp-c-fbbf24,#fbbf24);margin:12px 0 6px;">Jogador X — qualquer pessoa presente (não pontua)</div>';
  html += '<button class="btn btn-outline" style="width:100%;border-color:rgba(251,191,36,0.4);color:var(--sp-c-fbbf24,#fbbf24);" onclick="window._ligaFillGuestPrompt(\'' + _esc(tId) + '\',' + roundIndex + ',\'' + _esc(groupName) + '\',\'' + _esc(absentName) + '\')">🎾 Completar com Jogador X</button>';
  // ⭐ 2.0.61 — o Jogador X SOBE: era a última coisa da tela, abaixo do box de destino,
  // e o dono não o achou no caso Fábio/E2. Opção de primeira classe vem ANTES da explicação.
  html += _ligaWoDestBox(absentName);

  // Ações no topo, como os demais diálogos operacionais: não roubam altura do conteúdo e
  // deixam a fila, o convite e o Jogador X visíveis juntos. O botão é a mesma ação única
  // de antes — apenas mudou de lugar; `_ligaSyncFillAction` continua sendo sua fonte única.
  var _headerAction = '<button id="liga-fill-action" type="button" class="btn btn-success" style="padding:8px 11px;font-size:0.78rem;font-weight:800;" ' +
    'data-tid="' + _safe(tId) + '" data-ri="' + roundIndex + '" data-gn="' + _safe(groupName) + '" data-abs="' + _safe(absentName) + '" data-org="' + (_souOrg ? '1' : '0') + '" data-fallback-wo="' + (folgas.length ? '0' : '1') + '" ' +
    'onclick="window._ligaFillAction(this)">Confirmar</button>';
  var _headerCancel = '<button type="button" class="btn btn-outline" style="padding:8px 11px;font-size:0.78rem;" onclick="document.getElementById(\'confirm-cancel-btn\').click()">Cancelar</button>';
  if (window.showConfirmDialog) {
    window.showConfirmDialog(opts.confirmTitle || 'Substituto', html, function () {}, function () {}, {
      type: 'warning', maxWidth: '460px', hideFooter: true, headerHtml: _headerCancel + _headerAction
    });
  } else if (window.showAlertDialog) {
    // Fallback de ambientes legados/testes que ainda não expõem o diálogo canônico.
    window.showAlertDialog(opts.confirmTitle || 'Substituto', html + _headerAction, function () {}, { type: 'warning', confirmText: 'Cancelar' });
  }

  // ⚠️ SINCRONIZA O RÓTULO NA MONTAGEM. `_ligaSyncFillAction` só rodava no TOQUE
  // (fim do _ligaToggleCand), então o botão abria com o texto estático "Convidar
  // selecionados" — e desde que a lista passou a vir com 1 candidato PRÉ-MARCADO
  // (v1.8.45, o suplente que respeita a proporção) isso virou promessa errada: com
  // UM marcado e sendo o organizador, a ação é COLOCAÇÃO DIRETA ("▶️ Colocar
  // <nome>"), não convite. Convite só faz sentido a partir de 2 marcados — aí sim
  // são opções, e entra o primeiro que aceitar. Regra do dono (13/ago).
  // setTimeout(0) porque o showAlertDialog insere o HTML e o botão só existe depois.
  try {
    window._ligaSyncFillAction();
    setTimeout(function () { try { window._ligaSyncFillAction(); } catch (e) {} }, 0);
  } catch (e) {}
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
    var _absU2 = _woAbsentUidOf(g, absentName, ft); // antes de qualquer mutação do elenco
    _addWoMarker(ft, r, roundIndex, absentName, cat, _absU2);
    g.woAbsent = absentName; g.woDest = 'inactive';   // v1.7.59: destino único
    if (_absU2) g.woAbsentUid = _absU2; else delete g.woAbsentUid;
    _woLog('add', ft, { roundIndex: roundIndex, groupName: groupName, category: cat,   // 2.0.60
      absentUid: _absU2 || null, absentName: absentName,
      subUid: subUid || null, subName: subName || '', subIsGuest: false });

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
    _marcaRastroWo(_entry, absentName, _absU2);   // 2.0.58 — o rastro é por UID
    if (!Array.isArray(ft.participants)) ft.participants = ft.participants ? Object.values(ft.participants) : [];
    var _jaE = _entradaNoElenco(ft, _entry.uid, subName);
    if (_jaE) _marcaRastroWo(_jaE, absentName, _absU2);   // já era do elenco: marca a entrada REAL
    else ft.participants.push(_entry);
    if (typeof window._removeFromWaitlist === 'function') window._removeFromWaitlist(ft, subName);
    _removeSitOut(r, subName, subUid || null);
    _rewriteSlot(g, absentName, subName, true, ft);
      // v1.7.63 — O SUPLENTE GUARDA O UID, espelhando o que `woAbsentUid` já fazia pro
      // ausente (v1.7.21). `subName` sozinho é rótulo, e rótulo ENVELHECE: quem troca o
      // displayName depois vira um `subName` que não resolve pra ninguém. Vazio de
      // propósito pra quem não tem conta — ali o nome é a identidade (ressalva do dono).
    g.subStatus = 'filled'; g.subName = subName; g.subIsGuest = false; delete g.pendingInviteId;
    if (subUid) g.subUid = String(subUid); else delete g.subUid;
    // convites pendentes do grupo perdem o sentido — a vaga foi resolvida na mão.
    if (Array.isArray(ft.ligaSubInvites)) {
      ft.ligaSubInvites.forEach(function (iv) {
        if (iv.groupName === groupName && iv.roundIndex === roundIndex && iv.status === 'pending') iv.status = 'cancelled';
      });
    }
    _ligaWoDeactivate(ft, absentName, _absU2);
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
    if (act.getAttribute('data-fallback-wo') === '1') {
      act.textContent = '🚫 Aplicar W.O.';
      act.style.opacity = '';
      return;
    }
    act.textContent = 'Marque quem entra ou recebe o convite';
    act.style.opacity = '0.5';
    return;
  }
  act.style.opacity = '';
  // ⚠️ SEM NOME NO BOTÃO (ordem do dono, 13/ago): "pode ser apenas substituir quando
  // único e convidar quando + de 1" · "não precisa colocar o nome no botão". O nome
  // vinha aqui e estourava/truncava o rótulo em nome comprido — e é redundante, já que
  // a linha marcada com ✅ logo acima diz de quem se trata. O que o botão precisa
  // comunicar é O QUE ELE FAZ: com UM marcado o organizador SUBSTITUI na hora (sem
  // aceite); com 2+ são opções, e aí é convite — entra o primeiro que aceitar.
  if (sel.length === 1 && org) {
    act.textContent = '▶️ Substituir';
  } else if (sel.length === 1) {
    act.textContent = '📨 Convidar';
  } else {
    act.textContent = '📨 Convidar selecionados';
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
    if (btn.getAttribute('data-fallback-wo') === '1') {
      window._ligaApplyWo(tId, ri, gn, abs);
      return;
    }
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
      var _absU3 = _woAbsentUidOf(g, absentName, ft);
      g.woDest = 'inactive'; g.woAbsent = absentName;
      if (_absU3) g.woAbsentUid = _absU3; else delete g.woAbsentUid;
    }
    _ligaWoDeactivate(ft, absentName, _absU3);
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
    var _absU4 = _woAbsentUidOf(g, absentName, ft);
    _addWoMarker(ft, r, roundIndex, absentName, cat, _absU4);
    _rewriteSlot(g, absentName, gname, true, t);
    _addGhost(ft, gname);
    // Jogador X NÃO tem conta — aqui o nome É a identidade, e não existe uid a gravar.
    g.woAbsent = absentName; g.subStatus = 'filled'; g.subName = gname; g.subIsGuest = true;
    delete g.subUid;
    if (_absU4) g.woAbsentUid = _absU4; else delete g.woAbsentUid;
    g.woDest = 'inactive';   // v1.7.59: destino único
    delete g.pendingInviteId;
    // 2.0.60 — registro. Jogador X entra como `subIsGuest` SEM uid: ele não tem conta, e
    // aqui o nome é a identidade dele (a ressalva do dono).
    _woLog('add', ft, { roundIndex: roundIndex, groupName: groupName, category: cat,
      absentUid: _absU4 || null, absentName: absentName,
      subUid: null, subName: gname, subIsGuest: true });
    _ligaWoDeactivate(ft, absentName, _absU4);   // v1.7.59: W.O. sempre desativa
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
    // ⛔ 2.0.58 — o uid do ausente é resolvido AQUI, antes de mutar o elenco, e viaja
    // DENTRO do convite. O convite dizia só o NOME de quem faltou; quem aceitasse depois
    // teria de reconverter nome→uid pra gravar o rastro — a conversão tardia que o dono
    // proibiu ("sempre uid, nunca por nome").
    var _absU5 = _woAbsentUidOf(g, absentName, ft);
    list.forEach(function (li) {
      if (ft.ligaSubInvites.some(function (iv) { return iv.id === li.id; })) return; // idempotente por id
      ft.ligaSubInvites.push({
        id: li.id, roundIndex: roundIndex, groupName: groupName, absentName: absentName,
        absentUid: _absU5 || null,
        category: cat || null, inviteeUid: li.uid, inviteeName: li.name,
        byUid: _byUid, byName: _byName, status: 'pending', createdAt: _createdAt
      });
    });
    _addWoMarker(ft, r, roundIndex, absentName, cat, _absU5); // W.O. já vale (ausente = 0)

    g.woAbsent = absentName; g.subStatus = 'pending'; g.pendingInviteId = list[0].id; delete g.subName; delete g.subIsGuest;
    if (_absU5) g.woAbsentUid = _absU5; else delete g.woAbsentUid;
    // 2.0.60 — o W.O. JÁ VALE (o ausente já tem 0 pts); quem assume vem depois, no aceite.
    // Registrar só quando alguém aceitasse deixaria de fora o W.O. cuja vaga ninguém pegou.
    _woLog('add', ft, { roundIndex: roundIndex, groupName: groupName, category: cat,
      absentUid: _absU5 || null, absentName: absentName });
  });
  if (typeof window._sendUserNotification === 'function') {
    list.forEach(function (li) {
      try {
        window._sendUserNotification(li.uid, {
          type: 'liga-sub-invite', level: 'fundamental', tournamentId: String(t.id), tournamentName: t.name || 'torneio',
          /* sem gênero: o convite chega pra qualquer pessoa, e "convidado" concordava com um
           * masculino fixo. "Chegou um convite" não pede concordância nenhuma. */
          message: 'Chegou um convite pra você entrar no lugar de ' + absentName + ' no ' + groupName + ' do torneio "' + (t.name || 'torneio') + '". O primeiro que aceitar joga (vale pontos). Abra o torneio pra aceitar.'
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
      '<div style="font-weight:700;font-size:0.9rem;color:var(--sp-c-4ade80,#4ade80);margin-bottom:4px;">📨 Convite pra substituir</div>' +
      '<div style="font-size:0.84rem;color:var(--text-bright);margin-bottom:10px;">Entre no lugar de <b>' + _safe(iv.absentName) + '</b> no <b>' + _safe(iv.groupName) + '</b>. Você joga e <b>pontua de verdade</b>.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button onclick="window._ligaAcceptSub(\'' + tE + '\',\'' + idE + '\')" style="background:#10b981;color:#fff;border:none;padding:8px 16px;border-radius:9px;font-weight:700;font-size:0.82rem;cursor:pointer;">✅ Aceitar e jogar</button>' +
        '<button onclick="window._ligaDeclineSub(\'' + tE + '\',\'' + idE + '\')" style="background:transparent;color:var(--sp-c-ef4444,#ef4444);border:1px solid rgba(239,68,68,0.5);padding:8px 16px;border-radius:9px;font-weight:700;font-size:0.82rem;cursor:pointer;">❌ Recusar</button>' +
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
    _removeSitOut(r, _invName, fiv.inviteeUid || iv.inviteeUid || null);     // não é mais folga — vai jogar
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
    // ⛔ 2.0.58 — o suplente também é UID. A entrada copiada da espera pode vir SÓ COM NOME
    // (a fila guarda texto pra quem foi inscrito à mão, e docs antigos guardam nome puro);
    // sem carimbar o uid do convite aqui, tudo o que vem depois — achar a entrada dele no
    // elenco, gravar o rastro, apontar `g.subUid` — cai no nome e erra com homônimo.
    if (!_subEntry.uid && fiv.inviteeUid) _subEntry.uid = fiv.inviteeUid;
    // 2.0.58 — o rastro é por UID. O do ausente vem do estado do grupo (gravado quando o
    // W.O. foi aplicado) ou do próprio convite, que passa a carregá-lo.
    var _absUAceite = g.woAbsentUid || fiv.absentUid || iv.absentUid || null;
    _marcaRastroWo(_subEntry, _absName, _absUAceite);
    // 2.0.60 — a vaga foi preenchida: carimba QUEM assumiu no evento aberto (o W.O. já
    // tinha sido registrado quando o convite saiu).
    _woLog('fill', ft, { roundIndex: _ri, groupName: _gn,
      absentUid: _absUAceite, absentName: _absName,
      subUid: _subEntry.uid || null, subName: _invName, subIsGuest: false });
    if (!Array.isArray(ft.participants)) ft.participants = ft.participants ? Object.values(ft.participants) : [];
    var _jaS = _entradaNoElenco(ft, _subEntry.uid, _invName);
    if (_jaS) _marcaRastroWo(_jaS, _absName, _absUAceite);   // já era do elenco: marca a entrada REAL
    else ft.participants.push(_subEntry);
    // sai da LISTA DE ESPERA — dos TRÊS storages, não só do monarchWaitlist (ele assumiu;
    // a espera não pode continuar contando com ele pra formar grupo novo).
    if (typeof window._removeFromWaitlist === 'function') window._removeFromWaitlist(ft, _invName);
    _rewriteSlot(g, _absName, _invName, true, t);
      // v1.7.63 — O SUPLENTE GUARDA O UID, espelhando o que `woAbsentUid` já fazia pro
      // ausente (v1.7.21). `subName` sozinho é rótulo, e rótulo ENVELHECE: quem troca o
      // displayName depois vira um `subName` que não resolve pra ninguém. Vazio de
      // propósito pra quem não tem conta — ali o nome é a identidade (ressalva do dono).
    g.subStatus = 'filled'; g.subName = _invName; g.subIsGuest = false; delete g.pendingInviteId;
    if (_subEntry && _subEntry.uid) g.subUid = String(_subEntry.uid); else delete g.subUid;
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

// ── 2.0.57 · UM "REVERTER" PARA CADA W.O. DADO ───────────────────────────────
// Ordem do dono (24/ago/2026, print do Grupo A com 3 W.O.s e UM botão): _"o reverter wo
// deveria ser 1 para cada wo dado."_ (E antes, na 1.7.90: _"o botao reverter wo fica
// vinculado a cada um que tomou o wo."_ — a lista cumpriu metade em 2.0.53, mostrando
// todos; faltava o desfazer de cada um.)
//
// O estado do grupo é SLOT ÚNICO (woAbsent/subName): só o W.O. mais recente mora nele.
// Os outros vivem no rastro (`woSubstituteFor` na entrada do substituto). Reverter passa
// a aceitar QUAL par desfazer:
//   · o par do ESTADO   → caminho de sempre (limpa woAbsent/subStatus/subName/…);
//   · um par do RASTRO  → desfaz só aquele elo (substituto → ausente de volta, marcador
//                         do ausente removido, folga devolvida ao substituto) e o estado
//                         do grupo fica intacto.
// ⚠️ ELO ENCADEADO NÃO PULA A FILA: numa cadeia (Denise→Carol→Karla) o substituto do elo
// antigo já não ocupa slot nenhum — quem está lá é o suplente do elo novo. Reverter fora
// de ordem não teria onde escrever, então quem chama tem que desfazer do mais novo pro
// mais antigo. `_ligaRevertWoBloqueadoPor` responde isso e o botão nasce desabilitado
// dizendo quem reverter primeiro (em vez de um botão que falha em silêncio).
window._ligaRevertWoBloqueadoPor = function (t, group, par) {
  if (!t || !group || !par) return '';
  var _ehEstado = (group.woAbsentUid && par.absentUid)
    ? (String(par.absentUid) === String(group.woAbsentUid))
    : (par.absentName === group.woAbsent);
  if (_ehEstado) return '';
  // o substituto daquele elo precisa estar NO GRUPO pra poder sair dele
  var _uids = Array.isArray(group.playersUids) ? group.playersUids : [];
  var _nomes = Array.isArray(group.players) ? group.players : [];
  var _no = par.subUid
    ? _uids.some(function (u) { return u && String(u) === String(par.subUid); })
    : _nomes.indexOf(par.subName) !== -1;
  if (_no) return '';
  // quem tomou o lugar dele? (o elo mais novo da cadeia) — é esse que tem que sair antes
  var _lista = window._ligaGroupWoList(t, group) || [];
  var _depois = _lista.filter(function (x) {
    return x !== par && ((x.absentUid && par.subUid) ? String(x.absentUid) === String(par.subUid)
                                                     : x.absentName === par.subName);
  })[0];
  return _depois ? (_depois.absentName || 'o W.O. seguinte') : (par.subName || 'o W.O. seguinte');
};

// Desfaz UM elo do rastro (W.O. que não é o do estado atual do grupo). Mesmas peças do
// caminho principal — `_rewriteSlot` (com o guard de jogo com placar dentro), marcador de
// W.O. fora, folga de volta pro substituto — mas SEM tocar em `woAbsent`/`subStatus`: o
// estado é de outro W.O., que continua valendo.
function _revertWoDoRastro(t, tId, roundIndex, groupName, absentUid, absentName) {
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  var lista = (typeof window._ligaGroupWoList === 'function') ? window._ligaGroupWoList(t, group) : [];
  var par = lista.filter(function (x) {
    return (absentUid && x.absentUid) ? String(x.absentUid) === String(absentUid) : x.absentName === absentName;
  })[0];
  if (!par || !par.subName) return;
  var _bloq = window._ligaRevertWoBloqueadoPor(t, group, par);
  if (_bloq) {
    if (window.showNotification) window.showNotification('Reverta na ordem',
      'Antes de desfazer o W.O. de ' + par.absentName + ', reverta o de ' + _bloq + ' — o lugar dele no grupo está ocupado.', 'warning');
    return;
  }
  if (typeof window._matchHasRealPlay === 'function' && Array.isArray(group.matches) &&
      group.matches.some(function (m) { return window._matchHasRealPlay(m); })) {
    if (window.showNotification) window.showNotification('W.O. não pode ser revertido',
      'Os jogos do grupo já começaram (placar lançado ou placar ao vivo iniciado). O W.O. não é mais reversível.', 'warning');
    return;
  }
  var cat = _groupCategory(group);
  var doRevert = function () {
    _commitLiga(tId, function (ft) {
      var g = _getGroup(ft, roundIndex, groupName); var r = ft.rounds && ft.rounds[roundIndex];
      if (!g || !r) return;
      _rewriteSlot(g, par.subName, par.absentName, true, ft);       // suplente sai, ausente volta
      _removeSitOut(r, par.absentName, par.absentUid || null);      // marcador de W.O. dele sai
      _addFolgaMarker(ft, r, roundIndex, par.subName, cat, par.subUid || null); // suplente volta a folgar
      // O rastro daquele elo deixa de existir — senão a lista o mostraria de novo e o
      // botão reverteria o que já foi revertido.
      _limpaRastroWo(ft, par.subUid, par.subName, par.absentUid, par.absentName);
      // 2.0.60 — no registro ele não some: fica marcado como REVERTIDO. "Aconteceu e foi
      // desfeito" é outra informação que "nunca aconteceu", e é a primeira que o
      // organizador procura quando perguntam por que a tabela mudou.
      _woLog('revert', ft, { roundIndex: roundIndex, groupName: groupName,
        absentUid: par.absentUid || null, absentName: par.absentName });
    });
    if (window.showNotification) window.showNotification('W.O. revertido', par.absentName + ' voltou ao grupo.', 'success');
    _rerender(tId);
  };
  if (window.showConfirmDialog) {
    window.showConfirmDialog('Reverter W.O.?',
      'Isso desfaz o W.O. de ' + par.absentName + ', tira ' + par.subName + ' do grupo e reabre os jogos.',
      doRevert, null, { type: 'warning', confirmText: 'Reverter' });
  } else doRevert();
}

// Reverter o W.O. (desfaz tudo: substituto sai, ausente volta).
// `absentUid`/`absentName` (opcionais) escolhem QUAL W.O. do grupo desfazer — sem eles,
// desfaz o do estado atual, que é o comportamento histórico de todo call-site antigo.
window._ligaRevertWo = function (tId, roundIndex, groupName, absentUid, absentName) {
  var t = _findT(tId); if (!t) return;
  var group = _getGroup(t, roundIndex, groupName); if (!group) return;
  if (!_canManageGroup(t, group)) return;
  var round = t.rounds[roundIndex];
  var cat = _groupCategory(group);
  var absent = group.woAbsent;
  // Alvo explícito: se NÃO é o par do estado, desfaz o elo do rastro e sai por lá.
  if (absentUid || absentName) {
    var _ehEstado = (absentUid && group.woAbsentUid)
      ? (String(absentUid) === String(group.woAbsentUid))
      : (absentName === group.woAbsent);
    if (!_ehEstado) return _revertWoDoRastro(t, tId, roundIndex, groupName, absentUid, absentName);
    absent = group.woAbsent;
  }
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
        else _addFolgaMarker(ft, r, roundIndex, g.subName, cat, g.subUid || null); // folga volta pro substituto real
        // 2.0.59 — e o RASTRO do substituto some junto. Sem isto ele fica órfão na entrada
        // dela: some da tela só porque `_rewriteSlot` a tirou do grupo, e RESSUSCITA como
        // um W.O. fantasma no dia em que ela voltar a esse grupo por qualquer caminho.
        _limpaRastroWo(ft, g.subUid, g.subName, g.woAbsentUid, _abs);
      }
      _removeSitOut(r, _abs, g.woAbsentUid || null); // remove o marcador de W.O.
      // 2.0.60 — e o registro marca REVERTIDO (append-only). Os DOIS caminhos de reversão
      // gravam: o do estado (aqui) e o do rastro (_revertWoDoRastro). Um só deixaria
      // metade dos "desfazer" invisível no histórico.
      _woLog('revert', ft, { roundIndex: roundIndex, groupName: groupName,
        absentUid: g.woAbsentUid || null, absentName: _abs });
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

// ── 2.0.53 · TODOS OS W.O.s DO GRUPO, NÃO SÓ O ÚLTIMO ────────────────────────
// Ordem do dono (24/ago/2026, print do Grupo A na mão — 3 substituições, UMA pílula):
// _"apliquei 2 wo num grupo e cade eles indicados. todos os wos num grupo devem ser
// indicados."_
//
// O estado do grupo (`woAbsent`/`subName`) é um SLOT ÚNICO — cada W.O. novo atropela a
// indicação do anterior. Mas o rastro completo NUNCA se perdeu: quem entra por W.O.
// carrega `woSubstituteFor` na entrada de participants (e a CADEIA continua — o ausente
// de hoje pode ter entrado ontem por W.O. de outro: Denise→Carol→Karla), e o uid do
// ausente mora no marcador de W.O. da rodada. Este helper reconstrói a lista:
//   1. pra cada membro ATUAL do grupo, segue a cadeia de `woSubstituteFor` (limitada,
//      à prova de ciclo);
//   2. o estado atual do grupo cobre suplente SEM trace (Jogador X / convidado sem
//      conta, que não entram em participants).
// uid do ausente: `woAbsentUid` (estado) ou o marcador — nome só decide sem uid (regra
// canônica, [[project_wo_lives_in_four_places]]).
// Devolve [{absentName, absentUid, subName, subUid, at}] do mais antigo pro mais novo.
//
// ⭐ 2.0.60 — ISTO VIROU O CAMINHO DE LEGADO. O histórico agora é GRAVADO quando o W.O.
// acontece (`t.woLog`, js/views/wo-log.js) e lido de lá; a reconstrução abaixo só roda em
// documento anterior ao registro. Ela ficou porque torneio de temporada em andamento não
// pode perder o histórico de um dia pro outro — mas NÃO é mais onde se conserta nada: bug
// de histórico se conserta na GRAVAÇÃO. Ver o cabeçalho do wo-log.js pra saber por que
// deduzir o passado do estado do presente custou quatro consertos em quatro dias.
window._ligaGroupWoList = function (t, group) {
  if (!t || !group) return [];
  var _ri0 = _roundIndexDoGrupo(t, group);
  if (typeof window._woLogCobreGrupo === 'function' && window._woLogCobreGrupo(t, _ri0, group.name)) {
    return (window._woLogForGroup(t, _ri0, group.name) || []).map(function (ev) {
      return { absentName: ev.absentName || '', absentUid: ev.absentUid || null,
               subName: ev.subName || '', subUid: ev.subUid || null,
               subIsGuest: !!ev.subIsGuest, at: ev.at || '', doRegistro: true };
    });
  }
  // ⚠️ 2.0.57 — O RASTRO VIAJA COM A PESSOA, E ELA NÃO FICA SÓ NO ELENCO.
  // Ordem do dono (24/ago/2026): _"carol entrou substituindo outro wo anterior e isso
  // deveria estar registrado no histórico aqui com o nome de quem ela substituiu"_.
  // `woSubstituteFor` mora na ENTRADA da pessoa — e quem levou W.O. e reativou está na
  // LISTA DE ESPERA (`standbyParticipants`), não em `participants`. Lendo só o elenco, a
  // cadeia morria nela e o elo anterior sumia do histórico do grupo. Os três storages da
  // espera são os mesmos de sempre ([[project_sitout_vs_waitlist_canon]]).
  var parts = (Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {}))
    .concat(Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [])
    .concat(Array.isArray(t.waitlist) ? t.waitlist : [])
    .filter(function (p) { return p && typeof p === 'object'; });
  var byUid = {};
  parts.forEach(function (p) { if (p && p.uid) byUid[String(p.uid)] = p; });
  var markerUid = {};
  (t.rounds || []).forEach(function (r) {
    ((r && r.matches) || []).forEach(function (m) {
      if (!m || !m.isSitOut || m.sitOutReason !== 'wo' || !m.p1) return;
      var u = (Array.isArray(m.team1Uids) && m.team1Uids[0]) || m.p1Uid || null;
      if (u && !markerUid[m.p1]) markerUid[m.p1] = String(u);
    });
  });
  // ⚠️ 2.0.57 — O UID DO AUSENTE NÃO PODE DEPENDER SÓ DO MARCADOR.
  // O marcador de W.O. é ESTADO e pode ter saído (v2.0.57: quem reativa pra fila com a
  // vaga preenchida perde o marcador — caso Carol). Quando ele some, `markerUid` fica
  // sem a pessoa, o mesmo ausente entra uma vez por UID (pelo estado do grupo, que tem
  // `woAbsentUid`) e outra por NOME (pela cadeia de traces) — e a pílula DUPLICA na tela.
  // Foi o que apareceu no print do Grupo A: "Carol Moresco W.O. → Karla Lia" duas vezes.
  // O mapa nome→uid dos participantes é a segunda fonte, e o dedup abaixo casa os dois
  // lados: entrada sem uid não cria linha nova quando já existe uma com o mesmo nome.
  var n2u = _nameUidMap(t) || {};
  // o mapa canônico cobre o ELENCO e lê `displayName`/`name` — mas o save STRIPPA o nome
  // de toda entrada com uid ([[project_uid_identity_canon_locked]]), então num torneio real
  // ele resolve por NOME VIVO (perfil em cache) ou não resolve. Quem está na espera nem
  // entra lá. Aqui completamos com as duas coisas, pra espera também.
  parts.forEach(function (p) {
    if (!p.uid) return;
    var nm = p.displayName || p.name || '';
    if (nm && !n2u[nm]) n2u[nm] = p.uid;
    if (typeof window._nameForUid === 'function') {
      var vivo = String(window._nameForUid(p.uid) || '').trim();
      if (vivo && !n2u[vivo]) n2u[vivo] = p.uid;
    }
  });
  // ⛔ 2.0.58 — O UID DO AUSENTE PRECISA DE FONTE DURÁVEL, NÃO DE CACHE.
  // MEDIDO no doc de produção (Grupo A, 24/ago): a Carol saía da lista SEM UID e a cadeia
  // parava nela — a Denise Mamesso, que ela substituiu em 09/ago, sumia do histórico. As
  // fontes de nome→uid eram frágeis demais: o MARCADOR de W.O. dela foi removido (é o que
  // a 2.0.57 faz com quem volta pra fila) e o mapa por nome depende do cache de perfis
  // (assíncrono) porque o doc não guarda nome em entrada com uid.
  // A ordem agora vai do durável pro circunstancial:
  //   1. `woSubstituteForUid` — gravado junto com o rastro (2.0.58). Não depende de nada.
  //   2. o ESTADO do grupo (`woAbsent`/`woAbsentUid`) — dado do próprio grupo.
  //   3. o marcador de W.O. da rodada — some quando a pessoa volta pra fila.
  //   4. o mapa por nome — só resolve com o perfil já carregado.
  var _absUidDe = function (nome, uidDoRastro) {
    if (uidDoRastro) return String(uidDoRastro);
    if (group.woAbsentUid && group.woAbsent === nome) return String(group.woAbsentUid);
    return markerUid[nome] || n2u[nome] || null;
  };
  // entrada de participants por uid OU por nome (o fictício não tem uid, e a cadeia dele
  // morreria em `byUid` — que é indexado só por uid).
  var _entradaDe = function (uid, nome) {
    if (uid && byUid[String(uid)]) return byUid[String(uid)];
    if (!nome) return null;
    return parts.filter(function (p) { return p && typeof p === 'object' && !p.uid && (p.displayName || p.name) === nome; })[0] || null;
  };
  var out = [], seen = {}, porNome = {};
  var push = function (absName, absUid, subName, subUid, at) {
    if (!absName) return;
    absUid = absUid || _absUidDe(absName);
    var kU = absUid ? ('u:' + absUid) : '', kN = 'n:' + absName;
    if (kU && seen[kU]) return;
    // ⚠️ A ADOÇÃO DO UID VEM ANTES DO CORTE POR NOME (2.0.58). Ela estava DEPOIS, e o
    // `seen[kN]` devolvia cedo: a linha da Carol — criada sem uid pela cadeia — nunca
    // recebia o uid que chegava logo em seguida pelo estado do grupo. Ficava `uid:null`,
    // e é o uid que a classificação usa pra pintar a tag "W.O." (por isso a tag dela
    // sumiu da tabela). Ordem errada de dois ifs; o resto do desenho estava certo.
    if (kU && porNome[absName] && !porNome[absName].absentUid) {
      porNome[absName].absentUid = absUid;
      seen[kU] = 1;
      return;
    }
    if (seen[kN]) return;
    if (kU) seen[kU] = 1;
    seen[kN] = 1;
    var linha = { absentName: absName, absentUid: absUid || null, subName: subName || '', subUid: subUid || null, at: at || '' };
    porNome[absName] = linha;
    out.push(linha);
  };
  var nomeVivo = function (uid, fb) {
    if (uid && typeof window._nameForUid === 'function') { var v = window._nameForUid(uid); if (v) return v; }
    return fb || '';
  };
  // ⛔ 2.0.93 · O RASTRO VIAJA COM A PESSOA — MAS O W.O. É DO GRUPO ONDE ACONTECEU.
  // O `woSubstituteFor` mora na ENTRADA de quem entrou, e a entrada acompanha a pessoa
  // pra onde ela for. Quando quem substituiu volta pra fila e cai num grupo NOVO, o rastro
  // vem junto e esta reconstrução desenhava o W.O. antigo no grupo novo (Confra, 25/ago:
  // "Denise Mamesso W.O. → Carol Moresco" apareceu no R1 Grupo I2, onde a Denise nunca
  // pisou — ela levou W.O. no Grupo A). O registro (`woLog`, 2.0.60) guarda o grupo do dia
  // e é durável: se ele diz que o W.O. daquela pessoa é de OUTRO grupo, aqui não é lugar
  // dele, e a CADEIA inteira a partir dali também é de lá. Grupo COBERTO pelo registro nem
  // chega neste laço (sai no primeiro `return` da função) — isto só afeta o legado.
  var _woEDeOutroGrupo = function (absUid, absName) {
    if (typeof window._woLogGrupoDoWo !== 'function') return false;
    var onde = window._woLogGrupoDoWo(t, absUid, absName);
    return !!onde && !(onde.groupName === group.name && (onde.roundIndex || 0) === (_ri0 || 0));
  };
  (group.playersUids || []).forEach(function (u, i) {
    var curUid = u ? String(u) : null;
    var curName = (group.players || [])[i] || '';
    var cur = curUid ? byUid[curUid] : null;
    var guard = 0;
    while (cur && cur.woSubstituteFor && guard++ < 10) {
      var absName = cur.woSubstituteFor;
      // `woSubstituteForUid` (2.0.58) é o que mantém a cadeia de pé sem cache nem marcador
      var absUid = _absUidDe(absName, cur.woSubstituteForUid);
      if (_woEDeOutroGrupo(absUid, absName)) break;
      push(absName, absUid, nomeVivo(curUid, curName), curUid, cur.woSubstituteAt || '');
      curName = absName; curUid = absUid;
      // a cadeia continua no ausente — e ele pode não ter marcador (2.0.57) nem uid
      // (fictício). Parar aqui era o que sumia com o elo mais antigo (Denise→Carol).
      cur = _entradaDe(absUid, absName);
    }
  });
  if (group.woAbsent) {
    push(group.woAbsent, group.woAbsentUid || markerUid[group.woAbsent] || null,
      group.subName || '', group.subUid || null, '');
  }
  out.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
  return out;
};

// ── v1.7.92 · O BOTÃO DE DAR W.O. É UM SÓ, NO MESMO LUGAR, EM TODO ESTADO ──────
// Ordem do dono, com o print do R1 Grupo A na mão: _"esse botao wo esta diferente de
// todos os outros e em outra posicao. ele precisa estar na mesma posicao (com ou sem
// wo aplicado no grupo)."_
//
// A 1.7.90 fez o certo (dar W.O. é sempre possível) mas montou o botão DUAS VEZES,
// com aparências diferentes: no estado normal ele saía `btn-sm`/0.72rem (o padrão do
// app), e nos estados COM W.O. saía `btn-micro`/0.66rem/`height:22px` — visivelmente
// menor e mais achatado. E era ACRESCENTADO no fim do bloco, então com W.O. aplicado
// ele pulava pra depois da pílula e do "Reverter".
//
// Agora existe UMA definição (mesma classe, mesmo tamanho, mesmo título).
//
// ⚠️ v1.8.71 — A POSIÇÃO MUDOU, E A DECISÃO DE 1.7.93 FOI SUPERADA PELO USO.
// Lá o botão passou a entrar como PRIMEIRO do bloco, com o argumento de que era
// "onde ele já ficava quando o grupo não tinha W.O.". Isso vale olhando SÓ o
// bloco — mas na TELA o bloco é o último da linha do cabeçalho do grupo
// (Combinar jogos · Grupo · Cheguei · [bloco W.O.]). Sem W.O., o botão é a
// última coisa da linha; com W.O., a pílula de status e o "Reverter" nasciam
// DEPOIS dele e o empurravam pro meio. Relato do dono (print de 14/ago): "aqui
// que já tem um W.O. aplicado o botão mudou de lado (na esquerda) quando deveria
// estar na direita".
// Agora ele entra por ÚLTIMO: fica na mesma ponta da linha nos dois estados, que
// é o invariante que a 1.7.93 queria e mediu do jeito errado.
//
// ⚠️ E o RÓTULO virou "Aplicar W.O." (ordem do dono no mesmo relato: "esse botão
// está causando alguma confusão"). "W.O." sozinho, em pílula vermelha, lê como
// SELO DE ESTADO — e a tabela do grupo usa exatamente isso ao lado de quem levou
// W.O. ("Anke W.O."). Duas coisas com o mesmo texto, uma sendo status e a outra
// ação. O verbo desfaz a ambiguidade sem mexer em nada além do texto.
// Ver [[project_wo_button_standard]] e [[feedback_unify_dual_entry_points]] — duas
// montagens do mesmo botão é exatamente o que faz uma delas divergir.
function _woDeclareBtn(onclickJs, mostrar) {
  if (!mostrar || typeof window._woBtnHtml !== 'function') return '';
  // ⚠️ v1.8.72 — RÓTULO EM DUAS LINHAS (ordem do dono, print de 14/ago: os botões
  // gastavam largura demais e a linha do cabeçalho quebrava feio). "Aplicar" em
  // cima, "W.O." embaixo: o botão fica estreito e o cabeçalho cabe numa linha só.
  // 2.0.20: o rótulo saiu daqui e virou o CANÔNICO de `_woBtnHtml` — esta tela era a
  // única que já fazia certo, e o dono pediu o mesmo em TODO botão de W.O.
  return window._woBtnHtml(onclickJs, true, {
    title: 'Algum jogador não pôde vir? Dê W.O. e chame um substituto (folga ou Jogador X).'
  });
}
// Junta o resto do bloco daquele estado com o botão de declarar (sempre por
// ÚLTIMO — ver o comentário acima: é o que o mantém na mesma ponta da linha
// com e sem W.O. aplicado).
//
// ⚠️ v1.8.72 — E COLADO NA BORDA DIREITA, "como era antes" (ordem do dono).
// SEM W.O. o bloco vai pro container de ações do cabeçalho, que tem
// `margin-left:auto` (bracket.js) — daí o botão nascer na direita. COM W.O. o
// bloco muda de casa: vai pra uma LINHA PRÓPRIA (`_woStateLine`), que é flex
// alinhada à esquerda — e o botão vinha junto, no meio da linha. O
// `margin-left:auto` no invólucro reproduz naquela linha o mesmo empurrão que o
// cabeçalho já dava: pílula e Reverter à esquerda, Aplicar na ponta direita.
function _woBlocoComBotao(btn, resto) {
  if (!btn) return resto;
  if (!resto) return btn;
  return resto + '<span style="margin-left:auto;display:inline-flex;">' + btn + '</span>';
}

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
  // v1.7.90 — DAR W.O. É SEMPRE POSSÍVEL.
  //
  // Relato do dono: "se deu wo pra alguem o botao para dar wo em outros, some. mas isso
  // esta errado. a rigor podemos dar wo sempre." E logo depois, a regra do desfazer:
  // "o botao reverter wo fica vinculado a cada um que tomou o wo."
  //
  // Eram DUAS causas somadas para o mesmo sintoma:
  //   1. esta função é uma máquina de estados que RETORNA CEDO em cada estado de W.O.
  //      (pendente / preenchido / sem substituto) — com um `woAbsent` no grupo ela nunca
  //      chegava na linha que monta o botão de dar W.O., lá embaixo;
  //   2. o bracket.js ainda tirava este bloco inteiro da linha de ações quando
  //      `g.woAbsent` estava setado.
  // Resultado: bastava UMA pessoa levar W.O. para o grupo inteiro ficar sem como
  // declarar a falta de qualquer outra — num torneio de temporada, onde o W.O. pode
  // acontecer a qualquer momento, isso trava o organizador.
  //
  // O botão passa a ser ACRESCENTADO a cada estado, em vez de ser alternativa a eles.
  // O "Reverter" de cada estado continua citando o NOME de quem levou aquele W.O.
  // (`group.woAbsent`) — é ele que fica vinculado à pessoa, como o dono pediu.
  // v1.7.92: UMA definição só (era montado aqui em btn-micro e lá embaixo em btn-sm) e
  // entra SEMPRE por ÚLTIMO, via `_woBlocoComBotao` — ver o comentário do helper.
  // ⭐ 2.0.50 — O BOTÃO NÃO SOME QUANDO O GRUPO TERMINA (caso Adele, 24/ago/2026).
  //
  // Ordem do dono: _"preciso do botao do WO mesmo depois das partidas realizadas. os
  // placares e resultados continuam ali, mas a suplente toma o lugar de quem teve o WO
  // decretado"_ (W.O. disciplinar — atitude antidesportiva). A sistemática é a da 2.0.15
  // (Juliana Reis): jogo com placar é intocável (`_jogoJaTemPlacar` em `_rewriteSlot`);
  // quem entra herda a vaga E a posição (elenco + retrato congelado).
  //
  // Com o grupo CONCLUÍDO o botão é só de ORGANIZADOR (org/co-org/árbitro via
  // `_canManagePresence`) — W.O. retroativo é ato disciplinar, não cabe a jogador do
  // grupo. Com o grupo em andamento, segue a regra de sempre (`_canManageGroup`).
  var _org = (typeof window._canManagePresence === 'function')
    && !!window._canManagePresence(t, window.AppStore && window.AppStore.currentUser);
  var _btnNovoWo = _woDeclareBtn("window._ligaAbsentFlow('" + tE + "'," + roundIndex + ",'" + gE + "')", gDone ? _org : manage);
  // Estado: pendente de aceite
  if (group.subStatus === 'pending') {
    // multi-convite: lista TODOS os pendentes do grupo (1 → nome; 2+ → contagem).
    var _pend = Array.isArray(t.ligaSubInvites) ? t.ligaSubInvites.filter(function (x) { return x.status === 'pending' && x.groupName === group.name && x.roundIndex === roundIndex; }) : [];
    var who = _pend.length === 1 ? ('convite enviado a ' + _pend[0].inviteeName + ', aguardando confirmação')
      : _pend.length > 1 ? (_pend.length + ' convidados — o 1º que aceitar joga')
      : 'convite enviado, aguardando confirmação';
    var s = '<span style="font-size:0.66rem;font-weight:700;color:var(--sp-c-fbbf24,#fbbf24);background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);padding:2px 8px;border-radius:6px;">⏳ ' + _safe(group.woAbsent) + ' levou W.O. · ' + _safe(who) + '</span>';
    // Demorou ou vai recusar? Os jogadores não ficam travados: convidam outro
    // folga OU completam com Jogador X na hora.
    if (manage) {
      s += ' <button type="button" class="btn btn-outline btn-sm" onclick="window._ligaCancelInvite(\'' + tE + '\',' + roundIndex + ',\'' + gE + '\')" style="' + poBtnStyle + 'color:var(--sp-c-4ade80,#4ade80);border-color:rgba(16,185,129,0.4);">📨 Convidar outro</button>';
      s += ' <button type="button" class="btn btn-outline btn-sm" onclick="window._ligaSwitchToGuest(\'' + tE + '\',' + roundIndex + ',\'' + gE + '\')" style="' + poBtnStyle + 'color:var(--sp-c-fbbf24,#fbbf24);border-color:rgba(251,191,36,0.45);">🎾 Jogador X</button>';
      // Reverter W.O. também no estado pendente — enquanto os jogos não começaram,
      // o organizador pode desfazer o W.O. (cancela o convite e reabre o grupo).
      var _woPlayedP = (typeof window._matchHasRealPlay === 'function')
        && Array.isArray(group.matches) && group.matches.some(function (m) { return window._matchHasRealPlay(m); });
      if (!_woPlayedP) s += ' ' + window._woBtnHtml("window._ligaRevertWo('" + tE + "'," + roundIndex + ",'" + gE + "')", false, { label: '↩️ Reverter<br>W.O.' });
    }
    return _woBlocoComBotao(_btnNovoWo, s);   // dar W.O. em OUTRA pessoa continua possível
  }
  // Estado: preenchido (W.O. ativo)
  if (group.subStatus === 'filled' && group.woAbsent) {
    var lbl = group.subIsGuest ? (_safe(group.subName) + ' (Jogador X)') : _safe(group.subName);
    // ⭐ A PÍLULA DO W.O. ENTRA NO FILTRO DA BUSCA — com os DOIS nomes.
    //
    // Relato do dono (22/ago/2026): _"coloco por exemplo nina, está aparecendo apenas ela
    // no W.O., mas quero que apareça também o grupo onde ela estava e consta lá que ela
    // estava naquele grupo e tomou o W.O. e foi substituída por não sei quem"_.
    //
    // POR QUE ELA SUMIA: o filtro (`_bracketApplyFilter`) só conhece `[data-players]`, e
    // esconde todo container que ficou sem nenhum casando. Quem levou W.O. NÃO está mais
    // nos jogos do grupo — o substituto ocupou o slot —, então o box inteiro sumia numa
    // busca pelo nome dela. Só sobrava o chip solto na caixa "W.O.", que não diz de qual
    // grupo ela era nem quem entrou no lugar.
    //
    // Esta pílula é justamente onde essa informação vive ("🔁 Nina W.O. → Priscila"), e é
    // o único ponto da tela que carrega os dois nomes juntos. Declará-la faz o box do
    // grupo sobreviver à busca por QUALQUER um dos dois — e o que o dono quer ver (de que
    // grupo, que levou W.O., quem substituiu) já está renderizado ali e na classificação.
    //
    // `data-my-match="1"`: pílula de estado não é JOGO, então o toggle "Só meus jogos" não
    // pode apagá-la — mesma decisão dos cards de organização e dos chips de quem ficou de
    // fora. [[feedback_unify_dual_entry_points]]
    // `data-fb-marker="1"`: a pílula DECLARA de qual grupo a pessoa era — não é card de jogo.
    // Sem isso, buscar outra pessoa do MESMO grupo escondia a pílula e a linha de estado do
    // W.O. inteira (ela é o único `[data-players]` de lá). Marcador nunca se esconde; só
    // empurra "tem gente aqui" pros ancestrais quando casa. [[project_wo_lives_in_four_places]]
    //
    // ⭐ 2.0.53 — TODOS os W.O.s do grupo, não só o último. Ordem do dono (print do Grupo A
    // com 3 substituições e UMA pílula): _"todos os wos num grupo devem ser indicados"_.
    // O estado é slot único; a LISTA sai de `_ligaGroupWoList` (traces + cadeia + estado).
    var _woLista = (typeof window._ligaGroupWoList === 'function') ? window._ligaGroupWoList(t, group) : [];
    if (!_woLista.length) _woLista = [{ absentName: group.woAbsent, subName: group.subName || '' }];
    // Some quando os jogos do grupo já começaram — W.O. não é mais reversível.
    var _woPlayed = (typeof window._matchHasRealPlay === 'function')
      && Array.isArray(group.matches) && group.matches.some(function (m) { return window._matchHasRealPlay(m); });
    // ⭐ 2.0.57 — UM "REVERTER" POR W.O., COLADO NA PÍLULA DELE (ordem do dono: _"o
    // reverter wo deveria ser 1 para cada wo dado"_). Antes o botão era um só, no fim da
    // linha, e desfazia sempre o W.O. do ESTADO — com 3 W.O.s no grupo (print do Grupo A)
    // não havia como desfazer os outros dois, e o botão solto nem dizia de quem era.
    // Cada par vira uma unidade "pílula + reverter"; o alvo vai no onclick (uid quando há,
    // nome pro fictício). Elo encadeado que ainda não pode ser desfeito nasce DESABILITADO
    // dizendo quem reverter primeiro — botão que falha calado é pior que botão ausente.
    var s2 = _woLista.map(function (par) {
      var _ehAtual = (group.woAbsentUid && par.absentUid) ? (String(par.absentUid) === String(group.woAbsentUid)) : (par.absentName === group.woAbsent);
      var _lblPar = (_ehAtual && group.subIsGuest) ? (_safe(par.subName || group.subName) + ' (Jogador X)') : _safe(par.subName);
      var _busca = window._safeHtml(String(par.absentName || '') + ' ' + String(par.subName || ''));
      var _pill = '<span data-players="' + _busca + '" data-my-match="1" data-fb-marker="1" style="display:inline-block;font-size:0.66rem;font-weight:700;line-height:1.25;text-align:left;color:var(--sp-c-a78bfa,#a78bfa);background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);padding:3px 8px;border-radius:6px;">🔁 ' + _safe(par.absentName) + ' W.O.<br>→ ' + _lblPar + '</span>';
      var _rev = '';
      if (manage && !_woPlayed && par.subName) {
        var _bloq = (typeof window._ligaRevertWoBloqueadoPor === 'function')
          ? window._ligaRevertWoBloqueadoPor(t, group, par) : '';
        var _alvo = "'" + tE + "'," + roundIndex + ",'" + gE + "','" + _esc(par.absentUid || '') + "','" + _esc(par.absentName) + "'";
        _rev = _bloq
          ? '<button type="button" class="btn btn-outline btn-sm" disabled title="Reverta antes o W.O. de ' + window._safeHtml(_bloq) + ' — o lugar de ' + window._safeHtml(par.absentName) + ' no grupo está ocupado." style="' + poBtnStyle + 'opacity:0.45;cursor:not-allowed;">↩️ Reverter<br>W.O.</button>'
          : window._woBtnHtml('window._ligaRevertWo(' + _alvo + ')', false,
              { label: '↩️ Reverter<br>W.O.', title: 'Desfazer o W.O. de ' + par.absentName + ' (' + par.subName + ' sai do grupo)' });
      }
      // pílula + seu reverter andam juntos: com vários W.O.s, um botão solto não diria de quem é
      return '<span style="display:inline-flex;align-items:center;gap:4px;">' + _pill + _rev + '</span>';
    }).join(' ');
    return _woBlocoComBotao(_btnNovoWo, s2);  // idem — o Reverter é do W.O. desta pessoa
  }
  // Estado: W.O. declarado mas sem substituto (recusa) — precisa preencher
  if (group.woAbsent && (group.subStatus === 'open' || !group.subStatus) && manage) {
    return _woBlocoComBotao(_btnNovoWo, '<button type="button" class="btn btn-outline btn-sm" onclick="window._ligaPickFill(\'' + tE + '\',' + roundIndex + ',\'' + gE + '\',\'' + _esc(group.woAbsent) + '\')" style="' + poBtnStyle + 'color:var(--sp-c-fbbf24,#fbbf24);border-color:rgba(251,191,36,0.45);">⚠️ ' + _safe(group.woAbsent) + ' levou W.O. · escolher substituto</button>');
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
      // v1.7.92: MESMA definição dos estados com W.O. (`_btnNovoWo`) — era aqui que
      // nascia a segunda versão do botão, e é o par delas que divergia em tamanho.
      return _btnNovoWo;
    }
  }
  // Grupo CONCLUÍDO sem W.O. ativo: o botão continua pro ORGANIZADOR (2.0.50 — W.O.
  // disciplinar pós-jogos). Pra quem não é org, `_woDeclareBtn` já devolveu ''.
  return _btnNovoWo;
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
// Um coringa não tem uid, mas ainda é uma PESSOA/VAGA distinta. `team*SlotIds`
// guarda essa identidade por posição e se repete nos três jogos rotativos do mesmo
// grupo. Nome continua sendo só rótulo. Registros antigos sem slotId mantêm o fallback
// por nome; toda vaga X criada daqui para frente recebe um id próprio.
function _monSlotIds(m, side) {
  var k = side === 'p1' ? 'team1SlotIds' : 'team2SlotIds';
  var names = side === 'p1' ? m.team1 : m.team2;
  if (!Array.isArray(m[k])) m[k] = (names || []).map(function () { return null; });
  return m[k];
}
function _monPlayers(t, gName, pIdx) {
  var s = {}, n2u = (typeof window._buildNameToUid === 'function') ? (window._buildNameToUid(t) || {}) : {};
  _monPlaying(t, gName, pIdx).forEach(function (m) {
    [['p1', m.team1 || [], m.team1Uids || []], ['p2', m.team2 || [], m.team2Uids || []]].forEach(function (side) {
      var ids = _monSlotIds(m, side[0]);
      side[1].forEach(function (name, i) {
        if (!name) return;
        var uid = side[2][i] || n2u[name] || null, slotId = ids[i] || null;
        var key = uid ? ('uid:' + uid) : (slotId ? ('slot:' + slotId) : ('name:' + name));
        if (!s[key]) s[key] = { name: name, uid: uid, slotId: slotId };
      });
    });
  });
  return Object.keys(s).map(function (k) { return s[k]; });
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
function _monCanManage(t, gName, pIdx) { return _canManageGroup(t, { players: _monPlayers(t, gName, pIdx).map(function (p) { return p.name; }) }); }

// Aplica: troca ausente→substituto nos jogos do grupo + marcador W.O. + ghost/folga.
window._monWoApply = function (tId, pIdx, gName, absentName, fillName, isGuest, absentSlotId) {
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
    var fillSlotId = isGuest ? ('ghostmon:' + Date.now() + ':' + Math.floor(Math.random() * 1e6)) : null;
    var _rwSide = function (m, nk, uk, side) {
      var names = m[nk]; if (!Array.isArray(names)) return;
      var uids = Array.isArray(m[uk]) ? m[uk].slice() : names.map(function () { return null; });
      var slotIds = _monSlotIds(m, side);
      names.forEach(function (n, i) {
        var hit = absentSlotId ? (slotIds[i] === absentSlotId) : ((absentUid && uids[i]) ? (uids[i] === absentUid) : (n === absentName));
        if (hit) { names[i] = fillName; uids[i] = fillUid; slotIds[i] = fillSlotId; }
      });
      m[uk] = uids;
    };
    playing.forEach(function (m) {
      // ⛔ JOGO COM PLACAR NÃO SE TOCA (2.0.50) — mesma fronteira do `_rewriteSlot`
      // (2.0.15, caso Juliana Reis): _"a pessoa que sai mantém o que fez e a que entra
      // herda a posição. nenhum placar alterado ou apagado. SEMPRE."_ Esta rota
      // renomeava o ausente também nos jogos JÁ DISPUTADOS — o resultado de quem jogou
      // passaria a ser creditado ao substituto.
      if (_jogoJaTemPlacar(m)) return;
      _rwSide(m, 'team1', 'team1Uids', 'p1');
      _rwSide(m, 'team2', 'team2Uids', 'p2');
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
      // v2.0.39: reusa o `absentUid` que este mesmo bloco já resolveu — resolver o nome
      // DUAS vezes é duas chances de discordar sobre quem é a pessoa.
      p1Uid: absentUid || null,
      team1Uids: absentUid ? [absentUid] : undefined,
      absentSlotId: absentSlotId || null, woReplacedBy: fillName, woIsGuest: !!isGuest, woFillSlotId: fillSlotId, label: 'W.O.',
      category: (playing[0] && playing[0].category) || undefined
    });
    if (isGuest) { _addGhost(ft, fillName); }              // Jogador X — não pontua
    else { _removeGhost(ft, fillName); }                    // folga real — pontua
    // 2.0.60 — o registro vale pras DUAS rotas de W.O. Esta é a canônica (t.matches), e
    // deixá-la de fora faria o histórico existir só em metade dos torneios. `phaseIndex`
    // entra como `roundIndex` (é o mesmo eixo: qual fase está em jogo).
    _woLog('add', ft, { roundIndex: pIdx, groupName: gName,
      category: (playing[0] && playing[0].category) || null,
      absentUid: absentUid || null, absentName: absentName,
      subUid: fillUid || null, subName: fillName, subIsGuest: !!isGuest });
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
    var _rwSide = function (m, nk, uk, side) {
      var names = m[nk]; if (!Array.isArray(names)) return;
      var uids = Array.isArray(m[uk]) ? m[uk].slice() : names.map(function () { return null; });
      var slotIds = _monSlotIds(m, side);
      names.forEach(function (n, i) {
        var hit = wm.woFillSlotId ? (slotIds[i] === wm.woFillSlotId) : ((fillUid && uids[i]) ? (uids[i] === fillUid) : (n === fillName));
        if (hit) { names[i] = absentName; uids[i] = absentUid; slotIds[i] = wm.absentSlotId || null; }
      });
      m[uk] = uids;
    };
    _monPlaying(ft, gName, pIdx).forEach(function (m) {
      _rwSide(m, 'team1', 'team1Uids', 'p1');
      _rwSide(m, 'team2', 'team2Uids', 'p2');
      if (m.team1 && m.team2) { m.p1 = m.team1.join(' / '); m.p2 = m.team2.join(' / '); }
    });
    ft.matches = (ft.matches || []).filter(function (m) { return !(m.bracket === 'monarch' && m.groupName === gName && ((m.phaseIndex || 0) === pIdx) && m.isSitOut && m.sitOutReason === 'wo'); });
    if (isGuest) _removeGhost(ft, fillName);
    // 2.0.60 — marca REVERTIDO no registro (o uid do ausente vem do slot do próprio
    // marcador, que é a fonte canônica desta rota).
    _woLog('revert', ft, { roundIndex: pIdx, groupName: gName,
      absentUid: ((wm.team1Uids || [])[0] || wm.p1Uid || absentUid || null), absentName: absentName });
    _limpaRastroWo(ft, fillUid, fillName, absentUid, absentName);
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
  var rows = players.map(function (p, i) {
    var discr = p.slotId ? (' <span style="opacity:.65;font-size:.75em;">(vaga ' + (i + 1) + ')</span>') : '';
    return '<button class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;" onclick="window._monWoPickFill(\'' + _esc(tId) + '\',' + pIdx + ',\'' + _esc(gName) + '\',\'' + _esc(p.name) + '\',\'' + _esc(p.slotId || '') + '\')">' + _safe(p.name) + discr + '</button>';
  }).join('');
  if (window.showAlertDialog) {
    window.showAlertDialog('Quem não pôde jogar? — ' + _safe(gName),
      '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;">O jogador escolhido leva <b>W.O.</b> (0 pontos nesta rodada). Em seguida você escolhe quem entra no lugar dele.</div>' + rows,
      function () {}, { type: 'warning', confirmText: 'Fechar' });
  }
};

// Passo 2: escolher o preenchimento — chamar uma FOLGA da rodada OU Jogador X.
window._monWoPickFill = function (tId, pIdx, gName, absentName, absentSlotId) {
  pIdx = pIdx || 0;
  var t = _findT(tId); if (!t) return;
  var folgas = _monRoundFolgas(t, pIdx);
  var html = '<div style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;"><b>' + _safe(absentName) + '</b> leva W.O. (0 pts). Quem entra no lugar?</div>';
  if (folgas.length) {
    html += '<div style="font-size:0.74rem;font-weight:700;color:var(--sp-c-4ade80,#4ade80);margin:4px 0 6px;">Folga da rodada — entra e PONTUA</div>';
    html += folgas.map(function (f) {
      return '<button class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;border-color:rgba(16,185,129,0.4);color:var(--sp-c-4ade80,#4ade80);" onclick="window._monWoApply(\'' + _esc(tId) + '\',' + pIdx + ',\'' + _esc(gName) + '\',\'' + _esc(absentName) + '\',\'' + _esc(f) + '\',false,\'' + _esc(absentSlotId || '') + '\'); window._dismissAllOverlays&&window._dismissAllOverlays();">🟢 ' + _safe(f) + '</button>';
    }).join('');
  } else {
    html += '<div style="font-size:0.72rem;opacity:0.7;margin-bottom:8px;">Nenhum jogador de folga nesta rodada.</div>';
  }
  html += '<div style="font-size:0.74rem;font-weight:700;color:var(--sp-c-fbbf24,#fbbf24);margin:12px 0 6px;">Jogador X — qualquer presente (NÃO pontua)</div>';
  html += '<button class="btn btn-outline" style="width:100%;border-color:rgba(251,191,36,0.4);color:var(--sp-c-fbbf24,#fbbf24);" onclick="window._monWoGuestPrompt(\'' + _esc(tId) + '\',' + pIdx + ',\'' + _esc(gName) + '\',\'' + _esc(absentName) + '\',\'' + _esc(absentSlotId || '') + '\')">🎾 Completar com Jogador X</button>';
  if (window.showAlertDialog) window.showAlertDialog('Substituir ' + _safe(absentName), html, function () {}, { type: 'info', confirmText: 'Fechar' });
};

window._monWoGuestPrompt = function (tId, pIdx, gName, absentName, absentSlotId) {
  if (typeof window.showInputDialog === 'function') {
    window.showInputDialog('Jogador X', 'Nome de quem vai completar a rodada (opcional):', function (val) {
      var name = (val || '').trim() || 'Jogador X';
      window._monWoApply(tId, pIdx, gName, absentName, name, true, absentSlotId);
    }, { placeholder: 'Jogador X', confirmText: 'Completar' });
  } else {
    window._monWoApply(tId, pIdx, gName, absentName, 'Jogador X', true, absentSlotId);
  }
};

// HTML do controle no cabeçalho do grupo (chamado por _renderMonarchStage).
window._monWoControlHtml = function (tId, pIdx, gName, groupDone) {
  pIdx = pIdx || 0;
  var t = _findT(tId); if (!t) return '';
  if (!(window._isLigaFormat && window._isLigaFormat(t)) || t.status === 'finished') return '';
  var manage = _monCanManage(t, gName, pIdx);
  var wm = _monWoMarker(t, gName, pIdx);
  // v1.7.92 — MESMA REGRA do bloco da rota Liga (`_ligaGroupControlsHtml`): um botão só,
  // na mesma ponta da linha com ou sem W.O. aplicado (por ÚLTIMO desde a 1.8.71 — ver o
  // comentário do `_woBlocoComBotao`). Aqui ele nem chegava a aparecer quando
  // havia W.O. no grupo (a função retornava antes), o que é a mesma trava que a 1.7.90
  // consertou do outro lado — dar W.O. em OUTRA pessoa tem que continuar possível.
  // 2.0.50 — grupo CONCLUÍDO: o botão continua, mas só pro ORGANIZADOR (W.O.
  // disciplinar pós-jogos — mesma regra da rota Liga, ver `_ligaGroupControlsHtml`).
  var _org = (typeof window._canManagePresence === 'function')
    && !!window._canManagePresence(t, window.AppStore && window.AppStore.currentUser);
  var _btnNovoWo = _woDeclareBtn("window._monWoFlow('" + _esc(tId) + "'," + pIdx + ",'" + _esc(gName) + "')",
    groupDone ? _org : manage);
  if (wm) {
    var lbl = wm.woIsGuest ? (_safe(wm.woReplacedBy) + ' (Jogador X)') : _safe(wm.woReplacedBy);
    // A pílula canônica também é índice de busca. Depois da troca, Jogador X
    // pode não estar mais nos cards da vaga; sem estes dois nomes o filtro não
    // consegue manter o grupo e o W.O. visíveis.
    var _woBusca = _safe(String(wm.p1 || '') + ' ' + String(wm.woReplacedBy || ''));
    var s = '<span data-players="' + _woBusca + '" data-my-match="1" data-fb-marker="1" style="display:inline-block;font-size:0.66rem;font-weight:700;line-height:1.25;text-align:left;color:var(--sp-c-a78bfa,#a78bfa);background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);padding:3px 8px;border-radius:6px;">🔁 ' + _safe(wm.p1) + ' W.O.<br>→ ' + lbl + '</span>';
    var played = (typeof window._matchHasRealPlay === 'function') && _monPlaying(t, gName, pIdx).some(function (m) { return window._matchHasRealPlay(m); });
    if (manage && !played && typeof window._woBtnHtml === 'function') {
      s += ' ' + window._woBtnHtml("window._monWoRevert('" + _esc(tId) + "'," + pIdx + ",'" + _esc(gName) + "')", false, { label: '↩️ Reverter<br>W.O.', size: 'btn-sm' });
    }
    return _woBlocoComBotao(_btnNovoWo, s);
  }
  return _btnNovoWo;
};

})();
