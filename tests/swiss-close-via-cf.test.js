/* swiss-close-via-cf.test.js — o FECHO de rodada Suíço pelo CLIENTE flui pela CF.
 *
 * _doCloseRound, pra um Suíço-2-fases (classificatória do construtor de fases), dispara
 * window._callCloseRound (no harness = stub que roda draw-core.closeRoundCore) ANTES de qualquer
 * mutação otimista — a CF é a autoridade e a resposta substitui `t`. Prova que o caminho do
 * cliente gera as rodadas 2..K e marca a classificatória completa (phaseComplete) via a CF, sem
 * encerrar o torneio. Ver project_draw_canonization_cf_phase23_deferred.
 */
const H = require('./render-harness');
const W = H.window;
const buildViaDraw = H.buildViaDraw;

// O fecho pela CF chama _rerenderBracket no .then — render real bate no DOM null do harness
// (getElementById → null). Este teste assere DADO (rodadas geradas), não render; stuba o render.
W._rerenderBracket = function () {};

let pass = 0, fail = 0;
function ok(m, c, got) {
  if (c) pass++;
  else { fail++; console.log('  ✗ ' + m + (got !== undefined ? ' (got ' + JSON.stringify(got) + ')' : '')); }
}
function playAll(t, ri) {
  (t.rounds[ri].matches || []).forEach(function (m) { if (!m.isSitOut && !m.isBye && !m.winner) m.winner = m.p1; });
}

console.log('\n== Suíço: fecho de rodada pelo cliente → CF ==');

// Suíço-2-fases via sorteio (cliente → CF stub → drawInitial), K=3.
const t = buildViaDraw('Eliminatórias Simples', 12, { p2Resolution: 'swiss', swissRounds: 3 });
ok('sorteou: fase 0 Suíço, round 1', Array.isArray(t.rounds) && t.rounds.length === 1 && t.classifyFormat === 'swiss',
  { r: t.rounds && t.rounds.length, cf: t.classifyFormat });

// round 1 completo → fecha pelo cliente → a CF gera round 2 e substitui `t`.
playAll(t, 0);
W._closeRound(t.id, 0);
ok('fecho r1 pela CF → gerou round 2', Array.isArray(t.rounds) && t.rounds.length === 2, t.rounds && t.rounds.length);
ok('não encerrou (r1)', t.status !== 'finished', t.status);

// round 2 completo → round 3.
playAll(t, 1);
W._closeRound(t.id, 1);
ok('fecho r2 pela CF → gerou round 3', Array.isArray(t.rounds) && t.rounds.length === 3, t.rounds && t.rounds.length);

// round 3 = maxRounds → phaseComplete: NÃO encerra (avanço pra elim é do multifase "Avançar").
playAll(t, 2);
W._closeRound(t.id, 2);
ok('fecho r3 (maxRounds) → NÃO encerra o torneio', t.status !== 'finished', t.status);
ok('classificatória completa: 3 rodadas, ainda na fase 0',
  t.rounds.length === 3 && (t.currentPhaseIndex || 0) === 0, { r: t.rounds.length, idx: t.currentPhaseIndex });

console.log((fail === 0 ? '✅' : '❌') + ' swiss-close-via-cf: ' + pass + ' asserts ok, ' + fail + ' falharam');
if (fail) process.exit(1);
