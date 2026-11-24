'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="f2-config-mount"></main>');
    for (const file of ['sport-rules','standings-core','super-eight-core','format2','tournaments-categories','bracket-model',
      'chaves','chaves-adapter','phases-engine','tournaments-utils','format2-ui']) {
      await page.addScriptTag({path:require.resolve('../js/views/' + file + '.js')});
    }
    await page.evaluate(() => {
      const cfg = window.FORMAT2.defaultConfig('Beach Tennis');
      cfg.classifAtiva = false; cfg.eliminatoria.ativa = true; cfg.eliminatoria.openReiRainha = true;
      window.fixture = {id:'synthetic-config',sport:'Beach Tennis',testModeEnabled:true,matches:[],rounds:[],groups:[],
        currentPhaseIndex:0,combinedCategories:['Alpha','Beta'],participants:[],fmt2:cfg};
      for (const [category,n] of [['Alpha',12],['Beta',8]]) for(let i=0;i<n;i++)
        window.fixture.participants.push({uid:category+i,displayName:category+' '+i,category});
      window._f2MountInForm(document.querySelector('main'), fixture.sport, cfg, fixture);
    });
    const elim = page.locator('input[onchange*="_f2Elim("]');
    assert.equal(await elim.isDisabled(), false, 'pré-sorteio permite desligar eliminatória direta');
    await elim.uncheck();
    let cfg = await page.evaluate(() => window._f2GetConfig());
    assert.equal(cfg.classifAtiva, true); assert.equal(cfg.eliminatoria.ativa, false);
    await page.evaluate(() => {window._f2Disputa('individual');window._f2ClassificationStructure('groups');});
    await page.locator('#f2-group-formation-mode [data-value="count"]').click();
    await page.locator('#f2-group-formation-value').fill('1');
    await page.locator('#f2-group-formation-value').press('Tab');
    assert.deepEqual(await page.evaluate(() => window._f2GetConfig().groupFormation), {mode:'count',value:1});
    await page.locator('#f2-group-category-enabled').check();
    for (const [i,count,games] of [[0,2,3],[1,1,5]]) {
      await page.locator('#f2-group-mode-'+i+' [data-value="count"]').click();
      await page.locator('#f2-group-value-'+i).fill(String(count));
      await page.locator('#f2-group-value-'+i).press('Tab');
      await page.locator('#f2-group-games-'+i).fill(String(games));
      await page.locator('#f2-group-games-'+i).press('Tab');
    }
    cfg = await page.evaluate(() => window._f2GetConfig());
    assert.deepEqual(cfg.groupCategoryRules,[
      {category:'Alpha',groupFormation:{mode:'count',value:2},gamesPerUnit:3},
      {category:'Beta',groupFormation:{mode:'count',value:1},gamesPerUnit:5}
    ]);
    assert.match(await page.locator('#f2-group-preview-0').innerText(), /18/);
    assert.match(await page.locator('#f2-group-preview-1').innerText(), /20/);
    await page.evaluate(saved => {
      window.fixture.fmt2=saved;
      window._f2MountInForm(document.querySelector('main'),fixture.sport,saved,fixture);
    },cfg);
    assert.equal(await page.locator('#f2-group-value-1').inputValue(),'1');
    assert.equal(await page.locator('#f2-group-games-1').inputValue(),'5');
    assert.equal(await page.evaluate(() => window.fixture.testModeEnabled),true);
    const phases=await page.evaluate(() => window.FORMAT2.compileToPhases(window._f2GetConfig(),
      {sport:fixture.sport,categories:fixture.combinedCategories}).phases);
    assert.equal(phases.length,1); assert.equal(phases[0].kind,'classification');
    assert.deepEqual(phases[0].classification.groupCategoryRules,cfg.groupCategoryRules);
    assert.equal(await page.locator('main select').count(),0,'classificatória usa botões e toggles');
    await page.locator('#f2-group-repeat-0').check();
    await page.locator('#f2-group-games-0').fill('14');
    await page.locator('#f2-group-games-0').press('Tab');
    assert.equal(await page.locator('#f2-group-games-0').inputValue(),'14');
    assert.match(await page.locator('#f2-group-preview-0').innerText(),/84 jogos/);
    assert.equal(await page.evaluate(()=>window._f2GetConfig().groupCategoryRules[0].allowRepeat),true);

    await page.evaluate(() => {
      const prior=window._f2GetConfig();prior.grupos=12;prior.groupFormation={mode:'count',value:12};
      window._f2MountInForm(document.querySelector('main'),fixture.sport,prior,fixture);
      window._f2Disputa('dupla'); window._f2ClassificationStructure('rei_rainha');
    });
    cfg=await page.evaluate(()=>window._f2GetConfig());
    assert.equal(cfg.parceria,'rei_rainha');assert.equal(cfg.grupos,1);
    assert.deepEqual(cfg.groupCategoryRules,[]); assert.equal(cfg.groupFormation,undefined);
    assert.equal(cfg.eliminatoria.ativa,false);
    await page.evaluate(() => window._f2ClassificationStructure('groups'));
    await page.locator('#f2-group-category-enabled').check();
    await page.locator('#f2-group-mode-0 [data-value="people"]').click();
    await page.locator('#f2-group-value-0').fill('8');
    await page.locator('#f2-group-value-0').press('Tab');
    assert.deepEqual(await page.evaluate(()=>window._f2GetConfig().groupCategoryRules[0].groupFormation),{mode:'size',value:4});
    await page.locator('#f2-group-value-0').fill('7');
    await page.locator('#f2-group-value-0').press('Tab');
    assert.deepEqual(await page.evaluate(()=>window._f2GetConfig().groupCategoryRules[0].groupFormation),{mode:'size',value:4},
      'capacidade ímpar em pessoas não é arredondada para duplas silenciosamente');
    await page.evaluate(()=>{
      const c=window.FORMAT2.defaultConfig('Beach Tennis');
      c.parceria='rotation_groups_8';c.rodadas.modo='todos';c.groupFormation={mode:'size',value:8};c.eliminatoria.ativa=false;
      window.fixture={id:'rotation-demo',sport:'Beach Tennis',combinedCategories:['Solo'],participants:
        Array.from({length:8},(_,i)=>({uid:'u'+i,displayName:'Pessoa '+i,category:'Solo'})),matches:[],rounds:[],groups:[],fmt2:c};
      window._f2MountInForm(document.querySelector('main'),fixture.sport,c,fixture);
      window.countMatches=()=>{
        const cfg=window._f2GetConfig(),phase=window.FORMAT2.compileToPhases(cfg,{sport:fixture.sport,categories:fixture.combinedCategories}).phases[0];
        phase.category='Solo';return window._phasesEngine.genGroupsFromPool(fixture.participants,phase,'browser-fixture').matches.length;
      };
    });
    await page.locator('#f2-rotation-rounds').fill('7');await page.locator('#f2-rotation-rounds').press('Tab');
    assert.equal(await page.evaluate(()=>window.countMatches()),14);
    await page.locator('#f2-rotation-repeat').check();
    await page.locator('#f2-rotation-rounds').fill('14');await page.locator('#f2-rotation-rounds').press('Tab');
    assert.equal(await page.locator('#f2-rotation-rounds').inputValue(),'14');
    assert.equal(await page.evaluate(()=>window.countMatches()),28);
    assert.equal(await page.evaluate(()=>window._f2GetConfig().rotationAllowRepeatPartners),true);
    console.log('✓ Chromium: 7/14 partidas por atleta geram 14/28 jogos, sem menus suspensos');
    console.log('✓ Chromium: eliminatória desativada, grupos 2/1, jogos 3/5, reabertura, Rainha independente e pessoas/duplas');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
