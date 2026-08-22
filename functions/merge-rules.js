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
 * ⚠️ SUPERADA em 04/ago/2026 por pickSurvivorByActivity ("a mais ATIVA vence") — NÃO usar em
 * código novo. Continua aqui, testada, porque documenta POR QUE a federada vencia: era
 * contorno de um limite (provedor morria com a conta) que caiu quando o merge passou a
 * TRANSFERIR o provedor (planProviderTransfer) e a ABSORVER o perfil. Se um dia o
 * providerToLink deixar de funcionar, é esta a regra pra qual voltar.
 *
 * REGRA ANTIGA (jul/2026): a conta FEDERADA (Google/Apple) sempre vence.
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

/**
 * Completude do perfil — SÓ o desempate final, quando federação e idade empatam.
 * Nome real > telefone-como-nome, e-mail real, cidade, nascimento, gênero, esportes.
 */
function profileScore(data) {
  let s = 0;
  const name = (data && (data.displayName || data.name)) || "";
  if (name && !/^\+?[0-9\s\-()]{7,}$/.test(name)) s += 10; // nome de gente, não telefone
  if (data.email && !data.email.includes("privaterelay"))   s += 5;
  if (data.city)                                             s += 2;
  if (data.birthDate)                                        s += 2;
  if (data.gender)                                           s += 1;
  if (Array.isArray(data.preferredSports) && data.preferredSports.length) s += 1;
  if (data.photoURL && data.photoURL.startsWith("https://firebasestorage")) s += 1;
  return s;
}

/**
 * Idade da conta em ms. O Auth é a fonte da verdade: `metadata.creationTime` existe
 * SEMPRE que a conta existe, e é o MESMO critério do pickSurvivor — os dois pontos de
 * decisão do merge têm que concordar. O `createdAt` do perfil é só fallback (Auth já
 * apagado, emulador): ele pode faltar OU mentir — o doc pode ter sido criado/backfillado
 * meses depois da conta, e foi um perfil sem createdAt que fez a conta de junho perder
 * pra de julho no incidente de 02/ago/2026 ([[project-automerge-trigger-footgun]]).
 * Retorna null quando não há idade confiável em lado nenhum.
 */
function accountAgeMs(profileData, authUser) {
  const ct = authUser && authUser.metadata && authUser.metadata.creationTime;
  if (ct) {
    const t = new Date(ct).getTime();
    if (!isNaN(t)) return t;
  }
  const c = profileData && profileData.createdAt;
  if (c == null) return null;
  const t = c.toMillis ? c.toMillis()
    : (typeof c === "string" ? new Date(c).getTime() : Number(c));
  return isNaN(t) ? null : t;
}

/**
 * Federação com o Auth como verdade: `providerData` real quando o UserRecord está
 * disponível; o `authProvider` gravado no doc é só fallback (pode estar stale).
 * Nota deliberada: conta criada com e-mail+senha usando endereço @gmail.com tem
 * provider `password` e NÃO é federada — e isso é o comportamento CERTO pela regra
 * do dono (v1.2.6): "federada vence" existe porque provedor federado não se transfere
 * entre uids; e-mail/senha se move via admin.auth().updateUser(), então não há login
 * a proteger.
 */
function isFederatedAccount(profileData, authUser) {
  if (authUser) return isFederated(authUser);
  return isFederatedProfile(profileData);
}

/**
 * ⚠️ SUPERADA por pickSurvivorByActivity (04/ago/2026) — mantida testada pelo mesmo motivo.
 *
 * Decisão do AUTO-MERGE (espelho do pickSurvivor, mas partindo dos DOCS de perfil):
 * federada vence → mais antiga vence → idade conhecida vence ausente → perfil mais
 * completo. Cada lado é { data, authUser } — `data` é o users/{uid} e `authUser` o
 * UserRecord do Admin SDK (ou null se o lookup falhou).
 * Retorna { keep: "a"|"b", reason }.
 */
function pickSurvivorProfiles(a, b) {
  const fa = isFederatedAccount(a.data, a.authUser);
  const fb = isFederatedAccount(b.data, b.authUser);
  if (fa !== fb) return { keep: fa ? "a" : "b", reason: "federated" };
  const ta = accountAgeMs(a.data, a.authUser);
  const tb = accountAgeMs(b.data, b.authUser);
  if (ta != null && tb != null && ta !== tb) {
    return { keep: ta < tb ? "a" : "b", reason: "older" };
  }
  if (ta != null && tb == null) return { keep: "a", reason: "only-known-age" };
  if (tb != null && ta == null) return { keep: "b", reason: "only-known-age" };
  return {
    keep: profileScore(a.data) >= profileScore(b.data) ? "a" : "b",
    reason: "score",
  };
}

/**
 * Quais provedores FEDERADOS do drop dá pra levar pro sobrevivente antes de apagá-lo.
 *
 * O Admin SDK move e-mail e telefone (updateUser), mas por muito tempo o provedor federado
 * era tratado como intransferível — é daí que vem a regra "a federada sempre vence": apagar
 * a conta Google apagava o login que a pessoa usa. Só que `updateUser` aceita
 * `providerToLink`, então o federado PODE ser transferido: basta o `uid` do provedor (o
 * "sub", que vem em providerData[i].uid) lido ANTES do deleteUser.
 *
 * LIMITE REAL, e é o que sobra da regra antiga: uma conta tem no máximo UMA instância por
 * providerId. Se o sobrevivente já tem google.com, o google.com do drop não entra — nesse
 * caso aquele login morre mesmo, e quem cobre é `loginRedirects` (entrar por ele cai no
 * sobrevivente). Foi o caso medido na base: as duplicatas de homônimo eram 2 contas Google.
 *
 * @param keepProviders/dropProviders — providerData (Admin SDK) de cada conta
 * @returns [{ providerId, uid }] — só o que o Auth aceita linkar, sem duplicar providerId
 */
function planProviderTransfer(keepProviders, dropProviders) {
  const jaTem = new Set(
    (keepProviders || []).map((p) => p && p.providerId).filter(Boolean)
  );
  const out = [];
  (dropProviders || []).forEach((p) => {
    if (!p || !p.providerId || !p.uid) return;
    if (!FEDERATED.test(p.providerId)) return; // phone/password o updateUser já move
    if (jaTem.has(p.providerId)) return;       // 1 instância por provedor — este login morre
    if (out.some((x) => x.providerId === p.providerId)) return;
    // Só providerId + uid: passar email aqui pode colidir com outra conta e derrubar o link.
    out.push({ providerId: p.providerId, uid: p.uid });
  });
  return out;
}

// ─── v1.7.13 — A CONTA MAIS ATIVA VENCE ──────────────────────────────────────
// Decisão do dono (04/ago/2026): "poderia ser sempre a mais ativa vence (com mais interação,
// torneios, jogos e dados de perfil) recebendo os dados da outra. nada se perde."
//
// POR QUE ISSO PÔDE MUDAR: "a federada sempre vence" (v1.2.6) não era preferência — era
// contorno de um limite técnico. Provedor federado morria com a conta, então manter a
// não-federada apagava o "Entrar com Google" da pessoa. Esse limite CAIU: o merge agora
// transfere o provedor (providerToLink, v1.7.11) e absorve o perfil (v1.7.11), então o
// critério de sobrevivência parou de decidir quem PERDE dados — decide só qual uid e qual
// nome ficam. O que sobra do limite antigo é 2 contas do MESMO provedor (não cabem no mesmo
// uid): ali um login morre de qualquer jeito, e quem cobre é loginRedirects — o que torna a
// escolha entre elas indiferente por esse critério.
//
// BÔNUS TÉCNICO: manter a mais ativa é também manter quem tem MAIS dados espalhados, então o
// uid-sweep reescreve MENOS — menos superfície de erro no merge.
//
// HIERARQUIA, não soma ponderada: torneios → jogos → perfil → idade. Pesos inventados
// ("torneio vale 10, jogo vale 3") seriam número tirado do nada e impossível de explicar
// quando alguém perguntar por que uma conta venceu. Comparação em ordem é determinística e
// o log diz qual degrau decidiu.
const ACTIVITY_STEPS = ['tournaments', 'games', 'profile'];

/**
 * Sinais de atividade de uma conta. `tournamentCount` vem de fora (é I/O) e pode ser null
 * quando a consulta falhou — nesse caso o degrau é PULADO em vez de contar como zero, senão
 * um erro de query decidiria quem morre.
 */
function activitySignals(profileData, tournamentCount) {
  const d = profileData || {};
  return {
    tournaments: (tournamentCount == null) ? null : Number(tournamentCount),
    games: Array.isArray(d.matchHistory) ? d.matchHistory.length : 0,
    profile: profileScore(d),
  };
}

/**
 * A mais ATIVA vence; empate total desempata pela mais ANTIGA (regra anterior preservada
 * como último critério) e, sem idade confiável, pelo uid — arbitrário mas estável, pra que
 * os dois pontos de decisão do merge nunca escolham contas diferentes pra mesma dupla.
 *
 * Cada lado: { data, authUser, tournamentCount }.
 * @returns { keep: 'a'|'b', reason, detail }
 */
function pickSurvivorByActivity(a, b, aUid, bUid) {
  const sa = activitySignals(a && a.data, a && a.tournamentCount);
  const sb = activitySignals(b && b.data, b && b.tournamentCount);
  for (const step of ACTIVITY_STEPS) {
    const va = sa[step], vb = sb[step];
    if (va == null || vb == null) continue;   // sinal desconhecido não decide
    if (va !== vb) {
      return { keep: (va > vb) ? 'a' : 'b', reason: 'activity:' + step,
               detail: step + ' ' + va + ' x ' + vb };
    }
  }
  const ta = accountAgeMs(a && a.data, a && a.authUser);
  const tb = accountAgeMs(b && b.data, b && b.authUser);
  if (ta != null && tb != null && ta !== tb) {
    return { keep: (ta < tb) ? 'a' : 'b', reason: 'older', detail: 'atividade empatada' };
  }
  if (ta != null && tb == null) return { keep: 'a', reason: 'only-known-age', detail: 'atividade empatada' };
  if (tb != null && ta == null) return { keep: 'b', reason: 'only-known-age', detail: 'atividade empatada' };
  return { keep: (String(aUid || '') > String(bUid || '')) ? 'a' : 'b',
           reason: 'uid-tiebreak', detail: 'atividade e idade empatadas' };
}

module.exports = {
  FEDERATED, isFederated, isFederatedProfile, pickSurvivor,
  profileScore, accountAgeMs, isFederatedAccount, pickSurvivorProfiles,
  planProviderTransfer,
  ACTIVITY_STEPS, activitySignals, pickSurvivorByActivity,
};

/**
 * PROVA DE QUE SÃO A MESMA PESSOA — porta ÚNICA de toda fusão AUTOMÁTICA.
 *
 * Regra do dono (11/ago/2026): _"tem que autenticar email ou celular. sempre autenticado.
 * nada disso de ser frouxo."_ Só o AUTH prova: `phoneNumber` só existe depois de SMS
 * conferido e o e-mail precisa de `emailVerified`. Campo `phone`/`email` do PERFIL é texto
 * DIGITADO — não prova nada.
 *
 * POR QUE ISTO VIROU MÓDULO (incidente 19/ago/2026, Confra): o endurecimento de 11/ago
 * entrou SÓ no `autoMergeOnProfileUpdate`. A varredura diária `scheduledAutoMergeCleanup`
 * (`_scanAndMergeByField`) continuou fundindo pelo campo digitado — e às 04:45 de 19/ago
 * fundiu DUAS PESSOAS DIFERENTES: Marjorie Cilone (nasc. 1954) e Ana Carolina Cilone
 * (nasc. 1981), e-mails distintos, que tinham cadastrado o MESMO celular no perfil (mãe e
 * filha dividem o número). A conta da filha foi apagada do Auth, o e-mail dela virou
 * `loginRedirects` pra conta da mãe, e o uid-sweep colocou a mãe em DOIS grupos do torneio.
 * Duas portas pra mesma ação, uma trancada e a outra não: o defeito é a duplicação, então a
 * regra passa a morar aqui e os dois chamadores passam por ela.
 *
 * O erro é ASSIMÉTRICO e é o que define o default: duplicata não fundida é incômodo
 * reversível (o fluxo interativo pergunta e resolve); fusão errada apaga uma conta do Auth
 * e não tem volta. Na dúvida, NÃO funde.
 *
 * @param {object|null} authA/authB — UserRecord do Admin SDK (null quando o Auth já sumiu)
 * @returns {{ proven: boolean, by: 'phone'|'email'|null }}
 */
function credentialsProveSamePerson(authA, authB) {
  const _dup = require("./duplicate-person-core");
  const t1 = authA && authA.phoneNumber, t2 = authB && authB.phoneNumber;
  if (t1 && t2 && _dup.normalizarTelefone(t1) === _dup.normalizarTelefone(t2)) {
    return { proven: true, by: "phone" };
  }
  const m1 = authA && authA.emailVerified && _dup.normalizarEmail(authA.email);
  const m2 = authB && authB.emailVerified && _dup.normalizarEmail(authB.email);
  if (m1 && m2 && m1 === m2) return { proven: true, by: "email" };
  return { proven: false, by: null };
}

module.exports.credentialsProveSamePerson = credentialsProveSamePerson;

/**
 * "NÃO SOMOS A MESMA PESSOA" — o dispensado BLOQUEIA fusão AUTOMÁTICA.
 *
 * INCIDENTE (Confra, ago/2026): o app detectou a suspeita, PERGUNTOU, e em 18/ago às 20:01
 * (BRT) alguém respondeu que não eram a mesma pessoa — ficou gravado nos DOIS perfis:
 *   dupDismissedInfo: [{ uid: <a outra>, motivo: 'celular', forca: 9, at: … }]
 * Cinco horas e quarenta e quatro minutos depois, às 04:45, a varredura diária fundiu as
 * duas assim mesmo. O `dupDismissed`/`dupDismissedInfo` era lido SÓ pela DETECÇÃO (pra não
 * repetir a pergunta) — nenhum caminho de fusão o consultava.
 *
 * Por que bloqueia mesmo quando há credencial: automático nunca passa por cima de um "não"
 * explícito de gente. Quem pode fundir um par dispensado é o fluxo INTERATIVO, onde a pessoa
 * prova posse e decide na hora — lá é ação deliberada, aqui é um cron às 4 da manhã.
 *
 * Basta UM dos lados ter dispensado o outro: o "não" de qualquer um vale pelos dois.
 *
 * @param {object} dataA/dataB — docs de perfil (users/{uid})
 * @param {string} uidA/uidB
 * @returns {{ dismissed: boolean, by: string|null }}
 */
function dismissalBlocksMerge(dataA, dataB, uidA, uidB) {
  const dispensou = (data, outroUid) => {
    if (!data || !outroUid) return false;
    const lista = [].concat(
      Array.isArray(data.dupDismissedInfo) ? data.dupDismissedInfo : [],
      Array.isArray(data.dupDismissed) ? data.dupDismissed : []);
    return Object.prototype.hasOwnProperty.call(
      require("./duplicate-person-core").mapaDeDispensados(lista), outroUid);
  };
  if (dispensou(dataA, uidB)) return { dismissed: true, by: uidA || 'a' };
  if (dispensou(dataB, uidA)) return { dismissed: true, by: uidB || 'b' };
  return { dismissed: false, by: null };
}

/**
 * PORTA ÚNICA, decisão completa: este par pode ser fundido AUTOMATICAMENTE?
 * Duas condições, e as duas nasceram de incidente real:
 *   1. credencial AUTENTICADA dos dois lados (senão funde por texto digitado);
 *   2. ninguém dispensou o outro (senão o cron passa por cima do "não" de uma pessoa).
 */
function mayAutoMerge(a, b) {
  const dis = dismissalBlocksMerge(a && a.data, b && b.data, a && a.uid, b && b.uid);
  if (dis.dismissed) return { allowed: false, by: null, reason: 'dispensado' };
  const prova = credentialsProveSamePerson(a && a.auth, b && b.auth);
  if (!prova.proven) return { allowed: false, by: null, reason: 'sem-credencial-autenticada' };
  return { allowed: true, by: prova.by, reason: null };
}

module.exports.dismissalBlocksMerge = dismissalBlocksMerge;
module.exports.mayAutoMerge = mayAutoMerge;
