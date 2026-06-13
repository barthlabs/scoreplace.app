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

// v2.4.12: temporada encerrada? Espelha o cliente (tournaments.js season auto-
// closure + bracket-logic poller endDate check). Sem isto, o autoDraw gerava
// rodadas — e disparava notificações — PRA SEMPRE após o fim da temporada, se
// nenhum cliente abrisse o torneio pra marcar status='finished' (que é lazy, só
// no render). Horários em BRT (UTC-3), igual ao resto do autoDraw.
function _ligaSeasonEnded(t, now) {
  // Date-only ('2026-06-11') → interpreta como BRT (UTC-3). Se já tem 'T', usa
  // como veio (granularidade de meses torna erro de fuso irrelevante).
  function _parseBrt(s, dfltTime) {
    s = String(s);
    if (s.indexOf('T') === -1) s = s + 'T' + dfltTime + '-03:00';
    return new Date(s);
  }
  // 1) endDate explícita
  if (t.endDate) {
    const endD = _parseBrt(t.endDate, '23:59:59');
    if (!isNaN(endD.getTime()) && endD < now) return true;
  }
  // 2) ligaSeasonMonths / rankingSeasonMonths a partir de startDate
  const months = parseInt(t.ligaSeasonMonths || t.rankingSeasonMonths);
  if (months && t.startDate) {
    const start = _parseBrt(t.startDate, '00:00:00');
    if (!isNaN(start.getTime())) {
      const end = new Date(start);
      end.setMonth(end.getMonth() + months);
      if (now >= end) return true;
    }
  }
  return false;
}

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
    // v2.4.12: temporada acabou (endDate ou ligaSeasonMonths) → não gerar mais
    // rodadas nem notificações. Pra temporada ativa não muda nada.
    if (_ligaSeasonEnded(t, now)) { console.log(`Auto-draw: ${tId} — temporada encerrada, skip`); continue; }
    // v2.3.96: já há um sorteio em revisão (rede de segurança) aguardando o
    // organizador publicar/anular — não re-sortear (senão re-randomiza a cada hora).
    if (t.pendingDraw) { console.log(`Auto-draw: ${tId} tem pendingDraw em revisão — skip`); continue; }

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

    // Horário agendado da rodada atual (base do firstDraw + intervalos completos).
    const mostRecentScheduled = new Date(firstDraw.getTime() + intervalsCompleted * intervalMs);

    // v2.4.17: dedup por TIMESTAMP — espelha o cliente (bracket-logic poller).
    // Sem isto, se o organizador muda drawFirstDate/drawIntervalDays no meio da
    // temporada, o gate por CONTAGEM (actualRounds < expectedRounds) dispara uma
    // rodada POR HORA até a contagem alcançar o esperado — gerando rodadas em
    // sequência (e notificações). O cliente só dispara se ainda não sorteou pro
    // horário agendado atual; aqui igual: pula se já sorteamos pra este slot.
    // Assim a cadência fica uma rodada por intervalo, mesmo após mudar a config.
    const lastFired = t.lastAutoDrawAt ? new Date(t.lastAutoDrawAt) : null;
    if (lastFired && !isNaN(lastFired.getTime()) && lastFired >= mostRecentScheduled) {
      continue;
    }

    // If we need more rounds, generate one
    if (actualRounds < expectedRounds) {
      console.log(`Auto-draw: generating round ${actualRounds + 1} for ${tId} (${t.name})`);

      // Se o motor de sorteio não carregou, NUNCA cair no stub antigo — pula e
      // deixa o cliente (organizador) sortear corretamente.
      if (typeof generateLigaRound !== 'function') {
        console.error(`Auto-draw: draw-core indisponível — pulando ${tId}`);
        continue;
      }

      try {
        // v2.3.91: usa o MESMO motor de sorteio do app (Rei/Rainha, duplas,
        // equilíbrio, categorias, folgas justas, desempate). Muta `t` in-place.
        t.id = tId;
        const res = generateLigaRound(t, mostRecentScheduled);
        if (!res.ok) {
          console.log(`Auto-draw: skip ${tId} (${res.reason})`);
          continue;
        }

        // ── REDE DE SEGURANÇA (v2.3.96): sorteio em revisão ────────────────────
        // Se t.stagedDraw, o sorteio NÃO vai a público nem notifica. Grava SÓ em
        // `pendingDraw` — o doc público (rounds/status/standings) fica INTOCADO,
        // então participantes não veem nada. O organizador revisa no app e clica
        // "Publicar" (move pendingDraw → rounds + notifica) ou "Anular".
        if (t.stagedDraw) {
          const pendingDraw = {
            rounds: t.rounds || [],
            standings: t.standings || null,
            sitOutHistory: t.sitOutHistory || null,
            opponentHistory: t.opponentHistory || null,
            status: 'active',
            roundIndex: res.roundIndex,
            roundNumber: res.roundNumber,
            firstDraw: !!res.firstDraw,
            generatedAt: now.toISOString(),
            source: 'autoDraw',
          };
          await db.collection('tournaments').doc(tId).update({
            pendingDraw: pendingDraw,
            lastAutoDrawAt: t.lastAutoDrawAt,
            updatedAt: t.updatedAt,
          });
          console.log(`Auto-draw STAGED (review): round ${res.roundNumber} held in pendingDraw for ${tId} — no public, no notify`);
          continue; // não publica, não notifica
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

  // ⚠️ CONTRATO DATA-ONLY (NÃO REGREDIR) — ver memória notificacoes-dedup.
  // A mensagem NÃO pode conter NENHUM payload `notification` (nem top-level,
  // nem `webpush.notification`). Se contiver, o navegador exibe uma cópia
  // AUTOMÁTICA *além* da que o `sw.js onBackgroundMessage` já mostra via
  // showNotification → notificação DUPLICADA (chega 2x). Histórico: corrigido
  // em v2.1.92, regrediu quando este codebase (functions-autodraw) foi
  // re-deployado por cima do fix isolado, e voltou a duplicar em produção.
  // Tudo (title/body/link/type/tournamentId/tag) vai em `data` e o sw.js
  // renderiza a partir de `payload.data`. `tag` estável (inclui notifId) faz
  // entregas repetidas do MESMO doc (at-least-once do onCreate) colapsarem.
  const link = notifData.tournamentId
    ? `https://scoreplace.app/#tournaments/${notifData.tournamentId}`
    : 'https://scoreplace.app/#notifications';
  const tag = 'scoreplace|' + String(notifData.type || '') + '|' +
    String(notifData.tournamentId || '') + '|' + String(event.params.notifId || '');
  const message = {
    token: fcmToken,
    data: {
      title: notifData.tournamentName || 'scoreplace.app',
      body: notifData.message || 'Você tem uma nova notificação.',
      link: link,
      type: String(notifData.type || ''),
      tournamentId: String(notifData.tournamentId || ''),
      tag: tag
    },
    webpush: {
      fcmOptions: { link: link }
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
