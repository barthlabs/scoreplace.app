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
function _uidsDe(lista) {
  var out = [], vistos = Object.create(null);
  _arr(lista).forEach(function (p) {
    var u = p && typeof p === 'object' ? (p.uid || p.p1Uid || p.p2Uid) : null;
    if (u && !vistos[u]) { vistos[u] = 1; out.push(String(u)); }
    if (p && typeof p === 'object' && Array.isArray(p.participants)) {
      p.participants.forEach(function (s) {
        var su = s && s.uid;
        if (su && !vistos[su]) { vistos[su] = 1; out.push(String(su)); }
      });
    }
  });
  return out;
}

// progresso: quantos jogos já têm resultado, de quantos existem. É o que o cartão
// desenha hoje via `_getTournamentProgress(t)` — que varre rounds/groups/matches.
function _progresso(t) {
  var total = 0, feitos = 0;
  function conta(m) {
    if (!m || m.bye) return;
    total++;
    if (m.winner || m.draw || m.scoreP1 != null || (Array.isArray(m.sets) && m.sets.length)) feitos++;
  }
  _arr(t.matches).forEach(conta);
  _arr(t.rounds).forEach(function (r) { _arr(r && r.matches).forEach(conta); });
  _arr(t.groups).forEach(function (g) { _arr(g && g.matches).forEach(conta); });
  _arr(t.phases).forEach(function (f) {
    _arr(f && f.rounds).forEach(function (r) { _arr(r && r.matches).forEach(conta); });
    _arr(f && f.groups).forEach(function (g) { _arr(g && g.matches).forEach(conta); });
  });
  return { total: total, feitos: feitos, pct: total ? Math.round(feitos * 100 / total) : 0 };
}

/**
 * Constrói o resumo de um torneio. PURO: mesma entrada, mesma saída.
 * @param {object} t documento completo de `tournaments/{id}`
 * @param {string} id id do documento
 * @returns {object|null}
 */
function buildSummary(t, id) {
  if (!t || typeof t !== 'object') return null;
  var nome = String(t.name || '').trim();
  var local = String(t.venueName || t.venue || '').trim();
  var esporte = String(t.sport || '').trim();
  var prog = _progresso(t);
  var participantes = _arr(t.participants);

  return {
    id: String(id || t.id || ''),

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
    participantsCount: participantes.length,
    competitorsCount: _uidsDe(participantes).length,
    waitlistCount: _arr(t.waitlist).length,
    standbyCount: _arr(t.standbyParticipants).length,
    matchesTotal: prog.total,
    matchesDone: prog.feitos,
    progressPct: prog.pct,
    hasDraw: !!(prog.total > 0),

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
function summaryMudou(antes, depois, id) {
  var a = buildSummary(antes, id);
  var b = buildSummary(depois, id);
  if (!a && !b) return false;
  if (!a || !b) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}

module.exports = { buildSummary: buildSummary, summaryMudou: summaryMudou, CAMPOS_QUE_IMPORTAM: CAMPOS_QUE_IMPORTAM };
