# Política de atualização mínima — aprovada em 11/set/2026

O dono aprovou nesta conversa: mínimo independente para iOS e Android; somente após a versão estar disponível na respectiva loja e validada em aparelho; aviso de sete dias; adoção entre usuários ativos acompanhada, com atenção aos organizadores de torneios em andamento. Quem atualiza recebe imediatamente as novidades do pacote. O prazo não segura funcionalidades de quem já atualizou.

## Estado

Em 17/set/2026, o dono confirmou em aparelho iOS e Android a versão pública
**2.3.27**. O manifesto ativa esse mínimo com o instante conservador da
confirmação (`2026-09-17T21:44:55Z`) e aviso até
`2026-09-24T21:44:55Z`. Esse horário não afirma quando cada loja publicou a
build; registra quando ambas foram efetivamente observadas e validadas, para
que o prazo não seja menor que sete dias.

O mínimo não encerra o corte: ainda é preciso medir adoção real por plataforma
e cobrir os organizadores ativos antes de publicar Rules restritivas. Os
bundles locais não medem a versão disponível ou instalada nas lojas. O branch
nativo exige sua fiação própria de login e os scripts de release existentes —
não gerar binários a partir do main antes de concluir a auditoria atual.

## Distribuição de builds

- **iOS:** toda build vai primeiro para o **TestFlight**. Depois da validação e do
  OK explícito do dono, ela é submetida à revisão. A submissão configura
  `AFTER_APPROVAL`, portanto a Apple publica automaticamente quando aprovar.
- **Android:** toda build vai primeiro para a **faixa fechada**. A promoção da
  mesma release para Produção só acontece depois do OK explícito do dono.

Nenhum script, pipeline ou ação manual pode pular essas etapas.

## Ativação por plataforma

1. Incorporar o source atual no fluxo nativo, mantendo login, deep links e relógios. Arquivar com `scripts/ios-archive.sh` ou `scripts/android-release.sh`; os gates de build existentes continuam obrigatórios.
2. Validar em aparelho: login, criação/edição, inscrição, placar, nova tentativa offline, convite/amizade, aviso, link da loja e bloqueio somente depois de sair de uma ação em andamento.
3. Confirmar que a versão está disponível na loja do público atendido. Preencher `minimumVersion`, `availableAt` e `deviceValidatedAt` reais na plataforma correspondente do manifest. `enforceAt` deve ser pelo menos sete dias depois da mais recente das duas datas. Todos os instantes são UTC. O validador recusa um prazo menor.
4. Publicar pelo `scripts/deploy-hosting.sh`. Não preencher a outra plataforma por suposição. Não mover o mínimo a cada release web: ele representa a versão nativa necessária para compatibilidade/segurança.
5. Acompanhar adoção de usuários ativos por plataforma e versão; registrar cobertura dos organizadores com torneios em andamento. A medição ainda precisa ser conectada a uma fonte real; nenhum percentual foi inventado nesta entrega. Identificar operações pendentes antes do corte.
6. Após o aviso e a confirmação de prontidão, executar o runbook específico do cutover e fechar as permissões antigas no servidor. A tela de atualização não é fronteira de segurança; versões antigas sem o novo cliente não ganham esse controle retroativamente.

## Comportamento

Web/PWA não consultam essa política. No nativo, o cliente consulta o manifest público na abertura/retomada e no máximo uma vez por minuto quando visível. A última política válida fica em cache; falha de rede ou manifest inválido não inventa nova exigência. Política válida com mínimos nulos desativa o controle. O usuário abaixo do mínimo recebe aviso dispensável durante o prazo e diálogo obrigatório depois, ao chegar a um momento seguro. Placar, formulário e digitação são protegidos pela guarda existente de atualização.

O cliente não apaga caches, sessão ou dados para forçar atualização. O botão usa o catálogo de lojas do app. Mudanças de autorização continuam nos respectivos runbooks e dependem de evidência operacional, não só desta configuração.

A revisão Claude foi reativada pelo dono durante esta execução, com motores econômicos e teto por chamada. Esta entrega não declara aprovação das lojas nem cutover executado.
