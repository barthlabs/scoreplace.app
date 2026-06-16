/* phases-engine.js — Construtor de Fases (motor multi-fase)
 *
 * Roda torneios com t.phases[] (≥2 fases). A fase 0 é o formato do topo do form
 * (origem: inscrição + sorteio). Fases 1+ puxam participantes da fase anterior
 * por colocação de grupo, opcionalmente formando duplas fixas, e semeiam em
 * uma ou duas chaves (ex.: Ouro/Prata) que convergem numa grande final.
 *
 * Este arquivo concentra a LÓGICA PURA (seeding, pareamento, geração de chaves,
 * convergência) para ser testável headless (Node). A integração com o fluxo de
 * sorteio/encerramento de rodada do app chama window._maybeAdvanceMultiPhase(t).
 *
 * Convenção de campos novos em matches:
 *   bracket: 'gold' | 'silver' | 'grandfinal' | 'thirdplace' | 'main'
 *   tierLabel: rótulo legível da chave ('🥇 Ouro', '🥈 Prata', ...)
 *   nextMatchId / nextSlot          → para onde vai o VENCEDOR (já suportado por _advanceWinner)
 *   loserNextMatchId / loserNextSlot → para onde vai o PERDEDOR (aditivo; _advanceWinner estendido)
 *   phaseIndex: índice da fase a que o match pertence
 */
(function () {
  'use strict';

  function isMultiPhase(t) {
    return !!(t && Array.isArray(t.phases) && t.phases.length > 1);
  }

  // Constrói objeto de time a partir de membros (standings/participant objects).
  // Mantém p{N}Name/Uid/Email/Photo + participants[] como o resto do app espera.
  function mkTeam(members) {
    var names = members.map(function (m) { return m.name; });
    var obj = { displayName: names.join(' / '), name: names.join(' / ') };
    members.forEach(function (m, i) {
      obj['p' + (i + 1) + 'Name'] = m.name;
      if (m.uid) obj['p' + (i + 1) + 'Uid'] = m.uid;
      if (m.email) obj['p' + (i + 1) + 'Email'] = m.email;
      if (m.photoURL) obj['p' + (i + 1) + 'Photo'] = m.photoURL;
    });
    obj.participants = members.slice();
    obj.fixedPair = members.length > 1;
    return obj;
  }

  // A partir dos grupos da fase anterior + mapping, devolve { dest: [teamObjs] }.
  // mapping: [{ dest:'upper'|'lower'|'main', rankFrom, rankTo }]
  // fixedPairs=true → os jogadores das colocações de UM grupo viram dupla (2 a 2).
  // pairingStrategy: 'top' (1º+2º, 3º+4º…) ou 'balanced' (1º+último, 2º+penúltimo…).
  function buildEntrantsByDest(prevGroups, mapping, fixedPairs, computeStandings, pairingStrategy) {
    var byDest = {};
    mapping.forEach(function (mp) { if (!byDest[mp.dest]) byDest[mp.dest] = []; });
    (prevGroups || []).forEach(function (g) {
      var standings = computeStandings(g) || [];
      mapping.forEach(function (mp) {
        var picked = [];
        for (var r = mp.rankFrom; r <= mp.rankTo; r++) {
          var s = standings[r - 1];
          if (s) picked.push(s);
        }
        if (!picked.length) return;
        if (fixedPairs) {
          if (pairingStrategy === 'balanced') {
            // Equilibrado: 1º+último, 2º+penúltimo… (junta forte com fraco)
            var lo = 0, hi = picked.length - 1;
            while (lo < hi) { byDest[mp.dest].push(mkTeam([picked[lo], picked[hi]])); lo++; hi--; }
            if (lo === hi) byDest[mp.dest].push(mkTeam([picked[lo]])); // sobra ímpar = solo
          } else {
            // 'top' (default): adjacentes — 1º+2º, 3º+4º…
            for (var i = 0; i < picked.length; i += 2) {
              byDest[mp.dest].push(mkTeam(picked.slice(i, i + 2)));
            }
          }
        } else {
          picked.forEach(function (s) { byDest[mp.dest].push(mkTeam([s])); });
        }
      });
    });
    return byDest;
  }

  // Gera uma chave de eliminatória simples a partir de uma lista de times semeada.
  // Seeding simples 1×N, 2×(N-1)… (mesma convenção de _advanceMonarchToElimination),
  // padding com BYE até potência de 2. Devolve matches com links nextMatchId/nextSlot.
  function genTierBracket(teams, bracketKey, idPrefix) {
    teams = teams || [];
    var n = teams.length;
    if (n === 0) return { matches: [], finalMatchId: null, soleWinner: null };
    if (n === 1) return { matches: [], finalMatchId: null, soleWinner: teams[0].displayName };

    var pow = 1; while (pow < n) pow *= 2;
    var totalRounds = Math.round(Math.log(pow) / Math.log(2));
    var counter = 0;
    function mkId() { return idPrefix + '-' + (counter++); }

    var matches = [];
    var roundsMap = {};
    var r1 = [];
    for (var i = 0; i < pow / 2; i++) {
      var t1 = teams[i] || null;
      var t2 = teams[pow - 1 - i] || null;
      var p1 = t1 ? t1.displayName : 'BYE';
      var p2 = t2 ? t2.displayName : 'BYE';
      var isBye = !t1 || !t2;
      var m = {
        id: mkId(), round: 1, bracket: bracketKey,
        p1: p1, p2: p2,
        winner: isBye ? (t1 ? p1 : (t2 ? p2 : null)) : null,
        isBye: isBye
      };
      if (t1) m.team1Obj = t1;
      if (t2) m.team2Obj = t2;
      r1.push(m); matches.push(m);
    }
    roundsMap[1] = r1;

    for (var r = 2; r <= totalRounds; r++) {
      var prev = roundsMap[r - 1];
      var cnt = prev.length / 2;
      roundsMap[r] = [];
      for (var j = 0; j < cnt; j++) {
        var mm = { id: mkId(), round: r, bracket: bracketKey, p1: 'TBD', p2: 'TBD', winner: null };
        roundsMap[r].push(mm); matches.push(mm);
      }
      prev.forEach(function (pm, idx) {
        var nm = roundsMap[r][Math.floor(idx / 2)];
        pm.nextMatchId = nm.id;
        pm.nextSlot = (idx % 2 === 0) ? 'p1' : 'p2';
      });
    }

    // Propaga BYEs da R1 para o slot correspondente da R2
    if (totalRounds >= 2) {
      r1.forEach(function (m) {
        if (m.isBye && m.winner && m.nextMatchId) {
          var nm = matches.filter(function (x) { return x.id === m.nextMatchId; })[0];
          if (nm) { if (m.nextSlot === 'p1') nm.p1 = m.winner; else nm.p2 = m.winner; }
        }
      });
    }

    var finalMatchId = roundsMap[totalRounds][0].id;
    return { matches: matches, finalMatchId: finalMatchId, soleWinner: null, totalRounds: totalRounds };
  }

  var DEST_BRACKET = { upper: 'gold', lower: 'silver', main: 'main' };
  var DEST_LABEL = { upper: '🥇 Ouro', lower: '🥈 Prata', main: 'Eliminatória' };

  // Liga o match final de uma chave (tier) à grande final (vencedor) e à disputa
  // de 3º/4º (perdedor). Se a chave tem 1 time só (soleWinner), preenche direto.
  function linkTierToFinal(tier, gf, gfSlot, third, thirdSlot, allMatches) {
    if (!tier) return;
    if (tier.soleWinner) {
      if (gf) gf[gfSlot] = tier.soleWinner;
      return;
    }
    if (!tier.finalMatchId) return;
    var fm = allMatches.filter(function (x) { return x.id === tier.finalMatchId; })[0];
    if (!fm) return;
    if (gf) { fm.nextMatchId = gf.id; fm.nextSlot = gfSlot; }
    if (third) { fm.loserNextMatchId = third.id; fm.loserNextSlot = thirdSlot; }
  }

  // Monta TODAS as chaves de uma fase a partir dos grupos da fase anterior.
  // Devolve { matches:[...], tiers:{dest:res}, converge:{gf,third} }.
  function buildPhaseBrackets(prevGroups, phaseCfg, computeStandings, idPrefix) {
    idPrefix = idPrefix || ('ph-' + ((phaseCfg && phaseCfg.name) || 'x').replace(/\s+/g, '_'));
    var src = (phaseCfg && phaseCfg.source) || {};
    var mapping = (src.mapping && src.mapping.length) ? src.mapping : [{ dest: 'main', rankFrom: 1, rankTo: 2 }];
    var fixedPairs = phaseCfg ? (phaseCfg.fixedPairs !== false) : true;
    var pairingStrategy = (phaseCfg && phaseCfg.pairingStrategy) || 'top';

    var byDest = buildEntrantsByDest(prevGroups, mapping, fixedPairs, computeStandings, pairingStrategy);

    var allMatches = [];
    var tiers = {};
    // ordem estável: upper(Ouro) antes de lower(Prata)
    var destOrder = ['upper', 'lower', 'main'].filter(function (d) { return byDest[d]; });
    Object.keys(byDest).forEach(function (d) { if (destOrder.indexOf(d) === -1) destOrder.push(d); });

    destOrder.forEach(function (dest) {
      var bracketKey = DEST_BRACKET[dest] || dest;
      var res = genTierBracket(byDest[dest], bracketKey, idPrefix + '-' + bracketKey);
      // Nome da trilha: usa o que o organizador digitou (mapping[].label), com o
      // ícone de medalha como prefixo; senão cai no default (🥇 Ouro / 🥈 Prata).
      var _mp = mapping.filter(function (m) { return m.dest === dest; })[0];
      var _custom = (_mp && _mp.label) ? String(_mp.label).trim() : '';
      var _icon = (dest === 'upper') ? '🥇 ' : (dest === 'lower') ? '🥈 ' : '';
      var _label = _custom ? (_icon + _custom) : (DEST_LABEL[dest] || dest);
      res.matches.forEach(function (m) { m.tierLabel = _label; });
      allMatches = allMatches.concat(res.matches);
      tiers[dest] = res;
    });

    var converge = null;
    if (tiers.upper && tiers.lower) {
      var withGF = phaseCfg ? (phaseCfg.grandFinal !== false) : true;
      var withThird = phaseCfg ? (phaseCfg.thirdPlace !== false) : true;
      var gf = null, third = null, convMatches = [];
      if (withGF) {
        gf = { id: idPrefix + '-grandfinal', bracket: 'grandfinal', round: 99, p1: 'TBD', p2: 'TBD', winner: null, tierLabel: '🏆 Grande Final' };
        convMatches.push(gf);
      }
      if (withThird) {
        third = { id: idPrefix + '-thirdplace', bracket: 'thirdplace', round: 99, p1: 'TBD', p2: 'TBD', winner: null, tierLabel: '🥉 Disputa de 3º/4º' };
        convMatches.push(third);
      }
      allMatches = allMatches.concat(convMatches);
      linkTierToFinal(tiers.upper, gf, 'p1', third, 'p1', allMatches);
      linkTierToFinal(tiers.lower, gf, 'p2', third, 'p2', allMatches);
      converge = { gf: gf, third: third, matches: convMatches };
    }

    return { matches: allMatches, tiers: tiers, converge: converge, byDest: byDest };
  }

  // ── Integração com o torneio ──────────────────────────────────────────────

  // Grupos da fase anterior: última rodada Rei/Rainha com monarchGroups; senão
  // t.groups (estilo Grupos+Elim).
  function prevPhaseGroups(t) {
    var rounds = t.rounds || [];
    for (var i = rounds.length - 1; i >= 0; i--) {
      var r = rounds[i];
      if (r && Array.isArray(r.monarchGroups) && r.monarchGroups.length) return r.monarchGroups;
    }
    if (Array.isArray(t.groups) && t.groups.length) return t.groups;
    return [];
  }

  // A fase ATUAL está completa? (libera o avanço)
  function phaseComplete(t) {
    if (!isMultiPhase(t)) return false;
    var cur = t.currentPhaseIndex || 0;
    if (cur === 0) {
      // Fase classificatória (Rei/Rainha): nº de rodadas jogadas >= configurado e
      // todos os jogos dos grupos da última rodada decididos.
      var cfg = t.phases[0] || {};
      var need = parseInt(cfg.rounds) || 1;
      var monRounds = (t.rounds || []).filter(function (r) { return r && Array.isArray(r.monarchGroups) && r.monarchGroups.length; });
      if (monRounds.length < need) return false;
      var groups = prevPhaseGroups(t);
      if (!groups.length) return false;
      return groups.every(function (g) {
        var ms = (g.rounds && g.rounds[0]) ? g.rounds[0].matches : (g.matches || []);
        return ms.length > 0 && ms.every(function (m) { return m.winner || m.isBye || m.isSitOut; });
      });
    }
    // Fases de chave: todas as partidas da fase atual decididas (inclui grande final).
    var pm = (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === cur; });
    if (!pm.length) return false;
    return pm.every(function (m) { return m.winner || m.isBye; });
  }

  // Materializa a próxima fase: gera as chaves a partir das colocações da fase
  // anterior e anexa em t.matches (tagueadas com phaseIndex). PURA (sem DOM/AppStore).
  function materializeNextPhase(t, computeStandings, idPrefix) {
    if (!isMultiPhase(t)) return { ok: false, error: 'not-multiphase' };
    var cur = t.currentPhaseIndex || 0;
    var nextIdx = cur + 1;
    if (nextIdx >= t.phases.length) return { ok: false, error: 'no-next-phase' };
    if ((t._phaseMaterialized || 0) >= nextIdx) return { ok: false, error: 'already-materialized' };
    var groups = prevPhaseGroups(t);
    if (!groups.length) return { ok: false, error: 'no-groups' };
    var cfg = t.phases[nextIdx];
    var built = buildPhaseBrackets(groups, cfg, computeStandings, idPrefix || ('ph' + nextIdx));
    if (!built.matches.length && !built.converge) return { ok: false, error: 'no-entrants' };
    built.matches.forEach(function (m) { m.phaseIndex = nextIdx; if (m.category === undefined) m.category = null; });
    t.matches = (t.matches || []).concat(built.matches);
    t.currentPhaseIndex = nextIdx;
    t.currentStage = 'phase' + nextIdx;
    t._phaseMaterialized = nextIdx;
    return { ok: true, matches: built.matches, built: built };
  }

  // Wrapper de UI: avança a fase do torneio tId (organizador).
  function advanceMultiPhase(tId) {
    var AppStore = window.AppStore;
    var t = AppStore && AppStore.tournaments ? AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); }) : null;
    if (!t) return;
    if (!phaseComplete(t)) {
      if (window.showAlertDialog) window.showAlertDialog('Fase incompleta', 'Conclua todos os jogos da fase atual antes de avançar.', null, { type: 'warning' });
      return;
    }
    var cs = window._computeMonarchStandings || function (g) { return g.standings || []; };
    var res = materializeNextPhase(t, cs, 'ph-' + tId + '-' + ((t.currentPhaseIndex || 0) + 1));
    if (!res.ok) {
      if (window.showAlertDialog) window.showAlertDialog('Não foi possível avançar', 'Motivo: ' + res.error, null, { type: 'warning' });
      return;
    }
    if (AppStore.syncImmediate) AppStore.syncImmediate(tId);
    if (window._rerenderBracket) window._rerenderBracket(tId);
    var nm = (t.phases[t.currentPhaseIndex] || {}).name || ('Fase ' + (t.currentPhaseIndex + 1));
    if (window.showNotification) window.showNotification('Avançou para ' + nm, 'Chaves geradas a partir das colocações da fase anterior.', 'success');
  }

  var api = {
    isMultiPhase: isMultiPhase,
    mkTeam: mkTeam,
    buildEntrantsByDest: buildEntrantsByDest,
    genTierBracket: genTierBracket,
    buildPhaseBrackets: buildPhaseBrackets,
    linkTierToFinal: linkTierToFinal,
    prevPhaseGroups: prevPhaseGroups,
    phaseComplete: phaseComplete,
    materializeNextPhase: materializeNextPhase
  };

  // Exposição: browser (window) + node (module.exports) para teste headless.
  if (typeof window !== 'undefined') {
    window._phasesEngine = api;
    window._isMultiPhase = isMultiPhase;
    window._phasesPhaseComplete = phaseComplete;
    window._advanceMultiPhase = advanceMultiPhase;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
