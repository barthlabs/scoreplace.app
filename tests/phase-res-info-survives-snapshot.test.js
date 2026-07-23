/* CONTEXTO DA TRANSIÇÃO DE FASE sobrevive ao snapshot do Firestore.
 * node tests/phase-res-info-survives-snapshot.test.js
 *
 * BUG REAL (Confra, jul/2026 — 104+4+8 = 116 pessoas → 29 grupos → 29/29 duplas):
 * o organizador avança de fase, escolhe PROMOVER pra deixar as duas linhas pares, e ao
 * clicar a opção do painel de potência de 2 recebe "Sorteio já realizado — refazer o
 * sorteio apagará todos os resultados". Devia simplesmente sortear a próxima fase.
 *
 * CAUSA: `t._phaseResInfo` (o contexto que diz "isto é TRANSIÇÃO DE FASE, não sorteio
 * inicial") era estado SÓ DE MEMÓRIA, gravado no objeto do torneio. O listener do
 * Firestore faz `store.tournaments = tournaments` — SUBSTITUI todos os objetos pelos docs
 * frescos. Um snapshot chegando entre ABRIR o painel e CLICAR a opção apagava o contexto;
 * _handleUnifiedOption via falsy e roteava pro ramo da FASE 0 → generateDrawFunction →
 * guard de re-sorteio. No diag do dono: `resolutionPanel:enter phaseCtx:true` … `pressSnap`
 * … `generateDraw` — o snapshot no meio é literalmente visível no log.
 *
 * CURA: registro POR ID fora do objeto + reancoragem a cada snapshot (_reattachPhaseResInfo),
 * mesmo padrão do _pendingPresence. Este teste SIMULA o snapshot (troca os objetos por
 * cópias frescas, como o listener faz) e exige que o contexto continue lá.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// Carrega só os helpers do store.js (o arquivo inteiro toca document no load).
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const i = src.indexOf('window._phaseResInfoById = window._phaseResInfoById || {};');
const j = src.indexOf('window._reapplyPendingPresence = function');
ok(i !== -1 && j > i, 'helpers de _phaseResInfo não encontrados no store.js');
const sandbox = { window: null, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(i, j), sandbox, { filename: 'store-phaseres' });
const W = sandbox.window;

// Simula EXATAMENTE o que o listener faz: descarta os objetos e usa docs frescos do servidor.
// O doc do Firestore nunca traz _phaseResInfo (é memória-only).
function snapshot(tours) {
  return tours.map(function (t) {
    var fresh = JSON.parse(JSON.stringify(t));
    delete fresh._phaseResInfo;
    return fresh;
  });
}

// ── 1. contexto sobrevive a um snapshot ──────────────────────────────────────
(function () {
  var t = { id: 'tA', name: 'Confra', phases: [{}, {}] };
  W._setPhaseResInfo(t, { lines: [{ dest: 'upper', size: 30 }, { dest: 'lower', size: 28 }], nextIdx: 1, nextName: 'Finais' });
  ok(!!t._phaseResInfo, 'contexto devia estar no objeto logo após setar');

  var frescos = snapshot([t]);
  ok(!frescos[0]._phaseResInfo, 'sanidade: o doc fresco vem SEM o contexto (é o bug)');

  W._reattachPhaseResInfo(frescos);
  ok(!!frescos[0]._phaseResInfo, 'REGRESSÃO: contexto NÃO sobreviveu ao snapshot — o clique cairia no sorteio da fase 0');
  ok(frescos[0]._phaseResInfo.nextIdx === 1, 'nextIdx preservado');
  ok(frescos[0]._phaseResInfo.lines.length === 2, 'linhas preservadas');
})();

// ── 2. sobrevive a snapshots REPETIDOS (o painel fica aberto vários segundos) ─
(function () {
  var t = { id: 'tB' };
  W._setPhaseResInfo(t, { nextIdx: 2 });
  var cur = [t];
  for (var k = 0; k < 5; k++) { cur = snapshot(cur); W._reattachPhaseResInfo(cur); }
  ok(!!cur[0]._phaseResInfo && cur[0]._phaseResInfo.nextIdx === 2, 'contexto devia sobreviver a N snapshots seguidos');
})();

// ── 3. limpar de verdade: não ressuscita no próximo snapshot ─────────────────
(function () {
  var t = { id: 'tC' };
  W._setPhaseResInfo(t, { nextIdx: 1 });
  W._clearPhaseResInfo(t);
  ok(!t._phaseResInfo, 'clear devia tirar do objeto');
  var frescos = snapshot([t]);
  W._reattachPhaseResInfo(frescos);
  ok(!frescos[0]._phaseResInfo, 'contexto limpo NÃO pode ressuscitar no snapshot seguinte');
})();

// ── 4. não vaza entre torneios ───────────────────────────────────────────────
(function () {
  var a = { id: 'tD' }, b = { id: 'tE' };
  W._setPhaseResInfo(a, { nextIdx: 1 });
  var frescos = snapshot([a, b]);
  W._reattachPhaseResInfo(frescos);
  ok(!!frescos[0]._phaseResInfo, 'torneio com contexto devia mantê-lo');
  ok(!frescos[1]._phaseResInfo, 'contexto NÃO pode vazar pra outro torneio');
})();

console.log((fail === 0 ? '✅' : '❌') + ` phase-res-info sobrevive ao snapshot: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
