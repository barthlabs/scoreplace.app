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

    // v2.7.15: distribuição DIRIGIDA PELA ESTRATÉGIA. Forma os times (duplas ou
    // indivíduos) de um POOL de classificados e distribui nas N linhas EM ORDEM.
    // O destino da dupla vem da ESTRATÉGIA + ordem, não mais da faixa de rank:
    //   • 'top' (Performance): duplas adjacentes 1+2, 3+4… (fortes primeiro) →
    //     tiered: as duplas mais fortes na linha 0 (Ouro), as fracas na linha 1.
    //   • 'balanced' (Equilíbrio): duplas 1+último, 2+penúltimo (forte+fraco) →
    //     distribuídas em ordem (1+4→linha0, 2+3→linha1).
    //   • 'draw_among' (Sorteio): embaralha, pareia adjacente, distribui em ordem.
    // keep (duplas já formadas) passa direto, distribuído tiered.
    function _distributePool(pool, destKeys) {
      var nLines = destKeys.length;
      if (!pool || !pool.length || !nLines) return;
      var alreadyTeams = (basis === 'team' || _isTeamEntry(pool[0]));

      // ── Cabeças de chave (v2.7.17): espalha os N melhores 1 por linha (cabeça =
      // topo da chave → só se cruzam tarde) e SORTEIA o resto entre as linhas.
      //   • dupla já formada (fase anterior c/ dupla fixa): cabeças = N melhores
      //     DUPLAS; demais duplas sorteadas.
      //   • indivíduos + duplas fixas nesta fase: cabeças = N melhores JOGADORES;
      //     o parceiro de cada cabeça E as demais duplas são sorteados.
      //   • indivíduos sem duplas: cabeças = N melhores; resto sorteado.
      if (pairingStrategy === 'seed') {
        var seedTeams, restTeams, i2;
        if (alreadyTeams) {
          var tms = pool.map(function (s) { return _asTeam(s); });
          seedTeams = tms.slice(0, nLines);
          restTeams = shuffle(tms.slice(nLines));
        } else if (fixedPairs) {
          var seedsInd = pool.slice(0, nLines);
          var poolRest = shuffle(pool.slice(nLines));
          seedTeams = seedsInd.map(function (s) { var p = poolRest.shift(); return mkTeam(p ? [s, p] : [s]); });
          restTeams = [];
          for (i2 = 0; i2 < poolRest.length; i2 += 2) restTeams.push(mkTeam(poolRest.slice(i2, i2 + 2)));
        } else {
          var ind = pool.map(function (s) { return mkTeam([s]); });
          seedTeams = ind.slice(0, nLines);
          restTeams = shuffle(ind.slice(nLines));
        }
        seedTeams.forEach(function (tm, k) { byDest[destKeys[k % nLines]].push(tm); }); // 1 cabeça por linha, no topo
        restTeams.forEach(function (tm, idx) { byDest[destKeys[idx % nLines]].push(tm); });
        return;
      }

      // ── keep (duplas já formadas, estratégia não-seed): distribui tiered ──
      if (alreadyTeams) {
        pool.forEach(function (s, k) {
          var ln = Math.min(Math.floor(k * nLines / pool.length), nLines - 1);
          byDest[destKeys[ln]].push(_asTeam(s));
        });
        return;
      }
      // ── forma times por estratégia (top/balanced/draw) e distribui tiered ──
      var teams = [];
      if (!fixedPairs) {
        teams = pool.map(function (s) { return mkTeam([s]); });
      } else if (pairingStrategy === 'draw_among') {
        var l = shuffle(pool.slice());
        for (var i = 0; i < l.length; i += 2) teams.push(mkTeam(l.slice(i, i + 2)));
      } else if (pairingStrategy === 'balanced') {
        var lo = 0, hi = pool.length - 1;
        while (lo < hi) { teams.push(mkTeam([pool[lo], pool[hi]])); lo++; hi--; }
        if (lo === hi) teams.push(mkTeam([pool[lo]]));
      } else { // 'top'/'performance'
        for (var j = 0; j < pool.length; j += 2) teams.push(mkTeam(pool.slice(j, j + 2)));
      }
      var per = Math.max(Math.ceil(teams.length / nLines), 1);
      teams.forEach(function (tm, k) {
        var ln = Math.min(Math.floor(k / per), nLines - 1);
        byDest[destKeys[ln]].push(tm);
      });
    }

    // v2.7.15/17: profundidade (quantos avançam) = maior rankTo do mapping
    // (>=999 ou ausente = todos). O destino (linha) vem da ESTRATÉGIA, não da faixa.
    var destKeys = mapping.map(function (mp) { return mp.dest; });
    var maxRankTo = mapping.reduce(function (mx, mp) { return Math.max(mx, parseInt(mp.rankTo, 10) || 0); }, 0);
    if (scope === 'overall') {
      // Pool agregado (ranking geral) — usado por Cabeças de chave e por qualquer
      // estratégia em escopo Geral.
      var global = _globalStandings(prevGroups, computeStandings);
      var gdepth = (maxRankTo >= 999 || maxRankTo <= 0) ? global.length : Math.min(maxRankTo, global.length);
      _distributePool(global.slice(0, gdepth), destKeys);
    } else {
      (prevGroups || []).forEach(function (g) {
        var standings = computeStandings(g) || [];
        var depth = (maxRankTo >= 999 || maxRankTo <= 0) ? standings.length : Math.min(maxRankTo, standings.length);
        _distributePool(standings.slice(0, depth), destKeys);
      });
    }
    return byDest;
  }

  // Gera uma chave de eliminatória simples a partir de uma lista de times semeada.
  // Seeding 1×N, 2×(N-1)… Quando NÃO é potência de 2, `resolution` decide como
  // resolver (canonização — espelha o painel da fase única):
  //   'bye' (default): padding com BYE até a potência ACIMA (cabeças folgam) — comportamento legado.
  //   'exclusion': corta os piores colocados até a potência ABAIXO → chave limpa.
  //   'playin': classificatória (round 0) entre os últimos → reduz pra potência abaixo;
  //             os melhores entram direto, os vencedores do play-in completam a chave.
  function genTierBracket(teams, bracketKey, idPrefix, resolution) {
    teams = teams || [];
    resolution = resolution || 'bye';
    var n = teams.length;
    if (n === 0) return { matches: [], finalMatchId: null, soleWinner: null };
    if (n === 1) return { matches: [], finalMatchId: null, soleWinner: teams[0].displayName };

    var counter = 0;
    function mkId() { return idPrefix + '-' + (counter++); }
    var matches = [];

    var isPow2 = (n & (n - 1)) === 0;
    var lo = 1; while (lo * 2 <= n) lo *= 2; // maior potência de 2 <= n

    // EXCLUSÃO / LISTA DE ESPERA — corta os piores até a potência abaixo (chave
    // limpa, sem BYE). 'exclusion' descarta; 'standby' GUARDA os cortados (vão pra
    // lista de espera — disponíveis pra substituir num W.O.).
    var waitlistTeams = [];
    if (!isPow2 && (resolution === 'exclusion' || resolution === 'standby')) {
      if (resolution === 'standby') waitlistTeams = teams.slice(lo);
      teams = teams.slice(0, lo); n = lo; isPow2 = true;
    }

    // PLAY-IN — os (lo - excess) melhores entram direto; os 2*excess piores jogam
    // `excess` partidas classificatórias (round 0); os vencedores completam a chave.
    var slots; // entrantes da chave principal: {team} ou {fromPlayIn: matchObj}
    if (!isPow2 && resolution === 'playin') {
      var excess = n - lo, directCount = lo - excess;
      var pool = teams.slice(directCount);
      slots = teams.slice(0, directCount).map(function (tm) { return { team: tm }; });
      for (var pi = 0; pi < excess; pi++) {
        var a = pool[pi], b = pool[pool.length - 1 - pi];
        var pim = { id: mkId(), round: 0, bracket: bracketKey, isPlayIn: true,
          p1: a ? a.displayName : 'BYE', p2: b ? b.displayName : 'BYE', winner: null };
        if (a) pim.team1Obj = a; if (b) pim.team2Obj = b;
        matches.push(pim); slots.push({ fromPlayIn: pim });
      }
    } else {
      slots = teams.map(function (tm) { return { team: tm }; });
    }

    var pow = 1; while (pow < slots.length) pow *= 2; // 'bye' → pow > n; senão pow == lo
    var totalRounds = Math.round(Math.log(pow) / Math.log(2));
    var roundsMap = {};
    var r1 = [];
    for (var i = 0; i < pow / 2; i++) {
      var s1 = slots[i] || null, s2 = slots[pow - 1 - i] || null;
      var t1 = (s1 && s1.team) ? s1.team : null, t2 = (s2 && s2.team) ? s2.team : null;
      var pi1 = (s1 && s1.fromPlayIn) ? s1.fromPlayIn : null, pi2 = (s2 && s2.fromPlayIn) ? s2.fromPlayIn : null;
      var isBye = !s1 || !s2;
      var p1 = t1 ? t1.displayName : (pi1 ? 'TBD' : 'BYE');
      var p2 = t2 ? t2.displayName : (pi2 ? 'TBD' : 'BYE');
      var m = {
        id: mkId(), round: 1, bracket: bracketKey, p1: p1, p2: p2,
        winner: isBye ? (s1 ? p1 : (s2 ? p2 : null)) : null, isBye: isBye
      };
      if (t1) m.team1Obj = t1; if (t2) m.team2Obj = t2;
      r1.push(m); matches.push(m);
      if (pi1) { pi1.nextMatchId = m.id; pi1.nextSlot = 'p1'; }
      if (pi2) { pi2.nextMatchId = m.id; pi2.nextSlot = 'p2'; }
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
    return { matches: matches, finalMatchId: finalMatchId, soleWinner: null, totalRounds: totalRounds, waitlist: waitlistTeams };
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
    var phaseWaitlist = []; // v2.7.25: cortados que vão pra lista de espera (resolution 'standby')
    // ordem estável: upper(Ouro) antes de lower(Prata)
    var destOrder = ['upper', 'lower', 'main'].filter(function (d) { return byDest[d]; });
    Object.keys(byDest).forEach(function (d) { if (destOrder.indexOf(d) === -1) destOrder.push(d); });

    destOrder.forEach(function (dest) {
      var bracketKey = DEST_BRACKET[dest] || dest;
      // v2.7.23: resolução de potência-de-2 escolhida pelo organizador (uma só pra
      // todas as linhas). Default 'bye' = comportamento legado. Setado pelo painel.
      var _res = (phaseCfg && phaseCfg.bracketResolution) || 'bye';
      var res = genTierBracket(byDest[dest], bracketKey, idPrefix + '-' + bracketKey, _res);
      // v2.6.79: nome da linha/chave = o que o organizador digitou (mapping[].label);
      // sem ícone de medalha hardcoded. Fallback genérico "Chave N" (ordem da linha).
      var _mp = mapping.filter(function (m) { return m.dest === dest; })[0];
      var _custom = (_mp && _mp.label) ? String(_mp.label).trim() : '';
      var _label = _custom || (DEST_LABEL[dest] || ('Chave ' + (destOrder.indexOf(dest) + 1)));
      res.matches.forEach(function (m) { m.tierLabel = _label; });
      allMatches = allMatches.concat(res.matches);
      if (res.waitlist && res.waitlist.length) phaseWaitlist = phaseWaitlist.concat(res.waitlist);
      tiers[dest] = res;
    });

    var converge = null;
    // v2.6.80: sem grande final → cada linha INDEPENDENTE (campeão por linha, sem convergência).
    // v2.6.93 (Motor Chunk 2): convergência de N linhas. 2 linhas → grande final direta
    // (campeão A × campeão B) + 3º; 4 linhas → 2 SEMIS + final + 3º, com as semis pareadas
    // pela estratégia (linhas em ordem de seed): performance/'top' = (L1×L4),(L2×L3);
    // equilíbrio/'balanced' = (L1×L3),(L2×L4). Sem grande final → nada disso (independentes).
    var withGF = phaseCfg ? (phaseCfg.grandFinal !== false) : true;
    var withThird = phaseCfg ? (phaseCfg.thirdPlace !== false) : true;
    var tierKeys = destOrder.filter(function (d) { return tiers[d]; });
    function _mkConv(idSuffix, bracket, label) { return { id: idPrefix + idSuffix, bracket: bracket, round: 99, p1: 'TBD', p2: 'TBD', winner: null, tierLabel: label }; }
    if (withGF && tierKeys.length === 2) {
      var gf = _mkConv('-grandfinal', 'grandfinal', '🏆 Grande Final');
      var third = withThird ? _mkConv('-thirdplace', 'thirdplace', '🥉 Disputa de 3º/4º') : null;
      var convMatches = [gf]; if (third) convMatches.push(third);
      allMatches = allMatches.concat(convMatches);
      linkTierToFinal(tiers[tierKeys[0]], gf, 'p1', third, 'p1', allMatches);
      linkTierToFinal(tiers[tierKeys[1]], gf, 'p2', third, 'p2', allMatches);
      converge = { gf: gf, third: third, matches: convMatches };
    } else if (withGF && tierKeys.length === 4) {
      var pair = (pairingStrategy === 'balanced') ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];
      var semi1 = _mkConv('-semi1', 'semifinal', '🎾 Semifinal 1');
      var semi2 = _mkConv('-semi2', 'semifinal', '🎾 Semifinal 2');
      var gf4 = _mkConv('-grandfinal', 'grandfinal', '🏆 Grande Final');
      var third4 = withThird ? _mkConv('-thirdplace', 'thirdplace', '🥉 Disputa de 3º/4º') : null;
      semi1.nextMatchId = gf4.id; semi1.nextSlot = 'p1';
      semi2.nextMatchId = gf4.id; semi2.nextSlot = 'p2';
      if (third4) { semi1.loserNextMatchId = third4.id; semi1.loserNextSlot = 'p1'; semi2.loserNextMatchId = third4.id; semi2.loserNextSlot = 'p2'; }
      var conv4 = [semi1, semi2, gf4]; if (third4) conv4.push(third4);
      allMatches = allMatches.concat(conv4);
      linkTierToFinal(tiers[tierKeys[pair[0][0]]], semi1, 'p1', null, null, allMatches);
      linkTierToFinal(tiers[tierKeys[pair[0][1]]], semi1, 'p2', null, null, allMatches);
      linkTierToFinal(tiers[tierKeys[pair[1][0]]], semi2, 'p1', null, null, allMatches);
      linkTierToFinal(tiers[tierKeys[pair[1][1]]], semi2, 'p2', null, null, allMatches);
      converge = { gf: gf4, third: third4, semis: [semi1, semi2], matches: conv4 };
    }

    return { matches: allMatches, tiers: tiers, converge: converge, byDest: byDest, waitlist: phaseWaitlist };
  }

  // Standings por grupo a partir de matches p1/p2 (Fase de Grupos). Funciona
  // tanto pra individuais quanto pra DUPLAS (m.p1/m.p2 = "A / B") — o nome carrega
  // a dupla, e o keep implícito (buildEntrantsByDest) reforma o teamObj. Devolve
  // array JÁ ORDENADO.
  // v2.6.95 (Chunk 5): honra os tiebreakers configurados pelo organizador
  // (opts.tiebreakers) — mesmo conjunto de critérios e ordem default que o
  // _computeStandings de bracket-logic. confronto_direto usa o h2h DESTE grupo
  // (round-robin); buchholz/sonneborn são group-local; antiguidade/juventude via
  // opts.birthByName (injetado). 'sorteio' é estável no motor (determinismo de
  // teste — o sorteio real só decide na renderização do app, não na classificação).
  // Sem opts → ordem default GSM-aware (compatível com chamadas de 1 argumento).
  function _groupTeamStandings(group, opts) {
    opts = opts || {};
    if (!group) return [];
    var matches = (group.matches || []).slice();
    (group.rounds || []).forEach(function (r) { if (Array.isArray(r.matches)) matches = matches.concat(r.matches); });
    var participants = group.players || group.participants || [];
    var smap = {}, h2h = {}, usesSets = false;
    function ensure(nm) { if (nm && !smap[nm]) smap[nm] = { name: nm, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, tiebreaksWon: 0, buchholz: 0, sonnebornBerger: 0 }; }
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
        h2h[m.p1 + '|||' + m.p2 + '|||d'] = (h2h[m.p1 + '|||' + m.p2 + '|||d'] || 0) + 1;
        h2h[m.p2 + '|||' + m.p1 + '|||d'] = (h2h[m.p2 + '|||' + m.p1 + '|||d'] || 0) + 1;
      } else {
        var loser = (m.winner === m.p1) ? m.p2 : m.p1;
        if (smap[m.winner]) { smap[m.winner].wins++; smap[m.winner].points += 3; }
        if (smap[loser]) smap[loser].losses++;
        h2h[m.winner + '|||' + loser] = (h2h[m.winner + '|||' + loser] || 0) + 1;
      }
      if (Array.isArray(m.sets) && m.sets.length) {
        usesSets = true;
        var sw1 = 0, sw2 = 0, gw1 = 0, gw2 = 0, tb1 = 0, tb2 = 0;
        m.sets.forEach(function (st) {
          var g1 = parseInt(st.gamesP1) || 0, g2 = parseInt(st.gamesP2) || 0;
          gw1 += g1; gw2 += g2;
          if (g1 > g2) sw1++; else if (g2 > g1) sw2++;
          if (st.tiebreak) { var tp1 = parseInt(st.tiebreak.pointsP1) || 0, tp2 = parseInt(st.tiebreak.pointsP2) || 0; if (tp1 > tp2) tb1++; else if (tp2 > tp1) tb2++; }
        });
        smap[m.p1].setsWon += sw1; smap[m.p1].setsLost += sw2; smap[m.p1].gamesWon += gw1; smap[m.p1].gamesLost += gw2; smap[m.p1].tiebreaksWon += tb1;
        smap[m.p2].setsWon += sw2; smap[m.p2].setsLost += sw1; smap[m.p2].gamesWon += gw2; smap[m.p2].gamesLost += gw1; smap[m.p2].tiebreaksWon += tb2;
      }
    });
    // Buchholz (soma dos pontos dos adversários) + Sonneborn-Berger (ponderado por resultado), group-local.
    Object.keys(smap).forEach(function (nm) {
      var s = smap[nm];
      matches.forEach(function (m) {
        if (!m.winner || m.isBye || m.isSitOut) return;
        var opp = (m.p1 === nm) ? m.p2 : (m.p2 === nm ? m.p1 : null);
        if (!opp || !smap[opp]) return;
        s.buchholz += smap[opp].points;
        if (m.draw || m.winner === 'draw') s.sonnebornBerger += smap[opp].points * 0.5;
        else if (m.winner === nm) s.sonnebornBerger += smap[opp].points;
      });
    });
    var birthByName = opts.birthByName || {};
    var defaultTb = usesSets
      ? ['confronto_direto', 'saldo_sets', 'saldo_games', 'sets_vencidos', 'games_vencidos', 'tiebreaks_vencidos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio']
      : ['confronto_direto', 'saldo_pontos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'];
    var tb = (Array.isArray(opts.tiebreakers) && opts.tiebreakers.length) ? opts.tiebreakers : defaultTb;
    function cmp(a, b) {
      if (b.points !== a.points) return b.points - a.points;
      for (var i = 0; i < tb.length; i++) {
        var d = 0;
        switch (tb[i]) {
          case 'confronto_direto': { var ab = h2h[a.name + '|||' + b.name] || 0, ba = h2h[b.name + '|||' + a.name] || 0; d = ba - ab; if (d) return d < 0 ? -1 : 1; break; }
          case 'saldo_pontos': d = b.pointsDiff - a.pointsDiff; if (d) return d; break;
          case 'vitorias': d = b.wins - a.wins; if (d) return d; break;
          case 'buchholz': d = (b.buchholz || 0) - (a.buchholz || 0); if (d) return d; break;
          case 'sonneborn_berger': d = (b.sonnebornBerger || 0) - (a.sonnebornBerger || 0); if (d) return d; break;
          case 'saldo_sets': d = ((b.setsWon || 0) - (b.setsLost || 0)) - ((a.setsWon || 0) - (a.setsLost || 0)); if (d) return d; break;
          case 'saldo_games': d = ((b.gamesWon || 0) - (b.gamesLost || 0)) - ((a.gamesWon || 0) - (a.gamesLost || 0)); if (d) return d; break;
          case 'sets_vencidos': d = (b.setsWon || 0) - (a.setsWon || 0); if (d) return d; break;
          case 'games_vencidos': d = (b.gamesWon || 0) - (a.gamesWon || 0); if (d) return d; break;
          case 'tiebreaks_vencidos': d = (b.tiebreaksWon || 0) - (a.tiebreaksWon || 0); if (d) return d; break;
          case 'antiguidade': { var ab2 = birthByName[a.name], bb2 = birthByName[b.name]; if (ab2 != null && bb2 != null && ab2 !== bb2) return ab2 - bb2; break; }
          case 'juventude': { var ay = birthByName[a.name], by = birthByName[b.name]; if (ay != null && by != null && ay !== by) return by - ay; break; }
          case 'sorteio': return 0;
        }
      }
      return 0;
    }
    return Object.keys(smap).map(function (k) { return smap[k]; }).sort(cmp);
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

  // ── Fase 1+ → próxima fase: derivar colocações de uma CHAVE já jogada ─────────
  // (v2.6.94, Motor Chunk 4 — encadeamento além de 0→1.)

  // Reconstrói teamObjs por displayName a partir das R1 (que carregam team1Obj/
  // team2Obj). Permite o keep de duplas seguir com uids/fotos pra próxima fase.
  function _nameToTeamMap(phaseMatches) {
    var map = {};
    phaseMatches.forEach(function (m) {
      if (m.team1Obj && m.team1Obj.displayName) map[m.team1Obj.displayName] = m.team1Obj;
      if (m.team2Obj && m.team2Obj.displayName) map[m.team2Obj.displayName] = m.team2Obj;
    });
    return map;
  }
  // Rodada de CHAVE (round<99) em que `name` perdeu — eliminado mais tarde = melhor.
  // Nunca perdeu (campeão do tier / ainda vivo) → sentinela alta (9999), pra ordenar
  // ANTES de quem perdeu. Ignora BYE.
  function _tierExitRound(name, tierMatches) {
    var maxLost = 0, lostSomewhere = false;
    tierMatches.forEach(function (m) {
      if (m.isBye || (m.round || 1) >= 99) return;
      if ((m.p1 === name || m.p2 === name) && m.winner && m.winner !== name) { maxLost = Math.max(maxLost, m.round || 1); lostSomewhere = true; }
    });
    return lostSomewhere ? maxLost : 9999;
  }
  // Nomes que jogaram numa lista de matches de chave (ignora BYE/TBD e convergência).
  function _tierTeamNames(tierMatches) {
    var seen = {}, out = [];
    tierMatches.forEach(function (m) {
      if ((m.round || 1) >= 99) return;
      [m.p1, m.p2].forEach(function (nm) { if (nm && nm !== 'BYE' && nm !== 'TBD' && !seen[nm]) { seen[nm] = 1; out.push(nm); } });
    });
    return out;
  }
  // Standings de uma fase de CHAVE já jogada → pseudo-grupos pra semear a próxima.
  //  • Com convergência (grande final): UM grupo "geral" na ordem do pódio
  //    (campeão, vice, 3º, 4º) + cauda por profundidade de eliminação nas linhas.
  //  • Sem convergência (linhas independentes): UM grupo por linha (tier), cada
  //    um ordenado por profundidade dentro da linha (campeão da linha primeiro).
  function bracketPhaseGroups(t, phaseIdx) {
    var pm = (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === phaseIdx; });
    if (!pm.length) return [];
    var nameTeam = _nameToTeamMap(pm);
    function entry(nm) { return nameTeam[nm] || { name: nm, displayName: nm }; }
    var gf = pm.filter(function (m) { return m.bracket === 'grandfinal'; })[0];
    var third = pm.filter(function (m) { return m.bracket === 'thirdplace'; })[0];
    var TIERS = ['gold', 'silver', 'main', 'line3', 'line4'];
    var tierMatches = pm.filter(function (m) { return TIERS.indexOf(m.bracket) !== -1; });

    if (gf) {
      var order = [], used = {};
      function push(nm) { if (nm && nm !== 'BYE' && nm !== 'TBD' && !used[nm]) { used[nm] = 1; order.push(entry(nm)); } }
      if (gf.winner) { push(gf.winner); push((gf.p1 === gf.winner) ? gf.p2 : gf.p1); }
      if (third && third.winner) { push(third.winner); push((third.p1 === third.winner) ? third.p2 : third.p1); }
      var rest = _tierTeamNames(tierMatches).filter(function (nm) { return !used[nm]; });
      rest.sort(function (a, b) { return _tierExitRound(b, tierMatches) - _tierExitRound(a, tierMatches); });
      rest.forEach(push);
      var pname = (t.phases[phaseIdx] && t.phases[phaseIdx].name) || ('Fase ' + (phaseIdx + 1));
      return [{ name: pname, standings: order }];
    }

    // Linhas independentes: um grupo por bracketKey, ordenado por exitRound desc.
    var byBracket = {};
    tierMatches.forEach(function (m) { (byBracket[m.bracket] = byBracket[m.bracket] || []).push(m); });
    return Object.keys(byBracket).map(function (bk) {
      var ms = byBracket[bk];
      var names = _tierTeamNames(ms);
      names.sort(function (a, b) { return _tierExitRound(b, ms) - _tierExitRound(a, ms); });
      return { name: (ms[0] && ms[0].tierLabel) || bk, standings: names.map(entry) };
    });
  }

  // Materializa a próxima fase: gera as chaves a partir das colocações da fase
  // anterior e anexa em t.matches (tagueadas com phaseIndex). PURA (sem DOM/AppStore).
  function materializeNextPhase(t, computeStandings, idPrefix) {
    if (!isMultiPhase(t)) return { ok: false, error: 'not-multiphase' };
    var cur = t.currentPhaseIndex || 0;
    var nextIdx = cur + 1;
    if (nextIdx >= t.phases.length) return { ok: false, error: 'no-next-phase' };
    if ((t._phaseMaterialized || 0) >= nextIdx) return { ok: false, error: 'already-materialized' };
    // Origem das colocações: Fase 0 = grupos (Rei/Rainha ou round-robin); Fase 1+ =
    // resultado da CHAVE anterior (Chunk 4 — encadeamento além de 0→1). No 2º caso
    // as standings já vêm ranqueadas, então cs é identidade.
    var groups, cs;
    if (cur === 0) { groups = prevPhaseGroups(t); cs = computeStandings; }
    else { groups = bracketPhaseGroups(t, cur); cs = function (g) { return g.standings || []; }; }
    if (!groups.length) return { ok: false, error: 'no-groups' };
    var cfg = t.phases[nextIdx];
    var built = buildPhaseBrackets(groups, cfg, cs, idPrefix || ('ph' + nextIdx));
    if (!built.matches.length && !built.converge) return { ok: false, error: 'no-entrants' };
    built.matches.forEach(function (m) { m.phaseIndex = nextIdx; if (m.category === undefined) m.category = null; });
    t.matches = (t.matches || []).concat(built.matches);
    // v2.7.25: resolução 'standby' → os cortados vão pra lista de espera (reusa a
    // infra existente: aparecem no painel de Lista de Espera + servem pra W.O.).
    if (built.waitlist && built.waitlist.length) {
      var _sb = Array.isArray(t.standbyParticipants) ? t.standbyParticipants.slice() : [];
      var _have = {};
      _sb.forEach(function (p) { var nm = (typeof p === 'string') ? p : (p && (p.displayName || p.name)); if (nm) _have[nm] = 1; });
      built.waitlist.forEach(function (tm) { var nm = tm && (tm.displayName || tm.name); if (nm && !_have[nm]) { _sb.push(nm); _have[nm] = 1; } });
      t.standbyParticipants = _sb;
    }
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
    // v2.6.95 (Chunk 5): passa os tiebreakers configurados + datas de nascimento
    // (antiguidade/juventude) pro _groupTeamStandings, pra classificação na transição
    // respeitar a ordem que o organizador definiu.
    var _tbOpts = { tiebreakers: t.tiebreakers, birthByName: (typeof window._tbBirthByName === 'function') ? window._tbBirthByName(t) : {} };
    var cs = _isMonarchPrev
      ? (window._computeMonarchStandings || function (g) { return g.standings || []; })
      : function (g) { return _groupTeamStandings(g, _tbOpts); };
    // v2.7.24: se alguma LINHA da próxima fase NÃO for potência de 2 e o organizador
    // ainda não escolheu como resolver → PERGUNTA (painel) em vez de aplicar BYE
    // direto. Tamanhos das linhas são determinísticos (não dependem do sorteio).
    var _cur = t.currentPhaseIndex || 0;
    var _nextCfg = t.phases[_cur + 1] || {};
    if (!_nextCfg.bracketResolution) {
      var _curG = (_cur === 0) ? prevPhaseGroups(t) : bracketPhaseGroups(t, _cur);
      var _src = _nextCfg.source || {};
      var _mp = (_src.mapping && _src.mapping.length) ? _src.mapping : [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
      var _byDest = buildEntrantsByDest(_curG, _mp, _nextCfg.fixedPairs !== false, (_cur === 0 ? cs : function (g) { return g.standings || []; }), _nextCfg.pairingStrategy || 'top', { scope: _src.scope || 'per_group', rankingBasis: _src.rankingBasis || 'individual' });
      var _lines = _mp.map(function (m) { return { label: (m.label || '').trim() || m.dest, dest: m.dest, size: (_byDest[m.dest] || []).length }; }).filter(function (l) { return l.size > 0; });
      var _anyNonPow2 = _lines.some(function (l) { return l.size > 1 && (l.size & (l.size - 1)) !== 0; });
      if (_anyNonPow2 && typeof window._showPhaseResolutionPanel === 'function') {
        t._phaseResInfo = { lines: _lines, nextIdx: (t.currentPhaseIndex || 0) + 1, nextName: _nextCfg.name || ('Fase ' + ((t.currentPhaseIndex || 0) + 2)) };
        window._showPhaseResolutionPanel(tId);
        return;
      }
    }
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
    bracketPhaseGroups: bracketPhaseGroups,
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
