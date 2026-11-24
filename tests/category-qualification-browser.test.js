'use strict';
const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const {chromium}=require(root+'/node_modules/@playwright/test');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1100,height:1000}});
  page.on('pageerror',error=>console.error('BROWSER:',error.message));
  await page.setContent('<section id="category-capacity-section"><input id="tourn-max-per-category" value="16"><div id="category-capacity-grid"><label>Alpha<input data-category="Alpha" value="16"></label><label>Beta<input data-category="Beta" value="32"></label></div></section><main id="f2-config-mount"></main>');
  await page.addScriptTag({path:root+'/js/domain/standings.js'});
  for(const name of ['sport-rules','standings-core','super-eight-core','format2','tournaments-categories','bracket-model','chaves','chaves-adapter','phases-engine','tournaments-utils','bracket-logic','bracket-policy','tournaments-draw','schedule-poll','format2-ui','create-tournament']) await page.addScriptTag({path:root+'/js/views/'+name+'.js'});
  const source=require('node:fs').readFileSync(root+'/js/views/create-tournament.js','utf8');
  const start=source.indexOf('window._renderPhaseEstimate = function () {');
  await page.addScriptTag({content:source.slice(start,source.indexOf('\n  };',start)+6)});
  await page.evaluate(()=>{window._gruposFmtMin=m=>Math.floor(m/60)+'h'+String(m%60).padStart(2,'0');});
  await page.addScriptTag({path:root+'/js/domain/phase-grid-plan.js'});
  await page.addScriptTag({path:root+'/js/domain/team-competition.js'});
  await page.evaluate(()=>{
   const cfg=FORMAT2.defaultConfig('Beach Tennis');
   Object.assign(cfg,{disputa:'dupla',parceria:'rotation_groups',classifAtiva:true,groupFormation:{mode:'size',value:8},classificados:2,classifScope:'per_group'});
   cfg.eliminatoria.ativa=true;
   cfg.rotationCategoryRules=['Alpha','Beta'].map(category=>({category,groupFormation:{mode:'size',value:8},rounds:5,allowRepeatPartners:false,destination:'elimination'}));
   window.fixture={id:'synthetic-root-smoke',sport:'Beach Tennis',fmt2:cfg,combinedCategories:['Alpha','Beta'],matches:[],rounds:[],groups:[],participants:['Alpha','Beta'].flatMap((category,i)=>Array.from({length:i?32:16},(_,j)=>({uid:category+j,displayName:category+' '+j,category})))};
   _f2MountInForm(document.querySelector('main'),fixture.sport,cfg,fixture);
  });
  await page.evaluate(()=>{
   _getCreateFormCategoryData=()=>({combinedCategories:['Alpha','Beta']});
   const inputs={ 'tourn-max-participants':48,'tourn-max-per-category':16,'tourn-max-by-category':JSON.stringify({Alpha:16,Beta:32}),
    'tourn-court-count':6,'tourn-game-duration':30,'tourn-call-time':5,'tourn-warmup-time':5 };
   for(const [id,value] of Object.entries(inputs)){const input=document.createElement('input');input.id=id;input.value=value;document.body.appendChild(input);}
   const custom=document.createElement('input');custom.type='checkbox';custom.id='tourn-custom-category-capacity';custom.checked=true;document.body.appendChild(custom);
   const estimate=document.createElement('div');estimate.id='phase-estimate-ladder';document.body.appendChild(estimate);
   _renderPhaseEstimate();
  });
  const saveStart=source.indexOf('        const normalizedExcluded = new Set((categoryDataForCapacity.excludedCategories');
  const saveBlock=source.slice(saveStart,source.indexOf('        const autoCloseVal =',saveStart));
  await page.evaluate(code=>{
   window.checkActualSaveCapacity=new Function('categoryDataForCapacity','maxByCategoryVal','maxPartsVal',
    'const customCategoryCapacity=true;const capacityCategories=categoryDataForCapacity.combinedCategories;'+
    'const allCapacityCategories=capacityCategories;const maxPerCategoryVal=16;'+
    'let alert=null;const showAlertDialog=(title,message)=>{alert={title,message};};'+
    code+';return {maxPartsVal,maxByCategoryVal,alert};');
  },saveBlock);
  let savedCapacity=await page.evaluate(()=>checkActualSaveCapacity({combinedCategories:['Alpha','Beta']},{Alpha:16,Beta:32},48));
  assert.deepEqual(savedCapacity,{maxPartsVal:48,maxByCategoryVal:{Alpha:16,Beta:32},alert:null},'Salvar lê os campos movidos junto aos sliders');
  await page.locator('[data-slider-capacity] input[data-category="Alpha"]').fill('');
  assert.equal(await page.evaluate(()=>checkActualSaveCapacity({combinedCategories:['Alpha','Beta']},{Alpha:16,Beta:32},48)),undefined,'campo vazio continua impedindo salvar');
  await page.locator('[data-slider-capacity] input[data-category="Alpha"]').fill('16');
  assert.match(await page.locator('#phase-estimate-ladder').innerText(),/Super Oito ativado/);
  assert.match(await page.locator('#phase-estimate-ladder').innerText(),/65 jogos/,'60 jogos de grupos e cinco eliminatórios com corte padrão dois');
  const section=page.locator('[data-rotation-phase="0"]');
  assert.equal(await section.locator('input[type="range"]').count(),4,'modo comum mostra exatamente quatro sliders');
  assert.equal(await section.locator('#f2-slider-common-0').isChecked(),false,'Personalizar desligado por padrão');
  assert.equal(await section.locator('#f2-rotation-partners-0').isChecked(),true,'Não repetir parceiro ligado');
  const boxes=await Promise.all(['groups','size','games','qualifiers'].map(key=>section.locator('#f2-rotation-'+key+'-0').boundingBox()));
  assert(Math.abs(boxes[0].y-boxes[1].y)<3,'grupos e pessoas compartilham a linha');
  assert(Math.abs(boxes[2].y-boxes[3].y)<3,'jogos e classificados compartilham a linha');
  assert(boxes[2].y>boxes[0].y,'jogos/classificados ficam na segunda linha');
  async function set(id,value){await page.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
  await set('f2-rotation-qualifiers-0',1);
  let config=await page.evaluate(()=>_f2GetConfig());
  assert.deepEqual(config.qualificationCategoryRules,[{category:'Alpha',perGroup:1},{category:'Beta',perGroup:1}]);
  await section.locator('#f2-slider-common-0').check();
  assert.equal(await section.locator('input[type="range"]').count(),8,'modo personalizado mostra quatro por categoria');
  await set('f2-rotation-qualifiers-1',4);
  config=await page.evaluate(()=>_f2GetConfig());
  assert.deepEqual(config.qualificationCategoryRules,[{category:'Alpha',perGroup:1},{category:'Beta',perGroup:4}]);
  await page.evaluate(c=>_f2MountInForm(document.querySelector('main'),fixture.sport,c,{...fixture,fmt2:c}),config);
  assert.equal(await page.locator('#f2-rotation-qualifiers-0').inputValue(),'1');
  assert.equal(await page.locator('#f2-rotation-qualifiers-1').inputValue(),'4');
  await set('f2-rotation-qualifiers-0',4);
  await set('f2-rotation-qualifiers-1',2);
  assert.match(await page.locator('#phase-estimate-ladder').innerText(),/68 jogos/,'dois grupos com quatro e quatro grupos com duas geram quatro duplas por categoria');
  assert.doesNotMatch(await page.locator('#phase-estimate-ladder').innerText(),/Rei.Rainha|28 confrontos/);
  const mappedMinutes=await page.evaluate(()=>{
   const projection=_f2ProjectCurrentPhases(),t={...projection.tournament,phases:projection.phases},model=ScoreplacePhaseGridPlan;
   const days=[{day:'2030-01-01',startTime:'08:00',endTime:'22:00'}];
   const base=model.suggestProjected(t,days,window,projection);
   if(base.error) throw Error(base.error);
   const rows=[['Alpha',1,'B1',1,[1,2]],['Alpha',2,'B2',2,[1,2]],
    ['Beta',1,'C1',1,[3,4]],['Beta',2,'C2',1,[5,6]],['Beta',3,'C3',2,[3,4]],['Beta',4,'C4',2,[5,6]]]
    .map(([category,groupNumber,label,entry,courts])=>({phaseIndex:0,category,groupNumber,label,entry,courts}));
   const mapped=model.applyAssignments(base.tiles,base.plan,days,rows);
   if(mapped.error) throw Error(mapped.error);
   window._estimatedGameHoursState={saved:{version:1,mode:'organizer',days,interleavedPlan:mapped.plan}};
   window._phaseCallOrderState={plan:mapped.plan,tournament:t};
   _renderPhaseEstimate();
   return Math.max(...mapped.tiles.map(tile=>model.minutes(tile.startTime)+tile.duration))-480;
  });
  assert.match(await page.locator('#phase-estimate-ladder').innerText(),new RegExp('Duração estimada de operação: '+Math.floor(mappedMinutes/60)+'h'+String(mappedMinutes%60).padStart(2,'0')),'resumo usa o mapa de entradas salvo e suas durações');

  for(const css of ['style','components','layout','responsive']) await page.addStyleTag({path:root+'/css/'+css+'.css'});
  await page.setViewportSize({width:360,height:900});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false,'controles não vazam em tela de 360px');
  if(process.env.SP_UI_SCREENSHOT) await page.screenshot({path:process.env.SP_UI_SCREENSHOT,fullPage:true});
  await page.evaluate(()=>{
   const c=_f2GetConfig();c.classificationSliderMode='common';c.classifScope='overall';delete c.qualificationCategoryRules;
   c.rotationCategoryRules[0].destination='ranking';c.rotationCategoryRules[1].destination='elimination';
   _f2MountInForm(document.querySelector('main'),fixture.sport,c,{...fixture,fmt2:c});
  });
  // Use the real event path with CSS; the numeric slider remains directly accessible.
  await set('f2-rotation-qualifiers-0',2);
  const mixed=await page.evaluate(()=>({cfg:_f2GetConfig(),phases:FORMAT2.compileToPhases(_f2GetConfig(),{sport:fixture.sport,categories:fixture.combinedCategories}).phases}));
  assert.deepEqual(mixed.cfg.qualificationCategoryRules,[{category:'Beta',perGroup:2}],'categoria encerrada no ranking não recebe quota de avanço');
  assert.equal(mixed.phases[1].source.scope,'per_group','quota explícita sempre é por grupo, inclusive ao partir de legado overall');
  await page.evaluate(()=>_f2RotationRule(1,null,'ranking'));
  assert.deepEqual(await page.evaluate(()=>_f2GetConfig().qualificationCategoryRules),[]);
  await page.evaluate(()=>_f2RotationRule(1,null,'elimination'));
  assert.deepEqual(await page.evaluate(()=>_f2GetConfig().qualificationCategoryRules),[{category:'Beta',perGroup:2}],'reativar avanço restaura o corte escolhido');
  console.log('PASS: quatro sliders, duas linhas, modo comum/custom, sem repetição e classificados 1/4 persistidos; 360px sem overflow.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
