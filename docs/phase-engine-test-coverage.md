# Motor de fases — superfície de config + rastreador de cobertura de testes

> Base da suíte combinatória da Fase 2 (roadmap 1.0). Mapeado linha-a-linha do código em 27/jun/2026.
> Filosofia: o espaço de configs é grande demais pra escrever a saída esperada de cada combinação.
> Testamos por **invariantes** sobre uma **matriz gerada por código** (ver `tests/phase-transition-matrix.test.js`).
> **Honestidade:** "verde" aqui = a invariante valeu pras combinações geradas, NÃO "tudo coberto".
> Este doc rastreia exatamente o que falta.

## Dimensões de uma fase (o que o motor consome)

| Dimensão | Valores | Onde (phases-engine.js) |
|---|---|---|
| `formatCode` | `elim_simples`, `elim_dupla`, `grupos_mata`, `liga` | classifyPhaseFormat ~592 |
| modo Rei/Rainha | `reiRainha:true` \| `drawMode:'rei_rainha'` (ortogonal ao formato) | isMonarchDraw ~588 |
| `fixedPairs` | true \| false | 417, 533, 681 |
| `pairingStrategy` | `top` (performance), `balanced` (equilíbrio), `draw_among` (sorteio), `seed` (cabeças) | 418, 534 |
| `source.scope` | `per_group` \| `overall` | 419, 535 |
| `source.rankingBasis` | `individual` \| `team` (keep duplas) | 420, 536 |
| `source.mapping[]` | `{dest, rankFrom, rankTo}` — dest ∈ upper/lower/main/line3/line4 | 391, 416 |
| `bracketResolution` | `bye`, `exclusion`, `standby`, `playin` (repescagem) | 442 |
| `grandFinal` | true \| false | 434, 461 |
| `thirdPlace` | true \| false | 435, 462 |
| `gruposCount` | inteiro | tournaments-draw.js |
| `rounds` / `ligaTurnos` | inteiro | phase-generators.js:61 |
| `ligaCadence` | `all-at-once` \| `incremental` | 699, 1060 |
| `tiebreakers[]` | confronto_direto, saldo_pontos/sets/games, vitorias, buchholz, sonneborn_berger, antiguidade, juventude, sorteio… | 801-822 |
| nº participantes | par/ímpar/potência-de-2/resto | genTierBracket 229-262 |

## Matriz de transição formato→formato (suportadas)

Os formatos são **4**: Eliminatória Simples · Dupla Eliminatória · Grupos · Pontos Corridos (Liga). **Rei/Rainha NÃO é formato** — é **modo de sorteio** (eixo ortogonal: normal | Rei/Rainha), aplicável dentro de Grupos/Pontos Corridos; e há a **cadência** (na Liga: incremental | todos-de-uma-vez), também ortogonal. `classifyPhaseFormat` devolve só `elim`/`groups`/`league`; `isMonarchDraw` é booleano à parte. **Eliminatória é TERMINAL** (dono 28-jun): encerra o torneio (campeão + classificação final) → NENHUMA fase vem depois. Só **Grupos** e **Pontos Corridos** podem ser ORIGEM de uma próxima fase. (Uma Eliminatória tem 1, 2 ou 4 LINHAS — com 2/4 elas convergem numa grande final; é 1 fase, não várias. Nomes das linhas são ARBITRÁRIOS; "Ouro/Prata" é só exemplo de nome, NÃO regra.) O construtor deve bloquear fase após elim. Transição: Fase0(inscrição)→qualquer formato; Fase N(Grupos/Pontos Corridos)→N+1, cada fase com seu modo de sorteio + cadência (feed-forward via `bracketPhaseGroups`). Caso especial: liga **incremental** grava jogos em `t.phaseRounds[idx]`, não em `t.matches`.

## Funções do ciclo de vida (assinaturas)

- `materializeNextPhase(t, computeStandings, idPrefix)` → gera a próxima fase (1033)
- `buildEntrantsByDest(prevGroups, mapping, fixedPairs, computeStandings, pairingStrategy, opts)` → CENTRAL da transição (111)
- `bracketPhaseGroups(t, phaseIdx)` → feed-forward: resultado da fase N vira "grupos" pra N+1 (924)
- `buildPhase{Brackets,GroupStage,MonarchStage,LeagueStage}` → gera cada formato (413/529/609/677)
- `_groupTeamStandings` (749) / `_monarchStandings` (724) → classificação dupla vs individual
- `phaseComplete(t)` (845), `_maybeFinishMultiPhase` (bracket-logic), `resolveRepechage` (1188)

## ✅/⬜ Rastreador de cobertura

| Área | Status | Onde |
|---|---|---|
| Avanço de vencedor / BYE / campeão (eliminatória) | ✅ | tests/bracket-logic.test.js |
| Transição: scope × fixedPairs × pairing(top/balanced/draw) × nGrupos × tam — invariantes | ✅ 48 combos | tests/phase-transition-matrix.test.js |
| Ordem de pareamento top=1+2 / balanced=1+último | ✅ | idem (I5) |
| Degeneração overall+2linhas+2grupos→per_group | ✅ | idem |
| keep de duplas (rankingBasis=team / nome "X/Y") | ✅ | phases-engine.test.js 13-15 |
| Pontos Corridos com SORTEIO Rei/Rainha (incremental) → standings individual (8) | ✅ (bug achado+corrigido) | phase-brick4 + diag |
| Confra completo (fase 1 = Pontos Corridos c/ sorteio Rei/Rainha → fase 2 = Dupla Elim de 2 linhas, nomes arbitrários) | ✅ cenário único | phases-engine.test.js |
| **Adversárias**: ímpar+dupla, empate de classificação [2,2,1,1], 2 jogadores, grupos desiguais (4+3), mapeamento fora de faixa — conservação/sem-duplicata | ✅ | tests/phase-adversarial.test.js A-E |
| Avanço manual recusa jogo sem resultado (neg) + avança completo (pos) | ✅ | tests/phase-adversarial.test.js F |
| **pairingStrategy `seed`** (cabeças de chave): N melhores 1-por-linha no topo, resto sorteado — indivíduo + dupla fixa + linha única, conservação | ✅ 15 asserts | tests/seed-pairing.test.js |
| **bracketResolution** bye/exclusion/standby/playin × contagens ímpar/não-pot-2 (5,6,7,8) — ninguém some, sem duplicata, top-K correto, standby soma | ✅ 80 asserts | tests/phase-lifecycle.test.js |
| **Repescagem 'playin' — MECÂNICA** (`_resolveRepechage`): joga a R1 (round 0) → melhor perdedor por saldo entra direto (n=6) ou enfrenta o satout no repGame (n=7); gate "R1 não fechou" + idempotência | ✅ 12 asserts | tests/repechage.test.js |
| **grandFinal × nº de linhas (1/2/4)** + 3º SEMPRE on: 1 linha=sem convergência+3º por-linha · 2 linhas=GF(campeão×campeão)+3º na convergência · 4 linhas=2 semis+final+3º com pareamento top/balanced · GF off=linhas independentes+3º por-linha | ✅ 23 asserts | tests/grandfinal-lines.test.js |
| **Materialização real da próxima fase** Grupos→Elim (gera a chave, conservação por modo) | ✅ | tests/phase-lifecycle.test.js |
| Ciclo de vida — DESTINOS de formato: Grupos→Grupos · Grupos→Pontos Corridos (liga estática) · Grupos→Rei/Rainha (modo de sorteio) · Rei/Rainha(origem)→Elim — materialização real + conservação | ✅ 34 asserts | tests/phase-lifecycle-formats.test.js |
| **Encadeamento cur>0** (feed-forward via bracketPhaseGroups): torneio de 3 fases, fase intermediária jogada → materializa a seguinte. Grupos→Grupos→Elim (todos / TOP-2 por grupo) · Grupos→Pontos Corridos→Elim (liga vira 1 grupo geral) — conservação + qualificação parcial | ✅ 14 asserts | tests/phase-chaining.test.js |
| Ciclo de vida: Eliminatória→\* (TERMINAL, não tem próxima fase — N/A) | ✅ N/A | — |
| **tiebreakers** (confronto_direto · saldo_pontos · saldo_sets · saldo_games · buchholz · sonneborn_berger · antiguidade · juventude · fallback lista-vazia), cada critério isolado | ✅ 32 asserts | tests/standings-tiebreakers.test.js |
| **GSM** (`scoring.type='sets'`): acumulação de sets/games (_accumulateGSM) + saldo_sets/saldo_games como desempate | ✅ | tests/standings-tiebreakers.test.js |
| **Resolução de pontuação** (`_resolveLiveScoring`, anti "games direto"): sem config→default em sets do esporte · merge com override do organizador (incl. falsy) · 'simple' explícito respeitado · esporte desconhecido | ✅ 11 asserts | tests/live-scoring-resolve.test.js |
| **classificação por categoria** (`_computeStandings(t, cat)` isola jogadores+jogos da categoria) | ✅ | tests/standings-tiebreakers.test.js |
| **categorias na TRANSIÇÃO** (`generatePhase` split de Eliminatória por categoria: N chaves independentes, sem pareamento cruzado, seeding 1×N por categoria, categorias desiguais, 3º por categoria, sem-categoria=1 chave) | ✅ 17 asserts | tests/category-transition.test.js |
| **dupla-eliminatória** (4/8): topologia upper+lower+grande final, loser-drop (upper→lower via loserMatchId, upper final→lower final), ciclo de vida completo → 1 campeão + ZERO órfãos | ✅ 16 asserts | tests/double-elim.test.js |
| **Gate de aprovação de resultado** (`_resultNeedsApproval`): resultEntry (players/all/array/organizer) × papel (participante/org/fora) × adversário (uid/TBD/BYE/informal) × disputa | ✅ 13 asserts | tests/result-approval-gate.test.js |
| **Agendamento de sorteio — MATH** (`_owedDrawSlotMs` núcleo puro + `_nextOwedDrawMs` gates): slot devido fica <= now enquanto pendente, dedup por lastFired/lastAutoDrawAt; intervalo<1 = sorteio único; só Liga/Ranking auto (não-manual, com data, não-encerrado); cap por temporada (endDate) | ✅ 22 asserts | tests/draw-schedule.test.js |
| Orquestração 4 fases do resultado (notify/contest/approve) — acoplada a AppStore/Firestore/DOM | ⬜ FALTA (camada 2 / Playwright) | — |
| **E2E logado** (DOM/Firestore/render — onde moram os bugs de "abriu e não funcionou") | ⬜ FALTA (precisa emulador) | — |

## Camada 2 (Playwright — clique→valor) — `npm run test:e2e`
A camada 1 (headless) prova que o MOTOR consome `t.format`/`t.drawMode`/… corretamente; a camada 2 prova o ELO do DOM: o clique no botão real aterrissa o valor no sink certo. Roda contra `baseURL` (PROD por default, ou `SCOREPLACE_URL=https://scoreplace-staging.web.app`). Read-only (abre o modal, clica toggles, lê o sink — NUNCA salva).

| Variável | Status | Onde |
|---|---|---|
| **Formato** (botões → `#select-formato`): grupos→`grupos_mata` · pontos→`liga` · elim→`elim_simples` · toggle dupla→`elim_dupla`; 1 ativo por vez | ✅ | tests/e2e/create-tournament-form.spec.js |
| **Modo de sorteio** (botões → `#draw-mode`): sorteio/rei_rainha; classe ativa | ✅ | tests/e2e/create-tournament-form.spec.js |
| **Categorias de gênero** (pills → `#tourn-gender-categories` CSV): toggle on/off; misto_aleatorio ⟂ misto_obrigatorio | ✅ | tests/e2e/create-tournament-categories.spec.js |
| **Categorias de habilidade** (pills A/B/C/D/FUN → `#tourn-skill-categories` CSV em ordem canônica) | ✅ | tests/e2e/create-tournament-categories.spec.js |
| **GSM config** (modal → campos ocultos `#gsm-*` que o save lê): setsToWin · gamesPerSet · tiebreakEnabled · type='sets' no Aplicar | ✅ | tests/e2e/create-tournament-gsm.spec.js |
| Modo de inscrição (`#select-inscricao`) — UI oculta desde v2.7.83 (derivado do tipo de jogo), não testável por clique | ⚪ N/A | — |
| GSM advantage / super-tiebreak (clique→valor) — advantage resetado pelo form principal no Aplicar; super-TB oculto condicional | ⚪ N/A (ver memória) | — |
| Agendamento de sorteio (auto/manual/data/intervalo), categorias idade/custom (clique→valor) | ⬜ FALTA | — |

## Regras de produto que guiam os testes (não violar)
- **Sem empate EM JOGO** em nenhuma modalidade (até grupos) — todo jogo tem vencedor. Empate de CLASSIFICAÇÃO (mesmas vitórias) é real e resolvido por tiebreakers. (memória `project_no_draws_rule`)
- **Bloqueio por jogo pendente é DEPENDENTE DO FORMATO** (memória `project_autodraw_phase_pending_game`): Eliminatória = todo pendente é decisivo (bloqueia sempre). Pontos Corridos/Grupos/Rei-Rainha (avanço por classificação) = um pendente só bloqueia se puder MUDAR a classificação que importa pro avanço; pendentes irrelevantes (não mudam quem avança nem o seeding) NÃO precisam bloquear. Relevância via análise de "clinch" (sem empate → 2 desfechos/jogo; testar combinações). Decidido: pendente que muda QUEM avança = sempre resolver; muda SÓ seeding = escolha do org por jogo; não muda nada = não bloqueia. FALTA (pós-freeze) a UI pro organizador resolver os decisivos (W.O. / lançar / liberar com prazo) — hoje só bloqueia com alerta.

## Próximos incrementos (ordem sugerida)
0. **Resolução de jogos pendentes (com análise de clinch)** — (a) classificar cada pendente da fase por impacto: irrelevante / muda-seeding / decisivo (Eliminatória: todos decisivos; Pontos Corridos: clinch sobre os 2 desfechos possíveis). (b) Se só restam irrelevantes → deixar avançar. (c) Pros decisivos, UI pro organizador decidir por jogo: W.O. (lado 1/2/ambos) · lançar resultado agora · liberar pros jogadores com prazo. Hoje só bloqueia com alerta. (pós-freeze)
1. Estender a matriz pro **ciclo de vida completo** por par de formatos (materialize→play→feed-forward), com as mesmas invariantes de conservação a cada salto de fase.
2. Matriz de **resolução numérica** (bye/exclusion/standby/playin) × {ímpar, não-pot-2, resto}.
3. `seed`, grandFinal/thirdPlace × nº de linhas.
4. tiebreakers (determinismo da ordenação por critério).
5. E2E logado com emulador Firebase (camada DOM/Firestore — fora do alcance do headless).
