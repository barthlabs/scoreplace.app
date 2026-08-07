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

/**
 * LETZPLAY é ATÔMICO — escolhe um doc INTEIRO, nunca funde.
 *
 * Achado num ensaio contra 2 docs REAIS de `letzplayScans` (04/ago/2026): reusar a regra de
 * perfil aqui alteraria `scan`, `fullImport` e `totaisLetzplay` do sobrevivente, porque são
 * OBJETOS e a regra de perfil funde objeto por chave. Pra `skillBySport` isso é certo (juntar
 * modalidades); pra uma LEITURA do letzplay é errado: o doc é o retrato coerente de uma
 * importação — cursor, totais e jogos combinam entre si. Misturar duas leituras produz totais
 * que não batem com os jogos, e o app trata esses números como verdade.
 *
 * Então: fica a leitura mais RECENTE (é a que reflete o letzplay de hoje); sem data
 * confiável, a que tem mais jogos; e nada é fundido campo a campo.
 * @returns 'keep' | 'drop' — qual doc INTEIRO deve permanecer
 */
function pickLetzplayScan(keepData, dropData) {
  if (!dropData) return 'keep';
  if (!keepData) return 'drop';
  const ts = (d) => {
    const v = d && (d.scannedAt || d.updatedAt);
    if (v == null) return null;
    const t = v.toMillis ? v.toMillis() : (typeof v === 'string' ? Date.parse(v) : Number(v));
    return isNaN(t) ? null : t;
  };
  const tk = ts(keepData), td = ts(dropData);
  if (tk != null && td != null && tk !== td) return (td > tk) ? 'drop' : 'keep';
  const jogos = (d) => {
    const t = d && d.totaisLetzplay;
    if (t && typeof t === 'object') {
      for (const k of ['jogos', 'games', 'partidas', 'total']) {
        if (typeof t[k] === 'number') return t[k];
      }
    }
    return Array.isArray(d && d.scan) ? d.scan.length : 0;
  };
  return (jogos(dropData) > jogos(keepData)) ? 'drop' : 'keep';
}

/**
 * O IDENTIFICADOR DA CONTA ABSORVIDA VIRA VÍNCULO DO SOBREVIVENTE.
 *
 * Buraco MEDIDO na fusão da Fabiana Bastos Vieira (07/ago/2026): depois de fundir, o
 * `linkedEmails` do sobrevivente continuou `undefined` e o e-mail da conta absorvida
 * (`fabiana@sialdrill.com.br`) só existia em `loginRedirects`. Os dois servem a coisas
 * DIFERENTES e por isso um não cobre o outro:
 *   • `loginRedirects` responde "quem tentar ENTRAR por este e-mail é fulano" — é o caminho
 *     de sessão, e só é lido no login.
 *   • `linkedEmails` responde "este e-mail TAMBÉM é do fulano" — é o que `_uidByProfileEmail`
 *     consulta pra achar a pessoa, e o que a fila de e-mail usa pra alcançar o endereço
 *     antigo. Sem ele, a pessoa deixa de receber no endereço pelo qual ela se cadastrou.
 *
 * Por que `computeProfileMerge` não pega isso: o e-mail primário do drop mora em
 * `dropData.email`, que está em NUNCA_COPIAR de propósito (o e-mail do sobrevivente é dele e
 * não pode ser sobrescrito). A varredura genérica une `linkedEmails` × `linkedEmails` — e
 * ambos estavam vazios. O dado a preservar não era um array, era o campo escalar.
 *
 * ⚠️ Esta regra JÁ EXISTIA, inline, dentro de `mergePhoneAccount` (index.js, o ramo do
 * `surv.linkedEmails`). Eram duas versões da mesma decisão e só uma rodava no caminho comum
 * — exatamente o drift que este projeto já pagou caro. Agora é UMA função, e os dois
 * caminhos chamam ela.
 *
 * Idempotente: chamar de novo com o mesmo identificador não duplica nem devolve update.
 * Devolve SÓ o que mudou (`{}` = nada a gravar).
 *
 * @param {Object} keepData  perfil do sobrevivente (como está no banco)
 * @param {string} dropEmail e-mail REAL da conta absorvida (sintético é descartado aqui)
 * @param {string} dropPhone telefone E.164 da conta absorvida
 * @returns {Object} subconjunto de {linkedEmails, linkedPhones} a gravar
 */
function computeLinkedIdentifiers(keepData, dropEmail, dropPhone) {
  const keep = keepData || {};
  const upd = {};

  // E-mail sintético de conta de celular NUNCA é identidade — não vira vínculo.
  const em = String(dropEmail || '').trim().toLowerCase();
  if (em && !/@phone\.scoreplace\.app$/i.test(em)) {
    const proprio = String(keep.email || '').trim().toLowerCase();
    if (em !== proprio) {
      const base = Array.isArray(keep.linkedEmails) ? keep.linkedEmails : [];
      // dedup case-insensitive: o array pode ter vindo com o e-mail em outra caixa
      const jaTem = base.some(function (e) { return String(e || '').trim().toLowerCase() === em; });
      if (!jaTem) upd.linkedEmails = base.concat([em]);
    }
  }

  const ph = String(dropPhone || '').trim();
  if (ph) {
    const proprioPh = String(keep.phone || '').trim();
    if (ph !== proprioPh) {
      const baseP = Array.isArray(keep.linkedPhones) ? keep.linkedPhones : [];
      if (baseP.indexOf(ph) === -1) upd.linkedPhones = baseP.concat([ph]);
    }
  }

  return upd;
}

module.exports = {
  NUNCA_COPIAR, computeProfileMerge, isEmpty, isPlainObject, sameItem,
  pickLetzplayScan, computeLinkedIdentifiers,
};
