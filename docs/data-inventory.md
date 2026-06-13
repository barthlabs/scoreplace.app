# Inventário de dados coletados — scoreplace.app

> Base pra **Apple Privacy Nutrition Label / Privacy Manifest** (`PrivacyInfo.xcprivacy`)
> e **Google Play Data Safety**. Levantado por auditoria do codebase em 2026-06-13
> (v2.4.48-beta). Mantê-lo atualizado quando coletar dado novo ou plugar 3rd party novo.
>
> Itens marcados **⚠️ CONFIRMAR** dependem de decisão/verificação do dono antes da submissão.

---

## 1. Dados coletados sobre o usuário

Legenda: **Vinculado** = associado à identidade do usuário (uid). **Rastreio** = usado pra
rastrear entre apps/sites de terceiros pra publicidade (ATT). **Hoje nenhum dado é usado
pra rastreio** — não há IDFA, ad SDK, nem data broker.

| Dado | Categoria Apple | Categoria Google | Pra quê | Vinculado | Rastreio |
|---|---|---|---|---|---|
| Nome (displayName) | Contact Info → Name | Personal info → Name | Identificação social, torneios, ranking | Sim | Não |
| E-mail | Contact Info → Email | Personal info → Email | Login, notificações, convites | Sim | Não |
| Telefone | Contact Info → Phone | Personal info → Phone | Login por celular, WhatsApp opcional | Sim | Não |
| Foto de perfil (photoURL) | User Content → Photos | Photos and videos | Avatar (do Google/Apple ou iniciais) | Sim | Não |
| Gênero, data de nascimento, idade | Sensitive Info / Health? **⚠️ CONFIRMAR** | Personal info → outras | Categorias de torneio (Fem/Masc, faixas etárias) | Sim | Não |
| Cidade / estado / país | Location → Coarse | Location → Approximate | Descoberta de torneios/locais por região | Sim | Não |
| Localização precisa (lat/lng dos locais preferidos, check-in, GPS) | **Location → Precise** | **Location → Precise** | Check-in em local, "quem está aqui", descoberta de quadras próximas | Sim | Não |
| Modalidades e nível por esporte (preferredSports, skillBySport) | User Content | App activity | Categorias, recomendações de torneio | Sim | Não |
| CEPs preferidos (preferredCeps) | Location → Coarse | Location → Approximate | Avisar torneios próximos | Sim | Não |
| Lista de amigos / relações sociais | Contacts? **⚠️ CONFIRMAR** (são usuários do app, não a agenda) | Personal info → outras | Rede social, presença de amigos | Sim | Não |
| Conteúdo gerado: torneios, partidas casuais, avaliações de locais, posts | User Content | User-generated content | Funcionalidade central do app | Sim | Não |
| Histórico de partidas / resultados / estatísticas | User Content | App activity | Stats, ranking, desempenho | Sim | Não |
| Preferências (notificação, presença, privacidade) | — | App activity | Configuração do app | Sim | Não |
| Token de push (fcmToken) | Identifiers → Device ID | Device or other IDs | Enviar notificações push | Sim | Não |
| Dados de uso (GA4) **⚠️ CONFIRMAR** | Usage Data | App activity / App info & performance | Entender uso, melhorar produto | **⚠️ ver §5** | **⚠️ ver §5** |
| Diagnóstico / erros (Sentry) | Diagnostics → Crash/Performance | App info & performance → Crash logs, Diagnostics | Detectar e corrigir bugs | Não (ou pseudônimo) | Não |
| Pagamento (Pro, via Stripe) **⚠️ web-only** | Purchases / Financial Info | Financial info | Assinatura Pro | Sim | Não |

---

## 2. Permissões de dispositivo solicitadas

| Permissão | Usada pra | Detalhe |
|---|---|---|
| **Localização** (precisa) | Check-in em locais, "quem está no local", descoberta de quadras próximas, definir local de torneio | Só quando o usuário aciona; há toggles de visibilidade e silenciar. Auto check-in é opt-in (`presenceAutoCheckin`). |
| **Câmera** | Escanear QR code pra entrar em torneio/partida | Vídeo apenas (`audio:false`), câmera traseira. **Nenhuma imagem é armazenada nem enviada** — frame processado localmente por jsQR pra ler o código. |
| **Notificações** | Push de torneios, resultados, presença de amigos | Opt-in. Token salvo no perfil (Firestore). |

> Strings de uso (`NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`) precisam
> ser escritas no `Info.plist` no momento do build nativo — redigir explicando o uso real acima.

---

## 3. Terceiros que recebem dados (data recipients)

| Terceiro | Que dado recebe | Pra quê |
|---|---|---|
| **Google / Firebase** (Auth, Firestore, Cloud Functions, FCM, Hosting/GitHub Pages) | Praticamente todos os dados acima | Backend, auth, banco, push. Subprocessador principal. |
| **Stripe** | Dados de pagamento da assinatura Pro | Processar pagamento. **⚠️ Hoje só no site (web-only)** — ver [[project_native_app_roadmap]] §2. Stripe é PCI, não expõe cartão ao app. |
| **Google Places / Maps API** | Texto de busca + localização aproximada | Sugerir/encontrar locais e quadras |
| **Evolution API (WhatsApp, self-hosted Railway)** | Número de telefone + conteúdo da mensagem | Enviar magic link e notificações via WhatsApp (opt-in) |
| **OpenWeatherMap** | Lat/lng do local do torneio | Previsão do tempo no card do torneio |
| **Sentry** | Telemetria de erro (stack, contexto técnico) | Monitoramento de bugs. Public DSN só permite SEND. |
| **Google Analytics (GA4)** **⚠️ CONFIRMAR** | Eventos de uso | Analytics de produto |
| **api.dicebear.com** | Nome/iniciais do usuário | Gerar avatar quando não há foto |
| **image.pollinations.ai** | Prompt (esporte/local do torneio) | Gerar logo do torneio por IA (fallback canvas local) |
| **api.qrserver.com** | URL do torneio | Gerar imagem de QR code |

> `img.youtube.com`, `instagram.com`, `wa.me`, `calendar.google.com`, `outlook.live.com` aparecem
> como **links/embeds de saída** (o usuário clica e sai do app), não como envio automático de dados.

---

## 4. Retenção e exclusão

- **Exclusão de conta**: o app já oferece exclusão permanente (perfil, notificações, inscrições,
  torneios organizados) com dupla confirmação — conformidade LGPD (feature desde v0.2.42-alpha).
- **Tokens efêmeros** (`magicLinks`, `gateTokens`, `emailVerifications`, etc.): limpeza agendada
  via Cloud Functions (`cleanup*`, `cleanupAbandonedAuth` 04:15 BRT).
- **Backup**: Firestore com backup diário (`backupFirestore`).
- Pra ambas as lojas, declarar: **"usuário pode solicitar exclusão dos dados"** e apontar pra
  exclusão in-app + e-mail de suporte (scoreplace.app@gmail.com).

---

## 5. ⚠️ Pontos a confirmar antes de submeter

1. **GA4 / "tracking" (crítico pra Apple ATT).** GA4 com *Google Signals* / recursos de
   publicidade ativos pode ser classificado pela Apple como **rastreio** → exigiria prompt ATT
   ("permitir rastreamento"). Pra ficar como **"dados não usados pra rastrear você"** (mais limpo,
   sem prompt), desativar Google Signals/ad features no GA4, ou remover GA4 da build nativa.
   **Decisão do dono.**
2. **Gênero / data de nascimento** — a Apple trata alguns como *Sensitive*. Confirmar se entram
   como "Sensitive Info" ou categoria comum (provavelmente comum, por serem pra categorização
   esportiva, não dado de saúde).
3. **Lista de amigos** — NÃO é a agenda do telefone (são outros usuários do app). Declarar como
   "User Content / outras informações", **não** como "Contacts" (não lemos a agenda do device).
4. **Stripe na build nativa** — confirmar que a venda do Pro fica web-only no iOS (modelo reader
   app). Se sim, "Financial Info / Purchases" pode nem precisar ser declarado na ficha do app iOS,
   já que a compra não acontece dentro do app. **Ver [[project_native_app_roadmap]] §2.**
5. **GA4 ID e Sentry** — confirmar que o nível de PII enviado é mínimo (Sentry não deve receber
   e-mail/telefone em claro nos eventos).

---

## 6. Resumo pra preenchimento rápido das fichas

- **Coleta dados?** Sim.
- **Compartilha com terceiros?** Sim (subprocessadores — §3), nenhum pra publicidade.
- **Usa pra rastrear (ATT)?** **Não** (condicionado a resolver o GA4 — §5.1).
- **Dados vinculados à identidade?** Maioria sim (é app com conta).
- **Usuário pode excluir?** Sim, in-app.
- **Categorias-chave:** Contato (nome/email/telefone), Localização **precisa**, Conteúdo do
  usuário, Identificadores (push token), Diagnóstico, Financeiro (web-only).
