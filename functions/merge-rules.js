// scoreplace.app — REGRA DE SOBREVIVÊNCIA NO MERGE (módulo puro, sem side effects)
//
// Existe separado de index.js por um motivo: index.js registra onCall/onSchedule e lê
// secrets no import, então não dá pra carregar num teste. A decisão de QUEM sobrevive num
// merge é a parte que mais dói errar (apagar a conta errada = pessoa perde o acesso), então
// ela precisa ser exercitada de verdade pelos testes — não por uma réplica que pode divergir
// do código real sem ninguém notar. Ver tests/merge-federated-wins.test.js.

// Provedores FEDERADOS: o Firebase NÃO transfere esses entre uids — eles morrem com a conta.
// Celular e e-mail/senha se movem via admin.auth().updateUser().
const FEDERATED = /^(google\.com|apple\.com)$/;

/** true se a conta de Auth tem ao menos um provedor federado. */
function isFederated(authUser) {
  return (authUser && authUser.providerData || []).some(
    (p) => p && FEDERATED.test(p.providerId)
  );
}

/** true se o doc de perfil (users/{uid}) indica conta federada — usa authProvider gravado. */
function isFederatedProfile(profileData) {
  return /(google\.com|apple\.com)/.test(String((profileData && profileData.authProvider) || ""));
}

/**
 * REGRA DO DONO (jul/2026): a conta FEDERADA (Google/Apple) sempre vence.
 * Entre duas federadas — ou duas não-federadas — vence a MAIS ANTIGA (regra v3.0.57).
 *
 * Não é preferência, é limite do Firebase: manter a "mais antiga" quando ela é phone e a
 * nova é Google apaga o login que a pessoa usa. O e-mail migra pro sobrevivente, mas o
 * provider google.com some, e "Entrar com Google" bate em
 * auth/account-exists-with-different-credential (o projeto usa uma conta por e-mail).
 * O resolveMergedLogin não cobre: ele exige logar na conta com mergedInto, já deletada.
 *
 * Caso real (Mônica Rossi): phone de 31/mai com o perfil todo + vaga na Confra; Google de
 * 11/jun com os únicos logins recentes. Pela regra antiga ela ganharia a Confra e perderia
 * a entrada. Mantendo a federada, o phone é movido pra ela e entra pelos dois.
 *
 * @param {object} ua/ub — UserRecord do Admin SDK (precisa de providerData + metadata.creationTime)
 * @returns {{ keep: object, drop: object, reason: string }}
 */
function pickSurvivor(ua, ub) {
  const aFed = isFederated(ua), bFed = isFederated(ub);
  if (aFed !== bFed) {
    return aFed
      ? { keep: ua, drop: ub, reason: "federated" }
      : { keep: ub, drop: ua, reason: "federated" };
  }
  const tA = new Date((ua.metadata && ua.metadata.creationTime) || 0).getTime();
  const tB = new Date((ub.metadata && ub.metadata.creationTime) || 0).getTime();
  return (tA <= tB)
    ? { keep: ua, drop: ub, reason: "older" }
    : { keep: ub, drop: ua, reason: "older" };
}

module.exports = { FEDERATED, isFederated, isFederatedProfile, pickSurvivor };
