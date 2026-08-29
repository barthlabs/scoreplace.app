# Cutover da autoridade de amizade — 2.1.48

**Procedimento executável. Sem janela em que o backfill leia dado ainda adulterável.**

## Por que a ordem é esta

A escalada da 2.1.47 permitia que qualquer autenticado escrevesse `users/{qualquer}.friends`.
Se o backfill rodasse **antes** de a escrita ser fechada, ele leria um estado ainda adulterável
e canonizaria o que um atacante tivesse acabado de escrever. Por isso: **fecha a escrita
primeiro, congela, depois lê.**

Falhar fechado é aceitável nesta janela: amizade pode ficar temporariamente indisponível para
clientes antigos. Vazar não é.

---

## PRÉ-FLIGHT — nada é escrito nesta etapa

```bash
node scripts/check-nativo-pronto-para-corte.js
node scripts/backfill-amizade.js --preflight-primeiro-corte
node scripts/backfill-amizade.js            # dry-run: mostra projeto e alvo efetivo
```

⛔ **O pre-flight do marcador não é opcional.** Ele aborta se `_meta/amizadeMigration` já
estiver em `frozen`/`backfilled`/`live`, ou com `maintenance` ligada, ou em outro projeto.
Sem ele, uma tentativa anterior ou um comando acidental faria as Functions novas subirem
**liberadas** enquanto o runbook acha que estão congeladas. **Retomar** uma migração
interrompida é outro modo: siga a partir da fase real, conscientemente — não por aqui.

Confira no cabeçalho de todo script: `projectId`, `FIRESTORE_EMULATOR_HOST` e **alvo
efetivo**. Operação de produção com emulador configurado **aborta** — o alvo nunca é
adivinhado.

### GATE A — TÉCNICO (verificável por script)

**Auditado em 29/ago/2026:** `capacitor.config.json` tem `webDir: "www"` e **não** tem
`server.url` — o app nativo roda o **JS embarcado no binário**. Publicar no Hosting não
atualiza o nativo. iOS e Android estão em **2.1.28**, e **não existe force-update nem
minimum-version** em lugar nenhum do código.

`check-nativo-pronto-para-corte.js` exige: build 2.1.48 produzido, versões carimbadas,
e lembra que a disponibilidade nas lojas é fato externo.

### GATE B — APROVAÇÃO HUMANA DO CORTE NATIVO

⛔ **Este gate não é automatizável, e nenhum script deve fingir que passou.**

Mesmo com a 2.1.48 **publicada e aprovada** nas lojas, isso **não significa que os usuários
instalados atualizaram**. Não existe force-update retroativo para uma versão já instalada:
quem estiver na 2.1.28 continua na 2.1.28 até abrir a loja e atualizar.

Para essas pessoas, depois da Etapa A: as cinco operações de amizade escrevem
`users.friends` direto (código antigo), o Firestore recusa, e a tela **afirma** que deu
certo — o rollback otimista e o aviso de erro só existem a partir da 2.1.48. O resto do app
segue normal.

**Quem decide é o dono**, sabendo disso. Registre aqui:

```
APROVAÇÃO HUMANA DO CORTE NATIVO
  aprovado por: ____________________
  data:         ____________________
  ciente de que clientes em versões anteriores à 2.1.48 perdem a função de amizade,
  com falha silenciosa, até atualizarem pela loja.
```

⛔ Nunca afirme "os clientes nativos estão seguros" porque o source local está em 2.1.48.
⛔ E não se reabre as Rules por compatibilidade.

---

## ETAPA A — congelar CLIENTE **e BACKEND**, marcar, e só então fotografar

⛔ **As Rules congelam clientes. Cloud Functions usam Admin SDK e IGNORAM Rules.** Enquanto
o backend puder rodar merge automático, merge por telefone, merge explícito ou
`deleteAccount`, o grafo social muda **entre** o freeze, o snapshot e o backfill — e
`frozen` não é frozen. Por isso a trava de manutenção é server-side
(`functions/amizade-fase.js`): enquanto a fase for `not_started`/`frozen`, toda operação que
altere a autoridade social é recusada. O backfill é a única exceção — ele roda por fora,
com Admin SDK, e precisa escrever justamente nessa janela.

⚠️ **Ordem que resolve o ovo-e-galinha:** as Functions novas já nascem com a trava e a fase
começa em `not_started` — então elas sobem **recusando** operações sociais, sem tocar em
nada, e o lifecycle canônico só passa a valer quando a fase virar **`live`** — o último
comando de todo o cutover. (`backfilled` NÃO libera: ver a tabela adiante.)

```bash
# 1. Functions 2.1.48 — sobem JÁ CONGELADAS (fase = not_started ⇒ tudo recusado)
scripts/deploy-functions.sh main

# 2. ⛔ IMEDIATAMENTE as Rules: fecha o CLIENTE antes de qualquer espera
cp firestore.rules firestore.rules.final
cp firestore.rules.etapaA firestore.rules
firebase deploy --only firestore:rules --project scoreplace-app
cp firestore.rules.final firestore.rules

# 3. SÓ AGORA drenar: esperar as invocações ANTIGAS (Admin SDK) já iniciadas terminarem.
#    O maior timeout declarado é 300 s (mergePhoneAccount, deleteAccount). 10 min é folga.
#    Confira no console que não há execuções ativas de:
#      autoMergeOnProfileUpdate · scheduledAutoMergeCleanup · mergePhoneAccount
#      deleteAccount · requestNameMergeProof/dismissDuplicate*
sleep 600

# 4. marca `frozen` — daqui pra frente cliente E backend estão parados
node scripts/backfill-amizade.js --fase=frozen --aplicar

# 5. SÓ ENTÃO fotografa o estado congelado
node scripts/backup-amizade-legado.js --saida=backup-antes-do-corte.json

# 6. confere a foto (hash, contagem, fase que ela carrega)
node scripts/restore-amizade-legado.js backup-antes-do-corte.json   # dry-run
```

⛔ **Por que as Rules vêm ANTES do drain** (10ª auditoria): a ordem anterior esperava os
10 minutos e só então publicava as Rules — e durante essa janela o cliente antigo ainda
conseguia explorar a escalada da 2.1.47. Não há motivo técnico para esperar: **Rules não
interferem nas invocações Admin em andamento** (Admin SDK ignora Rules por definição), então
fechar o cliente primeiro não atrapalha o drain nem muda a lógica do snapshot. O drain
existe para as invocações de backend já iniciadas, e ele acontece igual, depois.

⛔ **Por que o backup vem DEPOIS do freeze:** a versão anterior deste documento mandava
fotografar antes, e entre a foto e o congelamento o legado ainda podia mudar — o backup
deixava de descrever o estado que o backfill iria ler. Se for preciso reverter as Rules
antes do backfill, nada foi destruído e o backup nem é necessário.

⛔ **A agendada também conta.** `scheduledAutoMergeCleanup` roda por cron e passa por
`_scanAndMergeByField`, que consulta a fase e **pula** enquanto congelado — não basta olhar
as callables.

O que muda com as Rules da Etapa A:

- os quatro campos entram em `privilegedUserFields()` — **nenhum cliente escreve**;
- **`statsVisibility = 'friends'` deixa de autorizar terceiros.** `public` segue público,
  `private` segue privado, `friends` fica visível só para o dono.

⛔ **Por que a leitura fecha junto.** Congelar impede fraude **nova**, não remove a que já
aconteceu. Quem tivesse inserido o próprio uid no `friends` de uma vítima durante a janela
da 2.1.47 continuaria lendo as estatísticas dela **para sempre**. O acesso volta por
reconfirmação, um par de cada vez.

## ETAPA B — snapshot e migração SEM conceder nada

Com a escrita congelada, o legado para de mudar. Mas **congelado não é confiável**: quem
explorava a falha da 2.1.47 podia escrever os DOIS lados de uma amizade, então
reciprocidade no legado é indistinguível de ataque. Nada do legado vira `accepted`.

```bash
node scripts/backfill-amizade.js                                    # dry-run
```

⚠️ O `--aplicar` só roda com a migração em `frozen` (Etapa A, passo 2). E as transições são
as normais, **só para frente**: `not_started → frozen → backfilled → live`. `live → frozen`
é proibido — sem isso, alguém "rebobinaria" a fase e rodaria o backfill destrutivo de novo.
Quem volta atrás é o `restore-amizade-legado.js`, que restaura dados **e** marcador juntos.

O que ele faz:

- resolve toda identidade pela porta da conta viva (lápide → conta viva; e-mail em array →
  uid, se resolver para **exatamente uma** conta viva);
- amizade recíproca antiga → `legacy_unverified`;
- convite antigo (consistente ou não) → `legacy_unverified`;
- amizade unilateral → **quarentena**, sem relação;
- **`friendAccess` concedido: 0.** O script aborta se esse número não for zero.

Resolver a quarentena num arquivo de adjudicação. Quarentena comum:

```json
[{ "id": "<pairId>", "decisao": "descartar", "porQue": "unilateral; o outro nunca confirmou" }]
```

Quarentena de **identidade/e-mail** exige o uid explícito — `decisao:"aceitar"` sozinha é
recusada, e o `pairId` é recalculado com os dois uids canônicos:

```json
[{ "id": "<uid>|friends|alguem@x.com", "decisao": "aceitar",
   "resolverParaUid": "<uidCanonicoVivo>", "porQue": "confirmado por telefone com as duas" }]
```

```bash
node scripts/backfill-amizade.js --aplicar --adjudicacao=adjudicacao.json
```

⭐ **Estabilidade do snapshot (defesa contra writer esquecido).** Imediatamente antes de
escrever, o `--aplicar` relê os campos sociais que geraram o plano e compara o hash com o
que foi lido no início. Se qualquer coisa mudou nesse intervalo — ou seja, se sobrou algum
writer que a trava não pegou — ele **aborta sem escrever**. O hash de entrada usado fica
registrado em `_meta/amizadeMigration.hashEntrada`.

**As fases da migração** vivem em `_meta/amizadeMigration` e quem as move é sempre uma
pessoa, com comando explícito:

**As duas travas, e o que cada uma faz:**

| fase | maintenance | operações sociais | backfill |
|---|---|---|---|
| `not_started` | qualquer | recusadas | ⛔ não |
| `frozen` | `false` | recusadas | ✅ **sim** |
| `frozen` | `true` | recusadas | ⛔ não |
| `backfilled` | qualquer | **recusadas** | ⛔ não |
| `live` | `false` | **normais** ← o único caso | ⛔ não |
| `live` | `true` | recusadas (rollback seguro) | ⛔ não |

⛔ **`backfilled` NÃO libera nada.** Ele marca o fim da Etapa B; a Etapa C ainda precisa do
deploy final das Functions, das Rules finais, do Hosting e das verificações. O backend
social só volta no **último comando do procedimento**: `--fase=live --aplicar`. Se qualquer
passo da Etapa C falhar antes disso, o sistema fica **degradado mas seguro** — nunca
meio-aberto.

| fase | quem marca | quando |
|---|---|---|
| `not_started` | — | estado inicial |
| `frozen` | operador, no fim da **Etapa A** | `--fase=frozen --aplicar` |
| `backfilled` | o próprio backfill, ao concluir | automático |
| `live` | operador, no fim da **Etapa C** | `--fase=live --aplicar` |

`--aplicar` só roda em `frozen`. Depois de `live` o script **recusa escrever** e
`--apagar-stale` deixa de existir — sem isso, uma execução após o go-live veria as amizades
novas como "extras" e as destruiria.

Ele só imprime `✅` depois de: reconciliar `friendships` e `friendAccess` por **igualdade de
conjunto**, reconstruir os quatro campos de cache de todos os afetados **a partir do cânone**,
e conferir cache por cache. Documento extra fora do plano aborta — `--apagar-stale` é decisão
explícita de quem roda.

**Efeito visível:** amizades antigas somem da lista até serem reconfirmadas, e
`statsVisibility = 'friends'` deixa de liberar para elas. É o custo consciente de não
transformar dado adulterável em autorização permanente.

---

## ETAPA C — Functions + cliente + Rules finais, e a reconfirmação

```bash
scripts/deploy-functions.sh main
firebase deploy --only firestore:rules --project scoreplace-app
scripts/deploy-hosting.sh
node scripts/backfill-amizade.js --fase=live --aplicar
```

Nesta ordem: Functions antes das Rules (senão `statsVisibleToCaller` passa a exigir
`friendAccess` sem que as CFs que o mantêm existam); cliente por último.

**A reconfirmação é o único caminho para `accepted`.** Convidar alguém com quem existe uma
relação `legacy_unverified` transforma a relação em `pending` (evento
`reconfirmacao-enviada`); o aceite do outro lado, pela autoridade nova, é o que gera
`friendAccess`. As relações legadas continuam legíveis pelas duas pessoas em
`friendships/{pairId}` — é dessa lista que uma tela de "reconfirme seus amigos" parte.

**A tela de reconfirmação faz parte desta leva.** Em Explorar, a seção "Amizades antigas
para reconfirmar" lista os pares `legacy_unverified` da pessoa (callable
`listLegacyFriendships`, que consulta só relações em que o caller é `uidA` ou `uidB` — não
há como enumerar relação de terceiro). "Reconfirmar" chama o **mesmo** `sendFriendRequest`;
"Descartar" chama o **mesmo** `removeFriend`. Não existe segunda autoridade.

### A única evidência independente aceita

Se alguém propuser promover relações antigas em bloco, a pergunta é: **qual evidência, fora
dos arrays vulneráveis?** "Está nos dois arrays" não é evidência — era gravável cross-user.
Evidência independente aceitável seria, por exemplo, registro de partida disputada entre as
duas pessoas, ou confirmação direta com ambas. Qualquer promoção assim passa pela adjudicação,
com `porQue` gravado no documento.

## Rollback

⛔ **A versão anterior deste documento prometia que voltar para as Rules da Etapa A
"restaura a leitura pelo array legado". Isso é FALSO** — e a promessa ficou errada quando a
Etapa A passou (corretamente) a fechar `statsVisibility = 'friends'`. Além disso, depois do
backfill o cache foi reconstruído do cânone e `legacy_unverified` não entra em `friends`.
Não há para onde "voltar a ler".

### A — ROLLBACK SEGURO (o operacional normal)

Voltar para as Rules da Etapa A e marcar a migração como congelada.

- amizade friends-only **continua fechada** — ninguém recupera autorização antiga;
- as operações sociais voltam ao estado de manutenção (a trava de fase as recusa);
- o serviço fica degradado, não inseguro;
- `friendships`/`friendAccess` já criados ficam de pé e inofensivos.

```bash
# 1. para o BACKEND sem rebobinar a migração
node scripts/backfill-amizade.js --maintenance=on --aplicar
node scripts/backfill-amizade.js            # confere: maintenance=true, fase INTACTA

# 2. fecha o cliente
cp firestore.rules.etapaA firestore.rules
firebase deploy --only firestore:rules --project scoreplace-app
```

Para voltar ao normal quando a causa estiver resolvida:

```bash
firebase deploy --only firestore:rules --project scoreplace-app   # com o rules final
node scripts/backfill-amizade.js --maintenance=off --aplicar
```

⛔ **`maintenance` é uma trava SEPARADA da fase, e é por isso que ela existe.** Rollback
seguro precisa parar o backend **sem** rebobinar a migração: com uma trava só, "parar"
significaria voltar a fase para `frozen`, e aí o backfill destrutivo ficaria autorizado de
novo. `maintenance=true` recusa amizade/merge/delete/auto-merge e **nunca** autoriza o
backfill. `live` continua terminal.

**É este o rollback que se usa.** Ele nunca ressuscita autorização forjada.

### B — ROLLBACK COMPLETO PARA O LEGADO (provavelmente inaceitável)

Voltar ao comportamento da 2.1.47 exige: restaurar o backup, republicar as Functions e o
cliente antigos, e republicar as Rules antigas. Isso **reabre conscientemente a escalada de
privilégio** que esta leva veio fechar — qualquer autenticado volta a escrever
`users.friends` de qualquer pessoa.

```bash
node scripts/restore-amizade-legado.js backup-antes-do-corte.json            # dry-run
node scripts/restore-amizade-legado.js backup-antes-do-corte.json --aplicar
```

⚠️ `scripts/backup-torneios.js` **não serve aqui** — ele salva torneios e não toca em
`users/`. O restore devolve o valor exato dos quatro campos (inclusive **apagando** campo
que antes não existia), desfaz `friendships`/`friendAccess` criados depois da foto, e
restaura o **marcador da migração** junto — dados de antes com fase de depois é estado
impossível.

**Só faça B com decisão explícita e registrada do dono.** A opção normal é A.

## Verificação manual, depois da Etapa C

Convidar · aceitar · conferir que sai de "pendentes" e entra em "amigos" **nos dois lados** ·
desfazer · cancelar convite enviado · recusar recebido · entrar por link `?ref=` e conferir
que chega **convite**, não amizade pronta.

E o que é novo neste corte:

- **reconfirmar uma amizade antiga**: convidar alguém que já era amigo antes do corte. Tem
  que virar convite pendente; depois do aceite do outro lado, `statsVisibility = 'friends'`
  volta a liberar para essa pessoa — e **não antes**;
- **antes de reconfirmar**, conferir que quem tinha "só amigos" NÃO é visível para o amigo
  antigo. Esse é o comportamento pretendido, não um defeito;
- **rejeição**: com a sessão de uma conta unificada (lápide), tentar aceitar/desfazer. A tela
  tem que voltar ao estado anterior e mostrar o erro, nunca afirmar a mudança.
