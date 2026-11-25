'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('@playwright/test'),{scenario,D,G,w}=require('./universal-phase-grid.test');
const root=process.env.SP_ARTIFACT_ROOT || path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});await page.route('**/*',r=>r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>:root{--bg-card:#18527a;--text-main:white;--text-muted:#ddd;--border-color:#99bbee}body{margin:0}</style>'+['tourn-court-count','tourn-game-duration','tourn-call-time','tourn-warmup-time','tourn-max-by-category','tourn-max-participants','select-sport'].map(id=>'<input id="'+id+'">').join('')+'<input type="checkbox" checked id="setup-first-round-only"><input type="checkbox" checked id="tourn-custom-category-capacity"><section id="phase-call-order-editor"></section>');
 const scripts=['domain/standings','domain/team-competition','domain/phase-grid-plan','views/sport-rules','views/standings-core','views/super-eight-core','views/format2','views/tournaments-categories','views/bracket-model','views/bracket-logic','views/bracket-policy','views/chaves','views/chaves-adapter','views/phases-engine','views/tournaments-utils','views/tournaments-draw','views/schedule-poll','views/phase-grid-editor'];
 for(const file of scripts)await page.addScriptTag({path:root+'/js/'+file+'.js'});
 await page.addStyleTag({path:root+'/css/phase-grid-editor.css'});
 const t=scenario(['Retinol · Categoria B','Colágeno · Categoria C'],[16,32],[8,8],[7,7],[4,2]);t.gameDuration=30;t.callTime=5;t.warmupTime=5;
 await page.evaluate(({t,D})=>{
  for(const [id,value] of Object.entries({'tourn-court-count':6,'tourn-game-duration':30,'tourn-call-time':5,'tourn-warmup-time':5,'tourn-max-by-category':JSON.stringify(t.maxParticipantsByCategory),'tourn-max-participants':48,'select-sport':t.sport}))document.getElementById(id).value=value;
  window.t=t;window._phaseCallOrderState={tournament:t,tiles:[],locked:false};
  window._estimatedGameHoursState={mode:'organizer',valuesByDay:{},saved:{days:D}};window._estimatedGameDays=()=>D.map(d=>d.day);
  window._f2GetConfig=()=>t.fmt2;window._getCreateFormCategoryData=()=>({combinedCategories:t.combinedCategories});
  window._renderPhaseGridEditor();window._phaseGridSuggest();
 },{t,D});
 const old=await page.evaluate(()=>_readPhaseGridPlan());
 await page.evaluate(()=>{document.getElementById('tourn-game-duration').value=25;window._phaseGridRefreshDraft()});
 const plan=await page.evaluate(()=>_readPhaseGridPlan());
 assert.notEqual(plan.inputSignature,old.inputSignature);G.assertPlan({...t,gameDuration:25},plan,D,w);
 assert.equal(await page.locator('.phase-grid-super-group').count(),6);
 assert.equal(await page.locator('[data-tile-id]').count(),plan.blocks.length);
 assert.equal(await page.locator('.phase-grid-group-game').count(),42);
 for(const panel of await page.locator('.phase-grid-super-group').all()) {
  assert.equal(await panel.locator('header strong').count(),1);
  assert.equal(await panel.locator('.phase-grid-group-game').count(),7);
  assert(!/Fase 1|Entrada|Rodada/.test(await panel.innerText()));
  for(const el of await panel.locator('[data-tile-id]').all())assert(await el.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'tile agrupado sem corte');
 }
 const elim=await page.locator('.phase-grid-elim').allTextContents();
 assert(elim.some(text=>/Vencedor do grupo C1 × Vencedor do grupo C4/.test(text)));
 assert(elim.some(text=>/Vencedor do grupo C2 × Vencedor do grupo C3/.test(text)));
 assert(elim.some(text=>/Vencedor do jogo \d+ × Vencedor do jogo \d+/.test(text)));
 assert(elim.some(text=>/Perdedor do jogo \d+ × Perdedor do jogo \d+/.test(text)));
 assert.equal(await page.locator('.phase-grid-elim .phase-grid-game-number').count(),8);
 assert.match(await page.locator('#phase-call-order-editor').innerText(),/Proposta atualizada/);
 const pure=await page.evaluate(()=>{
  var list=_phaseCallOrderState.tiles.filter(x=>x.kind==='groups' && x.assignment.label==='B1');
  var count=tiles=>_phaseGridVisualGroups(tiles).length;
  var cases=[list.filter((_,i)=>i!==0),list.map((x,i)=>({...x,day:i?'2026-12-02':x.day})),list.map(x=>({...x,games:3})),list.map(x=>({...x,court:x.court===2?3:x.court})),list.map((x,i)=>({...x,startTime:i===0?'08:01':x.startTime})),list.map(x=>({...x,duration:10})),list.filter(x=>x.round===1).map(x=>({...x,startTime:'23:55',duration:25}))];
  return [count(list),...cases.map(count)];
 });assert.deepEqual(pure,[1,0,0,0,0,0,0,0]);
 await page.screenshot({path:'/tmp/sp-2765-group-grid.png'});
 await page.evaluate(()=>{window._phaseCallOrderState.locked=true;document.getElementById('tourn-game-duration').value=10;window._phaseGridRefreshDraft()});
 assert.deepEqual(await page.evaluate(()=>_phaseCallOrderState.plan),plan,'locked intacto');
 await page.evaluate(()=>{_phaseCallOrderState.locked=false;window._phaseGridRefreshDraft()});
 assert.equal(await page.locator('.phase-grid-super-group').count(),0,'10 minutos usa compacto');
 await page.evaluate(()=>{document.getElementById('tourn-game-duration').value=25;_phaseGridRefreshDraft();
  window.dragEvent={dataTransfer:{setData(){},getData(){return 'missing'}},preventDefault(){},stopPropagation(){}};
  _phaseGridDragStart(dragEvent,_phaseCallOrderState.tiles[0].id);document.getElementById('tourn-game-duration').value=20;_phaseGridRefreshDraft();});
 assert.equal(await page.evaluate(()=>_phaseCallOrderState.tournament.gameDuration),25,'aguarda drag');
 await page.evaluate(()=>_closePhaseGridEditor());assert.equal(await page.evaluate(()=>_phaseCallOrderState.tournament.gameDuration),20,'fechar limpa drag');
 await page.evaluate(()=>{_phaseGridDragStart(dragEvent,_phaseCallOrderState.tiles[0].id);document.getElementById('tourn-game-duration').value=25;_phaseGridRefreshDraft();_readPhaseGridPlan()});
 assert.equal(await page.evaluate(()=>_phaseCallOrderState.tournament.gameDuration),25,'salvar ignora drag pendente');
 // Redução dos grupos substitui atribuições órfãs com aviso explícito e continua salvável.
 await page.evaluate(()=>{t.maxParticipantsByCategory['Colágeno · Categoria C']=16;document.getElementById('tourn-max-by-category').value=JSON.stringify(t.maxParticipantsByCategory);_phaseGridDragEnd();_phaseGridRefreshDraft()});
 const reduced=await page.evaluate(()=>_readPhaseGridPlan());assert(!reduced.error,reduced.error);assert.equal(reduced.groupAssignments.length,4);
 assert.match(await page.locator('#phase-call-order-editor').innerText(),/horários e quadras foram substituídos/);
 assert.deepEqual(errors,[]);
 console.log('✓ grade real: grupos, sete jogos, fontes das finais, 30→25, assinatura válida, órfãos, locked e drag');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
