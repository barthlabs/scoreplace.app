# Deep linking — Universal Links (iOS) + App Links (Android)

Objetivo: um link de convite `https://scoreplace.app/#tournaments/ID` tocado no
WhatsApp abre **o app instalado** direto na tela do torneio; sem app instalado,
abre a versão web (fallback natural — nada muda).

## Como funciona

As rotas do app são **por hash** (`/#tournaments/ID`). Universal Links / App Links
casam pelo **path** (que é sempre `/`), então **toda** URL `scoreplace.app` abre o
app quando instalado; o fragmento carrega a rota. Isso é backward-compatible com
todos os links já compartilhados (e-mails, QR impressos) — nenhum link antigo quebra.

Fluxo: SO recebe o link → verifica os arquivos `.well-known` → abre o app →
plugin `@capacitor/app` dispara `appUrlOpen` / `getLaunchUrl()` →
`js/deep-link.js` aplica o fragmento em `window.location` → o router navega.

## Peças (todas versionadas no repo)

| Peça | Arquivo |
|------|---------|
| Ponte JS (aplica a rota) | `js/deep-link.js` (inerte na web; roda só no app nativo) |
| Plugin | `@capacitor/app` (`package.json`) — registrado por `npx cap sync` |
| iOS entitlement | `ios/App/App/App.entitlements` → `applinks:scoreplace.app` |
| iOS verificação | `.well-known/apple-app-site-association` (Team ID `6724SP9XN7`) |
| Android intent-filter | `android/app/src/main/AndroidManifest.xml` (`autoVerify="true"`) |
| Android verificação | `.well-known/assetlinks.json` (package `app.scoreplace`) |

Os `.well-known/*` são servidos pelo GitHub Pages a partir da **raiz** do repo
(o `.nojekyll` garante que a pasta com ponto seja servida). Precisam estar
publicados em produção **antes** de os apps das lojas verificarem os links.

## ⚠️ AÇÃO MANUAL OBRIGATÓRIA — SHA-256 do Play App Signing

O `assetlinks.json` hoje contém só o fingerprint da **chave de upload**. Como o
app usa **Play App Signing**, o APK que o usuário baixa é reassinado pelo Google
com a **chave de assinatura do app** (SHA-256 diferente). Sem esse fingerprint,
o App Links **não verifica** em installs vindos da Play Store.

1. Play Console → app scoreplace → **Test and release → App integrity → App signing**.
2. Copie o **SHA-256 certificate fingerprint** da "App signing key certificate".
3. Adicione-o ao array `sha256_cert_fingerprints` em `.well-known/assetlinks.json`
   (mantendo o de upload — o array aceita vários).
4. Republique em produção. Verifique: `adb shell pm verify-app-links --re-verify app.scoreplace`.

iOS não tem equivalente de fingerprint — o Team ID `6724SP9XN7` no AASA basta.
**Mas** o App ID `app.scoreplace` precisa ter a capability **Associated Domains**
habilitada no Apple Developer portal e o provisioning profile de distribuição
regenerado (com signing automático o Xcode faz isso sozinho ao ver a entitlement).

## Testar

- **iOS**: `https://app-site-association.cdn-apple.com/a/v1/scoreplace.app` deve
  retornar o AASA depois de publicado. Instale o app, cole o link numa Nota/iMessage,
  toque → abre o app na tela do torneio.
- **Android**: `adb shell pm get-app-links app.scoreplace` deve mostrar
  `scoreplace.app: verified`. Toque o link no WhatsApp → abre o app sem chooser.

## Sequência de deploy

1. **Web** (staging → prod): publicar os `.well-known/*` e o `js/deep-link.js` em
   `scoreplace.app`. Sem isso, a verificação das lojas falha.
2. **Nativo**: novo build de loja (entitlement iOS + intent-filter Android exigem
   rebuild) com `versionCode`/build number incrementados, via os scripts de release.
   Rodar `npm run cap:sync` antes do archive.
