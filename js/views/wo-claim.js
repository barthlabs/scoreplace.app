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
  // (o _save doc-inteiro foi removido na v4.0.116 — wo-claim persiste TUDO pelo
  //  portão AppStore.mutate/commitTournamentTx, ver _commit abaixo.)
  function _isOrg(t) { return !!(window.AppStore && ((window.AppStore.isOrganizer && window.AppStore.isOrganizer(t)) || (window.AppStore.isCreator && window.AppStore.isCreator(t)))); }
  function _canManage(t) {
    if (_isOrg(t)) return true;
    var cu = _cu();
    return !!(cu && typeof window._canManagePresence === 'function' && window._canManagePresence(t, cu));
  }
  function _isLiga(t) { return !!(window._isLigaFormat ? window._isLigaFormat(t) : (t && (t.format === 'Liga' || t.format === 'Ranking'))); }
  function _isMonarchFmt(t) { return !!(window._isMonarchFormat && window._isMonarchFormat(t)); }

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
      // v4.1.19: variante COMPACTA pro header do card (canônica) — botão "W.O." pequeno à
      // esquerda do "Ao Vivo" em vez do "⚠️ Faltou alguém?" largo embaixo do card.
      var _cpt = !!ctx.compact;
      var _sz = _cpt ? 'btn-micro' : 'btn-sm';
      var _fs = _cpt ? '0.68rem' : '0.72rem';
      if (claim) {
        var label, bg, col, bd;
        if (claim.status === 'disputed') { label = _cpt ? '⚠️ Contestado' : '⚠️ W.O. contestado'; bg = 'rgba(239,68,68,0.14)'; col = '#f87171'; bd = 'rgba(239,68,68,0.45)'; }
        else { label = _cpt ? '⏳ Apontado' : '⏳ Falta apontada'; bg = 'rgba(251,191,36,0.14)'; col = '#fbbf24'; bd = 'rgba(251,191,36,0.45)'; }
        return '<button type="button" class="btn ' + _sz + ' hover-lift" onclick="' + open + '" style="display:inline-flex;align-items:center;gap:5px;background:' + bg + ';border:1px solid ' + bd + ';color:' + col + ';font-weight:800;font-size:' + _fs + ';border-radius:8px;padding:' + (_cpt ? '3px 8px' : '4px 10px') + ';flex-shrink:0;">' + label + '</button>';
      }
      if (rc.done) return '';
      if (!iAmPlayer && !canMng) return '';
      // Label padrão "W.O." em TODAS as variantes (cosmético — pedido do dono; a
      // larga dizia "⚠️ Faltou alguém?"). O fluxo canônico de confirmação cruzada
      // (apontar → outro lado confirma/contesta) continua idêntico.
      var _label = 'W.O.';
      return window._woBtnHtml ? window._woBtnHtml(open, true, { label: _label, title: 'Algum jogador não pôde vir? Aponte a falta — o outro lado confirma.', size: _sz, fontSize: _fs })
        : '<button type="button" class="btn ' + _sz + ' btn-danger" onclick="' + open + '" style="font-size:' + _fs + ';border-radius:8px;">' + _label + '</button>';
    } catch (e) { return ''; }
  };

  // ─── overlay ───────────────────────────────────────────────────────────────────
  function _overlay(innerHtml) {
    var id = 'wo-overlay';
    var ex = document.getElementById(id); if (ex) ex.remove();
    var o = document.createElement('div');
    o.id = id;
    o.style.cssText = 'position:fixed;inset:0;z-index:100045;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';
    o.innerHTML = '<div style="background:var(--bg-card,#0f172a);width:96%;max-width:440px;max-height:90%;overflow:auto;border-radius:16px;border:1px solid rgba(239,68,68,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.6);">' + innerHtml + '</div>';
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
          // Contestado: o organizador DECIDE — Reverter (azul, derruba o apontamento
          // avisando todos) à esquerda de Aplicar W.O. (org.).
          actions = '<div style="display:flex;gap:8px;margin-top:14px;">' +
            '<button type="button" onclick="window._woResolveDiscard(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.5);font-weight:800;border-radius:10px;padding:10px;">↩️ Reverter</button>' +
            '<button type="button" onclick="window._woResolveApply(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">Aplicar W.O. (org.)</button>' +
          '</div>';
        }
      } else if (iCanConfirm) {
        // "Os demais" (o outro lado): Cancelar (NEGA o W.O. → vira contestado, o
        // organizador decide) à esquerda + Confirmar à direita.
        actions = '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button type="button" onclick="window._woContest(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.4);font-weight:800;border-radius:10px;padding:10px;">Cancelar</button>' +
          '<button type="button" onclick="window._woConfirm(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">✅ Confirmar</button>' +
        '</div>';
      } else if (iAmDeclarer) {
        info += '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">Aguardando o outro lado confirmar…</div>';
      } else {
        info += '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">Aguardando confirmação' + (confirmers.length ? '' : ' do organizador') + '…</div>';
      }
      // Linha final (pending): Reverter (azul, SÓ de quem apontou — derruba o
      // apontamento avisando todos) à esquerda de Aplicar agora (org.) — só o
      // organizador aplica direto. SEM "Voltar" embaixo: o do cabeçalho basta.
      if (claim.status === 'pending' && (iAmDeclarer || iAmOrg)) {
        var _rowBtns = '';
        if (iAmDeclarer) {
          _rowBtns += '<button type="button" onclick="window._woCancel(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.5);font-weight:800;border-radius:10px;padding:9px;font-size:0.8rem;">↩️ Reverter</button>';
        }
        if (iAmOrg) {
          _rowBtns += '<button type="button" onclick="window._woResolveApply(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:9px;font-size:0.8rem;">Aplicar agora (org.)</button>';
        }
        if (_rowBtns) actions += '<div style="display:flex;gap:8px;margin-top:' + (actions ? '8px' : '14px') + ';">' + _rowBtns + '</div>';
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

  // ─── save BLINDADO pelo portão AppStore.mutate (Fase-B da blindagem) ───────────
  // Substitui o _persist antigo (saveTournament doc-inteiro = lost-update numa
  // corrida). `mutatorFn(ft)` expressa a MUDANÇA e é re-executada sobre o doc
  // FRESCO da transação (retorne false pra abortar/idempotência). onDone roda no
  // fim (notify/overlay/toast) com o `ok` do save. NÃO pôr efeito interativo
  // (ex.: _ligaPickFill, que abre diálogo) DENTRO do mutator — ele roda 2× (local
  // + fresco); esses vão no onDone.
  function _commit(tId, mutatorFn, onDone, loadingMsg) {
    if (!window.AppStore || typeof window.AppStore.mutate !== 'function') {
      if (typeof showNotification === 'function') showNotification('⚠️ Não salvou', 'Portão de escrita indisponível.', 'error');
      return Promise.resolve(false);
    }
    // Feedback IMEDIATO (feedback_global_loading_always) + trava anti-duplo-toque:
    // a transação do portão demora e sem loader o usuário tocava 2×. Trava os botões
    // do overlay e mostra o loader rico até o save terminar.
    var _lockBtns = function (on) {
      try {
        var _ov = document.getElementById('wo-overlay');
        if (_ov) _ov.querySelectorAll('button').forEach(function (b) {
          b.disabled = on; b.style.opacity = on ? '0.55' : ''; b.style.pointerEvents = on ? 'none' : '';
        });
      } catch (e) {}
    };
    _lockBtns(true);
    if (typeof window._showLoading === 'function') window._showLoading(loadingMsg || 'Processando…');
    return window.AppStore.mutate(String(tId), mutatorFn).then(function (okSave) {
      if (typeof window._hideLoading === 'function') window._hideLoading();
      if (typeof onDone === 'function') { try { onDone(okSave); } catch (e) {} }
      if (typeof window._rerenderBracket === 'function') { try { window._rerenderBracket(String(tId)); } catch (e) {} }
      else if (typeof window._softRefreshView === 'function') window._softRefreshView();
      return okSave;
    }, function (err) {
      if (typeof window._hideLoading === 'function') window._hideLoading();
      _lockBtns(false);
      if (typeof showNotification === 'function') showNotification('⚠️ Não salvou', (err && err.message) || 'Tente de novo.', 'error');
      return false;
    });
  }
  function _isLigaGroup(t, c) { return c && c.scope === 'group' && (_isLiga(t) || _isMonarchFmt(t)); }

  // ─── ações ─────────────────────────────────────────────────────────────────────
  window._woDeclare = function (tId, ctxKey, absentName) {
    var t = _findT(tId); if (!t) return;
    var ctx = _ctxReg[ctxKey]; if (!ctx) return;
    var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) { if (typeof showNotification === 'function') showNotification('Entre para apontar', '', 'warning'); return; }
    if (_allCtxUids(t, rc).indexOf(cu.uid) === -1 && !_canManage(t)) { if (typeof showNotification === 'function') showNotification('Só os jogadores', 'Só quem joga (ou o organizador) pode apontar.', 'warning'); return; }
    var c = {
      id: 'wo_' + Date.now() + '_' + _rand(),
      scope: rc.scope,
      byUid: cu.uid, byName: cu.displayName || _voterName(t, cu.uid) || '',
      absentName: absentName, absentUids: _nameUids(t, absentName),
      status: 'pending', confirms: {}, createdAt: new Date().toISOString()
    };
    if (rc.scope === 'match') { c.matchId = rc.matchId; }
    else { c.roundIndex = rc.roundIndex; c.groupName = rc.groupName; c.matchIds = rc.matches.map(function (m) { return m.id; }); c.players = rc.players; }
    var conf = _confirmerUids(t, rc, c);
    var data = _notifData(t, '⚠️ Confirma a falta?', (c.byName || 'Alguém') + ' apontou que "' + absentName + '" faltou em "' + (t.name || '') + '". Confirme ou conteste.');
    _commit(tId, function (ft) {
      var claims = _claims(ft);
      if (!claims.some(function (x) { return x.id === c.id; })) claims.push(c); // idempotente por id
    }, function () {
      _notify(t, conf, data);
      if (t.creatorUid && conf.indexOf(t.creatorUid) === -1) _notify(t, [t.creatorUid], data);
      window._woOpenClaim(tId, ctxKey);
    }, 'Registrando o apontamento…');
  };

  window._woConfirm = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c || c.status !== 'pending') return;
    var ctx = _ctxFromClaim(c); var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var canConfirm = _confirmerUids(t, rc, c).indexOf(cu.uid) !== -1 || _isOrg(t);
    if (!canConfirm) { if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só o outro lado (ou o organizador) confirma.', 'warning'); return; }
    _applyClaimViaGate(tId, claimId, cu.uid, false);
  };

  window._woContest = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c || c.status !== 'pending') return;
    var ctx = _ctxFromClaim(c); var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var canConfirm = _confirmerUids(t, rc, c).indexOf(cu.uid) !== -1 || _isOrg(t);
    if (!canConfirm) return;
    var data = _notifData(t, '⚠️ W.O. contestado', 'A falta de "' + c.absentName + '" em "' + (t.name || '') + '" foi contestada. Você decide.');
    _commit(tId, function (ft) {
      var c2 = _claimById(ft, claimId); if (!c2 || c2.status !== 'pending') return false;
      c2.status = 'disputed'; c2.disputedByUid = cu.uid;
    }, function () {
      // Escala a disputa pro organizador + co-organizadores ativos — MESMO helper do
      // placar (_contestResult → _notifyOrgAndCoHosts). Antes só t.creatorUid era
      // avisado, então co-host de torneio nunca sabia de um W.O. contestado. (portado de v4.4.121)
      if (typeof window._notifyOrgAndCoHosts === 'function') window._notifyOrgAndCoHosts(t, data);
      else _notify(t, t.creatorUid ? [t.creatorUid] : [], data);
      window._woOpenClaim(tId, _ctxKey(ctx));
    }, 'Registrando a contestação…');
  };

  // Envolvidos num claim (jogadores do contexto + ausente + organizador), menos o
  // próprio ator — pro REVERTER avisar todo mundo que o apontamento caiu.
  function _claimAudience(t, c, actorUid) {
    var rc = _resolveCtx(t, _ctxFromClaim(c));
    var uids = (rc ? _allCtxUids(t, rc) : []).concat(c.absentUids || []);
    if (t.creatorUid) uids.push(t.creatorUid);
    var seen = {};
    return uids.filter(function (u) { if (!u || u === actorUid || seen[u]) return false; seen[u] = 1; return true; });
  }
  function _revertClaim(tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c) return;
    var cu = _cu() || {};
    var aud = _claimAudience(t, c, cu.uid);
    var data = _notifData(t, '↩️ Apontamento de W.O. revertido',
      'O apontamento de falta de "' + c.absentName + '" em "' + (t.name || '') + '" foi revertido por ' + (cu.displayName || 'alguém') + '. Nada mudou na chave.');
    _commit(tId, function (ft) {
      var c2 = _claimById(ft, claimId); if (!c2 || c2.status === 'cancelled') return false;
      c2.status = 'cancelled'; c2.resolvedAt = new Date().toISOString();
    }, function (okSave) {
      if (okSave) {
        _notify(t, aud, data);
        if (typeof showNotification === 'function') showNotification('↩️ Apontamento revertido', 'Todos os envolvidos foram avisados.', 'success');
      }
      window._woCloseOverlay();
    }, 'Revertendo o apontamento…');
  }

  window._woCancel = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c) return;
    var cu = _cu(); if (!cu) return;
    if (cu.uid !== c.byUid && !_canManage(t)) return;
    _revertClaim(tId, claimId);
  };

  window._woResolveApply = function (tId, claimId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var c = _claimById(t, claimId); if (!c || (c.status !== 'pending' && c.status !== 'disputed')) return;
    var ctx = _ctxFromClaim(c); var rc = _resolveCtx(t, ctx); if (!rc) return;
    _applyClaimViaGate(tId, claimId, null, true);
  };

  window._woResolveDiscard = function (tId, claimId) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    _revertClaim(tId, claimId);
  };

  // Aplica o W.O. de um claim ATOMICAMENTE pelo portão. `confirmerUid` (ou null p/
  // resolução do org) marca confirms. `orgResolve` aceita claim pending OU disputed.
  // Liga/Rei-Rainha (escopo grupo) é INTERATIVO (_ligaPickFill abre diálogo): a
  // marcação do claim vai pelo portão e o picker abre no onDone (1× só, fora da txn).
  function _applyClaimViaGate(tId, claimId, confirmerUid, orgResolve) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c) return;
    var ligaGroup = _isLigaGroup(t, c);
    var applied; // resultado da exec LOCAL (síncrona) do mutator, pra UI
    _commit(tId, function (ft) {
      var c2 = _claimById(ft, claimId); if (!c2) return false;
      if (orgResolve) { if (c2.status !== 'pending' && c2.status !== 'disputed') return false; }
      else if (c2.status !== 'pending') return false; // idempotência (já resolvido)
      if (confirmerUid) { c2.confirms = c2.confirms || {}; c2.confirms[confirmerUid] = true; }
      c2.status = 'applied'; c2.resolvedAt = new Date().toISOString();
      if (ligaGroup) return; // aplicação real via _ligaPickFill (interativo, no onDone)
      var rc2 = _resolveCtx(ft, _ctxFromClaim(c2)); if (!rc2) { if (applied === undefined) applied = { ok: false, reason: 'contexto perdido' }; return false; }
      var ap = _applyClaim(ft, c2, rc2);
      if (applied === undefined) applied = ap;
      if (!ap.ok) { c2.status = orgResolve ? c2.status : 'pending'; if (confirmerUid) { try { delete c2.confirms[confirmerUid]; } catch (e) {} } return false; }
    }, function () {
      if (ligaGroup) {
        _notify(t, c.absentUids, _notifData(t, '🚫 W.O. registrado', 'Você foi marcado como ausente em "' + (t.name || '') + '".'));
        window._woCloseOverlay();
        if (typeof window._ligaPickFill === 'function') window._ligaPickFill(String(t.id), c.roundIndex, c.groupName, c.absentName);
        return;
      }
      if (applied && applied.ok) {
        _notify(t, c.absentUids, _notifData(t, '🚫 W.O. registrado', 'Você foi marcado como ausente em "' + (t.name || '') + '". ' + (applied.note || '')));
        window._woCloseOverlay();
        if (typeof showNotification === 'function') showNotification('✅ W.O. aplicado', applied.note || '', 'success');
      } else if (applied) {
        if (typeof showNotification === 'function') showNotification('Não aplicou', applied.reason || (orgResolve ? '' : 'Tente pelo painel do organizador.'), 'warning');
      }
    }, 'Aplicando o W.O.…');
  }

  // ─── APLICAÇÃO do W.O. — funil no motor único _applyWO (participants.js) ────────
  function _applyClaim(t, c, rc) {
    try {
      // Motor ÚNICO de W.O. (participants.js) — funil canônico. O claim é o
      // gatilho fino: já validou permissão/consenso; aqui só aplica. Sem lista
      // não-vazia + ninguém presente, o claim ESCALA (o consenso já resolveu que
      // faltou) — por isso noSubBehavior:'escalate' (o organizador usa 'wait').
      if (typeof window._applyWO !== 'function') return { ok: false, reason: 'motor de W.O. indisponível' };
      var r = window._applyWO(t, {
        absentName: c.absentName,
        absentUids: c.absentUids,
        scope: rc.scope,
        matches: rc.matches,
        roundIndex: c.roundIndex,
        groupName: c.groupName,
        noSubBehavior: 'escalate'
      });
      if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'não aplicou' };
      var note = r.outcome === 'ligaDelegated' ? (r.note || 'Escolha o substituto (folga / Jogador X).')
        : r.outcome === 'subbed' ? 'Substituto da lista de espera entrou no lugar.'
        : r.outcome === 'woApplied' ? 'Adversário venceu por W.O.'
        : r.outcome === 'waitedTBD' ? 'Ausência registrada — adversário ainda não definido.'
        : '';
      return { ok: true, note: note };
    } catch (e) {
      try { console.error('[wo-claim] apply falhou:', e); } catch (_e) {}
      return { ok: false, reason: (e && e.message) || 'erro ao aplicar' };
    }
  }
})();
