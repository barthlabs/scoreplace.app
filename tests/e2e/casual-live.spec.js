// scoreplace.app — CENÁRIO Fase 2: PARTIDA CASUAL AO VIVO (placar GSM ponto-a-ponto).
//
// Pilar "Partidas Casuais". Dirige o motor de placar ao vivo REAL pelo navegador:
// abre o live scoring casual (Beach Tennis, dupla), marca ponto a ponto via
// window._liveScorePoint (o mesmo que os botões +1 disparam), e o motor GSM real
// (_checkGameWon/_checkSetWon/_checkMatchWon) fecha game → set → partida. No fim,
// _finishSet auto-salva (updateCasualMatch) em casualMatches/{docId} com status='finished'.
// Asserimos: (a) vencedor correto no _lastCasualSaveResult (síncrono); (b) persistência
// real no Firestore (poll do doc). Beach Tennis casual = 1 set, 6 games, golden point
// (4 pts/game, sem deuce) → um 6-0 fecha game(×6)+set+partida SEM cair no diálogo de 5-5.
//
// STAGING só (escreve em casualMatches). Doc de teste apagado no cleanup.

const { test, expect } = require('@playwright/test');

const EMAIL = 'e2e-bot@scoreplace.test';
const PASSWORD = 'Teste!2026e2e';

test.describe('CASUAL AO VIVO — placar GSM ponto-a-ponto (staging)', () => {
  test.beforeEach(async ({ baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'casual ao vivo só no desktop');
    let host = ''; try { host = new URL(baseURL || '').hostname; } catch (e) {}
    const isStaging = /(^|\.)scoreplace-staging\.(web\.app|firebaseapp\.com)$/.test(host);
    test.skip(!isStaging, 'fluxo de ESCRITA só roda contra staging (host=' + (host || '?') + ')');
  });

  test('Beach Tennis dupla: 6-0 fecha a partida e persiste o vencedor', async ({ page }) => {
    test.setTimeout(60000);
    let docId;
    try {
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForTimeout(1500);

      // auth real + pré-cria o doc casual (espelha _casualStart) + abre o placar ao vivo.
      const started = await page.evaluate(async ({ EMAIL, PASSWORD }) => {
        const fb = window.firebase;
        try { await fb.auth().signInWithEmailAndPassword(EMAIL, PASSWORD); }
        catch (e) { try { await fb.auth().createUserWithEmailAndPassword(EMAIL, PASSWORD); } catch (e2) { return { err: 'auth:' + (e2.code || e2.message) }; } }
        const u = fb.auth().currentUser;
        window.AppStore.currentUser = { uid: u.uid, email: u.email, displayName: 'E2E Bot' };
        window._authStateResolved = true;
        window._lastCasualSaveResult = null; // limpa qualquer resíduo de run anterior
        const cfg = (window._casualScoringDefaultsMap && window._casualScoringDefaultsMap()['Beach Tennis']) || null;
        const players = [
          { name: 'Ana', displayName: 'Ana', team: 1, uid: 'botA' },
          { name: 'Bruno', displayName: 'Bruno', team: 1, uid: 'botB' },
          { name: 'Carlos', displayName: 'Carlos', team: 2, uid: 'botC' },
          { name: 'Diana', displayName: 'Diana', team: 2, uid: 'botD' }
        ];
        const docId = await window.FirestoreDB.saveCasualMatch({
          status: 'active', sport: 'Beach Tennis', isDoubles: true, createdBy: u.uid,
          players: players, playerUids: [u.uid], scoring: cfg, createdAt: new Date().toISOString()
        });
        if (!docId) return { err: 'saveCasualMatch retornou null' };
        window._openLiveScoring(null, null, {
          casual: true, scoring: cfg, sportName: 'Beach Tennis',
          p1Name: 'Ana / Bruno', p2Name: 'Carlos / Diana', isDoubles: true,
          casualDocId: docId, createdBy: u.uid, players: players, title: 'Partida Casual'
        });
        return { docId, cfg };
      }, { EMAIL, PASSWORD });
      expect(started.err, 'sem erro de auth/save/open').toBeFalsy();
      docId = started.docId;
      // sanidade do config: Beach Tennis casual = 1 set / 6 games / golden point / sem tiebreak
      expect(started.cfg && started.cfg.setsToWin, 'setsToWin=1').toBe(1);
      expect(started.cfg && started.cfg.gamesPerSet, 'gamesPerSet=6').toBe(6);

      // overlay do placar ao vivo montou
      await expect(page.locator('#live-scoring-overlay')).toBeVisible();

      // marca 24 pontos pro Time 1 (6 games × 4 pts, golden point) → 6-0 → set → partida.
      // O motor GSM real fecha cada game/set/match; _finishSet auto-salva no último ponto.
      const played = await page.evaluate(async () => {
        for (let i = 0; i < 24; i++) {
          window._liveScorePoint(1);
          await new Promise((r) => setTimeout(r, 15)); // deixa render/haptic assentar
          if (window._lastCasualSaveResult) break; // partida já fechou
        }
        const r = window._lastCasualSaveResult;
        return { finished: !!r, winner: r && r.winner, docId: r && r.docId };
      });
      expect(played.finished, 'partida fechou (_lastCasualSaveResult setado)').toBeTruthy();
      expect(played.winner, 'Time 1 venceu (6-0)').toBe(1);

      // persistiu no Firestore? POLL o doc casual até status='finished' com o vencedor.
      const persisted = await page.evaluate(async ({ docId }) => {
        for (let i = 0; i < 20; i++) {
          const snap = await window.FirestoreDB.db.collection('casualMatches').doc(docId).get();
          const d = snap.exists ? snap.data() : null;
          if (d && d.status === 'finished' && d.result) {
            return { status: d.status, winner: d.result.winner, summary: d.result.summary || '' };
          }
          await new Promise((r) => setTimeout(r, 300));
        }
        return { status: null };
      }, { docId });
      expect(persisted.status, 'partida casual persistida como finished').toBe('finished');
      expect(persisted.winner, 'vencedor persistido = Time 1').toBe(1);
      expect(persisted.summary, 'resumo reflete um set 6-0').toMatch(/6.*0/);
    } finally {
      if (docId) {
        await page.evaluate((id) => { try { return window.FirestoreDB.db.collection('casualMatches').doc(id).delete(); } catch (e) {} }, docId).catch(() => {});
      }
    }
  });
});
