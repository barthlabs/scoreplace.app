// wo-claim.js — W.O. APONTADO POR PARTICIPANTE, canônico (v3.1.72)
//
// "Faltou alguém?" pros próprios JOGADORES, em QUALQUER torneio que (a) NÃO
// acontece num único dia E (b) tem o resultado lançado pelos jogadores
// (resultEntry inclui 'players'/'all'). Vale em Eliminatória, Fase de Grupos,
// Liga e Rei/Rainha — antes só existia na Liga (liga-substitution.js).
//
// ── MODELO (decidido pelo dono) ──────────────────────────────────────────────
//  Fluxo CONFIRMA/CONTESTA (como o lançamento de resultado por jogadores):
//   1. um jogador APONTA quem faltou → claim pending.
//   2. o OUTRO lado confirma (✅) ou contesta (❌).
//      • confirmou → aplica o W.O.
//      • contestou → disputed; organizador decide (aplicar ou descartar).
//      • sem "outro lado" possível (ex.: 1×1, o ausente é o próprio adversário)
//        → só o organizador confirma/decide.
//   3. organizador pode resolver/reverter (enquanto não houver placar real).
//  APLICAÇÃO do W.O. por formato (reaproveita o que já existe):
//   • Eliminatória: substituto da lista de espera (_processWoSubstitutions);
//     sem substituto → adversário avança (_advanceWinner, m.wo=true).
//   • Liga / Rei-Rainha: delega pro fluxo existente _ligaPickFill (folga / Jogador X).
//   • Fase de Grupos: substituto; sem substituto → W.O. a favor dos adversários
//     nos jogos do grupo onde o ausente ainda não jogou.
//
// ── DADOS ────────────────────────────────────────────────────────────────────
//  t.woClaims = [{
//    id, scope:'match'|'group',
//    matchId,                         // scope match
//    roundIndex, groupName, matchIds, // scope group
//    players:[nome,...],              // membros do contexto (snapshot)
//    byUid, byName, absentName, absentUids:[uid,...],
//    status:'pending'|'disputed'|'applied'|'cancelled',
//    confirms:{[uid]:true}, disputedByUid,
//    createdAt, resolvedAt
//  }]
//  Rules: 'woClaims' entra na allowlist isParticipantBracketDiff (campo novo que
//  o participante grava — classe do bug Confra). Apply mexe em campos já liberados
//  (matches/rounds/groups/absent/waitlist).
(function () {
  'use strict';

  function _esc(s) { return (window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s)); }
  function _attr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function _cu() { return window.AppStore && window.AppStore.currentUser; }
  function _rand() { return Math.floor(Math.random() * 1e6); }
  function _findT(tId) {
    if (typeof window._findTournamentById === 'function') return window._findTournamentById(tId);
    return window.AppStore && (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); });
  }
  function _save(t) {
    try { if (window.FirestoreDB && window.FirestoreDB.saveTournament) return Promise.resolve(window.FirestoreDB.saveTournament(t)); }
    catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('FirestoreDB indisponível'));
  }
  function _isOrg(t) { return !!(window.AppStore && ((window.AppStore.isOrganizer && window.AppStore.isOrganizer(t)) || (window.AppStore.isCreator && window.AppStore.isCreator(t)))); }
  function _canManage(t) {
    if (_isOrg(t)) return true;
    var cu = _cu();
    return !!(cu && typeof window._canManagePresence === 'function' && window._canManagePresence(t, cu));
  }
  function _isLiga(t) { return !!(window._isLigaFormat ? window._isLigaFormat(t) : (t && (t.format === 'Liga' || t.format === 'Ranking'))); }
  function _isMonarchFmt(t) { return !!(t && (t.format === 'Rei/Rainha da Praia' || t.ligaRoundFormat === 'rei_rainha')); }

  // ─── gating: multi-dia + jogadores lançam resultado ────────────────────────────
  function _ymd(dstr) {
    if (!dstr) return '';
    var s = String(dstr); if (s.indexOf('T') !== -1) s = s.split('T')[0];
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }
  window._woIsMultiDay = function (t) {
    try {
      var cur = (t && t.currentPhaseIndex) || 0;
      var p = (t && Array.isArray(t.phases) && t.phases[cur]) || {};
      var sd = _ymd(p.startDate || (t && t.startDate) || '');
      var ed = _ymd(p.endDate || (t && t.endDate) || '');
      if (!sd && !ed) return true;       // sem datas = agenda aberta = multi-dia
      if (sd && ed) return sd !== ed;     // dias diferentes = multi-dia
      return true;                         // só uma das datas → assume multi-dia
    } catch (e) { return true; }
  };
  function _playersEnter(t) {
    if (typeof window._resultEntryIncludes === 'function') {
      if (window._resultEntryIncludes(t, 'players') || window._resultEntryIncludes(t, 'all')) return true;
    }
    var re = t && t.resultEntry;
    if (Array.isArray(re)) return re.indexOf('players') !== -1 || re.indexOf('all') !== -1;
    return re === 'players' || re === 'all';
  }
  window._woClaimEnabled = function (t) {
    return !!t && window._woIsMultiDay(t) && _playersEnter(t);
  };

  // Partida de MATA-MATA (escopo por jogo). Grupos/Liga/Rei-Rainha são por GRUPO
  // (escopo no cabeçalho) → estes retornam false aqui.
  window._woIsKnockoutMatch = function (t, m) {
    if (!t || !m || m.isMonarch || m.isBye || m.isSitOut) return false;
    if (m.group !== undefined) return false;          // fase de grupos = por grupo
    var f = t.format || '';
    if (f === 'Eliminatórias Simples' || f === 'Dupla Eliminatória') return true;
    if (m.phase === 'playoff') return true;            // playoff de Liga em dupla elim
    if (m.nextMatchId != null || m.loserMatchId != null || m.bracket) return true;
    if (f.indexOf('Eliminat') !== -1 && t.currentStage && t.currentStage !== 'groups') return true;
    return false;
  };

  // ─── nomes / uids ──────────────────────────────────────────────────────────────
  function _nameUids(t, name) {
    if (!t || !name || name === 'TBD' || name === 'BYE') return [];
    var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    var pp = parts.find(function (p) { return typeof p === 'object' && (p.displayName || p.name || '') === name; });
    if (!pp) return [];
    return (typeof window._participantUids === 'function') ? window._participantUids(pp).filter(Boolean) : (pp.uid ? [pp.uid] : []);
  }
  function _voterName(t, u) { return (typeof window._opVoterName === 'function') ? window._opVoterName(t, u) : ''; }

  function _findMatchById(t, id) {
    var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
    return (all || []).find(function (m) { return m && String(m.id) === String(id); }) || null;
  }

  // ─── contexto (match ou group) ─────────────────────────────────────────────────
  // ctx fresco (do render): {scope:'match', matchId} | {scope:'group', roundIndex, groupName, players, matches}
  var _ctxReg = {};
  function _ctxKey(ctx) {
    if (!ctx) return '';
    if (ctx.scope === 'match') return 'm|' + ctx.matchId;
    return 'g|' + ctx.roundIndex + '|' + ctx.groupName;
  }
  // membros "apontáveis" + matches + uids — resolvido do ctx fresco OU do claim.
  function _resolveCtx(t, ctx) {
    if (ctx.scope === 'match') {
      var m = _findMatchById(t, ctx.matchId);
      if (!m) return null;
      var sides = [m.p1, m.p2].filter(function (s) { return s && s !== 'TBD' && s !== 'BYE'; });
      return { scope: 'match', m: m, matchId: ctx.matchId, members: sides, matches: [m], done: !!(m.winner || m.isBye || m.isSitOut) };
    }
    var matches = Array.isArray(ctx.matches) ? ctx.matches : (Array.isArray(ctx.matchIds) ? ctx.matchIds.map(function (id) { return _findMatchById(t, id); }).filter(Boolean) : []);
    var players = Array.isArray(ctx.players) ? ctx.players.slice() : [];
    var done = matches.length > 0 && matches.every(function (m) { return m.winner || m.isBye || m.isSitOut; });
    return { scope: 'group', roundIndex: ctx.roundIndex, groupName: ctx.groupName, members: players, players: players, matches: matches, done: done };
  }
  function _allCtxUids(t, rc) {
    var out = {};
    rc.members.forEach(function (nm) { _nameUids(t, nm).forEach(function (u) { out[u] = 1; }); });
    return Object.keys(out);
  }

  // ─── claims ────────────────────────────────────────────────────────────────────
  function _claims(t) { if (!Array.isArray(t.woClaims)) t.woClaims = []; return t.woClaims; }
  function _activeClaimFor(t, ctx) {
    var key = _ctxKey(ctx);
    return _claims(t).find(function (c) {
      if (c.status !== 'pending' && c.status !== 'disputed') return false;
      if (ctx.scope === 'match') return c.scope === 'match' && String(c.matchId) === String(ctx.matchId);
      return c.scope === 'group' && String(c.roundIndex) === String(ctx.roundIndex) && c.groupName === ctx.groupName;
    }) || null;
  }
  function _claimById(t, id) { return _claims(t).find(function (c) { return c.id === id; }) || null; }
  function _ctxFromClaim(c) {
    if (c.scope === 'match') return { scope: 'match', matchId: c.matchId };
    return { scope: 'group', roundIndex: c.roundIndex, groupName: c.groupName, matchIds: c.matchIds, players: c.players };
  }
  function _confirmerUids(t, rc, c) {
    var all = _allCtxUids(t, rc);
    var absent = (c.absentUids || []);
    return all.filter(function (u) { return u !== c.byUid && absent.indexOf(u) === -1; });
  }

  // ─── chip / botão no card ou cabeçalho do grupo ────────────────────────────────
  window._woClaimChip = function (t, ctx) {
    try {
      if (!t || !ctx || !window._woClaimEnabled(t)) return '';
      _ctxReg[_ctxKey(ctx)] = ctx; // registra ctx fresco p/ o overlay de declarar
      var rc = _resolveCtx(t, ctx); if (!rc) return '';
      var cu = _cu(); if (!cu || !cu.uid) return '';
      var iAmPlayer = _allCtxUids(t, rc).indexOf(cu.uid) !== -1;
      var canMng = _canManage(t);
      var claim = _activeClaimFor(t, ctx);
      var open = 'event.stopPropagation(); window._woOpenClaim(\'' + _attr(t.id) + '\',\'' + _attr(_ctxKey(ctx)) + '\')';
      if (claim) {
        var label, bg, col, bd;
        if (claim.status === 'disputed') { label = '⚠️ W.O. contestado'; bg = 'rgba(239,68,68,0.14)'; col = '#f87171'; bd = 'rgba(239,68,68,0.45)'; }
        else { label = '⏳ Falta apontada'; bg = 'rgba(251,191,36,0.14)'; col = '#fbbf24'; bd = 'rgba(251,191,36,0.45)'; }
        return '<button type="button" class="btn btn-sm hover-lift" onclick="' + open + '" style="display:inline-flex;align-items:center;gap:5px;background:' + bg + ';border:1px solid ' + bd + ';color:' + col + ';font-weight:800;font-size:0.72rem;border-radius:8px;padding:4px 10px;">' + label + '</button>';
      }
      if (rc.done) return '';
      if (!iAmPlayer && !canMng) return '';
      return window._woBtnHtml ? window._woBtnHtml(open, true, { label: '⚠️ Faltou alguém?', title: 'Algum jogador não pôde vir? Aponte a falta — o outro lado confirma.', size: 'btn-sm', fontSize: '0.72rem' })
        : '<button type="button" class="btn btn-sm btn-danger" onclick="' + open + '" style="font-size:0.72rem;border-radius:8px;">⚠️ Faltou alguém?</button>';
    } catch (e) { return ''; }
  };

  // ─── overlay ───────────────────────────────────────────────────────────────────
  function _overlay(innerHtml) {
    var id = 'wo-overlay';
    var ex = document.getElementById(id); if (ex) ex.remove();
    var o = document.createElement('div');
    o.id = id;
    o.style.cssText = 'position:fixed;inset:0;z-index:100045;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';
    o.innerHTML = '<div style="background:var(--bg-card,#0f172a);width:96%;max-width:440px;max-height:90vh;overflow:auto;border-radius:16px;border:1px solid rgba(239,68,68,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);">' + innerHtml + '</div>';
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }
  window._woCloseOverlay = function () { var o = document.getElementById('wo-overlay'); if (o) o.remove(); };

  function _header(title) {
    return '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#7f1d1d,#991b1b);border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2;">' +
      '<button type="button" onclick="window._woCloseOverlay()" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);font-weight:700;">‹ Voltar</button>' +
      '<span style="font-weight:800;color:#fff;font-size:0.92rem;">' + title + '</span>' +
      '<span style="width:54px;"></span>' +
      '</div>';
  }

  window._woOpenClaim = function (tId, ctxKey) {
    var t = _findT(tId); if (!t) return;
    // resolve ctx: claim ativo manda; senão ctx fresco do registro.
    var claim = _claims(t).find(function (c) {
      if (c.status !== 'pending' && c.status !== 'disputed') return false;
      return _ctxKey(_ctxFromClaim(c)) === ctxKey;
    });
    var ctx = claim ? _ctxFromClaim(claim) : _ctxReg[ctxKey];
    if (!ctx) return;
    var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); var uid = cu && cu.uid;

    // ── já existe claim: confirmar / contestar / resolver ──
    if (claim) {
      var confirmers = _confirmerUids(t, rc, claim);
      var iCanConfirm = uid && confirmers.indexOf(uid) !== -1;
      var iAmOrg = _isOrg(t);
      var iAmDeclarer = uid === claim.byUid;
      var absDisp = _esc(claim.absentName);
      var byDisp = _esc(claim.byName || _voterName(t, claim.byUid) || 'Alguém');
      var info = '<div style="font-weight:800;font-size:1.0rem;color:var(--text-bright);">🚫 ' + absDisp + ' <span style="color:var(--text-muted);font-weight:600;">faltou</span></div>' +
        '<div style="font-size:0.74rem;color:var(--text-muted);margin-top:3px;">Apontado por ' + byDisp + (rc.scope === 'group' ? ' · grupo ' + _esc(rc.groupName || '') : '') + '. O W.O. só vale quando o outro lado confirma.</div>';
      var actions = '';
      if (claim.status === 'disputed') {
        info += '<div style="margin-top:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:12px;text-align:center;"><div style="font-weight:900;color:#f87171;">⚠️ Contestado</div><div style="font-size:0.82rem;color:var(--text-bright);margin-top:3px;">O organizador decide.</div></div>';
        if (iAmOrg) {
          actions = '<div style="display:flex;gap:8px;margin-top:14px;">' +
            '<button type="button" onclick="window._woResolveDiscard(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border-color);font-weight:700;border-radius:10px;padding:10px;">Descartar</button>' +
            '<button type="button" onclick="window._woResolveApply(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">Aplicar W.O.</button>' +
          '</div>';
        }
      } else if (iCanConfirm) {
        actions = '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button type="button" onclick="window._woContest(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.4);font-weight:800;border-radius:10px;padding:10px;">❌ Contestar</button>' +
          '<button type="button" onclick="window._woConfirm(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">✅ Confirmar falta</button>' +
        '</div>';
      } else if (iAmDeclarer) {
        info += '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">Aguardando o outro lado confirmar…</div>';
        actions = '<button type="button" onclick="window._woCancel(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="width:100%;margin-top:12px;background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border-color);font-weight:700;border-radius:10px;padding:9px;">Cancelar aviso</button>';
      } else {
        info += '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">Aguardando confirmação' + (confirmers.length ? '' : ' do organizador') + '…</div>';
      }
      // organizador sempre pode aplicar/descartar mesmo em pending
      if (iAmOrg && claim.status === 'pending') {
        actions += '<div style="display:flex;gap:8px;margin-top:8px;">' +
          '<button type="button" onclick="window._woCancel(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border-color);font-weight:700;border-radius:10px;padding:9px;font-size:0.8rem;">Descartar</button>' +
          '<button type="button" onclick="window._woResolveApply(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:9px;font-size:0.8rem;">Aplicar agora</button>' +
        '</div>';
      }
      _overlay(_header('Falta apontada') + '<div style="padding:1.1rem;">' + info + actions + '</div>');
      return;
    }

    // ── sem claim: declarar quem faltou ──
    var canDeclare = (uid && _allCtxUids(t, rc).indexOf(uid) !== -1) || _canManage(t);
    if (!canDeclare) { _woCloseOverlay(); return; }
    var picks = rc.members.map(function (nm) {
      return '<button type="button" onclick="window._woDeclare(\'' + _attr(t.id) + '\',\'' + _attr(ctxKey) + '\',\'' + _attr(nm) + '\')" class="btn hover-lift" style="display:block;width:100%;text-align:left;margin-bottom:8px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:var(--text-bright);font-weight:700;border-radius:11px;padding:11px 13px;font-size:0.92rem;">🚫 ' + _esc(nm) + '</button>';
    }).join('');
    _overlay(_header('Faltou alguém?') +
      '<div style="padding:1.1rem;">' +
        '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">Quem não pôde vir? O outro lado vai confirmar antes do W.O. valer.</div>' +
        picks +
      '</div>');
  };

  // ─── notificações ──────────────────────────────────────────────────────────────
  function _notify(t, uids, data) {
    if (typeof window._sendUserNotification !== 'function') return;
    (uids || []).forEach(function (u) { if (u) window._sendUserNotification(u, data); });
  }
  function _notifData(t, title, message) {
    return { type: 'wo-claim', tournamentId: String(t.id), tournamentName: t.name || '', title: title, message: message, level: 'fundamental', timestamp: Date.now() };
  }

  // ─── save/revert (otimista, espelha _opVote / schedule-poll) ───────────────────
  function _snap(t) { return JSON.stringify(_claims(t)); }
  function _persist(t, prevJson, onOk) {
    return _save(t).then(function () {
      try { if (typeof onOk === 'function') onOk(); } catch (e) {}
      if (typeof window._rerenderBracket === 'function') { try { window._rerenderBracket(String(t.id)); } catch (e) {} }
      else if (typeof window._softRefreshView === 'function') window._softRefreshView();
    }).catch(function (err) {
      try { t.woClaims = JSON.parse(prevJson); } catch (e) {}
      var msg = (err && (err.code || err.message)) ? String(err.code || err.message) : 'tente novamente';
      if (typeof showNotification === 'function') showNotification('⚠️ Não salvou', 'Não foi possível registrar (' + msg + ').', 'error');
      try { console.error('[wo-claim] rejeitado:', err); } catch (e) {}
    });
  }

  // ─── ações ─────────────────────────────────────────────────────────────────────
  window._woDeclare = function (tId, ctxKey, absentName) {
    var t = _findT(tId); if (!t) return;
    var ctx = _ctxReg[ctxKey]; if (!ctx) return;
    var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) { if (typeof showNotification === 'function') showNotification('Entre para apontar', '', 'warning'); return; }
    if (_allCtxUids(t, rc).indexOf(cu.uid) === -1 && !_canManage(t)) { if (typeof showNotification === 'function') showNotification('Só os jogadores', 'Só quem joga (ou o organizador) pode apontar.', 'warning'); return; }
    var prev = _snap(t);
    var c = {
      id: 'wo_' + Date.now() + '_' + _rand(),
      scope: rc.scope,
      byUid: cu.uid, byName: cu.displayName || _voterName(t, cu.uid) || '',
      absentName: absentName, absentUids: _nameUids(t, absentName),
      status: 'pending', confirms: {}, createdAt: new Date().toISOString()
    };
    if (rc.scope === 'match') { c.matchId = rc.matchId; }
    else { c.roundIndex = rc.roundIndex; c.groupName = rc.groupName; c.matchIds = rc.matches.map(function (m) { return m.id; }); c.players = rc.players; }
    _claims(t).push(c);
    // notifica quem pode confirmar (o outro lado) + organizador
    var conf = _confirmerUids(t, rc, c);
    var data = _notifData(t, '⚠️ Confirma a falta?', (c.byName || 'Alguém') + ' apontou que "' + absentName + '" faltou em "' + (t.name || '') + '". Confirme ou conteste.');
    _notify(t, conf, data);
    if (t.creatorUid && conf.indexOf(t.creatorUid) === -1) _notify(t, [t.creatorUid], data);
    _persist(t, prev, function () { window._woOpenClaim(tId, ctxKey); });
  };

  window._woConfirm = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c || c.status !== 'pending') return;
    var ctx = _ctxFromClaim(c); var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var canConfirm = _confirmerUids(t, rc, c).indexOf(cu.uid) !== -1 || _isOrg(t);
    if (!canConfirm) { if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só o outro lado (ou o organizador) confirma.', 'warning'); return; }
    var prev = _snap(t);
    c.confirms[cu.uid] = true; c.status = 'applied'; c.resolvedAt = new Date().toISOString();
    var applied = _applyClaim(t, c, rc);
    if (!applied.ok) { try { t.woClaims = JSON.parse(prev); } catch (e) {} if (typeof showNotification === 'function') showNotification('Não aplicou', applied.reason || 'Tente pelo painel do organizador.', 'warning'); return; }
    _notify(t, c.absentUids, _notifData(t, '🚫 W.O. registrado', 'Você foi marcado como ausente em "' + (t.name || '') + '". ' + (applied.note || '')));
    _persist(t, prev, function () { window._woCloseOverlay(); if (typeof showNotification === 'function') showNotification('✅ W.O. aplicado', applied.note || '', 'success'); });
  };

  window._woContest = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c || c.status !== 'pending') return;
    var ctx = _ctxFromClaim(c); var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var canConfirm = _confirmerUids(t, rc, c).indexOf(cu.uid) !== -1 || _isOrg(t);
    if (!canConfirm) return;
    var prev = _snap(t);
    c.status = 'disputed'; c.disputedByUid = cu.uid;
    var orgU = t.creatorUid ? [t.creatorUid] : [];
    _notify(t, orgU, _notifData(t, '⚠️ W.O. contestado', 'A falta de "' + c.absentName + '" em "' + (t.name || '') + '" foi contestada. Você decide.'));
    _persist(t, prev, function () { window._woOpenClaim(tId, _ctxKey(ctx)); });
  };

  window._woCancel = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c) return;
    var cu = _cu(); if (!cu) return;
    if (cu.uid !== c.byUid && !_canManage(t)) return;
    var prev = _snap(t);
    c.status = 'cancelled'; c.resolvedAt = new Date().toISOString();
    _persist(t, prev, function () { window._woCloseOverlay(); });
  };

  window._woResolveApply = function (tId, claimId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var c = _claimById(t, claimId); if (!c || (c.status !== 'pending' && c.status !== 'disputed')) return;
    var ctx = _ctxFromClaim(c); var rc = _resolveCtx(t, ctx); if (!rc) return;
    var prev = _snap(t);
    c.status = 'applied'; c.resolvedAt = new Date().toISOString();
    var applied = _applyClaim(t, c, rc);
    if (!applied.ok) { try { t.woClaims = JSON.parse(prev); } catch (e) {} if (typeof showNotification === 'function') showNotification('Não aplicou', applied.reason || '', 'warning'); return; }
    _notify(t, c.absentUids, _notifData(t, '🚫 W.O. registrado', 'Você foi marcado como ausente em "' + (t.name || '') + '".'));
    _persist(t, prev, function () { window._woCloseOverlay(); if (typeof showNotification === 'function') showNotification('✅ W.O. aplicado', applied.note || '', 'success'); });
  };

  window._woResolveDiscard = function (tId, claimId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var c = _claimById(t, claimId); if (!c) return;
    var prev = _snap(t);
    c.status = 'cancelled'; c.resolvedAt = new Date().toISOString();
    _persist(t, prev, function () { window._woCloseOverlay(); });
  };

  // ─── APLICAÇÃO do W.O. por formato ─────────────────────────────────────────────
  function _markAbsentUid(t, uids) {
    if (!t.absent || typeof t.absent !== 'object') t.absent = {};
    (uids || []).forEach(function (u) { if (u) t.absent[u] = true; });
  }
  function _applyClaim(t, c, rc) {
    try {
      if (rc.scope === 'group' && (_isLiga(t) || _isMonarchFmt(t))) {
        // Liga / Rei-Rainha: delega pro fluxo existente (folga / Jogador X).
        if (typeof window._ligaPickFill === 'function') {
          window._ligaPickFill(String(t.id), c.roundIndex, c.groupName, c.absentName);
          return { ok: true, note: 'Escolha o substituto (folga / Jogador X).' };
        }
        return { ok: false, reason: 'fluxo da Liga indisponível' };
      }
      // Eliminatória OU Fase de Grupos: tenta substituto da lista de espera.
      var subbed = false;
      var hasPool = (Array.isArray(t.standbyParticipants) && t.standbyParticipants.length) || (Array.isArray(t.waitlist) && t.waitlist.length);
      if (hasPool && c.absentUids.length && typeof window._processWoSubstitutions === 'function') {
        _markAbsentUid(t, c.absentUids);
        var r = window._processWoSubstitutions(String(t.id));
        subbed = !!(r && r.subCount > 0);
        if (!subbed) { c.absentUids.forEach(function (u) { if (t.absent) delete t.absent[u]; }); } // sem sub → desfaz a marca
      }
      if (subbed) return { ok: true, note: 'Substituto da lista de espera entrou no lugar.' };

      // Sem substituto → adversário(s) vence(m) por W.O.
      var matches = rc.matches.filter(function (m) { return m && !m.winner; });
      var n = 0;
      matches.forEach(function (m) {
        var p1IsAbsent = m.p1 === c.absentName, p2IsAbsent = m.p2 === c.absentName;
        if (!p1IsAbsent && !p2IsAbsent) return;
        m.winner = p1IsAbsent ? m.p2 : m.p1;
        m.wo = true; m.woAbsent = c.absentName;
        if (rc.scope === 'match' && typeof window._advanceWinner === 'function') { try { window._advanceWinner(t, m); } catch (e) {} }
        n++;
      });
      if (n === 0) return { ok: false, reason: 'jogo do ausente não encontrado' };
      if (rc.scope === 'match' && typeof window._maybeFinishElimination === 'function') { try { window._maybeFinishElimination(t); } catch (e) {} }
      return { ok: true, note: 'Adversário venceu por W.O.' };
    } catch (e) {
      try { console.error('[wo-claim] apply falhou:', e); } catch (_e) {}
      return { ok: false, reason: (e && e.message) || 'erro ao aplicar' };
    }
  }
})();
