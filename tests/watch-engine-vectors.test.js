/* Vetores de paridade do Caminho B (Leva 1) — o gate anti-drift dos 3 motores.
 * Contrato: docs/smartwatch-bridge.md, seção "Caminho B".
 *
 * O QUE ESTE TESTE GUARDA: os vetores gravados em tests/watch-engine/vectors/
 * são a REFERÊNCIA que os motores nativos do relógio (Swift/watchOS e
 * Kotlin-Java/Wear, Leva 2) reproduzem passo a passo. Se o motor GSM do JS
 * mudar de comportamento, este teste fica VERMELHO — e o caminho certo é
 * regravar os vetores DE PROPÓSITO (node tests/watch-engine/generate.js
 * --write) E re-rodar a paridade dos motores nativos contra os vetores novos.
 * Vetor regravado em silêncio = motor nativo divergindo em silêncio.
 *
 * O gerador dirige o motor REAL (bracket-ui.js inteiro no harness, Chromium) —
 * nunca réplica. Também valida aqui a ESTRUTURA mínima de cada vetor (config
 * real do esporte, passos com evento+estado, e os invariantes que o incidente
 * de 13/ago transformou em requisito).
 *
 * Rodado por: npm test (tests/run-unit.js). Exige o Chromium do Playwright
 * (a CI instala via npx playwright install).
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── watch-engine-vectors ────');

const gen = require('./watch-engine/generate.js');
const VEC_DIR = path.join(__dirname, 'watch-engine', 'vectors');

(async () => {
  const vectors = await gen.generateAll();
  ok(vectors.length >= 7, 'gerador produziu os cenários (' + vectors.length + ')');

  // ── 1. paridade com os vetores GRAVADOS (o gate) ──────────────────────────
  for (const v of vectors) {
    const f = path.join(VEC_DIR, v.name + '.json');
    if (!fs.existsSync(f)) { ok(false, 'vetor ausente no repo: ' + v.name + ' (gere com --write)'); continue; }
    const disk = JSON.parse(fs.readFileSync(f, 'utf8'));
    ok(gen.stable(disk) === gen.stable(v),
       '🔒 motor GSM atual reproduz o vetor gravado: ' + v.name +
       ' (divergiu? mudança de comportamento no motor — regrave com --write E re-valide os motores nativos)');
  }

  // ── 2. invariantes que os vetores TÊM que exercitar ───────────────────────
  const by = {}; vectors.forEach(v => by[v.name] = v);

  const fim = by['undo-atravessa-o-fim'];
  if (fim) {
    const st = fim.steps;
    const iFim = st.findIndex(s => s.state.isFinished);
    ok(iFim > 0 && st[iFim].state.winner === 1, 'incidente 13/ago: a partida TERMINA no vetor');
    ok(st[iFim + 1] && st[iFim + 1].event.kind === 'undo' && st[iFim + 1].state.isFinished === false
       && st[iFim + 1].state.active === true,
       '🔒 undo REABRE a partida terminada (isFinished→false, active→true) — o contrato do 1.8.64');
    ok(st[st.length - 1].state.isFinished === true, 'e o jogo re-fecha depois de seguir jogando');
  } else ok(false, 'cenário undo-atravessa-o-fim existe');

  const seco = by['bt-duplas-6-0-liso'];
  if (seco) {
    // o ponto disparado com o seletor do 2º sacador ABERTO cai no vazio — é o
    // bloqueio real do motor (o exato lugar do incidente do "confirmar não
    // iniciou o 2º game"). O vetor tem que provar que o estado NÃO mudou.
    const st = seco.steps;
    let iPick = st.findIndex(s => s.state.servePickOpen && s.state.servePickPhase === 1);
    ok(iPick > 0, 'fim do game 1 em duplas abre o pick do 2º sacador');
    const blocked = st[iPick + 1];
    ok(blocked && blocked.event.kind === 'point'
       && gen.stable(blocked.state) === gen.stable(st[iPick].state),
       '🔒 ponto com o pick aberto é BLOQUEADO (estado idêntico) — o motor nativo tem que bloquear igual');
  } else ok(false, 'cenário bt-duplas-6-0-liso existe');

  const tb = by['bt-duplas-tiebreak-5-5'];
  if (tb) {
    const st = tb.steps;
    const iTie = st.findIndex(s => s.state.tieRulePending);
    ok(iTie > 0 && st[iTie].state.tiedAt === 5, 'BT: 5-5 levanta o prompt de empate (tiedAt 5 — config real g-1)');
    const iTb = st.findIndex(s => s.state.isTiebreak);
    ok(iTb > iTie, 'resolveTie(tiebreak) liga o tie-break');
    ok(st[st.length - 1].state.isFinished && gen.stable(st[st.length - 1].state.games) === gen.stable([6, 5]),
       'TB fechado vira set 6-5 (a regra que o bug do emoji quebrava por fora)');
  } else ok(false, 'cenário bt-duplas-tiebreak-5-5 existe');

  const ten = by['tenis-simples-vantagem-e-2-sets'];
  if (ten) {
    const pts = ten.steps.map(s => JSON.stringify(s.state.points));
    ok(pts.indexOf('["AD","40"]') !== -1 && pts.indexOf('["40","AD"]') !== -1,
       'tênis: o ciclo deuce→AD→deuce→AD está no vetor (advantageRule real)');
    ok(ten.config.advantageRule === true && ten.config.setsToWin === 2, 'config do tênis veio REAL do sport-rules.js');
  } else ok(false, 'cenário tenis-simples-vantagem-e-2-sets existe');

  const pk = by['pickleball-numerico'];
  if (pk) {
    ok(pk.config.countingType === 'numeric', 'pickleball: contagem numérica real');
  } else ok(false, 'cenário pickleball-numerico existe');

  console.log('watch-engine-vectors:', pass, 'ok,', fail, 'falhas');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
