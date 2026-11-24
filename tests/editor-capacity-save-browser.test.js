'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage();page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<main id="view-container"></main>');
  await page.evaluate(()=>{
   window._t=key=>key;window.escapeHtml=s=>String(s||'');window._safeHtml=escapeHtml;
   window._renderBackHeader=o=>'<header class="sticky-back-header">'+o.rightHtml+'</header>';
   window._tourCoverSrc=()=>'';
   window.AppStore={tournaments:[],currentUser:{uid:'synthetic-org'},users:[],venues:[],customSports:[]};
   window.alerts=[];window.saves=[];window.showNotification=()=>{};
  });
  for(const file of ['ui','domain/standings','domain/team-competition','domain/phase-grid-plan'])
   await page.addScriptTag({path:path.join(root,'js/'+file+'.js')});
  for(const file of ['gender-ratio-core','sport-rules','standings-core','super-eight-core','format2',
   'tournaments-categories','bracket-model','chaves','chaves-adapter','phases-engine','tournaments-utils',
   'bracket-logic','bracket-policy','tournaments-draw','schedule-poll','format2-ui','create-tournament'])
   await page.addScriptTag({path:path.join(root,'js/views/'+file+'.js')});
  await page.evaluate(()=>{
   window.showAlertDialog=(...args)=>alerts.push(args);
   window._readTournamentBrandingPatch=()=>({});
   AppStore.addTournament=async value=>{saves.push(value);return value.id||'synthetic-new';};
   window.makeFixture=(id,names,sizes)=>{
    const cfg=FORMAT2.defaultConfig('Beach Tennis');
    Object.assign(cfg,{disputa:'dupla',parceria:'rotation_groups',classifAtiva:true,
     groupFormation:{mode:'size',value:8},classificationSliderMode:'category'});
    cfg.eliminatoria.ativa=false;
    cfg.rotationCategoryRules=names.map(category=>({category,groupFormation:{mode:'size',value:8},rounds:7,allowRepeatPartners:false,destination:'ranking'}));
    return {id,name:id,sport:'Beach Tennis',creatorUid:'synthetic-org',status:'open',
     format:'Fase de Grupos + Eliminatórias',customCategories:names,combinedCategories:names,
     genderCategories:[],skillCategories:[],ageCategories:[],excludedCategories:[],gameTypes:'duplas',
     maxParticipants:sizes.reduce((a,b)=>a+b),maxParticipantsByCategory:Object.fromEntries(names.map((n,i)=>[n,sizes[i]])),
     maxParticipantsPerCategory:null,fmt2:cfg,matches:[],rounds:[],groups:[],courtCount:6,
     gameDuration:15,callTime:2,warmupTime:3,
     scoring:{type:'simple',countingType:'numeric',setsToWin:1,gamesPerSet:6,fixedSet:false,fixedSetGames:6,tiebreakEnabled:true,tiebreakPoints:7}};
   };
   AppStore.tournaments=[makeFixture('synthetic-a',['Alpha · B','Beta · C'],[16,32]),makeFixture('synthetic-b',['Gamma · D','Delta · E'],[8,16])];
   window._findTournamentById=id=>AppStore.tournaments.find(t=>t.id===id);
  });
  async function open(id,fresh=true){
   await page.evaluate(({id,fresh})=>{
    _editRouteFreshId=id||'';
    if(fresh&&id)_editRouteLoadedTournament={id,tournament:_findTournamentById(id)};
    renderCreateTournamentPage(document.querySelector('#view-container'),id);
   },{id,fresh});
   await page.waitForTimeout(80); // The route intentionally schedules its final placement/init.
  }
  const active=()=>page.locator('#view-container .modal');
  const field=id=>active().locator('#'+id);
  async function save(){
   await page.evaluate(()=>{alerts.length=0;saves.length=0;});
   await active().locator('#btn-save-tournament').click({force:true});
   await page.waitForTimeout(20);
   return page.evaluate(()=>({alerts,saves}));
  }
  await page.evaluate(()=>{setupCreateTournamentModal();_f2MountInEditForm();openEditTournamentModal('synthetic-a',true,_findTournamentById('synthetic-a'));_f2MountInEditForm();});
  assert.equal(await page.locator('#category-capacity-section').count(),1,'opening an edit from a pre-mounted creation configurator keeps capacity fields');
  await open('synthetic-a');
  assert.equal(await page.locator('#form-create-tournament').count(),1);
  await field('tourn-name').fill('Unsent draft A');
  await page.evaluate(()=>{_estimatedGameHoursState.touched=true;window.savedHoursState=_estimatedGameHoursState;setupCreateTournamentModal();});
  await open('synthetic-a',false);
  assert.equal(await field('tourn-name').inputValue(),'Unsent draft A');
  assert(await page.evaluate(()=>_estimatedGameHoursState===savedHoursState),'setup repeated preserves agenda state');
  assert.equal(await page.locator('#form-create-tournament').count(),1,'same route does not create a hidden editor');
  await field('f2-slider-common-0').uncheck();
  await field('f2-slider-common-0').check();
  await active().locator('#gsm-presets').locator('button').last().click({force:true});
  await page.locator('#gsm-config-overlay').getByRole('button',{name:'Aplicar',exact:true}).click({force:true});
  await active().locator('#gsm-tieat-inline').getByRole('button',{name:'Games disputados no total',exact:true}).click({force:true});
  await field('gsm-games-target').fill('7');
  let result=await save();
  assert.equal(result.alerts.length,0,JSON.stringify(result.alerts));
  assert.equal(result.saves.length,1,'one click produces one save after route/setup repetition');
  assert.deepEqual(result.saves[0].maxParticipantsByCategory,{'Alpha · B':16,'Beta · C':32});
  assert.equal(result.saves[0].maxParticipants,48);
  assert.equal(result.saves[0].scoring.fixedSet,true);
  assert.equal(result.saves[0].scoring.fixedSetGames,7);
  await page.evaluate(()=>{
   const input=document.querySelector('#view-container input[data-category^="Alpha"]');
   window.capacitySlot=input.parentNode.parentNode;
   const outside=document.createElement('div');outside.dataset.sliderCapacity='';outside.id='outside-capacity';
   outside.appendChild(input.parentNode);document.querySelector('#view-container .modal').appendChild(outside);
  });
  assert.equal(await active().locator('form input[data-category]').count(),1,'one legitimate capacity is outside the form, inside its editor');
  // A stale hidden editor may precede or follow the route; it cannot participate.
  for(const before of [true,false]){
   await page.evaluate(before=>{
    const copy=document.createElement('aside');copy.id='stale-editor';copy.hidden=true;
    copy.appendChild(document.querySelector('#view-container .modal').cloneNode(true));
    copy.querySelector('#tourn-max-participants').value='400';
    copy.querySelector('#tourn-max-by-category').value=JSON.stringify({'Alpha · B':100,'Beta · C':300});
    for(const input of copy.querySelectorAll('input[data-category]'))input.value=input.dataset.category.startsWith('Alpha')?'100':'300';
    before?document.body.prepend(copy):document.body.appendChild(copy);
   },before);
   assert.equal(await page.evaluate(()=>_createTournamentEditorRoot().closest('#view-container')?.id),'view-container');
   await page.evaluate(()=>_renderPhaseEstimate());
   assert.match(await field('phase-estimate-ladder').innerText(),/48 participantes/,'estimate ignores stale capacities');
   result=await save();
   assert.equal(result.saves.length,1,JSON.stringify(result.alerts));
   assert.equal(result.saves[0].maxParticipants,48);
   assert.equal(result.saves[0].scoring.fixedSetGames,7);
   const first=active().locator('input[data-category^="Alpha"]');
   await first.fill('24');
   assert.equal(await field('tourn-max-by-category').inputValue(),JSON.stringify({'Alpha · B':24,'Beta · C':32}),'editing the active capacity updates its own hidden map');
   result=await save();assert.equal(result.saves.length,1,JSON.stringify(result.alerts));assert.equal(result.saves[0].maxParticipants,56);
   await first.fill('16');
   for(const value of ['', '-1', '1.5']){
    await first.fill(value);
    result=await save();
    assert.equal(result.saves.length,0,'invalid active input remains blocked beside valid hidden copy');
    assert.equal(result.alerts[0]?.[0],'Vagas por categoria');
   }
   await first.fill('16');
   await page.evaluate(()=>{const root=_createTournamentEditorRoot();root.querySelector('#tourn-max-by-category').value=JSON.stringify({'Alpha · B':17,'Beta · C':32});});
   result=await save();assert.equal(result.saves.length,0,'map/input inconsistency remains blocked');
   await page.evaluate(()=>{const root=_createTournamentEditorRoot();root.querySelector('#tourn-max-by-category').value=JSON.stringify({'Alpha · B':16,'Beta · C':32});root.querySelector('#tourn-excluded-categories').value=JSON.stringify(['Beta · C']);});
   result=await save();assert.equal(result.saves.length,0,'an excluded category with nonzero active input is rejected');
   await page.evaluate(()=>{_createTournamentEditorRoot().querySelector('#tourn-excluded-categories').value='[]';document.querySelector('#stale-editor').remove();});
  }
  await page.evaluate(()=>openEditTournamentModal('synthetic-b',true,_findTournamentById('synthetic-b')));
  await open('synthetic-b',false);
  assert.equal(await field('tourn-name').inputValue(),'synthetic-b');
  assert.equal(await field('tourn-max-participants').inputValue(),'24');
  assert.equal(await page.locator('#form-create-tournament').count(),1);
  await open('synthetic-a');
  assert.equal(await field('tourn-name').inputValue(),'synthetic-a','return loads saved A; unsent draft was discarded on context change');
  assert.equal(await field('tourn-max-participants').inputValue(),'48');
  await open(null);
  assert.equal(await field('edit-tournament-id').inputValue(),'');
  assert.equal(await field('tourn-name').inputValue(),'','creation does not inherit edited name');
  await field('tourn-name').fill('Creation draft');
  await open(null,false);
  assert.equal(await field('tourn-name').inputValue(),'Creation draft');
  assert.equal(await page.locator('#form-create-tournament').count(),1);
  assert.deepEqual(errors,[],'complete real editor flow has no browser exceptions');
  console.log('✓ real editor (pre-mounted creation → edit): seven total games saves once with 16/32 capacities; repeated route and A→B→A/new preserve lifecycle; hidden copies ignored by estimate/save; invalid active capacities rejected.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
