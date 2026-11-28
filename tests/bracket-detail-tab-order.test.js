'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.SCOREPLACE_TEST_CHROME || undefined });
  try {
    const page = await browser.newPage({ viewport:{ width:965, height:800 } });
    const shell = `<!doctype html><style>
      :root{--topbar-h:0px;--backheader-h:44px}body{margin:0}header.sticky-back-header{position:sticky;top:0;height:44px;background:#111;z-index:101}
      #fbwrap-chaves{position:sticky;top:43px;padding:6px;background:#161616}#fbwrap-chaves input{height:44px;box-sizing:border-box}
      #tourn-grid-container{height:150px}#inline-bracket-container{min-height:1800px}.bracket-scroll-container{overflow-x:auto}
      .fixture-round{width:1700px;height:700px}
    </style><main id="view-container"><header class="sticky-back-header">Voltar</header>
    <div id="fbwrap-chaves"><button>No ar</button><button>A–Z</button><input id="bracket-search" value="Raquel"></div>
    <section id="tourn-grid-container">Torneio</section><section id="inline-bracket-container"></section></main>`;
    await page.route('http://sp.test/**', r => r.fulfill({contentType:'text/html',body:shell}));
    await page.goto('http://sp.test/ficha');
    await page.addStyleTag({ path:'css/bracket.css' });
    for (const path of ['js/domain/next-match.js','js/domain/court-occupancy.js','js/domain/match-timing.js','js/views/bracket-model.js','js/views/bracket.js'])
      await page.addScriptTag({ path });
    await page.evaluate(() => {
      const names = ['Fem Ouro','Fem Prata'];
      const t = { id:'fixture-detail',creatorUid:'org',courtNames:['Quadra 1','Quadra 2'],_nJogos:2,
        matches:names.map((category,i)=>({id:'m'+i,category,p1:'Time A'+i,p2:'Time B'+i,
          court:'Quadra '+(i+1),_gameNum:i===0 ? 13 : 1,scheduledAt:'2026-11-14T16:00:00Z'})) };
      window._currentBracketTournament = t;
      window._findTournamentById = () => t;
      window.AppStore = {currentUser:{uid:'org'}};
      window._souOrganizador = window._isUserAuthority = () => window.AppStore.currentUser.uid === 'org';
      window._isUserOrgOrCoHost = window._isUserAuthority;
      window._isConcentratedTournament = () => true;
      window._safeHtml = String;
      window._buildProgressInner = () => 'Progresso';
      window._bracketEnsureCourtReleaseListener = window._bracketEnsureCourtCapability = () => {};
      window.renderMatchCard = m => '<article class="sp-match-card"><div class="sp-mc-head">Jogo</div>'+
        '<div>'+m.p1+'</div><div>'+m.p2+'</div><div class="sp-match-operational"><label class="sp-match-court"><select><option>Quadra 1</option></select></label><button class="sp-match-confirm">OK</button></div></article>';
      const scope = document.getElementById('inline-bracket-container');
      window.__paint = () => {
        window._limparCamadasTransitóriasDaChave(scope);
        scope.innerHTML = '<div class="bracket-scroll-container"><div class="fixture-round">' + t.matches.map((m,i) =>
          '<div><article class="sp-match-card" id="card-'+m.id+'" data-bracket-tab-category="'+m.category+
          '" data-bracket-tab-gender="fem" data-bracket-tab-round="1" data-match-num="'+m._gameNum+'" data-bracket-scheduled-at="'+
          Date.parse(m.scheduledAt)+'" data-bracket-court="'+m.court+'">'+m.p1+'</article></div>').join('')+'</div></div>';
        window._bracketCategoryTabsMount();
      };
      window.__input = document.querySelector('#bracket-search');
      window.__input.focus();
      window.__paint();
    });
    const categoryTabs = page.locator('[data-bracket-subtab]');
    const labels = () => categoryTabs.evaluateAll(nodes => nodes.map(node => node.dataset.bracketSubtab)
      .filter(label => /^(Fem |__all_categories)/.test(label)));
    assert.deepEqual(await labels(), ['__all_categories','Fem Prata','Fem Ouro'], 'número 1 antes de 13 no mesmo horário');
    await page.evaluate(() => {
      window._currentBracketTournament.matches[0].scheduledAt = '2026-11-14T14:00:00Z';
      window.__paint();
    });
    assert.deepEqual(await labels(), ['__all_categories','Fem Ouro','Fem Prata'], 'a categoria que passa a abrir a programação sobe');
    async function order(expectedOperations) {
      const result = await page.evaluate(() => {
        const detail = document.querySelector('#view-container');
        const nav = detail.querySelector('[data-bracket-tabs-root]');
        const selectors=['.sticky-back-header','#fbwrap-chaves','#tourn-grid-container','[data-bracket-operations-progress]',
          '[data-bracket-operations-strip]','[data-bracket-tabs-root]','[data-bracket-general-view]','#inline-bracket-container'];
        const nodes = selectors.map(s=>Array.from(detail.querySelectorAll(s)));
        const indices = nodes.filter(a=>a.length).map(([n])=>Array.from(detail.children).indexOf(n));
        return { ordered:indices.every((v,i)=>v>=0 && (!i || v>indices[i-1])), counts:nodes.map(a=>a.length),
          canonical:document.querySelector('#bracket-search')===window.__input && window.__input.value==='Raquel',
          slotsHidden:[...nav.querySelectorAll('[data-bracket-search-slot]')].every(s=>s.hidden && !s.children.length) };
      });
      assert(result.ordered && result.canonical && result.slotsHidden, JSON.stringify(result));
      assert.deepEqual(result.counts,[1,1,1,+expectedOperations,+expectedOperations,1,1,1]);
    }
    await order(true);
    const operationCategories = () => page.locator('[data-bracket-operations-strip] .sp-operations-replica')
      .evaluateAll(nodes => nodes.filter(node => !node.hidden)
        .map(node => node.getAttribute('data-bracket-tab-category')).filter(Boolean));
    const allOperationCategories = await operationCategories();
    assert(allOperationCategories.includes('Fem Ouro') && allOperationCategories.includes('Fem Prata'),
      'a fila inicial reúne as duas categorias');
    for (const category of ['Fem Ouro', 'Fem Prata']) {
      await page.locator('[data-bracket-subtab="' + category + '"]').click();
      assert.deepEqual(await operationCategories(), allOperationCategories,
        'aba ' + category + ' não filtra a linha de controle');
    }
    await page.locator('[data-bracket-subtab="__all_categories"]').click();
    await page.locator('#bracket-search').focus();
    assert(await page.locator('#bracket-search').evaluate(el=>el===document.activeElement));
    await page.evaluate(() => {
      const original = window._confirmMatchCourtCall;
      window.__courtClicks = 0;
      window._confirmMatchCourtCall = () => { window.__courtClicks++; window._confirmMatchCourtCall = original; };
    });
    const firstOperation = page.locator('.sp-operations-next .sp-match-operational').first();
    await firstOperation.locator('select').focus();
    await firstOperation.locator('button.sp-match-confirm').scrollIntoViewIfNeeded();
    const confirmBounds = await firstOperation.locator('button.sp-match-confirm').boundingBox();
    await page.mouse.move(confirmBounds.x + confirmBounds.width / 2, confirmBounds.y + confirmBounds.height / 2);
    await page.mouse.down();
    await page.evaluate(() => new Promise(resolve => setTimeout(() => {
      window._bracketOperationsRefresh(window._currentBracketTournament);
      resolve();
    }, 20)));
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__courtClicks), 1, 'refresh entre pressionar e soltar preserva o primeiro clique em OK');
    await page.evaluate(() => { window.scrollTo(0,0); window.__input.focus({preventScroll:true}); });
    const geometry = () => page.evaluate(() => {
      const bar=document.querySelector('#fbwrap-chaves'), nav=document.querySelector('[data-bracket-tabs-root]');
      const r=nav.getBoundingClientRect(), b=bar.getBoundingClientRect();
      return {top:r.top,bottom:b.bottom,clickable:bar.contains(document.elementFromPoint(b.left+20,b.top+10)),
        opaque:getComputedStyle(nav).backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          nav.contains(document.elementFromPoint(r.left+20,r.bottom-1))};
    });
    let box=await geometry();
    assert(box.top>box.bottom+150 && box.clickable,JSON.stringify(box));
    await page.evaluate(()=>window.scrollTo(0,900));
    await page.waitForFunction(()=>Math.abs(document.querySelector('[data-bracket-tabs-root]').getBoundingClientRect().top -
      document.querySelector('#fbwrap-chaves').getBoundingClientRect().bottom)<2);
    for (const [width,zoom,theme] of [[320,1,'dark'],[965,1.25,'light'],[1440,1,'dark']]) {
      await page.setViewportSize({width,height:800});
      await page.evaluate(([z,color]) => {
        document.documentElement.dataset.theme=color;
        document.body.style.zoom=z;
        document.querySelector('#fbwrap-chaves').style.paddingBottom=(z===1?9:32)+'px';
        const rail=document.querySelector('#inline-bracket-container .bracket-scroll-container');
        rail.scrollLeft=150;
        window.scrollTo(0,1900);
      },[zoom,theme]);
      await page.waitForFunction(()=>Math.abs(document.querySelector('[data-bracket-tabs-root]').getBoundingClientRect().top -
        document.querySelector('#fbwrap-chaves').getBoundingClientRect().bottom)<2);
      box=await geometry();
      assert(box.clickable && box.opaque,JSON.stringify(box));
    }
    await page.evaluate(async () => {
      const nav=document.querySelector('[data-bracket-tabs-root]');
      nav.querySelector('[data-bracket-subtab="Fem Ouro"]').click();
      nav.querySelector('[data-bracket-subtab="__general"]').click();
      let settle;
      window._confirmMatchCourtCall=()=>new Promise(r=>{settle=r;});
      nav._bracketOperationsStrip.querySelector('.sp-match-confirm').click();
      if (!settle) throw Error('chamada simulada não iniciou');
      window.__input.focus({preventScroll:true});
      for(let i=0;i<10;i++) window.__paint();
      settle();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    });
    await order(true);
    assert(await page.locator('#bracket-search').evaluate(el=>el===document.activeElement));
    await page.evaluate(()=>{
      window._bracketFocusOperationsStrip('fixture-detail','instant');
    });
    const stripGap=await page.evaluate(()=>document.querySelector('[data-bracket-operations-strip]').getBoundingClientRect().top-
      document.querySelector('#fbwrap-chaves').getBoundingClientRect().bottom);
    assert(Math.abs(stripGap-12)<2,String(stripGap));
    await page.evaluate(()=>{
      window.AppStore.currentUser.uid='viewer';
      window._bracketOperationsRefresh(window._currentBracketTournament);
    });
    await order(false);
    console.log('✓ toolbar, operação e abas em ordem; busca, sticky e foco preservados após dez remontagens');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
