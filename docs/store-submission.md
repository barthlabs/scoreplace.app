# Checklist de submissão às lojas — scoreplace.app

> Companheiro do `data-inventory.md` (fonte dos dados) e do `roadmap-1.0.md` (fases).
> Objetivo: **deixar tudo pronto ANTES de pagar** as contas, pra submeter rápido.

## 0. Contas (pré-requisito de tudo)
- [ ] **Apple Developer Program** — US$ 99/ano. Sem isso: sem TestFlight, assinatura, APNs, Sign in with Apple, submissão.
- [ ] **Google Play Console** — US$ 25 (única vez). **Abrir como ORGANIZAÇÃO (CNPJ 51590996000173)** pra pular os 12-20 testadores × 14 dias.

---

## 1. Privacidade / Dados

### Apple — App Privacy (na App Store Connect)
Base: `PrivacyInfo.xcprivacy` (já no app) + `data-inventory.md`.
- **Rastreia o usuário (ATT)?** NÃO (condicionado ao GA4 — ver §4).
- **Dados coletados** (todos *não* pra rastreio; a maioria *vinculada* à conta):
  - Contato: Nome, E-mail, Telefone.
  - Localização: **Precisa** (check-in/GPS) + Aproximada (cidade/CEP).
  - Conteúdo do usuário: torneios, partidas, avaliações, amigos, modalidades/nível.
  - Outros: gênero/nascimento (categorização esportiva — comum, não Health).
  - Identificadores: token de push (device ID).
  - Diagnóstico: crash + performance (Sentry) — não-vinculado.
  - Uso: interação com o produto (GA4) — ver §4.

### Google — Data Safety (no Play Console)
- **Coleta dados?** Sim. **Compartilha com terceiros?** Sim (subprocessadores; NENHUM pra publicidade).
- **Criptografia em trânsito?** Sim. **Usuário pode pedir exclusão?** Sim (in-app + suporte).
- Tipos: Personal info (nome/email/telefone), Location (precisa+aprox), App activity
  (histórico/stats/uso), Photos, Device IDs (push), Diagnostics (crash).

### Ambos
- **Política de Privacidade** (URL): já publicada (scoreplace.app/#privacy). Confirmar link final.
- **Suporte** (URL/e-mail): scoreplace.app@gmail.com.
- **Exclusão de dados**: in-app (desde v0.2.42) + e-mail. LGPD ok.

---

## 2. iOS — requisitos técnicos
- [x] Ícone + splash (feito).
- [x] Permissões no Info.plist (localização, câmera) — textos pt-BR.
- [x] **Privacy Manifest** (`PrivacyInfo.xcprivacy`) — feito, no bundle.
- [ ] **Sign in with Apple** — OBRIGATÓRIO (tem login Google). Precisa App ID com a capability (conta paga). Código pode ser scaffoldado antes.
- [ ] **APNs / Push** — subir APNs Auth Key no Firebase (conta paga).
- [ ] **Assinatura/provisioning** — certificado + provisioning (conta paga).
- [ ] version (CFBundleShortVersionString) + build (CFBundleVersion) de release.
- [ ] Reader-app: garantir que NÃO há venda do Pro dentro do app iOS (Pro pausado hoje).

## 3. Android — requisitos técnicos
- [x] Ícone + splash + permissões (feito).
- [x] `google-services.json` + login Google nativo (feito).
- [ ] **Keystore de RELEASE** (upload key) — gerar e **guardar com segurança** (perder = não atualiza mais o app). Adicionar o SHA-1 dele no app Android do Firebase.
- [ ] **FCM push** — verificar ponta a ponta (token → notificação).
- [ ] versionCode/versionName de release.

---

## 4. ⚠️ Decisões do dono (travam a finalização)
1. **GA4 / rastreio (Apple ATT)** — pra ficar "não rastreia" (sem prompt ATT), desativar Google Signals/ad features no GA4 **ou** tirar o GA4 da build nativa. Se ficar com ad features → vira rastreio (pior). **→ Recomendo: Signals OFF ou GA4 fora do nativo.**
2. **Pro no iOS** — manter web-only (reader app). Se sim, "Financeiro/Compras" nem precisa entrar na ficha do iOS. (Pro está pausado.)
3. **Quando comprar as contas** — define quando começam os itens que dependem delas (Apple Sign-In, APNs, keystore SHA-1, submissão).

---

## 5. Assets de loja (fazer por último — do app já polido)
- [ ] Screenshots iOS (6.7"/6.5"/5.5" + iPad se aplicável) — gero do simulador.
- [ ] Screenshots Android (phone + 7"/10" tablet opcional) — gero do emulador.
- [ ] Feature graphic (Android, 1024×500).
- [ ] Descrição curta + longa, palavras-chave, categoria, classificação etária.
