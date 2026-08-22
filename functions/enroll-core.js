'use strict';
/*
 * enroll-core.js — LÓGICA PURA de inscrição/desinscrição (Cloud Functions).
 *
 * Espelha FIELMENTE as transações do cliente em js/firebase-db.js
 * (enrollParticipant / deenrollParticipant). Serve às CFs `enrollParticipant`
 * e `deenrollParticipant`, que gravam pelo Admin SDK.
 *
 * POR QUE existe: o SDK Firestore do browser (10.8.1) tem um bug FATAL de
 * persistência IndexedDB ("INTERNAL ASSERTION FAILED: Unexpected state") que
 * mata a AsyncQueue no iOS Safari — quando isso ocorre, TODA runTransaction do
 * cliente estoura, e a inscrição/desinscrição falha (rollback + "Erro"). Movendo
 * a escrita pro servidor, ela deixa de passar pela fila quebrada E pelas rules
 * (o Admin SDK as ignora). Bônus: bug de inscrição vira `firebase deploy` de
 * minutos, não um ciclo de release nativo de dias. Ver [[project_firestore_assertion_bug]].
 *
 * REGRA: PURO — nada de firebase/admin/document aqui. Só decide o que gravar a
 * partir do doc atual; a CF aplica dentro de uma transação Admin (atômica).
 *
 * Os helpers participantUids / computeMemberUids / cleanUndefined são portes
 * fiéis dos cânones em js/views/identity-core.js e js/views/persist-core.js —
 * mesma convenção do functions/match-roster.js (inline, não require, pra não
 * arrastar o vendor pipeline do autoDraw pra cá).
 */

// Espelha window._participantUids (js/views/identity-core.js).
function participantUids(p) {
  if (typeof p !== 'object' || !p) return [];
  var seen = {}, uids = [];
  function add(u) { if (u && !seen[u]) { seen[u] = true; uids.push(u); } }
  add(p.uid); add(p.p1Uid); add(p.p2Uid);
  if (Array.isArray(p.participants)) p.participants.forEach(function (s) { if (s) add(s.uid); });
  return uids;
}

// Espelha window._computeMemberUids (js/views/persist-core.js).
function computeMemberUids(data) {
  if (!data) return [];
  // SANDBOX: SÓ os uids do dev. Impede o Firestore de ENTREGAR o doc do SB no listener
  // (`memberUids array-contains`) de um participante real espelhado. Espelha persist-core.
  if (data.isSandbox === true) {
    var own = {};
    [data.sandboxOwnerUid, data.creatorUid].forEach(function (u) {
      if (u && typeof u === 'string' && u.length >= 4) own[u] = true;
    });
    return Object.keys(own);
  }
  var set = {};
  var push = function (u) { if (u && typeof u === 'string' && u.length >= 4) set[u] = true; };
  push(data.creatorUid);
  if (Array.isArray(data.coHosts)) data.coHosts.forEach(function (ch) { if (ch && ch.status === 'active') push(ch.uid); });
  // v1.6.86: A LISTA DE ESPERA TAMBÉM É MEMBRO — espelha js/views/persist-core.js.
  // Quem está na espera está INSCRITO (só não foi sorteado): sem entrar em memberUids,
  // o listener (`memberUids array-contains`) não entrega o torneio pra própria pessoa.
  [
    Array.isArray(data.participants) ? data.participants : [],
    Array.isArray(data.standbyParticipants) ? data.standbyParticipants : [],
    Array.isArray(data.waitlist) ? data.waitlist : []
  ].forEach(function (parts) {
    parts.forEach(function (p) {
      if (!p || typeof p === 'string') return;
      push(p.uid); push(p.p1Uid); push(p.p2Uid);
      if (Array.isArray(p.participants)) p.participants.forEach(function (sub) { if (sub) push(sub.uid); });
    });
  });
  return Object.keys(set);
}

// Espelha window._phaseDrawDone (js/views/waitlist-core.js): fase SORTEADA → a inscrição
// vai pra LISTA DE ESPERA, nunca pro roster da rodada que já existe.
function phaseDrawDone(data) {
  if (!data) return false;
  return (Array.isArray(data.matches) && data.matches.length > 0) ||
    (Array.isArray(data.rounds) && data.rounds.length > 0) ||
    (Array.isArray(data.groups) && data.groups.length > 0);
}

// Espelha window._cleanUndefined (js/views/persist-core.js).
function cleanUndefined(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (typeof obj === 'object' && obj.constructor === Object) {
    var cleaned = {};
    Object.keys(obj).forEach(function (key) {
      if (obj[key] === undefined) return;
      if (typeof key === 'string' && key.length >= 4 && key.indexOf('__') === 0 && key.lastIndexOf('__') === key.length - 2) return;
      cleaned[key] = cleanUndefined(obj[key]);
    });
    return cleaned;
  }
  return obj;
}

function asParticipantsArray(data) {
  return Array.isArray(data.participants) ? data.participants
    : (data.participants ? Object.values(data.participants) : []);
}

// Espelha o gate de "inscrições abertas" de enrollParticipant.
// v1.8.40: REGRA CANÔNICA, espelhada no cliente por window._enrollmentOpenState
// (js/views/waitlist-core.js) — paridade travada por teste. Mudou aqui → mudou lá.
// `status !== 'finished'` entrou no ligaOpen: Liga ENCERRADA não aceita inscrição
// (antes o ligaOpen ignorava finished e o servidor aceitaria gente em torneio morto).
function enrollmentOpen(data, nowMs) {
  var isLiga = data.format && (data.format === 'Liga' || data.format === 'Ranking' || data.format === 'liga' || data.format === 'ranking');
  var ligaOpen = isLiga && data.ligaOpenEnrollment !== false && data.status !== 'finished';
  var sorteioRealizado = (Array.isArray(data.matches) && data.matches.length > 0) ||
    (Array.isArray(data.rounds) && data.rounds.length > 0) ||
    (Array.isArray(data.groups) && data.groups.length > 0);
  var deadlinePassed = !!(data.registrationLimit && new Date(data.registrationLimit).getTime() < nowMs);
  var open = (data.status !== 'closed' && data.status !== 'finished' && !sorteioRealizado && !deadlinePassed) || ligaOpen;
  return { open: open, deadlinePassed: deadlinePassed };
}

// Espelha o "already enrolled" de enrollParticipant (identidade por slot: uid > nome > email).
function isAlreadyEnrolled(participants, participantObj) {
  var pEmail = participantObj.email || '';
  var pName = participantObj.displayName || participantObj.name || '';
  var pUid = participantObj.uid || '';
  function memberMatches(m) {
    if (!m) return false;
    if (typeof m === 'string') {
      var s = m.trim();
      return (pEmail && s.toLowerCase() === pEmail.toLowerCase()) || (pName && s === pName);
    }
    if (pUid && m.uid && m.uid === pUid) return true;
    if (pEmail && m.email && m.email.toLowerCase() === pEmail.toLowerCase()) return true;
    if (pName && m.displayName && m.displayName === pName) return true;
    if (pName && m.name && m.name === pName) return true;
    return false;
  }
  return participants.some(function (p) {
    if (typeof p === 'string') {
      return p.split(' / ').map(function (s) { return s.trim(); }).filter(Boolean).some(memberMatches);
    }
    if (memberMatches(p)) return true;
    if (Array.isArray(p.participants) && p.participants.some(memberMatches)) return true;
    if (pUid && ((p.p1Uid && p.p1Uid === pUid) || (p.p2Uid && p.p2Uid === pUid))) return true;
    if (pName && ((p.p1Name && p.p1Name === pName) || (p.p2Name && p.p2Name === pName))) return true;
    if (pEmail && ((p.p1Email && p.p1Email.toLowerCase() === pEmail.toLowerCase()) || (p.p2Email && p.p2Email.toLowerCase() === pEmail.toLowerCase()))) return true;
    var label = p.displayName || p.name || '';
    if (label && label.indexOf(' / ') !== -1) {
      return label.split(' / ').map(function (s) { return s.trim(); }).filter(Boolean).some(memberMatches);
    }
    return false;
  });
}

// Decide a inscrição a partir do doc atual. Retorna { outcome, participants, updateData, ... }.
// A CF aplica updateData dentro da transação. NÃO stripa nomes (o servidor não tem
// perfil vivo pra reidratar — preservar o nome é o comportamento conservador que o
// próprio cliente adota quando _stripStoredNamesForUidEntries está indisponível).
function computeEnroll(data, participantObj, extraUpdates, nowMs) {
  var participants = asParticipantsArray(data);
  var openState = enrollmentOpen(data, nowMs);
  if (!openState.open) {
    var upd = {};
    if (openState.deadlinePassed && data.status !== 'closed') upd.status = 'closed';
    return { outcome: 'closed', participants: participants, updateData: (upd.status ? upd : null) };
  }
  if (isAlreadyEnrolled(participants, participantObj)) {
    return { outcome: 'already', participants: participants, updateData: null };
  }
  // v1.6.86 — FASE SORTEADA → LISTA DE ESPERA. Vem ANTES do teto de vagas de propósito:
  // a espera é justamente onde fica quem não tem vaga na rodada, então recusar por
  // "lotado" quem já está indo pra fila não faz sentido. Em Liga com temporada aberta
  // (ligaOpenEnrollment) este era o ramo que NÃO existia: `enrollmentOpen` devolvia
  // open=true e a pessoa era empurrada pra participants depois do sorteio — inscrita,
  // fora dos grupos, fora da espera (Confra ago/2026). Ver waitlist-core._phaseDrawDone.
  if (phaseDrawDone(data)) {
    var standby = Array.isArray(data.standbyParticipants) ? data.standbyParticipants : [];
    if (isAlreadyEnrolled(standby, participantObj)) {
      return { outcome: 'alreadyWaitlisted', participants: participants, updateData: null };
    }
    var newStandby = standby.concat([cleanUndefined(participantObj)]);
    var wlData = Object.assign({}, data, { standbyParticipants: newStandby });
    var wlUpdate = { standbyParticipants: newStandby, memberUids: computeMemberUids(wlData) };
    if (extraUpdates) {
      Object.keys(extraUpdates).forEach(function (k) { wlUpdate[k] = cleanUndefined(extraUpdates[k]); });
    }
    return {
      outcome: 'waitlisted', participants: participants,
      standbyParticipants: newStandby, updateData: wlUpdate
    };
  }
  var capMax = parseInt(data.maxParticipants, 10);
  var isDrawMode = data.enrollmentLimitMode === 'draw';
  if (!isDrawMode && !isNaN(capMax) && capMax > 0 && participants.length >= capMax) {
    return { outcome: 'capacityFull', participants: participants, updateData: null };
  }
  participants = participants.concat([cleanUndefined(participantObj)]);
  var enrollData = Object.assign({}, data, { participants: participants });
  var updateData = { participants: participants, memberUids: computeMemberUids(enrollData) };
  if (extraUpdates) {
    Object.keys(extraUpdates).forEach(function (k) { updateData[k] = cleanUndefined(extraUpdates[k]); });
  }
  var maxP = parseInt(data.maxParticipants, 10);
  var autoClose = false, reachedDraw = false;
  if (!isDrawMode && !isNaN(maxP) && maxP > 0 && participants.length >= maxP) {
    updateData.status = 'closed'; autoClose = true;
  }
  if (isDrawMode && !isNaN(maxP) && maxP > 0 && participants.length >= maxP && !data.waitlistNoticeSent) {
    updateData.waitlistNoticeSent = true; reachedDraw = true;
  }
  return { outcome: 'enrolled', participants: participants, updateData: updateData, autoClose: autoClose, reachedDraw: reachedDraw };
}

// Constrói o PARCEIRO (lado `n`) de uma dupla como inscrito SOLO. Espelha
// window._pairPartnerSolo (js/views/tournaments.js) e o solo() de computeSplitPair
// (pair-core.js) — o solo herda o que era POR MEMBRO (nº de inscrição, contato,
// categoria). Fictício (sem uid) volta como a STRING do nome. Sem uid nem nome → null.
function pairPartnerSolo(entry, n) {
  var g = function (suf) { return entry['p' + n + suf]; };
  var uid = g('Uid') || '';
  var nome = String(g('Name') || '').trim();
  if (!uid) return nome || null; // fictício sem conta → string do nome
  var o = { uid: uid, ligaActive: true };
  if (nome) { o.displayName = nome; o.name = nome; }
  if (g('Seq') != null) o.enrollSeq = g('Seq');
  // CAMPO DE PERFIL NÃO É GRAVADO EM QUEM TEM UID (email/photoURL/gender/birthDate).
  // Antes eram copiados aqui, e o servidor não passa pelo strip do cliente
  // (identity-core._stripUidEntryNames) — então a CF era a ÚNICA porta por onde
  // cópia de perfil ainda entrava no torneio (medido em produção: 2 entradas com
  // email/gender/skillBySport, ambas de uid com perfil VIVO). O argumento que
  // justifica preservar o NOME — sem perfil, o nome é a última âncora de identidade
  // do uid órfão — NÃO vale pra esses campos: eles nunca identificam ninguém, e o
  // app já os resolve pelo uid (_pGender/_pBirth/_userProfileCache, e a própria CF
  // via _enrichParticipantsFromProfiles). Guardar cópia só cria um segundo lugar
  // onde o dado da pessoa vive — e que o "apagar do perfil" não alcança.
  if (entry.category) o.category = entry.category;
  if (Array.isArray(entry.categories)) o.categories = entry.categories.slice();
  if (entry.categorySource) o.categorySource = entry.categorySource;
  return o;
}

// Decide a desinscrição (self) a partir do doc atual. Quem sai é o uid.
// v1.5.x — DUPLA NÃO SOME O PARCEIRO: se o uid está numa DUPLA, a dupla é DESFEITA
// e o PARCEIRO fica como inscrito SOLO ("sem dupla"), continuando no torneio — mesmo
// comportamento que o organizador já tem ao remover 1 da dupla (removeParticipantFunction
// → _pairPartnerSolo). Antes a entrada inteira era filtrada e o parceiro sumia.
// Também: o uid do que saiu tem que sair de TODO slot (uid/p1Uid/p2Uid) — senão
// _userMatchesParticipant ainda o vê inscrito e "Inscrever-se" vira no-op. Iterar
// (não filtrar por 1º match) também limpa DUPLICATAS: o uid é removido de todas as
// entradas em que aparece. Time >2 (participants[]) segue removendo a entrada inteira.

// A pessoa JÁ ESTÁ COLOCADA no sorteio? (grupo do Rei/Rainha, grupo comum ou jogo)
//
// Não basta "o sorteio saiu": quem se inscreveu DEPOIS e está na lista de espera ainda pode
// sair limpo, porque não ocupa vaga nenhuma. O que não pode sair é quem já tem lugar na
// estrutura — tirá-lo de `participants` deixa a vaga ocupada por um fantasma.
function isPlacedInDraw(data, uid) {
  if (!data || !uid) return false;
  var achou = false;
  var olhaLista = function (arr) {
    if (achou || !Array.isArray(arr)) return;
    if (arr.indexOf(uid) !== -1) achou = true;
  };
  (Array.isArray(data.rounds) ? data.rounds : []).forEach(function (r) {
    if (!r) return;
    (Array.isArray(r.monarchGroups) ? r.monarchGroups : []).forEach(function (g) {
      if (g) olhaLista(g.playersUids);
    });
    (Array.isArray(r.matches) ? r.matches : []).forEach(function (m) {
      if (!m) return; olhaLista(m.team1Uids); olhaLista(m.team2Uids);
    });
  });
  (Array.isArray(data.groups) ? data.groups : []).forEach(function (g) {
    if (g) { olhaLista(g.playersUids); olhaLista(g.playerUids); }
  });
  (Array.isArray(data.matches) ? data.matches : []).forEach(function (m) {
    if (!m) return; olhaLista(m.team1Uids); olhaLista(m.team2Uids);
  });
  return achou;
}

function computeDeenroll(data, userUid) {
  var participants = asParticipantsArray(data);

  // ⛔ DEPOIS DE COLOCADA NO SORTEIO, SAIR NÃO É REMOVER — É DESATIVAR.
  //
  // Ordem do dono (22/ago/2026), depois de a Juliana Reis sumir de `participants` deixando
  // a vaga dela ocupada no R1 Grupo M: _"o melhor seria a pessoa não poder se desinscrever
  // silenciosamente. e deixar coisas quebradas."_
  //
  // O estrago medido: 34 grupos × 4 = 136 vagas, mas só 135 inscritos — um lugar que não é
  // de ninguém, contagem ÍMPAR, e a fase 2 (que forma dupla dentro do grupo) sem como
  // fechar aquele grupo. Os jogos dela já tinham placar; o histórico continuava lá.
  //
  // A peça certa já existe no app e é a MESMA do W.O.: `ligaActive: false` — a pessoa para
  // de jogar, a estrutura mantém a vaga e o histórico. É exatamente o que o dono já queria
  // pra ela (W.O. no início da fase 2, depois de a dupla passar no sorteio).
  //
  // A regra é ESTRUTURAL, não sobre quem clicou: vale pra pessoa e pro organizador. Quem
  // precisa mesmo tirar alguém da estrutura usa W.O./substituição, que sabe recompor o
  // grupo. [[project_wo_always_deactivates]] · [[project_roster_guard_single_rule]]
  if (isPlacedInDraw(data, userUid)) {
    var mexeu = false;
    var comInativo = participants.map(function (p) {
      if (!p || typeof p !== 'object') return p;
      if (participantUids(p).indexOf(userUid) === -1) return p;
      if (p.ligaActive === false) return p;                 // já estava fora: nada a fazer
      mexeu = true;
      return Object.assign({}, p, { ligaActive: false, selfDeactivatedAt: new Date().toISOString() });
    });
    if (!mexeu) return { outcome: 'notFound', participants: participants, updateData: null };
    return {
      outcome: 'deactivated',
      placed: true,
      participants: comInativo,
      updateData: { participants: comInativo }             // memberUids NÃO muda: ela segue no torneio
    };
  }

  var changed = false;
  var newParticipants = [];
  participants.forEach(function (p) {
    if (!p || typeof p !== 'object') { newParticipants.push(p); return; } // string guest
    var isPair = !!((p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name));
    if (isPair && (p.p1Uid === userUid || p.p2Uid === userUid)) {
      var keep = pairPartnerSolo(p, p.p1Uid === userUid ? 2 : 1);
      changed = true;
      if (keep) newParticipants.push(keep); // parceiro sobrevive (solo ou string fictícia)
      return;
    }
    if (participantUids(p).indexOf(userUid) !== -1) { changed = true; return; } // solo/time → remove
    newParticipants.push(p);
  });
  if (!changed) {
    return { outcome: 'notFound', participants: participants, updateData: null };
  }
  var deenrollData = Object.assign({}, data, { participants: newParticipants });
  return {
    outcome: 'deenrolled',
    participants: newParticipants,
    updateData: { participants: newParticipants, memberUids: computeMemberUids(deenrollData) }
  };
}

module.exports = {
  participantUids, computeMemberUids, cleanUndefined, phaseDrawDone, isPlacedInDraw,
  enrollmentOpen, isAlreadyEnrolled, computeEnroll, computeDeenroll
};
