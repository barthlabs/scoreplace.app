/* BACKFILL — o rastro de W.O. passa a guardar UID (`woSubstituteForUid`).
 *
 * ORDEM DO DONO (24/ago/2026): _"sempre uid porra. nunca por nome caralho."_
 *
 * `woSubstituteFor` (quem a pessoa substituiu) nasceu guardando NOME. Isso obrigava a
 * LEITURA a reconverter nome→uid toda vez — e a conversão falha exatamente quando mais
 * importa: o save STRIPPA o nome de toda entrada com uid, e o marcador de W.O. da rodada
 * (a outra ponte) SAI quando a pessoa volta pra lista de espera (2.0.57). Foi assim que a
 * Denise Mamesso sumiu do histórico do R1 Grupo A: a cadeia Denise → Carol → Karla parava
 * na Carol porque o nome dela não resolvia pra uid nenhum.
 *
 * A v2.0.58 grava `woSubstituteForUid` em todo W.O. novo. Este script converte o que JÁ
 * está gravado, pra que o histórico existente também pare de depender de nome.
 *
 * Como resolve o uid (uid-first, nome só como ponte de leitura ÚNICA, na entrada):
 *   1. marcador de W.O. da rodada cujo `p1` é o nome do ausente → `p1Uid`/`team1Uids[0]`;
 *   2. estado do grupo (`woAbsent` === nome) → `woAbsentUid`;
 *   3. não resolveu → NÃO grava nada (quem não tem uid é jogador fictício, e ali o nome
 *      é a única identidade que existe — a ressalva do próprio dono).
 *
 * Grava com precondição `currentDocument.updateTime`: se alguém escrever no meio (torneio
 * ao vivo), a escrita ABORTA em vez de sobrescrever.
 *
 * Uso: node scripts/backfill-wo-substitute-uid.js            (dry-run)
 *      node scripts/backfill-wo-substitute-uid.js --apply    (grava)
 *      SP_TID=<id> node scripts/backfill-wo-substitute-uid.js
 */
const { execSync } = require('child_process');

const TID = process.env.SP_TID || 'tour_1780009816637';
const PROJ = 'scoreplace-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;
const APPLY = process.argv.includes('--apply');
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

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
  console.log(`torneio: ${t.name} · updateTime: ${updateTime}`);

  // ponte nome→uid, montada UMA vez, das fontes que carregam uid de verdade
  const porMarcador = {}, porEstado = {};
  (t.rounds || []).forEach((r) => {
    ((r && r.matches) || []).forEach((m) => {
      if (!m || !m.isSitOut || m.sitOutReason !== 'wo' || !m.p1) return;
      const u = (Array.isArray(m.team1Uids) && m.team1Uids[0]) || m.p1Uid || null;
      if (u && !porMarcador[m.p1]) porMarcador[m.p1] = String(u);
    });
    ((r && r.monarchGroups) || []).forEach((g) => {
      if (g && g.woAbsent && g.woAbsentUid && !porEstado[g.woAbsent]) porEstado[g.woAbsent] = String(g.woAbsentUid);
    });
  });
  (t.groups || []).forEach((g) => {
    if (g && g.woAbsent && g.woAbsentUid && !porEstado[g.woAbsent]) porEstado[g.woAbsent] = String(g.woAbsentUid);
  });

  const listas = ['participants', 'standbyParticipants', 'waitlist'];
  const mudancas = [];
  listas.forEach((nomeLista) => {
    const arr = Array.isArray(t[nomeLista]) ? t[nomeLista] : [];
    arr.forEach((p, i) => {
      if (!p || typeof p !== 'object') return;
      if (!p.woSubstituteFor || p.woSubstituteForUid) return;
      const alvo = p.woSubstituteFor;
      const uid = porMarcador[alvo] || porEstado[alvo] || null;
      mudancas.push({ lista: nomeLista, i, quem: p.uid || '(sem uid)', alvo, uid, fonte: porMarcador[alvo] ? 'marcador' : (porEstado[alvo] ? 'estado do grupo' : '—') });
      if (uid) p.woSubstituteForUid = uid;
    });
  });

  console.log(`\nrastros sem uid: ${mudancas.length}`);
  mudancas.forEach((c) => {
    console.log(`  [${c.lista}] ${c.quem} substituiu ${JSON.stringify(c.alvo)} → ${c.uid ? c.uid + ' (' + c.fonte + ')' : 'NÃO RESOLVEU (fictício? fica só o nome)'}`);
  });
  const resolvidos = mudancas.filter((c) => c.uid).length;
  console.log(`\nresolvidos: ${resolvidos} · sem uid (ficam como estão): ${mudancas.length - resolvidos}`);

  if (!resolvidos) { console.log('\nnada a gravar.'); return; }
  if (!APPLY) { console.log('\n(dry-run — rode com --apply pra gravar)'); return; }

  const fields = {};
  listas.forEach((nomeLista) => { if (Array.isArray(t[nomeLista])) fields[nomeLista] = toF(t[nomeLista]); });
  const hist = Array.isArray(t.history) ? t.history.slice() : [];
  hist.push({ at: new Date().toISOString(), message: `Backfill 2.0.58: rastro de W.O. passa a guardar uid (woSubstituteForUid) em ${resolvidos} entrada(s).` });
  fields.history = toF(hist);

  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const url = `${BASE}/tournaments/${TID}?${mask}&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
  const w = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!w.ok) { console.error('PATCH falhou:', w.status, await w.text()); process.exit(1); }
  console.log(`\n✓ gravado — ${resolvidos} rastro(s) agora por uid.`);
})();
