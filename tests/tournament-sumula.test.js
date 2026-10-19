'use strict';
const assert = require('assert');
require('../js/views/tournament-sumula.js');
const core = globalThis.ScoreplaceSumula;
const at = (day, hour) => new Date(day + 'T' + hour + ':00-03:00').toISOString();
const t = { name:'NEON NIGHTMARE', competitionTeams:[{ id:'team-1', name:'Venom' }, { id:'team-2', name:'Volt' }] };
const matches = [
  { id:'later', scheduledGameNumber:3, scheduledAt:at('2026-10-23','19:00'), court:'Quadra 5', category:'Fem Light', round:2,
    p1:'Ana Silva / Bia Costa', p2:'Clara Lima / Débora Reis', p1CompetitionTeamId:'team-1', p2CompetitionTeamId:'team-2',
    team1Uids:['a','b'], team2Uids:['c','d'] },
  { id:'first', scheduledGameNumber:1, scheduledAt:at('2026-10-22','18:00'), court:'Quadra 4', category:'Fem Light', round:1,
    p1:'Ana Silva / Bia Costa', p2:'Érica Souza / Fábio Ruiz', p1CompetitionTeamId:'team-1', p2CompetitionTeamId:'team-2',
    team1Uids:['a','b'], team2Uids:['e','f'] },
  { id:'other', scheduledGameNumber:2, scheduledAt:at('2026-10-22','18:00'), court:'Quadra 5', category:'Fem Light', round:1,
    p1:'Clara Lima / Débora Reis', p2:'Gabi / Helena', p1CompetitionTeamId:'team-2', p2CompetitionTeamId:'team-1' },
  { id:'bye', scheduledAt:at('2026-10-22','18:30'), court:'Quadra 5', p1:'A / B', p2:'BYE', isBye:true },
  { id:'unallocated', scheduledAt:at('2026-10-22','18:30'), p1:'A / B', p2:'C / D' }
];
const model = core.collect(t, [matches[0], matches[1], matches[2], matches[1], matches[3], matches[4]]);
assert.strictEqual(model.matches.length, 3, 'não repete espelho de partida nem inclui BYE/sem quadra');
assert.deepStrictEqual(model.days, ['2026-10-22','2026-10-23']);
assert.deepStrictEqual(model.matches.map(m => m.number), [1,2,3], 'ordem por horário e quadra');
assert.strictEqual(model.matches[0].team1, 'Venom', 'time vem de ID explícito');
const firstDay = core.attendance(model, '2026-10-22');
assert.strictEqual(firstDay.length, 8, 'lista só quem joga no dia, uma vez por atleta');
assert.strictEqual(firstDay[0].name, 'Ana Silva');
assert.strictEqual(firstDay[0].partner, 'Bia Costa');
assert.strictEqual(firstDay[0].team, 'Venom');
assert.strictEqual(firstDay[0].opponents, 'Érica Souza / Fábio Ruiz');
const secondDay = core.attendance(model, '2026-10-23');
assert.strictEqual(secondDay.length, 4);
assert.strictEqual(secondDay[0].opponents, 'Érica Souza / Fábio Ruiz', 'oponentes são do primeiro jogo do torneio, não do dia');
const pages = core.makePages(model);
assert.strictEqual(pages.length, 5, 'uma página por quadra/dia e uma lista por dia');
const pdf = Buffer.from(core.encodePdf(pages));
assert(pdf.subarray(0, 8).toString('latin1').startsWith('%PDF-1.4'));
assert.strictEqual((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 5);
assert(pdf.toString('latin1').includes('Venom'));
assert(pdf.toString('latin1').includes('PRESEN\\307A'), 'acentos são codificados em WinAnsi');
if (process.env.SP_SUMULA_SAMPLE) require('fs').writeFileSync(process.env.SP_SUMULA_SAMPLE, pdf);

const crowded = core.collect(t, Array.from({ length:24 }, (_, i) => ({
  id:'g'+i, scheduledGameNumber:i+1, scheduledAt:at('2026-10-22', String(18+Math.floor(i/4)).padStart(2,'0')+':00'),
  court:'Quadra 1', p1:'Atleta '+i+' / Parceiro '+i, p2:'Rival '+i+' / Parceira '+i
})));
assert.strictEqual(core.makePages(crowded).filter(p => p.height === 842).length, 3, 'quadra lotada continua em outra folha, sem cortar nomes');
console.log('✅ Súmula por quadra e lista de presença: sequência, PDF e paginação');
