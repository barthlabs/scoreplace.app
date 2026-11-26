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
  window.reads=[];window.fail=false;window.saved=[];window.accountAvailable=true;window.searchProfiles=null;
  window.FirestoreDB={loadCanonicalTournamentRoster:async()=>({participants:roster}),
   db:{collection:()=>({doc:uid=>({get:async()=>{reads.push(uid);return {exists:accountAvailable && uid==='A'.repeat(28),data:()=>({displayName:'Conta selecionada'})}}}),
    where(){return this},limit(){return this},get:async()=>{const snap={forEach(fn){(searchProfiles || [{uid:'A'.repeat(28),displayName:'Conta selecionada'}]).forEach(p=>fn({id:p.uid,data:()=>p}))}};if(window.deferSearch)return new Promise(resolve=>{window.resolveSearch=()=>resolve(snap)});return snap;}})}};
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
  assert.match(await page.locator('#custom-input-dialog').innerText(),/Digite o nome do atleta\./);
  assert.equal(await page.locator('#input-dialog-value').getAttribute('placeholder'),'Nome do atleta');
  assert.equal(await page.locator('#input-dialog-value').getAttribute('aria-label'),'Nome do atleta');
  assert(!/\b(?:UID|ID)\b/.test(await page.locator('#custom-input-dialog').innerText()));
 }
 const uid='B'.repeat(28),target='A'.repeat(28);
 for(const [source,value,name,policy] of [
  ['', 'Novo nome','renameTournamentParticipant',''],
  ['', 'Nova pessoa','editCanonicalTournamentSlot','inherit'],
  ['', 'Outra pessoa','editCanonicalTournamentSlot','reset'],
  ['','Conta selecionada','editCanonicalTournamentSlot','inherit'],
  [uid,'Outro nome','editCanonicalTournamentSlot','reset'],
  [uid,'Conta selecionada','editCanonicalTournamentSlot','inherit']]) {
  await open(source);await page.locator('#input-dialog-value').fill(value);
  if(value==='Conta selecionada'){await page.locator('.sp-athlete-account-option').click();assert.equal(await page.locator('#input-dialog-value').inputValue(),value);}
  if(policy){if(source || value==='Conta selecionada'){await page.locator('#input-ok-btn').click();assert.match(await page.locator('#athlete-edit-error').innerText(),/pontuação/);}
   await page.locator('#athlete-points').selectOption(policy);}
  if(!policy) await page.locator('#athlete-points').selectOption('rename');
  const count=await page.evaluate(()=>calls.length);
  await page.locator('#input-ok-btn').click();await page.waitForFunction(n=>calls.length===n+1,count);
  assert.equal((await page.evaluate(()=>calls.at(-1))).name,name);
  if(name==='renameTournamentParticipant')assert.equal((await page.evaluate(()=>calls.at(-1))).data.pointsPolicy,undefined);
  if(policy)assert.equal((await page.evaluate(()=>calls.at(-1))).data.pointsPolicy,policy);
  if(value==='Conta selecionada')assert.equal((await page.evaluate(()=>calls.at(-1))).data.targetUid,target);
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
 await page.locator('#input-dialog-value').fill('Conta selecionada');await page.locator('.sp-athlete-account-option').click();
 assert.equal(await page.locator('#athlete-points').inputValue(),'','escolher conta exige nova política');
 await page.locator('#input-ok-btn').click();assert.match(await page.locator('#athlete-edit-error').innerText(),/pontuação/);
 await page.locator('#input-cancel-btn').click();
 await open(uid);await page.locator('#input-dialog-value').fill('Conta selecionada');await page.locator('.sp-athlete-account-option').click();await page.locator('#athlete-points').selectOption('inherit');
 await page.locator('#input-dialog-value').fill('Nome digitado');assert.equal(await page.locator('#athlete-points').inputValue(),'');await page.locator('#input-cancel-btn').click();
 await open();await page.locator('#input-dialog-value').fill('Conta selecionada');await page.locator('.sp-athlete-account-option').waitFor();
 assert.equal(await page.locator('.sp-athlete-account-option').innerText(),'Conta selecionada');
 assert(!/UID|uid:/.test(await page.locator('#athlete-account-options').innerText()));
 assert(!(await page.locator('#custom-input-dialog').innerHTML()).includes(target),'identificador não aparece nem nas sugestões/atributos');
 await page.locator('#athlete-points').selectOption('rename');var manualCount=await page.evaluate(()=>calls.length);await page.locator('#input-ok-btn').click();
 await page.waitForFunction(n=>calls.length===n+1,manualCount);assert.equal((await page.evaluate(()=>calls.at(-1))).name,'renameTournamentParticipant','nome igual ao de conta não vincula sem seleção');
 await page.locator('#custom-input-dialog').waitFor({state:'detached'});
 await open();await page.locator('#input-dialog-value').fill('Conta selecionada');await page.locator('.sp-athlete-account-option').click();await page.locator('#athlete-points').selectOption('reset');
 await page.evaluate(()=>accountAvailable=false);await page.locator('#input-ok-btn').click();
 assert.match(await page.locator('#athlete-edit-error').innerText(),/conta selecionada não está disponível/);
 assert(!/\b(?:UID|ID)\b/.test(await page.locator('#athlete-edit-error').innerText()));
 assert.equal(await page.locator('#athlete-points').inputValue(),'','conta indisponível invalida seleção e política');
 const before=await page.evaluate(()=>calls.length);await page.locator('#input-ok-btn').click();assert.equal(await page.evaluate(()=>calls.length),before,'uma falha de conta não vira troca manual silenciosa');await page.locator('#input-cancel-btn').click();assert.equal(await page.evaluate(()=>calls.length),before);await page.evaluate(()=>accountAvailable=true);
 // Homônimos sem contexto não podem produzir uma seleção automática ou botões indistinguíveis.
 await page.evaluate(()=>searchProfiles=[{uid:'A'.repeat(28),displayName:'Homônimo'},{uid:'C'.repeat(28),displayName:'Homônimo'}]);
 await open();await page.locator('#input-dialog-value').fill('Homônimo');await page.waitForFunction(()=>document.querySelector('#athlete-account-options').textContent.includes('mais de uma conta'));
 assert.equal(await page.locator('.sp-athlete-account-option').count(),0);await page.locator('#input-cancel-btn').click();await page.evaluate(()=>searchProfiles=null);
 // Uma resposta atrasada não restaura sugestões nem a conta depois de apagar o nome.
 await page.evaluate(()=>{window.deferSearch=true;window.resolveSearch=null;});await open();
 await page.locator('#input-dialog-value').fill('Busca anterior');await page.waitForFunction(()=>typeof resolveSearch==='function');
 await page.locator('#input-dialog-value').fill('');await page.evaluate(()=>{deferSearch=false;resolveSearch();});await page.waitForTimeout(50);
 assert.equal(await page.locator('.sp-athlete-account-option').count(),0);assert.equal(await page.locator('#input-dialog-value').inputValue(),'');await page.locator('#input-cancel-btn').click();
 // Selecionar uma conta com texto igual ao nome atual não é no-op: a identidade mudou.
 await page.evaluate(()=>searchProfiles=[{uid:'A'.repeat(28),displayName:'Nome inicial'}]);await open();
 await page.locator('#input-dialog-value').fill('Nome inicial');await page.locator('.sp-athlete-account-option').click();await page.locator('#athlete-points').selectOption('inherit');
 const sameNameCount=await page.evaluate(()=>calls.length);await page.locator('#input-ok-btn').click();await page.waitForFunction(n=>calls.length===n+1,sameNameCount);
 assert.equal((await page.evaluate(()=>calls.at(-1))).data.targetUid,target);await page.locator('#custom-input-dialog').waitFor({state:'detached'});await page.evaluate(()=>searchProfiles=null);
 const protectedCount=await page.evaluate(()=>calls.length);
 await open();await page.locator('#input-dialog-value').fill('Correção');await page.locator('#athlete-points').selectOption('rename');await page.evaluate(()=>{roster[0].name='Outra edição'});
 await page.locator('#input-ok-btn').click();assert.match(await page.locator('#athlete-edit-error').innerText(),/mudou/);assert.equal(await page.evaluate(()=>calls.length),protectedCount);
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
 console.log('✓ edição direta: quatro direções, seleção interna por nome, homônimos, pontuação, concorrência, falha, cancelar e baseline CAMIS');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
