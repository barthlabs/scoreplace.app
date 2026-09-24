# O e-mail sai do RESUMO público (organizador **e votos de enquete**) · v16

## 1. Onde estamos (medido hoje, não deduzido)
A porta anônima do documento do torneio caiu de 61 para 6 e-mails; sobram
`organizerEmail`, `creatorEmail` e `adminEmails`. O projeto já registra a ordem certa para
tirá-los, e o **passo (a) fechou hoje**: os três avisos ao organizador deixaram de depender
de `t.organizerEmail` (2.3.96, e `tests/aviso-ao-organizador-e-por-uid.test.js` prova que
nenhum dos três o lê). Esta leva é o **passo (b)**.

## 2. O defeito desta leva
`tournaments_summary` é a SEGUNDA superfície pública (leitura anônima,
`firestore.rules:231`) e **replica o e-mail do organizador**:
`functions-autodraw/tournament-summary-core.js:91` → `organizerEmail: String(t.organizerEmail || '')`.
⇒ Limpar só o documento do torneio não fecharia nada: o e-mail continuaria saindo pelo resumo.

**MEDIDO: ninguém consome esse campo do resumo.** Varri `js/` e as três codebases de
Functions por `summary.organizerEmail` / leitura do resumo com esse campo: **zero**. Os
leitores do resumo (`js/firebase-db.js:2080, 2219, 2273`) usam nome, tokens e contadores.
⇒ É carga morta numa superfície pública. Sai.

## 2.b O VAZAMENTO MAIOR, achado na revisão: as ENQUETES
`tournament-summary-core.js:108` copia `polls: _arr(t.polls)` **cru**. E voto legado é
chaveado por E-MAIL: `js/views/dashboard.js:1233` faz `_activePoll.votes[_pUserEmail]`.
⇒ O resumo público carrega um mapa cujas CHAVES são e-mails de participantes — mais gente do
que os três campos do organizador, e numa superfície que eu não tinha medido. Entra nesta leva.

⛔ E não dá para simplesmente apagar `polls`: o cartão do painel precisa deles
(`js/views/dashboard.js:1218-1234` lê `t.polls`, e `t` ali é *"resumo ou documento completo"*).
Apagar seria trocar vazamento por regressão.

**Projeção por allowlist**, como o resumo já faz com `coHosts` (linha 94, só `uid` e `status`):
⛔⛔ **INVERTI A REGRA, e é o ponto mais importante do plano.** Eu vinha propondo uma allowlist
— "o resumo leva id, status, deadline e mais o que eu listar". Errado, e o revisor mostrou por
quê: eu listei `options` com `id` e `rótulo`, e o leitor que está no ar espera `opt.key` e
chama `opt.key.replace(...)`. Minha lista quebraria a aba aberta em campo que eu nem sabia
existir. Enumerar de cabeça os campos de que a tela precisa é adivinhar.
⇒ A projeção passa a ser por **SUBTRAÇÃO**: a enquete é copiada INTEIRA, e só o mapa de votos é
trocado por `{}`, mais um `voteCount` novo. Tudo o que o leitor de hoje usa continua lá **por
construção** — `key`, `icon`, `title`, `desc`, `isNash` e o que mais houver —, e o que sai é
exatamente o que vaza. Enquete não guarda outro dado de pessoa; o mapa de votos é o problema
inteiro.

⛔ **O MAPA VAZIO É PARA A ABA JÁ ABERTA.** Quem está com o app aberto AGORA tem o JavaScript
de hoje e vai ler o resumo NOVO assim que o gatilho regravar: sem `votes`, o cartão quebra em
`votes[email]`. Tolerância escrita no código novo não alcança aba velha — ela já está
carregada. A FORMA continua a que o leitor velho espera; sai o CONTEÚDO sensível.
⚠️ Preço declarado: a aba velha mostra "0 votos" até recarregar. Contagem errada num cartão se
conserta com um F5; exceção derruba a tela.
⛔ **E `votedUids` foi CORTADO** (era a minha proposta até a rodada 9). Publicar a lista de quem
votou, numa superfície ANÔNIMA que já expõe `memberUids`, deixa qualquer um cruzar participante
com votante: não revela a OPÇÃO, revela a PARTICIPAÇÃO — e isso é informação sobre pessoas que
ninguém pediu para publicar. Um número não identifica ninguém; uma lista, sim.
⭐ De brinde, some o problema de decidir "o que é um uid": não havendo lista, não há critério a
inventar. Quem precisava dela era só o selo pessoal, tratado abaixo.
⛔ O mapa de votos inteiro nunca mais entra no resumo.
⚠️ Preço declarado: quem votou no formato legado (chave de e-mail) deixa de aparecer como
"já votou" **no cartão**. O diálogo de votação continua certo, porque ele abre o documento
completo. Trocar "o cartão erra um selo para voto legado" por "e-mails de participantes numa
superfície anônima" é a troca certa, e é do dono saber que ela foi feita.
⇒ `js/views/dashboard.js`: com RESUMO, só contagem; com documento COMPLETO, o selo sai do mapa
de votos — **uid primeiro, e-mail legado depois**.
⇒ `_showPollVotingDialog` (`js/views/tournaments-draw-prep.js:2771`): se o torneio em mão for
`_resumo`, **RETORNA** depois de chamar `_ensureTournamentLoaded(tId, cb)` e reentra no diálogo
**dentro do `cb`**, já com o documento completo. ⛔ `_ensureTournamentLoaded` é por CALLBACK e
pode levar até 8s (`js/store.js:11088`); "chamar e seguir" abriria o diálogo sobre a projeção
(ele toca `poll.options` e `poll.votes` na hora, linha 2796) — eu trocaria um vazamento por um
diálogo que mente.
⛔ E a reentrada **confere o que o callback trouxe**: `_ensureTournamentLoaded` chama `cb(null)`
em timeout, banco indisponível ou erro. Reentrar sem olhar abriria o diálogo sobre nada.
Sem torneio completo: avisa que não deu para carregar a enquete e NÃO abre — errar fechado é o
único jeito honesto quando o dado não chegou.
⇒ No cartão: ramo RESUMO mostra a CONTAGEM (`voteCount`/`participantsCount`) e **não mostra o
selo pessoal** — sem lista de votantes não há como saber, e inventar seria mentir. O selo
aparece no documento COMPLETO, que é o que a pessoa carrega ao abrir o torneio.
⛔ E o ramo COMPLETO está ERRADO HOJE, não é "preservar": `js/views/dashboard.js:1231-1233`
consulta **só por e-mail**, enquanto a Function já grava o voto por UID e apaga o legado do
próprio votante (`functions-autodraw/index.js:4060`). Ou seja, quem vota hoje não vê o selo
"já votei" no cartão. Passa a ser **uid primeiro, e-mail legado depois**, com teste dos dois.

## 3. O conserto
1. `buildSummary` para de emitir `organizerEmail`. ⛔ E para de emitir também `creatorEmail`
   e `adminEmails` **se** estiverem lá — confiro no diff, não de memória.
2. ⛔ **Regravar não é automático, e é aqui que a leva erraria em silêncio**: o gatilho só
   regrava quando `summaryMudou(antes, depois)` diz que algo do CARTÃO mudou
   (functions-autodraw/index.js:5214). Tirar um campo do resumo **não muda o torneio**, então
   os resumos existentes ficariam com o e-mail para sempre. Então a leva inclui rodar o
   backfill (`scripts/backfill-tournament-summary.js`), que reescreve por `set` integral.
   ⛔ E o backfill endurece: **enumera** `tournaments_summary` ANTES e DEPOIS, conta quantos
   documentos ainda contêm um CAMINHO PROIBIDO (§4), **falha se sobrar um**, trata
   explicitamente o resumo ÓRFÃO: o gatilho já APAGA o derivado quando o torneio some
   (`functions-autodraw/index.js:5174`), então o backfill **enumera os órfãos, apaga sob
   `--apply`, conta** e **falha se sobrar qualquer resíduo com e-mail**. Só reportar mantém o
   vazamento. E **aborta na primeira escrita que falhar**, em vez de seguir e dizer que deu
   certo pela metade.
   ⛔ Torneio DIVIDIDO entra no teste do backfill: o resumo dele é montado das subcoleções
   (index.js:5205-5212), e é justamente o caminho que "deixa o resumo anterior de pé" quando
   falha — ou seja, o caminho onde o e-mail velho sobreviveria.
3. ⛔⛔ **O BACKFILL TEM DE MONTAR O TORNEIO DIVIDIDO ANTES DE RESUMIR** — e hoje não monta.
   `scripts/backfill-tournament-summary.js:81` entrega o documento-RAIZ direto ao
   `buildSummary`. Em torneio dividido os pesados moram em subcoleções, então rodar `--apply`
   assim regravaria o resumo de todos eles com elenco e progresso ZERADOS: eu trocaria um
   vazamento de e-mail por um cartão mentiroso em produção, que é pior.
   Conserto: antes do `buildSummary`, chamar `montarDoBanco(clone, leitorPaginado)` — a porta
   canônica, que o próprio gatilho usa (`functions-autodraw/index.js:5205`, definida em
   `js/views/tournament-split-core.js:568`) e que decide pelas partes através do marcador
   `_semPesados`. ⛔ Nada de reimplementar a lista de subcoleções aqui: já existe porta.
   Se a leitura ou a montagem falhar, **aborta aquele resumo sem gravar** — resumo velho e
   verdadeiro é melhor que resumo novo e vazio, que é a mesma regra que o gatilho já segue.
4. ⛔⛔ **A ORDEM DE PUBLICAÇÃO — e eu a tinha invertida.** Quem lê o resumo é o NAVEGADOR, e
   aba em cache continua com o JS velho por horas. Se o resumo mudar de forma antes da tela
   saber ler a forma nova, o cartão de enquete quebra para quem não recarregou.
   Ordem certa:
   ① `scripts/deploy-functions.sh autodraw` — **a codebase INTEIRA, sem `--only`**. O script já
     alveja por nome (é para isso que ele existe); `--only` deixaria o carimbo de publicação
     PARCIAL, e o portão cobra o carimbo. ⛔ Não é `firebase deploy --only functions`, que
     nunca se roda aqui;
   ② Hosting 2.3.101. ⭐ E a ordem entre ① e ② deixou de ser delicada: como o resumo novo leva
     `votes: {}` e as `options` inteiras, a aba com o JS velho não estoura no intervalo — foi
     essa projeção que dispensou a janela de adoção;
   ③ backfill transacional;
   ⑤ verificação final: contagem de resumos com caminho proibido = 0.
   ⛔ **E o backfill não pode atropelar o gatilho**, que está vivo enquanto ele roda. Em vez de
   eu inventar precondição e retry na mão, usa `db.runTransaction`: raiz, resumo e TODAS as
   consultas de partes são lidas **pelo `tx`**, a montagem usa esse leitor, e só então
   `tx.set`/`tx.delete`. O retry é o nativo do Firestore, e o teste o exercita alterando uma
   parte já lida. Montar de partes lidas em momentos diferentes é como nasce um resumo que
   nunca existiu.
   ⛔ Fixture obrigatória SEM `creatorUid` — para o adaptador não estourar. ⭐ Medido antes:
   `scripts/conferir-admin-por-uid.js` já registrou **0 torneios sem `creatorUid`** na base, e
   essa contagem é refeita ANTES do `--apply`, não relembrada.
   ⛔ E o executável do backfill **MUDA DE PASTA**: passa a viver em `functions-autodraw/`, não
   em `scripts/`. Não é organização — é `require`: `firebase-admin` resolve a partir da pasta do
   ARQUIVO, e a dependência só existe naquela codebase. Um script em `scripts/` não acha o
   módulo, e "rodar de dentro da pasta" não muda a resolução. Ele usa `firebase-admin` + ADC e
   importa `./vendor/tournament-split-core.js` — a mesma fronteira que o gatilho já usa
   (`functions-autodraw/index.js:14`). ⛔ O `fetch` com token do `gcloud` sai: por ali não existe
   transação de verdade.
   Todas as leituras acontecem ANTES de qualquer escrita, dentro da transação, e o teste de
   conflito roda no EMULADOR — e ⛔ **catalogado no `test:emu:autodraw` da própria codebase**,
   junto do executável. Teste que não está em lista nunca roda, e o
   `npm test` não sobe emulador.
   ⚠️ A tolerância ao formato legado FICA enquanto houver resumo antigo no banco; ela só sai
   numa leva futura, depois do backfill medido — e isso vai anotado no código, não na minha
   cabeça.

## 4. Trava
⛔ Não nasce suíte nova: `tests/resumo-do-torneio.test.js` JÁ testa `buildSummary` e já está
registrada. Ela é ESTENDIDA — duas suítes sobre o mesmo contrato divergem.
⛔ **E há um contrato que hoje EXIGE o vazamento**: `tests/cartao-do-resumo-e-igual-ao-completo.test.js:124`
pede que `polls` seja copiado CRU. Ele muda na mesma leva, para exigir a projeção — se eu só
mexesse na outra suíte, o `npm test` ficaria vermelho e eu descobriria isso no fim.
- o objeto que `buildSummary` devolve, para um torneio com `organizerEmail`, `creatorEmail` e
  `adminEmails` preenchidos, **não contém nenhum dos três** — nem em subobjeto;
- ⛔ a verificação é por **CAMINHO PROIBIDO, e SÓ por caminho**: `organizerEmail`,
  `creatorEmail` e `adminEmails` não existem, e `polls[].votes` está VAZIO (chaves incluídas).
  ⛔⛔ **NENHUMA detecção de "parece e-mail" em valor nenhum.** Reincidi nisso três rodadas:
  `nameLower` e `tokens` derivam de nome, local e esporte; a descrição de uma opção de enquete é
  texto livre; e `memberUids` guarda identidade sem forma fixa
  (`functions/partes-permissao.js:85`). Um clube que se chama `contato@clube.com` é dado
  LEGÍTIMO — reprovar por aparência pararia o `--apply` sem haver vazamento algum, e ensinaria
  a desligar o verificador. Vetores obrigatórios: **uid com forma de e-mail em `memberUids`**
  (passa), **nome de torneio com "@"** (passa), **voto legado chaveado por e-mail** (reprova);
- vetor das enquetes: torneio com `polls[0].votes` contendo uma chave de e-mail E uma de uid ⇒
  o resumo leva `voteCount` 2 e **nenhuma** chave — nem o uid, nem o e-mail;
- caso de regressão nomeado: um resumo montado à mão COM `organizerEmail` reprova, e outro com
  `polls[].votes` cru reprova;
- ⛔ **o payload lido pelo LEITOR VELHO**: `options` com `key`, `icon`, `title`, `desc` e
  `isNash` intactos, `votes` vazio, e o diálogo abre sem exceção. É o teste que prova a
  compatibilidade da aba já aberta — o resto só cobre o ramo novo;
- o CARTÃO resumido: a contagem (`2/3`) sai certa da projeção, o selo pessoal NÃO aparece, e o
  clique só abre o diálogo DEPOIS da carga completa;
- ⛔ **o ADAPTADOR do backfill, não só o `buildSummary`**: fixture com documento MAGRO
  (`_semPesados`) mais subcoleções de inscritos e jogos, provando que o caminho do script passa
  pela montagem e que o resumo sai com `participantsCount` e progresso CERTOS — não zerados.
  Em suíte já registrada, como o resto.
  ⛔ E para isso o script precisa ser TESTÁVEL: hoje ele é uma IIFE que pede token do `gcloud`
  e vai à rede assim que é carregado (`scripts/backfill-tournament-summary.js:61`), então
  `require` dele num teste dispararia rede. A montagem + leitura + escrita condicional saem
  para uma função PURA e injetável (leitor e escritor entram por parâmetro), exportada pelo
  script; é ELA que o teste exercita. ⛔ E o ponto de entrada fica atrás de
  `require.main === module`: sem isso, `require` dele num teste dispara o backfill de verdade
  contra a base — o teste vira a execução. ⛔ Nada de provar montagem ou retry casando texto-fonte
  — foi o falso verde de hoje de manhã;
- ⛔ o teste roda sobre o VENDOR (`functions-autodraw/`), que é o que o servidor executa.

## 5. Anotação no código
Bloco `⛔` em `buildSummary` dizendo que o resumo é lido SEM AUTENTICAÇÃO, que o Firestore
entrega o documento inteiro ou nada — logo não existe "esconder um campo" — e que e-mail
nunca mais entra aqui. Citar a medição (61 → 6) e o portão.

## 5.b ⛔ ISTO NÃO FECHA O VAZAMENTO DE VOTOS — e dizer que fecha seria mentira
O documento RAIZ do torneio continua legível sem autenticação (`firestore.rules:572`) e
continua com `polls[].votes` CRU. Esta leva tira o mapa de uma das duas superfícies públicas,
não das duas. Hidratar o diálogo é correção de funcionamento, não proteção: quem quiser o mapa
busca o torneio direto.
⇒ O fechamento do voto legado no documento raiz é leva PRÓPRIA, e entra na ordem do projeto
junto com os três campos do organizador — passo (c), quando as Rules passarem a **recusar quem
regrava**. Fica nomeado aqui para não virar "a gente achou que tinha fechado".

## 6. O que NÃO entra, declarado
- Tirar os três campos do documento do TORNEIO: falta o passo (c) do projeto — as Rules têm
  de **recusar quem regrava**, porque admin tem update amplo (`firestore.rules:645`) e
  `saveTournament` recomputa `adminEmails` (`js/firebase-db.js:332`, `:435`). Parar de gravar
  sem conter é convite para uma aba velha desfazer a migração.
- A porta restrita continua sem entregar e-mail, de propósito
  (`functions/tournament-contact-core.js:10`). Não mexo nela.
- Conferência anônima em produção: é leitura de produção, que eu não faço nesta sessão. A
  prova que entrego é o objeto do `buildSummary` + a contagem do backfill.

## 7. Entrega
2.3.101 (base conferida: `origin/main`, `version.txt`, `SCOREPLACE_VERSION` e `CACHE_NAME`
estão em **2.3.100**), `npm run prerender`, cache-busters do
que for tocado, `copy-vendor` + `check-vendor-fresh`, `npm test` mostrado, deploy nominal do
gatilho de resumo, backfill com contagem, nota de versão e `scripts/deploy-hosting.sh`.
Inclui os cache-busters de `js/views/dashboard.js` (`index.html:670`) e de
`js/views/tournaments-draw-prep.js`, ambos tocados. Sem Rules, sem nativo.
