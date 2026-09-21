# Contrato de categorias e elegibilidade

Este contrato define a fronteira que antecede a migração de inscrição para o
registro canônico. Ele não muda inscrições existentes, não classifica pessoas
por inferência e não introduz documentos, biometria ou regra sensível nova.

## Diagnóstico confirmado

1. `enrollParticipant` é uma Cloud Function transacional e Rules negam a
   escrita direta de inscrição. Isso já é a porta de escrita correta.
2. A Function hoje recebe `participantObj` e preserva `category`/
   `categories` vindas do navegador. As verificações de idade, gênero,
   completude e rigor estão em `_checkEnrollmentEligibility` no cliente.
3. `combinedCategories` é uma lista de rótulos compostos, não uma definição
   estável de categoria, dimensão ou exclusividade. Um texto como `Fem A` não
   permite ao servidor distinguir com segurança seus componentes.
4. `enroll-core.isAlreadyEnrolled` deduplica um UID no torneio inteiro. É
   seguro contra repetição acidental na estrutura atual, mas impede a inscrição
   legítima em categorias paralelas, como habilidade B e 50+.
5. O cliente tem um ramo fail-open para falha técnica do seletor de categoria.
   Ele só pode desaparecer depois que a Function receber um intent tipado e
   devolver o resultado autoritativo; antes disso removê-lo apenas trocaria um
   erro de interface por bloqueio indevido.

## Modelo novo: definições, não rótulos

Fases novas guardam uma lista fechada de definições com IDs estáveis. A tela
mostra `label`; inscrições, sorteio, histórico e autorização usam somente
`id` e `uid`.

```js
{
  categoryDefinitions: [{
    id: 'skill-b',
    label: 'B',
    dimension: 'skill',
    exclusivityGroup: 'skill',
    criteria: { skill: { allowed: ['B'] } },
    enabled: true
  }],
  enrollmentRigor: 'casual' | 'moderate' | 'official'
}
```

Uma definição de idade usa, por exemplo,
`criteria: { age: { minYears: 50 } }`; uma categoria customizada pode não ter
critério automático. Não se deduz critério de texto livre nem se usa nome,
e-mail, celular ou foto como chave.

## Invariantes de inscrição

Para pessoa com conta, a chave é `(tournamentId, uid, categoryId)`. Para vaga
manual sem conta, é `(tournamentId, manualParticipantId, categoryId)`. O
registro canônico de inscrição definido em
[`contrato-registro-canonico.md`](contrato-registro-canonico.md) recebe essa
chave; o roster/materialização de jogos é projeção posterior, não a fonte de
unicidade.

- A mesma chave é idempotente: repetir a chamada devolve o estado existente.
- Duas categorias do mesmo `exclusivityGroup` são recusadas.
- Categorias de grupos distintos podem coexistir: `skill-b` e `age-50` são
  duas inscrições válidas da mesma pessoa.
- Participante manual só é criado pelo organizador e nunca é unido por
  semelhança de nome ou contato.
- A Function lê o perfil do UID dentro da transação/decisão; o payload do
  navegador nunca afirma idade, habilidade, gênero ou histórico em nome dele.
- A inscrição grava IDs e estado de validação. Dados de perfil continuam no
  perfil; nome/foto podem existir apenas como projeção de apresentação legada
  até a migração do roster.

## Rigor executado no servidor

| Rigor | Ação da Function |
| --- | --- |
| `casual` | Aceita categoria existente escolhida, sem validar atributos do perfil. |
| `moderate` | Aceita, mas grava `validationState: 'pending_review'` quando faltam dados ou há divergência. |
| `official` | Exige os critérios configurados e grava somente se o perfil/evidência aprovada os atender. |

O estado `approved`, `pending_review`, `rejected` pertence à inscrição, com
`validatedByUid` e carimbo do servidor quando houver revisão organizacional.
`official` não pode ser anunciado como ativo enquanto a validação server-side
não existir para todos os critérios que o formulário expõe.

## Limites deliberados

- Data de nascimento é evidência declarada de perfil até que exista processo
  separado, autorizado e auditável de verificação documental.
- Histórico LetzPlay só é evidência de habilidade depois de uma política de
  fonte, atualização e revisão definida pelo organizador. Ausência de histórico
  não pode ser trocada silenciosamente por uma inferência de nome.
- Não há neste contrato regra sobre sexo biológico, documentos sensíveis,
  reconhecimento facial, digital ou teste genético. Essas decisões exigiriam
  finalidade, base legal, retenção, segurança e autorização expressas.

## Sequência de migração

1. Criar validador puro das definições e suas combinações, com testes de
   exclusividade/paralelismo e rigor.
2. Criar Function de configuração de categorias que valida e grava a definição
   antes do primeiro sorteio; Rules negam a escrita direta equivalente.
3. Criar a inscrição canônica por UID/categoria, ainda sem dual-write para
   torneios ativos. **Implementado:** `requestCanonicalRegistration` só admite
   torneio novo, sem elenco/sorteio legado; grava
   `tournaments/{tid}/registrations/{registrationId}` com UID, categoria e
   estado de validação. A tela legada ainda não chama essa porta.
4. Migrar um torneio inativo autorizado, validar contagens e só então trocar a
   tela para chamar a Function nova.
5. Retirar o fallback client-side de categoria depois que a Function cobrir os
   desfechos `accepted`, `pending_review`, `rejected` e `conflict`.

O array legado `participants` continua somente como adaptador até o passo 4;
ele não deve receber nova semântica de múltiplas categorias.
