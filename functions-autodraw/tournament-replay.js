'use strict';
const KEYS = new Set(['v','truncated','totalPoints','useSets','isFixedSet','countingType','scoring','so','serveSkipped','points']);
function validateReplay(raw, HttpsError) {
  const fail = () => { throw new HttpsError('invalid-argument', 'Replay inválido ou grande demais.'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !KEYS.has(k))) fail();
  if (![1,2].includes(raw.v) || !Array.isArray(raw.points) || !raw.points.length || raw.points.length > 600) fail();
  if (!Number.isSafeInteger(raw.totalPoints) || raw.totalPoints < raw.points.length) fail();
  function check(value, depth) {
    if (depth > 5) fail();
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail(); return; }
    if (typeof value === 'string') { if (value.length > 512) fail(); return; }
    if (typeof value !== 'object') fail();
    const keys = Object.keys(value);
    if (keys.length > (Array.isArray(value) ? 600 : 32)) fail();
    keys.forEach(k => { if (['__proto__','constructor','prototype'].includes(k)) fail(); check(value[k], depth + 1); });
  }
  check(raw, 0);
  raw.points.forEach(p => {
    if (!p || ![1,2].includes(p.w)) fail();
    for (const key of ['a','b','g1','g2','si']) {
      if (p[key] != null && (!Number.isSafeInteger(p[key]) || p[key] < 0)) fail();
    }
    if (p.tb != null && ![0,1].includes(p.tb)) fail();
    if (p.sv != null && ![1,2].includes(p.sv)) fail();
    if (p.t != null && typeof p.t !== 'string' && typeof p.t !== 'number') fail();
  });
  if (raw.so != null && (!Array.isArray(raw.so) || raw.so.length > 4 || raw.so.some(s => !s || ![1,2].includes(s.t) || (s.n != null && typeof s.n !== 'string')))) fail();
  if (raw.scoring != null && (typeof raw.scoring !== 'object' || Array.isArray(raw.scoring))) fail();
  const text = JSON.stringify(raw);
  if (Buffer.byteLength(text) > 192 * 1024) fail();
  return JSON.parse(text);
}
function makeSaveTournamentReplay({ db, HttpsError, readTournament, findMatch, isAdmin, playerUids, buildMirror, now = Date.now }) {
  return async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
    const data = request.data || {};
    const validId = x => typeof x === 'string' && x.length > 0 && x.length <= 180 && !x.includes('/');
    if (!validId(data.tournamentId) || !validId(data.matchId)) throw new HttpsError('invalid-argument', 'Jogo inválido.');
    const replay = validateReplay(data.replay, HttpsError), iso = new Date(now()).toISOString();
    const sandbox = data.sandbox === true;
    const ref = db.collection(sandbox ? 'sandboxes' : 'tournaments').doc(data.tournamentId);
    return db.runTransaction(async tx => {
      const t = await readTournament(tx, ref, data.tournamentId);
      if (!t) throw new HttpsError('not-found', 'Torneio não encontrado.');
      if (sandbox && t.sandboxOwnerUid !== uid) throw new HttpsError('permission-denied', 'Sandbox de outra pessoa.');
      const m = findMatch(t, data.matchId);
      if (!m) throw new HttpsError('not-found', 'Jogo não encontrado.');
      if (!sandbox && !isAdmin(t, uid) && !playerUids(m).includes(uid)) throw new HttpsError('permission-denied', 'Só quem joga ou organiza pode salvar o replay.');
      const resultRef = ref.collection(sandbox ? 'resultsSandbox' : 'results').doc(data.matchId);
      const snap = await tx.get(resultRef);
      const result = snap.exists ? snap.data() : buildMirror(t, m, data.tournamentId, iso);
      if (!result) throw new HttpsError('failed-precondition', 'Projeção do jogo indisponível.');
      if (JSON.stringify(result.replay) === JSON.stringify(replay)) return { ok: true, changed: false, replay };
      // Só o replay muda; placar, roster e proposta concorrentes permanecem intactos.
      if (snap.exists) tx.update(resultRef, { replay }); else tx.create(resultRef, Object.assign({}, result, { replay }));
      return { ok: true, changed: true, replay };
    });
  };
}
module.exports = { makeSaveTournamentReplay, validateReplay };
