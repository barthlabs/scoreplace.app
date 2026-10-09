# M2 — mutações do elenco canônico

## Objetivo e limite

Depois de uma materialização autorizada, `registrations` passa a ser a única
fonte de verdade do elenco. Este bloco torna as quatro mutações existentes
compatíveis com essa fonte sem regravar `participants` como espelho:

1. inscrever;
2. desinscrever e sair da espera;
3. formar dupla;
4. desfazer dupla.

O bloco não altera chave, jogos, placares, agenda, presença, histórico nem
categorias. Torneios sem `canonicalRegistrationMigration.fingerprint`
continuam integralmente na rota legada durante a transição.

## Boundary único

Uma função privada decide a rota dentro da mesma transação que leu o torneio:

- sem marcador de migração: mantém o núcleo legado atual;
- com marcador: lê `registrations`, valida sua contagem contra o marcador e
  executa somente a transição canônica;
- qualquer divergência, documento inválido, categoria ausente ou dupla
  incompleta aborta antes de escrita.

O boundary recebe identidades estáveis (`uid` ou `manualParticipantId`) e IDs
de categoria. Nome é permitido somente como rótulo de participante manual e
nunca participa de busca, autorização ou unicidade.

## Paridade por operação

### Inscrever

Para conta autenticada, reutiliza a janela de inscrição e
`category-eligibility-core` já usados por `requestCanonicalRegistration`.
O organizador só pode inserir participante manual com ID estável e categorias
explícitas. A operação cria no máximo um documento por `(participantKey,
categoryId)` e usa `tx.create`, portanto duas chamadas concorrentes não criam
duplicata. Após sorteio, a decisão de espera precisa ser representada por
`status: waitlisted`, sem tocar `standbyParticipants` legado.

### Desinscrever e sair da espera

`withdraw` e `leaveWaitlist` atualizam somente os registros da identidade
afetada. Se uma pessoa sair de dupla fixa, a dupla é desfeita nos dois
registros da categoria; a outra pessoa permanece inscrita. Nenhum documento é
apagado: histórico e idempotência permanecem auditáveis.

### Formar e desfazer dupla

As duas pessoas precisam ter registros elegíveis, na mesma categoria e sem
`fixedPairId`. A formação grava o mesmo ID determinístico nos dois documentos;
o desfazer remove esse ID dos dois. A chamada traz obrigatoriamente o
`categoryId`: em categorias paralelas não existe inferência pelo nome, nem
escolha arbitrária de uma das vagas. Não há fallback por nome nem busca de
participante na projeção legada.

## Segurança e compatibilidade

- Autorização continua decidida pelo UID autenticado na Function.
- As Rules continuam negando escrita direta em `registrations`.
- Depois do marcador, as Rules mantêm `participants`, espera, membros e
  origens de dupla imutáveis para o navegador. Há teste no emulador tanto para
  o campo legado do documento quanto para a subcoleção de espelho.
- A leitura de compatibilidade usa `rosterFromRegistrations`, mas não persiste
  a projeção em `participants`.
- A replicação legado→Sandbox é explicitamente pulada se o Sandbox já tiver
  marcador canônico; uma chamada canônica não aciona essa replicação. Cada
  Sandbox é materializado como torneio próprio, com seu próprio censo.

## Critérios de aceite

1. testes puros cobrem criação, espera, saída, dupla e categorias paralelas;
2. emulador cobre concorrência de duas inscrições e de formar/desfazer dupla;
3. cada callable canônica é autorizada por UID e rejeita nome como identidade;
4. documentos canônicos continuam válidos para `rosterFromRegistrations`;
5. nenhum teste permite `participants` como escrita autoritativa após o
   marcador de migração;
6. a replicação legada nunca escreve em Sandbox que já tenha marcador canônico;
7. a flag global permanece `false` até todos esses testes e o piloto individual
   passarem.
