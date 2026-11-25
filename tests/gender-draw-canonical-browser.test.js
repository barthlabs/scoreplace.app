'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('@playwright/test');
const root=process.env.SP_ARTIFACT_ROOT || path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent('<body></body>');
 await page.evaluate(()=>{
  window.events=[];window.proceeded=0;window.dialogs=[];window.calls=[];window.nameLookups=0;
  window.base={id:'synthetic-gender',teamSize:2,enrollmentMode:'individual',genderCategories:[],combinedCategories:['B'],canonicalRegistrationMigration:{fingerprint:'test'},participants:[],fmt2:{parceria:'fixa'},phases:[{kind:'classification',classification:{structure:'groups'}}]};
  window.AppStore={tournaments:[base]};window._isLigaFormat=()=>false;window._faseCorrenteEhLiga=()=>false;window._isManualPairing=()=>false;window._isTeamEnrollMode=()=>false;
  window._entryTeamMembers=()=>null;window._pGender=p=>p.gender || '';window._pName=p=>p.name;window._participantInCategory=(p,c)=>p.categoryId===c;
  window._hydrateParticipantGenders=async()=>0;window._loadParticipantProfilesByName=()=>{nameLookups++;throw Error('não resolver identidade por nome')};
  window.showNotification=(...a)=>events.push(a);window._softRefreshView=()=>{};
  window.FirestoreDB={_callFn:(name,payload)=>{calls.push({name,payload});return new Promise(resolve=>window.commitChoice=resolve)}};
 });
 await page.addScriptTag({path:root+'/js/views/gender-ratio-core.js'});await page.addScriptTag({path:root+'/js/views/tournaments-draw.js'});
 await page.evaluate(()=>{window._hydrateParticipantGenders=async()=>0;window._showDrawBalanceOverlay=opts=>dialogs.push(opts)});
 async function runCase(change,dialogExpected=false){
  await page.evaluate(change=>{base=Object.assign({},base,{genderCategories:[],categoryDefinitions:[],combinedCategories:['B'],fmt2:{parceria:'fixa'},phases:[{kind:'classification',classification:{structure:'groups'}}]},change);AppStore.tournaments=[base];dialogs=[];proceeded=0;
   const asked=_maybeShowGenderDrawDialog(base.id,()=>proceeded++);if(!asked)proceeded++;
  },change);
  await page.waitForTimeout(20);assert.equal(await page.evaluate(()=>dialogs.length),dialogExpected?1:0);if(!dialogExpected)assert.equal(await page.evaluate(()=>proceeded),1);
 }
 const f={manualParticipantId:'f',name:'Atleta F',gender:'feminino',categoryId:'B'},m={uid:'m',name:'Atleta M',gender:'masculino',categoryId:'B'};
 await runCase({fmt2:{parceria:'rotation_groups'},participants:[{...f,gender:''},{...m,gender:''}]});
 await runCase({genderCategories:['Fem','Masc'],participants:[f,m]});
 await runCase({categoryDefinitions:[{id:'B',label:'Categoria comercial',dimension:'custom',criteria:{gender:{allowed:['feminino']}}}],participants:[f,m]});
 await runCase({participants:[f,{...f,manualParticipantId:'f2'}]});
 await runCase({participants:[{...f,gender:''},{...m,gender:''}]});
 await runCase({combinedCategories:['B','C'],participants:[f,{...m,categoryId:'C'}]});
 await runCase({participants:[f,m]},true);
 await page.evaluate(()=>dialogs[0].onConfirm('livre',[],{enabled:true,locked:true}));
 assert.equal(await page.evaluate(()=>proceeded),0,'sorteio espera commit');assert.equal(await page.evaluate(()=>calls[0].payload.mode),'livre');
 await page.evaluate(()=>commitChoice({ok:true}));await page.waitForFunction(()=>proceeded===1);
 assert.equal(await page.evaluate(()=>nameLookups),0,'gênero/identidade nunca vêm de nome em canônico');
 console.log('✓ sorteio: rotação, categorias separadas, critérios opacos, pool único/sem gênero, Livre e commit único');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
