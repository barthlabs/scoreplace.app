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
| L3 | `casualMatches` | **Aberta, causa confirmada.** qualquer autenticado pode escrever qualquer documento. | Definir autoridade por sessão/participante e concorrência do placar ao vivo. |
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
