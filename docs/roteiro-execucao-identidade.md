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

### Contrato preparatório de migração

Enquanto o produto suporta seleção múltipla de categorias, cada categoria
selecionada corresponde a um registro canônico distinto. A ausência explícita
de categoria usa o identificador reservado `__uncategorized__`; não é
convertida em categoria escolhida pelo servidor. A chave do participante é
sempre `uid:<uid>` ou `manual:<manualParticipantId>`.

Antes de qualquer escrita, o dry-run deve enumerar os registros derivados do
elenco legado, duplicatas e entradas incompatíveis. Entradas compostas (dupla
ou equipe) e entradas sem identidade estável ficam no relatório de exceção e
interrompem a ativação: não podem ser desmembradas por inferência. A primeira
ativação continua condicionada ao censo aprovado de um torneio inativo de
teste; este contrato não autoriza migração nem dual-write em produção.

O censo é obtido por `previewCanonicalRegistrationMigration`, callable somente
para a organização do torneio. A Function relê o elenco (inclusive em torneio
dividido) numa transação e devolve candidatos, conflitos e incompatibilidades;
ela não grava documentos de inscrição nem altera projeções legadas.

A prévia também devolve um fingerprint SHA-256 calculado apenas de chaves de
registro e exceções estruturais. A aprovação de uma migração futura deve
referenciar esse fingerprint; qualquer mudança de elenco, categoria ou
incompatibilidade exige novo censo.

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

## Entrega S1 — materialização de histórico por fonte canônica

**Objetivo:** retirar do navegador a capacidade de registrar estatísticas para
qualquer UID.

1. Inventariar os três construtores atuais de `saveUserMatchRecords` e as
   exclusões de vínculo casual.
2. Para resultado de torneio, materializar `matchHistory` na confirmação
   autoritativa do resultado, com ID determinístico e reexecução idempotente.
3. Para partida casual, reler `casualMatches/{id}` no servidor e materializar
   somente se estiver finalizada e o chamador for participante autorizado.
4. Migrar a rejeição de vínculo casual para uma Function que valida o vínculo
   antes de apagar somente `casual_<id>` do próprio perfil.
5. Negar toda escrita direta em `users/{uid}/matchHistory/**` e provar no
   emulador: cliente não cria, altera ou apaga; Function não aceita jogadores
   ou placar declarados pelo navegador; reexecução não duplica registros.

**Aceite:** nenhum usuário pode gravar histórico em perfil de terceiro; uma
partida confirmada gera exatamente uma projeção por participante com UID; um
resultado que falhe ou seja substituído não deixa estatística divergente.

### Evidência de implementação e contrato de corte — 21/09/2026

A confirmação de resultado de torneio já possui uma única autoridade:
`applyMatchResult`, em `functions-autodraw/index.js`, delega para
`_aplicaPlacarNaTransacao`. Ela lê o torneio fresco, aplica o motor puro e
grava o estado da chave, o espelho de resultados e a auditoria no mesmo commit.
Os desfechos relevantes são `applied`, `pending`, `in-progress`, `disputed`,
`match-reset`, `result-reopened` e `wo-reverted`. Portanto, a projeção de
histórico de torneio só pode nascer depois de `applied` e deve ser apagada no
mesmo commit nas três reaberturas; propostas, disputa e placar em andamento
não geram histórico.

O identificador da cópia continua determinístico, `t_<tournamentId>_<matchId>`.
Os destinatários vêm exclusivamente dos slots canônicos
`team1Uids`/`team2Uids` ou `p1Uid`/`p2Uid`; nomes de `p1`, `p2`, `team1` e
`team2` não participam da decisão, do destinatário nem da deduplicação.

O leitor atual ainda não está pronto para uma projeção sem rótulos:
`match-history.js`, `match-replay.js` e `tournaments-analytics.js` usam
`players[].name` para apresentar parceiro/adversário, e a análise detalhada
ainda indexa `playerStats` por nome. Assim, o corte deve entregar junto:

1. um núcleo puro que derive o registro somente de uma partida canônica;
2. a projeção transacional no resultado de torneio e a porta de releitura para
   partida casual encerrada;
3. leitores que resolvam rótulos vivos por UID e usem `playerStats` por UID;
4. substituição dos três construtores do navegador e da exclusão casual por
   chamadas de Function; e
5. a negação total de escrita direta nas Rules, com provas no emulador.

Não é aceitável introduzir uma permissão parcial por prefixo de ID, tipo de
partida ou campo declarado pelo cliente. Enquanto existir uma única escrita
direta de `matchHistory`, qualquer cliente autenticado ainda poderá fabricar
uma estatística própria; por isso a alteração das Rules é o último passo da
mesma entrega, nunca uma promessa para depois.

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
