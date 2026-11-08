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
assert.deepStrictEqual(warning, ['Súmula indisponível', 'Não há jogos ou chave disponíveis.', 'warning'],
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
assert.strictEqual(model.matches.length, 3, 'não repete espelho de partida nem inclui BYE nos jogos datados');
assert.strictEqual(model.undated.length, 1, 'jogo real sem data permanece disponível para impressão');
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
assert.strictEqual(pages.length, 6, 'súmulas por quadra seguidas de listas de chamada por categoria');
assert(pages.every(p => p.width === 842), 'súmula horizontal por padrão');
const portrait = core.makePages(model, { orientation:'portrait' });
assert.strictEqual(portrait.length, 6);
assert(portrait.slice(0,4).every(p => p.width === 595), 'súmula vertical disponível');
const bundle = core.zipFiles([
  { name:core.filename(model, 'landscape'), bytes:core.encodePdf(pages) },
  { name:core.filename(model, 'portrait'), bytes:core.encodePdf(portrait) },
]);
assert.strictEqual(Buffer.from(bundle).readUInt32LE(0), 0x04034b50, 'pacote tem cabeçalho ZIP');
assert.strictEqual(Buffer.from(bundle).readUInt16LE(bundle.length - 14), 2, 'pacote contém dois arquivos');
if (process.env.SP_SUMULA_ZIP_SAMPLE) fs.writeFileSync(process.env.SP_SUMULA_ZIP_SAMPLE, bundle);
assert.strictEqual(core.makePages(model, { attendance:true }).length, 8, 'lista de presença pode ser gerada à parte');
assert.strictEqual(core.makeAttendancePages(model).length, 2, 'presença tem arquivo próprio, sem duplicar súmulas');
const pdf = Buffer.from(core.encodePdf(pages));
assert(pdf.subarray(0, 8).toString('latin1').startsWith('%PDF-1.4'));
assert.strictEqual((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, pages.length);
assert(pdf.toString('latin1').includes('Venom'));
assert(pdf.toString('latin1').includes('P\\341gina'), 'acentos são codificados em WinAnsi');
assert(!pdf.toString('latin1').includes('DUPLA A'), 'não repete rótulos das duplas no cabeçalho');
assert(!pdf.toString('latin1').includes('Quadra real'), 'o campo se chama apenas Quadra');
assert(pdf.toString('latin1').includes('ASSINATURAS DOS ATLETAS'));
assert(pdf.toString('latin1').includes('1 set de 6 games'));
const firstCourtPage = pages.find(p => p.commands.join('\n').includes('(Quadra 4)'));
assert(firstCourtPage, 'a quadra prevista aparece abaixo da data e identifica a folha');
assert.strictEqual(firstCourtPage.commands.filter(s => s.includes('(Ana Silva)')).length, 2,
  'o nome aparece uma vez no jogo e uma vez para assinatura nesta página');
const mixed = core.collect(t, [
  { id:'late-court', scheduledGameNumber:20, scheduledAt:at('2026-10-22','19:00'), court:'Quadra 2', category:'Fem Power', p1:'Atleta Tardia / Parceira Tardia', p2:'Rival Tardia / Parceira Rival' },
  { id:'other-court', scheduledGameNumber:30, scheduledAt:at('2026-10-22','17:00'), court:'Quadra 10', category:'Masc Light', p1:'Atleta Outra / Parceira Outra', p2:'Rival Outra / Parceira Rival' },
  { id:'early-court', scheduledGameNumber:10, scheduledAt:at('2026-10-22','18:00'), court:'Quadra 2', category:'Fem Light', p1:'Atleta Inicial / Parceira Inicial', p2:'Rival Inicial / Parceira Rival' },
  { id:'no-court', scheduledGameNumber:40, scheduledAt:at('2026-10-22','16:00'), category:'', p1:'Atleta Sem Quadra / Parceira Sem Quadra', p2:'Rival Sem Quadra / Parceira Rival' },
  { id:'no-date', scheduledGameNumber:50, court:'Quadra 2', category:'Fem Light', p1:'Atleta Sem Data / Parceira Sem Data', p2:'Rival Sem Data / Parceira Rival' },
]);
assert.strictEqual(mixed.matches.length, 4, 'jogo sem data não entra na ordem datada');
assert.strictEqual(mixed.undated.length, 1);
for (const orientation of ['landscape','portrait']) {
  const sheets = core.makePages(mixed, { orientation });
  assert.strictEqual(sheets.length, 8, 'categorias mistas na mesma quadra compartilham folha; listas por categoria vêm ao final');
  const headings = sheets.slice(0,3).map(p => p.commands.join('\n').match(/\((Quadra [^)]*?)\)/)[1]);
  assert.deepStrictEqual(headings, ['Quadra 2','Quadra 10','Quadra a definir'],
    'quadras seguem ordem numérica e a quadra indefinida fica ao final');
  const court2 = sheets[0].commands.join('\n');
  assert(court2.indexOf('(Atleta Inicial)') < court2.indexOf('(Atleta Tardia)'),
    'jogos da quadra seguem o horário previsto, mesmo quando a entrada está fora de ordem');
  assert(court2.includes('Fem Light') && court2.includes('Fem Power'),
    'categorias diferentes são identificadas na mesma folha');
  assert(court2.includes('(Categorias: Fem Light, Fem Power)'),
    'categorias da folha ficam visíveis abaixo da data');
  const unknownCategory = sheets[2].commands.filter(s => s.includes('/F1 5.5 Tf') && /\((Sem|categoria)\)/.test(s));
  assert.strictEqual(unknownCategory.length, 2, 'categoria sem nome aparece em duas linhas legíveis');
  assert(unknownCategory[0].includes('(Sem)') && unknownCategory[1].includes('(categoria)'),
    'rótulo da categoria não é truncado na coluna estreita');
  assert(!sheets.slice(0,3).some(p => p.commands.join('\n').includes('Atleta Sem Data')),
    'jogo sem horário válido não é colocado em uma sequência datada inventada');
  assert(sheets[3].commands.join('\n').includes('Atleta Sem Data'),
    'jogo real sem data aparece na folha específica');
}
if (process.env.SP_SUMULA_SAMPLE) require('fs').writeFileSync(process.env.SP_SUMULA_SAMPLE, pdf);

const crowded = core.collect(t, Array.from({ length:24 }, (_, i) => ({
  id:'g'+i, scheduledGameNumber:i+1, scheduledAt:at('2026-10-22', String(18+Math.floor(i/4)).padStart(2,'0')+':00'),
  court:'Quadra 1', p1:'Atleta '+i+' / Parceiro '+i, p2:'Rival '+i+' / Parceira '+i
})));
for (const count of [13, 14]) {
  const court = core.collect(t, Array.from({ length:count }, (_, i) => ({
    id:'quadra-'+i, scheduledGameNumber:i+1, scheduledAt:at('2026-11-13', '08:00'),
    court:'Quadra 1', category:'Diamante',
    p1:'Atleta '+i+' / Parceira '+i, p2:'Rival '+i+' / Outra '+i
  })));
  const sheets = core.makePages(court);
  assert.strictEqual(sheets[0].width, 595, count+' jogos usam uma única folha vertical da quadra');
  assert.strictEqual(sheets.filter(p => p.commands.join('\n').includes('(ASSINATURAS DOS ATLETAS)')).length, 1,
    'nenhum jogo da quadra fica sozinho em outra folha');
  const text = sheets[0].commands.join('\n');
  assert(text.includes('(Atleta '+(count-1)+')'), 'o último jogo permanece na folha');
  assert.strictEqual((text.match(/\(Rival \d+\)/g) || []).length, count*2,
    'todos os '+count+' jogos têm adversários e assinatura na mesma folha');
}
const rotating = core.collect(t, [
  { id:'r1', scheduledGameNumber:1, scheduledAt:at('2026-11-13','08:00'), court:'Quadra 1', category:'Diamante',
    p1:'Ana Lima / Bia Costa', p2:'Cris Melo / Dora Luz', team1Uids:['ana','bia'], team2Uids:['cris','dora'] },
  { id:'r2', scheduledGameNumber:9, scheduledAt:at('2026-11-13','08:20'), court:'Quadra 1', category:'Diamante',
    p1:'Ana Lima / Cris Melo', p2:'Bia Costa / Dora Luz', team1Uids:['ana','cris'], team2Uids:['bia','dora'] },
  { id:'r3', scheduledGameNumber:17, scheduledAt:at('2026-11-13','08:40'), court:'Quadra 1', category:'Diamante',
    p1:'Ana Lima / Dora Luz', p2:'Bia Costa / Cris Melo', team1Uids:['ana','dora'], team2Uids:['bia','cris'] },
]);
const call = core.callList(rotating);
assert.strictEqual(call.length, 1);
assert.deepStrictEqual(call[0].athletes.map(a => a.name), ['Ana Lima','Bia Costa','Cris Melo','Dora Luz']);
assert.deepStrictEqual(call[0].athletes[0].games.map(g => [g.number,g.partner,g.opponents,g.court,g.time]), [
  [1,'Bia Costa','Cris Melo / Dora Luz','Quadra 1','08:00'],
  [9,'Cris Melo','Bia Costa / Dora Luz','Quadra 1','08:20'],
  [17,'Dora Luz','Bia Costa / Cris Melo','Quadra 1','08:40']
]);
assert(core.makePages(rotating).at(-1).commands.join('\n').includes('(LISTA DE CHAMADA  |  Diamante  |  Folha 1/1)'),
  'a lista por categoria vem depois das súmulas');
const incomplete = core.collect(t, [{ id:'incompleto', scheduledGameNumber:33,
  scheduledAt:at('2026-11-13','09:00'), category:'Ouro', p1:'Ana Lima / A definir', p2:'Bia Costa / Cris Melo' }]);
assert.deepStrictEqual(core.callList(incomplete)[0].skipped, [33],
  'jogo sem atleta definido é apontado na lista, sem atribuir adversário errado');
const homonyms = core.collect(t, [{ id:'homonimos', scheduledGameNumber:1,
  scheduledAt:at('2026-11-13','09:00'), category:'Ouro',
  p1:'Ana Lima / Ana Lima', p2:'Bia Costa / Cris Melo', team1Uids:['uid-1','uid-2'] }]);
assert.strictEqual(core.callList(homonyms)[0].athletes.filter(a => a.name === 'Ana Lima').length, 2,
  'pessoas distintas com o mesmo nome e UIDs diferentes não são fundidas');
assert.strictEqual(core.makePages(crowded).length, 6, '24 jogos ocupam duas folhas de quadra e quatro listas de chamada');
assert.strictEqual(core.makePages(crowded, { orientation:'portrait' }).length, 6, 'vertical mantém as duas folhas de quadra');
if (process.env.SP_SUMULA_CROWDED_SAMPLE) fs.writeFileSync(process.env.SP_SUMULA_CROWDED_SAMPLE,
  Buffer.from(core.encodePdf(core.makePages(crowded, { orientation:'portrait' }))));
const thirtySix = core.collect(t, Array.from({ length:36 }, (_, i) => ({
  id:'n'+i, scheduledGameNumber:i+1, scheduledAt:at(i<24?'2026-10-22':'2026-10-23',
    String(18+Math.floor((i%24)/4)).padStart(2,'0')+':00'),
  court:'Quadra '+(i%6+4), category:'Fem Light',
  p1:'Ana Silva / Bia Costa', p2:'Clara Lima / Débora Reis'
})));
assert.strictEqual(core.makePages(thirtySix).length, 18,
  '36 jogos distribuídos em seis quadras e dois dias ocupam doze folhas separadas e seis listas');
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
// O roteiro usa o mesmo motor da eliminatória, sem expor atletas cuja classificação
// ainda depende dos placares. Cada categoria tem sua própria chave até a final.
globalThis.window = globalThis;
require('../js/views/format2.js');
require('../js/views/phases-engine.js');
require('../js/views/tournaments-utils.js');
const phases = globalThis.FORMAT2.compileToPhases({ disputa:'dupla', grupos:1,
  classifAtiva:false, eliminatoria:{ ativa:true, openReiRainha:true,
    reiRainhaCut:2, formacao:'performance', linhas:1, dupla:false, terceiro:true } },
  { sport:'Beach Tennis' }).phases;
const makeGroups = (category, n) => Array.from({ length:n }, (_, i) => ({
  name:'Grupo '+(i+1)+' '+category, category,
  players:Array.from({ length:4 }, (_, j) => category+' Atleta '+i+'-'+j), matches:[]
}));
const camis = { name:'CAMIS', sport:'Beach Tennis', phases, currentPhaseIndex:0,
  combinedCategories:['Diamante','Ouro','Prata'],
  fmt2:{ tieResolution:'singles_then_draw', tieSinglesPoints:5, tieSinglesMargin:1 },
  groups:[...makeGroups('Diamante',8), ...makeGroups('Ouro',16), ...makeGroups('Prata',12)] };
const before = JSON.stringify(camis);
const plannedBefore = globalThis._tournamentGamesPlan(camis).totalPlanned;
const futureModel = core.collect(camis, []);
assert.strictEqual(JSON.stringify(camis), before, 'o roteiro não modifica torneio, fases nem grupos');
assert.deepStrictEqual(futureModel.future.categories.map(b => [b.category,b.matches.length]),
  [['Diamante',8],['Ouro',16],['Prata',14]], 'as três categorias têm chaves separadas');
const advanced = JSON.parse(JSON.stringify(camis));
advanced._phaseMaterialized = 0;
const advancedResult = globalThis._phasesEngine.materializeNextPhase(advanced, g =>
  g.players.map(name => ({name, displayName:name})), 'camis-advance');
assert.strictEqual(advancedResult.ok, true, 'o avanço real materializa as três categorias');
assert.strictEqual(advanced.matches.length, futureModel.future.categories.reduce((n, c) => n + c.matches.length, 0),
  'súmula e avanço real têm a mesma quantidade de jogos');
assert.strictEqual(new Set(advanced.matches.map(m => m.id)).size, advanced.matches.length,
  'os IDs dos jogos de categorias diferentes não colidem');
assert(advanced.matches.every(m => ['Diamante','Ouro','Prata'].includes(m.category)),
  'nenhuma partida perde a categoria');
const uncategorizedGroup = JSON.parse(JSON.stringify(camis));
uncategorizedGroup._phaseMaterialized = 0;
delete uncategorizedGroup.groups[1].category;
const blockedAdvance = globalThis._phasesEngine.materializeNextPhase(uncategorizedGroup, g =>
  g.players.map(name => ({name, displayName:name})), 'camis-blocked');
assert.strictEqual(blockedAdvance.ok, false, 'grupo sem categoria bloqueia avanço');
assert.deepStrictEqual(uncategorizedGroup.matches, undefined, 'avanço bloqueado não cria jogos');
assert.strictEqual(uncategorizedGroup.currentPhaseIndex, 0, 'avanço bloqueado não muda fase');
assert.strictEqual(futureModel.tiebreakGroups.length, 36,
  'cada grupo Rei/Rainha tem reserva de desempate, sem criar partidas');
const withCourt = core.collect({...camis, groups:[{...camis.groups[0],
  matches:[{id:'abertura-diamante', category:'Diamante', court:'Quadra 1'}]}, ...camis.groups.slice(1)]}, []);
assert.strictEqual(withCourt.tiebreakGroups[0].court, 'Quadra 1',
  'o espaço livre informa a quadra do quarteto quando ela já foi definida');
assert.strictEqual(globalThis._tournamentGamesPlan(camis).totalPlanned, plannedBefore,
  'o roteiro não altera o total operacional calculado antes para as fases');
for (const orientation of ['landscape','portrait']) {
  const pages = core.makePages(futureModel, { orientation });
  const printable = Buffer.from(core.encodePdf(pages)).toString('latin1');
  if (process.env.SP_SUMULA_FUTURE_SAMPLE && orientation === 'landscape')
    fs.writeFileSync(process.env.SP_SUMULA_FUTURE_SAMPLE, core.encodePdf(pages));
  assert(printable.includes('Final') && printable.includes(String.raw`3\272 lugar`),
    'súmula segue até a final e o terceiro lugar');
  assert(printable.includes('Desempate, se necess'), 'há linhas livres de desempate');
  assert(printable.includes(String.raw`Simples at\351 5 pontos`), 'a reserva acompanha a regra do CAMIS');
  assert(!printable.includes('Atleta 0-0'), 'nomes ainda não classificados não são inventados no PDF');
  const callPageCount = core.makeCallListPages(futureModel).length;
  assert((callPageCount ? pages.slice(0, -callPageCount) : pages)
    .every(p => p.width === (orientation === 'portrait' ? 595 : 842)));
}
const oneReal = { id:'real-com-outro-prefixo', phaseIndex:1, categoryName:'Ouro', round:1,
  p1:'Dupla Alfa', p2:'Dupla Beta' };
const partialModel = core.collect(camis, [oneReal]);
assert(!partialModel.future.categories.some(b => b.category === 'Ouro'),
  'um jogo real suprime toda a projeção da sua categoria, sem duplicar confrontos');
assert.strictEqual(partialModel.undated.length, 1, 'jogo real sem horário ganha folha própria');
assert(partialModel.pending.some(s => s.includes('Ouro:')), 'materialização parcial fica explícita');
const noId = { phaseIndex:1, category:'Ouro', p1:'A', p2:'B', round:1 };
assert.strictEqual(core.collect(camis, [noId,{...noId}]).undated.length, 1,
  'espelhos sem ID, hora e quadra são deduplicados pela chave composta');
const unknownCategory = core.collect(camis, [{ phaseIndex:1, p1:'A', p2:'B' }]);
assert.strictEqual(unknownCategory.future.categories.length, 0,
  'jogo real sem categoria não deixa projetar nenhuma chave em torneio multicategoria');
assert(unknownCategory.pending.some(s => s.includes('sem categoria')));
console.log('✅ Súmula por quadra e lista de chamada');
