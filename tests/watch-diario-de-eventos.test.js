/* Receptor do DIÁRIO DE EVENTOS no celular (Caminho B — a fiação).
 * Contrato: docs/smartwatch-bridge.md, seção "Caminho B".
 *
 * O relógio com motor nativo joga sozinho (celular no bolso, JS suspenso — a
 * causa do incidente de 13/ago) e sincroniza o diário quando dá. Quem REPRODUZ
 * o diário é o motor JS canônico: daqui saem o placar oficial, o Firestore e o
 * histórico. Este teste dirige o js/watch-bridge.js REAL e trava:
 *   - o lote é aplicado NA ORDEM do `n` (transporte pode entregar embaralhado,
 *     e ponto antes do sacador seria bloqueado pelo motor);
 *   - REENVIO do mesmo lote é idempotente (dedup por deviceId#n) — é pra isso
 *     que o diário existe: o relógio insiste até ter certeza que chegou;
 *   - dois dispositivos com o MESMO `n` não se anulam (a chave inclui o device);
 *   - partida NOVA (matchEpoch diferente) ZERA o dedup, senão o `n` recomeçando
 *     em 1 descartaria evento legítimo;
 *   - cada evento dirige a MESMA função do intent unitário (zero regra nova);
 *   - evento desconhecido (relógio mais novo) é ignorado sem derrubar o lote;
 *   - o snapshot volta pro relógio depois de aplicar (o push do caminho comum).
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── watch-diario-de-eventos ────');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'watch-bridge.js'), 'utf8');

function loadBridge() {
  const calls = [];
  const sent = [];
  const win = {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: { ScoreplaceWatch: { sendState: (a) => sent.push(a.snapshot), addListener: () => {} } }
    },
    AppStore: { currentUser: null },
    _getLiveScoreState: () => ({ v: 1, type: 'state', active: true, _n: calls.length }),
    _liveScorePoint: (t) => calls.push('point:' + t),
    _liveScoreUndoLastPoint: () => calls.push('undo'),
    _liveServeSelect: (t, i) => calls.push('serveSelect:' + t + ',' + i),
    _liveServeConfirm: () => calls.push('serveConfirm'),
    _liveResolveTie: (r) => calls.push('resolveTie:' + r),
    _liveScoreCloseFromWatch: () => calls.push('close')
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  vm.runInContext(SRC, ctx);
  return { win, calls, sent };
}

const EV = (n, kind, extra) => Object.assign({ n: n, t: 1723600000000 + n * 1000, kind: kind }, extra || {});

// ── 1. lote básico: cada evento dirige a função canônica ──────────────────
const a = loadBridge();
ok(typeof a.win.WatchBridge === 'object', 'bridge carregou');
a.win.WatchBridge.applyIntent({
  v: 1, type: 'evlog', id: 'lote-1', deviceId: 'watch-A', matchEpoch: 'm1',
  events: [
    EV(1, 'serveSelect', { team: 2, playerIdx: 1 }),
    EV(2, 'serveConfirm'),
    EV(3, 'point', { team: 1 }),
    EV(4, 'point', { team: 2 }),
    EV(5, 'undo'),
    EV(6, 'resolveTie', { rule: 'tiebreak' })
  ]
});
ok(a.calls.join('|') === 'serveSelect:2,1|serveConfirm|point:1|point:2|undo|resolveTie:tiebreak',
   '🔒 cada evento do diário dirige a MESMA função do motor que o intent unitário usa · achado: ' + a.calls.join('|'));
ok(a.sent.length >= 1, 'o snapshot volta pro relógio depois de aplicar o lote');

// ── 2. ORDEM: o lote embaralhado é aplicado por `n` ───────────────────────
const b = loadBridge();
b.win.WatchBridge.applyIntent({
  type: 'evlog', id: 'l2', deviceId: 'w', matchEpoch: 'm1',
  events: [EV(3, 'point', { team: 2 }), EV(1, 'serveSelect', { team: 1, playerIdx: 0 }), EV(2, 'serveConfirm')]
});
ok(b.calls.join('|') === 'serveSelect:1,0|serveConfirm|point:2',
   '🔒 lote fora de ordem é ordenado por `n` (ponto antes do sacador seria BLOQUEADO pelo motor) · achado: ' + b.calls.join('|'));

// ── 3. REENVIO do mesmo lote não duplica nada ─────────────────────────────
const c = loadBridge();
const lote = { type: 'evlog', deviceId: 'w', matchEpoch: 'm1',
               events: [EV(1, 'point', { team: 1 }), EV(2, 'point', { team: 1 })] };
c.win.WatchBridge.applyIntent(Object.assign({ id: 'x1' }, lote));
c.win.WatchBridge.applyIntent(Object.assign({ id: 'x2' }, lote));   // id NOVO, eventos os MESMOS
ok(c.calls.length === 2 && c.calls.join('|') === 'point:1|point:1',
   '🔒 reenviar o MESMO lote é idempotente (dedup por deviceId#n) — o relógio insiste até ter certeza · achado: ' + c.calls.join('|'));

// lote SEGUINTE, com evento novo + repetido: só o novo entra
c.win.WatchBridge.applyIntent({ type: 'evlog', id: 'x3', deviceId: 'w', matchEpoch: 'm1',
  events: [EV(2, 'point', { team: 1 }), EV(3, 'point', { team: 2 })] });
ok(c.calls.length === 3 && c.calls[2] === 'point:2', 'lote com sobreposição aplica SÓ o evento inédito');

// ── 4. dois dispositivos com o mesmo `n` NÃO se anulam ────────────────────
const d = loadBridge();
d.win.WatchBridge.applyIntent({ type: 'evlog', id: 'd1', deviceId: 'watch', matchEpoch: 'm1',
  events: [EV(1, 'point', { team: 1 })] });
d.win.WatchBridge.applyIntent({ type: 'evlog', id: 'd2', deviceId: 'phone', matchEpoch: 'm1',
  events: [EV(1, 'point', { team: 2 })] });
ok(d.calls.join('|') === 'point:1|point:2',
   '🔒 a chave de dedup inclui o DISPOSITIVO — relógio e celular numerando igual não se apagam');

// ── 5. partida NOVA zera o dedup (o `n` recomeça em 1) ────────────────────
const e = loadBridge();
e.win.WatchBridge.applyIntent({ type: 'evlog', id: 'e1', deviceId: 'w', matchEpoch: 'm1',
  events: [EV(1, 'point', { team: 1 }), EV(2, 'point', { team: 1 })] });
e.win.WatchBridge.applyIntent({ type: 'evlog', id: 'e2', deviceId: 'w', matchEpoch: 'm2',
  events: [EV(1, 'point', { team: 2 })] });
ok(e.calls.length === 3 && e.calls[2] === 'point:2',
   '🔒 matchEpoch nova ZERA o dedup — senão o `n` recomeçando descartaria evento legítimo da partida nova');

// ── 6. robustez: evento desconhecido/inválido não derruba o lote ──────────
const f = loadBridge();
f.win.WatchBridge.applyIntent({ type: 'evlog', id: 'f1', deviceId: 'w', matchEpoch: 'm1',
  events: [EV(1, 'point', { team: 1 }), EV(2, 'futuro'), null, EV(3, 'point', { team: 9 }), EV(4, 'point', { team: 2 })] });
ok(f.calls.join('|') === 'point:1|point:2',
   '🔒 evento desconhecido (relógio mais novo), nulo ou com time inválido é IGNORADO — o resto do lote aplica · achado: ' + f.calls.join('|'));

const g = loadBridge();
g.win.WatchBridge.applyIntent({ type: 'evlog', id: 'g1', deviceId: 'w', events: [] });
g.win.WatchBridge.applyIntent({ type: 'evlog', id: 'g2', deviceId: 'w' });
ok(g.calls.length === 0, 'lote vazio/sem events não explode e não chama nada');

// ── 7. o intent unitário continua funcionando (nada regrediu) ─────────────
const h = loadBridge();
h.win.WatchBridge.applyIntent({ type: 'point', team: 1, id: 'p1' });
h.win.WatchBridge.applyIntent({ type: 'undo', id: 'u1' });
h.win.WatchBridge.applyIntent({ type: 'point', team: 1, id: 'p1' });   // id repetido → dedup antigo
ok(h.calls.join('|') === 'point:1|undo',
   'os intents unitários (Opção A / modo espelho) seguem intactos, com o dedup por id');

// ── 8. varredura: o receptor não reimplementa regra de placar ─────────────
const trecho = SRC.slice(SRC.indexOf('function applyEventLog'), SRC.indexOf('function applyIntent'));
ok(!/state\.|currentGameP|gamesPerSet|tiebreakPoints|isFinished\s*=/.test(trecho),
   '🔒 o receptor NÃO toca em estado de placar — só dirige as funções do motor (zero segunda implementação)');
ok(/sort\(function/.test(trecho) && /seenEvents\[/.test(trecho),
   'o receptor faz ordenação por n e dedup — as duas responsabilidades dele');

// ── 9. o CONTRATO que o motor do relógio consome (varredura no bracket-ui) ──
// Sem estes dois campos no snapshot o relógio não tem como contar nada por
// conta própria — e o sintoma seria mudo: ele voltaria a espelhar em silêncio.
const UI = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
ok(/matchEpoch: _liveMatchEpoch/.test(UI),
   '🔒 o snapshot leva `matchEpoch` — identidade da partida, o que carimba o diário do relógio');
ok(/scoring: \{[\s\S]{0,400}countingType: state\.countingType/.test(UI),
   '🔒 o snapshot leva a `scoring` RESOLVIDA (de `state`, os valores efetivos) — é com ela que o motor nativo conta');
const epochResets = (UI.match(/_newMatchEpoch\(\)/g) || []).length;
ok(epochResets >= 5,
   'a época é renovada em TODO recomeço de partida (4 pontos + a definição) — senão o diário da partida velha contaminaria a nova · achado: ' + epochResets);
ok(/_liveRecId = null;\s*\/\/[^\n]*\n\s*_newMatchEpoch\(\)/.test(UI),
   'a renovação da época anda JUNTO com o reset do registro de histórico (os mesmos momentos de "partida nova")');

console.log('watch-diario-de-eventos:', pass, 'ok,', fail, 'falhas');
if (fail > 0) process.exit(1);
