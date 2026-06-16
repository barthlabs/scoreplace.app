/* Teste headless do motor de fases — node js/views/phases-engine.test.js
 * Simula o Confra: fase 1 = 4 grupos de 4 (Rei/Rainha); fase 2 = Dupla
 * Eliminatória puxando 1º-2º de cada grupo → Ouro e 3º-4º → Prata, duplas fixas,
 * convergindo em grande final + 3º/4º.
 */
var eng = require('./phases-engine.js');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ FALHOU:', msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

// 4 grupos (A,B,C,D) de 4 jogadores, standings já ordenado por colocação.
function grp(letter) {
  return {
    name: 'Grupo ' + letter,
    standings: [
      { name: letter + '1', uid: 'u' + letter + '1' },
      { name: letter + '2', uid: 'u' + letter + '2' },
      { name: letter + '3', uid: 'u' + letter + '3' },
      { name: letter + '4', uid: 'u' + letter + '4' }
    ]
  };
}
var prevGroups = ['A', 'B', 'C', 'D'].map(grp);
var computeStandings = function (g) { return g.standings; };

var phaseCfg = {
  name: 'Ouro/Prata',
  formatCode: 'elim_dupla',
  fixedPairs: true,
  grandFinal: true,
  thirdPlace: true,
  source: {
    type: 'previous_phase', byGroupRank: true,
    mapping: [
      { dest: 'upper', rankFrom: 1, rankTo: 2 },
      { dest: 'lower', rankFrom: 3, rankTo: 4 }
    ]
  }
};

var res = eng.buildPhaseBrackets(prevGroups, phaseCfg, computeStandings, 'ph2');

console.log('— Entrantes por destino —');
console.log('  Ouro :', res.byDest.upper.map(function (t) { return t.displayName; }).join('  |  '));
console.log('  Prata:', res.byDest.lower.map(function (t) { return t.displayName; }).join('  |  '));

// 1) Duplas fixas corretas: 1º+2º de cada grupo no Ouro; 3º+4º na Prata.
eq(res.byDest.upper.map(function (t) { return t.displayName; }),
   ['A1 / A2', 'B1 / B2', 'C1 / C2', 'D1 / D2'], 'Ouro = 1º+2º de cada grupo');
eq(res.byDest.lower.map(function (t) { return t.displayName; }),
   ['A3 / A4', 'B3 / B4', 'C3 / C4', 'D3 / D4'], 'Prata = 3º+4º de cada grupo');

// 2) Cada dupla preserva uids dos 2 membros.
ok(res.byDest.upper[0].p1Uid === 'uA1' && res.byDest.upper[0].p2Uid === 'uA2', 'dupla preserva uids dos membros');
ok(res.byDest.upper[0].fixedPair === true, 'dupla marcada como fixedPair');

// 3) Cada tier (4 times) = 2 semis + 1 final = 3 matches.
var goldMatches = res.matches.filter(function (m) { return m.bracket === 'gold'; });
var silverMatches = res.matches.filter(function (m) { return m.bracket === 'silver'; });
eq(goldMatches.length, 3, 'chave Ouro tem 3 jogos (2 semis + final)');
eq(silverMatches.length, 3, 'chave Prata tem 3 jogos (2 semis + final)');

// 4) Convergência existe: grande final + 3º/4º.
var gf = res.matches.filter(function (m) { return m.bracket === 'grandfinal'; })[0];
var third = res.matches.filter(function (m) { return m.bracket === 'thirdplace'; })[0];
ok(!!gf, 'grande final existe');
ok(!!third, 'disputa de 3º/4º existe');

// 5) Final do Ouro → grande final p1 (vencedor) e 3º/4º p1 (perdedor).
var goldFinal = res.matches.filter(function (m) { return m.id === res.tiers.upper.finalMatchId; })[0];
var silverFinal = res.matches.filter(function (m) { return m.id === res.tiers.lower.finalMatchId; })[0];
ok(goldFinal && goldFinal.nextMatchId === gf.id && goldFinal.nextSlot === 'p1', 'campeão Ouro vai pra grande final (p1)');
ok(goldFinal && goldFinal.loserNextMatchId === third.id && goldFinal.loserNextSlot === 'p1', 'vice Ouro vai pra 3º/4º (p1)');
ok(silverFinal && silverFinal.nextMatchId === gf.id && silverFinal.nextSlot === 'p2', 'campeão Prata vai pra grande final (p2)');
ok(silverFinal && silverFinal.loserNextMatchId === third.id && silverFinal.loserNextSlot === 'p2', 'vice Prata vai pra 3º/4º (p2)');

// 6) Semis do Ouro semeadas 1×4, 2×3 (pelos displayNames dos times) — seed simples.
var goldR1 = goldMatches.filter(function (m) { return m.round === 1; });
eq(goldR1.length, 2, 'Ouro: 2 semifinais');
eq([goldR1[0].p1, goldR1[0].p2], ['A1 / A2', 'D1 / D2'], 'Ouro semi 1: seed 1×4');
eq([goldR1[1].p1, goldR1[1].p2], ['B1 / B2', 'C1 / C2'], 'Ouro semi 2: seed 2×3');

// 7) Sem duplas fixas: cada classificado entra individual.
var noPairCfg = JSON.parse(JSON.stringify(phaseCfg)); noPairCfg.fixedPairs = false;
var res2 = eng.buildPhaseBrackets(prevGroups, noPairCfg, computeStandings, 'ph2b');
eq(res2.byDest.upper.length, 8, 'sem duplas fixas: Ouro = 8 individuais (2 por grupo)');
eq(res2.byDest.upper.map(function (t) { return t.displayName; }).slice(0, 3), ['A1', 'A2', 'B1'], 'individuais preservam nomes');

// 8) Caso ímpar / tier com 1 time só (1 grupo) → soleWinner, sem matches.
var oneGroup = [grp('A')];
var res3 = eng.buildPhaseBrackets(oneGroup, phaseCfg, computeStandings, 'ph2c');
eq(res3.tiers.upper.soleWinner, 'A1 / A2', 'tier de 1 time: soleWinner direto');
ok(res3.converge.gf.p1 === 'A1 / A2', 'soleWinner Ouro preenche grande final p1 direto');

// 9) Playthrough: replica o roteamento que _advanceWinner fará (vencedor via
//    nextMatchId/nextSlot, perdedor via loserNextMatchId/loserNextSlot) e joga a
//    fase 2 inteira, conferindo que grande final + 3º/4º recebem os times certos.
function findM(ms, id) { return ms.filter(function (m) { return m.id === id; })[0]; }
function resolve(ms, m, winnerName) {
  m.winner = winnerName;
  var loserName = (winnerName === m.p1) ? m.p2 : m.p1;
  if (m.nextMatchId) { var nx = findM(ms, m.nextMatchId); if (nx) nx[m.nextSlot || 'p1'] = winnerName; }
  if (m.loserNextMatchId) { var ln = findM(ms, m.loserNextMatchId); if (ln) ln[m.loserNextSlot || 'p1'] = loserName; }
}
var fresh = eng.buildPhaseBrackets(prevGroups, phaseCfg, computeStandings, 'ph2play');
var M = fresh.matches;
// Ouro: A1/A2 vence as 2 semis? Não — joga: semi1 A1/A2 x D1/D2 → A1/A2; semi2 B1/B2 x C1/C2 → B1/B2; final A1/A2 x B1/B2 → A1/A2
var gR1 = M.filter(function (m) { return m.bracket === 'gold' && m.round === 1; });
resolve(M, gR1[0], 'A1 / A2');
resolve(M, gR1[1], 'B1 / B2');
var gFinal = findM(M, fresh.tiers.upper.finalMatchId);
eq([gFinal.p1, gFinal.p2], ['A1 / A2', 'B1 / B2'], 'final do Ouro montada pelos vencedores das semis');
resolve(M, gFinal, 'A1 / A2'); // campeão Ouro = A1/A2, vice = B1/B2
// Prata
var sR1 = M.filter(function (m) { return m.bracket === 'silver' && m.round === 1; });
resolve(M, sR1[0], 'A3 / A4');
resolve(M, sR1[1], 'B3 / B4');
var sFinal = findM(M, fresh.tiers.lower.finalMatchId);
resolve(M, sFinal, 'A3 / A4'); // campeão Prata = A3/A4, vice = B3/B4
// Convergência
var gfM = M.filter(function (m) { return m.bracket === 'grandfinal'; })[0];
var thM = M.filter(function (m) { return m.bracket === 'thirdplace'; })[0];
eq([gfM.p1, gfM.p2], ['A1 / A2', 'A3 / A4'], 'grande final = campeão Ouro × campeão Prata');
eq([thM.p1, thM.p2], ['B1 / B2', 'B3 / B4'], '3º/4º = vice Ouro × vice Prata (perdedores das 2 finais)');

// 10) Integração: materializeNextPhase sobre um torneio "Confra" inteiro.
//     Fase 0 = Liga Rei/Rainha (1 rodada, 4 grupos decididos). Avança p/ fase 1.
function monarchGroup(letter) {
  // grupo com matches decididos cujas standings dão o ranking A1>A2>A3>A4
  return {
    name: 'Grupo ' + letter,
    players: [letter + '1', letter + '2', letter + '3', letter + '4'],
    standings: [
      { name: letter + '1', uid: 'u' + letter + '1' },
      { name: letter + '2', uid: 'u' + letter + '2' },
      { name: letter + '3', uid: 'u' + letter + '3' },
      { name: letter + '4', uid: 'u' + letter + '4' }
    ],
    matches: [{ winner: letter + '1', p1: letter + '1', p2: letter + '2' }] // decidido
  };
}
var tourn = {
  id: 'confra1',
  currentPhaseIndex: 0,
  phases: [
    { name: 'Classificatória', formatCode: 'liga', reiRainha: true, rounds: 1, source: { type: 'enrollment' } },
    {
      name: 'Ouro/Prata', formatCode: 'elim_dupla', fixedPairs: true, grandFinal: true, thirdPlace: true,
      source: { type: 'previous_phase', byGroupRank: true, mapping: [{ dest: 'upper', rankFrom: 1, rankTo: 2 }, { dest: 'lower', rankFrom: 3, rankTo: 4 }] }
    }
  ],
  rounds: [{ round: 1, phase: 'monarch', monarchGroups: ['A', 'B', 'C', 'D'].map(monarchGroup) }],
  matches: []
};
var stand = function (g) { return g.standings; };

ok(eng.phaseComplete(tourn) === true, 'fase 1 (4 grupos decididos) reconhecida como completa');
var mres = eng.materializeNextPhase(tourn, stand, 'confraP1');
ok(mres.ok === true, 'materializeNextPhase ok');
eq(tourn.currentPhaseIndex, 1, 'currentPhaseIndex avançou para 1');
ok(tourn.currentStage === 'phase1', 'currentStage = phase1');
var golds = tourn.matches.filter(function (m) { return m.bracket === 'gold'; });
var silvers = tourn.matches.filter(function (m) { return m.bracket === 'silver'; });
ok(golds.length === 3 && silvers.length === 3, 'torneio recebeu 3 jogos Ouro + 3 Prata');
ok(tourn.matches.every(function (m) { return m.phaseIndex === 1; }), 'jogos da fase 2 tagueados com phaseIndex=1');
ok(tourn.matches.some(function (m) { return m.bracket === 'grandfinal'; }) && tourn.matches.some(function (m) { return m.bracket === 'thirdplace'; }), 'grande final + 3º/4º anexados ao torneio');
// idempotência: 2ª chamada não duplica jogos (fase 1 já é a última → no-next-phase)
var matchCountBefore = tourn.matches.length;
var mres2 = eng.materializeNextPhase(tourn, stand, 'confraP1');
ok(mres2.ok === false, 'materialize não re-materializa (ok=false)');
ok(tourn.matches.length === matchCountBefore, 'materialize é idempotente (não duplica jogos)');
// guard contra double-call race: index ainda não atualizou (=0) mas _phaseMaterialized=1
var tourn3 = JSON.parse(JSON.stringify(tourn));
tourn3.phases.push({ name: 'Fase 3', formatCode: 'elim_simples', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 1 }] } });
tourn3.currentPhaseIndex = 0; // simula chamada repetida antes do índice subir
var mres3 = eng.materializeNextPhase(tourn3, stand, 'x');
ok(mres3.ok === false && mres3.error === 'already-materialized', 'guard _phaseMaterialized barra double-call antes do índice atualizar');

// Estratégia de pareamento: 'top' (adjacentes 1º+2º,3º+4º) vs 'balanced' (extremos 1º+4º,2º+3º)
(function () {
  var cs4 = function () { return [{ name: 'P1' }, { name: 'P2' }, { name: 'P3' }, { name: 'P4' }]; };
  var mp4 = [{ dest: 'main', rankFrom: 1, rankTo: 4 }];
  var topN = (eng.buildEntrantsByDest([{}], mp4, true, cs4, 'top').main || []).map(function (t) { return t.displayName; });
  var balN = (eng.buildEntrantsByDest([{}], mp4, true, cs4, 'balanced').main || []).map(function (t) { return t.displayName; });
  eq(topN, ['P1 / P2', 'P3 / P4'], "pareamento 'top' = 1º+2º · 3º+4º");
  eq(balN, ['P1 / P4', 'P2 / P3'], "pareamento 'balanced' = 1º+4º · 2º+3º");
})();

// Copa do Mundo: Grupos (t.groups) → Eliminatória puxando top-2 de cada grupo
(function () {
  function grp(names) { return { players: names.map(function (n) { return { name: n }; }), matches: [{ winner: names[0] }] }; }
  var t = {
    id: 'wc',
    groups: [grp(['A1', 'A2', 'A3', 'A4']), grp(['B1', 'B2', 'B3', 'B4'])],
    phases: [
      { name: 'Grupos', formatCode: 'grupos_mata', source: { type: 'enrollment' } },
      { name: 'Eliminatória', formatCode: 'elim_simples', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 2 }] }, fixedPairs: false }
    ],
    currentPhaseIndex: 0, matches: []
  };
  var cs = function (g) { return (g.players || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }); };
  ok(eng.phaseComplete(t) === true, 'fase de grupos (t.groups) reconhecida como completa');
  var r = eng.materializeNextPhase(t, cs, 'wc-elim');
  ok(r.ok === true, 'materializa eliminatória a partir dos grupos');
  var mains = (t.matches || []).filter(function (m) { return m.bracket === 'main'; });
  var inBracket = {};
  mains.forEach(function (m) { [m.p1, m.p2].forEach(function (p) { if (p && p !== 'TBD') inBracket[p] = true; }); });
  ok(inBracket.A1 && inBracket.A2 && inBracket.B1 && inBracket.B2, 'chave contém os top-2 de cada grupo (A1,A2,B1,B2)');
  ok(!inBracket.A3 && !inBracket.A4 && !inBracket.B3 && !inBracket.B4, '3º/4º de cada grupo NÃO entram');
})();

// 11) Escopo 'overall': ranking AGREGADO entre grupos (top-N global, ignora grupo).
//     Grupos A (wins 3,2) e B (wins 4,1) → global por vitórias: B1(4),A1(3),A2(2),B2(1).
(function () {
  var gA = { standings: [{ name: 'A1', wins: 3 }, { name: 'A2', wins: 2 }] };
  var gB = { standings: [{ name: 'B1', wins: 4 }, { name: 'B2', wins: 1 }] };
  var cs = function (g) { return g.standings; };
  var mp = [{ dest: 'main', rankFrom: 1, rankTo: 4 }];
  // per_group (default): pareia dentro do grupo → A1/A2 · B1/B2
  var perGroup = eng.buildEntrantsByDest([gA, gB], mp, true, cs, 'top')
    .main.map(function (t) { return t.displayName; });
  eq(perGroup, ['A1 / A2', 'B1 / B2'], 'per_group pareia dentro do grupo');
  // overall: ranking global B1>A1>A2>B2 → top 1+2 / 3+4 = B1/A1 · A2/B2
  var overall = eng.buildEntrantsByDest([gA, gB], mp, true, cs, 'top', { scope: 'overall' })
    .main.map(function (t) { return t.displayName; });
  eq(overall, ['B1 / A1', 'A2 / B2'], 'overall pareia pelo ranking agregado (top global)');
})();

// 12) draw_among: sorteio entre os classificados (shuffle injetado = reverso, determinístico).
(function () {
  var cs = function () { return [{ name: 'P1' }, { name: 'P2' }, { name: 'P3' }, { name: 'P4' }]; };
  var mp = [{ dest: 'main', rankFrom: 1, rankTo: 4 }];
  var rev = function (a) { return a.slice().reverse(); };
  var drawn = eng.buildEntrantsByDest([{}], mp, true, cs, 'draw_among', { shuffle: rev })
    .main.map(function (t) { return t.displayName; });
  eq(drawn, ['P4 / P3', 'P2 / P1'], 'draw_among pareia o embaralhado (shuffle reverso)');
})();

// 13) keep via rankingBasis='team': colocações já são duplas → seguem juntas, uids preservados.
(function () {
  var teamGroup = {
    standings: [
      { name: 'A1 / A2', p1Name: 'A1', p1Uid: 'uA1', p2Name: 'A2', p2Uid: 'uA2', fixedPair: true },
      { name: 'B1 / B2', p1Name: 'B1', p1Uid: 'uB1', p2Name: 'B2', p2Uid: 'uB2', fixedPair: true }
    ]
  };
  var cs = function (g) { return g.standings; };
  var mp = [{ dest: 'main', rankFrom: 1, rankTo: 2 }];
  var kept = eng.buildEntrantsByDest([teamGroup], mp, true, cs, 'top', { rankingBasis: 'team' });
  eq(kept.main.map(function (t) { return t.displayName; }), ['A1 / A2', 'B1 / B2'], 'keep: duplas seguem juntas (não re-pareia)');
  ok(kept.main[0].p1Uid === 'uA1' && kept.main[0].p2Uid === 'uA2', 'keep: uids dos 2 membros preservados');
  ok(kept.main[0].fixedPair === true, 'keep: dupla mantém fixedPair');
})();

// 14) keep IMPLÍCITO: mesmo sem rankingBasis, se a colocação já é dupla, não re-pareia.
(function () {
  var teamGroup = { standings: [
    { name: 'X1 / X2', p1Name: 'X1', p1Uid: 'uX1', p2Name: 'X2', p2Uid: 'uX2', fixedPair: true }
  ] };
  var cs = function (g) { return g.standings; };
  var mp = [{ dest: 'main', rankFrom: 1, rankTo: 1 }];
  var kept = eng.buildEntrantsByDest([teamGroup], mp, true, cs, 'top'); // sem opts
  eq(kept.main.map(function (t) { return t.displayName; }), ['X1 / X2'], 'keep implícito: dupla pré-formada passa direto');
  ok(kept.main[0].p2Uid === 'uX2', 'keep implícito: membros preservados');
})();

// 15) keep por NOME "X / Y" (Fase de Grupos de duplas): standing só tem name →
//     divide nos 2 membros, dupla segue junta, não vira "individual de 1 nome".
(function () {
  var grpDuplas = { standings: [
    { name: 'Ana / Bia', wins: 2 },
    { name: 'Cida / Duda', wins: 1 }
  ] };
  var cs = function (g) { return g.standings; };
  var mp = [{ dest: 'main', rankFrom: 1, rankTo: 2 }];
  var kept = eng.buildEntrantsByDest([grpDuplas], mp, false, cs, 'top'); // fixedPairs irrelevante
  eq(kept.main.map(function (t) { return t.displayName; }), ['Ana / Bia', 'Cida / Duda'], 'keep por nome: duplas seguem juntas');
  eq([kept.main[0].p1Name, kept.main[0].p2Name], ['Ana', 'Bia'], 'keep por nome: 2 membros separados');
  ok(kept.main[0].fixedPair === true, 'keep por nome: marcada como dupla');
})();

// 16) groupTeamStandings ranqueia DUPLAS (m.p1/m.p2 = "A / B") e keep reforma.
(function () {
  var grp = {
    players: ['A / B', 'C / D', 'E / F'],
    matches: [
      { p1: 'A / B', p2: 'C / D', winner: 'A / B', scoreP1: 6, scoreP2: 3 },
      { p1: 'A / B', p2: 'E / F', winner: 'A / B', scoreP1: 6, scoreP2: 2 },
      { p1: 'C / D', p2: 'E / F', winner: 'C / D', scoreP1: 6, scoreP2: 4 }
    ]
  };
  eq(eng.groupTeamStandings(grp).map(function (s) { return s.name; }), ['A / B', 'C / D', 'E / F'], 'groupTeamStandings ordena duplas por desempenho');
  var cfg = { source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 2 }] }, fixedPairs: false };
  var built = eng.buildPhaseBrackets([grp], cfg, eng.groupTeamStandings, 'gts');
  eq(built.byDest.main.map(function (t) { return t.displayName; }), ['A / B', 'C / D'], 'keep: top-2 duplas avançam juntas');
  ok(built.byDest.main[0].p1Name === 'A' && built.byDest.main[0].p2Name === 'B', 'dupla dividida nos 2 membros');
})();

// 17) groupTeamStandings também serve singles (nome sem barra = individual).
(function () {
  var grp = { players: ['Joao', 'Maria', 'Ana'], matches: [
    { p1: 'Joao', p2: 'Maria', winner: 'Joao', scoreP1: 6, scoreP2: 1 },
    { p1: 'Joao', p2: 'Ana', winner: 'Joao', scoreP1: 6, scoreP2: 0 },
    { p1: 'Maria', p2: 'Ana', winner: 'Maria', scoreP1: 6, scoreP2: 2 }
  ] };
  eq(eng.groupTeamStandings(grp).map(function (s) { return s.name; }), ['Joao', 'Maria', 'Ana'], 'singles também ranqueia certo');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phases-engine: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
