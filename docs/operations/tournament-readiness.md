# Prontidão de torneio

O Scoreplace verifica as seis operações em cada uma das cinco regiões a cada cinco minutos no GitHub Actions. O checker usa somente `OPTIONS` e uma chamada sem login que deve receber `UNAUTHENTICATED`; ele não escreve em torneios. Execute também manualmente antes e depois de publicar:

```sh
node scripts/check-live-operation-readiness.js
```

O código de saída 0 indica pelo menos duas regiões completas e nenhuma região totalmente fora. Uma porta isolada degradada gera aviso; 1 indica redundância insuficiente; 2 indica que o checker nem conseguiu carregar o manifesto ou executá-lo. O teste repete falhas transitórias uma vez e admite 12 segundos por tentativa, inclusive para partida fria. GitHub Actions agendado é de melhor esforço: pode atrasar e ser desativado depois de 60 dias sem atividade no repositório. Não substitui o desvio automático do app no momento da operação.

Antes de um torneio, faça também um ensaio **autenticado** em um torneio fictício isolado na mesma produção, com contas de teste para organização e arbitragem: marcar presença, chamar para quadra, encerrar sem placar e lançar placar. Confira o recibo no banco e a atualização em outro navegador. Repita no sandbox. O sandbox usa o mesmo código de operação, mas dados e permissões próprios; sozinho não prova que a publicação e as identidades de produção estão prontas. Nunca use o torneio real para ensaio. Congele novas publicações durante a janela do evento, exceto correção de incidente com verificação direcionada.
