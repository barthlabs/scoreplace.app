# Roadmap scoreplace.app → 1.0 (lojas Apple/Google + smartwatch)

> Documento vivo. Criado 2026-06-27. Base nas decisões já tomadas — ver `memory/project_native_app_roadmap.md`.
> Este roadmap NÃO reabre o que já foi decidido (Capacitor, reader-app/sem IAP, conta org CNPJ,
> staging existente, feature flags entregues, data-inventory feito, arquitetura do watch Opção A).
> Só agenda o trabalho que falta.

## Decisões que governam este roadmap

| Tema | Decisão | Status |
|---|---|---|
| Empacotamento | Capacitor (WebView nativo, zero reescrita) | decidido |
| Atualização | OTA (Capgo) ou WebView ao vivo p/ JS/CSS; revisão só p/ código nativo | decidido |
| Conta Google | Organização com CNPJ 51590996000173 | decidido |
| Conta Apple | Apple Developer US$ 99/ano | a abrir |
| Pagamento no 1.0 | **Reader-app: Pro vendido no site (Stripe), sem IAP. PIX no site.** | decidido |
| Staging | `scoreplace-staging.web.app` (troca por hostname) | **existe** |
| Feature flags | `SCOREPLACE_PLATFORM`/`SP_FLAGS`/`_flag()` | **entregue (v2.4.48)** |
| Inventário de dados | `docs/data-inventory.md` | **feito** (5 pontos a confirmar) |
| **Watch** | **Dentro do 1.0** (mudança 2026-06-27; era v2) | **NOVO** |
| Arquitetura watch | Opção A: relógio burro ↔ iPhone ↔ Firestore; regra GSM fica no JS | decidido |
| Escopo watch | Controle remoto: placar + (+1 por time) + desfazer + haptic | decidido |

## Onde estamos

App em ~4.x-beta, 5 pilares completos e em produção (Confra 2026 ao vivo até 12/11/26).
Produto web = "feature-complete + polimento". O que falta pro 1.0-lojas-watch é:
**(1) endurecer com testes, (2) empacotar nativo, (3) construir o watch nativo, (4) submeter.**

---

## Fase 1 — Congelar escopo do 1.0 ✅ FEITO — congelado em **4.0.22-beta** (27/jun)

**FEATURE FREEZE: 4.0.22-beta.** Daqui pro 1.0 = só bug e polimento, nenhuma feature nova.
As features estão construídas, não "em andamento". Não há nada a cortar nem a construir antes de testar.

- ✅ Construtor/motor de fases — canônico, schema `phases[0]` unificado, pódio canônico, **com testes unitários** (`phases-engine.test.js`, `phase-generators.test.js`, `phase-brick4.test.js`).
- ✅ Enquete de combinar jogos — `schedule-poll.js` (3.1.70).
- ✅ W.O. apontado por participante — canônico e commitado (3.1.72).
- ✅ Formação manual de duplas — motor + UI drag-drop + pendência/aceite + rules (dono confirmou pronto e testado).
- ◻ Varredura uid — refator interno, segue como higiene; **não é feature de usuário, não trava o 1.0.**

**Conclusão:** escopo congelado = conjunto do **4.0.22-beta**. A lacuna real não é construir, é **validar** → vai direto pra Fase 2.

---

## Fase 2 — Endurecimento + testes (3–4 sem) ← a lacuna técnica real

- [ ] Suíte **E2E** dos fluxos críticos (≥10 cenários verdes):
  - criar torneio → sortear → lançar resultado → encerrar
  - partida casual ao vivo (placar GSM)
  - presença / check-in (GPS)
  - login: celular (SMS/WhatsApp), Google, magic link
  - fluxo de aprovação de resultado por participantes (4 fases)
- [ ] Testes do **motor de sorteio** (ponto mais frágil; já tem paridade server via `autoDraw`/`vendor` — testar os dois).
- [ ] Sentry limpo + backup Firestore diário + quotas (já configurados — validar).
- [ ] Soak em produção real (Confra, até 12/11/26) — critério: sem bug crítico, não "30 dias" fixos.

**Dependência:** Fase 1 (freeze).

---

## Fase 3 — Empacotamento nativo Capacitor (2–4 sem)

Tudo atrás de `SCOREPLACE_PLATFORM` / feature flag, validado no escuro nos UIDs de teste.

- [ ] Projeto Capacitor: targets Xcode (iOS) + Android Studio.
- [ ] **Safe-area** (notch/ilha/barras) — flag.
- [ ] **Sign in with Apple** (exigência da Apple quando há login social) — flag.
- [ ] Push nativo (FCM já existe) ligado no shell nativo.
- [ ] Deep links nativos (convites, notificações).
- [ ] Permissões nativas: GPS, câmera (só QR), notificações + textos de uso (Info.plist / manifest).
- [ ] Gate de plataforma: no iOS, **esconder a venda do Pro** (reader-app); link "gerenciar conta" abre no Safari do sistema.
- [ ] Ícones/splash nativos.

**Dependência:** idealmente Fase 2 estável.

---

## Fase 4 — Smartwatch nativo (CAMINHO CRÍTICO, 6–10 sem) ← maior risco

Stack nova (Swift/Kotlin), ~0% reuso. Arquitetura **Opção A** (decidida): relógio é controle remoto; regra GSM permanece no JS do app.

### 4a. Bridge (pré-requisito de tudo)
- [ ] **Plugin Capacitor custom** que expõe WatchConnectivity (iOS) / Wearable Data Layer (Android) ao JS do WebView. É a ponte relógio↔nativo↔JS↔Firestore. **Sem isso o watch não fala com o app.**
- [ ] Protocolo de mensagens: intenção de ponto/desfazer (relógio→app), estado do placar (app→relógio).

### 4b. watchOS (Swift/SwiftUI)
- [ ] App companion no mesmo binário do iOS (não app avulso).
- [ ] UI: placar grande, +1 por time, ↶ desfazer, haptic.
- [ ] Sessão de pareamento com a partida casual ativa.

### 4c. Wear OS (Kotlin/Compose)
- [ ] Equivalente do watchOS.

### 4d. Integração
- [ ] Loop completo: marcar ponto no pulso → app aplica regra GSM → Firestore → relógio reflete.
- [ ] Resiliência: relógio fora de alcance, reconexão, partida encerrada no telefone.

**Dependência:** Fase 3 (app iOS de pé — o target watchOS vive dentro dele).
**Risco:** stack desconhecida, conta Apple paga obrigatória pra rodar em device físico, debug de WatchConnectivity é lento.

---

## Fase 5 — Submissão lojas (1–3 sem, com idas e vindas)

- [ ] Confirmar os **5 pontos** do `data-inventory.md` (GA4/ATT, gênero/nascimento sensível?, amigos≠agenda, Stripe web-only iOS, PII mínima no Sentry).
- [ ] Apple: Privacy Nutrition Labels + ATT + classificação etária + screenshots (inclui watch) + descrição.
- [ ] Google: Data Safety + classificação + screenshots + descrição.
- [ ] Privacy/Terms (já publicados) — linkar nas fichas.
- [ ] Submeter; tratar feedback de revisão (Apple = gargalo imprevisível).

**Dependência:** Fases 3 e 4.

---

## Caminho crítico

```
Fase 1 (freeze) → Fase 2 (testes) → Fase 3 (Capacitor) → Fase 4 (watch) → Fase 5 (submissão)
```

O **watch (Fase 4)** é o item que mais empurra a data — é a única stack nova e depende do app nativo já de pé. É ele que define o prazo do 1.0 agora que está no escopo.

Estimativa grosseira (solo + assistência Claude, partes em paralelo onde possível):
**~3,5 a 5,5 meses**, dominado pela Fase 4 (watch).

## Riscos principais

1. **Watch = stack nova** — Swift/Kotlin/WatchConnectivity é a maior incerteza de prazo.
2. **Revisão Apple** — imprevisível; reader-app reduz atrito mas Apple Sign-In + privacy labels precisam estar certos.
3. **Sempre ao vivo** — toda mudança de raio largo entra atrás de flag e valida nos UIDs de teste antes de abrir (Confra não pode quebrar).

## Critérios de aceite do 1.0

- [ ] E2E ≥10 cenários verdes (motor de sorteio incluso).
- [ ] Apps iOS + Android aprovados nas lojas.
- [ ] Watch (watchOS + Wear OS) marcando ponto ao vivo de partida casual, com GSM no JS.
- [ ] Pro web-only funcionando via reader-app (sem IAP).
- [ ] Sem bug crítico no soak do Confra.
- [ ] Sentry + backup + quotas ativos.
