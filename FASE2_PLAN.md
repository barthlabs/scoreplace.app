# Dupla Eliminatória — conserto play-in: estado + Fase 2

## ✅ CONCLUÍDO (2026-07-24) — gate 191/191 VERDE + guardrail ALL CLEAN

Fase 1 (play-in fresh + auto-resolução) E Fase 2 (entrada tardia) FEITAS e testadas. 5 arquivos de
código + 12 suítes reconciladas + guardrail fortalecido. Entrada tardia: chave FRESCA → re-semeia
pro N+1 (`integrateLateEntries` no draw-core, respeita gate + órfão de roster); PÓS-jogo → preenche
BYE materializado (`_placeLateEntriesSurgically`, DOOR-AWARE); jogo com placar nunca é re-sorteado.
Bug real caçado: `_updateDuplaElimClassification` contava rótulo BYE (a inferior nova tem byes).

**LIMITAÇÃO conhecida:** porta na INFERIOR + sem bye materializado lá → tardio fica na espera
(suplente, seguro), pois o bye-fill só PREENCHE bye, não CRIA jogo na inferior. Se o dono quiser o
tardio sempre jogando aí, falta o análogo pós-jogo do fresh-additive na inferior.

Próximo: `npm test` (verde) → confirmar deploy com o dono (outward-facing) → teste na quadra.

---
## (histórico do caminho)

Branch `claude/brave-leavitt-eabbf4` (worktree `musing-tharp-9f697f`), sobre v1.4.32.
Memória canônica: `project_bye_rep_auto_resolution` (atualizada 2026-07-24).

## ✅ FASE 1 — FEITA E VALIDADA (não commitada; gate ainda vermelho — ver acoplamento)

Resolução de "fora de potência de 2" virou AUTOMÁTICA (planilha do dono) + a Dupla Eliminatória
fora de pow2 passou da **árvore-mínima** para o **play-in clássico**:

- `window._autoP2Resolution(t)` — `tournaments-draw-prep.js` (após `checkPowerOf2`). byes=`missing`,
  reps=`excess`; 'bye' se byes≤reps senão 'playin' (empate→bye; pow2/≤2→bye).
- `_buildPhase0Cfg` (`tournaments-draw.js` ~L1904) — usa `_autoP2Resolution` p/ `elim_dupla`
  (respeita swiss/exclusion/standby). Escopo SÓ elim_dupla.
- `_duplaR1FromPool` playin (`phases-engine.js`) — emite play-in R0 (`isPlayIn`) + R1 sup (round 1).
- `_buildRepechageDoubleElim` playin (`tournaments-draw.js`) — upper R2..W halving + pré-rodada
  inferior (perdedores R1 sup + perdedores play-in) → `_rebuildLowerBracket` com **`mode:'bye'`**.
  Repescagem recursiva REMOVIDA.

**Prova:** protótipo `tests/_playin_proto.js` (ALL CLEAN N=3..48 × 4 padrões). Guardrail
`tests/_repechage-invariant.js` (fortalecido: pega double-book DURANTE o playout) → **FRESH = 0**.

**Sincronizar vendor após editar js/views:** `node functions-autodraw/copy-vendor.js`.

## 🟢 FASE 2 — COMPORTAMENTO COMPLETO E CORRETO (falta só reconciliar 11 suítes)

**FORK resolvido pelo dono: chave FRESCA + tardio → RE-SEMEIA pro N+1.** Implementado em
`integrateLateEntries` (draw-core): detecta fresh (nada jogado, só byes com winner) + tardio presente
fora da chave → move pra participants, limpa a chave, `drawInitial` pro N+1. Validado (`tests/_fresh_chk`
reproduzido inline) N=3,4,5,7,8,9,15,16,17,31,32: **tardio integrado + saiu da espera + 0 travado +
campeão**. Após jogo lançado (não-fresh) → `_placeLateEntriesSurgically` preenche BYE materializado.

**Guardrail: ALL CLEAN (fresh+late N=3..48×4). Gate: 180/191** (11 vermelhas, TODAS dupla/tardia,
zero colateral). Sweeps já reconciliados e VERDES: `dupla-elim-late-sweep`, `late-integration-sweep`.

### ⚠️ 11 suítes a reconciliar (reescrever expectativas pra estrutura nova — SEM test-theater)
Todas assertam a árvore-mínima / mecânica removida (repFill, repescagem-recursiva, grows-lower,
recompute-n, sync-lower, door-via-surgical-placer-no-fresh). O comportamento novo está CERTO
(guardrail + 2 sweeps + fresh-chk provam); falta trocar as asserções obsoletas:
- **Fresh (counts árvore-mínima → play-in/bye):** `dupla-elim-minimal-tree` (N=12 agora é BYE-mode:
  R1=8 jogos padded p/ 16, não 6/3/2/1), `dupla-repechage-full`, `dupla-elim-render`.
- **Tardia (mecânica antiga → re-seed fresh / bye-fill pós-jogo):** `late-dupla-tier2`,
  `late-dupla-repgame-fill`, `late-dupla-orphan-frozen-rep`, `late-entry-door-closes` (chama o
  surgical placer DIRETO no fresh — trocar p/ `integrateLateEntries`; e o bye-fill precisa virar
  DOOR-AWARE: preferir a inferior após 1º resultado da 2ª sup), `late-entry-upper-grows-lower`,
  `late-entry-recompute-n`, `sync-lower-bracket`, `late-dupla-elim-r1-entry`.

### Pendência de código conhecida (além dos testes)
- **bye-fill não é door-aware:** `_placeAtBye` preenche o 1º bye achado (qualquer chave), não respeita
  a porta upper→lower (`project_late_entry_door_upper_then_lower`). Guardrail não pega (só cata
  double-book); `late-entry-door-closes` pega. Fazer o `_placeAtBye` preferir a inferior quando a
  2ª sup já teve resultado.
- **pow2 pós-jogo sem bye → suplente:** N pow2 com jogo lançado e sem bye materializado deixa o
  tardio na espera (seguro, mas não compete). Avaliar se o dono quer algo melhor aí.

## (histórico) tentativas anteriores

**Feito (2026-07-24, mesma sessão):** a máquina tardia estava TODA acoplada à árvore-mínima, mas
o diagnóstico (`tests/_late_diag.js`) mostrou que na estrutura nova **só `_placeLateEntriesSurgically`
age** (as outras no-op). O double-book vinha do seu caso-2 (cria `repFill` que ressuscita um
derrotado JÁ VIVO na inferior). Fix localizado nessa função:
- Flag `t._duplaAutoStructure` marcada em `_buildRepechageDoubleElim` + `_buildDoubleElimBracket`.
- Nova ramificação: **preenche um BYE materializado** (`_placeAtBye`) — bye→jogo real, o time que
  folgava joga o tardio; desfaz o auto-avanço só se a rodada seguinte não tem placar. Guardrail
  late (após jogar 1ª sup) → **0**. `dupla-elim-late-sweep` volta a passar.
- Sem bye + rodada de entrada FRESCA → cria `tardio vs BYE` ADITIVO (isolado, sem avanço). Passa a
  suíte, MAS **não liga o tardio à competição** (ponto em aberto — ver o FORK).

**Guardrail agora: ALL CLEAN (fresh + late, N=3..48, 4 padrões).** Gate: **179/191** (12 vermelhas:
3 fresh obsoletas + 9 tardia).

### ⛔ FORK — decisão do dono (bloqueia o resto da Fase 2)
Quando um tardio entra numa chave **FRESCA (publicada mas nada jogado)**, dois cânones do dono
CONFLITAM:
- **`project_bye_rep_auto_resolution`** (autoritativo p/ esta campanha): "recomputa a resolução pro
  N+1 e redesenha PRESERVANDO o jogado" → RE-SEMEIA os jogos não jogados.
- **`project_late_dupla_fills_awaiting_slot` + `project_late_entry_never_redraws`** (+ o desastre
  SB Casais): "NUNCA re-sortear nem mexer nos jogos existentes" → só ADITIVO, jamais toca o publicado.
A chave nova é pow2 limpa (sem vaga aditiva natural) → sem re-semear, o tardio numa chave fresca só
consegue um jogo ISOLADO (não compete). Decidir isto define a implementação e a reescrita das 9 suítes.

### As 12 suítes vermelhas
- **3 fresh (obsoletas, reescrever pros counts do play-in/bye):** `dupla-elim-minimal-tree`,
  `dupla-repechage-full`, `dupla-elim-render`. A estrutura nova é a certa (guardrail-clean); as
  asserções da árvore-mínima (⌈E/2⌉, repR1) não valem mais.
- **9 tardia (dependem do FORK):** `late-dupla-tier2`, `late-integration-sweep`,
  `late-dupla-repgame-fill`, `late-dupla-orphan-frozen-rep`, `late-entry-door-closes`,
  `late-entry-upper-grows-lower`, `late-entry-recompute-n`, `sync-lower-bracket`,
  `late-dupla-elim-r1-entry`. Assertam repFill/repescagem-recursiva/grows-lower/recompute-n do
  modelo antigo. Reescrever pro comportamento novo — que depende da decisão do FORK.

## ⚠️ (histórico) máquina de entrada tardia — acoplamento original (~1500 linhas)

`_integrateLateDuplas` / `_placeLateEntriesSurgically` / `_syncLowerBracket` /
`_fillRepFillWithLateDuplas` / `_createExtraGamesFromWaitlist` / `_returnRepescadoToLower` /
`_repropagateDecided` / `_wireLateLoserToLower` / `_rebuildIntegratedBracket` (tournaments-draw.js)
são acopladas aos marcadores da árvore-mínima (`isPhaseRepR1`, `repFill`, `isPhaseRepGame`,
"a definir"). A estrutura nova (play-in limpo + byes) não os tem → a máquina **double-booka**.

Guardrail: **late = 184** (era 152; PIOROU porque a máquina roda sobre estrutura pra qual não foi
feita). Por isso Fase 1 sozinha NÃO é deployável — as duas fases são acopladas.

### Abordagem canônica (do dono)
1. **Existe BYE?** o tardio o PREENCHE (bye→jogo real), cirurgicamente, sem re-sortear.
2. **Sem BYE?** recomputa a resolução pro N+1 e redesenha PRESERVANDO o jogado (jogo com placar é
   intocável — `project_concurrency_safe_saves`, `feedback_no_regressions`).
3. Porta upper-vs-lower = `project_late_entry_door_upper_then_lower` (estado da chave, não config).
4. Guard anti-auto-confronto por UID sempre; dedup dos 2 stores (standby+waitlist).

### Passos sugeridos
- Reescrever o ramo DUPLA de `integrateLateEntries` (draw-core `:520` + os vendorados) pra a nova
  estrutura: detectar bye→preencher; senão recompor N+1 preservando decididos.
- Provar com teste que REPRODUZ a falha ANTES de tocar (guardrail late; `feedback_no_blind_fixes`).
  Jogar a chave inteira até campeão (`feedback_play_through_before_deploy`).
- Reconciliar as 9 suítes vermelhas SÓ quando o código estiver certo (sem test-theater):
  fresh-árvore-mínima → reescrever pro play-in; tardia → passa quando a máquina fechar.

### Comandos
```
node tests/_repechage-invariant.js                 # guardrail (fresh=0; alvo: late=0)
node tests/_playin_proto.js                        # protótipo do algoritmo (ALL CLEAN)
node functions-autodraw/copy-vendor.js             # sincronizar vendor após editar js/views
cd functions-autodraw && node test-draw.js         # sanity CF
node tests/run-unit.js                             # gate (alvo: 191/191)
```
