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
