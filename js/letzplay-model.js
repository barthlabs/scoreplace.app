/* letzplay-model.js — o modelo CANÔNICO do histórico letzplay.
 *
 * ARQUITETURA (decisão do dono, 14/jul/2026): o histórico NÃO é um doc por usuário.
 * Cada competição é um doc; cada partida é um doc pendurado nela — igual ao letzplay e
 * igual aos nossos jogos (tournaments/{id}/results/{matchId}):
 *
 *   letzplayTournaments/{compId}            ← competição (torneio OU ranking)
 *     └ matches/{gid}                       ← partida, doc próprio
 *
 * POR QUE (e por que isto é o coração, não arrumação): uma partida do letzplay tem 4
 * pessoas (dupla vs dupla). Ela vai ser importada até 4 VEZES — uma por perspectiva.
 * Se o id não for IDÊNTICO visto de qualquer lado, em vez de deduplicar a gente
 * multiplica. E, dando certo, o inverso acontece: importar UMA pessoa preenche pedaço do
 * histórico de todas as outras que jogaram com/contra ela. Medido em produção: a
 * varredura da Kelly (152 jogos) toca 112 jogadores distintos.
 *
 * PERSPECTIVA É VENENO: o import cru vem em "eu/adversário" (myScore, oppScore,
 * partnerHandle). Isso é a visão de UM jogador. O doc canônico é neutro — dois times com
 * seus placares — senão o mesmo jogo visto pela Kelly e pelo Rodrigo viraria dois docs
 * contraditórios (o placar invertido em um deles).
 *
 * Roda no app e nas Cloud Functions (sem DOM, sem Firebase). A extensão continua sendo só
 * o raspador: ela entrega o import cru, o app canonicaliza e grava — assim o modelo existe
 * em UM lugar só e não deriva entre cópias.
 */
(function (root) {
  'use strict';

  // ── normalização ─────────────────────────────────────────────────────
  function _s(v) { return String(v == null ? '' : v).trim(); }
  function _low(v) { return _s(v).toLowerCase(); }

  // Data do jogo → chave YYYYMMDD estável. O texto cru do letzplay vem sujo
  // ("Sábado, 27/06/26\n às 08:00hs ... • Areia"), mas o dd/mm/aa está sempre lá.
  // Só a DATA entra na identidade — a hora varia de exibição e não é confiável.
  function dateKey(raw) {
    var m = _s(raw).match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return '';
    var y = m[3].length === 2 ? ('20' + m[3]) : m[3];
    return y + m[2] + m[1];
  }
  function dateMs(raw) {
    var k = dateKey(raw);
    if (!k) return null;
    var t = Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));
    return isNaN(t) ? null : t;
  }

  // ── identidade da COMPETIÇÃO ─────────────────────────────────────────
  // Torneio e ranking são a mesma coisa estruturalmente (competição que contém jogos):
  // um doc só, discriminado por `kind`. O id do letzplay é único DENTRO do clube, então
  // o clube entra na chave.
  function compId(g) {
    var club = _low(g && g.club) || 'sem-clube';
    if (g && g.tourneyId != null && _s(g.tourneyId)) return club + '__t' + _s(g.tourneyId);
    if (g && g.rankingId != null && _s(g.rankingId)) return club + '__r' + _s(g.rankingId);
    // Sem id do letzplay (dado antigo): cai na categoria. Pior chave, mas estável —
    // melhor agrupar por categoria que espalhar cada jogo numa competição órfã.
    return club + '__c' + _low(g && g.competition).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // ── times, sem perspectiva ───────────────────────────────────────────
  // Entrada: um jogo CRU do import (visão de `meHandle`). Saída: os dois times já
  // canônicos — cada um com handles ordenados, e os times ordenados entre si pelo
  // primeiro handle. Ordenar é o que faz Kelly e Rodrigo produzirem o MESMO doc.
  function _teams(g, meHandle) {
    var me = _low(meHandle || (g && g.meHandle));
    var meus = [me, _low(g && g.partnerHandle)].filter(Boolean).sort();
    var deles = ((g && g.oppHandles) || []).map(_low).filter(Boolean).sort();
    var nomesMeus = [];   // nome de exibição, casado por posição só quando dá
    var nomesDeles = ((g && g.oppNames) || []).map(_s).filter(Boolean);
    var A = { handles: meus, names: nomesMeus, score: _num(g && g.myScore) };
    var B = { handles: deles, names: nomesDeles, score: _num(g && g.oppScore) };
    // Ordem canônica dos TIMES: pelo 1º handle. Sem isto, "A vs B" e "B vs A" (o mesmo
    // jogo visto dos dois lados) gerariam ids diferentes.
    var inverte = (deles[0] || '') < (meus[0] || '');
    return inverte ? [B, A] : [A, B];
  }
  function _num(v) { return (typeof v === 'number' && !isNaN(v)) ? v : null; }

  // ── identidade da PARTIDA ────────────────────────────────────────────
  // Uma partida é QUEM jogou + QUANDO + o PLACAR. Só isso. Chave de CONTEÚDO porque o
  // import cru só tem `idx` (posição na lista), que DESLOCA quando entra jogo novo.
  //
  // A COMPETIÇÃO FICA DE FORA — DE PROPÓSITO, e isto custou uma versão errada pra
  // aprender. A identidade não pode depender de um campo cuja CAPTURA varia: o
  // `tourneyId` só passou a ser extraído na extensão de 14/jul, então o mesmo jogo
  // (Rodrigo+Kelly na Seletiva de mistas PPP, 07/08/25) tinha `tourneyId=297385` no
  // import dele e `undefined` no scan dela — mesmo time, mesma data, mesmo placar, e
  // dois ids diferentes. Ou seja: re-varrer com uma extensão mais nova DUPLICARIA os
  // jogos em vez de deduplicar — exatamente o que este modelo existe pra impedir.
  // A competição é ATRIBUTO (mesclado pelo melhor conhecido), nunca identidade.
  //
  //   • hora fora: varia de exibição;
  //   • placar DENTRO: dois registros iguais em tudo menos placar são jogos diferentes;
  //     com o placar na chave não colidem, sem ele um sobrescreveria o outro em silêncio;
  //   • clube DENTRO: é capturado de forma estável nos dois caminhos e evita que jogos
  //     de clubes diferentes no mesmo dia se cruzem;
  //   • o mesmo jogo visto de qualquer lado dá a MESMA chave — é o objetivo.
  function matchId(g, meHandle) {
    var t = _teams(g, meHandle);
    var placares = t.map(function (x) { return x.score == null ? '' : x.score; }).join('-');
    var times = t.map(function (x) { return x.handles.join(','); }).join('~');
    var club = _low(g && g.club) || 'sem-clube';
    return [club, dateKey(g && g.date), times, placares].join('|');
  }

  // Doc canônico da PARTIDA — neutro de perspectiva.
  // `players` existe pra query: o histórico de alguém é
  // collectionGroup('matches').where('players','array-contains', handle) — o mesmo padrão
  // que `results` já usa pra ler os jogos de um uid sem carregar o torneio.
  function toMatchDoc(g, meHandle) {
    var t = _teams(g, meHandle);
    var players = t[0].handles.concat(t[1].handles);
    var vencedor = null;
    if (t[0].score != null && t[1].score != null && t[0].score !== t[1].score) {
      vencedor = (t[0].score > t[1].score) ? 0 : 1;
    }
    return {
      gid: matchId(g, meHandle),
      comp: compId(g),
      club: _low(g && g.club) || null,
      kind: (g && g.kind) || ((g && g.official) ? 'tournament' : 'ranking'),
      sport: (g && g.sport) || null,
      date: _s(g && g.date) || null,
      dateMs: dateMs(g && g.date),
      round: (g && g.round != null) ? g.round : null,
      teams: t,
      winner: vencedor,
      players: players
    };
  }

  // Doc canônico da COMPETIÇÃO (o "torneio" onde as partidas penduram).
  function toCompDoc(g) {
    return {
      compId: compId(g),
      club: _low(g && g.club) || null,
      kind: (g && g.kind) || ((g && g.official) ? 'tournament' : 'ranking'),
      letzId: (g && (g.tourneyId != null ? g.tourneyId : g.rankingId)) || null,
      name: _s(g && g.tourneyName) || null,
      categoryRaw: _s(g && g.competition) || null,
      sport: (g && g.sport) || null
    };
  }

  var API = {
    dateKey: dateKey, dateMs: dateMs,
    compId: compId, matchId: matchId,
    toMatchDoc: toMatchDoc, toCompDoc: toCompDoc
  };
  root._spLzModel = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
