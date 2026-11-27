'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://scoreplace.test/', route => route.fulfill({
      contentType:'text/html', body:'<main id="view"></main>'
    }));
    await page.route('https://scoreplace.test/assets/regulamentos/cult-2026/regulamento-cult-2026.html', route => route.fulfill({
      contentType:'text/html', body:fs.readFileSync(path.resolve(__dirname, '../assets/regulamentos/cult-2026/regulamento-cult-2026.html'))
    }));
    await page.goto('https://scoreplace.test/');
    await page.addScriptTag({ path:path.resolve(__dirname, '../js/domain/roster-provenance.js') });
    await page.addScriptTag({ path:path.resolve(__dirname, '../js/views/rules.js') });
    await page.evaluate(() => {
      const t = { id:'tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a', name:'CULT', matches:[] };
      const regulation = { sha256:'f5d7b672abe16416fc31b1d5a12b40b2c4f371a0231625c247fbd2a2baee1b0c' };
      window.AppStore = {};
      window._findTournamentById = () => t;
      window._souOrganizador = () => false;
      window._renderBackHeader = () => '<a>Voltar</a>';
      window._publishedInitialDrawData = () => ({ kind:'initial' });
      window._initialDrawGroupsModel = () => ({ groupCount:6, playerCount:48,
        categories:[{ groups:['A','B','C','D','E','F'].map(letter => ({ label:letter,
          players:Array.from({ length:8 }, (_, i) => letter === 'B' && i === 0 ? 'Camila Calia' : letter + ' Atleta ' + (i + 1)) })) }] });
      window.FirestoreDB = { loadTournamentRosterHistory: async () => ({ events:[{
        id:'e1', kind:'substitution', fromName:'Fabíola Baldscci', toName:'Camila Calia',
        group:'B', at:'2026-11-27T16:52:23.803Z'
      }] }) };
      window._documentGenerationStamp = () => 'Gerado em 27/11/2026 às 12:04:05 (Brasília)';
      renderRules(document.querySelector('#view'), t.id, { regulation });
    });
    await page.locator('iframe[data-regulation-document]').waitFor();
    const frame = page.frameLocator('iframe[data-regulation-document]');
    await frame.locator('article.group').first().waitFor();
    assert.equal(await frame.locator('article.group').count(), 6);
    assert.match(await frame.locator('article.group').first().locator('li').first().innerText(), /1\.\s*C Atleta 1/);
    assert.equal(await frame.getByText('Atleta C1').count(), 0);
    assert.equal(await frame.locator('.sp-generated-stamp').count(), 4);
    assert.match(await frame.locator('.sp-generated-stamp').first().innerText(), /27\/11\/2026 às 12:04:05/);
    const groupB = frame.locator('article.group').filter({ has:frame.locator('h3', { hasText:'Grupo B' }) });
    assert.match(await groupB.locator('li').first().innerText(), /Camila Calia\s*\*/);
    assert.match(await groupB.locator('.sp-roster-change').innerText(), /substituição a Fabíola Baldscci/);
    assert.equal(await page.locator('iframe').getAttribute('src'), null, 'regulamento é HTML, sem PDF incorporado');
    await frame.locator('nav a').first().click();
    assert.equal(await frame.getByText('Atleta C1').count(), 0, 'navegação interna preserva os nomes atuais');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
