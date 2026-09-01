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
| L4 | profile/privacy + e-mail secundário | **Aberta. Inventário CONCLUÍDO (L4.P0), produção MEDIDA (L4.P1) fronteiras CARACTERIZADAS no emulador (L4.P2), `magicLinks` INVENTARIADO (L4.P3) a leitura cruzada de perfis MAPEADA (L4.P5) e a MATRIZ DE ALTERNATIVAS registrada (L4.P6, nada escolhido).** ⭐ **L4.P4 CONCLUÍDA E PUBLICADA (2.1.78, commit `2c8cb628`, ruleset `9a65fc58`):** a enumeração pública de `magicLinks` foi fechada — `allow get` por token, `list` negado —, com suíte de Rules, trava estática nos três clientes e controle contra `94f7d9cf`. ⛔ Confirmado por execução: `magicLinks` é enumerável por ANÔNIMO (`list`/`runQuery` = 200) e `users` por qualquer autenticado; os 15 campos privilegiados estão negados 30/30 em create e update. 18 superfícies de identidade mapeadas; 15 campos privilegiados fechados no create e no update, com **zero** writer no cliente (conferido). ⛔ Achados abertos: `users` é legível **inteiro** por qualquer autenticado (PII incluída); `notifications` aceita `create` de qualquer autenticado; `linkedEmails` é **prova de posse** aceita na fusão e na resolução de conta, e a REMOÇÃO segue sendo escrita direta do cliente (`js/views/auth.js:9626`); o bundle das lojas (2.1.28) roda o fluxo de identidade PRÉ-L1 contra Rules PÓS-L1. | Definir fonte de verdade e privacidade do perfil. **Não decidido nesta etapa.** |
| L5 | amizade e autorização friends-only | **Preparada, bloqueada externamente.** Migração está `not_started`; dry-run leu 262 perfis. | Gate nativo (clientes mínimos) e aprovação humana formal do cutover. |
| L6 | writers excessivamente amplos de `tournaments` | **Aberta. Inventário CONCLUÍDO (L6.P0, read-only, 31/ago/2026). ⛔ Nenhuma autoridade foi alterada e nada foi decidido.** Mapeadas as portas dos três codebases: no cliente, `js/firebase-db.js` concentra 9 portas (a maior é `saveTournament`, **93 chamadas**, que grava a cópia EM MEMÓRIA com `merge:true`) mais a orquestração `AppStore.mutate` → `commitTournamentTx`; no `functions/`, seis portas passam pelo tradutor ciente da divisão (`functions/split-parts.js`) e `aplicarNoTorneio` é a porta única de escrita fina; no `functions-autodraw/`, sete chamadores passam por `_leTorneio`/`_gravaTorneio`. ⛔ Achados abertos: as duas allowlists do documento pai (`firestore.rules:37` e `:97`) autorizam por CHAVE e **nunca por valor** — a segunda tem ~45 campos, entre eles `matches`, `standings`, `status`, `participants` e `memberUids`, e a primeira vale pra **qualquer autenticado**; há **5 escritas diretas do cliente fora da porta** (`js/store.js:3840`, `:9676`; `js/views/arbitros.js:274/:309/:342`); `results` tem **cinco** autoridades de escrita; e `participants`/`communications` são subcoleções **sem regra nenhuma**. ⭐ Achados MEDIDOS em produção: 41 dos 44 torneios estão divididos (`matches`, `participants`, `opponentHistory`) e o marcador e o documento **divergem em 1 torneio**. ⚠️ **A L6.P0.1 RETIFICOU a P7**: a leitura de log que dizia "roda a cada minuto num laço no-op" estava datada por LIMITE (`--limit 500`) e não por TEMPO — os 250 pares reproduzem, mas são **todos de 28/ago**, e o `stdout` do `autodraw` está **mudo desde 2026-08-28T14:09:13Z**. ⭐ **A L6.P1 fechou a causa, com as FUNÇÕES REAIS rodadas contra o documento real**: o agendador chega ao handler (`Google-Cloud-Scheduler`, POST /, **200**, 0,06–0,23 s, revisão `autodraw-00050-taw`), o documento **entra** na query (`nextDrawAt` inteiro, vencido há 166 min) e **todas** as guardas passam — `_isIncrementalLigaPhase`=false, `isLiga`=true, `drawManual`=false, `drawFirstDate` presente, `status`=active, `pendingDraw`=false. Barra só em `functions-autodraw/index.js:1148`, `participants.length` = **0**, um `continue` **sem log** — e por isso 200 sem `stdout` não é log perdido, é log inexistente. ⛔ Não é "não elegível": `_semPesados` inclui `participants` e as subcoleções têm **10 inscritos** e **13 jogos**. É **incompatibilidade com partes divididas**, e o risco é imediato: o sorteio AGENDADO nunca gera rodada nesse torneio (o manual, via `drawRound`, gera — ele hidrata). Correção à P5: são **três** e não dois os caminhos do autodraw que leem `doc.data()` cru — `autoDrawReconcile` (:1715) também. | Escolher autoridade por operação antes de restringir qualquer writer. **Não decidido nesta etapa.** ⚠️ Fechar as allowlists esbarra no bundle das lojas (2.1.28), o mesmo bloqueio externo da L2. |
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

**L4.P0 — inventário read-only (31/ago/2026). ⛔ Nenhuma arquitetura escolhida, nenhum texto
de Rule proposto, nenhum dado de produção consultado.** Tudo abaixo saiu de varredura
estrutural do repositório — mesmo método da L3.P0.1, porque o método importa: `userLifecycle`
é alcançado por `const COL = 'userLifecycle'` (`functions/amizade-lock.js:35`), nome de
coleção **guardado em variável**, que uma busca pelo literal não acharia.

**(1) As superfícies de identidade, e quem manda em cada uma.**

| Documento / subcoleção | Rules | Autoridade de escrita |
|---|---|---|
| `users/{uid}` (`:577`) | `read: auth != null` · create/update/delete só o dono | dono, **menos 15 campos privilegiados** |
| `users/{uid}/notifications` (`:658`) | read/update/delete só o dono · **`create: auth != null`** | qualquer autenticado ESCREVE na caixa alheia |
| `users/{uid}/matchHistory` (`:679`) | read pelo dono **ou** `statsVisibility` · write só o dono | dono |
| `users/{uid}/templates` (`:687`) | read/write só o dono | dono |
| `users/{uid}/phoneVerifyAttempts` (`:702`) | read/write só o dono | dono |
| `users/{uid}/trophies` (`:717`), `milestones` (`:723`) | read pelo dono ou `statsVisibility` · write só o dono | dono (e backfill por Admin SDK) |
| `emailVerifications/{hashDoToken}` (`:749`) | `read, write: if false` | **só Admin SDK** (L1.1) |
| `emailVerifyThrottle/{chave}` (`:754`) | `read, write: if false` | só Admin SDK |
| `emailVerifyCodes/{uid}` (`:910`) | `read, write: if false` | só Admin SDK |
| `magicLinks/{token}` (`:921`) | **`read: if true`** · write false | só Admin SDK; leitura pública pelo token |
| `loginRedirects/{key}` (`:858`) | `read, write: if false` | só Admin SDK — é PROVA de acesso |
| `userLifecycle/{uid}` (`:804`) | read só o dono · write false | só Admin SDK |
| `friendships/{pairId}` (`:809`) | read pelas duas pontas · write false | só Admin SDK |
| `friendAccess/{uid}/accepted/{fid}` (`:814`) | read pelas duas pontas · write false | só Admin SDK |
| `friendRequests/{id}` (`:832`) | `read, write: if false` | ninguém — coleção morta |
| `presences/{id}` (`:931`) | **`read: auth != null`** · create com uid próprio · update/delete do dono | dono |
| `reports/{id}` (`:840`) | create com `reporterUid` próprio · read/update/delete false | só criação |
| `mergeTokens`, `mergeProofLimits` | **sem bloco nas Rules** | negadas pelo default-deny — server-only **por ausência**, não por declaração |

**(2) PII e nível de exposição.** ⚠️ O comentário da regra de `users` diz que a leitura
autenticada *"strips PII from anonymous visitors"* — e é verdade para **anônimo**. Para
**qualquer pessoa logada**, `allow read: if request.auth != null` entrega o documento
**inteiro**: `email`, `email_lower`, `linkedEmails[]`, `phone`, `linkedPhones[]`,
`fcmToken`, `preferredCeps`, `displayName`, `photoURL`, `gender`, `birthDate`,
`statsVisibility` e os sinais de identidade (`dupSuspect`, `nameConflict`, `mergedInto`).
Não há projeção nem campo escondido — [[project_email_no_doc_publico]] registra a mesma
classe. **Server-only de fato:** token de e-mail secundário (só o hash),
código de verificação (hasheado), `loginRedirects`, `mergeTokens`, `mergeProofLimits`,
`friendships`/`friendAccess`, `userLifecycle`.

**(3) Leitores e escritores, por camada.** Contagem estrutural (janela de 4 linhas;
L = sem verbo de escrita, E = com):

| Coleção | Cliente L/E | Function L/E | Script L/E |
|---|---|---|---|
| `users` | **69/39** | **106/60** | 12/2 |
| `notifications` | 7/3 | 5/13 | 0/0 |
| `presences` | 9/3 | 4/0 | 0/0 |
| `friendships` | 0/0 | 9/3 | 4/5 |
| `friendAccess` | 0/0 | 5/3 | 3/1 |
| `emailVerifications` | **0/0** | 1/2 | 0/0 |
| `emailVerifyThrottle` · `emailVerifyCodes` | 0/0 | 1/0 · 2/0 | 0/0 |
| `loginRedirects` | 0/0 | 2/1 | 0/0 |
| `magicLinks` | 1/0 | 1/2 | 0/0 |
| `mergeTokens` · `mergeProofLimits` | 0/0 | 1/1 · 1/0 | 0/0 |
| `trophies` · `milestones` | 2/3 · 0/2 | 3/2 · 2/4 | 0/0 |
| `friendRequests` · `userLifecycle` | 0/0 | 0/0 (⚠️ nome em variável) | 0/0 |

⭐ O desenho da L1 aparece no número: `emailVerifications` tem **zero** chamadas no cliente e
`friendships`/`friendAccess` também. `users`, ao contrário, é a superfície larga — 39 sítios
de escrita no cliente e 60 nas Functions.

**(4) Campos privilegiados — 15, bloqueados no create E no update.**
`privilegedUserFields()` (`firestore.rules:628`): `mergedInto`, `mergedAt`, `plan`,
`planExpiresAt`, `dupDismissed`, `dupDismissedInfo`, `dupSuspect`, `nameConflict`,
`phoneSource`, `phoneSetBy`, `phoneSetAt`, `friends`, `friendRequestsSent`,
`friendRequestsReceived`, `friendRequestsSentAt`. ⭐ Conferido nesta varredura: **nenhum
caminho do cliente escreve nenhum dos 15**. Dois quase-positivos foram inspecionados e
descartados — `js/views/auth.js:4576` (`plan:`) vai para `window._identify`, que é analytics,
e `js/views/explore.js:1451-1452` mexe no objeto em memória do otimismo de amizade, não num
payload do Firestore.

**(5) O ciclo do e-mail secundário, ponta a ponta.**

| Etapa | Onde | Autoridade |
|---|---|---|
| Pedido | `requestSecondaryEmail` (`functions/index.js:5986`) | callable autenticada; valida formato/principal/já-vinculado fora da transação |
| Reserva | `functions/secondary-email-reserva.js` | **transação** — lê o throttle e grava verificação + throttle + outbox juntos (L1.1.1) |
| Token | `secondary-email-core.js:42` | CSPRNG de 32 bytes no servidor; o banco guarda só o **sha256** — o id do doc É o hash |
| Prazo | `PRAZO_MS = 24 h` (`:35`) | `decideConfirmacao` recusa expirado |
| Freio | `COOLDOWN_MS = 2 min` (`:36`), por (uid, e-mail) | dentro da transação — é ela que serializa |
| Confirmação | `confirmSecondaryEmail` (`functions/index.js:6032`) | **não exige sessão** (o link chega na caixa); vincula ao `ownerUid` do REGISTRO, nunca a quem clica; marca `used` e vincula na MESMA transação |
| Merge | `functions/index.js:6754` | reaponta `emailVerifications.ownerUid` de oldUid para o sobrevivente |
| Recuperação | `_uidByProfileEmail` (`:4281`) → `_resolveAccount` (`:4332`) | resolve e-mail → conta em `checkAccount` (`:4395`), login por senha (`:4511`) e reset (`:4562`) — **sempre com o Auth primeiro**, o perfil só como queda |
| **Remoção** | `window._profileUnlinkEmail` (`js/views/auth.js:9626`) | ⚠️ **escrita DIRETA do cliente**: `users/{uid}.update({ linkedEmails })` |

**(6) Invariantes da L1 e das correções de identidade que não podem regredir.**
1. `/mail` e `emailVerifications` são **server-only**; o cliente não gera token nem monta
   e-mail (L1.1, L1.2).
2. A confirmação vincula ao `ownerUid` **do registro**, nunca ao uid de quem clica.
3. Assunto, corpo e destinatário do e-mail nascem no servidor; nada de `html`/`subject`/`to`
   vindos do cliente.
4. Id de outbox **determinístico** — `.add()` duplicava no retry (L1.1.1).
5. Os motivos devolvidos ao cliente **não podem virar oráculo** de "este e-mail existe no
   sistema" (travado em `tests/email-secundario-server-only.test.js:65`).
6. Campo que o servidor trata como PROVA não se escreve pelo cliente — a lição do
   `mergedInto` (sequestro provado no emulador em 15/jul/2026, `firestore.rules:583-598`).
7. Identidade é **uid**; e-mail e nome não autorizam nada
   ([[feedback_uid_controls_everything_name_only_ficticio]]).
8. A lápide (`mergedInto`) é **carga, não lixo** — não se apaga.
9. Não existe regra de unicidade de e-mail entre contas, e **inventá-la seria comportamento
   novo** (`functions/secondary-email-core.js:22-28`).

**(7) Representações duplicadas de identidade.** E-mail vive em `users.email`,
`users.email_lower`, `users.linkedEmails[]`, no **Auth** (primário e sintético) e em
`loginRedirects` (chaveado pela credencial). Telefone vive em `users.phone`,
`users.linkedPhones[]`, no Auth (`phoneNumber`), no e-mail sintético derivado do número, e
tem **procedência própria** em `phoneSource`/`phoneSetBy`/`phoneSetAt` — é ela que decide se
o número vale como identidade ou só como contato. Nome vive em `displayName` e no rótulo
gravado em slots/inscritos. Uid vive no doc, em `playerUids`/`memberUids`, na lápide
`mergedInto` e em `loginRedirects`. ⚠️ Cada duplicação tem dono declarado — o problema
conhecido não é a duplicação em si, é quando duas autoridades escrevem a mesma projeção
(foi o que a 4ª auditoria fechou em `friends[]`, hoje campo privilegiado).

**(8) Concorrência e retries.**
- *Dois pedidos simultâneos do mesmo par (uid, e-mail):* fechado pela transação da reserva —
  a concorrente é abortada, re-executa, lê o throttle recém-gravado e cai no cooldown.
- *Dois cliques no mesmo link:* fechado — `used` e o vínculo na mesma transação.
- *Retry do gatilho:* o id de outbox é derivado da reserva, então a re-execução reescreve o
  MESMO documento.
- *Merge simultâneo:* `_provaDePosseDeOld` é conferida **antes e depois** do lock
  (`functions/index.js:6239-6245`) — antes, o lock era adquirido primeiro e uma chamada sem
  prova já marcava `merging` em duas contas alheias.
- *Exclusão:* `deleteAccount` roda sob a posse que já existe e finaliza o lifecycle **pelo
  fato gravado**, não por "deu erro" (`functions/index.js:5666`).
- ⚠️ *Ainda em aberto:* `notifications` aceita `create` de qualquer autenticado, e
  `_enqueueMail` usa `.add()` sem idempotência em seis caminhos (dívida já registrada na L1.2).

**(9) Legado e o bundle nativo 2.1.28.** ⛔ **Achado novo e verificável.** O pacote embarcado
está em `SCOREPLACE_VERSION = '2.1.28'`; a L1.1 saiu na **2.1.65** e a L1.2 na **2.1.77**.
Comparação direta dos arquivos:

| Marcador | Web (main) | `android/.../js` e `ios/.../js` |
|---|---|---|
| `requestSecondaryEmail` (caminho servidor) | 2 ocorrências | **0** |
| `collection('emailVerifications')` (escrita direta) | 0 | **2** |
| `collection('mail')` real | 0 (só a lápide em comentário, `firebase-db.js:2960`) | **presente em `firebase-db.js` e `views/auth.js`** |
| `_checkEmailLinkIntent` (fallback removido) | 0 | **3** |

⇒ O app das lojas ainda executa o fluxo ANTIGO, e as Rules que ele precisa já estão fechadas
(`emailVerifications` e `/mail` = `if false`). Pelo código, vincular e-mail secundário e os
três fluxos de convite por e-mail **não têm como funcionar** no app publicado.
⚠️ Acúmulo sem limpeza: `magicLinks` tem varredura agendada (`functions/index.js:1592`), mas
`emailVerifications`, `emailVerifyThrottle`, `emailVerifyCodes`, `mergeTokens` e
`mergeProofLimits` **não têm nenhuma** — documentos expirados ficam para sempre (invisíveis,
já que as Rules são deny-all, mas ficam).

**(10) Testes, lacunas e gates.** A cobertura de identidade é a mais densa do repositório —
`email-secundario-server-only` (8 blocos: token, pedido, confirmação, template, Rules,
cliente, contrato das Functions, atomicidade), `rules-privileged-fields`, `login-redirect`,
`merge-federated-wins`, `perfil-mesclado-hidrata-na-chave`, `lapide-nunca-vence-a-conta-viva`,
`user-vivo-no-servidor`, `identidade-e-uid-nunca-email`, `duplicata-nomeia-o-canal`, mais 12
suítes `functions/test-*`. **As lacunas medidas:**

| Lacuna | Evidência |
|---|---|
| `rules-privileged-fields` cobre **4 dos 15** campos | asserções só para `mergedInto`, `mergedAt`, `plan`, `planExpiresAt`; **zero** para os outros 11 (`dupDismissed`, `dupDismissedInfo`, `dupSuspect`, `nameConflict`, `phoneSource`, `phoneSetBy`, `phoneSetAt`, `friends`, `friendRequestsSent`, `friendRequestsReceived`, `friendRequestsSentAt`) |
| Nada trava "cliente não escreve privilegiado" | a varredura desta leva deu zero, mas é conferência manual: um `payload.plan` novo passaria verde |
| Remoção de e-mail secundário sem cobertura | `email-secundario-server-only` não cita `_profileUnlinkEmail`, `unlink` nem remoção |
| Nenhum teste de Rules para `users`, `notifications`, `presences`, `magicLinks` | os 7 `rules-*.test.js` não cobrem essas quatro |
| Nenhum gate de paridade web × bundle nativo | a divergência do item (9) não é detectada por nada |

**Classificação exigida pela leva.**

*DECISÃO JÁ ADOTADA (registro, não mudança).* (a) Token, template e destinatário do e-mail
secundário são do servidor; o cliente só pede e confirma. (b) A confirmação **não exige
sessão** — o link chega na caixa e a posse do token é a prova; o destino sai do registro.
(c) `linkedEmails` **não** entrou na lista de privilegiados quando a L1.1 fechou o fluxo.
(d) Não existe unicidade de e-mail entre contas, de propósito. (e) `matchHistory`, `trophies`
e `milestones` têm leitura governada por `statsVisibility`, com ausente = público.

*PROBLEMA ABERTO.* (a) **`linkedEmails` é prova de posse e é escrito pelo cliente.** O
servidor o aceita como prova numa fusão (`functions/index.js:6262-6264`, `via:
"email-vinculado"`) e resolve conta por ele (`_uidByProfileEmail:4287` →
`_resolveAccount:4340` → `checkAccount`, login por senha e reset). A adição passou a ser
server-only na L1.1, mas a **remoção** continua sendo um `users/{uid}.update({linkedEmails})`
direto do cliente (`js/views/auth.js:9626`), e a mesma Rule que permite remover permite
gravar **qualquer** array. ⚠️ Escopo honesto do que isso alcança: `_resolveAccount` tenta o
**Auth primeiro**, então um endereço que já é e-mail primário de alguma conta não é
alcançado por esse caminho; e ninguém escreve no perfil alheio (update é owner-only).
O próprio repositório já documenta a tensão em `functions/index.js:4687`. (b) **Qualquer
autenticado lê o perfil inteiro de qualquer pessoa**, PII incluída. (c) **Qualquer
autenticado cria notificação na caixa de qualquer pessoa** (`firestore.rules:660`). (d) O app
das lojas roda o fluxo de identidade pré-L1 contra Rules pós-L1. (e) Coleções efêmeras de
identidade sem limpeza. (f) `mergeTokens`/`mergeProofLimits` são server-only por
**default-deny**, não por regra escrita.

*HIPÓTESE PENDENTE.* (a) Que o vínculo de e-mail secundário e os convites por e-mail estejam
**de fato falhando** hoje no app das lojas. O código diz que sim; **não foi medido** — esta
leva proibiu consultar produção. Seria verificável por `permission-denied` no Sentry ou por
contagem de `emailVerifications` criadas por origem. (b) Que exista documento legado em
`emailVerifications` com o token CRU como id (do fluxo pré-L1.1) ainda não expirado — não
medido.

*PROPOSTA FUTURA — não formulada.* Nenhum texto de Rule, nenhuma capability e nenhum desenho
de privacidade foi escrito aqui. ⛔ E vale o mesmo bloqueio da L2/L3.P2: qualquer mudança de
Rule nesta área atinge o app 2.1.28 no instante do deploy, e a decisão é do dono.

**L4.P1 — medição read-only de perfis, identificadores e retenção (31/ago/2026).**

*Método.* Admin SDK sob credencial padrão do `gcloud`, só `.get()`, **saída exclusivamente
agregada** — nenhum uid, nome, e-mail, telefone, token ou id de documento saiu de um contador.
As comparações entre perfis foram feitas **em memória e sobre o sha256 do valor normalizado**,
nunca sobre o valor em claro. Cada execução abre com um controle (`tournaments`) e aborta se
vier vazio; qualquer erro sai com código 1 e a frase *"não é zero, é ausência de resultado"*.
⛔ Nada foi explorado, testado contra conta alheia nem escrito.

**(1) `users` — 266 documentos.** 251 vivos, **15 lápides de fusão** (`mergedInto`), **0
lápides de exclusão** (`deleted:true`).

| Campo | Presente | Tipo | Ausente |
|---|---|---|---|
| `email` | 248 | string | 18 |
| `email_lower` | 247 | string | 19 |
| `linkedEmails` | **14** | array | 252 |
| `linkedPhones` | **9** | array | 257 |
| `phone` | 177 | string | 89 |
| `fcmToken` | 41 | string | 225 |
| `preferredCeps` | 44 | ⚠️ **3 array + 41 string** | 222 |
| `statsVisibility` | 50 | string | 216 |
| `mergedInto` | 15 | string | 251 |

Cardinalidade (sem valores): `linkedEmails` → 12 perfis com 1 entrada e **2 com array vazio**;
`linkedPhones` → 9 perfis com 1; `preferredCeps` → os 3 arrays estão **vazios**.
`statsVisibility`: ausente 216 (**→ público, pelo padrão adotado**), `public` 47, `private` 2,
`friends` 1. ⚠️ `preferredCeps` existe em **dois tipos** no mesmo campo — 41 string e 3 array
vazio; nenhum array com conteúdo.

**(2) `linkedEmails` — o campo é pequeno e está limpo.** 14 perfis têm o array, **12 entradas
no total**, **0** vazias ou de tipo errado, **0** malformadas pelo teste de forma do próprio
core, **0** duplicatas normalizadas dentro do mesmo perfil e **0 identificadores normalizados
aparecendo em mais de um perfil**. ⭐ Também medido para comparação: o **e-mail principal**
(`email_lower`/`email`) tem **0** colisões entre perfis, inclusive contando lápides.

*Extra — `linkedPhones`, mesma pergunta.* 9 perfis, 9 entradas, **2 identificadores em 2+
perfis, envolvendo 4 perfis**. ⚠️ Quebrando por classe: **0 entre perfis VIVOS**; os 2 casos
são **vivo + lápide**, exatamente o que `functions/user-vivo-core.js:9-13` documenta — a fusão
não apaga a conta absorvida, e o doc morto fica com o mesmo identificador. Não há ambiguidade
real entre contas vivas; há a lápide que `_userVivo` existe para atravessar.

**(3) Coleções efêmeras de identidade.**

| Coleção | Total | Estado (semântica real de cada uma) |
|---|---|---|
| `emailVerifications` | 17 | 14 expirados · 3 dentro do prazo · 3 consumidos (`verified`) |
| `emailVerifyThrottle` | **0** | vazia |
| `emailVerifyCodes` | 4 | **4 expirados**, nenhum vivo |
| `magicLinks` | 1 | 1 dentro do prazo |
| `mergeTokens` | 9 | **9 expirados**; 7 consumidos, 2 nunca usados |
| `mergeProofLimits` | 1 | janela de 1 h **vencida** |
| `pendingEmailVerifications` (⭐ superfície não catalogada na L4.P0) | **0** | vazia |

⛔ **Formato dos ids de `emailVerifications`: 0 no formato sha256 de 64 hex, 17 fora dele.**
Nenhum id foi impresso — só a contagem. ⭐ E o schema confirma pelo outro lado: os 17 têm
`ownerUid`, `ownerName`, `emailToVerify`, `createdAt`, `expiresAt`, `verified` (e `verifiedAt`
em 3); **nenhum** tem `used` nem `origem`, que `secondary-email-core.js:87-88` grava em todo
registro do fluxo novo. Idade por `createdAt`: 3 com menos de 24 h, 11 entre 7 e 30 dias, 3
entre 30 e 90 dias — todos com 24 h de prazo declarado.
⇒ **Os 17 documentos são do fluxo PRÉ-L1.1, e três deles são de menos de 24 horas.**
⭐ O `emailVerifyThrottle` **vazio** fecha a inferência: a reserva nova grava verificação e
throttle **na mesma transação** (`functions/secondary-email-reserva.js:63-71`); zero throttle
significa que **`requestSecondaryEmail` nunca completou uma reserva em produção**.

*De onde vem esse schema.* Casa campo a campo com
`android/app/src/main/assets/public/js/views/auth.js:9569-9576` (id = token CRU,
`ownerName`, `verified:false`) — código que **não existe mais no `main`** e **existe no bundle
2.1.28 embarcado nas lojas**. ⚠️ Não afirmo qual instalação escreveu; afirmo que o schema é o
do cliente pré-L1.1, e que ele só sobrevive nos bundles nativos.

⭐ **A data em que a porta fechou, lida do próprio projeto (API de Rules, leitura):**

| Ruleset publicado | `emailVerifications` | `/mail` |
|---|---|---|
| 2026-08-26T18:35Z | `allow read: if true` (o buraco antigo) | `allow write: if request.auth != null` |
| 2026-08-31T04:38Z | **`if false`** | ainda `write: if request.auth != null` |
| 2026-08-31T16:25Z (**no ar agora**) | `if false` | **`if false`** |

⇒ Escrita em `emailVerifications` esteve **aberta até 31/ago ~04:38Z**, e `/mail` **até 31/ago
~16:25Z**. É isso que explica, sem contradição, 3 registros do fluxo antigo com menos de 24 h.
⛔ **Consequência mecânica dos 3 registros ainda no prazo:** o id deles é o token CRU; o
`confirmSecondaryEmail` procura `doc(hashToken(token))`
(`functions/index.js:6038`) e nunca casaria; e o caminho antigo, que lia o doc direto, agora é
negado pela regra. Os três links **não têm mais como ser confirmados por nenhum caminho**.
Isso é dedução de código + dado medido, **não** observação de usuário.

⚠️ Retenção: `emailVerifications` (14 expirados), `emailVerifyCodes` (4 expirados) e
`mergeTokens` (9 expirados) **acumulam** — confirmado o que a L4.P0 achou por código: só
`magicLinks` tem varredura agendada.

**(4) Cada campo de PII é mesmo necessário aos leitores autenticados de hoje?** Confirmado por
código, sem propor nada:

| Campo | Existe leitor CROSS-perfil no cliente? | Evidência |
|---|---|---|
| `email` | **Sim** | `window._emailForUid(uid)` lê `_userProfileCache[uid]` (`js/store.js:1170`) |
| `phone` | **Sim** | `window._phoneForUid(uid)` (`js/store.js:1171`) |
| `email_lower` | **Sim** | casa identidade na chave (`js/views/bracket-ui.js:677`) |
| `linkedEmails` | **Sim** | organizador junta contatos dos inscritos (`js/views/tournaments-organizer.js:288`, `:1060`) |
| `mergedInto` | **Sim** | porta da conta viva e recusa de convite (`js/firebase-db.js:2719`, `js/store.js:1063`) |
| `fcmToken` | **NÃO** | escrito só pelo dono (`js/notifications.js:69,100,150`) e lido só por Function (`functions/index.js:5305-5316`); nenhum leitor cliente de perfil alheio |
| `preferredCeps` | **NÃO** | só leitura do próprio perfil (`js/store.js:12395`, `js/views/auth.js:5673`) |
| `statsVisibility` | **NÃO pelo cliente** | quem consulta é a própria Rule, por `get()` server-side (`firestore.rules:statsVisibleToCaller`) — o que não exige permissão de leitura do chamador |
| `linkedPhones` | **nenhum encontrado no cliente** | consumido no servidor (`functions/index.js:4307`) |

⚠️ E o mecanismo importa: `window._preloadUserProfiles` carrega o **documento inteiro** em
lote (`documentId() in [...]`, `js/store.js`), sem projeção — então o cliente que desenha uma
chave recebe todos os campos dos perfis envolvidos, `fcmToken` incluído. ⭐ Mas a leitura
cruzada de nome/e-mail/telefone **não é acidental**: é decisão canônica registrada em
`js/store.js:766-773` — *"o nome/e-mail/telefone exibido é SEMPRE resolvido do perfil vivo,
NUNCA de um campo gravado no inscrito"*. Os dois fatos convivem e é isso que o registro
precisa deixar claro.

**(5) A fronteira de `linkedEmails`, reconfirmada.**
- *ADICIONA (servidor, confirmado):* só `confirmSecondaryEmail`
  (`functions/index.js:6052-6057`), dentro de transação, e a união de perfis na fusão
  (`functions/profile-merge-core.js:188-191`, aplicada em `functions/index.js:6627-6630`).
- *REMOVE (cliente, confirmado):* `window._profileUnlinkEmail`
  (`js/views/auth.js:9626-9640`) — `users/{uid}.update({ linkedEmails })` direto. É a única
  via de remoção do produto; não existe callable de remoção.
- *USA COMO PROVA / RESOLUÇÃO (servidor, confirmado):* `_provaDePosseDeOld`
  (`functions/index.js:6262-6264`, `via: "email-vinculado"`) e `_uidByProfileEmail`
  (`:4287-4288`) → `_resolveAccount` (`:4340`) → `checkAccount` (`:4395`), login por senha
  (`:4511`) e recuperação (`:4562`).
- *Fronteira medida, e é o que muda o tamanho do problema:* o campo tem **12 entradas em 14
  perfis**, **0 colisões entre perfis** e `_resolveAccount` **tenta o Auth primeiro**.
- ⚠️ *Hipótese de exploração — NÃO testada, e não será:* que escrever um endereço alheio no
  próprio `linkedEmails` altere o desfecho de algum desses três caminhos. Não há tentativa
  contra conta nenhuma; fica registrada como pergunta em aberto, não como fato.

**Classificação.**

*DECISÃO JÁ ADOTADA (confirmada pelo dado).* (a) `statsVisibility` ausente = público — 216 de
266 perfis dependem desse padrão. (b) A lápide de fusão preserva os identificadores da conta
absorvida, e `_userVivo` é a porta que atravessa — as 2 colisões de `linkedPhones` são
exatamente isso. (c) Nome/e-mail/telefone de terceiro vêm sempre do perfil vivo, nunca de
campo gravado (`js/store.js:766-773`).

*PROBLEMA ABERTO (evidência nova).* (a) **`emailVerifyCodes` guarda o e-mail em claro**
(`functions/index.js:2144`) e os 4 documentos existentes estão expirados e não são apagados.
(b) `emailVerifications`, `emailVerifyCodes` e `mergeTokens` acumulam expirados —
27 documentos hoje, sem varredura. (c) `preferredCeps` existe em **dois tipos** no mesmo
campo. (d) `fcmToken` e `preferredCeps` são legíveis por qualquer autenticado **sem nenhum
leitor cliente que precise deles**. (e) ⛔ **`magicLinks` tem `allow read: if true` numa
regra de documento curinga.** Em Rules do Firestore, `read` cobre `get` **e** `list`; para
liberar só o acesso por token seria preciso `allow get`, e o projeto **não usa `allow get` em
lugar nenhum** (conferido no arquivo inteiro). O documento guarda `firebaseLink` — o link
assinado de entrada — e o `email`. ⚠️ Fato aqui é o **texto da regra**; que uma listagem
retorne documentos **não foi testado** e não será. (f) `pendingEmailVerifications` guarda
`email` e `name` e **não tem bloco nas Rules** (server-only por default-deny, como
`mergeTokens`).

*HIPÓTESE PENDENTE — agora com data.* A L4.P0 supôs que o app das lojas estivesse rodando o
fluxo pré-L1 contra Rules pós-L1. O dado mostra que, até **31/ago ~04:38Z**
(`emailVerifications`) e **~16:25Z** (`/mail`), a regra ainda **permitia** — então o fluxo
antigo vinha funcionando, e é a partir de agora que ele não funciona mais. ⏳ **Não medido:**
quantas pessoas tentam esses caminhos a partir de hoje. Verificável por `permission-denied`
no Sentry, sem tocar em dado pessoal.

*PROPOSTA FUTURA — não formulada.* Nenhuma Rule, nenhuma capability, nenhuma política de
retenção proposta aqui. ⛔ E continua valendo o bloqueio de corte nativo: o bundle 2.1.28 não
recebe atualização, e agora há duas portas fechadas debaixo dele.

**Limitações desta medição.** (1) Retrato de 31/ago/2026; `users` tem 266 documentos e nada
aqui projeta o futuro. (2) O Admin SDK **ignora as Rules** — a medição diz o que o dado é, não
o que um cliente conseguiria. (3) A leitura não é transacional. (4) A cronologia dos rulesets
sai da API de Rules do projeto, que lista os publicados; não prova o que rodou em cada
requisição. (5) Nenhuma tentativa de exploração foi feita, aqui ou em qualquer etapa.

**L4.P2 — as fronteiras atuais, caracterizadas no emulador (31/ago/2026).**

*Método.* Emulador Firestore carregando **o `firestore.rules` do repositório**, dirigido por
REST com JWT não-assinado (o mesmo driver dos `tests/rules-*.test.js`), três sujeitos —
**anônimo** (sem cabeçalho), **A** e **B** autenticados — e um quarto de semeadura
(`Bearer owner`, bypass de admin do emulador) só para criar documentos que as Rules impedem o
cliente de criar. **100 sondas.** Dados 100% sintéticos (`@naoexiste.invalid`, uids
`uid*_sintetico`, `firebaseLink` fictício). Driver e config viveram num diretório temporário
**fora do repositório** e foram apagados ao fim, junto com o `firestore-debug.log` gerado.
⛔ Nada de produção foi lido, escrito ou tentado. Códigos: **200 = permitido, 403 = negado**.

**(1) `users` — o que um autenticado alcança no perfil alheio.**

| Sonda | Código | Leitura |
|---|---|---|
| A faz `get` do perfil completo de B | **200** | permitido |
| A faz `list` da coleção `users` | **200** | ⛔ **permitido — a base de perfis é enumerável** |
| A faz `runQuery` em `users` | **200** | ⛔ permitido |
| anônimo faz `get` do perfil de B | 403 | negado |
| anônimo faz `list` de `users` | 403 | negado |
| A grava no PRÓPRIO `linkedEmails` um array arbitrário de 3 endereços | **200** | permitido |
| A grava `linkedEmails` de B | 403 | negado |
| A cria o próprio perfil (documento novo) | 200 | permitido |
| A cria perfil com id de OUTRO uid | 403 | negado |
| A atualiza o próprio perfil | 200 | permitido |
| A apaga o próprio perfil | 200 | permitido |
| A apaga o perfil de B | 403 | negado |

⭐ **Os 15 campos privilegiados, um por um, em UPDATE e em CREATE: 30 sondas, 30 × 403.**
`mergedInto`, `mergedAt`, `plan`, `planExpiresAt`, `dupDismissed`, `dupDismissedInfo`,
`dupSuspect`, `nameConflict`, `phoneSource`, `phoneSetBy`, `phoneSetAt`, `friends`,
`friendRequestsSent`, `friendRequestsReceived`, `friendRequestsSentAt` — **todos negados nas
duas operações**. Isto fecha, com execução, a lacuna que a L4.P0 mediu: o teste permanente
(`tests/rules-privileged-fields.test.js`) só afirma 4 desses 15.

**(2) `magicLinks` — a hipótese da L4.P1 está CONFIRMADA.**

| Sonda | Anônimo | Autenticado |
|---|---|---|
| `get` por id | **200** | **200** |
| `list` da coleção | **200** | **200** |
| `runQuery` | **200** | **200** |
| escrita | 403 | 403 |

⛔ **`allow read: if true` numa regra de documento curinga libera `list`, não só `get`** — a
coleção inteira é **enumerável sem credencial nenhuma**. A L4.P1 tinha registrado isso como
leitura do texto da regra e marcado explicitamente que a listagem **não havia sido testada**;
agora foi, contra as Rules reais, e o resultado é 200. O comentário da própria regra
(`firestore.rules:914-920`) justifica a abertura com *"Token é 24 chars random base64url —
segredo suficiente pra leitura pública (igual unlisted YouTube link)"* — raciocínio que vale
para `get`, e que a enumeração contorna. O documento guarda `firebaseLink` (o link assinado de
entrada) e `email`; a L4.P1 mediu **1 documento dentro do prazo** em produção.
⚠️ **Nenhuma tentativa foi feita contra produção, e não será.** O que está provado é a
fronteira da regra no emulador, com documento sintético.

**(3) Coleções de identidade server-only — 60 sondas, 60 × 403.**
`emailVerifications`, `loginRedirects`, `mergeTokens`, `mergeProofLimits` e
`pendingEmailVerifications`, cada uma em `get`, `list`, `runQuery`, `create`, `update` e
`delete`, para anônimo **e** autenticado: **tudo negado**. ⭐ Confirma que
`pendingEmailVerifications` e `mergeProofLimits`, que **não têm bloco escrito nas Rules**,
estão de fato cobertas pelo default-deny — server-only por ausência, e a ausência funciona.

**(4) `users/{uid}/notifications` — a fronteira é assimétrica, e é exatamente a que a regra diz.**

| Sonda | Código |
|---|---|
| A **cria** notificação na caixa de B | **200** |
| A lê a notificação de B | 403 |
| A lista a caixa de B | 403 |
| A altera a notificação de B | 403 |
| A apaga a notificação de B | 403 |
| B lê a própria | 200 |
| anônimo cria na caixa de B | 403 |

⇒ Qualquer autenticado **deposita** na caixa de qualquer pessoa, com conteúdo escolhido por
ele, e não consegue ler nem desfazer nada. A L4.P0 tinha lido isso da regra
(`firestore.rules:660`); aqui está executado.

**(5) Confronto com o texto das Rules.** Tudo bateu, com uma diferença de **alcance**, não de
intenção: o comentário de `users` diz que a leitura autenticada *"strips PII from anonymous
visitors"* — e o anônimo está mesmo barrado (403 em `get` e em `list`). O que o comentário não
diz é que o autenticado tem **`list` e `runQuery`**, não só `get` dirigido: a base inteira de
perfis é enumerável por qualquer conta logada, com `email`, `phone` e `fcmToken` dentro. Mesma
diferença em `magicLinks`: a regra pretende "quem tem o token lê", e o que ela concede é "quem
quiser lista".

**Classificação.**

*DECISÃO JÁ ADOTADA, agora com prova executável.* (a) Os 15 campos privilegiados estão
fechados no create **e** no update — 30/30 negados. (b) Perfil é do dono: criar, atualizar e
apagar cross-user são negados; anônimo não lê perfil. (c) As cinco coleções de identidade
server-only são deny-all completo, inclusive as duas que dependem só do default-deny.
(d) `linkedEmails` do PRÓPRIO perfil é escrivível pelo cliente com array arbitrário (200) e o
cross-user é negado (403) — a fronteira que a L4.P0/P1 descreveu está confirmada nos dois
sentidos.

*PROBLEMA ABERTO (evidência nova desta etapa).* (a) **`magicLinks` é enumerável por anônimo**
(`list` e `runQuery` = 200), e cada documento carrega o link assinado de entrada e um e-mail.
Deixa de ser hipótese. (b) **`users` é enumerável por qualquer autenticado** (`list` e
`runQuery` = 200) — a L4.P0 tinha registrado a leitura do documento inteiro; agora está claro
que também não há barreira para varrer a coleção. (c) A caixa de notificações de qualquer
pessoa aceita depósito de qualquer autenticado.

*HIPÓTESE PENDENTE.* Que alguém já tenha enumerado qualquer uma das duas coleções. **Não
medido e não mensurável por este caminho** — exigiria log de acesso do Firestore, que não foi
consultado. ⛔ Nenhuma tentativa contra produção foi feita.

*PROPOSTA FUTURA — não formulada.* Nenhuma Rule, nenhuma capability, nenhuma mudança de
produto foi escrita nesta etapa, como a leva exigiu. ⚠️ E continua valendo o bloqueio de corte
nativo: o bundle 2.1.28 não recebe atualização, e qualquer mudança de Rule vale para todos no
instante do deploy.

*Limitações.* (1) O emulador aplica o mesmo motor de Rules, mas não é a produção; o que está
provado é o comportamento **das regras**, com dado sintético. (2) As sondas cobrem as
operações pedidas na leva; outras coleções e outras formas de consulta não foram exercitadas.
(3) O Admin SDK ignora Rules — nada aqui diz respeito aos caminhos server-side.

**L4.P3 — inventário de `magicLinks` e o que um corte de enumeração atingiria (read-only, 31/ago/2026).**

⚠️ *Nota de método, e ela vale para todas as levas.* O `grep` recursivo deste ambiente é um
wrapper de `ugrep` com **`--ignore-files`**: ele **respeita o `.gitignore`**, e os bundles
embarcados estão ignorados (`android/.gitignore:96`, `ios/.gitignore:4`). Medido agora:

| Termo | `grep -r` (árvore versionada) | Walker real | Escondidos |
|---|---|---|---|
| `casualMatches` | 19 | 61 | **42** |
| `linkedEmails` | 18 | 26 | 8 |
| `emailVerifications` | 6 | 10 | 4 |
| `magicLinks` | 3 | 7 | 4 |

⭐ As varreduras estruturais das L3.P0.1 e L4.P0 foram feitas com **walker em Node** e não são
afetadas; os confrontos com o bundle nativo usaram **caminho explícito**, que atravessa o
filtro. O que fica corrigido é o alcance dos **censos de arquivo** feitos com `grep -rln`:
eles descrevem a árvore **versionada**, não o disco. O inventário abaixo usa o walker.

**(1) Writers, readers e consumidores — a superfície inteira são 7 arquivos.**

| Papel | Camada | Onde |
|---|---|---|
| Writer — link de LOGIN | Function (callable) | `sendMagicLink`, `functions/index.js:1776`; grava em `:1818` |
| Writer — link de CONFIRMAÇÃO de conta | Function (interno) | `_wrapVerificationLink`, `functions/index.js:2034`; grava em `:2038` |
| Quem chama o 2º writer | Function | `_queueVerificationEmail` (`:2052`), usado em `:2086` e em `:2220` (`drainPendingVerifications`) |
| Quem pede o 1º writer | Cliente web | `js/views/auth.js:2421-2422` e o reenvio em `:2457-2458` (`httpsCallable('sendMagicLink')`) |
| Reader / consumidor | **Cliente web** | `js/views/auth.js:56` — `collection('magicLinks').doc(token).get()` |
| Reader / consumidor | **Bundle Android** | `android/app/src/main/assets/public/js/views/auth.js:56` |
| Reader / consumidor | **Bundle iOS** | `ios/App/App/public/js/views/auth.js:56` |
| Reader / consumidor | staging do Capacitor | `www/js/views/auth.js` |
| Limpeza | Function agendada | `cleanupOldMagicLinks`, `functions/index.js:1581`; query em `:1592` |
| Exclusão da varredura de uid | Function (config) | `functions/merge-collections-core.js:50` — *"token de login, efêmero"* |
| Script / gatilho / extensão | — | **nenhum** |

**(2) Que forma de leitura cada caminho exige — provado, não inferido.**
Existe **uma única leitura em todo o produto**, e ela aparece em 4 cópias do mesmo arquivo:
`db.collection('magicLinks').doc(token).get()`. ⭐ **Não há um só `where`, `list`, `runQuery`
ou `orderBy` sobre `magicLinks` em lugar nenhum** — nem no cliente, nem nas Functions, nem em
script, nem em teste (walker sobre todo o disco). A única query da coleção é server-side, no
`cleanupOldMagicLinks` (`where("expiresAt","<",now)`), que roda com Admin SDK e **ignora as
Rules**.

| Requisito | Precisa? | Prova |
|---|---|---|
| `get` por token conhecido | **Sim** | `js/views/auth.js:56` e as 3 cópias |
| `list` | **Não** | nenhuma ocorrência no disco |
| query | **Não** pelo cliente | a única é a da limpeza, com Admin SDK |
| leitura autenticada | **Não** | quem clica o link ainda não entrou — é o que o fluxo existe para fazer |
| leitura anônima | **Sim, obrigatória** | o resolver roda antes de qualquer login (`js/views/auth.js:22-29`) |

**(3) O que o documento guarda, por quanto tempo e quem revoga.**

| Campo | Origem | Sensibilidade |
|---|---|---|
| `firebaseLink` | `generateSignInWithEmailLink` (`:1799`) ou `generateEmailVerificationLink` | ⛔ **link ASSINADO de entrada** — carrega o `oobCode` |
| `email` | endereço do pedido | PII; o cliente ainda o grava em `localStorage` (`js/views/auth.js:75`) |
| `kind` | só o writer de confirmação escreve (`"verify"`) | baixa |
| `createdAt` / `expiresAt` | `serverTimestamp()` e `new Date(...)` | baixa |

*Id do documento:* `crypto.randomBytes(18).toString('base64url')` → 24 caracteres, 144 bits
(`:1816` e `:2036`). *Prazos, e são DOIS na mesma coleção:* login = **90 min** (`:1824`);
confirmação = **24 h** (`:2043`).
⛔ **Consumo e revogação: o app não faz nenhum dos dois.** O resolver **lê e redireciona** —
não apaga, não marca. Não existe campo `used`, `consumedAt` ou equivalente (confirmado no dado:
os documentos têm exatamente 5 chaves). A única autoridade que consome é o **Firebase Auth**,
pelo uso único do `oobCode` e pelo prazo próprio dele. O documento do Firestore sobrevive ao
uso e só sai pela limpeza.
⚠️ *E a limpeza roda menos do que o comentário diz.* O texto em `functions/index.js:1579`
promete *"3x ao dia (04:30, 12:30, 20:30 BRT)"*, mas o `schedule` é
**`"every day 04:30"`** (`:1583`) — **uma vez por dia**. Um documento vencido pode ficar até
~24 h além do prazo; para um `kind:"verify"` (24 h), até ~48 h de presença total.

**(4) Compatibilidade nativa — o ponto que decide qualquer corte futuro.** O bundle 2.1.28
**usa** `magicLinks`: `android/.../auth.js:56` e `ios/.../auth.js:56`, e o trecho do wrapper
(linhas 20-90) é **idêntico ao do web** — conferido por `diff`, sem diferença. ⭐ E ele depende
**apenas de `get` por id**: não há `list` nem query no bundle, exatamente como no web.

**(5) Produção, só agregados (nenhum id, token, e-mail, uid ou URL impresso).**
`magicLinks` = **1 documento**: `kind=verify`, prazo declarado de **1440 min**, **ainda
válido**, `createdAt` e `expiresAt` ambos `Timestamp(Firestore)`, e exatamente 5 chaves
(`createdAt`, `email`, `expiresAt`, `firebaseLink`, `kind`). **Consumidos: não há como
contar** — o schema não tem marcador de consumo, e isso é resultado, não lacuna de medição.
⭐ Coleções irmãs limpas pelo mesmo job: `gateTokens` e `gateVerifications` estão **vazias** e
**não têm bloco nas Rules** — cobertas pelo default-deny, ao contrário de `magicLinks`.

**(6) Testes: zero. Medido, não estimado.** Walker sobre `tests/` e `functions/test-*.js`
procurando `magicLink`, `?ml=`, `?vt=`, `wrapVerification` e `sendMagicLink`: **nenhum
arquivo**. Nenhum dos 13 specs de Playwright cita magic link. As lacunas que a leva pediu para
levantar (**sem escrever os testes**):

| Lacuna | O que precisaria provar | Existe hoje |
|---|---|---|
| Acesso público por token conhecido | anônimo faz `get` do próprio token e o resolver redireciona | **não** |
| Negação de enumeração pública | anônimo NÃO consegue `list`/`runQuery` | **não** (a L4.P2 mediu o contrário: 200) |
| Consumo / retry / expiração | 2º clique, link vencido, `expiresAt` passado, doc ausente | **não** |
| Compatibilidade web × nativa | os dois bundles exercitam o mesmo caminho de `get` | **não** |
| Prazo dos dois tipos | 90 min no login, 24 h na confirmação | **não** |
| Limpeza agendada | remove vencido e preserva válido | **não** |

**Classificação.**

*DECISÃO JÁ ADOTADA.* (a) O wrapper existe porque **scanners de e-mail queimavam o `oobCode`
antes da pessoa** — 7 contas travadas em jul/2026 (`functions/index.js:2026-2031`). A leitura
anônima por token é o mecanismo dessa correção, não um descuido. (b) A mesma coleção atende
login e confirmação de conta, de propósito — *"Reusa a coleção magicLinks — mesmas rules e
mesmo cleanup"* (`:2031-2033`). (c) `magicLinks` está fora da varredura de uid da fusão.

*PROBLEMA ABERTO.* (a) A regra concede `list` e `runQuery` (provado na L4.P2) enquanto o
produto **inteiro** precisa só de `get` — a diferença entre o que a regra dá e o que o código
usa está medida nos dois lados. (b) O documento **não é consumido nem revogável pelo app**: só
o `oobCode` tem uso único, por autoridade do Firebase. (c) A limpeza roda **1×/dia**, não 3×,
e o comentário afirma o contrário. (d) Cobertura de teste **zero** para todo o fluxo de acesso
por link. (e) O `email` do documento é copiado para o `localStorage` do dispositivo
(`js/views/auth.js:75`) — é o que faz o `signInWithEmailLink` completar sem perguntar.

*HIPÓTESE PENDENTE.* Que exista algum consumidor de `list`/query fora do repositório
(ferramenta interna, console, integração). Não há indício, e **não é verificável por leitura
de código** — só por log de acesso do Firestore, que não foi consultado.

*PROPOSTA FUTURA — não formulada.* ⛔ Nenhuma Rule escrita, nenhuma capability desenhada,
nenhum cutover proposto. O que esta etapa entrega é o alcance exato: **um corte de enumeração
atingiria 4 cópias de uma única chamada, todas `get` por id, e nenhuma delas mudaria de
forma** — mais os dois bundles das lojas, que executam esse mesmo `get` e continuam sem
receber atualização.

**L4.P4 — CONCLUÍDA E PUBLICADA (2.1.78, 31/ago/2026).** Registro do que foi feito; as
P0–P3 acima ficam como estão.

*Problema corrigido:* **enumeração pública de `magicLinks`**. A regra era
`allow read: if true` numa regra de documento curinga — e `read` é `get` **e** `list`, o que
liberava varrer a coleção inteira sem token e sem conta, num documento que guarda o
`firebaseLink` assinado e o `email`.

*Decisão adotada:* **`get` público por token conhecido, `list` negado**. A regra passou a
`allow get: if true; allow list: if false; allow write: if false`. Preserva exatamente o que
o produto usa — o clique no link do e-mail, que chega sem sessão — e tira o que ninguém usa.

*Gates que passaram a existir:*
1. `tests/rules-magiclinks-sem-enumeracao.test.js` — 17 asserções contra as Rules reais no
   emulador, anônimo **e** autenticado: `get` permitido, `list` e `runQuery` negados,
   `create`/`update`/`delete` negados, mais controle de sanidade em `loginRedirects`.
   Entrou no `npm run test:rules` e no catálogo da L15 (605 arquivos, `test:rules=7`).
2. `scripts/check-magiclinks-get-only.js` — trava estática no `npm test`, provando nos
   **três clientes** (web, Android, iOS; e `www/`) que toda leitura é `.doc(token).get()`.
   ⚠️ Ela **anda o disco** em vez de usar `grep -r`, pela razão medida na L4.P3.
   Verificada por sonda plantada: acusa e sai 1.
3. **Controle contra `94f7d9cf`** — a mesma suíte, rodada com o `firestore.rules` daquela
   árvore, **falha em 4**: `list` e `runQuery`, anônimo e autenticado, todos 200 lá. E o
   `get` anônimo passa nos dois lados, provando que o corte não tirou o que o produto usa.

*Publicado:* versão **2.1.78**, commit **`2c8cb628`**, ruleset
**`9a65fc58-55a4-40bd-bb5a-50f53edd23ae`** (release `cloud.firestore`, 31/ago/2026 20:30 UTC).
Hosting e Rules apenas — Functions, autodraw, Stripe e bundles nativos não foram publicados.

**L4.P5 — mapa da leitura cruzada de perfis (read-only, 31/ago/2026).**

*Método.* Walker sobre o disco (não `grep -r`, pelo motivo da L4.P3), cobrindo web,
`android/`, `ios/`, `www/`, `functions/`, `scripts/` e `tests/`. Nenhum dado de produção foi
lido nesta etapa: tudo abaixo sai do código.

**(1-2) Quem lê perfil de terceiro, por origem.**

| Origem | Onde | Chave da consulta | Campos efetivamente usados |
|---|---|---|---|
| Próprio perfil | `js/views/auth.js` (13 `doc(uid)`), `js/store.js:1111`, `terms-acceptance.js:195` | `doc(meuUid)` | o documento do próprio dono |
| Participante / chaveamento | `js/store.js` (`_preloadUserProfiles` → cache), `participants.js` (10 usos do cache), `tournaments-draw.js`, `liga-substitution.js`, `bracket-ui.js` (4) | `documentId() in [...]` em lotes de 10, ou `doc(uid)` | `displayName`, `photoURL`, `gender`, `birthDate`, `skillBySport`, `defaultCategory` |
| Busca de pessoas | `js/firebase-db.js:2669`/`:2676` (`searchUsers`) | `displayName_lower` e **`email_lower`** (prefixo) | ⭐ projetados por `PUBLIC_FIELDS` (10 campos) |
| Sugestões do Explore | `js/firebase-db.js:2505` (`listRecentUsers`) | `updatedAt`/`createdAt >= corte` | ⛔ **documento INTEIRO, sem projeção** |
| Lista de convidáveis (#explore e #todas-pessoas) | `js/firebase-db.js:2693` (`listInvitableUsers`) ← `explore.js:205`, `:759`, `todas-pessoas.js:57` | ⛔ **`collection('users').limit(2000).get()` — varredura da coleção** | projetados por um `PUBLIC_FIELDS` próprio, de **12** campos (os 10 da busca + `city` + `preferredLocations`) |
| Homônimo / nome em uso | `js/firebase-db.js:2539`, `:2570`, `auth.js:9884` | `displayName_lower` | `displayName`, `email`, `phone`, `photoURL`, `mergedInto` |
| Organizador | `tournaments-organizer.js:134`, `:382`, `:1238`, `:288`, `:1060` | `email` | `email`, `phone`, `linkedEmails` (lista de contato e disparo) |
| Amizade | `js/views/explore.js` (5 `loadUserProfile`) | `doc(uid)` | `displayName`, `email` |
| Login / identidade | `auth.js:2557`, `:2882`, `:4644`, `:8373`; `store.js:12276`, `:12280`; `dashboard.js:5355`, `:5359` | `email_lower`, `email`, `phone`, `displayName_lower` | uid (via `_userVivo`), `displayName`, `email` |
| Notificações | `_sendUserNotification` ← `tournaments-organizer.js` | `doc(uid)` | `email` + `linkedEmails`, `notificationPrefs` |
| Transferência de organização | `host-transfer.js:258`, `:547`, `:553` | `email`, `displayName` | uid + `displayName` |
| Relatório de inscritos | `tournaments-enrollment-report.js:295`, `:309` | `email`, `displayName` | uid + rótulo |
| Troféus / ranking | `trophies.js:1147`, `tournaments.js:4600` | `documentId() in [...]` | `_rankStats`, `_trophyIds`, `displayName` |
| letzplay | `store.js:740` | `letzplayHandle` | uid |
| Árbitros | `arbitros.js:261` | `doc(uid)` | rótulo |
| Conta viva | `user-vivo-core.js:61` | `doc(uid)` | **`mergedInto`** (segue a lápide) |

⭐ **A projeção do cache é estreita, e isso é evidência nova.** `_preloadUserProfiles`
(`js/store.js`) guarda **8 campos e só eles**, nos dois ramos de carga (lote em
`guardarPerfil:1048-1055` e unitário em `:1105-1124`): `displayName`, `email`, `phone`,
`photoURL`, `gender`, `skillBySport`, `birthDate`, `defaultCategory`. Uid sem documento entra
com os mesmos 8 vazios. ⚠️ Isto **refina** o que a L4.P1 registrou: o documento viaja inteiro
**no fio** (Firestore não projeta), mas o que o app **retém** no cache são esses 8.
⛔ O que **não** é projetado: `FirestoreDB.loadUserProfile` (`js/firebase-db.js:2475`) devolve
`doc.data()` **cru** e é chamado em **30 lugares**; e `listRecentUsers` guarda o documento
inteiro de até 30 desconhecidos recém-ativos.

**(3) Matriz de campos.** "Necessidade demonstrada" = existe consumidor cruzado no código.

| Campo | Leitor cruzado hoje | Escritor | Necessidade demonstrada | PII / prova |
|---|---|---|---|---|
| `displayName` | cache, busca, homônimo, chave, amizade | dono | **sim** — é o rótulo de toda tela | baixa |
| `displayName_lower` | busca e conflito de nome (chave da query) | dono | **sim** | baixa |
| `photoURL` | cache, busca, chave | dono | **sim** | baixa |
| `email` | organizador, amizade, login, homônimo, 8 queries por igualdade | dono | **sim** | ⛔ PII |
| `email_lower` | `searchUsers` (prefixo), resolução de login | dono | **sim** | ⛔ PII |
| `phone` | organizador, homônimo, `auth.js:2882`, `:8373` | dono | **sim** | ⛔ PII |
| `linkedEmails` | organizador (`:288`, `:1060`), disparo de notificação | ⚠️ servidor adiciona, **cliente remove** | **sim**, no disparo | ⛔ PII **e prova de posse** |
| `linkedPhones` | nenhum no cliente | servidor | **não** (cliente) | ⛔ PII |
| `fcmToken` | **nenhum** — só Function (`functions/index.js:5305-5316`) | dono | **não** | ⛔ credencial de entrega |
| `preferredCeps` | só o próprio perfil (`store.js:12395`, `auth.js:5673`) | dono | **não** | ⛔ PII (localização) |
| `birthDate` | `_birthForUid`, categorias | dono | **sim** (categoria por idade) | ⛔ PII |
| `gender` | `_genderForUid`, chave, categorias, duplas mistas | dono | **sim** | ⛔ PII |
| `statsVisibility` | **nenhum leitor cliente** — quem consulta é a Rule, por `get()` server-side | dono | **não** (cliente) | baixa |
| `mergedInto` | `_userVivo`, filtros de lápide, `firebase-db.js:2719` | ⛔ **privilegiado** (só Admin SDK) | **sim** | prova de identidade |
| `skillBySport` | cache, categorias | dono | **sim** | baixa |
| `defaultCategory` | cache, categorias | dono | **sim** | baixa |
| `acceptFriendRequests` | busca e sugestões | dono | **sim** | baixa |
| `preferredSports` | `PUBLIC_FIELDS` da busca | dono | **sim** | baixa |
| `letzplayHandle` | `store.js:740` | dono | **sim** | baixa |
| `createdAt`/`updatedAt`/`lastSeenAt` | sugestões do Explore (chave e ordenação) | dono/servidor | **sim** | baixa |
| `plan`, `phoneCountry`, `preferredLocations` | nenhum cruzado | dono / webhook | **não** | média |

**(4) Android/iOS 2.1.28 — os mesmos campos, nem mais nem menos.** Conferido arquivo a
arquivo: o cache dos bundles projeta **os mesmos 8 campos** (`store.js:780` e `:830` nas duas
cópias), o `searchUsers` tem **o mesmo `PUBLIC_FIELDS` e o mesmo `sanitize`**, e o
`listRecentUsers` guarda o documento inteiro **igual ao web**. ⚠️ Os bundles têm **20**
chamadas `collection('users').doc().get()` contra **17** no web de hoje — o web enxugou
depois da 2.1.28. Nenhuma medição de produção foi necessária para responder isto: o código
respondeu.

**(5) Limitação factual do Firestore, sem propor nada.** As Rules **autorizam documentos, não
projetam campos**: `allow read` decide se o documento inteiro pode ser lido, e não existe
forma de liberar `displayName` e reter `phone` no mesmo documento. Toda restrição de campo
que existe hoje é **client-side** — o `sanitize` da busca e a projeção de 8 campos do cache —
e client-side não é fronteira: quem chama a API direto recebe o documento como ele é. ⛔ O
próprio repositório já registrou isso, em `js/firebase-db.js:2626-2633`: *"Fix em 1 camada
client-side; security rules ainda permitem leitura do doc inteiro — fix definitivo em rules
fica pra round dedicado com testes."* Fica registrado como limitação e como dívida que o
código já reconhecia; **nenhuma solução, coleção, Rule, migração ou capability é proposta
aqui.**

**Classificação.**

*DECISÃO JÁ ADOTADA.* (a) Nome, e-mail e telefone de terceiro vêm **sempre do perfil vivo**,
nunca de campo gravado no inscrito (`js/store.js:766-773`) — é o cânone que torna a leitura
cruzada necessária. (b) A busca de pessoas devolve **projeção**, não o documento
(`PUBLIC_FIELDS`), e a mesma projeção está nos três clientes. (c) O cache de perfil retém 8
campos. (d) A lápide é atravessada por `_userVivo`, nunca usada como pessoa.

*PROBLEMA ABERTO (evidência nova).* (a) ⛔ **`listRecentUsers` não tem o `sanitize` que o
`searchUsers` tem** — as duas alimentam a mesma tela (#explore) e uma guarda o documento
inteiro de até 30 desconhecidos. A mitigação client-side cobre um caminho e não o irmão.
(b) `FirestoreDB.loadUserProfile` devolve o documento cru em **30 chamadas**, enquanto o uso
demonstrado em cada consumidor é de 1 a 4 campos. (c) ⛔ **A permissão de `list` em `users` é LOAD-BEARING, não sobra.**
`listInvitableUsers` (`js/firebase-db.js:2693`) faz `collection('users').limit(2000).get()` —
uma varredura da coleção — para montar a lista de convidáveis do `#explore` e do
`#todas-pessoas`, com cache de sessão de 5 min. E a mesma permissão sustenta **8 consultas
por igualdade** que resolvem **e-mail ou telefone → conta**. Ou seja: o que a L4.P2 mediu
como 200 não é uma porta esquecida, é uma porta em uso — e ela fica igualmente disponível
para qualquer autenticado, contra qualquer endereço, número ou pessoa. (d) `fcmToken`, `preferredCeps`,
`linkedPhones` e `plan` são legíveis por qualquer autenticado **sem nenhum leitor cliente que
precise deles**.

*HIPÓTESE PENDENTE.* Que algum campo listado como "sem leitor cruzado" seja lido por um
caminho que a varredura não cobre — código gerado, string dinâmica ou consumidor fora do
repositório. Não há indício; só se descartaria com log de acesso, não consultado.

*PROPOSTA FUTURA — não formulada.* Nenhuma Rule, coleção, projeção, migração ou capability.
⛔ E continua valendo o bloqueio de corte nativo: os bundles 2.1.28 leem os mesmos campos e
não recebem atualização.

**L4.P6 — matriz de decisão para privacidade de perfil e cutover nativo (read-only, 31/ago/2026).**
⛔ **Matriz, não escolha.** Nenhuma alternativa é adotada, recomendada ou implementada; nada
aqui vira decisão. Produção não foi consultada nesta etapa — tudo sai do código já mapeado
nas L4.P0–P5.

**Os cinco problemas abertos que a leva mandou registrar, com a evidência de cada um.**

| # | Problema | Evidência | Consequência factual |
|---|---|---|---|
| 1 | `listRecentUsers` retém o documento inteiro | `js/firebase-db.js:2490` — `results[doc.id] = data`, sem `sanitize` | até 30 documentos completos de desconhecidos recém-ativos ficam em memória do `#explore`; o irmão `searchUsers`, na MESMA tela, projeta 10 campos |
| 2 | `loadUserProfile` devolve o documento cru | `js/firebase-db.js:2475` — `return doc.data()`, **30 chamadas** | o uso demonstrado em cada consumidor é de 1 a 4 campos (L4.P5); o que trafega e fica é tudo |
| 3 | `listInvitableUsers` varre até 2000 perfis | `js/firebase-db.js:2693` — `collection('users').limit(2000).get()`, cache de sessão de 5 min | ⛔ a permissão de `list` em `users` **está em uso**, não é sobra: alimenta `#explore` (`:205`, `:759`) e `#todas-pessoas` (`:57`) |
| 4 | Campos sem leitor cliente seguem legíveis | `fcmToken` (só Function, `functions/index.js:5305-5316`), `preferredCeps` (só o próprio perfil), `linkedPhones` (nenhum no cliente), `plan` | qualquer autenticado lê os quatro em qualquer perfil, e nenhum consumidor cliente precisa deles |
| 5 | `linkedEmails` é prova de posse com remoção client-writable | adiciona: `confirmSecondaryEmail` (`functions/index.js:6052-6057`) e a fusão; **remove: `window._profileUnlinkEmail` (`js/views/auth.js:9626`)** — `users/{uid}.update({linkedEmails})` direto | a mesma Rule que permite remover permite gravar **qualquer** array; o servidor aceita o campo como prova (`via:"email-vinculado"`, `:6262-6264`) e resolve conta por ele (`:4287`) |

**Duas restrições que moldam TODAS as alternativas.**
1. ⛔ **Rules autorizam documentos, não projetam campos.** Não existe liberar `displayName` e
   reter `phone` no mesmo documento. Toda restrição de campo hoje é client-side — e
   client-side não é fronteira. O repositório já registrava isso em
   `js/firebase-db.js:2632`.
2. ⛔ **A hidratação de perfis usa QUERY, e não tem plano B.** `_preloadUserProfiles` carrega
   em lotes de 10 com `where(documentId(), 'in', lote)` (`js/store.js:1045`) — que é `list`,
   não `get`. O `.catch` (`:1084-1093`) **só reporta** (`_captureMessage`, no máximo 2× por
   sessão) e **não cai** no caminho por documento. Ou seja: negar `list` em `users` hoje
   apagaria os nomes de toda chave e lista de inscritos, em silêncio. ⚠️ O próprio comentário
   do código descreve o precedente dessa falha por outra causa: *"2.0.55: o catch MUDO
   escondia a causa da seca de nomes (409 uids sem nome no aparelho do dono…)"*.

⭐ **E um fato que muda o tamanho do problema: login, recuperação, fusão e confirmação de
e-mail NÃO passam pelas Rules.** `_resolveAccount` → `_uidByProfileEmail`
(`functions/index.js:4281`), `_provaDePosseDeOld` (`:6245`) e `confirmSecondaryEmail`
(`:6032`) rodam com **Admin SDK**. Nenhuma mudança de Rule os afeta. O que os afetaria é
**mover o dado de lugar** — e essa é a linha que separa as alternativas abaixo.

**A matriz. Cinco alternativas plausíveis, nenhuma escolhida.**

*(A) Manter como está.* **Dados:** tudo continua disponível a busca, chave, categorias,
organizador, amizade, convites, ranking e identidade — nada muda. **Invariantes:** todos
preservados, porque nada se move. **Impacto:** zero em web, 2.1.28, `www/`, Functions, Rules,
custo, concorrência, dados e rollout. **Nativo:** não se aplica. **Migração:** nenhuma.
**Gates:** os que já existem. **Risco de manter:** os cinco problemas acima permanecem — em
particular, qualquer autenticado enumera 266 perfis com `email`, `phone` e `fcmToken` dentro,
e resolve e-mail ou telefone → conta. **Risco de mudar:** nenhum (é a linha de base).

*(B) Ampliar a projeção no CLIENTE.* Estender o `sanitize` do `searchUsers` ao
`listRecentUsers` e dar projeção ao `loadUserProfile`. **Dados:** inalterados para todos os
consumidores — a projeção seria o superconjunto do que a L4.P5 mediu como usado.
**Invariantes:** todos preservados; nada de identidade se move. **Impacto:** só `js/`; Rules,
Functions, Firestore, custo e dados intocados; concorrência inalterada. **Nativo:** ⛔ **não
alcança o 2.1.28** — o bundle tem a própria cópia do `firebase-db.js` e continua retendo o
documento inteiro. **Migração:** nenhuma; sem compatibilidade temporária, sem rollback além
de reverter o commit. **Gates:** trava estática de "nenhum caminho retém campo fora da lista"
nos três clientes, mais controle contra a árvore atual. **Risco de manter:** o problema 4
segue inteiro. **Risco de mudar:** ⚠️ **cria a aparência de fronteira sem a fronteira** —
quem chama a API direto recebe o documento como ele é. É exatamente o que
`js/firebase-db.js:2626-2633` já diz ter feito uma vez.

*(C) Espelho público server-written: `usersPublic/{uid}`.* Documento com os campos que a
L4.P5 demonstrou necessários no cruzamento; `users/{uid}` deixa de ser lido por terceiros.
⭐ **Tem precedente em produção neste repositório:** `tournaments_summary` é exatamente isso
— `allow write: if false`, escrito só pela Function (`functions-autodraw/index.js:1851`,
`:1896`) e lido pelo cliente (`js/views/todos-torneios.js:60`, `:94`). **Dados:** busca,
chave, categorias, amizade, convites e ranking passam a ler o espelho; organizador e
identidade continuam no servidor. **Invariantes:** exige decidir onde vive `mergedInto` — o
`_userVivo` do cliente (`js/views/user-vivo-core.js:61`) o lê hoje em `users`; sem ele no
espelho, "perfil vivo vence lápide" quebra no cliente. **Impacto:** Rules ganham uma coleção;
Functions ganham um escritor e um gatilho de sincronismo; **custo dobra na escrita** (um
write a mais por alteração de perfil) e cai na leitura (documento menor); **concorrência**:
duas autoridades escrevendo a mesma projeção é a duplicidade que este projeto já pagou em
`friends[]` — o espelho tem de ter **um único escritor**; **dados existentes**: 266 perfis
precisam ser semeados antes de qualquer leitura. **Nativo:** ⛔ **não deployável sem versão
nativa nova** — o 2.1.28 lê `users` diretamente em 20 sítios e não recebe atualização; a
dependência que bloqueia o cutover é **versão compatível aprovada nas duas lojas + política
de adoção**. **Migração:** semeadura completa → leitura dupla (espelho com queda para
`users`) → só então fechar `users`; rollback = reabrir `users` e voltar a ler dele.
**Autoridade de escrita:** só Admin SDK; retries idempotentes por uid. **Gates:** paridade
espelho×`users` campo a campo sobre os 266 perfis; suíte de Rules nas duas coleções; controle
contra a arquitetura atual; e um gate que prove que **nenhum cliente** lê `users` de
terceiro. **Risco de manter:** os cinco problemas. **Risco de mudar:** espelho defasado é
nome velho na tela — o cânone `js/store.js:766-773` existe justamente para isso; e um espelho
sem `mergedInto` reintroduz a lápide como pessoa.

*(D) Subcoleção privada: `users/{uid}/privado/*`.* O documento de perfil fica público-para-
autenticado e o que é PII/prova desce para subcoleção com regra própria. **Dados:** busca,
chave, categorias, amizade e ranking seguem no documento pai, sem mudança de forma; o
organizador perde `email`/`phone`/`linkedEmails` do cliente e passaria a depender do
servidor. **Invariantes:** `mergedInto` pode ficar no pai (segue privilegiado); `linkedEmails`
e telefones com procedência descem, o que **fecha o problema 5 por construção** (subcoleção
com `write: if false`). **Impacto:** Rules ganham blocos por subcoleção; Firestore cobra
**uma leitura a mais** por acesso ao dado privado; a busca por `email_lower`/`phone`
**deixa de existir no cliente** (não se consulta subcoleção pelo pai) — os 8 sítios de
resolução por identificador teriam de virar servidor; dados existentes exigem migração campo
a campo. **Nativo:** ⛔ **não deployável sem versão nativa nova** — o 2.1.28 lê esses campos
no documento pai. **Migração:** escrever nos dois lugares → migrar leitores → parar de
escrever no pai → limpar o pai; rollback só é barato antes do último passo.
**Gates:** paridade pai×subcoleção; Rules nas duas; prova de que nenhum leitor cliente ficou
apontando para o campo antigo. **Risco de manter:** os cinco. **Risco de mudar:** ⚠️ é a
alternativa com **mais superfície de escrita** durante a transição, e o projeto já registrou
o que acontece quando duas autoridades escrevem a mesma coisa.

*(E) Capabilities server-side para as consultas.* Busca, lista de convidáveis e resolução
e-mail/telefone → conta viram callables; o cliente perde `list` em `users` e mantém `get`.
**Dados:** todos continuam disponíveis, mediados. **Invariantes:** preservados — a resolução
de identidade **já é server-side**, então login, recuperação, fusão e confirmação **não
perdem nada**. **Impacto:** Functions ganham 3 capabilities; Rules perdem `list`;
⛔ **a hidratação de perfis quebra** — ela é `where(documentId(),'in',…)`, ou seja `list`, e
não tem queda para `get` (restrição 2). Ou a hidratação migra para `get` por documento (10×
mais chamadas, mas 1 leitura por documento igual), ou vira capability também.
**Custo:** cada busca passa a ser uma invocação de Function; o scan de 2000 sai do cliente e
vira leitura server-side com cache. **Nativo:** ⛔ **bloqueado** — o 2.1.28 faz as consultas
direto; fechar `list` no servidor as nega **no instante do deploy**, para todos ao mesmo
tempo, e o app das lojas não recebe atualização. **Migração:** publicar as capabilities →
migrar os clientes → esperar a adoção nativa → só então fechar `list`. **Rollback:** reabrir
`list`. **Gates:** suíte de Rules com `list` negado e `get` permitido; controle contra a
árvore atual; trava estática de que nenhum cliente faz `where` em `users`; e um teste que
prove a hidratação sem `list`. **Risco de manter:** os cinco. **Risco de mudar:** latência no
caminho quente e a quebra silenciosa da hidratação se a ordem for invertida.

**Comparação, sem escolher.**

| Critério | (A) manter | (B) projeção cliente | (C) espelho público | (D) subcoleção privada | (E) capabilities |
|---|---|---|---|---|---|
| Move a fronteira de verdade | não | **não** | sim | sim | sim |
| Fecha o problema 4 (campos sem leitor) | não | parcial | sim | sim | não por si só |
| Fecha o problema 5 (`linkedEmails`) | não | não | não por si só | **sim** | não por si só |
| Fecha o problema 3 (scan de 2000) | não | não | sim (scan no espelho) | não | sim |
| Deployável sem versão nativa nova | — | **sim** | não | não | não |
| Escritas a mais por alteração de perfil | 0 | 0 | **+1** | +1 durante a transição | 0 |
| Leituras a mais por acesso | 0 | 0 | −(doc menor) | **+1** para o dado privado | invocação de Function |
| Superfície de concorrência nova | nenhuma | nenhuma | **espelho** | **dupla escrita** | nenhuma |
| Dados existentes a migrar | 0 | 0 | 266 perfis | 266 perfis, campo a campo | 0 |
| Quebra a hidratação se feita sozinha | não | não | não | não | **sim** (restrição 2) |

**Invariantes adotados × como cada alternativa os toca.** ⚠️ Nenhuma delas é compatível "de
graça": a coluna diz **o que precisaria ser resolvido**, não que já esteja.

| Invariante | (B) | (C) | (D) | (E) |
|---|---|---|---|---|
| Identidade é uid; e-mail/nome não autorizam | intacto | intacto | intacto | intacto |
| Perfil vivo vence lápide (`_userVivo`) | intacto | ⚠️ exige `mergedInto` no espelho | intacto | intacto |
| Nome/e-mail/telefone de terceiro vêm da fonte canônica | intacto | ⚠️ a fonte passa a ser o espelho — defasagem vira nome velho | intacto no pai | intacto |
| `linkedEmails`/`mergedInto`/telefone com procedência/tokens são prova, não client-writable | ⛔ não muda o problema 5 | não muda | ⭐ resolve por construção | não muda |
| `statsVisibility` ausente = público | intacto (a Rule lê por `get()` server-side) | ⚠️ a Rule leria onde? | intacto | intacto |
| Login, recuperação, fusão e confirmação não perdem resolução | intacto | ⚠️ só se as Functions continuarem lendo `users` | ⚠️ idem, com o campo na subcoleção | ⭐ intacto — já é server-side |

**Gates obrigatórios antes de QUALQUER implementação — comuns a C, D e E.**
1. Suíte de Rules no emulador para o desenho novo, anônimo **e** autenticado, com **controle
   contra a arquitetura atual** (tem de falhar lá, senão não prova nada).
2. Trava estática nos **três clientes** (web, Android, iOS, e `www/`) provando que nenhum
   leitor ficou apontando para o caminho antigo — no molde do
   `scripts/check-magiclinks-get-only.js`, andando o disco e não `grep -r`.
3. Teste de **hidratação sem `list`**: a chave desenha os nomes. Hoje isto falharia em
   silêncio (restrição 2), e é o gate que impede repetir a "seca de nomes".
4. Paridade campo a campo entre a origem e o destino sobre os 266 perfis, **agregada e sem
   PII**.
5. Prova de que **login, recuperação, fusão e confirmação de e-mail** continuam resolvendo —
   as quatro rodam com Admin SDK e não são cobertas por teste de Rules.
6. Gate de **cutover nativo**: nenhuma Rule restritiva entra antes de versão compatível
   aprovada nas duas lojas **e** política de adoção autorizada pelo dono.

**Classificação.**

*DECISÃO JÁ ADOTADA (nada de novo aqui).* Os invariantes da tabela acima, todos já
registrados nas L4.P0–P5 e no cânone do projeto.

*PROBLEMA ABERTO.* Os cinco da primeira tabela, com a evidência de cada um. ⭐ Somam-se a
eles as duas restrições: Rules não projetam campos, e a hidratação depende de `list` sem
plano B.

*HIPÓTESE PENDENTE.* (a) Que exista consumidor de `users` fora do repositório (console,
ferramenta interna, integração) que uma mudança de leitura quebraria — não verificável por
código, só por log de acesso, não consultado. (b) Que a defasagem de um espelho (C) fique
dentro do que o cânone de nome vivo tolera — não medido, e mensurável só depois de existir.

*PROPOSTA FUTURA — as cinco alternativas acima, e SÓ COMO ALTERNATIVAS.* ⛔ Nenhuma foi
escolhida, nenhuma foi recomendada, nenhuma virou plano. Não há texto de Rule, assinatura de
capability, esquema de coleção nem sequência de migração escritos nesta leva — só o contrato
do que cada caminho custaria. A decisão é do dono.

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

**L6.P0 — inventário read-only dos writers de `tournaments` (31/ago/2026). ⛔ NADA FOI
DECIDIDO, NADA FOI ALTERADO.** Produto, Rules, Functions, scripts, testes e dados intactos;
nenhuma publicação. As Rules citadas foram lidas do RULESET NO AR
(`9a65fc58-55a4-40bd-bb5a-50f53edd23ae`), que é byte a byte igual ao `main`.

*Método.* Mapeamento por dono (cada ocorrência de escrita atribuída ao `exports.`/método que
a contém) sobre `js/`, `functions/`, `functions-autodraw/`, `scripts/` e `tests/`, mais três
medições read-only em produção — agregadas, sem id, nome, uid ou e-mail. Os scripts de
medição ficaram fora do repositório.

**(1-3) AS PORTAS DE ESCRITA, POR CODEBASE — quem escreve o quê.**

*Cliente · porta canônica em `js/firebase-db.js`.*
`saveTournament` (:235, grava em :1153 com `.set(merge:true)` a partir do objeto EM MEMÓRIA)
— **93 chamadas** em `js/`, de longe a porta mais usada; `mutateTournament` (:1235, transação
com `transaction.set` SEM merge em :1386, ciente da divisão em :1362-1383); `mutateMatchResult`
(:1415, transação em `results/{matchId}`); `leaveStandby` (:1552 → `standbyParticipants`,
`waitlist`, `memberUids`); `_enrollParticipantTx` (:1579) e `_deenrollParticipantTx` (:1825),
que são o **fallback** das CFs homônimas; `_deleteSubcollection` (:1915) e `deleteTournament`
(:1944); `enfileirarPlacar` (:2366 → cria `resultQueue/{id}`). `setPresenceFields` (:1214)
NÃO escreve: virou disparo de `aplicarNoTorneio`.

*Cliente · orquestração (`js/store.js`).* `AppStore.mutate` (:10778) aplica o mutator no
objeto local, enfileira a persistência **serializada por torneio** (`_txQueue[tId]`) e chama
`commitTournamentTx` (:10712) → `mutateTournament`. O MESMO mutator é replicado no sandbox.
`commitResultTx` tenta a CF `applyMatchResult` e, na falha, cai na FILA (`enfileirarPlacar`).

*⛔ Cliente · escrita DIRETA fora da porta — 5 sítios, 3 arquivos.*
`js/store.js:3840` `.update({status:'closed'})`; `js/store.js:9676` `.update({adminEmails})`;
e `js/views/arbitros.js:274, :309, :342` `.update({arbitros: arrayUnion/arrayRemove})`.
⚠️ `arbitros` não está em NENHUMA das duas allowlists das Rules, então essas três só passam
para admin — mas o campo é lido como autorização de arbitragem em `js/views/bracket.js:4920` e
`js/views/bracket-ui.js:704`. `adminEmails` idem (admin-only). `status` está nas duas listas.

*Functions (`functions/index.js`) · porta ciente da divisão.* `functions/split-parts.js`
(`hidratar` + `gravar`) é usada por **seis** portas: `enrollParticipant` (:2946/:2948),
`deenrollParticipant` (:3237/:3245), `formPair` (:3310/:3319), `splitPair` (:3357/:3365),
`respondHostInvite` (:3428/:3444) e `propagateDisplayName` (:7806/:7813). Fora dela:
`aplicarNoTorneio` (:3154) — a porta única de escrita FINA, com allowlist em
`functions/partes-permissao.js`, `batch` sem transação e bump obrigatório de `updatedAt`;
os callables `setParticipantsGender` (:2465), `setParticipantsProfile` (:2511),
`applyLetzplayScans` (:3462) e `sendOrgCommunication` (:3553, subcoleção `communications`);
os gatilhos `syncMatchRosters` (:7928), `syncSplitMatchResult` (:7891) e
`purgeTournamentCopies` (:8338); e a manutenção `deleteAccount` (:5439), `mergePhoneAccount`
(:6274, **17** escritas), `fixMergedParticipants` (:6803), `backfillMatchResultDocs` (:8113) e
`repairTournaments` (:6816).

*Autodraw (`functions-autodraw/index.js`) · porta própria.* `_leTorneio` (:375, monta das
subcoleções DENTRO da transação) + `_gravaTorneio` (:397, grava só o que mudou). Sete
chamadores: `drawRound` (:631), `integrateLateEntries` (:734), `formLatePair` (:810),
`splitLatePair` (:849), `applyMatchResult` (:903), `closeRound` (:1074) e
`_formarGruposDaEspera` (:1671). Gatilhos: `tournamentMirror` (:1964 — espelha as subcoleções
E **poda** `history` e `categoryNotifications` no próprio doc, :2132/:2156),
`tournamentSummary` (:1840), `applyQueuedResult` (:995) e `autoDrawReconcile` (:1705, só
`nextDrawAt`).

*Scripts administrativos (Admin SDK, não passam por Rule).* 16 arquivos de `scripts/` tocam
`tournaments`; 14 com operação de escrita — entre eles `dividir-todos.js`,
`desfazer-divisao.js`, `rechavear-inscritos.js`, `rechavear-historico.js`, `salto-fase2.js`,
`congelar-grupos-fechados.js` e `apagar-standings-do-doc.js`.

**(4) OPERAÇÕES COM MAIS DE UMA AUTORIDADE DE ESCRITA — o núcleo da L6.**
`tournaments/{id}/results`: **cinco** — cliente (`mutateMatchResult`), `syncMatchRosters`,
`syncSplitMatchResult`, `backfillMatchResultDocs` e o autodraw (`_gravaTorneio`, :483).
Elenco: cliente (`saveTournament`, `_enrollParticipantTx`), CF (as seis portas), autodraw
(`integrateLateEntries`, `formLatePair`/`splitLatePair`) e scripts. `history`: cliente
(`mutate` + `logAction`), CF (`gravar`) e `tournamentMirror` (poda). `status`: cliente
(`saveTournament`, `mutate`, `store.js:3840`) e servidor. `rounds`/`matches`: cliente,
`_gravaTorneio` **e** `autoDraw` cru. `nextDrawAt`: recomputado por TODO save do cliente,
por `autoDraw` e por `autoDrawReconcile`.

**(6) O QUE AS RULES REALMENTE IMPÕEM.** O documento tem 13 subcoleções com regra: `results`
(create/delete admin; update admin **ou** participante daquele jogo com `playerUids`
imutável), `letzplayScans` (admin), `resultQueue` (create com `actorUid == auth.uid`;
update/delete negados) e **nove com `allow write: if false`** (`matches`, `grupos`,
`checkedIn`, `inscritos`, `history`, `woClaims`, `woLog`, `opponentHistory`,
`categoryNotifications`). ⚠️ `participants` e `communications` existem no banco e **não têm
bloco de regra nenhum** — negadas por omissão, alcançáveis só pelo Admin SDK.
⛔ **E o achado que define a leva:** no documento pai, `isEnrollmentOnlyDiff()`
(`firestore.rules:37`) e `isParticipantBracketDiff()` (`:97`) autorizam por
`diff().affectedKeys().hasOnly([…])` — isto é, olham **quais chaves mudaram e mais nada**.
Não há uma única checagem de VALOR. A segunda lista tem ~45 campos de topo, entre eles
`matches`, `rounds`, `groups`, `standings`, `classification`, `status`, `participants`,
`memberUids` e `history`; a primeira vale para **qualquer autenticado**, não só participante,
e inclui `participants`, `memberUids` e `status`.

**(7) CONCORRÊNCIA, RETRY, IDEMPOTÊNCIA.** `mutateTournament` e as portas de CF leem fresco
dentro da transação (clobber-free); `AppStore.mutate` serializa por torneio para não gerar
`failed-precondition` em lote. `resultQueue` tem id derivado da intenção (reentrega cai no
mesmo doc). `autoDraw` rebaseia `rounds` numa transação (`rebaseRounds`, dedup por número da
rodada). ⛔ Em contraste: `saveTournament` grava o objeto EM MEMÓRIA com `merge:true` — é o
caminho de last-write-wins e é o mais chamado (93); `_autoDrawIncrementalPhaseRound` (:1505)
grava `phaseRounds` com `.update()` **sem transação e sem releitura**, sobre um `t` lido numa
query que pode ter segundos de idade; e as cinco escritas diretas do cliente não passam por
guard nenhum.

**(8) COMPATIBILIDADE COM DOCUMENTO DIVIDIDO — medido.** `PARTES` (js/views/tournament-split-core.js:65)
= `participants, history, opponentHistory, checkedIn, woClaims, woLog, categoryNotifications,
matches, grupos`. `dividir()` **esvazia o campo no documento** (`config[campo] = []`, :389).
Medição em produção: **44 torneios, 41 divididos**, e as partes fora são exatamente
`matches` (41), `participants` (41) e `opponentHistory` (41). Todo escritor de elenco precisa
hidratar — é o que `split-parts.js` e `_leTorneio` fazem, e é o que as duas exceções do
autodraw **não** fazem.

**(9) TESTES E GATES.** 47 arquivos de teste citam as portas (`saveTournament`,
`mutateTournament`, `aplicarNoTorneio`, `_gravaTorneio`, `_splitParts`). Sete suítes dirigem
as Rules REAIS no emulador (`npm run test:rules`); das que tocam torneio,
`rules-inscricao-espera` prova que inscrever-se **não** muda o nome nem escreve `adminUids`,
e `rules-cohost-uid-only` e `rules-sandbox-read` cobrem co-organização e leitura do sandbox.
⛔ **Não existe suíte** que dirija as Rules contra as duas allowlists do documento pai pelo
lado do VALOR — nenhuma prova, contra o emulador, do que um autenticado não-participante ou
um participante comum consegue ou não consegue escrever em `participants`, `memberUids`,
`status`, `standings` ou `matches`.

═══ CLASSIFICAÇÃO ═══

*Decisão já adotada (registro, não mudança).* (a) A escrita de subcoleção é do SERVIDOR: nove
subcoleções com `allow write: if false` e a ordem do dono de 25/ago — _"o certo é tudo rodar
em CF só sendo disparado pelo client side"_. (b) `aplicarNoTorneio` é a porta única de
escrita fina, com allowlist em tabela e não em `if`. (c) Autorização por **uid**, nunca por
e-mail. (d) O cliente não deriva avanço de chave: a queda do placar é a FILA, não o motor
local. (e) `results` é doc por jogo, com a corrida contida na transação daquele doc.

*Problema aberto.* **(P1)** As duas allowlists do documento pai autorizam por CHAVE e nunca
por VALOR (`firestore.rules:37` e `:97`) — derivado de leitura das Rules, **não medido no
emulador nesta etapa**, porque a leva é read-only e criar suíte seria editar testes.
**(P2)** Cinco escritas diretas do cliente fora da porta (`js/store.js:3840`, `:9676`;
`js/views/arbitros.js:274, :309, :342`), sem guard, sem fila e sem rastro.
**(P3)** `results` tem cinco autoridades de escrita. **(P4)** `saveTournament` grava a cópia
em memória com `merge:true` em 93 sítios. **(P5)** ⭐ **Medido**: `exports.autoDraw` (:1113)
e `_autoDrawIncrementalPhaseRound` (:1473) são os **únicos** caminhos do autodraw que não
passam por `_leTorneio`/`_gravaTorneio` — leem `doc.data()` cru de uma query e gravam direto
(:1269, :1333, :1505). **(P6)** ⭐ **Medido**: o marcador e o documento **divergem em 1
torneio** — `_semPesados` diz que `participants` e `matches` estão fora, e o documento ainda
carrega 2 entradas de elenco e jogos dentro de `rounds[].matches`. **(P7 — RETIFICADA pela
L6.P0.1, leia lá antes de usar esta linha)** A redação original desta P7 dizia que o
`autoDraw` "roda a cada minuto num laço no-op" e datava a evidência por LIMITE de linhas, não
por tempo. Os pares de log existem e são reproduzíveis, mas são todos de **28/ago/2026** e de
revisões que não estão mais no ar; o comportamento de HOJE é outro, e está medido na L6.P0.1.

*Hipótese (não confirmada nesta etapa).* **(H1 — DERRUBADA pela L6.P0.1)** Eu supus que P6 e
P7 fossem o mesmo evento. A medição de reconfirmação separou os dois: o torneio que a query do
`autoDraw` alcança tem o array de elenco **VAZIO** no documento, enquanto o torneio divergente
de P6 é **outro** (2 entradas no doc). Não é o mesmo evento. **(H2)** Que a ausência da trava
de alinhamento em `functions-autodraw` (registrada na R0.3 como escopo deliberado) permita que
o código no ar difira do `main`. A L6.P0.1 estreitou isto sem fechar: a revisão no ar é
`autodraw-00050-taw`, publicada em **30/ago/2026 19:14 UTC**, e o `firebase-functions-hash`
dos registros é `d8be07cf…` — dá pra comparar revisão a revisão, mas não se comparou código.

*Proposta futura (nada escolhido, nada autorizado).* Reduzir autoridade sobre o documento pai
exigiria, em alguma ordem ainda não decidida: fechar as escritas diretas do cliente,
substituir as allowlists por-chave por validação de valor (ou mover a decisão para CF, como
`matches` já fez), unificar as cinco autoridades de `results`, e fazer as duas exceções do
autodraw passarem pela porta ciente da divisão. ⛔ Nenhuma dessas foi decidida, e **P1 e P4
esbarram no bundle das lojas (2.1.28)**, o mesmo bloqueio externo da L2 — fechar a Rule antes
do cutover nativo cortaria clientes instalados que não se atualizam.

**L6.P0.1 — reproduzir ou retificar a evidência de log do `autoDraw` (read-only,
31/ago/2026). ⛔ RETIFICA a P7 da L6.P0.** Nada de produto, Rules, Functions, testes, scripts
ou dados foi tocado; nenhuma publicação.

*Por que esta etapa existe.* A L6.P0 registrou "250 pares nas últimas 500 linhas de log" e
concluiu que o `autoDraw` "roda a cada minuto num laço no-op". Duas consultas independentes
por esses textos voltaram **zero**. O conflito é objetivo e tinha que ser resolvido medindo.

**(1) O RECURSO CERTO.** `gcloud functions describe autoDraw --region=us-central1` devolve
`projects/scoreplace-app/locations/us-central1/functions/autoDraw`, **GEN_2**, **ACTIVE**,
serviço de apoio `.../services/autodraw`, revisão `autodraw-00050-taw`, `updateTime`
**2026-08-30T19:14:46Z**, `entryPoint autoDraw`. Sendo Gen2, os registros NÃO estão em
`resource.type="cloud_function"` (Gen1) e sim em **`cloud_run_revision`**, com
`resource.labels.service_name="autodraw"`.

**(2) FILTRO EXATO, JANELA E FONTE — para qualquer um repetir.**
Fonte: Cloud Logging do projeto `scoreplace-app`, via `gcloud logging read`, ordem padrão
(mais novo primeiro). Filtro:
`resource.labels.service_name="autodraw" AND (logName:"stdout" OR logName:"stderr") AND timestamp>="2026-08-24T00:00:00Z"`
⚠️ **Por que as buscas por texto voltaram zero** — medido, variante a variante:
`textPayload:"no-round-generated"` → **0** (o operador `:` casa TOKENS; a frase com hífen e
parênteses não vira token), enquanto `textPayload=~"no-round-generated"` (regex) → 200;
`resource.type="cloud_function"` (Gen1) → **0**; e o mesmo filtro com janela `>= 29/ago` →
**0**, que é o achado do item (5). ⚠️ Terceira armadilha: pedir `--format="value(textPayload)"`
**sem** filtrar `logName` devolve sobretudo `run.googleapis.com/requests`, que **não tem
`textPayload`** — a saída vem em branco e parece "nenhum log".

**(3) CONTAGENS SEPARADAS (janela 24/ago → 31/ago, limite 1000, batendo no limite).**
`Auto-draw: generating round 1` = **500** · `Auto-draw: skip (no-round-generated)` = **500** ·
erros/exception/denied = **0**. Por revisão: `autodraw-00047-cuv` 485+485 e
`autodraw-00048-jot` 15+15. Com `--limit 500` (o da L6.P0) dá exatamente 250+250 — o número
original **reproduz**, e era o LIMITE que definia a amostra, não o tempo.

**(4) PROCEDÊNCIA — são da Function publicada.** Cada registro traz
`labels."goog-managed-by": "cloudfunctions"`, `goog-drz-cloudfunctions-id: autodraw`,
`goog-drz-cloudfunctions-location: us-central1`, `deployment-scheduled: true`,
`firebase-functions-hash: d8be07cf…`, `execution_id` e imagem base
`serverless-runtimes/…/nodejs24`. Não é execução local nem serviço homônimo.

**(5) O QUE FICA RETIFICADO — a P7 estava datada por LIMITE, não por TEMPO.**
⛔ **O erro foi meu e é de método**: usei `--limit 500`, li "250 pares" e escrevi "roda a cada
minuto", **sem nunca olhar o intervalo de timestamps da amostra**. É a mesma família de
[[feedback_busca_truncada_nao_e_busca]] — o limite virou a janela.
*Fato que PERMANECE (dado):* os pares existem, são reproduzíveis e são da Function publicada,
com zero erro. *Fato NOVO que corrige o sentido:* **todos são de 28/ago/2026** — o registro
mais recente de `stdout`/`stderr` do `autodraw` é **2026-08-28T14:09:13Z**, e a consulta com
janela `>= 2026-08-29` devolve **0**; a revisão que está no ar desde 30/ago (`autodraw-00050-taw`)
**nunca escreveu uma linha de `stdout`**. Ou seja: o laço `generating round 1` +
`no-round-generated` **não é o comportamento de hoje** e não deve ser descrito no presente.
*Fato SEPARADO, que continua valendo por LEITURA de código (item 5 do pedido):* o caminho
existe e não passa pela porta ciente da divisão — `exports.autoDraw` lê `doc.data()` cru da
query (`functions-autodraw/index.js:1115`, `:1117`) e grava direto em `:1269` e `:1333`;
`_autoDrawIncrementalPhaseRound` grava em `:1505` sem transação nem releitura. Isso é código,
não log, e não depende desta medição.

**(6) O QUE ESTÁ ACONTECENDO AGORA — medido, e é mais forte que a P7 original.**
O agendador **continua disparando**: 500 entradas de `run.googleapis.com/requests` no serviço
`autodraw`, **todas HTTP 200**, todas na revisão `autodraw-00050-taw`, a mais recente
**2026-08-31T22:36:08Z**. E, no mesmo período, **zero linhas de `stdout`**.
Reconfirmação em produção no mesmo instante (`agora` = 2026-08-31T22:37:46Z, só agregado):
dos **44** torneios, exatamente **1** tem `nextDrawAt`, e ele está **vencido há 151 min** —
`format=Liga`, `status=active`, `drawManual=false`, `drawFirstDate=sim` (passa por todas as
guardas de `:1135-1137`) —, com `participants` **no marcador `_semPesados`** e o array
**VAZIO no documento** (`0` entradas). ⇒ O `autoDraw` alcança esse documento a cada minuto,
lê elenco vazio e **sai em silêncio**: o `continue` de `:1148`
(`if (participants.length < 2) continue;`) não tem log nenhum.
⚠️ **Qual dos ramos silenciosos é o tomado continua sendo HIPÓTESE**, não medição: `:1148` é o
candidato que casa com o dado, mas `:1205` (dedup por `lastAutoDrawAt`) e `:1481`
(`owed > nowMs`, no ramo de fase) também saem sem escrever nada. Distinguir exigiria
instrumentar a Function — fora do escopo desta leva.

*Decisão de método que fica registrada:* medição de log **declara a janela de tempo e o
intervalo real dos timestamps da amostra**, nunca só o `--limit`. Amostra que bate no limite é
amostra **truncada** e tem que ser dita como tal.

**L6.P1 — incidente read-only: o `autoDraw` agendado sai CALADO num torneio elegível
(31/ago/2026).** ⛔ Nada foi corrigido, nada publicado; nenhuma ação de sorteio foi
executada. Fecha a pergunta que a L6.P0.1 deixou como hipótese: **qual ramo silencioso é o
tomado**.

*Método.* Além dos logs e do Cloud Scheduler, a decisão foi **simulada com as funções REAIS**:
`require('functions-autodraw/draw-core.js')._window` — o mesmo `drawWindow` que a Function
usa — avaliado contra o **documento real**, percorrendo as guardas de `exports.autoDraw` na
ordem em que elas aparecem. O script imprime só veredito e contagem; nenhum tid, nome, uid,
e-mail ou conteúdo de inscrito passa pela saída. Nenhuma escrita, nenhum sorteio.

**(1) A execução agendada CHEGA ao handler.** `firebase-schedule-autoDraw-us-central1`,
`every 1 minutes`, **ENABLED**, última tentativa **2026-08-31T22:50:16Z**. Os registros de
requisição do serviço `autodraw` trazem `userAgent=Google-Cloud-Scheduler`, `POST /`,
**status 200**, latência **0,06–0,23 s**, revisão `autodraw-00050-taw`. ⇒ Não é agendamento
parado, não é timeout, não é erro de invocação.

**(2)+(3) AS PRÉ-CONDIÇÕES, UMA A UMA, CONTRA O DOCUMENTO REAL.**
`nextDrawAt` está gravado como **inteiro** e vencido há **166 min** ⇒ a query
`where('nextDrawAt','<=', now)` (`functions-autodraw/index.js:1115`) **devolve** o documento.
Daí em diante: `[1125] _isIncrementalLigaPhase` = **false** — o torneio TEM `phases` (2), mas
`currentPhaseIndex` = 0 e a função exige `cur >= 1` (`js/views/tournaments-utils.js:1924`) —,
então **não** é o ramo de fase; `[1135] isLiga` = true (`format` = `Liga`);
`[1136] drawManual` = false; `[1137] drawFirstDate` presente; `status` = `active`;
`_ligaSeasonEndMs` = null; `pendingDraw` e `stagedDraw` = false. **Todas passam.**
A única que barra é `[1148] participants.length` = **0** → `continue`.

**(4) POR QUE 200 SEM `stdout`.** Porque o caminho que o handler toma **não tem log nenhum**:
o `continue` de `:1148` é mudo por construção, e as linhas do `autoDraw` só começam em
`:1211` (`generating round N`) e nos `continue` que têm motivo escrito. 200 + 60 ms + zero
linha é exatamente o que esse caminho produz. **Não é log perdido nem filtrado — é log
inexistente.**

**(5) A CLASSIFICAÇÃO CERTA: incompatibilidade com partes divididas, na forma de retorno
antecipado silencioso.** ⛔ Não é "torneio não elegível". O marcador do documento é
`_semPesados = ["matches","participants","opponentHistory"]`, e as subcoleções têm
**10 registros em `inscritos`** e **13 em `matches`** (contagem agregada, nada do conteúdo
lido para a saída). O elenco EXISTE — ele só não está no documento. E `exports.autoDraw` lê
`doc.data()` **cru** (`:1115`, `:1117`) e **nunca hidrata**, ao contrário das sete portas do
autodraw que passam por `_leTorneio` (`:375`). É a mesma classe que `functions/split-parts.js`
fechou no `functions/` em 26/ago — seis portas decidindo com elenco vazio — e que no
`functions-autodraw/` continua aberta.

**(6) RISCO IMEDIATO: SIM.** Enquanto o elenco morar fora do documento, o sorteio AGENDADO
**nunca** gera rodada nesse torneio: o `nextDrawAt` segue vencido e crescendo, e
`autoDrawReconcile` (`:1705`) — que **também lê cru** (`:1715`) e calcula `_nextOwedDrawMs`
sem olhar elenco — mantém o campo apontando para um sorteio que não acontece. Não há erro,
não há alerta, não há linha de log: para quem organiza, a rodada simplesmente não sai.
⚠️ **O caminho MANUAL não está afetado**: `drawRound` passa por `_leTorneio` e enxerga os 10
inscritos — quem sortear pelo app consegue.
⚠️ **Correção à P5 da L6.P0:** ela disse que `exports.autoDraw` e
`_autoDrawIncrementalPhaseRound` eram os **únicos** caminhos do autodraw fora da porta ciente
da divisão. São **três**: `autoDrawReconcile` também lê `doc.data()` cru. Ele só escreve
`nextDrawAt`, mas decide sobre um torneio que não leu inteiro.

**(7) TESTES — o que cobre e a lacuna objetiva.** Cobrem o motor e o agendamento:
`tests/draw-schedule.test.js`, `tests/liga-countdown.test.js`,
`tests/liga-autodraw-server-only.test.js` (prova que o cliente NÃO sorteia),
`functions-autodraw/test-draw.js` e `test-persist-boundary.js`. ⛔ **A interseção é vazia:**
nenhum teste exercita `exports.autoDraw` contra torneio **dividido** — a varredura dos
arquivos que citam `autoDraw` e também `_semPesados`/`montarDoBanco` devolve só
`test-draw.js`, onde "inscritos" aparece como palavra, não como subcoleção. E **nenhum** teste
exercita a guarda `participants.length < 2`. *Lacuna a fechar quando houver leva:* um teste
que monte torneio com `participants` em `_semPesados` e exija que o caminho AGENDADO ou
hidrate ou **reclame** — hoje ele sai calado, que é o pior dos três desfechos.

*Classificação.* **Problema aberto (P8)**, e ele SUBSTITUI a leitura antiga da P7: o
comportamento atual não é um laço que gira à toa, é uma saída silenciosa na primeira guarda
que depende de dado que saiu do documento. *Hipótese que fica de pé:* que o laço de 28/ago
(`generating round 1` + `no-round-generated`) seja o MESMO torneio antes de o elenco sair do
documento — plausível pela sequência, **não verificado**, porque exigiria correlacionar
horário de migração com o log e ler conteúdo que esta leva não expõe.

**L6.R1 — CONCLUÍDA E PUBLICADA (2.1.80, 31/ago/2026).** Fecha a P8 da L6.P1 e corrige a P5
da L6.P0. Escopo publicado: **`functions-autodraw` e Hosting**, mais nada.

*Problema corrigido:* o sorteio AGENDADO não acontecia em torneio dividido. `exports.autoDraw`
lia `doc.data()` cru, via `participants: []` (o elenco mora em `inscritos`) e saía num
`continue` sem log. Junto vinham dois defeitos da mesma família: o horário era montado com
**offset fixo `-03:00`** (o horário de Brasília, não o do evento) e a persistência gravava
`rounds` direto no documento, o que devolveria os jogos ao pai e desfaria a divisão.

*Decisões adotadas.* ① **O horário de negócio é o do LOCAL DO EVENTO, por identificador
IANA**, resolvido nesta ordem: declarado no evento → local/endereço/coordenada do evento →
cidade do organizador → **e, sem certeza, NÃO se sorteia**, com diagnóstico. ⛔ Nunca UTC,
offset fixo ou fuso do servidor. ② **O calendário anda em dias civis** e só depois converte —
somar milissegundos atravessa DST e desloca a hora de parede. ③ **Janela de UM MINUTO local**;
perdida, não gera atrasado, não desliga nada e reagenda pro próximo slot de CALENDÁRIO
(⛔ nunca `agora + intervalo`). ④ Dentro da janela, **monta com `_leTorneio` na transação** e
persiste **só por `_gravaTorneio`**. ⑤ **Trava de slot transacional** (`drawSlotAt`)
compartilhada por manual e automático: uma rodada por slot, retry não duplica.
⑥ A regra de agendamento mora na **fronteira única de escrita** (`_applyWriteBoundary`), por
onde passam sorteio manual, fecho de rodada, placar e cron — e `autoDrawReconcile` segue a
mesma decisão, então **nunca recoloca um `nextDrawAt` vencido**.

*Gates:* `test-agenda-core.js` (41 asserções, com DST provado em `America/Santiago` porque o
Brasil não tem desde 2019) e `test-autodraw-dividido.js` (33). Ambos no `npm test` e no
`npm run test:autodraw`. **Controle contra `c29544c9`:** com o módulo novo presente e o
`index.js` antigo, o segundo **falha em 8** — montagem na transação, `_gravaTorneio`, trava,
janela, gravação crua de `rounds`, offset fixo, fuso do evento e o reconciliador.

*⚠️ Consequência dita ANTES de publicar e conferida por simulação read-only:* o torneio que
estava vencido **não ganhou rodada** — o fuso dele **não é determinável** (sem `timeZone`, sem
coordenada utilizável, sem local reconhecido, organizador sem cidade), então ele sai da agenda
automática com diagnóstico, em vez de ganhar `nextDrawAt` futuro. É a regra (d) valendo sobre
a da janela. ⏳ **Dívida aberta:** enquanto os eventos não declararem fuso (ou não tiverem
coordenada — medido: `venueLat`/`venueLon` são **nulos nos 44**), o sorteio agendado fica
inativo para eles. O caminho MANUAL não é afetado. Nenhum dado foi alterado por esta leva.

**L6.R1.1 — a trava de slot passou a ter prova REAL, no emulador (31/ago/2026). Só teste;
nada de produto, versão ou publicação.**

*A evidência que faltava, e por que a antiga não bastava.* A L6.R1 entregou a trava
(`drawSlotAt`, reivindicada dentro da transação que grava a rodada) com um gate que era
**modelo em memória**: `test-autodraw-dividido.js` chama `reivindicarSlot` duas vezes no
mesmo objeto e vê a segunda recusar. Isso prova a REGRA, não o MECANISMO — e o mecanismo é o
que segura a invariante em produção: quem impede a segunda gravação não é o `if` do módulo, é
a **transação do Firestore**, que aborta um dos dois concorrentes e o **re-executa**; é na
re-execução, lendo a marca já gravada, que o perdedor desiste. Modelo em memória não tem
abort, não tem retry e não tem servidor — testa ao redor do bug
([[project_concurrency_safe_saves]], [[feedback_a_trava_vale_onde_mora_a_verdade]]).

*O gate novo.* `functions-autodraw/test-corrida-slot-emu.js` sobe o **Firestore Emulator**
(porta 8097, própria — 8080 é o de concorrência, 8098/8099 são os de rules) e dispara
`Promise.all` de **duas transações reais** sobre o **mesmo documento**: uma representa o
caminho automático, a outra o manual. As duas leem, tentam reivindicar o **mesmo**
`drawSlotAt` com a `reivindicarSlot` REAL do `agenda-core`, e gravam a consequência no mesmo
documento transacional. Uma **barreira** segura as duas depois do read e antes do write, só
na primeira tentativa — sem ela uma poderia commitar antes de a outra ler e **não haveria
disputa nenhuma**: o teste passaria sem testar.

*O que ele mede, em 12 corridas, por leitura final do emulador:* exatamente uma vence
(12/12); `drawSlotAt` é o slot disputado (12/12); **uma** rodada persistida (12/12); zero
jogo duplicado — 1 jogo, 1 id distinto (12/12); a agenda avançou **uma única vez**, medida por
contador `_avancos` (12/12) e parou no próximo slot de calendário (12/12); o retry do vencedor
não vence de novo nem cria rodada (1→1) e não move o contador (1→1); e nas duas ordens
sequenciais (manual→auto e auto→manual) o segundo não gera. ⭐ E o teste confirma que a
disputa foi REAL: **houve re-execução de transação em 12/12** corridas — o abort vem do
servidor, que é justamente o que o modelo em memória não tinha.

*Prova de que o teste PEGA a falha (sonda, em árvore separada).* Com `reivindicarSlot`
desligada — a linha que recusa o slot repetido removida —, a suíte fica **vermelha em 13
asserções**: "uma rodada" cai pra 0/12, o retry passa de 2 para 3 rodadas e as duas ordens
sequenciais quebram. Verde que não sabe ficar vermelho não é gate.

*Preservado:* a asserção estrutural de que os caminhos de produção reivindicam o slot **dentro
de `db.runTransaction`** e **antes** do `_gravaTorneio` — agora para os três (`autoDraw`,
`drawRound`, `closeRound`), comparando as posições no texto, e não só a presença.

*Onde roda:* `npm run test:autodraw` **e** `npm test` (registrado em `tests/run-unit.js`, que
executa cada suíte em processo próprio). ⚠️ **Preço medido:** o `npm test` passou de ~2min30
para **4min03** — a diferença é o boot do emulador, e o `npm test` é predeploy do Hosting.
⛔ Nenhum código de produto foi alterado para tornar o teste possível.

**L6.R2.P0 — inventário read-only da ORIGEM e da PERSISTÊNCIA do fuso do evento
(31/ago/2026). ⛔ Nada editado, nada publicado, nenhum dado de produção lido — tudo abaixo
sai do código.** Não escolhe arquitetura, não mexe em schema e não propõe migração.

**(1) OS CAMPOS DE LOCAL QUE EXISTEM HOJE NO TORNEIO.** Sete, todos `venue*`, e nenhum de
fuso: `venue` (texto livre; recebe `nome, cidade` concatenados), `venueAddress`
(`formattedAddress` do Places), `venueLat`, `venueLon`, `venuePlaceId`, `venuePhotoUrl`,
`venueAccess`. ⛔ **Não existe `timeZone`, `timezone`, `fusoHorario`, `venueCity`,
`venueState` nem `venueCountry` em lugar nenhum do produto** — a varredura de `js/`,
`functions/`, `functions-autodraw/`, `tests/`, `scripts/` e `firestore.rules` só acha
`venueCity` numa linha: `functions-autodraw/agenda-core.js:247`, o próprio resolvedor.
Ou seja, **uma das fontes que o resolvedor consulta nunca foi escrita por ninguém.**

**(2) ONDE CADA UM NASCE, É EDITADO E SALVO.** Tudo em `js/views/create-tournament.js`, que
é a MESMA tela de criar e de editar. Os campos são `<input type="hidden">`
(`:868-871`) preenchidos pelo seletor do Google Places (`:3284-3320`, `fields:
['displayName','formattedAddress','location','types','addressComponents','id','photos']`);
o payload que vai pro banco monta em `:5313-5320` e é gravado em `:5384-5389`. A reabertura
para edição repovoa os mesmos campos em `:4642-4689`, e o template em `:6982`.
⛔ **NÃO há caminho que apague** os campos de local isoladamente — some junto com o torneio.

*⭐ E é aqui que o dado estruturado é JOGADO FORA.* Em `:3294-3301` o código percorre
`place.addressComponents` e extrai a **localidade** (`locality` ou
`administrative_area_level_2`) numa variável `city`. Em `:3305` essa `city` é usada só
para montar o rótulo (`displayName = nome + ', ' + city`) e **nunca é persistida como
campo**. O produto TEM a cidade estruturada na mão, no instante da criação, e guarda só a
frase concatenada.

**(3) O PERFIL DO ORGANIZADOR.** Tem `city` (texto livre, `js/views/auth.js:5334`, input
`profile-edit-city`), `preferredCeps` (input `profile-edit-cep`) e `preferredLocations[]`.
⛔ Não tem estado, país nem fuso. ⚠️ `preferredLocations[]` guarda `{name, lat, lng|lon,
placeId}` com coordenada **numérica** (`js/presence-geo.js:164-165`) — é a origem mais
confiável que existe no perfil, e o resolvedor **não a lê**. Do perfil, o que chega ao
autoDraw é o que `_fusoDoEvento` (`functions-autodraw/index.js`) passa adiante: o documento
inteiro de `users/{creatorUid}`; e o que o resolvedor **usa** dele é só `timeZone`, `city`,
`cidade` e `state` (`agenda-core.js:251-252`) — ou seja, na prática **só `city`**.

**(4) A ORDEM EFETIVA DE RESOLUÇÃO, com linha** (`agenda-core.js:233-256`):
(a) `:236-240` declarado no evento (`timeZone`/`timezone`/`fusoHorario`); inválido **recusa**,
não cai pro próximo. (b) `:242-246` coordenada do evento; `:247-248` texto
(`venueAddress | venueCity | venue`). (c) `:251` `perfil.timeZone`; `:252`
`perfil.city|cidade|state`. (d) `:255` não determinado.
⛔ **A alínea (b)-coordenada está MORTA POR TIPO, não por falta de dado.** `_porCoordenada`
exige `typeof lat === 'number'` (`:223`) e `resolverFuso` só a chama se
`typeof t.venueLat === 'number'` (`:243-244`). Mas o writer grava **string**: em `:3313-3314`
de `create-tournament.js` o picker faz `latEl.value = place.location.lat()` (atribuir a
`.value` converte pra texto) e o payload leva `venueLat: venueLatVal` — o `.value` cru, sem
`parseFloat`. **Todo o resto do app sabe disso e converte na leitura**: `tournaments.js:1517`
`Number(t.venueLat)`, `bracket-ui.js:768`, `tournaments-organizer.js:640`, `arbitros.js:183`,
`weather.js:306`, `tournaments-enrollment.js:354`, `create-tournament.js:4657` — sete leitores
com `Number`/`parseFloat`. O resolvedor é o único que exige número **cru** e por isso nunca
resolve por coordenada, nem quando a coordenada existe.

**(5) ONDE O FUSO PODERIA SER PERSISTIDO CANONICAMENTE.** O instante natural é o
**momento em que o organizador escolhe o local** (`create-tournament.js:3284-3320`): ali já
existem `place.location` (lat/lng numéricos), `place.addressComponents` (com `locality` e
`administrative_area_level_1`) e `place.id` — tudo o que hoje é descartado ou achatado em
texto. Persistir dali é o único ponto que não exige inventar nada: não usa UTC, não usa
offset fixo, não usa o fuso do servidor. ⚠️ **E não pode usar o fuso do APARELHO**
(`Intl.DateTimeFormat().resolvedOptions().timeZone`): é o fuso de quem cria, não o do evento —
um organizador viajando cadastraria o torneio no fuso errado, e ninguém veria.
*Rules:* um campo novo de topo já nasce **só do organizador** — `isTournamentAdmin` autoriza
o update, e `isParticipantBracketDiff` (`firestore.rules:97`) é allowlist que não o contém,
então participante não escreve. Nada a mudar nas Rules para isso.

**(6) LEGADO SEM LOCALIZAÇÃO.** Torneio antigo, ou com local digitado à mão, tem só `venue`
como frase. A alínea (b)-texto ainda o alcança quando a frase contém cidade/UF conhecida
(`_porTexto`, `:205-220`), e recusa quando há **dois** estados no texto (`:219`), que é o
comportamento certo. Fora disso cai em (d) e **não há sorteio automático** — sem quebrar
nada: o caminho manual (`drawRound`/`closeRound`) não depende de fuso.

**(7) TESTES, LACUNAS E INVARIANTES.** Cobertura hoje: `test-agenda-core.js:22-50` prova as
quatro alíneas, o inválido que recusa, o `0,0`, e o texto ambíguo —
⛔ **mas passa a coordenada como NÚMERO** (`:37`, `venueLat: -3.1`). É uma forma que o
produto **nunca grava**. Um teste que usa um tipo que o writer não produz não pode pegar o
defeito do item (4) — é a mesma família de "fixture que o teste sabia ler"
([[feedback_congelador_cego_procurava_o_jogo_no_escopo_errado]]).
*Lacunas objetivas:* (i) nenhum teste alimenta `resolverFuso` com o payload REAL da criação
(strings); (ii) nenhum teste prova que o que a tela grava é o que o resolvedor consegue ler —
não existe teste de ponta a ponta entre `create-tournament.js` e `agenda-core.js`;
(iii) `venueCity` não tem teste porque não tem writer. *Invariantes que uma leva futura
precisaria travar:* o tipo do que a tela grava é o tipo que o resolvedor aceita; toda fonte
lida pelo resolvedor tem writer conhecido; e nenhuma origem nova pode introduzir UTC, offset
fixo ou fuso do aparelho/servidor.

**(8) MATRIZ — origem × confiabilidade × writer × leitor × risco.**

| origem | confiabilidade | writer hoje | leitor hoje | risco |
|---|---|---|---|---|
| `timeZone` do evento | **alta** (declarado, validado por `Intl`) | **nenhum** | `agenda-core:236` | campo não existe: alínea (a) nunca dispara |
| `venueLat`/`venueLon` | **alta** se numérico (vem do Places) | `create-tournament.js:5386` como **string** | `agenda-core:243` exige **número** | ⭐ alínea (b) morta por TIPO |
| `venuePlaceId` | **alta** (id estável do Places) | `create-tournament.js:5387` | ninguém, para fuso | origem forte e não usada |
| `venueAddress` | média (frase; tem cidade/UF em geral) | `create-tournament.js:5386` | `agenda-core:247` | funciona só se a cidade estiver no dicionário |
| `venue` | baixa (rótulo livre) | `create-tournament.js:5384` | `agenda-core:247` | "Quadra do condomínio" não resolve |
| `venueCity` | — | **nenhum** | `agenda-core:247` | fonte **inexistente** lida pelo resolvedor |
| `users.city` | média (texto livre) | `auth.js:5334` | `agenda-core:252` | é a única do perfil que chega |
| `users.preferredLocations[].lat/lng` | **alta** (numérico) | `presence-geo.js:164` | **ninguém** | origem forte e não usada |
| `users.preferredCeps` | alta (CEP → município) | `auth.js` (`profile-edit-cep`) | **ninguém** | exigiria tabela/serviço de CEP |
| fuso do aparelho | **baixa** para o evento | — | — | ⛔ tenta parecer certo e erra em viagem |

═══ CLASSIFICAÇÃO ═══

*Decisão já adotada (registro).* O fuso é do LOCAL DO EVENTO, por IANA; sem certeza não há
sorteio automático (L6.R1); ⛔ nunca UTC, offset fixo ou fuso do servidor.

*Problema aberto.* **(A)** A alínea de coordenada não dispara porque o writer grava string e
o resolvedor exige número — código, não dado. **(B)** `venueCity` é lida e nunca escrita.
**(C)** A criação extrai a localidade estruturada do Places e a descarta, guardando só a
frase. **(D)** O teste da coordenada usa número, tipo que o produto não grava. **(E)** As
duas origens mais confiáveis do perfil (`preferredLocations` numérico e `preferredCeps`) não
são lidas. **(F)** ⚠️ *Retificação da L6.R1:* onde ficou escrito que `venueLat`/`venueLon`
são "nulos nos 44", o correto é **"não-numéricos nos 44"** — o script contava como nulo
qualquer valor que não fosse `integerValue`/`doubleValue`, e string cai aí. A conclusão da
leva (o fuso não resolvia) não muda; a causa provável passa a ter duas explicações possíveis,
e distinguir exige medir de novo.

*Hipótese (não verificada nesta etapa).* Que parte dos 44 tenha coordenada gravada como
STRING e não ausente — o que tornaria (A) a causa dominante e faria o conserto ser de leitura,
não de captura de dado novo. Confirmar exige uma leitura de produção que esta leva proibiu.

*Proposta futura (nada escolhido, nada autorizado).* As origens candidatas, em ordem de
confiabilidade medida: campo `timeZone` persistido na escolha do local; coordenada numérica
já existente; `venuePlaceId`; localidade estruturada do `addressComponents`;
`preferredLocations` do organizador. ⛔ Nenhuma foi escolhida, nenhum schema foi alterado e
nenhuma migração foi desenhada.

**L6.R2.3 — preflight completo antes do push (01/set/2026). Só o fluxo de deploy; nada
publicado, versão inalterada.**

*Problema comprovado.* `scripts/deploy-hosting.sh` empurrava o commit pro `main` (passo 2) e
só DEPOIS extraía a cópia e rodava o predeploy. Isso reprovou **duas vezes em um dia**: na
2.1.81 um gate falhou com o `main` já adiantado — e o conserto virou um commit a mais, porque
desfazer o que já está no remoto é pior; na 2.1.82 só não doeu porque o ensaio foi feito **à
mão**, o que não protege o próximo deploy de ninguém.

*Correção.* Novo passo **1.9 · PREFLIGHT**, antes de qualquer `git push`: monta a cópia fiel
do `HEAD` e roda ali os **mesmos cinco comandos** do `hosting.predeploy`, com
`SP_EXIGE_CORRIDA_REAL=1` — ou seja, a corrida manual × automático roda **de verdade no
Emulator**, sem desfecho "pulada". Reprovou: encerra **antes** do push, não chama
`firebase deploy` e não toca em `origin/main`, dizendo a causa e onde ficou a cópia.
⭐ E a cópia é montada por **uma função só** (`montar_copia`), usada pelo preflight e pela
publicação — duas montagens divergiriam, e divergir aqui seria o preflight aprovar uma árvore
que não é a que sobe. A **trava dura do `CACHE_NAME`** também subiu para antes do push, pelo
mesmo motivo. E `check-version-ahead` passou a rodar no **repositório de verdade** (na cópia
não há `.git`, e lá ele passava vazio).

*Gate novo — e ele usa repositório e remoto REAIS, não mock.*
`tests/preflight-antes-do-push.test.js` cria um repo e um remoto em /tmp, põe um `firebase` e
um `npm` falsos no PATH e roda o script inteiro nos dois desfechos: reprovado → **o remoto não
se move** e o `firebase deploy` **nunca é chamado**; aprovado → o push acontece e só então o
upload. **Controle contra `7894af10`: falha em 16** — e a linha que importa é literal: com o
script antigo, o commit de release **chegou ao remoto** mesmo com o gate reprovando.

*Duas asserções de outros testes foram INVERTIDAS de propósito, e isso é ganho:*
`nota-de-versao-e-cobrada-onde-tem-git` media a posição do texto `git archive`, que agora é a
DEFINIÇÃO da função — passou a medir a **chamada**, que é o que descreve a execução; e
`deploy-liga-firebase-admin` exigia "a checagem vem depois do push", que era a descrição fiel
do desenho ANTIGO — agora exige o contrário, que é o ponto desta leva.

*Invariante que fica:* nenhum commit de release é empurrado antes de tudo o que é preciso para
publicá-lo passar — na mesma forma em que vai ser publicado.

**L6.R2.2 — CONCLUÍDA E PUBLICADA (2.1.82, 01/set/2026).** Hosting apenas.


*Problema corrigido — o aviso não estava no fluxo operacional.* A L6.R2.1 pôs o aviso de fuso
indeterminado **só no formulário de criar/editar**, por onde o organizador passa uma vez. O
torneio vive na **ficha**, e era ali que o sorteio automático silenciosamente não acontecia.
Agora a ficha traz um aviso **persistente** (não toast) para **organizador e co-organizador**,
com as três informações exigidas — não está agendado, o manual continua, e como corrigir —
mais **ação direta de editar**. Some sozinho quando o local resolve; invisível para visitante
e inscrito. Ficha e formulário usam a **mesma** `_venueGeo.resolverFuso`, provado por teste
que roda 10 casos nos dois e exige resposta idêntica.

*Gate corrigido — "PULADA" não é aprovação.* A L6.R1.1 registrou a corrida no `npm test`, que
é o `hosting.predeploy`; o predeploy roda numa cópia de `git archive` sem
`functions-autodraw/node_modules`, então o teste se declarava pulado e **saía 0** — a 2.1.81
subiu com a prova de concorrência **não executada**. `scripts/deploy-hosting.sh` passou a
**ligar o `node_modules` do subprojeto dentro da cópia** (mesmo tratamento que a raiz já
tinha) e a exportar `SP_EXIGE_CORRIDA_REAL=1`, que transforma qualquer "pulado" em **vermelho**
nesse caminho. Sem a dependência no ambiente-fonte, o deploy **falha antes de qualquer
upload**, com o conserto escrito.

*Invariantes que ficam.* ① Aviso operacional mora onde o operador VOLTA, não só onde ele
passa. ② Uma decisão, um resolvedor: tela nenhuma pode ter heurística própria de fuso.
③ Gate que pode se declarar "pulado" precisa de um caminho onde o pulo é proibido — senão ele
é decoração no dia em que mais importa. ④ Teste que depende de subprojeto só serve de gate de
predeploy se o predeploy garantir a dependência.

*Gates novos.* `tests/aviso-fuso-na-ficha.test.js` (30) e
`tests/deploy-liga-firebase-admin.test.js` (22), ambos no `npm test`. O segundo **não confere
por leitura**: extrai o HEAD com `git archive`, confirma que a cópia não tem `node_modules`,
liga a dependência como o deploy faz e roda a corrida — 12 disputas reais, abort e retry em
12/12, 31 asserções, zero "PULADA".

**⚠️ CORREÇÃO À L6.R1.1, descoberta no deploy da 2.1.81 (01/set/2026).**
 A suíte
`test-corrida-slot-emu.js` foi registrada no `npm test` — e o `npm test` é `hosting.predeploy`,
que roda numa **cópia extraída por `git archive` em /tmp**. Lá `functions-autodraw/node_modules`
não existe (é gitignored), então o `firebase-admin` do driver não resolve e **o deploy foi
barrado**. ⛔ A saída não foi afrouxar nem fingir: na árvore de trabalho e no
`npm run test:autodraw` a corrida roda **inteira** (31 asserções, 12 disputas reais); na cópia
do predeploy, onde a dependência não existe, a parte do emulador é **PULADA em voz alta** —
impressa e contada — e as **14 asserções estruturais** continuam rodando, porque não dependem
de emulador nenhum. *Invariante que fica:* teste que exige dependência de subprojeto não pode
ser gate de `predeploy` sem dizer o que deixou de conferir.

**L6.R2.1 — CONCLUÍDA E PUBLICADA (2.1.81, 01/set/2026).**
 Fecha os problemas A, B, C e D da
L6.R2.P0. Publicado **Hosting apenas**.

*Causa-raiz corrigida.* A alínea de coordenada da resolução de fuso estava **morta por
TIPO**: `create-tournament.js` fazia `latEl.value = place.location.lat()` — atribuir a
`.value` converte pra texto — e o payload gravava `venueLat` como **string**, enquanto
`agenda-core` só aceita `typeof === 'number'`. E a **cidade estruturada** que o Places já
entregava era usada só pra montar o rótulo e descartada.

*Correção.* Uma **fronteira de tipo única** (`js/views/venue-geo-core.js`), por onde passam
criação, edição e template: `venueLat`/`venueLon` viram `number|null` — vazio, não-numérico,
`NaN`, infinito e fora dos limites geográficos viram `null`, e **coordenada é par** (metade
inválida derruba as duas). `venueCity`/`venueState`/`venueCountry` passaram a ser extraídos do
`addressComponents` e persistidos; `venue`, `venueAddress` e `venuePlaceId` ficaram intactos.
⛔ Nenhum fuso é deduzido: nem do aparelho, nem do servidor, nem UTC, nem offset fixo — a leva
**habilita** o resolvedor existente, não cria fallback.

*Aviso na tela.* Com sorteio automático ligado e fuso indeterminável, um aviso **persistente**
diz que o automático não vai acontecer e o que resolve (local na busca, ou cidade no perfil).
⛔ Não bloqueia o manual e ⛔ a tela não afirma agendamento enquanto o fuso for desconhecido.

*Gates novos.* `tests/venue-geo-core.test.js`, **67 asserções**, no `npm test`. Prova nos dois
sentidos: o payload **antigo** (string) NÃO resolve no `agenda-core` real e o **normalizado**
resolve — por coordenada e por cidade. **Controle contra `53f82846`: falha em 10.**

*⚠️ Dívida NOVA, assumida e travada — segunda cópia de uma regra.* O aviso precisa saber se o
fuso resolve, e quem resolve é `agenda-core`, que roda no servidor e termina em
`module.exports` (não carrega no navegador). Como a leva proibiu alterar o autodraw, o
resolvedor foi **espelhado** em `venue-geo-core.js`. A alternativa era o aviso adivinhar por
"tem texto no campo?" e dar **verde falso** para um local que o servidor recusa. A cópia só é
aceitável porque tem **gate**: o teste compara as três tabelas e roda 17 casos pelos dois
lados exigindo resposta idêntica — mesmo desenho do `check-vendor-fresh`.
⏳ *Proposta futura, não escolhida:* unificar de verdade, movendo o resolvedor para um
`*-core.js` compartilhado e vendorando-o para o autodraw — exige mexer no autodraw, o que
esta leva não podia.

*⏳ O que a L6.R2.P0 deixou aberto e SEGUE aberto:* (E) `preferredLocations` (coordenada
numérica) e `preferredCeps` do organizador continuam sem leitor; (F) a distinção entre
"coordenada ausente" e "coordenada string" nos torneios existentes **não foi medida** — a
correção vale para o que for gravado de agora em diante, e **nenhum backfill foi feito**.

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

**R1.4 — writer cliente natimorto de `discoveryFeed`. CONCLUÍDA E PUBLICADA (2.1.79,
31/ago/2026).** ⚠️ Achado durante a **L4.P6**, procurando precedentes de coleção-espelho
escrita pelo servidor. Não havia chip de `discoveryFeed` nesta auditoria até aqui — este é o
primeiro.

*Problema corrigido:* **writer cliente natimorto**. `js/firebase-db.js`, em
`deleteTournament`, tentava `collection('discoveryFeed').doc(tId).delete()` — e a coleção tem
**um único** bloco de regra, `allow read: if true; allow write: if false`, com `delete` dentro
de `write`. O único curinga do arquivo é `match /{path=**}/results/{matchId}`, que só casa
caminho terminando em `results/{matchId}` e nunca um documento de topo: **nenhuma outra regra
podia conceder**. Não é regressão — a regra nasceu junto com a coleção em 03/jun/2026
(`d4a03da6`, v1.9.92) e nunca foi outra coisa; a tentativa do cliente entrou **dois meses
depois** (01/ago/2026, `8e019813`). O `catch (e) {}` mudo — sem log, sem `_captureException`,
sem Sentry — é o que fez isso durar, no mesmo método em que a limpeza de subcoleção, uma linha
acima, grita de propósito.

*Decisão adotada:* **o servidor é a única autoridade de remoção do índice.** Dois caminhos
independentes, ambos por Admin SDK (que ignora as Rules) e ambos deployados:
`syncDiscoveryFeed` (`onDocumentWritten` em `tournaments/{tid}`, `functions/index.js:7825`)
remove quando o torneio some **ou** deixa de ser público; `purgeTournamentCopies`
(`onDocumentDeleted`, `:8338`, passo 5 na `:8433`) remove **incondicionalmente** — é a rede que
cobre o guard de `isPublic` do primeiro. O cliente não participa, e a Rule que já dizia isso
fica **intocada**.

*Evidência de produção (read-only, agregada, colhida antes de editar):* **44 torneios, 43
públicos, 43 documentos em `discoveryFeed`, ZERO órfãos**, zero público sem doc no feed — o
conjunto do feed é exatamente o dos públicos, 1:1. Com provas de sanidade contra a leitura por
REST que erra em silêncio (43/43 com o campo `tid`; `tid` ≠ id do doc em 0 casos; exit
não-zero se a coleção voltar vazia). E os gatilhos executam: desde 01/jun,
`purgeTournamentCopies` rodou **22 vezes com 0 erro** e `syncDiscoveryFeed` registrou **15
remoções** `(deleted/private)`.

*Gate corrigido — e ele estava INVERTIDO.*
`tests/apagar-torneio-nao-deixa-orfao.test.js` exigia `'o índice de descoberta foi apagado'`
contra um **Firestore de mentira cujo `delete()` só ANOTA**: mock de cliente não sabe negar,
logo **nunca validou autorização**. Trinta dias de verde sobre uma linha que a produção negava
100% das vezes — mesma família do congelador cego (fixture que o teste sabia ler). Agora:
a asserção exige que o cliente **não** tente; a ordem "subcoleções PRIMEIRO, torneio DEPOIS"
segue provada como estava; e os dois caminhos de servidor são provados **por fonte**, no idioma
que o arquivo já usava — âncora no `exports.` (nunca no nome solto, que aparece em comentário) e
no fim do gatilho (nunca janela de N caracteres). ⛔ O teste **declara explicitamente o que não
prova**: que a regra nega em execução — isso é trabalho de suíte de emulador.
**Controle contra `d32d52b1`:** o teste novo falha em **2** na árvore anterior (a tentativa do
cliente e a trava anti-retorno do writer), e as asserções de servidor **passam dos dois lados**,
provando que o corte não inventou comportamento que já não existisse.

*⏳ Dívida ainda aberta — registrada, NÃO corrigida nesta leva:* o passo 5 de
`purgeTournamentCopies` **também engole a falha** (`catch (e) {}`) e **não entra no contador**
do resumo do log. Hoje não falha; no dia em que falhar, ninguém vê. É observabilidade de
servidor (família da L16) e ficou **deliberadamente fora do escopo** — mexer em Functions não
estava autorizado nesta leva.

*Publicado:* versão **2.1.79**, **Hosting apenas**. ⛔ Functions, Rules, autodraw, Stripe e
bundles nativos **não** foram publicados; `firestore.rules`, `functions/`, `functions-autodraw/`,
`android/` e `ios/` têm diff **vazio**, e nenhum dado foi lido para escrita ou migrado.

## Leitura correta do progresso

L0 resolveu uma falha concreta de consistência e reparou os dados afetados. Isso **não**
fecha, por aproximação, L6–L8 nem autoriza L10–L16. O próximo item técnico de menor
escopo e causa já comprovada é L1 (`/mail`); ainda assim, ele permanece pendente até
seleção explícita do arquiteto.

## CONFRA.QA.P0 — oráculo da Confra antes do teste da fase 2 (01/set/2026)

Leitura **somente de produção**, com a 2.1.83 no ar. Nada foi escrito, nenhum sandbox foi
criado, apagado ou avançado, e o objeto de entrada ficou **byte a byte intacto** depois de
rodar o motor numa cópia em memória. Os fatos abaixo são novos e não têm PII.

**① O alvo é único, e o que o distingue não é o nome.** Há dois torneios com "Confra" no
nome; o de produção é o único **sem `sandboxOf`**. O campo `sandboxOf` é o sinal confiável —
o nome do sandbox por acaso também casa com heurística de texto, mas heurística de nome não
é identidade e não deve ser usada sozinha em nenhuma varredura.

**② A forma dos documentos das subcoleções, e por que remontar à mão lê VAZIO.** Em
`tournaments/<id>/matches` cada documento é `{_chave, _loc, jogo, playerUids}` — o jogo mora
em `jogo` e a **posição** dele (rodada/grupo) em `_loc`. Em `inscritos` é `{_idx, item, _k}`.
Uma primeira tentativa remontou supondo `{m}`/`{p}` e devolveu **0 jogos** e 152 "inscritos"
que eram os envelopes, não as pessoas — **sem erro nenhum**. É a mesma armadilha já
registrada para REST, agora pelo Admin SDK: leitura errada não falha, ela vem vazia.
⇒ Quem monta tem de ser `tournament-split-core.montarDoBanco`, e o resultado tem de ser
conferido contra `_nPartes`/`_nJogos`, que é o que o escritor prometeu. Conferido: 115
documentos de jogo → **105 jogos reais** (10 são BYE/folga), todos concluídos, todos na
fase 0; 152 inscritos.

**③ ⚠️ DUAS PORTAS RESPONDEM "QUEM CLASSIFICA" E DISCORDAM.** A fase 2 da Confra está
configurada com `source.scope = 'overall'` (2 linhas, 35 grupos). Nesse arranjo:
- `selectQualifiers` devolveu **2 equipes** (1 por linha);
- `buildPhaseBrackets` gerou **100 jogos** com **70 duplas** corretas.

As duas leem o mesmo `scope` e caem em ramos diferentes. Quem **materializa** a fase — e
portanto quem decide o que vai para o banco — é `buildPhaseBrackets`; `selectQualifiers` é
usada no **pré-cheque do painel de promover linha** (`_phasePromoteHelps`). Ou seja, o painel
de promoção pode estar decidindo sobre um conjunto que não é o que será materializado.
*Dívida registrada, NÃO corrigida nesta leva* (leva era read-only): unificar as duas portas
ou provar por teste que o pré-cheque enxerga o mesmo conjunto do materializador.

**④ O tamanho da correção da 2.1.83, medido no dado real.** Dos 35 grupos, **25 têm
`classifCongelada`** (24 com `classifCongeladaAt`, **1 legada sem o carimbo**) e **10 ainda
não têm** — nesses 10 o retrato **nasce no avanço**, a partir da ordem ao vivo. Nos 25 que
têm, a porta da 2.1.83 devolveu **exatamente a congelada em 25/25**. E a medida que importa:
em **24 dos 25** a ordem **ao vivo diverge** da congelada, e em **todos os 24** a divergência
**atinge o top-4** — isto é, sem a correção, 24 grupos formariam **duplas diferentes** das
publicadas. O defeito não era de um grupo; era de quase todos.

**⑤ Oráculo do resultado esperado** (motor da 2.1.83, cópia em memória, entrada intacta):
100 jogos na fase 2, distribuídos em `{1:36, 2:32, 3:16, 4:8, 5:4, 6:4}`; **140 slots** do
top-4 presentes na chave e **nenhum** 5º colocado; **70/70** duplas na ordem de
**Performance** (1º+2º, 3º+4º); a única vaga coringa do torneio está em **5º** e **não
avança**; as duas "equipes de 1 slot" da 1ª rodada são o **mesmo marcador "a definir"** da
chave, não pessoas — 142 slots com 141 distintos, sem ninguém repetido. Tela: primeira
rodada visível **"Rodada 2"** (local 1 / global 2), contador da fase **0/100**, agregado do
torneio **105/205**.

## CONFRA.QA.P0.3 — a unificação da transição, publicada como 2.1.84 (01/set/2026)

Fecha o item ③ da CONFRA.QA.P0, que ficou registrado como dívida porque aquela leva era
read-only. **Escopo publicado: Hosting apenas.** Nenhuma escrita em Firestore, nenhum
sandbox criado/apagado/avançado, nenhuma fase avançada em produção.

**① A causa, e por que o erro era grande.** As duas portas montavam os `opts` à mão e só o
pré-cheque repassava `source.flatOverall`. O tamanho do desvio, porém, vem da **interação
com `_mappingLegadoConfra`**: ele reescreve as duas faixas abertas (`1..999`) em `1-2`/`3-4`,
isto é `maxRankTo = 4`. Por **grupo** isso significa "1º+2º e 3º+4º **de cada grupo**";
sobre o ranking **geral** o mesmo `4` vira "**top-4 do torneio inteiro**", e a lista de 140
pessoas era cortada no 4º — daí as 2 equipes que a P0 mediu.

**② O prejuízo não era de exibição: o organizador perdia uma decisão.** `_phasePromoteHelps`
recusa `size <= 1`. Com **35/35** (dois ímpares; uma promoção deixa 36/34) o painel de
promover linha **devia** ser oferecido — lendo **1/1**, ele **nunca** aparecia, e a fase caía
em BYE/repescagem sem que ninguém soubesse que havia escolha. ⚠️ Com os **34** grupos do
snapshot as duas portas coincidem **por acaso** (34 é par): foi isso que escondeu o defeito.

**③ Uma porta só, e a regra num lugar só.** `optsDaTransicao` e `mappingDaTransicao` passam
a montar `opts` e `mapping` das duas portas (e do rótulo de linha em `advanceMultiPhase`, que
era a 3ª cópia). A pergunta "usa ranking geral?" virou `usaRankingGeral`, **exportada**, com a
neutralização do legado: `flatOverall:true` gravado sobre **Rei/Rainha de rodada única** vale
`false` — mesma condição e mesmo motivo do `_mappingLegadoConfra`, porque com **uma** rodada
os grupos não rotacionam e o compilador de hoje grava `per_group` para esse arranjo.
⭐ `bracket.js` (`_hideGeneralStandings`) era a **terceira** cópia da mesma pergunta, com um
comentário admitindo que o campo do doc "mente"; agora ela **pergunta ao motor**. Varredura
das **648** formas alcançáveis: decisão idêntica em todas, exceto **4** que exigem
`flatOverall:true` sobre fase anterior **não**-Rei/Rainha — combinação que
`format2.compileToPhases` **nunca** escreve (conferido no fonte, travado por asserção).

**④ Segunda divergência do mesmo par, achada no caminho.** Sem `source.mapping`, o pré-cheque
assumia `rankTo:999` e o materializador `rankTo:2` — **16 entrantes contra 8**. Unificado no
do materializador, que é quem publica.

**⑤ O materializador NÃO mudou.** Asserido: mesmas **70 duplas**, todas intra-grupo, mesmos
**100 jogos**. Consertar o pré-cheque não reescreve chave que já foi ao ar.

**⑥ A trava que faltava, sobre o `_advanceMultiPhase` REAL.** `tests/congelada-nasce-no-avanco-e-nunca-muda.test.js`
(**29 asserções**) monta a Confra equivalente com os **35 grupos em DOIS estados** — **25** já
congelados (um deles **legado**, sem `classifCongeladaAt`) e **10** sem — e avança de verdade:
as 25 seguem **byte a byte** iguais; as 10 são congeladas **exatamente** pela classificação que
a **tela** mostrava no instante anterior (medida pela expressão do render, não por uma cópia da
do motor) e nascem **com** carimbo; depois do avanço são **35/35**; e nada é recalculado depois
de congelado — idempotência medida e a guarda conferida por fonte. ⭐ O cenário é construído
para **divergir**: a congelada dos 25 é a ordem viva **invertida**, então um recálculo trocaria
Ouro por Prata e as asserções acusam. Fecha no oráculo da P0 ⑤: **105** jogos na fase 0, **141**
pessoas, **70** duplas, **100** jogos, **140** slots do top-4, **nenhum 5º**, **"Rodada 2"** e
contador **0/100** — e, ao **promover**, **Ouro 36 / Prata 34**, movendo a **dupla inteira**.

**⑦ Controles (sem eles nada disso é prova).** `tests/duas-portas-um-classificado.test.js`
(**24 asserções**, sobre a config real do snapshot, com a `_phasePromoteHelps` **real** lida do
arquivo e varredura de **96** combinações) falha em **18** na árvore anterior; o teste do
congelamento falha em **3** sem a guarda de idempotência e em **12** sem a neutralização do
legado. Os CONFRA.P1/P2/P2.1 seguem verdes.

**⑧ Publicação.** Versão **2.1.84**, **Hosting apenas**. ⛔ `firestore.rules`, `functions/`,
`functions-autodraw/index.js`, `functions-stripe/`, `android/` e `ios/` com diff **vazio**;
o único arquivo tocado em `functions-autodraw/` é `vendor/phases-engine.js`, que é **cópia
gerada** por `copy-vendor.js`. `sw.js` mudou **somente no `CACHE_NAME`**.
