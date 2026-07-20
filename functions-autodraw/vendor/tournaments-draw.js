// tournaments-draw.js — Draw generation & bracket building (extracted from tournaments.js)
(function() {
var _t = window._t || function(k) { return k; };

// v4.0.86 — FONTE ÚNICA dos flags RUNTIME de sorteio/jogo. Princípio do dono:
// "resetar o status do torneio deveria resetar tudo menos os inscritos e duplas
// formadas que não por sorteio". Estes campos são TODOS derivados de sorteio/jogo
// (resolução escolhida em painel, estado de play, snapshots) — NUNCA config nem
// inscrição. Confirmado por auditoria: nenhum é setado em create-tournament.js /
// tournaments-enrollment.js (exceções de config como swissRounds/ligaRRSchedule-config
// ficam de fora de propósito). Chamado por _clearTournamentDraw (reset) E pelo reabrir
// inscrições (toggleRegistrationStatus) pra as duas listas NUNCA divergirem.
// Ver memória project_draw_once_canonical_order.
window._clearDrawRuntimeFlags = function (t) {
  if (!t) return;
  // CRÍTICO: saveTournament usa set({merge:true}) (firebase-db.js:285). `delete t[k]`
  // vira `undefined` → _cleanUndefined o STRIPA → o merge PRESERVA o valor velho do
  // banco (ex.: classifyFormat='swiss' fica grudado, o listener re-hidrata, e cai de
  // novo no "Tudo Pronto"). Por isso atribuímos `null` (que _cleanUndefined MANTÉM):
  // `set({classifyFormat:null},{merge:true})` SOBRESCREVE o 'swiss' por null no doc, e
  // todos os consumidores comparam `=== 'swiss'`/truthy → null = limpo. Mesmo padrão
  // que o resto de _clearTournamentDraw já usa (standings=null, rodadas=null…).
  [
    // resolução de potência de 2 / ímpar / falta-de-dupla (curto-circuitavam o painel)
    'classifyFormat', 'p2Resolution', 'oddResolution', '_soloResolved',
    'incompleteResolution', 'p2CrossSeed', 'p2TargetCount', 'gruposAdvanceTotal',
    'hasRepechage', 'repechageConfig', 'standbyMode', 'standbyPick',
    // suspensão de painel / estágio corrente
    '_suspendedByPanel', '_previousStatus', 'currentStage', '_reopenIfDrawCancelled',
    // v4.5.10: marca de auto-fecho por prazo vencido (só afeta o gate do Sortear) — limpa no reset/reabrir
    '_autoClosedByDeadline',
    // Sorteio de Vagas + snapshots + flags internos do motor
    'drawSelectionDone', 'waitlistOrder', 'preDrawEnrollees', 'pendingDraw',
    '_drawBalanceMode', '_canonicalDraw', '_cleanupApplied', '_skipCatValidation',
    // v1.2.53: "Flexibilizar equilíbrio" formou as duplas mesmo-gênero → o resto vira só
    // os avulsos (não a sobra pow2). Cancelar/resetar volta ao estado sem-flexibilizar.
    '_flexibilized',
    // pacote de decisões do pré-sorteio (vai pra CF na chamada; cancelar zera junto)
    '_drawDecisions',
    // estado de PLAY derivado do sorteio (standings/eliminação/W.O./substituição)
    'swissEliminated', 'swissRoundsData', 'swissStandings', 'classification',
    'opponentHistory', 'woClaims', 'ligaSubInvites', 'ligaRRSchedule'
    // NOTA: checkedIn/absent NÃO entram aqui — são mapas por-uid lidos com Object.keys
    // sem guarda (participants.js:99/117) e _idMapSet vira no-op se o mapa for null
    // (quebraria o próximo check-in). Não são o bug e nunca foram limpos no reset.
  ].forEach(function (k) { t[k] = null; });
};

// v2.6.98 — limpa TODOS os artefatos de sorteio + estado do construtor de fases +
// flags de encerramento, MANTENDO inscritos (t.participants/memberUids) e config
// (t.phases, t.scoring, categorias, tiebreakers…). Base do re-sorteio e do reset.
window._clearTournamentDraw = function (t) {
  if (!t) return;
  // v4.5.6: o reset já restaura o elenco (waitlist/standby → participants abaixo). Descarta
  // qualquer snapshot de draw-prep pendente pra não restaurar um elenco obsoleto num cancel
  // posterior. "O botão de reset do sorteio reseta tudo também" (pedido do dono).
  try { if (window._drawPrepSnapshots && t.id != null) delete window._drawPrepSnapshots[String(t.id)]; } catch (_eSnap) {}
  // v3.0.x: o reset volta ao estado de INSCRIÇÕES — então desmonta as duplas
  // FORMADAS PELO SORTEIO (teamOrigins[...] === 'sorteada') de volta pros
  // indivíduos, devolve os suplentes da lista de espera pros inscritos e dedup.
  // Duplas pré-formadas / inscritas como time (origin manual) são PRESERVADAS.
  try {
    var _origins = t.teamOrigins || {};
    var _arr = Array.isArray(t.participants) ? t.participants.slice() : (t.participants ? Object.values(t.participants) : []);
    // CANÔNICO: pega a espera dos TRÊS storages (via _getWaitlist) pra devolver TODOS
    // ao pool — não só waitlist + standbyParticipants (monarchWaitlist ficava de fora).
    var _wait = (typeof window._getWaitlist === 'function')
      ? window._getWaitlist(t)
      : (Array.isArray(t.waitlist) ? t.waitlist : []).concat(Array.isArray(t.standbyParticipants) ? t.standbyParticipants : []);
    if (_wait.length) _arr = _arr.concat(_wait);
    var _out = [];
    _arr.forEach(function (p) {
      // v1.2.45: o rótulo da dupla resolve AO VIVO (_pName monta "A / B" pelos uids).
      // Antes lia só `p.displayName || p.name` — e o strip do ITEM 3 APAGA esses campos
      // de quem tem perfil, então `nm` vinha VAZIO, `_origins[nm]` nunca casava e o
      // Resetar NÃO desfazia as duplas sorteadas (bug real, "Duplas Mistas Sorteadas").
      // O nome gravado fica de fallback (guest/dupla legada). Isto é remendo: teamOrigins
      // é chaveado por NOME, o que o cânone de identidade proíbe — a chave certa é o par
      // de uids. Ver [[project_uid_identity_canon_locked]].
      var nm = (p && typeof p === 'object')
        ? ((window._pName ? window._pName(p, '') : '') || p.displayName || p.name || '')
        : String(p || '');
      var isTeam = (p && typeof p === 'object' && Array.isArray(p.participants) && p.participants.length) || (p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)) || (nm.indexOf(' / ') !== -1);
      if (nm && _origins[nm] === 'sorteada' && isTeam) {
        if (Array.isArray(p.participants) && p.participants.length) {
          p.participants.forEach(function (s) { _out.push(s); });
        } else if ((p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)) {
          // FASE 2: nome do membro resolve pelo uid (perfil ao vivo); nome gravado só fallback (guest/cache frio)
          var _dnA = window._displayNameForUid ? window._displayNameForUid(p.p1Uid, p.p1Name) : (p.p1Name || p.p1Uid || '');
          var _dnB = window._displayNameForUid ? window._displayNameForUid(p.p2Uid, p.p2Name) : (p.p2Name || p.p2Uid || '');
          // v1.2.45: devolve o nº de inscrição de CADA um (p1Seq→enrollSeq). O número é da
          // PESSOA e desfazer dupla não pode mexer nele — sem isto o reset renumerava todo
          // mundo. Ver tests/enroll-number-canon.test.js.
          _out.push({ name: _dnA, displayName: _dnA, uid: p.p1Uid, email: p.p1Email, photoURL: p.p1Photo, enrollSeq: (p.p1Seq != null ? p.p1Seq : undefined) });
          _out.push({ name: _dnB, displayName: _dnB, uid: p.p2Uid, email: p.p2Email, photoURL: p.p2Photo, enrollSeq: (p.p2Seq != null ? p.p2Seq : undefined) });
        } else {
          nm.split('/').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (x) { _out.push({ name: x, displayName: x }); });
        }
      } else {
        _out.push(p);
      }
    });
    var _seen = {}, _final = [];
    _out.forEach(function (p) {
      var k;
      if (p && typeof p === 'object' && (p.uid || p.email)) k = 'id:' + String(p.uid || p.email).toLowerCase();
      else { var s = (p && typeof p === 'object') ? (p.displayName || p.name || '') : String(p || ''); k = 'n:' + s.trim().toLowerCase(); }
      if (k === 'n:') { _final.push(p); return; }
      if (!_seen[k]) { _seen[k] = 1; _final.push(p); }
    });
    t.participants = _final;
    t.waitlist = [];
    t.standbyParticipants = [];
    t.monarchWaitlist = {}; // CANÔNICO: limpa também a 3ª fonte (Rei/Rainha por categoria)
    if (t.teamOrigins) Object.keys(t.teamOrigins).forEach(function (k) { if (t.teamOrigins[k] === 'sorteada') delete t.teamOrigins[k]; });
  } catch (e) { if (window._error) window._error('[clearDraw dismantle]', e); }
  t.matches = [];
  t.rounds = [];
  t.groups = [];
  t.standings = null;
  t.thirdPlaceMatch = null;
  t.rodadas = null;
  // estado do construtor de fases
  t.currentPhaseIndex = 0;
  t.currentStage = null;
  t._phaseMaterialized = 0;
  // v4.3.1 — RESET COMPLETO (bug: "resetei mas voltou pra fase 2"). O storage das
  // fases POSTERIORES (t.phaseRounds — rodadas de Liga incremental namespaced por fase)
  // NÃO era limpo → _collectAllMatches ainda via os jogos da fase 2 → o torneio
  // "voltava" pra fase 2. Limpa TODO o estado derivado do sorteio/fase.
  // null (não {}) = merge-safe: set({merge:true}) SOBRESCREVE null, mas com {} as
  // sub-chaves antigas (rodadas da fase 2) sobreviveriam. _collectAllMatches trata
  // null como vazio. storePhase re-inicializa com {} quando precisar.
  t.phaseRounds = null;
  t.phaseLeagueState = null;
  t._canonicalDraw = false;
  try { delete t._phaseResInfo; } catch (e) { t._phaseResInfo = null; }
  // PRESENÇA — "sem nenhuma presença marcada" (pedido do dono). O reset roda por
  // commitTournamentTx (transaction.set SEM merge = overwrite total), então {} limpa.
  t.checkedIn = {};
  t.absent = {};
  // W.O. — "sem nenhum wo". opponentHistory/woClaims/ligaSubInvites também são zerados
  // (null, merge-safe) por _clearDrawRuntimeFlags logo abaixo; woHistory fica aqui.
  t.woHistory = null;
  // v2.7.96: bracketResolution é decisão de RUNTIME (escolhida no painel de potência
  // de 2 ao avançar de fase), não config do construtor. Sem limpar, o re-avanço após
  // reset PULAVA o painel — "avancei e não veio a página de solução de potência de 2".
  if (Array.isArray(t.phases)) t.phases.forEach(function (ph) { if (ph && ph.bracketResolution != null) { try { delete ph.bracketResolution; } catch (e) { ph.bracketResolution = null; } } });
  // v4.0.86: limpa TODOS os flags RUNTIME de sorteio/jogo (resolução de pow2/ímpar/
  // falta-de-dupla, estado de play, snapshots). Sem isso, o re-sorteio curto-circuitava
  // pro "Tudo Pronto" ("atingida via: swiss"), pulando sem-dupla e potência de 2.
  window._clearDrawRuntimeFlags(t);
  // flags de encerramento / relógio
  if (t.status === 'finished') t.status = 'closed';
  t.finishedAt = null;
  t.finishNotifiedAt = null;
  t.durationMs = null;
  t.tournamentStarted = null;
  // derivados do sorteio
  t.sitOutHistory = null;
  t.ligaGhosts = null;
  t.nextDrawAt = null;
  // v2.7.96: lastAutoDrawAt é estado de sorteio (quando rolou o último auto-draw).
  // Sem zerar, o cálculo da próxima data/contagem ficava preso no horário antigo
  // mesmo após resetar — "o tempo de início não reseta". Agora a próxima data
  // recomputa limpa a partir de drawFirstDate (config, preservada de propósito).
  t.lastAutoDrawAt = null;
};

// v2.6.98 — "Resetar para inscrições (manter inscritos)": apaga sorteio/rodadas/
// fases e volta o torneio para inscrições ABERTAS, preservando todos os inscritos.
// Pensado para o ciclo de testes (rodar um cenário, zerar, montar outro com a mesma
// galera). Ação destrutiva → dupla confirmação.
window._resetTournamentToEnrollment = function (tId) {
  var t = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); });
  if (!t) return;
  // CANÔNICO: PESSOAS (dupla=2), nunca entradas. Ver _countCompetitors / project_count_people_not_entries.
  var n = (typeof window._countCompetitors === 'function') ? window._countCompetitors(t).people : (t.participants || []).length;
  var _refresh = function () {
    var c = document.getElementById('view-container');
    if (c && typeof window.renderTournaments === 'function') window.renderTournaments(c, String(tId));
  };
  if (typeof showAlertDialog !== 'function') return;
  var _wasAuto = (t.drawManual !== true && t.drawFirstDate);
  var _isSB = (window._isSandboxTournament && window._isSandboxTournament(t));
  showAlertDialog(_isSB ? '🔄 Resetar o Sandbox?' : '🔄 Resetar para inscrições?',
    _isSB
      ? 'Isto <strong>re-sincroniza o Sandbox com o estado ATUAL do original</strong> e apaga o sorteio/resultados. Some tudo que você adicionou no teste (duplas formadas, +participante, placeholders). Não dá pra desfazer.'
      : ('Isto apaga TODO o sorteio, rodadas e fases e volta o torneio para "inscrições abertas". Os <strong>' + n + '</strong> inscritos são MANTIDOS.' + (_wasAuto ? ' O sorteio automático <strong>continua ligado</strong>; como a data programada já passou, ele é <strong>reagendado pra amanhã</strong> (ajuste no Editar) — ou use <strong>Sortear (manual)</strong> agora.' : '') + ' Não dá pra desfazer.'),
    function () {
      var done = function () {
        if (typeof showNotification === 'function') showNotification(_isSB ? '🔄 Sandbox resetado' : 'Torneio resetado', _isSB ? 'Re-sincronizado com o estado atual do original; sorteio/testes apagados.' : ('Voltou para inscrições abertas — ' + n + ' inscritos mantidos.' + (_wasAuto ? ' Sorteio automático reagendado pra amanhã.' : '')), 'success');
        _refresh();
      };
      // Blindagem v4.0.119: reset ATÔMICO pelo portão AppStore.mutate. _clearTournamentDraw
      // já é uma mutação PURA (muta o t passado, sem save) → aplica no doc fresco.
      window.AppStore.mutate(tId, function (ft) {
        // Sandbox: re-sincroniza o roster do original AGORA (dropa adições de teste) ANTES
        // de limpar o sorteio — "SB tal qual o original no momento do reset".
        if (ft.isSandbox === true && typeof window._resyncSandboxRoster === 'function') {
          window._resyncSandboxRoster(ft);
        }
        window._clearTournamentDraw(ft);
        ft.status = 'open';
        // v2.8.4: mantém como auto-draw (drawManual continua false); se a data programada
        // já passou, reagenda pro dia seguinte (futuro = não dispara agora).
        if (_wasAuto) {
          try {
            var _dfMs = new Date(ft.drawFirstDate + 'T' + (ft.drawFirstTime || '19:00')).getTime();
            if (isNaN(_dfMs) || _dfMs <= Date.now()) {
              var _d = new Date(); _d.setDate(_d.getDate() + 1);
              ft.drawFirstDate = _d.getFullYear() + '-' + ('0' + (_d.getMonth() + 1)).slice(-2) + '-' + ('0' + _d.getDate()).slice(-2);
            }
          } catch (e) {}
        }
      }).then(done).catch(function (err) { window._error && window._error('[resetToEnrollment] save error:', err); done(); });
    },
    { type: 'danger', confirmText: 'Sim, resetar', cancelText: 'Cancelar' }
  );
};

// v2.7.62: DEV — simula os resultados da FASE ATUAL (só SP_TEST_IDENTITIES via
// _isTestIdentity). Preenche vencedor + placar E os horários (startedAt/resultAt)
// IGUAL ao lançamento real, com resultAt escalonado terminando AGORA — assim o
// painel de tempo da rodada congela certo (DECORRIDO→DUROU, FINAL ESTIMADO→FINAL REAL).
// Botão visível só pro dono, ao lado do "Resetar". Não toca em jogos já decididos.
window._devSimulateCurrentPhase = function (tId) {
  if (typeof window._isTestIdentity === 'function' && !window._isTestIdentity()) return;
  var t = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); });
  if (!t) return;
  function realTeam(s) { return s && s !== 'TBD' && s !== 'BYE' && s !== '—'; }
  function byeSlot(s) { return !s || s === 'BYE' || s === '—'; } // BYE/vazio (NÃO TBD — TBD = não pronto)
  // FONTE ÚNICA: os jogos a preencher vêm do MOTOR, não de uma varredura própria.
  // _phasesEngine.pendingMatches é o ESPELHO EXATO de phaseComplete — o mesmo enumerador
  // que decide se a fase acabou. Antes o simulador varria por conta própria
  // (_collectAllMatches), um SEGUNDO caminho que podia divergir do motor: um grupo ficava
  // de fora do simular e a fase era dada por encerrada sem ele (bug do grupo Y, Rei/Rainha).
  // Agora simular preenche EXATAMENTE o que o motor exige pra fechar a fase atual — sem
  // caminho alternativo. Torneio de fase única legado (sem t.phases) cai no fallback.
  var pend;
  if (window._phasesEngine && typeof window._phasesEngine.isMultiPhase === 'function' &&
      window._phasesEngine.isMultiPhase(t) && typeof window._phasesEngine.pendingMatches === 'function') {
    pend = window._phasesEngine.pendingMatches(t).map(function (x) { return x && x.match; });
  } else {
    pend = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : [];
  }
  var todo = pend.filter(function (m) {
    if (!m || m.winner || m.isSitOut || m.isBye) return false;
    var p1ok = realTeam(m.p1), p2ok = realTeam(m.p2);
    if (p1ok && p2ok) return true;            // jogo normal
    if (p1ok && byeSlot(m.p2)) return true;   // time vs BYE → time vence
    if (p2ok && byeSlot(m.p1)) return true;   // BYE vs time → time vence
    return false;                             // TBD / ambos vazios → não simula
  });
  if (!todo.length) { if (typeof showNotification === 'function') showNotification('Simular', 'Nenhum jogo pendente na fase atual.', 'info'); return; }

  var _run = function () {
    var now = Date.now();
    // SIMULAR = "acabou de jogar agora" — janela CURTA (~1min/jogo, teto ~15min), NÃO 3h atrás.
    // Antes era `now - 3h` fixo → a barra mostrava "início 3h atrás / 3h de duração" mesmo o
    // usuário tendo simulado agorinha (parecia erro de fuso porque 3h = UTC-3). Liga com data
    // programada ainda usa a data real (abaixo). Pedido do dono.
    var startMs = now - Math.min(15 * 60000, Math.max(1, todo.length) * 60000);
    try {
      var ri = (Array.isArray(t.rounds) && t.rounds.length) ? t.rounds.length - 1 : 0;
      var fdStr = String(t.drawFirstDate || '').indexOf('T') > -1 ? t.drawFirstDate : (t.drawFirstDate ? (t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00')) : '');
      var fdMs = fdStr ? new Date(fdStr).getTime() : NaN;
      var intv = parseInt(t.drawIntervalDays) || 7; if (intv < 1) intv = 1;
      if (!isNaN(fdMs)) { var cand = fdMs + ri * intv * 86400000; if (cand < now) startMs = cand; }
    } catch (e) {}
    var span = Math.max(60000, now - startMs);
    var byId = {};
    todo.forEach(function (m, i) {
      var p1ok = realTeam(m.p1), p2ok = realTeam(m.p2);
      var s1, s2;
      if (p1ok && p2ok) {
        if (Math.random() < 0.5) { s1 = 6; s2 = Math.floor(Math.random() * 5); } else { s2 = 6; s1 = Math.floor(Math.random() * 5); }
      } else if (p1ok) { s1 = 6; s2 = 0; } else { s1 = 0; s2 = 6; } // BYE → time real vence
      m.scoreP1 = s1; m.scoreP2 = s2;
      m.winner = (s1 > s2) ? m.p1 : m.p2;
      m.draw = false;
      m.startedAt = startMs;
      m.resultAt = Math.round(startMs + ((i + 1) / todo.length) * span); // último = agora
      if (m.id != null) byId[String(m.id)] = m;
    });
    // v4.4.69: sync Rei/Rainha REMOVIDO — group.matches são REFERÊNCIAS de round.matches
    // (FONTE ÚNICA, hidratada no load). Mutar o jogo no plano já reflete no grupo.
    // Simular resultado É JOGAR: marca PRESENÇA dos jogadores (igual ao lançamento real, que
    // passa por _applyResultToTournament) e registra o INÍCIO. Sem isso, a seção "prontos para
    // chamar" (exige presença) e a barra (exige início) ficavam vazias após simular. (dono)
    if (!t.checkedIn) t.checkedIn = {};
    if (!t.absent) t.absent = {};
    todo.forEach(function (m) {
      [m.p1, m.p2].forEach(function (side) {
        if (!side || side === 'TBD' || side === 'BYE') return;
        var _nm = side.indexOf(' / ') !== -1 ? side.split(' / ').map(function (n) { return n.trim(); }).filter(Boolean) : [side];
        _nm.forEach(function (nm) {
          if (window._idMapHas && !window._idMapHas(t, t.checkedIn, nm)) window._idMapSet(t, t.checkedIn, nm, m.resultAt || now);
          if (window._idMapDel) window._idMapDel(t, t.absent, nm);
        });
      });
    });
    if (!t.tournamentStarted) t.tournamentStarted = startMs;
    // avança vencedores em chaves eliminatórias (não-rodada, não-grupo)
    if (typeof window._advanceWinner === 'function') {
      todo.forEach(function (m) {
        var isRound = m.roundIndex !== undefined || (Array.isArray(t.rounds) && t.rounds.some(function (r) { return (r.matches || []).some(function (rm) { return rm.id === m.id; }); }));
        var isGroup = m.group !== undefined;
        if (!isRound && !isGroup) { try { window._advanceWinner(t, m); } catch (e) {} }
      });
    }
    t.updatedAt = new Date().toISOString();
    var done = function () {
      if (typeof showNotification === 'function') showNotification('✅ Simulado', todo.length + ' jogos preenchidos com horários.', 'success');
      var c = document.getElementById('view-container');
      if (typeof window._rerenderBracket === 'function') window._rerenderBracket(String(tId));
      else if (c && typeof window.renderTournaments === 'function') window.renderTournaments(c, String(tId));
    };
    if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
      window.FirestoreDB.saveTournament(t).then(done).catch(function (err) { window._error && window._error('[devSimulate] save error:', err); done(); });
    } else { try { window.AppStore.sync(); } catch (e) {} done(); }
  };

  if (typeof showAlertDialog === 'function') {
    showAlertDialog('🎲 Simular resultados? (dev)',
      'Preenche <strong>' + todo.length + '</strong> jogos pendentes da fase atual com placar e horários aleatórios — como se tivessem sido jogados do início da rodada até agora. Jogos já decididos não são tocados.',
      _run, { type: 'warning', confirmText: 'Simular', cancelText: 'Cancelar' });
  } else { _run(); }
};

// v1.9.85: forma duplas/times preservando a IDENTIDADE (uid/email/foto) de
// cada membro. ANTES, o sorteio convertia os participantes em STRINGS de nome
// ("A / B") via name.join(' / ') — destruindo todos os uids. Consequências
// (bugs reportados): (1) memberUids encolhia e o torneio sumia para os
// participantes; (2) _resultNeedsApproval não achava o adversário (era string)
// → o placar lançado por participante ia DIRETO pra definitivo, pulando o
// fluxo de 4 fases. Agora cada time vira um OBJETO {displayName:"A / B",
// p1Name/p1Uid, p2Name/p2Uid, participants:[...]} — a geração do bracket já lê
// `displayName || name`, então nada quebra, e a identidade sobrevive.
function _formDoublesTeams(origParticipants, teamSize, teamOrigins, balanceMode) {
  var origByName = {};
  origParticipants.forEach(function(p) {
    if (p && typeof p === 'object') {
      var nm = p.displayName || p.name || '';
      if (nm) origByName[nm] = p;
    }
  });
  // v3.0.x CANON: recebe os PARTICIPANTES (objetos) — o uid vem DIRETO do objeto, NÃO por
  // lookup de nome (origByName), que misturava o uid entre homônimos. String só pra membro
  // placeholder/legado (sem conta). Aceita objeto OU string por compat dos call-sites legados.
  function mkTeamObj(members) {
    var subs = (members || []).map(function(m) {
      return (m && typeof m === 'object') ? m : (origByName[m] || { name: String(m || ''), displayName: String(m || '') });
    });
    var displayName = subs.map(function(s) { return s.displayName || s.name || ''; }).join(' / ');
    var obj = { displayName: displayName, name: displayName, participants: subs };
    subs.forEach(function(s, i) {
      obj['p' + (i + 1) + 'Name'] = s.displayName || s.name || '';
      if (s.uid) obj['p' + (i + 1) + 'Uid'] = s.uid;        // uid AUTORITATIVO do objeto
      if (s.email) obj['p' + (i + 1) + 'Email'] = s.email;
      if (s.photoURL) obj['p' + (i + 1) + 'Photo'] = s.photoURL;
    });
    return obj;
  }
  var individuals = [];
  var preFormed = [];
  origParticipants.forEach(function(p) {
    var name = (typeof p === 'string') ? p : (p.displayName || p.name || '');
    // v3.0.x: time/dupla por ESTRUTURA (slots p1/p2 ou participants[]) — preserva intacto
    // (com uids) mesmo quando o displayName não tem '/'. Antes caía em "individual" e era
    // RE-SORTEADO, quebrando a dupla. '/' só serve de fallback pra time em STRING legada.
    var _struct = (p && typeof p === 'object') ? window._entryTeamMembers(p) : null;
    if (_struct) {
      preFormed.push(p); // dupla estrutural — mantém uids/slots
    } else if (name.indexOf(' / ') !== -1) {
      // Legado: time só em string "A / B" (sem slots) — desmembra pra formar.
      if (p && typeof p === 'object') {
        if (!p.displayName) p.displayName = name;
        preFormed.push(Object.assign({}, p, mkTeamObj(name.split(' / ').map(function(s){ return s.trim(); }))));
      } else {
        preFormed.push(mkTeamObj(name.split(' / ').map(function(s){ return s.trim(); })));
      }
    } else {
      individuals.push((p && typeof p === 'object') ? p : { name: name, displayName: name });
    }
  });
  // Embaralha individuais antes de agrupar
  for (var i = individuals.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = individuals[i]; individuals[i] = individuals[j]; individuals[j] = tmp;
  }
  var newTeams = [];
  var allMaleCount = 0;
  if (balanceMode === 'equilibrado' && teamSize === 2) {
    // v2.1.20: sorteio EQUILIBRADO — distribui não-homens (mulheres + outros)
    // pra MINIMIZAR duplas 100% masculinas. Cada não-homem "cobre" um homem.
    // Homens que sobram formam duplas masculinas (inevitável se faltarem
    // não-homens). individuals já está embaralhado, então os pools preservam
    // a aleatoriedade.
    var _isMale = function(p) { return window._pGender(p) === 'masculino'; }; // v1.3.39: gênero perfil-first
    var men = [], nonMale = [];
    individuals.forEach(function(p) { (_isMale(p) ? men : nonMale).push(p); });
    individuals = [];
    var _pushTeam = function(a, b) {
      newTeams.push(mkTeamObj([a, b])); // v3.0.x: passa objetos (uid autoritativo)
      if (_isMale(a) && _isMale(b)) allMaleCount++;
    };
    while (nonMale.length && men.length) _pushTeam(nonMale.shift(), men.shift());
    while (men.length >= 2) _pushTeam(men.shift(), men.shift());       // duplas masc. (sobra)
    while (nonMale.length >= 2) _pushTeam(nonMale.shift(), nonMale.shift());
    individuals = nonMale.concat(men); // 0–1 sobra
  } else {
    while (individuals.length >= teamSize) {
      var group = individuals.splice(0, teamSize);
      newTeams.push(mkTeamObj(group)); // v3.0.x: passa objetos (uid autoritativo, sem lookup por nome)
    }
  }
  if (teamOrigins) newTeams.forEach(function(to){ teamOrigins[to.displayName] = 'sorteada'; });
  return {
    participants: preFormed.concat(newTeams, individuals),
    newTeamsCount: newTeams.length,
    leftoverCount: individuals.length,
    allMaleCount: allMaleCount
  };
}
// v2.1.22: exposto pra reuso (jogos extras de tardios em torneios "expand").
window._formDoublesTeams = _formDoublesTeams;

// ── Suíço como RESOLUÇÃO de pow2 (Opção B — 2 fases, canonizado na CF) ───────────────────
// Monta a classificatória Suíço (fase 0, K rodadas) + a eliminatória original (fase 1,
// puxando o top-lo = maior pow2 ≤ N da classificação) e GERA a 1ª rodada Suíço. PURA: muta
// t, SEM DOM/toast/commit — o cliente (generateDrawFunction) e o servidor
// (draw-core.drawInitial) rodam ESTA função, nunca duas versões (anti-drift; vendorada).
// Pressupõe t.participants já com as entradas finais (duplas já formadas por _formDoublesTeams;
// entram COMO ESTÃO — o Suíço não re-pareia). Ver project_draw_canonization_cf_phase23_deferred.
window._buildSwissClassifDraw = function (t) {
    var participants = Array.isArray(t.participants) ? t.participants.slice() : Object.values(t.participants || {});
    var _swissNames = participants.map(function (p) {
        return (typeof window._entryDisplayName === 'function')
            ? window._entryDisplayName(p)
            : (typeof p === 'string' ? p : (p.displayName || p.name || ''));
    });
    for (var _si = _swissNames.length - 1; _si > 0; _si--) {
        var _sj = Math.floor(Math.random() * (_si + 1));
        var _stmp = _swissNames[_si]; _swissNames[_si] = _swissNames[_sj]; _swissNames[_sj] = _stmp;
    }
    var _swCount = _swissNames.length;
    var _swLo = 1;
    while (_swLo * 2 <= _swCount) _swLo *= 2;          // pow2 inferior = nº de classificados
    var _swRounds = (t.swissRounds && t.swissRounds >= 1) ? t.swissRounds : Math.max(2, Math.ceil(Math.log2(_swCount)));
    var _origFormat = t.format || 'Eliminatórias Simples';
    t.phases = [
        { name: (window._t ? window._t('predraw.optSwissTitle') : 'Classificatória'), formatCode: 'liga', format: 'Suíço', rounds: _swRounds, source: { type: 'enrollment' } },
        { name: _origFormat, format: _origFormat, source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: _swLo }] }, fixedPairs: false }
    ];
    t.currentPhaseIndex = 0;
    // fase 0 Suíço sinalizada por currentStage/classifyFormat:'swiss' (render da classificação +
    // PAREAMENTO INDIVIDUAL no _generateNextRound). t.format FICA o original (a eliminatória) —
    // virar 'Liga' dispararia o modo Liga=duplas-rotativas (Rei/Rainha) em vez do Suíço.
    t.classifyFormat = 'swiss';
    t.currentStage = 'swiss';
    // Zera o gatilho da transição LEGADA (exigia p2Resolution==='swiss' && currentStage==='swiss').
    t.p2Resolution = null;
    t.p2TargetCount = null;
    t.swissRounds = _swRounds;
    t.standings = _swissNames.map(function (name) {
        return { name: name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0 };
    });
    t.checkedIn = {};                  // v4.1.30: o sorteio LIMPA a presença (auto-consistente
    t.absent = {};                     // p/ ambos os callers — o cliente já limpa antes, no-op)
    t.rounds = [];
    t.status = 'active';
    window._generateNextRound(t);      // 1ª rodada Suíço (storage nativo t.rounds)
    var _r1 = (t.rounds[0] && t.rounds[0].matches) || [];
    return {
        swissRounds: _swRounds, lo: _swLo, origFormat: _origFormat,
        roundMatches: _r1.filter(function (m) { return !m.isSitOut; }).length,
        sitOuts: _r1.filter(function (m) { return m.isSitOut; }).length
    };
};

// v1.2.48: PREVIEW dos pares que o sorteio EQUILIBRADO formaria a partir dos avulsos,
// SEM formar nada — mesma lógica de _formDoublesTeams (mistas primeiro; depois mesmo-gênero
// da sobra). Alimenta a opção "Flexibilizar equilíbrio" no painel do resto: em vez de
// deixar N pessoas de fora pra bater potência de 2, forma a(s) dupla(s) mesmo-gênero da
// sobra (inclusão acima de pow2 — ver [[project_inclusion_philosophy_canon]]) e resolve a
// pow2 depois. `_isMale` idêntico ao da formação: gênero !== 'masculino' conta como não-homem.
window._equilibradoPairPreview = function(individuals) {
  var men = 0, nonMale = 0;
  (individuals || []).forEach(function(p){
    if (p && typeof p === 'object' && window._pGender(p) === 'masculino') men++; else nonMale++; // v1.3.39: perfil-first
  });
  var mixed = Math.min(men, nonMale);
  var remMen = men - mixed, remNon = nonMale - mixed;
  var malePairs = Math.floor(remMen / 2);
  var femalePairs = Math.floor(remNon / 2);
  return {
    men: men, nonMale: nonMale,
    mixedPairs: mixed, malePairs: malePairs, femalePairs: femalePairs,
    sameGenderPairs: malePairs + femalePairs,
    maxTeams: mixed + malePairs + femalePairs,
    leftover: (remMen % 2) + (remNon % 2) // 0 ou 1 (só um gênero sobra ímpar)
  };
};

// v2.2.46: separação por origem da dupla no modo MISTO.
// Quando t.mixedPairingSeparated está ligado, duplas formadas manualmente e
// duplas sorteadas viram CATEGORIAS distintas — o pipeline de chaveamento por
// categoria (já existente e testado) gera brackets separados, então formadas
// só enfrentam formadas e sorteadas só enfrentam sorteadas, cada lado com seu
// campeão. Cruza com categorias existentes (ex.: "Masculino · Duplas sorteadas").
// Deve ser chamado DEPOIS de _formDoublesTeams (que popula t.teamOrigins).
window._MIXED_ORIGIN_FORMED = 'Duplas formadas';
window._MIXED_ORIGIN_DRAWN = 'Duplas sorteadas';
window._applyMixedOriginCategories = function(t, participants) {
  if (!t || !Array.isArray(participants)) return;
  var origins = t.teamOrigins || {};
  var newCatSet = {};
  participants.forEach(function(p) {
    if (!p || typeof p !== 'object') return;
    var nm = p.displayName || p.name || '';
    if (!window._entryTeamMembers(p)) return; // v3.0.x: só duplas/times (estrutura), não por '/'
    var originLbl = (origins[nm] === 'sorteada') ? window._MIXED_ORIGIN_DRAWN : window._MIXED_ORIGIN_FORMED;
    var existing = (typeof window._getParticipantCategories === 'function') ? window._getParticipantCategories(p) : [];
    // Não cruzar com rótulos de origem já aplicados (idempotência em re-sorteio).
    existing = existing.filter(function(c) {
      return c.indexOf(window._MIXED_ORIGIN_FORMED) === -1 && c.indexOf(window._MIXED_ORIGIN_DRAWN) === -1;
    });
    var crossed = (existing.length > 0)
      ? existing.map(function(c) { return c + ' · ' + originLbl; })
      : [originLbl];
    if (typeof window._setParticipantCategories === 'function') window._setParticipantCategories(p, crossed);
    else { p.categories = crossed; p.category = crossed[0]; }
    crossed.forEach(function(c) { newCatSet[c] = true; });
  });
  var newCats = Object.keys(newCatSet);
  if (newCats.length > 0) t.combinedCategories = newCats;
};

// ─── v2.1.26: Inscritos tardios entram NA chave (integração real) ─────────────
// Em eliminatória com inscrição tardia 'expand', quando ≥4 acumulam na espera,
// formamos duplas (sorteio). Elas viram INSCRITOS (presença/W.O.) e cada par de
// duplas vira um JOGO da rodada 1 (cor roxa). A chave é então RECONSTRUÍDA pra
// próxima potência de 2: as rodadas se renomeiam sozinhas (quartas→1ª rodada,
// semis→quartas…), vencedores avançam e, ao terminar a R1, os melhores
// derrotados (originais + tardios) entram por repescagem pra fechar a potência
// de 2. Reusa o motor de repescagem/avanço que já existe.
// Constrói o POOL da fase 0 (entradas com displayName) do jeito EXATO do sorteio inicial.
// Extraído de generateDrawFunction pra ser reusado pela regeneração de dupla-elim quando
// duplas tardias entram (window._integrateLateDuplas). isMon = Rei/Rainha (decompõe em pessoas);
// ts = teamSize efetivo (duplas mantidas como 1 entrada). NÃO forma duplas — assume que
// t.participants já tem as entradas certas (o sorteio inicial já rodou _formDoublesTeams).
window._buildPhase0Pool = function (t, isMon, ts) {
  var _raw = (Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {}));
  var _pName = window._pName ? window._pName : function (p) { return typeof p === 'string' ? p : (p && (p.displayName || p.name) || ''); };
  var pool;
  if (isMon) {
    pool = [];
    _raw.forEach(function (p) {
      if (p && typeof p === 'object' && Array.isArray(p.participants) && p.participants.length) {
        p.participants.forEach(function (s) { var nm = (s && (s.displayName || s.name)) || String(s || ''); pool.push((s && typeof s === 'object') ? Object.assign({ displayName: nm }, s) : { displayName: nm }); });
      } else if (p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)) {
        pool.push({ displayName: (window._displayNameForUid ? window._displayNameForUid(p.p1Uid, p.p1Name) : (p.p1Name || p.p1Uid || '')), uid: p.p1Uid || null, name: p.p1Name || null, gender: p.p1Gender || (p.p1Uid && window._genderForUid(p.p1Uid)) || p.gender });
        pool.push({ displayName: (window._displayNameForUid ? window._displayNameForUid(p.p2Uid, p.p2Name) : (p.p2Name || p.p2Uid || '')), uid: p.p2Uid || null, name: p.p2Name || null, gender: p.p2Gender || (p.p2Uid && window._genderForUid(p.p2Uid)) || p.gender });
      } else {
        var nm = _pName(p); pool.push((typeof p === 'object') ? Object.assign({ displayName: nm }, p) : { displayName: nm });
      }
    });
  } else {
    pool = _raw
      .filter(function (p) { return ts <= 1 || !!window._entryTeamMembers(p) || (typeof p === 'object' && !p.p1Name && !Array.isArray(p.participants)); })
      .map(function (p) { var nm = _pName(p); return (typeof p === 'object') ? Object.assign({ displayName: nm }, p) : { displayName: nm }; });
  }
  return pool;
};

// INCREMENT 2 (regra do dono): duplas formadas na lista de espera durante a R1 (janela de
// inscrição tardia aberta) entram na chave "como se tivessem sido sorteadas no sorteio
// original" — vencedor segue no upper, derrotado cai pro lower, e o ajuste de pow2 (repescagem/
// bye) é REFEITO pela resolução escolhida pelo organizador. Como a estrutura da dupla-elim
// (repescagem: quem vai direto pro upper vs. play-in, tamanho do lower) é derivada do TOTAL de
// duplas e a semeadura re-pareia a R1, a única forma correta e segura é REGENERAR a fase 0 com o
// pool completo (originais + tardias) — reusando o MESMO motor do sorteio inicial. Só roda
// enquanto NENHUM jogo da R1 tem resultado (re-semear não pode atropelar jogo já jogado); se já
// houver resultado, retorna -1 (o chamador mantém as duplas como suplentes e avisa).
// Retorna: nº de duplas integradas (>0), 0 (nada a fazer), -1 (travado por jogo já jogado).
//
// ⚠️ DESABILITADA (v4.5.22): a abordagem de REGENERAR estava ERRADA (pedido do dono). O modelo
// correto é APPEND por progressão: 2 duplas (ou 1 numa vaga sem adversário) → jogo na R1 do UPPER
// se a R2 do upper não começou; se a R2 do upper já começou → jogo na R1 do LOWER; se a R2 do
// lower já começou → suplentes individuais (duplas desfeitas). Sendo reconstruída nesse modelo.
// Modelo de APPEND por progressão (repescagem/playin). window._lastIntegrateTier guarda o tier
// (1 ou 2) do último append bem-sucedido pro caller escolher a mensagem. Retorno:
//   >0  = nº de duplas integradas — Tier 1 (R2 upper não começou → R1 do upper, vencedor sobe/
//         derrotado cai) OU Tier 2 (R2 upper já começou → R1 da chave inferior, vencedor segue/
//         derrotado eliminado). Diferencie pelo window._lastIntegrateTier.
//    0  = nada a fazer (sem duplas formadas, ou 1 dupla sem par disponível → aguarda)
//   -3  = Tier 3 (R2 do lower já começou) → suplentes individuais (caller dissolve as duplas)
window._integrateLateDuplas = function (t) {
  if (!t) return 0;
  var _le = window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment;
  if (_le !== 'expand' && _le !== 'standby') return 0;
  if (!/dupla/i.test(t.format || '')) return 0; // Eliminatória Simples: _createExtraGamesFromWaitlist
  if (!Array.isArray(t.matches) || t.matches.length === 0) return 0; // sorteio ainda não feito
  if (Array.isArray(t.combinedCategories) && t.combinedCategories.length > 1) return 0; // multi-cat: fora do escopo

  var _isPair = function (p) { return p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name); };
  var _nm = function (p) { return window._pName ? window._pName(p, '') : (p && (p.displayName || p.name)) || ''; };
  var formed = [];
  ['standbyParticipants', 'waitlist'].forEach(function (k) {
    if (Array.isArray(t[k])) t[k].forEach(function (p) { if (_isPair(p) && p._lateJoin) formed.push(p); });
  });
  if (!formed.length) return 0;

  // Só a estrutura de REPESCAGEM (playin) tem repR1 round 0 (todos jogam a "R1 do upper").
  // Pow2 puro (needsDoubleElim, byes na upper R1) fica pra depois.
  var repR1 = t.matches.filter(function (m) { return m && m.round === 0 && m.isPhaseRepR1 && m.bracket === 'upper'; });
  if (!repR1.length) return 0;

  // Tier: "R1 upper" = round 0; "R2 upper" = round 1. "R1 lower" = round 1; "R2 lower" = round 2.
  var _hasResult = function (m) { return m && (m.winner || m.scoreP1 != null || m.scoreP2 != null || (m.sets && m.sets.length) || m.startedAt); };
  var upperR2Started = t.matches.some(function (m) { return m && m.bracket === 'upper' && m.round >= 1 && _hasResult(m); });
  var lowerR2Started = t.matches.some(function (m) { return m && m.bracket === 'lower' && m.round >= 2 && _hasResult(m); });
  if (lowerR2Started) return -3; // TIER 3
  if (upperR2Started) {
    // ===== TIER 2: append no LOWER R1 (pré-rodada) — R2 do upper já em curso =====
    // Não dá pra re-semear o upper (tem resultados). As duplas tardias entram como jogo(s)
    // NOVO(s) na R1 da chave inferior; a inferior round>=2 + grande final são reconstruídas
    // religando os perdedores de TODO o upper. Preserva o upper inteiro e a R1 inferior.
    // W = nº de rodadas do upper (playin: upper rounds 1..W). mergeUppers = upper[1..W].
    var upperRounds = {};
    t.matches.forEach(function (m) {
      if (m && m.bracket === 'upper' && m.round >= 1) { (upperRounds[m.round] = upperRounds[m.round] || []).push(m); }
    });
    var W2 = 0; Object.keys(upperRounds).forEach(function (r) { r = +r; if (r > W2) W2 = r; });
    if (!W2) return 0; // upper não estruturado (defensivo)
    var mergeUppers2 = [];
    for (var r2 = 1; r2 <= W2; r2++) {
      mergeUppers2.push((upperRounds[r2] || []).slice().sort(function (a, b) { return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }));
    }
    var upperChamp2 = (upperRounds[W2] && upperRounds[W2][0]) || null;

    // satout (n ímpar) = entrada DIRETA no 1º merge da chave inferior (round mínimo >= 2): slot
    // com nome real que NÃO é alimentado por sobrevivente da pré-rodada (nextMatchId) nem por
    // perdedor do upper (loserMatchId). Detectado direto na chave atual — robusto e independe de
    // t.participants (que o motor pode não ter populado no fluxo de teste).
    var lowerMerges2 = t.matches.filter(function (m) { return m && m.bracket === 'lower' && m.round >= 2; });
    var minMergeR = null; lowerMerges2.forEach(function (m) { if (minMergeR == null || m.round < minMergeR) minMergeR = m.round; });
    var satout2 = null;
    lowerMerges2.filter(function (m) { return m.round === minMergeR; }).forEach(function (mg) {
      ['p1', 'p2'].forEach(function (slot) {
        if (satout2) return;
        var v = mg[slot];
        if (!v || v === 'TBD' || v === 'BYE (Avança Direto)') return;
        var fedByLower = t.matches.some(function (x) { return x && x.bracket === 'lower' && x.round === 1 && x.nextMatchId === mg.id && x.nextSlot === slot; });
        var fedByUpper = t.matches.some(function (x) { return x && x.bracket === 'upper' && x.loserMatchId === mg.id && x.loserSlot === slot; });
        if (!fedByLower && !fedByUpper) satout2 = { name: v, obj: (slot === 'p1' ? mg.team1Obj : mg.team2Obj) || null };
      });
    });

    // Pré-rodada existente (lower round 1) + jogo(s) novo(s) com as duplas tardias (2 a 2).
    var lowerR1 = t.matches.filter(function (m) { return m && m.bracket === 'lower' && m.round === 1; });
    var idp2 = 'p0-lj2-' + Date.now();
    var newLow = [], usedNames2 = {};
    for (var k2 = 0; k2 + 1 < formed.length; k2 += 2) {
      var a2 = formed[k2], b2 = formed[k2 + 1];
      newLow.push({
        id: idp2 + '-lowR1-' + newLow.length, round: 1, bracket: 'lower',
        p1: _nm(a2), p2: _nm(b2), team1Obj: a2, team2Obj: b2,
        winner: null, phaseIndex: 0, category: null
      });
      usedNames2[_nm(a2)] = 1; usedNames2[_nm(b2)] = 1;
    }
    // 1 dupla ímpar sobrando: a pré-rodada playin nasce SEMPRE cheia (toLower par) → não há
    // vaga livre; a dupla aguarda na lista de espera até formar par. (Regra do dono: "senão
    // aguarda".) Se um dia o bye-mode deixar slot BYE real na R1 inferior, preenche aqui.
    var BYE2 = 'BYE (Avança Direto)';
    if (formed.length % 2 === 1) {
      var lone = formed[formed.length - 1];
      for (var li = 0; li < lowerR1.length; li++) {
        var lm = lowerR1[li];
        if (lm.winner) continue;
        if (lm.p1 === BYE2) { lm.p1 = _nm(lone); lm.team1Obj = lone; delete lm.p1FromBye; usedNames2[_nm(lone)] = 1; break; }
        if (lm.p2 === BYE2) { lm.p2 = _nm(lone); lm.team2Obj = lone; delete lm.p2FromBye; usedNames2[_nm(lone)] = 1; break; }
      }
    }
    if (!newLow.length && !Object.keys(usedNames2).length) return 0; // <2 duplas e sem vaga livre → aguarda

    // Persiste jogos novos e move duplas da lista de espera → participantes.
    newLow.forEach(function (m) {
      if (typeof window._appendCanonicalColumn === 'function') { window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: 1, matches: [m] }); }
      else { t.matches.push(m); }
    });
    if (!Array.isArray(t.participants)) t.participants = [];
    if (!t.teamOrigins) t.teamOrigins = {};
    var integrated2 = 0;
    formed.forEach(function (d) {
      if (!usedNames2[_nm(d)]) return; // sobra: continua na lista de espera
      var clone = Object.assign({}, d); delete clone._lateJoin;
      t.participants.push(clone); t.teamOrigins[_nm(d)] = 'formada'; integrated2++;
    });
    ['standbyParticipants', 'waitlist'].forEach(function (k) {
      if (Array.isArray(t[k])) t[k] = t[k].filter(function (p) { return !(_isPair(p) && p._lateJoin && usedNames2[_nm(p)]); });
    });

    // Reconstrói lower round>=2 + grande final com a pré-rodada ESTENDIDA (existentes + novos).
    var preRound2 = lowerR1.concat(newLow);
    window._rebuildLowerBracket(t, {
      preRound: preRound2, mergeUppers: mergeUppers2, satout: satout2,
      upperChamp: upperChamp2, W: W2, mode: 'playin', cat: null, phaseIndex: 0,
      idPrefix: idp2, ts: Date.now(), wipe: true
    });
    t.matches.forEach(function (m) { if (m.phaseIndex == null) m.phaseIndex = 0; });

    // Re-propaga: upper JÁ decididos dropam perdedor na nova vaga inferior; lower R1 decididos
    // avançam. Ordem: upper (round asc) antes de lower (round asc) → cascata correta.
    var decided2 = t.matches.filter(function (m) { return m && m.winner && (m.bracket === 'upper' || m.bracket === 'lower'); })
      .sort(function (a, b) {
        var ba = (a.bracket === 'upper') ? 0 : 1, bb = (b.bracket === 'upper') ? 0 : 1;
        return (ba - bb) || ((a.round || 0) - (b.round || 0));
      });
    decided2.forEach(function (m) { if (typeof window._advanceWinner === 'function') { try { window._advanceWinner(t, m); } catch (e) {} } });
    if (typeof window._resolveRepFills === 'function') { try { window._resolveRepFills(t); } catch (e) {} }

    if (typeof window._computeMemberUids === 'function') { try { window._computeMemberUids(t); } catch (e) {} }
    if (window.AppStore && typeof window.AppStore.logAction === 'function') {
      window.AppStore.logAction(t.id, integrated2 + ' dupla(s) tardia(s) → R1 da chave inferior (append) — chave estendida');
    }
    if (!integrated2) return 0;
    window._lastIntegrateTier = 2;
    return integrated2;
  }

  // ===== TIER 1: append no upper R1 (round-0 repR1) preservando resultados + rebuild + re-propaga =====
  // satTeam atual = dupla inscrita que NÃO está em nenhum jogo repR1 (ficou de fora / foi pro lower).
  var inRep = {};
  repR1.forEach(function (m) { if (m.p1) inRep[m.p1] = 1; if (m.p2) inRep[m.p2] = 1; });
  var parts = Array.isArray(t.participants) ? t.participants : [];
  var satTeam = null;
  for (var pi = 0; pi < parts.length && !satTeam; pi++) { if (_isPair(parts[pi]) && !inRep[_nm(parts[pi])]) satTeam = parts[pi]; }

  // v1.2.57 (dono 17/jul): a dupla ÍMPAR normalmente está DENTRO de um repGame esperando
  // adversário — "JOGO N: Kelly/Rodrigo VS A definir" (isPhaseRepGame, um lado real + outro
  // TBD/awaitsBestLoser). O loop acima NÃO a acha (ela está em inRep). Detecta aqui: a dupla
  // real vira o PAR da tardia e o repGame é REMOVIDO (ela passa a jogar um repR1 real vs a
  // tardia). A repescagem/pow2 é recomputada com o nº novo (_buildRepechageDoubleElim),
  // honrando a resolução do organizador. Só se o repGame ainda NÃO foi jogado.
  var satRepGame = null;
  var _slotEmpty = function (v) { return !v || v === 'TBD' || v === 'BYE (Avança Direto)'; };
  if (!satTeam) {
    for (var rgi = 0; rgi < repR1.length && !satRepGame; rgi++) {
      var _rg = repR1[rgi];
      if (!_rg || !_rg.isPhaseRepGame || _rg.winner) continue;
      var _p1e = _slotEmpty(_rg.p1), _p2e = _slotEmpty(_rg.p2);
      if (_p1e && _p2e) continue; // ambos vazios: não há dupla real pra puxar
      if (_p1e || _p2e || _rg.awaitsBestLoser) {
        satTeam = _p1e ? (_rg.team2Obj || { displayName: _rg.p2, name: _rg.p2 })
                       : (_rg.team1Obj || { displayName: _rg.p1, name: _rg.p1 });
        satRepGame = _rg;
      }
    }
  }
  // repR1 usado no rebuild EXCLUI o repGame puxado (ela vira um repR1 real, sem duplicar).
  var repR1Base = satRepGame ? repR1.filter(function (m) { return m !== satRepGame; }) : repR1;

  // Pool não-pareado = [satTeam?] + duplas tardias. Forma jogos 2-a-2; SOBRA de 1 dupla nova aguarda.
  var unpaired = (satTeam ? [satTeam] : []).concat(formed);
  var idp = 'p0-lj-' + Date.now();
  var newGames = [], usedNames = {};
  var base = repR1Base.length;
  for (var i = 0; i + 1 < unpaired.length; i += 2) {
    var a = unpaired[i], b = unpaired[i + 1];
    var gnum = base + newGames.length;
    newGames.push({
      id: idp + '-rep' + gnum, round: 0, bracket: 'upper', isPhaseRepR1: true,
      p1: _nm(a), p2: _nm(b), team1Obj: a, team2Obj: b,
      p1Seed: gnum * 2, p2Seed: gnum * 2 + 1, winner: null, phaseIndex: 0, category: null
    });
    usedNames[_nm(a)] = 1; usedNames[_nm(b)] = 1;
  }
  if (!newGames.length) return 0; // 1 dupla nova sem par (e sem satTeam) → aguarda na lista de espera

  // As duplas NOVAS que entraram num jogo viram inscritas; saem da lista de espera. A que sobrou fica.
  if (!Array.isArray(t.participants)) t.participants = [];
  if (!t.teamOrigins) t.teamOrigins = {};
  var integrated = 0;
  formed.forEach(function (d) {
    if (!usedNames[_nm(d)]) return; // sobra: continua na lista de espera
    var clone = Object.assign({}, d); delete clone._lateJoin;
    t.participants.push(clone); t.teamOrigins[_nm(d)] = 'formada'; integrated++;
  });
  ['standbyParticipants', 'waitlist'].forEach(function (k) {
    if (Array.isArray(t[k])) t[k] = t[k].filter(function (p) { return !(_isPair(p) && p._lateJoin && usedNames[_nm(p)]); });
  });

  // Conjunto repR1 final = antigos (com resultados, MENOS o repGame puxado) + novos.
  // Downstream é reconstruído do zero.
  var allRep = repR1Base.concat(newGames);
  t.matches = allRep.slice();
  if (t.thirdPlaceMatch) delete t.thirdPlaceMatch;

  // meta nova (todos pareados → sem satTeam; n par). Mesma matemática de _duplaR1FromPool.
  var g = allRep.length;
  var T = 1; while (T < g) T *= 2;
  var meta = {
    g: g, T: T, promote: (T - g), toLower: (2 * g - T), n: (2 * g),
    hasSat: false, satName: null, satObj: null, idPrefix: idp, category: null, mode: 'playin'
  };
  window._buildRepechageDoubleElim(t, meta);
  t.matches.forEach(function (m) { if (m.phaseIndex == null) m.phaseIndex = 0; });

  // Re-propaga os vencedores JÁ decididos dos repR1 (winner→upper); _resolveRepFills fecha o resto.
  allRep.forEach(function (m) { if (m.winner && typeof window._advanceWinner === 'function') { try { window._advanceWinner(t, m); } catch (e) {} } });
  if (typeof window._resolveRepFills === 'function') { try { window._resolveRepFills(t); } catch (e) {} }

  if (typeof window._computeMemberUids === 'function') { try { window._computeMemberUids(t); } catch (e) {} }
  if (window.AppStore && typeof window.AppStore.logAction === 'function') {
    window.AppStore.logAction(t.id, integrated + ' dupla(s) tardia(s) → R1 upper (append) — chave estendida');
  }
  window._lastIntegrateTier = 1;
  return integrated;
};

// TIER 3: desfaz as duplas formadas na lista de espera de volta em suplentes INDIVIDUAIS.
// Usado quando a R2 da chave inferior já começou (tarde demais pra formar confronto novo).
// Retorna nº de duplas desfeitas.
window._dissolveLateDuplas = function (t) {
  if (!t) return 0;
  var _isPair = function (p) { return p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name); };
  var undone = 0;
  ['standbyParticipants', 'waitlist'].forEach(function (k) {
    if (!Array.isArray(t[k])) return;
    var out = [];
    t[k].forEach(function (p) {
      if (_isPair(p) && p._lateJoin) {
        // FASE 2: nome do membro pelo uid quando há conta; nome gravado só p/ guest
        var _dn1 = p.p1Uid ? (window._displayNameForUid ? window._displayNameForUid(p.p1Uid, p.p1Name) : (p.p1Name || p.p1Uid || '')) : null;
        var _dn2 = p.p2Uid ? (window._displayNameForUid ? window._displayNameForUid(p.p2Uid, p.p2Name) : (p.p2Name || p.p2Uid || '')) : null;
        out.push(p.p1Uid ? { displayName: _dn1, name: _dn1, uid: p.p1Uid, _lateJoin: true } : p.p1Name);
        out.push(p.p2Uid ? { displayName: _dn2, name: _dn2, uid: p.p2Uid, _lateJoin: true } : p.p2Name);
        undone++;
      } else { out.push(p); }
    });
    t[k] = out;
  });
  return undone;
};

window._createExtraGamesFromWaitlist = function(t) {
  if (!t) return 0;
  if ((window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment) !== 'expand') return 0;
  var fmt = t.format || '';
  if (fmt !== 'Eliminatórias Simples' && fmt !== 'Eliminatória Simples') return 0;
  if (Array.isArray(t.combinedCategories) && t.combinedCategories.length > 1) return 0; // multi-categoria: fora do escopo por ora
  if (!Array.isArray(t.matches) || t.matches.length === 0) return 0; // sorteio já feito
  // v1.3.57: 1ª rodada = MENOR round (CF numera round 0; legado round 1). Jogos tardios entram
  // NESTA rodada; _rebuildIntegratedBracket re-resolve o pow2 a partir dela.
  var _firstRound = Math.min.apply(null, t.matches.map(function (m) { return (m && typeof m.round === 'number') ? m.round : 1; }));
  // trava: se a 2ª RODADA da fase já começou a ser jogada, a qualificação fechou (não cresce
  // mais). v4.5.16: usa a regra canônica window._lateEnrollR2Started — "R2" = 2ª rodada DISTINTA
  // (não `round===2` literal, que quebrava com play-in/repescagem onde a 2ª rodada é round=1).
  if (typeof window._lateEnrollR2Started === 'function' && window._lateEnrollR2Started(t)) return 0;

  var _name = function(p){ return window._pName ? window._pName(p) : (typeof p === 'string' ? p : (p && (p.displayName || p.name) || '')); };
  var _sp = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
  var _wl = Array.isArray(t.waitlist) ? t.waitlist : [];
  var seen = {}; var pool = [];
  _sp.concat(_wl).forEach(function(p){ var n = _name(p); if (n && !seen[n]) { seen[n] = true; pool.push(p); } });
  // v1.2.56: duplas JÁ FORMADAS (nome "A / B") TAMBÉM entram na Eliminatória Simples — mesmo
  // princípio da chave superior do Dupla Elim (dono, 17/jul): a dupla tardia entra na R1,
  // vencedor avança, derrotado eliminado. Antes eram descartadas aqui ("só indivíduos"),
  // deixando o single-elim sem integração de duplas tardias. O split duplas-prontas × avulsos
  // acontece abaixo (após o filtro de presença). Ver [[project_late_enrollment_elimination]].
  // v3.1.22: regra canônica — MESMO DIA conta presença (só check-in, não-ausentes);
  // multi-dia ignora presença. v2.2.39: ausentes nunca entram. Sem helper → mesmo-dia.
  if ((typeof window._tournamentIsSameDay !== 'function') || window._tournamentIsSameDay(t)) {
    var _ci = t.checkedIn || {}, _ab = t.absent || {};
    // v1.3.57: presença de PAR = TODOS os membros presentes (por uid). Antes checava o par como
    // um todo — mas o par não tem uid único e a presença é gravada por uid de MEMBRO → o par
    // nunca "batia" e a dupla tardia era filtrada fora (nunca integrava). Ver [[project_id_maps_uid_keyed]].
    pool = pool.filter(function (p) {
      // (1) presente por NOME do par inteiro (par marcado como um todo — legado).
      var _byWhole = window._idMapHas(t, _ci, p) && !window._idMapHas(t, _ab, p);
      if (_byWhole) return true;
      // (2) TODOS os membros presentes por UID (caso conta: presença gravada por uid de membro).
      var _uids = (typeof window._participantUids === 'function') ? window._participantUids(p) : [];
      if (_uids && _uids.length && _uids.every(function (u) { return window._idMapHas(t, _ci, { uid: u }) && !window._idMapHas(t, _ab, { uid: u }); })) return true;
      // (3) v1.3.61: TODOS os membros presentes pelo NOME individual (par de GUESTS sem uid —
      // ex.: "Jogador 01"/"Jogador 02" fictícios: a presença é gravada por nome de membro, o par
      // não tem uid nenhum e o nome combinado "A / B" não está em checkedIn). Sem esta via o par
      // formado de guests nunca "batia" presença e a dupla tardia não integrava. Ver [[project_orphan_uid_entries]].
      var _members = [];
      if (p && typeof p === 'object') {
        if (p.p1Name || p.p1Uid) _members.push({ uid: p.p1Uid || '', name: p.p1Name || '' });
        if (p.p2Name || p.p2Uid) _members.push({ uid: p.p2Uid || '', name: p.p2Name || '' });
        if (!_members.length && Array.isArray(p.participants)) p.participants.forEach(function (m) { _members.push({ uid: (m && m.uid) || '', name: (m && (m.displayName || m.name)) || '' }); });
      }
      if (_members.length) {
        return _members.every(function (m) {
          var key = m.uid ? { uid: m.uid } : m.name;
          return key && window._idMapHas(t, _ci, key) && !window._idMapHas(t, _ab, key);
        });
      }
      return false;
    });
  }
  // v4.1.37: respeitar o teamSize. Torneio de DUPLAS (teamSize>1 ou modo time/misto)
  // agrupa 4 solos tardios → 2 duplas formadas → 1 jogo. Torneio INDIVIDUAL (teamSize
  // 1) pareia 2 solos tardios → 1 jogo solo-vs-solo (NUNCA formar dupla numa chave
  // individual — decisão do dono 1-jul). O mínimo do pool de AVULSOS muda: 4 (duplas) vs 2 (indiv).
  var _teamSize = parseInt(t.teamSize) || 1;
  var _isTeams = _teamSize > 1 || window._isTeamEnrollMode(t.enrollmentMode);
  var _minPool = _isTeams ? 4 : 2;
  // v1.2.56: separa duplas pré-formadas (par ESTRUTURAL — nunca includes('/'),
  // [[project_dupla_entry_structural_not_slash]]) dos avulsos. Só num torneio de duplas
  // uma dupla pronta é um LADO direto; num individual não existe dupla tardia.
  var _isPairEntry = function(p){ return p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name); };
  var preDuplas = _isTeams ? pool.filter(_isPairEntry) : [];
  var solos = pool.filter(function(p){ return !(_isTeams && _isPairEntry(p)); });
  // nada a fazer? v1.3.59: 1 time/solo tardio ISOLADO TAMBÉM integra (entra vs "a definir" —
  // repescagem, com recálculo de pow2). Antes exigia PAR de duplas (>=2) ou GRUPO de avulsos
  // (>=_minPool) e a dupla única formada pelo dono ia parar em "Duplas formadas" sem entrar na
  // chave. Time mode: 1 dupla pronta OU avulsos suficientes. Individual: 1 solo basta.
  var _somethingToDo = _isTeams ? (preDuplas.length >= 1 || solos.length >= _minPool) : (solos.length >= 1);
  if (!_somethingToDo) return 0;
  // v3.1.22: sorteia a ordem do pareamento (os jogos já criados ficam inalterados).
  var _shuf = function(arr){
    if (typeof window._plainShuffle === 'function') return window._plainShuffle(arr);
    for (var _i = arr.length - 1; _i > 0; _i--) { var _j = Math.floor(Math.random() * (_i + 1)); var _tmp = arr[_i]; arr[_i] = arr[_j]; arr[_j] = _tmp; }
    return arr;
  };
  preDuplas = _shuf(preDuplas); solos = _shuf(solos);

  if (!Array.isArray(t.participants)) t.participants = [];
  if (!t.teamOrigins) t.teamOrigins = {};
  var ts = Date.now();
  var created = 0;
  var _rm = function(used, arr){ return Array.isArray(arr) ? arr.filter(function(p){ return used.indexOf(_name(p)) === -1; }) : arr; };
  var _pu = function(x){ return (typeof window._participantUids === 'function') ? window._participantUids(x) : []; };
  var _addPart = function(entry, nm){
    var exists = t.participants.some(function(p){ var n = (typeof p === 'string') ? p : (p.displayName || p.name || ''); return n === nm; });
    if (!exists) t.participants.push(entry);
  };
  var _pushExtraGame = function(n1, n2, u1, u2){
    // novo JOGO da rodada 1 (cor roxa via isExtra) — mesma apresentação dos demais
    t.matches.push({
      id: 'xr1-' + t.id + '-' + ts + '-' + created,
      round: _firstRound, p1: n1, p2: n2, winner: null, isExtra: true,
      // v4.5.71: identidade por uid nos slots (jogo tardio).
      p1Uid: (u1.length === 1 ? u1[0] : null), team1Uids: u1,
      p2Uid: (u2.length === 1 ? u2[0] : null), team2Uids: u2,
      // v4.1.36: carimbar fase+chave — o renderer canônico (_renderPhaseBracket →
      // colsFor) filtra por m.bracket==='main' E o numerador global por phaseIndex.
      // Sem isso, jogos tardios ficam invisíveis (sem card, sem "Jogo N").
      phaseIndex: (t.currentPhaseIndex || 0), bracket: 'main',
      createdAt: new Date().toISOString()
    });
    if (window.AppStore && typeof window.AppStore.logAction === 'function') {
      window.AppStore.logAction(t.id, 'Tardios na chave (rodada 1): ' + n1 + ' vs ' + n2);
    }
    created++;
  };

  // (1) DUPLAS já formadas: cada dupla é um LADO; pareia 2 a 2 → 1 jogo. Sobra de 1 aguarda
  // (mesmo comportamento do Tier 1 do Dupla Elim: "1 dupla sem par → aguarda").
  while (preDuplas.length >= 2) {
    var da = preDuplas.shift(), db = preDuplas.shift();
    var dn1 = da.displayName || da.name, dn2 = db.displayName || db.name;
    _addPart(da, dn1); t.teamOrigins[dn1] = 'formada';
    _addPart(db, dn2); t.teamOrigins[dn2] = 'formada';
    var usedD = [dn1, dn2];
    t.standbyParticipants = _rm(usedD, t.standbyParticipants);
    t.waitlist = _rm(usedD, t.waitlist);
    _pushExtraGame(dn1, dn2, _pu(da), _pu(db));
  }

  // (2) AVULSOS: torneio de duplas agrupa 4→2 duplas → 1 jogo; individual pareia 2→1 jogo.
  while (solos.length >= _minPool) {
    var n1, n2, used, u1 = [], u2 = [];
    if (_isTeams) {
      var four = solos.splice(0, 4);
      var formed = window._formDoublesTeams(four, 2, t.teamOrigins);
      var teams = (formed.participants || []).filter(function(x){ return x && (x.displayName || x.name || '').indexOf(' / ') !== -1; });
      if (teams.length < 2) break;
      var tm1 = teams[0], tm2 = teams[1];
      n1 = tm1.displayName || tm1.name; n2 = tm2.displayName || tm2.name;
      u1 = _pu(tm1); u2 = _pu(tm2);
      // tardios viram INSCRITOS (duplas) — para aparecer na lista, marcar presença/W.O.
      [tm1, tm2].forEach(function(tm){ var nm = tm.displayName || tm.name; _addPart(tm, nm); t.teamOrigins[nm] = 'formada'; });
      used = four.map(_name);
    } else {
      // INDIVIDUAL: 2 solos tardios → 1 jogo solo-vs-solo (sem formar dupla).
      var two = solos.splice(0, 2);
      var s1 = two[0], s2 = two[1];
      n1 = _name(s1); n2 = _name(s2);
      u1 = _pu(s1); u2 = _pu(s2);
      [s1, s2].forEach(function(sp){ _addPart(sp, _name(sp)); });
      used = two.map(_name);
    }
    t.standbyParticipants = _rm(used, t.standbyParticipants);
    t.waitlist = _rm(used, t.waitlist);
    _pushExtraGame(n1, n2, u1, u2);
  }
  // v1.3.59: SOBRA de 1 time tardio (sem par) → entra SOZINHO vs "a definir" (repescagem).
  // Jogo novo na 1ª rodada com repFill no p2; _rebuildIntegratedBracket re-resolve o pow2 e um
  // best-loser completa o "a definir" via _resolveRepFills. Enquanto a 2ª rodada não começou
  // (guard no topo). Pedido do dono: "1 time novo já entra na R1 vs a definir + recalcula pow2".
  var _lastSolo = null;
  if (_isTeams && preDuplas.length === 1) _lastSolo = preDuplas.shift();
  else if (!_isTeams && solos.length === 1) _lastSolo = solos.shift();
  if (_lastSolo) {
    var _ln = _name(_lastSolo), _lu = _pu(_lastSolo);
    _addPart(_lastSolo, _ln); if (_isTeams) t.teamOrigins[_ln] = 'formada';
    t.standbyParticipants = _rm([_ln], t.standbyParticipants);
    t.waitlist = _rm([_ln], t.waitlist);
    t.matches.push({
      id: 'xr1-' + t.id + '-' + ts + '-' + created, round: _firstRound,
      p1: _ln, p2: 'TBD', winner: null, isExtra: true, isPhaseRepGame: true, isPhaseRepR1: true,
      repFill: [{ slot: 'p2', rank: 9999 }],
      p1Uid: (_lu.length === 1 ? _lu[0] : null), team1Uids: _lu, p2Uid: null, team2Uids: [],
      phaseIndex: (t.currentPhaseIndex || 0), bracket: 'main', createdAt: new Date().toISOString()
    });
    if (window.AppStore && typeof window.AppStore.logAction === 'function') window.AppStore.logAction(t.id, 'Tardio na chave (vs a definir): ' + _ln);
    created++;
  }
  if (created > 0) {
    window._rebuildIntegratedBracket(t);
    if (typeof window._computeMemberUids === 'function') { try { window._computeMemberUids(t); } catch (e) {} }
  }
  return created;
};

// v1.2.58 (dono 17/jul, com screenshot real tour_1783511910924): DUPLA formada na lista de
// espera ENTRA NO LUGAR DO REPESCADO na chave PLAYIN (Elim Simples ou Dupla Elim). A dupla
// ímpar espera um repescado num slot `repFill` — "JOGO N: Kelly/Rodrigo VS A definir". Quando
// uma dupla é formada na espera, ela PREENCHE esse slot (Kelly/Rodrigo vs dupla-nova) e aquele
// `repFill` é REMOVIDO → 1 repescado a menos. O downstream já está TODO fiado (nextMatchId),
// então NÃO precisa reconstruir nada: some 1 repescado, os vencedores + os melhores derrotados
// restantes fecham a pow2 sozinhos (via `_resolveRepFills`, a mecânica que já existe). Prioriza
// o slot do repGame (a ímpar esperando) e o MAIOR rank (troca o repescado mais fraco). O jogo da
// ímpar deixa de ser `isPhaseRepGame` → vira confronto real (seu perdedor volta a poder repescar
// entre os melhores). Ver [[project_late_dupla_fills_awaiting_slot]]. Retorna nº de duplas integradas.
window._fillRepFillWithLateDuplas = function (t) {
  if (!t) return 0;
  if ((window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment) !== 'expand') return 0;
  if (typeof window._lateEnrollR2Started === 'function' && window._lateEnrollR2Started(t)) return 0;
  var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
  var _isPair = function (p) { return p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name); };
  var _nm = function (p) { return window._pName ? window._pName(p, '') : (p && (p.displayName || p.name)) || ''; };
  var _pu = function (x) { return (typeof window._participantUids === 'function') ? window._participantUids(x) : []; };

  // duplas JÁ formadas na espera (par estrutural + _lateJoin) — [[project_dupla_entry_structural_not_slash]]
  var formed = [];
  ['standbyParticipants', 'waitlist'].forEach(function (k) {
    if (Array.isArray(t[k])) t[k].forEach(function (p) { if (_isPair(p) && p._lateJoin) formed.push(p); });
  });
  if (!formed.length) return 0;

  var _cpi = (t.currentPhaseIndex || 0);
  var _empty = function (v) { return !v || v === 'TBD'; };
  var _setSide = function (m, s, d) {
    var uids = _pu(d);
    m[s] = _nm(d);
    if (s === 'p1') { m.team1Obj = d; m.team1Uids = uids; m.p1Uid = (uids.length === 1 ? uids[0] : null); }
    else { m.team2Obj = d; m.team2Uids = uids; m.p2Uid = (uids.length === 1 ? uids[0] : null); }
  };

  if (!Array.isArray(t.participants)) t.participants = [];
  if (!t.teamOrigins) t.teamOrigins = {};
  var integrated = 0, usedNames = {}, ts = Date.now();

  formed.forEach(function (d) {
    var cur = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (t.matches || []);
    // (A) COMPLETA um jogo da 1ª rodada (R0) que está SEM ADVERSÁRIO: um repGame (a ímpar) ou um
    //     jogo novo aberto por um par anterior. A dupla toma o slot (que aguardava um repescado).
    var openRep = null;
    cur.forEach(function (m) {
      if (openRep || !m || m.round !== 0 || !m.isPhaseRepGame || !Array.isArray(m.repFill) || !m.repFill.length) return;
      var rf = null; m.repFill.forEach(function (x) { if (!rf && x && x.slot && _empty(m[x.slot])) rf = x; });
      if (rf) openRep = { m: m, rf: rf };
    });
    if (openRep) {
      _setSide(openRep.m, openRep.rf.slot, d);
      openRep.m.repFill = openRep.m.repFill.filter(function (x) { return x !== openRep.rf; });
      // sem mais repFill: a ímpar deixa de "esperar" — vira jogo REAL da R0 (perdedor pode repescar).
      if (!(Array.isArray(openRep.m.repFill) && openRep.m.repFill.length)) { delete openRep.m.isPhaseRepGame; openRep.m.isPhaseRepR1 = true; }
    } else {
      // (B) NÃO há jogo sem adversário → cria um jogo NOVO na R0 (dupla vs A definir). O repescado
      //     de MENOR prioridade (maior rank) migra da rodada seguinte pra completar ESTE jogo (mesma
      //     rodada); o vencedor deste jogo passa a alimentar o slot que o repescado ocupava. NÃO é
      //     play-in: é um confronto normal que um repescado completa por falta de adversário.
      var steal = null;
      cur.forEach(function (m) {
        if (!m || m.round < 1 || !Array.isArray(m.repFill) || !m.repFill.length) return;
        m.repFill.forEach(function (rf) {
          if (!rf || !rf.slot || !_empty(m[rf.slot])) return;
          if (!steal || (rf.rank || 0) > (steal.rf.rank || 0)) steal = { m: m, rf: rf };
        });
      });
      if (!steal) return; // chave cheia (sem repescado pra migrar) → aguarda
      var newG = {
        id: 'p0-lj-' + ts + '-' + integrated, round: 0, bracket: 'main', phaseIndex: _cpi,
        isPhaseRepGame: true, p1: null, p2: 'TBD', winner: null,
        nextMatchId: steal.m.id, nextSlot: steal.rf.slot,
        repFill: [{ slot: 'p2', srcBracket: steal.rf.srcBracket || 'main', srcRound: (steal.rf.srcRound != null ? steal.rf.srcRound : 0), rank: steal.rf.rank, tagRep: true }]
      };
      _setSide(newG, 'p1', d);
      steal.m.repFill = steal.m.repFill.filter(function (x) { return x !== steal.rf; }); // agora vem do vencedor do jogo novo
      if (typeof window._appendCanonicalColumn === 'function') { try { window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'main', round: 0, matches: [newG] }); } catch (e) { t.matches.push(newG); } }
      else { t.matches.push(newG); }
    }
    var clone = Object.assign({}, d); delete clone._lateJoin;
    t.participants.push(clone); t.teamOrigins[_nm(d)] = 'formada';
    usedNames[_nm(d)] = 1; integrated++;
  });
  if (!integrated) return 0;
  ['standbyParticipants', 'waitlist'].forEach(function (k) {
    if (Array.isArray(t[k])) t[k] = t[k].filter(function (p) { return !(_isPair(p) && p._lateJoin && usedNames[_nm(p)]); });
  });
  // se a R1 já fechou, resolve os repescados restantes na hora (idempotente).
  if (typeof window._resolveRepFills === 'function') { try { window._resolveRepFills(t); } catch (e) {} }
  if (typeof window._computeMemberUids === 'function') { try { window._computeMemberUids(t); } catch (e) {} }
  if (window.AppStore && typeof window.AppStore.logAction === 'function') {
    window.AppStore.logAction(t.id, integrated + ' dupla(s) tardia(s) → entrou no lugar do repescado (chave playin)');
  }
  return integrated;
};

// Reconstrói R2+ a partir da R1 (originais + tardios), preservando os resultados
// de R1. R2 = próxima potência de 2 dos vencedores de R1; a sobra vira repescagem
// (os melhores derrotados preenchem os slots awaitsBestLoser quando a R1 acaba,
// via _assignRepechageLosers — o mesmo motor do sorteio normal). Os nomes de
// rodada são derivados do nº de rodadas (automático no render).
window._rebuildIntegratedBracket = function(t) {
  if (!t || !Array.isArray(t.matches)) return false;
  var fmt = t.format || '';
  if (fmt !== 'Eliminatórias Simples' && fmt !== 'Eliminatória Simples') return false;
  // v1.3.57: ROUND-AGNOSTIC — a 1ª rodada é o MENOR round das matches. O sorteio da CF numera a
  // 1ª rodada como round 0; o legado assumia round 1 e pegava a rodada errada (semis) → chave
  // reconstruída torta. firstRound=1 pros brackets legados (backward-compat). Ver [[project_late_enrollment_elimination]].
  var _rnums = t.matches.map(function(m){ return (m && typeof m.round === 'number') ? m.round : null; }).filter(function(r){ return r != null; });
  if (!_rnums.length) return false;
  var firstRound = Math.min.apply(null, _rnums);
  // não reconstrói se a rodada SEGUINTE já tem resultado (qualificação travada)
  var r2HasResult = t.matches.some(function(m){ return m && m.round > firstRound && (m.winner || m.scoreP1 != null || m.scoreP2 != null || (m.sets && m.sets.length)); });
  if (r2HasResult) return false;
  var r1 = t.matches.filter(function(m){ return m && m.round === firstRound; });
  var R1count = r1.length;
  if (R1count < 2) return false;
  // v1.3.69: repescagem MÍNIMA — a R2 = vencedores de R1 + SÓ os best-losers necessários pra
  // fechar em nº PAR (não a próxima potência de 2). Regra do dono: "o melhor repescado passa
  // DIRETO pra R2; o 2º faz a repescagem no jogo tardio (a definir)". Antes r2Target = próxima
  // pow2 → reintroduzia TODOS os derrotados (over-repescagem: ninguém eliminava na R1). Agora
  // as rodadas seguintes ganham BYE canônico (p2='BYE') quando o nº de vencedores é ímpar.
  var r2Slots = R1count + (R1count % 2);   // 5 vencedores → 6 (par mínimo)
  var repechage = r2Slots - R1count;       // best-losers DIRETOS pra R2: 5 → 1
  // elegibilidade de repescagem: SÓ os jogos R1 SEM repFill (os reais) — seus derrotados formam
  // o pool de repescados. O jogo tardio (com repFill = "a definir") é a própria repescagem-playin,
  // não fonte de repescado. limpa wiring.
  r1.forEach(function(m){
    var _isLatePlayin = !!(m.repFill && m.repFill.length);
    if (!_isLatePlayin && (repechage > 0 || r1.some(function(x){ return x.repFill && x.repFill.length; }))) m.isRepechageR1 = true;
    else delete m.isRepechageR1;
    delete m.nextMatchId; delete m.nextSlot;
  });
  // remove as rodadas SEGUINTES e 3º lugar (serão reconstruídos); mantém a 1ª rodada intacta
  t.matches = t.matches.filter(function(m){ return m && m.round === firstRound; });
  if (t.thirdPlaceMatch) delete t.thirdPlaceMatch;

  var ts = Date.now(), mc = 0;
  // slots de R2: vencedores de R1 (na ordem) + bestloser (repescagem)
  var slots = [];
  r1.forEach(function(m){ slots.push({ type: 'r1winner', fromMatch: m.id }); });
  for (var b = 0; b < repechage; b++) slots.push({ type: 'bestloser' });

  var r2games = slots.length / 2;
  var r2Matches = [];
  for (var g = 0; g < r2games; g++) {
    var s1 = slots[g * 2], s2 = slots[g * 2 + 1];
    var r2m = { id: 'ir2-' + ts + '-' + (mc++), round: firstRound + 1, p1: 'TBD', p2: 'TBD', winner: null };
    var bl = [];
    if (s1 && s1.type === 'bestloser') bl.push('p1');
    if (s2 && s2.type === 'bestloser') bl.push('p2');
    if (bl.length) { r2m.awaitsBestLoser = bl.join(','); r2m.isRepechageSlot = true; }
    t.matches.push(r2m); r2Matches.push(r2m);
    if (s1 && s1.type === 'r1winner') { var src = r1.find(function(x){ return x.id === s1.fromMatch; }); if (src) { src.nextMatchId = r2m.id; src.nextSlot = 'p1'; } }
    if (s2 && s2.type === 'r1winner') { var src2 = r1.find(function(x){ return x.id === s2.fromMatch; }); if (src2) { src2.nextMatchId = r2m.id; src2.nextSlot = 'p2'; } }
  }
  // R3+ (TBD, alimentados pelos vencedores da rodada anterior). v1.3.69: com repescagem mínima a
  // rodada pode ter nº ÍMPAR de vencedores → o último recebe BYE (p2='BYE', _autoResolveBye do
  // fluxo normal auto-avança). ceil pra criar o jogo do BYE; ímpar → o último jogo fica só com p1.
  var prev = r2Matches, roundNum = firstRound + 2;
  while (prev.length > 1) {
    var _n = prev.length, _games = Math.ceil(_n / 2), nextRound = [];
    for (var n = 0; n < _games; n++) { var nm = { id: 'ir' + roundNum + '-' + ts + '-' + (mc++), round: roundNum, p1: 'TBD', p2: 'TBD', winner: null }; t.matches.push(nm); nextRound.push(nm); }
    for (var l = 0; l < _n; l++) { var tgt = Math.floor(l / 2), sl = (l % 2 === 0) ? 'p1' : 'p2'; prev[l].nextMatchId = nextRound[tgt].id; prev[l].nextSlot = sl; }
    if (_n % 2 === 1) { var _byeM = nextRound[_games - 1]; _byeM.p2 = 'BYE'; _byeM.isBye = true; } // vencedor ímpar folga
    prev = nextRound; roundNum++;
  }

  if (repechage > 0) {
    t.repechageConfig = {
      r1MatchIds: r1.map(function(m){ return m.id; }),
      repMatchIds: [], repParticipants: 0,
      bestLoserCount: repechage,
      bestLoserR2Ids: r2Matches.filter(function(m){ return m.awaitsBestLoser; }).map(function(m){ return m.id; }),
      eliminatedCount: R1count - repechage, spotsFromRepechage: repechage, category: ''
    };
    t.hasRepechage = true;
  } else { t.repechageConfig = null; t.hasRepechage = false; }

  // propaga os vencedores de R1 já decididos pra R2
  r1.forEach(function(m){
    if (m.winner && m.nextMatchId) {
      var nx = t.matches.find(function(x){ return x.id === m.nextMatchId; });
      if (nx) { if (m.nextSlot === 'p2') nx.p2 = m.winner; else nx.p1 = m.winner; if (typeof _autoResolveBye === 'function') _autoResolveBye(t, nx); }
    }
  });
  // se a R1 inteira já está decidida e há repescagem, preenche os melhores derrotados
  var allR1Done = r1.every(function(m){ return !!m.winner; });
  if (allR1Done && repechage > 0 && typeof _assignRepechageLosers === 'function') _assignRepechageLosers(t);
  // v4.1.36: carimbar TODA a chave reconstruída com fase+chave. O renderer canônico
  // (_renderPhaseBracket → colsFor) só pega matches com m.bracket==='main' e o
  // numerador global só numera os da fase atual — os R2/R3 recriados aqui (e a R1
  // extra preservada) nasciam sem esses campos → sumiam do render (só 2 de N cards).
  var _cpi = (t.currentPhaseIndex || 0);
  (t.matches || []).forEach(function(m){
    if (!m) return;
    if (m.phaseIndex == null) m.phaseIndex = _cpi;
    if (m.bracket == null) m.bracket = 'main';
  });
  // v1.3.62: recria o jogo de 3º lugar — a reconstrução das rodadas apaga t.thirdPlaceMatch
  // (linha ~1160), então sem isto a chave integrada ficava SEM 3º/4º lugar. Fonte única: o
  // mesmo _maybeGenerate3rdPlace do fluxo normal (cria TBD via _appendCanonicalColumn, pula
  // Dupla Elim, preenche pelos perdedores das semis). Ver [[project_third_place_always]].
  if (typeof window._maybeGenerate3rdPlace === 'function') { try { window._maybeGenerate3rdPlace(t); } catch (e) {} }
  if (typeof _maybeFinishElimination === 'function') _maybeFinishElimination(t);
  return true;
};

// v4.4.x: FONTE ÚNICA — o torneio forma as duplas MANUALMENTE (participantes/organizador
// montam), em vez de por SORTEIO? Sinal definitivo = fmt2.formacaoDupla === 'manual'; legado =
// manualPairing === 'open'. Quando manual, os avulsos (sem dupla) são PENDÊNCIA a resolver
// (reabrir/formar/lista/exclusão), NÃO gente pra auto-parear nem pra contar como time na pow2.
window._isManualPairing = function (t) {
  if (!t) return false;
  if (t.fmt2 && typeof t.fmt2 === 'object' && t.fmt2.formacaoDupla) return t.fmt2.formacaoDupla === 'manual';
  return t.manualPairing === 'open';
};
// v4.5.94: formar dupla à mão passa a regra pra "Já formadas" — grava na FONTE que
// _isManualPairing lê (fmt2.formacaoDupla p/ format2; manualPairing p/ legado). Assim o
// seletor "Duplas na eliminatória" mostra "🤝 Já formadas" E o sorteio para de auto-formar
// os avulsos (viram "sem dupla" na resolução), coerente com o que o organizador fez à mão.
window._markDuplasManual = function (t) {
  if (!t) return;
  if (t.fmt2 && typeof t.fmt2 === 'object') t.fmt2.formacaoDupla = 'manual';
  else t.manualPairing = 'open';
};

// ─── v2.1.20: Diálogo de gênero pré-sorteio (duplas mistas, sorteio livre) ────
// Mostra ANTES do sorteio quando: duplas (teamSize 2) formadas por pareamento de
// indivíduos, SEM categoria masc/fem separada. Deixa o organizador (a) atribuir
// gênero a inscritos sem gênero e (b) escolher Livre ou Equilibrado (evita dupla
// 100% masculina). Retorna true se exibiu o diálogo (e chamará onProceed no
// confirmar); false se não se aplica (o chamador segue o sorteio direto).
window._maybeShowGenderDrawDialog = function(tId, onProceed) {
  var t = window.AppStore && window.AppStore.tournaments &&
          window.AppStore.tournaments.find(function(x){ return String(x.id) === String(tId); });
  if (!t) return false;
  // v2.8.7: Liga/Pontos Corridos forma os pares DENTRO de cada rodada (Rei/Rainha =
  // grupos de 4 com parceiros ROTATIVOS; padrão = duplas aleatórias por rodada) — NÃO
  // existe dupla FIXA pra formar antes do sorteio. O diálogo "Sorteio de duplas"
  // (gênero + Livre/Equilibrado) só faz sentido em Eliminatórias/Grupos de duplas fixas.
  // Pular pra Liga — senão o "Sortear" abre essa tela errada (exposto após reset).
  if (window._isLigaFormat && window._isLigaFormat(t)) return false;
  // v4.4.x: DUPLAS FORMADAS (manual) — as duplas são montadas pelos participantes/organizador,
  // NÃO se auto-formam por sorteio. Os avulsos (sem dupla) são PENDÊNCIA (reabrir/formar/lista/
  // exclusão), não gente pra parear ao acaso. Então esse diálogo (Livre/Equilibrado) não se
  // aplica — pular. Só vale quando a formação é por SORTEIO (formacaoDupla !== 'manual').
  if (typeof window._isManualPairing === 'function' && window._isManualPairing(t)) return false;
  var enrMode = t.enrollmentMode || t.enrollment || 'individual';
  var teamSize = parseInt(t.teamSize) || 1;
  if (window._isTeamEnrollMode(enrMode) && teamSize < 2) teamSize = 2;
  if (teamSize !== 2) return false; // só duplas
  var gc = Array.isArray(t.genderCategories) ? t.genderCategories : [];
  var hasGenderSplit = gc.some(function(c){ return /masc/i.test(String(c)) || /fem/i.test(String(c)); });
  if (hasGenderSplit) return false; // já separa masc/fem por categoria → não mistura

  var parts = Array.isArray(t.participants) ? t.participants : [];
  // indivíduos a parear (sem ' / ' = ainda não estão em dupla)
  var individuals = parts.filter(function(p){
    return !window._entryTeamMembers(p); // v3.0.x: ainda-não-em-dupla por estrutura, não por '/'
  });
  if (individuals.length < 2) return false; // nada pra formar dupla por sorteio

  var _sh = window._safeHtml || function(s){ return String(s == null ? '' : s); };
  var _pName = function(p){ return (typeof p === 'string') ? p : (p.displayName || p.name || p.email || '?'); };
  var _hasGender = function(p){ var g = window._pGender(p); return typeof p === 'object' && !!g && !!String(g).trim(); }; // v1.3.39: perfil-first
  // v3.0.x: o gênero AUTORITATIVO é o do PERFIL. Carrega os perfis dos
  // participantes e (a) enriquece o snapshot com o gênero do perfil, (b) a lista
  // "sem gênero" passa a refletir o PERFIL — quem já tem gênero no perfil NÃO
  // aparece aqui (antes aparecia porque o objeto-participante vinha sem gender).
  var _build = function() {
    individuals.forEach(function(p) {
      if (typeof p !== 'object' || _hasGender(p)) return;
      var _prof = window._partProfileByName && window._partProfileByName[String(_pName(p)).toLowerCase()];
      if (_prof && _prof.gender && String(_prof.gender).trim()) p.gender = String(_prof.gender).trim();
    });
    var noGender = individuals.filter(function(p){ return !_hasGender(p); });

    // Estado do diálogo
    window._gdCtx = { tId: tId, onProceed: onProceed, mode: 'livre',
      rows: noGender.map(function(p){ return { name: _pName(p), uid: (typeof p === 'object' && p.uid) || '', gender: '' }; }) };

  var old = document.getElementById('gender-draw-overlay'); if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'gender-draw-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:100200;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:3rem 1rem 2rem;';

  var rowsHtml = window._gdCtx.rows.map(function(r, i){
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-dark,#0f172a);border:1px solid rgba(255,255,255,0.08);border-radius:10px;">' +
      '<span style="flex:1;min-width:0;font-size:0.88rem;color:var(--text-bright,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _sh(r.name) + '</span>' +
      '<button id="gd-f-' + i + '" onclick="window._gdSetGender(' + i + ',\'feminino\')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(236,72,153,0.4);background:rgba(236,72,153,0.08);color:#f9a8d4;font-size:0.78rem;font-weight:700;cursor:pointer;">♀ Fem</button>' +
      '<button id="gd-m-' + i + '" onclick="window._gdSetGender(' + i + ',\'masculino\')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.08);color:#93c5fd;font-size:0.78rem;font-weight:700;cursor:pointer;">♂ Masc</button>' +
    '</div>';
  }).join('');

  ov.innerHTML =
    '<div style="background:var(--bg-card,#1e293b);border-radius:18px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,0.5);margin:auto;overflow:hidden;">' +
      '<div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
        '<div style="font-weight:800;font-size:1rem;color:var(--text-bright,#f1f5f9);">⚖️ Sorteio de duplas</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-top:3px;">Defina o gênero de quem está sem, e escolha como formar as duplas.</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button onclick="document.getElementById(\'gender-draw-overlay\').remove()" style="flex:1;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:none;color:var(--text-muted,#94a3b8);cursor:pointer;font-size:0.85rem;">Cancelar</button>' +
          '<button onclick="window._gdConfirm()" style="flex:2;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-weight:800;font-size:0.88rem;cursor:pointer;">✓ Confirmar</button>' +
        '</div>' +
      '</div>' +
      '<div style="padding:16px 18px;">' +
        '<div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted,#94a3b8);margin-bottom:8px;">Modo de sorteio</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">' +
          '<button id="gd-mode-livre" onclick="window._gdSetMode(\'livre\')" style="text-align:left;padding:11px 14px;border-radius:12px;border:2px solid #6366f1;background:rgba(99,102,241,0.15);color:var(--text-bright,#f1f5f9);cursor:pointer;">' +
            '<div style="font-weight:700;font-size:0.9rem;">🎲 Livre</div><div style="font-size:0.74rem;color:var(--text-muted,#94a3b8);margin-top:2px;">Duplas formadas totalmente ao acaso.</div></button>' +
          '<button id="gd-mode-equilibrado" onclick="window._gdSetMode(\'equilibrado\')" style="text-align:left;padding:11px 14px;border-radius:12px;border:2px solid rgba(255,255,255,0.12);background:var(--bg-dark,#0f172a);color:var(--text-bright,#f1f5f9);cursor:pointer;">' +
            '<div style="font-weight:700;font-size:0.9rem;">⚖️ Equilibrado</div><div style="font-size:0.74rem;color:var(--text-muted,#94a3b8);margin-top:2px;">Evita duplas 100% masculinas (distribui as mulheres). Se faltarem, faz o melhor possível.</div></button>' +
        '</div>' +
        (window._gdCtx.rows.length > 0
          ? '<div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted,#94a3b8);margin-bottom:8px;">Inscritos sem gênero (' + window._gdCtx.rows.length + ')</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;max-height:34%;overflow-y:auto;">' + rowsHtml + '</div>'
          : '<div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);">Todos os inscritos já têm gênero definido. ✓</div>') +
      '</div>' +
    '</div>';
    document.body.appendChild(ov);
    if (window._dtrace) window._dtrace('genderDialog:shown', { noGender: (window._gdCtx && window._gdCtx.rows || []).length, mode: (window._gdCtx && window._gdCtx.mode) });
  }; // fim _build
  // Carrega os perfis (gênero) antes de montar — fallback síncrono se indisponível.
  if (typeof window._loadParticipantProfilesByName === 'function') {
    try { window._loadParticipantProfilesByName(individuals).then(_build).catch(_build); } catch (e) { _build(); }
  } else { _build(); }
  return true;
};

window._gdSetGender = function(i, gender){
  if (!window._gdCtx || !window._gdCtx.rows[i]) return;
  window._gdCtx.rows[i].gender = gender;
  var f = document.getElementById('gd-f-' + i), m = document.getElementById('gd-m-' + i);
  if (f) { f.style.background = gender === 'feminino' ? 'rgba(236,72,153,0.35)' : 'rgba(236,72,153,0.08)'; f.style.borderColor = gender === 'feminino' ? '#ec4899' : 'rgba(236,72,153,0.4)'; }
  if (m) { m.style.background = gender === 'masculino' ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.08)'; m.style.borderColor = gender === 'masculino' ? '#3b82f6' : 'rgba(59,130,246,0.4)'; }
};
window._gdSetMode = function(mode){
  if (!window._gdCtx) return;
  window._gdCtx.mode = mode;
  var l = document.getElementById('gd-mode-livre'), e = document.getElementById('gd-mode-equilibrado');
  if (l) { l.style.borderColor = mode === 'livre' ? '#6366f1' : 'rgba(255,255,255,0.12)'; l.style.background = mode === 'livre' ? 'rgba(99,102,241,0.15)' : 'var(--bg-dark,#0f172a)'; }
  if (e) { e.style.borderColor = mode === 'equilibrado' ? '#22c55e' : 'rgba(255,255,255,0.12)'; e.style.background = mode === 'equilibrado' ? 'rgba(34,197,94,0.15)' : 'var(--bg-dark,#0f172a)'; }
};
window._gdConfirm = function(){
  var ctx = window._gdCtx; if (!ctx) return;
  var t = window.AppStore.tournaments.find(function(x){ return String(x.id) === String(ctx.tId); });
  if (!t) { var o0 = document.getElementById('gender-draw-overlay'); if (o0) o0.remove(); return; }
  // 1) aplica os gêneros aos objetos de participante (por uid ou nome)
  var assigned = ctx.rows.filter(function(r){ return r.gender; });
  (t.participants || []).forEach(function(p){
    if (typeof p !== 'object') return;
    var match = assigned.find(function(r){
      return (r.uid && p.uid && r.uid === p.uid) || (!r.uid && (p.displayName || p.name) === r.name);
    });
    if (match) p.gender = match.gender;
  });
  // 2) modo de sorteio
  t._drawBalanceMode = ctx.mode;
  // 3) grava no PERFIL global (via função) — só os que têm uid; fire-and-forget
  var withUid = assigned.filter(function(r){ return r.uid; }).map(function(r){ return { uid: r.uid, gender: r.gender }; });
  if (withUid.length > 0 && window.firebase && firebase.functions) {
    try {
      firebase.functions().httpsCallable('setParticipantsGender')({ tournamentId: String(ctx.tId), assignments: withUid })
        .catch(function(e){ window._warn && window._warn('[genderDraw] setParticipantsGender falhou:', e && (e.code || e.message)); });
    } catch (e) {}
  }
  // 4) persiste e segue o sorteio
  if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
    try { window.FirestoreDB.saveTournament(t); } catch (e) {}
  }
  var o = document.getElementById('gender-draw-overlay'); if (o) o.remove();
  window._gdCtx = null;
  if (window._dtrace) window._dtrace('genderConfirm', { mode: ctx.mode });
  if (typeof ctx.onProceed === 'function') ctx.onProceed();
};

window.showFinalReviewPanel = function (tId) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    const existing = document.getElementById('final-review-panel');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'final-review-panel';
    overlay.style.cssText = 'position:fixed;inset:0;width:100%;min-height:100%;min-height:100%;background:rgba(0,0,0,0.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:0.75rem;overflow:hidden;';
    document.body.style.overflow = 'hidden';

    const tIdSafe = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    overlay.innerHTML = `
        <div style="background:var(--bg-card,#1e293b);width:94%;max-width:600px;border-radius:24px;border:1px solid rgba(34,197,94,0.3);box-shadow:0 30px 100px rgba(0,0,0,0.8);overflow:hidden;display:flex;flex-direction:column;max-height:94svh;animation:modalFadeIn 0.3s ease-out;">
            <!-- Header (sticky-like, doesn't scroll) -->
            <div style="background:linear-gradient(135deg,#14532d 0%,#22c55e 100%);padding:1rem 1.25rem;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:1.8rem;">🎉</span>
                    <div>
                        <h3 style="margin:0;color:#f0fdf4;font-size:1.05rem;font-weight:800;letter-spacing:-0.01em;">${_t('tdraw.readyTitle')}</h3>
                        <p style="margin:2px 0 0;color:#bbf7d0;font-size:0.78rem;line-height:1.35;">${_t('tdraw.readySubtitle')}</p>
                    </div>
                </div>
            </div>

            <!-- Scrollable middle -->
            <div style="overflow-y:auto;flex:1;padding:1rem 1.25rem;">
                <!-- Summary Checklist -->
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem;">
                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.enrollClosed')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.enrollClosedDesc')}</div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.teamsConsolidated')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.teamsConsolidatedDesc')}</div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.bracketStructure')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.p2AchievedVia', {resolution: window._safeHtml(t.p2Resolution || 'Natural')})}</div>
                        </div>
                    </div>
                </div>

                <!-- History / Log -->
                <div>
                    <h4 style="margin:0 0 6px;color:#94a3b8;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;">${_t('tdraw.resolutionHistory')}</h4>
                    <div style="background:rgba(0,0,0,0.2);border-radius:12px;padding:0.75rem;max-height:100px;overflow-y:auto;font-family:monospace;font-size:0.72rem;color:#cbd5e1;">
                        ${(t.history || []).slice().reverse().map(log => `
                            <div style="margin-bottom:5px;display:flex;gap:8px;">
                                <span style="color:#64748b;flex-shrink:0;">[${new Date(log.date).toLocaleTimeString()}]</span>
                                <span>${window._safeHtml(log.message)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Sticky footer (always visible) -->
            <div style="padding:0.85rem 1.25rem;border-top:1px solid rgba(255,255,255,0.08);background:var(--bg-card,#1e293b);display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
                <button onclick="window._drawBtnBusy&&window._drawBtnBusy(this); window.generateDrawFunction('${tIdSafe}')" style="background:linear-gradient(135deg,#16a34a,#22c55e);color:white;border:none;padding:13px;border-radius:14px;font-weight:800;font-size:1rem;cursor:pointer;box-shadow:0 8px 24px rgba(34,197,94,0.3);display:flex;align-items:center;justify-content:center;gap:8px;">
                    <span>🎲</span> ${_t('tdraw.rollDrawNow')}
                </button>
                <button onclick="document.getElementById('final-review-panel').remove();document.body.style.overflow='';" style="background:rgba(255,255,255,0.05);color:#94a3b8;border:none;padding:10px;border-radius:10px;font-weight:600;font-size:0.85rem;cursor:pointer;">
                    ${_t('tdraw.backAndReview')}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};


// v2.7.82: Sortear MANUAL num torneio de SORTEIO AUTOMÁTICO. O botão fica omitido
// por padrão (o auto-draw é o responsável), mas o organizador pode forçar o sorteio
// na mão — ex.: auto-draw sem data agendada. Confirma avisando que é auto-draw, e
// que o automático segue valendo pras próximas rodadas. Não é dev-only.
window._confirmManualAutoDraw = function (tId) {
    var t = window.AppStore.tournaments.find(function (tour) { return tour.id.toString() === tId.toString(); });
    if (!t) return;
    var _hasDraw = (Array.isArray(t.rounds) && t.rounds.length > 0) ||
        (Array.isArray(t.matches) && t.matches.length > 0) ||
        (Array.isArray(t.groups) && t.groups.length > 0);
    // SEM sorteio ainda → é o SORTEIO INICIAL (não "rodada extra").
    if (!_hasDraw) {
        if (typeof showConfirmDialog !== 'function') { window.generateDrawFunction(tId); return; }
        showConfirmDialog('🎲 Sortear agora?', 'Fazer o sorteio inicial <b>manualmente</b> agora?', function () { if (typeof window.generateDrawFunction === 'function') window.generateDrawFunction(tId); }, null, { type: 'warning', confirmText: 'Sortear agora', cancelText: 'Cancelar' });
        return;
    }
    // v4.1.79: "Rodada Extra" NÃO avança de fase (quem avança é "Avançar de Fase" →
    // _advanceMultiPhase) e NÃO re-sorteia (generateDrawFunction re-sortearia). Gera mais
    // UMA rodada na FASE ATUAL via _generateExtraRound (a fase passa de N pra N+1 rodadas).
    if (typeof showConfirmDialog !== 'function') { window._generateExtraRound(tId); return; }
    var _isMP = window._isMultiPhase && window._isMultiPhase(t);
    var _msg = _isMP
        ? 'Isto gera <b>mais uma rodada</b> (rodada extra) na <b>fase atual</b> — no mesmo formato das outras rodadas dela. A próxima fase <b>fica adiada</b>: você precisa terminar esta rodada nova pra os resultados contarem na classificação. Confirmar?'
        : 'Isto gera <b>mais uma rodada</b> no mesmo formato das anteriores. Confirmar?';
    showConfirmDialog(
        '🎲 Gerar rodada extra?',
        _msg,
        function () { window._generateExtraRound(tId); },
        null,
        { type: 'warning', confirmText: 'Gerar rodada extra', cancelText: 'Cancelar' }
    );
};

// Gera UMA rodada extra na FASE ATUAL (Liga/Suíço/Rei-Rainha incremental) via o motor
// canônico _generateNextRound (mesmo do fecho de rodada e do autoDraw) + persiste + navega.
// Guarda: torneio no modelo ANTIGO (fase Rei/Rainha de rodada única em t.matches, t.rounds
// vazio) NÃO pode ganhar rodada extra sem re-sortear — gerar em t.rounds criaria um storage
// paralelo invisível. Nesse caso avisa pra re-sortear (o sorteio novo nasce league/multi-rodada).
window._generateExtraRound = function (tId) {
    var t = window._findTournamentById ? window._findTournamentById(tId) : (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); });
    if (!t) return;
    if (typeof window._generateNextRound !== 'function') { if (typeof showNotification === 'function') showNotification('Indisponível', 'Motor de rodadas não carregado.', 'warning'); return; }
    var _cur = t.currentPhaseIndex || 0;
    var _phaseMonarchInMatches = (t.rounds || []).length === 0 &&
        (t.matches || []).some(function (m) { return m && m.isMonarch && (m.phaseIndex || 0) === _cur; });
    if (_phaseMonarchInMatches) {
        if (typeof showAlertDialog === 'function') showAlertDialog('Re-sorteie pra habilitar rodadas extras',
            'Esta fase foi sorteada no modelo antigo (rodada única). Pra ter rodadas extras, <b>re-sorteie o torneio</b> — o novo sorteio nasce em Pontos Corridos multi-rodada e aí "Rodada Extra" funciona.', null, { type: 'warning' });
        if (typeof window._drawBtnDone === 'function') window._drawBtnDone();
        return;
    }
    var _before = (t.rounds || []).length;
    try { window._generateNextRound(t); }
    catch (e) { if (window._warn) window._warn('[extra-round] falhou', e); }
    var _after = (t.rounds || []).length;
    if (_after <= _before) {
        if (typeof showNotification === 'function') showNotification('Rodada extra', 'Não foi possível gerar uma rodada extra pra esta fase.', 'warning');
        if (typeof window._drawBtnDone === 'function') window._drawBtnDone();
        return;
    }
    t.status = 'active';
    var _newRound = t.rounds[_after - 1];
    var _cnt = ((_newRound && _newRound.matches) || []).filter(function (m) { return !m.isSitOut; }).length;
    window.AppStore.logAction(tId, 'Rodada extra ' + _after + ' gerada manualmente (' + _cnt + ' jogo(s))');
    var _p = (window.AppStore && typeof window.AppStore.syncImmediate === 'function') ? window.AppStore.syncImmediate(tId) : null;
    var _go = function () {
        window.location.hash = '#bracket/' + tId;
        setTimeout(function () {
            if (typeof showNotification === 'function') showNotification('Rodada extra gerada', 'Rodada ' + _after + ' com ' + _cnt + ' jogo(s).', 'success');
            if (typeof window._notifyDrawPersonalized === 'function') { try { window._notifyDrawPersonalized(t, tId, { type: 'new_round', roundIndex: _after - 1 }); } catch (e) {} }
        }, 140);
    };
    if (_p && typeof _p.then === 'function') _p.then(_go); else _go();
};

// Monta a cfg da fase 0 (índice 0) a partir do torneio — a inscrição é a ENTRADA da
// fase (source.type='enrollment'). Os eixos (modo de sorteio, cabeças, categoria, pot-2,
// cadência) viram propriedades da cfg que o motor único (generatePhase) honra. Rei/Rainha
// é MODO (drawMode/reiRainha), não formato.
window._buildPhase0Cfg = function (t) {
    var fmt = t.format || 'Eliminatórias Simples';
    var code;
    if (window._isLigaFormat && window._isLigaFormat(t)) code = 'liga';
    else if (fmt === 'Suíço Clássico' || t.classifyFormat === 'swiss') code = 'liga';
    else if (/Grupo/.test(fmt)) code = 'grupos_mata';
    else if (/Dupla/.test(fmt)) code = 'elim_dupla';
    else if (/Rei|Rainha|monarch/i.test(fmt)) code = 'grupos_mata';
    else code = 'elim_simples';
    var rei = (t.drawMode === 'rei_rainha') || (t.ligaRoundFormat === 'rei_rainha') || /Rei|Rainha/i.test(fmt);
    var cfg = {
        format: fmt, formatCode: code,
        drawMode: t.drawMode || (rei ? 'rei_rainha' : 'sorteio'),
        reiRainha: rei,
        gruposCount: parseInt(t.gruposCount, 10) || 4,
        gruposClassified: parseInt(t.gruposClassified, 10) || 2,
        gruposEqualOnly: t.gruposEqualOnly === true,
        teamSize: parseInt(t.teamSize, 10) || 1,
        // Elim: cabeças VIP SEMPRE sobem ao topo (recebem os BYEs = "VIP folga"). Grupos:
        // só quando o organizador liga o toggle (gruposSeedVip → espalha pelos grupos).
        seedVip: (code === 'elim_simples' || code === 'elim_dupla') ? true : !!t.gruposSeedVip,
        seedCategory: !!t.gruposSeedCategory,
        // BYE não fecha chave em Dupla Eliminatória fora de pow2 → coage p/ repescagem (playin).
        // Inofensivo em pow2 (o dupla ignora a resolução lá). Rede de segurança p/ config legada
        // salva como 'bye'. feedback_resolution_one_logic.
        bracketResolution: ((t.p2Resolution || 'bye') === 'bye' && code === 'elim_dupla') ? 'playin' : (t.p2Resolution || 'bye'),
        thirdPlace: t.thirdPlace !== false,
        categories: (Array.isArray(t.combinedCategories) && t.combinedCategories.length) ? t.combinedCategories.slice() : null,
        source: { type: 'enrollment' }
    };
    if (code === 'liga') cfg.ligaCadence = (t.ligaDrawMode === 'round_robin') ? 'round_robin' : 'incremental';
    // v4.4.x: ida-e-volta em Fase de Grupos (tabela única de duplas fixas) — propaga o
    // turnos pro genGroupsFromPool. Ausente/ida = single-RR (legado). Ver format2.
    if (code === 'grupos_mata') cfg.turnos = (t.turnos === 'ida_volta' || parseInt(t.ligaTurnos, 10) === 2) ? 'ida_volta' : 'ida';
    return cfg;
};

// BLINDAGEM (Fase B) do SORTEIO INICIAL — project_concurrency_safe_saves.
// A chave é gerada UMA vez local (com shuffle aleatório) → re-gerar no fresco daria
// OUTRA chave. Então: diff top-level do `t` sorteado contra o snapshot `preDraw`
// (pré-sorteio) → capturamos EXATAMENTE os campos que o sorteio mudou/deletou, e o
// commitDrawTx re-aplica esse delta ATOMICAMENTE sobre o doc fresco (preservando
// edições concorrentes aos demais campos, com guarda de duplo-sorteio). `history` e
// `updatedAt` ficam FORA do diff: history é anexado (append preserva entradas
// concorrentes), updatedAt é setado pelo commit. Auto-mantido: acompanha qualquer
// campo novo que o sorteio venha a tocar, sem lista à mão.
function _commitInitialDraw(tId, t, preDraw) {
    // Sorteio COMPLETOU → não reabrir mais (config "Fechadas" fica fechada). Limpa a
    // flag ANTES do diff pra ela não persistir no doc como `true` pendente.
    if (t && t._reopenIfDrawCancelled) t._reopenIfDrawCancelled = null;
    if (typeof window._drawBtnDone === 'function') window._drawBtnDone(); // encerra o "Sorteando…" (caso não navegue, ex.: Liga)
    var changed = {}, deleted = [], k, a, b;
    for (k in t) {
        if (!Object.prototype.hasOwnProperty.call(t, k)) continue;
        if (k === 'history' || k === 'updatedAt') continue;
        try { a = JSON.stringify(t[k]); } catch (e) { a = null; }
        try { b = JSON.stringify(preDraw[k]); } catch (e2) { b = undefined; }
        if (a !== b) { try { changed[k] = JSON.parse(a); } catch (e3) { changed[k] = t[k]; } }
    }
    for (k in preDraw) {
        if (!Object.prototype.hasOwnProperty.call(preDraw, k)) continue;
        if (!(k in t)) deleted.push(k);
    }
    var _preHistLen = Array.isArray(preDraw.history) ? preDraw.history.length : 0;
    var _newHistory = Array.isArray(t.history) ? t.history.slice(_preHistLen) : [];
    var _p = window.AppStore.commitDrawTx(tId, changed, deleted, {
        preHadBracket: (Array.isArray(preDraw.matches) && preDraw.matches.length > 0) ||
                       (Array.isArray(preDraw.rounds) && preDraw.rounds.length > 0),
        newHistory: _newHistory
    });
    // 4.1 (project_match_result_docs, inc 3a): semeia os docs de resultado por jogo
    // com playerUids — o SORTEIO roda como organizador (admin) = caminho de confiança
    // que seta o roster. Best-effort/fire-and-forget: não bloqueia a navegação e uma
    // falha aqui não afeta o sorteio (já persistido). Defensivo a stub não-promise.
    var _seed = function () { try { if (window.AppStore && typeof window.AppStore.seedMatchResultDocs === 'function') window.AppStore.seedMatchResultDocs(tId); } catch (e) {} };
    // fire-and-forget: seed roda APÓS o sorteio persistir, mas retorna-se o `_p`
    // ORIGINAL (o caller encadeia a navegação nele) — não consome/quebra a cadeia.
    if (_p && typeof _p.then === 'function') { try { _p.then(_seed); } catch (e) { _seed(); } }
    else { _seed(); }
    return _p;
}

// ── CHAMADA DA CF drawRound — fetch() DIRETO, sem o SDK ──────────────────────────────
// POR QUE NÃO httpsCallable (custou um teste real na staging): o SDK compat monta o
// "contexto" da chamada ANTES de enviar — auth token, App Check e o token de
// Instance-ID/FCM. Com o usuário LOGADO o FCM já está inicializado, o SDK pede o token
// de messaging, isso estoura ("Messaging: A problem occurred while subscribing the user
// to FCM…") e a promise REJEITA sem a requisição sair: a CF nunca é tocada e o usuário vê
// um erro de push no lugar do sorteio. Deslogado o SDK pula esse passo — por isso o teste
// anônimo passava e o do organizador não.
// Este projeto JÁ foi mordido por isso: v1.0.40 filtrou o ruído "Messaging:" no magic link
// e a v1.3.86 trocou httpsCallable por fetch() direto pelo MESMO motivo. Filtrar não basta
// — a chamada nem sai. Aqui falamos o protocolo callable na mão: POST {data}, resposta
// {result} ou {error:{status,message}}.
// projectId vem do app (NUNCA hardcodar 'scoreplace-app': quebraria na staging, que roda
// no projeto scoreplace-staging — ver [[project_staging_env]]).
window._callDrawRound = function (payload) {
    var fb = window.firebase;
    var user = fb && fb.auth && fb.auth().currentUser;
    if (!user) return Promise.reject(Object.assign(new Error('Entre na sua conta pra sortear.'), { code: 'functions/unauthenticated' }));
    var pid = '';
    try { pid = fb.app().options.projectId; } catch (e) {}
    if (!pid) return Promise.reject(Object.assign(new Error('App não inicializado.'), { code: 'functions/internal' }));
    var url = 'https://us-central1-' + pid + '.cloudfunctions.net/drawRound';
    return user.getIdToken().then(function (tok) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({ data: payload })
        });
    }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
            if (j && j.error) {
                // Mapeia o status do protocolo callable pro mesmo `code` que o SDK daria,
                // pro catch do chamador não precisar saber que trocamos de transporte.
                var st = String(j.error.status || '').toLowerCase().replace(/_/g, '-');
                throw Object.assign(new Error(j.error.message || 'Falha no sorteio'),
                    { code: 'functions/' + (st || 'internal') });
            }
            if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { code: 'functions/internal' });
            return { data: (j && j.result) || {} };
        });
    });
};

// Espelha _callDrawRound (mesmo transporte callable via fetch direto) pro FECHO de rodada Suíço
// na CF `closeRound`. Ver project_draw_canonization_cf_phase23_deferred.
window._callCloseRound = function (payload) {
    var fb = window.firebase;
    var user = fb && fb.auth && fb.auth().currentUser;
    if (!user) return Promise.reject(Object.assign(new Error('Entre na sua conta.'), { code: 'functions/unauthenticated' }));
    var pid = '';
    try { pid = fb.app().options.projectId; } catch (e) {}
    if (!pid) return Promise.reject(Object.assign(new Error('App não inicializado.'), { code: 'functions/internal' }));
    var url = 'https://us-central1-' + pid + '.cloudfunctions.net/closeRound';
    return user.getIdToken().then(function (tok) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({ data: payload })
        });
    }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
            if (j && j.error) {
                var st = String(j.error.status || '').toLowerCase().replace(/_/g, '-');
                throw Object.assign(new Error(j.error.message || 'Falha no fecho de rodada'),
                    { code: 'functions/' + (st || 'internal') });
            }
            if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { code: 'functions/internal' });
            return { data: (j && j.result) || {} };
        });
    });
};

window.generateDrawFunction = function (tId) {
    const t = window._findTournamentById(tId);
    if (!t) { if (window._dtrace) window._dtrace('generateDraw:NO-TOURNAMENT', { tId: String(tId) }); return; }
    if (window._dtrace) window._dtrace('generateDraw', { fmt: t.format, parts: (t.participants || []).length });
    // v1.3.40: PRÉ-CARREGA os perfis por uid ANTES do sorteio — gênero/skill/idade/nome
    // resolvem pelo PERFIL (users/{uid}), não pelo snapshot gravado no inscrito. Sem isto,
    // um roster que grava só-uid não balanceia duplas mistas (gênero vinha vazio). Carrega só
    // uids ainda NÃO cacheados; após a carga re-chama a si mesma (o cache fica quente → 2ª
    // passada não recarrega → sem recursão). _preloadUserProfiles cacheia até doc inexistente.
    if (typeof window._preloadUserProfiles === 'function' && window._userProfileCache &&
        window.FirestoreDB && window.FirestoreDB.db) {
        var _drawUids = [];
        (Array.isArray(t.participants) ? t.participants : []).forEach(function (p) {
            if (p && typeof p === 'object') [p.uid, p.p1Uid, p.p2Uid].forEach(function (u) {
                if (u && typeof u === 'string' && u.indexOf(' ') === -1 && !window._userProfileCache[u]) _drawUids.push(u);
            });
        });
        if (_drawUids.length) {
            window._preloadUserProfiles(_drawUids)
                .then(function () { window.generateDrawFunction(tId); })
                .catch(function () { window.generateDrawFunction(tId); });
            return;
        }
    }
    // v4.5.85 (ITEM 3 · Fase 4): rehidrata o nome das entradas (perfil vivo por uid) antes do
    // sorteio inicial — storage só-uid, motor lê nome. Transiente (o save re-sanitiza).
    if (typeof window._rehydrateEntryNames === 'function') window._rehydrateEntryNames(t);

    // v4.1.34 (decisão do dono): Liga (Pontos Corridos) e Rei/Rainha são formatos de
    // PARCEIROS ROTATIVOS — inscrição INDIVIDUAL. Com DUPLAS JÁ FORMADAS o rotativo juntaria
    // 2 duplas num "time de 4" (errado). "Duplas fixas jogando entre si é Fase de Grupos —
    // então não tem Rei/Rainha (nem Liga) com duplas formadas." Bloqueia direcionando pra
    // Fase de Grupos. (O Suíço de duplas NÃO cai aqui: é construtor com t.format=elim +
    // classifyFormat='swiss', pareamento dupla-vs-dupla FIXO — _isLigaFormat=false.)
    // Rei/Rainha (modo) é EXCEÇÃO ao bloqueio: o pool-prep DECOMPÕE entradas-time nos
    // membros individuais (parceiro rotativo — fix Confra, ver _isMon0 abaixo). O bloqueio
    // vale só pra Liga PADRÃO, onde dupla formada viraria "time de 4" no pareamento.
    if (typeof window._isLigaFormat === 'function' && window._isLigaFormat(t) &&
        !(typeof window._isMonarchFormat === 'function' && window._isMonarchFormat(t))) {
        var _hasFormedPair = (Array.isArray(t.participants) ? t.participants : []).some(function (p) {
            return p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name);
        });
        if (_hasFormedPair) {
            if (typeof showAlertDialog === 'function') showAlertDialog(
                'Formato incompatível com duplas formadas',
                'Liga (Pontos Corridos) e Rei/Rainha usam parceiros ROTATIVOS — inscrição individual. Para DUPLAS FIXAS jogando entre si, use o formato "Fase de Grupos".',
                null, { type: 'warning' });
            if (typeof window._drawBtnDone === 'function') window._drawBtnDone();
            return;
        }
    }

    // ── Proteção contra re-sorteio acidental ────────────────────────
    var _hasExistingDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
        (Array.isArray(t.rounds) && t.rounds.length > 0) ||
        (Array.isArray(t.groups) && t.groups.length > 0);
    if (_hasExistingDraw) {
        // Check if any match has a result recorded — use canonical collector
        // so results hiding in t.groups[].matches, t.thirdPlaceMatch, or
        // t.rodadas can't be silently overwritten by a redraw.
        var _hasResults = false;
        if (typeof window._collectAllMatches === 'function') {
            _hasResults = window._collectAllMatches(t).some(function(m) {
                return m && (m.winner || m.score1 || m.score2);
            });
        } else {
            // Defensive fallback: bracket-model.js not loaded.
            if (Array.isArray(t.matches)) {
                _hasResults = t.matches.some(function(m) { return m.winner || m.score1 || m.score2; });
            }
            if (!_hasResults && Array.isArray(t.rounds)) {
                _hasResults = t.rounds.some(function(r) {
                    return (r.matches || []).some(function(m) { return m.winner || m.score1 || m.score2; });
                });
            }
        }
        if (_hasResults) {
            showAlertDialog(_t('draw.alreadyDoneTitle'),
                _t('draw.alreadyDoneMsg'),
                function() {
                    // User confirmed — allow redraw by clearing existing data
                    // v2.6.98: limpa TAMBÉM estado de fase/encerramento (re-sortear um
                    // torneio multi-fase precisa voltar à Fase 0, senão fica resíduo).
                    // v1.2.25: marca ANTES do clear. O clear é SÓ local — o doc no Firestore
                    // segue com a chave, então o sorteio no servidor recusaria ('already-drawn')
                    // sem este flag. Ele é a única memória de que o organizador confirmou.
                    t._redrawConfirmed = true;
                    window._clearTournamentDraw(t);
                    window.generateDrawFunction(tId);
                },
                { type: 'danger', confirmText: _t('draw.alreadyDoneConfirm'), cancelText: _t('btn.cancel') }
            );
            return;
        }
        // Draw exists but no results yet — warn but lighter
        showAlertDialog(_t('draw.redrawTitle'),
            _t('draw.redrawMsg'),
            function() {
                t._redrawConfirmed = true; // ver acima: o clear é só local; o doc ainda tem a chave
                window._clearTournamentDraw(t);
                window.generateDrawFunction(tId);
            },
            { type: 'warning', confirmText: _t('draw.redrawConfirm'), cancelText: _t('draw.redrawCancel') }
        );
        return;
    }

    // v4.0.97: "Sorteando…" enquanto a chave é gerada (parte lenta: save + geração +
    // render). Some sozinho quando navega pro #bracket (hashchange) — ver _showLoading.
    // Só aqui (após os guards de re-sorteio) pra não piscar quando há diálogo/painel antes.
    if (typeof window._showLoading === 'function') window._showLoading('Sorteando…');
    // Store active tournament ID for views that need it
    window._lastActiveTournamentId = tId;

    // ── Deduplicação de participantes ────
    // v4.5.72: _fixOrphanedMatchNames removido (identidade-por-uid: render resolve
    // o nome vivo por uid; o remendo de nome órfão por heurística virou morto).
    if (typeof window._deduplicateParticipants === 'function') {
        var _dupCount = window._deduplicateParticipants(t);
        if (_dupCount > 0) {
            window.FirestoreDB.saveTournament(t);
            showNotification(_t('tdraw.dupsRemoved'), _t('tdraw.dupsRemovedMsg', { n: _dupCount }), 'info');
        }
    }

    // ── Times incompletos: tratados pelo painel unificado (_showRemainderPanel)
    //    chamado via showUnifiedResolutionPanel em _handleSortearClick. Aqui
    //    não precisamos mais interceptar — se chegou até generateDrawFunction,
    //    o organizador já decidiu o que fazer com o resto.

    // ── Verificação de número ímpar (formatos não-eliminatórios, exceto Grupos, Suíço e Liga) ──────
    const isElim = t.format === 'Eliminatórias Simples' || t.format === 'Dupla Eliminatória';
    const isGruposFmt = t.format === 'Fase de Grupos + Eliminatórias' || (t.format || '').indexOf('Grupo') !== -1;
    const isSuicoOrLiga = t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss' || t.currentStage === 'swiss' || (window._isLigaFormat && window._isLigaFormat(t));
    if (!isElim && !isGruposFmt && !isSuicoOrLiga && !t.oddResolution && typeof window.checkOddEntries === 'function') {
        const oddInfo = window.checkOddEntries(t);
        if (oddInfo.isOdd) {
            window.showUnifiedResolutionPanel(tId);
            return;
        }
    }

    // ── Verificação de potência de 2 para eliminatórias (não Grupos) ──────────────
    if (isElim && !isGruposFmt && !t.p2Resolution) {
        const info = window.checkPowerOf2(t);
        if (info.count < 2) {
            const _label = (info.teamSize > 1) ? 'times' : 'participantes';
            showAlertDialog(_t('draw.tooFewTitle'), _t('draw.tooFewDrawMsg', { label: _label }), null, { type: 'warning' });
            return;
        }
        if (!info.isPowerOf2) {
            window.showPowerOf2Panel(tId);
            return;
        }
    }

    // ── Validação: participantes sem categoria (quando torneio tem MÚLTIPLAS categorias) ─
    // Categoria única (ex: Misto isolado) → todos participam da mesma → sem checagem.
    var _tournHasCats = Array.isArray(t.combinedCategories) && t.combinedCategories.length > 1;
    if (_tournHasCats) {
        var _allParts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
        var _noCat = _allParts.filter(function(p) {
            if (typeof p !== 'object') return true;
            var cats = window._getParticipantCategories(p);
            return cats.length === 0;
        });
        if (_noCat.length > 0) {
            var _names = _noCat.map(function(p) {
                return typeof p === 'string' ? p : (p.displayName || p.name || '?');
            }).slice(0, 5).join(', ');
            var _extra = _noCat.length > 5 ? ' e mais ' + (_noCat.length - 5) + '...' : '';
            showAlertDialog(_t('draw.noCatTitle'),
                _t('draw.noCatMsg', { n: _noCat.length, names: _names, extra: _extra }),
                function() {
                    // User chose to proceed anyway — continue draw
                    t._skipCatValidation = true;
                    window.generateDrawFunction(tId);
                },
                { type: 'warning', confirmText: _t('draw.noCatConfirm'), cancelText: _t('btn.back') }
            );
            if (!t._skipCatValidation) return;
            delete t._skipCatValidation;
        }
    }

    // Divulgação sempre imediata a todos
    if (!t.drawVisibility) {
        t.drawVisibility = 'public';
    }

    // v4.5.6: SORTEIO EFETIVO — passou todos os gates. As decisões (sem-dupla/pow2) agora
    // ficam PERMANENTES → o snapshot de draw-prep deixa de valer (cancel não restaura mais).
    var _prepSnap = null;
    try { _prepSnap = window._drawPrepSnapshots && window._drawPrepSnapshots[String(tId)]; } catch (_eSnapGet) {}

    // BLINDAGEM: snapshot do estado PRÉ-sorteio (aqui `t` ainda não tem chave — passamos
    // todos os gates de validação/re-sorteio acima). Os 3 saves de sorteio abaixo trocam
    // syncImmediate (merge doc inteiro, lost-update) por _commitInitialDraw (delta atômico
    // sobre o fresco). Um snapshot só serve os 3 ramos. project_concurrency_safe_saves.
    var _preDraw;
    try { _preDraw = JSON.parse(JSON.stringify(t)); } catch (_e) { _preDraw = {}; }
    // v4.5.7: usa o elenco ORIGINAL (snapshot de draw-prep) como baseline do roster no
    // _preDraw → o delta do _commitInitialDraw captura TODAS as decisões que mexeram no
    // elenco ANTES daqui (sem-dupla→espera, standby, exclusão) e as persiste ATOMICAMENTE
    // com a chave. Sem isto, waitlist/standbyParticipants ficavam iguais em preDraw e t →
    // fora do delta → não gravavam (e dependiam do sync() que clobberava a chave). Ver
    // _startDraw (snapshot) / _cancelDrawResolution (restore).
    if (_prepSnap) {
        try {
            if (_prepSnap.participants) _preDraw.participants = _prepSnap.participants;
            if (_prepSnap.waitlist) _preDraw.waitlist = _prepSnap.waitlist;
            if (_prepSnap.standbyParticipants) _preDraw.standbyParticipants = _prepSnap.standbyParticipants;
            if (_prepSnap.monarchWaitlist) _preDraw.monarchWaitlist = _prepSnap.monarchWaitlist;
            if (_prepSnap.teamOrigins) _preDraw.teamOrigins = _prepSnap.teamOrigins;
        } catch (_eBase) {}
    }
    try { if (window._drawPrepSnapshots) delete window._drawPrepSnapshots[String(tId)]; } catch (_eSnapClr) {}

    // v4.1.30: o SORTEIO LIMPA a presença — "acabou de sortear, ninguém está presente"
    // (dono). A partir daqui presença vem SÓ de: (a) lançar resultado = quem jogou está
    // presente; (b) check-in explícito (toggle / "Cheguei"). As rodadas seguintes do Suíço
    // (_generateNextRound) NÃO passam por aqui → a presença acumulada persiste entre rodadas.
    // _preDraw já foi snapshotado com a presença antiga → o diff do _commitInitialDraw grava
    // o {} limpo. Cobre 1º sorteio E re-sorteio (que arrastava presença de resultados velhos).
    t.checkedIn = {}; t.absent = {};

    // ── MOTOR CANÔNICO: a primeira fase (índice 0) é desenhada pelo MESMO generatePhase das
    // fases seguintes. A INSCRIÇÃO é a entrada da fase. SEM switch por t.format: o FORMATO
    // (Eliminatória/Grupos/Liga), o MODO (Rei/Rainha) e os eixos (categoria, VIP, dupla,
    // grupos-iguais, resolução de pot-2) são cfg que o generatePhase honra. Storage e render
    // ÚNICOS (storePhase tagueia t.matches por fase, ou t.rounds nativo pra Liga/Suíço;
    // _renderPhaseBracket via t._canonicalDraw; o avanço lê grupos/monarca de t.matches via
    // prevPhaseGroups). Só Play-in e Suíço-classificatório (escolhas de p2Resolution, NÃO
    // formatos) seguem nas suas resoluções abaixo.
    // (contrato project_unify_initial_phase_canonical — fim do caminho não-canônico da fase 0.)
    // CANONIZAÇÃO (Fase A): play-in agora roda pelo MOTOR (`_buildPhase0Cfg` passa
    // bracketResolution='playin' → generatePhase → genTierBracket resolution='playin',
    // com isPhaseRepR1 + _resolveRepFills no _advanceWinner).
    // v1.3.x: o Suíço-pow2 TAMBÉM vai pela CF (project_draw_canonization_cf_phase23_deferred) —
    // o guard `!== 'swiss'` e o ramo local saíram; o bloco abaixo roda pra TODO formato. A CF
    // (draw-core → _buildSwissClassifDraw, vendorado) monta a classificatória Suíço + gera a 1ª rodada.
    {
        // ── MOTOR NO SERVIDOR (Etapa 3 · fase B) ────────────────────────────────────────
        // O app PEDE, a CF `drawRound` SORTEIA e GRAVA. Assim todo mundo sorteia com a MESMA
        // versão do motor — app/binário de loja desatualizado não sorteia mais diferente
        // ("os cânones rodam em CF, disparados pelo app" — dono, jul/2026).
        // Os gates e painéis ACIMA ficam: são UI e já gravaram a decisão no doc
        // (p2Resolution/oddResolution/incompleteResolution); o servidor lê o que o organizador
        // decidiu e executa. SEM fallback local — o motor do cliente é justamente a versão
        // velha que se quer matar. Só 'swiss' (round-gen incremental, não canonizado) segue
        // no ramo local abaixo. Ver [[project_draw_canonization_cf]].
        var _redraw = !!t._redrawConfirmed; // o gate limpou só o LOCAL; o doc ainda tem a chave
        // ── PACOTE DE DECISÕES (v1.2.29) — a peça que faltava e derrubou a v1.2.28 ────────
        // Os painéis são UI e ESCOLHEM; quem APLICA ao elenco é a CF, com as MESMAS funções
        // (draw-decisions.js, vendorado). Antes, o elenco decidido (sem-dupla→espera, pow2→
        // espera/exclusão) só existia NA MEMÓRIA do cliente e ia pro banco de CARONA no delta
        // do _commitInitialDraw. Sem esse commit, o delta some e o servidor lê o elenco VELHO:
        // 35 inscritos → chave de 32 com 14 BYEs. Agora a escolha viaja explícita.
        //
        // O pacote leva SÓ o que NÃO chega ao doc por outro caminho. Ímpar/incompletos/chamada
        // JÁ gravam (sync/mutate) — a CF lê do doc; mandá-los seria re-aplicar sobre um doc já
        // resolvido (e "remover o último" não tem alvo: cortaria OUTRA pessoa). Os que vão
        // aqui são todos re-aplicáveis sem efeito: sem-dupla (não há mais avulso), pow2 e resto
        // (o alvo é a potência de 2, já atingida). Ver docs/sorteio-ciclo-decisoes.md.
        var _decisions = t._drawDecisions || null;
        if (window._dtrace) window._dtrace('cf:send', { redraw: !!_redraw, decisions: _decisions });
        window._callDrawRound({ tournamentId: String(tId), allowRedraw: _redraw, decisions: _decisions }).then(function (_res) {
            if (window._dtrace) window._dtrace('cf:ok', { matchCount: (_res && _res.data && _res.data.matchCount) });
            var d = (_res && _res.data) || {};
            if (!d.ok || !d.tournament) throw new Error('resposta inválida do servidor');
            // Estado AUTORITATIVO do servidor no `t` local. Mutação in-place: preserva as
            // referências que outras views/closures já seguram. Vem FOLDADO (como o doc É no
            // Firestore) → hidrata igual ao ingest do listener.
            Object.keys(t).forEach(function (k) { delete t[k]; });
            Object.keys(d.tournament).forEach(function (k) { t[k] = d.tournament[k]; });
            if (typeof window._hydrateMonarchGroups === 'function') { try { window._hydrateMonarchGroups(t); } catch (_eH) {} }
            try { window.AppStore._saveToCache(); } catch (_eC) {}
            if (document.getElementById('final-review-panel')) { document.getElementById('final-review-panel').remove(); document.body.style.overflow = ''; }
            window._lastActiveTournamentId = tId;
            // Toast do equilíbrio: o motor é do servidor, mas quem AVISA é a UI.
            if (d.allMaleCount > 0 && typeof showNotification !== 'undefined') {
                showNotification('⚖️ Sorteio equilibrado', d.allMaleCount + ' dupla(s) ficaram 100% masculinas — não havia mulheres suficientes pra cobrir todas.', 'warning');
            }
            // "Sorteando…" fica até a chave estar na tela (some no hashchange); toast só depois.
            window.location.hash = '#bracket/' + tId;
            setTimeout(function () {
                if (window._sound) window._sound('sino');
                if (d.native) showNotification(_t('tdraw.started'), _t('tdraw.startedMsg', { n: d.matchCount }), 'success');
                else showNotification(_t('draw.changesSaved'), _t('tdraw.drawDone'), 'success');
                if (typeof window._notifyDrawPersonalized === 'function') window._notifyDrawPersonalized(t, tId);
            }, 140);
        }).catch(function (err) {
            if (window._dtrace) window._dtrace('cf:ERR', { code: (err && err.code) || '', msg: String(err && err.message || err).slice(0, 120) });
            // O loader NÃO some sozinho aqui: ele só cai no hashchange do #bracket (que não
            // vai acontecer) ou no backstop de 15s. Sem esconder na mão, o toast de erro nasce
            // ATRÁS do overlay e o usuário fica 15s olhando "Sorteando…" sem conseguir ler o
            // motivo — foi exatamente o que aconteceu no 1º teste real na staging.
            if (typeof window._hideLoading === 'function') window._hideLoading();
            if (typeof window._drawBtnDone === 'function') window._drawBtnDone();
            var _code = (err && err.code) || '';
            var _msg = (err && err.message) || String(err);
            window._lastSaveError = { tournamentId: tId, code: _code, message: _msg, at: new Date().toISOString() };
            if (/already-drawn/.test(_msg)) {
                showNotification('⚠️ Já sorteado', 'Outro organizador sorteou este torneio agora há pouco. Atualize a tela pra ver a chave.', 'warning');
            } else if (_code === 'functions/permission-denied') {
                showNotification('⚠️ Sem permissão', 'Só o organizador ou um co-organizador pode sortear.', 'error');
            } else if (/swiss-not-canonical/.test(_msg)) {
                showNotification('⚠️ Sorteio não realizado', 'Este formato ainda não é sorteado pelo servidor. Avise o desenvolvedor.', 'error');
            } else {
                showNotification('⚠️ Sorteio não realizado', _msg.substring(0, 200), 'error');
            }
        });
        return;
    }
    // Suíço-pow2: removido o ramo local — a resolução 'swiss' flui pela CF drawRound (bloco
    // acima), igual a todo formato. O motor (draw-core → _buildSwissClassifDraw, vendorado)
    // monta a classificatória Suíço + gera a 1ª rodada; o toast do Suíço vem via a resposta
    // da CF (d.native/matchCount). Ver project_draw_canonization_cf_phase23_deferred.
};

// Build nextMatchId links for single elim bracket
// Gera TODAS as rodadas futuras (R2, R3, ..., Final) com participantes TBD
// Suporta categorias: cada categoria tem seu próprio chaveamento independente
window._buildNextMatchLinks = function (t) {
    if (!t.matches || !t.matches.length) return;
    // Repechage tournaments already have all rounds + links built — skip
    if (t.hasRepechage) return;

    // Agrupar matches R1 por categoria
    var _catSet = {};
    t.matches.filter(function(m) { return m.round === 1; }).forEach(function(m) {
        var cat = m.category || '';
        if (!_catSet[cat]) _catSet[cat] = true;
    });
    var _categories = Object.keys(_catSet);

    _categories.forEach(function(catName) {
        // Filtrar matches desta categoria
        var catMatches = t.matches.filter(function(m) {
            return (m.category || '') === catName;
        });

        var roundsMap = {};
        catMatches.forEach(function(m) {
            if (!roundsMap[m.round]) roundsMap[m.round] = [];
            roundsMap[m.round].push(m);
        });

        var r1Matches = (roundsMap[1] || []).length;
        if (r1Matches === 0) return;
        var totalRounds = Math.ceil(Math.log2(r1Matches * 2));
        var timestamp = Date.now();

        for (var r = 2; r <= totalRounds; r++) {
            var prevRound = roundsMap[r - 1] || [];
            var expectedNext = Math.ceil(prevRound.length / 2);
            if (!roundsMap[r]) roundsMap[r] = [];

            while (roundsMap[r].length < expectedNext) {
                var idx = roundsMap[r].length;
                var nm = {
                    id: 'match-r' + r + '-' + idx + '-' + (timestamp + r) + (catName ? '-' + catName.replace(/\s+/g, '_') : ''),
                    round: r,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                if (catName) nm.category = catName;
                roundsMap[r].push(nm);
                window._appendCanonicalColumn(t, { phase: 'elim', round: r, matches: [nm] });
            }

            prevRound.forEach(function(m, idx) {
                var nextMatchIdx = Math.floor(idx / 2);
                if (roundsMap[r][nextMatchIdx]) {
                    m.nextMatchId = roundsMap[r][nextMatchIdx].id;
                }
            });
        }

        // Processar BYE matches — avançar automaticamente
        (roundsMap[1] || []).forEach(function(m) {
            if (m.isBye && m.winner && m.nextMatchId) {
                var next = t.matches.find(function(nm) { return nm.id === m.nextMatchId; });
                if (next) {
                    if (!next.p1 || next.p1 === 'TBD') next.p1 = m.winner;
                    else if (!next.p2 || next.p2 === 'TBD') next.p2 = m.winner;
                }
            }
        });
    });
};

// ─── Build Double Elimination Bracket ───────────────────────────────
window._buildDoubleElimBracket = function (t, opts) {
    if (!t.matches || !t.matches.length) return;
    const ts = Date.now();
    // v4.1.29: phase-aware. opts.phaseIndex → só olha a R1 do upper DAQUELA fase e tagueia
    // TODOS os jogos novos (upper R2+/lower/grand) com phaseIndex (senão o render da fase,
    // que filtra por phaseIndex, não os enxerga). Sem opts = fase única (comportamento antigo).
    const _pi = (opts && opts.phaseIndex != null) ? opts.phaseIndex : null;
    const _beforeIds = (_pi != null) ? {} : null;
    if (_pi != null) t.matches.forEach(function (m) { if (m && m.id) _beforeIds[m.id] = 1; });

    // --- UPPER BRACKET: build rounds like single elim ---
    const upperR1 = t.matches.filter(m => m.round === 1 && (_pi == null || ((m.phaseIndex || 0) === _pi && (m.bracket === 'upper' || !m.bracket))));
    const totalUpperRounds = Math.ceil(Math.log2(upperR1.length * 2));

    // Create upper bracket shell rounds
    const upperRounds = { 1: upperR1 };
    for (let r = 2; r <= totalUpperRounds; r++) {
        const prevCount = (upperRounds[r - 1] || []).length;
        const nextCount = Math.ceil(prevCount / 2);
        upperRounds[r] = [];
        for (let i = 0; i < nextCount; i++) {
            const m = {
                id: `upper-r${r}-${i}-${ts}`,
                round: r,
                bracket: 'upper',
                label: `Upper R${r} • P${i + 1}`,
                p1: 'TBD', p2: 'TBD', winner: null
            };
            upperRounds[r].push(m);
            window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'upper', round: r, matches: [m] });
        }
    }

    // Link upper bracket: winner → next upper, loser → lower
    for (let r = 1; r < totalUpperRounds; r++) {
        const cur = upperRounds[r];
        const nxt = upperRounds[r + 1];
        cur.forEach((m, idx) => {
            const nextIdx = Math.floor(idx / 2);
            if (nxt[nextIdx]) m.nextMatchId = nxt[nextIdx].id;
        });
    }

    // --- LOWER BRACKET ---
    // v1.0.91-beta: Lower bracket has 2*totalUpperRounds - 2 rounds
    // (era 'totalUpperRounds-1)*2-1' que estava ERRADO — não criava a Lower
    // Final). Estrutura: rounds alternando "merge" (recebem upper losers) e
    // "battle" (LR winners enfrentam-se internamente). O ÚLTIMO merge round
    // é a LOWER FINAL: LR(n) winner + UR(final) loser jogam pra ir pra GF.
    // User: 'deveria haver uma lower final? acho que é isso e essa não
    // aparece no chaveamento.'
    const lowerRounds = {};
    let lowerRoundNum = 1;

    // For each upper round (1 to totalUpperRounds), losers drop to lower
    // v1.0.91-beta: <= em vez de < — pra incluir o upper final loser na
    // Lower Final. Antes (com <), o UR final loser ficava órfão e LR3
    // winner ia direto pra GF (Lower Final inexistente).
    for (let ur = 1; ur <= totalUpperRounds; ur++) {
        const upperLosersCount = upperRounds[ur].length;

        if (ur === 1) {
            // Lower R1: upper R1 losers play each other
            const matchCount = Math.ceil(upperLosersCount / 2);
            lowerRounds[lowerRoundNum] = [];
            for (let i = 0; i < matchCount; i++) {
                const m = {
                    id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                    round: lowerRoundNum,
                    bracket: 'lower',
                    label: `Lower R${lowerRoundNum} • P${i + 1}`,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                lowerRounds[lowerRoundNum].push(m);
                window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
            }

            // Link upper R1 losers → lower R1
            upperRounds[1].forEach((um, idx) => {
                const lowerIdx = Math.floor(idx / 2);
                if (lowerRounds[lowerRoundNum][lowerIdx]) {
                    um.loserMatchId = lowerRounds[lowerRoundNum][lowerIdx].id;
                }
            });

            lowerRoundNum++;
        } else {
            // "Merge" round: lower winners vs upper losers dropping down
            const actualMergeCount = (lowerRounds[lowerRoundNum - 1] || []).length;

            lowerRounds[lowerRoundNum] = [];
            for (let i = 0; i < actualMergeCount; i++) {
                const m = {
                    id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                    round: lowerRoundNum,
                    bracket: 'lower',
                    label: `Lower R${lowerRoundNum} • P${i + 1}`,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                lowerRounds[lowerRoundNum].push(m);
                window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
            }

            // Link previous lower round winners → this round
            (lowerRounds[lowerRoundNum - 1] || []).forEach((lm, idx) => {
                if (lowerRounds[lowerRoundNum][idx]) {
                    lm.nextMatchId = lowerRounds[lowerRoundNum][idx].id;
                }
            });

            // Link upper round losers → this merge round
            upperRounds[ur].forEach((um, idx) => {
                if (lowerRounds[lowerRoundNum][idx]) {
                    um.loserMatchId = lowerRounds[lowerRoundNum][idx].id;
                }
            });

            lowerRoundNum++;

            // "Battle" round: lower bracket internal (winners play each other)
            if (actualMergeCount > 1) {
                const battleCount = Math.ceil(actualMergeCount / 2);
                lowerRounds[lowerRoundNum] = [];
                for (let i = 0; i < battleCount; i++) {
                    const m = {
                        id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                        round: lowerRoundNum,
                        bracket: 'lower',
                        label: `Lower R${lowerRoundNum} • P${i + 1}`,
                        p1: 'TBD', p2: 'TBD', winner: null
                    };
                    lowerRounds[lowerRoundNum].push(m);
                    window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
                }

                // Link merge round winners → battle round
                (lowerRounds[lowerRoundNum - 1] || []).forEach((lm, idx) => {
                    const nextIdx = Math.floor(idx / 2);
                    if (lowerRounds[lowerRoundNum][nextIdx]) {
                        lm.nextMatchId = lowerRounds[lowerRoundNum][nextIdx].id;
                    }
                });

                lowerRoundNum++;
            }
        }
    }

    // --- GRAND FINAL ---
    const grandFinal = {
        id: `grand-final-${ts}`,
        round: totalUpperRounds + 1,
        bracket: 'grand',
        label: 'Grande Final',
        p1: 'TBD', p2: 'TBD', winner: null
    };
    window._appendCanonicalColumn(t, { phase: 'grandfinal', bracket: 'grand', round: totalUpperRounds + 1, matches: [grandFinal] });

    // Link upper bracket final winner → grand final
    const upperFinal = upperRounds[totalUpperRounds];
    if (upperFinal && upperFinal[0]) {
        upperFinal[0].nextMatchId = grandFinal.id;
    }

    // Link lower bracket final winner → grand final
    const lastLowerRound = lowerRounds[lowerRoundNum - 1];
    if (lastLowerRound && lastLowerRound[0]) {
        lastLowerRound[0].nextMatchId = grandFinal.id;
    }

    // v4.1.29: tagueia TODOS os jogos novos (upper R2+/lower/grand) com o phaseIndex da fase.
    if (_pi != null) {
        t.matches.forEach(function (m) { if (m && !_beforeIds[m.id] && m.phaseIndex == null) m.phaseIndex = _pi; });
    }

    // Auto-advance BYE winners in upper bracket
    t.matches.filter(m => m.isBye && m.winner && m.bracket === 'upper' && (_pi == null || (m.phaseIndex || 0) === _pi)).forEach(m => {
        if (m.nextMatchId) {
            const next = t.matches.find(n => n.id === m.nextMatchId);
            if (next) {
                if (!next.p1 || next.p1 === 'TBD') next.p1 = m.winner;
                else if (!next.p2 || next.p2 === 'TBD') next.p2 = m.winner;
            }
        }
    });
};

// ── MOTOR ÚNICO da CHAVE INFERIOR + GRANDE FINAL (Dupla Eliminatória com repescagem) ──
// Recebe a PRÉ-RODADA (lower round 1) JÁ criada e alimentada, os arrays de rodadas do UPPER
// cujos perdedores caem (mergeUppers = [upper[1..W]] no playin), o satout (entra direto no 1º
// merge), o jogo-campeão do upper (→ grande final p1), e W (nº de rodadas do upper). Cria os
// merges (cada um absorve TODOS os sobreviventes da inferior + os perdedores da rodada superior
// correspondente) + battles finais + grande final, relinkando nextMatchId (sobreviventes da
// inferior) e loserMatchId (perdedores do upper). Contagem ÍMPAR num merge/battle → repFill
// (playin, melhor derrotado da inferior repesca) ou BYE (bye-mode). REUSADO por:
//   • _buildRepechageDoubleElim (sorteio inicial): wipe=false, pré-rodada recém-criada.
//   • _integrateLateDuplas Tier 2 (dupla tardia entra na R1 inferior com a R2 do upper já em
//     curso): wipe=true — remove lower round>=2 + grand antigos e reconstrói com a pré-rodada
//     ESTENDIDA (jogos existentes + jogo novo), preservando o upper inteiro e a R1 inferior.
// Ver project_dupla_elim_repechage / feedback_resolution_one_logic.
window._rebuildLowerBracket = function (t, opts) {
    opts = opts || {};
    if (!t || !Array.isArray(t.matches) || !Array.isArray(opts.preRound) || !Array.isArray(opts.mergeUppers)) return null;
    const _pi = (opts.phaseIndex != null) ? opts.phaseIndex : null;
    const cat = (opts.cat != null) ? opts.cat : null;
    const mode = opts.mode || 'playin';
    const W = opts.W;
    const satout = opts.satout || null;
    const upperChamp = opts.upperChamp || null;
    const ts = opts.ts || Date.now();
    const idp = (opts.idPrefix || ('rdeL-' + ts)) + '-L';   // salt '-L' → ids da inferior nunca colidem
    const BYE = 'BYE (Avança Direto)';
    let cnt = 0;

    // Tier 2 (wipe): remove lower round>=2 + grande final da MESMA categoria/fase antes de
    // reconstruir. A pré-rodada (round 1) e o upper inteiro (com resultados) são preservados.
    if (opts.wipe) {
        t.matches = t.matches.filter(function (m) {
            if (!m) return false;
            var sameCat = (cat == null) || (m.category === cat) || (m.category == null);
            var samePhase = (_pi == null) || ((m.phaseIndex || 0) === _pi);
            if (!sameCat || !samePhase) return true;                 // outra categoria/fase: intocado
            if (m.bracket === 'grand') return false;                 // grande final: reconstrói
            if (m.bracket === 'lower' && m.round >= 2) return false;  // merges/battles: reconstrói
            return true;                                             // upper + lower R1: preserva
        });
    }

    function M(bracket, round, extra) {
        const m = Object.assign({ id: idp + '-' + bracket + '-r' + round + '-' + (cnt++) + '-' + ts, bracket, round, p1: 'TBD', p2: 'TBD', winner: null }, extra || {});
        if (_pi != null) m.phaseIndex = _pi;
        if (cat != null) m.category = cat;
        if (typeof window._appendCanonicalColumn === 'function') {
            window._appendCanonicalColumn(t, { phase: (bracket === 'grand' ? 'grandfinal' : 'elim'), bracket, round, matches: [m] });
        } else { t.matches.push(m); }
        return m;
    }
    // lround continua da pré-rodada recebida (round máximo da inferior em opts.preRound = 1).
    let lround = 1;
    opts.preRound.forEach(m => { if (m && m.bracket === 'lower' && m.round > lround) lround = m.round; });
    function lowerRound(games) { lround++; const arr = []; for (let i = 0; i < games; i++) arr.push(M('lower', lround)); return arr; }
    function slotsOf(arr) { const s = []; arr.forEach(m => { s.push({ m, s: 'p1' }); s.push({ m, s: 'p2' }); }); return s; }
    function fillOdd(sl, srcRoundPrev) {
        // Repescagem no ímpar (3ª+ vida): ressuscita o MELHOR derrotado. Em modo REPESCAGEM
        // NUNCA vira bye — prioriza a PRÓPRIA rodada (que sempre tem jogos normais quando o par
        // existe); só cai pra rodada anterior num caso degenerado (rodada só com o jogo-ímpar).
        // Regra do dono: repescagem = sem bye em lugar nenhum. O jogo-ímpar é marcado
        // isPhaseRepGame p/ não ser fonte de si mesmo; tagRep → badge REP no revivido.
        if (mode === 'bye') { if (sl.s === 'p1') sl.m.p1 = BYE; else sl.m.p2 = BYE; return; }
        sl.m.isPhaseRepGame = true;
        const _has = function (r) { return t.matches.some(m => m && m.bracket === 'lower' && m.round === r && !m.isPhaseRepGame && (cat == null || m.category === cat)); };
        const src = _has(lround) ? lround : srcRoundPrev;
        if (!_has(src)) { if (sl.s === 'p1') sl.m.p1 = BYE; else sl.m.p2 = BYE; return; } // degenerado: sem fonte
        (sl.m.repFill = sl.m.repFill || []).push({ slot: sl.s, srcBracket: 'lower', srcRound: src, rank: 0, cat, tagRep: true });
    }

    let prevLower = opts.preRound.slice();
    let alive = prevLower.length;
    const K = opts.mergeUppers.length;
    for (let w = 0; w < K; w++) {
        const upLosers = opts.mergeUppers[w] || [];
        const directNames = (w === 0 && satout) ? [satout] : [];
        let entrants = alive + upLosers.length + directNames.length;
        const repNeed = entrants % 2;
        entrants += repNeed;
        const merge = lowerRound(entrants / 2);
        const s = slotsOf(merge); let si = 0;
        prevLower.forEach(pm => { const sl = s[si++]; pm.nextMatchId = sl.m.id; pm.nextSlot = sl.s; });
        upLosers.forEach(um => { const sl = s[si++]; um.loserMatchId = sl.m.id; um.loserSlot = sl.s; });
        directNames.forEach(d => {
            const sl = s[si++];
            if (d.loserFeed) {
                // wiring DINÂMICO: o perdedor do jogo-fonte (repGame da dupla ímpar) cai NESTE slot
                // quando o jogo é decidido (via _advanceWinner/loserMatchId). Não há nome no build.
                d.loserFeed.loserMatchId = sl.m.id; d.loserFeed.loserSlot = sl.s;
            } else if (sl.s === 'p1') { sl.m.p1 = d.name; if (d.obj) sl.m.team1Obj = d.obj; }
            else { sl.m.p2 = d.name; if (d.obj) sl.m.team2Obj = d.obj; }
        });
        if (repNeed) fillOdd(s[si++], lround - 1);
        prevLower = merge; alive = merge.length;
    }
    // battles finais (sem battle intercalada entre merges): reduz a 1 depois de consumir todo o
    // upper. Pra 14 duplas: pré 3, merge 4, merge 3, merge 2 (semi), battle 1 (final) = 3-4-3-2-1.
    while (alive > 1) {
        let bent = alive; const brep = bent % 2; bent += brep;
        const battle = lowerRound(bent / 2);
        const bs = slotsOf(battle); let bsi = 0;
        prevLower.forEach(pm => { const sl = bs[bsi++]; pm.nextMatchId = sl.m.id; pm.nextSlot = sl.s; });
        if (brep) fillOdd(bs[bsi++], lround - 1);
        prevLower = battle; alive = battle.length;
    }

    // ---- GRANDE FINAL ----
    const gf = M('grand', W + 1, { label: 'Grande Final' });
    if (upperChamp) { upperChamp.nextMatchId = gf.id; upperChamp.nextSlot = 'p1'; }
    if (prevLower && prevLower[0]) { prevLower[0].nextMatchId = gf.id; prevLower[0].nextSlot = 'p2'; }

    // resolve vagas repFill já decididas (BYEs inferiores auto-resolvem no _advanceWinner).
    if (typeof window._resolveRepFills === 'function') { try { window._resolveRepFills(t); } catch (e) {} }
    return gf;
};

// ── DUPLA ELIMINATÓRIA fora de potência de 2, com REPESCAGEM (não elimina na 1ª) ──
// Lê a repescagem R1 (round 0, isPhaseRepR1) que o _duplaR1FromPool criou e monta:
//   • CHAVE SUPERIOR de T: R1 (T/2 jogos) = g vencedores da repescagem + os `promote`
//     MELHORES derrotados que sobem (repFill); R2+ halving normal.
//   • CHAVE INFERIOR: pré-rodada com os `toLower` derrotados que sobraram (todos jogam de
//     novo — ninguém eliminado na 1ª) + rodadas de merge (absorve os perdedores do upper)
//     e battle, com REPESCAGEM sempre que a contagem der ímpar (o melhor derrotado da
//     rodada anterior entra em vez de dar BYE).
//   • GRANDE FINAL: campeão superior × campeão inferior.
// As vagas de repescagem são preenchidas por _resolveRepFills quando a rodada-fonte fecha.
// Ver project_dupla_elim_repechage. meta = { g,T,promote,toLower,hasSat,satName,satObj,idPrefix }.
window._buildRepechageDoubleElim = function (t, meta, opts) {
    if (!t || !meta || !Array.isArray(t.matches)) return;
    const _pi = (opts && opts.phaseIndex != null) ? opts.phaseIndex : null;
    const ts = Date.now();
    let cnt = 0;
    const idp = meta.idPrefix || ('rde-' + ts);
    const cat = (meta.category != null) ? meta.category : null;   // 1 chave por categoria
    const mode = meta.mode || 'playin';                          // 'playin' (repescagem) | 'bye'
    const BYE = 'BYE (Avança Direto)';

    function M(bracket, round, extra) {
        const m = Object.assign({ id: idp + '-' + bracket + '-r' + round + '-' + (cnt++) + '-' + ts, bracket, round, p1: 'TBD', p2: 'TBD', winner: null }, extra || {});
        if (_pi != null) m.phaseIndex = _pi;
        if (cat != null) m.category = cat;
        if (typeof window._appendCanonicalColumn === 'function') {
            window._appendCanonicalColumn(t, { phase: (bracket === 'grand' ? 'grandfinal' : 'elim'), bracket, round, matches: [m] });
        } else { t.matches.push(m); }
        return m;
    }
    let lround = 0;
    function lowerRound(games) { lround++; const arr = []; for (let i = 0; i < games; i++) arr.push(M('lower', lround)); return arr; }
    function slotsOf(arr) { const s = []; arr.forEach(m => { s.push({ m, s: 'p1' }); s.push({ m, s: 'p2' }); }); return s; }

    // ---- CHAVE SUPERIOR + preparação da PRÉ-rodada inferior (por modo) ----
    // Os DOIS modos convergem no MESMO motor de chave inferior (merge/battle + suavização
    // de ímpar por repFill). O que difere é só COMO a chave superior nasce e quem cai na
    // pré-rodada inferior. feedback_resolution_one_logic.
    const upper = {};
    let W, preGames, feedPre, mergeUppers, satout = null;

    if (mode === 'bye') {
        // ⚠️ WIP / ATUALMENTE INALCANÇÁVEL: BYE em dupla-elim fora de pow2 ainda NÃO é robusto
        // (fluxo assimétrico na chave inferior com muitos byes → vagas mortas p/ n grande).
        // _duplaR1FromPool NÃO emite mode:'bye' hoje → este ramo não roda. Mantido como base
        // p/ o fix futuro (com referência de algoritmo). Resolução canônica atual = playin.
        // Upper R1 já veio bye-preenchida (semeada, cabeças folgam) do _duplaR1FromPool.
        const hi = meta.hi;
        W = Math.round(Math.log(hi) / Math.log(2));
        upper[1] = t.matches.filter(m => m && m.round === 1 && m.bracket === 'upper' && (cat == null || m.category === cat) && (_pi == null || (m.phaseIndex || 0) === _pi))
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        for (let r = 2; r <= W; r++) {
            upper[r] = [];
            const pc = upper[r - 1].length / 2;
            for (let j = 0; j < pc; j++) upper[r].push(M('upper', r));
            upper[r - 1].forEach((pm, idx) => { const nm = upper[r][Math.floor(idx / 2)]; pm.nextMatchId = nm.id; pm.nextSlot = (idx % 2 === 0) ? 'p1' : 'p2'; });
        }
        // BYE da R1 auto-avança pra R2 já no sorteio (o jogo-BYE não dropa "perdedor").
        upper[1].forEach(m => {
            if (m.isBye && m.winner && m.nextMatchId) {
                const nx = upper[2] && upper[2].filter(x => x.id === m.nextMatchId)[0];
                if (nx) { if (m.nextSlot === 'p1') nx.p1 = m.winner; else if (m.nextSlot === 'p2') nx.p2 = m.winner; if (m.team1Obj) nx[m.nextSlot === 'p1' ? 'team1Obj' : 'team2Obj'] = m.team1Obj; }
            }
        });
        const realLosers = upper[1].filter(m => !m.isBye);   // só jogos reais dropam pra inferior
        preGames = Math.ceil(realLosers.length / 2);
        feedPre = function (pre) {
            const s = slotsOf(pre); let si = 0;
            realLosers.forEach(um => { const sl = s[si++]; um.loserMatchId = sl.m.id; um.loserSlot = sl.s; });
            for (; si < s.length; si++) { const sl = s[si]; if (sl.s === 'p1') sl.m.p1 = BYE; else sl.m.p2 = BYE; } // sobra ímpar → BYE inferior (auto-resolve)
        };
        mergeUppers = []; for (let r = 2; r <= W; r++) mergeUppers.push(upper[r]);
    } else {
        // playin (repescagem): repR1 (round 0) → chave de T (vencedores + melhores derrotados).
        const g = meta.g, T = meta.T, promote = meta.promote, toLower = meta.toLower;
        W = Math.round(Math.log(T) / Math.log(2));
        const rep = t.matches.filter(m => m && m.isPhaseRepR1 && m.round === 0 && (cat == null || m.category === cat) && (_pi == null || (m.phaseIndex || 0) === _pi))
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        // A DUPLA ÍMPAR joga o repGame na R1 sup (não vai direto pro lower). Espelha o
        // genTierBracket: g vencedores + directSpots melhores derrotados (direto pra R2) +
        // o VENCEDOR do repGame preenchem a chave de T; o PERDEDOR do repGame cai no lower.
        const repGame = rep.filter(m => m.isPhaseRepGame)[0] || null;
        const normalRep = rep.filter(m => !m.isPhaseRepGame);            // g jogos "cheios"
        const directSpots = repGame ? (promote - 1) : promote;          // melhores derrotados que sobem DIRETO
        const entrants = [];                                             // semente 0..T-1 da chave de T
        for (let ei = 0; ei < normalRep.length; ei++) entrants.push({ fromR1: normalRep[ei] });
        for (let di = 0; di < directSpots; di++) entrants.push({ repDirect: di });   // di-ésimo melhor derrotado
        if (repGame) entrants.push({ fromRepGame: repGame });           // vencedor do jogo da ímpar
        upper[1] = [];
        for (let i = 0; i < T / 2; i++) upper[1].push(M('upper', 1));
        const _wireEnt = function (ent, slot, gm) {
            if (!ent) return;
            if (ent.fromR1) { ent.fromR1.nextMatchId = gm.id; ent.fromR1.nextSlot = slot; }
            else if (ent.fromRepGame) { ent.fromRepGame.nextMatchId = gm.id; ent.fromRepGame.nextSlot = slot; }
            else if (ent.repDirect != null) { (gm.repFill = gm.repFill || []).push({ slot, srcBracket: 'upper', srcRound: 0, rank: ent.repDirect, cat, tagRep: true }); } // sobe pra chave superior → TAG REP
        };
        for (let e = 0; e < T; e++) { _wireEnt(entrants[e], (e % 2 === 0) ? 'p1' : 'p2', upper[1][Math.floor(e / 2)]); }
        for (let r = 2; r <= W; r++) {
            upper[r] = [];
            const pc = upper[r - 1].length / 2;
            for (let j = 0; j < pc; j++) upper[r].push(M('upper', r));
            upper[r - 1].forEach((pm, idx) => { const nm = upper[r][Math.floor(idx / 2)]; pm.nextMatchId = nm.id; pm.nextSlot = (idx % 2 === 0) ? 'p1' : 'p2'; });
        }
        // Pré-rodada inferior: os `toLower` piores derrotados (rank promote..). toLower é sempre par.
        preGames = toLower / 2;
        feedPre = function (pre) {
            pre.forEach((m, i) => { m.repFill = [
                { slot: 'p1', srcBracket: 'upper', srcRound: 0, rank: promote + 2 * i, cat },
                { slot: 'p2', srcBracket: 'upper', srcRound: 0, rank: promote + 2 * i + 1, cat }
            ]; });
        };
        mergeUppers = []; for (let r = 1; r <= W; r++) mergeUppers.push(upper[r]);
        // A ímpar NÃO entra direto no lower — joga o repGame. O PERDEDOR do repGame entra no 1º
        // merge inferior, EXATAMENTE onde o satout estático entrava (mesma contagem de vagas),
        // só que via wiring dinâmico (loserFeed → loserMatchId), pois quem cai só se sabe ao jogar.
        satout = repGame ? { loserFeed: repGame } : null;
    }

    // ---- CHAVE INFERIOR + GRANDE FINAL (motor ÚNICO — extraído p/ _rebuildLowerBracket) ----
    // A pré-rodada (lower round 1) nasce aqui (por modo, via feedPre); merges/battles/grande
    // final saem no motor reusável (o MESMO usado quando duplas tardias entram na R1 inferior —
    // _integrateLateDuplas Tier 2). Ver project_dupla_elim_repechage.
    let prevLower = lowerRound(preGames);
    feedPre(prevLower);
    // ── REPESCAGEM RECURSIVA na R1 inferior (3ª vida) — project_lower_bracket_recursive_repechage ──
    // n ímpar (satout = perdedor do jogo da ímpar superior) E há jogos normais na pré-rodada
    // (preGames>0 → existe derrotado da própria R1 inf pra ressuscitar): a ímpar da INFERIOR joga
    // um jogo-repescagem na PRÓPRIA R1 inf — mesmo padrão do jogo da ímpar superior. p1 = perdedor
    // do jogo da ímpar superior (loserFeed dinâmico), p2 = MELHOR derrotado dos `preGames` jogos
    // normais desta R1 inf (repFill rank 0, MESMA rodada, isPhaseRepGame → não é fonte de si mesmo;
    // SEM tagRep porque continua na inferior). Vencedor → merge1 (ocupa a vaga do antigo satout);
    // perdedor → eliminado (3ª derrota). Assim a R1 inf fica com 4 jogos (n=15) em vez de empurrar
    // a ímpar direto pro merge1. Regra do dono: ímpar+repescagem = 3ª vida, SEM bye. Quando toLower=0
    // (n=2^k+1: pré sem jogos normais, nada pra ressuscitar) mantém o comportamento antigo
    // (satout → merge1, que lá pode dar bye por falta de fonte — caso de borda documentado).
    if (mode === 'playin' && satout && satout.loserFeed && preGames > 0) {
        const lowImpar = M('lower', lround, { isPhaseRepGame: true, isLowerImpar: true });
        satout.loserFeed.loserMatchId = lowImpar.id; satout.loserFeed.loserSlot = 'p1';
        lowImpar.repFill = [{ slot: 'p2', srcBracket: 'lower', srcRound: lround, rank: 0, cat: cat, tagRep: true }];
        prevLower.push(lowImpar);   // entra na R1 inf; seu VENCEDOR alimenta o merge1
        satout = null;              // não injeta mais direto no merge1
    }
    window._rebuildLowerBracket(t, {
        preRound: prevLower, mergeUppers: mergeUppers, satout: satout,
        upperChamp: (upper[W] && upper[W][0]) || null, W: W, mode: mode,
        cat: cat, phaseIndex: _pi, idPrefix: idp, ts: ts, wipe: false
    });
};

// Conta o total de jogos de uma Dupla Eliminatória com repescagem (n fora de pow2).
// ESPELHA a cadência do _buildRepechageDoubleElim (aritmética pura, sem montar nada) —
// usado pelas estimativas dos painéis de resolução pra o número prometido == o sorteio real.
window._countRepechageDoubleElim = function (n) {
    if (!(n > 2) || (n & (n - 1)) === 0) return null;
    var g = Math.floor(n / 2), hasSat = (n % 2) === 1;
    var T = 1; while (T * 2 <= n) T *= 2;            // maior pow2 <= n (IGUAL ao builder _duplaR1FromPool)
    var toLower = 2 * g - T;
    var W = Math.round(Math.log(T) / Math.log(2));
    var total = g + (hasSat ? 1 : 0);               // repescagem R1 (round 0): g normais + jogo da ímpar (n ímpar)
    var uc = T / 2; for (var r = 1; r <= W; r++) { total += uc; uc = Math.floor(uc / 2); } // upper R1..W
    // Pré-rodada inferior: preNormal jogos normais + (se n ímpar E há normais p/ ressuscitar) 1 jogo-ímpar.
    // Se toLower=0 (n=2^k+1), o perdedor da ímpar superior vai direto pro merge1 (satToMerge).
    var preNormal = toLower / 2;
    var imparInLower = (hasSat && preNormal > 0) ? 1 : 0;
    var satToMerge = (hasSat && !imparInLower) ? 1 : 0;
    var alive = preNormal + imparInLower; total += alive; // pré-rodada inferior
    for (var w = 1; w <= W; w++) {
        var upLose = T / Math.pow(2, w);
        var ent = alive + upLose + ((w === 1) ? satToMerge : 0);
        ent += ent % 2;
        var merge = ent / 2; total += merge; alive = merge;
    }
    while (alive > 1) { var b = alive; b += b % 2; var battle = b / 2; total += battle; alive = battle; } // battle(s) final(is)
    return total + 1;                                // grande final
};

// ========== Drag-and-drop handlers ==========
window.handleDragStart = function (e, idx, tId) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ idx, tId }));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.style.opacity = '0.4', 0);
    // v2.7.89: guarda ONDE o card foi pego (pra centrar a seção compacta nesse ponto).
    window._spDragPickY = (typeof e.clientY === 'number' && e.clientY > 0) ? e.clientY : (window.innerHeight / 2);
    // v2.7.86/87: esconde o card arrastado da lista + compacta os outros (só-nome,
    // grade) — drop mais perto. setTimeout pra não corromper a imagem do drag.
    setTimeout(function () { if (window._markDragSource) window._markDragSource(e.target); if (window._setDragCompact) window._setDragCompact(true); }, 0);
    // Store participant data for potential use
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (t && Array.isArray(t.participants) && t.participants[idx]) {
      window._participantDragData = t.participants[idx];
      window._participantDragTId = tId;
    }
    // Show crown drop target while dragging
    var crownBtn = document.getElementById('crown-org-btn');
    if (crownBtn) crownBtn.style.display = 'flex';
    if (typeof window._setOrgDropActive === 'function') window._setOrgDropActive(true);
};

window.handleDragEnd = function (e) {
    e.target.style.opacity = '1';
    window._participantDragData = null;
    // Hide crown drop target
    var crownBtn = document.getElementById('crown-org-btn');
    if (crownBtn) crownBtn.style.display = 'none';
    if (typeof window._setOrgDropActive === 'function') window._setOrgDropActive(false);
    // Restore original styles on all cards that might have been highlighted
    document.querySelectorAll('.participant-card').forEach(c => {
        if (c.dataset.originalBg) {
            c.style.background = c.dataset.originalBg;
            c.style.border = c.dataset.originalBorder;
            delete c.dataset.originalBg;
            delete c.dataset.originalBorder;
        }
    });
};

window.handleDragOver = function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.handleDragEnter = function (e) {
    e.preventDefault();
    const card = e.currentTarget;
    if (!card.dataset.originalBg) {
        card.dataset.originalBg = card.style.background;
        card.dataset.originalBorder = card.style.border;
    }
    card.style.border = '2px dashed var(--primary-color)';
    card.style.background = 'rgba(255,255,255,0.05)';
};

window.handleDragLeave = function (e) {
    const card = e.currentTarget;
    if (card.dataset.originalBg) {
        card.style.background = card.dataset.originalBg;
        card.style.border = card.dataset.originalBorder;
    }
};

window.handleDropTeam = function (e, targetIdx) {
    e.preventDefault();

    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const sourceIdx = data.idx;
        const tId = data.tId;

        if (sourceIdx === targetIdx) return;

        const t = window._findTournamentById(tId);
        if (!t) return;

        // v2.0.0: modo individual NÃO bloqueia mais o drop — a MESCLAGEM
        // (substituir um placeholder pela pessoa real) vale em qualquer modo.
        // A formação de equipe é que fica restrita a modo não-individual (e
        // pré-sorteio); isso é decidido no overlay via allowTeam.

        // Capturar referências AGORA (antes do dialog — evita índices stale)
        const arr0 = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
        const p1snap = arr0[sourceIdx];
        const p2snap = arr0[targetIdx];
        if (!p1snap || !p2snap) return;

        const name1 = typeof p1snap === 'string' ? p1snap : (p1snap.displayName || p1snap.name || p1snap.email || '');
        const name2 = typeof p2snap === 'string' ? p2snap : (p2snap.displayName || p2snap.name || p2snap.email || '');

        if (!name1 || !name2 || name1 === name2) return;
        if (window._entryTeamMembers(p1snap) || window._entryTeamMembers(p2snap)) { // v3.0.x: "já em dupla" por estrutura, não por '/' no nome
            showAlertDialog('Já em dupla', 'Um dos participantes já está em dupla. Desfaça a dupla existente antes.', null, { type: 'warning' });
            return;
        }

        const uid1 = typeof p1snap === 'object' ? (p1snap.uid || '') : '';
        const uid2 = typeof p2snap === 'object' ? (p2snap.uid || '') : '';
        const newName = name1 + ' / ' + name2;

        // v2.7.75: organizador SEMPRE recebe o overlay com 🔵 Formar equipe +
        // 🔴 Mesclar (vermelho). Mesclar só aparece quando EXATAMENTE um lado é
        // real (tem uid) e o outro é genérico — e passa por aceite do usuário
        // real. Formar equipe num torneio individual passa a permitir times pra
        // todos. Participante (não-org) só pareia A SI MESMO (nunca mescla).
        var _hasMatchesD = (Array.isArray(t.matches) && t.matches.length) ||
                           (Array.isArray(t.rounds) && t.rounds.length) ||
                           (Array.isArray(t.groups) && t.groups.length);
        var _drawDoneD = !!_hasMatchesD || t.status === 'started' || t.status === 'in_progress';
        var _isOrgDrag = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));
        var _oneRealOneGeneric = (!!uid1) !== (!!uid2); // mescla só com 1 real + 1 genérico

        if (!_isOrgDrag) {
            // Participante: arrastar o PRÓPRIO card sobre outro = propor dupla (com aceite).
            window._participantSelfPair(tId, name1, uid1, name2, uid2);
            return;
        }
        window._showDropChoiceOverlay({
            tId: tId,
            sourceName: name1, sourceUid: uid1,
            targetName: name2, targetUid: uid2,
            ruleAllowsTeam: (t.enrollmentMode !== 'individual'),
            drawDone: _drawDoneD,
            canMerge: _oneRealOneGeneric
        });

    } catch (err) { window._error(err); }
};

// ── v2.7.75: overlay de escolha ao soltar um card sobre outro (organizador) ───
//  🔵 Formar equipe (azul) SEMPRE — se a regra é individual, avisa que vai
//     passar a permitir times pra todos.
//  🔴 Mesclar jogador (vermelho) só quando 1 lado é real (uid) e o outro é
//     genérico — e dispara aceite do usuário real (vale só no torneio).
window._showDropChoiceOverlay = function(opts) {
    var old = document.getElementById('drop-choice-overlay');
    if (old) old.remove();
    var esc = function(s) { return window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s); };
    var ov = document.createElement('div');
    ov.id = 'drop-choice-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:10045;display:flex;align-items:center;justify-content:center;padding:20px;';
    var btnTeam = '<button id="dc-team" style="flex:1;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:10px;padding:12px 10px;font-weight:800;font-size:0.9rem;cursor:pointer;">🔵 Formar equipe</button>';
    var btnMerge = opts.canMerge
        ? '<button id="dc-merge" style="flex:1;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:10px;padding:12px 10px;font-weight:800;font-size:0.9rem;cursor:pointer;">🔴 Mesclar jogador</button>'
        : '';
    // Notas explicativas — distinguir CLARAMENTE formar dupla de mesclar pessoas.
    var teamNote = opts.ruleAllowsTeam
        ? '<div style="font-size:0.72rem;color:#93c5fd;margin-top:2px;">🔵 <b>Formar equipe</b>: os dois viram uma dupla.</div>'
        : '<div style="font-size:0.72rem;color:#fbbf24;margin-top:2px;">🔵 <b>Formar equipe</b>: este torneio é individual — formar dupla vai <b>passar a permitir times pra todos</b>.</div>';
    var mergeNote = opts.canMerge
        ? '<div style="font-size:0.72rem;color:#fca5a5;margin-top:4px;">🔴 <b>Mesclar jogador</b>: vincula um participante genérico ao usuário real (com conta). O real assume os jogos do genérico <b>neste torneio</b>. Exige o <b>aceite</b> dele.</div>'
        : '';
    // v2.7.76: Cancelar logo ABAIXO dos 2 botões (agrupado com eles), com cara de
    // botão (fundo sólido + volume), e as notas explicativas vão pro rodapé.
    var btnCancel = '<button id="dc-cancel" style="width:100%;margin-top:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:var(--text-bright);border-radius:10px;padding:12px 10px;font-weight:800;font-size:0.9rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 2px 6px rgba(0,0,0,0.25);">Cancelar</button>';
    ov.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:20px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.4);">' +
        '<div style="font-weight:800;color:var(--text-bright);font-size:1rem;margin-bottom:4px;">' + esc(opts.sourceName) + ' &rarr; ' + esc(opts.targetName) + '</div>' +
        '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">O que você quer fazer com esses dois?</div>' +
        '<div style="display:flex;gap:10px;">' + btnTeam + btnMerge + '</div>' +
        btnCancel +
        '<div style="margin-top:12px;">' + teamNote + mergeNote + '</div>' +
        '</div>';
    document.body.appendChild(ov);
    var close = function() { ov.remove(); };
    var cancelEl = document.getElementById('dc-cancel');
    if (cancelEl) cancelEl.onclick = close;
    ov.onclick = function(e) { if (e.target === ov) close(); };
    var teamEl = document.getElementById('dc-team');
    if (teamEl) teamEl.onclick = function() {
        close();
        // v2.7.81: o overlay já é a decisão → forma DIRETO (sem 2º confirm) quando a
        // regra já permite times; só confirma quando formar vai MUDAR a regra pra todos.
        window._formTeamConfirm(opts.tId, opts.sourceName, opts.sourceUid, opts.targetName, opts.targetUid, { changeRule: !opts.ruleAllowsTeam, skipConfirm: !!opts.ruleAllowsTeam });
    };
    if (opts.canMerge) {
        var mergeEl = document.getElementById('dc-merge');
        if (mergeEl) mergeEl.onclick = function() {
            close();
            window._requestMergeAcceptance(opts);
        };
    }
};

// ── v2.0.0: formar equipe (lógica preservada) — v2.7.75: opts.changeRule muda a
//    regra do torneio pra permitir times (quando era individual) PRA TODOS. ────
window._formTeamConfirm = function(tId, name1, uid1, name2, uid2, opts) {
    var t = window._findTournamentById(tId);
    if (!t) return;
    var newName = name1 + ' / ' + name2;
    var _changeRule = !!(opts && opts.changeRule);
    // v2.7.81: lógica de formar a dupla extraída — o overlay chama isto DIRETO
    // (skipConfirm) porque já é a decisão; só o caso "muda a regra" passa por confirm.
    var _doForm = function() {
        if (_changeRule) { t.enrollmentMode = 'misto'; } // passa a permitir times pra todos
        var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
        var findIdx = function(uid, name) {
            if (uid) {
                var i = arr.findIndex(function(p) { return typeof p === 'object' && p && p.uid === uid; });
                if (i !== -1) return i;
            }
            return arr.findIndex(function(p) {
                var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
                return n === name;
            });
        };
        var i1 = findIdx(uid1, name1);
        var i2 = findIdx(uid2, name2);
        if (i1 === -1 || i2 === -1 || i1 === i2) return;
        var p1final = arr[i1];
        var p2final = arr[i2];
        var fuid1 = typeof p1final === 'object' ? (p1final.uid || '') : '';
        var fuid2 = typeof p2final === 'object' ? (p2final.uid || '') : '';
        // v2.7.97: preserva o nº de inscrição original de cada membro (p1Seq/p2Seq).
        if (window._ensureEnrollSeqs) window._ensureEnrollSeqs(t);
        var fseq1 = (typeof p1final === 'object' && p1final.enrollSeq != null) ? p1final.enrollSeq : null;
        var fseq2 = (typeof p2final === 'object' && p2final.enrollSeq != null) ? p2final.enrollSeq : null;
        var mergedEntry = {
            displayName: newName, name: newName,
            uid: fuid1 || fuid2 || '',
            p1Name: name1, p1Uid: fuid1,
            p2Name: name2, p2Uid: fuid2,
            p1Seq: fseq1, p2Seq: fseq2,
            ligaActive: true
        };
        var maxI = Math.max(i1, i2);
        var minI = Math.min(i1, i2);
        arr.splice(maxI, 1);
        arr.splice(minI, 1);
        arr.splice(minI, 0, mergedEntry);
        t.participants = arr;
        if (!t.teamOrigins) t.teamOrigins = {};
        t.teamOrigins[newName] = 'formada';
        // v4.5.94: formar dupla MANUALMENTE = regra "Já formadas". Sincroniza a config
        // (fmt2.formacaoDupla) pra o seletor "Duplas na eliminatória" refletir a mudança —
        // antes só mexia no enrollmentMode e o seletor continuava "Sorteadas".
        if (typeof window._markDuplasManual === 'function') window._markDuplasManual(t);
        window.FirestoreDB.saveTournament(t);
        var container = document.getElementById('view-container');
        if (container) renderTournaments(container, tId);
        if (typeof showNotification === 'function') showNotification('👫 Dupla formada!', newName, 'success');
    };
    if (opts && opts.skipConfirm) { _doForm(); return; }
    var _eNew = window._safeHtml(newName), _e1 = window._safeHtml(name1), _e2 = window._safeHtml(name2); // v3.0.x: escapa nomes (showConfirmDialog renderiza message como HTML)
    var _msg = _changeRule
        ? ('Este torneio é individual. Formar a dupla "' + _eNew + '" vai <b>passar a permitir times pra todos</b> (a regra do torneio muda). Confirmar?')
        : (_e1 + ' e ' + _e2 + ' formarão a dupla "' + _eNew + '". Confirmar?');
    showConfirmDialog(
        _changeRule ? 'Formar dupla (muda a regra)' : 'Formar dupla',
        _msg,
        _doForm,
        null,
        { type: 'info', confirmText: 'Formar dupla', cancelText: _t('btn.keepSeparate') }
    );
};

// ── v2.0.0: substitui o nome de um participante em TODA a chave ──────────────
// (matches/grupos/rounds), inclusive dentro de strings de dupla "A / B",
// arrays team1/team2 e no campo winner. Mesmo padrão da substituição por W.O.
window._replaceParticipantNameInBracket = function(t, oldName, newName) {
    if (!t || !oldName || !newName || oldName === newName) return;
    var matches = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t) : (t.matches || []);
    var swap = function(s) {
        if (typeof s !== 'string') return s;
        if (s === oldName) return newName;
        if (s.indexOf(' / ') !== -1) {
            return s.split(' / ').map(function(n) {
                return n.trim() === oldName ? newName : n.trim();
            }).join(' / ');
        }
        return s;
    };
    matches.forEach(function(m) {
        if (!m) return;
        m.p1 = swap(m.p1);
        m.p2 = swap(m.p2);
        if (m.winner) m.winner = swap(m.winner);
        if (Array.isArray(m.team1)) { var i1 = m.team1.indexOf(oldName); if (i1 !== -1) m.team1[i1] = newName; }
        if (Array.isArray(m.team2)) { var i2 = m.team2.indexOf(oldName); if (i2 !== -1) m.team2[i2] = newName; }
    });
};

// ── v2.0.0: MESCLAR — a pessoa (origem/arrastada) assume a vaga do placeholder
// (alvo). A entrada do placeholder mantém a POSIÇÃO no array, mas a IDENTIDADE
// vira a da pessoa; a entrada avulsa da pessoa é removida; o nome é substituído
// na chave (placeholder → pessoa). Guarda snapshot pra desfazer.
window._mergeParticipantConfirm = function(tId, personName, personUid, placeholderName, placeholderUid) {
    var t = window._findTournamentById(tId);
    if (!t) return;
    var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
    var findIdx = function(uid, name) {
        if (uid) {
            var i = arr.findIndex(function(p) { return typeof p === 'object' && p && p.uid === uid; });
            if (i !== -1) return i;
        }
        return arr.findIndex(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            return n === name;
        });
    };
    var pIdx = findIdx(personUid, personName);          // pessoa (origem)
    var phIdx = findIdx(placeholderUid, placeholderName); // placeholder (alvo)
    if (pIdx === -1 || phIdx === -1 || pIdx === phIdx) return;
    var personObj = typeof arr[pIdx] === 'object' ? arr[pIdx] : { displayName: arr[pIdx], name: arr[pIdx] };
    var placeholderObj = typeof arr[phIdx] === 'object' ? arr[phIdx] : { displayName: arr[phIdx], name: arr[phIdx] };
    var undo = {
        placeholder: JSON.parse(JSON.stringify(placeholderObj)),
        person: JSON.parse(JSON.stringify(personObj))
    };
    var newEntry = {
        displayName: personName, name: personName,
        uid: personObj.uid || '',
        email: personObj.email || '',
        photoURL: personObj.photoURL || '',
        _mergedFrom: undo
    };
    if (personObj.category) newEntry.category = personObj.category;
    if (personObj.gender) newEntry.gender = personObj.gender;
    arr[phIdx] = newEntry;       // placeholder vira a pessoa (mantém posição)
    arr.splice(pIdx, 1);         // remove a entrada avulsa da pessoa
    t.participants = arr;
    window._replaceParticipantNameInBracket(t, placeholderName, personName);
    window.FirestoreDB.saveTournament(t);
    var container = document.getElementById('view-container');
    if (container) renderTournaments(container, tId);
    if (typeof showNotification === 'function') showNotification('Mesclado', personName + ' assumiu a vaga de ' + placeholderName + '.', 'success');
};

// ── v2.7.75: MESCLA COM ACEITE ───────────────────────────────────────────────
// Mesclar vincula um participante GENÉRICO (sem conta) ao usuário REAL (com uid).
// O real assume os jogos/resultados do genérico NESTE torneio. Como é uma
// identidade real sendo afetada, NÃO mescla na hora: registra uma pendência em
// t.pendingMerges[], notifica o uid real e só mescla quando ELE aceitar.
window._requestMergeAcceptance = function(opts) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === opts.tId.toString(); });
    if (!t) return;
    // Identifica quem é o real (tem uid) e quem é o genérico (sem uid).
    var realName, realUid, genericName;
    if (opts.sourceUid && !opts.targetUid) { realName = opts.sourceName; realUid = opts.sourceUid; genericName = opts.targetName; }
    else if (!opts.sourceUid && opts.targetUid) { realName = opts.targetName; realUid = opts.targetUid; genericName = opts.sourceName; }
    else {
        if (typeof showNotification === 'function') showNotification('Não dá pra mesclar', 'A mescla só vincula UM participante genérico a UM usuário real (com conta).', 'warning');
        return;
    }
    showConfirmDialog(
        '🔴 Mesclar jogador',
        '“' + window._safeHtml(realName) + '” (usuário real) vai assumir os jogos de “' + window._safeHtml(genericName) + '” <b>só neste torneio</b>. ' +
        'Vamos enviar um pedido de aceite pra <b>' + window._safeHtml(realName) + '</b> — a mescla só acontece se ele aceitar. Enviar o pedido?',
        function() {
            var req = {
                id: 'merge__' + Date.now() + '__' + Math.floor(Math.random() * 1e6),
                realName: realName, realUid: realUid,
                genericName: genericName,
                byUid: (window.AppStore.currentUser || {}).uid || '',
                byName: (window.AppStore.currentUser || {}).displayName || 'O organizador',
                at: new Date().toISOString()
            };
            if (!Array.isArray(t.pendingMerges)) t.pendingMerges = [];
            // evita duplicar o mesmo pedido (mesmo real + mesmo genérico)
            t.pendingMerges = t.pendingMerges.filter(function(r) { return !(r.realUid === realUid && r.genericName === genericName); });
            t.pendingMerges.push(req);
            t.updatedAt = new Date().toISOString();
            window.FirestoreDB.saveTournament(t);
            if (typeof window._sendUserNotification === 'function') {
                window._sendUserNotification(realUid, {
                    type: 'enrollment_new',
                    title: '🔗 Pedido de vínculo',
                    message: req.byName + ' quer que você assuma a participação de “' + window._safeHtml(genericName) + '” no torneio ' + window._safeHtml(t.name || '') + '. Abra o torneio para aceitar ou recusar.',
                    tournamentId: String(t.id), tournamentName: t.name || '', level: 'fundamental'
                });
            }
            if (typeof showNotification === 'function') showNotification('Pedido enviado', 'Aguardando ' + realName + ' aceitar o vínculo.', 'success');
            if (typeof window._softRefreshView === 'function') window._softRefreshView();
        },
        null,
        { type: 'warning', confirmText: 'Enviar pedido', cancelText: 'Cancelar' }
    );
};

// O usuário REAL aceita o vínculo → executa a mescla (assume a vaga do genérico).
window._acceptMergeRequest = function(tId, reqId) {
    var t = window._findTournamentById(tId);
    if (!t || !Array.isArray(t.pendingMerges)) return;
    var req = t.pendingMerges.filter(function(r) { return r.id === reqId; })[0];
    if (!req) return;
    var myUid = (window.AppStore.currentUser || {}).uid;
    if (!myUid || myUid !== req.realUid) {
        if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só o usuário indicado pode aceitar este vínculo.', 'warning');
        return;
    }
    // remove a pendência ANTES de mesclar (a mescla re-renderiza)
    t.pendingMerges = t.pendingMerges.filter(function(r) { return r.id !== reqId; });
    if (window._mergePromptShown) delete window._mergePromptShown[reqId];
    // person (real) assume a vaga do placeholder (genérico, sem uid)
    window._mergeParticipantConfirm(tId, req.realName, req.realUid, req.genericName, '');
    if (req.byUid && typeof window._sendUserNotification === 'function') {
        window._sendUserNotification(req.byUid, {
            type: 'enrollment_new', title: '✅ Vínculo aceito',
            message: window._safeHtml(req.realName) + ' aceitou assumir “' + window._safeHtml(req.genericName) + '” em ' + window._safeHtml(t.name || '') + '.',
            tournamentId: String(t.id), tournamentName: t.name || '', level: 'all'
        });
    }
};

// O usuário REAL recusa o vínculo → descarta a pendência e avisa o organizador.
window._rejectMergeRequest = function(tId, reqId) {
    var t = window._findTournamentById(tId);
    if (!t || !Array.isArray(t.pendingMerges)) return;
    var req = t.pendingMerges.filter(function(r) { return r.id === reqId; })[0];
    if (!req) return;
    t.pendingMerges = t.pendingMerges.filter(function(r) { return r.id !== reqId; });
    if (window._mergePromptShown) delete window._mergePromptShown[reqId];
    t.updatedAt = new Date().toISOString();
    window.FirestoreDB.saveTournament(t);
    if (req.byUid && typeof window._sendUserNotification === 'function') {
        window._sendUserNotification(req.byUid, {
            type: 'enrollment_new', title: '❌ Vínculo recusado',
            message: window._safeHtml(req.realName) + ' recusou assumir “' + window._safeHtml(req.genericName) + '” em ' + window._safeHtml(t.name || '') + '.',
            tournamentId: String(t.id), tournamentName: t.name || '', level: 'all'
        });
    }
    if (typeof showNotification === 'function') showNotification('Vínculo recusado', '', 'info');
    if (typeof window._softRefreshView === 'function') window._softRefreshView();
};

// Mostra ao usuário REAL (quando abre o torneio) o pedido de vínculo pendente.
// Uma vez por sessão por pedido (não fica re-disparando no soft-refresh).
window._checkPendingMerges = function(t) {
    if (!t || !Array.isArray(t.pendingMerges) || !t.pendingMerges.length) return;
    var myUid = (window.AppStore.currentUser || {}).uid;
    if (!myUid) return;
    var req = t.pendingMerges.filter(function(r) { return r.realUid === myUid; })[0];
    if (!req) return;
    if (!window._mergePromptShown) window._mergePromptShown = {};
    if (window._mergePromptShown[req.id]) return;
    window._mergePromptShown[req.id] = 1;
    showConfirmDialog(
        '🔗 Pedido de vínculo',
        '<b>' + window._safeHtml(req.byName) + '</b> quer que você assuma a participação de “' + window._safeHtml(req.genericName) + '” no torneio <b>' + window._safeHtml(t.name || '') + '</b>. ' +
        'Você herda os jogos e resultados desse participante <b>neste torneio</b>. Aceitar?',
        function() { window._acceptMergeRequest(String(t.id), req.id); },
        function() { window._rejectMergeRequest(String(t.id), req.id); },
        { type: 'info', confirmText: 'Aceitar', cancelText: 'Recusar' }
    );
};

// ── v2.7.75: PARTICIPANTE pareia A SI MESMO (arrastou o próprio card sobre outro)
//    Só com a regra permitindo times + manualPairing='open'. Nunca mescla. Vira
//    convite pendente que o parceiro aceita. Espelha o fluxo de _duplaDropOn.
window._participantSelfPair = function(tId, name1, uid1, name2, uid2) {
    var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
    if (!t) return;
    if (t.enrollmentMode === 'individual') {
        if (typeof showNotification === 'function') showNotification('Torneio individual', 'Este torneio não permite a formação de times.', 'info');
        return;
    }
    if (t.manualPairing !== 'open') {
        if (typeof showNotification === 'function') showNotification('Apenas o organizador', 'Neste torneio, só o organizador forma as duplas.', 'info');
        return;
    }
    var myUid = (window.AppStore.currentUser || {}).uid;
    if (!myUid || uid1 !== myUid) {
        if (typeof showNotification === 'function') showNotification('Arraste o seu card', 'Você só pode formar dupla arrastando o SEU próprio card sobre o de outra pessoa.', 'info');
        return;
    }
    if (!uid2) {
        if (typeof showNotification === 'function') showNotification('Sem conta', name2 + ' não tem conta para aceitar o convite. Peça ao organizador para formar a dupla.', 'info');
        return;
    }
    var _send = function() {
        if (!window._teamFormation) return;
        var res = window._teamFormation.requestPair(t, uid1, uid2, name1, name2);
        if (!res.ok) { if (typeof showNotification === 'function') showNotification('Não foi possível', window._pairErrorMsg ? window._pairErrorMsg(res.error) : res.error, 'warning'); return; }
        if (res.action === 'confirm' && typeof window._formDuplaByUids === 'function') {
            var iN = (res.inviterUid === uid1) ? name1 : name2, iU = res.inviterUid;
            var eN = (res.inviterUid === uid1) ? name2 : name1, eU = (res.inviterUid === uid1) ? uid2 : uid1;
            window._formDuplaByUids(tId, iN, iU, eN, eU);
            return;
        }
        t.updatedAt = new Date().toISOString();
        // v2.7.84: salva o convite ANTES de notificar — e mostra erro se o Firestore
        // rejeitar (antes era silencioso: o convite não persistia e o convidado ficava
        // sem o botão de aceitar). Só notifica/avisa "enviado" após o save confirmar.
        Promise.resolve(window.FirestoreDB.saveTournament(t)).then(function() {
            if (typeof window._sendUserNotification === 'function') {
                // v2.7.94: tipo 'pair_invite' + reqId + deep-links → botões Aceitar/Recusar
                // funcionais na plataforma, no email e no WhatsApp.
                var _reqId = uid1 + '__' + uid2;
                var _base = 'https://scoreplace.app/#pair/';
                window._sendUserNotification(uid2, {
                    type: 'pair_invite',
                    title: '🤝 Convite de dupla',
                    message: name1 + ' quer formar dupla com você em ' + (t.name || '') + '.',
                    tournamentId: String(t.id),
                    tournamentName: t.name || '',
                    pairRequestId: _reqId,
                    pairInviterName: name1,
                    pairInviteeName: name2,
                    acceptUrl: _base + 'accept/' + encodeURIComponent(String(t.id)) + '/' + encodeURIComponent(_reqId),
                    rejectUrl: _base + 'reject/' + encodeURIComponent(String(t.id)) + '/' + encodeURIComponent(_reqId),
                    level: 'fundamental'
                });
            }
            if (typeof showNotification === 'function') showNotification('Convite enviado', 'Aguardando ' + name2 + ' aceitar a dupla.', 'success');
            if (typeof window._softRefreshView === 'function') window._softRefreshView();
        }).catch(function(e) {
            // não persistiu → remove o convite local e avisa (loud failure)
            try { if (window._teamFormation && window._teamFormation.cancelPair) window._teamFormation.cancelPair(t, uid1 + '__' + uid2, uid1); } catch (_) {}
            if (typeof showNotification === 'function') showNotification('Não foi possível enviar', 'O convite não pôde ser salvo (' + ((e && (e.code || e.message)) || 'erro') + '). Tente de novo.', 'error');
            if (typeof window._softRefreshView === 'function') window._softRefreshView();
        });
    };
    if (typeof showConfirmDialog === 'function') showConfirmDialog('🤝 Convidar para dupla?', 'Enviar convite para "' + window._safeHtml(name2) + '" formar dupla com você?', _send, null, { type: 'info', confirmText: 'Enviar convite', cancelText: 'Cancelar' });
    else _send();
};

// ── v2.0.0: DESFAZER MESCLAGEM — restaura o placeholder na posição e devolve a
// pessoa como participante avulso; reverte o nome na chave (pessoa → placeholder).
window._undoMergeParticipant = function(tId, ref) {
    var t = window._findTournamentById(tId);
    if (!t) return;
    var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
    // v2.0.2: ref pode ser o NOME (string, robusto p/ múltiplas mesclagens) ou
    // um índice (number). Acha a entrada mesclada certa.
    var entry = null, idx = -1;
    if (typeof ref === 'string') {
        idx = arr.findIndex(function(p) { return p && typeof p === 'object' && p._mergedFrom && (p.displayName || p.name) === ref; });
        if (idx !== -1) entry = arr[idx];
    } else {
        idx = ref; entry = arr[idx];
    }
    if (!(entry && typeof entry === 'object' && entry._mergedFrom)) {
        var fi = arr.findIndex(function(p) { return p && typeof p === 'object' && p._mergedFrom; });
        if (fi === -1) return;
        idx = fi; entry = arr[idx];
    }
    var undo = entry._mergedFrom;
    if (!undo) return;
    var personName = entry.displayName || entry.name;
    var placeholderName = undo.placeholder.displayName || undo.placeholder.name;
    showConfirmDialog(
        'Desfazer mesclagem',
        '“' + window._safeHtml(personName) + '” voltará a ser avulso e a vaga “' + window._safeHtml(placeholderName) + '” será restaurada na chave. Confirmar?',
        function() {
            var arr2 = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
            var mi = arr2.findIndex(function(p) { return p && typeof p === 'object' && p._mergedFrom && (p.displayName || p.name) === personName; });
            if (mi === -1) mi = idx;
            arr2[mi] = JSON.parse(JSON.stringify(undo.placeholder));
            arr2.push(JSON.parse(JSON.stringify(undo.person)));
            t.participants = arr2;
            window._replaceParticipantNameInBracket(t, personName, placeholderName);
            window.FirestoreDB.saveTournament(t);
            var container = document.getElementById('view-container');
            if (container) renderTournaments(container, tId);
            if (typeof showNotification === 'function') showNotification('Mescla desfeita', placeholderName + ' restaurado; ' + personName + ' voltou como avulso.', 'info');
        },
        null,
        { type: 'warning', confirmText: 'Desfazer', cancelText: 'Cancelar' }
    );
};


/**
 * v1.8.1-beta: Personalized draw / new-round notifications.
 * Each participant gets their own notification showing their specific
 * match with real name + "(você)" in the email body.
 *
 * @param {object} t      - tournament object (already mutated with matches)
 * @param {string} tId    - tournament id
 * @param {object} [opts] - { type:'new_round', roundIndex: N } for Liga rounds 2+
 *                          Defaults: type='draw', roundIndex=last round for rounds-based,
 *                          or auto-detect from groups / matches.
 *
 * Supports: Eliminatórias / Dupla Elim (t.matches R1),
 *           Liga / Suíço (t.rounds[N].matches),
 *           Grupos + Elim / Rei-Rainha (t.groups[*].rounds[0].matches).
 */
window._notifyDrawPersonalized = async function(t, tId, opts) {
    if (typeof window._sendUserNotification !== 'function') return;
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;

    opts = opts || {};
    var notifType = opts.type || 'draw';
    var _tId = String(tId || t.id || '');
    var tUrl = 'https://scoreplace.app/#tournaments/' + _tId;
    var venue = t.venue || '';
    var startDate = t.startDate || '';
    var tName = t.name || 'Torneio';

    // ── Collect matches to notify about ─────────────────────────────────
    // allMatches = [{p1, p2, groupName?}]
    var allMatches = [];
    // Construtor de fases: opts.phaseIndex => notifica as partidas da fase
    // recém-materializada (tagueadas phaseIndex em t.matches), não a Liga/grupos.
    var _phaseIdx = (opts.phaseIndex != null) ? (parseInt(opts.phaseIndex, 10) || 0) : null;
    var isGroupsStage = Array.isArray(t.groups) && t.groups.length > 0 && t.currentStage === 'groups';

    if (_phaseIdx != null) {
        // Só as partidas JOGÁVEIS de entrada da fase — as rodadas seguintes e a
        // convergência (grande final/3º) têm p1/p2 = 'TBD' até os jogos anteriores
        // fecharem; o tierLabel (Ouro/Prata) vira o "grupo" nas linhas do e-mail.
        (Array.isArray(t.matches) ? t.matches : []).forEach(function(m) {
            if ((m.phaseIndex || 0) !== _phaseIdx) return;
            if (m.isBye || m.isSitOut) return;
            if (!m.p1 || m.p1 === 'TBD' || !m.p2 || m.p2 === 'TBD') return;
            allMatches.push({ p1: m.p1 || '', p2: m.p2 || '', groupName: m.tierLabel || '', label: m.label || '' });
        });
    } else if (isGroupsStage) {
        t.groups.forEach(function(g) {
            var gName = g.name || '';
            var r0 = Array.isArray(g.rounds) && g.rounds[0];
            if (r0 && Array.isArray(r0.matches)) {
                r0.matches.forEach(function(m) {
                    if (!m.isSitOut) allMatches.push({ p1: m.p1 || '', p2: m.p2 || '', groupName: gName, label: m.label || '' });
                });
            }
        });
    } else if (Array.isArray(t.rounds) && t.rounds.length > 0) {
        // Liga / Suíço — use specified roundIndex or last round
        var _ri = (opts.roundIndex !== undefined) ? opts.roundIndex : (t.rounds.length - 1);
        var _rnd = t.rounds[_ri] || {};
        (_rnd.matches || []).forEach(function(m) {
            if (!m.isSitOut) allMatches.push({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '' });
        });
    } else if (Array.isArray(t.matches)) {
        // Eliminatórias / Dupla Elim — round 1 only, skip BYEs
        t.matches.forEach(function(m) {
            if (m.round === 1 && !m.isBye && !m.isSitOut && (m.p1 || m.p2)) {
                allMatches.push({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '' });
            }
        });
    }

    if (!allMatches.length) return;

    // ── v2.3.83: prazo p/ lançar resultados = PRÓXIMO SORTEIO (data + hora).
    // Antes o e-mail mostrava t.startDate (data de início do torneio) — errado.
    // Fase de chave não tem cadência de sorteio (sem "próximo sorteio") → sem prazo.
    var _nextDraw = (_phaseIdx == null && typeof window._calcNextDrawDate === 'function') ? window._calcNextDrawDate(t) : null;
    var deadlineLabel = '';
    if (_nextDraw && !isNaN(_nextDraw.getTime())) {
        deadlineLabel = _nextDraw.toLocaleDateString('pt-BR') + ' às ' +
            _nextDraw.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    // ── Build matchLines for email (Jogo N: P1 vs P2) ───────────────────
    var matchLines = allMatches.map(function(m, i) {
        var prefix = m.groupName ? (m.groupName + ' · Jogo ' + (i + 1)) : ('Jogo ' + (i + 1));
        return prefix + ': ' + (m.p1 || '?') + ' vs ' + (m.p2 || '?');
    });

    // ── Check if playerName appears in a match side (handles "A / B" teams) ──
    // v2.4.80: casa tanto o nome do TIME inteiro ("A / B") quanto um membro
    // individual ("A"). O lado de uma partida de duplas é o displayName do time
    // ("A / B"); sem a checagem de igualdade direta, o nome do time nunca casava
    // (split daria ["A","B"], nenhum == "a / b") e a dupla ficava sem jogo.
    var _isInSide = function(playerName, side) {
        if (!playerName || !side) return false;
        var pn = playerName.trim().toLowerCase();
        if (side.trim().toLowerCase() === pn) return true;
        return side.split(' / ').some(function(s) { return s.trim().toLowerCase() === pn; });
    };

    // ── Format date for WhatsApp text ────────────────────────────────────
    var _fmtDate = function(d) {
        try { var dt = new Date(d); return isNaN(dt) ? d : dt.toLocaleDateString('pt-BR'); } catch(e) { return d; }
    };

    // ── Notification labels per type ────────────────────────────────────
    var _isNewRound = (notifType === 'new_round');
    var _isPhase = (notifType === 'new_phase');
    var _phaseName = _isPhase ? ((((t.phases || [])[_phaseIdx]) || {}).name || ('Fase ' + ((_phaseIdx || 0) + 1))) : '';
    var notifIcon = _isPhase ? '🏆' : (_isNewRound ? '🔄' : '🎲');
    var notifTitle = _isPhase
        ? ('🏆 ' + _phaseName + ': ' + tName)
        : ((_isNewRound ? '🔄 Nova Rodada: ' : '🎲 Chaveamento: ') + tName);
    var baseMsg = _isPhase
        ? ('O torneio ' + tName + ' avançou para a fase ' + _phaseName + '. Confira seu próximo jogo.')
        : (_isNewRound
            ? 'Uma nova rodada foi gerada no torneio ' + tName + '.'
            : 'O chaveamento do torneio ' + tName + ' foi gerado.');
    var ctaText = _isPhase ? 'Ver fase' : (_isNewRound ? 'Ver rodada' : 'Ver chaveamento');

    // ── Notify each participant individually ─────────────────────────────
    var parts = Array.isArray(t.participants)
        ? t.participants
        : (t.participants ? Object.values(t.participants) : []);

    // v2.4.80: helper canônico — TODOS os UIDs de um participante. Duplas
    // pré-formadas são UM objeto com p1Uid/p2Uid e SEM uid de time; ler só
    // `p.uid` pulava a dupla inteira (ninguém recebia a notificação de sorteio).
    // Agora cada pessoa da dupla é notificada individualmente, com o jogo do time.
    var _allUids = (typeof window._participantUids === 'function')
        ? window._participantUids
        : function(p) { return (p && p.uid) ? [p.uid] : []; };
    var _seenUids = {};

    for (var _pi = 0; _pi < parts.length; _pi++) {
        var p = parts[_pi];
        if (typeof p === 'string') continue;

        // Nome do TIME/participante = lado da partida ("A / B" para duplas).
        var pName = p.displayName || p.name || '';
        if (!pName) continue;

        var uids = _allUids(p);
        if (!uids.length) continue;

        // Mapa uid → nome individual (duplas: p1Uid→p1Name, p2Uid→p2Name; e os
        // sub-participantes em p.participants[]). Cada membro recebe seu próprio
        // nome na notificação personalizada, mas o jogo é o do time.
        var _uidName = {};
        if (p.uid) _uidName[p.uid] = pName;
        if (p.p1Uid) _uidName[p.p1Uid] = p.p1Name || pName;
        if (p.p2Uid) _uidName[p.p2Uid] = p.p2Name || pName;
        if (Array.isArray(p.participants)) {
            p.participants.forEach(function(s) {
                if (s && s.uid) _uidName[s.uid] = s.displayName || s.name || pName;
            });
        }

        // v2.3.83: TODOS os jogos deste participante na rodada (Rei/Rainha são 3).
        var playerMatches = [];
        for (var _mi = 0; _mi < allMatches.length; _mi++) {
            var am = allMatches[_mi];
            if (_isInSide(pName, am.p1) || _isInSide(pName, am.p2)) {
                playerMatches.push({
                    num: _mi + 1,
                    label: am.label || ('Jogo ' + (_mi + 1)),
                    p1: am.p1 || '',
                    p2: am.p2 || ''
                });
            }
        }
        // Compat: 1º jogo do jogador (campos antigos ainda usados como fallback).
        var playerMatch = playerMatches.length ? { p1: playerMatches[0].p1, p2: playerMatches[0].p2 } : null;
        var playerMatchNum = playerMatches.length ? playerMatches[0].num : 0;

        // Personalized plain-text (WhatsApp): lista os jogos com time numa linha
        // e adversário na outra, + prazo de lançamento (próximo sorteio).
        var msg = baseMsg;
        if (playerMatches.length) {
            var _gamesText = playerMatches.map(function(pm) {
                return pm.label + ':\n' + (pm.p1 || '?') + '\nvs\n' + (pm.p2 || '?');
            }).join('\n\n');
            msg = notifIcon + ' ' + (_isPhase ? ('Você avançou para a fase ' + _phaseName + ' no torneio') : (_isNewRound ? 'Nova rodada no torneio' : 'Chaveamento do torneio')) +
                ' ' + tName + '!' +
                '\n\n' + _gamesText +
                (venue ? '\n\n📍 ' + venue : '') +
                (deadlineLabel ? '\n⏰ Lance os resultados até ' + deadlineLabel : '');
        }

        // Notifica CADA UID individualmente (cada membro da dupla recebe a sua).
        for (var _ui = 0; _ui < uids.length; _ui++) {
            var uid = uids[_ui];
            if (!uid || _seenUids[uid]) continue;
            _seenUids[uid] = true;
            try {
                await window._sendUserNotification(uid, {
                    type: notifType,
                    level: 'fundamental',
                    title: notifTitle,
                    message: msg,
                    tournamentId: _tId,
                    tournamentName: tName,
                    ctaUrl: tUrl,
                    ctaText: ctaText,
                    matchLines: matchLines,
                    playerMatch: playerMatch || undefined,
                    playerMatchNum: playerMatchNum || 0,
                    playerMatches: playerMatches,
                    deadline: deadlineLabel,
                    playerName: _uidName[uid] || pName,
                    venue: venue,
                    startDate: startDate
                });
            } catch(e) {
                window._warn('[notifyDrawPersonalized] uid=' + uid, e);
            }
        }
    }
};

})();
