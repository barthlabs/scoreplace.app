const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
// v1.7.35: rebase do sorteio (o servidor não sobrescreve o que aconteceu na quadra
// enquanto pensava). Módulo PURO e testável — o index não é require-ável em teste.
const { rebaseRounds } = require('./rebase-core.js');
const _tourSummary = require('./tournament-summary-core.js');
const _wp = require('./write-plan.js');
const _woClaimCore = require('./wo-claim-core.js');
const _tSplit = require('./vendor/tournament-split-core.js');   // fonte única: js/views/ (copy-vendor)
// fonte única: functions/match-roster.js (copy-vendor) — monta o subdoc de resultado,
// incluindo o carregar-adiante do `replay`, que o servidor não sabe recalcular.
let _mrEspelho = null;
try { _mrEspelho = require('./vendor/match-roster.js'); }
catch (e) { console.error('[espelho-result] vendor/match-roster.js indisponível:', e && e.message); }

// v2.3.91: lógica de sorteio REAL do cliente (Rei/Rainha, duplas, equilíbrio,
// categorias, folgas, desempate) carregada via shim Node. Substitui o stub 1×1
// antigo. vendor/ é sincronizado de js/views/* no predeploy (copy-vendor.js).
// Require defensivo: se draw-core falhar ao carregar, NÃO derruba o módulo
// (sendPushNotification continua funcionando); autoDraw apenas pula.
let generateLigaRound = null;
let applyWoFn = null;
let setPresenceWithWOSubstitutionFn = null;
let resolveWOSubstitutionChoiceFn = null;
let setTournamentWOAbsenceFn = null;
let drawInitial = null;   // v1.2.25: motor do SORTEIO INICIAL (Etapa 3 · fase A) — usado pela drawRound
let integrateLateFn = null; // v1.2.57: integração de tardios no servidor — usado pela integrateLateEntries
let formLatePairFn = null;  // formar dupla na espera + integrar, atômico — usado pela formLatePair
let splitLatePairFn = null; // desfazer dupla da espera, atômico — usado pela splitLatePair
let closeRoundFn = null;
let materializePhaseFn = null;
let phaseStandingsFn = null;
let phaseCompleteFn = null;
let groupTeamStandingsFn = null;    // fecho de rodada no servidor (Suíço-pow2 Opção B) — usado pela closeRound
let canRecompile = null;
let hasDrawnBracket = null;  // régua de 'já tem chave' — a MESMA do cliente (matches/rounds/groups)
let drawWindow = null; // window do shim Node — expõe _calcNextDrawDate (prazo p/ lançar resultado)
// L6.R1 (2.1.80): a agenda do sorteio no FUSO DO EVENTO — janela de 1 minuto, calendário
// em dias civis e a trava de slot. Puro e testado à parte (test-agenda-core.js).
const _agenda = require('./agenda-core.js');
const _leagueSeasonCore = require('./league-season-core.js');
try {
  const _dc = require('./draw-core.js');
  generateLigaRound = _dc.generateLigaRound;
  applyWoFn = _dc.applyTournamentWO;
  setPresenceWithWOSubstitutionFn = _dc.setPresenceWithWOSubstitution;
  resolveWOSubstitutionChoiceFn = _dc.resolveWOSubstitutionChoice;
  setTournamentWOAbsenceFn = _dc.setTournamentWOAbsence;
  drawInitial = _dc.drawInitial;
  integrateLateFn = _dc.integrateLateEntries;
  formLatePairFn = _dc.formLatePairCore;
  splitLatePairFn = _dc.splitLatePairCore;
  closeRoundFn = _dc.closeRoundCore;
  materializePhaseFn = _dc.materializeNextPhase;
  phaseStandingsFn = _dc.standingsDaFaseAnterior;
  phaseCompleteFn = _dc.phaseComplete;
  groupTeamStandingsFn = _dc.groupTeamStandings;
  canRecompile = _dc.canRecompile;
  hasDrawnBracket = _dc.hasDrawnBracket;
  drawWindow = _dc._window;
} catch (e) {
  console.error('[autoDraw] draw-core indisponível — autoDraw vai pular:', e && e.message);
}

// v1.7: AUTORIZAÇÃO + aplicação do RESULTADO no servidor (result-core.js). Require
// separado e defensivo pelo mesmo motivo do draw-core: se falhar, a applyMatchResult
// recusa com erro claro e o cliente cai no caminho antigo — nunca improvisa a regra.
let applyResultFn = null;
try {
  applyResultFn = require('./result-core.js').applyResult;
} catch (e) {
  console.error('[applyMatchResult] result-core indisponível:', e && e.message);
}

// Versão DESTE código de function. Sobe junto com a do app a cada deploy — é o que prova,
// no log, qual build atendeu a chamada. Ver [[feedback_indicate_version_on_deploy]].
const CF_VERSION = '2.1.80';

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

// ─── E-MAIL DO SORTEIO (v1.6.88) ────────────────────────────────────────────
// Sorteio automático de 02/ago/2026 (Confra, 110 inscritos): as notificações
// IN-APP saíram (11+ docs em users/{uid}/notifications às 22:00Z) e NENHUM
// e-mail — `mail` não teve doc nenhum depois das 13:36Z e `notif_email_queue`
// estava VAZIA. Causa medida: esta CF só escrevia o canal in-app. No cliente,
// `_sendUserNotification` despacha DOIS canais (in-app + e-mail via digest);
// o servidor nunca espelhou o segundo. Quem sorteia é a CF → ninguém recebia
// e-mail de sorteio automático. [[feedback_functions_must_mirror_app]]
//
// O e-mail NÃO é enviado daqui: entra na MESMA fila do cliente
// (`notif_email_queue`), que a CF `flushNotifEmailDigest` consolida num e-mail
// por pessoa. Assim o comportamento (janela por importância, agrupamento,
// tema do destinatário, assunto) é UM só, não dois parecidos.
const _NOTIF_EMAIL_WINDOW_MIN = { fundamental: 5, important: 15, all: 30 };

// Filtro de nível: usa o helper VENDORADO (mesma função do app, sem cópia).
// Sem vendor carregado, o padrão é DEIXAR PASSAR — sorteio é 'fundamental',
// que todos os níveis de preferência recebem.
function _notifLevelOk(userLevel, notifLevel) {
  if (drawWindow && typeof drawWindow._notifLevelAllowed === 'function') {
    return drawWindow._notifLevelAllowed(userLevel, notifLevel);
  }
  return true;
}

// E-mails de um perfil: o principal + os vinculados por união de contas
// (`linkedEmails[]`), respeitando o opt-out `notifyEmail` — espelha o bloco de
// e-mail de `_sendUserNotification` (tournaments-organizer.js).
function _profileEmails(profile) {
  if (!profile || profile.notifyEmail === false) return [];
  const out = [], seen = {};
  const push = (e) => {
    const k = String(e == null ? '' : e).trim().toLowerCase();
    if (k && !seen[k]) { seen[k] = true; out.push(k); }
  };
  push(profile.email);
  if (Array.isArray(profile.linkedEmails)) profile.linkedEmails.forEach(push);
  return out;
}

// Enfileira o e-mail de notificação de UMA pessoa. `sentTo` é o dedup da
// RODADA inteira (a mesma pessoa pode aparecer por 2 uids — dupla —, e dois
// itens idênticos apareceriam duplicados no digest).
async function _queueDrawEmail(profile, opts, sentTo) {
  const level = opts.level || 'fundamental';
  if (!_notifLevelOk(profile && profile.notifyLevel, level)) return 0;
  // Backstop de SANDBOX na ÚLTIMA porta antes do e-mail (espelha queueNotifEmail):
  // o killswitch principal é o _sbMuteAuto, este é a rede embaixo dele. E-mail de SB
  // chega em gente que nem sabe que o SB existe. [[project_sandbox_tournament]]
  if (/^\(SB\)/.test(String(opts.tournamentName || '')) || /_sb(\b|$)/.test(String(opts.tournamentUrl || ''))) return 0;
  const emails = _profileEmails(profile);
  if (!emails.length) return 0;
  const now = Date.now();
  const mins = (_NOTIF_EMAIL_WINDOW_MIN[level] != null) ? _NOTIF_EMAIL_WINDOW_MIN[level] : 30;
  let n = 0;
  for (const email of emails) {
    if (sentTo.has(email)) continue;
    sentTo.add(email);
    try {
      await db.collection('notif_email_queue').add({
        email: email,
        level: level,
        message: opts.message || '',
        tournamentName: opts.tournamentName || '',
        tournamentUrl: opts.tournamentUrl || '',
        ctaLabel: opts.ctaLabel || '',
        ctaUrl: opts.ctaUrl || '',
        createdAt: now,
        flushAtMs: now + mins * 60 * 1000
      });
      n++;
    } catch (e) {
      console.warn('[autoDraw] falha ao enfileirar e-mail pra', email, e && e.message);
    }
  }
  return n;
}

// CTA do e-mail de sorteio = "Ver chave" (mesmo destino do _notifCta do app).
function _drawEmailOpts(t, tId, message) {
  const base = 'https://scoreplace.app';
  return {
    level: 'fundamental',                 // NOTIF_CATALOG.draw.level
    message: message,
    tournamentName: t.name || '',
    tournamentUrl: base + '/#tournaments/' + tId,
    ctaLabel: 'Ver chave',
    ctaUrl: base + '/#bracket/' + tId
  };
}

// v4.5.85 (ITEM 3 · Fase 4): injeta os nomes VIVOS por uid no draw-core ANTES do sorteio.
// Storage é só-uid → sem isto o motor (pool por nome) descarta entrada só-uid → 0 rodadas.
// Best-effort: falha silenciosa cai no nome gravado (legado). Também rehidrata as entradas
// (o generateLigaRound já rehidrata no topo; para o caminho de fase, chamamos explícito).
async function _preloadDrawNames(t) {
  try {
    if (!drawWindow) return;
    const uids = new Set();
    // v1.5.10: a ESPERA entra aqui também. Quem entra tarde vem de standby/waitlist, e o
    // inscrito grava SÓ uid (o nome vem do perfil vivo) — sem carregar esses uids, o motor
    // não tinha nome nenhum pra carimbar e o slot da dupla tardia virava "#10" na chave
    // (caso real tour_1785038880593_sb). Mesma leitura em lote, sem custo relevante.
    const _walk = (arr) => (Array.isArray(arr) ? arr : []).forEach(p => {
      if (!p || typeof p !== 'object') return;
      [p.uid, p.p1Uid, p.p2Uid].forEach(u => { if (u) uids.add(String(u)); });
      if (Array.isArray(p.participants)) p.participants.forEach(sp => { if (sp && sp.uid) uids.add(String(sp.uid)); });
    });
    _walk(t.participants); _walk(t.standbyParticipants); _walk(t.waitlist);
    if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object') {
      Object.keys(t.monarchWaitlist).forEach(k => _walk(t.monarchWaitlist[k]));
    }
    if (!uids.size) return;
    const { profByUid, nameByUid } = await _loadLiveNames(uids);
    drawWindow._profileNameByUid = nameByUid || {};
    drawWindow._profByUid = profByUid || {}; // v1.3.52: perfil COMPLETO por uid p/ enriquecer
  } catch (e) { /* best-effort; motor cai no nome gravado legado */ }
}

// v1.3.52: resolve o perfil POR UID e ESCREVE nos participantes em memória (gênero/skill/idade/
// email/phone/defaultCategory) ANTES do motor e das notificações. Assim o inscrito grava SÓ uid;
// a CF re-resolve tudo aqui (o vendor lê p.gender/p.email etc., que passam a vir do perfil vivo).
// Idempotente. Usa drawWindow._profByUid populado por _preloadDrawNames. Ver [[project_autodraw_server_parity]].
function _enrichParticipantsFromProfiles(t) {
  try {
    /* 2.2: lê pelo CONTEXTO da invocação quando há um aberto (advancePhase abre); fora
     * dele, cai no global de sempre — comportamento idêntico ao de antes. */
    const prof = (drawWindow && typeof drawWindow._spMapaDePerfis === 'function')
      ? drawWindow._spMapaDePerfis() : ((drawWindow && drawWindow._profByUid) || {});
    if (!Object.keys(prof).length) return;
    const _one = (p) => {
      if (!p || typeof p !== 'object') return;
      const d = p.uid && prof[p.uid];
      if (d) {
        if (d.gender) p.gender = d.gender;
        if (d.skillBySport && typeof d.skillBySport === 'object') p.skillBySport = d.skillBySport;
        if (d.birthDate) p.birthDate = d.birthDate;
        if (d.defaultCategory) p.defaultCategory = d.defaultCategory;
        if (d.email) p.email = d.email;
        if (d.phone) p.phone = d.phone;
      }
      const d1 = p.p1Uid && prof[p.p1Uid]; if (d1 && d1.gender) p.p1Gender = d1.gender;
      const d2 = p.p2Uid && prof[p.p2Uid]; if (d2 && d2.gender) p.p2Gender = d2.gender;
    };
    ['participants', 'standbyParticipants', 'waitlist'].forEach((k) => { if (Array.isArray(t[k])) t[k].forEach(_one); });
  } catch (e) { /* best-effort */ }
}

// Nome exibido de um lado da partida: nomes VIVOS dos uids do slot (dupla junta com
// " / "); só cai no nome gravado (storedStr) quando o slot não tem uid — guest sem
// conta, cuja string É a identidade legítima. Nunca devolve vazio.
function _sideDisplayName(uids, nameByUid, storedStr) {
  const ns = (uids || []).map(u => nameByUid[u]).filter(Boolean);
  if (ns.length) return ns.join(' / ');
  return storedStr || '?';
}

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

function _seasonRecipientUids(t) {
  const out = new Set();
  (Array.isArray(t && t.memberUids) ? t.memberUids : []).forEach(uid => { if (uid) out.add(String(uid)); });
  ['participants', 'standbyParticipants', 'waitlist'].forEach(key => {
    (Array.isArray(t && t[key]) ? t[key] : []).forEach(p => {
      if (!p || typeof p !== 'object') return;
      [p.uid, p.p1Uid, p.p2Uid].forEach(uid => { if (uid) out.add(String(uid)); });
      (Array.isArray(p.participants) ? p.participants : []).forEach(member => {
        if (member && member.uid) out.add(String(member.uid));
      });
    });
  });
  return Array.from(out);
}

// Uma única porta para a temporada acabar. A tela a solicita para obter a
// resposta imediatamente; a decisão e a escrita seguem sendo do servidor.
async function _closeExpiredLeagueSeason(ref, tId, nowIso) {
  const now = new Date(nowIso);
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    const before = _antesDoMotor(t);
    const result = _leagueSeasonCore.closeExpiredLeagueSeason(t, {
      expired: _ligaSeasonEnded(t, now), nowIso,
      computeStandings: drawWindow && drawWindow._computeStandings
    });
    if (!result.changed) return { ok: true, changed: false, reason: result.reason };
    const recipients = _seasonRecipientUids(t);
    const boundary = _gravaTorneio(tx, ref, t, before, { agoraIso: nowIso });
    if (recipients.length && !t.isSandbox && !t.notificationsMuted) {
      tx.set(ref.collection('notificationOutbox').doc('season-finished'), {
        schema: 1, kind: 'score-notification', type: 'tournament_finished',
        title: '🏁 Torneio encerrado',
        message: 'A temporada de ' + String(t.name || 'seu torneio') + ' foi encerrada.',
        tournamentId: String(tId), tournamentName: String(t.name || ''), matchId: '',
        fromUid: 'system', fromName: 'scoreplace.app', level: 'important',
        recipients, ctaLabel: 'Ver torneio', ctaUrl: 'https://scoreplace.app/#tournaments/' + String(tId),
        createdAt: nowIso, createdAtMs: Date.parse(nowIso), dispatchStatus: 'pending'
      }, { merge: true });
    }
    return { ok: true, changed: true, tournament: boundary.clean };
  });
}

// ─── SORTEIO INICIAL SOB DEMANDA (Etapa 3 · fase B) ─────────────────────────
// "Os cânones rodam em CF, disparados pelo app — assim evita cada usuário rodar uma
// função diferente com app desatualizado" (dono, jul/2026). O app PEDE, o servidor
// SORTEIA e GRAVA. Binário de loja velho deixa de sortear com motor velho.
//
// SPLIT CANÔNICO — painel ESCOLHE, servidor APLICA: os gates de re-sorteio e os painéis
// de resolução (pow2/resto/sem-dupla) são UI e FICAM no cliente. A ESCOLHA viaja no
// `request.data.decisions` e é aplicada AQUI, sobre o doc fresco, com as MESMAS funções do
// cliente (draw-decisions.js, vendorado).
//
// ⚠️ v1.2.29 — a versão anterior deste comentário dizia que "os painéis já gravam a decisão
// no doc, aqui só lê e executa". ERA FALSO e foi a causa da quebra revertida na v1.2.28: o
// que os painéis gravavam era o MODO; o ELENCO (quem foi pra espera / quem saiu) era mutado
// só em memória e ia pro banco de carona no delta do _commitInitialDraw do cliente. Sem esse
// commit, o delta some e o servidor lê o elenco VELHO — 35 inscritos viraram chave de 32 com
// 14 BYEs. Ver docs/sorteio-ciclo-decisoes.md.

// Espelha isTournamentAdmin() das firestore.rules:20. As rules protegem o WRITE; esta
// função protege o RPC — a CF grava com Admin SDK (bypassa rules), então sem isto
// qualquer autenticado sortearia o torneio de qualquer um. Os 4 caminhos são os mesmos,
// na mesma ordem. Se mudar lá, muda aqui.
/* ⛔ SÓ UID. Ordem do dono (26/ago): _"nada por nome ou email, sempre por uid a menos que
 * seja digitado por organizador e nao tenha uid. organizador sempre por uid."_
 *
 * Aqui existiam mais dois caminhos: (3) `adminEmails` e (4) recuperação por
 * `organizerEmail`. Os dois davam poder de ORGANIZADOR a quem apresentasse uma string de
 * e-mail igual — e e-mail não identifica ninguém: muda, se repete, e a pessoa que perde o
 * acesso ao e-mail não perde a conta (e vice-versa).
 *
 * ⭐ MEDIDO ANTES DE TIRAR (scripts/conferir-admin-por-uid.js): 39 e-mails de admin na base
 * inteira, **39 cobertos por uid**, e **ZERO** torneios sem `creatorUid`. Ou seja os dois
 * caminhos não salvavam ninguém — só abriam porta. As `firestore.rules` já eram uid puro
 * desde jul/2026; a CF é que tinha ficado para trás, e ficar para trás aqui é pior:
 * a CF roda com admin SDK e NÃO passa por regra nenhuma.
 * ⚠️ Se um dia um admin legítimo só existir por e-mail, o conserto é dar uid a ele
 * (`adminUids`), NUNCA reabrir a porta. */
function _isTournamentAdmin(t, uid) {
  if (!t || !uid) return false;
  // (1) creatorUid — o dono, imutável.
  if (typeof t.creatorUid === 'string' && t.creatorUid === uid) return true;
  // (2) adminUids — co-hosts ativos por UID (cobre co-host com email '' / conta por telefone).
  if (Array.isArray(t.adminUids) && t.adminUids.length > 0 && t.adminUids.indexOf(uid) !== -1) return true;
  return false;
}

// Espelha isTournamentParticipant das firestore.rules: memberUids primeiro (uid é a identidade
// primária), memberEmails só como FALLBACK quando memberUids está vazio (docs legados). Usado
// só pela closeRound — o fecho de rodada é disparado por quem salva o ÚLTIMO placar, que num
// resultEntry='players' é um PARTICIPANTE, não só admin. Seguro pq a CF computa o passo
// DETERMINÍSTICO do doc fresco (o caller só dispara o passo canônico). Ver project_uid_primary_identity.
/* ⛔ SÓ UID, pelo mesmo cânone. O fallback por `memberEmails` (quando `memberUids` estava
 * vazio) existia pra doc legado — e hoje `memberUids` é recomputado em TODO save, no
 * cliente e aqui (`_applyWriteBoundary`). Um doc sem `memberUids` e com `memberEmails` não
 * existe mais na base; e se aparecesse, deixar entrar por e-mail seria deixar entrar quem
 * tem a string, não quem é a pessoa. */
function _isTournamentParticipant(t, uid) {
  if (!t || !uid) return false;
  return Array.isArray(t.memberUids) && t.memberUids.indexOf(uid) !== -1;
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
/* ── LER E GRAVAR TORNEIO QUE TEVE OS JOGOS TIRADOS DO DOCUMENTO ───────────────────
 *
 * O doc do torneio tem teto de 1 MB e `rounds` é 45% do Confra. Tirar os jogos é o que
 * remove o teto — e o marcador `_semPesados` é o que diz, POR TORNEIO, que já saíram.
 * ⛔ O gatilho é o MARCADOR, nunca a ausência: torneio recém-criado também não tem jogo.
 *
 * ⚠️ CUSTO ASSUMIDO, dito antes de ligar: aplicar um placar passa a custar ~115 leituras
 * (a subcoleção inteira) em vez de 1. O motor precisa do torneio TODO pra avançar chave e
 * classificação — não dá pra aplicar placar lendo um jogo só. O que se ganha é do outro
 * lado e é maior: a ESCRITA cai de 214 KB pra ~1 KB, e o ECO pra cada tela aberta cai
 * junto. Leitura é barata; eco de 214 KB por ponto é pago por todo mundo na quadra.
 */
/* O estado ANTES do motor mexer — é contra ele que `jogosQueMudaram` compara pra saber
 * quais jogos gravar. Só clona quando vale: torneio inteiro no documento não precisa. */
function _antesDoMotor(t) {
  if (!t || !Array.isArray(t._semPesados) || !t._semPesados.length) return null;
  return JSON.parse(JSON.stringify(t));
}

async function _leTorneio(tx, ref, tId) {
  const snap = await tx.get(ref);
  if (!snap.exists) return null;
  const t = snap.data(); t.id = tId;
  // ⭐ UM CAMINHO SÓ (ver montarDoBanco no split-core). O que é daqui: ler coleção DENTRO
  // da transação — e transação exige todas as leituras antes de qualquer escrita, que é
  // por isso que esta função existe separada do gravador.
  const montado = await _tSplit.montarDoBanco(t, async (colecao) => {
    const s = await tx.get(ref.collection(colecao));
    return s.docs.map((d) => d.data());
  });
  montado.id = tId;
  return montado;
}

/* "Transação" só de leitura: `_leTorneio` pede um objeto com `.get(ref)`, e fora de uma
 * transação isso é o próprio `ref.get()`. Existe pra NÃO haver uma segunda montagem de
 * torneio dividido escrita à mão — duas versões da mesma leitura divergem. */
const _TX_LEITURA = { get: (r) => r.get() };

/* O fuso do LOCAL DO EVENTO, na ordem que o dono definiu: (a) declarado no evento;
 * (b) local/endereço/coordenada do evento; (c) cidade declarada do organizador;
 * (d) nada seguro → `{ tz: null, motivo }` e quem chama NÃO GERA.
 * ⛔ O passo (c) é a ÚNICA razão de isto ser async: ler o perfil custa uma leitura, então
 * só acontece quando o evento sozinho não resolveu. */
async function _fusoDoEvento(t) {
  const r = _agenda.resolverFuso(t, null);
  if (r.tz) return r;
  const uid = t && (t.creatorUid || t.organizerUid);
  if (!uid) return r;
  try {
    const s = await db.collection('users').doc(String(uid)).get();
    if (s.exists) return _agenda.resolverFuso(t, s.data() || {});
  } catch (e) { /* perfil ilegível: continua "não determinado", que é o desfecho seguro */ }
  return r;
}

/* ── L6.R1 · A TRAVA MANUAL × AUTOMÁTICO, DO LADO MANUAL ────────────────────────────────
 * Quando o organizador gera a rodada NA MÃO dentro de um slot que ainda estava devido, ele
 * CONSOME esse slot: o cron precisa reconhecer a geração e apenas agendar o próximo, em vez
 * de gerar de novo. A marca é a MESMA (`drawSlotAt`) e é gravada na MESMA transação que
 * grava a rodada — quem perder a corrida re-executa, relê e desiste.
 * ⛔ Não bloqueia o manual: se o slot já foi consumido, o organizador continua podendo
 * sortear (é direito dele, inclusive pra rodada de uma janela perdida). O que a marca faz é
 * impedir a SEGUNDA geração do MESMO slot.
 * Devolve o slot consumido, ou null quando o torneio não tem agenda automática.
 * ⛔ SÍNCRONA de propósito: roda DENTRO da transação, e transação não é lugar de leitura
 * fora do `tx`. O fuso é resolvido ANTES (uma vez, com `_fusoDoEvento`) e entra por
 * parâmetro — na re-execução da transação o valor já está em mãos. */
function _consumirSlotAgendado(t, nowMs, tz) {
  try {
    if (!tz || !drawWindow || typeof drawWindow._nextOwedDrawMs !== 'function') return null;
    if (typeof drawWindow._nextOwedDrawMs(t, nowMs) !== 'number') return null;  // sem sorteio previsto
    const fz = { tz: tz };
    const inc = !!(drawWindow._isIncrementalLigaPhase && drawWindow._isIncrementalLigaPhase(t));
    const cur = t.currentPhaseIndex || 0;
    const fonte = inc ? ((t.phases && t.phases[cur]) || {}) : t;
    const devido = _agenda.slotDevido(_agenda.cfgDeAgenda(fonte), nowMs, fz.tz);
    if (devido == null) return null;
    if (_agenda.slotReivindicado(t, devido)) return devido;   // já consumido — nada a escrever
    _agenda.reivindicarSlot(t, devido);
    return devido;
  } catch (e) { return null; }   // a trava nunca pode derrubar um sorteio manual
}


/* Grava o torneio respeitando o que saiu do documento. Devolve o mesmo `{persist, clean}`
 * de sempre, pra quem chama seguir devolvendo `clean` ao cliente sem saber de nada disto.
 * ⭐ Só os jogos que MUDARAM são escritos (`jogosQueMudaram`), que é o ponto inteiro: um
 * ponto de placar toca ~1 KB em vez de reescrever o torneio.
 * ⛔ E `participants`/`history` só saem do documento se estiverem NO MARCADOR — `dividir`
 * extrai os três por natureza, e gravar a config crua dele zeraria o elenco. */
function _gravaTorneio(tx, ref, tDepois, tAntes, ctx) {
  /* ⭐ 2.2 — ESTA PORTA PASSOU A DELEGAR AO PLANEJADOR ÚNICO (`write-plan.js`).
   * Ordem do revisor externo: a checagem de limite e o executor têm de consumir EXATAMENTE
   * o mesmo plano; um preflight que estime por fora pode divergir da escrita real, e aí o
   * teto mede um plano enquanto o banco recebe outro.
   * ⛔ O COMPORTAMENTO NÃO MUDA para quem já chamava aqui (`drawRound`, `closeRound`,
   * `applyMatchResult`, `autoDraw`): a lógica de dividir, de `jogosQueMudaram`, do espelho
   * de `results` e dos contadores foi MOVIDA, não reescrita. A suíte desses quatro é a
   * linha de base do refator e roda antes e depois.
   * ⚠️ ÚNICA diferença observável: o instante do espelho deixou de ser `new Date()` dentro
   * da transação e passa a vir por argumento — o retry do Firestore re-executa o callback,
   * e com `new Date()` cada tentativa produzia um espelho diferente.
   * ⛔ E NÃO HÁ FALLBACK AQUI: quem não passa `ctx.agoraIso` recebe erro. Um fallback neste
   * ponto reintroduziria exatamente o defeito, só que calado. Cada chamador calcula o
   * instante UMA vez, imediatamente antes de `db.runTransaction`. */
  /* ⛔ FALHA FECHADA, SEM FALLBACK AQUI DENTRO. Esta função roda dentro do callback de
   * `db.runTransaction`, que o Firestore RE-EXECUTA quando aborta. Qualquer `new Date()`
   * neste ponto faria a 2ª tentativa gerar um espelho de `results` e um plano diferentes
   * da 1ª — o retry deixaria de ser idempotente. O instante é da OPERAÇÃO, calculado uma
   * vez antes de abrir a transação, e chega por argumento. */
  const _agoraIso = ctx && ctx.agoraIso;
  if (!_agoraIso) {
    throw new Error('[write-plan] _gravaTorneio exige ctx.agoraIso — instante estável calculado FORA da transação');
  }
  const plan = _planejaEscrita(tDepois, tAntes, { agoraIso: _agoraIso, extras: (ctx && ctx.extras) || [] });
  _wp.applyPlan(tx, ref, plan, { FieldValue: FieldValue });
  return plan.boundary;
}

/* Monta o plano com as dependências do servidor. Separado de `_gravaTorneio` para que o
 * avanço de fase possa PLANEJAR, checar o teto e só então executar — com o mesmo objeto. */
function _planejaEscrita(tDepois, tAntes, opts) {
  const o = opts || {};
  return _wp.planWrites(tAntes, tDepois, {
    split: _tSplit,
    boundary: _applyWriteBoundary,
    agoraIso: o.agoraIso,
    espelho: _mrEspelho,
    tournamentId: o.tournamentId || (tDepois && tDepois.id) || null,
    extras: o.extras || [],
    onAviso: (m) => console.error(m)
  });
}

function _applyWriteBoundary(data) {
  const w = drawWindow;
  if (!w) throw new HttpsError('internal', 'draw-core indisponível');
  // NUNCA ENCOLHE (união com o que já está no doc): um uid que só existe no denormalizado
  // (co-host por path que não popula participants) não pode sumir e derrubar o listener
  // `array-contains` de quem depende dele. Mesma blindagem do cliente.
  // EXCEÇÃO: SANDBOX substitui (não une) — o memberUids do SB é só o dev, senão os uids
  // reais clonados voltam a cada gravação e o Firestore entrega o SB pra todo mundo.
  // _mergeMemberUids é o MESMO helper do cliente (vendorado de persist-core.js).
  data.adminEmails = w._computeAdminEmails(data);
  data.adminUids = w._computeAdminUids(data);
  data.memberUids = w._mergeMemberUids(data, data.memberUids, w._computeMemberUids(data));
  /* ── L6.R1 · O `nextDrawAt` CANÔNICO SAI DAQUI, e nunca do passado ────────────────────
   * Esta é a fronteira por onde TODA escrita do autodraw passa — sorteio manual, fecho de
   * rodada, placar e o cron. Por isso a regra do agendamento mora aqui e não em cada porta:
   * uma segunda régua de agenda em outro lugar divergiria em silêncio.
   * A separação é: `_nextOwedDrawMs` decide SE ainda há sorteio previsto (formato, manual,
   * temporada encerrada, fase de chave, rodadas da fase) e o `agenda-core` decide QUANDO —
   * no calendário e no FUSO DO EVENTO.
   * ⛔ E o resultado NUNCA é um instante vencido: ou é o slot cuja janela de 1 minuto ainda
   * está viva e não foi reivindicada, ou é o próximo slot do calendário. Era exatamente
   * isso que faltava — um `nextDrawAt` vencido reescrito a cada gravação prendia o
   * documento na consulta do cron pra sempre (L6.P1).
   * ⛔ Sem fuso seguro, o campo SAI: sem ele não há calendário, e chutar horário é pior que
   * não agendar. O diagnóstico é escrito por quem chama (autoDraw/autoDrawReconcile). */
  try {
    const owed = w._nextOwedDrawMs(data);
    if (typeof owed !== 'number') {
      delete data.nextDrawAt;
    } else {
      const _fz = _agenda.resolverFuso(data, null);
      if (!_fz.tz) {
        delete data.nextDrawAt;
      } else {
        const _inc = !!(w._isIncrementalLigaPhase && w._isIncrementalLigaPhase(data));
        const _cur = data.currentPhaseIndex || 0;
        const _fonte = _inc ? ((data.phases && data.phases[_cur]) || {}) : data;
        const _q = _agenda.agendamentoCanonico(_agenda.cfgDeAgenda(_fonte), data, Date.now(), _fz.tz);
        if (typeof _q === 'number') data.nextDrawAt = _q;
        else delete data.nextDrawAt;
      }
    }
  } catch (e) { /* otimização; nunca derruba a gravação */ }

  const clean = w._cleanUndefined(data);
  w._foldMonarchGroups(clean); // Rei/Rainha: grava só matchIds (fonte única = round.matches)
  // ── CLASSIFICAÇÃO É DERIVADA: NÃO VAI PRO BANCO (2.0.120) ────────────────────
  // Gêmea da nota em firebase-db.saveTournament. MEDIDO: 120 linhas gravadas em 2 torneios,
  // todas zeradas e nenhuma com uid — 12,5 KB (16%) do documento do Confra afirmando "0 jogo
  // disputado" num torneio com 115 jogos. O cálculo sobre o mesmo dado dá 95 pessoas com jogo.
  // ⚠️ Aqui a gravação é `tx.set` (substituição, não merge), então tirar daqui APAGA de
  // verdade — ao contrário do cliente, que só para de reescrever.
  // O payload do `pendingDraw` (mais abaixo) já lida com a ausência: quem lê é
  // `if (pd.standings)`, e sem ele a tela calcula pela porta `_standingsDoTorneio`.
  delete clean.standings;
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
  // Pacote de decisões do pré-sorteio (o organizador ESCOLHEU nos painéis; aqui a gente
  // APLICA, com as mesmas funções do cliente, sobre o doc fresco). Ver
  // docs/sorteio-ciclo-decisoes.md §5. Sem pacote = nada a aplicar (torneio sem pendência).
  const decisions = (request.data && request.data.decisions) || null;

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
  if (!_isTournamentAdmin(pre.data(), uid)) {
    const _p = pre.data();
    throw _drawFail('permission-denied', 'Só o organizador ou um co-organizador pode sortear.',
      { tId, uid, email: email || '(sem email)', creatorUid: _p.creatorUid,
        adminUids: _p.adminUids, adminEmails: _p.adminEmails, organizerEmail: _p.organizerEmail });
  }
  await _preloadDrawNames(pre.data()); // popula drawWindow._profileNameByUid
  // L6.R1: o fuso do evento é resolvido FORA da transação (pode custar uma leitura de
  // perfil) e entra na trava de slot lá dentro, que é síncrona.
  const _fzManual = await _fusoDoEvento(pre.data());

  // A VERSÃO no log é o contrato: se a linha não disser CF_VERSION, é build velha atendendo
  // (deploy não pegou / instância antiga). Sem isto não dá pra saber que código respondeu.
  console.log(`drawRound v${CF_VERSION}: pedido de ${uid} pro torneio ${tId}` + (allowRedraw ? ' [re-sorteio]' : '') +
    (decisions ? ' decisoes=' + JSON.stringify(decisions) : ' (sem decisoes)'));

  let out;
  try {
    /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
     * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
     * cada tentativa produzir espelho e plano diferentes. */
    const _agoraIsoTx = new Date().toISOString();
    out = await db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    const _tAntes = _antesDoMotor(t);
    if (decisions && decisions.groupConfig) { const g=decisions.groupConfig; t.gruposCount=parseInt(g.numGroups,10)||t.gruposCount; t.gruposClassified=parseInt(g.classPerGroup,10)||t.gruposClassified; if(g.advanceTotal) t.gruposAdvanceTotal=parseInt(g.advanceTotal,10); if(typeof g.equalOnly==='boolean') t.gruposEqualOnly=g.equalOnly; }
    if (decisions && (decisions.groupConfig || decisions.closeEnrollment)) { t.status='closed'; delete t._suspendedByPanel; delete t._previousStatus; }
    _enrichParticipantsFromProfiles(t); // v1.3.52: gênero/skill/etc. por uid (inscrito grava só uid)

    // Re-checa authz sobre o doc FRESCO: entre o read de fora e a transação o organizador
    // pode ter perdido o acesso (transferência de organização / co-host removido).
    if (!_isTournamentAdmin(t, uid)) {
      throw _drawFail('permission-denied', 'Só o organizador ou um co-organizador pode sortear (doc fresco).', { tId, uid });
    }

    // Rei/Rainha: o doc fresco traz grupos só com matchIds — hidrata ANTES do motor,
    // igual mutateTournament faz antes do mutator.
    try { drawWindow._hydrateMonarchGroups(t); } catch (e) { /* best-effort */ }

    // Régua do SORTEIO, não a do recompile: torneio RESETADO tem _phaseMaterialized=0 (o
    // reset grava assim) e o canRecompile barrava com 'already-drawn' sem haver chave —
    // e o cliente, que conta só matches/rounds/groups, nem pedia re-sorteio. Bug v1.2.29.
    const hadBracket = hasDrawnBracket(t);
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

    const res = drawInitial(t, { idStamp: Date.now(), decisions: decisions });
    if (!res || !res.ok) {
      // storePhase falho (ex.: 'no-entrants') NUNCA vira sucesso — era isso que dava
      // "diz que sorteou mas não mostra chave".
      throw _drawFail('failed-precondition', (res && res.reason) || 'draw-failed',
        { tId, format: t.format, teamSize: t.teamSize, enrollmentMode: t.enrollmentMode,
          participantes: (t.participants || []).length, p2Resolution: t.p2Resolution,
          decisoes: decisions, erro: (res && res.error) || '' });
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
    /* L6.R1 · MANUAL × AUTOMÁTICO: se havia um slot agendado devido, este sorteio o CONSOME
     * — na mesma transação que grava a rodada. O cron então reconhece a geração e apenas
     * agenda o próximo slot, em vez de sortear de novo. */
    const _slotManual = _consumirSlotAgendado(t, Date.now(), _fzManual && _fzManual.tz);
    if (_slotManual) console.log(`drawRound: slot ${new Date(_slotManual).toISOString()} consumido pelo manual (${_fzManual.tz})`);
    const b = _gravaTorneio(tx, ref, t, _tAntes, { agoraIso: _agoraIsoTx }); // clobber-free; divide se o marcador mandar
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

// ─── Integração de TARDIOS no servidor (v1.2.57) ────────────────────────────
// O organizador DISPARA ao abrir o bracket; a mutação (tardios entram na chave) + a
// persistência rodam AQUI, com as mesmas funções vendoradas que o cliente rodava. Espelha a
// estrutura da drawRound: authz (uid + admin), transação sobre o doc FRESCO, motor canônico,
// _applyWriteBoundary + tx.set (clobber-free). `changed=false` → NÃO grava (idempotente).
// Ver project_canon_runs_on_server / project_late_enrollment_elimination.
exports.integrateLateEntries = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!tId) throw new HttpsError('invalid-argument', 'tournamentId é obrigatório.');

  if (typeof integrateLateFn !== 'function' || !drawWindow) {
    throw _drawFail('internal', 'Motor de integração indisponível no servidor.', { tId });
  }

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentAdmin(pre.data(), uid)) {
    throw _drawFail('permission-denied', 'Só o organizador ou um co-organizador integra tardios.', { tId, uid });
  }
  await _preloadDrawNames(pre.data()); // nome vivo por uid antes de formar duplas/rótulos

  let out;
  try {
    /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
     * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
     * cada tentativa produzir espelho e plano diferentes. */
    const _agoraIsoTx = new Date().toISOString();
    out = await db.runTransaction(async (tx) => {
      const t = await _leTorneio(tx, ref, tId);
      if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const _tAntes = _antesDoMotor(t);
      if (!_isTournamentAdmin(t, uid)) {
        throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
      }
      // Rei/Rainha: o doc fresco traz grupos só com matchIds — hidrata ANTES do motor.
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) { /* best-effort */ }
      // ── v1.2.58 · SEM ISTO A FILA NUNCA FORMA GRUPO ────────────────────────────────
      // `_preloadDrawNames` acima popula só o MAPA `_profByUid`; quem ESCREVE `gender` nas
      // entradas é esta função — e ela faltava AQUI (as outras 5 chamadas do arquivo a
      // fazem; esta era a única sem). Consequência medida no doc real do Confra: as
      // entradas são strippadas desde a v1.3.52, no servidor `_genderForUid` é STUB que
      // devolve '' e `_pGender(p)` lê `p.gender` — ou seja, sem enriquecer, TODO MUNDO da
      // fila fica "sem gênero". E a regra da v1.7.16 ("sem gênero determinado NÃO entra em
      // grupo", criada depois do R1 Grupo B2 fechar com 3 homens) então barra a fila
      // inteira, em silêncio: `changed:false`, nenhum grupo, nenhum erro.
      // PROVADO com o módulo real contra o doc real: sem enriquecer → 31 grupos, changed
      // false; enriquecendo → 32 grupos (Marcos + M.Delia + Debora + Juliana) e Daniel
      // segue na fila, que é exatamente o que o dono descreveu.
      // ⚠️ O outro caminho que roda o mesmo motor (dentro do autoDraw) já enriquecia — por
      // isso a formação "funcionava antes": ela acontecia por LÁ. Só que aquele bloco só
      // visita torneio com `nextDrawAt`, e o Confra tem sorteio único já disparado.
      _enrichParticipantsFromProfiles(t);

      const res = integrateLateFn(t, {});
      if (!res || !res.ok) {
        throw _drawFail('failed-precondition', (res && res.reason) || 'integrate-failed', { tId, format: t.format });
      }
      // `recusas` viaja MESMO com changed=false — é justamente o caso "chave cheia": o
      // tardio está presente, NÃO entrou, e o organizador precisa saber por quê e o que
      // fazer. Devolver só `changed:false` aqui era silêncio, e silêncio foi o pecado da 1.5.x.
      if (!res.changed) return { ok: true, changed: false, recusas: res.recusas || [] };
      const b = _gravaTorneio(tx, ref, t, _tAntes, { agoraIso: _agoraIsoTx }); // clobber-free; divide se o marcador mandar
      // Devolve TODOS os contadores (v1.4.43): faltava `placed`/`repfill`/etc. — o "jogo 5" novo
      // (via _growAdefinir/_placeLateEntriesSurgically volta em `placed`) não aparecia no trace nem
      // disparava o toast, dando a impressão de "não criou" mesmo tendo criado. Todo caminho que muda
      // a chave TEM de aparecer no retorno. Ver [[project_late_dupla_fills_awaiting_slot]].
      return { ok: true, changed: true, extra: res.extra, duplas: res.duplas, duplasTier: res.duplasTier,
               dissolved: res.dissolved, monarch: res.monarch, repfill: res.repfill, placed: res.placed,
               wlClean: res.wlClean, recusas: res.recusas || [], tournament: b.clean };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(`integrateLateEntries EXPLODIU no torneio ${tId} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha na integração de tardios: ' + String((e && e.message) || e).slice(0, 300));
  }

  console.log(`integrateLateEntries v${CF_VERSION}: ${tId} por ${uid} — changed=${out.changed}` +
    (out.changed ? ` extra=${out.extra||0} duplas=${out.duplas||0}(tier${out.duplasTier||0}) dissolved=${out.dissolved||0} monarch=${out.monarch||0}` : ''));
  return out;
});

// ─── FORMAR dupla na LISTA DE ESPERA + INTEGRAR, atômico (CF-only) ──────────
// O cliente só dispara (key1/key2 = uid||nome dos 2 avulsos); a CF forma a dupla _lateJoin,
// marca presença, integra na chave e persiste — tudo numa transação. Devolve o doc pro cliente
// refletir SEM reload. Espelha integrateLateEntries (authz + txn + write-boundary).
exports.formLatePair = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  const key1 = String((request.data && request.data.key1) || '').trim();
  const key2 = String((request.data && request.data.key2) || '').trim();
  if (!tId || !key1 || !key2) throw new HttpsError('invalid-argument', 'tournamentId, key1 e key2 são obrigatórios.');
  if (typeof formLatePairFn !== 'function' || !drawWindow) throw _drawFail('internal', 'Motor indisponível.', { tId });

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentAdmin(pre.data(), uid)) throw _drawFail('permission-denied', 'Só o organizador ou co-organizador forma duplas.', { tId, uid });
  await _preloadDrawNames(pre.data());

  let out;
  try {
    /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
     * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
     * cada tentativa produzir espelho e plano diferentes. */
    const _agoraIsoTx = new Date().toISOString();
    out = await db.runTransaction(async (tx) => {
      const t = await _leTorneio(tx, ref, tId);
      if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const _tAntes = _antesDoMotor(t);
      if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) {}
      const res = formLatePairFn(t, { key1: key1, key2: key2, nowTs: Date.now() });
      if (!res || !res.ok) throw _drawFail('failed-precondition', (res && res.reason) || 'form-failed', { tId });
      const b = _gravaTorneio(tx, ref, t, _tAntes, { agoraIso: _agoraIsoTx });
      return { ok: true, formed: res.formed, integrated: res.integrated, tournament: b.clean };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(`formLatePair EXPLODIU ${tId} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha ao formar dupla: ' + String((e && e.message) || e).slice(0, 300));
  }
  console.log(`formLatePair v${CF_VERSION}: ${tId} por ${uid} — ${out.formed} · integrated.changed=${out.integrated && out.integrated.changed}`);
  return out;
});

// ─── DESFAZER dupla da LISTA DE ESPERA, atômico (CF-only) ──────────────────
exports.splitLatePair = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  const id1 = String((request.data && request.data.id1) || '').trim();
  const id2 = (request.data && request.data.id2 != null) ? String(request.data.id2).trim() : '';
  if (!tId || !id1) throw new HttpsError('invalid-argument', 'tournamentId e id1 são obrigatórios.');
  if (typeof splitLatePairFn !== 'function' || !drawWindow) throw _drawFail('internal', 'Motor indisponível.', { tId });

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentAdmin(pre.data(), uid)) throw _drawFail('permission-denied', 'Só o organizador ou co-organizador desfaz duplas.', { tId, uid });
  await _preloadDrawNames(pre.data());

  let out;
  try {
    /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
     * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
     * cada tentativa produzir espelho e plano diferentes. */
    const _agoraIsoTx = new Date().toISOString();
    out = await db.runTransaction(async (tx) => {
      const t = await _leTorneio(tx, ref, tId);
      if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const _tAntes = _antesDoMotor(t);
      if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) {}
      const res = splitLatePairFn(t, { id1: id1, id2: id2 });
      if (!res || !res.ok) throw _drawFail('failed-precondition', (res && res.reason) || 'split-failed', { tId });
      const b = _gravaTorneio(tx, ref, t, _tAntes, { agoraIso: _agoraIsoTx });
      return { ok: true, split: res.split, tournament: b.clean };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(`splitLatePair EXPLODIU ${tId} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha ao desfazer dupla: ' + String((e && e.message) || e).slice(0, 300));
  }
  console.log(`splitLatePair v${CF_VERSION}: ${tId} por ${uid} — ${out.split}`);
  return out;
});

// ─── FECHO de rodada no servidor (Suíço-pow2, Opção B) ──────────────────────
// O cliente DISPARA ao salvar o último placar da rodada; a mutação (gera a próxima rodada
// Suíço / marca a classificatória completa) + a persistência rodam AQUI, com as MESMAS funções
// vendoradas que o cliente rodava. Espelha drawRound/integrateLateEntries (authz + txn sobre o
// doc FRESCO + closeRoundCore + _applyWriteBoundary + tx.set clobber-free). Guards de
// concorrência (stale-round/already-closed/round-incomplete) → NÃO grava, devolve o motivo
// (outro fechou primeiro / echo). AUTHZ = PARTICIPANTE (o fecho é disparado por quem salva o
// placar, num resultEntry='players' pode ser participante) — difere do drawRound (admin-only).
// Ver project_draw_canonization_cf_phase23_deferred / project_concurrency_safe_saves.

// ─── applyMatchResult (v1.7): QUEM pode lançar o placar, decidido no SERVIDOR ───────
// O cliente segue INTERPRETANDO o placar (GSM/tie-break/sets pela config do torneio) e
// manda o `payload` pronto — o que muda é que a AUTORIZAÇÃO deixa de morar só no
// navegador: resultEntry POR FASE, o lado do jogador por uid e a fase da negociação
// (proposta → contraproposta → disputa) passam a ser checados aqui, sobre o doc FRESCO.
//
// AUTHZ = PARTICIPANTE ou ADMIN (igual closeRound, diferente do drawRound que é admin-only):
// num resultEntry='players' quem lança é jogador. Quem decide de fato é o result-core.
//
// ⚠️ ISTO AINDA NÃO É AUTORIDADE ABSOLUTA: as firestore.rules continuam deixando o
// participante escrever `matches` direto (é o que mantém o app de loja antigo funcionando
// — ele não chama esta CF e não tem auto-update). Fechar essa porta é passo SEPARADO, só
// quando o piso das lojas alcançar. Ver [[project_result_launch_cf_evaluation]] §5.
/* ── O MIOLO DO LANÇAMENTO DE PLACAR, EM UM LUGAR SÓ ───────────────────────────────
 * Duas portas chegam aqui: a CHAMADA direta (`applyMatchResult`, quando há sinal) e a
 * FILA (`applyQueuedResult`, quando não havia). ⛔ Elas NÃO podem ter cada uma a sua
 * aplicação — divergir é exatamente o problema que a fila existe pra resolver, e a ordem
 * do dono é clara: _"imagina diferentes clientes com diferentes versões... de forma
 * alguma. tudo na cf"_. Duas versões DENTRO da CF seria o mesmo defeito, um andar acima.
 * Devolve { ok, outcome, tournament } ou { ok:false, reason } — recusa é resposta
 * legítima ("o outro time já lançou"), não falha de infra.
 */
async function _aplicaPlacarNaTransacao(db, tId, matchId, payload, ator, logMessage) {
  const ref = db.collection('tournaments').doc(tId);
  // Recibo independente do documento do torneio. O id nasce fora do callback porque a
  // transação pode repetir; assim uma repetição não cria dois fatos de auditoria.
  const auditRef = ref.collection('scoreAudit').doc();
  // A entrega de aviso nasce no MESMO commit do placar. O navegador não é uma
  // fonte confiável para esse fato: ele pode ainda ter o card anterior na memória
  // (o incidente Fabio/Priscila, que enviou `?` apesar de 6-2, 6-2 já estar no
  // servidor). O gatilho abaixo consome esta caixa de saída de forma idempotente.
  const notifOutboxRef = ref.collection('notificationOutbox').doc(auditRef.id);
  /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
   * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
   * cada tentativa produzir espelho e plano diferentes. */
  const _agoraIsoTx = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) return { ok: false, reason: 'not-found' };
    const _tAntes = _antesDoMotor(t);
    _enrichParticipantsFromProfiles(t);
    const _matchAntes = (typeof drawWindow._findMatch === 'function')
      ? _scoreAuditSnapshot(drawWindow._findMatch(t, matchId)) : null;
    // A aprovação consome pendingResult. Guardamos a proposta ANTES de o motor
    // removê-la para que a comunicação posterior não atribua o lançamento a quem
    // apenas confirmou (incidente do organizador identificado pelo e-mail).
    const _pendingAntes = (typeof drawWindow._findMatch === 'function')
      ? (() => { const m = drawWindow._findMatch(t, matchId); return m && m.pendingResult ? JSON.parse(JSON.stringify(m.pendingResult)) : null; })()
      : null;
    // Re-checa sobre o doc FRESCO (acesso pode ter mudado entre o read e a txn).
    if (!_isTournamentParticipant(t, ator.uid) && !_isTournamentAdmin(t, ator.uid)) {
      return { ok: false, reason: 'permission-denied' };
    }
    try { drawWindow._hydrateMonarchGroups(t); } catch (e) { /* best-effort */ }
    const res = applyResultFn(t, {
      matchId: matchId, payload: payload, actor: { uid: ator.uid, email: ator.email || '', name: ator.name || '' },
      logMessage: logMessage
    });
    if (!res || !res.ok) return { ok: false, reason: (res && res.reason) || 'apply-failed' };
    const b = _gravaTorneio(tx, ref, t, _tAntes, { agoraIso: _agoraIsoTx }); // clobber-free; divide se o marcador mandar
    // O mesmo commit do placar contém o antes/depois. Diferentemente do histórico de
    // interface, este recibo não depende de um cliente chegar ao fim da operação e não é
    // reescrito quando o espelho ou o documento principal forem podados.
    tx.set(auditRef, {
      schema: 1,
      kind: 'score-write',
      tournamentId: tId,
      matchId: matchId,
      actorUid: String(ator.uid || ''),
      actorEmail: String(ator.email || ''),
      outcome: res.outcome || 'applied',
      at: _agoraIsoTx,
      before: _matchAntes,
      after: (typeof drawWindow._findMatch === 'function')
        ? _scoreAuditSnapshot(drawWindow._findMatch(t, matchId)) : null,
      payload: _scoreAuditPayload(payload),
      logMessage: String(logMessage || '')
    });
    const _matchDepois = (typeof drawWindow._findMatch === 'function')
      ? drawWindow._findMatch(t, matchId) : null;
    const _notif = _scoreNotificationEvent(t, _matchDepois, res.outcome, ator, _agoraIsoTx, {
      action: payload && payload.action,
      pendingBefore: _pendingAntes,
      liveNames: ator.liveNames || {}
    });
    const _transitionNotif = res.outcome === 'disputed'
      ? _disputeNotificationEvent(t, _matchDepois, ator, _agoraIsoTx)
      : (res.outcome === 'match-reset' || res.outcome === 'result-reopened' || res.outcome === 'wo-reverted')
        ? _matchReopenedNotificationEvent(t, _matchDepois, res.outcome, ator, _agoraIsoTx) : null;
    if (_notif || _transitionNotif) tx.set(notifOutboxRef, _notif || _transitionNotif);
    return { ok: true, outcome: res.outcome, tournament: b.clean };
  });
}

// ─── Caixa de saída canônica de placar ──────────────────────────────────────
// Um resultado só vira comunicação quando há sets completos e válidos. Nunca
// substituímos dado ausente por "?": melhor não comunicar do que avisar um
// placar inexistente. O recibo scoreAudit acima continua registrando o fato para
// investigação, inclusive nesses casos anômalos.
function _notificationScoreboard(m, pending) {
  const source = pending ? (m && m.pendingResult) : m;
  if (!m || !source || !Array.isArray(source.sets) || !source.sets.length) return null;
  const sets = source.sets.map((s, i) => {
    const p1 = s && s.gamesP1, p2 = s && s.gamesP2;
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
    return { label: s.superTiebreak ? 'STB' : ('Set ' + (i + 1)), p1, p2, superTiebreak: !!s.superTiebreak };
  });
  if (sets.some(s => !s)) return null;
  return { p1: String(m.p1 || ''), p2: String(m.p2 || ''), winner: String(source.winner || ''), sets };
}

function _scoreNotificationRecipients(t, m, pending) {
  const all = new Set();
  const p1 = _slotUidsOf(m, 'p1'), p2 = _slotUidsOf(m, 'p2');
  if (pending) {
    const proposer = String((m.pendingResult && m.pendingResult.proposedBy) || '');
    const proposerOnP1 = proposer && p1.indexOf(proposer) !== -1;
    const proposerOnP2 = proposer && p2.indexOf(proposer) !== -1;
    // O outro time confirma; o próprio time já conhece o que lançou.
    (proposerOnP1 ? p2 : proposerOnP2 ? p1 : []).forEach(uid => all.add(uid));
  } else {
    p1.concat(p2).forEach(uid => all.add(uid));
  }
  // Organizador e co-organizadores recebem sempre o acompanhamento oficial.
  if (t && t.creatorUid) all.add(String(t.creatorUid));
  (t && Array.isArray(t.adminUids) ? t.adminUids : []).forEach(uid => { if (uid) all.add(String(uid)); });
  return Array.from(all);
}

function _notificationPersonName(value, fallback) {
  const name = String(value || '').trim();
  // E-mail é identificador técnico, nunca autoria para participantes. Dados
  // históricos ainda podem carregá-lo em proposedByName; nesse caso preferimos
  // o papel compreensível a repetir um endereço no toast ou e-mail.
  return name && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name) ? name : fallback;
}

function _scoreNotificationEvent(t, m, outcome, actor, at, context) {
  // Disputa nunca é confirmação: mesmo que o jogo conserve sets de um placar
  // anterior, só a notificação própria da transição pode sair da transação.
  if (!m || outcome === 'in-progress' || outcome === 'disputed') return null;
  const pending = outcome === 'pending';
  const ctx = context || {};
  const proposal = pending ? m.pendingResult : ctx.pendingBefore;
  const scoreboard = _notificationScoreboard(m, pending);
  if (!scoreboard || !scoreboard.p1 || !scoreboard.p2) return null;
  const compact = (side) => scoreboard.sets.map(s => String(s[side])).join(' ');
  const proposerUid = String(proposal && proposal.proposedBy || '');
  const liveProposerName = ctx.liveNames && ctx.liveNames[proposerUid];
  const proposerName = _notificationPersonName(
    proposal && proposal.proposedByName,
    _notificationPersonName(liveProposerName, 'Jogador')
  );
  const actorFallback = _isTournamentAdmin(t, actor && actor.uid) ? 'Organizador' : 'Jogador';
  const confirmerName = _notificationPersonName(actor && actor.name, actorFallback);
  const isApproval = !pending && ctx.action === 'approve-pending' && !!proposal;
  const authorName = pending || !isApproval ? proposerName : confirmerName;
  const type = pending ? 'match-pending-approval' : 'result';
  const messagePrefix = isApproval
    ? confirmerName + ' confirmou o resultado lançado por ' + proposerName + ':'
    : proposerName + ' lançou:';
  return {
    schema: 1,
    kind: 'score-notification',
    type,
    title: pending ? '⏳ Resultado precisa de aprovação' : '✅ Resultado confirmado',
    message: messagePrefix + '\n' + scoreboard.p1 + ' ' + compact('p1') + '\nvs\n' + scoreboard.p2 + ' ' + compact('p2'),
    tournamentId: String(t.id || ''),
    tournamentName: String(t.name || ''),
    matchId: String(m.id || ''),
    fromUid: String((isApproval ? actor && actor.uid : proposerUid || actor && actor.uid) || ''),
    fromName: authorName,
    level: 'fundamental',
    scoreboard,
    recipients: _scoreNotificationRecipients(t, m, pending),
    createdAt: at,
    createdAtMs: Date.parse(at),
    dispatchStatus: 'pending'
  };
}

// Contestação não tem novo placar para comunicar; ela é uma transição do fluxo. Ainda
// assim o aviso nasce junto com a mudança canônica, nunca do navegador que apertou o botão.
function _disputeNotificationEvent(t, m, actor, at) {
  if (!t || !m) return null;
  const recipients = new Set();
  if (t.creatorUid) recipients.add(String(t.creatorUid));
  (Array.isArray(t.adminUids) ? t.adminUids : []).forEach(uid => { if (uid) recipients.add(String(uid)); });
  const who = String((m.pendingResult && m.pendingResult.disputedByName) || actor.name || actor.email || 'Alguém');
  return {
    schema: 1,
    kind: 'score-notification',
    type: 'match-disputed',
    title: '🚨 Resultado em disputa',
    message: String(m.p1 || '') + ' vs ' + String(m.p2 || '') + ' — contestado por ' + who + '. Intervenha para resolver.',
    tournamentId: String(t.id || ''),
    tournamentName: String(t.name || ''),
    matchId: String(m.id || ''),
    fromUid: String(actor.uid || ''),
    fromName: who,
    level: 'fundamental',
    recipients: Array.from(recipients),
    createdAt: at,
    createdAtMs: Date.parse(at),
    dispatchStatus: 'pending'
  };
}

// Reabertura é uma transição, não um resultado: nasce no mesmo commit que limpa o
// placar e nunca no telefone do organizador. Assim participantes recebem o aviso mesmo
// quando o browser fecha logo depois de apertar o botão.
function _matchReopenedNotificationEvent(t, m, outcome, actor, at) {
  if (!t || !m) return null;
  const recipients = new Set(_slotUidsOf(m, 'p1').concat(_slotUidsOf(m, 'p2')));
  if (t.creatorUid) recipients.add(String(t.creatorUid));
  (Array.isArray(t.adminUids) ? t.adminUids : []).forEach(uid => { if (uid) recipients.add(String(uid)); });
  const isWo = outcome === 'wo-reverted';
  const title = isWo ? '↩️ W.O. revertido pelo organizador' : '🔄 Partida reaberta pelo organizador';
  const suffix = isWo
    ? 'o organizador desfez o W.O. A partida está reaberta e deve ser jogada.'
    : 'o organizador zerou o placar. A partida deve ser jogada novamente.';
  return {
    schema: 1, kind: 'score-notification', type: isWo ? 'wo-reverted' : 'match-reset', title,
    message: String(m.p1 || '') + ' vs ' + String(m.p2 || '') + ' — ' + suffix,
    tournamentId: String(t.id || ''), tournamentName: String(t.name || ''), matchId: String(m.id || ''),
    fromUid: String(actor.uid || ''), fromName: String(actor.name || actor.email || 'Organizador'),
    level: 'fundamental', recipients: Array.from(recipients), createdAt: at,
    createdAtMs: Date.parse(at), dispatchStatus: 'pending'
  };
}

function _outboxDocIdPart(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 500);
}

// A transação só escreve o fato. Este gatilho faz I/O depois do commit e pode
// repetir sem duplicar: cada aviso e cada item da fila usa o id da outbox.
exports.deliverScoreNotification = onDocumentCreated(
  { document: 'tournaments/{tournamentId}/notificationOutbox/{eventId}', region: 'us-central1', timeoutSeconds: 120 },
  async (event) => {
    const item = event.data && event.data.data();
    if (!item || !['score-notification', 'tournament-notification'].includes(item.kind)) return;
    const tId = String(event.params.tournamentId || item.tournamentId || '');
    const eventId = String(event.params.eventId || '');
    const recipients = Array.isArray(item.recipients) ? Array.from(new Set(item.recipients.map(String).filter(Boolean))) : [];
    const profiles = await _loadLiveNames(new Set(recipients));
    const now = Date.now();
    const day = String(item.createdAt || new Date(now).toISOString()).slice(0, 10);
    let batch = db.batch(); let writes = 0;
    const commit = async () => {
      if (!writes) return;
      await batch.commit();
      batch = db.batch();
      writes = 0;
    };
    for (const uid of recipients) {
      const profile = profiles.profByUid[uid];
      if (!profile) continue;
      const key = _outboxDocIdPart(eventId + '_' + uid);
      if (profile.notifyPlatform !== false) {
        batch.set(db.collection('users').doc(uid).collection('notifications').doc('score_' + key), {
          type: item.type, title: item.title, message: item.message,
          tournamentId: tId, tournamentName: item.tournamentName || '', matchId: item.matchId || '',
          fromUid: item.fromUid || '', fromName: item.fromName || '', fromPhoto: '',
          level: item.level || 'fundamental', scoreboard: item.scoreboard || null,
          createdAt: item.createdAt || new Date(now).toISOString(), timestamp: item.createdAtMs || now, read: false,
          outboxEventId: eventId
        }, { merge: true });
        if (++writes >= 380) await commit();
      }
      if (!_notifLevelOk(profile.notifyLevel, item.level || 'fundamental')) continue;
      for (const email of _profileEmails(profile)) {
        const eKey = _outboxDocIdPart(eventId + '_' + uid + '_' + email);
        batch.set(db.collection('notif_email_queue').doc('score_' + eKey), {
          email, level: item.level || 'fundamental', message: item.message || '',
          tournamentName: item.tournamentName || '', tournamentUrl: 'https://scoreplace.app/#tournaments/' + tId,
          ctaLabel: item.ctaLabel || 'Conferir placar', ctaUrl: item.ctaUrl || ('https://scoreplace.app/#tournaments/' + tId),
          scoreboard: item.scoreboard || null, createdAt: now, flushAtMs: now + 5 * 60 * 1000,
          outboxEventId: eventId, recipientUid: uid, day
        }, { merge: true });
        if (++writes >= 380) await commit();
      }
    }
    await commit();
    await event.data.ref.set({ dispatchStatus: 'dispatched', dispatchedAt: new Date().toISOString() }, { merge: true });
  }
);

// ─── Consenso de W.O.: contexto fresco, consenso e motor na mesma transação ───────
// O browser só aponta ids.  Nome, integrantes, adversário, permissões e o motor são
// todos recompostos aqui, a partir do documento que a transação acabou de reler.
function _woClaimContext(t, raw) {
  const scope = raw && raw.scope === 'group' ? 'group' : 'match';
  const all = typeof drawWindow._collectAllMatches === 'function' ? drawWindow._collectAllMatches(t) : (t.matches || []);
  const nameOf = uid => (typeof drawWindow._memberNameByUid === 'function' ? drawWindow._memberNameByUid(t, uid) : '') || String(uid || '');
  if (scope === 'match') {
    const id = String(raw && raw.matchId || '');
    const match = all.find(m => m && String(m.id) === id);
    if (!match) return null;
    const sides = {};
    ['p1', 'p2'].forEach(side => {
      const uids = _slotUidsOf(match, side).filter(Boolean).map(String);
      sides[side] = { name: String(match[side] || ''), uids };
    });
    const members = uniqueWoMembers(Object.entries(sides).flatMap(([side, value]) => value.uids.length
      ? value.uids.map(uid => ({ uid, name: nameOf(uid) })) : (value.name ? [{ uid: '', name: value.name, side }] : [])));
    return { key: 'm|' + id, scope, matchId: id, match, matchIds: [id], matchSides: sides,
      members, memberUids: members.map(m => m.uid), isLeague: false };
  }
  const roundIndex = Number(raw && raw.roundIndex);
  const groupName = String(raw && raw.groupName || '');
  const round = Array.isArray(t.rounds) ? t.rounds[roundIndex] : null;
  const group = round && Array.isArray(round.monarchGroups) ? round.monarchGroups.find(g => g && String(g.name) === groupName) : null;
  if (!group) return null;
  const players = Array.isArray(group.players) ? group.players : [];
  const playerUids = Array.isArray(group.playersUids) ? group.playersUids : [];
  const members = uniqueWoMembers(players.map((name, index) => ({ uid: String(playerUids[index] || ''), name: String(name || '') })).filter(m => m.uid));
  const matchIds = all.filter(m => m && (String(m.groupName || '') === groupName || String(m.group || '') === groupName || String(m.monarchGroup || '') === groupName)).map(m => String(m.id));
  return { key: 'g|' + roundIndex + '|' + groupName, scope, roundIndex, groupName, group, matchIds,
    members, memberUids: members.map(m => m.uid), isLeague: true };
}
function uniqueWoMembers(entries) {
  const seen = new Set();
  return entries.filter(m => {
    const key = m && (m.uid ? 'u:' + String(m.uid) : (m.name ? 'n:' + String(m.name) : ''));
    return !!key && !seen.has(key) && seen.add(key);
  });
}

exports.manageWOClaim = onCall(async request => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const action = String(data.action || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !action) throw new HttpsError('invalid-argument', 'Torneio e ação são obrigatórios.');
  if (typeof applyWoFn !== 'function' || !drawWindow) throw _drawFail('internal', 'Motor de W.O. indisponível no servidor.', { tId });
  const ref = db.collection('tournaments').doc(tId);
  const agoraIso = new Date().toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
    await _preloadDrawNames(t);
    _enrichParticipantsFromProfiles(t);
    const existing = action === 'declare' ? null : _woClaimCore.claimOf(t, String(data.claimId || ''));
    const ctxRaw = action === 'declare' ? data.context : (existing || {});
    const ctx = _woClaimContext(t, ctxRaw);
    if (!ctx) throw _drawFail('failed-precondition', 'O jogo ou grupo não existe mais no torneio fresco.', { tId, action });
    const before = _antesDoMotor(t);
    const step = _woClaimCore.transition(t, {
      action, uid, isAdmin: _isTournamentAdmin(t, uid), context: ctx,
      absentUid: String(data.absentUid || ''), absentName: String(data.absentName || ''), byName: String(data.byName || ''),
      claimId: action === 'declare' ? ('wo_' + Date.now() + '_' + Math.floor(Math.random() * 1e6)) : String(data.claimId || ''),
      choice: String(data.choice || ''), now: agoraIso
    });
    if (!step.ok) throw _drawFail(step.reason === 'permission-denied' ? 'permission-denied' : 'failed-precondition', 'Ação de W.O. não é válida no estado atual.', { tId, action, reason: step.reason });
    let motor = null;
    if (step.apply) {
      const claim = step.claim;
      const motorOpts = {
        absentName: claim.absentName, absentUids: claim.absentUids, scope: ctx.scope,
        matches: ctx.scope === 'group' ? ctx.matchIds.map(id => (typeof drawWindow._collectAllMatches === 'function' ? drawWindow._collectAllMatches(t) : []).find(m => String(m.id) === id)).filter(Boolean) : [ctx.match],
        roundIndex: ctx.roundIndex, groupName: ctx.groupName, noSubBehavior: 'escalate',
        woScope: t.woScope || 'individual', offerOutcomeChoice: !!step.offerOutcomeChoice,
        outcomeChoice: step.choice || null
      };
      // `needsOutcomeChoice` é uma sondagem: o motor marca ausência antes de
      // chegar nessa decisão. Rodá-lo numa cópia impede que uma escolha ainda não
      // feita deixe qualquer marca no documento canônico.
      const probe = JSON.parse(JSON.stringify(t));
      const probeResult = applyWoFn(probe, motorOpts);
      if (probeResult && probeResult.outcome === 'needsOutcomeChoice') {
        const boundary = _gravaTorneio(tx, ref, t, before, { agoraIso });
        return { ok: true, changed: !!step.changed, needsOutcomeChoice: true, claim: step.claim, outcome: probeResult, tournament: boundary.clean };
      }
      motor = applyWoFn(t, motorOpts);
      if (!motor || !motor.ok) throw _drawFail('failed-precondition', 'O motor recusou aplicar este W.O.', { tId, action, reason: motor && motor.reason });
      claim.status = 'applied'; claim.resolvedAt = agoraIso;
      if (step.choice) claim.outcomeStage = 'resolved';
    }
    const boundary = _gravaTorneio(tx, ref, t, before, { agoraIso });
    return { ok: true, changed: !!step.changed || !!step.apply, claim: step.claim, outcome: motor, tournament: boundary.clean,
      requiresGroupReplacement: !!(motor && motor.outcome === 'ligaDelegated') };
  });
});

// ─── W.O. declarado pela organização: intenção fina, motor e escrita no servidor ───
// O navegador não monta mapas nem propaga chave. Ele só informa a pessoa escolhida;
// a CF relê o torneio, revalida a organização e roda o motor vendored na transação.
exports.applyTournamentWO = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const absentName = String(data.absentName || '').trim();
  const requestedUid = String(data.absentUid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || (!absentName && !requestedUid)) throw new HttpsError('invalid-argument', 'Torneio e participante são obrigatórios.');
  if (typeof applyWoFn !== 'function' || !drawWindow) throw _drawFail('internal', 'Motor de W.O. indisponível no servidor.', { tId });

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentAdmin(pre.data(), uid)) throw _drawFail('permission-denied', 'Só a organização pode declarar W.O.', { tId, uid });
  await _preloadDrawNames(pre.data());
  const agoraIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
    _enrichParticipantsFromProfiles(t);

    // O nome recebido é somente o alvo de interface. Ele precisa existir no roster
    // fresco; uid(s) são derivados aqui para que homônimos não possam redirecionar W.O.
    const entries = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    const entry = entries.find((p) => {
      const uids = typeof drawWindow._participantUids === 'function' ? drawWindow._participantUids(p).filter(Boolean) : [];
      if (requestedUid) return uids.includes(requestedUid);
      const display = typeof drawWindow._pName === 'function' ? drawWindow._pName(p, '') : String((p && (p.displayName || p.name)) || '');
      return display === absentName || display.split('/').map(x => x.trim()).includes(absentName);
    });
    if (!entry) throw _drawFail('not-found', 'Participante não pertence mais ao torneio.', { tId, uid, absentName, requestedUid });
    const entryUids = typeof drawWindow._participantUids === 'function' ? drawWindow._participantUids(entry).filter(Boolean) : [];
    const targetUids = requestedUid ? [requestedUid] : (typeof drawWindow._memberUidByName === 'function' ? [drawWindow._memberUidByName(t, absentName)].filter(Boolean) : entryUids);
    const canonicalName = requestedUid && typeof drawWindow._memberNameByUid === 'function'
      ? (drawWindow._memberNameByUid(t, requestedUid) || absentName) : absentName;
    if (!canonicalName) throw _drawFail('not-found', 'Participante não pertence mais ao torneio.', { tId, uid, requestedUid });
    const before = _antesDoMotor(t);
    const result = applyWoFn(t, {
      absentName: canonicalName,
      absentUids: targetUids,
      scope: 'match',
      noSubBehavior: 'wait',
      woScope: t.woScope || 'individual'
    });
    if (!result || !result.ok) return { ok: false, result: result || { outcome: 'error' } };
    const boundary = _gravaTorneio(tx, ref, t, before, { agoraIso });
    return { ok: true, result, tournament: boundary.clean };
  });
});

// ─── Presença da organização com substituição de W.O. ─────────────────────────
// Quando já há ausentes, marcar alguém presente pode mudar a chave. Por isso a
// intenção não pode voltar ao navegador: a Function aplica presença + motor de
// substituições dentro da mesma transação e devolve o estado canônico.
exports.setTournamentPresenceWithWOSubstitution = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const targetUid = String(data.targetUid || '').trim();
  const targetName = String(data.targetName || '').trim();
  const action = String(data.action || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || (!targetUid && !targetName)) throw new HttpsError('invalid-argument', 'Torneio e participante são obrigatórios.');
  if (action !== 'present' && action !== 'clear') throw new HttpsError('invalid-argument', 'Ação de presença inválida.');
  if (typeof setPresenceWithWOSubstitutionFn !== 'function' || !drawWindow) {
    throw _drawFail('internal', 'Motor de presença indisponível no servidor.', { tId });
  }

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentAdmin(pre.data(), uid)) throw _drawFail('permission-denied', 'Só a organização controla esta presença.', { tId, uid });
  await _preloadDrawNames(pre.data());
  const agoraIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
    _enrichParticipantsFromProfiles(t);

    const pools = ['participants', 'standbyParticipants', 'waitlist'];
    let target = null;
    let targetIsStandby = false;
    for (const key of pools) {
      const entries = Array.isArray(t[key]) ? t[key] : Object.values(t[key] || {});
      const found = entries.find((p) => {
        const uids = typeof drawWindow._participantUids === 'function' ? drawWindow._participantUids(p).filter(Boolean) : [];
        if (targetUid) return uids.includes(targetUid);
        const display = typeof drawWindow._pName === 'function' ? drawWindow._pName(p, '') : String((p && (p.displayName || p.name)) || '');
        return display === targetName || display.split('/').map(x => x.trim()).includes(targetName);
      });
      if (found) { target = found; targetIsStandby = key !== 'participants'; break; }
    }
    if (!target) throw _drawFail('not-found', 'Participante não pertence mais ao torneio.', { tId, uid, targetUid, targetName });

    const resolvedUid = targetUid || ((typeof drawWindow._memberUidByName === 'function' && targetName)
      ? String(drawWindow._memberUidByName(t, targetName) || '') : '');
    const canonicalName = resolvedUid && typeof drawWindow._memberNameByUid === 'function'
      ? (drawWindow._memberNameByUid(t, resolvedUid) || targetName) : targetName;
    const who = resolvedUid ? { uid: resolvedUid, displayName: canonicalName } : canonicalName;
    if (!canonicalName && !resolvedUid) throw _drawFail('not-found', 'Participante não pertence mais ao torneio.', { tId, uid });
    if (action === 'present' && targetIsStandby && typeof drawWindow._idMapHas === 'function' && drawWindow._idMapHas(t, t.absent || {}, who)) {
      throw _drawFail('failed-precondition', 'Use Reverter para reativar este suplente.', { tId, uid, targetUid: resolvedUid });
    }

    const before = _antesDoMotor(t);
    const result = setPresenceWithWOSubstitutionFn(t, { uid: resolvedUid, name: canonicalName, action, at: Date.now() });
    if (!result || !result.ok) return { ok: false, result: result || { reason: 'error' } };
    const boundary = _gravaTorneio(tx, ref, t, before, { agoraIso });
    return { ok: true, result, tournament: boundary.clean };
  });
});

// ─── Escolha explícita de substituto que quebra categoria ────────────────────
// A tela somente escolhe entre as opções que a própria Function registrou. O
// aceite (ou o W.O. definitivo) é reaplicado no documento fresco para impedir
// que uma pendência vencida ou um UID injetado alterem a chave.
exports.resolveWOSubstitutionChoice = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const absentUid = String(data.absentUid || '').trim();
  const substituteUid = String(data.substituteUid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !absentUid) throw new HttpsError('invalid-argument', 'Torneio e ausência são obrigatórios.');
  if (typeof resolveWOSubstitutionChoiceFn !== 'function' || !drawWindow) {
    throw _drawFail('internal', 'Motor de substituição indisponível no servidor.', { tId });
  }

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentAdmin(pre.data(), uid)) throw _drawFail('permission-denied', 'Só a organização escolhe o substituto.', { tId, uid });
  await _preloadDrawNames(pre.data());
  const agoraIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
    _enrichParticipantsFromProfiles(t);
    const choice = (Array.isArray(t.woSubChoices) ? t.woSubChoices : []).find((x) => x && String(x.absentUid || '') === absentUid && !x.resolved);
    if (!choice) throw _drawFail('failed-precondition', 'Esta escolha de substituto já foi resolvida.', { tId, uid, absentUid });
    if (substituteUid && !(choice.options || []).some((o) => o && String(o.uid || '') === substituteUid)) {
      throw _drawFail('permission-denied', 'O substituto não pertence às opções desta pendência.', { tId, uid, absentUid, substituteUid });
    }

    const before = _antesDoMotor(t);
    const result = resolveWOSubstitutionChoiceFn(t, absentUid, substituteUid);
    if (!result || !result.ok) return { ok: false, result: result || { reason: 'error' } };
    const boundary = _gravaTorneio(tx, ref, t, before, { agoraIso });
    return { ok: true, result, tournament: boundary.clean };
  });
});

// ─── Ocupar placeholder na chave ──────────────────────────────────────────────
// O navegador só escolhe uma vaga e um UID que já está na espera. A Function relê o
// torneio fresco e faz a troca integralmente: chave, elenco, lista de espera, membro e
// histórico. Assim uma aba antiga não pode ressuscitar uma vaga nem sobrescrever placar.
exports.occupyTournamentPlaceholder = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const placeholderName = String(data.placeholderName || '').trim();
  const participantUid = String(data.participantUid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !participantUid || !/^(Jogador|Placeholder)\s+\d+$/i.test(placeholderName)) {
    throw new HttpsError('invalid-argument', 'Vaga ou participante inválido.');
  }
  const ref = db.collection('tournaments').doc(tId);
  const agoraIso = new Date().toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização ocupa uma vaga.', { tId, uid });
    const espera = [].concat(Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [], Array.isArray(t.waitlist) ? t.waitlist : []);
    const person = espera.find(p => p && String(p.uid || '') === participantUid);
    const realName = String(person && (person.displayName || person.name) || '').trim();
    if (!person || !realName) throw _drawFail('failed-precondition', 'Este suplente não pertence mais à espera.', { tId, participantUid });
    const before = _antesDoMotor(t);
    const placeholderLc = placeholderName.toLowerCase();
    let changed = false;
    const replaceLabel = value => {
      if (typeof value !== 'string' || !value) return value;
      if (value.indexOf(' / ') !== -1) return value.split(' / ').map(part => {
        if (part.trim().toLowerCase() === placeholderLc) { changed = true; return realName; }
        return part.trim();
      }).join(' / ');
      if (value.trim().toLowerCase() === placeholderLc) { changed = true; return realName; }
      return value;
    };
    const allMatches = typeof drawWindow._collectAllMatches === 'function' ? drawWindow._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches : []);
    allMatches.forEach(m => {
      if (!m) return;
      m.p1 = replaceLabel(m.p1); m.p2 = replaceLabel(m.p2);
      ['team1', 'team2'].forEach(key => {
        if (Array.isArray(m[key])) m[key] = m[key].map(name => {
          if (String(name || '').trim().toLowerCase() === placeholderLc) { changed = true; return realName; }
          return name;
        });
      });
    });
    (Array.isArray(t.participants) ? t.participants : []).forEach(p => {
      if (!p || typeof p !== 'object') return;
      if (!(p.p1Uid || p.p1Name) && !(p.p2Uid || p.p2Name) && String(p.displayName || p.name || '').trim().toLowerCase() === placeholderLc) {
        p.name = realName; p.displayName = realName; p.uid = participantUid;
        p.email = person.email || null; p.photoURL = person.photoURL || null; delete p.isPlaceholder; changed = true;
      }
      if (String(p.p1Name || '').trim().toLowerCase() === placeholderLc) { p.p1Name = realName; p.p1Uid = participantUid; p.p1Email = person.email || null; p.p1Photo = person.photoURL || null; changed = true; }
      if (String(p.p2Name || '').trim().toLowerCase() === placeholderLc) { p.p2Name = realName; p.p2Uid = participantUid; p.p2Email = person.email || null; p.p2Photo = person.photoURL || null; changed = true; }
      if (p.p1Name && p.p2Name && typeof p.displayName === 'string' && p.displayName.indexOf(' / ') !== -1) p.displayName = p.p1Name + ' / ' + p.p2Name;
      if (Array.isArray(p.participants)) p.participants = p.participants.map(slot => {
        if (slot && String(slot.displayName || slot.name || '').trim().toLowerCase() === placeholderLc) {
          changed = true;
          return { name: realName, displayName: realName, uid: participantUid, email: person.email || null, photoURL: person.photoURL || null };
        }
        return slot;
      });
    });
    if (!changed) return { ok: true, changed: false, reason: 'placeholder-not-found' };
    const isPerson = p => p && String(p.uid || '') === participantUid;
    if (Array.isArray(t.standbyParticipants)) t.standbyParticipants = t.standbyParticipants.filter(p => !isPerson(p));
    if (Array.isArray(t.waitlist)) t.waitlist = t.waitlist.filter(p => !isPerson(p));
    if (!Array.isArray(t.history)) t.history = [];
    t.history.push({ date: agoraIso, message: '"' + realName + '" assumiu a vaga de "' + placeholderName + '"' });
    const boundary = _gravaTorneio(tx, ref, t, before, { agoraIso });
    return { ok: true, changed: true, tournament: boundary.clean };
  });
});

// ─── Vínculo de participante genérico com conta real ─────────────────────────
function _mergeParticipantInFreshTournament(t, realUid, genericName) {
  const arr = Array.isArray(t.participants) ? t.participants : [];
  const realIndex = arr.findIndex(p => p && typeof p === 'object' && String(p.uid || '') === realUid);
  const genericIndex = arr.findIndex(p => p && typeof p === 'object' && !p.uid && String(p.displayName || p.name || '') === genericName);
  if (realIndex < 0 || genericIndex < 0 || realIndex === genericIndex) return null;
  const real = arr[realIndex], generic = arr[genericIndex];
  const realName = String(real.displayName || real.name || '').trim();
  if (!realName) return null;
  const entry = Object.assign({}, real, { displayName: realName, name: realName, _mergedFrom: { placeholder: JSON.parse(JSON.stringify(generic)), person: JSON.parse(JSON.stringify(real)) } });
  arr[genericIndex] = entry;
  arr.splice(realIndex, 1);
  const swap = value => {
    if (typeof value !== 'string') return value;
    if (value === genericName) return realName;
    if (value.indexOf(' / ') !== -1) return value.split(' / ').map(n => n.trim() === genericName ? realName : n.trim()).join(' / ');
    return value;
  };
  const matches = typeof drawWindow._collectAllMatches === 'function' ? drawWindow._collectAllMatches(t) : (t.matches || []);
  matches.forEach(m => { if (!m) return; m.p1=swap(m.p1); m.p2=swap(m.p2); m.winner=swap(m.winner); ['team1','team2'].forEach(k => { if (Array.isArray(m[k])) m[k]=m[k].map(n => n === genericName ? realName : n); }); });
  return { realName };
}
exports.requestParticipantMerge = onCall(async request => {
  const uid=request.auth&&request.auth.uid, data=request.data||{}, tId=String(data.tournamentId||'').trim(), realUid=String(data.realUid||'').trim(), genericName=String(data.genericName||'').trim();
  if(!uid) throw new HttpsError('unauthenticated','Entre na sua conta.');
  if(!tId||!realUid||!genericName) throw new HttpsError('invalid-argument','Dados de vínculo inválidos.');
  const ref=db.collection('tournaments').doc(tId), agoraIso=new Date().toISOString();
  return db.runTransaction(async tx=>{const t=await _leTorneio(tx,ref,tId);if(!t)throw new HttpsError('not-found','Torneio não encontrado.');if(!_isTournamentAdmin(t,uid))throw _drawFail('permission-denied','Só a organização pede o vínculo.',{tId,uid});const real=(t.participants||[]).find(p=>p&&String(p.uid||'')===realUid), generic=(t.participants||[]).find(p=>p&&!p.uid&&String(p.displayName||p.name||'')===genericName);if(!real||!generic)throw _drawFail('failed-precondition','Os participantes mudaram no servidor.',{tId});const before=_antesDoMotor(t), req={id:'merge__'+Date.now()+'__'+Math.floor(Math.random()*1e6),realName:String(real.displayName||real.name||''),realUid,genericName,byUid:uid,byName:'A organização',at:agoraIso};t.pendingMerges=(Array.isArray(t.pendingMerges)?t.pendingMerges:[]).filter(r=>!(r&&r.realUid===realUid&&r.genericName===genericName));t.pendingMerges.push(req);const boundary=_gravaTorneio(tx,ref,t,before,{agoraIso});return {ok:true,changed:true,request:req,tournament:boundary.clean};});
});
exports.resolveParticipantMerge = onCall(async request => {
  const uid=request.auth&&request.auth.uid, data=request.data||{}, tId=String(data.tournamentId||'').trim(), reqId=String(data.requestId||'').trim(), action=data.action==='accept'?'accept':(data.action==='reject'?'reject':'');
  if(!uid) throw new HttpsError('unauthenticated','Entre na sua conta.'); if(!tId||!reqId||!action) throw new HttpsError('invalid-argument','Pedido inválido.');
  const ref=db.collection('tournaments').doc(tId),agoraIso=new Date().toISOString();
  return db.runTransaction(async tx=>{const t=await _leTorneio(tx,ref,tId);if(!t)throw new HttpsError('not-found','Torneio não encontrado.');const req=(t.pendingMerges||[]).find(r=>r&&r.id===reqId);if(!req) return {ok:true,changed:false,reason:'already-resolved'};if(String(req.realUid||'')!==uid)throw _drawFail('permission-denied','Só a conta indicada decide o vínculo.',{tId,uid});const before=_antesDoMotor(t);t.pendingMerges=t.pendingMerges.filter(r=>r&&r.id!==reqId);if(action==='reject'){const boundary=_gravaTorneio(tx,ref,t,before,{agoraIso});return {ok:true,changed:true,action,tournament:boundary.clean};}const result=_mergeParticipantInFreshTournament(t,String(req.realUid),String(req.genericName));if(!result)throw _drawFail('failed-precondition','Os participantes mudaram no servidor.',{tId,reqId});if(!Array.isArray(t.history))t.history=[];t.history.push({date:agoraIso,message:'"'+result.realName+'" assumiu a vaga de "'+req.genericName+'"'});const boundary=_gravaTorneio(tx,ref,t,before,{agoraIso});return {ok:true,changed:true,action,tournament:boundary.clean};});
});

// ─── Declarar/reverter ausência de W.O. ──────────────────────────────────────
// Esta porta cobre os botões compactos de chamada. O browser envia identidades e
// o alvo absoluto; a Function confere cada identidade no elenco fresco e roda a
// mesma reversão vendorizada, inclusive a trava de placar já jogado.
exports.setTournamentWOAbsence = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const wantAbsent = data.action === 'absent' ? true : (data.action === 'revert' ? false : null);
  const requested = Array.isArray(data.identities) ? data.identities.slice(0, 4) : [];
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || wantAbsent === null || !requested.length) throw new HttpsError('invalid-argument', 'Torneio, ação e participante são obrigatórios.');
  if (typeof setTournamentWOAbsenceFn !== 'function' || !drawWindow) {
    throw _drawFail('internal', 'Motor de W.O. indisponível no servidor.', { tId });
  }

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentAdmin(pre.data(), uid)) throw _drawFail('permission-denied', 'Só a organização altera W.O.', { tId, uid });
  await _preloadDrawNames(pre.data());
  const agoraIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
    _enrichParticipantsFromProfiles(t);
    const pools = ['participants', 'standbyParticipants', 'waitlist'];
    const allEntries = pools.flatMap((key) => Array.isArray(t[key]) ? t[key] : Object.values(t[key] || {}));
    const identities = requested.map((raw) => {
      const requestedUid = String(raw && raw.uid || '').trim();
      const requestedName = String(raw && raw.name || '').trim();
      const entry = allEntries.find((p) => {
        const uids = typeof drawWindow._participantUids === 'function' ? drawWindow._participantUids(p).filter(Boolean) : [];
        if (requestedUid) return uids.includes(requestedUid);
        const display = typeof drawWindow._pName === 'function' ? drawWindow._pName(p, '') : String((p && (p.displayName || p.name)) || '');
        return display === requestedName || display.split('/').map(x => x.trim()).includes(requestedName);
      });
      if (!entry) return null;
      if (requestedUid) {
        const displayName = typeof drawWindow._memberNameByUid === 'function'
          ? (drawWindow._memberNameByUid(t, requestedUid) || requestedName) : requestedName;
        return { uid: requestedUid, displayName };
      }
      return requestedName;
    });
    if (identities.some((x) => !x)) throw _drawFail('not-found', 'Participante não pertence mais ao torneio.', { tId, uid });

    if (!wantAbsent) {
      const allMatches = typeof drawWindow._collectAllMatches === 'function' ? drawWindow._collectAllMatches(t) : (t.matches || []);
      for (const who of identities) {
        const meta = typeof drawWindow._woHistGet === 'function' ? drawWindow._woHistGet(t, who) : null;
        const match = meta && meta.matchNum ? allMatches[Number(meta.matchNum) - 1] : null;
        if (match && typeof drawWindow._matchHasRealPlay === 'function' && drawWindow._matchHasRealPlay(match)) {
          throw _drawFail('failed-precondition', 'A partida já foi jogada e o W.O. não pode ser revertido.', { tId, uid, matchNum: meta.matchNum });
        }
      }
    }

    const before = _antesDoMotor(t);
    const result = setTournamentWOAbsenceFn(t, identities, wantAbsent);
    if (!result || !result.ok) return { ok: false, result: result || { reason: 'error' } };
    const boundary = _gravaTorneio(tx, ref, t, before, { agoraIso });
    return { ok: true, result, tournament: boundary.clean };
  });
});

// Só campos de placar e transição entram no recibo; jamais perfil completo, nem o objeto
// inteiro do torneio. O formato é deliberadamente estável para a conferência posterior.
function _scoreAuditSnapshot(m) {
  if (!m) return null;
  const pick = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  return {
    p1: String(m.p1 || ''), p2: String(m.p2 || ''),
    sets: pick(m.sets), setsWonP1: m.setsWonP1 == null ? null : m.setsWonP1,
    setsWonP2: m.setsWonP2 == null ? null : m.setsWonP2,
    scoreP1: m.scoreP1 == null ? null : m.scoreP1, scoreP2: m.scoreP2 == null ? null : m.scoreP2,
    winner: m.winner == null ? null : m.winner, winnerUids: pick(m.winnerUids),
    draw: !!m.draw, pendingResult: pick(m.pendingResult), resultAt: m.resultAt == null ? null : m.resultAt
  };
}

function _scoreAuditPayload(payload) {
  const p = payload || {};
  return {
    action: p.action == null ? null : String(p.action),
    setsInProgress: !!p.setsInProgress, gsmFinal: !!p.gsmFinal,
    isFixedSet: !!p.isFixedSet, useSets: !!p.useSets,
    sets: Array.isArray(p.sets) ? JSON.parse(JSON.stringify(p.sets)) : null,
    pending: p.pending ? JSON.parse(JSON.stringify(p.pending)) : null,
    s1: p.s1 == null ? null : p.s1, s2: p.s2 == null ? null : p.s2,
    at: p.at == null ? null : p.at
  };
}

exports.applyMatchResult = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta pra lançar o placar.');

  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!tId) throw new HttpsError('invalid-argument', 'tournamentId é obrigatório.');
  const matchId = String((request.data && request.data.matchId) || '').trim();
  if (!matchId) throw new HttpsError('invalid-argument', 'matchId é obrigatório.');
  const payload = (request.data && request.data.payload) || null;
  if (!payload) throw new HttpsError('invalid-argument', 'payload é obrigatório.');
  const logMessage = (request.data && request.data.logMessage) || '';

  // Motor indisponível → NUNCA improvisar a regra aqui. Erro claro; o cliente cai no
  // caminho antigo (que ainda é permitido pelas rules) em vez de ficar sem lançar placar.
  if (typeof applyResultFn !== 'function' || !drawWindow) {
    throw _drawFail('internal', 'Motor de resultado indisponível no servidor.', { tId, matchId });
  }

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentParticipant(pre.data(), uid) && !_isTournamentAdmin(pre.data(), uid)) {
    throw _drawFail('permission-denied', 'Só quem está no torneio pode lançar placar.',
      { tId, matchId, uid, email: email || '(sem email)' });
  }
  await _preloadDrawNames(pre.data()); // nome vivo por uid (o motor pode gerar/avançar)
  // A comunicação usa nome de exibição, nunca e-mail. Também pré-carregamos quem
  // propôs a pendência: a aprovação remove esse objeto durante a transação.
  const preMatch = typeof drawWindow._findMatch === 'function' ? drawWindow._findMatch(pre.data(), matchId) : null;
  const namesToLoad = new Set([String(uid)]);
  if (preMatch && preMatch.pendingResult && preMatch.pendingResult.proposedBy) namesToLoad.add(String(preMatch.pendingResult.proposedBy));
  const liveIdentity = await _loadLiveNames(namesToLoad);
  const callerName = (liveIdentity.nameByUid && liveIdentity.nameByUid[String(uid)]) ||
    (request.auth && request.auth.token && request.auth.token.name) || '';

  let out;
  try {
    // MESMO miolo que a fila usa — ver _aplicaPlacarNaTransacao.
    out = await _aplicaPlacarNaTransacao(db, tId, matchId, payload, {
      uid, email, name: callerName, liveNames: liveIdentity.nameByUid || {}
    }, logMessage);
    if (!out.ok && out.reason === 'permission-denied') {
      throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, matchId, uid });
    }
    if (!out.ok && out.reason === 'not-found') throw new HttpsError('not-found', 'Torneio não encontrado.');
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(`applyMatchResult EXPLODIU em ${tId}/${matchId} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha ao lançar placar: ' + String((e && e.message) || e).slice(0, 300));
  }

  console.log(`applyMatchResult v${CF_VERSION}: ${tId}/${matchId} por ${uid} — ` +
    (out.ok ? out.outcome : 'recusado(' + out.reason + ')'));
  return out;
});

/* ── A FILA DO PLACAR: sem sinal, a intenção espera; a CF é que aplica ─────────────
 *
 * O PROBLEMA QUE ELA RESOLVE. A ordem do dono é "tudo na cf" — e ele está certo: cliente
 * derivando avanço de chave é versão diferente gerando estado diferente. Mas tirar a
 * queda pro cliente sem mais nada teria um custo que o argumento dele não cobria: o
 * caminho local escreve no Firestore, que tem FILA OFFLINE (`enablePersistence` — "saves
 * sobrevivem a fechar o app"). Uma CF chamável NÃO tem: sem sinal, falha na hora. Numa
 * quadra com sinal ruim isso é a diferença entre o placar entrar e não entrar.
 *
 * ⭐ A saída atende os dois: o cliente grava uma INTENÇÃO — escrita comum de Firestore,
 * que o SDK enfileira e entrega sozinho quando o sinal volta — e QUEM APLICA é a CF.
 * Nenhum cliente calcula avanço de chave nunca mais, e nada se perde sem sinal.
 * ⚠️ O custo, dito na cara: sem sinal o placar fica SALVO mas a chave NÃO AVANÇA até o
 * sinal voltar. É o preço de não deixar o cliente derivar — e é o que o dono escolheu.
 *
 * ⛔ O ATOR VEM DO DOCUMENTO E É CONFERIDO CONTRA A REGRA, não confiado. A regra exige
 * `actorUid == request.auth.uid` na criação: ninguém enfileira em nome de outro. Aqui a
 * autorização é refeita do zero sobre o doc FRESCO, igual à porta chamável.
 *
 * ⭐ IDEMPOTÊNCIA: a CF chamável pode ter APLICADO e a resposta ter se perdido na volta —
 * o cliente, sem saber, enfileira. Aplicar duas vezes é o pior erro possível num placar.
 * Duas travas: (1) o id do documento da fila é derivado da intenção pelo cliente, então
 * reenviar a MESMA intenção grava no MESMO doc e o gatilho roda uma vez só; (2) o motor
 * (`applyResultFn`) recusa sozinho quando o jogo já tem aquele resultado — e recusa é
 * resposta legítima, não erro.
 */
exports.applyQueuedResult = onDocumentCreated(
  { document: 'tournaments/{tournamentId}/resultQueue/{itemId}', region: 'us-central1', timeoutSeconds: 120 },
  async (event) => {
    const tId = event.params && event.params.tournamentId;
    const itemId = event.params && event.params.itemId;
    const snap = event.data;
    if (!snap || !snap.exists) return;
    const item = snap.data() || {};
    const db = getFirestore();

    const marca = async (campos) => {
      // ⛔ `merge` e NUNCA apagar o item: ele é o recibo do que a pessoa mandou. Se a
      // aplicação falhar, é por ele que dá pra saber o que se perdeu — apagar seria
      // repetir o erro de "registrar numa lista que o próximo passo apaga".
      try { await snap.ref.set(Object.assign({ processedAt: Date.now() }, campos), { merge: true }); }
      catch (e) { console.error('[filaPlacar] não consegui marcar', tId, itemId, e); }
    };

    if (typeof applyResultFn !== 'function' || !drawWindow) {
      console.error('[filaPlacar]', tId, itemId, '⛔ motor indisponível — item FICA na fila, não marcado');
      return;  // sem marcar: um redeploy e o reprocessamento manual ainda alcançam
    }
    const matchId = String(item.matchId || '').trim();
    const actorUid = String(item.actorUid || '').trim();
    if (!matchId || !actorUid || !item.payload) {
      await marca({ status: 'invalido', reason: 'faltou matchId, actorUid ou payload' });
      return;
    }

    let out;
    try {
      const pre = await db.collection('tournaments').doc(tId).get();
      if (!pre.exists) { await marca({ status: 'recusado', reason: 'not-found' }); return; }
      await _preloadDrawNames(pre.data());   // nome vivo por uid (o motor pode avançar)
      out = await _aplicaPlacarNaTransacao(db, tId, matchId, item.payload,
        { uid: actorUid, email: item.actorEmail || '' }, item.logMessage || '');
    } catch (e) {
      console.error('[filaPlacar] EXPLODIU', tId, itemId, e && e.stack || e);
      await marca({ status: 'erro', reason: String((e && e.message) || e).slice(0, 300) });
      return;
    }

    if (out.ok) {
      console.log(`[filaPlacar] ${tId}/${matchId} por ${actorUid} — ${out.outcome} (enfileirado ${item.at || '?'})`);
      await marca({ status: 'aplicado', outcome: out.outcome });
    } else {
      // Recusa do MOTOR é resposta legítima — inclusive "já lançado", que é o caso normal
      // de idempotência quando a porta chamável tinha aplicado e a resposta se perdeu.
      console.log(`[filaPlacar] ${tId}/${matchId} por ${actorUid} — recusado(${out.reason})`);
      await marca({ status: 'recusado', reason: out.reason });
    }
  }
);

exports.closeRound = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!tId) throw new HttpsError('invalid-argument', 'tournamentId é obrigatório.');
  const roundIdx = parseInt((request.data && request.data.roundIdx), 10);
  if (isNaN(roundIdx) || roundIdx < 0) throw new HttpsError('invalid-argument', 'roundIdx é obrigatório.');
  const resultCtx = (request.data && request.data.resultCtx) || null;

  if (typeof closeRoundFn !== 'function' || !drawWindow) {
    throw _drawFail('internal', 'Motor de fecho de rodada indisponível no servidor.', { tId });
  }

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentParticipant(pre.data(), uid) && !_isTournamentAdmin(pre.data(), uid)) {
    throw _drawFail('permission-denied', 'Só um participante ou o organizador fecha a rodada.', { tId, uid, email: email || '(sem email)' });
  }
  await _preloadDrawNames(pre.data()); // nome vivo por uid (o motor gera a próxima rodada e lê nomes)
  const _fzClose = await _fusoDoEvento(pre.data());   // L6.R1: fuso fora da transação

  let out;
  try {
    /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
     * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
     * cada tentativa produzir espelho e plano diferentes. */
    const _agoraIsoTx = new Date().toISOString();
    out = await db.runTransaction(async (tx) => {
      const t = await _leTorneio(tx, ref, tId);
      if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const _tAntes = _antesDoMotor(t);
      // Re-checa authz sobre o doc FRESCO (acesso pode ter mudado entre o read de fora e a txn).
      if (!_isTournamentParticipant(t, uid) && !_isTournamentAdmin(t, uid)) {
        throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
      }
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) { /* best-effort */ }

      const res = closeRoundFn(t, roundIdx, resultCtx);
      if (!res || !res.ok) {
        // stale-round/already-closed/round-incomplete = idempotência/concorrência: NÃO grava
        // (outro fechou primeiro, ou a rodada não fechou de fato). O cliente reconcilia pelo listener.
        return { ok: false, reason: (res && res.reason) || 'close-failed' };
      }
      /* L6.R1 · MANUAL × AUTOMÁTICO: fechar a rodada e gerar a próxima CONSOME o slot
       * agendado que estivesse devido — mesma marca, mesma transação. */
      const _slotClose = _consumirSlotAgendado(t, Date.now(), _fzClose && _fzClose.tz);
      if (_slotClose) console.log(`closeRound: slot ${new Date(_slotClose).toISOString()} consumido pelo manual (${_fzClose.tz})`);
      const b = _gravaTorneio(tx, ref, t, _tAntes, { agoraIso: _agoraIsoTx }); // clobber-free; divide se o marcador mandar
      return { ok: true, branch: res.branch, tournament: b.clean };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(`closeRound EXPLODIU no torneio ${tId} r${roundIdx} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha no fecho de rodada: ' + String((e && e.message) || e).slice(0, 300));
  }

  console.log(`closeRound v${CF_VERSION}: ${tId} r${roundIdx} por ${uid} — ` +
    (out.ok ? 'branch=' + out.branch : 'noop(' + out.reason + ')'));
  return out;
});

// ─── Atribuição de quadra: intenção administrativa estreita ─────────────────
exports.assignMatchCourt = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  const matchId = String((request.data && request.data.matchId) || '').trim();
  const court = String((request.data && request.data.court) || '').trim().slice(0, 120);
  if (!tId || !matchId) throw new HttpsError('invalid-argument', 'Torneio e jogo são obrigatórios.');
  if (!drawWindow || typeof drawWindow._findMatch !== 'function') {
    throw _drawFail('internal', 'Motor de chave indisponível no servidor.', { tId, matchId });
  }
  const ref = db.collection('tournaments').doc(tId);
  const agoraIso = new Date().toISOString();
  try {
    return await db.runTransaction(async (tx) => {
      const t = await _leTorneio(tx, ref, tId);
      if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
      if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização define a quadra.', { tId, matchId, uid });
      const m = drawWindow._findMatch(t, matchId);
      if (!m) return { ok: false, reason: 'match-not-found' };
      const antes = _antesDoMotor(t);
      const atual = String(m.court || '');
      if (atual === court) return { ok: true, changed: false };
      if (court) m.court = court; else delete m.court;
      const b = _gravaTorneio(tx, ref, t, antes, { agoraIso: agoraIso });
      return { ok: true, changed: true, court, tournament: b.clean };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(`assignMatchCourt EXPLODIU em ${tId}/${matchId} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha ao definir quadra: ' + String((e && e.message) || e).slice(0, 300));
  }
});


// ─── Atribuições da análise: torneio e perfil no mesmo comando canônico ─────────
exports.applyEnrollmentAssignments = onCall(async (request) => {
  const uid=request.auth&&request.auth.uid, data=request.data||{}, tId=String(data.tournamentId||'').trim();
  const sport=String(data.sport||'').trim().slice(0,80), raw=Array.isArray(data.edits)?data.edits.slice(0,100):null;
  if(!uid) throw new HttpsError('unauthenticated','Entre na sua conta.');
  if(!tId||!raw||!raw.length) throw new HttpsError('invalid-argument','Atribuições inválidas.');
  const clean=raw.map(x=>({uid:String(x&&x.uid||'').trim(),name:String(x&&x.name||'').trim().slice(0,120),email:String(x&&x.email||'').trim().toLowerCase().slice(0,180),waitlist:!!(x&&x.waitlist),pairMember:(x&&['p1','p2'].includes(x.pairMember))?x.pairMember:'',gender:(x&&['feminino','masculino','misto',''].includes(x.gender))?x.gender:undefined,category:x&&Object.prototype.hasOwnProperty.call(x,'category')?String(x.category||'').trim().slice(0,80):undefined}));
  if(clean.some(x=>(!x.uid&&!x.name&&!x.email)||(x.gender===undefined&&x.category===undefined))) throw new HttpsError('invalid-argument','Alvo ou alteração inválida.');
  const ref=db.collection('tournaments').doc(tId),agoraIso=new Date().toISOString();
  return db.runTransaction(async tx=>{
    const t=await _leTorneio(tx,ref,tId); if(!t) throw new HttpsError('not-found','Torneio não encontrado.');
    if(!_isTournamentAdmin(t,uid)) throw _drawFail('permission-denied','Só a organização altera inscrições.',{tId,uid});
    const before=_antesDoMotor(t), valid=new Set(Array.isArray(t.combinedCategories)?t.combinedCategories:[]); let changed=0,profiles={};
    const find=(arr,e)=>{let hit=null; (arr||[]).forEach(p=>{if(hit||!p||typeof p!=='object')return; const u=[p.uid,p.p1Uid,p.p2Uid].filter(Boolean).map(String); if(Array.isArray(p.participants))p.participants.forEach(q=>q&&q.uid&&u.push(String(q.uid))); if(e.uid?u.includes(e.uid):(!u.length&&((e.email&&String(p.email||'').toLowerCase()===e.email)||(e.name&&(p.name===e.name||p.displayName===e.name)))))hit=p;});return hit;};
    for(const e of clean){const pools=e.waitlist?[t.waitlist,t.standbyParticipants,t.monarchWaitlist]:[t.participants]; let target=null; for(const pool of pools){target=find(pool,e);if(target)break;} if(!target) continue;
      if(e.gender!==undefined){if(e.pairMember){if(e.gender)target[e.pairMember+'Gender']=e.gender;else delete target[e.pairMember+'Gender'];}else if(e.gender){target.gender=e.gender;target.genderSource='organizador';}else{delete target.gender;delete target.genderSource;} changed++;}
      if(e.category!==undefined){if(e.category&&valid.size&&!valid.has(e.category)) throw new HttpsError('invalid-argument','Categoria não pertence ao torneio.'); if(e.category){target.categories=[e.category];target.category=e.category;target.categorySource='organizador';delete target.wasUncategorized;delete target.autoWeakestCat;delete target.staleCat;}else{target.categories=[];target.category='';delete target.categorySource;delete target.wasUncategorized;} changed++;}
      const profileUid=e.uid||((e.pairMember&&target[e.pairMember+'Uid'])||target.uid);
      // Uma dupla pode ter duas alterações na mesma chamada. Junta por UID antes de
      // escrever: assim cada perfil recebe uma única atualização transacional.
      if(profileUid&&(e.gender||e.category)){const k=String(profileUid), prior=profiles[k]||{uid:k}; if(e.gender)prior.gender=e.gender; if(e.category)prior.category=e.category; profiles[k]=prior;}
    }
    for(const k of Object.keys(profiles)){const a=profiles[k], uref=db.collection('users').doc(a.uid), us=await tx.get(uref); if(!us.exists)continue; const upd={profileSetAt:FieldValue.serverTimestamp()}; if(a.gender)upd.gender=a.gender,upd.genderSetBy=uid; if(a.category&&sport){const sb=Object.assign({},(us.data().skillBySport||{}));sb[sport]=a.category;upd.skillBySport=sb;upd.skillSetBy=uid;} tx.update(uref,upd);}
    if(!changed)return {ok:true,changed:0}; const b=_gravaTorneio(tx,ref,t,before,{agoraIso}); return {ok:true,changed,tournament:b.clean};
  });
});

// ─── Metadados de apresentação: comandos estreitos, nunca ficha inteira ───────────


// ─── Fechamento por prazo: a tela pede; a organização e o servidor confirmam ─────
exports.closeExpiredEnrollment = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId) throw new HttpsError('invalid-argument', 'Torneio obrigatório.');
  const ref = db.collection('tournaments').doc(tId), agora = Date.now(), agoraIso = new Date(agora).toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização fecha inscrições por prazo.', { tId, uid });
    const deadline = Date.parse(t.registrationLimit || '');
    if (!Number.isFinite(deadline) || deadline > agora) return { ok:true, changed:false, reason:'not-expired' };
    if (t.status === 'closed' || t.status === 'finished' || hasDrawnBracket(t)) return { ok:true, changed:false, reason:'already-closed-or-drawn' };
    const antes = _antesDoMotor(t); t.status = 'closed';
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// A tela pode pedir o fecho para refletir a mudança imediatamente, mas não
// recebe nem persiste um torneio: a decisão e toda escrita vivem no servidor.
exports.closeExpiredLeagueSeason = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId) throw new HttpsError('invalid-argument', 'Torneio obrigatório.');
  const ref = db.collection('tournaments').doc(tId);
  const pre = await _leTorneio(_TX_LEITURA, ref, tId);
  if (!pre) throw new HttpsError('not-found', 'Torneio não encontrado.');
  if (!_isTournamentAdmin(pre, uid)) throw _drawFail('permission-denied', 'Só a organização encerra a temporada.', { tId, uid });
  return _closeExpiredLeagueSeason(ref, tId, new Date().toISOString());
});

exports.setTournamentCategoryConfig = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const cleanList = value => Array.isArray(value) ? [...new Set(value.map(v => String(v).trim()).filter(v => v && v.length <= 48))].slice(0, 12) : null;
  const genderCategories = cleanList(data.genderCategories), skillCategories = cleanList(data.skillCategories);
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !genderCategories || !skillCategories) throw new HttpsError('invalid-argument', 'Categorias inválidas.');
  const combinedCategories = !genderCategories.length ? skillCategories.slice() : !skillCategories.length ? genderCategories.slice() : genderCategories.flatMap(g => skillCategories.map(sk => g + ' ' + sk));
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização configura categorias.', { tId, uid });
    if (JSON.stringify(t.genderCategories || []) === JSON.stringify(genderCategories) && JSON.stringify(t.skillCategories || []) === JSON.stringify(skillCategories)) return { ok:true, changed:false };
    const antes = _antesDoMotor(t); t.genderCategories = genderCategories; t.skillCategories = skillCategories; t.combinedCategories = combinedCategories;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

exports.setTournamentBranding = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const logoData = String(data.logoData || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !/^data:image\/(png|jpe?g|webp);base64,/i.test(logoData) || logoData.length > 2 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Logo inválido.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização altera o logo.', { tId, uid });
    if (t.logoData === logoData && t.logoLocked === true) return { ok:true, changed:false };
    const antes = _antesDoMotor(t); t.logoData = logoData; t.logoLocked = true;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

exports.setTournamentFlyerPrefs = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const raw = data.prefs;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Preferências inválidas.');
  const prefs = {
    content: String(raw.content || '').slice(0, 64), paper: String(raw.paper || '').slice(0, 32), color: String(raw.color || '').slice(0, 32),
    orient: String(raw.orient || '').slice(0, 32), sizes: Array.isArray(raw.sizes) ? raw.sizes.slice(0, 12).map(v => String(v).slice(0, 32)) : [], phrase: String(raw.phrase || '').slice(0, 280)
  };
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização altera as preferências.', { tId, uid });
    if (JSON.stringify(t.flyerPrintPrefs || null) === JSON.stringify(prefs)) return { ok:true, changed:false };
    const antes = _antesDoMotor(t); t.flyerPrintPrefs = prefs;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Edição da ficha: contrato explícito, sem snapshot do navegador ───────────
// L7.P1.34: a tela só pode propor campos declarativos da configuração. Qualquer
// detalhe de identidade, elenco, fila, jogos, resultados, fases materializadas ou
// ciclo de vida fica fora desta lista e só possui comandos próprios no servidor.
const _CAMPOS_CONFIG_TORNEIO = new Set([
  'name','isPublic','format','sport','startDate','endDate','roundBounds','registrationLimit',
  'enrollmentMode','mixedPairingSeparated','manualPairing','teamSize','gameTypes',
  'maxParticipants','autoCloseOnFull','enrollmentLimitMode','targetSlots','callPolicy',
  'resultEntry','woScope','lateEnrollment','newMatchups','venue','venueAccess','venueLat',
  'venueLon','venueAddress','venuePlaceId','venueCity','venueState','venueCountry',
  'venuePhotoUrl','coverUrl','logoUrl','logoLocked','logoShape','logoRadius','courtCount',
  'courtNames','callTime','warmupTime','gameDuration','scoring','swissRounds',
  'drawFirstDate','drawFirstTime','drawIntervalDays','drawManual','temporada','equilibrado',
  'clusterSize','balanceBy','genderRatio','wlGroupBalance','ligaNewPlayerScore',
  'ligaInactivity','ligaInactivityX','allowSelfDeactivation','ligaOpenEnrollment',
  'ligaRoundFormat','ligaDrawMode','ligaTurnos','ligaRRSchedule','rankingNewPlayerScore',
  'rankingInactivity','rankingInactivityX','rankingSeasonMonths','rankingOpenEnrollment',
  'ligaSeasonMonths','elimRankingType','gruposCount','gruposClassified','gruposEqualOnly',
  'gruposSeedVip','gruposSeedCategory','drawMode','reiRainhaGroupsBy','monarchAdvanceToElim',
  'phase1Name','tiebreakers','tiebreakersExcluded','advancedScoring','genderCategories',
  'skillCategories','ageCategories','customCategories','combinedCategories','rigor','rigorRequire',
  'fmt2','phases'
]);
const _CONFIG_ESTRUTURAL = new Set([
  'format','sport','teamSize','gameTypes','drawMode','fmt2','phases','roundBounds','swissRounds',
  'gruposCount','gruposClassified','gruposEqualOnly','gruposSeedVip','gruposSeedCategory',
  'ligaRoundFormat','ligaDrawMode','ligaTurnos','ligaRRSchedule','monarchAdvanceToElim'
]);
const _CONFIG_FASE_ATIVA = new Set(['name','startDate','endDate','roundBounds']);
function _clonaConfigDeclarativa(value, depth) {
  const d = depth || 0;
  if (d > 6) throw new HttpsError('invalid-argument', 'Configuração profunda demais.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpsError('invalid-argument', 'Número de configuração inválido.');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 8192) throw new HttpsError('invalid-argument', 'Texto de configuração grande demais.');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) throw new HttpsError('invalid-argument', 'Lista de configuração grande demais.');
    return value.map(v => _clonaConfigDeclarativa(v, d + 1));
  }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new HttpsError('invalid-argument', 'Objeto de configuração inválido.');
  }
  const keys = Object.keys(value);
  if (keys.length > 64) throw new HttpsError('invalid-argument', 'Objeto de configuração grande demais.');
  const out = {};
  keys.forEach(k => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(k)) throw new HttpsError('invalid-argument', 'Chave de configuração inválida.');
    out[k] = _clonaConfigDeclarativa(value[k], d + 1);
  });
  return out;
}
function _fasesDeConfiguracaoAtualizaveis(atual, proposta) {
  if (!Array.isArray(proposta) || proposta.length !== atual.length) {
    throw new HttpsError('failed-precondition', 'A estrutura de fases já existe e não pode ser recriada.');
  }
  return atual.map((fase, i) => {
    const input = proposta[i];
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Fase inválida.');
    const out = Object.assign({}, fase);
    Object.keys(input).forEach(k => {
      if (_CONFIG_FASE_ATIVA.has(k)) out[k] = _clonaConfigDeclarativa(input[k]);
    });
    return out;
  });
}
exports.updateTournamentConfiguration = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const raw = data.patch;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'Configuração inválida.');
  }
  const keys = Object.keys(raw);
  if (!keys.length || keys.length > _CAMPOS_CONFIG_TORNEIO.size) {
    throw new HttpsError('invalid-argument', 'Nenhuma configuração válida foi informada.');
  }
  const patch = {};
  keys.forEach(key => {
    if (!_CAMPOS_CONFIG_TORNEIO.has(key)) {
      throw new HttpsError('permission-denied', 'Este campo não pode ser alterado pela ficha do torneio.');
    }
    patch[key] = _clonaConfigDeclarativa(raw[key]);
  });
  const bytes = Buffer.byteLength(JSON.stringify(patch), 'utf8');
  if (bytes > 96 * 1024) throw new HttpsError('invalid-argument', 'Configuração grande demais.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização atualiza a configuração.', { tId, uid });
    const hasDraw = hasDrawnBracket(t);
    const changed = Object.keys(patch).some(key => JSON.stringify(t[key]) !== JSON.stringify(patch[key]));
    if (!changed) return { ok:true, changed:false, tournament:t };
    if (hasDraw && Object.keys(patch).some(key => _CONFIG_ESTRUTURAL.has(key) && key !== 'phases')) {
      throw _drawFail('failed-precondition', 'A chave já existe; altere apenas a configuração que não recria as rodadas.', { tId });
    }
    const antes = _antesDoMotor(t);
    Object.keys(patch).forEach(key => {
      if (key === 'phases' && hasDraw) {
        t.phases = _fasesDeConfiguracaoAtualizaveis(Array.isArray(t.phases) ? t.phases : [], patch.phases);
      } else {
        t[key] = patch[key];
      }
    });
    t.updatedAt = agoraIso;
    if (!Array.isArray(t.history)) t.history = [];
    t.history.push({ date: agoraIso, message: 'Regras atualizadas pela organização.' });
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Ciclo presencial: comandos estreitos, nunca mutadores da tela ───────────
exports.startTournament = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId) throw new HttpsError('invalid-argument', 'Torneio obrigatório.');
  const ref = db.collection('tournaments').doc(tId), agora = new Date(), agoraIso = agora.toISOString();
  const startLocal = agora.toLocaleString('sv-SE', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).replace(' ', 'T');
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização inicia o torneio.', { tId, uid });
    if (t.status === 'finished') throw _drawFail('failed-precondition', 'O torneio já foi encerrado.', { tId, uid });
    if (t.tournamentStarted && t.status === 'in_progress') return { ok:true, changed:false };
    const antes = _antesDoMotor(t);
    if (!t.tournamentStarted) t.tournamentStarted = agora.getTime();
    // `startDate` já é uma data civil do torneio; não pode ganhar o fuso UTC do
    // servidor ao sair do navegador. O campo mantém o mesmo contrato BRT da UI.
    if (!t.startDate) t.startDate = startLocal;
    t.status = 'in_progress';
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

exports.resetTournamentCheckIn = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId) throw new HttpsError('invalid-argument', 'Torneio obrigatório.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização limpa a chamada.', { tId, uid });
    if (!Object.keys(t.checkedIn || {}).length && !Object.keys(t.absent || {}).length && !Object.keys(t.checkedInConfirmed || {}).length) return { ok:true, changed:false };
    const antes = _antesDoMotor(t);
    t.checkedIn = {}; t.absent = {}; t.checkedInConfirmed = {};
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

exports.setDefaultTournamentScoring = onCall(async request=>{ const uid=request.auth&&request.auth.uid; if(!uid) throw new HttpsError('unauthenticated','Entre na sua conta.'); const tId=String((request.data&&request.data.tournamentId)||''); const scoring=request.data&&request.data.scoring; if(!tId||!scoring||scoring.type!=='sets') throw new HttpsError('invalid-argument','Formato inválido.'); const ref=db.collection('tournaments').doc(tId),agoraIso=new Date().toISOString(); return db.runTransaction(async tx=>{ const t=await _leTorneio(tx,ref,tId); if(!t) throw new HttpsError('not-found','Torneio não encontrado.'); if(!_isTournamentAdmin(t,uid)) throw _drawFail('permission-denied','Só a organização configura o formato.',{tId,uid}); if(t.scoring&&t.scoring.type==='sets') return {ok:true,changed:false}; const antes=_antesDoMotor(t); t.scoring=Object.assign({},scoring); const b=_gravaTorneio(tx,ref,t,antes,{agoraIso}); return {ok:true,changed:true,tournament:b.clean}; }); });


// Configurador Format 2: o cliente envia apenas a configuração declarada; a CF
// recompila contra o documento fresco e é a única autoridade que reabre a chave.
exports.applyTournamentFormat = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const fmt2 = data.fmt2;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !fmt2 || typeof fmt2 !== 'object' || Array.isArray(fmt2)) {
    throw new HttpsError('invalid-argument', 'Configuração de formato inválida.');
  }
  if (!drawWindow || !drawWindow.FORMAT2 || typeof drawWindow.FORMAT2.compileToPhases !== 'function') {
    throw new HttpsError('failed-precondition', 'Compilador de formato indisponível.');
  }
  const ref = db.collection('tournaments').doc(tId);
  const agoraIso = new Date().toISOString();
  return db.runTransaction(async tx => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) {
      throw _drawFail('permission-denied', 'Só a organização configura o formato.', { tId, uid });
    }
    if (hasDrawnBracket(t)) throw _drawFail('failed-precondition', 'already-drawn', { tId });
    let out;
    try {
      out = drawWindow.FORMAT2.compileToPhases(fmt2, {
        sport: t.sport,
        resultEntry: t.resultEntry || ['organizer'],
        lateEnrollment: t.lateEnrollment,
        newMatchups: t.newMatchups
      });
    } catch (e) {
      throw new HttpsError('invalid-argument', 'Não foi possível compilar o formato: ' + String((e && e.message) || e).slice(0, 180));
    }
    const antes = _antesDoMotor(t);
    Object.assign(t, out.topLevel);
    t.phases = out.phases;
    t.fmt2 = out.cfg;
    if (t.format === 'Fase de Grupos') {
      t.ligaRoundFormat = 'standard';
      t.ligaDrawMode = 'standard';
    }
    t.currentPhaseIndex = 0;
    t.currentStage = null;
    t.matches = [];
    t.rounds = [];
    t.groups = [];
    t.standings = [];
    t.thirdPlaceMatch = null;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok: true, changed: true, summary: drawWindow.FORMAT2.summary(out.cfg), tournament: b.clean };
  });
});

exports.advanceTournamentPhase = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  const phaseChoices = Array.isArray(request.data && request.data.phaseChoices) ? request.data.phaseChoices : [];
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !materializePhaseFn || !phaseStandingsFn || !phaseCompleteFn) {
    throw new HttpsError('failed-precondition', 'Motor de fases indisponível.');
  }
  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
  if (!_isTournamentAdmin(pre.data(), uid)) throw _drawFail('permission-denied', 'Só a organização avança a fase.', { tId, uid });
  await _preloadDrawNames(pre.data());
  const agoraIso = new Date().toISOString();
  const out = await db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização avança a fase.', { tId, uid });
    if (!phaseCompleteFn(t)) return { ok: false, reason: 'phase-incomplete' };
    const current = t.currentPhaseIndex || 0;
    if (!Array.isArray(t.phases) || current + 1 >= t.phases.length) return { ok: false, reason: 'no-next-phase' };
    const antes = _antesDoMotor(t);
    // O painel pode ter decidido play-in e rodadas suíças no snapshot da tela.
    // A CF aceita somente essas duas escolhas de configuração e as reaplica no doc fresco
    // antes de materializar; nenhum placar, participante ou chave vem do cliente.
    phaseChoices.forEach((choice, index) => {
      if (!choice || !t.phases || !t.phases[index]) return;
      if (typeof choice.bracketResolution === 'string' && choice.bracketResolution.length <= 32) t.phases[index].bracketResolution = choice.bracketResolution;
      if (Number.isInteger(choice.swissRounds) && choice.swissRounds > 0 && choice.swissRounds <= 30) t.phases[index].swissRounds = choice.swissRounds;
    });
    _enrichParticipantsFromProfiles(t);
    try { if (typeof drawWindow._hydrateMonarchGroups === 'function') drawWindow._hydrateMonarchGroups(t); } catch (e) {}
    const hasMonarch = (t.rounds || []).some(r => r && Array.isArray(r.monarchGroups) && r.monarchGroups.length) ||
      (((current === 0 ? (t.groups || []) : (((t.phaseGroups || [])[current]) || []))).some(g => {
        const ms = (g.matches || []).concat((g.rounds || []).reduce((a, r) => a.concat((r && r.matches) || []), []));
        return ms.some(m => m && m.isMonarch);
      }));
    const tbOpts = { tiebreakers: t.tiebreakers, birthByName: typeof drawWindow._tbBirthByName === 'function' ? drawWindow._tbBirthByName(t) : {} };
    const standings = g => phaseStandingsFn(g, t, tbOpts, hasMonarch);
    const next = current + 1;
    const res = materializePhaseFn(t, standings, 'ph-' + tId + '-' + next);
    if (!res || !res.ok) return { ok: false, reason: (res && res.error) || 'phase-not-materialized' };
    if (res.incrementalLeague && typeof drawWindow._phaseGenNextLeagueRound === 'function') drawWindow._phaseGenNextLeagueRound(t, res.phaseIndex);
    if (res.built && res.built.needsDoubleElim && typeof drawWindow._buildDoubleElimBracket === 'function') drawWindow._buildDoubleElimBracket(t, { phaseIndex: t.currentPhaseIndex });
    if (res.built && res.built.needsRepechageDoubleElim && typeof drawWindow._buildRepechageDoubleElim === 'function') {
      const metas = res.built.repMetaByCat && res.built.repMetaByCat.length ? res.built.repMetaByCat : [res.built.repMeta];
      metas.forEach(meta => drawWindow._buildRepechageDoubleElim(t, meta, { phaseIndex: t.currentPhaseIndex }));
    }
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok: true, changed: true, phaseIndex: t.currentPhaseIndex, tournament: b.clean };
  });
  if (out.ok) await _notifyAdvancedPhase(out.tournament, tId, out.phaseIndex, agoraIso);
  return out;
});

async function _notifyAdvancedPhase(t, tId, phaseIndex, nowIso) {
  if (!t || t.isSandbox || t.notificationsMuted) return;
  const ids = new Set();
  // A fase pode armazenar jogos em matches, rounds ou phaseRounds. A novidade é do
  // torneio e deve chegar aos inscritos mesmo se o formato ainda não expõe um match plano.
  (t.participants || []).forEach(p => [p && p.uid, p && p.p1Uid, p && p.p2Uid].forEach(u => u && ids.add(String(u))));
  const { profByUid } = await _loadLiveNames(ids);
  const mailed = new Set();
  for (const participantUid of ids) {
    const profile = profByUid[participantUid]; if (!profile) continue;
    const message = '🏆 Nova fase do torneio ' + (t.name || '') + ' disponível. Confira seus jogos.';
    if (profile.notifyPlatform !== false) await db.collection('users').doc(participantUid).collection('notifications').doc('phase-' + tId + '-' + phaseIndex).set({ type:'new_phase', fromUid:'system', fromName:'scoreplace.app', fromPhoto:'', tournamentId:tId, tournamentName:t.name || '', message, createdAt:nowIso, read:false }, { merge:true });
    await _queueDrawEmail(profile, _drawEmailOpts(t, tId, message), mailed);
  }
}


exports.reopenTournament = onCall(async request=>{const uid=request.auth&&request.auth.uid,d=request.data||{},tId=String(d.tournamentId||''),ini=String(d.startDate||''),fim=String(d.endDate||'');if(!uid)throw new HttpsError('unauthenticated','Entre na sua conta.');if(!tId||!ini||!fim||fim<ini)throw new HttpsError('invalid-argument','Datas inválidas.');const ref=db.collection('tournaments').doc(tId),agoraIso=new Date().toISOString();return db.runTransaction(async tx=>{const t=await _leTorneio(tx,ref,tId);if(!t)throw new HttpsError('not-found','Torneio não encontrado.');if(!_isTournamentAdmin(t,uid))throw _drawFail('permission-denied','Só a organização reabre o torneio.',{tId,uid});const antes=_antesDoMotor(t),has=!!((t.matches||[]).length||(t.rounds||[]).length||(t.groups||[]).length);t.startDate=ini;t.endDate=fim;t.status=has?'in_progress':'open';['autoClosed','autoClosedAt','autoCloseReason','autoCloseWarnedAt','autoCloseDueAt'].forEach(k=>delete t[k]);const b=_gravaTorneio(tx,ref,t,antes,{agoraIso});return {ok:true,tournament:b.clean};});});


// ─── Entrada tardia Rei/Rainha: espera e grupo são decisão do servidor ───────────
exports.reconcileMonarchEnrollment = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {};
  const tId = String(data.tournamentId || '').trim();
  const participantUid = String(data.participantUid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !participantUid) throw new HttpsError('invalid-argument', 'Torneio e participante são obrigatórios.');
  if (!drawWindow || typeof drawWindow._onParticipantAddedToMonarchRound !== 'function') throw new HttpsError('failed-precondition', 'Motor Rei/Rainha indisponível.');
  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
  if (!_isTournamentAdmin(pre.data(), uid)) throw _drawFail('permission-denied', 'Só a organização confirma uma inscrição Rei/Rainha.', { tId, uid });
  await _preloadDrawNames(pre.data());
  const agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização confirma uma inscrição Rei/Rainha.', { tId, uid });
    _enrichParticipantsFromProfiles(t);
    const entrant = (t.participants || []).find(p => p && String(p.uid || '') === participantUid);
    if (!entrant) return { ok: true, changed: false, reason: 'participant-not-found' };
    const name = typeof drawWindow._entryDisplayName === 'function' ? drawWindow._entryDisplayName(entrant) : (entrant.displayName || entrant.name || '');
    const category = (entrant.categories && entrant.categories[0]) || entrant.category || null;
    const before = _antesDoMotor(t);
    const result = drawWindow._onParticipantAddedToMonarchRound(t, name, category) || { added: false, formed: 0 };
    if (!result.added) return { ok: true, changed: false, formed: 0 };
    const b = _gravaTorneio(tx, ref, t, before, { agoraIso });
    return { ok: true, changed: true, formed: result.formed || 0, tournament: b.clean };
  });
});

// ─── Publicação/anulação de sorteio em revisão: intenção server-side ──────────────
exports.resolvePendingDraw = onCall(async (request) => {
  const uid=request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated','Entre na sua conta.');
  const tId=String((request.data&&request.data.tournamentId)||'').trim();
  const action=String((request.data&&request.data.action)||'').trim();
  if (!tId || !['publish','annul'].includes(action)) throw new HttpsError('invalid-argument','Ação de sorteio inválida.');
  const ref=db.collection('tournaments').doc(tId), agoraIso=new Date().toISOString();
  return db.runTransaction(async tx=>{
    const t=await _leTorneio(tx,ref,tId); if(!t) throw new HttpsError('not-found','Torneio não encontrado.');
    if(!_isTournamentAdmin(t,uid)) throw _drawFail('permission-denied','Só a organização altera o sorteio em revisão.',{tId,uid});
    const pd=t.pendingDraw; if(!pd) return {ok:true,changed:false};
    const antes=_antesDoMotor(t);
    if(action==='annul') { t.pendingDraw=null; t.lastAutoDrawAt=null; }
    else {
      t.rounds=Array.isArray(pd.rounds)?pd.rounds:[];
      ['standings','sitOutHistory','opponentHistory','monarchWaitlist'].forEach(k=>{ if(pd[k]) t[k]=pd[k]; });
      t.status=pd.status||'active'; t.drawVisibility=t.drawVisibility||'public';
      if(t.drawManual!==true&&!t.tournamentStarted) { const ms=Date.parse(pd.generatedAt||''); t.tournamentStarted=Number.isFinite(ms)&&ms>0?ms:Date.now(); }
      t.lastAutoDrawAt=pd.generatedAt||t.lastAutoDrawAt||agoraIso; t.pendingDraw=null;
    }
    const b=_gravaTorneio(tx,ref,t,antes,{agoraIso});
    return {ok:true,changed:true,action,roundIndex:pd.roundIndex,firstDraw:!!pd.firstDraw,tournament:b.clean};
  }).then(async out=>{
    // A publicação deixa o servidor, e não o navegador, responsável pela entrega.
    if(out.changed && action==='publish') await _notifyPublishedPendingDraw(out.tournament,tId,out.roundIndex,agoraIso);
    return out;
  });
});

// ─── Cancelamento da preparação de sorteio: intenção server-side ─────────────
// Antes do sorteio efetivo, os painéis podem suspender o torneio/fechar inscrição
// enquanto a organização escolhe como resolver elenco, grupos ou potência de 2.
// Cancelar volta somente esse estado transitório. A Function lê o documento fresco,
// recusa uma chave ou revisão já materializada e limpa os mesmos flags canônicos do
// motor; o navegador não reenfileira um retrato da aba. O snapshot de prévia do
// navegador nunca é dado canônico: antes do sorteio ele não foi persistido, portanto
// a transação preserva o elenco que acabou de reler em vez de aceitar um roster enviado.
exports.cancelDrawPreparation = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId) throw new HttpsError('invalid-argument', 'Torneio obrigatório.');
  if (!drawWindow || typeof drawWindow._clearDrawRuntimeFlags !== 'function') {
    throw new HttpsError('failed-precondition', 'Motor de preparação indisponível.');
  }
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização cancela a preparação do sorteio.', { tId, uid });
    if (hasDrawnBracket && hasDrawnBracket(t)) throw _drawFail('failed-precondition', 'A chave já foi sorteada; esta preparação não pode mais ser cancelada.', { tId, uid });
    if (t.pendingDraw) throw _drawFail('failed-precondition', 'Há um sorteio em revisão; anule-o pelo controle de revisão.', { tId, uid });
    const hadPreparation = !!(t._suspendedByPanel || t._reopenIfDrawCancelled || t._drawDecisions || t.currentStage);
    if (!hadPreparation) return { ok:true, changed:false, tournament:t };
    const antes = _antesDoMotor(t);
    if (t._suspendedByPanel) t.status = t._previousStatus || 'open';
    else if (t._reopenIfDrawCancelled) t.status = 'open';
    drawWindow._clearDrawRuntimeFlags(t);
    const nextIdx = (t.currentPhaseIndex || 0) + 1;
    if (Array.isArray(t.phases) && t.phases[nextIdx]) {
      delete t.phases[nextIdx]._promoteAsked;
      delete t.phases[nextIdx]._promoteLines;
    }
    // No navegador `_clearPhaseResInfo` também remove apenas este campo do doc; o
    // registro auxiliar por id é memória da tela e não existe no processo da Function.
    delete t._phaseResInfo;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Escolha para entradas tardias antes do sorteio: intenção server-side ────
// A tela apenas apresenta repescagem, BYE ou lista de espera. A escolha muda a
// regra que será usada pelo motor e ainda pode reabrir inscrições que o painel
// suspendeu; por isso a Function relê o torneio dentro da transação e devolve o
// documento canônico, sem receber qualquer retrato de elenco do navegador.
exports.setLateDrawDecision = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {}, tId = String(data.tournamentId || '').trim();
  const mode = String(data.mode || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !['repescagem', 'bye', 'standby'].includes(mode)) {
    throw new HttpsError('invalid-argument', 'Decisão de entrada tardia inválida.');
  }
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização decide a entrada tardia.', { tId, uid });
    if (hasDrawnBracket && hasDrawnBracket(t)) throw _drawFail('failed-precondition', 'A chave já foi sorteada; a regra para tardios não pode mais mudar.', { tId, uid });
    if (t.pendingDraw) throw _drawFail('failed-precondition', 'Há um sorteio em revisão; conclua-o antes de alterar esta regra.', { tId, uid });
    const antes = _antesDoMotor(t);
    t._lateResolutionAck = mode;
    if (mode === 'standby') {
      const phase = (Array.isArray(t.phases) && t.phases[t.currentPhaseIndex || 0]) || null;
      if (phase) phase.lateEnrollment = 'standby';
      t.lateEnrollment = 'standby';
    } else {
      t.p2Resolution = mode === 'bye' ? 'bye' : 'playin';
    }
    if (t._suspendedByPanel) {
      t.status = t._previousStatus || 'open';
      delete t._suspendedByPanel;
      delete t._previousStatus;
    }
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Suspensão temporária durante a preparação: intenção server-side ─────────
// Um painel não é estado canônico. Se ele precisa fechar inscrições enquanto uma decisão
// está pendente, a transição acontece aqui, sobre a leitura fresca, e a aba recebe o
// documento resultante. Assim fechar/reabrir não pode sobrescrever outra alteração.
exports.setDrawPreparationSuspension = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {}, tId = String(data.tournamentId || '').trim();
  const action = String(data.action || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !['suspend', 'resume'].includes(action)) throw new HttpsError('invalid-argument', 'Ação de preparação inválida.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização prepara o sorteio.', { tId, uid });
    if (hasDrawnBracket && hasDrawnBracket(t)) throw _drawFail('failed-precondition', 'A chave já foi sorteada; a preparação não pode mais mudar.', { tId, uid });
    if (t.pendingDraw) throw _drawFail('failed-precondition', 'Há um sorteio em revisão; conclua-o antes de alterar a preparação.', { tId, uid });
    if (action === 'suspend' && t.status === 'closed' && t._suspendedByPanel) return { ok:true, changed:false, tournament:t };
    if (action === 'resume' && !t._suspendedByPanel) return { ok:true, changed:false, tournament:t };
    const antes = _antesDoMotor(t);
    if (action === 'suspend') {
      t._previousStatus = t.status;
      t.status = 'closed';
      t._suspendedByPanel = true;
    } else {
      t.status = t._previousStatus || 'open';
      delete t._suspendedByPanel;
      delete t._previousStatus;
    }
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Reabertura e dissolução de elenco na preparação: server-side ────────────
exports.reopenDrawEnrollment = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {}, tId = String(data.tournamentId || '').trim();
  const reason = String(data.reason || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !['incomplete', 'odd'].includes(reason)) throw new HttpsError('invalid-argument', 'Motivo de reabertura inválido.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização reabre as inscrições.', { tId, uid });
    if (hasDrawnBracket && hasDrawnBracket(t)) throw _drawFail('failed-precondition', 'A chave já foi sorteada; reabra pela ferramenta do torneio.', { tId, uid });
    if (t.pendingDraw) throw _drawFail('failed-precondition', 'Há um sorteio em revisão; conclua-o antes de reabrir.', { tId, uid });
    const antes = _antesDoMotor(t);
    t.status = 'open';
    if (reason === 'incomplete') t.enrollmentStatus = 'open';
    delete t._suspendedByPanel;
    delete t._previousStatus;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

exports.dissolveIncompleteTeams = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId) throw new HttpsError('invalid-argument', 'Torneio obrigatório.');
  if (!drawWindow || typeof drawWindow._dissolveIncompleteTeams !== 'function') throw new HttpsError('failed-precondition', 'Motor de equipes indisponível.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização dissolve times incompletos.', { tId, uid });
    if (hasDrawnBracket && hasDrawnBracket(t)) throw _drawFail('failed-precondition', 'A chave já foi sorteada; os times não podem mais ser dissolvidos.', { tId, uid });
    if (t.pendingDraw) throw _drawFail('failed-precondition', 'Há um sorteio em revisão; conclua-o antes de dissolver os times.', { tId, uid });
    const outcome = drawWindow._dissolveIncompleteTeams(t);
    if (!outcome || !outcome.dissolved) return { ok:true, changed:false, dissolved:0, tournament:t };
    const antes = _antesDoMotor(t);
    t.participants = outcome.participants;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, dissolved:outcome.dissolved, tournament:b.clean };
  });
});

// ─── Fechamento de enquete de preparação: intenção server-side ─────────────
// A enquete suspende inscrições e altera o fluxo do sorteio. O navegador só pode pedir
// seu encerramento: a Function relê a enquete fresca, valida o autor e devolve o recibo.
// Participante só encerra após o prazo; organização pode encerrar antes.
exports.closeDrawPoll = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {}, tId = String(data.tournamentId || '').trim();
  const pollId = String(data.pollId || '').trim(), early = data.early === true;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !pollId) throw new HttpsError('invalid-argument', 'Enquete obrigatória.');
  const ref = db.collection('tournaments').doc(tId), agora = Date.now(), agoraIso = new Date(agora).toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    const polls = Array.isArray(t.polls) ? t.polls : [];
    const poll = polls.find((item) => item && String(item.id) === pollId);
    if (!poll) throw new HttpsError('not-found', 'Enquete não encontrada.');
    if (poll.status === 'closed') return { ok:true, changed:false, tournament:t };
    if (poll.status !== 'active') throw new HttpsError('failed-precondition', 'Esta enquete não está ativa.');
    if (early) {
      if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização encerra a enquete antes do prazo.', { tId, uid, pollId });
    } else {
      if (!_isTournamentAdmin(t, uid) && !_isTournamentParticipant(t, uid)) throw _drawFail('permission-denied', 'Só participantes do torneio encerram a enquete vencida.', { tId, uid, pollId });
      if (!Number.isFinite(Number(poll.deadline)) || agora < Number(poll.deadline)) throw new HttpsError('failed-precondition', 'O prazo da enquete ainda não terminou.');
    }
    const antes = _antesDoMotor(t);
    poll.status = 'closed';
    if (early) poll.deadline = agora;
    t.activePollId = null;
    if (t._pollSuspended) {
      t.status = 'open';
      delete t._pollSuspended;
    }
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Voto em enquete de preparação: intenção server-side ────────────────────
// O voto é identidade e decisão de sorteio. A Function usa apenas o UID autenticado,
// relê prazo/opções no documento fresco e retorna o torneio canônico à tela.
exports.castDrawPollVote = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  // Só para apagar a chave legada DO PRÓPRIO token; nunca é identidade de voto.
  const legacyEmail = request.auth && request.auth.token && typeof request.auth.token.email === 'string' ? request.auth.token.email.trim().toLowerCase() : '';
  const data = request.data || {}, tId = String(data.tournamentId || '').trim();
  const pollId = String(data.pollId || '').trim(), optionKey = String(data.optionKey || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !pollId || !optionKey) throw new HttpsError('invalid-argument', 'Voto inválido.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid) && !_isTournamentParticipant(t, uid)) throw _drawFail('permission-denied', 'Só participantes do torneio votam nesta enquete.', { tId, uid, pollId });
    const poll = (Array.isArray(t.polls) ? t.polls : []).find((item) => item && String(item.id) === pollId);
    if (!poll) throw new HttpsError('not-found', 'Enquete não encontrada.');
    if (poll.status !== 'active') throw new HttpsError('failed-precondition', 'Esta enquete já foi encerrada.');
    if (!Number.isFinite(Number(poll.deadline)) || Date.now() >= Number(poll.deadline)) throw new HttpsError('failed-precondition', 'O prazo da enquete terminou.');
    if (!(Array.isArray(poll.options) && poll.options.some((option) => option && String(option.key) === optionKey))) throw new HttpsError('invalid-argument', 'Opção de voto inválida.');
    if (!poll.votes || typeof poll.votes !== 'object') poll.votes = {};
    const hasLegacyOwnVote = !!(legacyEmail && legacyEmail !== uid && poll.votes[legacyEmail] != null);
    if (poll.votes[uid] === optionKey && !hasLegacyOwnVote) return { ok:true, changed:false, tournament:t };
    const antes = _antesDoMotor(t);
    poll.votes[uid] = optionKey;
    // Migra só a chave e-mail pertencente ao token autenticado; nenhum payload escolhe
    // qual voto legado será removido e o valor persistido permanece exclusivamente UID.
    if (hasLegacyOwnVote) delete poll.votes[legacyEmail];
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Leitura de aviso de enquete: intenção server-side ───────────────────────
// Receber o aviso não dá à tela permissão para alterar notificações de outras pessoas.
// A Function deriva o destinatário do token e marca apenas avisos daquele UID (ou e-mail
// legado do mesmo token) para a enquete indicada.
exports.markDrawPollNotificationsRead = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const legacyEmail = request.auth && request.auth.token && typeof request.auth.token.email === 'string' ? request.auth.token.email.trim().toLowerCase() : '';
  const data = request.data || {}, tId = String(data.tournamentId || '').trim(), pollId = String(data.pollId || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !pollId) throw new HttpsError('invalid-argument', 'Aviso de enquete inválido.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    const poll = (Array.isArray(t.polls) ? t.polls : []).find((item) => item && String(item.id) === pollId);
    if (!poll) throw new HttpsError('not-found', 'Enquete não encontrada.');
    const notifications = Array.isArray(t.pollNotifications) ? t.pollNotifications : [];
    const unread = notifications.filter((notification) => notification && !notification.read && String(notification.pollId || '') === pollId && (
      (notification.targetUid && notification.targetUid === uid) || (!notification.targetUid && legacyEmail && String(notification.targetEmail || '').toLowerCase() === legacyEmail)
    ));
    if (!unread.length) return { ok:true, changed:false, tournament:t };
    const antes = _antesDoMotor(t);
    unread.forEach((notification) => { notification.read = true; });
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Apuração de enquete de preparação: intenção server-side ────────────────
// Só a organização pode aplicar a decisão. O servidor conta os votos do documento
// fresco, fixa o vencedor uma vez e devolve a próxima intenção ao cliente sem aceitar
// vencedor, votos ou retrato de torneio no payload.
exports.applyDrawPollResult = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {}, tId = String(data.tournamentId || '').trim(), pollId = String(data.pollId || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !pollId) throw new HttpsError('invalid-argument', 'Enquete obrigatória.');
  const ref = db.collection('tournaments').doc(tId), resolvedAt = Date.now(), agoraIso = new Date(resolvedAt).toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização aplica o resultado da enquete.', { tId, uid, pollId });
    const poll = (Array.isArray(t.polls) ? t.polls : []).find((item) => item && String(item.id) === pollId);
    if (!poll) throw new HttpsError('not-found', 'Enquete não encontrada.');
    if (poll.resolved) return { ok:true, changed:false, winnerKey:String(poll.resolvedOption || ''), context:String(poll.context || ''), tournament:t };
    if (poll.status !== 'closed') throw new HttpsError('failed-precondition', 'Encerre a enquete antes de aplicar o resultado.');
    const counts = {}, options = Array.isArray(poll.options) ? poll.options : [];
    options.forEach((option) => { if (option && option.key != null) counts[String(option.key)] = 0; });
    Object.keys(poll.votes || {}).forEach((voter) => { const key = String(poll.votes[voter]); if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key]++; });
    let winnerKey = '', winnerCount = 0;
    options.forEach((option) => { const key = option && String(option.key); if (key && counts[key] > winnerCount) { winnerKey = key; winnerCount = counts[key]; } });
    if (!winnerKey) throw new HttpsError('failed-precondition', 'A enquete não recebeu votos válidos.');
    const antes = _antesDoMotor(t);
    poll.resolved = true;
    poll.resolvedOption = winnerKey;
    poll.resolvedAt = resolvedAt;
    t.activePollId = null;
    if (t._pollSuspended) { t.status = 'open'; delete t._pollSuspended; }
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, winnerKey, context:String(poll.context || ''), tournament:b.clean };
  });
});

// ─── Reabertura de enquete: decisão, suspensão e aviso pelo servidor ─────────
exports.reopenDrawPoll = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {}, tId = String(data.tournamentId || '').trim(), pollId = String(data.pollId || '').trim();
  const hours = Math.max(1, Math.min(168, Math.trunc(Number(data.hours) || 48)));
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !pollId) throw new HttpsError('invalid-argument', 'Enquete obrigatória.');
  const ref = db.collection('tournaments').doc(tId), now = Date.now(), deadline = now + hours * 3600000, agoraIso = new Date(now).toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização reabre a enquete.', { tId, uid, pollId });
    const poll = (Array.isArray(t.polls) ? t.polls : []).find((item) => item && String(item.id) === pollId);
    if (!poll) throw new HttpsError('not-found', 'Enquete não encontrada.');
    if (poll.status === 'active' && Number(poll.deadline) > now) throw new HttpsError('failed-precondition', 'A enquete ainda está aberta.');
    const antes = _antesDoMotor(t);
    poll.status = 'active'; poll.deadline = deadline; poll.resolved = false;
    poll.resolvedOption = null; poll.resolvedAt = null;
    t.activePollId = poll.id;
    if (t.status === 'open' || !t.status) { t._pollSuspended = true; t.status = 'closed'; }
    const recipients = Array.isArray(t.memberUids) ? Array.from(new Set(t.memberUids.map(String).filter(Boolean))) : [];
    if (!Array.isArray(t.pollNotifications)) t.pollNotifications = [];
    recipients.forEach((recipientUid) => t.pollNotifications.push({ targetUid:recipientUid, pollId:poll.id, timestamp:now, read:false }));
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    tx.set(ref.collection('notificationOutbox').doc('poll-reopened-' + _outboxDocIdPart(poll.id) + '-' + deadline), {
      schema:1, kind:'tournament-notification', type:'poll', title:'🗳️ Enquete reaberta',
      message:'A enquete foi reaberta pelo organizador. Vote novamente! Novo prazo: ' + hours + ' horas.',
      tournamentId:tId, tournamentName:t.name || '', level:'important', recipients,
      ctaLabel:'📊 Responder enquete', ctaUrl:'https://scoreplace.app/#tournaments/' + tId,
      createdAt:agoraIso, createdAtMs:now, dispatchStatus:'pending'
    });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

// ─── Decisões entre fases: somente a Function altera elenco e promoção ───────
// O painel mostra os inativos/W.O. e a possível linha extra, mas não pode aplicar
// essas escolhas sobre um snapshot que talvez já esteja atrasado.
exports.resolvePhaseInactives = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {}, tId = String(data.tournamentId || '').trim();
  const choice = String(data.choice || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId || !['keep', 'remove'].includes(choice)) throw new HttpsError('invalid-argument', 'Decisão inválida.');
  if (!drawWindow || typeof drawWindow._phaseNonEntrants !== 'function' || typeof drawWindow._purgePersonFromMaps !== 'function') {
    throw new HttpsError('failed-precondition', 'Motor de fases indisponível.');
  }
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização decide os participantes da próxima fase.', { tId, uid });
    const nextIdx = (t.currentPhaseIndex || 0) + 1;
    if (t._inactiveResolvedPhase === nextIdx) return { ok:true, changed:false, tournament:t };
    const antes = _antesDoMotor(t);
    if (choice === 'remove') {
      const fora = drawWindow._phaseNonEntrants(t);
      const all = Array.isArray(t.participants) ? t.participants.slice() : Object.values(t.participants || {});
      t.participants = all.filter((p) => fora.indexOf(p) === -1);
      fora.forEach((p) => {
        if (!p || typeof p !== 'object') return;
        drawWindow._purgePersonFromMaps(t, p.uid || null, p.displayName || p.name || '');
      });
    }
    t._inactiveResolvedPhase = nextIdx;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

exports.setPhasePromotion = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  const data = request.data || {}, tId = String(data.tournamentId || '').trim();
  const promote = data.promote === true;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  if (!tId) throw new HttpsError('invalid-argument', 'Torneio obrigatório.');
  const ref = db.collection('tournaments').doc(tId), agoraIso = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const t = await _leTorneio(tx, ref, tId);
    if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
    if (!_isTournamentAdmin(t, uid)) throw _drawFail('permission-denied', 'Só a organização decide a promoção entre fases.', { tId, uid });
    const idx = (t.currentPhaseIndex || 0) + 1;
    if (!Array.isArray(t.phases) || !t.phases[idx]) throw new HttpsError('failed-precondition', 'Próxima fase indisponível.');
    const antes = _antesDoMotor(t);
    t.phases[idx]._promoteLines = promote ? 1 : 0;
    t.phases[idx]._promoteAsked = true;
    delete t._phaseResInfo;
    const b = _gravaTorneio(tx, ref, t, antes, { agoraIso });
    return { ok:true, changed:true, tournament:b.clean };
  });
});

async function _notifyPublishedPendingDraw(t,tId,roundIndex,nowIso) {
  if(!t || t.isSandbox || t.notificationsMuted) return;
  const ids=new Set(); (t.participants||[]).forEach(p=>[p&&p.uid,p&&p.p1Uid,p&&p.p2Uid].forEach(u=>u&&ids.add(String(u))));
  const {profByUid}=await _loadLiveNames(ids); const mailed=new Set();
  for(const uid of ids){ const profile=profByUid[uid]; if(!profile) continue; const msg='🔄 Sorteio publicado no torneio '+(t.name||'')+'! Confira seus jogos.';
    if(profile.notifyPlatform!==false) try { await db.collection('users').doc(uid).collection('notifications').doc('pending-draw-'+tId+'-'+roundIndex).set({type:'draw',fromUid:'system',fromName:'scoreplace.app',fromPhoto:'',tournamentId:tId,tournamentName:t.name||'',message:msg,createdAt:nowIso,read:false},{merge:true}); } catch(e){console.warn('pending draw notif',e&&e.message);}
    await _queueDrawEmail(profile,_drawEmailOpts(t,tId,msg),mailed);
  }
}

// ─── Reconciliação idempotente da chave: repescagem nunca é decidida pelo render ──
// Um torneio criado ou pontuado por um bundle antigo pode conter uma vaga de repescagem
// legada. A tela pode pedir esta intenção, mas não calcula nem grava: a Function relê a
// chave inteira, aplica o motor canônico e só escreve se o documento fresco realmente mudou.
exports.reconcileBracket = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const tId = String((request.data && request.data.tournamentId) || '').trim();
  if (!tId) throw new HttpsError('invalid-argument', 'tournamentId é obrigatório.');
  if (!drawWindow || typeof drawWindow._reassignBestLosersToRepechage !== 'function') {
    throw _drawFail('internal', 'Motor de chave indisponível no servidor.', { tId });
  }

  const ref = db.collection('tournaments').doc(tId);
  const pre = await ref.get();
  if (!pre.exists) throw _drawFail('not-found', 'Torneio não encontrado.', { tId, uid });
  if (!_isTournamentParticipant(pre.data(), uid) && !_isTournamentAdmin(pre.data(), uid)) {
    throw _drawFail('permission-denied', 'Só quem participa do torneio pode reconciliar a chave.', { tId, uid });
  }

  const agoraIso = new Date().toISOString();
  try {
    return await db.runTransaction(async (tx) => {
      const t = await _leTorneio(tx, ref, tId);
      if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
      if (!_isTournamentParticipant(t, uid) && !_isTournamentAdmin(t, uid)) {
        throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
      }
      const antes = _antesDoMotor(t);
      const statusAntes = t.status;
      const trocas = drawWindow._reassignBestLosersToRepechage(t) || 0;
      const futuras = (typeof drawWindow._ensureFutureRounds === 'function')
        ? !!drawWindow._ensureFutureRounds(t, false, { now: Date.parse(agoraIso), thirdPlaceLabel: 'Disputa de 3º lugar' }) : false;
      // Reparos legados da Liga também pertencem à mesma leitura fresca. Abrir a chave ou
      // deixar o poller do navegador rodar não pode mais limpar rodada/folga por conta própria.
      const ligaPrematura = (typeof drawWindow._healPrematureLigaRounds === 'function')
        ? !!drawWindow._healPrematureLigaRounds(t) : false;
      const folgaLegada = (typeof drawWindow._healSitOutWinners === 'function')
        ? !!drawWindow._healSitOutWinners(t) : false;
      // Os dois heals abaixo já foram disparados pelo render. Agora a tela apenas pede
      // reconciliação: a decisão e qualquer escrita acontecem neste documento fresco.
      const folgaReativada = (typeof drawWindow._sanitizeSitOutsVsRoster === 'function')
        ? (drawWindow._sanitizeSitOutsVsRoster(t) || 0) : 0;
      const sobraMonarca = (typeof drawWindow._healMonarchRemainderToWaitlist === 'function')
        ? !!drawWindow._healMonarchRemainderToWaitlist(t) : false;
      if (typeof drawWindow._maybeFinishElimination === 'function') drawWindow._maybeFinishElimination(t);
      const mudou = trocas > 0 || futuras || ligaPrematura || folgaLegada || folgaReativada > 0 || sobraMonarca || t.status !== statusAntes;
      if (!mudou) return { ok: true, changed: false };
      const b = _gravaTorneio(tx, ref, t, antes, { agoraIso: agoraIso });
      return { ok: true, changed: true, changes: trocas, futureRoundsRepaired: futuras, ligaPrematureRepaired: ligaPrematura, sitOutRepaired: folgaLegada, reactivatedSitOutsRepaired: folgaReativada, monarchRemainderRepaired: sobraMonarca, tournament: b.clean };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(`reconcileBracket EXPLODIU em ${tId} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha ao reconciliar chave: ' + String((e && e.message) || e).slice(0, 300));
  }
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
    let t = doc.data();   // reatribuído pelo torneio MONTADO quando a rodada nasce
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

    /* ── L6.R1 · FUSO DO EVENTO, JANELA DE 1 MINUTO E TORNEIO DIVIDIDO ──────────────────
     * O que havia aqui errava três coisas de uma vez, e as três foram medidas:
     *   ① montava o horário com offset FIXO (`-03:00`) — o horário de Brasília de hoje, não
     *      o do EVENTO: erra Manaus, erra o Acre, erra qualquer torneio fora do Brasil e
     *      voltaria a errar no dia em que o horário de verão voltar;
     *   ② decidia o elenco no documento CRU. Num torneio DIVIDIDO o elenco mora em
     *      `inscritos` e o documento traz `participants: []` — a guarda `< 2` matava o
     *      sorteio EM SILÊNCIO. Medido em 31/ago: 1 torneio, 10 inscritos na subcoleção,
     *      166 min vencido, ZERO linha de log (L6.P1 na auditoria);
     *   ③ gravava `rounds` direto no doc, o que devolveria os jogos ao documento e desfaria
     *      a divisão.
     * Agora: fuso IANA do local do evento, janela do MESMO MINUTO local, montagem por
     * `_leTorneio` DENTRO da transação e persistência exclusivamente por `_gravaTorneio`. */
    const isLiga = t.format === 'Liga' || t.format === 'Ranking';
    if (!isLiga) continue;
    if (t.drawManual) continue;
    if (!t.drawFirstDate) continue;
    if (t.status === 'finished') continue;
    // v2.4.12: temporada acabou (endDate ou ligaSeasonMonths) → não gerar mais rodadas.
    if (_ligaSeasonEnded(t, now)) { console.log(`Auto-draw: ${tId} — temporada encerrada, skip`); continue; }
    // v2.3.96: já há um sorteio em revisão aguardando o organizador publicar/anular.
    if (t.pendingDraw) { console.log(`Auto-draw: ${tId} tem pendingDraw em revisão — skip`); continue; }

    /* (1) O FUSO DO EVENTO. Sem fuso seguro NÃO se sorteia — e o documento sai da agenda,
     * senão o diagnóstico se repetiria a cada minuto pra sempre. `autoDrawReconcile`
     * reavalia a cada 30 min e devolve o agendamento sozinho quando a origem existir. */
    const _fuso = await _fusoDoEvento(t);
    if (!_fuso.tz) {
      console.warn(`[autoDraw] ${tId} SEM FUSO — não sorteio automaticamente: ${_fuso.motivo}`);
      if (typeof t.nextDrawAt === 'number') {
        try { await doc.ref.update({ nextDrawAt: FieldValue.delete() }); }
        catch (e) { console.error(`[autoDraw] ${tId} ao tirar da agenda:`, e && e.message); }
      }
      continue;
    }

    /* (2) A JANELA. A rodada automática só nasce no MESMO MINUTO LOCAL do horário
     * agendado; o Scheduler pode entrar alguns segundos depois e isso vale. */
    const _cfg = _agenda.cfgDeAgenda(t);
    const _nowMs = now.getTime();
    const _devido = _agenda.slotDevido(_cfg, _nowMs, _fuso.tz);
    const _futuro = _agenda.proximoSlotFuturo(_cfg, _nowMs, _fuso.tz);

    if (_devido == null || !_agenda.mesmoMinuto(_nowMs, _devido)) {
      /* JANELA PERDIDA (ou ainda não chegou). ⛔ Não gera rodada atrasada, ⛔ não desliga o
       * auto-sorteio, e reagenda pro próximo horário de CALENDÁRIO — nunca `agora +
       * intervalo`, que deslocaria o ciclo pra sempre. O organizador segue podendo sortear
       * a rodada perdida na mão. */
      const _quer = (typeof _futuro === 'number') ? _futuro : null;
      const _tem = (typeof t.nextDrawAt === 'number') ? t.nextDrawAt : null;
      if (_quer !== _tem) {
        try {
          await doc.ref.update({ nextDrawAt: _quer != null ? _quer : FieldValue.delete() });
          if (_devido != null) {
            console.log(`Auto-draw: ${tId} — janela do slot perdida (fuso ${_fuso.tz}, fonte ${_fuso.fonte});` +
              ` reagendado pro próximo slot de calendário: ${_quer != null ? new Date(_quer).toISOString() : '(nenhum)'}`);
          }
        } catch (e) { console.error(`[autoDraw] ${tId} ao reagendar:`, e && e.message); }
      }
      continue;
    }

    // Motor indisponível → NUNCA improvisar; o organizador sorteia pelo app.
    if (typeof generateLigaRound !== 'function') {
      console.error(`Auto-draw: draw-core indisponível — pulando ${tId}`);
      continue;
    }

    /* (3) DENTRO DA JANELA. O bloco abaixo fecha junto com o `catch` que já existia — a
     * geração inteira continua sendo defense-in-depth: falhar aqui não escreve nada. */
    {
      try {
        const _refT = doc.ref;
        /* Nomes vivos são N leituras em `users/` e a transação os releria a cada retry, então
         * ficam FORA dela — e saem do torneio MONTADO, senão num torneio dividido não haveria
         * uid nenhum pra buscar (era outro efeito de decidir no documento cru). */
        try {
          const _tNomes = await _leTorneio(_TX_LEITURA, _refT, tId);
          if (_tNomes) { _tNomes.id = tId; await _preloadDrawNames(_tNomes); }
        } catch (e) { console.warn(`[autoDraw] ${tId} pré-carga de nomes falhou:`, e && e.message); }

        /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
         * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
         * cada tentativa produzir espelho e plano diferentes. */
        const _agoraIsoTx = new Date().toISOString();
        const _out = await db.runTransaction(async (tx) => {
          // ⭐ MONTA das subcoleções DENTRO da transação: é a única forma de decidir elenco
          // com o dado real e ainda ser clobber-free.
          const tf = await _leTorneio(tx, _refT, tId);
          if (!tf) return { pulou: 'torneio-sumiu' };
          tf.id = tId;
          const _tAntes = _antesDoMotor(tf);
          if (tf.status === 'finished') return { pulou: 'finished' };
          if (tf.pendingDraw) return { pulou: 'pendingDraw' };
          if (drawWindow && typeof drawWindow._suppressAutoDrawForPhases === 'function' &&
              drawWindow._suppressAutoDrawForPhases(tf)) return { pulou: 'fase-classificatoria-completa' };

          const _parts = Array.isArray(tf.participants) ? tf.participants : [];
          if (_parts.length < 2) return { pulou: 'menos-de-2-inscritos', n: _parts.length };

          /* ⛔ A TRAVA: a rodada de um slot nasce UMA vez. Manual e automático passam pela
           * mesma marca (`drawSlotAt`), gravada na MESMA transação que grava a rodada — é o
           * Firestore que serializa: quem perder a corrida re-executa, relê a marca e
           * desiste. Não é estado local, não é listener, não é timeout. */
          if (!_agenda.reivindicarSlot(tf, _devido)) return { pulou: 'slot-ja-sorteado' };

          _enrichParticipantsFromProfiles(tf); // gênero/skill/e-mail por uid
          const _res = generateLigaRound(tf, new Date(_devido));
          if (!_res || !_res.ok) return { pulou: (_res && _res.reason) || 'no-round-generated' };

          // o motor também mexe em lastAutoDrawAt; a marca do slot é a nossa e fica.
          tf.drawSlotAt = _devido;
          tf.lastAutoDrawAt = new Date(_devido).toISOString();
          tf.updatedAt = new Date().toISOString();

          if (tf.stagedDraw) {
            /* REDE DE SEGURANÇA (v2.3.96): o sorteio fica EM REVISÃO e o documento público
             * não pode mudar. Persiste-se uma cópia do estado ANTERIOR ao motor com só os
             * campos de agenda e o pacote em `pendingDraw` — assim `_gravaTorneio` vê diff
             * ZERO nas partes divididas e toca apenas o documento. */
            const tEspera = _tAntes ? JSON.parse(JSON.stringify(_tAntes)) : Object.assign({}, tf);
            tEspera.pendingDraw = {
              rounds: tf.rounds || [], standings: tf.standings || null,
              sitOutHistory: tf.sitOutHistory || null, opponentHistory: tf.opponentHistory || null,
              monarchWaitlist: tf.monarchWaitlist || null, status: 'active',
              roundIndex: _res.roundIndex, roundNumber: _res.roundNumber, firstDraw: !!_res.firstDraw,
              generatedAt: new Date().toISOString(), source: 'autoDraw'
            };
            tEspera.drawSlotAt = tf.drawSlotAt;
            tEspera.lastAutoDrawAt = tf.lastAutoDrawAt;
            tEspera.updatedAt = tf.updatedAt;
            _gravaTorneio(tx, _refT, tEspera, _tAntes, { agoraIso: _agoraIsoTx });
            return { pulou: 'staged', roundNumber: _res.roundNumber };
          }

          _gravaTorneio(tx, _refT, tf, _tAntes, { agoraIso: _agoraIsoTx });
          return { ok: true, t: tf, res: _res };
        });

        if (!_out || !_out.ok) {
          const _m = (_out && _out.pulou) || 'sem-resultado';
          if (_m === 'staged') {
            // o próprio `_gravaTorneio` já reagendou pela fronteira canônica
            console.log(`Auto-draw STAGED (review): round ${_out.roundNumber} held in pendingDraw for ${tId} — no public, no notify`);
            continue;
          }
          console.log(`Auto-draw: skip ${tId} (${_m}${(_out && _out.n !== undefined) ? ' n=' + _out.n : ''})` +
            ` · fuso ${_fuso.tz} (${_fuso.fonte})`);
          /* ⭐ O SLOT FOI CONSUMIDO DE QUALQUER JEITO — inclusive quando quem gerou foi o
           * MANUAL (`slot-ja-sorteado`), que é literalmente a regra: o automático reconhece
           * a geração e apenas agenda o próximo. Sem isto o documento voltaria à consulta a
           * cada minuto com o mesmo horário vencido, que foi o defeito da L6.P1. */
          const _q2 = (typeof _futuro === 'number') ? _futuro : null;
          const _t2 = (typeof t.nextDrawAt === 'number') ? t.nextDrawAt : null;
          if (_q2 !== _t2) {
            try { await doc.ref.update({ nextDrawAt: _q2 != null ? _q2 : FieldValue.delete() }); }
            catch (e) { console.error(`[autoDraw] ${tId} ao reagendar após skip:`, e && e.message); }
          }
          continue;
        }
        t = _out.t;
        const res = _out.res;

        console.log(`Auto-draw: round ${res.roundNumber} created with ${res.matchCount} match(es)` +
          ` [${res.firstDraw ? 'first draw' : 'next round'}] for ${tId} · fuso ${_fuso.tz} (${_fuso.fonte})`);

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

        // Sandbox/killswitch: o SB SORTEIA na mesma CF (fidelidade), mas NÃO notifica.
        const _sbMuteAuto = (t.isSandbox === true || t.notificationsMuted === true);
        if (_sbMuteAuto) console.log(`Auto-draw: ${tId} é sandbox/mudo — sorteio feito, notificações suprimidas`);
        const notifiedUids = new Set();
        const _mailedTo = new Set();   // dedup de E-MAIL da rodada (a mesma pessoa por 2 uids)
        let _mailed = 0;
        for (const p of activePlayers) {
          if (_sbMuteAuto) break;
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
            // notifyPlatform (in-app) e notifyEmail (e-mail) são opt-outs INDEPENDENTES —
            // como no cliente. Quem desliga o in-app continua recebendo o e-mail, e o
            // contrário também. Por isso o e-mail sai FORA do gate de notifyPlatform.
            if (profile.notifyPlatform !== false) {
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
            _mailed += await _queueDrawEmail(profile, _drawEmailOpts(t, tId, message), _mailedTo);
          }
        }
        if (!_sbMuteAuto) console.log(`Auto-draw: ${tId} — notificações in-app: ${notifiedUids.size} uid(s) | e-mails enfileirados: ${_mailed}`);

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
  const _ref = db.collection('tournaments').doc(tId);
  /* ── L6.R1 · MESMA DOUTRINA DA FASE 0 ───────────────────────────────────────────────
   * ① monta das subcoleções (num torneio dividido o elenco/pool não está no documento);
   * ② fuso do EVENTO e janela do MESMO MINUTO local; janela perdida reagenda o calendário;
   * ③ trava de slot compartilhada com o manual; ④ persistência só por `_gravaTorneio`. */
  try {
    const _mont = await _leTorneio(_TX_LEITURA, _ref, tId);
    if (_mont) { _mont.id = tId; t = _mont; }
  } catch (e) { console.warn(`Auto-draw phase: montagem falhou em ${tId}:`, e && e.message); }

  const _fzF = await _fusoDoEvento(t);
  if (!_fzF.tz) {
    console.warn(`[autoDraw phase] ${tId} SEM FUSO — não sorteio: ${_fzF.motivo}`);
    if (typeof t.nextDrawAt === 'number') {
      try { await _ref.update({ nextDrawAt: FieldValue.delete() }); } catch (e) { /* nada */ }
    }
    return;
  }
  const cur = t.currentPhaseIndex || 0;
  const _cfgF = _agenda.cfgDeAgenda((t.phases && t.phases[cur]) || {});
  const owed = _agenda.slotDevido(_cfgF, nowMs, _fzF.tz);
  const _futF = _agenda.proximoSlotFuturo(_cfgF, nowMs, _fzF.tz);
  if (owed == null || !_agenda.mesmoMinuto(nowMs, owed)) {
    const _q = (typeof _futF === 'number') ? _futF : null;
    const _h = (typeof t.nextDrawAt === 'number') ? t.nextDrawAt : null;
    if (_q !== _h) {
      try {
        await _ref.update({ nextDrawAt: _q != null ? _q : FieldValue.delete() });
        if (owed != null) console.log(`Auto-draw phase: ${tId} — janela perdida (${_fzF.tz}); próximo slot ${_q != null ? new Date(_q).toISOString() : '(nenhum)'}`);
      } catch (e) { console.error(`[autoDraw phase] ${tId} ao reagendar:`, e && e.message); }
    }
    return;
  }
  if (_agenda.slotReivindicado(t, owed)) {
    console.log(`Auto-draw phase: skip ${tId} (slot-ja-sorteado) — quem gerou foi o manual`);
    return;
  }
  await _preloadDrawNames(t); // v4.5.85: nomes vivos por uid antes do motor de fase
  /* ⭐ O MOTOR RODA DENTRO DA TRANSAÇÃO, sobre o torneio montado FRESCO. Antes ele rodava
   * sobre uma leitura de fora e gravava com `.update()` seletivo — sem releitura, portanto
   * last-write-wins contra qualquer coisa que tivesse acontecido na quadra no meio. E a
   * trava de slot é reivindicada aqui, na mesma transação que grava a rodada. */
  /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
   * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
   * cada tentativa produzir espelho e plano diferentes. */
  const _agoraIsoTx = new Date().toISOString();
  const _outF = await db.runTransaction(async (tx) => {
    const tf = await _leTorneio(tx, _ref, tId);
    if (!tf) return { pulou: 'torneio-sumiu' };
    tf.id = tId;
    const _tAntesF = _antesDoMotor(tf);
    if (tf.status === 'finished') return { pulou: 'finished' };
    if (!_agenda.reivindicarSlot(tf, owed)) return { pulou: 'slot-ja-sorteado' };
    _enrichParticipantsFromProfiles(tf); // v1.3.52: gênero/skill/email por uid
    if (typeof drawWindow._rehydrateEntryNames === 'function') drawWindow._rehydrateEntryNames(tf);
    const ok = drawWindow._phaseGenNextLeagueRound(tf, cur);
    if (!ok) return { pulou: 'gen-falhou-ou-jogadores-insuficientes' };
    // v3.1.16 (inc 8): a rodada da fase mora em `phaseRounds[cur]`; o dedup por slot é o
    // `lastAutoDrawAt` da própria fase, e a marca canônica é `drawSlotAt` (topo).
    tf.phaseRounds[cur].lastAutoDrawAt = owed;
    tf.drawSlotAt = owed;
    tf.lastAutoDrawAt = new Date(owed).toISOString();
    tf.updatedAt = now.toISOString();
    // v4.4.70 FONTE ÚNICA Rei/Rainha: normaliza os grupos antes de gravar (a mesma
    // função canônica vendored que o cliente usa).
    if (drawWindow && typeof drawWindow._foldMonarchGroups === 'function') {
      try { drawWindow._foldMonarchGroups({ phaseRounds: tf.phaseRounds }); } catch (e) { /* best-effort */ }
    }
    _gravaTorneio(tx, _ref, tf, _tAntesF, { agoraIso: _agoraIsoTx });
    return { ok: true, t: tf };
  });
  if (!_outF || !_outF.ok) {
    console.log(`Auto-draw phase: skip ${tId} (${(_outF && _outF.pulou) || 'sem-resultado'})`);
    const _q = (typeof _futF === 'number') ? _futF : null;
    const _h = (typeof t.nextDrawAt === 'number') ? t.nextDrawAt : null;
    if (_q !== _h) {
      try { await _ref.update({ nextDrawAt: _q != null ? _q : FieldValue.delete() }); }
      catch (e) { console.error(`[autoDraw phase] ${tId} ao reagendar após skip:`, e && e.message); }
    }
    return;
  }
  t = _outF.t;
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
  // Sandbox/killswitch: SB sorteia na mesma CF, mas não notifica.
  const _sbMuteAuto = (t.isSandbox === true || t.notificationsMuted === true);
  const notified = new Set();
  const _mailedToPh = new Set();   // dedup de e-mail desta rodada de fase
  let _mailedPh = 0;
  for (const p of pool) {
    if (_sbMuteAuto) break;
    const uids = [];
    [p && p.uid, p && p.p1Uid, p && p.p2Uid].forEach(u => { if (u) uids.push(String(u)); });
    const message = buildMsg(new Set(uids)) || 'Nova rodada sorteada! Confira seus jogos.';
    for (const uid of uids) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      const profile = _profByUid[uid]; // já carregado no batch acima
      if (!profile) continue;
      // in-app e e-mail são opt-outs independentes (mesma regra do cliente).
      if (profile.notifyPlatform !== false) {
        try {
          await db.collection('users').doc(uid).collection('notifications').add({
            type: 'draw', fromUid: 'system', fromName: 'scoreplace.app', fromPhoto: '',
            tournamentId: tId, tournamentName: t.name || '', message, createdAt: now.toISOString(), read: false
          });
        } catch (e) { console.warn(`Notif phase error uid ${uid}:`, e.message); }
      }
      _mailedPh += await _queueDrawEmail(profile, _drawEmailOpts(t, tId, message), _mailedToPh);
    }
  }
  if (!_sbMuteAuto) console.log(`Auto-draw phase: ${tId} — in-app: ${notified.size} uid(s) | e-mails enfileirados: ${_mailedPh}`);
}

// Notificação de rodada incremental manual/automática: uma única entrega server-side.
async function _notifyIncrementalPhaseRound(t, tId, phaseIdx, nowIso) {
  const slot = (t.phaseRounds && t.phaseRounds[phaseIdx]) || {};
  const rounds = slot.rounds || [];
  const maxR = rounds.reduce((mx, r) => Math.max(mx, (r && r.round) || 1), 0);
  const matches = ((rounds.find(r => ((r && r.round) || 1) === maxR) || {}).matches || [])
    .filter(m => m && !m.isSitOut && !m.isBye)
    .map(m => ({ p1: m.p1 || '', p2: m.p2 || '', label: m.label || '', p1Uids: _slotUidsOf(m, 'p1'), p2Uids: _slotUidsOf(m, 'p2') }));
  const pool = Array.isArray(slot.pool) ? slot.pool : [];
  const uids = new Set(); matches.forEach(m => { m.p1Uids.forEach(u => uids.add(u)); m.p2Uids.forEach(u => uids.add(u)); });
  pool.forEach(p => [p && p.uid, p && p.p1Uid, p && p.p2Uid].forEach(u => { if (u) uids.add(String(u)); }));
  const { profByUid, nameByUid } = await _loadLiveNames(uids);
  const mailed = new Set(), notified = new Set();
  for (const p of pool) {
    const mine = [p && p.uid, p && p.p1Uid, p && p.p2Uid].filter(Boolean).map(String);
    const mineSet = new Set(mine);
    const games = matches.filter(m => m.p1Uids.some(u => mineSet.has(u)) || m.p2Uids.some(u => mineSet.has(u)));
    const message = games.length ? ('🔄 Nova rodada no torneio ' + (t.name || '') + '!\n\n' + games.map((m,i) => (m.label || ('Jogo '+(i+1))) + ':\n' + _sideDisplayName(m.p1Uids,nameByUid,m.p1) + '\nvs\n' + _sideDisplayName(m.p2Uids,nameByUid,m.p2)).join('\n\n')) : 'Nova rodada sorteada! Confira seus jogos.';
    for (const uid of mine) {
      if (notified.has(uid)) continue; notified.add(uid);
      const profile=profByUid[uid]; if (!profile) continue;
      if (!t.isSandbox && !t.notificationsMuted && profile.notifyPlatform !== false) {
        try {
          // ID determinístico: retry da callable não duplica o aviso da mesma rodada.
          await db.collection('users').doc(uid).collection('notifications').doc('phase-round-' + tId + '-' + phaseIdx + '-' + maxR).set({ type:'draw', fromUid:'system', fromName:'scoreplace.app', fromPhoto:'', tournamentId:tId, tournamentName:t.name||'', message, createdAt:nowIso, read:false }, { merge:true });
        } catch (e) { console.warn(`Notif phase manual error uid ${uid}:`, e && e.message); }
      }
      if (!t.isSandbox && !t.notificationsMuted) await _queueDrawEmail(profile,_drawEmailOpts(t,tId,message),mailed);
    }
  }
}

exports.closePhaseLeagueRound = onCall(async (request) => {
  const uid=request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated','Entre na sua conta.');
  const tId=String((request.data&&request.data.tournamentId)||'').trim();
  const phaseIdx=parseInt(request.data&&request.data.phaseIdx,10); const force=!!(request.data&&request.data.force);
  if (!tId || !Number.isInteger(phaseIdx) || phaseIdx<0) throw new HttpsError('invalid-argument','Torneio e fase são obrigatórios.');
  if (!drawWindow || typeof drawWindow._phaseGenNextLeagueRound!=='function' || typeof drawWindow._phaseRoundRng!=='function') throw _drawFail('internal','Motor de Liga indisponível no servidor.',{tId});
  const ref=db.collection('tournaments').doc(tId), nowMs=Date.now(), nowIso=new Date(nowMs).toISOString();
  // Perfis são uma leitura auxiliar; nunca faça I/O externo dentro de uma transação
  // que o Firestore pode repetir.
  const seed=await ref.get();
  if (seed.exists) await _preloadDrawNames(seed.data());
  const out=await db.runTransaction(async tx=>{
    const t=await _leTorneio(tx,ref,tId); if(!t) throw new HttpsError('not-found','Torneio não encontrado.');
    if (!_isTournamentAdmin(t,uid)) throw _drawFail('permission-denied','Só a organização encerra a rodada.',{tId,uid});
    const slot=(t.phaseRounds&&t.phaseRounds[phaseIdx])||null; if(!slot) return {ok:false,reason:'phase-not-found'};
    const rounds=slot.rounds||[]; const maxR=rounds.reduce((mx,r)=>Math.max(mx,(r&&r.round)||1),0);
    const current=[]; rounds.filter(r=>((r&&r.round)||1)===maxR).forEach(r=>(r.matches||[]).forEach(m=>current.push(m)));
    if (!force && current.some(m=>!m.winner&&!m.isBye&&!m.isSitOut)) return {ok:false,reason:'round-incomplete'};
    const before=_antesDoMotor(t); _enrichParticipantsFromProfiles(t); if (typeof drawWindow._rehydrateEntryNames==='function') drawWindow._rehydrateEntryNames(t);
    const made=drawWindow._phaseGenNextLeagueRound(t,phaseIdx,{ts:nowMs,rnd:drawWindow._phaseRoundRng(tId+':'+phaseIdx+':'+(maxR+1)+':'+nowMs)});
    if(!made) return {ok:false,reason:'round-not-generated'};
    _gravaTorneio(tx,ref,t,before,{agoraIso:nowIso}); return {ok:true,tournament:t};
  });
  if(out.ok) await _notifyIncrementalPhaseRound(out.tournament,tId,phaseIdx,nowIso);
  return out;
});

// ─── Reconciliador de nextDrawAt (v2.6.74) ──────────────────────────────────
// O autoDraw (acima) consulta por `nextDrawAt` pra ser barato + na hora. Mas:
//  (a) torneios LEGADOS (criados antes deste campo) não têm nextDrawAt → a range
//      query os EXCLUI (Firestore ignora docs com o campo ausente) → nunca seriam
//      sorteados. (b) drift: se algum caminho mutar o agendamento sem recalcular.
// Este reconciliador varre a coleção a cada 30min e grava o nextDrawAt correto
// (via o MESMO _nextOwedDrawMs) onde está ausente/desatualizado — backfill + cura.
// NÃO sorteia (isso é só do autoDraw) → zero risco de disparo duplo. Custo: 48
// varreduras/dia (barato), escrevendo só quando o valor muda.
// ─── A FILA DE ESPERA FORMA GRUPO SOZINHA (v1.7.61) ─────────────────────────
// PEDIDO DO DONO (07/ago/2026): _"automatize esse motor de criar novo grupo respeitando a
// proporção estipulada pelo organizador e garanta que na próxima vez que acumular o
// necessário isso aconteça automaticamente pelo motor sem eu precisar ficar dando prompts"_.
//
// MEDIDO — por que virou prompt: o único gatilho da integração tardia é do CLIENTE
// (`_triggerLateIntegration`, bracket.js), roda **só quando o ORGANIZADOR abre a chave**
// (`if (isOrg && …)`) e ainda é filtrado por uma assinatura em memória. No Confra a CF
// `integrateLateEntries` foi chamada pela última vez em 06/ago 15:05 UTC, quando a fila
// tinha 3 pessoas; ela chegou a 4 às 18:19 UTC e NADA rodou depois — a formação ficou
// esperando alguém abrir uma tela. Automação que depende de um humano abrir tela não é
// automação.
//
// Aqui a varredura que JÁ existe (a cada 30 min, e que já lê todos os torneios pro
// nextDrawAt) passa a fechar os grupos que a fila permitir. Custo ~zero: é o mesmo doc já
// carregado. Só toca torneio que precisa: Liga em Rei/Rainha, fase 0, com fila não-vazia.
// A decisão de FORMAR continua inteira no motor vendorado — aqui só há o disparo e a
// persistência, iguais às da callable `integrateLateEntries` (txn + write-boundary).
// TODO GRUPO NOVO AVISA OS ENVOLVIDOS (ordem do dono, 07/ago/2026: _"toda vez que criar
// grupo novo precisa disparar notificação para os envolvidos"_).
//
// Antes disto o único aviso de grupo formado era um TOAST do cliente — quem não estava com
// a tela aberta não sabia de nada. E com a formação passando pro servidor não haveria nem
// toast: a pessoa ganhava 3 jogos e ninguém contava.
//
// Usa os MESMOS canais do sorteio automático, não um paralelo: in-app em
// `users/{uid}/notifications` + fila `notif_email_queue` (que o flushNotifEmailDigest
// consolida). in-app e e-mail são opt-outs INDEPENDENTES — quem desligou o sininho
// continua querendo o e-mail —, então o e-mail fica FORA do gate de notifyPlatform.
// Nível `fundamental`: é o mesmo peso de um sorteio, chega até a quem só quer o essencial.
// A mensagem é PERSONALIZADA: cada um lê "você" e os nomes dos outros três.
async function _avisarGrupoFormado(tId, tName, novos) {
  if (!Array.isArray(novos) || !novos.length) return 0;
  const prof = (drawWindow && typeof drawWindow._spMapaDePerfis === 'function')
    ? drawWindow._spMapaDePerfis() : ((drawWindow && drawWindow._profByUid) || {});
  const nomeDe = (uid, fallback) => {
    const d = prof[uid];
    return (d && (d.displayName || d.name)) || fallback || '';
  };
  const agora = new Date().toISOString();
  const avisados = new Set(), mailedTo = new Set();
  let inApp = 0, mails = 0;
  for (const g of novos) {
    const uids = (g.uids || []).filter(Boolean);
    for (let i = 0; i < uids.length; i++) {
      const uid = String(uids[i]);
      if (avisados.has(uid)) continue;
      avisados.add(uid);
      const perfil = prof[uid];
      if (!perfil) continue;
      // os outros três, pelo UID e na ordem do grupo; o nome gravado só como reserva
      const outros = [];
      uids.forEach((u, j) => {
        if (j === i) return;
        const n = nomeDe(u, (g.players || [])[j]);
        if (n) outros.push(n);
      });
      const comQuem = outros.length === 3
        ? outros[0] + ', ' + outros[1] + ' e ' + outros[2]
        : outros.join(', ');
      const message = 'Saiu da lista de espera: você está no ' + (g.name || 'novo grupo') +
        (comQuem ? ' com ' + comQuem : '') + '. São 3 jogos, em duplas rotativas.';
      if (perfil.notifyPlatform !== false) {
        try {
          await db.collection('users').doc(uid).collection('notifications').add({
            type: 'draw', fromUid: 'system', fromName: 'scoreplace.app', fromPhoto: '',
            tournamentId: tId, tournamentName: tName || '', message, createdAt: agora, read: false
          });
          inApp++;
        } catch (e) { console.warn(`[espera→grupo] notif in-app falhou uid ${uid}:`, e && e.message); }
      }
      mails += await _queueDrawEmail(perfil, _drawEmailOpts({ name: tName }, tId, message), mailedTo);
    }
  }
  console.log(`[espera→grupo] avisos: ${inApp} in-app, ${mails} e-mail(s) enfileirado(s)`);
  return inApp;
}

async function _formarGruposDaEspera(doc) {
  const t0 = doc.data();
  if (!drawWindow || typeof integrateLateFn !== 'function') return 0;
  const _liga = drawWindow._isLigaFormat ? drawWindow._isLigaFormat(t0) : (t0.format === 'Liga' || t0.format === 'Ranking');
  if (!_liga || t0.ligaRoundFormat !== 'rei_rainha') return 0;
  if ((t0.currentPhaseIndex || 0) !== 0) return 0;
  if (t0.status === 'finished' || t0.status === 'closed') return 0;
  const _fila = (Array.isArray(t0.standbyParticipants) ? t0.standbyParticipants.length : 0) +
                (Array.isArray(t0.waitlist) ? t0.waitlist.length : 0);
  if (_fila < 4) return 0;   // sem 4 na fila não há grupo possível — nem carrega perfil

  // nome VIVO e gênero por uid ANTES do motor: a entrada da espera é strippada (só uid),
  // e sem isto o gênero não resolve e a proporção travada recusa todo mundo.
  await _preloadDrawNames(t0);
  try {
    /* ⛔ INSTANTE ESTÁVEL DA OPERAÇÃO — calculado UMA VEZ, FORA do callback.
     * O Firestore RE-EXECUTA o callback no retry; um `new Date()` lá dentro faria
     * cada tentativa produzir espelho e plano diferentes. */
    const _agoraIsoTx = new Date().toISOString();
    const res = await db.runTransaction(async (tx) => {
      // A query da varredura traz só o documento de configuração. Para torneio dividido,
      // grupos e jogos vivem nas subcoleções: montar aqui é obrigatório antes de deixar o
      // motor alterar a fila, senão a gravação posterior não tem como comparar/escrever
      // as partes canônicas. É o mesmo caminho de drawRound/integrateLateEntries.
      const t = await _leTorneio(tx, doc.ref, doc.id);
      if (!t) return { changed: false };
      const _tAntes = _antesDoMotor(t);
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) { /* best-effort */ }
      _enrichParticipantsFromProfiles(t);
      // nomes dos grupos ANTES, pra saber depois quais nasceram agora (e avisar só eles)
      const antes = new Set();
      (t.rounds || []).forEach((r) => (r.monarchGroups || []).forEach((g) => { if (g && g.name) antes.add(g.name); }));
      const r = integrateLateFn(t, {});
      if (!r || !r.ok || !r.changed) return { changed: false };
      const novos = [];
      (t.rounds || []).forEach((rr) => (rr.monarchGroups || []).forEach((g) => {
        if (g && g.name && !antes.has(g.name)) {
          novos.push({ name: g.name, players: (g.players || []).slice(), uids: (g.playersUids || []).slice() });
        }
      }));
      // `_gravaTorneio` preserva o marcador e grava apenas os registros que mudaram em
      // cada subcoleção. Nunca usar `tx.set` direto: ele recolocaria os pesados no doc ou
      // descartaria mudanças de grupos/jogos ao formar a espera.
      _gravaTorneio(tx, doc.ref, t, _tAntes, { agoraIso: _agoraIsoTx });
      return { changed: true, monarch: r.monarch || 0, wlClean: r.wlClean || 0, novos: novos, nome: t.name || '' };
    });
    if (res.changed) {
      console.log(`[espera→grupo] ${doc.id}: ${res.monarch} grupo(s) formado(s) da lista de espera`);
      await _avisarGrupoFormado(doc.id, res.nome, res.novos || []);
      return res.monarch || 0;
    }
  } catch (e) {
    // Best-effort POR TORNEIO: um doc problemático não pode derrubar a varredura inteira.
    console.error(`[espera→grupo] ${doc.id} falhou:`, (e && e.message) || e);
  }
  return 0;
}

exports.autoDrawReconcile = onSchedule('every 30 minutes', async (event) => {
  const now = Date.now();
  let scanned = 0, fixed = 0, gruposDaEspera = 0;
  if (!drawWindow || typeof drawWindow._nextOwedDrawMs !== 'function') {
    console.error('[autoDrawReconcile] _nextOwedDrawMs indisponível — abortando');
    return;
  }
  const snap = await db.collection('tournaments').get();
  let semFuso = 0;
  for (const doc of snap.docs) {
    scanned++;
    const t = doc.data();
    /* ── L6.R1 · A MESMA DECISÃO CANÔNICA DO `autoDraw` ────────────────────────────────
     * ⛔ Este reconciliador JAMAIS pode recolocar no banco um `nextDrawAt` já vencido: era
     * assim que o documento ficava preso na consulta do cron pra sempre. `_nextOwedDrawMs`
     * segue decidindo SE há sorteio previsto (formato, manual, temporada, fase); o QUANDO
     * vem do calendário no FUSO DO EVENTO, e nunca do passado. Sem fuso seguro o campo sai
     * — e sai CONTADO, pra o diagnóstico existir sem virar uma linha por minuto. */
    let want = null;
    try {
      const owed = drawWindow._nextOwedDrawMs(t, now);
      if (typeof owed === 'number') {
        const fz = await _fusoDoEvento(t);
        if (!fz.tz) { semFuso++; }
        else {
          const inc = !!(drawWindow._isIncrementalLigaPhase && drawWindow._isIncrementalLigaPhase(t));
          const cur = t.currentPhaseIndex || 0;
          const fonte = inc ? ((t.phases && t.phases[cur]) || {}) : t;
          const q = _agenda.agendamentoCanonico(_agenda.cfgDeAgenda(fonte), t, now, fz.tz);
          if (typeof q === 'number') want = q;
        }
      }
    } catch (e) { /* doc malformado: trata como sem sorteio devido */ }
    const have = (typeof t.nextDrawAt === 'number') ? t.nextDrawAt : null;
    if (want !== have) {
      try {
        await doc.ref.update({ nextDrawAt: want != null ? want : FieldValue.delete() });
        fixed++;
      } catch (e) { console.error(`[autoDrawReconcile] falha ao atualizar ${doc.id}:`, e && e.message); }
    }
    // …e, no mesmo doc já carregado, fecha os grupos que a lista de espera permitir.
    gruposDaEspera += await _formarGruposDaEspera(doc);
  }
  console.log(`[autoDrawReconcile] ${scanned} torneios varridos, ${fixed} nextDrawAt atualizados, ` +
    `${gruposDaEspera} grupo(s) formado(s) da lista de espera` +
    (semFuso ? `, ${semFuso} SEM FUSO resolvível (fora da agenda automática — o organizador ainda sorteia na mão)` : ''));
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


// ══════════════════════════════════════════════════════════════════════════════
// ⭐ RESUMO DO TORNEIO — o documento leve que a TELA INICIAL lê, sempre em dia
//
// DESENHO (ordem do dono, 25/ago/2026): _"na dashboard precisamos da versão
// reduzida sempre e clicando no torneio traz os detalhes. esse sempre foi o
// desenho."_ A implementação tinha derivado: a tela inicial baixava o documento
// INTEIRO de cada torneio (chave, inscritos, placares, histórico) pra desenhar um
// cartão. MEDIDO na base real: 420 KB → 44 KB (89,6% menor).
//
// ⛔ POR QUE ESTA FUNÇÃO MORA NO CODEBASE DO AUTODRAW, e não no principal:
// é AQUI que existe o shim com o código REAL da tela (`draw-core.js` monta o
// `window` e carrega o vendor). Os números do cartão — competidores, espera,
// progresso — saem das MESMAS funções que o app usa
// (`_countCompetitors`, `_waitlistPeopleCount`, `_getTournamentProgress`).
// MEDIDO em 25/ago/2026: uma reimplementação minha divergia em 10 dos 28 torneios
// da base real (Confra 143 contra 146 competidores; "Misto FUTVOLEI" 0/7 contra
// 12/19 de progresso). Número errado no cartão é pior que cartão lento.
// Com os helpers do app: 28 de 28 batem exatamente.
//
// ⚠️ EM TEMPO REAL, e sem escrever à toa: o gatilho é `onDocumentWritten`, então o
// resumo acompanha qualquer mudança no ato — mas `summaryMudou` compara o resumo
// ANTES e DEPOIS e só grava quando muda algo que o cartão mostra. Sem isso, um
// torneio ao vivo geraria uma escrita de resumo a cada ponto marcado.
// ⛔ O resumo é DERIVADO, nunca fonte da verdade: é regenerado INTEIRO a cada
// mudança relevante, então qualquer divergência se corrige na escrita seguinte.
// ══════════════════════════════════════════════════════════════════════════════
exports.tournamentSummary = onDocumentWritten(
  { document: 'tournaments/{tournamentId}', region: 'us-central1', memory: '512MiB', timeoutSeconds: 120 },
  async (event) => {
    const id = event.params && event.params.tournamentId;
    try {
      const db = getFirestore();
      const antes = (event.data && event.data.before && event.data.before.exists) ? event.data.before.data() : null;
      const depois = (event.data && event.data.after && event.data.after.exists) ? event.data.after.data() : null;

      // torneio apagado → o resumo some junto (senão a tela mostraria fantasma)
      if (!depois) {
        await db.collection('tournaments_summary').doc(id).delete().catch(() => {});
        return;
      }

      // as funções do APP, do shim. Sem elas o resumo sairia com os derivados
      // NULOS — melhor não ter número do que ter número errado.
      const H = _tourSummary.helpersDe(drawWindow);
      if (!H.progress || !H.competitors || !H.waitlistPeople) {
        console.error('[tournamentSummary] shim sem os helpers do app — resumo NÃO gravado', id);
        return;
      }

      /* ⛔ TORNEIO DIVIDIDO: O RESUMO SAIRIA ZERADO (regressão medida em 26/ago).
       * `buildSummary` deriva do DOCUMENTO. Com os jogos fora dele, o Confra passou de
       * `105 jogos · 72 feitos · 69%` pra `0/0/0` — a barra de progresso da tela inicial
       * zerada pra todo mundo. Não é número errado por arredondamento: é a tela dizendo
       * que um torneio com 72 placares não começou.
       * ⇒ Monta das subcoleções ANTES de resumir. Custa uma leitura da subcoleção por
       * gravação do torneio; o resumo é o que a tela inicial inteira lê.
       *
       * ⛔ E O PORTÃO TAMBÉM: `summaryMudou` compara os dois DOCUMENTOS. Com o progresso
       * fora do documento, ele nunca veria progresso mudar e o resumo congelaria no
       * primeiro valor — pior que zerado, porque parece certo. Com o marcador posto o
       * portão sai do caminho e o resumo é refeito sempre. */
      let paraResumo = depois;
      const _fora = Array.isArray(depois._semPesados) ? depois._semPesados : null;
      if (_fora && _fora.length) {
        try {
          // ⭐ mesmo caminho único do leitor — aqui fora de transação
          paraResumo = await _tSplit.montarDoBanco(JSON.parse(JSON.stringify(depois)),
            async (colecao) => (await db.collection('tournaments').doc(id).collection(colecao).get())
              .docs.map((d) => d.data()));
        } catch (eM) {
          // ⛔ Resumir o doc cru aqui gravaria 0/0/0 por cima do resumo bom. Não gravar
          // deixa o resumo ANTERIOR de pé, que é velho mas verdadeiro.
          console.error('[tournamentSummary]', id, '⛔ não montei das subcoleções — resumo NÃO regravado', eM);
          return;
        }
      } else if (antes && !_tourSummary.summaryMudou(antes, depois, id, H)) {
        // nada que o cartão mostra mudou → não regrava (economia real em torneio ao vivo)
        return;
      }

      const resumo = _tourSummary.buildSummary(paraResumo, id, H);
      if (!resumo) return;
      await db.collection('tournaments_summary').doc(id).set(resumo);
    } catch (e) {
      console.error('[tournamentSummary] falhou', id, e);
    }
  }
);


// ══ ⭐ ESPELHO PRO BANCO NOVO (2.0.89) ═══════════════════════════════════════
// Ordem do dono: "cria o banco novo, lê o banco atual, grava no banco novo e refaz as
// ligações para gravarem também no banco novo… nada da Confra pode mudar no que as
// pessoas veem e como ela funciona".
//
// ⭐ POR QUE UM GATILHO, E NÃO ESCRITA DUPLA NO CLIENTE:
// o torneio é gravado por MUITOS caminhos — inscrição, sorteio, placar, W.O., lista
// de espera — alguns em TRANSAÇÃO, alguns por Cloud Function. Interceptar um por um é
// exatamente onde uma migração quebra: basta esquecer um e o banco novo diverge em
// silêncio. O gatilho vê TODA escrita, venha de onde vier, e **nenhuma linha do
// cliente muda** — então inscrição, sorteio, placar, W.O., ativo/inativo, espera e
// classificação congelada seguem no caminho de sempre, byte por byte.
//
// ⛔ O banco velho continua sendo a VERDADE. Isto aqui só ESPELHA. Trocar a leitura é
// uma decisão separada, depois de o conferidor ficar verde por dias.
//
// Idempotente e incremental: grava só o que mudou e apaga o que deixou de existir —
// um torneio ao vivo escreve muito, e reescrever 112 jogos a cada ponto seria trocar
// um problema de custo por outro.
// ⛔ COMPARA O DOCUMENTO ANTES × DEPOIS — NÃO LÊ O ESPELHO.
// A 1ª versão desta função fazia `col.get()` pra saber o que mudou. No Confra isso
// seriam ~456 LEITURAS por lançamento de placar (112 jogos + 144 inscritos + 200
// eventos), num torneio ao vivo que escreve o dia inteiro. Seria trocar um problema
// de peso por um de custo. O gatilho JÁ RECEBE o antes e o depois: o diff sai daí,
// de graça, e só as linhas que mudaram de fato são gravadas.
function _diffEspelho(antes, depois, chaveDe) {
  const mapa = (lista) => {
    const m = new Map();
    (lista || []).forEach((it) => m.set(String(chaveDe(it)), it));
    return m;
  };
  const A = mapa(antes), D = mapa(depois);
  const gravar = [], apagar = [];
  D.forEach((item, k) => {
    const a = A.get(k);
    if (!a || JSON.stringify(a) !== JSON.stringify(item)) gravar.push({ k, item });
  });
  A.forEach((_, k) => { if (!D.has(k)) apagar.push(k); });
  return { gravar, apagar };
}

/* `soDeixaCrescer`: o espelho ACRESCENTA e nunca apaga. É o modo certo pro HISTÓRICO,
 * que é um log de auditoria — linha escrita não some, e o documento pode ser podado sem
 * que o espelho perca o que foi podado (é justamente pra isso que a poda existe).
 * ⛔ NÃO usar em `matches`/`participants`: lá o desaparecimento é informação real (jogo
 * removido, inscrito que saiu) e não apagar deixaria fantasma na tela. */
async function _espelhaColecao(db, id, nome, antes, depois, chaveDe, soDeixaCrescer) {
  const d0 = _diffEspelho(antes, depois, chaveDe);
  const gravar = d0.gravar;
  const apagar = soDeixaCrescer ? [] : d0.apagar;
  if (!gravar.length && !apagar.length) return { gravados: 0, apagados: 0, total: (depois || []).length };
  const col = db.collection('tournaments').doc(id).collection(nome);
  let lote = db.batch(), n = 0;
  const solta = async () => { if (n) { await lote.commit(); lote = db.batch(); n = 0; } };
  for (const g of gravar) { lote.set(col.doc(g.k), g.item); if (++n >= 400) await solta(); }
  for (const k of apagar) { lote.delete(col.doc(k)); if (++n >= 400) await solta(); }
  await solta();
  return { gravados: gravar.length, apagados: apagar.length, total: (depois || []).length };
}

exports.tournamentMirror = onDocumentWritten(
  { document: 'tournaments/{tournamentId}', region: 'us-central1', memory: '512MiB', timeoutSeconds: 300 },
  async (event) => {
    const id = event.params && event.params.tournamentId;
    try {
      const db = getFirestore();
      const depois = (event.data && event.data.after && event.data.after.exists) ? event.data.after.data() : null;

      // torneio apagado ⇒ o espelho some junto (senão sobra fantasma no banco novo)
      if (!depois) {
        // ⭐ `resultQueue` entra aqui e NÃO na lista do cliente: ele pode CRIAR intenção
        // (é o ponto da fila) mas a regra nega `delete` — o item é recibo do que a pessoa
        // mandou. Quem pode apagar é quem tem admin SDK. Quem limpa é decidido por quem
        // pode APAGAR, não por quem pode escrever.
        // ⚠️ pelo NOME DA COLEÇÃO, não da parte — senão a limpeza deixaria `inscritos`
        // órfão e apagaria `participants`, que é de outro dono.
        /* ⛔ A LISTA MANDA, E A LISTA NÃO É MINHA. Era escrita à mão aqui, e à mão ela
         * esqueceu QUATRO: `grupos`, `checkedIn`, `woLog` e `woClaims` nunca eram varridos —
         * apagar um torneio dividido deixava as quatro vivas e sem dono, que é o mesmo
         * estrago dos 151 `results` órfãos de 01/ago. Agora sai de `_tSplit` (PESADOS,
         * traduzidos por `colecaoDaParte` — senão limpa `participants` e deixa `inscritos`),
         * mais as que não são "parte": `matches`, `grupos`, a fila do placar e as duas do
         * avanço, que nasceram com `read, write: if false` e portanto SÓ o servidor apaga. */
        const _partes = (_tSplit && Array.isArray(_tSplit.PESADOS))
          ? _tSplit.PESADOS.map((n) => (typeof _tSplit.colecaoDaParte === 'function' ? _tSplit.colecaoDaParte(n) : n))
          : ['inscritos', 'history', 'opponentHistory', 'checkedIn', 'woClaims', 'woLog', 'categoryNotifications'];
        const _limpar = _partes.concat(['matches', 'grupos', 'resultQueue', 'advanceReceipts', 'outbox'])
          .filter((n, idx, a) => n && a.indexOf(n) === idx);
        for (const nome of _limpar) {
          const col = db.collection('tournaments').doc(id).collection(nome);
          const snap = await col.get();
          let lote = db.batch(), n = 0;
          for (const d of snap.docs) { lote.delete(d.ref); if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; } }
          if (n) await lote.commit();
        }
        return;
      }

      const antes = (event.data && event.data.before && event.data.before.exists) ? event.data.before.data() : null;
      /* ⛔⛔ TORNEIO JÁ DIVIDIDO: O ESPELHO NÃO ENCOSTA NOS JOGOS.
       * Este gatilho deriva do DOCUMENTO. Quando os jogos saem dele (`_semPesados`), o doc
       * passa a ter `rounds` com `matches` vazio — e `_espelhaColecao` veria "nenhum jogo
       * agora" e APAGARIA a subcoleção inteira. Que é justamente onde os jogos passaram a
       * viver: o espelho deixa de ser cópia e vira a fonte VIVA, escrita pelas CFs.
       * Seria o gatilho apagando o dado de verdade por achar que estava limpando cópia. */
      /* ⛔ E VALE PRA QUALQUER PARTE QUE TENHA SAÍDO, não só os jogos.
       * Eu tinha travado só `matches` — e o ENSAIO pegou o resto antes de produção: ao
       * dividir também os INSCRITOS, o gatilho viu o documento com `participants: []`,
       * concluiu "não há mais ninguém" e APAGOU a subcoleção inteira. O elenco sumia.
       * Mesmo estrago, campo diferente, e eu tinha acabado de escrever o aviso pro outro.
       * ⇒ A trava passa a ser derivada do MARCADOR, não de uma lista minha. */
      const _pulados = Array.isArray(depois._semPesados) ? depois._semPesados : [];
      /* ⛔ `_pula` NASCE COLADO NO MARCADOR — e não lá embaixo, junto do primeiro espelho.
       * Ele estava declarado DEPOIS do alerta de `playerUids` que o consulta. `const` tem
       * zona morta: no caso EXATO que o alerta existe pra denunciar (jogos jogáveis sem
       * uid), a condição lançava ReferenceError e o gatilho MORRIA ali — matches, inscritos
       * e history não eram espelhados, e o alerta nunca chegava ao log. O aviso derrubava
       * o espelho justamente quando tinha algo a avisar.
       * ⛔ E `_pulados` não tinha declaração NESTA função: a `let` estava perdida dentro de
       * `tournamentSummary`, onde ninguém a lê. Sem `use strict` isso virava uma GLOBAL
       * implícita, viva entre invocações no mesmo contêiner quente. Agora nasce aqui, junto
       * de quem a usa. ⭐ A regra: quem decide sobre `_pulados` nasce colado nele. */
      const _pula = (nome) => _pulados.indexOf(nome) !== -1;
      const pDepois = _tSplit.dividir(depois);
      if (!pDepois) return;
      // ⚠️ Sem `antes` (torneio novo, ou 1ª passada) o diff grava TUDO — que é o
      // certo: espelho vazio precisa nascer inteiro.
      const pAntes = antes ? _tSplit.dividir(antes) : { matches: [], participants: [], history: [] };

      /* ⛔ `playerUids` NÃO PODE FALTAR EM SILÊNCIO (Fase 2b).
       * É ele que sustenta a regra "só quem joga ESTE jogo escreve" — sem o campo, o
       * participante leva permission-denied e o jogo só anda pelo organizador. A derivação
       * vem de `window._matchPlayerUids` (vendor/bracket-logic, carregado pelo draw-core
       * no topo deste arquivo) — e esse require está num try/catch que SEGUE em frente se
       * falhar. Ou seja: dá pra espelhar 115 jogos sem o campo e não perceber.
       * Aqui a ausência vira LINHA DE LOG. Hoje (25/ago) três defeitos custaram caro
       * justamente por falharem sem deixar rastro. */
      const _comUid = pDepois.matches.filter((m) => Array.isArray(m.playerUids) && m.playerUids.length).length;
      const _jogaveis = pDepois.matches.filter((m) => {
        const j = m && m.jogo;
        return j && !j.isBye && !j.isSitOut && j.p1 && j.p2 && j.p1 !== 'BYE' && j.p2 !== 'BYE' && j.p1 !== 'TBD';
      }).length;
      if (_jogaveis && !_comUid && !_pula('matches')) {
        console.error('[tournamentMirror]', id, '⛔ NENHUM jogo com playerUids em', _jogaveis,
          'jogáveis — a derivação não carregou (vendor/bracket-logic). A escrita por jogador fica NEGADA.');
      }

      const r1 = _pula('matches')
        ? { gravados: 0, apagados: 0, total: 0 }
        : await _espelhaColecao(db, id, 'matches', pAntes.matches, pDepois.matches, (m) => m._chave);
  /* ⛔ INSCRITO CHAVEADO POR IDENTIDADE, NÃO POR POSIÇÃO (2.0.108).
   * Era `'p' + _idx`. Quando alguém sai do MEIO da lista, todos os índices depois dele
   * andam — e o diff via cada um deles como "mudou", reescrevendo o registro de A por
   * cima do de B. Mesma família do estrago que a poda do histórico ia causar.
   * ⭐ A chave segue o cânone do dono: uid → uids da dupla → nome (só pra quem NÃO tem
   * uid, que são as 75 de 240 entradas digitadas pelo organizador).
   * ⚠️ E aqui o espelho PODE apagar: inscrito que sai da lista saiu de verdade — ao
   * contrário do histórico, sumir daqui é informação, não poda. */
  const r2 = _pula('participants')
    ? { gravados: 0, apagados: 0, total: 0 }
    : await _espelhaColecao(db, id, _tSplit.colecaoDaParte('participants'), pAntes.participants, pDepois.participants,
        (p) => (p._k || ('p' + p._idx)));
      /* ⛔ O HISTÓRICO ERA ESPELHADO POR POSIÇÃO — e posição é o que a poda muda.
   * Medido antes de mexer: Confra com 218 eventos no doc e 218 no espelho. Podar o doc
   * pras últimas 30 faria este diff ver `h0..h29` com conteúdo NOVO e `h30..h217`
   * ausentes ⇒ reescrevia 30 linhas erradas e APAGAVA 188. O log inteiro, destruído pela
   * economia de 37 KB. Agora a chave sai do CONTEÚDO (`_k`, ver chaveDoEvento no
   * split-core) e o espelho SÓ CRESCE. `_idx` segue no registro: chave é QUEM, índice é
   * ONDE — o bug nasceu de usar um como o outro. */
  /* ⛔ E O `_idx` NÃO VAI PRO ESPELHO DO HISTÓRICO — ele também anda com a poda.
   * Medido contra o documento real do Confra: com `_idx` no registro, podar 218→30 dava
   * 30 GRAVAÇÕES de linhas que não mudaram (só o índice tinha mudado) — e, pior, deixava
   * a ORDEM ambígua: as 30 repodadas viravam _idx 0..29, colidindo com as 188 antigas que
   * guardam 0..187. Sem o índice, a poda fica INERTE (0 gravações, 0 apagados), que é o
   * comportamento certo pra um log que só cresce.
   * A ordem sai de `item.date`, que toda linha carrega e que não muda de lugar nunca.
   * ⚠️ Por isso `history` NÃO pode entrar em `_semPesados` enquanto o leitor
   * (`_montaDeSubcolecoes` → `remontar`) ainda ordenar por `_idx`. É o próximo passo. */
  const _hist = (pDepois.history || []).map((h) => ({ _k: h._k, item: h.item }));
  const _histAntes = (pAntes.history || []).map((h) => ({ _k: h._k, item: h.item }));
  /* ⛔ E o histórico também PULA quando sai do documento. Hoje ele não sai (não está em
   * `_semPesados`) — mas o dia em que sair, o doc vem com `history: []`, o espelho é a
   * única cópia e este diff passaria por cima dele. `soDeixaCrescer` impede o APAGAR, não
   * o gravar por cima. Deixar isto pra "quando for a hora" é como o `participants` ficou
   * de fora e o ensaio pegou o elenco sumindo. */
  const r3 = _pula('history')
    ? { gravados: 0, apagados: 0, total: 0 }
    : await _espelhaColecao(db, id, 'history', _histAntes, _hist, (h) => h._k, true);

      /* ── A PODA: a cauda do log sai do DOCUMENTO, depois de estar no espelho ──────
       * O doc do torneio tem teto de 1 MB e `history` é o único campo que cresce PRA
       * SEMPRE (medido 26/ago: 37 KB dos 245 KB do Confra; `rounds` para quando o torneio
       * acaba, o log não).
       *
       * ⭐ POR QUE A PODA MORA AQUI, e não no `saveTournament` do cliente:
       * ① só aqui dá pra saber que o espelho JÁ TEM o que vai ser jogado fora — é a linha
       *    de cima, no mesmo disparo. No cliente eu estaria podando na esperança;
       * ② o cliente tem uma proteção que RECONSTRÓI histórico encolhido (um save atrasado
       *    apagando o rastro custou uma tarde). Podar de lá seria brigar com ela;
       * ③ é a ordem do dono: _"tudo na cf"_.
       *
       * ⛔ EM TRANSAÇÃO, relendo o documento: entre este gatilho e a escrita, alguém pode
       * ter lançado um placar e acrescentado linha. Um `update` cego com a lista que eu li
       * lá em cima engoliria essa linha — e seria eu recriando exatamente o bug de save
       * atrasado que o item ② descreve.
       * ⭐ E só a PONTA MAIS VELHA sai: as últimas ALVO ficam. O que sai foi espelhado há
       * muito tempo; o que acabou de chegar está na cauda que fica.
       *
       * `historyPodados` é CUMULATIVO em vez de "total": total ficaria velho a cada linha
       * nova e a tela deixaria de ir buscar o resto. Com o contador, total = podados +
       * o que está no doc, e isso continua certo sozinho.
       */
      /* ── APONTAMENTOS DE CATEGORIA: espelho completo + cauda no documento ─────────
       * Mesmo desenho do histórico, e pelo mesmo motivo: é um LOG que só cresce, e o
       * CLIENTE escreve nele (`_addCategoryNotification` faz push). Tirar do documento
       * faria o apontamento novo se perder na próxima gravação — foi por isso que o
       * histórico também ficou com cauda em vez de sair inteiro.
       * ⚠️ A tela que lia isto está DESLIGADA desde 31/jul (ordem do dono: _"por ora isso
       * não funciona e não ajuda"_), mas ele mandou GUARDAR o registro. Guardar é o que
       * este espelho faz; o documento fica só com a cauda.
       * ⭐ Chave por CONTEÚDO (pra quem, quando, qual categoria) — e marcar como LIDO não
       * muda a chave, então é o MESMO documento que se atualiza, não um novo. */
      const _apts = Array.isArray(depois.categoryNotifications) ? depois.categoryNotifications : [];
      const _aptsAntes = (antes && Array.isArray(antes.categoryNotifications)) ? antes.categoryNotifications : [];
      const _regApt = (a) => ({ _k: _tSplit.chaveDoApontamento(a), item: a });
      const r4 = (!_apts.length && !_aptsAntes.length)
        ? { gravados: 0, apagados: 0, total: 0 }
        : await _espelhaColecao(db, id, 'categoryNotifications',
            _aptsAntes.map(_regApt), _apts.map(_regApt), (x) => x._k, true);

      const TETO_APT = 40, ALVO_APT = 20;
      if (_apts.length > TETO_APT) {
        try {
          const cortados = await db.runTransaction(async (tx) => {
            const fresco = await tx.get(db.collection('tournaments').doc(id));
            if (!fresco.exists) return 0;
            const d2 = fresco.data() || {};
            const arr = Array.isArray(d2.categoryNotifications) ? d2.categoryNotifications : [];
            if (arr.length <= TETO_APT) return 0;
            const cauda = arr.slice(-ALVO_APT);
            tx.update(fresco.ref, {
              categoryNotifications: cauda,
              categoryNotificationsPodados: (Number(d2.categoryNotificationsPodados) || 0) + (arr.length - cauda.length)
            });
            return arr.length - cauda.length;
          });
          if (cortados) {
            console.log('[tournamentMirror]', id, 'apontamentos de categoria PODADOS:', cortados,
              '(ficaram', ALVO_APT + '); o log inteiro segue no espelho');
          }
        } catch (eA) { console.error('[tournamentMirror] poda dos apontamentos falhou', id, eA); }
      }

      const TETO_HIST = 120, ALVO_HIST = 80;
      if ((pDepois.history || []).length > TETO_HIST) {
        try {
          const podados = await db.runTransaction(async (tx) => {
            const fresco = await tx.get(db.collection('tournaments').doc(id));
            if (!fresco.exists) return 0;
            const d = fresco.data() || {};
            const h = Array.isArray(d.history) ? d.history : [];
            if (h.length <= TETO_HIST) return 0;        // outro disparo já podou
            const cauda = h.slice(-ALVO_HIST);
            const fora = h.length - cauda.length;
            tx.update(fresco.ref, {
              history: cauda,
              historyPodados: (Number(d.historyPodados) || 0) + fora
            });
            return fora;
          });
          if (podados) {
            console.log('[tournamentMirror]', id, 'histórico PODADO:', podados,
              'evento(s) saíram do documento (ficaram', ALVO_HIST + '); o log inteiro segue no espelho');
          }
        } catch (ePoda) {
          // ⛔ Nunca derruba o espelho: sem poda o doc só fica gordo; com espelho quebrado
          // o log some. A ordem de gravidade é essa.
          console.error('[tournamentMirror] poda do histórico falhou', id, ePoda);
        }
      }

      if (r1.gravados || r1.apagados || r2.gravados || r2.apagados || r3.gravados || r3.apagados) {
        console.log('[tournamentMirror]', id,
          'jogos', r1.gravados + '/' + r1.total, '(-' + r1.apagados + ')',
          'comUid', _comUid + '/' + _jogaveis,
          'inscritos', r2.gravados + '/' + r2.total, '(-' + r2.apagados + ')',
          'histórico', r3.gravados + '/' + r3.total, '(-' + r3.apagados + ')');
      }
    } catch (e) {
      // ⛔ NUNCA derruba a escrita original: o espelho é secundário até a troca de
      // leitura. Falha aqui vira alarme no log, não erro pro usuário.
      console.error('[tournamentMirror] falhou', id, e);
    }
  }
);
