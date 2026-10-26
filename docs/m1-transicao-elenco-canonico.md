# M1 — transição do elenco canônico

## Resultado da migração em 26/10/2026

Após backup, prévia, transação e pós-check individuais, foram convertidos os
17 torneios com inscrições legadas (134 registros canônicos criados) e os 63
torneios com elenco vazio (zero registros criados). Há 80 recibos locais com
`status: migrated`, `protectedDataVerified: true` e nenhum pendente em
`/Users/rtb/Documents/Codex/backups-operacionais/2026-10-26-inscricoes/recibos`.
Cada pós-check comparou os campos protegidos e as subcoleções preexistentes
com seu backup operacional. Nenhum jogo, resultado ou inscrição histórica foi
apagado pela migração.

O censo de produção após a operação encontrou **84/84 torneios canônicos
íntegros, zero legados e zero bloqueados**, com 606 documentos canônicos
validados ou examinados. O Confra (`tour_1780009816637`) e o Neon já eram
canônicos antes da operação e não integraram os manifestos de migração. O
Confra foi relido após o lote: 151 `registrations`, 213 `matches`, 213
`results` e 150 `inscritos` históricos, as mesmas contagens do censo anterior.

Este corte migrou dados no Firestore; não publicou código de Hosting ou
Functions. O migrador e os testes permanecem no checkout local até a
integração normal do código.

## Rechecagem somente-leitura em 26/10/2026

O `main` remoto continua em `a88e12258`. O censo de produção examinou 84
torneios: os 4 com recibo canônico passaram pela validação estrutural (472
documentos), sem bloqueio. Restam 80 torneios legados; a prévia projetou 134
inscrições e 45 duplas, com zero conflitos, entradas sem suporte, documentos
divergentes ou bloqueios. Desses 80, **17 têm inscrições** e 63 estão vazios.
Os 17 pertencem a 15 organizações distintas e se distribuem em 6 ativos,
8 abertos, 1 fechado e 2 finalizados. Estes números vieram do planejador e
dos metadados do Firestore, sem escrita; não são aprovação para conversão.

O mecanismo de prévia/aplicação está disponível para a organização de cada
torneio e relê o elenco numa transação antes de gravar. O censo acima valida
inscrições, não confere jogos, resultados ou placares. Após este censo, o
proprietário autorizou expressamente uma **exceção administrativa para estes
17 torneios**, substituindo as confirmações das organizações, com backup e
prévia individual. Isso não autoriza apagar dados competitivos nem tocar no
Neon ou no Confra, já canônicos. Os 63 torneios vazios exigem plano separado.

O teste operacional `node tests/migrar-inscricoes-admin-emulator.test.js` roda
manualmente no checkout com dependências de `functions/` instaladas, antes de
qualquer `--apply`. Ele não integra o `hosting.predeploy`: a cópia feita por
`git archive` contém dependências da raiz, mas não `functions/node_modules`.
O teste isolado passou em 26/10/2026, inclusive com um `Timestamp` no
documento do torneio; o desligamento de `firebase-tools` exibiu um aviso de
permissão da checagem de atualização após certificar saída 0 do teste.

### Recibo administrativo pendente

O executor reserva `recibos/<id>.json` como `pending` **antes** da transação.
Se ele permanecer assim, não repetir `--apply` nem apagar/sobrescrever o
arquivo: primeiro ler o torneio e o recibo canônico em produção, somente
leitura. Se o marcador ainda não existir, conferir o backup e o estado atual,
registrar a tentativa abortada preservando o recibo original e só então gerar
novo backup e nova prévia. Se o marcador existir, comparar fingerprint e
contagens com o recibo pendente, executar o pós-check de campos protegidos e
subcoleções contra o backup, e finalizar o recibo apenas se tudo coincidir.
Qualquer divergência exige investigação individual; nunca rollback automático.
Uma subcoleção nova criada entre a última conferência e o commit não é
protegida por CAS de lista (Firestore não oferece essa leitura transacional),
portanto a checagem pré-commit **não é atômica com o commit**. A migração não
sobrescreve a nova subcoleção, e o pós-check a detecta para inspeção.

## Censo por autoridade em 25/10/2026

O censo somente-leitura passou a usar o marcador
`canonicalRegistrationMigration.fingerprint` para escolher a fonte de
autoridade **antes** de ler o elenco legado. Para torneios já migrados, compara
o número de documentos ao recibo, confere os IDs físicos e usa a mesma
validação estrutural de inscrição e dupla das Functions. Para torneios ainda
legados, mantém a prévia de migração e a comparação com `registrations`.

Resultado observado no Firestore de produção, sem escrita ou dados pessoais:

| Autoridade | Torneios | Documentos/inscrições | Exceções |
| --- | ---: | ---: | ---: |
| Canônica | 4 | 472 documentos examinados | 0 bloqueados |
| Legada | 80 | 134 inscrições projetáveis; 45 duplas preserváveis | 0 conflitos, 0 entradas sem suporte, 0 divergências |

O relatório anterior indicava 92 divergências e 129 documentos “fora da
projeção” ao comparar o elenco canônico atual de um torneio já migrado com seu
espelho histórico. Essa comparação não mede integridade após a migração e foi
retirada somente da rota canônica. O censo novo **não** valida jogos, resultados,
agenda ou placares e não autoriza migração em lote. Cada torneio legado ainda
exige prévia, confirmação e transação com fingerprint fresco.

O planejador somente-leitura de materialização também passou a excluir torneios
com recibo canônico **antes** de ler o espelho legado. Na execução observada em
25/10/2026, ignorou os 4 canônicos e produziu um manifesto assinado para os 80
legados: 134 inscrições e 45 duplas, sem incluir o Neon. O manifesto não executa
nenhuma conversão e não dispensa a confirmação individual do organizador.

## Evidência de partida

Em 09/10/2026, o censo de produção somente-leitura
`node scripts/auditar-inscricoes-canonicas.js` encontrou:

| Medida | Resultado |
| --- | ---: |
| Torneios | 80 |
| Entradas legadas | 302 |
| Inscrições canônicas projetáveis | 412 |
| Duplas formadas preserváveis | 109 |
| Conflitos | 0 |
| Entradas sem suporte | 0 |
| Documentos canônicos divergentes | 0 |
| Migrações já materializadas | 0 |

O censo não expõe nome, e-mail, foto ou telefone. Ele não escreve no
Firestore. Os números provam que existe uma coorte elegível, mas **não**
autorizam uma migração em lote.

## Corte que liberou a materialização controlada

`registrations` possui prévia, recibo (fingerprint), decisão idempotente e
leitor. As quatro operações que alteram o elenco passaram a escolher a rota
canônica dentro da própria transação quando o recibo existe:

1. `enrollParticipant`;
2. `deenrollParticipant` e `leaveStandby`;
3. `formPair`;
4. `splitPair`.

Por isso `_CANONICAL_REGISTRATION_MUTATIONS_READY` pode ficar `true`. A
liberação é somente do mecanismo: não há conversão em lote. A organização vê
a prévia, confirma um fingerprint e o servidor relê tudo antes de gravar. Um
torneio com conflito, entrada sem suporte ou elenco alterado entre os dois
passos permanece legado e íntegro.

## Contrato do corte

Para um torneio cujo `canonicalRegistrationMigration.fingerprint` exista:

- a fonte autoritativa é apenas `tournaments/{id}/registrations/{registrationId}`;
- cada inscrição usa `registrationId(uid|manualParticipantId, categoryId)` e
  conserva `participantKey`, `status`, `validationState` e `fixedPairId`;
- toda decisão é transacional, autorizada por UID e valida o documento fresco;
- participante manual é identificado apenas por `manualParticipantId`; o
  rótulo local não é chave de busca;
- a leitura de compatibilidade pode projetar o roster para telas ainda legadas,
  mas não pode gravá-lo como novo estado autoritativo;
- partida, chave, resultado, agenda, presença e histórico não fazem parte
  deste corte e não podem ser alterados por ele.

## Sequência de implementação

1. Extrair um núcleo puro de transição de registros que receba inscrições,
   categoria e identidade, e devolva creates/updates/deletes ou rejeição.
2. Fazer as quatro Functions escolherem o núcleo canônico somente quando o
   marcador de migração estiver presente; torneios não migrados preservam a
   rota legada durante a transição.
3. Aplicar a mesma autorização e os mesmos limites de inscrição/espera nas
   duas rotas, com testes de paridade. A rota canônica não aceita fallback por
   nome.
4. Acrescentar testes de concorrência para dupla, saída e nova inscrição na
   mesma categoria, e testes de Rules que neguem escrita direta do cliente.
5. Manter a feature gate de servidor e executar pilotos individuais com
   backup + prévia + fingerprint, verificando o retorno após recarregamento.
6. Nunca migrar em lote: cada coorte exige novo censo e recibo; qualquer
   divergência aborta sem sobrescrever documentos existentes.

## Critérios de aceite

- a mesma pessoa não cria duas inscrições na mesma categoria mesmo sob duas
  chamadas concorrentes;
- categorias paralelas continuam permitidas e grupos exclusivos continuam
  recusados pelo servidor;
- formar e desfazer dupla altera somente `fixedPairId` das inscrições afetadas;
- inscrição, saída, espera e dupla continuam funcionando depois de uma
  migração; nenhum caminho volta a escrever `participants` como autoridade;
- a migração preserva as 109 duplas formadas e não toca jogos, resultados,
  agenda ou chaves;
- os testes executam tanto no núcleo puro quanto contra o emulador Firestore.
