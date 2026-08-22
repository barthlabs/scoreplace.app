/* waitlist-core.js — CÂNONE DA LISTA DE ESPERA (extraído do store.js em jul/2026)
 *
 * A espera vive em TRÊS storages (t.waitlist + t.standbyParticipants + t.monarchWaitlist
 * por categoria). Quem lê tem que ler os três (_getWaitlist); quem tira alguém de lá tem
 * que tirar dos três (_removeFromWaitlist) — senão um vira resíduo e o painel mostra
 * gente fantasma.
 *
 * POR QUE VIVE NUM ARQUIVO PRÓPRIO (e não mais dentro do store.js) — mesmo motivo do
 * identity-core.js: a INTEGRAÇÃO TARDIA foi canonizada na Cloud Function
 * (integrateLateEntries), que roda o motor vendored. O motor chama
 * `window._removeFromWaitlist` ao formar um grupo Rei/Rainha a partir da espera
 * (bracket-logic.js, _tryFormMonarchWaitlistGroups) — mas o store.js NÃO carrega no
 * servidor (toca document no load). A chamada é protegida por `typeof === 'function'`,
 * então no servidor ela FALHAVA EM SILÊNCIO: os tardios entravam no grupo, jogavam e
 * classificavam, mas os nomes NUNCA saíam de standbyParticipants — ficavam na Lista de
 * Espera pra sempre, inclusive depois de avançar de fase (bug real, Confra jul/2026:
 * 8 placeholders jogaram a classificatória e continuaram na espera).
 * Espelhar no shim da CF criaria uma 2ª versão do código (o bug de versão que a
 * canonização quer matar). Extraído. Uma versão só, zero drift.
 *
 * REGRA: este arquivo é PURO — nada de document/AppStore/localStorage/firebase. Única dep
 * externa tolerada: window._pName (store.js no cliente, shim no servidor), sempre atrás de
 * `typeof`/truthy check.
 *
 * Carregado ANTES do store.js (index.html) e por tests.html / tests/headless.js /
 * functions-autodraw (vendor/, via copy-vendor no predeploy). Nada aqui roda no load.
 */

// Nome exibível de uma entrada (string OU objeto), sem depender do store.js.
function _wlName(e) {
  if (typeof window._pName === 'function') {
    var f = String(window._pName(e, '') || '').trim();
    if (f) return f;
  }
  if (typeof e === 'string') return e.trim();
  return String((e && (e.displayName || e.name || e.email)) || '').trim();
}

// LISTA DE ESPERA CANÔNICA: une os 3 storages, deduplicado por nome (lowercase).
// Entrada objeto volta como está; string vira {name, displayName}.
// ⚠️ O DEDUP É POR IDENTIDADE, NUNCA POR NOME (v1.7.61). Desde que `monarchWaitlist`
// passou a guardar UID, deduplicar por nome fazia a MESMA pessoa entrar duas vezes: uma
// pela entrada de `standbyParticipants` (nome resolvido do perfil) e outra pelo uid do
// mapa, que virava um "nome" que não é de ninguém. Foi exatamente isso que pintou os
// chips crus `tqlM4F93…` na Lista de espera — 6 pessoas onde havia 3.
//
// Item em texto no mapa pode ser uid (novo) ou nome (legado). Os dois resolvem para a
// ENTRADA real da espera; o que não resolve para ninguém é descartado, porque a fila é um
// índice — quem está nela tem que estar em `waitlist`/`standbyParticipants`. Só sobrevive
// como texto o nome de quem NÃO TEM CONTA, que é a ressalva do dono: ali o nome é a única
// identidade que existe.
window._getWaitlist = function (t) {
  if (!t) return [];
  var out = [], seen = {};
  function push(e, key) {
    if (!key || seen[key]) return;
    seen[key] = 1;
    out.push(e);
  }
  function addEntry(e) {
    if (!e) return;
    if (typeof e === 'string') return addText(e);
    push(e, window._wlKey(e));
  }
  function addText(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return;
    // uid OU nome legado → a entrada real da espera (que já foi adicionada acima)
    var ent = window._wlEntryByKey(t, s);
    if (ent) return push(ent, window._wlKey(ent));
    // nome de alguém COM conta que não está mais na espera: é resíduo do índice
    if (typeof window._memberUidByName === 'function' && window._memberUidByName(t, s)) return;
    // uid que não corresponde a ninguém da espera: resíduo do índice
    if (_pareceUid(t, s)) return;
    // sobrou: nome de quem não tem conta — o informal digitado à mão
    push({ name: s, displayName: s }, s);
  }
  // É uid de alguém do torneio? (evita tratar um uid órfão como se fosse nome de gente)
  function _pareceUid(t2, s) {
    var pools = [t2.participants, t2.standbyParticipants, t2.waitlist];
    for (var i = 0; i < pools.length; i++) {
      var arr = pools[i];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        var p = arr[j];
        if (p && typeof p === 'object' && (p.uid === s || p.p1Uid === s || p.p2Uid === s)) return true;
      }
    }
    // formato de uid do Firebase (28 chars alfanuméricos) sem nenhum espaço
    return /^[A-Za-z0-9_-]{20,}$/.test(s);
  }
  if (Array.isArray(t.waitlist)) t.waitlist.forEach(addEntry);
  if (Array.isArray(t.standbyParticipants)) t.standbyParticipants.forEach(addEntry);
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object' && !Array.isArray(t.monarchWaitlist)) {
    Object.keys(t.monarchWaitlist).forEach(function (cat) {
      var arr = t.monarchWaitlist[cat];
      if (Array.isArray(arr)) arr.forEach(addEntry);
    });
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// A ESPERA É UMA FILA (v1.6.88) — regra do dono, ago/2026: quem leva W.O. vai pro
// **FIM** da lista; quem assume a vaga é o **PRIMEIRO** dela. Antes "espera" era um
// conjunto sem ordem declarada: cada storage crescia por conta e ninguém dizia quem
// era o próximo. Sem ordem, "o primeiro da fila assume" não é implementável.
//
// A ordem canônica é a de _getWaitlist (waitlist → standbyParticipants → monarchWaitlist,
// e dentro de cada um a ordem do array). ENTRAR na fila é sempre `push` no FIM de
// standbyParticipants — o storage único que os fluxos novos escrevem.

// Primeiro da fila (o suplente que assume a próxima vaga). `filterFn` opcional peneira
// (ex.: precisa atender a categoria do ausente) SEM furar a ordem: continua sendo o
// primeiro que serve, nunca o "melhor".
window._waitlistFirst = function (t, filterFn) {
  var q = window._getWaitlist(t);
  for (var i = 0; i < q.length; i++) {
    if (typeof filterFn !== 'function' || filterFn(q[i])) return q[i];
  }
  return null;
};

// Entra no FIM da fila. Idempotente por identidade (uid quando há; nome no fictício):
// chamar duas vezes não duplica nem promove ninguém. Retorna true se entrou agora.
window._waitlistPushBack = function (t, entry) {
  if (!t || !entry) return false;
  if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
  var uids = (typeof window._participantUids === 'function') ? window._participantUids(entry)
           : ((entry && entry.uid) ? [entry.uid] : []);
  var nm = _wlName(entry).toLowerCase();
  var ja = window._getWaitlist(t).some(function (e) {
    var eu = (typeof window._participantUids === 'function') ? window._participantUids(e)
           : ((e && e.uid) ? [e.uid] : []);
    // dois lados com uid → só uid decide (homônimos de uids distintos não colidem)
    if (uids.length && eu.length) return eu.some(function (u) { return uids.indexOf(u) !== -1; });
    return !!nm && _wlName(e).toLowerCase() === nm;
  });
  if (ja) return false;
  t.standbyParticipants.push(entry);
  return true;
};

// Formas do nome de um participante/entrada (cru displayName/name/email + formatado via
// _pName), em lowercase. Casa nomes que aparecem em formas diferentes (ex.: telefone cru
// "+5511981933576" vs formatado "+55 (11) 98193-3576").
window._nameForms = function (e) {
  var forms = [];
  if (typeof window._pName === 'function') { var f = String(window._pName(e, '') || ''); if (f) forms.push(f); }
  if (e && typeof e === 'object') {
    ['displayName', 'name', 'email'].forEach(function (k) { if (e[k]) forms.push(String(e[k])); });
  } else if (typeof e === 'string') { forms.push(e); }
  return forms.map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
};

// Remove um nome de TODOS os storages da espera. Casa nome cru/formatado.
// Retorna true se removeu algo.
window._removeFromWaitlist = function (t, name) {
  if (!t || !name) return false;
  var target = String(name).trim().toLowerCase();
  var removed = false;
  function matches(e) { return window._nameForms(e).indexOf(target) !== -1; }
  if (Array.isArray(t.waitlist)) {
    var b = t.waitlist.length; t.waitlist = t.waitlist.filter(function (e) { return !matches(e); });
    if (t.waitlist.length < b) removed = true;
  }
  if (Array.isArray(t.standbyParticipants)) {
    var b2 = t.standbyParticipants.length; t.standbyParticipants = t.standbyParticipants.filter(function (e) { return !matches(e); });
    if (t.standbyParticipants.length < b2) removed = true;
  }
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object' && !Array.isArray(t.monarchWaitlist)) {
    Object.keys(t.monarchWaitlist).forEach(function (cat) {
      var arr = t.monarchWaitlist[cat];
      if (Array.isArray(arr)) { var b3 = arr.length; t.monarchWaitlist[cat] = arr.filter(function (e) { return !matches(e); }); if (t.monarchWaitlist[cat].length < b3) removed = true; }
    });
  }
  return removed;
};

// Toda vez que se RE-DERIVA a espera (reset, re-sorteio) tem que limpar OS TRÊS storages.
// Retorna TODAS as pessoas que estavam na espera (deduplicadas) pra quem precisar
// devolvê-las ao pool.
window._clearAllWaitlists = function (t) {
  if (!t) return [];
  var collected = window._getWaitlist(t);
  t.waitlist = [];
  t.standbyParticipants = [];
  t.monarchWaitlist = {};
  return collected;
};

// ─────────────────────────────────────────────────────────────────────────────
// PORTA DE ENTRADA DA ESPERA (v1.6.86) — regra do dono, ago/2026:
// "só quem entrar AGORA vai para a lista de espera."
//
// Uma vez que a FASE CORRENTE foi SORTEADA, ninguém mais entra direto no roster:
// a rodada já existe, os grupos/confrontos já foram formados, e enfiar alguém em
// t.participants depois disso cria um INSCRITO FANTASMA — conta como inscrito, some
// da rodada, e não está na espera pra ser chamado. Foi exatamente o que aconteceu no
// Confra (ago/2026): a inscrição caiu 57s DEPOIS do sorteio e a pessoa ficou fora dos
// 27 grupos e fora dos 3 storages de espera.
//
// A CAUSA era o gate de "inscrições abertas": em Liga com ligaOpenEnrollment !== false
// o `ligaAberta` dava true mesmo com o sorteio feito, curto-circuitando o ramo de
// inscrição tardia (o único que mandava pra espera). Liga aberta significa "a temporada
// aceita gente nova" — NÃO "entra na rodada que já foi sorteada".
//
// PURO de propósito (nada de AppStore/document): o mesmo predicado roda no cliente e é
// espelhado na CF (functions/enroll-core.js). Ver [[project_sitout_vs_waitlist_canon]].
window._phaseDrawDone = function (t) {
  if (!t) return false;
  return (Array.isArray(t.matches) && t.matches.length > 0) ||
         (Array.isArray(t.rounds) && t.rounds.length > 0) ||
         (Array.isArray(t.groups) && t.groups.length > 0);
};

// ─────────────────────────────────────────────────────────────────────────────
// "INSCRIÇÕES ABERTAS" — A REGRA É UMA SÓ (v1.8.40).
//
// MEDIDO em 13/ago/2026: a mesma pergunta ("posso inscrever alguém agora?") tinha SEIS
// respostas diferentes no app — enrollCurrentUser exigia sorteioRealizado pro ligaAberta,
// submitTeamEnroll não checava finished, _doAddParticipant/addTeamFunction ignoravam prazo,
// o render do card fazia AUTO-CLOSE por registrationLimit numa Liga que o SERVIDOR
// consideraria aberta, e a CF (functions/enroll-core.enrollmentOpen) tinha a sua própria.
// Consequência real: Liga com inscrição aberta e prazo vencido ANTES do 1º sorteio →
// o cliente bloqueava (e ainda gravava status:'closed'), enquanto o servidor aceitaria.
// É a reclamação do dono: "inscrições abertas durante a fase e as pessoas caem em
// bloqueios que não permitem a inscrição".
//
// A regra canônica (idêntica à do servidor, que é quem decide de verdade):
//   ligaOpen = Liga/Ranking && ligaOpenEnrollment !== false && status !== 'finished'
//   open     = (não closed && não finished && sem sorteio && prazo ok) || ligaOpen
//
// ⚠️ ligaOpen NÃO olha status:'closed' nem registrationLimit DE PROPÓSITO: Liga é
// temporada contínua, não tem botão "Encerrar Inscrições" (v0.2.0) — o status 'closed'
// numa Liga só nasce do auto-close por prazo, que é exatamente o bloqueio indevido.
// Quem fecha inscrição de Liga é o toggle ligaOpenEnrollment, e mais nada.
// ⚠️ open NÃO decide o DESTINO (roster × espera) — isso é _phaseDrawDone, na gravação.
//
// PURO e espelhado na CF (functions/enroll-core.enrollmentOpen — paridade travada por
// teste). Todo gate de UI e todo caminho de escrita passam por AQUI; a próxima régua
// paralela é a próxima pessoa bloqueada. [[feedback_unify_dual_entry_points]]
window._enrollmentOpenState = function (t, nowMs) {
  if (!t) return { open: false, ligaOpen: false, sorteio: false, deadlinePassed: false };
  var now = (typeof nowMs === 'number') ? nowMs : Date.now();
  var isLiga = !!(t.format && (t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking'));
  var ligaOpen = isLiga && t.ligaOpenEnrollment !== false && t.status !== 'finished';
  var sorteio = window._phaseDrawDone(t);
  var deadlinePassed = !!(t.registrationLimit && new Date(t.registrationLimit).getTime() < now);
  var open = (t.status !== 'closed' && t.status !== 'finished' && !sorteio && !deadlinePassed) || ligaOpen;
  return { open: open, ligaOpen: ligaOpen, sorteio: sorteio, deadlinePassed: deadlinePassed };
};

// Está JOGANDO a fase corrente? (aparece num grupo Rei/Rainha, num grupo de fase ou
// num slot de confronto). Usado pra decidir se um reativado precisa da espera: quem já
// está na rodada volta a jogar direto; quem ficou de fora entra na fila.
// Casa por UID (identidade canônica) e por NOME (guest/fictício sem conta).
window._isPlayingCurrentPhase = function (t, entry) {
  if (!t || !entry) return false;
  var uids = (typeof window._participantUids === 'function') ? window._participantUids(entry)
           : ((entry && entry.uid) ? [entry.uid] : []);
  var nm = _wlName(entry).toLowerCase();
  var hitUid = false, hitName = false;
  function chkUids(list) {
    if (!Array.isArray(list)) return;
    list.forEach(function (u) { if (u && uids.indexOf(u) !== -1) hitUid = true; });
  }
  function chkNames(list) {
    if (!Array.isArray(list) || !nm) return;
    list.forEach(function (n) {
      var s = String(n || '').trim().toLowerCase();
      if (!s) return;
      if (s === nm) { hitName = true; return; }
      // dupla "A / B" no grupo → cada membro conta como jogando
      if (s.indexOf(' / ') !== -1 && s.split(' / ').some(function (x) { return x.trim() === nm; })) hitName = true;
    });
  }
  // FOLGA NÃO É JOGO. O motor cria um match `isSitOut` pra quem ficou de fora da rodada
  // (no Confra, os 2 inativos têm `sitOutReason:'inactive'`, p2 = 'FOLGA'). Contar isso como
  // "está jogando" faria o reativado NUNCA entrar na fila — ele tem uma folga, não um
  // confronto. Ver [[project_sitout_vs_waitlist_canon]].
  function chkMatch(m) {
    if (!m || m.isSitOut) return;
    chkUids(m.team1Uids); chkUids(m.team2Uids);
    chkUids([m.p1Uid, m.p2Uid]);
    chkNames([m.p1, m.p2]);
  }
  (t.rounds || []).forEach(function (r) {
    (r && r.monarchGroups || []).forEach(function (g) { chkUids(g && g.playersUids); chkNames(g && g.players); });
    (r && r.matches || []).forEach(chkMatch);
  });
  (t.groups || []).forEach(function (g) { chkUids(g && g.playersUids); chkNames(g && g.players); });
  (t.matches || []).forEach(chkMatch);
  // uid é identidade canônica: quando o lado tem uid, o nome não desempata.
  return uids.length ? hitUid : hitName;
};

// Conjunto de nomes (lowercase) na espera — inclui membros de duplas "A / B".
window._waitlistNameSet = function (t) {
  var s = {};
  window._getWaitlist(t).forEach(function (e) {
    var nm = _wlName(e).toLowerCase();
    if (!nm) return;
    if (nm.indexOf('/') !== -1) nm.split('/').forEach(function (x) { var k = x.trim(); if (k) s[k] = 1; });
    else s[nm] = 1;
  });
  return s;
};

// SANEAMENTO IDEMPOTENTE: quem JÁ ESTÁ jogando não pode estar na espera.
// Varre todo mundo que aparece num grupo Rei/Rainha (t.rounds[].monarchGroups[].players)
// ou num grupo de fase (t.groups[].players) e tira da espera. Cura docs que ficaram sujos
// enquanto _removeFromWaitlist não existia no servidor, e é a rede de segurança pra
// qualquer caminho futuro que forme confronto e esqueça de limpar. Roda no cliente (render)
// e no servidor (integração tardia). Retorna nº de nomes removidos.
window._sanitizeWaitlistVsGroups = function (t) {
  if (!t) return 0;
  var playing = {};
  function collect(g) {
    if (!g) return;
    (g.players || []).forEach(function (n) {
      var nm = String(n || '').trim();
      if (!nm || nm === 'BYE' || nm === 'TBD') return;
      // dupla "A / B" no grupo → cada membro conta como jogando
      if (nm.indexOf(' / ') !== -1) nm.split(' / ').forEach(function (x) { var k = x.trim(); if (k) playing[k.toLowerCase()] = k; });
      else playing[nm.toLowerCase()] = nm;
    });
  }
  (t.rounds || []).forEach(function (r) { (r && r.monarchGroups || []).forEach(collect); });
  (t.groups || []).forEach(collect);
  var removed = 0;
  Object.keys(playing).forEach(function (k) {
    if (window._removeFromWaitlist(t, playing[k])) removed++;
  });
  return removed;
};

// SANEAMENTO IDEMPOTENTE, IRMÃO DO DE CIMA: **folga de inativo só é de quem ESTÁ inativo.**
//
// REGRA DO DONO (07/ago/2026): _"quem era folga e reativou entra na lista de espera"_ ·
// _"reativou sai da folga e entra na lista de espera"_ — os dois numa tacada só. Sair da
// folga é parte do MESMO ato de reativar, não uma consequência de formar grupo depois.
//
// DEFEITO MEDIDO (Confra, mesmo dia): a **Ana Ribeiro** reativou, entrou na fila e chegou a
// formar grupo (R1 grupo 31, 3 jogos) — e continuava aparecendo em **"Desativados"**, porque
// a folga `sitOutReason:'inactive'` que o sorteio lhe deu quando ela ESTAVA inativa nunca foi
// retirada. Ela era a única nesse estado: das 4 folgas da rodada, as outras 3 são legítimas
// (1 inativa de verdade + 2 de W.O.). ⚠️ Consertar isso na FORMAÇÃO DE GRUPO seria tarde e
// errado — quem reativa e fica esperando na fila sem formar grupo continuaria listado como
// desativado, que é justamente o que não pode.
//
// A folga de inativo descreve UM estado: "esta pessoa está desativada no elenco". Quem não
// está mais assim (foi pra fila, voltou a jogar, ou saiu) não tem por que carregá-la.
// `'wo'` e `'remainder'` NÃO são tocados: o W.O. é o registro de uma falta que aconteceu
// (com 0 pts na rodada) e apagá-lo apagaria a penalidade; `remainder` é a sobra do sorteio,
// que tem cura própria (`_healMonarchRemainderToWaitlist`).
//
// Casa por UID (identidade canônica) e cai no nome só pra quem não tem conta.
// Retorna o nº de folgas removidas.
window._sanitizeSitOutsVsRoster = function (t) {
  if (!t || !Array.isArray(t.rounds)) return 0;
  var _uids = (typeof window._participantUids === 'function') ? window._participantUids
            : function (p) { return (p && p.uid) ? [p.uid] : []; };
  // quem está DESATIVADO no elenco — os únicos que podem ter folga de inativo
  var inativoUid = {}, inativoNome = {};
  (Array.isArray(t.participants) ? t.participants : []).forEach(function (p) {
    if (!p || typeof p !== 'object' || p.ligaActive !== false) return;
    var us = _uids(p).filter(Boolean);
    us.forEach(function (u) { inativoUid[u] = 1; });
    if (!us.length) _nameForms(p).forEach(function (n) { inativoNome[n] = 1; });
  });
  var removed = 0;
  t.rounds.forEach(function (r) {
    if (!r || !Array.isArray(r.matches)) return;
    r.matches = r.matches.filter(function (m) {
      if (!m || !m.isSitOut || m.sitOutReason !== 'inactive') return true;
      // uid manda; nome só quando não há uid nenhum no marcador
      if (m.p1Uid) { if (inativoUid[m.p1Uid]) return true; removed++; return false; }
      var nm = String(m.p1 || '').trim().toLowerCase();
      if (!nm || inativoNome[nm]) return true;
      removed++; return false;
    });
  });
  return removed;
};

// Formas do nome de uma entrada — local, espelha _nameForms público (definido abaixo).
function _nameForms(e) {
  return (typeof window._nameForms === 'function') ? window._nameForms(e)
    : [String((e && (e.displayName || e.name || e.email)) || '').trim().toLowerCase()].filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// A IDENTIDADE DA FILA É O UID (v1.7.61) — nome SÓ para quem não tem conta.
//
// DEFEITO MEDIDO (dono, 07/ago/2026, Confra). Rodando o motor REAL contra o doc REAL:
//
//   [0] uid=jSNA85jlsdfm…  _pName() = "Jogador sem perfil (jSNA)"   gender = null
//   [1] uid=5TxVeRIiT1cr…  _pName() = "Jogador sem perfil (5TxV)"   gender = null
//   …
//   grupos formados: 0
//   monarchWaitlist: ["Vini","Vanessa Kaufmann","Jogador sem perfil (jSNA)", …]
//
// A ponte e o motor guardavam a fila por NOME. As entradas da espera são strippadas desde
// a v1.3.52 (só uid), então `_pName` caía num RÓTULO-FANTASMA — e era esse texto que ia
// pra fila. Três estragos somados: (a) o gênero não resolve por um rótulo que não é de
// ninguém, e com a proporção travada "gênero desconhecido" tira a pessoa do pool → NENHUM
// grupo fecha, nunca; (b) a mesma pessoa entra duas vezes (o "Vini" antigo e o fantasma
// dela), que é exatamente o duplo-sorteio que o cânone da espera manda evitar; (c) o mapa
// vira lixo permanente, porque nada nunca limpa um nome que não é de ninguém.
//
// REGRA (dono): _"por uid sempre. nunca nome, email ou qualquer outro dado"_ — com UMA
// ressalva, também dele: _"se o usuário digitar participantes sem uid aí tem que considerar
// por nome apenas esses"_. Ou seja: o nome só é identidade onde NÃO EXISTE uid — o
// participante informal que o organizador digitou à mão. Para todo o resto, uid.
//
// A fila passa a guardar CHAVES: o uid quando a pessoa tem conta, o nome quando não tem.
// Item que não resolve para NINGUÉM da espera é descartado na leitura — é assim que os
// fantasmas gravados pela versão anterior somem sozinhos, sem migração à parte.

// Chave canônica de UMA entrada da espera. Objeto → uid, senão nome. Nunca devolve
// rótulo-fantasma: `_pName` só é consultado quando a entrada não tem uid.
window._wlKey = function (e) {
  if (e == null) return '';
  if (typeof e === 'string') return e.trim();
  if (typeof e !== 'object') return '';
  if (e.uid) return String(e.uid);
  // Sem uid = informal digitado à mão. Aqui o nome É a identidade legítima.
  var nm = String((e.displayName || e.name || '') || '').trim();
  if (nm) return nm;
  // Último recurso: só agora vale consultar _pName (dupla pré-formada "A / B", por ex.).
  return String((typeof window._pName === 'function') ? (window._pName(e, '') || '') : '').trim();
};

// Entrada da espera a partir de uma chave (uid OU nome). É o inverso de _wlKey e a
// única forma de sair da chave de volta pra pessoa.
window._wlEntryByKey = function (t, key) {
  if (!t || !key) return null;
  var k = String(key).trim();
  if (!k) return null;
  var kLower = k.toLowerCase();
  var pools = [t.waitlist, t.standbyParticipants];
  for (var pi = 0; pi < pools.length; pi++) {
    var arr = pools[pi];
    if (!Array.isArray(arr)) continue;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e) continue;
      if (typeof e === 'object' && e.uid && String(e.uid) === k) return e;
      if (!(typeof e === 'object' && e.uid) &&
          (window._nameForms(e) || []).indexOf(kLower) !== -1) return e;
    }
  }
  return null;
};

// Normaliza um item GRAVADO na fila (que pode ser nome legado) para a chave canônica.
// Devolve '' quando o item não corresponde a ninguém que esteja na espera — é o
// descarte dos fantasmas.
window._wlNormalizeKey = function (t, item) {
  var raw = String(item == null ? '' : (typeof item === 'object' ? window._wlKey(item) : item)).trim();
  if (!raw) return '';
  // Já é a chave de alguém da espera?
  var direto = window._wlEntryByKey(t, raw);
  if (direto) return window._wlKey(direto);
  // Nome legado de alguém COM conta → vira o uid dela (migração na leitura).
  var uid = (typeof window._memberUidByName === 'function') ? window._memberUidByName(t, raw) : '';
  if (uid) return uid;
  return '';
};

// Nome de EXIBIÇÃO de uma chave. Nunca é identidade — só serve pra montar o grupo e
// pintar a tela. Perfil vivo primeiro (uid), depois o nome gravado, e o próprio texto
// da chave quando ela É o nome (informal sem conta).
// ⚠️ NUNCA passar por `_displayNameForUid` com storedName vazio: ela devolve o RÓTULO
// `"Jogador sem perfil (XXXX)"` quando o perfil não resolveu — e foi exatamente esse
// rótulo que envenenou a fila. Aqui a ordem é: nome VIVO (que nunca inventa rótulo) →
// nome gravado na própria entrada → nome gravado no elenco → a chave. Se a chave for o
// nome (informal sem conta), ela já É o nome certo.
window._wlDisplayName = function (t, key) {
  var k = String(key || '').trim();
  if (!k) return '';
  var e = window._wlEntryByKey(t, k);
  var uid = (e && e.uid) ? String(e.uid) : '';
  if (uid && typeof window._nameForUid === 'function') {
    var vivo = String(window._nameForUid(uid) || '').trim();
    if (vivo) return vivo;
  }
  if (e) {
    var nm = String((e.displayName || e.name || '') || '').trim();
    if (nm) return nm;
  }
  if (uid && typeof window._memberNameByUid === 'function') {
    var gravado = String(window._memberNameByUid(t, uid) || '').trim();
    if (gravado) return gravado;
  }
  return k;
};

// Remove da espera pela CHAVE (uid quando há conta, nome só pro informal). Espelha
// _removeFromWaitlist, que continua existindo pros caminhos que só têm o nome em mãos.
window._removeFromWaitlistByKey = function (t, key) {
  if (!t || !key) return false;
  var k = String(key).trim();
  if (!k) return false;
  var kLower = k.toLowerCase();
  var removed = false;
  var casa = function (e) {
    if (!e) return false;
    if (typeof e === 'object' && e.uid) return String(e.uid) === k;   // COM conta: só uid
    return (window._nameForms(e) || []).indexOf(kLower) !== -1;        // SEM conta: nome
  };
  ['waitlist', 'standbyParticipants'].forEach(function (campo) {
    if (!Array.isArray(t[campo])) return;
    var antes = t[campo].length;
    t[campo] = t[campo].filter(function (e) { return !casa(e); });
    if (t[campo].length < antes) removed = true;
  });
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object' && !Array.isArray(t.monarchWaitlist)) {
    Object.keys(t.monarchWaitlist).forEach(function (cat) {
      var arr = t.monarchWaitlist[cat];
      if (!Array.isArray(arr)) return;
      var antes2 = arr.length;
      t.monarchWaitlist[cat] = arr.filter(function (x) {
        var xs = String(x || '').trim();
        return !(xs === k || xs.toLowerCase() === kLower);
      });
      if (t.monarchWaitlist[cat].length < antes2) removed = true;
    });
  }
  return removed;
};

// ⛔ ESPELHO CLIENTE de `isPlacedInDraw` (functions/enroll-core.js) — a pessoa JÁ ESTÁ
// COLOCADA no sorteio?
//
// POR QUE ESPELHO E NÃO CÓPIA SOLTA: o caminho otimista da desinscrição tem que decidir
// IGUAL à CF, senão o cliente remove, o `onSnapshot` traz de volta, e a tela pisca a pessoa
// saindo e voltando. O comentário do próprio caminho otimista já diz isso ("MESMO critério
// da CF/transação deenrollParticipant — têm que casar"). A paridade é travada por matriz em
// tests/nao-se-desinscreve-do-sorteio.test.js: mexeu em um lado sem o outro, o gate acusa.
//
// A REGRA (ordem do dono, 22/ago/2026): depois de colocada no sorteio, sair não é remover —
// é desativar. Tirar de `participants` quem ocupa vaga deixa a vaga sem dono, a contagem
// ímpar e a fase seguinte sem como fechar o grupo. Foi o caso da Juliana Reis no Confra.
window._isPlacedInDraw = function (t, uid) {
  if (!t || !uid) return false;
  var achou = false;
  var olha = function (arr) { if (!achou && Array.isArray(arr) && arr.indexOf(uid) !== -1) achou = true; };
  (Array.isArray(t.rounds) ? t.rounds : []).forEach(function (r) {
    if (!r) return;
    (Array.isArray(r.monarchGroups) ? r.monarchGroups : []).forEach(function (g) { if (g) olha(g.playersUids); });
    (Array.isArray(r.matches) ? r.matches : []).forEach(function (m) { if (m) { olha(m.team1Uids); olha(m.team2Uids); } });
  });
  (Array.isArray(t.groups) ? t.groups : []).forEach(function (g) { if (g) { olha(g.playersUids); olha(g.playerUids); } });
  (Array.isArray(t.matches) ? t.matches : []).forEach(function (m) { if (m) { olha(m.team1Uids); olha(m.team2Uids); } });
  return achou;
};

// Onde a pessoa está COLOCADA no sorteio — rodada, grupo e o NOME como está gravado no
// slot. O fluxo de W.O. (`_ligaApplyWo`) trabalha por (roundIndex, groupName, absentName),
// então quem sai depois do sorteio precisa traduzir o uid pra essas três coisas.
//
// O nome sai do SLOT, não do perfil: é ele que `_ligaApplyWo` casa contra `group.players`
// pra achar a vaga. Perfil renomeado depois do sorteio não pode desalinhar os dois.
window._acharVagaNoSorteio = function (t, uid) {
  if (!t || !uid) return null;
  var rounds = Array.isArray(t.rounds) ? t.rounds : [];
  for (var ri = 0; ri < rounds.length; ri++) {
    var gs = (rounds[ri] && Array.isArray(rounds[ri].monarchGroups)) ? rounds[ri].monarchGroups : [];
    for (var gi = 0; gi < gs.length; gi++) {
      var g = gs[gi];
      if (!g || !Array.isArray(g.playersUids)) continue;
      var k = g.playersUids.indexOf(uid);
      if (k === -1) continue;
      var nome = (Array.isArray(g.players) && g.players[k]) ? String(g.players[k]) : '';
      if (!nome) return null;                 // sem nome no slot o W.O. não acha a vaga
      return { roundIndex: ri, groupName: g.name, nome: nome, indice: k };
    }
  }
  return null;
};
