// tournaments-draw.js — Draw generation & bracket building (extracted from tournaments.js)
(function() {
var _t = window._t || function(k) { return k; };

// v2.6.98 — limpa TODOS os artefatos de sorteio + estado do construtor de fases +
// flags de encerramento, MANTENDO inscritos (t.participants/memberUids) e config
// (t.phases, t.scoring, categorias, tiebreakers…). Base do re-sorteio e do reset.
window._clearTournamentDraw = function (t) {
  if (!t) return;
  t.matches = [];
  t.rounds = [];
  t.groups = [];
  t.standings = null;
  t.thirdPlaceMatch = null;
  t.rodadas = null;
  // estado do construtor de fases
  t.currentPhaseIndex = 0;
  t.currentStage = null;
  t._phaseMaterialized = 0;
  // flags de encerramento / relógio
  if (t.status === 'finished') t.status = 'closed';
  t.finishedAt = null;
  t.finishNotifiedAt = null;
  t.durationMs = null;
  t.tournamentStarted = null;
  // derivados do sorteio
  t.sitOutHistory = null;
  t.ligaGhosts = null;
  t.nextDrawAt = null;
};

// v2.6.98 — "Resetar para inscrições (manter inscritos)": apaga sorteio/rodadas/
// fases e volta o torneio para inscrições ABERTAS, preservando todos os inscritos.
// Pensado para o ciclo de testes (rodar um cenário, zerar, montar outro com a mesma
// galera). Ação destrutiva → dupla confirmação.
window._resetTournamentToEnrollment = function (tId) {
  var t = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); });
  if (!t) return;
  var n = (t.participants || []).length;
  var _refresh = function () {
    var c = document.getElementById('view-container');
    if (c && typeof window.renderTournaments === 'function') window.renderTournaments(c, String(tId));
  };
  if (typeof showAlertDialog !== 'function') return;
  showAlertDialog('🔄 Resetar para inscrições?',
    'Isto apaga TODO o sorteio, rodadas e fases e volta o torneio para "inscrições abertas". Os <strong>' + n + '</strong> inscritos são MANTIDOS. Não dá pra desfazer.',
    function () {
      window._clearTournamentDraw(t);
      t.status = 'open';
      t.updatedAt = new Date().toISOString();
      var done = function () {
        if (typeof showNotification === 'function') showNotification('Torneio resetado', 'Voltou para inscrições abertas — ' + n + ' inscritos mantidos.', 'success');
        _refresh();
      };
      if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
        window.FirestoreDB.saveTournament(t).then(done).catch(function (err) { window._error && window._error('[resetToEnrollment] save error:', err); done(); });
      } else {
        try { window.AppStore.sync(); } catch (e) {}
        done();
      }
    },
    { type: 'danger', confirmText: 'Sim, resetar', cancelText: 'Cancelar' }
  );
};

// v2.7.62: DEV — simula os resultados da FASE ATUAL (só SP_TEST_IDENTITIES via
// _isTestIdentity). Preenche vencedor + placar E os horários (startedAt/resultAt)
// IGUAL ao lançamento real, com resultAt escalonado terminando AGORA — assim o
// painel de tempo da rodada congela certo (DECORRIDO→DUROU, FINAL ESTIMADO→FINAL REAL).
// Botão visível só pro dono, ao lado do "Resetar". Não toca em jogos já decididos.
window._devSimulateCurrentPhase = function (tId) {
  if (typeof window._isTestIdentity === 'function' && !window._isTestIdentity()) return;
  var t = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); });
  if (!t) return;
  function realTeam(s) { return s && s !== 'TBD' && s !== 'BYE' && s !== '—'; }
  function byeSlot(s) { return !s || s === 'BYE' || s === '—'; } // BYE/vazio (NÃO TBD — TBD = não pronto)
  var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : [];
  var todo = all.filter(function (m) {
    if (!m || m.winner || m.isSitOut || m.isBye) return false;
    var p1ok = realTeam(m.p1), p2ok = realTeam(m.p2);
    if (p1ok && p2ok) return true;            // jogo normal
    if (p1ok && byeSlot(m.p2)) return true;   // time vs BYE → time vence
    if (p2ok && byeSlot(m.p1)) return true;   // BYE vs time → time vence
    return false;                             // TBD / ambos vazios → não simula
  });
  if (!todo.length) { if (typeof showNotification === 'function') showNotification('Simular', 'Nenhum jogo pendente na fase atual.', 'info'); return; }

  var _run = function () {
    var now = Date.now();
    // janela realista: início programado da rodada atual → agora
    var startMs = now - 3 * 3600 * 1000;
    try {
      var ri = (Array.isArray(t.rounds) && t.rounds.length) ? t.rounds.length - 1 : 0;
      var fdStr = String(t.drawFirstDate || '').indexOf('T') > -1 ? t.drawFirstDate : (t.drawFirstDate ? (t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00')) : '');
      var fdMs = fdStr ? new Date(fdStr).getTime() : NaN;
      var intv = parseInt(t.drawIntervalDays) || 7; if (intv < 1) intv = 1;
      if (!isNaN(fdMs)) { var cand = fdMs + ri * intv * 86400000; if (cand < now) startMs = cand; }
    } catch (e) {}
    var span = Math.max(60000, now - startMs);
    var byId = {};
    todo.forEach(function (m, i) {
      var p1ok = realTeam(m.p1), p2ok = realTeam(m.p2);
      var s1, s2;
      if (p1ok && p2ok) {
        if (Math.random() < 0.5) { s1 = 6; s2 = Math.floor(Math.random() * 5); } else { s2 = 6; s1 = Math.floor(Math.random() * 5); }
      } else if (p1ok) { s1 = 6; s2 = 0; } else { s1 = 0; s2 = 6; } // BYE → time real vence
      m.scoreP1 = s1; m.scoreP2 = s2;
      m.winner = (s1 > s2) ? m.p1 : m.p2;
      m.draw = false;
      m.startedAt = startMs;
      m.resultAt = Math.round(startMs + ((i + 1) / todo.length) * span); // último = agora
      if (m.id != null) byId[String(m.id)] = m;
    });
    // sincroniza Rei/Rainha (monarchGroups) por id, caso sejam objetos separados de round.matches
    if (Array.isArray(t.rounds)) {
      t.rounds.forEach(function (r) {
        if (r && Array.isArray(r.monarchGroups)) {
          r.monarchGroups.forEach(function (g) {
            if (g && Array.isArray(g.matches)) g.matches.forEach(function (gm) {
              var src = (gm && gm.id != null) ? byId[String(gm.id)] : null;
              if (src && gm !== src) { gm.scoreP1 = src.scoreP1; gm.scoreP2 = src.scoreP2; gm.winner = src.winner; gm.draw = src.draw; gm.startedAt = src.startedAt; gm.resultAt = src.resultAt; }
            });
          });
        }
      });
    }
    // avança vencedores em chaves eliminatórias (não-rodada, não-grupo)
    if (typeof window._advanceWinner === 'function') {
      todo.forEach(function (m) {
        var isRound = m.roundIndex !== undefined || (Array.isArray(t.rounds) && t.rounds.some(function (r) { return (r.matches || []).some(function (rm) { return rm.id === m.id; }); }));
        var isGroup = m.group !== undefined;
        if (!isRound && !isGroup) { try { window._advanceWinner(t, m); } catch (e) {} }
      });
    }
    t.updatedAt = new Date().toISOString();
    var done = function () {
      if (typeof showNotification === 'function') showNotification('✅ Simulado', todo.length + ' jogos preenchidos com horários.', 'success');
      var c = document.getElementById('view-container');
      if (typeof window._rerenderBracket === 'function') window._rerenderBracket(String(tId));
      else if (c && typeof window.renderTournaments === 'function') window.renderTournaments(c, String(tId));
    };
    if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
      window.FirestoreDB.saveTournament(t).then(done).catch(function (err) { window._error && window._error('[devSimulate] save error:', err); done(); });
    } else { try { window.AppStore.sync(); } catch (e) {} done(); }
  };

  if (typeof showAlertDialog === 'function') {
    showAlertDialog('🎲 Simular resultados? (dev)',
      'Preenche <strong>' + todo.length + '</strong> jogos pendentes da fase atual com placar e horários aleatórios — como se tivessem sido jogados do início da rodada até agora. Jogos já decididos não são tocados.',
      _run, { type: 'warning', confirmText: 'Simular', cancelText: 'Cancelar' });
  } else { _run(); }
};

// v1.9.85: forma duplas/times preservando a IDENTIDADE (uid/email/foto) de
// cada membro. ANTES, o sorteio convertia os participantes em STRINGS de nome
// ("A / B") via name.join(' / ') — destruindo todos os uids. Consequências
// (bugs reportados): (1) memberUids encolhia e o torneio sumia para os
// participantes; (2) _resultNeedsApproval não achava o adversário (era string)
// → o placar lançado por participante ia DIRETO pra definitivo, pulando o
// fluxo de 4 fases. Agora cada time vira um OBJETO {displayName:"A / B",
// p1Name/p1Uid, p2Name/p2Uid, participants:[...]} — a geração do bracket já lê
// `displayName || name`, então nada quebra, e a identidade sobrevive.
function _formDoublesTeams(origParticipants, teamSize, teamOrigins, balanceMode) {
  var origByName = {};
  origParticipants.forEach(function(p) {
    if (p && typeof p === 'object') {
      var nm = p.displayName || p.name || '';
      if (nm) origByName[nm] = p;
    }
  });
  function mkTeamObj(memberNames) {
    var displayName = memberNames.join(' / ');
    var obj = { displayName: displayName, name: displayName };
    var subs = [];
    memberNames.forEach(function(nm, i) {
      var orig = origByName[nm] || { name: nm, displayName: nm };
      obj['p' + (i + 1) + 'Name'] = nm;
      if (orig.uid) obj['p' + (i + 1) + 'Uid'] = orig.uid;
      if (orig.email) obj['p' + (i + 1) + 'Email'] = orig.email;
      if (orig.photoURL) obj['p' + (i + 1) + 'Photo'] = orig.photoURL;
      subs.push(orig);
    });
    obj.participants = subs;
    return obj;
  }
  var individuals = [];
  var preFormed = [];
  origParticipants.forEach(function(p) {
    var name = (typeof p === 'string') ? p : (p.displayName || p.name || '');
    if (name.indexOf(' / ') !== -1) {
      // Já é um time pré-formado.
      if (p && typeof p === 'object') {
        if (!p.displayName) p.displayName = name;
        if (!p.p1Uid && !p.p2Uid) {
          // Objeto sem uids dos membros → enriquece a partir dos nomes.
          preFormed.push(Object.assign({}, p, mkTeamObj(name.split(' / ').map(function(s){ return s.trim(); }))));
        } else {
          preFormed.push(p);
        }
      } else {
        preFormed.push(mkTeamObj(name.split(' / ').map(function(s){ return s.trim(); })));
      }
    } else {
      individuals.push((p && typeof p === 'object') ? p : { name: name, displayName: name });
    }
  });
  // Embaralha individuais antes de agrupar
  for (var i = individuals.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = individuals[i]; individuals[i] = individuals[j]; individuals[j] = tmp;
  }
  var newTeams = [];
  var allMaleCount = 0;
  if (balanceMode === 'equilibrado' && teamSize === 2) {
    // v2.1.20: sorteio EQUILIBRADO — distribui não-homens (mulheres + outros)
    // pra MINIMIZAR duplas 100% masculinas. Cada não-homem "cobre" um homem.
    // Homens que sobram formam duplas masculinas (inevitável se faltarem
    // não-homens). individuals já está embaralhado, então os pools preservam
    // a aleatoriedade.
    var _isMale = function(p) { return (p && p.gender) === 'masculino'; };
    var men = [], nonMale = [];
    individuals.forEach(function(p) { (_isMale(p) ? men : nonMale).push(p); });
    individuals = [];
    var _pushTeam = function(a, b) {
      newTeams.push(mkTeamObj([a, b].map(function(g) { return g.displayName || g.name || ''; })));
      if (_isMale(a) && _isMale(b)) allMaleCount++;
    };
    while (nonMale.length && men.length) _pushTeam(nonMale.shift(), men.shift());
    while (men.length >= 2) _pushTeam(men.shift(), men.shift());       // duplas masc. (sobra)
    while (nonMale.length >= 2) _pushTeam(nonMale.shift(), nonMale.shift());
    individuals = nonMale.concat(men); // 0–1 sobra
  } else {
    while (individuals.length >= teamSize) {
      var group = individuals.splice(0, teamSize);
      var memberNames = group.map(function(g){ return g.displayName || g.name || ''; });
      newTeams.push(mkTeamObj(memberNames));
    }
  }
  if (teamOrigins) newTeams.forEach(function(to){ teamOrigins[to.displayName] = 'sorteada'; });
  return {
    participants: preFormed.concat(newTeams, individuals),
    newTeamsCount: newTeams.length,
    leftoverCount: individuals.length,
    allMaleCount: allMaleCount
  };
}
// v2.1.22: exposto pra reuso (jogos extras de tardios em torneios "expand").
window._formDoublesTeams = _formDoublesTeams;

// v2.2.46: separação por origem da dupla no modo MISTO.
// Quando t.mixedPairingSeparated está ligado, duplas formadas manualmente e
// duplas sorteadas viram CATEGORIAS distintas — o pipeline de chaveamento por
// categoria (já existente e testado) gera brackets separados, então formadas
// só enfrentam formadas e sorteadas só enfrentam sorteadas, cada lado com seu
// campeão. Cruza com categorias existentes (ex.: "Masculino · Duplas sorteadas").
// Deve ser chamado DEPOIS de _formDoublesTeams (que popula t.teamOrigins).
window._MIXED_ORIGIN_FORMED = 'Duplas formadas';
window._MIXED_ORIGIN_DRAWN = 'Duplas sorteadas';
window._applyMixedOriginCategories = function(t, participants) {
  if (!t || !Array.isArray(participants)) return;
  var origins = t.teamOrigins || {};
  var newCatSet = {};
  participants.forEach(function(p) {
    if (!p || typeof p !== 'object') return;
    var nm = p.displayName || p.name || '';
    if (nm.indexOf(' / ') === -1) return; // só duplas/times — sobra individual fica de fora
    var originLbl = (origins[nm] === 'sorteada') ? window._MIXED_ORIGIN_DRAWN : window._MIXED_ORIGIN_FORMED;
    var existing = (typeof window._getParticipantCategories === 'function') ? window._getParticipantCategories(p) : [];
    // Não cruzar com rótulos de origem já aplicados (idempotência em re-sorteio).
    existing = existing.filter(function(c) {
      return c.indexOf(window._MIXED_ORIGIN_FORMED) === -1 && c.indexOf(window._MIXED_ORIGIN_DRAWN) === -1;
    });
    var crossed = (existing.length > 0)
      ? existing.map(function(c) { return c + ' · ' + originLbl; })
      : [originLbl];
    if (typeof window._setParticipantCategories === 'function') window._setParticipantCategories(p, crossed);
    else { p.categories = crossed; p.category = crossed[0]; }
    crossed.forEach(function(c) { newCatSet[c] = true; });
  });
  var newCats = Object.keys(newCatSet);
  if (newCats.length > 0) t.combinedCategories = newCats;
};

// ─── v2.1.26: Inscritos tardios entram NA chave (integração real) ─────────────
// Em eliminatória com inscrição tardia 'expand', quando ≥4 acumulam na espera,
// formamos duplas (sorteio). Elas viram INSCRITOS (presença/W.O.) e cada par de
// duplas vira um JOGO da rodada 1 (cor roxa). A chave é então RECONSTRUÍDA pra
// próxima potência de 2: as rodadas se renomeiam sozinhas (quartas→1ª rodada,
// semis→quartas…), vencedores avançam e, ao terminar a R1, os melhores
// derrotados (originais + tardios) entram por repescagem pra fechar a potência
// de 2. Reusa o motor de repescagem/avanço que já existe.
window._createExtraGamesFromWaitlist = function(t) {
  if (!t) return 0;
  if (t.lateEnrollment !== 'expand') return 0;
  var fmt = t.format || '';
  if (fmt !== 'Eliminatórias Simples' && fmt !== 'Eliminatória Simples') return 0;
  if (Array.isArray(t.combinedCategories) && t.combinedCategories.length > 1) return 0; // multi-categoria: fora do escopo por ora
  if (!Array.isArray(t.matches) || t.matches.length === 0) return 0; // sorteio já feito
  // trava: se a R2+ já tem resultado, a qualificação fechou (não cresce mais)
  var r2HasResult = t.matches.some(function(m){ return m && m.round >= 2 && (m.winner || m.scoreP1 != null || m.scoreP2 != null || (m.sets && m.sets.length)); });
  if (r2HasResult) return 0;

  var _name = function(p){ return window._pName ? window._pName(p) : (typeof p === 'string' ? p : (p && (p.displayName || p.name) || '')); };
  var _sp = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
  var _wl = Array.isArray(t.waitlist) ? t.waitlist : [];
  var seen = {}; var pool = [];
  _sp.concat(_wl).forEach(function(p){ var n = _name(p); if (n && !seen[n]) { seen[n] = true; pool.push(p); } });
  // v2.2.39: só indivíduos PRESENTES (com check-in) e NÃO ausentes entram no
  // novo confronto. Ausentes que estão na lista de espera NÃO contam — antes
  // eram incluídos no jogo e na chave por engano. Junta-se 4 presentes.
  var _ci = t.checkedIn || {}, _ab = t.absent || {};
  pool = pool.filter(function(p){
    var n = _name(p);
    return n.indexOf(' / ') === -1 && !!_ci[n] && !_ab[n]; // só indivíduos presentes
  });
  if (pool.length < 4) return 0;

  if (!Array.isArray(t.participants)) t.participants = [];
  if (!t.teamOrigins) t.teamOrigins = {};
  var ts = Date.now();
  var created = 0;
  while (pool.length >= 4) {
    var four = pool.splice(0, 4);
    var formed = window._formDoublesTeams(four, 2, t.teamOrigins);
    var teams = (formed.participants || []).filter(function(x){ return x && (x.displayName || x.name || '').indexOf(' / ') !== -1; });
    if (teams.length < 2) break;
    var t1 = teams[0], t2 = teams[1];
    var n1 = t1.displayName || t1.name, n2 = t2.displayName || t2.name;
    // tardios viram INSCRITOS (duplas) — para aparecer na lista, marcar presença/W.O.
    [t1, t2].forEach(function(tm){
      var nm = tm.displayName || tm.name;
      var exists = t.participants.some(function(p){ var n = (typeof p === 'string') ? p : (p.displayName || p.name || ''); return n === nm; });
      if (!exists) t.participants.push(tm);
      t.teamOrigins[nm] = 'formada';
    });
    // remove os 4 da espera
    var used = four.map(_name);
    var rm = function(arr){ return Array.isArray(arr) ? arr.filter(function(p){ return used.indexOf(_name(p)) === -1; }) : arr; };
    t.standbyParticipants = rm(t.standbyParticipants);
    t.waitlist = rm(t.waitlist);
    // novo JOGO da rodada 1 (cor roxa via isExtra) — mesma apresentação dos demais
    t.matches.push({
      id: 'xr1-' + t.id + '-' + ts + '-' + created,
      round: 1, p1: n1, p2: n2, winner: null, isExtra: true,
      createdAt: new Date().toISOString()
    });
    if (window.AppStore && typeof window.AppStore.logAction === 'function') {
      window.AppStore.logAction(t.id, 'Tardios na chave (rodada 1): ' + n1 + ' vs ' + n2);
    }
    created++;
  }
  if (created > 0) {
    window._rebuildIntegratedBracket(t);
    if (typeof window._computeMemberUids === 'function') { try { window._computeMemberUids(t); } catch (e) {} }
  }
  return created;
};

// Reconstrói R2+ a partir da R1 (originais + tardios), preservando os resultados
// de R1. R2 = próxima potência de 2 dos vencedores de R1; a sobra vira repescagem
// (os melhores derrotados preenchem os slots awaitsBestLoser quando a R1 acaba,
// via _assignRepechageLosers — o mesmo motor do sorteio normal). Os nomes de
// rodada são derivados do nº de rodadas (automático no render).
window._rebuildIntegratedBracket = function(t) {
  if (!t || !Array.isArray(t.matches)) return false;
  var fmt = t.format || '';
  if (fmt !== 'Eliminatórias Simples' && fmt !== 'Eliminatória Simples') return false;
  // não reconstrói se a R2+ já tem resultado (qualificação travada)
  var r2HasResult = t.matches.some(function(m){ return m && m.round >= 2 && (m.winner || m.scoreP1 != null || m.scoreP2 != null || (m.sets && m.sets.length)); });
  if (r2HasResult) return false;
  var r1 = t.matches.filter(function(m){ return m && m.round === 1; });
  var R1count = r1.length;
  if (R1count < 2) return false;
  var r2Target = 1; while (r2Target < R1count) r2Target *= 2;
  var repechage = r2Target - R1count;

  // elegibilidade de repescagem (loser de qualquer jogo de R1) + limpa wiring
  r1.forEach(function(m){
    if (repechage > 0) m.isRepechageR1 = true; else { delete m.isRepechageR1; }
    delete m.nextMatchId; delete m.nextSlot;
  });
  // remove R2+ e 3º lugar (serão reconstruídos)
  t.matches = t.matches.filter(function(m){ return m && m.round === 1; });
  if (t.thirdPlaceMatch) delete t.thirdPlaceMatch;

  var ts = Date.now(), mc = 0;
  // slots de R2: vencedores de R1 (na ordem) + bestloser (repescagem)
  var slots = [];
  r1.forEach(function(m){ slots.push({ type: 'r1winner', fromMatch: m.id }); });
  for (var b = 0; b < repechage; b++) slots.push({ type: 'bestloser' });

  var r2games = r2Target / 2;
  var r2Matches = [];
  for (var g = 0; g < r2games; g++) {
    var s1 = slots[g * 2], s2 = slots[g * 2 + 1];
    var r2m = { id: 'ir2-' + ts + '-' + (mc++), round: 2, p1: 'TBD', p2: 'TBD', winner: null };
    var bl = [];
    if (s1 && s1.type === 'bestloser') bl.push('p1');
    if (s2 && s2.type === 'bestloser') bl.push('p2');
    if (bl.length) { r2m.awaitsBestLoser = bl.join(','); r2m.isRepechageSlot = true; }
    t.matches.push(r2m); r2Matches.push(r2m);
    if (s1 && s1.type === 'r1winner') { var src = r1.find(function(x){ return x.id === s1.fromMatch; }); if (src) { src.nextMatchId = r2m.id; src.nextSlot = 'p1'; } }
    if (s2 && s2.type === 'r1winner') { var src2 = r1.find(function(x){ return x.id === s2.fromMatch; }); if (src2) { src2.nextMatchId = r2m.id; src2.nextSlot = 'p2'; } }
  }
  // R3+ (TBD, alimentados pelos vencedores de R2)
  var prev = r2Matches, roundNum = 3, cur = r2games;
  while (cur > 1) {
    var nextCount = Math.floor(cur / 2), nextRound = [];
    for (var n = 0; n < nextCount; n++) { var nm = { id: 'ir' + roundNum + '-' + ts + '-' + (mc++), round: roundNum, p1: 'TBD', p2: 'TBD', winner: null }; t.matches.push(nm); nextRound.push(nm); }
    for (var l = 0; l < prev.length; l++) { var tgt = Math.floor(l / 2), sl = (l % 2 === 0) ? 'p1' : 'p2'; if (tgt < nextRound.length) { prev[l].nextMatchId = nextRound[tgt].id; prev[l].nextSlot = sl; } }
    prev = nextRound; cur = nextCount; roundNum++;
  }

  if (repechage > 0) {
    t.repechageConfig = {
      r1MatchIds: r1.map(function(m){ return m.id; }),
      repMatchIds: [], repParticipants: 0,
      bestLoserCount: repechage,
      bestLoserR2Ids: r2Matches.filter(function(m){ return m.awaitsBestLoser; }).map(function(m){ return m.id; }),
      eliminatedCount: R1count - repechage, spotsFromRepechage: repechage, category: ''
    };
    t.hasRepechage = true;
  } else { t.repechageConfig = null; t.hasRepechage = false; }

  // propaga os vencedores de R1 já decididos pra R2
  r1.forEach(function(m){
    if (m.winner && m.nextMatchId) {
      var nx = t.matches.find(function(x){ return x.id === m.nextMatchId; });
      if (nx) { if (m.nextSlot === 'p2') nx.p2 = m.winner; else nx.p1 = m.winner; if (typeof _autoResolveBye === 'function') _autoResolveBye(t, nx); }
    }
  });
  // se a R1 inteira já está decidida e há repescagem, preenche os melhores derrotados
  var allR1Done = r1.every(function(m){ return !!m.winner; });
  if (allR1Done && repechage > 0 && typeof _assignRepechageLosers === 'function') _assignRepechageLosers(t);
  if (typeof _maybeFinishElimination === 'function') _maybeFinishElimination(t);
  return true;
};

// ─── v2.1.20: Diálogo de gênero pré-sorteio (duplas mistas, sorteio livre) ────
// Mostra ANTES do sorteio quando: duplas (teamSize 2) formadas por pareamento de
// indivíduos, SEM categoria masc/fem separada. Deixa o organizador (a) atribuir
// gênero a inscritos sem gênero e (b) escolher Livre ou Equilibrado (evita dupla
// 100% masculina). Retorna true se exibiu o diálogo (e chamará onProceed no
// confirmar); false se não se aplica (o chamador segue o sorteio direto).
window._maybeShowGenderDrawDialog = function(tId, onProceed) {
  var t = window.AppStore && window.AppStore.tournaments &&
          window.AppStore.tournaments.find(function(x){ return String(x.id) === String(tId); });
  if (!t) return false;
  var enrMode = t.enrollmentMode || t.enrollment || 'individual';
  var teamSize = parseInt(t.teamSize) || 1;
  if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) teamSize = 2;
  if (teamSize !== 2) return false; // só duplas
  var gc = Array.isArray(t.genderCategories) ? t.genderCategories : [];
  var hasGenderSplit = gc.some(function(c){ return /masc/i.test(String(c)) || /fem/i.test(String(c)); });
  if (hasGenderSplit) return false; // já separa masc/fem por categoria → não mistura

  var parts = Array.isArray(t.participants) ? t.participants : [];
  // indivíduos a parear (sem ' / ' = ainda não estão em dupla)
  var individuals = parts.filter(function(p){
    var n = (typeof p === 'string') ? p : (p.displayName || p.name || '');
    return n.indexOf(' / ') === -1;
  });
  if (individuals.length < 2) return false; // nada pra formar dupla por sorteio

  var _sh = window._safeHtml || function(s){ return String(s == null ? '' : s); };
  var _pName = function(p){ return (typeof p === 'string') ? p : (p.displayName || p.name || p.email || '?'); };
  var _hasGender = function(p){ return typeof p === 'object' && p.gender && String(p.gender).trim(); };
  var noGender = individuals.filter(function(p){ return !_hasGender(p); });

  // Estado do diálogo
  window._gdCtx = { tId: tId, onProceed: onProceed, mode: 'livre',
    rows: noGender.map(function(p){ return { name: _pName(p), uid: (typeof p === 'object' && p.uid) || '', gender: '' }; }) };

  var old = document.getElementById('gender-draw-overlay'); if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'gender-draw-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:100200;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:3rem 1rem 2rem;';

  var rowsHtml = window._gdCtx.rows.map(function(r, i){
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-dark,#0f172a);border:1px solid rgba(255,255,255,0.08);border-radius:10px;">' +
      '<span style="flex:1;min-width:0;font-size:0.88rem;color:var(--text-bright,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _sh(r.name) + '</span>' +
      '<button id="gd-f-' + i + '" onclick="window._gdSetGender(' + i + ',\'feminino\')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(236,72,153,0.4);background:rgba(236,72,153,0.08);color:#f9a8d4;font-size:0.78rem;font-weight:700;cursor:pointer;">♀ Fem</button>' +
      '<button id="gd-m-' + i + '" onclick="window._gdSetGender(' + i + ',\'masculino\')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.08);color:#93c5fd;font-size:0.78rem;font-weight:700;cursor:pointer;">♂ Masc</button>' +
    '</div>';
  }).join('');

  ov.innerHTML =
    '<div style="background:var(--bg-card,#1e293b);border-radius:18px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,0.5);margin:auto;overflow:hidden;">' +
      '<div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
        '<div style="font-weight:800;font-size:1rem;color:var(--text-bright,#f1f5f9);">⚖️ Sorteio de duplas</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-top:3px;">Defina o gênero de quem está sem, e escolha como formar as duplas.</div>' +
      '</div>' +
      '<div style="padding:16px 18px;">' +
        (window._gdCtx.rows.length > 0
          ? '<div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted,#94a3b8);margin-bottom:8px;">Inscritos sem gênero (' + window._gdCtx.rows.length + ')</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;max-height:34vh;overflow-y:auto;margin-bottom:16px;">' + rowsHtml + '</div>'
          : '<div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);margin-bottom:14px;">Todos os inscritos já têm gênero definido. ✓</div>') +
        '<div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted,#94a3b8);margin-bottom:8px;">Modo de sorteio</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">' +
          '<button id="gd-mode-livre" onclick="window._gdSetMode(\'livre\')" style="text-align:left;padding:11px 14px;border-radius:12px;border:2px solid #6366f1;background:rgba(99,102,241,0.15);color:var(--text-bright,#f1f5f9);cursor:pointer;">' +
            '<div style="font-weight:700;font-size:0.9rem;">🎲 Livre</div><div style="font-size:0.74rem;color:var(--text-muted,#94a3b8);margin-top:2px;">Duplas formadas totalmente ao acaso.</div></button>' +
          '<button id="gd-mode-equilibrado" onclick="window._gdSetMode(\'equilibrado\')" style="text-align:left;padding:11px 14px;border-radius:12px;border:2px solid rgba(255,255,255,0.12);background:var(--bg-dark,#0f172a);color:var(--text-bright,#f1f5f9);cursor:pointer;">' +
            '<div style="font-weight:700;font-size:0.9rem;">⚖️ Equilibrado</div><div style="font-size:0.74rem;color:var(--text-muted,#94a3b8);margin-top:2px;">Evita duplas 100% masculinas (distribui as mulheres). Se faltarem, faz o melhor possível.</div></button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="document.getElementById(\'gender-draw-overlay\').remove()" style="flex:1;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:none;color:var(--text-muted,#94a3b8);cursor:pointer;font-size:0.85rem;">Cancelar</button>' +
          '<button onclick="window._gdConfirm()" style="flex:2;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-weight:800;font-size:0.88rem;cursor:pointer;">🎲 Sortear</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  return true;
};

window._gdSetGender = function(i, gender){
  if (!window._gdCtx || !window._gdCtx.rows[i]) return;
  window._gdCtx.rows[i].gender = gender;
  var f = document.getElementById('gd-f-' + i), m = document.getElementById('gd-m-' + i);
  if (f) { f.style.background = gender === 'feminino' ? 'rgba(236,72,153,0.35)' : 'rgba(236,72,153,0.08)'; f.style.borderColor = gender === 'feminino' ? '#ec4899' : 'rgba(236,72,153,0.4)'; }
  if (m) { m.style.background = gender === 'masculino' ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.08)'; m.style.borderColor = gender === 'masculino' ? '#3b82f6' : 'rgba(59,130,246,0.4)'; }
};
window._gdSetMode = function(mode){
  if (!window._gdCtx) return;
  window._gdCtx.mode = mode;
  var l = document.getElementById('gd-mode-livre'), e = document.getElementById('gd-mode-equilibrado');
  if (l) { l.style.borderColor = mode === 'livre' ? '#6366f1' : 'rgba(255,255,255,0.12)'; l.style.background = mode === 'livre' ? 'rgba(99,102,241,0.15)' : 'var(--bg-dark,#0f172a)'; }
  if (e) { e.style.borderColor = mode === 'equilibrado' ? '#22c55e' : 'rgba(255,255,255,0.12)'; e.style.background = mode === 'equilibrado' ? 'rgba(34,197,94,0.15)' : 'var(--bg-dark,#0f172a)'; }
};
window._gdConfirm = function(){
  var ctx = window._gdCtx; if (!ctx) return;
  var t = window.AppStore.tournaments.find(function(x){ return String(x.id) === String(ctx.tId); });
  if (!t) { var o0 = document.getElementById('gender-draw-overlay'); if (o0) o0.remove(); return; }
  // 1) aplica os gêneros aos objetos de participante (por uid ou nome)
  var assigned = ctx.rows.filter(function(r){ return r.gender; });
  (t.participants || []).forEach(function(p){
    if (typeof p !== 'object') return;
    var match = assigned.find(function(r){
      return (r.uid && p.uid && r.uid === p.uid) || (!r.uid && (p.displayName || p.name) === r.name);
    });
    if (match) p.gender = match.gender;
  });
  // 2) modo de sorteio
  t._drawBalanceMode = ctx.mode;
  // 3) grava no PERFIL global (via função) — só os que têm uid; fire-and-forget
  var withUid = assigned.filter(function(r){ return r.uid; }).map(function(r){ return { uid: r.uid, gender: r.gender }; });
  if (withUid.length > 0 && window.firebase && firebase.functions) {
    try {
      firebase.functions().httpsCallable('setParticipantsGender')({ tournamentId: String(ctx.tId), assignments: withUid })
        .catch(function(e){ window._warn && window._warn('[genderDraw] setParticipantsGender falhou:', e && (e.code || e.message)); });
    } catch (e) {}
  }
  // 4) persiste e segue o sorteio
  if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
    try { window.FirestoreDB.saveTournament(t); } catch (e) {}
  }
  var o = document.getElementById('gender-draw-overlay'); if (o) o.remove();
  window._gdCtx = null;
  if (typeof ctx.onProceed === 'function') ctx.onProceed();
};

window.showFinalReviewPanel = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;

    const existing = document.getElementById('final-review-panel');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'final-review-panel';
    overlay.style.cssText = 'position:fixed;inset:0;width:100vw;min-height:100vh;min-height:100dvh;background:rgba(0,0,0,0.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:0.75rem;overflow:hidden;';
    document.body.style.overflow = 'hidden';

    const tIdSafe = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    overlay.innerHTML = `
        <div style="background:var(--bg-card,#1e293b);width:94%;max-width:600px;border-radius:24px;border:1px solid rgba(34,197,94,0.3);box-shadow:0 30px 100px rgba(0,0,0,0.8);overflow:hidden;display:flex;flex-direction:column;max-height:94svh;animation:modalFadeIn 0.3s ease-out;">
            <!-- Header (sticky-like, doesn't scroll) -->
            <div style="background:linear-gradient(135deg,#14532d 0%,#22c55e 100%);padding:1rem 1.25rem;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:1.8rem;">🎉</span>
                    <div>
                        <h3 style="margin:0;color:#f0fdf4;font-size:1.05rem;font-weight:800;letter-spacing:-0.01em;">${_t('tdraw.readyTitle')}</h3>
                        <p style="margin:2px 0 0;color:#bbf7d0;font-size:0.78rem;line-height:1.35;">${_t('tdraw.readySubtitle')}</p>
                    </div>
                </div>
            </div>

            <!-- Scrollable middle -->
            <div style="overflow-y:auto;flex:1;padding:1rem 1.25rem;">
                <!-- Summary Checklist -->
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem;">
                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.enrollClosed')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.enrollClosedDesc')}</div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.teamsConsolidated')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.teamsConsolidatedDesc')}</div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.bracketStructure')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.p2AchievedVia', {resolution: window._safeHtml(t.p2Resolution || 'Natural')})}</div>
                        </div>
                    </div>
                </div>

                <!-- History / Log -->
                <div>
                    <h4 style="margin:0 0 6px;color:#94a3b8;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;">${_t('tdraw.resolutionHistory')}</h4>
                    <div style="background:rgba(0,0,0,0.2);border-radius:12px;padding:0.75rem;max-height:100px;overflow-y:auto;font-family:monospace;font-size:0.72rem;color:#cbd5e1;">
                        ${(t.history || []).slice().reverse().map(log => `
                            <div style="margin-bottom:5px;display:flex;gap:8px;">
                                <span style="color:#64748b;flex-shrink:0;">[${new Date(log.date).toLocaleTimeString()}]</span>
                                <span>${window._safeHtml(log.message)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Sticky footer (always visible) -->
            <div style="padding:0.85rem 1.25rem;border-top:1px solid rgba(255,255,255,0.08);background:var(--bg-card,#1e293b);display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
                <button onclick="window.generateDrawFunction('${tIdSafe}')" style="background:linear-gradient(135deg,#16a34a,#22c55e);color:white;border:none;padding:13px;border-radius:14px;font-weight:800;font-size:1rem;cursor:pointer;box-shadow:0 8px 24px rgba(34,197,94,0.3);display:flex;align-items:center;justify-content:center;gap:8px;">
                    <span>🎲</span> ${_t('tdraw.rollDrawNow')}
                </button>
                <button onclick="document.getElementById('final-review-panel').remove();document.body.style.overflow='';" style="background:rgba(255,255,255,0.05);color:#94a3b8;border:none;padding:10px;border-radius:10px;font-weight:600;font-size:0.85rem;cursor:pointer;">
                    ${_t('tdraw.backAndReview')}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};


window.generateDrawFunction = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;

    // ── Proteção contra re-sorteio acidental ────────────────────────
    var _hasExistingDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
        (Array.isArray(t.rounds) && t.rounds.length > 0) ||
        (Array.isArray(t.groups) && t.groups.length > 0);
    if (_hasExistingDraw) {
        // Check if any match has a result recorded — use canonical collector
        // so results hiding in t.groups[].matches, t.thirdPlaceMatch, or
        // t.rodadas can't be silently overwritten by a redraw.
        var _hasResults = false;
        if (typeof window._collectAllMatches === 'function') {
            _hasResults = window._collectAllMatches(t).some(function(m) {
                return m && (m.winner || m.score1 || m.score2);
            });
        } else {
            // Defensive fallback: bracket-model.js not loaded.
            if (Array.isArray(t.matches)) {
                _hasResults = t.matches.some(function(m) { return m.winner || m.score1 || m.score2; });
            }
            if (!_hasResults && Array.isArray(t.rounds)) {
                _hasResults = t.rounds.some(function(r) {
                    return (r.matches || []).some(function(m) { return m.winner || m.score1 || m.score2; });
                });
            }
        }
        if (_hasResults) {
            showAlertDialog(_t('draw.alreadyDoneTitle'),
                _t('draw.alreadyDoneMsg'),
                function() {
                    // User confirmed — allow redraw by clearing existing data
                    // v2.6.98: limpa TAMBÉM estado de fase/encerramento (re-sortear um
                    // torneio multi-fase precisa voltar à Fase 0, senão fica resíduo).
                    window._clearTournamentDraw(t);
                    window.generateDrawFunction(tId);
                },
                { type: 'danger', confirmText: _t('draw.alreadyDoneConfirm'), cancelText: _t('btn.cancel') }
            );
            return;
        }
        // Draw exists but no results yet — warn but lighter
        showAlertDialog(_t('draw.redrawTitle'),
            _t('draw.redrawMsg'),
            function() {
                window._clearTournamentDraw(t);
                window.generateDrawFunction(tId);
            },
            { type: 'warning', confirmText: _t('draw.redrawConfirm'), cancelText: _t('draw.redrawCancel') }
        );
        return;
    }

    // Store active tournament ID for views that need it
    window._lastActiveTournamentId = tId;

    // ── Fix orphaned names + Deduplicação de participantes ────
    if (typeof window._fixOrphanedMatchNames === 'function') window._fixOrphanedMatchNames(t);
    if (typeof window._deduplicateParticipants === 'function') {
        var _dupCount = window._deduplicateParticipants(t);
        if (_dupCount > 0) {
            window.FirestoreDB.saveTournament(t);
            showNotification(_t('tdraw.dupsRemoved'), _t('tdraw.dupsRemovedMsg', { n: _dupCount }), 'info');
        }
    }

    // ── Times incompletos: tratados pelo painel unificado (_showRemainderPanel)
    //    chamado via showUnifiedResolutionPanel em _handleSortearClick. Aqui
    //    não precisamos mais interceptar — se chegou até generateDrawFunction,
    //    o organizador já decidiu o que fazer com o resto.

    // ── Verificação de número ímpar (formatos não-eliminatórios, exceto Grupos, Suíço e Liga) ──────
    const isElim = t.format === 'Eliminatórias Simples' || t.format === 'Dupla Eliminatória';
    const isGruposFmt = t.format === 'Fase de Grupos + Eliminatórias' || (t.format || '').indexOf('Grupo') !== -1;
    const isSuicoOrLiga = t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss' || t.currentStage === 'swiss' || (window._isLigaFormat && window._isLigaFormat(t));
    if (!isElim && !isGruposFmt && !isSuicoOrLiga && !t.oddResolution && typeof window.checkOddEntries === 'function') {
        const oddInfo = window.checkOddEntries(t);
        if (oddInfo.isOdd) {
            window.showOddEntriesPanel(tId);
            return;
        }
    }

    // ── Verificação de potência de 2 para eliminatórias (não Grupos) ──────────────
    if (isElim && !isGruposFmt && !t.p2Resolution) {
        const info = window.checkPowerOf2(t);
        if (info.count < 2) {
            const _label = (info.teamSize > 1) ? 'times' : 'participantes';
            showAlertDialog(_t('draw.tooFewTitle'), _t('draw.tooFewDrawMsg', { label: _label }), null, { type: 'warning' });
            return;
        }
        if (!info.isPowerOf2) {
            window.showPowerOf2Panel(tId);
            return;
        }
    }

    // ── Validação: participantes sem categoria (quando torneio tem MÚLTIPLAS categorias) ─
    // Categoria única (ex: Misto isolado) → todos participam da mesma → sem checagem.
    var _tournHasCats = Array.isArray(t.combinedCategories) && t.combinedCategories.length > 1;
    if (_tournHasCats) {
        var _allParts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
        var _noCat = _allParts.filter(function(p) {
            if (typeof p !== 'object') return true;
            var cats = window._getParticipantCategories(p);
            return cats.length === 0;
        });
        if (_noCat.length > 0) {
            var _names = _noCat.map(function(p) {
                return typeof p === 'string' ? p : (p.displayName || p.name || '?');
            }).slice(0, 5).join(', ');
            var _extra = _noCat.length > 5 ? ' e mais ' + (_noCat.length - 5) + '...' : '';
            showAlertDialog(_t('draw.noCatTitle'),
                _t('draw.noCatMsg', { n: _noCat.length, names: _names, extra: _extra }),
                function() {
                    // User chose to proceed anyway — continue draw
                    t._skipCatValidation = true;
                    window.generateDrawFunction(tId);
                },
                { type: 'warning', confirmText: _t('draw.noCatConfirm'), cancelText: _t('btn.back') }
            );
            if (!t._skipCatValidation) return;
            delete t._skipCatValidation;
        }
    }

    // Divulgação sempre imediata a todos
    if (!t.drawVisibility) {
        t.drawVisibility = 'public';
    }

    // ── Liga / Suíço Puro / Ranking: generate first round standings ──────────────────
    // Note: Swiss-as-p2Resolution (t.p2Resolution === 'swiss') is handled separately below
    if ((window._isLigaFormat(t) || t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss') && !t.p2Resolution) {
        let participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});

        // Shuffle participants
        for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
        }

        // Initialize standings (with category if applicable)
        t.standings = participants.map(p => {
            const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
            var entry = { name, points: 0, wins: 0, losses: 0, pointsDiff: 0, played: 0 };
            if (typeof p === 'object') {
                var _pcs = window._getParticipantCategories(p);
                if (_pcs.length > 0) { entry.category = _pcs[0]; entry.categories = _pcs; }
            }
            return entry;
        });
        t.rounds = [];
        t.status = 'active';

        // Generate first round using Swiss pairing (respects categories automatically)
        _generateNextRound(t);

        var _roundMatchCount = (t.rounds[0].matches || []).filter(function(m) { return !m.isSitOut; }).length;
        var _roundSitOuts = (t.rounds[0].matches || []).filter(function(m) { return m.isSitOut; }).length;
        window.AppStore.logAction(tId, `Sorteio Realizado — ${t.format}: Rodada 1 gerada com ${_roundMatchCount} partida(s)` + (_roundSitOuts ? ` e ${_roundSitOuts} folga(s)` : ''));

        if (document.getElementById('final-review-panel')) document.getElementById('final-review-panel').remove(); document.body.style.overflow = '';
        showNotification(_t('tdraw.started'), _t('tdraw.startedMsg', { n: _roundMatchCount }), 'success');

        // Notify all participants — personalized per recipient (shows their match)
        if (typeof window._notifyDrawPersonalized === 'function') {
            window._notifyDrawPersonalized(t, tId);
        }

        // Save immediately to Firestore, then navigate
        window.AppStore.syncImmediate(tId).then(function() {
            // Notify Liga round via WhatsApp (fire-and-forget)
            if (typeof _notifyLigaRoundWhatsApp === 'function') {
                _notifyLigaRoundWhatsApp(t, 0);
            }
            window.location.hash = `#bracket/${tId}`;
        });
        return;
    }

    // ── Rei/Rainha da Praia ──────────────────────────────────────────
    if (t.format === 'Rei/Rainha da Praia') {
        let participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});
        const getName = (p) => typeof p === 'string' ? p : (p.displayName || p.name || '');

        // Shuffle
        for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
        }

        if (participants.length < 4) {
            showAlertDialog(_t('monarch.minParticipantsTitle'), _t('monarch.minParticipants'), null, { type: 'warning' });
            return;
        }

        const numGroups = Math.floor(participants.length / 4);
        const remainder = participants.length % 4;
        const groups = [];
        const ts = Date.now();

        for (let g = 0; g < numGroups; g++) {
            const players = [getName(participants[g*4]), getName(participants[g*4+1]), getName(participants[g*4+2]), getName(participants[g*4+3])];
            const [A, B, C, D] = players;
            groups.push({
                name: window._groupName(g),
                players: players,
                rounds: [{
                    round: 1, status: 'active',
                    matches: [
                        { id: 'monarch-g'+g+'-m0-'+ts, team1:[A,B], team2:[C,D], p1:A+' / '+B, p2:C+' / '+D, scoreP1:null, scoreP2:null, winner:null, group:g, matchIndex:0, isMonarch:true },
                        { id: 'monarch-g'+g+'-m1-'+ts, team1:[A,C], team2:[B,D], p1:A+' / '+C, p2:B+' / '+D, scoreP1:null, scoreP2:null, winner:null, group:g, matchIndex:1, isMonarch:true },
                        { id: 'monarch-g'+g+'-m2-'+ts, team1:[A,D], team2:[B,C], p1:A+' / '+D, p2:B+' / '+C, scoreP1:null, scoreP2:null, winner:null, group:g, matchIndex:2, isMonarch:true }
                    ]
                }],
                individualStandings: players.map(function(n) { return { name:n, wins:0, losses:0, pointsFor:0, pointsAgainst:0, played:0 }; })
            });
        }

        // Remainder players join last group (5-player group with more rotations) or show warning
        if (remainder > 0) {
            showNotification(_t('draw.warning'), _t('tdraw.monarchWarningMsg', { n: remainder }), 'warning');
        }

        t.groups = groups;
        t.currentStage = 'groups';
        t.status = 'active';
        window.AppStore.logAction(tId, _t('monarch.drawDone') + ' — ' + numGroups + ' grupos de 4');

        // Notify participants — personalized per recipient
        if (typeof window._notifyDrawPersonalized === 'function') {
            window._notifyDrawPersonalized(t, tId);
        }
        if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
            window.FirestoreDB.saveTournament(t).then(function() {
                showNotification(_t('monarch.drawDone'), _t('monarch.groupsFormed', {count: numGroups}), 'success');
                window.location.hash = '#bracket/' + tId;
            });
        } else {
            window.FirestoreDB.saveTournament(t);
            showNotification(_t('monarch.drawDone'), _t('monarch.groupsFormed', {count: numGroups}), 'success');
            window.location.hash = '#bracket/' + tId;
        }
        return;
    }

    // ── Fase de Grupos + Eliminatórias ──────────────────────────────
    if (t.format === 'Fase de Grupos + Eliminatórias') {
        let participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});
        const getName = (p) => typeof p === 'string' ? p : (p.displayName || p.name || '');

        // --- Team formation (when teamSize > 1) ---
        let _grpTeamSize = parseInt(t.teamSize) || 1;
        const _grpEnrMode = t.enrollmentMode || t.enrollment || 'individual';
        if ((_grpEnrMode === 'time' || _grpEnrMode === 'misto') && _grpTeamSize < 2) {
            _grpTeamSize = 2;
        }
        if (_grpTeamSize > 1) {
            // v1.9.85: times como OBJETOS preservando uid/email (helper compartilhado).
            if (!t.teamOrigins) t.teamOrigins = {};
            const _grpFormed = _formDoublesTeams(participants, _grpTeamSize, t.teamOrigins);
            participants = _grpFormed.participants;
            t.participants = participants;
            if (_grpFormed.newTeamsCount > 0) {
                window.AppStore.logAction(tId, `Sorteio de times: ${_grpFormed.newTeamsCount} time(s) de ${_grpTeamSize} formado(s)`);
            }
        }

        // Convert participants to name strings
        let _grpNames = participants.map(p => getName(p));

        // Shuffle
        for (let i = _grpNames.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [_grpNames[i], _grpNames[j]] = [_grpNames[j], _grpNames[i]];
        }

        const numGroups = t.gruposCount || 4;
        const classifiedPerGroup = t.gruposClassified || 2;

        // Distribute participants into groups (snake draft)
        const groups = Array.from({ length: numGroups }, (_, i) => ({
            name: window._groupName(i),
            participants: [],
            standings: [],
            rounds: []
        }));

        _grpNames.forEach((name, idx) => {
            groups[idx % numGroups].participants.push(name);
        });

        // Generate round-robin matches within each group
        groups.forEach((g, gi) => {
            const players = g.participants;
            const n = players.length;
            // Round-robin: each pair plays once
            const matchesForGroup = [];
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    matchesForGroup.push({
                        id: `grp${gi}-m${i}v${j}-${Date.now()}`,
                        p1: players[i],
                        p2: players[j],
                        winner: null,
                        group: gi,
                        label: `${window._safeHtml(g.name)} • ${window._safeHtml(players[i])} vs ${window._safeHtml(players[j])}`
                    });
                }
            }
            // Split into rounds (n-1 rounds for even, n rounds for odd)
            const roundCount = n % 2 === 0 ? n - 1 : n;
            const matchesPerRound = Math.floor(n / 2);
            const assigned = new Set();
            for (let r = 0; r < roundCount; r++) {
                const roundMatches = [];
                matchesForGroup.forEach(m => {
                    if (assigned.has(m.id)) return;
                    if (roundMatches.length >= matchesPerRound) return;
                    const playersInRound = roundMatches.flatMap(rm => [rm.p1, rm.p2]);
                    if (playersInRound.includes(m.p1) || playersInRound.includes(m.p2)) return;
                    m.roundIndex = g.rounds.length + r;
                    roundMatches.push(m);
                    assigned.add(m.id);
                });
                if (roundMatches.length > 0) {
                    g.rounds.push({
                        round: r + 1,
                        status: r === 0 ? 'active' : 'pending',
                        matches: roundMatches
                    });
                }
            }
            // Any remaining unassigned matches go into extra rounds
            const remaining = matchesForGroup.filter(m => !assigned.has(m.id));
            if (remaining.length > 0) {
                g.rounds.push({
                    round: g.rounds.length + 1,
                    status: 'pending',
                    matches: remaining
                });
            }

            // Initialize standings
            g.standings = players.map(name => ({
                name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0
            }));
        });

        t.groups = groups;
        t.gruposClassified = classifiedPerGroup;
        t.currentStage = 'groups';
        t.status = 'active';

        window.AppStore.logAction(tId, `Sorteio Realizado — ${numGroups} grupos criados com rodízio interno`);

        if (document.getElementById('final-review-panel')) document.getElementById('final-review-panel').remove(); document.body.style.overflow = '';
        showNotification(_t('tdraw.groupsStarted'), _t('tdraw.groupsStartedMsg', { n: numGroups }), 'success');
        // Notify participants — personalized per recipient
        if (typeof window._notifyDrawPersonalized === 'function') {
            window._notifyDrawPersonalized(t, tId);
        }
        window.AppStore.syncImmediate(tId).then(function() {
            window.location.hash = `#bracket/${tId}`;
        });
        return;
    }

    let participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});

    // --- ETAPA 1: Formação de Times (quando teamSize > 1) ---
    let teamSize = parseInt(t.teamSize) || 1;
    // Fallback: se modo de inscrição é time/misto mas teamSize ficou 1, forçar mínimo 2
    const enrMode = t.enrollmentMode || t.enrollment || 'individual';
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) {
        teamSize = 2;
    }
    if (teamSize > 1) {
        // v1.9.85: times como OBJETOS preservando uid/email (helper compartilhado).
        if (!t.teamOrigins) t.teamOrigins = {};
        const _formed = _formDoublesTeams(participants, teamSize, t.teamOrigins, t._drawBalanceMode);
        participants = _formed.participants;
        t.participants = participants;
        if (_formed.newTeamsCount > 0) {
            window.AppStore.logAction(tId, `Sorteio de times: ${_formed.newTeamsCount} time(s) de ${teamSize} formado(s) ${t._drawBalanceMode === 'equilibrado' ? 'em modo equilibrado' : 'aleatoriamente'}`);
        }
        // v2.1.20: aviso melhor-esforço quando o equilibrado não conseguiu evitar
        // todas as duplas 100% masculinas (faltaram mulheres/não-homens).
        if (t._drawBalanceMode === 'equilibrado' && _formed.allMaleCount > 0 && typeof showNotification !== 'undefined') {
            showNotification('⚖️ Sorteio equilibrado', _formed.allMaleCount + ' dupla(s) ficaram 100% masculinas — não havia mulheres suficientes pra cobrir todas.', 'warning');
        }
        if (_formed.leftoverCount > 0) {
            window.AppStore.logAction(tId, `${_formed.leftoverCount} jogador(es) sem time completo (sobra)`);
        }
    }

    // v2.2.46: modo misto com "separar por origem" → duplas formadas e sorteadas
    // viram categorias distintas (brackets separados). Aplica-se a eliminatória
    // (simples/dupla) e suíço; grupos/liga seguem regra antiga (sem separação).
    if (t.mixedPairingSeparated && enrMode === 'misto' && teamSize === 2 && typeof window._applyMixedOriginCategories === 'function') {
        window._applyMixedOriginCategories(t, participants);
    }

    // 1. Shuffling agora é feito por categoria dentro do loop de geração de matches

    // 2. Handle Swiss/Classificatória — classification phase before elimination
    if (t.p2Resolution === 'swiss') {
        var _swissNames = participants.map(function(p) {
            return typeof p === 'string' ? p : (p.displayName || p.name || '');
        });
        // Shuffle
        for (var _si = _swissNames.length - 1; _si > 0; _si--) {
            var _sj = Math.floor(Math.random() * (_si + 1));
            var _stmp = _swissNames[_si]; _swissNames[_si] = _swissNames[_sj]; _swissNames[_sj] = _stmp;
        }
        // Initialize standings
        t.standings = _swissNames.map(function(name) {
            return { name: name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0 };
        });
        t.rounds = [];
        t.status = 'active';
        t.currentStage = 'swiss';
        t.classifyFormat = 'swiss';
        // Calculate target: nearest power-of-2 below participant count
        var _swCount = _swissNames.length;
        var _swLo = 1;
        while (_swLo * 2 <= _swCount) _swLo *= 2;
        t.p2TargetCount = _swLo;
        // Swiss rounds: use organizer-selected value if set, otherwise ceil(log2(participants))
        if (!t.swissRounds || t.swissRounds < 2) {
            t.swissRounds = Math.max(2, Math.ceil(Math.log2(_swCount)));
        }
        // Generate first Swiss round
        _generateNextRound(t);

        var _swRoundMatches = (t.rounds[0] && t.rounds[0].matches || []).filter(function(m) { return !m.isSitOut; }).length;
        if (document.getElementById('final-review-panel')) document.getElementById('final-review-panel').remove(); document.body.style.overflow = '';
        showNotification(_t('tdraw.swissStarted'), _t('tdraw.swissStartedMsg', { rounds: t.swissRounds, n: _swRoundMatches, lo: _swLo, format: t.format || 'Eliminatórias' }), 'success');
        // Notify participants — personalized per recipient
        if (typeof window._notifyDrawPersonalized === 'function') {
            window._notifyDrawPersonalized(t, tId);
        }
        window.AppStore.syncImmediate(tId).then(function() {
            // Notify Liga round via WhatsApp if this is a Liga/Suíço tournament (fire-and-forget)
            if (typeof _notifyLigaRoundWhatsApp === 'function') {
                _notifyLigaRoundWhatsApp(t, 0);
            }
            window.location.hash = '#bracket/' + tId;
        });
        return;
    }

    // 3. Handle Elimination (Simples/Dupla)
    let matches = [];
    const timestamp = Date.now();
    const isDupla = t.format === 'Dupla Eliminatória';
    const getName = (p) => typeof p === 'string' ? p : (p.displayName || p.name);

    // ── Agrupar por categoria (se houver) ───────────────────────────
    var _hasCats = Array.isArray(t.combinedCategories) && t.combinedCategories.length > 0;
    var _catGroups = {};
    if (_hasCats) {
        // Build map: category → [participants]
        t.combinedCategories.forEach(function(cat) { _catGroups[cat] = []; });
        participants.forEach(function(p) {
            var pCats = (typeof p === 'object') ? window._getParticipantCategories(p) : [];
            if (pCats.length > 0) {
                pCats.forEach(function(c) {
                    if (_catGroups[c]) _catGroups[c].push(p);
                });
            } else {
                // Participante sem categoria: incluir no primeiro grupo (fallback)
                var firstCat = t.combinedCategories[0];
                _catGroups[firstCat].push(p);
            }
        });
        // Remove categorias vazias
        t.combinedCategories.forEach(function(cat) {
            if (_catGroups[cat].length === 0) delete _catGroups[cat];
        });
    } else {
        _catGroups[''] = participants;
    }

    // ── Gerar chaveamento para cada categoria ───────────────────────
    var _matchCounter = 0;
    Object.keys(_catGroups).forEach(function(catName) {
        var catParticipants = _catGroups[catName];

        // Shuffle dentro da categoria
        if (!t.p2OrderedList) {
            for (var si = catParticipants.length - 1; si > 0; si--) {
                var sj = Math.floor(Math.random() * (si + 1));
                var tmp = catParticipants[si];
                catParticipants[si] = catParticipants[sj];
                catParticipants[sj] = tmp;
            }
        }

        // BYE handling por categoria — interleave for proper bracket distribution
        if (t.p2Resolution === 'bye') {
            var catLen = catParticipants.length;
            var catTarget = 1;
            while (catTarget < catLen) catTarget *= 2;
            var catByes = catTarget - catLen;
            if (catByes > 0) {
                // Split: players for real matches vs players who get BYEs
                // realMatches = catTarget/2 - catByes = matches with 2 real players
                // byeMatches = catByes = matches with 1 real + 1 BYE
                var _realMatchCount = catTarget / 2 - catByes;
                var _realMatchPlayers = _realMatchCount * 2; // these play each other
                var _byePlayers = catByes; // these get auto-advance

                var _rmGroup = catParticipants.slice(0, _realMatchPlayers);
                var _byGroup = catParticipants.slice(_realMatchPlayers);

                // VIP priority: move VIPs to BYE group so they auto-advance
                var _vips = t.vips || {};
                var _gn = function(p) { return typeof p === 'string' ? p : (p.displayName || p.name || ''); };
                if (Object.keys(_vips).length > 0) {
                    // Find VIPs in real match group and swap with non-VIPs in bye group
                    for (var _vi2 = 0; _vi2 < _rmGroup.length; _vi2++) {
                        var _vn = _gn(_rmGroup[_vi2]);
                        if (_vips[_vn]) {
                            // Find a non-VIP in bye group to swap with
                            for (var _bj = 0; _bj < _byGroup.length; _bj++) {
                                if (!_vips[_gn(_byGroup[_bj])]) {
                                    var _swpTmp = _rmGroup[_vi2];
                                    _rmGroup[_vi2] = _byGroup[_bj];
                                    _byGroup[_bj] = _swpTmp;
                                    break;
                                }
                            }
                        }
                    }
                }

                // Build interleaved array: alternate [real pair, bye pair]
                // This ensures R2 cross-seeding: each R2 match gets 1 R1 winner + 1 BYE winner
                var _newArr = [];
                var _rIdx = 0; // index into real match players (step 2)
                var _bIdx = 0; // index into bye players
                while (_rIdx < _rmGroup.length || _bIdx < _byGroup.length) {
                    // Add a real match pair
                    if (_rIdx < _rmGroup.length) {
                        _newArr.push(_rmGroup[_rIdx++]);
                        _newArr.push(_rmGroup[_rIdx++]);
                    }
                    // Add a BYE match pair
                    if (_bIdx < _byGroup.length) {
                        _newArr.push(_byGroup[_bIdx++]);
                        _newArr.push('BYE (Avança Direto)');
                    }
                }
                catParticipants = _newArr;
            }
        }

        // ── Repescagem (true repechage): ALL play R1, losers get 2nd chance ──
        // System: best R1 losers go to repechage. Repechage winners qualify.
        // If odd spots needed: best repechage loser (by R1 score) also qualifies.
        // NO BYEs — worst R1 loser(s) are eliminated immediately.
        if (t.p2Resolution === 'playin') {
            var catLen = catParticipants.length;
            if (catLen >= 3) {
                var r1MatchCount = Math.floor(catLen / 2);
                var r1Winners = r1MatchCount;
                var hasOddBye = (catLen % 2 !== 0);
                if (hasOddBye) r1Winners++;

                var r2Target = 1;
                while (r2Target < r1Winners) r2Target *= 2;
                var spotsFromRepechage = r2Target - r1Winners;

                if (spotsFromRepechage > 0 && r1MatchCount > 0) {
                    // ── Step 1: Generate R1 matches (ALL participants play) ──
                    var r1MatchIds = [];
                    for (var ri1 = 0; ri1 < catParticipants.length - 1; ri1 += 2) {
                        var rp1 = catParticipants[ri1];
                        var rp2 = catParticipants[ri1 + 1];
                        var r1m = {
                            id: 'match-r1-' + timestamp + '-' + _matchCounter,
                            round: 1,
                            bracket: isDupla ? 'upper' : undefined,
                            p1: getName(rp1),
                            p2: getName(rp2),
                            winner: null,
                            isRepechageR1: true
                        };
                        if (catName) r1m.category = catName;
                        matches.push(r1m);
                        r1MatchIds.push(r1m.id);
                        _matchCounter++;
                    }
                    var byePlayer = null;
                    if (hasOddBye) {
                        byePlayer = getName(catParticipants[catParticipants.length - 1]);
                    }

                    // ── Step 2: SEM jogos de repescagem (v1.0.66 spec) ──
                    // Algoritmo simplificado: os `spotsFromRepechage` melhores
                    // derrotados da R1 vão DIRETO pro bracket por seleção
                    // (menor margem de derrota). Sem partidas de repescagem.
                    var r1Losers = r1MatchCount; // total losers from R1
                    var repMatchCount = 0; // sem jogos de repescagem
                    var repMatchIds = [];
                    var bestLoserCount = spotsFromRepechage; // todos os spots vão direto pra bestloser
                    var eliminatedCount = r1Losers - bestLoserCount; // worst losers eliminados

                    // ── Step 3: Generate R2 matches ──
                    var r2Slots = [];
                    for (var rw = 0; rw < r1MatchIds.length; rw++) {
                        r2Slots.push({ tbd: true, fromMatch: r1MatchIds[rw], type: 'r1winner' });
                    }
                    if (byePlayer) {
                        r2Slots.push({ name: byePlayer, type: 'bye' });
                    }
                    // Best-loser slots → R2 (preenchidos após R1 completar via _assignRepechageLosers)
                    var bestLoserR2Ids = [];
                    for (var bl = 0; bl < bestLoserCount; bl++) {
                        r2Slots.push({ tbd: true, type: 'bestloser' });
                    }

                    // v1.0.71-beta: pareamento sequencial. Vencedor 1 vs
                    // Vencedor 2, Vencedor 3 vs Vencedor 4, ... Best losers
                    // preenchem em sequência. BYE sempre na ÚLTIMA posição.
                    var r2OrderedSlots = [];
                    // R1 winners primeiro (na ordem dos jogos)
                    r2Slots.forEach(function(s) {
                        if (s.type === 'r1winner') r2OrderedSlots.push(s);
                    });
                    // Best losers / repqualifier no meio
                    r2Slots.forEach(function(s) {
                        if (s.type === 'bestloser' || s.type === 'repqualifier') r2OrderedSlots.push(s);
                    });
                    // BYE no FINAL (última posição absoluta)
                    r2Slots.forEach(function(s) {
                        if (s.type === 'bye') r2OrderedSlots.push(s);
                    });
                    var r2Pairs = [];
                    for (var pIdx = 0; pIdx + 1 < r2OrderedSlots.length; pIdx += 2) {
                        r2Pairs.push({ p1: r2OrderedSlots[pIdx], p2: r2OrderedSlots[pIdx + 1] });
                    }

                    // Generate R2 match objects
                    for (var r2i = 0; r2i < r2Pairs.length; r2i++) {
                        var rp = r2Pairs[r2i];
                        var r2p1Name = rp.p1.name || 'TBD';
                        var r2p2Name = rp.p2.name || 'TBD';
                        var r2m = {
                            id: 'match-r2-' + timestamp + '-' + _matchCounter,
                            round: 2,
                            bracket: isDupla ? 'upper' : undefined,
                            p1: r2p1Name,
                            p2: r2p2Name,
                            winner: null
                        };
                        if (catName) r2m.category = catName;
                        // v1.0.73-beta: marca AMBOS os slots quando p1 E p2
                        // são bestloser (acontece quando há 2+ best losers no
                        // final da ordem). Antes só um era marcado, deixando
                        // o outro como "A definir" pra sempre.
                        var _bestLoserSlots = [];
                        if (rp.p1.type === 'bestloser') _bestLoserSlots.push('p1');
                        if (rp.p2.type === 'bestloser') _bestLoserSlots.push('p2');
                        if (_bestLoserSlots.length > 0) r2m.awaitsBestLoser = _bestLoserSlots.join(',');
                        // v1.0.67-beta: mark slots that came from BYE — usado
                        // pelo renderMatchCard pra exibir tag "BYE" só nesta
                        // rodada (rodadas seguintes, vitórias normais não
                        // sinalizam mais).
                        if (rp.p1.type === 'bye') r2m.p1FromBye = true;
                        if (rp.p2.type === 'bye') r2m.p2FromBye = true;
                        matches.push(r2m);
                        _matchCounter++;

                        // Link sources → R2
                        if (rp.p1.tbd && rp.p1.fromMatch) {
                            var srcM1 = matches.find(function(m) { return m.id === rp.p1.fromMatch; });
                            if (srcM1) { srcM1.nextMatchId = r2m.id; srcM1.nextSlot = 'p1'; }
                        }
                        if (rp.p2.tbd && rp.p2.fromMatch) {
                            var srcM2 = matches.find(function(m) { return m.id === rp.p2.fromMatch; });
                            if (srcM2) { srcM2.nextMatchId = r2m.id; srcM2.nextSlot = 'p2'; }
                        }
                        // Track best-loser R2 match IDs
                        if (rp.p1.type === 'bestloser' || rp.p2.type === 'bestloser') {
                            bestLoserR2Ids.push(r2m.id);
                        }
                    }

                    // ── Step 4: Generate remaining rounds (R3+) ──
                    var currentRoundMatches = r2Pairs.length;
                    var roundNum = 3;
                    var prevRoundR = matches.filter(function(m) { return m.round === 2 && (!catName || m.category === catName); });
                    while (currentRoundMatches > 1) {
                        var nextRoundCount = Math.floor(currentRoundMatches / 2);
                        var nextRoundMatches = [];
                        for (var nr = 0; nr < nextRoundCount; nr++) {
                            var nrm = {
                                id: 'match-r' + roundNum + '-' + timestamp + '-' + _matchCounter,
                                round: roundNum,
                                bracket: isDupla ? 'upper' : undefined,
                                p1: 'TBD',
                                p2: 'TBD',
                                winner: null
                            };
                            if (catName) nrm.category = catName;
                            matches.push(nrm);
                            nextRoundMatches.push(nrm);
                            _matchCounter++;
                        }
                        for (var lnk = 0; lnk < prevRoundR.length; lnk++) {
                            var tgtNr = Math.floor(lnk / 2);
                            var tgtSl = (lnk % 2 === 0) ? 'p1' : 'p2';
                            if (tgtNr < nextRoundMatches.length) {
                                prevRoundR[lnk].nextMatchId = nextRoundMatches[tgtNr].id;
                                prevRoundR[lnk].nextSlot = tgtSl;
                            }
                        }
                        prevRoundR = nextRoundMatches;
                        currentRoundMatches = nextRoundCount;
                        roundNum++;
                    }

                    // Store repechage config for bracket-logic.js advancement
                    // v1.0.66-beta: repMatchIds vazio (sem jogos de repescagem),
                    // todos os spots vão direto via bestLoser. repParticipants
                    // mantido = 0 pra compat.
                    t.repechageConfig = {
                        r1MatchIds: r1MatchIds,
                        repMatchIds: repMatchIds, // []
                        repParticipants: 0,
                        bestLoserCount: bestLoserCount,
                        bestLoserR2Ids: bestLoserR2Ids,
                        eliminatedCount: eliminatedCount,
                        spotsFromRepechage: spotsFromRepechage,
                        category: catName || ''
                    };
                    t.hasRepechage = true;
                    return; // continue to next category via forEach callback
                }
            }
        }

        // Gerar partidas de 1ª Rodada (standard — no play-in)
        for (var mi = 0; mi < catParticipants.length; mi += 2) {
            var p1 = catParticipants[mi];
            var p2 = mi + 1 < catParticipants.length ? catParticipants[mi + 1] : 'BYE (Avança Direto)';
            var p1Name = getName(p1);
            var p2Name = getName(p2);
            var isBye = p2Name === 'BYE (Avança Direto)';
            var matchObj = {
                id: 'match-' + timestamp + '-' + _matchCounter,
                round: 1,
                bracket: isDupla ? 'upper' : undefined,
                p1: p1Name,
                p2: p2Name,
                winner: isBye ? p1Name : null,
                isBye: isBye
            };
            if (catName) matchObj.category = catName;
            matches.push(matchObj);
            _matchCounter++;
        }
    });

    t.matches = matches;
    t.status = 'active';
    t.currentStage = 'elimination';

    // 4. Handle Repescagem (Incomplete Teams Lottery)
    if (t.incompleteResolution === 'lottery_direct') {
        window.AppStore.logAction(tId, 'Repescagem aplicada: times completados via sorteio');
    }

    // Build bracket structure with advancement links
    if (isDupla) {
        window._buildDoubleElimBracket(t);
    } else {
        window._buildNextMatchLinks(t);
    }

    window.AppStore.logAction(tId, 'Sorteio Realizado e Chaveamento Gerado');

    if (document.getElementById('final-review-panel')) document.getElementById('final-review-panel').remove(); document.body.style.overflow = '';

    showNotification(_t('draw.changesSaved'), _t('tdraw.drawDone'), 'success');

    // Notify all participants — personalized per recipient
    if (typeof window._notifyDrawPersonalized === 'function') {
        window._notifyDrawPersonalized(t, tId);
    }

    window._lastActiveTournamentId = tId;
    // Save immediately — critical: draw MUST persist to Firestore before navigating
    window.AppStore.syncImmediate(tId).then(function() {
        window.location.hash = `#bracket/${tId}`;
    });
};

// Build nextMatchId links for single elim bracket
// Gera TODAS as rodadas futuras (R2, R3, ..., Final) com participantes TBD
// Suporta categorias: cada categoria tem seu próprio chaveamento independente
window._buildNextMatchLinks = function (t) {
    if (!t.matches || !t.matches.length) return;
    // Repechage tournaments already have all rounds + links built — skip
    if (t.hasRepechage) return;

    // Agrupar matches R1 por categoria
    var _catSet = {};
    t.matches.filter(function(m) { return m.round === 1; }).forEach(function(m) {
        var cat = m.category || '';
        if (!_catSet[cat]) _catSet[cat] = true;
    });
    var _categories = Object.keys(_catSet);

    _categories.forEach(function(catName) {
        // Filtrar matches desta categoria
        var catMatches = t.matches.filter(function(m) {
            return (m.category || '') === catName;
        });

        var roundsMap = {};
        catMatches.forEach(function(m) {
            if (!roundsMap[m.round]) roundsMap[m.round] = [];
            roundsMap[m.round].push(m);
        });

        var r1Matches = (roundsMap[1] || []).length;
        if (r1Matches === 0) return;
        var totalRounds = Math.ceil(Math.log2(r1Matches * 2));
        var timestamp = Date.now();

        for (var r = 2; r <= totalRounds; r++) {
            var prevRound = roundsMap[r - 1] || [];
            var expectedNext = Math.ceil(prevRound.length / 2);
            if (!roundsMap[r]) roundsMap[r] = [];

            while (roundsMap[r].length < expectedNext) {
                var idx = roundsMap[r].length;
                var nm = {
                    id: 'match-r' + r + '-' + idx + '-' + (timestamp + r) + (catName ? '-' + catName.replace(/\s+/g, '_') : ''),
                    round: r,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                if (catName) nm.category = catName;
                roundsMap[r].push(nm);
                window._appendCanonicalColumn(t, { phase: 'elim', round: r, matches: [nm] });
            }

            prevRound.forEach(function(m, idx) {
                var nextMatchIdx = Math.floor(idx / 2);
                if (roundsMap[r][nextMatchIdx]) {
                    m.nextMatchId = roundsMap[r][nextMatchIdx].id;
                }
            });
        }

        // Processar BYE matches — avançar automaticamente
        (roundsMap[1] || []).forEach(function(m) {
            if (m.isBye && m.winner && m.nextMatchId) {
                var next = t.matches.find(function(nm) { return nm.id === m.nextMatchId; });
                if (next) {
                    if (!next.p1 || next.p1 === 'TBD') next.p1 = m.winner;
                    else if (!next.p2 || next.p2 === 'TBD') next.p2 = m.winner;
                }
            }
        });
    });
};

// ─── Build Double Elimination Bracket ───────────────────────────────
window._buildDoubleElimBracket = function (t) {
    if (!t.matches || !t.matches.length) return;
    const ts = Date.now();

    // --- UPPER BRACKET: build rounds like single elim ---
    const upperR1 = t.matches.filter(m => m.round === 1);
    const totalUpperRounds = Math.ceil(Math.log2(upperR1.length * 2));

    // Create upper bracket shell rounds
    const upperRounds = { 1: upperR1 };
    for (let r = 2; r <= totalUpperRounds; r++) {
        const prevCount = (upperRounds[r - 1] || []).length;
        const nextCount = Math.ceil(prevCount / 2);
        upperRounds[r] = [];
        for (let i = 0; i < nextCount; i++) {
            const m = {
                id: `upper-r${r}-${i}-${ts}`,
                round: r,
                bracket: 'upper',
                label: `Upper R${r} • P${i + 1}`,
                p1: 'TBD', p2: 'TBD', winner: null
            };
            upperRounds[r].push(m);
            window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'upper', round: r, matches: [m] });
        }
    }

    // Link upper bracket: winner → next upper, loser → lower
    for (let r = 1; r < totalUpperRounds; r++) {
        const cur = upperRounds[r];
        const nxt = upperRounds[r + 1];
        cur.forEach((m, idx) => {
            const nextIdx = Math.floor(idx / 2);
            if (nxt[nextIdx]) m.nextMatchId = nxt[nextIdx].id;
        });
    }

    // --- LOWER BRACKET ---
    // v1.0.91-beta: Lower bracket has 2*totalUpperRounds - 2 rounds
    // (era 'totalUpperRounds-1)*2-1' que estava ERRADO — não criava a Lower
    // Final). Estrutura: rounds alternando "merge" (recebem upper losers) e
    // "battle" (LR winners enfrentam-se internamente). O ÚLTIMO merge round
    // é a LOWER FINAL: LR(n) winner + UR(final) loser jogam pra ir pra GF.
    // User: 'deveria haver uma lower final? acho que é isso e essa não
    // aparece no chaveamento.'
    const lowerRounds = {};
    let lowerRoundNum = 1;

    // For each upper round (1 to totalUpperRounds), losers drop to lower
    // v1.0.91-beta: <= em vez de < — pra incluir o upper final loser na
    // Lower Final. Antes (com <), o UR final loser ficava órfão e LR3
    // winner ia direto pra GF (Lower Final inexistente).
    for (let ur = 1; ur <= totalUpperRounds; ur++) {
        const upperLosersCount = upperRounds[ur].length;

        if (ur === 1) {
            // Lower R1: upper R1 losers play each other
            const matchCount = Math.ceil(upperLosersCount / 2);
            lowerRounds[lowerRoundNum] = [];
            for (let i = 0; i < matchCount; i++) {
                const m = {
                    id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                    round: lowerRoundNum,
                    bracket: 'lower',
                    label: `Lower R${lowerRoundNum} • P${i + 1}`,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                lowerRounds[lowerRoundNum].push(m);
                window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
            }

            // Link upper R1 losers → lower R1
            upperRounds[1].forEach((um, idx) => {
                const lowerIdx = Math.floor(idx / 2);
                if (lowerRounds[lowerRoundNum][lowerIdx]) {
                    um.loserMatchId = lowerRounds[lowerRoundNum][lowerIdx].id;
                }
            });

            lowerRoundNum++;
        } else {
            // "Merge" round: lower winners vs upper losers dropping down
            const actualMergeCount = (lowerRounds[lowerRoundNum - 1] || []).length;

            lowerRounds[lowerRoundNum] = [];
            for (let i = 0; i < actualMergeCount; i++) {
                const m = {
                    id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                    round: lowerRoundNum,
                    bracket: 'lower',
                    label: `Lower R${lowerRoundNum} • P${i + 1}`,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                lowerRounds[lowerRoundNum].push(m);
                window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
            }

            // Link previous lower round winners → this round
            (lowerRounds[lowerRoundNum - 1] || []).forEach((lm, idx) => {
                if (lowerRounds[lowerRoundNum][idx]) {
                    lm.nextMatchId = lowerRounds[lowerRoundNum][idx].id;
                }
            });

            // Link upper round losers → this merge round
            upperRounds[ur].forEach((um, idx) => {
                if (lowerRounds[lowerRoundNum][idx]) {
                    um.loserMatchId = lowerRounds[lowerRoundNum][idx].id;
                }
            });

            lowerRoundNum++;

            // "Battle" round: lower bracket internal (winners play each other)
            if (actualMergeCount > 1) {
                const battleCount = Math.ceil(actualMergeCount / 2);
                lowerRounds[lowerRoundNum] = [];
                for (let i = 0; i < battleCount; i++) {
                    const m = {
                        id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                        round: lowerRoundNum,
                        bracket: 'lower',
                        label: `Lower R${lowerRoundNum} • P${i + 1}`,
                        p1: 'TBD', p2: 'TBD', winner: null
                    };
                    lowerRounds[lowerRoundNum].push(m);
                    window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
                }

                // Link merge round winners → battle round
                (lowerRounds[lowerRoundNum - 1] || []).forEach((lm, idx) => {
                    const nextIdx = Math.floor(idx / 2);
                    if (lowerRounds[lowerRoundNum][nextIdx]) {
                        lm.nextMatchId = lowerRounds[lowerRoundNum][nextIdx].id;
                    }
                });

                lowerRoundNum++;
            }
        }
    }

    // --- GRAND FINAL ---
    const grandFinal = {
        id: `grand-final-${ts}`,
        round: totalUpperRounds + 1,
        bracket: 'grand',
        label: 'Grande Final',
        p1: 'TBD', p2: 'TBD', winner: null
    };
    window._appendCanonicalColumn(t, { phase: 'grandfinal', bracket: 'grand', round: totalUpperRounds + 1, matches: [grandFinal] });

    // Link upper bracket final winner → grand final
    const upperFinal = upperRounds[totalUpperRounds];
    if (upperFinal && upperFinal[0]) {
        upperFinal[0].nextMatchId = grandFinal.id;
    }

    // Link lower bracket final winner → grand final
    const lastLowerRound = lowerRounds[lowerRoundNum - 1];
    if (lastLowerRound && lastLowerRound[0]) {
        lastLowerRound[0].nextMatchId = grandFinal.id;
    }

    // Auto-advance BYE winners in upper bracket
    t.matches.filter(m => m.isBye && m.winner && m.bracket === 'upper').forEach(m => {
        if (m.nextMatchId) {
            const next = t.matches.find(n => n.id === m.nextMatchId);
            if (next) {
                if (!next.p1 || next.p1 === 'TBD') next.p1 = m.winner;
                else if (!next.p2 || next.p2 === 'TBD') next.p2 = m.winner;
            }
        }
    });
};

// ========== Drag-and-drop handlers ==========
window.handleDragStart = function (e, idx, tId) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ idx, tId }));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.style.opacity = '0.4', 0);
    // Store participant data for potential use
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (t && Array.isArray(t.participants) && t.participants[idx]) {
      window._participantDragData = t.participants[idx];
      window._participantDragTId = tId;
    }
    // Show crown drop target while dragging
    var crownBtn = document.getElementById('crown-org-btn');
    if (crownBtn) crownBtn.style.display = 'flex';
    if (typeof window._setOrgDropActive === 'function') window._setOrgDropActive(true);
};

window.handleDragEnd = function (e) {
    e.target.style.opacity = '1';
    window._participantDragData = null;
    // Hide crown drop target
    var crownBtn = document.getElementById('crown-org-btn');
    if (crownBtn) crownBtn.style.display = 'none';
    if (typeof window._setOrgDropActive === 'function') window._setOrgDropActive(false);
    // Restore original styles on all cards that might have been highlighted
    document.querySelectorAll('.participant-card').forEach(c => {
        if (c.dataset.originalBg) {
            c.style.background = c.dataset.originalBg;
            c.style.border = c.dataset.originalBorder;
            delete c.dataset.originalBg;
            delete c.dataset.originalBorder;
        }
    });
};

window.handleDragOver = function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.handleDragEnter = function (e) {
    e.preventDefault();
    const card = e.currentTarget;
    if (!card.dataset.originalBg) {
        card.dataset.originalBg = card.style.background;
        card.dataset.originalBorder = card.style.border;
    }
    card.style.border = '2px dashed var(--primary-color)';
    card.style.background = 'rgba(255,255,255,0.05)';
};

window.handleDragLeave = function (e) {
    const card = e.currentTarget;
    if (card.dataset.originalBg) {
        card.style.background = card.dataset.originalBg;
        card.style.border = card.dataset.originalBorder;
    }
};

window.handleDropTeam = function (e, targetIdx) {
    e.preventDefault();

    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const sourceIdx = data.idx;
        const tId = data.tId;

        if (sourceIdx === targetIdx) return;

        const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
        if (!t) return;

        // v2.0.0: modo individual NÃO bloqueia mais o drop — a MESCLAGEM
        // (substituir um placeholder pela pessoa real) vale em qualquer modo.
        // A formação de equipe é que fica restrita a modo não-individual (e
        // pré-sorteio); isso é decidido no overlay via allowTeam.

        // Capturar referências AGORA (antes do dialog — evita índices stale)
        const arr0 = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
        const p1snap = arr0[sourceIdx];
        const p2snap = arr0[targetIdx];
        if (!p1snap || !p2snap) return;

        const name1 = typeof p1snap === 'string' ? p1snap : (p1snap.displayName || p1snap.name || p1snap.email || '');
        const name2 = typeof p2snap === 'string' ? p2snap : (p2snap.displayName || p2snap.name || p2snap.email || '');

        if (!name1 || !name2 || name1 === name2) return;
        if (name1.includes('/') || name2.includes('/')) {
            showAlertDialog('Já em dupla', 'Um dos participantes já está em dupla. Desfaça a dupla existente antes.', null, { type: 'warning' });
            return;
        }

        const uid1 = typeof p1snap === 'object' ? (p1snap.uid || '') : '';
        const uid2 = typeof p2snap === 'object' ? (p2snap.uid || '') : '';
        const newName = name1 + ' / ' + name2;

        // v2.7.75: organizador SEMPRE recebe o overlay com 🔵 Formar equipe +
        // 🔴 Mesclar (vermelho). Mesclar só aparece quando EXATAMENTE um lado é
        // real (tem uid) e o outro é genérico — e passa por aceite do usuário
        // real. Formar equipe num torneio individual passa a permitir times pra
        // todos. Participante (não-org) só pareia A SI MESMO (nunca mescla).
        var _hasMatchesD = (Array.isArray(t.matches) && t.matches.length) ||
                           (Array.isArray(t.rounds) && t.rounds.length) ||
                           (Array.isArray(t.groups) && t.groups.length);
        var _drawDoneD = !!_hasMatchesD || t.status === 'started' || t.status === 'in_progress';
        var _isOrgDrag = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));
        var _oneRealOneGeneric = (!!uid1) !== (!!uid2); // mescla só com 1 real + 1 genérico

        if (!_isOrgDrag) {
            // Participante: arrastar o PRÓPRIO card sobre outro = propor dupla (com aceite).
            window._participantSelfPair(tId, name1, uid1, name2, uid2);
            return;
        }
        window._showDropChoiceOverlay({
            tId: tId,
            sourceName: name1, sourceUid: uid1,
            targetName: name2, targetUid: uid2,
            ruleAllowsTeam: (t.enrollmentMode !== 'individual'),
            drawDone: _drawDoneD,
            canMerge: _oneRealOneGeneric
        });

    } catch (err) { window._error(err); }
};

// ── v2.7.75: overlay de escolha ao soltar um card sobre outro (organizador) ───
//  🔵 Formar equipe (azul) SEMPRE — se a regra é individual, avisa que vai
//     passar a permitir times pra todos.
//  🔴 Mesclar jogador (vermelho) só quando 1 lado é real (uid) e o outro é
//     genérico — e dispara aceite do usuário real (vale só no torneio).
window._showDropChoiceOverlay = function(opts) {
    var old = document.getElementById('drop-choice-overlay');
    if (old) old.remove();
    var esc = function(s) { return window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s); };
    var ov = document.createElement('div');
    ov.id = 'drop-choice-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:10045;display:flex;align-items:center;justify-content:center;padding:20px;';
    var btnTeam = '<button id="dc-team" style="flex:1;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:10px;padding:12px 10px;font-weight:800;font-size:0.9rem;cursor:pointer;">🔵 Formar equipe</button>';
    var btnMerge = opts.canMerge
        ? '<button id="dc-merge" style="flex:1;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:10px;padding:12px 10px;font-weight:800;font-size:0.9rem;cursor:pointer;">🔴 Mesclar jogador</button>'
        : '';
    // Notas explicativas — distinguir CLARAMENTE formar dupla de mesclar pessoas.
    var teamNote = opts.ruleAllowsTeam
        ? '<div style="font-size:0.72rem;color:#93c5fd;margin-top:2px;">🔵 <b>Formar equipe</b>: os dois viram uma dupla.</div>'
        : '<div style="font-size:0.72rem;color:#fbbf24;margin-top:2px;">🔵 <b>Formar equipe</b>: este torneio é individual — formar dupla vai <b>passar a permitir times pra todos</b>.</div>';
    var mergeNote = opts.canMerge
        ? '<div style="font-size:0.72rem;color:#fca5a5;margin-top:4px;">🔴 <b>Mesclar jogador</b>: vincula um participante genérico ao usuário real (com conta). O real assume os jogos do genérico <b>neste torneio</b>. Exige o <b>aceite</b> dele.</div>'
        : '';
    // v2.7.76: Cancelar logo ABAIXO dos 2 botões (agrupado com eles), com cara de
    // botão (fundo sólido + volume), e as notas explicativas vão pro rodapé.
    var btnCancel = '<button id="dc-cancel" style="width:100%;margin-top:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:var(--text-bright);border-radius:10px;padding:12px 10px;font-weight:800;font-size:0.9rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 2px 6px rgba(0,0,0,0.25);">Cancelar</button>';
    ov.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:20px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.4);">' +
        '<div style="font-weight:800;color:var(--text-bright);font-size:1rem;margin-bottom:4px;">' + esc(opts.sourceName) + ' &rarr; ' + esc(opts.targetName) + '</div>' +
        '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">O que você quer fazer com esses dois?</div>' +
        '<div style="display:flex;gap:10px;">' + btnTeam + btnMerge + '</div>' +
        btnCancel +
        '<div style="margin-top:12px;">' + teamNote + mergeNote + '</div>' +
        '</div>';
    document.body.appendChild(ov);
    var close = function() { ov.remove(); };
    var cancelEl = document.getElementById('dc-cancel');
    if (cancelEl) cancelEl.onclick = close;
    ov.onclick = function(e) { if (e.target === ov) close(); };
    var teamEl = document.getElementById('dc-team');
    if (teamEl) teamEl.onclick = function() {
        close();
        // v2.7.81: o overlay já é a decisão → forma DIRETO (sem 2º confirm) quando a
        // regra já permite times; só confirma quando formar vai MUDAR a regra pra todos.
        window._formTeamConfirm(opts.tId, opts.sourceName, opts.sourceUid, opts.targetName, opts.targetUid, { changeRule: !opts.ruleAllowsTeam, skipConfirm: !!opts.ruleAllowsTeam });
    };
    if (opts.canMerge) {
        var mergeEl = document.getElementById('dc-merge');
        if (mergeEl) mergeEl.onclick = function() {
            close();
            window._requestMergeAcceptance(opts);
        };
    }
};

// ── v2.0.0: formar equipe (lógica preservada) — v2.7.75: opts.changeRule muda a
//    regra do torneio pra permitir times (quando era individual) PRA TODOS. ────
window._formTeamConfirm = function(tId, name1, uid1, name2, uid2, opts) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
    if (!t) return;
    var newName = name1 + ' / ' + name2;
    var _changeRule = !!(opts && opts.changeRule);
    // v2.7.81: lógica de formar a dupla extraída — o overlay chama isto DIRETO
    // (skipConfirm) porque já é a decisão; só o caso "muda a regra" passa por confirm.
    var _doForm = function() {
        if (_changeRule) { t.enrollmentMode = 'misto'; } // passa a permitir times pra todos
        var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
        var findIdx = function(uid, name) {
            if (uid) {
                var i = arr.findIndex(function(p) { return typeof p === 'object' && p && p.uid === uid; });
                if (i !== -1) return i;
            }
            return arr.findIndex(function(p) {
                var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
                return n === name;
            });
        };
        var i1 = findIdx(uid1, name1);
        var i2 = findIdx(uid2, name2);
        if (i1 === -1 || i2 === -1 || i1 === i2) return;
        var p1final = arr[i1];
        var p2final = arr[i2];
        var fuid1 = typeof p1final === 'object' ? (p1final.uid || '') : '';
        var fuid2 = typeof p2final === 'object' ? (p2final.uid || '') : '';
        var mergedEntry = {
            displayName: newName, name: newName,
            uid: fuid1 || fuid2 || '',
            p1Name: name1, p1Uid: fuid1,
            p2Name: name2, p2Uid: fuid2,
            ligaActive: true
        };
        var maxI = Math.max(i1, i2);
        var minI = Math.min(i1, i2);
        arr.splice(maxI, 1);
        arr.splice(minI, 1);
        arr.splice(minI, 0, mergedEntry);
        t.participants = arr;
        if (!t.teamOrigins) t.teamOrigins = {};
        t.teamOrigins[newName] = 'formada';
        window.FirestoreDB.saveTournament(t);
        var container = document.getElementById('view-container');
        if (container) renderTournaments(container, tId);
        if (typeof showNotification === 'function') showNotification('👫 Dupla formada!', newName, 'success');
    };
    if (opts && opts.skipConfirm) { _doForm(); return; }
    var _msg = _changeRule
        ? ('Este torneio é individual. Formar a dupla "' + newName + '" vai <b>passar a permitir times pra todos</b> (a regra do torneio muda). Confirmar?')
        : (name1 + ' e ' + name2 + ' formarão a dupla "' + newName + '". Confirmar?');
    showConfirmDialog(
        _changeRule ? 'Formar dupla (muda a regra)' : 'Formar dupla',
        _msg,
        _doForm,
        null,
        { type: 'info', confirmText: 'Formar dupla', cancelText: _t('btn.keepSeparate') }
    );
};

// ── v2.0.0: substitui o nome de um participante em TODA a chave ──────────────
// (matches/grupos/rounds), inclusive dentro de strings de dupla "A / B",
// arrays team1/team2 e no campo winner. Mesmo padrão da substituição por W.O.
window._replaceParticipantNameInBracket = function(t, oldName, newName) {
    if (!t || !oldName || !newName || oldName === newName) return;
    var matches = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t) : (t.matches || []);
    var swap = function(s) {
        if (typeof s !== 'string') return s;
        if (s === oldName) return newName;
        if (s.indexOf(' / ') !== -1) {
            return s.split(' / ').map(function(n) {
                return n.trim() === oldName ? newName : n.trim();
            }).join(' / ');
        }
        return s;
    };
    matches.forEach(function(m) {
        if (!m) return;
        m.p1 = swap(m.p1);
        m.p2 = swap(m.p2);
        if (m.winner) m.winner = swap(m.winner);
        if (Array.isArray(m.team1)) { var i1 = m.team1.indexOf(oldName); if (i1 !== -1) m.team1[i1] = newName; }
        if (Array.isArray(m.team2)) { var i2 = m.team2.indexOf(oldName); if (i2 !== -1) m.team2[i2] = newName; }
    });
};

// ── v2.0.0: MESCLAR — a pessoa (origem/arrastada) assume a vaga do placeholder
// (alvo). A entrada do placeholder mantém a POSIÇÃO no array, mas a IDENTIDADE
// vira a da pessoa; a entrada avulsa da pessoa é removida; o nome é substituído
// na chave (placeholder → pessoa). Guarda snapshot pra desfazer.
window._mergeParticipantConfirm = function(tId, personName, personUid, placeholderName, placeholderUid) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
    if (!t) return;
    var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
    var findIdx = function(uid, name) {
        if (uid) {
            var i = arr.findIndex(function(p) { return typeof p === 'object' && p && p.uid === uid; });
            if (i !== -1) return i;
        }
        return arr.findIndex(function(p) {
            var n = typeof p === 'string' ? p : (p.displayName || p.name || '');
            return n === name;
        });
    };
    var pIdx = findIdx(personUid, personName);          // pessoa (origem)
    var phIdx = findIdx(placeholderUid, placeholderName); // placeholder (alvo)
    if (pIdx === -1 || phIdx === -1 || pIdx === phIdx) return;
    var personObj = typeof arr[pIdx] === 'object' ? arr[pIdx] : { displayName: arr[pIdx], name: arr[pIdx] };
    var placeholderObj = typeof arr[phIdx] === 'object' ? arr[phIdx] : { displayName: arr[phIdx], name: arr[phIdx] };
    var undo = {
        placeholder: JSON.parse(JSON.stringify(placeholderObj)),
        person: JSON.parse(JSON.stringify(personObj))
    };
    var newEntry = {
        displayName: personName, name: personName,
        uid: personObj.uid || '',
        email: personObj.email || '',
        photoURL: personObj.photoURL || '',
        _mergedFrom: undo
    };
    if (personObj.category) newEntry.category = personObj.category;
    if (personObj.gender) newEntry.gender = personObj.gender;
    arr[phIdx] = newEntry;       // placeholder vira a pessoa (mantém posição)
    arr.splice(pIdx, 1);         // remove a entrada avulsa da pessoa
    t.participants = arr;
    window._replaceParticipantNameInBracket(t, placeholderName, personName);
    window.FirestoreDB.saveTournament(t);
    var container = document.getElementById('view-container');
    if (container) renderTournaments(container, tId);
    if (typeof showNotification === 'function') showNotification('Mesclado', personName + ' assumiu a vaga de ' + placeholderName + '.', 'success');
};

// ── v2.7.75: MESCLA COM ACEITE ───────────────────────────────────────────────
// Mesclar vincula um participante GENÉRICO (sem conta) ao usuário REAL (com uid).
// O real assume os jogos/resultados do genérico NESTE torneio. Como é uma
// identidade real sendo afetada, NÃO mescla na hora: registra uma pendência em
// t.pendingMerges[], notifica o uid real e só mescla quando ELE aceitar.
window._requestMergeAcceptance = function(opts) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === opts.tId.toString(); });
    if (!t) return;
    // Identifica quem é o real (tem uid) e quem é o genérico (sem uid).
    var realName, realUid, genericName;
    if (opts.sourceUid && !opts.targetUid) { realName = opts.sourceName; realUid = opts.sourceUid; genericName = opts.targetName; }
    else if (!opts.sourceUid && opts.targetUid) { realName = opts.targetName; realUid = opts.targetUid; genericName = opts.sourceName; }
    else {
        if (typeof showNotification === 'function') showNotification('Não dá pra mesclar', 'A mescla só vincula UM participante genérico a UM usuário real (com conta).', 'warning');
        return;
    }
    showConfirmDialog(
        '🔴 Mesclar jogador',
        '“' + window._safeHtml(realName) + '” (usuário real) vai assumir os jogos de “' + window._safeHtml(genericName) + '” <b>só neste torneio</b>. ' +
        'Vamos enviar um pedido de aceite pra <b>' + window._safeHtml(realName) + '</b> — a mescla só acontece se ele aceitar. Enviar o pedido?',
        function() {
            var req = {
                id: 'merge__' + Date.now() + '__' + Math.floor(Math.random() * 1e6),
                realName: realName, realUid: realUid,
                genericName: genericName,
                byUid: (window.AppStore.currentUser || {}).uid || '',
                byName: (window.AppStore.currentUser || {}).displayName || 'O organizador',
                at: new Date().toISOString()
            };
            if (!Array.isArray(t.pendingMerges)) t.pendingMerges = [];
            // evita duplicar o mesmo pedido (mesmo real + mesmo genérico)
            t.pendingMerges = t.pendingMerges.filter(function(r) { return !(r.realUid === realUid && r.genericName === genericName); });
            t.pendingMerges.push(req);
            t.updatedAt = new Date().toISOString();
            window.FirestoreDB.saveTournament(t);
            if (typeof window._sendUserNotification === 'function') {
                window._sendUserNotification(realUid, {
                    type: 'enrollment_new',
                    title: '🔗 Pedido de vínculo',
                    message: req.byName + ' quer que você assuma a participação de “' + window._safeHtml(genericName) + '” no torneio ' + window._safeHtml(t.name || '') + '. Abra o torneio para aceitar ou recusar.',
                    tournamentId: String(t.id), tournamentName: t.name || '', level: 'fundamental'
                });
            }
            if (typeof showNotification === 'function') showNotification('Pedido enviado', 'Aguardando ' + realName + ' aceitar o vínculo.', 'success');
            if (typeof window._softRefreshView === 'function') window._softRefreshView();
        },
        null,
        { type: 'warning', confirmText: 'Enviar pedido', cancelText: 'Cancelar' }
    );
};

// O usuário REAL aceita o vínculo → executa a mescla (assume a vaga do genérico).
window._acceptMergeRequest = function(tId, reqId) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
    if (!t || !Array.isArray(t.pendingMerges)) return;
    var req = t.pendingMerges.filter(function(r) { return r.id === reqId; })[0];
    if (!req) return;
    var myUid = (window.AppStore.currentUser || {}).uid;
    if (!myUid || myUid !== req.realUid) {
        if (typeof showNotification === 'function') showNotification('Sem permissão', 'Só o usuário indicado pode aceitar este vínculo.', 'warning');
        return;
    }
    // remove a pendência ANTES de mesclar (a mescla re-renderiza)
    t.pendingMerges = t.pendingMerges.filter(function(r) { return r.id !== reqId; });
    if (window._mergePromptShown) delete window._mergePromptShown[reqId];
    // person (real) assume a vaga do placeholder (genérico, sem uid)
    window._mergeParticipantConfirm(tId, req.realName, req.realUid, req.genericName, '');
    if (req.byUid && typeof window._sendUserNotification === 'function') {
        window._sendUserNotification(req.byUid, {
            type: 'enrollment_new', title: '✅ Vínculo aceito',
            message: window._safeHtml(req.realName) + ' aceitou assumir “' + window._safeHtml(req.genericName) + '” em ' + window._safeHtml(t.name || '') + '.',
            tournamentId: String(t.id), tournamentName: t.name || '', level: 'all'
        });
    }
};

// O usuário REAL recusa o vínculo → descarta a pendência e avisa o organizador.
window._rejectMergeRequest = function(tId, reqId) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
    if (!t || !Array.isArray(t.pendingMerges)) return;
    var req = t.pendingMerges.filter(function(r) { return r.id === reqId; })[0];
    if (!req) return;
    t.pendingMerges = t.pendingMerges.filter(function(r) { return r.id !== reqId; });
    if (window._mergePromptShown) delete window._mergePromptShown[reqId];
    t.updatedAt = new Date().toISOString();
    window.FirestoreDB.saveTournament(t);
    if (req.byUid && typeof window._sendUserNotification === 'function') {
        window._sendUserNotification(req.byUid, {
            type: 'enrollment_new', title: '❌ Vínculo recusado',
            message: window._safeHtml(req.realName) + ' recusou assumir “' + window._safeHtml(req.genericName) + '” em ' + window._safeHtml(t.name || '') + '.',
            tournamentId: String(t.id), tournamentName: t.name || '', level: 'all'
        });
    }
    if (typeof showNotification === 'function') showNotification('Vínculo recusado', '', 'info');
    if (typeof window._softRefreshView === 'function') window._softRefreshView();
};

// Mostra ao usuário REAL (quando abre o torneio) o pedido de vínculo pendente.
// Uma vez por sessão por pedido (não fica re-disparando no soft-refresh).
window._checkPendingMerges = function(t) {
    if (!t || !Array.isArray(t.pendingMerges) || !t.pendingMerges.length) return;
    var myUid = (window.AppStore.currentUser || {}).uid;
    if (!myUid) return;
    var req = t.pendingMerges.filter(function(r) { return r.realUid === myUid; })[0];
    if (!req) return;
    if (!window._mergePromptShown) window._mergePromptShown = {};
    if (window._mergePromptShown[req.id]) return;
    window._mergePromptShown[req.id] = 1;
    showConfirmDialog(
        '🔗 Pedido de vínculo',
        '<b>' + window._safeHtml(req.byName) + '</b> quer que você assuma a participação de “' + window._safeHtml(req.genericName) + '” no torneio <b>' + window._safeHtml(t.name || '') + '</b>. ' +
        'Você herda os jogos e resultados desse participante <b>neste torneio</b>. Aceitar?',
        function() { window._acceptMergeRequest(String(t.id), req.id); },
        function() { window._rejectMergeRequest(String(t.id), req.id); },
        { type: 'info', confirmText: 'Aceitar', cancelText: 'Recusar' }
    );
};

// ── v2.7.75: PARTICIPANTE pareia A SI MESMO (arrastou o próprio card sobre outro)
//    Só com a regra permitindo times + manualPairing='open'. Nunca mescla. Vira
//    convite pendente que o parceiro aceita. Espelha o fluxo de _duplaDropOn.
window._participantSelfPair = function(tId, name1, uid1, name2, uid2) {
    var t = window.AppStore.tournaments.find(function(x) { return String(x.id) === String(tId); });
    if (!t) return;
    if (t.enrollmentMode === 'individual') {
        if (typeof showNotification === 'function') showNotification('Torneio individual', 'Este torneio não permite a formação de times.', 'info');
        return;
    }
    if (t.manualPairing !== 'open') {
        if (typeof showNotification === 'function') showNotification('Apenas o organizador', 'Neste torneio, só o organizador forma as duplas.', 'info');
        return;
    }
    var myUid = (window.AppStore.currentUser || {}).uid;
    if (!myUid || uid1 !== myUid) {
        if (typeof showNotification === 'function') showNotification('Arraste o seu card', 'Você só pode formar dupla arrastando o SEU próprio card sobre o de outra pessoa.', 'info');
        return;
    }
    if (!uid2) {
        if (typeof showNotification === 'function') showNotification('Sem conta', name2 + ' não tem conta para aceitar o convite. Peça ao organizador para formar a dupla.', 'info');
        return;
    }
    var _send = function() {
        if (!window._teamFormation) return;
        var res = window._teamFormation.requestPair(t, uid1, uid2, name1, name2);
        if (!res.ok) { if (typeof showNotification === 'function') showNotification('Não foi possível', window._pairErrorMsg ? window._pairErrorMsg(res.error) : res.error, 'warning'); return; }
        if (res.action === 'confirm' && typeof window._formDuplaByUids === 'function') {
            var iN = (res.inviterUid === uid1) ? name1 : name2, iU = res.inviterUid;
            var eN = (res.inviterUid === uid1) ? name2 : name1, eU = (res.inviterUid === uid1) ? uid2 : uid1;
            window._formDuplaByUids(tId, iN, iU, eN, eU);
            return;
        }
        t.updatedAt = new Date().toISOString();
        window.FirestoreDB.saveTournament(t);
        if (typeof window._sendUserNotification === 'function') window._sendUserNotification(uid2, { type: 'enrollment_new', title: '🤝 Convite de dupla', message: name1 + ' quer formar dupla com você em ' + window._safeHtml(t.name || '') + '. Abra o torneio para aceitar.', tournamentId: String(t.id), tournamentName: t.name || '', level: 'fundamental' });
        if (typeof showNotification === 'function') showNotification('Convite enviado', 'Aguardando ' + name2 + ' aceitar a dupla.', 'success');
        if (typeof window._softRefreshView === 'function') window._softRefreshView();
    };
    if (typeof showConfirmDialog === 'function') showConfirmDialog('🤝 Convidar para dupla?', 'Enviar convite para "' + name2 + '" formar dupla com você?', _send, null, { type: 'info', confirmText: 'Enviar convite', cancelText: 'Cancelar' });
    else _send();
};

// ── v2.0.0: DESFAZER MESCLAGEM — restaura o placeholder na posição e devolve a
// pessoa como participante avulso; reverte o nome na chave (pessoa → placeholder).
window._undoMergeParticipant = function(tId, ref) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
    if (!t) return;
    var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
    // v2.0.2: ref pode ser o NOME (string, robusto p/ múltiplas mesclagens) ou
    // um índice (number). Acha a entrada mesclada certa.
    var entry = null, idx = -1;
    if (typeof ref === 'string') {
        idx = arr.findIndex(function(p) { return p && typeof p === 'object' && p._mergedFrom && (p.displayName || p.name) === ref; });
        if (idx !== -1) entry = arr[idx];
    } else {
        idx = ref; entry = arr[idx];
    }
    if (!(entry && typeof entry === 'object' && entry._mergedFrom)) {
        var fi = arr.findIndex(function(p) { return p && typeof p === 'object' && p._mergedFrom; });
        if (fi === -1) return;
        idx = fi; entry = arr[idx];
    }
    var undo = entry._mergedFrom;
    if (!undo) return;
    var personName = entry.displayName || entry.name;
    var placeholderName = undo.placeholder.displayName || undo.placeholder.name;
    showConfirmDialog(
        'Desfazer mesclagem',
        '“' + personName + '” voltará a ser avulso e a vaga “' + placeholderName + '” será restaurada na chave. Confirmar?',
        function() {
            var arr2 = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
            var mi = arr2.findIndex(function(p) { return p && typeof p === 'object' && p._mergedFrom && (p.displayName || p.name) === personName; });
            if (mi === -1) mi = idx;
            arr2[mi] = JSON.parse(JSON.stringify(undo.placeholder));
            arr2.push(JSON.parse(JSON.stringify(undo.person)));
            t.participants = arr2;
            window._replaceParticipantNameInBracket(t, personName, placeholderName);
            window.FirestoreDB.saveTournament(t);
            var container = document.getElementById('view-container');
            if (container) renderTournaments(container, tId);
            if (typeof showNotification === 'function') showNotification('Mescla desfeita', placeholderName + ' restaurado; ' + personName + ' voltou como avulso.', 'info');
        },
        null,
        { type: 'warning', confirmText: 'Desfazer', cancelText: 'Cancelar' }
    );
};


/**
 * v1.8.1-beta: Personalized draw / new-round notifications.
 * Each participant gets their own notification showing their specific
 * match with real name + "(você)" in the email body.
 *
 * @param {object} t      - tournament object (already mutated with matches)
 * @param {string} tId    - tournament id
 * @param {object} [opts] - { type:'new_round', roundIndex: N } for Liga rounds 2+
 *                          Defaults: type='draw', roundIndex=last round for rounds-based,
 *                          or auto-detect from groups / matches.
 *
 * Supports: Eliminatórias / Dupla Elim (t.matches R1),
 *           Liga / Suíço (t.rounds[N].matches),
 *           Grupos + Elim / Rei-Rainha (t.groups[*].rounds[0].matches).
 */
window._notifyDrawPersonalized = async function(t, tId, opts) {
    if (typeof window._sendUserNotification !== 'function') return;
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;

    opts = opts || {};
    var notifType = opts.type || 'draw';
    var _tId = String(tId || t.id || '');
    var tUrl = 'https://scoreplace.app/#tournaments/' + _tId;
    var venue = t.venue || '';
    var startDate = t.startDate || '';
    var tName = t.name || 'Torneio';

    // ── Collect matches to notify about ─────────────────────────────────
    // allMatches = [{p1, p2, groupName?}]
    var allMatches = [];
    var isGroupsStage = Array.isArray(t.groups) && t.groups.length > 0 && t.currentStage === 'groups';

    if (isGroupsStage) {
        t.groups.forEach(function(g) {
            var gName = g.name || '';
            var r0 = Array.isArray(g.rounds) && g.rounds[0];
            if (r0 && Array.isArray(r0.matches)) {
                r0.matches.forEach(function(m) {
                    if (!m.isSitOut) allMatches.push({ p1: m.p1 || '', p2: m.p2 || '', groupName: gName, label: m.label || '' });
                });
            }
        });
    } else if (Array.isArray(t.rounds) && t.rounds.length > 0) {
        // Liga / Suíço — use specified roundIndex or last round
        var _ri = (opts.roundIndex !== undefined) ? opts.roundIndex : (t.rounds.length - 1);
        var _rnd = t.rounds[_ri] || {};
        (_rnd.matches || []).forEach(function(m) {
            if (!m.isSitOut) allMatches.push({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '' });
        });
    } else if (Array.isArray(t.matches)) {
        // Eliminatórias / Dupla Elim — round 1 only, skip BYEs
        t.matches.forEach(function(m) {
            if (m.round === 1 && !m.isBye && !m.isSitOut && (m.p1 || m.p2)) {
                allMatches.push({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '' });
            }
        });
    }

    if (!allMatches.length) return;

    // ── v2.3.83: prazo p/ lançar resultados = PRÓXIMO SORTEIO (data + hora).
    // Antes o e-mail mostrava t.startDate (data de início do torneio) — errado.
    var _nextDraw = (typeof window._calcNextDrawDate === 'function') ? window._calcNextDrawDate(t) : null;
    var deadlineLabel = '';
    if (_nextDraw && !isNaN(_nextDraw.getTime())) {
        deadlineLabel = _nextDraw.toLocaleDateString('pt-BR') + ' às ' +
            _nextDraw.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    // ── Build matchLines for email (Jogo N: P1 vs P2) ───────────────────
    var matchLines = allMatches.map(function(m, i) {
        var prefix = m.groupName ? (m.groupName + ' · Jogo ' + (i + 1)) : ('Jogo ' + (i + 1));
        return prefix + ': ' + (m.p1 || '?') + ' vs ' + (m.p2 || '?');
    });

    // ── Check if playerName appears in a match side (handles "A / B" teams) ──
    // v2.4.80: casa tanto o nome do TIME inteiro ("A / B") quanto um membro
    // individual ("A"). O lado de uma partida de duplas é o displayName do time
    // ("A / B"); sem a checagem de igualdade direta, o nome do time nunca casava
    // (split daria ["A","B"], nenhum == "a / b") e a dupla ficava sem jogo.
    var _isInSide = function(playerName, side) {
        if (!playerName || !side) return false;
        var pn = playerName.trim().toLowerCase();
        if (side.trim().toLowerCase() === pn) return true;
        return side.split(' / ').some(function(s) { return s.trim().toLowerCase() === pn; });
    };

    // ── Format date for WhatsApp text ────────────────────────────────────
    var _fmtDate = function(d) {
        try { var dt = new Date(d); return isNaN(dt) ? d : dt.toLocaleDateString('pt-BR'); } catch(e) { return d; }
    };

    // ── Notification labels per type ────────────────────────────────────
    var _isNewRound = (notifType === 'new_round');
    var notifIcon = _isNewRound ? '🔄' : '🎲';
    var notifTitle = (_isNewRound ? '🔄 Nova Rodada: ' : '🎲 Chaveamento: ') + tName;
    var baseMsg = _isNewRound
        ? 'Uma nova rodada foi gerada no torneio ' + tName + '.'
        : 'O chaveamento do torneio ' + tName + ' foi gerado.';
    var ctaText = _isNewRound ? 'Ver rodada' : 'Ver chaveamento';

    // ── Notify each participant individually ─────────────────────────────
    var parts = Array.isArray(t.participants)
        ? t.participants
        : (t.participants ? Object.values(t.participants) : []);

    // v2.4.80: helper canônico — TODOS os UIDs de um participante. Duplas
    // pré-formadas são UM objeto com p1Uid/p2Uid e SEM uid de time; ler só
    // `p.uid` pulava a dupla inteira (ninguém recebia a notificação de sorteio).
    // Agora cada pessoa da dupla é notificada individualmente, com o jogo do time.
    var _allUids = (typeof window._participantUids === 'function')
        ? window._participantUids
        : function(p) { return (p && p.uid) ? [p.uid] : []; };
    var _seenUids = {};

    for (var _pi = 0; _pi < parts.length; _pi++) {
        var p = parts[_pi];
        if (typeof p === 'string') continue;

        // Nome do TIME/participante = lado da partida ("A / B" para duplas).
        var pName = p.displayName || p.name || '';
        if (!pName) continue;

        var uids = _allUids(p);
        if (!uids.length) continue;

        // Mapa uid → nome individual (duplas: p1Uid→p1Name, p2Uid→p2Name; e os
        // sub-participantes em p.participants[]). Cada membro recebe seu próprio
        // nome na notificação personalizada, mas o jogo é o do time.
        var _uidName = {};
        if (p.uid) _uidName[p.uid] = pName;
        if (p.p1Uid) _uidName[p.p1Uid] = p.p1Name || pName;
        if (p.p2Uid) _uidName[p.p2Uid] = p.p2Name || pName;
        if (Array.isArray(p.participants)) {
            p.participants.forEach(function(s) {
                if (s && s.uid) _uidName[s.uid] = s.displayName || s.name || pName;
            });
        }

        // v2.3.83: TODOS os jogos deste participante na rodada (Rei/Rainha são 3).
        var playerMatches = [];
        for (var _mi = 0; _mi < allMatches.length; _mi++) {
            var am = allMatches[_mi];
            if (_isInSide(pName, am.p1) || _isInSide(pName, am.p2)) {
                playerMatches.push({
                    num: _mi + 1,
                    label: am.label || ('Jogo ' + (_mi + 1)),
                    p1: am.p1 || '',
                    p2: am.p2 || ''
                });
            }
        }
        // Compat: 1º jogo do jogador (campos antigos ainda usados como fallback).
        var playerMatch = playerMatches.length ? { p1: playerMatches[0].p1, p2: playerMatches[0].p2 } : null;
        var playerMatchNum = playerMatches.length ? playerMatches[0].num : 0;

        // Personalized plain-text (WhatsApp): lista os jogos com time numa linha
        // e adversário na outra, + prazo de lançamento (próximo sorteio).
        var msg = baseMsg;
        if (playerMatches.length) {
            var _gamesText = playerMatches.map(function(pm) {
                return pm.label + ':\n' + (pm.p1 || '?') + '\nvs\n' + (pm.p2 || '?');
            }).join('\n\n');
            msg = notifIcon + ' ' + (_isNewRound ? 'Nova rodada no torneio' : 'Chaveamento do torneio') +
                ' ' + tName + '!' +
                '\n\n' + _gamesText +
                (venue ? '\n\n📍 ' + venue : '') +
                (deadlineLabel ? '\n⏰ Lance os resultados até ' + deadlineLabel : '');
        }

        // Notifica CADA UID individualmente (cada membro da dupla recebe a sua).
        for (var _ui = 0; _ui < uids.length; _ui++) {
            var uid = uids[_ui];
            if (!uid || _seenUids[uid]) continue;
            _seenUids[uid] = true;
            try {
                await window._sendUserNotification(uid, {
                    type: notifType,
                    level: 'fundamental',
                    title: notifTitle,
                    message: msg,
                    tournamentId: _tId,
                    tournamentName: tName,
                    ctaUrl: tUrl,
                    ctaText: ctaText,
                    matchLines: matchLines,
                    playerMatch: playerMatch || undefined,
                    playerMatchNum: playerMatchNum || 0,
                    playerMatches: playerMatches,
                    deadline: deadlineLabel,
                    playerName: _uidName[uid] || pName,
                    venue: venue,
                    startDate: startDate
                });
            } catch(e) {
                window._warn('[notifyDrawPersonalized] uid=' + uid, e);
            }
        }
    }
};

})();
