/* A PREVISÃO DO NEON USA A GRADE CONFIGURADA, NÃO SÓ AS DUPLAS JÁ FORMADAS.
 *
 * 96 pessoas / 2 por dupla / 6 categorias = 8 duplas por categoria.
 * Com 4 jogos por dupla, são 16 confrontos por categoria e 96 no torneio.
 * Fem e Masc correm em blocos separados: 3 categorias × 4 rodadas, 9 quadras,
 * 40 min por slot = 320 min por bloco. */
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
ok(d && d.bucketCount === 2 && d.minutes === 320, 'Fem/Masc em blocos distintos: 5h20 por bloco com 9 quadras');
process.exit(fail ? 1 : 0);
