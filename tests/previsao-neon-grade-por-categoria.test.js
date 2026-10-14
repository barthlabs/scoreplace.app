/* A PREVISÃO DO NEON USA A GRADE CONFIGURADA, NÃO SÓ AS DUPLAS JÁ FORMADAS.
 *
 * 96 pessoas / 2 por dupla / 6 categorias = 8 duplas por categoria.
 * Com 4 jogos por dupla, são 16 confrontos por categoria e 96 no torneio.
 * Fem e Masc correm em blocos separados: 3 categorias × 4 rodadas, 9 quadras,
 * 35 min por slot = 280 min por bloco, sem intervalo artificial entre jogos. */
'use strict';
const W = require('./headless').window;
W._pName = function (p) { return String((p && (p.displayName || p.name)) || p || ''); };
let fail = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { fail++; console.error('  ✗ ' + msg); } }

const t = {
  format: 'Fase de Grupos', teamSize: 2, maxParticipants: 96, courtCount: 9,
  gameDuration: 25, callTime: 5, warmupTime: 5,
  combinedCategories: ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'],
  // Só oito pares já foram montados: esse é precisamente o estado que antes virava 7 jogos.
  participants: Array.from({ length: 8 }, (_, i) => ({ p1Uid: 'a' + i, p2Uid: 'b' + i })),
  phases: [{ teamCompetition: { enabled: true, schedule: { enabled: false, teamsPerGroup: 8, gamesPerTeam: 4, mode: 'free' } } }]
};
const d = W._buildTimeEstimation(t, { dataOnly: true });
ok(d && d.realCount === 96 && d.unitCount === 48, 'capacidade é 96 pessoas / 48 duplas, não as 8 já formadas');
ok(d && d.matchesPerCategory === 16 && d.matches === 96, '8 duplas × 4 jogos / 2 = 16 por categoria, 96 no total');
ok(d && d.bucketCount === 2 && d.minutes === 560, 'Fem/Masc em blocos distintos: 9h20 em slots contínuos, sem intervalo artificial entre jogos');

// Grade atual do Neon por bloco (feminino OU masculino): cada um dos oito times
// leva duas duplas Light e uma Power/Extreme. São 32 duplas, três jogos por
// dupla e 48 confrontos; seis quadras de 35min ficam cheias por oito janelas.
const currentNeon = {
  format: 'Fase de Grupos', teamSize: 2, maxParticipants: 64, courtCount: 6,
  gameDuration: 25, callTime: 5, warmupTime: 5,
  combinedCategories: ['Fem Light', 'Fem Power', 'Fem Extreme'],
  phases: [{ teamCompetition: { enabled: true, teamCount: 8,
    schedule: { enabled: true, teamsPerGroup: 8, gamesPerPair: 3,
      pairsPerTeamByCategory: { 'Fem Light': 2, 'Fem Power': 1, 'Fem Extreme': 1 },
      gamesPerPairByCategory: { 'Fem Light': 3, 'Fem Power': 3, 'Fem Extreme': 3 }, mode: 'structured' } } }]
};
const current = W._buildTimeEstimation(currentNeon, { dataOnly: true });
ok(current && current.unitCount === 8 && current.matches === 48 && current.minutes === 280,
  'Neon atual: 8 times × (2 Light + 1 Power + 1 Extreme) × 3 jogos ÷ 2 = 48 jogos, 22h40 em 6 quadras');
ok(current && current.categoryMatches && current.categoryMatches['Fem Light'] === 24 && current.categoryMatches['Fem Power'] === 12 && current.categoryMatches['Fem Extreme'] === 12,
  'Neon atual: previsão separa 24 jogos Light e 12 em cada uma das demais categorias');

// O plano por equipes usa `unitCount` para os times do organizador. A linha
// pública deve exibir as duplas correspondentes aos participantes, não chamar
// esses oito times de oito duplas (regressão observada no Neon em produção).
const fullNeon = JSON.parse(JSON.stringify(currentNeon));
fullNeon.maxParticipants = 128;
fullNeon.combinedCategories = ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'];
fullNeon.phases[0].teamCompetition.schedule.pairsPerTeamByCategory['Masc Light'] = 2;
fullNeon.phases[0].teamCompetition.schedule.pairsPerTeamByCategory['Masc Power'] = 1;
fullNeon.phases[0].teamCompetition.schedule.pairsPerTeamByCategory['Masc Extreme'] = 1;
const fullData = W._buildTimeEstimation(fullNeon, { dataOnly: true });
const fullSummary = W._buildDurationForecast(fullNeon);
ok(fullData && fullData.unitCount === 8 && fullData.pairCount === 64 && fullData.realCount === 128,
  'plano completo: 128 participantes, 64 duplas e 8 times têm contagens distintas');
ok(fullSummary.includes('128 participantes · 64 duplas · 8 times') && !fullSummary.includes('8 duplas'),
  'card público não rotula os oito times como oito duplas');

const flexibleNeon = JSON.parse(JSON.stringify(currentNeon));
flexibleNeon.phases[0].teamCompetition.schedule.gamesPerPairByCategory = { 'Fem Light': 3, 'Fem Power': 2, 'Fem Extreme': 1 };
const flexible = W._buildTimeEstimation(flexibleNeon, { dataOnly: true });
ok(flexible && flexible.matches === 36 && flexible.minutes === 210 &&
  flexible.categoryMatches['Fem Light'] === 24 && flexible.categoryMatches['Fem Power'] === 8 && flexible.categoryMatches['Fem Extreme'] === 4,
  'vagas e jogos podem variar por categoria: Light 3, Power 2 e Extreme 1 gera 24/8/4 jogos');

// O título histórico não manda no cálculo quando o documento já tem fases
// canônicas. Isso impede que uma eliminatória publicada como "Liga" por legado
// perca a previsão, e o inverso que uma temporada de pontos corridos a exiba.
const eliminationWithLegacyLeague = W._buildTimeEstimation({
  format: 'Liga', participants: ['A', 'B', 'C', 'D'], courtCount: 1,
  phases: [{ kind: 'elimination', elimination: { bracketType: 'single' } }]
}, { dataOnly: true });
ok(eliminationWithLegacyLeague && eliminationWithLegacyLeague.format === 'Eliminatórias Simples',
  'eliminação canônica não é escondida pelo rótulo legado Liga');

const roundRobinWithLegacyElim = W._buildTimeEstimation({
  format: 'Eliminatórias Simples', participants: ['A', 'B', 'C', 'D'], courtCount: 1,
  phases: [{ kind: 'classification', classification: { structure: 'round_robin' } }]
}, { dataOnly: true });
ok(roundRobinWithLegacyElim === '', 'classificatória todos-contra-todos canônica não ganha previsão de evento eliminatório');
process.exit(fail ? 1 : 0);
