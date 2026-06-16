/* team-formation.js — formação manual de duplas (LÓGICA PURA, testável headless)
 *
 * Cobre os dois caminhos de "duplas montadas na mão" (só vale teamSize >= 2):
 *  • Organizador: pareia 2 inscritos → dupla CONFIRMADA na hora; pode desmontar.
 *  • Participante (quando t.manualPairing === 'open'): pede pra parear → fica
 *    PENDENTE (visível a todos em t.pairRequests) até o alvo aceitar.
 *
 * Regras travadas (decididas com o dono):
 *  - Uma pessoa só pode estar em UMA dupla confirmada (trava após confirmar).
 *  - Quem inicia tem no máx. 1 convite de saída por vez.
 *  - Quem recebe pode ter vários convites entrando; aceitar um cancela os outros
 *    (dos dois membros).
 *  - Organizador pode desmontar dupla confirmada (volta os 2 a individuais).
 *
 * Estado no torneio:
 *  - t.participants[]  : indivíduos + objetos-dupla (mesmo shape de _formDoublesTeams)
 *  - t.teamOrigins{}   : { "A / B": "formada" }  (vs "sorteada")
 *  - t.pairRequests[]  : { id, inviterUid, inviterName, inviteeUid, inviteeName, createdAt }
 *
 * memberUids é recomputado no saveTournament (firebase-db) — não mexemos aqui.
 * Estas funções MUTAM o objeto t passado e devolvem { ok, ... } / { ok:false, error }.
 */
(function () {
  'use strict';

  function _name(p) { return (p && (p.displayName || p.name)) || ''; }

  // p é uma dupla (não um indivíduo)?
  function isTeam(p) {
    if (!p) return false;
    if (p.p2Uid || p.p2Name) return true;
    if (Array.isArray(p.participants) && p.participants.length > 1) return true;
    var nm = _name(p);
    return typeof nm === 'string' && /\s\/\s/.test(nm);
  }

  // uids de uma pessoa/dupla (p/ checar pertencimento). Indivíduo → [uid].
  function uidsOf(p) {
    if (!p) return [];
    var out = [];
    if (p.uid) out.push(p.uid);
    if (p.p1Uid) out.push(p.p1Uid);
    if (p.p2Uid) out.push(p.p2Uid);
    (p.participants || []).forEach(function (m) { if (m && m.uid) out.push(m.uid); });
    return out.filter(function (v, i) { return out.indexOf(v) === i; });
  }

  // Índice do INDIVÍDUO (não-dupla) com esse uid em t.participants; -1 se não achar.
  function _indexOfIndividual(t, uid) {
    var parts = t.participants || [];
    for (var i = 0; i < parts.length; i++) {
      if (!isTeam(parts[i]) && parts[i] && parts[i].uid && parts[i].uid === uid) return i;
    }
    return -1;
  }

  // uid já está numa dupla confirmada?
  function isInAnyTeam(t, uid) {
    return (t.participants || []).some(function (p) { return isTeam(p) && uidsOf(p).indexOf(uid) !== -1; });
  }

  // Monta o objeto-dupla canônico (mesmo shape de _formDoublesTeams.mkTeamObj).
  function makeTeamObj(a, b) {
    var n1 = _name(a), n2 = _name(b);
    var team = {
      displayName: n1 + ' / ' + n2, name: n1 + ' / ' + n2,
      p1Name: n1, p2Name: n2,
      participants: [a, b], fixedPair: true
    };
    if (a.uid) team.p1Uid = a.uid;
    if (a.email) team.p1Email = a.email;
    if (a.photoURL || a.photo) team.p1Photo = a.photoURL || a.photo;
    if (b.uid) team.p2Uid = b.uid;
    if (b.email) team.p2Email = b.email;
    if (b.photoURL || b.photo) team.p2Photo = b.photoURL || b.photo;
    return team;
  }

  // Remove de t.pairRequests qualquer convite que envolva algum destes uids.
  function _dropRequestsInvolving(t, uids) {
    if (!Array.isArray(t.pairRequests)) return;
    t.pairRequests = t.pairRequests.filter(function (r) {
      return uids.indexOf(r.inviterUid) === -1 && uids.indexOf(r.inviteeUid) === -1;
    });
  }

  // ── Organizador: parear 2 indivíduos → dupla confirmada ────────────────────
  function formTeam(t, uidA, uidB) {
    if (!t || (t.teamSize || 1) < 2) return { ok: false, error: 'nao-duplas' };
    if (!uidA || !uidB || uidA === uidB) return { ok: false, error: 'mesma-pessoa' };
    if (isInAnyTeam(t, uidA) || isInAnyTeam(t, uidB)) return { ok: false, error: 'ja-em-dupla' };
    var iA = _indexOfIndividual(t, uidA), iB = _indexOfIndividual(t, uidB);
    if (iA === -1 || iB === -1) return { ok: false, error: 'inscrito-nao-encontrado' };
    var a = t.participants[iA], b = t.participants[iB];
    var team = makeTeamObj(a, b);
    // remove os 2 indivíduos (índice maior primeiro) e adiciona a dupla
    var hi = Math.max(iA, iB), lo = Math.min(iA, iB);
    t.participants.splice(hi, 1);
    t.participants.splice(lo, 1);
    t.participants.push(team);
    if (!t.teamOrigins) t.teamOrigins = {};
    t.teamOrigins[team.name] = 'formada';
    _dropRequestsInvolving(t, [uidA, uidB]); // limpa convites pendentes dos dois
    return { ok: true, team: team };
  }

  // ── Organizador: desmontar dupla → volta os 2 a individuais ────────────────
  function dismantleTeam(t, teamName) {
    var parts = t.participants || [];
    var idx = -1;
    for (var i = 0; i < parts.length; i++) {
      if (isTeam(parts[i]) && _name(parts[i]) === teamName) { idx = i; break; }
    }
    if (idx === -1) return { ok: false, error: 'dupla-nao-encontrada' };
    var team = parts[idx];
    var members;
    if (Array.isArray(team.participants) && team.participants.length > 1) {
      members = team.participants.slice();
    } else {
      // reconstrói dos campos p{N}
      members = [];
      var m1 = { name: team.p1Name }; if (team.p1Uid) m1.uid = team.p1Uid; if (team.p1Email) m1.email = team.p1Email; if (team.p1Photo) m1.photoURL = team.p1Photo;
      var m2 = { name: team.p2Name }; if (team.p2Uid) m2.uid = team.p2Uid; if (team.p2Email) m2.email = team.p2Email; if (team.p2Photo) m2.photoURL = team.p2Photo;
      if (team.p1Name) members.push(m1);
      if (team.p2Name) members.push(m2);
    }
    parts.splice(idx, 1);
    members.forEach(function (m) { parts.push(m); });
    if (t.teamOrigins) delete t.teamOrigins[teamName];
    return { ok: true, members: members };
  }

  // ── Participante: pedir pra parear (cria pendência) ────────────────────────
  // opts.now (number) injetável p/ teste. Se já houver convite recíproco
  // (inviteeUid já convidou inviterUid), CONFIRMA a dupla direto.
  function requestPair(t, inviterUid, inviteeUid, inviterName, inviteeName, opts) {
    opts = opts || {};
    if (!t || (t.teamSize || 1) < 2) return { ok: false, error: 'nao-duplas' };
    if (t.manualPairing !== 'open') return { ok: false, error: 'participante-sem-permissao' };
    if (!inviterUid || !inviteeUid || inviterUid === inviteeUid) return { ok: false, error: 'mesma-pessoa' };
    if (isInAnyTeam(t, inviterUid)) return { ok: false, error: 'voce-ja-em-dupla' };
    if (isInAnyTeam(t, inviteeUid)) return { ok: false, error: 'alvo-ja-em-dupla' };
    if (_indexOfIndividual(t, inviterUid) === -1 || _indexOfIndividual(t, inviteeUid) === -1) return { ok: false, error: 'inscrito-nao-encontrado' };
    if (!Array.isArray(t.pairRequests)) t.pairRequests = [];

    // convite recíproco já existe? → confirma direto
    var reciprocal = t.pairRequests.filter(function (r) { return r.inviterUid === inviteeUid && r.inviteeUid === inviterUid; })[0];
    if (reciprocal) {
      // confirma na ordem do convite ORIGINAL (1º proponente = p1)
      var formed = formTeam(t, reciprocal.inviterUid, reciprocal.inviteeUid);
      if (formed.ok) return { ok: true, confirmed: true, team: formed.team };
      return formed;
    }
    // 1 convite de saída por vez
    if (t.pairRequests.some(function (r) { return r.inviterUid === inviterUid; })) {
      return { ok: false, error: 'ja-tem-convite-pendente' };
    }
    // não duplicar o mesmo convite
    if (t.pairRequests.some(function (r) { return r.inviterUid === inviterUid && r.inviteeUid === inviteeUid; })) {
      return { ok: false, error: 'convite-ja-enviado' };
    }
    var req = {
      id: inviterUid + '__' + inviteeUid,
      inviterUid: inviterUid, inviterName: inviterName || '',
      inviteeUid: inviteeUid, inviteeName: inviteeName || '',
      createdAt: opts.now || (typeof Date !== 'undefined' && Date.now ? Date.now() : 0)
    };
    t.pairRequests.push(req);
    return { ok: true, confirmed: false, request: req };
  }

  // ── Participante: aceitar convite → confirma dupla + cancela os outros ─────
  function acceptPair(t, requestId, accepterUid) {
    var reqs = t.pairRequests || [];
    var req = reqs.filter(function (r) { return r.id === requestId; })[0];
    if (!req) return { ok: false, error: 'convite-nao-encontrado' };
    if (accepterUid && req.inviteeUid !== accepterUid) return { ok: false, error: 'nao-e-o-convidado' };
    var formed = formTeam(t, req.inviterUid, req.inviteeUid); // já limpa convites dos 2
    return formed;
  }

  // ── Recusar / cancelar convite (alvo recusa OU quem enviou cancela) ────────
  function cancelPair(t, requestId, byUid) {
    var reqs = t.pairRequests || [];
    var req = reqs.filter(function (r) { return r.id === requestId; })[0];
    if (!req) return { ok: false, error: 'convite-nao-encontrado' };
    if (byUid && req.inviterUid !== byUid && req.inviteeUid !== byUid) return { ok: false, error: 'sem-permissao' };
    t.pairRequests = reqs.filter(function (r) { return r.id !== requestId; });
    return { ok: true, request: req };
  }

  var api = {
    isTeam: isTeam, uidsOf: uidsOf, isInAnyTeam: isInAnyTeam, makeTeamObj: makeTeamObj,
    formTeam: formTeam, dismantleTeam: dismantleTeam,
    requestPair: requestPair, acceptPair: acceptPair, cancelPair: cancelPair
  };

  if (typeof window !== 'undefined') {
    window._teamFormation = api;
    window._tfFormTeam = formTeam;
    window._tfDismantleTeam = dismantleTeam;
    window._tfRequestPair = requestPair;
    window._tfAcceptPair = acceptPair;
    window._tfCancelPair = cancelPair;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
