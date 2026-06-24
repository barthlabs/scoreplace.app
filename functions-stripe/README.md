# functions-stripe — Cloud Functions do Pro (Stripe)

Codebase **separado** (como `functions-autodraw/`), com as duas funções de pagamento
do plano **Pro**, ambas em `southamerica-east1`:

- **`createCheckoutSession`** (`onRequest`) — cria a sessão de checkout do Stripe.
  O cliente chama em `js/store.js` → `window._startProCheckout` (POST com `userId` +
  `priceId`), recebe `{url}` e redireciona pro checkout.
- **`stripeWebhook`** (`onRequest`) — recebe eventos do Stripe e ativa/renova/desativa
  o Pro no doc do usuário (`checkout.session.completed`, `invoice.paid`,
  `customer.subscription.deleted`, `invoice.payment_failed`).

## ⚠️ Origem desta pasta

A fonte destas funções **não estava versionada** — existia só deployada na nuvem.
Foi **recuperada do código deployado em produção** (jun/2026) e colocada aqui pra não
se perder. As funções **continuam rodando em produção** (em **node 20**) — esta pasta
**não foi redeployada** ainda.

## Status: Pro PAUSADO

O Pro só será ativado quando houver uma boa base de usuários. Por isso esta pasta
existe só pra preservar a fonte; **não há urgência de deploy** — exceto o prazo abaixo.

## ⏰ Prazo: node 20 sai em out/2026

As instâncias em produção estão em **node 20**, que o Firebase descontinua em
**out/2026**. Antes disso (ou ao ativar o Pro, o que vier primeiro), **redeployar em
node 22** (esta pasta já está configurada pra 22):

```bash
cd functions-stripe
npm install
firebase deploy --only functions:createCheckoutSession,functions:stripeWebhook --project scoreplace-app
```

### ⚠️ Footgun do deploy (igual ao functions-autodraw)

**NUNCA** rodar `firebase deploy --only functions` puro aqui. Sem alvejar funções
específicas, o Firebase tenta **DELETAR** as funções dos outros codebases (`functions/`
e `functions-autodraw/`), porque elas não existem nesta pasta. **Sempre** use o deploy
**alvejado** (`--only functions:createCheckoutSession,functions:stripeWebhook`).

## Secrets (já configurados no Firebase)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

(Definidos via `firebase functions:secrets:set …` — não ficam no git.)

## Cliente

- `window._STRIPE_PRICE_ID` (em `js/store.js`) — id do preço da assinatura no Stripe.
- Fluxo Pro: `_startProCheckout` → `createCheckoutSession` → checkout → `stripeWebhook`
  ativa `plan: "pro"` no doc do usuário.
