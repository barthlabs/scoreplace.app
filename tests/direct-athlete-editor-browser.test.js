'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const root=process.env.SP_ARTIFACT_ROOT || path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 await page.setContent('<body><main id="view-container"></main></body>');
 await page.addScriptTag({content:fs.readFileSync(root+'/js/notifications.js','utf8')});
 await page.evaluate(()=>{
  window.calls=[];window.notices=[];window.showNotification=(...a)=>notices.push(a);
  window.t={id:'synthetic',status:'active',canonicalRegistrationMigration:{fingerprint:'valid'}};
  window._findTournamentById=()=>t;window._souOrganizador=()=>true;
  window.roster=[{manualParticipantId:'manual',name:'Nome inicial',categoryId:'cat'}];
  window.reads=[];window.fail=false;window.saved=[];
  window.FirestoreDB={loadCanonicalTournamentRoster:async()=>({participants:roster}),
   db:{collection:()=>({doc:uid=>({get:async()=>{reads.push(uid);return {exists:uid==='A'.repeat(28),data:()=>({displayName:'Conta selecionada'})}}}),
    where(){return this},limit(){return this},get:async()=>({forEach(fn){fn({id:'A'.repeat(28),data:()=>({displayName:'Conta selecionada'})})}})})}};
  window._callCF=async(name,data)=>{calls.push({name,data});if(fail)throw Error('Falha simulada');return {data:{ok:true}}};
 });
 await page.addScriptTag({path:root+'/js/views/tournaments-enrollment-report.js'});
 await page.evaluate(()=>window._refreshTournamentAthleteEdit=async()=>{});
 async function open(uid=''){
  await page.evaluate(uid=>{roster=[uid?{uid,displayName:'Nome inicial',categoryId:'cat'}:{manualParticipantId:'manual',name:'Nome inicial',categoryId:'cat'}];
   window._openTournamentAthleteEditor('synthetic',uid,uid?'':'manual','cat','Nome inicial');},uid);
  await page.locator('#input-dialog-value').waitFor();
  assert.equal(await page.locator('#custom-confirm-dialog').count(),0);
  assert.equal(await page.locator('#input-dialog-value').inputValue(),'Nome inicial');
  assert.equal(await page.locator('#input-ok-btn').innerText(),'Confirmar');
 }
 const uid='B'.repeat(28),target='A'.repeat(28);
 for(const [source,value,name,policy] of [
  ['', 'Novo nome','renameTournamentParticipant',''],
  ['', 'Nova pessoa','editCanonicalTournamentSlot','inherit'],
  ['', 'Outra pessoa','editCanonicalTournamentSlot','reset'],
  ['',target,'editCanonicalTournamentSlot','inherit'],
  [uid,'Outro nome','editCanonicalTournamentSlot','reset'],
  [uid,'uid:'+target,'editCanonicalTournamentSlot','inherit']]) {
  await open(source);await page.locator('#input-dialog-value').fill(value);
  if(policy){if(source || /^(uid:|[A-Za-z0-9]{28}$)/.test(value)){await page.locator('#input-ok-btn').click();assert.match(await page.locator('#athlete-edit-error').innerText(),/pontuação/);}
   await page.locator('#athlete-points').selectOption(policy);}
  if(!policy) await page.locator('#athlete-points').selectOption('rename');
  const count=await page.evaluate(()=>calls.length);
  await page.locator('#input-ok-btn').click();await page.waitForFunction(n=>calls.length===n+1,count);
  assert.equal((await page.evaluate(()=>calls.at(-1))).name,name);
  if(name==='renameTournamentParticipant')assert.equal((await page.evaluate(()=>calls.at(-1))).data.pointsPolicy,undefined);
  if(policy)assert.equal((await page.evaluate(()=>calls.at(-1))).data.pointsPolicy,policy);
  await page.locator('#custom-input-dialog').waitFor({state:'detached'});
 }
 await open();await page.locator('#input-dialog-value').fill('Outra pessoa sem escolha');
 var noChoiceCount=await page.evaluate(()=>calls.length);await page.locator('#input-ok-btn').click();
 assert.equal(await page.evaluate(()=>calls.length),noChoiceCount);assert.match(await page.locator('#athlete-edit-error').innerText(),/corrigir/);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'athlete-points');await page.locator('#input-cancel-btn').click();
 await open();var untouched=await page.evaluate(()=>calls.length);await page.locator('#input-ok-btn').click();assert.equal(await page.evaluate(()=>calls.length),untouched,'texto igual não grava');
 const special="Ana & \"Bia\" <Teste> O'Neil";
 async function openSpecial(){await page.evaluate(name=>{roster=[{manualParticipantId:'manual',name,categoryId:'cat'}];_openTournamentAthleteEditor('synthetic','','manual','cat',name);},special);await page.locator('#input-dialog-value').waitFor();}
 await openSpecial();assert.equal(await page.locator('#input-dialog-value').inputValue(),special);
 const specialCount=await page.evaluate(()=>calls.length);await page.locator('#input-ok-btn').click();assert.equal(await page.evaluate(()=>calls.length),specialCount,'símbolos preservados e confirmar sem editar não grava');
 await openSpecial();await page.locator('#input-dialog-value').fill(special+' corrigido');await page.locator('#athlete-points').selectOption('rename');
 await page.locator('#input-ok-btn').click();await page.waitForFunction(n=>calls.length===n+1,specialCount);
 assert.equal((await page.evaluate(()=>calls.at(-1))).data.newName,special+' corrigido');
 await open();await page.locator('#input-dialog-value').fill('Outra pessoa');await page.locator('#athlete-points').selectOption('reset');
 await page.locator('#input-dialog-value').fill(target);assert.equal(await page.locator('#athlete-points').inputValue(),'','trocar tipo de destino exige nova política');
 await page.locator('#input-ok-btn').click();assert.match(await page.locator('#athlete-edit-error').innerText(),/pontuação/);
 await page.locator('#input-cancel-btn').click();
 await open(uid);await page.locator('#input-dialog-value').fill(target);await page.locator('#athlete-points').selectOption('inherit');
 await page.locator('#input-dialog-value').fill('Nome digitado');assert.equal(await page.locator('#athlete-points').inputValue(),'');await page.locator('#input-cancel-btn').click();
 await open();await page.locator('#input-dialog-value').fill('Carlos');await page.waitForTimeout(300);
 assert.equal(await page.locator('datalist option').getAttribute('value'),'uid:'+target);
 assert(!(await page.evaluate(()=>reads)).includes('Carlos'),'nome simples não busca UID');
 await page.locator('#input-dialog-value').fill('uid:inexistente');await page.locator('#athlete-points').selectOption('reset');
 await page.locator('#input-ok-btn').click();assert.match(await page.locator('#athlete-edit-error').innerText(),/UID indisponível/);
 const before=await page.evaluate(()=>calls.length);await page.locator('#input-cancel-btn').click();assert.equal(await page.evaluate(()=>calls.length),before);
 await open();await page.locator('#input-dialog-value').fill('Correção');await page.locator('#athlete-points').selectOption('rename');await page.evaluate(()=>{roster[0].name='Outra edição'});
 await page.locator('#input-ok-btn').click();assert.match(await page.locator('#athlete-edit-error').innerText(),/mudou/);assert.equal(await page.evaluate(()=>calls.length),before);
 await page.locator('#input-cancel-btn').click();await open();await page.locator('#input-dialog-value').fill('Correção');await page.locator('#athlete-points').selectOption('rename');
 await page.evaluate(()=>fail=true);await page.locator('#input-ok-btn').click();assert.match(await page.locator('#athlete-edit-error').innerText(),/Falha simulada/);
 assert.equal(await page.locator('#input-dialog-value').inputValue(),'Correção');assert(await page.locator('#input-ok-btn').isEnabled());
 await page.evaluate(()=>{fail=false;t.id='tour_1793804848447_94bfe2282535789667cb35f1080024ee'});
 await page.locator('#input-cancel-btn').click();await open();await page.locator('#input-dialog-value').fill('Nome corrigido');await page.locator('#athlete-points').selectOption('rename');await page.locator('#input-ok-btn').click();
 await page.waitForFunction(()=>calls.at(-1).name==='editCamisManualParticipant');assert.equal(await page.evaluate(()=>calls.at(-1).data.action),'rename');
 await page.locator('#custom-input-dialog').waitFor({state:'detached'});
 await open();await page.locator('#input-dialog-value').fill('Nome salvo');await page.locator('#athlete-points').selectOption('rename');
 await page.evaluate(()=>window._refreshTournamentAthleteEdit=async()=>{throw Error('leitura indisponível')});
 await page.locator('#input-ok-btn').click();await page.waitForFunction(()=>notices.some(n=>n[0]==='Atleta salvo' && n[2]==='warning'));
 assert.equal(await page.locator('#custom-input-dialog').count(),0,'falha de recarga não nega gravação confirmada');
 console.log('✓ edição direta: quatro direções, UID, nome, pontuação, concorrência, falha, cancelar e baseline CAMIS');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
