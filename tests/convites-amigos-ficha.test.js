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
    await page.setContent('<main id="view-container">Ficha do torneio</main><button class="btn btn-sm" onclick="window._openTournamentFriendInvitePicker()">+ Convidar organizador</button>');
    await page.addStyleTag({ path: path.join(root, 'css/components.css') });
    await page.evaluate(() => {
      window.AppStore = {
        currentUser: { uid: 'owner', friends: ['friend-joao', 'friend-maria', 'pending-user', 'cache-only'] },
        tournaments: [{ id: 'tour-test', name: 'Teste', coHosts: [{ uid: 'pending-user', status: 'pending' }], arbitros: [] }]
      };
      window._acceptedIds = ['friend-joao', 'friend-maria', 'friend-noname', 'pending-user'];
      window._legacyPending = false;
      window._friendRequests = [];
      window.FirestoreDB = {
        db: { collection: () => ({ doc: () => ({ collection: () => ({
          get: async () => ({ forEach: fn => window._acceptedIds.forEach(id => fn({ id })) })
        }) }) }) },
        listLegacyFriendships: async () => window._legacyPending ? [] : [{ uid: 'friend-legacy', displayName: 'Amizade Antiga', photoURL: '' }],
        sendFriendRequest: async (from, to) => { window._friendRequests.push({ from, to }); window._legacyPending = true; }
      };
      window._souOrganizador = () => true;
      window._preloadUserProfiles = async () => {
        window._userProfileCache = {
          'friend-joao': { displayName: 'João Silva' },
          'friend-maria': { displayName: 'Maria Lopes' },
          'friend-legacy': { displayName: 'Amizade Antiga' },
          'cache-only': { displayName: 'Pessoa só no cache' },
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
    await page.getByRole('button', { name: 'João Silva' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Amigo sem nome público/ }).count(), 0, 'perfil sem nome não pode ser confundido com outro amigo');
    assert.equal(await page.locator('#tournament-friend-invite-overlay').getByText('Pessoa só no cache').count(), 0, 'cache antigo não entra no picker mesmo com nome público');
    assert.equal(await page.getByRole('button', { name: 'Solicitar reconfirmação' }).count(), 1, 'relação legada não recebe convite de organização');
    await page.locator('input[aria-label="Buscar amigo pelo nome"]').fill('joao');
    await page.waitForFunction(() => document.querySelectorAll('#tournament-friend-invite-overlay div[style*="overflow-y"] button').length === 1);
    await page.locator('#tournament-friend-invite-overlay div[style*="overflow-y"] button').click();
    await page.waitForTimeout(250); // .btn usa transição de cor de 200 ms
    for (const theme of ['dark', 'light']) {
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      const colors = await page.locator('button[onclick*="_openTournamentFriendInvitePicker"], #tournament-friend-invite-overlay button.btn').evaluateAll(buttons => buttons.map(button => ({
        bg: getComputedStyle(button).backgroundColor, fg: getComputedStyle(button).color
      })));
      assert(colors.length >= 4 && colors.every(c => ['rgb(38, 53, 78)', 'rgb(52, 73, 103)'].includes(c.bg) && c.fg === 'rgb(255, 255, 255)'), theme + ': convites legíveis ' + JSON.stringify(colors));
    }
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
    await page.evaluate(() => { window._arbitrosInvite = async () => null; });
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    assert.equal(await page.locator('#tournament-friend-invite-overlay').count(), 1, 'null não fecha a busca');
    await page.evaluate(() => { window._arbitrosInvite = async () => undefined; });
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    assert.equal(await page.locator('#tournament-friend-invite-overlay').count(), 1, 'undefined não fecha a busca');
    await page.getByRole('button', { name: 'Fechar' }).click();

    await page.evaluate(() => {
      window.FirestoreDB.listLegacyFriendships = async () => { throw new Error('legacy unavailable'); };
      window._openTournamentFriendInvitePicker('tour-test', 'cohost');
    });
    await page.getByRole('button', { name: 'Maria Lopes' }).waitFor();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await page.evaluate(() => {
      window.FirestoreDB.listLegacyFriendships = async () => window._legacyPending ? [] : [{ uid: 'friend-legacy', displayName: 'Amizade Antiga' }];
      window.FirestoreDB.sendFriendRequest = async () => { throw new Error('request unavailable'); };
      window._openTournamentFriendInvitePicker('tour-test', 'cohost');
    });
    await page.getByRole('button', { name: 'Solicitar reconfirmação' }).click();
    await page.getByRole('button', { name: 'Maria Lopes' }).waitFor();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await page.evaluate(() => {
      window.FirestoreDB.sendFriendRequest = async (from, to) => { window._friendRequests.push({ from, to }); window._legacyPending = true; };
    });

    await page.evaluate(() => window._openTournamentFriendInvitePicker('tour-test', 'cohost'));
    await page.getByRole('button', { name: 'Solicitar reconfirmação' }).waitFor();
    await page.evaluate(() => {
      const reconfirm = [...document.querySelectorAll('#tournament-friend-invite-overlay button')]
        .find(x => x.textContent === 'Solicitar reconfirmação');
      reconfirm.click(); reconfirm.click();
    });
    await page.getByText('Pedido de reconfirmação enviado').waitFor();
    assert.deepEqual(await page.evaluate(() => window._friendRequests), [{ from: 'owner', to: 'friend-legacy' }], 'clique duplo envia um único pedido');
    assert.equal(await page.getByRole('button', { name: 'Amizade Antiga' }).count(), 0, 'pedido pendente não vira convite');
    await page.getByRole('button', { name: 'Fechar' }).click();

    await page.evaluate(() => {
      window._legacyPending = false;
      window.FirestoreDB.sendFriendRequest = async (from, to) => {
        window._friendRequests.push({ from, to }); window._legacyPending = true;
        window._acceptedIds.push(to);
        return 'auto-accepted';
      };
      window._openTournamentFriendInvitePicker('tour-test', 'cohost');
    });
    await page.getByRole('button', { name: 'Solicitar reconfirmação' }).click();
    await page.getByRole('button', { name: 'Amizade Antiga' }).waitFor();
    await page.getByRole('button', { name: 'Fechar' }).click();

    await page.evaluate(() => {
      window.FirestoreDB.db.collection = () => ({ doc: () => ({ collection: () => ({ get: async () => { throw new Error('offline'); } }) }) });
      window._openTournamentFriendInvitePicker('tour-test', 'cohost');
    });
    await page.getByText('Não foi possível carregar seus amigos. Tente novamente.').waitFor();
    assert.equal(await page.locator('#tournament-friend-invite-overlay button').filter({ hasText: 'Enviar convite' }).count(), 1, 'botão existe na falha');
    assert.equal(await page.locator('#tournament-friend-invite-overlay button').filter({ hasText: 'Enviar convite' }).isVisible(), false, 'falha fechada não permite convite');
    await page.getByRole('button', { name: 'Fechar' }).click();

    await page.evaluate(() => {
      window._pName = p => p.displayName;
      window._initiateCoHostInvite = async () => ({ error: true });
      window._openHostTransferDialog({ uid: 'friend-joao', displayName: 'João Silva' }, 'tour-test');
    });
    assert.equal(await page.locator('#opt-cohost').getAttribute('class'), 'sp-host-invite-option is-selected');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      const colors = await page.locator('.sp-host-invite-header, .sp-host-invite-confirm, #opt-cohost, #opt-transfer').evaluateAll(elements => elements.map(el => ({
        bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderColor
      })));
      assert.equal(colors[0].bg, 'rgb(88, 51, 23)', theme + ': cabeçalho sólido');
      assert.equal(colors[1].bg, 'rgb(251, 191, 36)', theme + ': confirmar legível');
      assert.equal(colors[2].bg, 'rgb(74, 52, 24)', theme + ': opção inicial selecionada');
      assert.equal(colors[3].bg, 'rgb(32, 43, 61)', theme + ': opção não selecionada');
    }
    await page.locator('#opt-transfer input').check();
    assert.equal(await page.locator('#opt-transfer').evaluate(el => el.classList.contains('is-selected')), true);
    assert.equal(await page.locator('#opt-cohost').evaluate(el => el.classList.contains('is-selected')), false);
    await page.locator('#opt-cohost input').check();
    await page.locator('#btn-confirm-host-transfer').click();
    assert.equal(await page.locator('#host-transfer-overlay').count(), 1, 'diálogo legado permanece aberto no erro');
    assert.equal(await page.locator('#btn-confirm-host-transfer').isEnabled(), true);
    await page.evaluate(() => { window._initiateCoHostInvite = async () => ({ changed: true }); });
    await page.locator('#btn-confirm-host-transfer').click();
    await page.locator('#host-transfer-overlay').waitFor({ state: 'detached' });

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
    assert(source.includes("_viewerIsOrg ? '<button type=\"button\" class=\"btn btn-sm"));
    const inviteCss = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
    assert(inviteCss.includes('button[onclick*="_openTournamentFriendInvitePicker"]'));
    assert(source.includes('Convidar organizador'));
    assert(source.includes('Convidar árbitro'));
    assert(source.includes('if (_visibleReferees.length || _refCanSeeInvites)'));
    console.log('✓ Ficha: busca sem acento, UID correto, confirmação e aviso acionável sem torneio no cache');
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error(err); process.exitCode = 1; });
