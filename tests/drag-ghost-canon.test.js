/* FANTASMA DE ARRASTE — trava de lint. node tests/drag-ghost-canon.test.js
 *
 * Bug AO VIVO (26/jul, v1.5.19): na lista de inscritos, um card de participante
 * ficava FLUTUANDO preso sobre a lista (borda âmbar) e só sumia fechando o app.
 * Reproduzido no browser contra a produção: long-press num card cria o clone
 * flutuante no <body>; se a lista RE-RENDERIZA no meio do gesto (snapshot do
 * Firestore / _softRefreshView), o container antigo sai do DOM levando junto os
 * listeners de touchend/touchcancel — o clone nunca mais recebia ordem de morrer.
 *
 * CÂNONE (v1.5.20): todo clone flutuante de arraste por toque nasce marcado com
 * data-drag-ghost="1" (e o card de origem esmaecido com data-drag-dimmed="1"),
 * quem arrasta publica sua limpeza em window._activeDragReset, e store.js mantém
 * a rede única que derruba o arraste em TODA saída — gesto cancelado pelo SO,
 * ponteiro cancelado, app pro fundo, navegação de rota. A lista de inscritos
 * ainda tem um vigia próprio, porque o único caso em que NENHUM evento volta é
 * justamente o re-render (o container morre com os listeners dentro).
 *
 * Esta suíte é lint: garante que os 3 arrastes por toque do app continuam ligados
 * na rede. O comportamento (fantasma some após re-render / touchcancel / blur, e
 * o drop normal continua mesclando) está em tests/e2e/drag-ghost.spec.js.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

const ROOT = path.join(__dirname, '..', 'js');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── 1. A REDE ÚNICA (store.js) ───────────────────────────────────────────────
const store = read('store.js');
ok(/window\._killDragGhosts\s*=\s*function/.test(store), '[REDE] window._killDragGhosts existe em store.js');
ok(/window\._abortActiveDrag\s*=\s*function/.test(store), '[REDE] window._abortActiveDrag existe em store.js');
ok(/window\._activeDragReset\s*=\s*null/.test(store), '[REDE] window._activeDragReset é declarado (null = nenhum arraste)');
ok(/\[data-drag-ghost="1"\]/.test(store), '[REDE] a varredura procura por [data-drag-ghost="1"]');
ok(/\[data-drag-dimmed="1"\]/.test(store), '[REDE] a varredura devolve os cards esmaecidos ([data-drag-dimmed="1"])');
// _killDragGhosts sem force NÃO pode varrer um arraste legítimo em andamento.
ok(/if\s*\(!force\s*&&\s*window\._activeDragReset\)\s*return/.test(store),
  '[REDE] varredura sem force sai cedo quando há arraste ativo (não mata clone legítimo)');
['touchcancel', 'pointercancel', 'dragend', 'visibilitychange', 'blur', 'pagehide', 'hashchange'].forEach(function (ev) {
  ok(store.indexOf("'" + ev + "'") !== -1, '[REDE] o aborto global escuta ' + ev);
});

// ── 2. LISTA DE INSCRITOS (tournaments-utils.js) — o arraste do bug ──────────
const utils = read('views/tournaments-utils.js');
ok(/_touchClone\.setAttribute\('data-drag-ghost', '1'\)/.test(utils),
  '[INSCRITOS] o clone flutuante nasce marcado como fantasma varrível');
ok(/card\.setAttribute\('data-drag-dimmed', '1'\)/.test(utils),
  '[INSCRITOS] o card de origem esmaecido é marcado pra varredura');
ok(/window\._activeDragReset\s*=\s*_resetAll/.test(utils),
  '[INSCRITOS] o arraste publica a própria limpeza na rede global');
ok(/if\s*\(window\._activeDragReset === _resetAll\)\s*window\._activeDragReset = null/.test(utils),
  '[INSCRITOS] a limpeza se desregistra da rede (não deixa reset velho pendurado)');
// O VIGIA é o único que cobre o caso do bug: container removido do DOM mid-drag.
ok(/function _startWatchdog\(\)/.test(utils), '[INSCRITOS] existe o vigia do arraste (_startWatchdog)');
ok(/!document\.body\.contains\(container\)/.test(utils),
  '[VIGIA] o vigia derruba o arraste quando o container SAI DO DOM (re-render no meio do gesto = a causa do fantasma)');
ok(/_startWatchdog\(\);/.test(utils), '[VIGIA] o vigia é ligado ao iniciar o arraste');
ok(/clearInterval\(_watchdog\)/.test(utils), '[VIGIA] o vigia é desligado na limpeza (sem timer órfão)');
ok(/window\._killDragGhosts\(\)/.test(utils),
  '[INSCRITOS] todo render varre clone órfão de arraste anterior');

// ── 3. GERENCIADOR DE CATEGORIAS ─────────────────────────────────────────────
const cats = read('views/tournaments-categories.js');
ok(/_touchClone\.setAttribute\('data-drag-ghost', '1'\)/.test(cats),
  '[CATEGORIAS] o clone flutuante nasce marcado como fantasma varrível');
ok(/window\._activeDragReset\s*=\s*_onTouchCancel/.test(cats),
  '[CATEGORIAS] o arraste publica a própria limpeza na rede global');
ok(/removeAttribute\('data-drag-dimmed'\)/.test(cats),
  '[CATEGORIAS] a limpeza tira a marca de esmaecido do card de origem');

// ── 4. FORMAR DUPLA TARDIA (bracket.js) ──────────────────────────────────────
const br = read('views/bracket.js');
ok(/clone\.setAttribute\('data-drag-ghost', '1'\)/.test(br),
  '[DUPLA-TARDIA] o clone flutuante nasce marcado como fantasma varrível');
ok(/function _ljAbort\(\)/.test(br),
  '[DUPLA-TARDIA] existe aborto SEM formar dupla (gesto cancelado não pode virar dupla)');
ok(/window\._activeDragReset\s*=\s*_ljAbort/.test(br),
  '[DUPLA-TARDIA] o arraste publica a própria limpeza na rede global');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' drag-ghost-canon: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
