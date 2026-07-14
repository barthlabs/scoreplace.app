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
  // DATA DE CALENDÁRIO NÃO É INSTANTE. "07/08/25" é um dia, não um ponto no tempo — o
  // letzplay não diz em que fuso o jogo foi jogado, e o app roda em 172 países. Guardar
  // como timestamp é lossy por construção: o fuso de QUEM LÊ passa a alterar o dado.
  //   • meia-noite UTC → no Brasil (UTC-3) vira 21h do dia ANTERIOR: 07/08 vira "06 de ago";
  //   • meio-dia UTC  → conserta as Américas e a Europa, mas em Auckland (UTC+13) vira o
  //     dia SEGUINTE. Não existe hora "segura" — qualquer instante quebra em algum fuso.
  // Então guardamos o NÚMERO do calendário (20250807): ordena igual, não tem fuso, e o
  // render monta a data LOCAL a partir dos componentes (ver dateParts) — a data que o
  // jogador vê é sempre a data em que ele jogou, em qualquer lugar do mundo.
  function dateNum(raw) {
    var k = dateKey(raw);
    return k ? +k : null;
  }
  // Componentes pra montar a data LOCAL no render: new Date(y, m-1, d) — nunca UTC,
  // nunca parse de string (que reintroduz fuso).
  function dateParts(n) {
    var s = String(n || '');
    if (!/^\d{8}$/.test(s)) return null;
    return { y: +s.slice(0, 4), m: +s.slice(4, 6), d: +s.slice(6, 8) };
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
  // Pareia handle↔nome ANTES de ordenar. Ordenar os handles e os nomes em listas
  // separadas desalinha os dois (o nome do jogador X acaba no slot do Y) — o handle é a
  // identidade, o nome é só exibição, e eles não podem se soltar um do outro.
  function _pares(hs, ns) {
    return (hs || []).map(function (h, i) { return { h: _low(h), n: _s((ns || [])[i]) }; })
      .filter(function (x) { return x.h; })
      .sort(function (a, b) { return a.h < b.h ? -1 : (a.h > b.h ? 1 : 0); });
  }
  function _teams(g, meHandle) {
    var me = _low(meHandle || (g && g.meHandle));
    // O import cru não traz o nome do PRÓPRIO dono no jogo (ele é o "eu"); fica vazio e o
    // render resolve pelo handle — que é o que o app já faz pra todo mundo.
    var meus = _pares([me, g && g.partnerHandle], ['', g && g.partnerName]);
    var deles = _pares((g && g.oppHandles) || [], (g && g.oppNames) || []);
    var A = { handles: meus.map(function (p) { return p.h; }), names: meus.map(function (p) { return p.n; }), score: _num(g && g.myScore) };
    var B = { handles: deles.map(function (p) { return p.h; }), names: deles.map(function (p) { return p.n; }), score: _num(g && g.oppScore) };
    // Ordem canônica dos TIMES: pelo 1º handle. Sem isto, "A vs B" e "B vs A" (o mesmo
    // jogo visto dos dois lados) gerariam ids diferentes.
    var inverte = (B.handles[0] || '') < (A.handles[0] || '');
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
    return _docId([club, dateKey(g && g.date), times, placares].join('|'));
  }
  // O gid VIRA id de documento no Firestore, que proíbe '/' e o padrão '__x__', e limita
  // a 1500 bytes. Um handle com barra derrubaria a escrita inteira; o corte protege de
  // um caso patológico (chave gigante) sem afetar nada real (~80 chars no pior caso
  // medido). Mantemos a chave LEGÍVEL de propósito — foi lendo o id cru que a divergência
  // de compId apareceu; um hash opaco teria escondido.
  function _docId(s) {
    var out = String(s).replace(/\//g, '_');
    if (/^__.*__$/.test(out)) out = 'x' + out;
    return out.length > 1400 ? out.slice(0, 1400) : out;
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
      dateNum: dateNum(g && g.date),
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

  // A partida SABE a que competição pertence? Só o id do letzplay serve. Sem ele, o
  // compId cai num balde de categoria ("paineiras-bt__cmista-d") que junta ANOS de
  // rankings diferentes — um torneio que não existe.
  function hasRealComp(g) {
    return !!((g && g.tourneyId != null && _s(g.tourneyId)) || (g && g.rankingId != null && _s(g.rankingId)));
  }

  // Converte um letzplayImport CRU (perspectiva de meHandle) nos docs canônicos.
  //
  // REGRA DURA: partida sem id de competição NÃO é gravável. Motivo: o doc da partida
  // pendura no doc da competição, então o CAMINHO depende do compId — e é justamente o
  // campo cuja captura variou por versão (o autoimport do Rodrigo, 14/jul 04:13, tem
  // 81/81; o scan da Kelly, 13/jul 14:05, tem 0/152, porque a captura por referência só
  // entrou às 00:25 de 14/jul). Gravar num balde de categoria colocaria o MESMO jogo em
  // dois caminhos diferentes conforme a idade do import — dedup furada e torneio
  // inventado. Pular e CONTAR é honesto: se algum caminho parar de capturar id, aparece
  // em `skipped` na hora, em vez de virar torneio falso em silêncio.
  function historyDocs(imp, meHandle) {
    var games = (imp && imp.games) || [];
    var me = meHandle || (imp && imp.handle);
    var comps = {}, matches = {}, skipped = 0;
    games.forEach(function (g) {
      if (!hasRealComp(g)) { skipped++; return; }
      var m = toMatchDoc(g, me);
      if (!m.dateNum || m.players.length < 2) { skipped++; return; }
      matches[m.gid] = m;                       // mesmo gid 2x no mesmo import → 1 doc
      var c = toCompDoc(g);
      var prev = comps[c.compId];
      // Melhor conhecido vence: um import que trouxe o NOME real do torneio completa o
      // doc de quem só tinha a categoria.
      comps[c.compId] = prev ? {
        compId: c.compId, club: c.club || prev.club, kind: c.kind || prev.kind,
        letzId: c.letzId != null ? c.letzId : prev.letzId,
        name: c.name || prev.name, categoryRaw: c.categoryRaw || prev.categoryRaw,
        sport: c.sport || prev.sport
      } : c;
    });
    return {
      comps: Object.keys(comps).map(function (k) { return comps[k]; }),
      matches: Object.keys(matches).map(function (k) { return matches[k]; }),
      skipped: skipped
    };
  }

  var API = {
    dateKey: dateKey, dateNum: dateNum, dateParts: dateParts,
    compId: compId, matchId: matchId, hasRealComp: hasRealComp,
    toMatchDoc: toMatchDoc, toCompDoc: toCompDoc, historyDocs: historyDocs
  };
  root._spLzModel = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
