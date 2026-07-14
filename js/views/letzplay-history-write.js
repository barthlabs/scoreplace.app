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
  async function gravar(imp, meHandle) {
    var M = window._spLzModel;
    var db = window.FirestoreDB && (window.FirestoreDB.db || (window.FirestoreDB.ensureDb && window.FirestoreDB.ensureDb()));
    if (!M || !db || !imp) return { ok: false, error: 'sem modelo/db' };

    var handle = meHandle || imp.handle;
    var docs = M.historyDocs(imp, handle);
    if (!docs.matches.length) {
      // skipped > 0 aqui = import ANTIGO (sem id de competição, de antes da captura por
      // referência). Não é erro do usuário nem do banco: é dado velho, e uma re-varredura
      // com a extensão atual resolve. Reportado, nunca silencioso.
      return { ok: true, comps: 0, matches: 0, skipped: docs.skipped };
    }

    var agora = new Date().toISOString();
    var arrayUnion = window.firebase.firestore.FieldValue.arrayUnion;
    var ops = [];

    docs.comps.forEach(function (c) {
      ops.push({ ref: db.collection('letzplayTournaments').doc(c.compId),
        data: Object.assign({}, c, { updatedAt: agora, seenFrom: arrayUnion(handle) }) });
    });
    docs.matches.forEach(function (m) {
      ops.push({ ref: db.collection('letzplayTournaments').doc(m.comp).collection('matches').doc(m.gid),
        data: Object.assign({}, m, { updatedAt: agora, seenFrom: arrayUnion(handle) }) });
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
    var matches = snap.docs.map(function (d) { return d.data(); });
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
