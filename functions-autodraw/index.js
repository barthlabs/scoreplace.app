const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
// v1.7.35: rebase do sorteio (o servidor não sobrescreve o que aconteceu na quadra
// enquanto pensava). Módulo PURO e testável — o index não é require-ável em teste.
const { rebaseRounds } = require('./rebase-core.js');

// v2.3.91: lógica de sorteio REAL do cliente (Rei/Rainha, duplas, equilíbrio,
// categorias, folgas, desempate) carregada via shim Node. Substitui o stub 1×1
// antigo. vendor/ é sincronizado de js/views/* no predeploy (copy-vendor.js).
// Require defensivo: se draw-core falhar ao carregar, NÃO derruba o módulo
// (sendPushNotification continua funcionando); autoDraw apenas pula.
let generateLigaRound = null;
let drawInitial = null;   // v1.2.25: motor do SORTEIO INICIAL (Etapa 3 · fase A) — usado pela drawRound
let integrateLateFn = null; // v1.2.57: integração de tardios no servidor — usado pela integrateLateEntries
let formLatePairFn = null;  // formar dupla na espera + integrar, atômico — usado pela formLatePair
let splitLatePairFn = null; // desfazer dupla da espera, atômico — usado pela splitLatePair
let closeRoundFn = null;    // fecho de rodada no servidor (Suíço-pow2 Opção B) — usado pela closeRound
let canRecompile = null;
let hasDrawnBracket = null;  // régua de 'já tem chave' — a MESMA do cliente (matches/rounds/groups)
let drawWindow = null; // window do shim Node — expõe _calcNextDrawDate (prazo p/ lançar resultado)
try {
  const _dc = require('./draw-core.js');
  generateLigaRound = _dc.generateLigaRound;
  drawInitial = _dc.drawInitial;
  integrateLateFn = _dc.integrateLateEntries;
  formLatePairFn = _dc.formLatePairCore;
  splitLatePairFn = _dc.splitLatePairCore;
  closeRoundFn = _dc.closeRoundCore;
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
const CF_VERSION = '1.5';

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
    const prof = (drawWindow && drawWindow._profByUid) || {};
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

// Espelha isTournamentParticipant das firestore.rules: memberUids primeiro (uid é a identidade
// primária), memberEmails só como FALLBACK quando memberUids está vazio (docs legados). Usado
// só pela closeRound — o fecho de rodada é disparado por quem salva o ÚLTIMO placar, que num
// resultEntry='players' é um PARTICIPANTE, não só admin. Seguro pq a CF computa o passo
// DETERMINÍSTICO do doc fresco (o caller só dispara o passo canônico). Ver project_uid_primary_identity.
function _isTournamentParticipant(t, uid, email) {
  if (!t || !uid) return false;
  if (Array.isArray(t.memberUids) && t.memberUids.length > 0) {
    return t.memberUids.indexOf(uid) !== -1;
  }
  const mail = String(email || '').toLowerCase();
  if (mail && Array.isArray(t.memberEmails)) {
    return t.memberEmails.some(function (e) { return String(e || '').toLowerCase() === mail; });
  }
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
  // EXCEÇÃO: SANDBOX substitui (não une) — o memberUids do SB é só o dev, senão os uids
  // reais clonados voltam a cada gravação e o Firestore entrega o SB pra todo mundo.
  // _mergeMemberUids é o MESMO helper do cliente (vendorado de persist-core.js).
  data.adminEmails = w._computeAdminEmails(data);
  data.adminUids = w._computeAdminUids(data);
  data.memberUids = w._mergeMemberUids(data, data.memberUids, w._computeMemberUids(data));
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
  if (!_isTournamentAdmin(pre.data(), uid, email)) {
    const _p = pre.data();
    throw _drawFail('permission-denied', 'Só o organizador ou um co-organizador pode sortear.',
      { tId, uid, email: email || '(sem email)', creatorUid: _p.creatorUid,
        adminUids: _p.adminUids, adminEmails: _p.adminEmails, organizerEmail: _p.organizerEmail });
  }
  await _preloadDrawNames(pre.data()); // popula drawWindow._profileNameByUid

  // A VERSÃO no log é o contrato: se a linha não disser CF_VERSION, é build velha atendendo
  // (deploy não pegou / instância antiga). Sem isto não dá pra saber que código respondeu.
  console.log(`drawRound v${CF_VERSION}: pedido de ${uid} pro torneio ${tId}` + (allowRedraw ? ' [re-sorteio]' : '') +
    (decisions ? ' decisoes=' + JSON.stringify(decisions) : ' (sem decisoes)'));

  let out;
  try {
    out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
    const t = snap.data();
    t.id = tId;
    _enrichParticipantsFromProfiles(t); // v1.3.52: gênero/skill/etc. por uid (inscrito grava só uid)

    // Re-checa authz sobre o doc FRESCO: entre o read de fora e a transação o organizador
    // pode ter perdido o acesso (transferência de organização / co-host removido).
    if (!_isTournamentAdmin(t, uid, email)) {
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
  if (!_isTournamentAdmin(pre.data(), uid, email)) {
    throw _drawFail('permission-denied', 'Só o organizador ou um co-organizador integra tardios.', { tId, uid });
  }
  await _preloadDrawNames(pre.data()); // nome vivo por uid antes de formar duplas/rótulos

  let out;
  try {
    out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const t = snap.data(); t.id = tId;
      if (!_isTournamentAdmin(t, uid, email)) {
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
      const b = _applyWriteBoundary(t);
      tx.set(ref, b.persist); // set (sem merge) DENTRO da txn = clobber-free
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
  if (!_isTournamentAdmin(pre.data(), uid, email)) throw _drawFail('permission-denied', 'Só o organizador ou co-organizador forma duplas.', { tId, uid });
  await _preloadDrawNames(pre.data());

  let out;
  try {
    out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const t = snap.data(); t.id = tId;
      if (!_isTournamentAdmin(t, uid, email)) throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) {}
      const res = formLatePairFn(t, { key1: key1, key2: key2, nowTs: Date.now() });
      if (!res || !res.ok) throw _drawFail('failed-precondition', (res && res.reason) || 'form-failed', { tId });
      const b = _applyWriteBoundary(t);
      tx.set(ref, b.persist);
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
  if (!_isTournamentAdmin(pre.data(), uid, email)) throw _drawFail('permission-denied', 'Só o organizador ou co-organizador desfaz duplas.', { tId, uid });
  await _preloadDrawNames(pre.data());

  let out;
  try {
    out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const t = snap.data(); t.id = tId;
      if (!_isTournamentAdmin(t, uid, email)) throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) {}
      const res = splitLatePairFn(t, { id1: id1, id2: id2 });
      if (!res || !res.ok) throw _drawFail('failed-precondition', (res && res.reason) || 'split-failed', { tId });
      const b = _applyWriteBoundary(t);
      tx.set(ref, b.persist);
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
  if (!_isTournamentParticipant(pre.data(), uid, email) && !_isTournamentAdmin(pre.data(), uid, email)) {
    throw _drawFail('permission-denied', 'Só quem está no torneio pode lançar placar.',
      { tId, matchId, uid, email: email || '(sem email)' });
  }
  await _preloadDrawNames(pre.data()); // nome vivo por uid (o motor pode gerar/avançar)

  let out;
  try {
    out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const t = snap.data(); t.id = tId;
      _enrichParticipantsFromProfiles(t);
      // Re-checa sobre o doc FRESCO (acesso pode ter mudado entre o read e a txn).
      if (!_isTournamentParticipant(t, uid, email) && !_isTournamentAdmin(t, uid, email)) {
        throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, matchId, uid });
      }
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) { /* best-effort */ }

      const res = applyResultFn(t, {
        matchId: matchId, payload: payload, actor: { uid: uid, email: email || '' },
        logMessage: logMessage
      });
      // RECUSA é resposta legítima (não é falha de infra): devolve o motivo pro cliente
      // mostrar o diálogo certo ("o outro time já lançou", "só o organizador nesta fase").
      if (!res || !res.ok) {
        return { ok: false, reason: (res && res.reason) || 'apply-failed' };
      }
      const b = _applyWriteBoundary(t);
      tx.set(ref, b.persist); // set (sem merge) DENTRO da txn = clobber-free
      return { ok: true, outcome: res.outcome, tournament: b.clean };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(`applyMatchResult EXPLODIU em ${tId}/${matchId} (uid ${uid}):`, e && e.stack || e);
    throw new HttpsError('internal', 'Falha ao lançar placar: ' + String((e && e.message) || e).slice(0, 300));
  }

  console.log(`applyMatchResult v${CF_VERSION}: ${tId}/${matchId} por ${uid} — ` +
    (out.ok ? out.outcome : 'recusado(' + out.reason + ')'));
  return out;
});

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
  if (!_isTournamentParticipant(pre.data(), uid, email) && !_isTournamentAdmin(pre.data(), uid, email)) {
    throw _drawFail('permission-denied', 'Só um participante ou o organizador fecha a rodada.', { tId, uid, email: email || '(sem email)' });
  }
  await _preloadDrawNames(pre.data()); // nome vivo por uid (o motor gera a próxima rodada e lê nomes)

  let out;
  try {
    out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Torneio não encontrado.');
      const t = snap.data(); t.id = tId;
      // Re-checa authz sobre o doc FRESCO (acesso pode ter mudado entre o read de fora e a txn).
      if (!_isTournamentParticipant(t, uid, email) && !_isTournamentAdmin(t, uid, email)) {
        throw _drawFail('permission-denied', 'Sem permissão (doc fresco).', { tId, uid });
      }
      try { drawWindow._hydrateMonarchGroups(t); } catch (e) { /* best-effort */ }

      const res = closeRoundFn(t, roundIdx, resultCtx);
      if (!res || !res.ok) {
        // stale-round/already-closed/round-incomplete = idempotência/concorrência: NÃO grava
        // (outro fechou primeiro, ou a rodada não fechou de fato). O cliente reconcilia pelo listener.
        return { ok: false, reason: (res && res.reason) || 'close-failed' };
      }
      const b = _applyWriteBoundary(t);
      tx.set(ref, b.persist); // set (sem merge) DENTRO da txn = clobber-free
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
        _enrichParticipantsFromProfiles(t); // v1.3.52: gênero/skill/email por uid
        // v1.7.35: quantas rodadas existiam ANTES do motor rodar. É o que permite
        // saber, depois, quais rodadas são CONTRIBUIÇÃO deste sorteio — e só elas
        // viajam pro banco (ver o rebase transacional na gravação, abaixo).
        const _roundsAntes = Array.isArray(t.rounds) ? t.rounds.length : 0;
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
        // ── v1.7.35 · REBASE TRANSACIONAL — o servidor não sobrescreve o que
        // aconteceu na quadra enquanto ele pensava ────────────────────────────────
        // O `t` vem da QUERY lá em cima (uma leitura só, para todos os torneios) e
        // entre ela e este ponto há `_preloadDrawNames` (perfis pela rede) mais os
        // torneios processados em SEQUÊNCIA — a janela é de segundos, não de
        // milissegundos. Gravar `rounds: t.rounds` cru significa devolver ao banco a
        // chave como ela estava na leitura: um placar lançado no meio tempo seria
        // apagado PELO SERVIDOR. É a mesma classe que fechei no cliente (1.7.26–34),
        // e aqui não adianta o guard do `saveTournament` — este caminho não passa por
        // ele (Admin SDK, e o cliente nem está envolvido).
        //
        // Conserto: dentro de UMA transação, releio o doc e REBASEIO — a contribuição
        // deste sorteio são as rodadas que o motor ACRESCENTOU (as de índice >=
        // `_roundsAntes`); todo o resto vem da leitura FRESCA, com os placares que
        // chegaram. Dedup por número de rodada torna o retry idempotente (a transação
        // pode re-executar; sem isso, uma re-execução duplicaria a rodada).
        await db.runTransaction(async (tx) => {
          const _ref = db.collection('tournaments').doc(tId);
          const _snap = await tx.get(_ref);
          const _fresh = _snap.exists ? (_snap.data() || {}) : {};
          const _rb = rebaseRounds(_fresh.rounds, t.rounds, _roundsAntes);
          if (_rb.descartadas) {
            console.log(`Auto-draw: rebase descartou ${_rb.descartadas} rodada(s) que já estavam no doc (retry idempotente) — ${tId}`);
          }
          tx.update(_ref, Object.assign({}, payload, { rounds: _rb.rounds }));
        });

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
  const owed = drawWindow._nextOwedDrawMs(t, nowMs);
  if (typeof owed !== 'number' || owed > nowMs) return; // sem slot devido agora
  const cur = t.currentPhaseIndex || 0;
  await _preloadDrawNames(t); // v4.5.85: nomes vivos por uid antes do motor de fase
  _enrichParticipantsFromProfiles(t); // v1.3.52: gênero/skill/email por uid
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
  const prof = (drawWindow && drawWindow._profByUid) || {};
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
    const res = await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return { changed: false };
      const t = snap.data(); t.id = doc.id;
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
      const b = _applyWriteBoundary(t);
      tx.set(doc.ref, b.persist);
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
    // …e, no mesmo doc já carregado, fecha os grupos que a lista de espera permitir.
    gruposDaEspera += await _formarGruposDaEspera(doc);
  }
  console.log(`[autoDrawReconcile] ${scanned} torneios varridos, ${fixed} nextDrawAt atualizados, ` +
    `${gruposDaEspera} grupo(s) formado(s) da lista de espera`);
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
