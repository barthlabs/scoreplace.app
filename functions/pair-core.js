'use strict';
/*
 * pair-core.js — LÓGICA PURA de formar/desfazer DUPLA manual (Cloud Functions).
 *
 * Espelha FIELMENTE as mutações do cliente:
 *   - formar:  js/views/tournaments.js `_formDuplaByUids` (drag-drop + aceite de convite)
 *   - desfazer: js/views/tournaments.js `_splitDupla`
 *
 * POR QUE existe (item #2, migração sorteio/roster client→CF): a formação manual gravava
 * via `FirestoreDB.saveTournament(t)` DIRETO — (a) NÃO era concorrência-safe (merge do doc
 * inteiro → clobbera check-in/W.O. concorrente) e (b) NÃO replicava pro Sandbox (o SB
 * divergia do original quando o organizador formava duplas → quebrava a fidelidade do SB,
 * o motivo da conversa que originou esta migração). As CFs formPair/splitPair rodam a MESMA
 * lógica pura no doc + no SB (via replicateRosterToSandbox), atômico pelo Admin SDK.
 *
 * REGRA: PURO — nada de firebase/admin/document. Só decide o que gravar a partir do doc atual.
 * Reusa computeMemberUids/cleanUndefined de enroll-core (mesmos cânones de identity/persist).
 */

const { computeMemberUids, cleanUndefined } = require('./enroll-core');

function asParticipantsArray(data) {
  return Array.isArray(data.participants) ? data.participants
    : (data.participants ? Object.values(data.participants) : []);
}

function entryName(p) {
  return typeof p === 'string' ? p : ((p && (p.displayName || p.name)) || '');
}

// Espelha window._teamFormation.dropRequestsInvolving (js/views/team-formation.js:56).
function dropRequestsInvolving(pairRequests, uids) {
  if (!Array.isArray(pairRequests)) return pairRequests;
  return pairRequests.filter(function (r) {
    return uids.indexOf(r.inviterUid) === -1 && uids.indexOf(r.inviteeUid) === -1;
  });
}

// Espelha window._markDuplasManual (js/views/tournaments-draw.js:1262): grava a regra na
// FONTE que _isManualPairing lê (fmt2.formacaoDupla p/ format2; manualPairing p/ legado).
// Devolve os campos a mesclar no updateData.
function markDuplasManualUpdate(data) {
  if (data.fmt2 && typeof data.fmt2 === 'object') {
    var fmt2 = Object.assign({}, data.fmt2, { formacaoDupla: 'manual' });
    return { fmt2: fmt2 };
  }
  return { manualPairing: 'open' };
}

// Decide a FORMAÇÃO da dupla a partir do doc atual. Espelha _formDuplaByUids.
// opts: { uid1, name1, uid2, name2 }. Match por uid (conta) ou por nome (fictício sem conta).
function computeFormPair(data, opts) {
  var uid1 = opts.uid1 || '', name1 = opts.name1 || '';
  var uid2 = opts.uid2 || '', name2 = opts.name2 || '';
  var arr = asParticipantsArray(data).slice();

  var fi1 = arr.findIndex(function (p) {
    return uid1 ? (typeof p === 'object' && p && p.uid === uid1) : (entryName(p) === name1);
  });
  var fi2 = arr.findIndex(function (p) {
    return uid2 ? (typeof p === 'object' && p && p.uid === uid2) : (entryName(p) === name2);
  });
  if (fi1 === -1 || fi2 === -1 || fi1 === fi2) {
    return { outcome: 'notFound', participants: asParticipantsArray(data), updateData: null };
  }

  var _p1 = arr[fi1], _p2 = arr[fi2];
  var _u1 = uid1 || (typeof _p1 === 'object' && _p1 ? (_p1.uid || '') : '');
  var _u2 = uid2 || (typeof _p2 === 'object' && _p2 ? (_p2.uid || '') : '');
  // Preserva o nº de inscrição ORIGINAL de cada membro (enrollSeq persistido no solo).
  var _seq1 = (_p1 && typeof _p1 === 'object' && _p1.enrollSeq != null) ? _p1.enrollSeq : null;
  var _seq2 = (_p2 && typeof _p2 === 'object' && _p2.enrollSeq != null) ? _p2.enrollSeq : null;
  var newName = name1 + ' / ' + name2;
  var merged = cleanUndefined({
    displayName: newName, name: newName, uid: _u1 || _u2 || '',
    p1Name: name1, p1Uid: _u1, p2Name: name2, p2Uid: _u2,
    p1Seq: _seq1, p2Seq: _seq2, ligaActive: true
  });

  var maxI = Math.max(fi1, fi2), minI = Math.min(fi1, fi2);
  arr.splice(maxI, 1); arr.splice(minI, 1); arr.splice(minI, 0, merged);

  var teamOrigins = Object.assign({}, data.teamOrigins || {});
  teamOrigins[newName] = 'formada';

  var updateData = {
    participants: arr,
    teamOrigins: teamOrigins,
    memberUids: computeMemberUids(Object.assign({}, data, { participants: arr }))
  };
  // "muda a regra": formar dupla num torneio INDIVIDUAL passa a permitir times pra todos
  // (enrollmentMode→misto). Antes o cliente setava t.enrollmentMode direto (mutação local) —
  // agora vem pela CF via opts.changeRule pra o roster ser 100% server-authoritative.
  if (opts.changeRule) updateData.enrollmentMode = 'misto';
  // pairRequests só entra no update se o doc TEM a lista (senão dropRequestsInvolving devolve
  // undefined → Firestore rejeita "Cannot use undefined"). Bug pego no emulador.
  var _pr = dropRequestsInvolving(data.pairRequests, [_u1, _u2].filter(Boolean));
  if (Array.isArray(_pr)) updateData.pairRequests = _pr;
  Object.assign(updateData, markDuplasManualUpdate(data));

  return { outcome: 'formed', participants: arr, updateData: updateData, newName: newName, u1: _u1, u2: _u2 };
}

// Decide o DESFAZER da dupla. Espelha _splitDupla. Casa por [id1,id2] (uid|nome de cada
// membro) ou, se id2 vazio, pelo NOME do time. NÃO usa perfil vivo — o nome do membro vem
// do que está gravado (p1Name/p2Name; split de displayName só como fallback legado).
function computeSplitPair(data, opts) {
  var id1 = opts.id1, id2 = opts.id2;
  var arr = asParticipantsArray(data).slice();
  var idx;

  if (id2 != null && String(id2) !== '') {
    var want = [String(id1 || ''), String(id2 || '')].filter(Boolean).sort();
    idx = arr.findIndex(function (p) {
      if (!p || typeof p !== 'object') return false;
      if (!((p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name))) return false; // só dupla
      var got = [String(p.p1Uid || p.p1Name || ''), String(p.p2Uid || p.p2Name || '')].filter(Boolean).sort();
      return got.length === want.length && got.every(function (v, i) { return v === want[i]; });
    });
  } else {
    var teamName = id1;
    idx = arr.findIndex(function (p) {
      if (typeof p === 'string') return p === teamName;
      if (!p || typeof p !== 'object') return false;
      return (p.displayName || p.name || '') === teamName;
    });
  }
  if (idx === -1) return { outcome: 'notFound', participants: asParticipantsArray(data), updateData: null };

  var entry = arr[idx];
  var nm = entryName(entry);
  var parts = nm.split(' / ');
  var p1Name = (entry.p1Name || parts[0] || '').trim();
  var p2Name = (entry.p2Name || parts[1] || '').trim();
  if (!p1Name || !p2Name) return { outcome: 'notFound', participants: asParticipantsArray(data), updateData: null };
  var p1Uid = entry.p1Uid || '';
  var p2Uid = entry.p2Uid || '';

  var solo1 = p1Uid
    ? cleanUndefined({ displayName: p1Name, name: p1Name, uid: p1Uid, ligaActive: true, enrollSeq: (entry.p1Seq != null ? entry.p1Seq : undefined) })
    : p1Name;
  var solo2 = p2Uid
    ? cleanUndefined({ displayName: p2Name, name: p2Name, uid: p2Uid, ligaActive: true, enrollSeq: (entry.p2Seq != null ? entry.p2Seq : undefined) })
    : p2Name;

  arr.splice(idx, 1, solo1, solo2);

  return {
    outcome: 'split',
    participants: arr,
    updateData: { participants: arr, memberUids: computeMemberUids(Object.assign({}, data, { participants: arr })) },
    p1Name: p1Name, p2Name: p2Name, p1Uid: p1Uid, p2Uid: p2Uid
  };
}

module.exports = { computeFormPair, computeSplitPair, dropRequestsInvolving, markDuplasManualUpdate };
