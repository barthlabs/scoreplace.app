/* team-formation.js — máquina de PENDÊNCIA de duplas (LÓGICA PURA, testável)
 *
 * A formação real da dupla (mutar t.participants) JÁ EXISTE e é canônica em
 * tournaments.js: `window._formDuplaByUids` (extraído de _doFormDupla) e
 * `window._splitDupla`. Este módulo NÃO forma nem desmonta — só decide o fluxo
 * de convites pendentes (participante → pendente → aceite) e valida as regras.
 *
 * Caminhos:
 *  • Organizador solta A→B  → tournaments.js chama _formDuplaByUids direto (na hora).
 *  • Participante solta o PRÓPRIO card sobre outro, com t.manualPairing==='open'
 *    → requestPair() registra t.pairRequests[]; quando o alvo aceita, acceptPair()
 *    devolve {action:'confirm', inviterUid, inviteeUid} e tournaments.js forma.
 *
 * Regras (decididas com o dono): 1 pessoa = 1 dupla confirmada; iniciante tem máx
 * 1 convite de saída; alvo pode ter vários entrando, aceitar 1 cancela os outros
 * dos 2; convite recíproco confirma direto (ordem do 1º proponente = p1).
 *
 * t.pairRequests[] = { id:'inviterUid__inviteeUid', inviterUid, inviterName,
 *                      inviteeUid, inviteeName, createdAt }
 *
 * Funções devolvem { ok, action?, ... } / { ok:false, error }. requestPair muta
 * SÓ t.pairRequests (nunca t.participants). isInAnyTeam lê t.participants.
 */
(function () {
  'use strict';

  function _name(p) { return (p && (p.displayName || p.name)) || ''; }

  function isTeam(p) {
    if (!p) return false;
    if (p.p2Uid || p.p2Name) return true;
    if (Array.isArray(p.participants) && p.participants.length > 1) return true;
    var nm = _name(p);
    return typeof nm === 'string' && /\s\/\s/.test(nm);
  }

  function uidsOf(p) {
    if (!p) return [];
    var out = [];
    if (p.uid) out.push(p.uid);
    if (p.p1Uid) out.push(p.p1Uid);
    if (p.p2Uid) out.push(p.p2Uid);
    (p.participants || []).forEach(function (m) { if (m && m.uid) out.push(m.uid); });
    return out.filter(function (v, i) { return out.indexOf(v) === i; });
  }

  function isInAnyTeam(t, uid) {
    return (t.participants || []).some(function (p) { return isTeam(p) && uidsOf(p).indexOf(uid) !== -1; });
  }

  function _isIndividual(t, uid) {
    return (t.participants || []).some(function (p) { return !isTeam(p) && p && p.uid === uid; });
  }

  // Remove de t.pairRequests qualquer convite que envolva algum destes uids.
  function dropRequestsInvolving(t, uids) {
    if (!Array.isArray(t.pairRequests)) return;
    t.pairRequests = t.pairRequests.filter(function (r) {
      return uids.indexOf(r.inviterUid) === -1 && uids.indexOf(r.inviteeUid) === -1;
    });
  }

  // Participante propõe parear. NÃO forma — devolve a decisão:
  //  {ok, action:'pending', request}  → convite registrado, aguarda aceite.
  //  {ok, action:'confirm', inviterUid, inviteeUid} → recíproco; caller deve formar.
  function requestPair(t, inviterUid, inviteeUid, inviterName, inviteeName, opts) {
    opts = opts || {};
    if (!t || (t.teamSize || 1) < 2) return { ok: false, error: 'nao-duplas' };
    if (t.manualPairing !== 'open') return { ok: false, error: 'participante-sem-permissao' };
    if (!inviterUid || !inviteeUid || inviterUid === inviteeUid) return { ok: false, error: 'mesma-pessoa' };
    if (isInAnyTeam(t, inviterUid)) return { ok: false, error: 'voce-ja-em-dupla' };
    if (isInAnyTeam(t, inviteeUid)) return { ok: false, error: 'alvo-ja-em-dupla' };
    if (!_isIndividual(t, inviterUid) || !_isIndividual(t, inviteeUid)) return { ok: false, error: 'inscrito-nao-encontrado' };
    if (!Array.isArray(t.pairRequests)) t.pairRequests = [];

    // recíproco já existe (alvo já tinha convidado o iniciante) → confirma direto
    var reciprocalIdx = -1;
    for (var i = 0; i < t.pairRequests.length; i++) {
      var rr = t.pairRequests[i];
      if (rr.inviterUid === inviteeUid && rr.inviteeUid === inviterUid) { reciprocalIdx = i; break; }
    }
    if (reciprocalIdx !== -1) {
      var orig = t.pairRequests[reciprocalIdx];
      dropRequestsInvolving(t, [inviterUid, inviteeUid]);
      return { ok: true, action: 'confirm', inviterUid: orig.inviterUid, inviteeUid: orig.inviteeUid };
    }
    if (t.pairRequests.some(function (r) { return r.inviterUid === inviterUid; })) return { ok: false, error: 'ja-tem-convite-pendente' };
    if (t.pairRequests.some(function (r) { return r.inviterUid === inviterUid && r.inviteeUid === inviteeUid; })) return { ok: false, error: 'convite-ja-enviado' };

    var req = {
      id: inviterUid + '__' + inviteeUid,
      inviterUid: inviterUid, inviterName: inviterName || '',
      inviteeUid: inviteeUid, inviteeName: inviteeName || '',
      createdAt: opts.now || (typeof Date !== 'undefined' && Date.now ? Date.now() : 0)
    };
    t.pairRequests.push(req);
    return { ok: true, action: 'pending', request: req };
  }

  // Alvo aceita. NÃO forma — devolve {action:'confirm', inviterUid, inviteeUid} e
  // remove TODOS os convites que envolvem os 2 (aceitar 1 cancela os outros).
  function acceptPair(t, requestId, accepterUid) {
    var reqs = t.pairRequests || [];
    var req = reqs.filter(function (r) { return r.id === requestId; })[0];
    if (!req) return { ok: false, error: 'convite-nao-encontrado' };
    if (accepterUid && req.inviteeUid !== accepterUid) return { ok: false, error: 'nao-e-o-convidado' };
    if (isInAnyTeam(t, req.inviterUid)) return { ok: false, error: 'iniciante-ja-em-dupla' };
    if (isInAnyTeam(t, req.inviteeUid)) return { ok: false, error: 'voce-ja-em-dupla' };
    dropRequestsInvolving(t, [req.inviterUid, req.inviteeUid]);
    return { ok: true, action: 'confirm', inviterUid: req.inviterUid, inviteeUid: req.inviteeUid, inviterName: req.inviterName, inviteeName: req.inviteeName };
  }

  // Recusar (alvo) ou cancelar (iniciante).
  function cancelPair(t, requestId, byUid) {
    var reqs = t.pairRequests || [];
    var req = reqs.filter(function (r) { return r.id === requestId; })[0];
    if (!req) return { ok: false, error: 'convite-nao-encontrado' };
    if (byUid && req.inviterUid !== byUid && req.inviteeUid !== byUid) return { ok: false, error: 'sem-permissao' };
    t.pairRequests = reqs.filter(function (r) { return r.id !== requestId; });
    return { ok: true, request: req };
  }

  var api = {
    isTeam: isTeam, uidsOf: uidsOf, isInAnyTeam: isInAnyTeam,
    dropRequestsInvolving: dropRequestsInvolving,
    requestPair: requestPair, acceptPair: acceptPair, cancelPair: cancelPair
  };

  if (typeof window !== 'undefined') {
    window._teamFormation = api;
    window._tfRequestPair = requestPair;
    window._tfAcceptPair = acceptPair;
    window._tfCancelPair = cancelPair;
    window._tfDropRequestsInvolving = dropRequestsInvolving;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
