// scoreplace.app — Stripe Cloud Functions (assinatura Pro)
// ──────────────────────────────────────────────────────────────────────────
// Codebase SEPARADO (como functions-autodraw). Funções LIVE em southamerica-east1:
//   • createCheckoutSession (onRequest) — cria a sessão de checkout do Stripe
//     (fluxo de upgrade Pro; o cliente chama em store.js _startProCheckout).
//   • stripeWebhook (onRequest) — ativa/renova/desativa o Pro conforme os
//     eventos do Stripe (checkout.session.completed, invoice.paid,
//     customer.subscription.deleted, invoice.payment_failed).
//
// ⚠️ ORIGEM: esta fonte foi RECUPERADA do código deployado em produção (jun/2026).
// Antes existia só na nuvem (não estava versionada). Agora está aqui pra não se
// perder. O Pro está PAUSADO até termos uma boa base de usuários — por isso NÃO
// está sendo redeployada agora; as instâncias que rodam em produção continuam em
// node 20 (ainda funcionam).
//
// QUANDO ATIVAR O PRO (e obrigatoriamente ANTES de out/2026, quando o node 20 é
// descontinuado), deployar em node 22 com deploy ALVEJADO:
//   cd functions-stripe && npm install
//   firebase deploy --only functions:createCheckoutSession,functions:stripeWebhook --project scoreplace-app
// NUNCA usar `firebase deploy --only functions` puro aqui — tentaria DELETAR as
// funções dos outros codebases (functions/ e functions-autodraw). Mesmo footgun.
//
// SECRETS (já configurados no Firebase via `firebase functions:secrets:set`):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
//
// O priceId vem do cliente (window._STRIPE_PRICE_ID em store.js).
// ──────────────────────────────────────────────────────────────────────────

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

initializeApp();
const db = getFirestore();

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// Stripe inicializado lazy dentro de cada função (precisa do secret resolvido).
function getStripe() {
  return new Stripe(stripeSecretKey.value(), { apiVersion: "2023-10-16" });
}

// ============================================================================
// STRIPE — cria a Checkout Session da assinatura Pro
// ============================================================================
export const createCheckoutSession = onRequest(
  { region: "southamerica-east1", cors: ["https://scoreplace.app"], secrets: [stripeSecretKey] },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    try {
      const { userId, priceId } = req.body;
      if (!userId || !priceId) {
        return res.status(400).json({ error: "userId and priceId are required" });
      }

      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: "https://scoreplace.app/#dashboard?upgrade=success",
        cancel_url: "https://scoreplace.app/#dashboard?upgrade=cancel",
        client_reference_id: userId,
        metadata: { userId },
      });

      res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (error) {
      console.error("createCheckoutSession error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// STRIPE — Webhook (ativa/renova/desativa o Pro)
// ============================================================================
export const stripeWebhook = onRequest(
  { region: "southamerica-east1", secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = stripeWebhookSecret.value();

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not set");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;
    try {
      event = getStripe().webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature failed:", err.message);
      return res.status(400).json({ error: "Webhook signature verification failed" });
    }

    try {
      const obj = event.data.object;

      switch (event.type) {
        case "checkout.session.completed": {
          const userId = obj.client_reference_id || (obj.metadata && obj.metadata.userId);
          if (!userId) { console.error("No userId in checkout session"); break; }
          const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await db.collection("users").doc(userId).set({
            plan: "pro",
            planExpiresAt: expires.toISOString(),
            stripeCustomerId: obj.customer,
            stripeSubscriptionId: obj.subscription,
            subscriptionStatus: "active",
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          console.log("Pro activated for " + userId);
          break;
        }

        case "invoice.paid": {
          const custId = obj.customer;
          if (!custId) break;
          const snap = await db.collection("users").where("stripeCustomerId", "==", custId).limit(1).get();
          if (snap.empty) break;
          const userDoc = snap.docs[0];
          const data = userDoc.data();
          const currentExp = data.planExpiresAt ? new Date(data.planExpiresAt) : new Date();
          const newExp = new Date(Math.max(currentExp.getTime(), Date.now()) + 30 * 24 * 60 * 60 * 1000);
          await userDoc.ref.update({
            plan: "pro",
            planExpiresAt: newExp.toISOString(),
            subscriptionStatus: "active",
            updatedAt: new Date().toISOString(),
          });
          console.log("Pro renewed for " + userDoc.id);
          break;
        }

        case "customer.subscription.deleted": {
          const custId2 = obj.customer;
          if (!custId2) break;
          const snap2 = await db.collection("users").where("stripeCustomerId", "==", custId2).limit(1).get();
          if (snap2.empty) break;
          await snap2.docs[0].ref.update({
            plan: "free",
            subscriptionStatus: "canceled",
            updatedAt: new Date().toISOString(),
          });
          console.log("Pro deactivated for " + snap2.docs[0].id);
          break;
        }

        case "invoice.payment_failed": {
          const custId3 = obj.customer;
          if (!custId3) break;
          const snap3 = await db.collection("users").where("stripeCustomerId", "==", custId3).limit(1).get();
          if (snap3.empty) break;
          await snap3.docs[0].ref.update({
            plan: "past_due",
            subscriptionStatus: "payment_failed",
            updatedAt: new Date().toISOString(),
          });
          console.log("Plan past_due for " + snap3.docs[0].id);
          break;
        }

        default:
          console.log("Unhandled event: " + event.type);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Internal error" });
    }
  }
);
