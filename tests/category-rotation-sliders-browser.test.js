'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent('<section id="category-capacity-section"><input id="tourn-max-per-category" value="16">'+
   '<div id="category-capacity-grid"><label>Alpha <input data-category="Alpha" value="16"></label>'+
   '<label>Beta <input data-category="Beta" value="16"></label></div></section><main id="f2-config-mount"></main>');
  for(const file of ['sport-rules','standings-core','super-eight-core','format2','tournaments-categories','bracket-model','chaves','chaves-adapter','phases-engine','tournaments-utils','format2-ui'])
   await page.addScriptTag({path:require.resolve('../js/views/'+file+'.js')});
  const mount=async(single=false)=>page.evaluate(single=>{
   const c=window.FORMAT2.defaultConfig('Beach Tennis');c.disputa=single?'individual':'dupla';c.parceria=single?null:'fixa';
   c.rodadas.modo='todos';c.classifAtiva=true;c.eliminatoria.ativa=false;c.grupos=2;c.groupFormation={mode:'count',value:2};
   c.classificationSchedule={gamesPerUnit:3,mode:'structured'};
   c.eliminatoria.scoring={type:'sets',setsToWin:1,gamesPerSet:7,fixedSet:true,tiebreakEnabled:false};
   const t={id:'synthetic-sliders',sport:'Beach Tennis',testModeEnabled:true,combinedCategories:['Alpha','Beta'],matches:[],rounds:[],groups:[],
    participants:['Alpha','Beta'].flatMap(category=>Array.from({length:16},(_,i)=>({uid:category+i,displayName:category+' '+i,category}))),
    scoring:{type:'sets',setsToWin:1,gamesPerSet:4,fixedSet:false,tiebreakEnabled:false},fmt2:c};
   window.fixture=t;window.beforeScoring=JSON.stringify(t.scoring);
   window._f2MountInForm(document.querySelector('main'),t.sport,c,t);window.beforeElimScoring=JSON.stringify(window._f2GetConfig().eliminatoria.scoring);
  },single);
  const set=async(id,value)=>{
   await page.locator('#'+id).evaluate((el,n)=>{el.value=String(n);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  };
  await mount();
  for(let i=0;i<2;i++)assert.equal(await page.locator('[data-rotation-phase="0"] [data-slider-category="'+i+'"] [data-slider-capacity] input').count(),1,
   'capacidade de cada categoria fica junto dos próprios sliders');
  for(let i=0;i<2;i++)for(const key of ['groups','size','games']){
   const el=page.locator('#f2-rotation-'+key+'-'+i);assert.equal(await el.getAttribute('type'),'range');assert(await el.isVisible());
  }
  assert.equal(await page.evaluate(()=>window._f2GetConfig().parceria),'fixa','abrir sem interagir mantém o contrato existente');
  await set('f2-rotation-groups-0',4);assert.equal(await page.locator('#f2-rotation-size-0').inputValue(),'4');
  await set('f2-rotation-size-0',8);assert.equal(await page.locator('#f2-rotation-groups-0').inputValue(),'2');
  assert.equal(await page.locator('input[data-category="Alpha"]').inputValue(),'16','rerender preserva a capacidade');
  assert.equal(await page.locator('input[data-category="Alpha"]').count(),1,'não duplica o controle de capacidade');
  await page.locator('#f2-rotation-partners-0').uncheck();await set('f2-rotation-games-0',7);
  assert.match(await page.locator('#f2-rotation-preview-0').innerText(),/Super 8/);
  assert.equal(await page.evaluate(()=>window._f2RotationConfigError()),'');
  await set('f2-rotation-size-0',4);
  assert.equal(await page.locator('#f2-rotation-games-0').inputValue(),'7','alterar a população não reduz jogos silenciosamente');
  assert.match(await page.evaluate(()=>window._f2RotationConfigError()),/Alpha/);
  await set('f2-rotation-games-0',3);
  assert.match(await page.locator('#f2-rotation-preview-0').innerText(),/Rei\/Rainha/);
  await set('f2-rotation-size-0',8);await page.locator('#f2-rotation-partners-0').check();await set('f2-rotation-games-0',14);
  assert.equal(await page.evaluate(()=>window._f2RotationConfigError()),'');
  let cfg=await page.evaluate(()=>window._f2GetConfig());
  const a=cfg.rotationCategoryRules.find(r=>r.category==='Alpha');assert.equal(a.rounds,14);assert.equal(a.allowRepeatPartners,true);
  assert.deepEqual(a.groupFormation,{mode:'size',value:8});
  assert.equal(JSON.stringify(cfg.eliminatoria.scoring),await page.evaluate(()=>beforeElimScoring));
  assert.equal(await page.evaluate(()=>JSON.stringify(fixture.scoring)===beforeScoring),true);
  await page.evaluate(c=>window._f2MountInForm(document.querySelector('main'),fixture.sport,c,{...fixture,fmt2:c}),cfg);
  assert.equal(await page.locator('#f2-rotation-games-0').inputValue(),'14');assert(await page.locator('#f2-rotation-partners-0').isChecked());
  // Uma segunda classificatória usa seu próprio escopo; nenhuma fase nova é criada pelo widget.
  await page.evaluate(()=>{
   const c=window._f2GetConfig();c.eliminatoria.ativa=true;c.eliminatoria.openReiRainha=true;c.classificados=2;c.classifScope='per_group';
   c.rotationCategoryRules.forEach(r=>{r.destination='elimination';});
   window.beforePrimary=JSON.stringify(c.rotationCategoryRules);
   window._f2MountInForm(document.querySelector('main'),fixture.sport,c,{...fixture,fmt2:c});
  });
  assert(await page.locator('#f2-rotation-groups-1-0').isVisible());
  await set('f2-rotation-games-1-0',3);
  cfg=await page.evaluate(()=>window._f2GetConfig());assert.equal(JSON.stringify(cfg.rotationCategoryRules),await page.evaluate(()=>beforePrimary));
  assert.equal(cfg.eliminatoria.formationCategoryRules.find(r=>r.category==='Alpha').rounds,3);
  await mount(true);
  for(let i=0;i<2;i++)for(const key of ['groups','size','games'])assert(await page.locator('#f2-rotation-'+key+'-'+i).isVisible(),
    'o mesmo conjunto é visível em disputa simples');
  await set('f2-rotation-groups-0',2);await set('f2-rotation-games-0',3);
  assert.equal(await page.evaluate(()=>window._f2GetConfig().disputa),'individual','slider de simples não converte o esporte para duplas');
  await mount();
  await page.evaluate(()=>{
   fixture.participants.push(...Array.from({length:8},(_,i)=>({uid:'Beta-extra'+i,displayName:'Beta extra '+i,category:'Beta'})));
   window._f2MountInForm(document.querySelector('main'),fixture.sport,fixture.fmt2,fixture);
  });
  await set('f2-rotation-games-1',5);
  await page.locator('#f2-slider-common-0').check();
  await set('f2-rotation-groups-0',2);
  assert.equal(await page.locator('#f2-rotation-groups-1').inputValue(),'2');
  assert.equal(await page.locator('#f2-rotation-size-1').inputValue(),'12','modo comum por grupos considera 24 pessoas na segunda categoria');
  await page.locator('[data-rotation-phase="0"] [data-slider-priority="size"]').click();
  assert.equal(await page.locator('#f2-rotation-size-0').inputValue(),'8');
  assert.equal(await page.locator('#f2-rotation-size-1').inputValue(),'8');
  assert.equal(await page.locator('#f2-rotation-groups-1').inputValue(),'3','modo comum por capacidade produz três grupos na categoria maior');
  await set('f2-rotation-games-0',7);
  assert.equal(await page.locator('#f2-rotation-games-1').inputValue(),'7');
  await page.locator('#f2-slider-common-0').uncheck();
  assert.equal(await page.locator('#f2-rotation-games-0').inputValue(),'3');
  assert.equal(await page.locator('#f2-rotation-games-1').inputValue(),'5','personalização anterior permanece ao voltar do modo comum');
  await page.locator('#f2-slider-common-0').check();
  cfg=await page.evaluate(()=>window._f2GetConfig());
  await page.evaluate(c=>window._f2MountInForm(document.querySelector('main'),fixture.sport,c,{...fixture,fmt2:c}),cfg);
  assert(await page.locator('#f2-slider-common-0').isChecked());
  assert.equal(await page.locator('#f2-rotation-groups-1').inputValue(),'3');
  console.log('✓ Chromium: três sliders imediatos por categoria/fase, vínculo, erro sem truncamento, persistência, pontuação e simples');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
