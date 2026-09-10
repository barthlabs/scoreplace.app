/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
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
  //  Function transacional: a tela só envia intenção e repinta a resposta.)
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
  // v1.7.23 — NOME → UID POR FONTE ESTRUTURAL, nunca por `t.participants`.
  // `_nameUids` (acima) procura o nome em `t.participants`, e em torneio real isso
  // devolve [] pra TODO mundo: o save stripa o nome de toda entrada cujo uid resolve
  // (medido no Confra: 111 inscritos, 111 com uid, ZERO com nome). Era dele que saíam os
  // `members` do contexto de GRUPO — e daí o `_allCtxUids` e o `absentUids` do claim, que
  // em produção ficou VAZIO nos dois W.O. do Confra (`"absentUids": []`), deixando quem
  // levou o W.O. sem identidade.
  // Ordem das fontes: elenco do grupo (players[i] ↔ playersUids[i], o par que o sorteio
  // grava) → slot dos jogos (team*Uids / p*Uid) → `_nameUids` como última rede, que só
  // acerta pro FICTÍCIO ou doc legado — quem não tem conta só tem nome mesmo.
  // O escopo de JOGO já era uid-safe (`_matchMembers` usa `_slotUids`); o buraco era o
  // de grupo. Ver [[project_uid_identity_canon_locked]] e [[project_match_slot_uid_identity]].
  function _ctxUidsFor(t, ctx, matches, name) {
    if (!t || !name || name === 'TBD' || name === 'BYE') return [];
    // v1.7.66 — o uid GRAVADO no claim vem primeiro. Ele é o único que sobrevive a
    // alguém trocar o displayName: as buscas abaixo todas dependem de casar o NOME
    // (g.players.indexOf, team1.indexOf), e nome trocado não casa com mais nada.
    if (ctx && Array.isArray(ctx.playerUids) && Array.isArray(ctx.players)) {
      var _ip = ctx.players.indexOf(name);
      if (_ip >= 0 && ctx.playerUids[_ip]) return [String(ctx.playerUids[_ip])];
    }
    var r = (t.rounds || [])[(ctx && ctx.roundIndex) || 0];
    var g = (r && Array.isArray(r.monarchGroups) && ctx && ctx.groupName)
      ? r.monarchGroups.filter(function (x) { return x && x.name === ctx.groupName; })[0] : null;
    if (g && Array.isArray(g.players)) {
      var i = g.players.indexOf(name);
      var u = (i >= 0 && Array.isArray(g.playersUids)) ? g.playersUids[i] : null;
      if (u) return [String(u)];
      if (g.woAbsent === name && g.woAbsentUid) return [String(g.woAbsentUid)];
    }
    var found = null;
    (matches || []).forEach(function (m) {
      if (!m || found) return;
      ['team1', 'team2'].forEach(function (side) {
        if (found) return;
        var arr = m[side], uarr = m[side + 'Uids'];
        if (!Array.isArray(arr) || !Array.isArray(uarr)) return;
        var k = arr.indexOf(name);
        if (k >= 0 && uarr[k]) found = String(uarr[k]);
      });
      if (!found && m.p1 === name && m.p1Uid) found = String(m.p1Uid);
      if (!found && m.p2 === name && m.p2Uid) found = String(m.p2Uid);
    });
    return found ? [found] : _nameUids(t, name);
  }
  function _voterName(t, u) { return (typeof window._opVoterName === 'function') ? window._opVoterName(t, u) : ''; }

  // NOME DE EXIBIÇÃO CANÔNICO: perfil vivo pelo uid; o rótulo gravado é SÓ reserva
  // (fictício sem uid, ou claim antigo em que o uid não foi gravado — em produção os
  // dois W.O. do Confra ficaram com `absentUids: []`). Regra do dono, 13/ago: "nada de
  // nome gravado nunca" — foi assim que "Fabi2401@" apareceu no lugar de "Dani Bataglia"
  // depois que ela trocou o nome no perfil. [[project_uid_identity_canon_locked]]
  function _liveNome(u, gravado) {
    var vivo = (u && typeof window._displayNameForUid === 'function')
      ? window._displayNameForUid(u, '') : '';
    return vivo || gravado || '';
  }

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
    var members = players.map(function (nm) { return { name: nm, uids: _ctxUidsFor(t, ctx, matches, nm) }; });
    // v1.7.66 — os uids viajam JUNTO com os nomes, na mesma ordem. `players` é um
    // snapshot de NOMES e nome ENVELHECE: quem troca o displayName depois some do
    // `g.players.indexOf(name)` e o apontamento perde a identidade da pessoa. Vazio na
    // posição de quem não tem conta — ali o nome é a identidade (ressalva do dono).
    var playerUids = members.map(function (mb) { return (mb && mb.uids && mb.uids[0]) ? String(mb.uids[0]) : ''; });
    return { scope: 'group', roundIndex: ctx.roundIndex, groupName: ctx.groupName, members: members, players: players, playerUids: playerUids, matches: matches, done: done };
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
    return { scope: 'group', roundIndex: c.roundIndex, groupName: c.groupName, matchIds: c.matchIds, players: c.players, playerUids: c.playerUids };
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
        return '<button type="button" class="btn ' + _sz + ' hover-lift" onclick="' + open + '" style="display:inline-flex;align-items:center;gap:5px;background:' + window._spCor(bg, 'background') + ';border:1px solid ' + window._spCor(bd, 'borda') + ';color:' + window._spCor(col, 'color') + ';font-weight:800;font-size:' + _fs + ';border-radius:8px;padding:' + (_cpt ? '3px 8px' : '4px 10px') + ';flex-shrink:0;">' + label + '</button>';
      }
      if (rc.done) return '';
      if (!iAmPlayer && !canMng) return '';
      // 2.0.20: o RÓTULO é do sistema, não desta tela — `_woBtnHtml` monta o canônico
      // "Aplicar / W.O." em duas linhas ([[project_wo_button_standard]]). Aqui sobrou só
      // o gatilho. O fluxo de confirmação cruzada segue igual quando se aponta OUTRA
      // pessoa; apontar A SI MESMO vale na hora ([[project_wo_participant_claim]]).
      var _label = (typeof window._woDeclareLabel === 'function') ? window._woDeclareLabel() : 'Aplicar<br>W.O.';
      return window._woBtnHtml ? window._woBtnHtml(open, true, { title: 'Não vai dar pra jogar? Aponte a falta. Se for você mesmo, o W.O. vale na hora; apontando outra pessoa, o outro lado confirma.', size: _sz, fontSize: _fs })
        : '<button type="button" class="btn ' + _sz + ' btn-danger" onclick="' + open + '" style="font-size:' + _fs + ';border-radius:8px;line-height:1.08;">' + _label + '</button>';
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
      '<button type="button" onclick="window._woCloseOverlay()" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:5px;background:var(--sp-g-255-255-255-015,rgba(255,255,255,0.15));color:#fff;border:1px solid var(--sp-b-255-255-255-025,rgba(255,255,255,0.25));font-weight:700;">‹ Voltar</button>' +
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
      // nome vivo pelo uid; o gravado é só reserva (o claim de produção às vezes tem
      // `absentUids: []` — ver o comentário lá em cima —, e fictício não tem uid nenhum)
      var absDisp = _esc(_liveNome((claim.absentUids || [])[0], claim.absentName));

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
        var _orgDecideBtn = '<button type="button" onclick="window._woOutcomeOverlay(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\',null,\'org\')" class="btn" style="flex:1;background:rgba(99,102,241,0.14);color:var(--sp-c-a5b4fc,#a5b4fc);border:1px solid rgba(99,102,241,0.5);font-weight:800;border-radius:10px;padding:10px;">Decidir o desfecho (org.)</button>';
        var nInfo = '<div style="font-weight:800;font-size:1.0rem;color:var(--text-bright);">🚫 ' + absDisp + ' <span style="color:var(--text-muted);font-weight:600;">faltou</span> · <span style="color:var(--sp-c-34d399,#34d399);font-weight:700;font-size:0.82rem;">falta confirmada</span></div>';
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
              '<button type="button" onclick="window._woRejectOutcome(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(239,68,68,0.12);color:var(--sp-c-f87171,#f87171);border:1px solid rgba(239,68,68,0.4);font-weight:800;border-radius:10px;padding:10px;">❌ Rejeitar</button>' +
              '<button type="button" onclick="window._woAcceptOutcome(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">✅ Aceitar</button>' +
            '</div>';
          } else {
            nAct = '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">Aguardando o adversário aceitar…</div>';
          }
          if (iAmOrg && !iAmOpp) nAct += '<div style="display:flex;gap:8px;margin-top:8px;">' + _orgDecideBtn + '</div>';
        } else if (claim.outcomeStage === 'escalated') {
          nInfo += '<div style="margin-top:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:12px;text-align:center;"><div style="font-weight:900;color:var(--sp-c-f87171,#f87171);">⚖️ Sem acordo</div><div style="font-size:0.82rem;color:var(--text-bright);margin-top:3px;">O organizador decide o desfecho.</div></div>';
          nAct = iAmOrg ? '<div style="display:flex;gap:8px;margin-top:14px;">' + _orgDecideBtn + '</div>'
            : '<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);text-align:center;">O organizador vai decidir o desfecho…</div>';
        }
        _overlay(_header('Desfecho do W.O.') + '<div style="padding:1.1rem;">' + nInfo + nAct + '</div>');
        return;
      }

      // ⚠️ ORDEM INVERTIDA antes: lia `claim.byName` (GRAVADO) primeiro e só caía no
      // resolvedor por uid se ele faltasse — ou seja o nome vivo nunca era usado quando
      // havia rótulo gravado, que é exatamente o caso de quem trocou o nome no perfil.
      var byDisp = _esc(_liveNome(claim.byUid, '') || _voterName(t, claim.byUid) || claim.byName || 'Alguém');
      var info = '<div style="font-weight:800;font-size:1.0rem;color:var(--text-bright);">🚫 ' + absDisp + ' <span style="color:var(--text-muted);font-weight:600;">faltou</span></div>' +
        '<div style="font-size:0.74rem;color:var(--text-muted);margin-top:3px;">Apontado por ' + byDisp + (rc.scope === 'group' ? ' · grupo ' + _esc(rc.groupName || '') : '') + '. ' +
        (claim.selfDeclared ? 'O próprio jogador avisou — não precisa de confirmação.' : 'O W.O. só vale quando o outro lado confirma.') + '</div>';
      var actions = '';
      if (claim.status === 'disputed') {
        info += '<div style="margin-top:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:12px;text-align:center;"><div style="font-weight:900;color:var(--sp-c-f87171,#f87171);">⚠️ Contestado</div><div style="font-size:0.82rem;color:var(--text-bright);margin-top:3px;">O organizador decide.</div></div>';
        if (iAmOrg) {
          // Contestado: o organizador DECIDE — Reverter (azul, derruba o apontamento
          // avisando todos) à esquerda de Aplicar W.O. (org.).
          actions = '<div style="display:flex;gap:8px;margin-top:14px;">' +
            '<button type="button" onclick="window._woResolveDiscard(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(59,130,246,0.12);color:var(--sp-c-60a5fa,#60a5fa);border:1px solid rgba(59,130,246,0.5);font-weight:800;border-radius:10px;padding:10px;">↩️ Reverter</button>' +
            '<button type="button" onclick="window._woResolveApply(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">Aplicar W.O. (org.)</button>' +
          '</div>';
        }
      } else if (iCanConfirm) {
        // "Os demais" (o outro lado): Cancelar (NEGA o W.O. → vira contestado, o
        // organizador decide) à esquerda + Confirmar à direita.
        actions = '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button type="button" onclick="window._woContest(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(239,68,68,0.12);color:var(--sp-c-f87171,#f87171);border:1px solid rgba(239,68,68,0.4);font-weight:800;border-radius:10px;padding:10px;">Cancelar</button>' +
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
          _rowBtns += '<button type="button" onclick="window._woCancel(\'' + _attr(t.id) + '\',\'' + _attr(claim.id) + '\')" class="btn" style="flex:1;background:rgba(59,130,246,0.12);color:var(--sp-c-60a5fa,#60a5fa);border:1px solid rgba(59,130,246,0.5);font-weight:800;border-radius:10px;padding:9px;font-size:0.8rem;">↩️ Reverter</button>';
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
      // ⚠️ NOME DE EXIBIÇÃO SEMPRE PELO UID (perfil vivo). Aqui saía `mb.name` — o rótulo
      // GRAVADO no dia do sorteio — e quem trocou o nome no perfil aparecia com o antigo:
      // o caso "Fabi2401@" no lugar de "Dani Bataglia" (13/ago), a MESMA classe que a
      // 1.7.46/1.7.47 fechou na classificação e na busca. O uid já estava aqui, ao lado,
      // sem uso. Fictício (sem uid) cai no nome gravado, que é a única identidade que tem.
      // O PAYLOAD do clique não muda de propósito: `_woDeclare` já recebe nome E uid, e
      // mexer no contrato dele seria mexer no W.O. [[project_uid_identity_canon_locked]]
      var _nm = (typeof window._liveRowName === 'function')
        ? (window._liveRowName({ name: mb.name, uid: _u }) || mb.name)
        : mb.name;
      // AUTO-W.O.: o meu próprio botão diz que vale na hora — a diferença é de REGRA
      // (não precisa de aprovação de ninguém), então tem que estar escrita no botão.
      var _euMesmo = !!(uid && _u && String(_u) === String(uid));
      var _sel = _euMesmo
        ? 'background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.55);'
        : 'background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);';
      var _tag = _euMesmo
        ? '<span style="display:block;font-size:0.7rem;font-weight:700;color:var(--sp-c-fca5a5,#fca5a5);margin-top:2px;">você · você confirma na tela seguinte e vale na hora</span>'
        : '';
      return '<button type="button" onclick="window.' + (_euMesmo ? '_woSelfConfirm' : '_woDeclare') + '(\'' + _attr(t.id) + '\',\'' + _attr(ctxKey) + '\',\'' + _attr(mb.name) + '\',\'' + _attr(_u) + '\')" class="btn hover-lift" style="display:block;width:100%;text-align:left;margin-bottom:8px;' + _sel + 'color:var(--text-bright);font-weight:700;border-radius:11px;padding:11px 13px;font-size:0.92rem;">🚫 ' + _esc(_nm) + _tag + '</button>';
    }).join('');
    _overlay(_header('Faltou alguém?') +
      '<div style="padding:1.1rem;">' +
        '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">Quem não pôde vir? <b style="color:var(--text-bright);">Se for você, só a sua confirmação basta</b> — ninguém mais precisa aprovar. Apontando outra pessoa, o outro lado confirma antes.</div>' +
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

  // O apontamento inicial é uma intenção. A Function reconstrói o contexto a
  // partir do documento fresco e decide se só registra o claim ou se já aplica
  // o auto-W.O.; aqui ficam apenas loader e render.
  function _claimServer(tId, payload, onDone, loadingMsg) {
    if (!window.FirestoreDB || typeof window.FirestoreDB._callFn !== 'function') {
      if (typeof showNotification === 'function') showNotification('⚠️ Não salvou', 'A conexão com o servidor não está disponível.', 'error');
      return Promise.resolve(null);
    }
    if (typeof window._showLoading === 'function') window._showLoading(loadingMsg || 'Processando…');
    return window.FirestoreDB._callFn('manageWOClaim', Object.assign({ tournamentId: String(tId) }, payload)).then(function (data) {
      if (typeof window._hideLoading === 'function') window._hideLoading();
      if (typeof onDone === 'function') onDone(data || {});
      if (typeof window._rerenderBracket === 'function') window._rerenderBracket(String(tId));
      else if (typeof window._softRefreshView === 'function') window._softRefreshView();
      return data || {};
    }).catch(function (err) {
      if (typeof window._hideLoading === 'function') window._hideLoading();
      if (typeof showNotification === 'function') showNotification('⚠️ Não salvou', (err && err.message) || 'Tente de novo.', 'error');
      return null;
    });
  }
  function _isLigaGroup(t, c) { return c && c.scope === 'group' && (_isLiga(t) || _isMonarchFmt(t)); }

  // ─── ações ─────────────────────────────────────────────────────────────────────
  // absentUid: o uid da PESSOA apontada (vem do botão do picker). É a identidade real do
  // alvo — `_nameUids` só serve de rede pro fictício/legado (sem conta, o nome é tudo que há).
  /* ⭐ AUTO-W.O. — a CONFIRMAÇÃO é sua, e é a única (2.0.20).
   *
   * Ordem do dono (22/ago/2026): _"só precisa clicar no botão, no próprio nome, pedir a
   * cancelar/confirmar advertindo do que vai acontecer e confirmado confere o auto W.O."_
   *
   * Ou seja: ninguém APROVA o seu W.O., mas você não o dá sem querer. O passo que sobrou
   * é seu — e ele tem que DIZER o que vai acontecer, porque o efeito muda com o formato
   * (o parceiro segue e escolhe o desfecho / o adversário leva o jogo / o grupo recebe
   * substituto). Advertir "algo vai mudar" sem dizer O QUÊ seria só um obstáculo.
   */
  window._woSelfConfirm = function (tId, ctxKey, absentName, absentUid) {
    var t = _findT(tId); if (!t) return;
    var ctx = _ctxReg[ctxKey]; if (!ctx) return;
    var rc = _resolveCtx(t, ctx); if (!rc) return;
    var cu = _cu(); if (!cu || !cu.uid) return;
    // Sonda PURA pro detector de desfecho (mesmo formato de claim, sem gravar nada).
    var probe = { scope: rc.scope, matchId: rc.matchId, absentUids: absentUid ? [String(absentUid)] : [] };
    var nctx = _outcomeCtx(t, probe);
    var _pNm = nctx ? _esc(_liveNome(nctx.partnerUid, '') || 'seu parceiro') : '';
    var oQueAcontece;
    if (nctx) {
      oQueAcontece = 'Você sai do jogo. <b>' + _pNm + '</b> continua e escolhe como o jogo segue (suplente, Jogador X ou o adversário avançar) — o adversário confirma a escolha.';
    } else if (rc.scope === 'group') {
      oQueAcontece = 'Você sai dos jogos do grupo que ainda não aconteceram. Se houver alguém de folga (ou Jogador X), entra no seu lugar; senão o W.O. vale a favor dos adversários.';
    } else {
      oQueAcontece = 'Este jogo é dado por W.O.: entra um suplente no seu lugar, se houver, ou o adversário avança.';
    }
    var aviso =
      '<div style="font-weight:800;font-size:1.02rem;color:var(--text-bright);">🚫 Dar W.O. em você mesmo</div>' +
      '<div style="margin-top:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);border-radius:12px;padding:12px 13px;">' +
        '<div style="font-size:0.86rem;color:var(--text-bright);line-height:1.45;">' + oQueAcontece + '</div>' +
        '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:8px;line-height:1.4;">Vale <b>na hora</b> — ninguém precisa confirmar. Depois disso, só o organizador reverte, e só enquanto o jogo não acontecer.</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button type="button" onclick="window._woOpenClaim(\'' + _attr(t.id) + '\',\'' + _attr(ctxKey) + '\')" class="btn" style="flex:1;background:rgba(148,163,184,0.12);color:var(--text-bright);border:1px solid rgba(148,163,184,0.4);font-weight:800;border-radius:10px;padding:10px;">Cancelar</button>' +
        '<button type="button" onclick="window._woDeclare(\'' + _attr(t.id) + '\',\'' + _attr(ctxKey) + '\',\'' + _attr(absentName) + '\',\'' + _attr(absentUid) + '\')" class="btn btn-danger" style="flex:1;font-weight:800;border-radius:10px;padding:10px;">Confirmar W.O.</button>' +
      '</div>';
    _overlay(_header('Confirmar o seu W.O.') + '<div style="padding:1.1rem;">' + aviso + '</div>');
  };

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
      absentName: absentName, absentUids: absentUid ? [String(absentUid)] : _ctxUidsFor(t, ctx, rc.matches, absentName),
      status: 'pending', confirms: {}, createdAt: new Date().toISOString()
    };
    if (rc.scope === 'match') { c.matchId = rc.matchId; }
    else { c.roundIndex = rc.roundIndex; c.groupName = rc.groupName; c.matchIds = rc.matches.map(function (m) { return m.id; }); c.players = rc.players; c.playerUids = rc.playerUids || []; }

    /* ⭐ AUTO-W.O.: QUEM SE APONTA NÃO PRECISA DA APROVAÇÃO DE NINGUÉM (2.0.20).
     *
     * Ordem do dono (22/ago/2026): _"o participante pode se dar W.O. sem precisar de
     * aprovação de ninguém."_ E é o único caso em que a confirmação cruzada nunca teve o
     * que validar: o FATO é a própria pessoa dizendo que não vai jogar. Fazer o adversário
     * confirmar isso só atrasava a chave — e, num 1×1, o "outro lado" era justamente quem
     * lucra com o W.O.
     *
     * ⚠️ O que NÃO muda: as DUAS DECISÕES continuam separadas
     * ([[project_wo_outcome_negotiation_canon]]). O que dispensa aprovação é o FATO da
     * falta. O DESFECHO do jogo, quando há escolha real (W.O. individual de dupla numa
     * eliminatória: o parceiro segue), continua negociado — o claim já nasce em
     * 'awaiting-proposal', pulando só a etapa de confirmar o fato. Sem escolha de desfecho
     * (time inteiro / 1×1 / Liga / grupo), aplica direto.
     *
     * Identidade por UID, sempre ([[project_match_slot_uid_identity]]): fictício não tem
     * uid, então não existe auto-W.O. de fictício — cai no fluxo normal.
     */
    var _self = !!(cu.uid && (c.absentUids || []).some(function (u) { return String(u) === String(cu.uid); }));
    var _nctx = _self ? _outcomeCtx(t, c) : null;
    if (_self) {
      c.selfDeclared = true;
      c.factConfirmed = true;                 // o fato é de quem faltou: ninguém valida
      c.confirms[cu.uid] = true;
      if (_nctx) {
        c.outcomeStage = 'awaiting-proposal';
        c.outcomePartnerUid = _nctx.partnerUid;
        c.outcomeOppUids = _nctx.oppUids || [];
      }
    }

    var conf = _confirmerUids(t, rc, c);
    var data = _notifData(t, '⚠️ Confirma a falta?', (c.byName || 'Alguém') + ' apontou que "' + absentName + '" faltou em "' + (t.name || '') + '". Confirme ou conteste.');
    var selfData = _notifData(t, '🚫 W.O. avisado pelo próprio jogador',
      '"' + absentName + '" avisou que não vai jogar em "' + (t.name || '') + '". Não precisa de confirmação.' +
      (_nctx ? ' O parceiro que ficou escolhe o desfecho.' : ''));
    _claimServer(tId, {
      action: 'declare',
      context: rc.scope === 'match' ? { scope: 'match', matchId: rc.matchId } : { scope: 'group', roundIndex: rc.roundIndex, groupName: rc.groupName },
      absentUid: String(absentUid || ''), absentName: String(absentName || ''), byName: c.byName
    }, function (saved) {
      if (!saved || !saved.ok) return;
      var savedClaim = saved.claim || c;
      if (_self) {
        _notify(t, _claimAudience(t, savedClaim, cu.uid), selfData);
        if (_nctx && _nctx.partnerUid) _notify(t, [_nctx.partnerUid], _notifData(t, '🤝 Proponha o desfecho',
          'Seu parceiro avisou que não vai jogar em "' + (t.name || '') + '". Escolha como o seu jogo continua — o adversário confirma.'));
        // O servidor já aplicou o auto-W.O. se não havia desfecho a negociar.
        setTimeout(function () { window._woOpenClaim(tId, ctxKey); }, 250);
        return;
      }
      _notify(t, conf, data);
      if (t.creatorUid && conf.indexOf(t.creatorUid) === -1) _notify(t, [t.creatorUid], data);
      setTimeout(function () { window._woOpenClaim(tId, ctxKey); }, 250);
    }, 'Registrando o apontamento…');
  };

  // As transições do consenso também passam pela mesma Function. O cliente usa
  // somente o claim já exibido para orientar a interface; estado e placar vêm da resposta.
  function _claimAction(tId, claimId, action, choice, onDone, loading) {
    return _claimServer(tId, { action: action, claimId: String(claimId), choice: String(choice || '') }, onDone, loading);
  }
  function _refreshClaim(tId, claimId, saved) {
    var t = _findT(tId); var c = t && _claimById(t, claimId);
    if (saved && saved.needsOutcomeChoice && typeof window._woOutcomeOverlay === 'function') {
      window._woCloseOverlay(); window._woOutcomeOverlay(String(tId), String(claimId), saved.outcome || {}); return;
    }
    if (saved && saved.requiresGroupReplacement && typeof window._ligaPickFill === 'function' && c) {
      window._woCloseOverlay(); window._ligaPickFill(String(tId), c.roundIndex, c.groupName, c.absentName); return;
    }
    if (typeof window._woOpenClaim === 'function' && c) window._woOpenClaim(String(tId), _ctxKey(_ctxFromClaim(c)));
  }

  window._woConfirm = function (tId, claimId) {
    _claimAction(tId, claimId, 'confirm', '', function (saved) { _refreshClaim(tId, claimId, saved); }, 'Confirmando a falta…');
  };
  window._woContest = function (tId, claimId) {
    _claimAction(tId, claimId, 'contest', '', function (saved) { _refreshClaim(tId, claimId, saved); }, 'Registrando a contestação…');
  };
  window._woCancel = function (tId, claimId) {
    _claimAction(tId, claimId, 'cancel', '', function () { window._woCloseOverlay(); }, 'Revertendo o apontamento…');
  };
  window._woResolveApply = function (tId, claimId) {
    _claimAction(tId, claimId, 'resolve', '', function (saved) { _refreshClaim(tId, claimId, saved); }, 'Aplicando o W.O.…');
  };
  window._woResolveDiscard = function (tId, claimId) { window._woCancel(tId, claimId); };

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
    var woTeam = '<button type="button" onclick="window._woResolveSubChoiceUI(\'' + _attr(t.id) + '\',\'' + _attr(gc.absentUid) + '\',\'\')" class="btn" style="display:block;width:100%;text-align:left;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);color:var(--sp-c-fca5a5,#fca5a5);font-weight:700;border-radius:11px;padding:11px 13px;font-size:0.9rem;">🚫 Dar W.O. ao time<br><span style="font-weight:400;font-size:0.76rem;opacity:0.7;">Ninguém assume — o adversário vence.</span></button>';
    _overlay(_header('Substituto quebra a categoria') +
      '<div style="padding:1.1rem;">' +
        '<div style="font-size:0.86rem;color:var(--text-muted);margin-bottom:12px;line-height:1.5;"><b style="color:var(--text-bright);">' + _esc(absN) + '</b>' + (catTxt ? ' (' + _esc(catTxt) + ')' : '') + ' faltou, e nenhum suplente presente atende a categoria. Escolha quem assume — ou dê W.O. ao time.</div>' +
        opts + woTeam +
      '</div>');
  };
  // aplica a escolha do organizador: subUid vazio = W.O. ao time (marca resolvido e escala).
  window._woResolveSubChoiceUI = function (tId, absentUid, subUid) {
    var t = _findT(tId); if (!t) return;
    if (!window.FirestoreDB || typeof window.FirestoreDB._callFn !== 'function') {
      if (typeof showNotification === 'function') showNotification('⚠️ Substituição não salva', 'A conexão com o servidor não está disponível.', 'warning');
      return;
    }
    // Nenhuma escolha de categoria altera a chave no navegador. A CF relê a
    // pendência, aceita somente as opções registradas e grava o motor canônico.
    var save = window.FirestoreDB._callFn('resolveWOSubstitutionChoice', {
      tournamentId: String(tId),
      absentUid: String(absentUid),
      substituteUid: String(subUid || '')
    });
    save.then(function () {
      window._woCloseOverlay();
      if (typeof showNotification === 'function') {
        if (subUid) showNotification('✅ Substituto definido', _nameOfUid(t, subUid, '') + ' assumiu a vaga.', 'success');
        else showNotification('🚫 W.O. ao time', 'Ninguém assumiu a vaga — o adversário venceu.', 'warning');
      }
      if (typeof window.renderParticipants === 'function') window.renderParticipants(tId);
      setTimeout(function () { var t2 = _findT(tId); if (t2 && _pendingSubChoices(t2).length) window._woShowSubChoiceDialog(tId); }, 250);
    }).catch(function (e) {
      if (window._error) window._error('[wo sub choice] falhou', e);
      if (typeof showNotification === 'function') showNotification('⚠️ Substituição não salva', (e && e.message) || 'Tente novamente.', 'warning');
    });
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
      return '<button type="button" onclick="' + _handler + '(\'' + _attr(t.id) + '\',\'' + _attr(claimId) + '\',\'' + choice + '\')" class="btn hover-lift" style="display:block;width:100%;text-align:left;margin-bottom:10px;background:' + window._spCor(bg, 'background') + ';border:1px solid ' + window._spCor(bd, 'borda') + ';color:' + window._spCor(col, 'color') + ';font-weight:800;border-radius:12px;padding:12px 14px;">' + label +
        '<div style="font-weight:600;font-size:0.72rem;color:var(--text-muted);margin-top:3px;">' + sub + '</div></button>';
    };
    var _lead = mode === 'propose'
      ? 'Você ficou no jogo — proponha como ele continua. O adversário aceita, ou o organizador decide.'
      : 'Como resolver o jogo' + (partnerName ? ' de <b style="color:var(--sp-c-fbbf24,#fbbf24);">' + _esc(partnerName) + '</b>' : '') + '?';
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

  // Desfecho e acordo são comandos finos. A Function relê o claim fresco e só
  // então aplica o motor, sem qualquer mutação do snapshot que a tela possui.
  function _applyOutcome(tId, claimId, choice, action) {
    _claimAction(tId, claimId, action || 'choose', choice, function (saved) {
      window._woCloseOverlay(); _refreshClaim(tId, claimId, saved);
    }, 'Aplicando o desfecho…');
  }
  window._woChooseOutcome = function (tId, claimId, choice) { _applyOutcome(tId, claimId, choice, 'choose'); };
  window._woProposeOutcome = function (tId, claimId, choice) {
    _claimAction(tId, claimId, 'propose', choice, function (saved) { _refreshClaim(tId, claimId, saved); }, 'Registrando a proposta…');
  };
  window._woAcceptOutcome = function (tId, claimId) { _applyOutcome(tId, claimId, '', 'accept'); };
  window._woRejectOutcome = function (tId, claimId) {
    _claimAction(tId, claimId, 'reject', '', function (saved) { _refreshClaim(tId, claimId, saved); }, 'Registrando a rejeição…');
  };
})();
