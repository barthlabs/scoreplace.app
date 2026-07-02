// scoreplace.app — CENÁRIO Fase 2: APROVAÇÃO DE RESULTADO POR PARTICIPANTES (4 fases).
//
// Máquina de estados de bracket-ui.js, dirigida ponta a ponta pelas funções REAIS:
//   (1) Time A propõe        → _saveResultInline           → pendingResult (sem counter)
//   (2) Time B contrapropõe   → _editPendingResult + confirm → pendingResult.isCounterProposal
//   (3) Time A contesta       → _contestResult               → pendingResult.disputed
//   (4) Organizador resolve   → _editPendingResult (autoridade→_approveResult) → winner definitivo
//
// Multi-ator: um único login real (o bot = ORGANIZADOR/creatorUid, então TODAS as escritas
// passam nas Firestore rules via isTournamentAdmin). O PAPEL de cada ato (Time A / Time B / org)
// é a identidade que a LÓGICA lê de AppStore.currentUser — trocada entre as fases. Os elementos
// de DOM que as funções leem (inputs de placar, spans do banner) são injetados quando o render
// não os fornece: o foco do teste é a LÓGICA de aprovação, não a renderização dos inputs.
//
// STAGING só (escreve no torneio). Doc apagado no cleanup.

const { test, expect } = require('@playwright/test');

const EMAIL = 'e2e-bot@scoreplace.test';
const PASSWORD = 'Teste!2026e2e';
const TA = { uid: 'e2e_tA', email: 'ta@e2e.test', displayName: 'Time A' };
const TB = { uid: 'e2e_tB', email: 'tb@e2e.test', displayName: 'Time B' };

test.describe('APROVAÇÃO DE RESULTADO — 4 fases (staging)', () => {
  test.beforeEach(async ({ baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'aprovação só no desktop');
    let host = ''; try { host = new URL(baseURL || '').hostname; } catch (e) {}
    const isStaging = /(^|\.)scoreplace-staging\.(web\.app|firebaseapp\.com)$/.test(host);
    test.skip(!isStaging, 'fluxo de ESCRITA só roda contra staging (host=' + (host || '?') + ')');
  });

  test('proposta → contraproposta → contestação → organizador finaliza', async ({ page }) => {
    test.setTimeout(70000);
    let tId;
    try {
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForTimeout(1500);

      // SETUP: bot autentica como ORGANIZADOR; cria torneio 2 jogadores (Time A vs Time B),
      // resultEntry='players', sorteia via motor real → 1 jogo. Time A/B têm uid (exige aprovação).
      const setup = await page.evaluate(async ({ EMAIL, PASSWORD, TA, TB }) => {
        const fb = window.firebase;
        try { await fb.auth().signInWithEmailAndPassword(EMAIL, PASSWORD); }
        catch (e) { try { await fb.auth().createUserWithEmailAndPassword(EMAIL, PASSWORD); } catch (e2) { return { err: 'auth:' + (e2.code || e2.message) }; } }
        const u = fb.auth().currentUser;
        const botUid = u.uid;
        const id = 'e2e_approval_' + Date.now();
        const t = {
          id, name: 'E2E Aprovação', format: 'Eliminatórias Simples', teamSize: 1,
          creatorUid: botUid, organizerEmail: u.email, memberUids: [botUid, TA.uid, TB.uid],
          resultEntry: 'players',
          participants: [
            { displayName: TA.displayName, name: TA.displayName, uid: TA.uid, email: TA.email },
            { displayName: TB.displayName, name: TB.displayName, uid: TB.uid, email: TB.email }
          ],
          status: 'open', createdAt: new Date().toISOString()
        };
        window.AppStore.currentUser = { uid: botUid, email: u.email, displayName: 'E2E Bot' };
        window._authStateResolved = true;
        if (!Array.isArray(window.AppStore.tournaments)) window.AppStore.tournaments = [];
        window.AppStore.tournaments = window.AppStore.tournaments.filter((x) => x.id !== id).concat(t);
        try { await window.FirestoreDB.saveTournament(t); } catch (e) { return { err: 'save:' + (e.code || e.message) }; }
        try { window.generateDrawFunction(id); } catch (e) { return { err: 'draw:' + (e.code || e.message) }; }
        await new Promise((r) => setTimeout(r, 900));
        const tt = window._findTournamentById(id);
        const all = (window._collectAllMatches ? window._collectAllMatches(tt) : (tt.matches || []));
        const m = all.find((x) => x && x.p1 && x.p2 && x.p1 !== 'BYE' && x.p2 !== 'BYE');
        if (!m) return { err: 'sem jogo jogável pós-sorteio' };
        return { tId: id, matchId: m.id, botUid, p1: m.p1, p2: m.p2 };
      }, { EMAIL, PASSWORD, TA, TB });
      expect(setup.err, 'sem erro no setup').toBeFalsy();
      tId = setup.tId;
      const matchId = setup.matchId;
      // o jogo é Time A (p1) vs Time B (p2)
      expect(setup.p1).toBe(TA.displayName);
      expect(setup.p2).toBe(TB.displayName);

      // helpers reutilizáveis dentro do page-context
      const ctx = { tId, matchId };

      // troca a identidade que a LÓGICA lê e re-renderiza o bracket como esse ator
      async function actAs(user) {
        await page.evaluate(({ user, tId }) => {
          window.AppStore.currentUser = user;
          window._authStateResolved = true;
          window.location.hash = '#bracket/' + tId;
        }, { user, tId });
        await page.waitForTimeout(900);
      }

      // ── FASE 1: Time A propõe 10×5 ────────────────────────────────────────────
      await actAs(TA);
      const p1 = await page.evaluate(({ tId, matchId }) => {
        let s1 = document.getElementById('s1-' + matchId), s2 = document.getElementById('s2-' + matchId);
        if (!s1) { s1 = document.createElement('input'); s1.id = 's1-' + matchId; document.body.appendChild(s1); }
        if (!s2) { s2 = document.createElement('input'); s2.id = 's2-' + matchId; document.body.appendChild(s2); }
        s1.value = '10'; s2.value = '5';
        window._saveResultInline(tId, matchId);
        const m = window._findMatch(window._findTournamentById(tId), matchId);
        const pr = m.pendingResult;
        return pr ? { isCounter: !!pr.isCounterProposal, by: pr.proposedBy, sp1: pr.scoreP1, sp2: pr.scoreP2, disputed: !!pr.disputed } : { none: true };
      }, ctx);
      expect(p1.none, 'FASE 1: pendingResult criado').toBeFalsy();
      expect(p1.isCounter, 'FASE 1: NÃO é contraproposta').toBe(false);
      expect(p1.by, 'FASE 1: proposto pelo Time A').toBe(TA.uid);
      expect(p1.sp1).toBe(10); expect(p1.sp2).toBe(5);

      // ── FASE 2: Time B contrapropõe 10×8 ──────────────────────────────────────
      await actAs(TB);
      const p2 = await page.evaluate(({ tId, matchId }) => {
        // injeta os spans-host que _editPendingResult lê, se o render não os forneceu
        ['score-p1-' + matchId, 'score-p2-' + matchId, 'header-btns-' + matchId, 'pending-banner-btns-' + matchId]
          .forEach((id) => { if (!document.getElementById(id)) { const e = document.createElement('span'); e.id = id; document.body.appendChild(e); } });
        window._editPendingResult(tId, matchId); // cria inputs s1/s2 + botão confirm-pending-edit
        const s1 = document.getElementById('s1-' + matchId), s2 = document.getElementById('s2-' + matchId);
        if (!s1 || !s2) return { err: '_editPendingResult não criou os inputs' };
        s1.value = '10'; s2.value = '8';
        const btn = document.getElementById('confirm-pending-edit-' + matchId);
        if (!btn) return { err: 'sem botão confirm-pending-edit' };
        btn.click();
        const m = window._findMatch(window._findTournamentById(tId), matchId);
        const pr = m.pendingResult || {};
        return { isCounter: !!pr.isCounterProposal, by: pr.proposedBy, sp1: pr.scoreP1, sp2: pr.scoreP2, hasOrig: !!pr.originalProposal };
      }, ctx);
      expect(p2.err, 'FASE 2 sem erro').toBeFalsy();
      expect(p2.isCounter, 'FASE 2: contraproposta marcada').toBe(true);
      expect(p2.by, 'FASE 2: contraproposta do Time B').toBe(TB.uid);
      expect(p2.sp1).toBe(10); expect(p2.sp2).toBe(8);
      expect(p2.hasOrig, 'FASE 2: preserva a proposta original do Time A').toBe(true);
      await page.waitForTimeout(500);

      // ── FASE 3: Time A contesta ───────────────────────────────────────────────
      await actAs(TA);
      const p3 = await page.evaluate(({ tId, matchId }) => {
        window.showConfirmDialog = function (title, msg, onConfirm) { if (typeof onConfirm === 'function') onConfirm(); };
        window._contestResult(tId, matchId);
        const m = window._findMatch(window._findTournamentById(tId), matchId);
        const pr = m.pendingResult || {};
        return { disputed: !!pr.disputed, disputedBy: pr.disputedBy };
      }, ctx);
      expect(p3.disputed, 'FASE 3: resultado em disputa').toBe(true);
      expect(p3.disputedBy, 'FASE 3: contestado pelo Time A').toBe(TA.uid);
      await page.waitForTimeout(500);

      // ── FASE 4: Organizador lança placar definitivo 10×6 ──────────────────────
      await actAs({ uid: setup.botUid, email: EMAIL, displayName: 'E2E Bot' });
      const p4 = await page.evaluate(({ tId, matchId }) => {
        ['score-p1-' + matchId, 'score-p2-' + matchId, 'header-btns-' + matchId, 'pending-banner-btns-' + matchId]
          .forEach((id) => { if (!document.getElementById(id)) { const e = document.createElement('span'); e.id = id; document.body.appendChild(e); } });
        window._editPendingResult(tId, matchId); // autoridade → cria inputs + confirm finaliza
        const s1 = document.getElementById('s1-' + matchId), s2 = document.getElementById('s2-' + matchId);
        if (!s1 || !s2) return { err: 'org: _editPendingResult não criou inputs' };
        s1.value = '10'; s2.value = '6';
        const btn = document.getElementById('confirm-pending-edit-' + matchId);
        if (!btn) return { err: 'org: sem botão confirm-pending-edit' };
        btn.click();
        return { ok: true };
      }, ctx);
      expect(p4.err, 'FASE 4 sem erro').toBeFalsy();
      await page.waitForTimeout(900);

      // resultado DEFINITIVO em memória: winner=Time A (10×6), pendingResult removido
      const fin = await page.evaluate(({ tId, matchId }) => {
        const m = window._findMatch(window._findTournamentById(tId), matchId);
        return { winner: m.winner, hasPending: !!m.pendingResult, sp1: m.scoreP1, sp2: m.scoreP2 };
      }, ctx);
      expect(fin.hasPending, 'FASE 4: pendingResult removido').toBe(false);
      expect(fin.winner, 'FASE 4: vencedor = Time A (10×6)').toBe(TA.displayName);
      expect(fin.sp1).toBe(10); expect(fin.sp2).toBe(6);

      // e PERSISTIU no Firestore (poll do doc cru)
      const persisted = await page.evaluate(async ({ tId, matchId, winnerName }) => {
        for (let i = 0; i < 20; i++) {
          const snap = await window.FirestoreDB.db.collection('tournaments').doc(tId).get();
          const t = snap.data() || {}; const all = [];
          (t.matches || []).forEach((m) => all.push(m));
          (t.rounds || []).forEach((r) => (r.matches || []).forEach((m) => all.push(m)));
          const fm = all.find((m) => m && m.id === matchId);
          if (fm && fm.winner === winnerName && !fm.pendingResult) return { winner: fm.winner, cleared: true };
          await new Promise((r) => setTimeout(r, 300));
        }
        return { winner: null };
      }, { tId: ctx.tId, matchId: ctx.matchId, winnerName: TA.displayName });
      expect(persisted.winner, 'resultado definitivo persistido no Firestore').toBe(TA.displayName);
    } finally {
      if (tId) {
        await page.evaluate((id) => { try { return window.FirestoreDB.db.collection('tournaments').doc(id).delete(); } catch (e) {} }, tId).catch(() => {});
      }
    }
  });
});
