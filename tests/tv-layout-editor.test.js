'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.setContent('<div id="form"><details id="tv-personalization"><summary>Personalização</summary><div id="tv-layout-editor"></div></details><div id="visibility">Visibilidade</div><div id="fase1-box">Formato</div></div>');
    const source = file => path.join(__dirname, '../js/', file);
    await page.addScriptTag({ path: source('domain/match-day.js') });
    await page.addScriptTag({ path: source('domain/match-timing.js') });
    await page.addScriptTag({ path: source('domain/team-competition.js') });
    await page.addScriptTag({ path: source('tv-layout-core.js') });
    await page.evaluate(() => {
      window._collectAllMatches = t => t.matches;
      window._assignGlobalGameNumbers = t => t.matches.forEach(m => { m._gameNum = 49; });
      window.ScoreplaceNextMatch = { knownSide: () => true, firstAvailable: () => null };
      window._dashboardNextMatchCompare = () => 0;
      window._qrCodeUrl = () => 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
      window._tourLogoSrc = t => t.logoUrl || '';
      window._editingTournament = {
        id: 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44',
        name: 'TORNEIO REAL DA PRÉVIA',
        logoUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%20width%3D%22400%22%20height%3D%22400%22/%3E',
        _nJogos: 1,
        courtNames: Array.from({ length:8 }, (_, i) => 'Quadra ' + (i + 1)),
        combinedCategories: ['Fem Diamante', 'Fem Ouro', 'Fem Prata'],
        matches: [{
          id: 'jogo-1', court: 'Quadra 4', category: 'Fem Light',
          scheduledAt: '2026-10-25T12:00:00Z', resultAt: '2026-10-25T12:30:00Z',
          p1: 'Ana / Bia', p2: 'Clara / Dora', scoreP1: 6, scoreP2: 3, winner: 'p1'
        }]
      };
    });
    await page.addScriptTag({ path: source('views/tv-live.js') });
    assert.equal(await page.evaluate(() => typeof window._tvLivePreviewDocument), 'function');
    await page.addScriptTag({ path: source('views/tv-layout-editor.js') });
    await page.waitForSelector('[data-tv-frame]', { state: 'attached' });
    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-tv-frame]');
      return frame && frame.contentDocument && frame.contentDocument.querySelector('.tv-custom-board');
    });
    assert.equal(await page.evaluate(() => document.getElementById('fase1-box').previousElementSibling.id), 'tv-personalization');
    assert.equal(await page.evaluate(() => document.getElementById('tv-personalization').open), false);
    await page.evaluate(() => { document.getElementById('tv-personalization').open = true; });
    assert.equal(await page.locator('[data-tv-value]').count(), 0);
    assert.equal(await page.locator('[data-tv-visible]').count(), 0);
    const preview = await page.evaluate(() => document.querySelector('[data-tv-frame]').contentDocument.body.textContent);
    assert.match(preview, /TORNEIO REAL DA PRÉVIA/);
    assert.match(preview, /Ana/);
    assert.match(preview, /6/);
    assert(await page.locator('[data-tv-add-bracket-button]').count() >= 3,
      'cada categoria tem um botão visível para colocar sua chave');
    const courtGeometry = () => page.evaluate(() => {
      const box = document.querySelector('[data-tv-box="courts"]');
      return { left: box.style.left, top: box.style.top, width: box.style.width, height: box.style.height };
    });
    const courtGeometryBefore = await courtGeometry();
    const canvasBounds = await page.locator('[data-tv-canvas]').boundingBox();
    const upcomingBounds = await page.locator('[data-tv-box="upcoming"]').boundingBox();
    const dragStart = { x:upcomingBounds.x + upcomingBounds.width / 2, y:upcomingBounds.y + 12 };
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + canvasBounds.width * .49, dragStart.y - canvasBounds.height * .73, { steps: 4 });
    assert.equal(await page.locator('[data-tv-guide-y]').evaluate(el => el.style.display), 'block',
      'guia horizontal aparece ao alinhar próximos jogos com uma linha das quadras');
    await page.mouse.up();
    assert.equal(await page.locator('[data-tv-guide-y]').evaluate(el => el.style.display), 'none',
      'guia desaparece ao soltar o box');
    await page.evaluate(() => {
      const layout = window.ScoreplaceTvLayout.defaults();
      layout.sections.rankings.visible = false;
      layout.sections.results.visible = false;
      Object.assign(layout.sections.upcoming, { x:50, y:10, w:50, h:72 });
      window._tvEditorSetLayout(layout);
    });
    const aligned = await page.locator('[data-tv-box="upcoming"]').boundingBox();
    await page.mouse.move(aligned.x + 30, aligned.y + 20);
    await page.mouse.down();
    await page.mouse.move(aligned.x + 31, aligned.y + 21);
    const guides = await page.evaluate(() => ['x','x-end','y','y-end'].map(axis => {
      const guide = document.querySelector('[data-tv-guide-' + axis + ']');
      return { visible:guide.style.display, position:axis[0] === 'x' ? guide.style.left : guide.style.top };
    }));
    assert.deepEqual(guides, [
      { visible:'block', position:'50%' },
      { visible:'block', position:'calc(100% - 2px)' },
      { visible:'block', position:'10%' },
      { visible:'block', position:'82%' }
    ], 'guias mostram ao mesmo tempo as bordas esquerda, direita, superior e inferior encaixadas');
    assert(await page.locator('[data-tv-guide-intermediate]').count() >= 4,
      'as divisões intermediárias das quadras também aparecem durante o alinhamento');
    await page.mouse.up();
    assert.equal(await page.locator('[data-tv-guide-x-end]').evaluate(el => el.style.display), 'none');
    assert.equal(await page.locator('[data-tv-guide-y-end]').evaluate(el => el.style.display), 'none');
    assert.equal(await page.locator('[data-tv-guide-intermediate]').count(), 0,
      'as guias intermediárias desaparecem ao soltar o box');
    await page.evaluate(() => window._tvEditorSetLayout(window.ScoreplaceTvLayout.defaults()));
    await page.locator('[data-tv-add-bracket-button="Fem Diamante"]').click();
    assert.equal(await page.locator('[data-tv-box="bracket-0"]').count(), 1,
      'botão direto coloca a chave da categoria sem alterar os boxes existentes');
    assert.deepEqual(await courtGeometry(), courtGeometryBefore,
      'colocar chave preserva posição e tamanho das quadras');
    assert.equal(await page.evaluate(() => Object.hasOwn(window._editingTournament.matches[0], '_gameNum')), false,
      'montar a prévia não deixa _gameNum no objeto salvo pelo formulário');
    assert.equal(await page.locator('[data-tv-remove="qr"]').count(), 0, 'QR não oferece exclusão');
    assert.equal(await page.locator('[data-tv-restore="qr"]').count(), 0);
    assert.equal(await page.locator('[data-tv-box="qr"]').count(), 1);
    await page.evaluate(() => {
      const layout = window.ScoreplaceTvLayout.defaults();
      layout.sections.qr.y = 50;
      window._tvEditorSetLayout(layout);
    });
    await page.locator('[data-tv-qr-bottom]').click();
    assert.equal(await page.evaluate(() => {
      const qr = window._tvEditorReadLayout().sections.qr;
      return qr.y + qr.h;
    }), 100, 'Alinhar QR embaixo encosta a caixa na borda inferior');
    assert.ok(await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const brand = doc.querySelector('.tv-custom-qr .tv-qr-brand').getBoundingClientRect();
      const board = doc.querySelector('.tv-custom-board').getBoundingClientRect();
      const gap = board.bottom - brand.bottom;
      return gap >= 4 && gap <= 15;
    }), 'a marca Abra no Scoreplace tem uma pequena folga inferior sem sair da caixa');
    assert.ok(await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const mark = doc.querySelector('.tv-custom-qr .tv-scoreplace-mark');
      const qr = doc.querySelector('.tv-custom-qr .tv-qr').getBoundingClientRect();
      if (!mark) return false;
      const box = mark.getBoundingClientRect();
      return box.width >= 26 && box.height >= 19 && box.top >= qr.top && box.bottom <= qr.bottom;
    }), 'logo do Scoreplace aparece dentro da caixa do QR personalizado');
    assert.ok(await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const slot = doc.querySelector('.tv-custom-qr').getBoundingClientRect();
      const logo = doc.querySelector('.tv-custom-qr .tv-qr-tournament-logo');
      const code = doc.querySelector('.tv-custom-qr .tv-qr-code').getBoundingClientRect();
      if (!logo) return false;
      const image = logo.getBoundingClientRect();
      return image.top >= slot.top && image.bottom <= code.top &&
        Math.abs((image.left + image.right - slot.left - slot.right) / 2) <= 2 &&
        Math.abs((image.top + image.bottom - slot.top - code.top) / 2) <= 2 &&
        image.width >= slot.width - 1 && image.height >= code.top - slot.top - 5 &&
        doc.defaultView.getComputedStyle(logo).objectFit === 'contain' &&
        doc.defaultView.getComputedStyle(logo).borderRadius === '0px';
    }), 'logo do torneio fica inteiro e centralizado na área acima do QR');
    assert.ok(await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const code = doc.querySelector('.tv-custom-qr .tv-qr-code').getBoundingClientRect();
      const brand = doc.querySelector('.tv-custom-qr .tv-qr-brand').getBoundingClientRect();
      const board = doc.querySelector('.tv-custom-board').getBoundingClientRect();
      return Math.abs(code.left - brand.left) <= 1 && Math.abs(code.right - brand.right) <= 1 &&
        board.right - code.right >= 12;
    }), 'tarja branca coincide com o QR e ambos deixam folga para a borda da TV');
    assert.ok(await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const mark = doc.querySelector('.tv-custom-qr .tv-scoreplace-mark');
      const rect = mark.getBoundingClientRect(), radius = parseFloat(doc.defaultView.getComputedStyle(mark).borderTopLeftRadius);
      return Math.abs(rect.width - rect.height) <= 1 && radius >= 5;
    }), 'marca do Scoreplace tem fundo quadrado e cantos arredondados');
    assert.deepEqual(await page.evaluate(() => {
      const frame = document.querySelector('[data-tv-frame]');
      const doc = frame.contentDocument, win = frame.contentWindow;
      return [win.getComputedStyle(doc.querySelector('.tv-qr-brand')).color,
        win.getComputedStyle(doc.querySelector('.tv-qr-brand')).backgroundColor,
        win.getComputedStyle(doc.querySelector('.tv-scoreplace-mark')).backgroundColor,
        win.getComputedStyle(doc.querySelector('.tv-qr-code')).backgroundColor];
    }), ['rgb(17, 17, 17)', 'rgb(255, 255, 255)', 'rgb(17, 24, 39)', 'rgb(255, 255, 255)'],
    'legenda preta sobre branco e logo original sobre fundo escuro');
    await page.evaluate(() => {
      window.__savedTvPatch = null;
      window.__tvSaveCalls = 0;
      window.AppStore = { addTournament: async patch => {
        window.__tvSaveCalls++;
        if ('scheduleWindow' in patch || 'courtCount' in patch) throw new Error('A grade foi alterada');
        window.__savedTvPatch = patch;
      } };
    });
    assert.equal(await page.evaluate(() => window._tvEditorHasChanges()), true);
    await page.locator('[data-tv-save-live]').click();
    assert.deepEqual(await page.evaluate(() => Object.keys(window.__savedTvPatch).sort()), ['id','tvLayout','tvScreens']);
    assert.equal(await page.evaluate(() => 'tvActiveScreen' in window.__savedTvPatch), false,
      'salvar uma tela não muda a escolha automática por fase de torneios antigos');
    assert.equal(await page.evaluate(() => window._tvEditorHasChanges()), false, 'salvar a tela limpa as mudanças pendentes');
    await page.locator('[data-tv-save-live]').click();
    assert.equal(await page.evaluate(() => window.__tvSaveCalls), 1,
      'salvar novamente sem mudanças não envia um layout vazio ao servidor');
    const seriesPositions = await page.evaluate(async () => {
      const game = (number, scoreA, scoreB) => ({
        number, a:'Laura / Flávia Fabbrocini Sanches', b:'Fernanda / Bianca', scoreA, scoreB,
        status:'done', winnerSide:1
      });
      const snapshot = {
        tvLayout:window._tvEditorReadLayout(), theme:{ background:'#000000', primary:'#000000', secondary:'#ffffff', title:'#fff' },
        name:'CAMIS', courts:Array.from({ length:8 }, (_, i) => ({ name:'Quadra ' + (i+1), number:i*3+1,
          category:'Fem Diamante', phase:'Classificatória', series:[game(i*3+1,'6','3'),game(i*3+2,'2','4'),game(i*3+3,'1','0')], timerStart:0 })),
        nextGame:null, rankings:[], results:[], resultDay:'', qrImage:'', scoreplaceLogo:''
      };
      const frame = document.querySelector('[data-tv-frame]');
      frame.srcdoc = window._tvLivePreviewDocument(snapshot);
      await new Promise(resolve => frame.addEventListener('load', resolve, { once:true }));
      const rows = [...frame.contentDocument.querySelectorAll('.tv-series-game')];
      const shortName = rows[0].querySelector('.tv-series-left .tv-series-players span:first-child');
      const longName = rows[0].querySelector('.tv-series-left .tv-series-players span:last-child');
      const sample = selector => {
        const el = frame.contentDocument.querySelector(selector);
        const canvas = frame.contentDocument.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = frame.contentWindow.getComputedStyle(el).backgroundColor;
        ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const colors = ['.tv-header','.tv-court','.tv-series-game'].map(sample);
      const top = frame.contentDocument.querySelector('.tv-court-top');
      const topPositions = ['h2','.tv-court-phase','span'].map(selector => top.querySelector(selector).getBoundingClientRect().left);
      const repeatedNameSizes = [...frame.contentDocument.querySelectorAll('.tv-series-players span')]
        .filter(el => el.textContent === 'Flávia Fabbrocini Sanches')
        .map(el => parseFloat(frame.contentWindow.getComputedStyle(el).fontSize));
      return { topPositions, phase:top.querySelector('.tv-court-phase').textContent, repeatedNameSizes, rows:rows.map(row => {
        const box = selector => row.querySelector(selector).getBoundingClientRect();
        return { leftNames:box('.tv-series-left .tv-series-players').left,
          leftScore:box('.tv-series-left strong').left,
          middle:box('.tv-series-versus').left,
          rightScore:box('.tv-series-right strong').left,
          rightNames:box('.tv-series-right .tv-series-players').left };
      }), colors, shortFont:parseFloat(frame.contentWindow.getComputedStyle(shortName).fontSize),
        longFont:parseFloat(frame.contentWindow.getComputedStyle(longName).fontSize),
        longLines:longName.scrollHeight / parseFloat(frame.contentWindow.getComputedStyle(longName).lineHeight) };
    });
    assert.equal(seriesPositions.rows.length, 24, 'oito quadras mantêm seus três jogos');
    assert.equal(seriesPositions.phase, 'Classificatória');
    assert(seriesPositions.topPositions[0] < seriesPositions.topPositions[1] &&
      seriesPositions.topPositions[1] < seriesPositions.topPositions[2],
      'fase fica centralizada entre quadra e categoria');
    seriesPositions.rows.forEach((position, index) => {
      assert.ok(position.leftNames < position.leftScore && position.leftScore < position.middle &&
        position.middle < position.rightScore && position.rightScore < position.rightNames,
      `jogo ${index + 1}: nomes nas bordas e placares junto ao centro`);
    });
    assert(seriesPositions.longFont < seriesPositions.shortFont,
      'só o nome que excede o espaço tem a fonte reduzida');
    assert(seriesPositions.longLines <= 2.1, 'Flávia Fabbrocini Sanches cabe em no máximo duas linhas');
    assert.equal(new Set(seriesPositions.repeatedNameSizes).size, 1,
      'o mesmo nome conserva exatamente o mesmo tamanho em todas as quadras e partidas');
    seriesPositions.colors.forEach(color => assert(Math.max(...color) - Math.min(...color) <= 1,
      'cabeçalho, quadra e linha usam tons neutros da capa preta e branca'));
    await page.locator('[data-tv-finals-preset]').click();
    assert.equal(await page.locator('[data-tv-box="standing1"]').count(), 1, 'modelo inclui a classificação da linha disponível');
    assert.equal(await page.locator('[data-tv-box="qr"]').count(), 1, 'modelo da final conserva o QR');
    await page.locator('[data-tv-default]').click();
    await page.locator('[data-tv-card="score"]').uncheck();
    await page.locator('[data-tv-background-mode]').selectOption('custom');
    await page.locator('[data-tv-background]').fill('#112233');
    const before = await page.evaluate(() => window._tvEditorReadLayout().sections.upcoming.x);
    await page.locator('[data-tv-box="upcoming"]').scrollIntoViewIfNeeded();
    const box = await page.locator('[data-tv-box="upcoming"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 5);
    await page.mouse.up();
    let layout = await page.evaluate(() => window._tvEditorReadLayout());
    assert.ok(layout.sections.upcoming.x > before, 'arrastar altera a posição');
    assert.equal(layout.background, '#112233');
    assert.equal(layout.card.score, false);
    const innerX = await page.evaluate(() => document.querySelector('[data-tv-frame]').contentDocument.querySelector('.tv-custom-upcoming').style.left);
    assert.equal(innerX, layout.sections.upcoming.x + '%', 'a seção real acompanha o arraste');
    const handle = await page.locator('[data-tv-box="courts"] [data-tv-resize="e"]').boundingBox();
    const widthBefore = layout.sections.courts.w;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 35, handle.y + handle.height / 2);
    await page.mouse.up();
    layout = await page.evaluate(() => window._tvEditorReadLayout());
    assert.ok(layout.sections.courts.w > widthBefore, 'redimensionar altera a largura');
    const innerWidth = await page.evaluate(() => document.querySelector('[data-tv-frame]').contentDocument.querySelector('.tv-custom-courts').style.width);
    assert.equal(innerWidth, layout.sections.courts.w + '%', 'os dados reais refluem com o novo tamanho');
    const north = await page.locator('[data-tv-box="courts"] [data-tv-resize="n"]').boundingBox();
    const heightBefore = layout.sections.courts.h, bottomBefore = layout.sections.courts.y + heightBefore;
    await page.mouse.move(north.x + north.width / 2, north.y + north.height / 2);
    await page.mouse.down();
    await page.mouse.move(north.x + north.width / 2, north.y + north.height / 2 + 25);
    await page.mouse.up();
    layout = await page.evaluate(() => window._tvEditorReadLayout());
    assert.ok(layout.sections.courts.h < heightBefore && Math.abs(layout.sections.courts.y + layout.sections.courts.h - bottomBefore) < .2,
      'borda superior muda só a altura e ancora a borda inferior');
    assert.equal(await page.locator('[data-tv-box="courts"] [data-tv-resize]').count(), 8);
    await page.locator('[data-tv-default]').click();
    assert.equal(await page.evaluate(() => window._tvEditorReadLayout().sections.qr.visible), true);
    await page.locator('[data-tv-save-live]').click();
    await page.locator('[data-tv-add-screen]').click();
    assert.equal(await page.locator('[data-tv-screen-list] option').count(), 2);
    await page.locator('[data-tv-background-mode]').selectOption('custom');
    await page.locator('[data-tv-background]').fill('#223344');
    let savedScreens = await page.evaluate(() => window._tvEditorReadScreens());
    assert.deepEqual(savedScreens.map(screen => screen.phaseIndex), [0, 1]);
    assert.equal(savedScreens[1].layout.background, '#223344');
    assert.notEqual(savedScreens[0].layout.background, '#223344', 'a segunda tela tem edição independente');
    await page.locator('[data-tv-screen-list]').selectOption('0');
    assert.equal(await page.locator('[data-tv-background]').inputValue(), savedScreens[0].layout.background);
    assert.match(await page.locator('[data-tv-screen-list] option').first().textContent(), /principal.*padrão/);
    assert.equal(await page.locator('[data-tv-phase]').isDisabled(), true,
      'a tela principal não pode ser reatribuída a outra fase');
    await page.locator('[data-tv-screen-list]').selectOption('1');
    await page.locator('[data-tv-phase]').selectOption('2');
    savedScreens = await page.evaluate(() => window._tvEditorReadScreens());
    assert.deepEqual(savedScreens.map(screen => screen.phaseIndex), [0, 2], 'a tela pode ser vinculada a outra fase');
    await page.locator('[data-tv-save-live]').click();
    assert.equal(await page.evaluate(() => 'tvLayout' in window.__savedTvPatch), false,
      'salvar outra tela preserva o layout principal no servidor');
    assert.equal(await page.evaluate(() => 'tvActiveScreen' in window.__savedTvPatch), false,
      'salvar outra tela em torneio antigo não fixa a TV na principal sem escolha explícita');
    await page.evaluate(() => {
      const saved = window._tvEditorReadScreens();
      window._tvEditorSetLayout(saved[0].layout);
      window._tvEditorSetScreens(saved);
    });
    assert.equal(await page.locator('[data-tv-screen-list] option').count(), 2, 'as telas gravadas voltam ao editor');
    await page.locator('[data-tv-screen-list]').selectOption('2');
    assert.equal(await page.locator('[data-tv-background]').inputValue(), '#223344');
    await page.locator('[data-tv-show-screen]').click();
    assert.equal(await page.evaluate(() => window.__savedTvPatch.tvActiveScreen), 1,
      'organizador pode colocar a segunda tela no ar durante o torneio');
    assert.deepEqual(await page.evaluate(() => Object.keys(window.__savedTvPatch).sort()), ['id', 'tvActiveScreen'],
      'trocar a tela no ar preserva as geometrias gravadas');
    assert.equal(await page.evaluate(() => window._tvLiveBuildSnapshot({ ...window._editingTournament,
      tvScreens:window._tvEditorReadScreens(), tvActiveScreen:1 }).tvLayout.background), '#223344');
    await page.locator('[data-tv-delete-screen]').click();
    assert.equal(await page.locator('[data-tv-screen-list] option').count(), 1);
    assert.equal(await page.evaluate(() => window._tvEditorHasChanges()), true);
    await page.locator('[data-tv-save-live]').click();
    assert.equal(await page.evaluate(() => window.__savedTvPatch.tvActiveScreen), 0,
      'ao excluir a tela ativa, volta para a principal');
    await page.evaluate(() => {
      document.getElementById('form').innerHTML = '<details id="tv-personalization"><summary>Personalização</summary><div id="tv-layout-editor"></div></details><div id="fase1-box">Formato</div>';
      const next = window.ScoreplaceTvLayout.defaults();
      next.background = '#445566';
      window._tvEditorSetLayout(next);
    });
    await page.waitForSelector('[data-tv-background][value="#445566"]', { state: 'attached' });
    assert.equal(await page.evaluate(() => window._tvEditorReadLayout().background), '#445566');
    await page.evaluate(() => {
      window._editingTournament.logoUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
      window._editingTournament.logoShape = 'circle';
      window._editingTournament.logoRadius = 50;
      window._tourLogoSrc = t => t.logoUrl || t.logoData || '';
      window.AppStore.addTournament = async patch => { Object.assign(window._editingTournament, patch); };
      document.getElementById('tv-personalization').open = true;
    });
    await page.locator('[data-tv-add-logo]').click();
    await page.locator('[data-tv-logo-position="x"]').fill('2');
    await page.locator('[data-tv-logo-position="y"]').fill('78');
    assert.deepEqual(await page.evaluate(() => {
      const logo = window._tvEditorReadLayout().sections.logo;
      return [logo.x, logo.y];
    }), [2, 78], 'logo pode ser colocado no outro lado da tela, inclusive sobre a área de outros boxes');
    await page.locator('[data-tv-save-live]').click();
    const placedLogo = await page.evaluate(() => {
      const snapshot = window._tvLiveBuildSnapshot(window._editingTournament, Date.now());
      return { visible:snapshot.tvLayout.sections.logo.visible,
        markup:window._tvLivePreviewDocument(snapshot) };
    });
    assert.equal(placedLogo.visible, true, 'a posição do logo é gravada na tela No ar');
    assert.equal(await page.evaluate(() => window._editingTournament.tvLayout.sections.logo.x), 2);
    assert.match(placedLogo.markup, /tv-placed-logo/, 'a TV monta o logo gravado na sua caixa');
    const logoCircleComputed = await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const logo = doc.querySelector('.tv-placed-logo');
      return logo ? { clip:doc.defaultView.getComputedStyle(logo).clipPath,
        radius:doc.defaultView.getComputedStyle(logo).borderRadius,
        frame:doc.querySelector('.tv-theme')?.className } : null;
    });
    assert.ok(logoCircleComputed && logoCircleComputed.frame.includes('tv-logo-circle') &&
      logoCircleComputed.radius === '50%' && logoCircleComputed.clip.startsWith('circle('),
      'logo circular da TV é recortado em círculo na caixa personalizada');
    await page.evaluate(() => {
      // O teste seguinte verifica o botão fullscreen sem outro box sintético sobre ele.
      window._editingTournament.tvScreens = null;
      window._editingTournament.tvLayout.sections.logo.visible = false;
      window._currentBracketTournament = window._editingTournament;
      window._findTournamentById = () => window._editingTournament;
      const button = document.createElement('button');
      button.id = 'open-tv-test'; button.textContent = 'Abrir TV';
      button.onclick = () => window._tvLiveToggle();
      document.body.appendChild(button);
    });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#open-tv-test').click();
    const popup = await popupPromise;
    await popup.locator('#tv-fullscreen-action').waitFor();
    const headerPositions = await popup.evaluate(() => {
      const bounds = selector => document.querySelector(selector).getBoundingClientRect();
      return { title:bounds('.tv-header h1'), action:bounds('#tv-fullscreen-action'), clock:bounds('#tv-now') };
    });
    assert.ok(headerPositions.title.right <= headerPositions.action.left &&
      headerPositions.action.right <= headerPositions.clock.left,
    'botão fica entre o nome e o relógio, sem sobreposição');
    await popup.locator('#tv-fullscreen-action').click();
    await popup.waitForFunction(() => document.fullscreenElement ||
      /bloqueada|indisponível/.test(document.querySelector('#tv-fullscreen-action')?.textContent || ''));
    const fullscreenState = await popup.evaluate(() => ({ active:document.fullscreenElement === document.documentElement,
      enabled:document.fullscreenEnabled, secure:window.isSecureContext,
      text:document.querySelector('#tv-fullscreen-action')?.textContent,
      title:document.querySelector('#tv-fullscreen-action')?.title }));
    assert.equal(fullscreenState.active, true,
      'clique do usuário põe a TV em tela cheia no Chromium: ' + JSON.stringify(fullscreenState));
    await popup.close();
    await page.waitForFunction(() => !window._tvLiveWindow || window._tvLiveWindow.closed);
    await page.evaluate(() => {
      Object.defineProperty(window.screen, 'isExtended', { configurable:true, value:true });
      window.getScreenDetails = async () => ({ screens:[
        { label:'Principal', isPrimary:true, availLeft:0, availTop:0, availWidth:1400, availHeight:1000, width:1400, height:1000 },
        { label:'Projetor', isPrimary:false, availLeft:1400, availTop:0, availWidth:1280, availHeight:720, width:1280, height:720 }
      ] });
      const originalOpen = window.open.bind(window);
      window.open = (...args) => {
        window.__tvOpenFeatures = args[2];
        const opened = originalOpen(...args);
        if (opened) {
          opened.moveTo = (x,y) => { window.__tvMove = {x,y}; };
          opened.resizeTo = (width,height) => { window.__tvResize = {width,height}; };
        }
        return opened;
      };
    });
    const secondPopupPromise = page.waitForEvent('popup');
    await page.locator('#open-tv-test').click();
    const secondPopup = await secondPopupPromise;
    await secondPopup.getByRole('dialog', { name:'Onde mostrar a tela No ar?' }).waitFor();
    await secondPopup.getByRole('button', { name:/Projetor/ }).click();
    assert.deepEqual(await page.evaluate(() => ({move:window.__tvMove,resize:window.__tvResize})),
      { move:{x:1400,y:0}, resize:{width:1268,height:704} },
      'TV é movida e dimensionada para o monitor escolhido');
    await secondPopup.waitForFunction(() => document.fullscreenElement === document.documentElement ||
      !!document.querySelector('#tv-fullscreen-action')?.title);
    assert.equal(await secondPopup.evaluate(() => ({active:document.fullscreenElement === document.documentElement,
      reason:document.querySelector('#tv-fullscreen-action')?.title})).then(x => x.active ? '' : x.reason), '',
      'escolha do monitor ativa tela cheia automaticamente');
    assert.equal(await page.locator('iframe[title^="TV · "]').count(), 0,
      'a tela escolhida recebe a TV sem deslocar a operação para o segundo monitor');
    assert.equal(await secondPopup.locator('#tv-exit-action').count(), 0,
      'a apresentação externa não mostra Sair da TV');
    const secondClosePromise = secondPopup.waitForEvent('close');
    await page.locator('#open-tv-test').click();
    await secondClosePromise;
    await page.waitForFunction(() => !window._tvLiveWindow || window._tvLiveWindow.closed);
    const repeatPopupPromise = page.waitForEvent('popup');
    await page.locator('#open-tv-test').click();
    const repeatPopup = await repeatPopupPromise;
    await repeatPopup.getByRole('dialog', { name:'Onde mostrar a tela No ar?' }).waitFor();
    await repeatPopup.getByRole('button', { name:'Cancelar' }).click();
    await page.evaluate(() => { window.getScreenDetails = undefined; });
    await page.evaluate(() => {
      const actualMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = query => query === '(display-mode: standalone)'
        ? { matches:true, media:query, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }
        : actualMatchMedia(query);
    });
    await page.locator('#open-tv-test').click();
    await page.waitForFunction(() => document.fullscreenElement?.tagName === 'IFRAME' &&
      document.fullscreenElement.contentDocument?.querySelector('#tv-root'));
    await page.waitForFunction(() => window._tvLiveWindow === document.querySelector('iframe[title^="TV · "]')?.contentWindow);
    assert.equal(await page.locator('iframe[title^="TV · "]').count(), 1,
      'app instalado abre a TV dentro da mesma janela já em tela cheia');
    await page.waitForFunction(() => {
      const action = document.querySelector('iframe[title^="TV · "]')?.contentDocument?.querySelector('#tv-fullscreen-action');
      return !action || action.hidden;
    });
    assert.equal(await page.frameLocator('iframe[title^="TV · "]').locator('#tv-exit-action').count(), 0,
      'a apresentação não mostra botão Sair da TV');
    await page.evaluate(() => window._tvLiveToggle());
    await page.locator('iframe[title^="TV · "]').waitFor({ state:'detached' });
    assert.equal(await page.evaluate(() => document.fullscreenElement), null,
      'desligar NO AR na operação fecha a TV e devolve o aplicativo');
    await page.evaluate(() => {
      window._editingTournament.id = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
      window._editingTournament.name = 'Camis Day';
      const layout = window.ScoreplaceTvLayout.defaults();
      Object.assign(layout.sections.courts, { x:0, y:9.7, w:67, h:90.3 });
      layout.sections.rankings.visible = false;
      Object.assign(layout.sections.results, { x:67, y:9.7, w:33, h:44.6, visible:true });
      Object.assign(layout.sections.upcoming, { x:67, y:55.4, w:25.2, h:44.6, visible:true });
      Object.assign(layout.sections.qr, { x:92.2, y:67, w:7.8, h:33, visible:true });
      window._tvEditorSetLayout(layout);
    });
    await page.waitForFunction(() => {
      const doc = document.querySelector('[data-tv-frame]')?.contentDocument;
      return doc && doc.querySelector('.tv-custom-qr .tv-qr-tournament-logo-camis');
    });
    assert.ok(await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const board = doc.querySelector('.tv-custom-board').getBoundingClientRect();
      const slot = doc.querySelector('.tv-custom-qr').getBoundingClientRect();
      const logo = doc.querySelector('.tv-custom-qr .tv-qr-tournament-logo-camis').getBoundingClientRect();
      const code = doc.querySelector('.tv-custom-qr .tv-qr-code').getBoundingClientRect();
      const title = doc.querySelector('.tv-custom-header h1').getBoundingClientRect();
      const header = doc.querySelector('.tv-custom-header').getBoundingClientRect();
      return slot.top < board.top + board.height * .57 &&
        logo.width >= code.width && logo.left >= board.left && logo.right <= board.right &&
        logo.top >= slot.top && logo.bottom <= code.top &&
        !doc.querySelector('.tv-custom-header img') && title.left - header.left < 30;
    }), 'logo CAMIS usa o vão livre, cresce sem corte e sai do cabeçalho');
    assert.ok(await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const box = s => doc.querySelector(s).getBoundingClientRect();
      const resultOffset = box('.tv-custom-results h2').top - box('.tv-custom-results').top;
      const upcomingOffset = box('.tv-custom-upcoming h2').top - box('.tv-custom-upcoming').top;
      return Math.abs(resultOffset - upcomingOffset) <= 2 &&
        box('.tv-custom-results .tv-results').left - box('.tv-custom-courts .tv-courts').right >= 5 &&
        box('.tv-custom-upcoming .tv-upcoming').left - box('.tv-custom-courts .tv-courts').right >= 5;
    }), 'títulos laterais alinhados e separados das quadras');
    const qrAlignment = await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const box = s => doc.querySelector(s).getBoundingClientRect();
      const slot = box('.tv-custom-qr');
      const logo = box('.tv-qr-tournament-logo-camis');
      const code = box('.tv-custom-qr .tv-qr-code');
      const brand = box('.tv-custom-qr .tv-qr-brand');
      const center = r => (r.left + r.right) / 2;
      const board = box('.tv-custom-board');
      const brandElement = doc.querySelector('.tv-custom-qr .tv-qr-brand');
      return { slotX:slot.left - board.left, expectedX:board.width * .894,
        centers:[center(logo),center(code),center(brand)], widths:[logo.width,code.width,brand.width],
        gaps:[code.top-logo.bottom,slot.bottom-brand.bottom],
        rightMargin:doc.documentElement.clientWidth-brand.right, boardWidth:board.width,
        contentFits:brandElement.scrollWidth <= brandElement.clientWidth + 1,
        allInside:[logo,code,brand].every(r => r.left >= board.left && r.right <= board.right && r.top >= board.top && r.bottom <= board.bottom) };
    });
    assert.ok(Math.abs(qrAlignment.slotX - qrAlignment.expectedX) < 2 &&
      Math.abs(qrAlignment.centers[0] - qrAlignment.centers[1]) < 2 &&
      Math.abs(qrAlignment.centers[1] - qrAlignment.centers[2]) < 2 &&
      qrAlignment.widths[0] > qrAlignment.widths[1] + 8 &&
      Math.abs(qrAlignment.widths[1] - qrAlignment.widths[2]) < 2 &&
      Math.abs(qrAlignment.gaps[0] - qrAlignment.gaps[1]) < 20 &&
      qrAlignment.rightMargin >= 8 && qrAlignment.rightMargin < 25 &&
      qrAlignment.contentFits && qrAlignment.allInside,
    'QR e legenda centralizados no eixo do logo e usando toda a borda direita da TV: ' + JSON.stringify(qrAlignment));
    const frameFit = await page.evaluate(() => {
      const doc = document.querySelector('[data-tv-frame]').contentDocument;
      const rect = selector => doc.querySelector(selector).getBoundingClientRect();
      const board = rect('.tv-custom-board');
      const courts = rect('.tv-custom-courts');
      const clock = rect('.tv-custom-header time');
      return { leftGap:courts.left-board.left, clockRight:clock.right-board.right };
    });
    assert.ok(frameFit.leftGap <= 1 && frameFit.clockRight < 0,
      'grade começa na borda esquerda e o relógio cabe à direita: ' + JSON.stringify(frameFit));
    console.log('✓ editor TV: dados reais, remoção/restauração, arraste e estado intacto');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
