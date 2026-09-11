'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),core=require('../js/native-update-policy-core');
const inactive=JSON.parse(fs.readFileSync(path.join(root,'native-update-policy.json')));
const available='2026-09-01T00:00:00.000Z',enforce='2026-09-08T00:00:00.000Z';
const policy={schemaVersion:1,noticeDays:7,platforms:{ios:{minimumVersion:null,availableAt:null,deviceValidatedAt:null,enforceAt:null},android:{minimumVersion:'2.2.67',availableAt:available,deviceValidatedAt:available,enforceAt:enforce}}};
assert(core.validate(inactive));assert(core.validate(policy));
assert.equal(core.compare('2.2.9','2.2.67'),-1);assert.equal(core.compare('2.10.0','2.9.99'),1);assert.equal(core.compare('2.2','2.2.67'),null);
assert.equal(core.evaluate(policy,'android','2.2.66',Date.parse(available)+1).mode,'notice');
assert.equal(core.evaluate(policy,'android','2.2.66',Date.parse(enforce)).mode,'required');
assert.equal(core.evaluate(policy,'android','2.2.67',Date.parse(available)+1).mode,'none');
assert.equal(core.evaluate(policy,'ios','2.2.8',Date.parse(enforce)).mode,'none');
assert.equal(core.evaluate(policy,'web','2.2.8',Date.parse(enforce)).mode,'none');
assert.equal(core.evaluate(policy,'android','2.2.8',Date.parse(available)-1).mode,'none');
for(const broken of [ {...policy,noticeDays:1}, {...policy,platforms:{...policy.platforms,android:{...policy.platforms.android,enforceAt:'2026-09-07T23:59:59Z'}}}, {...policy,platforms:{...policy.platforms,android:{...policy.platforms.android,deviceValidatedAt:'2026-09-02T00:00:00Z'}}}])assert(!core.validate(broken));
// O gate usa mínimos independentes, não a versão web que continua avançando.
const {check}=require('../scripts/check-nativo-pronto-para-corte');
const lab=fs.mkdtempSync(path.join(require('os').tmpdir(),'sp-native-gate-'));
function write(rel,value){const file=path.join(lab,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
try{
 const active=JSON.parse(JSON.stringify(policy));active.platforms.ios={...active.platforms.android};
 write('native-update-policy.json',JSON.stringify(active));write('capacitor.config.json',JSON.stringify({webDir:'www',server:{}}));write('version.txt','2.9.0');
 write('ios/App/App.xcodeproj/project.pbxproj','MARKETING_VERSION = 2.2.67;');write('android/app/build.gradle','versionName "2.2.67"');
 for(const dir of ['ios/App/App/public','android/app/src/main/assets/public']){
  write(dir+'/js/store.js',"window.SCOREPLACE_VERSION = '2.2.67';");
  write(dir+'/index.html','<script src="js/native-update-policy-core.js"></script><script src="js/native-update.js"></script>');
  write(dir+'/js/native-update-policy-core.js','/* fixture */');write(dir+'/js/native-update.js','/* fixture */');
 }
 assert.deepEqual(check(lab,Date.parse(enforce)),[],'web mais nova não obriga outro mínimo nativo');
 assert(check(lab,Date.parse(enforce)-1).some(s=>s.includes('prazo')));
 write('android/app/src/main/assets/public/js/store.js',"window.SCOREPLACE_VERSION = '2.2.8';");assert(check(lab,Date.parse(enforce)).some(s=>s.includes('JS embarcado')));
 write('native-update-policy.json',JSON.stringify(inactive));assert.equal(check(lab,Date.parse(enforce)).length,2);
}finally{fs.rmSync(lab,{recursive:true,force:true});}
const source=fs.readFileSync(path.join(root,'js/store.js'),'utf8');
const safeStart=source.indexOf('  window._isSafeToReload = function() {'),safeEnd=source.indexOf('\n  };',safeStart)+5;
const safe=source.slice(safeStart,safeEnd);
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  async function open(platform,version,cached){
   const page=await browser.newPage({viewport:{width:390,height:844}});let calls=0;
   await page.route('https://audit.test/**',r=>r.fulfill({body:'<!doctype html><html lang="pt-BR"><body><button id="existing">Início</button></body></html>',contentType:'text/html'}));
   await page.route('https://scoreplace.app/native-update-policy.json',r=>{calls++;return r.fulfill({json:policy});});
   await page.goto('https://audit.test/#dashboard');
   await page.evaluate(({platform,version,cached})=>{
    window.Capacitor={getPlatform:()=>platform};window.SCOREPLACE_VERSION=version;
    window.SP_LOJAS={play:{on:true,url:'https://play.google.com/store/apps/details?id=app.scoreplace',nome:'Google Play'},apple:{on:true,url:'https://apps.apple.com/br/app/scoreplace/id6789757489',nome:'App Store'}};
    window._translations={};window.auditNow=Date.parse('2026-09-02T00:00:00Z');Date.now=()=>window.auditNow;
    if(cached)localStorage.setItem('scoreplace_native_update_policy_v1',JSON.stringify(cached));
   },{platform,version,cached});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/i18n-pt.js'),'utf8')});
   await page.evaluate(()=>{window._t=(key,args)=>Object.entries(args||{}).reduce((s,[k,v])=>s.replace('{'+k+'}',v),window._translations.pt[key]||key);});
   await page.addStyleTag({path:path.join(root,'css/style.css')});await page.addStyleTag({path:path.join(root,'css/components.css')});
   await page.addScriptTag({content:safe});await page.addScriptTag({path:path.join(root,'js/native-update-policy-core.js')});await page.addScriptTag({path:path.join(root,'js/native-update.js')});
   await page.evaluate(()=>window._checkNativeUpdatePolicy ? window._checkNativeUpdatePolicy() : Promise.resolve());
   return {page,calls:()=>calls};
  }
  const web=await open('web','2.2.8');assert.equal(web.calls(),0);assert.equal(await web.page.locator('#sp-native-update').count(),0);await web.page.close();
  const updated=await open('android','2.2.67');assert.equal(await updated.page.locator('#sp-native-update').count(),0);await updated.page.close();
  const ios=await open('ios','2.2.8');assert.equal(await ios.page.locator('#sp-native-update').count(),0);await ios.page.close();
  const {page}=await open('android','2.2.8');assert.equal(await page.locator('#sp-native-update').getAttribute('data-mode'),'notice');
  assert((await page.locator('#sp-native-update').innerText()).includes('novidades'));
  assert.equal(await page.locator('#sp-native-update a').getAttribute('href'),'https://play.google.com/store/apps/details?id=app.scoreplace');
  await page.getByRole('button',{name:'Mais tarde'}).click();assert.equal(await page.locator('#sp-native-update').count(),0);
  await page.evaluate(async()=>{window.auditNow=Date.parse('2026-09-09T00:00:00Z');const live=document.createElement('div');live.id='live-scoring-overlay';document.body.append(live);await window._checkNativeUpdatePolicy();});
  assert.equal(await page.locator('#sp-native-update').count(),0,'não interrompe placar real detectado pela guarda');
  await page.evaluate(async()=>{document.getElementById('live-scoring-overlay').remove();await window._checkNativeUpdatePolicy();});
  assert.equal(await page.locator('#sp-native-update').getAttribute('data-mode'),'required');assert.equal(await page.locator('dialog[open]').count(),1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),1);
  assert.equal(await page.locator('#sp-native-update button').count(),0);
  const imageDir=process.env.SP_AUDIT_SCREENSHOT_DIR;
  if(imageDir){fs.mkdirSync(imageDir,{recursive:true});await page.screenshot({path:path.join(imageDir,'native-required-dark.png')});await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));await page.screenshot({path:path.join(imageDir,'native-required-light.png')});}
  await page.route('https://scoreplace.app/native-update-policy.json',r=>r.abort());
  await page.evaluate(async()=>{window.auditNow+=61000;await window._checkNativeUpdatePolicy();});assert.equal(await page.locator('dialog[open]').count(),1,'offline mantém política já conhecida');
  await page.route('https://scoreplace.app/native-update-policy.json',r=>r.fulfill({json:inactive}));
  await page.evaluate(async()=>{window.auditNow+=61000;await window._checkNativeUpdatePolicy();});assert.equal(await page.locator('#sp-native-update').count(),0,'política válida desativada remove bloqueio');
  await page.close();
  console.log('✓ política nativa: versões, prazo, plataformas, web inerte, novidades imediatas, proteção do placar, diálogo, offline e desativação no Chromium');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
