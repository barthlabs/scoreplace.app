/* Cadência da captura letzplay — node tests/letzplay-pace.test.js
 *
 * Carrega o background.js REAL da extensão num vm com `chrome` stubado e congela as duas
 * regras que fazem a busca não travar (e não parecer robô):
 *
 * 1. CADÊNCIA HUMANA (plano original do dono): "a navegacao/captura tem que parecer uma
 *    navegacao humana natural, cadenciada, sem pulos ultra rapidos que um humano nao faria."
 *    → a espera NUNCA se repete (nada de 1200ms cravado, que é assinatura de robô e derruba
 *    o Cloudflare por PADRÃO, antes mesmo do volume) e nunca desce abaixo do piso humano.
 *
 * 2. MEDIR E ALARGAR ATÉ NÃO TRAVAR: bloqueio alarga o passo E sobe o piso (aquele ritmo já
 *    se provou inseguro, não voltamos a ele); a recuperação é lenta e assimétrica.
 *
 * Reproduz o incidente de 14/jul/2026: a v1.36 acelerava a cada sucesso isolado (×0.85) e
 * perdia o passo aprendido a cada reciclagem do service worker (MV3, ~30s) — então voltava
 * pro piso, rajava de novo, tomava 403 e a busca completa gravou ZERO jogos para 4 inscritos.
 * Ver project_letzplay_scan_stability, feedback_tests_must_reproduce_real_failure.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── carrega o background.js real, com as APIs do Chrome stubadas ──
function loadBg(stored) {
  const store = { sp_lz_pace: stored || undefined };
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, Math, Date, JSON,
    chrome: {
      runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} }, getURL: (s) => s, lastError: null },
      tabs: { query: () => {}, create: () => {}, remove: () => {}, update: () => {}, onUpdated: { addListener() {}, removeListener() {} } },
      scripting: { executeScript: () => Promise.resolve([{ result: null }]) },
      storage: { local: {
        get: (keys, cb) => cb(store.sp_lz_pace ? { sp_lz_pace: store.sp_lz_pace } : {}),
        set: (o) => Object.assign(store, o),
      } },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8'), sandbox, { filename: 'background.js' });
  return { sandbox, store };
}

// ── 1. A espera NUNCA é constante (robô) e respeita o piso humano ──
{
  const { sandbox } = loadBg();
  const waits = [];
  for (let i = 0; i < 400; i++) waits.push(sandbox._qWait());
  const uniq = new Set(waits);
  ok(uniq.size > 300, 'espera tem que variar a cada operação (únicos: ' + uniq.size + '/400) — intervalo cravado é assinatura de robô');
  ok(Math.min(...waits) >= 1500, 'nenhuma espera abaixo do plausível humano (min: ' + Math.min(...waits) + 'ms)');
  const avg = waits.reduce((a, b) => a + b, 0) / waits.length;
  ok(avg > 2000 && avg < 6000, 'ritmo médio de leitura humana entre páginas (avg: ' + Math.round(avg) + 'ms)');
  // Uma pessoa às vezes para mais tempo: a cauda longa tem que existir.
  ok(waits.some((w) => w > 6000), 'tem que haver pausas longas ocasionais (olhar pro lado)');
}

// ── 2. Bloqueio alarga o passo E sobe o piso ──
{
  const { sandbox } = loadBg();
  const g0 = sandbox._q.gap, f0 = sandbox._q.floor;
  sandbox._qNoteStatus(403);
  ok(sandbox._q.gap > g0, 'HTTP 403 tem que alargar o passo (' + g0 + ' → ' + sandbox._q.gap + ')');
  ok(sandbox._q.floor > f0, 'bloqueio tem que SUBIR o piso — o ritmo antigo já se provou inseguro');
  ok(sandbox._q.blocks === 1, 'bloqueio contabilizado');
}

// ── 3. Desafio do Cloudflare servido com status 200 conta como BLOQUEIO ──
// Esta é a falha real: r.ok=true + página de desafio → a fila ACELERAVA no exato momento
// em que devia frear, e o import concluía "sem-jogos" sem erro nenhum.
{
  const { sandbox } = loadBg();
  const g0 = sandbox._q.gap;
  sandbox._qNoteStatus(200, true);   // blocked=true
  ok(sandbox._q.gap > g0, 'desafio do Cloudflare com status 200 tem que FREAR, não acelerar (' + g0 + ' → ' + sandbox._q.gap + ')');
}
{
  const { sandbox } = loadBg();
  const g0 = sandbox._q.gap;
  sandbox._qNoteStatus(503);
  ok(sandbox._q.gap > g0, 'HTTP 503 (desafio/indisponível) tem que frear');
}

// ── 4. Recuperação é LENTA e assimétrica — e nunca abaixo do piso aprendido ──
{
  const { sandbox } = loadBg();
  sandbox._qNoteStatus(403);                       // apanhou → alargou
  const gapApos = sandbox._q.gap, piso = sandbox._q.floor;
  sandbox._qNoteStatus(200);                       // 1 sucesso isolado
  ok(sandbox._q.gap === gapApos, 'um sucesso isolado NÃO pode acelerar (era o bug: ×0.85 a cada sucesso → rajava de novo)');
  for (let i = 0; i < 200; i++) sandbox._qNoteStatus(200);
  ok(sandbox._q.gap < gapApos, 'depois de MUITO sucesso seguido, afrouxa aos poucos');
  ok(sandbox._q.gap >= piso, 'nunca volta abaixo do piso aprendido (gap ' + sandbox._q.gap + ' >= piso ' + piso + ')');
}

// ── 5. O passo aprendido SOBREVIVE à reciclagem do service worker (MV3) ──
// Sem isto a adaptação era teatro: o SW morre a cada ~30s ocioso e o gap voltava ao default.
{
  const { sandbox, store } = loadBg();
  sandbox._qNoteStatus(403);
  sandbox._qNoteStatus(403);
  const aprendido = sandbox._q.gap, pisoAprendido = sandbox._q.floor;
  ok(store.sp_lz_pace && store.sp_lz_pace.gap === aprendido, 'o passo aprendido tem que ser PERSISTIDO em chrome.storage');
  // simula o SW sendo reciclado e subindo de novo, lendo o que ficou gravado
  const reiniciado = loadBg(store.sp_lz_pace).sandbox;
  ok(reiniciado._q.gap === aprendido, 'ao reiniciar, retoma o passo aprendido (' + reiniciado._q.gap + ' vs ' + aprendido + ') — não volta pro default');
  ok(reiniciado._q.floor === pisoAprendido, 'ao reiniciar, retoma o piso aprendido');
}

// ── 6. Teto: bloqueio sustentado não cresce sem limite nem estoura ──
{
  const { sandbox } = loadBg();
  for (let i = 0; i < 50; i++) sandbox._qNoteStatus(429);
  ok(sandbox._q.gap === sandbox._q.max, 'bloqueio sustentado satura no teto (' + sandbox._q.gap + 'ms)');
  ok(sandbox._q.max >= 60000, 'teto tem que dar conta de bloqueio longo (>= 60s), não os 10s da v1.36');
}

console.log((fail ? '✗' : '✓') + ' letzplay-pace: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
