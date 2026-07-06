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
  'tests/phase-lifecycle-formats.test.js',
  'tests/phase-chaining.test.js',
  'tests/phase-inactive-include.test.js',
  'tests/phase-promote-line.test.js',
  'tests/advanced-points-dedup.test.js',
  'tests/standings-tiebreakers.test.js',
  'tests/seed-pairing.test.js',
  'tests/grandfinal-lines.test.js',
  'tests/category-transition.test.js',
  'tests/double-elim.test.js',
  'tests/repechage.test.js',
  'tests/live-scoring-resolve.test.js',
  'tests/sport-rules-canonical.test.js',
  'tests/advantage-sport-derived.test.js',
  'tests/sport-scoring-rules.test.js',
  'tests/result-approval-gate.test.js',
  'tests/draw-schedule.test.js',
  'tests/elim-seed.test.js',
  'tests/phase0-elim.test.js',
  'tests/phase0-monarch.test.js',
  'tests/phase0-monarch-duplas.test.js',
  'tests/phase-complete-tagged.test.js',
  'tests/games-plan-multiphase.test.js',
  'tests/liga-phase0-rounds-cap.test.js',
  'tests/phase0-groups-canonical.test.js',
  'tests/phase-identity.test.js',
  'tests/no-format-regression.test.js',
  'tests/duplas-teams-enrollmode.test.js',
  'tests/apply-result.test.js',
  'tests/apply-round-close.test.js',
  'tests/apply-wo.test.js',
  'tests/liga-wo-invite.test.js',
  'tests/swiss-to-elim-transition.test.js',
  'tests/phase0-swiss-elim.test.js',
  'tests/dupla-repechage-full.test.js',
  'tests/phase-repechage-lines.test.js',
  'tests/reset-tournament.test.js',
  'tests/dupla-elim-render.test.js',
  'tests/monarch-render.test.js',
  'tests/groups-render.test.js',
  'tests/liga-render.test.js',
  'tests/swiss-render.test.js',
  'js/views/phases-engine.test.js',
  'js/views/phase-generators.test.js',
  'js/views/team-formation.test.js',
  'js/views/phase-brick4.test.js',
  'functions-autodraw/test-draw.js',
  'functions-autodraw/test-groupsby.js',
  'functions/test-match-roster.js',
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
