/* Rótulo das chaves: default "Chave N", NUNCA Ouro/Prata; 1 chave = sem rótulo — node tests/chave-label-default.test.js
 *
 * Diretriz do dono (staging 4.5.52): o nome default de uma chave é "Chave N" (renomeável pelo
 * organizador). NUNCA hardcodar "Ouro/Prata" como default — é só um exemplo, não regra. E com
 * UMA chave só não aparece rótulo nenhum (igual categoria única).
 * Congela o motor REAL (phases-engine.buildPhaseBrackets):
 *   • 1 chave, sem nome  → NENHUM match carrega tierLabel (render omite o rótulo).
 *   • 2 chaves, sem nome → tierLabel = "Chave 1" / "Chave 2" (jamais Ouro/Prata/Série).
 *   • nome custom (mapping.label) → preservado tal qual.
 * Ver feedback_dont_canonize_examples, project_playoff_formats, feedback_tests_must_reproduce_real_failure.
 */
const { E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const cs = function (g) { return g.standings; };
function grp(n) { var st = []; for (var j = 0; j < n; j++) st.push({ name: 'P' + j, displayName: 'P' + j, wins: n - j }); return [{ standings: st }]; }
function cfg(dests, labels) {
  return {
    source: { mapping: dests.map(function (d, i) { var mp = { dest: d, rankFrom: 1, rankTo: 999 }; if (labels && labels[i]) mp.label = labels[i]; return mp; }), scope: 'per_group', rankingBasis: 'individual' },
    fixedPairs: false, pairingStrategy: 'top'
  };
}
// só os rótulos das CHAVES (linhas) — exclui os jogos de convergência (grande final / 3º-4º),
// que têm título próprio ("🏆 Grande Final" / "🥉 Disputa de 3º/4º"), não são rótulo de chave.
function tierLabels(r) {
  return r.matches.filter(function (m) { var bk = m.bracket || ''; return bk !== 'grandfinal' && bk !== 'thirdplace' && bk !== 'grand' && !m.isThirdPlace; })
    .map(function (m) { return m.tierLabel; }).filter(Boolean);
}
function uniqSorted(a) { return Array.from(new Set(a)).sort(); }

// ── 1 chave, sem nome → NENHUM tierLabel ──────────────────────────────────────
(function () {
  var r = E.buildPhaseBrackets(grp(4), cfg(['main']), cs, 'one');
  ok(r.matches.length > 0, '[1 chave] gerou jogos');
  ok(r.matches.every(function (m) { return !m.tierLabel; }), '[1 chave] NENHUM jogo carrega tierLabel (sem rótulo, igual categoria única)');
})();

// ── 2 chaves, sem nome → "Chave 1" / "Chave 2", nunca Ouro/Prata ──────────────
(function () {
  var r = E.buildPhaseBrackets(grp(8), cfg(['upper', 'lower']), cs, 'two');
  var labels = uniqSorted(tierLabels(r));
  ok(labels.join(',') === 'Chave 1,Chave 2', '[2 chaves] default = "Chave 1"/"Chave 2" [' + labels.join(',') + ']');
  ok(!tierLabels(r).some(function (l) { return /ouro|prata|série/i.test(l); }), '[2 chaves] NUNCA Ouro/Prata/Série no default');
})();

// ── 2 chaves COM nome custom → preservado ─────────────────────────────────────
(function () {
  var r = E.buildPhaseBrackets(grp(8), cfg(['upper', 'lower'], ['Elite', 'Desafio']), cs, 'cst');
  var labels = uniqSorted(tierLabels(r));
  ok(labels.join(',') === 'Desafio,Elite', '[custom] nome do organizador preservado [' + labels.join(',') + ']');
})();

// ── custom pode até ser "Ouro" SE o organizador escolher (é escolha, não default) ──
(function () {
  var r = E.buildPhaseBrackets(grp(8), cfg(['upper', 'lower'], ['Ouro', 'Prata']), cs, 'gld');
  ok(uniqSorted(tierLabels(r)).join(',') === 'Ouro,Prata', '[custom Ouro/Prata] respeitado quando é ESCOLHA do organizador');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' chave-label-default: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
