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
    if (typeof renderBracket === 'function') renderBracket(container, id);
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
window._processWoSubstitutions = function(tId) {
  const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
  if (!t) return { ok: false, reason: 'no-tournament' };
  if (!t.absent || Object.keys(t.absent).length === 0) return { ok: false, reason: 'no-absent', subCount: 0 };
  if (!t.checkedIn) return { ok: false, reason: 'no-checkedIn', subCount: 0 };

  const _getName = p => window._pName(p);
  const _normTeam = (s) => (s || '').replace(/\s*\/\s*/g, '/').trim();

  // Build fresh standby pool
  const _sp = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
  const _wl = Array.isArray(t.waitlist) ? t.waitlist : [];
  const _spNames = new Set(_sp.map(_getName));
  const standbyPool = _sp.slice();
  _wl.forEach(w => { const wn = _getName(w); if (wn && !_spNames.has(wn)) standbyPool.push(w); });

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
      const ci = t.checkedIn[name];
      const ts = typeof ci === 'number' ? ci : (ci ? 1 : 0);
      return { p, name, ts };
    })
    .filter(o => o.ts > 0 && !(_policy === 'locked' && t.absent && t.absent[o.name]));
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
  const absentNames = Object.keys(t.absent);
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

    // Mark sub as Presente (use timestamp pra preservar FIFO em subs subsequentes)
    t.checkedIn[subName] = Date.now();

    // Record woHistory
    if (!t.woHistory) t.woHistory = {};
    t.woHistory[absentName] = {
      originalTeam: oldEntry,
      partner: partner,
      matchNum: foundIdx + 1,
      replacedBy: subName,
      timestamp: Date.now()
    };

    subCount++;
    subDetails.push({ absent: absentName, sub: subName, oldEntry, newEntry, matchNum: foundIdx + 1 });
    window.AppStore.logAction(tId, `Substituição W.O. (auto): ${absentName} → ${subName}${partner ? ' (parceiro: ' + partner + ')' : ''} — Jogo ${foundIdx + 1}`);
  }

  if (subCount > 0) {
    // Sync immediate to Firestore
    if (typeof window.AppStore.syncImmediate === 'function') {
      window.AppStore.syncImmediate(tId);
    } else {
      window.AppStore.sync();
    }
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

// v2.3.82: chokepoint de permissão da presença. Regras:
//   • organizador / co-org / árbitro confirmado → marca/retira de QUALQUER um;
//   • torneio com placar pelos participantes (resultEntry players/all) → o
//     jogador marca a PRÓPRIA presença, exigindo GPS no local pra MARCAR
//     presente (retirar a própria presença é livre);
//   • qualquer outro caso → bloqueado com aviso.
// O organizador sempre pode dar/retirar (cai no 1º caso).
window._toggleCheckIn = function (tId, playerName) {
  const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
  const _wasIn = !!(t.checkedIn && t.checkedIn[playerName]);
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
  const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
  if (!t) return;
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  const wasCheckedIn = !!t.checkedIn[playerName];

  // Guard v2.2.8: jogadores na lista de espera por ausência devem ser reativados
  // via botão "Reverter" — toggle fica desabilitado na UI, isso é um safety net.
  if (!wasCheckedIn && t.absent && t.absent[playerName]) {
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

  if (wasCheckedIn) {
    // Desmarcar presença → volta ao estado "sem confirmação"
    delete t.checkedIn[playerName];
  } else {
    // Marcar presente → limpa ausência se existia
    t.checkedIn[playerName] = Date.now();
    delete t.absent[playerName];
  }
  window.FirestoreDB.saveTournament(t);

  // v1.0.87-beta: substituí o auto-trigger de _autoSubstituteWO (que tinha
  // dialog + race condition) pela função unificada _processWoSubstitutions.
  // Idempotente: lê estado fresh, processa todas pendências sem dialog,
  // atualiza match/participants/waitlists/checkedIn/woHistory atomicamente.
  // Toast só se houve sub.
  if (!wasCheckedIn) {
    const _result = window._processWoSubstitutions(tId);
    if (_result && _result.ok && _result.subCount > 0) {
      _result.subDetails.forEach(d => {
        if (typeof showNotification === 'function') {
          showNotification('✅ Substituição W.O.',
            `${d.sub} substituiu ${d.absent} — Jogo ${d.matchNum}`,
            'success');
        }
      });
    }
  }
  _reRenderParticipants();
};

window._markAbsent = function (tId, playerName) {
  const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
  if (!t) return;
  // v2.3.82: W.O. (declarar ausente / reverter) só por autoridade (org/co-org/
  // árbitro). O W.O. por consenso entre participantes virá num próximo passo.
  if (window._canManagePresence && !window._canManagePresence(t, window.AppStore && window.AppStore.currentUser)) {
    if (typeof showNotification === 'function') {
      showNotification('W.O.', 'Apenas o organizador ou o árbitro pode declarar W.O.', 'info');
    }
    return;
  }
  if (!t.absent) t.absent = {};
  if (!t.checkedIn) t.checkedIn = {};
  // v1.0.79-beta: revert completo. Detecta orphan (W.O.'d via woHistory) e,
  // se há replacedBy, desfaz substituição: restaura time original, remove
  // substituto da chave, devolve ele à waitlist se aplicável.
  const _woMeta = t.woHistory && t.woHistory[playerName];
  if (t.absent[playerName] || _woMeta) {
    // Trava: se o jogo do W.O. já foi jogado de verdade (placar lançado / placar
    // ao vivo iniciado), não dá pra reverter — reverter zeraria um resultado real.
    if (_woMeta && _woMeta.matchNum && typeof window._matchHasRealPlay === 'function') {
      const _allMchk = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t)
        : (Array.isArray(t.matches) ? t.matches.slice() : []);
      const _woMatchChk = _allMchk[_woMeta.matchNum - 1];
      if (_woMatchChk && window._matchHasRealPlay(_woMatchChk)) {
        if (typeof showNotification === 'function') {
          showNotification('W.O. não pode ser revertido', 'A partida já foi jogada (placar lançado ou placar ao vivo iniciado). O W.O. não é mais reversível.', 'warning');
        }
        return;
      }
    }
    // Desmarcar ausência → volta ao estado "sem confirmação"
    delete t.absent[playerName];
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
              delete t.checkedIn[_replacedBy];
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
      // Sempre limpa woHistory após revert
      delete t.woHistory[playerName];
    }
  } else {
    // Marcar ausente → limpa presença se existia
    t.absent[playerName] = Date.now();
    delete t.checkedIn[playerName];
  }
  window.FirestoreDB.saveTournament(t);
  _reRenderParticipants();
};

window._resetCheckIn = function (tId) {
  const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
  if (!t) return;
  t.checkedIn = {};
  t.absent = {};
  window.FirestoreDB.saveTournament(t);
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
  const t = window.AppStore.tournaments.find(tour => String(tour.id) === String(tId));
  if (!t) return;
  if (!t.checkedIn) t.checkedIn = {};
  const parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const present = [];
  const absentees = [];
  parts.forEach(function (p) {
    const en = window._pName(p);
    if (en && t.checkedIn[en]) present.push(p);
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
  const t = window.AppStore.tournaments.find(function (tour) { return String(tour.id) === String(tId); });
  if (!t) return;
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  const parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const present = [];
  const absentees = [];
  parts.forEach(function (p) {
    const en = window._pName(p);
    if (en && t.checkedIn[en]) present.push(p);
    else absentees.push(p);
  });

  if (mode === 'waitlist') {
    if (!Array.isArray(t.waitlist)) t.waitlist = [];
    absentees.forEach(function (p) {
      const en = window._pName(p);
      const exists = t.waitlist.some(function (w) { return window._pName(w) === en; });
      if (!exists) t.waitlist.push(p);
      // Estado neutro na lista de espera (pode ser chamado depois p/ substituir W.O.)
      delete t.checkedIn[en];
      delete t.absent[en];
    });
  } else { // disqualify
    if (!Array.isArray(t.disqualified)) t.disqualified = [];
    absentees.forEach(function (p) {
      const en = window._pName(p);
      const exists = t.disqualified.some(function (w) { return window._pName(w) === en; });
      if (!exists) t.disqualified.push(p);
      delete t.checkedIn[en];
      delete t.absent[en];
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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
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
  const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
  var inp = document.getElementById('part-search');
  if (inp) window._partSearch = inp.value;
  var q = (window._partSearch || '').trim().toLowerCase();
  var sort = (document.getElementById('part-sort') || {}).value || 'order-asc';
  var gf = (document.getElementById('part-gender') || {}).value || 'all';
  var sk = (document.getElementById('part-skill') || {}).value || 'all';
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-part-card]'));
  if (!cards.length) return;
  var shown = 0;
  cards.forEach(function (c) {
    var nm = c.getAttribute('data-part-name') || '';
    var g = c.getAttribute('data-part-gender') || 'none';
    var s = c.getAttribute('data-part-skill') || 'none';
    var okSearch = !q || nm.indexOf(q) !== -1;
    var okGender = gf === 'all' || g === gf;
    var okSkill = sk === 'all' || s === sk;
    var ok = okSearch && okGender && okSkill;
    c.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  // Ordenar: reordena os nós no container (DOM, focus-safe).
  var parent = cards[0].parentNode;
  if (parent) {
    cards.slice().sort(function (a, b) {
      // v2.7.29: VIPs SEMPRE fixados no topo (pedido do usuário — "no máximo fixar
      // no topo os vips"). VIP é a chave primária; o sort escolhido é secundário.
      var va = a.getAttribute('data-part-vip') === '1' ? 1 : 0;
      var vb = b.getAttribute('data-part-vip') === '1' ? 1 : 0;
      if (va !== vb) return vb - va;
      if (sort === 'name-asc' || sort === 'name-desc') {
        var r = (a.getAttribute('data-part-name') || '').localeCompare(b.getAttribute('data-part-name') || '', 'pt-BR', { sensitivity: 'base' });
        return sort === 'name-desc' ? -r : r;
      }
      var oa = parseInt(a.getAttribute('data-part-order') || '0', 10), ob = parseInt(b.getAttribute('data-part-order') || '0', 10);
      return sort === 'order-desc' ? (ob - oa) : (oa - ob);
    }).forEach(function (c) { parent.appendChild(c); });
  }
  var empty = document.getElementById('part-search-empty');
  if (empty) empty.style.display = (shown === 0 && cards.length > 0) ? '' : 'none';
};

window._toggleVip = function (tId, participantName) {
  const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
  if (!t) return;
  if (!t.vips) t.vips = {};
  if (t.vips[participantName]) {
    delete t.vips[participantName];
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
  let t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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

  // Merge both waitlist sources (dedup by name) — mesmo padrão de _autoSubstituteWO e bracket.js
  const _getName = p => window._pName(p);
  const _sp = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
  const _wl = Array.isArray(t.waitlist) ? t.waitlist : [];
  const _spNames = new Set(_sp.map(_getName));
  let standby = _sp.slice();
  _wl.forEach(w => { const wn = _getName(w); if (wn && !_spNames.has(wn)) standby.push(w); });
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
  } else if (hasStandby) {
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
    const _tFresh = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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

    // Marcar o jogador como ausente confirmado
    if (!t.checkedIn) t.checkedIn = {};
    if (!t.absent) t.absent = {};
    delete t.checkedIn[playerName];
    t.absent[playerName] = Date.now();

    // v0.17.35: rastreia woHistory IMEDIATAMENTE quando W.O. é decretado
    // (mesmo sem substituto). Pedido do usuário: card do W.O.'d aparece com
    // "Estava no Jogo N com [parceiro]" desde o momento da decretação, não
    // só após substituição. replacedBy é populado depois quando/se rolar sub.
    if (isIndividualWO && matchEntry) {
      const _sepEarly = teamName.includes(' / ') ? ' / ' : '/';
      const _membersEarly = teamName.split(_sepEarly).map(n => n.trim());
      const _partnerEarly = _membersEarly.find(n => n !== playerName) || '';
      if (!t.woHistory) t.woHistory = {};
      t.woHistory[playerName] = {
        originalTeam: teamName,
        partner: _partnerEarly,
        matchNum: friendlyNum,
        timestamp: Date.now()
      };
    }

    // v1.0.87-beta: refator agressivo. Antes a confirm callback tinha 3
    // branches duplicando lógica de substituição (ind W.O., team scope,
    // escalate W.O.) — cada um com captura de closure + race condition
    // potencial. Agora: callback só MARCA absent + sync + chama função
    // unificada _processWoSubstitutions(tId) que faz TUDO usando estado
    // fresh do AppStore. Idempotente: se já houver Presente standby,
    // substitui; se não, fica em "aguardando" (com toast claro).
    // Backup: se _processWoSubstitutions falhar (não existir, throw, etc),
    // cai no caminho legado abaixo.
    let _processed = false;
    if (typeof window._processWoSubstitutions === 'function') {
      try {
        // Sync immediate ANTES de chamar — garante que t.absent está no Firestore.
        // (Mutations locais já feitas; sync persiste.)
        window.AppStore.sync();
        const _result = window._processWoSubstitutions(tId);
        _processed = true;
        if (_result && _result.ok && _result.subCount > 0) {
          // Sub aconteceu — toast por cada
          _result.subDetails.forEach(d => {
            if (typeof showNotification === 'function') {
              showNotification('✅ Substituição W.O.',
                `${d.sub} substituiu ${d.absent} — Jogo ${d.matchNum}`,
                'success');
            }
          });
        } else {
          // Sem sub — descobrir por quê e mostrar toast informativo
          const tF = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
          const _spF = tF && Array.isArray(tF.standbyParticipants) ? tF.standbyParticipants : [];
          const _wlF = tF && Array.isArray(tF.waitlist) ? tF.waitlist : [];
          const _stbCount = _spF.length + _wlF.length;
          const _ciF = tF && tF.checkedIn || {};
          const _gN = p => window._pName(p);
          const _allStb = _spF.concat(_wlF);
          const _presCount = _allStb.filter(p => !!_ciF[_gN(p)]).length;
          if (typeof showNotification === 'function') {
            if (_stbCount === 0) {
              // Cenário (b) v1.0.82: lista vazia — escala pra W.O. de time (oponente vence)
              // Faz isso ANTES do toast: encerra match.
              const _allM = (typeof window._collectAllMatches === 'function')
                ? window._collectAllMatches(tF) : (Array.isArray(tF.matches) ? tF.matches : []);
              let _woMatch = null, _woSlot = null;
              for (let i = 0; i < _allM.length; i++) {
                const m = _allM[i]; if (!m || m.winner) continue;
                ['p1','p2'].forEach(s => {
                  if (_woMatch) return;
                  const e = m[s];
                  if (!e || e === 'TBD' || e === 'BYE') return;
                  const mb = e.includes('/') ? e.split('/').map(n => n.trim()) : [e];
                  if (mb.indexOf(playerName) !== -1) { _woMatch = m; _woSlot = s; }
                });
                if (_woMatch) break;
              }
              if (_woMatch) {
                const _opp = _woSlot === 'p1' ? 'p2' : 'p1';
                const _oppName = _woMatch[_opp];
                // Bug 3 fix (v2.1.89): adversário ainda TBD — não aplica W.O. para
                // evitar m.winner='TBD' propagando para rodadas seguintes.
                if (!_oppName || _oppName === 'TBD' || _oppName === 'BYE') {
                  window.AppStore.syncImmediate(tId);
                  showNotification('⚠️ Ausente registrado',
                    `${playerName} marcado ausente. Adversário ainda não definido — W.O. será aplicado quando o jogo estiver completo.`,
                    'warning');
                } else {
                  // Bug 1 fix (v2.1.89): W.O. individual de dupla sem substituto →
                  // parceiro vai para a lista de espera para novo emparelhamento.
                  const _absentEntry = _woMatch[_woSlot] || '';
                  if (_absentEntry.includes('/')) {
                    const _sepC = _absentEntry.includes(' / ') ? ' / ' : '/';
                    const _partnerC = _absentEntry.split(_sepC).map(function(n) { return n.trim(); }).find(function(n) { return n !== playerName; });
                    if (_partnerC) {
                      if (!Array.isArray(tF.standbyParticipants)) tF.standbyParticipants = [];
                      if (!tF.standbyParticipants.some(function(p) {
                        return (typeof p === 'string' ? p : (p.displayName || p.name || '')) === _partnerC;
                      })) {
                        tF.standbyParticipants.push(_partnerC);
                      }
                      showNotification('🔄 Parceiro na lista de espera',
                        `${_partnerC} foi adicionado à lista de espera para encontrar novo parceiro.`, 'info');
                    }
                  }
                  // v2.1.86: o marcador 'W.O.' vai no lado AUSENTE (perdedor); o
                  // vencedor é o oponente. Antes o 'W.O.' ficava no lado vencedor,
                  // dando a impressão de que o time que levou W.O. tinha vencido.
                  _woMatch.scoreP1 = _woSlot === 'p1' ? 'W.O.' : 0;
                  _woMatch.scoreP2 = _woSlot === 'p2' ? 'W.O.' : 0;
                  _woMatch.winner = _woMatch[_opp];
                  _woMatch.wo = true;
                  _woMatch.woAbsentSide = _woSlot;
                  if (typeof window._advanceWinner === 'function') {
                    try { window._advanceWinner(tF, _woMatch); } catch (_e) {}
                  }
                  window.AppStore.syncImmediate(tId);
                  showNotification('🏆 W.O. — oponente vence',
                    `${_woMatch.winner} vence por W.O. (lista de espera vazia).`,
                    'warning');
                }
              } else {
                showNotification('⚠️ Sem jogo pendente', `${playerName} marcado ausente.`, 'warning');
              }
            } else if (_presCount === 0) {
              showNotification('⚠️ Aguardando substituto presente',
                `Lista de espera tem ${_stbCount} pessoa(s), 0 Presente. ${playerName} marcado ausente.`,
                'warning');
            } else {
              // Tem Presente mas não substituiu — algo estranho. Logar pra debug.
              showNotification('⚠️ Falha na substituição',
                `Lista tem ${_presCount} Presente(s) mas substituição falhou. ${playerName} marcado ausente. Debug: window._lastProcessSubs`,
                'error');
            }
          }
        }
        _reRenderParticipants();
      } catch (_e) {
        window._error('[v1.0.87 _processWoSubstitutions] erro:', _e);
        _processed = false;
      }
    }
    if (_processed) return;

    // Caminho legado (fallback, executa só se _processWoSubstitutions falhou)
    if (isIndividualWO && matchEntry) {
      // Individual W.O. in teams — try to replace only the absent member, partner stays
      if (!t.checkedIn) t.checkedIn = {};
      // v0.17.37: FIFO real por TIMESTAMP de check-in — alinhado com a
      // ordem do display da Lista de Espera (bracket.js já ordena por
      // ci[name] ascendente). Antes pegava o primeiro DA ARRAY, ignorando
      // ordem de chegada → bug: usuário via Bot 15 como "próximo" no
      // display (porque checou primeiro), mas substituição pegava outro
      // que estava em posição menor no array (mais antigo na lista).
      let nextStandby = null;
      let nextStandbyIdx = -1;
      // v1.0.85-beta: filtro tolerante a TIMESTAMP (number) E TRUE (boolean).
      // Antes só `> 0` aceitava number — mas `_toggleCheckIn` set Date.now()
      // (number truthy >0), enquanto handlers de sub setam `t.checkedIn[x]=true`
      // (boolean). Em filter `o.ts > 0`: number cumpre, boolean `true > 0` em
      // teoria é true (true→1), MAS quando t.checkedIn[name] é STRING vazia
      // ou outro falsy estranho, o `|| 0` mascara. Trocar pra check de
      // TRUTHINESS direto cobre ambos os casos sem ambiguidade.
      const _presentSorted = standby
        .map((p, idx) => {
          const _name = window._pName(p);
          const _ci = t.checkedIn[_name];
          // ts numérico pra ordenar; truthy não-numérico (true) vira 1.
          const ts = typeof _ci === 'number' ? _ci : (_ci ? 1 : 0);
          return { p, idx, name: _name, ts, ciRaw: _ci };
        })
        .filter(o => o.ts > 0)
        .sort((a, b) => a.ts - b.ts);
      if (_presentSorted.length > 0) {
        nextStandby = _presentSorted[0].p;
        nextStandbyIdx = _presentSorted[0].idx;
      }
      // v1.0.85-beta: diagnóstico — snapshot ANTES da decisão de sub vs aguarda.
      try {
        window._lastDeclareAbsent = {
          version: window.SCOREPLACE_VERSION,
          at: new Date().toISOString(),
          callOrder: (window._lastDeclareAbsent && window._lastDeclareAbsent.callOrder || 0) + 1,
          playerName: playerName,
          teamName: teamName,
          matchSide: matchSide,
          friendlyNum: friendlyNum,
          isIndividualWO: isIndividualWO,
          hasStandby: hasStandby,
          standbyCount: standby.length,
          standbyDetail: standby.map(p => {
            const _n = window._pName(p);
            return { name: _n, ci: t.checkedIn[_n] };
          }),
          presentSortedCount: _presentSorted.length,
          presentSortedNames: _presentSorted.map(o => o.name + ' (ts=' + o.ts + ', ciRaw=' + JSON.stringify(o.ciRaw) + ')'),
          nextStandby: nextStandby ? (typeof nextStandby === 'string' ? nextStandby : (nextStandby.displayName || nextStandby.name)) : null,
          partsArrCount: partsArr.length,
          waitlistCount: Array.isArray(t.waitlist) ? t.waitlist.length : 0,
          standbyParticipantsCount: Array.isArray(t.standbyParticipants) ? t.standbyParticipants.length : 0
        };
      } catch (_e) {}
      if (!nextStandby) {
        // v1.0.82-beta: 2 cenários distintos quando não há substituto:
        // (a) waitlist NÃO vazia mas ninguém Presente → aguarda alguém da
        //     lista marcar Presente. Mantém comportamento atual.
        // (b) waitlist VAZIA (todos já entraram ou tiveram WO) → W.O.
        //     individual escala pra W.O. do TIME inteiro: oponente vence.
        // User: 'aguarda alguem da lista de espera aparecer ou se não for
        // mais possivel por estar vazia... dai então o WO de um membro
        // de um time vira WO do time todo.'
        if (standby.length > 0) {
          // Cenário (a): aguarda
          // v1.0.85-beta: snapshot pra diagnóstico
          try {
            window._lastDeclareAbsent = window._lastDeclareAbsent || {};
            window._lastDeclareAbsent.outcome = 'waited_no_presente';
          } catch (_e) {}
          window.AppStore.logAction(tId, `Ausência marcada: ${playerName} (${teamName}) — Jogo ${friendlyNum}. Aguardando substituto presente.`);
          window.AppStore.sync();
          // v1.0.85-beta: toast mais informativo — antes era genérico "ausência marcada".
          // Agora explica: lista tem N pessoa(s), 0 Presente. Se usuário esperava sub
          // automática (porque alguém ESTÁ Presente na lista), saberá que foi pra
          // 'aguarda' e poderá investigar via window._lastDeclareAbsent no console.
          if (typeof showNotification === 'function') {
            showNotification('⚠️ Aguardando substituto presente',
              `Lista de espera tem ${standby.length} pessoa(s), 0 Presente. ${playerName} marcado ausente. (debug: window._lastDeclareAbsent)`,
              'warning');
          }
          _reRenderParticipants();
          return;
        }
        // Cenário (b): waitlist vazia → escala pra W.O. de time
        const _opponentSide = matchSide === 'p1' ? 'p2' : 'p1';
        const _opponentName = matchEntry[_opponentSide];
        // Bug 3 fix (v2.1.89): adversário ainda TBD — não aplica W.O. para
        // evitar m.winner='TBD' propagando para rodadas seguintes como "TBD · por W.O.".
        if (!_opponentName || _opponentName === 'TBD' || _opponentName === 'BYE') {
          window.AppStore.logAction(tId, `Ausência marcada: ${playerName} (${teamName}) — adversário TBD, W.O. não aplicado automaticamente.`);
          window.AppStore.sync();
          if (typeof showNotification === 'function') showNotification('⚠️ Ausente registrado',
            `${playerName} marcado ausente. Adversário ainda não definido — verifique quando o jogo estiver completo.`, 'warning');
          _reRenderParticipants();
          return;
        }
        // Bug 1 fix (v2.1.89): W.O. individual de dupla sem substituto →
        // parceiro presente vai para a lista de espera para novo emparelhamento futuro.
        if (isIndividualWO) {
          const _sep2 = teamName.includes(' / ') ? ' / ' : '/';
          const _partnerN = teamName.split(_sep2).map(function(n) { return n.trim(); }).find(function(n) { return n !== playerName; });
          if (_partnerN) {
            if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
            if (!t.standbyParticipants.some(function(p) {
              return (typeof p === 'string' ? p : (p.displayName || p.name || '')) === _partnerN;
            })) {
              t.standbyParticipants.push(_partnerN);
            }
            if (typeof showNotification === 'function') showNotification('🔄 Parceiro na lista de espera',
              `${_partnerN} foi adicionado à lista de espera para encontrar novo parceiro.`, 'info');
          }
        }
        // v2.1.86: 'W.O.' no lado AUSENTE (perdedor); vencedor é o oponente.
        matchEntry.scoreP1 = matchSide === 'p1' ? 'W.O.' : 0;
        matchEntry.scoreP2 = matchSide === 'p2' ? 'W.O.' : 0;
        matchEntry.winner = matchEntry[_opponentSide];
        matchEntry.wo = true;
        matchEntry.woAbsentSide = matchSide;
        if (typeof window._advanceWinner === 'function') {
          try { window._advanceWinner(t, matchEntry); } catch (_e) {}
        } else if (matchEntry.nextMatchId) {
          const _next = (t.matches || []).find(_nm => _nm.id === matchEntry.nextMatchId);
          if (_next) {
            if (!_next.p1 || _next.p1 === 'TBD') _next.p1 = matchEntry.winner;
            else if (!_next.p2 || _next.p2 === 'TBD') _next.p2 = matchEntry.winner;
          }
        }
        window.AppStore.logAction(tId, `W.O. escalado: ${playerName} (${teamName}) ausente, lista de espera vazia → ${matchEntry.winner} vence Jogo ${friendlyNum} por W.O.`);
        window.AppStore.sync();
        if (typeof showNotification === 'function') showNotification(_t('sub.wo'), _t('sub.woMsg', { winner: matchEntry.winner, n: friendlyNum }), 'warning');
        _reRenderParticipants();
        return;
      }
      const nextName = typeof nextStandby === 'string' ? nextStandby : (nextStandby.displayName || nextStandby.name || nextStandby.email || '');
      // Build new team name replacing only the absent member
      const sep = teamName.includes(' / ') ? ' / ' : '/';
      const members = teamName.split(sep).map(n => n.trim());
      const newMembers = members.map(n => n === playerName ? nextName : n);
      const newTeamName = newMembers.join(' / ');
      const partnerName = members.find(n => n !== playerName) || '';

      // Update match
      matchEntry[matchSide] = newTeamName;
      // Update all match refs across ALL structures (matches, rounds, groups) — espelha _autoSubstituteWO.
      // Sem isso, em Liga/Suíço/Grupos outros jogos do mesmo time ficam com o nome antigo
      // e o card do parceiro (renderParticipants) mostra jogo vinculado ao time antigo.
      const _allStructMatches = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t)
        : (Array.isArray(t.matches) ? t.matches.slice() : []);
      _allStructMatches.forEach(function(m) {
        if (!m) return;
        if (m.p1 === teamName) m.p1 = newTeamName;
        if (m.p2 === teamName) m.p2 = newTeamName;
        // team1/team2 arrays (formato Rei/Rainha)
        if (Array.isArray(m.team1)) {
          const ti = m.team1.indexOf(playerName);
          if (ti !== -1) m.team1[ti] = nextName;
        }
        if (Array.isArray(m.team2)) {
          const ti2 = m.team2.indexOf(playerName);
          if (ti2 !== -1) m.team2[ti2] = nextName;
        }
      });
      // Update participants
      const pIdx = partsArr.findIndex(p => {
        const pn = window._pName(p);
        return pn === teamName;
      });
      if (pIdx >= 0) {
        if (typeof partsArr[pIdx] === 'string') partsArr[pIdx] = newTeamName;
        else {
          partsArr[pIdx].displayName = newTeamName;
          partsArr[pIdx].name = newTeamName;
          // nested .participants[] (se existir) também precisa refletir o novo membro —
          // caso contrário helpers que leem sub-objetos (ex: _buildMatchPlayersList em bracket-ui.js)
          // continuam achando o jogador ausente.
          if (Array.isArray(partsArr[pIdx].participants)) {
            partsArr[pIdx].participants.forEach(function(sub) {
              if (!sub) return;
              const sn = typeof sub === 'string' ? sub : (sub.displayName || sub.name || '');
              if (sn === playerName) {
                if (typeof sub === 'object') {
                  sub.displayName = nextName;
                  sub.name = nextName;
                  // uid/photoURL do substituto (se disponível no objeto nextStandby)
                  if (typeof nextStandby === 'object' && nextStandby) {
                    if (nextStandby.uid) sub.uid = nextStandby.uid;
                    if (nextStandby.photoURL || nextStandby.photoUrl) sub.photoURL = nextStandby.photoURL || nextStandby.photoUrl;
                    if (nextStandby.email) sub.email = nextStandby.email;
                  }
                }
              }
            });
          }
        }
      }
      // v1.0.78-beta: torneios em modo Individual com sorteio em duplas têm
      // entradas POR INDIVIDUAL. Substituto vindo da waitlist precisa ser
      // adicionado a t.participants pra aparecer na lista de inscritos.
      const _hasNextEntry = partsArr.some(function(p) {
        const _n = window._pName(p);
        return _n === nextName;
      });
      if (!_hasNextEntry) {
        partsArr.push(typeof nextStandby === 'string' ? nextName : nextStandby);
      }
      t.participants = partsArr;
      _removeFromWaitlists(nextName);
      t.checkedIn[nextName] = true;

      // v0.17.34: track W.O. history pra mostrar o jogador W.O.'d como
      // entrada solo nos inscritos com nota "Estava no Jogo N com X".
      // Pedido do usuário: "ele não tem a dupla formada no sorteio ao
      // ser decretado W.O. (apenas menciona no card dele que estava no
      // jogo n com o parceiro x)."
      if (!t.woHistory) t.woHistory = {};
      t.woHistory[playerName] = {
        originalTeam: teamName,
        partner: partnerName,
        matchNum: friendlyNum,
        replacedBy: nextName,
        timestamp: Date.now()
      };

      // v1.0.85-beta: snapshot pós-sub pra diagnóstico (acumula sobre o
      // snapshot pré-sub gravado mais cedo).
      try {
        window._lastDeclareAbsent = window._lastDeclareAbsent || {};
        window._lastDeclareAbsent.outcome = 'individual_sub_done';
        window._lastDeclareAbsent.newTeamName = newTeamName;
        window._lastDeclareAbsent.matchAfter_p1 = matchEntry.p1;
        window._lastDeclareAbsent.matchAfter_p2 = matchEntry.p2;
        window._lastDeclareAbsent.partsArrAfterCount = partsArr.length;
        window._lastDeclareAbsent.partsArrIncludesNew = partsArr.some(p => {
          const _n = window._pName(p);
          return _n === nextName;
        });
        window._lastDeclareAbsent.partsArrIncludesNewTeam = partsArr.some(p => {
          const _n = window._pName(p);
          return _n === newTeamName;
        });
      } catch (_e) {}

      window.AppStore.logAction(tId, `Substituição individual: ${playerName} → ${nextName} (parceiro: ${partnerName}) — Jogo ${friendlyNum}`);
      window.AppStore.sync();
      if (typeof showNotification === 'function') showNotification(_t('sub.done'), _t('sub.donePartnerMsg', { name: nextName, absent: playerName, partner: partnerName }), 'success');
      _reRenderParticipants();

    } else if (hasStandby && matchEntry) {
      // Team W.O. scope — promote next standby to replace entire team
      if (!t.checkedIn) t.checkedIn = {};
      // v0.17.37: FIFO real por timestamp — mesma regra do W.O. individual.
      // Pra equipes da lista de espera, "presente" = todos os membros checados.
      // Timestamp do MENOR membro vence (a equipe ficou completa quando o
      // último checou).
      let nextStandby = null;
      let nextStandbyIdx = -1;
      const _eligibleSorted = standby
        .map((p, idx) => {
          const sName = window._pName(p);
          const sMembers = sName.includes('/') ? sName.split('/').map(n => n.trim()).filter(n => n) : [sName];
          const allPresent = sMembers.every(m => !!t.checkedIn[m]);
          if (!allPresent) return null;
          // Timestamp da equipe = MAIOR ts dos membros (último a chegar
          // completou a equipe). Equipes que completaram mais cedo entram
          // primeiro.
          const teamTs = sMembers.reduce((max, m) => Math.max(max, t.checkedIn[m] || 0), 0);
          return { p, idx, ts: teamTs };
        })
        .filter(o => o !== null)
        .sort((a, b) => a.ts - b.ts);
      if (_eligibleSorted.length > 0) {
        nextStandby = _eligibleSorted[0].p;
        nextStandbyIdx = _eligibleSorted[0].idx;
      }
      if (!nextStandby) {
        if (typeof showNotification === 'function') showNotification(_t('sub.noSubPresent'), _t('sub.noSubPresentMsgLong'), 'warning');
        return;
      }
      const nextName = typeof nextStandby === 'string' ? nextStandby : (nextStandby.displayName || nextStandby.name || nextStandby.email || '');

      matchEntry[matchSide] = nextName;
      const pIdx = partsArr.findIndex(p => {
        const pn = window._pName(p);
        return pn === teamName;
      });
      if (pIdx >= 0) partsArr[pIdx] = nextName;
      // v1.0.81-beta: garante que substituto exista em t.participants
      // como individual (modo Individual com sorteio em duplas). Mesmo
      // bug do v1.0.78 mas em outro caminho — branch 'Team W.O. scope'.
      // User: 'parece que o primeiro a substituir adota 1 caminho e os
      // demais adotam outro... deveria haver apenas 1 caminho'.
      const _hasNextEntryTeam = partsArr.some(function(p) {
        const _n = window._pName(p);
        return _n === nextName;
      });
      if (!_hasNextEntryTeam) {
        partsArr.push(typeof nextStandby === 'string' ? nextName : nextStandby);
      }
      t.participants = partsArr;
      _removeFromWaitlists(nextName);

      window.AppStore.logAction(tId, `Ausência: ${playerName} (${teamName}) substituído por ${nextName} da lista de espera — Jogo ${friendlyNum}`);
      window.AppStore.sync();
      if (typeof showNotification === 'function') showNotification(_t('sub.done'), _t('sub.doneTeamMsg', { name: nextName, absent: teamName, n: friendlyNum }), 'success');
      _reRenderParticipants();

    } else if (matchEntry) {
      // W.O. — adversário vence (no standby, team scope)
      // v2.1.86: 'W.O.' no lado AUSENTE (perdedor); vencedor é o oponente.
      matchEntry.scoreP1 = matchSide === 'p1' ? 'W.O.' : 0;
      matchEntry.scoreP2 = matchSide === 'p2' ? 'W.O.' : 0;
      matchEntry.winner = matchEntry[opponentSide];
      matchEntry.wo = true;
      matchEntry.woAbsentSide = matchSide;

      if (typeof _advanceWinner === 'function') {
        _advanceWinner(t, matchEntry);
      } else if (matchEntry.nextMatchId) {
        const next = (t.matches || []).find(nm => nm.id === matchEntry.nextMatchId);
        if (next) {
          if (!next.p1 || next.p1 === 'TBD') next.p1 = matchEntry.winner;
          else if (!next.p2 || next.p2 === 'TBD') next.p2 = matchEntry.winner;
        }
      }

      window.AppStore.logAction(tId, `W.O.: ${teamName} ausente — ${matchEntry.winner} vence Jogo ${friendlyNum} por W.O.`);
      window.AppStore.sync();
      if (typeof showNotification === 'function') showNotification(_t('sub.wo'), _t('sub.woMsg', { winner: matchEntry.winner, n: friendlyNum }), 'warning');
      _reRenderParticipants();

    } else {
      // Nenhum jogo pendente encontrado — apenas marca ausente e sincroniza
      window.AppStore.logAction(tId, `Ausência: ${playerName} — sem jogo pendente`);
      window.AppStore.sync();
      if (typeof showNotification === 'function') showNotification(_t('sub.absent'), _t('sub.absentMsg', { name: playerName }), 'warning');
      _reRenderParticipants();
    }
  }, null, { type: 'warning', confirmText: confirmBtn, cancelText: _t('btn.waitMore') });
};

function renderParticipants(container, tournamentId) {
  const tId = tournamentId;
  const t = tId && window.AppStore ? window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString()) : null;

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
  function _metaSlotsFor(p, pName, isTeam) {
    return (typeof window._profileMetaSlots === 'function')
      ? window._profileMetaSlots(p, pName, isTeam, t, isOrg) : '';
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
    if (absent[name]) return false;
    if (checkedIn[name]) return true;
    if (name.indexOf('/') !== -1) {
      const ms = name.split('/').map(s => s.trim()).filter(Boolean);
      if (ms.length >= 2 && ms.every(m => !!checkedIn[m])) return true;
    }
    return false;
  };
  const _entryAbsent = (name) => {
    if (!name) return false;
    if (absent[name]) return true;
    if (name.indexOf('/') !== -1) {
      const ms = name.split('/').map(s => s.trim()).filter(Boolean);
      if (ms.length >= 2 && ms.some(m => !!absent[m])) return true;
    }
    return false;
  };
  // Pós-sorteio antes de iniciar: presença visível em modo somente leitura
  // (a chamada já foi feita; alterações de presença vêm pelo check-in pós-início).
  // Só ativa se HOUVE chamada (algum check-in/ausência) — torneios que não usam
  // chamada mantêm a grade normal pós-sorteio, sem rótulos de presença.
  const _hasRollCallData = Object.keys(checkedIn).length > 0 || Object.keys(absent).length > 0;
  const postDrawPresence = isOrg && drawDone && !canCheckIn && !isFinished && _hasRollCallData;

  // Standby participants — merge both sources (waitlist + standbyParticipants, dedup by name)
  // mesmo padrão de _declareAbsent, _autoSubstituteWO e bracket.js
  const _getStandbyName = p => window._pName(p);
  const _sp = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
  const _wl = Array.isArray(t.waitlist) ? t.waitlist : [];
  const _spNameSet = new Set(_sp.map(_getStandbyName));
  const standbyParts = _sp.slice();
  _wl.forEach(w => { const wn = _getStandbyName(w); if (wn && !_spNameSet.has(wn)) standbyParts.push(w); });

  // Count stats (includes standby): 3 states — presente, ausente, sem confirmação
  let totalIndividuals = 0;
  let checkedCount = 0;
  let absentConfirmedCount = 0;
  const countIndividuals = (arr) => {
    arr.forEach(p => {
      const pName = window._pName(p);
      if (pName.includes('/')) {
        pName.split('/').forEach(n => {
          const nm = n.trim();
          if (nm) { totalIndividuals++; if (checkedIn[nm]) checkedCount++; else if (absent[nm]) absentConfirmedCount++; }
        });
      } else {
        if (pName) { totalIndividuals++; if (checkedIn[pName]) checkedCount++; else if (absent[pName]) absentConfirmedCount++; }
      }
    });
  };
  countIndividuals(parts);
  if (canCheckIn) countIndividuals(standbyParts);

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

  if (canCheckIn) {
    // ── Check-in mode: individual list with checkboxes ──
    // v2.7.28: card ÚNICO — pós-sorteio usa a MESMA grade rica do pré-sorteio
    // (o jogo/parceiro/adversários/presença entram dentro do card).
    gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:1rem;';

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
    // v0.17.35: jogadores em t.woHistory são pulados aqui — eles aparecem
    // só via card solo de orphan (loop abaixo). Evita aparecer 2x.
    const _woHist = (t.woHistory && typeof t.woHistory === 'object') ? t.woHistory : {};
    parts.forEach((p, idx) => {
      const pName = typeof p === 'string' ? p : (p.displayName || p.name || p.email || _t('participants.participant', {n: idx + 1}));
      const isTeam = pName.includes('/');
      const namesToProcess = isTeam ? pName.split('/').map(n => n.trim()).filter(n => n) : [pName];
      namesToProcess.forEach(n => {
        if (_woHist[n]) return; // skip W.O.'d member — solo card via woHistory loop
        // v0.17.36: lookup por nome do membro (source of truth: match atual).
        // memberToTeam dá o team string da match — pode diferir de pName se
        // t.participants estiver stale após substituição.
        const matchNum = memberToMatch[n] || null;
        const matchDecided = !!memberToMatchDecided[n];
        const opponent = memberToOpponent[n] || null;
        const currentTeam = memberToTeam[n] || (isTeam ? pName : null);
        allIndividuals.push({ name: n, teamName: currentTeam, teamIdx: idx, matchNum, matchDecided, opponent });
      });
    });

    // Add standby participants
    standbyParts.forEach((p, idx) => {
      const pName = typeof p === 'string' ? p : (p.displayName || p.name || p.email || 'Espera ' + (idx + 1));
      if (pName.includes('/')) {
        pName.split('/').map(n => n.trim()).filter(n => n).forEach(n => {
          allIndividuals.push({ name: n, teamName: pName, teamIdx: -1, matchNum: null, matchDecided: false, opponent: null, isStandby: true });
        });
      } else {
        allIndividuals.push({ name: pName, teamName: null, teamIdx: -1, matchNum: null, matchDecided: false, opponent: null, isStandby: true });
      }
    });

    // v0.17.34: Add W.O.'d orphan players (out of team, displayed solo with
    // note "Estava no Jogo N com [partner]"). Pedido do usuário: o jogador
    // que teve W.O. decretado deve sair do time e ter card solo mencionando
    // o jogo e parceiro original.
    if (t.woHistory && typeof t.woHistory === 'object') {
      Object.keys(t.woHistory).forEach(woName => {
        if (!woName) return;
        const meta = t.woHistory[woName];
        if (!meta || typeof meta !== 'object') return;
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
    var _partEnrollIdx = {};
    (Array.isArray(t.participants) ? t.participants : []).forEach(function (p, i) {
      var nm = String((window._pName ? window._pName(p, '') : (p.displayName || p.name || '')) || '').toLowerCase();
      nm.split(' / ').forEach(function (n) { n = n.trim(); if (n && _partEnrollIdx[n] == null) _partEnrollIdx[n] = i; });
    });

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
          woName: k,
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
      const mc = !!checkedIn[ind.name];
      // v0.17.34: W.O. orphan = jogador que teve W.O. decretado e foi
      // substituído. Foi removido do time, agora é solo com nota.
      const isWOOrphan = !!ind.isWOOrphan;
      const isAbsent = isWOOrphan ? true : !!absent[ind.name];
      const isPending = !mc && !isAbsent;
      if (currentFilter === 'present' && !mc) return '';
      if (currentFilter === 'absent' && !isAbsent) return '';
      if (currentFilter === 'pending' && !isPending) return '';

      const safeName = ind.name.replace(/'/g, "\\'");

      // Build sub-info with presence dots (3 states: green=presente, red=ausente, gray=aguardando)
      const dotHtml = (name) => {
        const p = !!checkedIn[name];
        const a = !!absent[name];
        const dotColor = p ? '#10b981' : a ? '#ef4444' : '#64748b';
        const textColor = p ? '#4ade80' : a ? '#f87171' : '#94a3b8';
        return `<span style="display:inline-flex;align-items:center;gap:2px;"><span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0;"></span><span style="font-size:0.7rem;color:${textColor};">${name}</span></span>`;
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
        const members = teamStr.includes('/') ? teamStr.split('/').map(n => n.trim()).filter(n => n).filter(n => !_woHist[n]) : [teamStr];
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
      const presentToggle = `<label class="toggle-switch toggle-sm" style="--toggle-on-bg:#10b981;--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:#10b981;flex-shrink:0;${isAbsentStandby ? 'opacity:0.35;cursor:not-allowed;pointer-events:none;' : ''}" onclick="event.stopPropagation();"><input type="checkbox" ${mc ? 'checked' : ''} ${isAbsentStandby ? 'disabled' : `onclick="event.stopPropagation(); window._toggleCheckIn('${tId}', '${safeName}');"`}><span class="toggle-slider"></span></label><span style="font-size:0.68rem;font-weight:700;color:${mc ? '#4ade80' : '#64748b'};white-space:nowrap;">${mc ? 'Presente' : 'Ausente'}</span>`;

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
        ? window._woBtnHtml('event.stopPropagation(); ' + woAction, !isAbsent, { label: woLabel, size: 'btn-micro', fontSize: '0.7rem' })
        : '';
      // v2.2.0: badge W.O. só aparece quando ESTE jogador está em t.absent —
      // não deve aparecer no parceiro presente nem em quem simplesmente não
      // fez check-in. A partida ter wo:true é info de resultado do jogo, não
      // de status individual do jogador.
      const woBadge = isAbsent ? `<div style="font-size:0.7rem;font-weight:800;padding:4px 12px;border-radius:8px;background:rgba(239,68,68,0.15);color:#f87171;flex-shrink:0;border:1px solid rgba(239,68,68,0.3);">W.O.</div>` : '';

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

      // VIP check (by individual name or team name)
      const vipMap = t.vips || {};
      const isVipPlayer = !!vipMap[ind.name] || (ind.teamName && !!vipMap[ind.teamName]);
      const vipTag = isVipPlayer ? '<span style="background:linear-gradient(135deg,#eab308,#fbbf24);color:#1a1a2e;font-size:0.55rem;font-weight:900;padding:1px 5px;border-radius:3px;letter-spacing:0.5px;flex-shrink:0;">💎 VIP</span>' : '';

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
          const _presentCount = _uniq.filter(n => !!checkedIn[n]).length;
          if (_presentCount === _uniq.length) { _jogoColor = '#4ade80'; _jogoOpacity = '0.95'; _jogoWeight = '800'; }
          else if (_presentCount > 0) { _jogoColor = '#fbbf24'; _jogoOpacity = '0.95'; _jogoWeight = '800'; }
        }
      }
      const jogoInline = matchLabel
        ? `<span style="font-weight:${_jogoWeight};color:${_jogoColor};opacity:${_jogoOpacity};font-size:0.72rem;white-space:nowrap;margin-left:6px;">${matchLabel}</span>`
        : '';
      // v2.2.0: strikethrough só quando isAbsent (player em t.absent) —
      // não quando isWO (match-level). Parceiro presente não deve ter riscado.
      const nameCell = `<div style="display:flex;align-items:baseline;gap:6px;min-width:0;"><span style="font-weight:600;font-size:0.92rem;color:${nameColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isAbsent ? 'text-decoration:line-through;text-decoration-color:rgba(248,113,113,0.4);' : ''}${isOrg ? 'cursor:text;' : ''}" ${isOrg ? `onclick="event.stopPropagation();window._editParticipantName('${tId}','${safeName}')" title="Clique para editar"` : ''}>${_safeName}</span>${vipTag}${isStandby ? presenceDot : ''}${jogoInline}</div>`;
      // Inline layout: name+Jogo anchored to top-left, teams stack to the right, "vs" at top-right.
      // Mobile (< 768px) falls back to name on top, matchup block below.
      // v2.7.28: card único em grade → célula estreita; sempre empilha (nome em
      // cima, jogo embaixo) pra não estourar a coluna de ~240px.
      const _isNarrow = true;
      let infoBlock;
      if (isWOOrphan && ind.woMeta) {
        // v0.17.35: W.O. orphan card — só "Estava no Jogo N com [parceiro]".
        // Pedido do usuário: "deveria aparecer o número do jogo que ele
        // estava antes do W.O. e seu parceiro antes do W.O. SÓ ISSO."
        // Removido "substituído por [substituto]" — info redundante (o
        // substituto aparece no próprio time agora).
        const _woNameSafe = (ind.woMeta.partner || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const _woMatchNum = ind.woMeta.matchNum || '?';
        const _woNote = `<div style="font-size:0.7rem;color:#f87171;margin-top:3px;font-weight:600;">❌ W.O. — Estava no Jogo ${_woMatchNum}${_woNameSafe ? ` com <span style="color:#94a3b8;font-weight:500;">${_woNameSafe}</span>` : ''}</div>`;
        infoBlock = nameCell + _woNote;
      } else if (hasMatchup && !_isNarrow) {
        infoBlock = `<div style="display:grid;grid-template-columns:auto 1fr auto;column-gap:10px;align-items:start;min-width:0;">${nameCell}${teamsCell || '<span></span>'}${vsCell || '<span></span>'}</div>`;
      } else if (hasMatchup) {
        const matchupRow = `<div style="display:grid;grid-template-columns:auto auto;column-gap:8px;align-items:start;margin-top:3px;">${teamsCell || '<span></span>'}${vsCell || '<span></span>'}</div>`;
        infoBlock = nameCell + matchupRow;
      } else {
        infoBlock = nameCell;
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
          _ciSkillHtml = `<select onchange="event.stopPropagation();window._setParticipantSkillCategory('${tId}','${_ciNameSafe}',this.value)" onclick="event.stopPropagation()" style="font-size:0.68rem;font-weight:700;padding:1px 4px;border-radius:6px;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);cursor:pointer;margin-top:3px;"><option value="" ${!_ciCurrentSkill ? 'selected' : ''}>— nível</option>${_ciOpts}</select>`;
        }
      }

      const _ciPart = _nameToParticipant[ind.name];
      const _ciInactive = (_ciPart && _ciPart.ligaActive === false) ? '1' : '0';
      const _ciGender = (typeof window._canonGender === 'function') ? window._canonGender(_ciPart && _ciPart.gender) : 'none';
      const _ciSkillVal = _ciCurrentSkill || 'none';
      const _ciOrder = (_partEnrollIdx[(ind.name || '').toLowerCase().trim()] != null) ? _partEnrollIdx[(ind.name || '').toLowerCase().trim()] : 9999;
      // v2.7.28: CARD ÚNICO — mesmo shell rico do pré-sorteio (gradiente roxo/VIP +
      // nº de inscrição em marca d'água), mas com o jogo/parceiro/adversários
      // (infoBlock) + toggle Presente + W.O. dentro dele. Presença vira borda/glow
      // (verde=presente, vermelho=ausente, âmbar=lista de espera) — sem perder a
      // leitura rápida de quem está presente.
      const _riGrad = isVipPlayer
        ? 'linear-gradient(135deg, rgba(161,98,7,0.5) 0%, rgba(234,179,8,0.35) 100%)'
        : 'linear-gradient(135deg, rgba(67,56,202,0.6) 0%, rgba(99,102,241,0.6) 100%)';
      const _riBorder = mc ? '2px solid rgba(16,185,129,0.7)'
        : isAbsent ? '2px solid rgba(239,68,68,0.55)'
        : isStandby ? '2px solid rgba(251,191,36,0.5)'
        : '1px solid rgba(99,102,241,0.5)';
      const _riGlow = mc ? 'box-shadow:0 0 0 1px rgba(16,185,129,0.45),0 4px 10px rgba(0,0,0,0.12);' : 'box-shadow:0 4px 10px rgba(0,0,0,0.1);';
      const _riDim = isAbsent ? 'opacity:0.62;' : (isWOOrphan ? 'opacity:0.75;' : '');
      const _riNum = (typeof _ciOrder === 'number' && _ciOrder !== 9999) ? (_ciOrder + 1) : '';
      const _riWoBadge = isWOOrphan ? '<div style="font-size:0.64rem;font-weight:800;padding:3px 9px;border-radius:8px;background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.35);">W.O.</div>' : woBadge;
      return `
        <div class="participant-card" data-part-card="1" data-part-vip="${isVipPlayer ? '1' : '0'}" data-part-name="${(ind.name || '').toLowerCase().replace(/"/g, '&quot;')}" data-part-inactive="${_ciInactive}" data-part-gender="${_ciGender}" data-part-skill="${String(_ciSkillVal).replace(/"/g, '&quot;')}" data-part-order="${_ciOrder}" style="background:${_riGrad};border:${_riBorder};border-radius:12px;padding:12px;position:relative;overflow:hidden;${_riGlow}${_riDim}transition:all 0.2s;">
            ${_riNum !== '' ? `<div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:${String(_riNum).length > 2 ? '2.4rem' : '3rem'};font-weight:900;color:rgba(255,255,255,0.08);line-height:1;pointer-events:none;user-select:none;">${_riNum}</div>` : ''}
            <div style="position:relative;z-index:1;display:flex;align-items:center;gap:10px;">
                <img src="${_pAvatar}" ${_pAvatarErr} data-player-name="${_safeName}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${mc ? 'rgba(16,185,129,0.5)' : isAbsent ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.18)'};${isWOOrphan ? 'filter:grayscale(0.5);' : ''}" />
                <div style="flex:1;min-width:0;overflow:hidden;">
                    ${standbyHeader}
                    ${infoBlock}
                    ${_metaSlotsFor(_nameToParticipant[ind.name], ind.name, false)}
                    ${_ciSkillHtml}
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">
                    ${_riWoBadge}
                    ${(_showActions && !isAbsent) ? presentToggle : ''}
                    ${_showActions ? woBtn : ''}
                </div>
            </div>
        </div>`;
    }).join('');

  } else {
    // ── Normal mode: team cards with drag/split/delete ──
    gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:1rem;';

    cardsStr = parts.map((p, idx) => {
      const pName = typeof p === 'string' ? p : (p.displayName || p.name || p.email || _t('participants.participant', {n: idx + 1}));
      const isTeam = pName.includes('/');

      // v2.1.86/v2.2.40: estado da CHAMADA (por entry) + filtro presente/ausente/aguardando.
      // Vale na chamada pré-sorteio (interativa) e pós-sorteio antes de iniciar (leitura).
      const _showPres = canRollCall || postDrawPresence;
      const rcMc = _showPres && _entryPresent(pName);
      const rcAbs = _showPres && !rcMc && _entryAbsent(pName);
      const rcPend = _showPres && !rcMc && !rcAbs;
      if (_showPres) {
        if (currentFilter === 'present' && !rcMc) return '';
        if (currentFilter === 'absent' && !rcAbs) return '';
        if (currentFilter === 'pending' && !rcPend) return '';
      }

      const vipsMap = t.vips || {};
      const isVipEarly = !!vipsMap[pName];
      let cardStyle = '';
      if (isVipEarly) {
        cardStyle = 'background: linear-gradient(135deg, rgba(161,98,7,0.5) 0%, rgba(234,179,8,0.35) 100%); border: 2px solid rgba(251,191,36,0.7); box-shadow: 0 0 12px rgba(251,191,36,0.15);';
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
        }).join('');
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
        pNameHtml = `<div style="display:flex;align-items:center;gap:8px;overflow:hidden;"><img src="${_pPhotoN}" ${_pErrN} data-player-name="${_pNameH}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span ${_editAttrN}>${_pNameH}</span></div>`;
      }

      const vips = t.vips || {};
      const safeP = pName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const isVip = !!vips[pName];
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
      const typeText = teamLabel + vipBadge;

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
        if (isOrg) {
          // v2.3.50: dropdown de atribuição de nível pelo organizador. Pra
          // não-organizador o nível já aparece no badge de meta (gênero ·
          // categoria · idade) abaixo do nome — não duplica aqui.
          const _nmOpts = _nmSkillCats.map(sk => `<option value="${sk}" ${_nmCurrentSkill === sk ? 'selected' : ''}>${sk}</option>`).join('');
          _nmSkillHtml = `<select onchange="event.stopPropagation();window._setParticipantSkillCategory('${t.id}','${safeP}',this.value)" onclick="event.stopPropagation()" style="font-size:0.68rem;font-weight:700;padding:1px 4px;border-radius:6px;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);cursor:pointer;margin-top:4px;"><option value="" ${!_nmCurrentSkill ? 'selected' : ''}>— nível</option>${_nmOpts}</select>`;
        }
      }

      let actionsDiv = '';
      let dragProps = '';
      // v2.0.0: botão "Desfazer mesclagem" — aparece quando o card resultou de
      // uma mesclagem (p._mergedFrom), em qualquer estado do torneio.
      let undoMergeBtn = '';
      if (isOrg && p && typeof p === 'object' && p._mergedFrom) {
        undoMergeBtn = `<button class="btn btn-micro" title="Desfazer mesclagem" style="background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px dashed rgba(251,191,36,0.5);" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='none'" onclick="event.stopPropagation(); window._undoMergeParticipant('${t.id}', '${safeP}');">↩️</button>`;
      }
      if (isOrg) {
        // v2.0.0: drag habilitado pro organizador também — a MESCLAGEM funciona
        // enquanto a grade estiver visível (inclui o estado "sorteado, antes de
        // iniciar"). Formar equipe / VIP / remover continuam só pré-sorteio.
        dragProps = `draggable="true" ondragstart="window.handleDragStart(event, ${idx}, '${t.id}')" ondragend="window.handleDragEnd(event)" ondragover="window.handleDragOver(event)" ondragenter="window.handleDragEnter(event)" ondragleave="window.handleDragLeave(event)" ondrop="window.handleDropTeam(event, ${idx})"`;
        if (!drawDone) {
          const vipBtn = `<button class="btn btn-micro" title="${isVip ? _t('tourn.removeVip') : _t('tourn.markVip')}" style="background: ${isVip ? 'linear-gradient(135deg,rgba(234,179,8,0.35),rgba(251,191,36,0.25))' : 'rgba(234,179,8,0.08)'}; color: ${isVip ? '#fbbf24' : '#a3842a'}; border: 1px ${isVip ? 'solid' : 'dashed'} ${isVip ? 'rgba(251,191,36,0.6)' : 'rgba(234,179,8,0.3)'}; letter-spacing: 0.5px;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='none'" onclick="event.stopPropagation(); window._toggleVip('${t.id}', '${safeP}');">💎 VIP</button>`;
          const delBtn = `<button class="btn btn-micro" title="${_t('btn.remove')}" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px dashed #ef4444;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='none'" onclick="event.stopPropagation(); window.removeParticipantFunction('${t.id}', '${safeP}');">🗑️</button>`;
          let splitBtn = '';
          if (pName.includes('/')) {
            splitBtn = `<button class="btn btn-micro" title="${_t('participants.splitTeam')}" style="background: rgba(14,165,233,0.1); color: #38bdf8; border: 1px dashed #0ea5e9;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='none'" onclick="event.stopPropagation(); window.splitParticipantFunction('${t.id}', '${safeP}');">✂️</button>`;
          }
          actionsDiv = `<div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px;">${vipBtn}${splitBtn}${undoMergeBtn}${delBtn}</div>`;
        } else if (undoMergeBtn) {
          actionsDiv = `<div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px;">${undoMergeBtn}</div>`;
        }
      }

      // v2.1.86: linha de presença da CHAMADA pré-sorteio (só organizador, antes do sorteio).
      // Reusa _toggleCheckIn / _markAbsent, que já gravam em t.checkedIn / t.absent
      // pela chave do entry (time "A / B" ou individual). Pré-sorteio não há matches,
      // então _processWoSubstitutions é no-op e _markAbsent só alterna o flag.
      let rollCallRow = '';
      if (canRollCall) {
        const _rcEntry = pName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const _rcLabel = rcMc ? 'Presente' : rcAbs ? 'Ausente' : 'Aguardando';
        const _rcColor = rcMc ? '#4ade80' : rcAbs ? '#f87171' : '#cbd5e1';
        const _rcWoBtn = (!rcMc && isOrg)
          ? window._woBtnHtml(`event.stopPropagation(); window._markAbsent('${t.id}', '${_rcEntry}');`, !rcAbs, { label: rcAbs ? 'Reverter' : 'W.O.', size: 'btn-micro', fontSize: '0.68rem' })
          : '';
        rollCallRow = `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.14);" onclick="event.stopPropagation();">
          <label class="toggle-switch toggle-sm" style="--toggle-on-bg:#10b981;--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:#10b981;flex-shrink:0;" onclick="event.stopPropagation();"><input type="checkbox" ${rcMc ? 'checked' : ''} onclick="event.stopPropagation(); window._toggleCheckIn('${t.id}', '${_rcEntry}');"><span class="toggle-slider"></span></label>
          <span style="flex:1;font-size:0.74rem;font-weight:800;color:${_rcColor};white-space:nowrap;">${_rcLabel}</span>
          ${_rcWoBtn}
        </div>`;
      } else if (postDrawPresence) {
        // v2.2.40: pós-sorteio (antes de iniciar) — presença da chamada em
        // modo somente leitura. Confirma ao organizador que os presentes
        // continuam presentes após o sorteio.
        const _rcLabel = rcMc ? 'Presente' : rcAbs ? 'Ausente' : 'Aguardando';
        const _rcColor = rcMc ? '#4ade80' : rcAbs ? '#f87171' : '#cbd5e1';
        const _rcIcon = rcMc ? '✅' : rcAbs ? '🚫' : '⏳';
        rollCallRow = `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.14);">
          <span style="font-size:0.74rem;font-weight:800;color:${_rcColor};white-space:nowrap;">${_rcIcon} ${_rcLabel}</span>
        </div>`;
      }
      const _rcCardExtra = (canRollCall || postDrawPresence) ? (rcMc ? 'box-shadow:0 0 0 2px rgba(16,185,129,0.55),0 4px 10px rgba(0,0,0,0.1);' : rcAbs ? 'opacity:0.55;' : '') : '';

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
      const _fOrder = (_partEnrollIdx && _partEnrollIdx[_fKey] != null) ? _partEnrollIdx[_fKey] : idx;
      const _fNameAttr = (pName || '').toLowerCase().replace(/"/g, '&quot;');
      return `
        <div class="participant-card" data-part-card="1" data-part-vip="${isVip ? '1' : '0'}" data-part-name="${_fNameAttr}" data-part-gender="${_fGender}" data-part-skill="${String(_fSkill).replace(/"/g, '&quot;')}" data-part-order="${_fOrder}" ${dragProps} style="${cardStyle} border-radius:12px;padding:12px;position:relative;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.1);transition:all 0.2s;${isOrg ? 'cursor:grab;' : ''}${_rcCardExtra}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
            <div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:${String(bgNum).length > 2 ? '2.8rem' : '3.5rem'};font-weight:900;color:rgba(255,255,255,0.08);line-height:1;pointer-events:none;user-select:none;">${bgNum}</div>
            <div style="position:relative;z-index:1;display:flex;flex-direction:column;gap:0;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:center;">
                        ${pNameHtml}
                        ${_metaSlotsFor(p, pName, isTeam)}
                        <div style="font-size:0.7rem;color:var(--text-muted);opacity:0.6;margin-top:5px;">${typeText}</div>
                        ${_nmSkillHtml}
                    </div>
                </div>
                ${actionsDiv}
                ${rollCallRow}
            </div>
        </div>`;
    }).join('');
  }

  // ── Filter controls (only when check-in active) ──
  const pendingCount = totalIndividuals - checkedCount - absentConfirmedCount;
  const pctPresent = totalIndividuals > 0 ? Math.round(checkedCount / totalIndividuals * 100) : 0;

  const checkInControls = canCheckIn ? `
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;margin-bottom:4px;flex-wrap:wrap;">
        <button class="btn btn-pill btn-sm" onclick="window._setCheckInFilter('${tId}', 'all')" style="border:1px solid ${currentFilter === 'all' ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'all' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'all' ? '#a5b4fc' : 'var(--text-muted)'};">Todos (${totalIndividuals})</button>
        <button class="btn btn-pill btn-sm" onclick="window._setCheckInFilter('${tId}', 'present')" style="border:1px solid ${currentFilter === 'present' ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'present' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'present' ? '#4ade80' : 'var(--text-muted)'};">Presentes (${checkedCount})</button>
        <button class="btn btn-pill btn-sm" onclick="window._setCheckInFilter('${tId}', 'absent')" style="border:1px solid ${currentFilter === 'absent' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'absent' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'absent' ? '#f87171' : 'var(--text-muted)'};">Ausentes (${absentConfirmedCount})</button>
        <button class="btn btn-pill btn-sm" onclick="window._setCheckInFilter('${tId}', 'pending')" style="border:1px solid ${currentFilter === 'pending' ? 'rgba(148,163,184,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'pending' ? 'rgba(148,163,184,0.15)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'pending' ? '#cbd5e1' : 'var(--text-muted)'};">Aguardando (${pendingCount})</button>
        <div style="flex:1;min-width:80px;background:rgba(255,255,255,0.06);border-radius:6px;height:8px;">
            <div style="width:${pctPresent}%;height:100%;background:linear-gradient(90deg,#10b981,#4ade80);border-radius:6px;transition:width 0.3s;"></div>
        </div>
        <span style="font-size:0.8rem;color:#94a3b8;font-weight:700;">${pctPresent}%</span>
    </div>
  ` : '';

  // ── Filtros da CHAMADA (por entry) — pré-sorteio e pós-sorteio (leitura) ──
  const rcPct = rcTotal > 0 ? Math.round(rcPresent / rcTotal * 100) : 0;
  const rollCallControls = (canRollCall || postDrawPresence) ? `
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;margin-bottom:4px;flex-wrap:wrap;">
        <button class="btn btn-pill btn-sm" onclick="window._setCheckInFilter('${tId}', 'all')" style="border:1px solid ${currentFilter === 'all' ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'all' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'all' ? '#a5b4fc' : 'var(--text-muted)'};">Todos (${rcTotal})</button>
        <button class="btn btn-pill btn-sm" onclick="window._setCheckInFilter('${tId}', 'present')" style="border:1px solid ${currentFilter === 'present' ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'present' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'present' ? '#4ade80' : 'var(--text-muted)'};">Presentes (${rcPresent})</button>
        <button class="btn btn-pill btn-sm" onclick="window._setCheckInFilter('${tId}', 'absent')" style="border:1px solid ${currentFilter === 'absent' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'absent' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'absent' ? '#f87171' : 'var(--text-muted)'};">Ausentes (${rcAbsent})</button>
        <button class="btn btn-pill btn-sm" onclick="window._setCheckInFilter('${tId}', 'pending')" style="border:1px solid ${currentFilter === 'pending' ? 'rgba(148,163,184,0.5)' : 'rgba(255,255,255,0.1)'};background:${currentFilter === 'pending' ? 'rgba(148,163,184,0.15)' : 'rgba(255,255,255,0.05)'};color:${currentFilter === 'pending' ? '#cbd5e1' : 'var(--text-muted)'};">Aguardando (${rcPending})</button>
        <div style="flex:1;min-width:80px;background:rgba(255,255,255,0.06);border-radius:6px;height:8px;">
            <div style="width:${rcPct}%;height:100%;background:linear-gradient(90deg,#10b981,#4ade80);border-radius:6px;transition:width 0.3s;"></div>
        </div>
        <span style="font-size:0.8rem;color:#94a3b8;font-weight:700;">${rcPct}%</span>
    </div>
  ` : '';

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
  const startBanner = (isOrg && drawDone && !t.tournamentStarted) ? `
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
            '<span class="badge badge-info" style="font-size:0.65rem;">' + ((window._formatDisplayName && t.format) ? window._formatDisplayName(t.format) : (t.format || _t('participants.defaultFormat'))) + '</span>' +
            '<span class="badge" style="background:rgba(255,255,255,0.1);color:var(--text-muted);font-size:0.65rem;">' + individualCount + '</span>' +
          '</div>',
          belowHtml: (checkInControls || rollCallControls)
        })
      : ''}
    ${rollCallBanner}
    ${startBanner}
    ${startedBadge}
    ${readyBannerHtml}
    ${(parts.length > 6 && typeof window._inscritosFilterBar === 'function') ? (
      window._inscritosFilterBar({
        searchId: 'part-search', sortId: 'part-sort', genderId: 'part-gender', skillId: 'part-skill',
        onChange: 'window._partApplyFilter()', search: (window._partSearch || ''),
        skillCategories: (t.skillCategories || [])
      }) +
      '<div id="part-search-empty" style="display:none;text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.85rem;">Nenhum inscrito encontrado.</div>'
    ) : ''}
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
