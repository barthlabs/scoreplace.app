// scoreplace.app — CENÁRIO Fase 2: PRESENÇA / CHECK-IN por GPS.
//
// Pilar "Presença". Mocka a geolocalização do navegador (Playwright context.setGeolocation)
// pra cair EXATAMENTE num local preferido do usuário e dispara o check REAL por GPS
// (window._presenceGeoCheck). O motor real (findMatch → _myVenueState → suggest) mostra o
// pop-up "📍 Você está aqui?"; espionamos window.showConfirmDialog pra registrar o pop-up e
// auto-confirmar (simula o clique "Sim, estou aqui") — o resto é 100% real: autoRegister →
// PresenceDB.savePresence grava um check-in (source='geo') na coleção `presences`.
//
// Asserimos: (a) o pop-up disparou (GPS→match); (b) o check-in PERSISTE no Firestore com
// source='geo' e modalidades. STAGING só (escreve em presences). Doc apagado no cleanup.

const { test, expect } = require('@playwright/test');

const EMAIL = 'e2e-bot@scoreplace.test';
const PASSWORD = 'Teste!2026e2e';
const LAT = -23.56130;
const LON = -46.65600;

test.describe('PRESENÇA — check-in por GPS (staging)', () => {
  test.beforeEach(async ({ context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'presença/GPS só no desktop');
    let host = ''; try { host = new URL(baseURL || '').hostname; } catch (e) {}
    const isStaging = /(^|\.)scoreplace-staging\.(web\.app|firebaseapp\.com)$/.test(host);
    test.skip(!isStaging, 'fluxo de ESCRITA só roda contra staging (host=' + (host || '?') + ')');
    // GPS mockado: exatamente sobre o local preferido do usuário.
    await context.grantPermissions(['geolocation'], { origin: baseURL });
    await context.setGeolocation({ latitude: LAT, longitude: LON });
  });

  test('GPS num local preferido → pop-up "Você está aqui?" → check-in persiste', async ({ page }) => {
    test.setTimeout(60000);
    let cleanupId;
    try {
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForTimeout(1500);

      const setup = await page.evaluate(async ({ EMAIL, PASSWORD, LAT, LON }) => {
        const fb = window.firebase;
        try { await fb.auth().signInWithEmailAndPassword(EMAIL, PASSWORD); }
        catch (e) { try { await fb.auth().createUserWithEmailAndPassword(EMAIL, PASSWORD); } catch (e2) { return { err: 'auth:' + (e2.code || e2.message) }; } }
        const u = fb.auth().currentUser;
        // placeId E nome ÚNICOS por run: _myVenueState casa presença por placeId OU nome
        // normalizado (presence-geo.js:215) → nome fixo faria uma run ver o check-in
        // remanescente da anterior como "já presente" e pular o pop-up (flake em repeat).
        const stamp = Date.now();
        const rawPlaceId = 'e2e_pref_' + stamp;
        const venueName = 'Quadra E2E ' + stamp;
        window.AppStore.currentUser = {
          uid: u.uid, email: u.email, displayName: 'E2E Bot',
          presenceVisibility: 'friends',
          preferredSports: ['Beach Tennis'],
          preferredLocations: [{ placeId: rawPlaceId, name: venueName, lat: LAT, lng: LON }]
        };
        window._authStateResolved = true;
        // Espia o pop-up e auto-confirma (simula "Sim, estou aqui"). O resto é real.
        window.__confirmCalls = [];
        window.showConfirmDialog = function (title, msg, onConfirm) {
          window.__confirmCalls.push({ title: title, msg: msg });
          if (typeof onConfirm === 'function') onConfirm();
        };
        // dispara o check por GPS (fresh → ignora cache; usa a geolocation mockada)
        window._presenceGeoCheck({ fresh: true });
        return { uid: u.uid, venueKey: window.PresenceDB.venueKey(rawPlaceId, venueName) };
      }, { EMAIL, PASSWORD, LAT, LON });
      expect(setup.err, 'sem erro de auth').toBeFalsy();

      // (a) o pop-up "📍 Você está aqui?" disparou → GPS casou com o preferido
      await expect
        .poll(async () => page.evaluate(() => (window.__confirmCalls || []).some((c) => /Você está aqui/i.test(c.title || ''))), { timeout: 15000 })
        .toBe(true);

      // (b) o check-in por GPS PERSISTE em `presences` (source='geo', com modalidades).
      // query por uid (single-field) + filtro client-side do placeId (sem índice composto).
      const checkin = await page.evaluate(async ({ uid, venueKey }) => {
        for (let i = 0; i < 25; i++) {
          const snap = await window.FirestoreDB.db.collection('presences').where('uid', '==', uid).limit(20).get();
          const docs = snap.docs.map((d) => Object.assign({ _id: d.id }, d.data()));
          const ci = docs.find((d) => d.placeId === venueKey && d.type === 'checkin' && d.source === 'geo' && !d.cancelled);
          if (ci) return { found: true, id: ci._id, source: ci.source, sports: ci.sports };
          await new Promise((r) => setTimeout(r, 300));
        }
        return { found: false };
      }, { uid: setup.uid, venueKey: setup.venueKey });
      expect(checkin.found, 'check-in por GPS persistido em presences').toBe(true);
      expect(checkin.source, 'origem = geo').toBe('geo');
      expect(Array.isArray(checkin.sports) && checkin.sports.length, 'check-in com modalidades').toBeTruthy();
      cleanupId = checkin.id;
    } finally {
      if (cleanupId) {
        await page.evaluate((id) => { try { return window.FirestoreDB.db.collection('presences').doc(id).delete(); } catch (e) {} }, cleanupId).catch(() => {});
      }
    }
  });
});
