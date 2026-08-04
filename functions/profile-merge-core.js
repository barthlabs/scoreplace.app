// scoreplace.app — UNIÃO DOS DADOS DE PERFIL NO MERGE (módulo puro, sem side effects)
//
// Por que existe: até 04/ago/2026 o merge movia torneios, matchHistory e partidas casuais
// — e NADA do perfil. Medido: `_executeMerge` copiava ZERO campos (city, birthDate, gender,
// skillBySport, photoURL, preferredSports, linkedEmails…). Quando a conta que sobrevivia
// tinha perfil pobre, os dados da outra evaporavam. Caso real na base: Silvia Moura Ferreira,
// conta `password` com 44 campos × conta Apple (e-mail oculto) com 17 — pela regra de
// sobrevivência a Apple vence, e os 44 campos morriam com a outra.
//
// É por isso que existia um desempate por "perfil mais completo": era MITIGAÇÃO da perda,
// não preferência. Copiando o perfil, esse desempate deixa de carregar peso.
//
// VARREDURA GENÉRICA, não lista campo a campo: a lista branca apodrece (campo novo no perfil
// nasceria fora dela e voltaria a se perder em silêncio) — mesma lição do _repairTournaments,
// que listava campos e sempre ficava incompleto até virar varredura canônica. Aqui a lista é
// de EXCLUSÃO: tudo que não está nela é preservado por padrão.

// Nunca copiar do drop para o sobrevivente:
const NUNCA_COPIAR = new Set([
  // Prova de merge — o servidor TRATA como prova (resolveMergedLogin devolve custom token).
  'mergedInto', 'mergedAt',
  // Assinatura Pro: só o webhook do Stripe concede (campo privilegiado nas rules).
  'plan', 'planExpiresAt',
  // O sobrevivente mantém o NOME dele — é a identidade que fica, e nome único entre uids
  // é invariante do app. Trocar aqui renomearia a pessoa pelas costas.
  'displayName', 'displayName_lower',
  // Credenciais: quem move e-mail/telefone é o fluxo do Auth (admin.auth().updateUser),
  // que depois reflete no perfil. Copiar aqui gravaria credencial que o Auth não tem.
  'email', 'email_lower', 'phone', 'phoneCountry',
  // A idade do sobrevivente é dele — e é critério de decisão de merge; mexer aqui
  // envenenaria merges futuros.
  'createdAt',
  // Controle e device.
  'updatedAt', 'fcmToken', 'fcmTokenUpdatedAt', 'uid',
  // Já tratado no _executeMerge, com dedup por matchId.
  'matchHistory',
]);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function sameItem(a, b) {
  if (isPlainObject(a) || isPlainObject(b) || Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  return a === b;
}
/** vazio = ausente, null, string em branco. `false` e `0` são VALORES (não vazios). */
function isEmpty(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/**
 * O que gravar no perfil do sobrevivente para não perder nada do drop.
 *
 * Regras, nesta ordem:
 *   - campo na lista de exclusão            → ignora
 *   - valor vazio no drop                   → ignora (não apaga o que o keep tem)
 *   - ARRAY                                 → união, preservando a ordem do keep
 *   - OBJETO raso (ex.: skillBySport)       → merge por chave, o KEEP vence
 *   - escalar                               → só preenche quando o keep está VAZIO
 *
 * O sobrevivente NUNCA perde um valor vivo: em conflito, o dado dele prevalece. É de
 * propósito — ele é a conta que a pessoa está usando, e sobrescrever seria "corrigir"
 * o presente com o passado.
 *
 * @param keepData/dropData — docs users/{uid}
 * @param keepUid — para não deixar o sobrevivente amigo de si mesmo
 * @returns objeto só com os campos a gravar (vazio = nada a fazer)
 */
function computeProfileMerge(keepData, dropData, keepUid) {
  const keep = keepData || {}, drop = dropData || {};
  const upd = {};
  Object.keys(drop).forEach(function (k) {
    if (NUNCA_COPIAR.has(k)) return;
    const dv = drop[k], kv = keep[k];
    if (isEmpty(dv)) return;

    if (Array.isArray(dv)) {
      const base = Array.isArray(kv) ? kv : [];
      const out = base.slice();
      dv.forEach(function (item) {
        if (isEmpty(item)) return;
        // o uid do próprio sobrevivente nunca entra numa lista dele (auto-amizade)
        if (keepUid && item === keepUid) return;
        if (!out.some(function (y) { return sameItem(y, item); })) out.push(item);
      });
      if (out.length !== base.length) upd[k] = out;
      return;
    }

    if (isPlainObject(dv)) {
      const base = isPlainObject(kv) ? kv : {};
      const out = Object.assign({}, dv, base); // keep por último = keep vence
      if (JSON.stringify(out) !== JSON.stringify(base)) upd[k] = out;
      return;
    }

    if (isEmpty(kv)) upd[k] = dv;
  });
  return upd;
}

module.exports = { NUNCA_COPIAR, computeProfileMerge, isEmpty, isPlainObject, sameItem };
