'use strict';

const assert = require('node:assert/strict');
const core = require('../functions/camis-manual-edit-core');
const mutations = require('../functions/registration-mutations-core');
const rehearsal = require('../functions-autodraw/tournament-rehearsal');
const rename = require('../functions/rename-canonical-participant-core');

const names = ['Karina', 'Kelly Barth', 'Lucely', 'Flávia'];
const categoryId = 'prata';
const registrations = names.map((name, i) => ({
  id:'', data:{ ...mutations.enroll(core.ID,[],{manualParticipantId:'manual-'+i},[categoryId],
    {status:'confirmed',manualDisplayName:name}).creates[0],enrollSeq:i+1 }
}));
registrations.forEach(item => { item.id = item.data.registrationId; });
const pairings = [
  [['Karina','Kelly Barth'],['Lucely','Flávia']],
  [['Karina','Lucely'],['Kelly Barth','Flávia']],
  [['Karina','Flávia'],['Kelly Barth','Lucely']]
];
const matches = pairings.map((pair,i) => ({ id:'m'+i,data:{ jogo:{ id:'m'+i,category:'Fem Prata',monarchGroup:0,
  isMonarch:true,team1:pair[0],team2:pair[1],p1:pair[0].join(' / '),p2:pair[1].join(' / '),
  scoreP1:null,scoreP2:null,winner:null } } }));
const baseRoot = { id:core.ID,name:'Camis no Beyond',creatorUid:core.OWNER,isPublic:false,
  organizerOnly:true,isSandbox:false,status:'active',canonicalRegistrationMigration:{
    fingerprint:'native:'+core.ID,registrationCount:4 },
  categoryDefinitions:[{id:categoryId,label:'Fem Prata'}],
  camisOfficialGroups:{'Fem Prata':[names.slice()]} };
const tree = registrations.map(item => ({path:'registrations/'+item.id,data:item.data}))
  .concat(matches.map(item => ({path:'matches/'+item.id,data:item.data})))
  .sort((a,b) => a.path.localeCompare(b.path));
const payload = {root:baseRoot,tree,summary:null};
const hash = rehearsal.fingerprint(payload);
const baseline = {...payload,state:'active',mode:'postDraw',epoch:'test',hash};
const tournament = {...baseRoot,rehearsal:{state:'active',mode:'postDraw',epoch:'test',hash}};
const input = { tournament,baseline,registrations,matches,oldName:'Kelly Barth',
  manualParticipantId:'manual-1',now:new Date('2026-11-12T15:00:00Z') };

assert.equal(core.fingerprint(payload),rehearsal.fingerprint(payload),'hash do reset é idêntico ao motor publicado');
const renamed = core.plan({...input,action:'rename',newName:'Kelly Bart'});
assert.equal(core.plan({...input,tournament:{...tournament,name:'Camis Day'},action:'rename',newName:'Kelly Bart'}).nextReg.manualDisplayName,'Kelly Bart',
  'edição de atletas continua válida após renomear o torneio');
assert.equal(renamed.nextReg.registrationId,registrations[1].id,'corrigir mantém identidade');
assert.equal(renamed.liveMatches.length,3);
assert.equal(renamed.nextRoot.camisOfficialGroups['Fem Prata'][0][1],'Kelly Bart');
assert.equal(renamed.nextBaseline.tree.length,tree.length);
assert.equal(core.fingerprint({root:renamed.nextBaseline.root,tree:renamed.nextBaseline.tree,summary:null}),renamed.hash);
assert.equal(rename.hasOldLabel(renamed.nextBaseline,'Kelly Barth'),false,'reset não restaura grafia anterior');

const scored = matches.map((item,i) => i === 0 ? { ...item,data:{jogo:{...item.data.jogo,
  scoreP1:6,scoreP2:4,winner:item.data.jogo.p1}} } : item);
const replaced = core.plan({...input,matches:scored,action:'replace',newName:'Nova Atleta',
  newManualParticipantId:'manual-new'});
assert.equal(replaced.completedGames,1,'resultado concluído permanece com quem jogou');
assert.equal(replaced.liveMatches.length,2,'somente jogos futuros mudam');
assert.equal(replaced.nextRoot.canonicalRegistrationMigration.registrationCount,5);
assert.equal(registrations.length,4);
assert.equal(replaced.nextReg.status,'confirmed','a nova inscrição ocupa a vaga ativa');
assert.equal(replaced.nextBaseline.root.canonicalRegistrationMigration.registrationCount,4,
  'reset retorna a uma lista limpa de quatro vagas');
assert.equal(replaced.nextBaseline.tree.filter(item => item.path.startsWith('registrations/')).length,4);
assert.equal(rename.hasOldLabel(replaced.nextBaseline,'Kelly Barth'),false,'reset volta à nova atleta sem placar');
assert.equal(core.fingerprint({root:replaced.nextBaseline.root,tree:replaced.nextBaseline.tree,summary:null}),replaced.hash);

assert.throws(() => core.plan({...input,action:'rename',newName:'Lucely'}),/já existe atleta/);
const playing = matches.map((item,i) => i === 0 ? { ...item,data:{jogo:{...item.data.jogo,startedAt:'agora'}} } : item);
assert.throws(() => core.plan({...input,matches:playing,action:'replace',newName:'Nova Atleta',
  newManualParticipantId:'manual-new'}),/partida em andamento/);

const later = { ...input.tournament,phaseRounds:{ phase2:{ rounds:[{ matches:[
  { id:'old-final',p1:'Kelly Barth',p2:'Lucely',winner:'Lucely',scoreP1:3,scoreP2:6 },
  { id:'new-final',p1:'Kelly Barth',p2:'Flávia',winner:null,scoreP1:null,scoreP2:null }
] }] } } };
const laterMatches = scored.concat({ id:'phase2',data:{ jogo:{ id:'phase2',category:'Fem Prata',
  p1:'Kelly Barth',p2:'Flávia',winner:null,scoreP1:null,scoreP2:null } } });
laterMatches.push({ id:'phase2-old',data:{ jogo:{ id:'phase2-old',category:'Fem Prata',
  p1:'Kelly Barth',p2:'Lucely',winner:'Lucely',scoreP1:3,scoreP2:6 } } });
const laterPlan = core.plan({...input,tournament:later,matches:laterMatches,action:'replace',
  newName:'Nova Atleta',newManualParticipantId:'manual-next'});
assert.equal(laterPlan.liveMatches.length,3,'fase posterior sem monarchGroup também recebe troca');
assert.equal(laterPlan.completedGames,2,'fase posterior concluída preserva o nome histórico');
assert.equal(laterPlan.nextRoot.phaseRounds.phase2.rounds[0].matches[0].p1,'Kelly Barth',
  'partida histórica embutida mantém a formação anterior');
assert.equal(laterPlan.nextRoot.phaseRounds.phase2.rounds[0].matches[1].p1,'Nova Atleta',
  'partida futura embutida acompanha a nova vaga');
const withPresence = {...input.tournament,
  checkedIn:{'manual:manual-1':true,'manual:manual-0':true},
  checkedInConfirmed:{'manual:manual-1':true},absent:{'manual:manual-1':true}};
const presencePlan = core.plan({...input,tournament:withPresence,action:'replace',
  newName:'Nova Atleta',newManualParticipantId:'manual-presence'});
assert.equal(presencePlan.nextRoot.checkedIn['manual:manual-1'],undefined,
  'presença da pessoa substituída sai');
assert.equal(presencePlan.nextRoot.checkedIn['manual:manual-0'],true,
  'presença das outras pessoas permanece');
assert.equal(presencePlan.nextRoot.checkedInConfirmed['manual:manual-1'],undefined);
assert.equal(presencePlan.nextRoot.absent['manual:manual-1'],undefined);
const waiting = mutations.enroll(core.ID,[],{manualParticipantId:'manual-reserve'},[categoryId],
  {status:'waitlisted',manualDisplayName:'Reserva'}).creates[0];
waiting.enrollSeq = 5;
const waitingRegs = registrations.concat({id:waiting.registrationId,data:waiting});
const fullRoot = {...baseRoot,maxParticipants:4,registrationLimit:4,
  canonicalRegistrationMigration:{...baseRoot.canonicalRegistrationMigration,registrationCount:5}};
const fullTree = tree.concat({path:'registrations/'+waiting.registrationId,data:waiting})
  .sort((a,b) => a.path.localeCompare(b.path));
const fullPayload = {root:fullRoot,tree:fullTree,summary:null};
const fullHash = rehearsal.fingerprint(fullPayload);
const fullPlan = core.plan({...input,tournament:{...fullRoot,rehearsal:{...tournament.rehearsal,hash:fullHash}},
  baseline:{...fullPayload,state:'active',mode:'postDraw',epoch:'test',hash:fullHash},
  registrations:waitingRegs,action:'replace',newName:'Nova Atleta',
  newManualParticipantId:'manual-full'});
assert.equal(fullPlan.nextRoot.canonicalRegistrationMigration.registrationCount,6);
assert.equal(fullPlan.nextBaseline.tree.filter(item => item.path.startsWith('registrations/')).length,5);
assert.equal(fullPlan.nextBaseline.tree.filter(item => item.path.startsWith('registrations/') &&
  item.data.status === 'confirmed').length,4,'teto da categoria permanece em quatro vagas ativas');
assert.equal(fullPlan.nextReg.status,'confirmed','nova pessoa ocupa a inscrição confirmada retirada');
assert.equal(fullPlan.nextBaseline.tree.filter(item => item.path.startsWith('registrations/') &&
  item.data.status === 'waitlisted').length,1,
  'reserva permanece na espera quando o teto já está cheio');
console.log('✓ CAMIS manual: correção preserva identidade; troca preserva resultados; reset volta à lista limpa');
