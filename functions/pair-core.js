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

// A entrada é uma DUPLA (estrutural — nunca por "/" no nome). Espelha _isPairEntry do
// cliente. Ver [[project_dupla_entry_structural_not_slash]].
function isPairEntry(p) {
  return !!(p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name));
}

// TODAS as identidades que uma entrada carrega: uid de cada slot, e o NOME só de quem não
// tem uid (fictício — é a única identidade dele). Usado pra provar que uma pessoa não está
// em NENHUMA outra entrada antes de formar dupla. [[project_uid_identity_canon_locked]]
function entryIdentities(p) {
  if (typeof p === 'string') return [String(p).trim()].filter(Boolean);
  if (!p || typeof p !== 'object') return [];
  var out = [];
  function add(v) { if (v && out.indexOf(String(v)) === -1) out.push(String(v)); }
  if (isPairEntry(p)) {
    add(p.p1Uid); add(p.p2Uid);
    if (!p.p1Uid) add(String(p.p1Name || '').trim());
    if (!p.p2Uid) add(String(p.p2Name || '').trim());
  } else {
    add(p.uid);
    if (!p.uid) add(String(entryName(p) || '').trim());
  }
  if (Array.isArray(p.participants)) p.participants.forEach(function (s) { if (s) add(s.uid); });
  return out;
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
/* ⛔ NINGUÉM PODE ESTAR SEM NÚMERO NA HORA DE ENTRAR NUMA DUPLA (2.1.41).
 * MEDIDO no torneio do dono: o "Jogador 01" voltou da dupla SEM `enrollSeq`, enquanto o
 * "Jogador 02" voltou com o dele. O desfazer estava certo — ele devolve `entry.p1Seq`. O
 * que faltava era o número EXISTIR: `p1Seq` foi gravado `null` porque o inscrito não tinha
 * `enrollSeq` no banco quando a dupla se formou.
 * ⭐ POR QUE ALGUÉM FICA SEM NÚMERO: `_ensureEnrollSeqs` (cliente) atribui os números no
 * RENDER e muta o objeto em memória — se nada gravar depois, o banco segue sem eles. O
 * número parecia existir na tela e não existia no dado. [[project_enroll_number_chronological_no_gaps]]
 * ⇒ Aqui, no ÚNICO escritor, o backfill acontece ANTES de qualquer dupla se formar, e é
 * gravado junto. Mesma regra do cliente: quem não tem entra no FIM (`max+1`), nunca num
 * vago — senão um inscrito tardio pega número baixo e passa na frente de quem chegou antes. */
function backfillEnrollSeqs(arr) {
  var max = 0, mexeu = false;
  arr.forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    [p.enrollSeq, p.p1Seq, p.p2Seq].forEach(function (s) {
      if (s != null && !isNaN(s) && Number(s) > max) max = Number(s);
    });
  });
  arr.forEach(function (p, i) {
    if (!p || typeof p !== 'object') {
      /* string legada: vira objeto pra PODER ter número. String não guarda campo — foi
       * exatamente assim que o nº se perdeu e que dois inscritos colidiram na mesma chave
       * da subcoleção. */
      var nm = String(p || '').trim();
      if (!nm) return;
      arr[i] = { name: nm, displayName: nm, enrollSeq: ++max };
      mexeu = true;
      return;
    }
    if (isPairEntry(p)) {
      if (p.p1Seq == null) { p.p1Seq = ++max; mexeu = true; }
      if (p.p2Seq == null) { p.p2Seq = ++max; mexeu = true; }
    } else if (p.enrollSeq == null) { p.enrollSeq = ++max; mexeu = true; }
  });
  return mexeu;
}

function computeFormPair(data, opts) {
  var uid1 = opts.uid1 || '', name1 = opts.name1 || '';
  var uid2 = opts.uid2 || '', name2 = opts.name2 || '';
  var arr = asParticipantsArray(data).slice();
  var _backfilled = backfillEnrollSeqs(arr);

  // ⚠️ SÓ ENTRADA SOLO PODE VIRAR DUPLA (v1.5.8 — a "mistura" do Torneio de Casais).
  // O findIndex antigo era `p.uid === uid1` SEM checar se a entrada é dupla. Numa dupla o
  // `uid` de topo é o do p1 → formar dupla com quem já era p1 CONSUMIA a entrada inteira
  // (splice) e o parceiro dele SUMIA do roster; e quem era p2 não era achado por lugar
  // nenhum, então acabava pareado de novo → a MESMA pessoa em DUAS duplas (visto ao vivo:
  // Lucia em "Fernando/Lucia" e em "Lucia/Patrícia"; Patrícia em "Nei/Patrícia" e na mesma).
  // Agora: (a) só casa SOLO; (b) se qualquer um dos dois já está em ALGUMA dupla, aborta.
  var idA = uid1 || String(name1 || '').trim();
  var idB = uid2 || String(name2 || '').trim();
  var pairedIds = {};
  arr.forEach(function (p) {
    if (!isPairEntry(p)) return;
    entryIdentities(p).forEach(function (k) { pairedIds[k] = true; });
  });
  if (pairedIds[idA] || pairedIds[idB]) {
    return {
      outcome: 'alreadyPaired',
      who: pairedIds[idA] ? (name1 || idA) : (name2 || idB),
      participants: arr,
      /* o backfill é conserto de dado e vai mesmo quando a dupla NÃO se forma — senão o
       * roster fica sem número até alguém acertar de formar uma dupla que dê certo. */
      updateData: _backfilled ? { participants: arr } : null
    };
  }

  var fi1 = arr.findIndex(function (p) {
    if (isPairEntry(p)) return false;
    return uid1 ? (typeof p === 'object' && p && p.uid === uid1) : (entryName(p) === name1);
  });
  var fi2 = arr.findIndex(function (p) {
    if (isPairEntry(p)) return false;
    return uid2 ? (typeof p === 'object' && p && p.uid === uid2) : (entryName(p) === name2);
  });
  if (fi1 === -1 || fi2 === -1 || fi1 === fi2) {
    return { outcome: 'notFound', participants: arr, updateData: _backfilled ? { participants: arr } : null };
  }

  var _p1 = arr[fi1], _p2 = arr[fi2];
  var _u1 = uid1 || (typeof _p1 === 'object' && _p1 ? (_p1.uid || '') : '');
  var _u2 = uid2 || (typeof _p2 === 'object' && _p2 ? (_p2.uid || '') : '');
  // Preserva o nº de inscrição ORIGINAL de cada membro (enrollSeq persistido no solo).
  var _seq1 = (_p1 && typeof _p1 === 'object' && _p1.enrollSeq != null) ? _p1.enrollSeq : null;
  var _seq2 = (_p2 && typeof _p2 === 'object' && _p2.enrollSeq != null) ? _p2.enrollSeq : null;
  /* 2.1.41: e o "é uma VAGA" de cada membro. Sem isto o desfazer não tem como devolver o
   * inscrito como ele entrou — e o card volta como pessoa comum onde era placeholder. */
  var _ph1 = (_p1 && typeof _p1 === 'object' && _p1.isPlaceholder) ? true : undefined;
  var _ph2 = (_p2 && typeof _p2 === 'object' && _p2.isPlaceholder) ? true : undefined;
  var newName = name1 + ' / ' + name2;
  var merged = cleanUndefined({
    displayName: newName, name: newName, uid: _u1 || _u2 || '',
    p1Name: name1, p1Uid: _u1, p2Name: name2, p2Uid: _u2,
    p1Seq: _seq1, p2Seq: _seq2,
    p1Placeholder: _ph1, p2Placeholder: _ph2, ligaActive: true
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
  var parts = nm.indexOf(' / ') !== -1 ? nm.split(' / ') : [];
  var p1Uid = entry.p1Uid || '';
  var p2Uid = entry.p2Uid || '';
  var p1Name = (entry.p1Name || parts[0] || '').trim();
  var p2Name = (entry.p2Name || parts[1] || '').trim();
  // IDENTIDADE = uid; o NOME só identifica o fictício (sem conta). Exigir os dois nomes aqui
  // (como era) fazia TODA dupla com conta cair em notFound — porque o storage é SÓ-UID
  // (identity-core._stripStoredNamesForUidEntries: "nome com uid nunca é gravado"). Sintoma no
  // dono: toast "Dupla desfeita" e NADA acontecia, quantas vezes clicasse. [[project_uid_identity_canon_locked]]
  if (!(p1Uid || p1Name) || !(p2Uid || p2Name)) {
    return { outcome: 'notFound', participants: asParticipantsArray(data), updateData: null };
  }

  // O solo herda o que era POR MEMBRO na dupla (nº de inscrição, contato, categoria). O nome só
  // entra se EXISTIA gravado (entrada só-uid continua só-uid — o nome vem do perfil na leitura).
  // Fictício (sem uid) continua sendo a string do nome, como antes.
  // CAMPO DE PERFIL NÃO ATRAVESSA: email/photoURL/gender/birthDate saíram daqui.
  // Copiá-los propagava pro solo a cópia que já estava suja na dupla — o desfazer
  // é justamente a hora de parar de carregar isso adiante. O que o solo herda é o
  // que é DO TORNEIO (nº de inscrição, categoria) e o nome, que só identifica quem
  // não tem perfil. Mesma regra do pairPartnerSolo (enroll-core.js).
  /* ⛔ 2.1.41 — `if (!uid) return name` DEVOLVIA UMA STRING, e a string não guarda campo
   * nenhum: o nº de inscrição do membro morria ali. Ordem do dono, textual: _"quando forma
   * dupla o número de inscrição de cada membro é mantido. ao dissolver a dupla fica muito
   * fácil de manter os números de inscrição original de cada um"_. Ele está certo — o
   * número JÁ vinha guardado em p1Seq/p2Seq; só não tinha onde pousar na volta.
   * ⭐ MEDIDO no torneio de teste dele: participants[0] e [7] eram as strings "Jogador 02"
   * e "Jogador 01", sem enrollSeq, enquanto os outros seis eram objetos com 1..6. Por isso
   * `_buildEnrollOrderMap` mandava os dois pro FIM da fila (7 e 8) — o embaralhamento do
   * print. E a string ainda colidia na chave `x` da subcoleção (ver tournament-split-core).
   * ⛔ O que NÃO atravessa segue não atravessando: email/foto/gênero/nascimento continuam
   * fora. O solo herda o que é DO TORNEIO — número, categoria — e o nome. */
  var solo = function (uid, name, seq, isPh) {
    return cleanUndefined({
      uid: (uid || undefined), ligaActive: true,
      displayName: (name || undefined), name: (name || undefined),
      enrollSeq: (seq != null ? seq : undefined),
      isPlaceholder: (isPh ? true : undefined),
      category: entry.category, categories: entry.categories,
      categorySource: entry.categorySource
    });
  };
  var solo1 = solo(p1Uid, p1Name, entry.p1Seq, entry.p1Placeholder);
  var solo2 = solo(p2Uid, p2Name, entry.p2Seq, entry.p2Placeholder);

  arr.splice(idx, 1, solo1, solo2);

  /* ⛔ 2.1.41 — O RASTRO DA DUPLA DESFEITA FICAVA NO `teamOrigins`. Medido no torneio do
   * dono: a dupla tinha sido desfeita e `teamOrigins` ainda dizia
   * `"Jogador 01 / Jogador 02": "formada"`. Registro de uma dupla que não existe mais é
   * mentira guardada — e este mapa é chaveado por NOME, então ele ainda casa com qualquer
   * dupla futura de mesmo nome e a marca como "formada" sem que ninguém tenha formado.
   * O desfazer é a hora de apagar: quem escreveu a marca (computeFormPair) tem que ter a
   * ponta que a remove. */
  var _to = Object.assign({}, data.teamOrigins || {});
  var _mexeuTO = false;
  [nm, p1Name + ' / ' + p2Name, p2Name + ' / ' + p1Name].forEach(function (k) {
    if (k && Object.prototype.hasOwnProperty.call(_to, k)) { delete _to[k]; _mexeuTO = true; }
  });

  var _upd = { participants: arr, memberUids: computeMemberUids(Object.assign({}, data, { participants: arr })) };
  if (_mexeuTO) _upd.teamOrigins = _to;

  return {
    outcome: 'split',
    participants: arr,
    updateData: _upd,
    p1Name: p1Name, p2Name: p2Name, p1Uid: p1Uid, p2Uid: p2Uid
  };
}

// Auditoria do roster: devolve as pessoas (uid ou nome de fictício) que aparecem em MAIS de
// uma entrada — o estado impossível que a v1.5.8 passou a bloquear na formação. Usado pelo
// teste e por script de reparo; não muta nada.
function findDuplicatePeople(data) {
  var count = {}, out = [];
  asParticipantsArray(data).forEach(function (p) {
    entryIdentities(p).forEach(function (k) { count[k] = (count[k] || 0) + 1; });
  });
  Object.keys(count).forEach(function (k) { if (count[k] > 1) out.push({ id: k, times: count[k] }); });
  return out;
}

module.exports = {
  computeFormPair, backfillEnrollSeqs, computeSplitPair, dropRequestsInvolving, markDuplasManualUpdate,
  isPairEntry, entryIdentities, findDuplicatePeople
};
