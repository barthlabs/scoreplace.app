# M1 — transição do elenco canônico

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

## Problema que ainda bloqueia a materialização

`registrations` já possui prévia, recibo (fingerprint), decisão idempotente e
leitor. Porém as quatro operações que alteram um elenco continuam usando a
projeção legada `participants`:

1. `enrollParticipant`;
2. `deenrollParticipant` e `leaveStandby`;
3. `formPair`;
4. `splitPair`.

Por isso `_CANONICAL_REGISTRATION_MUTATIONS_READY` fica `false`. Alterá-lo
antes da transição deixaria um torneio convertido legível, mas incapaz de
receber uma inscrição, saída ou mudança de dupla sem voltar a ter duas fontes
de verdade.

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
5. Só então substituir o bloqueio por uma feature gate de servidor, executar
   um piloto individual com backup + prévia + fingerprint e verificar o
   retorno após recarregamento.
6. Nunca habilitar em lote: cada coorte exige novo censo e recibo; qualquer
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
