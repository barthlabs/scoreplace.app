// ─── Participants View ────────────────────────────────────────────────────────
var _t = window._t || function(k) { return k; };

// ── Funções globais de check-in (disponíveis para qualquer view) ──
// v0.17.33: adicionado suporte a #bracket/ — Lista de Espera vive em
// bracket.js e o toggle Presente daí precisa re-renderizar a view de
// bracket pra atualizar o label "Ausente"/"Presente" (CSS reactive já
// flipa o toggle visual via :checked, mas o texto vem do render).
function _reRenderParticipants() {
  const hash = window.location.hash;
  const container = document.getElementById('view-container');
  if (!container) return;
  if (hash.startsWith('#participants/')) {
    const id = hash.split('/')[1];
    renderParticipants(container, id);
  } else if (hash.startsWith('#tournaments/')) {
    const id = hash.split('/')[1];
    if (typeof renderTournaments === 'function') renderTournaments(container, id);
  } else if (hash.startsWith('#bracket/')) {
    const id = hash.split('/')[1];
    // _rerenderBracket (NUNCA renderBracket cru): preserva o scroll ancorado no card
    // visível (restore síncrono + trava de altura) e suprime o soft-refresh seguinte
    // — o renderBracket cru fazia a tela PULAR ao clicar em Cheguei/W.O. no bracket.
    if (typeof window._rerenderBracket === 'function') window._rerenderBracket(id);
    else if (typeof renderBracket === 'function') renderBracket(container, id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v1.0.87-beta: REDE DE SEGURANÇA — _processWoSubstitutions
// User: 'continua falhando em algum ponto. tem gente presente na lista de espera,
// mas ao colocar o WO a pessoa não é substituida no jogo (fica vermelha no jogo).
// arrume isso nem que seja colocando um loading até que o banco de dados esteja
// seguro de funcionar como se deve.'
//
// Função IDEMPOTENTE que processa TODAS as substituições pendentes a partir do
// estado FRESH do AppStore. Lê t.absent + t.checkedIn + t.standbyParticipants +
// t.waitlist + matches diretamente — sem closure, sem race. Pode ser chamada
// 1x ou 100x: efeito é o mesmo (só roda sub se ainda há absent sem replacedBy
// no match correspondente). Usa-se como rede de segurança em todo ponto onde
// estado pode ter mudado.
//
// Algoritmo:
// 1. Pra cada absent em t.absent
// 2. Achar o match onde o absent ainda está no team (não foi substituído)
// 3. Se Presente standby disponível → substituir
// 4. Atualizar match + partsArr + waitlists + checkedIn + woHistory
// 5. Sync no fim se houve qualquer mutação
// ─────────────────────────────────────────────────────────────────────────────
// Wrapper (fetch por tId + save) — pros callers que só têm o id e persistem
// direto (ex.: auto-sub do _toggleCheckIn). O núcleo PURO (_applyWoSubsToTournament)
// opera sobre o `t` passado, SEM fetch e SEM save, então é transaction-safe e
// reusável dentro de commitTournamentTx/AppStore.mutate (Fase B da blindagem).
window._processWoSubstitutions = function(tId) {
  const t = window._findTournamentById(tId);
  if (!t) return { ok: false, reason: 'no-tournament' };
  const r = window._applyWoSubsToTournament(t);
  if (r && r.subCount > 0) {
    if (typeof window.AppStore.syncImmediate === 'function') window.AppStore.syncImmediate(tId);
    else window.AppStore.sync();
  }
  return r;
};

// Núcleo PURO das substituições de W.O.: muta só o `t` passado (sem fetch, sem
// save). Histórico via t.history.push direto (transaction-safe — logAction do
// AppStore acha por id no store LOCAL, o que não serve pro doc fresco da txn).
window._applyWoSubsToTournament = function(t) {
  if (!t) return { ok: false, reason: 'no-tournament', subCount: 0 };
  if (!t.absent || Object.keys(t.absent).length === 0) return { ok: false, reason: 'no-absent', subCount: 0 };
  if (!t.checkedIn) return { ok: false, reason: 'no-checkedIn', subCount: 0 };

  const _getName = p => window._pName(p);
  const _normTeam = (s) => (s || '').replace(/\s*\/\s*/g, '/').trim();

  // Pool de standby CANÔNICO (store.js) — merge standbyParticipants+waitlist dedup por nome.
  const standbyPool = window._getStandbyPool(t);

  // Política de chamada da fila (Sorteio de Vagas): 'present' (padrão/legado) =
  // FIFO por check-in; 'locked' = ordem travada do sorteio (t.waitlistOrder),
  // entrando o próximo PRESENTE nessa ordem (ausente é pulado, não reordena).
  const _policy = t.callPolicy || 'present';
  const _ord = {};
  if (_policy === 'locked' && Array.isArray(t.waitlistOrder)) {
    t.waitlistOrder.forEach((nm, idx) => { _ord[nm] = idx; });
  }
  // Build presentList. Tolerant a TIMESTAMP (number) OU TRUE (boolean):
  // _toggleCheckIn seta Date.now() (number truthy), handlers de sub setam true.
  const presentList = standbyPool
    .map(p => {
      const name = _getName(p);
      // uid-first: lê pelo uid da pessoa (objeto p tem uid), nome só fallback legado.
      const ci = window._idMapGet(t, t.checkedIn, p);
      const ts = typeof ci === 'number' ? ci : (ci ? 1 : 0);
      return { p, name, ts };
    })
    .filter(o => o.ts > 0 && !(_policy === 'locked' && window._idMapHas(t, t.absent, o.p)));
  if (_policy === 'locked') {
    const _ordOf = (o) => {
      if (_ord[o.name] !== undefined) return _ord[o.name];
      if (o.p && typeof o.p === 'object' && typeof o.p.drawOrder === 'number') return o.p.drawOrder;
      return 9999;
    };
    presentList.sort((a, b) => _ordOf(a) - _ordOf(b));
  } else {
    presentList.sort((a, b) => a.ts - b.ts);
  }

  if (presentList.length === 0) {
    try {
      window._lastProcessSubs = {
        version: window.SCOREPLACE_VERSION, at: new Date().toISOString(),
        outcome: 'no-presente-in-standby',
        standbyPoolCount: standbyPool.length,
        absentNames: Object.keys(t.absent),
        checkedInKeys: Object.keys(t.checkedIn)
      };
    } catch (_e) {}
    return { ok: false, reason: 'no-presente', subCount: 0, standbyPoolCount: standbyPool.length };
  }

  const allMatches = (typeof window._collectAllMatches === 'function')
    ? window._collectAllMatches(t)
    : (Array.isArray(t.matches) ? t.matches.slice() : []);

  const woScope = t.woScope || 'individual';
  let subCount = 0;
  const subDetails = [];

  // Iterate absents — try to substitute each. Pode ter múltiplos absents pendentes.
  // t.absent agora é chaveado por uid (uid-first); traduz cada chave de volta pro
  // NOME pra cruzar com os slots da chave (m.p1/m.p2 são nomes). Chave legada que
  // já é nome (sem uid correspondente) resolve pra '' → cai no próprio k.
  const absentNames = Object.keys(t.absent).map(function(k){ return window._memberNameByUid(t, k) || k; });
  for (const absentName of absentNames) {
    if (presentList.length === 0) break;

    // Find match where absent is still in p1/p2 (not yet substituted)
    let foundMatch = null, foundSlot = null, foundIdx = -1;
    for (let i = 0; i < allMatches.length; i++) {
      const m = allMatches[i];
      if (!m || m.winner) continue;
      for (const slot of ['p1', 'p2']) {
        const entry = m[slot];
        if (!entry || entry === 'TBD' || entry === 'BYE') continue;
        const members = entry.includes('/') ? entry.split('/').map(n => n.trim()).filter(n => n) : [entry];
        if (members.indexOf(absentName) !== -1) {
          foundMatch = m; foundSlot = slot; foundIdx = i;
          break;
        }
      }
      if (foundMatch) break;
    }

    if (!foundMatch) continue; // absent já substituído ou não está em match ativo

    // Pick first Presente from FIFO pool
    const sub = presentList.shift();
    const subName = sub.name;
    const oldEntry = foundMatch[foundSlot];
    const isTeam = oldEntry.includes('/');
    let newEntry;
    if (isTeam && woScope === 'individual') {
      const sep = oldEntry.includes(' / ') ? ' / ' : '/';
      const members = oldEntry.split(sep).map(n => n.trim());
      const newMembers = members.map(n => n === absentName ? subName : n);
      newEntry = newMembers.join(' / ');
    } else {
      newEntry = subName;
    }
    const partner = isTeam ? oldEntry.split('/').map(n => n.trim()).find(n => n !== absentName) : null;

    // Update this match slot + propagate across all match refs (Liga/Suíço/Grupos)
    foundMatch[foundSlot] = newEntry;
    allMatches.forEach(m => {
      if (!m) return;
      if (m.p1 === oldEntry) m.p1 = newEntry;
      if (m.p2 === oldEntry) m.p2 = newEntry;
      if (Array.isArray(m.team1)) {
        const ti = m.team1.indexOf(absentName);
        if (ti !== -1) m.team1[ti] = subName;
      }
      if (Array.isArray(m.team2)) {
        const ti2 = m.team2.indexOf(absentName);
        if (ti2 !== -1) m.team2[ti2] = subName;
      }
    });

    // Update participants entry (team string)
    const partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    const pIdx = partsArr.findIndex(p => _getName(p) === oldEntry);
    if (pIdx !== -1) {
      if (typeof partsArr[pIdx] === 'string') partsArr[pIdx] = newEntry;
      else { partsArr[pIdx].displayName = newEntry; partsArr[pIdx].name = newEntry; }
    }

    // Push sub as solo entry if not already in participants
    const _hasSubEntry = partsArr.some(p => _getName(p) === subName);
    if (!_hasSubEntry) {
      partsArr.push(typeof sub.p === 'string' ? subName : sub.p);
    }
    t.participants = partsArr;

    // Remove sub from waitlists
    if (Array.isArray(t.standbyParticipants)) {
      t.standbyParticipants = t.standbyParticipants.filter(p => _getName(p) !== subName);
    }
    if (Array.isArray(t.waitlist)) {
      t.waitlist = t.waitlist.filter(p => _getName(p) !== subName);
    }

    // Mark sub as Presente (use timestamp pra preservar FIFO em subs subsequentes).
    // uid-first via o objeto do substituto (sub.p tem uid).
    window._idMapSet(t, t.checkedIn, (sub && typeof sub.p === 'object') ? sub.p : subName, Date.now());

    // Record woHistory (uid-keyed; _woHistSet grava meta.name pro display robusto)
    window._woHistSet(t, absentName, {
      originalTeam: oldEntry,
      partner: partner,
      matchNum: foundIdx + 1,
      replacedBy: subName,
      timestamp: Date.now()
    });

    subCount++;
    subDetails.push({ absent: absentName, sub: subName, oldEntry, newEntry, matchNum: foundIdx + 1 });
    if (!Array.isArray(t.history)) t.history = [];
    t.history.push({ date: new Date().toISOString(), message: `Substituição W.O. (auto): ${absentName} → ${subName}${partner ? ' (parceiro: ' + partner + ')' : ''} — Jogo ${foundIdx + 1}` });
  }

  try {
    window._lastProcessSubs = {
      version: window.SCOREPLACE_VERSION, at: new Date().toISOString(),
      outcome: subCount > 0 ? 'sub-done' : 'no-sub-needed',
      subCount, subDetails, standbyPoolCount: standbyPool.length, presentCount: presentList.length + subCount
    };
  } catch (_e) {}

  return { ok: subCount > 0, subCount, subDetails };
};

// ─── MOTOR ÚNICO DE W.O. (canônico, v4.0.114) ──────────────────────────────────
// Aplica um W.O. num torneio, reutilizável pelos DOIS gatilhos: organizador
// imediato (_declareAbsent) e apontado por jogador (wo-claim.js, pós confirma/
// contesta). As diferenças reais são MODOS (não código duplicado):
//   • Liga / Rei-Rainha, escopo de GRUPO → delega _ligaPickFill (folga / Jogador X).
//   • Eliminatória / Fase de Grupos → substituto da lista de espera
//     (_processWoSubstitutions); sem substituto presente → adversário vence por W.O.
// Edge cases ABSORVIDOS (antes só no _declareAbsent): adversário TBD (não aplica,
// senão winner='TBD' propaga), W.O. individual de dupla (parceiro → lista de
// espera), escopo individual×time, e o "aguardar substituto presente" (lista
// não-vazia, ninguém presente) — este só quando opts.noSubBehavior === 'wait'.
//
// opts = {
//   absentName,            // nome do ausente (membro OU entrada "A / B")
//   absentUids,            // uids a marcar em t.absent (derivado do nome se omitido)
//   scope,                 // 'match' | 'group' (default 'match')
//   matches,               // matches pré-resolvidos (claim: rc.matches); senão scan
//   roundIndex, groupName, // p/ delegação Liga/Monarch
//   noSubBehavior,         // 'wait' | 'escalate' (default 'escalate')
//   woScope                // 'individual' | 'team' (default t.woScope || 'individual')
// }
// retorna { ok, outcome, note, ...detalhes }. outcome ∈ {ligaDelegated, subbed,
// waited, waitedTBD, woApplied, noMatch, error}. O CHAMADOR faz toast/notify/save.
window._applyWO = function (t, opts) {
  opts = opts || {};
  if (!t) return { ok: false, outcome: 'error', reason: 'no-tournament' };
  const absentName = opts.absentName;
  if (!absentName) return { ok: false, outcome: 'error', reason: 'no-absent-name' };
  const scope = opts.scope || 'match';
  const noSubBehavior = opts.noSubBehavior || 'escalate';
  const woScope = opts.woScope || t.woScope || 'individual';
  const _getName = p => window._pName(p);
  // histórico via push direto em t.history (puro/transaction-safe — o motor NÃO
  // salva; quem persiste é o chamador, via AppStore.mutate/commitTournamentTx).
  const _log = (msg) => { if (!Array.isArray(t.history)) t.history = []; t.history.push({ date: new Date().toISOString(), message: msg }); };

  // uids do ausente (deriva do nome se não vier)
  let absentUids = Array.isArray(opts.absentUids) ? opts.absentUids.filter(Boolean) : [];
  if (!absentUids.length) {
    const _parts0 = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    const _pp = _parts0.find(p => typeof p === 'object' && _getName(p) === absentName);
    if (_pp && typeof window._participantUids === 'function') absentUids = window._participantUids(_pp).filter(Boolean);
    else if (_pp && _pp.uid) absentUids = [_pp.uid];
  }

  // marca ausência (uid-first) + tira da presença
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  if (absentUids.length) absentUids.forEach(u => { if (u) t.absent[u] = Date.now(); });
  else window._idMapSet(t, t.absent, absentName, Date.now());
  window._idMapDel(t, t.checkedIn, absentName);

  // ── Liga / Rei-Rainha (escopo de grupo) → picker de folga / Jogador X ──
  const _isLigaFmt = window._isLigaFormat ? window._isLigaFormat(t) : (t.format === 'Liga' || t.format === 'Ranking');
  const _isMonarch = window._isMonarchFormat ? window._isMonarchFormat(t) : false;
  if (scope === 'group' && (_isLigaFmt || _isMonarch)) {
    if (typeof window._ligaPickFill === 'function') {
      window._ligaPickFill(String(t.id), opts.roundIndex, opts.groupName, absentName);
      return { ok: true, outcome: 'ligaDelegated', note: 'Escolha o substituto (folga / Jogador X).' };
    }
    return { ok: false, outcome: 'error', reason: 'fluxo da Liga indisponível' };
  }

  // ── Eliminatória / Fase de Grupos ──
  const _absentInSlot = (slotStr) => {
    if (!slotStr || slotStr === 'TBD' || slotStr === 'BYE') return false;
    if (slotStr === absentName) return true;
    const mem = slotStr.includes('/') ? slotStr.split('/').map(n => n.trim()) : [slotStr];
    return mem.indexOf(absentName) !== -1;
  };
  const _allMatches = () => (typeof window._collectAllMatches === 'function')
    ? window._collectAllMatches(t)
    : (Array.isArray(t.matches) ? t.matches.slice() : []);
  const _friendlyOf = (all, m) => { const i = all.indexOf(m); return i >= 0 ? i + 1 : '?'; };

  // pré-scan: histórico do W.O. desde o momento da decretação (card do ausente
  // mostra "Estava no Jogo N com X") — mesmo que caia em aguarda/TBD/sub.
  const _preAll = _allMatches();
  const _preMatch = _preAll.find(m => m && !m.winner && (_absentInSlot(m.p1) || _absentInSlot(m.p2)));
  if (_preMatch && typeof window._woHistSet === 'function') {
    const _slot0 = _absentInSlot(_preMatch.p1) ? 'p1' : 'p2';
    const _entry0 = _preMatch[_slot0] || '';
    if (_entry0.includes('/') && _entry0 !== absentName) {
      const _mem0 = _entry0.split(/\s*\/\s*/).map(n => n.trim());
      window._woHistSet(t, absentName, {
        originalTeam: _entry0,
        partner: _mem0.find(n => n !== absentName) || '',
        matchNum: _friendlyOf(_preAll, _preMatch),
        timestamp: Date.now()
      });
    }
  }

  // 1) tenta substituto da lista de espera (só se houver alguém PRESENTE na fila).
  // v4.1.38: substituição SÓ no escopo INDIVIDUAL. No escopo TIME (woScope==='team')
  // a regra do dono é: faltou 1 → o TIME INTEIRO leva W.O. (adversário vence), NUNCA
  // um suplente solo tomando o lugar da dupla. Sem esse gate, o escopo time trocava
  // "A / B" por um solo "Suplente" (bug). Escopo individual substitui o membro
  // ausente (dupla) ou o solo (torneio individual); teamSize 1 é sempre individual.
  const pool = (typeof window._getStandbyPool === 'function') ? window._getStandbyPool(t) : [];
  const _isPresent = p => { const ci = window._idMapGet(t, t.checkedIn, p); return typeof ci === 'number' ? ci > 0 : !!ci; };
  const presentInPool = pool.filter(_isPresent);
  if (woScope === 'individual' && pool.length && presentInPool.length && typeof window._processWoSubstitutions === 'function') {
    const r = window._applyWoSubsToTournament(t);
    if (r && r.subCount > 0) return { ok: true, outcome: 'subbed', subCount: r.subCount, subDetails: r.subDetails || [] };
  }

  // 2) sem substituto presente com lista NÃO-vazia → aguarda (só se pedido)
  if (pool.length && !presentInPool.length && noSubBehavior === 'wait') {
    _log(`Ausência marcada: ${absentName} — aguardando substituto presente (lista tem ${pool.length}).`);
    return { ok: true, outcome: 'waited', poolCount: pool.length };
  }

  // 3) escala pra W.O.: adversário(s) vence(m). Re-scan (a sub pode ter mutado).
  const all = _allMatches();
  const pending = (Array.isArray(opts.matches) && opts.matches.length ? opts.matches : all)
    .filter(m => m && !m.winner && (_absentInSlot(m.p1) || _absentInSlot(m.p2)));
  if (!pending.length) return { ok: false, outcome: 'noMatch', reason: 'jogo do ausente não encontrado', absentMarked: true };

  let applied = 0, winner = null, matchNum = null, partnerToWaitlist = null, waitedTBD = false, anyKO = false;
  for (const m of pending) {
    const slot = _absentInSlot(m.p1) ? 'p1' : 'p2';
    const oppSide = slot === 'p1' ? 'p2' : 'p1';
    const oppName = m[oppSide];
    // adversário TBD/BYE → não aplica (evita winner='TBD' propagando)
    if (!oppName || oppName === 'TBD' || oppName === 'BYE') { waitedTBD = true; continue; }
    const entryStr = m[slot] || '';
    const isTeamEntry = entryStr.includes('/');
    const members = isTeamEntry ? entryStr.split(/\s*\/\s*/).map(n => n.trim()) : [entryStr];
    const isIndividualWO = woScope === 'individual' && isTeamEntry && members.indexOf(absentName) !== -1 && entryStr !== absentName;
    // W.O. individual de dupla sem substituto → parceiro vai pra lista de espera
    if (isIndividualWO) {
      const partner = members.find(n => n !== absentName);
      if (partner) {
        if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
        if (!t.standbyParticipants.some(p => _getName(p) === partner)) t.standbyParticipants.push(partner);
        partnerToWaitlist = partner;
      }
    }
    // 'W.O.' no lado AUSENTE (perdedor); vencedor = oponente
    m.scoreP1 = slot === 'p1' ? 'W.O.' : 0;
    m.scoreP2 = slot === 'p2' ? 'W.O.' : 0;
    m.winner = oppName;
    m.wo = true;
    m.woAbsentSide = slot;
    m.woAbsent = absentName;
    // avança o vencedor (só mata-mata)
    const _isKO = (typeof window._woIsKnockoutMatch === 'function') ? window._woIsKnockoutMatch(t, m) : (scope === 'match');
    if (_isKO) {
      anyKO = true;
      if (typeof window._advanceWinner === 'function') { try { window._advanceWinner(t, m); } catch (e) {} }
      else if (m.nextMatchId) {
        const _next = (t.matches || []).find(nm => nm.id === m.nextMatchId);
        if (_next) { if (!_next.p1 || _next.p1 === 'TBD') _next.p1 = m.winner; else if (!_next.p2 || _next.p2 === 'TBD') _next.p2 = m.winner; }
      }
    }
    applied++; winner = oppName; matchNum = _friendlyOf(all, m);
  }

  if (applied === 0) {
    // só sobrou o caso adversário-TBD (marcou ausente, W.O. deferido)
    if (waitedTBD) {
      _log(`Ausência marcada: ${absentName} — adversário TBD, W.O. não aplicado automaticamente.`);
      return { ok: true, outcome: 'waitedTBD', absentMarked: true };
    }
    return { ok: false, outcome: 'noMatch', reason: 'jogo do ausente não encontrado', absentMarked: true };
  }
  if (anyKO && typeof window._maybeFinishElimination === 'function') { try { window._maybeFinishElimination(t); } catch (e) {} }
  _log(`W.O.: ${absentName} ausente — ${winner} vence por W.O.` + (partnerToWaitlist ? ` (parceiro ${partnerToWaitlist} → lista de espera)` : ''));
  return { ok: true, outcome: 'woApplied', winner, matchNum, partnerToWaitlist };
};

// v2.3.82: chokepoint de permissão da presença. Regras:
//   • organizador / co-org / árbitro confirmado → marca/retira de QUALQUER um;
//   • torneio com placar pelos participantes (resultEntry players/all) → o
//     jogador marca a PRÓPRIA presença, exigindo GPS no local pra MARCAR
//     presente (retirar a própria presença é livre);
//   • qualquer outro caso → bloqueado com aviso.
// O organizador sempre pode dar/retirar (cai no 1º caso).

// ─── Card de inscrito CANÔNICO — linha de ação (v3.0.88) ────────────────────
// Layout ÚNICO de TODO card de inscrito (individual, dupla, jogo sorteado), em
// qualquer lugar do programa:
//   • Linha 1: tipo de inscrição ("Inscrição Individual" / "...em Dupla" / badge
//     de lista de espera). Sozinha, completa, NÃO truncada por controles.
//   • Linha 2 (uma ABAIXO, alinhada à DIREITA): Presente/Ausente · toggle · W.O.
//     · 🗑️ remover — NESSA ORDEM. Sem chamada → só o 🗑️, no mesmo canto direito.
// Pôr a ação numa linha própria evita cobrir o nº de inscrição (marca d'água) e
// o texto do tipo. presenceGroupHtml DEVE vir na ordem: palavra + toggle + W.O.
// (o 🗑️ é passado à parte, em delBtnHtml, e fica sempre por último/à direita).
window._inscritoActionRow = function (typeText, presenceGroupHtml, delBtnHtml) {
  var action = (presenceGroupHtml || '') + (delBtnHtml || '');
  var typeLine = typeText
    ? '<div style="font-size:0.7rem;color:var(--text-muted);opacity:0.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + typeText + '</div>'
    : '';
  var actionLine = action
    ? '<div style="display:flex;align-items:center;gap:6px;margin-top:5px;justify-content:flex-end;" onclick="event.stopPropagation();">' + action + '</div>'
    : '';
  return (typeLine || actionLine) ? '<div style="margin-top:6px;">' + typeLine + actionLine + '</div>' : '';
};

window._toggleCheckIn = function (tId, playerName) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  const user = window.AppStore && window.AppStore.currentUser;

  // 1) Autoridade (org/co-org/árbitro): controla a presença de todos.
  if (window._canManagePresence && window._canManagePresence(t, user)) {
    return window._applyCheckInToggle(tId, playerName);
  }

  // 2) Auto-presença do próprio jogador (só em torneios com placar pelos
  //    participantes e quando o nome é o do próprio usuário).
  const _canSelf = window._participantsSelfPresence && window._participantsSelfPresence(t) &&
    window._isMyOwnPlayerName && window._isMyOwnPlayerName(t, playerName, user);
  if (!_canSelf) {
    if (typeof showNotification === 'function') {
      showNotification('Presença', 'Apenas o organizador ou o árbitro pode marcar a presença.', 'info');
    }
    return;
  }
  const _wasIn = window._idMapHas(t, t.checkedIn, playerName);
  if (_wasIn) {
    // Retirar a própria presença é livre (você pode dizer que saiu).
    return window._applyCheckInToggle(tId, playerName);
  }
  // Marcar a própria presença → confirma pelo GPS que está no local.
  if (typeof showNotification === 'function') {
    showNotification('📍 Verificando local…', 'Confirmando pelo GPS que você está no local.', 'info');
  }
  window._isUserAtTournamentVenue(t).then(function (atVenue) {
    if (!atVenue) {
      if (typeof showNotification === 'function') {
        showNotification('📍 Fora do local', 'Ative o GPS e esteja no local do torneio pra marcar sua presença.', 'warning');
      }
      return;
    }
    window._applyCheckInToggle(tId, playerName);
  });
};

window._applyCheckInToggle = function (tId, playerName) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  const wasCheckedIn = window._idMapHas(t, t.checkedIn, playerName);

  // Guard v2.2.8: jogadores na lista de espera por ausência devem ser reativados
  // via botão "Reverter" — toggle fica desabilitado na UI, isso é um safety net.
  if (!wasCheckedIn && window._idMapHas(t, t.absent, playerName)) {
    const _pnFor = p => (typeof p === 'string' ? p : (p && (p.displayName || p.name || p.email || '')));
    const _inStandby = (Array.isArray(t.standbyParticipants) &&
      t.standbyParticipants.some(p => _pnFor(p) === playerName)) ||
      (Array.isArray(t.waitlist) &&
      t.waitlist.some(p => _pnFor(p) === playerName));
    if (_inStandby) {
      if (typeof showNotification === 'function') {
        showNotification('ℹ️', 'Use o botão "Reverter" para reativar este jogador da lista de espera.', 'info');
      }
      return;
    }
  }

  // v4.0.117: toggle de presença + auto-sub de W.O. ATÔMICOS pelo portão
  // AppStore.mutate (Fase B da blindagem). Antes eram DOIS saves crus (toggle
  // saveTournament + _processWoSubstitutions syncImmediate) → dois pontos de
  // lost-update. Agora ambos rodam no MESMO doc fresco da transação, usando o
  // núcleo PURO _applyWoSubsToTournament (sem save próprio). `_was` recomputado
  // do doc fresco decide o toggle; o toast da sub vem da execução LOCAL.
  let _subResult;
  window.AppStore.mutate(tId, function (ft) {
    if (!ft.checkedIn) ft.checkedIn = {};
    if (!ft.absent) ft.absent = {};
    const _was = window._idMapHas(ft, ft.checkedIn, playerName);
    if (_was) {
      window._idMapDel(ft, ft.checkedIn, playerName);
    } else {
      window._idMapSet(ft, ft.checkedIn, playerName, Date.now());
      window._idMapDel(ft, ft.absent, playerName);
      const r = window._applyWoSubsToTournament(ft); // núcleo puro, sem save
      if (_subResult === undefined) _subResult = r;
    }
  });
  if (_subResult && _subResult.ok && _subResult.subCount > 0) {
    _subResult.subDetails.forEach(d => {
      if (typeof showNotification === 'function') {
        showNotification('✅ Substituição W.O.',
          `${d.sub} substituiu ${d.absent} — Jogo ${d.matchNum}`,
          'success');
      }
    });
  }
  _reRenderParticipants();
};

window._markAbsent = function (tId, playerName) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  // v2.3.82: W.O. (declarar ausente / reverter) só por autoridade (org/co-org/
  // árbitro). O W.O. por consenso entre participantes virá num próximo passo.
  if (window._canManagePresence && !window._canManagePresence(t, window.AppStore && window.AppStore.currentUser)) {
    if (typeof showNotification === 'function') {
      showNotification('W.O.', 'Apenas o organizador ou o árbitro pode declarar W.O.', 'info');
    }
    return;
  }
  // pre-check: se o jogo do W.O. já foi jogado, não reverte — toast + aborta ANTES
  // de mutar/gravar (a trava dentro de _applyAbsenceToggle é a defesa silenciosa).
  const _woMetaPre = window._woHistGet(t, playerName);
  if ((window._idMapHas(t, t.absent, playerName) || _woMetaPre) && _woMetaPre && _woMetaPre.matchNum && typeof window._matchHasRealPlay === 'function') {
    const _allPre = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches.slice() : []);
    const _mPre = _allPre[_woMetaPre.matchNum - 1];
    if (_mPre && window._matchHasRealPlay(_mPre)) {
      if (typeof showNotification === 'function') showNotification('W.O. não pode ser revertido', 'A partida já foi jogada (placar lançado ou placar ao vivo iniciado). O W.O. não é mais reversível.', 'warning');
      return;
    }
  }
  // mutação (toggle ausência / revert de W.O.) ATÔMICA pelo portão AppStore.mutate
  window.AppStore.mutate(tId, function (ft) { window._applyAbsenceToggle(ft, playerName); });
  _reRenderParticipants();
};

// Mutação PURA de ausência (marcar/reverter W.O.) — muta só o `t` passado, sem
// save (transaction-safe). Extraída de _markAbsent na blindagem (v4.0.117). A
// trava "não reverte se já jogou" aqui é SILENCIOSA (toast no pre-check acima).
window._applyAbsenceToggle = function (t, playerName) {
  if (!t.absent) t.absent = {};
  if (!t.checkedIn) t.checkedIn = {};
  // v1.0.79-beta: revert completo. Detecta orphan (W.O.'d via woHistory) e,
  // se há replacedBy, desfaz substituição: restaura time original, remove
  // substituto da chave, devolve ele à waitlist se aplicável.
  const _woMeta = window._woHistGet(t, playerName); // uid-first, nome fallback
  if (window._idMapHas(t, t.absent, playerName) || _woMeta) {
    // Trava: se o jogo do W.O. já foi jogado de verdade (placar lançado / placar
    // ao vivo iniciado), não dá pra reverter — reverter zeraria um resultado real.
    if (_woMeta && _woMeta.matchNum && typeof window._matchHasRealPlay === 'function') {
      const _allMchk = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t)
        : (Array.isArray(t.matches) ? t.matches.slice() : []);
      const _woMatchChk = _allMchk[_woMeta.matchNum - 1];
      if (_woMatchChk && window._matchHasRealPlay(_woMatchChk)) {
        return; // trava SILENCIOSA (o toast é no pre-check do _markAbsent, fora da txn)
      }
    }
    // Desmarcar ausência → volta ao estado "sem confirmação"
    window._idMapDel(t, t.absent, playerName);
    if (_woMeta) {
      const _replacedBy = _woMeta.replacedBy;
      const _origTeam = _woMeta.originalTeam;
      const _matchNum = _woMeta.matchNum;
      if (_replacedBy && _origTeam && _matchNum) {
        // Restaura time original em todas as estruturas
        try {
          const _allM = (typeof window._collectAllMatches === 'function')
            ? window._collectAllMatches(t)
            : (Array.isArray(t.matches) ? t.matches.slice() : []);
          const _origMatch = _allM[_matchNum - 1];
          if (_origMatch && !_origMatch.winner) {
            // Substring "playerName" estava em substituto. Restaurar.
            const _sep = _origTeam.includes(' / ') ? ' / ' : '/';
            const _curTeam = _origMatch.p1 && _origMatch.p1.includes(_replacedBy) ? _origMatch.p1
                          : (_origMatch.p2 && _origMatch.p2.includes(_replacedBy) ? _origMatch.p2 : null);
            if (_curTeam) {
              const _restoredTeam = _curTeam.split(_sep).map(n => n.trim() === _replacedBy ? playerName : n.trim()).join(' / ');
              _allM.forEach(function(m) {
                if (!m) return;
                if (m.p1 === _curTeam) m.p1 = _restoredTeam;
                if (m.p2 === _curTeam) m.p2 = _restoredTeam;
                if (Array.isArray(m.team1)) {
                  const ti = m.team1.indexOf(_replacedBy);
                  if (ti !== -1) m.team1[ti] = playerName;
                }
                if (Array.isArray(m.team2)) {
                  const ti2 = m.team2.indexOf(_replacedBy);
                  if (ti2 !== -1) m.team2[ti2] = playerName;
                }
              });
              // Substituto sai do checkedIn (já que volta ao standby)
              window._idMapDel(t, t.checkedIn, _replacedBy);
              // Devolve substituto à waitlist se ele veio de lá
              const partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
              const _subIdx = partsArr.findIndex(function(p) {
                const _n = window._pName(p);
                return _n === _replacedBy;
              });
              // Adiciona à waitlist (só se não tava lá)
              if (!Array.isArray(t.waitlist)) t.waitlist = [];
              const _alreadyInWaitlist = t.waitlist.some(function(w) {
                const _wn = window._pName(w);
                return _wn === _replacedBy;
              });
              if (!_alreadyInWaitlist && _subIdx >= 0) {
                t.waitlist.push(partsArr[_subIdx]);
              }
            }
          }
        } catch (_e) { window._warn('[markAbsent revert] failed:', _e); }
      }
      // Sempre limpa woHistory após revert (uid-key + nome legado)
      window._woHistDel(t, playerName);
    }
  } else {
    // Marcar ausente → limpa presença se existia
    window._idMapSet(t, t.absent, playerName, Date.now());
    window._idMapDel(t, t.checkedIn, playerName);
  }
};

window._resetCheckIn = function (tId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  window.AppStore.mutate(tId, function (ft) { ft.checkedIn = {}; ft.absent = {}; });
  _reRenderParticipants();
  if (typeof showNotification === 'function') showNotification(_t('participants.resetCheckin'), _t('participants.resetCheckinMsg'), 'info');
};

// ════════════════════════════════════════════════════════════════════════════
// v2.1.86: CHAMADA pré-sorteio → sortear apenas entre os presentes.
// Fluxo: organizador marca presença na lista de inscritos, clica "Sortear entre
// os presentes". Os que não confirmaram presença (ausentes/aguardando) são
// resolvidos via diálogo de 3 opções: enviar à lista de espera, desclassificar
// ou cancelar. Em seguida o pipeline normal de sorteio roda só com os presentes.
// ════════════════════════════════════════════════════════════════════════════
window._drawPresentOnly = function (tId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  if (!t.checkedIn) t.checkedIn = {};
  const parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const present = [];
  const absentees = [];
  parts.forEach(function (p) {
    const en = window._pName(p);
    if (window._idMapHas(t, t.checkedIn, p)) present.push(p);
    else absentees.push(p);
  });

  if (present.length === 0) {
    if (typeof showAlertDialog === 'function') {
      showAlertDialog('Nenhum presente confirmado',
        'Marque ao menos um inscrito como <b>Presente</b> antes de sortear entre os presentes.',
        null, { type: 'warning' });
    }
    return;
  }

  // proceed: encerra inscrições (exceto modos de inscrição tardia) e dispara o
  // pipeline de sorteio normal (potência de 2, resto, grupos, etc.) sobre a
  // lista já filtrada. isAberto=false → vai direto pro _startDraw sem 2º diálogo.
  const proceed = function () {
    const t2 = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); });
    if (t2) {
      const lateMode = (t2.lateEnrollment === 'standby' || t2.lateEnrollment === 'expand');
      if (!lateMode && t2.status !== 'closed' && t2.status !== 'finished') t2.status = 'closed';
    }
    if (typeof window._handleSortearClick === 'function') {
      window._handleSortearClick(tId, false);
    } else if (typeof window.showUnifiedResolutionPanel === 'function') {
      window.showUnifiedResolutionPanel(tId);
    }
  };

  if (absentees.length === 0) { proceed(); return; }

  window._showAbsenteeResolutionDialog(tId, present, absentees, proceed);
};

// Diálogo de 3 opções para o destino dos ausentes.
window._showAbsenteeResolutionDialog = function (tId, present, absentees, proceed) {
  const existing = document.getElementById('absentee-resolution-dialog');
  if (existing) existing.remove();

  const names = absentees.map(function (p) { return window._pName(p, '?'); });
  const _safe = (window._safeHtml || function (s) { return s; });
  const preview = names.slice(0, 8).map(function (n) { return _safe(n); }).join(', ') +
    (names.length > 8 ? ' e mais ' + (names.length - 8) : '');

  const dialog = document.createElement('div');
  dialog.id = 'absentee-resolution-dialog';
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100012;padding:16px;';
  dialog.innerHTML =
    '<div style="background:var(--surface-color);border:1px solid var(--border-color);border-radius:16px;max-width:440px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="background:rgba(245,158,11,0.1);border-bottom:1px solid var(--border-color);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:12px;">' +
        '<span style="font-size:1.8rem;">📋</span>' +
        '<div style="font-size:1.05rem;font-weight:800;color:var(--text-color);">Sortear entre os presentes</div>' +
      '</div>' +
      '<div style="padding:1.1rem 1.25rem;color:var(--text-muted);font-size:0.9rem;line-height:1.55;">' +
        '<p style="margin:0 0 8px;"><b style="color:#4ade80;">' + present.length + '</b> presente(s) entrarão no sorteio.</p>' +
        '<p style="margin:0 0 6px;"><b style="color:#f87171;">' + absentees.length + '</b> não confirmaram presença:</p>' +
        '<p style="margin:0;font-size:0.82rem;opacity:0.85;">' + preview + '</p>' +
        '<p style="margin:12px 0 0;font-weight:700;color:var(--text-color);">O que fazer com os ausentes?</p>' +
      '</div>' +
      '<div style="padding:0 1.25rem 1.25rem;display:flex;flex-direction:column;gap:8px;">' +
        '<button id="absres-waitlist" class="btn hover-lift" style="background:rgba(251,191,36,0.18);color:#fbbf24;border:1px solid rgba(251,191,36,0.5);font-weight:800;padding:11px;border-radius:10px;">🕐 Enviar à Lista de Espera</button>' +
        '<button id="absres-dq" class="btn hover-lift" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.5);font-weight:800;padding:11px;border-radius:10px;">🚫 Desclassificar</button>' +
        '<button id="absres-cancel" class="btn" style="background:rgba(255,255,255,0.08);color:var(--text-muted);border:1px solid var(--border-color);padding:10px;border-radius:10px;">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(dialog);

  const close = function () { dialog.remove(); };
  dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
  const _cancel = document.getElementById('absres-cancel');
  const _wl = document.getElementById('absres-waitlist');
  const _dq = document.getElementById('absres-dq');
  if (_cancel) _cancel.onclick = close;
  if (_wl) _wl.onclick = function () { close(); window._resolveAbsenteesThenDraw(tId, 'waitlist', proceed); };
  if (_dq) _dq.onclick = function () { close(); window._resolveAbsenteesThenDraw(tId, 'disqualify', proceed); };
};

// Aplica o destino dos ausentes (lista de espera ou desclassificação), filtra
// t.participants para os presentes, persiste e dispara `proceed` (o sorteio).
window._resolveAbsenteesThenDraw = function (tId, mode, proceed) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  const parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const present = [];
  const absentees = [];
  parts.forEach(function (p) {
    const en = window._pName(p);
    if (window._idMapHas(t, t.checkedIn, p)) present.push(p);
    else absentees.push(p);
  });

  if (mode === 'waitlist') {
    if (!Array.isArray(t.waitlist)) t.waitlist = [];
    absentees.forEach(function (p) {
      const en = window._pName(p);
      const exists = t.waitlist.some(function (w) { return window._pName(w) === en; });
      if (!exists) t.waitlist.push(p);
      // Estado neutro na lista de espera (pode ser chamado depois p/ substituir W.O.)
      window._idMapDel(t, t.checkedIn, p);
      window._idMapDel(t, t.absent, p);
    });
  } else { // disqualify
    if (!Array.isArray(t.disqualified)) t.disqualified = [];
    absentees.forEach(function (p) {
      const en = window._pName(p);
      const exists = t.disqualified.some(function (w) { return window._pName(w) === en; });
      if (!exists) t.disqualified.push(p);
      window._idMapDel(t, t.checkedIn, p);
      window._idMapDel(t, t.absent, p);
    });
  }

  t.participants = present;

  if (window.AppStore && typeof window.AppStore.logAction === 'function') {
    window.AppStore.logAction(tId, 'Chamada pré-sorteio: ' + present.length + ' presente(s), ' +
      absentees.length + (mode === 'waitlist' ? ' à lista de espera' : ' desclassificado(s)'));
  }

  const savePromise = (window.AppStore && typeof window.AppStore.syncImmediate === 'function')
    ? window.AppStore.syncImmediate(tId)
    : (window.FirestoreDB ? window.FirestoreDB.saveTournament(t) : Promise.resolve());

  Promise.resolve(savePromise).then(function () {
    if (typeof showNotification === 'function') {
      showNotification('✅ Chamada concluída',
        present.length + ' no sorteio · ' + absentees.length +
        (mode === 'waitlist' ? ' na lista de espera' : ' desclassificado(s)'), 'success');
    }
    if (typeof proceed === 'function') proceed();
  }).catch(function (e) {
    if (window._warn) window._warn('[rollcall] save failed:', e);
    if (typeof proceed === 'function') proceed();
  });
};

// ── Inline name editing for organizers ──
window._editParticipantName = function(tId, oldName) {
  var span = event.target;
  if (span.getAttribute('contenteditable') === 'true') return; // already editing
  span.setAttribute('contenteditable', 'true');
  span.style.background = 'rgba(255,255,255,0.1)';
  span.style.borderRadius = '4px';
  span.style.padding = '1px 4px';
  span.style.outline = '1px solid rgba(99,102,241,0.5)';
  span.style.minWidth = '60px';
  span.focus();
  // Select all text
  var range = document.createRange();
  range.selectNodeContents(span);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  var _save = function() {
    span.setAttribute('contenteditable', 'false');
    span.style.background = '';
    span.style.padding = '';
    span.style.outline = '';
    var newName = span.textContent.trim();
    if (!newName || newName === oldName) {
      span.textContent = oldName; // revert
      return;
    }
    var t = window._findTournamentById(tId);
    if (!t) return;
    // Update in participants array
    var parts = Array.isArray(t.participants) ? t.participants : [];
    parts.forEach(function(p, idx) {
      if (typeof p === 'string') {
        if (p === oldName) parts[idx] = newName;
        else if (p.indexOf(' / ') !== -1) {
          var updated = p.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (updated !== p) parts[idx] = updated;
        }
      } else if (p && typeof p === 'object') {
        if (p.displayName === oldName) p.displayName = newName;
        if (p.name === oldName) p.name = newName;
      }
    });
    // Update in matches, rounds, groups
    var _updateMatch = function(m) {
      if (!m) return;
      if (m.p1 === oldName) m.p1 = newName;
      if (m.p2 === oldName) m.p2 = newName;
      if (m.winner === oldName) m.winner = newName;
      // Team names with " / "
      ['p1', 'p2', 'winner'].forEach(function(field) {
        if (m[field] && m[field].indexOf(oldName) !== -1 && m[field].indexOf(' / ') !== -1) {
          var upd = m[field].split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (upd !== m[field]) m[field] = upd;
        }
      });
      if (Array.isArray(m.team1)) { var i1 = m.team1.indexOf(oldName); if (i1 !== -1) m.team1[i1] = newName; }
      if (Array.isArray(m.team2)) { var i2 = m.team2.indexOf(oldName); if (i2 !== -1) m.team2[i2] = newName; }
    };
    // Update every match across all shapes (by-reference, mutations persist).
    if (typeof window._collectAllMatches === 'function') {
      window._collectAllMatches(t).forEach(_updateMatch);
    } else {
      // Defensive fallback: bracket-model.js not loaded.
      if (Array.isArray(t.matches)) t.matches.forEach(_updateMatch);
      if (t.thirdPlaceMatch) _updateMatch(t.thirdPlaceMatch);
      if (Array.isArray(t.rounds)) t.rounds.forEach(function(r) { if (r && Array.isArray(r.matches)) r.matches.forEach(_updateMatch); });
      if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
        if (!g) return;
        if (Array.isArray(g.matches)) g.matches.forEach(_updateMatch);
        if (Array.isArray(g.rounds)) g.rounds.forEach(function(gr) { if (Array.isArray(gr)) gr.forEach(_updateMatch); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(_updateMatch); });
      });
      if (Array.isArray(t.rodadas)) t.rodadas.forEach(function(r) { if (Array.isArray(r)) r.forEach(_updateMatch); else if (r && Array.isArray(r.matches)) r.matches.forEach(_updateMatch); });
    }
    // g.players is a roster field (not a match), handled separately.
    if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
      if (g && Array.isArray(g.players)) {
        var pi = g.players.indexOf(oldName);
        if (pi !== -1) g.players[pi] = newName;
      }
    });
    // Update checkedIn, absent, vips, standings, classification, sorteioRealizado
    ['checkedIn', 'absent', 'vips'].forEach(function(field) {
      if (!t[field]) return;
      if (t[field][oldName] !== undefined) { t[field][newName] = t[field][oldName]; delete t[field][oldName]; }
      Object.keys(t[field]).forEach(function(k) {
        if (k.indexOf(oldName) !== -1 && k.indexOf(' / ') !== -1) {
          var newKey = k.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (newKey !== k) { t[field][newKey] = t[field][k]; delete t[field][k]; }
        }
      });
    });
    if (t.classification && t.classification[oldName] !== undefined) { t.classification[newName] = t.classification[oldName]; delete t.classification[oldName]; }
    if (Array.isArray(t.standings)) t.standings.forEach(function(s) { if (s.name === oldName) s.name = newName; if (s.player === oldName) s.player = newName; });
    if (Array.isArray(t.sorteioRealizado)) t.sorteioRealizado.forEach(function(item, idx2) {
      if (typeof item === 'string') {
        if (item === oldName) t.sorteioRealizado[idx2] = newName;
        else if (item.indexOf(oldName) !== -1 && item.indexOf(' / ') !== -1) {
          var newSR = item.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (newSR !== item) t.sorteioRealizado[idx2] = newSR;
        }
      } else if (typeof item === 'object' && item) { if (item.name === oldName) item.name = newName; if (item.displayName === oldName) item.displayName = newName; }
    });

    window.FirestoreDB.saveTournament(t);
    window.AppStore.logAction(tId, 'Nome editado: "' + oldName + '" → "' + newName + '"');
    if (typeof showNotification === 'function') showNotification(_t('participants.nameUpdated'), _t('participants.nameUpdatedMsg', { old: oldName, 'new': newName }), 'success');
    _reRenderParticipants();
  };

  span.addEventListener('blur', _save, { once: true });
  span.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      span.blur();
    }
    if (e.key === 'Escape') {
      span.textContent = oldName;
      span.blur();
    }
  });
};

window._startTournament = function (tId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  t.tournamentStarted = Date.now();
  // Se não houver data de início, preencher com a data atual
  if (!t.startDate) {
    const now = new Date();
    const pad = (v) => String(v).padStart(2, '0');
    t.startDate = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  }
  // Status passa a ser em andamento
  t.status = 'in_progress';
  window.AppStore.sync();
  if (typeof showNotification === 'function') showNotification(_t('participants.tournamentStarted'), _t('participants.tournamentStartedMsg'), 'success');
  // Re-render current view
  const hash = window.location.hash;
  const container = document.getElementById('view-container');
  if (container && hash.startsWith('#bracket/')) {
    if (typeof renderBracket === 'function') renderBracket(container, tId);
  } else {
    _reRenderParticipants();
  }
};

window._setCheckInFilter = function (tId, filter) {
  window._checkInFilter = filter;
  _reRenderParticipants();
};

// v2.6.108: tela de Inscritos usa a BARRA CANÔNICA (window._inscritosFilterBar) —
// mesma da Análise: busca + Ordenar (Inscrição ↑↓ / Nome A→Z/Z→A) + Gênero + Habilidade.
// Tudo DOM (sem re-render → não perde foco): busca/gênero/habilidade escondem cards;
// Ordenar reordena os nós no container. window._partSearch persiste o texto entre renders.
window._partSearch = window._partSearch || '';
window._partApplyFilter = function () {
  var _docEl = document.scrollingElement || document.documentElement;
  var _keepY = _docEl.scrollTop;
  var inp = document.getElementById('part-search');
  if (inp) window._partSearch = inp.value;
  var q = (window._partSearch || '').trim().toLowerCase();
  var sort = (document.getElementById('part-sort') || {}).value || 'name-asc';
  var gf = (document.getElementById('part-gender') || {}).value || 'all';
  var sk = (document.getElementById('part-skill') || {}).value || 'all';
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-part-card]'));
  if (!cards.length) return;
  var shown = 0;
  cards.forEach(function (c) {
    var nm = c.getAttribute('data-part-name') || '';
    var g = c.getAttribute('data-part-gender') || 'none';
    var s = c.getAttribute('data-part-skill') || 'none';
    // v3.1.x: card de DUPLA (data-part-multi="1") = 2 pessoas. Gênero/habilidade não
    // se aplicam a um PAR (cada membro tem o seu) — viram wildcard; só a BUSCA filtra
    // (data-part-name casa qualquer um dos nomes). Pra solo, mantém o casamento exato,
    // tolerando também valor multi (g/s separados por vírgula) por segurança.
    var isMulti = c.getAttribute('data-part-multi') === '1';
    var okSearch = !q || nm.indexOf(q) !== -1;
    var okGender = isMulti || gf === 'all' || g === gf || g.split(',').indexOf(gf) !== -1;
    var okSkill = isMulti || sk === 'all' || s === sk || s.split(',').indexOf(sk) !== -1;
    var ok = okSearch && okGender && okSkill;
    c.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  // Ordenar: reordena os nós no container (DOM, focus-safe). v3.1.x: agrupa por
  // parentNode e ordena DENTRO de cada container — telas com DUAS seções (ex.:
  // duplas pré-sorteio: "Sem dupla" + "Duplas formadas") mantêm cada card na sua
  // seção. Telas de seção única ficam idênticas (1 grupo só).
  var _cmp = function (a, b) {
    // v2.7.37: ORGANIZADORES sempre no topo (acima até dos VIPs), independente do
    // sort/filtro. Depois VIPs. Depois o sort escolhido (v2.7.29).
    var ga = a.getAttribute('data-part-org') === '1' ? 1 : 0;
    var gb = b.getAttribute('data-part-org') === '1' ? 1 : 0;
    if (ga !== gb) return gb - ga;
    var va = a.getAttribute('data-part-vip') === '1' ? 1 : 0;
    var vb = b.getAttribute('data-part-vip') === '1' ? 1 : 0;
    if (va !== vb) return vb - va;
    // v2.7.53: LISTA DE ESPERA NÃO é mais fixada no rodapé — ela entra na ordem
    // normal (alfabética/cronológica) junto com os demais inscritos, só em âmbar.
    if (sort === 'name-asc' || sort === 'name-desc') {
      var r = (a.getAttribute('data-part-name') || '').localeCompare(b.getAttribute('data-part-name') || '', 'pt-BR', { sensitivity: 'base' });
      return sort === 'name-desc' ? -r : r;
    }
    // v4.4.63: sort ATIVOS/INATIVOS. asc (↑) = ativos primeiro; desc (↓) = inativos primeiro.
    // Desempate por nome. Lê data-part-inactive (1=inativo).
    if (sort === 'active-asc' || sort === 'active-desc') {
      var ia = a.getAttribute('data-part-inactive') === '1' ? 1 : 0;
      var ib = b.getAttribute('data-part-inactive') === '1' ? 1 : 0;
      if (ia !== ib) return sort === 'active-desc' ? (ib - ia) : (ia - ib);
      return (a.getAttribute('data-part-name') || '').localeCompare(b.getAttribute('data-part-name') || '', 'pt-BR', { sensitivity: 'base' });
    }
    var oa = parseInt(a.getAttribute('data-part-order') || '0', 10), ob = parseInt(b.getAttribute('data-part-order') || '0', 10);
    return sort === 'order-desc' ? (ob - oa) : (oa - ob);
  };
  var _groups = [];
  cards.forEach(function (c) {
    var pr = c.parentNode; if (!pr) return;
    var grp = null;
    for (var gi = 0; gi < _groups.length; gi++) { if (_groups[gi].parent === pr) { grp = _groups[gi]; break; } }
    if (!grp) { grp = { parent: pr, items: [] }; _groups.push(grp); }
    grp.items.push(c);
  });
  _groups.forEach(function (grp) {
    grp.items.slice().sort(_cmp).forEach(function (c) { grp.parent.appendChild(c); });
  });
  var empty = document.getElementById('part-search-empty');
  if (empty) empty.style.display = (shown === 0 && cards.length > 0) ? '' : 'none';
  // v3.0.97: não pula a tela / a barra sticky não sai do lugar quando o filtro esvazia.
  // v3.1.41: com BUSCA ATIVA, leva o 1º resultado pra logo abaixo da barra (nunca tela
  // preta embaixo tendo que rolar pra cima).
  try { if (window._stickyFilterKeepRoom) window._stickyFilterKeepRoom(_keepY, !!q); } catch (e) {}
};

window._toggleVip = function (tId, participantName) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  if (!t.vips) t.vips = {};
  // uid-first: resolve a ENTRADA pra pegar todos os uids (solo = 1; dupla =
  // p1Uid+p2Uid). VIP fica marcado em cada uid → os readers que fazem
  // members.some(m => _vips[m]) acham, e dois jogadores de mesmo nome não
  // colidem. Jogador informal (sem uid) continua pelo nome (fallback).
  const partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const entry = partsArr.find(p => window._pName(p) === participantName);
  const uids = (entry && typeof window._participantUids === 'function') ? window._participantUids(entry) : [];
  let isVip = false;
  uids.forEach(u => { if (t.vips[u]) isVip = true; });
  if (!uids.length && t.vips[participantName]) isVip = true;
  if (isVip) {
    uids.forEach(u => { delete t.vips[u]; });
    delete t.vips[participantName]; // limpa chave-nome legada
  } else if (uids.length) {
    uids.forEach(u => { t.vips[u] = Date.now(); });
    delete t.vips[participantName]; // migra: sai do nome, entra no uid
  } else {
    t.vips[participantName] = Date.now();
  }
  window.FirestoreDB.saveTournament(t);
  _reRenderParticipants();
};

// ── Declarar ausência de participante ──
window._declareAbsent = function (tId, playerName) {
  // v1.0.85-beta: t/partsArr/standby/matchEntry agora são `let` (não `const`)
  // porque a confirm callback re-fetcha e re-deriva tudo a partir do t mais
  // recente do AppStore — onSnapshot pode ter substituído store.tournaments
  // entre dialog-open e confirm.
  let t = window._findTournamentById(tId);
  if (!t) return;
  // v2.3.82: W.O. só por autoridade (org/co-org/árbitro). Consenso de
  // participantes virá num próximo passo.
  if (window._canManagePresence && !window._canManagePresence(t, window.AppStore && window.AppStore.currentUser)) {
    if (typeof showNotification === 'function') {
      showNotification('W.O.', 'Apenas o organizador ou o árbitro pode declarar W.O.', 'info');
    }
    return;
  }

  // Encontrar o time/entry e o match deste participante
  let partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  let teamName = null;
  partsArr.forEach(p => {
    const pName = window._pName(p);
    if (pName.includes('/')) {
      const members = pName.split('/').map(n => n.trim()).filter(n => n);
      if (members.includes(playerName)) teamName = pName;
    } else if (pName === playerName) {
      teamName = pName;
    }
  });

  if (!teamName) return;

  // Encontrar o match onde este time joga — scan todas as shapes via helper canônico.
  // Para elim, a ordem do helper começa com t.matches, preservando o índice amigável.
  // Para Liga/Suíço/Grupos, o índice flat ao menos localiza a partida (antes: silent miss).
  let matchEntry = null;
  let matchIdx = -1;
  let matchSide = null; // 'p1' or 'p2'
  const _allForWO = (typeof window._collectAllMatches === 'function')
    ? window._collectAllMatches(t)
    : (Array.isArray(t.matches) ? t.matches.slice() : []);
  const _normTeam = (s) => (s || '').replace(/\s*\/\s*/g, '/').trim();
  const _teamNameNorm = _normTeam(teamName);
  _allForWO.forEach((m, mi) => {
    if (!m || m.winner) return; // já decidido
    if (matchEntry) return; // já encontrado
    if (_normTeam(m.p1) === _teamNameNorm) { matchEntry = m; matchIdx = mi; matchSide = 'p1'; }
    else if (_normTeam(m.p2) === _teamNameNorm) { matchEntry = m; matchIdx = mi; matchSide = 'p2'; }
  });

  // Pool de standby CANÔNICO (store.js) — mesmo merge que _processWoSubstitutions.
  const _getName = p => window._pName(p);
  let standby = window._getStandbyPool(t);
  const _removeFromWaitlists = (name) => {
    if (Array.isArray(t.standbyParticipants)) t.standbyParticipants = t.standbyParticipants.filter(p => _getName(p) !== name);
    if (Array.isArray(t.waitlist)) t.waitlist = t.waitlist.filter(p => _getName(p) !== name);
  };
  let hasStandby = standby.length > 0;
  let friendlyNum = matchIdx >= 0 ? matchIdx + 1 : '?';
  let opponentSide = matchSide === 'p1' ? 'p2' : 'p1';
  let opponent = matchEntry ? matchEntry[opponentSide] : null;

  const woScope = t.woScope || 'individual';
  const isTeamEntry = teamName.includes('/') || teamName.includes(' / ');
  const isIndividualWO = woScope === 'individual' && isTeamEntry;

  let confirmTitle, confirmMsg, confirmBtn;

  if (isIndividualWO) {
    confirmTitle = _t('participants.declareAbsence');
    confirmMsg = _t('participants.absenceMsgIndStandby', {player: playerName, num: friendlyNum});
    confirmBtn = _t('participants.btnSubstInd');
  } else if (hasStandby && !isTeamEntry) {
    // v4.1.38: só o inscrito SOLO (torneio individual) recebe substituto da espera.
    // Dupla em escopo TIME não substitui — faltou 1 → time inteiro leva W.O. (cai no
    // else abaixo). Dupla em escopo INDIVIDUAL já foi tratada no isIndividualWO acima.
    confirmTitle = _t('participants.declareAbsence');
    confirmMsg = _t('participants.absenceMsgTeamStandby', {player: playerName, team: teamName, num: friendlyNum});
    confirmBtn = _t('participants.btnSubstStandby');
  } else {
    confirmTitle = _t('participants.declareAbsenceWO');
    confirmMsg = _t('participants.absenceMsgWO', {player: playerName, team: teamName, num: friendlyNum, opponent: opponent || _t('common.opponent')});
    confirmBtn = _t('participants.btnConfirmWO');
  }

  showConfirmDialog(confirmTitle, confirmMsg, function () {
    // v1.0.85-beta: RE-FETCH t fresh from AppStore. Entre o open do dialog e
    // o confirm do usuário, o onSnapshot do Firestore pode ter substituído
    // store.tournaments (toggle Presente do substituto, por exemplo, dispara
    // write→snapshot→replace em ~200ms). Closure t do escopo externo fica
    // detached — mutations não propagam pra store.tournaments[i] e o sync
    // grava o objeto NOVO sem nossas mutations.
    // Fix: pegar t mais recente AGORA, e re-derivar standby/checkedIn/etc.
    // a partir dele. Match e teamName ainda são válidos (referenciamos por
    // nome/id, não por ref de objeto).
    const _tFresh = window._findTournamentById(tId);
    if (_tFresh) t = _tFresh;
    // Re-derivar standby a partir do t fresh:
    const _spFresh = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
    const _wlFresh = Array.isArray(t.waitlist) ? t.waitlist : [];
    const _spNamesFresh = new Set(_spFresh.map(_getName));
    standby = _spFresh.slice();
    _wlFresh.forEach(w => { const wn = _getName(w); if (wn && !_spNamesFresh.has(wn)) standby.push(w); });
    // Re-find matchEntry no t fresh — match.p1/p2 podem ter mudado em snapshot
    const _allFreshWO = (typeof window._collectAllMatches === 'function')
      ? window._collectAllMatches(t)
      : (Array.isArray(t.matches) ? t.matches.slice() : []);
    matchEntry = null; matchIdx = -1; matchSide = null;
    _allFreshWO.forEach((m, mi) => {
      if (!m || m.winner) return;
      if (matchEntry) return;
      if (_normTeam(m.p1) === _teamNameNorm) { matchEntry = m; matchIdx = mi; matchSide = 'p1'; }
      else if (_normTeam(m.p2) === _teamNameNorm) { matchEntry = m; matchIdx = mi; matchSide = 'p2'; }
    });
    // Re-derivar partsArr (alias t.participants atualizado)
    partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    // Recompute derived state que depende de matchEntry/matchSide/standby
    hasStandby = standby.length > 0;
    friendlyNum = matchIdx >= 0 ? matchIdx + 1 : '?';
    opponentSide = matchSide === 'p1' ? 'p2' : 'p1';
    opponent = matchEntry ? matchEntry[opponentSide] : null;

    // v4.0.115: aplicação de W.O. canonizada no motor único window._applyWO E
    // BLINDADA pelo portão AppStore.mutate (Fase B): o motor é PURO (muta o `t`
    // passado, sem save), e mutate o re-aplica ATOMICAMENTE sobre o doc fresco da
    // transação → dois W.O. concorrentes não se sobrescrevem. O organizador é o
    // gatilho FINO: valida permissão + mostra o diálogo (acima). noSubBehavior
    // 'wait' = org espera substituto presente (lista não-vazia, ninguém presente);
    // o claim de jogador usa 'escalate'. Sub, escala, TBD-guard e parceiro→espera
    // vivem no motor. Outcome capturado da execução LOCAL (síncrona) pro toast.
    let _woRes;
    window.AppStore.mutate(tId, function (freshT) {
      const _r = window._applyWO(freshT, { absentName: playerName, scope: 'match', noSubBehavior: 'wait', woScope: freshT.woScope || 'individual' });
      if (_woRes === undefined) _woRes = _r; // 1ª exec (local) = outcome pra UI
    });
    if (_woRes === undefined) _woRes = { ok: false, outcome: 'noMatch' };
    if (typeof showNotification === 'function') {
      const _o = _woRes && _woRes.outcome;
      if (_woRes && _woRes.ok && _o === 'subbed') {
        (_woRes.subDetails || []).forEach(d => showNotification('✅ Substituição W.O.',
          `${d.sub} substituiu ${d.absent} — Jogo ${d.matchNum}`, 'success'));
      } else if (_o === 'waited') {
        showNotification('⚠️ Aguardando substituto presente',
          `Lista de espera tem ${_woRes.poolCount} pessoa(s), 0 presente. ${playerName} marcado ausente.`, 'warning');
      } else if (_o === 'waitedTBD') {
        showNotification('⚠️ Ausente registrado',
          `${playerName} marcado ausente. Adversário ainda não definido — W.O. será aplicado quando o jogo estiver completo.`, 'warning');
      } else if (_o === 'woApplied') {
        if (_woRes.partnerToWaitlist) showNotification('🔄 Parceiro na lista de espera',
          `${_woRes.partnerToWaitlist} foi adicionado à lista de espera para encontrar novo parceiro.`, 'info');
        showNotification('🏆 W.O. — oponente vence', `${_woRes.winner} vence por W.O.`, 'warning');
      } else {
        showNotification('⚠️ Sem jogo pendente', `${playerName} marcado ausente.`, 'warning');
      }
    }
    _reRenderParticipants();
    return;

  }, null, { type: 'warning', confirmText: confirmBtn, cancelText: _t('btn.waitMore') });
};

function renderParticipants(container, tournamentId) {
  if (window._autoKeepScroll) window._autoKeepScroll(); // v2.8.82: re-render por ação não pula scroll
  const tId = tournamentId;
  const t = tId && window.AppStore ? window._findTournamentById(tId) : null;

  var _t = window._t || function(k) { return k; };
  if (!t) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:3rem;"><h3>${_t('participants.notFound')}</h3><a href="#dashboard" class="btn btn-primary" style="margin-top:1rem;display:inline-block;">Dashboard</a></div>`;
    return;
  }

  // Pre-load player photos from Firestore (async update after render)
  if (typeof _preloadPlayerPhotos === 'function') {
    _preloadPlayerPhotos(t).then(function() {
      var pImgs = container.querySelectorAll('img[data-player-name]');
      pImgs.forEach(function(img) {
        var nm = img.getAttribute('data-player-name');
        var real = window._playerPhotoCache && window._playerPhotoCache[(nm || '').toLowerCase()];
        if (real && real.indexOf('dicebear.com') === -1 && img.src.indexOf('dicebear.com') !== -1) {
          var fb = 'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(nm) + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
          img.onerror = function() { this.onerror = null; this.src = fb; };
          img.src = real;
        }
      });
    }).catch(function() {});
  }

  const isOrg = typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t);
  const parts = typeof window._getCompetitors === 'function' ? window._getCompetitors(t) : (t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : []);

  let individualCount = 0;
  parts.forEach(p => {
    const pStr = window._pName(p);
    if (pStr.includes('/')) {
      individualCount += pStr.split('/').filter(n => n.trim().length > 0).length;
    } else {
      individualCount++;
    }
  });

  // Ordenar: Times primeiro, depois individuais
  parts.sort((a, b) => {
    const nameA = window._pName(a);
    const nameB = window._pName(b);
    const isTeamA = nameA.includes('/');
    const isTeamB = nameB.includes('/');
    if (isTeamA && !isTeamB) return -1;
    if (!isTeamA && isTeamB) return 1;
    return 0;
  });
  t.participants = parts;

  // v2.3.52: meta de perfil (gênero · nível · faixa etária) abaixo do nome no
  // card de inscritos — só pro ORGANIZADOR. Helpers compartilhados em store.js
  // (window._profileMetaSlots / _loadParticipantProfilesByName /
  // _patchProfileMetaSlots) pra a mesma lógica valer aqui e na seção "Inscritos
  // Confirmados" do detalhe do torneio (tournaments.js), sem divergir.
  function _metaSlotsFor(p, pName, isTeam, opts) {
    return (typeof window._profileMetaSlots === 'function')
      ? window._profileMetaSlots(p, pName, isTeam, t, isOrg, opts) : '';
  }
  // v2.4.70: hidrata os badges de meta (gênero/nível/idade) pra TODOS os inscritos,
  // não só o organizador — as categorias são informação pública da chave.
  if (typeof window._loadParticipantProfilesByName === 'function') {
    window._loadParticipantProfilesByName(parts).then(function () {
      if (typeof window._patchProfileMetaSlots === 'function') window._patchProfileMetaSlots(container, t);
    }).catch(function () {});
  }

  // ── Check-in logic ──
  const hasMatches = (t.matches && t.matches.length > 0) || (t.rounds && t.rounds.length > 0) || (t.groups && t.groups.length > 0);
  const drawDone = hasMatches || t.status === 'started' || t.status === 'in_progress';
  const canCheckIn = drawDone && !!t.tournamentStarted;

  // v2.1.86: CHAMADA pré-sorteio (roll-call). O organizador acessa os inscritos
  // ANTES do sorteio, marca quem está presente e decide o destino dos ausentes
  // (desclassificar ou enviar à lista de espera). O sorteio roda só entre os
  // presentes. Diferente do check-in pós-início (canCheckIn), aqui a presença é
  // marcada por ENTRY (time ou individual) — a unidade que entra no sorteio.
  const isFinished = t.status === 'finished';
  // v2.4.31: Liga com SORTEIO AUTOMÁTICO (drawManual !== true + data/periodicidade
  // configurada) NÃO tem chamada nem botão de sortear — o sorteio roda sozinho no
  // horário agendado. A chamada pré-sorteio (roll-call) só vale pro sorteio
  // MANUAL. Mesma regra de isLigaAutoDraw em tournaments.js:1508.
  const _isLigaAutoDraw = window._isLigaAutoDraw(t); // v2.7.5: canônico (store.js)
  const canRollCall = isOrg && !drawDone && !isFinished && !_isLigaAutoDraw;

  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  const checkedIn = t.checkedIn;
  const absent = t.absent;

  // v2.2.40: presença da CHAMADA continua visível DEPOIS do sorteio (antes de
  // iniciar). Quem foi marcado presente na chamada permanece presente na lista
  // de inscritos. Detecção é por ENTRY (nome direto) OU, sendo dupla "A / B",
  // por todos os membros — cobre duplas formadas no sorteio a partir de
  // indivíduos (o check-in foi feito nos nomes individuais).
  const _entryPresent = (name) => {
    if (!name) return false;
    if (window._idMapHas(t, absent, name)) return false;
    if (window._idMapHas(t, checkedIn, name)) return true;
    if (name.indexOf('/') !== -1) {
      const ms = name.split('/').map(s => s.trim()).filter(Boolean);
      if (ms.length >= 2 && ms.every(m => window._idMapHas(t, checkedIn, m))) return true;
    }
    return false;
  };
  const _entryAbsent = (name) => {
    if (!name) return false;
    if (window._idMapHas(t, absent, name)) return true;
    if (name.indexOf('/') !== -1) {
      const ms = name.split('/').map(s => s.trim()).filter(Boolean);
      if (ms.length >= 2 && ms.some(m => window._idMapHas(t, absent, m))) return true;
    }
    return false;
  };
  // Pós-sorteio antes de iniciar: presença visível em modo somente leitura
  // (a chamada já foi feita; alterações de presença vêm pelo check-in pós-início).
  // Só ativa se HOUVE chamada (algum check-in/ausência) — torneios que não usam
  // chamada mantêm a grade normal pós-sorteio, sem rótulos de presença.
  const _hasRollCallData = Object.keys(checkedIn).length > 0 || Object.keys(absent).length > 0;
  const postDrawPresence = isOrg && drawDone && !canCheckIn && !isFinished && _hasRollCallData;

  // v2.7.52: LISTA DE ESPERA CANÔNICA — _getWaitlist une os 3 storages
  // (waitlist + standbyParticipants + monarchWaitlist por categoria). Antes lia só
  // os 2 primeiros e a espera do Rei/Rainha (monarchWaitlist) sumia dos Inscritos.
  const _getStandbyName = p => window._pName(p);
  const standbyParts = (typeof window._getWaitlist === 'function')
    ? window._getWaitlist(t)
    : (Array.isArray(t.standbyParticipants) ? t.standbyParticipants.slice() : []);

  // Count stats (includes standby): 3 states — presente, ausente, sem confirmação
  let totalIndividuals = 0;
  let checkedCount = 0;
  let absentConfirmedCount = 0;
  // v3.0.x: conta PESSOAS distintas (dedup por nome) — solo que está nos inscritos E na
  // lista de espera conta 1×. E conta a espera SEMPRE que há sorteio (a grade pós-sorteio
  // é por indivíduo): antes só em canCheckIn, deixando o total por ENTRADA (53 duplas+solos)
  // em vez de por PESSOA (103). Mantém 103 consistente com os cards.
  const _countedNames = {};
  const countIndividuals = (arr) => {
    arr.forEach(p => {
      const pName = window._pName(p);
      const names = pName && pName.includes('/') ? pName.split('/').map(n => n.trim()).filter(Boolean) : (pName ? [pName] : []);
      names.forEach(nm => {
        const k = nm.toLowerCase();
        if (_countedNames[k]) return;
        _countedNames[k] = 1;
        totalIndividuals++;
        if (window._idMapHas(t, checkedIn, nm)) checkedCount++; else if (window._idMapHas(t, absent, nm)) absentConfirmedCount++;
      });
    });
  };
  countIndividuals(parts);
  if (drawDone) countIndividuals(standbyParts);

  // ── Contagem da CHAMADA (por entry: time/individual) — pré e pós sorteio ──
  let rcTotal = 0, rcPresent = 0, rcAbsent = 0;
  if (canRollCall || postDrawPresence) {
    parts.forEach(p => {
      const en = window._pName(p);
      if (!en) return;
      rcTotal++;
      if (_entryPresent(en)) rcPresent++;
      else if (_entryAbsent(en)) rcAbsent++;
    });
  }
  const rcPending = rcTotal - rcPresent - rcAbsent;

  const currentFilter = window._checkInFilter || 'all';

  // ── Build cards ──
  let cardsStr = '';
  let gridStyle = '';

  // v2.1.3: mapa nome→participante usado tanto no modo check-in quanto na GRADE
  // (foto/perfil do jogador). Antes era declarado só dentro do if (canCheckIn),
  // então a grade (else — torneio pré-sorteio OU sorteado-não-iniciado) dava
  // ReferenceError ao usá-lo → tela de Inscritos ficava preta. Agora vive no
  // escopo da função, disponível pros dois caminhos.
  const _nameToParticipant = {};
  (t.participants || []).forEach(function(p) {
    if (!p) return;
    const pn = window._pName(p);
    if (pn) _nameToParticipant[pn] = p;
    if (typeof p === 'object' && pn && pn.includes('/')) {
      pn.split('/').forEach(function(nm) { const t2 = nm.trim(); if (t2) _nameToParticipant[t2] = p; });
    }
  });

  if (drawDone) {
    // v3.0.x: SEMPRE que há sorteio (jogos criados) mostra a grade RICA canônica —
    // cada jogador com seu PRIMEIRO JOGO (parceiro + adversários + Jogo N) — mesmo
    // antes de "Iniciar Torneio". Antes exigia tournamentStarted (canCheckIn), então
    // sorteado-mas-não-iniciado caía na grade simples "Equipe Sorteada" sem o jogo.
    // ── Check-in mode: individual list with checkboxes ──
    // v2.7.28: card ÚNICO — pós-sorteio usa a MESMA grade rica do pré-sorteio.
    // v2.7.39: o card pós-sorteio é mais largo (jogo/parceiro/adversários) → grade
    // de cards LARGOS: 1 coluna no mobile, 2-3 nas telas maiores (não muitas estreitas).
    // min(100%,440px) garante 1 coluna sem overflow em telas estreitas.
    gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(min(100%, 440px), 1fr));gap:1rem;';

    // v0.17.36: lookup é POR NOME DE MEMBRO, não por team string. Quando
    // substituição W.O. acontece, o match é atualizado pra novo team
    // ("Bot 04 / [sub]") mas t.participants pode ficar fora de sincronia
    // por race condition ou string mismatch — o lookup por team name falha
    // e o card do parceiro perde matchNum/opponent. Indexando por member
    // direto, encontramos sempre o match atual independente do team string.
    // Bonus: memberToTeam dá o team string da MATCH (source of truth pra
    // composição atual), não do t.participants (pode ser stale).
    const memberToMatch = {};
    const memberToMatchDecided = {};
    const memberToOpponent = {};
    const memberToTeam = {};
    const _allForCheckin = (typeof window._collectAllMatches === 'function')
      ? window._collectAllMatches(t)
      : (Array.isArray(t.matches) ? t.matches.slice() : []);
    _allForCheckin.forEach((m, mi) => {
      if (!m) return;
      const num = mi + 1;
      ['p1', 'p2'].forEach(slot => {
        const teamStr = m[slot];
        if (!teamStr || teamStr === 'TBD' || teamStr === 'BYE') return;
        const oppSlot = slot === 'p1' ? 'p2' : 'p1';
        const opp = m[oppSlot];
        const oppValid = opp && opp !== 'TBD' && opp !== 'BYE' ? opp : null;
        const members = teamStr.includes('/') ? teamStr.split('/').map(n => n.trim()).filter(n => n) : [teamStr];
        members.forEach(memberName => {
          // Não sobrescrever — primeiro match em que o membro aparece vence.
          // (Caso edge: jogador em múltiplos matches no mesmo bracket — raro
          // mas possível em Liga/Rei-Rainha.)
          if (memberToMatch[memberName] != null) return;
          memberToMatch[memberName] = num;
          memberToMatchDecided[memberName] = !!m.winner;
          memberToOpponent[memberName] = oppValid;
          memberToTeam[memberName] = teamStr;
        });
      });
    });

    const allIndividuals = [];
    const _indivByName = {}; // v3.0.x: dedup — nome → objeto já adicionado
    // v0.17.35: jogadores em t.woHistory são pulados aqui — eles aparecem
    // só via card solo de orphan (loop abaixo). Evita aparecer 2x. O skip usa
    // window._woHistHas (uid-first) — woHistory é chaveado por uid (v3.0.78).
    parts.forEach((p, idx) => {
      const pName = typeof p === 'string' ? p : (p.displayName || p.name || p.email || _t('participants.participant', {n: idx + 1}));
      const isTeam = !!window._entryTeamMembers(p); // v3.0.x: time por estrutura (slots), não por '/'
      const namesToProcess = isTeam ? pName.split('/').map(n => n.trim()).filter(n => n) : [pName];
      namesToProcess.forEach(n => {
        if (window._woHistHas(t, n)) return; // skip W.O.'d member (uid-first) — solo card via woHistory loop
        if (_indivByName[n.toLowerCase()]) return; // já adicionado
        // v0.17.36: lookup por nome do membro (source of truth: match atual).
        // memberToTeam dá o team string da match — pode diferir de pName se
        // t.participants estiver stale após substituição.
        const matchNum = memberToMatch[n] || null;
        const matchDecided = !!memberToMatchDecided[n];
        const opponent = memberToOpponent[n] || null;
        const currentTeam = memberToTeam[n] || (isTeam ? pName : null);
        const _obj = { name: n, teamName: currentTeam, teamIdx: idx, matchNum, matchDecided, opponent };
        allIndividuals.push(_obj);
        _indivByName[n.toLowerCase()] = _obj;
      });
    });

    // Add standby participants — v3.0.x: DEDUP. Quem já está nos inscritos (ex.: solo que
    // não fechou dupla e foi pra espera) NÃO vira card novo; só ganha a marca de espera.
    standbyParts.forEach((p, idx) => {
      const pName = typeof p === 'string' ? p : (p.displayName || p.name || p.email || 'Espera ' + (idx + 1));
      const names = window._entryTeamMembers(p) || (pName ? [pName] : []); // v3.0.x: membros por estrutura, não por '/'
      names.forEach(n => {
        const ex = _indivByName[n.toLowerCase()];
        if (ex) { ex.isStandby = true; return; }
        const _obj = { name: n, teamName: pName.includes('/') ? pName : null, teamIdx: -1, matchNum: null, matchDecided: false, opponent: null, isStandby: true };
        allIndividuals.push(_obj);
        _indivByName[n.toLowerCase()] = _obj;
      });
    });

    // v0.17.34: Add W.O.'d orphan players (out of team, displayed solo with
    // note "Estava no Jogo N com [partner]"). Pedido do usuário: o jogador
    // que teve W.O. decretado deve sair do time e ter card solo mencionando
    // o jogo e parceiro original.
    if (t.woHistory && typeof t.woHistory === 'object') {
      Object.keys(t.woHistory).forEach(woKey => {
        if (!woKey) return;
        const meta = t.woHistory[woKey];
        if (!meta || typeof meta !== 'object') return;
        // woKey agora é o uid da pessoa W.O.'d → traduz pro nome de exibição
        // (meta.name é canônico; fallback uid→nome, senão a própria chave legada).
        const woName = window._woHistDisplayName(t, woKey, meta);
        allIndividuals.push({
          name: woName,
          teamName: null,
          teamIdx: -1,
          matchNum: null,
          matchDecided: false,
          opponent: null,
          isWOOrphan: true,
          woMeta: meta
        });
      });
    }

    // ── Deduplicate by name: if same person appears as individual AND in a team, keep team version ──
    const _seenNames = {};
    const _dedupedIndividuals = [];
    allIndividuals.forEach(ind => {
      const key = ind.name.toLowerCase().trim();
      if (_seenNames[key]) {
        // Duplicate — keep the one with more info (team > solo, matchNum > null)
        const prev = _seenNames[key];
        if (!prev.teamName && ind.teamName) {
          // Replace: new one has team info
          const prevIdx = _dedupedIndividuals.indexOf(prev);
          if (prevIdx !== -1) _dedupedIndividuals[prevIdx] = ind;
          _seenNames[key] = ind;
        } else if (!prev.matchNum && ind.matchNum) {
          const prevIdx = _dedupedIndividuals.indexOf(prev);
          if (prevIdx !== -1) _dedupedIndividuals[prevIdx] = ind;
          _seenNames[key] = ind;
        }
        // else keep previous (already has team/match info)
      } else {
        _seenNames[key] = ind;
        _dedupedIndividuals.push(ind);
      }
    });

    // v2.7.50: quem está na LISTA DE ESPERA mas TAMBÉM em t.participants → a dedup
    // acima mantém a versão sem isStandby (a de parts) e o card sai roxo, não âmbar.
    // Marca isStandby no resultado SE não estiver num jogo real (com matchNum já foi
    // promovido). Assim todo mundo da espera fica âmbar, esteja só na espera ou em ambos.
    (function () {
      var _sbSet = {};
      standbyParts.forEach(function (p) {
        var _m = window._entryTeamMembers(p); // v3.0.x: membros da dupla por estrutura, não por '/'
        if (_m) { _m.forEach(function (x) { var k = String(x).trim().toLowerCase(); if (k) _sbSet[k] = 1; }); return; }
        var n = String((typeof p === 'string') ? p : (p && (p.displayName || p.name || p.email)) || '');
        var k = n.trim().toLowerCase(); if (k) _sbSet[k] = 1;
      });
      _dedupedIndividuals.forEach(function (ind) {
        if (!ind.isStandby && !ind.matchNum && _sbSet[(ind.name || '').toLowerCase().trim()]) ind.isStandby = true;
      });
    })();

    // v1.0.83-beta: SAFETY NET — todo substituto (replacedBy em t.woHistory)
    // deve aparecer na lista geral em sua posição alfabética, mesmo se algum
    // path upstream esqueceu de adicioná-lo a t.participants. User: "na lista
    // geral dos inscritos ele deve se manter em sua posição sempre".
    // Cobre 4 cenários onde o substituto poderia sumir:
    //   (a) v1.0.78/v1.0.81 push falhou por race/string mismatch
    //   (b) entry foi pushed mas dedup descartou por algum bug não previsto
    //   (c) t.participants foi resetado por save/load do Firestore
    //   (d) caminho NOVO de substituição que esqueceu de fazer o push
    // Em qualquer caso, se woHistory.replacedBy diz "Bot 05 substituiu Bot 06",
    // Bot 05 PRECISA ter um card. Se não tem, criamos aqui.
    if (t.woHistory && typeof t.woHistory === 'object') {
      const _seenAfterDedup = new Set(_dedupedIndividuals.map(i => i.name.toLowerCase().trim()));
      Object.keys(t.woHistory).forEach(woName => {
        const meta = t.woHistory[woName];
        if (!meta || typeof meta !== 'object') return;
        const subName = meta.replacedBy;
        if (!subName) return;
        const subKey = subName.toLowerCase().trim();
        if (_seenAfterDedup.has(subKey)) return; // já tem card ✓
        // FALTANDO — adicionar card do substituto.
        const subTeam = memberToTeam[subName] || null;
        const subMatch = memberToMatch[subName] || null;
        const subOpp = memberToOpponent[subName] || null;
        const subDecided = !!memberToMatchDecided[subName];
        _dedupedIndividuals.push({
          name: subName,
          teamName: subTeam,
          teamIdx: -1,
          matchNum: subMatch,
          matchDecided: subDecided,
          opponent: subOpp,
          isStandby: false,
          _safetyAdded: true // marcador pra debug
        });
        _seenAfterDedup.add(subKey);
      });
    }

    // v0.17.38: lista regular = alfabético total (regulares + waitlist + W.O.
    // orphans intermixados). Pedido do usuário: "os da lista de espera deve
    // estar na lista de espera na ordem de chegada, mas devem aparecer
    // também na lista regular (para facilitar o registro da presença)."
    // O painel "Lista de Espera" em bracket.js continua em ordem de chegada
    // (timestamp de check-in ascendente). Aqui na lista regular, alfabético
    // facilita encontrar pelo nome ao marcar Presente.
    // v2.6.108: ordenação inicial = alfabética; o reordenar de verdade é DOM via
    // a barra canônica (_partApplyFilter lê o dropdown "Ordenar").
    _dedupedIndividuals.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    // v2.6.108: índice de inscrição (ordem em t.participants) por nome — pro sort "Inscrição".
    // v2.7.54: indexa por TODAS as formas do nome (cru displayName/name/email + formatado
    // via _pName) — senão um participante cujo ind.name é cru (ex.: telefone
    // "+5511981933576") não casa com a chave formatada e perde o número da ordem.
    // v2.7.92: ordem de inscrição CANÔNICA — helper único (uid-first; nome só fallback
    // pra participante SEM conta), inclui a lista de espera. Substitui o índice por-nome
    // antigo e alinha #participants aos cards do detalhe (mesmo número em todo lugar).
    var _enrollOrderMap = (typeof window._buildEnrollOrderMap === 'function') ? window._buildEnrollOrderMap(t) : {};

    // v1.0.83-beta: diagnóstico observável — se Bot 05 ainda sumir, podemos
    // inspecionar window._debugLastParticipantsRender no console pra ver
    // exatamente o que aconteceu.
    try {
      window._debugLastParticipantsRender = {
        tournamentId: tId,
        version: window.SCOREPLACE_VERSION,
        at: new Date().toISOString(),
        partsCount: parts.length,
        partsNames: parts.map(p => window._pName(p, '?')),
        standbyCount: standbyParts.length,
        standbyNames: standbyParts.map(p => window._pName(p, '?')),
        woHistory: t.woHistory ? Object.keys(t.woHistory).map(k => ({
          woKey: k, // uid (ou nome legado)
          woName: window._woHistDisplayName(t, k, t.woHistory[k]),
          replacedBy: t.woHistory[k] && t.woHistory[k].replacedBy,
          partner: t.woHistory[k] && t.woHistory[k].partner,
          matchNum: t.woHistory[k] && t.woHistory[k].matchNum
        })) : [],
        dedupedCount: _dedupedIndividuals.length,
        dedupedNames: _dedupedIndividuals.map(i => i.name + (i._safetyAdded ? ' [safety]' : '') + (i.isWOOrphan ? ' [orphan]' : '') + (i.isStandby ? ' [standby]' : '')),
        currentFilter
      };
    } catch (_e) {}

    // v2.1.3: _nameToParticipant agora é definido no escopo da função (acima).
    cardsStr = _dedupedIndividuals.map((ind) => {
      const mc = window._idMapHas(t, checkedIn, ind.name);
      // v0.17.34: W.O. orphan = jogador que teve W.O. decretado e foi
      // substituído. Foi removido do time, agora é solo com nota.
      const isWOOrphan = !!ind.isWOOrphan;
      const isAbsent = isWOOrphan ? true : window._idMapHas(t, absent, ind.name);
      const isPending = !mc && !isAbsent;
      if (currentFilter === 'present' && !mc) return '';
      if (currentFilter === 'absent' && !isAbsent) return '';
      if (currentFilter === 'pending' && !isPending) return '';

      // v3.0.x: escape robusto — antes só `'`. Em onclick="...('${safeName}')" um `"`
      // no nome fechava o atributo (XSS/quebra). `\`→`\\` e `'`→`\'` (string JS), `"`→&quot; (atributo).
      const safeName = ind.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      // v2.7.37: estrela do organizador (sempre) + pin no topo (data-part-org).
      const _isOrgPC = (typeof window._isOrgPlayer === 'function') && window._isOrgPlayer(t, ind.name, _nameToParticipant[ind.name]);
      const _orgStarC = _isOrgPC ? '<span title="Organizador" aria-label="Organizador" style="flex-shrink:0;color:#fbbf24;font-size:0.9rem;line-height:1;">⭐</span>' : '';

      // Build sub-info with presence dots (3 states: green=presente, red=ausente, gray=aguardando)
      const dotHtml = (name) => {
        const p = window._idMapHas(t, checkedIn, name);
        const a = window._idMapHas(t, absent, name);
        const dotColor = p ? '#10b981' : a ? '#ef4444' : '#64748b';
        const textColor = p ? '#4ade80' : a ? '#f87171' : '#94a3b8';
        return `<span style="display:inline-flex;align-items:center;gap:2px;"><span style="width:5px;height:5px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0;"></span><span style="font-size:0.66rem;color:${textColor};">${name}</span></span>`;
      };

      // Standby puro (ainda não substituiu ninguém) = sem parceiro/jogo/adversário
      const isStandbyPure = !!ind.isStandby && !ind.matchNum;

      // v1.0.84-beta: ordem padronizada — sempre p1 em cima, p2 embaixo,
      // independente de qual time é o do jogador. Antes mostrava o time do
      // jogador em cima e o oponente embaixo, gerando "inversão" do mesmo
      // jogo entre cards. User: 'no card do bot02 consta bot02/bot31 vs
      // bot27/bot04; mas no card do bot04 consta bot27/bot04 vs bot02/bot31
      // (invertido). Vamos escolher uma forma de mostrar e mostrar sempre
      // na mesma ordem em todos os cards dos participantes'.
      // Cores das bolinhas continuam refletindo presença individual, então
      // o jogador identifica seu time pelos nomes/dots — só a posição fica
      // estável.
      const _matchObj = (ind.matchNum && Array.isArray(_allForCheckin)) ? _allForCheckin[ind.matchNum - 1] : null;
      const _p1Team = _matchObj && _matchObj.p1 && _matchObj.p1 !== 'TBD' && _matchObj.p1 !== 'BYE' ? _matchObj.p1 : null;
      const _p2Team = _matchObj && _matchObj.p2 && _matchObj.p2 !== 'TBD' && _matchObj.p2 !== 'BYE' ? _matchObj.p2 : null;

      // v0.17.35: oculta membros W.O.'d do team line (se algum) — eles
      // aparecem como cards solo separados, não devem poluir time do parceiro.
      const _renderTeamDots = (teamStr) => {
        if (!teamStr) return '';
        const members = teamStr.includes('/') ? teamStr.split('/').map(n => n.trim()).filter(n => n).filter(n => !window._woHistHas(t, n)) : [teamStr];
        return members.map(n => dotHtml(n)).join('<span style="color:rgba(255,255,255,0.15);margin:0 2px;">/</span>');
      };

      // Top line = p1, bottom line = p2. Standby puro continua sem times.
      let teamLine = '';
      let opponentLine = '';
      if (!isStandbyPure) {
        teamLine = _renderTeamDots(_p1Team);
        opponentLine = _renderTeamDots(_p2Team);
        // Fallback pra cards sem matchObj resolvido (ex: ind.teamName setado
        // mas matchNum null por algum edge case): usa ind.teamName/ind.opponent
        // como antes pra não regredir o display.
        if (!teamLine && !opponentLine && ind.teamName) {
          teamLine = _renderTeamDots(ind.teamName);
          opponentLine = ind.opponent ? _renderTeamDots(ind.opponent) : '';
        }
      }

      const matchLabel = (!isStandbyPure && ind.matchNum) ? `Jogo ${ind.matchNum}` : '';
      const standbyLabel = ind.isStandby ? '<span style="font-weight:700;color:#fbbf24;opacity:0.8;">Lista de Espera</span>' : '';

      // Matchup cells (used in the card-level grid, where the player name sits
      // on the same row as team 1 / "vs"). Team 2 lives inside teamsCell on its
      // own row, so the card becomes 2 lines total (name+team1+vs / team2).
      const jogoCell = matchLabel
        ? `<span style="font-weight:700;color:var(--text-muted);opacity:0.6;font-size:0.72rem;white-space:nowrap;align-self:center;">${matchLabel}</span>`
        : '';
      const vsCell = (teamLine && opponentLine)
        ? `<span style="font-size:0.62rem;font-weight:700;color:rgba(255,255,255,0.45);letter-spacing:1px;text-transform:uppercase;font-style:italic;align-self:start;padding-top:1px;">vs</span>`
        : '';
      let teamsCell = '';
      if (teamLine && opponentLine) {
        teamsCell = `<div style="display:flex;flex-direction:column;gap:2px;line-height:1.3;font-size:0.72rem;color:var(--text-muted);opacity:0.95;min-width:0;"><div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">${teamLine}</div><div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">${opponentLine}</div></div>`;
      } else if (teamLine) {
        teamsCell = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;line-height:1.3;font-size:0.72rem;color:var(--text-muted);opacity:0.95;min-width:0;">${teamLine}</div>`;
      } else if (opponentLine) {
        teamsCell = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;line-height:1.3;font-size:0.72rem;color:var(--text-muted);opacity:0.95;min-width:0;">${opponentLine}</div>`;
      }
      const standbyHeader = (ind.isStandby && !matchLabel && standbyLabel)
        ? `<div style="font-size:0.7rem;margin-top:2px;">${standbyLabel}</div>`
        : '';
      const hasMatchup = !!(jogoCell || teamsCell || vsCell);

      // W.O. check
      const woMatch = ind.matchNum && t.matches ? t.matches[ind.matchNum - 1] : null;
      const isWO = woMatch && woMatch.wo && woMatch.winner && woMatch.winner !== (ind.teamName || ind.name);

      const isStandby = !!ind.isStandby;

      // Action buttons — toggle Presente + botão W.O.
      const canAct = isStandby ? true : (!ind.matchDecided && !isWO);

      // Toggle "Presente" — sempre renderizado para todo participante,
      // independente de o jogo já ter resultado ou W.O. (check-in é independente do resultado)
      // v2.2.8: standby players marcados como ausentes ficam com toggle desabilitado — usar "Reverter"
      const isAbsentStandby = isStandby && isAbsent;
      // v2.7.42: switch e palavra SEPARADOS (pra montar "Ausente [toggle] W.O." numa linha).
      const _toggleSwitch = `<label class="toggle-switch toggle-sm" style="--toggle-on-bg:#10b981;--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:#10b981;flex-shrink:0;${isAbsentStandby ? 'opacity:0.35;cursor:not-allowed;pointer-events:none;' : ''}" onclick="event.stopPropagation();"><input type="checkbox" ${mc ? 'checked' : ''} ${isAbsentStandby ? 'disabled' : `onclick="event.stopPropagation(); window._toggleCheckIn('${tId}', '${safeName}');"`}><span class="toggle-slider"></span></label>`;
      const _presenceWord = `<span style="font-size:0.68rem;font-weight:700;color:${mc ? '#4ade80' : '#94a3b8'};white-space:nowrap;">${mc ? 'Presente' : 'Ausente'}</span>`;

      // W.O. button — marca W.O. / reverte W.O.
      // Standby players use simple toggle; active participants always go through the
      // dialog (_declareAbsent uses _collectAllMatches which is more robust than ind.matchNum).
      const woAction = isAbsent
        ? `window._markAbsent('${tId}', '${safeName}')`
        : (isStandby
          ? `window._markAbsent('${tId}', '${safeName}')`
          : `window._declareAbsent('${tId}', '${safeName}')`);
      const woLabel = isAbsent ? 'Reverter' : 'W.O.';
      // Regra simples: botão W.O./Reverter aparece para todo participante que
      // NÃO está com o toggle Presente ativado (!mc). Quando isAbsent=true →
      // mostra "Reverter"; quando !mc && !isAbsent → mostra "W.O.".
      // Remover a restrição !isWO que escondia o botão para jogadores cujo
      // jogo já foi resolvido por W.O. mas que ainda não estão marcados ausentes.
      const _showWoBtn = isOrg && !mc;
      const woBtn = _showWoBtn
        ? window._woBtnHtml('event.stopPropagation(); ' + woAction, !isAbsent, { label: woLabel, size: 'btn-micro', fontSize: '0.7rem', extraStyle: 'min-height:0;height:24px;line-height:1;padding:0 12px;' })
        : '';
      // v2.2.0: badge W.O. só aparece quando ESTE jogador está em t.absent —
      // não deve aparecer no parceiro presente nem em quem simplesmente não
      // fez check-in. A partida ter wo:true é info de resultado do jogo, não
      // de status individual do jogador.
      const woBadge = isAbsent ? `<div style="font-size:0.66rem;font-weight:800;height:22px;line-height:22px;padding:0 10px;border-radius:7px;background:rgba(239,68,68,0.15);color:#f87171;flex-shrink:0;border:1px solid rgba(239,68,68,0.3);">W.O.</div>` : '';

      // Colors: 3 estados + standby amarelo
      // v2.2.0: isWO (match-level) removido dos visuais — só isAbsent torna o card
      // vermelho/riscado. Antes, todo jogador no lado perdedor de um W.O. ficava
      // vermelho, mesmo estando Presente ou apenas sem check-in.
      const presenceDotColor = mc ? '#10b981' : isAbsent ? '#ef4444' : '#64748b';
      const presenceDot = `<span style="width:8px;height:8px;border-radius:50%;background:${presenceDotColor};display:inline-block;flex-shrink:0;"></span>`;
      const nameColor = isStandby ? '#fbbf24' : (mc ? '#4ade80' : isAbsent ? '#f87171' : 'var(--text-bright)');
      const cardBg = isStandby
        ? (mc ? 'rgba(251,191,36,0.12)' : isAbsent ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.06)')
        : (mc ? 'rgba(16,185,129,0.12)' : isAbsent ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)');
      const cardBorder = isStandby
        ? (mc ? 'rgba(251,191,36,0.3)' : isAbsent ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.15)')
        : (mc ? 'rgba(16,185,129,0.3)' : isAbsent ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)');

      // VIP check — uid-aware (v3.0.78: t.vips é uid-keyed desde v3.0.74; ler
      // direto por nome (vipMap[ind.name]) MISSAVA a chave-uid → tag VIP sumia).
      // _idMapHas resolve o uid do indivíduo; _entryHasVip cobre a dupla (string).
      const isVipPlayer = window._idMapHas(t, t.vips || {}, ind.name) ||
        (ind.teamName ? window._entryHasVip(t, ind.teamName) : false);
      const vipTag = isVipPlayer ? '<span style="background:linear-gradient(135deg,#eab308,#fbbf24);color:#1a1a2e;font-size:0.55rem;font-weight:900;padding:1px 5px;border-radius:3px;letter-spacing:0.5px;flex-shrink:0;">💎 VIP</span>' : '';
      // v2.7.40: botão VIP ao lado do W.O. — SÓ pro organizador (toggle marca/desmarca).
      const _vipBtnC = isOrg ? `<button type="button" class="btn btn-micro" onclick="event.stopPropagation();window._toggleVip('${tId}','${safeName}')" title="${isVipPlayer ? 'Remover VIP' : 'Marcar VIP'}" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.66rem;font-weight:800;border-radius:7px;flex-shrink:0;background:${isVipPlayer ? 'linear-gradient(135deg,rgba(234,179,8,0.4),rgba(251,191,36,0.28))' : 'rgba(234,179,8,0.1)'};color:${isVipPlayer ? '#fbbf24' : '#d4a72a'};border:1px ${isVipPlayer ? 'solid rgba(251,191,36,0.65)' : 'dashed rgba(234,179,8,0.4)'};">💎 VIP</button>` : '';
      // v2.7.54: botão de REMOVER inscrito (só organizador) — poder de tirar qualquer
      // jogador do card, inclusive os da lista de espera. A remoção (tournaments.js)
      // tira de participants E dos storages da espera, casando nome cru/formatado.
      const _delBtnC = isOrg ? `<button type="button" class="btn btn-micro" onclick="event.stopPropagation();window.removeParticipantFunction('${tId}','${safeName}')" title="Remover inscrito" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.7rem;font-weight:800;border-radius:7px;flex-shrink:0;background:rgba(239,68,68,0.1);color:#ef4444;border:1px dashed rgba(239,68,68,0.5);">🗑️</button>` : '';

      const _safeName = (ind.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      const _pSeed = encodeURIComponent(ind.name);
      const _pCached = (window._playerPhotoCache && window._playerPhotoCache[ind.name.toLowerCase()] && window._playerPhotoCache[ind.name.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[ind.name.toLowerCase()] : '';
      const _pInitials = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _pSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
      const _pAvatar = _pCached || _pInitials;
      const _pAvatarErr = `onerror="this.onerror=null;this.src='${_pInitials}'"` ;

      // "Jogo N" color reflects match-level attendance: green when all players present, amber when partial, muted when none.
      let _jogoColor = 'var(--text-muted)';
      let _jogoOpacity = '0.55';
      let _jogoWeight = '700';
      if (matchLabel && ind.matchNum && !isStandbyPure) {
        const _mm = [];
        if (ind.teamName) ind.teamName.split(/\s*\/\s*/).forEach(n => { if (n && n.trim()) _mm.push(n.trim()); });
        else if (ind.name) _mm.push(ind.name);
        if (ind.opponent) ind.opponent.split(/\s*\/\s*/).forEach(n => { if (n && n.trim()) _mm.push(n.trim()); });
        const _uniq = Array.from(new Set(_mm));
        if (_uniq.length > 0) {
          const _presentCount = _uniq.filter(n => window._idMapHas(t, checkedIn, n)).length;
          if (_presentCount === _uniq.length) { _jogoColor = '#4ade80'; _jogoOpacity = '0.95'; _jogoWeight = '800'; }
          else if (_presentCount > 0) { _jogoColor = '#fbbf24'; _jogoOpacity = '0.95'; _jogoWeight = '800'; }
        }
      }
      const jogoInline = matchLabel
        ? `<span style="font-weight:${_jogoWeight};color:${_jogoColor};opacity:${_jogoOpacity};font-size:0.72rem;white-space:nowrap;margin-left:6px;">${matchLabel}</span>`
        : '';
      // v2.2.0: strikethrough só quando isAbsent (player em t.absent) —
      // não quando isWO (match-level). Parceiro presente não deve ter riscado.
      // v2.7.39: NOME COMPLETO — nunca trunca (quebra linha se preciso). Jogo N saiu
      // da linha do nome e foi pra coluna da direita (não disputa espaço com o nome).
      const _nameRow = `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0;"><span style="font-weight:600;font-size:0.92rem;color:${nameColor};line-height:1.18;word-break:break-word;${isAbsent ? 'text-decoration:line-through;text-decoration-color:rgba(248,113,113,0.4);' : ''}${isOrg ? 'cursor:text;' : ''}" ${isOrg ? `onclick="event.stopPropagation();window._editParticipantName('${tId}','${safeName}')" title="Clique para editar"` : ''}>${_safeName}</span>${_orgStarC}${isStandby ? presenceDot : ''}</div>`;
      const _jogoTop = matchLabel ? `<span style="font-weight:${_jogoWeight};color:${_jogoColor};opacity:${_jogoOpacity};font-size:0.72rem;white-space:nowrap;">${matchLabel}</span>` : '';
      // Faixa do jogo FULL-WIDTH abaixo do header (libera largura pros nomes dos times).
      let _matchStrip = '';
      if (isWOOrphan && ind.woMeta) {
        const _woNameSafe = (ind.woMeta.partner || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const _woMatchNum = ind.woMeta.matchNum || '?';
        _matchStrip = `<div style="font-size:0.68rem;color:#f87171;margin-top:6px;font-weight:600;">❌ W.O. — Estava no Jogo ${_woMatchNum}${_woNameSafe ? ` com <span style="color:#94a3b8;font-weight:500;">${_woNameSafe}</span>` : ''}</div>`;
      } else if (teamLine || opponentLine) {
        // v2.7.43: "vs" na linha do 1º time, "Jogo N" alinhado à direita na linha do 2º.
        var _jR = matchLabel ? `<span style="font-weight:${_jogoWeight};color:${_jogoColor};opacity:${_jogoOpacity};font-size:0.72rem;white-space:nowrap;flex-shrink:0;">${matchLabel}</span>` : '';
        var _row = function (line, right) {
          // v2.7.44: font-size + line-height tight no container (antes herdava 16px →
          // caixas de linha de ~25px e os times ficavam longe). Volta à distância apertada.
          return `<div style="display:flex;align-items:center;gap:8px;font-size:0.66rem;line-height:1.2;"><div style="flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:3px 6px;">${line || ''}</div><div style="flex-shrink:0;">${right || ''}</div></div>`;
        };
        _matchStrip = (teamLine && opponentLine)
          ? `<div style="margin-top:7px;display:flex;flex-direction:column;gap:2px;">${_row(teamLine, vsCell || '')}${_row(opponentLine, _jR)}</div>`
          : `<div style="margin-top:7px;">${_row(teamLine || opponentLine, _jR)}</div>`;
      }
      // v2.1.96: todos os W.O. devem ter Reverter disponível — sem restrição
      // por status do jogo. User: "aqui todos os WO deveriam estar com o
      // reverter disponível. Alguns estão sem o reverter disponível."
      const _showActions = true;

      // Skill category badge/dropdown for check-in mode
      const _ciSkillCats = t.skillCategories || [];
      let _ciSkillHtml = '';
      let _ciCurrentSkill = ''; // v2.7.28: hoisted — usado fora do bloco (data-part-skill); antes dava ReferenceError
      if (_ciSkillCats.length > 0) {
        const _ciPObj = _nameToParticipant[ind.name];
        const _ciCatStr = (_ciPObj && typeof _ciPObj === 'object') ? (_ciPObj.category || '') : '';
        for (let _si = 0; _si < _ciSkillCats.length; _si++) {
          const _sk = _ciSkillCats[_si];
          if (_ciCatStr === _sk || _ciCatStr.endsWith(' ' + _sk)) { _ciCurrentSkill = _sk; break; }
        }
        const _ciNameSafe = ind.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        if (isOrg) {
          // v2.3.51: dropdown de atribuição de nível pelo org. O nível também
          // aparece no badge de meta (gênero · nível · idade) abaixo do nome —
          // não duplica como pill read-only pra não-org.
          const _ciOpts = _ciSkillCats.map(sk => `<option value="${sk}" ${_ciCurrentSkill === sk ? 'selected' : ''}>${sk}</option>`).join('');
          _ciSkillHtml = `<select onchange="event.stopPropagation();window._setParticipantSkillCategory('${tId}','${_ciNameSafe}',this.value)" onclick="event.stopPropagation()" style="font-size:0.68rem;font-weight:700;padding:1px 4px;border-radius:6px;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);cursor:pointer;margin-top:0;"><option value="" ${!_ciCurrentSkill ? 'selected' : ''}>— nível</option>${_ciOpts}</select>`;
        }
      }

      const _ciPart = _nameToParticipant[ind.name];
      const _ciInactive = (t.allowSelfDeactivation !== false && _ciPart && _ciPart.ligaActive === false) ? '1' : '0';
      const _ciGender = (typeof window._canonGender === 'function') ? window._canonGender(_ciPart && _ciPart.gender) : 'none';
      const _ciSkillVal = _ciCurrentSkill || 'none';
      const _ciEnrollNum = (typeof window._enrollNumber === 'function') ? window._enrollNumber(_enrollOrderMap, _ciPart || (ind && ind.name) || '') : '';
      const _ciOrder = (_ciEnrollNum !== '' && _ciEnrollNum != null) ? (_ciEnrollNum - 1) : 9999;
      // v2.7.28: CARD ÚNICO — mesmo shell rico do pré-sorteio (gradiente roxo/VIP +
      // nº de inscrição em marca d'água), mas com o jogo/parceiro/adversários
      // (infoBlock) + toggle Presente + W.O. dentro dele. Presença vira borda/glow
      // (verde=presente, vermelho=ausente, âmbar=lista de espera) — sem perder a
      // leitura rápida de quem está presente.
      // v2.7.45: cor do CARD por status. VIP DOURADO sempre tem prioridade; senão
      // presente=verde, W.O.(ausente declarado)=vermelho, lista de espera=âmbar,
      // aguardando=roxo (mantido). A borda acompanha o status (mesmo no VIP dourado).
      // v2.7.52: LISTA DE ESPERA tem prioridade na cor — quem está na espera é SEMPRE
      // âmbar, mesmo presente/ausente (antes presente pintava verde por cima). VIP
      // dourado só vence pra VIP de verdade (isVipPlayer).
      const _statusGrad = isStandby ? 'linear-gradient(135deg, rgba(146,64,14,0.58) 0%, rgba(245,158,11,0.45) 100%)'
        : mc ? 'linear-gradient(135deg, rgba(6,95,70,0.6) 0%, rgba(16,185,129,0.5) 100%)'
        : isAbsent ? 'linear-gradient(135deg, rgba(127,29,29,0.62) 0%, rgba(220,38,38,0.5) 100%)'
        : 'linear-gradient(135deg, rgba(67,56,202,0.6) 0%, rgba(99,102,241,0.6) 100%)';
      const _riGrad = (isVipPlayer && !isStandby)
        ? 'linear-gradient(135deg, rgba(161,98,7,0.6) 0%, rgba(234,179,8,0.45) 100%)'
        : _statusGrad;
      const _riBorder = isStandby ? '2px solid rgba(251,191,36,0.6)'
        : mc ? '2px solid rgba(16,185,129,0.7)'
        : isAbsent ? '2px solid rgba(239,68,68,0.6)'
        : isVipPlayer ? '2px solid rgba(251,191,36,0.6)'
        : '1px solid rgba(99,102,241,0.5)';
      const _riGlow = mc ? 'box-shadow:0 0 0 1px rgba(16,185,129,0.45),0 4px 10px rgba(0,0,0,0.12);' : 'box-shadow:0 4px 10px rgba(0,0,0,0.1);';
      const _riDim = isAbsent ? 'opacity:0.62;' : (isWOOrphan ? 'opacity:0.75;' : '');
      const _riNum = (typeof _ciOrder === 'number' && _ciOrder !== 9999) ? (_ciOrder + 1) : '';
      const _riWoBadge = isWOOrphan ? '<div style="font-size:0.64rem;font-weight:800;padding:3px 9px;border-radius:8px;background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.35);">W.O.</div>' : woBadge;
      return `
        <div class="participant-card" data-part-card="1" data-part-org="${_isOrgPC ? '1' : '0'}" data-part-vip="${isVipPlayer ? '1' : '0'}" data-part-standby="${isStandby ? '1' : '0'}" data-part-name="${(ind.name || '').toLowerCase().replace(/"/g, '&quot;')}" data-part-inactive="${_ciInactive}" data-part-gender="${_ciGender}" data-part-skill="${String(_ciSkillVal).replace(/"/g, '&quot;')}" data-part-order="${_ciOrder}" style="background:${_riGrad};border:${_riBorder};border-radius:12px;padding:12px;position:relative;overflow:hidden;${_riGlow}${_riDim}transition:all 0.2s;">
            ${(typeof window._enrollNumberBadge === 'function') ? window._enrollNumberBadge(_riNum, 'right') : ''}
            <div style="position:relative;z-index:1;">
                <!-- HEADER: avatar + nome + estrela (Jogo N foi pro match strip, na linha do 2º time) -->
                <div style="display:flex;align-items:center;gap:8px;">
                    <img src="${_pAvatar}" ${_pAvatarErr} data-player-name="${_safeName}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${mc ? 'rgba(16,185,129,0.5)' : isAbsent ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.18)'};${isWOOrphan ? 'filter:grayscale(0.5);' : ''}" />
                    <div style="flex:1;min-width:0;">${standbyHeader}${_nameRow}</div>
                </div>
                <!-- Meta: VIP + categorias + nível (à esquerda). O 🗑️ saiu daqui — -->
                <!-- vai pra linha de ação canônica abaixo (junto da presença). -->
                <div style="margin-top:6px;display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;" onclick="event.stopPropagation();">${_vipBtnC}${_metaSlotsFor(_nameToParticipant[ind.name], ind.name, false, {inline:true})}${_ciSkillHtml}</div>
                <!-- CARD CANÔNICO: ação (Presente/Ausente · toggle · W.O. · 🗑️) à direita. -->
                ${window._inscritoActionRow('', _presenceWord + (isAbsent ? _riWoBadge : _toggleSwitch) + woBtn, _delBtnC)}
                ${_matchStrip}
            </div>
        </div>`;
    }).join('');

  } else {
    // ── Normal mode: team cards with drag/split/delete ──
    gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:1rem;';

    // v2.7.49: inclui os da LISTA DE ESPERA no grid pré-sorteio (antes só apareciam
    // no painel de Lista de Espera, sumindo dos Inscritos). Intercalados, com badge
    // âmbar "Lista de Espera" e SEM as ações de inscrito (gestão é no painel).
    const _gridSeen = {};
    parts.forEach(function (p) { var n = window._pName(p); if (n) _gridSeen[n.toLowerCase().trim()] = 1; });
    const _gridParts = parts.slice();
    standbyParts.forEach(function (p) {
      var n = window._pName(p); if (!n) return; var k = n.toLowerCase().trim();
      if (_gridSeen[k]) return; _gridSeen[k] = 1;
      var o = (p && typeof p === 'object') ? Object.assign({}, p) : { displayName: String(p), name: String(p) };
      o._isStandbyEntry = true; _gridParts.push(o);
    });
    // v2.7.52: quem está em inscritos E na espera também é espera (âmbar) — sem
    // mutar o objeto de parts; o card consulta este set.
    const _gridWaitSet = (typeof window._waitlistNameSet === 'function') ? window._waitlistNameSet(t) : {};

    cardsStr = _gridParts.map((p, idx) => {
      const pName = typeof p === 'string' ? p : (p.displayName || p.name || p.email || _t('participants.participant', {n: idx + 1}));
      const isTeam = !!window._entryTeamMembers(p); // v3.0.x: time por estrutura (slots), não por '/'
      // v2.7.37: estrela do organizador (sempre visível) + pin no topo (data-part-org).
      const _isOrgP = (typeof window._isOrgPlayer === 'function') && window._isOrgPlayer(t, pName, p);
      const _orgStar = _isOrgP ? '<span title="Organizador" aria-label="Organizador" style="flex-shrink:0;color:#fbbf24;font-size:0.95rem;line-height:1;">⭐</span>' : '';

      // v2.1.86/v2.2.40: estado da CHAMADA (por entry) + filtro presente/ausente/aguardando.
      // Vale na chamada pré-sorteio (interativa) e pós-sorteio antes de iniciar (leitura).
      const _showPres = canRollCall || postDrawPresence;
      const rcMc = _showPres && _entryPresent(window._pName(p)); // v3.0.x: nome canônico (dupla="A / B") pro check de presença
      const rcAbs = _showPres && !rcMc && _entryAbsent(window._pName(p));
      const rcPend = _showPres && !rcMc && !rcAbs;
      if (_showPres) {
        if (currentFilter === 'present' && !rcMc) return '';
        if (currentFilter === 'absent' && !rcAbs) return '';
        if (currentFilter === 'pending' && !rcPend) return '';
      }

      const _isStandbyEntry = !!(p && typeof p === 'object' && p._isStandbyEntry) || !!_gridWaitSet[(pName || '').toLowerCase().trim()];
      const isVipEarly = window._entryHasVip(t, p || pName);
      let cardStyle = '';
      if (isVipEarly) {
        cardStyle = 'background: linear-gradient(135deg, rgba(161,98,7,0.5) 0%, rgba(234,179,8,0.35) 100%); border: 2px solid rgba(251,191,36,0.7); box-shadow: 0 0 12px rgba(251,191,36,0.15);';
      } else if (_isStandbyEntry) {
        cardStyle = 'background: linear-gradient(135deg, rgba(146,64,14,0.55) 0%, rgba(245,158,11,0.42) 100%); border: 2px solid rgba(251,191,36,0.55);';
      } else if (isTeam) {
        cardStyle = 'background: linear-gradient(135deg, rgba(15, 118, 110, 0.6) 0%, rgba(20, 184, 166, 0.6) 100%); border: 1px solid rgba(20, 184, 166, 0.5);';
      } else {
        cardStyle = 'background: linear-gradient(135deg, rgba(67, 56, 202, 0.6) 0%, rgba(99, 102, 241, 0.6) 100%); border: 1px solid rgba(99, 102, 241, 0.5);';
      }

      let pNameHtml = '';
      if (isTeam) {
        pNameHtml = pName.split('/').map((n, i) => {
          const _nm = n.trim();
          const _nmSafe = _nm.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const _mSeed = encodeURIComponent(_nm);
          const _mCached = (window._playerPhotoCache && window._playerPhotoCache[_nm.toLowerCase()] && window._playerPhotoCache[_nm.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[_nm.toLowerCase()] : '';
          const _mInitials = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _mSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
          const _mPhoto = _mCached || _mInitials;
          const _mErr = `onerror="this.onerror=null;this.src='${_mInitials}'"`;
          const _nmH = window._safeHtml(_nm);
          const _mPart = _nameToParticipant && _nameToParticipant[_nm];
          const _mUid  = (_mPart && typeof _mPart === 'object') ? (_mPart.uid || '') : '';
          const _mUidJs = _mUid ? (',{uid:\'' + _mUid + '\',tournamentId:\'' + t.id + '\'}') : (',{tournamentId:\'' + t.id + '\'}');
          const _editAttr = isOrg ? `onclick="event.stopPropagation();window._editParticipantName('${t.id}','${_nmSafe}')" title="Clique para editar" style="font-weight:700;font-size:0.95rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text;"` : `style="font-weight:700;font-size:0.95rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;" onclick="event.stopPropagation();if(typeof window._openPlayerProfile==='function')window._openPlayerProfile('${_nmSafe}'${_mUidJs});else if(typeof window._showPlayerStats==='function')window._showPlayerStats('${_nmSafe}')" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Ver perfil de ${_nmH}"`;
          return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;overflow:hidden;"><img src="${_mPhoto}" ${_mErr} data-player-name="${_nmH}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span ${_editAttr}>${_nmH}</span></div>`;
        }).join('') + (_orgStar ? `<div style="margin-top:2px;">${_orgStar}</div>` : '');
      } else {
        const _pSafe = pName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const _pSeedN = encodeURIComponent(pName);
        const _pCachedN = (window._playerPhotoCache && window._playerPhotoCache[pName.toLowerCase()] && window._playerPhotoCache[pName.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[pName.toLowerCase()] : '';
        const _pInitialsN = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _pSeedN + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
        const _pPhotoN = _pCachedN || _pInitialsN;
        const _pErrN = `onerror="this.onerror=null;this.src='${_pInitialsN}'"`;
        const _pNameH = window._safeHtml(pName);
        const _pPart = _nameToParticipant && _nameToParticipant[pName];
        const _pUid  = (_pPart && typeof _pPart === 'object') ? (_pPart.uid || '') : '';
        const _pUidJs = _pUid ? (',{uid:\'' + _pUid + '\',tournamentId:\'' + t.id + '\'}') : (',{tournamentId:\'' + t.id + '\'}');
        const _editAttrN = isOrg ? `onclick="event.stopPropagation();window._editParticipantName('${t.id}','${_pSafe}')" title="Clique para editar" style="font-weight:600;font-size:0.95rem;color:var(--text-bright);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;cursor:text;"` : `style="font-weight:600;font-size:0.95rem;color:var(--text-bright);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;cursor:pointer;" onclick="event.stopPropagation();if(typeof window._openPlayerProfile==='function')window._openPlayerProfile('${_pSafe}'${_pUidJs});else if(typeof window._showPlayerStats==='function')window._showPlayerStats('${_pSafe}')" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Ver perfil de ${_pNameH}"`;
        pNameHtml = `<div style="display:flex;align-items:center;gap:8px;overflow:hidden;"><img src="${_pPhotoN}" ${_pErrN} data-player-name="${_pNameH}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span ${_editAttrN}>${_pNameH}</span>${_orgStar}</div>`;
      }

      const safeP = pName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const isVip = window._entryHasVip(t, p || pName);
      const vipBadge = isVip ? '<span style="background:linear-gradient(135deg,#eab308,#fbbf24);color:#1a1a2e;font-size:0.6rem;font-weight:900;padding:1px 6px;border-radius:4px;letter-spacing:0.5px;margin-left:4px;">💎 VIP</span>' : '';

      // Label de tipo: origem da equipe
      const teamOrigins = t.teamOrigins || {};
      let teamLabel = _t('participants.teamIndividual');
      if (isTeam) {
          const origin = teamOrigins[pName];
          if (origin === 'inscrita') teamLabel = _t('tourn.teamEnrolled');
          else if (origin === 'sorteada') teamLabel = _t('tourn.teamDrawn');
          else if (origin === 'formada') teamLabel = _t('tourn.teamFormed');
          else teamLabel = _t('tourn.teamFormed');
      }
      const _standbyBadge = _isStandbyEntry ? '<span style="background:linear-gradient(135deg,#92400e,#f59e0b);color:#1a1a2e;font-size:0.6rem;font-weight:900;padding:1px 6px;border-radius:4px;letter-spacing:0.5px;">🕐 Lista de Espera</span>' : '';
      // v2.7.73: SEM tag VIP redundante — o card dourado + o botão VIP ativo já indicam.
      const typeText = _isStandbyEntry ? _standbyBadge : teamLabel;

      // Skill category badge/dropdown for normal (grid) mode
      const _nmSkillCats = t.skillCategories || [];
      let _nmSkillHtml = '';
      if (_nmSkillCats.length > 0) {
        const _nmCatStr = (typeof p === 'object' && p !== null) ? (p.category || '') : '';
        let _nmCurrentSkill = '';
        for (let _si = 0; _si < _nmSkillCats.length; _si++) {
          const _sk = _nmSkillCats[_si];
          if (_nmCatStr === _sk || _nmCatStr.endsWith(' ' + _sk)) { _nmCurrentSkill = _sk; break; }
        }
        if (isOrg && !_isStandbyEntry) {
          // v2.3.50: dropdown de atribuição de nível pelo organizador. Pra
          // não-organizador o nível já aparece no badge de meta (gênero ·
          // categoria · idade) abaixo do nome — não duplica aqui.
          const _nmOpts = _nmSkillCats.map(sk => `<option value="${sk}" ${_nmCurrentSkill === sk ? 'selected' : ''}>${sk}</option>`).join('');
          _nmSkillHtml = `<select onchange="event.stopPropagation();window._setParticipantSkillCategory('${t.id}','${safeP}',this.value)" onclick="event.stopPropagation()" style="font-size:0.68rem;font-weight:700;padding:1px 4px;border-radius:6px;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);cursor:pointer;margin-top:4px;"><option value="" ${!_nmCurrentSkill ? 'selected' : ''}>— nível</option>${_nmOpts}</select>`;
        }
      }

      let dragProps = '';
      // v2.7.72: botões expostos (VIP à esquerda com a meta; split/undo/excluir à
      // direita) pra montar a LINHA COMBINADA igual ao card pós-sorteio (canônico).
      let _vipBtn = '', _delBtn = '', _splitBtn = '';
      // v2.0.0: botão "Desfazer mesclagem" — aparece quando o card resultou de
      // uma mesclagem (p._mergedFrom), em qualquer estado do torneio.
      let undoMergeBtn = '';
      if (isOrg && p && typeof p === 'object' && p._mergedFrom) {
        undoMergeBtn = `<button class="btn btn-micro" title="Desfazer mesclagem" style="background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px dashed rgba(251,191,36,0.5);" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='none'" onclick="event.stopPropagation(); window._undoMergeParticipant('${t.id}', '${safeP}');">↩️</button>`;
      }
      if (isOrg && !_isStandbyEntry) {
        // v2.0.0: drag habilitado pro organizador também — a MESCLAGEM funciona
        // enquanto a grade estiver visível (inclui o estado "sorteado, antes de
        // iniciar"). Formar equipe / VIP / remover continuam só pré-sorteio.
        dragProps = `draggable="true" ondragstart="window.handleDragStart(event, ${idx}, '${t.id}')" ondragend="window.handleDragEnd(event)" ondragover="window.handleDragOver(event)" ondragenter="window.handleDragEnter(event)" ondragleave="window.handleDragLeave(event)" ondrop="window.handleDropTeam(event, ${idx})"`;
        if (!drawDone) {
          _vipBtn = `<button class="btn btn-micro" title="${isVip ? _t('tourn.removeVip') : _t('tourn.markVip')}" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.66rem;font-weight:800;flex-shrink:0;background: ${isVip ? 'linear-gradient(135deg,rgba(234,179,8,0.35),rgba(251,191,36,0.25))' : 'rgba(234,179,8,0.08)'}; color: ${isVip ? '#fbbf24' : '#a3842a'}; border: 1px ${isVip ? 'solid' : 'dashed'} ${isVip ? 'rgba(251,191,36,0.6)' : 'rgba(234,179,8,0.3)'};" onclick="event.stopPropagation(); window._toggleVip('${t.id}', '${safeP}');">💎 VIP</button>`;
          _delBtn = `<button class="btn btn-micro" title="${_t('btn.remove')}" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.7rem;font-weight:800;flex-shrink:0;background: rgba(239,68,68,0.1); color: #ef4444; border: 1px dashed rgba(239,68,68,0.5);" onclick="event.stopPropagation(); window.removeParticipantFunction('${t.id}', '${safeP}');">🗑️</button>`;
          if (window._entryTeamMembers(p)) { // v3.0.x: botão dividir só pra dupla (estrutura), não por '/'
            _splitBtn = `<button class="btn btn-micro" title="${_t('participants.splitTeam')}" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.7rem;font-weight:800;flex-shrink:0;background: rgba(14,165,233,0.1); color: #38bdf8; border: 1px dashed #0ea5e9;" onclick="event.stopPropagation(); window.splitParticipantFunction('${t.id}', '${safeP}');">✂️</button>`;
          }
        }
      }

      // v2.1.86: linha de presença da CHAMADA pré-sorteio (só organizador, antes do sorteio).
      // Reusa _toggleCheckIn / _markAbsent, que já gravam em t.checkedIn / t.absent
      // pela chave do entry (time "A / B" ou individual). Pré-sorteio não há matches,
      // então _processWoSubstitutions é no-op e _markAbsent só alterna o flag.
      // v3.0.x: chamada CANÔNICA no card individual — na MESMA linha do tipo de
      // inscrição ("Inscrição Individual"), alinhada à DIREITA: PALAVRA + toggle +
      // W.O. + remover. Economiza uma linha por jogador. Estado binário: Presente
      // (toggle ligado) ou Ausente (desligado).
      let _presenceGroup = '';
      if (canRollCall) {
        const _rcEntry = pName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const _rcLabel = rcMc ? 'Presente' : 'Ausente';
        const _rcColor = rcMc ? '#4ade80' : '#f87171';
        const _rcWoBtn = (!rcMc && isOrg)
          ? window._woBtnHtml(`event.stopPropagation(); window._markAbsent('${t.id}', '${_rcEntry}');`, !rcAbs, { label: rcAbs ? 'Reverter' : 'W.O.', size: 'btn-micro', fontSize: '0.68rem', extraStyle: 'min-height:0;height:24px;line-height:1;' })
          : '';
        // Ordem canônica: palavra (Presente/Ausente) + toggle + W.O. O 🗑️ é
        // anexado depois (em _inscritoActionRow) → palavra, toggle, W.O., 🗑️.
        _presenceGroup = `<span style="font-size:0.74rem;font-weight:800;color:${_rcColor};white-space:nowrap;">${_rcLabel}</span><label class="toggle-switch toggle-sm" style="--toggle-on-bg:#10b981;--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:#10b981;flex-shrink:0;" onclick="event.stopPropagation();"><input type="checkbox" ${rcMc ? 'checked' : ''} onclick="event.stopPropagation(); window._toggleCheckIn('${t.id}', '${_rcEntry}');"><span class="toggle-slider"></span></label>${_rcWoBtn}`;
      } else if (postDrawPresence) {
        // v2.2.40: pós-sorteio (antes de iniciar) — presença em modo somente leitura.
        const _rcLabel = rcMc ? 'Presente' : 'Ausente';
        const _rcColor = rcMc ? '#4ade80' : '#f87171';
        const _rcIcon = rcMc ? '✅' : '🚫';
        _presenceGroup = `<span style="font-size:0.74rem;font-weight:800;color:${_rcColor};white-space:nowrap;">${_rcIcon} ${_rcLabel}</span>`;
      }
      // v3.0.x: card INTEIRO verde quando Presente, vermelho quando W.O./Ausente
      // (não só a borda). Append no fim do style → sobrepõe o background do cardStyle.
      const _rcCardExtra = (canRollCall || postDrawPresence)
        ? (rcMc ? 'background:linear-gradient(135deg,rgba(16,185,129,0.5),rgba(5,150,105,0.6)) !important;border:2px solid rgba(16,185,129,0.85) !important;box-shadow:0 0 0 1px rgba(16,185,129,0.4),0 4px 12px rgba(0,0,0,0.14);'
          : rcAbs ? 'background:linear-gradient(135deg,rgba(239,68,68,0.45),rgba(220,38,38,0.58)) !important;border:2px solid rgba(239,68,68,0.8) !important;box-shadow:0 0 0 1px rgba(239,68,68,0.35),0 4px 12px rgba(0,0,0,0.14);'
          : '')
        : '';

      const bgNum = isVip ? '⭐' : idx + 1;
      // v2.7.27: data-attrs canônicos p/ a barra de filtro/sort (_inscritosFilterBar
      // + _partApplyFilter) funcionar TAMBÉM na grade — antes só a lista compacta os
      // tinha. Espelha a lógica de _canonGender/skill/_partEnrollIdx da lista.
      const _gPart = (typeof p === 'object' && p !== null) ? p : (_nameToParticipant && _nameToParticipant[pName]);
      const _fGender = (typeof window._canonGender === 'function') ? window._canonGender(_gPart && _gPart.gender) : 'none';
      let _fSkill = 'none';
      const _fSkillCats = t.skillCategories || [];
      const _fCatStr = (_gPart && typeof _gPart === 'object') ? (_gPart.category || '') : '';
      for (let _fi = 0; _fi < _fSkillCats.length; _fi++) { if (_fCatStr === _fSkillCats[_fi] || _fCatStr.endsWith(' ' + _fSkillCats[_fi])) { _fSkill = _fSkillCats[_fi]; break; } }
      const _fKey = (pName || '').toLowerCase().trim();
      const _fEnrollNum = (typeof window._enrollNumber === 'function') ? window._enrollNumber(_enrollOrderMap, _gPart || pName) : '';
      const _fOrder = (_fEnrollNum !== '' && _fEnrollNum != null) ? (_fEnrollNum - 1) : idx;
      const _fNameAttr = (pName || '').toLowerCase().replace(/"/g, '&quot;');
      return `
        <div class="participant-card" data-part-card="1" data-part-org="${_isOrgP ? '1' : '0'}" data-part-vip="${isVip ? '1' : '0'}" data-part-standby="${_isStandbyEntry ? '1' : '0'}" data-part-name="${_fNameAttr}" data-part-gender="${_fGender}" data-part-skill="${String(_fSkill).replace(/"/g, '&quot;')}" data-part-order="${_fOrder}" ${dragProps} style="${cardStyle} border-radius:12px;padding:12px;position:relative;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.1);transition:all 0.2s;${isOrg ? 'cursor:grab;' : ''}${_rcCardExtra}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
            ${(function () { var _n = (typeof _fOrder === 'number') ? (_fOrder + 1) : ''; return (typeof window._enrollNumberBadge === 'function') ? window._enrollNumberBadge(_n, 'right') : ''; })()}
            <div style="position:relative;z-index:1;">
                <!-- HEADER: avatar + nome + estrela (igual ao card pós-sorteio) -->
                ${pNameHtml}
                <!-- LINHA COMBINADA (canônica): VIP + meta + nível (esquerda) | split/desfazer/excluir (direita) -->
                <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;" onclick="event.stopPropagation();">${_vipBtn}${_metaSlotsFor(p, pName, isTeam, { inline: true })}${_nmSkillHtml}</div>
                    ${(_splitBtn || undoMergeBtn) ? `<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto;flex-wrap:wrap;" onclick="event.stopPropagation();">${_splitBtn}${undoMergeBtn}</div>` : ''}
                </div>
                <!-- CARD CANÔNICO: tipo de inscrição na linha 1; ação (Presente/
                     Ausente · toggle · W.O. · 🗑️) na linha de baixo, à direita. -->
                ${window._inscritoActionRow(typeText, _presenceGroup, _delBtn)}
            </div>
        </div>`;
    }).join('');
  }

  // ── Filter controls (only when check-in active) ──
  const pendingCount = totalIndividuals - checkedCount - absentConfirmedCount;
  const pctPresent = totalIndividuals > 0 ? Math.round(checkedCount / totalIndividuals * 100) : 0;

  // v2.7.46: chamada ENXUTA e CANÔNICA — bolinhas coloridas + nº (azul=todos,
  // verde=presentes, roxa=aguardando, vermelha=W.O.), clicáveis pra filtrar, + barra
  // (roxa cheia no início → vai virando verde conforme a presença chega) com nº/%.
  // Tudo numa linha.
  function _rollCallBar(total, present, absent, pending) {
    var pct = total > 0 ? Math.round(present / total * 100) : 0;
    function dot(key, dotC, bg, bd, fg, count, label) {
      var a = (currentFilter === key);
      return '<button type="button" class="btn" title="' + label + ' (' + count + ')" onclick="event.stopPropagation();window._setCheckInFilter(\'' + tId + '\',\'' + key + '\')" style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:0.8rem;font-weight:800;cursor:pointer;line-height:1;flex-shrink:0;background:' + (a ? bg : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (a ? bd : 'rgba(255,255,255,0.12)') + ';color:' + (a ? fg : 'var(--text-main)') + ';"><span style="width:9px;height:9px;border-radius:50%;background:' + dotC + ';flex-shrink:0;display:inline-block;"></span>' + count + '</button>';
    }
    return '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;margin-bottom:4px;flex-wrap:wrap;">'
      + dot('all', '#60a5fa', 'rgba(96,165,250,0.22)', 'rgba(96,165,250,0.6)', '#93c5fd', total, 'Todos')
      + dot('present', '#10b981', 'rgba(16,185,129,0.22)', 'rgba(16,185,129,0.6)', '#4ade80', present, 'Presentes')
      + dot('pending', '#a78bfa', 'rgba(167,139,250,0.22)', 'rgba(167,139,250,0.6)', '#c4b5fd', pending, 'Aguardando')
      + dot('absent', '#ef4444', 'rgba(239,68,68,0.22)', 'rgba(239,68,68,0.6)', '#f87171', absent, 'W.O.')
      + '<div title="' + present + ' de ' + total + ' presentes" style="flex:1;min-width:50px;height:9px;border-radius:6px;overflow:hidden;display:flex;background:rgba(167,139,250,0.35);"><div style="width:' + pct + '%;background:linear-gradient(90deg,#10b981,#4ade80);transition:width 0.3s;"></div></div>'
      + '<span style="font-size:0.76rem;color:#94a3b8;font-weight:700;white-space:nowrap;flex-shrink:0;">' + present + '/' + total + ' · ' + pct + '%</span>'
    + '</div>';
  }
  const checkInControls = canCheckIn ? _rollCallBar(totalIndividuals, checkedCount, absentConfirmedCount, pendingCount) : '';
  // v3.0.x: pré-sorteio (roll-call) conta por ENTRADA (rcTotal — a unidade que entra no
  // sorteio); pós-sorteio (postDrawPresence, grade por indivíduo) conta por PESSOA
  // (totalIndividuals=103), consistente com os cards e com INSCRITOS.
  const rollCallControls = canRollCall
    ? _rollCallBar(rcTotal, rcPresent, rcAbsent, rcPending)
    : (postDrawPresence ? _rollCallBar(totalIndividuals, checkedCount, absentConfirmedCount, totalIndividuals - checkedCount - absentConfirmedCount) : '');

  // ── Banner da CHAMADA pré-sorteio: instrução + "Sortear entre os presentes" ──
  const rollCallBanner = (canRollCall && parts.length > 0) ? `
    <div style="margin-bottom:1.25rem;padding:16px 18px;background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(79,70,229,0.1));border:2px solid rgba(99,102,241,0.4);border-radius:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:1.3rem;">📋</span>
            <span style="font-size:1rem;font-weight:800;color:var(--text-bright);">Chamada antes do sorteio</span>
        </div>
        <p style="color:#94a3b8;font-size:0.83rem;line-height:1.5;margin:0 0 12px;">
            Marque quem está <b style="color:#4ade80;">presente</b>. Ao sortear, você decide o que fazer com os ausentes — <b style="color:#fbbf24;">enviar à lista de espera</b> ou <b style="color:#f87171;">desclassificar</b> — e o sorteio roda só entre os presentes.
        </p>
        <button class="btn btn-cta hover-lift" onclick="event.stopPropagation(); window._drawPresentOnly('${tId}')" style="width:100%;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;padding:13px;border-radius:12px;border:none;font-size:0.95rem;">
            🎲 Sortear entre os presentes (${rcPresent})
        </button>
    </div>` : '';

  // ── "Iniciar Torneio" banner (after draw, before start) ──
  const startBanner = (isOrg && drawDone && !t.tournamentStarted && !(window._hasAnyMatchResult && window._hasAnyMatchResult(t))) ? `
    <div style="margin-bottom:1.5rem;padding:20px;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.1));border:2px solid rgba(16,185,129,0.4);border-radius:16px;text-align:center;">
        <p style="color:#94a3b8;font-size:0.85rem;margin-bottom:12px;">${_t('participants.drawDoneMsg')}</p>
        <button class="btn btn-success btn-cta hover-lift" onclick="window._startTournament('${tId}')">
            ▶ ${_t('participants.startTournament')}
        </button>
    </div>` : '';

  // ── Started badge ──
  const startedBadge = t.tournamentStarted ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:1rem;">
        <span style="width:10px;height:10px;border-radius:50%;background:#10b981;display:inline-block;"></span>
        <span style="font-size:0.85rem;font-weight:700;color:#4ade80;">${_t('participants.inProgressBadge')}</span>
    </div>` : '';

  // Ready matches banner (check-in: jogos prontos para chamar)
  const readyBannerHtml = (typeof window._renderReadyMatchesBanner === 'function') ? window._renderReadyMatchesBanner(t) : '';

  // Standby / waitlist panel
  const standbyPanelHtml = (typeof window._renderStandbyPanel === 'function') ? window._renderStandbyPanel(t, isOrg) : '';

  // v3.0.91: barra de busca/sort/filtro CANÔNICA, agora STICKY no fluxo do conteúdo
  // (rola junto até o cabeçalho e gruda nele) — antes ia fixa no belowHtml do
  // back-header. Aparece com >1 card (pedido do usuário). A mensagem de "nenhum
  // encontrado" fica perto dos cards.
  // v3.1.47: preset CANÔNICO window._inscritosBar (store.js) — o MESMO usado na tela
  // de detalhe do torneio (modo individual e modo duplas). A barra viaja junto com os
  // cards de inscrito; nunca recriar o bloco de opções localmente. Default A-Z (mais
  // fácil de achar na chamada). Já inclui o slot "Nenhum inscrito encontrado".
  const _filterBarCtrls = (typeof window._inscritosBar === 'function')
    ? window._inscritosBar(t, parts.length > 1)
    : '';

  container.innerHTML = `
    ${(typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({
          href: '#tournaments/' + t.id,
          extraStyle: 'padding-bottom:0;',
          middleHtml: '<div style="flex:1;min-width:0;overflow:hidden;">' +
            '<h2 style="margin:0;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
              _t('participants.title') + ' — ' + window._safeHtml(t.name) +
            '</h2>' +
          '</div>',
          rightHtml: '<div style="display:flex;gap:4px;flex-shrink:0;">' +
            '<span class="badge badge-info" style="font-size:0.65rem;">' + ((window._formatLabel && t.format) ? window._formatLabel(t) : (t.format || _t('participants.defaultFormat'))) + '</span>' +
            '<span class="badge" style="background:rgba(255,255,255,0.1);color:var(--text-muted);font-size:0.65rem;">' + individualCount + '</span>' +
          '</div>',
          belowHtml: (checkInControls || rollCallControls)
        })
      : ''}
    ${rollCallBanner}
    ${startBanner}
    ${startedBadge}
    ${readyBannerHtml}
    ${_filterBarCtrls}
    ${parts.length > 0 ? `
      <div style="${gridStyle}">
        ${cardsStr}
      </div>
    ` : `
      <div style="text-align:center;padding:3rem;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:16px;">
        <p class="text-muted">Nenhum inscrito ainda.</p>
      </div>
    `}
    ${standbyPanelHtml}
  `;
  // v2.6.101: reaplica busca + filtro ativo/inativo após o (re)render.
  setTimeout(function () { try { if (window._partApplyFilter) window._partApplyFilter(); } catch (e) {} }, 0);
}

// ── Skill category assignment from participant cards ──────────────────────────
window._setParticipantSkillCategory = function(tId, pName, newSkill) {
  const t = window.AppStore && window.AppStore.getTournament ? window.AppStore.getTournament(tId) : null;
  if (!t) return;
  const skillCats = t.skillCategories || [];
  if (!skillCats.length) return;

  // Find the participant in t.participants by name (handles both string and object entries)
  let found = false;
  (t.participants || []).forEach(function(p) {
    if (!p) return;
    const pn = window._pName(p);
    // Also match individual names inside a team "A/B" entry
    const memberNames = pn.includes('/') ? pn.split('/').map(n => n.trim()) : [pn];
    if (pn !== pName && !memberNames.includes(pName)) return;
    if (typeof p === 'string') return; // can't attach category to string entries

    const existingCat = p.category || '';
    // Extract gender prefix (everything before the skill token)
    let genderPrefix = '';
    for (let i = 0; i < skillCats.length; i++) {
      const sk = skillCats[i];
      if (existingCat === sk) { genderPrefix = ''; break; }
      if (existingCat.endsWith(' ' + sk)) { genderPrefix = existingCat.slice(0, existingCat.length - sk.length - 1); break; }
    }
    // Build new combined category
    const newCat = newSkill ? (genderPrefix ? genderPrefix + ' ' + newSkill : newSkill) : genderPrefix;
    p.category = newCat;
    p.categorySource = 'organizador';
    found = true;
  });

  if (!found) return;

  // Save and re-render
  const savePromise = (window.AppStore && window.AppStore.syncImmediate)
    ? window.AppStore.syncImmediate(tId)
    : (window.FirestoreDB ? window.FirestoreDB.saveTournament(t) : Promise.resolve());

  savePromise.then(function() {
    const container = document.getElementById('view-container');
    if (container && typeof window.renderParticipants === 'function') {
      window.renderParticipants(container, tId);
    }
  }).catch(function(e) {
    window._warn('[Participants] skill save failed:', e);
  });
};
