# Roteiro executável — identidade única e entrada sem senha

Este é o roteiro de implementação da arquitetura definida em
[`arquitetura-verificacao-identidade.md`](arquitetura-verificacao-identidade.md).
Ele não autoriza contratação de fornecedor, coleta biométrica em produção ou
corte de acesso sem os gates indicados. Cada entrega é implantável e reversível
independentemente; a seguinte não começa com pendência crítica na anterior.

## Resultado que a sequência deve produzir

Uma pessoa terá um único `canonicalUid`, sem inscrição repetida numa categoria.
Após migrada, entra no uso diário por passkey liberada pela biometria local do
aparelho. A captura facial com prova de vida serve para identidade e deduplicação
no cadastro, recuperação e risco — não é simulada pelo aplicativo e não é
repetida a cada abertura.

## Entrega I0 — contenção imediata

**Objetivo:** nenhuma coincidência de nome, e-mail, telefone ou foto pode mover
dados entre UIDs automaticamente.

| Trabalho | Alvo atual | Critério de aceite |
| --- | --- | --- |
| Trocar efeito de gatilho por caso privado | `autoMergeOnProfileUpdate` | Alterar telefone/e-mail só grava um caso idempotente; não chama `_executeMerge`. |
| Desativar materialização agendada | `scheduledAutoMergeCleanup`, `_scanAndMergeByField` | Varredura produz métrica/caso, jamais fusão, lápide ou redirecionamento. |
| Proteger caminhos alternativos | `_mergeAccountsKeepOlder` e comandos de merge | Só aceita prova explícita de controle dos dois lados ou decisão interna auditada. |
| Corrigir vaga manual | `requestParticipantMerge` | Usa `manualParticipantId`, nunca rótulo ou nome genérico. |
| Reescrever testes legados | testes de merge | O teste prova ausência de efeito automático, inclusive em concorrência. |

**Reversão:** o novo caso privado pode ser desativado; a fusão automática não
volta como mecanismo de reversão. Se houver incidente, a resolução é manual e
auditada.

## Entrega I1 — fonte única de inscrição

**Objetivo:** bloquear repetição por UID antes de depender de deduplicação
facial.

1. Criar registro canônico de inscrição com chave
   `tournamentId/categoryId/canonicalUid` e transação no servidor.
2. Separar `manualParticipantId` como entidade local de torneio.
3. Converter listas embutidas e espelhos atuais em projeções de leitura,
   nunca em autoridades concorrentes de escrita.
4. Fazer `enrollParticipant` resolver `canonicalUid` e rejeitar payload que
   tente representar outra pessoa.
5. Migrar um torneio inativo de teste, comparar censo antes/depois e só então
   ativar torneios novos no modelo canônico.

**Aceite:** duas chamadas concorrentes, dois aparelhos e dois provedores da
mesma conta deixam exatamente uma inscrição; participante manual não colide
com conta autenticada; alterar nome/foto não reescreve dados competitivos.

## Entrega I2 — estado de identidade e barreira de autorização

**Objetivo:** criar a estrutura sem ainda exigir captura facial de usuários.

- Criar `accountIdentity/{uid}`, `identityVerifications/{verificationId}` e
  claims mínimos em ambiente isolado.
- Publicar Functions para leitura do próprio estado, início de migração e
  recuperação, com idempotência e trilha de auditoria.
- Aplicar Rules que negam acesso direto às coleções privadas.
- Introduzir `identityGate` inicialmente em modo de auditoria: loga operações
  que seriam bloqueadas, sem bloquear a coorte geral.
- Criar painel interno sem imagem ou biometria que mostre somente estado,
  prazo, motivo técnico e decisão auditada.

**Aceite:** cliente não consegue aprovar estado, inventar UID canônico ou ler
outro caso; trocar o estado de uma conta revoga sua autorização de Function;
nenhum claim de papel existente é apagado.

## Entrega I3 — passkey e biometria local

**Objetivo:** entregar a entrada diária instantânea antes do corte global.

1. Publicar as associações de domínio iOS/Android em ambiente de teste e
   validar em dispositivos físicos distribuídos.
2. Implementar desafios WebAuthn e armazenamento de chave pública, contador e
   aparelho, sem segredo compartilhado.
3. Registrar e usar passkey em coorte interna; o servidor troca assertion
   válida por sessão Firebase do mesmo `canonicalUid`.
4. Implementar `ScoreplaceBiometryPlugin` apenas para reautenticar comandos
   sensíveis com chave nativa não exportável.
5. Cobrir perda de aparelho, segunda passkey, reinstalação, mudança de
   biometria local e fallback acessível.

**Aceite:** Face ID/Touch ID ou autenticador Android libera a entrada sem senha;
uma assertion repetida, expirada ou de outro domínio falha; conta não cria UID
novo em segundo aparelho.

## Entrega I4 — prova de conceito facial isolada

**Objetivo:** validar precisão, fraude, acessibilidade e operação antes de
coletar biometria da base de usuários.

- Selecionar fornecedor apenas pelos critérios contratuais e técnicos já
  definidos; não enviar produção nem criar dependência irreversível.
- Integrar sessão curta, captura direta, prova de vida, webhook assinado e
  limpeza de evidência em ambiente isolado.
- Testar busca um-para-muitos, candidato duplicado, apresentação fraudulenta,
  captura ruim, contestação e exceção de gêmeos.
- Definir limiares com métricas reais do público de teste; candidato nunca vira
  fusão ou recusa automática.

**Gate de saída:** aprovação explícita de segurança, privacidade, operação e
acessibilidade com métricas e procedimento de incidente. Sem isso, não há
migração de contas.

## Entrega I5 — migração progressiva e corte

**Objetivo:** converter contas existentes sem paralisar torneios nem aceitar
novas identidades paralelas.

1. Fazer censo, backup e classificar coortes por atividade futura.
2. Migrar equipe e voluntários; corrigir fricções observadas.
3. Convidar coortes, registrar `migration_invited` e oferecer a conclusão na
   mesma sessão.
4. Restringir após o prazo somente as capacidades operacionais da coorte;
   preservar o UID e os dados.
5. Aplicar a exigência geral somente após critérios de conclusão e incidentes
   críticos zerados.

**Aceite:** credencial Firebase antiga não atravessa Rules nem Functions sem
`identityGate: verified`; recuperação chega ao mesmo `canonicalUid`; torneio em
andamento não perde resultado nem ganha participante duplicado.

## Gates de decisão que exigem autoridade de produto

| Decisão | Por que não pode ser presumida pelo código |
| --- | --- |
| Fornecedor de prova de vida e comparação facial | Envolve contrato, custo, retenção, local de tratamento e métricas de precisão. |
| Tamanho da coorte piloto e metas de aprovação | Determinam exposição real de usuários e risco operacional. |
| Prazo de cada coorte e data de corte geral | Afetam acesso de organizadores e atletas em torneios ativos. |
| Regra para aparelho sem biometria forte | Define a fronteira entre conveniência, acessibilidade e garantia de identidade. |
| Equipe autorizada a revisar exceções | Exige segregação de função e responsabilidade por decisão sensível. |

## Não-regressões obrigatórias

- Nenhuma alteração de perfil propaga nome, e-mail ou foto como identidade de
  participante.
- Nenhuma rota antiga produz um segundo UID operacional para pessoa já
  verificada.
- Nenhuma captura ou vetor facial entra no Firestore, logs de Function,
  analytics ou armazenamento do aplicativo.
- Nenhuma forma de autenticação isolada, inclusive e-mail, SMS, Google ou
  Apple, concede inscrição ou papel operacional depois do corte.
- Nenhuma falha facial exclui definitivamente uma pessoa sem possibilidade de
  contestação e revisão.
