// Gera screenshots de loja (telas do app) com usuário/dados FAKE genéricos.
// Headless Chromium (Playwright, mesmo do prerender) → PNGs em store-assets/.
// Sem nomes reais: o bracket carrega um torneio real e ANONIMIZA os nomes.
// Uso: node tools/store-shots.js   (JAVA/ANDROID não necessários)
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium, devices } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'store-assets');
const PORT = 9878;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2' };

function serve() {
  return http.createServer((req, res) => {
    let u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (u === '/') u = '/index.html';
    const fp = path.join(ROOT, u);
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(PORT);
}

// injeta sessão fake (usuário genérico) + flag nativa + esconde "instalar app"
const FAKE_SESSION = () => {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  const AS = window.AppStore;
  AS.currentUser = { uid: 'demo-uid', email: 'demo@scoreplace.app', displayName: 'Rodrigo Barth',
    photoURL: '', plan: 'free', friends: ['a','b','c','d','e'], preferredSports: ['Beach Tennis','Padel'],
    notifyLevel: 'todas', gender: 'masculino', city: 'São Paulo' };
  window.currentUser = AS.currentUser;
  window._authStateResolved = true;
  const st = document.createElement('style');
  st.textContent = '[data-install-app-btn]{display:none!important}';
  document.head.appendChild(st);
  // tema ESCURO (a cara do app) — força independente do prefers-color-scheme
  document.documentElement.setAttribute('data-theme', 'dark');
  try { localStorage.setItem('scoreplace_theme', 'dark'); } catch (e) {}
};

const goHash = async (page, hash) => {
  await page.evaluate((h) => { location.hash = h; if (typeof window.handleRoute === 'function') window.handleRoute(); }, hash);
  await page.waitForTimeout(900);
  await page.evaluate(() => { document.querySelectorAll('[data-install-app-btn]').forEach(b => b.remove()); window.scrollTo(0, 0); });
};

async function shot(page, name) {
  await page.waitForTimeout(300);
  const p = path.join(OUT, name);
  await page.screenshot({ path: p });
  console.log('  ✓', name);
}

async function main() {
  const server = serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Pro'], { deviceScaleFactor: 3, colorScheme: 'dark' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 120)));

  console.log('carregando app…');
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AppStore && window._t && window.renderBracket, null, { timeout: 20000 });
  // deixa o discovery público carregar (usado só pra pegar estrutura do bracket)
  await page.evaluate(async () => { try { if (window.AppStore.loadPublicDiscovery) await window.AppStore.loadPublicDiscovery(); } catch (e) {} });
  await page.waitForTimeout(1500);
  await page.evaluate(FAKE_SESSION);

  // ---- 1. INÍCIO (dashboard) ----
  console.log('01 dashboard');
  await goHash(page, '#dashboard');
  await shot(page, 'phone-01-inicio.png');

  // ---- 2. NOVO TORNEIO ----
  console.log('02 novo torneio');
  await goHash(page, '#novo-torneio');
  await shot(page, 'phone-02-novo-torneio.png');

  // ---- 3. CHAVEAMENTO (torneio real anonimizado) ----
  console.log('03 chaveamento');
  const brId = await page.evaluate(() => {
    const AS = window.AppStore;
    const pools = [].concat(AS.tournaments || [], AS.publicDiscovery || []);
    const hasBr = t => (Array.isArray(t.matches) && t.matches.length) || (Array.isArray(t.rounds) && t.rounds.length) || (Array.isArray(t.groups) && t.groups.length);
    // prefere ELIMINATÓRIA SIMPLES pura (sem grupos), com mais jogos (chave cheia)
    const elim = pools.filter(t => hasBr(t) && /elimina/i.test(t.format || '') && !/grupo/i.test(t.format || '')).sort((a, b) => (b.matches ? b.matches.length : 0) - (a.matches ? a.matches.length : 0));
    const t = (elim[0] || pools.filter(hasBr)[0]);
    if (!t) return null;
    // ANONIMIZA nomes → "Jogador 01".. e me torna organizador
    const all = window._collectAllMatches ? window._collectAllMatches(t) : (t.matches || []);
    const names = [];
    const SKIP = /^(bye|a definir|aguardando|vencedor|—|-|–|\?|)$/i;
    const collect = s => { if (typeof s === 'string') s.split('/').forEach(x => { x = x.trim(); if (x && !SKIP.test(x) && names.indexOf(x) < 0) names.push(x); }); };
    // coleta TODOS os nomes visíveis: dos jogos, dos participantes e do campeão
    all.forEach(m => { [m.p1, m.p2, m.p1Name, m.p2Name, m.winner, m.p1Display, m.p2Display].forEach(collect); (m.team1 || []).forEach(collect); (m.team2 || []).forEach(collect); });
    (t.participants || []).forEach(p => { [p.name, p.displayName, p.p1Name, p.p2Name].forEach(collect); });
    collect(t.champion);
    const map = {}; names.forEach((nm, i) => { map[nm] = 'Jogador ' + String(i + 1).padStart(2, '0'); });
    const rep = s => (typeof s === 'string') ? s.split('/').map(x => { const k = x.trim(); return map[k] !== undefined ? map[k] : x.trim(); }).join(' / ') : s;
    all.forEach(m => { ['p1','p2','p1Name','p2Name','winner','p1Display','p2Display'].forEach(f => { if (m[f]) m[f] = rep(m[f]); }); if (Array.isArray(m.team1)) m.team1 = m.team1.map(rep); if (Array.isArray(m.team2)) m.team2 = m.team2.map(rep); });
    (t.participants || []).forEach(p => { ['name','displayName','p1Name','p2Name'].forEach(f => { if (p[f]) p[f] = rep(p[f]); }); });
    if (t.champion) t.champion = rep(t.champion);
    t.name = 'Copa de Verão — Beach Tennis'; // nome de evento genérico
    t.coverPhotoData = null; t.venuePhotoUrl = null; // tira foto do local (genérico)
    t.creatorUid = 'demo-uid'; t.organizerEmail = 'demo@scoreplace.app';
    return t.id;
  });
  if (brId) {
    await page.evaluate((id) => { const vc = document.getElementById('view-container'); window.renderBracket(vc, id); }, brId);
    await page.waitForTimeout(1200);
    // rola até a árvore de confrontos (cabeçalho de rodada), não o topo/toolbar
    await page.evaluate(() => {
      const vc = document.getElementById('view-container');
      const els = Array.from(vc.querySelectorAll('*'));
      const anchor = els.find(e => /SEMIFINA|RODADA|OITAVAS|QUARTAS|\bFINAL\b/i.test((e.textContent || '').slice(0, 40)) && e.children.length < 6);
      if (anchor) anchor.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 800);
      window.scrollBy(0, -16);
    });
    await shot(page, 'phone-03-chaveamento.png');
  } else { console.log('  (sem torneio com bracket)'); }

  // ---- 4. PLACAR AO VIVO (abre o live scoring de um jogo anonimizado) ----
  console.log('04 placar ao vivo');
  if (brId) {
    const mid = await page.evaluate((id) => {
      const t = [].concat(window.AppStore.tournaments || [], window.AppStore.publicDiscovery || []).find(x => x.id === id);
      const all = window._collectAllMatches ? window._collectAllMatches(t) : (t.matches || []);
      const m = all.find(x => x && x.id && x.p1 && x.p2 && !/bye/i.test(String(x.p1) + String(x.p2)));
      if (m && typeof window._openLiveScoring === 'function') { window._openLiveScoring(id, m.id); return m.id; }
      return null;
    }, brId);
    await page.waitForTimeout(1600);
    await page.evaluate(() => { document.querySelectorAll('[data-install-app-btn]').forEach(b => b.remove()); });
    await shot(page, 'phone-04-placar-ao-vivo.png');
    console.log('  match:', mid);
  }

  await browser.close();
  server.close();
  console.log('OK — PNGs em store-assets/');
}

main().catch(e => { console.error('FALHOU:', e); process.exit(1); });
