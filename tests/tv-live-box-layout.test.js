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
        const page=await browser.newPage({viewport});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.route('**/js/domain/match-timing.js*',route=>route.fulfill({path:path.join(__dirname,'../js/domain/match-timing.js'),contentType:'application/javascript'}));
        await page.route('https://qr.example/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'}));
        await page.setContent(fs.readFileSync(super8Capture,'utf8'),{waitUntil:'domcontentloaded'});
        const payload=html=>html.match(/<div id="tv-root">([\s\S]*?)<div id="tv-sponsor"/)[1].replace(/<\/div>$/,'');
        const full=payload(fs.readFileSync(super8Capture,'utf8')),single=payload(fs.readFileSync(super8Single,'utf8')),
          idle=payload(fs.readFileSync(super8Idle,'utf8')),advanced=payload(fs.readFileSync(super8Advanced,'utf8'));
        await page.evaluate(()=>{
          const css=document.querySelector('[data-tv-super8-layout]').textContent;
          document.head.querySelectorAll('style').forEach(n=>n.textContent=n.textContent.replace(css,''));
          const old=document.createElement('style');old.textContent='.tv-super8-games.tv-series-games{overflow-y:auto}';document.head.appendChild(old);
          document.querySelectorAll('.tv-super8-lane-header strong').forEach(n=>n.textContent='Tempo de jogo 00:00:30');
          document.querySelectorAll('.tv-super8-standing td:nth-child(2)').forEach(n=>n.textContent='Atleta Sobrenome Composto');
        });
        const geometry=await page.evaluate(()=>{
          const rect=n=>n.getBoundingClientRect().toJSON();
          return {groups:[...document.querySelectorAll('.tv-super8-group')].map(rect),anchors:document.querySelectorAll('[data-tv-court]').length,
            clocks:document.querySelectorAll('.tv-super8-lane-header strong').length,innerClocks:document.querySelectorAll('.tv-super8-games [data-tv-start]').length,
            cards:[...document.querySelectorAll('.tv-super8-games')].map(n=>n.querySelectorAll('.tv-series-game').length),
            rows:[...document.querySelectorAll('.tv-super8-standing tbody')].map(n=>n.children.length),
            tables:[...document.querySelectorAll('.tv-super8-standing')].map(n=>({box:rect(n),table:rect(n.querySelector('table')),play:rect(n.previousElementSibling),foot:rect(n.querySelector('p'))})),
            results:rect(document.querySelector('.tv-custom-results')),upcoming:rect(document.querySelector('.tv-custom-upcoming')),
            headings:[...document.querySelectorAll('.tv-super8-lane-header')].map(n=>({title:rect(n.querySelector('h3')),time:rect(n.querySelector('strong')),head:rect(n)})),
            loops:document.querySelectorAll('[data-tv-autoscroll^="super8:"],[data-tv-loop-repeat]').length,
            scrolls:[...document.querySelectorAll('.tv-super8-games')].map(n=>({height:n.clientHeight,scroll:n.scrollHeight,top:n.scrollTop}))};
        });
        assert.equal(geometry.groups.length,3);assert.equal(geometry.anchors,6);assert.equal(geometry.clocks,6);assert.equal(geometry.innerClocks,0);
        assert.deepEqual(geometry.cards,[4,4,4]);assert.deepEqual(geometry.rows,[8,8,8]);assert.equal(geometry.loops,0);
        assert(geometry.tables.every(t=>t.table.right<=t.box.right+1&&t.foot.bottom<=t.box.bottom+1&&t.play.right<t.box.left),'eight rows and footer fit beside their own group games');
        assert(geometry.scrolls.every(n=>n.scroll<=n.height+1&&n.top===0),'two slots fit without a scroll');
        assert(geometry.groups.every(g=>g.right<=geometry.results.left+2));assert(geometry.results.bottom<=geometry.upcoming.top+2);
        assert(geometry.headings.every(h=>h.title.right<=h.time.left+1&&Math.abs(h.time.right-h.head.right)<1),'header clocks remain right aligned');
        const ordinal=await page.evaluate(()=>{
          const b=document.querySelector('.tv-series-game>b'),n=b.querySelector('small'),r=document.createRange();r.selectNodeContents(n);
          const a=b.getBoundingClientRect(),t=r.getBoundingClientRect();return {large:parseFloat(getComputedStyle(n).fontSize)>parseFloat(getComputedStyle(b).fontSize),center:Math.abs((a.left+a.right-t.left-t.right)/2)};
        });assert(ordinal.large&&ordinal.center<1);
        for(const theme of ['dark','light']) {
          const border=await page.evaluate(theme=>{document.documentElement.setAttribute('data-theme',theme);const n=document.querySelector('.tv-super8-round-called'),s=getComputedStyle(n);return {width:s.borderTopWidth,color:s.borderTopColor,outline:getComputedStyle(n.firstElementChild).outlineStyle};},theme);
          assert.equal(border.width,'2px');assert.equal(border.color,theme==='dark'?'rgb(74, 222, 128)':'rgb(34, 197, 94)');assert.equal(border.outline,'none');
        }
        const mirror=await page.evaluate(()=>{
          const n=document.querySelector('.tv-series-right'),score=n.querySelector('strong').getBoundingClientRect(),name=n.querySelector('.tv-series-player-name').getBoundingClientRect(),photo=n.querySelector('.tv-player-photo').getBoundingClientRect();
          return {ordered:score.right<=name.left+1&&name.right<=photo.left+1,gold:getComputedStyle(document.querySelector('.tv-series-latest-update')).borderTopColor};
        });assert(mirror.ordered);assert.equal(mirror.gold,'rgb(251, 191, 36)');
        const top=await page.locator('.tv-super8-round-called').first().evaluate(n=>n.getBoundingClientRect().top);
        await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(220);
        assert.equal(await page.locator('.tv-super8-round-called').first().evaluate(n=>n.getBoundingClientRect().top),top,'current games and native border never jump or auto-scroll');
        assert.equal(await page.locator('.tv-super8-active-frame').count(),0);
        await page.evaluate(html=>window.__tvReplaceMarkup(html),single);
        assert.equal(await page.locator('.tv-super8-free-label').count(),5);assert.equal(await page.locator('.tv-super8-lane-header strong').count(),1);
        assert.equal(await page.locator('.tv-super8-round-called').count(),0);assert.equal(await page.locator('.tv-series-active').count(),1);
        await page.evaluate(html=>window.__tvReplaceMarkup(html),full);
        assert.equal(await page.locator('.tv-super8-round-called').count(),3,'late second call pairs current games on the same row');
        await page.evaluate(html=>window.__tvReplaceMarkup(html),advanced);
        assert.deepEqual(await page.locator('.tv-series-active>b small').allTextContents(),Array(6).fill('(3/7)'));
        assert.deepEqual(await page.locator('.tv-super8-next .tv-series-game>b small').allTextContents(),Array(6).fill('(4/7)'));
        await page.evaluate(html=>window.__tvReplaceMarkup(html),idle);
        assert.equal(await page.locator('.tv-super8-free-label').count(),6);assert.equal(await page.locator('.tv-series-active').count(),0);
        assert.equal(await page.locator('.tv-super8-standing tbody tr').count(),24);
        await page.evaluate(html=>window.__tvReplaceMarkup(html),full);
        await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
        assert.equal(await page.locator('[data-tv-autoscroll^="super8:"],[data-tv-loop-repeat]').count(),0);
        assert.deepEqual(errors,[]);
        if(process.env.SP_TV_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SP_TV_SCREENSHOT_DIR,`super8-${viewport.width}.png`)});
        await page.close();
      }
    } finally { await browser.close(); }
    console.log('✓ TV: etiquetas, placares e próximo jogo contidos nos boxes');
  } finally { try { fs.unlinkSync(capture); } catch (_) {} try { fs.unlinkSync(customCapture); } catch (_) {} try { fs.unlinkSync(camisCapture); } catch (_) {} try { fs.unlinkSync(super8Capture); } catch (_) {} try { fs.unlinkSync(super8Single); } catch (_) {} try { fs.unlinkSync(super8Idle); } catch (_) {} try { fs.unlinkSync(super8Advanced); } catch (_) {} }
})().catch(error => { console.error(error); process.exitCode = 1; });
