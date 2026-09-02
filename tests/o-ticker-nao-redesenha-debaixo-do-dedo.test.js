/* O RELÓGIO NÃO PODE REDESENHAR DEBAIXO DO DEDO (leva 2.1.98)
 *
 * Relato do dono (02/set/2026): _"esse mostrar mais/menos está abrindo o detalhe e está
 * impossível de clicar nele."_ Dois sintomas, um mecanismo só.
 *
 * ⛔ A FALHA REAL: `_progressTick` troca o `innerHTML` INTEIRO de `.tourn-progress-live`
 * sempre que o HTML muda. Com a regressiva correndo, os segundos mudam e o box é
 * reconstruído a cada tick. Se isso cai entre o `touchstart` e o `touchend`, o nó onde o
 * dedo encostou deixou de existir — o `click` é disparado no ancestral sobrevivente, o
 * `event.stopPropagation()` da linha da dobra nunca roda (ele só roda se o alvo estiver
 * DENTRO dela), e o clique sobe até o card, cujo `onclick` é `_dashCardClick`. Daí o
 * torneio abrir sozinho, e a pílula parecer "impossível de clicar".
 *
 * Só apareceu agora porque, sem `phaseStartedAt`, o cartão ficava em "⏳ Aguardando início"
 * — HTML estável, nada era trocado. Carimbado o início da fase, o relógio anda.
 *
 * ⚠️ O TESTE EXERCITA O MECANISMO, não o texto: monta um `document` de mentira, deixa o
 * `_ensureProgressTicker` registrar os ouvintes DE VERDADE nele, dispara os eventos e
 * CONTA quantas vezes o `innerHTML` foi trocado. Um teste de regex aqui passaria com o
 * bug de pé.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o relógio não redesenha debaixo do dedo ────');

// ── um box de mentira, e um document que entrega ele ──────────────────────────
let trocas = 0;
const box = {
  _html: '',
  get innerHTML() { return this._html; },
  set innerHTML(v) { this._html = v; trocas++; },
  getAttribute: (k) => (k === 'data-tid' ? 'T1' : null)
};
box.closest = () => box;   // o alvo do toque resolve pro próprio box

const ouvintes = {};
const docReal = W.document;
W.document = {
  querySelectorAll: (sel) => (sel === '.tourn-progress-live' ? [box] : []),
  addEventListener: (tipo, fn) => { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
  removeEventListener: () => {}
};
W.AppStore.tournaments = [{ id: 'T1', name: 'Fixture' }];

/* a regressiva ANDA: cada chamada devolve um HTML diferente, como no app real */
let segundo = 0;
W._buildProgressInner = () => '<div>faltam ' + (segundo++) + 's</div>';
W._medirTrecho = null;

// setTimeout controlável (o harness o deixa no-op; aqui precisamos disparar a folga)
const pendentes = [];
W.setTimeout = (fn, ms) => { pendentes.push(fn); return pendentes.length; };
const passaOTempo = () => { const p = pendentes.splice(0); p.forEach((f) => f()); };

W._progressTickerOn = false;
W._ensureProgressTicker();

const dispara = (tipo) => (ouvintes[tipo] || []).forEach((fn) => fn({ target: box }));

// ── ① sem ninguém tocando, o relógio anda ────────────────────────────────────
W._progressTick();
ok(trocas === 1, '① sem toque, o tick redesenha (o relógio precisa andar) — trocas=' + trocas);
W._progressTick();
ok(trocas === 2, '① e continua andando a cada tick — trocas=' + trocas);

// ── ② com o dedo no box, o tick NÃO redesenha ────────────────────────────────
ok((ouvintes.touchstart || []).length > 0 && (ouvintes.pointerdown || []).length > 0,
   '② o ticker registra os ouvintes de toque no document (em captura, porque o box é remontado)');
dispara('touchstart');
const antes = trocas;
W._progressTick();
W._progressTick();
ok(trocas === antes,
   '② ⭐ com o dedo dentro, o box NÃO é reconstruído — é isto que salva o toque · trocas=' + trocas);

// ── ③ soltou o dedo (com folga), o relógio volta ─────────────────────────────
dispara('touchend');
W._progressTick();
ok(trocas === antes,
   '③ logo após soltar ainda NÃO redesenha — o `click` sintetizado chega depois do touchend');
passaOTempo();
W._progressTick();
ok(trocas === antes + 1, '③ ⭐ passada a folga, o relógio volta a andar · trocas=' + trocas);

// ── ④ tocar FORA do box não congela o relógio de ninguém ─────────────────────
const outro = { closest: () => null };
(ouvintes.touchstart || []).forEach((fn) => fn({ target: outro }));
const antes4 = trocas;
W._progressTick();
ok(trocas === antes4 + 1, '④ toque fora do box não congela o relógio');

// ── ⑤ alvo sem `closest` (nó de texto, SVG) não derruba o tick ───────────────
(ouvintes.touchstart || []).forEach((fn) => fn({ target: {} }));
const antes5 = trocas;
W._progressTick();
ok(trocas === antes5 + 1, '⑤ alvo estranho não quebra nem congela');

W.document = docReal;
console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
