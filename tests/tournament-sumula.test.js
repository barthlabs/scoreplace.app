'use strict';
// A súmula usa o fuso local do navegador; fixe o fuso do torneio de teste para
// que a paginação não mude entre o macOS do desenvolvedor e o runner em UTC.
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');
require('../js/views/tournament-sumula.js');
const sumulaSource = fs.readFileSync('js/views/tournament-sumula.js', 'utf8');
const officialSvg = fs.readFileSync('index.html', 'utf8')
  .match(/<svg width="48" height="48" viewBox="0 0 24 24".*?<\/svg>/s)[0];
assert(sumulaSource.includes(crypto.createHash('sha256').update(officialSvg).digest('hex')),
  'o vetor embutido declara o hash do SVG canônico do cabeçalho');
const detailSource = fs.readFileSync('js/views/tournaments.js', 'utf8');
assert(detailSource.includes("typeof window._downloadTournamentSumula === 'function' ?"),
  'organizador vê o botão Súmula no bloco de ações do torneio');
assert.strictEqual((detailSource.match(/📋 Súmulas<\/button>/g) || []).length, 2,
  'um botão Súmulas aparece nos estados com sorteio e encerrado');
assert(!detailSource.includes('📋 Súmula vertical</button>'), 'não mantém botão separado por orientação');
let warning = null;
globalThis._findTournamentById = () => ({ id:'sem-grade', name:'Sem grade', matches:[], arbitros:[{uid:'ref-1',status:'confirmed'}] });
globalThis._souOrganizador = () => false;
globalThis.AppStore = { currentUser:{uid:'ref-1'} };
globalThis.showNotification = (...args) => { warning = args; };
globalThis._downloadTournamentSumula('sem-grade');
assert.deepStrictEqual(warning, ['Súmula indisponível', 'Não há jogos com dia e hora definidos.', 'warning'],
  'árbitro confirmado acessa a súmula; sem grade recebe aviso e nenhum PDF');
warning = null;
globalThis.AppStore.currentUser = {uid:'outsider'};
globalThis._downloadTournamentSumula('sem-grade');
assert.strictEqual(warning, null, 'conta fora da escala não acessa a súmula');
delete globalThis._findTournamentById;
delete globalThis._souOrganizador;
delete globalThis.showNotification;
delete globalThis.AppStore;
const core = globalThis.ScoreplaceSumula;
const at = (day, hour) => new Date(day + 'T' + hour + ':00-03:00').toISOString();
const t = { name:'NEON NIGHTMARE', sport:'Beach Tennis', scoring:{ type:'sets', setsToWin:1, gamesPerSet:6 },
  competitionTeams:[{ id:'team-1', name:'Venom' }, { id:'team-2', name:'Volt' }] };
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
  { id:'unscheduled', p1:'A / B', p2:'C / D' }
];
const model = core.collect(t, [matches[0], matches[1], matches[2], matches[1], matches[3], matches[4]]);
assert.strictEqual(model.matches.length, 3, 'não repete espelho de partida nem inclui BYE/sem data');
assert.strictEqual(core.collect(t, [{ id:'sem-quadra', scheduledAt:at('2026-10-22','20:00'),
  p1:'A / B', p2:'C / D' }]).matches.length, 1, 'jogo sem quadra prevista entra na súmula');
assert.deepStrictEqual(model.days, ['2026-10-22','2026-10-23']);
assert.deepStrictEqual(model.matches.map(m => m.number), [1,2,3], 'ordem por horário e quadra');
assert.strictEqual(model.matches[0].team1, 'Venom', 'time vem de ID explícito');
assert.deepStrictEqual(model.scoring, { slots:1, gamesPerSet:6, type:'sets' });
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
assert.strictEqual(pages.length, 3, 'uma página por quadra e dia, reunindo categorias');
assert(pages.every(p => p.width === 842), 'súmula horizontal por padrão');
const portrait = core.makePages(model, { orientation:'portrait' });
assert.strictEqual(portrait.length, 3);
assert(portrait.every(p => p.width === 595), 'súmula vertical disponível');
const bundle = core.zipFiles([
  { name:core.filename(model, 'landscape'), bytes:core.encodePdf(pages) },
  { name:core.filename(model, 'portrait'), bytes:core.encodePdf(portrait) },
]);
assert.strictEqual(Buffer.from(bundle).readUInt32LE(0), 0x04034b50, 'pacote tem cabeçalho ZIP');
assert.strictEqual(Buffer.from(bundle).readUInt16LE(bundle.length - 14), 2, 'pacote contém dois arquivos');
if (process.env.SP_SUMULA_ZIP_SAMPLE) fs.writeFileSync(process.env.SP_SUMULA_ZIP_SAMPLE, bundle);
assert.strictEqual(core.makePages(model, { attendance:true }).length, 5, 'lista de presença pode ser gerada à parte');
assert.strictEqual(core.makeAttendancePages(model).length, 2, 'presença tem arquivo próprio, sem duplicar súmulas');
const pdf = Buffer.from(core.encodePdf(pages));
assert(pdf.subarray(0, 8).toString('latin1').startsWith('%PDF-1.4'));
assert.strictEqual((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, pages.length);
assert(pdf.toString('latin1').includes('Venom'));
assert(pdf.toString('latin1').includes('S\\372mula'), 'acentos são codificados em WinAnsi');
assert(!pdf.toString('latin1').includes('DUPLA A'), 'não repete rótulos das duplas no cabeçalho');
assert(!pdf.toString('latin1').includes('Quadra real'), 'o campo se chama apenas Quadra');
assert(pdf.toString('latin1').includes('ASSINATURAS DOS ATLETAS'));
assert(pdf.toString('latin1').includes('1 set de 6 games'));
const firstCourtPage = pages.find(p => p.commands.join('\n').includes('(Quadra 4  |  22/10/2026'));
assert(firstCourtPage, 'a quadra prevista identifica a folha para distribuí-la na quadra correta');
assert.strictEqual(firstCourtPage.commands.filter(s => s.includes('(Ana Silva)')).length, 2,
  'o nome aparece uma vez no jogo e uma vez para assinatura nesta página');
const mixed = core.collect(t, [
  { id:'late-court', scheduledGameNumber:20, scheduledAt:at('2026-10-22','19:00'), court:'Quadra 2', category:'Fem Power', p1:'Atleta Tardia / Parceira Tardia', p2:'Rival Tardia / Parceira Rival' },
  { id:'other-court', scheduledGameNumber:30, scheduledAt:at('2026-10-22','17:00'), court:'Quadra 10', category:'Masc Light', p1:'Atleta Outra / Parceira Outra', p2:'Rival Outra / Parceira Rival' },
  { id:'early-court', scheduledGameNumber:10, scheduledAt:at('2026-10-22','18:00'), court:'Quadra 2', category:'Fem Light', p1:'Atleta Inicial / Parceira Inicial', p2:'Rival Inicial / Parceira Rival' },
  { id:'no-court', scheduledGameNumber:40, scheduledAt:at('2026-10-22','16:00'), category:'', p1:'Atleta Sem Quadra / Parceira Sem Quadra', p2:'Rival Sem Quadra / Parceira Rival' },
  { id:'no-date', scheduledGameNumber:50, court:'Quadra 2', category:'Fem Light', p1:'Atleta Sem Data / Parceira Sem Data', p2:'Rival Sem Data / Parceira Rival' },
]);
assert.strictEqual(mixed.matches.length, 4, 'jogo sem data não entra na ordem prevista');
for (const orientation of ['landscape','portrait']) {
  const sheets = core.makePages(mixed, { orientation });
  assert.strictEqual(sheets.length, 3, 'categorias mistas na mesma quadra compartilham folha');
  const headings = sheets.map(p => p.commands.join('\n').match(/\((Quadra [^)]*?)  \|  22\/10\/2026/)[1]);
  assert.deepStrictEqual(headings, ['Quadra 2','Quadra 10','Quadra a definir'],
    'quadras seguem ordem numérica e a quadra indefinida fica ao final');
  const court2 = sheets[0].commands.join('\n');
  assert(court2.indexOf('(Atleta Inicial)') < court2.indexOf('(Atleta Tardia)'),
    'jogos da quadra seguem o horário previsto, mesmo quando a entrada está fora de ordem');
  assert(court2.includes('(Fem Light)') && court2.includes('(Fem Power)'),
    'categorias diferentes são identificadas na mesma folha');
  const unknownCategory = sheets[2].commands.find(s => s.includes('/F1 6 Tf') && s.includes('(Sem '));
  assert(unknownCategory, 'jogo sem categoria mantém rótulo identificável');
  const position = unknownCategory.match(/ 1 0 0 1 ([\d.]+) [\d.]+ Tm \(([^)]*)\)/);
  const x = Number(position[1]), printed = position[2];
  const limit = orientation === 'portrait' ? 117 - 6 : 131 - 6;
  // Larguras da Helvetica regular no PDF (em milésimos de em) para este rótulo.
  const widths = { S:667, e:556, m:833, ' ':278, c:500, a:556, t:278, g:556, o:556, '.':278 };
  const printedWidth = [...printed].reduce((sum, ch) => sum + widths[ch], 0) * 6 / 1000;
  assert(x + printedWidth <= limit && printed.endsWith('...'),
    'categoria longa cabe na largura física da coluna em ambas as orientações');
  assert(!sheets.some(p => p.commands.join('\n').includes('Atleta Sem Data')),
    'jogo sem horário válido não é colocado em uma sequência inventada');
}
if (process.env.SP_SUMULA_SAMPLE) require('fs').writeFileSync(process.env.SP_SUMULA_SAMPLE, pdf);

const crowded = core.collect(t, Array.from({ length:24 }, (_, i) => ({
  id:'g'+i, scheduledGameNumber:i+1, scheduledAt:at('2026-10-22', String(18+Math.floor(i/4)).padStart(2,'0')+':00'),
  court:'Quadra 1', p1:'Atleta '+i+' / Parceiro '+i, p2:'Rival '+i+' / Parceira '+i
})));
assert.strictEqual(core.makePages(crowded).length, 2, '24 jogos ocupam duas páginas de 12 jogos');
assert.strictEqual(core.makePages(crowded, { orientation:'portrait' }).length, 2, 'vertical também usa 12 jogos por página');
if (process.env.SP_SUMULA_CROWDED_SAMPLE) fs.writeFileSync(process.env.SP_SUMULA_CROWDED_SAMPLE,
  Buffer.from(core.encodePdf(core.makePages(crowded, { orientation:'portrait' }))));
const thirtySix = core.collect(t, Array.from({ length:36 }, (_, i) => ({
  id:'n'+i, scheduledGameNumber:i+1, scheduledAt:at(i<24?'2026-10-22':'2026-10-23',
    String(18+Math.floor((i%24)/4)).padStart(2,'0')+':00'),
  court:'Quadra '+(i%6+4), category:'Fem Light',
  p1:'Ana Silva / Bia Costa', p2:'Clara Lima / Débora Reis'
})));
assert.strictEqual(core.makePages(thirtySix).length, 12,
  '36 jogos distribuídos em seis quadras e dois dias ocupam doze folhas separadas');
const bestOfThree = core.collect({ ...t, scoring:{ type:'sets', setsToWin:2, gamesPerSet:6 } }, [matches[1]]);
assert.strictEqual(bestOfThree.scoring.slots, 3);
assert(core.makePages(bestOfThree)[0].commands.join('\n').includes('melhor de 3 sets'),
  'outros torneios acompanham a configuração de sets');
const scoreCommands = core.makePages(bestOfThree)[0].commands;
const scoreBoxes = scoreCommands.filter(s => /0\.3 G 0\.7 w .* re S$/.test(s)).slice(0, 2)
  .map(s => { const m = s.match(/ w ([\d.]+) [\d.]+ ([\d.]+) [\d.]+ re S$/); return { x:Number(m[1]), width:Number(m[2]) }; });
const scoreX = Number(scoreCommands.find(s => /\(x\) Tj ET$/.test(s)).match(/ Tm /) ?
  scoreCommands.find(s => /\(x\) Tj ET$/.test(s)).match(/ 1 0 0 1 ([\d.]+) [\d.]+ Tm /)[1] : NaN);
assert(scoreX > scoreBoxes[0].x + scoreBoxes[0].width && scoreX + 4 < scoreBoxes[1].x,
  'o x do placar não invade as caixas em melhor de três');
const portraitCommands = portrait[0].commands;
const rightNames = portraitCommands.filter(s => s.includes('/F2 8.5 Tf') &&
  (s.includes('rica Souza)') || s.includes('bio Ruiz)')));
assert.strictEqual(rightNames.length, 2, 'nomes da dupla à direita permanecem visíveis');
const rightPositions = rightNames.map(s => Number(s.match(/ 1 0 0 1 ([\d.]+) [\d.]+ Tm /)[1]));
assert(rightPositions[0] !== rightPositions[1], 'nomes com comprimentos diferentes alinham pelo limite direito');
const longNames = core.collect(t, Array.from({ length:12 }, (_, i) => ({
  id:'long-'+i, scheduledAt:at('2026-10-22', '18:00'), category:'Fem Light',
  p1:'Nome Muito Comprido Atleta '+i+' / Parceiro Muito Comprido '+i,
  p2:'Rival Muito Comprido Atleta '+i+' / Parceira Muito Comprida '+i
})));
const wrapped = core.makePages(longNames, { orientation:'portrait' })[0].commands.join('\n');
assert(wrapped.includes('(Nome Muito Comprido)'), 'nome longo ocupa a primeira linha');
assert(wrapped.includes('(Atleta 0)'), 'sobrenome continua na segunda linha sem corte');
assert(!wrapped.includes('(Nome Muito Compr...)'), 'nome longo não termina prematuramente em reticências');
const landscapeWrap = core.makePages(core.collect(t, [{ id:'wrap', category:'Fem Light',
  scheduledAt:at('2026-10-22','18:00'),
  p1:'Maria Eduarda Corazza Pozzi dos Santos de Almeida / Gabriela De Aguiar Scigliano Pereira',
  p2:'Ana Silva / Bia Costa' }]))[0].commands.join('\n');
assert(landscapeWrap.includes('(Maria Eduarda Corazza Pozzi dos Santos de)') &&
  landscapeWrap.includes('(Almeida)'), 'paisagem mantém o nome longo em duas linhas');
assert(core.makePages(model)[0].commands.some(s => s.includes('/OfficialLogo Do')),
  'a súmula usa o logo oficial, sem redesenho manual');
assert(pdf.toString('latin1').includes('/Subtype /Form /FormType 1 /BBox [0 0 36 36]'),
  'PDF incorpora o SVG do cabeçalho como forma vetorial');
assert(!pdf.toString('latin1').includes('/Subtype /Image'),
  'o logo da súmula não é uma imagem rasterizada');
assert(!sumulaSource.includes('function podiumLogo') && !sumulaSource.includes('fillPolygon'),
  'não mantém estrela ou barras reconstruídas por coordenadas');
const signatureCommands = core.makePages(longNames)[0].commands.filter(s =>
  / rg BT \/F1 /.test(s) && / 1 0 0 1 (57[1-9]|5[8-9][0-9]|6[0-9][0-9]|7[0-9][0-9]) [\d.]+ Tm /.test(s));
assert.strictEqual(signatureCommands.length, 48,
  '48 atletas em uma página recebem uma linha cada, sem segunda linha sobreposta');
console.log('✅ Súmula por quadra: 12 jogos por folha, um set e assinatura única por atleta');
