const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

// v2.3.91: lógica de sorteio REAL do cliente (Rei/Rainha, duplas, equilíbrio,
// categorias, folgas, desempate) carregada via shim Node. Substitui o stub 1×1
// antigo. vendor/ é sincronizado de js/views/* no predeploy (copy-vendor.js).
// Require defensivo: se draw-core falhar ao carregar, NÃO derruba o módulo
// (sendPushNotification continua funcionando); autoDraw apenas pula.
let generateLigaRound = null;
let drawInitial = null;   // v1.2.25: motor do SORTEIO INICIAL (Etapa 3 · fase A) — usado pela drawRound
let canRecompile = null;
let drawWindow = null; // window do shim Node — expõe _calcNextDrawDate (prazo p/ lançar resultado)
try {
  const _dc = require('./draw-core.js');
  generateLigaRound = _dc.generateLigaRound;
  drawInitial = _dc.drawInitial;
  canRecompile = _dc.canRecompile;
  drawWindow = _dc._window;
} catch (e) {
  console.error('[autoDraw] draw-core indisponível — autoDraw vai pular:', e && e.message);
}

// Versão DESTE código de function. Sobe junto com a do app a cada deploy — é o que prova,
// no log, qual build atendeu a chamada. Ver [[feedback_indicate_version_on_deploy]].
const CF_VERSION = '1.2.27';

initializeApp();
const db = getFirestore();

// v4.5.73: identidade do slot = uid (espelha window._slotUids de bracket-logic.js).
// O slot carrega SEMPRE o(s) uid(s) — team*Uids (dupla/monarch) ou p*Uid (1v1); o
// nome (m.p1) é só cache de display, que pode envelhecer. Usado pra resolver o nome
// VIVO do perfil no texto das notificações, em vez do nome gravado no slot.
function _slotUidsOf(m, side) {
  if (!m) return [];
  const arr = side === 'p1' ? m.team1Uids : m.team2Uids;
  if (Array.isArray(arr) && arr.length) return arr.filter(Boolean).map(String);
  const single = side === 'p1' ? m.p1Uid : m.p2Uid;
  if (single) return [String(single)];
  return [];
}

// Busca em lote os nomes VIVOS (users/{uid}.displayName) de um conjunto de uids.
// Retorna { profByUid, nameByUid }. Reaproveitado pra checar notifyPlatform sem
// re-ler o mesmo doc. Nome ausente → não entra no mapa (o caller cai no fallback).
async function _loadLiveNames(uidSet) {
  const list = Array.from(uidSet);
  const profByUid = {};
  for (let i = 0; i < list.length; i += 100) {
    const refs = list.slice(i, i + 100).map(u => db.collection('users').doc(u));
    const docs = await db.getAll(...refs);
    docs.forEach(d => { if (d.exists) profByUid[d.id] = d.data() || {}; });
  }
  const nameByUid = {};
  Object.keys(profByUid).forEach(u => {
    const dn = String(profByUid[u].displayName || profByUid[u].name || '').trim();
    if (dn) nameByUid[u] = dn;
  });
  return { profByUid, nameByUid };
}

// v4.5.85 (ITEM 3 · Fase 4): injeta os nomes VIVOS por uid no draw-core ANTES do sorteio.
// Storage é só-uid → sem isto o motor (pool por nome) descarta entrada só-uid → 0 rodadas.
// Best-effort: falha silenciosa cai no nome gravado (legado). Também rehidrata as entradas
// (o generateLigaRound já rehidrata no topo; para o caminho de fase, chamamos explícito).
async function _preloadDrawNames(t) {
  try {
    if (!drawWindow) return;
    const uids = new Set();
    (Array.isArray(t.participants) ? t.participants : []).forEach(p => {
      if (!p || typeof p !== 'object') return;
      [p.uid, p.p1Uid, p.p2Uid].forEach(u => { if (u) uids.add(String(u)); });
      if (Array.isArray(p.participants)) p.participants.forEach(sp => { if (sp && sp.uid) uids.add(String(sp.uid)); });
    });
    if (!uids.size) return;
    const { nameByUid } = await _loadLiveNames(uids);
    drawWindow._profileNameByUid = nameByUid || {};
  } catch (e) { /* best-effort; motor cai no nome gravado legado */ }
}

// Nome exibido de um lado da partida: nomes VIVOS dos uids do slot (dupla junta com
// " / "); só cai no nome gravado (storedStr) quando o slot não tem uid — guest sem
// conta, cuja string É a identidade legítima. Nunca devolve vazio.
function _sideDisplayName(uids, nameByUid, storedStr) {
  const ns = (uids || []).map(u => nameByUid[u]).filter(Boolean);
  if (ns.length) return ns.join(' / ');
  return storedStr || '?';
}

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

// ─── SORTEIO INICIAL SOB DEMANDA (Etapa 3 · fase B) ─────────────────────────
// "Os cânones rodam em CF, disparados pelo app — assim evita cada usuário rodar uma
// função diferente com app desatualizado" (dono, jul/2026). O app PEDE, o servidor
// SORTEIA e GRAVA. Binário de loja velho deixa de sortear com motor velho.
//
// SPLIT CANÔNICO — painel fica, execução vai: gates de re-sorteio e os painéis de
// resolução (pow2/resto/sem-dupla) são UI e FICAM no cliente; eles já gravam a decisão
// no doc (p2Resolution/oddResolution/incompleteResolution). Aqui só LÊ o que o
// organizador decidiu e EXECUTA.

// Espelha isTournamentAdmin() das firestore.rules:20. As rules protegem o WRITE; esta
// função protege o RPC — a CF grava com Admin SDK (bypassa rules), então sem isto
// qualquer autenticado sortearia o torneio de qualquer um. Os 4 caminhos são os mesmos,
// na mesma ordem. Se mudar lá, muda aqui.
function _isTournamentAdmin(t, uid, email) {
  if (!t || !uid) return false;
  const mail = String(email || '').toLowerCase();
  // (1) creatorUid — mais confiável, imutável.
  if (typeof t.creatorUid === 'string' && t.creatorUid === uid) return true;
  // (2) adminUids — co-hosts ativos por UID (cobre co-host com email '' / conta por telefone).
  if (Array.isArray(t.adminUids) && t.adminUids.length > 0 && t.adminUids.indexOf(uid) !== -1) return true;
  // (3) adminEmails — backward compat + co-hosts com email.
  const hasAdminEmails = Array.isArray(t.adminEmails) && t.adminEmails.length > 0;
  if (mail && hasAdminEmails && t.adminEmails.indexOf(mail) !== -1) return true;
  // (4) recovery — adminEmails vazio/ausente → organizerEmail (bug v1.6.66 apagava o campo).
  if (mail && !hasAdminEmails && typeof t.organizerEmail === 'string'
      && t.organizerEmail.toLowerCase() === mail) return true;
  return false;
}

// Espelha o LIMITE DE PERSISTÊNCIA de FirestoreDB.mutateTournament (firebase-db.js:297) —
// os passos entre o mutator e o `set`. Sem isto o doc do servidor sai diferente do doc do
// cliente, que é exatamente o bug de duas versões que esta Etapa existe pra matar.
// Todos os helpers vêm do MESMO arquivo que o app carrega (vendor/ via copy-vendor):
// persist-core (clean/compute*), bracket-model (fold), identity-core (strip),
// tournaments-utils (_nextOwedDrawMs). Ver [[feedback_functions_must_mirror_app]].
// Devolve { persist, clean } — a MESMA assimetria do cliente: PERSISTE a cópia sanitizada
// (sem nome pra quem tem uid) mas DEVOLVE `clean` COM nome e re-hidratado, pro caller
// sincronizar estado/exibir sem depender de um render. Nunca gravar `clean`, nunca devolver
// `persist`: trocar os dois re-introduz nome gravado no Firestore (fura o storage só-uid) ou
// entrega ao cliente entradas sem nome (some da tela).
function _applyWriteBoundary(data) {
  const w = drawWindow;
  if (!w) throw new HttpsError('internal', 'draw-core indisponível');
  // NUNCA ENCOLHE (união com o que já está no doc): um uid que só existe no denormalizado
  // (co-host por path que não popula participants) não pode sumir e derrubar o listener
  // `array-contains` de quem depende dele. Mesma blindagem do cliente.
  const _union = (prev, next) => Array.from(new Set(
    (Array.isArray(prev) ? prev : []).concat(Array.isArray(next) ? next : [])));

  data.adminEmails = w._computeAdminEmails(data);
  data.adminUids = w._computeAdminUids(data);
  data.memberUids = _union(data.memberUids, w._computeMemberUids(data));
  try {
    const owed = w._nextOwedDrawMs(data);
    if (typeof owed === 'number') data.nextDrawAt = owed;
    else delete data.nextDrawAt;
  } catch (e) { /* otimização; nunca derruba a gravação */ }

  const clean = w._cleanUndefined(data);
  w._foldMonarchGroups(clean); // Rei/Rainha: grava só matchIds (fonte única = round.matches)
  // Storage é só-uid: quem TEM perfil vivo não leva nome gravado (o display resolve por uid).
  // Guest e uid órfão MANTÊM o nome — é a única identidade que têm.
  let persist = clean;
  const stripped = {};
  ['participants', 'standbyParticipants', 'waitlist'].forEach((k) => {
    if (Array.isArray(clean[k])) stripped[k] = w._stripStoredNamesForUidEntries(clean[k]);
  });
  if (Object.keys(stripped).length) persist = Object.assign({}, clean, stripped);
  // ⚠️ NÃO hidratar `clean` aqui: Object.assign é RASO, então persist.rounds É clean.rounds —
  // hidratar devolveria group.matches pro persist e o Firestore gravaria cada jogo Rei/Rainha
  // EM DOBRO (o incidente que o fold existe pra evitar). O cliente escapa por ORDEM (dá o set
  // antes de hidratar); não dependemos dessa sutileza. Os dois saem FOLDADOS — que é como o doc
  // realmente é no Firestore — e quem receber hidrata no ingest, igual faz com o listener.
  return { persist: persist, clean: clean };
}

// Re-sorteio: usa o RESET CANÔNICO do cliente (window._clearTournamentDraw, vendorado em
// tournaments-draw.js) — NÃO uma limpeza à mão. Ele faz muito mais que zerar a chave: desmonta
// as duplas FORMADAS PELO SORTEIO (teamOrigins 'sorteada') de volta pros indivíduos, devolve
// waitlist/standby/monarchWaitlist pro pool e dedup. Uma lista à mão aqui divergiria do reset
// que o organizador VÊ na tela — e o servidor re-sortearia o elenco velho, ainda pareado.
// O CONFIRM continua no cliente (é UI); só a execução é daqui.
function _clearForRedraw(t) {
  const w = drawWindow;
  if (!w || typeof w._clearTournamentDraw !== 'function') {
    throw new HttpsError('internal', 'Reset de re-sorteio indisponível no servidor.');
  }
  w._clearTournamentDraw(t);
}

// Um HttpsError é erro ESPERADO de callable — o framework NÃO o loga. No 1º teste real na
// staging a CF recusou e não sobrou NENHUMA linha: instância subiu e silêncio. Ficamos cegos.
// Todo caminho de recusa passa por aqui: loga o motivo ANTES de lançar.
function _drawFail(code, reason, ctx) {
  console.error(`drawRound v${CF_VERSION} RECUSOU:`, reason, JSON.stringify(ctx || {}));
  return new HttpsError(code, reason);
}

exports.drawRound = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta pra sortear.');

  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!tId) throw new HttpsError('invalid-argument', 'tournamentId é obrigatório.');
  const allowRedraw = !!(request.data && request.data.allowRedraw);

  // Motor indisponível → NUNCA improvisar. Devolve erro e o cliente decide.
  if (typeof drawInitial !== 'function' || !drawWindow) {
    throw _drawFail('internal', 'Motor de sorteio indisponível no servidor.', { tId });
  }

  const ref = db.collection('tournaments').doc(tId);

  // Leitura FORA da transação só pra (a) falhar cedo em authz e (b) pré-carregar os nomes
  // vivos (N reads em users/ — transação exige todo read ANTES de qualquer write, e nome é
  // dado advisory de display; o autoDraw faz igual).
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentAdmin(pre.data(), uid, email)) {
    const _p = pre.data();
    throw _drawFail('permission-denied', 'Só o organizador ou um co-organizador pode sortear.',
      { tId, uid, email: email || '(sem email)', creatorUid: _p.creatorUid,
        adminUids: _p.adminUids, adminEmails: _p.adminEmails, organizerEmail: _p.organizerEmail });
  }
  await _preloadDrawNames(pre.data()); // popula drawWindow._profileNameByUid

  // A VERSÃO no log é o contrato: se a linha não disser CF_VERSION, é build velha atendendo
  // (deploy não pegou / instância antiga). Sem isto não dá pra saber que código respondeu.
  console.log(`drawRound v${CF_VERSION}: pedido de ${uid} pro torneio ${tId}` + (allowRedraw ? ' [re-sorteio]' : ''));

  let out;
  try {
    out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
    const t = snap.data();
    t.id = tId;

    // Re-checa authz sobre o doc FRESCO: entre o read de fora e a transação o organizador
    // pode ter perdido o acesso (transferência de organização / co-host removido).
    if (!_isTournamentAdmin(t, uid, email)) {
      throw _drawFail('permission-denied', 'Só o organizador ou um co-organizador pode sortear (doc fresco).', { tId, uid });
    }

    // Rei/Rainha: o doc fresco traz grupos só com matchIds — hidrata ANTES do motor,
    // igual mutateTournament faz antes do mutator.
    try { drawWindow._hydrateMonarchGroups(t); } catch (e) { /* best-effort */ }

    const hadBracket = !canRecompile(t);
    if (hadBracket) {
      // Guarda de duplo-sorteio DENTRO da transação (mais forte que a do cliente, cujo
      // preHadBracket vem de um snapshot local): se já tem chave e o organizador não pediu
      // re-sorteio, outro admin sorteou primeiro — não clobbera a chave dele.
      if (!allowRedraw) {
        throw _drawFail('failed-precondition', 'already-drawn',
          { tId, matches: (t.matches || []).length, rounds: (t.rounds || []).length,
            groups: (t.groups || []).length, currentPhaseIndex: t.currentPhaseIndex,
            phaseMaterialized: t._phaseMaterialized });
      }
      _clearForRedraw(t);
    }

    const res = drawInitial(t, { idStamp: Date.now() });
    if (!res || !res.ok) {
      // storePhase falho (ex.: 'no-entrants') NUNCA vira sucesso — era isso que dava
      // "diz que sorteou mas não mostra chave".
      throw _drawFail('failed-precondition', (res && res.reason) || 'draw-failed',
        { tId, format: t.format, teamSize: t.teamSize, enrollmentMode: t.enrollmentMode,
          participantes: (t.participants || []).length, p2Resolution: t.p2Resolution,
          erro: (res && res.error) || '' });
    }

    // Histórico do sorteio: quem GRAVA o sorteio grava a entrada. No cliente ela só
    // persistia carona no delta do _commitInitialDraw (logAction só mexe na memória) —
    // com a gravação aqui, ela se perderia. Mesmo texto do cliente (tournaments-draw.js).
    const msg = res.native
      ? `Sorteio Realizado — ${t.format}: Rodada 1 gerada com ${res.matchCount} partida(s)` +
        (res.sitOuts ? ` e ${res.sitOuts} folga(s)` : '') + ' [motor canônico]'
      : `Sorteio Realizado — ${t.format} (motor canônico)`;
    if (!Array.isArray(t.history)) t.history = [];
    t.history.push({ date: new Date().toISOString(), message: msg });

    // v4.1.30: o sorteio LIMPA a presença (drawInitial já zera checkedIn/absent).
    const b = _applyWriteBoundary(t);
    tx.set(ref, b.persist); // set (sem merge) DENTRO da txn = clobber-free
    // Devolve o doc COM nome (b.clean, não b.persist) — o cliente precisa dele pra notificar
    // (_notifyDrawPersonalized lê os nomes) e pra sincronizar o AppStore sem esperar o listener.
    // Vem FOLDADO (como o doc é no Firestore); o ingest do cliente hidrata, igual ao listener.
    return { ok: true, format: res.format, native: !!res.native, matchCount: res.matchCount,
             sitOuts: res.sitOuts || 0, allMaleCount: res.allMaleCount || 0, redraw: hadBracket,
             tournament: b.clean };
    });
  } catch (e) {
    // HttpsError já foi logado pelo _drawFail — repassa. Qualquer OUTRO erro (motor
    // estourando, Firestore, bug meu) chegaria ao cliente como 'internal' SEM RASTRO:
    // loga com stack antes de repassar. Foi a cegueira do 1º teste real.
    if (e instanceof HttpsError) throw e;
    console.error(`drawRound EXPLODIU no torneio ${tId} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha no sorteio: ' + String((e && e.message) || e).slice(0, 300));
  }

  console.log(`drawRound: ${tId} sorteado por ${uid} — ${out.format}, ${out.matchCount} jogo(s)` +
    (out.redraw ? ' [re-sorteio]' : ' [1º sorteio]'));
  return out;
});

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
        await _preloadDrawNames(t); // v4.5.85: nomes vivos por uid antes do motor
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
              // v4.5.73: carrega os uids do slot pra resolver nome vivo + casar "meu jogo".
              roundMatches.push({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '',
                p1Uids: _slotUidsOf(m, 'p1'), p2Uids: _slotUidsOf(m, 'p2') });
            }
          });
        }

        const activePlayers = (Array.isArray(t.participants) ? t.participants : [])
          .filter(p => p && typeof p === 'object' && p.ligaActive !== false);

        // v4.5.73: nomes exibidos resolvidos pela CONTA (uid), não pelo nome gravado
        // no slot — o motor grava m.p1 a partir de p.displayName de participants, que
        // sem o reconcile de nomes envelhece. Junta os uids da rodada + dos participantes
        // e busca o nome VIVO em lote (reaproveitado pra checar notifyPlatform sem re-ler).
        const _allUids = new Set();
        roundMatches.forEach(m => { m.p1Uids.forEach(u => _allUids.add(u)); m.p2Uids.forEach(u => _allUids.add(u)); });
        activePlayers.forEach(p => {
          [p.uid, p.p1Uid, p.p2Uid].forEach(u => { if (u) _allUids.add(String(u)); });
          if (Array.isArray(p.participants)) p.participants.forEach(sp => { if (sp && sp.uid) _allUids.add(String(sp.uid)); });
        });
        const { profByUid: _profByUid, nameByUid: _nameByUid } = await _loadLiveNames(_allUids);

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

        // Monta o texto personalizado pro jogo(s) deste participante/time. "Meu jogo"
        // por INTERSEÇÃO DE UID (uids do participante ∩ uids do slot) — não por nome.
        // Nomes exibidos = nome vivo do perfil por uid (fallback pro gravado só p/ guest).
        const buildPlayerMsg = (myUidSet) => {
          const mine = roundMatches.filter(m =>
            m.p1Uids.some(u => myUidSet.has(u)) || m.p2Uids.some(u => myUidSet.has(u)));
          if (!mine.length) return null;
          const gamesText = mine.map((pm, i) =>
            (pm.label || ('Jogo ' + (i + 1))) + ':\n' +
            _sideDisplayName(pm.p1Uids, _nameByUid, pm.p1) + '\nvs\n' +
            _sideDisplayName(pm.p2Uids, _nameByUid, pm.p2)
          ).join('\n\n');
          return '🔄 Nova rodada no torneio ' + (t.name || '') + '!' +
            '\n\n' + gamesText +
            (t.venue ? '\n\n📍 ' + t.venue : '') +
            (deadlineLabel ? '\n⏰ Lance os resultados até ' + deadlineLabel : '');
        };

        const notifiedUids = new Set();
        for (const p of activePlayers) {
          const uids = [];
          [p.uid, p.p1Uid, p.p2Uid].forEach(u => { if (u) uids.push(String(u)); });
          if (Array.isArray(p.participants)) {
            p.participants.forEach(sp => { if (sp && sp.uid) uids.push(String(sp.uid)); });
          }
          const personalMsg = buildPlayerMsg(new Set(uids));
          const message = personalMsg || 'Nova rodada sorteada! Confira seus jogos.';
          for (const uid of uids) {
            if (notifiedUids.has(uid)) continue;
            notifiedUids.add(uid);
            const profile = _profByUid[uid]; // já carregado no batch acima
            if (!profile) continue;           // perfil inexistente → pula (igual !userDoc.exists)
            if (profile.notifyPlatform === false) continue;
            try {
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

        // v1.2.9: o enfileiramento de grupos de WhatsApp da rodada saiu. Os grupos
        // automáticos dependiam do Evolution/Groups API — número banido, apelação
        // negada, portfólio Meta morto. O grupo agora é criado pelo PRÓPRIO usuário
        // no WhatsApp dele e colado no app (js/views/wa-group.js), sem API nenhuma.
        // Ver project_whatsapp_meta_2fa_block.
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
  await _preloadDrawNames(t); // v4.5.85: nomes vivos por uid antes do motor de fase
  if (typeof drawWindow._rehydrateEntryNames === 'function') drawWindow._rehydrateEntryNames(t);
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
  // v4.5.73: carrega uids do slot (resolve nome vivo + casa "meu jogo" por uid).
  const roundMatches = ((_slotRounds.find(r => ((r && r.round) || 1) === newMax) || {}).matches || [])
    .filter(m => !m.isSitOut && !m.isBye)
    .map(m => ({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '',
      p1Uids: _slotUidsOf(m, 'p1'), p2Uids: _slotUidsOf(m, 'p2') }));
  console.log(`Auto-draw phase: fase ${cur + 1} rodada ${newMax} (${roundMatches.length} jogos) para ${tId}`);

  // Notifica o POOL da fase (subconjunto classificado), por uid. Nome exibido =
  // nome vivo do perfil por uid; "meu jogo" por interseção de uid (não por nome).
  const pool = (t.phaseRounds[cur] && Array.isArray(t.phaseRounds[cur].pool)) ? t.phaseRounds[cur].pool : [];
  const _allUids = new Set();
  roundMatches.forEach(m => { m.p1Uids.forEach(u => _allUids.add(u)); m.p2Uids.forEach(u => _allUids.add(u)); });
  pool.forEach(p => { [p && p.uid, p && p.p1Uid, p && p.p2Uid].forEach(u => { if (u) _allUids.add(String(u)); }); });
  const { profByUid: _profByUid, nameByUid: _nameByUid } = await _loadLiveNames(_allUids);
  const buildMsg = (myUidSet) => {
    const mine = roundMatches.filter(m =>
      m.p1Uids.some(u => myUidSet.has(u)) || m.p2Uids.some(u => myUidSet.has(u)));
    if (!mine.length) return null;
    const gamesText = mine.map((pm, i) => (pm.label || ('Jogo ' + (i + 1))) + ':\n' +
      _sideDisplayName(pm.p1Uids, _nameByUid, pm.p1) + '\nvs\n' +
      _sideDisplayName(pm.p2Uids, _nameByUid, pm.p2)).join('\n\n');
    return '🔄 Nova rodada no torneio ' + (t.name || '') + '!\n\n' + gamesText + (t.venue ? '\n\n📍 ' + t.venue : '');
  };
  const notified = new Set();
  for (const p of pool) {
    const uids = [];
    [p && p.uid, p && p.p1Uid, p && p.p2Uid].forEach(u => { if (u) uids.push(String(u)); });
    const message = buildMsg(new Set(uids)) || 'Nova rodada sorteada! Confira seus jogos.';
    for (const uid of uids) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      try {
        const profile = _profByUid[uid]; // já carregado no batch acima
        if (!profile) continue;
        if (profile.notifyPlatform === false) continue;
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
