'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const art = name => 'https://storage.googleapis.com/scoreplace-app.firebasestorage.app/tournamentTvArt/copa/' + name + '.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWk0AAAAASUVORK5CYII=', 'base64');
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const origin = 'https://tv.example.test';
    await context.route(origin + '/**', route => route.request().resourceType() === 'script'
      ? route.fulfill({ path:'js/domain/match-timing.js', contentType:'application/javascript' })
      : route.fulfill({ body:'<button id="open">No ar</button>', contentType:'text/html' }));
    const page = await context.newPage();
    await page.goto(origin);
    for (const file of ['js/domain/match-day.js','js/domain/match-timing.js','js/domain/next-match.js','js/tv-layout-core.js','js/views/tv-live.js'])
      await page.addScriptTag({ path:file });
    await page.evaluate(() => {
      window._warn = (area,error) => { window.lastTvError = String(area)+' '+(error && error.stack); };
      window._currentBracketTournament = { id:'copa',name:'Copa',matches:[{ id:'jogo', p1:'Ana',p2:'Bea',
        scoreP1:6, scoreP2:1, winner:'p1', scheduledAt:new Date().toISOString(), resultAt:new Date().toISOString() }] };
      window._findTournamentById = () => window._currentBracketTournament;
      document.querySelector('#open').onclick = window._tvLiveToggle;
    });
    const opened = page.waitForEvent('popup');
    await page.click('#open');
    const tv = await opened;
    await tv.locator('#tv-sponsor').waitFor({state:'attached'});
    await tv.evaluate(encoded => {
      window.loadedUrls = [];
      window.testImages = [];
      const RealImage = window.Image;
      window.Image = function () {
        const image = new RealImage();
        window.testImages.push(image);
        const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
        Object.defineProperty(image,'src',{set(url) {
          window.loadedUrls.push(url); image.dataset.sourceUrl=url;
          source.set.call(image, 'data:image/png;base64,'+(url.includes('broken') ? 'ZmFsYQ==' : encoded));
        }});
        return image;
      };
      window.firstDoc = document;
      let ms = 0, serial = 0;
      const tasks = new Map();
      Object.defineProperty(performance,'now',{ value:() => ms });
      window.setTimeout = (fn,delay) => { tasks.set(++serial,{ due:ms+delay,fn });return serial; };
      window.clearTimeout = key => tasks.delete(key);
      window.tickRotation = delta => {
        const end = ms + delta;
        for (;;) {
          const next = [...tasks.entries()].sort((a,b)=>a[1].due-b[1].due)[0];
          if (!next || next[1].due > end) break;
          tasks.delete(next[0]); ms = next[1].due; next[1].fn();
        }
        ms = end;
      };
      window.rotationTimers = () => tasks.size;
    },png.toString('base64'));
    const configure = value => page.evaluate(config => {
      window._currentBracketTournament.tvRotation = config;
      window._tvLiveRefresh();
    },value);
    const tick = ms => tv.evaluate(delta => window.tickRotation(delta),ms);
    const visible = () => tv.evaluate(() => document.querySelector('#tv-sponsor').dataset.slide || 'main');
    const see = async id => {
      try { await tv.waitForFunction(id => (document.querySelector('#tv-sponsor').dataset.slide || 'main') === id, id, { timeout:4000 }); }
      catch (error) { throw new Error('Tela esperada '+id+', atual '+await visible()+', erro '+await page.evaluate(()=>window.lastTvError)+', timers '+await tv.evaluate(()=>window.rotationTimers())+' carregadas '+await tv.evaluate(()=>JSON.stringify(window.loadedUrls)),{cause:error}); }
    };
    for (const mode of ['sequential','interleaved']) for (const count of [1,2,3]) {
      const slides = Array.from({length:count},(_,i) => ({ id:'s'+i,name:'',durationSeconds:i+1,assets:[art(mode+count+i)] }));
      await configure({ enabled:true, mode, mainDurationSeconds:4, slides });
      assert.equal(await visible(),'main');
      await tick(2500);
      await page.evaluate(() => {
        window._currentBracketTournament.matches[0].scoreP2++;
        window._currentBracketTournament.tvRotation = JSON.parse(JSON.stringify(window._currentBracketTournament.tvRotation));
        window._tvLiveRefresh();
      });
      await tick(1499); assert.equal(await visible(),'main');
      await tick(1);
      for (let i=0;i<count;i++) {
        await see('s'+i);
        const score = await page.evaluate(() => {
          const match = window._currentBracketTournament.matches[0];
          match.scoreP1++; window._tvLiveRefresh(); return match.scoreP1;
        });
        assert.equal(await tv.locator('[data-result-id="jogo"] .tv-result-left strong').first().textContent(),String(score));
        assert.equal(await visible(),'s'+i);
        await tick((i+1)*1000-1);
        assert.equal(await visible(),'s'+i);
        await tick(1);
        if (mode === 'interleaved' && i+1<count) { await see('main'); await tick(4000); }
      }
      await see('main'); await tick(4000); await see('s0');
      await configure({enabled:false,mode,mainDurationSeconds:4,slides});
      await see('main'); assert.equal(await tv.evaluate(()=>window.rotationTimers()),0);
    }
    const courtConfig = { enabled:true, placement:'court', mode:'sequential', mainDurationSeconds:2,
      slides:[{ id:'partners',name:'Parceiros',durationSeconds:3,assets:[art('alpha'),art('beta')] }] };
    const currentCourt = () => tv.locator('#tv-sponsor').getAttribute('data-court');
    const boxOf = async selector => tv.locator(selector).first().boundingBox();
    await page.evaluate(()=>{
      const t=window._currentBracketTournament;
      t.courtNames=['Central','Leste','Oeste'];
      t.matches.push({id:'ao-vivo',court:'Central',p1:'Ana',p2:'Bea',scoreP1:1,scoreP2:2,courtCalledAt:new Date().toISOString()});
    });
    await configure(courtConfig);
    await tick(2000); await see('partners');
    for (const [i,court] of ['Central','Leste','Oeste','Central','Leste','Oeste'].entries()) {
      assert.equal(await currentCourt(),court);
      assert.equal(await tv.locator('#tv-sponsor img').count(),1);
      assert.equal(await tv.locator('#tv-sponsor img').evaluate(img=>img.dataset.sourceUrl),art(i%2?'beta':'alpha'));
      const activeBox = await boxOf('[data-tv-court="'+court+'"]');
      const adBox = await boxOf('#tv-sponsor');
      assert.ok(Math.abs(adBox.x-activeBox.x)<1 && Math.abs(adBox.width-activeBox.width)<1 && Math.abs(adBox.height-activeBox.height)<1);
      await tick(2000);
      const score=await page.evaluate(()=>{
        const match=window._currentBracketTournament.matches.find(m=>m.id==='ao-vivo');
        match.scoreP1++;window._tvLiveRefresh();return match.scoreP1;
      });
      assert.equal(await tv.locator('[data-tv-court="Central"] .tv-score').first().textContent(),String(score));
      await tick(999); assert.equal(await currentCourt(),court);
      await tick(1);
    }
    await configure({...courtConfig,mode:'interleaved'});
    await tick(2000); await see('partners'); await tick(3000); await see('main');
    await tick(1999); await see('main'); await tick(1); await see('partners'); assert.equal(await currentCourt(),'Leste');
    // A grade personalizada recria cards e clones para manter a rolagem contínua.
    await tv.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>{
      const t=window._currentBracketTournament;
      t.courtNames=Array.from({length:8},(_,i)=>'Q'+(i+1));
      t.tvLayout=window.ScoreplaceTvLayout.defaults();t.tvLayout.card.court=false;
      t.tvRotation={...t.tvRotation,mode:'sequential',mainDurationSeconds:1};window._tvLiveRefresh();
    });
    await tv.evaluate(()=>{
      const style=document.createElement('style');style.id='court-test-size';
      style.textContent='.tv-custom-courts .tv-courts{height:240px!important;grid-auto-rows:120px!important}';document.head.append(style);
      window.dispatchEvent(new Event('resize'));
    });
    await tick(1000); await see('partners');
    const original = await currentCourt();
    assert.ok(original);
    await tv.waitForFunction(()=>!!document.querySelector('[data-tv-court][data-tv-loop-repeat]'));
    await tv.evaluate(name=>{
      const loop=document.querySelector('[data-tv-autoscroll="courts"]');
      const copy=Array.from(loop.children).find(n=>n.dataset.tvCourt===name && n.hasAttribute('data-tv-loop-repeat'));
      loop.scrollTop += copy.getBoundingClientRect().top-loop.getBoundingClientRect().top+18;
      loop.dispatchEvent(new Event('scroll'));
    },original);
    await tv.waitForFunction(name=>{
      const section=document.querySelector('[data-tv-autoscroll="courts"]'),view=section.getBoundingClientRect();
      const copy=Array.from(section.children).find(n=>n.dataset.tvCourt===name&&n.hasAttribute('data-tv-loop-repeat')).getBoundingClientRect();
      const ad=document.querySelector('#tv-sponsor').getBoundingClientRect();
      return copy.top<view.top-1 && Math.abs(ad.top-view.top)<1 && Math.abs(ad.bottom-copy.bottom)<1;
    },original,{timeout:3000});
    assert.equal(await tv.locator('#tv-sponsor').count(),1);
    await tick(1500);
    await page.evaluate(()=>{window._currentBracketTournament.name+='Z';window._tvLiveRefresh();});
    await tv.evaluate(()=>{window.__tvReplaceMarkup(window.__tvLastMarkup);window.dispatchEvent(new Event('resize'));});
    await tick(1499); assert.equal(await currentCourt(),original);
    await tick(1); assert.notEqual(await currentCourt(),original);
    await page.evaluate(()=>{window._currentBracketTournament.tvLayout.sections.courts.visible=false;window._tvLiveRefresh();});
    await see('main'); await tick(20000); await see('main');
    await page.evaluate(()=>{window._currentBracketTournament.tvLayout.sections.courts.visible=true;window._tvLiveRefresh();});
    await see('partners');
    await configure({...courtConfig,enabled:false}); await see('main');
    await page.evaluate(()=>{const t=window._currentBracketTournament;t.tvLayout=null;t.courtNames=['Única'];t.matches.pop();});
    const sparse={...courtConfig,mainDurationSeconds:1,slides:[{id:'single',name:'',durationSeconds:2,assets:[art('broken-court'),art('healthy')]}]};
    await configure(sparse);await tick(1000);await see('single');
    assert.equal(await currentCourt(),'Única');
    assert.equal(await tv.locator('#tv-sponsor img').evaluate(img=>img.dataset.sourceUrl),art('healthy'));
    await tick(2000);await see('single');assert.equal(await currentCourt(),'Única');
    await configure({...sparse,slides:[{...sparse.slides[0],assets:[art('broken-court')]}]});
    await tick(1000);await see('main');await tv.waitForFunction(()=>window.rotationTimers()===0);
    const failedCourtRequests=await tv.evaluate(()=>window.loadedUrls.length);
    await tick(20000);await page.evaluate(()=>window._tvLiveRefresh());await see('main');
    assert.equal(await tv.evaluate(()=>window.loadedUrls.length),failedCourtRequests);
    const many = { enabled:true, mode:'sequential', mainDurationSeconds:1, slides:Array.from({ length:12 },(_,i) => ({
      id:'full'+i, name:'', durationSeconds:1, assets:Array.from({length:12},(_,j)=>art('full-'+i+'-'+j))
    })) };
    const retained = () => tv.evaluate(()=>window.testImages.filter(image=>image.hasAttribute('src')).length);
    await configure(many);
    assert.equal(await retained(),12);
    for (const slide of many.slides) {
      await tick(1000); await see(slide.id);
      assert.equal(await retained(),24,'carrega somente a tela atual e a próxima');
    }
    await tick(1000); await see('main'); assert.equal(await retained(),12);
    await tick(1000); await see('full0'); assert.equal(await retained(),24);
    await configure({...many, enabled:false}); assert.equal(await retained(),0);
    const bad = { id:'bad', name:'', durationSeconds:1, assets:[art('broken')] };
    const mixed = { enabled:true,mode:'interleaved',mainDurationSeconds:1,
      slides:[bad,{id:'good',name:'',durationSeconds:2,assets:[art('ok'),art('broken-other')]}] };
    await configure(mixed); await tick(1000); await see('good');
    assert.equal(await tv.locator('#tv-sponsor img').count(),1);
    await configure({...mixed,slides:[bad]}); await tick(1000); await see('main');
    await tv.waitForFunction(()=>window.rotationTimers()===0);
    const requests = await tv.evaluate(()=>window.loadedUrls.length);
    await tick(600000);
    await page.evaluate(()=>window._tvLiveRefresh());
    assert.equal(await visible(),'main'); assert.equal(await tv.evaluate(()=>window.loadedUrls.length),requests);
    assert.equal(await tv.evaluate(()=>window.firstDoc===document),true);
    console.log('✓ janela TV: 1–3 patrocinadores, períodos, atualizações, falhas de arte e timers');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
