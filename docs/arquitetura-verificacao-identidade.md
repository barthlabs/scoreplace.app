# Arquitetura de verificação de identidade e biometria

## Objetivo

Impedir que uma pessoa mantenha mais de uma identidade ativa e se inscreva
mais de uma vez na mesma categoria, inclusive usando credenciais, aparelhos,
nomes ou fotografias diferentes. O identificador operacional de toda pessoa
no Scoreplace continua sendo `uid`. A verificação de identidade decide qual
é o único `canonicalUid` elegível a participar.

O mecanismo tem duas camadas diferentes:

1. **verificação facial remota com prova de vida**, para deduplicar pessoas;
2. **biometria local do aparelho**, para provar presença ao proteger uma chave
   do dispositivo e autorizar ações sensíveis.

Elas não são intercambiáveis. A segunda não produz dado facial nem identifica
a mesma pessoa em dois aparelhos.

## Invariantes

- Uma identidade humana aprovada possui um único `canonicalUid` ativo.
- Um UID provisório não pode ser organizador, integrar equipe, receber vaga,
  confirmar inscrição, lançar resultado ou votar em operação de torneio.
- Uma inscrição confirmada requer `canonicalUid` e usa registro de chave
  determinística `registration/{canonicalUid}__{categoryId}`.
- Nenhum torneio, jogo, fila, convite ou perfil público armazena imagem,
  vetor facial, e-mail ou telefone para decidir
  identidade.
- Uma coincidência facial é um sinal de revisão, nunca uma fusão, exclusão ou
  recusa definitiva automática.
- O serviço não cria uma segunda inscrição enquanto uma possível duplicidade
  está pendente.

## Estados

### Conta

```
new → provisional → identity_pending → verified
                              │             │
                              ├→ duplicate_review ─→ verified_existing
                              ├→ manual_review ────→ verified | rejected
                              └→ abandoned
```

`verified_existing` redireciona para o `canonicalUid`; não cria novo perfil
ativo. `rejected` bloqueia apenas a tentativa de verificação até a revisão de
suporte; não apaga a conta nem seus dados por automação.

### Verificação

```
created → capture_started → provider_pending → approved
                                          │       │
                                          ├→ candidate_match
                                          ├→ retryable_failure
                                          └→ failed_review
```

Estados e transições são uma lista fechada no servidor. A tela apenas exibe o
estado devolvido pela Function; ela não consegue gravar aprovação, UID
canônico ou resultado de prova de vida.

## Dados privados

Coleções propostas, inacessíveis diretamente pelo cliente:

```
identityClaims/{providerSubjectHash}
  canonicalUid
  provider
  policyVersion
  verificationStatus
  verifiedAt
  auditRef

identityVerifications/{verificationId}
  subjectUid
  state
  providerSessionRef
  policyVersion
  candidateClaimRefs[]       // referências opacas; nunca imagem ou vetor
  reviewerDecision
  createdAt / resolvedAt

accountIdentity/{uid}
  state
  canonicalUid               // presente apenas quando o uid não é canônico
  verificationId
  blockedCapabilities[]
```

O `providerSubjectHash` é um identificador opaco retornado pelo provedor,
transformado com chave de servidor. Ele serve para apontar a identidade já
verificada; não é imagem, embedding facial nem substituto de biometria. A
chave de hash fica em gestão de segredos, com rotação planejada.

Não serão armazenados no Firebase selfie, vídeo, vetor
facial, resposta crua do provedor ou qualquer identificador técnico que
permita reconstruir a biometria. Evidência, prazo de retenção e exclusão ficam
no provedor contratado, sob contrato de tratamento e política aprovada.

## Fluxo de cadastro

1. Firebase cria um UID e `accountIdentity/{uid}` em estado `provisional`.
2. O app pede ao servidor `beginIdentityVerification`. O servidor aplica
   rate limit, cria `verificationId` e sessão curta de captura do provedor.
3. O app nativo abre a captura facial com prova de vida. A mídia vai ao
   provedor, não ao Firestore nem a uma coleção do Scoreplace.
4. O provedor chama webhook autenticado do servidor com resultado assinado.
5. Prova de vida, qualidade facial, controles antifraude e ausência de
   candidato facial promovem automaticamente o UID a `verified` e criam a
   claim.
6. Com candidato, a Function marca `duplicate_review`, revoga as capacidades
   de participação do UID provisório e oferece recuperação/vínculo pela
   credencial da conta já existente, sem revelar dados privados dela.
7. A pessoa comprova controle da conta existente ou solicita revisão. Só uma
   decisão auditada faz vínculo de credenciais e deixa um UID canônico.

Se a plataforma quiser garantia universal, nenhuma inscrição — inclusive a de
torneio casual — é `confirmed` antes de `verified`. Permitir inscrição casual
sem essa etapa é uma decisão possível de produto, mas abre uma exceção explícita
à garantia de pessoa única.

### Decisão automática e exceções

O caminho normal é automático. O provedor executa prova de vida, qualidade e
unicidade facial, busca facial um-para-muitos, sinais de fraude de aparelho e
devolve resposta assinada. Se tudo satisfaz os limiares da política, a
aprovação é imediata e sem analista. É o mesmo modelo de identificação facial
usado em controle de acesso, adaptado para captura remota com prova de vida.

Revisão humana é exceção: só entra em candidato facial já existente, risco de
fraude, falha técnica, rota de acessibilidade ou contestação. Um candidato em busca um-para-muitos
mantém a conta pendente; nunca provoca recusa definitiva ou fusão automática.
O sistema mede falso positivo, falso negativo, abandono, tempo de resolução e
discrepâncias por grupo para ajustar limiares e fornecedor.

#### Exceção de gêmeos

Gêmeos idênticos podem produzir candidato facial recíproco mesmo em um sistema
bem calibrado. Eles não são fundidos. O caso abre exceção privada e exige duas
capturas de prova de vida independentes, duas passkeys/dispositivos registrados
e confirmação humana de que há duas pessoas distintas. A exceção permite dois
`canonicalUid` separados e deixa marca de auditoria para que futuras capturas
não voltem a bloquear os dois automaticamente.

Impressões digitais distinguem gêmeos idênticos, mas Face ID, Touch ID e o
leitor biométrico Android não entregam a digital nem seu template ao aplicativo:
apenas confirmam que a autenticação local foi bem-sucedida. Portanto são usadas
para liberar passkeys e ações sensíveis, não para deduplicar a base facial.

## Biometria nativa do aparelho

Será criado um plugin Capacitor próprio, `ScoreplaceBiometry`, em vez de uma
biblioteca JavaScript que tente imitar recurso nativo. Ele expõe apenas
operações sem dado biométrico:

```
availability() -> { available, modality, deviceCredentialFallback }
enrollKey({ keyId, policy }) -> { publicKey, keyAttestation? }
signChallenge({ keyId, nonce, purpose }) -> { signature, counter }
invalidateKey({ keyId })
```

- **iOS:** chave não exportável no Keychain/Secure Enclave, protegida por
  `LocalAuthentication`; mudança no conjunto biométrico invalida a chave.
- **Android:** chave não exportável no Android Keystore, liberada com
  `BiometricPrompt` e operação criptográfica vinculada ao desafio.
- **Web:** não recebe biometria do sistema. Usa reautenticação forte e, em
  etapa posterior, passkey/WebAuthn compatível.

O servidor entrega `nonce` de uso único, curto e vinculado a `uid`, aparelho,
ação e versão do aplicativo. A assinatura só autoriza um comando específico;
nunca vira sessão permanente. Perda, troca ou reset de aparelho exige
reautenticação da conta e novo registro de chave, sem criar novo UID.

Usos obrigatórios da chave biométrica nativa após a implantação:

- iniciar ou confirmar a verificação de identidade;
- vincular ou fundir credenciais;
- alterar e-mail, telefone ou meios de recuperação;
- confirmar inscrição e ações de organizador de alto impacto;
- aprovar recuperação em aparelho novo.

Há fallback acessível por reautenticação forte e revisão. Falta de biometria,
acessibilidade ou aparelho incompatível não pode excluir pessoa legítima.

## Acesso sem senha: passkey como credencial principal

Depois da primeira verificação de identidade aprovada, o Scoreplace cria uma
passkey para o `canonicalUid`. A passkey é a credencial principal de acesso;
senha deixa de ser exigida no fluxo normal.

```
primeiro cadastro
  → prova de vida + deduplicação facial automática
  → canonicalUid
  → criação de passkey

acessos seguintes
  → Face ID / Touch ID / biometria Android ou PIN do aparelho
  → chave privada assina desafio único
  → servidor valida a assinatura e emite sessão do canonicalUid
```

A chave privada fica no autenticador do sistema, e o servidor guarda somente
a chave pública, identificador de credencial e contador de uso. O Scoreplace
não recebe senha, face ou digital. Em iPhone/iPad a passkey usa Authentication
Services e domínio associado; no Android usa Credential Manager; na web usa
WebAuthn. As três superfícies seguem o mesmo protocolo de desafio e resposta.

O Firebase Auth atual continua como emissor de sessão e fonte do UID. Após
validar a assertion WebAuthn/passkey no servidor, a Function emite token
personalizado para o `canonicalUid`; cliente conclui a sessão com
`signInWithCustomToken`. Assim não há segundo UID para cada aparelho nem
credencial nativa que contorne as Rules.

Google e Apple podem continuar como provedores auxiliares de recuperação ou
vínculo, mas nunca criam perfil paralelo: antes de qualquer perfil novo, o
servidor resolve ou exige o `canonicalUid` já existente.

Recuperação sem senha segue ordem forte: outra passkey já registrada, credencial
vinculada comprovada, nova verificação facial com prova de vida; revisão
humana é a exceção final. SMS, e-mail ou código isolado não recuperam sozinho
um UID verificado, pois isso reabriria a porta para conta paralela.

## Controles contra fraude

| Ameaça | Controle |
| --- | --- |
| Foto, vídeo ou máscara para burlar captura | Prova de vida certificada pelo provedor, desafio de sessão curta e detecção de apresentação. |
| Reenvio de resposta de captura | Webhook assinado, idempotência por `verificationId`, nonce e expiração. |
| Sessão roubada | Reautenticação e assinatura por chave protegida por biometria local para operações sensíveis. |
| Pessoa cria outro e-mail/aparelho | Deduplicação facial antes de liberar inscrição; candidato vai para revisão. |
| Falso positivo facial | Nenhuma fusão automática; recuperação da conta existente ou revisão humana. |
| Falso negativo | Nova tentativa orientada; revisão manual; nenhuma regra presume fraude só por falha técnica. |
| Vazamento de biometria | Mídia e template fora do Firestore, minimização de metadados, contrato, retenção curta e revogação/eliminação. |
| Abuso de API | Rate limits por conta/aparelho/IP, detecção de repetição, auditoria e limites de tentativas. |

## Seleção do provedor

O fornecedor só poderá ser escolhido após prova de conceito com dados de teste
consentidos e avaliação documentada dos critérios abaixo:

- prova de vida passiva/ativa e resistência a apresentação;
- busca facial um-para-muitos e retorno de candidato sem expor biometria;
- webhook assinado, idempotência e localização/eliminação de dados;
- métricas de falso positivo/falso negativo no público relevante, com corte
  escolhido para não tomar decisão automática adversa;
- suporte a revisão humana, exportação de auditoria e contestação;
- contrato de tratamento, suboperadores, resposta a incidente e SLA;
- SDK nativo estável para iOS e Android, ou captura web segura compatível com
  Capacitor.

Não haverá compromisso com fornecedor antes desses critérios. O algoritmo não
será implementado nem treinado pelo Scoreplace.

## Comandos do servidor

Todos autenticados e idempotentes:

- `beginIdentityVerification`
- `getIdentityVerificationStatus`
- `registerDeviceKey`
- `authorizeSensitiveAction`
- `recoverCanonicalAccount`
- `requestIdentityReview`
- `reviewIdentityCase` (papel interno segregado)
- `confirmEnrollment`

O webhook do provedor é a única entrada capaz de propor `approved` ou
`candidate_match`; a Function valida assinatura, sessão, expiração e versão da
política antes de alterar estado.

## Testes de aceite

- Duas tentativas concorrentes para a mesma identidade só deixam uma claim e
  um UID verificado.
- UID em `provisional`, `identity_pending` ou `duplicate_review` não confirma
  inscrição, mesmo chamando a API diretamente.
- Coincidência facial não altera UID, perfil, torneio nem credencial sem decisão
  humana ou prova de controle da conta existente.
- Webhook inválido, repetido, expirado ou de outra sessão não muda estado.
- Chave nativa só assina nonce válido para o UID, aparelho e ação corretos;
  replay falha.
- Reset biométrico do aparelho invalida a chave local e exige novo vínculo,
  sem liberar um UID novo.
- Fallback não facial conclui o fluxo por revisão sem degradar autorização.
- Auditoria permite reconstruir cada transição sem conter selfie, vetor facial,
  digital ou contato em claro.

## Sequência de entrega

1. conter fusão automática existente e criar os estados privados de identidade;
2. implantar os comandos e as Rules que bloqueiam inscrição sem UID verificado;
3. construir e testar o plugin nativo de chave biométrica em iOS/Android;
4. integrar um provedor em ambiente isolado com webhook e revisão;
5. realizar teste de precisão, acessibilidade, recuperação e incidente;
6. liberar por coorte, acompanhar falsos positivos/negativos e só então exigir
   verificação para todas as inscrições;
7. migrar contas existentes por convite progressivo, sem bloquear torneio já
   em andamento nem apagar dados automaticamente.

## Migração das contas existentes e corte de acesso

As contas existentes não podem ser tratadas como se já tivessem passado pela
verificação. Elas recebem uma migração explícita, auditável e reversível; a
data de criação, o e-mail, o telefone, a foto ou uma sessão prévia não são
prova de identidade facial.

### Princípio do corte

Após a data de corte, somente um `canonicalUid` com identidade facial aprovada
e pelo menos uma passkey ativa pode obter sessão operacional. A regra vale para
atleta, organizador, coorganizador e árbitro. Uma conta que ainda não concluiu
a migração pode entrar apenas na tela de migração e de suporte; não pode ler ou
alterar conteúdo privado do torneio, inscrever-se, lançar resultado nem exercer
papel de organização.

"Usar a facial para entrar" possui dois controles distintos e ambos são
obrigatórios na arquitetura:

1. a pessoa precisa ter concluído a captura facial remota com prova de vida,
   que estabelece sua identidade única na plataforma;
2. cada sessão posterior é aberta por uma passkey, cuja chave privada é
   liberada pelo sistema do aparelho após autenticação biométrica local.

O Scoreplace não recebe a face nem a digital do aparelho nessa segunda etapa.
Em aparelhos com Face ID, a liberação normalmente é facial; em aparelhos com
Touch ID ou biometria Android, pode ser digital. Onde houver somente PIN de
aparelho ou não houver biometria, a política deve exigir uma rota de recuperação
ou revisão — não permitir uma credencial fraca silenciosa. Uma nova filmagem
facial remota em todo login não substitui passkey, não é fornecida por Face ID e
não deve ser o fluxo ordinário.

### Estados adicionais da migração

```
legacy_uninvited → migration_invited → migration_in_progress → verified
                                  │              │
                                  │              ├→ duplicate_review
                                  │              ├→ manual_review
                                  │              └→ migration_deferred
                                  └→ migration_overdue → restricted
```

- `legacy_uninvited`: conta antiga ainda fora da coorte; conserva o acesso
  anterior durante a preparação controlada.
- `migration_invited`: o servidor já exige a mensagem de migração no próximo
  acesso, mas ainda respeita a janela de carência daquela coorte.
- `migration_in_progress`: captura, análise ou criação de passkey em curso.
- `migration_deferred`: falha temporária ou impossibilidade técnica registrada;
  só recebe extensão curta e auditada, nunca renovação automática indefinida.
- `migration_overdue` e `restricted`: a janela terminou sem verificação;
  sessão limitada exclusivamente à conclusão da migração e suporte.

Esses estados vivem em `accountIdentity/{uid}` e são alterados apenas no
servidor. O token de sessão carrega ou consulta o estado atual; o cliente não
decide que uma conta legada continua apta.

### Execução por coortes

1. **Censo e preparação.** Gerar uma contagem imutável de UIDs ativos, papéis,
   participações futuras, aparelhos/passkeys já registrados e contas que têm
   torneio em andamento. Fazer backup verificável das referências e publicar a
   versão da política antes de convidar alguém.
2. **Piloto interno.** Migrar equipe, organizadores voluntários e uma coorte
   pequena de atletas sem torneio crítico. Medir conclusão, abandono, falhas de
   prova de vida, candidatos duplicados e recuperação antes de expandir.
3. **Convite progressivo.** O servidor marca coortes por risco operacional,
   dando prioridade a quem vai organizar ou participar de evento futuro. O
   aplicativo explica que é uma atualização de identidade e conduz, na mesma
   sessão, captura facial com prova de vida e criação da passkey.
4. **Janela com proteção.** Até o prazo individual, a conta existente conserva
   acesso, mas ações de alto impacto já pedem conclusão antecipada. Nenhum UID
   novo é liberado para inscrição sem verificação desde o início da implantação.
5. **Corte por coorte.** Findo o prazo, aplicar `restricted` no servidor. Não
   apagar perfil, torneio, inscrição ou credencial; concluir a migração restaura
   o mesmo `canonicalUid` e suas referências.
6. **Exigência geral.** Só depois de a coorte atingir critérios de conclusão e
   de não haver incidente aberto de precisão ou acessibilidade, tornar o corte
   global. O calendário concreto é uma decisão de operação aprovada a partir
   das métricas do piloto, não uma constante escondida no aplicativo.

Torneios já em disputa exigem tratamento próprio: o organizador pode migrar
durante a janela, mas uma restrição não pode retirar unilateralmente uma dupla
de uma partida materializada. A Function registra a pendência e permite ao
organizador aplicar a regra de substituição já configurada para aquele torneio,
sem criar um segundo participante ou alterar resultados históricos.

### Recuperação e aparelhos novos

Uma pessoa migrada que perde o aparelho não cria outro cadastro. Ela começa em
`recoverCanonicalAccount`, informa um identificador de conta apenas para
localização e prova controle por outra passkey ou credencial já vinculada. Se
isso não for possível, realiza nova captura facial com prova de vida; candidato,
risco ou inconclusão vão para revisão. Somente após resolver o mesmo
`canonicalUid` o novo aparelho registra uma passkey. O fluxo não oferece a
opção de "criar conta" como atalho de recuperação.

### Critérios de aceite da migração

- Uma conta antiga sem verificação não consegue obter sessão operacional após
  seu corte, mesmo usando credencial antiga válida.
- A conclusão da migração mantém o mesmo `canonicalUid`, inscrições, histórico
  e papéis; não cria nem funde UIDs automaticamente.
- Uma conta em `duplicate_review` não confirma inscrição, mas consegue acessar
  recuperação e contestação sem revelar a identidade do possível candidato.
- Perder ou trocar aparelho exige uma nova passkey no mesmo UID, nunca uma nova
  conta.
- A alteração do prazo de uma coorte é auditada, exige autorização operacional
  e não é feita pelo cliente.
- Testes de regressão cobrem simultaneamente conta legada, conta nova,
  organizador com torneio ativo, gêmeos em exceção e recuperação após perda de
  aparelho.

## Mapa de intervenção no código existente

Esta seção é um mapa de migração, não autorização para alteração direta antes
da entrega 1 estar revisada.

| Área atual | Papel na migração | Mudança necessária |
| --- | --- | --- |
| `functions/index.js` — `autoMergeOnProfileUpdate` | Hoje pode chamar `_executeMerge` após coincidência de telefone/e-mail. | Trocar o efeito por criação idempotente de caso privado de identidade; remover toda chamada automática a `_executeMerge`. |
| `functions/index.js` — `scheduledAutoMergeCleanup` e `_scanAndMergeByField` | Varredura agendada ainda pode materializar fusões. | Desativar fusão; emitir somente métricas/casos pendentes até existir prova de identidade e revisão. |
| `functions/index.js` — `enrollParticipant` | É a autoridade atual da inscrição e já usa transação. | Antes de `computeEnroll`, resolver `canonicalUid`, recusar estados não verificados e nunca aceitar UID do payload diferente do UID autorizado sem comando de organizador específico. |
| `functions/enroll-core.js` | Mantém compatibilidade por `uid`, nome e e-mail. | Reduzir o core novo a chaves de inscrição e membro por UID/ID manual; compatibilidade de nome/e-mail fica em adaptador de leitura, não no predicado de unicidade. |
| `functions/tournament-enrollment-profile-core.js` | Relatório ainda acha entradas por e-mail/nome. | Resolver perfis por UID; participante manual usa `manualParticipantId`; remover fallback como caminho de autorização. |
| `functions-autodraw/index.js` — `requestParticipantMerge` | Localiza vaga manual pelo nome. | Trocar `genericName` por `manualParticipantId`, registrar decisão e não manipular identidade de conta por rótulo. |
| `functions/profile-merge-core.js` e comandos de merge explícito | Contêm partes reaproveitáveis de movimentação auditada. | Preservar somente para fluxo que prova controle dos dois lados ou decisão humana; consolidar em um único comando de fusão. |
| `android/app/src/main/java/app/scoreplace/MainActivity.java` | Já registra `ScoreplaceWatchPlugin`. | Registrar `ScoreplaceBiometryPlugin` no mesmo ponto, com testes instrumentados. |
| `ios/App/App/MainViewController.swift` | Já registra instância nativa do plugin de relógio. | Registrar `ScoreplaceBiometryPlugin` em `capacitorDidLoad`, com acesso ao Keychain/Secure Enclave. |
| `js/views/auth.js` | Centraliza os fluxos nativos de autenticação. | Adicionar adaptador fino para chave biométrica e estados de identidade; nenhuma decisão facial no JavaScript. |
| `firestore.rules` | Hoje protege perfis e torneios, mas não há entidade de identidade proposta. | Negar leitura/escrita direta de claims/verificações; permitir somente projeção mínima do próprio estado, se necessária. |

Os testes existentes de fusão automática não serão simplesmente mantidos. Eles
serão reescritos para provar o inverso: alteração de telefone/e-mail e
varredura diária jamais fundem, tombstonam ou movem referência de UID. A suíte
nova cobre a criação de caso de revisão e a ausência de efeitos em torneio,
perfil e Firebase Auth.
