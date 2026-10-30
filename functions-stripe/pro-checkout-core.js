// O webhook Pro compartilha a conta Stripe com outros pagamentos do Scoreplace.
// Sessões avulsas nunca podem conceder assinatura, mesmo que tragam um UID.
export function isProCheckoutSession(session) {
  if (!session || session.mode !== "subscription") return false;
  const metadata = session.metadata;
  if (metadata && Object.prototype.hasOwnProperty.call(metadata, "kind")) return false;
  const userId = session.client_reference_id || (metadata && metadata.userId);
  return typeof userId === "string" && userId.length > 0 && userId === userId.trim();
}
