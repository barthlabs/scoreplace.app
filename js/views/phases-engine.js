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

  // Uma colocação já É um time (dupla fixa que veio formada da fase anterior)?
  // Detecta 3 formas: participants[], campos p{N}Name/fixedPair, ou nome "X / Y"
  // (convenção canônica de dupla no app — Fase de Grupos de duplas).
  function _isTeamEntry(s) {
    return !!(s && ((Array.isArray(s.participants) && s.participants.length > 1) || s.p2Name || s.fixedPair || (typeof s.name === 'string' && /\s\/\s/.test(s.name))));
  }
  // Normaliza uma colocação-que-é-time num teamObj canônico, preservando membros
  // (uids/emails/fotos quando existem). Usado no carry-forward ('keep') — a dupla
  // SEGUE junta. Quando só há o nome "X / Y", divide pelos nomes (sem uid).
  function _asTeam(s) {
    if (Array.isArray(s.participants) && s.participants.length > 1) return mkTeam(s.participants);
    if (s.p2Name || s.fixedPair) {
      var members = [];
      for (var k = 1; k <= 4; k++) {
        var nm = s['p' + k + 'Name']; if (!nm) break;
        var mem = { name: nm };
        if (s['p' + k + 'Uid']) mem.uid = s['p' + k + 'Uid'];
        if (s['p' + k + 'Email']) mem.email = s['p' + k + 'Email'];
        if (s['p' + k + 'Photo']) mem.photoURL = s['p' + k + 'Photo'];
        members.push(mem);
      }
      if (members.length > 1) return mkTeam(members);
    }
    if (typeof s.name === 'string' && /\s\/\s/.test(s.name)) {
      var byName = s.name.split('/').map(function (n) { return { name: n.trim() }; }).filter(function (m) { return m.name; });
      if (byName.length > 1) return mkTeam(byName);
    }
    return mkTeam([s]);
  }
  // Fisher-Yates (Math.random). Injetável via opts.shuffle para teste determinístico.
  function _defaultShuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  // Ranking AGREGADO (escopo 'overall'): mescla as standings de todos os grupos e
  // reordena por critério global (vitórias → saldo de sets → games → pontos). Sort
  // estável — empate total preserva a ordem de concatenação dos grupos.
  function _globalStandings(prevGroups, computeStandings) {
    var all = [];
    (prevGroups || []).forEach(function (g) { (computeStandings(g) || []).forEach(function (s) { all.push(s); }); });
    all.sort(function (a, b) {
      var d;
      d = (b.wins || 0) - (a.wins || 0); if (d) return d;
      d = (((b.setsWon || 0) - (b.setsLost || 0)) - ((a.setsWon || 0) - (a.setsLost || 0))); if (d) return d;
      d = (((b.gamesWon || 0) - (b.gamesLost || 0)) - ((a.gamesWon || 0) - (a.gamesLost || 0))); if (d) return d;
      d = (((b.pointsFor || 0) - (b.pointsAgainst || 0)) - ((a.pointsFor || 0) - (a.pointsAgainst || 0))); if (d) return d;
      return 0;
    });
    return all;
  }

  // A partir dos grupos da fase anterior + mapping, devolve { dest: [teamObjs] }.
  // mapping: [{ dest:'upper'|'lower'|'main', rankFrom, rankTo }]
  // fixedPairs=true → os jogadores das colocações viram dupla (2 a 2).
  // pairingStrategy: 'top' (1º+2º, 3º+4º…), 'balanced' (1º+último, 2º+penúltimo…)
  //                  ou 'draw_among' (sorteio entre os classificados).
  // opts (NOVO, opcional): {
  //   scope: 'per_group' (default — colocação dentro de CADA grupo)
  //        | 'overall'   (top-N no ranking agregado, ignorando grupo),
  //   rankingBasis: 'individual' (default) | 'team' (colocações já são duplas → keep),
  //   shuffle: fn (injetável p/ draw_among determinístico no teste)
  // }
  // Carry-forward ('keep') implícito: se as colocações já SÃO times (dupla veio
  // formada da fase anterior), elas seguem juntas — fixedPairs/pairingStrategy são
  // ignorados, ninguém é re-pareado.
  function buildEntrantsByDest(prevGroups, mapping, fixedPairs, computeStandings, pairingStrategy, opts) {
    opts = opts || {};
    var scope = opts.scope || 'per_group';
    var basis = opts.rankingBasis || 'individual';
    var shuffle = opts.shuffle || _defaultShuffle;
    var byDest = {};
    mapping.forEach(function (mp) { if (!byDest[mp.dest]) byDest[mp.dest] = []; });

    // Combina uma lista de classificados (já recortada por faixa de colocação) em
    // times dentro de byDest[dest], respeitando keep/fixedPairs/estratégia.
    function pairInto(destArr, picked) {
      if (!picked || !picked.length) return;
      // keep: rankingBasis='team' OU as colocações já vêm como dupla → passa direto.
      if (basis === 'team' || _isTeamEntry(picked[0])) {
        picked.forEach(function (s) { destArr.push(_asTeam(s)); });
        return;
      }
      if (!fixedPairs) {
        picked.forEach(function (s) { destArr.push(mkTeam([s])); });
        return;
      }
      var list = picked.slice();
      if (pairingStrategy === 'draw_among') {
        // Sorteio entre os classificados, depois pareia adjacentes do embaralhado.
        list = shuffle(list);
        for (var i = 0; i < list.length; i += 2) destArr.push(mkTeam(list.slice(i, i + 2)));
      } else if (pairingStrategy === 'balanced') {
        // Equilibrado: 1º+último, 2º+penúltimo… (junta forte com fraco)
        var lo = 0, hi = list.length - 1;
        while (lo < hi) { destArr.push(mkTeam([list[lo], list[hi]])); lo++; hi--; }
        if (lo === hi) destArr.push(mkTeam([list[lo]])); // sobra ímpar = solo
      } else {
        // 'top' (default): adjacentes — 1º+2º, 3º+4º…
        for (var j = 0; j < list.length; j += 2) destArr.push(mkTeam(list.slice(j, j + 2)));
      }
    }

    function pickRange(standings, mp) {
      var picked = [];
      for (var r = mp.rankFrom; r <= mp.rankTo; r++) { var s = standings[r - 1]; if (s) picked.push(s); }
      return picked;
    }

    if (scope === 'overall') {
      // Pool agregado: classifica todo mundo junto e recorta faixas globais.
      var global = _globalStandings(prevGroups, computeStandings);
      mapping.forEach(function (mp) { pairInto(byDest[mp.dest], pickRange(global, mp)); });
    } else {
      // Por grupo (default): colocação dentro de cada grupo; pareia dentro do grupo.
      (prevGroups || []).forEach(function (g) {
        var standings = computeStandings(g) || [];
        mapping.forEach(function (mp) { pairInto(byDest[mp.dest], pickRange(standings, mp)); });
      });
    }
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

  var DEST_BRACKET = { upper: 'gold', lower: 'silver', main: 'main', line3: 'line3', line4: 'line4' };
  // v2.6.79: sem rótulos Ouro/Prata hardcoded — o nome de cada linha/chave vem do
  // que o organizador digitou (mapping[].label); fallback genérico "Chave N".
  var DEST_LABEL = { main: 'Eliminatória' };

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
    var scope = src.scope || 'per_group';            // 'per_group' | 'overall'
    var rankingBasis = src.rankingBasis || 'individual'; // 'individual' | 'team' (keep)

    var byDest = buildEntrantsByDest(prevGroups, mapping, fixedPairs, computeStandings, pairingStrategy, { scope: scope, rankingBasis: rankingBasis });

    var allMatches = [];
    var tiers = {};
    // ordem estável: upper(Ouro) antes de lower(Prata)
    var destOrder = ['upper', 'lower', 'main'].filter(function (d) { return byDest[d]; });
    Object.keys(byDest).forEach(function (d) { if (destOrder.indexOf(d) === -1) destOrder.push(d); });

    destOrder.forEach(function (dest) {
      var bracketKey = DEST_BRACKET[dest] || dest;
      var res = genTierBracket(byDest[dest], bracketKey, idPrefix + '-' + bracketKey);
      // v2.6.79: nome da linha/chave = o que o organizador digitou (mapping[].label);
      // sem ícone de medalha hardcoded. Fallback genérico "Chave N" (ordem da linha).
      var _mp = mapping.filter(function (m) { return m.dest === dest; })[0];
      var _custom = (_mp && _mp.label) ? String(_mp.label).trim() : '';
      var _label = _custom || (DEST_LABEL[dest] || ('Chave ' + (destOrder.indexOf(dest) + 1)));
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

  // Standings por grupo a partir de matches p1/p2 (Fase de Grupos). Funciona
  // tanto pra individuais quanto pra DUPLAS (m.p1/m.p2 = "A / B") — o nome carrega
  // a dupla, e o keep implícito (buildEntrantsByDest) reforma o teamObj. Devolve
  // array JÁ ORDENADO (pontos → saldo → vitórias → saldo sets → saldo games).
  // Simplificação consciente: usa ordem default, não os tiebreakers configuráveis
  // do organizador (que vivem em locals de bracket-logic). Suficiente pra decidir
  // quem classifica na transição entre fases.
  function _groupTeamStandings(group) {
    if (!group) return [];
    var matches = (group.matches || []).slice();
    (group.rounds || []).forEach(function (r) { if (Array.isArray(r.matches)) matches = matches.concat(r.matches); });
    var participants = group.players || group.participants || [];
    var smap = {};
    function ensure(nm) { if (nm && !smap[nm]) smap[nm] = { name: nm, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 }; }
    participants.forEach(function (p) { ensure(typeof p === 'string' ? p : (p && (p.displayName || p.name)) || ''); });
    matches.forEach(function (m) {
      if (!m || !m.winner || m.isBye || m.isSitOut) return;
      ensure(m.p1); ensure(m.p2);
      if (!smap[m.p1] || !smap[m.p2]) return;
      var s1 = parseInt(m.scoreP1) || 0, s2 = parseInt(m.scoreP2) || 0;
      smap[m.p1].played++; smap[m.p2].played++;
      smap[m.p1].pointsDiff += (s1 - s2); smap[m.p2].pointsDiff += (s2 - s1);
      if (m.draw || m.winner === 'draw') {
        smap[m.p1].draws++; smap[m.p1].points += 1; smap[m.p2].draws++; smap[m.p2].points += 1;
      } else {
        var loser = (m.winner === m.p1) ? m.p2 : m.p1;
        if (smap[m.winner]) { smap[m.winner].wins++; smap[m.winner].points += 3; }
        if (smap[loser]) smap[loser].losses++;
      }
      if (Array.isArray(m.sets)) m.sets.forEach(function (st) {
        var g1 = parseInt(st.gamesP1) || 0, g2 = parseInt(st.gamesP2) || 0;
        smap[m.p1].gamesWon += g1; smap[m.p1].gamesLost += g2;
        smap[m.p2].gamesWon += g2; smap[m.p2].gamesLost += g1;
        if (g1 > g2) { smap[m.p1].setsWon++; smap[m.p2].setsLost++; }
        else if (g2 > g1) { smap[m.p2].setsWon++; smap[m.p1].setsLost++; }
      });
    });
    return Object.keys(smap).map(function (k) { return smap[k]; }).sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      var d = b.pointsDiff - a.pointsDiff; if (d) return d;
      d = b.wins - a.wins; if (d) return d;
      d = ((b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)); if (d) return d;
      d = ((b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)); if (d) return d;
      return 0;
    });
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
      // Fase classificatória completa quando todos os jogos dos grupos estão
      // decididos. Cobre DOIS estilos:
      //  • Rei/Rainha: grupos vêm de t.rounds[].monarchGroups (exige nº de rodadas).
      //  • Grupos (Copa do Mundo): grupos vêm de t.groups (round-robin, sem rodadas).
      var groups = prevPhaseGroups(t);
      if (!groups.length) return false;
      var isMonarch = (t.rounds || []).some(function (r) { return r && Array.isArray(r.monarchGroups) && r.monarchGroups.length; });
      if (isMonarch) {
        var cfg = t.phases[0] || {};
        var need = parseInt(cfg.rounds) || 1;
        var monRounds = (t.rounds || []).filter(function (r) { return r && Array.isArray(r.monarchGroups) && r.monarchGroups.length; });
        if (monRounds.length < need) return false;
      }
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
    // Escolhe a função de standings conforme a forma dos grupos da fase anterior:
    //  • Rei/Rainha (monarchGroups) → standings INDIVIDUAL (_computeMonarchStandings).
    //  • Fase de Grupos (t.groups, individuais OU duplas) → _groupTeamStandings
    //    (lê m.p1/m.p2; pro caso de duplas o nome "A / B" segue junto via keep).
    var _isMonarchPrev = (t.rounds || []).some(function (r) { return r && Array.isArray(r.monarchGroups) && r.monarchGroups.length; });
    var cs = _isMonarchPrev
      ? (window._computeMonarchStandings || function (g) { return g.standings || []; })
      : _groupTeamStandings;
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
    materializeNextPhase: materializeNextPhase,
    groupTeamStandings: _groupTeamStandings
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
