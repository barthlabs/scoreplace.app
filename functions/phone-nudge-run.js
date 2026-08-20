'use strict';
/*
 * phone-nudge-run.js — A RODADA DIÁRIA da cobrança de celular no perfil.
 *
 * O que roda em produção é ESTE arquivo (a CF nudgeMissingPhones é só o gatilho
 * agendado). A REGRA mora em phone-nudge-core.js, puro e testado; aqui fica o
 * I/O: ler o elenco, ler os perfis, gravar a LEVA e enfileirar os e-mails.
 *
 * ⚠️ COMEÇA EM ENSAIO, e isso é proposital. `appConfig/phoneNudge.enabled` nasce
 * ausente → dryRun: a rotina mede, grava a leva e manda SÓ o consolidado pro dono,
 * sem tocar em ninguém. É e-mail pra gente real e reenvio diário mal calibrado
 * vira spam — o dono liga quando aprovar o texto:
 *   appConfig/phoneNudge = { enabled: true }
 *
 * IDEMPOTÊNCIA em dois níveis, porque agendador reentrega:
 *   • a LEVA é um doc por dia/torneio (id determinístico) — existe? não roda de novo;
 *   • cada e-mail é um doc `mail/phone-nudge__<dia>__<uid>` criado com create() —
 *     ALREADY_EXISTS é ignorado, não vira segundo envio.
 *
 * Ver [[project_cobranca_de_celular_no_perfil]].
 */
const core = require('./phone-nudge-core');

// Confra BT Alta da Clínica 2026 — o torneio da campanha. Fica como DEFAULT e não
// como constante escondida: `appConfig/phoneNudge.tournamentIds` troca sem deploy.
const DEFAULT_TOURNAMENTS = ['tour_1780009816637'];
const DEFAULTS = {
  enabled: false,
  tournamentIds: DEFAULT_TOURNAMENTS,
  reportTo: core.REPORT_TO,
};
const WAVES = 'phoneNudgeWaves';

/* ── LEVA 1 (backfill) ───────────────────────────────────────────────────────
 * O envio manual de 18/ago/2026 NÃO gravou leva nenhuma — e foi exatamente essa
 * ausência que tornou "quantos atenderam?" incalculável quando o dono perguntou.
 * A lista REAL dos 49 que receberam sobreviveu (sem-celular.json da sessão do
 * envio); os uids ficam AQUI (uid é opaco — nome/e-mail não entram no repo) e a
 * primeira execução grava a leva se ela não existir. create(): idempotente. */
const LEVA1 = {
  waveId: '2026-08-18',
  tournamentId: 'tour_1780009816637',
  // foto do elenco no momento do envio, do consolidado da própria campanha
  roster: 143, withPhone: 94, withoutPhone: 49,
  // 18/ago 11:42 BRT (hora do envio) = 14:42 UTC
  createdAtMs: Date.UTC(2026, 7, 18, 14, 42),
  recipientUids: [
    'fTNUSjQ5jQhKQmMb0iwbJXY3H9r1', 'lvTw5AiGnTYSOnljux78XlJ7f1v2',
    'w0cVmVYmQUQZOZZhZwszMjguHbD3', 'Ol1GJbdVnmRQIjeV405ZKhn1Xoa2',
    'lqHRqvHJrYbc77vh9OILf25LR722', 'lwACVPtDGJQtM4cpdeBnk0XsMl92',
    'Nw1LEg8W8bP3jrApPOxAEGnSLNv2', 'H8FNKbv3XbO3fafhGLtYfncxg0y1',
    'JIhd18APdgUsHPKIHszwV22dWbh2', 'IBtg5IfI4SgScA9W9F1iBkih8IA3',
    'mt1m5GftI4OEFnOyA9ZU3C1gpUn1', 'NvsXrlXdyQMz1SPjIxaQNId3y6Y2',
    'ALTkIddamHMtxZl0ZDBzB2iJYJa2', 'g6jTeQ2buqe4ea0tBvj8p3FY7tz2',
    'XgC04OBlI4U9QDFNTWUzOZL99dz2', '6wg8V1INV5dqzqrEqg0fIAlUpeB2',
    'tXnXDUn0sWZxTWzgDZSp3lLtZSS2', 'pb4pEbdTqzOL8c285QJEAyMqG8t1',
    'ZFKs7TCWUHabKiU60aDIjd6WQgC3', 'USQYt2XJFYTSM2a1d0b0CPuLpiM2',
    'NJtWTuysELd7fm0oy3REo3yna2i2', 'YVLzVcrf2kXlq6oUiS3P9sJOc1A2',
    'ETxGXaNbYwSP9dgAJTewdNW0EC32', '7sSjsHGnQebR4Kb2JGUXAEAljDL2',
    'inKQvoP7ASXaRpCdfpagKpqF8iS2', 'wihsAMFnxTSf915MD7tDL7EQw6t2',
    'zqd1iQ3qK3ZlRuArh5upiy1Q8tq1', 'aune9TtJkGcVUydoAAaZbTvXNVS2',
    'ZXi9FrfQHhWfFXsJHIVzqVuW7VP2', 'BCjYSe1jRBelWFfHUr0OarO6ICj1',
    'XqOVCgyAWOatjMmIXggibbP0x022', 'FzTG3neidgW46s6aVmMhBSECkpV2',
    'LeeS4rKmEZh1yoB9Xjkp2vQ5IwB2', 'cDmBPlLLpaM94OKWgzxbI8sdCXn2',
    'O5NYjV0HfLaVxKwCW2IZhhI1S6D3', 'NUhmEsQAHyQXdz7gcpQv67jvCjp2',
    'YijDdvhFwBYRPPJw1VjRZugky1R2', '5TxVeRIiT1crULiD2PETGBCr6Ek2',
    'ipjqmn6kLTOLBcZNksgQJx7nBng2', 'SmMl6pTmhkT0IBJ5B8AZSl1e0w33',
    'qiZBRNedGufQJr2EvoPgcm9o0Qj1', 'IDQi17zdz5MNTxW8zTkYdgyQUTX2',
    '9QzEpttad0YZnzvPWtVLZupPprn2', 'EckslapewEQ84ErQglSZchGvWOu2',
    'Go7PW03xZiSfFCvf11MuBRtqRKr1', 'eze9OrzndRRRZGYfjZmVu3dZzJu2',
    'zoSoQsXOIzZKd9VB5lV6ByjEnJw2', 'y1dlBl8r0OXQLESmqlHwIUVDh8H2',
    'Mfbc8CHIdXUNKYSjs491nZRVtvV2',
  ],
};

async function ensureLeva1(db) {
  const id = core.waveDocId(LEVA1.waveId, LEVA1.tournamentId);
  try {
    await db.collection(WAVES).doc(id).create({
      waveId: LEVA1.waveId, tournamentId: LEVA1.tournamentId,
      tournamentName: 'Confra BT Alta da Clínica 2026',
      createdAt: new Date(LEVA1.createdAtMs), createdAtMs: LEVA1.createdAtMs,
      dryRun: false, source: 'manual-backfill',
      roster: LEVA1.roster, withPhone: LEVA1.withPhone, withoutPhone: LEVA1.withoutPhone,
      recipientUids: LEVA1.recipientUids, sent: LEVA1.recipientUids.length,
    });
    console.log('[phoneNudge] leva 1 (18/ago, manual) retro-alimentada em ' + WAVES + '/' + id);
  } catch (e) {
    if (!(e && (e.code === 6 || String(e.message || '').indexOf('ALREADY_EXISTS') !== -1))) {
      console.warn('[phoneNudge] backfill leva 1 falhou:', e && e.message);
    }
  }
}

async function readConfig(db) {
  try {
    const s = await db.collection('appConfig').doc('phoneNudge').get();
    return s.exists ? (s.data() || {}) : {};
  } catch (e) {
    console.warn('[phoneNudge] config ilegível:', e && e.message);
    return {};
  }
}

// Carrega perfis em lote e SEGUE a corrente de fusão: uid de lápide precisa do doc
// da conta viva pra decidir pelo celular DELA ([[divida-de-uid-morto-no-dado]]).
async function loadProfiles(db, uids) {
  const map = {};
  const pend = Array.from(new Set(uids.filter(Boolean)));
  for (let hop = 0; hop < 6 && pend.length; hop++) {
    const faltam = pend.splice(0, pend.length).filter((u) => !(u in map));
    for (let i = 0; i < faltam.length; i += 200) {
      const refs = faltam.slice(i, i + 200).map((u) => db.collection('users').doc(u));
      const snaps = await db.getAll.apply(db, refs);
      snaps.forEach((s, k) => {
        const uid = refs[k].id;
        map[uid] = s.exists ? (s.data() || {}) : null;
        const into = map[uid] && map[uid].mergedInto;
        if (into && !(into in map)) pend.push(String(into));
      });
    }
  }
  return map;
}

/* ── CAMADA 2 · o rastro das tentativas (v1.9.97) ───────────────────────────
 * Lido SÓ pros ALVOS, depois da classificação: quem já tem celular não interessa
 * aqui, e varrer o elenco inteiro seria pagar 146 leituras pra usar 45.
 * Fail-open por leitura: subcoleção ausente (a esmagadora maioria, que nunca
 * tentou) é lista vazia, não erro. */
async function loadAttempts(db, uids) {
  const map = {};
  for (const uid of uids) {
    try {
      const snap = await db.collection('users').doc(uid)
        .collection('phoneVerifyAttempts').orderBy('at', 'desc').limit(20).get();
      map[uid] = snap.docs.map((d) => d.data() || {});
    } catch (e) {
      console.warn('[phoneNudge] rastro ilegível de', uid, e && e.message);
      map[uid] = [];
    }
  }
  return map;
}

async function loadWaves(db, tournamentId) {
  const snap = await db.collection(WAVES).limit(500).get();
  return snap.docs
    .map((d) => d.data() || {})
    .filter((w) => w.tournamentId === tournamentId);
}

// create() + ALREADY_EXISTS tolerado: o e-mail do dia sai UMA vez por pessoa,
// mesmo se o agendador reentregar ou alguém rodar a rotina na mão.
async function putMail(db, docId, doc) {
  try { await db.collection('mail').doc(docId).create(doc); return true; }
  catch (e) {
    if (e && (e.code === 6 || String(e.message || '').indexOf('ALREADY_EXISTS') !== -1)) {
      console.log('[phoneNudge] ' + docId + ' já enfileirado — ignorado');
      return false;
    }
    throw e;
  }
}

async function runOne(db, tournamentId, nowMs, cfg) {
  const waveId = core.brtDateStr(nowMs);
  const docId = core.waveDocId(waveId, tournamentId);
  const dryRun = cfg.enabled !== true;

  const tSnap = await db.collection('tournaments').doc(tournamentId).get();
  if (!tSnap.exists) {
    console.error('[phoneNudge] torneio inexistente:', tournamentId);
    return { tournamentId, waveId, skipped: 'torneio inexistente' };
  }
  const t = tSnap.data() || {};

  const waveRef = db.collection(WAVES).doc(docId);
  if (!cfg.force) {
    const já = await waveRef.get();
    if (já.exists) {
      console.log('[phoneNudge] leva', docId, 'já existe — nada a fazer hoje');
      return { tournamentId, waveId, skipped: 'leva do dia já existe' };
    }
  }

  const uids = core.rosterUids(t);
  const anteriores = await loadWaves(db, tournamentId);
  const doPassado = anteriores.reduce((acc, w) => acc.concat(w.recipientUids || []), []);
  const profiles = await loadProfiles(db, uids.concat(doPassado));
  const cls = core.classifyRoster(uids, profiles);

  // v1.9.97 — quem TENTOU e não conseguiu recebe outro texto e aparece destacado
  // no consolidado. Ver [[project_cobranca_de_celular_no_perfil]].
  const attempts = await loadAttempts(db, cls.targets.map((p) => p.uid));
  const tried = core.attachAttempts(cls.targets, attempts);

  // Quem TEM celular hoje — é isso que transforma "recebeu" em "atendeu".
  const hasPhoneNow = {};
  Object.keys(profiles).forEach((u) => { hasPhoneNow[u] = core.hasPhone(profiles[u]); });
  doPassado.forEach((u) => {
    const r = core.resolveLive(u, profiles);
    if (r.uid !== u && hasPhoneNow[r.uid]) hasPhoneNow[u] = true; // fundiu depois de receber
  });

  const wave = {
    waveId, tournamentId, tournamentName: t.name || '',
    createdAt: new Date(), createdAtMs: nowMs, dryRun, source: 'cf',
    roster: cls.roster, withPhone: cls.withPhone, withoutPhone: cls.withoutPhone,
    recipientUids: cls.targets.map((p) => p.uid),
    recipients: cls.targets.map((p) => ({
      uid: p.uid, name: p.name, email: p.email,
      variante: p.tentou ? 'tentou' : 'primeiro',
    })),
    // O número TENTADO entra MASCARADO: a leva é dado de campanha, e número não
    // verificado não pode virar lista de contatos por tabela lateral.
    tried: tried.map((p) => ({
      uid: p.uid, name: p.name, tentativas: p.tentou.tentativas,
      ultimoStatus: p.tentou.ultimoStatus, ultimaAt: p.tentou.ultimaAt,
      ultimoPhoneMascarado: core.maskPhone(p.tentou.ultimoPhone),
      confirmouSemGravar: p.tentou.confirmou === true,
    })),
    skipped: {
      noEmail: cls.skipped.noEmail, optOut: cls.skipped.optOut,
      merged: cls.skipped.merged, missing: cls.skipped.missing,
    },
    sent: 0,
  };

  let sent = 0;
  if (!dryRun) {
    for (const p of cls.targets) {
      const mail = core.buildNudgeEmail(p.name, p.tentou);
      const id = 'phone-nudge__' + waveId + '__' + p.uid;
      try {
        const novo = await putMail(db, id, {
          to: [p.email], replyTo: core.REPLY_TO,
          message: { subject: mail.subject, html: mail.html, text: mail.text },
          createdAt: new Date(),
        });
        if (novo) sent++;
      } catch (e) { console.error('[phoneNudge] falha em', p.uid, e && e.message); }
    }
  }
  wave.sent = sent;

  await waveRef.set(wave);

  // O consolidado do dono JÁ INCLUI a leva de hoje — a tabela é "cada leva e quem
  // atendeu depois dela", e a de hoje é a linha que ainda vai converter.
  const stats = core.waveStats(anteriores.concat([wave]), hasPhoneNow);
  const rep = core.buildReportEmail({
    tournamentId, tournamentName: t.name || '', waveId, nowMs, dryRun,
    stats, today: { roster: cls.roster, withPhone: cls.withPhone, withoutPhone: cls.withoutPhone,
      targets: cls.targets, skipped: cls.skipped },
  });
  try {
    await putMail(db, 'phone-nudge-report__' + docId, {
      to: [cfg.reportTo || core.REPORT_TO], replyTo: core.REPLY_TO,
      message: { subject: rep.subject, html: rep.html },
      createdAt: new Date(),
    });
  } catch (e) { console.error('[phoneNudge] consolidado falhou:', e && e.message); }

  console.log('[phoneNudge] ' + docId + (dryRun ? ' [ENSAIO]' : '') + ': elenco=' + cls.roster
    + ' com=' + cls.withPhone + ' sem=' + cls.withoutPhone + ' cobrados=' + cls.targets.length
    + ' enviados=' + sent + ' semEmail=' + cls.skipped.noEmail.length
    + ' optOut=' + cls.skipped.optOut.length + ' lapides=' + cls.skipped.merged.length
    + ' tentaramSemConseguir=' + tried.length);

  return { tournamentId, waveId, dryRun, roster: cls.roster, withPhone: cls.withPhone,
    withoutPhone: cls.withoutPhone, targets: cls.targets.length, sent, tried: tried.length, stats };
}

async function runPhoneNudge(db, nowMs, overrides) {
  await ensureLeva1(db);
  const cfg = Object.assign({}, DEFAULTS, await readConfig(db), overrides || {});
  const ids = Array.isArray(cfg.tournamentIds) && cfg.tournamentIds.length
    ? cfg.tournamentIds : DEFAULT_TOURNAMENTS;
  const out = [];
  for (const tid of ids) {
    try { out.push(await runOne(db, tid, nowMs, cfg)); }
    catch (e) { console.error('[phoneNudge]', tid, e && e.message); out.push({ tournamentId: tid, error: e && e.message }); }
  }
  return out;
}

module.exports = { runPhoneNudge, runOne, loadProfiles, loadWaves, loadAttempts, ensureLeva1, LEVA1, DEFAULTS, DEFAULT_TOURNAMENTS };
