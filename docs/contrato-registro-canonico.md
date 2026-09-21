# Contrato de registro canônico de inscrição

Este contrato descreve a primeira fonte de verdade para inscrições. Ele não
altera a leitura legada e não autoriza migrar dados existentes. A prévia que o
antecede está em `previewCanonicalRegistrationMigration`.

## Autoridade e endereço

O registro novo vive em:

```text
tournaments/{tournamentId}/registrations/{registrationId}
```

`registrations` já existe para torneios novos que adotaram as categorias
tipadas. O nome não reutiliza
`inscritos`, que é a parte dividida do elenco legado. O identificador do
documento é determinístico:

```text
base64url(participantKey) + "__" + base64url(categoryId)
participantKey = "uid:" + uid | "manual:" + manualParticipantId
```

Portanto, uma conta tem no máximo um documento por categoria de torneio. Nome,
e-mail, telefone, foto e rótulo digitado não entram na chave.

## Forma implementada nesta etapa

```js
{
  registrationId,
  tournamentId,
  categoryId,
  participantKind: 'account',
  participantUid,
  status: 'pending' | 'confirmed',
  validationState: 'approved' | 'pending_review',
  createdAt,
  updatedAt
}
```

Na exclusão de conta, o mesmo documento passa para `participantKind:
'deleted_account'`, `status: 'withdrawn'`, `validationState: 'withdrawn'` e
`withdrawnReason: 'account_deleted'`; `participantUid` é removido.

O documento não guarda nome, foto, e-mail, telefone, data de nascimento,
habilidade nem cópia de perfil. Participante manual, decisões de organização,
lista de espera e migração ainda são extensões planejadas — não devem ser
inferidos nem gravados pelo cliente.

`team`, `roundAssignment` e `match` são entidades posteriores. Criar uma dupla
ou sorteá-la não cria nem duplica registro de inscrição.

## Comandos permitidos

Toda escrita será feita por Function. O cliente envia intenção e recebe o
resultado, sem fallback direto no Firestore.

| Comando proposto | Autoridade | Transação e validações |
| --- | --- | --- |
| `requestCanonicalRegistration` | Próprio UID. | Lê torneio, configuração de categoria, exclusões, lifecycle e documento determinístico. Recusa categoria inválida, duplicata, fase não elegível e conta em exclusão/fusão. |
| `withdrawCanonical` | Próprio UID ou organização. | Faz transição fechada; não remove fatos de jogo nem libera inscrição materializada sem fluxo de substituição. |
| `decideCanonicalRegistration` | Organização autorizada. | Aplica rigor moderado/oficial, com motivo permitido e auditoria. |
| `migrateCanonicalRegistrations` | Organização de torneio piloto inativo. | Exige fingerprint atual da prévia, zero exceções e confirmação explícita. Grava somente a coleção nova. |

Rules terão `allow write: if false` para `registrations`. A Rule protege a rota
direta; a Function autentica, autoriza, valida a transição e executa a
transação. Cada comando tem teste unitário, Rules no emulador e corrida
concorrente.

## Categorias e exclusividade

`categoryId` precisa ser um identificador estável de configuração, não o texto
que aparece na tela. A Function recebe somente IDs válidos do torneio. Para
cada inscrição candidata, ela consulta os registros do mesmo participante no
torneio e aplica `exclusiveGroup`: duas categorias no mesmo grupo são
recusadas; grupos diferentes podem coexistir.

A sentinela `__uncategorized__` existe apenas no censo do legado. Nenhum novo
comando pode criá-la como se fosse escolha do participante.

## Estratégia de piloto sem duas autoridades

1. Executar prévia em torneio inativo autorizado e guardar o fingerprint fora
   do cliente.
2. Interromper se houver conflito, equipe composta ou identidade ausente. Não
   decompor dupla por inferência.
3. Criar registros v1 somente depois da aprovação do censo. Não alterar
   `participants`, `standbyParticipants`, `waitlist` ou `inscritos` como parte
   desse comando.
4. Entregar leitor de `registrations` e validar paridade de contagem antes de
   habilitar qualquer comando de inscrição sobre a coleção nova.
5. Transferir a autoridade de escrita em uma fronteira única. Projeção legada,
   se for temporariamente necessária, é derivada pelo servidor e tem prazo de
   retirada; ela nunca aceita escrita concorrente.

O piloto não pode ocorrer depois de partida, resultado, presença, W.O. ou fase
materializada. Mudança posterior de elenco exige novo fingerprint. Não há
redesenho automático de jogo iniciado.

## Critérios de aceite do piloto

- Duas chamadas concorrentes para a mesma conta/categoria deixam um único
  documento de ID determinístico.
- Uma mesma conta pode entrar em categorias de grupos distintos, mas não em
  duas do mesmo `exclusiveGroup`.
- Manual e conta autenticada nunca colidem, mesmo com o mesmo rótulo.
- Alterar nome ou foto do perfil não muda documentos de inscrição.
- Na exclusão de conta, a Function preserva o documento como histórico
  `withdrawn/account_deleted`, remove `participantUid` e não expõe a coleção
  ao cliente. O ID técnico permanece apenas como âncora interna não legível
  pelas Rules.
- Se uma falha excepcional produzir, na fusão explícita de contas, inscrições
  em categorias distintas do mesmo `exclusiveGroup`, o caso é submetido ao
  organizador. A pessoa fica fora do sorteio até a decisão; o sistema não
  escolhe uma categoria por conta própria. Isso não é evidência de caso legado
  existente nem autoriza migrar torneios antigos.
- Cliente autenticado não cria, atualiza ou apaga `registrations` diretamente.
- Censo, fingerprint, registros e projeção têm contagens reconciliadas antes e
  depois da mudança de autoridade.
