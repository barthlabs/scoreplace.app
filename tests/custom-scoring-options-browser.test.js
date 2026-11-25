'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.route('http**/*',route=>route.abort());
  await page.setContent('<main id="f2-config-mount"></main><section id="gsm-section"><div id="gsm-presets"></div><div id="gsm-tieat-inline"></div><div id="gsm-summary"></div></section>');
  for(const name of ['sport-rules','super-eight-core','format2','tournaments-categories','bracket-model','bracket-ui','format2-ui','create-tournament'])await page.addScriptTag({path:path.resolve(__dirname,'../js/views/'+name+'.js')});
  await page.evaluate(()=>{
   window._t=k=>k;window.showNotification=()=>{};
   const values={type:'sets',setsToWin:1,gamesPerSet:7,fixedSet:true,fixedSetGames:7,tiebreakEnabled:false,tiebreakPoints:7,tiebreakMargin:2,twoPointAdvantage:true,setTwoPointAdvantage:true,tiebreakTwoPointAdvantage:true,tiebreakAt:'4',tieRule:'extend',superTiebreak:false,superTiebreakPoints:10,countingType:'tennis',advantageRule:false,customRulesVersion:''};
   for(const [key,value] of Object.entries(values)){const input=document.createElement('input');input.type='hidden';input.id='gsm-'+key;input.value=String(value);document.querySelector('#gsm-section').appendChild(input);}
   window.before=_gsmReadHidden();_gsmRenderTieAt();
   const cfg=FORMAT2.defaultConfig('Beach Tennis');cfg.classifAtiva=true;cfg.eliminatoria.ativa=true;cfg.eliminatoria.scoring={...before};
   _f2MountInForm(document.querySelector('main'),'Beach Tennis',cfg,{id:'synthetic-options',sport:'Beach Tennis',participants:[],groups:[],matches:[],rounds:[],fmt2:cfg});
  });
  const toggles=['Ativar tie-break no empate','Exigir dois games de diferença no set','Exigir dois pontos de diferença no tie-break','Super tie-break no set decisivo'];
  for(const scope of ['#gsm-tieat-inline','#f2elim-tieat-box'])for(const label of toggles)assert(await page.locator(scope).getByRole('checkbox',{name:label,exact:true}).isVisible(),scope+' mostra '+label);
  assert.deepEqual(await page.evaluate(()=>_gsmReadHidden()),await page.evaluate(()=>before),'renderização preserva regra legada e gatilho numérico');
  await page.evaluate(()=>_openGSMConfig());
  for(const label of toggles)assert(await page.locator('#gsm-config-overlay').getByRole('checkbox',{name:label,exact:true}).isVisible(),'modal mostra '+label);
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>_gsmReadHidden()),await page.evaluate(()=>before),'cancelar não adere às novas regras');
  const main=page.locator('#gsm-tieat-inline');
  for(const fixed of [false,true]){
   await main.getByRole('button',{name:fixed?'Games disputados no total':'Games ganhos para vencer o set',exact:true}).click();
   for(const label of toggles){const toggle=main.getByRole('checkbox',{name:label,exact:true});await toggle.setChecked(!(await toggle.isChecked()));assert(await main.getByRole('checkbox',{name:label,exact:true}).isEnabled());}
  }
  await main.getByRole('checkbox',{name: 'Ativar tie-break no empate',exact:true}).uncheck();
  await main.locator('#gsm-tie-at').fill('6');await main.locator('#gsm-tie-at').dispatchEvent('change');
  await main.locator('#gsm-games-target').fill('8');await main.locator('#gsm-games-target').dispatchEvent('change');
  assert.equal(await main.locator('#gsm-tie-at').inputValue(),'6','quantidade não redefine gatilho');
  const sc=await page.evaluate(()=>_gsmReadHidden());assert.equal(sc.customRulesVersion,1);assert.equal(sc.tiebreakEnabled,false);
  await page.evaluate(()=>_openGSMConfig());
  const modal=page.locator('#gsm-config-overlay');
  await modal.getByRole('checkbox',{name:'Super tie-break no set decisivo',exact:true}).check();
  assert.match(await modal.innerText(),/substitui o único set/);
  await modal.getByRole('checkbox',{name:'Super tie-break no set decisivo',exact:true}).uncheck();
  await modal.getByRole('checkbox',{name:'Exigir dois games de diferença no set',exact:true}).uncheck();
  await modal.getByRole('checkbox',{name:'Exigir dois pontos de diferença no tie-break',exact:true}).uncheck();
  await modal.getByRole('button',{name:'Aplicar',exact:true}).click();
  const saved=await page.evaluate(()=>_gsmReadHidden());
  assert.equal(saved.customRulesVersion,1);assert.equal(saved.setTwoPointAdvantage,false);assert.equal(saved.tiebreakTwoPointAdvantage,false);assert.equal(saved.superTiebreak,false);assert.equal(saved.tiebreakAt,'6');
  await page.evaluate(()=>{_gsmRenderTieAt();_openGSMConfig();});
  assert.equal(await modal.getByRole('checkbox',{name:'Exigir dois games de diferença no set',exact:true}).isChecked(),false);
  assert.equal(await page.evaluate(()=>_gsmReadConfigOverlay().customRulesVersion),1,'todas flags off não remove opt-in');
  await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.locator('#f2elim-tieat-box').getByRole('checkbox',{name:'Ativar tie-break no empate',exact:true}).check();
  assert.deepEqual(await page.evaluate(()=>_gsmReadHidden()),saved,'regra da fase seguinte é independente');
  assert.equal(await page.evaluate(()=>_f2GetElimScoring().customRulesVersion),1,'normalização preserva opt-in');
  const beforeFrozenNext=await page.evaluate(()=>_f2GetElimScoring());
  await page.evaluate(()=>{window._scoringPhaseHasResult=()=>true;_gsmRenderTieAt();_openGSMConfig();});
  for(const label of toggles)assert(await modal.getByRole('checkbox',{name:label,exact:true}).isDisabled(),'congela regra e marcador com resultado');
  await page.evaluate(()=>{_gsmCfgSetTwo(true);_gsmSetSetTwoPointInline(true);_gsmSelectPreset('fixedGames');_f2ElimScoringPreset('fixedGames');});
  assert.deepEqual(await page.evaluate(()=>_gsmReadHidden()),saved,'guardas impedem chamada direta após resultado');
  assert.deepEqual(await page.evaluate(()=>_f2GetElimScoring()),beforeFrozenNext,'preset não reverte contrato da fase com resultado');
  console.log('PASS: controles completos nos dois modos/fases/modal; escolha de gatilho, cancelamento, persistência, isolamento e congelamento.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
