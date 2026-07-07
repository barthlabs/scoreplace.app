const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

// v2.3.91: lógica de sorteio REAL do cliente (Rei/Rainha, duplas, equilíbrio,
// categorias, folgas, desempate) carregada via shim Node. Substitui o stub 1×1
// antigo. vendor/ é sincronizado de js/views/* no predeploy (copy-vendor.js).
// Require defensivo: se draw-core falhar ao carregar, NÃO derruba o módulo
// (sendPushNotification continua funcionando); autoDraw apenas pula.
let generateLigaRound = null;
let drawWindow = null; // window do shim Node — expõe _calcNextDrawDate (prazo p/ lançar resultado)
try {
  const _dc = require('./draw-core.js');
  generateLigaRound = _dc.generateLigaRound;
  drawWindow = _dc._window;
} catch (e) {
  console.error('[autoDraw] draw-core indisponível — autoDraw vai pular:', e && e.message);
}

initializeApp();
const db = getFirestore();

// Kill-switch de notificações no staging (ver functions/index.js). No projeto de
// staging, push (FCM) NÃO é enviado — pra simular torneios com inscritos reais
// sem disparar nada. Em prod IS_STAGING é false → comportamento idêntico.
const IS_STAGING = String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '').indexOf('staging') !== -1;

// v2.4.12: temporada encerrada? Espelha o cliente (tournaments.js season auto-
// closure + bracket-logic poller endDate check). Sem isto, o autoDraw gerava
// rodadas — e disparava notificações — PRA SEMPRE após o fim da temporada, se
// nenhum cliente abrisse o torneio pra marcar status='finished' (que é lazy, só
// no render). Horários em BRT (UTC-3), igual ao resto do autoDraw.
function _ligaSeasonEnded(t, now) {
  // Date-only ('2026-06-11') → fim do dia BRT (23:59:59). Com 'T' → hora exata
  // informada, também em BRT. v2.4.75: antes, quando endDate já tinha 'T' o
  // offset -03:00 NÃO era anexado e o servidor (UTC) lia como UTC → 3h de skew
  // (endDate '2026-06-13T19:59' virava 16:59 BRT). Espelha _ligaSeasonEndMs do
  // cliente (tournaments-utils.js).
  function _parseBrt(s, dfltTime) {
    s = String(s);
    if (s.indexOf('T') === -1) s = s + 'T' + dfltTime;
    if (!/[+-]\d\d:?\d\d$/.test(s) && s.indexOf('Z') === -1) s = s + '-03:00';
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
// v2.6.74: sorteio NA HORA + custo baixo. Cadência de 1 minuto, mas em vez de
// varrer a coleção inteira a cada tick, consulta só os torneios com `nextDrawAt`
// (ms do slot devido — ver _nextOwedDrawMs) <= agora. Quando nada está vencendo,
// a query devolve ~0 docs → leituras quase nulas. O dedup por lastAutoDrawAt
// (abaixo) e os checks em memória continuam como autoridade/rede de segurança.
// `nextDrawAt` é mantido por: saveTournament (cliente, todo save), este autoDraw
// (após sortear) e autoDrawReconcile (varredura 30min — backfill de docs legados
// sem o campo + cura de drift). Sem o reconciliador, docs sem nextDrawAt seriam
// excluídos da range query (Firestore ignora docs com campo ausente).
exports.autoDraw = onSchedule('every 1 minutes', async (event) => {
  const now = new Date();
  const snap = await db.collection('tournaments').where('nextDrawAt', '<=', now.getTime()).get();

  for (const doc of snap.docs) {
    const t = doc.data();
    const tId = doc.id;

    // v3.1.14 (brick 4 etapa 4): Liga incremental "Pontos Corridos rodada a rodada" de
    // FASE POSTERIOR tem agenda PRÓPRIA por fase. Num multi-fase t.format NÃO é 'Liga' →
    // o filtro isLiga abaixo pularia; trata ANTES, à parte. nextDrawAt (computado pelo
    // mesmo _nextOwedDrawMs, agora ciente da fase) já filtrou esses docs na query.
    if (drawWindow && typeof drawWindow._isIncrementalLigaPhase === 'function' &&
        drawWindow._isIncrementalLigaPhase(t)) {
      if (t.pendingDraw || t.stagedDraw) { console.log(`Auto-draw phase: ${tId} em revisão — skip`); continue; }
      try { t.id = tId; await _autoDrawIncrementalPhaseRound(t, tId, now); }
      catch (err) { console.error(`Auto-draw phase error for ${tId}:`, err); }
      continue;
    }

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

    // v3.x: construtor de fases — auto-draw para no fim da Fase 0 classificatória
    // e NUNCA roda em fase de chave (avanço de fase é manual). Helper self-contained
    // no vendor tournaments-utils (drawWindow). Single-phase → false (sem efeito).
    if (drawWindow && typeof drawWindow._suppressAutoDrawForPhases === 'function' &&
        drawWindow._suppressAutoDrawForPhases(t)) {
      console.log(`Auto-draw: skip ${tId} — fase classificatória completa ou em fase de chave (avanço manual)`);
      continue;
    }

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

    // v2.6.55: intervalo < 1 = SEM repetição → exatamente 1 rodada (1 sorteio único),
    // mesmo com a temporada/término ainda aberta. Espelha _calcNextDrawDate do cliente.
    const _interval = parseInt(t.drawIntervalDays, 10);
    const _noRepeat = !_interval || _interval < 1;
    const intervalMs = (_noRepeat ? 7 : _interval) * 86400000;

    // If first draw is in the future, skip
    if (firstDraw > now) continue;

    // Calculate how many intervals have passed
    const elapsed = now.getTime() - firstDraw.getTime();
    const intervalsCompleted = _noRepeat ? 0 : Math.floor(elapsed / intervalMs);
    const expectedRounds = _noRepeat ? 1 : (intervalsCompleted + 1);

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

        // v2.6.74: avança `nextDrawAt` pro próximo slot devido. O motor já setou
        // t.lastAutoDrawAt = mostRecentScheduled → o helper devolve o PRÓXIMO slot
        // (futuro), então a query não re-dispara este. null = sem mais sorteio
        // (sorteio único feito / temporada encerrada) → remove o campo.
        let _nextDrawMs = null;
        try {
          if (drawWindow && typeof drawWindow._nextOwedDrawMs === 'function') {
            _nextDrawMs = drawWindow._nextOwedDrawMs(t, now.getTime());
          }
        } catch (e) { /* best-effort */ }
        const _nextDrawField = (typeof _nextDrawMs === 'number') ? _nextDrawMs : FieldValue.delete();

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
            // v2.7.9: lista de espera do Rei/Rainha (sobra da divisão por 4). Sem
            // isso, o publish não tinha o que carregar e a espera sumia.
            monarchWaitlist: t.monarchWaitlist || null,
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
            nextDrawAt: _nextDrawField,
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
          nextDrawAt: _nextDrawField,
          updatedAt: t.updatedAt,
        };
        if (t.standings) payload.standings = t.standings;
        if (t.sitOutHistory) payload.sitOutHistory = t.sitOutHistory;       // fairness das folgas
        if (t.opponentHistory) payload.opponentHistory = t.opponentHistory; // anti-repeat de duplas
        if (t.monarchWaitlist) payload.monarchWaitlist = t.monarchWaitlist; // v2.7.9: espera Rei/Rainha
        if (t.drawVisibility) payload.drawVisibility = t.drawVisibility;
        // v3.0.x: PARIDADE — _generateNextRound seta t.tournamentStarted (Pontos Corridos
        // não-manual). Sem incluir no payload seletivo, o sorteio do SERVIDOR perdia esse
        // campo (só o cliente persistia) → banner "Iniciar Torneio" reaparecia e a duração
        // do torneio quebrava (NaN). Mesma classe dos incidentes monarchWaitlist/tournamentStarted.
        if (t.tournamentStarted) payload.tournamentStarted = t.tournamentStarted;
        // v4.4.70 FONTE ÚNICA Rei/Rainha: normaliza o que vai ser GRAVADO (grupos
        // com matchIds, sem group.matches embutido — round.matches é a fonte
        // única). Chama a MESMA função canônica que o cliente (bracket-model.js,
        // vendored → drawWindow). Sem isto o sorteio do SERVIDOR regravava cada
        // jogo Rei/Rainha em dobro. Clona só rounds (payload tem sentinel
        // FieldValue em nextDrawAt que não sobrevive a JSON) → não muta t em
        // memória, que ainda é lido nas notificações abaixo.
        if (drawWindow && typeof drawWindow._foldMonarchGroups === 'function' && Array.isArray(payload.rounds)) {
          payload.rounds = JSON.parse(JSON.stringify(payload.rounds));
          drawWindow._foldMonarchGroups(payload);
        }
        await db.collection('tournaments').doc(tId).update(payload);

        console.log(`Auto-draw: round ${res.roundNumber} created with ${res.matchCount} match(es)` +
          ` [${res.firstDraw ? 'first draw' : 'next round'}] for ${tId}`);

        // Notify participants (push/in-app personalizado). IDENTIDADE = uid (não
        // email). Cada participante carrega seu(s) uid(s); duplas têm p1Uid/p2Uid.
        // Notificamos TODOS os uids (espelha window._participantUids do app).
        // v2.4.80: notificação PERSONALIZADA com o jogo específico do jogador
        // (igual ao _notifyDrawPersonalized do cliente). Antes era uma mensagem
        // genérica "Nova rodada sorteada!" — agora cada membro da dupla recebe
        // o seu confronto. O sendPushNotification usa notifData.message como
        // corpo do push, então o push também fica personalizado.

        // Matches da rodada recém-sorteada (Liga padrão/Suíço/Rei-Rainha → flat .matches).
        const _newRound = (Array.isArray(t.rounds) && t.rounds[res.roundIndex]) || null;
        const roundMatches = [];
        if (_newRound && Array.isArray(_newRound.matches)) {
          _newRound.matches.forEach(m => {
            if (m && !m.isSitOut && !m.isBye) {
              roundMatches.push({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '' });
            }
          });
        }

        // Casa nome do TIME inteiro ("A / B") OU membro individual ("A") contra o lado.
        const _isInSide = (name, side) => {
          if (!name || !side) return false;
          const n = String(name).trim().toLowerCase();
          const s = String(side).trim().toLowerCase();
          if (s === n) return true;
          return s.split(' / ').some(x => x.trim() === n);
        };

        // Prazo p/ lançar resultados = próximo sorteio (data + hora). Formatado em
        // UTC pra ecoar o wall-clock pretendido (drawFirstTime é interpretado como
        // hora local; no servidor=UTC, formatar em UTC devolve a hora original).
        let deadlineLabel = '';
        try {
          if (drawWindow && typeof drawWindow._calcNextDrawDate === 'function') {
            const nd = drawWindow._calcNextDrawDate(t);
            if (nd && !isNaN(nd.getTime())) {
              deadlineLabel = nd.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) + ' às ' +
                nd.toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
            }
          }
        } catch (e) { /* best-effort: sem prazo se o helper falhar */ }

        // Monta o texto personalizado pro jogo(s) deste participante/time.
        const buildPlayerMsg = (teamName) => {
          const mine = roundMatches.filter(m => _isInSide(teamName, m.p1) || _isInSide(teamName, m.p2));
          if (!mine.length) return null;
          const gamesText = mine.map((pm, i) =>
            (pm.label || ('Jogo ' + (i + 1))) + ':\n' + (pm.p1 || '?') + '\nvs\n' + (pm.p2 || '?')
          ).join('\n\n');
          return '🔄 Nova rodada no torneio ' + (t.name || '') + '!' +
            '\n\n' + gamesText +
            (t.venue ? '\n\n📍 ' + t.venue : '') +
            (deadlineLabel ? '\n⏰ Lance os resultados até ' + deadlineLabel : '');
        };

        const activePlayers = (Array.isArray(t.participants) ? t.participants : [])
          .filter(p => p && typeof p === 'object' && p.ligaActive !== false);
        const notifiedUids = new Set();
        for (const p of activePlayers) {
          const teamName = p.displayName || p.name || '';
          const personalMsg = buildPlayerMsg(teamName);
          const message = personalMsg || 'Nova rodada sorteada! Confira seus jogos.';
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
                message: message,
                createdAt: now.toISOString(),
                read: false
              });
            } catch (e) {
              console.warn(`Notification error for uid ${uid}:`, e.message);
            }
          }
        }

        // v3.0.x: enfileira criação de grupos de WhatsApp da rodada. O autoDraw
        // roda neste codebase (sem a callable notifyLeagueRoundWhatsApp nem os
        // segredos do Evolution); o trigger processRoundWhatsappGroups (codebase
        // default) consome a fila e cria os grupos (1 por partida na Liga; 1 por
        // grupo de 4 no Rei/Rainha). Antes só o sorteio MANUAL/publish do cliente
        // chamava a callable — auto-sorteio ficava sem grupo de WhatsApp.
        try {
          await db.collection('whatsapp_round_queue').add({
            tournamentId: tId,
            roundIndex: res.roundIndex,
            nextDrawDateStr: deadlineLabel || 'Não agendado',
            source: 'autoDraw',
            createdAt: now.toISOString(),
          });
        } catch (e) {
          console.warn(`[auto-draw] enfileirar grupos WhatsApp falhou para ${tId}:`, e.message);
        }
      } catch (err) {
        // Falha no sorteio NUNCA escreve dados parciais/errados — apenas loga e
        // deixa o cliente (organizador) sortear. Defense-in-depth.
        console.error(`Auto-draw error for ${tId}:`, err);
      }
    }
  }
});

// v3.1.14 (brick 4 etapa 4): gera UMA rodada agendada da Liga incremental (Pontos
// Corridos rodada a rodada) da FASE POSTERIOR atual, server-side. Espelha o poller do
// cliente (_firePhaseLigaAutoDrawIfDue): só dispara se o slot da fase está devido; usa
// o motor canônico _phaseGenNextLeagueRound (vendor) que monta o faux e chama
// _generateNextRoundForPlayers INTOCADO; persiste só os campos mutados; notifica o POOL
// da fase (uid). Round 1 sai no avanço manual; aqui só rodadas 2+.
async function _autoDrawIncrementalPhaseRound(t, tId, now) {
  if (!drawWindow || typeof drawWindow._nextOwedDrawMs !== 'function' ||
      typeof drawWindow._phaseGenNextLeagueRound !== 'function') {
    console.error(`Auto-draw phase: draw-core indisponível — pulando ${tId}`);
    return;
  }
  const nowMs = now.getTime();
  const owed = drawWindow._nextOwedDrawMs(t, nowMs);
  if (typeof owed !== 'number' || owed > nowMs) return; // sem slot devido agora
  const cur = t.currentPhaseIndex || 0;
  const ok = drawWindow._phaseGenNextLeagueRound(t, cur);
  if (!ok) { console.log(`Auto-draw phase: skip ${tId} (gen falhou / jogadores insuficientes)`); return; }
  // v3.1.16 (inc 8): a Liga incremental de fase posterior mora em t.phaseRounds[cur]
  // (rodadas reais, mesma forma de t.rounds da Fase 0) — não mais em t.matches +
  // phaseLeagueState. Persiste só phaseRounds; dedup por slot.lastAutoDrawAt.
  t.phaseRounds[cur].lastAutoDrawAt = owed;
  t.updatedAt = now.toISOString();
  let nextMs = null;
  try { nextMs = drawWindow._nextOwedDrawMs(t, nowMs); } catch (e) { /* best-effort */ }
  const nextField = (typeof nextMs === 'number') ? nextMs : FieldValue.delete();
  // v4.4.70 FONTE ÚNICA Rei/Rainha: fase posterior também pode ter grupos
  // Rei/Rainha duplicados (round.matches + monarchGroups[i].matches). Normaliza
  // o que vai ser gravado via a MESMA função canônica vendored. Clona phaseRounds
  // (não muta t em memória, lido nas notificações abaixo).
  let _phaseRoundsToSave = t.phaseRounds;
  if (drawWindow && typeof drawWindow._foldMonarchGroups === 'function') {
    _phaseRoundsToSave = JSON.parse(JSON.stringify(t.phaseRounds));
    drawWindow._foldMonarchGroups({ phaseRounds: _phaseRoundsToSave });
  }
  await db.collection('tournaments').doc(tId).update({
    phaseRounds: _phaseRoundsToSave,
    nextDrawAt: nextField,
    updatedAt: t.updatedAt,
  });
  const _slotRounds = (t.phaseRounds[cur] && t.phaseRounds[cur].rounds) || [];
  const newMax = _slotRounds.reduce((mx, r) => Math.max(mx, (r && r.round) || 1), 0);
  const roundMatches = ((_slotRounds.find(r => ((r && r.round) || 1) === newMax) || {}).matches || [])
    .filter(m => !m.isSitOut && !m.isBye).map(m => ({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '' }));
  console.log(`Auto-draw phase: fase ${cur + 1} rodada ${newMax} (${roundMatches.length} jogos) para ${tId}`);

  // Notifica o POOL da fase (subconjunto classificado), por uid. Casa nome do TIME
  // ("A / B") ou membro individual ("A") contra o lado da partida.
  const pool = (t.phaseRounds[cur] && Array.isArray(t.phaseRounds[cur].pool)) ? t.phaseRounds[cur].pool : [];
  const _isInSide = (name, side) => {
    if (!name || !side) return false;
    const n = String(name).trim().toLowerCase(), s = String(side).trim().toLowerCase();
    return s === n || s.split(' / ').some(x => x.trim() === n);
  };
  const buildMsg = (teamName) => {
    const mine = roundMatches.filter(m => _isInSide(teamName, m.p1) || _isInSide(teamName, m.p2));
    if (!mine.length) return null;
    const gamesText = mine.map((pm, i) => (pm.label || ('Jogo ' + (i + 1))) + ':\n' + (pm.p1 || '?') + '\nvs\n' + (pm.p2 || '?')).join('\n\n');
    return '🔄 Nova rodada no torneio ' + (t.name || '') + '!\n\n' + gamesText + (t.venue ? '\n\n📍 ' + t.venue : '');
  };
  const notified = new Set();
  for (const p of pool) {
    const teamName = (p && (p.displayName || p.name)) || '';
    const message = buildMsg(teamName) || 'Nova rodada sorteada! Confira seus jogos.';
    const uids = [];
    [p && p.uid, p && p.p1Uid, p && p.p2Uid].forEach(u => { if (u) uids.push(String(u)); });
    for (const uid of uids) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) continue;
        if ((userDoc.data() || {}).notifyPlatform === false) continue;
        await db.collection('users').doc(uid).collection('notifications').add({
          type: 'draw', fromUid: 'system', fromName: 'scoreplace.app', fromPhoto: '',
          tournamentId: tId, tournamentName: t.name || '', message, createdAt: now.toISOString(), read: false
        });
      } catch (e) { console.warn(`Notif phase error uid ${uid}:`, e.message); }
    }
  }
}

// ─── Reconciliador de nextDrawAt (v2.6.74) ──────────────────────────────────
// O autoDraw (acima) consulta por `nextDrawAt` pra ser barato + na hora. Mas:
//  (a) torneios LEGADOS (criados antes deste campo) não têm nextDrawAt → a range
//      query os EXCLUI (Firestore ignora docs com o campo ausente) → nunca seriam
//      sorteados. (b) drift: se algum caminho mutar o agendamento sem recalcular.
// Este reconciliador varre a coleção a cada 30min e grava o nextDrawAt correto
// (via o MESMO _nextOwedDrawMs) onde está ausente/desatualizado — backfill + cura.
// NÃO sorteia (isso é só do autoDraw) → zero risco de disparo duplo. Custo: 48
// varreduras/dia (barato), escrevendo só quando o valor muda.
exports.autoDrawReconcile = onSchedule('every 30 minutes', async (event) => {
  const now = Date.now();
  let scanned = 0, fixed = 0;
  if (!drawWindow || typeof drawWindow._nextOwedDrawMs !== 'function') {
    console.error('[autoDrawReconcile] _nextOwedDrawMs indisponível — abortando');
    return;
  }
  const snap = await db.collection('tournaments').get();
  for (const doc of snap.docs) {
    scanned++;
    const t = doc.data();
    let want = null;
    try {
      const owed = drawWindow._nextOwedDrawMs(t, now);
      if (typeof owed === 'number') want = owed;
    } catch (e) { /* doc malformado: trata como sem sorteio devido */ }
    const have = (typeof t.nextDrawAt === 'number') ? t.nextDrawAt : null;
    if (want !== have) {
      try {
        await doc.ref.update({ nextDrawAt: want != null ? want : FieldValue.delete() });
        fixed++;
      } catch (e) { console.error(`[autoDrawReconcile] falha ao atualizar ${doc.id}:`, e && e.message); }
    }
  }
  console.log(`[autoDrawReconcile] ${scanned} torneios varridos, ${fixed} nextDrawAt atualizados`);
});

// ─── Push Notifications via FCM ─────────────────────────────────────────────
exports.sendPushNotification = onDocumentCreated('users/{userId}/notifications/{notifId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  if (IS_STAGING) { console.log('[staging] push (FCM) suprimido'); return; }

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

  // ⚠️ TOKENS NATIVOS (Capacitor iOS/Android) — exceção AO contrato data-only.
  // O contrato data-only acima existe SÓ por causa da WEB (o navegador exibe uma
  // cópia automática do payload `notification` além da que o sw.js mostra → 2x).
  // No app NATIVO não há sw.js: data-only NÃO gera notificação na bandeja em
  // background/killed (o SO não auto-exibe sem `notification`). Por isso, e SÓ
  // pros tokens nativos (fcmTokenPlatform começa com 'native-'; a web grava
  // 'web' ou nada → nunca entra aqui → segue data-only intocada), adicionamos o
  // payload `notification`. Validado no emulador Android (v4.3.29-beta): com
  // notification+data, background → bandeja do SO, foreground → toast in-app
  // (o plugin não auto-exibe em foreground; iOS usa presentationOptions:[]).
  const _isNativeToken = String(userData.fcmTokenPlatform || '').indexOf('native') === 0;
  if (_isNativeToken) {
    message.notification = {
      title: notifData.tournamentName || 'scoreplace.app',
      body: notifData.message || 'Você tem uma nova notificação.'
    };
    // Android: colapsa entregas do mesmo doc pelo tag; o tap abre via data.link
    // (o app trata notificationActionPerformed → navega pro #tournaments/<id>).
    message.android = { collapseKey: tag, notification: { tag: tag } };
  }

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
