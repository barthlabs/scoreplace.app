'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('@playwright/test');
const {scenario,D}=require('./universal-phase-grid.test');

(async()=>{
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage();
    page.on('pageerror',error=>console.error('Browser:',error));
    await page.setContent('<input id="tourn-court-count" value="6"><input id="tourn-game-duration" value="15">'+
      '<input id="tourn-call-time" value="2"><input id="tourn-warmup-time" value="3"><input type="checkbox" checked id="setup-first-round-only">'+
      '<input type="checkbox" checked id="tourn-custom-category-capacity"><input id="tourn-max-by-category"><input id="tourn-max-participants">'+
      '<input id="select-sport" value="Beach Tennis"><section id="phase-call-order-editor"></section>');
    for(const file of ['domain/standings','domain/team-competition','domain/phase-grid-plan','views/sport-rules','views/standings-core','views/super-eight-core',
      'views/format2','views/tournaments-categories','views/bracket-model','views/bracket-logic','views/bracket-policy','views/chaves',
      'views/chaves-adapter','views/phases-engine','views/tournaments-utils','views/tournaments-draw','views/schedule-poll','views/phase-grid-editor'])
      await page.addScriptTag({path:path.resolve(__dirname,'../js/'+file+'.js')});
    for(const t of [scenario(['Quadro B','Quadro C'],[16,32],[8,8],[5,5],[4,2]),scenario(['Geral'],[8],[4],[3]),
      scenario(['Geral'],[8],[8],[7])]) {
      await page.evaluate(({t,D})=>{
        document.querySelector('#tourn-max-by-category').value=JSON.stringify(t.maxParticipantsByCategory);
        _phaseCallOrderState={tournament:t,tiles:[],locked:false};
        _estimatedGameHoursState={mode:'organizer',valuesByDay:{},saved:{days:D}};
        _estimatedGameDays=()=>D.map(d=>d.day);
        _f2GetConfig=()=>t.fmt2;
        _getCreateFormCategoryData=()=>({combinedCategories:t.combinedCategories});
        _renderPhaseGridEditor();
      },{t,D});
      await page.getByRole('button',{name:'Gerar proposta de grade'}).click();
      const overlay=page.getByRole('dialog');
      await overlay.waitFor({timeout:3000}).catch(async error=>{throw new Error((await page.locator('body').innerText()).slice(0,1000)+' '+error.message);});
      let plan=await page.evaluate(()=>_readPhaseGridPlan());
      if (t.combinedCategories.length===2) {
        const open=overlay.getByRole('button',{name:'Distribuir grupos nas quadras'});
        await open.click();
        assert.equal(await overlay.locator('[data-assignment]').count(),6);
        const first=overlay.locator('[data-assignment="0"]');
        await first.getByLabel('Nome do grupo').fill('B1 matinal');
        await first.getByLabel('Entrada').fill('2');
        await overlay.getByRole('button',{name:'Aplicar distribuição'}).click();
        assert.match(await overlay.locator('#phase-grid-message').innerText(),/quadra/);
        assert.deepEqual(await page.evaluate(()=>_readPhaseGridPlan()),plan);
        await first.getByLabel('Entrada').fill('1');
        await first.getByRole('button',{name:'Quadra 2',exact:true}).click();
        await first.getByRole('button',{name:'Quadra 2',exact:true}).click();
        await overlay.getByRole('button',{name:'Aplicar distribuição'}).click();
        plan=await page.evaluate(()=>_readPhaseGridPlan());
        assert.equal(plan.groupAssignments[0].label,'B1 matinal');
        assert.equal(await overlay.locator('[aria-label*="B1 matinal"]').count(),10);
        await open.click();
        await first.getByLabel('Nome do grupo').fill('descartar');
        await overlay.getByRole('button',{name:'Cancelar',exact:true}).click();
        assert.deepEqual(await page.evaluate(()=>_readPhaseGridPlan()),plan);
      }
      const series=t.fmt2.rotationCategoryRules[0].groupFormation.value===4;
      const expected=series?6:t.combinedCategories.length===2?68:14;
      assert.equal(plan.totalGames,expected);
      assert.equal(await overlay.locator('.phase-grid-series').count(),series?2:0);
      assert.equal(await overlay.locator('.phase-grid-single').count(),series?0:expected);
      await overlay.getByRole('button',{name:'Voltar à edição'}).click();
      await page.evaluate(({t,plan,D})=>{
        _phaseCallOrderState={tournament:{...t,scheduleWindow:{days:D,interleavedPlan:plan}},plan,day:D[0],
          tiles:ScoreplacePhaseGridPlan.expand(plan,t),locked:true};
        _renderPhaseGridEditor();
      },{t,plan,D});
      await page.getByRole('button',{name:'Abrir grade em tela ampla'}).click();
      assert.equal(await overlay.locator('.phase-grid-tile').count(),plan.blocks.length);
      if (plan.groupAssignments?.length) assert.equal(await overlay.locator('[aria-label*="B1 matinal"]').count(),10);
      await overlay.getByRole('button',{name:'Voltar à edição'}).click();
      if (plan.groupAssignments?.length) {
        await page.evaluate(()=>{
          const saved=_phaseCallOrderState.tournament;
          window._findTournamentById=()=>saved;
          if (!_requiresMonarchPreDrawReview(saved) || !_openMonarchPreDrawReview('demo')) throw new Error('Revisão pré-sorteio indisponível');
        });
        await overlay.getByRole('button',{name:'Distribuir grupos nas quadras'}).click();
        assert.equal(await overlay.locator('[data-assignment="0"] input[type=text]').inputValue(),'B1 matinal');
        await overlay.getByRole('button',{name:'Voltar sem sortear'}).click();
      }
    }
    console.log('✓ Chromium: editor de grade abre, enumera e reabre 68 jogos, duas séries de quatro e Super 8 em duas quadras.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
