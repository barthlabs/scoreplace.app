# Auditoria arquitetural — mapa de levas

> Registro operacional criado em 30/ago/2026. Ele organiza o backlog já conhecido;
> **não autoriza nenhuma implementação**. Cada leva só entra em execução após escolha
> explícita do arquiteto, com causa-raiz, invariantes, tentativas anteriores e gates
> relidos antes de editar.

## Medição de referência

- **17 levas** no mapa: 1 concluída e 16 ainda não iniciadas.
- Por contagem de levas (não por esforço): **5,9% concluído** e **94,1% restante**.
- A porcentagem não é prazo: `Vite`, Capacitor e migrações de identidade são maiores
  que uma correção de Rules, por exemplo.

| Leva | Tema do backlog | Situação em 30/ago | Gate antes de executar |
|---|---|---|---|
| L0 | jogos divididos: fonte `matches` → projeção `results` | **Concluída em produção (2.1.60).** 42 torneios / 183 jogos auditados; 7 reparos; 0 ausentes e 0 divergentes. ✅ **Reconferido em 31/ago/2026, pelo Codex**, depois da R0.4.2 pôr deadline de parede no transporte: **42 torneios · 9 com jogos canônicos · 183 jogos canônicos · 0 results ausentes · 0 results divergentes.** Os contadores foram capturados pelo verificador, não por quem implementou — que é o que faltava desde 30/ago, quando a execução ficava viva por mais de 3 minutos e era encerrada sem imprimir nada. | Conferidor read-only permanece no runner. |
| L1 | `/mail` client-writable | **Aberta, causa confirmada.** `firestore.rules` aceita write de qualquer autenticado; `js/firebase-db.js` e `js/views/auth.js` escrevem direto. | Preservar a extensão de e-mail; trocar a porta por Function e fechar Rules sem perder fluxos legítimos. |
| L2 | fila de notificações/e-mail | **Aberta.** `notif_email_queue` ainda aceita create pelo cliente. | Mapear emissores e deduplicação antes de fechar a fila. |
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
| L15 | testes não descobertos automaticamente | **Aberta.** | Catálogo de testes e gate que falha para arquivo novo não registrado. |
| L16 | observabilidade e hardening | **Aberta.** | Métricas, alertas e runbooks definidos por risco, sem registrar PII. |

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
