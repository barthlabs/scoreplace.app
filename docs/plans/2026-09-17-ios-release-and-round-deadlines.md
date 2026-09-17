# Correção iOS, prazos de rodada e descoberta

1. Atualizar a versão e o número de build iOS para empacotar o bundle web 2.3.71 corrigido.
2. Sincronizar os ativos Capacitor e validar que o iOS contém a mesma versão e o mesmo código do site.
3. Corrigir a resolução do prazo de cada partida para usar a rodada, inclusive confrontos futuros ainda sem participantes.
4. Investigar e corrigir o carregamento vazio de Explorar sem reintroduzir overlay bloqueante.
5. Rodar testes relevantes, criar o archive e enviar a build ao TestFlight. A submissão à App Store só ocorre depois do OK explícito do dono; a Apple então publica automaticamente ao aprovar.
6. Para Android, gerar e enviar primeiro à faixa fechada; a promoção pública também depende do OK explícito do dono.
