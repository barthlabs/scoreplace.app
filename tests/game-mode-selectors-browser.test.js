'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent('<main id="f2-config-mount"></main><section id="gsm-section"><div id="gsm-presets"></div><div id="gsm-tieat-inline"></div><div id="gsm-summary"></div></section>');
  for(const file of ['sport-rules','super-eight-core','format2','tournaments-categories','format2-ui','create-tournament'])
   await page.addScriptTag({path:path.resolve(__dirname,'../js/views/'+file+'.js')});
  await page.evaluate(()=>{
   window._t=(key)=>key;
   const values={type:'sets',setsToWin:2,gamesPerSet:6,fixedSet:true,fixedSetGames:7,
    tiebreakEnabled:false,tiebreakPoints:7,tiebreakMargin:1,twoPointAdvantage:false,setTwoPointAdvantage:false,
    tiebreakTwoPointAdvantage:false,tiebreakAt:'g-1',tieRule:'extend',superTiebreak:false,superTiebreakPoints:10,
    countingType:'tennis',advantageRule:false};
   for(const [key,value] of Object.entries(values)){const input=document.createElement('input');input.type='hidden';input.id='gsm-'+key;input.value=String(value);document.querySelector('#gsm-section').appendChild(input);}
   window.original=_gsmReadHidden();_gsmRenderTieAt();
   const c=FORMAT2.defaultConfig('Beach Tennis');c.classifAtiva=true;c.eliminatoria.ativa=true;c.eliminatoria.scoring={...original};
   window.fixture={id:'synthetic-gsm',sport:'Beach Tennis',participants:[],matches:[],rounds:[],groups:[],fmt2:c};
   _f2MountInForm(document.querySelector('main'),fixture.sport,c,fixture);
  });
  assert.equal(await page.getByRole('button',{name:'Games totais fixos',exact:true}).count(),0,'modo não é duplicado em outro botão de preset');
  const mode=()=>page.locator('#gsm-tieat-inline');
  assert.equal(await mode().locator('#gsm-games-target').inputValue(),'7','total salvo distinto do alvo usa fixedSetGames');
  assert.deepEqual(await page.evaluate(()=>_gsmReadHidden()),await page.evaluate(()=>original),'renderizar não grava pontuação');
  await mode().getByRole('button',{name:'Games ganhos para vencer o set',exact:true}).click();
  assert.equal(await mode().locator('#gsm-games-target').inputValue(),'7','mudar modo conserva o número exibido');
  await mode().locator('#gsm-games-target').fill('4');await mode().locator('#gsm-games-target').dispatchEvent('change');
  let sc=await page.evaluate(()=>_gsmReadHidden());assert.equal(sc.fixedSet,false);assert.equal(sc.gamesPerSet,4);assert.equal(sc.fixedSetGames,7);assert.equal(sc.setsToWin,2);
  await mode().getByRole('button',{name:'Games disputados no total',exact:true}).click();
  assert.equal(await mode().locator('#gsm-games-target').inputValue(),'4');
  await mode().locator('#gsm-games-target').fill('7');await mode().locator('#gsm-games-target').dispatchEvent('change');
  sc=await page.evaluate(()=>_gsmReadHidden());assert.equal(sc.fixedSet,true);assert.equal(sc.fixedSetGames,7);assert.equal(sc.gamesPerSet,7);assert.equal(sc.setsToWin,2);
  await page.evaluate(()=>_gsmRenderTieAt());assert.deepEqual(await page.evaluate(()=>_gsmReadHidden()),sc,'reabrir mantém total, alvo, sets e políticas');
  const elim=()=>page.locator('#f2elim-tieat-box');
  assert.equal(await elim().locator('#f2elim-games-target').inputValue(),'7');
  await elim().getByRole('button',{name:'Games ganhos para vencer o set',exact:true}).click();
  await elim().locator('#f2elim-games-target').fill('4');await elim().locator('#f2elim-games-target').dispatchEvent('change');
  let next=await page.evaluate(()=>_f2GetConfig().eliminatoria.scoring || _gsmReadHidden());
  assert.equal(next.fixedSet,false);assert.equal(next.gamesPerSet,4);assert.equal(next.fixedSetGames,7);assert.equal(next.setsToWin,2);
  assert.deepEqual(await page.evaluate(()=>_gsmReadHidden()),sc,'alterar próxima fase preserva a pontuação inicial');
  await elim().getByRole('button',{name:'Games disputados no total',exact:true}).click();
  await elim().locator('#f2elim-games-target').fill('7');await elim().locator('#f2elim-games-target').dispatchEvent('change');
  next=await page.evaluate(()=>_f2GetConfig().eliminatoria.scoring || _gsmReadHidden());
  assert.equal(next.fixedSet,true);assert.equal(next.fixedSetGames,7);assert.equal(next.gamesPerSet,7);assert.equal(next.setsToWin,2);
  await page.evaluate(()=>{window._scoringPhaseHasResult=()=>true;_gsmRenderTieAt();_f2RefreshScoring();});
  assert(await mode().getByRole('button',{name:'Games ganhos para vencer o set',exact:true}).isDisabled());
  await page.evaluate(()=>{_gsmSetGameModeInline(false);_f2ElimSetGameMode(false);});
  assert.deepEqual(await page.evaluate(()=>_gsmReadHidden()),sc);
  assert.equal(await page.evaluate(()=>(_f2GetConfig().eliminatoria.scoring || _gsmReadHidden()).fixedSet),true,'guard direto impede trocar o modo com resultado');
  await page.evaluate(()=>{document.getElementById('gsm-countingType').value='numeric';_gsmRenderTieAt();});
  assert.equal(await mode().getByRole('group',{name:'Como definir os games do set'}).count(),0,'modalidade numérica não recebe seletor de games');
  await page.evaluate(()=>{document.getElementById('gsm-countingType').value='tennis';_gsmRenderTieAt();});
  await page.addStyleTag({path:path.resolve(__dirname,'../css/style.css')});
  for(const theme of ['dark','light']) {
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const ratios=await mode().locator('button').evaluateAll(buttons=>buttons.map(button=>{
    const style=getComputedStyle(button), rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
    const luminance=value=>rgb(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   }));
   assert(ratios.every(ratio=>ratio>=4.5),'seletores têm contraste legível em '+theme);
  }
  console.log('PASS: seletor total/alvo nas duas fases, sete totais/quatro para vencer, leitura sem escrita, persistência e congelamento após placar.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
