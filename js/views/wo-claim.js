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
    // CANÔNICO (18-jul-2026): W.O. NÃO depende de multi-dia. Lesão/abandono pode ocorrer
    // em QUALQUER jogo — 1ª rodada, final, 3º lugar — inclusive em torneio de 1 dia. Este
    // helper significa "participante pode ACUSAR" = resultEntry inclui players/all. O
    // organizador declara SEMPRE (gate por papel dentro de _woClaimChip). Ver
    // [[feedback_behavior_is_pure_function_of_config]]. (_woIsMultiDay ficou sem uso.)
    return !!t && _playersEnter(t);
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
  // ALVOS do W.O. num jogo. Cada alvo = { name, uids:[…] } — SEMPRE com uid junto, porque
  // o resto do fluxo (confirmadores, _applyWO) identifica por uid, e nome de dupla não
  // resolve pessoa nenhuma em t.participants (os inscritos são as DUPLAS).
  //
  // v1.2.32 — W.O. INDIVIDUAL: o alvo é a PESSOA, não o LADO. Antes isto era
  // `members: [m.p1, m.p2]` — os dois lados — e a tela oferecia "2 duplas": o organizador
  // só conseguia dar W.O. na dupla inteira, contra o toggle `woScope: 'individual'`. O motor
  // (_applyWO) não tinha culpa: `isIndividualWO` exige que o absentName seja o MEMBRO
  // (`entryStr !== absentName`), e recebia a dupla — então fazia W.O. de time, obedecendo.
  // Dono: _"o individual pressupõe que no momento do W.O. não é do time todo sem escolha"_.
  // Decompõe pelos uids dos SLOTS (`_slotUids` — team*Uids/p*Uid), nunca quebrando o nome
  // no '/': a barra é tipografia. Ver [[project_wo_individual_substitution_rule]] /
  // [[project_uid_identity_canon_locked]].
  //
  // Lado com 0 ou 1 uid (guest/fictício, que só tem nome) fica como LADO — é a exceção
  // canônica: sem uid não há pessoa a apontar individualmente.
  function _matchMembers(t, m) {
    var indiv = (t.woScope || 'individual') === 'individual';
    var out = [];
    ['p1', 'p2'].forEach(function (side) {
      var s = m[side];
      if (!s || s === 'TBD' || s === 'BYE') return;
      var uids = (typeof window._slotUids === 'function') ? window._slotUids(m, side).filter(Boolean) : [];
      if (indiv && uids.length > 1) {
        uids.forEach(function (u) {
          var nm = (typeof window._displayNameForUid === 'function') ? window._displayNameForUid(u, '') : '';
          out.push({ name: nm || String(u), uids: [u] });
        });
        return;
      }
      out.push({ name: s, uids: uids.length ? uids : _nameUids(t, s) });
    });
    return out;
  }

  // Exposto: é o ponto ÚNICO que decide "quem pode levar W.O. neste jogo". Testado em
  // tests/wo-individual.test.js — a régua do cânone, não um detalhe de tela.
  window._woMatchMembers = function (t, m) { return _matchMembers(t, m); };

  function _resolveCtx(t, ctx) {
    if (ctx.scope === 'match') {
      var m = _findMatchById(t, ctx.matchId);
      if (!m) return null;
      return { scope: 'match', m: m, matchId: ctx.matchId, members: _matchMembers(t, m), matches: [m], done: !!(m.winner || m.isBye || m.isSitOut) };
    }
    var matches = Array.isArray(ctx.matches) ? ctx.matches : (Array.isArray(ctx.matchIds) ? ctx.matchIds.map(function (id) { return _findMatchById(t, id); }).filter(Boolean) : []);
    var players = Array.isArray(ctx.players) ? ctx.players.slice() : [];
    var done = matches.length > 0 && matches.every(function (m) { return m.winner || m.isBye || m.isSitOut; });
    // Grupo/Liga: o pool já é de PESSOAS (players são nomes individuais) — só anexa o uid.
    var members = players.map(function (nm) { return { name: nm, uids: _nameUids(t, nm) }; });
    return { scope: 'group', roundIndex: ctx.roundIndex, groupName: ctx.groupName, members: members, players: players, matches: matches, done: done };
  }
  // Uids de TODA a gente do contexto (quem pode apontar / quem confirma). Lê o uid que o
  // alvo já carrega — resolver por nome aqui devolvia [] pra pessoa dentro de dupla.
  function _allCtxUids(t, rc) {
    var out = {};
    rc.members.forEach(function (mb) { (mb && mb.uids || []).forEach(function (u) { if (u) out[u] = 1; }); });
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

  // ─── negociação do DESFECHO (Stage 2 — project_wo_outcome_negotiation_canon) ────
  // Detector PURO (não muta): o desfecho de um claim só é NEGOCIADO quando é W.O.
  // INDIVIDUAL de dupla numa ELIMINATÓRIA — o parceiro SEGUE, então há escolha real
  // (avança / suplente / Jogador X). Devolve {partnerUid, absentUids, oppUids, oppName,
  // matchId}. null = não negocia (time / 1×1 / Liga / grupo / adversário TBD / sem uid)
  // → aplica direto na confirmação, como antes. Espelha a detecção do motor (_applyWO
  // `_cIndiv`) sem efeito colateral — serve pra escolher o fluxo E achar os atores.
  // Slot SEMPRE por uid ([[project_match_slot_uid_identity]]); a barra do nome é
  // tipografia, nunca separador ([[project_uid_identity_canon_locked]]).
  function _outcomeCtx(t, c) {
    try {
      if (!t || !c || c.scope !== 'match') return null;
      if (_isLiga(t) || _isMonarchFmt(t)) return null;
      if ((t.woScope || 'individual') !== 'individual') return null;
      var m = _findMatchById(t, c.matchId);
      if (!m || m.winner || m.isBye || m.isSitOut) return null;
      var absent = (c.absentUids || []).filter(Boolean);
      if (!absent.length) return null;              // sem uid do ausente → fallback nome, não negocia
      var side = null;
      ['p1', 'p2'].forEach(function (s) {
        var su = (typeof window._slotUids === 'function') ? window._slotUids(m, s).filter(Boolean) : [];
        if (su.length && su.some(function (u) { return absent.indexOf(u) !== -1; })) side = s;
      });
      if (!side) return null;
      var su = window._slotUids(m, side).filter(Boolean);
      if (su.length < 2) return null;               // não é dupla → sem parceiro → adversário avança direto
      if (su.every(function (u) { return absent.indexOf(u) !== -1; })) return null; // lado TODO ausente = W.O. de time
      var partnerUid = su.find(function (u) { return absent.indexOf(u) === -1; }) || null;
      if (!partnerUid) return null;
      var oppSide = side === 'p1' ? 'p2' : 'p1';
      var oppName = m[oppSide] || '';
      if (!oppName || oppName === 'TBD' || oppName === 'BYE') return null; // adversário indefinido → não negocia
      var oppUids = (typeof window._slotUids === 'function') ? window._slotUids(m, oppSide).filter(Boolean) : [];
      return { partnerUid: partnerUid, absentUids: absent, oppUids: oppUids, oppName: oppName, matchId: m.id };
    } catch (e) { return null; }
  }

  // ─── chip / botão no card ou cabeçalho do grupo ────────────────────────────────
  window._woClaimChip = function (t, ctx) {
    try {
      if (!t || !ctx) return '';
      _ctxReg[_ctxKey(ctx)] = ctx; // registra ctx fresco p/ o overlay de declarar
      var rc = _resolveCtx(t, ctx); if (!rc) return '';
      var cu = _cu(); if (!cu || !cu.uid) return '';
      var iAmPlayer = _allCtxUids(t, rc).indexOf(cu.uid) !== -1;
      var canMng = _canManage(t);
      // CANÔNICO: organizador/co-host declara W.O. SEMPRE (qualquer jogo não decidido, em
      // qualquer torneio, 1 dia ou multi-dia); participante só ACUSA quando resultEntry
      // inclui players/all. Sem gate de multi-dia. Ver [[feedback_behavior_is_pure_function_of_config]].
      var _canAccuse = iAmPlayer && _playersEnter(t);
      if (!canMng && !_canAccuse) return '';
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
        else if (claim.outcomeStage && claim.outcomeStage !== 'resolved') { label = _cpt ? '⏳ Desfecho' : '⏳ Definindo desfecho'; bg = 'rgba(99,102,241,0.14)'; col = '#a5b4fc'; bd = 'rgba(99,102,241,0.45)'; }
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

      // ── Stage 2: negociação do desfecho (project_wo_outcome_negotiation_canon) ──
      // A falta já foi confirmada; falta escolher COMO o jogo continua. O parceiro que
      // ficou PROPÕE; o adversário aceita/rejeita; sem acordo o organizador decide.
      if (claim.outcomeStage && claim.outcomeStage !== 'resolved') {
        var _pUid = claim.outcomePartnerUid;
        var _oppUids = claim.outcomeOppUids || [];
        var iAmPartner = uid && uid === _pUid;
        var iAmOpp = uid && _oppUids.indexOf(uid) !== -1;
        var _pNm = (_pUid && typeof window._displayNameForUid === 'function') ? window._displayNameForUid(_pUid, '') : '';
        var _choiceLbl = function (ch) { return ch === 'advance' ? 'Desclassificar (adversário avança)' : ch === 'waitlistSub' ? 'Puxar suplente da lista de espera' : ch === 'ghost' ? 'Jogador X (o parceiro segue)' : String(ch || ''); };
        var _proposeBtn = '<button type="button" onclick="window._woOutcomeOverlay(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\',null,\'propose\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">Propor desfecho</button>';
        var _orgDecideBtn = '<button type="button" onclick="window._woOutcomeOverlay(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\',null,\'org\')" class="btn" style="flex:1;background:rgba(99,102,241,0.14);color:#a5b4fc;border:1px solid rgba(99,102,241,0.5);font-weight:800;border-radius:10px;padding:10px;">Decidir o desfecho (org.)</button>';
        var nInfo = '<div style="font-weight:800;font-size:1.0rem;color:var(--text-bright);">🚫 ' + absDisp + ' <span style="color:var(--text-muted);font-weight:600;">faltou</span> · <span style="color:#34d399;font-weight:700;font-size:0.82rem;">falta confirmada</span></div>';
        var nAct = '';
        if (claim.outcomeStage === 'awaiting-proposal') {
          nInfo += '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">' + (iAmPartner ? 'Você ficou no jogo — proponha como ele continua.' : (_pNm ? _esc(_pNm) + ' vai propor o desfecho.' : 'O parceiro que ficou vai propor o desfecho.')) + '</div>';
          var _row = (iAmPartner ? _proposeBtn : '') + (iAmOrg ? _orgDecideBtn : '');
          nAct = _row ? '<div style="display:flex;gap:8px;margin-top:14px;">' + _row + '</div>'
            : '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">Aguardando ' + (_pNm ? _esc(_pNm) : 'o parceiro') + ' propor o desfecho…</div>';
        } else if (claim.outcomeStage === 'proposed') {
          var _prop = claim.outcomeProposal || {};
          nInfo += '<div style="margin-top:12px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.35);border-radius:12px;padding:11px 13px;"><div style="font-size:0.72rem;color:var(--text-muted);">Proposta</div><div style="font-weight:800;color:var(--text-bright);margin-top:2px;">' + _esc(_choiceLbl(_prop.choice)) + '</div></div>';
          if (iAmOpp) {
            nAct = '<div style="display:flex;gap:8px;margin-top:14px;">' +
              '<button type="button" onclick="window._woRejectOutcome(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.4);font-weight:800;border-radius:10px;padding:10px;">❌ Rejeitar</button>' +
              '<button type="button" onclick="window._woAcceptOutcome(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">✅ Aceitar</button>' +
            '</div>';
          } else {
            nAct = '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">Aguardando o adversário aceitar…</div>';
          }
          if (iAmOrg && !iAmOpp) nAct += '<div style="display:flex;gap:8px;margin-top:8px;">' + _orgDecideBtn + '</div>';
        } else if (claim.outcomeStage === 'escalated') {
          nInfo += '<div style="margin-top:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:12px;text-align:center;"><div style="font-weight:900;color:#f87171;">⚖️ Sem acordo</div><div style="font-size:0.82rem;color:var(--text-bright);margin-top:3px;">O organizador decide o desfecho.</div></div>';
          nAct = iAmOrg ? '<div style="display:flex;gap:8px;margin-top:14px;">' + _orgDecideBtn + '</div>'
            : '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">O organizador vai decidir o desfecho…</div>';
        }
        _overlay(_header('Desfecho do W.O.') + '<div style="padding:1.1rem;">' + nInfo + nAct + '</div>');
        return;
      }

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
    // Um botão por ALVO. No W.O. individual de duplas isso são as 4 PESSOAS do jogo (não os
    // 2 lados): o organizador aponta uma por vez — podendo, no limite, as duas da mesma dupla
    // levarem W.O., mas cada uma por escolha. O uid viaja junto (é ele que identifica).
    var picks = rc.members.map(function (mb) {
      var _u = (mb.uids || [])[0] || '';
      return '<button type="button" onclick="window._woDeclare(\'' + _attr(t.id) + '\',\'' + _attr(ctxKey) + '\',\'' + _attr(mb.name) + '\',\'' + _attr(_u) + '\')" class="btn hover-lift" style="display:block;width:100%;text-align:left;margin-bottom:8px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:var(--text-bright);font-weight:700;border-radius:11px;padding:11px 13px;font-size:0.92rem;">🚫 ' + _esc(mb.name) + '</button>';
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
  // absentUid: o uid da PESSOA apontada (vem do botão do picker). É a identidade real do
  // alvo — `_nameUids` só serve de rede pro fictício/legado (sem conta, o nome é tudo que há).
  window._woDeclare = function (tId, ctxKey, absentName, absentUid) {
    var t = _findT(tId); if (!t) return;
    var ctx = _ctxReg[ctxKey]; if (!ctx) return;
    var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) { if (typeof showNotification === 'function') showNotification('Entre para apontar', '', 'warning'); return; }
    if (_allCtxUids(t, rc).indexOf(cu.uid) === -1 && !_canManage(t)) { if (typeof showNotification === 'function') showNotification('Só os jogadores', 'Só quem joga (ou o organizador) pode apontar.', 'warning'); return; }
    var c = {
      id: 'wo_' + Date.now() + '_' + _rand(),
      scope: rc.scope,
      byUid: cu.uid, byName: cu.displayName || _voterName(t, cu.uid) || '',
      absentName: absentName, absentUids: absentUid ? [String(absentUid)] : _nameUids(t, absentName),
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

  // Stage 2: um PARTICIPANTE confirmou a falta → NÃO decide o jogo. Entra em
  // 'awaiting-proposal': o parceiro que ficou (_pUid) propõe o desfecho, o adversário
  // (_oppUids) aceita/rejeita. A ausência só é marcada quando o desfecho é aplicado.
  function _woEnterNegotiation(tId, claimId, confirmerUid, nctx) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c) return;
    var data = _notifData(t, '🤝 Proponha o desfecho', 'A falta de "' + c.absentName + '" foi confirmada em "' + (t.name || '') + '". Escolha como o seu jogo continua — o adversário confirma.');
    _commit(tId, function (ft) {
      var c2 = _claimById(ft, claimId); if (!c2 || c2.status !== 'pending' || c2.outcomeStage) return false; // idempotente
      c2.confirms = c2.confirms || {}; if (confirmerUid) c2.confirms[confirmerUid] = true;
      c2.factConfirmed = true;
      c2.outcomeStage = 'awaiting-proposal';
      c2.outcomePartnerUid = nctx.partnerUid;
      c2.outcomeOppUids = nctx.oppUids || [];
    }, function () {
      _notify(t, [nctx.partnerUid], data);
      window._woOpenClaim(tId, _ctxKey(_ctxFromClaim(c)));
    }, 'Confirmando a falta…');
  }

  window._woConfirm = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c || c.status !== 'pending') return;
    var ctx = _ctxFromClaim(c); var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var canConfirm = _confirmerUids(t, rc, c).indexOf(cu.uid) !== -1 || _isOrg(t);
    if (!canConfirm) { if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só o outro lado (ou o organizador) confirma.', 'warning'); return; }
    // Stage 2 (project_wo_outcome_negotiation_canon): confirmar a FALTA não decide mais o
    // jogo sozinho em W.O. INDIVIDUAL de dupla — o desfecho é negociado. Só quando quem
    // confirma é um PARTICIPANTE; o organizador confirmando cai direto no fluxo de
    // resolução dele (Stage 1: overlay das opções). Sem negociação (time / 1×1 / Liga /
    // adversário TBD) = aplica direto na confirmação, como antes.
    var nctx = _outcomeCtx(t, c);
    var iAmPlayer = _allCtxUids(t, rc).indexOf(cu.uid) !== -1;
    if (nctx && iAmPlayer) { _woEnterNegotiation(tId, claimId, cu.uid, nctx); return; }
    if (nctx && _isOrg(t)) { _applyClaimViaGate(tId, claimId, cu.uid, true); return; }
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
      var _prevStatus = c2.status;
      if (confirmerUid) { c2.confirms = c2.confirms || {}; c2.confirms[confirmerUid] = true; }
      c2.status = 'applied'; c2.resolvedAt = new Date().toISOString();
      if (ligaGroup) return; // aplicação real via _ligaPickFill (interativo, no onDone)
      var rc2 = _resolveCtx(ft, _ctxFromClaim(c2)); if (!rc2) { if (applied === undefined) applied = { ok: false, reason: 'contexto perdido' }; return false; }
      var ap = _applyClaim(ft, c2, rc2, orgResolve ? { offerOutcomeChoice: true } : {});
      if (applied === undefined) applied = ap;
      if (ap.ok && ap.needsOutcomeChoice) {
        // Stage 1 (project_wo_outcome_negotiation_canon): desfecho a escolher — NÃO
        // persiste (nem 'applied' nem ausência). O organizador escolhe no overlay (abre
        // no onDone) e a escolha re-aplica de verdade. Aborta a txn mantendo o claim.
        c2.status = _prevStatus; c2.resolvedAt = null;
        if (confirmerUid) { try { delete c2.confirms[confirmerUid]; } catch (e) {} }
        return false;
      }
      if (!ap.ok) { c2.status = orgResolve ? c2.status : 'pending'; if (confirmerUid) { try { delete c2.confirms[confirmerUid]; } catch (e) {} } return false; }
    }, function () {
      if (ligaGroup) {
        _notify(t, c.absentUids, _notifData(t, '🚫 W.O. registrado', 'Você foi marcado como ausente em "' + (t.name || '') + '".'));
        window._woCloseOverlay();
        if (typeof window._ligaPickFill === 'function') window._ligaPickFill(String(t.id), c.roundIndex, c.groupName, c.absentName);
        return;
      }
      if (applied && applied.needsOutcomeChoice) {
        // Stage 1: eliminatória individual — o organizador escolhe o desfecho.
        window._woCloseOverlay();
        if (typeof window._woOutcomeOverlay === 'function') window._woOutcomeOverlay(String(t.id), claimId, applied);
        return;
      }
      if (applied && applied.ok) {
        _notify(t, c.absentUids, _notifData(t, '🚫 W.O. registrado', 'Você foi marcado como ausente em "' + (t.name || '') + '". ' + (applied.note || '')));
        window._woCloseOverlay();
        // Nenhum suplente presente atende a categoria → o organizador escolhe (dialog).
        if (applied.needsSubChoice && _canManage(t)) { window._woShowSubChoiceDialog(String(t.id)); return; }
        if (applied.needsSubChoice) { if (typeof showNotification === 'function') showNotification('⏳ Aguardando o organizador', 'Nenhum suplente presente atende a categoria — o organizador vai definir.', 'info'); return; }
        if (typeof showNotification === 'function') showNotification('✅ W.O. aplicado', applied.note || '', 'success');
      } else if (applied) {
        if (typeof showNotification === 'function') showNotification('Não aplicou', applied.reason || (orgResolve ? '' : 'Tente pelo painel do organizador.'), 'warning');
      }
    }, 'Aplicando o W.O.…');
  }

  // ─── ESCOLHA DE SUPLENTE quando NENHUM presente atende a categoria ─────────────
  // Só o organizador. Lê t.woSubChoices (marcado pelo motor quando o único suplente
  // presente quebraria a categoria — gênero/idade/skill/custom). Para cada pendência,
  // mostra as opções (aceitar um suplente que quebra a regra) OU dar W.O. ao time.
  // Nome resolvido por UID (o rótulo pode estar velho). Ver [[project_wo_individual_substitution_rule]].
  function _pendingSubChoices(t) {
    return (Array.isArray(t.woSubChoices) ? t.woSubChoices : []).filter(function (x) { return x && !x.resolved; });
  }
  function _nameOfUid(t, uid, fallback) {
    var n = (typeof window._displayNameForUid === 'function') ? window._displayNameForUid(uid, '') : '';
    return n || fallback || String(uid || '?');
  }
  window._woShowSubChoiceDialog = function (tId) {
    var t = _findT(tId); if (!t) return;
    if (!_canManage(t)) { if (typeof showNotification === 'function') showNotification('Só o organizador', 'Só o organizador resolve a substituição que quebra a categoria.', 'warning'); return; }
    var pend = _pendingSubChoices(t);
    if (!pend.length) { window._woCloseOverlay(); return; }
    var gc = pend[0]; // um de cada vez
    var absN = _nameOfUid(t, gc.absentUid, gc.absentName);
    var catTxt = (gc.absentCategories && gc.absentCategories.length) ? gc.absentCategories.join(', ') : '';
    var opts = (gc.options || []).map(function (o) {
      var nm = _nameOfUid(t, o.uid, o.name);
      var oc = (o.categories && o.categories.length) ? o.categories.join(', ') : (o.gender || '');
      return '<button type="button" onclick="window._woResolveSubChoiceUI(\'' + _attr(t.id) + '\',\'' + _attr(gc.absentUid) + '\',\'' + _attr(o.uid) + '\')" class="btn hover-lift" style="display:block;width:100%;text-align:left;margin-bottom:8px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.4);color:var(--text-bright);font-weight:700;border-radius:11px;padding:11px 13px;font-size:0.9rem;">⚠️ ' + _esc(nm) + (oc ? ' <span style="font-weight:500;opacity:0.7;font-size:0.8rem;">(' + _esc(oc) + ')</span>' : '') + '<br><span style="font-weight:400;font-size:0.76rem;opacity:0.7;">Entra quebrando a categoria' + (catTxt ? ' ' + _esc(catTxt) : '') + '.</span></button>';
    }).join('');
    var woTeam = '<button type="button" onclick="window._woResolveSubChoiceUI(\'' + _attr(t.id) + '\',\'' + _attr(gc.absentUid) + '\',\'\')" class="btn" style="display:block;width:100%;text-align:left;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;font-weight:700;border-radius:11px;padding:11px 13px;font-size:0.9rem;">🚫 Dar W.O. ao time<br><span style="font-weight:400;font-size:0.76rem;opacity:0.7;">Ninguém assume — o adversário vence.</span></button>';
    _overlay(_header('Substituto quebra a categoria') +
      '<div style="padding:1.1rem;">' +
        '<div style="font-size:0.86rem;color:var(--text-muted);margin-bottom:12px;line-height:1.5;"><b style="color:var(--text-bright);">' + _esc(absN) + '</b>' + (catTxt ? ' (' + _esc(catTxt) + ')' : '') + ' faltou, e nenhum suplente presente atende a categoria. Escolha quem assume — ou dê W.O. ao time.</div>' +
        opts + woTeam +
      '</div>');
  };
  // aplica a escolha do organizador: subUid vazio = W.O. ao time (marca resolvido e escala).
  window._woResolveSubChoiceUI = function (tId, absentUid, subUid) {
    var t = _findT(tId); if (!t) return;
    if (subUid) {
      // aceite explícito: o motor coloca o suplente (pulando o filtro de categoria)
      _commit(tId, function (ft) {
        if (typeof window._woResolveSubChoice === 'function') window._woResolveSubChoice(String(ft.id), absentUid, subUid);
      }, function () {
        window._woCloseOverlay();
        if (typeof showNotification === 'function') showNotification('✅ Substituto definido', _nameOfUid(t, subUid, '') + ' assumiu a vaga.', 'success');
        var t2 = _findT(tId); if (t2 && _pendingSubChoices(t2).length) window._woShowSubChoiceDialog(tId); // próxima pendência
      }, 'Aplicando a substituição…');
    } else {
      // W.O. ao time: marca a pendência resolvida e re-roda o W.O. pra escalar (sem sub).
      _commit(tId, function (ft) {
        if (Array.isArray(ft.woSubChoices)) ft.woSubChoices.forEach(function (x) { if (x.absentUid === absentUid) x.resolved = true; });
        // limpa o check-in do(s) suplente(s) daquela pendência pra não re-disparar, e escala:
        var gc = (Array.isArray(ft.woSubChoices) ? ft.woSubChoices : []).find(function (x) { return x.absentUid === absentUid; });
        var absName = (gc && gc.absentName) || (typeof window._memberNameByUid === 'function' ? window._memberNameByUid(ft, absentUid) : '') || absentUid;
        if (typeof window._applyWO === 'function') window._applyWO(ft, { absentName: absName, absentUids: [absentUid], scope: 'match', noSubBehavior: 'escalate', woScope: ft.woScope || 'individual', _forceNoSub: true });
      }, function () {
        window._woCloseOverlay();
        if (typeof showNotification === 'function') showNotification('🚫 W.O. ao time', 'Ninguém assumiu a vaga — o adversário venceu.', 'warning');
        var t2 = _findT(tId); if (t2 && _pendingSubChoices(t2).length) window._woShowSubChoiceDialog(tId);
      }, 'Registrando o W.O.…');
    }
  };

  // ─── APLICAÇÃO do W.O. — funil no motor único _applyWO (participants.js) ────────
  function _applyClaim(t, c, rc, xopts) {
    xopts = xopts || {};
    try {
      // Motor ÚNICO de W.O. (participants.js) — funil canônico. O claim é o
      // gatilho fino: já validou permissão/consenso; aqui só aplica. Sem lista
      // não-vazia + ninguém presente, o claim ESCALA (o consenso já resolveu que
      // faltou) — por isso noSubBehavior:'escalate' (o organizador usa 'wait').
      // Stage 1 (project_wo_outcome_negotiation_canon): offerOutcomeChoice faz o
      // motor devolver 'needsOutcomeChoice' (o organizador escolhe o desfecho);
      // outcomeChoice executa a escolha (advance / waitlistSub / ghost).
      if (typeof window._applyWO !== 'function') return { ok: false, reason: 'motor de W.O. indisponível' };
      var r = window._applyWO(t, {
        absentName: c.absentName,
        absentUids: c.absentUids,
        scope: rc.scope,
        matches: rc.matches,
        roundIndex: c.roundIndex,
        groupName: c.groupName,
        noSubBehavior: 'escalate',
        offerOutcomeChoice: !!xopts.offerOutcomeChoice,
        outcomeChoice: xopts.outcomeChoice || null
      });
      if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'não aplicou' };
      var note = r.outcome === 'ligaDelegated' ? (r.note || 'Escolha o substituto (folga / Jogador X).')
        : r.outcome === 'subbed' ? 'Substituto da lista de espera entrou no lugar.'
        : r.outcome === 'needsSubChoice' ? 'Nenhum suplente presente atende a categoria — escolha o substituto.'
        : r.outcome === 'ghostApplied' ? 'Jogador X entrou — o parceiro segue no jogo.'
        : r.outcome === 'woApplied' ? 'Adversário venceu por W.O.'
        : r.outcome === 'waitedTBD' ? 'Ausência registrada — adversário ainda não definido.'
        : '';
      return { ok: true, outcome: r.outcome, note: note, needsSubChoice: r.outcome === 'needsSubChoice',
        needsOutcomeChoice: r.outcome === 'needsOutcomeChoice',
        partnerUid: r.partnerUid, oppName: r.oppName, matchId: r.matchId, matchNum: r.matchNum };
    } catch (e) {
      try { console.error('[wo-claim] apply falhou:', e); } catch (_e) {}
      return { ok: false, reason: (e && e.message) || 'erro ao aplicar' };
    }
  }

  // ─── DESFECHO do W.O. (Stage 1) — o organizador escolhe como resolver o jogo ─────
  // project_wo_outcome_negotiation_canon. Só eliminatória INDIVIDUAL (o motor devolve
  // needsOutcomeChoice). 3 opções: suplente da espera (se houver presente) · Jogador X
  // (parceiro segue) · desclassificar (adversário avança). Convidar-folga = Stage 2.
  // mode: 'org' (default) = o organizador escolhe e APLICA na hora (_woChooseOutcome);
  //       'propose' = o PARCEIRO que ficou PROPÕE (_woProposeOutcome), sem aplicar.
  window._woOutcomeOverlay = function (tId, claimId, ctx, mode) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c) return;
    mode = mode || 'org';
    var cu = _cu();
    if (mode === 'propose') {
      if (!(cu && cu.uid && cu.uid === c.outcomePartnerUid) && !_canManage(t)) return;
    } else if (!_canManage(t)) { return; }
    ctx = ctx || {};
    // ctx pode vir vazio (aberto pelo card) — completa pelo claim / re-derivação pura.
    var _octx = (ctx.partnerUid || ctx.oppName) ? ctx : (_outcomeCtx(t, c) || ctx);
    var _pUid = _octx.partnerUid || c.outcomePartnerUid || null;
    var partnerName = (_pUid && typeof window._displayNameForUid === 'function') ? window._displayNameForUid(_pUid, '') : '';
    var absDisp = _esc(c.absentName || ctx.absentName || 'ausente');
    var oppDisp = _esc(_octx.oppName || '');
    var pool = (typeof window._getStandbyPool === 'function') ? (window._getStandbyPool(t) || []) : [];
    var hasPresentSub = pool.some(function (p) {
      var ci = (typeof window._idMapGet === 'function') ? window._idMapGet(t, t.checkedIn || {}, p) : null;
      return typeof ci === 'number' ? ci > 0 : !!ci;
    });
    var _handler = mode === 'propose' ? 'window._woProposeOutcome' : 'window._woChooseOutcome';
    var _btn = function (choice, bg, col, bd, label, sub) {
      return '<button type="button" onclick="' + _handler + '(\'' + _attr(t.id) + '\',\'' + _attr(claimId) + '\',\'' + choice + '\')" class="btn hover-lift" style="display:block;width:100%;text-align:left;margin-bottom:10px;background:' + bg + ';border:1px solid ' + bd + ';color:' + col + ';font-weight:800;border-radius:12px;padding:12px 14px;">' + label +
        '<div style="font-weight:600;font-size:0.72rem;color:var(--text-muted);margin-top:3px;">' + sub + '</div></button>';
    };
    var _lead = mode === 'propose'
      ? 'Você ficou no jogo — proponha como ele continua. O adversário aceita, ou o organizador decide.'
      : 'Como resolver o jogo' + (partnerName ? ' de <b style="color:#fbbf24;">' + _esc(partnerName) + '</b>' : '') + '?';
    var body = '<div style="padding:1.1rem;">' +
      '<div style="font-weight:800;font-size:1.0rem;color:var(--text-bright);">🚫 ' + absDisp + ' <span style="color:var(--text-muted);font-weight:600;">faltou</span></div>' +
      '<div style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 14px;">' + _lead + '</div>' +
      (hasPresentSub ? _btn('waitlistSub', 'rgba(16,185,129,0.10)', '#34d399', 'rgba(16,185,129,0.45)', '🔁 Puxar suplente da lista de espera', 'O próximo da fila (presente) assume, respeitando a regra do torneio.') : '') +
      _btn('ghost', 'rgba(99,102,241,0.10)', '#a5b4fc', 'rgba(99,102,241,0.45)', '👤 Jogador X (o parceiro segue)', (partnerName ? _esc(partnerName) : 'O parceiro') + ' continua no torneio com um jogador placeholder.') +
      _btn('advance', 'rgba(239,68,68,0.10)', '#f87171', 'rgba(239,68,68,0.45)', '🏳️ Desclassificar — adversário avança', (oppDisp ? oppDisp + ' avança' : 'O adversário avança') + ' por W.O.') +
      // Canon (dono, jul/2026): ELIMINATÓRIA não tem folga/sit-out — só lista de espera. Sit-out
      // existe só em formato que SORTEIA a rodada (Liga/Suíço/Rei-Rainha) e na elim que ABRE com
      // rodada Rei/Rainha (tratado no caminho de round-drawing, não neste overlay de chave). Então
      // aqui o desfecho é só suplente / Jogador X / desclassificar — nunca "convidar folga".
      '</div>';
    _overlay(_header(mode === 'propose' ? 'Proponha o desfecho' : 'Como resolver o W.O.?') + body);
  };

  // núcleo compartilhado: aplica o desfecho escolhido (organizador OU adversário que
  // aceitou a proposta) atomicamente pelo portão. Sem gate próprio — cada chamador valida.
  function _applyOutcome(tId, claimId, choice) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c) return;
    var applied;
    _commit(tId, function (ft) {
      var c2 = _claimById(ft, claimId); if (!c2) return false;
      if (c2.status === 'applied' || c2.status === 'cancelled') return false;
      var rc2 = _resolveCtx(ft, _ctxFromClaim(c2)); if (!rc2) return false;
      var ap = _applyClaim(ft, c2, rc2, { outcomeChoice: choice });
      if (applied === undefined) applied = ap;
      if (!ap.ok) return false;
      c2.status = 'applied'; c2.resolvedAt = new Date().toISOString(); c2.outcomeStage = 'resolved';
    }, function (okSave) {
      window._woCloseOverlay();
      if (okSave && applied && applied.ok) {
        if (applied.needsSubChoice && _canManage(t)) { if (typeof window._woShowSubChoiceDialog === 'function') window._woShowSubChoiceDialog(String(t.id)); return; }
        if (applied.needsSubChoice) { if (typeof showNotification === 'function') showNotification('⏳ Aguardando o organizador', 'Nenhum suplente presente atende a categoria — o organizador vai definir.', 'info'); return; }
        var aud = (c.absentUids || []).concat(c.outcomePartnerUid ? [c.outcomePartnerUid] : []).concat(c.outcomeOppUids || []);
        _notify(t, aud, _notifData(t, '🚫 W.O. resolvido', (applied.note || '') + ' — ' + (t.name || '')));
        if (typeof showNotification === 'function') showNotification('✅ W.O. resolvido', applied.note || '', 'success');
      } else if (typeof showNotification === 'function') {
        showNotification('Não aplicou', (applied && applied.reason) || 'Tente de novo.', 'warning');
      }
    }, 'Aplicando o desfecho…');
  }

  window._woChooseOutcome = function (tId, claimId, choice) {
    var t = _findT(tId); if (!t || !_canManage(t)) return;
    _applyOutcome(tId, claimId, choice);
  };

  // Stage 2 — o PARCEIRO que ficou propõe o desfecho (via overlay em modo 'propose').
  window._woProposeOutcome = function (tId, claimId, choice) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    if (cu.uid !== c.outcomePartnerUid && !_canManage(t)) { if (typeof showNotification === 'function') showNotification('Só o parceiro propõe', 'Quem ficou no jogo escolhe como ele continua.', 'warning'); return; }
    var data = _notifData(t, '🤝 Desfecho proposto', 'Uma forma de resolver a falta de "' + c.absentName + '" em "' + (t.name || '') + '" foi proposta. Aceite ou rejeite.');
    _commit(tId, function (ft) {
      var c2 = _claimById(ft, claimId); if (!c2 || c2.outcomeStage !== 'awaiting-proposal') return false;
      c2.outcomeProposal = { choice: choice, byUid: cu.uid, at: new Date().toISOString() };
      c2.outcomeStage = 'proposed';
    }, function () {
      _notify(t, c.outcomeOppUids || [], data);
      window._woCloseOverlay();
      window._woOpenClaim(tId, _ctxKey(_ctxFromClaim(c)));
    }, 'Registrando a proposta…');
  };

  // Stage 2 — o ADVERSÁRIO aceita a proposta → aplica o desfecho.
  window._woAcceptOutcome = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c || c.outcomeStage !== 'proposed') return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var isOpp = (c.outcomeOppUids || []).indexOf(cu.uid) !== -1;
    if (!isOpp && !_canManage(t)) { if (typeof showNotification === 'function') showNotification('Só o adversário aceita', 'Quem enfrenta a dupla aceita ou rejeita a proposta.', 'warning'); return; }
    var choice = c.outcomeProposal && c.outcomeProposal.choice; if (!choice) return;
    _applyOutcome(tId, claimId, choice);
  };

  // Stage 2 — o ADVERSÁRIO rejeita → sem acordo, escala pro organizador decidir.
  window._woRejectOutcome = function (tId, claimId) {
    var t = _findT(tId); if (!t) return;
    var c = _claimById(t, claimId); if (!c || c.outcomeStage !== 'proposed') return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    var isOpp = (c.outcomeOppUids || []).indexOf(cu.uid) !== -1;
    if (!isOpp && !_canManage(t)) { if (typeof showNotification === 'function') showNotification('Só o adversário', 'Quem enfrenta a dupla aceita ou rejeita a proposta.', 'warning'); return; }
    var data = _notifData(t, '⚖️ Desfecho do W.O. sem acordo', 'O adversário rejeitou a proposta pra falta de "' + c.absentName + '" em "' + (t.name || '') + '". Você decide o desfecho.');
    _commit(tId, function (ft) {
      var c2 = _claimById(ft, claimId); if (!c2 || c2.outcomeStage !== 'proposed') return false;
      c2.outcomeStage = 'escalated'; c2.outcomeRejectedByUid = cu.uid;
    }, function () {
      if (typeof window._notifyOrgAndCoHosts === 'function') window._notifyOrgAndCoHosts(t, data);
      else _notify(t, t.creatorUid ? [t.creatorUid] : [], data);
      window._woCloseOverlay();
      window._woOpenClaim(tId, _ctxKey(_ctxFromClaim(c)));
    }, 'Registrando a rejeição…');
  };
})();
