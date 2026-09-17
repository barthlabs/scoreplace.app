# CI nativo iOS

O workflow [`.github/workflows/ios-native.yml`](../.github/workflows/ios-native.yml)
compila o Scoreplace em um runner macOS hospedado pelo GitHub. Ele fixa o
`DEVELOPER_DIR` em Xcode 26.6 porque essa versão ainda aceita watchOS 8 e
`armv7k`, necessários ao Apple Watch Series 3.

## Fluxos

- **Push e pull request:** instala dependências, monta os assets do Capacitor e
  compila iPhone e Watch sem assinatura. Não acessa a conta Apple nem envia
  binários.
- **Disparo manual, sem upload:** gera um archive assinado e o anexa ao job por
  sete dias para diagnóstico.
- **Disparo manual com `upload_testflight=true`:** gera o mesmo archive, valida
  que `ScoreplaceWatch.app` está dentro dele e o envia ao TestFlight.

O envio ao TestFlight não submete o app à revisão da App Store. A validação em
um iPhone continua obrigatória antes da submissão à loja.

## Submissão e lançamento após aprovação

Depois que a build for validada no TestFlight **e o dono der o OK explícito**,
a submissão deve ser feita pelo script, nunca pela opção manual da interface do
App Store Connect:

```sh
node scripts/asc.js checar-auto
node scripts/asc.js submeter <versão> --apply
```

`submeter` cria ou corrige a versão para `AFTER_APPROVAL` antes de enviá-la à
revisão. `checar-auto` falha quando houver uma versão ainda pendente em
lançamento manual; nesse caso, corrija-a com `node scripts/asc.js auto --apply`
e rode a checagem de novo. Assim, a aprovação da Apple publica a versão sem
depender de alguém voltar à interface para liberá-la. O automatismo começa
somente depois do OK do dono para sair do TestFlight; ele nunca pula essa etapa.

## Segredos do repositório

Criar em **GitHub → Settings → Secrets and variables → Actions**. Nunca colocar
qualquer um deles em arquivo, commit, log ou comentário.

| Segredo | Conteúdo |
| --- | --- |
| `ASC_KEY_ID` | Key ID da API do App Store Connect. |
| `ASC_ISSUER_ID` | Issuer ID da mesma API. |
| `ASC_PRIVATE_KEY_BASE64` | Conteúdo do arquivo `AuthKey_<KEY_ID>.p8`, codificado em Base64. |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Certificado Apple Distribution exportado em `.p12`, codificado em Base64. |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | Senha usada na exportação do `.p12`. |
| `IOS_APP_PROVISIONING_PROFILE_BASE64` | Perfil App Store do bundle `app.scoreplace`, em Base64. |
| `IOS_WATCH_PROVISIONING_PROFILE_BASE64` | Perfil App Store do bundle `app.scoreplace.watchapp`, em Base64. |

Para gerar Base64 localmente sem expor o valor na tela, use redirecionamento
direto para a área de transferência ou para o formulário de segredo. O
certificado precisa continuar válido; ao renová-lo na Apple, atualize os dois
segredos relacionados ao `.p12`.

## Primeiro uso

1. Configurar os cinco segredos.
2. Em **Actions**, abrir **iOS nativo — validação e TestFlight** e executar com
   `upload_testflight=false`. Conferir o archive e o log do companion Watch.
3. Executar novamente com `upload_testflight=true` quando a build estiver
   autorizada para TestFlight.
4. Instalar a build no iPhone, validar login e os fluxos críticos, e só então
   preparar a submissão à App Store.

Após a primeira execução bem-sucedida, o Xcode local deixa de ser requisito para
gerar builds. Ainda pode ser útil para depuração visual em aparelho.
