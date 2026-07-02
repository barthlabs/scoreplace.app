/* Captura VISUAL — navega o app REAL (staging), cria+sorteia cada formato pelo fluxo real
 * (auth real → Firestore real → generateDrawFunction → router real) e tira SCREENSHOT da chave
 * renderizada. Não é teste (não assere) — é pra o dono VER o que de fato aparece na tela.
 *
 * Rodar:  SCOREPLACE_URL=https://scoreplace-staging.web.app node tests/visual-capture.js
 * Saída:  screenshots em OUT_DIR (passado por env SHOT_DIR).
 */
const { chromium } = require('@playwright/test');

const URL = process.env.SCOREPLACE_URL || 'https://scoreplace-staging.web.app';
const OUT = process.env.SHOT_DIR || '/tmp';
const EMAIL = 'e2e-bot@scoreplace.test', PASSWORD = 'Teste!2026e2e';

const FORMATS = [
  { key: 'single', label: 'Elim Simples', format: 'Eliminatórias Simples', n: 8, extra: {} },
  { key: 'dupla', label: 'Dupla Elim', format: 'Dupla Eliminatória', n: 8, extra: {} },
  { key: 'grupos', label: 'Fase de Grupos', format: 'Fase de Grupos + Eliminatórias', n: 16, extra: {} },
  { key: 'liga', label: 'Liga', format: 'Liga', n: 8, extra: { ligaRoundFormat: 'padrao' } },
  { key: 'suico', label: 'Suíço', format: 'Suíço Clássico', n: 8, extra: { classifyFormat: 'swiss', currentStage: 'swiss', swissRounds: 3 } },
  { key: 'monarch', label: 'Rei/Rainha', format: 'Liga', n: 8, extra: { drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', drawManual: true } },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const done = [];
  for (const spec of FORMATS) {
    let id;
    try {
      await page.goto(URL, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const built = await page.evaluate(async ({ spec, EMAIL, PASSWORD }) => {
        const fb = window.firebase;
        try { await fb.auth().signInWithEmailAndPassword(EMAIL, PASSWORD); } catch (e) { try { await fb.auth().createUserWithEmailAndPassword(EMAIL, PASSWORD); } catch (e2) { return { err: 'auth:' + (e2.code || e2.message) }; } }
        const u = fb.auth().currentUser, uid = u.uid;
        window.AppStore.currentUser = { uid, email: u.email, displayName: 'E2E Bot' }; window._authStateResolved = true;
        const parts = []; for (let i = 0; i < spec.n; i++) parts.push({ displayName: 'J' + i, name: 'J' + i, uid: 'bot' + i });
        const id = 'e2e_shot_' + spec.key + '_' + Date.now();
        const t = Object.assign({ id, name: spec.label, format: spec.format, teamSize: 1, creatorUid: uid, organizerEmail: u.email, memberUids: [uid], participants: parts, status: 'open', createdAt: new Date().toISOString() }, spec.extra);
        window.AppStore.tournaments = (window.AppStore.tournaments || []).filter((x) => x.id !== id).concat(t);
        try { await window.FirestoreDB.saveTournament(t); } catch (e) { return { err: 'save:' + (e.code || e.message) }; }
        try { window.generateDrawFunction(id); } catch (e) { return { err: 'draw:' + (e.code || e.message) }; }
        return { id };
      }, { spec, EMAIL, PASSWORD });
      if (built.err) { console.log(spec.label, '→ ERRO:', built.err); continue; }
      id = built.id;
      await page.evaluate((id) => { window.location.hash = '#tournaments/' + id; }, id);
      await page.waitForTimeout(1500);
      // expande <details> colapsados pra a chave aparecer na imagem
      await page.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
      await page.waitForTimeout(400);
      const path = OUT + '/formato-' + spec.key + '.png';
      await page.screenshot({ path, fullPage: true });
      console.log(spec.label, '→', path);
      done.push({ label: spec.label, path });
    } catch (e) {
      console.log(spec.label, '→ EXCEÇÃO:', e.message.split('\n')[0]);
    } finally {
      if (id) await page.evaluate((id) => { try { return window.FirestoreDB.db.collection('tournaments').doc(id).delete(); } catch (e) {} }, id).catch(() => {});
    }
  }
  await browser.close();
  console.log('\nSHOTS:', JSON.stringify(done.map((d) => d.path)));
})();
