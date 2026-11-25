const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

(async () => {
  const capture = path.join(os.tmpdir(), `scoreplace-tv-${process.pid}.html`);
  const customCapture = path.join(os.tmpdir(), `scoreplace-tv-custom-${process.pid}.html`);
  const camisCapture = path.join(os.tmpdir(), `scoreplace-tv-camis-${process.pid}.html`);
  const super8Idle=path.join(os.tmpdir(),`scoreplace-tv-super8-idle-${process.pid}.html`);
  const super8Single=path.join(os.tmpdir(),`scoreplace-tv-super8-single-${process.pid}.html`);
  const super8Advanced=path.join(os.tmpdir(),`scoreplace-tv-super8-advanced-${process.pid}.html`);
  const super8Capture = path.join(os.tmpdir(), `scoreplace-tv-super8-${process.pid}.html`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'tv-live-snapshot.test.js')], {
      env: { ...process.env, SP_TV_CAPTURE: capture, SP_TV_CAPTURE_CUSTOM: customCapture,
        SP_TV_CAPTURE_CAMIS: camisCapture, SP_TV_CAPTURE_SUPER8: super8Capture, SP_TV_CAPTURE_SUPER8_IDLE:super8Idle, SP_TV_CAPTURE_SUPER8_SINGLE:super8Single, SP_TV_CAPTURE_SUPER8_ADVANCED:super8Advanced }, stdio: 'pipe'
    });
    const html = fs.readFileSync(capture, 'utf8').replace(/<script src="[^"]*match-timing[^>]*><\/script>/, '');
    const browser = await chromium.launch();
    try {
      for (const viewport of [{ width: 2048, height: 1152 }, { width: 1440, height: 900 }]) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        // A fixture inclui QR externo fictício; "load" espera a rede sem acrescentar
        // evidência à geometria que este teste mede.
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
          document.querySelectorAll('.tv-team-tag,.tv-result-team').forEach(el => { el.textContent = 'BLACKOUT'; });
          document.querySelectorAll('.tv-upcoming .tv-result-players span').forEach(el => {
            el.textContent = 'Alessandra Feltrini Massa';
          });
          window.__tvFitLabels();
        });
        assert.deepEqual(errors, [], 'script da janela NO AR não falha no navegador');
        const measurement = await page.evaluate(() => {
          const inside = (el, parent) => {
            const a = el.getBoundingClientRect(), b = parent.getBoundingClientRect();
            return a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && a.left >= b.left - 1 && a.right <= b.right + 1;
          };
          return {
            labels: [...document.querySelectorAll('.tv-side .tv-team-tag,.tv-result-side .tv-result-team')]
              .filter(el => !inside(el, el.closest('.tv-side,.tv-result-side')) || el.scrollHeight > el.clientHeight + 1)
              .map(el => ({ text:el.textContent, kind:el.className, height:el.clientHeight, scroll:el.scrollHeight,
                parent:el.closest('.tv-side,.tv-result-side').clientHeight })),
            scores: [...document.querySelectorAll('.tv-side .tv-score')]
              .every(el => inside(el, el.closest('.tv-side'))),
            players: [...document.querySelectorAll('.tv-upcoming .tv-result-players')]
              .every(el => inside(el, el.closest('.tv-result-side'))),
            nextBorder:getComputedStyle(document.querySelector('.tv-upcoming-first')).borderTopColor,
            nextWidth:getComputedStyle(document.querySelector('.tv-upcoming-first')).borderTopWidth,
            upcomingFont: parseFloat(getComputedStyle(document.querySelector('.tv-upcoming .tv-result-players span')).fontSize)
          };
        });
        assert.equal(measurement.labels.length, 0, `etiquetas dos times ficam nos boxes em ${viewport.width}px: ${JSON.stringify(measurement.labels)}`);
        assert(measurement.scores, `placares ficam nos boxes em ${viewport.width}px`);
        assert(measurement.players, `atletas do próximo jogo ficam nos boxes em ${viewport.width}px`);
        assert.equal(measurement.nextBorder,'rgb(251, 191, 36)');assert.equal(measurement.nextWidth,'2px');
        assert(measurement.upcomingFont >= 10, 'nomes do próximo jogo seguem legíveis');
        if (viewport.width === 2048) {
          const pinned = await page.evaluate(() => {
            const root = document.getElementById('tv-root');
            const list = root.querySelector('.tv-results-list');
            const first = list.querySelector('.tv-result');
            for (let i = 0; i < 12; i++) {
              const copy = first.cloneNode(true);
              copy.classList.remove('tv-result-latest', 'tv-result-pinned');
              copy.removeAttribute('data-result-id');
              list.appendChild(copy);
            }
            first.setAttribute('data-result-id', 'fresh-visual-test');
            first.setAttribute('data-result-at', String(Date.now()));
            window.dispatchEvent(new Event('resize'));
            window.__tvReplaceMarkup(root.innerHTML);
            const active = root.querySelector('.tv-results-list');
            active.scrollTop = 150;
            const card = active.querySelector('.tv-result-latest');
            return { pinned:card.classList.contains('tv-result-pinned'),
              border:getComputedStyle(card).borderTopColor,
              position:getComputedStyle(card).position,
              top:card.getBoundingClientRect().top,
              listTop:active.getBoundingClientRect().top };
          });
          assert(pinned.pinned && pinned.position === 'sticky', 'último placar fica fixo durante a rolagem');
          assert.equal(pinned.border, 'rgb(251, 191, 36)', 'borda dourada usa a cor esperada');
          assert(Math.abs(pinned.top - pinned.listTop) < 2, 'card fixo permanece no topo da seção');
        }
        await page.close();
      }
      const customPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await customPage.setContent(fs.readFileSync(customCapture, 'utf8').replace(/<script src="[^"]*match-timing[^>]*><\/script>/, ''),
        { waitUntil: 'domcontentloaded' });
      const customBounds = await customPage.evaluate(() => ({
        board: document.querySelector('.tv-custom-board').getBoundingClientRect().toJSON(),
        courts: document.querySelector('.tv-custom-courts').getBoundingClientRect().toJSON()
      }));
      assert.equal(customBounds.board.height, 900, 'layout personalizado ocupa toda a altura');
      assert(customBounds.courts.height > 500, 'quadras personalizadas têm área visível');
      const fill = await customPage.evaluate(() => {
        const box = document.querySelector('.tv-custom-courts > .tv-courts');
        const cards = [...box.querySelectorAll('.tv-court')];
        const b = box.getBoundingClientRect(), last = cards[cards.length - 1].getBoundingClientRect();
        return { count:cards.length, gap:b.bottom - last.bottom,
          rowHeight:last.height, font:parseFloat(getComputedStyle(cards[0].querySelector('h2')).fontSize) };
      });
      assert.equal(fill.count, 6);
      assert(fill.gap < 15, 'última fileira alcança a borda inferior do box salvo');
      assert(fill.font >= 14, 'título da quadra permanece legível');
      await customPage.close();
      const camisPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const camisLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><ellipse cx="200" cy="200" rx="127" ry="196" fill="white"/></svg>');
      await camisPage.setContent(fs.readFileSync(camisCapture, 'utf8').replace(/<script src="[^"]*match-timing[^>]*><\/script>/, '')
        .replace('src="logo.png"', 'src="' + camisLogo + '"'),
        { waitUntil: 'domcontentloaded' });
      const camisBounds = await camisPage.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const board = rect('.tv-custom-board-event'), header = rect('.tv-custom-header');
        const courts = rect('.tv-custom-courts'), results = rect('.tv-custom-results');
        const upcoming = rect('.tv-custom-upcoming'), qrBox = rect('.tv-custom-qr');
        const logo = rect('.tv-qr-tournament-logo-event'), logoImage = rect('.tv-qr-tournament-logo-event-image');
        const qr = rect('.tv-qr-event .tv-qr-code');
        const brand = rect('.tv-qr-event .tv-qr-brand');
        return { boardRight:board.right, boardBottom:board.bottom, headerRight:header.right,
          resultsRight:results.right, courtsBottom:courts.bottom, upcomingBottom:upcoming.bottom,
          qrBottom:qrBox.bottom, brandBottom:brand.bottom, qrWidth:qr.width,
          logoWidth:logo.width,
          logoImageLeft:logoImage.left, logoImageRight:logoImage.right,
          logoLeft:logo.left, logoRight:logo.right,
          logoImageTop:logoImage.top, logoImageBottom:logoImage.bottom, logoTop:logo.top, logoBottom:logo.bottom,
          brandWidth:brand.width, upcomingWidth:upcoming.width,
          logoCenter:(logo.left+logo.right)/2,
          qrCenter:(qr.left+qr.right)/2, brandCenter:(brand.left+brand.right)/2,
          qrBoxCenter:(qrBox.left+qrBox.right)/2 };
      });
      assert(Math.abs(camisBounds.headerRight - camisBounds.boardRight) < 2,
        'cabeçalho CAMIS chega à borda direita');
      assert(Math.abs(camisBounds.resultsRight - camisBounds.boardRight) < 2,
        'resultados CAMIS chegam à borda direita');
      assert(Math.abs(camisBounds.courtsBottom - camisBounds.boardBottom) < 2 &&
        Math.abs(camisBounds.upcomingBottom - camisBounds.boardBottom) < 2,
      'quadras e próximos jogos CAMIS chegam à borda inferior');
      assert(Math.abs(camisBounds.qrBottom - camisBounds.boardBottom) < 2 &&
        Math.abs(camisBounds.brandBottom - camisBounds.upcomingBottom) < 2,
      'chamada Scoreplace alinha com a base de próximos jogos');
      assert(['logoCenter','qrCenter','brandCenter'].every(key =>
        Math.abs(camisBounds[key] - camisBounds.qrBoxCenter) < 2),
      `logo, QR e chamada ficam centralizados na coluna: ${JSON.stringify(camisBounds)}`);
      assert(camisBounds.qrWidth > 150 && camisBounds.logoWidth > 180 &&
        camisBounds.brandWidth > 150 && camisBounds.upcomingWidth < 430 &&
        camisBounds.logoImageLeft >= camisBounds.logoLeft - 1 &&
        camisBounds.logoImageRight <= camisBounds.logoRight + 1 &&
        camisBounds.logoImageTop >= camisBounds.logoTop - 1 &&
        camisBounds.logoImageBottom <= camisBounds.logoBottom + 1,
      'a imagem inteira do logo cabe na coluna sem corte: ' + JSON.stringify(camisBounds));
      await camisPage.close();
      for(const viewport of [{width:1920,height:1080},{width:3840,height:2160}]) {
        const super8Page=await browser.newPage({viewport});
        await super8Page.route('**/js/domain/match-timing.js*',route=>route.fulfill({path:path.join(__dirname,'../js/domain/match-timing.js'),contentType:'application/javascript'}));
        await super8Page.route('https://qr.example/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'}));
        await super8Page.setContent(fs.readFileSync(super8Capture,'utf8'),{waitUntil:'domcontentloaded'});
        await super8Page.emulateMedia({reducedMotion:'reduce'});
        const payload=html=>html.match(/<div id="tv-root">([\s\S]*?)<div id="tv-sponsor"/)[1].replace(/<\/div>$/,'');
        const fullMarkup=payload(fs.readFileSync(super8Capture,'utf8'));
        const singleMarkup=payload(fs.readFileSync(super8Single,'utf8'));
        const idleMarkup=payload(fs.readFileSync(super8Idle,'utf8'));
        const advancedMarkup=payload(fs.readFileSync(super8Advanced,'utf8'));
        // Simulate a surviving window with outdated head CSS: new markup brings its own rules.
        await super8Page.evaluate(()=>{
          const css=document.querySelector('[data-tv-super8-layout]').textContent;
          document.head.querySelectorAll('style').forEach(n=>n.textContent=n.textContent.replace(css,''));
          const old=document.createElement('style');old.textContent='.tv-super8-games.tv-series-games{grid-template-columns:1fr 1fr;overflow-y:hidden}';document.head.appendChild(old);
          document.querySelectorAll('.tv-super8-lane-header strong').forEach(n=>n.textContent='Tempo de jogo 00:00:30');
        });
        const geometry=await super8Page.evaluate(()=>{
          const rect=n=>n.getBoundingClientRect().toJSON();
          return {groups:[...document.querySelectorAll('.tv-super8-group')].map(rect),anchors:document.querySelectorAll('[data-tv-court]').length,
            clocks:document.querySelectorAll('.tv-super8-lane-header strong').length,innerClocks:document.querySelectorAll('.tv-super8-games [data-tv-start]').length,
            rows:[...document.querySelectorAll('.tv-super8-games')].map(n=>[...n.children].filter(c=>!c.hasAttribute('data-tv-loop-repeat')).length),
            rankings:document.querySelectorAll('.tv-rankings').length,results:rect(document.querySelector('.tv-custom-results')),upcoming:rect(document.querySelector('.tv-custom-upcoming')),
            headings:[...document.querySelectorAll('.tv-super8-lane-header')].map(n=>({title:rect(n.querySelector('h3')),time:rect(n.querySelector('strong')),head:rect(n)})),
            scrollCss:getComputedStyle(document.querySelector('.tv-super8-games')).overflowY};
        });
        assert.equal(geometry.groups.length,3);assert.equal(geometry.anchors,6);assert.equal(geometry.clocks,6);assert.equal(geometry.innerClocks,0);
        assert.deepEqual(geometry.rows,[7,7,7]);assert.equal(geometry.rankings,0);assert.equal(geometry.scrollCss,'auto','new layout CSS travels with markup into old window');
        assert(geometry.groups.every(g=>g.right<=geometry.results.left+2));assert(geometry.results.bottom<=geometry.upcoming.top+2);
        assert(geometry.headings.every(h=>h.title.right<=h.time.left+1&&Math.abs(h.time.right-h.head.right)<1),'header clocks remain at the right without overlap');
        const ordinal=await super8Page.evaluate(()=>{
          const b=document.querySelector('.tv-super8-games .tv-series-game>b'),n=b.querySelector('small'),r=document.createRange();r.selectNodeContents(n);
          const a=b.getBoundingClientRect(),t=r.getBoundingClientRect();return {large:parseFloat(getComputedStyle(n).fontSize)>parseFloat(getComputedStyle(b).fontSize),center:Math.abs((a.left+a.right-t.left-t.right)/2)};
        });
        assert(ordinal.large&&ordinal.center<1);
        const lists=super8Page.locator('.tv-super8-games');assert.equal(await lists.count(),3,'one scroll for both courts in each group');
        const headingTop=await super8Page.locator('.tv-super8-lane-header').first().evaluate(n=>n.getBoundingClientRect().top);
        for(const theme of ['dark','light']) {
          const border=await super8Page.evaluate(theme=>{document.documentElement.setAttribute('data-theme',theme);const n=document.querySelector('.tv-super8-round-called'),s=getComputedStyle(n);return {width:s.borderTopWidth,color:s.borderTopColor,outline:getComputedStyle(n.firstElementChild).outlineStyle};},theme);
          assert.equal(border.width,'2px');assert.equal(border.color,theme==='dark'?'rgb(74, 222, 128)':'rgb(34, 197, 94)');assert.equal(border.outline,'none');
        }
        const mirror=await super8Page.evaluate(()=>{
          const n=document.querySelector('.tv-series-right'),score=n.querySelector('strong').getBoundingClientRect(),name=n.querySelector('.tv-series-player-name').getBoundingClientRect(),photo=n.querySelector('.tv-player-photo').getBoundingClientRect();
          return {ordered:score.right<=name.left+1&&name.right<=photo.left+1,gold:getComputedStyle(document.querySelector('.tv-series-latest-update')).borderTopColor};
        });assert(mirror.ordered);assert.equal(mirror.gold,'rgb(251, 191, 36)');
        for(const theme of ['dark','light']) {
          const ratios=await super8Page.evaluate(theme=>{
            document.documentElement.setAttribute('data-theme',theme);const row=document.querySelector('.tv-super8-round-called'),game=row.firstElementChild,ctx=document.createElement('canvas').getContext('2d');
            const lum=c=>{ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);};
            const bg=lum(getComputedStyle(game).backgroundColor);return [getComputedStyle(row).borderTopColor,getComputedStyle(document.querySelector('.tv-series-latest-update')).borderTopColor].map(c=>{const fg=lum(c);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);});
          },theme);assert(ratios.every(r=>r>=3),'green and gold contrast in '+theme);
        }
        // Native border remains present while its original row is partially clipped at the top.
        const cut=await lists.first().evaluate(n=>{
          const row=n.querySelector('.tv-super8-round-called');window.__nativeRow=row;n.scrollTop=row.offsetTop+row.offsetHeight/2;
          const a=row.getBoundingClientRect(),v=n.getBoundingClientRect();return a.top<v.top&&a.bottom>v.top;
        });assert(cut);
        for(const delay of [0,40,140]) {
          if(delay)await super8Page.waitForTimeout(delay);
          assert(await lists.first().evaluate(n=>{const row=n.querySelector('.tv-super8-round-called');return row===window.__nativeRow&&getComputedStyle(row).borderTopWidth==='2px'&&row.isConnected;}),'called border is not removed by partial visibility or 100ms timer');
        }
        if(process.env.SP_TV_SCREENSHOT_DIR)await super8Page.screenshot({path:path.join(process.env.SP_TV_SCREENSHOT_DIR,`native-top-${viewport.width}.png`)});
        const bottomCut=await lists.first().evaluate(n=>{
          const row=n.querySelector('[data-tv-loop-repeat].tv-super8-round-called');n.scrollTop=row.offsetTop-n.firstElementChild.offsetTop-n.clientHeight+row.offsetHeight/2;
          const a=row.getBoundingClientRect(),v=n.getBoundingClientRect();return {cut:a.top<v.bottom&&a.bottom>v.bottom,width:getComputedStyle(row).borderBottomWidth,ids:row.querySelectorAll('[id]').length};
        });assert(bottomCut.cut);assert.equal(bottomCut.width,'2px');assert.equal(bottomCut.ids,0);
        if(process.env.SP_TV_SCREENSHOT_DIR)await super8Page.screenshot({path:path.join(process.env.SP_TV_SCREENSHOT_DIR,`native-bottom-${viewport.width}.png`)});
        assert.equal(await super8Page.locator('.tv-super8-active-frame').count(),0,'no detached geometry overlay remains');
        await lists.first().evaluate(n=>{n.scrollTop=45;});await lists.nth(1).evaluate(n=>{n.scrollTop=135;});
        assert.equal(await super8Page.locator('.tv-super8-lane-header').first().evaluate(n=>n.getBoundingClientRect().top),headingTop);
        const alignment=await lists.first().evaluate(n=>[...n.querySelectorAll('.tv-super8-round')].every(row=>{const c=row.querySelectorAll('.tv-series-game');return c.length!==2||Math.abs(c[0].getBoundingClientRect().top-c[1].getBoundingClientRect().top)<.1;}));assert(alignment,'same-round games cannot drift in one shared row');
        await super8Page.evaluate(()=>window.dispatchEvent(new Event('resize')));assert.equal(await lists.first().evaluate(n=>n.scrollTop),45);
        await super8Page.evaluate(()=>window.dispatchEvent(new Event('load')));assert.equal(await lists.nth(1).evaluate(n=>n.scrollTop),135,'groups stay independent');
        await super8Page.evaluate(()=>{
          const draft=document.getElementById('tv-root').cloneNode(true);draft.querySelectorAll('[data-tv-loop-repeat],[data-tv-repeat]').forEach(n=>n.remove());draft.querySelector('.tv-series-side strong').textContent='5';window.__tvReplaceMarkup(draft.innerHTML);
        });assert.equal(await lists.first().evaluate(n=>n.scrollTop),45,'score refresh preserves position');
        await super8Page.evaluate(html=>window.__tvReplaceMarkup(html),singleMarkup);
        assert.equal(await lists.count(),1);assert.equal(await lists.first().evaluate(n=>n.scrollTop),45,'releasing a partner preserves the shared position');
        assert.equal(await super8Page.locator('.tv-super8-free-label').count(),5);assert.equal(await super8Page.locator('.tv-super8-lane-header strong').count(),1);
        assert.equal(await super8Page.locator('.tv-super8-round-called').count(),0,'one active court has only a cell outline');
        assert.equal(await super8Page.locator('.tv-series-game:not([data-tv-loop-repeat])').count(),14,'one called lane has seven originals plus seven loop copies');
        await lists.first().evaluate(n=>n.scrollTop=250);
        await super8Page.evaluate(html=>window.__tvReplaceMarkup(html),fullMarkup);
        assert.equal(await lists.first().evaluate(n=>n.scrollTop),0,'late second call anchors both courts at the smallest active round');
        await super8Page.evaluate(html=>window.__tvReplaceMarkup(html),advancedMarkup);
        const advanced=await lists.first().evaluate(n=>{const row=n.querySelector('.tv-super8-round-current'),v=n.getBoundingClientRect();return {round:row.getAttribute('data-super8-row'),delta:row.getBoundingClientRect().top-v.top};});
        assert.equal(advanced.round,'3');assert(Math.abs(advanced.delta)<=5);
        await super8Page.evaluate(html=>window.__tvReplaceMarkup(html),idleMarkup);
        assert.equal(await lists.count(),0);assert.equal(await super8Page.locator('.tv-super8-free-label').count(),6);assert.equal(await super8Page.locator('.tv-series-game').count(),0);
        await super8Page.evaluate(html=>window.__tvReplaceMarkup(html),advancedMarkup);
        assert.equal(await lists.first().evaluate(n=>n.querySelector('.tv-super8-round-current').getAttribute('data-super8-row')),'3','a call after all courts were idle starts at its actual active round');

        await super8Page.evaluate(html=>window.__tvReplaceMarkup(html),fullMarkup);
        await lists.first().evaluate(n=>{const copy=n.querySelector('[data-tv-loop-repeat]');n.scrollTop=copy.offsetTop-n.firstElementChild.offsetTop-2;});
        await super8Page.evaluate(()=>window.dispatchEvent(new Event('resize')));
        await super8Page.emulateMedia({reducedMotion:'no-preference'});
        await super8Page.waitForFunction(()=>document.querySelector('.tv-super8-games').scrollTop<30,{},{timeout:3000});
        const samples=await super8Page.evaluate(()=>new Promise(resolve=>{const out=[];function step(){const n=document.querySelector('.tv-super8-games'),row=n.querySelector('.tv-super8-round-called'),card=row.firstElementChild;out.push({top:n.scrollTop,delta:card.getBoundingClientRect().top-row.getBoundingClientRect().top,border:getComputedStyle(row).borderTopWidth});if(out.length<12)requestAnimationFrame(step);else resolve(out);}requestAnimationFrame(step);}));
        assert(samples.at(-1).top>samples[0].top);assert(samples.every(s=>Math.abs(s.delta-2)<.2&&s.border==='2px'),'border and cards move together on every frame');
        const beforeWheel=await lists.first().evaluate(n=>n.scrollTop);
        await lists.first().hover();await super8Page.mouse.wheel(0,70);await super8Page.waitForTimeout(100);
        assert(await lists.first().evaluate(n=>n.scrollTop)>beforeWheel+50,'automatic motion respects a manual wheel input instead of snapping back');
        await super8Page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});});
        const hidden=await lists.first().evaluate(n=>n.scrollTop);await super8Page.waitForTimeout(150);assert.equal(await lists.first().evaluate(n=>n.scrollTop),hidden);
        await super8Page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});
        await super8Page.emulateMedia({reducedMotion:'reduce'});
        await lists.first().evaluate(n=>n.scrollTop=0);
        if(process.env.SP_TV_SCREENSHOT_DIR)await super8Page.screenshot({path:path.join(process.env.SP_TV_SCREENSHOT_DIR,`super8-${viewport.width}.png`)});
        await super8Page.close();
      }
    } finally { await browser.close(); }
    console.log('✓ TV: etiquetas, placares e próximo jogo contidos nos boxes');
  } finally { try { fs.unlinkSync(capture); } catch (_) {} try { fs.unlinkSync(customCapture); } catch (_) {} try { fs.unlinkSync(camisCapture); } catch (_) {} try { fs.unlinkSync(super8Capture); } catch (_) {} try { fs.unlinkSync(super8Single); } catch (_) {} try { fs.unlinkSync(super8Idle); } catch (_) {} try { fs.unlinkSync(super8Advanced); } catch (_) {} }
})().catch(error => { console.error(error); process.exitCode = 1; });
