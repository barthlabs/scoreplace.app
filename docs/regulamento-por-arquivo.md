# Regulamento original por torneio

A organização envia PDF ou JPEG de até5MiB pela página de regras. O aplicativo exibe o original, sem converter cores, fontes ou diagramação. Substituir ou corrigir significa enviar a nova versão; o app não oferece editor gráfico de PDF.

## Persistência

- `tournaments|sandboxes/{id}/regulations/current`: versão ativa, MIME, nome, tamanho, SHA256, instante do servidor e caminho do arquivo no Storage, sem URL pública.
- `tournaments|sandboxes/{id}/regulationRevisions/{requestId}`: recibo imutável da publicação, com autor e hash; acesso somente do servidor.
- `tournamentRegulations/{id}/{revision}.{pdf|jpg}`: arquivo original imutável. Revisões antigas confirmadas são preservadas no servidor. Só a revisão atual é entregue pela callable de leitura.

O documento-pai não recebe binário nem ponteiro duplicado. Saves de clientes antigos e atualizações de jogos não tocam o regulamento. Leitura da referência atual segue a visibilidade do torneio; no sandbox, só o dono lê. O SDK de Storage não lê/escreve/lista esse prefixo; o download passa pela callable autorizada, sem token permanente.

## Escrita

A callable `uploadTournamentRegulation` valida autenticação, organização ativa UID-only (dono do sandbox no caso privado), tipo, assinatura, tamanho e base64. O mesmo requestId com outro autor/hash/nome é recusado. O arquivo é conferido por download antes do commit. A transação relê permissões e expectedRevision, publica a referência e cria o recibo juntos. Retry retorna o estado atual sem reinstalar revisão já suplantada.

O cliente só anuncia sucesso após recibo, mantém o documento anterior em falha e repete uma vez a mesma requisição em falha de transporte. Respostas atrasadas não redirecionam quem já saiu da página.

Um crash abrupto entre upload e commit pode deixar objeto sem referência. Esse limite é aceito neste escopo: objetos têm metadata de torneio/requestId/instante/hash para conciliação futura. A limpeza de falhas tratáveis remove somente o objeto novo sem recibo confirmado; revisões históricas não são tratadas como lixo.

## Leitura do original

A callable `getTournamentRegulationFile` reutiliza a política canônica de leitura do pai e exige o dono no sandbox. Confere a revisão atual, baixa e verifica hash/tamanho, relê autorização e referência depois do download, e só então devolve base64 do original. Torneio privado sem permissão e inexistente retornam a mesma resposta. As respostas levam Cache-Control no-store e o service worker não intercepta POST.

O navegador cria um Blob do MIME permitido e confere tamanho e SHA256 quando WebCrypto existe; sem WebCrypto, confia na conferência do servidor. O Blob é exibido e pode ser baixado com nome original. ObjectURLs locais são revogados ao mudar de visualização. Não há links permanentes do Storage, nem para sandbox. Revogar acesso ou apagar o torneio impede novas leituras; cópias já baixadas pelo usuário são arquivos locais e não podem ser revogadas retroativamente.

## Publicação e operação administrativa

Ordem: Functions nominais de upload/leitura → Firestore Rules → Storage Rules → Hosting. Não há mudança no motor de sorteio nem nos manifestos/regiões de autodraw. O script administrativo do CULT é limitado ao torneio autorizado, exige prévia e backup privados, usa ator administrativo explícito e confere o PDF público após vincular. Em falha posterior só restaura a referência anterior se a revisão atual ainda for a sua.
