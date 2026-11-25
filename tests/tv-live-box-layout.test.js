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
  const super8Capture = path.join(os.tmpdir(), `scoreplace-tv-super8-${process.pid}.html`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'tv-live-snapshot.test.js')], {
      env: { ...process.env, SP_TV_CAPTURE: capture, SP_TV_CAPTURE_CUSTOM: customCapture,
        SP_TV_CAPTURE_CAMIS: camisCapture, SP_TV_CAPTURE_SUPER8: super8Capture }, stdio: 'pipe'
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
        const headers=await super8Page.evaluate(()=>{
          const rect=n=>n.getBoundingClientRect();
          return [...document.querySelectorAll('.tv-super8-lane-header')].map(head=>{
            const title=head.querySelector('h3'),timer=head.querySelector('strong');timer.textContent='Tempo de jogo 00:00:30';
            const box=rect(head),a=rect(title),b=rect(timer);
            return {noOverlap:a.right<=b.left+1,right:Math.abs(b.right-box.right),top:Math.abs(a.top-b.top),height:box.height};
          });
        });
        assert.equal(headers.length,6);assert(headers.every(h=>h.noOverlap&&h.right<1&&h.top<8),'six clocks fit at the right of their fixed court headings');
        assert.equal(await super8Page.locator('.tv-super8-games [data-tv-start]').count(),0,'no duplicated clock in cards or loop copies');
        const ordinal=await super8Page.evaluate(()=>{
          const b=document.querySelector('.tv-super8-games .tv-series-game>b'),small=b.querySelector('small'),range=document.createRange();range.selectNodeContents(small);
          const a=b.getBoundingClientRect(),r=range.getBoundingClientRect();
          return {title:parseFloat(getComputedStyle(b).fontSize),counter:parseFloat(getComputedStyle(small).fontSize),offset:Math.abs((a.left+a.right-r.left-r.right)/2)};
        });
        assert(ordinal.counter>ordinal.title&&ordinal.offset<1,'round counter is larger and centered under JOGO X');
        // A late second call joins the current round, even after the first lane has scrolled.
        await super8Page.evaluate(()=>{
          const root=document.getElementById('tv-root'),draft=root.cloneNode(true);
          draft.querySelectorAll('[data-tv-loop-repeat],[data-tv-repeat],.tv-super8-active-frame').forEach(n=>n.remove());
          window.__testFullSuper8=draft.innerHTML;
          const lane=draft.querySelector('.tv-super8-group').querySelectorAll('.tv-super8-lane')[1];
          lane.querySelector('.tv-super8-games').remove();lane.querySelector('strong').remove();lane.classList.add('tv-super8-free');lane.insertAdjacentHTML('beforeend','<p>Livre</p>');
          window.__tvReplaceMarkup(draft.innerHTML);
          document.querySelector('.tv-super8-games').scrollTop=250;
        });
        await super8Page.waitForTimeout(80);
        await super8Page.evaluate(()=>window.__tvReplaceMarkup(window.__testFullSuper8));
        await super8Page.waitForTimeout(150);
        const joined=await super8Page.evaluate(()=>[...document.querySelector('.tv-super8-group').querySelectorAll('.tv-super8-games')].map(n=>n.scrollTop));
        assert(joined.every(y=>Math.abs(y)<1),'second court joins round one rather than a later round of its partner');
        const geometry=await super8Page.evaluate(()=>{
          const rect=el=>el.getBoundingClientRect().toJSON();
          const groups=[...document.querySelectorAll('.tv-super8-group')];
          return {groups:groups.map(rect),results:rect(document.querySelector('.tv-custom-results')),
            upcoming:rect(document.querySelector('.tv-custom-upcoming')),rankings:document.querySelectorAll('.tv-rankings').length,
            anchors:document.querySelectorAll('[data-tv-court]').length,
            clipped:groups.flatMap(group=>[...group.querySelectorAll('.tv-series-game')].filter(game=>{
              const a=rect(game),b=rect(group);return a.bottom>b.bottom+1||a.right>b.right+1;
            })).length};
        });
        assert.equal(geometry.groups.length,3,'three paired-court blocks');
        assert.equal(geometry.anchors,6,'all six sponsor targets remain');
        assert.equal(geometry.rankings,0,'no classification panel on the Super8 default');
        assert(geometry.groups.every(g=>g.right<=geometry.results.left+2),'groups left of results');
        assert(geometry.results.bottom<=geometry.upcoming.top+2,'latest results above upcoming');
        assert(geometry.groups[0].bottom<=geometry.groups[1].top+1 && geometry.groups[1].bottom<=geometry.groups[2].top+1,'groups stacked vertically');
        const mirror=await super8Page.evaluate(()=>{
          const rect=el=>el.getBoundingClientRect();
          const side=document.querySelector('.tv-super8-games .tv-series-right');
          const score=side.querySelector('strong'),name=side.querySelector('.tv-series-player-name'),icon=side.querySelector('.tv-player-photo');
          const next=document.querySelector('.tv-upcoming-first');
          const updated=document.querySelector('.tv-series-latest-update');
          return {score:rect(score).right,name:rect(name).left,icon:rect(icon).left,nameRight:rect(name).right,

            updatedBorder:getComputedStyle(updated).borderTopColor};
        });
        assert(mirror.score<=mirror.name+1 && mirror.nameRight<=mirror.icon+1,'right side mirrors score → names → avatars');
        assert.equal(mirror.updatedBorder,'rgb(251, 191, 36)');
        await super8Page.emulateMedia({reducedMotion:'reduce'});
        await super8Page.evaluate(()=>document.querySelectorAll('.tv-super8-games').forEach(n=>n.scrollTop=0));
        await super8Page.waitForTimeout(150);
        const frame=await super8Page.evaluate(()=>{
          const group=document.querySelector('.tv-super8-group'),frame=group.querySelector('.tv-super8-active-frame');
          const cards=[...group.querySelectorAll('.tv-series-active')].filter(n=>!n.closest('[data-tv-loop-repeat]'));
          const r=frame.getBoundingClientRect(),a=cards[0].getBoundingClientRect(),b=cards[1].getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,a:{left:a.left,top:a.top,bottom:a.bottom},b:{right:b.right},border:getComputedStyle(frame).borderTopColor};
        });
        assert.equal(await super8Page.locator('.tv-super8-group').first().locator('.tv-super8-in-frame').count(),2,'single frame joins both games without inner green borders');
        assert(frame.left<=frame.a.left && frame.right>=frame.b.right && frame.top<=frame.a.top && frame.bottom>=frame.a.bottom,'one green frame encloses both called matches');
        for(const theme of ['dark','light']) {
          const contrasts=await super8Page.evaluate(theme=>{
            document.documentElement.setAttribute('data-theme',theme);
            const card=document.querySelector('.tv-super8-games .tv-series-active'),frame=document.querySelector('.tv-super8-active-frame');
            const ctx=document.createElement('canvas').getContext('2d');
            const lum=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);};
            const background=lum(getComputedStyle(card).backgroundColor);
            return [getComputedStyle(frame).borderTopColor,getComputedStyle(document.querySelector('.tv-series-latest-update')).borderTopColor].map(c=>{const l=lum(c);return (Math.max(l,background)+.05)/(Math.min(l,background)+.05);});
          },theme);
          assert(contrasts.every(r=>r>=3),'green and gold contrast against adjacent background in '+theme+': '+contrasts);
        }
        await super8Page.evaluate(()=>{document.querySelectorAll('.tv-super8-games')[1].scrollTop=45;});
        await super8Page.waitForTimeout(150);
        assert.equal(await super8Page.locator('.tv-super8-group').first().locator('.tv-super8-active-frame').count(),0,'partially clipped called games have no misleading frame');
        await super8Page.evaluate(()=>{document.querySelectorAll('.tv-super8-games').forEach(n=>n.scrollTop=0);document.querySelectorAll('.tv-super8-games')[1].querySelectorAll('.tv-series-active').forEach(n=>n.classList.remove('tv-series-active'));});
        await super8Page.waitForTimeout(150);
        assert.equal(await super8Page.locator('.tv-super8-group').first().locator('.tv-super8-active-frame').count(),0,'releasing one lane removes the paired frame');
        await super8Page.evaluate(()=>document.querySelectorAll('.tv-super8-games')[1].querySelectorAll('[data-super8-round="1"]').forEach(n=>n.classList.add('tv-series-active')));
        await super8Page.emulateMedia({reducedMotion:'no-preference'});
        const lanes=super8Page.locator('.tv-super8-games');
        assert.equal(await lanes.count(),6,'six independent court columns');
        const scrolling=await super8Page.evaluate(()=>[...document.querySelectorAll('.tv-super8-games')].map(node=>({
          originals:[...node.children].filter(n=>!n.hasAttribute('data-tv-loop-repeat')).length,
          height:node.clientHeight,scroll:node.scrollHeight,top:node.scrollTop,
          key:node.getAttribute('data-tv-autoscroll')
        })));
        assert(scrolling.every(l=>l.originals===7 && l.scroll>l.height+20),'seven ordered games scroll within each court');
        await super8Page.waitForTimeout(400);
        const moved=await lanes.first().evaluate(node=>node.scrollTop);
        assert(moved>0,'court scroll advances automatically');
        const synchronized=await super8Page.evaluate(()=>[...document.querySelector('.tv-super8-group').querySelectorAll('.tv-super8-games')].map(n=>n.scrollTop));
        assert(Math.abs(synchronized[0]-synchronized[1])<1,'automatic scrolling keeps both courts aligned');
        await super8Page.emulateMedia({reducedMotion:'reduce'});
        const headingTop=await super8Page.locator('.tv-super8-lane-header').first().evaluate(n=>n.getBoundingClientRect().top);
        await lanes.first().evaluate(node=>{node.scrollTop=110;});
        await super8Page.waitForTimeout(100);
        assert.equal(await lanes.nth(1).evaluate(n=>n.scrollTop),110,'manual scrolling mirrors to the paired court');
        await lanes.nth(1).evaluate(node=>{node.scrollTop=45;});
        await super8Page.waitForTimeout(100);
        assert.equal(await lanes.first().evaluate(n=>n.scrollTop),45,'the second court can also lead the shared scroll');
        assert.equal(await lanes.nth(1).evaluate(n=>n.scrollTop),45);
        assert.equal(await super8Page.locator('.tv-super8-lane-header').first().evaluate(n=>n.getBoundingClientRect().top),headingTop,'header clock remains fixed while games scroll');
        await lanes.nth(2).evaluate(node=>{node.scrollTop=135;});
        await super8Page.waitForTimeout(100);
        assert.equal(await lanes.nth(3).evaluate(n=>n.scrollTop),135,'another group has its own shared position');
        assert.equal(await lanes.first().evaluate(n=>n.scrollTop),45,'groups remain independent');
        await super8Page.evaluate(()=>window.dispatchEvent(new Event('resize')));
        assert.equal(await lanes.first().evaluate(n=>n.scrollTop),45,'resize preserves the shared court position');
        assert.equal(await lanes.nth(1).evaluate(n=>n.scrollTop),45);
        await super8Page.evaluate(()=>window.dispatchEvent(new Event('load')));
        assert.equal(await lanes.first().evaluate(n=>n.scrollTop),45,'load preserves the shared position');
        await super8Page.evaluate(()=>{
          const root=document.getElementById('tv-root'),draft=root.cloneNode(true);
          draft.querySelectorAll('[data-tv-loop-repeat],[data-tv-repeat]').forEach(n=>n.remove());
          draft.querySelector('.tv-super8-games .tv-series-side strong').textContent='5';
          window.__tvReplaceMarkup(draft.innerHTML);
        });
        assert(Math.abs(await lanes.first().evaluate(n=>n.scrollTop)-45)<2,'score update preserves the shared court scroll');
        assert(Math.abs(await lanes.nth(1).evaluate(n=>n.scrollTop)-45)<2,'score update preserves the second court scroll');
        await super8Page.evaluate(()=>{
          const root=document.getElementById('tv-root'),draft=root.cloneNode(true);
          draft.querySelectorAll('[data-tv-loop-repeat],[data-tv-repeat],.tv-super8-active-frame').forEach(n=>n.remove());
          window.__testPairedMarkup=draft.innerHTML;
          const lane=draft.querySelector('.tv-super8-group').querySelectorAll('.tv-super8-lane')[1];
          lane.querySelector('.tv-super8-games').remove();lane.querySelector('strong').remove();lane.classList.add('tv-super8-free');lane.insertAdjacentHTML('beforeend','<p>Livre</p>');
          window.__tvReplaceMarkup(draft.innerHTML);
        });
        assert(Math.abs(await lanes.first().evaluate(n=>n.scrollTop)-45)<2,'releasing the partner preserves the remaining court position');
        assert.equal(await super8Page.locator('.tv-super8-group').first().locator('[data-tv-start]').count(),1,'released court has no stale clock');
        await super8Page.emulateMedia({reducedMotion:'no-preference'});
        await super8Page.waitForTimeout(200);
        assert(await lanes.first().evaluate(n=>n.scrollTop)>45,'single remaining court continues scrolling');
        await super8Page.emulateMedia({reducedMotion:'reduce'});
        await super8Page.evaluate(()=>window.__tvReplaceMarkup(window.__testPairedMarkup));
        // Unequal round sequences cannot drift around different wrap cycles.
        await super8Page.evaluate(()=>{
          const draft=document.createElement('div');draft.innerHTML=window.__testPairedMarkup;
          draft.querySelector('.tv-super8-group').querySelectorAll('.tv-super8-games')[1].lastElementChild.remove();
          window.__tvReplaceMarkup(draft.innerHTML);
        });
        const paused=await lanes.first().evaluate(n=>n.scrollTop);
        await super8Page.emulateMedia({reducedMotion:'no-preference'});
        await super8Page.waitForTimeout(200);
        const pausedState=await super8Page.evaluate(()=>[...document.querySelectorAll('.tv-super8-games')].map(n=>({top:n.scrollTop,originals:[...n.children].filter(c=>!c.hasAttribute('data-tv-loop-repeat')).map(c=>c.getAttribute('data-super8-round')),cycle:n.querySelector('[data-tv-loop-repeat]')?.offsetTop-n.firstElementChild.offsetTop})));
        assert.equal(pausedState[0].top,paused,'inconsistent pair waits for a complete refresh: '+JSON.stringify(pausedState));
        await super8Page.emulateMedia({reducedMotion:'reduce'});
        await super8Page.evaluate(()=>window.__tvReplaceMarkup(window.__testPairedMarkup));
        await lanes.first().evaluate(n=>{const copy=n.querySelector('[data-tv-loop-repeat]');n.scrollTop=copy.offsetTop-n.firstElementChild.offsetTop-2;});
        await super8Page.waitForTimeout(100);
        await super8Page.emulateMedia({reducedMotion:'no-preference'});
        await super8Page.waitForTimeout(300);
        const wrapped=await super8Page.evaluate(()=>[...document.querySelector('.tv-super8-group').querySelectorAll('.tv-super8-games')].map(n=>n.scrollTop));
        assert(wrapped.every(y=>y<30)&&Math.abs(wrapped[0]-wrapped[1])<1,'both courts wrap together without drifting');
        await super8Page.emulateMedia({reducedMotion:'reduce'});
        await super8Page.evaluate(()=>{
          const draft=document.createElement('div');draft.innerHTML=window.__testPairedMarkup;
          draft.querySelector('.tv-super8-group').querySelectorAll('.tv-series-active').forEach(n=>n.classList.remove('tv-series-active'));
          draft.querySelector('.tv-super8-group').querySelectorAll('[data-super8-round="2"]').forEach(n=>n.classList.add('tv-series-active'));
          window.__tvReplaceMarkup(draft.innerHTML);
        });
        const activeRound=await super8Page.evaluate(()=>[...document.querySelector('.tv-super8-group').querySelectorAll('.tv-super8-games')].map(n=>{
          const card=n.querySelector('[data-super8-round="2"]');return card.getBoundingClientRect().top-n.getBoundingClientRect().top;
        }));
        assert(activeRound.every(y=>Math.abs(y)<=5)&&Math.abs(activeRound[0]-activeRound[1])<1,'new active round anchors the same row in both courts');
        await super8Page.evaluate(()=>window.__tvReplaceMarkup(window.__testPairedMarkup));
        await super8Page.evaluate(()=>{
          const root=document.getElementById('tv-root'),draft=root.cloneNode(true);
          draft.querySelectorAll('[data-tv-loop-repeat],[data-tv-repeat]').forEach(n=>n.remove());
          draft.querySelectorAll('.tv-super8-games').forEach(n=>n.setAttribute('data-tv-autoscroll',n.getAttribute('data-tv-autoscroll')+':next-group'));
          window.__tvReplaceMarkup(draft.innerHTML);
        });
        assert.equal(await lanes.first().evaluate(n=>n.scrollTop),0,'next group starts at the beginning');
        if(process.env.SP_TV_SCREENSHOT_DIR)await super8Page.screenshot({path:path.join(process.env.SP_TV_SCREENSHOT_DIR,`super8-${viewport.width}.png`)});
        await super8Page.close();
      }
    } finally { await browser.close(); }
    console.log('✓ TV: etiquetas, placares e próximo jogo contidos nos boxes');
  } finally { try { fs.unlinkSync(capture); } catch (_) {} try { fs.unlinkSync(customCapture); } catch (_) {} try { fs.unlinkSync(camisCapture); } catch (_) {} try { fs.unlinkSync(super8Capture); } catch (_) {} }
})().catch(error => { console.error(error); process.exitCode = 1; });
