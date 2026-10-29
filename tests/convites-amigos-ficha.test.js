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
    await page.setContent('<main id="view-container">Ficha do torneio</main>');
    await page.evaluate(() => {
      window.AppStore = {
        currentUser: { uid: 'owner', friends: ['friend-joao', 'friend-maria', 'pending-user'] },
        tournaments: [{ id: 'tour-test', name: 'Teste', coHosts: [{ uid: 'pending-user', status: 'pending' }], arbitros: [] }]
      };
      window._souOrganizador = () => true;
      window._preloadUserProfiles = async () => {
        window._userProfileCache = {
          'friend-joao': { displayName: 'João Silva' },
          'friend-maria': { displayName: 'Maria Lopes' },
          'pending-user': { displayName: 'João Pendente' }
        };
      };
      window._safeHtml = (s) => String(s);
      window._warn = () => {};
      window._sent = [];
    });
    await page.addScriptTag({ path: path.join(root, 'js/views/host-transfer.js') });
    await page.evaluate(() => {
      window._initiateCoHostInvite = async (id, target) => { window._sent.push({ id, uid: target.uid, role: 'cohost' }); return { changed: true }; };
      window._arbitrosInvite = async (uid, id) => { window._sent.push({ id, uid, role: 'referee' }); return { changed: true }; };
      window._openTournamentFriendInvitePicker('tour-test', 'cohost');
    });
    await page.locator('input[aria-label="Buscar amigo pelo nome"]').fill('joao');
    await page.waitForFunction(() => document.querySelectorAll('#tournament-friend-invite-overlay div[style*="overflow-y"] button').length === 1);
    await page.locator('#tournament-friend-invite-overlay div[style*="overflow-y"] button').click();
    assert.deepEqual(await page.evaluate(() => window._sent), [], 'escolher amigo não envia sem confirmação');
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    assert.deepEqual(await page.evaluate(() => window._sent), [{ id: 'tour-test', uid: 'friend-joao', role: 'cohost' }]);
    assert.equal(await page.evaluate(() => window.AppStore.tournaments[0].coHosts.some(x => x.uid === 'friend-joao' && x.status === 'pending')), true);

    await page.evaluate(() => window._openTournamentFriendInvitePicker('tour-test', 'referee'));
    await page.locator('input[aria-label="Buscar amigo pelo nome"]').fill('maria');
    await page.locator('#tournament-friend-invite-overlay div[style*="overflow-y"] button').filter({ hasText: 'Maria Lopes' }).click();
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    assert.deepEqual(await page.evaluate(() => window._sent[1]), { id: 'tour-test', uid: 'friend-maria', role: 'referee' });
    assert.equal(await page.evaluate(() => window.AppStore.tournaments[0].arbitros.some(x => x.uid === 'friend-maria' && x.status === 'invited')), true);
    assert.equal(await page.locator('#view-container').textContent(), 'Ficha do torneio');

    await page.evaluate(() => {
      window._arbitrosInvite = async () => ({ error: true });
      window._openTournamentFriendInvitePicker('tour-test', 'referee');
    });
    await page.locator('#tournament-friend-invite-overlay div[style*="overflow-y"] button').filter({ hasText: 'João Silva' }).click();
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    assert.equal(await page.locator('#tournament-friend-invite-overlay').count(), 1, 'erro de envio mantém a busca aberta para nova tentativa');
    assert.equal(await page.getByRole('button', { name: 'Enviar convite' }).isEnabled(), true);
    await page.getByRole('button', { name: 'Fechar' }).click();

    await page.addScriptTag({ path: path.join(root, 'js/views/notifications-view.js') });
    await page.evaluate(() => {
      window.AppStore.currentUser.uid = 'friend-joao';
      window.AppStore.tournaments = []; // torneio restrito ainda não pode ser lido
      window._notifAgrupaPorVisita = (items) => ({ topo: items, antigas: [], rotulo: 'Novas' });
      window._observeNotifDwell = () => {};
      window._notice = {
        _id: 'cohost-test', type: 'cohost_invite', tournamentId: 'tour-test',
        inviteStatus: 'pending', read: true, message: 'Convite', createdAt: new Date().toISOString()
      };
      window.FirestoreDB = { getNotifications: async () => [window._notice], getUnreadNotifications: async () => [] };
      window.renderNotifications(document.getElementById('view-container'));
    });
    await page.getByRole('button', { name: 'notif.accept' }).waitFor();
    await page.evaluate(() => {
      window._notice.inviteStatus = 'answered';
      window._notice.read = false;
      window.renderNotifications(document.getElementById('view-container'));
    });
    await page.waitForFunction(() => !!document.querySelector('[data-notif-autoread="1"]'));
    assert.equal(await page.getByRole('button', { name: 'notif.accept' }).count(), 0);

    await page.evaluate(() => {
      window._notice = {
        _id: 'referee-test', type: 'referee_invite', tournamentId: 'tour-test',
        inviteStatus: 'pending', read: true, message: 'Convite de arbitragem', createdAt: new Date().toISOString()
      };
      window._arbitrosSelfConfirm = (uid, id) => window._sent.push({ uid, id, action: 'accept-referee' });
      window._arbitrosDecline = (uid, id) => window._sent.push({ uid, id, action: 'decline-referee' });
      window.renderNotifications(document.getElementById('view-container'));
    });
    await page.getByRole('button', { name: 'notif.accept' }).waitFor();
    assert.equal(await page.locator('[data-notif-autoread="1"]').count(), 0);
    await page.getByRole('button', { name: 'notif.accept' }).click();
    assert.deepEqual(await page.evaluate(() => window._sent.at(-1)),
      { uid: 'friend-joao', id: 'tour-test', action: 'accept-referee' });
    await page.getByRole('button', { name: 'notif.reject' }).click();
    assert.deepEqual(await page.evaluate(() => window._sent.at(-1)),
      { uid: 'friend-joao', id: 'tour-test', action: 'decline-referee' });
    await page.evaluate(() => {
      window._notice.inviteStatus = 'answered';
      window._notice.read = false;
      window.renderNotifications(document.getElementById('view-container'));
    });
    await page.waitForFunction(() => !!document.querySelector('[data-notif-autoread="1"]'));
    assert.equal(await page.getByRole('button', { name: 'notif.accept' }).count(), 0);

    const source = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
    assert(source.includes("_viewerIsOrg ? '<button type=\"button\" class=\"btn btn-sm\""));
    assert(source.includes('Convidar organizador'));
    assert(source.includes('Convidar árbitro'));
    assert(source.includes('if (_visibleReferees.length || _refCanSeeInvites)'));
    console.log('✓ Ficha: busca sem acento, UID correto, confirmação e aviso acionável sem torneio no cache');
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error(err); process.exitCode = 1; });
