#!/usr/bin/env node
/* Recuperação excepcional do Jogo 163 do Confra.
 * Evidência: notificação de Karla Lia com 0-6, 2-6. O resultado é definitivo e não
 * gera pendência nem nova notificação. Use --aplicar após o dry-run.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
require('./preflight-alvo').preflight('correcao-confra-jogo-163', 'scoreplace-app');
const APLICAR = process.argv.includes('--aplicar');
const TID = 'tour_1780009816637';
const MID = 'ph-tour_1780009816637-1-silver-VC-R1-P9';
const ENVELOPE = MID;
const P1 = 'Cynthia Calabrese / Marjorie Cilone';
const P2 = 'Karla Lia / Bruna Verga Sá';
const sets = [{ gamesP1: 0, gamesP2: 6 }, { gamesP1: 2, gamesP2: 6 }];
const fail = (m) => { throw new Error('ABORTADO: ' + m); };
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function campos(m) { const v = (x) => x === undefined ? null : x; return { sets: v(m.sets), setsWonP1: v(m.setsWonP1), setsWonP2: v(m.setsWonP2), scoreP1: v(m.scoreP1), scoreP2: v(m.scoreP2), winner: v(m.winner), pendingResult: m.pendingResult || null }; }
function conferir(m) {
  if (!m || norm(m.p1) !== norm(P1) || norm(m.p2) !== norm(P2)) fail('alvo divergente: ' + JSON.stringify(m && { p1: m.p1, p2: m.p2 }));
}
(async () => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore(), base = db.collection('tournaments').doc(TID);
  const matchRef = base.collection('matches').doc(ENVELOPE), resultRef = base.collection('results').doc(MID);
  const before = await matchRef.get();
  if (!before.exists) fail('envelope do jogo não existe');
  const old = (before.data() || {}).jogo || {}; conferir(old);
  console.log('▸ alvo: Jogo 163, ' + P1 + ' × ' + P2);
  console.log('  antes: ' + JSON.stringify(campos(old)));
  if (!APLICAR) { console.log('✓ DRY-RUN; rode com --aplicar para gravar 0-6, 2-6 aprovado.'); return; }
  const at = Date.now(), iso = new Date(at).toISOString();
  const rs = await resultRef.get();
  {
    const env = before.data() || {}, m = Object.assign({}, env.jogo || {}); conferir(m);
    const final = { sets, setsWonP1: 0, setsWonP2: 2, scoreP1: 0, scoreP2: 2,
      totalGamesP1: 2, totalGamesP2: 12, winner: m.p2, winnerUids: Array.isArray(m.team2Uids) ? m.team2Uids : null,
      draw: false, resultAt: at, startedAt: m.startedAt || at };
    delete m.pendingResult;
    Object.assign(m, final);
    const mirror = Object.assign({}, rs.exists ? rs.data() : {}, final, { matchId: MID, tournamentId: TID, p1: m.p1, p2: m.p2, updatedAt: iso });
    delete mirror.pendingResult;
    const batch = db.batch();
    batch.update(matchRef, { jogo: m });
    batch.set(resultRef, mirror);
    batch.set(base.collection('scoreAudit').doc(), { schema: 1, kind: 'score-recovery', tournamentId: TID, matchId: MID,
      at: iso, source: 'verified-notification', approved: true, before: campos(env.jogo || {}), after: campos(m),
      evidence: 'Karla Lia lançou: Cynthia Calabrese / Marjorie Cilone 0 2 vs Karla Lia / Bruna Verga Sá 6 6' });
    await batch.commit();
  }
  const [after, mirror] = await Promise.all([matchRef.get(), resultRef.get()]);
  const m = (after.data() || {}).jogo || {}; conferir(m);
  if (JSON.stringify(m.sets) !== JSON.stringify(sets) || m.winner !== P2 || m.pendingResult) fail('releitura não confirmou o resultado aprovado');
  if (JSON.stringify((mirror.data() || {}).sets) !== JSON.stringify(sets)) fail('espelho divergente');
  console.log('✓ Jogo 163 recuperado e relido: 0-6, 2-6; Karla Lia / Bruna Verga Sá venceu; sem pendência.');
})().catch((e) => { console.error('✗ ' + (e && e.message || e)); process.exit(1); });
