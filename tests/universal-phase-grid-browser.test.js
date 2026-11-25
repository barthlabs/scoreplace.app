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
    const scripts=['domain/standings','domain/team-competition','domain/phase-grid-plan','views/sport-rules','views/standings-core','views/super-eight-core',
      'views/format2','views/tournaments-categories','views/bracket-model','views/bracket-logic','views/bracket-policy','views/chaves',
      'views/chaves-adapter','views/phases-engine','views/tournaments-utils','views/tournaments-draw','views/schedule-poll'];
    for(const file of [...scripts,'views/phase-grid-editor'])
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
    await datedReview(browser,scripts);
    console.log('✓ Chromium: editor de grade abre, enumera e reabre 68 jogos, duas séries de quatro e Super 8 em duas quadras.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

async function datedReview(browser,scripts) {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<input id="tourn-start-date" type="date"><input id="tourn-end-date" type="date">'+
    '<div id="estimated-games-window-section"><div id="estimated-games-window-days"></div></div>'+
    '<section id="phase-call-order-editor"></section>');
  const load=file=>page.addScriptTag({path:path.resolve(__dirname,'../js/'+file+'.js')});
  for(const file of [...scripts,'views/create-tournament']) await load(file);
  await page.evaluate(()=>{
    const original=window._requiresMonarchPreDrawReview;
    window.legacyCalls=0;
    window._requiresMonarchPreDrawReview=t=>{window.legacyCalls++;return original(t);};
  });
  await load('views/phase-grid-editor');
  await page.evaluate(()=>{window.firstReview=window._requiresMonarchPreDrawReview;});
  await load('views/phase-grid-editor');
  assert.equal(await page.evaluate(()=>window.firstReview===window._requiresMonarchPreDrawReview),true);
  assert.equal(await page.evaluate(()=>_requiresMonarchPreDrawReview({scheduleWindow:{mode:'participants',days:[]}})),false);
  assert.equal(await page.evaluate(()=>window.legacyCalls),1);

  async function setDates(value) {
    await page.locator('#tourn-start-date').fill(value);
    await page.locator('#tourn-end-date').fill(value);
    return page.evaluate(()=>{_renderEstimatedGameHours(true);return _estimatedGameHoursState.mode;});
  }
  assert.equal(await setDates(''),'participants');
  await page.locator('#tourn-start-date').fill('2026-12-01');
  await page.locator('#tourn-end-date').fill('2027-02-15');
  assert.equal(await page.evaluate(()=>{_renderEstimatedGameHours(true);return _readEstimatedGameHours().mode;}),'participants');
  assert.equal(await setDates(D[0].day),'organizer');
  assert.equal(await page.getByText('Horário de cada categoria',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>_readEstimatedGameHours().mode),'organizer');
  assert.equal(await page.getByRole('button',{name:'Gerar proposta de grade'}).count(),1);
  assert.equal(await setDates(''),'participants');
  await page.evaluate(()=>_setEstimatedScheduleMode('participants'));
  assert.equal(await setDates(D[0].day),'participants');
  const prepare=page.getByRole('button',{name:'Definir horários e preparar grade de quadras'});
  assert.equal(await prepare.count(),1);
  await prepare.click();
  assert.equal(await page.evaluate(()=>_estimatedGameHoursState.mode),'organizer');
  await page.evaluate(()=>{
    window._estimatedGameHoursState={saved:{mode:'participants',days:[]},categoryByKey:{},valuesByDay:{}};
  });
  assert.equal(await setDates(D[0].day),'participants');

  const rotating=scenario(['A'],[8],[8],[7]);
  const team=scenario(['Times'],[16],[4],[3],null,'fixa');
  team.fmt2.rodadas={modo:'todos',turnos:'ida'};
  team.fmt2.teamCompetition={enabled:true,teamCount:8,teamNames:Array.from({length:8},(_,i)=>'Equipe '+i),
    schedule:{enabled:true,mode:'structured',teamsPerGroup:2,gamesPerPairByCategory:{Times:3},
      groupFormationByCategory:{Times:{mode:'count',value:2}}}};
  const roster=JSON.parse(JSON.stringify(rotating));
  delete roster.maxParticipantsByCategory;
  roster.participants=Array.from({length:8},(_,i)=>({uid:'atleta-'+i,category:'A'}));
  const singles=scenario(['A'],[8],[4],[3],null,'single');
  const direct=JSON.parse(JSON.stringify(singles));
  direct.fmt2.classifAtiva=false;
  Object.assign(direct.fmt2.eliminatoria,{ativa:true,origem:'inscritos',terceiro:true});
  const dialog=page.getByRole('dialog');
  async function open(t,days=D) {
    await page.evaluate(({t,days})=>{
      t.id='teste-grade-datada';t.scheduleWindow={mode:'organizer',days};
      window.fixture=t;window.events=[];window.alerts=[];
      window._findTournamentById=()=>t;
      window.showAlertDialog=(title,message)=>window.alerts.push(message);
      window.FirestoreDB={_ehSandbox:()=>true,_callFn:(name,data)=>{
        window.events.push(name);window.received=data;
        return new Promise((resolve,reject)=>{window.finishSave=resolve;window.rejectSave=reject;});
      }};
      window.generateDrawFunction=tid=>{
        if (!window._monarchDrawReviewApproved[tid]) throw Error('Sorteio sem aprovação');
        window.events.push('draw');
        window._phaseGridDrawFinished(tid);
      };
      window.showFinalReviewPanel(t.id);
    },{t,days});
  }
  for(const [t,count] of [[rotating,14],[roster,14],[team,12],[scenario(['A'],[8],[4],[3]),6],[singles,12],[direct,8]]) {
    await open(t);
    await dialog.waitFor({timeout:3000});
    assert.equal(await page.evaluate(()=>_phaseCallOrderState.plan.totalGames),count);
    assert.deepEqual(await page.evaluate(()=>window.events),[]);
    assert.equal(await page.evaluate(()=>!!window.fixture.scheduleWindow.interleavedPlan),false);
    await dialog.getByRole('button',{name:'Voltar sem sortear'}).click();
    assert.deepEqual(await page.evaluate(()=>window.events),[]);
    assert.equal(await page.evaluate(()=>!!window.fixture.scheduleWindow.interleavedPlan),false);
  }
  assert.equal(await page.evaluate(()=>{
    const t=window.fixture;
    return [{matches:[{}]},{rounds:[{}]},{groups:[{}]},{rodadas:[{}]},{_nJogos:1},{_nPartes:{matches:1}},{currentPhaseIndex:1}]
      .every(mark=>!window._requiresMonarchPreDrawReview({...t,...mark}));
  }),true);

  await open(rotating,[{...D[0],endTime:'08:01'}]);
  assert.equal(await dialog.count(),1);
  assert.equal(await page.evaluate(()=>window.alerts.length),0);
  assert(await dialog.locator('.phase-grid-overflow').count()>0);
  assert.match(await dialog.locator('#phase-grid-message').innerText(),/podem ser salvos/);
  assert.deepEqual(await page.evaluate(()=>window.events),[]);
  await dialog.getByRole('button',{name:'Voltar sem sortear'}).click();

  await open(rotating,[{...D[0],startTime:'23:50',endTime:'23:51'}]);
  await dialog.waitFor();
  const extraDay='2026-12-02';
  await page.evaluate(day=>_phaseGridDay(day),extraDay);
  assert.equal(await page.evaluate(()=>_phaseCallOrderState.activeDay),extraDay);
  assert(await dialog.locator('.phase-grid-overflow').count()>0,'continuação visível na aba do dia excedente');
  assert(await dialog.locator('.phase-grid-lane .phase-grid-tile').count()>0);
  await dialog.getByRole('button',{name:'Voltar sem sortear'}).click();

  for(const outcome of ['reject','invalid','ok']) {
    await open(rotating);
    if (outcome==='ok') {
      await dialog.getByRole('button',{name:'Distribuir grupos nas quadras'}).click();
      await dialog.getByLabel('Nome do grupo').fill('Grupo matinal');
      await dialog.getByRole('button',{name:'Aplicar distribuição'}).click();
    }
    await dialog.getByRole('button',{name:'Salvar grade e sortear'}).click();
    await page.waitForFunction(()=>window.events.length===1);
    await page.evaluate(()=>_phaseGridSaveAndDraw());
    assert.deepEqual(await page.evaluate(()=>window.events),['updateTournamentConfiguration']);
    assert.equal(await page.evaluate(()=>!!window.fixture.scheduleWindow.interleavedPlan),false);
    await page.evaluate(outcome=>{
      if (outcome==='reject') window.rejectSave(Error('Falha de gravação simulada'));
      else window.finishSave({ok:outcome==='ok'});
    },outcome);
    if (outcome==='ok') {
      await page.waitForFunction(()=>window.events.includes('draw'));
      assert.deepEqual(await page.evaluate(()=>window.events),['updateTournamentConfiguration','draw']);
      assert.equal(await page.evaluate(()=>window.received.patch.scheduleWindow.interleavedPlan.groupAssignments[0].label),'Grupo matinal');
    } else {
      await page.waitForFunction(()=>!window._phaseCallOrderState.saving);
      assert.match(await dialog.locator('#phase-grid-message').innerText(),/não concluído/);
      assert.deepEqual(await page.evaluate(()=>window.events),['updateTournamentConfiguration']);
      assert.equal(await page.evaluate(()=>!!window.fixture.scheduleWindow.interleavedPlan),false);
      await dialog.getByRole('button',{name:'Voltar sem sortear'}).click();
    }
  }
  assert.deepEqual(errors,[]);
  console.log('✓ Chromium: data, escolha explícita, revisão de grupos, Super 8, equipes, simples e eliminatória, cancelamento, bloqueios e confirmação única antes de sortear.');
}
