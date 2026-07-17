/* AGENDAMENTO COERENTE — o painel nunca promete o que o sistema não faz.
 * node tests/sched-config-coherent.test.js
 *
 * REGRA DO DONO (17/jul), literal: "repetir vazio, mas com 2 rodadas, não é rodada única. se
 * repetir vazio é rodada única então precisa mudar isso na configuração de forma que o usuário
 * veja. clicou para esvaziar o repetir, transforma as rodadas em 1. mudou o número de rodadas,
 * calcula e mostra o repetir. isso para que o usuário entenda o que vai acontecer. NÃO PODE O
 * PAINEL DIZER 2 RODADAS E O SISTEMA FAZER APENAS UMA EM CLARA CONTRADIÇÃO."
 *
 * BUG REAL (staging "Ranking Paineiras", tour_1783113349754): salvo com `rodadas.n = 2` e
 * `drawIntervalDays = null`. Intervalo vazio = sorteio ÚNICO pra math do servidor
 * (`_owedDrawSlotMs`: `noRepeat → já disparou → null`), então:
 *   • a rodada 2 NUNCA sortearia (sem 2º slot ⇒ `nextDrawAt` nem existia no doc), e
 *   • o relógio caía em "Fim do torneio" — enquanto o painel dizia "2 rodadas".
 * O `_f2SchedInterval` vazio "mantinha as rodadas" e o `_f2Rn` podia deixar o intervalo null:
 * a contradição era criável em 2 cliques e invisível pro usuário.
 *
 * INVARIANTE TRAVADA AQUI: n > 1  ⇒  drawIntervalDays >= 1  (sempre, e visível no painel).
 * Ver project_liga_countdown_states_canonical, project_liga_planned_rounds_strict_boundary.
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const H = require('./render-harness');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

// format2 + format2-ui no MESMO contexto do harness (os handlers mexem em S.cfg; o refresh do
// DOM é guardado por `if (el)`, então roda com os stubs — é comportamento REAL, não mock).
['format2.js', 'format2-ui.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', f), 'utf8'), H.sandbox || W, { filename: f });
});

console.log('\n== Agendamento: painel e sistema sempre coerentes ==');
ok(typeof W._f2MountInForm === 'function', 'format2-ui carregou (_f2MountInForm)');
ok(typeof W.FORMAT2 === 'object', 'format2 carregou (FORMAT2)');

function mount(over) {
  const cfg = W.FORMAT2.defaultConfig('Beach Tennis');
  cfg.rodadas = Object.assign({}, cfg.rodadas, {
    modo: 'fixo', n: 3, drawFirstDate: '2026-08-01', drawFirstTime: '19:00',
    drawIntervalDays: 2, drawManual: false,
  }, over || {});
  W._f2MountInForm({ innerHTML: '' }, 'Beach Tennis', cfg, { id: 't1', endDate: '2026-08-20T23:00' });
  return function () { const c = W._f2GetConfig(); return { n: c.rodadas.n, iv: c.rodadas.drawIntervalDays }; };
}
const coerente = function (s) { return !(s.n > 1 && !(parseInt(s.iv, 10) >= 1)); };

// ── [REGRA-1] esvaziar o "Repetir" (o ✕ "Sem repetição") ⇒ rodadas vira 1 ───────────────
(function () {
  const st = mount();
  ok(st().n === 3 && st().iv === 2, '[setup] começa com 3 rodadas / repetir 2 — got ' + JSON.stringify(st()));
  W._f2SchedInterval('');
  ok(st().n === 1, '[REGRA-1] esvaziar o Repetir ⇒ "Nº de rodadas" vira 1 (o usuário VÊ) — got ' + JSON.stringify(st()));
  ok(coerente(st()), '[REGRA-1] sem contradição após esvaziar');
})();

// ── [REGRA-2] mudar o Nº de rodadas ⇒ calcula e mostra o Repetir ────────────────────────
(function () {
  const st = mount({ drawIntervalDays: null, n: 1 });   // parte de "sorteio único"
  W._f2Rn(2);
  ok(parseInt(st().iv, 10) >= 1, '[REGRA-2] pôr 2 rodadas ⇒ Repetir é CALCULADO (nunca vazio) — got ' + JSON.stringify(st()));
  ok(st().n === 2, '[REGRA-2] as 2 rodadas ficam');
  ok(coerente(st()), '[REGRA-2] sem contradição após mudar as rodadas');
})();

// ── [BUG-RANKING] o estado exato do doc real não pode mais ser criado pelo painel ───────
(function () {
  const st = mount({ n: 2, drawIntervalDays: null });   // o que o Ranking tinha salvo
  W._f2Rn(2);                                            // usuário confirma 2 rodadas
  ok(coerente(st()), '[BUG-RANKING] "2 rodadas + repetir vazio" é IMPOSSÍVEL pelo painel — got ' + JSON.stringify(st()));
})();

// ── [INVARIANTE] qualquer sequência de cliques mantém a coerência ───────────────────────
(function () {
  const st = mount();
  const seq = [
    ['_f2SchedInterval', ''], ['_f2Rn', 3], ['_f2SchedInterval', ''], ['_f2Rn', 5],
    ['_f2SchedInterval', '2'], ['_f2Rn', 1], ['_f2Rn', 4], ['_f2SchedInterval', ''],
  ];
  let quebrou = null;
  seq.forEach(function (step) {
    W[step[0]](step[1]);
    if (!coerente(st()) && !quebrou) quebrou = step[0] + '(' + step[1] + ') → ' + JSON.stringify(st());
  });
  ok(!quebrou, '[INVARIANTE] n>1 ⇒ repetir>=1 em TODA a sequência de cliques — quebrou em ' + quebrou);
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' sched-config-coherent: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
