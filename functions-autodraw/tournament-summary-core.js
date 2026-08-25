/* RESUMO DO TORNEIO — o documento leve que a TELA INICIAL passa a ler.
 *
 * POR QUE EXISTE (25/ago/2026, decisão do dono):
 *   _"na dashboard precisamos da versão reduzida sempre e clicando no torneio traz
 *   os detalhes. esse sempre foi o desenho."_
 * E a implementação tinha derivado disso: hoje a tela inicial baixa o documento
 * INTEIRO de cada torneio — chave, inscritos, placares, histórico — só pra desenhar
 * um cartão com nome, data e local. MEDIDO na base real:
 *     documento médio 12 KB · maior 174 KB (o Confra)
 *     pesos internos: rounds 72KB · participants 61KB · history 36KB
 *                     logoData 35KB · matches 27KB · standings 13KB
 *     ~30 torneios ⇒ ~360 KB baixados E re-analisados a cada abertura e a cada
 *     eco do servidor.
 * E o cartão ainda RECALCULA por torneio (`_computeStandings` roda dentro dele):
 * medido, 1,5ms por torneio — ~210ms no celular com 28 torneios, a cada desenho.
 *
 * O RESUMO CARREGA O QUE O CARTÃO CONSOME, JÁ CALCULADO. É por isso que ele tem
 * contagens e progresso em vez de `participants`/`rounds`/`matches`: o servidor
 * calcula UMA vez por mudança, em vez de cada aparelho recalcular a cada desenho.
 *
 * ⛔ NUNCA carregar base64 aqui (`logoData`, `coverPhotoData`): são 35 KB e mais
 *    por documento e matariam o propósito. Só URL. Há teste travando isso.
 * ⛔ O resumo é DERIVADO — nunca fonte da verdade. Quem manda é `tournaments/{id}`;
 *    se divergir, o resumo se corrige na próxima escrita (é regenerado inteiro).
 *
 * Este arquivo é PURO (sem firebase-admin) pra poder ser testado no `npm test`.
 */

// ── busca: nome normalizado + palavras ────────────────────────────────────────
// Firestore não tem busca textual. Com `nameLower` dá pra fazer prefixo
// (`>= termo` / `<= termo + ''`) e com `tokens` dá pra casar palavra solta
// via `array-contains`. Serve à escala de hoje e pode ser trocado por um serviço
// de busca sem mudar o formato do resumo.
function _semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function _tokens(partes) {
  var texto = _semAcento(partes.filter(Boolean).join(' ')).toLowerCase();
  var brutos = texto.split(/[^a-z0-9]+/);
  var vistos = Object.create(null);
  var out = [];
  for (var i = 0; i < brutos.length; i++) {
    var p = brutos[i];
    if (p.length < 2) continue;          // "de", "e", "a" não ajudam a achar nada
    if (vistos[p]) continue;
    vistos[p] = 1;
    out.push(p);
    if (out.length >= 40) break;         // teto: token demais engorda o resumo
  }
  return out;
}

function _arr(x) { return Array.isArray(x) ? x : []; }


// ⛔ AQUI NÃO SE REIMPLEMENTA REGRA. Os derivados (progresso, competidores, espera)
// vêm das MESMAS funções que a tela usa, injetadas em `H`. MEDIDO em 25/ago/2026:
// a primeira versão deste arquivo calculava por conta própria e DIVERGIA do app em
// 10 dos 28 torneios da base real — Confra 143 competidores contra 146, "Misto
// FUTVOLEI" com progresso 0/7 contra 12/19. Número errado no cartão é pior que
// cartão lento, e é exatamente a armadilha da "segunda versão da regra" que este
// projeto já pagou caro. Sem `H`, os campos derivados saem NULL — nunca chutados.
/**
 * Constrói o resumo de um torneio. PURO: mesma entrada, mesma saída.
 * @param {object} t documento completo de `tournaments/{id}`
 * @param {string} id id do documento
 * @returns {object|null}
 */
function buildSummary(t, id, H) {
  if (!t || typeof t !== 'object') return null;
  H = H || {};
  var prog = (typeof H.progress === 'function') ? (H.progress(t) || null) : null;
  var comp = (typeof H.competitors === 'function') ? (H.competitors(t) || null) : null;
  var espera = (typeof H.waitlistPeople === 'function') ? H.waitlistPeople(t) : null;
  var nome = String(t.name || '').trim();
  var local = String(t.venueName || t.venue || '').trim();
  var esporte = String(t.sport || '').trim();
  var participantes = _arr(t.participants);

  return {
    id: String(id || t.id || ''),

    // ── ⭐ O QUE O CARTÃO AINDA PEDIA DO DOCUMENTO INTEIRO (2.0.90) ──────────
    // MEDIDO: dos 33 campos que `renderTournamentCard` lê, 20 já estavam aqui.
    // Estes fecham a conta e são o que permite a LISTA parar de baixar o torneio
    // completo — 236 KB do Confra pra desenhar duas linhas.
    // ⛔ `_resumo` é a MARCA: quem precisa do torneio de verdade (a tela de
    // detalhe) reconhece por ela e vai buscar o documento completo.
    _resumo: true,
    categories: _arr(t.categories).map(function (c) { return String(c || ''); }),
    organizerEmail: String(t.organizerEmail || ''),
    venuePhotoUrl: String(t.venuePhotoUrl || ''),
    finishNotifiedAt: t.finishNotifiedAt || null,
    // co-organizadores ATIVOS, com o mesmo formato que o cartão espera
    coHosts: _arr(t.coHosts).filter(function (c) { return c && c.status === 'active'; })
      .map(function (c) { return { uid: String(c.uid || ''), status: 'active' }; }),
    // "estou inscrito?" / "estou na espera?" — o cartão decide o botão com isso.
    // ⛔ uids, nunca nomes: identidade é uid neste app.
    participantUids: _arr(t.participants).map(function (p) {
      return String((p && (p.uid || p.p1Uid)) || '');
    }).filter(Boolean),
    standbyUids: _arr(t.standbyParticipants).concat(_arr(t.waitlist)).map(function (p) {
      return String((p && (p.uid || p.p1Uid)) || '');
    }).filter(Boolean),
    // enquetes: vão INTEIRAS. MEDIDO: zero torneios em produção têm enquete, e o
    // cartão desenha os detalhes dela — resumir seria fazer a enquete sumir da tela
    // por economia de zero byte.
    polls: _arr(t.polls),

    // ── identidade e exibição ──────────────────────────────────────────────
    name: nome,
    sport: esporte,
    format: String(t.format || ''),
    status: String(t.status || ''),
    isPublic: t.isPublic === true,
    isSandbox: t.isSandbox === true,
    venueName: local,
    venuePlaceId: String(t.venuePlaceId || ''),
    startDate: t.startDate || null,
    endDate: t.endDate || null,
    createdAt: t.createdAt || null,
    updatedAt: t.updatedAt || null,
    finishedAt: t.finishedAt || null,
    autoClosed: t.autoClosed === true,
    tournamentStarted: t.tournamentStarted === true,

    // ── quem manda / quem está dentro (é o que responde "meus torneios") ───
    creatorUid: String(t.creatorUid || ''),
    coHostUids: _arr(t.coHosts).map(function (c) {
      return String((c && (c.uid || c)) || '');
    }).filter(Boolean),
    memberUids: _arr(t.memberUids).map(String),

    // ── configuração que o cartão mostra ──────────────────────────────────
    enrollmentMode: String(t.enrollmentMode || ''),
    lateEnrollment: t.lateEnrollment || null,
    registrationLimit: (t.registrationLimit != null) ? t.registrationLimit : null,
    ligaSeasonMonths: (t.ligaSeasonMonths != null) ? t.ligaSeasonMonths : null,
    rankingSeasonMonths: (t.rankingSeasonMonths != null) ? t.rankingSeasonMonths : null,
    combinedCategories: t.combinedCategories === true,
    categoryNames: _arr(t.categories).map(function (c) {
      return String((c && (c.name || c.label || c)) || '');
    }).filter(Boolean).slice(0, 24),

    // ── CONTAGENS E PROGRESSO: o cálculo sai do aparelho e vem pra cá ─────
    // contagens CRUAS (não são regra: é tamanho de lista)
    participantsCount: participantes.length,
    standbyCount: _arr(t.standbyParticipants).length,
    // ── DERIVADOS: vêm das funções do APP (H). Sem elas, NULL — nunca chute ──
    competitorsCount: comp ? comp.people : null,   // _countCompetitors(t).people
    teamsCount: comp ? comp.teams : null,          // _countCompetitors(t).teams
    waitlistCount: (espera != null) ? espera : null, // _waitlistPeopleCount(t)
    matchesTotal: prog ? prog.total : null,        // _getTournamentProgress(t).total
    matchesDone: prog ? prog.completed : null,
    progressPct: prog ? prog.pct : null,
    hasDraw: prog ? (prog.total > 0) : null,

    // ── mídia: SÓ URL. ⛔ jamais logoData/coverPhotoData (base64) ──────────
    coverUrl: String(t.coverUrl || ''),
    logoUrl: String(t.logoUrl || ''),

    // ── busca no SERVIDOR (hoje ela só acha o que já está na tela) ─────────
    nameLower: _semAcento(nome).toLowerCase(),
    tokens: _tokens([nome, local, esporte])
  };
}

/** Os campos do documento completo que MUDAM o resumo. Fora daqui, não regrava. */
var CAMPOS_QUE_IMPORTAM = [
  'name', 'sport', 'format', 'status', 'isPublic', 'isSandbox', 'venueName', 'venue',
  'venuePlaceId', 'startDate', 'endDate', 'createdAt', 'updatedAt', 'finishedAt',
  'autoClosed', 'tournamentStarted', 'creatorUid', 'coHosts', 'memberUids',
  'enrollmentMode', 'lateEnrollment', 'registrationLimit', 'ligaSeasonMonths',
  'rankingSeasonMonths', 'combinedCategories', 'categories', 'participants',
  'waitlist', 'standbyParticipants', 'matches', 'rounds', 'groups', 'phases',
  'coverUrl', 'logoUrl'
];

/**
 * O resumo mudou entre duas versões do documento? Evita regravar o resumo a cada
 * placar/mexida que não altera nada do que a tela inicial mostra — sem isto, um
 * torneio ao vivo geraria escrita a cada ponto.
 */
function summaryMudou(antes, depois, id, H) {
  var a = buildSummary(antes, id, H);
  var b = buildSummary(depois, id, H);
  if (!a && !b) return false;
  if (!a || !b) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** Monta `H` a partir do `window` do shim (servidor) ou do navegador (teste).
 *  ⛔ Se alguma função faltar, o campo correspondente sai NULL — de propósito. */
function helpersDe(win) {
  win = win || (typeof window !== 'undefined' ? window : null) || {};
  var H = {};
  if (typeof win._getTournamentProgress === 'function') H.progress = function (t) { return win._getTournamentProgress(t); };
  if (typeof win._countCompetitors === 'function') H.competitors = function (t) { return win._countCompetitors(t); };
  if (typeof win._waitlistPeopleCount === 'function') H.waitlistPeople = function (t) { return win._waitlistPeopleCount(t); };
  return H;
}

module.exports = { buildSummary: buildSummary, summaryMudou: summaryMudou, helpersDe: helpersDe, CAMPOS_QUE_IMPORTAM: CAMPOS_QUE_IMPORTAM };
