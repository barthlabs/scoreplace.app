# scoreplace.app — Ficha de loja (App Store + Google Play)

Documento de referência para submeter os apps nativos (Capacitor 8) às lojas.
Nada aqui exige pagamento — é a preparação. Os passos pagos estão no fim.
Base de submissão: branch `native/v1-submit` (login nativo + smartwatch + fix header).

> ⚠️ Antes de submeter, revise a seção **"Decisões pendentes"** — há escolhas
> (versão de marketing, Pro/IAP, iPad, watch na 1ª leva) que mudam a ficha.

---

## 1. Identidade do app

| Campo | Valor |
|---|---|
| Nome | **scoreplace** |
| Subtítulo (App Store, ≤30) | Jogue em outro nível |
| Bundle ID / applicationId | `app.scoreplace` |
| Categoria primária | **Esportes** (Sports) |
| Categoria secundária (Play) | Estilo de vida (opcional) |
| Idioma principal | Português (Brasil) |
| Idiomas suportados | pt-BR, en (i18n no app) |
| Versão exibida (marketing) | **a definir** — hoje `SCOREPLACE_VERSION = 4.3.35-beta` |
| Site | https://scoreplace.app |
| Suporte | scoreplace.app@gmail.com · WhatsApp +55 11 91693-6454 |
| Política de Privacidade | https://scoreplace.app/#privacy |
| Termos de Uso | https://scoreplace.app/#terms |
| Firebase | projeto `scoreplace-app` (config já versionada no repo) |
| Plataformas iOS | iPhone + iPad (`TARGETED_DEVICE_FAMILY = 1,2`) + companion Apple Watch |
| Plataformas Android | Phone + Wear OS (`:wear`) |

---

## 2. Textos (pt-BR)

### Descrição curta (Google Play — ≤80 caracteres)
> Organize torneios, marque o placar ao vivo e encontre quem joga perto de você.

### Subtítulo (App Store — ≤30 caracteres)
> Jogue em outro nível

### Descrição completa (App Store + Google Play)

> **O scoreplace reúne tudo do seu esporte de raquete num app só.**
>
> Beach Tennis, Padel, Tênis, Pickleball, Tênis de Mesa, Squash, Badminton,
> Vôlei de Praia e Futevôlei — do racha de domingo ao torneio da temporada.
>
> 🏆 **Torneios de verdade**
> Crie eliminatórias, pontos corridos, fase de grupos, suíço, duplas e Rei/Rainha
> da Praia. Sorteio automático, chaveamento, classificação, categorias por gênero,
> idade e habilidade. Convide por link ou QR Code.
>
> ⚡ **Placar ao vivo**
> Marque ponto a ponto sem criar torneio. Regras oficiais de cada modalidade
> (games, sets, tie-break), desfazer, estatísticas e "jogar novamente". Com o app
> no smartwatch (Apple Watch / Wear OS), marque o ponto direto do pulso.
>
> 📍 **Presença e locais**
> Descubra quadras perto de você, veja quem está jogando agora e avise os amigos
> que você vai. Marque presença e planeje sua ida.
>
> 👥 **Amigos e estatísticas**
> Seu desempenho, histórico, confrontos diretos e parcerias. Tudo consolidado
> entre torneios e partidas casuais.
>
> Feito por quem joga, para quem joga. **Jogue em outro nível.**

### Novidades / "What's New" (texto da versão)
> - Controle de placar ao vivo pelo smartwatch (Apple Watch e Wear OS).
> - Login mais rápido e estável.
> - Diversas melhorias de layout no celular.

### Palavras-chave (App Store — ≤100 caracteres, separadas por vírgula)
> `torneio,beach tennis,padel,tênis,pickleball,placar,ranking,quadra,esporte,liga,chaveamento,racha`

---

## 3. Screenshots (especificação)

Capturar em simulador/emulador (grátis). Sugestão de telas (as mais vendedoras):
1. Dashboard com torneios + hero.
2. Chaveamento (bracket) de um torneio.
3. Placar ao vivo (partida casual) — tela grande de pontos.
4. Descoberta de locais / presença ("quem está no local").
5. Perfil / estatísticas.
6. (Watch) Tela de placar ao vivo no relógio + tela de vitória.

### Apple App Store
| Dispositivo | Resolução | Obrigatório? |
|---|---|---|
| iPhone 6.9" (16 Pro Max) | 1290×2796 | **Sim** (Apple exige o maior) |
| iPhone 6.5"/6.7" | 1242×2688 / 1290×2796 | Recomendado |
| iPad 13" | 2064×2752 | **Sim se manter iPad** |
| Apple Watch | 410×502 (S9/S11 45mm) | Opcional (recomendado se listar watch) |
- Mín. 1, até 10 por tipo de dispositivo. PNG/JPG, sem transparência.

### Google Play
| Asset | Especificação | Obrigatório? |
|---|---|---|
| Screenshots telefone | 2–8, min 320px, ratio 16:9 ou 9:16 | **Sim (≥2)** |
| Screenshots Wear OS | 384×384 (round) | **Sim se listar Wear** |
| Ícone do app | 512×512 PNG (32-bit) | **Sim** |
| Feature graphic | 1024×500 | **Sim** |
| Screenshots tablet | 7"/10" | Recomendado |

> Ícone base já existe: `icons/icon-512.svg` (pódio). Gerar o PNG 512×512.

---

## 4. Classificação etária

Responder o questionário **honestamente**. O app tem: rede social leve (amigos,
notificações), conteúdo gerado por usuário (nomes de jogadores/torneios, avaliações
de locais) e localização opcional. Sem violência, sexo, apostas ou substâncias.

- **Apple:** provável **4+**; pode ir a **12+** se marcar "interação entre usuários"
  / conteúdo gerado por usuário sem moderação prévia.
- **Google (IARC):** provável **Livre (L)** a **10+**.

Marcar: coleta de localização (sim, opcional), interação social (sim), compras no
app (**só se** Pro entrar — ver decisões pendentes).

---

## 5. Privacidade — respostas prontas

Política publicada (revisão jurídica fechada em 2026-05-28): `#privacy` e `#terms`.

### Dados coletados (para App Privacy da Apple e Data Safety do Google)

| Dado | Coletado | Ligado à identidade | Uso |
|---|---|---|---|
| Nome | Sim | Sim | Conta, exibição em torneios |
| E-mail | Sim | Sim | Conta, login, notificações |
| Telefone | Opcional | Sim | Login por SMS/WhatsApp, notificações |
| Foto de perfil | Sim (do Google) | Sim | Avatar |
| Localização (GPS) | Opcional | Sim | Descoberta de quadras, presença |
| Conteúdo do usuário | Sim | Sim | Torneios, resultados, avaliações de locais |
| ID do usuário (uid) | Sim | Sim | Funcionamento do app |
| Token push (FCM) | Sim | Sim | Notificações |
| Interações no app (analytics) | Sim | Sim | GA4 — melhoria/uso |
| Diagnóstico/crash | Sim | Não necessariamente | Sentry — estabilidade |

- **Rastreamento (App Tracking Transparency / Apple):** GA4 é analytics de 1ª parte.
  Se **não** houver rastreamento entre apps de terceiros para publicidade, declarar
  "Não usado para rastreamento". Confirmar que não há SDK de ads.
- **Google Data Safety:** marcar criptografia em trânsito (Firestore/HTTPS: sim) e
  opção de o usuário pedir exclusão de dados (o app tem "excluir conta" — sim).

---

## 5.1 GOOGLE — o que já está PRONTO (grátis, feito)

Decisões aplicadas: **beta** mantido, **sem Pro**, **iPad sim**, **Wear sim**, **Google primeiro**.

- **"Sem Pro" já está garantido no código** — `window._MONETIZATION_ENABLED = false`
  (store.js): `_isPro()` retorna true pra todos (acesso completo, sem limites) e
  `_showUpgradeModal()` é no-op. Os únicos gatilhos de paywall (criar torneio /
  inscrição) passam por esse no-op → **nenhum CTA de compra de bem digital é
  alcançável**. Nada a remover. (O botão "Apoie/PIX" é **doação voluntária**, que
  o Google permite; se quiser, dá pra escondê-lo no nativo, mas não é obrigatório.)
- **AAB de release assinado gerado e verificado:**
  `android/app/build/outputs/bundle/release/app-release.aab` (~7.7 MB), assinado com
  a chave de upload. `versionCode 1`, `versionName "1.0"` (exibe como beta na ficha).
- **Assinatura configurada** em `android/app/build.gradle` (`signingConfigs.release`
  lê `android/keystore.properties`, que é **gitignored**). Commit `5908d14c`.

### 🔑 Custódia do keystore (IMPORTANTE — faça backup)
- Arquivo: `android-signing/upload-keystore.jks` (**gitignored**, fora do git).
- `android/keystore.properties` guarda a senha (**gitignored**). Alias: `upload`.
- **A senha foi entregue no chat, não está no git.** Guarde o `.jks` + a senha num
  cofre (1Password, etc.). Com **Play App Signing** ativo, perder a chave de upload
  é recuperável (reset via Google), mas ainda assim: faça backup.

### 🔗 Registrar no Firebase (senão o login Google quebra em release)
No console do Firebase (projeto `scoreplace-app`) → app Android `app.scoreplace` →
adicionar as impressões digitais da **chave de upload**:
- **SHA-1:**   `0A:79:82:23:2A:53:4D:8E:31:5D:0F:FB:03:32:92:B5:A9:B4:FF:04`
- **SHA-256:** `BC:B2:41:AA:9B:D7:FC:C9:00:C7:3F:1E:F2:15:30:A7:E2:11:0A:5C:0B:0D:90:F5:61:E4:70:9B:23:6A:DE:00`
- Depois de subir no Play e ativar Play App Signing, adicionar TAMBÉM o SHA-1 da
  **chave de assinatura do app** que o Google mostrar no console.

### Ainda falta (grátis) antes do upload
- [ ] Screenshots do **telefone** (2–8) — precisa o app logado rodando (ver seção 3).
      Do **Wear** já há capturas do placar/vitória do relógio.
- [ ] **Ícone 512×512 PNG** e **feature graphic 1024×500** (gerar do pódio
      `icons/icon-512.svg`). Verificar também os ícones de launcher do app nativo.
- [ ] Conferir `assets/` de ícone/splash nativos (não usar o ícone padrão do Capacitor).

---

## 6. Passos PAGOS (checklist) — só executar após seu OK a cada cobrança

### Apple — US$ 99/ano (Apple Developer Program)
1. Matricular no Apple Developer Program (conta individual ou empresa).
2. Criar **App ID** `app.scoreplace` com capabilities: Sign in with Apple (se usar),
   Push Notifications, **Associated Domains/Keychain** (já no `App.entitlements`).
3. Certificados + perfis de provisionamento (ou **Automatic signing** no Xcode).
4. **App Store Connect:** criar app (bundle `app.scoreplace`, idioma pt-BR, SKU),
   preencher ficha (seções 1–5 acima), screenshots, App Privacy, classificação.
5. `npx cap sync ios` → **Archive** no Xcode (Release) → subir para **TestFlight**
   (teste interno) → depois **enviar para revisão**.
6. **Gotcha Google Sign-In:** garantir o `CFBundleURLSchemes` com o *reversed client
   ID* do `GoogleService-Info.plist` no Info.plist (senão o login Google falha).

### Google — US$ 25 (taxa única, Play Console)
1. Criar conta no Google Play Console e pagar a taxa única.
2. Criar app (pt-BR, categoria Esportes), ficha + screenshots (seção 3).
3. **Assinatura:** ativar **Play App Signing** (upload key).
4. **Gotcha Google Sign-In (crítico):** registrar o **SHA-1 da chave de release**
   (upload key **e** a de assinatura do Play) no console do Firebase
   (`scoreplace-app`), senão o login Google quebra em produção.
5. Preencher **Data Safety** (seção 5), classificação IARC, política de privacidade.
6. `npx cap sync android` → `./gradlew :app:bundleRelease` (**AAB assinado**) →
   faixa de **teste interno** → produção.

### IDs / valores a ter em mãos
- Bundle ID / package: `app.scoreplace`
- Apple Team ID: _(gerado ao matricular)_
- SHA-1 release Android: _(gerar da keystore de upload)_ → colar no Firebase
- Firebase project: `scoreplace-app` (config já no repo:
  `android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist`)

---

## 7. Decisões pendentes (resolver antes de submeter)

- [ ] **Versão de marketing:** manter `-beta` (`4.3.35-beta`) ou lançar como `1.0`?
      As lojas mostram esse número; sugiro `1.0` (ou `1.0.0`) na primeira submissão.
- [ ] **Pro / compras no app:** o app tem plano Pro, mas o Stripe está **pausado**.
      Na Apple, bens digitais exigem **IAP nativo** (Stripe não é permitido p/ isso).
      **Recomendação:** submeter a v1 **sem** Pro/compras (evita o bloqueio) e
      adicionar IAP depois. Se mantiver Pro, é preciso implementar StoreKit/Billing.
- [ ] **iPad:** manter suporte (device family 1,2) exige screenshots de iPad.
      Se não quiser, mudar para iPhone-only (`TARGETED_DEVICE_FAMILY = 1`).
- [ ] **Smartwatch na 1ª leva:** watchOS é companion embutido (sobe junto). Wear OS
      no Google Play pode exigir screenshots Wear na ficha. Decidir se entra agora
      ou numa atualização seguinte.
- [ ] **Ícone/feature graphic:** gerar PNGs finais (512×512 e 1024×500) a partir do
      pódio (`icons/icon-512.svg`).

---

## 8. Estado atual (verificado, grátis)

- Branch de submissão `native/v1-submit` = login nativo + smartwatch + fix header.
- Builds locais **OK** nos dois lados:
  - iOS: `App` scheme `BUILD SUCCEEDED`, com `App.app/Watch/ScoreplaceWatch.app` embutido.
  - Android: `app-debug.apk` + `wear-debug.apk`.
- Ambiente: openjdk@21 (JAVA_HOME), Xcode 26.6, Android SDK, iOS via SPM (sem CocoaPods).
- Falta apenas o que exige pagamento (matrículas Apple/Google) e as decisões acima.
