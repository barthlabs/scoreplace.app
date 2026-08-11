/* wo-core.js — O MOTOR DE W.O., SEPARADO DA TELA (v1.8.0)
 *
 * Aqui vivem as DUAS funções que de fato mudam o torneio num W.O.:
 *   · window._applyWoSubsToTournament(t)  — núcleo das substituições
 *   · window._applyWO(t, opts)            — o motor único (org + reivindicação)
 *
 * POR QUE SAÍRAM DO participants.js: elas são PURAS (mutam só o `t` recebido, sem
 * fetch, sem save, sem DOM — medido: ZERO referência a document/dialog/innerHTML),
 * mas moravam dentro de uma VIEW de 3.355 linhas cheia de render e diálogo. Isso
 * impedia o passo seguinte do cânone — **tudo roda na CF, o cliente apenas dispara**
 * ([[feedback_draw_is_cf_only]]): pra o servidor rodar o mesmo motor ele precisa
 * VENDORAR o arquivo, e vendorar uma view arrastaria a interface inteira junto.
 * Este arquivo é vendorável; a view não era. Ver [[project_canon_runs_on_server]].
 *
 * ⚠️ MUDANÇA DE ENDEREÇO, NÃO DE COMPORTAMENTO. O código é o mesmo, movido; quem
 * prova isso é `tests/apply-wo.test.js`, que exercita o motor REAL e continua com as
 * mesmas 22 asserções verdes. Se alguma tivesse mudado, a extração estaria errada.
 *
 * ⚠️ O QUE NÃO É PURO E POR ISSO FICOU PRA TRÁS: `_processWoSubstitutions(tId)` é o
 * wrapper que faz fetch+save pros callers que só têm o id — encanamento de cliente,
 * segue no participants.js.
 *
 * ⚠️ O RAMO INTERATIVO NÃO MUTA. Em Liga/Rei-Rainha com escopo de GRUPO, `_applyWO`
 * delega pro `_ligaPickFill` (que abre diálogo) e RETORNA sem tocar no torneio
 * (`outcome: 'ligaDelegated'`). Isso é o que torna a migração pra CF viável: a
 * escolha do substituto é decisão de UI e continua no cliente; o servidor só aplica
 * o que já foi decidido.
 *
 * Carregar ANTES de participants.js (index.html e o harness dos testes).
 */

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
  const subChoicePending = [];

  // ── REGRA DE CATEGORIA ────────────────────────────────────────────────────────
  // Dono: "só entra automático no caso do substituído e do suplente [atenderem à mesma
  // regra da categoria]. Deixa o organizador escolher no caso de quebrar a regra da
  // categoria." E: "a regra de gênero aqui é um exemplo, mas deve funcionar sempre que o
  // suplente não atende a regra da categoria — pode ser idade ou habilidade [ou
  // personalizada]." Ou seja: NÃO é sobre gênero — é sobre CATEGORIA, qualquer que seja.
  //
  // O app já classifica cada pessoa em categorias (p.categories[] — gênero/idade/skill/
  // custom, montadas no _autoAssignCategories) e já tem `_participantInCategory`. A regra
  // é: o suplente entra automático SÓ se pertence à(s) MESMA(S) categoria(s) do ausente.
  // Se o torneio não tem categorias (chave única), qualquer suplente serve (FIFO).
  // Categorias lidas por UID — acha o objeto-pessoa que carrega o uid. Antes a escolha era
  // FIFO puro e podia meter alguém de outra categoria sem perguntar.
  // Ver [[project_wo_individual_substitution_rule]] / [[project_uncategorized_weakest_category]].
  const _tournHasCats = (Array.isArray(t.combinedCategories) && t.combinedCategories.length > 0) ||
    (Array.isArray(t.genderCategories) && t.genderCategories.length > 0) ||
    (Array.isArray(t.ageCategories) && t.ageCategories.length > 0) ||
    (Array.isArray(t.skillCategories) && t.skillCategories.length > 0) ||
    (Array.isArray(t.customCategories) && t.customCategories.length > 0);
  const _personByUid = (uid) => {
    if (!uid) return null;
    const pools = [t.participants, t.standbyParticipants, t.waitlist];
    for (const arr of pools) {
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        if (!p || typeof p !== 'object') continue;
        const uids = (typeof window._participantUids === 'function') ? window._participantUids(p) : (p.uid ? [p.uid] : []);
        if (uids.indexOf(uid) !== -1) {
          // numa dupla, a categoria é do MEMBRO (o slot) — devolve um "sub-perfil" com o
          // gênero certo do membro, mantendo as demais categorias da entrada.
          const base = (typeof window._getParticipantCategories === 'function') ? window._getParticipantCategories(p) : [];
          const memberGender = p.p1Uid === uid ? p.p1Gender : (p.p2Uid === uid ? p.p2Gender : p.gender);
          return { entry: p, categories: base, gender: memberGender };
        }
      }
    }
    return null;
  };
  // "o suplente atende à categoria do ausente?" — mesmas categorias declaradas. Sem
  // categorias no torneio → sempre atende. Gênero do MEMBRO entra na comparação (dupla mista).
  const _canonG = (g) => (typeof window._canonGender === 'function') ? window._canonGender(g) : 'none';
  const _subMeetsCategory = (absentUid, subUid) => {
    if (!_tournHasCats) return true;
    const A = _personByUid(absentUid), S = _personByUid(subUid);
    if (!A || !S) return true; // sem dado de categoria → não bloqueia (evita travar por falta de perfil)
    // categorias declaradas: o suplente tem que cobrir TODAS as do ausente
    const ac = (A.categories || []), sc = (S.categories || []);
    if (ac.length && !ac.every((c) => sc.indexOf(c) !== -1)) return false;
    // gênero do membro (dupla mista): se o ausente tem gênero definido, o sub tem que bater
    const ag = _canonG(A.gender), sg = _canonG(S.gender);
    if ((ag === 'Fem' || ag === 'Masc') && (sg === 'Fem' || sg === 'Masc') && ag !== sg) return false;
    return true;
  };
  const _subUid = (o) => { const u = (o && o.p && typeof o.p === 'object') ? window._participantUids(o.p) : []; return u[0] || ''; };

  // Iterate absents — try to substitute each. Pode ter múltiplos absents pendentes.
  // t.absent agora é chaveado por uid (uid-first); traduz cada chave de volta pro
  // NOME pra cruzar com os slots da chave (m.p1/m.p2 são nomes). Chave legada que
  // já é nome (sem uid correspondente) resolve pra '' → cai no próprio k.
  const absentUidKeys = Object.keys(t.absent);
  const absentNames = absentUidKeys.map(function(k){ return window._memberNameByUid(t, k) || k; });
  for (let _ai = 0; _ai < absentNames.length; _ai++) {
    const absentName = absentNames[_ai];
    const absentUid = absentUidKeys[_ai];
    if (presentList.length === 0) break;

    // Find match where absent is still in p1/p2 (not yet substituted). POR UID: casa o
    // uid do ausente contra os uids do SLOT (_slotUids). Nome só quando o slot não tem uid
    // (guest/legado). Antes era `members.indexOf(absentName)` com split('/') — quebrava em
    // homônimo, rename e na forma real do doc (slot só-uid). [[project_uid_identity_canon_locked]]
    let foundMatch = null, foundSlot = null, foundIdx = -1;
    for (let i = 0; i < allMatches.length; i++) {
      const m = allMatches[i];
      if (!m || m.winner) continue;
      for (const slot of ['p1', 'p2']) {
        const entry = m[slot];
        if (!entry || entry === 'TBD' || entry === 'BYE') continue;
        const slotUids = (typeof window._slotUids === 'function') ? window._slotUids(m, slot).filter(Boolean) : [];
        let hit;
        if (slotUids.length && absentUid) hit = slotUids.indexOf(absentUid) !== -1;
        else { const members = entry.includes('/') ? entry.split('/').map(n => n.trim()).filter(n => n) : [entry]; hit = members.indexOf(absentName) !== -1; }
        if (hit) { foundMatch = m; foundSlot = slot; foundIdx = i; break; }
      }
      if (foundMatch) break;
    }

    if (!foundMatch) continue; // absent já substituído ou não está em match ativo

    // Escolhe o suplente. Fora de misto obrigatório: FIFO (primeiro presente). Em misto
    // obrigatório: só AUTOMÁTICO se houver suplente do MESMO gênero do ausente (FIFO entre
    // eles). Se só há de gênero diferente, NÃO substitui automático — registra a pendência
    // pro organizador escolher (aceitar a quebra ou dar W.O. ao time). Gênero por UID.
    let subIdx = 0;
    const _override = t._woSubOverride && t._woSubOverride[absentUid];
    if (_override) {
      // O organizador ACEITOU explicitamente este suplente (quebra da categoria) — sem filtro.
      const _oi = presentList.findIndex((o) => _subUid(o) === _override);
      subIdx = _oi === -1 ? 0 : _oi;
    } else if (_tournHasCats) {
      // Automático SÓ com suplente que atende a categoria do ausente (gênero/idade/skill/
      // custom). FIFO ENTRE os que atendem.
      subIdx = presentList.findIndex((o) => _subMeetsCategory(absentUid, _subUid(o)));
      if (subIdx === -1) {
        // Nenhum suplente presente atende a categoria → decisão é do organizador.
        const _acats = (_personByUid(absentUid) || {}).categories || [];
        subChoicePending.push({
          absentUid: absentUid, absentName: absentName, absentCategories: _acats,
          matchId: foundMatch.id, matchNum: foundIdx + 1,
          options: presentList.map((o) => { const su = _subUid(o); const sp = _personByUid(su) || {}; return { uid: su, name: o.name, categories: sp.categories || [], gender: sp.gender || '' }; })
        });
        continue; // ausente segue marcado; o organizador resolve via _woResolveSubChoice
      }
    }
    // Pick from pool (respeitando gênero em misto obrigatório; FIFO caso contrário)
    const sub = presentList.splice(subIdx, 1)[0];
    const subName = sub.name;
    const subUid = _subUid(sub);
    const oldEntry = foundMatch[foundSlot];
    const _uidsKey = foundSlot === 'p1' ? 'team1Uids' : 'team2Uids';
    const oldUids = Array.isArray(foundMatch[_uidsKey]) ? foundMatch[_uidsKey].slice() : [];
    // IDENTIDADE do slot = os uids (team*Uids). Troca o uid do AUSENTE pelo do SUPLENTE — é
    // isto que o resto do app lê (resultado/standings/próximo W.O.). O display (m.p1) é
    // recomposto por uid via _resolveSideLive. Se o slot não tem uid (guest), cai no nome.
    let newUids = null;
    if (subUid && oldUids.length) {
      newUids = oldUids.map(u => (u === absentUid ? subUid : u));
    }
    const _displayOf = (uids, fallbackStr) => {
      if (uids && uids.length && typeof window._displayNameForUid === 'function') {
        const ns = uids.map(u => window._displayNameForUid(u, '')).filter(Boolean);
        if (ns.length === uids.length) return ns.join(' / ');
      }
      return fallbackStr;
    };
    const isTeam = oldUids.length > 1 || oldEntry.includes('/');
    let newEntry;
    if (newUids) {
      newEntry = _displayOf(newUids, subName);
    } else if (isTeam && woScope === 'individual') {
      // guest/legado sem uid: reconstrói por nome (é a identidade que há)
      const sep = oldEntry.includes(' / ') ? ' / ' : '/';
      newEntry = oldEntry.split(sep).map(n => n.trim()).map(n => n === absentName ? subName : n).join(' / ');
    } else {
      newEntry = subName;
    }
    // parceiro (o outro slot) — por uid quando há
    let partner = null;
    if (newUids && oldUids.length > 1) {
      const pu = oldUids.find(u => u !== absentUid);
      partner = pu ? (window._displayNameForUid ? window._displayNameForUid(pu, '') : '') : null;
    } else if (isTeam) {
      partner = oldEntry.split('/').map(n => n.trim()).find(n => n !== absentName) || null;
    }

    // Aplica no slot achado + propaga em TODAS as refs (Liga/Suíço/Grupos usam o mesmo
    // match em vários lugares). Casa por UID do slot; nome só no fallback guest/legado.
    const _applyToSlot = (m, side) => {
      const su = (typeof window._slotUids === 'function') ? window._slotUids(m, side).filter(Boolean) : [];
      if (su.length && absentUid && subUid && su.indexOf(absentUid) !== -1) {
        const nu = su.map(u => (u === absentUid ? subUid : u));
        // escreve a identidade canônica: team*Uids sempre; p*Uid quando 1v1 (1 uid). É o
        // que _resolveSideLive/standings leem — sem isto, o slot 1v1 (só p1Uid) mostrava o
        // nome novo mas mantinha o uid do AUSENTE, quebrando identidade depois.
        if (typeof window._setSlot === 'function') window._setSlot(m, side, nu, null);
        else { const k = side === 'p1' ? 'team1Uids' : 'team2Uids'; m[k] = nu; m[side === 'p1' ? 'p1Uid' : 'p2Uid'] = nu.length === 1 ? nu[0] : null; }
        m[side] = _displayOf(nu, newEntry);
        return true;
      }
      if (!su.length && m[side] === oldEntry) { m[side] = newEntry; return true; } // guest/legado
      return false;
    };
    allMatches.forEach(m => {
      if (!m) return;
      _applyToSlot(m, 'p1'); _applyToSlot(m, 'p2');
      // team1/team2 (arrays de nome, Rei/Rainha) — troca o nome do ausente pelo do sub
      if (Array.isArray(m.team1)) { const ti = m.team1.indexOf(absentName); if (ti !== -1) m.team1[ti] = subName; }
      if (Array.isArray(m.team2)) { const ti2 = m.team2.indexOf(absentName); if (ti2 !== -1) m.team2[ti2] = subName; }
    });

    // Atualiza a ENTRADA da dupla nos participantes — por UID quando há (troca o slot
    // p1Uid/p2Uid do ausente pelo do suplente). Nome só no fallback guest/legado.
    const partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    let pIdx = -1;
    if (absentUid) {
      pIdx = partsArr.findIndex(p => p && typeof p === 'object' &&
        (typeof window._participantUids === 'function' ? window._participantUids(p) : (p.uid ? [p.uid] : [])).indexOf(absentUid) !== -1);
    }
    if (pIdx === -1) pIdx = partsArr.findIndex(p => _getName(p) === oldEntry);
    if (pIdx !== -1) {
      const ent = partsArr[pIdx];
      if (typeof ent === 'string') partsArr[pIdx] = newEntry;
      else if (subUid && (ent.p1Uid === absentUid || ent.p2Uid === absentUid)) {
        // dupla: troca o uid do membro ausente pelo do suplente; limpa o nome cacheado do slot
        if (ent.p1Uid === absentUid) { ent.p1Uid = subUid; if (ent.p1Name) ent.p1Name = subName; }
        if (ent.p2Uid === absentUid) { ent.p2Uid = subUid; if (ent.p2Name) ent.p2Name = subName; }
        ent.displayName = newEntry; ent.name = newEntry;
      } else { ent.displayName = newEntry; ent.name = newEntry; }
    }
    t.participants = partsArr;

    // Remove o suplente das listas de espera — por UID (dedup homônimo). Nome só p/ guest.
    const _notSub = (p) => {
      const u = (typeof window._participantUids === 'function') ? window._participantUids(p) : (p && p.uid ? [p.uid] : []);
      return (subUid && u.length) ? u.indexOf(subUid) === -1 : _getName(p) !== subName;
    };
    if (Array.isArray(t.standbyParticipants)) t.standbyParticipants = t.standbyParticipants.filter(_notSub);
    if (Array.isArray(t.waitlist)) t.waitlist = t.waitlist.filter(_notSub);

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

  // Pendências de escolha de gênero (misto obrigatório, só suplente de outro gênero):
  // ficam no doc pro organizador resolver. Dedup por absentUid (re-rodadas idempotentes).
  if (subChoicePending.length) {
    if (!Array.isArray(t.woSubChoices)) t.woSubChoices = [];
    subChoicePending.forEach((gc) => {
      if (!t.woSubChoices.some((x) => x.absentUid === gc.absentUid && !x.resolved)) t.woSubChoices.push(gc);
    });
  }

  try {
    window._lastProcessSubs = {
      version: window.SCOREPLACE_VERSION, at: new Date().toISOString(),
      outcome: subCount > 0 ? 'sub-done' : (subChoicePending.length ? 'gender-choice-pending' : 'no-sub-needed'),
      subCount, subDetails, subChoicePending: subChoicePending.length,
      standbyPoolCount: standbyPool.length, presentCount: presentList.length + subCount
    };
  } catch (_e) {}

  return { ok: subCount > 0, subCount, subDetails, subChoicePending: subChoicePending };
};

// obrigatório: ele ACEITA um suplente de gênero diferente (subUid) pra vaga do ausente
// (absentUid), OU não faz nada e o time toma W.O. no fluxo normal. Só o organizador chama.
// Alvo e substituto SEMPRE por uid — o nome é resolvido pro display na hora de escrever o slot.
window._woResolveSubChoice = function (tId, absentUid, subUid) {
  const t = window._findTournamentById(tId);
  if (!t) return { ok: false, reason: 'no-tournament' };
  // marca o suplente escolhido como presente (por uid) e força a substituição normal,
  // agora sem o filtro de gênero (o organizador já aceitou a quebra pra ESTE substituto).
  const pool = (typeof window._getStandbyPool === 'function') ? window._getStandbyPool(t) : [];
  const subObj = pool.find((p) => (typeof window._participantUids === 'function' ? window._participantUids(p) : (p.uid ? [p.uid] : [])).indexOf(subUid) !== -1);
  if (!subObj) return { ok: false, reason: 'sub-not-found' };
  if (!t.checkedIn) t.checkedIn = {};
  window._idMapSet(t, t.checkedIn, subObj, Date.now());
  // resolve a pendência e roda a substituição pulando a regra de gênero (aceite explícito)
  if (Array.isArray(t.woSubChoices)) t.woSubChoices.forEach((x) => { if (x.absentUid === absentUid) x.resolved = true; });
  t._woSubOverride = t._woSubOverride || {};
  t._woSubOverride[absentUid] = subUid;
  const r = window._applyWoSubsToTournament(t);
  delete t._woSubOverride;
  return r;
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
  // Casa o AUSENTE contra um slot de match POR UID (identidade real). Recebe o
  // match + lado (não só a string) pra ler o(s) uid(s) ESTRUTURAL(is) via
  // window._slotUids (team*Uids→p*Uid→team*Obj). Nome só fallback quando o slot
  // NÃO tem uid (guest/informal ou rodada legada) OU o ausente não tem uid.
  // Fecha (a) HOMÔNIMO — dois de mesmo nome, W.O. só num deles; e (b) RENAME —
  // slot com o nome do sorteio, pessoa renomeada depois (nome não casa, uid sim).
  // Ver project_match_slot_uid_identity / project_uid_audit_sweep (Parte 14).
  const _absentInSlot = (m, side) => {
    const slotStr = m ? m[side] : null;
    if (!slotStr || slotStr === 'TBD' || slotStr === 'BYE') return false;
    const slotUids = (typeof window._slotUids === 'function') ? window._slotUids(m, side) : [];
    if (slotUids.length && absentUids.length) {
      return slotUids.some(u => absentUids.indexOf(u) !== -1);
    }
    // fallback por nome (slot sem uid, ou ausente sem uid = guest/legado)
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
  const _preMatch = _preAll.find(m => m && !m.winner && (_absentInSlot(m, 'p1') || _absentInSlot(m, 'p2')));
  if (_preMatch && typeof window._woHistSet === 'function') {
    const _slot0 = _absentInSlot(_preMatch, 'p1') ? 'p1' : 'p2';
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

  // ── DESFECHO oferecido a quem decreta (Stage 1 — W.O. individual de eliminatória) ──
  // Regra do dono (18-jul-2026, ver project_wo_outcome_negotiation_canon): em vez de o motor
  // decidir o desfecho sozinho (substituir/avançar), quando `opts.offerOutcomeChoice` está
  // setado devolvemos 'needsOutcomeChoice' com o contexto — a UI abre o overlay das opções
  // (avançar/desclassificar · suplente da espera · convidar folga · Jogador X). SÓ eliminatória
  // INDIVIDUAL; time/Liga/monarch seguem o fluxo próprio. ADITIVO: sem a flag, nada muda.
  if (opts.offerOutcomeChoice && !opts.outcomeChoice && !_isLigaFmt && !_isMonarch && _preMatch) {
    const _cslot = _absentInSlot(_preMatch, 'p1') ? 'p1' : 'p2';
    const _csu = (typeof window._slotUids === 'function') ? window._slotUids(_preMatch, _cslot).filter(Boolean) : [];
    const _cEntry = String(_preMatch[_cslot] || '');
    const _cIsTeam = _csu.length ? _csu.length > 1 : _cEntry.includes('/');
    const _cIndiv = woScope === 'individual' && _cIsTeam && (_csu.length
      ? (absentUids.length && _csu.some(u => absentUids.indexOf(u) !== -1) && !_csu.every(u => absentUids.indexOf(u) !== -1))
      : (_cEntry.split(/\s*\/\s*/).map(n => n.trim()).indexOf(absentName) !== -1 && _cEntry !== absentName));
    if (_cIndiv) {
      const _partnerUid = _csu.length ? (_csu.find(u => absentUids.indexOf(u) === -1) || null) : null;
      const _coppSide = _cslot === 'p1' ? 'p2' : 'p1';
      return { ok: true, outcome: 'needsOutcomeChoice', absentName: absentName, absentUids: absentUids,
        matchId: _preMatch.id, matchNum: _friendlyOf(_preAll, _preMatch), partnerUid: _partnerUid,
        oppName: _preMatch[_coppSide] || '', scope: scope };
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
  // outcomeChoice (Stage 1 — project_wo_outcome_negotiation_canon): 'advance' | 'waitlistSub'
  // | 'ghost'. null = fluxo legado (consenso de participante / chamadas antigas) → inalterado.
  const _choice = opts.outcomeChoice || null;
  // _forceNoSub: "W.O. ao time" no diálogo de categoria — pula a substituição e escala.
  // 'advance'/'ghost' também pulam a substituição automática (o desfecho já foi escolhido).
  if (woScope === 'individual' && !opts._forceNoSub && _choice !== 'advance' && _choice !== 'ghost' && pool.length && presentInPool.length && typeof window._applyWoSubsToTournament === 'function') {
    // ⚠️ v1.8.0: este guard checava `_processWoSubstitutions` — o WRAPPER de fetch+save —
    // mas quem é chamado na linha de baixo é `_applyWoSubsToTournament`, o núcleo puro.
    // No navegador dava no mesmo (os dois existem), então ninguém notou. No SERVIDOR não:
    // o wrapper é encanamento de cliente e não vai pro vendor, então o guard seria FALSO e
    // a substituição por W.O. seria PULADA EM SILÊNCIO — o pior desfecho possível, porque
    // o W.O. seria aplicado sem chamar o suplente. Guard e chamada agora olham a MESMA função.
    const r = window._applyWoSubsToTournament(t);
    if (r && r.subCount > 0) return { ok: true, outcome: 'subbed', subCount: r.subCount, subDetails: r.subDetails || [] };
    // Há suplente presente, mas NENHUM atende a categoria do ausente → NÃO escala pra W.O.
    // do time: a decisão é do organizador (aceitar a quebra ou o próximo que atenda).
    // Fica registrado em t.woSubChoices; a UI (_woShowSubChoiceDialog) resolve.
    if (r && Array.isArray(r.subChoicePending) && r.subChoicePending.length) {
      return { ok: true, outcome: 'needsSubChoice', subChoicePending: r.subChoicePending };
    }
  }

  // 2) sem substituto presente com lista NÃO-vazia → aguarda (só se pedido)
  if (pool.length && !presentInPool.length && noSubBehavior === 'wait') {
    _log(`Ausência marcada: ${absentName} — aguardando substituto presente (lista tem ${pool.length}).`);
    return { ok: true, outcome: 'waited', poolCount: pool.length };
  }

  // 3) escala pra W.O.: adversário(s) vence(m). Re-scan (a sub pode ter mutado).
  const all = _allMatches();
  const pending = (Array.isArray(opts.matches) && opts.matches.length ? opts.matches : all)
    .filter(m => m && !m.winner && (_absentInSlot(m, 'p1') || _absentInSlot(m, 'p2')));
  if (!pending.length) return { ok: false, outcome: 'noMatch', reason: 'jogo do ausente não encontrado', absentMarked: true };

  let applied = 0, winner = null, matchNum = null, partnerToWaitlist = null, waitedTBD = false, anyKO = false, ghostApplied = 0;
  for (const m of pending) {
    const slot = _absentInSlot(m, 'p1') ? 'p1' : 'p2';
    const oppSide = slot === 'p1' ? 'p2' : 'p1';
    const oppName = m[oppSide];
    // adversário TBD/BYE → não aplica (evita winner='TBD' propagando)
    if (!oppName || oppName === 'TBD' || oppName === 'BYE') { waitedTBD = true; continue; }
    const entryStr = m[slot] || '';
    // ── É W.O. INDIVIDUAL (uma PESSOA da dupla) ou do LADO inteiro? — POR UID ──────
    // v1.2.33: isto decidia por NOME — `entryStr.includes('/')` + `split('/')` +
    // `members.indexOf(absentName)`. Errado por dois motivos: (1) a barra é TIPOGRAFIA,
    // não separador — o lado é 2 SLOTS com 2 uid ([[project_uid_identity_canon_locked]]);
    // (2) casar por nome só acerta quando o rótulo do slot bate exatamente com o
    // displayName vivo — homônimo, rename ou nome resolvido diferente caíam no `else` e
    // viravam W.O. de TIME, calados, contra o toggle individual.
    // Agora: o lado é uma dupla se os SLOTS têm 2+ uid; e é individual se o ausente é UM
    // desses uids. Nome só entra quando não há uid nenhum (guest/fictício — a exceção).
    const slotUids = (typeof window._slotUids === 'function') ? window._slotUids(m, slot).filter(Boolean) : [];
    let isTeamEntry, members, isIndividualWO;
    if (slotUids.length) {
      isTeamEntry = slotUids.length > 1;
      members = slotUids;
      isIndividualWO = woScope === 'individual' && isTeamEntry &&
        absentUids.length > 0 && slotUids.some(u => absentUids.indexOf(u) !== -1) &&
        !slotUids.every(u => absentUids.indexOf(u) !== -1); // o lado TODO ausente = W.O. do lado
    } else {
      // Sem uid no slot: guest/fictício/legado — o nome é a única identidade que existe.
      isTeamEntry = entryStr.includes('/');
      members = isTeamEntry ? entryStr.split(/\s*\/\s*/).map(n => n.trim()) : [entryStr];
      isIndividualWO = woScope === 'individual' && isTeamEntry && members.indexOf(absentName) !== -1 && entryStr !== absentName;
    }
    // ── Jogador X (ghost): o parceiro que ficou SEGUE com um placeholder; o jogo NÃO é
    //    decidido e o adversário NÃO avança. Só W.O. INDIVIDUAL. Reconstitui o slot por uid
    //    (parceiro + ghost). Ver project_wo_outcome_negotiation_canon.
    if (isIndividualWO && _choice === 'ghost') {
      const _pUid = slotUids.length ? slotUids.find(u => absentUids.indexOf(u) === -1) : null;
      const _pName = (_pUid && typeof window._displayNameForUid === 'function') ? window._displayNameForUid(_pUid, '') : (members.find(n => n !== absentName) || '');
      const _ghostUid = 'ghostwo_' + Date.now() + '_' + Math.floor(Math.random() * 1e4);
      if (!Array.isArray(t.woGhosts)) t.woGhosts = [];
      t.woGhosts.push({ uid: _ghostUid, name: 'Jogador X', replacedUid: (absentUids[0] || null), replacedName: absentName, matchId: m.id, at: Date.now() });
      const _label = _pName ? (_pName + ' / Jogador X') : 'Jogador X';
      const _newObj = { p1Uid: _pUid || null, p2Uid: _ghostUid, p1Name: _pName || '', p2Name: 'Jogador X',
        displayName: _label, name: _label,
        participants: [{ uid: (_pUid || undefined), displayName: (_pName || undefined), name: (_pName || undefined) },
                       { uid: _ghostUid, displayName: 'Jogador X', name: 'Jogador X', isGhost: true }] };
      if (typeof window._setSlot === 'function') window._setSlot(m, slot, [_pUid, _ghostUid].filter(Boolean), _newObj);
      m[slot] = _label;
      ghostApplied++;
      _log(`W.O. individual: ${absentName} → Jogador X; ${_pName || 'parceiro'} segue no Jogo ${_friendlyOf(all, m)}.`);
      continue;
    }
    // W.O. individual de dupla sem substituto → parceiro vai pra lista de espera
    if (isIndividualWO) {
      // O PARCEIRO é o outro SLOT (uid), não "o outro nome depois da barra".
      let partner = null;
      if (slotUids.length) {
        const pUid = slotUids.find(u => absentUids.indexOf(u) === -1);
        if (pUid) {
          const _parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
          // a entrada do parceiro (a dupla) já está fora do elenco; guarda a PESSOA por uid
          partner = (typeof window._displayNameForUid === 'function') ? window._displayNameForUid(pUid, '') : '';
          if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
          const _has = t.standbyParticipants.some(p => (typeof window._participantUids === 'function')
            ? window._participantUids(p).indexOf(pUid) !== -1 : _getName(p) === partner);
          if (!_has) t.standbyParticipants.push({ uid: pUid, displayName: partner || undefined });
          partnerToWaitlist = partner || pUid;
        }
      } else {
        partner = members.find(n => n !== absentName);
        if (partner) {
          if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
          if (!t.standbyParticipants.some(p => _getName(p) === partner)) t.standbyParticipants.push(partner);
          partnerToWaitlist = partner;
        }
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

  // Jogador X aplicado (parceiro segue no jogo): não decidiu, ninguém avançou.
  if (ghostApplied > 0 && applied === 0) {
    return { ok: true, outcome: 'ghostApplied', ghostApplied: ghostApplied, absentName: absentName };
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
