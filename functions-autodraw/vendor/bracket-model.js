// ─── Unified Bracket Model ─────────────────────────────────────────────────
// Read-only adapter. Takes a tournament in any of the 3 storage shapes
// (t.matches, t.rounds, t.groups) and returns a single canonical shape
// representing "columns of the unified horizontal strip".
//
// Purpose: let renderers, generators and analytics read ONE shape instead of
// branching on t.format / t.currentStage. No data migration — legacy fields
// are preserved in meta.raw so callers can fall back when needed.
//
// Canonical shape:
// {
//   columns: [
//     {
//       id:        'swiss-r1' | 'elim-r2' | 'groups' | 'monarch-r1' | ...
//       phase:     'swiss-past' | 'swiss' | 'elim' | 'groups' | 'monarch' |
//                  'liga' | 'playin' | 'repechage' | 'thirdplace' | 'grandfinal'
//       label:     'Suíço R1' | 'Oitavas' | 'Grupos' | 'Final' | ...
//       round:     1,
//       status:    'done' | 'active' | 'pending',
//       historical: boolean,     // true = past round, renderer may compact
//       matches:   [m, m, ...],
//       subgroups: [{ name, players, matches }] | undefined,
//       category:  'fem-a' | null,
//       meta:      { raw: <original round/matches object> }
//     }
//   ],
//   format:   t.format,
//   stage:    t.currentStage,
//   context: {
//     categories:     string[],
//     hasDoubleElim:  boolean,
//     hasThirdPlace:  boolean,
//     hasPlayIn:      boolean,
//     hasRepechage:   boolean,
//     hasSwissRecap:  boolean,
//   }
// }
//
// NOTE: This MVP covers the 3 primary shapes (elim, swiss/liga, groups) and
// the monarch sub-case. Double-elim lower bracket is flagged in context but
// not yet split into its own columns here.

(function () {
  'use strict';
  // 2.0.3: este arquivo também é carregado em Node puro (harness headless, `require` direto
  // do phases-engine) pra alcançar a regra única de "quem venceu". Sem este shim o próprio
  // `require` estourava em `window is not defined` e o chamador ficava sem a regra — que é o
  // caminho de volta pra uma segunda cópia dela.
  var window = (typeof globalThis !== 'undefined' && typeof globalThis.window !== 'undefined')
    ? globalThis.window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  var LABELS = {
    final: 'Final',
    semi: 'Semifinais',
    quarter: 'Quartas de Final',
    r16: 'Oitavas de Final',
    playin: 'Play-in',
    repechage: 'Repescagem',
    thirdplace: '3º Lugar',
    grandfinal: 'Grande Final',
    grupos: 'Grupos',
    swissShort: 'Suíço R'
  };

  function _tr(key, fallback, params) {
    var _t = window._t;
    if (typeof _t === 'function') {
      var v = _t(key, params);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function _labelElimRound(roundNum, positiveRounds) {
    if (roundNum === 0) return _tr('bracket.playIn', LABELS.playin);
    if (roundNum < 0) return _tr('bracket.repechage', LABELS.repechage) +
      (Math.abs(roundNum) > 1 ? ' ' + Math.abs(roundNum) : '');
    var idx = positiveRounds.indexOf(roundNum);
    var fromEnd = positiveRounds.length - idx;
    if (fromEnd === 1) return _tr('bracket.final', LABELS.final);
    if (fromEnd === 2) return _tr('bracket.semiFinal', LABELS.semi);
    if (fromEnd === 3) return _tr('bracket.quarterFinal', LABELS.quarter);
    if (fromEnd === 4) return _tr('bracket.roundOf16', LABELS.r16);
    return _tr('bracket.round', 'Rodada ' + roundNum, { n: roundNum });
  }

  function _matchComplete(m) {
    // v2.3.9: sit-out (folga) e BYE não são jogos a disputar — contam como
    // "resolvidos" pra fins de rodada completa, mesmo sem winner.
    return !!(m && (m.winner || m.isBye || m.isSitOut));
  }

  function _roundStatus(matches) {
    if (!matches || matches.length === 0) return 'pending';
    var anyWinner = matches.some(_matchComplete);
    var allDone = matches.every(_matchComplete);
    if (allDone) return 'done';
    if (anyWinner) return 'active';
    return 'pending';
  }

  // True when the tournament uses Swiss as a qualifier stage within a
  // non-Swiss elimination-style format (Eliminatórias / Dupla Eliminatória /
  // Fase de Grupos + Eliminatórias). In that case Swiss rounds must be labeled
  // "RODADA SUIÇA N/M" to distinguish them from the elimination rounds that
  // follow. Pure Suíço / Liga / Ranking tournaments keep the plain "Rodada N".
  function _isSwissQualifierTournament(t) {
    if (!t) return false;
    var fmt = t.format || '';
    if (fmt === 'Suíço' || fmt === 'Suíço Clássico' || fmt === 'Liga' || fmt === 'Ranking') return false;
    return true;
  }

  // ── Swiss past rounds (used when Swiss was p2 resolution) ────────────────
  function _buildSwissPastColumns(t) {
    if (!Array.isArray(t.swissRoundsData) || t.swissRoundsData.length === 0) return [];
    var total = (t.swissRounds ? parseInt(t.swissRounds) : 0) || t.swissRoundsData.length;
    return t.swissRoundsData.map(function (rd, ri) {
      var matches = (rd && rd.matches) ? rd.matches : [];
      var label = _tr('bracket.swissRoundFull', 'RODADA SUIÇA ' + (ri + 1) + '/' + total,
        { n: ri + 1, total: total });
      return {
        id: 'swiss-past-r' + (ri + 1),
        phase: 'swiss-past',
        label: label,
        round: ri + 1,
        status: 'done',
        historical: true,
        matches: matches.slice(),
        subgroups: undefined,
        category: null,
        meta: { raw: rd }
      };
    });
  }

  // ── Swiss / Liga / Liga-rei-rainha from t.rounds[] ───────────────────────
  function _buildSwissColumns(t) {
    if (!Array.isArray(t.rounds) || t.rounds.length === 0) return [];
    var isSwissQualifier = _isSwissQualifierTournament(t);

    // v2.5.1: agrupa as entradas de t.rounds pelo número da RODADA (r.round).
    // Liga multi-categoria emite UMA entrada de t.rounds POR CATEGORIA no mesmo
    // sorteio (C e D ambas round 1). Antes este adapter rotulava cada entrada
    // pelo índice do array (ri+1) → a categoria D virava "Rodada 2" e o card de
    // rodada atual (currentRound = rounds.length) só mostrava a última. Agora
    // fundimos entradas de mesma rodada numa única coluna cujos subgrupos
    // abrangem todas as categorias. Single-categoria não muda (1 entrada/round).
    var buckets = [];          // [{round, entries:[r,...]}] em ordem de descoberta
    var idxByRound = {};
    t.rounds.forEach(function (r, ri) {
      var rn = (r && typeof r.round === 'number') ? r.round : (ri + 1);
      if (idxByRound[rn] === undefined) {
        idxByRound[rn] = buckets.length;
        buckets.push({ round: rn, entries: [] });
      }
      buckets[idxByRound[rn]].entries.push(r);
    });
    buckets.sort(function (a, b) { return a.round - b.round; });

    var swissTotal = (t.swissRounds ? parseInt(t.swissRounds) : 0) || buckets.length;

    return buckets.map(function (grp) {
      var rn = grp.round;
      var entries = grp.entries;
      var isMonarchRound = entries.some(function (r) { return r && r.format === 'rei_rainha'; });

      var label;
      if (isMonarchRound) {
        label = _tr('bracket.round', 'Rodada ' + rn, { n: rn }) +
          ' • ' + _tr('bracket.monarchShort', 'Rei/Rainha');
      } else if (isSwissQualifier) {
        label = _tr('bracket.swissRoundFull', 'RODADA SUIÇA ' + rn + '/' + swissTotal,
          { n: rn, total: swissTotal });
      } else {
        label = _tr('bracket.round', 'Rodada ' + rn, { n: rn });
      }

      // Funde matches de todas as categorias desta rodada.
      var matches = [];
      entries.forEach(function (r) {
        (r && r.matches ? r.matches : []).forEach(function (m) { matches.push(m); });
      });

      // Funde os monarchGroups (subgrupos) de todas as categorias. Cada grupo já
      // carrega a categoria nos labels dos seus jogos ("... (C)" / "... (D)").
      var subgroups;
      if (isMonarchRound) {
        subgroups = [];
        entries.forEach(function (r) {
          if (Array.isArray(r.monarchGroups)) {
            r.monarchGroups.forEach(function (g) {
              // v2.4.61: preserva TODOS os campos do grupo (W.O./substituição:
              // woAbsent, subStatus, subName, subIsGuest, pendingInviteId).
              subgroups.push(Object.assign({}, g, {
                players: (g.players || []).slice(),
                playersSlotIds: (g.playersSlotIds || []).slice(),
                matches: (g.matches || []).slice()
              }));
            });
          }
        });
      }

      var allDone = entries.every(function (r) {
        return (r.status === 'complete') || _roundStatus((r && r.matches) || []) === 'done';
      });
      var anyActive = entries.some(function (r) { return r.status && r.status !== 'complete'; });

      return {
        id: 'swiss-r' + rn,
        phase: isMonarchRound ? 'monarch' : 'swiss',
        label: label,
        round: rn,
        status: allDone ? 'done' : (anyActive ? 'active' : _roundStatus(matches)),
        historical: allDone,
        matches: matches,
        subgroups: subgroups,
        category: null,
        // Quando a rodada tem 1 só entrada (single-categoria), expõe o raw
        // legado. Fundido (multi-cat) marca merged — o consumidor cai em
        // col.subgroups/col.status (que setamos acima).
        meta: { raw: entries.length === 1 ? entries[0] : { merged: true, entries: entries } }
      };
    });
  }

  // ── Single-elim columns from t.matches[] ─────────────────────────────────
  // For double-elim, columns are emitted once per (bracket, round) combo —
  // ordered: all 'upper' by round, then all 'lower' by round, then 'grand'.
  // For single-elim (no m.bracket field), bracket === null and columns are
  // ordered by round only (identical to the pre-v0.12.62 behavior).
  function _buildElimColumns(t) {
    var matches = Array.isArray(t.matches) ? t.matches : [];
    if (matches.length === 0) return [];

    // Bucket by bracket (null for single-elim) then by round.
    var buckets = {}; // bracket -> byRound
    var bracketsSeen = {};
    matches.forEach(function (m) {
      var b = m.bracket || null;
      bracketsSeen[b === null ? '__single' : b] = true;
      if (!buckets[b]) buckets[b] = {};
      var k = m.round;
      if (!buckets[b][k]) buckets[b][k] = [];
      buckets[b][k].push(m);
    });

    // Determine bracket iteration order
    var bracketOrder;
    if (bracketsSeen.__single) {
      bracketOrder = [null];
    } else {
      bracketOrder = ['upper', 'lower', 'grand'].filter(function (b) { return bracketsSeen[b]; });
    }

    var allPositiveRounds = Object.keys(buckets).reduce(function (acc, b) {
      Object.keys(buckets[b]).forEach(function (k) {
        var n = Number(k);
        if (n >= 1 && acc.indexOf(n) === -1) acc.push(n);
      });
      return acc;
    }, []).sort(function (a, b) { return a - b; });

    var result = [];
    bracketOrder.forEach(function (br) {
      var byRound = buckets[br];
      var keys = Object.keys(byRound).map(Number).sort(function (a, b) {
        var aKey = a < 0 ? 1.5 + (Math.abs(a) * 0.01) : a;
        var bKey = b < 0 ? 1.5 + (Math.abs(b) * 0.01) : b;
        return aKey - bKey;
      });
      // For single-elim labeling, positiveRounds drives naming (Final/Semi/…).
      // For double-elim upper bracket we keep the round-number labeling since
      // the legacy renderer just uses "Rodada N".
      var positiveRounds = br === null
        ? keys.filter(function (r) { return r >= 1; })
        : allPositiveRounds;
      keys.forEach(function (roundNum) {
        var rMatches = byRound[roundNum];
        var phase;
        if (br === 'grand') phase = 'grandfinal';
        else if (roundNum === 0) phase = 'playin';
        else if (roundNum < 0) phase = 'repechage';
        else phase = 'elim';

        var label;
        if (br === null) {
          label = _labelElimRound(roundNum, positiveRounds);
        } else if (br === 'grand') {
          label = _tr('bracket.grandFinal', LABELS.grandfinal);
        } else if (roundNum < 0) {
          // Repechage (power-of-2 resolution): negative round = pre-qualifier between R1 and R2
          label = _tr('bracket.repechage', LABELS.repechage) +
            (Math.abs(roundNum) > 1 ? ' ' + Math.abs(roundNum) : '');
        } else {
          // upper/lower bracket: keep simple round label
          label = _tr('bracket.round', 'Rodada ' + roundNum, { n: roundNum });
        }

        result.push({
          id: 'elim-' + (br || 'r') + '-r' + roundNum,
          phase: phase,
          label: label,
          round: roundNum,
          status: _roundStatus(rMatches),
          historical: _roundStatus(rMatches) === 'done',
          matches: rMatches.slice(),
          subgroups: undefined,
          category: null,
          bracket: br,
          meta: { raw: { round: roundNum, matches: rMatches, bracket: br } }
        });
      });
    });

    return result;
  }

  // ── Group-stage column (one column, groups as subgroups) ─────────────────
  function _buildGroupsColumn(t) {
    if (!Array.isArray(t.groups) || t.groups.length === 0) return [];
    // Flatten each group's matches. Each group may have .matches or .rounds[].matches.
    // When .rounds[] exists we also preserve it as subgroup.rounds so renderers
    // that need per-round structure (status/labels/ordering) don't have to
    // re-read t.groups.
    var subgroups = t.groups.map(function (g, gi) {
      var gMatches = [];
      var gRounds;
      if (Array.isArray(g.matches) && g.matches.length > 0) {
        gMatches = g.matches.slice();
      } else if (Array.isArray(g.rounds)) {
        gRounds = g.rounds.map(function (r) {
          return {
            round: r.round != null ? r.round : undefined,
            status: r.status || _roundStatus(r.matches || []),
            matches: (r.matches || []).slice()
          };
        });
        gRounds.forEach(function (r) { gMatches = gMatches.concat(r.matches); });
      }
      /* ⛔ PRESERVA TODOS OS CAMPOS DO GRUPO — este literal já apagou dois.
       * Aqui havia `{ name, players, matches, rounds }` e mais nada. Tudo o que o grupo
       * carrega além disso — `classifCongelada` à frente de todos, mas também `playersUids`,
       * `playersSlotIds`, `category` e os campos de W.O./substituição — sumia na travessia.
       * ⭐ MEDIDO em 01/set/2026: `_renderMonarchStage` passa `sg.classifCongelada` pro motor
       * de classificação desde a 2.1.2, e nesta rota o campo NUNCA chegava — a correção do
       * retrato congelado era INERTE em todo torneio cujos grupos moram em `t.groups`. O
       * irmão desta função (a rota `t.rounds[].monarchGroups`, ~linha 196) sempre usou
       * `Object.assign({}, g, …)` e por isso nunca teve o problema.
       * A regra: copie o grupo INTEIRO e sobrescreva só o que esta coluna precisa mudar.
       * `rounds` fica de fora quando não foi montado — `rounds: undefined` num Object.assign
       * APAGA o `g.rounds` original, que é o oposto de preservar. */
      var col = Object.assign({}, g, {
        name: window._groupDisplayName(g, gi),
        players: (g.players || g.participants || []).slice(),
        matches: gMatches
      });
      if (gRounds) col.rounds = gRounds;
      return col;
    });

    // Flattened matches for aggregate status
    var allMatches = subgroups.reduce(function (acc, sg) {
      return acc.concat(sg.matches || []);
    }, []);

    var isMonarchFormat = window._isMonarchFormat(t);
    return [{
      id: isMonarchFormat ? 'monarch-groups' : 'groups',
      phase: isMonarchFormat ? 'monarch' : 'groups',
      label: _tr('bracket.groups', LABELS.grupos),
      round: 1,
      status: _roundStatus(allMatches),
      historical: _roundStatus(allMatches) === 'done',
      matches: allMatches,
      subgroups: subgroups,
      category: null,
      meta: { raw: { groups: t.groups } }
    }];
  }

  // ── Third-place + grand final (special terminal cards) ──────────────────
  function _buildTerminalColumns(t) {
    var cols = [];
    if (t.thirdPlaceMatch && (t.thirdPlaceMatch.p1 || t.thirdPlaceMatch.p2)) {
      var m3 = t.thirdPlaceMatch;
      cols.push({
        id: 'thirdplace',
        phase: 'thirdplace',
        label: _tr('bracket.thirdPlace', LABELS.thirdplace),
        round: 0,
        status: _matchComplete(m3) ? 'done' : 'pending',
        historical: _matchComplete(m3),
        matches: [m3],
        subgroups: undefined,
        category: null,
        meta: { raw: m3 }
      });
    }
    if (t.grandFinal && (t.grandFinal.p1 || t.grandFinal.p2)) {
      var gf = t.grandFinal;
      cols.push({
        id: 'grandfinal',
        phase: 'grandfinal',
        label: _tr('bracket.grandFinal', LABELS.grandfinal),
        round: 0,
        status: _matchComplete(gf) ? 'done' : 'pending',
        historical: _matchComplete(gf),
        matches: [gf],
        subgroups: undefined,
        category: null,
        meta: { raw: gf }
      });
    }
    return cols;
  }

  // ── FONTE ÚNICA Rei/Rainha: normalizador de escrita (persistência) ─────────
  // v4.4.70: casa canônica ÚNICA do fold. Remove `group.matches` do payload e
  // deixa só `matchIds` — round.matches continua a única lista de jogos gravada.
  // Sem isto o Firestore grava cada jogo Rei/Rainha DUAS vezes (round.matches +
  // monarchGroups[i].matches) e as cópias divergem ao carregar.
  //
  // Roda no deep-clone do save (NÃO na memória, que mantém group.matches como
  // referências hidratadas). Idempotente. Trata `data.rounds[]` (Fase 0) E
  // `data.phaseRounds[k].rounds[]` (Liga multi-fase) — a mesma duplicação
  // acontece nas rodadas de fase posterior.
  //
  // Vive aqui (bracket-model.js, arquivo vendored p/ functions-autodraw) para ser
  // FONTE ÚNICA: tanto o cliente (firebase-db.js) quanto o servidor (autoDraw,
  // via draw-core shim) chamam ESTA função antes de gravar. Zero drift, zero
  // segundo lugar pra esquecer de foldar.
  function _foldRoundsArray(rounds) {
    if (!Array.isArray(rounds)) return;
    rounds.forEach(function (r) {
      if (!r || !Array.isArray(r.monarchGroups)) return;
      r.monarchGroups.forEach(function (g) {
        if (!g || !Array.isArray(g.matches)) return;
        if (!Array.isArray(g.matchIds) || !g.matchIds.length) {
          g.matchIds = g.matches
            .map(function (m) { return m && m.id; })
            .filter(function (x) { return x != null; })
            .map(String);
        }
        delete g.matches; // fonte única = round.matches
      });
    });
  }
  window._foldMonarchGroups = function _foldMonarchGroups(data) {
    if (!data) return data;
    _foldRoundsArray(data.rounds);
    // phaseRounds: objeto { [phaseIndex]: { rounds: [...] } } — Liga incremental
    // de fase posterior. Mesma duplicação Rei/Rainha; folda também.
    if (data.phaseRounds && typeof data.phaseRounds === 'object') {
      Object.keys(data.phaseRounds).forEach(function (k) {
        var slot = data.phaseRounds[k];
        if (slot && Array.isArray(slot.rounds)) _foldRoundsArray(slot.rounds);
      });
    }
    return data;
  };

  // v4.4.69 FONTE ÚNICA Rei/Rainha (schema, sem gambiarra): o jogo mora UMA vez em
  // round.matches. Os grupos guardam só `matchIds` — o Firestore NUNCA mais grava
  // cópia do jogo (o fold em saveTournament/mutateTournament/_saveToCache remove
  // group.matches do payload). Esta função HIDRATA a leitura: reconstrói
  // group.matches como REFERÊNCIAS aos objetos de round.matches (o MESMO objeto,
  // nunca cópia) — divergência é impossível por construção, sem sync perpétuo.
  // Idempotente. MIGRA docs legados com group.matches embutido: dobra em matchIds,
  // garante o objeto no plano (fundindo resultado se só a cópia do grupo tinha) e
  // relinka. Roda no ingest (onSnapshot/cache), no topo do render e na transação.
  window._hydrateMonarchGroups = function (t) {
    if (!t || !Array.isArray(t.rounds)) return t;
    t.rounds.forEach(function (rd) {
      if (!rd || !Array.isArray(rd.monarchGroups) || !rd.monarchGroups.length) return;
      if (!Array.isArray(rd.matches)) rd.matches = [];
      var byId = {};
      rd.matches.forEach(function (m) { if (m && m.id != null) byId[String(m.id)] = m; });
      rd.monarchGroups.forEach(function (g) {
        if (!g) return;
        // (a) LEGADO: cópias embutidas sem matchIds → dobra em matchIds + migra pro plano.
        if (!Array.isArray(g.matchIds) && Array.isArray(g.matches)) {
          g.matchIds = [];
          g.matches.forEach(function (gm) {
            if (!gm || gm.id == null) return;
            g.matchIds.push(String(gm.id));
            var flat = byId[String(gm.id)];
            if (!flat) { rd.matches.push(gm); byId[String(gm.id)] = gm; } // só no grupo → adota no plano
            else if (flat !== gm && gm.winner && !flat.winner) {          // placar salvo só na cópia → funde
              flat.winner = gm.winner; flat.scoreP1 = gm.scoreP1; flat.scoreP2 = gm.scoreP2; flat.draw = gm.draw;
              if (!flat.startedAt) flat.startedAt = gm.startedAt; if (!flat.resultAt) flat.resultAt = gm.resultAt;
            }
          });
        }
        // (b) reconstrói group.matches como REFERÊNCIAS do plano (fonte única).
        if (Array.isArray(g.matchIds)) {
          g.matches = g.matchIds.map(function (id) { return byId[String(id)]; }).filter(Boolean);
        }
      });
    });
    return t;
  };

  // ── Canonical write helper ────────────────────────────────────────────────
  // Append matches (and optional monarchGroups) into the correct legacy field
  // on t based on the column's phase. Generators should prefer this over
  // directly manipulating t.rounds / t.matches so the write discipline lives
  // in one place. Idempotent on re-append to the same round: matches are
  // concatenated into the existing round entry.
  //
  // desc: {
  //   phase:         'swiss' | 'monarch' | 'liga' | 'elim' | 'grandfinal' | 'thirdplace'
  //   round:         number (1-based; for t.rounds lookup)
  //   matches:       match[] (required; for thirdplace, matches[0] is the single match)
  //   status?:       'active' | 'complete' | 'pending'  (swiss-like only; defaults 'active')
  //   format?:       'rei_rainha'                       (swiss-like only; tags round)
  //   monarchGroups?: group[]                            (monarch only)
  //   bracket?:      'upper' | 'lower' | 'grand'         (elim only; tags m.bracket)
  // }
  window._appendCanonicalColumn = function _appendCanonicalColumn(t, desc) {
    if (!t || !desc || !Array.isArray(desc.matches)) return;
    var phase = desc.phase;

    // Thirdplace → single-field t.thirdPlaceMatch
    if (phase === 'thirdplace') {
      if (desc.matches[0]) t.thirdPlaceMatch = desc.matches[0];
      return;
    }

    // Elim / grand → flat t.matches[]
    if (phase === 'elim' || phase === 'grandfinal') {
      if (!Array.isArray(t.matches)) t.matches = [];
      desc.matches.forEach(function (m) {
        if (desc.bracket && !m.bracket) m.bracket = desc.bracket;
        t.matches.push(m);
      });
      return;
    }

    // ── STORAGE CANÔNICO PARA TORNEIO NOVO (meio-termo pedido pelo dono, 14/ago/2026) ──
    // A fase classificatória nasceu em `t.rounds` e a chave em `t.matches`. O canônico é
    // `t.matches` taggeado por `phaseIndex` — é o que `prevPhaseGroups` já lê e o que o
    // render agora desenha igual (`_matchesDeClassificatoria`).
    //
    // ⚠️ MIGRAR O QUE JÁ EXISTE ESTÁ PROIBIDO: o Confra é o único torneio no storage antigo
    // e mover os 104 jogos e 33 grupos dele significaria reescrever sorteio feito e placares
    // lançados de um torneio ao vivo. Então a chave é POR TORNEIO: quem já nasceu continua
    // onde está; quem nascer daqui pra frente vai pro canônico. A limpeza do resto está
    // agendada pra 15/nov/2026, quando o Confra tiver terminado.
    //
    // O sinal é EXPLÍCITO no doc (`t.storageCanonico`), nunca uma data ou heurística: doc
    // sem a marca é legado, e legado nunca muda de lugar sozinho.
    if (t.storageCanonico === true) {
      if (!Array.isArray(t.matches)) t.matches = [];
      var _fase = t.currentPhaseIndex || 0;
      var _ehMonarch = (phase === 'monarch');
      var _porNome = {};
      (desc.monarchGroups || []).forEach(function (g, gi) {
        (g && g.matches || []).forEach(function (gm) { if (gm && gm.id != null) _porNome[String(gm.id)] = { gi: gi, nome: g.name }; });
      });
      desc.matches.forEach(function (m) {
        if (!m) return;
        // o jogo precisa se DECLARAR classificatório — é assim que o leitor o reconhece
        if (m.phaseIndex == null) m.phaseIndex = _fase;
        if (m.round == null) m.round = desc.round;
        if (_ehMonarch) m.isMonarch = true;
        var g = _porNome[String(m.id)];
        if (g) { if (m.monarchGroup == null) m.monarchGroup = g.gi; if (!m.groupName && g.nome) m.groupName = g.nome; }
        else if (!_ehMonarch && m.monarchGroup == null && m.bracket == null) m.bracket = 'group';
        // não duplica em re-geração (mesma guarda do caminho legado, por id)
        var jaTem = t.matches.some(function (x) { return x && m.id != null && String(x.id) === String(m.id); });
        if (!jaTem) t.matches.push(m);
      });
      return;
    }

    // Swiss / liga / monarch → t.rounds[round-1]  (LEGADO — torneios que já existem)
    if (!Array.isArray(t.rounds)) t.rounds = [];
    var idx = desc.round - 1;
    var existing = t.rounds[idx];
    if (!existing) {
      var col = {
        round: desc.round,
        status: desc.status || 'active',
        matches: desc.matches.slice()
      };
      if (desc.format) col.format = desc.format;
      if (Array.isArray(desc.monarchGroups)) col.monarchGroups = desc.monarchGroups.slice();
      t.rounds[idx] = col;
    } else {
      // v4.4.113: GUARDA contra re-append — se a rodada for re-gerada (auto-draw
      // disparando 2×, re-sorteio, race), NÃO duplica jogos já presentes. Sem isto,
      // o concat criava cópias do mesmo jogo com IDs diferentes → games/participação
      // DOBRAVAM nos Pontos Avançados. Chave: id OU (rodada + grupo + times ordenados).
      var _lk = function (m) {
        if (!m) return '';
        var s1 = Array.isArray(m.team1) ? m.team1.slice().sort().join(',') : String(m.p1 || '');
        var s2 = Array.isArray(m.team2) ? m.team2.slice().sort().join(',') : String(m.p2 || '');
        // v4.4.114: SEM monarchGroup — a re-geração põe os mesmos times num índice de grupo
        // diferente; os times já identificam o jogo dentro da rodada.
        return String(m.round || 0) + '|' + (m.category || '') + '|' + (m.isSitOut ? ('so:' + (m.p1 || '')) : [s1, s2].sort().join('__'));
      };
      var _have = {};
      (existing.matches || []).forEach(function (m) { if (m) { if (m.id != null) _have['id:' + m.id] = 1; _have['lk:' + _lk(m)] = 1; } });
      var _fresh = (desc.matches || []).filter(function (m) {
        if (!m) return false;
        if (m.id != null && _have['id:' + m.id]) return false;
        if (_have['lk:' + _lk(m)]) return false;
        return true;
      });
      existing.matches = existing.matches.concat(_fresh);
      if (Array.isArray(desc.monarchGroups)) {
        // dedup grupos monarca por assinatura dos jogadores (grupo re-gerado = mesmos 4).
        var _haveG = {};
        (existing.monarchGroups || []).forEach(function (g) { if (g) _haveG[(g.players || []).slice().sort().join(',')] = 1; });
        var _freshG = desc.monarchGroups.filter(function (g) {
          var sig = (g && g.players || []).slice().sort().join(',');
          if (_haveG[sig]) return false; _haveG[sig] = 1; return true;
        });
        existing.monarchGroups = (existing.monarchGroups || []).concat(_freshG);
      }
      if (desc.format) existing.format = desc.format;
    }
  };

  // ── Canonical read helper: flatten every match across legacy shapes ───────
  // Returns a flat array of all matches attached to t, regardless of which
  // legacy storage field holds them (t.matches, t.rounds[].matches,
  // t.groups[].matches, t.groups[].rounds[].matches, t.thirdPlaceMatch, and
  // legacy t.rodadas). Preserves the match objects by reference — callers may
  // mutate or simply scan. Used by helpers that need "every match in the
  // tournament" semantics (W.O. detection, share-by-id, attendance scan).
  window._collectAllMatches = function _collectAllMatches(t) {
    if (!t || typeof t !== 'object') return [];
    var out = [];
    if (Array.isArray(t.matches)) out = out.concat(t.matches);
    if (Array.isArray(t.rounds)) {
      t.rounds.forEach(function (r) {
        if (r && Array.isArray(r.matches)) out = out.concat(r.matches);
      });
    }
    if (Array.isArray(t.groups)) {
      t.groups.forEach(function (g) {
        if (g && Array.isArray(g.matches)) out = out.concat(g.matches);
        if (g && Array.isArray(g.rounds)) {
          g.rounds.forEach(function (gr) {
            if (gr && Array.isArray(gr.matches)) out = out.concat(gr.matches);
            else if (Array.isArray(gr)) out = out.concat(gr);
          });
        }
      });
    }
    // v3.1.16 (inc 8): Liga incremental de fase posterior — rodadas em t.phaseRounds[idx]
    // .rounds[].matches (mesma forma de t.rounds, namespaced por fase). Result-entry/W.O./
    // share-by-id precisam enxergar esses jogos.
    if (t.phaseRounds && typeof t.phaseRounds === 'object') {
      Object.keys(t.phaseRounds).forEach(function (k) {
        var slot = t.phaseRounds[k];
        if (slot && Array.isArray(slot.rounds)) {
          slot.rounds.forEach(function (r) {
            if (r && Array.isArray(r.matches)) out = out.concat(r.matches);
          });
        }
      });
    }
    if (t.thirdPlaceMatch) out.push(t.thirdPlaceMatch);
    if (Array.isArray(t.rodadas)) {
      t.rodadas.forEach(function (r) {
        if (!r) return;
        if (Array.isArray(r.matches)) out = out.concat(r.matches);
        if (Array.isArray(r.jogos)) out = out.concat(r.jogos);
        if (Array.isArray(r)) out = out.concat(r);
      });
    }
    return out;
  };

  // Algum resultado já lançado? (vencedor OU placar OU sets em qualquer jogo). Usado p/ omitir
  // o botão "Iniciar Torneio": lançar resultado É iniciar o torneio (regra do dono). BYEs
  // (isBye) não contam como "resultado lançado" (avançam automático no sorteio).
  window._hasAnyMatchResult = function _hasAnyMatchResult(t) {
    var all = window._collectAllMatches(t);
    for (var i = 0; i < all.length; i++) {
      var m = all[i];
      if (!m || m.isBye) continue;
      if (m.winner || m.scoreP1 != null || m.scoreP2 != null || (Array.isArray(m.sets) && m.sets.length) ||
          (Array.isArray(m.team1Games) && m.team1Games.length)) return true;
    }
    return false;
  };

  // ── Main entry ────────────────────────────────────────────────────────────
  // Separa de `t.matches` os jogos que são de FASE CLASSIFICATÓRIA (Rei/Rainha ou
  // Liga/Suíço gravados no storage canônico) e os devolve no shape de `t.rounds` —
  // reconstruindo `monarchGroups` a partir do `monarchGroup` que o gerador carimba em cada
  // jogo. Um jogo só entra aqui se se declara classificatório: `isMonarch`, `monarchGroup`
  // definido, ou `bracket === 'group'`. Chave eliminatória NUNCA entra (ela não tem nenhum
  // desses), então torneio de eliminação direta segue exatamente como era.
  function _matchesDeClassificatoria(t) {
    var vazio = { matches: [], rounds: [], ids: {} };
    if (!t || !Array.isArray(t.matches) || !t.matches.length) return vazio;
    var alvo = t.matches.filter(function (m) {
      if (!m) return false;
      return m.isMonarch === true || m.monarchGroup != null || m.bracket === 'group';
    });
    if (!alvo.length) return vazio;
    var ids = {}; alvo.forEach(function (m) { if (m.id != null) ids[String(m.id)] = true; });
    // agrupa por RODADA e, dentro dela, por índice de grupo (a âncora estrutural)
    var porRodada = {};
    alvo.forEach(function (m) {
      var r = (m.round == null) ? 1 : m.round;
      (porRodada[r] = porRodada[r] || []).push(m);
    });
    var rounds = Object.keys(porRodada).map(Number).sort(function (a, b) { return a - b; })
      .map(function (r) {
        var ms = porRodada[r];
        var porGrupo = {};
        ms.forEach(function (m) {
          var g = (m.monarchGroup == null) ? 0 : m.monarchGroup;
          (porGrupo[g] = porGrupo[g] || []).push(m);
        });
        var grupos = Object.keys(porGrupo).map(Number).sort(function (a, b) { return a - b; })
          .map(function (g) {
            var jogos = porGrupo[g];
            // elenco do grupo: união posicional dos slots (uid manda, nome só de reserva)
            var nomes = [], uids = [], slotIds = [], visto = {};
            jogos.forEach(function (m) {
              [[m.team1, m.team1Uids, m.team1SlotIds], [m.team2, m.team2Uids, m.team2SlotIds]].forEach(function (par) {
                var N = par[0] || [], U = par[1] || [], S = par[2] || [];
                for (var i = 0; i < Math.max(N.length, U.length); i++) {
                  // O coringa não tem uid e seu nome pode repetir. O slotId é a
                  // identidade da vaga; sem ele, mantém a chave legada por nome.
                  var k = U[i] || S[i] || N[i]; if (!k || visto[k]) continue;
                  visto[k] = 1; nomes.push(N[i] || ''); uids.push(U[i] || null); slotIds.push(S[i] || null);
                }
              });
            });
            return {
              name: jogos[0].groupName || ('Grupo ' + String.fromCharCode(65 + g)),
              groupIdx: g, players: nomes, playersUids: uids, playersSlotIds: slotIds, matches: jogos
            };
          });
        var ehMonarch = ms.some(function (m) { return m.isMonarch === true; });
        var col = { round: r, matches: ms, status: 'active' };
        if (ehMonarch) { col.format = 'rei_rainha'; col.monarchGroups = grupos; }
        else if (grupos.length > 1 || ms.some(function (m) { return m.bracket === 'group'; })) col.monarchGroups = grupos;
        return col;
      });
    return { matches: alvo, rounds: rounds, ids: ids };
  }
  window._matchesDeClassificatoria = _matchesDeClassificatoria;

  window._getUnifiedRounds = function _getUnifiedRounds(t) {
    if (!t || typeof t !== 'object') {
      return { columns: [], format: null, stage: null, context: {} };
    }

    // TAG "BYE" (display): quem VENCEU um jogo-bye na rodada r leva a tag âmbar SÓ na rodada r+1
    // (some quando avança por vitória). Antes isto só rodava em _renderPhaseBracket (single-elim);
    // a Dupla Eliminatória renderiza por outro caminho (renderDoubleElimBracket) e a tag NÃO
    // aparecia consistente — o novo modelo bye/play-in tem MAIS byes (a árvore-mínima não tinha).
    // Rodar aqui, no processador ÚNICO, cobre TODOS os renders. Idempotente; não sobrescreve flag.
    if (typeof window._isByeMatch === 'function' && Array.isArray(t.matches) && t.matches.length) {
      var _byeNext = {};
      t.matches.forEach(function (m) {
        if (window._isByeMatch(m) && m.winner) {
          var _r = (m.round == null) ? 1 : m.round;
          _byeNext[(m.bracket || 'main') + '|' + m.winner] = _r + 1;
        }
      });
      t.matches.forEach(function (m) {
        if (window._isByeMatch(m)) return;
        var _r = (m.round == null) ? 1 : m.round, _bk = (m.bracket || 'main');
        if (m.p1 && m.p1FromBye == null && _byeNext[_bk + '|' + m.p1] === _r) m.p1FromBye = true;
        if (m.p2 && m.p2FromBye == null && _byeNext[_bk + '|' + m.p2] === _r) m.p2FromBye = true;
      });
    }

    var cols = [];

    // 1) Swiss past (p2 resolution recap) — only when we're in the elim phase
    //    and there's preserved swiss data.
    var hasSwissRecap = Array.isArray(t.swissRoundsData) && t.swissRoundsData.length > 0;
    if (hasSwissRecap && t.currentStage === 'elimination') {
      cols = cols.concat(_buildSwissPastColumns(t));
    }

    // 2) Primary phase
    var hasRounds = Array.isArray(t.rounds) && t.rounds.length > 0;
    var hasMatches = Array.isArray(t.matches) && t.matches.length > 0;
    var hasGroups = Array.isArray(t.groups) && t.groups.length > 0;

    // Groups phase comes before the elim strip when currentStage === 'groups'.
    if (hasGroups && (t.currentStage === 'groups' || window._isMonarchFormat(t))) {
      cols = cols.concat(_buildGroupsColumn(t));
    }

    // ── A FASE CLASSIFICATÓRIA PODE MORAR NOS DOIS STORAGES ─────────────────────
    // Historicamente: Liga/Suíço/Rei-Rainha em `t.rounds`, chave em `t.matches`. O storage
    // CANÔNICO é `t.matches` taggeado por `phaseIndex` (é o que `prevPhaseGroups` já lê via
    // `_groupsFromTaggedMatches`), e a leitura LÓGICA já dá resultado idêntico nos dois —
    // medido: prevPhaseGroups, phaseComplete, pendingMatches e a classificação batem.
    //
    // ⚠️ O RENDER NÃO BATIA. Um torneio Rei/Rainha com os jogos em `t.matches` caía direto
    // em `_buildElimColumns` e era desenhado como CHAVE ELIMINATÓRIA: medido no harness,
    // 4.815 bytes contra 33.401, SEM os jogadores na tela. Era o que impedia torneio novo de
    // nascer no storage canônico. Aqui os jogos de fase CLASSIFICATÓRIA são separados dos de
    // chave e reconstruídos no shape de `t.rounds`, para todo o resto do render (colunas,
    // grupos, rodadas anteriores, H2H) continuar consumindo o formato que já conhece.
    var _classif = _matchesDeClassificatoria(t);
    var _temClassifEmMatches = _classif.matches.length > 0;
    var _sobra = hasMatches
      ? t.matches.filter(function (m) { return _classif.ids[String(m && m.id)] !== true; })
      : [];

    if (hasRounds && !hasMatches) {
      cols = cols.concat(_buildSwissColumns(t));
    } else if (_temClassifEmMatches) {
      // storage canônico: sintetiza as colunas da classificatória a partir dos matches
      var _tSint = Object.assign({}, t, { rounds: _classif.rounds, matches: [] });
      cols = cols.concat(_buildSwissColumns(_tSint));
      if (hasRounds) cols = cols.concat(_buildSwissColumns(t));   // legado + canônico convivem
    } else if (hasRounds) {
      cols = cols.concat(_buildSwissColumns(t));
    }

    // Elim tournaments use t.matches. Grupos+Elim after advance also falls here.
    if (hasMatches && (!_temClassifEmMatches || _sobra.length)) {
      cols = cols.concat(_buildElimColumns(_temClassifEmMatches ? Object.assign({}, t, { matches: _sobra }) : t));
    }

    // 3) Terminal (third-place + grand final)
    cols = cols.concat(_buildTerminalColumns(t));

    // ── Context flags ──
    var hasDoubleElim = hasMatches && t.matches.some(function (m) {
      return m.bracket === 'upper' || m.bracket === 'lower';
    });
    var hasThirdPlace = !!(t.thirdPlaceMatch && (t.thirdPlaceMatch.p1 || t.thirdPlaceMatch.p2));
    var hasPlayIn = hasMatches && t.matches.some(function (m) { return m.round === 0; });
    var hasRepechage = hasMatches && t.matches.some(function (m) { return m.round < 0; }) || !!t.hasRepechage;

    var cats = {};
    (hasMatches ? t.matches : []).forEach(function (m) { if (m.category) cats[m.category] = true; });
    (hasRounds ? t.rounds : []).forEach(function (r) {
      (r.matches || []).forEach(function (m) { if (m.category) cats[m.category] = true; });
    });

    return {
      columns: cols,
      format: t.format || null,
      stage: t.currentStage || null,
      context: {
        categories: Object.keys(cats),
        hasDoubleElim: hasDoubleElim,
        hasThirdPlace: hasThirdPlace,
        hasPlayIn: hasPlayIn,
        hasRepechage: hasRepechage,
        hasSwissRecap: hasSwissRecap
      }
    };
  };

  // ── Sanity checks (runs once in dev when ?debug=bracket-model is set) ────
  function _runSanityChecks() {
    try {
      var fixtures = [
        {
          name: 'empty tournament',
          t: {},
          expectColumns: 0
        },
        {
          name: 'single elim, 4 players, R1 done, R2 pending',
          t: {
            format: 'Eliminatórias',
            matches: [
              { id: 'm1', round: 1, p1: 'A', p2: 'B', winner: 'A' },
              { id: 'm2', round: 1, p1: 'C', p2: 'D', winner: 'C' },
              { id: 'm3', round: 2, p1: 'A', p2: 'C', winner: null }
            ]
          },
          expectColumns: 2,
          expectPhases: ['elim', 'elim'],
          expectStatuses: ['done', 'pending']
        },
        {
          name: 'swiss, 2 rounds',
          t: {
            format: 'Suíço',
            rounds: [
              { round: 1, status: 'complete', matches: [{ id: 'sm1', p1: 'A', p2: 'B', winner: 'A' }] },
              { round: 2, status: 'active', matches: [{ id: 'sm2', p1: 'A', p2: 'C', winner: null }] }
            ]
          },
          expectColumns: 2,
          expectPhases: ['swiss', 'swiss']
        },
        {
          name: 'groups phase',
          t: {
            format: 'Fase de Grupos + Eliminatórias',
            currentStage: 'groups',
            groups: [
              { name: 'Grupo A', players: ['A', 'B'], rounds: [{ round: 1, matches: [{ id: 'g1', p1: 'A', p2: 'B', winner: 'A' }] }] }
            ]
          },
          expectColumns: 1,
          expectPhases: ['groups'],
          expectSubgroups: 1
        },
        {
          name: 'swiss-as-p2 + elim',
          t: {
            format: 'Eliminatórias',
            currentStage: 'elimination',
            swissRoundsData: [
              { round: 1, matches: [{ p1: 'A', p2: 'B', winner: 'A' }] },
              { round: 2, matches: [{ p1: 'A', p2: 'C', winner: 'A' }] }
            ],
            matches: [
              { id: 'em1', round: 1, p1: 'A', p2: 'D', winner: null }
            ]
          },
          expectColumns: 3, // 2 swiss-past + 1 elim
          expectPhases: ['swiss-past', 'swiss-past', 'elim']
        }
      ];

      fixtures.forEach(function (fx) {
        var out = window._getUnifiedRounds(fx.t);
        var ok = true;
        var msgs = [];
        if (fx.expectColumns !== undefined && out.columns.length !== fx.expectColumns) {
          ok = false; msgs.push('columns=' + out.columns.length + ' expected=' + fx.expectColumns);
        }
        if (fx.expectPhases) {
          fx.expectPhases.forEach(function (p, i) {
            if (!out.columns[i] || out.columns[i].phase !== p) {
              ok = false; msgs.push('col[' + i + '].phase=' + (out.columns[i] && out.columns[i].phase) + ' expected=' + p);
            }
          });
        }
        if (fx.expectStatuses) {
          fx.expectStatuses.forEach(function (s, i) {
            if (!out.columns[i] || out.columns[i].status !== s) {
              ok = false; msgs.push('col[' + i + '].status=' + (out.columns[i] && out.columns[i].status) + ' expected=' + s);
            }
          });
        }
        if (fx.expectSubgroups !== undefined) {
          var sg = out.columns[0] && out.columns[0].subgroups ? out.columns[0].subgroups.length : 0;
          if (sg !== fx.expectSubgroups) {
            ok = false; msgs.push('subgroups=' + sg + ' expected=' + fx.expectSubgroups);
          }
        }
        if (ok) {
          window._log('%c[bracket-model ✓] ' + fx.name, 'color:var(--sp-c-4ade80,#4ade80);');
        } else {
          window._warn('[bracket-model ✗] ' + fx.name, msgs.join(' | '), out);
        }
      });
    } catch (e) {
      window._error('[bracket-model] sanity check error:', e);
    }
  }

  // ============================================================================
  // SET SCORE FORMATTING + TIE-BREAK: UMA forma de gravar, UM leitor
  //
  // GRAVAR → SEMPRE `set.tiebreak = { pointsP1, pointsP2 }` (window._tbPoints).
  //   Escolhido por ser AUTODESCRITIVO ao lado de gamesP1/gamesP2, que moram no
  //   mesmo objeto: "points" diz que são os PONTOS do tie-break, e não games.
  //   `{p1,p2}` ali é ambíguo. Também já era a forma do doc do TORNEIO, que é o
  //   registro autoritativo da partida.
  // LER → SEMPRE window._setTiebreak(set), que devolve {p1,p2} NORMALIZADO
  //   (forma interna, em memória — nunca gravada).
  //
  // ⚠️ O leitor aceita as DUAS formas e isso NÃO é indecisão: é compatibilidade
  // com o que JÁ ESTÁ GRAVADO. Medido em produção (ago/2026): matchHistory tinha
  // 100% `{p1,p2}`, casualMatches quase tudo `{p1,p2}`, e o doc do torneio
  // `{pointsP1,pointsP2}`. Reescrever o passado exigiria migração; tolerar na
  // LEITURA custa duas linhas. O que foi unificado é a ESCRITA — nenhum caminho
  // novo grava a forma curta.
  // opts.html=true → <sup style="…">(n)</sup>; else Unicode superscript digits.
  // ============================================================================
  var _SUP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻' };
  function _supDigits(n) {
    return String(n == null ? '' : n).split('').map(function(c){ return _SUP[c] || c; }).join('');
  }
  function _getSetTB(set) {
    if (!set || !set.tiebreak) return null;
    var tb = set.tiebreak;
    var p1 = tb.pointsP1 != null ? tb.pointsP1 : tb.p1;
    var p2 = tb.pointsP2 != null ? tb.pointsP2 : tb.p2;
    if (p1 == null && p2 == null) return null;
    return { p1: p1 == null ? 0 : p1, p2: p2 == null ? 0 : p2 };
  }
  // LEITOR ÚNICO (exposto): todo lugar que precisa dos pontos do TB passa por aqui,
  // em vez de ler `set.tiebreak.p1` cru — era assim que uma forma "não existia" pro
  // outro lado do app.
  window._setTiebreak = _getSetTB;
  // ESCRITOR ÚNICO: a forma canônica de gravar, num lugar só.
  window._tbPoints = function (p1, p2) {
    if (p1 == null || p2 == null || isNaN(p1) || isNaN(p2)) return null;
    return { pointsP1: Number(p1), pointsP2: Number(p2) };
  };
  window._formatSetForPlayer = function(set, playerNum, opts) {
    opts = opts || {};
    if (!set) return '';
    var g = playerNum === 1 ? set.gamesP1 : set.gamesP2;
    var out = (g == null ? '' : String(g));
    var tb = _getSetTB(set);
    if (tb) {
      var myPts = playerNum === 1 ? tb.p1 : tb.p2;
      if (opts.html) {
        out += '<sup style="font-size:0.75em;font-weight:700;">(' + myPts + ')</sup>';
      } else {
        out += '⁽' + _supDigits(myPts) + '⁾';
      }
    }
    return out;
  };
  window._formatSetCombined = function(set, opts) {
    opts = opts || {};
    if (!set) return '';
    var p1 = window._formatSetForPlayer(set, 1, opts);
    var p2 = window._formatSetForPlayer(set, 2, opts);
    return p1 + '-' + p2;
  };
  // ─── ⭐ PLANO DE SETS DA PARTIDA — a FONTE ÚNICA do "melhor de N" ────────────────
  //
  // ORDEM DO DONO (23/ago/2026): _"esses cards de jogos estão perfeitos para disputas de
  // 1 set, mas aqui temos melhor de 3. nesse caso precisava de mais uma linha indicando
  // melhor de 3 - set 1 entre os botões e os nomes/placares. confirmou o placar do 1º set,
  // esses números ficam na esquerda do box para o placar do set 2 que fica zerado até
  // receber o placar do set 2. empatou em 1-1 os sets, o placar do set 1 na esquerda do
  // placar do set 2 que por sua vez fica na esquerda do box para o Super Tie Break. Em cima
  // dos box de placar deve aparecer set 1, set 2, super tie-break (10), conforme o caso."_
  // E logo depois: _"já escreva também o código canônico para a melhor de 5"_.
  //
  // POR QUE UMA FUNÇÃO SÓ, e não um `if setsToWin===2` no render: **quatro** lugares
  // precisam da MESMA resposta e nenhum deles pode divergir —
  //   1. o card desenha as COLUNAS (quais existem, qual está em disputa, que largura);
  //   2. o card desenha os RÓTULOS em cima delas (têm de casar coluna a coluna);
  //   3. o Confirmar decide se fecha UM SET ou fecha O JOGO;
  //   4. a validação sabe se o box em disputa é um set (6-4, tie-break em 6-6) ou um
  //      SUPER TIE-BREAK (vai a 10 pontos, sem games e sem tie-break dentro).
  // Duas leituras da mesma regra divergem na primeira mudança — e aqui divergir significa
  // rótulo em cima de uma coluna que é outra coisa. [[feedback_resolution_one_logic]]
  //
  // ⛔ 1 SET NÃO PASSA POR AQUI (`multi:false`). O card de 1 set está do jeito que o dono
  // quer; a coluna nova é só pra melhor de 3/5. Beach Tennis (`fixedSet`) idem.
  //
  // A CONTA (vale pra 3 e pra 5, sem caso especial):
  //   bestOf   = setsToWin*2 - 1     → 2 ⇒ melhor de 3 · 3 ⇒ melhor de 5
  //   super TB = o ÚLTIMO SET POSSÍVEL (índice bestOf-1), quando `scoring.superTiebreak`
  //
  // ⛔ "ÚLTIMO POSSÍVEL" NÃO É "DECISIVO", E A DIFERENÇA IMPORTA (correção do dono,
  // 23/ago/2026): _"em melhor de 3 se ganhar 2 não tem super tie-break; em melhor de 5 se
  // ganhar 3 não tem STB; assim, nem sempre o STB é o set decisivo e às vezes nem tem STB."_
  // O set que DECIDE a partida é o que leva alguém a `setsToWin` — pode ser o Set 2 (2×0
  // na de 3) ou o Set 4 (3×1 na de 5), e esses são sets COMUNS. O super tie-break só
  // acontece quando a partida CHEGA ao último set, ou seja quando os sets empatam em
  // `setsToWin-1`. Na maioria dos jogos ele nunca existe.
  //
  // É por isso que as colunas são só "o que JÁ FOI JOGADO + a que está EM DISPUTA": assim
  // a régua nunca desenha, nem promete, um Super Tie-Break que talvez não aconteça. Quem
  // vence 2×0 fecha com duas colunas (Set 1 · Set 2) e a de super tie-break não nasce.
  //
  // LARGURA POR TIPO, nunca por estado: a mesma coluna mede igual confirmada, em disputa
  // ou em edição — é isso que mantém o rótulo em cima do box em TODOS os modos. Largura por
  // estado quebraria o alinhamento no instante em que o set fosse confirmado.
  //
  // `sc` é o scoring EFETIVO do jogo (window._effectiveScoring — a fase manda,
  // [[project_formato_da_partida_por_fase]]). opts.sets sobrepõe `m.sets` (o card usa isso
  // pra desenhar a proposta PENDENTE, que carrega o array dela). opts.done força "acabou".
  // Largura da coluna, em px, POR TIPO. Apertado de propósito: na melhor de 5 são CINCO
  // colunas dividindo a linha com o nome da dupla, e cada px aqui sai do nome.
  // Medido a 430px: set=34 + stb=56 deixa ~150px pro nome no pior caso (2-2 na de 5), que
  // é onde o `.sp-name-fit` ainda encolhe a fonte sem cortar. Mexer aqui é mexer no nome.
  // ⭐ 2.0.35 · ESTREITADA A PEDIDO DO DONO, e o teto é MEDIDO. Olhando o melhor de 5 na
  // coluna da chave no desktop (280px), a grade de 5 sets comia 186px dos 232px úteis da
  // linha: sobravam 8px pro nome e ele descia pro piso de 0,34rem — virava textura.
  // Ordem: _"diminui a largura dos box dos números"_.
  // ⛔ QUEM AMARRA A LARGURA É O TIE-BREAK, não o dígito. O pior conteúdo de uma coluna não é
  // "11": é `7⁽⁵⁾` — o set decidido no tie-break, com o subplacar em sobrescrito, que mede
  // 31px a 1rem. Varrido largura × tamanho do número: com o número a 1rem a coluna não passa
  // de 30px (nome fica com 28px); a 0,78rem ela desce a 24px e o nome sobe pra 58px. Abaixo
  // de 24 corta o tie-break em qualquer tamanho. Ficou o par que devolve mais nome sem cortar.
  // ⭐ 2.0.35 · E A ESCALA É POR QUANTAS COLUNAS EXISTEM. Ordem do dono: _"conforme os sets
  // vão avançando e ocupando mais espaço, os números poderiam ser maiores antes, ocupando
  // mais altura, e ir diminuindo conforme necessário — assim no set único ficam maiores, no
  // melhor de 3 entre um e outro, e no melhor de 5 ficam como no exemplo"_.
  // Ou seja: o placar usa o espaço que TEM. Com 2 colunas sobra largura, então o número
  // cresce; com 5 ele encolhe até caber. Cada degrau traz junto a largura da coluna, porque
  // as duas coisas andam amarradas pelo mesmo limite (o `7⁽⁵⁾` do tie-break).
  // ⚠️ ISTO É LARGURA POR ESTADO — e o cânone dizia "largura por TIPO, nunca por estado".
  // A razão daquele ⛔ era o RÓTULO sair de cima do box quando UMA coluna mudasse de tamanho
  // ao ser confirmada. Aqui não é uma coluna que muda: é a GRADE INTEIRA que troca de degrau,
  // rótulos e boxes juntos, lendo o mesmo `--w` do mesmo plano. O alinhamento é por
  // construção e o teste da tela o cobra em todos os degraus.
  // ⛔ Os pares (largura, fonte) são MEDIDOS contra o pior conteúdo de uma coluna, que não é
  // "11" e sim `7⁽⁵⁾` — set decidido no tie-break, com o subplacar em sobrescrito, nos DOIS
  // lados. Mexer em um sem re-medir o outro corta o tie-break.
  // MEDIDO (desenho real do número, não estimativa): o pior conteúdo de uma coluna é `6⁽⁷⁾`
  // — dois caracteres mais o sobrescrito do tie-break. Ele mede 33px a 1,15rem, 29px a 1rem e
  // 23px a 0,78rem. Cada largura abaixo é o pior + 2px de FOLGA: sem essa folga o número
  // encosta na borda da coluna e a primeira mudança de fonte do sistema o corta.
  // ── ⭐ A GEOMETRIA DO NOME NO CARD DE JOGO, NUM LUGAR SÓ (2.0.35) ────────────────────
  // Ordem do dono: _"implemente em todos os cards de forma canônica — não só no Novidades,
  // ou nos Últimos Resultados, ou nas chaves. Em TODOS os cards de torneio."_
  // Existem dois desenhos legítimos de card de jogo, e eles vão continuar existindo porque
  // mostram coisas diferentes (o da chave tem coroa, substituição e BYE; o da dashboard tem
  // "(você)" e "Ir para o torneio"). O que NÃO pode existir em dois lugares são os NÚMEROS:
  // era assim que a dashboard ficava com foto de 28px e nome de 0,8rem cravados — e com
  // `text-overflow:ellipsis`, ou seja CORTANDO o nome, que é justamente o que o cânone da
  // caixa invisível proíbe. Agora os dois leem daqui.
  // [[project_name_fit_box_canonical]] · [[feedback_unify_dual_entry_points]]
  window._cardNomeGeo = function (nMembros) {
    var dupla = (parseInt(nMembros, 10) || 1) > 1;
    var teto = dupla ? 0.78 : 0.85;
    return {
      avatar: dupla ? '20px' : '24px',   // altura da linha sai daqui: a foto é a mais alta
      boxH: +(teto * 1.35).toFixed(2),   // caixa de UMA linha
      maxRem: teto,
      minRem: dupla ? 0.52 : 0.58
    };
  };

  /* ⭐ 2.1.101 — O NÚMERO SOBE ATÉ ONDE A COLUNA DEIXA.
   * Relato do dono (02/set/2026): _"havíamos aumentado os números do placar na rodada
   * passada. isso deve ser canônico e vejo que voltou a ficar pequeno (número e campo).
   * tínhamos fechado 1 set / melhor de 3 / melhor de 5 tudo de forma canônica."_
   *
   * O QUE ELE VIU, e por que não era impressão: o caminho de UM SET usa `--sp-num-fs`
   * (1,45rem — o tamanho que ele mandou aumentar na 2.0.47). O caminho de SETS usa esta
   * escada, que estava em 1,15/1,00/0,78. A Fase 1 da Confra era 1 set e a Fase 2 é melhor
   * de 3: mudar de fase fez o número encolher quase pela metade. O cânone tinha ficado só
   * na metade do app.
   *
   * ⛔ O TETO CONTINUA MEDIDO, e o que ele mede é a COLUNA: a largura (35/31/25px) NÃO
   * muda, porque é ela que divide espaço com o nome — subir a fonte não rouba nada do nome.
   * O limite é caber DOIS DÍGITOS (o tie-break passa de 9): a régua de referência é a do
   * `.sp-mc-inp`, "dois dígitos a 1,45rem ≈ 36px". Daí 1,30 / 1,20 / 0,95 — cada degrau
   * o maior que cabe em 35 / 31 / 25px sem estourar a coluna.
   * ⛔ NÃO subir mais sem alargar a coluna primeiro; e alargar a coluna É roubar do nome. */
  window._SET_COL_ESCALA = [
    { ate: 2, set: 35, stb: 37, fs: 1.30 },   // 1 ou 2 colunas: sobra espaço, número cheio
    { ate: 3, set: 31, stb: 33, fs: 1.20 },   // 3 colunas (melhor de 3 completo)
    { ate: 5, set: 25, stb: 27, fs: 0.95 }    // 4 ou 5 colunas (melhor de 5)
  ];
  window._setColEscala = function (nCols) {
    var e = window._SET_COL_ESCALA;
    for (var i = 0; i < e.length; i++) if (nCols <= e[i].ate) return e[i];
    return e[e.length - 1];
  };
  // compat: quem lia a constante antiga continua lendo o degrau mais apertado
  window._SET_COL_W = { set: 25, stb: 27 };
  // O AVISO DA MARGEM, escrito UMA vez. Margem 1 (morte súbita) não avisa nada — anunciar
  // "dif 1 pt" seria ruído sobre a regra que a pessoa já espera.
  // A MARGEM EFETIVA, resolvida num lugar só. Nasceu porque eu tinha deixado DOIS defaults
  // pra ela — a régua caía em 2 quando o campo não vinha gravado (que é o caso de todo
  // torneio de hoje) e o card caía em "sem margem". Resultado MEDIDO: a linha de cima
  // anunciava "(dif 2 pts)" no super tie-break e o aviso do tie-break de SET não aparecia
  // nunca. Dois defaults pra mesma regra é a mesma doença de duas regras.
  // [[feedback_resolution_one_logic]]
  window._tbMargem = function (sc) {
    var n = parseInt(sc && sc.tiebreakMargin, 10);
    return (n >= 1) ? n : 2;
  };
  window._difPtsAviso = function (margem) {
    var n = parseInt(margem, 10); if (!(n >= 2)) return '';
    var _tr = null;
    try { var v = (typeof window._t === 'function') ? window._t('bracket.difPts') : null; if (v && v !== 'bracket.difPts') _tr = v; } catch (e) {}
    return _tr ? _tr.replace('{n}', n) : ('dif ' + n + ' pts');
  };
  window._matchSetPlan = function (sc, m, opts) {
    opts = opts || {};
    var _tr = function (k, fb) {
      try { var v = (typeof window._t === 'function') ? window._t(k) : null; return (v && v !== k) ? v : fb; }
      catch (e) { return fb; }
    };
    var setsToWin = parseInt(sc && sc.setsToWin, 10); if (!(setsToWin >= 1)) setsToWin = 1;
    var usesSets = (typeof window._scoringUsesSets === 'function')
      ? !!window._scoringUsesSets(sc) : !!(sc && (sc.type === 'sets' || sc.type === 'gsm'));
    var multi = !!(usesSets && setsToWin > 1 && !(sc && sc.fixedSet));
    var bestOf = setsToWin * 2 - 1;
    var stbOn = multi && !!(sc && sc.superTiebreak);
    var stbPts = parseInt(sc && sc.superTiebreakPoints, 10); if (!(stbPts >= 1)) stbPts = 10;
    // ⭐ A MARGEM DE 2 PONTOS SE ANUNCIA ANTES. Ordem do dono (23/ago/2026): _"quando for
    // tie-break ou STB que tenha diferença de 2 pontos para vencer, vamos indicar isso antes
    // (dif 2 pts)."_ Quem entra pra jogar um tie-break precisa saber que 10-9 não acaba —
    // saber depois, na hora de lançar o placar, é tarde. A margem sai daqui (régua única) e
    // vai pros TRÊS leitores: a linha que anuncia, o campo do tie-break e a validação.
    var margem = window._tbMargem(sc);

    var played = Array.isArray(opts.sets) ? opts.sets.slice()
      : (m && Array.isArray(m.sets) ? m.sets.slice() : []);
    // Sets ganhos saem SEMPRE do array — nunca de m.setsWonP1/P2. Aqueles são espelho
    // gravado; num jogo em curso o espelho pode estar meia-gravação atrás do array.
    var wonP1 = 0, wonP2 = 0;
    played.forEach(function (s) {
      if (!s) return;
      var a = Number(s.gamesP1) || 0, b = Number(s.gamesP2) || 0;
      if (a > b) wonP1++; else if (b > a) wonP2++;
    });

    var kindAt = function (i) { return (stbOn && i === bestOf - 1) ? 'stb' : 'set'; };
    // ⛔ O RÓTULO DO BOX É "STB", NÃO O NOME POR EXTENSO. Ordem do dono (23/ago/2026):
    // _"super tie-break já está escrito antes, pode colocar STB em cima do box do placar"_ —
    // a linha de cima anuncia "Super Tie-Break" inteiro, então repetir aqui só serve pra
    // quebrar o rótulo em 3 linhas e roubar largura do nome da dupla. MEDIDO: "SUPER
    // TIE-BREAK (10)" ocupava 56px de coluna e 3 linhas de altura; "STB (10)" cabe em 38.
    // ⭐ 2.0.35 · A PALAVRA "SET" NÃO SE REPETE COLUNA A COLUNA. Ordem do dono, olhando o
    // melhor de 5: _"coloca sets 1, 2, 3, 4, 5 apenas, sem repetir a palavra set toda vez"_.
    // Numa de 5 sets, "SET" aparecia CINCO vezes numa linha de 136px — e era ela que fazia a
    // linha dos rótulos quebrar em duas. Agora a coluna leva só o NÚMERO; quem diz que são
    // sets é a linha de cima ("Melhor de 5 · Set 3"), que já está ali do lado.
    // ⛔ O super tie-break MANTÉM a palavra: ele não é "o set 5", é outra coisa — e os pontos
    // ("(10)") só existem aqui, a linha de cima não os carrega. [[project_placar_por_sets_no_card]]
    // ⛔ O RÓTULO DA COLUNA CABE EM UMA LINHA, SEMPRE. Medido: "STB (10)" quer 34px e a
    // coluna do degrau apertado tem 27 — ele quebrava em duas linhas e engordava o cabeçalho
    // em 8px. Resultado: card COM super tie-break ficava mais alto que card sem, e o dono
    // viu: _"no melhor de 3 e de 5 os cards têm alturas diferentes sem qualquer motivo"_.
    // Os PONTOS saíram daqui e foram pro título, que desde a 2.0.35 tem a linha inteira só
    // pra ele — lá cabem sobrando. A coluna fica com "STB" (17px), que cabe em qualquer
    // degrau, e todos os cabeçalhos passam a medir a mesma coisa.
    var labelAt = function (i) {
      return kindAt(i) === 'stb' ? _tr('bracket.stbCurto', 'STB') : String(i + 1);
    };

    var done = !!(opts.done || (m && m.winner) ||
      wonP1 >= setsToWin || wonP2 >= setsToWin || played.length >= bestOf);

    // ⭐ O DEGRAU SAI DO FORMATO, NÃO DO ANDAMENTO. Correção do dono: _"no melhor de 3 pode
    // haver STB e precisa de espaço para isso"_. Eu tinha escolhido o degrau pelas colunas
    // JÁ desenhadas — então uma partida de melhor de 3 começava com números grandes e os
    // via encolher quando o super tie-break entrasse, e o placar mudava de tamanho no meio
    // do jogo. O tamanho agora é do FORMATO: `bestOf` é o máximo de colunas que aquele jogo
    // pode ter (o STB incluído), então o espaço dele já está reservado desde o primeiro set.
    // 1 set não passa por aqui (não tem grade); melhor de 3 fica no meio; melhor de 5 no
    // degrau mais apertado — exatamente a escada que o dono descreveu.
    var esc = window._setColEscala(multi ? bestOf : 1);
    var larg = function (k) { return k === 'stb' ? esc.stb : esc.set; };

    var cols = [], i;
    for (i = 0; i < played.length; i++) {
      cols.push({ i: i, kind: kindAt(i), label: labelAt(i), points: kindAt(i) === 'stb' ? stbPts : null,
        state: 'done', set: played[i], w: larg(kindAt(i)) });
    }
    var live = null;
    if (multi && !done && played.length < bestOf) {
      var li = played.length;
      live = { i: li, kind: kindAt(li), label: labelAt(li), points: kindAt(li) === 'stb' ? stbPts : null,
        state: 'live', set: null, w: larg(kindAt(li)) };
      cols.push(live);
    }

    // ⭐ A LINHA DE CIMA ANUNCIA O SUPER TIE-BREAK ASSIM QUE EMPATA. Ordem do dono
    // (23/ago/2026), corrigindo a minha 1ª versão que dizia "Set 3": _"não pode ser set 3
    // ou set 5. tem que estar super tie break assim que empata para as pessoas saberem que
    // o próximo set é STB"_. O aviso tem que chegar ANTES de a pessoa entrar na quadra.
    // Os PONTOS ficam de fora daqui ("Super Tie-Break", sem o "(10)"): o rótulo em cima do
    // box, na mesma linha, já os mostra — e é o que faz o texto caber. Quando não cabe, a
    // linha QUEBRA em duas (nunca reticências): perder metade do aviso é perder o aviso.
    var head = _tr('bracket.bestOf', 'Melhor de') + ' ' + bestOf;
    // os pontos do super tie-break, no título — só quando a coluna dele existe neste card
    var _temStbCol = false;
    var _avisoDif = window._difPtsAviso(margem);
    var atual = live
      ? (live.kind === 'stb'
          ? (_tr('bracket.superTiebreak', 'Super Tie-Break') + (_avisoDif ? ' (' + _avisoDif + ')' : ''))
          : (_tr('bracket.setN', 'Set') + ' ' + (live.i + 1)))
      : (wonP1 + ' × ' + wonP2);
    for (var _c = 0; _c < cols.length; _c++) if (cols[_c].kind === 'stb') _temStbCol = true;
    var _stbNoTitulo = (_temStbCol && !(live && live.kind === 'stb'))
      ? (' · ' + _tr('bracket.stbCurto', 'STB') + ' ' + stbPts) : '';
    return {
      multi: multi, setsToWin: setsToWin, bestOf: bestOf,
      superTiebreak: stbOn, superTiebreakPoints: stbPts, tiebreakMargin: margem,
      numFs: esc.fs,      // tamanho do número desta grade (degrau da escala)
      difPtsAviso: _avisoDif,
      played: played, setsWonP1: wonP1, setsWonP2: wonP2,
      done: done, columns: cols, live: live,
      headline: head + ' · ' + atual + _stbNoTitulo
    };
  };

  /* BYE não é jogo: ninguém entra em quadra, e por isso ele NÃO consome número.
   * Veio de bracket.js junto do `_assignGlobalGameNumbers`, que a usa. */
window._isByeMatch = function(m) {
  if (!m) return false;
  if (m.isBye) return true;
  var p2 = m.p2;
  return p2 === 'BYE' || p2 === 'BYE (Avança Direto)';
};

  /* ── A NUMERAÇÃO "JOGO N" — FONTE ÚNICA, E AGORA TAMBÉM NO SERVIDOR ────────────────
   * Veio de bracket.js (03/set/2026). Mora aqui porque este arquivo é VENDORIZADO pro
   * servidor: a CF `tournamentSummary` monta o torneio completo das subcoleções e pode
   * carimbar `_gameNum` no conjunto INTEIRO. A tela inicial então LÊ o número em vez de
   * recalcular sobre o resumo — que é o que produzia 168 na tela inicial e 169 na chave. */
window._assignGlobalGameNumbers = function (t) {
  if (!t) return;
  /* ⛔ TORNEIO INCOMPLETO NÃO SE NUMERA. Esta função conta 1,2,3… na ordem do render,
   * então o número de um jogo depende de QUANTOS jogos vieram antes dele. Rodar sobre um
   * torneio a que faltam partes (banco dividido: os jogos moram em subcoleções e chegam
   * DEPOIS) devolve um número menor com toda a cara de certo — MEDIDO no Confra: 110 jogos
   * na cópia da tela inicial contra 170+ na chave, e o mesmo jogo saindo `168` numa tela e
   * `169` na outra. Ordem do dono (03/set/2026): _"o número que aparece na chave é o número
   * que tem que aparecer sempre sem divergência"_.
   * `_marcaPartesQueFaltam` (store.js) já marca `_faltamPesados` e já dispara a busca das
   * partes; quando elas chegam a tela repinta e a numeração roda completa. Até lá o jogo
   * fica SEM número — que é a resposta honesta ("ainda não sei"), não um número errado.
   * [[project_derivado_nao_se_guarda_standings]] */
  if (t._faltamPesados) return;
  if (typeof window._hydrateMonarchGroups === 'function') window._hydrateMonarchGroups(t); // FONTE ÚNICA
  var isBye = window._isByeMatch || function () { return false; };
  var n = 0;
  // v4.4.69: id→número. Após _hydrateMonarchGroups, group.matches[j] É o MESMO objeto de
  // round.matches (ref compartilhada, fonte única). `stamp` carimba pelo id: a 1ª ocorrência
  // ganha ++n; visitar o mesmo objeto de novo (grupo e depois plano) reaproveita numById —
  // idempotente. Rei/Rainha numera POR GRUPO (ordem dos grupos), depois o plano confirma pelas
  // MESMAS ids. Zero cópia, zero colisão, zero fallback.
  // A travessia abaixo só COLETA a ordem cronológica; o número é atribuído no FIM
  // (_emitir), depois de aplicar a única inversão que existe: a FINAL é o último
  // jogo do torneio e o 3º/4º lugar fica um número abaixo dela — mesmo a final
  // aparecendo ACIMA do 3º na tela. Coletar antes de numerar é o que permite essa
  // garantia sem um segundo contador.
  var ordem = [];        // 1ª ocorrência de cada jogo, em ordem cronológica
  var copiasPorId = {};  // id -> todos os objetos com esse id (grupo + array plano)
  function stamp(m) {
    if (!m) return;
    if (m.isSitOut || isBye(m)) { m._gameNum = null; return; }
    var k = (m.id != null) ? String(m.id) : null;
    if (k == null) { ordem.push(m); return; }
    if (!copiasPorId[k]) { copiasPorId[k] = []; ordem.push(m); }
    copiasPorId[k].push(m);   // cópias do MESMO jogo recebem o MESMO número
  }
  function _ehTerceiro(m) {
    return !!(m && (m.isThirdPlace || m.bracket === 'thirdplace' || m.bracket === 'grand3'));
  }
  function _ehExtra(m) { return !!(m && (m.isExtra || m.condicional)); }
  function _emitir() {
    // INVERSÃO ÚNICA DO TORNEIO: tira o 3º lugar de onde estiver e recoloca
    // imediatamente ANTES da final (o último jogo que não é a final-extra
    // condicional da Dupla Eliminatória). Vale pra qualquer formato.
    var terceiros = ordem.filter(_ehTerceiro);
    if (terceiros.length) {
      ordem = ordem.filter(function (m) { return !_ehTerceiro(m); });
      var iFinal = -1;
      for (var z = ordem.length - 1; z >= 0; z--) { if (!_ehExtra(ordem[z])) { iFinal = z; break; } }
      if (iFinal < 0) iFinal = ordem.length;
      Array.prototype.splice.apply(ordem, [iFinal, 0].concat(terceiros));
    }
    ordem.forEach(function (m, i) {
      var num = i + 1;
      var k = (m.id != null) ? String(m.id) : null;
      if (k && copiasPorId[k]) copiasPorId[k].forEach(function (o) { o._gameNum = num; });
      else m._gameNum = num;
    });
    n = ordem.length;
  }
  // (1) Classificatória Liga/Suíço (t.rounds) — rodada asc (ordem do array), índice do array.
  //     Rei/Rainha numera POR GRUPO na ordem do array de grupos (A, B, C…), jogos dentro do grupo
  //     em ordem (a1 antes de b2) — a fonte de ordem é o GRUPO, não o array plano rd.matches (que a
  //     inscrição tardia deixa fora de ordem). Depois carimba o array plano pelas MESMAS ids
  //     (reaproveita numById) pra as duas cópias baterem.
  (t.rounds || []).forEach(function (rd) {
    if (rd && Array.isArray(rd.monarchGroups) && rd.monarchGroups.length) {
      rd.monarchGroups.forEach(function (g) { (((g && g.matches) || [])).forEach(stamp); });
      (((rd && rd.matches) || [])).forEach(stamp); // cópias plano por id (num já definido acima)
    } else {
      (((rd && rd.matches) || [])).forEach(stamp);
    }
  });
  // (2) Fases canônicas (t.matches) por phaseIndex asc.
  var byPhase = {};
  (t.matches || []).forEach(function (m) { var p = (m && m.phaseIndex) || 0; (byPhase[p] = byPhase[p] || []).push(m); });
  Object.keys(byPhase).map(Number).sort(function (a, b) { return a - b; }).forEach(function (p) {
    var ms = byPhase[p];
    // Dupla Eliminatória: intercala upper/lower por rodada, grand no fim.
    var hasDE = ms.some(function (m) { return m.bracket === 'upper' || m.bracket === 'lower' || m.bracket === 'grand'; });
    if (hasDE) {
      // Intercala por POSIÇÃO DE COLUNA (1ª sup, 1ª inf, 2ª sup…), NÃO por nº de rodada — a
      // repescagem adiciona uma coluna a mais no upper (round 0). Mesma ordem do render
      // (_assignGameNums) → dashboard e chave mostram o MESMO "Jogo N". (pedido do dono)
      var _rnd = function (m) { return (m.round == null) ? 1 : m.round; };
      var _distinct = function (br) {
        var seen = {}, out = [];
        ms.forEach(function (m) { if (m.bracket === br) { var r = _rnd(m); if (!seen[r]) { seen[r] = 1; out.push(r); } } });
        return out.sort(function (a, b) { return a - b; });
      };
      var upRounds = _distinct('upper'), loRounds = _distinct('lower');
      var maxCols = Math.max(upRounds.length, loRounds.length);
      for (var i = 0; i < maxCols; i++) {
        if (upRounds[i] != null) ms.filter(function (m) { return m.bracket === 'upper' && _rnd(m) === upRounds[i]; }).forEach(stamp);
        if (loRounds[i] != null) ms.filter(function (m) { return m.bracket === 'lower' && _rnd(m) === loRounds[i]; }).forEach(stamp);
      }
      // 3º/4º da Dupla Eliminatória: entra na coleta aqui; _emitir() garante que
      // ele fica um número ABAIXO da Grande Final. Antes este caminho ignorava o
      // 3º lugar por completo — ele ficava sem número nenhum.
      ms.filter(_ehTerceiro).forEach(stamp);
      ms.filter(function (m) { return m.bracket === 'grand'; }).forEach(stamp);
      return;
    }
    // Tiers na ordem de render.
    var tierOrder = ['gold', 'silver', 'main', 'line3', 'line4'];
    var present = {};
    ms.forEach(function (m) { var bk = m.bracket || 'main'; if (bk !== 'grandfinal' && bk !== 'thirdplace') present[bk] = 1; });
    var tierKeys = tierOrder.filter(function (k) { return present[k]; });
    Object.keys(present).forEach(function (k) { if (tierKeys.indexOf(k) === -1) tierKeys.push(k); });
    tierKeys.forEach(function (bk) {
      var byRound = {};
      ms.filter(function (m) { return (m.bracket || 'main') === bk && !m.isThirdPlace; }).forEach(function (m) {
        var r = (m.round == null) ? 1 : m.round; (byRound[r] = byRound[r] || []).push(m);
      });
      var rounds = Object.keys(byRound).map(Number).sort(function (a, b) { return a - b; });
      var thirdM = ms.filter(function (m) { return (m.bracket || 'main') === bk && m.isThirdPlace; })[0];
      rounds.forEach(function (rn, idx) {
        var real = byRound[rn].filter(function (m) { return !isBye(m); });
        real.forEach(stamp);
      });
      if (thirdM) stamp(thirdM);   // posição final é decidida por _emitir()
    });
    ms.filter(function (m) { return (m.bracket || '') === 'grandfinal'; }).forEach(stamp);
  });

  // t.thirdPlaceMatch mora FORA de t.matches (_appendCanonicalColumn grava nesse
  // campo próprio) — sem isto ele NUNCA recebia número. _emitir() o coloca logo
  // abaixo da final.
  if (t.thirdPlaceMatch) stamp(t.thirdPlaceMatch);

  _emitir();
};

  /* ── DESENHO DOS SETS — A MESMA GRADE NA CHAVE E NA TELA INICIAL ─────────────────────
   * Ordem do dono (03/set/2026): _"o que for na chave deve ser mostrado sempre que o jogo
   * for mostrado na dashboard para qualquer sessão. próximo, novidade e seus últimos"_.
   *
   * A régua (`_matchSetPlan`) já era única, mas o DESENHO não: a chave tinha os construtores
   * como closures locais do `renderMatchCard` e a tela inicial (`_miniBracketCard`) não
   * desenhava set nenhum — nem o "Melhor de 3 · Set 1", nem as colunas. Dois desenhos do
   * mesmo jogo divergem na primeira mudança, que é exatamente o que aconteceu.
   *
   * Aqui ficam os dois construtores READ-ONLY, que é o que a tela inicial precisa. A chave
   * segue com a versão dela porque ali a coluna é INTERATIVA (input do set em disputa,
   * clique pra corrigir set confirmado) — mas as duas leem o MESMO `plan` e escrevem as
   * MESMAS classes (`sp-set-*`, em css/components.css), então pintam igual.
   * [[project_placar_por_sets_no_card]] */

  /** Uma célula de número de set, do ponto de vista de um lado (1 ou 2). */
  function _spSetNum(c, side, italico) {
    var g = Number(side === 1 ? c.set.gamesP1 : c.set.gamesP2) || 0;
    var o = Number(side === 1 ? c.set.gamesP2 : c.set.gamesP1) || 0;
    var cor = g > o ? '#4ade80' : (o > g ? '#f87171' : 'var(--text-muted)');
    var txt = (typeof window._formatSetForPlayer === 'function')
      ? window._formatSetForPlayer(c.set, side, { html: true })
      : String(g);
    var _cor = (typeof window._spCor === 'function') ? window._spCor(cor, 'color') : cor;
    return '<span class="sp-set-num" style="color:' + _cor + (italico ? ';font-style:italic;' : '') + '">' + txt + '</span>';
  }

  /** A linha de rótulos: "SETS" + o rótulo de cada coluna (Set 1, Set 2, STB…). */
  window._setHeadHtml = function (plan, opts) {
    opts = opts || {};
    if (!plan || !plan.multi || !plan.columns || !plan.columns.length) return '';
    var _sf = window._safeHtml || function (x) { return String(x == null ? '' : x); };
    var _tr = function (k, fb) {
      try { var v = (typeof window._t === 'function') ? window._t(k) : null; return (v && v !== k) ? v : fb; }
      catch (e) { return fb; }
    };
    var fsVar = plan.numFs ? ('--sp-num-fs-set:' + plan.numFs + 'rem;') : '';
    var labels = plan.columns.map(function (c) {
      return '<div class="sp-set-col" style="--w:' + c.w + 'px;">' +
        '<span class="sp-set-lbl' + (c.state === 'live' ? ' sp-set-lbl--live' : '') + '">' +
        _sf(c.label) + '</span></div>';
    }).join('');
    return '<div class="sp-set-head"' + (opts.id ? ' id="' + _sf(opts.id) + '"' : '') + '>' +
        '<span class="sp-set-head-ttl">' + _sf(plan.headline) + '</span>' +
        '<div class="sp-set-head-linha2">' +
          '<span class="sp-set-head-sets">' + _sf(_tr('bracket.setsLabel', 'SETS')) + '</span>' +
          '<div class="sp-set-grid" style="' + fsVar + '">' + labels + '</div>' +
        '</div>' +
      '</div>';
  };

  /** A grade de números de UM lado. Coluna em disputa entra como zero (read-only). */
  window._setGridHtml = function (plan, side, opts) {
    opts = opts || {};
    if (!plan || !plan.multi || !plan.columns || !plan.columns.length) return '';
    var fsVar = plan.numFs ? ('--sp-num-fs-set:' + plan.numFs + 'rem;') : '';
    var cels = plan.columns.map(function (c) {
      var dentro = (c.state === 'live')
        ? '<span class="sp-set-zero">0</span>'
        : _spSetNum(c, side, !!opts.italico);
      return '<div class="sp-set-col" style="--w:' + c.w + 'px;">' + dentro + '</div>';
    }).join('');
    return '<div class="sp-set-grid" style="' + fsVar + '">' + cels + '</div>';
  };

  // ── SIMULAR UMA PARTIDA INTEIRA (dev) — pela MESMA régua que desenha o card ──────
  // Ordem do dono (23/ago/2026): _"o simular fase (dev) está simulando 1 set e entregando o
  // ganhador do jogo com apenas 1 set. O certo seria simular o melhor de 3 ou de 5 quando
  // for o caso."_ E estava: o simulador cravava `6 × aleatório` direto em scoreP1/scoreP2,
  // sem nunca olhar o formato da fase — melhor de 3, melhor de 5 e super tie-break passavam
  // batido, e um jogo fechava com um set só.
  //
  // ⛔ NÃO EXISTE UMA SEGUNDA REGRA DE FORMATO AQUI. Quem diz quantos sets a partida tem, e
  // qual set é super tie-break, é `_matchSetPlan` — a mesma régua das colunas, do Confirmar e
  // da validação. O simulador só SORTEIA dentro do que ela permite.
  // [[project_placar_por_sets_no_card]] · [[feedback_resolution_one_logic]]
  //
  // `rnd` é injetável pra o teste poder cravar a sequência (sem ela, Math.random).
  // Devolve null quando a partida NÃO é melhor de N — aí o chamador segue com o caminho de
  // 1 set que ele já tinha, intocado.
  window._simularPartida = function (sc, opts) {
    opts = opts || {};
    var rnd = (typeof opts.rnd === 'function') ? opts.rnd : Math.random;
    var plan = window._matchSetPlan(sc, null, {});
    if (!plan || !plan.multi) return null;

    var g = parseInt(sc && sc.gamesPerSet, 10); if (!(g >= 1)) g = 6;
    var tbLigado = !(sc && sc.tiebreakEnabled === false);
    var perdedorNoTB = (typeof window._tbLoserGames === 'function')
      ? window._tbLoserGames(sc, opts.sport) : g;
    var margem = parseInt(sc && sc.tiebreakMargin, 10); if (!(margem >= 1)) margem = 2;
    var ptsTB = parseInt(sc && sc.tiebreakPoints, 10); if (!(ptsTB >= 1)) ptsTB = 7;

    var sets = [], v1 = 0, v2 = 0, i = 0;
    while (v1 < plan.setsToWin && v2 < plan.setsToWin && i < plan.bestOf) {
      var ehSTB = plan.superTiebreak && i === plan.bestOf - 1;
      var p1Venceu = rnd() < 0.5;
      var set;
      if (ehSTB) {
        // Super tie-break: o vencedor chega aos pontos configurados e abre a margem.
        var alvo = plan.superTiebreakPoints;
        var perdeu = Math.floor(rnd() * Math.max(1, alvo - margem + 1));   // 0 .. alvo-margem
        set = p1Venceu ? { gamesP1: alvo, gamesP2: perdeu } : { gamesP1: perdeu, gamesP2: alvo };
        set.superTiebreak = true;
      } else if (tbLigado && rnd() < 0.22) {
        // Set decidido no tie-break: o placar de GAMES é (perdedorNoTB+1) × perdedorNoTB e o
        // subplacar de PONTOS vai junto — é o que o card desenha como 7⁽⁵⁾.
        var pv = ptsTB + Math.floor(rnd() * 3);                            // 7, 8 ou 9
        var pp = (pv > ptsTB) ? pv - margem : Math.floor(rnd() * Math.max(1, ptsTB - margem + 1));
        set = p1Venceu ? { gamesP1: perdedorNoTB + 1, gamesP2: perdedorNoTB }
                       : { gamesP1: perdedorNoTB, gamesP2: perdedorNoTB + 1 };
        var tb = (typeof window._tbPoints === 'function')
          ? window._tbPoints(p1Venceu ? pv : pp, p1Venceu ? pp : pv) : null;
        if (tb) set.tiebreak = tb;
      } else {
        var perdeuG = Math.floor(rnd() * Math.max(1, g - 1));              // 0 .. g-2
        set = p1Venceu ? { gamesP1: g, gamesP2: perdeuG } : { gamesP1: perdeuG, gamesP2: g };
      }
      sets.push(set);
      if (p1Venceu) v1++; else v2++;
      i++;
    }

    var tg1 = 0, tg2 = 0;
    sets.forEach(function (x) { tg1 += Number(x.gamesP1) || 0; tg2 += Number(x.gamesP2) || 0; });
    return {
      sets: sets, setsWonP1: v1, setsWonP2: v2,
      scoreP1: v1, scoreP2: v2,                 // no melhor de N o PLACAR do jogo é em sets
      totalGamesP1: tg1, totalGamesP2: tg2,
      p1Venceu: v1 > v2
    };
  };

  // v1.8.79: "quantos pontos viram 0/15/30/40/AD" saiu de dentro do overlay do
  // placar ao vivo e virou função PURA aqui, porque o REPLAY precisa da MESMA
  // conversão pra redesenhar uma partida gravada. Duas implementações da mesma
  // regra divergem na primeira mudança (e aí o replay mostraria um placar que
  // nunca existiu) — por isso o overlay passou a delegar pra cá em vez de manter
  // a cópia dele. `cfg` traz o que antes vinha do closure: countingType,
  // isFixedSet e deuceRule.
  window._formatGamePoint = function(pts, oppPts, isTb, cfg) {
    cfg = cfg || {};
    if (isTb) return String(pts);
    if (cfg.countingType === 'tennis' && !cfg.isFixedSet) {
      if (pts >= 3 && oppPts >= 3) {
        if (cfg.deuceRule) {
          if (pts === oppPts) return '40';
          if (pts > oppPts) return 'AD';
          return '40';
        }
        return '40'; // sem vantagem: ponto de ouro no 40-40
      }
      var map = [0, 15, 30, 40];
      return String(pts < 4 ? map[pts] : 40);
    }
    return String(pts);
  };

  // ══ ⭐ QUEM VENCEU ESTE JOGO — REGRA ÚNICA (2.0.1) ═══════════════════════════════
  // Devolve 1 (p1), 2 (p2), 0 (empate) ou null (sem resultado).
  //
  // 🔴 O QUE ISTO CONSERTA, medido nos documentos REAIS da Confra (21/ago/2026):
  // o vencedor é gravado como uma STRING DE NOMES composta ("Fulano / Ciclano"), e ela deixa
  // de bater com o slot quando a composição da dupla muda depois do resultado (substituição,
  // troca de parceiro, nome editado). Três jogos do torneio estavam assim — exemplo real:
  //     winner "Pessoa 53 / Pessoa 52"   p1 "Pessoa 49 / Pessoa 51"   p2 "Pessoa 50 / Pessoa 52"
  //     scoreP1 1 · scoreP2 6
  // Como `winner === p1` e `winner === p2` davam FALSO nos dois lados, a tela pintava os DOIS
  // números de vermelho e nenhuma tarja verde — foi o que o dono viu na dashboard: um 1 e um 6
  // ambos como perdedores. Comparar NOME é frágil por natureza; a identidade do slot é o uid
  // (ver project_match_slot_uid_identity / project_uid_primary_identity).
  //
  // A ordem abaixo vai do mais forte pro mais fraco, e NUNCA inventa vencedor onde não há
  // resultado (`m.winner` vazio → null, e ponto).
  window._matchWinnerSide = function (m) {
    if (!m) return null;
    if (m.draw || m.winner === 'draw') return 0;
    if (!m.winner) return null;
    // 1. O caminho normal: a string bate com o slot.
    if (m.winner === m.p1) return 1;
    if (m.winner === m.p2) return 2;
    // 2. Por UID — a identidade estrutural do slot. Cobre o nome trocado depois do resultado.
    var wu = m.winnerUids || m.winnerUid;
    if (wu) {
      var lista = Array.isArray(wu) ? wu : [wu];
      var t1 = m.team1Uids || (m.p1Uid ? [m.p1Uid] : []);
      var t2 = m.team2Uids || (m.p2Uid ? [m.p2Uid] : []);
      var bate = function (t) { return lista.length && lista.every(function (u) { return t.indexOf(u) !== -1; }); };
      if (bate(t1)) return 1;
      if (bate(t2)) return 2;
    }
    // 3. Pelo PLACAR, que está no mesmo documento e é inequívoco. Sets primeiro (é o placar
    //    que decide a partida quando o formato usa sets), games/pontos depois.
    var a = m.setsWonP1, b = m.setsWonP2;
    if (!(a > 0 || b > 0)) { a = m.scoreP1; b = m.scoreP2; }
    if (typeof a === 'number' && typeof b === 'number' && a !== b) return a > b ? 1 : 2;
    // 4. Há `winner` mas nada o resolve: NÃO chutar. Quem chama decide o que mostrar.
    return null;
  };

  // ══ ⭐ CARIMBAR O VENCEDOR — o lado de quem ESCREVE (2.0.1) ══════════════════════
  // `m.winner` é uma STRING DE NOMES e isso é dívida conhecida: a campanha de identidade por
  // uid (project_match_slot_uid_identity) parou no ITEM 3 · FASE 3 — a FASE 4, que migraria o
  // storage do slot pra uid, nunca foi feita. Enquanto o slot for nome, TODA mudança legítima
  // na composição (substituição, W.O., rename) ORFANIZA o vencedor gravado: o nome continua
  // apontando pra dupla que venceu e o slot já é outro. Foi assim que 3 jogos da Confra
  // ficaram com "dois perdedores" na tela.
  //
  // Aqui a sangria PARA na origem: quem decide o vencedor SEMPRE sabe o lado (1 ou 2), então
  // grava junto a identidade ESTRUTURAL do lado. Daí em diante a leitura resolve por uid e
  // nome nenhum pode envelhecer. Os jogos antigos (sem `winnerUids`) continuam resolvidos
  // pelo placar, no `_matchWinnerSide` acima — é a ponte até a migração.
  window._stampWinner = function (m, side) {
    if (!m || (side !== 1 && side !== 2)) return;
    m.winner = (side === 1) ? m.p1 : m.p2;
    m.draw = false;
    var uids = (typeof window._slotUids === 'function') ? window._slotUids(m, side) : null;
    // Guest sem conta não tem uid, e a string É a identidade legítima dele — nesse caso não
    // há o que carimbar (e um array vazio mentiria dizendo "resolvi por uid").
    if (uids && uids.length) m.winnerUids = uids.slice();
    else delete m.winnerUids;
  };

  // ══ ⭐ QUEM VENCEU no placar PROPOSTO (2.0.3) ════════════════════════════════════
  // Mesmo problema, um degrau antes: `pendingResult.winner` também é NOME. Um placar
  // proposto antes de uma substituição ficava órfão do mesmo jeito, e o card do jogo
  // pendente pintava dois perdedores. Resolve pela MESMA regra, montando o jogo hipotético
  // com o placar proposto — o `winnerUids` do pendente, quando existe, manda em tudo.
  window._pendingWinnerSide = function (m, pr) {
    if (!m || !pr) return null;
    return window._matchWinnerSide({
      winner: pr.winner, draw: pr.draw,
      p1: m.p1, p2: m.p2,
      winnerUids: pr.winnerUids,
      team1Uids: m.team1Uids, team2Uids: m.team2Uids,
      p1Uid: m.p1Uid, p2Uid: m.p2Uid,
      setsWonP1: pr.setsWonP1, setsWonP2: pr.setsWonP2,
      scoreP1: pr.scoreP1, scoreP2: pr.scoreP2
    });
  };

  // 2.0.3: Node também (harness headless / vendor da CF carregado direto). Sem isto, um
  // arquivo que roda fora do browser não alcança a regra única e teria que reimplementá-la —
  // que é exatamente o defeito que ela existe pra matar. Mesmo padrão do standings-core.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      matchWinnerSide: window._matchWinnerSide,
      pendingWinnerSide: window._pendingWinnerSide,
      stampWinner: window._stampWinner
    };
  }

  // Expose for manual invocation: window._bracketModelSanityChecks()
  window._bracketModelSanityChecks = _runSanityChecks;

  // Auto-run when ?debug=bracket-model in URL
  if (typeof location !== 'undefined' && location.search &&
      location.search.indexOf('debug=bracket-model') !== -1) {
    setTimeout(_runSanityChecks, 500);
  }
})();
