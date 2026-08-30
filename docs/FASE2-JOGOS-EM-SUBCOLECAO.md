# Fase 2 — os JOGOS saem do documento

> Ordem do dono (25/ago/2026): _"não vamos esperar que até o fim da Confra o app deve ter
> ainda mais clientes e torneios. o momento é agora"_ — e o argumento é o certo: esperar
> significa migrar com MAIS dado e MAIS gente usando.

## O problema, em um número
O Firestore recusa documento acima de **1 MB**. O Confra está em **238 KB** com 144
inscritos e 112 jogos — `rounds` (os jogos) são **101 KB** disso. A ~4× o tamanho dele o
torneio **não pode ser gravado**. Não é lentidão: é recusa do banco.

E há o custo diário: **cada placar reescreve o documento inteiro**. Uma mudança de ~50
bytes reenvia 238 KB, e devolve esses 238 KB para cada ouvinte aberto.

## O que já está pronto (Fase 1, no ar)
- `tournaments_summary/{id}` — o índice que as LISTAS leem (vitrine 2.0.90, meus torneios 2.0.95).
- `tournaments/{id}/{matches,participants,history}` — o espelho, escrito pelo gatilho
  `tournamentMirror` (servidor), conferido diariamente: **39/39 idênticos**.
- `tournament-split-core.js` — `dividir(t)` / `remontar(partes)`, com `_loc` por jogo
  (os jogos moram em TRÊS lugares no documento e o lugar muda o comportamento).
- `scripts/conferir-indice-completo.js` — prova que não FALTA ninguém no índice.

## ⭐ O QUE TORNA ISTO VIÁVEL AGORA (medido em 25/ago)
A migração morreria se fosse preciso tocar os **90 chamadores** de `saveTournament`.
Não é preciso: para JOGOS o funil tem **3 funções**.

| caminho | o que grava |
|---|---|
| `saveTournament` | o documento inteiro — **90 chamadores, 1 implementação** |
| `mutateTournament` | transação no documento |
| `leaveStandby` | transação no documento |

As demais gravações fora do funil são **por campo** (`.update({status})`,
`.update({adminEmails})`) e **não tocam em jogo**. Conferido, não suposto.
⭐ E já existe subcoleção em uso: `mutateMatchResult` grava em
`tournaments/{id}/results/{matchId}` — o padrão não é novo no app.

## ⚠️ O QUE A FASE 2 PIORA (dito antes, não descoberto depois)
O Firestore cobra por **documento lido**. Hoje abrir o Confra é **1 leitura** (de 238 KB).
Lendo das subcoleções vira **~666 leituras** (112 jogos + 236 inscritos + 318 eventos).

Isso é uma piora real, e a conta honesta é esta:

| | hoje | com Fase 2 |
|---|---|---|
| abrir o torneio | 1 leitura · 238 KB | ~666 leituras · 238 KB |
| **lançar um placar** | 1 escrita · **238 KB** | 1 escrita · **~925 B** |
| eco pra cada ouvinte aberto | **238 KB** | ~925 B |
| teto | **~4× o Confra** | nenhum |

⭐ O que torna a troca boa mesmo assim: **abrir acontece às vezes; lançar placar acontece
o tempo todo**, e o eco de 238 KB por placar é pago por TODO mundo com a tela aberta.
E a leitura é única por sessão — o `onSnapshot` na subcoleção entrega só o que MUDOU.

⛔ Mitigação obrigatória: não ler o que a tela não usa. `history` (318 eventos) não é
preciso pra abrir a chave, e `participants` só interessa inteiro em algumas telas.
Ler as três subcoleções sempre seria trocar um problema por outro.

## A ordem (cada passo é reversível e provado antes do seguinte)

### Estado auditado em 30/ago/2026

O código em produção já ultrapassou a formulação inicial deste documento, de forma
**gradual e por torneio**: documentos que carregam `_semPesados` têm as partes ali
nomeadas fora do documento; o cliente, as Functions e o resumo usam
`montarDoBanco` para lê-las. A escrita também respeita esse marcador e não devolve
as partes ao documento.

Isso não autoriza a próxima retirada de campo. O estado fica registrado assim:

- **Decisão adotada:** `_semPesados` é o único seletor de fonte por torneio; ausência
  de dados nunca decide migração.
- **Problema corrigido:** o leitor da tela não entrega documento magro como se estivesse
  completo; ele monta e repinta pelo mesmo objeto.
- **Dívida corrigida nesta auditoria:** `conferir-banco-novo.js` deixou de comparar a
  remontagem completa contra o documento deliberadamente reduzido e passou a usar
  `colecaoDaParte`/`montarDoBanco`, exigindo também o backup pré-divisão.
- **Dívida ainda aberta:** não existe equivalência histórica automática para mutações
  ocorridas depois do salto (placar, inscrição e W.O. podem mudar legitimamente). O
  backup é preservado para investigação e reversão; qualquer novo passo precisa de
  uma prova específica da sua escrita, não de uma igualdade enganosa com o passado.
- **Proposta futura, não autorizada por esta nota:** tirar mais partes, apagar o
  documento antigo ou alterar o modelo de `standings`.

### 2a — LER da subcoleção  ⟵ *o passo seguro, começa aqui*
`_ensureTournamentLoaded` monta o torneio a partir de config + subcoleções
(`remontar`), com queda para o documento. **Nada muda na escrita.**
Prova: o objeto remontado tem que ser IDÊNTICO ao documento — é o que
`conferir-banco-novo.js` já faz (39/39), agora exercitado pelo caminho do app.
Ganho direto: nenhum. É pré-requisito — só depois que a verdade do cliente vem da
subcoleção é que o documento pode parar de carregar jogo.

### 2b — ESCREVER na subcoleção
`saveTournament` para de mandar os campos pesados e grava só os jogos que MUDARAM.
Ganho: um placar toca **~925 B** em vez de 238 KB.
⚠️ É aqui que mora o risco: as proteções contra save do passado (`saveTournament`
compara com o banco e RECUSA o que veio velho) leem o documento inteiro. Elas precisam
continuar valendo, jogo a jogo.
⚠️ E a concorrência muda de forma: hoje a transação num doc só SERIALIZA dois placares
simultâneos; com jogos separados eles deixam de colidir (melhor) — mas o que dependia da
serialização precisa ser reexaminado.

#### ⭐ O que a 2b **conserta de graça** (descoberto ao ler as proteções)
`saveTournament` tem **8 proteções** contra save do passado — PLACAR, CHAVE, LISTA,
ESCALAÇÃO, REGISTRO, CO-ORGANIZAÇÃO... Todas existem pela MESMA razão: o cliente manda o
**torneio inteiro**, então um save atrasado sobrescreve o que ele não sabia que mudou.
O comentário do código conta o estrago medido: _"o save atrasado do organizador destruía
CINCO coisas: a rodada 2 recém-criada, um jogo de entrada tardia, o link do grupo de
WhatsApp, o horário combinado e a substituição por W.O."_

Com jogo em documento próprio, **o cliente escreve só o que MUDOU** — e um save atrasado
deixa de poder apagar o que ele não tocou. A classe inteira de bug some por construção,
não por mais uma proteção.

⛔ Mas as proteções NÃO saem junto: elas continuam valendo pro que segue no documento
(elenco, chave, co-organização). Sair delas é outro passo, com outra prova.

### 2c — TIRAR os jogos do documento
Script único, depois que nada mais lê `rounds`/`matches` do documento.
É o passo que **remove o teto**. O gatilho `tournamentMirror` inverte (ou sai).

## ⛔ Regras que não mudam
- **O banco velho fica de backup até o dono mandar apagar.**
- Nada da Confra pode mudar no que as pessoas veem e em como funciona.
- Cada passo só sai com prova, e a prova é comparação com o estado anterior — não
  inspeção visual.
