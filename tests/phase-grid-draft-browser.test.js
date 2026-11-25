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
 for(const css of ['style','components','layout','responsive','phase-grid-editor'])await page.addStyleTag({path:root+'/css/'+css+'.css'});
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
 assert.equal(await page.locator('.phase-grid-group-game').count(),84);
 for(const panel of await page.locator('.phase-grid-super-group').all()) {
  assert.equal(await panel.locator('header strong').count(),1);
  assert.equal(await panel.locator('.phase-grid-group-game').count(),14);
  assert(!/Quadra|\d{2}:\d{2}/.test(await panel.locator('header').innerText()),'categoria/grupo sem repetir quadras ou horas');
  assert(!/Fase 1|Entrada|Rodada/.test(await panel.innerText()));
  for(const el of await panel.locator('[data-tile-id]').all())assert(await el.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'tile agrupado sem corte');
 }
 const games=await page.evaluate(()=>{
  var state=_phaseCallOrderState,numbers=ScoreplacePhaseGridPlan.numbered(state.tiles,state.plan);
  return state.tiles.filter(t=>t.kind==='groups').map(t=>{
   var el=Array.from(document.querySelectorAll('[data-tile-id]')).find(el=>el.dataset.tileId===t.id);
   return {id:t.id,court:t.court,at:t.startTime,group:t.assignment.label,games:t.games,expected:numbers[t.id],text:el.querySelector('.phase-grid-group-game').innerText,matchup:el.querySelector('.phase-grid-example')?.innerText.replace(/\s+/g,' ').trim(),aria:el.getAttribute('aria-label')};
  }).sort((a,b)=>a.at.localeCompare(b.at)||a.court-b.court);
 });
 assert(games.every(g=>g.games===1),'cada reserva é uma partida individual');
 assert.deepEqual(games.slice(0,6).map(g=>[g.court,g.group,g.text]),[
  [1,'B1','Jogo 1'],[2,'B1','Jogo 2'],[3,'C1','Jogo 3'],[4,'C1','Jogo 4'],[5,'C2','Jogo 5'],[6,'C2','Jogo 6']
 ]);
 assert.deepEqual(games.slice(6,12).map(g=>g.text),['Jogo 7','Jogo 8','Jogo 9','Jogo 10','Jogo 11','Jogo 12']);
 assert.equal(new Set(games.map(g=>g.text)).size,84,'uma numeração única por partida nas duas entradas');
 assert(games.every(g=>g.text==='Jogo '+g.expected),'rótulo usa a numeração canônica, não a rodada');
 assert(games.every(g=>g.aria.includes('quadra '+g.court) && g.aria.includes(g.at)),'metadados continuam acessíveis');
 assert.deepEqual(games.slice(0,6).map(g=>g.matchup),[
  'J1 / J2 × J3 / J4','J5 / J6 × J7 / J8','J9 / J10 × J11 / J12',
  'J13 / J14 × J15 / J16','J17 / J18 × J19 / J20','J21 / J22 × J23 / J24'
 ]);
 assert.equal(await page.locator('.phase-grid-example').count(),84);
 assert.match(await page.locator('.phase-grid-example-help').innerText(),/atletas hipotéticos/);
 const groups=new Map();
 for(const game of games){if(!groups.has(game.group))groups.set(game.group,[]);groups.get(game.group).push(game)}
 const allAthletes=new Set();
 for(const group of groups.values()){
  const appearances=new Map(),partners=new Map(),partnerships=new Set();
  for(const game of group){
   const ids=game.matchup.match(/J\d+/g);assert.equal(new Set(ids).size,4);
   ids.forEach(id=>appearances.set(id,(appearances.get(id)||0)+1));
   for(const [a,b] of [[ids[0],ids[1]],[ids[2],ids[3]]]){
    if(!partners.has(a))partners.set(a,new Set());if(!partners.has(b))partners.set(b,new Set());
    partners.get(a).add(b);partners.get(b).add(a);partnerships.add([a,b].sort().join('/'));
   }
  }
  assert.equal(appearances.size,8);assert.equal(partnerships.size,28);
  for(const [id,count] of appearances){assert.equal(count,7);assert.equal(partners.get(id).size,7);assert(!allAthletes.has(id));allAthletes.add(id)}
  for(let r=0;r<7;r++)assert.equal(new Set(group.slice(r*2,r*2+2).flatMap(g=>g.matchup.match(/J\d+/g))).size,8,'oito atletas distintos nas duas quadras');
 }
 assert.equal(allAthletes.size,48);
 assert.deepEqual(await page.evaluate(()=>_readPhaseGridPlan()),plan,'confrontos não são gravados no plano');
 const stable=await page.evaluate(()=>{
  const snapshot=()=>Object.fromEntries(Array.from(document.querySelectorAll('[data-tile-id]')).map(el=>[el.dataset.tileId,el.querySelector('.phase-grid-example')?.textContent]));
  const before=snapshot(),s=_phaseCallOrderState,savedTiles=structuredClone(s.tiles),savedPlan=structuredClone(s.plan);
  _closePhaseGridEditor();_openPhaseGridEditor();const reopened=snapshot();
  _phaseGridPreset('spread');const moved=snapshot();
  const originalDay=s.activeDay,originalDays=s.tournament.scheduleWindow.days;
  const next={...originalDays[0],day:'2026-12-02'};
  s.tournament.scheduleWindow.days=originalDays.concat(next);s.tiles=savedTiles.map(tile=>({...tile,day:next.day}));_phaseGridDay(next.day);
  const nextDay=snapshot();s.tournament.scheduleWindow.days=originalDays;
  s.tiles=savedTiles;s.plan=savedPlan;_phaseGridDay(originalDay);
  return {before,reopened,moved,nextDay};
 });
 assert.deepEqual(stable.before,stable.reopened);assert.deepEqual(stable.before,stable.moved,'mover jogo mantém seus quatro atletas');assert.deepEqual(stable.before,stable.nextDay,'trocar dia preserva os identificadores');
 const guards=await page.evaluate(()=>{
  const s=_phaseCallOrderState,original=structuredClone(s.tournament.fmt2),capacity=s.tournament.maxParticipantsByCategory[s.tiles[0].category];
  const count=()=>document.querySelectorAll('.phase-grid-example').length;
  s.tournament.fmt2=structuredClone(original);
  s.tournament.fmt2.rotationCategoryRules.forEach(rule=>rule.allowRepeatPartners=true);_phaseGridDay(s.activeDay);const repeated=count();
  s.tournament.fmt2=structuredClone(original);s.tournament.fmt2.parceria='fixa';_phaseGridDay(s.activeDay);const fixed=count();
  s.tournament.fmt2=structuredClone(original);s.tournament.maxParticipantsByCategory[s.tiles[0].category]=12;_phaseGridDay(s.activeDay);const notEight=count();
  s.tournament.maxParticipantsByCategory[s.tiles[0].category]=capacity;
  const first=s.tiles[0],sequence=first.sequence;first.sequence=0;_phaseGridDay(s.activeDay);const malformed=count();first.sequence=sequence;
  s.locked=true;_phaseGridDay(s.activeDay);const locked=count();s.locked=false;
  s.tournament.sorteioDrawId='sorteado';_phaseGridDay(s.activeDay);const drawn=count();delete s.tournament.sorteioDrawId;_phaseGridDay(s.activeDay);
  const build=ScoreplaceSuperEight.buildGroups;s.tournament.fmt2.rotationCategoryRules[0].rounds=6;
  ScoreplaceSuperEight.buildGroups=()=>{throw Error('falha sintética')};_phaseGridDay(s.activeDay);const failed=count();
  ScoreplaceSuperEight.buildGroups=build;s.tournament.fmt2=original;_phaseGridDay(s.activeDay);
  return {repeated,fixed,notEight,malformed,locked,drawn,failed,restored:count()};
 });
 assert.deepEqual(guards,{repeated:0,fixed:0,notEight:56,malformed:70,locked:0,drawn:0,failed:0,restored:84});
 await page.screenshot({path:'/tmp/sp-2768-group-grid-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 for(const el of await page.locator('[data-tile-id]').all())assert(await el.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'mobile sem corte dos confrontos');
 await page.screenshot({path:'/tmp/sp-2768-group-grid-mobile.png'});
 await page.setViewportSize({width:1366,height:900});

 assert.match(await page.locator('.phase-grid-head').innerText(),/Quadra 1/);
 assert.match(await page.locator('.phase-grid-head').innerText(),/Quadra 6/);
 assert.match(await page.locator('.phase-grid-times').innerText(),/08:00/);
 assert.match(await page.locator('.phase-grid-times').innerText(),/08:35/);
 const elim=await page.locator('.phase-grid-elim').allTextContents();
 assert(elim.every(text=>!/[0-9]{2}:[0-9]{2}/.test(text)),'horários aparecem apenas na coluna à esquerda');
 assert(elim.some(text=>/Vencedor do grupo C1 × Vencedor do grupo C4/.test(text)));
 assert(elim.some(text=>/Vencedor do grupo C2 × Vencedor do grupo C3/.test(text)));
 assert(elim.some(text=>/Vencedor do jogo \d+ × Vencedor do jogo \d+/.test(text)));
 assert(elim.some(text=>/Perdedor do jogo \d+ × Perdedor do jogo \d+/.test(text)));
 assert.equal(await page.locator('.phase-grid-elim .phase-grid-game-number').count(),8);
 assert.match(await page.locator('#phase-call-order-editor').innerText(),/Proposta atualizada/);
 // Soltar no cabeçalho do B2 usa a coordenada da coluna do dia, não o topo do painel.
 const dropResult=await page.evaluate(()=>{
  var state=_phaseCallOrderState, source=state.tiles.find(tile=>tile.assignment?.label==='B2' && tile.round===1 && tile.court===1);
  var panel=Array.from(document.querySelectorAll('.phase-grid-super-group')).find(el=>el.querySelector('header').textContent.includes('Grupo B2'));
  var original=ScoreplacePhaseGridPlan.move;
  ScoreplacePhaseGridPlan.move=function(...args){window.dropAt=args[3];return original(...args)};
  var data=new DataTransfer();data.setData('text/plain',source.id);
  var expected=source.startTime, top=panel.getBoundingClientRect().top;
  panel.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,clientY:top+1,dataTransfer:data}));
  ScoreplacePhaseGridPlan.move=original;
  return {expected,at:window.dropAt,saved:_phaseCallOrderState.tiles.find(tile=>tile.id===source.id).startTime};
 });
 assert.notEqual(dropResult.expected,'08:00');assert.equal(dropResult.at,dropResult.expected);assert.equal(dropResult.saved,dropResult.expected);
 const pure=await page.evaluate(()=>{
  var list=_phaseCallOrderState.tiles.filter(x=>x.kind==='groups' && x.assignment.label==='B1');
  var count=tiles=>_phaseGridVisualGroups(tiles).length;
  var cases=[list.filter((_,i)=>i!==0),list.map((x,i)=>({...x,day:i?'2026-12-02':x.day})),list.map(x=>({...x,games:3})),list.map(x=>({...x,court:x.court===2?3:x.court})),list.map((x,i)=>({...x,startTime:i===0?'08:01':x.startTime})),list.map(x=>({...x,duration:10})),list.filter(x=>x.round===1).map(x=>({...x,startTime:'23:55',duration:25}))];
  return [count(list),...cases.map(count)];
 });assert.deepEqual(pure,[1,0,0,0,0,0,0,0]);
 await page.screenshot({path:'/tmp/sp-2766-group-grid.png'});
 await page.evaluate(()=>{window._phaseCallOrderState.locked=true;document.getElementById('tourn-game-duration').value=10;window._phaseGridRefreshDraft()});
 assert.deepEqual(await page.evaluate(()=>_phaseCallOrderState.plan),plan,'locked intacto');
 await page.evaluate(()=>{_phaseCallOrderState.locked=false;window._phaseGridRefreshDraft()});
 assert.equal(await page.locator('.phase-grid-super-group').count(),0,'10 minutos usa compacto');
 const compact=await page.evaluate(()=>{
  var s=_phaseCallOrderState,n=ScoreplacePhaseGridPlan.numbered(s.tiles,s.plan);
  return s.tiles.filter(t=>t.kind==='groups').every(t=>{
   var el=Array.from(document.querySelectorAll('[data-tile-id]')).find(el=>el.dataset.tileId===t.id);
   return el.querySelector('.phase-grid-single').textContent==='JOGO '+n[t.id] && !/[0-9]{2}:[0-9]{2}/.test(el.innerText);
  });
 });assert(compact,'fallback também usa número de partida e não repete horário');
 assert.equal(await page.locator('.phase-grid-example').count(),84,'compacto também mostra confrontos');
 await page.screenshot({path:'/tmp/sp-2768-group-grid-compact.png'});
 const cut=await page.locator('.phase-grid-group').evaluateAll(els=>els.filter(e=>e.scrollHeight>e.clientHeight+1).slice(0,3).map(e=>({text:e.innerText,height:e.clientHeight,scroll:e.scrollHeight,children:Array.from(e.children).map(c=>({text:c.innerText,height:c.clientHeight,font:getComputedStyle(c).fontSize}))})));
 assert.deepEqual(cut,[],'compacto sem corte');
 await page.setViewportSize({width:390,height:844});
 for(const el of await page.locator('.phase-grid-group').all())assert(await el.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'compacto mobile sem corte');
 await page.setViewportSize({width:1366,height:900});
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
 const frozen=require('./fixtures/phase-grid-timing-v1.json');
 const forecast=await page.evaluate(frozen=>{
  window._spCor=value=>value;window._actualDurationMinutes=()=>null;
  var draft=structuredClone(frozen.t);draft.teamSize=2;
  var html=_buildDurationForecast(draft);
  document.body.insertAdjacentHTML('beforeend','<div id="duration-proof">'+html+'</div>');
  var oldPlan=structuredClone(frozen.plan);_phaseCallOrderState={tournament:frozen.t,plan:oldPlan,tiles:ScoreplacePhaseGridPlan.expand(oldPlan,frozen.t),locked:true};
  _phaseGridRefreshDraft();return {text:document.getElementById('duration-proof').textContent,plan:_phaseCallOrderState.plan};
 },frozen);
 assert.match(forecast.text,/48 participantes · 92 jogos/);assert(!/duplas/.test(forecast.text));
 assert.match(forecast.text,/HORAS07.*MIN20/i);assert.deepEqual(forecast.plan,frozen.plan,'abrir grade sorteada v1 não a converte');
 const untouched=await page.evaluate(frozen=>{
  var plan=structuredClone(frozen.plan),before=JSON.stringify(plan);
  _phaseCallOrderState={tournament:frozen.t,plan,tiles:ScoreplacePhaseGridPlan.expand(plan,frozen.t),locked:false,touched:false};
  _estimatedGameHoursState.mode='participants';
  var auto=_readPhaseGridPlan(),refresh=_phaseGridRefreshDraft();
  _phaseCallOrderState.touched=true;var touchedAuto=_readPhaseGridPlan();
  _phaseCallOrderState.touched=false;_estimatedGameHoursState.mode='organizer';
  var organizer=_readPhaseGridPlan();
  return {auto,refresh,touchedAuto,organizer,untouched:!_phaseCallOrderState.touched,unchanged:before===JSON.stringify(_phaseCallOrderState.plan)};
 },frozen);
 assert.deepEqual(untouched,{auto:null,refresh:null,touchedAuto:null,organizer:null,untouched:true,unchanged:true},'modo automático não bloqueia salvar, e grade v1 não tocada permanece intacta');
 assert.deepEqual(errors,[]);
 console.log('✓ grade real: 84 partidas, 48 atletas hipotéticos, 28 parcerias por grupo, 7 jogos por atleta; rótulos estáveis após mover/dia/reabrir; compacto/mobile e bloqueios OK');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
