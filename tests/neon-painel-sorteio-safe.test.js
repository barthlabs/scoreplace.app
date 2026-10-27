'use strict';
// O painel real expõe dias nominais por dupla, sem mudar o mapa salvo sozinho.
const { window: W, sandbox } = require('./render-harness');
const categories = ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'];
const neonId = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const counts = [24, 8, 8, 8, 8, 8];
let sequence = 1;
const participants = categories.flatMap((category, categoryIndex) => Array.from({ length: counts[categoryIndex] }, (_, index) => {
  const p1Seq = sequence + 100;
  sequence += 2;
  return { category, categoryId:'category-' + categoryIndex, fixedPairId:'pair-' + p1Seq, p1Seq,
    originCategoryId:categoryIndex === 0 && index >= 19 ? 'category-3' : 'category-' + categoryIndex,
    originCategoryLabel:categoryIndex === 0 && index >= 19 ? 'Masc Light' : category,
    p1Uid:'uid-first-' + p1Seq, p2Uid:'uid-second-' + p1Seq };
}));
const tournament = {
  id:neonId, name:'Neon Nightmare', startDate:'2026-10-22T18:00', endDate:'2026-10-23T22:40',
  categories, participants, courtCount:6, courtNames:['Quadra 4','Quadra 5','Quadra 6','Quadra 7','Quadra 8','Quadra 9'],
  categoryDefinitions:categories.map((label, index) => ({ id:'category-' + index, label })),
  teamCompetition:{ enabled:true, teamCount:8,
    teamNames:['Blackout', 'Blast', 'Eclipse', 'Panic', 'Phantom', 'Venom', 'Volt', 'Vortex'],
    schedule:{ enabled:true, gamesPerTeam:3, originDayPolicy:'female-light-organization-final',
      pairDayAssignments:participants.slice(0, 24).map((entry, index) => ({ fixedPairId:entry.fixedPairId, day:index < 16 ? '2026-10-22' : '2026-10-23' })) } }
};
W._findTournamentById = () => tournament;
let overlay;
let dayEditor;
let confirmNode;
const courts = Array.from({ length:6 }, (_, index) => ({ getAttribute(){ return 'Quadra ' + (index + 4); } }));
const dayCards = [
  ['Fem Power', 'Fem Extreme', 'Fem Light'],
  ['Masc Power', 'Masc Extreme', 'Masc Light', 'Fem Light']
].map((names, index) => ({
  style:{}, getAttribute(name){ return name === 'data-day' ? ['2026-10-22','2026-10-23'][index] : null; },
  querySelectorAll(selector){ return selector === '[data-team-category-card]' ? names.map(category => ({
    getAttribute(){ return category; }
  })) : []; }
}));
sandbox.document.createElement = () => {
  dayEditor = { innerHTML:'', querySelectorAll(){ return []; } };
  confirmNode = {};
  const pairSection = { style:{} };
  overlay = {
    style:{}, innerHTML:'', remove(){},
    querySelector(selector){
      if (selector === '[data-team-pair-day-editor]') return dayEditor;
      if (selector === '[data-team-pair-day-section]') return pairSection;
      if (selector === '#team-draw-confirm') return confirmNode;
      if (selector === '#team-draw-cancel-top') return {};
      if (selector.includes('[data-team-day-start]')) return { value:'18:00' };
      if (selector.includes('[data-team-day-end]')) return { value:'22:40' };
      const day = /data-team-day-lane\]\[data-day="([^"]+)"/.exec(selector);
      return day ? dayCards[['2026-10-22','2026-10-23'].indexOf(day[1])] : null;
    },
    querySelectorAll(selector){
      if (selector === '[data-team-day-lane]') return dayCards;
      if (selector === '[data-team-court-card]') return courts;
      return [];
    }
  };
  return overlay;
};
if (!W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true }) || !overlay) {
  throw new Error('Painel Neon não abriu');
}
const backAt = overlay.innerHTML.indexOf('id="team-draw-cancel-top"');
const drawAt = overlay.innerHTML.indexOf('id="team-draw-confirm"');
const contentAt = overlay.innerHTML.indexOf('<style>');
if (backAt < 0 || drawAt <= backAt || drawAt >= contentAt ||
    (overlay.innerHTML.match(/id="team-draw-confirm"/g) || []).length !== 1 ||
    overlay.innerHTML.includes('<div style="display:flex;justify-content:flex-end;"><button type="button" id="team-draw-confirm"')) {
  throw new Error('Voltar e Sortear devem aparecer uma única vez, nessa ordem, no cabeçalho fixo');
}
if (!/data-team-pair-day-editor/.test(overlay.innerHTML)) throw new Error('Editor de dias das duplas ausente');
if (!/16 duplas/.test(dayEditor.innerHTML) || !/8 duplas/.test(dayEditor.innerHTML) ||
    !/Sortear dias livremente/.test(dayEditor.innerHTML) ||
    /Dias das duplas — conferir e ajustar|Misto ou indefinido/.test(overlay.innerHTML + dayEditor.innerHTML)) {
  throw new Error('Fem Light deve distribuir automaticamente 16/8 em duas caixas, sem o editor antigo');
}
if (/O sorteio está bloqueado/.test(overlay.innerHTML)) throw new Error('Elenco Neon válido foi bloqueado');
const lightCards = overlay.innerHTML.match(/data-team-category-card="Fem Light"/g) || [];
if (lightCards.length < 3) throw new Error('Fem Light deve aparecer na fonte e nos dois dias');
if (!/class="cancel-x-btn" data-team-remove-category[^>]*aria-label="Remover Fem Light deste dia"/.test(overlay.innerHTML) ||
    !/--cx-size:20px/.test(overlay.innerHTML)) {
  throw new Error('Fem Light deve usar o X canônico no círculo vermelho');
}
const visibleHtml = overlay.innerHTML.replace(/\sdata-[^=]+="[^"]*"/g, '');
if (/uid-(?:first|second)-/.test(visibleHtml)) throw new Error('UID cru vazou no conteúdo visível');
const fullRoster = tournament.participants;
tournament.participants = participants.filter(entry => entry.category !== 'Fem Light')
  .concat(participants.filter(entry => entry.category === 'Fem Light').slice(0, 8));
tournament.teamCompetition.schedule.originDayPolicy = 'organizer-pair-days';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (!/ao menos duas duplas por time/.test(dayEditor.innerHTML) ||
    /As duplas fixadas não cabem/.test(dayEditor.innerHTML)) {
  throw new Error('Categoria de uma dupla por time em dois dias precisa de aviso específico, sem acusar fixações inexistentes');
}
tournament.participants = fullRoster;
tournament.teamCompetition.schedule.originDayPolicy = 'female-light-organization-final';
const savedAssignments = tournament.teamCompetition.schedule.pairDayAssignments;
tournament.teamCompetition.schedule.pairDayAssignments = savedAssignments.slice(1);
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (!/data-team-pair-day-editor/.test(overlay.innerHTML)) throw new Error('Mapa parcial ainda precisa do editor de dias');
tournament.teamCompetition.schedule.pairDayAssignments = savedAssignments;
const savedOrigin = participants[0].originCategoryLabel;
participants[0].originCategoryLabel = '';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (/Sorteio bloqueado/.test(overlay.innerHTML)) throw new Error('Plano nominal não depende da categoria original');
participants[0].originCategoryLabel = savedOrigin;
tournament.name = 'Torneio renomeado';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (/Sorteio bloqueado/.test(overlay.innerHTML) || !/data-team-pair-day-editor/.test(overlay.innerHTML)) {
  throw new Error('Plano nominal salvo deve continuar valendo após renomeação');
}
tournament.teamCompetition.schedule.originDayPolicy = '';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (!/data-team-pair-day-editor/.test(overlay.innerHTML)) throw new Error('Editor independe do marcador legado');
tournament.id = 'other_tournament';
tournament.name = 'Neon Nightmare';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (!/data-team-pair-day-editor/.test(overlay.innerHTML)) throw new Error('Editor independe do nome do torneio');
const category = participants[0].category;
delete participants[0].category;
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (/O sorteio está bloqueado/.test(overlay.innerHTML)) throw new Error('Categoria canônica sem rótulo legado não deve bloquear o painel');
participants[0].category = category;
let saves = 0, ready = 0, savedPayload;
W.FirestoreDB = {
  _ehSandbox(){ return true; },
  _callFn(name, payload){
    if (name !== 'updateTournamentConfiguration') throw new Error('Chamada inesperada: ' + name);
    saves++; savedPayload = payload;
    return Promise.resolve({ ok:true });
  }
};
tournament.id = 'sb_' + neonId + '_1793070000000';
tournament.teamCompetition.schedule.originDayPolicy = 'female-light-organization-final';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true, onReady(){ ready++; } });
if (typeof confirmNode.onclick !== 'function') throw new Error('Sortear não habilitou para elenco completo');
confirmNode.onclick();
setImmediate(async () => { try {
  const assignments = savedPayload && savedPayload.patch.teamCompetition.schedule.pairDayAssignments || [];
  const light = assignments.filter(item => participants.some(entry => entry.fixedPairId === item.fixedPairId && entry.category === 'Fem Light'));
  const first = light.filter(item => item.day === '2026-10-22').length;
  const second = light.filter(item => item.day === '2026-10-23').length;
  const savedDays = new Map(savedAssignments.map(item => [item.fixedPairId, item.day]));
  const preservedDays = light.every(item => savedDays.get(item.fixedPairId) === item.day);
  if (saves !== 1 || ready !== 1 || savedPayload.sandbox !== true || assignments.length !== 64 || first !== 16 || second !== 8 || !preservedDays) {
    throw new Error('Um clique deve preservar os dias nominais salvos sob a política antiga (Fem Light 16/8) e só então prosseguir');
  }
  // Se o salvamento falha, o clique não pode iniciar o sorteio com uma agenda
  // que existe apenas na memória do navegador.
  W.FirestoreDB._callFn = () => Promise.reject(new Error('falha de gravação simulada'));
  W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true, onReady(){ ready++; } });
  confirmNode.onclick();
  await new Promise(resolve => setImmediate(resolve));
  if (ready !== 1 || confirmNode.disabled || confirmNode.textContent !== '🎲 Sortear times e confrontos') {
    throw new Error('Falha ao salvar deve reabilitar o botão sem disparar o sorteio');
  }
  tournament.id = 'sb_common_team_tournament';
  tournament.name = 'Torneio comum';
  tournament.teamCompetition.teamCount = 4;
  tournament.teamCompetition.teamNames = ['Time A', 'Time B', 'Time C', 'Time D'];
  tournament.teamCompetition.schedule.originDayPolicy = '';
  tournament.teamCompetition.schedule.pairDayAssignments = [];
  tournament.teamCompetition.schedule.pairsPerTeamByCategory = Object.fromEntries(categories.map(label => [label, label === 'Fem Light' ? 6 : 2]));
  let commonPayload;
  W.FirestoreDB._callFn = (name, payload) => {
    if (name !== 'updateTournamentConfiguration') throw new Error('Chamada inesperada: ' + name);
    commonPayload = payload;
    return Promise.resolve({ ok:true });
  };
  W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true, onReady(){} });
  if (typeof confirmNode.onclick !== 'function' || dayEditor.innerHTML !== '') {
    throw new Error('Torneio comum sem opt-in não deve ativar a divisão de duplas ao reabrir');
  }
  confirmNode.onclick();
  await new Promise(resolve => setImmediate(resolve));
  const commonAssignments = commonPayload && commonPayload.patch.teamCompetition.schedule.pairDayAssignments || [];
  if (commonAssignments.length !== 0 || commonPayload.patch.teamCompetition.schedule.originDayPolicy !== '') {
    throw new Error('Confirmar torneio comum sem opt-in não pode regravar dias das duplas nem mudar a política');
  }
  tournament.participants = participants.filter(entry => entry.category !== 'Fem Light')
    .concat(participants.filter(entry => entry.category === 'Fem Light').slice(0, 4));
  tournament.teamCompetition.schedule.pairsPerTeamByCategory['Fem Light'] = 1;
  commonPayload = null;
  W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true, onReady(){} });
  if (typeof confirmNode.onclick !== 'function') throw new Error('Agenda legada válida deve permitir confirmação');
  confirmNode.onclick();
  await new Promise(resolve => setImmediate(resolve));
  if (!commonPayload || (commonPayload.patch.teamCompetition.schedule.pairDayAssignments || []).length !== 0) {
    throw new Error('Categoria de uma dupla por time em dois dias não pode bloquear nem criar dias nominais sem opt-in');
  }
  console.log('✓ Painel Neon: 16/8 por um clique, dias configuráveis, X correto e sem UID visível');
} catch (error) { console.error(error); process.exitCode = 1; } });
