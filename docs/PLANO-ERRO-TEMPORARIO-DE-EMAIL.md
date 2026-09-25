# Erro TEMPORÁRIO de e-mail não é "não recebeu" · v2

## 1. O que eu medi no banco (24/set/2026)
```
fila de e-mail: 1953 entregues · 128 com ERRO · 75 destinatários distintos
TODOS os 128 com a MESMA causa:
  "421-4.3.0 Temporary System Problem. Try again later."
mais recente: 11/jun/2026  → parados há mais de três meses
```
`421` é erro **transitório** do provedor (classe 4xx do SMTP: tente de novo). Não é caixa cheia
nem endereço inexistente.

Contexto que dá o tamanho: no Confra, das **154 contas**, só **26 têm push**; **122 não têm push
mas têm e-mail**; e **6** não têm canal automático nenhum. Ou seja, para a maioria o e-mail É o
canal — e foi ele que falhou calado para 75 pessoas.

## 2. Os dois defeitos, separados
### (a) A tela chama de "não recebeu" quem teve falha do PROVEDOR
`functions/index.js:5578-5592` monta o conjunto de "bounced" com **todo** doc em
`delivery.state === 'ERROR'`, sem olhar a causa — e o próprio comentário acima (`:5571-5577`)
enumera o que ele acha que está pegando: _"e-mail inexistente, caixa cheia, rejeição SMTP"_.
Nenhum dos 128 é isso. ⇒ O relatório de comunicado marca 75 pessoas como não alcançadas por um
problema momentâneo de quem entrega. **Isso é afirmar o que não foi medido**, e é o organizador
que decide coisa com esse relatório.
### (a2) ⛔ E A ATRIBUIÇÃO É POR JANELA DE TEMPO, não por referência — NOMEADO, não consertado aqui
O relatório junta os erros por **endereço + intervalo** (`:5581`, `sentAtMs - 60s`), porque o doc
de `mail` não guarda de qual comunicado ele nasceu. Logo, um bounce de OUTRO envio ao mesmo
endereço, na mesma janela, é atribuído a este comunicado. Isso é anterior a esta leva e é defeito
próprio: o conserto é pré-alocar o id do comunicado, gravá-lo nos itens da fila e propagá-lo ao
doc criado pelo digest; e legado sem referência vira `indeterminado`. ⛔ Fica NOMEADO aqui e vai
em leva própria — juntar a plumbing da fila ao conserto da classificação faria uma leva que
atravessa fila, digest, extensão e relatório de uma vez, e é assim que eu quebro coisa.
⭐ Mesmo sem isso, classificar já é estritamente melhor que hoje: nenhuma das 128 é bounce.

### (b) Ninguém reenvia, e ninguém vigia
A extensão processa cada doc UMA vez. Erro transitório fica parado para sempre, e nada avisa.
Três meses sem ninguém ver.

## 3. O conserto
### 3.1 Classificar a causa, num lugar só
Núcleo puro novo em `functions/` (e não uma condição solta no meio do relatório):
`classificarFalhaDeEmail(texto)` → `'transitoria' | 'permanente' | 'desconhecida'`.
- **transitória**: código SMTP da classe **4xx**, inequívoco (`421`, `4.3.0`);
- **permanente**: classe **5xx**, inequívoco (`550`, `5.1.1`);
- **desconhecida**: TODO o resto, inclusive texto sem código.
⛔ Classifica SÓ por código inequívoco. Eu ia aceitar frases ("try again later", "mailbox full")
como reforço; saem: texto de provedor muda sem avisar, e adivinhar frase é como se erra de novo
no ano que vem. Sem código, é desconhecida.
⛔ E `desconhecida` NÃO conta como bounce — na dúvida, não se acusa a pessoa de não ter
recebido. Errar para o lado de "não sei" é o único honesto num relatório que o organizador lê.
### 3.2 O relatório passa a contar só a PERMANENTE como bounce
`functions/index.js:5578-5592` usa o núcleo. E o comentário mentiroso acima é corrigido — ele
diz que pega caixa cheia e endereço inexistente, quando pegava tudo.
⚠️ Efeito visível declarado, e são TRÊS estados, não dois: hoje é ✓✓ presumido ou ✗. Passa a
existir um terceiro, para transitória/desconhecida — **não é "recebeu" nem "não recebeu"**.
Mostrar ✓✓ ali seria trocar uma afirmação errada por outra: não houve negativa da caixa, mas
também não houve entrega. O dono tem de saber, porque foi ele quem pediu o indicador.
### 3.3 Um conferidor da fila parada
`functions-autodraw/conferir-fila-de-email.js`: conta docs em ERROR, agrupa por causa
classificada, e diz o mais recente. Seco por padrão.
⛔ **Sem reenvio automático nesta leva**, e o motivo é medido: os 128 são de junho. Reenviar
aviso de placar de três meses atrás é spam, e sobre evento que já passou. Reenvio de transitória
RECENTE é leva própria, com janela e teto — decisão do dono.

## 4. Trava
`tests/erro-temporario-nao-e-bounce.test.js`, registrada à mão:
- o texto REAL dos 128 (`"421-4.3.0 Temporary System Problem. Try again later."`) classifica
  como **transitória** — é o caso que originou a leva, com o dado de produção;
- `550 5.1.1 user unknown` e `mailbox full` classificam como **permanente**;
- texto vazio/estranho → **desconhecida**, e desconhecida NÃO é bounce;
- ⛔ o relatório só põe no conjunto de bounce quem é **permanente**: recorte do bloco pelo
  próprio identificador (casamento de chaves), não por janela de tamanho;
- ⛔ e o comentário que descrevia "caixa cheia / inexistente" tem de ter sido corrigido — foi ele
  que sustentou o erro por meses.

## 5. Anotação no código
Bloco `⛔` no núcleo (o caso dos 128, a data, e por que a classe 4xx não é bounce) e no
relatório (que `desconhecida` não acusa ninguém). Registro em `tests/pontos-frageis.js`.

## 6. Entrega
⚠️ **Corrijo o que eu havia escrito**: eu disse "sem bump". Errado — o terceiro estado aparece na
TELA do organizador (`js/views/tournaments-organizer.js`), então é código de app.
- bump acima de 2.3.102 em `version.txt`, `SCOREPLACE_VERSION` e `CACHE_NAME`, `npm run prerender`,
  e cache-buster de `index.html:677`;
- `npm test` mostrado;
- deploy NOMINAL de TUDO na cadeia que eu tocar — não só a callable do relatório: se o digest
  (`flushNotifEmailDigest`) mudar, ele e `getCommunicationStats` vão junto. Publicar metade de
  uma cadeia assíncrona é como se cria divergência entre quem grava e quem lê;
- conferidor rodado em seco, com o número no relato.
Sem Rules, sem nativo.


## ⏳ ESTADO: plano fechado, NÃO implementado (24/set/2026)
A revisão convergiu para unificar a leva: núcleo de classificação **+** proveniência `commId`
ponta a ponta (fila → digest → doc de `mail` → relatório) **+** retorno explícito
`{ emailFailureKind }` **+** UI. Está certo do ponto de vista de desenho — sem proveniência, até
a classificação certa pode atribuir o bounce de outro envio.

⛔ Não implementei porque isso atravessa fila, agendada do digest, extensão e relatório numa só
leva, e a regra da casa (testada pelo dono, depois de uma reversão) é UMA mudança por leva. O que
está em jogo é a PRECISÃO de um indicador, não algo quebrado na quadra: nada está fora do ar.

**Quando pegar, a ordem é:** ① núcleo puro de classificação por código SMTP inequívoco →
② `commId` pré-alocado e propagado, com legado virando `indeterminado` → ③ relatório consultando
referência exata → ④ o terceiro estado na tela → ⑤ deploy de TODA a cadeia junto
(`flushNotifEmailDigest` + `getCommunicationStats` + a callable do relatório), nunca metade.
