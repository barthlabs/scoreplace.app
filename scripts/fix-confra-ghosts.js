/* REPARO PONTUAL — Confra BT Alta da Clínica 2026 (tour_1780009816637)
 *
 * Move pra LISTA DE ESPERA (standbyParticipants) quem se inscreveu DEPOIS do sorteio e
 * ficou de fantasma em participants: fora de todo grupo Rei/Rainha, fora de toda folga
 * (isSitOut) e fora dos três storages de espera.
 *
 * Regras deste script:
 *   • quem decide "está jogando" é window._isPlayingCurrentPhase (waitlist-core, o MESMO
 *     código do app) e quem recomputa memberUids é functions/enroll-core.computeMemberUids
 *     (o MESMO da Cloud Function). Zero lógica paralela.
 *   • INATIVOS (ligaActive:false) NÃO são tocados — ordem explícita do dono.
 *   • grava com precondição `currentDocument.updateTime`: se alguém escrever no meio
 *     (inscrição ao vivo), a escrita ABORTA em vez de sobrescrever.
 *
 * Uso: node scripts/fix-confra-ghosts.js            (dry-run)
 *      node scripts/fix-confra-ghosts.js --apply    (grava)
 */
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
const { computeMemberUids } = require(path.join(ROOT, 'functions', 'enroll-core.js'));

const TID = process.env.SP_TID || 'tour_1780009816637';
const PROJ = 'scoreplace-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;
const APPLY = process.argv.includes('--apply');
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

// ── conversão Firestore REST ↔ JS ───────────────────────────────────────────
function fromF(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromF);
  if ('mapValue' in v) {
    const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fromF(x); });
    return o;
  }
  return null;
}
function toF(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') {
    const f = {}; Object.entries(v).forEach(([k, x]) => { f[k] = toF(x); });
    return { mapValue: { fields: f } };
  }
  return { nullValue: null };
}

(async () => {
  const t0 = token();
  const res = await fetch(`${BASE}/tournaments/${TID}`, { headers: { Authorization: `Bearer ${t0}` } });
  if (!res.ok) throw new Error('GET falhou: ' + res.status);
  const doc = await res.json();
  const t = {}; Object.entries(doc.fields || {}).forEach(([k, v]) => { t[k] = fromF(v); });
  const updateTime = doc.updateTime;

  const parts = Array.isArray(t.participants) ? t.participants : [];
  const drawAt = t.lastAutoDrawAt || '';
  console.log(`torneio: ${t.name}`);
  console.log(`sorteio: ${drawAt} · inscritos: ${parts.length} · updateTime: ${updateTime}`);

  const fantasmas = parts.filter((p) => {
    if (!p || typeof p !== 'object' || !p.uid) return false;
    if (p.ligaActive === false) return false;              // INATIVO não se toca
    if (win._isPlayingCurrentPhase(t, p)) return false;     // tem jogo (ou folga) na rodada
    return !!(p.addedAt && drawAt && p.addedAt > drawAt);   // entrou DEPOIS do sorteio
  });

  // rede: quem tem FOLGA na rodada não é fantasma (o _isPlayingCurrentPhase ignora folga
  // de propósito, pro caso da reativação) — aqui a folga significa "o sorteio já o tratou".
  const comFolga = new Set();
  (t.rounds || []).forEach((r) => (r.matches || []).forEach((m) => {
    if (m && m.isSitOut) { if (m.p1Uid) comFolga.add(m.p1Uid); (m.team1Uids || []).forEach((u) => comFolga.add(u)); }
  }));
  const alvos = fantasmas.filter((p) => !comFolga.has(p.uid));

  console.log(`\nfantasmas encontrados: ${alvos.length}`);
  alvos.forEach((p) => console.log(`  • ${p.uid} · enrollSeq ${p.enrollSeq == null ? '(sem número)' : p.enrollSeq} · addedAt ${p.addedAt}`));
  if (!alvos.length) { console.log('\nnada a fazer.'); return; }

  const alvoUids = new Set(alvos.map((p) => p.uid));
  const novoParts = parts.filter((p) => !(p && p.uid && alvoUids.has(p.uid)));
  const novoStandby = (Array.isArray(t.standbyParticipants) ? t.standbyParticipants : []).concat(alvos);
  const novoDoc = Object.assign({}, t, { participants: novoParts, standbyParticipants: novoStandby });
  const novoMember = computeMemberUids(novoDoc);
  const perdidos = (t.memberUids || []).filter((u) => novoMember.indexOf(u) === -1);

  console.log(`\nparticipants: ${parts.length} → ${novoParts.length}`);
  console.log(`espera:       ${(t.standbyParticipants || []).length} → ${novoStandby.length}`);
  console.log(`memberUids:   ${(t.memberUids || []).length} → ${novoMember.length}  (perdidos: ${perdidos.length})`);
  alvos.forEach((p) => console.log(`  memberUids mantém ${p.uid}? ${novoMember.indexOf(p.uid) !== -1}`));
  console.log(`espera canônica depois: ${win._getWaitlist(novoDoc).length} pessoa(s)`);

  if (perdidos.length) throw new Error('ABORTA: memberUids ENCOLHERIA — ' + perdidos.join(','));
  alvos.forEach((p) => { if (novoMember.indexOf(p.uid) === -1) throw new Error('ABORTA: ' + p.uid + ' sairia do memberUids'); });

  if (!APPLY) { console.log('\n(dry-run — rode com --apply pra gravar)'); return; }

  const body = {
    writes: [{
      update: {
        name: `projects/${PROJ}/databases/(default)/documents/tournaments/${TID}`,
        fields: {
          participants: toF(novoParts),
          standbyParticipants: toF(novoStandby),
          memberUids: toF(novoMember),
        },
      },
      updateMask: { fieldPaths: ['participants', 'standbyParticipants', 'memberUids'] },
      currentDocument: { updateTime },   // trava contra escrita concorrente
    }],
  };
  const w = await fetch(`${BASE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t0}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await w.json();
  if (!w.ok) throw new Error('ESCRITA FALHOU (' + w.status + '): ' + JSON.stringify(out));
  console.log('\n✅ gravado:', JSON.stringify(out.writeResults || out));
})().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
