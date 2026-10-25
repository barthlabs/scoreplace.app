# M1 — transição do elenco canônico

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
