// ── Bracket Logic & Computation ──
var _t = window._t || function(k) { return k; };

// ── Nome de grupo por índice (canônico) ──
// 0→A … 25→Z, 26→A2, 27→B2 … 51→Z2, 52→A3 … Acima de 26 grupos cicla a letra e
// soma um número (A2, B2…), em vez de estourar pra '[', '\', ']' como fazia o
// String.fromCharCode(65+i) cru. Único ponto de verdade — todo nome de grupo
// (criação e fallback de render) usa este helper. Roda no cliente e no servidor
// (vendor) porque bracket-logic.js é o arquivo sincronizado pro autoDraw.
window._groupLetter = window._groupLetter || function (i) {
  i = (typeof i === 'number' && i >= 0) ? Math.floor(i) : 0;
  var tier = Math.floor(i / 26);
  return String.fromCharCode(65 + (i % 26)) + (tier === 0 ? '' : (tier + 1));
};

// Nome COMPLETO do grupo a partir do índice: "Grupo A2" (prefixo via i18n
// label.group). Único ponto que monta "Grupo " + letra — usar na CRIAÇÃO do
// grupo (onde o name é gravado).
window._groupName = window._groupName || function (i) {
  var lbl = (typeof _t === 'function') ? _t('label.group') : 'Grupo';
  return lbl + ' ' + window._groupLetter(i);
};

// Nome de EXIBIÇÃO de um grupo/subgrupo já existente: usa o `.name` gravado
// (que já é canônico, ex.: "Grupo A" ou "R1 Grupo A") TAL QUAL — NÃO re-prefixa
// "Grupo" (era isso que gerava "Grupo Grupo A" / "Grupo R1 Grupo A" nos renders).
// Cai pro _groupName(i) só quando não há name. Aceita objeto {name} ou string.
window._groupDisplayName = window._groupDisplayName || function (grp, i) {
  var nm = (grp == null) ? '' : (typeof grp === 'string' ? grp : (grp.name || ''));
  nm = (nm == null) ? '' : String(nm).trim();
  return nm ? nm : window._groupName(i);
};

// ── Monarch (Rei/Rainha) individual standings per group ──
window._computeMonarchStandings = function(group) {
  var stats = {};
  (group.players || []).forEach(function(name) {
    stats[name] = {
      name: name, wins: 0, losses: 0, played: 0,
      pointsFor: 0, pointsAgainst: 0,
      setsWon: 0, setsLost: 0,
      gamesWon: 0, gamesLost: 0,
      tiebreaksWon: 0, tiebreaksLost: 0
    };
  });

  var matches = (group.rounds && group.rounds[0]) ? group.rounds[0].matches : (group.matches || []);
  matches.forEach(function(m) {
    if (!m.winner || !m.team1 || !m.team2) return;
    var s1 = parseInt(m.scoreP1) || 0;
    var s2 = parseInt(m.scoreP2) || 0;
    var team1Won = m.winner === m.p1;

    // GSM breakdown (sets/games/tiebreaks) — if sets[] recorded, aggregate per side
    var sw1 = 0, sw2 = 0, gw1 = 0, gw2 = 0, tb1 = 0, tb2 = 0;
    if (Array.isArray(m.sets) && m.sets.length > 0) {
      m.sets.forEach(function(st) {
        var g1 = parseInt(st.gamesP1) || 0;
        var g2 = parseInt(st.gamesP2) || 0;
        gw1 += g1; gw2 += g2;
        if (g1 > g2) sw1++; else if (g2 > g1) sw2++;
        if (st.tiebreak) {
          var tp1 = parseInt(st.tiebreak.pointsP1) || 0;
          var tp2 = parseInt(st.tiebreak.pointsP2) || 0;
          if (tp1 > tp2) tb1++; else if (tp2 > tp1) tb2++;
        }
      });
    }

    m.team1.forEach(function(name) {
      if (!stats[name]) return;
      stats[name].played++;
      stats[name].pointsFor += s1;
      stats[name].pointsAgainst += s2;
      stats[name].setsWon += sw1;
      stats[name].setsLost += sw2;
      stats[name].gamesWon += gw1;
      stats[name].gamesLost += gw2;
      stats[name].tiebreaksWon += tb1;
      stats[name].tiebreaksLost += tb2;
      if (team1Won) stats[name].wins++; else stats[name].losses++;
    });
    m.team2.forEach(function(name) {
      if (!stats[name]) return;
      stats[name].played++;
      stats[name].pointsFor += s2;
      stats[name].pointsAgainst += s1;
      stats[name].setsWon += sw2;
      stats[name].setsLost += sw1;
      stats[name].gamesWon += gw2;
      stats[name].gamesLost += gw1;
      stats[name].tiebreaksWon += tb2;
      stats[name].tiebreaksLost += tb1;
      if (!team1Won) stats[name].wins++; else stats[name].losses++;
    });
  });

  // Compute winRate (aproveitamento) as tiebreaker for players with fewer games
  Object.keys(stats).forEach(function(k) {
    stats[k].winRate = stats[k].played > 0 ? stats[k].wins / stats[k].played : 0;
  });

  // Tiebreaker order (desc unless noted):
  // 1. wins  2. setsDiff  3. setsWon  4. gamesDiff  5. gamesWon
  // 6. tiebreaksDiff  7. tiebreaksWon  8. pointsDiff  9. pointsFor  10. winRate  11. played (asc)
  return Object.values(stats).sort(function(a, b) {
    if (b.wins !== a.wins) return b.wins - a.wins;
    var aSetD = a.setsWon - a.setsLost, bSetD = b.setsWon - b.setsLost;
    if (bSetD !== aSetD) return bSetD - aSetD;
    if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
    var aGD = a.gamesWon - a.gamesLost, bGD = b.gamesWon - b.gamesLost;
    if (bGD !== aGD) return bGD - aGD;
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
    var aTBD = a.tiebreaksWon - a.tiebreaksLost, bTBD = b.tiebreaksWon - b.tiebreaksLost;
    if (bTBD !== aTBD) return bTBD - aTBD;
    if (b.tiebreaksWon !== a.tiebreaksWon) return b.tiebreaksWon - a.tiebreaksWon;
    var aDiff = a.pointsFor - a.pointsAgainst;
    var bDiff = b.pointsFor - b.pointsAgainst;
    if (bDiff !== aDiff) return bDiff - aDiff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return a.played - b.played;
  });
};

function _checkGroupRoundComplete(t, groupIndex) {
  if (!t.groups || !t.groups[groupIndex]) return;
  const g = t.groups[groupIndex];
  const activeRound = (g.rounds || []).find(r => r.status === 'active');
  if (!activeRound) return;
  const allDone = (activeRound.matches || []).every(m => m.winner || m.isBye || m.isSitOut);
  if (allDone) {
    activeRound.status = 'complete';
    // Activate next pending round
    const nextRound = (g.rounds || []).find(r => r.status === 'pending');
    if (nextRound) nextRound.status = 'active';
  }
}

// Advanced Points System — Liga/Suíço puro (v0.14.51+)
// Calcula pontuação por eventos derivados do placar (games, TB pts) + eventos live (killing, pontos).
// Retorna { total, breakdown } com detalhamento por partida para transparência.
// Invariantes preservados por design de valores: vitória sempre > derrota; dominância recompensada;
// floor per-match em 0 evita totais negativos.
// v2.3.12: conta rodadas JOGADAS vs FOLGAS de um jogador (pra média dinâmica da
// compensação de folga). Uma rodada conta como "jogada" se o jogador disputou
// qualquer partida nela; como "folga" se só folgou (sit-out) sem jogar.
function _playerRoundStats(t, playerName, category) {
  // v2.3.81: distingue folga COMPENSÁVEL (saiu por sorteio/remainder → recebe a
  // média) de folga por INATIVIDADE (jogador desativado optou por sair → 0 pts e
  // a rodada NÃO entra na média). satOutCompensable exclui as inativas.
  var played = 0, satOut = 0, satOutCompensable = 0;
  (t.rounds || []).forEach(function(round) {
    var didPlay = false, didSit = false, sitInactive = false;
    (round.matches || []).forEach(function(m) {
      if (category && m.category !== category) return;
      // v2.4.30: 'wo' (levou W.O. na rodada) = 0 pts, igual a 'inactive' — NÃO
      // compensável (não entra na média de folga). Só 'remainder' (sobrou do
      // sorteio) recebe a média.
      if (m.isSitOut) { if (m.p1 === playerName) { didSit = true; if (m.sitOutReason === 'inactive' || m.sitOutReason === 'wo') sitInactive = true; } return; }
      if (m.isBye || !m.winner) return;
      if (m.isMonarch && Array.isArray(m.team1) && Array.isArray(m.team2)) {
        if (m.team1.indexOf(playerName) !== -1 || m.team2.indexOf(playerName) !== -1) didPlay = true;
      } else if (m.p1 === playerName || m.p2 === playerName) {
        didPlay = true;
      }
    });
    if (didPlay) played++;
    else if (didSit) { satOut++; if (!sitInactive) satOutCompensable++; }
  });
  return { played: played, satOut: satOut, satOutCompensable: satOutCompensable };
}
window._playerRoundStats = _playerRoundStats;

function _calcAdvancedPoints(t, playerName, category) {
  if (!t || !t.advancedScoring || !t.advancedScoring.enabled || !playerName) {
    return { total: 0, breakdown: [] };
  }
  var cats = t.advancedScoring.categories || {};
  function getVal(key) {
    var c = cats[key];
    return (c && c.enabled) ? (parseInt(c.value, 10) || 0) : 0;
  }
  var vParticipation = getVal('participation');
  var vMatchWon = getVal('match_won');
  var vGameWon = getVal('game_won');
  var vGameLost = getVal('game_lost');
  var vTbPoint = getVal('tiebreak_point');
  var vKilling = getVal('killing_point');
  var vPointScored = getVal('point_scored');
  // v2.3.12: toggle do organizador. Quando desligado, os pontos que dependem de
  // PLACAR AO VIVO (killing point, ponto marcado) NÃO são aplicados — nivela
  // quem usa placar ao vivo vs quem prefere não usar. Default: aplica.
  if (t.advancedScoring.applyLiveScoring === false) {
    vKilling = 0;
    vPointScored = 0;
  }

  function _playerInSide(side, name) {
    if (Array.isArray(side)) return side.indexOf(name) !== -1;
    if (typeof side !== 'string') return false;
    if (side === name) return true;
    var parts = side.split(' / ');
    return parts.indexOf(name) !== -1;
  }

  var total = 0;
  var breakdown = [];

  // v2.3.3: format-agnostic — varre TODAS as partidas do torneio (eliminatórias,
  // grupos, rounds de Liga/Suíço, Rei/Rainha) via coletor canônico, em vez de só
  // t.rounds. Assim Pontos Avançados funciona em qualquer tipo de torneio.
  var _allMatches = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : null;
  if (!_allMatches) {
    _allMatches = [];
    (t.rounds || []).forEach(function(round) { (round.matches || []).forEach(function(mm) { _allMatches.push(mm); }); });
  }
  _allMatches.forEach(function(m) {
      if (category && m.category !== category) return;
      if (m.isBye || !m.winner || m.isSitOut) return;

      var isMonarch = m.isMonarch && Array.isArray(m.team1) && Array.isArray(m.team2);
      var side1 = isMonarch ? m.team1 : m.p1;
      var side2 = isMonarch ? m.team2 : m.p2;
      var isInP1 = _playerInSide(side1, playerName);
      var isInP2 = _playerInSide(side2, playerName);
      if (!isInP1 && !isInP2) return;

      var isDraw = m.winner === 'draw' || m.draw;
      var won;
      if (isDraw) {
        won = false;
      } else if (isMonarch) {
        won = (isInP1 && m.winner === m.p1) || (isInP2 && m.winner === m.p2);
      } else {
        won = (isInP1 && m.winner === m.p1) || (isInP2 && m.winner === m.p2) || m.winner === playerName;
      }

      var mBreakdown = { round: m.round || m.roundNumber || 0, opponent: isInP1 ? (m.p2 || '') : (m.p1 || ''), won: won, draw: isDraw, items: [] };
      var mTotal = 0;

      if (vParticipation) {
        mTotal += vParticipation;
        mBreakdown.items.push({ key: 'participation', count: 1, unit: vParticipation, value: vParticipation });
      }
      if (won && vMatchWon) {
        mTotal += vMatchWon;
        mBreakdown.items.push({ key: 'match_won', count: 1, unit: vMatchWon, value: vMatchWon });
      }

      var gamesWon = 0, gamesLost = 0, tbPtsWon = 0;
      if (Array.isArray(m.sets) && m.sets.length > 0) {
        m.sets.forEach(function(s) {
          var g1 = parseInt(s.gamesP1) || 0;
          var g2 = parseInt(s.gamesP2) || 0;
          if (isInP1) { gamesWon += g1; gamesLost += g2; }
          else { gamesWon += g2; gamesLost += g1; }
          if (s.tiebreak) {
            var tp1 = parseInt(s.tiebreak.pointsP1) || 0;
            var tp2 = parseInt(s.tiebreak.pointsP2) || 0;
            tbPtsWon += isInP1 ? tp1 : tp2;
          }
        });
      } else {
        var s1 = parseInt(m.scoreP1) || 0;
        var s2 = parseInt(m.scoreP2) || 0;
        gamesWon = isInP1 ? s1 : s2;
        gamesLost = isInP1 ? s2 : s1;
      }
      if (vGameWon && gamesWon > 0) {
        var gw = gamesWon * vGameWon;
        mTotal += gw;
        mBreakdown.items.push({ key: 'game_won', count: gamesWon, unit: vGameWon, value: gw });
      }
      if (vGameLost && gamesLost > 0) {
        var gl = gamesLost * vGameLost;
        mTotal += gl;
        mBreakdown.items.push({ key: 'game_lost', count: gamesLost, unit: vGameLost, value: gl });
      }
      if (vTbPoint && tbPtsWon > 0) {
        var tbp = tbPtsWon * vTbPoint;
        mTotal += tbp;
        mBreakdown.items.push({ key: 'tiebreak_point', count: tbPtsWon, unit: vTbPoint, value: tbp });
      }

      // Eventos live (requer pontuação ao vivo — m.liveStats)
      if (vKilling && m.liveStats) {
        var myKill = isInP1 ? (parseInt(m.liveStats.killingP1) || 0) : (parseInt(m.liveStats.killingP2) || 0);
        if (myKill > 0) {
          var kTotal = myKill * vKilling;
          mTotal += kTotal;
          mBreakdown.items.push({ key: 'killing_point', count: myKill, unit: vKilling, value: kTotal });
        }
      }
      if (vPointScored && m.liveStats) {
        var myPts = isInP1 ? (parseInt(m.liveStats.pointsP1) || 0) : (parseInt(m.liveStats.pointsP2) || 0);
        if (myPts > 0) {
          var pTotal = myPts * vPointScored;
          mTotal += pTotal;
          mBreakdown.items.push({ key: 'point_scored', count: myPts, unit: vPointScored, value: pTotal });
        }
      }

      // Floor per-match em 0
      if (mTotal < 0) {
        mBreakdown.items.push({ key: 'floor', count: 1, unit: -mTotal, value: -mTotal });
        mTotal = 0;
      }
      mBreakdown.total = mTotal;
      total += mTotal;
      breakdown.push(mBreakdown);
  });

  // v2.3.12: compensação de FOLGA = MÉDIA dos pontos avançados das rodadas
  // JOGADAS × nº de folgas, RECALCULADA a cada rodada (não congelada). Quem
  // folga na rodada 1 não fica com 0: assim que joga, a média das rodadas
  // jogadas passa a valer também pelas rodadas de folga.
  var _rs = _playerRoundStats(t, playerName, category);
  // v2.3.81: só folgas COMPENSÁVEIS (sorteio) recebem a média. Folga por
  // inatividade (desativado) = 0 e não conta.
  if (_rs.satOutCompensable > 0 && _rs.played > 0) {
    var _advAvg = total / _rs.played;
    var _comp = Math.round(_advAvg * _rs.satOutCompensable);
    if (_comp !== 0) {
      breakdown.push({
        round: 0, opponent: '', isSitOutComp: true, sitOutRounds: _rs.satOutCompensable, won: false, draw: false,
        items: [{ key: 'sitout_avg', count: _rs.satOutCompensable, unit: Math.round(_advAvg), value: _comp }],
        total: _comp
      });
      total += _comp;
    }
  }

  return { total: total, breakdown: breakdown };
}
window._calcAdvancedPoints = _calcAdvancedPoints;

// Média de Pontos Avançados (PA) por rodada JOGADA — base da compensação de
// folga quando o torneio usa Pontos Avançados. Espelha _computeAvgPointsPerRound
// (que faz a média dos pontos simples 3/1/0), mas somando PA. Remove o próprio
// item de compensação de folga do total pra não contaminar a média.
function _computeAvgAdvancedPerRound(t, playerName, category) {
  var rs = _playerRoundStats(t, playerName, category);
  if (!rs.played) return 0;
  var full = _calcAdvancedPoints(t, playerName, category);
  var comp = 0;
  (full.breakdown || []).forEach(function(b) { if (b && b.isSitOutComp) comp += (b.total || 0); });
  return Math.round((full.total - comp) / rs.played);
}
window._computeAvgAdvancedPerRound = _computeAvgAdvancedPerRound;

// Compensação de folga (sit-out) atribuída/exibida, respeitando o sistema de
// pontuação do torneio: média de Pontos Avançados quando PA está ativo; senão,
// média dos pontos simples (3/1/0). É a regra do torneio — quem folga recebe a
// sua média no critério que rankeia a tabela.
function _sitOutComp(t, playerName, category) {
  if (t && t.advancedScoring && t.advancedScoring.enabled) {
    return _computeAvgAdvancedPerRound(t, playerName, category);
  }
  return _computeAvgPointsPerRound(t, playerName, category);
}
window._sitOutComp = _sitOutComp;

// v2.2.47: nome do competidor → timestamp de nascimento (pros critérios de
// desempate antiguidade/juventude). birthDate vem no formato "DD/MM/AAAA".
// Para duplas/times, usa a MÉDIA das datas dos membros que tiverem data.
// Também mapeia cada membro individualmente (útil em Rei/Rainha).
function _tbParseBirth(bd) {
  if (!bd) return null;
  var p = String(bd).split('/');
  if (p.length !== 3) return null;
  var d = parseInt(p[0], 10), mo = parseInt(p[1], 10), y = parseInt(p[2], 10);
  if (!y || !mo || !d) return null;
  var ts = new Date(y, mo - 1, d).getTime();
  return isNaN(ts) ? null : ts;
}
window._tbBirthByName = function(t) {
  var map = {};
  var parts = (t && Array.isArray(t.participants)) ? t.participants : [];
  parts.forEach(function(p) {
    if (!p || typeof p !== 'object') return;
    var nm = p.displayName || p.name || '';
    var times = [];
    var own = _tbParseBirth(p.birthDate);
    if (own != null) times.push(own);
    if (Array.isArray(p.participants)) {
      p.participants.forEach(function(sub) {
        var st = _tbParseBirth(sub && sub.birthDate);
        if (st != null) times.push(st);
        var sn = sub && (sub.displayName || sub.name);
        if (sn && st != null && map[sn] == null) map[sn] = st;
      });
    }
    if (nm && times.length) map[nm] = times.reduce(function(a, b) { return a + b; }, 0) / times.length;
  });
  return map;
};
window._tbParseBirth = _tbParseBirth;

window._computeStandings = _computeStandings; // expose globally for finishTournament
function _computeStandings(t, category) {
  const scoreMap = {};

  // v2.4.30: "Jogador X" (convidado preenchendo vaga de W.O. num grupo de Liga)
  // nunca pontua e nunca entra na classificação. Os nomes ghost ficam em
  // t.ligaGhosts. Auto-contido aqui pra valer também no Cloud Function autoDraw.
  const _ghostSet = Array.isArray(t.ligaGhosts) ? t.ligaGhosts : [];
  const _isGhost = function(name) { return name && _ghostSet.indexOf(name) !== -1; };

  const allP = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  allP.forEach(p => {
    const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
    // If filtering by category, only include participants in that category (supports multi-cat)
    if (category) {
      if (typeof p === 'object' && window._participantInCategory) {
        if (!window._participantInCategory(p, category)) return;
      } else {
        var pCat = typeof p === 'object' ? (p.category || '') : '';
        if (pCat !== category) return;
      }
    }
    if (name && !scoreMap[name]) scoreMap[name] = { name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0, category: category || '', setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, tiebreaksWon: 0 };
  });

  (t.rounds || []).forEach(round => {
    (round.matches || []).forEach(m => {
      // If filtering by category, only count matches in that category
      if (category && m.category !== category) return;

      // Helper to ensure dynamic entry has GSM fields
      function _ensureEntry(name) {
        if (_isGhost(name)) return; // Jogador X nunca entra na classificação
        if (!scoreMap[name]) scoreMap[name] = { name: name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0, category: category || '', setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, tiebreaksWon: 0 };
      }

      // Accumulate GSM (sets/games/tiebreaks) stats from match
      function _accumulateGSM(m) {
        if (!Array.isArray(m.sets) || m.sets.length === 0) return;
        var sw1 = 0, sw2 = 0, gw1 = 0, gw2 = 0, tb1 = 0, tb2 = 0;
        m.sets.forEach(function(s) {
          var g1 = parseInt(s.gamesP1) || 0;
          var g2 = parseInt(s.gamesP2) || 0;
          gw1 += g1; gw2 += g2;
          if (g1 > g2) sw1++; else if (g2 > g1) sw2++;
          if (s.tiebreak) {
            var tp1 = parseInt(s.tiebreak.pointsP1) || 0;
            var tp2 = parseInt(s.tiebreak.pointsP2) || 0;
            if (tp1 > tp2) tb1++; else if (tp2 > tp1) tb2++;
          }
        });
        if (scoreMap[m.p1]) { scoreMap[m.p1].setsWon += sw1; scoreMap[m.p1].setsLost += sw2; scoreMap[m.p1].gamesWon += gw1; scoreMap[m.p1].gamesLost += gw2; scoreMap[m.p1].tiebreaksWon += tb1; }
        if (scoreMap[m.p2]) { scoreMap[m.p2].setsWon += sw2; scoreMap[m.p2].setsLost += sw1; scoreMap[m.p2].gamesWon += gw2; scoreMap[m.p2].gamesLost += gw1; scoreMap[m.p2].tiebreaksWon += tb2; }
      }

      // Sit-out (folga): NÃO pontua aqui. v2.3.12: a compensação é a MÉDIA das
      // rodadas JOGADAS (recalculada a cada rodada), aplicada DEPOIS do loop —
      // tanto nos pontos simples quanto nos avançados. O `m.sitOutPoints`
      // congelado (legado) deixou de ser usado. Folga nunca conta como
      // vitória/partida disputada.
      if (m.isSitOut) { if (m.p1) _ensureEntry(m.p1); return; }
      // Skip BYE and unresolved matches
      if (!m.winner || m.isBye || m.isSitOut) return;

      // Rei/Rainha (monarch) matches in Liga: individual stats from team matches
      if (m.isMonarch && m.team1 && m.team2) {
        var ms1 = parseInt(m.scoreP1) || 0;
        var ms2 = parseInt(m.scoreP2) || 0;
        var isDraw = m.winner === 'draw' || m.draw;
        var team1Won = !isDraw && m.winner === m.p1;
        var team2Won = !isDraw && m.winner === m.p2;
        // v2.3.15: acumula GAMES p/ a coluna "% games". O bloco monarch não chama
        // _accumulateGSM, então some aqui: usa m.sets quando houver (soma games de
        // todos os sets), senão usa scoreP1/scoreP2 (ex.: 6×2).
        var _g1 = 0, _g2 = 0;
        if (Array.isArray(m.sets) && m.sets.length) {
          m.sets.forEach(function(st){ _g1 += parseInt(st.gamesP1) || 0; _g2 += parseInt(st.gamesP2) || 0; });
        } else { _g1 = ms1; _g2 = ms2; }
        m.team1.forEach(function(name) {
          if (_isGhost(name)) return; // Jogador X joga mas não pontua
          _ensureEntry(name);
          scoreMap[name].played++;
          scoreMap[name].pointsDiff += (ms1 - ms2);
          scoreMap[name].gamesWon += _g1; scoreMap[name].gamesLost += _g2;
          if (isDraw) { scoreMap[name].draws = (scoreMap[name].draws || 0) + 1; scoreMap[name].points += 1; }
          else if (team1Won) { scoreMap[name].wins++; scoreMap[name].points += 3; }
          else { scoreMap[name].losses++; }
        });
        m.team2.forEach(function(name) {
          if (_isGhost(name)) return; // Jogador X joga mas não pontua
          _ensureEntry(name);
          scoreMap[name].played++;
          scoreMap[name].pointsDiff += (ms2 - ms1);
          scoreMap[name].gamesWon += _g2; scoreMap[name].gamesLost += _g1;
          if (isDraw) { scoreMap[name].draws = (scoreMap[name].draws || 0) + 1; scoreMap[name].points += 1; }
          else if (team2Won) { scoreMap[name].wins++; scoreMap[name].points += 3; }
          else { scoreMap[name].losses++; }
        });
        return;
      }

      // Handle draws — both players get 1 point each
      if (m.winner === 'draw' || m.draw) {
        _ensureEntry(m.p1); _ensureEntry(m.p2);
        scoreMap[m.p1].draws = (scoreMap[m.p1].draws || 0) + 1;
        scoreMap[m.p2].draws = (scoreMap[m.p2].draws || 0) + 1;
        scoreMap[m.p1].points += 1;
        scoreMap[m.p2].points += 1;
        scoreMap[m.p1].played++;
        scoreMap[m.p2].played++;
        var ds1 = parseInt(m.scoreP1) || 0;
        var ds2 = parseInt(m.scoreP2) || 0;
        scoreMap[m.p1].pointsDiff += (ds1 - ds2);
        scoreMap[m.p2].pointsDiff += (ds2 - ds1);
        if (!Array.isArray(m.sets) || !m.sets.length) {
          scoreMap[m.p1].gamesWon += ds1; scoreMap[m.p1].gamesLost += ds2;
          scoreMap[m.p2].gamesWon += ds2; scoreMap[m.p2].gamesLost += ds1;
        }
        _accumulateGSM(m);
        return;
      }

      const loser = m.winner === m.p1 ? m.p2 : m.p1;
      _ensureEntry(m.winner); _ensureEntry(loser);

      scoreMap[m.winner].wins++;
      scoreMap[m.winner].points += 3;
      scoreMap[m.winner].played++;
      scoreMap[loser].losses++;
      scoreMap[loser].played++;

      const s1 = parseInt(m.scoreP1) || 0;
      const s2 = parseInt(m.scoreP2) || 0;
      if (m.winner === m.p1) {
        scoreMap[m.p1].pointsDiff += (s1 - s2);
        scoreMap[m.p2].pointsDiff += (s2 - s1);
      } else {
        scoreMap[m.p2].pointsDiff += (s2 - s1);
        scoreMap[m.p1].pointsDiff += (s1 - s2);
      }
      if (!Array.isArray(m.sets) || !m.sets.length) {
        scoreMap[m.p1].gamesWon += s1; scoreMap[m.p1].gamesLost += s2;
        scoreMap[m.p2].gamesWon += s2; scoreMap[m.p2].gamesLost += s1;
      }
      _accumulateGSM(m);
    });
  });

  const standings = Object.values(scoreMap);

  // Build Buchholz scores (sum of opponents' points)
  var allRoundMatches = (t.rounds || []).flatMap(r => r.matches || []);
  if (category) allRoundMatches = allRoundMatches.filter(m => m.category === category);
  standings.forEach(s => {
    s.buchholz = 0;
    allRoundMatches.forEach(m => {
      if (m.isBye || !m.winner) return;
      if (m.winner === 'draw' || m.draw) {
        // Empate: ambos jogaram contra o outro — contar pontos do oponente
        if (m.p1 === s.name && scoreMap[m.p2]) s.buchholz += scoreMap[m.p2].points;
        if (m.p2 === s.name && scoreMap[m.p1]) s.buchholz += scoreMap[m.p1].points;
        return;
      }
      if (m.p1 === s.name && scoreMap[m.p2]) s.buchholz += scoreMap[m.p2].points;
      if (m.p2 === s.name && scoreMap[m.p1]) s.buchholz += scoreMap[m.p1].points;
    });
    // Sonneborn-Berger: sum of points of opponents you beat + half points of opponents you drew
    s.sonnebornBerger = 0;
    allRoundMatches.forEach(m => {
      if (m.isBye || !m.winner) return;
      if (m.winner === 'draw' || m.draw) {
        // Empate: metade dos pontos do oponente
        var opp = m.p1 === s.name ? m.p2 : (m.p2 === s.name ? m.p1 : null);
        if (opp && scoreMap[opp]) s.sonnebornBerger += scoreMap[opp].points * 0.5;
        return;
      }
      if (m.winner === s.name) {
        const opp = m.p1 === s.name ? m.p2 : m.p1;
        if (scoreMap[opp]) s.sonnebornBerger += scoreMap[opp].points;
      }
    });
  });

  // Compute gamesDiff for each player
  standings.forEach(function(s) { s.gamesDiff = (s.gamesWon || 0) - (s.gamesLost || 0); s.setsDiff = (s.setsWon || 0) - (s.setsLost || 0); });

  // Advanced Points: compute per player if enabled. v2.3.12: o total já inclui
  // a compensação de folga (média das rodadas jogadas), calculada dentro de
  // _calcAdvancedPoints — então os avançados não precisam de ajuste extra aqui.
  if (t.advancedScoring && t.advancedScoring.enabled && typeof _calcAdvancedPoints === 'function') {
    standings.forEach(function(s) {
      s.advancedPoints = _calcAdvancedPoints(t, s.name, category).total;
    });
  }

  // v2.3.12: compensação de FOLGA nos pontos SIMPLES (3/1/0) = MÉDIA das rodadas
  // JOGADAS × nº de folgas, recalculada a cada rodada. (Os avançados já têm a
  // compensação embutida acima.) Sem rodada jogada → sem média → 0.
  standings.forEach(function(s) {
    var _rsB = _playerRoundStats(t, s.name, category);
    s.sitOutRounds = _rsB.satOut;
    // v2.3.81: compensa só folgas por sorteio (satOutCompensable). Folga por
    // inatividade (desativado) = 0 pts e não muda a média.
    if (_rsB.satOutCompensable > 0 && _rsB.played > 0) {
      var _basicAvg = s.points / _rsB.played;
      s.points += Math.round(_basicAvg * _rsB.satOutCompensable);
    }
  });

  // v0.17.40: ordem padrão recomendada (alinhada com a UI em
  // create-tournament.js): Confronto Direto → Saldo → Vitórias → Buchholz
  // → Sonneborn-Berger → Sorteio. Baseada em padrões ITF (tênis), FIDE
  // (xadrez) e FIBA (basquete). Em GSM, critérios de sets/games entram
  // entre Saldo e Vitórias pra dar granularidade ao desempate. Quando
  // Pontos Avançados está ativo, vai pro topo (já era assim).
  // Empty array fallback: se t.tiebreakers existe mas está vazio,
  // usar default em vez de [] (que pulava todos os tiebreakers).
  var defaultTb = ['confronto_direto', 'saldo_pontos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'];
  if (t.scoring && t.scoring.type === 'sets') {
    defaultTb = ['confronto_direto', 'saldo_sets', 'saldo_games', 'sets_vencidos', 'games_vencidos', 'tiebreaks_vencidos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'];
  }
  if (t.advancedScoring && t.advancedScoring.enabled) {
    defaultTb = ['pontos_avancados'].concat(defaultTb);
  }
  const tiebreakers = (Array.isArray(t.tiebreakers) && t.tiebreakers.length > 0) ? t.tiebreakers : defaultTb;

  // v2.2.47: mapa nome→timestamp de nascimento (pros critérios antiguidade/juventude)
  var birthByName = (typeof window._tbBirthByName === 'function') ? window._tbBirthByName(t) : {};

  // Build head-to-head map for confronto_direto
  const h2h = {};
  allRoundMatches.forEach(m => {
    if (!m.winner || m.isBye || m.isSitOut) return;
    const isDraw = m.winner === 'draw' || m.draw;
    if (isDraw) {
      const key = `${m.p1}|||${m.p2}|||d`;
      h2h[key] = (h2h[key] || 0) + 1;
      const keyReverse = `${m.p2}|||${m.p1}|||d`;
      h2h[keyReverse] = (h2h[keyReverse] || 0) + 1;
    } else {
      const key = `${m.winner}|||${m.winner === m.p1 ? m.p2 : m.p1}`;
      h2h[key] = (h2h[key] || 0) + 1;
    }
  });

  // v2.3.11: quando o Sistema de Pontos Avançado está ativo, ELE é a pontuação
  // PRINCIPAL da Liga (substitui os pontos simples 3/1/0 como critério primário).
  // Os pontos avançados já são recomputados de todas as partidas em
  // _calcAdvancedPoints. Sem o sistema ativo, segue o padrão 3/1/0.
  var _advPrimary = !!(t.advancedScoring && t.advancedScoring.enabled);
  standings.sort((a, b) => {
    // Primary: pontos avançados (se ativos) OU pontos simples
    if (_advPrimary) {
      var _advDiff = (b.advancedPoints || 0) - (a.advancedPoints || 0);
      if (_advDiff !== 0) return _advDiff;
    } else {
      if (b.points !== a.points) return b.points - a.points;
    }

    // Then apply configured tiebreakers
    for (const tb of tiebreakers) {
      let diff = 0;
      switch (tb) {
        case 'confronto_direto':
          const aBeatsB = h2h[`${a.name}|||${b.name}`] || 0;
          const bBeatsA = h2h[`${b.name}|||${a.name}`] || 0;
          const aDrawsB = h2h[`${a.name}|||${b.name}|||d`] || 0;
          diff = bBeatsA - aBeatsB; // negative means a wins
          if (diff !== 0) return diff < 0 ? -1 : 1;
          // If direct wins are equal, consider draws in the comparison
          if (aDrawsB > 0) break; // draws are neutral for sorting
          break;
        case 'saldo_pontos':
          diff = b.pointsDiff - a.pointsDiff;
          if (diff !== 0) return diff;
          break;
        case 'vitorias':
          diff = b.wins - a.wins;
          if (diff !== 0) return diff;
          break;
        case 'buchholz':
          diff = (b.buchholz || 0) - (a.buchholz || 0);
          if (diff !== 0) return diff;
          break;
        case 'sonneborn_berger':
          diff = (b.sonnebornBerger || 0) - (a.sonnebornBerger || 0);
          if (diff !== 0) return diff;
          break;
        case 'sets_vencidos':
          diff = (b.setsWon || 0) - (a.setsWon || 0);
          if (diff !== 0) return diff;
          break;
        case 'saldo_sets':
          diff = ((b.setsWon || 0) - (b.setsLost || 0)) - ((a.setsWon || 0) - (a.setsLost || 0));
          if (diff !== 0) return diff;
          break;
        case 'saldo_games':
          diff = ((b.gamesWon || 0) - (b.gamesLost || 0)) - ((a.gamesWon || 0) - (a.gamesLost || 0));
          if (diff !== 0) return diff;
          break;
        case 'games_vencidos':
          diff = (b.gamesWon || 0) - (a.gamesWon || 0);
          if (diff !== 0) return diff;
          break;
        case 'tiebreaks_vencidos':
          diff = (b.tiebreaksWon || 0) - (a.tiebreaksWon || 0);
          if (diff !== 0) return diff;
          break;
        case 'pontos_avancados':
          diff = (b.advancedPoints || 0) - (a.advancedPoints || 0);
          if (diff !== 0) return diff;
          break;
        case 'antiguidade': {
          // mais velho ganha → nascimento mais antigo (timestamp menor) vem primeiro
          var aoBirth = birthByName[a.name], boBirth = birthByName[b.name];
          if (aoBirth != null && boBirth != null && aoBirth !== boBirth) return aoBirth - boBirth;
          break;
        }
        case 'juventude': {
          // mais novo ganha → nascimento mais recente (timestamp maior) vem primeiro
          var ayBirth = birthByName[a.name], byBirth = birthByName[b.name];
          if (ayBirth != null && byBirth != null && ayBirth !== byBirth) return byBirth - ayBirth;
          break;
        }
        case 'sorteio':
          return Math.random() - 0.5;
      }
    }
    return 0;
  });

  return standings;
}

// ─── Get champion (only from actual final with real participants) ──────────────
function _getChampion(t, activeRounds) {
  if (!activeRounds || activeRounds.length === 0) return null;

  const allMatches = t.matches || [];
  const roundsMap = {};
  allMatches.forEach(m => { if (!roundsMap[m.round]) roundsMap[m.round] = []; roundsMap[m.round].push(m); });

  // Champion only exists when ALL active rounds are complete (every non-BYE match has a winner)
  const allDone = activeRounds.every(r =>
    (roundsMap[r] || []).every(m => m.winner || m.isBye)
  );
  if (!allDone) return null;

  const lastRound = activeRounds[activeRounds.length - 1];
  const finalMatches = (roundsMap[lastRound] || []).filter(m => !m.isBye && m.p1 !== 'TBD');
  if (finalMatches.length === 0) return null;

  // All final matches must have a winner (handles double elim grand final too)
  const final = finalMatches.find(m => m.winner);
  return final ? final.winner : null;
}

// ─── Find match anywhere ──────────────────────────────────────────────────────
function _findMatch(t, matchId) {
  // Use canonical collector: covers all 7 storage shapes
  // (t.matches, t.thirdPlaceMatch, t.rounds[].matches, t.groups[].matches,
  //  t.groups[].rounds[] array form, t.rodadas[].matches, t.rodadas[] array form).
  // Previously missed t.groups[].matches (flat group matches, not in sub-rounds)
  // and t.rodadas entirely — causing silent failures in advance-winner and
  // result-save for those shapes.
  var _idEq = function(a, b) { return a != null && b != null && String(a) === String(b); };
  if (typeof window._collectAllMatches === 'function') {
    const all = window._collectAllMatches(t);
    for (let i = 0; i < all.length; i++) {
      if (all[i] && _idEq(all[i].id, matchId)) return all[i];
    }
    return null;
  }
  // Defensive fallback: bracket-model.js not loaded.
  if (t.thirdPlaceMatch && _idEq(t.thirdPlaceMatch.id, matchId)) return t.thirdPlaceMatch;
  let m = (t.matches || []).find(m => _idEq(m.id, matchId));
  if (m) return m;
  for (const round of (t.rounds || [])) {
    m = (round.matches || []).find(m => _idEq(m.id, matchId));
    if (m) return m;
  }
  for (const group of (t.groups || [])) {
    if (Array.isArray(group.matches)) {
      m = group.matches.find(m => _idEq(m.id, matchId));
      if (m) return m;
    }
    for (const round of (group.rounds || [])) {
      if (Array.isArray(round)) {
        m = round.find(m => _idEq(m.id, matchId));
      } else {
        m = (round.matches || []).find(m => _idEq(m.id, matchId));
      }
      if (m) return m;
    }
  }
  return null;
}

// ─── Auto-resolve BYE match when a real player is placed ─────────────────────
function _autoResolveBye(t, match) {
  if (!match || match.winner) return; // already resolved
  var byeLabel = _t('bui.byeLabel');
  var p1Real = match.p1 && match.p1 !== 'TBD' && match.p1 !== byeLabel;
  var p2Real = match.p2 && match.p2 !== 'TBD' && match.p2 !== byeLabel;
  var p1Bye = match.p1 === byeLabel;
  var p2Bye = match.p2 === byeLabel;
  // One real player + one BYE → auto-resolve
  if (p1Real && p2Bye) {
    match.winner = match.p1;
    match.isBye = true;
    _advanceWinner(t, match);
  } else if (p2Real && p1Bye) {
    match.winner = match.p2;
    match.isBye = true;
    _advanceWinner(t, match);
  }
}

// ─── Advance winner to next round ────────────────────────��───────────────────
function _advanceWinner(t, completedMatch) {
  const winner = completedMatch.winner;
  const loser = winner === completedMatch.p1 ? completedMatch.p2 : completedMatch.p1;
  // Loser-drop pra chave de perdedores. Vale pra Dupla Eliminatória de torneio
  // normal E pra fase final (playoff) de Liga em Dupla Eliminatória — neste caso
  // o match tem phase:'playoff' + bracket ('upper'/'lower'/'grand'). Aditivo e
  // guardado: playoff de eliminatória simples não tem `bracket` → comportamento
  // intocado; Liga/torneios normais idem.
  const isDupla = t.format === 'Dupla Eliminatória'
    || (completedMatch.phase === 'playoff' && !!completedMatch.bracket);

  if (completedMatch.nextMatchId) {
    const next = _findMatch(t, completedMatch.nextMatchId);
    if (next) {
      // v1.0.67-beta: marca slot como "veio de BYE" pra renderMatchCard
      // exibir tag "BYE" SÓ nesta rodada (rodadas seguintes, vitórias
      // normais não sinalizam mais). User: "isso deve se aplicar a todo
      // e qualquer bye em qualquer torneio".
      var fromBye = !!completedMatch.isBye;
      // Play-in matches specify which slot to fill via nextSlot
      if (completedMatch.nextSlot === 'p1') {
        next.p1 = winner;
        if (fromBye) next.p1FromBye = true;
      } else if (completedMatch.nextSlot === 'p2') {
        next.p2 = winner;
        if (fromBye) next.p2FromBye = true;
      } else {
        // Standard advancement: fill first available TBD slot
        if (!next.p1 || next.p1 === 'TBD') {
          next.p1 = winner;
          if (fromBye) next.p1FromBye = true;
        } else if (!next.p2 || next.p2 === 'TBD') {
          next.p2 = winner;
          if (fromBye) next.p2FromBye = true;
        }
      }
      // Auto-resolve BYE matches: if one slot is filled and the other is BYE
      _autoResolveBye(t, next);
    }
  }

  // Dupla Eliminatória: loser goes to lower bracket
  if (completedMatch.loserMatchId && isDupla) {
    const loserMatch = _findMatch(t, completedMatch.loserMatchId);
    if (loserMatch) {
      if (completedMatch.loserSlot === 'p1') loserMatch.p1 = loser;
      else if (completedMatch.loserSlot === 'p2') loserMatch.p2 = loser;
      else {
        if (!loserMatch.p1 || loserMatch.p1 === 'TBD') loserMatch.p1 = loser;
        else if (!loserMatch.p2 || loserMatch.p2 === 'TBD') loserMatch.p2 = loser;
      }
      _autoResolveBye(t, loserMatch);
    }
  }

  // Construtor de Fases: roteamento genérico do PERDEDOR (ex.: vice da chave Ouro
  // e vice da Prata → disputa de 3º/4º). Aditivo e guardado por campo — só dispara
  // quando o match define loserNextMatchId (gerado pelo phases-engine). Torneios
  // sem esse campo (todos os atuais) ficam intocados.
  if (completedMatch.loserNextMatchId) {
    const lnMatch = _findMatch(t, completedMatch.loserNextMatchId);
    if (lnMatch) {
      if (completedMatch.loserNextSlot === 'p1') lnMatch.p1 = loser;
      else if (completedMatch.loserNextSlot === 'p2') lnMatch.p2 = loser;
      else {
        if (!lnMatch.p1 || lnMatch.p1 === 'TBD') lnMatch.p1 = loser;
        else if (!lnMatch.p2 || lnMatch.p2 === 'TBD') lnMatch.p2 = loser;
      }
      _autoResolveBye(t, lnMatch);
    }
  }

  // Repechage: when R1 match completes, check if ALL R1 done → assign losers
  if (completedMatch.isRepechageR1 && t.repechageConfig) {
    _assignRepechageLosers(t);
  }
  // v2.7.69: REPESCAGEM DO CONSTRUTOR DE FASES (diferente da repescagem de
  // eliminatória acima). Quando uma partida isPhaseRepR1 fecha, resolve os melhores
  // perdedores da R1 daquela chave → preenche os slots de repescagem + o jogo de
  // repescagem. _resolveRepechage é idempotente (só age quando todos os R1 da chave
  // têm vencedor e ainda há slot pendente).
  if (completedMatch.isPhaseRepR1 && typeof window !== 'undefined' && typeof window._resolveRepechage === 'function') {
    try { window._resolveRepechage(t, completedMatch.bracket); } catch (e) {}
  }
  // Repechage: when repechage match completes, check if ALL done → advance best loser
  if (completedMatch.isRepechage && t.repechageConfig && t.repechageConfig.bestLoserCount > 0) {
    _advanceBestLoser(t);
  }

  // Swiss/Liga: check if round is fully complete
  if (completedMatch.roundIndex !== undefined) {
    const round = (t.rounds || [])[completedMatch.roundIndex];
    if (round && (round.matches || []).every(m => m.winner || m.isBye || m.isSitOut)) {
      round.status = 'complete';
      t.standings = _computeStandings(t);
    }
  }

  _maybeGenerate3rdPlace(t);

  // Progressive classification: assign final positions to eliminated players
  _updateProgressiveClassification(t);

  // Auto-detect tournament completion for elimination formats
  _maybeFinishElimination(t);
}

// ─── Repechage helper: rank players using tournament tiebreaker criteria ─────
// Builds a rich stats object per player from all their matches, then sorts using
// the same criteria as _updateProgressiveClassification + configured t.tiebreakers.
function _rankByTiebreakers(t, playerNames) {
  var allMatches = t.matches || [];
  var players = playerNames.map(function(name) {
    var totalScored = 0, totalConceded = 0, matchesWon = 0, matchesPlayed = 0;
    var setsWon = 0, setsLost = 0, gamesWon = 0, gamesLost = 0, tiebreaksWon = 0;
    var lastScoreDiff = 0, lastPointsScored = 0;

    allMatches.forEach(function(m) {
      if (!m.winner || m.isBye || m.isSitOut) return;
      if (m.p1 !== name && m.p2 !== name) return;
      var isP1 = m.p1 === name;
      var scored = parseInt(isP1 ? m.scoreP1 : m.scoreP2) || 0;
      var conceded = parseInt(isP1 ? m.scoreP2 : m.scoreP1) || 0;
      totalScored += scored;
      totalConceded += conceded;
      matchesPlayed++;
      if (m.winner === name) matchesWon++;

      // Track last match (most recent = the loss that eliminated them)
      lastPointsScored = scored;
      lastScoreDiff = scored - conceded; // higher = closer game = better

      // GSM stats
      if (m.sets && Array.isArray(m.sets)) {
        m.sets.forEach(function(s) {
          var pg = isP1 ? (s.gamesP1 || 0) : (s.gamesP2 || 0);
          var og = isP1 ? (s.gamesP2 || 0) : (s.gamesP1 || 0);
          gamesWon += pg; gamesLost += og;
          if (pg > og) setsWon++; else if (og > pg) setsLost++;
          if (s.tiebreak) {
            var tp = isP1 ? (s.tiebreak.pointsP1 || 0) : (s.tiebreak.pointsP2 || 0);
            var to = isP1 ? (s.tiebreak.pointsP2 || 0) : (s.tiebreak.pointsP1 || 0);
            if (tp > to) tiebreaksWon++;
          }
        });
      }
    });

    return {
      name: name,
      wins: matchesWon,
      played: matchesPlayed,
      scored: totalScored,
      conceded: totalConceded,
      diff: totalScored - totalConceded,
      lastScoreDiff: lastScoreDiff,
      lastPointsScored: lastPointsScored,
      setsWon: setsWon,
      setsLost: setsLost,
      setsDiff: setsWon - setsLost,
      gamesWon: gamesWon,
      gamesLost: gamesLost,
      gamesDiff: gamesWon - gamesLost,
      tiebreaksWon: tiebreaksWon
    };
  });

  // Build head-to-head map
  var h2h = {};
  allMatches.forEach(function(m) {
    if (!m.winner || m.isBye || m.isSitOut) return;
    var key = m.p1 + '|' + m.p2;
    if (!h2h[key]) h2h[key] = { w1: 0, w2: 0 };
    if (m.winner === m.p1) h2h[key].w1++;
    else if (m.winner === m.p2) h2h[key].w2++;
  });

  // v0.17.40: alinhado com default principal — confronto direto + Buchholz
  // + Sonneborn fazem sentido em repechage também (rank de jogadores que
  // jogaram entre si). Empty array fallback aplicado.
  var defaultTb = ['confronto_direto', 'saldo_pontos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'];
  if (t.scoring && t.scoring.type === 'gsm') {
    defaultTb = ['confronto_direto', 'saldo_sets', 'saldo_games', 'sets_vencidos', 'games_vencidos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'];
  }
  var tiebreakers = (Array.isArray(t.tiebreakers) && t.tiebreakers.length > 0) ? t.tiebreakers : defaultTb;
  var birthByName = (typeof window._tbBirthByName === 'function') ? window._tbBirthByName(t) : {};

  players.sort(function(a, b) {
    // Primary: last match score diff (closer game = better = higher diff)
    if (a.lastScoreDiff !== b.lastScoreDiff) return b.lastScoreDiff - a.lastScoreDiff;
    // Then: configured tiebreakers
    for (var ti = 0; ti < tiebreakers.length; ti++) {
      var tb = tiebreakers[ti];
      var diff = 0;
      switch (tb) {
        case 'antiguidade': {
          var aoB = birthByName[a.name], boB = birthByName[b.name];
          if (aoB != null && boB != null && aoB !== boB) return aoB - boB; // mais velho primeiro
          break;
        }
        case 'juventude': {
          var ayB = birthByName[a.name], byB = birthByName[b.name];
          if (ayB != null && byB != null && ayB !== byB) return byB - ayB; // mais novo primeiro
          break;
        }
        case 'confronto_direto':
          var k1 = a.name + '|' + b.name;
          var k2 = b.name + '|' + a.name;
          var h1 = h2h[k1] || { w1: 0, w2: 0 };
          var h2 = h2h[k2] || { w1: 0, w2: 0 };
          var aWins = h1.w1 + h2.w2;
          var bWins = h1.w2 + h2.w1;
          diff = bWins - aWins; // more h2h wins = better
          break;
        case 'saldo_pontos':
          diff = b.diff - a.diff;
          break;
        case 'vitorias':
          diff = b.wins - a.wins;
          break;
        case 'buchholz':
          // Skip for elimination — not applicable with few matches
          break;
        case 'sonneborn_berger':
          break;
        case 'saldo_sets':
          diff = b.setsDiff - a.setsDiff;
          break;
        case 'saldo_games':
          diff = b.gamesDiff - a.gamesDiff;
          break;
        case 'sets_vencidos':
          diff = b.setsWon - a.setsWon;
          break;
        case 'games_vencidos':
          diff = b.gamesWon - a.gamesWon;
          break;
        case 'tiebreaks_vencidos':
          diff = b.tiebreaksWon - a.tiebreaksWon;
          break;
        case 'sorteio':
          diff = Math.random() - 0.5;
          break;
      }
      if (diff !== 0) return diff;
    }
    // Ultimate: more points scored, then alphabetical
    if (a.scored !== b.scored) return b.scored - a.scored;
    return a.name.localeCompare(b.name);
  });

  return players;
}

// ─── Repechage: assign R1 losers to repechage matches by full tiebreaker criteria ─
// Called after each R1 result. Only acts when ALL R1 matches are complete.
// Ranks losers using tournament tiebreaker criteria (score diff, sets, games, h2h, etc).
// Top N losers fill repechage matches; rest are eliminated.
function _assignRepechageLosers(t) {
  var cfg = t.repechageConfig;
  if (!cfg || cfg._losersAssigned) return;

  // Check if ALL R1 repechage matches are complete
  var r1Matches = cfg.r1MatchIds.map(function(id) { return _findMatch(t, id); }).filter(Boolean);
  var allDone = r1Matches.length === cfg.r1MatchIds.length && r1Matches.every(function(m) { return m.winner; });
  if (!allDone) return;

  // Collect loser names
  var loserNames = [];
  r1Matches.forEach(function(m) {
    var loser = m.winner === m.p1 ? m.p2 : m.p1;
    if (loser && loser !== 'TBD' && loser !== 'BYE') loserNames.push(loser);
  });

  // Rank using full tiebreaker criteria
  var rankedLosers = _rankByTiebreakers(t, loserNames);

  // v1.0.66-beta: novo modelo (sem jogos de repescagem). Os N melhores
  // derrotados (N = bestLoserCount = excess) vão DIRETO pros slots
  // `awaitsBestLoser` da R2. Os piores são eliminados imediatamente.
  // Backward-compat: se cfg.repMatchIds tem partidas (modelo antigo
  // ainda em torneios criados pré-v1.0.66), mantém o caminho antigo.
  // v1.0.73-beta: awaitsBestLoser pode ter múltiplos slots ('p1,p2')
  // quando ambos slots da match são bestloser.
  if (!cfg.repMatchIds || cfg.repMatchIds.length === 0) {
    // Novo modelo: seleção direta pros slots awaitsBestLoser
    var bestLosers = rankedLosers.slice(0, cfg.bestLoserCount || 0);
    var blIdx = 0;
    var allM = t.matches || [];
    for (var ai = 0; ai < allM.length && blIdx < bestLosers.length; ai++) {
      var m = allM[ai];
      if (m.awaitsBestLoser && (!t._catFilterForRep || m.category === t._catFilterForRep)) {
        // suporta 'p1', 'p2' ou 'p1,p2' (múltiplos slots)
        var slots = String(m.awaitsBestLoser).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        for (var si = 0; si < slots.length && blIdx < bestLosers.length; si++) {
          m[slots[si]] = bestLosers[blIdx].name;
          // v2.1.36: marca o SLOT como "entrou por repescagem" (tag no time, só
          // nesta rodada). Quem avança por vitória depois NÃO herda a tag.
          m[slots[si] + 'FromRepechage'] = true;
          blIdx++;
        }
        delete m.awaitsBestLoser;
        _autoResolveBye(t, m);
      }
    }
    cfg._rankedLosers = rankedLosers;
    cfg._losersAssigned = true;
    cfg._bestLoserAdvanced = true; // skip _advanceBestLoser (já fizemos)
    return;
  }

  // Modelo antigo: top repParticipants vão pra rep matches
  var repLosers = rankedLosers.slice(0, cfg.repParticipants);
  var repMatches = cfg.repMatchIds.map(function(id) { return _findMatch(t, id); }).filter(Boolean);
  var slotIdx = 0;
  for (var i = 0; i < repLosers.length; i++) {
    var targetMatch = repMatches[Math.floor(slotIdx / 2)];
    if (targetMatch) {
      if (slotIdx % 2 === 0) targetMatch.p1 = repLosers[i].name;
      else targetMatch.p2 = repLosers[i].name;
    }
    slotIdx++;
  }

  // Store ranking for best-loser evaluation later
  cfg._rankedLosers = rankedLosers;
  cfg._losersAssigned = true;
}

// ─── Repechage: advance best losers to R2 after all repechage matches done ───
// When all repechage matches are complete and bestLoserCount > 0,
// re-rank ALL repechage losers using full tiebreaker criteria (not just R1 stats)
// and advance the best to their R2 slots.
function _advanceBestLoser(t) {
  var cfg = t.repechageConfig;
  if (!cfg || !cfg._losersAssigned || cfg._bestLoserAdvanced) return;
  if (cfg.bestLoserCount <= 0) return;

  // Check if ALL repechage matches are complete
  var repMatches = cfg.repMatchIds.map(function(id) { return _findMatch(t, id); }).filter(Boolean);
  var allDone = repMatches.length === cfg.repMatchIds.length && repMatches.every(function(m) { return m.winner; });
  if (!allDone) return;

  // Collect repechage losers
  var repLoserNames = [];
  repMatches.forEach(function(m) {
    var loser = m.winner === m.p1 ? m.p2 : m.p1;
    if (loser && loser !== 'TBD' && loser !== 'BYE') repLoserNames.push(loser);
  });

  // Rank using full tiebreaker criteria (considers all matches: R1 + repechage)
  var rankedRepLosers = _rankByTiebreakers(t, repLoserNames);

  // Advance top bestLoserCount to their R2 slots
  var bestLosersToAdvance = rankedRepLosers.slice(0, cfg.bestLoserCount);
  var blIdx = 0;
  var allM = t.matches || [];
  for (var i = 0; i < allM.length && blIdx < bestLosersToAdvance.length; i++) {
    var m = allM[i];
    if (m.awaitsBestLoser) {
      var slot = m.awaitsBestLoser; // 'p1' or 'p2'
      m[slot] = bestLosersToAdvance[blIdx].name;
      m[slot + 'FromRepechage'] = true; // v2.1.36: tag no time que entrou por repescagem
      delete m.awaitsBestLoser;
      blIdx++;
      _autoResolveBye(t, m);
    }
  }

  cfg._bestLoserAdvanced = true;
}

// ─── Progressive classification for elimination formats ─────────────────────
// Assigns unique finalPosition to eliminated players using tiebreaker criteria.
// Players eliminated in the same round are ranked individually by:
//   1. Score in the losing match (closer score = higher rank)
//   2. Scores from previous rounds (accumulated)
//   3. Alphabetical as ultimate tiebreaker
// v1.0.90-beta: classificação específica para Dupla Eliminatória.
// User: 'preenchido até a grande final ainda diz que falta um jogo. não está
// informando a classificação personalizada. na verdade não dá classificação
// alguma.' Bug: _updateProgressiveClassification foi escrita pra Single Elim.
// Filtrava LOWER e GRAND brackets fora e tratava upper final winner=1º (errado:
// ele vai pra GF). Em DE a posição final = ordem de eliminação no Lower bracket.
//
// Lógica:
//   1º = GF winner, 2º = GF loser
//   3º = Lower Final loser, 4º = Lower R(final-1) loser
//   ...e assim sucessivamente até LR1 (primeiros eliminados = pior posição)
//
// Para 8 times DE: LR1(2 partidas)→pos 7-8, LR2(2)→5-6, LR3(1)→4, LR4(1)→3, GF→1-2.
// Para 16 times DE: LR1(4)→13-16, LR2(4)→9-12, LR3(2)→7-8, LR4(2)→5-6, LR5(1)→4,
//                   LR6(1)→3, GF→1-2.
//
// Suporta estado parcial (ex: GF pendente, LR4 não jogou ainda) — só atribui
// posição quando o match tem winner. Slots de matches não-jogados ainda contam
// pra deslocar nextPos (mantém numeração coerente quando completar).
function _updateDuplaElimClassification(t) {
  if (!Array.isArray(t.matches)) return;
  t.classification = {};

  var lowerMatches = [];
  var grandFinal = null;
  t.matches.forEach(function(m) {
    if (!m) return;
    if (m.bracket === 'grand') grandFinal = m;
    else if (m.bracket === 'lower') lowerMatches.push(m);
  });

  // GF: 1º e 2º
  if (grandFinal && grandFinal.winner && grandFinal.winner !== 'draw') {
    var gfWinner = grandFinal.winner;
    var gfLoser = gfWinner === grandFinal.p1 ? grandFinal.p2 : grandFinal.p1;
    if (gfWinner && gfWinner !== 'TBD') t.classification[gfWinner] = 1;
    if (gfLoser && gfLoser !== 'TBD') t.classification[gfLoser] = 2;
  }

  // Lower bracket: agrupa por round, processa de DESC (final = maior round = melhor pos)
  var lowerByRound = {};
  lowerMatches.forEach(function(m) {
    if (m.round === undefined || m.round === null) return;
    if (!lowerByRound[m.round]) lowerByRound[m.round] = [];
    lowerByRound[m.round].push(m);
  });
  var roundNums = Object.keys(lowerByRound).map(Number).sort(function(a, b) { return b - a; });

  var nextPos = 3;
  roundNums.forEach(function(rn) {
    var matchesInRound = lowerByRound[rn];
    // Coleta perdedores (só matches com winner)
    var losersWithMatch = [];
    matchesInRound.forEach(function(m) {
      if (!m.winner || m.winner === 'draw') return;
      var loser = m.winner === m.p1 ? m.p2 : m.p1;
      if (!loser || loser === 'TBD' || loser === 'BYE') return;
      if (t.classification[loser] !== undefined) return; // já placed
      losersWithMatch.push({ match: m, loser: loser });
    });
    // Sort by score margin (close = melhor posição dentro do bloco)
    losersWithMatch.sort(function(a, b) {
      var aLS = a.match.winner === a.match.p1 ? (parseInt(a.match.scoreP2) || 0) : (parseInt(a.match.scoreP1) || 0);
      var aWS = a.match.winner === a.match.p1 ? (parseInt(a.match.scoreP1) || 0) : (parseInt(a.match.scoreP2) || 0);
      var bLS = b.match.winner === b.match.p1 ? (parseInt(b.match.scoreP2) || 0) : (parseInt(b.match.scoreP1) || 0);
      var bWS = b.match.winner === b.match.p1 ? (parseInt(b.match.scoreP1) || 0) : (parseInt(b.match.scoreP2) || 0);
      return (bLS - bWS) - (aLS - aWS); // diff menos negativo (mais próximo) primeiro
    });
    // Atribui posições no bloco
    losersWithMatch.forEach(function(e, idx) {
      t.classification[e.loser] = nextPos + idx;
    });
    // Avança nextPos pelo TOTAL de matches do round (mesmo incompletos)
    // pra que LR(n-1) loser caia no slot certo se LR(n) match incompleto
    nextPos += matchesInRound.length;
  });

  // Suíço-cut times entram no FIM (mesma lógica da v1.0.89 pra Single Elim)
  if (Array.isArray(t.swissEliminated) && t.swissEliminated.length > 0 &&
      Array.isArray(t.swissStandings) && t.swissStandings.length > 0) {
    var maxPos = nextPos - 1;
    Object.keys(t.classification).forEach(function(name) {
      if (t.classification[name] > maxPos) maxPos = t.classification[name];
    });
    var advancedCount = t.swissStandings.length - t.swissEliminated.length;
    var eliminatedRanked = t.swissStandings.slice(advancedCount);
    eliminatedRanked.forEach(function(s, idx) {
      if (!s || !s.name) return;
      if (t.classification[s.name] === undefined) {
        t.classification[s.name] = maxPos + 1 + idx;
      }
    });
  }
}

function _updateProgressiveClassification(t) {
  if (!t.matches || t.matches.length === 0) return;
  var fmt = t.format || '';
  if (fmt.indexOf('Elim') === -1 && fmt.indexOf('Fase') === -1) return;

  // v1.0.90-beta: Dupla Eliminatória usa lógica DEDICADA (lower bracket + GF).
  // A função abaixo (single-elim) trata upper-final winner=1º que é ERRADO em
  // DE — winner do upper-final vai pra GF, ainda pode ser 2º.
  if (fmt === 'Dupla Eliminatória') {
    _updateDuplaElimClassification(t);
    return;
  }

  // Always recompute from scratch — incremental updates cause position
  // collisions because already-classified losers are skipped, making every
  // new loser in a round land at posStart+0 instead of a unique offset.
  t.classification = {};

  var allMatches = t.matches;
  var roundNums = {};
  allMatches.forEach(function(m) {
    if (m.round !== undefined && m.bracket !== 'lower' && m.bracket !== 'grand') {
      roundNums[m.round] = true;
    }
  });
  var rounds = Object.keys(roundNums).map(Number).sort(function(a,b) { return a - b; });
  var totalRounds = rounds.length;
  if (totalRounds < 1) return;

  // v2.8.22: round MÁXIMO em que cada equipe aparece. Com REPESCAGEM, um perdedor do
  // round R pode reaparecer em rounds > R (foi repescado) — ainda vivo ou eliminado
  // depois. A classificação só pode tratar um perdedor do round R como ELIMINADO ali
  // se R for a última aparição dele (maxRound==R). Sem isso, um repescado AINDA VIVO
  // (perdeu o round 0 mas está nas semis) ganhava posição no bloco do round 0 →
  // estourava o total (25º numa linha de 24) e dava posição a quem não foi eliminado.
  var maxRoundByName = {};
  allMatches.forEach(function(m) {
    if (!m || m.bracket === 'lower' || m.bracket === 'grand') return;
    if (m.round === undefined || m.round === null) return;
    [m.p1, m.p2].forEach(function(nm) {
      if (!nm || nm === 'TBD' || nm === 'BYE') return;
      if (maxRoundByName[nm] === undefined || m.round > maxRoundByName[nm]) maxRoundByName[nm] = m.round;
    });
  });
  function _advancedPast(name, roundNum) {
    return maxRoundByName[name] !== undefined && maxRoundByName[name] > roundNum;
  }

  // Helper: get loser's score and winner's score from a match
  function _getLoserStats(m) {
    var loser = m.winner === m.p1 ? m.p2 : m.p1;
    var loserScore = m.winner === m.p1 ? (parseInt(m.scoreP2) || 0) : (parseInt(m.scoreP1) || 0);
    var winnerScore = m.winner === m.p1 ? (parseInt(m.scoreP1) || 0) : (parseInt(m.scoreP2) || 0);
    // For GSM: use sets won as primary, then games diff
    var setsWon = 0, setsDiff = 0, gamesDiff = 0;
    if (m.sets && Array.isArray(m.sets)) {
      var lIdx = m.winner === m.p1 ? 1 : 0; // loser index (0=p1, 1=p2)
      m.sets.forEach(function(s) {
        var lg = lIdx === 0 ? (s.gamesP1 || 0) : (s.gamesP2 || 0);
        var wg = lIdx === 0 ? (s.gamesP2 || 0) : (s.gamesP1 || 0);
        if (lg > wg) setsWon++;
        gamesDiff += (lg - wg);
      });
      setsDiff = (m.winner === m.p1 ? (m.setsWonP2 || 0) - (m.setsWonP1 || 0) : (m.setsWonP1 || 0) - (m.setsWonP2 || 0));
    }
    return {
      loser: loser,
      loserScore: loserScore,
      winnerScore: winnerScore,
      scoreDiff: loserScore - winnerScore, // higher (closer to 0) = better fight
      setsWon: setsWon,
      setsDiff: setsDiff,
      gamesDiff: gamesDiff
    };
  }

  // Helper: accumulated scores for a player across all their matches
  function _getPlayerHistory(playerName) {
    var totalScored = 0, totalConceded = 0, matchesWon = 0;
    allMatches.forEach(function(m) {
      if (!m.winner || m.isBye || m.isSitOut) return;
      if (m.p1 !== playerName && m.p2 !== playerName) return;
      var isP1 = m.p1 === playerName;
      var scored = parseInt(isP1 ? m.scoreP1 : m.scoreP2) || 0;
      var conceded = parseInt(isP1 ? m.scoreP2 : m.scoreP1) || 0;
      totalScored += scored;
      totalConceded += conceded;
      if (m.winner === playerName) matchesWon++;
    });
    return { scored: totalScored, conceded: totalConceded, diff: totalScored - totalConceded, wins: matchesWon };
  }

  // Collect losers per round-group (same position block).
  // Process rounds from FINAL → R1 so definitive positions (1, 2, and 3/4 from
  // the 3rd place match) are recorded first. Players who made it further are
  // then skipped when we reach their earlier-round entry — this is critical
  // because stale/edited match data can list the same player as a loser in
  // multiple rounds. Without reverse order + skip, the earlier-round positionGroup
  // overwrites the canonical final position (e.g. final loser landing at pos 9
  // instead of pos 2 when they also appear in a stale R1 match).
  var positionGroups = []; // [{posStart, losers: [{name, stats, history}]}]
  var placed = {}; // name -> true: already assigned a definitive position

  // Record 3rd place match winner/loser up-front so semi/earlier rounds skip them.
  if (t.thirdPlaceMatch && t.thirdPlaceMatch.winner) {
    placed[t.thirdPlaceMatch.winner] = true;
    var _tp_loser = t.thirdPlaceMatch.winner === t.thirdPlaceMatch.p1 ? t.thirdPlaceMatch.p2 : t.thirdPlaceMatch.p1;
    if (_tp_loser && _tp_loser !== 'TBD') placed[_tp_loser] = true;
  }

  var reverseOrder = rounds.slice().reverse(); // [final, semi, qf, ..., r1]
  reverseOrder.forEach(function(roundNum) {
    var originalIdx = rounds.indexOf(roundNum);
    var roundFromEnd = totalRounds - 1 - originalIdx;
    var matchesInRound = allMatches.filter(function(m) {
      return m.round === roundNum && m.bracket !== 'lower' && m.bracket !== 'grand';
    });

    if (roundFromEnd === 0) {
      // Final: definitive 1st and 2nd
      matchesInRound.forEach(function(m) {
        if (!m.winner || m.winner === 'draw' || m.isBye) return;
        var loser = m.winner === m.p1 ? m.p2 : m.p1;
        if (!loser || loser === 'TBD' || loser === 'BYE') return;
        t.classification[m.winner] = 1;
        t.classification[loser] = 2;
        placed[m.winner] = true;
        placed[loser] = true;
      });
    } else if (roundFromEnd === 1) {
      // Semi: if 3rd place match exists, positions 3 & 4 are handled below.
      // If not, rank semi-losers individually as 3rd/4th using tiebreakers.
      if (!t.thirdPlaceMatch || !t.thirdPlaceMatch.winner) {
        var semiLosers = [];
        matchesInRound.forEach(function(m) {
          if (!m.winner || m.winner === 'draw' || m.isBye) return;
          var stats = _getLoserStats(m);
          if (!stats.loser || stats.loser === 'TBD' || stats.loser === 'BYE') return;
          if (placed[stats.loser]) return;
          if (_advancedPast(stats.loser, roundNum)) return; // repescado: ainda em jogo OU já classificado por uma derrota posterior
          var history = _getPlayerHistory(stats.loser);
          semiLosers.push({ name: stats.loser, stats: stats, history: history });
        });
        if (semiLosers.length > 0) {
          positionGroups.push({ posStart: 3, losers: semiLosers });
          semiLosers.forEach(function(e) { placed[e.name] = true; });
        }
      }
    } else {
      // Collect all losers in this round for tiebreaking
      var posStart = Math.pow(2, roundFromEnd) + 1;
      var losers = [];
      matchesInRound.forEach(function(m) {
        if (!m.winner || m.winner === 'draw' || m.isBye) return;
        var stats = _getLoserStats(m);
        if (!stats.loser || stats.loser === 'TBD' || stats.loser === 'BYE') return;
        if (placed[stats.loser]) return;
        if (_advancedPast(stats.loser, roundNum)) return; // repescado: avançou além deste round → não é eliminado aqui
        var history = _getPlayerHistory(stats.loser);
        losers.push({ name: stats.loser, stats: stats, history: history });
      });

      if (losers.length > 0) {
        positionGroups.push({ posStart: posStart, losers: losers });
        losers.forEach(function(e) { placed[e.name] = true; });
      }
    }
  });

  // Sort losers within each group and assign unique positions
  positionGroups.forEach(function(group) {
    group.losers.sort(function(a, b) {
      // 1. Higher loser score = closer match = better rank
      if (a.stats.scoreDiff !== b.stats.scoreDiff) return b.stats.scoreDiff - a.stats.scoreDiff;
      // 2. More sets won (GSM)
      if (a.stats.setsWon !== b.stats.setsWon) return b.stats.setsWon - a.stats.setsWon;
      // 3. Better game diff (GSM)
      if (a.stats.gamesDiff !== b.stats.gamesDiff) return b.stats.gamesDiff - a.stats.gamesDiff;
      // 4. More total points scored across tournament
      if (a.history.scored !== b.history.scored) return b.history.scored - a.history.scored;
      // 5. Better point differential across tournament
      if (a.history.diff !== b.history.diff) return b.history.diff - a.history.diff;
      // 6. More matches won across tournament
      if (a.history.wins !== b.history.wins) return b.history.wins - a.history.wins;
      // 7. Alphabetical
      return a.name.localeCompare(b.name);
    });

    group.losers.forEach(function(entry, idx) {
      t.classification[entry.name] = group.posStart + idx;
    });
  });

  // Handle 3rd place match result (applied LAST so it wins over any
  // contradictory entry a pathological dataset could produce).
  if (t.thirdPlaceMatch && t.thirdPlaceMatch.winner) {
    t.classification[t.thirdPlaceMatch.winner] = 3;
    var tp_loser = t.thirdPlaceMatch.winner === t.thirdPlaceMatch.p1 ? t.thirdPlaceMatch.p2 : t.thirdPlaceMatch.p1;
    if (tp_loser && tp_loser !== 'TBD') t.classification[tp_loser] = 4;
  }

  // v1.0.89-beta: incluir times cortados na fase Suíça na classificação final.
  // User: 'os 4 times que cairam antes das eliminatórias (nas rodadas suiças)
  // deveriam aparecer ocupando 20o ao 17o lugar'.
  // Quando p2Resolution='swiss', a transição Swiss→elim guarda em
  // t.swissEliminated os times que NÃO avançaram. Eles têm rank pelo
  // t.swissStandings (Buchholz/SB/etc). Aqui anexamos eles ao FINAL da
  // classificação na ordem do swissStandings (melhor cortado primeiro).
  // Mesma ideia se aplicaria a Reabrir/Play-in/Enquete/Lista no futuro,
  // mas Suíço é o caso onde os cortados jogaram (têm dado de classificação
  // real) — pra outros, o cut é arbitrário (alfabético, sorte) então
  // não faz sentido posição numérica.
  if (Array.isArray(t.swissEliminated) && t.swissEliminated.length > 0 &&
      Array.isArray(t.swissStandings) && t.swissStandings.length > 0) {
    // Encontra a maior posição já atribuída
    var _maxPos = 0;
    Object.keys(t.classification).forEach(function(name) {
      if (t.classification[name] > _maxPos) _maxPos = t.classification[name];
    });
    // Times cortados em swissStandings: são os ÚLTIMOS N do array (já
    // ordenado best→worst). swissStandings.length - swissEliminated.length
    // = quantos avançaram.
    var _advancedCount = t.swissStandings.length - t.swissEliminated.length;
    var _eliminatedRanked = t.swissStandings.slice(_advancedCount);
    // Atribui posições _maxPos+1, +2, ... (melhor cortado primeiro)
    _eliminatedRanked.forEach(function(s, idx) {
      if (!s || !s.name) return;
      // Não sobrescrever se já tem posição (não deveria, mas defensive)
      if (t.classification[s.name] === undefined) {
        t.classification[s.name] = _maxPos + 1 + idx;
      }
    });
  }

  // v1.1.0-beta: incluir não-classificados da Fase de Grupos na classificação
  // final, USANDO os critérios de desempate configurados pelo organizador
  // (t.tiebreakers). User: 'mais uma vez a classificação não inclui os que
  // participaram da primeira fase do torneio... aqui ficam os critérios de
  // desempate e podem ser ordenados de forma diferente pelo organizador.'
  //
  // Lógica:
  //   1. Pra cada grupo, computa standings completas (points/wins/saldo +
  //      sets/games/tiebreaks GSM + Buchholz + Sonneborn-Berger)
  //   2. Skip top N (classificados pra elim — já têm posição da v1.0.97)
  //   3. Junta todos os não-classificados num pool
  //   4. Sort pool com tiebreakers do organizador (confronto_direto,
  //      saldo_pontos, vitorias, buchholz, sonneborn_berger, sorteio, etc)
  //   5. Atribui posições maxPos+1, +2, ... no fim da classificação
  //
  // Pra 20 times com 4 grupos × 5, top 2 = 8 elim. Posições 9-20: 12
  // não-classificados ordenados pelos tiebreakers do organizador (cruzando
  // entre grupos).
  if (Array.isArray(t.groups) && t.groups.length > 0) {
    // ─── Helper: compute standings for a group (same shape as _computeStandings) ───
    var _computeGroupStandings = function(g) {
      var participants = g.players || g.participants || [];
      var groupMatches = (g.matches || []).slice();
      (g.rounds || []).forEach(function(r) {
        if (Array.isArray(r.matches)) groupMatches = groupMatches.concat(r.matches);
      });
      var smap = {};
      var ensure = function(nm) {
        if (!smap[nm]) smap[nm] = {
          name: nm, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0,
          setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, tiebreaksWon: 0,
          buchholz: 0, sonnebornBerger: 0
        };
      };
      participants.forEach(function(name) {
        var nm = typeof name === 'string' ? name : (name.displayName || name.name || '');
        if (nm) ensure(nm);
      });
      groupMatches.forEach(function(m) {
        if (!m.winner || m.isBye || m.isSitOut) return;
        ensure(m.p1); ensure(m.p2);
        var s1 = parseInt(m.scoreP1) || 0;
        var s2 = parseInt(m.scoreP2) || 0;
        smap[m.p1].played++; smap[m.p2].played++;
        smap[m.p1].pointsDiff += (s1 - s2);
        smap[m.p2].pointsDiff += (s2 - s1);
        if (m.draw || m.winner === 'draw') {
          smap[m.p1].draws++; smap[m.p1].points += 1;
          smap[m.p2].draws++; smap[m.p2].points += 1;
        } else {
          var loser = m.winner === m.p1 ? m.p2 : m.p1;
          if (smap[m.winner]) { smap[m.winner].wins++; smap[m.winner].points += 3; }
          if (smap[loser]) smap[loser].losses++;
        }
        // GSM stats (sets/games/tiebreaks)
        if (Array.isArray(m.sets) && m.sets.length > 0) {
          var sw1=0, sw2=0, gw1=0, gw2=0, tb1=0, tb2=0;
          m.sets.forEach(function(s) {
            var g1 = parseInt(s.gamesP1) || 0;
            var g2 = parseInt(s.gamesP2) || 0;
            gw1 += g1; gw2 += g2;
            if (g1 > g2) sw1++; else if (g2 > g1) sw2++;
            if (s.tiebreak) {
              var tp1 = parseInt(s.tiebreak.pointsP1) || 0;
              var tp2 = parseInt(s.tiebreak.pointsP2) || 0;
              if (tp1 > tp2) tb1++; else if (tp2 > tp1) tb2++;
            }
          });
          smap[m.p1].setsWon += sw1; smap[m.p1].setsLost += sw2;
          smap[m.p1].gamesWon += gw1; smap[m.p1].gamesLost += gw2;
          smap[m.p1].tiebreaksWon += tb1;
          smap[m.p2].setsWon += sw2; smap[m.p2].setsLost += sw1;
          smap[m.p2].gamesWon += gw2; smap[m.p2].gamesLost += gw1;
          smap[m.p2].tiebreaksWon += tb2;
        }
      });
      // Buchholz: sum of opponents' points
      Object.keys(smap).forEach(function(nm) {
        var s = smap[nm];
        groupMatches.forEach(function(m) {
          if (!m.winner || m.isBye || m.isSitOut) return;
          if (m.p1 === s.name && smap[m.p2]) s.buchholz += smap[m.p2].points;
          if (m.p2 === s.name && smap[m.p1]) s.buchholz += smap[m.p1].points;
        });
      });
      // Sonneborn-Berger: opponents.points × (won=1, draw=0.5, loss=0)
      Object.keys(smap).forEach(function(nm) {
        var s = smap[nm];
        groupMatches.forEach(function(m) {
          if (!m.winner || m.isBye || m.isSitOut) return;
          var isDraw = m.draw || m.winner === 'draw';
          var opp = m.p1 === s.name ? m.p2 : (m.p2 === s.name ? m.p1 : null);
          if (!opp || !smap[opp]) return;
          if (isDraw) s.sonnebornBerger += smap[opp].points * 0.5;
          else if (m.winner === s.name) s.sonnebornBerger += smap[opp].points;
        });
      });
      return smap;
    };

    // ─── Build h2h map from ALL group matches (cross-group h2h) ───
    var _h2hAllGroups = {};
    t.groups.forEach(function(g) {
      var allM = (g.matches || []).slice();
      (g.rounds || []).forEach(function(r) {
        if (Array.isArray(r.matches)) allM = allM.concat(r.matches);
      });
      allM.forEach(function(m) {
        if (!m.winner || m.isBye || m.isSitOut) return;
        var isDraw = m.draw || m.winner === 'draw';
        if (isDraw) {
          _h2hAllGroups[m.p1 + '|||' + m.p2 + '|||d'] = (_h2hAllGroups[m.p1 + '|||' + m.p2 + '|||d'] || 0) + 1;
          _h2hAllGroups[m.p2 + '|||' + m.p1 + '|||d'] = (_h2hAllGroups[m.p2 + '|||' + m.p1 + '|||d'] || 0) + 1;
        } else {
          var loser = m.winner === m.p1 ? m.p2 : m.p1;
          _h2hAllGroups[m.winner + '|||' + loser] = (_h2hAllGroups[m.winner + '|||' + loser] || 0) + 1;
        }
      });
    });

    // ─── User's configured tiebreakers (or default) ───
    // Mesma ordem default que _computeStandings (line 420): alinhada com a
    // UI em create-tournament.js.
    var _defaultTb = ['confronto_direto', 'saldo_pontos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'];
    if (t.scoring && t.scoring.type === 'sets') {
      _defaultTb = ['confronto_direto', 'saldo_sets', 'saldo_games', 'sets_vencidos', 'games_vencidos', 'tiebreaks_vencidos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'];
    }
    if (t.advancedScoring && t.advancedScoring.enabled) {
      _defaultTb = ['pontos_avancados'].concat(_defaultTb);
    }
    var _userTb = (Array.isArray(t.tiebreakers) && t.tiebreakers.length > 0) ? t.tiebreakers : _defaultTb;
    var _birthByName = (typeof window._tbBirthByName === 'function') ? window._tbBirthByName(t) : {};

    // ─── Sort comparator: same logic as _computeStandings sort ───
    var _applyTb = function(a, b) {
      if (b.points !== a.points) return b.points - a.points;
      for (var i = 0; i < _userTb.length; i++) {
        var tb = _userTb[i];
        var diff = 0;
        switch (tb) {
          case 'confronto_direto':
            var aBeatsB = _h2hAllGroups[a.name + '|||' + b.name] || 0;
            var bBeatsA = _h2hAllGroups[b.name + '|||' + a.name] || 0;
            diff = bBeatsA - aBeatsB;
            if (diff !== 0) return diff < 0 ? -1 : 1;
            break;
          case 'saldo_pontos':
            diff = b.pointsDiff - a.pointsDiff;
            if (diff !== 0) return diff;
            break;
          case 'vitorias':
            diff = b.wins - a.wins;
            if (diff !== 0) return diff;
            break;
          case 'buchholz':
            diff = (b.buchholz || 0) - (a.buchholz || 0);
            if (diff !== 0) return diff;
            break;
          case 'sonneborn_berger':
            diff = (b.sonnebornBerger || 0) - (a.sonnebornBerger || 0);
            if (diff !== 0) return diff;
            break;
          case 'saldo_sets':
            diff = ((b.setsWon || 0) - (b.setsLost || 0)) - ((a.setsWon || 0) - (a.setsLost || 0));
            if (diff !== 0) return diff;
            break;
          case 'saldo_games':
            diff = ((b.gamesWon || 0) - (b.gamesLost || 0)) - ((a.gamesWon || 0) - (a.gamesLost || 0));
            if (diff !== 0) return diff;
            break;
          case 'sets_vencidos':
            diff = (b.setsWon || 0) - (a.setsWon || 0);
            if (diff !== 0) return diff;
            break;
          case 'games_vencidos':
            diff = (b.gamesWon || 0) - (a.gamesWon || 0);
            if (diff !== 0) return diff;
            break;
          case 'tiebreaks_vencidos':
            diff = (b.tiebreaksWon || 0) - (a.tiebreaksWon || 0);
            if (diff !== 0) return diff;
            break;
          case 'pontos_avancados':
            diff = (b.advancedPoints || 0) - (a.advancedPoints || 0);
            if (diff !== 0) return diff;
            break;
          case 'antiguidade': {
            var _aoB = _birthByName[a.name], _boB = _birthByName[b.name];
            if (_aoB != null && _boB != null && _aoB !== _boB) return _aoB - _boB;
            break;
          }
          case 'juventude': {
            var _ayB = _birthByName[a.name], _byB = _birthByName[b.name];
            if (_ayB != null && _byB != null && _ayB !== _byB) return _byB - _ayB;
            break;
          }
          case 'sorteio':
            return Math.random() - 0.5;
        }
      }
      return 0;
    };

    // ─── Identify non-classified pool ───
    var _classifiedPerGroup = parseInt(t.gruposClassified) || 2;
    var _nonClassifiedPool = [];
    t.groups.forEach(function(g) {
      var smap = _computeGroupStandings(g);
      var sorted = Object.values(smap).sort(_applyTb);
      // Skip top N (classificados — já têm posição da elim)
      sorted.slice(_classifiedPerGroup).forEach(function(s) {
        if (!s || !s.name) return;
        if (t.classification[s.name] !== undefined) return; // já placed
        _nonClassifiedPool.push(s);
      });
    });

    if (_nonClassifiedPool.length > 0) {
      // Sort cross-group com tiebreakers do organizador
      _nonClassifiedPool.sort(_applyTb);
      var _maxPosG = 0;
      Object.keys(t.classification).forEach(function(name) {
        if (t.classification[name] > _maxPosG) _maxPosG = t.classification[name];
      });
      _nonClassifiedPool.forEach(function(s, idx) {
        if (t.classification[s.name] === undefined) {
          t.classification[s.name] = _maxPosG + 1 + idx;
        }
      });
    }
  }
}

// ─── Auto-finish elimination tournament ──────────────────────────────────────
// v2.6.97 — encerramento do CONSTRUTOR DE FASES. O torneio multi-fase encerra
// quando a ÚLTIMA fase termina (todas as partidas dela decididas, incluindo a
// grande final). Em fases anteriores NÃO encerra — o avanço é manual (botão).
// Campeão = vencedor da grande final da última fase; em chave única, o vencedor
// da final; em linhas independentes (sem grande final), fica sem nome único.
function _maybeFinishMultiPhase(t) {
  if (!t || t.status === 'finished') return false;
  if (!(window._isMultiPhase && window._isMultiPhase(t))) return false;
  var cur = t.currentPhaseIndex || 0;
  var last = t.phases.length - 1;
  if (cur < 1 || cur < last) return false; // ainda em fase classificatória ou há fases por vir
  var pm = (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === cur; });
  if (!pm.length) return false;
  var pending = pm.filter(function (m) { return !m.isBye && m.p1 && m.p1 !== 'TBD' && m.p2 && m.p2 !== 'TBD' && !m.winner; });
  if (pending.length) return false;
  var tbd = pm.filter(function (m) { return !m.isBye && (!m.p1 || m.p1 === 'TBD' || !m.p2 || m.p2 === 'TBD'); });
  if (tbd.length) return false;

  // Campeão: grande final > final de chave única > (linhas independentes: sem nome).
  var champion = null;
  var gf = pm.filter(function (m) { return m.bracket === 'grandfinal'; })[0];
  if (gf && gf.winner) champion = gf.winner;
  if (!champion) {
    var tierMs = pm.filter(function (m) { return (m.round || 1) < 99 && !m.isBye; });
    var brackets = {};
    tierMs.forEach(function (m) { (brackets[m.bracket] = brackets[m.bracket] || []).push(m); });
    var bk = Object.keys(brackets);
    if (bk.length === 1) {
      var ms = brackets[bk[0]];
      var lr = Math.max.apply(null, ms.map(function (m) { return m.round || 1; }));
      var fin = ms.filter(function (m) { return (m.round || 1) === lr; });
      if (fin.length === 1 && fin[0].winner) champion = fin[0].winner;
    }
  }

  t.status = 'finished';
  if (!t.finishedAt) t.finishedAt = new Date().toISOString();
  var _startMs = (typeof t.tournamentStarted === 'number' && t.tournamentStarted > 0) ? t.tournamentStarted : null;
  if (_startMs && (t.durationMs == null)) t.durationMs = Math.max(0, Date.now() - _startMs);
  if (typeof showNotification === 'function') {
    showNotification(_t('bui.tournamentFinished'), champion ? _t('bui.tournamentFinishedChamp', { name: champion }) : _t('bui.tournamentFinishedMsg'), 'success');
  }
  if (!t.finishNotifiedAt && typeof window._notifyTournamentParticipants === 'function') {
    t.finishNotifiedAt = new Date().toISOString();
    var _finMsg = _t('notif.tournamentFinished').replace('{name}', t.name || 'Torneio');
    if (champion) _finMsg += ' ' + champion + ' ' + _t('notif.isChampion');
    window._notifyTournamentParticipants(t, { type: 'tournament_finished', message: _finMsg, level: 'important' });
  }
  setTimeout(function () {
    try { if (typeof window._trophyOnTournamentFinished === 'function') window._trophyOnTournamentFinished(t, champion); } catch (_te) {}
  }, 500);
  return true;
}
window._maybeFinishMultiPhase = _maybeFinishMultiPhase;

function _maybeFinishElimination(t) {
  if (t.status === 'finished') return;
  // v2.6.97: construtor de fases tem encerramento próprio (última fase concluída).
  if (window._isMultiPhase && window._isMultiPhase(t)) { _maybeFinishMultiPhase(t); return; }
  // v2.4.20: inscrição TARDIA ('standby'/'expand') mantém a Eliminatória ABERTA —
  // completar os jogos atuais NÃO encerra o torneio. Novos confrontos da lista de
  // espera (a cada 4), repescagem e a próxima rodada ainda podem entrar. Só encerra
  // quando o organizador fecha as inscrições ("Encerrar Inscrições" → status='closed',
  // ver toggleRegistrationStatus). Bug Vivi Hirata (Eliminatórias Simples + inscrição
  // aberta): completar o 1º confronto marcava 'finished' e travava a inscrição em
  // TODOS os caminhos, apesar de cards/config mostrarem aberto.
  if ((t.lateEnrollment === 'standby' || t.lateEnrollment === 'expand') && t.status !== 'closed') return;
  if (t.currentStage === 'groups') return;
  // v2.0.4: BUG — o formato salvo é 'Eliminatórias Simples' (plural), mas aqui
  // checava 'Eliminatória Simples' (singular) → a função saía cedo e o torneio
  // NUNCA auto-encerrava (ficava "em andamento" mesmo com campeão definido).
  // Agora aceita ambos (plural atual + singular legado).
  var _emFmt = t.format || '';
  if (_emFmt !== 'Eliminatórias Simples' && _emFmt !== 'Eliminatória Simples' &&
      _emFmt !== 'Dupla Eliminatória' && _emFmt !== 'Fase de Grupos') return;

  const allMatches = t.matches || [];
  if (allMatches.length === 0) return;

  // Check if all non-BYE matches have a winner
  const pendingMatches = allMatches.filter(function(m) {
    return !m.isBye && m.p1 && m.p1 !== 'TBD' && m.p2 && m.p2 !== 'TBD' && !m.winner;
  });
  if (pendingMatches.length > 0) return;

  // Check if there are still TBD matches (bracket not fully populated)
  const tbdMatches = allMatches.filter(function(m) {
    return !m.isBye && (!m.p1 || m.p1 === 'TBD' || !m.p2 || m.p2 === 'TBD');
  });
  if (tbdMatches.length > 0) return;

  // v2.1.6: A FINAL encerra o evento. A disputa de 3º lugar NÃO trava mais o
  // encerramento — quando todas as partidas da chave principal (incluindo a
  // final) têm vencedor, o torneio é declarado encerrado (campeão + vice). A
  // partida de 3º lugar continua podendo ser lançada depois: o resultado dela
  // atualiza a classificação (3º/4º) via _updateProgressiveClassification, e
  // _maybeFinishElimination sai cedo (status já 'finished') sem reabrir nada.
  // Antes (≤v2.1.5) o check `t.thirdPlaceMatch && !winner → return` impedia o
  // torneio de encerrar pela final — e, com inscrição tardia ligada, as
  // inscrições ficavam abertas indefinidamente após a final.

  // Check group stage completion (Fase de Grupos)
  if (Array.isArray(t.groups) && t.groups.length > 0) {
    var groupsPending = t.groups.some(function(g) {
      return (g.rounds || []).some(function(r) {
        return (r.matches || []).some(function(m) {
          return !m.winner && !m.isBye;
        });
      });
    });
    if (groupsPending) return;
  }

  // All matches done — mark as finished
  t.status = 'finished';
  // v2.0.4: o "relógio para" no campeão — registra fim + duração do torneio.
  if (!t.finishedAt) t.finishedAt = new Date().toISOString();
  var _startMs = (typeof t.tournamentStarted === 'number' && t.tournamentStarted > 0) ? t.tournamentStarted : null;
  if (_startMs && (t.durationMs == null)) t.durationMs = Math.max(0, Date.now() - _startMs);
  var _finChampion = null;
  if (typeof showNotification === 'function') {
    var roundNums = allMatches.map(function(m) { return m.round || 0; });
    var lastRound = Math.max.apply(null, roundNums);
    var finalMatches = allMatches.filter(function(m) { return m.round === lastRound && !m.isBye; });
    if (finalMatches.length > 0 && finalMatches[0].winner) {
      _finChampion = finalMatches[0].winner;
    }
    showNotification(_t('bui.tournamentFinished'), _finChampion ? _t('bui.tournamentFinishedChamp', { name: _finChampion }) : _t('bui.tournamentFinishedMsg'), 'success');
  }
  // Notify all participants about tournament finish (idempotent guard)
  // v1.8.45-beta: flag persiste no Firestore (finishNotifiedAt) para sobreviver
  // a page reloads e snapshots que sobrescrevem o objeto em memória.
  if (!t.finishNotifiedAt && typeof window._notifyTournamentParticipants === 'function') {
    t.finishNotifiedAt = new Date().toISOString();
    var _finMsg = _t('notif.tournamentFinished').replace('{name}', t.name || 'Torneio');
    if (_finChampion) _finMsg += ' ' + _finChampion + ' ' + _t('notif.isChampion');
    window._notifyTournamentParticipants(t, {
      type: 'tournament_finished',
      message: _finMsg,
      level: 'important'
    });
  }
  // Trophy hook — tournament finished (checks win/podium for current user)
  setTimeout(function() {
    try {
      if (typeof window._trophyOnTournamentFinished === 'function') {
        window._trophyOnTournamentFinished(t, _finChampion);
      }
    } catch(_te) {}
  }, 500);
}

// ─── 3rd place ────────────────────────────────────────────────────────────────
// Garante que o thirdPlaceMatch existe com TBD e preenche progressivamente
// com os perdedores das semifinais conforme os resultados são lançados
function _maybeGenerate3rdPlace(t) {
  // 3rd place match is always generated for elimination formats — EXCEPT
  // Dupla Eliminatória.
  // v1.0.92-beta: DE não tem match dedicado de 3º lugar — 3º vem do Lower
  // Final loser. Antes este função criava t.thirdPlaceMatch{TBD,TBD} pra DE,
  // causando 2 bugs: (1) total reportado virava 15 em vez de 14 pq ele era
  // contado em _collectAllMatches, (2) _maybeFinishElimination travava em
  // 'if (t.thirdPlaceMatch && !t.thirdPlaceMatch.winner) return' — torneio
  // nunca finalizava. User: 'de novo diz que são 15 partidas mas só
  // renderiza 14 delas. tudo preenchido e não termina'.
  if (t && t.format === 'Dupla Eliminatória') {
    // Cleanup: deleta thirdPlaceMatch fantasma criado por bug anterior em
    // torneios velhos. Senão t.thirdPlaceMatch ainda aparece em
    // _collectAllMatches inflando o total.
    if (t.thirdPlaceMatch) delete t.thirdPlaceMatch;
    return;
  }

  const allMatches = t.matches || [];

  // Identificar a rodada da semifinal (penúltima rodada do bracket)
  const allRounds = {};
  allMatches.filter(m => m.bracket !== 'lower' && m.bracket !== 'grand').forEach(m => {
    if (!allRounds[m.round]) allRounds[m.round] = [];
    allRounds[m.round].push(m);
  });
  const roundNums = Object.keys(allRounds).map(Number).sort((a, b) => a - b);
  if (roundNums.length < 2) return;

  const finalRoundNum = roundNums[roundNums.length - 1];
  const semiRoundNum = roundNums[roundNums.length - 2];
  const semis = allRounds[semiRoundNum] || [];

  // Inicializar thirdPlaceMatch se não existir
  if (!t.thirdPlaceMatch) {
    window._appendCanonicalColumn(t, {
      phase: 'thirdplace',
      matches: [{
        id: `match-3rd-${Date.now()}`,
        round: finalRoundNum,
        label: _t('bui.thirdPlaceMatch'),
        p1: 'TBD', p2: 'TBD', winner: null
      }]
    });
  }

  // Se já tem resultado confirmado no 3º lugar, não mexer
  if (t.thirdPlaceMatch.winner) return;

  // Sempre recalcular os participantes baseado no estado atual das semifinais
  // (corrige dados legados e acompanha edições de resultado)
  const losers = semis
    .filter(m => m.winner && m.winner !== 'draw' && !m.isBye)
    .map(m => m.winner === m.p1 ? m.p2 : m.p1)
    .filter(name => name && name !== 'TBD' && name !== 'BYE');

  t.thirdPlaceMatch.p1 = losers.length >= 1 ? losers[0] : 'TBD';
  t.thirdPlaceMatch.p2 = losers.length >= 2 ? losers[1] : 'TBD';
}

// ─── Close round + generate next ─────────────────────────────────────────────
// v0.17.27: auto-approve pending results scattered no bracket. Pedido do
// usuário: "quando temos resultados pendentes de aprovação e um novo
// sorteio está para acontecer, vamos fazer o sistema automaticamente
// aprovar o resultado." Aplica m.pendingResult → m.winner/scores em todos
// os matches que tem proposta mas ninguém aprovou. Chamado:
//   - No início de _closeRound (antes do unfinished check)
//   - No _fireLigaAutoDraw (antes de _generateNextRound subsequente)
// Retorna número de matches auto-aprovados (>0 = registra em t.history).
window._autoApprovePendingResults = function(t) {
  if (!t) return 0;
  var allMatches = [];
  if (Array.isArray(t.matches)) allMatches = allMatches.concat(t.matches);
  if (Array.isArray(t.rounds)) {
    t.rounds.forEach(function(r) {
      if (!r) return;
      if (Array.isArray(r.matches)) allMatches = allMatches.concat(r.matches);
      if (Array.isArray(r.monarchGroups)) {
        r.monarchGroups.forEach(function(g) {
          if (g && Array.isArray(g.matches)) allMatches = allMatches.concat(g.matches);
        });
      }
    });
  }
  if (Array.isArray(t.groups)) {
    t.groups.forEach(function(g) {
      if (g && Array.isArray(g.matches)) allMatches = allMatches.concat(g.matches);
    });
  }
  if (t.thirdPlaceMatch) allMatches.push(t.thirdPlaceMatch);

  var count = 0;
  // Dedup by id pra não aplicar 2x quando o mesmo match aparece em refs múltiplas
  var seenIds = {};
  allMatches.forEach(function(m) {
    if (!m || m.winner || !m.pendingResult) return;
    if (m.id && seenIds[m.id]) return;
    if (m.id) seenIds[m.id] = true;
    var pr = m.pendingResult;
    var s1 = pr.scoreP1, s2 = pr.scoreP2;
    if (pr.useSets && Array.isArray(pr.sets)) {
      m.sets = pr.sets.slice();
      m.setsWonP1 = pr.setsWonP1 || 0;
      m.setsWonP2 = pr.setsWonP2 || 0;
      if (pr.isFixedSet) m.fixedSet = true;
    }
    m.scoreP1 = s1;
    m.scoreP2 = s2;
    m.totalGamesP1 = pr.totalGamesP1 != null ? pr.totalGamesP1 : s1;
    m.totalGamesP2 = pr.totalGamesP2 != null ? pr.totalGamesP2 : s2;
    m.winner = pr.winner;
    m.draw = !!pr.draw;
    delete m.pendingResult;
    if (typeof window._propagateMatchUpdate === 'function') {
      window._propagateMatchUpdate(t, m);
    }
    count++;
  });

  if (count > 0 && window.AppStore && typeof window.AppStore.logAction === 'function') {
    window.AppStore.logAction(t.id, count + ' resultado(s) pendente(s) auto-aprovado(s) (sem aprovação manual antes do encerramento da rodada)');
  }
  return count;
};

// v0.17.27: anchorMatchId permite que o re-render preserve scroll ancorando
// no match que disparou o close (auto-close após save/approve). Sem ele,
// _rerenderBracket fazia fallback pra "primeiro card visível" → scroll
// jumpava após aprovações.
window._closeRound = function (tId, roundIdx, anchorMatchId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  const round = (t.rounds || [])[roundIdx];
  if (!round) return;

  // v0.17.27: auto-aprova resultados pendentes ANTES de checar unfinished —
  // se ninguém aprovou/contestou um placar proposto, considera aprovado
  // implicitamente quando a rodada vai fechar.
  if (typeof window._autoApprovePendingResults === 'function') {
    window._autoApprovePendingResults(t);
  }

  const unfinished = (round.matches || []).filter(m => !m.winner && !m.isBye && !m.isSitOut);
  if (unfinished.length > 0) {
    showConfirmDialog(
      _t('bui.incompleteRound'),
      _t('bui.incompleteRoundMsg', {n: unfinished.length}),
      () => _doCloseRound(t, tId, roundIdx, anchorMatchId),
      null,
      { type: 'warning', confirmText: _t('btn.finishAnyway'), cancelText: _t('btn.back') }
    );
    return;
  }
  _doCloseRound(t, tId, roundIdx, anchorMatchId);
};

function _doCloseRound(t, tId, roundIdx, anchorMatchId) {
  // Guard: only close the most recent round. A stale call (from a duplicate
  // auto-close path, e.g. _saveResultInline + render-time safety net both
  // dispatching for the same round) would otherwise advance the next-round
  // generation or even trigger a premature Swiss→elim transition.
  if (roundIdx !== (t.rounds || []).length - 1) return;
  if (t.rounds[roundIdx] && t.rounds[roundIdx].status === 'complete') return;

  t.rounds[roundIdx].status = 'complete';
  // v2.3.17: marca a conclusão da rodada (último ponto/jogo lançado) — usado
  // como "Final real" na barra de progresso da rodada.
  if (!t.rounds[roundIdx].completedAt) t.rounds[roundIdx].completedAt = Date.now();
  t.standings = _computeStandings(t);

  const isSuico = t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss' || t.currentStage === 'swiss';
  const maxRounds = t.swissRounds || 99;
  const isSwissClassification = t.p2Resolution === 'swiss' && t.currentStage === 'swiss';

  if (isSuico && t.rounds.length >= maxRounds) {
    // Swiss-as-classification: transition to elimination phase
    if (isSwissClassification && t.p2TargetCount) {
      var _finalStandings = _computeStandings(t);
      var _targetCount = t.p2TargetCount;
      var _advancedNames = _finalStandings.slice(0, _targetCount).map(function(s) { return s.name; });

      // Store Swiss results for reference
      t.swissStandings = _finalStandings;
      t.swissRoundsData = t.rounds.slice();

      // Clear Swiss state, transition to elimination
      t.currentStage = 'elimination';
      delete t.classifyFormat;
      t.rounds = [];

      // Update participants to only include advanced players (preserve objects)
      var _allParts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
      var _advancedParts = [];
      _advancedNames.forEach(function(name) {
        var found = _allParts.find(function(p) {
          var pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
          return pName === name;
        });
        if (found) _advancedParts.push(found);
      });
      // Save eliminated players for reference
      t.swissEliminated = _allParts.filter(function(p) {
        var pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
        return _advancedNames.indexOf(pName) === -1;
      });
      t.participants = _advancedParts;

      // Generate elimination bracket with the advanced players
      if (typeof window.generateDrawFunction === 'function') {
        // Temporarily disable p2Resolution to avoid re-entering Swiss
        var _savedP2 = t.p2Resolution;
        t.p2Resolution = 'bye'; // now power-of-2 is guaranteed
        window.AppStore.syncImmediate(tId).then(function() {
          window.generateDrawFunction(tId);
        });
      }

      showNotification(_t('bui.swissFinished'), _t('bui.swissFinishedMsg', { n: _targetCount, format: t.format || 'Eliminatórias' }), 'success');
      if (typeof window._notifyTournamentParticipants === 'function') {
        window._notifyTournamentParticipants(t, {
          type: 'swiss_to_elimination',
          message: _t('bui.swissFinishedNotif', {n: _targetCount, format: t.format || 'Eliminatórias'}),
          level: 'important'
        });
      }
      return;
    }

    // Pure Swiss: just finish
    t.status = 'finished';
    showNotification(_t('bui.swissFinishedRounds'), _t('bui.swissFinishedRoundsMsg', { n: maxRounds }), 'success');
    // Notify all participants about Swiss tournament finish
    if (!t.finishNotifiedAt && typeof window._notifyTournamentParticipants === 'function') {
      t.finishNotifiedAt = new Date().toISOString();
      window._notifyTournamentParticipants(t, {
        type: 'tournament_finished',
        message: _t('notif.tournamentFinished').replace('{name}', t.name || 'Torneio'),
        level: 'important'
      });
    }
  } else {
    // v2.3.7 FIX (bug reportado): Liga com sorteio AGENDADO NÃO gera a próxima
    // rodada ao COMPLETAR a atual. A próxima é gerada pelo poller agendado
    // (_checkLigaAutoDraws → _fireLigaAutoDraw) no horário certo
    // (drawFirstDate + N×intervalo). Antes, lançar o último placar da rodada
    // disparava _generateNextRound imediatamente, criando a rodada seguinte
    // ANTES da hora — e inflando o "X/Y partidas" (o progresso soma TODAS as
    // rodadas existentes). Liga manual e Suíço seguem gerando na conclusão,
    // pois têm gatilho próprio (botão / fluxo contínuo do Suíço).
    var _ligaScheduled = window._isLigaAutoDraw(t); // v2.7.6: canônico
    if (_ligaScheduled) {
      showNotification(
        _t('bui.roundClosedTitle') || 'Rodada encerrada',
        _t('bui.roundClosedScheduledMsg') || 'A próxima rodada será sorteada automaticamente no horário agendado.',
        'success'
      );
    } else {
      _generateNextRound(t);
      var _newRound = t.rounds[t.rounds.length - 1];
      var _newMatchCount = (_newRound && _newRound.matches || []).filter(function(m) { return !m.isSitOut; }).length;
      showNotification(_t('bui.newRound'), _t('bui.newRoundMsg', { n: t.rounds.length, count: _newMatchCount }), 'success');

      // Notify all participants — personalized per recipient (shows their match)
      if (typeof window._notifyDrawPersonalized === 'function') {
        window._notifyDrawPersonalized(t, tId, { type: 'new_round', roundIndex: t.rounds.length - 1 });
      }
    }
  }

  window.AppStore.logAction(tId, `Rodada ${roundIdx + 1} encerrada`);
  window.AppStore.syncImmediate(tId);
  // Notify Liga round via WhatsApp (fire-and-forget, only for Liga/Suíço formats)
  _notifyLigaRoundWhatsApp(t, t.rounds ? t.rounds.length - 1 : 0);
  if (typeof window._rerenderBracket === 'function') {
    // v0.17.27: passa anchorMatchId quando vem de auto-close (após approve/save)
    // pra preservar scroll. Quando vem do botão "Encerrar Rodada" manual,
    // anchorMatchId é undefined → _rerenderBracket faz fallback pra primeiro
    // visível (comportamento anterior).
    window._rerenderBracket(tId, anchorMatchId);
  } else {
    renderBracket(document.getElementById('view-container'), tId);
  }
}

// ─── Round-robin ("Todos contra todos") schedule ─────────────────────────────

// Build one turno: enough rounds so every pair of players has been in the same
// group of 4 at least once. Uses greedy Monte Carlo (try 200 shuffles per round,
// pick the one that maximises newly-covered pairs).
function _buildOneTurno(players) {
  var n = players.length;
  if (n < 4) return [];

  // Canonicalise pair key (always smaller string first)
  function pairKey(a, b) { return a < b ? a + '|||' + b : b + '|||' + a; }

  // All pairs that must be covered within this turno
  var covered = {};
  var totalPairs = 0;
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      covered[pairKey(players[i], players[j])] = false;
      totalPairs++;
    }
  }

  var numPlaying = n - (n % 4); // must be multiple of 4
  var rounds = [];
  var maxRounds = Math.ceil((n - 1) / 3) + n; // generous safety cap

  for (var r = 0; r < maxRounds; r++) {
    // Count uncovered pairs
    var uncovered = 0;
    for (var k in covered) { if (!covered[k]) uncovered++; }
    if (uncovered === 0) break;

    // Try 200 shuffles, pick the one covering most uncovered pairs
    var best = null;
    var bestNew = -1;
    for (var a = 0; a < 200; a++) {
      var shuffled = players.slice();
      for (var si = shuffled.length - 1; si > 0; si--) {
        var sj = Math.floor(Math.random() * (si + 1));
        var stmp = shuffled[si]; shuffled[si] = shuffled[sj]; shuffled[sj] = stmp;
      }
      var playing = shuffled.slice(0, numPlaying);
      var newCount = 0;
      for (var gi = 0; gi < playing.length; gi += 4) {
        var grp = playing.slice(gi, gi + 4);
        for (var gii = 0; gii < grp.length; gii++) {
          for (var gjj = gii + 1; gjj < grp.length; gjj++) {
            var pk = pairKey(grp[gii], grp[gjj]);
            if (!covered[pk]) newCount++;
          }
        }
      }
      if (newCount > bestNew) { bestNew = newCount; best = playing; }
    }

    if (!best || bestNew === 0) break; // can't improve further

    // Form groups of 4 and mark pairs covered
    var roundGroups = [];
    for (var gi2 = 0; gi2 < best.length; gi2 += 4) {
      var grp2 = best.slice(gi2, gi2 + 4);
      roundGroups.push(grp2);
      for (var gii2 = 0; gii2 < grp2.length; gii2++) {
        for (var gjj2 = gii2 + 1; gjj2 < grp2.length; gjj2++) {
          covered[pairKey(grp2[gii2], grp2[gjj2])] = true;
        }
      }
    }
    rounds.push(roundGroups);
  }

  return rounds;
}

// Pre-generate schedule for all turnos: array of {turno, groups[]}
function _buildRoundRobinSchedule(players, numTurnos) {
  var schedule = [];
  for (var turno = 1; turno <= numTurnos; turno++) {
    // Shuffle player order between turnos for variety
    var tp = players.slice();
    for (var i = tp.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = tp[i]; tp[i] = tp[j]; tp[j] = tmp;
    }
    var turnoRounds = _buildOneTurno(tp);
    turnoRounds.forEach(function(groups) {
      schedule.push({ turno: turno, groups: groups });
    });
  }
  return schedule;
}

// Pop next round from pre-generated schedule and append to tournament
window._drawFromRoundRobinSchedule = function(t, category, _rn) {
  if (!t.ligaRRSchedule) t.ligaRRSchedule = {};
  var catKey = (category || '_default_').replace(/\s+/g, '_');

  // (Re-)generate schedule when empty
  if (!t.ligaRRSchedule[catKey] || t.ligaRRSchedule[catKey].length === 0) {
    var standings = _computeStandings(t, category);
    var activeNames = _getActiveLigaPlayers(t);
    var players = standings.map(function(s) { return s.name; }).filter(function(n) { return activeNames[n]; });
    if (players.length < 4) return false;
    var numTurnos = t.ligaTurnos || 1;
    t.ligaRRSchedule[catKey] = _buildRoundRobinSchedule(players, numTurnos);
  }

  if (!t.ligaRRSchedule[catKey] || t.ligaRRSchedule[catKey].length === 0) return false;

  var nextRound = t.ligaRRSchedule[catKey].shift(); // consume next entry
  // v2.5.1: o nº da rodada deriva do MAIOR `round` já existente +1, não da
  // contagem de colunas. Multi-categoria gera 1 coluna por categoria no MESMO
  // sorteio — todas têm que ficar na MESMA rodada (C e D ambas Rodada 1), senão
  // a 2ª categoria virava "Rodada 2". roundIndex (índice físico da coluna)
  // continua = length.
  var roundNum = (typeof _rn === 'number') ? _rn : (((t.rounds || []).reduce(function (mx, c) { return Math.max(mx, (c && c.round) || 0); }, 0)) + 1);
  var ts = Date.now();
  var catSuffix = category ? '-' + category.replace(/\s+/g, '_') : '';
  var catLabel = category && window._displayCategoryName
    ? ' (' + window._displayCategoryName(category) + ')' : (category ? ' (' + category + ')' : '');
  var turnoLabel = nextRound.turno ? ' [T' + nextRound.turno + ']' : '';

  var allMatches = [];
  var monarchGroups = [];

  nextRound.groups.forEach(function(grp, gi) {
    var g = _buildMonarchGroup({ roundNum: roundNum, roundIndex: (t.rounds || []).length, gi: gi, players: grp, category: category, ts: ts, nameSuffix: turnoLabel });
    allMatches = allMatches.concat(g.matches);
    monarchGroups.push(g);
  });

  // Sit-outs for players not in any group this round
  var allPlaying = [];
  nextRound.groups.forEach(function(g) { allPlaying = allPlaying.concat(g); });
  var allActive = Object.keys(_getActiveLigaPlayers(t));
  allActive.forEach(function(name, si) {
    if (allPlaying.indexOf(name) === -1) {
      var avgPts = _sitOutComp(t, name, category); // PA quando o torneio usa Pontos Avançados; senão pontos simples
      var soObj = _buildSitOut({ player: name, roundNum: roundNum, roundIndex: (t.rounds || []).length, category: category, ts: ts, idPrefix: 'sitout-rr-r', idIndex: si, reason: 'remainder', points: avgPts });
      allMatches.push(soObj);
      _recordSitOut(t, [name], category);
    }
  });

  _recordOpponentHistory(t, monarchGroups, category);

  window._appendCanonicalColumn(t, {
    phase: 'monarch', round: roundNum, status: 'active',
    format: 'rei_rainha', matches: allMatches, monarchGroups: monarchGroups,
    turno: nextRound.turno
  });

  return true;
};

// ─── Swiss pairing ────────────────────────────────────────────────────────────
function _generateNextRound(t) {
  // v2.4.28: ANTES de filtrar por categoria, encaixa quem está sem categoria
  // VÁLIDA na mais fraca elegível — senão _computeStandings(t, cat) joga esses
  // inscritos pra fora de TODA rodada e eles ficam de fora do sorteio (desastre
  // Confra 11/jun). Roda igual no cliente e no Cloud Function autoDraw (vendor).
  if (typeof window._assignUncategorizedToWeakest === 'function') {
    try { window._assignUncategorizedToWeakest(t); }
    catch (_e) { if (window._warn) window._warn('[draw] weakest-assign falhou', _e); }
  }

  // v2.7.5: Pontos Corridos com sorteio AUTOMÁTICO (drawManual !== true) NÃO tem
  // passo "Iniciar Torneio" — SORTEAR É INICIAR. Marcado AQUI no gerador (roda no
  // cliente, no poller _fireLigaAutoDraw, no "Realizar Sorteio" e na Cloud Function
  // autoDraw via vendor — 100% sozinho, sem depender de ninguém abrir nada). Manual
  // (drawManual===true) mantém o passo explícito (rede de segurança do banner).
  if (t.drawManual !== true && !t.tournamentStarted) t.tournamentStarted = Date.now();

  var isLiga = window._isLigaFormat && window._isLigaFormat(t);

  // v2.5.1: nº da rodada deste sorteio calculado UMA vez, ANTES do loop de
  // categorias = (maior round já existente) + 1. Passado pra cada gerador pra
  // que TODAS as categorias do mesmo sorteio fiquem na MESMA rodada (C e D ambas
  // Rodada 1). Sem isso, a 1ª categoria adicionava round=1 e a 2ª via max=1 e
  // virava round=2.
  var _batchRound = ((t.rounds || []).reduce(function (mx, c) { return Math.max(mx, (c && c.round) || 0); }, 0)) + 1;

  // "Todos contra todos" mode: pop next round from pre-generated schedule
  if (isLiga && t.ligaDrawMode === 'round_robin') {
    var cats = (typeof window._sortCategoriesBySkillOrder === 'function')
      ? window._sortCategoriesBySkillOrder(t.combinedCategories || [], t.skillCategories)
      : (t.combinedCategories || []);
    if (cats.length === 0) {
      window._drawFromRoundRobinSchedule(t, null, _batchRound);
    } else {
      cats.forEach(function(cat) { window._drawFromRoundRobinSchedule(t, cat, _batchRound); });
    }
    return;
  }

  // Standard Liga or Rei/Rainha
  var useReiRainha = t.ligaRoundFormat === 'rei_rainha';
  var genFn = useReiRainha ? _generateReiRainhaRoundForPlayers : _generateNextRoundForPlayers;

  var categories = (typeof window._sortCategoriesBySkillOrder === 'function')
    ? window._sortCategoriesBySkillOrder(t.combinedCategories || [], t.skillCategories)
    : (t.combinedCategories || []);
  if (categories.length === 0) {
    genFn(t, null, _batchRound);
  } else {
    categories.forEach(function(cat) { genFn(t, cat, _batchRound); });
  }
}
// v2.3.91: expostos pra que o Cloud Function autoDraw (functions-autodraw) chame
// o MESMO dispatcher de sorteio do cliente — server-side roda a lógica idêntica
// (Rei/Rainha, duplas, equilíbrio, categorias) em vez do stub 1×1 antigo.
window._generateNextRound = _generateNextRound;

// ─── Rei/Rainha round generation for Liga ────────────────────────────────────

// Helper: get active players for Liga (filters out ligaActive === false)
function _getActiveLigaPlayers(t) {
  var allP = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  // v2.7.38: organizador desligou a auto-desativação → TODOS contam como ativos.
  var _selfDeactOff = (t && t.allowSelfDeactivation === false);
  var activeNames = {};
  allP.forEach(function(p) {
    if (!_selfDeactOff && typeof p === 'object' && p.ligaActive === false) return; // explicitly inactive
    var name = typeof p === 'string' ? p : (p.displayName || p.name || '');
    if (name) activeNames[name] = true;
  });
  return activeNames;
}

// Helper: get inactive players for this round (ligaActive === false)
function _getInactiveLigaPlayers(t) {
  // v2.7.38: auto-desativação desligada → ninguém inativo.
  if (t && t.allowSelfDeactivation === false) return [];
  var allP = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  var names = [];
  allP.forEach(function(p) {
    if (typeof p === 'object' && p.ligaActive === false) {
      var name = p.displayName || p.name || '';
      if (name) names.push(name);
    }
  });
  return names;
}

// Helper: choose which players sit out this round based on fairness (least sit-outs first)
function _chooseSitOutPlayers(t, players, numToSitOut, category) {
  if (numToSitOut <= 0) return { playing: players, sitOut: [] };
  // Build sit-out count per player from history
  var history = t.sitOutHistory || {};
  // v0.16.58: Firestore não aceita field names que começam E terminam com
  // `__` (reserva pra internos como `__name__`). Antes usávamos `__all__`
  // como chave default, o que causava `[invalid-argument]` no save:
  // "Document fields cannot begin and end with '__' (found in field
  // sitOutHistory.__all__)". Trocado pra `_default_` (single underscore,
  // safe). Migração: ligas existentes que já têm `sitOutHistory.__all__`
  // continuam funcionando — `_recordSitOut` cria a nova chave; o histórico
  // antigo só vira "esquecido" mas nada quebra (sit-out é só fairness, não
  // afeta resultado de partida).
  var catKey = category || '_default_';
  var catHistory = history[catKey] || {};
  // Sort players by sit-out count ascending, then by standing position (worse players sit out first)
  var indexed = players.map(function(name, idx) {
    return { name: name, sitOuts: catHistory[name] || 0, rank: idx };
  });
  // Players with fewest sit-outs go first (play); ties broken by rank (worse rank sits out)
  indexed.sort(function(a, b) {
    if (a.sitOuts !== b.sitOuts) return a.sitOuts - b.sitOuts; // fewest sit-outs = should play now
    return b.rank - a.rank; // worse rank = more likely to sit out
  });
  var sitOut = indexed.slice(0, numToSitOut).map(function(x) { return x.name; });
  var playing = players.filter(function(p) { return sitOut.indexOf(p) === -1; });
  return { playing: playing, sitOut: sitOut };
}

// Helper: record sit-out in tournament history
// v2.6.70: `reason` opcional. sitOutHistory é EXCLUSIVAMENTE o contador de fairness
// do sorteio (quem fica de fora POR SORTEIO/remainder). Folgas por INATIVIDADE ('inactive')
// ou W.O. ('wo') NÃO entram nessa contagem — um jogador pode ficar de fora N vezes por
// inatividade sem que isso reduza sua chance de ser sorteado pra folga quando voltar a
// ativo (ele conta como qualquer outro). Regra: antes de alguém ficar de fora 2x POR
// SORTEIO, todos os ativos ficam 1x (round-robin em _chooseSitOutPlayers).
function _recordSitOut(t, sitOutPlayers, category, reason) {
  if (!sitOutPlayers || sitOutPlayers.length === 0) return;
  if (reason === 'inactive' || reason === 'wo') return;
  if (!t.sitOutHistory) t.sitOutHistory = {};
  // v0.16.58: Firestore não aceita field names que começam E terminam com
  // `__` (reserva pra internos como `__name__`). Antes usávamos `__all__`
  // como chave default, o que causava `[invalid-argument]` no save:
  // "Document fields cannot begin and end with '__' (found in field
  // sitOutHistory.__all__)". Trocado pra `_default_` (single underscore,
  // safe). Migração: ligas existentes que já têm `sitOutHistory.__all__`
  // continuam funcionando — `_recordSitOut` cria a nova chave; o histórico
  // antigo só vira "esquecido" mas nada quebra (sit-out é só fairness, não
  // afeta resultado de partida).
  var catKey = category || '_default_';
  if (!t.sitOutHistory[catKey]) t.sitOutHistory[catKey] = {};
  sitOutPlayers.forEach(function(name) {
    t.sitOutHistory[catKey][name] = (t.sitOutHistory[catKey][name] || 0) + 1;
  });
}

// Helper: record which players were grouped together this round (for anti-repeat pairing)
function _recordOpponentHistory(t, groups, category) {
  if (!groups || groups.length === 0) return;
  if (!t.opponentHistory) t.opponentHistory = {};
  var catKey = (category || '_default_').replace(/\s+/g, '_');
  if (!t.opponentHistory[catKey]) t.opponentHistory[catKey] = {};
  var h = t.opponentHistory[catKey];
  groups.forEach(function(grp) {
    var members = Array.isArray(grp) ? grp : (grp.players || []);
    for (var i = 0; i < members.length; i++) {
      for (var j = i + 1; j < members.length; j++) {
        var a = members[i], b = members[j];
        var key = a < b ? a + '|||' + b : b + '|||' + a;
        h[key] = (h[key] || 0) + 1;
      }
    }
  });
}

// Helper: score a player ordering by repeat-opponent count (lower = better)
// groupSize = number of players per group (4 for doubles)
function _scoreShuffle(playerOrder, opponentHistory, groupSize) {
  var score = 0;
  for (var i = 0; i < playerOrder.length; i += groupSize) {
    var grp = playerOrder.slice(i, i + groupSize);
    for (var gi = 0; gi < grp.length; gi++) {
      for (var gj = gi + 1; gj < grp.length; gj++) {
        var a = grp[gi], b = grp[gj];
        var key = a < b ? a + '|||' + b : b + '|||' + a;
        var c = opponentHistory[key] || 0;
        score += c * c; // squared: strongly penalise high-repeat pairs
      }
    }
  }
  return score;
}

// Helper: try N random shuffles and return the one with fewest repeat opponents
function _bestShuffle(players, opponentHistory, groupSize, attempts) {
  attempts = attempts || 150;
  groupSize = groupSize || 4;
  var best = players.slice();
  var bestScore = _scoreShuffle(best, opponentHistory, groupSize);
  for (var a = 0; a < attempts; a++) {
    var candidate = players.slice();
    for (var i = candidate.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = candidate[i]; candidate[i] = candidate[j]; candidate[j] = tmp;
    }
    var s = _scoreShuffle(candidate, opponentHistory, groupSize);
    if (s < bestScore) { bestScore = s; best = candidate; }
  }
  return best;
}

// Embaralho Fisher-Yates simples (cópia). Usado quando os grupos Rei/Rainha são
// formados por SORTEIO (groupsBy='sorteio') — diferente do _bestShuffle, que tenta
// minimizar reencontros e, com histórico vazio, devolveria a ordem inalterada.
function _plainShuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// v2.6.69: Sorteio EQUILIBRADO por clusters (Pontos Corridos "Sorteio equilibrado").
// Particiona os jogadores em buckets de ~clusterSize por nível (ordem de ranking via
// rankIndex), e roda o anti-repeat (_bestShuffle) DENTRO de cada bucket — então os
// jogos só acontecem entre jogadores de nível próximo ("16 melhores entre si, os 16
// seguintes entre si…"), preservando a diversidade de parceiros/adversários intra-cluster.
// Sem cluster válido (config ausente, ou cluster ≥ total), cai no _bestShuffle global
// — comportamento legado intocado. clusterSize é arredondado pra baixo a múltiplo de
// groupSize pra que as fronteiras de cluster batam com as fronteiras de grupo.
function _clusteredBestShuffle(players, opponentHistory, groupSize, clusterSize, attempts, rankIndex) {
  groupSize = groupSize || 4;
  var n = players.length;
  var eff = Math.floor((parseInt(clusterSize, 10) || 0) / groupSize) * groupSize;
  if (!eff || eff < groupSize || eff >= n) {
    return _bestShuffle(players, opponentHistory, groupSize, attempts);
  }
  var ordered = players.slice().sort(function(a, b) {
    var ra = (rankIndex && rankIndex[a] != null) ? rankIndex[a] : 1e9;
    var rb = (rankIndex && rankIndex[b] != null) ? rankIndex[b] : 1e9;
    return ra - rb;
  });
  var out = [];
  for (var i = 0; i < ordered.length; i += eff) {
    out = out.concat(_bestShuffle(ordered.slice(i, i + eff), opponentHistory, groupSize, attempts));
  }
  return out;
}
// Exposto pra paridade com a Cloud Function autoDraw e testes (igual _generateNextRoundForPlayers).
window._clusteredBestShuffle = _clusteredBestShuffle;

// Helper: compute average points per round for a player (for sit-out compensation)
function _computeAvgPointsPerRound(t, playerName, category) {
  var totalPoints = 0;
  var roundsPlayed = 0;
  (t.rounds || []).forEach(function(round) {
    var playedThisRound = false;
    (round.matches || []).forEach(function(m) {
      if (category && m.category !== category) return;
      if (m.isSitOut) return; // don't count sit-out compensation rounds
      if (m.isMonarch && m.team1 && m.team2) {
        if (m.team1.indexOf(playerName) !== -1 || m.team2.indexOf(playerName) !== -1) {
          if (m.winner) {
            playedThisRound = true;
            var isDraw = m.winner === 'draw' || m.draw;
            var team1Won = !isDraw && m.winner === m.p1;
            var team2Won = !isDraw && m.winner === m.p2;
            var inTeam1 = m.team1.indexOf(playerName) !== -1;
            if (isDraw) totalPoints += 1;
            else if ((inTeam1 && team1Won) || (!inTeam1 && team2Won)) totalPoints += 3;
          }
        }
      } else if (!m.isBye && m.winner) {
        if (m.p1 === playerName || m.p2 === playerName) {
          playedThisRound = true;
          if (m.winner === 'draw' || m.draw) totalPoints += 1;
          else if (m.winner === playerName) totalPoints += 3;
        }
      }
    });
    if (playedThisRound) roundsPlayed++;
  });
  // v0.16.97: fallback 0 (era 1) quando o jogador não tem nenhuma rodada
  // anterior pra basear média. Pedido do usuário: regra explícita "remainder
  // recebe sua pontuação média no torneio até ali" — sem média, sem pontos.
  // Antes retornava 1 (compensação simbólica) mas isso premiava jogadores
  // recém-chegados sem mérito.
  return roundsPlayed > 0 ? Math.round(totalPoints / roundsPlayed) : 0;
}

// ─── Lista de espera Rei/Rainha (v2.6.99) ──────────────────────────────────────
// A SOBRA da divisão por 4 numa rodada Rei/Rainha não é mais "folga com média":
// vira LISTA DE ESPERA. Ela carrega entre rodadas (com prioridade pra entrar nos
// grupos na próxima) e, quando junta 4 (sobra + novos inscritos via +participante),
// forma AUTOMATICAMENTE um novo grupo na rodada corrente. Decisão do dono (18-jun):
// auto-formar ao juntar 4; quem fica esperando segue pra próxima rodada (sem média).
// ─── Canônico: construção de um grupo Rei/Rainha ─────────────────────────────
// v2.7.2: ÚNICA fonte da estrutura de um grupo Rei/Rainha (4 jogadores → 3 jogos
// com parceiros rotativos AB/CD, AC/BD, AD/BC). Usado pelos TRÊS caminhos que
// criam grupo — sorteio standard (_generateReiRainhaRoundForPlayers), agendado
// round-robin (_drawFromRoundRobinSchedule) e formação por lista de espera
// (_tryFormMonarchWaitlistGroups). Mudou aqui, muda em todos: fim do drift que
// deixava uma rotina com folga 'remainder' e outra com lista de espera.
// opts: { roundNum, roundIndex, gi, players:[A,B,C,D], category, ts, idTag, idExtra, nameSuffix }
function _buildMonarchGroup(opts) {
  var roundNum = opts.roundNum;
  var P = opts.players, category = opts.category || null, gi = opts.gi;
  var ts = (opts.ts != null) ? opts.ts : Date.now();
  var idTag = opts.idTag || 'g';
  var idExtra = (opts.idExtra != null) ? opts.idExtra : '';
  var nameSuffix = opts.nameSuffix || '';
  var catSuffix = category ? '-' + category.replace(/\s+/g, '_') : '';
  var catLabel = category && window._displayCategoryName
    ? ' (' + window._displayCategoryName(category) + ')'
    : (category ? ' (' + category + ')' : '');
  var groupName = 'R' + roundNum + ' ' + window._groupName(gi) + nameSuffix;
  var A = P[0], B = P[1], C = P[2], D = P[3];
  var pairings = [{ t1: [A, B], t2: [C, D] }, { t1: [A, C], t2: [B, D] }, { t1: [A, D], t2: [B, C] }];
  var matches = pairings.map(function (pair, mi) {
    var m = {
      id: 'match-rr-r' + roundNum + '-' + idTag + gi + '-' + mi + catSuffix + '-' + ts + idExtra,
      round: roundNum, roundIndex: opts.roundIndex,
      p1: pair.t1.join(' / '), p2: pair.t2.join(' / '),
      team1: pair.t1, team2: pair.t2,
      winner: null, scoreP1: null, scoreP2: null,
      isMonarch: true, monarchGroup: gi,
      label: groupName + ' • Jogo ' + (mi + 1) + catLabel
    };
    if (category) m.category = category;
    return m;
  });
  return { name: groupName, players: P.slice(), matches: matches };
}
window._buildMonarchGroup = _buildMonarchGroup;

// v2.7.3: ÚNICA fonte da partida de FOLGA (sit-out). Antes construída à mão em 3
// lugares (round-robin, Rei/Rainha, Suíço) — drift de label/reason/pontos.
// opts: { player, roundNum, roundIndex, category, ts, idPrefix, idIndex, reason, points }
function _buildSitOut(opts) {
  var category = opts.category || null;
  var catSuffix = category ? '-' + category.replace(/\s+/g, '_') : '';
  var catLabel = category && window._displayCategoryName
    ? ' (' + window._displayCategoryName(category) + ')' : (category ? ' (' + category + ')' : '');
  var reason = opts.reason || 'remainder';
  var isInactive = reason === 'inactive';
  var o = {
    id: opts.idPrefix + opts.roundNum + '-' + opts.idIndex + catSuffix + '-' + opts.ts,
    round: opts.roundNum, roundIndex: opts.roundIndex,
    // folga NÃO tem vencedor — recebe sitOutPoints na classificação, sem vitória.
    p1: opts.player, p2: 'FOLGA',
    isSitOut: true, sitOutPoints: opts.points, sitOutReason: reason,
    label: 'R' + opts.roundNum + ' • Folga' + (isInactive ? ' (inativo)' : '') + catLabel
  };
  if (category) o.category = category;
  return o;
}
window._buildSitOut = _buildSitOut;

// v2.7.3: ÚNICA fonte da partida BYE. Antes em 3 lugares.
// opts: { player, roundNum, roundIndex, category, ts, idPrefix }
function _buildBye(opts) {
  var category = opts.category || null;
  var catSuffix = category ? '-' + category.replace(/\s+/g, '_') : '';
  var catLabel = category && window._displayCategoryName
    ? ' (' + window._displayCategoryName(category) + ')' : (category ? ' (' + category + ')' : '');
  var o = {
    id: opts.idPrefix + opts.roundNum + catSuffix + '-' + opts.ts,
    round: opts.roundNum, roundIndex: opts.roundIndex,
    p1: opts.player, p2: 'BYE', winner: opts.player, isBye: true,
    label: 'R' + opts.roundNum + ' • BYE' + catLabel
  };
  if (category) o.category = category;
  return o;
}
window._buildBye = _buildBye;

function _monarchWaitKey(category) { return (category || '_default_').replace(/\s+/g, '_'); }
window._getMonarchWaitlist = function (t, category) {
  var k = _monarchWaitKey(category);
  return (t && t.monarchWaitlist && Array.isArray(t.monarchWaitlist[k])) ? t.monarchWaitlist[k].slice() : [];
};
function _setMonarchWaitlist(t, category, names) {
  if (!t.monarchWaitlist) t.monarchWaitlist = {};
  t.monarchWaitlist[_monarchWaitKey(category)] = (names || []).slice();
}
// Forma grupos de 4 a partir da lista de espera e anexa à COLUNA da rodada corrente.
// Retorna quantos grupos formou. Chamado após o sorteio e após +participante.
window._tryFormMonarchWaitlistGroups = function (t, category, roundNum) {
  var wl = window._getMonarchWaitlist(t, category);
  if (wl.length < 4) return 0;
  var rounds = t.rounds || [];
  var colIdx = -1;
  for (var ci = rounds.length - 1; ci >= 0; ci--) {
    var r = rounds[ci];
    if (!r || r.round !== roundNum || !Array.isArray(r.monarchGroups)) continue;
    var sample = (r.matches || [])[0];
    var rcat = sample ? (sample.category || null) : null;
    if ((category || null) !== (rcat || null)) continue;
    colIdx = ci; break;
  }
  if (colIdx === -1) return 0;
  var col = rounds[colIdx];
  var ts = Date.now();
  var catSuffix = category ? '-' + category.replace(/\s+/g, '_') : '';
  var catLabel = category && window._displayCategoryName ? ' (' + window._displayCategoryName(category) + ')' : (category ? ' (' + category + ')' : '');
  var formed = 0;
  while (wl.length >= 4) {
    var grp = wl.splice(0, 4);
    var gi = (col.monarchGroups || []).length;
    var g = _buildMonarchGroup({ roundNum: roundNum, roundIndex: colIdx, gi: gi, players: grp, category: category, ts: ts, idTag: 'wl', idExtra: '-' + formed });
    col.monarchGroups.push(g);
    col.matches = (col.matches || []).concat(g.matches);
    formed++;
  }
  _setMonarchWaitlist(t, category, wl);
  if (formed > 0 && typeof _recordOpponentHistory === 'function') {
    try { _recordOpponentHistory(t, col.monarchGroups.slice(-formed), category); } catch (e) {}
  }
  return formed;
};
// Chamado quando um +participante entra num torneio Rei/Rainha com rodada em
// andamento (fase 0): joga o novo na lista de espera da rodada corrente e tenta
// formar grupo. Retorna {added, formed}. Caller salva se added.
window._onParticipantAddedToMonarchRound = function (t, playerName, category) {
  var res = { added: false, formed: 0 };
  if (!t || !playerName) return res;
  if ((t.currentPhaseIndex || 0) !== 0) return res; // já avançou de fase
  var isLiga = window._isLigaFormat && window._isLigaFormat(t);
  if (!isLiga || t.ligaRoundFormat !== 'rei_rainha') return res;
  var rounds = t.rounds || [];
  var target = null;
  for (var i = rounds.length - 1; i >= 0; i--) {
    var r = rounds[i];
    if (!r || !Array.isArray(r.monarchGroups) || !r.monarchGroups.length) continue;
    var sample = (r.matches || [])[0];
    var rcat = sample ? (sample.category || null) : null;
    if ((category || null) !== (rcat || null)) continue;
    target = r; break;
  }
  if (!target) return res;
  var inGroup = (target.monarchGroups || []).some(function (g) { return (g.players || []).indexOf(playerName) !== -1; });
  var wl = window._getMonarchWaitlist(t, category);
  if (inGroup || wl.indexOf(playerName) !== -1) return res;
  wl.push(playerName);
  _setMonarchWaitlist(t, category, wl);
  res.added = true;
  res.formed = window._tryFormMonarchWaitlistGroups(t, category, target.round);
  return res;
};

// v2.7.1: auto-cura — em Rei/Rainha NINGUÉM fica "Sem grupo (recebe média)". Quem
// sobrou do agrupamento por 4 É a lista de espera (entrou primeiro). Converte
// qualquer folga 'remainder' (de sorteios feitos antes da lista de espera existir,
// ou copiados de outro ambiente) em lista de espera no TOPO, remove a partida de
// folga e tenta formar grupo ao juntar 4. Idempotente: sem 'remainder' → no-op.
// Guarda: NÃO mexe no modo "Todos contra todos" (round_robin), onde a folga é
// rodízio agendado legítimo (o jogador joga em outras rodadas), não fila.
window._healMonarchRemainderToWaitlist = function (t) {
  if (!t || !Array.isArray(t.rounds)) return false;
  if (!(window._isLigaFormat && window._isLigaFormat(t)) || t.ligaRoundFormat !== 'rei_rainha') return false;
  if (t.ligaDrawMode === 'round_robin') return false; // rodízio agendado, não fila
  if ((t.currentPhaseIndex || 0) !== 0) return false; // só na fase de grupos
  var changed = false;
  var touchedCats = {};
  var _isRem = function (m) { return m && m.isSitOut && m.sitOutReason !== 'inactive' && m.sitOutReason !== 'wo'; };
  t.rounds.forEach(function (col) {
    if (!col || col.format !== 'rei_rainha' || !Array.isArray(col.matches)) return;
    var rem = col.matches.filter(_isRem);
    if (!rem.length) return;
    var byCat = {};
    rem.forEach(function (m) {
      var ck = _monarchWaitKey(m.category || null);
      (byCat[ck] = byCat[ck] || { cat: (m.category || null), names: [] }).names.push(m.p1);
    });
    Object.keys(byCat).forEach(function (ck) {
      var cat = byCat[ck].cat;
      var names = byCat[ck].names.filter(Boolean);
      var wl = window._getMonarchWaitlist(t, cat);
      // remainder entrou primeiro → vai pra frente da fila (dedup)
      var merged = names.concat(wl.filter(function (n) { return names.indexOf(n) === -1; }));
      _setMonarchWaitlist(t, cat, merged);
      touchedCats[ck] = { cat: cat, round: col.round };
    });
    col.matches = col.matches.filter(function (m) { return !_isRem(m); });
    changed = true;
  });
  if (changed) {
    Object.keys(touchedCats).forEach(function (ck) {
      var tc = touchedCats[ck];
      try { window._tryFormMonarchWaitlistGroups(t, tc.cat, tc.round); } catch (e) {}
    });
  }
  return changed;
};

window._generateReiRainhaRoundForPlayers = function _generateReiRainhaRoundForPlayers(t, category, _rn) {
  var standings = _computeStandings(t, category);
  var allPlayers = standings.map(function(s) { return s.name; });
  var isLiga = window._isLigaFormat && window._isLigaFormat(t);

  // Liga: filter out inactive players and record them as sit-out
  var players = allPlayers;
  var inactiveSitOuts = [];
  if (isLiga) {
    var activeNames = _getActiveLigaPlayers(t);
    players = allPlayers.filter(function(name) { return activeNames[name]; });
    inactiveSitOuts = allPlayers.filter(function(name) { return !activeNames[name]; });
  }

  if (players.length < 2) {
    window._warn('[bracket-logic] Not enough active players for Rei/Rainha round:', players.length);
    return;
  }
  if (players.length < 4) {
    // Not enough for Rei/Rainha groups, fallback to standard pairing
    _generateNextRoundForPlayers(t, category, _rn);
    return;
  }

  // v2.5.1: o nº da rodada deriva do MAIOR `round` já existente +1, não da
  // contagem de colunas. Multi-categoria gera 1 coluna por categoria no MESMO
  // sorteio — todas têm que ficar na MESMA rodada (C e D ambas Rodada 1), senão
  // a 2ª categoria virava "Rodada 2". roundIndex (índice físico da coluna)
  // continua = length.
  var roundNum = (typeof _rn === 'number') ? _rn : (((t.rounds || []).reduce(function (mx, c) { return Math.max(mx, (c && c.round) || 0); }, 0)) + 1);
  var ts = Date.now();
  var catSuffix = category ? '-' + category.replace(/\s+/g, '_') : '';
  var catLabel = category && window._displayCategoryName ? ' (' + window._displayCategoryName(category) + ')' : (category ? ' (' + category + ')' : '');

  // v2.6.99: a SOBRA da divisão por 4 NÃO é mais folga-com-média — vira LISTA DE
  // ESPERA. Quem já estava na espera entra nos grupos primeiro (prioridade), e a
  // nova sobra é a lista de espera desta rodada (carrega pra próxima, sem média).
  var remainder = players.length % 4;
  var playingPlayers = players;
  var sitOutPlayers = []; // só INATIVOS viram folga agora (a sobra vira espera)

  if (isLiga) {
    if (remainder > 0) {
      var _prevWl = window._getMonarchWaitlist(t, category).filter(function (n) { return players.indexOf(n) !== -1; });
      var _rest = players.filter(function (n) { return _prevWl.indexOf(n) === -1; });
      var _ordered = _prevWl.concat(_rest);
      playingPlayers = _ordered.slice(0, _ordered.length - remainder);
      _setMonarchWaitlist(t, category, _ordered.slice(_ordered.length - remainder));
    } else {
      _setMonarchWaitlist(t, category, []); // sem sobra → ninguém esperando
    }
  }

  // Formação dos grupos de 4 (groupsBy):
  //   'ranking' (default) = mantém a ordem de classificação/seeding — comportamento legado.
  //   'sorteio'           = embaralha → grupos aleatórios.
  // Liga continuada: a partir da 2ª rodada SEMPRE usa _bestShuffle (evita reencontros),
  // independente do groupsBy — a justiça da rotação vence. groupsBy só decide a 1ª
  // formação (quando ainda não há histórico de adversários).
  var _rrGroupsBy = (t.reiRainhaGroupsBy || 'ranking');
  if (isLiga) {
    var rrOpHist = (t.opponentHistory && t.opponentHistory[(category || '_default_').replace(/\s+/g, '_')]) || {};
    var _hasHist = rrOpHist && Object.keys(rrOpHist).length > 0;
    if (!_hasHist && _rrGroupsBy === 'sorteio') {
      playingPlayers = _plainShuffle(playingPlayers); // 1ª rodada por sorteio
    } else {
      playingPlayers = _bestShuffle(playingPlayers, rrOpHist, 4, 200);
    }
  } else if (_rrGroupsBy === 'sorteio') {
    playingPlayers = _plainShuffle(playingPlayers);
  }

  // Divide playing players into groups of 4
  var numGroups = Math.floor(playingPlayers.length / 4);
  var groups = [];

  for (var gi = 0; gi < numGroups; gi++) {
    var gPlayers = playingPlayers.slice(gi * 4, gi * 4 + 4);
    groups.push(_buildMonarchGroup({ roundNum: roundNum, roundIndex: (t.rounds || []).length, gi: gi, players: gPlayers, category: category, ts: ts }));
  }

  // Record opponent pairings for anti-repeat logic in future rounds
  if (isLiga) _recordOpponentHistory(t, groups, category);

  // Sit-out matches for Liga: remainder + inactive players receive average points compensation
  var sitOutMatches = [];
  if (isLiga) {
    var allSitOuts = sitOutPlayers.concat(inactiveSitOuts);
    // v2.6.70: inativos NÃO contam na fairness do sorteio (reason 'inactive').
    _recordSitOut(t, inactiveSitOuts, category, 'inactive');
    allSitOuts.forEach(function(name, si) {
      var isInactive = inactiveSitOuts.indexOf(name) !== -1;
      var avgPts = isInactive ? 0 : _sitOutComp(t, name, category);
      var soObj = _buildSitOut({ player: name, roundNum: roundNum, roundIndex: (t.rounds || []).length, category: category, ts: ts, idPrefix: 'sitout-rr-r', idIndex: si, reason: isInactive ? 'inactive' : 'remainder', points: avgPts });
      sitOutMatches.push(soObj);
    });
  }

  // Non-Liga remainder: old behavior (standard pairings / BYE)
  var remainderMatches = [];
  if (!isLiga && remainder > 0) {
    var remRemainder = players.length % 4;
    if (remRemainder >= 2) {
      var remPlayers = players.slice(numGroups * 4);
      for (var ri = 0; ri < remPlayers.length; ri += 2) {
        if (ri + 1 < remPlayers.length) {
          var rObj = {
            id: 'match-rr-r' + roundNum + '-rem-' + ri + catSuffix + '-' + ts,
            round: roundNum, roundIndex: (t.rounds || []).length,
            p1: remPlayers[ri], p2: remPlayers[ri + 1],
            winner: null, label: 'R' + roundNum + ' • Extra' + catLabel
          };
          if (category) rObj.category = category;
          remainderMatches.push(rObj);
        } else {
          var byeObj = _buildBye({ player: remPlayers[ri], roundNum: roundNum, roundIndex: (t.rounds || []).length, category: category, ts: ts, idPrefix: 'bye-rr-r' });
          remainderMatches.push(byeObj);
        }
      }
    } else if (remRemainder === 1) {
      var byeObj2 = _buildBye({ player: players[players.length - 1], roundNum: roundNum, roundIndex: (t.rounds || []).length, category: category, ts: ts, idPrefix: 'bye-rr-r' });
      remainderMatches.push(byeObj2);
    }
  }

  // Collect all matches for the round
  var allMatches = [];
  groups.forEach(function(g) { allMatches = allMatches.concat(g.matches); });
  allMatches = allMatches.concat(remainderMatches);
  allMatches = allMatches.concat(sitOutMatches);

  window._appendCanonicalColumn(t, {
    phase: 'monarch', round: roundNum, status: 'active',
    format: 'rei_rainha', matches: allMatches, monarchGroups: groups
  });

  // v2.6.99: se a lista de espera já tiver 4+ (ex.: sobra acumulada), forma grupo
  // na hora. Normalmente a sobra desta rodada é < 4, então isso é no-op aqui — o
  // gatilho real é o +participante (que empurra pra ≥4).
  if (isLiga) window._tryFormMonarchWaitlistGroups(t, category, roundNum);
};

function _generateNextRoundForPlayers(t, category, _rn) {
  const standings = _computeStandings(t, category);
  const _isLigaFmtHere = window._isLigaFormat && window._isLigaFormat(t);
  // v2.5.1: ver comentário em _generateReiRainhaRoundForPlayers — round = maior
  // round existente +1, pra categorias do mesmo sorteio compartilharem a rodada.
  const roundNum = (typeof _rn === 'number') ? _rn : (((t.rounds || []).reduce(function (mx, c) { return Math.max(mx, (c && c.round) || 0); }, 0)) + 1);
  const roundIdx = (t.rounds || []).length;
  const timestamp = Date.now();
  const catSuffix = category ? '-' + category.replace(/\s+/g, '_') : '';
  const catLabel = category && window._displayCategoryName ? ' (' + window._displayCategoryName(category) + ')' : (category ? ' (' + category + ')' : '');

  // Liga: filter inactive players, create sit-outs for them
  var inactiveSitOutsSwiss = [];
  var activeNamesSwiss = null;
  if (_isLigaFmtHere) {
    activeNamesSwiss = _getActiveLigaPlayers(t);
    inactiveSitOutsSwiss = _getInactiveLigaPlayers(t);
    _recordSitOut(t, inactiveSitOutsSwiss, category, 'inactive');
  }

  var allPlayersSwiss = standings.map(s => s.name);
  // Liga: filter out inactive players
  const players = (_isLigaFmtHere && activeNamesSwiss)
    ? allPlayersSwiss.filter(function(n) { return activeNamesSwiss[n]; })
    : allPlayersSwiss;
  if (players.length < 2) {
    window._warn('[bracket-logic] Not enough active players for round generation:', players.length);
    return;
  }

  // ─── Liga: form doubles and match them (dupla vs dupla), anti-repeat ─────
  if (_isLigaFmtHere) {
    // First shuffle to determine sit-outs (using opponent history for fairness)
    var ligaOpHist = (t.opponentHistory && t.opponentHistory[(category || '_default_').replace(/\s+/g, '_')]) || {};
    var shuffled = _bestShuffle(players.slice(), ligaOpHist, 4, 200);

    // Handle sit-outs: need multiple of 4 for doubles matches
    var remainder = shuffled.length % 4;
    var playingPlayers = shuffled;
    var sitOutPlayers = [];
    if (remainder > 0) {
      var result = _chooseSitOutPlayers(t, shuffled, remainder, category);
      playingPlayers = result.playing;
      sitOutPlayers = result.sitOut;
      _recordSitOut(t, sitOutPlayers, category);
    }

    // Re-shuffle playing players with anti-repeat for partner assignment.
    // v2.6.69: "Sorteio equilibrado" (t.equilibrado) + tamanho de cluster (t.clusterSize)
    // restringem o pareamento a buckets de nível próximo. Ranking vem das standings
    // (rankIndex 0 = mais forte). Sem clusterSize → _bestShuffle global (legado).
    var _ligaRankIndex = {};
    standings.forEach(function(s, _ri) { _ligaRankIndex[s.name] = _ri; });
    var _ligaBalanced = (t.equilibrado !== false) && t.clusterSize;
    playingPlayers = _ligaBalanced
      ? _clusteredBestShuffle(playingPlayers, ligaOpHist, 4, t.clusterSize, 200, _ligaRankIndex)
      : _bestShuffle(playingPlayers, ligaOpHist, 4, 200);

    // Form doubles: take consecutive pairs of 4 → team1 = [0,1] vs team2 = [2,3]
    var newMatches = [];
    for (var mi = 0; mi < playingPlayers.length; mi += 4) {
      var A = playingPlayers[mi], B = playingPlayers[mi + 1];
      var C = playingPlayers[mi + 2], D = playingPlayers[mi + 3];
      var matchObj = {
        id: 'match-r' + roundNum + '-' + newMatches.length + catSuffix + '-' + timestamp,
        round: roundNum, roundIndex: roundIdx,
        p1: A + ' / ' + B, p2: C + ' / ' + D,
        team1: [A, B], team2: [C, D],
        winner: null, scoreP1: null, scoreP2: null,
        isMonarch: true,
        label: 'R' + roundNum + ' • Partida ' + (newMatches.length + 1) + catLabel
      };
      if (category) matchObj.category = category;
      newMatches.push(matchObj);
    }

    // Record groups formed this round for anti-repeat logic
    var _ligaGroups = [];
    for (var _gi = 0; _gi < playingPlayers.length; _gi += 4) {
      _ligaGroups.push(playingPlayers.slice(_gi, _gi + 4));
    }
    _recordOpponentHistory(t, _ligaGroups, category);

    // Sit-out matches: remainder + inactive players receive average points
    var allSitOuts = sitOutPlayers.concat(inactiveSitOutsSwiss);
    // v2.6.70: inativos NÃO contam na fairness do sorteio (reason 'inactive').
    _recordSitOut(t, inactiveSitOutsSwiss, category, 'inactive');
    allSitOuts.forEach(function(name, idx) {
      var isInactive = inactiveSitOutsSwiss.indexOf(name) !== -1;
      var avgPts = isInactive ? 0 : _sitOutComp(t, name, category);
      var soObj = _buildSitOut({ player: name, roundNum: roundNum, roundIndex: roundIdx, category: category, ts: timestamp, idPrefix: 'sitout-r', idIndex: idx, reason: isInactive ? 'inactive' : 'remainder', points: avgPts });
      newMatches.push(soObj);
    });

    window._appendCanonicalColumn(t, {
      phase: 'liga', round: roundNum, status: 'active', matches: newMatches
    });
    return;
  }

  // ─── Non-Liga: Swiss pairing (1v1) ──────────────────────────────────────
  var played = new Set();
  (t.rounds || []).forEach(r => {
    (r.matches || []).forEach(m => {
      if (category && m.category !== category) return;
      if (m.p1 && m.p2 && m.p2 !== 'BYE' && m.p2 !== 'FOLGA') {
        played.add(`${m.p1}|||${m.p2}`);
        played.add(`${m.p2}|||${m.p1}`);
      }
    });
  });

  var matched = new Set();
  var newMatches = [];

  // Pair players with similar score, avoiding repeats when possible
  for (let i = 0; i < players.length; i++) {
    if (matched.has(players[i])) continue;
    let paired = false;
    for (let j = i + 1; j < players.length; j++) {
      if (matched.has(players[j])) continue;
      if (!played.has(`${players[i]}|||${players[j]}`)) {
        var matchObj = {
          id: `match-r${roundNum}-${newMatches.length}${catSuffix}-${timestamp}`,
          round: roundNum, roundIndex: roundIdx,
          p1: players[i], p2: players[j],
          winner: null,
          label: `R${roundNum} • Partida ${newMatches.length + 1}` + catLabel
        };
        if (category) matchObj.category = category;
        newMatches.push(matchObj);
        matched.add(players[i]); matched.add(players[j]);
        paired = true; break;
      }
    }
    if (!paired) {
      // Allow repeat
      for (let j = i + 1; j < players.length; j++) {
        if (!matched.has(players[j])) {
          var matchObj2 = {
            id: `match-r${roundNum}-${newMatches.length}${catSuffix}-${timestamp}`,
            round: roundNum, roundIndex: roundIdx,
            p1: players[i], p2: players[j],
            winner: null,
            label: `R${roundNum} • Partida ${newMatches.length + 1}` + catLabel
          };
          if (category) matchObj2.category = category;
          newMatches.push(matchObj2);
          matched.add(players[i]); matched.add(players[j]);
          break;
        }
      }
    }
  }

  // Remainder: BYE for non-Liga
  players.filter(p => !matched.has(p)).forEach(p => {
    var byeObj = _buildBye({ player: p, roundNum: roundNum, roundIndex: roundIdx, category: category, ts: timestamp, idPrefix: 'bye-r' });
    newMatches.push(byeObj);
  });

  window._appendCanonicalColumn(t, {
    phase: 'swiss', round: roundNum, status: 'active', matches: newMatches
  });
}
// v2.3.91: exposto pro Cloud Function autoDraw (ver _generateNextRound acima).
window._generateNextRoundForPlayers = _generateNextRoundForPlayers;

// ─── v2.3.8: self-heal de rodadas geradas ANTES da hora ─────────────────────
// O bug pré-v2.3.7 fazia COMPLETAR a rodada gerar a SEGUINTE imediatamente,
// antes do sorteio agendado. Esta função remove rodadas extras que (a) ainda
// não chegaram no horário agendado E (b) não têm nenhum resultado lançado.
// Roda no poller (só organizador escreve) e corrige os dados já afetados sem
// intervenção manual. Retorna true se removeu alguma rodada.
function _healPrematureLigaRounds(t) {
  if (!(window._isLigaFormat && window._isLigaFormat(t))) return false;
  if (t.drawManual === true || !t.drawFirstDate) return false;
  if (!Array.isArray(t.rounds) || t.rounds.length < 2) return false;
  var firstDraw = new Date(t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00')).getTime();
  if (isNaN(firstDraw)) return false;
  var intervalDays = parseInt(t.drawIntervalDays) || 7;
  if (intervalDays < 1) intervalDays = 1;
  var intervalMs = intervalDays * 86400000;
  var now = Date.now();
  var removed = false;
  while (t.rounds.length >= 2) {
    var lastIdx = t.rounds.length - 1;
    // idx 1 = 2ª rodada = firstDraw + 1 intervalo; idx N = firstDraw + N intervalos
    var scheduledForLast = firstDraw + lastIdx * intervalMs;
    if (scheduledForLast <= now) break;            // horário do sorteio já chegou → legítima
    var lastRound = t.rounds[lastIdx];
    var played = (lastRound && lastRound.matches || []).some(function(m) { return m.winner && !m.isSitOut; });
    if (played) break;                             // tem resultado → não mexe
    t.rounds.pop();
    removed = true;
  }
  if (removed && typeof _computeStandings === 'function') {
    t.standings = _computeStandings(t);
  }
  return removed;
}
window._healPrematureLigaRounds = _healPrematureLigaRounds;

// v2.3.9: remove o `winner` legado de partidas de FOLGA (sit-out). Antes a folga
// era criada com winner=jogador, o que vazava como "vitória"/"partida disputada"
// nas estatísticas. Roda no poller (organizador) e limpa os dados já gravados.
// Retorna true se alterou algo.
function _healSitOutWinners(t) {
  if (!Array.isArray(t.rounds)) return false;
  var changed = false;
  t.rounds.forEach(function(r) {
    (r && r.matches || []).forEach(function(m) {
      if (m && m.isSitOut && m.winner !== undefined) { delete m.winner; changed = true; }
    });
  });
  if (changed && typeof _computeStandings === 'function') {
    try { t.standings = _computeStandings(t); } catch (e) {}
  }
  return changed;
}
window._healSitOutWinners = _healSitOutWinners;

// ─── Liga auto-draw poller ──────────────────────────────────────────────────
// Runs periodically on the organizer's browser. For every Liga tournament
// where drawManual is off and drawFirstDate/Time are set, fires the scheduled
// draw when its time has arrived. First draw seeds standings + round 1;
// subsequent draws generate the next round. Stops once t.endDate has passed.
window._checkLigaAutoDraws = async function() {
  var store = window.AppStore;
  if (!store || !Array.isArray(store.tournaments) || !store.currentUser) return;

  var now = new Date();
  var tournaments = store.tournaments.slice();
  // Tombstone set — ids que o usuário acabou de apagar localmente. A lista
  // é limpa quando o delete server-side confirma em tournaments-enrollment.
  var _deletedIds = (store._deletedTournamentIds || []).map(String);

  for (var i = 0; i < tournaments.length; i++) {
    var t = tournaments[i];
    if (!t) continue;

    // Torneio apagado (ou em processo de apagar) — nunca disparar auto-draw,
    // sob pena de ressuscitar o doc via saveTournament({merge: true}).
    if (_deletedIds.indexOf(String(t.id)) !== -1) continue;

    // Only Liga tournaments
    if (!(window._isLigaFormat && window._isLigaFormat(t))) continue;

    // Only the organizer (or an active co-host) fires the draw — avoids
    // multiple participant browsers racing on the same tournament.
    // v2.8.79: uid-primário via helper canônico (cobre co-host com email '').
    var _isOrg = window.AppStore.isOrganizer(t);
    if (!_isOrg) continue;

    // Must be auto-scheduled with a first date
    if (t.drawManual) continue;
    if (!t.drawFirstDate) continue;
    // v2.3.96: rede de segurança — sorteio em revisão é tratado SÓ pelo servidor
    // (autoDraw escreve em pendingDraw). O cliente nunca publica um sorteio staged.
    if (t.stagedDraw) continue;

    // Skip finished
    if (t.status === 'finished') continue;

    // v2.3.8/2.3.9: auto-correções nos dados — (a) rodada gerada antes da hora
    // (bug pré-v2.3.7) e (b) folgas (sit-out) com winner legado. Remove/limpa,
    // salva e re-renderiza. Segue o fluxo normal depois.
    var _didHeal = _healPrematureLigaRounds(t);
    if (_healSitOutWinners(t)) _didHeal = true;
    if (_didHeal) {
      t.updatedAt = new Date().toISOString();
      try { await window.AppStore.syncImmediate(t.id); } catch (e) { window._warn('[heal] save failed', e); }
      try {
        var _h = (window.location && window.location.hash) || '';
        var _vc = document.getElementById('view-container');
        if (_vc && _h.indexOf('#tournaments/' + t.id) === 0 && typeof window.renderTournaments === 'function') {
          window.renderTournaments(_vc, t.id);
        } else if (_h.indexOf('#bracket/' + t.id) === 0 && typeof window._rerenderBracket === 'function') {
          window._rerenderBracket(t.id);
        }
      } catch (e) {}
    }

    // Stop if the league season has ended (endDate ou ligaSeasonMonths).
    // v2.4.75: usa o helper canônico (BRT, respeita hora explícita no endDate).
    // O check antigo `new Date(t.endDate + 'T23:59:59')` quebrava quando endDate
    // já tinha hora (ex: '2026-06-13T19:59' → '...T19:59T23:59:59' = data inválida
    // → isNaN → check ANULADO → o browser do organizador sorteava depois do fim).
    // Bug "Teste de Liga": rodada extra no dia seguinte às 20h.
    var _seasonEndMs = (typeof window._ligaSeasonEndMs === 'function') ? window._ligaSeasonEndMs(t) : null;
    if (_seasonEndMs != null && now.getTime() > _seasonEndMs) continue;

    var firstDrawStr = t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00');
    var firstDraw = new Date(firstDrawStr);
    if (isNaN(firstDraw.getTime())) continue;

    // Not yet time for the first draw
    if (firstDraw > now) continue;

    // Compute the most recent scheduled draw that is ≤ now
    var intervalDays = parseInt(t.drawIntervalDays) || 7;
    if (intervalDays < 1) intervalDays = 1;
    var intervalMs = intervalDays * 86400000;
    var elapsed = now.getTime() - firstDraw.getTime();
    var intervals = Math.floor(elapsed / intervalMs);
    var mostRecentScheduled = new Date(firstDraw.getTime() + intervals * intervalMs);

    // v2.4.75: defensivo — não disparar um sorteio cujo horário AGENDADO já é
    // depois do fim do torneio (cobre o caso de now < fim mas o slot > fim).
    if (_seasonEndMs != null && mostRecentScheduled.getTime() > _seasonEndMs) continue;

    // Skip if we already fired for this scheduled time
    var lastFired = t.lastAutoDrawAt ? new Date(t.lastAutoDrawAt) : null;
    if (lastFired && !isNaN(lastFired.getTime()) && lastFired >= mostRecentScheduled) continue;

    try {
      await _fireLigaAutoDraw(t, mostRecentScheduled);
    } catch (e) {
      window._warn('[auto-draw] failed for tournament ' + t.id, e);
    }
  }
};

// ─── Rede de segurança: sorteio em revisão (pendingDraw) — v2.3.96 ────────────
// Quando t.stagedDraw, o autoDraw do servidor escreve o sorteio em t.pendingDraw
// (NÃO em t.rounds) e não notifica — nada vai a público. O organizador revisa e:
//  • Publicar → move pendingDraw → rounds + dispara notificações (vai a público)
//  • Anular   → descarta pendingDraw (nada público aconteceu); re-sorteia depois.
// Preview read-only da chave sorteada (grupos Rei/Rainha ou jogos), pra validar.
window._renderPendingDrawPreview = function (t) {
  var pd = t && t.pendingDraw;
  if (!pd || !Array.isArray(pd.rounds) || !pd.rounds.length) return '<div style="color:var(--text-muted);font-size:0.8rem;">(sem dados)</div>';
  var esc = window._safeHtml || function (s) { return String(s == null ? '' : s); };
  var html = '';
  pd.rounds.forEach(function (round, ri) {
    html += '<div style="font-weight:700;color:var(--text-bright);margin:10px 0 4px;font-size:0.85rem;">Rodada ' + (round.round || ri + 1) + '</div>';
    if (Array.isArray(round.monarchGroups) && round.monarchGroups.length) {
      round.monarchGroups.forEach(function (g) {
        html += '<div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px;margin-bottom:6px;">' +
          '<div style="font-size:0.78rem;font-weight:700;color:#22d3ee;margin-bottom:4px;">' + esc(g.name || '') + '</div>';
        (g.matches || []).forEach(function (m) {
          html += '<div style="font-size:0.78rem;color:var(--text-main);">' + esc(m.p1) + ' <span style="opacity:0.55;">×</span> ' + esc(m.p2) + '</div>';
        });
        html += '</div>';
      });
    } else {
      (round.matches || []).filter(function (m) { return m && !m.isSitOut; }).forEach(function (m) {
        if (m.isBye) { html += '<div style="font-size:0.78rem;color:var(--text-muted);">' + esc(m.p1) + ' — BYE</div>'; return; }
        html += '<div style="font-size:0.78rem;color:var(--text-main);">' + esc(m.p1) + ' <span style="opacity:0.55;">×</span> ' + esc(m.p2) + '</div>';
      });
    }
    var folgas = (round.matches || []).filter(function (m) { return m && m.isSitOut; });
    if (folgas.length) html += '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Folga: ' + folgas.map(function (m) { return esc(m.p1); }).join(', ') + '</div>';
  });
  return html;
};

window._renderPendingDrawBanner = function (t) {
  if (!t || !t.pendingDraw) return '';
  var store = window.AppStore;
  if (!(store && store.isOrganizer && store.isOrganizer(t))) return '';
  var esc = window._safeHtml || function (s) { return String(s == null ? '' : s); };
  var preview = window._renderPendingDrawPreview ? window._renderPendingDrawPreview(t) : '';
  return '<div style="border:2px solid #f59e0b;background:rgba(245,158,11,0.10);border-radius:14px;padding:14px 16px;margin:0 0 1rem;">' +
    '<div style="font-size:1rem;font-weight:800;color:#fbbf24;margin-bottom:4px;">🔒 Sorteio em revisão — só você vê</div>' +
    '<div style="font-size:0.82rem;color:var(--text-main);line-height:1.45;margin-bottom:10px;">O sorteio foi realizado mas <b>não foi publicado</b> e <b>ninguém foi notificado</b>. Confira a chave abaixo. Se estiver tudo certo, clique <b>Publicar</b> — aí sim vai a público e os participantes são avisados. Se houver erro, clique <b>Anular</b>.</div>' +
    '<details style="margin-bottom:10px;"><summary style="cursor:pointer;font-weight:700;color:var(--text-bright);font-size:0.85rem;">👁️ Ver a chave sorteada</summary>' +
      '<div style="margin-top:8px;max-height:380px;overflow:auto;">' + preview + '</div>' +
    '</details>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-outline" style="color:#f87171;border-color:rgba(248,113,113,0.5);" onclick="event.stopPropagation(); window._annulPendingDraw(\'' + esc(t.id) + '\')">✕ Anular</button>' +
      '<button class="btn btn-shine" style="background:#10b981;color:#fff;border:1px solid rgba(255,255,255,0.3);font-weight:700;" onclick="event.stopPropagation(); window._publishPendingDraw(\'' + esc(t.id) + '\')">🚀 Publicar sorteio</button>' +
    '</div>' +
  '</div>';
};

window._publishPendingDraw = async function (tId) {
  var store = window.AppStore;
  var t = store && store.tournaments.find(function (x) { return String(x.id) === String(tId); });
  if (!t || !t.pendingDraw) return;
  if (!(store.isOrganizer && store.isOrganizer(t))) return;
  var pd = t.pendingDraw;
  // Move o sorteio pra produção (vira público).
  t.rounds = Array.isArray(pd.rounds) ? pd.rounds : [];
  if (pd.standings) t.standings = pd.standings;
  if (pd.sitOutHistory) t.sitOutHistory = pd.sitOutHistory;
  if (pd.opponentHistory) t.opponentHistory = pd.opponentHistory;
  // v2.7.9: a lista de espera do Rei/Rainha mora em t.monarchWaitlist (sobra da
  // divisão por 4). O staged draw a calcula no servidor mas o publish não a
  // carregava → após Publicar a espera sumia. Carrega aqui.
  if (pd.monarchWaitlist) t.monarchWaitlist = pd.monarchWaitlist;
  t.status = pd.status || 'active';
  t.drawVisibility = t.drawVisibility || 'public';
  // v2.7.8: PUBLICAR um sorteio automático É INICIAR o torneio — mesma regra
  // canônica de _generateNextRound (SORTEAR É INICIAR). O staged draw nasce no
  // servidor em t.pendingDraw e NUNCA passa pelo gerador no cliente (o poller
  // pula torneios staged), então tournamentStarted nunca era marcado e o banner
  // "Iniciar Torneio" reaparecia depois de Publicar. Marca aqui, no momento em
  // que o sorteio vai a público. Manual (drawManual===true) mantém o passo.
  if (t.drawManual !== true && !t.tournamentStarted) {
    var _genMs = pd.generatedAt ? new Date(pd.generatedAt).getTime() : NaN;
    t.tournamentStarted = (!isNaN(_genMs) && _genMs > 0) ? _genMs : Date.now();
  }
  t.lastAutoDrawAt = pd.generatedAt || t.lastAutoDrawAt || new Date().toISOString();
  t.pendingDraw = null;
  t.updatedAt = new Date().toISOString();
  try { await store.syncImmediate(t.id); } catch (e) { window._warn('[publishPendingDraw] save falhou', e); }
  // Agora SIM dispara as notificações (idênticas ao sorteio normal).
  var roundIndex = (typeof pd.roundIndex === 'number') ? pd.roundIndex : (t.rounds.length - 1);
  try { if (window._notifyDrawPersonalized) window._notifyDrawPersonalized(t, t.id, { type: pd.firstDraw ? 'draw' : 'new_round', roundIndex: roundIndex }); } catch (e) {}
  try { _notifyLigaRoundWhatsApp(t, roundIndex); } catch (e) {}
  if (typeof window.showNotification === 'function') window.showNotification('🚀 Sorteio publicado!', 'A chave e as notificações foram liberadas para os participantes.', 'success');
  try {
    var _vc = document.getElementById('view-container');
    var _h = (window.location && window.location.hash) || '';
    if (_vc && _h.indexOf('#tournaments/' + t.id) === 0 && typeof window.renderTournaments === 'function') window.renderTournaments(_vc, t.id);
    else if (_h.indexOf('#bracket/' + t.id) === 0 && typeof window._rerenderBracket === 'function') window._rerenderBracket(t.id);
  } catch (e) {}
};

window._annulPendingDraw = function (tId) {
  var store = window.AppStore;
  var t = store && store.tournaments.find(function (x) { return String(x.id) === String(tId); });
  if (!t || !t.pendingDraw) return;
  if (!(store.isOrganizer && store.isOrganizer(t))) return;
  var go = function () {
    t.pendingDraw = null;
    t.lastAutoDrawAt = null; // libera re-sorteio no próximo ciclo do servidor
    t.updatedAt = new Date().toISOString();
    try { store.syncImmediate(t.id); } catch (e) {}
    if (typeof window.showNotification === 'function') window.showNotification('Sorteio anulado', 'O sorteio em revisão foi descartado (nada foi publicado). Um novo será gerado automaticamente.', 'info');
    try { var _vc = document.getElementById('view-container'); if (_vc && typeof window.renderTournaments === 'function') window.renderTournaments(_vc, t.id); } catch (e) {}
  };
  if (typeof window.showConfirmDialog === 'function') {
    window.showConfirmDialog('Anular sorteio?', 'O sorteio em revisão será descartado (nada foi publicado). Um novo será gerado automaticamente no próximo ciclo.', go, null, { confirmText: 'Anular', cancelText: 'Cancelar', danger: true });
  } else { go(); }
};

// v2.7.6: ÚNICA fonte de "Pontos Corridos com sorteio AUTOMÁTICO agendado" — Liga
// (ou Ranking) + sorteio não-manual + data agendada. Definido AQUI (e não em store.js)
// de propósito: bracket-logic.js é vendored pra Cloud Function autoDraw, que não
// carrega store.js — assim cliente e CF compartilham a MESMA regra. Sem drawFirstDate
// é auto mal-configurado e cai no fallback manual (v0.16.56). Usado por tournaments.js,
// participants.js e _ligaScheduled abaixo.
window._isLigaAutoDraw = function (t) {
  return !!(t && (window._isLigaFormat && window._isLigaFormat(t)) && t.drawManual !== true && t.drawFirstDate);
};

async function _fireLigaAutoDraw(t, scheduledTime) {
  // First guard — the upstream _checkLigaAutoDraws already checks deleted
  // ids, but this function is also called directly from "generate round
  // now" paths; keep the belt-and-suspenders check.
  var _del = (window.AppStore._deletedTournamentIds || []).map(String);
  if (_del.indexOf(String(t.id)) !== -1) return;

  var hasExistingDraw = (Array.isArray(t.rounds) && t.rounds.length > 0);
  var allParts = Array.isArray(t.participants) ? t.participants.slice() : Object.values(t.participants || {});

  // Need at least 2 active participants to draw
  var activeParts = allParts.filter(function(p) {
    if (typeof p !== 'object' || !p) return true;
    return p.ligaActive !== false;
  });
  if (activeParts.length < 2) {
    window._log('[auto-draw] Skipping tournament ' + t.id + ': fewer than 2 active participants');
    return;
  }

  if (!hasExistingDraw) {
    // First draw: shuffle participants, seed standings with ALL participants
    // (inactive still appear in standings — they just sit out until reactivated)
    for (var si = allParts.length - 1; si > 0; si--) {
      var sj = Math.floor(Math.random() * (si + 1));
      var tmp = allParts[si]; allParts[si] = allParts[sj]; allParts[sj] = tmp;
    }

    t.standings = allParts.map(function(p) {
      var name = typeof p === 'string' ? p : (p.displayName || p.name || '');
      var entry = { name: name, points: 0, wins: 0, losses: 0, pointsDiff: 0, played: 0 };
      if (typeof p === 'object' && p && typeof window._getParticipantCategories === 'function') {
        var pcs = window._getParticipantCategories(p);
        if (pcs && pcs.length > 0) { entry.category = pcs[0]; entry.categories = pcs; }
      }
      return entry;
    });
    t.rounds = [];
    t.status = 'active';
    t.drawVisibility = t.drawVisibility || 'public';

    _generateNextRound(t);

    var firstRound = t.rounds[t.rounds.length - 1];
    var firstMatchCount = (firstRound && firstRound.matches || []).filter(function(m) { return !m.isSitOut; }).length;

    window.AppStore.logAction(t.id, 'Sorteio automático realizado — Rodada 1 gerada com ' + firstMatchCount + ' partida(s)');

    if (typeof window._notifyTournamentParticipants === 'function') {
      var _tFn1 = window._t || function(k, v) { return v && v.name ? v.name : k; };
      window._notifyTournamentParticipants(t, {
        type: 'draw',
        level: 'important',
        title: _tFn1('tdraw.round1NotifTitle', { name: t.name || 'Torneio' }) || ((t.name || 'Torneio') + ' — Rodada 1'),
        message: _tFn1('tdraw.round1NotifMsg', { count: firstMatchCount }) || ('Sorteio automático: ' + firstMatchCount + ' partida(s) geradas.'),
        tournamentId: t.id
      });
    }
  } else {
    // Subsequent draw — generate next round from current standings.
    // Auto-approve any pending results before drawing — if no one approved/contested
    // before the new round, system considers them approved (v0.17.27).
    if (typeof window._autoApprovePendingResults === 'function') {
      window._autoApprovePendingResults(t);
    }
    // _generateNextRound handles active-player filtering and sit-outs internally.
    _generateNextRound(t);

    var newRound = t.rounds[t.rounds.length - 1];
    var newMatchCount = (newRound && newRound.matches || []).filter(function(m) { return !m.isSitOut; }).length;

    window.AppStore.logAction(t.id, 'Rodada ' + t.rounds.length + ' gerada automaticamente com ' + newMatchCount + ' partida(s)');

    // Notify all participants — personalized per recipient
    if (typeof window._notifyDrawPersonalized === 'function') {
      window._notifyDrawPersonalized(t, t.id, { type: 'new_round', roundIndex: t.rounds.length - 1 });
    }
  }

  t.lastAutoDrawAt = scheduledTime.toISOString();
  t.updatedAt = new Date().toISOString();

  // Second guard — after all the async heavy lifting above, the user may
  // have deleted the tournament in the meantime. Bail before the save so
  // we don't recreate a deleted doc via set({merge:true}).
  var _del = (window.AppStore._deletedTournamentIds || []).map(String);
  if (_del.indexOf(String(t.id)) !== -1) {
    window._log('[auto-draw] Tournament ' + t.id + ' was deleted during draw — skipping save.');
    return;
  }
  var _stillInStore = (window.AppStore.tournaments || []).some(function(x) { return String(x.id) === String(t.id); });
  if (!_stillInStore) {
    window._log('[auto-draw] Tournament ' + t.id + ' vanished from store (listener removed it) — skipping save.');
    return;
  }

  try {
    await window.AppStore.syncImmediate(t.id);
  } catch (e) {
    window._warn('[auto-draw] syncImmediate failed for tournament ' + t.id, e);
  }

  // Notify Liga round via WhatsApp (fire-and-forget)
  _notifyLigaRoundWhatsApp(t, t.rounds ? t.rounds.length - 1 : 0);

  // Auto-refresh whatever view the user is currently looking at so the draw
  // appears without a manual reload.
  try {
    var _hash = (window.location && window.location.hash) || '';
    var _container = document.getElementById('view-container');
    if (_hash.indexOf('#tournaments/' + t.id) === 0 && typeof window.renderTournaments === 'function' && _container) {
      window.renderTournaments(_container, t.id);
    } else if (_hash.indexOf('#bracket/' + t.id) === 0 && typeof window._rerenderBracket === 'function') {
      window._rerenderBracket(t.id);
    } else if (_hash === '' || _hash === '#' || _hash.indexOf('#dashboard') === 0) {
      if (typeof window.renderDashboard === 'function' && _container) {
        window.renderDashboard(_container);
      }
    }
  } catch (e) { /* best-effort UI refresh */ }

  // Show an in-app toast for the organizer so they know the draw just happened.
  if (typeof window.showNotification === 'function') {
    var _toastTitle = hasExistingDraw
      ? ('🎲 Nova rodada sorteada — ' + (t.name || 'Torneio'))
      : ('🎲 Sorteio automático realizado — ' + (t.name || 'Torneio'));
    var _toastMsg = hasExistingDraw
      ? ('Rodada ' + t.rounds.length + ' gerada para a Liga.')
      : ('Rodada 1 gerada para a Liga.');
    window.showNotification(_toastTitle, _toastMsg, 'success');
  }
}

// ─── Liga round WhatsApp group notification ───────────────────────────────────
// Fire-and-forget: called after any Liga/Suíço round draw (manual or auto).
// Creates a WhatsApp group for each match pairing and sends a message with the
// match details and deadline (next draw date).
function _notifyLigaRoundWhatsApp(t, roundIndex) {
  // Only Liga/Suíço formats
  if (!t || !t.id) return;
  if (typeof window._isLigaFormat === 'function' && !window._isLigaFormat(t)) return;
  // Firebase functions must be available
  if (typeof firebase === 'undefined' || typeof firebase.functions !== 'function') return;
  // Compute next draw date string
  var nextDrawDateStr = 'Não agendado';
  if (typeof window._calcNextDrawDate === 'function') {
    var nd = window._calcNextDrawDate(t);
    if (nd) {
      try {
        nextDrawDateStr = nd.toLocaleDateString('pt-BR') + ' às ' + nd.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch (e) { /* keep default */ }
    }
  }
  var idx = (typeof roundIndex === 'number') ? roundIndex : ((t.rounds ? t.rounds.length - 1 : 0));
  // Call Cloud Function (non-blocking — errors only in console)
  try {
    var fn = firebase.functions().httpsCallable('notifyLeagueRoundWhatsApp');
    fn({ tournamentId: String(t.id), roundIndex: idx, nextDrawDateStr: nextDrawDateStr })
      .then(function(result) {
        var res = result && result.data;
        if (res && res.ok) {
          var created = (res.groups || []).filter(function(g) { return g.created; }).length;
          if (created > 0 && typeof window.showNotification === 'function') {
            window.showNotification('💬 WhatsApp', created + ' grupo(s) de partida criado(s) no WhatsApp', 'success');
          }
        }
      })
      .catch(function(e) {
        window._warn('[notifyLigaRoundWhatsApp] cloud function error:', e && e.message);
      });
  } catch (e) {
    window._warn('[notifyLigaRoundWhatsApp] init error:', e && e.message);
  }
}
