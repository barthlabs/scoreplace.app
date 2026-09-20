# Reforma canônica do Scoreplace

## Objetivo e limite

Esta reforma corrige o modelo e as fronteiras do sistema sem reescrever recursos que já funcionam. O resultado esperado é uma plataforma configurável: o organizador escolhe regras de negócio válidas; o sistema compila uma configuração única, reproduzível e testável; cliente e servidor aplicam a mesma regra.

Torneios já sorteados não são migrados estruturalmente. A configuração e a topologia de uma fase materializada são históricas. Toda alteração de schema ou de contrato deve preservar a leitura desses documentos e ser aplicada apenas a torneios novos ou ainda não sorteados, salvo migração aprovada e reversível.

## Estado confirmado em 20/09/2026

- `fmt2` é o intent canônico dos torneios novos. `FORMAT2.compileToPhases()` deriva `t.phases` e os campos de compatibilidade; a Function recompila o intent antes do primeiro sorteio.
- O compilador cliente e a cópia usada pela Function são byte a byte idênticos. `functions-autodraw/test-format2.js` passou com 58 verificações.
- A tela já representa Rei/Rainha como uma configuração de sorteio, e não como uma tela independente. Porém, o schema ainda mistura os conceitos: a classificatória usa `formatCode: 'liga'` e o valor interno `format: 'Liga'`.
- O motor de chaves (`chaves.js`) é determinístico e tem uma cobertura extensa. Ele implementa a política atual de repescagem/folga e normaliza a segunda rodada para uma potência de 2.
- O pré-sorteio calcula BYE versus repescagem automaticamente pelo menor número de intervenções. Isso diverge do requisito: a política deve ser escolhida pelo organizador antes do sorteio.
- Super 8, BYE configurável e sobra única não estão implementados como formatos configuráveis do novo modelo.

## Contrato de domínio alvo

### Torneio e fases

Um torneio possui uma ou mais fases, em ordem. Cada fase possui exatamente um tipo:

- `classificatoria`: produz uma classificação a partir de uma ou mais rodadas.
- `eliminatoria`: elimina equipes até a definição da colocação final.

Os rótulos exibidos podem continuar livres para o organizador. Eles não substituem o tipo da fase. Uma eliminatória direta é simplesmente um torneio cuja primeira e única fase é eliminatória. Uma classificatória seguida de playoff é um torneio com duas fases.

`phases[]` continua sendo a projeção materializada para o motor atual durante a transição. A nova representação deve ser compilada no servidor, uma única vez, antes de existir chave, grupos ou rodadas. Não haverá duas fontes de verdade editáveis.

### Sorteio

O sorteio é uma regra de uma fase, não um tipo de torneio nem uma rota paralela. Ele possui operações independentes, aplicadas na ordem adequada à fase:

- formação de equipe: participantes individuais podem ser sorteados em duplas; duplas já formadas não passam por este sorteio;
- persistência da dupla classificatória: uma dupla sorteada pode permanecer fixa durante toda a fase ou ser desfeita ao fim de cada rodada; neste último caso, a rodada seguinte sorteia novas duplas a partir dos participantes ativos e, em seguida, sorteia os novos confrontos;
- formação de confrontos: depois de existirem equipes, o sistema pode sortear quais duplas se enfrentam; numa eliminatória, os confrontos posteriores são definidos pela chave;
- modalidade da rodada: o sorteio padrão de duplas e confrontos pode ser substituído por Rei/Rainha ou Super 8 quando a fase o permitir;
- critério de pareamento/semeadura: desempenho, equilíbrio ou sorteio;
- repetição: rodada única, número fixo de rodadas ou todos contra todos;
- política de espera e novas entradas, por fase.

Assim, Rei/Rainha e Super 8 são modalidades adicionais, não alternativas à simples formação de duplas ou ao sorteio de confrontos. Na classificatória padrão com dupla não persistente, há dois sorteios sucessivos em toda rodada: primeiro as duplas, depois os confrontos. Rei/Rainha sorteia grupos de quatro participantes, produz três jogos por grupo e pontua individualmente. Quando abrir uma eliminatória, a rodada de formação é uma fase classificatória de uma rodada, seguida da fase eliminatória; não é uma exceção fora do modelo de fases.

Super 8 é uma modalidade classificatória para oito duplas. Essas duplas podem ter sido formadas previamente pelo organizador ou por sorteio. O Super 8 gera o todos-contra-todos de sete rodadas e produz a classificação pela mesma interface de standings. Não será adicionado antes de o contrato comum de formação de dupla e de confrontos estar extraído e coberto por testes.

### Política da chave eliminatória

Para uma eliminatória simples, a política de resolução de entradas fora de potência de dois deve ser uma decisão explícita e persistida antes do primeiro sorteio:

- `repescagem`: todas as equipes jogam a primeira rodada e a próxima é completada com repescadas;
- `bye`: rodada preliminar e folgas para completar uma chave cheia;
- `sobra_unica`: cada rodada reduz o campo pela metade; se o número for ímpar, trata somente uma sobra naquela rodada.

Em `sobra_unica`, a sobra não pode ser atribuída duas vezes à mesma equipe enquanto houver outra elegível. Em semifinal com três entradas, a sobra deve disputar repescagem; não pode receber folga. A política precisa ser carregada pela chave e não inferida novamente de uma heurística depois que o sorteio começar.

A atual dupla eliminatória e suas regras de chave inferior ficam preservadas nesta etapa. A palavra "repescagem" é usada hoje em mais de uma mecânica; a reforma só unificará nomes depois de documentar, por teste, quais transições de cada uma delas já existem.

## Identidade, perfil e inscrição

Toda referência a uma pessoa autenticada deve usar `uid`. Nome de exibição, e-mail, telefone e imagem são dados de perfil e devem ser resolvidos no ponto de leitura, não copiados para inscrições, jogos, convites, participantes ou relações de organizador. A exceção são participantes inseridos manualmente pelo organizador: não têm `uid`, pertencem ao torneio e carregam apenas os dados necessários àquele torneio.

O bloqueio de múltiplas inscrições não pode se apoiar em nome ou foto. A regra segura mínima é a unicidade por `uid + torneio + categoria`, reforçada no servidor e nas regras de escrita. Fusão de contas é um fluxo distinto: precisa provar controle das duas contas e preservar um trilho de auditoria. Não será executada por comparação de fotos ou por biometria de aparelho.

Face ID, Touch ID e BiometricPrompt confirmam presença no dispositivo e não fornecem à aplicação uma identidade biométrica reutilizável entre aparelhos. Podem ser uma camada local para desbloquear uma credencial, mas não resolvem duplicidade de pessoas. Coletar biometria facial ou documentos exige decisão de produto, base legal, retenção, revisão de privacidade e operação de contestação; fica fora desta reforma até haver uma especificação própria.

## Sequência de execução

1. **Inventário verificável.** Criar censos de leitores, escritores e dados persistidos para identidade, inscrições, fases, sorteios e chaves. Cada campo fora do contrato recebe um destino: preservar como histórico, migrar antes de sortear ou remover com backup aprovado.
2. **Contrato e compilador.** Extrair o schema de fase e sorteio para um núcleo puro compartilhado por cliente e Function. Adicionar normalização fechada, validação de valores desconhecidos e testes de compilação cliente-servidor. Os códigos antigos serão adaptados na borda, não renomeados por busca e troca.
3. **Chave por política.** Separar a topologia determinística da escolha de `repescagem`, `bye` ou `sobra_unica`. A UI seleciona a política; a Function valida e persiste a decisão junto ao sorteio; o motor a aplica sem heurística implícita.
4. **Migração de interface.** Trocar a configuração atual para os conceitos do contrato, mantendo os valores internos antigos somente no adaptador de compatibilidade. O formulário não deve oferecer combinações que o compilador normalizaria silenciosamente para outra coisa.
5. **Novos formatos.** Implementar Super 8 após a etapa 2 e depois de uma matriz completa de resultados, desempates, ausências, inscrições tardias e integração com playoff.
6. **Identidade e inscrição.** Aplicar o censo de UID, mover leitores e escritores para o contrato único e bloquear duplicidade no servidor. Qualquer merge de contas entra em uma entrega separada, com plano de recuperação e auditoria.
7. **Limpeza final.** Remover adaptadores somente quando o censo de produção e as versões mínimas de cliente demonstrarem que não há leitores deles. Dados de produção não são apagados por esta reforma sem backup novo e aprovação específica.

## Gates de aceitação

- O mesmo intent gera a mesma projeção no cliente e no servidor.
- Um valor fora da lista fechada de tipo de fase, sorteio ou política de chave é rejeitado, não reinterpretado.
- Para cada N de 2 a 64, cada política de chave preserva IDs estruturais, número único de jogo e a regra de não alterar confrontos anteriores com entrada tardia.
- A matriz cobre ao menos BYE, repescagem e sobra única, incluindo N ímpar, semifinal com três entradas e alternância justa de sobras.
- Rei/Rainha, pontos corridos, grupos, eliminatória direta e classificatória seguida de eliminatória continuam cobertos em cliente e Function.
- Escritas de inscrição duplicada pelo mesmo `uid` na mesma categoria falham no servidor, mesmo com clientes concorrentes.
- Não há alteração destrutiva de dados sem inventário, backup e confirmação explícita.

## Primeira entrega técnica

A primeira alteração de código desta reforma será o núcleo de política de chave, isolado de `chaves.js`, com testes de contrato contra a planilha de referência. Ela não muda o desenho atual até que a escolha explícita esteja ligada na interface e validada na Function. Isso permite introduzir BYE e sobra única sem pôr em risco a repescagem existente.
