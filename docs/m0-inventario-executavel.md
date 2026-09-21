# M0 — inventário executável da reforma

Data da linha de base: 21/09/2026. Este documento descreve o que foi
observado no checkout local. Não autoriza migração, exclusão de dados ou
mudança de comportamento de torneio.

## Resultado da busca de acesso por link

O login por link não possui API ativa no cliente, Functions ou Rules. O
tratamento legado de `?ml=` foi removido de `js/views/auth.js` nesta linha de
base, junto com a tela que apenas recusava esse parâmetro. O teste
`tests/acesso-sem-senha-removido.test.js` agora proíbe o retorno da rota e das
APIs antigas.

Há links de e-mail que não são login e não devem ser classificados como tal:

| Rota | Operação | Situação e gate |
| --- | --- | --- |
| `?vt=` | Encaminha confirmação de e-mail Firebase depois de consultar um token temporário. | Não cria sessão. Manter sob teste de expiração e leitura mínima. |
| `?verify_email=` | Confirma e-mail secundário pela Function `confirmSecondaryEmail`. | O cliente não grava vínculo diretamente. |
| `?pr=` | Redefinição de senha. | É recuperação de credencial, não login; preservar apenas com expiração e consumo único. |
| `?mh=` | Confirma uma fusão de contas iniciada por conta autenticada. | É operação destrutiva e não pode ser tratada como mero link de e-mail. M1 deve decidir se exige sessão da conta solicitante, confirmação em duas etapas e período de espera. |
| `?desfazer=` | Inicia pedido de reversão de fusão. | A Function exige sessão do UID sobrevivente e prazo de reversão. |

Referências em `docs/`, `CLAUDE.md` e `firestore.rules.etapaA` são histórico ou
arquivo de auditoria, não código carregado pelo produto. Elas não devem ser
usadas como prova de fluxo ativo. A retirada desses registros históricos exige
uma decisão documental separada, para não apagar evidência de incidentes.

## Entidades de inscrição e fontes concorrentes

| Área | Observada hoje | Risco de reforma | Destino de M1 |
| --- | --- | --- | --- |
| Inscrição | `functions/enroll-core.js` deduplica UID e `manualParticipantId`. | Elenco ainda aparece em documento, subcoleção e projeções. | Registro canônico por torneio, categoria e participante; listas tornam-se leitura derivada. |
| Participante autenticado | UID é encontrado em `uid`, `p1Uid`, `p2Uid` e `participants[].uid`. | Formas legadas impedem uma única chave estrutural. | `participantRef.kind='account'` com `uid` obrigatório. |
| Participante manual | `manualParticipantId` já distingue a vaga local. | Rótulos ainda existem nos adaptadores de leitura. | `participantRef.kind='manual'`; nome local não resolve conta. |
| Perfil | `users/{uid}` ainda tem gravações gradualmente transferidas para Functions. | Há cópias de apresentação em dados de competição. | Perfil é a única fonte de nome, foto e contato; competição usa UID. |
| Fases | `liga`, formatos e Rei/Rainha ainda surgem em adaptadores e testes. | Conceitos de fase e sorteio continuam sobrepostos. | Apenas `classification` e `elimination`; Rei/Rainha e Super 8 são modalidades de sorteio. |

## Escritores e leitores que exigem fronteira

1. `functions/enroll-core.js` e `functions/index.js` são a fronteira atual da
   inscrição. Toda evolução deve permanecer em Function autenticada,
   autorizada, validada e transacional.
2. `js/views/tournaments-enrollment.js` e `js/firebase-db.js` são leitores e
   adaptadores de chamada. Não podem ganhar fallback de escrita de elenco.
3. `firestore.rules` já nega inscrição direta em cenários cobertos pelo
   emulador. Toda nova operação precisa de negativa equivalente e teste de
   Rules.
4. `requestEmailMerge`, `confirmEmailMerge` e o motor de fusão ainda podem
   alterar identidade e referências. Eles ficam fora de qualquer migração de
   inscrição até que M1 aprove seu contrato de prova, confirmação e auditoria.

## Auditoria da prévia canônica de M1

`previewCanonicalRegistrationMigration` é uma Function callable de leitura.
Ela exige `request.auth.uid`, exige `tournamentId`, lê a raiz e a parte
`participants` dentro de transação e autoriza contra o torneio hidratado. O
relatório vem do núcleo puro `registration-core.js` e contém candidatos,
conflitos, entradas sem suporte e fingerprint SHA-256. O fingerprint não
inclui nome, foto, e-mail ou telefone.

Limites confirmados:

- a prévia não cria `registrations`, nem atualiza lista, espera, partida ou
  projeção;
- entrada composta, sem UID/`manualParticipantId`, ou que possua as duas
  identidades, entra como exceção e bloqueia ativação por inferência;
- categoria ausente vira somente a sentinela de migração
  `__uncategorized__`; ela não é uma categoria escolhida pelo sistema;
- a prévia não é ativação. Só um censo aprovado de torneio inativo e um comando
  posterior com fingerprint correspondente poderão escrever a estrutura nova.

Os testes `functions/test-registration-core.js`,
`tests/registro-canonico-dry-run-cf.test.js` e
`functions/test-enroll-core.js` passaram nesta linha de base. Eles cobrem,
respectivamente, identidade/categoria/fingerprint, fronteira somente leitura
da Function e comportamento legado de inscrição. Não constituem ainda prova
de migração nem de esquema novo em produção.

## Travas já executadas nesta linha de base

- `node tests/acesso-sem-senha-removido.test.js`
- `node scripts/check-cache-busters.js`
- `npm run test:rules`, com `.rules-testadas` carimbado para o SHA das Rules
  atuais
- `npm test`: 879 suítes unitárias aprovadas em 235 segundos

## Próximo corte antes de mudar o domínio

M1 começa com um censo de registros candidatos de inscrição e exceções, sem
escrever dados. A prévia já existente deve ser executada somente sobre torneio
inativo autorizado. Antes disso, definir o contrato de fusão de contas: qual
prova comprova controle dos dois lados, quem aprova exceções e como a operação
fica pendente, auditável e reversível. Nenhum sinal de nome, foto, telefone ou
semelhança pode executar fusão ou bloquear definitivamente uma pessoa.
