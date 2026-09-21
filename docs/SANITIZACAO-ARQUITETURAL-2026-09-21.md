# Sanitização arquitetural — desenho de referência

## Decisão de escopo

Este documento define a arquitetura-alvo e a ordem de correção antes de alterar
formatos de torneio. Não autoriza reescrita ampla: cada bloco deve preservar o
comportamento que já funciona, introduzir uma única autoridade canônica e ter
testes de unidade, integração com emulador e regressão de Rules.

## Invariantes não negociáveis

1. Uma conta autenticada é identificada exclusivamente por `uid`.
2. `users/{uid}` é o único perfil de uma conta. Referências em dados operacionais
   guardam `uid`; textos visíveis são projeções substituíveis, nunca identidade.
3. O nome de exibição é único globalmente e é reservado antes da criação do perfil.
   A reserva é transacional e usa uma chave derivada da forma normalizada do nome.
4. Uma pessoa que ainda não tem conta e é incluída pelo organizador recebe
   `manualParticipantId`, estável dentro do torneio. Ela não é uma conta e não
   pode repetir o mesmo nome naquele torneio.
5. Nenhuma escrita de produto parte do navegador. O navegador chama uma Cloud
   Function autenticada; a Function valida autorização, invariantes e atualiza
   projeções. O cliente usa listeners e leituras para atualização em tempo real.
6. Suspeita de contas da mesma pessoa abre revisão explícita. Não há consolidação,
   transferência ou exclusão automática de dados.
7. Dados biométricos brutos não são persistidos no Firestore.
8. Uma fase é `classificatoria` ou `eliminatoria`. Sorteio de confrontos,
   sorteio de duplas, Rei/Rainha e Super 8 são estratégias de sorteio, não tipos
   paralelos de fase.

## Estado verificado em 21/set/2026

O commit `57005894` fecha o primeiro corte de identidade:

- `initializeUserProfile` reserva `displayNameClaims/{sha256(nome normalizado)}`
  e cria `users/{uid}` na mesma transação.
- Rules bloqueiam `create` direto em `users/{uid}`.
- A criação inicial no cliente chama a Function; não há fallback de escrita.
- Inscrição deduplica conta por `uid` e participante sem conta por
  `manualParticipantId`; nome não participa dessa deduplicação.
- `npm test` completo foi executado com os emuladores locais e encerrou com êxito.

Limite deste corte: a regra de `update` ainda permite campos de perfil escritos
diretamente pelo cliente. Isso é dívida conhecida, não uma exceção à arquitetura.

## Modelo de dados de referência

| Entidade | Chave canônica | Campos que podem ser projeção | Autoridade de escrita |
|---|---|---|---|
| Perfil | `users/{uid}` | `displayName`, foto, preferências | Functions de perfil |
| Reserva de nome | hash do nome normalizado | nome para diagnóstico | Function de perfil, transação |
| Participante com conta | `uid` | nome/foto para renderização | Functions de inscrição e projeção |
| Participante sem conta | `manualParticipantId` | nome informado pelo organizador | Function de inscrição |
| Dupla/time | `teamId` e membros por `uid` ou `manualParticipantId` | rótulo de exibição | Function de pares/sorteio |
| Jogo | `matchId` globalmente único | nomes dos lados | Function de materialização/placar |
| Inscrição | `tournamentId + categoryId + participantKey` | nome/foto | Function de inscrição |

`participantKey` deve ser uma união discriminada: `uid:<uid>` ou
`manual:<manualParticipantId>`. Não é permitido usar nome, e-mail ou telefone
como chave, índice de deduplicação ou alvo de atualização.

## Arquitetura de escrita

Cada ação de escrita deve ter uma Function com contrato pequeno e idempotência
por `operationId` quando a interface puder repetir a chamada. O servidor deve:

1. derivar o ator de `request.auth.uid`;
2. buscar estado atual e autorizações;
3. validar transição e invariantes;
4. gravar documento fonte, recibo e projeções na mesma transação ou lote;
5. devolver o identificador/estado mínimo; e
6. deixar o cliente observar a confirmação pelo listener.

As Rules passam a negar a coleção ou campos cuja Function já foi migrada. Não
há transação alternativa no navegador, nem captura de erro que persista por
outro caminho.

### Ordem de migração

| Bloco | Superfície atual encontrada | Correção canônica | Critério de aceite |
|---|---|---|---|
| P0 | criação de perfil | concluído no commit `57005894` | Rules negam create e Function reserva nome |
| P1 | escritores de perfil em `auth`, `tournaments-categories`, `store`, `bracket-ui`, notificações, locais, presença e termos | comandos fechados por domínio; renomear chama `renameDisplayName` transacional | Rules negam todo update direto em `users/{uid}`; testes de cada campo permitido |
| P2 | inscrição, retirada, lista de espera e pares | canonizar chamadas existentes em Functions e remover helpers transacionais do cliente | idem: cliente não escreve torneio, inscrição ou pares |
| P3 | criação/edição/materialização/remoção de torneio e resultados | Commands separados por transição de estado, com projeções controladas no servidor | Rules fecham `tournaments`, subcoleções e resultados contra mutação direta |
| P4 | notificações, modelos, amistosos e histórico | comandos específicos, recibos idempotentes e filas somente do servidor | Rules fecham subcoleções e filas correspondentes |
| P5 | remoção de código e testes de autenticação extintos | apagar implementação, textos, testes e documentação obsoleta; manter somente fluxo atual suportado | busca de repositório sem referências, exceto registro de migração que não seja distribuído |

P1 deve ser subdividido para não virar uma Function permissiva:

- preferências visuais (`theme`, `uiScale`);
- preferências de notificações;
- presença/estado transitório de amistosos, preferencialmente fora do perfil se
  não for dado de perfil;
- atributos de elegibilidade declarados pelo usuário;
- alteração de nome, que também move a reserva transacional;
- atributos provenientes do provedor de autenticação, que não podem ser aceitos
  como verdade vinda do navegador.

## Identidade, acesso e prevenção de contas múltiplas

A autenticação diária deve usar credenciais de plataforma (passkeys/WebAuthn),
com verificação local por Face ID, Touch ID ou biometria Android quando o
dispositivo a oferece. A biometria fica no autenticador; o Scoreplace guarda
apenas credenciais públicas WebAuthn e metadados técnicos necessários.

Detecção remota de duplicidade de pessoa é um projeto separado e de alto risco:

- fornecedor especializado para prova de vida e comparação facial;
- consentimento específico, retenção mínima, avaliação de impacto à privacidade
  e caminho manual de contestação;
- nenhum frame, imagem facial, embedding ou template biométrico no Firestore;
- resultado limitado a estado de verificação e referência opaca do fornecedor;
- nenhuma fusão automática. Ação de revisão é humana, auditada e reversível.

Antes desse projeto, o sistema pode bloquear duplicidade comprovada por
credenciais e manter sinais de suspeita estritamente como fila de revisão. Não
deve alegar que consegue provar identidade física só com dados cadastrais.

## Contrato de torneios e sorteio

```text
Torneio
  categorias (regras de coexistência e elegibilidade)
  fases[]
    classificatoria | eliminatoria
    política de equipe: individual | dupla formada | dupla sorteada fixa | dupla sorteada por rodada
    estratégia de sorteio: confrontos | rei-rainha | super-8
    política de resolução eliminatória: bye | repescagem | sobra-unica
```

Classificatória cobre pontos corridos e grupos. Liga é apenas rótulo legado a
migrar para `classificatoria`, sem caminho de execução próprio. A fase
eliminatória recebe classificados e aplica semeadura por desempenho ou por
equilíbrio conforme configuração explícita.

Rei/Rainha sorteia grupos de quatro e gera as três combinações de dupla e jogos
da rodada; pode produzir duplas fixas para uma eliminatória posterior. Super 8
é outra estratégia de sorteio classificatório, não uma terceira espécie de
fase. Ambos devem reutilizar a mesma materialização de rodada, placar,
classificação, audiência e numeração global de jogos.

## Decisão de chave eliminatória

A planilha anexa confirma três políticas distintas. Elas devem ser uma enum
persistida antes do primeiro sorteio e aplicada também quando novos times
elegíveis exigirem redesenho:

| Política | Regra | Consequência para 36 times |
|---|---|---|
| `bye` | play-in até a potência de dois inferior e chave cheia depois | 36 jogos; 28 times não jogam no início |
| `repescagem` | todos jogam; perdedores voltam até a rodada seguinte fechar potência de dois | 50 jogos; 14 derrotados voltam na rodada 2 |
| `sobra-unica` | a cada rodada ímpar há uma única sobra; folga ou repescagem explícita | 36 a 39 jogos; folga é proibida na semifinal |

Para `sobra-unica`, o seletor deve considerar o histórico de sobras: ninguém
recebe uma segunda sobra enquanto outro time elegível ainda não recebeu a
primeira. Se a regra exigir repescagem, a escolha da perdedora também precisa
ser determinística e auditável. A nova chave deve ser calculada de todo o
conjunto elegível, com `drawVersion` e recibo imutável; não é aceitável anexar
um jogo isolado que quebre a estrutura da política escolhida.

## Regras de sorteio classificatório

O motor recebe um conjunto de participantes identificados por chave estável e
um estado de histórico. Ele aplica, nesta ordem:

1. filtro de elegibilidade e categoria;
2. cluster dinâmico de desempenho configurado pelo organizador;
3. prioridade de quem ficou fora de rodada anterior;
4. penalidade para repetir parceiro e adversário antes de esgotar alternativas;
5. semeadura ou equilíbrio configurado;
6. desempate reproduzível por `drawSeed` persistido.

O resultado deve incluir explicação auditável de cada exceção (por exemplo,
cluster sem combinação possível), sem fingir que uma preferência foi cumprida
quando era matematicamente inviável.

## Invariantes e testes obrigatórios

- teste de propriedade para uma conta aparecer no máximo uma vez por categoria;
- teste de propriedade para nome único, inclusive concorrência e normalização;
- teste de emulador comprovando que toda escrita migrada recebe `403` no cliente
  e `200` somente pela Function;
- teste de idempotência: repetir o mesmo comando não duplica inscrição, jogo,
  notificação ou histórico;
- teste de projeção: mudança de nome não altera chaves e atualiza apenas a
  projeção autorizada;
- teste de chave por `N=2..64` para as três políticas, incluindo número de
  jogos, entrantes, final e disputa de terceiro;
- teste de justiça de sobra, repetição de parceiro/adversário e exclusões por
  cluster;
- teste de número de jogo global único entre fases e reexecução de sorteio;
- teste de migração de dados com modo `dry-run`, relatório e rollback. Nenhuma
  migração apaga ou move contas automaticamente.

## Inventário que orienta o próximo bloco

A varredura de 21/set/2026 encontrou 11 chamadas atuais de
`FirestoreDB.saveUserProfile`: 8 em `js/views/auth.js`, 2 em
`js/views/tournaments-categories.js`, 1 em `js/views/bracket-ui.js` e o ponto
amplo de salvamento em `js/store.js`. Há também escritores que contornam esse
helper: `js/notifications.js`, `js/views/venues.js`, `js/presence-geo.js`,
`js/views/terms-acceptance.js`, `js/views/create-tournament.js` e caminhos de
recuperação em `js/views/auth.js` usam `collection('users').doc(...).set` ou
`update` diretamente.

P1 não pode fechar campos isolados enquanto esses escritores coexistirem: a
ordem executável é inventariar o payload de cada domínio, criar Function com
allowlist e transação, redirecionar todos os chamadores daquele domínio e só
então negar os campos equivalentes nas Rules. Começar por perfil evita que
nome e elegibilidade continuem em cópias concorrentes; P2 e P3 vêm antes de
qualquer alteração de formato de fase.

## Gates de execução

Cada bloco só pode ser commitado quando `npm test` completo passar, o carimbo de
Rules estiver atual e o diff não introduzir nova escrita direta. Antes de uma
migração de dados, produzir `dry-run` assinado por versão, métricas de impacto,
amostra de validação e plano de reversão. Publicação e deploy ficam fora deste
plano e exigem autorização explícita.
