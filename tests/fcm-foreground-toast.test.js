/* Toast de push em FOREGROUND — node tests/fcm-foreground-toast.test.js
 *
 * BUG REAL (jul/2026): chegava um toast escrito só "scoreplace.app", sem mais nada.
 *
 * CAUSA: sendPushNotification (functions-autodraw/index.js) manda DATA-ONLY de propósito —
 * QUALQUER payload `notification` faz o navegador exibir uma cópia automática ALÉM da que o
 * sw.js já mostra (notificação duplicada; já regrediu uma vez). O handler de foreground
 * (messaging.onMessage) lia SÓ `payload.notification` — que nesse contrato NUNCA existe →
 * title caía no fallback 'scoreplace.app' e body virava ''. O sw.js (background) lê
 * `data` primeiro desde sempre; o foreground é que ficou pra trás.
 *
 * Trava aqui: os campos vêm do MESMO lugar que o sw.js lê, e push sem corpo não vira toast.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// Carrega só o helper (o resto do arquivo toca document/firebase no uso, não no load).
const sandbox = { window: null, document: { getElementById: () => null, createElement: () => ({ style: {} }) },
  localStorage: { getItem: () => null, setItem: () => {} }, navigator: {}, firebase: null,
  console, setTimeout, requestAnimationFrame: (f) => f() };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'notifications.js'), 'utf8'), sandbox,
  { filename: 'notifications.js' });

const F = sandbox.window._fcmToastFields;
ok(typeof F === 'function', 'window._fcmToastFields não existe');

// ── 1. DATA-ONLY (o que a CF realmente manda) ────────────────────────────────
(function () {
  const p = { data: { title: 'Confra BT 2026', body: 'Sua rodada foi sorteada: você joga com Ana.',
    link: 'https://scoreplace.app/#tournaments/t1', type: 'draw', tournamentId: 't1' } };
  const f = F(p);
  ok(f.title === 'Confra BT 2026', 'title devia vir de data.title — veio: ' + f.title);
  ok(f.body === 'Sua rodada foi sorteada: você joga com Ana.', 'body devia vir de data.body — veio: ' + JSON.stringify(f.body));
  ok(f.link === 'https://scoreplace.app/#tournaments/t1', 'link devia vir de data.link');
  ok(f.title !== 'scoreplace.app', 'REGRESSÃO: caiu no fallback com data.title presente');
})();

// ── 2. compat: mensagem antiga com payload.notification ──────────────────────
(function () {
  const f = F({ notification: { title: 'Antigo', body: 'corpo antigo' } });
  ok(f.title === 'Antigo' && f.body === 'corpo antigo', 'compat com payload.notification quebrou');
})();

// ── 3. data VENCE notification quando os dois vêm (espelha sw.js) ────────────
(function () {
  const f = F({ data: { title: 'D', body: 'db' }, notification: { title: 'N', body: 'nb' } });
  ok(f.title === 'D' && f.body === 'db', 'data devia ter precedência sobre notification');
})();

// ── 4. push vazio → corpo vazio (o chamador NÃO mostra toast) ────────────────
(function () {
  const f = F({});
  ok(f.body === '', 'payload vazio devia dar body vazio (o handler suprime o toast)');
  ok(f.title === 'scoreplace.app', 'fallback de título continua sendo scoreplace.app');
  // Este é EXATAMENTE o toast que o dono viu: título do app + nada. Com body vazio o
  // handler retorna antes de chamar showNotification.
})();

console.log((fail === 0 ? '✅' : '❌') + ` fcm-foreground-toast: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
