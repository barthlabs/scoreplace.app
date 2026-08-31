# Auditoria arquitetural — mapa de levas

> Registro operacional criado em 30/ago/2026. Ele organiza o backlog já conhecido;
> **não autoriza nenhuma implementação**. Cada leva só entra em execução após escolha
> explícita do arquiteto, com causa-raiz, invariantes, tentativas anteriores e gates
> relidos antes de editar.

## Medição de referência

- **17 levas** no mapa: 3 concluídas (L0, L1, L15), 1 **bloqueada externamente** (L2) e 13 ainda não iniciadas.
- Por contagem de levas (não por esforço): **17,6% concluído** e **82,4% restante**.
- A porcentagem não é prazo: `Vite`, Capacitor e migrações de identidade são maiores
  que uma correção de Rules, por exemplo.

| Leva | Tema do backlog | Situação em 30/ago | Gate antes de executar |
|---|---|---|---|
| L0 | jogos divididos: fonte `matches` → projeção `results` | **Concluída em produção (2.1.60).** 42 torneios / 183 jogos auditados; 7 reparos; 0 ausentes e 0 divergentes. ✅ **Reconferido em 31/ago/2026, pelo Codex**, depois da R0.4.2 pôr deadline de parede no transporte: **42 torneios · 9 com jogos canônicos · 183 jogos canônicos · 0 results ausentes · 0 results divergentes.** Os contadores foram capturados pelo verificador, não por quem implementou — que é o que faltava desde 30/ago, quando a execução ficava viva por mais de 3 minutos e era encerrada sem imprimir nada. | Conferidor read-only permanece no runner. |
| L1 | `/mail` client-writable | **Concluída em produção (2.1.77).** `/mail` é **server-only**: `allow read, write: if false`. O problema corrigido era um **relay de cliente autenticado** — quem estivesse logado escolhia destinatário, assunto e HTML, e a extensão entregava do remetente do produto. Fechado em quatro passos, nesta ordem: **L1.3a** (2.1.69) convite avulso → `sendTournamentInvite`; **L1.1** (2.1.75) dupla e co-organização → `sendPairInviteEmail`/`sendCoHostInviteEmail`, e `queueEmail` deixou de existir; **L1.1.1** (2.1.76) o e-mail só é pedido depois de o convite **persistir**; **L1.2** (2.1.77) a Rule fecha. Comportamento provado contra o emulador em `tests/rules-mail-server-only.test.js` — 24 asserções, com controle na regra antiga. ⚠️ A linha anterior desta tabela dizia que `js/views/auth.js` escrevia em `/mail`: era verdade até a 2.1.65 e ficou **histórica**; a varredura de `js/` (101 arquivos) não encontra writer nenhum. | Extensão `firestore-send-email` preservada — as Functions usam Admin SDK e ignoram as rules. |
| L2 | fila de notificações/e-mail | **BLOQUEADA EXTERNAMENTE.** Inventário concluído (L2.P0 e L2.P1, ambas read-only, em 2.1.77). **Problema:** `notif_email_queue` aceita `create` de qualquer autenticado, com destinatário, mensagem, CTA e nível vindos do payload do cliente. **O bloqueio não é técnico do servidor — é do parque instalado:** `capacitor.config.json` declara `webDir: "www"` e um `server` **sem `server.url`**, então o app das lojas executa o **bundle local**, não o Hosting; o bundle publicado (`android/app/src/main/assets/public/js/store.js`) está em **2.1.28** e o `firebase-db.js` dele ainda escreve direto em `notif_email_queue`. Fechar a Rule hoje cortaria o e-mail de notificação de todo app nativo instalado, que **não tem auto-update**. | ⛔ **Invariante: não fechar a Rule** até existir versão Android/iOS compatível, aprovada nas lojas, com política de **versão mínima/cutover autorizada** pelo dono. ⛔ **Decisão pendente preservada: NÃO haverá Function genérica** que aceite e-mail, destinatário, HTML, URL, mensagem ou tipo arbitrário do cliente — a migração é por **capability específica de intenção** ou por **evento canônico server-side**, e o único texto livre que permanece é o de `sendOrgCommunication`, que já autoriza por organizador. ⏳ **Hipótese ainda pendente:** a adoção efetiva da versão nativa futura — publicar não é o mesmo que estar instalado, e o cutover depende de medida de adoção, não de data. ⛔ O cutover **não foi executado** e nenhum build nativo foi preparado ou publicado nesta leva. |
| L3 | `casualMatches` | **Aberta. Inventário RETIFICADO (L3.P0/P0.1), schema de produção MEDIDO (L3.P1) e contrato de autoridade + gates REGISTRADOS (L3.P2) — tudo read-only. ⛔ A decisão de autoridade continua do dono e NÃO foi tomada.** `firestore.rules:763` é `allow read: if true; allow write: if request.auth != null` — leitura ABERTA (para o join anônimo por QR/código) e escrita por **qualquer autenticado, em qualquer documento**, com o comentário da própria regra assumindo: *"Left permissive for authenticated users"*. Coleção **plana**, sem subcoleção. ⛔ A L3.P0 declarou aqui *"10 portas no cliente, nenhuma no servidor que escreva"* — **as duas metades eram falsas** e a L3.P0.1 as corrigiu: são **30 writers** — 6 portas em `js/firebase-db.js`, **20 chamadas diretas** em `js/views/bracket-ui.js`, **3 escritas server-side** (`deleteAccount`, `mergePhoneAccount` e o sweep genérico de uid) e 1 deleção agendada. | Definir autoridade por sessão/participante e concorrência do placar ao vivo. **Não decidido nesta etapa.** |
| L4 | profile/privacy + e-mail secundário | **Aberta.** Há caminhos históricos de perfil, verificação e identidade que exigem uma fonte de verdade explícita. | Inventário de campos, PII, leitores e writers; manter recuperação de conta. |
| L5 | amizade e autorização friends-only | **Preparada, bloqueada externamente.** Migração está `not_started`; dry-run leu 262 perfis. | Gate nativo (clientes mínimos) e aprovação humana formal do cutover. |
| L6 | writers excessivamente amplos de `tournaments` | **Aberta.** | Inventário dos writers e invariantes de concorrência antes de restringir qualquer um. |
| L7 | `saveTournament` / `AppStore` e caminhos paralelos | **Aberta.** | Escolher porta canônica de mutação, com testes de save atrasado e rollback. |
| L8 | representações múltiplas de match + custo Firestore | **Parcial.** `matches` é fonte e `results` é projeção para jogos divididos; modelo completo ainda não convergiu. | Medir reads/writes por tela e preservar `replay`/autorizações. |
| L9 | código morto, fallbacks e aliases | **Aberta.** | Prova de ausência de chamadores antes de remover compatibilidade. |
| L10 | ES Modules, source → dist e Vite | **Proposta futura.** Nenhuma migração iniciada. | Definir fronteiras de módulos e build reproduzível antes de introduzir bundler. |
| L11 | TypeScript progressivo + Firebase compat → modular | **Proposta futura.** | Plano incremental por fronteira, sem reescrita geral. |
| L12 | PWA, service worker e cache | **Parcial/hardening contínuo.** Gates de versão/cache existem; não é encerrado por uma release. | Teste de atualização e navegação offline em aparelho real. |
| L13 | Capacitor/nativo | **Aberta.** | Decidir política de versões mínimas/atualização e validar iOS/Android reais. |
| L14 | identidade, merges, retries e concorrência | **Aberta.** | Matriz de idempotência e provas de posse antes de alterar merge/login. |
| L15 | testes não descobertos automaticamente | **Concluída (L15.P0/P1/P2).** Medido em 8341efe2: **603 arquivos de teste no disco, 581 na lista à mão de `tests/run-unit.js` e 15 que NENHUM comando alcançava** — entre eles `functions-autodraw/test-uid-identity.js`, **vermelho 11/22 sem ninguém ver**. Os 5 vermelhos foram triados e reparados sem afrouxar invariante nenhum (ver abaixo), e `scripts/check-test-catalog.js` passou a exigir que todo arquivo de teste tenha um comando conhecido. | Gate no `npm test`; suítes de emulador serializadas por grupo. |
| L16 | observabilidade e hardening | **Aberta.** | Métricas, alertas e runbooks definidos por risco, sem registrar PII. |

**L2 — o que o inventário achou, para quando o bloqueio sair.** `notif_email_queue` tem
**1 writer cliente** (`js/firebase-db.js:3018` `queueNotifEmail`, alcançado só por
`_dispatchChannels` em `js/views/tournaments-organizer.js:500`) e **4 writers de servidor**
legítimos que precisam entrar na modelagem de deduplicação: `_avisarDuplicataSuspeita`
(`functions/index.js:2672`), `sendOrgCommunication` (`:3735`), `runTournamentReminders`
(`functions/reminder-run.js:68`) e `_queueDrawEmail` (`functions-autodraw/index.js:155`),
mais o script operacional `scripts/resend-draw-emails.js:163`. A L2.P1 mapeou **77 origens
de intenção** convergindo no writer cliente, em cinco classes: ação de organizador, evento
canônico de jogo/chave, usuário→usuário, social fora de torneio e sistema/conta. ⚠️ Achado
que condiciona o desenho: `firestore.rules:660` deixa `users/{uid}/notifications` com
`allow create: if request.auth != null` — um gatilho que escutasse a notificação **in-app**
para decidir o e-mail herdaria essa fraqueza (o cliente forjaria o evento e, por tabela, o
e-mail); um gatilho sobre `tournaments/{id}` ou sobre as coleções de jogo, não.
⚠️ Seis tipos disparados não têm entrada em `js/notification-catalog.js` e caem no default
`level: 'all'`: `account_update`, `swiss_to_elimination`, `wo-claim`, `match-disputed`,
`schedule` e `info`. Produção no instante da medição: a fila estava **vazia** (0 total,
0 vencidos), com duas leituras-controle provando que a consulta funcionava.

**L3 — o que o inventário achou (L3.P0, read-only).**

*Decisão adotada (registro, não mudança):* a leitura de `casualMatches` é **aberta de
propósito** — a regra existe para o join anônimo por QR/código funcionar, e o documento não
carrega PII além de nome e foto que já são públicos. O que está indefinido é a **escrita**.

*Problema aberto — autoridade.* `allow write: if request.auth != null` cobre `create`,
`update` e `delete` em qualquer documento. Na prática: qualquer pessoa logada pode apagar a
sala de outra (`cancelCasualMatch`, `js/firebase-db.js:3305`, é um `.delete()` cru), reescrever
`liveState` e `result` de uma partida em que não está (`updateCasualMatch`, `:3204`, é um
`.update()` cru, sem transação), ou criar documento declarando `createdBy` de terceiro
(`saveCasualMatch`, `:3107`, é um `.add()` do payload cru). ⚠️ O comentário da regra explica
por que ficou assim: a transação de claim-slot ADICIONA o uid a `playerUids`, então
`update` não podia ser escopado a "já está em playerUids" sem quebrar o join.

*Concorrência — o que já é transação e o que não é.* `claimCasualSlot` (:3214),
`joinCasualMatch` (:3247) e `leaveCasualMatch` (:3328) rodam em `runTransaction`; `save`,
`update` e `cancel` **não**. O placar ao vivo é `updateCasualMatch({liveState, lastActivityAt})`
com debounce de 300ms (`js/views/bracket-ui.js:8931-8945`) — **last-write-wins**, sem trava:
dois clientes marcando ponto ao mesmo tempo sobrescrevem um ao outro, e o `_isRemoteUpdate`
existe para evitar eco, não para arbitrar. A deleção tem três caminhos independentes:
`cancelCasualMatch` (recusa apagar `status:'finished'`), o auto-dissolve dentro de
`leaveCasualMatch` (:3369, apaga quando some o último slot ocupado) e a limpeza agendada
`cleanupOldCasualMatches` (`functions/index.js:1352`: 30 dias para `finished`, 2h para
`active` inativa, 12h para o resto — **sem timestamp = apaga**).

*⚠️ Evidência nova e objetiva: três campos-fantasma comandam as estatísticas de partida
casual.* `hostUid`, `guestUid`, `hostColor` e `guestColor` são **lidos e nunca escritos** —
`grep` no repositório inteiro devolve só leituras. Quem lê:
`js/trophies.js:290,308` (as duas queries do cliente),
`functions/index.js:4918,4930` (`_computeBackfillStats`),
`js/trophy-catalog.js:800-805` e `functions/index.js:4874-4877` (`_isMatchQualified` /
`_isCasualMatchQualified`, que exigem os dois uids não-vazios e distintos). O schema real
(`docs/schemas.md:244`) tem `createdBy`, `participants[]`, `playerUids[]` e `result.winner`.
Consequência mecânica: as queries por `hostUid`/`guestUid` voltam **vazias**, o filtro
anti-fraude devolve **false para todo documento**, e `myColor` compara com um campo
inexistente — ou seja, `casualMatchesPlayed`, `casualMatchesWon` e `casualSportsPlayed`
tendem a **zero por construção**, e os troféus de partida casual nunca disparam.
⚠️ Não há caminho alternativo por `playerUids` nessas contagens; os índices declarados em
`firestore.indexes.json` cobrem `createdBy+status` e `playerUids+status`, **não**
`hostUid+status` — o que corrobora que essas duas queries nunca serviram.
⛔ **É a MESMA classe de defeito já paga uma vez neste projeto e documentada em
`functions/merge-collections-core.js:27`**: *"a consulta de `casualMatches` mirava
`creatorUid`, campo que nem existe"*. Aquela foi corrigida; estas quatro sobreviveram.

*Hipótese ainda pendente:* ⭐ **RESOLVIDA na L3.P1 — CONFIRMADA** (medição de 31/ago/2026, mais abaixo); o texto original fica como estava. Que os troféus casuais estejam de fato zerados em produção. Não
foi medido — a L3.P0 é read-only e não consultou o banco. A verificação seria um agregado
sobre `users` (quantos perfis têm `casualMatchesPlayed > 0`), sem PII.

*Proposta futura, NÃO decidida:* separar as duas questões. (a) Os campos-fantasma são um
defeito de **leitura**, independente de Rules, e cabem numa leva pequena e testável; (b) a
autoridade de escrita depende de decidir quem manda em cada operação — criar, entrar, sair,
marcar ponto, encerrar e apagar têm atores diferentes —, e a regra hoje não distingue nenhum
deles. ⛔ Nenhuma mudança de Rules é proposta aqui.

*Cobertura de teste.* 4 suítes verdes travam invariantes reais do produto —
`casual-mesma-pessoa-um-slot-so`, `dupla-casual-nao-perde-jogador`,
`formacao-de-duplas-casual` e `usuario-sempre-time-azul` —, mais
`tiebreak-uma-forma-de-gravar`, `replay-e-o-placar-ao-vivo` e
`functions/test-merge-collections-core.js` no `npm test`. ⚠️ **Zero cobertura de Rules**
(`tests/rules-*.test.js` não menciona a coleção) e **zero cobertura dos campos-fantasma** —
nenhum teste confronta o que as queries pedem com o que os writers gravam.

*Compatibilidade nativa.* O bundle embarcado (`android/app/src/main/assets/public/js/`,
`SCOREPLACE_VERSION = 2.1.28`) tem as mesmas 10 portas de `casualMatches`. Vale aqui o mesmo
bloqueio registrado na L2: fechar a escrita quebraria o app das lojas, que executa o bundle
local e não tem auto-update.

**L3.P0.1 — o inventário COMPLETO dos writers (read-only; RETIFICA a L3.P0).**

⛔ **A frase da L3.P0 estava errada e fica retificada aqui.** Ela dizia: *"10 portas no
cliente (`js/firebase-db.js:3107-3384`), nenhuma no servidor que escreva — as Functions só
LEEM e APAGAM"*. As duas metades são falsas. Existem **20 writers diretos** em
`js/views/bracket-ui.js` que não passam por `firebase-db.js`, e **três** Functions de
produção **escrevem** em `casualMatches` (uma delas sobrescrevendo o documento inteiro).

*Por que o método da P0 não achou — e é isto que importa mais que a contagem.* A P0 casou
`collection('casualMatches')` e leu o texto que vinha na sequência. Esse método perde três
classes inteiras de writer, e as três existem no repositório:

1. **Referência guardada em variável.** `const cs = await db.collection("casualMatches")
   .where(...).get()` e, três linhas depois, `d.ref.set(swept)`. O nome da coleção e o verbo
   de escrita nunca aparecem juntos. É exatamente o writer do `deleteAccount`.
2. **Cadeia quebrada entre linhas.** `...doc(_casualDocId)` numa linha e `.update({...})` na
   seguinte. Onze dos vinte writers de `bracket-ui.js` têm essa forma.
3. **Coleção descoberta em tempo de execução.** `_sweepAllCollectionsByUid`
   (`functions/index.js:667`) chama `db.listCollections()` e escreve em **toda** coleção que
   não esteja na lista de exclusão de `functions/merge-collections-core.js`. `casualMatches`
   **não está nessa lista** — e o `_executeMerge` até conta o resultado
   (`functions/index.js:595`: `sweptFixed.casualMatches`). ⚠️ **Nenhuma busca textual pelo
   nome da coleção acharia este writer, porque o nome não aparece no código desse caminho.**

*Método desta etapa.* (a) varredura estrutural por `collection('casualMatches')` com janela
de operações; (b) segunda varredura que isola a vizinhança de cada menção e lista **todo**
verbo de escrita com o alvo que o recebe, para pegar refs em variável; (c) censo de
`casualMatches` em todo arquivo `.js/.html/.json/.rules/.md` do repositório (24 arquivos), e
busca pelo nome da coleção **guardado em variável** — não há nenhuma, o literal é sempre
inline, o que fecha a classe 3 pelo outro lado (só o sweep genérico alcança a coleção sem
nomeá-la). Todo número abaixo saiu dessas três passagens.

**(A) Portas centralizadas — `js/firebase-db.js`: 9 funções, 10 chamadas, 6 escrevem.**

| Linha | Função | Operação | Campos gravados |
|---|---|---|---|
| 3111 | `saveCasualMatch` | `.add(clean)` | payload cru do chamador (documento inteiro) |
| 3122 | `loadCasualMatch` | `.where('roomCode').get()` | — (leitura) |
| 3153, 3172 | `loadRecentCasualMatchesForUser` | 2× `.where().get()` | — (leitura, por `createdBy` e por `playerUids`) |
| 3208 | `updateCasualMatch` | `.update(clean)` | **qualquer campo**, cru, **sem transação** |
| 3217 | `claimCasualSlot` | `runTransaction` → `transaction.update` (`:3236`) | `players`, `playerUids` |
| 3250 | `joinCasualMatch` | `runTransaction` → `transaction.update` (`:3288`, `:3294`) | `participants`, `playerUids` |
| 3313 | `cancelCasualMatch` | `ref.delete()` (`:3319`) | — (apaga o documento) |
| 3331 | `leaveCasualMatch` | `runTransaction` → `transaction.update` (`:3372`) **ou** `transaction.delete` (`:3369`) | `participants`, `playerUids`, `players`; apaga se nenhum slot ficar ocupado |
| 3384 | `loadUserCasualMatches` | `.where().get()` | — (leitura) |

**(B) Writers DIRETOS em `js/views/bracket-ui.js` — 20, nenhum passa pelas portas acima.**
19 `update` + 1 `add`. Todos são chamadas cruas de SDK a partir da UI.

| Linha | Gatilho na tela | Operação | Campos gravados |
|---|---|---|---|
| 204 | aceitar/recusar sugestão de vínculo (notificação) | `docRef.update` | `pendingLinkRequests`, `players`, `playerUids`, `participants` |
| 8718 | sugerir vínculo de um amigo a um slot | `docRef.update` | `pendingLinkRequests` |
| 8859 | fechar a sala pelo ✕ (host) | `.update` | `hostClosed: true`, `closePending: FieldValue.delete()` |
| 9028 | reagir ao consenso de encerramento (ouvinte) | `.update` | `closePending: null` |
| 9864 | fim de rodada do Rei/Rainha | **`.add(payload)`** | documento NOVO: `createdBy`, `createdByName`, `createdAt`, `sport`, `isDoubles`, `status:'finished'`, `result{winner,summary,p1Score,p2Score,sets}`, `players`, `playerUids`, `roomCode`, `reiRainhaRound`, `reiRainhaSessionId` |
| 9943 | avançar rodada do Rei/Rainha | `.update` | `status:'active'`, `liveState` |
| 9971 | alternar embaralhar/misto/Rei-Rainha | `.update` | `statsConfig{autoShuffle,mixedDoubles,reiRainha,_ts}` |
| 10375 | "Recomeçar" a partida | `.update` | `status:'active'`, `liveState` |
| 10506 | desfazer dupla → volta ao setup | `.update` | `setupAt` (**ISO string**) |
| 10706 | "Jogar novamente" → aponta a sala velha pra nova | `.update` | `nextRoomCode` |
| 10774 | botão "pronto pra recomeçar" | `.update` | `restartReady: arrayUnion(meuUid)` |
| 11308 | ✕ sem diálogo / auto-close | `.update` | `hostClosed: true` |
| 11447 | sair com a partida completa | `.update` | `hostClosed: true` |
| 11452 | sair no meio do jogo | `.update` | `status:'setup'`, `setupAt` (**epoch ms**) |
| 11513 | recusar/cancelar o encerramento | `.update` | `closePending: FieldValue.delete()` |
| 11529 | confirmar o encerramento | `.update` | `closePending.confirmedBy: arrayUnion(meuUid)` (dot-path) |
| 11554 | quórum de encerramento atingido | `.update` | `closePending: FieldValue.delete()`, `setupAt`, `status:'setup'` |
| 14504 | botão "Estou pronto" no setup | `.update` | `readyPlayers: arrayUnion(meuUid)` |
| 14569 | publicar o próprio gênero | `.update` | `participantGenders.<meuUid>` (dot-path) |
| 15088 | reabrir setup em sala nova | `.update` | `nextRoomCode` |

⚠️ Além destes, o placar ao vivo escreve pela porta `updateCasualMatch`: `_syncLiveState`
(`js/views/bracket-ui.js:8931-8945`) grava `liveState` + `lastActivityAt` com debounce de
300 ms. ⚠️ `setupAt` é gravado em **dois tipos diferentes** — ISO string em `:10506`, epoch
em `:11452` e `:11554`. Não quebra hoje porque os leitores (`:8982`, `:9133`) só comparam o
valor com o anterior para detectar mudança; nunca o interpretam como data. Fica registrado
como fato, não como defeito ativo.

**(C) Servidor — a metade que a L3.P0 declarou inexistente. Três writers e um deletador.**

| Function | Linha da escrita | Operação | O que grava | Como alcança a coleção |
|---|---|---|---|---|
| `deleteAccount` | `functions/index.js:5626` | **`d.ref.set(swept)` — sobrescreve o documento INTEIRO, sem `merge`** | resultado de `_purgeUidEverywhere(doc, uid, false)` em cada doc com o uid em `playerUids` | query em `:5623`, ref guardada em variável |
| `mergePhoneAccount` | `functions/index.js:6587` | `cbatch.update(doc.ref, cu)` | `creatorUid`, `playerUids`, `players[].uid/displayName/name` | varre `.get()` de **toda** a coleção (`:6570`) |
| `_sweepAllCollectionsByUid` (via `_executeMerge`, `:594`) | `functions/index.js:724` | `b.update(doc.ref, payload)` | **qualquer campo** que contenha o uid absorvido, trocado por remapeamento genérico | `db.listCollections()` — **nunca nomeia `casualMatches`** |
| `cleanupOldCasualMatches` | `functions/index.js:1397` | `batch.delete(doc.ref)` | apaga: `finished` > 30 d; `active` inativa > 2 h; resto > 12 h; **sem timestamp = apaga** | `.get()` da coleção inteira (`:1382`) |

Leitores server-side confirmados **sem** escrita: `_computeBackfillStats`
(`:4917`, `:4929`), `_sweepDeletionLeftovers` (`:7185`, só conta), e o segundo `.get()` de
`cleanupOldCasualMatches` (`:1408`, monta o conjunto de salas vivas — o `.add` daquela linha
é `Set.prototype.add`, não Firestore).

**Cobertura dos campos que a leva nomeou.** `hostClosed` → `:8859`, `:11308`, `:11447`.
`closePending` → `:8859`, `:9028`, `:11513`, `:11529`, `:11554`. `setupAt` → `:10506`,
`:11452`, `:11554`. `nextRoomCode` → `:10706`, `:15088`. `readyPlayers` → `:14504`.
`participantGenders` → `:14569`. `pendingLinkRequests` → `:204`, `:8718`. `statsConfig` →
`:9971`. `liveState` → `:9943`, `:10375` e `updateCasualMatch` via `_syncLiveState`.
Snapshots do Rei/Rainha → `:9864` (documento novo por rodada). Recomeço/reabertura →
`:10375`, `:10706`, `:10774`, `:15088`. `status`/`result` → `:9864` (`finished` + `result`),
`:9943` e `:10375` (`active`), `:11452` e `:11554` (`setup`), e `updateCasualMatch`, que
aceita `result` como qualquer outro campo. **Todos os campos nomeados na leva estão
catalogados acima com arquivo, linha e operação.**

**Quem consegue disparar cada writer, hoje.** Os 20 writers de `bracket-ui.js` e as 6 portas
de `firebase-db.js` rodam no cliente sob `allow write: if request.auth != null`: **qualquer
pessoa autenticada**, contra **qualquer documento** da coleção, esteja ou não na sala. Os
quatro caminhos server-side rodam com o Admin SDK — `deleteAccount` e `mergePhoneAccount`
são callables disparados pelo próprio dono da conta; `_sweepAllCollectionsByUid` roda dentro
de uma fusão; `cleanupOldCasualMatches` é `onSchedule`, a cada 30 min, sem ator humano.

**Que proteção local existe, e por que NENHUMA delas substitui uma Rule.** As proteções
encontradas se agrupam em cinco tipos, e o argumento é o mesmo para os cinco: *toda* essa
lógica mora no JavaScript do cliente — que é justamente o que a Rule existiria para
restringir. O servidor avalia a Rule sobre uma requisição da qual só conhece `request.auth`
e o payload; ele não vê qual função do app a montou, nem se alguma foi executada. Uma
requisição forjada pelo SDK Web ou pelo endpoint REST chega idêntica à honesta.

- *Guarda de identidade* — `jaEstou` em `joinCasualMatch` (`:3270`) cruza `playerUids`,
  `participants` e `players` antes de inserir. Impede o **honesto** de entrar duas vezes;
  não impede um terceiro de reescrever `participants` inteiro por fora.
- *Guarda de estado* — `cancelCasualMatch` recusa apagar `status:'finished'` (`:3315`) e
  `leaveCasualMatch` só dissolve se nenhum slot ficar ocupado (`:3369`). São leituras feitas
  **no cliente** sobre um documento que a Rule deixa qualquer autenticado apagar direto.
- *Transação* — `claimCasualSlot`, `joinCasualMatch` e `leaveCasualMatch` usam
  `runTransaction`. Transação resolve **concorrência**, não **autoridade**: serializa dois
  escritores legítimos e não tem opinião sobre quem tinha direito de escrever.
  ⭐ É a mesma lição já assentada no projeto — a trava vale onde mora a verdade, e a verdade
  aqui é a Rule, não o corpo da transação.
- *Escrita escopada ao próprio uid* — `arrayUnion(meuUid)` em `readyPlayers` (`:14504`),
  `restartReady` (`:10774`) e `closePending.confirmedBy` (`:11529`), e o dot-path
  `participantGenders.<meuUid>` (`:14569`). O escopo é escolhido por quem escreve: o uid no
  `arrayUnion` e o segmento do dot-path são dados do payload, não são verificados por
  ninguém. Nada impede marcar o uid alheio como pronto, confirmado ou de outro gênero — e o
  quórum de recomeço e de encerramento é calculado **desses arrays**.
- *Anti-eco e debounce* — `_isRemoteUpdate` e o `setTimeout` de 300 ms em `_syncLiveState`.
  Evitam que o cliente reescreva o que acabou de receber; não arbitram nada. `liveState`
  continua last-write-wins.

⚠️ E os quatro caminhos server-side **não são cobertos por Rule nenhuma**: o Admin SDK as
ignora por construção. Qualquer decisão futura sobre a Rule de `casualMatches` deixa esses
quatro exatamente como estão — o que é um fato a considerar, não um argumento a favor ou
contra qualquer desenho.

**Matriz — operação × ator legítimo × quem consegue hoje × risco × autoridade-alvo.**
⛔ A última coluna registra **qual identificador uma verificação teria de consultar** para
distinguir o ator legítimo. Não é proposta de Rule, não escolhe arquitetura e não decide
nada; é o que o inventário observou sobre cada operação.

| Operação | Ator legítimo (pelo desenho do produto) | Quem consegue hoje | Risco concreto | Identificador que a distinção exigiria |
|---|---|---|---|---|
| Criar sala (`:3111`) | quem abre a partida | qualquer autenticado | criar doc declarando `createdBy` de terceiro | `request.auth.uid == createdBy` no create |
| Entrar / reivindicar slot (`:3250`, `:3217`) | quem tem o código/QR | qualquer autenticado | entrar em sala alheia, ocupar slot de outro | nenhum campo de sala hoje distingue convidado de estranho |
| Marcar ponto / `liveState` (`:3208`, `:9943`, `:10375`) | quem está na sala | qualquer autenticado | reescrever o placar de partida alheia; entre os próprios jogadores, last-write-wins | pertencimento (`playerUids`/`players[].uid`) |
| Publicar gênero (`:14569`) | o dono do uid | qualquer autenticado | escrever `participantGenders.<uidAlheio>` | segmento do dot-path == `request.auth.uid` |
| Sinalizar pronto/recomeço/confirmação (`:14504`, `:10774`, `:11529`) | o dono do uid | qualquer autenticado | forjar quórum com uid alheio | elemento do `arrayUnion` == `request.auth.uid` |
| Encerrar (`hostClosed`, `closePending`) (`:8859`, `:11308`, `:11447`, `:11513`, `:11554`) | host / quórum da sala | qualquer autenticado | encerrar sala de terceiros; cancelar encerramento alheio | papel na sala — **não existe campo de host** hoje (`createdBy` é autoria, não papel) |
| Voltar ao setup / apontar sala nova (`:10506`, `:11452`, `:10706`, `:15088`) | quem está na sala | qualquer autenticado | redirecionar a sala de outros via `nextRoomCode` | pertencimento |
| Sugerir/aceitar vínculo (`:8718`, `:204`) | quem joga / quem foi sugerido | qualquer autenticado | atribuir partida às estatísticas de terceiro | `suggestedUid == request.auth.uid` na aceitação |
| Snapshot do Rei/Rainha (`:9864`) | a sessão que terminou a rodada | qualquer autenticado | criar doc `finished` com `result` arbitrário e `playerUids` de terceiros | `request.auth.uid` ∈ `playerUids` do doc criado |
| Config de estatística (`:9971`) | quem está na sala | qualquer autenticado | alterar o modo da partida alheia | pertencimento |
| Apagar sala (`:3319`, `:3369`) | quem criou / último a sair | qualquer autenticado | apagar sala em jogo de estranhos | autoria + estado |
| Limpeza agendada (`:1397`) | a própria Function | só o agendador | doc sem timestamp é apagado | — (Admin SDK; Rule não se aplica) |
| Exclusão de conta (`:5626`) | o dono da conta | callable do próprio dono | **sobrescreve o doc inteiro** com o resultado da varredura | — (Admin SDK; Rule não se aplica) |
| Fusão de contas (`:6587`, `:724`) | o dono das duas contas | callable do próprio dono | remapeamento genérico grava campos não previstos pelo schema casual | — (Admin SDK; Rule não se aplica) |

**Veredito de completude da P0.1.** Com as três varreduras acima, o inventário responde a
pergunta que a leva exigiu: **não existe writer de `casualMatches` não catalogado**. São
**30 writers**: 6 portas em `js/firebase-db.js`, 20 chamadas diretas em
`js/views/bracket-ui.js`, 3 escritas server-side e 1 deleção agendada. Nenhum outro arquivo
do repositório escreve na coleção — o censo mostra que os 24 arquivos que a citam se
resolvem em writers (3), leitores (`js/trophies.js`, `js/trophy-catalog.js`,
`js/views/tournaments-enrollment-report.js:1972`, `functions/index.js` nas linhas de stats),
comentários, i18n, testes, índices e documentação. ⚠️ A única via que **não** nomeia a
coleção é o sweep genérico, e ela está catalogada em (C).

⚠️ Correção de escopo à L3.P0: o bundle nativo tem os **mesmos 20 writers diretos** —
`android/.../js/views/bracket-ui.js` e `ios/.../js/views/bracket-ui.js` são byte-a-byte
idênticos entre si (md5 `0472926e…`) e trazem as mesmas 27 chamadas. O bloqueio registrado
na L2 vale igual, e agora com o número certo: não são 10 portas embarcadas, são 26 caminhos
de escrita no cliente das lojas.

⛔ **Nada é proposto nesta etapa.** Nenhuma Rule, nenhuma Function, nenhum dado, nenhuma
versão e nenhum deploy foram tocados. O que muda aqui é só o registro factual, e o que ele
corrige é uma afirmação de completude que a P0 fez sem ter base para fazer.

**L3.P1 — o schema REAL em produção, medido (read-only, 31/ago/2026).**

*Método.* Duas varreduras completas da coleção com o Admin SDK sob credencial padrão do
`gcloud` (`projectId: scoreplace-app`), só `.get()`, nenhuma escrita, saída exclusivamente
agregada — nenhum id, uid, `roomCode`, nome ou placar foi lido para fora de um contador.
⚠️ Cada execução abre com um **controle**: lê `tournaments` e aborta se vier vazio. Sem ele,
um driver mudo devolveria zero e o zero seria lido como medida.
[[project_ler_firestore_por_rest_erra_calado]] O script falha com código 1 e a frase *"não é
zero, é ausência de resultado"* em qualquer erro — a leva proibiu transformar falha em zero.
A classificação de tipo é feita sobre o valor **em runtime**, que é o que a Function enxerga.
A simulação da limpeza é uma cópia literal do `_ts` e dos cortes de
`cleanupOldCasualMatches` (`functions/index.js:1352-1400`), avaliada no instante da medição.

**(1-2) Total e status.** **17 documentos** — coleção inteira, sem `limit`.
`finished` 15 · `setup` 1 · `waiting` 1. Nenhum `active`, nenhum sem `status`.

**(3) Presença e tipo efetivo dos dez campos pedidos.**

| Campo | Presente | Tipo observado | Ausente / nulo |
|---|---|---|---|
| `createdBy` | 17/17 | string | 0 |
| `createdAt` | 17/17 | string ISO-8601 | 0 |
| `players` | 17/17 | array (16 não-vazios, **1 vazio**) | 0 |
| `playerUids` | 17/17 | array não-vazio | 0 |
| `participants` | 15/17 | array não-vazio | **2 ausentes** |
| `roomCode` | 17/17 | string | 0 |
| `result` | 17/17 | 15 object, **2 `null`** | 0 |
| `liveState` | 16/17 | object | 1 ausente |
| `finishedAt` | 15/17 | string ISO-8601 | 2 ausentes |
| `lastActivityAt` | 14/17 | **number (epoch ms)** | 3 ausentes |

⚠️ `createdAt` e `finishedAt` são **string ISO**; `lastActivityAt` e `setupAt` são **number
epoch**. Nenhum campo de data é `Timestamp` nativo do Firestore em nenhum dos 17 documentos
— o que explica por que o `_ts` da limpeza, que só sabe tratar número e string, nunca produz
`NaN` hoje (medido: 0 casos). É uma coincidência do dado atual, não uma garantia do código.

**(4) As três representações de pessoa divergem em 12 dos 17 documentos.**
Iguais nas três listas: **5**. Divergentes: **12**. Nenhum documento com as três vazias.
Contando uid que aparece em **uma só** das três representações: 3 só em `playerUids`,
2 só em `participants`, 0 só em `players`. Há **1** documento com `players` vazio e
`playerUids` preenchido; **nenhum** no sentido inverso. ⚠️ Isto é a contraparte medida do
que o código já dizia em comentário: o guarda `jaEstou` de `joinCasualMatch` (`:3270`)
precisou cruzar as três listas justamente porque elas não coincidem.

**(5) `createdBy`.** Presente e não-vazio em **17/17**, e em **17/17** o valor está **dentro**
do conjunto de identidades do próprio documento (`players[].uid` ∪ `playerUids[]` ∪
`participants[].uid`). Zero ausentes, zero vazios, zero fora.

**(6) Campos-fantasma: ZERO ocorrências em 17/17 documentos.** `hostUid`, `guestUid`,
`hostColor` e `guestColor` **não existem em nenhum documento da produção** — nem legado, nem
recente. ⭐ Isto fecha, pelo lado do dado, o que a L3.P0 tinha achado só pelo lado do código.

**(7) Tipos efetivos dos timestamps.** `setupAt`: ausente em **16/17**, number epoch em 1.
`createdAt`: string ISO em 17. `finishedAt`: string ISO em 15, ausente em 2.
`lastActivityAt`: number epoch em 14, ausente em 3. `updatedAt`: **ausente em 17/17**.
⚠️ `updatedAt` é o **segundo** termo do fallback da limpeza nos dois ramos
(`finishedAt || updatedAt || createdAt` e `lastActivityAt || updatedAt || createdAt`) e
**não existe em documento nenhum** — o fallback do meio é morto na prática.

**(8) A limpeza agendada apagaria HOJE: zero documentos.** Os 17 ficam. Nenhum caiu por
idade, nenhum por falta de timestamp, nenhum caso de `NaN`. Margens medidas:

| Classe | Faixa de idade | Corte | Quantos |
|---|---|---|---|
| `finished` | 1 d – 7 d | 30 d | 2 |
| `finished` | 7 d – 30 d | 30 d | **13** |
| não-`finished` | 1 h – 12 h | 12 h | 2 (folga de 5 h e 6 h) |

⚠️ Observação factual com prazo: **13 dos 15 `finished` estão na faixa de 7 a 30 dias**, ou
seja, saem sozinhos nas próximas semanas pela regra de 30 dias já em vigor. Registrado como
fato do dado medido em 31/ago/2026, não como pedido de ação.

**(9) Compatibilidade para amarrar escrita a criador ou participante — o que o dado diz.**
Zero documentos sem `createdBy`; zero com `createdBy` fora das identidades; zero sem
identidade alguma; zero com uid apenas em `players` (que uma verificação por `playerUids`
não enxergaria); `playerUids` presente e não-vazio em **17/17**. O único desencontro medido:
**2 documentos não têm `participants`**. ⛔ Registro do dado; **nenhuma Rule é proposta nem
escolhida aqui** — a leva proibiu, e a decisão de autoridade continua aberta.

**Hipótese da L3.P0 — CONFIRMADA.** Ela dizia: *"que os troféus casuais estejam de fato
zerados em produção. Não foi medido"*. Agora foi, por agregado sobre `users`:

| Medida | Valor |
|---|---|
| Perfis lidos (nenhuma lápide entre eles) | 266 |
| Perfis com o campo `_rankStats.casualMatchesPlayed` materializado | 263 |
| Perfis com `casualMatchesPlayed > 0` | **0** |
| Perfis com `casualMatchesWon > 0` | **0** |
| Perfis com qualquer troféu casual em `_trophyIds` | **0** |
| Partidas casuais reais em produção | 17 (15 `finished`, com `result` object) |

⚠️ Os três caminhos possíveis foram conferidos separadamente para não confundir "campo
ausente" com "campo zerado": `users/{uid}.casualMatchesPlayed` → 0 perfis têm o campo;
`users/{uid}.stats.casualMatchesPlayed` → 0 perfis; `users/{uid}._rankStats.casualMatchesPlayed`
→ 263 perfis têm, e **todos com valor 0**. A presença em 263 perfis é o que prova que o
caminho medido é o certo — se fosse o errado, a contagem seria 0 e nada estaria provado.
⭐ Os dois lados fecham no mesmo ponto: 15 partidas terminadas com resultado gravado, 266
pessoas, e nenhuma estatística casual diferente de zero — enquanto os quatro campos de que
as consultas de contagem dependem não existem em documento nenhum.

**Limitações desta medição — o que ela NÃO diz.**
1. É um **retrato dos sobreviventes**. A `cleanupOldCasualMatches` apaga `finished` com mais
   de 30 dias e salas paradas em 2 h/12 h; documentos anteriores a 30 dias **já não existem**.
   Nada aqui descreve o histórico da coleção, só o que estava vivo em 31/ago/2026.
2. **N = 17.** Os contadores são exatos para esse conjunto e não sustentam projeção.
3. O Admin SDK **ignora as Rules**. A medição diz o que o **dado** é; não diz, e não pode
   dizer, o que um cliente conseguiria escrever.
4. A simulação da limpeza (item 8) **reimplementa** a lógica da Function num instante; não é
   observação da Function executando.
5. A varredura não é transacional — escritas concorrentes durante a leitura não foram
   excluídas. Com 17 documentos e saída agregada, isso não muda nenhum contador acima.
6. Nada foi medido sobre o app **nativo** das lojas: ele lê e escreve a mesma coleção, mas a
   medição não distingue origem de escrita.

**L3.P2 — contrato de autoridade e gates de corte (read-only, 31/ago/2026). ⛔ NADA É
DECIDIDO AQUI.** Esta etapa registra uma arquitetura-alvo **futura** e o que ela custaria;
não escolhe entre as opções, não propõe texto de Rule e não altera nada. O que segue é
evidência lida do repositório e do dado medido na L3.P1.

*O que a linguagem de Rules deste projeto já provou saber fazer.* Não é especulação — cada
recurso abaixo já está em uso em `firestore.rules`, e é isso que torna a comparação honesta:

| Recurso | Precedente no próprio arquivo | Serve para |
|---|---|---|
| `request.auth.uid in resource.data.lista` | `:280` (`results/{matchId}`) | pertencimento por uid |
| campo imutável para participante | `:281` — `request.resource.data.playerUids == resource.data.playerUids` | impedir que participante mexa no elenco |
| `diff(resource.data).affectedKeys().hasOnly([...])` | `:38`, `:98`, `:955` | limitar QUAIS campos a transição toca |
| `resource.data.get('campo', [])` | `:187`, `:221` | tolerar campo ausente sem estourar |
| `request.resource.data.keys().hasOnly([...])` | `:512`, `:518`, `:539` | fechar o formato de um `create` |

⛔ **E o que ela NÃO sabe fazer, e é o eixo desta leva:** a linguagem **não itera lista de
mapas**. Não há `map`, `filter` nem `exists` sobre `players[]`, `participants[]` ou
`pendingLinkRequests[]`; indexar exige literal (`players[0]`), e o índice do slot é dinâmico.
⚠️ Consequência direta: **toda operação cujo campo-alvo é lista de mapas fica fora do alcance
de uma Rule**, por construção — não por falta de capricho na escrita da regra.

⛔ **O aviso mais caro está no próprio arquivo, e já foi pago duas vezes.** `firestore.rules:41-60`
registra que (a) a regra de aceite de co-organização **nunca funcionou**: promover a
`'active'` mexia em `adminUids`, que não estava no `hasOnly` → *permission-denied
determinístico* (Sentry SCOREPLACE-WEB-6R), e (b) `waitlistNoticeSent` faltando na mesma
lista derrubava **toda** inscrição no teto. ⚠️ Em `casualMatches` a superfície é **26
conjuntos de campos distintos** (20 writers diretos + 6 portas, L3.P0.1) — a mesma armadilha,
26 vezes maior. E três desses writers (`:11513`, `:11529`, `:11554`) são **compat de legado**:
`closePending` deixou de ser escrito na 2.0.4 (`js/views/bracket-ui.js:11357`), mas o
confirmar/recusar continua vivo para salas antigas. ⛔ Caminho raro é exatamente o que morre
calado numa lista `hasOnly` incompleta.

**(1-5) O contrato, operação por operação.** "Rules dá conta?" responde à pergunta 4 da leva:
se uma Rule consegue validar a **transição** com segurança, sozinha.

| Operação (writers) | (1) o que a UI exige hoje | (2) quem deveria poder | (3) identificador canônico disponível no doc | (4) Rules dá conta? | (5) o que a transição exigiria |
|---|---|---|---|---|---|
| Criar sala (`fb:3111`) | `.add` do payload cru | quem abre | `createdBy` (17/17, e sempre dentro das identidades) | **Sim** — `create` com `createdBy == request.auth.uid` e `keys().hasOnly([...])` | fechar o formato do `create`; hoje o payload é livre |
| Entrar por código (`fb:3250`) | transação que insere em `participants` **e** `playerUids` | quem tem o código | `playerUids` (17/17 não-vazio) | **Parcial** — o acréscimo em `playerUids` é validável; `participants` é **lista de mapas** e não | refatorar o writer para separar o que é validável do que não é, **ou** capability/servidor |
| Reivindicar slot (`fb:3236`) | reescreve `players[]` inteiro; exige slot livre e "não tenho outro slot" | quem está na sala | nenhum — o slot vive dentro de lista de mapas | **Não** — os dois guardas exigem iterar `players[]` | capability por intenção (`{docId, slotIndex}`) ou autoridade server-side |
| Marcar ponto (`fb:3208` via `_syncLiveState`, `ui:9943`, `ui:10375`) | `liveState` + `lastActivityAt`, debounce 300 ms | quem está na sala | `playerUids` | **Sim** — pertencimento + `hasOnly(['liveState','lastActivityAt','status'])` | fechar `updateCasualMatch`, que hoje aceita **qualquer** campo |
| Publicar gênero (`ui:14569`) | dot-path `participantGenders.<uid>` | o dono do uid | a própria chave do mapa | **Sim** — `MapDiff` limitado a `request.auth.uid`; ⚠️ o campo falta em 4/17, exige `get('participantGenders', {})` | nenhuma refatoração de writer |
| Pronto / recomeço / confirmar encerramento (`ui:14504`, `ui:10774`, `ui:11529`) | `arrayUnion(meuUid)` em `readyPlayers`, `restartReady`, `closePending.confirmedBy` | o dono do uid | o próprio elemento | **Com ressalva** — validável por `hasAll`/`hasOnly`, que tratam lista como **conjunto**: duplicata é invisível | nenhuma no writer; a ressalva é semântica, não de código |
| Encerrar / evacuar (`ui:8859`, `ui:11308`, `ui:11447`) | `hostClosed: true` — todo cliente que lê isso **sai da sala** (`ui:8988`) | o host | ⛔ **não existe campo de host**; `createdBy` é autoria, não papel | **Só metade** — "estar em `playerUids`" é validável; "ser o host" não tem dado que sustente | decidir onde mora o papel de host — é dado que **não existe** hoje |
| Voltar ao setup / apontar sala nova (`ui:10506`, `ui:11452`, `ui:10706`, `ui:15088`, `ui:11554`) | `setupAt`, `status:'setup'`, `nextRoomCode` | quem está na sala | `playerUids` | **Sim** — pertencimento + `hasOnly` | nenhuma, se o conjunto de campos for enumerado sem erro |
| Config de estatística (`ui:9971`) | `statsConfig` | quem está na sala | `playerUids` | **Sim** | nenhuma |
| Sugerir vínculo (`ui:8718`) | lê o doc e regrava `pendingLinkRequests` inteiro | quem está na sala | lista de mapas | **Não** | writer precisa virar transação; validação só por capability/servidor |
| Aceitar vínculo (`ui:204`) | regrava `pendingLinkRequests`, `players`, `playerUids`, `participants` — **atribui a partida a um uid** | a pessoa sugerida | `suggestedUid` dentro de lista de mapas | **Não** — o alvo da autorização está no elemento da lista | capability por intenção ou servidor; é a operação que move estatística de pessoa |
| Snapshot Rei/Rainha (`ui:9864`) | `.add` de doc novo `finished` com `result` | a sessão que jogou | `playerUids` do doc **criado** | **Sim** — `request.auth.uid in request.resource.data.playerUids` + `keys().hasOnly` | fechar o formato do `create` |
| Apagar sala (`fb:3319`) | `.delete()`; recusa `finished` **no cliente** | quem criou | `createdBy` + `status` | **Sim** para o caminho do criador | — |
| Auto-dissolver ao sair (`fb:3369`) | `transaction.delete` quando some o último slot ocupado | o último a sair (**pode não ser o criador**) | a condição está em `players[]` | **Não** — depende de contar ocupantes em lista de mapas | servidor, ou aceitar que a sala fique para a limpeza agendada |
| Limpeza agendada (`fn:1397`), exclusão (`fn:5626`), fusão (`fn:6587`, `fn:724`) | Admin SDK | as próprias Functions | — | **N/A** — Admin SDK **ignora Rules** | ⚠️ qualquer decisão de Rule deixa estes quatro exatamente como estão |

**(6) Os 12/17 documentos divergentes não são cosmética — sob regra de pertencimento eles
viram recusa a gente real.** A L3.P1 mediu: as três representações coincidem em **5**
documentos e divergem em **12**; há uid presente **só** em `playerUids` (3 casos) e **só** em
`participants` (2 casos); `participants` **não existe** em 2 documentos; `players` está vazio
em 1. Uma regra ancorada em `playerUids` é a única que hoje encontra base em 17/17 — e ainda
assim recusaria a escrita de quem, nos 2 casos medidos, só consta em `participants`.
⛔ E há um limite que nenhuma escolha de lista resolve: **o cânone permite participante SEM
CONTA** — `tests/slot-sem-uid-e-gente-sem-conta.test.js` trava que slot sem uid é gente que
não tem perfil, e o nome digitado É a identidade legítima dela. Essa pessoa **nunca** satisfaz
uma condição por uid; quem escreve por ela é o aparelho de outra pessoa. Qualquer alvo futuro
precisa dizer o que fazer com esses dois grupos (divergentes e sem-conta) **antes** de a regra
existir, não depois.

**(7) QR e slots vazios.** A leitura é `if true` e é o que faz o código/QR funcionar sem
conta. ⚠️ Mas a escrita já exige `request.auth != null`, e **não há login anônimo no
produto** — `signInAnonymously` não aparece em lugar nenhum de `js/`. Ou seja: a justificativa
escrita na própria Rule (*"Public read so anonymous QR / room-code joins work"*) descreve a
LEITURA; entrar de fato já exige conta hoje. O problema real do ingresso é outro e é de
ordem: uma regra de pertencimento avalia `resource.data` — o estado **antes** —, e quem está
entrando por definição ainda não está lá. A transição de ingresso precisa ser tratada como
caso próprio ("não estou na lista, e o diff acrescenta só a mim"), separada da transição de
quem já é da sala. Isso é expressável para `playerUids`; a mesma escrita toca `participants`,
que é lista de mapas, e aí não é.

**(8) Concorrência, medida no código.**
- *Placar:* `_syncLiveState` (`ui:8931-8945`) grava `liveState` inteiro com debounce de 300 ms
  — **last-write-wins**. `_isRemoteUpdate` evita eco, não arbitra. Dois aparelhos marcando
  ponto ao mesmo tempo: o último a chegar apaga o outro.
- *Pronto / recomeço / confirmação:* o `arrayUnion` é atômico no campo, mas **a decisão que
  vem depois não é** — o cliente faz um `.get()` separado e avalia o quórum
  (`_readyConditionMet`, `_restartConditionMet`, `ui:11538-11548`). É TOCTOU: dois clientes
  podem ler o mesmo estado e ambos concluírem que são o gatilho.
- *Quem dispara o recomeço:* eleição **no cliente**, por `sorted[0] === myUid`
  (`_amRestartStarter`) — determinística e sem árbitro. Se as listas lidas divergirem entre
  aparelhos, dois se acham o primeiro.
- *Vínculo de jogador:* `pendingLinkRequests` é lido e **regravado inteiro**, sem transação,
  nos dois lados (`ui:8718` e `ui:204`). Duas ações simultâneas = lost update clássico.
- ⭐ Isto é o mesmo princípio já assentado no projeto: transação resolve **concorrência**, não
  **autoridade**; e a trava só vale dentro de onde mora a verdade.
  [[feedback_a_trava_vale_onde_mora_a_verdade]]

**Comparação das três opções — sem escolher nenhuma.**

| Critério | (A) Rules com transições restritas | (B) capabilities por intenção (Function) | (C) autoridade server-side nas operações críticas |
|---|---|---|---|
| Cobre lista de mapas (`players`, `participants`, `pendingLinkRequests`) | **Não** — limite da linguagem | Sim | Sim |
| Custo de latência no placar ao vivo | nenhum (escrita direta) | +1 ida ao servidor por evento | idem, e o placar é o caminho mais quente |
| Funciona offline / com sinal ruim | sim (fila do SDK) | não | não |
| Nº de superfícies a enumerar sem errar | **26 conjuntos de campos** | 1 por intenção | 1 por operação |
| Modo de falha quando erra | **permission-denied silencioso** — precedente `:41-60` | erro explícito da callable | erro explícito |
| Alcança os 4 writers server-side | não (Admin SDK ignora Rules) | não se aplica | é o mesmo plano |
| Quebra o app das lojas (2.1.28) | **sim, imediatamente** | só se o cliente velho perder o caminho antigo | idem |
| Verificável por teste antes de subir | sim (emulador de Rules) | sim (emulador de Functions) | sim |
| Resolve a concorrência do item 8 | não — Rule autoriza, não serializa | parcialmente (o servidor pode transacionar) | sim |

⛔ Nenhuma das três é adotada, e a leva proíbe escolher. Registrado só o que cada uma cobre
e o que cada uma custa.

**Invariantes que QUALQUER opção precisa preservar.** São contratos já pagos com incidente:
1. **Entrar pelo código/QR continua funcionando** — inclusive para quem chega primeiro à sala
   e ainda não consta em lista nenhuma.
2. **Participante sem conta continua legítimo** — slot sem uid é gente sem perfil, e o nome
   digitado é a identidade. [[project_uid_do_slot_se_recupera]]
3. **A mesma pessoa ocupa UM slot só** — o guarda pergunta às três listas
   (`tests/casual-mesma-pessoa-um-slot-so`), e a divergência é **curada**, não recusada.
4. **`status:'finished'` é registro permanente** — nenhum caminho novo pode apagá-lo
   (`fb:3315`).
5. **Ninguém fica preso na tela** — o encerramento não pode voltar a depender de confirmação
   que nunca chega; foi exatamente o que a 2.0.4 removeu (`ui:11357`).
6. **O placar ao vivo não pode ficar mais lento** — é o caminho quente.
   [[feedback_instrumentacao_nao_pode_cobrar_pedagio]]
7. **Nada de regressão silenciosa**: recusa tem que aparecer, não sumir.
8. **O app das lojas continua funcionando** enquanto for a versão publicada.

**Gates que precisam EXISTIR antes de qualquer implementação.** Hoje: **zero**.
⚠️ As 8 suítes de casual (`casual-mesma-pessoa-um-slot-so`, `dupla-casual-nao-perde-jogador`,
`formacao-de-duplas-casual`, `usuario-sempre-time-azul`, `azul-e-slots-fixos`,
`slot-se-decide-por-uid`, `replay-e-o-placar-ao-vivo`, `tiebreak-uma-forma-de-gravar`) são
**testes de TEXTO-FONTE**: leem o `.js` com `readFileSync` e casam expressão regular. Nenhuma
escreve no Firestore, nenhuma sobe emulador — logo **nenhuma delas é capaz de detectar um
`permission-denied`**. Uma mudança de Rule passaria com a suíte inteira verde.
⭐ A infraestrutura para os gates já existe e é reaproveitável: 6 suítes de Rules rodam contra
o emulador (`tests/rules-*.test.js`) e o harness de corrida carrega o `js/firebase-db.js`
REAL contra o Firestore do emulador (`tests/concurrency/emu-harness.js`).

| Gate | O que precisa provar | Harness que já existe |
|---|---|---|
| G1 — cobertura de Rules para casual | hoje `tests/rules-*.test.js` **não menciona a coleção**; cada uma das 26 superfícies precisa de um caso permitido e um negado | `tests/rules-*.test.js` |
| G2 — controle com a Rule ANTIGA | a suíte tem de FALHAR contra a regra permissiva; senão ela não prova o corte | mesmo padrão da L1.2 (rules sintéticas "velhas") |
| G3 — inventário de campos vs `hasOnly` | teste que deriva do CÓDIGO a lista de campos escritos e confronta com a lista autorizada; writer novo sem cobertura reprova | varredura estrutural da L3.P0.1 |
| G4 — corrida real | placar simultâneo, dois "prontos", dois "recomeços" e dois vínculos concorrentes, contra Firestore de verdade | `tests/concurrency/emu-harness.js` |
| G5 — compatibilidade de dado | os 12/17 divergentes, os 2 sem `participants` e o participante sem conta continuam operando | fixture derivada da medição L3.P1 |
| G6 — paridade nativa | o bundle embarcado exercita os mesmos caminhos com a Rule nova | `scripts/check-embedded-www.sh` como ponto de partida |

**⛔ BLOQUEIO DE CUTOVER NATIVO — condição de corte, não recomendação.**
`android/app/src/main/assets/public/js/store.js` e `ios/App/App/public/js/store.js` estão em
**`SCOREPLACE_VERSION = '2.1.28'`**, e `capacitor.config.json` declara `webDir: "www"` **sem
`server.url`** — o `server.hostname` ali serve só como origem da WebView. Ou seja: o app das
lojas **executa o pacote local** e **não recebe atualização** quando o Hosting publica.
Medido na L3.P0.1: os dois bundles são byte-a-byte idênticos entre si e contêm os **mesmos 20
writers diretos**, isto é, **26 caminhos de escrita** que hoje dependem de
`allow write: if request.auth != null`. ⛔ Qualquer restrição de Rule entra em vigor no
**servidor**, para **todo cliente ao mesmo tempo** — o app publicado quebraria no instante do
deploy das Rules, sem nada a fazer do lado de quem já instalou. Portanto a mudança de Rule só
pode acontecer **depois** de (a) versão nativa compatível publicada **e aprovada** nas duas
lojas, e (b) política de adoção autorizada pelo dono (piso de versão, prazo, e o que acontece
com quem não atualizar). É o mesmo bloqueio já registrado na L2, e ele continua **externo**.

**Separação exigida pela leva — três coisas distintas, e nenhuma vira a outra.**
- **DECISÃO PENDENTE (do dono, não minha):** quem manda em cada operação de `casualMatches`,
  e qual das três opções (A/B/C) — ou qual mistura — atende. ⛔ Continua **em aberto**;
  nada nesta leva a antecipa. [[feedback_never_freeze_my_opinion_as_owners_decision]]
- **HIPÓTESE — já resolvida e fora deste escopo:** os troféus casuais zerados. **Confirmada**
  na L3.P1 (266 perfis, zero com `casualMatchesPlayed > 0`, contra 15 partidas terminadas),
  com causa medida (os 4 campos-fantasma não existem em 17/17). É defeito de **leitura**, não
  de autoridade, e não depende de nenhuma decisão de Rule para ser corrigido.
- **PROPOSTA FUTURA — não formulada:** nenhum texto de Rule, nenhuma assinatura de capability
  e nenhum desenho server-side foi escrito nesta leva. O que existe é o contrato acima e a
  lista de gates que teriam de estar verdes **antes** de qualquer implementação começar.

**Dívida registrada na L1.2, NÃO executada: idempotência dos writers legados de `/mail`.**
Fechar a Rule tirou o cliente da coleção; não mudou como o **servidor** escreve nela. Seis
caminhos passam por `_enqueueMail` (`functions/index.js:151`), que usa `.add()` — id
automático, sem idempotência: `flushNotifEmailDigest`, `sendMagicLink`,
`_queueVerificationEmail`, `sendVerificationCode`, `_queuePasswordResetEmail` e
`_sendMergeProofEmail`. Uma reentrega do gatilho ou um retry duplica o e-mail. Os writers
mais novos já não têm isso — `accountSummaryEmail`, `accountDeletionEmail`,
`phone-nudge-run`, `secondary-email-reserva`, `tournament-invite-reserva` e os dois
convites da L1.1 usam id determinístico + `create()`. ⚠️ Não é a mesma classe de problema
que a L1 fechou (aquilo era autorização; isto é entrega dobrada), e por isso vai
registrado em separado em vez de entrar de carona.

**L15 — quais comandos executam cada grupo de teste.** O catálogo é conferido por
`scripts/check-test-catalog.js` (no `npm test`), que falha se aparecer arquivo de teste sem
comando **ou** se um arquivo catalogado for apagado (catálogo com fantasma mente tanto quanto
teste órfão).

| Grupo | Comando | O que roda |
|---|---|---|
| `run-unit` | `npm test` | 582 suítes headless, listadas à mão em `tests/run-unit.js` |
| `rules` | `npm run test:rules` | 6 suítes que dirigem as Rules REAIS no emulador |
| `autodraw-manual` | `npm run test:autodraw` | 9 suítes do motor de sorteio |
| `emulador-manual` | `npm run test:emu` | 5 suítes de emulador (`:emu:fs` Firestore · `:emu:fn` Firestore+Functions) |
| `concurrency` | `npm run test:concurrency` | corridas contra o emulador |
| `purge` | `npm run test:purge` | purga de torneio (Firestore+Functions) |
| `amizade` | `npm run test:amizade` | 8 suítes requeridas por `tests/amizade/run.js` |
| `ext` | `npm run test:ext` | extensão letzplay |

⛔ **O gate varre os TRÊS diretórios recursivamente** (`tests/`, `functions/`,
`functions-autodraw/`), com `node_modules` de fora em todo nível, e aceita os **dois
padrões** em qualquer um deles (`*.test.js` e `test-*.js`). A primeira versão (L15.P2)
descia só em `tests/` e lia os outros dois no primeiro nível — um
`functions/qualquer-pasta/test-x.js` ficaria órfão e o gate responderia "completo".
⚠️ Gate com ponto cego é pior que gate nenhum: ele dá a MESMA resposta nos dois casos, e é
essa resposta que faz ninguém procurar. Corrigido na L15.P2.1, provado com sonda nas duas
subpastas e com o gate antigo passando batido na mesma sonda. O gate também recusa
**isenção morta** em `NAO_SAO_SUITE` (arquivo apagado, ou que virou suíte catalogada) —
isenção que não isenta esconde que o arquivo É executado.

⚠️ **Os grupos de emulador rodam em SÉRIE, e isso não é preferência.** Todas as suítes usam o
projeto `demo-scoreplace`, então em paralelo os dados se misturam; e as `rules-*` disputam
porta: 8098 (`rules-sandbox-read`, `rules-cohost-uid-only`, `rules-mail-server-only`) e 8099
(`rules-privileged-fields`, `rules-inscricao-espera`, `rules-amizade-nao-cross-user`). Cada
suíte sobe e derruba o próprio emulador; encadeadas por `&&`, não colidem.

**O que a triagem da L15.P1 achou nos 5 vermelhos** — nenhum era regressão de produto:
`rules-sandbox-read` reconstruía a regra antiga com `replace` **sem a flag `g`**, e desde
25/ago (4c595e2d, `tournaments_summary`) havia DOIS blocos idênticos: revertia o errado e o
controle acusava 403 (**fixture**). `test-uid-identity` marcava presença com `1`, que desde
23/ago (dd878b65, "presença caduca em 24h") conta como **vencida** (**fixture**). Os dois
`*-authz` do autodraw exigiam autorização por `memberEmails`/`adminEmails`/`organizerEmail`,
removida em 26/ago (362fc0f2, "identidade é uid") — as asserções viraram **recusas** e a
cobertura cresceu (**teste obsoleto**). `test-backfill-emu` e `test-syncroster-emu` exigiam
que o espelho **não** se curasse sozinho, o oposto do que 6c2570cb (10/ago, "o espelho do
roster passa a se manter sozinho") decidiu com medição em produção — reescritos para afirmar
a **cura automática**, preservando o limite do `dryRun` (**teste obsoleto**).

## Gates de processo registrados

| Gate | Onde está pendurado | O que barra | Prova |
|---|---|---|---|
| `scripts/check-deploy-alignment.js` | `hosting.predeploy[0]` **e**, desde R0.3, `functions[0].predeploy` do `firebase.json` da raiz | deploy com árvore suja ou com `HEAD` fora de `origin/main` | `tests/trava-de-alinhamento-barra-deploy.test.js` |
| `scripts/lib/leitura-resiliente.js` | GETs de `scripts/conferir-espelho-resultados.js` | auditoria que termina sem contador: falha transitória de rede é retentada, falha persistente vira exit não-zero com causa/operação/tentativas | `tests/conferidor-sobrevive-a-rede.test.js` | · deadline de parede por tentativa desde R0.4.2 (`tests/transporte-tem-deadline-real.test.js`)

**Por que a leva R0.3 existiu.** `scripts/deploy-functions.sh` não tem uma linha de git —
publica o que está no disco. Medido em 30/ago/2026: as Functions foram atualizadas às 19:38
BRT e o commit que carrega esse código (`0aecc59b`) é de 19:41, ou seja três minutos com
produção rodando código não commitado. A trava já existia desde o incidente de 12/ago
(produção 1.8.27 com `origin/main` 1.8.24), mas só o caminho do Hosting passava por ela:
`functions[0].predeploy` estava `[]`. A correção foi ligar a trava existente, não escrever
outra.

**Escopo deliberado:** a trava NÃO foi aplicada a `functions-autodraw` nem a
`functions-stripe`. Esses diretórios têm `firebase.json` próprio e **não têm `.git`**, então
ela cairia no ramo do carimbo (`.deploy-alignment.json`, escrito apenas pelo
`deploy-hosting.sh`) e barraria todo deploy desses codebases. O teste trava essa decisão para
que ninguém a "complete" antes de resolver a ausência de `.git`.


**R0.4 — por que o conferidor não terminava.** Ele morria no primeiro GET com
`UND_ERR_CONNECT_TIMEOUT` em 10.000 ms: esse é o `connectTimeout` interno do undici, e o
`fetch` do Node não o expõe. Medido com curl no mesmo instante — connect 0,049s no IPv4
contra 5,035s no IPv6; uma requisição isolada passava (~5,4s), centenas não.
`AbortSignal.timeout` foi **descartado** por não alterar esse teto, e
`--dns-result-order=ipv4first` foi tentado uma vez sem mudar o desfecho. O transporte passou
a ser `node:https`, com até 4 tentativas e espera progressiva de teto 4s, retentando
**somente** erros transitórios identificados. O critério de comparação `matches → results`
não foi tocado.

**R0.4.2 — a primeira tentativa de deadline estava errada.** A R0.4 passava `timeout` ao
`https.request` e chamava isso de deadline: essa opção vira `socket.setTimeout`, e o socket
só existe DEPOIS do DNS resolver e do agent entregar conexão. Com o DNS pendurado não há
socket, logo não há relógio — e o conferidor ficou vivo por mais de 3 minutos contra
produção, reprovado pelo Codex. Agora há um **timer de parede por tentativa**, armado ANTES
de `https.request`, que destrói a requisição mesmo sem socket algum e é limpo em sucesso,
erro e estouro.

**Bypass:** `SP_SKIP_ALIGNMENT=1` continua existindo para emergência declarada, e continua
anunciando no console que foi usado. O teste cobre isso — bypass mudo seria pior que trava
nenhuma.

## Leitura correta do progresso

L0 resolveu uma falha concreta de consistência e reparou os dados afetados. Isso **não**
fecha, por aproximação, L6–L8 nem autoriza L10–L16. O próximo item técnico de menor
escopo e causa já comprovada é L1 (`/mail`); ainda assim, ele permanece pendente até
seleção explícita do arquiteto.
