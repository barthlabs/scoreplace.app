const { test, expect } = require('@playwright/test');
const path = require('path');

test('confirmar contas na importação mantém a rolagem do modal', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 640 });
  await page.setContent('<main>Prévia isolada</main>');
  await page.addStyleTag({ path: path.join(__dirname, '..', '..', 'css', 'components.css') });
  await page.evaluate(() => {
    Object.defineProperty(window.crypto, 'randomUUID', { value: () => '12345678-1234-4234-8234-123456789abc' });
    window.confirm = () => true;
    window._findTournamentById = () => ({ categoryDefinitions: [{ id: 'fem-light', label: 'Fem Light' }] });
    const slots = Array.from({ length: 8 }, (_, i) => ({ pairId: 'slot-' + i, categoryId: 'fem-light',
      members: [0, 1].map((side) => ({ registrationId: 'r-' + i + '-' + side,
        name: 'Jogador ' + String(i * 2 + side + 1).padStart(2, '0') })) }));
    const names = ['Ana', 'Bia', 'Cris', 'Dora', 'Eva', 'Fabi', 'Gabi', 'Helena',
      'Iara', 'Joana', 'Katia', 'Lia', 'Mara', 'Nina', 'Olga', 'Paula'];
    window._callCF = (name, data) => {
      if (name === 'previewTournamentImport') return Promise.resolve({ data: {
        count: 16, fingerprint: 'a'.repeat(64), photoImportEnabled: true,
        categories: [{ id: 'fem-light', label: 'Fem Light' }], slots } });
      if (name === 'extractTournamentImportImage') return Promise.resolve({ data: {
        text: 'LIGHT FEMININO\n' + Array.from({ length: 8 }, (_, i) =>
          (i + 1) + '. ' + names[i * 2] + ' Souza + ' + names[i * 2 + 1] + ' Lima').join('\n'),
      } });
      if (name === 'searchTournamentImportCandidates') return Promise.resolve({ data: {
        candidates: [{ uid: 'account-' + data.query, name: data.query }],
      } });
      throw new Error('Chamada inesperada: ' + name);
    };
  });
  for (const script of ['tournaments-import-parser.js', 'tournaments-import-allocation.js', 'tournaments-import.js']) {
    await page.addScriptTag({ path: path.join(__dirname, '..', '..', 'js', 'views', script) });
  }
  await page.evaluate(() => window._openTournamentImport('fixture'));
  await page.locator('#tournament-import-files').setInputFiles({
    name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3]),
  });
  await expect(page.locator('.sp-import-pair')).toHaveCount(8);
  await expect(page.locator('.sp-import-candidate')).toHaveCount(16);
  const panel = page.locator('.sp-import-panel');
  const candidate = page.locator('.sp-import-pair').nth(5).locator('.sp-import-candidate').first();
  await candidate.scrollIntoViewIfNeeded();
  const before = await panel.evaluate((node) => node.scrollTop);
  expect(before).toBeGreaterThan(0);
  await candidate.click();
  const after = await panel.evaluate((node) => node.scrollTop);
  expect(Math.abs(after - before)).toBeLessThan(8);
  await expect(page.locator('.sp-import-pair').nth(5)).toContainText('Conta vinculada');
  await expect(page.locator('.sp-import-pair').nth(6)).toBeVisible();
});

test('planilha individual separa 80 posições e grava somente após confirmação',async({page})=>{
 const {categories,matrix}=require('../fixtures/tournament-import-matrix').matrixFixture();
 const core=require('../../functions/tournament-import-core'),boundary=require('../../functions/canonical-registration-boundary-core');
 const XLSX=require('../../js/vendor/xlsx.full.min');
 let registrations=[],applied=0,t={id:'individual-browser',status:'closed',enrollmentMode:'individual',
  categoryDefinitions:categories,maxParticipants:80,maxParticipantsByCategory:Object.fromEntries(categories.map(c=>[c.label,c.capacity])),
  canonicalRegistrationMigration:{fingerprint:'browser-fixture',registrationCount:0}};
 await page.exposeFunction('__importCall',(name,data)=>{
  if(name==='previewTournamentImport')return {data:{mode:'individual',count:registrations.length,existingIndividuals:core.individualRoster(registrations),slots:[],categories,photoImportEnabled:false,fingerprint:core.fingerprint(t,registrations)}};
  if(name!=='applyTournamentImportBlock')throw Error('Unexpected call '+name);
  expect(data.mode).toBe('individual');expect(data.fingerprint).toBe(core.fingerprint(t,registrations));
  const changes=core.applyReviewedIndividuals(t,registrations,data.block),next=boundary.applyChanges(t,registrations,changes.updates,changes.creates);
  t=next.tournament;registrations=next.registrations;applied++;
  return {data:{count:registrations.length,existingIndividuals:core.individualRoster(registrations),fingerprint:core.fingerprint(t,registrations)}};
 });
 await page.setViewportSize({width:440,height:700});
 await page.setContent('<main>Importação isolada</main>');
 await page.addStyleTag({path:path.join(__dirname,'../../css/components.css')});
 await page.evaluate(categories=>{
  Object.defineProperty(crypto,'randomUUID',{value:()=> '12345678-1234-4234-8234-123456789abc'});
  window._findTournamentById=()=>({categoryDefinitions:categories});
  window._callCF=(name,data)=>window.__importCall(name,data);
  window.confirm=message=>{window.confirmation=message;return window.allowSave===true;};
 },categories);
 for(const script of ['js/vendor/xlsx.full.min.js','js/views/tournaments-import-parser.js','js/views/tournaments-import-allocation.js','js/views/tournaments-import.js'])
  await page.addScriptTag({path:path.join(__dirname,'../..',script)});
 await page.evaluate(()=>_openTournamentImport('individual-browser'));
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(matrix),'Inscritos');
 await page.locator('#tournament-import-files').setInputFiles({name:'inscricoes-preliminares.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}))});
 await expect(page.locator('.sp-import-toolbar')).toContainText('80 na prévia');
 await expect(page.locator('.sp-import-summary')).toContainText('3 vagas sem nome');
 await expect(page.locator('.sp-import-pair').first()).toContainText('Fem A');
 await expect(page.locator('.sp-import-pair').first()).not.toContainText('MASCULINA');
 expect(applied).toBe(0);
 await page.locator('[data-act="next"]').click();
 await expect(page.locator('.sp-import-person-name').filter({hasText:'Vaga sem nome'})).toHaveCount(2);
 await page.locator('[data-act="save"]').click();
 expect(applied).toBe(0);
 await page.evaluate(()=>window.allowSave=true);
 await page.locator('[data-act="save"]').click();
 await expect.poll(()=>applied).toBe(10);
 expect(registrations).toHaveLength(80);expect(registrations.filter(r=>r.isPlaceholder)).toHaveLength(3);
 expect(registrations.every(r=>!r.participantUid&&!r.fixedPairId)).toBe(true);
 expect(await page.evaluate(()=>window.confirmation)).toContain('substituições mostradas');
});
