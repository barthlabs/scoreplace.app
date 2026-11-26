'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('@playwright/test');
const source=fs.readFileSync('js/views/create-tournament.js','utf8');
const move=source.slice(source.indexOf('      window._tbMove = function(btn)'),source.indexOf('\n      // Sugere apenas',source.indexOf('      window._tbMove = function(btn)')));
const anchor=source.slice(source.indexOf('(function _attachCreateFormScrollAnchor()'),source.indexOf('\n// Padrão centralizado:',source.indexOf('(function _attachCreateFormScrollAnchor()')));
(async()=>{const browser=await chromium.launch();try{for(const nested of [false,true]){
 const page=await browser.newPage({viewport:{width:800,height:600}});
 await page.setContent('<style>li{height:65px}button{height:40px}ul{margin:0}#host{'+(nested?'height:550px;overflow:auto':'')+'}</style><div id="host"><form id="form-create-tournament"><div style="height:1000px"></div><ul id="tiebreaker-list">'+
 Array.from({length:6},(_,i)=>'<li data-tb="k'+i+'">Critério '+i+'<button type="button" data-tb-move onclick="_tbMove(this)">X</button></li>').join('')+
 '</ul><div style="height:300px">Não considerados</div><ul id="tiebreaker-excluded-list"></ul><div style="height:1200px"></div></form></div>');
 await page.evaluate(()=>{window._tbUpdateRowControls=()=>{};window._tbNormalizeAge=()=>{};window._updateRankingRecommendations=()=>{};});
 await page.addScriptTag({content:move+'\n'+anchor});
 await page.evaluate(nested=>{if(nested)document.getElementById('host').scrollTop=900;else window.scrollTo(0,900)},nested);
 const position=()=>page.evaluate(nested=>nested?document.getElementById('host').scrollTop:scrollY,nested);
 const before=await position();
 for(let i=0;i<6;i++){
  // dispatch a focused click without Playwright's own auto-scroll masking the application behavior.
  await page.locator('#tiebreaker-list [data-tb-move]').first().evaluate(btn=>{btn.focus({preventScroll:true});btn.click()});
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await position(),before,'excluir mantém posição, inclusive último critério');
 }
 assert.equal(await page.locator('#tiebreaker-excluded-list li').count(),6);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'tiebreaker-list');
 await page.locator('#tiebreaker-excluded-list button').first().evaluate(btn=>{btn.focus({preventScroll:true});btn.click()});
 await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await position(),before,'reativar mantém posição');
 await page.evaluate(()=>{for(let i=0;i<5;i++)document.querySelector('#tiebreaker-excluded-list button')?.click()});
 await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await position(),before,'cliques rápidos mantêm posição');
 assert.equal(await page.locator('#tiebreaker-list li').count(),6);await page.close();

 }for(const nested of [false,true]){
 const page=await browser.newPage({viewport:{width:360,height:700}});
 await page.setContent('<style>#host{'+(nested?'height:600px;overflow:auto':'')+'}input,select,button{display:block;margin:12px}</style><div id="host"><form id="form-create-tournament"><div id="above" style="height:1000px"></div><input type="number"><select><option>1</option><option>2</option></select><button type="button">Toggle</button><button type="button" data-allow-auto-scroll>Ir</button><div style="height:2500px"></div></form></div>');
 await page.addScriptTag({content:anchor});
 await page.evaluate(()=>{for(const type of ['input','change','click'])document.querySelector('form').addEventListener(type,()=>{above.style.height=(parseInt(above.style.height)+40)+'px'})});
 const read=()=>page.evaluate(()=>({top:scrollY,panel:document.getElementById('host').scrollTop}));
 await page.evaluate(n=>{if(n)document.getElementById('host').scrollTop=850;else scrollTo(0,850)},nested);
 const before=await read();
 await page.locator('input').focus();await page.keyboard.type('123');
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert.deepEqual(await read(),before,'input real com reflow acima mantém posição absoluta');
 await page.locator('select').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('change',{bubbles:true}))});
 await page.evaluate(()=>new Promise(requestAnimationFrame));assert.deepEqual(await read(),before);
 // No RAF after explicit manual intent may restore the old position.
 await page.evaluate(n=>{
  document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));
  document.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true}));
  if(n)document.getElementById('host').scrollTop+=90;else scrollBy(0,90);
 },nested);
 const manual=await read();await page.evaluate(()=>new Promise(requestAnimationFrame));assert.deepEqual(await read(),manual);
 assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('overflow-anchor')),'');
 await page.evaluate(()=>{
  document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('form').remove();
  const next=document.createElement('form');next.id='form-create-tournament';next.style.height='4000px';document.getElementById('host').append(next);
 });
 const remounted=await read();await page.evaluate(()=>new Promise(requestAnimationFrame));assert.deepEqual(await read(),remounted,'remontagem descarta fotografia antiga');
 await page.close();
 }console.log('✓ critérios: excluir vários, último, reativar e cliques rápidos preservam scroll da janela e container');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
