'use strict';
// O painel real não pede ao organizador a atribuição manual das 24 duplas.
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
  categories, participants, courtCount:6,
  teamCompetition:{ enabled:true, teamCount:8,
    teamNames:['Blackout', 'Blast', 'Eclipse', 'Panic', 'Phantom', 'Venom', 'Volt', 'Vortex'],
    schedule:{ enabled:true, gamesPerTeam:3, originDayPolicy:'female-light-organization-final',
      pairDayAssignments:participants.slice(0, 24).map((entry, index) => ({ fixedPairId:entry.fixedPairId, day:index < 16 ? '2026-10-22' : '2026-10-23' })) } }
};
W._findTournamentById = () => tournament;
let overlay;
sandbox.document.createElement = () => {
  overlay = {
    style:{}, innerHTML:'', remove(){},
    querySelector(selector){ return selector === '#team-draw-cancel-top' ? {} : null; },
    querySelectorAll(){ return []; }
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
if (/<select data-pair-day=|<label class="sp-team-pair-card"|Confirme o dia de cada dupla/.test(overlay.innerHTML)) {
  throw new Error('Painel ainda oferece atribuição manual de dia');
}
if (/O sorteio está bloqueado/.test(overlay.innerHTML)) throw new Error('Elenco Neon válido foi bloqueado');
if (!/8 duplas Fem Light de sexta já foram definidas pela organização/.test(overlay.innerHTML)) throw new Error('Plano nominal da organização não aparece no torneio');
const lightCards = overlay.innerHTML.match(/data-team-category-card="Fem Light"/g) || [];
if (lightCards.length < 3) throw new Error('Fem Light deve aparecer na fonte e nos dois dias');
const visibleHtml = overlay.innerHTML.replace(/\sdata-[^=]+="[^"]*"/g, '');
if (/uid-(?:first|second)-/.test(visibleHtml)) throw new Error('UID cru vazou no conteúdo visível');
const savedAssignments = tournament.teamCompetition.schedule.pairDayAssignments;
tournament.teamCompetition.schedule.pairDayAssignments = savedAssignments.slice(1);
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (!/lista final dos 24 dias das duplas Fem Light ainda não foi importada/.test(overlay.innerHTML) || !/id="team-draw-confirm"[^>]*disabled aria-disabled="true"/.test(overlay.innerHTML)) {
  throw new Error('Mapa nominal incompleto deve bloquear o sorteio');
}
tournament.teamCompetition.schedule.pairDayAssignments = savedAssignments;
const savedOrigin = participants[0].originCategoryLabel;
participants[0].originCategoryLabel = '';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (/Sorteio bloqueado/.test(overlay.innerHTML)) throw new Error('Plano nominal não depende da categoria original');
participants[0].originCategoryLabel = savedOrigin;
tournament.name = 'Torneio renomeado';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (/Sorteio bloqueado/.test(overlay.innerHTML) || !/8 duplas Fem Light de sexta já foram definidas pela organização/.test(overlay.innerHTML)) {
  throw new Error('Plano nominal salvo deve continuar valendo após renomeação');
}
tournament.teamCompetition.schedule.originDayPolicy = '';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (!/política de dias salva não corresponde à distribuição final/.test(overlay.innerHTML)) {
  throw new Error('ID do Neon exige política nominal explícita');
}
tournament.id = 'other_tournament';
tournament.name = 'Neon Nightmare';
W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded:true });
if (/8 duplas Fem Light de sexta já foram definidas pela organização/.test(overlay.innerHTML)) {
  throw new Error('Nome Neon em outro torneio não pode ativar a regra nominal');
}
console.log('✓ Painel Neon: sem seletores manuais, Fem Light nos dois dias e sem UID visível');
