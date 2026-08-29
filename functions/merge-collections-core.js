'use strict';
/*
 * merge-collections-core.js — o que a fusão precisa mover FORA do doc do usuário.
 *
 * POR QUE EXISTE (medido em ago/2026, antes de fundir Eduardo Mange e Silvia Moura Ferreira):
 * o merge cobria `tournaments` (varredura genérica de uid), `casualMatches`, `letzplayScans`
 * e o perfil. Não cobria PRESENÇAS nem NOTIFICAÇÕES. Na base real isso deixaria pra trás
 * 3 docs de presença e ~30 notificações apontando pra uid morto — a pessoa perderia o
 * histórico de avisos da conta absorvida, e o check-in dela num local viraria órfão.
 *
 * REGRA DO DONO (ago/2026): "troque também presences e notifications (como se tivessem sido
 * enviadas para o uid certo sem duplicação)". O "sem duplicação" é a parte difícil: a MESMA
 * pessoa com duas contas pode ter recebido o MESMO aviso duas vezes (um por uid). Mover às
 * cegas deixaria a caixa dela com o aviso repetido — visível e feio. Por isso a assinatura
 * de conteúdo abaixo.
 *
 * REGRA: PURO — nada de firebase/admin. Decide o QUE mover; quem grava é o index.js.
 * Espelha a filosofia do uid-sweep.js: o cânone precisa saber onde procurar o uid, pra que
 * coleção nova nasça coberta em vez de ser descoberta depois do estrago.
 */

/*
 * ═══ "SE MESCLA TUDO É TUDO SEMPRE" (regra do dono, 05/ago/2026) ═══
 *
 * As duas listas acima são de INCLUSÃO — e lista de inclusão apodrece. É a mesma lição já
 * paga três vezes neste projeto: o merge não via membro de dupla, não via mapa por uid, não
 * via `organizerId`; e a consulta de `casualMatches` mirava `creatorUid`, campo que nem
 * existe. Cada uma foi descoberta depois do estrago, porque coleção/campo novo NASCE FORA da
 * lista e ninguém percebe até alguém sumir.
 *
 * Então a varredura não pergunta mais QUAIS coleções varrer: ela pergunta ao Firestore quais
 * existem (`db.listCollections()`) e varre TODAS, exceto as que têm tratamento próprio. Isso
 * inverte o default — coleção nova já nasce coberta, e quem quiser excluí-la tem que dizer
 * aqui, explicitamente e com motivo. Mesma forma da união de PERFIL (computeProfileMerge):
 * varredura genérica + lista de exclusão.
 */
const SWEEP_EXCLUDED_COLLECTIONS = {
  // Têm tratamento PRÓPRIO na fusão — varrer de novo seria escrita dupla ou destruiria a regra
  // ⚠️ `users` NÃO está aqui de propósito: os docs do sobrevivente e do absorvido têm regra
  // própria (computeProfileMerge + tombstone) e são PULADOS um a um pelo caller — mas os docs
  // de TERCEIROS precisam ser varridos. Medido em 05/ago/2026: depois de fundir, o uid morto
  // continuava em `friends[]` do dono e em `friendRequestsSent[]` da Raquel — a amizade some
  // em silêncio. Excluir a coleção inteira era jogar fora a parte que importa.
  tournaments: 'varredura própria com a trava anti-encolhimento (_repairTournaments)',
  letzplayScans: 'regra ATÔMICA (pickLetzplayScan) — fundir campo a campo corrompe os totais',
  // Indexadas pela CREDENCIAL, não pelo uid; a própria fusão as escreve
  loginRedirects: 'chave é o e-mail/telefone; escrita por _recordLoginRedirects',
  mergeTokens: 'prova de posse, efêmera e de uso único',
  mergeProofLimits: 'rate limit por caller, efêmero',
  magicLinks: 'token de login, efêmero',
  // Filas de saída: o que está nelas já foi endereçado e some em minutos
  mail: 'fila de e-mail (extension firestore-send-email)',
  notif_email_queue: 'fila de digest de e-mail',
  // REGISTRO HISTÓRICO: reescrever falsifica o que de fato aconteceu naquele instante.
  // O log serve pra explicar um sorteio passado; trocar o uid nele faz o log MENTIR sobre
  // quem estava lá. Aqui o uid morto é a resposta certa.
  debugDrawLogs: 'log de sorteio — histórico; reescrever falsifica o registro',
  // ⛔ v2.1.48 — A AUTORIDADE DA AMIZADE TEM TRATAMENTO PRÓPRIO (_mergeAmizade no index.js).
  // O sweep genérico troca o uid DENTRO DOS CAMPOS. Aqui isso é CORRUPÇÃO garantida: o par
  // é a CHAVE DO DOCUMENTO (`pairId = menorUid__maiorUid`), não um campo. O sweep deixaria
  // `uidA = keepUid` num doc cujo id ainda diz o uid morto — o cânone mentindo sobre si
  // mesmo, e `pairId(keep, terceiro)` deixando de achar a relação que existe.
  friendships: 'a chave é o par; rekey só o _mergeAmizade sabe fazer (e resolver colisão)',
  // E esta é SUBCOLEÇÃO (`friendAccess/{uid}/accepted/{friendUid}`): o sweep genérico varre
  // documentos de topo e nem chegaria nela — ficaria projeção do uid morto concedendo
  // leitura pra sempre. Excluir aqui é explicitar que o tratamento é outro, não esquecer.
  friendAccess: 'projeção das rules; direção e subcoleção — repontada pelo _mergeAmizade',
};

/* ⛔ v2.1.48 (4ª auditoria, ponto 4B) — CAMPOS DE `users` QUE A VARREDURA NÃO TOCA.
 * O sweep genérico troca o uid dentro dos CAMPOS de todo doc. Nos quatro campos de cache
 * social isso REINVENTA amizade: ele acha lixo legado com o oldUid, troca por keepUid e
 * grava por cima do que o `amizade-lifecycle` acabou de projetar do cânone. Confiar na
 * ordem de escrita como única defesa é frágil — a exclusão é explícita.
 */
const AMIZADE_CACHE_CAMPOS = new Set([
  'friends', 'friendRequestsSent', 'friendRequestsReceived', 'friendRequestsSentAt',
]);

/** O campo de `users/{id}` pode ser reescrito pela varredura genérica de uid? */
function shouldSweepUserField(campo) {
  return !AMIZADE_CACHE_CAMPOS.has(String(campo || ''));
}

/**
 * A coleção deve entrar na varredura genérica de uid?
 * Default é SIM — é isso que faz coleção nova nascer coberta.
 */
function shouldSweepCollection(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  return !Object.prototype.hasOwnProperty.call(SWEEP_EXCLUDED_COLLECTIONS, n);
}

/**
 * Assinatura de CONTEÚDO de uma notificação — é ela que impede duplicar.
 *
 * Não usa o id do doc: o id embute o uid do destinatário E um sufixo aleatório por envio
 * (`enrollment_new_tour_123__2026-06-25_1db32xz_<uid>`), então o MESMO aviso mandado às duas
 * contas da mesma pessoa gera ids diferentes e passaria batido por comparação de id.
 * O que repete de verdade é o conteúdo: tipo + torneio + instante + texto.
 */
function notifSignature(data) {
  const d = data || {};
  return [
    String(d.type || ''),
    String(d.tournamentId || ''),
    String(d.createdAt || ''),
    String(d.message || ''),
  ].join('|');
}

/**
 * Novo id da notificação no destino. Os ids terminam com o uid do destinatário; trocar o
 * sufixo preserva o prefixo legível (tipo_torneio__data_rand) e mantém o doc identificável.
 * Id que não termina com o uid (legado/gerado pelo Firestore) recebe o sufixo — nunca
 * colide com um doc já existente do sobrevivente.
 */
function movedNotifId(oldId, dropUid, keepUid) {
  const id = String(oldId || '');
  if (dropUid && id.endsWith(dropUid)) return id.slice(0, id.length - dropUid.length) + keepUid;
  return id + '_' + keepUid;
}

/**
 * Plano de migração das notificações do drop para o keep.
 *
 * @param dropDocs  [{ id, data }] — notificações da conta absorvida
 * @param keepDocs  [{ id, data }] — as que o sobrevivente JÁ tem
 * @returns { moves: [{fromId,toId,data}], duplicates: [{id}], total }
 *
 * Duplicata NÃO é movida e é APAGADA na origem pelo caller: a conta some, e deixar o doc
 * seria órfão inalcançável. O que importa é que a pessoa continue vendo o aviso UMA vez.
 */
function planNotifMigration(dropDocs, keepDocs, dropUid, keepUid) {
  const have = new Set((keepDocs || []).map((d) => notifSignature(d && d.data)));
  const moves = [], duplicates = [];
  const seen = new Set();
  for (const d of (dropDocs || [])) {
    if (!d || !d.id) continue;
    const s = notifSignature(d.data);
    // dedup contra o destino E contra o próprio lote (a conta absorvida pode ter repetido)
    if (have.has(s) || seen.has(s)) { duplicates.push({ id: d.id }); continue; }
    seen.add(s);
    moves.push({ fromId: d.id, toId: movedNotifId(d.id, dropUid, keepUid), data: d.data });
  }
  return { moves, duplicates, total: (dropDocs || []).length };
}

module.exports = {
  SWEEP_EXCLUDED_COLLECTIONS, shouldSweepCollection,
  AMIZADE_CACHE_CAMPOS, shouldSweepUserField,
  notifSignature, movedNotifId, planNotifMigration,
};
