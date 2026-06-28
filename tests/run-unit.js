/* Runner dos testes unitários headless — node tests/run-unit.js (ou npm test).
 * Roda cada suíte em processo próprio, mostra a saída e agrega o resultado.
 * Exit code != 0 se qualquer suíte falhar (serve pra CI / pre-deploy).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUITES = [
  'tests/test-utils.js',
  'tests/bracket-logic.test.js',
  'tests/draw-cores.test.js',
  'tests/phase-transition-matrix.test.js',
  'tests/phase-adversarial.test.js',
  'tests/phase-lifecycle.test.js',
  'tests/elim-seed.test.js',
  'js/views/phases-engine.test.js',
  'js/views/phase-generators.test.js',
  'js/views/team-formation.test.js',
  'js/views/phase-brick4.test.js',
  'functions-autodraw/test-draw.js',
  'functions-autodraw/test-groupsby.js',
];

let failed = [];
for (const rel of SUITES) {
  console.log('\n──────────── ' + rel + ' ────────────');
  const r = spawnSync(process.execPath, [path.join(ROOT, rel)], { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) failed.push(rel);
}

console.log('\n════════════════════════════════════════');
if (failed.length === 0) {
  console.log('✅ TODAS as ' + SUITES.length + ' suítes unitárias passaram');
} else {
  console.log('❌ ' + failed.length + '/' + SUITES.length + ' suíte(s) FALHARAM:');
  failed.forEach((f) => console.log('   - ' + f));
}
console.log('════════════════════════════════════════');
process.exit(failed.length ? 1 : 0);
