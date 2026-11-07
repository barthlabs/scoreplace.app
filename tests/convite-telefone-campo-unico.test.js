'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="view-container"></main>');
    await page.addStyleTag({ path: path.join(root, 'css/components.css') });
    await page.evaluate(() => {
      window.AppStore = { currentUser: { uid: 'owner' }, tournaments: [{ id: 'tour-test', name: 'Teste' }] };
      window._souOrganizador = () => true;
      window.FirestoreDB = { db: { collection: () => ({ doc: () => ({ collection: () => ({
        get: async () => ({ forEach: () => {} })
      }) }) }) }, listLegacyFriendships: async () => [] };
      window._preloadUserProfiles = async () => {};
      window._sentPhoneInvites = [];
      window._callCF = async (name, payload) => {
        window._sentPhoneInvites.push({ name, payload });
        return { data: { ok: true, phone: '+5511987654321', smsText: 'Convite de teste' } };
      };
    });
    const authSource = fs.readFileSync(path.join(root, 'js/views/auth.js'), 'utf8');
    const helpers = authSource.slice(authSource.indexOf('// === Helpers para máscara de telefone ==='), authSource.indexOf('function _setupPhoneMask'));
    await page.addScriptTag({ content: helpers });
    assert.equal(await page.evaluate(() => typeof window._phoneMaskFor), 'function', 'máscara canônica carregada');
    await page.addScriptTag({ path: path.join(root, 'js/views/host-transfer.js') });
    const open = async role => page.evaluate(role => window._openTournamentFriendInvitePicker('tour-test', role), role);
    const phone = page.getByRole('textbox', { name: 'DDD e telefone' });
    const country = page.getByRole('combobox', { name: 'País e DDI do telefone' });
    const send = page.getByRole('button', { name: 'Preparar SMS' });
    const calls = async () => page.evaluate(() => window._sentPhoneInvites);
    await open('cohost');
    assert.equal(await country.inputValue(), '55');
    assert.match(await country.locator('option:checked').textContent(), /🇧🇷 \+55/);
    assert.equal(await page.locator('input[aria-label="DDD"]').count(), 0);
    assert.equal(await page.locator('input[aria-label="Número de telefone"]').count(), 0);
    await phone.fill('1187654321');
    assert.equal(await phone.inputValue(), '(11) 8765-4321');
    await send.click();
    await page.getByRole('link', { name: 'Abrir SMS' }).waitFor();
    assert.deepEqual((await calls())[0], { name: 'createTeamPhoneInvite', payload: {
      tournamentId: 'tour-test', role: 'cohost', ddi: '55', ddd: '11', number: '87654321'
    } });
    assert.match(await page.getByRole('link', { name: 'Abrir SMS' }).getAttribute('href'), /^sms:\+5511987654321\?body=Convite/);

    await phone.fill('+55 11 98765-4321');
    assert.equal(await phone.inputValue(), '(11) 98765-4321');
    await send.click();
    await page.waitForFunction(() => window._sentPhoneInvites.length === 2);
    assert.deepEqual((await calls())[1].payload, {
      tournamentId: 'tour-test', role: 'cohost', ddi: '55', ddd: '11', number: '987654321'
    });

    await phone.evaluate(el => {
      el.value = '5511987654321';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    });
    assert.equal(await phone.inputValue(), '(11) 98765-4321', 'colagem com DDI sem + usa o país escolhido');

    await phone.fill('+55 11 8765-432');
    await send.click();
    assert.equal((await calls()).length, 2, 'número internacional curto não troca o DDD por 55');
    await phone.fill('+55 11 98765-4321');
    await country.selectOption('1');
    assert.equal(await phone.inputValue(), '(11) 98765-4321', 'troca de país não trunca número longo');
    await send.click();
    assert.equal((await calls()).length, 2, 'DDI divergente bloqueia convite');
    await country.selectOption('351');
    assert.equal(await phone.inputValue(), '(11) 98765-4321');
    await send.click();
    assert.equal((await calls()).length, 2, 'troca para máscara mais curta segue bloqueada');
    await phone.fill('912345678');
    assert.equal(await phone.inputValue(), '912 345 678');
    await send.click();
    await page.waitForFunction(() => window._sentPhoneInvites.length === 3);
    assert.deepEqual((await calls())[2].payload, {
      tournamentId: 'tour-test', role: 'cohost', ddi: '351', ddd: '912', number: '345678'
    });

    await open('referee');
    assert.equal(await country.inputValue(), '55');
    await phone.fill('11987654321');
    await send.click();
    await page.waitForFunction(() => window._sentPhoneInvites.length === 4);
    assert.equal((await calls())[3].payload.role, 'referee');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      const colors = await country.evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
      assert.notEqual(colors.foreground, colors.background, theme + ': seletor legível');
    }
  } finally {
    await browser.close();
  }
  console.log('convite-telefone-campo-unico: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
