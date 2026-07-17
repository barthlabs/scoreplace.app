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
  // Trava a canonização: o cliente NÃO sorteia a Liga agendada (fim da corrida
  // cliente×CF). Se alguém religar o poller, esta suíte fica vermelha.
  'tests/liga-autodraw-server-only.test.js',
  'tests/draw-cores.test.js',
  'tests/phase-transition-matrix.test.js',
  'tests/phase-adversarial.test.js',
  'tests/phase-lifecycle.test.js',
  'tests/phase-lifecycle-formats.test.js',
  'tests/phase-chaining.test.js',
  'tests/phase-inactive-include.test.js',
  'tests/phase-promote-line.test.js',
  'tests/advanced-points-dedup.test.js',
  'tests/pa-uid-identity.test.js',
  'tests/uid-name-display.test.js',
  'tests/standings-uid-identity.test.js',
  'tests/h2h-uid-identity.test.js',
  'tests/h2h-matrix-uid.test.js',
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
  'tests/wa-group-link.test.js',
  'tests/elim-seed.test.js',
  'tests/elim-reirainha-opening.test.js',
  'tests/chave-label-default.test.js',
  'tests/letzplay-verdict-color.test.js',
  'tests/letzplay-pace.test.js',
  'tests/letzplay-model.test.js',
  'tests/letzplay-eta.test.js',
  'tests/letzplay-scan-order.test.js',
  'tests/phase0-elim.test.js',
  'tests/phase0-monarch.test.js',
  'tests/phase0-monarch-duplas.test.js',
  'tests/phase-complete-tagged.test.js',
  'tests/games-plan-multiphase.test.js',
  'tests/liga-phase0-rounds-cap.test.js',
  'tests/phase0-groups-canonical.test.js',
  'tests/phase-identity.test.js',
  'tests/no-format-regression.test.js',
  'tests/area-scaling-canon.test.js',
  'tests/duplas-teams-enrollmode.test.js',
  'tests/apply-result.test.js',
  'tests/apply-round-close.test.js',
  'tests/apply-wo.test.js',
  'tests/wo-individual.test.js',
  'tests/uid-poison.test.js',
  // Mesmo veneno, porta dos INSCRITOS (store.js — o uid-poison só carrega js/views/*).
  // Identificar inscrito por nome/e-mail (era o caso do organizador) fica VERMELHO aqui.
  'tests/uid-poison-inscritos.test.js',
  // Nº de inscrição é da PESSOA: formar/desfazer dupla NÃO mexe; só a saída renumera.
  'tests/enroll-number-canon.test.js',
  // Flexibilizar equilíbrio: forma duplas mesmo-gênero da sobra em vez de deixar gente de fora.
  'tests/flexibilize-balance.test.js',
  // Flexibilizado não mira pow2: o resto vira só o avulso (3→1); pow2 é a próxima tela.
  'tests/flexibilize-remainder.test.js',
  'tests/wo-slot-uid-identity.test.js',
  'tests/monarch-wo-uid-identity.test.js',
  'tests/liga-wo-invite.test.js',
  'tests/swiss-to-elim-transition.test.js',
  'tests/phase0-swiss-elim.test.js',
  'tests/dupla-repechage-full.test.js',
  'tests/late-dupla-tier2.test.js',
  'tests/phase-repechage-lines.test.js',
  'tests/reset-tournament.test.js',
  'tests/dupla-elim-render.test.js',
  'tests/monarch-render.test.js',
  'tests/game-numbering.test.js',
  'tests/cancel-x-canon.test.js',
  'tests/groups-render.test.js',
  'tests/liga-render.test.js',
  'tests/liga-countdown.test.js',
  'tests/sched-config-coherent.test.js',
  'tests/swiss-render.test.js',
  'tests/match-roster-uid.test.js',
  'tests/fairness-uid-identity.test.js',
  'tests/delete-account-dupla-orphan.test.js',
  'tests/merge-federated-wins.test.js',
  'tests/login-redirect.test.js',
  'tests/uid-sweep.test.js',
  'tests/reset-phone-reachable.test.js',
  'tests/delete-account-canon.test.js',
  'tests/dupla-detection-uid.test.js',
  'tests/draw-name-by-uid.test.js',
  'tests/name-to-uid-live-resolution.test.js',
  'tests/strip-rehydrate-identity.test.js',
  'tests/letzplay-rating.test.js',
  'tests/letzplay-import.test.js',
  'tests/letzplay-extract.test.js',
  'js/views/phases-engine.test.js',
  'js/views/phase-generators.test.js',
  'js/views/team-formation.test.js',
  'js/views/phase-brick4.test.js',
  'functions-autodraw/test-draw.js',
  'functions-autodraw/test-groupsby.js',
  'functions/test-match-roster.js',
  // Inscrição/desinscrição no servidor (CF) — espelha a transação do cliente.
  'functions/test-enroll-core.js',
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
