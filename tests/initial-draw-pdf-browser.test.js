'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {chromium}=require('@playwright/test');
const root=process.env.SP_ARTIFACT_ROOT || path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({timezoneId:'America/Sao_Paulo',acceptDownloads:true});
 await page.route('**/*',r=>r.abort());await page.setContent('<body></body>');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addScriptTag({path:root+'/js/views/schedule-organizer.js'});
 await page.addScriptTag({path:root+'/js/views/bracket-logic.js'});
 await page.evaluate(()=>{
  window.pdfTexts=[];window.notices=[];
  const original=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(...args){pdfTexts.push({text:String(args[0]),x:args[1],y:args[2],max:args[3],font:this.font});return original.apply(this,args)};
  window.showNotification=(...args)=>notices.push(args);
  window._groupName=i=>'Grupo '+String.fromCharCode(65+i);
  window.t={id:'synthetic-pdf',name:'Torneio de conferência',startDate:'2026-11-29T11:00:00Z',courtCount:6,gameDuration:25,
   coverColor:'#135786',titleColor:'#ffffff',brandColor:'#ffcc00',matches:[]};
  for(let category=0;category<2;category++)for(let group=0;group<5;group++)for(let game=0;game<7;game++){
   const n=t.matches.length+1;
   t.matches.push({id:'match-'+n,category:category?'Categoria C':'Categoria B',isMonarch:true,monarchGroup:group,round:1,
    label:'Grupo '+String.fromCharCode(65+group)+' • Jogo '+(game+1),scheduledGameNumber:n,
    scheduledAt:new Date(Date.parse(t.startDate)+Math.floor((n-1)/6)*25*60000).toISOString(),court:'Quadra '+((n-1)%6+1),
    team1:['Ana de Souza '+n,'Beatriz Santos '+n],team2:['Carla Almeida '+n,'Daniela Oliveira '+n]});
  }
  // Logo local real, mantendo rede completamente bloqueada.
  const logo=document.createElement('canvas');logo.width=100;logo.height=60;const c=logo.getContext('2d');c.fillStyle='#ffcc00';c.fillRect(0,0,100,60);
  t.logoData=logo.toDataURL();
  window.pd={kind:'initial',scheduleRevision:3,draft:{matches:structuredClone(t.matches),rounds:[]}};
  window._findTournamentById=()=>t;window.AppStore={tournaments:[t]};
  window.__pendingInitialDraws={[t.id]:pd};window._pendingDrawMarkerFor=()=>({kind:'initial'});window._finishDrawTransition=()=>{};
 });
 const output=process.env.SP_PDF_PROOF_DIR || fs.mkdtempSync(path.join(os.tmpdir(),'sp-draw-pdf-'));
 fs.mkdirSync(output,{recursive:true});
 for(const modal of ['published','pending']){
  await page.evaluate(modal=>{document.querySelectorAll('.modal-overlay').forEach(e=>e.remove());
   modal==='published'?_openPublishedInitialDrawResult(t.id):_openPendingDrawReview(t.id);
  },modal);
  assert.equal(await page.locator('[data-draw-pdf]').count(),2);
  const before=await page.evaluate(()=>JSON.stringify({t,pd}));
  for(const mode of ['all','first']){
   await page.evaluate(()=>{pdfTexts=[]});
   const downloadPromise=page.waitForEvent('download');await page.locator('[data-draw-pdf="'+mode+'"]').click();
   const download=await downloadPromise;
   assert(download.suggestedFilename().endsWith(mode==='all'?'-com-horarios.pdf':'-so-inicio.pdf'));
   const file=path.join(output,modal+'-'+mode+'.pdf');await download.saveAs(file);
   assert(fs.readFileSync(file).subarray(0,8).toString().startsWith('%PDF-1.4'));
   const texts=await page.evaluate(()=>pdfTexts);
   const clocks=texts.filter(c=>/\d{2}:\d{2}/.test(c.text));
   assert.equal(clocks.length,mode==='all'?71:1,'horários no conjunto de quatro páginas: '+modal+'/'+mode);
   assert.equal(texts.filter(c=>c.text.startsWith('Início do primeiro jogo:')).length,1);
   assert(clocks.some(c=>c.text.includes('08:00')));
   assert.equal(texts.filter(c=>/^Página \d de 4$/.test(c.text)).length,4);
   assert.equal(texts.filter(c=>/^J\d+$/.test(c.text)).length,70);
   assert(texts.some(c=>c.text==='J70'));assert(texts.some(c=>c.text==='Daniela Oliveira 70'));
   if(mode==='all'){
    const time=texts.find(c=>c.text==='08:00'),number=texts.find(c=>c.text==='J1');
    assert(time.y-number.y===38 && time.x+time.max<118,'horário cabe antes dos nomes e dentro da linha mínima');
   }
   assert.equal(await page.evaluate(()=>JSON.stringify({t,pd})),before,'exportar não altera torneio ou rascunho');
  }
 }
 // Mesmo botão continua funcional e mantém a escolha ao repetir.
 const again=page.waitForEvent('download');await page.locator('[data-draw-pdf="first"]').click();
 assert((await again).suggestedFilename().endsWith('-so-inicio.pdf'));
 const result=await page.evaluate(()=>{
  const model=_initialDrawResultModel(pd),before=JSON.stringify({t,pd});
  // Planejador real: mesmo view() usado pela revisão, somente leitura.
  const view=Object.assign({},t,pd.draft,{id:t.id,matches:pd.draft.matches,scheduleRevision:Number(pd.scheduleRevision||0)});
  const expected=_operationalSchedulePlan(view);
  const missing=structuredClone(pd);missing.draft.matches.forEach(m=>{delete m.scheduledAt;delete m.scheduledGameNumber;delete m.court});
  const expectedMissing=_operationalSchedulePlan(Object.assign({},t,missing.draft,{id:t.id,matches:missing.draft.matches,scheduleRevision:3}));
  const missingBefore=JSON.stringify(missing),computed=_initialDrawPdfSchedule(t,missing,model);
  const duplicate=structuredClone(pd);duplicate.draft.matches[1].scheduledGameNumber=1;
  const partial=structuredClone(pd);delete partial.draft.matches[1].scheduledGameNumber;
  const duplicateNumbers=_initialDrawPdfSchedule(t,duplicate,model).canonicalNumbers;
  const savedPlanner=_operationalSchedulePlan;window._operationalSchedulePlan=()=>({items:[]});
  const variants=[duplicateNumbers,_initialDrawPdfSchedule(t,partial,model).canonicalNumbers];
  const unknown=structuredClone(pd);unknown.draft.matches.forEach(m=>{m.scheduledAt=null});
  const none=_initialDrawPdfSchedule(t,unknown,model);
  pdfTexts=[];_initialDrawPdfPage(t,model.categories[0],model.categories[0].groups.slice(0,4),[],1,4,null,{timeMode:'first',schedule:none});
  const unknownHeader=pdfTexts.some(c=>c.text==='Início a definir'),unknownClocks=pdfTexts.filter(c=>/\d{2}:\d{2}/.test(c.text)).length;
  const fallback=_initialDrawPdfSchedule(t,partial,model);pdfTexts=[];
  _initialDrawPdfPage(t,model.categories[0],model.categories[0].groups.slice(0,4),[],1,4,null,{timeMode:'all',schedule:fallback});
  const fallbackNumbers=pdfTexts.filter(c=>/^J\d+$/.test(c.text)).map(c=>c.text);
  const extraModel=_initialDrawResultModel({draft:{matches:[{id:'final',p1:'Vencedoras A',p2:'Vencedoras B',scheduledAt:'2026-11-30T12:25:00Z'}]}});
  const extraSchedule=_initialDrawPdfSchedule(t,{draft:{matches:[{id:'final',p1:'Vencedoras A',p2:'Vencedoras B',scheduledAt:'2026-11-30T12:25:00Z'}]}},extraModel);
  pdfTexts=[];_initialDrawPdfPage(t,extraModel.categories[0],[],extraModel.categories[0].extras,1,1,null,{timeMode:'all',schedule:extraSchedule});
  const extraTime=pdfTexts.some(c=>c.text.includes('Vencedoras A × Vencedoras B · 30/11 09:25'));
  unknown.draft.matches[0].scheduledAt={seconds:Date.parse('2026-11-30T12:25:00Z')/1000,nanoseconds:0};
  unknown.draft.matches[1].scheduledAt={toMillis:()=>Date.parse('2026-11-29T11:00:00Z')};
  unknown.draft.matches.push({id:'bye',isBye:true,scheduledAt:'2020-01-01T00:00:00Z'});
  const stamps=_initialDrawPdfSchedule(t,unknown,_initialDrawResultModel(unknown));
  const savedFormatter=_scheduleDateTimeLabel;delete window._scheduleDateTimeLabel;
  const noFormatter=_initialDrawPdfSchedule(t,pd,model);window._scheduleDateTimeLabel=savedFormatter;window._operationalSchedulePlan=savedPlanner;
  return {pure:JSON.stringify({t,pd})===before,missingPure:JSON.stringify(missing)===missingBefore,
   first:computed.firstLabel,expected:_scheduleDateTimeLabel(expectedMissing.items[0].scheduledAt),
   variants,unknownHeader,unknownClocks,fallbackNumbers,extraTime,none:none.firstLabel,stamps,noFormatter:noFormatter.firstLabel,expectedCount:expected.items.length};
 });
 assert(result.pure && result.missingPure);assert.equal(result.expectedCount,70);assert.equal(result.first,result.expected);
 assert.deepEqual(result.variants,[false,false]);assert(result.unknownHeader && result.extraTime);assert.equal(result.unknownClocks,0);
 assert.deepEqual(result.fallbackNumbers,Array.from({length:28},(_,i)=>'J'+(i+1)));assert.equal(result.none,'');assert.equal(result.noFormatter,'');
 assert.equal(result.stamps.firstLabel,'29/11, 08:00');assert.equal(result.stamps.items['match-1'].time,'09:25');
 const bracketCode=fs.readFileSync(root+'/js/views/bracket.js','utf8');
 const helperStart=bracketCode.indexOf('window._super8StandingsGroups = function (t, sourceMatches)');
 const helperEnd=bracketCode.indexOf('// ── Rei/Rainha da Praia Rendering',helperStart);
 assert(helperStart>=0&&helperEnd>helperStart);
 await page.addScriptTag({content:bracketCode.slice(helperStart,helperEnd)});
 await page.evaluate(()=>{
  const rows=[['A','Categoria B',0],['B','Categoria B',1],['C','Categoria C',0],['D','Categoria C',1],['E','Categoria C',2],['F','Categoria C',3]];
  const official={id:'synthetic-official',name:'Sorteio oficial sintético',combinedCategories:['Categoria B','Categoria C'],matches:[],
   phases:[{kind:'classification',classification:{partnerRotation:'groups',rotationCategoryRules:['Categoria B','Categoria C'].map(category=>({category,groupFormation:{mode:'size',value:8}}))}}],
   scheduleWindow:{interleavedPlan:{groupAssignments:rows.map(([label,category,idx])=>({label,category,phaseIndex:0,groupNumber:idx+1}))}}};
  for(const [label,category,idx] of rows.slice(2).concat(rows.slice(0,2)))for(let round=1;round<=7;round++)for(let lane=0;lane<2;lane++){
   const names=Array.from({length:4},(_,i)=>label+' Atleta '+(lane*4+i));
   official.matches.push({id:label+'-'+round+'-'+lane,category,isMonarch:true,phaseIndex:0,groupIdx:idx,monarchGroup:round*2+lane,round,
    groupName:'Grupo '+String.fromCharCode(65+idx),label:'Grupo '+String.fromCharCode(65+idx)+' • Rodada '+round+' • Jogo '+(lane+1),
    team1:names.slice(0,2),team2:names.slice(2),team1SlotIds:names.slice(0,2).map(n=>'manual:'+n),team2SlotIds:names.slice(2).map(n=>'manual:'+n)});
  }
  official._nJogos=84;window.t=official;window.pd={kind:'initial',draft:{matches:structuredClone(official.matches),rounds:[]}};
  window._findTournamentById=()=>t;AppStore.tournaments=[t];__pendingInitialDraws={[t.id]:pd};
 });
 for(const modal of ['published','pending']){
  await page.evaluate(modal=>{document.querySelectorAll('.modal-overlay').forEach(e=>e.remove());modal==='published'?_openPublishedInitialDrawResult(t.id):_openPendingDrawReview(t.id)},modal);
  assert.equal(await page.locator('[data-draw-pdf]').count(),1);
  assert.equal(await page.locator('.sp-draw-roster').count(),6);assert.equal(await page.locator('.sp-draw-roster li').count(),48);
  assert.equal(await page.locator('.sp-draw-game').count(),0);
  const before=await page.evaluate(()=>JSON.stringify({t,pd}));
  for(let repeat=0;repeat<2;repeat++){
   await page.evaluate(()=>pdfTexts=[]);const promised=page.waitForEvent('download');await page.locator('[data-draw-pdf="groups"]').click();const got=await promised;
   assert(got.suggestedFilename().endsWith('-grupos.pdf'));await got.saveAs(path.join(output,'official-'+modal+'-'+repeat+'.pdf'));
   const texts=await page.evaluate(()=>pdfTexts.map(x=>x.text));
   assert.equal(texts.filter(x=>/Atleta/.test(x)).length,48);assert.equal(texts.filter(x=>/^Grupo [A-F]$/.test(x)).length,6);
   assert.equal(texts.filter(x=>/^Página \d de 2$/.test(x)).length,2);
   assert(!texts.some(x=>/^J\d+$/.test(x)||x==='×'||/\d{2}:\d{2}/.test(x)));
   assert(texts.indexOf('RESULTADO DO SORTEIO · Categoria B')<texts.indexOf('RESULTADO DO SORTEIO · Categoria C'));
   assert.equal(await page.evaluate(()=>JSON.stringify({t,pd})),before);
  }
 }
 console.log('✓ PDF dos grupos: 2 categorias,6grupos48atletas,2páginas,semconfrontos/horários e downloads repetidos nos dois modais.');
 assert.deepEqual(errors,[]);console.log('✓ Resultado do sorteio: dois modais, dois PDFs de quatro páginas, horários, repetição, agenda pura, timestamps e numeração. PDFs: '+output);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
