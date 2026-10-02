const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8'), sandbox, { filename: 'schedule-poll.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-organizer.js'), 'utf8'), sandbox, { filename: 'schedule-organizer.js' });
const W = sandbox;
const organizerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-organizer.js'), 'utf8');
const bracketSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-logic.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── agenda operacional e quadras ────');
ok(/if \(m\.winner != null\) return true;/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8')),
  'o helper global também congela partida com vencedor, igual à validação do servidor');

const t = {
  id: 'agenda', startDate: '2026-10-01T09:00', endDate: '2026-10-01T18:00', courtCount: 2,
  gameDuration: 30, callTime: 5, warmupTime: 5, scheduleRevision: 4,
  matches: [
    { id: 'A', round: 1, p1: 'A', p2: 'B' },
    { id: 'B', round: 1, p1: 'C', p2: 'D' },
    { id: 'C', round: 2, p1: 'E', p2: 'F' },
    { id: 'D', round: 2, p1: 'G', p2: 'H' },
    { id: 'LIVE', round: 1, p1: 'K', p2: 'L', liveScored: true },
    { id: 'STARTED', round: 1, p1: 'M', p2: 'N', startedAt: '2026-10-01T10:00:00.000Z' },
    { id: 'RESULT', round: 1, p1: 'O', p2: 'P', resultAt: '2026-10-01T10:40:00.000Z' },
    { id: 'WITH_SETS', round: 1, p1: 'Q', p2: 'R', sets: [{ p1: 1, p2: 0 }] },
    { id: 'DONE', round: 1, p1: 'I', p2: 'J', winner: 'I', court: 'Quadra 1', scheduledAt: '2026-10-01T12:00:00.000Z' }
  ]
};
const p = W._operationalSchedulePlan(t, { matchId: 'A', court: 'Quadra 2', scheduledAt: '2026-10-01T15:00:00.000Z' });
const A = p.items.find(x => x.matchId === 'A');
const B = p.items.find(x => x.matchId === 'B');
const C = p.items.find(x => x.matchId === 'C');
ok(p.baseScheduleRevision === 4, 'envia a revisão da agenda lida');
ok(A && A.court === 'Quadra 2' && A.scheduleLocked === true && A.scheduleSource === 'organizer', 'mudança manual vira trava do organizador');
ok(B && B.court === 'Quadra 2' && B.scheduleLocked === false && B.scheduleSource === 'estimate', 'pendente evita a quadra ocupada e recebe a primeira livre como estimativa');
ok(C && new Date(C.scheduledAt).getTime() >= new Date(B.scheduledAt).getTime(), 'rodada seguinte não volta no tempo');
ok(!p.items.some(x => x.matchId === 'DONE'), 'jogo concluído não entra na realocação');
ok(!p.items.some(x => x.matchId === 'LIVE'), 'jogo com placar ao vivo não entra na realocação');
ok(!p.items.some(x => x.matchId === 'STARTED'), 'jogo iniciado não entra na realocação');
ok(!p.items.some(x => x.matchId === 'RESULT'), 'jogo com resultado registrado não entra na realocação');
ok(!p.items.some(x => x.matchId === 'WITH_SETS'), 'jogo com sets preenchidos não entra na realocação');

const multi = W._operationalSchedulePlan(t, [
  { matchId: 'A', court: 'Quadra 2', scheduledAt: '2026-10-01T15:00:00.000Z' },
  { matchId: 'B', court: 'Quadra 1', scheduledAt: '2026-10-01T15:00:00.000Z' }
]);
const multiA = multi.items.find(x => x.matchId === 'A');
const multiB = multi.items.find(x => x.matchId === 'B');
ok(multiA && multiB && multiA.scheduleLocked && multiB.scheduleLocked,
  'mais de uma intervenção manual permanece fixada no mesmo rascunho');
ok(multiA && multiB && multiA.court !== multiB.court,
  'duas alterações simultâneas podem distribuir jogos entre quadras diferentes');

const confirmed = Object.assign({}, t, { matches: t.matches.map(function (m) {
  return m.id === 'B' ? Object.assign({}, m, { court: 'Quadra 1', scheduledAt: '2026-10-01T09:00:00.000Z', scheduleLocked: false, scheduleSource: 'estimate' }) : m;
}) });
const afterConfirmed = W._operationalSchedulePlan(confirmed);
const confirmedB = afterConfirmed.items.find(x => x.matchId === 'B');
ok(confirmedB && confirmedB.court === 'Quadra 1' && confirmedB.scheduledAt === '2026-10-01T09:00:00.000Z' && confirmedB.scheduleLocked,
  'jogo já alocado não é movido automaticamente, mesmo se a alocação antiga era uma sugestão');
ok(!/data-agenda-court/.test(organizerSource) && !/data-agenda-time/.test(organizerSource),
  'a tela não repete seletor de quadra nem horário dentro de cada card');
ok(/Object\.keys\(manual\)\.map/.test(organizerSource),
  'cada edição recompõe o plano completo a partir de todas as intervenções manuais');
ok(/getTimezoneOffset\(\) \* 60000/.test(organizerSource),
  'o conversor do input de horário usa minutos em milissegundos explicitamente');
ok(/scheduleLocked:true, scheduleSource:'organizer'/.test(organizerSource),
  'Aplicar agenda transforma a sugestão confirmada em alocação manual protegida');

const categoryDays = {
  startDate:'2026-10-22T18:00', endDate:'2026-10-23T23:00', courtCount:1, gameDuration:30,
  categorySchedule:{ version:1, slots:[
    { category:'Fem Light', day:'2026-10-22', order:1 },
    { category:'Fem Power', day:'2026-10-22', order:2 },
    { category:'Masc Light', day:'2026-10-23', order:1 }
  ] },
  matches:[
    { id:'FL', category:'Fem Light', round:1, p1:'A', p2:'B' },
    { id:'FP', category:'Fem Power', round:1, p1:'C', p2:'D' },
    { id:'ML', category:'Masc Light', round:1, p1:'E', p2:'F' }
  ]
};
const categoryGrade = W._schGradeEstimada(categoryDays);
const byCategoryMatch = {};
(categoryGrade && categoryGrade.slots || []).forEach(function (slot) { byCategoryMatch[slot.matchId] = slot; });
ok(byCategoryMatch.FL && byCategoryMatch.FP && byCategoryMatch.ML &&
  byCategoryMatch.FL.iso.slice(0, 10) === '2026-10-22' && byCategoryMatch.FP.iso.slice(0, 10) === '2026-10-22' && byCategoryMatch.ML.iso.slice(0, 10) === '2026-10-23',
  'cada categoria permanece no dia configurado, sem vazar para o outro dia');
ok(byCategoryMatch.FL && byCategoryMatch.FP && byCategoryMatch.FL.ms < byCategoryMatch.FP.ms,
  'a ordem declarada torna Fem Light anterior a Fem Power no mesmo dia');
const splitCategoryDays = Object.assign({}, categoryDays, {
  categorySchedule:{ version:1, slots:[
    { category:'Fem Light', day:'2026-10-22', order:1 },
    { category:'Fem Light', day:'2026-10-23', order:1 }
  ] },
  matches:[
    { id:'FL1', category:'Fem Light', round:1, p1:'A', p2:'B' },
    { id:'FL2', category:'Fem Light', round:2, p1:'C', p2:'D' },
    { id:'FL3', category:'Fem Light', round:3, p1:'E', p2:'F' },
    { id:'FL4', category:'Fem Light', round:4, p1:'G', p2:'H' }
  ]
});
const splitGrade = W._schGradeEstimada(splitCategoryDays);
const splitByMatch = {}; (splitGrade && splitGrade.slots || []).forEach(function (slot) { splitByMatch[slot.matchId] = slot; });
ok(splitByMatch.FL1 && splitByMatch.FL2 && splitByMatch.FL3 && splitByMatch.FL4 &&
  splitByMatch.FL1.iso.slice(0, 10) === '2026-10-22' && splitByMatch.FL2.iso.slice(0, 10) === '2026-10-22' &&
  splitByMatch.FL3.iso.slice(0, 10) === '2026-10-23' && splitByMatch.FL4.iso.slice(0, 10) === '2026-10-23',
  'uma categoria em dois dias mantém as rodadas contínuas e termina no segundo dia');
const tooShort = Object.assign({}, categoryDays, { endDate:'2026-10-22T18:10' });
ok(W._schGradeEstimada(tooShort).cabe === false && W._operationalSchedulePlan(tooShort).cabe === false,
  'uma categoria que não cabe no dia bloqueia a aplicação da agenda');
ok(/categorySchedule/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8')),
  'a revisão pré-sorteio permite gravar dia e ordem de cada categoria');
const functionsSource = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
ok(/'teamCompetition','categorySchedule'/.test(functionsSource) && /'teamCompetition','categorySchedule','turnos'/.test(functionsSource),
  'o servidor aceita a agenda antes do sorteio e a congela junto com a estrutura depois da chave');
const drawSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8');
ok(/'courtNames','courtOrder'/.test(functionsSource) && /data-team-court-card/.test(drawSource) && /draggable="true"/.test(drawSource),
  'a organização define a prioridade das quadras com cards arrastáveis antes do sorteio');
ok(/data-team-day-lane/.test(drawSource) && /data-team-category-source/.test(drawSource) && /data-team-remove-category/.test(drawSource),
  'categorias podem ser arrastadas para um ou mais dias e removidas de um dia específico');
ok(/data-team-toggle-group="mode"/.test(drawSource) && /wireToggle\('mode'/.test(drawSource),
  'o modo estruturado/livre usa toggle com explicação dinâmica da escolha ativa');

// A agenda não pode voltar a expor IDs técnicos como a informação principal. A mesma
// grade serve ao rascunho e ao torneio publicado: linhas são horários, colunas são
// quadras, e cada card identifica categoria, duplas e seus times coloridos.
t.competitionTeams = [{ id:'team-1', name:'VENOM', hue:332 }, { id:'team-2', name:'BLACKOUT', hue:207 }];
t.matches[0] = Object.assign({}, t.matches[0], {
  p1:'Ana / Bia', p2:'Carla / Dani', category:'Fem Power', round:1,
  p1CompetitionTeamId:'team-1', p2CompetitionTeamId:'team-2',
  team1Obj:{ p1Name:'Ana', p2Name:'Bia', competitionTeamHue:332, competitionTeamSaturation:70, category:'Fem Power' },
  team2Obj:{ p1Name:'Carla', p2Name:'Dani', competitionTeamHue:207, competitionTeamSaturation:70, category:'Fem Power' }
});
const board = W._operationalScheduleGrid(t, p, { prefix:'agenda' });
ok(board.days.length === 1 && /data-agenda-day/.test(board.html),
  'a grade cria abas por dia quando há agenda');
ok(/VENOM/.test(board.html) && /BLACKOUT/.test(board.html) && /Ana/.test(board.html) && /Bia/.test(board.html) && /Fem Power/.test(board.html),
  'a célula informa times, nomes das duplas e categoria');
ok(/grid-template-columns:72px repeat\(2, minmax\(176px,1fr\)\)/.test(board.html),
  'a grade tem uma coluna de horário e uma coluna para cada quadra');
ok(/draggable="true"/.test(board.html) && !/type="time"/.test(board.html) && !/type="datetime-local"/.test(board.html),
  'o card é arrastável, sem controles redundantes; hora fica na régua e data na aba');
ok(/Jogo 1/.test(board.html) && !/Jogo A/.test(board.html),
  'o card mostra o número único do jogo no torneio, nunca o ID técnico');
const numberedBoard = W._operationalScheduleGrid(t, p, { prefix:'agenda', renumberBySchedule:true });
ok(/Jogo 1/.test(numberedBoard.html) && /Jogo 2/.test(numberedBoard.html),
  'a prévia da agenda apresenta numeração contínua pela ordem dos slots');
ok(/<div>Ana<\/div><div>Bia<\/div>/.test(board.html),
  'os dois jogadores da dupla aparecem em linhas separadas');
ok(/ondrop/.test(organizerSource) && /manual\[from\.matchId\].*to\.court/.test(organizerSource),
  'soltar um card sobre outro troca os slots de horário e quadra');
ok(/← Voltar/.test(bracketSource) && /width:min\(1600px,calc\(100vw - 36px\)\)/.test(bracketSource),
  'o modal aproveita a largura útil e usa o botão padrão Voltar');
ok(/if \(!latest\.cabe\)/.test(bracketSource) && /if \(!draft\.cabe\)/.test(organizerSource),
  'nenhuma das duas agendas permite salvar distribuição que não cabe no dia');
const timezoneRoundTrip = execFileSync(process.execPath, ['-e', [
  "const fs=require('fs'),vm=require('vm');",
  "const s={window:{},console};vm.createContext(s);",
  "vm.runInContext(fs.readFileSync('js/views/schedule-organizer.js','utf8'),s);",
  "process.stdout.write(s.window._scheduleIsoOnDay('2026-10-01','14:30'));"
].join('')], { cwd:path.join(__dirname, '..'), env:Object.assign({}, process.env, { TZ:'America/Sao_Paulo' }) }).toString();
ok(timezoneRoundTrip === '2026-10-01T17:30:00.000Z',
  '14:30 em São Paulo persiste como 17:30Z e volta à mesma hora local');
console.log('──── ' + pass + ' passaram, ' + fail + ' falharam ────');
process.exitCode = fail ? 1 : 0;
