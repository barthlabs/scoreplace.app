/* Suíço-pow2 pelo CLIENTE flui pela CF (passo 2b da canonização).
 *
 * generateDrawFunction NÃO tem mais ramo local de Suíço: com o guard `!== 'swiss'` removido,
 * p2Resolution='swiss' entra no _callDrawRound. No harness, _callDrawRound é o stub que roda
 * draw-core.drawInitial (vendor/ = cópia exata de js/views/*) → _buildSwissClassifDraw. Este
 * teste prova que o CAMINHO DO CLIENTE (generateDrawFunction, via buildViaDraw) produz o doc
 * Suíço de 2 fases — como o ramo local foi APAGADO, só há um caminho: o da CF.
 * Ver project_draw_canonization_cf_phase23_deferred.
 */
const H = require('./render-harness');
const buildViaDraw = H.buildViaDraw;

let pass = 0, fail = 0;
function ok(m, c, got) {
  if (c) { pass++; }
  else { fail++; console.log('  ✗ ' + m + (got !== undefined ? ' (got ' + got + ')' : '')); }
}

console.log('\n== Suíço-pow2 pelo cliente → CF ==');

// ── INDIVIDUAIS: 12 → lo=8 (maior pow2 ≤ 12), K=ceil(log2(12))=4 ─────────────────────
(function () {
  const t = buildViaDraw('Eliminatórias Simples', 12, { p2Resolution: 'swiss' });
  const ph = Array.isArray(t.phases) ? t.phases : [];
  ok('individuais → 2 fases', ph.length === 2, 'phases=' + ph.length);
  ok('individuais → fase 0 é Suíço (liga/Suíço)',
    !!(ph[0] && ph[0].formatCode === 'liga' && /su[ií]ç?o|swiss/i.test(String(ph[0].format))),
    JSON.stringify(ph[0] && { fc: ph[0].formatCode, f: ph[0].format }));
  ok('individuais → fase 1 puxa top-8 (rankTo=8)',
    !!(ph[1] && ph[1].source && ph[1].source.type === 'previous_phase' &&
       ph[1].source.mapping && ph[1].source.mapping[0] && ph[1].source.mapping[0].rankTo === 8),
    JSON.stringify(ph[1] && ph[1].source));
  ok('individuais → classifyFormat=swiss', t.classifyFormat === 'swiss', String(t.classifyFormat));
  ok('individuais → standings com 12 entradas', Array.isArray(t.standings) && t.standings.length === 12,
    'standings=' + (t.standings && t.standings.length));
  ok('individuais → rodada 1 gerada (6 jogos)',
    Array.isArray(t.rounds) && t.rounds.length === 1 &&
    (t.rounds[0].matches || []).filter(function (m) { return !m.isSitOut && !m.isBye; }).length === 6,
    'rounds=' + (t.rounds && t.rounds.length) + ' jogos=' + (t.rounds && t.rounds[0] &&
      (t.rounds[0].matches || []).filter(function (m) { return !m.isSitOut && !m.isBye; }).length));
  ok('individuais → status active', t.status === 'active', String(t.status));
  ok('individuais → p2Resolution limpo', t.p2Resolution == null, String(t.p2Resolution));
})();

// ── DUPLAS: 24 individuais → 12 duplas (teamSize 2) → lo=8, K=4. As duplas são formadas
//    ANTES do Suíço (drawInitial roda _formDoublesTeams antes do handler) e entram COMO ESTÃO.
(function () {
  const t = buildViaDraw('Eliminatórias Simples', 24, { p2Resolution: 'swiss', teamSize: 2, enrollmentMode: 'teams' });
  const ph = Array.isArray(t.phases) ? t.phases : [];
  ok('duplas → 2 fases', ph.length === 2, 'phases=' + ph.length);
  ok('duplas → standings com 12 duplas', Array.isArray(t.standings) && t.standings.length === 12,
    'standings=' + (t.standings && t.standings.length));
  ok('duplas → fase 1 puxa top-8 (rankTo=8)',
    !!(ph[1] && ph[1].source && ph[1].source.mapping && ph[1].source.mapping[0] &&
       ph[1].source.mapping[0].rankTo === 8),
    JSON.stringify(ph[1] && ph[1].source));
  ok('duplas → rodada 1 gerada (6 jogos de duplas)',
    Array.isArray(t.rounds) && t.rounds.length === 1 &&
    (t.rounds[0].matches || []).filter(function (m) { return !m.isSitOut && !m.isBye; }).length === 6,
    'jogos=' + (t.rounds && t.rounds[0] && (t.rounds[0].matches || []).filter(function (m) { return !m.isSitOut && !m.isBye; }).length));
})();

console.log((fail === 0 ? '✅' : '❌') + ' swiss-draw-via-cf: ' + pass + ' asserts ok, ' + fail + ' falharam');
if (fail > 0) process.exit(1);
