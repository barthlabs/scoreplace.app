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
  var set = {};
  var push = function (u) { if (u && typeof u === 'string' && u.length >= 4) set[u] = true; };
  push(data.creatorUid);
  if (Array.isArray(data.coHosts)) data.coHosts.forEach(function (ch) { if (ch && ch.status === 'active') push(ch.uid); });
  var parts = Array.isArray(data.participants) ? data.participants : [];
  parts.forEach(function (p) {
    if (!p || typeof p === 'string') return;
    push(p.uid); push(p.p1Uid); push(p.p2Uid);
    if (Array.isArray(p.participants)) p.participants.forEach(function (sub) { if (sub) push(sub.uid); });
  });
  return Object.keys(set);
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
function enrollmentOpen(data, nowMs) {
  var isLiga = data.format && (data.format === 'Liga' || data.format === 'Ranking' || data.format === 'liga' || data.format === 'ranking');
  var ligaOpen = isLiga && data.ligaOpenEnrollment !== false;
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

// Decide a desinscrição (self) a partir do doc atual. Remove a entrada inteira em
// que o uid aparece (uid / p1Uid / p2Uid / sub-participants) — dupla não joga com
// uma pessoa só. Espelha deenrollParticipant.
function computeDeenroll(data, userUid) {
  var participants = asParticipantsArray(data);
  var newParticipants = participants.filter(function (p) {
    if (!p || typeof p !== 'object') return true; // string legada = guest, sem uid
    return participantUids(p).indexOf(userUid) === -1;
  });
  if (newParticipants.length === participants.length) {
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
  participantUids, computeMemberUids, cleanUndefined,
  enrollmentOpen, isAlreadyEnrolled, computeEnroll, computeDeenroll
};
