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
      return {
        name: window._groupDisplayName(g, gi),
        players: (g.players || g.participants || []).slice(),
        matches: gMatches,
        rounds: gRounds
      };
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

    // Swiss / liga / monarch → t.rounds[round-1]
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
  window._getUnifiedRounds = function _getUnifiedRounds(t) {
    if (!t || typeof t !== 'object') {
      return { columns: [], format: null, stage: null, context: {} };
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

    // Swiss / Liga tournaments use t.rounds exclusively.
    if (hasRounds && !hasMatches) {
      cols = cols.concat(_buildSwissColumns(t));
    }

    // Elim tournaments use t.matches. Grupos+Elim after advance also falls here.
    if (hasMatches) {
      cols = cols.concat(_buildElimColumns(t));
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
          window._log('%c[bracket-model ✓] ' + fx.name, 'color:#4ade80;');
        } else {
          window._warn('[bracket-model ✗] ' + fx.name, msgs.join(' | '), out);
        }
      });
    } catch (e) {
      window._error('[bracket-model] sanity check error:', e);
    }
  }

  // ============================================================================
  // SET SCORE FORMATTING
  // Shared helpers for rendering set scores with per-team tiebreak scores as
  // superscript in parentheses. Normalizes two tiebreak shapes:
  //   - casual:     set.tiebreak = { p1, p2 }
  //   - tournament: set.tiebreak = { pointsP1, pointsP2 }
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
  window._formatSetForPlayer = function(set, playerNum, opts) {
    opts = opts || {};
    if (!set) return '';
    var g = playerNum === 1 ? set.gamesP1 : set.gamesP2;
    var out = (g == null ? '' : String(g));
    var tb = _getSetTB(set);
    if (tb) {
      var myPts = playerNum === 1 ? tb.p1 : tb.p2;
      if (opts.html) {
        out += '<sup style="font-size:0.55em;font-weight:600;">(' + myPts + ')</sup>';
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

  // Expose for manual invocation: window._bracketModelSanityChecks()
  window._bracketModelSanityChecks = _runSanityChecks;

  // Auto-run when ?debug=bracket-model in URL
  if (typeof location !== 'undefined' && location.search &&
      location.search.indexOf('debug=bracket-model') !== -1) {
    setTimeout(_runSanityChecks, 500);
  }
})();
