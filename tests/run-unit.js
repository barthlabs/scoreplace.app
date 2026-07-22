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
  'tests/late-enroll-window-r2-result.test.js',
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
  // Sandbox — espelho one-way no cliente: a MESMA AppStore.mutate roda o MESMO mutator no SB.
  // Guardas: só dev, mão única (nada volta), só enquanto o SB não foi sorteado.
  'tests/sandbox-mirror-mutate.test.js',
  // Sandbox — Resetar re-sincroniza com o original AGORA (dropa adições de teste), preservando
  // a identidade/isolamento do SB. "SB tal qual o original no momento do reset."
  'tests/sandbox-reset-resync.test.js',
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
  'tests/pair-side-no-third-line.test.js',
  'tests/wo-slot-uid-identity.test.js',
  'tests/monarch-wo-uid-identity.test.js',
  'tests/liga-wo-invite.test.js',
  'tests/swiss-to-elim-transition.test.js',
  'tests/phase0-swiss-elim.test.js',
  'tests/swiss-draw-via-cf.test.js',
  'tests/swiss-close-via-cf.test.js',
  'tests/dupla-repechage-full.test.js',
  'tests/late-dupla-tier2.test.js',
  // Gap (dono, 17/jul): dupla FORMADA na lista de espera entra na Eliminatória Simples também.
  'tests/late-dupla-single-elim.test.js',
  // PLAY-THROUGH completo da integração tardia (dono, 20/jul): joga a chave INTEIRA com o motor
  // real (_advanceWinner) e exige que FECHE num campeão — pega BYE travado, repescado não-atribuído,
  // 3º lugar apagado, presença. É o gate que faltava (os testes antigos "jogavam" sem _advanceWinner).
  'tests/minimal-elim-formula.test.js',
  'tests/bye-elim-formula.test.js',
  'tests/late-integration-fullplay.test.js',
  'tests/draw-preserve-waitlist-presence.test.js',
  // v1.3.82: overlay de presença pendente sobrevive a snapshot stale do Firestore (aparece/apaga).
  'tests/pending-presence-overlay.test.js',
  // v1.3.87: 2 duplas pré-formadas ausentes→presentes (uma de cada vez) → a 2ª PREENCHE o "a definir"
  // da 1ª (não abre jogo novo). Reproduz o bug do SB Casais (só _lateJoin entrava).
  'tests/late-dupla-fills-adefinir-separate.test.js',
  // v1.3.88: SWEEP — todo formato × config × N pelo motor canônico (draw-core), joga a chave inteira.
  'tests/draw-sweep-all-formats.test.js',
  // SWEEP de INTEGRAÇÃO TARDIA (formato × config × N): dupla formada de solos, dupla pré-formada
  // ausente que chega, solo tardio → tem que entrar na chave (não ficar órfão) e jogar até campeão.
  // Pegou o gap: Dupla Elim pow2 sem repescagem não integrava tardio (fix: re-sorteio Tier-1). v1.3.x.
  'tests/late-integration-sweep.test.js',
  // SWEEP FASE CLASSIFICATÓRIA → ELIM (fmt2): todo N × grupos × classificados joga a classificatória,
  // avança (materializeNextPhase) e fecha a elim num campeão; + integração tardia na classificatória.
  // Individual e duplas, Grupos e Suíço. Pegou o gap: tardio não integrava em grupos/Suíço (fix redraw). v1.3.x.
  'tests/classificatory-phase-sweep.test.js',
  // BUG DO DONO: "formei dupla e nada dela entrar na chave". Dupla formada pós-sorteio funde em
  // participants (fora da espera) → ficava órfã. Fix: integrateLateEntries detecta órfão de roster
  // e re-sorteia (todo formato, incl. Elim Simples) + _triggerLateIntegration(force) + form dispara.
  'tests/form-pair-integration.test.js',
  // E2E "TUDO NA CF": dirige as funções de CLIENTE REAIS (_formDuplaByUids/_splitDupla) pelo
  // dispatch real → CF formPair/splitPair (pair-core) → CF integrateLateEntries (draw-core).
  // Prova que forma/desfaz dupla entra/sai da chave SEM o cliente gravar (saveTournament=0).
  'tests/e2e-form-pair.test.js',
  // TIE-BREAK configurável por torneio (5-5 vs 6-6) — gatilho por regra/esporte. v1.3.x.
  'tests/tiebreak-trigger.test.js',
  'tests/tiebreak-display-persist.test.js',
  'tests/progress-third-place-nodouble.test.js',
  // Melhor derrotado pega a vaga com MENOS jogos (repescagem 1 linha) — regra do dono. v1.3.x.
  'tests/repechage-best-loser-advancement.test.js',
  // v1.3.89: SWEEP W.O. + integração tardia (motor _applyWO real + CF integrateLateEntries), joga até fechar.
  'tests/draw-sweep-wo-late.test.js',
  'tests/present-only-no-lost-entries.test.js',
  // Gap (dono, 17/jul, screenshot): dupla ímpar no repGame ("VS A definir") recebe a dupla tardia.
  'tests/late-dupla-repgame-fill.test.js',
  // Gap (dono, 17/jul, torneio REAL): dupla formada entra no lugar do repescado (chave playin).
  'tests/late-dupla-repfill-playin.test.js',
  // Bug (dono, jul/2026): Dupla Elim playin, repescado JÁ definido (frozen) + dupla formada à mão
  // (órfão de roster) → entra CIRURGICAMENTE, sem redraw, preservando o congelado.
  'tests/late-dupla-orphan-frozen-rep.test.js',
  // Bug (dono, jul/2026): "Presentes chega em 24, cai e dá pulinhos" — doc stale da CF trocava o
  // torneio inteiro e engolia a presença otimista recém-marcada.
  'tests/cf-doc-clobbers-presence.test.js',
  // CÂNONE de cores de presença (dono, jul/2026): presente=VERDE, ausente=AZUL; dupla=tom escuro,
  // individual=tom claro. Trava pra não regredir em nenhum renderer.
  'tests/presence-color-canon.test.js',
  // Bug (dono, jul/2026): no meio do sorteio a tela voltava pro detalhe (cards) por baixo do
  // "Sorteando…" — a tela de processamento global faltava na safe-list do _softRefreshView.
  'tests/loading-blocks-softrefresh.test.js',
  // Bug (dono, jul/2026, print "JOGO 7"): dupla tardia entrou na chave contra SI MESMA (dos 2
  // lados). Trava: dedup por identidade nos 2 stores + guard anti-auto-confronto no "a definir".
  'tests/late-dupla-no-self-match.test.js',
  // Bug (dono, jul/2026): "continua diminuindo os presentes depois de 24 presenças" — doc da CF
  // lido ANTES das últimas marcações sobrescrevia checkedIn. Eco de CF nunca regride presença.
  'tests/cf-doc-no-presence-regress.test.js',
  // Desastre (dono, jul/2026, SB Casais): integração tardia RE-SORTEAVA a chave publicada
  // ("mudou tudo, dupla virou individual, criou jogo 8"). Entrada tardia é SEMPRE aditiva.
  'tests/late-entry-never-redraws.test.js',
  // Idempotência da integração tardia (dono: "criou 2 jogos em vez de 1"): registro POR ENTRADA
  // (t.lateIntegrated), NUNCA "nome na chave" — senão inviabilizaria a REPESCAGEM (ressalva do dono).
  'tests/late-entry-idempotent.test.js',
  // Instabilidade da chamada (dono: "presença pulando e regredindo depois de 24"): a integração era
  // disparada 1× por toggle → enxurrada de docs+re-render. Rajada agora coalesce numa chamada.
  'tests/late-integration-debounce.test.js',
  // Dados REAIS do SB (dono): mesmo par de uids em 2 jogos com NOMES diferentes ("Jogador sem
  // perfil (aL7U)…" vs "Marcello/Karla") — guards por NOME não casavam. Membership é por UID.
  'tests/late-entry-uid-identity.test.js',
  // Seletor de tie-break 5-5/6-6 sumia na config (dono): _reSyncTbAt tinha lógica própria de
  // "usa sets"; tem de usar a FONTE CANÔNICA _scoringUsesSets (a mesma do placar).
  'tests/tiebreak-at-visibility.test.js',
  // CAUSA-RAIZ do "presença pulando e desmarcando depois de ~16" (dono): o mutator era um TOGGLE e
  // roda MAIS DE UMA VEZ (local+fresco, retry da txn) → nº par de aplicações desmarcava. Idempotente.
  'tests/presence-mutator-idempotent.test.js',
  'tests/presence-field-write.test.js',
  'tests/draw-scope-all-ignores-presence.test.js',
  'tests/draw-scope-all-ignores-presence.test.js',
  // Dupla Elim (dono): dupla PRÉ-FORMADA na espera, ao receber presença, ia pro LIMBO — o placer
  // exigia _lateJoin (flag que só dupla formada TARDE tem). Entra na R1 da chave SUPERIOR.
  'tests/late-dupla-elim-r1-entry.test.js',
  // TRAVA ESTRUTURAL (dono: "faça de forma robusta"): TODO mutator que roda em AppStore.mutate/
  // commitTournamentTx é IDEMPOTENTE (N× ≡ 1×). Mutator novo nascendo como toggle fica VERMELHO.
  'tests/mutators-idempotent-canon.test.js',
  // VARREDURA Dupla Elim × TODOS os N (2..24) com integração tardia + playout até o campeão.
  // A Simples entra como CASO DERIVADO (= a Dupla sem a linha inferior).
  'tests/dupla-elim-late-sweep.test.js',
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
  // CF aplica o pacote de decisões do organizador ao elenco (sem-dupla, resto). v1.2.29.
  'functions-autodraw/test-draw-decisions.js',
  // PORTÃO da migração sorteio client→CF (item #2): pacote ≡ core puro para odd/incomplete/
  // scope/absentees/p2 + regressão do loop infinito de _applyRemainderRemoval. v1.3.x.
  'functions-autodraw/test-draw-decisions-parity.js',
  // Migração client→CF: generateDrawFunction RESTAURA o roster original no doc antes de
  // despachar → a CF sorteia de (original + pacote), neutralizando mutação do cliente. v1.3.x.
  'tests/draw-client-restore-original.test.js',
  // Integração de tardios no servidor (draw-core.integrateLateEntries) — v1.2.57.
  'functions-autodraw/test-integrate-late.js',
  // Cenário do dono (SB Casais): dupla ausente na espera → marca presente → CF forma o
  // confronto (o bug era o CLIENTE nunca disparar a CF; o toggle in-place suprimia o gatilho).
  'functions-autodraw/test-late-present-fills-adefinir.js',
  // Gate do DETALHE (#tournaments/:id) não pula ao marcar presença: _tournamentDetailSig é
  // determinística (sem updatedAt) → o eco do próprio write vê "igual". v1.3.96.
  'tests/tournament-detail-sig.test.js',
  // Inscritos (individual E duplas) usam GRID responsivo — várias colunas em tela larga, nunca
  // coluna única. Trava contra regressão (dono: "não pode regredir"). v1.3.101.
  'tests/inscritos-grid-canon.test.js',
  // Botões CANCELAR do fluxo de sorteio são VERMELHOS (#dc2626), nunca transparentes. v1.3.103.
  'tests/draw-cancel-red-canon.test.js',
  'functions/test-match-roster.js',
  // Formar/desfazer dupla manual → CF (roster→CF): lógica pura de pair-core (espelha
  // _formDuplaByUids/_splitDupla). A replicação sandbox roda no emulador (test-pair-replicate.js). v1.3.x.
  'functions/test-pair-core.js',
  // Inscrição/desinscrição no servidor (CF) — espelha a transação do cliente.
  'functions/test-enroll-core.js',
  // Item 7: janelas do lembrete de torneio (7d/2d/0d) ESPELHAM o cliente; data-only BRT.
  // Se o servidor contar em UTC ou disparar em dia errado, sai fora. (Entrega = emulador.)
  'functions/test-reminder-core.js',
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
