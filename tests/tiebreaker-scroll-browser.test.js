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
 }console.log('✓ critérios: excluir vários, último, reativar e cliques rápidos preservam scroll da janela e container');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
