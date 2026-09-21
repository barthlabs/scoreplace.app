# Plano de sanitização arquitetural do Scoreplace

## Decisão de trabalho

Este documento é o contrato para a reforma. Nenhuma funcionalidade nova será
acoplada aos caminhos legados enquanto os contratos abaixo não estiverem
implementados e testados. O objetivo não é trocar nomes na interface: é fazer
com que cada fato tenha uma única origem, cada operação tenha uma autoridade
única e cada regra seja a mesma no navegador e no servidor.

Torneios cuja fase já foi materializada são registros históricos. Eles
continuam legíveis pelo adaptador legado e não recebem conversão estrutural em
massa. Um torneio novo, ou uma fase ainda não sorteada, usa o contrato novo.
Qualquer migração de dados existentes será reversível, acompanhada de backup,
censo antes/depois e aprovação específica.

## O que a inspeção confirmou

| Assunto | Evidência atual | Consequência |
| --- | --- | --- |
| Fases | `format2.js` compila `fmt2` para `phases`, mas o resultado ainda persiste `formatCode: 'liga'`/`format: 'Liga'`. | O adaptador pode continuar existindo, mas não pode ser o modelo do domínio. |
| Sorteio | Rei/Rainha já é tratado em diversos pontos como modo de sorteio; ainda há caminhos e testes dependentes de `Liga`. | Deve migrar para uma modalidade explícita dentro de uma fase classificatória, sem apagar o adaptador de leitura. |
| Chaves | `tournaments-draw-prep.js` oferece uma escolha; `phases-engine.js` documenta e executa a decisão ignorando `bracketResolution`; `tournaments-draw.js` remove essa decisão no reset. | A escolha atual não é uma política canônica aplicada pelo motor. BYE e sobra única não devem ser conectados a ela ainda. |
| Inscrição | `functions/enroll-core.js` ainda testa identidade por `uid`, nome e e-mail; a Function mantém uma detecção adicional de contas suspeitas. | Há fontes de identidade incompatíveis com UID como chave exclusiva. |
| Dados de perfil | Há cópias de nome, e-mail e foto em participantes e pares; `tournament-enrollment-profile-core.js` ainda usa e-mail/nome como fallback de relatório. | A regra de perfil único ainda não está completa; precisa de migração por fronteira, não de nova varredura textual isolada. |
| Elenco | O produto mantém lista embutida, espera embutida, espelho `participants` e, em torneios divididos, `inscritos`. | A duplicação é uma causa raiz de regressões; o cadastro deve ter uma fonte canônica única. |
| Super 8 | Não há implementação fora da documentação de reforma. | É funcionalidade nova e entra depois do núcleo comum de rodadas. |

Essas afirmações são sobre o código inspecionado em 20/09/2026, especialmente
`functions/enroll-core.js`, `functions/index.js`,
`functions/tournament-enrollment-profile-core.js`, `firestore.rules`,
`js/views/phases-engine.js`, `js/views/tournaments-draw.js` e
`js/views/tournaments-draw-prep.js`.

## Modelo de domínio definitivo

### Identidade e perfil

- `uid` é a identidade de qualquer pessoa autenticada: atleta, organizador,
  coorganizador, convidado autenticado e árbitro.
- Nome, foto, e-mail, telefone, data de nascimento, habilidade e demais dados
  pessoais pertencem ao perfil. Torneio, inscrição, time, partida, convite,
  histórico e notificação guardam somente o `uid` necessário para se referir à
  pessoa.
- O aplicativo resolve o perfil ao ler. Alterar o nome de perfil altera a
  apresentação sem reescrever torneios.
- Um participante manual é outro tipo de entidade: `manualParticipantId`,
  limitado ao torneio, com rótulo local e `createdByUid`. Nunca é confundido
  com uma conta, nem recebe e-mail/telefone de perfil como identidade.
- Uma entrada de inscrição autenticada possui chave determinística
  `uid + tournamentId + categoryId`. Essa é a única regra de unicidade para
  impedir a mesma conta de estar duas vezes na mesma categoria.

O bloqueio por conta não resolve duas contas da mesma pessoa. Para isso, a
solução correta é separada:

1. vincular provedores na conta existente, preservando o mesmo `uid`;
2. oferecer fusão de contas somente quando a pessoa comprovar controle de
   ambas, com trilha de auditoria, prévia dos efeitos, possibilidade de
   cancelar antes da confirmação e redirecionamento das referências;
3. usar sinais de duplicidade apenas para revisão humana ou pedido de
   confirmação. Nome, foto, telefone ou semelhança não autorizam fusão
   automática nem exclusão.

Autenticação biométrica do aparelho pode proteger o desbloqueio local de uma
sessão ou credencial. Ela não revela à aplicação uma biometria que identifique
uma pessoa entre aparelhos e não prova que duas contas pertencem à mesma
pessoa. Portanto não entra como mecanismo de deduplicação ou fusão. Coleta de
biometria, imagem documental ou dados especialmente sensíveis fica fora desta
reforma; exigiria especificação própria de consentimento, segurança, retenção,
contestação e base legal.

### Inscrição e equipe

O cadastro deixa de ser um item polimórfico em listas paralelas e passa a ter
entidades explícitas:

```
tournament
  └── phase
       └── registration { registrationId, categoryId, participantRef, status }
            └── team { teamId, memberRegistrationIds, origin }
                 └── roundAssignment / match
```

`participantRef` é `{ kind: 'account', uid }` ou
`{ kind: 'manual', manualParticipantId }`. `origin` de equipe é
`participant_formed`, `organizer_formed` ou `drawn`.

Uma dupla formada permanece uma equipe. Uma dupla sorteada possui
`pairPersistence: 'phase'` (fixa na fase) ou `pairPersistence: 'round'`
(dissolvida no fechamento de cada rodada). Em ambas, a inscrição individual
permanece a mesma; só a atribuição de rodada muda. Assim é impossível criar
uma segunda inscrição ao formar ou desfazer dupla.

Estados de inscrição são fechados: `pending`, `confirmed`, `waitlisted`,
`withdrawn`, `rejected`, `replaced`. O estado e a transição são validados por
Function. Não haverá escrita direta do cliente no elenco, na espera ou no
espelho.

### Categorias e rigor

Uma categoria define dimensões de elegibilidade e seus grupos de exclusão.
Categorias com o mesmo `exclusiveGroup` não podem coexistir para uma mesma
inscrição; categorias em grupos diferentes podem. A regra é aplicada pelo
servidor, com índice de inscrições da pessoa no torneio.

O rigor é regra do torneio, com estes efeitos propostos:

- `casual`: aceita a inscrição sem validação de perfil;
- `moderado`: exige apenas os campos que a categoria declarou indispensáveis
  e deixa a confirmação ao organizador quando houver inconsistência;
- `oficial`: exige campos declarados, evidência configurada e confirmação da
  organização antes de `confirmed`.

Dados de elegibilidade são minimizados: a categoria declara a regra e o
validador retorna apenas apto, pendente ou inelegível e o motivo permitido.
Regras relativas a sexo, identidade de gênero, exames genéticos ou documentos
não serão implementadas ou expostas nesta etapa. Elas exigem política
independente, análise jurídica e de privacidade, critérios de contestação e
autoridade expressa.

### Fases

Todo torneio possui `phases[]`, ordenadas, e cada fase tem exatamente um
`kind`:

- `classification`: produz classificação a partir de rodadas;
- `elimination`: produz avanço pela chave até a colocação final.

Não existem outros tipos de fase. Pontos corridos, grupos, suíço e uma rodada
de preparação são configurações de `classification`; playoff é uma fase
`elimination` posterior. Uma eliminatória direta é uma única fase
`elimination`.

Cada fase terá um `phaseConfig` validado por schema fechado. A forma alvo é:

```
{
  kind: 'classification' | 'elimination',
  entrants: { source: 'enrollments' | 'previous_phase', categoryIds: [] },
  competition: { teamSize: 1 | 2 },
  schedule: { mode: 'manual' | 'automatic', firstAt, intervalDays, rounds },
  lateEnrollment: { mode: 'closed' | 'waitlist' | 'expand_before_play' },
  draw: {
    modality: 'standard' | 'monarch' | 'super8',
    teamFormation: 'none' | 'organizer' | 'participant' | 'random',
    pairPersistence: 'phase' | 'round',
    pairing: 'random' | 'performance' | 'balance',
    antiRepeat: { partners: true, opponents: true, sitOuts: true }
  },
  classification: { structure: 'round_robin' | 'groups' | 'swiss', ... },
  elimination: { seeding: 'performance' | 'balance', bracketPolicy: ... }
}
```

Os campos com `...` serão objetos fechados por modalidade. A interface mostra
apenas opções válidas para a combinação atual; o compilador não corrige
silenciosamente uma opção inválida. Códigos como `liga`, `rei_rainha`,
`formatCode` e campos paralelos sobrevivem somente em um adaptador de entrada
e leitura histórica, com conversão testada para o schema novo.

### Rodadas e sorteios

As operações do sorteio são separadas e registradas em um plano imutável:

1. selecionar inscrições elegíveis;
2. formar equipes, quando necessário;
3. criar grupos ou confrontos;
4. aplicar semeadura, cluster e regras anti-repetição;
5. materializar partidas com identificador global de jogo.

O plano registra a semente aleatória, versão do algoritmo, entradas, escolhas
do organizador e justificativa de cada sobra/folga. O servidor produz e grava
o plano; navegador apenas pede, pré-visualiza e confirma a intenção.

Na classificatória padrão, dupla de rodada implica sorteio de duplas seguido
de sorteio de confrontos em cada rodada. Rei/Rainha forma grupos de quatro
participantes e produz as três combinações de dupla da rodada, com pontuação
individual. Não possui rota nem tipo de fase próprios.

Clusters de habilidade são calculados por uma política versionada. Histórico
de parceiro, adversário e sobra é por `uid`/`teamId`, nunca por rótulo. A
seleção deve primeiro preferir opções ainda não encontradas no cluster ativo;
somente depois pode reutilizar relação. A mesma ordem vale para sobra: quem
não ficou de fora tem prioridade sobre quem já ficou.

### Eliminatórias e política de chave

Antes do primeiro sorteio da fase eliminatória, o organizador confirma uma
política persistida na própria fase:

- `repescagem`;
- `bye`;
- `sobra_unica`.

Não há heurística escondida que troque a política depois de confirmada. O
motor recebe a política, o conjunto de entradas e a semeadura e retorna uma
topologia determinística. Em `sobra_unica`, a elegibilidade à sobra usa o
histórico da fase; com três entradas em semifinal, aplica-se a transição de
repescagem definida na referência, nunca avanço sem jogo.

O número de jogo é alocado por um serviço de sequência do torneio, nunca pelo
índice da rodada ou fase. Portanto não se repete entre classificatória,
eliminatória, terceiro lugar ou repescagem.

### Entrada tardia e resultados já existentes

"Redesenhar como se o número inicial fosse o atual" só é seguro quando a fase
não tem partida iniciada, resultado, presença ou W.O. registrado. Nesse caso,
o plano ainda é descartável e pode ser regenerado integralmente sob a política
já escolhida.

Depois do primeiro fato de jogo, não existe redesenho retroativo automático:
a entrada segue para espera, substituição ou ponto de entrada explicitamente
previsto pela fase. Um reset completo só poderá ocorrer por ação explícita do
organizador, com prévia de perdas e confirmação. Essa regra preserva histórico,
numeração e resultado; ela precisa ser confirmada como decisão de produto.

## Arquitetura de execução

1. **Núcleo puro compartilhado.** Schema, normalização, compilação de fase,
   planejamento de rodadas, política de chave e validação vivem em módulos sem
   Firebase, DOM ou estado global. A Function usa a mesma distribuição exata
   que o cliente.
2. **Function como fronteira de comando.** Inscrever, retirar, formar dupla,
   confirmar configuração, gerar plano, confirmar plano, registrar resultado,
   substituir e fundir contas são comandos autenticados, transacionais e
   auditados.
3. **Firestore como projeção.** O banco guarda entidades normalizadas,
   materialização do plano e leitura otimizada derivada. Projeção não é fonte
   de decisão e pode ser reconstruída.
4. **Interface como adaptador.** Telas antigas leem o adaptador; telas novas
   editam o intent fechado. Nenhum clique muda arrays de participantes ou
   estrutura de chave diretamente.
5. **Eventos de auditoria.** Toda alteração relevante inclui ator por `uid`,
   comando, versão de schema, antes/depois mínimo e correlação. Não inclui
   cópia de dados de perfil.

## Sequência de implementação

### 0. Congelamento e linha de base

- Congelar mudanças funcionais nos caminhos de inscrição, fases, sorteio e
  chave, exceto correção P0 de segurança/indisponibilidade.
- Executar e salvar censo de produção: documentos, formatos, campos, versões
  de aplicativo, participantes sem UID, duplicidades de inscrição por UID e
  topologias materializadas.
- Criar backup verificável antes de qualquer migração.

### 1. Inventário executável e travas de regressão

- Registrar cada leitor/escritor por entidade e campo, com proprietário.
- Substituir buscas manuais por testes de contrato: escritor não autorizado de
  perfil em dados de torneio falha; fallback de identidade fora de adaptador
  legado falha; campo desconhecido no intent falha.
- Rodar Firestore Emulator para provar que clientes não escrevem inscrição ou
  chave diretamente e que comandos respeitam autor/autorização.

### 2. Cadastro canônico e identidade

- Criar a coleção canônica de inscrições com chave determinística e índices
  necessários; manter apenas projeção de leitura compatível enquanto migra.
- Passar todos os comandos ao servidor; eliminar lista embutida como autoridade.
- Resolver perfil por UID e remover cópias de e-mail/foto/nome dos dados vivos
  de conta. Adaptador de histórico fica explicitamente isolado e com prazo de
  remoção guiado pelo censo.
- Implementar vinculação/fusão de conta em entrega própria, depois de testes de
  concorrência, recuperação e auditoria. Nenhum algoritmo de semelhança força
  a fusão.

### 3. Intent de torneio e compilador

- Definir schema versionado, normalizador estrito e erros localizáveis.
- Compilar no servidor uma vez antes da primeira materialização; cliente usa a
  mesma biblioteca apenas para prévia.
- Converter `fmt2` e os valores antigos no adaptador, com matriz de equivalência
  para torneios existentes.

### 4. Planejador unificado de rodadas e chaves

- Extrair o planejamento hoje espalhado em telas e `phases-engine`.
- Fazer `bracketPolicy` uma entrada obrigatória de eliminatória não potência de
  dois; remover decisão automática e o reset que apaga decisão confirmada.
- Implementar BYE e sobra única somente aqui, contra os desenhos da planilha e
  testes por número de equipes.

### 5. Formatos classificatórios e entradas tardias

- Levar pontos corridos, grupos, suíço e Rei/Rainha ao planejador comum.
- Implementar clusters, anti-repetição e justiça de sobras como restrições
  mensuráveis do algoritmo, com motivo de fallback quando a combinação perfeita
  não existir.
- Aplicar a regra de regeneração apenas antes do primeiro fato de jogo.

### 6. Super 8

- Implementar somente após definir matematicamente a modalidade, seus pontos,
  desempates, ausência/W.O., inscritos tardios e ponte para playoff.
- Reusar a mesma representação de equipe, rodada, partida e classificação.

### 7. Retirada do legado

- Medir leitores restantes; bloquear gravação de campos antigos; remover
  adaptadores somente quando nenhum cliente suportado depender deles.
- Executar reconciliação banco/projeções e comparar contagens, membros, jogos e
  resultados antes/depois.

## Critérios de aceite

- Nenhuma conta autenticada consegue duas inscrições ativas na mesma categoria
  do mesmo torneio, inclusive em chamadas concorrentes.
- Nenhum dado pessoal de perfil é escrito em entidade viva de torneio para
  participante autenticado; todas as referências são por UID.
- Dois `uid`s distintos nunca são fundidos ou bloqueados definitivamente por
  foto, nome ou sinal probabilístico.
- O mesmo intent e semente produzem exatamente o mesmo plano no cliente e no
  servidor.
- Tipo de fase, modalidade, política, estado e transição fora da lista fechada
  são recusados, não reinterpretados.
- Para cada N de 2 a 64 (depois 128), cada política de chave mantém todos os
  competidores previstos, IDs estruturais estáveis, jogos globalmente únicos e
  justiça de sobra.
- Uma entrada tardia não altera partida iniciada, resultado, W.O. ou número de
  jogo sem reset explícito e auditado.
- A suíte inclui testes unitários, propriedades, emulador de Rules, concorrência
  de inscrição e ponta a ponta para cada combinação liberada pela interface.

## Decisões pendentes antes de programar

1. **Super 8:** oito duplas em todos-contra-todos significam 28 partidas em
   sete rodadas (quatro partidas por rodada), não sete partidas no total. A
   implementação pressupõe sete rodadas; se a intenção é outra mecânica, a
   regra precisa ser descrita antes de codificar.
2. **Entrada tardia após resultado:** este plano propõe espera/substituição,
   e redesenho total somente antes do primeiro fato de jogo ou após reset
   confirmado. É a única interpretação que não reescreve história; precisa ser
   a regra de produto definitiva.
