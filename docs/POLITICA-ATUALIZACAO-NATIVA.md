# Política de atualização mínima — aprovada em 11/set/2026

O dono aprovou nesta conversa: mínimo independente para iOS e Android; somente após a versão estar disponível na respectiva loja e validada em aparelho; aviso de sete dias; adoção entre usuários ativos acompanhada, com atenção aos organizadores de torneios em andamento. Quem atualiza recebe imediatamente as novidades do pacote. O prazo não segura funcionalidades de quem já atualizou.

## Estado

O cliente está preparado no source. `native-update-policy.json` permanece com mínimos e datas nulos: ninguém foi bloqueado e o prazo ainda não começou. Os bundles locais encontrados nesta execução são 2.2.8; isso não mede a versão disponível ou instalada nas lojas. O branch nativo exige sua fiação própria de login e os scripts de release existentes — não gerar binários a partir do main sem esse fluxo.

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
