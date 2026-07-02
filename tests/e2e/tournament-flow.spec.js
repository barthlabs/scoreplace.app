// scoreplace.app — FLUXO REAL ponta a ponta (navegador + auth real + Firestore real do STAGING).
//
// A maior fidelidade da rede: auth REAL (conta de teste email/senha → token JWT real que
// autentica o Firestore SDK), CRIA o torneio (escrita real no Firestore staging, sujeita às
// rules), SORTEIA via generateDrawFunction REAL (mesma lógica do app), navega pelo ROUTER REAL
// (#tournaments/:id) e assere a chave renderizada no DOM. No fim, APAGA o torneio de teste.
//
// Por que isto importa (o dono pediu "para todos os formatos"): os atalhos de injeção/render
// direto aproximam o estado — e QUEBRAM em formatos como single-elim (a chave depende do estado
// completo que só o sorteio real gera). O fluxo real cobre TODOS os 6 formatos de verdade.
//
// STAGING é descartável (memória project_staging_env / feedback_no_live_draw_before_jul15).
// Conta de teste: e2e-bot@scoreplace.test (criada on-demand). IDs de torneio: prefixo e2e_.

const { test, expect } = require('@playwright/test');

const EMAIL = 'e2e-bot@scoreplace.test';
const PASSWORD = 'Teste!2026e2e';

// sign-in real + cria torneio (com N participantes) + sorteia via generateDrawFunction real.
// Retorna { id, matches }. O torneio fica no Firestore staging até o cleanup.
async function createAndDraw(page, specFull) {
  // só os campos serializáveis atravessam o boundary do page.evaluate (sem a função assert)
  const spec = { key: specFull.key, label: specFull.label, format: specFull.format, teamSize: specFull.teamSize, n: specFull.n, extra: specFull.extra };
  return page.evaluate(async ({ spec, EMAIL, PASSWORD }) => {
    const fb = window.firebase;
    try { await fb.auth().signInWithEmailAndPassword(EMAIL, PASSWORD); }
    catch (e) { try { await fb.auth().createUserWithEmailAndPassword(EMAIL, PASSWORD); } catch (e2) { return { err: 'auth:' + (e2.code || e2.message) }; } }
    const u = fb.auth().currentUser; const uid = u.uid;
    // token real autentica o Firestore SDK; AppStore.currentUser é só estado client-side
    window.AppStore.currentUser = { uid, email: u.email, displayName: 'E2E Bot' };
    window._authStateResolved = true;
    const parts = []; for (let i = 0; i < spec.n; i++) parts.push({ displayName: 'J' + i, name: 'J' + i, uid: 'bot' + i });
    const id = 'e2e_' + spec.key + '_' + Date.now();
    const t = Object.assign({
      id, name: 'E2E ' + spec.label, format: spec.format, teamSize: spec.teamSize || 1,
      creatorUid: uid, organizerEmail: u.email, memberUids: [uid], participants: parts,
      status: 'open', createdAt: new Date().toISOString()
    }, spec.extra || {});
    if (!Array.isArray(window.AppStore.tournaments)) window.AppStore.tournaments = [];
    window.AppStore.tournaments = window.AppStore.tournaments.filter((x) => x.id !== id).concat(t);
    try { await window.FirestoreDB.saveTournament(t); } catch (e) { return { err: 'save:' + (e.code || e.message) }; }
    try { window.generateDrawFunction(id); } catch (e) { return { err: 'draw:' + (e.code || e.message) }; }
    await new Promise((r) => setTimeout(r, 900));
    const tt = window._findTournamentById(id);
    return { id, uid, matches: (tt && tt.matches || []).length, rounds: (tt && tt.rounds || []).length, drawn: !!(tt && tt._canonicalDraw) };
  }, { spec, EMAIL, PASSWORD });
}

async function cleanup(page, id) {
  if (!id) return;
  await page.evaluate((id) => { try { return window.FirestoreDB.db.collection('tournaments').doc(id).delete(); } catch (e) {} }, id).catch(() => {});
}

// navega pelo ROUTER REAL e devolve o innerHTML renderizado do detalhe.
async function gotoBracket(page, id) {
  await page.evaluate((id) => { window.location.hash = '#tournaments/' + id; }, id);
  await page.waitForTimeout(1200);
  return page.evaluate(() => document.getElementById('view-container').innerHTML);
}

const FORMATS = [
  { key: 'single', label: 'Elim Simples', format: 'Eliminatórias Simples', teamSize: 1, n: 8,
    assert: (h) => { expect(h).toMatch(/id="card-/); expect(h).not.toMatch(/Chave Superior/); expect(h).not.toMatch(/Grupo [A-Z]/); } },
  { key: 'dupla', label: 'Dupla Elim', format: 'Dupla Eliminatória', teamSize: 1, n: 8,
    assert: (h) => { expect(h).toMatch(/Chave Superior/); expect(h).toMatch(/Chave Inferior/); expect(h).not.toMatch(/Linha \d/); } },
  { key: 'grupos', label: 'Fase de Grupos', format: 'Fase de Grupos + Eliminatórias', teamSize: 1, n: 16,
    assert: (h) => { expect((h.match(/Grupo [A-Z0-9]/g) || []).length).toBeGreaterThanOrEqual(4); expect(h).not.toMatch(/Chave Superior/); } },
  { key: 'liga', label: 'Liga', format: 'Liga', teamSize: 1, n: 8, extra: { ligaRoundFormat: 'padrao' },
    assert: (h) => { expect(h).toMatch(/Classifica/i); expect(h).toMatch(/<table|<td/); expect(h).not.toMatch(/Chave Superior/); } },
  { key: 'suico', label: 'Suíço', format: 'Suíço Clássico', teamSize: 1, n: 8, extra: { classifyFormat: 'swiss', currentStage: 'swiss', swissRounds: 3 },
    assert: (h) => { expect(h).toMatch(/Classifica/i); expect(h).toMatch(/<table|<td/); expect(h).not.toMatch(/Chave Superior/); } },
  { key: 'monarch', label: 'Rei/Rainha', format: 'Rei/Rainha da Praia', teamSize: 1, n: 8, extra: { drawMode: 'rei_rainha' },
    assert: (h) => { expect((h.match(/Grupo [A-Z0-9]/g) || []).length).toBeGreaterThanOrEqual(2); expect(h).not.toMatch(/Chave Superior/); } },
];

test.describe('FLUXO REAL — auth+criar+sortear+router+chave (navegador, staging)', () => {
  // só desktop: o fluxo é viewport-independente e escreve no Firestore staging — rodar no mobile
  // dobraria as escritas sem ganho (overflow mobile já é coberto por bracket-render.spec.js).
  test.beforeEach(async ({ baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'fluxo real só no desktop');
    // TRAVA DE PRODUÇÃO: este spec CRIA/SORTEIA/APAGA torneios no Firestore de verdade.
    // Nunca pode tocar prod (dados reais do Confra). O Firestore é escolhido por hostname
    // no auth.js — só staging aponta pro projeto isolado. Qualquer host que NÃO seja staging
    // (prod, www, etc.) é recusado aqui, mesmo que alguém passe SCOREPLACE_URL à força.
    let host = '';
    try { host = new URL(baseURL || '').hostname; } catch (e) {}
    const isStaging = /(^|\.)scoreplace-staging\.(web\.app|firebaseapp\.com)$/.test(host);
    test.skip(!isStaging, 'fluxo de ESCRITA só roda contra staging (host=' + (host || '?') + '). Use SCOREPLACE_URL=https://scoreplace-staging.web.app');
  });
  for (const spec of FORMATS) {
    test(spec.label + ' → criar, sortear e renderizar a chave (Firestore real)', async ({ page }) => {
      test.setTimeout(60000);
      let id;
      try {
        await page.goto('/', { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        const built = await createAndDraw(page, spec);
        expect(built.err, 'sem erro de auth/save/draw').toBeFalsy();
        id = built.id;
        expect(built.drawn, 'torneio sorteado (_canonicalDraw)').toBeTruthy();
        expect((built.matches + built.rounds), 'gerou jogos/rodadas').toBeGreaterThan(0);
        const html = await gotoBracket(page, id);
        expect(html).toContain('E2E ' + spec.label);   // detalhe do torneio via ROUTER real
        spec.assert(html);                               // chave/classificação certa por formato
      } finally {
        await cleanup(page, id);
      }
    });
  }
});
