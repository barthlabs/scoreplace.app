# Publicação: principal, site, contingência

A entrega segue esta ordem:

1. Se o backend mudou, publicar os exports afetados no servidor principal com `scripts/deploy-functions.sh main|autodraw --only nome[,nome]`. Rules continuam com seu publicador próprio. O Hosting não publica Functions nem aceita recibos de backend atrasado.
2. Executar `scripts/deploy-hosting.sh`. Ele valida a matriz regional completa localmente e verifica seis portas de uma região disponível: revisão com tráfego, imagem, digest, CORS e rejeição de requisição sem autenticação. Uma mudança somente web não republica servidores.
3. Após os testes e o alinhamento do Git, publicar o site e confirmar a versão no ar.
4. Conferir a contingência regional completa. Atualizações de servidores de backup pertencem aos publicadores nominais existentes; não devem preceder a entrega do principal e do site quando o contrato permite publicação gradual.

A ordem de entrega não autoriza um cliente incompatível com servidores antigos. O gate de fontes/configurações continua fechado para contratos operacionais divergentes. Este fluxo não inventa recibos de imagem nem dispensa um corte de compatibilidade quando necessário.

## Falha depois da publicação do site

Uma falha na contingência retorna erro com estado `published-backups-pending`: o site já está publicado. O bundle do Git continua sendo tentado. Para repetir apenas a conferência da contingência:

```sh
scripts/deploy-hosting.sh --resume-backups
```

A retomada exige o mesmo HEAD, versão, main remoto, cinco insumos regionais e identidade do artefato servido. Não prepara outra versão, não faz outro push e não repete Hosting. Se o main avançar, qualquer entrada divergir ou o recibo tiver desaparecido, ela recusa; um novo corte exige seu ciclo normal de publicação.

Os recibos ficam fora do repositório, em `${TMPDIR:-/tmp}/scoreplace-deploy/rollouts/<SHA>.json`, com permissão 0600. O arquivo público `/release.json` contém somente SHA e versão, é gerado na cópia congelada e usa `Cache-Control: no-store`. O service worker não o cacheia.

`--dry-run` preserva a saída anterior ao push e não registra entrega. Os 34 callables obrigatórios, os 28 arquivos vendor e os portões de teste permanecem exigidos.
