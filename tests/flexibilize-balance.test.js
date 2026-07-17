/* Flexibilizar equilíbrio — o preview dos pares que o sorteio EQUILIBRADO formaria.
 *
 * CÂNONE (dono): duplas mistas equilibrado não pode deixar 3 mulheres de fora só pra bater
 * potência de 2. A opção "Flexibilizar equilíbrio" forma a(s) dupla(s) mesmo-gênero da sobra
 * (inclusão acima de pow2) e resolve a pow2 depois. _equilibradoPairPreview conta esses pares
 * SEM formar — é o que decide se a opção aparece e o texto do efeito ("1 dupla só de mulheres").
 *
 * node tests/flexibilize-balance.test.js
 */
const W = require('./render-harness').window;

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓ ' + n + (got !== undefined ? ' — ' + got : '')); } else { fail++; console.log('  ✗ ' + n + (got !== undefined ? ' — ' + got : '')); } };
const men = (n) => Array.from({ length: n }, () => ({ gender: 'masculino' }));
const women = (n) => Array.from({ length: n }, () => ({ gender: 'feminino' }));

console.log('\n⚖️  _equilibradoPairPreview\n');
ok('helper existe', typeof W._equilibradoPairPreview === 'function');

// ── O caso real: 8 homens + 11 mulheres ─────────────────────────────────────
{
  const p = W._equilibradoPairPreview(men(8).concat(women(11)));
  ok('8M+11W: 8 duplas mistas', p.mixedPairs === 8, String(p.mixedPairs));
  ok('8M+11W: 1 dupla feminina', p.femalePairs === 1, String(p.femalePairs));
  ok('8M+11W: 0 dupla masculina', p.malePairs === 0, String(p.malePairs));
  ok('8M+11W: máx 9 times', p.maxTeams === 9, String(p.maxTeams));
  ok('8M+11W: sobra 1 pessoa', p.leftover === 1, String(p.leftover));
  ok('8M+11W: 1 par mesmo-gênero → opção aparece', p.sameGenderPairs === 1 && p.mixedPairs > 0);
}

// ── Sobra masculina: 11 homens + 8 mulheres ─────────────────────────────────
{
  const p = W._equilibradoPairPreview(men(11).concat(women(8)));
  ok('11M+8W: 1 dupla masculina', p.malePairs === 1 && p.femalePairs === 0, 'm=' + p.malePairs + ' f=' + p.femalePairs);
  ok('11M+8W: máx 9 times, sobra 1', p.maxTeams === 9 && p.leftover === 1);
}

// ── Equilibrado exato: 8M + 8W → sem par mesmo-gênero (opção NÃO aparece) ────
{
  const p = W._equilibradoPairPreview(men(8).concat(women(8)));
  ok('8M+8W: 0 par mesmo-gênero', p.sameGenderPairs === 0, String(p.sameGenderPairs));
  ok('8M+8W: 8 times, sem sobra', p.maxTeams === 8 && p.leftover === 0);
}

// ── Sem homens (nenhum gênero de homem) → mixedPairs 0 → opção NÃO aparece ───
{
  const p = W._equilibradoPairPreview(women(19));
  ok('19 não-homens: 0 dupla mista → gate (mixedPairs>0) barra a opção', p.mixedPairs === 0, String(p.mixedPairs));
}

// ── Par: forma a dupla feminina exata sem sobra (8M + 10W) ───────────────────
{
  const p = W._equilibradoPairPreview(men(8).concat(women(10)));
  ok('8M+10W: 8 mistas + 1 feminina, sem sobra', p.mixedPairs === 8 && p.femalePairs === 1 && p.leftover === 0);
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passaram · ' + fail + ' falharam\n');
process.exit(fail ? 1 : 0);
