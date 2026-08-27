/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
// schedule-poll.js — "Propor datas" (agendamento POR JOGO) — Frente F (v3.1.46)
// ⚠️ O botão se chamava "Combinar jogos" até a 2.0.75; o dono renomeou pra "Propor
// datas" porque o que ele faz é PROPOR data/hora — e porque agora há três origens pra
// uma data (estimativa do sistema, organizador, consenso), não só o "combinar" entre
// jogadores. Nomes internos (_sch*, m.schedule) ficaram como estão de propósito.
//
// Deixa os JOGADORES de cada confronto da RODADA ATUAL combinarem quando jogar,
// dentro da janela da rodada, e ao haver consenso AGENDAR o jogo (grava data/hora
// no próprio match). Usado em torneios sem data/hora fixa por jogo (ex.: Confra
// fase 1 = 1 rodada Liga até o próximo sorteio; fase 2 = eliminatória multi-dia).
//
// ── DECISÕES DO DONO (que moldam o design) ───────────────────────────────────
//  1. ESCOPO = POR JOGO: cada confronto; os 2 jogadores (4 nas duplas) combinam.
//  2. Janela em fase de ELIMINAÇÃO = endDate da fase/torneio, dividida pelo nº de
//     rodadas restantes; em LIGA = próximo sorteio devido (_nextOwedDrawMs).
//  3. CONSENSO + OK FINAL: cada jogador marca disponibilidade; ao convergir, cada
//     um dá um OK final na opção escolhida; quando TODOS confirmam a MESMA opção →
//     agenda (m.scheduledAt), aparece chip no card e a UI de combinar colapsa.
//
// ── MODELO DE DADOS (no MATCH, sem container em opinionPolls) ─────────────────
//  m.schedule = {
//    enabledAt,                          // ISO, set no 1º write (auditoria)
//    options: [
//      { id, kind:'date',   dateISO:'2026-07-02', time:'17:00', byUid },
//      { id, kind:'weekly', weekdays:[2,4], time:'17:00', byUid }  // 0=Dom..6=Sáb
//    ],
//    votes:    { [uid]: { [optId]: 1 | -1 } },           // posso (1) / não posso (-1)
//    dayVotes: { [uid]: { [optId]: { [wd]: 1 | -1 } } }, // voto POR DIA (opções weekly)
//    scheduledOptId, scheduledWd
//  }
//  Consenso: opção 'date' com TODOS = 1 agenda; opção 'weekly' agenda no 1º dia em
//  que TODOS votaram 1 (ocorrência mais próxima). Legado avail/confirms migra p/ votes.
//  m.scheduledAt = ISO   // espelho TOP-LEVEL — dirige o chip + estado colapsado
//  m.scheduledBy = uid
//
// Rules: matches/rounds/groups/rodadas já estão na allowlist isParticipantBracketDiff
// → SEM mudança de firestore.rules. Mesmo padrão save→confirma-ou-reverte de _opVote.
//
// Módulo NOVO (window._sch*), espelha o ESTILO de opinion-poll.js sem tocá-lo.
(function () {
  'use strict';
  var WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var DAY = 86400000;
  var _schEdit = null; // { matchId, optId } — opção em edição inline

  function _esc(s) { return (window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s)); }
  function _attr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function _cu() { return window.AppStore && window.AppStore.currentUser; }
  function _rand() { return Math.floor(Math.random() * 1e6); }
  function _findT(tId) {
    if (typeof window._findTournamentById === 'function') return window._findTournamentById(tId);
    return window.AppStore && (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); });
  }
  // Promise do save — NUNCA engolir rejeição (classe do bug Confra).
  function _save(t) {
    try {
      if (window.FirestoreDB && window.FirestoreDB.saveTournament) return Promise.resolve(window.FirestoreDB.saveTournament(t));
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('FirestoreDB indisponível'));
  }
  function _isOrg(t) { return !!(window.AppStore && ((window.AppStore.isOrganizer && window.AppStore.isOrganizer(t)) || (window.AppStore.isCreator && window.AppStore.isCreator(t)))); }

  // ─── datas / formatação (BRT) ────────────────────────────────────────────────
  function _brtYmd(ms) {
    try { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
    catch (e) { return new Date(ms).toISOString().slice(0, 10); }
  }
  function _fmtDateTime(iso) {
    try {
      var d = new Date(iso); if (isNaN(d.getTime())) return String(iso || '');
      var dd = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
      var hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      return dd + ' às ' + hh;
    } catch (e) { return String(iso || ''); }
  }
  function _optLabel(o) {
    if (!o) return '';
    if (o.kind === 'date' && o.dateISO) {
      var p = String(o.dateISO).split('-');
      var dm = (p.length === 3) ? (p[2] + '/' + p[1]) : o.dateISO;
      return dm + (o.time ? ' às ' + o.time : '');
    }
    var days = (o.weekdays || []).slice().sort(function (a, b) { return a - b; }).map(function (w) { return WD[w] || '?'; }).join('+');
    return days + (o.time ? ' ' + o.time : '');
  }

  // ─── janela da rodada atual ───────────────────────────────────────────────────
  // Liga: até o próximo sorteio devido. Elim/Grupos/Monarch: divide [agora→endDate]
  // pelo nº de rodadas restantes.
  window._schWindow = function (t) {
    var now = Date.now();
    var endMs = null;
    try {
      var isLiga = t && (t.format === 'Liga' || t.format === 'Ranking');
      if (isLiga && typeof window._nextOwedDrawMs === 'function') {
        endMs = window._nextOwedDrawMs(t, now);
      }
      if (endMs == null) {
        // endDate da fase atual (multi-fase) ou do torneio
        var cur = (t && t.currentPhaseIndex) || 0;
        var pcfg = (t && Array.isArray(t.phases) && t.phases[cur]) || {};
        var endStr = pcfg.endDate || (t && t.endDate) || '';
        var endTime = pcfg.endTime || (t && t.endTime) || '23:59';
        var phaseEndMs = null;
        if (endStr) {
          var s = String(endStr); if (s.indexOf('T') !== -1) s = s.split('T')[0];
          var pe = new Date(s + 'T' + endTime + ':00-03:00').getTime();
          if (!isNaN(pe)) phaseEndMs = pe;
        }
        if (phaseEndMs != null && phaseEndMs > now) {
          // divide pelos rounds restantes (cross-formato via o adapter canônico)
          var remaining = 1;
          try {
            var ur = (typeof window._getUnifiedRounds === 'function') ? window._getUnifiedRounds(t) : { columns: [] };
            var cols = (ur && ur.columns) || [];
            var done = cols.filter(function (c) { return c && c.status === 'done'; }).length;
            remaining = Math.max(1, cols.length - done);
          } catch (e2) { remaining = 1; }
          var band = (phaseEndMs - now) / remaining;
          endMs = Math.min(phaseEndMs, now + band);
        } else if (phaseEndMs != null) {
          endMs = phaseEndMs; // já passou — deixa o usuário ver, mas no passado
        }
      }
    } catch (e) { endMs = null; }
    if (endMs == null || isNaN(endMs)) endMs = now + 14 * DAY; // fallback 14 dias
    var startMs = now;
    if (t && t.lastAutoDrawAt) { var la = new Date(t.lastAutoDrawAt).getTime(); if (!isNaN(la) && la < now) startMs = la; }
    return { startMs: startMs, endMs: Math.max(endMs, now + 60000) };
  };

  // ─── rodada atual (cross-formato) ──────────────────────────────────────────────
  function _filterPlayable(matches) {
    return (matches || []).filter(function (m) {
      if (!m) return false;
      if (m.isBye || m.isSitOut) return false;
      var a = m.p1, b = m.p2;
      if (a === 'BYE' || b === 'BYE' || a === 'TBD' || b === 'TBD') return false;
      if (!a || !b) return false;
      return true;
    });
  }
  window._schCurrentRoundMatches = function (t) {
    var empty = { round: null, matches: [], col: null };
    if (!t) return empty;
    var ur = (typeof window._getUnifiedRounds === 'function') ? window._getUnifiedRounds(t) : null;
    var cols = (ur && ur.columns) || [];
    if (!cols.length) return empty;
    var col = null;
    for (var i = cols.length - 1; i >= 0; i--) { if (cols[i] && cols[i].status !== 'done') { col = cols[i]; break; } }
    if (!col) col = cols[cols.length - 1];
    return { round: col.round, matches: _filterPlayable(col.matches), col: col };
  };

  // memo leve: o chip é chamado por CADA card; evita rodar o adapter N vezes/render.
  var _crCache = null;
  function _currentRoundIdSet(t) {
    var now = Date.now();
    if (_crCache && _crCache.tid === String(t.id) && (now - _crCache.at) < 1500) return _crCache.ids;
    var ids = {};
    try { window._schCurrentRoundMatches(t).matches.forEach(function (m) { if (m && m.id != null) ids[m.id] = 1; }); } catch (e) {}
    _crCache = { tid: String(t.id), ids: ids, at: now };
    return ids;
  }
  function _schIsCurrentRoundMatch(t, m) { return !!(m && m.id != null && _currentRoundIdSet(t)[m.id]); }
  // Exposto pro wa-group.js (botão "💬 Criar grupo", irmão do "📅 Propor datas"
  // no mesmo rodapé do card). O gate de quem vê os dois TEM que ser o mesmo —
  // fonte única aqui, nunca reimplementado lá.
  window._schIsCurrentRoundMatch = _schIsCurrentRoundMatch;

  // ─── uids dos jogadores do match (singles + duplas + monarch) ──────────────────
  // IDENTIDADE = uid DO SLOT, nunca o nome. Isto já foi "procurar em t.participants
  // quem se chama assim" e era um BUG SILENCIOSO E TOTAL: o save do torneio passa
  // por `identity-core._stripUidEntryNames`, que REMOVE o nome de toda entrada cujo
  // uid resolve — então em torneio real NENHUM nome resolve e a função devolvia []
  // pra todo jogo. Medido no Confra (03/ago/2026): 111 entradas, 111 com uid, ZERO
  // com nome → 81 jogos com uids=[] . Consequências que isso causou de verdade:
  //   · _schGroupMatches viu os 27 grupos com a MESMA chave (vazia) e tratou os 81
  //     jogos como irmãos → o link do grupo de WhatsApp da Raquel foi espelhado no
  //     torneio inteiro (a Catia clicava em "Abrir grupo" e caía no grupo dela);
  //   · _schTrySchedule exige uids.length >= 2 → o consenso da enquete NUNCA fechava;
  //   · _notifyOthers/_schNotifyScheduled não avisavam ninguém.
  // O dado certo sempre esteve gravado: team1Uids/team2Uids (81 de 81 no Confra).
  // Ver [[project_uid_identity_canon_locked]] e [[project_match_slot_uid_identity]].
  function _schMatchUids(t, m) {
    if (!t || !m) return [];
    var out = {};
    var slot = (typeof window._slotUids === 'function') ? window._slotUids : null;
    if (slot) {
      slot(m, 'p1').forEach(function (u) { if (u) out[u] = 1; });
      slot(m, 'p2').forEach(function (u) { if (u) out[u] = 1; });
    }
    if (Object.keys(out).length) return Object.keys(out);
    // Fallback por NOME — só pra doc legado que ainda guarda nome na entrada (o
    // strip é do save; docs anteriores a ele existem). Jogador fictício não tem uid
    // e continua fora, que é o certo: quem não tem conta não é notificado nem vira
    // chave de grupo.
    var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    var allUids = (typeof window._participantUids === 'function') ? window._participantUids : function (p) { return p && p.uid ? [p.uid] : []; };
    function addByName(nm) {
      if (!nm || nm === 'TBD' || nm === 'BYE') return;
      var pp = parts.find(function (p) { return typeof p === 'object' && (p.displayName || p.name || '') === nm; });
      if (pp) allUids(pp).forEach(function (u) { if (u) out[u] = 1; });
    }
    if (m.isMonarch) {
      (Array.isArray(m.team1) ? m.team1 : []).forEach(addByName);
      (Array.isArray(m.team2) ? m.team2 : []).forEach(addByName);
    } else { addByName(m.p1); addByName(m.p2); }
    return Object.keys(out);
  }
  function _schUserIsPlayer(t, m, user) {
    if (!user) return false;
    if (typeof window._userTeamInMatch === 'function' && window._userTeamInMatch(t, m, user) > 0) return true;
    return !!(user.uid && _schMatchUids(t, m).indexOf(user.uid) !== -1);
  }
  // Exposto pro wa-group.js — ver nota em _schIsCurrentRoundMatch.
  window._schMatchUids = _schMatchUids;
  window._schUserIsPlayer = _schUserIsPlayer;

  // ─── PORTA ÚNICA: quem pode MEXER na agenda de um jogo (2.1.7) ────────────────
  // Ordem do dono (25/ago/2026): _"o botão de propor agenda deve aparecer em cada grupo
  // para os membros do grupo apenas e para os organizadores (o botão de todos os grupos)…
  // a ideia é o organizador poder colocar a data pelos participantes"_.
  //
  // ⚠️ ESTA FUNÇÃO EXISTE PORQUE A REGRA JÁ TINHA SIDO REIMPLEMENTADA — e as duas
  // cópias divergiram em silêncio. O comentário logo acima de _schIsCurrentRoundMatch
  // manda o contrário: _"o gate de quem vê os dois TEM que ser o mesmo — fonte única
  // aqui, nunca reimplementado lá"_. Mesmo assim, quando o dono pediu o chip do
  // WhatsApp pro organizador (2.0.57/2.0.60), a exceção nasceu SÓ do lado do
  // wa-group.js (`_podeGerirJogo` + o furo do gate de rodada), e o irmão "Propor
  // datas" ficou com o gate de jogador intacto. Resultado medido no Confra: dos 35
  // grupos, o dono joga em 1 — e esse 1 já estava todo decidido. Ou seja, NÃO EXISTIA
  // grupo nenhum onde o botão aparecesse pra ele. Agora os dois entram por aqui.
  //
  // ⛔ CO-ORGANIZADOR TEM O MESMO PODER DO ORGANIZADOR — por isso `_isUserOrgOrCoHost`
  // (creatorUid OU coHosts ativo, só por uid), nunca uma comparação com `creatorUid`.
  // Ver [[project_cohost_same_power_as_organizer]].
  function _schEhAdmin(t, user) {
    return !!(user && user.uid && typeof window._isUserOrgOrCoHost === 'function' &&
              window._isUserOrgOrCoHost(t, user));
  }
  // Quem pode PROPOR/DEFINIR a data: quem joga o confronto, ou quem organiza o torneio.
  function _schPodeGerirJogo(t, m, user) {
    if (!user || !user.uid) return false;
    return !!(_schUserIsPlayer(t, m, user) || _schEhAdmin(t, user));
  }
  window._schEhAdmin = _schEhAdmin;
  window._schPodeGerirJogo = _schPodeGerirJogo;

  function _schFindMatch(t, matchId) {
    var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
    return (all || []).find(function (m) { return m && String(m.id) === String(matchId); }) || null;
  }
  window._schFindMatch = _schFindMatch;
  function _ensureSchedule(m) {
    if (!m.schedule || typeof m.schedule !== 'object') m.schedule = { options: [], votes: {}, dayVotes: {} };
    var s = m.schedule;
    if (!Array.isArray(s.options)) s.options = [];
    if (!s.votes || typeof s.votes !== 'object') s.votes = {};
    if (!s.dayVotes || typeof s.dayVotes !== 'object') s.dayVotes = {};
    // migração legado: avail (posso) → votes ; confirms vira voto posso na opção
    if (s.avail && typeof s.avail === 'object') {
      Object.keys(s.avail).forEach(function (u) { (s.avail[u] || []).forEach(function (oid) { (s.votes[u] = s.votes[u] || {})[oid] = 1; }); });
      delete s.avail;
    }
    if (s.confirms && typeof s.confirms === 'object') {
      Object.keys(s.confirms).forEach(function (u) { var oid = s.confirms[u]; if (oid) (s.votes[u] = s.votes[u] || {})[oid] = 1; });
      delete s.confirms;
    }
    if (!s.enabledAt) s.enabledAt = new Date().toISOString();
    return s;
  }

  // Resolve a opção escolhida → ISO concreto pra m.scheduledAt.
  function _schResolveISO(opt, t) {
    if (!opt) return '';
    if (opt.kind === 'date' && opt.dateISO) {
      var d = new Date(opt.dateISO + 'T' + (opt.time || '12:00') + ':00-03:00');
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    // weekly → próxima ocorrência do menor weekday dentro da janela (descritor
    // recorrente fica na option só pra exibição).
    var win = window._schWindow(t);
    var wds = (opt.weekdays || []).slice().sort(function (a, b) { return a - b; });
    if (!wds.length) return '';
    var tp = String(opt.time || '12:00').split(':');
    var hh = ('0' + (parseInt(tp[0], 10) || 0)).slice(-2), mm = ('0' + (parseInt(tp[1], 10) || 0)).slice(-2);
    for (var i = 0; i < 28; i++) {
      var ms = win.startMs + i * DAY;
      var ymd = _brtYmd(ms);
      var wd = new Date(ymd + 'T12:00:00-03:00').getDay(); // weekday em BRT
      if (wds.indexOf(wd) !== -1) {
        var d2 = new Date(ymd + 'T' + hh + ':' + mm + ':00-03:00');
        if (!isNaN(d2.getTime()) && d2.getTime() >= win.startMs) return d2.toISOString();
      }
    }
    return '';
  }

  // Resolve a próxima ocorrência de um weekday específico (BRT) dentro da janela.
  function _schResolveDayISO(time, wd, t) {
    var win = window._schWindow(t);
    var tp = String(time || '12:00').split(':');
    var hh = ('0' + (parseInt(tp[0], 10) || 0)).slice(-2), mm = ('0' + (parseInt(tp[1], 10) || 0)).slice(-2);
    for (var i = 0; i < 28; i++) {
      var ymd = _brtYmd(win.startMs + i * DAY);
      var d = new Date(ymd + 'T12:00:00-03:00').getDay();
      if (d === wd) {
        var d2 = new Date(ymd + 'T' + hh + ':' + mm + ':00-03:00');
        if (!isNaN(d2.getTime()) && d2.getTime() >= win.startMs) return d2.toISOString();
      }
    }
    return '';
  }

  // Consenso: TODOS os uids votaram "posso" (1) na MESMA opção (ou no MESMO dia, p/
  // weekly) → agenda na ocorrência mais próxima. Roda DENTRO do voto, ANTES do save
  // → escrita atômica. Retorna true se fechou agora.
  function _schTrySchedule(t, m) {
    var uids = _schMatchUids(t, m);
    if (uids.length < 2) return false;
    var s = m.schedule || {}; var votes = s.votes || {}, dayVotes = s.dayVotes || {};
    var opts = s.options || [];
    for (var k = 0; k < opts.length; k++) {
      var o = opts[k];
      if (o.kind === 'date') {
        if (uids.every(function (u) { return (votes[u] || {})[o.id] === 1; })) {
          var iso = _schResolveISO(o, t);
          if (iso) { s.scheduledOptId = o.id; s.scheduledWd = null; m.scheduledAt = iso; m.scheduledBy = (_cu() || {}).uid || ''; m.scheduledKind = 'consensus'; _schMirrorToGroup(t, m); return true; }
        }
      } else {
        var wds = (o.weekdays || []).slice().sort(function (a, b) { return a - b; });
        var best = null, bestWd = null;
        wds.forEach(function (wd) {
          if (!uids.every(function (u) { return (((dayVotes[u] || {})[o.id]) || {})[wd] === 1; })) return;
          var di = _schResolveDayISO(o.time, wd, t);
          if (di && (!best || di < best)) { best = di; bestWd = wd; }
        });
        if (best) { s.scheduledOptId = o.id; s.scheduledWd = bestWd; m.scheduledAt = best; m.scheduledBy = (_cu() || {}).uid || ''; m.scheduledKind = 'consensus'; _schMirrorToGroup(t, m); return true; }
      }
    }
    return false;
  }
  // Rei/Rainha: ao combinar (ou desfazer) o m0, espelha o scheduledAt nos outros
  // jogos do grupo — os 3 jogos acontecem na mesma data. No-op fora de modo grupo.
  function _schMirrorToGroup(t, m0) {
    if (!_schGroupMode || String(m0.id) !== _schGroupMode) return;
    _schGroupMatches(t, m0).forEach(function (sm) {
      if (sm && sm !== m0) { sm.scheduledAt = m0.scheduledAt; sm.scheduledBy = m0.scheduledBy; sm.scheduledKind = m0.scheduledKind; }
    });
  }

  // ─── notificações (level fundamental) ──────────────────────────────────────────
  function _schKickoffData(t, m) {
    return {
      type: 'schedule', tournamentId: String(t.id), tournamentName: t.name || '', matchId: m.id,
      title: '📅 Combine seu jogo',
      message: 'Combine com o adversário quando jogar "' + (m.p1 || '') + ' vs ' + (m.p2 || '') + '" em "' + (t.name || '') + '".',
      level: 'fundamental', timestamp: Date.now()
    };
  }
  function _schScheduledData(t, m) {
    return {
      type: 'schedule', tournamentId: String(t.id), tournamentName: t.name || '', matchId: m.id,
      title: '📅 Jogo combinado',
      message: 'Seu jogo "' + (m.p1 || '') + ' vs ' + (m.p2 || '') + '" foi combinado para ' + _fmtDateTime(m.scheduledAt) + '.',
      level: 'fundamental', timestamp: Date.now()
    };
  }
  function _schNotifyScheduled(t, m) {
    if (typeof window._sendUserNotification !== 'function') return;
    var data = _schScheduledData(t, m);
    var uids = _schMatchUids(t, m);
    uids.forEach(function (u) { window._sendUserNotification(u, data); });
    if (t.creatorUid && uids.indexOf(t.creatorUid) === -1) window._sendUserNotification(t.creatorUid, data);
  }

  // ─── overlay (helpers) ─────────────────────────────────────────────────────────
  function _overlay(id, innerHtml) {
    var ex = document.getElementById(id); if (ex) ex.remove();
    var o = document.createElement('div');
    o.id = id;
    o.style.cssText = 'position:fixed;inset:0;z-index:100040;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';
    o.innerHTML = '<div style="background:var(--bg-card,#0f172a);width:96%;max-width:460px;max-height:90%;overflow:auto;border-radius:16px;border:1px solid rgba(16,185,129,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);">' + innerHtml + '</div>';
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }
  function _close(id) { var o = document.getElementById(id); if (o) o.remove(); }
  window._schCloseOverlay = function () { _close('sch-overlay'); _close('sch-org-overlay'); };

  // ═══ GRADE ESTIMADA — o sistema calcula a data/hora dos jogos (2.0.75) ════════
  // Pedido do dono (25/ago/2026): _"em torneios de 1/3 dias as datas horas sao
  // calculadas e sugeridas pelo sistema como estimadas"_ — e, na decisão dele, ela
  // GRAVA (m.scheduledAt) já no sorteio. Gravar é o que faz a data aparecer em TODO
  // lugar que já mostra data, inclusive nas "📣 Novidades no seu torneio" da
  // dashboard, sem inventar caminho de render nenhum.
  //
  // O que separa uma data ESTIMADA de uma COMBINADA é `m.scheduledKind`:
  //     'estimate'  → conta do sistema        (rótulo "estimada", âmbar)
  //     'organizer' → o organizador apontou   (verde — manda em tudo)
  //     'consensus' → os jogadores fecharam   (verde — como sempre foi)
  // ⛔ INVARIANTE: só 'estimate' pode ser sobrescrita por um novo cálculo. Data que
  // gente combinou NUNCA é pisada pelo sistema. É essa linha que deixa o recálculo
  // ser seguro de rodar quantas vezes for.
  //
  // POR QUE SÓ ATÉ 3 DIAS: num torneio de fim de semana a grade é do organizador —
  // todo mundo está no local e joga quando chamam. Acima disso (Confra, ligas de
  // meses) quem decide são os jogadores, e é pra isso que a enquete existe; carimbar
  // uma data de sistema ali seria afirmar horário que ninguém marcou.
  var _MIN = 60000;

  // 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:MM' — o form grava as duas formas (create-tournament
  // monta `startDateStr + 'T' + startTimeStr` só quando há hora).
  function _dtParts(s, hmPadrao) {
    var str = String(s || ''), ymd = str.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    var hm = (str.charAt(10) === 'T' && /^\d{2}:\d{2}/.test(str.slice(11, 16))) ? str.slice(11, 16) : hmPadrao;
    return { ymd: ymd, hm: hm };
  }
  // Offset BRT na mão, igual ao resto do módulo (_optIso, _schWindow): o app inteiro
  // ancora horário em America/Sao_Paulo, e o Brasil não tem horário de verão desde 2019.
  function _ms(ymd, hm) { return new Date(ymd + 'T' + hm + ':00-03:00').getTime(); }
  function _addDias(ymd, n) {
    var d = new Date(ymd + 'T12:00:00-03:00');
    d.setUTCDate(d.getUTCDate() + n);
    return _brtYmd(d.getTime());
  }

  // Os DIAS do torneio, com a janela de cada um. Dia 1 começa na hora do startDate;
  // os seguintes na MESMA hora do dia. O último termina na hora do endDate.
  window._schJanelaTorneio = function (t) {
    t = t || {};
    var ini = _dtParts(t.startDate, '09:00');
    if (!ini) return null;
    var fim = _dtParts(t.endDate, '22:00');
    if (!fim || fim.ymd < ini.ymd) fim = { ymd: ini.ymd, hm: (t.endDate ? '22:00' : '22:00') };
    var dias = [], ymd = ini.ymd, guarda = 0;
    while (guarda++ < 8) {
      var ehUltimo = (ymd === fim.ymd);
      var iniMs = _ms(ymd, ini.hm);
      var fimMs = _ms(ymd, ehUltimo ? fim.hm : '22:00');
      // Janela invertida/vazia (ex.: começa 09:00 e "termina" 08:00 no mesmo dia):
      // não dá pra jogar em tempo negativo. Abre 12h a partir do início.
      if (fimMs <= iniMs) fimMs = iniMs + 12 * 60 * _MIN;
      dias.push({ ymd: ymd, iniMs: iniMs, fimMs: fimMs });
      if (ehUltimo) break;
      ymd = _addDias(ymd, 1);
    }
    return { dias: dias, iniHm: ini.hm, fimHm: fim.hm };
  };

  // Plano PURO: devolve { slots: [{matchId, ms, iso, dia, onda}], slotMin, quadras,
  // dias, cabe } sem tocar em nada. Testável sem DOM e sem Firebase.
  //
  // A regra de paralelismo tem DUAS metades e as duas importam:
  //   1. jogos da MESMA rodada podem ser simultâneos — um por quadra;
  //   2. …MENOS quando dividem jogador. Rei/Rainha é exatamente esse caso: os 3 jogos
  //      de um grupo são os MESMOS 4 uids, e ninguém joga em duas quadras ao mesmo
  //      tempo. Sem esta metade, um grupo do Confra "aconteceria" todo às 09:00.
  window._schGradeEstimada = function (t) {
    try {
      t = t || {};
      var jan = window._schJanelaTorneio(t);
      if (!jan || !jan.dias.length || jan.dias.length > 3) return null;
      var quadras = Math.max(1, parseInt(t.courtCount, 10) || (Array.isArray(t.courtNames) ? t.courtNames.length : 0) || 1);
      var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
      var jogos = (all || []).filter(function (m) {
        return m && !m.isBye && !m.isSitOut && !m.winner;
      });
      if (!jogos.length) return null;

      // agrupa por (fase, rodada) preservando a ordem em que apareceram
      var chaves = [], porChave = {};
      jogos.forEach(function (m) {
        var f = (m.phaseIndex != null) ? m.phaseIndex : (t.currentPhaseIndex || 0);
        var r = (m.round == null) ? 0 : m.round;
        var k = f + '|' + r;
        if (!porChave[k]) { porChave[k] = { fase: f, rodada: r, ms: [] }; chaves.push(k); }
        porChave[k].ms.push(m);
      });
      chaves.sort(function (a, b) {
        var A = porChave[a], B = porChave[b];
        return (A.fase - B.fase) || (A.rodada - B.rodada);
      });

      var slots = [], diaIdx = 0, cursor = jan.dias[0].iniMs, onda = 0, estourou = false;
      chaves.forEach(function (k) {
        var bloco = porChave[k];
        var slotMin = window._minutosDaPartida(t, window._faseDoTorneio(t, bloco.fase)) || 30;
        // monta as ONDAS desta rodada: guloso, primeira onda que tem quadra livre E
        // nenhum jogador em comum.
        var ondas = [];
        bloco.ms.forEach(function (m) {
          var uids = _schMatchUids(t, m);
          var alvo = null;
          for (var i = 0; i < ondas.length; i++) {
            var o = ondas[i];
            if (o.jogos.length >= quadras) continue;
            var conflita = uids.some(function (u) { return o.uids[u]; });
            if (!conflita) { alvo = o; break; }
          }
          if (!alvo) { alvo = { jogos: [], uids: {} }; ondas.push(alvo); }
          alvo.jogos.push(m);
          uids.forEach(function (u) { alvo.uids[u] = 1; });
        });
        ondas.forEach(function (o) {
          // cabe no dia corrente? senão pula pro próximo (se houver)
          if (cursor + slotMin * _MIN > jan.dias[diaIdx].fimMs) {
            if (diaIdx + 1 < jan.dias.length) { diaIdx++; cursor = jan.dias[diaIdx].iniMs; }
            else { estourou = true; } // sem dia sobrando: segue em frente no último e AVISA
          }
          o.jogos.forEach(function (m) {
            slots.push({ matchId: String(m.id), ms: cursor, iso: new Date(cursor).toISOString(), dia: diaIdx, onda: onda });
          });
          cursor += slotMin * _MIN;
          onda++;
        });
      });
      return {
        slots: slots, quadras: quadras, dias: jan.dias.length,
        cabe: !estourou, fimMs: cursor,
        // slotMin da 1ª fase — só informativo (cada fase tem o seu, ver o loop acima)
        slotMin: window._minutosDaPartida(t, window._faseDoTorneio(t, (jogos[0] && jogos[0].phaseIndex) || 0)) || 30
      };
    } catch (e) { return null; }
  };

  // GRAVA o plano nos jogos. Devolve quantos carimbou. Nunca toca em data combinada
  // por gente (kind 'organizer'/'consensus') — a invariante do topo desta seção.
  // Jogo legado com scheduledAt e SEM kind é tratado como combinado: veio de antes
  // desta régua existir, e o único jeito de ter data lá era alguém ter combinado.
  window._schAplicarGrade = function (t) {
    var plano = window._schGradeEstimada(t);
    if (!plano || !plano.slots.length) return 0;
    var n = 0;
    plano.slots.forEach(function (s) {
      var m = _schFindMatch(t, s.matchId);
      if (!m) return;
      if (m.scheduledAt && m.scheduledKind !== 'estimate') return; // combinado manda
      if (m.scheduledAt === s.iso && m.scheduledKind === 'estimate') return; // já está lá
      m.scheduledAt = s.iso;
      m.scheduledBy = '';
      m.scheduledKind = 'estimate';
      n++;
    });
    return n;
  };

  // ─── chip / botão no card ──────────────────────────────────────────────────────
  // Pílula da data já definida. Verde = gente marcou (organizador ou consenso);
  // âmbar com "≈" = conta do sistema (grade estimada). Cor NUNCA é o único sinal —
  // o "≈" e o title dizem a mesma coisa em texto, pra quem não distingue as duas.
  function _chipData(iso, kind) {
    var est = (kind === 'estimate');
    var cor = est ? '245,158,11' : '16,185,129';
    var txt = est ? '#fbbf24' : '#34d399';
    var tit = est ? 'Horário estimado pelo sistema — muda quando o organizador aponta ou os jogadores combinam' : 'Horário definido';
    return '<span title="' + tit + '" style="display:inline-flex;align-items:center;gap:5px;background:rgba(' + cor + ',0.14);border:1px solid rgba(' + cor + ',0.45);color:' + window._spCor(txt, 'color') + ';font-weight:800;font-size:0.78rem;border-radius:999px;padding:5px 12px;">📅 ' + (est ? '≈ ' : '') + _esc(_fmtDateTime(iso)) + '</span>';
  }
  window._schChipData = _chipData;

  window._schCardChip = function (t, m) {
    try {
      if (!t || !m) return '';
      // v1.2.2: retorna elemento PURO (sem wrapper próprio), igual ao _schGroupChip.
      // Quem centraliza é o rodapé do card (_cardFooterChips em bracket.js), que agora
      // divide a linha com o "💬 Criar grupo" (wa-group.js). Único call site.
      // ⚠️ v2.0.75 · A DATA VEM ANTES DE QUALQUER SUPRESSÃO — inclusive a do Rei/Rainha.
      // O `if (m.isMonarch) return ''` era a PRIMEIRA linha desta função, e o efeito
      // colateral é que um jogo de grupo nunca mostrava a data fora da tela da chave:
      // quem a mostrava era o botão do GRUPO (_schGroupChip), que mora no cabeçalho do
      // grupo — e as "📣 Novidades no seu torneio" da dashboard renderizam o CARD
      // (renderMatchCard), não o cabeçalho. Pedido do dono: a data aparece no botão
      // _inclusive nas novidades_. A supressão do monarch continua valendo pra AÇÃO
      // (propor é único por grupo); ela só não vale mais pra INFORMAÇÃO.
      if (m.scheduledAt) return _chipData(m.scheduledAt, m.scheduledKind);
      if (m.isMonarch) return '';
      if (m.winner || m.isBye || m.isSitOut) return '';
      if (!m.p1 || !m.p2 || m.p1 === 'BYE' || m.p2 === 'BYE' || m.p1 === 'TBD' || m.p2 === 'TBD') return '';
      var cu = _cu(); if (!cu || !cu.uid) return '';
      // 2.1.7: PORTA ÚNICA — jogador do confronto OU organizador/co-host.
      if (!_schPodeGerirJogo(t, m, cu)) return '';
      // O organizador FURA o gate de rodada (espelha wa-group.js): é ele quem monta a
      // grade ANTES de a rodada abrir. Pro jogador o gate segue valendo — não há o que
      // combinar num jogo que ainda nem é a vez.
      if (!_schEhAdmin(t, cu) && !_schIsCurrentRoundMatch(t, m)) return '';
      var n = (m.schedule && Array.isArray(m.schedule.options)) ? m.schedule.options.length : 0;
      // v4.1.25: volume + altura PADRÃO (mesmas classes dos botões do header do card):
      // .btn dá o volume almofadado, .btn-shine o brilho, .btn-micro a altura padrão.
      return '<button class="btn btn-micro btn-shine hover-lift" onclick="event.stopPropagation(); window._schOpenMatch(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" ' +
        'style="background:#3b82f6;color:#fff;font-size:0.72rem;font-weight:800;">' +
        '📅 Propor datas' + (n ? ' <span style="background:var(--sp-g-255-255-255-025,rgba(255,255,255,0.25));border-radius:999px;padding:1px 7px;font-size:0.72rem;">' + n + '</span>' : '') +
        '</button>';
    } catch (e) { return ''; }
  };

  // ─── grupo Rei/Rainha: 1 enquete pros 3 jogos (mesmos 4 jogadores) ──────────────
  // O portador do schedule é o 1º match jogável do grupo (m0). Os 3 jogos
  // compartilham os MESMOS 4 uids → m0 já resolve o grupo todo. Ao combinar,
  // espelha scheduledAt nos 3 jogos (consumidores downstream leem por match).
  var _schGroupMode = null; // = id do m0 quando o overlay está em modo grupo

  // Índice do grupo — MESMA leitura do phases-engine (groupIdx, com monarchGroup
  // como o nome histórico do bracket-logic). É o que o motor GRAVA no jogo.
  function _schGroupIdx(m) {
    if (!m) return null;
    if (m.groupIdx != null) return m.groupIdx;
    if (m.monarchGroup != null) return m.monarchGroup;
    return null;
  }

  // Quem são os IRMÃOS de grupo do m0 (os outros jogos das mesmas 4 pessoas).
  //
  // A resposta vem da ÂNCORA ESTRUTURAL que o motor grava — fase + rodada + índice
  // do grupo — e NÃO de uma chave derivada dos jogadores. Derivar era o desenho
  // anterior e ele falhou catastroficamente: com o nome removido das entradas pelo
  // strip do save, a chave saía VAZIA pra todo mundo, os 27 grupos do Confra viraram
  // "um grupo só" e o link de WhatsApp de um grupo foi espelhado nos 81 jogos.
  // Chave derivada de dado que pode faltar não é identidade — o índice do grupo é.
  function _schGroupMatches(t, m0) {
    if (!m0) return [];
    var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
    all = all || [];
    var round = m0.round;
    var gi = _schGroupIdx(m0);
    var ph = (m0.phaseIndex != null) ? m0.phaseIndex : null;
    if (gi != null) {
      var sibs = all.filter(function (m) {
        if (!m || !m.isMonarch || m.round !== round) return false;
        if (_schGroupIdx(m) !== gi) return false;
        return ((m.phaseIndex != null) ? m.phaseIndex : null) === ph;
      });
      if (sibs.length) return _sane(sibs, m0);
    }
    // Legado sem índice de grupo no jogo: cai na chave de uids. Aqui a regra dura —
    // CHAVE VAZIA NUNCA AGRUPA. Sem saber quem joga, o grupo é só o próprio jogo;
    // é melhor perder o espelho (o outro card mostra "Criar grupo") do que espalhar
    // o link/horário de um grupo pelo torneio inteiro.
    var key = _schMatchUids(t, m0).slice().sort().join(',');
    if (!key) return [m0];
    var byKey = all.filter(function (m) {
      return m && m.isMonarch && m.round === round && _schMatchUids(t, m).slice().sort().join(',') === key;
    });
    return byKey.length ? _sane(byKey, m0) : [m0];
  }

  // TRAVA DE SANIDADE — última linha de defesa dos dois espelhos (link do WhatsApp
  // e horário combinado). `_buildMonarchGroup` é a FONTE ÚNICA que cria grupo
  // Rei/Rainha e ela sempre produz 4 jogadores → 3 jogos (AB×CD, AC×BD, AD×BC).
  // Um "grupo" com mais que isso é bug de agrupamento, não um grupo grande — e o
  // preço do bug é escrever o dado de um grupo em cima dos outros (foi o que
  // aconteceu no Confra: 81 jogos com o mesmo link). Na dúvida, não espalha.
  var MONARCH_GROUP_MAX = 3;
  function _sane(sibs, m0) {
    if (sibs.length <= MONARCH_GROUP_MAX) return sibs;
    try { console.error('[schedule-poll] agrupamento suspeito:', sibs.length, 'jogos pro grupo de', m0 && m0.id, '— espelho cancelado'); } catch (e) {}
    return [m0];
  }
  // Exposto pro wa-group.js — no Rei/Rainha o grupo do WhatsApp é ÚNICO por
  // grupo (3 jogos, mesmas 4 pessoas), então ele espelha pelos irmãos igual ao
  // _schMirrorToGroup faz com o scheduledAt.
  window._schGroupMatches = _schGroupMatches;
  function _schGroupFirst(groupMatches) {
    if (!Array.isArray(groupMatches) || !groupMatches.length) return null;
    return groupMatches.find(function (m) { return m && !m.isBye && !m.isSitOut; }) || groupMatches[0];
  }

  // chip ÚNICO do grupo (vai no cabeçalho do grupo, ao lado de "Faltou alguém?").
  window._schGroupChip = function (t, groupMatches) {
    try {
      if (!t || !Array.isArray(groupMatches) || !groupMatches.length) return '';
      var m0 = _schGroupFirst(groupMatches); if (!m0) return '';
      var _comData = m0.scheduledAt ? m0 : (groupMatches.find(function (m) { return m && m.scheduledAt; }) || null);
      var schedISO = _comData && _comData.scheduledAt;
      // ⚠️ v2.0.75 · A DATA vem ANTES do gate de "sou jogador deste grupo". O gate
      // continua valendo pra AÇÃO (só quem joga propõe), mas a data definida é
      // informação do torneio — quem olha o grupo de fora tem que ver quando ele joga.
      // Mesmo motivo do irmão _schCardChip: sem isto, a data sumia fora da chave.
      var open = 'event.stopPropagation(); window._schOpenGroup(\'' + _attr(t.id) + '\',\'' + _attr(m0.id) + '\')';
      if (schedISO) {
        var _est = (_comData.scheduledKind === 'estimate');
        var _c = _est ? '245,158,11' : '16,185,129', _tx = _est ? '#fbbf24' : '#34d399';
        return '<button type="button" class="btn btn-sm hover-lift" onclick="' + open + '" title="' + (_est ? 'Horário estimado pelo sistema' : 'Horário definido') + '" style="display:inline-flex;align-items:center;gap:5px;background:rgba(' + _c + ',0.14);border:1px solid rgba(' + _c + ',0.45);color:' + window._spCor(_tx, 'color') + ';font-weight:800;font-size:0.72rem;border-radius:8px;padding:4px 10px;">📅 ' + (_est ? '≈ ' : '') + _esc(_fmtDateTime(schedISO)) + '</button>';
      }
      var cu = _cu(); if (!cu || !cu.uid) return '';
      // 2.1.7: PORTA ÚNICA — membro do grupo OU organizador/co-host (que vê em TODOS os
      // grupos). Era aqui que o botão sumia: o gate só falava de jogador.
      if (!_schPodeGerirJogo(t, m0, cu)) return '';
      if (!_schEhAdmin(t, cu) && !_schIsCurrentRoundMatch(t, m0)) return '';
      // Grupo inteiro decidido = sem botão PRA NINGUÉM, inclusive o organizador. Não é o
      // bug: não há agenda a marcar pra jogo que já aconteceu. (Difere do WhatsApp de
      // propósito — o grupo sobrevive ao jogo, a agenda não.)
      if (groupMatches.every(function (m) { return m.winner || m.isBye || m.isSitOut; })) return '';
      var n = (m0.schedule && Array.isArray(m0.schedule.options)) ? m0.schedule.options.length : 0;
      // Azul via INLINE (não .btn-primary — responsive.css força .btn-primary a
      // width:100% no mobile, o que estourava o tamanho e jogava o botão pra outra linha).
      // v1.8.65 (print do dono): o badge de propostas era irmão SOLTO dentro do botão —
      // e .btn é inline-flex, então ele virava um item de flex ao LADO do texto,
      // alargando o botão e empurrando o "editar" do grupo de WhatsApp. Agora o
      // conteúdo é UMA pilha (coluna, alinhada à esquerda) e o badge mora na linha
      // de baixo, ao lado de "jogos" — a largura do botão é a de "📅 Combinar",
      // com ou sem badge.
      var _badge = n ? '<span style="background:var(--sp-g-255-255-255-025,rgba(255,255,255,0.25));border-radius:999px;padding:0 6px;font-size:0.66rem;">' + n + '</span>' : '';
      return '<button type="button" class="btn btn-micro btn-shine hover-lift" onclick="' + open + '" style="background:#3b82f6;color:#fff;font-size:0.72rem;font-weight:800;padding:4px 9px;line-height:1.05;text-align:left;">' +
        '<span style="display:flex;flex-direction:column;align-items:flex-start;gap:1px;">' +
          '<span>📅 Propor</span>' +
          '<span style="display:inline-flex;align-items:center;gap:5px;">datas' + _badge + '</span>' +
        '</span></button>';
    } catch (e) { return ''; }
  };

  window._schOpenGroup = function (tId, firstMatchId) {
    var t = _findT(tId); if (!t) return;
    var m0 = _schFindMatch(t, firstMatchId); if (!m0) return;
    _schGroupMode = String(m0.id);
    _renderMatch(t, m0);
  };

  // ─── overlay por jogo ──────────────────────────────────────────────────────────
  window._schOpenMatch = function (tId, matchId) {
    var t = _findT(tId); if (!t) return;
    var m = _schFindMatch(t, matchId); if (!m) return;
    _schGroupMode = null;
    _renderMatch(t, m);
  };

  function _userName(t, u) { return (typeof window._opVoterName === 'function') ? window._opVoterName(t, u) : 'Jogador'; }
  function _avatarImg(t, u, size) {
    var nm = _userName(t, u); var sz = size || 24;
    // ⭐ ponto único — `u` é o uid, então o ícone hidrata quando o perfil chegar
    return window._personAvatarHtml(u, nm,
      'width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;object-fit:cover;border:2px solid var(--bg-card);',
      ' title="' + _esc(nm) + '" alt="' + _esc(nm) + '"');
  }
  function _avatarsFor(t, uids) {
    if (!uids || !uids.length) return '';
    return uids.map(function (u) {
      var nm = _userName(t, u);
      return window._personAvatarHtml(u, nm,
        'width:24px;height:24px;border-radius:50%;object-fit:cover;border:2px solid var(--bg-card);margin-left:-6px;',
        ' title="' + _esc(nm) + '" alt="' + _esc(nm) + '"');
    }).join('');
  }

  // ── ORGANIZADOR APONTA A DATA DIRETO (2.0.75) ─────────────────────────────────
  // Decisão do dono: _"o organizador pode apontar direto a data/hora"_, e quando ele
  // aponta, VALE A DELE — a enquete daquele jogo fecha. Não é um atalho pro consenso;
  // é a autoridade de quem monta a grade (num torneio de 1 dia é ele quem sabe qual
  // quadra vaga às 14h). Ele desfaz e a enquete volta a valer — o caminho de volta é
  // o MESMO _schUnconfirm que os jogadores já usam, não um segundo jeito de desfazer.
  function _brtHm(ms) {
    try { return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }); }
    catch (e) { return '17:00'; }
  }
  // Rótulo da ORIGEM da data. Existe porque as três origens não valem a mesma coisa:
  // a estimada o sistema pode recalcular, as outras duas não.
  function _origemLabel(kind) {
    if (kind === 'estimate') return '≈ estimado pelo sistema';
    if (kind === 'organizer') return 'definido pelo organizador';
    return 'combinado pelos jogadores';
  }
  function _orgBloco(t, m) {
    var ms = m.scheduledAt ? new Date(m.scheduledAt).getTime() : NaN;
    var ymd = isNaN(ms) ? (_dtParts(t.startDate, '09:00') || {}).ymd || _brtYmd(Date.now()) : _brtYmd(ms);
    var hm = isNaN(ms) ? ((_dtParts(t.startDate, '09:00') || {}).hm || '09:00') : _brtHm(ms);
    return '<div style="margin-top:14px;background:rgba(59,130,246,0.10);border:1px solid rgba(59,130,246,0.35);border-radius:12px;padding:12px;">' +
      '<div style="font-size:0.78rem;font-weight:800;color:var(--sp-c-60a5fa,#60a5fa);margin-bottom:2px;">🛠️ Organizador</div>' +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:9px;">Apontar a data/hora aqui DEFINE o jogo na hora e encerra as propostas. Dá pra desfazer.</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:9px;">' +
        '<input type="date" id="sch-org-date" value="' + _esc(ymd) + '" style="flex:1;min-width:0;background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
        '<input type="time" id="sch-org-time" value="' + _esc(hm) + '" style="width:96px;flex-shrink:0;background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
      '</div>' +
      '<button type="button" onclick="window._schOrgDefinir(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" class="btn btn-shine" style="width:100%;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-weight:800;border:none;border-radius:10px;padding:10px;font-size:0.85rem;">📌 Definir data e hora</button>' +
    '</div>';
  }

  // Grava a data do organizador. `kind='organizer'` é o que faz a enquete colapsar
  // (o render já colapsa em cima de m.scheduledAt) e o que impede a grade estimada de
  // sobrescrever depois — ver a INVARIANTE na seção da grade.
  window._schOrgDefinir = function (tId, matchId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var m = _schFindMatch(t, matchId); if (!m) return;
    var d = document.getElementById('sch-org-date'), h = document.getElementById('sch-org-time');
    var ymd = d && d.value, hm = (h && h.value) || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) || !/^\d{2}:\d{2}$/.test(String(hm))) {
      if (typeof showNotification === 'function') showNotification('Data inválida', 'Escolha a data e a hora.', 'warning');
      return;
    }
    var ms = _ms(ymd, hm);
    if (isNaN(ms)) { if (typeof showNotification === 'function') showNotification('Data inválida', 'Não consegui ler essa data.', 'warning'); return; }
    var prev = { schedule: JSON.parse(JSON.stringify(m.schedule || {})), scheduledAt: m.scheduledAt, scheduledBy: m.scheduledBy, scheduledKind: m.scheduledKind };
    m.scheduledAt = new Date(ms).toISOString();
    m.scheduledBy = (_cu() || {}).uid || '';
    m.scheduledKind = 'organizer';
    _schMirrorToGroup(t, m);
    _saveSchedule(t, m, prev, true);
    window._schCloseOverlay();
    if (typeof showNotification === 'function') showNotification('📌 Definido', 'Jogo marcado pra ' + _fmtDateTime(m.scheduledAt) + '.', 'success');
  };

  function _renderMatch(t, m) {
    var cu = _cu();
    var uid = cu && cu.uid;
    var isPlayer = _schUserIsPlayer(t, m, cu);
    var isOrg = _isOrg(t);
    var win = window._schWindow(t);
    var allUids = _schMatchUids(t, m);
    var sched = m.scheduledAt ? (m.schedule || {}) : _ensureSchedule(m);
    // modo GRUPO Rei/Rainha: m é o m0 portador; mesmos 4 jogadores nos 3 jogos.
    var groupMode = !!(_schGroupMode && String(m.id) === _schGroupMode);
    var titleTxt = '📅 Propor datas';
    var header =
      '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#065f46,#047857);border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2;">' +
        '<button type="button" onclick="window._schCloseOverlay()" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:5px;background:var(--sp-g-255-255-255-015,rgba(255,255,255,0.15));color:#fff;border:1px solid var(--sp-b-255-255-255-025,rgba(255,255,255,0.25));font-weight:700;">‹ Voltar</button>' +
        '<span style="font-weight:800;color:#fff;font-size:0.92rem;">' + titleTxt + '</span>' +
        '<button type="button" onclick="window._schCloseOverlay()" class="btn btn-sm" style="background:rgba(16,185,129,0.9);color:#fff;border:1px solid var(--sp-b-255-255-255-035,rgba(255,255,255,0.35));font-weight:800;">Confirmar</button>' +
      '</div>';
    var matchLine;
    if (groupMode) {
      var gnames = (Array.isArray(m.team1) ? m.team1 : []).concat(Array.isArray(m.team2) ? m.team2 : []);
      matchLine = '<div style="font-weight:800;font-size:1.0rem;color:var(--text-bright);margin-bottom:2px;">👑 ' + _esc(gnames.join(' · ')) + '</div>' +
        '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">Os 3 jogos do grupo acontecem na mesma data combinada.</div>';
    } else {
      matchLine = '<div style="font-weight:800;font-size:1.02rem;color:var(--text-bright);margin-bottom:2px;">' + _esc(m.p1 || '') + ' <span style="color:var(--text-muted);font-weight:600;">vs</span> ' + _esc(m.p2 || '') + '</div>';
    }

    // ── estado AGENDADO (colapsado) ──
    if (m.scheduledAt) {
      var canUndo = isPlayer && !(typeof window._matchHasRealPlay === 'function' && window._matchHasRealPlay(m));
      var body =
        '<div style="padding:1.1rem;">' + matchLine +
          '<div style="margin-top:14px;text-align:center;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.4);border-radius:14px;padding:18px;">' +
            '<div style="font-size:2rem;line-height:1;">📅</div>' +
            '<div style="font-weight:900;font-size:1.1rem;color:var(--sp-c-34d399,#34d399);margin-top:8px;">' + (groupMode ? 'Jogos marcados' : 'Jogo marcado') + '</div>' +
            '<div style="font-size:0.95rem;color:var(--text-bright);margin-top:4px;">' + _esc(_fmtDateTime(m.scheduledAt)) + '</div>' +
            // A ORIGEM em texto: estimada pelo sistema ≠ marcada por gente. Sem isto o
            // jogador não tem como saber se aquele horário é combinado ou chute do app.
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:5px;">' + _esc(_origemLabel(m.scheduledKind)) + '</div>' +
          '</div>' +
          // Desfazer: quem joga desfaz o que foi combinado/estimado. O organizador não
          // precisa deste botão — ele reaponta direto no bloco abaixo (e pode limpar ali).
          (canUndo ? '<button type="button" onclick="window._schUnconfirm(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" class="btn" style="width:100%;margin-top:12px;background:rgba(239,68,68,0.12);color:var(--sp-c-f87171,#f87171);border:1px solid rgba(239,68,68,0.4);font-weight:700;border-radius:11px;padding:9px;font-size:0.82rem;">↩️ Desfazer</button>' : '') +
          (isOrg ? _orgBloco(t, m) : '') +
        '</div>';
      _overlay('sch-overlay', header + body);
      return;
    }

    // ── opções (agrupadas por quem propôs) + voto posso/não posso ──
    var votes = sched.votes || {}, dayVotes = sched.dayVotes || {};
    var myVotes = votes[uid] || {}, myDayVotes = dayVotes[uid] || {};
    var minD = _brtYmd(win.startMs), maxD = _brtYmd(win.endMs);

    // botão de voto (posso=1 / não posso=-1). `mine` = meu voto atual nesta célula.
    // Glifo CANÔNICO via window._opVoteGlyph: ✅ posso / 🚫 não posso (🚫 = proibido,
    // pra não confundir com o ✕ de apagar a opção).
    function _voteBtn(val, mine, onclick, big) {
      var on = mine === val, pos = val === 1;
      var bg = on ? (pos ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)') : 'rgba(255,255,255,0.05)';
      var col = on ? '#fff' : (pos ? '#34d399' : '#f87171');
      var bd = on ? 'none' : ('1px solid ' + window._spCor((pos ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'), 'borda'));
      var pad = big ? '8px' : '5px 8px', fs = big ? '0.82rem' : '0.8rem';
      var g = (typeof window._opVoteGlyph === 'function') ? window._opVoteGlyph(pos ? 'yes' : 'no') : (pos ? '✅' : '🚫');
      var label = big ? (g + (pos ? ' Posso' : ' Não')) : g;
      return '<button type="button" onclick="' + onclick + '" class="btn" style="' + (big ? 'flex:1;' : '') + 'background:' + window._spCor(bg, 'background') + ';color:' + window._spCor(col, 'color') + ';border:' + bd + ';font-weight:800;border-radius:9px;padding:' + pad + ';font-size:' + fs + ';line-height:1;">' + label + '</button>';
    }

    function _renderOption(o) {
      var mine = o.byUid === uid;
      var canManage = mine || isOrg;
      var editing = _schEdit && _schEdit.matchId === String(m.id) && _schEdit.optId === o.id;
      var oa = "'" + _attr(t.id) + "','" + _attr(m.id) + "','" + _attr(o.id) + "'";

      // ── modo edição inline ──
      if (editing && canManage) {
        var ed;
        if (o.kind === 'date') {
          ed = '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
            '<input type="date" id="sch-edit-date" value="' + _esc(o.dateISO || '') + '" min="' + minD + '" max="' + maxD + '" style="flex:1;min-width:0;background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
            '<input type="time" id="sch-edit-time" value="' + _esc(o.time || '17:00') + '" style="width:96px;flex-shrink:0;background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;"></div>';
        } else {
          var wsel = (o.weekdays || []);
          ed = '<div id="sch-edit-weekdays" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">' +
            WD.map(function (w, i) { var on = wsel.indexOf(i) !== -1; return '<button type="button" data-wd="' + i + '" data-on="' + (on ? '1' : '0') + '" onclick="window._schToggleWd(this)" style="background:' + window._spCor((on ? 'linear-gradient(135deg,#10b981,#059669)' : 'var(--bg-darker,#0b1220)'), 'background') + ';border:1px solid ' + window._spCor((on ? '#10b981' : 'rgba(255,255,255,0.14)'), 'borda') + ';color:' + window._spCor((on ? '#fff' : 'var(--text-muted)'), 'color') + ';border-radius:8px;padding:6px 9px;font-size:0.78rem;font-weight:700;cursor:pointer;">' + w + '</button>'; }).join('') +
            '</div>' +
            '<input type="time" id="sch-edit-weekly-time" value="' + _esc(o.time || '17:00') + '" style="width:96px;background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;margin-bottom:8px;">';
        }
        return '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.4);border-radius:11px;padding:11px 12px;margin-bottom:9px;">' + ed +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" onclick="window._schCancelEdit(' + oa + ')" class="btn" style="flex:1;background:rgba(239,68,68,0.10);color:var(--sp-c-ef4444,#ef4444);border:1px solid rgba(239,68,68,0.45);font-weight:700;border-radius:9px;padding:8px;font-size:0.8rem;">Cancelar</button>' +
            '<button type="button" onclick="window._schSaveEdit(' + oa + ')" class="btn" style="flex:1;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;font-weight:800;border-radius:9px;padding:8px;font-size:0.8rem;">Salvar</button>' +
          '</div></div>';
      }

      // ── ícones gerenciar (lápis / X) ──
      var manage = canManage ? (
        '<span style="display:inline-flex;gap:4px;flex-shrink:0;">' +
          '<button type="button" title="Editar" onclick="window._schEditOption(' + oa + ')" class="btn" style="background:var(--sp-g-255-255-255-006,rgba(255,255,255,0.06));color:var(--sp-c-cbd5e1,#cbd5e1);border:1px solid var(--border-color);border-radius:7px;padding:3px 7px;font-size:0.82rem;line-height:1;">✏️</button>' +
          '<button type="button" title="Apagar" onclick="window._schDeleteOption(' + oa + ')" class="cancel-x-btn" style="--cx-size:20px;">✕</button>' +
        '</span>') : '';

      var rows = '';
      if (o.kind === 'date') {
        var yesU = allUids.filter(function (u) { return (votes[u] || {})[o.id] === 1; });
        var noN = allUids.filter(function (u) { return (votes[u] || {})[o.id] === -1; }).length;
        rows =
          (yesU.length ? '<div style="display:flex;align-items:center;padding-left:6px;margin-top:8px;">' + _avatarsFor(t, yesU) + '</div>' : '') +
          (isPlayer ? '<div style="display:flex;gap:8px;margin-top:9px;">' +
            _voteBtn(1, myVotes[o.id], 'window._schVote(' + oa + ',1)', true) +
            _voteBtn(-1, myVotes[o.id], 'window._schVote(' + oa + ',-1)', true) +
          '</div>' : '');
        return '<div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.22);border-radius:11px;padding:10px 12px;margin-bottom:9px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
            '<span style="font-weight:800;font-size:0.95rem;color:var(--text-bright);">' + _esc(_optLabel(o)) + '</span>' +
            '<span style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;"><span style="font-size:0.72rem;color:var(--text-muted);font-weight:700;">' + yesU.length + '/' + (allUids.length || '?') + ' ✅' + (noN ? ' · ' + noN + ' 🚫' : '') + '</span>' + manage + '</span>' +
          '</div>' + rows + '</div>';
      }
      // weekly → uma linha por dia, com voto por dia
      var wds = (o.weekdays || []).slice().sort(function (a, b) { return a - b; });
      var dayRows = wds.map(function (wd) {
        var yc = allUids.filter(function (u) { return (((dayVotes[u] || {})[o.id]) || {})[wd] === 1; }).length;
        var nc = allUids.filter(function (u) { return (((dayVotes[u] || {})[o.id]) || {})[wd] === -1; }).length;
        var mv = (myDayVotes[o.id] || {})[wd];
        var da = oa + ',' + wd;
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--sp-b-255-255-255-006,rgba(255,255,255,0.06));">' +
          '<span style="font-weight:700;font-size:0.85rem;color:var(--text-bright);min-width:52px;">' + WD[wd] + (o.time ? ' <span style="color:var(--text-muted);font-weight:600;">' + _esc(o.time) + '</span>' : '') + '</span>' +
          '<span style="font-size:0.7rem;color:var(--text-muted);font-weight:700;flex:1;text-align:right;">' + yc + '/' + (allUids.length || '?') + ' ✅' + (nc ? ' · ' + nc + ' 🚫' : '') + '</span>' +
          (isPlayer ? '<span style="display:inline-flex;gap:5px;flex-shrink:0;">' +
            _voteBtn(1, mv, 'window._schVoteDay(' + da + ',1)', false) +
            _voteBtn(-1, mv, 'window._schVoteDay(' + da + ',-1)', false) +
          '</span>' : '') +
        '</div>';
      }).join('');
      return '<div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.22);border-radius:11px;padding:10px 12px;margin-bottom:9px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
          '<span style="font-weight:800;font-size:0.9rem;color:var(--sp-c-34d399,#34d399);">📆 Dias da semana ' + (o.time ? '· ' + _esc(o.time) : '') + '</span>' + manage +
        '</div>' + dayRows + '</div>';
    }

    // agrupa por quem propôs; meu box primeiro, depois por nome
    var byUser = {}, order = [];
    (sched.options || []).forEach(function (o) { if (!byUser[o.byUid]) { byUser[o.byUid] = []; order.push(o.byUid); } byUser[o.byUid].push(o); });
    order.sort(function (a, b) { if (a === uid) return -1; if (b === uid) return 1; return _userName(t, a).localeCompare(_userName(t, b)); });

    var optsHtml = order.map(function (puid) {
      var nm = _userName(t, puid) + (puid === uid ? ' (você)' : '');
      var inner = byUser[puid].map(_renderOption).join('');
      return '<div style="background:var(--sp-g-255-255-255-002,rgba(255,255,255,0.02));border:1px solid var(--border-color);border-radius:14px;padding:10px 11px 4px;margin-bottom:12px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;">' + _avatarImg(t, puid, 24) +
          '<span style="font-weight:800;font-size:0.86rem;color:var(--text-bright);">' + _esc(nm) + '</span>' +
          '<span style="font-size:0.7rem;color:var(--text-muted);font-weight:700;">propôs</span></div>' +
        inner + '</div>';
    }).join('');
    if (!(sched.options || []).length) optsHtml = '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:14px 0;">Ninguém propôs horário ainda. Proponha abaixo 👇</div>';

    var addHtml = isPlayer ? (
      '<div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--border-color);">' +
        '<div style="font-size:0.78rem;font-weight:800;color:var(--sp-c-34d399,#34d399);margin-bottom:8px;">Propor até ' + _esc(_fmtDateTime(win.endMs)) + '</div>' +
        // data + hora
        '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
          '<input type="date" id="sch-date" min="' + minD + '" max="' + maxD + '" style="flex:1;min-width:0;background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
          '<input type="time" id="sch-date-time" value="17:00" style="width:96px;flex-shrink:0;background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
        '</div>' +
        '<button type="button" onclick="window._schProposeDate(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" class="btn" style="width:100%;background:rgba(16,185,129,0.12);border:1px dashed rgba(16,185,129,0.5);color:var(--sp-c-34d399,#34d399);font-weight:700;border-radius:9px;padding:9px;font-size:0.82rem;margin-bottom:14px;">＋ propor data e hora</button>' +
        // combo de dias
        '<div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:6px;">ou combo de dias da semana:</div>' +
        '<div id="sch-weekdays" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">' +
          WD.map(function (w, i) { return '<button type="button" data-wd="' + i + '" data-on="0" onclick="window._schToggleWd(this)" style="background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));color:var(--text-muted);border-radius:8px;padding:6px 9px;font-size:0.78rem;font-weight:700;cursor:pointer;">' + w + '</button>'; }).join('') +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<input type="time" id="sch-weekly-time" value="17:00" style="width:96px;flex-shrink:0;background:var(--bg-darker,#0b1220);border:1px solid var(--sp-b-255-255-255-014,rgba(255,255,255,0.14));border-radius:8px;padding:8px;color:var(--text-bright);font-size:0.85rem;box-sizing:border-box;">' +
          '<button type="button" onclick="window._schProposeWeekly(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" class="btn" style="flex:1;background:rgba(16,185,129,0.12);border:1px dashed rgba(16,185,129,0.5);color:var(--sp-c-34d399,#34d399);font-weight:700;border-radius:9px;padding:9px;font-size:0.82rem;">＋ propor dias</button>' +
        '</div>' +
      '</div>'
    ) : (isOrg ? '<div style="margin-top:10px;font-size:0.78rem;color:var(--text-muted);text-align:center;">Você não joga este confronto — acompanhando como organizador.</div>' : '');

    var body = '<div style="padding:1rem 1.1rem;">' + matchLine +
      '<div style="font-size:0.72rem;color:var(--text-muted);margin:2px 0 12px;">Quem joga propõe horários e marca o que consegue. Quando todos derem ✅ no mesmo, o jogo é marcado.</div>' +
      optsHtml + addHtml + (isOrg ? _orgBloco(t, m) : '') + '</div>';
    _overlay('sch-overlay', header + body);
  }

  // toggle visual dos chips de dia da semana
  window._schToggleWd = function (btn) {
    if (!btn) return; var on = btn.getAttribute('data-on') === '1';
    btn.setAttribute('data-on', on ? '0' : '1');
    if (on) { btn.style.background = 'var(--bg-darker,#0b1220)'; btn.style.color = 'var(--text-muted)'; btn.style.borderColor = 'rgba(255,255,255,0.14)'; }
    else { btn.style.background = 'linear-gradient(135deg,#10b981,#059669)'; btn.style.color = '#fff'; btn.style.borderColor = '#10b981'; }
  };

  // ─── mutadores (otimista + save/revert, espelhando _opVote) ────────────────────
  function _guardPlayer(t, m) {
    var cu = _cu();
    if (!cu || !cu.uid) { if (typeof showNotification === 'function') showNotification('Entre pra combinar', 'Faça login pra combinar o jogo.', 'warning'); return null; }
    if (!_schUserIsPlayer(t, m, cu)) { if (typeof showNotification === 'function') showNotification('Só os jogadores', 'Só quem joga este confronto pode combinar.', 'warning'); return null; }
    return cu;
  }
  function _saveSchedule(t, m, prevClone, scheduledNow) {
    return _save(t).then(function () {
      _renderMatch(t, m);
      if (scheduledNow) { try { _schNotifyScheduled(t, m); } catch (e) {} }
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
      _crCache = null;
    }).catch(function (err) {
      m.schedule = prevClone.schedule; m.scheduledAt = prevClone.scheduledAt; m.scheduledBy = prevClone.scheduledBy; m.scheduledKind = prevClone.scheduledKind;
      _schMirrorToGroup(t, m); // reverte também o espelho nos jogos do grupo
      var _msg = (err && (err.code || err.message)) ? String(err.code || err.message) : 'tente novamente';
      if (typeof showNotification === 'function') showNotification('⚠️ Não salvou', 'Não foi possível registrar no servidor (' + _msg + ').', 'error');
      try { console.error('[schedule-poll] rejeitado:', err); } catch (e) {}
      _renderMatch(t, m);
    });
  }
  function _snapshot(m) {
    return {
      schedule: m.schedule ? JSON.parse(JSON.stringify(m.schedule)) : undefined,
      scheduledAt: m.scheduledAt, scheduledBy: m.scheduledBy
    };
  }

  window._schProposeDate = function (tId, matchId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    var dEl = document.getElementById('sch-date'), tEl = document.getElementById('sch-date-time');
    var dateISO = dEl && dEl.value; var time = (tEl && tEl.value) || '17:00';
    if (!dateISO) { if (typeof showNotification === 'function') showNotification('Escolha a data', '', 'warning'); return; }
    var win = window._schWindow(t);
    var ms = new Date(dateISO + 'T' + time + ':00-03:00').getTime();
    if (isNaN(ms) || ms < win.startMs - DAY || ms > win.endMs + DAY) { if (typeof showNotification === 'function') showNotification('Fora do prazo', 'Escolha uma data dentro da janela da rodada.', 'warning'); return; }
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    s.options.push({ id: 'so_' + Date.now() + '_' + _rand(), kind: 'date', dateISO: dateISO, time: time, byUid: cu.uid });
    _saveSchedule(t, m, prev, false);
  };

  window._schProposeWeekly = function (tId, matchId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    var wds = [];
    document.querySelectorAll('#sch-weekdays [data-wd][data-on="1"]').forEach(function (b) { wds.push(parseInt(b.getAttribute('data-wd'), 10)); });
    var tEl = document.getElementById('sch-weekly-time'); var time = (tEl && tEl.value) || '17:00';
    if (!wds.length) { if (typeof showNotification === 'function') showNotification('Escolha os dias', 'Marque ao menos um dia da semana.', 'warning'); return; }
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    s.options.push({ id: 'so_' + Date.now() + '_' + _rand(), kind: 'weekly', weekdays: wds, time: time, byUid: cu.uid });
    _saveSchedule(t, m, prev, false);
  };

  // voto posso(1)/não posso(-1) numa opção 'date'. Clicar no voto ativo → neutro.
  window._schVote = function (tId, matchId, optId, val) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    var mine = s.votes[cu.uid] = s.votes[cu.uid] || {};
    if (mine[optId] === val) delete mine[optId]; else mine[optId] = val;
    if (!Object.keys(mine).length) delete s.votes[cu.uid];
    var scheduledNow = _schTrySchedule(t, m);
    _saveSchedule(t, m, prev, scheduledNow);
  };

  // voto posso/não posso POR DIA numa opção 'weekly'.
  window._schVoteDay = function (tId, matchId, optId, wd, val) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    wd = parseInt(wd, 10);
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    var mine = s.dayVotes[cu.uid] = s.dayVotes[cu.uid] || {};
    var perOpt = mine[optId] = mine[optId] || {};
    if (perOpt[wd] === val) delete perOpt[wd]; else perOpt[wd] = val;
    if (!Object.keys(perOpt).length) delete mine[optId];
    if (!Object.keys(mine).length) delete s.dayVotes[cu.uid];
    var scheduledNow = _schTrySchedule(t, m);
    _saveSchedule(t, m, prev, scheduledNow);
  };

  // apagar opção (proponente ou organizador) + votos associados.
  window._schDeleteOption = function (tId, matchId, optId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var s = _ensureSchedule(m);
    var opt = (s.options || []).find(function (o) { return o.id === optId; }); if (!opt) return;
    if (opt.byUid !== cu.uid && !_isOrg(t)) { if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só quem propôs (ou o organizador) pode apagar.', 'warning'); return; }
    var run = function () {
      var prev = _snapshot(m);
      s.options = s.options.filter(function (o) { return o.id !== optId; });
      Object.keys(s.votes).forEach(function (u) { delete s.votes[u][optId]; if (!Object.keys(s.votes[u]).length) delete s.votes[u]; });
      Object.keys(s.dayVotes).forEach(function (u) { delete s.dayVotes[u][optId]; if (!Object.keys(s.dayVotes[u]).length) delete s.dayVotes[u]; });
      _saveSchedule(t, m, prev, false);
    };
    if (typeof showConfirmDialog === 'function') showConfirmDialog('Apagar opção?', 'Remove "' + _optLabel(opt) + '" e os votos dela.', run, null, 'Apagar', 'Cancelar');
    else run();
  };

  // entrar/sair do modo edição inline de uma opção.
  window._schEditOption = function (tId, matchId, optId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var s = _ensureSchedule(m);
    var opt = (s.options || []).find(function (o) { return o.id === optId; }); if (!opt) return;
    if (opt.byUid !== cu.uid && !_isOrg(t)) { if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só quem propôs (ou o organizador) pode editar.', 'warning'); return; }
    _schEdit = { matchId: String(m.id), optId: optId };
    _renderMatch(t, m);
  };
  window._schCancelEdit = function (tId, matchId, optId) {
    _schEdit = null;
    var t = _findT(tId); var m = t && _schFindMatch(t, matchId);
    if (t && m) _renderMatch(t, m);
  };
  window._schSaveEdit = function (tId, matchId, optId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var s = _ensureSchedule(m);
    var opt = (s.options || []).find(function (o) { return o.id === optId; }); if (!opt) { _schEdit = null; _renderMatch(t, m); return; }
    if (opt.byUid !== cu.uid && !_isOrg(t)) return;
    var prev = _snapshot(m);
    if (opt.kind === 'date') {
      var dEl = document.getElementById('sch-edit-date'), tEl = document.getElementById('sch-edit-time');
      var dateISO = dEl && dEl.value; var time = (tEl && tEl.value) || '17:00';
      if (!dateISO) { if (typeof showNotification === 'function') showNotification('Escolha a data', '', 'warning'); return; }
      var win = window._schWindow(t);
      var ms = new Date(dateISO + 'T' + time + ':00-03:00').getTime();
      if (isNaN(ms) || ms < win.startMs - DAY || ms > win.endMs + DAY) { if (typeof showNotification === 'function') showNotification('Fora do prazo', 'Escolha uma data dentro da janela da rodada.', 'warning'); return; }
      opt.dateISO = dateISO; opt.time = time;
    } else {
      var wds = [];
      document.querySelectorAll('#sch-edit-weekdays [data-wd][data-on="1"]').forEach(function (b) { wds.push(parseInt(b.getAttribute('data-wd'), 10)); });
      var wt = document.getElementById('sch-edit-weekly-time'); var wtime = (wt && wt.value) || '17:00';
      if (!wds.length) { if (typeof showNotification === 'function') showNotification('Escolha os dias', 'Marque ao menos um dia da semana.', 'warning'); return; }
      opt.weekdays = wds; opt.time = wtime;
      // limpa votos por dia em dias que não existem mais
      Object.keys(s.dayVotes).forEach(function (u) { var po = s.dayVotes[u][optId]; if (po) Object.keys(po).forEach(function (wd) { if (wds.indexOf(parseInt(wd, 10)) === -1) delete po[wd]; }); });
    }
    _schEdit = null;
    var scheduledNow = _schTrySchedule(t, m);
    _saveSchedule(t, m, prev, scheduledNow);
  };

  window._schUnconfirm = function (tId, matchId) {
    var t = _findT(tId); if (!t) return; var m = _schFindMatch(t, matchId); if (!m) return;
    var cu = _guardPlayer(t, m); if (!cu) return;
    var groupMode = !!(_schGroupMode && String(m.id) === _schGroupMode);
    var playCheck = groupMode ? _schGroupMatches(t, m) : [m];
    if (typeof window._matchHasRealPlay === 'function' && playCheck.some(function (mm) { return window._matchHasRealPlay(mm); })) {
      if (typeof showNotification === 'function') showNotification('Jogo já começou', 'Não dá pra desfazer — o jogo já tem placar.', 'warning'); return;
    }
    var prev = _snapshot(m); var s = _ensureSchedule(m);
    // remove meu voto na opção/dia agendado pra quebrar o consenso e não reagendar
    var oid = s.scheduledOptId, swd = s.scheduledWd;
    if (oid) {
      if (swd != null) { if (s.dayVotes[cu.uid] && s.dayVotes[cu.uid][oid]) { delete s.dayVotes[cu.uid][oid][swd]; } }
      else { if (s.votes[cu.uid]) delete s.votes[cu.uid][oid]; }
    }
    s.scheduledOptId = null; s.scheduledWd = null; m.scheduledAt = ''; m.scheduledBy = ''; m.scheduledKind = '';
    _schMirrorToGroup(t, m); // espelha o "desfeito" nos outros jogos do grupo
    _saveSchedule(t, m, prev, false);
  };

  // ─── overlay do organizador (kickoff + overview) ───────────────────────────────
  window._schOpenOrganizer = function (tId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var cr = window._schCurrentRoundMatches(t);
    var rows = (cr.matches || []).map(function (m) {
      var status, color;
      if (m.scheduledAt) { status = '📅 ' + _fmtDateTime(m.scheduledAt); color = '#34d399'; }
      else if (m.schedule && (m.schedule.options || []).length) { status = '⏳ combinando (' + m.schedule.options.length + ' opç.)'; color = '#fbbf24'; }
      else { status = 'sem propostas'; color = 'var(--text-muted)'; }
      return '<div onclick="window._schOpenMatch(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:var(--sp-g-255-255-255-003,rgba(255,255,255,0.03));border:1px solid var(--border-color);border-radius:10px;margin-bottom:8px;cursor:pointer;">' +
        '<span style="font-size:0.88rem;color:var(--text-bright);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc((m.p1 || '') + ' vs ' + (m.p2 || '')) + '</span>' +
        '<span style="font-size:0.74rem;font-weight:700;color:' + window._spCor(color, 'color') + ';flex-shrink:0;">' + _esc(status) + '</span>' +
      '</div>';
    }).join('');
    if (!rows) rows = '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:14px 0;">Sem jogos na rodada atual.</div>';
    var header =
      '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#065f46,#047857);border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2;">' +
        '<span style="font-weight:800;color:#fff;font-size:0.92rem;">📅 Propor datas</span>' +
        '<button type="button" onclick="window._schCloseOverlay()" class="btn btn-sm" style="background:var(--sp-g-255-255-255-015,rgba(255,255,255,0.15));color:#fff;border:1px solid var(--sp-b-255-255-255-025,rgba(255,255,255,0.25));">Fechar</button>' +
      '</div>';
    // Botão da grade: só aparece quando o torneio CABE na régua (até 3 dias). Em torneio
    // longo não há grade a calcular — ali quem marca são os jogadores, e oferecer o botão
    // seria prometer uma conta que não vai acontecer.
    var _plano = window._schGradeEstimada(t);
    var _gradeBtn = _plano ? (
      '<button type="button" onclick="window._schRecalcularGrade(\'' + _attr(t.id) + '\')" class="btn" style="width:100%;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.45);color:var(--sp-c-fbbf24,#fbbf24);font-weight:800;border-radius:11px;padding:10px;font-size:0.85rem;margin-bottom:10px;">🧮 Recalcular horários estimados</button>' +
      '<div style="font-size:0.7rem;color:var(--text-muted);text-align:center;margin-bottom:12px;">' + _plano.slots.length + ' jogo(s) · ' + _plano.quadras + ' quadra(s) · ' + _plano.dias + ' dia(s)' +
        (_plano.cabe ? '' : ' · ⚠️ não cabe na janela do torneio') + '. Datas já marcadas por você ou pelos jogadores não são tocadas.</div>'
    ) : '';
    var body = '<div style="padding:1rem 1.1rem;">' +
      '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px;">Toque num jogo pra apontar a data/hora, ou pra acompanhar o que os jogadores propuseram.</div>' +
      _gradeBtn +
      rows +
      '<button type="button" onclick="window._schNotifyRound(\'' + _attr(t.id) + '\')" class="btn btn-shine" style="width:100%;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;border:none;border-radius:11px;padding:11px;font-size:0.9rem;margin-top:6px;">📣 Notificar jogadores da rodada</button>' +
    '</div>';
    _overlay('sch-org-overlay', header + body);
  };

  // Recalcula e grava a grade estimada. Idempotente: rodar duas vezes seguidas não muda
  // nada. Serve pro dia em que a 1ª rodada atrasa e o resto da grade tem que andar junto —
  // que é o preço conhecido de GRAVAR a estimativa em vez de recalculá-la a cada render.
  window._schRecalcularGrade = function (tId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var n = window._schAplicarGrade(t);
    if (!n) {
      if (typeof showNotification === 'function') showNotification('Nada a mudar', 'Os horários estimados já estão em dia.', 'info');
      return;
    }
    _save(t).then(function () {
      _crCache = null;
      window._schCloseOverlay();
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
      if (typeof showNotification === 'function') showNotification('🧮 Grade atualizada', n + ' jogo(s) com horário estimado.', 'success');
    }).catch(function (err) {
      if (typeof showNotification === 'function') showNotification('⚠️ Não salvou', 'Não foi possível gravar a grade (' + String((err && (err.code || err.message)) || 'tente novamente') + ').', 'error');
    });
  };

  window._schNotifyRound = function (tId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    if (typeof window._sendUserNotification !== 'function') { if (typeof showNotification === 'function') showNotification('Indisponível', 'Notificações indisponíveis.', 'warning'); return; }
    var cr = window._schCurrentRoundMatches(t);
    var n = 0;
    (cr.matches || []).forEach(function (m) {
      if (m.scheduledAt) return; // já combinado
      _ensureSchedule(m);
      _schMatchUids(t, m).forEach(function (u) { window._sendUserNotification(u, _schKickoffData(t, m)); n++; });
    });
    try { _save(t); } catch (e) {}
    window._schCloseOverlay();
    if (typeof showNotification === 'function') showNotification('📣 Notificados', n + ' aviso(s) enviado(s).', 'success');
  };
})();
