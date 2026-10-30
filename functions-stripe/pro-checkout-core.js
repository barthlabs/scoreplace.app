// O webhook Pro compartilha a conta Stripe com outros pagamentos do Scoreplace.
// Sessões avulsas nunca podem conceder assinatura, mesmo que tragam um UID.
export function isProCheckoutSession(session) {
  if (!session || session.mode !== "subscription") return false;
  const metadata = session.metadata;
  if (metadata && Object.prototype.hasOwnProperty.call(metadata, "kind")) return false;
  const userId = session.client_reference_id || (metadata && metadata.userId);
  return typeof userId === "string" && userId.length > 0 && userId === userId.trim();
}

export function proSubscriptionEventId(type, object) {
  if (!object || typeof object !== "object") return null;
  const id = type === "customer.subscription.deleted" ? object.id
    : (type === "invoice.paid" || type === "invoice.payment_failed") ? object.subscription
      : null;
  return typeof id === "string" && id.length > 0 && id === id.trim() ? id : null;
}

export function matchesProSubscriptionEvent(type, object, user) {
  const subscriptionId = proSubscriptionEventId(type, object);
  return !!subscriptionId
    && typeof object.customer === "string" && object.customer.length > 0
    && object.customer === object.customer.trim()
    && !!user && user.stripeSubscriptionId === subscriptionId
    && user.stripeCustomerId === object.customer;
}
