# Contrato de fases e sorteios

Este documento fixa o vocabulário de domínio usado pelo Scoreplace. Ele vale
para torneios novos e para a projeção lossless dos documentos históricos.

## Fases

Um torneio contém uma ou mais fases ordenadas. Só existem dois tipos:

- `classification`: acumula resultado e produz classificação;
- `elimination`: avança pela chave e determina as posições que disputa.

`Liga`, `pontos corridos`, `fase de grupos`, `rei/rainha` e “suíço” não são
tipos de fase. Os dois primeiros rótulos são nomes históricos de uma
classificatória; os demais são escolhas da configuração ou do sorteio.

Uma classificatória pode encerrar o torneio. A fase eliminatória é opcional e,
quando existe, recebe explicitamente as vagas classificadas em potência de dois.

## Classificatória e grupos

`classification.structure` aceita apenas `round_robin` ou `groups`. Para
grupos, o organizador escolhe todos-contra-todos ou uma quantidade menor de
rodadas/emparelhamentos. Em todos-contra-todos com `n` equipes, cada equipe
joga `n - 1` confrontos; em grupos menores a agenda não pode inventar jogos
além dessa quantidade.

Pareamento por ranking e clusters dinâmicos é uma configuração da
classificatória. É a equivalência canônica do que documentos antigos chamavam
de “suíço”: após cada rodada, os pontos podem mover pessoas entre clusters; o
planejador evita repetir parceiros, adversários e sobras até esgotar as opções
do cluster, mas não bloqueia uma repetição inevitável.

## Sorteio

O sorteio é um plano de fase, nunca um terceiro caminho de torneio. Ele pode:

1. formar equipes fixas ou rotativas;
2. criar confrontos por sorteio livre ou por clusters;
3. criar grupos Rei/Rainha de quatro participantes e os três confrontos da
   rodada;
4. registrar a política de repetição, sobras e a versão do algoritmo.

O plano usa UIDs para contas e `manualParticipantId` para convidados locais.
Nome exibido não participa de autorização, deduplicação, pareamento ou
reconciliação.

## Eliminatória

Uma eliminatória declara a origem das vagas, a semeadura (`performance` ou
`balance`) e a política de chave quando a entrada não é potência de dois:
`repescagem`, `bye` ou `sobra_unica`. A política é confirmada antes do
primeiro sorteio e não pode ser trocada silenciosamente.

## Legado

Campos legados são somente entrada de projeção. A tradução adiciona o contrato
canônico sem recriar rodadas, placares, duplas, jogos ou agenda. Qualquer
migração física exige censo, backup, comparação antes/depois e confirmação
explícita; a projeção por leitura continua sendo a garantia para dados que ainda
não foram materializados.
