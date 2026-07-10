/**
 * strip-uid-names-migration.js  (ITEM 3 · Fase 4 · parte 2 — migração destrutiva)
 *
 * Remove os nomes GRAVADOS (name/displayName/p1Name/p2Name) das ENTRADAS de inscrição
 * (t.participants / t.standbyParticipants / t.waitlist) QUE TÊM uid — identidade = uid,
 * nome resolvido do perfil vivo. GUEST sem uid MANTÉM o nome (única identidade dele).
 * NÃO toca slots de partida (m.p1/m.p2), rounds, standings — só as entradas de inscrição.
 *
 * É a mesma lógica de window._stripStoredNamesForUidEntries (store.js, já deployada no
 * SAVE em v4.5.85) aplicada retroativamente aos docs existentes. Idempotente.
 *
 * PRÉ-REQUISITO: credencial admin (Application Default Credentials):
 *   gcloud auth application-default login
 *
 * USO (SEMPRE dry-run primeiro, SEMPRE staging antes de prod):
 *   node scripts/strip-uid-names-migration.js --project scoreplace-staging --dry
 *   node scripts/strip-uid-names-migration.js --project scoreplace-staging --dry --ids tour_A,tour_B,tour_C
 *   node scripts/strip-uid-names-migration.js --project scoreplace-staging --ids tour_A,tour_B,tour_C   (ESCREVE)
 *   node scripts/strip-uid-names-migration.js --project scoreplace-app --ids ...  (PROD — só depois de validar staging)
 *
 * Sem --ids processa TODOS os torneios (pede confirmação). Com --ids, só os listados.
 * --list  apenas lista os torneios (id · nome · nº entradas) pra você achar os 3 e sair.
 */
'use strict';
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  if (i === -1) return dflt;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}
const PROJECT = arg('--project', 'scoreplace-staging');
const DRY = process.argv.includes('--dry');
const LIST = process.argv.includes('--list');
const IDS = (typeof arg('--ids') === 'string') ? String(arg('--ids')).split(',').map(s => s.trim()).filter(Boolean) : null;

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

// ── MESMA lógica de _stripUidEntryNames (store.js v4.5.85) ─────────────────────
function stripEntry(p) {
  if (!p || typeof p !== 'object') return { entry: p, changed: false };
  const q = {}; for (const k in p) if (Object.prototype.hasOwnProperty.call(p, k)) q[k] = p[k];
  let changed = false;
  const del = (k) => { if (Object.prototype.hasOwnProperty.call(q, k)) { delete q[k]; changed = true; } };
  const isPair = !!(q.p1Uid || q.p2Uid || q.p1Name || q.p2Name);
  if (isPair) {
    if (q.p1Uid) del('p1Name');
    if (q.p2Uid) del('p2Name');
    if (q.p1Uid || q.p2Uid) { del('name'); del('displayName'); }
  } else if (q.uid) {
    del('name'); del('displayName');
  }
  if (Array.isArray(q.participants)) {
    q.participants = q.participants.map((s) => {
      if (s && typeof s === 'object' && s.uid) {
        const r = {}; for (const kk in s) if (Object.prototype.hasOwnProperty.call(s, kk)) r[kk] = s[kk];
        if (Object.prototype.hasOwnProperty.call(r, 'name') || Object.prototype.hasOwnProperty.call(r, 'displayName')) changed = true;
        delete r.name; delete r.displayName; return r;
      }
      return s;
    });
  }
  return { entry: q, changed };
}
function stripArray(arr) {
  if (!Array.isArray(arr)) return { out: arr, n: 0 };
  let n = 0;
  const out = arr.map((p) => { const r = stripEntry(p); if (r.changed) n++; return r.entry; });
  return { out, n };
}

async function main() {
  console.log(`\n[migration] projeto=${PROJECT} ${DRY ? '(DRY-RUN)' : '‼️ ESCRITA REAL'} ${IDS ? '· ids=' + IDS.join(',') : '· TODOS'}`);
  const col = db.collection('tournaments');
  const snap = IDS
    ? await db.getAll(...IDS.map((id) => col.doc(id)))
    : (await col.get()).docs;

  if (LIST) {
    snap.forEach((d) => { if (d.exists) { const t = d.data() || {}; console.log(`  ${d.id} · ${JSON.stringify(t.name || '')} · entradas=${(t.participants || []).length} standby=${(t.standbyParticipants || []).length} wait=${(t.waitlist || []).length}`); } });
    process.exit(0);
  }

  let totalDocs = 0, totalChanged = 0;
  for (const d of snap) {
    if (!d.exists) { console.log(`  ⚠️ ${d.id} não existe — pulado`); continue; }
    const t = d.data() || {};
    const P = stripArray(t.participants);
    const S = stripArray(t.standbyParticipants);
    const W = stripArray(t.waitlist);
    const changed = P.n + S.n + W.n;
    if (!changed) continue;
    totalDocs++; totalChanged += changed;
    console.log(`  ${d.id} · ${JSON.stringify(t.name || '')} → ${changed} entrada(s) limpa(s) [part:${P.n} standby:${S.n} wait:${W.n}]`);
    if (!DRY) {
      const upd = {};
      if (Array.isArray(t.participants)) upd.participants = P.out;
      if (Array.isArray(t.standbyParticipants)) upd.standbyParticipants = S.out;
      if (Array.isArray(t.waitlist)) upd.waitlist = W.out;
      await col.doc(d.id).update(upd);
    }
  }
  console.log(`\n[migration] ${DRY ? 'DRY: ' : ''}${totalDocs} torneio(s), ${totalChanged} entrada(s) ${DRY ? 'seriam limpas' : 'limpas'}.`);
  process.exit(0);
}
main().catch((e) => { console.error('[migration] FALHOU:', e && e.message); process.exit(1); });
