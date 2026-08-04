// Varredura de torneios ABANDONADOS — entrega do que `abandon-core` decide.
// Extraída da CF pra ser testável (o código que roda em prod é ESTE), igual reminder-run.
//
// O que faz, por torneio não encerrado:
//   • lê os placares (subcoleção `results`) e monta { comPlacar, primeiro, ultimo };
//   • pergunta ao núcleo o que fazer;
//   • 'avisar'   → notifica o ORGANIZADOR (e co-hosts) 48h antes, uma única vez;
//   • 'encerrar' → grava status finished + `autoClosed`, e avisa que dá pra reabrir;
//   • 'foraDaVitrine' → NÃO escreve nada. Sumir da descoberta é decisão de LEITURA, feita no
//     cliente: é reversível, não toca no torneio de ninguém e não inventa um "encerrado".
//
// `autoClosed: true` é o que diz ao app inteiro que este encerramento é automático e que a
// CLASSIFICAÇÃO NÃO FOI FECHADA (sem pódio, sem troféu, sem título) — regra do dono:
// _"encerrar não deve fechar a classificação"_.
const _core = require("./abandon-core");

function _uidsDoDono(t) {
  var out = [];
  function add(u) { if (u && out.indexOf(String(u)) === -1) out.push(String(u)); }
  add(t.creatorUid);
  add(t.organizerUid);
  (Array.isArray(t.coHosts) ? t.coHosts : []).forEach(function (c) {
    if (c && c.status === 'accepted') add(c.uid);
  });
  (Array.isArray(t.adminUids) ? t.adminUids : []).forEach(add);
  return out;
}

async function _placaresDe(db, tId) {
  var out = { comPlacar: 0, primeiro: null, ultimo: null };
  var snap;
  try { snap = await db.collection("tournaments").doc(tId).collection("results").get(); }
  catch (e) { console.warn("[abandono] results de", tId, e && e.message); return out; }
  snap.forEach(function (d) {
    var r = d.data() || {};
    if (r.scoreP1 == null || r.scoreP2 == null) return;   // sem placar não é jogo jogado
    out.comPlacar++;
    var ms = _core.msDe(r.resultAt) || _core.msDe(r.updatedAt);
    if (!ms) return;
    if (!out.primeiro || ms < out.primeiro) out.primeiro = ms;
    if (!out.ultimo || ms > out.ultimo) out.ultimo = ms;
  });
  return out;
}

async function _notificar(db, uids, tId, t, tipo, msg, nowMs) {
  var enviadas = 0;
  var notifId = function (uid) {
    return [tipo, tId, uid].join("|").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
  };
  for (var i = 0; i < uids.length; i++) {
    var uid = uids[i];
    try {
      var ps = await db.collection("users").doc(uid).get();
      if (!ps.exists) continue;
      var profile = ps.data() || {};
      // Aviso de encerramento do PRÓPRIO torneio é fundamental — só quem desligou tudo
      // (notifyPlatform === false) não recebe.
      if (profile.notifyPlatform === false) continue;
      await db.collection("users").doc(uid).collection("notifications").doc(notifId(uid)).set({
        type: tipo, fromUid: "system", fromName: "scoreplace.app", fromPhoto: "",
        tournamentId: tId, tournamentName: t.name || "", message: msg, level: "fundamental",
        createdAt: new Date(nowMs).toISOString(), read: false,
      });
      enviadas++;
    } catch (e) { console.warn("[abandono] notif uid", uid, e && e.message); }
  }
  return enviadas;
}

async function runAbandonSweep(db, nowMs) {
  var snap;
  try { snap = await db.collection("tournaments").get(); }
  catch (e) { console.error("[abandono] query falhou:", e && e.message); return { erro: e && e.message }; }

  var avisados = 0, encerrados = 0, foraDaVitrine = 0, notifs = 0;
  for (var i = 0; i < snap.docs.length; i++) {
    var doc = snap.docs[i];
    var t = doc.data() || {};
    if (t.status === "finished") continue;
    if (t.isSandbox === true) continue;

    var placares = await _placaresDe(db, doc.id);
    var r = _core.computeAbandon(t, placares, nowMs);

    if (r.acao === "foraDaVitrine") { foraDaVitrine++; continue; }   // leitura, não escrita
    if (r.acao === "nada") continue;

    var donos = _uidsDoDono(t);

    if (r.acao === "avisar") {
      if (t.autoCloseWarnedAt) continue;                              // avisa UMA vez
      var msgA = _core.mensagemAviso(t.name, r.dueAt);
      notifs += await _notificar(db, donos, doc.id, t, "tournament_auto_close_warning", msgA, nowMs);
      try {
        await doc.ref.update({
          autoCloseWarnedAt: new Date(nowMs).toISOString(),
          autoCloseDueAt: new Date(r.dueAt).toISOString(),
        });
        avisados++;
      } catch (e) { console.error("[abandono] marcar aviso", doc.id, e && e.message); }
      continue;
    }

    if (r.acao === "encerrar") {
      try {
        await doc.ref.update({
          status: "finished",
          autoClosed: true,                       // encerrado SEM fechar a classificação
          autoClosedAt: new Date(nowMs).toISOString(),
          autoCloseReason: r.motivo || "",
        });
        encerrados++;
      } catch (e) { console.error("[abandono] encerrar", doc.id, e && e.message); continue; }
      notifs += await _notificar(db, donos, doc.id, t, "tournament_auto_closed",
        _core.mensagemEncerrado(t.name), nowMs);
    }
  }
  console.log("[abandono] varridos=" + snap.size + " avisados=" + avisados +
              " encerrados=" + encerrados + " foraDaVitrine=" + foraDaVitrine + " notifs=" + notifs);
  return { varridos: snap.size, avisados: avisados, encerrados: encerrados,
           foraDaVitrine: foraDaVitrine, notifs: notifs };
}

module.exports = { runAbandonSweep, _uidsDoDono: _uidsDoDono };
