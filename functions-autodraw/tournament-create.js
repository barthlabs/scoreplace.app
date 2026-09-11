'use strict';
const { createHash } = require('crypto');
const WINDOW_MS = 24 * 60 * 60 * 1000;
const INTERNAL = new Set(['__proto__', 'prototype', 'constructor', 'matches', 'rounds', 'participants',
  'standbyParticipants', 'waitlist', 'memberUids', 'adminUids', 'coHosts', 'creatorUid', 'organizerUid',
  'isSandbox', '_semPesados', 'pendingDraw', 'results', 'history', 'winner', 'playerUids']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => {
    out[key] = canonical(value[key]); return out;
  }, {});
  return value;
}
function checkNested(value, fail) {
  if (!value || typeof value !== 'object') return;
  Object.keys(value).forEach(key => {
    if (INTERNAL.has(key) || (key.startsWith('_') && !['_intervalAuto', '_scoreBy'].includes(key))) fail('invalid-argument', 'Estado de execução não pertence à configuração.');
    checkNested(value[key], fail);
  });
}
// Dependências injetadas: este é o handler real, também executado pelos testes.
function makeCreateTournament({ db, HttpsError, FieldValue, fields, cloneConfig, compile, boundary, readTournament, now = Date.now }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  return async function createTournament(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail('unauthenticated', 'Entre na sua conta para criar um torneio.');
    const input = request.data || {}, id = input.tournamentId;
    const match = typeof id === 'string' && /^tour_(\d{13})_([a-f0-9]{32})$/.exec(id);
    const clock = now(), iso = new Date(clock).toISOString();
    // O instante faz parte do ID: renovar a validade exige UMA NOVA intenção/ID.
    // Recibo expirado/removido nunca permite ressuscitar o ID antigo.
    if (!match || Number(match[1]) > clock + 60000 || clock - Number(match[1]) > WINDOW_MS) {
      fail('invalid-argument', 'Pedido de criação inválido ou expirado. Abra uma nova criação.');
    }
    const raw = input.config;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('invalid-argument', 'Configuração inválida.');
    checkNested(raw, fail);
    const config = {};
    Object.keys(raw).forEach(key => {
      if (!fields.has(key) || key === 'phases' || key === 'ligaRRSchedule') fail('invalid-argument', 'Campo de criação não permitido: ' + key);
      config[key] = cloneConfig(raw[key]);
    });
    checkNested(config, fail);
    if (typeof config.name !== 'string' || !config.name.trim() || config.name.length > 240 ||
        typeof config.sport !== 'string' || !config.sport.trim() || config.sport.length > 120 ||
        typeof config.format !== 'string' || !config.format.trim()) fail('invalid-argument', 'Informe nome, modalidade e formato.');
    if (Buffer.byteLength(JSON.stringify(config)) > 96 * 1024) fail('invalid-argument', 'Configuração grande demais.');
    const hash = createHash('sha256').update(JSON.stringify(canonical(config))).digest('hex');
    const ref = db.collection('tournaments').doc(id);
    const receipt = db.collection('tournamentCreationRequests').doc(id);
    const profileRef = db.collection('users').doc(uid);
    return db.runTransaction(async tx => {
      const prior = await tx.get(receipt);
      const snap = await tx.get(ref);
      if (prior.exists) {
        const accepted = prior.data();
        if (accepted.uid !== uid || accepted.hash !== hash) fail('already-exists', 'Este pedido já foi usado para outra criação.');
        if (!snap.exists) fail('not-found', 'Este torneio já foi apagado.');
        const tournament = await readTournament(tx, ref, id);
        return { ok: true, changed: false, tournament };
      }
      if (snap.exists) fail('already-exists', 'Este identificador já pertence a outro torneio.');
      const profile = await tx.get(profileRef);
      const user = profile.exists ? profile.data() : {};
      const token = request.auth.token || {};
      const email = token.email_verified === true ? String(token.email || '') : '';
      const t = Object.assign({}, config);
      if (config.fmt2) {
        const out = compile(config.fmt2, { sport: t.sport, resultEntry: t.resultEntry || ['organizer'], lateEnrollment: t.lateEnrollment, newMatchups: t.newMatchups });
        Object.assign(t, out.topLevel);
        t.phases = out.phases; t.fmt2 = out.cfg;
        if (Array.isArray(config.roundBounds) && t.phases[0]) t.phases[0].roundBounds = config.roundBounds;
        const lastBounds = config.fmt2.eliminatoria && config.fmt2.eliminatoria.roundBounds;
        if (Array.isArray(lastBounds) && t.phases.length > 1) t.phases[t.phases.length - 1].roundBounds = lastBounds;
      }
      Object.assign(t, { id, name: config.name.trim(), status: 'open', storageCanonico: true,
        creatorUid: uid, organizerUid: uid, organizerId: uid, creatorEmail: email, organizerEmail: email,
        organizerName: String(user.displayName || token.name || 'Organizador'), coHosts: [],
        participants: [], standbyParticipants: [], matches: [], rounds: [], groups: [],
        currentPhaseIndex: 0, createdAt: iso, updatedAt: iso,
        history: [{ date: iso, message: 'Torneio Criado' }] });
      const result = boundary(t);
      // Documento inteiro vazio, preservando o contrato atual. Criação dividida é outra migração.
      tx.create(ref, Object.assign({}, result.persist, { _nascidoEm: FieldValue.serverTimestamp() }));
      tx.create(receipt, { uid, hash, expiresAt: Number(match[1]) + WINDOW_MS + 60000 });
      return { ok: true, changed: true, tournament: result.clean };
    });
  };
}
module.exports = { makeCreateTournament, WINDOW_MS };
