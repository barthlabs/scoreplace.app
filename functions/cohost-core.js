'use strict';
/*
 * cohost-core.js — LÓGICA PURA de RESPONDER convite de co-organização / transferência.
 *
 * Espelha o que o cliente fazia em js/views/host-transfer.js (_acceptHostInvite /
 * _rejectHostInvite), agora no servidor.
 *
 * POR QUE existe (jul/2026) — DOIS problemas reais, achados via Sentry SCOREPLACE-WEB-6R:
 *
 * 1. ACEITAR CONVITE ESTAVA 100% QUEBRADO (permission-denied determinístico).
 *    O aceite marca o co-host como 'active'; isso faz o uid dele entrar em `adminUids`
 *    (computeAdminUids conta co-host ativo). Mas `mutateTournament` recomputa os
 *    denormalizados em TODO save (adminEmails/adminUids/memberUids/nextDrawAt), e a regra
 *    `isCoHostAcceptanceDiff` só permitia `hasOnly(['coHosts','adminEmails'])`. Como quem
 *    aceita AINDA NÃO é admin (é o ponto do convite), nenhuma outra cláusula cobria →
 *    Firestore recusava. Falhava sempre que o convite tinha uid (ou seja: todo convidado
 *    com conta). Rodando no Admin SDK, a regra deixa de ser o gate — a CF é.
 *
 * 2. TRANSFERÊNCIA ACEITAVA QUALQUER UM. O cliente fazia
 *    `if (inviteType === 'transfer' && ft.pendingTransfer)` sem conferir que quem aceita é
 *    o DESTINATÁRIO — qualquer participante virava organizador. Aqui exige
 *    `pendingTransfer.targetUid === callerUid`.
 *
 * IDENTIDADE = UID, SEMPRE (regra do dono, jul/2026: "apenas o uid para identificar os
 * participantes e co-hosts"). O casamento do convite é SÓ por uid — nunca por e-mail,
 * nome ou telefone. Convite legado sem uid devolve `notFound` (o organizador reenvia).
 * `adminEmails` continua sendo RECOMPUTADO (campo derivado que as regras ainda leem em
 * isTournamentAdmin), mas NUNCA é usado pra decidir identidade.
 *
 * REGRA: PURO — nada de firebase/admin/document. Só decide o que gravar a partir do doc.
 * Reusa computeMemberUids de enroll-core (mesmo cânone de identity/persist).
 */

const { computeMemberUids } = require('./enroll-core');

// Espelha window._computeAdminUids (js/views/persist-core.js) — creator + co-hosts ATIVOS.
function computeAdminUids(data) {
  if (!data) return [];
  if (data.isSandbox === true) {
    const own = {};
    [data.sandboxOwnerUid, data.creatorUid].forEach(function (u) {
      if (u && typeof u === 'string' && u.length >= 4) own[u] = true;
    });
    return Object.keys(own);
  }
  const set = {};
  const push = function (u) { if (u && typeof u === 'string' && u.length >= 4) set[u] = true; };
  push(data.creatorUid);
  if (Array.isArray(data.coHosts)) {
    data.coHosts.forEach(function (ch) { if (ch && ch.status === 'active') push(ch.uid); });
  }
  return Object.keys(set);
}

// Espelha window._computeAdminEmails — DERIVADO, só pra compat das regras. Nunca decide
// identidade (ver cabeçalho).
function computeAdminEmails(data) {
  if (!data) return [];
  const set = {};
  const push = function (e) {
    if (!e || typeof e !== 'string') return;
    const norm = e.trim().toLowerCase();
    if (norm) set[norm] = true;
  };
  if (data.isSandbox === true) { push(data.organizerEmail); return Object.keys(set); }
  push(data.creatorEmail);
  push(data.organizerEmail);
  if (Array.isArray(data.coHosts)) {
    data.coHosts.forEach(function (ch) { if (ch && ch.status === 'active') push(ch.email); });
  }
  return Object.keys(set);
}

function coHostsArray(data) {
  return Array.isArray(data && data.coHosts) ? data.coHosts : [];
}

// Índice do convite de co-host PENDENTE do uid. SÓ POR UID (cânone de identidade).
function pendingCoHostIndex(data, uid) {
  if (!uid) return -1;
  const list = coHostsArray(data);
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch && ch.status === 'pending' && ch.uid && ch.uid === uid) return i;
  }
  return -1;
}

// Denormalizados recomputados a partir do estado FINAL — os mesmos que mutateTournament
// recomputa no cliente. Ficam explícitos aqui pra o updateData ser completo e atômico.
function withDerived(next, updateData) {
  updateData.adminEmails = computeAdminEmails(next);
  updateData.adminUids = computeAdminUids(next);
  updateData.memberUids = computeMemberUids(next);
  return updateData;
}

/*
 * Responde um convite. Retorna sempre {outcome, updateData, ...} — nunca lança.
 *   inviteType: 'cohost' | 'transfer'
 *   action:     'accept' | 'reject'
 * outcome: 'applied' (gravar updateData) | 'notFound' (nada a fazer — convite inexistente
 *          pra este uid, ou já respondido; idempotente)
 */
function computeRespondHostInvite(data, callerUid, inviteType, action) {
  const nothing = { outcome: 'notFound', updateData: null, tournamentName: (data && data.name) || '' };
  if (!data || !callerUid) return nothing;
  if (action !== 'accept' && action !== 'reject') return nothing;

  const tournamentName = data.name || '';

  if (inviteType === 'transfer') {
    const pt = data.pendingTransfer;
    // SÓ o destinatário do convite responde — por uid (fecha a escalada do cliente).
    if (!pt || !pt.targetUid || pt.targetUid !== callerUid) return nothing;

    if (action === 'reject') {
      const next = Object.assign({}, data, { pendingTransfer: null });
      return {
        outcome: 'applied', inviteType: 'transfer', action: 'reject',
        tournamentName, fromUid: pt.fromUid || '',
        updateData: withDerived(next, { pendingTransfer: null })
      };
    }

    // ACEITE: o organizador atual vira co-host ativo; quem aceita assume a organização.
    // SÓ UID: a entrada do organizador que sai guarda o uid dele. Sem `email` — nada casa
    // co-host por e-mail. `displayName` fica como âncora pra quem não tem perfil; o choke
    // point de persistência do cliente o remove quando o perfil é resolvível.
    const coHosts = coHostsArray(data).slice();
    coHosts.push({
      uid: pt.fromUid || '', displayName: data.organizerName || '',
      status: 'active', type: 'cohost', invitedAt: new Date().toISOString()
    });
    const next = Object.assign({}, data, {
      coHosts: coHosts, pendingTransfer: null,
      creatorUid: callerUid, organizerEmail: '', organizerName: '', creatorEmail: ''
    });
    // organizerEmail/Name/creatorEmail são preenchidos pela CF (que tem o perfil do caller);
    // aqui só declaramos o uid, que é a identidade. Ver acceptHostInvite em index.js.
    return {
      outcome: 'applied', inviteType: 'transfer', action: 'accept',
      tournamentName, fromUid: pt.fromUid || '', newOrganizerUid: callerUid,
      updateData: withDerived(next, {
        coHosts: coHosts, pendingTransfer: null, creatorUid: callerUid
      })
    };
  }

  if (inviteType === 'cohost') {
    const idx = pendingCoHostIndex(data, callerUid);
    if (idx === -1) return nothing;
    const coHosts = coHostsArray(data).map(function (ch) { return Object.assign({}, ch); });

    if (action === 'reject') {
      coHosts.splice(idx, 1);
      const next = Object.assign({}, data, { coHosts: coHosts });
      return {
        outcome: 'applied', inviteType: 'cohost', action: 'reject',
        tournamentName, orgUid: data.creatorUid || '',
        updateData: withDerived(next, { coHosts: coHosts })
      };
    }

    coHosts[idx].status = 'active';
    coHosts[idx].acceptedAt = new Date().toISOString();
    const next = Object.assign({}, data, { coHosts: coHosts });
    return {
      outcome: 'applied', inviteType: 'cohost', action: 'accept',
      tournamentName, orgUid: data.creatorUid || '',
      updateData: withDerived(next, { coHosts: coHosts })
    };
  }

  return nothing;
}


// O alvo de convite precisa já constar no torneio. Isso mantém a superfície do comando
// estreita: o picker escolhe uma inscrição existente, e a Function nunca promove um UID
// arbitrário só porque ele foi enviado pelo navegador.
function tournamentHasMember(data, uid) {
  if (!data || !uid) return false;
  const wanted = String(uid);
  const members = Array.isArray(data.memberUids) ? data.memberUids.map(String) : [];
  if (members.indexOf(wanted) !== -1) return true;
  const roster = Array.isArray(data.participants) ? data.participants : Object.values(data.participants || {});
  return roster.some(function (p) {
    if (!p || typeof p !== 'object') return false;
    const ids = [p.uid, p.p1Uid, p.p2Uid]
      .concat(Array.isArray(p.participants) ? p.participants.map(function (x) { return x && x.uid; }) : [])
      .filter(Boolean).map(String);
    return ids.indexOf(wanted) !== -1;
  });
}

function participantDisplayName(data, uid) {
  const wanted = String(uid || '');
  const roster = Array.isArray(data && data.participants) ? data.participants : Object.values((data && data.participants) || {});
  for (const p of roster) {
    if (!p || typeof p !== 'object') continue;
    const ids = [p.uid, p.p1Uid, p.p2Uid].concat(Array.isArray(p.participants) ? p.participants.map(function (x) { return x && x.uid; }) : []).filter(Boolean).map(String);
    if (ids.indexOf(wanted) === -1) continue;
    if (p.uid && String(p.uid) === wanted) return String(p.displayName || p.name || '');
    const nested = (p.participants || []).find(function (x) { return x && String(x.uid || '') === wanted; });
    return String((nested && (nested.displayName || nested.name)) || p.p1Name || p.p2Name || p.displayName || p.name || '');
  }
  return '';
}

function _hostOutcome(data, action, inviteType, targetUid, targetName, updateData) {
  return {
    outcome: 'applied', action: action, inviteType: inviteType,
    targetUid: targetUid || '', targetName: targetName || '',
    tournamentName: (data && data.name) || '', updateData: updateData
  };
}

/*
 * Cria, cancela e remove convites de organização sobre o documento fresco.
 * `respondHostInvite` continua sendo a única porta para aceitar/recusar pelo destinatário.
 */
function computeMutateHostOrganization(data, callerUid, input) {
  const nothing = { outcome: 'notFound', updateData: null, tournamentName: (data && data.name) || '' };
  if (!data || !callerUid || !input) return nothing;
  const action = String(input.action || '');
  const inviteType = String(input.inviteType || '');
  const targetUid = String(input.targetUid || '');
  const targetName = participantDisplayName(data, targetUid);
  if ((inviteType !== 'cohost' && inviteType !== 'transfer') ||
      (action !== 'invite' && action !== 'cancel' && action !== 'remove')) return nothing;

  const coHosts = coHostsArray(data).map(function (ch) { return Object.assign({}, ch); });
  if (action === 'invite') {
    if (!targetUid || targetUid === callerUid || !tournamentHasMember(data, targetUid)) {
      return { outcome: 'invalidTarget', updateData: null, tournamentName: data.name || '' };
    }
    if (inviteType === 'transfer') {
      if (data.pendingTransfer && data.pendingTransfer.targetUid === targetUid) return nothing;
      const next = Object.assign({}, data, { pendingTransfer: {
        targetUid: targetUid, targetName: targetName, fromUid: callerUid, createdAt: new Date().toISOString()
      } });
      return _hostOutcome(data, action, inviteType, targetUid, targetName,
        withDerived(next, { pendingTransfer: next.pendingTransfer }));
    }
    if (coHosts.some(function (ch) { return ch && ch.uid === targetUid; })) return nothing;
    coHosts.push({ uid: targetUid, displayName: targetName, status: 'pending', type: 'cohost', invitedAt: new Date().toISOString() });
    const next = Object.assign({}, data, { coHosts: coHosts });
    return _hostOutcome(data, action, inviteType, targetUid, targetName, withDerived(next, { coHosts: coHosts }));
  }

  if (action === 'cancel') {
    if (inviteType === 'transfer') {
      const pending = data.pendingTransfer;
      if (!pending || (targetUid && pending.targetUid !== targetUid)) return nothing;
      const next = Object.assign({}, data, { pendingTransfer: null });
      return _hostOutcome(data, action, inviteType, pending.targetUid, pending.targetName,
        withDerived(next, { pendingTransfer: null }));
    }
    const idx = coHosts.findIndex(function (ch) { return ch && ch.status === 'pending' && ch.uid === targetUid; });
    if (idx < 0) return nothing;
    const removed = coHosts.splice(idx, 1)[0];
    const next = Object.assign({}, data, { coHosts: coHosts });
    return _hostOutcome(data, action, inviteType, removed.uid, removed.displayName,
      withDerived(next, { coHosts: coHosts }));
  }

  // Somente o criador pode remover um co-organizador ativo; co-organizador não revoga outro.
  if (data.creatorUid !== callerUid) return { outcome: 'forbidden', updateData: null, tournamentName: data.name || '' };
  const idx = coHosts.findIndex(function (ch) { return ch && ch.uid === targetUid && ch.status !== 'pending'; });
  if (idx < 0) return nothing;
  const removed = coHosts.splice(idx, 1)[0];
  const next = Object.assign({}, data, { coHosts: coHosts });
  return _hostOutcome(data, action, 'cohost', removed.uid, removed.displayName,
    withDerived(next, { coHosts: coHosts }));
}

module.exports = {
  computeAdminUids, computeAdminEmails, pendingCoHostIndex, computeRespondHostInvite,
  tournamentHasMember, participantDisplayName, computeMutateHostOrganization
};
