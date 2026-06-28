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
    // v3.0.x: escopo Geral com MÚLTIPLAS linhas vindas de MÚLTIPLOS grupos DEGENERA —
    // o ranking geral tem 1 time por colocação, então cada linha receberia só 1 time
    // (nenhuma chave, só a grande final). Nesse caso usa POR GRUPO: cada linha vira
    // uma faixa de colocação (Linha 1 = 1º de cada grupo, Linha 2 = 2º, …) — chaves
    // de verdade. Geral só vale com 1 linha OU 1 grupo (pool único de verdade).
    var _nLines = destKeys.length;
    var _multiGroup = (prevGroups || []).length >= 2;
    var _useOverall = (scope === 'overall') && !(_nLines >= 2 && _multiGroup);
    if (_useOverall) {
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
  function genTierBracket(teams, bracketKey, idPrefix, resolution, tierThird) {
    teams = teams || [];
    resolution = resolution || 'bye';
    var n = teams.length;
    if (n === 0) return { matches: [], finalMatchId: null, soleWinner: null };
    if (n === 1) return { matches: [], finalMatchId: null, soleWinner: teams[0].displayName };

    var counter = 0;
    function mkId() { return idPrefix + '-' + (counter++); }
    var matches = [];

    // v2.8.14: disputa de 3º/4º POR LINHA — os 2 perdedores das semifinais (round
    // totalR-1, que tem exatamente 2 jogos) jogam pela 3ª colocação. Sai 1 jogo,
    // numerado logo ANTES da final. Só quando há semifinais (chave ≥ 4). O loser de
    // cada semi é roteado via loserNextMatchId/loserNextSlot (já tratado no _advanceWinner).
    function _addTierThird(rmap, totalR) {
      if (!tierThird || totalR < 2) return null;
      var semis = rmap[totalR - 1];
      if (!semis || semis.length !== 2) return null;
      var third = { id: mkId(), round: totalR, bracket: bracketKey, isThirdPlace: true, p1: 'TBD', p2: 'TBD', winner: null };
      matches.push(third);
      semis[0].loserNextMatchId = third.id; semis[0].loserNextSlot = 'p1';
      semis[1].loserNextMatchId = third.id; semis[1].loserNextSlot = 'p2';
      return third;
    }

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

    // REPESCAGEM (v2.7.69) — substitui o antigo "play-in" (que era BYE disfarçado:
    // os melhores entravam de graça). Agora TODOS jogam a R1 (round 0). O PIOR
    // colocado fica de fora se n é ímpar e disputa a repescagem. Os g=floor(n/2)
    // vencedores entram na chave de T (=lo) como sementes ALTAS; as (T-g) vagas
    // restantes são preenchidas pelos MELHORES PERDEDORES (rankeados pela R1 +
    // critérios de desempate) como sementes BAIXAS. A escolha dos perdedores só dá
    // pra fazer DEPOIS da R1 → os slots nascem como repDirect/repGame e são
    // preenchidos por window._resolveRepechage quando a R1 fecha (no _advanceWinner).
    if (!isPow2 && resolution === 'playin') {
      var T = lo;
      var g = Math.floor(n / 2);
      var hasSat = (n - 2 * g) === 1;
      var satTeam = hasSat ? teams[n - 1] : null;                 // pior semente fica de fora
      var playing = hasSat ? teams.slice(0, n - 1) : teams.slice();
      var repSpots = T - g;                                       // vagas vindas de perdedores/satout
      var repGames = hasSat ? 1 : 0;                              // 1 jogo de repescagem (loser × satout)
      var directSpots = repSpots - repGames;                      // melhores perdedores entram direto
      // R1: g jogos, semente 1×2g, 2×(2g-1)…
      var r1 = [];
      for (var gi = 0; gi < g; gi++) {
        var ra = playing[gi], rb = playing[playing.length - 1 - gi];
        var rm = { id: mkId(), round: 0, bracket: bracketKey, isPhaseRepR1: true,
          p1: ra.displayName, p2: rb.displayName, team1Obj: ra, team2Obj: rb,
          p1Seed: gi, p2Seed: (playing.length - 1 - gi), winner: null };
        r1.push(rm); matches.push(rm);
      }
      // jogo de repescagem (se há satout): satout × (perdedor de rank directSpots), p2 preenchido depois.
      var repGame = null;
      if (repGames === 1) {
        repGame = { id: mkId(), round: 0, bracket: bracketKey, isPhaseRepGame: true,
          p1: satTeam.displayName, team1Obj: satTeam, p2: 'TBD', winner: null, repLoserRank: directSpots };
        matches.push(repGame);
      }
      // entrantes da chave de T (semente 0..T-1): 0..g-1 vencedores R1; depois repescados.
      var entrants = [];
      for (var ei = 0; ei < g; ei++) entrants.push({ fromR1: r1[ei] });
      for (var di = 0; di < directSpots; di++) entrants.push({ repDirect: di });   // di-ésimo melhor perdedor
      if (repGame) entrants.push({ fromRepGame: repGame });
      // chave de T single-elim (semente 1×T, 2×(T-1)…) → repescados (sementes baixas) pegam os melhores
      function _wireEntrant(ent, slot, mGame) {
        if (!ent) return;
        if (ent.fromR1) { ent.fromR1.nextMatchId = mGame.id; ent.fromR1.nextSlot = slot; }
        else if (ent.fromRepGame) { ent.fromRepGame.nextMatchId = mGame.id; ent.fromRepGame.nextSlot = slot; }
        else if (ent.repDirect != null) { if (slot === 'p1') mGame.repDirectP1 = ent.repDirect; else mGame.repDirectP2 = ent.repDirect; }
      }
      var totalRoundsR = Math.round(Math.log(T) / Math.log(2));
      var roundsMapR = {}; var rr1 = [];
      // v2.8.17: pareamento ADJACENTE — oitavas[k] = entrants[2k] × entrants[2k+1].
      // entrants = [vencedores da R1 em ordem de jogo … depois os melhores perdedores],
      // então dá JOGO13 = V(jogo1)×V(jogo2), JOGO14 = V(jogo3)×V(jogo4)… e, quando os
      // vencedores acabam, os repescados se enfrentam (melhor×2º melhor, 3º×4º).
      // (Antes era semente 1×T = V1 × último repescado.)
      for (var pj = 0; pj < T / 2; pj++) {
        var em = { id: mkId(), round: 1, bracket: bracketKey, p1: 'TBD', p2: 'TBD', winner: null };
        _wireEntrant(entrants[2 * pj], 'p1', em);
        _wireEntrant(entrants[2 * pj + 1], 'p2', em);
        rr1.push(em); matches.push(em);
      }
      roundsMapR[1] = rr1;
      for (var rr = 2; rr <= totalRoundsR; rr++) {
        var prevR = roundsMapR[rr - 1]; var cntR = prevR.length / 2; roundsMapR[rr] = [];
        for (var jj = 0; jj < cntR; jj++) { var mmR = { id: mkId(), round: rr, bracket: bracketKey, p1: 'TBD', p2: 'TBD', winner: null }; roundsMapR[rr].push(mmR); matches.push(mmR); }
        prevR.forEach(function (pmR, idx) { var nmR = roundsMapR[rr][Math.floor(idx / 2)]; pmR.nextMatchId = nmR.id; pmR.nextSlot = (idx % 2 === 0) ? 'p1' : 'p2'; });
      }
      _addTierThird(roundsMapR, totalRoundsR);
      return { matches: matches, finalMatchId: roundsMapR[totalRoundsR][0].id, soleWinner: null, totalRounds: totalRoundsR, waitlist: [] };
    }

    var slots = teams.map(function (tm) { return { team: tm }; });

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
          // v2.8.87: marca pXFromBye no slot que recebeu o vencedor do BYE → a chave
          // mostra a tag âmbar "BYE" SÓ nessa rodada (some quando avança por vitória).
          if (nm) {
            if (m.nextSlot === 'p1') { nm.p1 = m.winner; nm.p1FromBye = true; }
            else { nm.p2 = m.winner; nm.p2FromBye = true; }
          }
        }
      });
    }

    _addTierThird(roundsMap, totalRounds);
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

    // v2.8.14: 3º/4º POR LINHA só quando a linha é INDEPENDENTE (sem grande final).
    // Com convergência (grande final entre 2/4 linhas), o 3º/4º é o do nível da
    // convergência (perdedores das finais das linhas), não interno a cada linha.
    var _wgf = phaseCfg ? (phaseCfg.grandFinal !== false) : true;
    var _wth = phaseCfg ? (phaseCfg.thirdPlace !== false) : true;
    var _tierThird = _wth && !(_wgf && (destOrder.length === 2 || destOrder.length === 4));

    destOrder.forEach(function (dest) {
      var bracketKey = DEST_BRACKET[dest] || dest;
      // v2.7.23: resolução de potência-de-2 escolhida pelo organizador (uma só pra
      // todas as linhas). Default 'bye' = comportamento legado. Setado pelo painel.
      var _res = (phaseCfg && phaseCfg.bracketResolution) || 'bye';
      var res = genTierBracket(byDest[dest], bracketKey, idPrefix + '-' + bracketKey, _res, _tierThird);
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

  // v3.1.9 (motor canônico, inc 7): agendador round-robin "MÉTODO DO CÍRCULO" — núcleo
  // PURO/determinístico (sem random/Date) COMPARTILHADO entre a Fase 0 (grupos, em
  // tournaments-draw.js) e a Fase N (buildPhaseGroupStage). Rodadas BALANCEADAS: antes do
  // 2º jogo de qualquer um, TODOS jogam o 1º; etc. Grupo ímpar → 1 folga por rodada
  // (rodízio via jogador fantasma null). Retorna [{ round, pairs:[{a,b}] }] 1-based, pulando
  // rodadas vazias; a/b são os PRÓPRIOS itens de `players` (nomes OU objetos — preserva uid).
  // Réplica EXATA da lógica inline que existia na Fase 0 → extração byte-idêntica (teste).
  function roundRobinSchedule(players) {
    var arr = players.slice();
    if (arr.length % 2 === 1) arr.push(null); // jogador fantasma = folga da rodada
    var m2 = arr.length, half = m2 / 2;
    var fixed = arr[0], rest = arr.slice(1);
    var out = [];
    for (var r = 0; r < m2 - 1; r++) {
      var lineup = [fixed].concat(rest);
      var pairs = [];
      for (var k = 0; k < half; k++) {
        var a = lineup[k], b = lineup[m2 - 1 - k];
        if (a === null || b === null) continue; // quem cai com o fantasma folga
        pairs.push({ a: a, b: b });
      }
      if (pairs.length > 0) out.push({ round: r + 1, pairs: pairs });
      rest.unshift(rest.pop()); // rotaciona (mantém o fixo, gira o resto)
    }
    return out;
  }

  // v3.1: FASE DE GRUPOS como fase posterior (≥1). Gera grupos round-robin a partir
  // das colocações da fase anterior — o organizador configurou a fase como "Fase de
  // Grupos" e o motor passa a HONRAR isso (antes sempre virava chave single-elim).
  // Forma 1 pool de classificados (buildEntrantsByDest, destino único), distribui em
  // N grupos em SERPENTINA por seed (espalha os fortes em grupos distintos) e gera
  // todos os jogos round-robin. Composável: pra eliminar depois, adiciona-se uma fase
  // de chave em seguida (buildPhaseBrackets puxa destes grupos via bracketPhaseGroups).
  // Cada match: { bracket:'group', groupIdx, groupName, p1, p2, team1Obj, team2Obj }.
  // Transição → pool: deriva o pool ÚNICO de classificados de prevGroups (standings
  // ranqueadas + distribuição por seed). É a ENTRADA da fase. A Fase 0 não usa isto
  // (o pool é a inscrição); a Fase N usa pra transformar a fase anterior em pool.
  function _poolFromPrev(prevGroups, phaseCfg, computeStandings) {
    var src = (phaseCfg && phaseCfg.source) || {};
    var fixedPairs = phaseCfg ? (phaseCfg.fixedPairs === true) : false; // grupos: individual por padrão
    var pairingStrategy = (phaseCfg && phaseCfg.pairingStrategy) || 'top';
    var scope = src.scope || 'per_group';
    var rankingBasis = src.rankingBasis || 'individual';
    var mapping = (src.mapping && src.mapping.length) ? src.mapping : [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
    var maxRankTo = mapping.reduce(function (mx, m) { return Math.max(mx, parseInt(m.rankTo, 10) || 0); }, 0) || 999;
    var byDest = buildEntrantsByDest(prevGroups, [{ dest: 'main', rankFrom: 1, rankTo: maxRankTo }],
      fixedPairs, computeStandings, pairingStrategy, { scope: scope, rankingBasis: rankingBasis });
    return byDest.main || [];
  }

  // GERADOR pool-based de Fase de Grupos (round-robin). Recebe o POOL (entrantes já
  // ranqueados/embaralhados) + cfg → estrutura. Usado em QUALQUER posição (Fase 0 com
  // pool=inscritos; Fase N com pool=transição). Esta é a forma canônica; o wrapper
  // buildPhaseGroupStage apenas deriva o pool da fase anterior e delega aqui.
  function genGroupsFromPool(pool, phaseCfg, idPrefix) {
    idPrefix = idPrefix || 'phg';
    pool = pool || [];
    if (!pool.length) return { matches: [], groups: [] };

    var nGroups = parseInt(phaseCfg && phaseCfg.gruposCount, 10) || 4;
    if (nGroups < 1) nGroups = 1;
    if (nGroups > pool.length) nGroups = pool.length;

    var groups = [];
    for (var gi = 0; gi < nGroups; gi++) groups.push({ name: 'Grupo ' + String.fromCharCode(65 + gi), groupIdx: gi, players: [], matches: [] });
    // Serpentina: ida 0..n-1, volta n-1..0 — cabeças (pool já ordenado por força) caem
    // em grupos distintos e o equilíbrio fica melhor que blocos contíguos.
    pool.forEach(function (tm, i) {
      var round = Math.floor(i / nGroups);
      var pos = i % nGroups;
      var gIdx = (round % 2 === 0) ? pos : (nGroups - 1 - pos);
      groups[gIdx].players.push(tm);
    });

    var counter = 0;
    function mkId() { return idPrefix + '-' + (counter++); }
    var allMatches = [];
    groups.forEach(function (g) {
      // v3.1.9: round-robin via núcleo compartilhado (método do círculo) → rodadas
      // BALANCEADAS dentro do grupo (mesmo SET de pares de antes; agora com nº de rodada,
      // igual à Fase 0). Estático: todos os jogos existem de uma vez (todas as rodadas).
      roundRobinSchedule(g.players).forEach(function (rd) {
        rd.pairs.forEach(function (pr) {
          var A = pr.a, B = pr.b;
          var m = {
            id: mkId(), round: rd.round, bracket: 'group', groupIdx: g.groupIdx, groupName: g.name, tierLabel: g.name,
            p1: A.displayName, p2: B.displayName, team1Obj: A, team2Obj: B,
            winner: null, scoreP1: null, scoreP2: null,
            label: g.name + ' • ' + A.displayName + ' vs ' + B.displayName
          };
          g.matches.push(m); allMatches.push(m);
        });
      });
    });
    return { matches: allMatches, groups: groups };
  }

  function buildPhaseGroupStage(prevGroups, phaseCfg, computeStandings, idPrefix) {
    idPrefix = idPrefix || 'phg';
    var pool = _poolFromPrev(prevGroups, phaseCfg, computeStandings);
    if (!pool.length) return { matches: [], groups: [] };
    return genGroupsFromPool(pool, phaseCfg, idPrefix);
  }

  // Uma config de fase é "Fase de Grupos" (round-robin, sem eliminação embutida)?
  // ── FORMATO CANÔNICO (fonte única) — os 3 formatos da visão do dono. ─────────
  // Rei/Rainha NÃO é um 4º formato: é um MODO DE SORTEIO (isMonarchDraw), ortogonal.
  // classifyPhaseFormat devolve o FORMATO; o roteamento do gerador dá precedência ao
  // modo de sorteio monarca. Os _phaseIs* abaixo são wrappers (compat) sobre estas.
  function isMonarchDraw(cfg) {
    if (!cfg) return false;
    return cfg.reiRainha === true || cfg.drawMode === 'rei_rainha' || /rei|rainha|monarch/i.test(String(cfg.format || cfg.formatCode || ''));
  }
  function classifyPhaseFormat(cfg) {
    if (!cfg) return 'elim';
    var f = String(cfg.format || cfg.formatCode || '').toLowerCase();
    if (cfg.formatCode === 'grupos_mata' || /grupo/.test(f)) return 'groups';
    if (cfg.formatCode === 'liga' || /\bliga\b|pontos corridos|ranking|su[ií]ç?o|swiss/.test(f)) return 'league';
    return 'elim';
  }
  function _phaseIsGroups(cfg) {
    return !!cfg && !isMonarchDraw(cfg) && classifyPhaseFormat(cfg) === 'groups';
  }
  function _phaseIsMonarch(cfg) { return isMonarchDraw(cfg); }

  // v3.1: REI/RAINHA como fase posterior. Forma o pool de classificados, distribui
  // em grupos de 4 (serpentina) e gera os 3 jogos de parceiros rotativos por grupo
  // (AB×CD, AC×BD, AD×BC) — classificação INDIVIDUAL. Sobra (pool % 4) fica de fora
  // desta fase (registrado em .leftOut). Matches: { bracket:'monarch', isMonarch:true,
  // team1:[A,B], team2:[C,D], p1:'A / B', p2:'C / D', groupIdx, groupName }.
  function buildPhaseMonarchStage(prevGroups, phaseCfg, computeStandings, idPrefix) {
    idPrefix = idPrefix || 'phm';
    // Rei/Rainha é INDIVIDUAL (parceiros rotativos) → fixedPairs sempre false na transição.
    var cfgInd = phaseCfg ? Object.assign({}, phaseCfg, { fixedPairs: false }) : { fixedPairs: false };
    return genMonarchFromPool(_poolFromPrev(prevGroups, cfgInd, computeStandings), phaseCfg, idPrefix);
  }

  // GERADOR pool-based de Rei/Rainha (modo de sorteio, não formato): grupos de 4 com
  // parceiros rotativos (AB×CD, AC×BD, AD×BC), classificação INDIVIDUAL. Pool → estrutura.
  function genMonarchFromPool(pool, phaseCfg, idPrefix) {
    idPrefix = idPrefix || 'phm';
    pool = pool || [];
    var nGroups = Math.floor(pool.length / 4);
    if (nGroups < 1) return { matches: [], groups: [], leftOut: pool.map(function (p) { return p.displayName; }) };
    var used = pool.slice(0, nGroups * 4);
    var leftOut = pool.slice(nGroups * 4).map(function (p) { return p.displayName; });

    var groups = [];
    for (var gi = 0; gi < nGroups; gi++) groups.push({ name: 'Grupo ' + String.fromCharCode(65 + gi), groupIdx: gi, players: [], objs: {}, matches: [] });
    used.forEach(function (tm, i) {
      var round = Math.floor(i / nGroups), pos = i % nGroups;
      var gIdx = (round % 2 === 0) ? pos : (nGroups - 1 - pos);
      groups[gIdx].players.push(tm.displayName);
      groups[gIdx].objs[tm.displayName] = tm;
    });

    var counter = 0;
    function mkId() { return idPrefix + '-' + (counter++); }
    var allMatches = [];
    groups.forEach(function (g) {
      var P = g.players; // [A,B,C,D]
      var pairs = [{ t1: [P[0], P[1]], t2: [P[2], P[3]] }, { t1: [P[0], P[2]], t2: [P[1], P[3]] }, { t1: [P[0], P[3]], t2: [P[1], P[2]] }];
      pairs.forEach(function (pr, mi) {
        var m = {
          id: mkId(), round: 1, bracket: 'monarch', isMonarch: true, monarchGroup: g.groupIdx,
          groupIdx: g.groupIdx, groupName: g.name, tierLabel: g.name,
          team1: pr.t1.slice(), team2: pr.t2.slice(), p1: pr.t1.join(' / '), p2: pr.t2.join(' / '),
          winner: null, scoreP1: null, scoreP2: null, label: g.name + ' • Jogo ' + (mi + 1)
        };
        g.matches.push(m); allMatches.push(m);
      });
    });
    return { matches: allMatches, groups: groups, leftOut: leftOut };
  }

  // ── generatePhase — O GERADOR CANÔNICO ÚNICO (pool, cfg) → estrutura ──────────
  // Contrato project_unify_initial_phase_canonical: UM gerador recebe (pool, cfg) →
  // estrutura. A posição é só índice. generateDrawFunction (Fase 0, pool = inscritos) e
  // materializeNextPhase (Fase N, pool = transição via _poolFromPrev) chamam o MESMO.
  // Despacha por FORMATO (classifyPhaseFormat) + MODO (isMonarchDraw — Rei/Rainha é modo,
  // não formato). Eliminatória usa o núcleo único genTierBracket (linha única; tiers
  // Ouro/Prata da Fase N são extensão sobre o MESMO núcleo, em buildPhaseBrackets).
  function _shufflePool(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // Ordena o pool da INSCRIÇÃO segundo os eixos de seeding (cabeças VIP, equilíbrio por
  // categoria). Após o seeding, a distribuição serpentina (grupos) ou a semente 1×N (elim)
  // ESPALHA os cabeças. Eixos vêm da cfg; os predicados (isVip/catOf) vêm do ctx.
  function _seedEnrollmentPool(pool, cfg, ctx) {
    var out = pool.slice();
    if (cfg && cfg.seedCategory && ctx && typeof ctx.catOf === 'function') {
      out = out.map(function (e, i) { return { e: e, i: i, c: String(ctx.catOf(e) || '~') }; })
        .sort(function (a, b) { return a.c < b.c ? -1 : a.c > b.c ? 1 : a.i - b.i; }).map(function (o) { return o.e; });
    }
    if (cfg && cfg.seedVip && ctx && typeof ctx.isVip === 'function') {
      var vip = [], rest = [];
      out.forEach(function (e) { (ctx.isVip(e) ? vip : rest).push(e); });
      out = vip.concat(rest);
    }
    return out;
  }

  // generatePhase — O GERADOR ÚNICO. Recebe um POOL de entrantes + cfg → estrutura
  // (flat tagueada). Em QUALQUER posição:
  //  • Fase 0  → cfg.source.type==='enrollment': aplica os EIXOS da inscrição
  //              (embaralhar, cabeças VIP/categoria) antes de gerar. teamSize/dupla e
  //              resolução pot-2 são tratados pelo chamador na montagem do pool/cfg.
  //  • Fase N  → pool já ranqueado pela transição: sem embaralhar (semente preservada).
  // Categorias: o chamador separa o pool por categoria e chama 1× por categoria (cada
  // chamada tagueia matches com cfg.category). Liga incremental devolve {incrementalLeague}.
  // Gera a chave de eliminação (1 linha) a partir de um pool já ordenado. Honra a
  // resolução de não-potência-de-2 da cfg (bye/playin → genTierBracket; dupla via flag).
  function _genElimFromPool(pool, cfg, idPrefix) {
    var _res = (cfg && cfg.bracketResolution) || 'bye';
    var _third = cfg ? (cfg.thirdPlace !== false) : true;
    var dupla = !!(cfg && (cfg.formatCode === 'elim_dupla' || /dupla/i.test(String(cfg.format || ''))));
    if (pool.length === 1) {
      // 1 inscrito → campeão por BYE (preserva o legado da Fase 0).
      return { matches: [{ id: idPrefix + '-bye', round: 1, bracket: 'main', p1: pool[0].displayName, p2: 'BYE (Avança Direto)', winner: pool[0].displayName, isBye: true }] };
    }
    if (dupla) {
      // Dupla Eliminatória: gera SÓ a R1 do upper (pares na ordem do pool semeado). O
      // upper R2+, o lower e a grande final são montados por _buildDoubleElimBracket
      // (lê t.matches round 1) → sinaliza needsDoubleElim pro chamador. (Não usa o
      // genTierBracket completo, que duplicaria as rodadas que o _buildDoubleElimBracket faz.)
      var dms = [];
      for (var di = 0; di < pool.length; di += 2) {
        var da = pool[di], db = (di + 1 < pool.length) ? pool[di + 1] : null;
        var dbye = !db;
        dms.push({
          id: idPrefix + '-u' + (di / 2), round: 1, bracket: 'upper',
          p1: da.displayName, p2: dbye ? 'BYE (Avança Direto)' : db.displayName,
          team1Obj: da, team2Obj: dbye ? null : db,
          winner: dbye ? da.displayName : null, isBye: dbye, scoreP1: null, scoreP2: null
        });
      }
      return { matches: dms, needsDoubleElim: true };
    }
    // Linha única = bracket 'main' (igual à Fase N) → _renderPhaseBracket renderiza por 1 render só.
    return genTierBracket(pool, 'main', idPrefix, _res, _third);
  }

  function generatePhase(pool, cfg, ctx) {
    ctx = ctx || {};
    var idPrefix = ctx.idPrefix || 'gp';
    pool = (pool || []).slice();
    var enroll = !!(cfg && cfg.source && cfg.source.type === 'enrollment');
    if (enroll && !ctx.ordered) {
      pool = _shufflePool(pool);
      pool = _seedEnrollmentPool(pool, cfg, ctx);
    }
    var fmt = classifyPhaseFormat(cfg);
    var monarch = isMonarchDraw(cfg);
    var built;
    if (monarch) {
      built = genMonarchFromPool(pool, cfg, idPrefix);
    } else if (fmt === 'groups') {
      built = genGroupsFromPool(pool, cfg, idPrefix);
    } else if (fmt === 'league') {
      // FASE 0 (inscrição): a 1ª rodada da Liga/Suíço é gerada pelo MESMO motor
      // incremental _generateNextRound, escrevendo o STORAGE NATIVO (t.rounds/t.standings).
      // Preserva categorias, equilíbrio, temporada e o autoDraw da Cloud Function (que
      // leem t.rounds). É o mesmo gerador da Fase N (lá via _phaseGenNextLeagueRound).
      if (enroll && ctx.t && typeof window !== 'undefined' && typeof window._generateNextRound === 'function') {
        var LT = ctx.t;
        LT.standings = pool.map(function (p) {
          var nm = p.displayName || p.name || '';
          var e = { name: nm, points: 0, wins: 0, losses: 0, pointsDiff: 0, played: 0 };
          var cs = (typeof window._getParticipantCategories === 'function') ? window._getParticipantCategories(p) : [];
          if (cs && cs.length) { e.category = cs[0]; e.categories = cs; }
          return e;
        });
        LT.rounds = []; LT.status = 'active';
        window._generateNextRound(LT);
        var _lrc = ((LT.rounds[0] && LT.rounds[0].matches) || []).filter(function (m) { return !m.isSitOut; }).length;
        return { kind: 'league', appliedToT: true, roundMatchCount: _lrc };
      }
      // Cadência = eixo da cfg (mesma lógica do buildPhaseLeagueStage, p/ identidade):
      // 'incremental' → rodada-a-rodada (o chamador gera a 1ª rodada via _generateNextRound).
      if (cfg && cfg.ligaCadence === 'incremental') { built = { matches: [], players: pool.map(function (p) { return p.displayName; }), pool: pool, incrementalLeague: true }; }
      else { built = genLeagueFromPool(pool, cfg, idPrefix); }
    } else {
      // Eliminatória: split por CATEGORIA (cada categoria = chave independente). Sem
      // categorias → 1 chave. O split é um EIXO da fase (cfg.categories), não código de
      // posição. Cada chave tagueia seus matches com a categoria.
      var cats = (cfg && Array.isArray(cfg.categories) && cfg.categories.length) ? cfg.categories : null;
      if (cats && ctx && typeof ctx.catOf === 'function') {
        var allM = [], needsDE = false;
        cats.forEach(function (cat, ci) {
          var catPool = pool.filter(function (e) { return String(ctx.catOf(e) || '') === String(cat); });
          if (!catPool.length) return;
          var b = _genElimFromPool(catPool, cfg, idPrefix + '-c' + ci);
          (b.matches || []).forEach(function (m) { m.category = cat; });
          allM = allM.concat(b.matches || []);
          if (b.needsDoubleElim) needsDE = true;
        });
        built = { matches: allM };
        if (needsDE) built.needsDoubleElim = true;
      } else {
        built = _genElimFromPool(pool, cfg, idPrefix);
      }
    }
    if (cfg && cfg.category != null) (built.matches || []).forEach(function (m) { if (m.category == null) m.category = cfg.category; });
    return built;
  }

  // Uma config de fase é Liga / Pontos Corridos (round-robin, tabela única)?
  function _phaseIsLiga(cfg) {
    return !!cfg && !isMonarchDraw(cfg) && classifyPhaseFormat(cfg) === 'league';
  }

  // ── selectQualifiers — a TRANSIÇÃO canônica (quem classifica + como entra) ───
  // Lê cfg.source e delega em buildEntrantsByDest. Única porta da transição —
  // o orquestrador e o pré-cheque usam isto em vez de montar mapping/flags à mão.
  function selectQualifiers(prevGroups, cfg, ctx) {
    ctx = ctx || {};
    var src = (cfg && cfg.source) || {};
    var mapping = (src.mapping && src.mapping.length) ? src.mapping : [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
    var fixedPairs = cfg ? (cfg.fixedPairs !== false) : true;
    var pairingStrategy = (cfg && cfg.pairingStrategy) || 'top';
    return buildEntrantsByDest(prevGroups, mapping, fixedPairs, ctx.computeStandings, pairingStrategy,
      { scope: src.scope || 'per_group', rankingBasis: src.rankingBasis || 'individual' });
  }

  // v3.1: LIGA / PONTOS CORRIDOS como fase posterior. Tabela ÚNICA (não grupos):
  // todos os classificados jogam todos (round-robin), repetido por `turnos`. Numa
  // fase posterior o avanço é MANUAL, então materializa TODOS os jogos de uma vez
  // (sem cadência de sorteio no tempo). Matches: { bracket:'league', round:turno }.
  function buildPhaseLeagueStage(prevGroups, phaseCfg, computeStandings, idPrefix) {
    idPrefix = idPrefix || 'phl';
    return genLeagueFromPool(_poolFromPrev(prevGroups, phaseCfg, computeStandings), phaseCfg, idPrefix);
  }

  // GERADOR pool-based de Pontos Corridos / Liga (round-robin estático OU pool p/
  // cadência incremental). Pool → estrutura. A Fase 0 rodada-a-rodada continua via
  // _generateNextRound (incremental); aqui é o caminho estático "todos contra todos".
  function genLeagueFromPool(pool, phaseCfg, idPrefix) {
    idPrefix = idPrefix || 'phl';
    pool = pool || [];
    var turnos = parseInt(phaseCfg && (phaseCfg.turnos || phaseCfg.ligaTurnos), 10) || 1;
    if (turnos < 1) turnos = 1;
    if (pool.length < 2) return { matches: [], players: pool.map(function (p) { return p.displayName; }) };

    // v3.1.13 (brick 4): Pontos Corridos RODADA A RODADA como fase posterior. NÃO
    // pré-gera o round-robin estático — devolve só o POOL de entrantes; o CLIENTE
    // gera a 1ª rodada (e as seguintes) via o motor incremental compartilhado
    // (_generateNextRoundForPlayers), estilo temporada. materializeNextPhase persiste
    // o pool em t.phaseLeagueState[idx]. (Cron/autoDraw = brick 4 etapa 4, deferido.)
    if (phaseCfg && phaseCfg.ligaCadence === 'incremental') {
      return { matches: [], players: pool.map(function (p) { return p.displayName; }), pool: pool, incrementalLeague: true };
    }

    var counter = 0;
    function mkId() { return idPrefix + '-' + (counter++); }
    var allMatches = [];
    for (var turn = 1; turn <= turnos; turn++) {
      for (var a = 0; a < pool.length; a++) {
        for (var b = a + 1; b < pool.length; b++) {
          var m = {
            id: mkId(), round: turn, bracket: 'league', groupIdx: 0, tierLabel: (phaseCfg && phaseCfg.name) || 'Liga',
            p1: pool[a].displayName, p2: pool[b].displayName, team1Obj: pool[a], team2Obj: pool[b],
            winner: null, scoreP1: null, scoreP2: null,
            label: (turnos > 1 ? ('Turno ' + turn + ' • ') : '') + pool[a].displayName + ' vs ' + pool[b].displayName
          };
          allMatches.push(m);
        }
      }
    }
    return { matches: allMatches, players: pool.map(function (p) { return p.displayName; }) };
  }

  // Classificação INDIVIDUAL de um grupo Rei/Rainha (vitórias desc, saldo desc) —
  // versão headless do _computeMonarchStandings p/ o feed-forward no motor (node).
  function _monarchStandings(matches, players) {
    var st = {};
    (players || []).forEach(function (n) { st[n] = { name: n, wins: 0, diff: 0 }; });
    (matches || []).forEach(function (m) {
      if (!m.winner || !m.team1 || !m.team2) return;
      var s1 = parseInt(m.scoreP1, 10) || 0, s2 = parseInt(m.scoreP2, 10) || 0;
      var t1win = (m.winner === m.p1);
      m.team1.forEach(function (n) { if (st[n]) { st[n].diff += (s1 - s2); if (t1win) st[n].wins++; } });
      m.team2.forEach(function (n) { if (st[n]) { st[n].diff += (s2 - s1); if (!t1win) st[n].wins++; } });
    });
    return Object.keys(st).map(function (k) { return st[k]; })
      .sort(function (a, b) { return (b.wins - a.wins) || (b.diff - a.diff); });
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
    // v3.1.16 (inc 8): fase atual = Liga incremental (Pontos Corridos rodada a rodada) →
    // jogos moram em t.phaseRounds[cur].rounds (não em t.matches). Completa quando TODAS
    // as rodadas configuradas da temporada foram geradas E todos os jogos decididos.
    var _liSlot = t.phaseRounds && t.phaseRounds[cur];
    if (_liSlot && Array.isArray(_liSlot.rounds)) {
      if (!_liSlot.rounds.length) return false;
      var _liNeed = parseInt((t.phases[cur] || {}).rounds, 10) || 0;
      if (_liNeed && _liSlot.rounds.length < _liNeed) return false; // temporada ainda em curso
      return _liSlot.rounds.every(function (r) {
        var ms = (r && r.matches) || [];
        return ms.length > 0 && ms.every(function (m) { return m.winner || m.isBye || m.isSitOut; });
      });
    }
    // Fases de chave: todas as partidas da fase atual decididas (inclui grande final).
    var pm = (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === cur; });
    if (!pm.length) return false;
    return pm.every(function (m) { return m.winner || m.isBye; });
  }

  // ESPELHO de phaseComplete: enumera os JOGOS PENDENTES da fase atual (sem vencedor,
  // não-BYE, não-folga), nos MESMOS 3 formatos que phaseComplete varre. Usado pelo painel
  // de resolução de pendentes (organizador decide: W.O. / lançar / liberar com prazo) antes
  // de avançar de fase. Retorna [{ match, groupIdx?, groupName?, round?, bracket? }].
  function pendingMatches(t) {
    if (!isMultiPhase(t)) return [];
    var cur = t.currentPhaseIndex || 0;
    var out = [];
    if (cur === 0) {
      var groups = prevPhaseGroups(t);
      groups.forEach(function (g, gi) {
        var ms = (g.rounds && g.rounds[0]) ? g.rounds[0].matches : (g.matches || []);
        (ms || []).forEach(function (m) {
          if (m && !m.winner && !m.isBye && !m.isSitOut) out.push({ match: m, groupIdx: gi, groupName: g.name || ('Grupo ' + (gi + 1)) });
        });
      });
      return out;
    }
    var _liSlot = t.phaseRounds && t.phaseRounds[cur];
    if (_liSlot && Array.isArray(_liSlot.rounds)) {
      _liSlot.rounds.forEach(function (r) {
        (r.matches || []).forEach(function (m) {
          if (m && !m.winner && !m.isBye && !m.isSitOut) out.push({ match: m, round: r.round });
        });
      });
      return out;
    }
    (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === cur; })
      .forEach(function (m) { if (m && !m.winner && !m.isBye) out.push({ match: m, bracket: m.bracket, round: m.round }); });
    return out;
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
    // v3.1.16 (inc 8): se a fase anterior foi Liga incremental, seus jogos moram em
    // t.phaseRounds[idx].rounds (não em t.matches) — inclui-os pra derivar as standings.
    var _slot = t.phaseRounds && t.phaseRounds[phaseIdx];
    if (_slot && Array.isArray(_slot.rounds)) {
      _slot.rounds.forEach(function (r) { if (r && Array.isArray(r.matches)) pm = pm.concat(r.matches); });
    }
    if (!pm.length) return [];
    var nameTeam = _nameToTeamMap(pm);
    function entry(nm) { return nameTeam[nm] || { name: nm, displayName: nm }; }
    var gf = pm.filter(function (m) { return m.bracket === 'grandfinal'; })[0];
    var third = pm.filter(function (m) { return m.bracket === 'thirdplace'; })[0];
    var TIERS = ['gold', 'silver', 'main', 'line3', 'line4'];
    var tierMatches = pm.filter(function (m) { return TIERS.indexOf(m.bracket) !== -1; });

    // v3.1: fase anterior é FASE DE GRUPOS (round-robin) → standings por grupo
    // (cada grupo vira um "grupo" pra próxima fase puxar suas colocações, igual
    // à Fase 0 de grupos). Ordena por _groupTeamStandings (tiebreakers do torneio
    // são passados via cs no caller? não — aqui usa o default GSM-aware).
    // v3.1: fase anterior é REI/RAINHA → classificação INDIVIDUAL por grupo.
    var monarchMs = pm.filter(function (m) { return m.bracket === 'monarch'; });
    if (monarchMs.length) {
      var byM = {};
      monarchMs.forEach(function (m) {
        var k = (m.groupIdx != null) ? m.groupIdx : 0;
        if (!byM[k]) byM[k] = { name: m.groupName || ('Grupo ' + k), groupIdx: k, matches: [], names: {} };
        byM[k].matches.push(m);
        (m.team1 || []).concat(m.team2 || []).forEach(function (n) { byM[k].names[n] = (nameTeam[n] || { name: n, displayName: n }); });
      });
      return Object.keys(byM).sort(function (a, b) { return byM[a].groupIdx - byM[b].groupIdx; }).map(function (k) {
        var g = byM[k];
        var st = _monarchStandings(g.matches, Object.keys(g.names));
        return { name: g.name, standings: st.map(function (s) { return g.names[s.name] || { name: s.name, displayName: s.name }; }) };
      });
    }

    // v3.1: fase anterior é LIGA (tabela única) → 1 grupo com a classificação geral.
    var leagueMs = pm.filter(function (m) { return m.bracket === 'league'; });
    if (leagueMs.length) {
      var lname = (t.phases[phaseIdx] && t.phases[phaseIdx].name) || ('Fase ' + (phaseIdx + 1));
      // Liga incremental em forma REI/RAINHA: pontuação é INDIVIDUAL (parceiro rotativo a
      // cada rodada), então a classificação ranqueia PESSOAS — nunca as duplas efêmeras de
      // cada rodada. Sem este ramo o feed-forward usava _groupTeamStandings e devolvia
      // duplas em número variável conforme o sorteio (bug de correção: avançava quem não
      // devia; e flaky no phase-brick4 — às vezes 8 duplas, às vezes 6/7). Corrigido na
      // Fase 2 de testes do roadmap 1.0 (jun/2026).
      if (leagueMs.some(function (m) { return m.isMonarch; })) {
        var lnamesI = {};
        leagueMs.forEach(function (m) {
          (m.team1 || []).concat(m.team2 || []).forEach(function (n) {
            lnamesI[n] = nameTeam[n] || { name: n, displayName: n };
          });
        });
        var lstI = _monarchStandings(leagueMs, Object.keys(lnamesI));
        return [{ name: lname, standings: lstI.map(function (s) { return lnamesI[s.name] || { name: s.name, displayName: s.name }; }) }];
      }
      var lobjs = {};
      leagueMs.forEach(function (m) {
        if (m.team1Obj && m.team1Obj.displayName) lobjs[m.team1Obj.displayName] = m.team1Obj;
        if (m.team2Obj && m.team2Obj.displayName) lobjs[m.team2Obj.displayName] = m.team2Obj;
      });
      var lst = _groupTeamStandings({ matches: leagueMs, players: Object.keys(lobjs) });
      return [{ name: lname, standings: lst.map(function (s) { return lobjs[s.name] || { name: s.name, displayName: s.name }; }) }];
    }

    var groupMs = pm.filter(function (m) { return m.bracket === 'group'; });
    if (groupMs.length) {
      var byG = {};
      groupMs.forEach(function (m) {
        var k = (m.groupIdx != null) ? m.groupIdx : (m.groupName || 0);
        if (!byG[k]) byG[k] = { name: m.groupName || ('Grupo ' + k), groupIdx: (m.groupIdx != null ? m.groupIdx : 0), matches: [], objs: {} };
        byG[k].matches.push(m);
        if (m.team1Obj && m.team1Obj.displayName) byG[k].objs[m.team1Obj.displayName] = m.team1Obj;
        if (m.team2Obj && m.team2Obj.displayName) byG[k].objs[m.team2Obj.displayName] = m.team2Obj;
      });
      return Object.keys(byG).sort(function (a, b) { return byG[a].groupIdx - byG[b].groupIdx; }).map(function (k) {
        var g = byG[k];
        var st = _groupTeamStandings({ matches: g.matches, players: Object.keys(g.objs) });
        var ordered = st.map(function (s) { return g.objs[s.name] || { name: s.name, displayName: s.name }; });
        return { name: g.name, standings: ordered };
      });
    }

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
    // v3.1.15: roteamento por FORMATO (classifyPhaseFormat → league/groups/elim). O
    // modo de sorteio (Rei/Rainha) e a cadência (rodada a rodada / todos contra todos)
    // são EIXOS ORTOGONAIS dentro do formato Pontos Corridos — NÃO um 4º formato. Por
    // isso a decisão é FORMATO primeiro; só DENTRO de league o modo de sorteio escolhe
    // a forma das rodadas:
    //   • cadência incremental → pool (o cliente/cron geram rodada a rodada, honrando o
    //     modo de sorteio via _generateNextRound); vale pra simples E Rei/Rainha.
    //   • todos contra todos (estático) → Rei/Rainha = grupos de 4 rotativos
    //     (buildPhaseMonarchStage); simples = round-robin (buildPhaseLeagueStage).
    var _id = idPrefix || ('ph' + nextIdx);
    var _fmt = classifyPhaseFormat(cfg);
    var built;
    if (_fmt === 'league') {
      built = (cfg.ligaCadence === 'incremental')
        ? buildPhaseLeagueStage(groups, cfg, cs, _id)            // devolve só o pool
        : (isMonarchDraw(cfg)
          ? buildPhaseMonarchStage(groups, cfg, cs, _id)
          : buildPhaseLeagueStage(groups, cfg, cs, _id));
    } else if (_fmt === 'groups') {
      built = buildPhaseGroupStage(groups, cfg, cs, _id);
    } else {
      built = buildPhaseBrackets(groups, cfg, cs, _id);
    }
    // v3.1.16 (inc 8 — unificação de storage): Liga rodada a rodada de fase posterior
    // adota o MESMO modelo da Fase 0 — as rodadas moram num array `rounds` real (mesma
    // forma de t.rounds), namespaced por fase em t.phaseRounds[idx]. Não mergeia matches
    // em t.matches nem reconstrói rodadas a partir de m.round. A sub-state carrega o pool
    // (slim: displayName + uid) + opponentHistory/sitOutHistory (acumulam por rodada) +
    // lastAutoDrawAt (dedup do auto-draw, por fase). O cliente (advanceMultiPhase →
    // _phaseGenNextLeagueRound) gera a 1ª rodada logo após, escrevendo em slot.rounds.
    return storePhase(t, nextIdx, built);
  }

  // STORAGE ÚNICO de uma fase (qualquer índice, inclusive 0): grava o resultado do
  // gerador (built) em t na shape taggeada (matches com phaseIndex) OU em
  // t.phaseRounds[idx] (Liga incremental). É o MESMO armazenamento pra Fase 0
  // (generateDrawFunction) e Fase N (materializeNextPhase) — "tudo é fase N".
  function storePhase(t, idx, built) {
    if (built.incrementalLeague) {
      var _slim = (built.pool || []).map(function (e) {
        var nm = e.displayName || e.name;
        var o = { displayName: nm, name: nm };
        var u = e.p1Uid || e.uid; if (u) o.uid = u;
        return o;
      });
      t.phaseRounds = t.phaseRounds || {};
      t.phaseRounds[idx] = { rounds: [], opponentHistory: {}, sitOutHistory: {}, pool: _slim };
      t.currentPhaseIndex = idx;
      t.currentStage = 'phase' + idx;
      t._phaseMaterialized = idx;
      return { ok: true, matches: [], built: built, incrementalLeague: true, phaseIndex: idx };
    }
    if (!built.matches.length && !built.converge) return { ok: false, error: 'no-entrants' };
    built.matches.forEach(function (m) { m.phaseIndex = idx; if (m.category === undefined) m.category = null; });
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
    t.currentPhaseIndex = idx;
    t.currentStage = 'phase' + idx;
    t._phaseMaterialized = idx;
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
    // Rei/Rainha como fase ANTERIOR: detecta tanto a forma de fase posterior
    // (t.rounds[].monarchGroups) QUANTO a Fase 0 standalone (grupos em t.groups com jogos
    // isMonarch). Sem o 2º ramo, o monarch da Fase 0 caía em _groupTeamStandings (lê os
    // jogos rotativos como TIMES → classificava DUPLAS → elim virava de duplas; mas
    // Rei/Rainha coroa UM campeão = classificação e elim INDIVIDUAIS).
    var _isMonarchPrev = (t.rounds || []).some(function (r) { return r && Array.isArray(r.monarchGroups) && r.monarchGroups.length; });
    if (!_isMonarchPrev) {
      var _curIdxM = t.currentPhaseIndex || 0;
      var _prevGM = (_curIdxM === 0) ? prevPhaseGroups(t) : bracketPhaseGroups(t, _curIdxM);
      _isMonarchPrev = (_prevGM || []).some(function (g) {
        var ms = (g.matches || []).concat((g.rounds || []).reduce(function (a, r) { return a.concat(r.matches || []); }, []));
        return ms.some(function (m) { return m && m.isMonarch; });
      });
    }
    // v2.6.95 (Chunk 5): passa os tiebreakers configurados + datas de nascimento
    // (antiguidade/juventude) pro _groupTeamStandings, pra classificação na transição
    // respeitar a ordem que o organizador definiu.
    var _tbOpts = { tiebreakers: t.tiebreakers, birthByName: (typeof window._tbBirthByName === 'function') ? window._tbBirthByName(t) : {} };
    var cs = _isMonarchPrev
      ? function (g) {
          // standings INDIVIDUAL do grupo Rei/Rainha. Achata jogos de g.matches (fase
          // posterior) E g.rounds[].matches (Fase 0 standalone) → _computeMonarchStandings.
          if (typeof window._computeMonarchStandings !== 'function') return g.standings || [];
          var ms = (g.matches || []).concat((g.rounds || []).reduce(function (a, r) { return a.concat(r.matches || []); }, []));
          return window._computeMonarchStandings({ players: g.players || [], matches: ms });
        }
      : function (g) { return _groupTeamStandings(g, _tbOpts); };
    // v2.7.24: se alguma LINHA da próxima fase NÃO for potência de 2 e o organizador
    // ainda não escolheu como resolver → PERGUNTA (painel) em vez de aplicar BYE
    // direto. Tamanhos das linhas são determinísticos (não dependem do sorteio).
    var _cur = t.currentPhaseIndex || 0;
    var _nextCfg = t.phases[_cur + 1] || {};
    // Fase de Grupos / Rei-Rainha / Liga não têm chave → não precisam resolver potência de 2.
    if (!_nextCfg.bracketResolution && !_phaseIsGroups(_nextCfg) && !_phaseIsMonarch(_nextCfg) && !_phaseIsLiga(_nextCfg)) {
      var _curG = (_cur === 0) ? prevPhaseGroups(t) : bracketPhaseGroups(t, _cur);
      var _src = _nextCfg.source || {};
      var _mp = (_src.mapping && _src.mapping.length) ? _src.mapping : [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
      var _byDest = selectQualifiers(_curG, _nextCfg, { computeStandings: (_cur === 0 ? cs : function (g) { return g.standings || []; }) });
      var _lines = _mp.map(function (m) { return { label: (m.label || '').trim() || m.dest, dest: m.dest, size: (_byDest[m.dest] || []).length }; }).filter(function (l) { return l.size > 0; });
      var _anyNonPow2 = _lines.some(function (l) { return l.size > 1 && (l.size & (l.size - 1)) !== 0; });
      if (_anyNonPow2) {
        // v3.1.23: quando uma linha não fecha em potência de 2, SEMPRE pergunta ao
        // organizador como resolver (Play-in/Repescagem · Lista de espera · BYE ·
        // Exclusão) — com o equilíbrio de Nash, o tempo estimado e o nº de partidas
        // de cada uma (_showPhaseResolutionPanel). Vale pra QUALQUER origem (Grupos,
        // Rei/Rainha, Pontos Corridos). Antes (v3.0.x) a transição de Grupos/Rei-Rainha
        // forçava play-in direto sem perguntar — pedido do dono: sempre perguntar.
        // Fallback só se o painel não existir: play-in (repescagem, mais inclusivo).
        if (typeof window._showPhaseResolutionPanel === 'function') {
          t._phaseResInfo = { lines: _lines, nextIdx: (t.currentPhaseIndex || 0) + 1, nextName: _nextCfg.name || ('Fase ' + ((t.currentPhaseIndex || 0) + 2)) };
          window._showPhaseResolutionPanel(tId);
          return;
        }
        _nextCfg.bracketResolution = 'playin';
      }
    }
    var res = materializeNextPhase(t, cs, 'ph-' + tId + '-' + ((t.currentPhaseIndex || 0) + 1));
    if (!res.ok) {
      if (window.showAlertDialog) window.showAlertDialog('Não foi possível avançar', 'Motivo: ' + res.error, null, { type: 'warning' });
      return;
    }
    // v3.1.13 (brick 4): Liga rodada a rodada — a fase entra sem partidas; gera a 1ª
    // rodada agora via o motor incremental (cliente). As seguintes saem da cadência
    // "encerrar rodada" (_phaseCloseLeagueRound).
    if (res.incrementalLeague && typeof window._phaseGenNextLeagueRound === 'function') {
      window._phaseGenNextLeagueRound(t, res.phaseIndex);
    }
    if (AppStore.syncImmediate) AppStore.syncImmediate(tId);
    if (window._rerenderBracket) window._rerenderBracket(tId);
    // Notifica CADA participante do seu jogo na nova fase (app/push/e-mail/WhatsApp
    // 1:1), igual ao sorteio de rodada. Personalizado por uid (cada membro da dupla).
    // Fire-and-forget — não bloqueia o avanço. Só roda no cliente (avanço é manual).
    if (typeof window._notifyDrawPersonalized === 'function') {
      try { window._notifyDrawPersonalized(t, tId, { type: 'new_phase', phaseIndex: t.currentPhaseIndex }); } catch (e) {}
    }
    var nm = (t.phases[t.currentPhaseIndex] || {}).name || ('Fase ' + (t.currentPhaseIndex + 1));
    if (window.showNotification) window.showNotification('Avançou para ' + nm, 'Chaves geradas a partir das colocações da fase anterior.', 'success');
  }

  // v2.7.69: RESOLUÇÃO DA REPESCAGEM — chamada pelo _advanceWinner quando uma
  // partida isRepechageR1 fecha. Rankeia os perdedores da R1 (saldo desc, score
  // desc, semente da fase anterior asc como desempate) e preenche os slots de
  // repescagem da chave de T (repDirectP1/P2) + o p2 do jogo de repescagem
  // (loser × satout). Idempotente: só age quando TODOS os R1 da chave têm vencedor
  // e ainda há slot pendente. Roda igual no cliente, no poller e na CF (vendor).
  function resolveRepechage(t, bracketKey) {
    if (!t || !bracketKey) return false;
    var all = (typeof window !== 'undefined' && window._collectAllMatches) ? window._collectAllMatches(t)
      : (typeof _collectAllMatches === 'function' ? _collectAllMatches(t) : []);
    var r1 = all.filter(function (m) { return m && m.isPhaseRepR1 && m.bracket === bracketKey; });
    if (!r1.length) return false;
    if (r1.some(function (m) { return !m.winner; })) return false;          // R1 ainda não fechou
    var pending = all.filter(function (m) {
      return m && m.bracket === bracketKey && (m.repDirectP1 != null || m.repDirectP2 != null ||
        (m.isPhaseRepGame && m.repLoserRank != null));
    });
    if (!pending.length) return false;                                       // já resolvido
    var losers = r1.map(function (m) {
      var s1 = parseFloat(m.scoreP1) || 0, s2 = parseFloat(m.scoreP2) || 0;
      var loserIsP1 = (m.winner !== m.p1);
      return {
        name: loserIsP1 ? m.p1 : m.p2,
        obj: loserIsP1 ? m.team1Obj : m.team2Obj,
        saldo: loserIsP1 ? (s1 - s2) : (s2 - s1),
        score: loserIsP1 ? s1 : s2,
        seed: (loserIsP1 ? m.p1Seed : m.p2Seed)
      };
    });
    losers.forEach(function (l) { if (l.seed == null) l.seed = 9999; });
    losers.sort(function (a, b) { return (b.saldo - a.saldo) || (b.score - a.score) || (a.seed - b.seed); });
    all.forEach(function (m) {
      if (!m || m.bracket !== bracketKey) return;
      // v2.8.18: marca FromRepechage no slot preenchido por melhor-perdedor → tag âmbar REP
      // (some quando o time avança por vitória; o flag fica só no slot de entrada na chave).
      if (m.repDirectP1 != null && losers[m.repDirectP1]) { m.p1 = losers[m.repDirectP1].name; if (losers[m.repDirectP1].obj) m.team1Obj = losers[m.repDirectP1].obj; m.p1FromRepechage = true; delete m.repDirectP1; }
      if (m.repDirectP2 != null && losers[m.repDirectP2]) { m.p2 = losers[m.repDirectP2].name; if (losers[m.repDirectP2].obj) m.team2Obj = losers[m.repDirectP2].obj; m.p2FromRepechage = true; delete m.repDirectP2; }
    });
    var repGame = all.filter(function (m) { return m && m.isPhaseRepGame && m.bracket === bracketKey; })[0];
    if (repGame && repGame.repLoserRank != null && losers[repGame.repLoserRank]) {
      repGame.p2 = losers[repGame.repLoserRank].name;
      if (losers[repGame.repLoserRank].obj) repGame.team2Obj = losers[repGame.repLoserRank].obj;
      delete repGame.repLoserRank;
    }
    return true;
  }

  var api = {
    isMultiPhase: isMultiPhase,
    mkTeam: mkTeam,
    buildEntrantsByDest: buildEntrantsByDest,
    genTierBracket: genTierBracket,
    roundRobinSchedule: roundRobinSchedule,
    buildPhaseBrackets: buildPhaseBrackets,
    buildPhaseGroupStage: buildPhaseGroupStage,
    buildPhaseMonarchStage: buildPhaseMonarchStage,
    buildPhaseLeagueStage: buildPhaseLeagueStage,
    generatePhase: generatePhase,
    storePhase: storePhase,
    genGroupsFromPool: genGroupsFromPool,
    genMonarchFromPool: genMonarchFromPool,
    genLeagueFromPool: genLeagueFromPool,
    poolFromPrev: _poolFromPrev,
    classifyPhaseFormat: classifyPhaseFormat,
    isMonarchDraw: isMonarchDraw,
    selectQualifiers: selectQualifiers,
    phaseIsGroups: _phaseIsGroups,
    phaseIsMonarch: _phaseIsMonarch,
    phaseIsLiga: _phaseIsLiga,
    linkTierToFinal: linkTierToFinal,
    prevPhaseGroups: prevPhaseGroups,
    bracketPhaseGroups: bracketPhaseGroups,
    phaseComplete: phaseComplete,
    pendingMatches: pendingMatches,
    materializeNextPhase: materializeNextPhase,
    groupTeamStandings: _groupTeamStandings,
    resolveRepechage: resolveRepechage
  };

  // Exposição: browser (window) + node (module.exports) para teste headless.
  if (typeof window !== 'undefined') {
    window._phasesEngine = api;
    window._isMultiPhase = isMultiPhase;
    window._roundRobinSchedule = roundRobinSchedule; // núcleo compartilhado Fase 0/N (inc 7)
    window._phasesPhaseComplete = phaseComplete;
    window._phasesPendingMatches = pendingMatches;
    window._advanceMultiPhase = advanceMultiPhase;
    window._resolveRepechage = resolveRepechage;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
