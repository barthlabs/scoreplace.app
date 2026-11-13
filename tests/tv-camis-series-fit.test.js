'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent('<iframe id="tv" style="width:1920px;height:1080px;border:0"></iframe>');
    const source = file => path.join(__dirname, '../js/', file);
    for (const file of ['domain/match-day.js', 'domain/match-timing.js', 'domain/team-competition.js', 'tv-layout-core.js']) {
      await page.addScriptTag({ path: source(file) });
    }
    await page.evaluate(() => {
      window._collectAllMatches = t => t.matches;
      window._assignGlobalGameNumbers = () => {};
      window._qrCodeUrl = () => '';
      window._tourLogoSrc = () => '';
      window._personAvatarHtml = () => '<img class="tv-player-photo" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E" alt="">';
    });
    await page.addScriptTag({ path: source('views/tv-live.js') });
    const metrics = await page.evaluate(async () => {
      const layout = window.ScoreplaceTvLayout.defaults();
      Object.assign(layout.sections.courts, { visible: true, x: 0, y: 7, w: 67, h: 89.5 });
      const series = (number, a, b) => ({ number, a, b, scoreA: number % 3 === 1 ? '6' : '',
        scoreB: number % 3 === 1 ? '4' : '', status: 'active' });
      const pair = ['Adriana Ferreira Leite / Katia de Carvalho Figueiredo', 'Maira Lourenço Cavalcanti / Ana Paula Schmidt'];
      const courtSix = [
        ['Viviane Mendonça / Mariana Faes', 'Graziela Dassoler / Juliana Monteiro Machado'],
        ['Viviane Mendonça / Graziela Dassoler', 'Mariana Faes / Juliana Monteiro Machado'],
        ['Viviane Mendonça / Juliana Monteiro Machado', 'Mariana Faes / Graziela Dassoler']
      ];
      const courtEight = [
        ['Gabriela Otto Nessy / Maria Angelica Reck', 'Marcia Daher Nunes / Flavia Audi Delfino'],
        ['Gabriela Otto Nessy / Marcia Daher Nunes', 'Maria Angelica Reck / Flavia Audi Delfino'],
        ['Gabriela Otto Nessy / Flavia Audi Delfino', 'Maria Angelica Reck / Marcia Daher Nunes']
      ];
      const snapshot = {
        tvLayout: layout, theme: { background: '#000', primary: '#000', secondary: '#fff', title: '#fff' }, name: 'Camis Day',
        courts: Array.from({ length: 8 }, (_, i) => ({ name: 'Quadra ' + (i + 1), number: i * 3 + 1, category: 'Fem Prata',
          phase: 'Classificatória · Grupo F', series: [0, 1, 2].map(j => {
            const sides = i === 5 ? courtSix[j] : i === 7 ? courtEight[j] : pair;
            return series(i * 3 + j + 1, sides[0], sides[1]);
          }), timerStart: 0 })),
        nextGame: null, rankings: [], results: [], resultDay: '', qrImage: '', scoreplaceLogo: ''
      };
      const frame = document.getElementById('tv');
      frame.srcdoc = window._tvLivePreviewDocument(snapshot);
      await new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
      window._tvFitSeriesNames(frame.contentDocument);
      return [...frame.contentDocument.querySelectorAll('.tv-series-game')].filter((_, index) =>
        index < 3 || (index >= 15 && index < 18) || index >= 21).map(row => {
        const bounds = row.getBoundingClientRect();
        return { rowTop: bounds.top, rowBottom: bounds.bottom,
          scores: [...row.querySelectorAll('.tv-series-side > strong')].map(el => ({ text:el.textContent,
            top:el.getBoundingClientRect().top, bottom:el.getBoundingClientRect().bottom })),
          names: [...row.querySelectorAll('.tv-series-players > span')].map(el => {
            const rect = el.getBoundingClientRect();
            const avatar = el.querySelector('.tv-player-photo').getBoundingClientRect();
            const label = el.querySelector('.tv-series-player-name');
            const lineHeight = parseFloat(frame.contentWindow.getComputedStyle(label).lineHeight);
            return { full: el.title, shown: el.textContent, height: el.clientHeight, scroll: el.scrollHeight,
              top: rect.top, bottom: rect.bottom, avatarX: avatar.x, avatarY: avatar.y, labelHeight:label.scrollHeight,
              lines:label.scrollHeight / lineHeight, align:frame.contentWindow.getComputedStyle(label).textAlign,
              fontSize:parseFloat(frame.contentWindow.getComputedStyle(el).fontSize) };
          }) };
      });
    });
    assert.equal(metrics.length, 9, 'três jogos das quadras 1, 6 e 8 são exibidos');
    assert(metrics.every(row => row.names.every(name => name.scroll <= name.height + 1 &&
      name.top >= row.rowTop && name.bottom <= row.rowBottom)), 'nomes cabem na linha do próprio jogo');
    assert(metrics.every(row => row.names.every(name => name.full)), 'nome completo fica disponível no título');
    assert.deepEqual(metrics.map(row => row.scores.map(score => score.text)),
      Array.from({ length: 3 }, () => [['6', '4'], ['–', '–'], ['–', '–']]).flat(),
      'placares lançados e espaços de placar aparecem nos três jogos');
    assert(metrics.every(row => row.scores.every(score => score.top >= row.rowTop && score.bottom <= row.rowBottom)),
      'placares não saem da linha de jogo');
    assert(metrics.every(row => row.names.every(name => name.shown === name.full)), 'nomes completos são preservados');
    assert(metrics.every(row => row.names.every(name => name.lines <= 2.2 && name.fontSize <= 16)),
      'nomes longos cabem em até duas linhas com fonte reduzida');
    assert(metrics.every(row => row.names[2].align === 'right' && row.names[3].align === 'right'),
      'nomes do lado direito ficam alinhados à direita');
    for (let side = 0; side < 4; side++) {
      for (let court = 0; court < 3; court++) {
        const positions = metrics.slice(court * 3, court * 3 + 3).map(row => row.names[side].avatarX);
        assert(Math.max(...positions) - Math.min(...positions) < 1, 'avatares ficam alinhados nos três jogos da quadra');
      }
    }
    assert(metrics.every(row => Math.abs(row.names[0].avatarY - row.names[2].avatarY) < 1 &&
      Math.abs(row.names[1].avatarY - row.names[3].avatarY) < 1),
      'atletas dos dois lados ocupam as mesmas faixas verticais');
    console.log('✓ Camis TV mantém nomes e avatares alinhados nas três linhas');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
