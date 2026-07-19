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
  // Item 10: TODO slot do sorteio carrega uid EXPLÍCITO (team*Uids/p*Uid) — R1 inclusive.
  // Antes a R1 saía só com team1Obj (undefined uid). Roda o motor REAL (draw-core → storePhase).
  'tests/slot-uid-on-draw.test.js',
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
  'tests/wo-availability-canonical.test.js',
  'tests/wo-outcome-wiring.test.js',
  'tests/wo-outcome-negotiation.test.js',
  'tests/late-enroll-inherit.test.js',
  'tests/late-enroll-live-control.test.js',
  'tests/round-display-no-r0.test.js',
  'tests/result-approval-uid.test.js',
  'tests/tiebreak-set-score.test.js',
  // Lista de espera present-first é uid-only: homônimo presente (uR2) vem antes; sort por-nome
  // casaria o 1º homônimo (uR1) e erraria. Trava o cânone "uid only" do painel de check-in.
  'tests/waitlist-present-first-uid.test.js',
  // Write do check-in é uid-only: marcar homônimo presente COM o uid grava a chave certa (uR2);
  // sem uid o nome cai no 1º homônimo (uR1) e marca a pessoa errada. Trava o toggle por uid.
  'tests/checkin-toggle-uid.test.js',
  // Chamada de DUPLAS aparece direto no detalhe: _buildDoublesInscritosSection só mostra os
  // toggles quando recebe o factory _rollCallPresenceCtx (reusado nas 2 telas). Sem ele, sem toggle.
  'tests/detail-doubles-rollcall.test.js',
  // Presença verde (presente) vs azul (confirmado remoto, NÃO presente); verde vence azul.
  'tests/presence-green-blue.test.js',
  // Card de autopresença do participante no detalhe: inscrito comum vê o toggle (→ _applySelfPresence);
  // autoridade não (marca pela chamada). No código velho o participante não tinha entry point pré-sorteio.
  'tests/my-presence-card.test.js',
  // Autopresença via presença de LOCAL: check-in confirmado no local do torneio, na janela
  // [início−2h, fim] → vira PRESENTE (verde) sozinho. Sem GPS silencioso; respeita "ausente" do org.
  'tests/auto-presence-venue.test.js',
  // Sandbox (SB) do dev — rede de isolamento: notif mudas, stats/resultados não vazam, invisível
  // pra não-dev. Trava _statsEligibleTournaments + getVisibleTournaments/getMyParticipations.
  'tests/sandbox-isolation.test.js',
  // Sandbox — criação do clone: _openOrCreateSandbox clona o estado atual (deep-copy), privado +
  // notif mudas + isSandbox, dev-only, sem tocar no original; 2ª chamada abre o mesmo SB.
  'tests/sandbox-create.test.js',
  // Convite pro grupo de WhatsApp (org notifica inscritos c/ o link): type wa_group fundamental
  // + CTA _notifCta abre o link do grupo. Sem o caso, cairia no "Ver torneio" genérico.
  'tests/wa-group-notify.test.js',
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
  // Flexibilizar como DECISÃO replicada na CF (_applyDrawDecisions forma as duplas do zero).
  'tests/flexibilize-decision-cf.test.js',
  // Nome da dupla tardia vem do uid ao vivo (nunca a string "undefined").
  'tests/late-join-name-uid.test.js',
  'tests/wo-slot-uid-identity.test.js',
  'tests/monarch-wo-uid-identity.test.js',
  'tests/liga-wo-invite.test.js',
  'tests/swiss-to-elim-transition.test.js',
  'tests/phase0-swiss-elim.test.js',
  'tests/dupla-repechage-full.test.js',
  'tests/late-dupla-tier2.test.js',
  // Gap (dono, 17/jul): dupla FORMADA na lista de espera entra na Eliminatória Simples também.
  'tests/late-dupla-single-elim.test.js',
  // Gap (dono, 17/jul, screenshot): dupla ímpar no repGame ("VS A definir") recebe a dupla tardia.
  'tests/late-dupla-repgame-fill.test.js',
  // Gap (dono, 17/jul, torneio REAL): dupla formada entra no lugar do repescado (chave playin).
  'tests/late-dupla-repfill-playin.test.js',
  // Bug (dono, 17/jul): contagem INSCRITOS/EQUIPES pulava dupla só-uid (nome stripado) — 8/4 vs 26/13.
  'tests/count-competitors.test.js',
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
  // Item 9: a FUSÃO agora POPULA loginRedirects (antes só a resolveLoginRedirect lia → redirect
  // nunca disparava). Chave = e-mail minúsculo / telefone E.164, igual ao que o reader lê.
  'tests/login-redirect-write.test.js',
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
  // Integração de tardios no servidor (draw-core.integrateLateEntries) — v1.2.57.
  'functions-autodraw/test-integrate-late.js',
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
