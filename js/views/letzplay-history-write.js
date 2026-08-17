/* letzplay-history-write.js — grava o histórico letzplay no formato canônico:
 *   letzplayTournaments/{compId}            ← competição
 *     └ matches/{gid}                       ← partida (doc próprio)
 *
 * Quem chama: o autoimport (letzplay-bridge) e o scan do organizador
 * (tournaments-enrollment-report). A EXTENSÃO continua sendo só o raspador — ela entrega
 * o import cru e a conversão mora aqui, num lugar só, pra não derivar entre cópias.
 *
 * O modelo (js/letzplay-model.js) já garante que o mesmo jogo visto de qualquer um dos 4
 * jogadores produz o MESMO gid e o MESMO doc. Aqui só resta gravar sem estourar limite e
 * sem apagar o que outra perspectiva já trouxe.
 */
(function () {
  'use strict';

  var LIMITE_BATCH = 400;   // teto do Firestore é 500 operações; folga pra não raspar nele

  // Grava as competições e as partidas. `merge: true` em tudo: a mesma partida chega por
  // até 4 caminhos (um por jogador) e a competição por vários — a última escrita não pode
  // apagar o que a anterior sabia. `seenFrom` (arrayUnion) registra por quem passou, que é
  // a procedência e também o sinal de quanto do clube já foi coberto.
  // `games` (opcional) = gravar SÓ estas partidas em vez de todas as de `imp`. É o que faz
  // uma leitura longa ser viável: a extensão manda um parcial a cada torneio e a cada 3
  // páginas, e antes cada parcial regravava o histórico INTEIRO — num perfil de 472 jogos
  // isso dava 46 parciais × 472 partidas = 24.656 escritas de documento por leitura, o que
  // sozinho travava a aba. Com o delta, um parcial custa o que acabou de ser lido.
  async function gravar(imp, meHandle, games) {
    var M = window._spLzModel;
    var db = window.FirestoreDB && (window.FirestoreDB.db || (window.FirestoreDB.ensureDb && window.FirestoreDB.ensureDb()));
    if (!M || !db || !imp) return { ok: false, error: 'sem modelo/db' };

    var handle = meHandle || imp.handle;
    var fonte = Array.isArray(games) ? { games: games, handle: imp.handle } : imp;
    var docs = M.historyDocs(fonte, handle);
    if (!docs.matches.length) {
      // skipped > 0 aqui = import ANTIGO (sem id de competição, de antes da captura por
      // referência). Não é erro do usuário nem do banco: é dado velho, e uma re-varredura
      // com a extensão atual resolve. Reportado, nunca silencioso.
      return { ok: true, comps: 0, matches: 0, skipped: docs.skipped };
    }

    var agora = new Date().toISOString();
    var arrayUnion = window.firebase.firestore.FieldValue.arrayUnion;
    var ops = [];

    // NOME e CLASSIFICAÇÃO vêm do footprint e são gravados no doc da COMPETIÇÃO — o lugar
    // certo pra eles. Eram carregados só dentro do `letzplayImport` de cada pessoa, que é
    // um doc que cresce com o atleta e tem teto de 1MiB; aqui cada competição é um doc
    // próprio e o acervo não tem teto. Merge, então quem trouxer a informação primeiro
    // completa o doc pra todos.
    var extra = {};
    ((imp && imp.footprint) || []).forEach(function (f) {
      var id = M.compId({ club: f.club, tourneyId: f.tourneyId, rankingId: f.rankingId, competition: f.categoryRaw });
      var e = {};
      if (f.name && f.name !== f.categoryRaw) e.name = f.name;
      if (f.logo) e.logo = f.logo;
      if (Array.isArray(f.standings) && f.standings.length) e.standings = f.standings;
      if (f.year != null) e.year = f.year;
      if (Object.keys(e).length) extra[id] = e;
    });

    // CAMPO NULO NÃO É INFORMAÇÃO — e com `merge: true` ele APAGA. A mesma partida chega
    // por até 4 perspectivas e a mesma competição por várias, cada uma sabendo um pedaço:
    // quem chegasse depois sem o nome do torneio (ou sem a rodada, ou sem o vencedor)
    // zerava o que a anterior tinha trazido. Omitir o que não se sabe é o que faz o merge
    // realmente somar conhecimento em vez de embaralhá-lo.
    function semNulos(o) {
      var out = {};
      Object.keys(o).forEach(function (k) { if (o[k] != null) out[k] = o[k]; });
      return out;
    }

    docs.comps.forEach(function (c) {
      ops.push({ ref: db.collection('letzplayTournaments').doc(c.compId),
        data: Object.assign(semNulos(c), extra[c.compId] || {}, { updatedAt: agora, seenFrom: arrayUnion(handle) }) });
    });
    docs.matches.forEach(function (m) {
      ops.push({ ref: db.collection('letzplayTournaments').doc(m.comp).collection('matches').doc(m.gid),
        data: Object.assign(semNulos(m), { updatedAt: agora, seenFrom: arrayUnion(handle) }) });
    });

    for (var i = 0; i < ops.length; i += LIMITE_BATCH) {
      var lote = db.batch();
      ops.slice(i, i + LIMITE_BATCH).forEach(function (o) { lote.set(o.ref, o.data, { merge: true }); });
      await lote.commit();
    }
    window._log && window._log('[lz história]', handle, '→', docs.comps.length, 'competições,',
      docs.matches.length, 'partidas' + (docs.skipped ? (', ' + docs.skipped + ' puladas (import antigo, sem id)') : ''));
    return { ok: true, comps: docs.comps.length, matches: docs.matches.length, skipped: docs.skipped };
  }

  // Histórico de uma pessoa, do formato canônico. É a razão de o jogo ser doc próprio:
  // uma query só, sem carregar torneio — mesmo padrão de `results` (playerUids).
  //
  // O orderBy NÃO é enfeite: `array-contains` sozinho exigiria uma isenção de índice de
  // campo à parte, então a leitura canônica SEMPRE ordena. Com ele, basta o composto
  // matches(players CONTAINS, dateNum DESC) — ver firestore.indexes.json. Sem índice o
  // Firestore RECUSA a query (não devolve vazio), então falha aqui é barulhenta.
  //
  // Devolve { matches, comps } — as competições vêm junto porque o doc da partida guarda
  // só a REFERÊNCIA (comp), nunca o nome repetido em cada jogo. São ~7 gets pra 81 jogos.
  async function ler(handle, limite) {
    var db = window.FirestoreDB && (window.FirestoreDB.db || (window.FirestoreDB.ensureDb && window.FirestoreDB.ensureDb()));
    if (!db || !handle) return { matches: [], comps: {} };
    var snap = await db.collectionGroup('matches')
      .where('players', 'array-contains', String(handle).toLowerCase())
      .orderBy('dateNum', 'desc')
      .limit(limite || 500)
      .get();
    // Cura do tiebreak colado (ver window._lzPlacarReal): o doc canônico guarda
    // teams[].score e o `vencedor` derivado — os dois saem errados no dado antigo.
    var matches = snap.docs.map(function (d) {
      var m = d.data();
      return (typeof window._lzCuraMatchCanon === 'function') ? window._lzCuraMatchCanon(m) : m;
    });
    var ids = {};
    matches.forEach(function (m) { if (m.comp) ids[m.comp] = 1; });
    var keys = Object.keys(ids);
    var comps = {};
    var docs = await Promise.all(keys.map(function (k) {
      return db.collection('letzplayTournaments').doc(k).get().catch(function () { return null; });
    }));
    docs.forEach(function (d) { if (d && d.exists) comps[d.id] = d.data(); });
    return { matches: matches, comps: comps };
  }

  window._lzHistoryWrite = gravar;
  window._lzHistoryRead = ler;
})();
