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
  // Rei/Rainha é MODO de sorteio, não formato — o create grava format='Liga' + drawMode='rei_rainha'
  // (ver phase0-monarch.test.js e project_rei_rainha_is_drawmode_not_format). O shape legado
  // format='Rei/Rainha da Praia' sorteia canônico mas NÃO renderiza (cai fora do dispatch de
  // renderBracket: não é isLiga, sem t.matches, sem t.groups). Testar o shape que o app produz.
  { key: 'monarch', label: 'Rei/Rainha', format: 'Liga', teamSize: 1, n: 8, extra: { drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', drawManual: true },
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

// CENÁRIO CRÍTICO da Fase 2: criar → sortear → LANÇAR RESULTADO → ENCERRAR.
// Cobre o que o loop acima não cobre (ele para no render). Prova em duas camadas:
// (a) caminho REAL de UI — preenche os inputs de placar e chama _saveResultInline (o mesmo
//     que o botão Confirmar dispara); confirma que o vencedor PERSISTE no Firestore;
// (b) caminho de ENCERRAMENTO — joga o resto pelo motor (_advanceWinner + _maybeFinishElimination,
//     robusto) até status='finished', e assere o pódio no DOM do torneio encerrado.
test.describe('CICLO DE VIDA — lançar resultado → encerrar (single-elim, staging)', () => {
  test.beforeEach(async ({ baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'ciclo de vida só no desktop');
    let host = ''; try { host = new URL(baseURL || '').hostname; } catch (e) {}
    const isStaging = /(^|\.)scoreplace-staging\.(web\.app|firebaseapp\.com)$/.test(host);
    test.skip(!isStaging, 'fluxo de ESCRITA só roda contra staging (host=' + (host || '?') + ')');
  });

  test('resultado real (UI) persiste + torneio encerra com pódio', async ({ page }) => {
    test.setTimeout(60000);
    let id;
    try {
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      // resultEntry='organizer' → o bot (creatorUid) lança direto, sem fluxo de aprovação.
      const built = await createAndDraw(page, { key: 'life', label: 'Ciclo', format: 'Eliminatórias Simples', teamSize: 1, n: 4, extra: { resultEntry: 'organizer' } });
      expect(built.err, 'sem erro de auth/save/draw').toBeFalsy();
      id = built.id;
      expect(built.drawn, 'torneio sorteado').toBeTruthy();
      await gotoBracket(page, id);

      // (a) CAMINHO REAL DE UI: inputs de placar do 1º jogo pronto + _saveResultInline.
      const uiSave = await page.evaluate(async ({ id }) => {
        const t = window._findTournamentById(id);
        const playable = (window._collectAllMatches(t) || []).filter((x) => x && !x.winner && !x.isBye && x.p1 && x.p2 && x.p1 !== 'TBD' && x.p2 !== 'TBD' && x.p1 !== 'BYE' && x.p2 !== 'BYE');
        if (!playable.length) return { err: 'sem jogo jogável' };
        const m = playable[0];
        const s1 = document.getElementById('s1-' + m.id), s2 = document.getElementById('s2-' + m.id);
        if (!s1 || !s2) return { err: 'inputs de placar não renderizados (s1/s2-' + m.id + ')' };
        s1.value = '6'; s2.value = '3';
        window._saveResultInline(id, m.id);
        await new Promise((r) => setTimeout(r, 150)); // deixa a mutação otimista assentar
        const tt = window._findTournamentById(id);
        const fm = window._findMatch(tt, m.id);
        return { matchId: m.id, winner: fm && fm.winner, expectWinner: m.p1 };
      }, { id });
      expect(uiSave.err, 'inputs reais de placar existem e salvam').toBeFalsy();
      expect(uiSave.winner, '6×3 → p1 vence (winner setado)').toBe(uiSave.expectWinner);

      // persistiu no Firestore? _saveResultInline persiste via commitResultTx (transação
      // async) — POLL o doc CRU até o winner aparecer (não confia num wait fixo).
      const persisted = await page.evaluate(async ({ id, matchId, expectWinner }) => {
        for (let i = 0; i < 20; i++) {
          const snap = await window.FirestoreDB.db.collection('tournaments').doc(id).get();
          const t = snap.data() || {}; const all = [];
          (t.matches || []).forEach((m) => all.push(m));
          (t.rounds || []).forEach((r) => (r.matches || []).forEach((m) => all.push(m)));
          const fm = all.find((m) => m && m.id === matchId);
          if (fm && fm.winner === expectWinner) return { winner: fm.winner, tries: i + 1 };
          await new Promise((r) => setTimeout(r, 300));
        }
        return { winner: null };
      }, { id, matchId: uiSave.matchId, expectWinner: uiSave.expectWinner });
      expect(persisted.winner, 'resultado persistido no Firestore (não só em memória)').toBe(uiSave.expectWinner);

      // (b) ENCERRA: joga o resto pelo motor até _maybeFinishElimination marcar finished.
      const finish = await page.evaluate(async ({ id }) => {
        const t = window._findTournamentById(id);
        let guard = 0;
        while (guard++ < 60) {
          const m = (window._collectAllMatches(t) || []).find((x) => x && !x.winner && !x.isBye && x.p1 && x.p2 && x.p1 !== 'TBD' && x.p2 !== 'TBD' && x.p1 !== 'BYE' && x.p2 !== 'BYE');
          if (!m) break;
          m.scoreP1 = 6; m.scoreP2 = 2; m.winner = m.p1; m.resultAt = Date.now();
          if (window._advanceWinner) window._advanceWinner(t, m);
          if (window._maybeFinishElimination) window._maybeFinishElimination(t);
        }
        await window.FirestoreDB.saveTournament(t);
        return { status: (window._findTournamentById(id) || {}).status };
      }, { id });
      expect(finish.status, 'torneio encerrado (status=finished)').toBe('finished');

      // pódio/classificação do torneio ENCERRADO renderiza no detalhe.
      const html = await gotoBracket(page, id);
      expect(html, 'pódio/campeão no DOM do encerrado').toMatch(/🥇|Pódio|Campe|Classifica/i);
    } finally {
      await cleanup(page, id);
    }
  });
});
