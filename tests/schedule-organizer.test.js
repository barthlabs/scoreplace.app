const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8'), sandbox, { filename: 'schedule-poll.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-organizer.js'), 'utf8'), sandbox, { filename: 'schedule-organizer.js' });
const W = sandbox;
const organizerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-organizer.js'), 'utf8');
const bracketLogicSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-logic.js'), 'utf8');
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
ok(multiA && multiB && multiB.scheduledGameNumber < multiA.scheduledGameNumber,
  'jogos no mesmo horário respeitam a prioridade da quadra na numeração global');

const seisQuadrasNumeracao = {
  id:'seis-quadras', startDate:'2026-10-01T18:00:00.000Z', endDate:'2026-10-01T23:59:00.000Z',
  courtCount:6, gameDuration:35,
  matches:Array.from({ length:6 }, function (_, i) { return { id:'M' + (i + 1), p1:'A' + i, p2:'B' + i, round:1 }; })
};
const mesmoHorario = W._operationalSchedulePlan(seisQuadrasNumeracao, seisQuadrasNumeracao.matches.map(function (m, i) {
  return { matchId:m.id, court:'Quadra ' + (i + 1), scheduledAt:'2026-10-01T18:00:00.000Z' };
}));
ok(mesmoHorario.items.map(function (i) { return i.scheduledGameNumber; }).sort(function(a,b){ return a-b; }).join(',') === '1,2,3,4,5,6',
  'seis quadras às 18:00 são exatamente Jogos 1–6, sem repetir número');

const confirmed = Object.assign({}, t, { matches: t.matches.map(function (m) {
  return m.id === 'B' ? Object.assign({}, m, { court: 'Quadra 1', scheduledAt: '2026-10-01T09:00:00.000Z', scheduleLocked: false, scheduleSource: 'estimate' }) : m;
}) });
const afterConfirmed = W._operationalSchedulePlan(confirmed);
const confirmedB = afterConfirmed.items.find(x => x.matchId === 'B');
ok(confirmedB && confirmedB.court === 'Quadra 1' && confirmedB.scheduledAt === '2026-10-01T09:00:00.000Z' && confirmedB.scheduleLocked,
  'jogo já alocado não é movido automaticamente, mesmo se a alocação antiga era uma sugestão');
ok(!/<select[^>]+data-agenda-(court|time)/.test(organizerSource),
  'a tela não repete seletor de quadra nem horário dentro de cada card');
ok(/Object\.keys\(manual\)\.map/.test(organizerSource),
  'cada edição recompõe o plano completo a partir de todas as intervenções manuais');
ok(/getTimezoneOffset\(\) \* 60000/.test(organizerSource),
  'o conversor do input de horário usa minutos em milissegundos explicitamente');
ok(/scheduleLocked:true, scheduleSource:'organizer'/.test(organizerSource),
  'Aplicar agenda transforma a sugestão confirmada em alocação manual protegida');
ok(/scheduledGameNumber:i\.scheduledGameNumber/.test(organizerSource),
  'Aplicar agenda persiste a numeração cronológica que a grade mostrou');

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
const seisQuadras = {
  startDate:'2026-10-22T18:00', endDate:'2026-10-22T23:00', courtCount:6, gameDuration:30,
  categorySchedule:{ version:1, slots:[
    { category:'Fem Power', day:'2026-10-22', order:1 },
    { category:'Fem Extreme', day:'2026-10-22', order:2 }
  ] },
  matches:[
    { id:'P1', category:'Fem Power', round:1, p1:'P1A', p2:'P1B' }, { id:'P2', category:'Fem Power', round:1, p1:'P2A', p2:'P2B' },
    { id:'P3', category:'Fem Power', round:1, p1:'P3A', p2:'P3B' }, { id:'P4', category:'Fem Power', round:1, p1:'P4A', p2:'P4B' },
    { id:'E1', category:'Fem Extreme', round:1, p1:'E1A', p2:'E1B' }, { id:'E2', category:'Fem Extreme', round:1, p1:'E2A', p2:'E2B' }
  ]
};
const gradeSeisQuadras = W._schGradeEstimada(seisQuadras);
const primeiroHorario = Math.min.apply(null, gradeSeisQuadras.slots.map(function (s) { return s.ms; }));
ok(gradeSeisQuadras.slots.filter(function (s) { return s.ms === primeiroHorario; }).length === 6,
  'jogos independentes da categoria seguinte ocupam as quadras livres na mesma onda');

// REGRESSÃO NEON: 48 jogos femininos, seis quadras e 35 minutos por jogo ocupam
// oito ondas contínuas. Não existe "respiro" automático entre rodadas: se há
// jogo elegível, toda quadra livre precisa ser preenchida na onda seguinte.
const neonSemLacunas = {
  startDate:'2026-10-22T18:00', endDate:'2026-10-22T23:59', courtCount:6,
  gameDuration:25, callTime:5, warmupTime:5,
  scheduleWindow:{ version:1, days:[{ day:'2026-10-22', startTime:'18:00', endTime:'23:59', categoryFlow:'rounds' }] },
  categorySchedule:{ version:1, slots:[
    { category:'Fem Extreme', day:'2026-10-22', order:1 },
    { category:'Fem Power', day:'2026-10-22', order:2 },
    { category:'Fem Light', day:'2026-10-22', order:3 }
  ] },
  matches:[]
};
['Fem Extreme', 'Fem Power', 'Fem Light'].forEach(function (category) {
  for (var round = 1; round <= 4; round++) {
    for (var game = 1; game <= 4; game++) {
      neonSemLacunas.matches.push({
        id:category + '-' + round + '-' + game, category:category, round:round,
        p1:category + '-A' + game, p2:category + '-B' + game
      });
    }
  }
});
const gradeNeonSemLacunas = W._schGradeEstimada(neonSemLacunas);
const ondasNeon = Array.from(new Set(gradeNeonSemLacunas.slots.map(function (slot) { return slot.ms; }))).sort(function (a, b) { return a - b; });
const inicioNeon = new Date('2026-10-22T18:00:00-03:00').getTime();
ok(ondasNeon.length === 8 && ondasNeon.every(function (ms, index) { return ms === inicioNeon + index * 35 * 60000; }) &&
  ondasNeon.every(function (ms) { return gradeNeonSemLacunas.slots.filter(function (slot) { return slot.ms === ms; }).length === 6; }),
  'Neon ocupa seis quadras em oito ondas contínuas, de 18:00 a 22:05, sem lacuna entre rodadas');
const neonPorId = Object.fromEntries(neonSemLacunas.matches.map(function (match) { return [String(match.id), match]; }));
const neonSemChoque = gradeNeonSemLacunas.slots.every(function (slot, index, slots) {
  var atual = neonPorId[slot.matchId];
  return slots.slice(index + 1).every(function (outroSlot) {
    if (slot.ms + 35 * 60000 <= outroSlot.ms || outroSlot.ms + 35 * 60000 <= slot.ms) return true;
    var outro = neonPorId[outroSlot.matchId];
    return [atual.p1, atual.p2].every(function (player) { return player !== outro.p1 && player !== outro.p2; });
  });
});
ok(neonSemChoque, 'compactação Neon não sobrepõe atleta em duas partidas');
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
const descansoEquilibrado = {
  startDate:'2026-10-22T18:00', endDate:'2026-10-22T23:00', courtCount:1, gameDuration:30,
  categorySchedule:{ version:1, slots:[{ category:'Fem Light', day:'2026-10-22', order:1 }] },
  matches:[
    { id:'AB-1', category:'Fem Light', round:1, p1:'Time A', p2:'Time B' },
    { id:'CD-1', category:'Fem Light', round:1, p1:'Time C', p2:'Time D' },
    // A entrada da R2 vem de propósito na ordem oposta: o motor deve agendar
    // primeiro A/B, que descansaram enquanto C/D jogavam na onda anterior.
    { id:'CD-2', category:'Fem Light', round:2, p1:'Time C', p2:'Time D' },
    { id:'AB-2', category:'Fem Light', round:2, p1:'Time A', p2:'Time B' }
  ]
};
const gradeDescanso = W._schGradeEstimada(descansoEquilibrado);
const descansoPorJogo = {}; (gradeDescanso && gradeDescanso.slots || []).forEach(function (slot) { descansoPorJogo[slot.matchId] = slot.ms; });
ok(descansoPorJogo['AB-1'] < descansoPorJogo['CD-1'] && descansoPorJogo['AB-2'] < descansoPorJogo['CD-2'],
  'a dupla que já aguardou entra antes: não recebe segunda folga enquanto a outra ainda não descansou');
// A compactação aproveita vaga de quadra, mas não pode transformar essa economia
// em uma segunda partida seguida do mesmo atleta. A categoria C teria uma vaga na
// onda seguinte; como A acabou de jogar, ela permanece na onda posterior.
const compactacaoComDescanso = {
  startDate:'2026-10-22T18:00', endDate:'2026-10-22T21:00', courtCount:2, gameDuration:30,
  participants:[
    { uid:'a', displayName:'A' }, { uid:'b', displayName:'B' },
    { uid:'c', displayName:'C' }, { uid:'d', displayName:'D' }
  ],
  categorySchedule:{ version:1, slots:[
    { category:'Fem Light', day:'2026-10-22', order:1 },
    { category:'Fem Power', day:'2026-10-22', order:2 },
    { category:'Fem Extreme', day:'2026-10-22', order:3 }
  ] },
  matches:[
    { id:'A1', category:'Fem Light', round:1, p1:'A', p2:'B' },
    { id:'B1', category:'Fem Power', round:1, p1:'C', p2:'D' },
    { id:'A2', category:'Fem Extreme', round:1, p1:'A', p2:'B' }
  ]
};
const gradeComDescanso = W._schGradeEstimada(compactacaoComDescanso);
const porIdComDescanso = {}; (gradeComDescanso && gradeComDescanso.slots || []).forEach(function (slot) { porIdComDescanso[slot.matchId] = slot; });
ok(porIdComDescanso.A1 && porIdComDescanso.A2 && porIdComDescanso.A2.ms - porIdComDescanso.A1.ms >= 60 * 60000,
  'a compactação não antecipa um atleta para a onda imediatamente após seu jogo anterior');
const tooShort = Object.assign({}, categoryDays, { endDate:'2026-10-22T18:10' });
ok(W._schGradeEstimada(tooShort).cabe === false && W._operationalSchedulePlan(tooShort).cabe === false,
  'uma categoria que não cabe no dia bloqueia a aplicação da agenda');
const janelaFechada = {
  startDate:'2026-10-22T18:00', endDate:'2026-10-23T23:00', courtCount:1, gameDuration:30,
  scheduleWindow:{ version:1, days:[
    { day:'2026-10-22', startTime:'18:00', endTime:'19:00' },
    { day:'2026-10-23', startTime:'18:00', endTime:'19:00' }
  ] },
  categorySchedule:{ version:1, slots:[{ category:'Fem Light', day:'2026-10-22', order:1 }] },
  matches:[
    { id:'J1', category:'Fem Light', round:1, p1:'A', p2:'B' },
    { id:'J2', category:'Fem Light', round:1, p1:'C', p2:'D' },
    { id:'J3', category:'Fem Light', round:1, p1:'E', p2:'F' }
  ]
};
const gradeJanelaFechada = W._schGradeEstimada(janelaFechada);
ok(gradeJanelaFechada && gradeJanelaFechada.cabe === false && gradeJanelaFechada.extraMs === 30 * 60000 &&
  gradeJanelaFechada.slots.length === 3 && gradeJanelaFechada.slots.filter(function (slot) { return slot.extrapolaJanela; }).length === 1,
  'a grade mantém todos os jogos no próprio dia e marca o excedente da janela');
ok(W._operationalSchedulePlan(janelaFechada).cabe === false && W._operationalSchedulePlan(janelaFechada).extraMs === 30 * 60000,
  'a agenda operacional também bloqueia uma distribuição que ultrapassaria a janela');
const janelaTrocada = W._operationalSchedulePlan(janelaFechada, [
  { matchId:'J1', court:'Quadra 1', scheduledAt:new Date('2026-10-22T19:00:00-03:00').toISOString() },
  { matchId:'J3', court:'Quadra 1', scheduledAt:new Date('2026-10-22T18:00:00-03:00').toISOString() }
]);
ok(janelaTrocada.items.find(function (item) { return item.matchId === 'J1'; }).extrapolaJanela === true &&
  janelaTrocada.items.find(function (item) { return item.matchId === 'J3'; }).extrapolaJanela === false,
  'a faixa zebrada acompanha o slot atual: sai do jogo trazido para dentro e entra no que foi levado para fora');
// REGRESSÃO: janelas explícitas são a fronteira do evento. Mesmo que a data final
// legada alcance o sábado, uma configuração quinta/sexta não pode criar aba, slot
// ou sugestão no sábado para tentar acomodar o que não coube.
const doisDiasRigidos = {
  startDate:'2026-10-22T18:00', endDate:'2026-10-24T23:59', courtCount:1, gameDuration:30,
  scheduleWindow:{ version:1, days:[
    { day:'2026-10-22', startTime:'18:00', endTime:'18:30' },
    { day:'2026-10-23', startTime:'18:00', endTime:'18:30' }
  ] },
  categorySchedule:{ version:1, slots:[
    { category:'Fem Light', day:'2026-10-22', order:1 },
    { category:'Fem Power', day:'2026-10-23', order:1 }
  ] },
  matches:[
    { id:'QUI', category:'Fem Light', round:1, p1:'A', p2:'B' },
    { id:'SEX', category:'Fem Power', round:1, p1:'C', p2:'D' },
    { id:'NAO-CABE', category:'Fem Power', round:2, p1:'E', p2:'F' }
  ]
};
const gradeDoisDiasRigidos = W._schGradeEstimada(doisDiasRigidos);
const planDoisDiasRigidos = W._operationalSchedulePlan(doisDiasRigidos);
const janelaDoisDiasRigidos = W._schJanelaTorneio(doisDiasRigidos);
ok(janelaDoisDiasRigidos && janelaDoisDiasRigidos.dias.length === 2 && gradeDoisDiasRigidos && gradeDoisDiasRigidos.cabe === false &&
  gradeDoisDiasRigidos.slots.every(function (slot) { return slot.iso.slice(0, 10) !== '2026-10-24'; }),
  'janelas explícitas não herdam um terceiro dia da data final legada');
ok(planDoisDiasRigidos.cabe === false && planDoisDiasRigidos.unscheduledCount === 0 &&
  planDoisDiasRigidos.items.every(function (item) { return item.scheduledAt.slice(0, 10) !== '2026-10-24'; }) &&
  planDoisDiasRigidos.items.some(function (item) { return item.extrapolaJanela; }),
  'a prévia não cria terceiro dia: mantém o jogo excedente no dia configurado e o sinaliza');
const sequenciaCategorias = {
  startDate:'2026-10-22T18:00', endDate:'2026-10-22T23:00', courtCount:1, gameDuration:30,
  scheduleWindow:{ version:1, days:[{ day:'2026-10-22', startTime:'18:00', endTime:'23:00', categoryFlow:'categories' }] },
  categorySchedule:{ version:1, slots:[
    { category:'Light', day:'2026-10-22', order:1 }, { category:'Power', day:'2026-10-22', order:2 }
  ] },
  matches:[
    { id:'L1', category:'Light', round:1, p1:'A', p2:'B' }, { id:'L2', category:'Light', round:2, p1:'C', p2:'D' },
    { id:'P1', category:'Power', round:1, p1:'E', p2:'F' }, { id:'P2', category:'Power', round:2, p1:'G', p2:'H' }
  ]
};
function sequenceOf(grade) { return grade.slots.slice().sort(function (a, b) { return a.ms - b.ms; }).map(function (slot) { return slot.matchId; }).join(','); }
ok(sequenceOf(W._schGradeEstimada(sequenciaCategorias)) === 'L1,L2,P1,P2',
  'modo por categoria conclui a primeira categoria antes de começar a segunda');
const sequenciaRodadas = Object.assign({}, sequenciaCategorias, { scheduleWindow:{ version:1, days:[{ day:'2026-10-22', startTime:'18:00', endTime:'23:00', categoryFlow:'rounds' }] } });
ok(sequenceOf(W._schGradeEstimada(sequenciaRodadas)) === 'L1,P1,L2,P2',
  'modo por rodadas faz R1 de todas as categorias antes de iniciar R2');
ok(/categorySchedule/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8')),
  'a revisão pré-sorteio permite gravar dia e ordem de cada categoria');
// Este é o módulo de produção que materializa o rascunho do sorteio; não use
// `functions/index.js` ao revisar ou ampliar esta cobertura.
const functionsSource = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
const bracketViewSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
ok(/'teamCompetition','categorySchedule','scheduleWindow'/.test(functionsSource) && /'teamCompetition','categorySchedule','turnos'/.test(functionsSource),
  'o servidor aceita janelas diárias junto da agenda antes do sorteio e preserva a estrutura depois da chave');
ok(/match\.scheduledGameNumber\s*=\s*scheduledGameNumber\.get\(item\.matchId\)/.test(functionsSource) &&
  /match\.scheduleLocked\s*=\s*item\.scheduleLocked\s*===\s*true/.test(functionsSource) &&
  !/match\.matchNumber\s*=\s*matchNumber\.get/.test(functionsSource),
  'a agenda revisada grava Jogo N como contrato da chave e trava somente escolhas manuais');
ok(/scheduledGameNumber:i\.scheduledGameNumber/.test(bracketLogicSource) && /scheduleLocked:true/.test(bracketLogicSource),
  'a tela envia à Function a sequência cronológica que o organizador confirmou');
ok(/_CAMPOS_RASCUNHO_SORTEIO_INICIAL[\s\S]*?'matches'/.test(functionsSource) && /_aplicaRascunhoDoSorteioInicial\(t, pd\.draft\)/.test(functionsSource),
  'publicar materializa os mesmos jogos do rascunho, preservando a estrutura confirmada de horário, quadra, ordem e confronto');
ok(/competitionTeamTagForMatch/.test(bracketViewSource) && /sp-match-team-tag--vertical/.test(bracketViewSource) &&
  !/>Time: ' \+ window\._safeHtml\(name\)/.test(bracketViewSource),
  'cards de competição mostram uma tag vertical colorida, sem o prefixo redundante “Time:”');
ok(!/Agendado: /.test(bracketViewSource),
  'o cabeçalho do card não duplica o horário que já pode ser reagendado abaixo');
const drawSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8');
ok(/'courtNames','courtOrder'/.test(functionsSource) && /data-team-court-card/.test(drawSource) && /draggable="true"/.test(drawSource),
  'a organização define a prioridade das quadras com cards arrastáveis antes do sorteio');
ok(/data-team-day-lane/.test(drawSource) && /data-team-category-source/.test(drawSource) && /data-team-remove-category/.test(drawSource),
  'categorias podem ser arrastadas para um ou mais dias e removidas de um dia específico');
ok(/data-team-toggle-group="mode"/.test(drawSource) && /wireToggle\('mode'/.test(drawSource),
  'o modo estruturado/livre usa toggle com explicação dinâmica da escolha ativa');
ok(/data-team-day-flow/.test(drawSource) && /categoryFlow/.test(drawSource) && /data-team-day-start/.test(drawSource),
  'a mesma tela define, para cada dia, sequência concentrada/alternada e início/fim');
ok(/grid-template-columns:1fr;gap:5px;width:100%;min-width:0/.test(drawSource) && /grid-template-columns:42px minmax\(0,1fr\)/.test(drawSource) && /<span>Início<\/span>/.test(drawSource) && /<span>Fim<\/span>/.test(drawSource),
  'início e fim ocupam linhas inteiras, sem se sobrepor ou truncar em nenhuma largura');
ok(/flex:0 1 auto;min-width:0;font-size:\.62rem/.test(drawSource),
  'os toggles Concentradas/Alternadas permanecem compactos em cada dia');
ok(/position:sticky;top:0;z-index:3/.test(drawSource) && !/id="team-draw-cancel" class=/.test(drawSource),
  'Voltar fica sempre visível no cabeçalho e não há Cancelar duplicado no rodapé');
ok(/data-\' \+ prefix \+ \'-empty-slot/.test(organizerSource) && /data-pis-empty-slot/.test(bracketLogicSource) && /Solte um jogo aqui/.test(organizerSource),
  'quadras vazias aceitam arrastar e soltar tanto na agenda quanto na revisão privada');
ok(/sp-team-draw-time/.test(drawSource) && /__openingPendingInitialScheduleFromDraw/.test(drawSource) && /_openPendingInitialSchedule\(tId\)/.test(drawSource) && !/window\.location\.hash = d\.staged \? '#tournaments\/'/.test(drawSource),
  'os horários do sorteio usam controle compacto e uma revisão nova vai de Sorteando direto ao planejamento privado, sem voltar ao detalhe');
ok(!/data-team-court-rank-label/.test(drawSource) && !/paintCourtRanks/.test(drawSource) && /data-team-court-card/.test(drawSource),
  'a prioridade das quadras é definida pela ordem dos cards, sem prefixos ordinais redundantes');
ok(/var selectedMode = modeConfirmed && \(cfg\.schedule\.mode === 'structured' \|\| cfg\.schedule\.mode === 'free'\) \? cfg\.schedule\.mode : 'free';/.test(drawSource),
  'Livre é o padrão no primeiro sorteio; uma escolha já confirmada permanece');
ok((drawSource.match(/background:#182235!important;color:var\(--text-bright\)!important/g) || []).length >= 1 && !/id="team-draw-cancel" class=/.test(drawSource),
  'Voltar tem contraste explícito no modal de configuração e Cancelar redundante não existe');

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
ok(/← Voltar/.test(bracketLogicSource) && /data-pis-apply/.test(bracketLogicSource) && /data-pis-publish/.test(bracketLogicSource) &&
  /data-pis-toolbar/.test(bracketLogicSource) && /data-pis-day-tabs/.test(bracketLogicSource) && /board\.tabsHtml/.test(bracketLogicSource) && /board\.gridHtml/.test(bracketLogicSource) && /data-pis-scroll/.test(bracketLogicSource) && /display:flex;flex-direction:column;isolation:isolate/.test(bracketLogicSource) && /overflow:hidden/.test(bracketLogicSource) && /width:100%;max-width:1600px/.test(bracketLogicSource),
  'Voltar, Salvar ajustes, Publicar e abas de dia ficam em barras opacas separadas, fora das rolagens da grade');
ok(/tabsHtml:tabsHtml/.test(organizerSource) && /gridHtml:gridHtml/.test(organizerSource),
  'a grade expõe abas e conteúdo separadamente para manter o seletor de dias fixo fora da rolagem');
ok(/gridScroll = \{ top:0, left:0 \}/.test(bracketLogicSource) && /previousScroll\.scrollTop/.test(bracketLogicSource) && /restoredScroll\.scrollTop = gridScroll\.top/.test(bracketLogicSource) && /restoredScroll\.scrollLeft = gridScroll\.left/.test(bracketLogicSource),
  'recalcular a grade após arrastar preserva a rolagem vertical e horizontal do ponto em edição');
ok(/data-\' \+ prefix \+ \'-outside-window/.test(organizerSource) && /repeating-linear-gradient\(45deg,rgba\(239,68,68/.test(organizerSource) && /Todos os jogos continuam exibidos/.test(bracketLogicSource),
  'jogos que ultrapassam a janela seguem na grade com faixa zebrada vermelha e cinza');
const pendingScheduleStart = bracketLogicSource.indexOf('window._openPendingInitialSchedule = function');
const pendingScheduleEnd = bracketLogicSource.indexOf('window._rememberPendingDrawMarker = function', pendingScheduleStart);
const pendingSchedule = bracketLogicSource.slice(pendingScheduleStart, pendingScheduleEnd);
ok(!/if \(!latest\.cabe\)[\s\S]{0,220}?return;/.test(pendingSchedule) && /Publicando horários estimados/.test(pendingSchedule) && /if \(!draft\.cabe\)/.test(organizerSource),
  'a revisão inicial pode publicar agenda excedente sinalizada; a aplicação operacional comum continua validando distribuição inválida');
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
