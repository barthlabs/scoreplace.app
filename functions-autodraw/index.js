const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

// v2.3.91: lógica de sorteio REAL do cliente (Rei/Rainha, duplas, equilíbrio,
// categorias, folgas, desempate) carregada via shim Node. Substitui o stub 1×1
// antigo. vendor/ é sincronizado de js/views/* no predeploy (copy-vendor.js).
// Require defensivo: se draw-core falhar ao carregar, NÃO derruba o módulo
// (sendPushNotification continua funcionando); autoDraw apenas pula.
let generateLigaRound = null;
try {
  ({ generateLigaRound } = require('./draw-core.js'));
} catch (e) {
  console.error('[autoDraw] draw-core indisponível — autoDraw vai pular:', e && e.message);
}

initializeApp();
const db = getFirestore();

// ─── Auto-Draw: runs every hour, checks for pending draws ───────────────────
exports.autoDraw = onSchedule('every 1 hours', async (event) => {
  const now = new Date();
  const snap = await db.collection('tournaments').get();

  for (const doc of snap.docs) {
    const t = doc.data();
    const tId = doc.id;

    // Skip if not Liga/Ranking format with auto-draw
    const isLiga = t.format === 'Liga' || t.format === 'Ranking';
    if (!isLiga) continue;
    if (t.drawManual) continue;
    if (!t.drawFirstDate) continue;
    if (t.status === 'finished') continue;

    // Check participants
    const participants = Array.isArray(t.participants) ? t.participants : [];
    if (participants.length < 2) continue;

    // Calculate next draw date.
    // FIX timezone: o horário agendado (drawFirstDate + drawFirstTime) é hora
    // LOCAL do Brasil (BRT, UTC-3, sem horário de verão desde 2019). O servidor
    // roda em UTC — sem o offset, "19:00" virava 19:00 UTC = 16:00 BRT e o
    // sorteio disparava ~3h ANTES do horário programado. Anexar "-03:00"
    // interpreta corretamente como BRT.
    let _fdDate = String(t.drawFirstDate);
    let _fdTime = t.drawFirstTime || '19:00';
    if (_fdDate.indexOf('T') !== -1) {
      const _parts = _fdDate.split('T');
      _fdDate = _parts[0];
      if (_parts[1]) _fdTime = _parts[1].slice(0, 5); // HH:MM
    }
    const firstDrawStr = _fdDate + 'T' + _fdTime + ':00-03:00';
    const firstDraw = new Date(firstDrawStr);
    if (isNaN(firstDraw.getTime())) continue;

    const intervalMs = (t.drawIntervalDays || 7) * 86400000;

    // If first draw is in the future, skip
    if (firstDraw > now) continue;

    // Calculate how many intervals have passed
    const elapsed = now.getTime() - firstDraw.getTime();
    const intervalsCompleted = Math.floor(elapsed / intervalMs);
    const expectedRounds = intervalsCompleted + 1;

    const currentRounds = Array.isArray(t.rounds) ? t.rounds.length : 0;
    const currentRodadas = Array.isArray(t.rodadas) ? t.rodadas.length : 0;
    const actualRounds = Math.max(currentRounds, currentRodadas);

    // If we need more rounds, generate one
    if (actualRounds < expectedRounds) {
      console.log(`Auto-draw: generating round ${actualRounds + 1} for ${tId} (${t.name})`);

      // Se o motor de sorteio não carregou, NUNCA cair no stub antigo — pula e
      // deixa o cliente (organizador) sortear corretamente.
      if (typeof generateLigaRound !== 'function') {
        console.error(`Auto-draw: draw-core indisponível — pulando ${tId}`);
        continue;
      }

      // Horário agendado desta rodada (= base do firstDraw + intervalos completos).
      const mostRecentScheduled = new Date(firstDraw.getTime() + intervalsCompleted * intervalMs);

      try {
        // v2.3.91: usa o MESMO motor de sorteio do app (Rei/Rainha, duplas,
        // equilíbrio, categorias, folgas justas, desempate). Muta `t` in-place.
        t.id = tId;
        const res = generateLigaRound(t, mostRecentScheduled);
        if (!res.ok) {
          console.log(`Auto-draw: skip ${tId} (${res.reason})`);
          continue;
        }

        // Persiste só os campos que o sorteio mutou (evita reescrever o doc todo
        // e clobber de edições concorrentes do organizador).
        const payload = {
          rounds: t.rounds,
          status: t.status,
          lastAutoDrawAt: t.lastAutoDrawAt,
          updatedAt: t.updatedAt,
        };
        if (t.standings) payload.standings = t.standings;
        if (t.sitOutHistory) payload.sitOutHistory = t.sitOutHistory;       // fairness das folgas
        if (t.opponentHistory) payload.opponentHistory = t.opponentHistory; // anti-repeat de duplas
        if (t.drawVisibility) payload.drawVisibility = t.drawVisibility;
        await db.collection('tournaments').doc(tId).update(payload);

        console.log(`Auto-draw: round ${res.roundNumber} created with ${res.matchCount} match(es)` +
          ` [${res.firstDraw ? 'first draw' : 'next round'}] for ${tId}`);

        // Notify participants (push/in-app básico). A notificação rica/personalizada
        // (jogo específico + WhatsApp) continua saindo do cliente quando ele dispara.
        // IDENTIDADE = uid (não email). Cada participante carrega seu(s) uid(s);
        // duplas têm p1Uid/p2Uid. Notificamos TODOS os uids (espelha o
        // window._participantUids do app). uid → users/{uid} é a fonte da verdade;
        // email/celular saem do perfil, nunca o contrário.
        const activePlayers = (Array.isArray(t.participants) ? t.participants : [])
          .filter(p => p && typeof p === 'object' && p.ligaActive !== false);
        const notifiedUids = new Set();
        for (const p of activePlayers) {
          const uids = [];
          [p.uid, p.p1Uid, p.p2Uid].forEach(u => { if (u) uids.push(String(u)); });
          if (Array.isArray(p.participants)) {
            p.participants.forEach(sp => { if (sp && sp.uid) uids.push(String(sp.uid)); });
          }
          for (const uid of uids) {
            if (notifiedUids.has(uid)) continue;
            notifiedUids.add(uid);
            try {
              const userDoc = await db.collection('users').doc(uid).get();
              if (!userDoc.exists) continue;
              const profile = userDoc.data() || {};
              if (profile.notifyPlatform === false) continue;
              await db.collection('users').doc(uid).collection('notifications').add({
                type: 'draw',
                fromUid: 'system',
                fromName: 'scoreplace.app',
                fromPhoto: '',
                tournamentId: tId,
                tournamentName: t.name || '',
                message: 'Nova rodada sorteada! Confira seus jogos.',
                createdAt: now.toISOString(),
                read: false
              });
            } catch (e) {
              console.warn(`Notification error for uid ${uid}:`, e.message);
            }
          }
        }
      } catch (err) {
        // Falha no sorteio NUNCA escreve dados parciais/errados — apenas loga e
        // deixa o cliente (organizador) sortear. Defense-in-depth.
        console.error(`Auto-draw error for ${tId}:`, err);
      }
    }
  }
});

// ─── Push Notifications via FCM ─────────────────────────────────────────────
exports.sendPushNotification = onDocumentCreated('users/{userId}/notifications/{notifId}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const userId = event.params.userId;
  const notifData = snap.data();

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return;

  const userData = userDoc.data();
  const fcmToken = userData.fcmToken;
  if (!fcmToken) return;

  const message = {
    token: fcmToken,
    notification: {
      title: notifData.tournamentName || 'scoreplace.app',
      body: notifData.message || 'Você tem uma nova notificação.'
    },
    webpush: {
      fcmOptions: {
        link: notifData.tournamentId
          ? `https://scoreplace.app/#tournaments/${notifData.tournamentId}`
          : 'https://scoreplace.app/#notifications'
      },
      notification: {
        icon: 'https://scoreplace.app/icons/icon-192.svg',
        badge: 'https://scoreplace.app/icons/icon-192.svg'
      }
    }
  };

  try {
    await getMessaging().send(message);
    console.log(`Push sent to ${userId}`);
  } catch (err) {
    console.warn(`Push failed for ${userId}:`, err.message);
    if (err.code === 'messaging/invalid-registration-token' ||
        err.code === 'messaging/registration-token-not-registered') {
      await db.collection('users').doc(userId).update({ fcmToken: require('firebase-admin/firestore').FieldValue.delete() });
    }
  }
});
