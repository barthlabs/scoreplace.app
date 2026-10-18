// test-drawinitial.js — o SORTEIO INICIAL do servidor bate com o do cliente?
//
// draw-core.drawInitial espelha o trecho do MOTOR de generateDrawFunction
// (tournaments-draw.js:1539-1642). Este teste roda o MESMO torneio pelos dois lados e
// compara a ESTRUTURA da chave.
//
// POR QUE ESTRUTURA E NÃO O PAREAMENTO EXATO: o sorteio usa Math.random de propósito —
// duas execuções do MESMO lado já dão pareamentos diferentes. O que precisa bater é o
// FORMATO do resultado (nº de jogos, storage nativo × flat, status, flags), que é o que
// difere quando os dois lados rodam VERSÕES diferentes do motor. É esse o bug que a
// canonização mata.
//
// node test-drawinitial.js

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const core = require('./draw-core.js');
const competitionAssignments = require('./competition-assignment-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
}

// REGRESSÃO: o contador que drawInitial devolve aparece no histórico/mensagem de
// sorteio. Quando a forma antiga não traz `roundMatchCount`, o fallback deve usar
// a mesma regra do gerador da fase: BYE e folga são marcadores, nunca jogos.
(() => {
  const server = fs.readFileSync(path.join(__dirname, 'draw-core.js'), 'utf8');
  const phaseSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'phases-engine.js'), 'utf8');
  const expected = /m && !m\.isSitOut && !m\.isBye/;
  ok('fallback do servidor exclui BYE e folga do matchCount', expected.test(server));
  ok('retorno de chave/grupo também exclui BYE e folga do matchCount',
    /_realFlatMatchCount[\s\S]{0,180}m && !m\.isSitOut && !m\.isBye/.test(server));
  ok('gerador da fase usa a mesma contagem de jogo real', expected.test(phaseSource));
})();

// ── CLIENTE: o render-harness carrega store.js/tournaments-draw.js/bracket.js REAIS
//    e expõe generateDrawFunction (o MESMO caminho do app). ─────────────────────────
const CW = require(path.resolve(__dirname, '..', 'tests', 'render-harness')).window;

function mkT(id, extra, n) {
  const parts = [];
  for (let i = 1; i <= (n || 8); i++) parts.push({ uid: 'u' + i, displayName: 'J' + i, name: 'J' + i });
  return Object.assign({
    id: id, name: 'T', status: 'open', participants: parts,
    creatorUid: 'uOrg', organizerEmail: 'org@x.com', sport: 'Beach Tennis',
  }, extra || {});
}

function structure(t) {
  const flat = Array.isArray(t.matches) ? t.matches.filter(function (m) { return !m.isBye && !m.isSitOut; }).length : 0;
  const nativeRounds = Array.isArray(t.rounds) ? t.rounds.length : 0;
  const r0 = (t.rounds && t.rounds[0] && t.rounds[0].matches) || [];
  const all = r0.length ? r0 : (Array.isArray(t.matches) ? t.matches : []);
  const real = all.filter(function (m) { return !m.isSitOut && !m.isBye; });
  // Nº de PESSOAS em cada lado do 1º jogo. É o que denuncia o bug do Confra: com a trava
  // do Rei/Rainha desligada, o pool-prep forma duplas e o gerador junta 2 duplas num lado
  // ("time de 4") — a CONTAGEM de jogos não muda, só quem joga com quem. Sem este sinal o
  // comparador é grosso demais (provado: injetei _isMon0=false e o teste passava).
  function side(m, k) {
    if (!m) return 0;
    if (Array.isArray(m['team' + k])) return m['team' + k].length;
    const s = m['p' + k];
    return (typeof s === 'string' && s) ? s.split(/\s*\/\s*/).filter(Boolean).length : (s ? 1 : 0);
  }
  return {
    storage: nativeRounds > 0 ? 'nativo(rounds)' : 'flat(matches)',
    jogosFlat: flat,
    rodadas: nativeRounds,
    jogosR0: r0.filter(function (m) { return !m.isSitOut && !m.isBye; }).length,
    // entradas APÓS o pool-prep: 8 indivíduos × 4 duplas é a diferença que importa
    entradasNoPool: Array.isArray(t.participants) ? t.participants.length : 0,
    pessoasPorLado: real.length ? [side(real[0], 1), side(real[0], 2)] : [],
    status: t.status,
    canonico: !!t._canonicalDraw,
    temStandings: !!t.standings,
    presencaLimpa: !!(t.checkedIn && Object.keys(t.checkedIn).length === 0),
  };
}

// Cenários que exercitam os ramos reais do motor.
const CASES = [
  ['Eliminatórias Simples · 8 individuais', { format: 'Eliminatórias Simples' }, 8],
  ['Eliminatórias Simples · 16 individuais', { format: 'Eliminatórias Simples' }, 16],
  ['Liga · 8 individuais (storage NATIVO)', { format: 'Liga', ligaRoundFormat: 'standard', ligaDrawMode: 'standard', drawManual: true }, 8],
  ['Liga Rei/Rainha · 8 (grupos de 4)', { format: 'Liga', drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', ligaDrawMode: 'standard', drawManual: true }, 8],
  // ⚠️ O CENÁRIO DO CONFRA: Rei/Rainha num torneio de DUPLAS (teamSize 2 / inscrição time).
  // Sem a trava `_isMon0` o pool-prep forma duplas e o gerador junta 2 duplas num "time de
  // 4". O caso SEM teamSize acima NÃO exercita a trava (_ts0 já é 1 por outro caminho) —
  // provado injetando `_isMon0=false` no servidor: o teste passava. Este pega.
  ['Liga Rei/Rainha · 8 · DUPLAS (trava do Confra)', { format: 'Liga', drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', ligaDrawMode: 'standard', drawManual: true, teamSize: 2, enrollmentMode: 'teams' }, 8],
  ['Dupla Eliminatória · 8', { format: 'Dupla Eliminatória' }, 8],
  ['Fase de Grupos · 8 · duplas', { format: 'Fase de Grupos', gruposCount: 2, gruposClassified: 2, teamSize: 2, enrollmentMode: 'individual' }, 8],
];

// Competição por times não é outro formato de chave: cada entrada continua uma
// dupla da sua categoria. Este guarda impede a regressão de sortear "times" antes
// de formar as duplas, ou de concentrar toda uma categoria no mesmo time.
(function () {
  function dupla(n, category) {
    return {
      displayName: 'A' + n + ' / B' + n,
      p1Uid: 'a' + n, p2Uid: 'b' + n,
      participants: [{ uid: 'a' + n }, { uid: 'b' + n }],
      category: category,
    };
  }
  const drawn = { participants: [dupla(1, 'A'), dupla(2, 'A'), dupla(3, 'A'), dupla(4, 'A')] };
  const cfg = { enabled: true, teamCount: 2, teamNames: ['Neon', 'Nightmare'], formation: 'draw', internalMatches: 'avoid', scoring: { win: 3, draw: 1, loss: 0 } };
  const assigned = core.assignCompetitionTeamsAtInitialDraw(drawn, cfg);
  const counts = drawn.participants.reduce(function (out, entry) {
    out[entry.competitionTeamId] = (out[entry.competitionTeamId] || 0) + 1; return out;
  }, {});
  ok('times sorteados só após as duplas e com IDs canônicos', assigned.ok && drawn.competitionTeams.length === 2 && Object.keys(counts).length === 2,
    JSON.stringify({ teams: drawn.competitionTeams, counts: counts }));
  ok('sorteio preserva os nomes escolhidos pelo organizador', drawn.competitionTeams[0].name === 'Neon' && drawn.competitionTeams[1].name === 'Nightmare',
    JSON.stringify(drawn.competitionTeams));
  ok('sorteio de times distribui uma categoria de forma balanceada', Object.keys(counts).every(function (id) { return counts[id] === 2; }), JSON.stringify(counts));

  const manual = { participants: [dupla(5, 'A')] };
  const rejected = core.assignCompetitionTeamsAtInitialDraw(manual, Object.assign({}, cfg, { formation: 'manual' }));
  ok('modo manual não inventa dono para dupla sem time', rejected.ok === false && rejected.reason === 'competition-teams-unassigned', JSON.stringify(rejected));

  const withoutNames = core.assignCompetitionTeamsAtInitialDraw({ participants: [dupla(6, 'A')] }, { enabled: true, teamNames: [], formation: 'draw' });
  ok('times vazios não permitem sorteio fictício', withoutNames.ok === false && withoutNames.reason === 'competition-team-names-required', JSON.stringify(withoutNames));
  const duplicateNames = core.assignCompetitionTeamsAtInitialDraw({ participants: [dupla(7, 'A')] }, { enabled: true, teamNames: ['Neon', 'neon'], formation: 'draw' });
  ok('homônimos não permitem sorteio ambíguo', duplicateNames.ok === false && duplicateNames.reason === 'competition-team-names-required', JSON.stringify(duplicateNames));

  const full = mkT('team-full', {
    format: 'Fase de Grupos', gruposCount: 1, gruposClassified: 1, teamSize: 2,
    teamCompetition: cfg,
  }, 8);
  const complete = core.drawInitial(full, { idStamp: 'team-regression' });
  const real = (full.matches || []).filter(function (m) { return m && !m.isBye && !m.isSitOut; });
  ok('sorteio completo grava times e carimba ambos os lados de todo jogo', complete.ok &&
    full.participants.every(function (entry) { return !!entry.competitionTeamId; }) &&
    real.every(function (match) { return !!match.p1CompetitionTeamId && !!match.p2CompetitionTeamId; }),
    JSON.stringify({ result: complete.ok, games: real.length }));
  ok('toggle de evitar não gera confronto entre duplas do mesmo time', real.every(function (match) {
    return match.p1CompetitionTeamId !== match.p2CompetitionTeamId;
  }), JSON.stringify(real.map(function (match) { return [match.p1CompetitionTeamId, match.p2CompetitionTeamId]; })));

  // Neon: 96 participantes = 48 duplas, em seis categorias com oito duplas cada.
  // O sorteio só pode seguir se cada time receber exatamente uma dupla de CADA categoria.
  const neonCategories = ['Fem Light', 'Masc Light', 'Fem Power', 'Masc Power', 'Fem Extreme', 'Masc Extreme'];
  const neonPairs = [];
  neonCategories.forEach(function (category, categoryIndex) {
    for (let i = 0; i < 8; i++) neonPairs.push(dupla(categoryIndex * 8 + i + 100, category));
  });
  const neonTournament = { combinedCategories: neonCategories, participants: neonPairs };
  const neonConfig = { enabled: true, teamCount: 8, teamNames: ['Time 1', 'Time 2', 'Time 3', 'Time 4', 'Time 5', 'Time 6', 'Time 7', 'Time 8'], formation: 'draw', internalMatches: 'avoid', schedule: { enabled: true, teamsPerGroup: 8, gamesPerTeam: 4, mode: 'structured' } };
  const neonAssigned = core.assignCompetitionTeamsAtInitialDraw(neonTournament, neonConfig);
  const neonCoverage = {};
  neonTournament.participants.forEach(function (entry) {
    const key = entry.category + ':' + entry.competitionTeamId;
    neonCoverage[key] = (neonCoverage[key] || 0) + 1;
  });
  ok('Neon: 48 duplas formam 8 times com seis duplas cada', neonAssigned.ok && neonTournament.participants.length === 48 && neonTournament.competitionTeams.length === 8 &&
    neonTournament.competitionTeams.every(function (team) { return neonTournament.participants.filter(function (entry) { return entry.competitionTeamId === team.id; }).length === 6; }), JSON.stringify(neonTournament.competitionTeams));
  ok('Neon: cada categoria tem exatamente uma dupla por time', neonCategories.every(function (category) {
    return neonTournament.competitionTeams.every(function (team) { return neonCoverage[category + ':' + team.id] === 1; });
  }), JSON.stringify(neonCoverage));
  ok('Neon: Light/Power/Extreme persistem saturação 40/70/100 na cor da dupla', neonTournament.participants.every(function (entry) {
    const expected = /Light/.test(entry.category) ? 40 : (/Power/.test(entry.category) ? 70 : 100);
    return entry.competitionTeamSaturation === expected && /^hsl\(/.test(entry.competitionTeamColor || '');
  }));
  const malformedNeon = { combinedCategories: neonCategories, participants: neonPairs.slice(0, 47) };
  const rejectedNeon = core.assignCompetitionTeamsAtInitialDraw(malformedNeon, neonConfig);
  ok('Neon: não sorteia grade incompleta', rejectedNeon.ok === false && rejectedNeon.reason === 'competition-team-category-coverage', JSON.stringify(rejectedNeon));

  // Neon 2026: 24 Fem Light, as primeiras 16 na quinta e as últimas oito
  // na sexta. O recibo de pares é canônico; trocar uma categoria o invalida.
  const realCategories = ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'];
  const realPairs = [];
  realCategories.forEach(function (category, ci) {
    const count = ci === 0 ? 24 : 8;
    for (let i = 0; i < count; i++) {
      const pair = dupla(300 + realPairs.length, category);
      pair.fixedPairId = 'pair-' + realPairs.length;
      pair.categoryId = 'category-' + ci;
      pair.originCategoryId = ci === 0 && i >= 16 ? (i < 22 ? 'category-3' : 'category-5') : pair.categoryId;
      realPairs.push(pair);
    }
  });
  const rosterSnapshot = realPairs.map(function (entry) { return { fixedPairId:entry.fixedPairId, categoryId:entry.categoryId }; })
    .sort(function (a, b) { return a.fixedPairId.localeCompare(b.fixedPairId); });
  const pairDayAssignments = realPairs.slice(0, 24).map(function (entry, index) {
    return { fixedPairId:entry.fixedPairId, day:index < 16 ? '2026-10-22' : '2026-10-23' };
  });
  const realConfig = Object.assign({}, neonConfig, { schedule:Object.assign({}, neonConfig.schedule, {
    gamesPerPair:3, gamesPerTeam:3, mode:'structured',
    pairsPerTeamByCategory:{ 'Fem Light':3, 'Fem Power':1, 'Fem Extreme':1, 'Masc Light':1, 'Masc Power':1, 'Masc Extreme':1 },
    pairDayAssignments, rosterSnapshot
  }) });
  function realTournament() { return {
    id:'neon-64', name:'Neon 64', status:'open', format:'Fase de Grupos', teamSize:2, enrollmentMode:'teams',
    startDate:'2026-10-22T18:00:00-03:00', endDate:'2026-10-23T22:40:00-03:00',
    courtCount:6, gameDuration:25, callTime:5, warmupTime:5,
    scheduleWindow:{ days:[{ day:'2026-10-22', startTime:'18:00', endTime:'22:40', categoryFlow:'rounds' }, { day:'2026-10-23', startTime:'18:00', endTime:'22:40', categoryFlow:'rounds' }] },
    combinedCategories:realCategories, participants:realPairs.map(function (entry) { return JSON.parse(JSON.stringify(entry)); }),
    categoryDefinitions:realCategories.map(function (label, index) { return { id:'category-' + index, label:label }; }),
    teamCompetition:realConfig, phases:[{ teamCompetition:realConfig }],
    categorySchedule:{ confirmed:true, slots:realCategories.flatMap(function (category) {
      return (category === 'Fem Light' ? ['2026-10-22','2026-10-23'] : [/^Fem /.test(category) ? '2026-10-22' : '2026-10-23'])
        .map(function (day) { return { category, day, order:1 }; });
    }) }
  }; }
  const neon64 = realTournament(), realDraw = core.drawInitial(neon64, { idStamp:'neon-64' });
  const realMatches = neon64.matches || [];
  const lightMatches = realMatches.filter(function (match) { return match.category === 'Fem Light'; });
  ok('Neon 64: gera 96 jogos com 24 Fem Light', realDraw.ok && realMatches.length === 96 && lightMatches.length === 36,
    JSON.stringify({ result:realDraw.ok, reason:realDraw.reason, matches:realMatches.length, light:lightMatches.length }));
  ok('Neon 64: cada time leva 2 Fem Light quinta e 1 sexta', neon64.competitionTeams && neon64.competitionTeams.every(function (team) {
    return [2,1].every(function (want, index) {
      return neon64.participants.filter(function (entry) { return entry.category === 'Fem Light' && entry.competitionTeamId === team.id && entry.competitionPlayDay === ['2026-10-22','2026-10-23'][index]; }).length === want;
    });
  }));
  ok('Neon 64: jogos Light não cruzam dias nem times e cada dupla joga três vezes',
    lightMatches.length === 36 && lightMatches.every(function (match) {
      return match.team1Obj && match.team2Obj && match.team1Obj.competitionPlayDay === match.requiredDay &&
        match.team2Obj.competitionPlayDay === match.requiredDay && match.p1CompetitionTeamId !== match.p2CompetitionTeamId;
    }) && neon64.participants.filter(function (entry) { return entry.category === 'Fem Light'; }).every(function (entry) {
      return lightMatches.filter(function (match) { return match.team1Obj.fixedPairId === entry.fixedPairId || match.team2Obj.fixedPairId === entry.fixedPairId; }).length === 3;
    }));
  const savedAssignments = competitionAssignments.snapshot(neon64.participants);
  const projectedAgain = realPairs.map(function (entry) {
    const copy = Object.assign({}, entry);
    delete copy.competitionTeamId;
    delete copy.competitionPlayDay;
    return copy;
  });
  const restored = competitionAssignments.overlay(projectedAgain, savedAssignments);
  ok('Neon 64: releitura canônica recupera time e dia sem usar espelho antigo', savedAssignments.length === 64 &&
    restored.every(function (entry) {
      const before = neon64.participants.find(function (p) { return p.fixedPairId === entry.fixedPairId; });
      return before && entry.competitionTeamId === before.competitionTeamId &&
        entry.competitionPlayDay === before.competitionPlayDay;
    }));
  const changedCategory = projectedAgain.map(function (entry, index) {
    return index === 0 ? Object.assign({}, entry, { categoryId:'moved-category' }) : entry;
  });
  ok('Neon 64: troca de categoria invalida só o time da dupla alterada',
    !competitionAssignments.overlay(changedCategory, savedAssignments)[0].competitionTeamId &&
    !!competitionAssignments.overlay(changedCategory, savedAssignments)[1].competitionTeamId);
  const remade = projectedAgain.map(function (entry, index) {
    return index === 0 ? Object.assign({}, entry, { fixedPairId:'remade-pair' }) : entry;
  });
  ok('Neon 64: dupla refeita não herda time da identidade antiga',
    !competitionAssignments.overlay(remade, savedAssignments)[0].competitionTeamId);
  ok('Neon 64: mapa de dupla excluída não fabrica inscrição',
    competitionAssignments.overlay(projectedAgain.slice(1), savedAssignments).length === 63);
  const estimated = core._window._schGradeEstimada(neon64);
  // 96 jogos devem preencher exatamente 6 quadras x 8 ondas em cada dia.
  const plannedDaysValid = estimated && estimated.slots.every(function (slot) {
    const match = realMatches.find(function (m) { return String(m.id) === slot.matchId; });
    return !match.requiredDay || match.requiredDay === ['2026-10-22','2026-10-23'][slot.dia];
  });
  const applied = core._window._schAplicarGrade(neon64, []);
  const waves = estimated && ['2026-10-22','2026-10-23'].map(function (_, day) {
    const counts = {};
    estimated.slots.filter(function (slot) { return slot.dia === day; }).forEach(function (slot) { counts[slot.ms] = (counts[slot.ms] || 0) + 1; });
    return Object.values(counts);
  });
  ok('Neon 64: 96 jogos em 48 por dia, oito ondas completas de seis quadras', estimated && estimated.cabe === true && estimated.slots.length === 96 &&
    plannedDaysValid && applied === 96 && waves.every(function (day) { return day.length === 8 && day.every(function (count) { return count === 6; }); }) &&
    estimated.slots.every(function (slot) {
      const match = realMatches.find(function (m) { return String(m.id) === slot.matchId; });
      return !match.requiredDay || new Date(slot.iso).toLocaleDateString('en-CA', { timeZone:'America/Sao_Paulo' }) === match.requiredDay;
    }), JSON.stringify(estimated && { slots:estimated.slots.length, days:estimated.dias, extra:estimated.extraMs, applied, waves }));
  const opponents = {};
  realMatches.forEach(function (match) {
    const a = match.team1Obj && match.team1Obj.fixedPairId, b = match.team2Obj && match.team2Obj.fixedPairId;
    (opponents[a] || (opponents[a] = [])).push(b);
    (opponents[b] || (opponents[b] = [])).push(a);
  });
  ok('Neon 64: toda dupla faz três jogos contra três adversários distintos', realPairs.every(function (entry) {
    const rivals = opponents[entry.fixedPairId] || [];
    return rivals.length === 3 && new Set(rivals).size === 3;
  }));
  const matchesById = new Map(realMatches.map(function (match) { return [String(match.id), match]; }));
  const simultaneous = {};
  estimated.slots.forEach(function (slot) {
    const match = matchesById.get(slot.matchId), key = String(slot.ms);
    if (!match) return;
    (simultaneous[key] || (simultaneous[key] = [])).push(match.team1Obj.fixedPairId, match.team2Obj.fixedPairId);
  });
  ok('Neon 64: nenhuma dupla joga em duas quadras no mesmo horário', Object.keys(simultaneous).every(function (key) {
    return new Set(simultaneous[key]).size === simultaneous[key].length;
  }));
  const slotById = new Map(estimated.slots.map(function (slot) { return [slot.matchId, slot.ms]; }));
  const roundTimes = {};
  realMatches.forEach(function (match) {
    [match.team1Obj.fixedPairId, match.team2Obj.fixedPairId].forEach(function (id) {
      (roundTimes[id] || (roundTimes[id] = [])).push({ round:Number(match.round || 0), ms:slotById.get(String(match.id)) });
    });
  });
  ok('Neon 64: rodadas de cada dupla seguem ordem cronológica', Object.keys(roundTimes).every(function (id) {
    const times = roundTimes[id].sort(function (a, b) { return a.round - b.round; });
    return times.every(function (item, index) { return index === 0 || item.ms > times[index - 1].ms; });
  }));
  const browser = require('../tests/render-harness').sandbox;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8'), browser);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-organizer.js'), 'utf8'), browser);
  const operational = browser._operationalSchedulePlan(neon64);
  ok('Neon 64: planejamento operacional mostra os 96 jogos sem excedente', operational.cabe === true &&
    operational.items.length === 96 && operational.unscheduledCount === 0 && operational.extraMs === 0);
  const blockedTournament = Object.assign({}, neon64, { matches:realMatches.map(function (match, index) {
    return index === 0 ? Object.assign({}, match, {
      scheduledAt:'2026-10-23T01:40:00.000Z', court:'Quadra 4', scheduleLocked:true, scheduleSource:'organizer'
    }) : Object.assign({}, match);
  }) });
  const blockedPlan = browser._operationalSchedulePlan(blockedTournament);
  ok('Neon 64: jogo manual fora da janela não é movido e bloqueia publicação', blockedPlan.cabe === false &&
    blockedPlan.items.some(function (item) { return item.matchId === String(realMatches[0].id) &&
      item.scheduledAt === '2026-10-23T01:40:00.000Z' && item.scheduleLocked === true; }));
  const stale = realTournament();
  stale.participants[0].categoryId = 'changed-category';
  const staleResult = core.assignCompetitionTeamsAtInitialDraw(stale, realConfig);
  ok('Neon 64: mapa velho falha antes de atribuir qualquer time', staleResult.ok === false && staleResult.reason === 'competition-pair-day-plan-invalid' && !stale.competitionTeams);
  const wrongDayPair = realTournament();
  const wrongAssignment = JSON.parse(JSON.stringify(realConfig));
  wrongAssignment.schedule.pairDayAssignments[0].fixedPairId = realPairs[24].fixedPairId;
  const wrongResult = core.assignCompetitionTeamsAtInitialDraw(wrongDayPair, wrongAssignment);
  ok('Neon 64: mapa 16/8 com dupla de outra categoria é recusado', wrongResult.ok === false &&
    wrongResult.reason === 'competition-pair-day-plan-invalid' && !wrongDayPair.competitionTeams);
  const swappedOrigins = realTournament();
  swappedOrigins.participants[0].originCategoryId = 'category-3';
  const swappedResult = core.assignCompetitionTeamsAtInitialDraw(swappedOrigins, realConfig);
  ok('Neon 64: origem 15/9 é recusada mesmo com mapa 16/8', swappedResult.ok === false &&
    swappedResult.reason === 'competition-pair-day-plan-invalid' && !swappedOrigins.competitionTeams);
  const reverseOrigins = realTournament();
  reverseOrigins.participants[16].originCategoryId = 'category-0';
  const reverseResult = core.assignCompetitionTeamsAtInitialDraw(reverseOrigins, realConfig);
  ok('Neon 64: origem 17/7 é recusada mesmo com mapa 16/8', reverseResult.ok === false &&
    reverseResult.reason === 'competition-pair-day-plan-invalid' && !reverseOrigins.competitionTeams);
  const forgedPlan = realTournament();
  const forgedConfig = JSON.parse(JSON.stringify(realConfig));
  forgedConfig.schedule.originDayPolicy = 'female-light-enrollment-origin';
  const firstDay = forgedConfig.schedule.pairDayAssignments[0];
  const secondDay = forgedConfig.schedule.pairDayAssignments[16];
  firstDay.day = '2026-10-23';
  secondDay.day = '2026-10-22';
  const forgedResult = core.assignCompetitionTeamsAtInitialDraw(forgedPlan, forgedConfig);
  ok('Neon 64: flag não autoriza mapa trocado com contagem 16/8', forgedResult.ok === false &&
    forgedResult.reason === 'competition-pair-day-plan-invalid' && !forgedPlan.competitionTeams);
  const missingOrigin = realTournament();
  delete missingOrigin.participants[0].originCategoryId;
  const missingResult = core.assignCompetitionTeamsAtInitialDraw(missingOrigin, realConfig);
  ok('Neon 64: origem ausente é recusada', missingResult.ok === false &&
    missingResult.reason === 'competition-pair-day-plan-invalid' && !missingOrigin.competitionTeams);

  // A organização fornece os oito IDs de sexta; não se infere o dia da
  // categoria original nem se sorteiam três duplas adicionais.
  const organizationPlan = realTournament();
  const organizationConfig = JSON.parse(JSON.stringify(realConfig));
  organizationConfig.schedule.originDayPolicy = 'female-light-organization-final';
  const fridayIds = new Set(organizationPlan.participants.slice(3, 11).map(function (entry) { return entry.fixedPairId; }));
  organizationConfig.schedule.pairDayAssignments = organizationPlan.participants.slice(0, 24).map(function (entry) {
    return { fixedPairId:entry.fixedPairId, day:fridayIds.has(entry.fixedPairId) ? '2026-10-23' : '2026-10-22' };
  });
  const organizationResult = core.assignCompetitionTeamsAtInitialDraw(organizationPlan, organizationConfig);
  ok('Neon: oito duplas nominais de sexta independem da origem e formam 16/8', organizationResult.ok === true &&
    organizationPlan.participants.slice(0, 24).every(function (entry) {
      return entry.competitionPlayDay === (fridayIds.has(entry.fixedPairId) ? '2026-10-23' : '2026-10-22');
    }));
  const invalidOrganizationPlan = realTournament();
  const invalidOrganizationConfig = JSON.parse(JSON.stringify(organizationConfig));
  invalidOrganizationConfig.schedule.pairDayAssignments[3].day = '2026-10-22';
  const invalidOrganizationResult = core.assignCompetitionTeamsAtInitialDraw(invalidOrganizationPlan, invalidOrganizationConfig);
  ok('Neon: lista nominal com apenas sete duplas na sexta é rejeitada', invalidOrganizationResult.ok === false &&
    invalidOrganizationResult.reason === 'competition-pair-day-plan-invalid');

  // Regra vigente: só cinco das duplas atuais vieram das inscrições
  // masculinas; três das outras 19 completam a sexta em qualquer ambiente.
  const provisional = realTournament();
  provisional.id = 'neon_five_plus_three'; provisional.name = 'Neon Nightmare';
  provisional.participants.slice(16, 19).forEach(function (entry) { entry.originCategoryId = 'category-0'; });
  const provisionalConfig = JSON.parse(JSON.stringify(realConfig));
  provisionalConfig.schedule.originDayPolicy = 'female-light-five-plus-three';
  const candidates = provisional.participants.slice(0, 19).sort(function (a, b) { return a.fixedPairId.localeCompare(b.fixedPairId); });
  let selectionSeed = 2166136261;
  for (const letter of provisional.id) { selectionSeed ^= letter.charCodeAt(0); selectionSeed = Math.imul(selectionSeed, 16777619); }
  for (let ci = candidates.length - 1; ci > 0; ci--) {
    selectionSeed ^= selectionSeed << 13; selectionSeed ^= selectionSeed >>> 17; selectionSeed ^= selectionSeed << 5;
    const swap = (selectionSeed >>> 0) % (ci + 1), temp = candidates[ci]; candidates[ci] = candidates[swap]; candidates[swap] = temp;
  }
  const selectedExtraIds = new Set(candidates.slice(0, 3).map(function (entry) { return entry.fixedPairId; }));
  provisionalConfig.schedule.pairDayAssignments = provisional.participants.slice(0, 24).map(function (entry, index) {
    return { fixedPairId:entry.fixedPairId, day:index >= 19 || selectedExtraIds.has(entry.fixedPairId) ? '2026-10-23' : '2026-10-22' };
  });
  const provisionalResult = core.assignCompetitionTeamsAtInitialDraw(provisional, provisionalConfig);
  ok('Neon: cinco marcadas + três sorteadas geram 16/8 e 2/1 por time', provisionalResult.ok === true &&
    provisional.competitionTeams.every(function (team) {
      return [2,1].every(function (want, index) {
        return provisional.participants.filter(function (entry) { return entry.category === 'Fem Light' &&
          entry.competitionTeamId === team.id && entry.competitionPlayDay === ['2026-10-22','2026-10-23'][index]; }).length === want;
      });
    }));
  const provisionalDrawTournament = realTournament();
  provisionalDrawTournament.id = provisional.id; provisionalDrawTournament.name = 'Neon renomeado';
  provisionalDrawTournament.participants.slice(16, 19).forEach(function (entry) { entry.originCategoryId = 'category-0'; });
  provisionalDrawTournament.teamCompetition = provisionalConfig;
  provisionalDrawTournament.phases[0].teamCompetition = provisionalConfig;
  const provisionalDraw = core.drawInitial(provisionalDrawTournament, { idStamp:'provisional-neon' });
  const provisionalMatches = provisionalDrawTournament.matches || [];
  ok('Neon: sorteio 5+3 gera 96 jogos e 24/12 Fem Light por dia sem cruzar dias',
    provisionalDraw.ok === true && provisionalMatches.length === 96 &&
    provisionalMatches.filter(function (match) { return match.category === 'Fem Light' && match.requiredDay === '2026-10-22'; }).length === 24 &&
    provisionalMatches.filter(function (match) { return match.category === 'Fem Light' && match.requiredDay === '2026-10-23'; }).length === 12 &&
    provisionalMatches.filter(function (match) { return match.category === 'Fem Light'; }).every(function (match) {
      return match.team1Obj.competitionPlayDay === match.requiredDay && match.team2Obj.competitionPlayDay === match.requiredDay;
    }), JSON.stringify({ result:provisionalDraw.ok, reason:provisionalDraw.reason, games:provisionalMatches.length,
      days:['2026-10-22','2026-10-23'].map(function (day) { return provisionalMatches.filter(function (match) { return match.requiredDay === day; }).length; }) }));
  const forgedSelection = realTournament();
  forgedSelection.id = provisional.id; forgedSelection.name = 'Neon renomeado';
  forgedSelection.participants.slice(16, 19).forEach(function (entry) { entry.originCategoryId = 'category-0'; });
  const forgedSelectionConfig = JSON.parse(JSON.stringify(provisionalConfig));
  const chosenExtra = forgedSelectionConfig.schedule.pairDayAssignments.find(function (item) { return selectedExtraIds.has(item.fixedPairId); });
  const unchosenExtra = forgedSelectionConfig.schedule.pairDayAssignments.find(function (item) {
    return !selectedExtraIds.has(item.fixedPairId) && forgedSelection.participants.slice(0, 19).some(function (entry) { return entry.fixedPairId === item.fixedPairId; });
  });
  chosenExtra.day = '2026-10-22'; unchosenExtra.day = '2026-10-23';
  const forgedSelectionResult = core.assignCompetitionTeamsAtInitialDraw(forgedSelection, forgedSelectionConfig);
  ok('Neon: troca de uma das três sorteadas é rejeitada, mesmo mantendo 16/8', forgedSelectionResult.ok === false &&
    forgedSelectionResult.reason === 'competition-pair-day-plan-invalid' && !forgedSelection.competitionTeams);
  const forgedProvisional = realTournament();
  forgedProvisional.id = provisional.id; forgedProvisional.name = 'Neon Nightmare';
  forgedProvisional.participants.slice(16, 19).forEach(function (entry) { entry.originCategoryId = 'category-0'; });
  const forgedProvisionalConfig = JSON.parse(JSON.stringify(provisionalConfig));
  forgedProvisionalConfig.schedule.pairDayAssignments[19].day = '2026-10-22';
  forgedProvisionalConfig.schedule.pairDayAssignments.find(function (item) { return item.fixedPairId === unchosenExtra.fixedPairId; }).day = '2026-10-23';
  const forgedProvisionalResult = core.assignCompetitionTeamsAtInitialDraw(forgedProvisional, forgedProvisionalConfig);
  ok('Neon: dupla marcada movida à quinta é rejeitada', forgedProvisionalResult.ok === false &&
    forgedProvisionalResult.reason === 'competition-pair-day-plan-invalid' && !forgedProvisional.competitionTeams);

  // Estruturas multifase guardam a configuração na fase inicial. O servidor
  // chama a mesma `_buildPhase0Cfg` da web e precisa enxergar essa fonte.
  const neonInPhase = {
    id: 'neon-phase', name: 'Neon em fases', status: 'open', format: 'Liga',
    ligaRoundFormat: 'standard', ligaDrawMode: 'standard', drawManual: true,
    combinedCategories: neonCategories,
    participants: neonPairs.map(function (entry) { return Object.assign({}, entry, { participants: entry.participants.map(function (p) { return Object.assign({}, p); }) }); }),
    phases: [{ teamCompetition: neonConfig }]
  };
  const phaseDraw = core.drawInitial(neonInPhase, { idStamp: 'neon-phase' });
  ok('Neon: configuração da fase inicial também distribui os oito times', phaseDraw.ok &&
    neonInPhase.competitionTeams.length === 8 && neonInPhase.participants.every(function (entry) { return !!entry.competitionTeamId; }),
    JSON.stringify({ result: phaseDraw.ok, teams: neonInPhase.competitionTeams && neonInPhase.competitionTeams.length }));

  // Prova ponta a ponta: o sorteio canônico precisa criar SEIS grades separadas.
  // A antiga separação por categoria existia apenas na eliminatória, o que misturava
  // as duplas no formato de grupos e deixava o Neon com confrontos entre categorias.
  function neonWith(mode) {
    return {
      id: 'neon-full-' + mode, name: 'Neon completo', status: 'open', format: 'Fase de Grupos',
      teamSize: 2, enrollmentMode: 'teams', combinedCategories: neonCategories,
      participants: neonPairs.map(function (entry) { return Object.assign({}, entry, { participants: entry.participants.map(function (member) { return Object.assign({}, member); }) }); }),
      teamCompetition: Object.assign({}, neonConfig, { schedule: Object.assign({}, neonConfig.schedule, { mode: mode }) }),
      phases: [{ teamCompetition: Object.assign({}, neonConfig, { schedule: Object.assign({}, neonConfig.schedule, { mode: mode }) }) }]
    };
  }
  const neonStructured = neonWith('structured');
  const neonStructuredDraw = core.drawInitial(neonStructured, { idStamp: 'neon-completo-estruturado' });
  const byNeonCategory = neonStructured.matches.reduce(function (out, match) {
    (out[String(match.category || '')] || (out[String(match.category || '')] = [])).push(match); return out;
  }, {});
  ok('Neon completo: 96 confrontos = 16 em cada uma das seis categorias', neonStructuredDraw.ok && neonStructured.matches.length === 96 &&
    neonCategories.every(function (category) { return (byNeonCategory[category] || []).length === 16; }),
    JSON.stringify(Object.keys(byNeonCategory).map(function (category) { return [category, byNeonCategory[category].length]; })));
  ok('Neon completo: cada categoria mantém 4 jogos por time, sem confronto interno', neonCategories.every(function (category) {
    const appearances = {};
    return (byNeonCategory[category] || []).every(function (match) {
      appearances[match.p1CompetitionTeamId] = (appearances[match.p1CompetitionTeamId] || 0) + 1;
      appearances[match.p2CompetitionTeamId] = (appearances[match.p2CompetitionTeamId] || 0) + 1;
      return match.p1CompetitionTeamId !== match.p2CompetitionTeamId;
    }) && neonStructured.competitionTeams.every(function (team) { return appearances[team.id] === 4; });
  }));
  const structuredLinks = function (matches) { return matches.map(function (match) {
    return [match.round, [match.p1CompetitionTeamId, match.p2CompetitionTeamId].sort().join(':')].join('|');
  }).sort().join(','); };
  const firstStructuredLinks = structuredLinks(byNeonCategory[neonCategories[0]] || []);
  ok('Neon completo: modo estruturado repete os quatro adversários na mesma ordem nas seis categorias',
    neonCategories.every(function (category) { return structuredLinks(byNeonCategory[category] || []) === firstStructuredLinks; }));
  // Estruturado mantém a MESMA grade entre categorias, mas não pode ordenar
  // `team-1..team-8` a cada chamada: isso transformava um novo sorteio em cópia
  // da chave anterior. Forçamos duas sequências aleatórias opostas sobre duplas
  // manualmente atribuídas, isolando a permutação dos times do sorteio das duplas.
  // Com todos-contra-todos, inverter os oito times pode produzir o MESMO conjunto
  // de pares/rodadas por simetria matemática; exigir links diferentes, portanto,
  // fazia o teste falhar mesmo quando a aleatoriedade era usada corretamente.
  function structuredWithSeed(label, values) {
    var tournament = neonWith('structured');
    tournament.id = 'neon-structured-seed-' + label;
    var manualConfig = Object.assign({}, neonConfig, { formation:'manual', schedule:Object.assign({}, neonConfig.schedule, { mode:'structured' }) });
    tournament.teamCompetition = manualConfig;
    tournament.phases = [{ teamCompetition:manualConfig }];
    tournament.participants.forEach(function (entry, index) { entry.competitionTeamId = 'team-' + ((index % 8) + 1); });
    var oldRandom = Math.random, cursor = 0;
    Math.random = function () { var value = values[cursor % values.length]; cursor++; return value; };
    try { core.drawInitial(tournament, { idStamp:'structured-seed-' + label }); }
    finally { Math.random = oldRandom; }
    var grouped = tournament.matches.reduce(function (out, match) {
      (out[String(match.category || '')] || (out[String(match.category || '')] = [])).push(match); return out;
    }, {});
    return { tournament:tournament, grouped:grouped, links:structuredLinks(grouped[neonCategories[0]] || []), randomCalls:cursor };
  }
  var structuredLow = structuredWithSeed('low', [0]);
  var structuredHigh = structuredWithSeed('high', [0.999999]);
  ok('novo sorteio estruturado consulta a permutação dos times, sem quebrar o padrão entre categorias',
    structuredLow.randomCalls > 0 && structuredHigh.randomCalls > 0 &&
    neonCategories.every(function (category) { return structuredLinks(structuredLow.grouped[category] || []) === structuredLow.links; }) &&
    neonCategories.every(function (category) { return structuredLinks(structuredHigh.grouped[category] || []) === structuredHigh.links; }),
    JSON.stringify({ baixo:structuredLow.links, alto:structuredHigh.links, randomCalls:[structuredLow.randomCalls, structuredHigh.randomCalls] }));
  const neonFree = neonWith('free');
  const neonFreeDraw = core.drawInitial(neonFree, { idStamp: 'neon-completo-livre' });
  const freeByCategory = neonFree.matches.reduce(function (out, match) {
    (out[String(match.category || '')] || (out[String(match.category || '')] = [])).push(match); return out;
  }, {});
  ok('Neon completo: modo livre mantém quatro adversários distintos por time dentro de cada categoria', neonFreeDraw.ok &&
    neonCategories.every(function (category) {
      const opponents = {};
      (freeByCategory[category] || []).forEach(function (match) {
        (opponents[match.p1CompetitionTeamId] || (opponents[match.p1CompetitionTeamId] = [])).push(match.p2CompetitionTeamId);
        (opponents[match.p2CompetitionTeamId] || (opponents[match.p2CompetitionTeamId] = [])).push(match.p1CompetitionTeamId);
      });
      return neonFree.competitionTeams.every(function (team) {
        const list = opponents[team.id] || [];
        return list.length === 4 && new Set(list).size === 4;
      });
    }));

  // Grade Neon vigente: em cada noite/gênero, Light recebe duas duplas por
  // time, Power e Extreme uma. Três partidas para cada dupla dão 48 jogos:
  // 24 Light + 12 Power + 12 Extreme. É um contrato configurável por categoria,
  // não uma exceção codificada para este torneio.
  const currentNeonCategories = ['Fem Light', 'Fem Power', 'Fem Extreme'];
  const currentNeonPairs = [];
  currentNeonCategories.forEach(function (category, categoryIndex) {
    const quantity = category === 'Fem Light' ? 16 : 8;
    for (let i = 0; i < quantity; i++) currentNeonPairs.push(dupla(500 + categoryIndex * 100 + i, category));
  });
  const currentNeonConfig = {
    enabled: true, teamCount: 8,
    teamNames: ['Blast', 'Blackout', 'Eclipse', 'Panic', 'Phantom', 'Venom', 'Volt', 'Vortex'],
    formation: 'draw', internalMatches: 'avoid',
    schedule: {
      enabled: true, teamsPerGroup: 8, gamesPerPair: 3, gamesPerTeam: 3,
      pairsPerTeamByCategory: { 'Fem Light': 2, 'Fem Power': 1, 'Fem Extreme': 1 },
      gamesPerPairByCategory: { 'Fem Light': 3, 'Fem Power': 3, 'Fem Extreme': 3 },
      mode: 'structured'
    }
  };
  const currentNeonTournament = {
    id: 'neon-current-four-pairs', name: 'Neon vigente', status: 'open',
    format: 'Fase de Grupos', teamSize: 2, enrollmentMode: 'teams',
    combinedCategories: currentNeonCategories, participants: currentNeonPairs,
    teamCompetition: currentNeonConfig,
    phases: [{ teamCompetition: currentNeonConfig }]
  };
  const currentNeonDraw = core.drawInitial(currentNeonTournament, { idStamp: 'neon-current-four-pairs' });
  const currentByCategory = (currentNeonTournament.matches || []).reduce(function (out, match) {
    (out[String(match.category || '')] || (out[String(match.category || '')] = [])).push(match); return out;
  }, {});
  const currentAppearances = {};
  (currentNeonTournament.matches || []).forEach(function (match) {
    [match.p1, match.p2].forEach(function (pair) { currentAppearances[pair] = (currentAppearances[pair] || 0) + 1; });
  });
  ok('Neon vigente: 32 duplas produzem 48 jogos por categoria (24/12/12)', currentNeonDraw.ok &&
    currentNeonTournament.participants.length === 32 && currentNeonTournament.matches.length === 48 &&
    (currentByCategory['Fem Light'] || []).length === 24 &&
    (currentByCategory['Fem Power'] || []).length === 12 &&
    (currentByCategory['Fem Extreme'] || []).length === 12,
    JSON.stringify(Object.keys(currentByCategory).map(function (category) { return [category, currentByCategory[category].length]; })));
  ok('Neon vigente: cada time recebe 2 Light, 1 Power e 1 Extreme', currentNeonTournament.competitionTeams.every(function (team) {
    return currentNeonCategories.every(function (category) {
      const expected = category === 'Fem Light' ? 2 : 1;
      return currentNeonTournament.participants.filter(function (entry) {
        return entry.competitionTeamId === team.id && entry.category === category;
      }).length === expected;
    });
  }));
  ok('Neon vigente: toda dupla disputa exatamente 3 jogos', currentNeonTournament.participants.every(function (entry) {
    return currentAppearances[entry.displayName] === 3;
  }), JSON.stringify(currentAppearances));
  ok('Neon vigente: duas duplas Light da mesma equipe nunca se enfrentam', (currentNeonTournament.matches || []).every(function (match) {
    return match.p1CompetitionTeamId !== match.p2CompetitionTeamId;
  }));

  // A escolha não é uma constante do Neon: cada categoria pode definir quantos
  // jogos a sua dupla fará. Este cenário reduz Power para 2 e Extreme para 1.
  const flexibleNeonTournament = JSON.parse(JSON.stringify(currentNeonTournament));
  flexibleNeonTournament.id = 'neon-category-games';
  flexibleNeonTournament.status = 'open';
  delete flexibleNeonTournament.matches;
  delete flexibleNeonTournament.groups;
  delete flexibleNeonTournament.competitionTeams;
  flexibleNeonTournament.participants.forEach(function (entry) {
    delete entry.competitionTeamId; delete entry.competitionTeamHue;
    delete entry.competitionTeamSaturation; delete entry.competitionTeamColor;
  });
  flexibleNeonTournament.teamCompetition.schedule.gamesPerPairByCategory = { 'Fem Light': 3, 'Fem Power': 2, 'Fem Extreme': 1 };
  flexibleNeonTournament.phases[0].teamCompetition = flexibleNeonTournament.teamCompetition;
  const flexibleNeonDraw = core.drawInitial(flexibleNeonTournament, { idStamp: 'neon-category-games' });
  const flexibleByCategory = (flexibleNeonTournament.matches || []).reduce(function (out, match) {
    (out[String(match.category || '')] || (out[String(match.category || '')] = [])).push(match); return out;
  }, {});
  ok('Neon flexível: motor respeita jogos diferentes por categoria (24/8/4)', flexibleNeonDraw.ok &&
    flexibleNeonTournament.matches.length === 36 && (flexibleByCategory['Fem Light'] || []).length === 24 &&
    (flexibleByCategory['Fem Power'] || []).length === 8 && (flexibleByCategory['Fem Extreme'] || []).length === 4,
    JSON.stringify(Object.keys(flexibleByCategory).map(function (category) { return [category, flexibleByCategory[category].length]; })));
})();

console.log('════════════════════════════════════════');
console.log('CLIENTE × SERVIDOR — estrutura da chave');
console.log('════════════════════════════════════════');

CASES.forEach(function (row) {
  const label = row[0], extra = row[1], n = row[2];

  // lado CLIENTE (generateDrawFunction real, via harness)
  const tC = mkT('C_' + label.slice(0, 6), JSON.parse(JSON.stringify(extra)), n);
  CW.AppStore.tournaments = [tC];
  CW.AppStore.currentUser = { uid: 'uOrg', email: 'org@x.com', displayName: 'Org' };
  let cliErr = null;
  try { CW.generateDrawFunction(tC.id); } catch (e) { cliErr = e.message; }

  // lado SERVIDOR (draw-core.drawInitial)
  const tS = mkT('S_' + label.slice(0, 6), JSON.parse(JSON.stringify(extra)), n);
  const res = core.drawInitial(tS);

  if (cliErr) { ok(label + ' — cliente não estourou', false, cliErr); return; }
  ok(label + ' — servidor sorteou', res.ok === true, res.ok ? undefined : JSON.stringify(res));
  if (!res.ok) return;

  const sc = structure(tC), ss = structure(tS);
  const keys = Object.keys(sc);
  const diff = keys.filter(function (k) { return JSON.stringify(sc[k]) !== JSON.stringify(ss[k]); });
  ok(label + ' — MESMA estrutura', diff.length === 0,
    diff.length === 0 ? ss.storage + ', ' + (ss.rodadas ? ss.jogosR0 + ' jogos/R0' : ss.jogosFlat + ' jogos')
      : '\n      difere em: ' + diff.map(function (k) { return k + ' cliente=' + JSON.stringify(sc[k]) + ' servidor=' + JSON.stringify(ss[k]); }).join('\n      '));
});

console.log('');
console.log('════════════════════════════════════════');
console.log('GUARDS');
console.log('════════════════════════════════════════');

// Nunca re-sortear: re-sorteio é decisão do organizador no cliente.
(function () {
  const t = mkT('já', { format: 'Eliminatórias Simples', matches: [{ id: 'm1' }] }, 8);
  const r = core.drawInitial(t);
  ok('chave já existe → recusa (already-drawn)', r.ok === false && r.reason === 'already-drawn', JSON.stringify(r));
})();

// ── Classificatória por rodadas como configuração de fase (via CF) ─────────────────────
// ÂNCORA (vermelha até o drawInitial canonizar o Suíço; ver project_draw_canonization_cf
// _phase23_deferred): a resolução 'swiss' NÃO é "vira o torneio em Suíço" — são K rodadas
// Suíço classificatórias que reduzem o elenco a uma potência de 2 e entregam pra chave.
// Modelo (espelha o ramo client-side legado tournaments-draw.js): monta 2 FASES —
// fase 0 = Suíço classificatória (K rodadas), fase 1 = a eliminatória original puxando o
// top-lo (maior pow2 ≤ N) da classificação. HOJE isso roda 100% no cliente (drawInitial
// recusa 'swiss-not-canonical'); a canonização move pra CF. REPRODUZ A FALHA: falha
// enquanto drawInitial recusa, passa quando ele monta as fases + gera a rodada 1.
(function () {
  const N = 12;                    // não-pow2 → lo=8, K=ceil(log2(12))=4
  const lo = 8, half = Math.floor(N / 2);
  const t = mkT('classification-rounds', { format: 'Eliminatórias Simples', classificationTransition: { rounds: 4, pairing: { strategy: 'ranking_clusters', entryMode: 'fixed' } } }, N);
  const r = core.drawInitial(t);
  ok('Classificatória por rodadas → servidor sorteia', r.ok === true, JSON.stringify(r).slice(0, 120));
  const phases = Array.isArray(t.phases) ? t.phases : [];
  const p0 = phases[0] || {}, p1 = phases[1] || {};
  ok('Classificatória por rodadas → 2 fases (classificatória + elim)', phases.length === 2, 'phases=' + phases.length);
  ok('Classificatória por rodadas → fase 0 não depende de rótulo legado',
    p0.formatCode === 'classification_rounds' && p0.format == null,
    JSON.stringify({ fc: p0.formatCode, f: p0.format }));
  ok('Classificatória por rodadas → as duas fases já nascem no contrato canônico',
    p0.kind === 'classification' && p0.classification && p0.classification.pairing && p0.classification.pairing.strategy === 'ranking_clusters' &&
      p1.kind === 'elimination' && p1.elimination && p1.elimination.bracketType === 'single',
    JSON.stringify({ p0: p0.classification, p1: p1.elimination }));
  ok('Classificatória por rodadas → fase 0 preserva K rodadas', (parseInt(p0.rounds, 10) || 0) === 4, 'rounds=' + p0.rounds);
  ok('Classificatória por rodadas → fase 1 puxa top-lo (rankTo=' + lo + ')',
    !!(p1.source && p1.source.type === 'previous_phase' && p1.source.mapping &&
       p1.source.mapping[0] && p1.source.mapping[0].rankTo === lo),
    JSON.stringify(p1.source));
  ok('Classificatória por rodadas → currentPhaseIndex=0', t.currentPhaseIndex === 0, 'idx=' + t.currentPhaseIndex);
  ok('Classificatória por rodadas → não deixa marcador suíço no topo', t.classifyFormat == null && t.currentStage == null, JSON.stringify({ classifyFormat: t.classifyFormat, currentStage: t.currentStage }));
  ok('Classificatória por rodadas → standings com N entradas', Array.isArray(t.standings) && t.standings.length === N,
    'standings=' + (t.standings && t.standings.length));
  ok('Classificatória por rodadas → rodada 1 gerada (storage nativo t.rounds)', Array.isArray(t.rounds) && t.rounds.length === 1,
    'rounds=' + (t.rounds && t.rounds.length));
  const r1 = (t.rounds && t.rounds[0] && t.rounds[0].matches) || [];
  const r1real = r1.filter(function (m) { return !m.isSitOut && !m.isBye; });
  ok('Classificatória por rodadas → R1 pareia todos (~floor(N/2)=' + half + ' jogos)', r1real.length === half, 'jogos=' + r1real.length);
  ok('Classificatória por rodadas → status active', t.status === 'active', String(t.status));
  ok('Classificatória por rodadas → decisão temporária limpa', t.classificationTransition == null && t.p2Resolution == null, JSON.stringify({ transition: t.classificationTransition, p2: t.p2Resolution }));
  ok('Classificatória por rodadas → presença limpa', !!(t.checkedIn && Object.keys(t.checkedIn).length === 0));
})();

// A decisão pendente de versões antigas continua executável, mas deve ser
// traduzida ANTES de gravar o sorteio: nenhum marcador "swiss" fica no doc novo.
(function () {
  const t = mkT('legacy-swiss-decision', { format: 'Eliminatórias Simples', p2Resolution: 'swiss', swissRounds: 3 }, 12);
  const r = core.drawInitial(t);
  const p0 = (t.phases || [])[0] || {};
  ok('decisão suíça legada → sorteia pela classificatória canônica', r.ok === true && p0.kind === 'classification', JSON.stringify(r).slice(0, 120));
  ok('decisão suíça legada → elimina marcadores transitórios',
    t.p2Resolution == null && t.classifyFormat == null && t.currentStage == null && t.swissRounds == null &&
    p0.classification && p0.classification.pairing && p0.classification.pairing.strategy === 'ranking_clusters',
    JSON.stringify({ p2: t.p2Resolution, classify: t.classifyFormat, stage: t.currentStage, rounds: t.swissRounds, pairing: p0.classification && p0.classification.pairing }));
})();

// Diversidade no cluster: uma repetição não é proibida, mas não pode ocorrer
// enquanto ainda houver adversário inédito no mesmo cluster de classificação.
(function () {
  const names = ['A', 'B', 'C', 'D'];
  const t = {
    id: 'cluster-diversity', format: 'Eliminatórias Simples', status: 'active',
    participants: names.map((displayName, i) => ({ uid: 'cluster-' + i, displayName })),
    standings: names.map(name => ({ name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0 })),
    phases: [{ kind: 'classification', rounds: 4, classification: { structure: 'round_robin', pairing: { strategy: 'ranking_clusters', entryMode: 'fixed', clusterSize: 4, rematchPolicy: 'exhaust_cluster_before_repeat' } } }],
    currentPhaseIndex: 0,
    rounds: [{ round: 1, matches: [{ p1: 'A', p2: 'B' }, { p1: 'C', p2: 'D' }] }]
  };
  core._window._generateNextRound(t, { ts: 123 });
  const nextMatches = (t.rounds[1].matches || []).filter(m => !m.isBye && !m.isSitOut);
  const pairs = nextMatches.map(m => [m.p1, m.p2].sort().join('|')).sort();
  ok('cluster → esgota adversários inéditos antes de repetir', pairs.join(',') === 'A|C,B|D', pairs.join(','));
  // A chave anti-repetição e os slots da súmula usam a mesma tradução local
  // nome → uid. Este ensaio impede que uma cópia vendor perca `_uidForName`:
  // sem ela, a geração acima lança ReferenceError antes de devolver os jogos.
  ok('cluster → confronto e súmula preservam uid', nextMatches.every(m =>
    /^cluster-[0-3]$/.test(m.p1Uid || '') && /^cluster-[0-3]$/.test(m.p2Uid || '')),
  JSON.stringify(nextMatches.map(m => [m.p1Uid, m.p2Uid])));
})();

// A configuração nova pode coexistir com o rótulo legado "Liga", mas entradas
// fixas não podem cair no gerador rotativo de parceiros. O contrato da fase vence.
(function () {
  const names = ['A', 'B', 'C', 'D'];
  const t = {
    id: 'fixed-ranking-beats-legacy-liga', format: 'Liga', status: 'active', teamSize: 1,
    participants: names.map((displayName, i) => ({ uid: 'fixed-' + i, displayName })),
    phases: [{ kind: 'classification', rounds: 3, classification: { structure: 'round_robin', pairing: { strategy: 'ranking_clusters', entryMode: 'fixed', clusterSize: 4, rematchPolicy: 'exhaust_cluster_before_repeat' } } }],
    currentPhaseIndex: 0,
    rounds: []
  };
  core._window._generateNextRound(t, { ts: 1231 });
  const real = (t.rounds[0].matches || []).filter(m => !m.isBye && !m.isSitOut);
  ok('classificatória fixa → não entra no gerador rotativo da Liga', real.length === 2 && real.every(m => !m.isMonarch && !m.team1 && !m.team2), JSON.stringify(real));
})();

// "Livre" troca a ordem dos confrontos, não a identidade das entradas nem o
// tipo de gerador. Sem esta guarda, esse botão voltaria a formar parceiros.
(function () {
  const names = ['A', 'B', 'C', 'D'];
  const t = {
    id: 'fixed-free-draw', format: 'Liga', status: 'active', teamSize: 1,
    participants: names.map((displayName, i) => ({ uid: 'free-' + i, displayName })),
    phases: [{ kind: 'classification', rounds: 3, classification: { structure: 'round_robin', pairing: { strategy: 'free_draw', entryMode: 'fixed', rematchPolicy: 'exhaust_cluster_before_repeat' } } }],
    currentPhaseIndex: 0,
    rounds: []
  };
  core._window._generateNextRound(t, { ts: 1232, rnd: () => 0 });
  const real = (t.rounds[0].matches || []).filter(m => !m.isBye && !m.isSitOut);
  ok('classificatória fixa livre → mantém confrontos entre entradas', real.length === 2 && real.every(m => !m.isMonarch && !m.team1 && !m.team2), JSON.stringify(real));
})();

// Cluster não é uma divisão congelada no sorteio inicial. A cada rodada ele nasce
// novamente da classificação acumulada: aqui F e H começam no bloco inferior,
// mas sobem após os resultados e passam a disputar o bloco superior na rodada 3.
(function () {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const played = function (p1, p2, winner, scoreP1, scoreP2) {
    return { p1, p2, winner, scoreP1, scoreP2 };
  };
  const t = {
    id: 'dynamic-ranking-clusters', format: 'Eliminatórias Simples', status: 'active',
    participants: names.map((displayName, i) => ({ uid: 'dynamic-' + i, displayName })),
    phases: [{ kind: 'classification', rounds: 5, classification: { structure: 'round_robin', pairing: { strategy: 'ranking_clusters', entryMode: 'fixed', clusterSize: 4, rematchPolicy: 'exhaust_cluster_before_repeat' } } }],
    currentPhaseIndex: 0,
    rounds: [
      { round: 1, matches: [
        played('A', 'B', 'B', 0, 6), played('C', 'D', 'D', 0, 6),
        played('E', 'F', 'F', 0, 6), played('G', 'H', 'H', 0, 6)
      ] },
      { round: 2, matches: [
        played('B', 'D', 'B', 6, 5), played('F', 'H', 'F', 6, 5),
        played('A', 'C', 'A', 6, 5), played('E', 'G', 'E', 6, 5)
      ] }
    ]
  };
  core._window._generateNextRound(t, { ts: 124 });
  const pairs = (t.rounds[2].matches || []).filter(m => !m.isBye && !m.isSitOut).map(m => [m.p1, m.p2].sort().join('|')).sort();
  ok('cluster → recalcula grupos pela classificação de cada rodada', pairs.join(',') === 'A|E,B|F,C|G,D|H', pairs.join(','));
})();

// O sorteio LIMPA a presença (v4.1.30).
(function () {
  const t = mkT('pres', { format: 'Eliminatórias Simples', checkedIn: { uA: 1 }, absent: { uB: 1 } }, 8);
  const r = core.drawInitial(t);
  ok('sorteio limpa presença (checkedIn/absent)', r.ok && Object.keys(t.checkedIn).length === 0 && Object.keys(t.absent).length === 0);
})();

console.log('');
console.log('════════════════════════════════════════');
if (fail === 0) { console.log('✅ drawInitial: ' + pass + ' ok, 0 falharam'); }
else { console.log('❌ drawInitial: ' + pass + ' ok, ' + fail + ' FALHARAM'); process.exit(1); }
