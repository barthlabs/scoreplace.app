# Publicação dos convites de organização e arbitragem

Para esta mudança, publicar as Functions antes do site. O cliente novo não grava o aviso de coorganização: a Function grava convite e aviso na mesma transação. Publicar o site primeiro abriria uma janela em que convites enviados por ele não gerariam aviso.

1. Depois da suíte completa e da revisão do diff: `scripts/deploy-functions.sh main --only mutateHostOrganization,respondHostInvite,manageTournamentReferee`.
2. Verificar que as três Functions foram publicadas com sucesso.
3. Só então executar `scripts/deploy-hosting.sh` e verificar a versão no ar.

O publicador das Functions grava `.invite-functions-published.json` somente após sucesso dos três alvos. O publicador do site confere esse recibo contra o contrato atual e recusa subir se ele faltar ou estiver defasado. Por isso há dois commits na publicação: o código testado, depois o recibo gerado pelo deploy das Functions; ambos devem estar no HEAD antes do Hosting.

O UID vazio já é recusado por `mutateHostOrganization` com `invalid-argument` antes de montar a referência de notificação. O teste de emulador cobre explicitamente esse caso; `failed-precondition` é reservado a alvo existente que não satisfaz a condição de amizade.

Verificação desta publicação, em 29/10/2026: `node scripts/check-invite-functions-published.js` retornou `✓ Functions de convite publicadas antes do Hosting (862d8738fedf)`. A listagem autenticada do Firebase retornou `ACTIVE us-central1` para `mutateHostOrganization`, `respondHostInvite` e `manageTournamentReferee`. A primeira tentativa de Hosting foi bloqueada pela revisão antes de qualquer upload; os três serviços permaneceram ativos.

Limite do recibo neste corte: ele compara os três blocos de callable e `cohost-core.js`, não toda dependência transitiva. `amizade-authority-core.js`, `split-parts.js` e `vendor/referee-roster.js` não foram alterados nesta leva. Uma alteração futura nesses módulos exigirá ampliar o contrato do recibo antes de usar essa trava para atestar o novo backend.

Convites antigos enviados por clientes em cache podem ter notificações com ID automático, enquanto os novos usam ID determinístico. Durante a transição, os dois avisos podem aparecer para o mesmo convite; o aviso novo é a fonte de `inviteStatus`. Não apagar avisos antigos automaticamente nem alterar documentos de torneios para corrigir essa duplicata visual.
