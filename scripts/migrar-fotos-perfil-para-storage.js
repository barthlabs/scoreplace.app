#!/usr/bin/env node
/* TIRA A FOTO DE PERFIL DE DENTRO DO DOC DO USUÁRIO E PÕE NO STORAGE.
 *
 * POR QUÊ (medido em 18/ago/2026): `users.photoURL` guardava base64 e somava 1.735,6 KB
 * em 22 perfis — 29% do peso da coleção `users`, com um doc em 133 KB. É a MESMA classe
 * de erro do torneio (arquivo dentro de registro quente), numa instância maior: `users` é
 * a coleção mais lida do app, porque a hidratação de perfil busca dezenas de docs por vez
 * (`documentId() in [...]`) e cada um arrastava a foto inteira junto.
 * O campo já se chamava `photoURL`; passa a ser uma URL de verdade.
 *
 * ⚠️ QUEM LÊ NÃO MUDA. `photoURL` sempre foi consumido como `<img src>`, e `src` aceita
 * dataURL e https igualmente — por isso esta migração é transparente pro app inteiro.
 *
 * Também migra `presences.photoURL`, que é CÓPIA denormalizada da mesma foto (378,7 KB
 * em 4 docs). Ali basta reapontar pra URL do dono, quando ele tiver uma.
 *
 * Uso:
 *   node scripts/migrar-fotos-perfil-para-storage.js           # DRY-RUN
 *   node scripts/migrar-fotos-perfil-para-storage.js --apply
 */
const { execSync } = require('child_process');
const crypto = require('crypto');

const PROJ = 'scoreplace-app';
const BUCKET = 'scoreplace-app.firebasestorage.app';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;
const APLICAR = process.argv.includes('--apply');
const CACHE = 'public, max-age=31536000, immutable';

let TK;
try { TK = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim(); }
catch (e) { console.error('✗ sem token do gcloud:', e.message); process.exit(1); }

async function api(url, opts) {
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + TK, ...(opts && opts.headers) } });
  const txt = await r.text();
  let body = {}; try { body = JSON.parse(txt); } catch (e) { body = { raw: txt.slice(0, 200) }; }
  if (!r.ok) throw new Error(r.status + ' ' + JSON.stringify(body).slice(0, 250));
  return body;
}
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

function decodifica(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1] || 'image/jpeg';
  const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'binary');
  const ext = (mime.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
  return { bytes, mime, ext };
}

async function sobe(uid, dataUrl) {
  const img = decodifica(dataUrl);
  if (!img || !img.bytes.length) return null;
  const hash = crypto.createHash('sha256').update(img.bytes).digest('hex').slice(0, 12);
  const caminho = `users/${uid}/photo-${hash}.${img.ext}`;
  const token = crypto.randomUUID();
  const u = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o`);
  u.searchParams.set('uploadType', 'multipart');
  u.searchParams.set('name', caminho);
  const meta = { name: caminho, contentType: img.mime, cacheControl: CACHE,
    metadata: { firebaseStorageDownloadTokens: token } };
  const lim = '===sp' + crypto.randomBytes(8).toString('hex') + '===';
  const corpo = Buffer.concat([
    Buffer.from(`--${lim}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`),
    Buffer.from(`--${lim}\r\nContent-Type: ${img.mime}\r\n\r\n`), img.bytes,
    Buffer.from(`\r\n--${lim}--\r\n`),
  ]);
  await api(u.toString(), { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${lim}` }, body: corpo });
  return { url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(caminho)}?alt=media&token=${token}`, bytes: img.bytes.length };
}

async function lerTudo(col) {
  let docs = [], t = null;
  do {
    const u = new URL(`${FS}/${col}`);
    u.searchParams.set('pageSize', '100');
    if (t) u.searchParams.set('pageToken', t);
    const p = await api(u.toString());
    docs = docs.concat(p.documents || []);
    t = p.nextPageToken || null;
  } while (t);
  return docs;
}

async function gravaCampo(col, id, campo, valor) {
  const u = new URL(`${FS}/${col}/${encodeURIComponent(id)}`);
  u.searchParams.append('updateMask.fieldPaths', campo);
  await api(u.toString(), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [campo]: { stringValue: valor } } }),
  });
}

(async () => {
  console.log(APLICAR ? '▶ MODO GRAVAÇÃO\n' : '▶ DRY-RUN (nada é gravado — use --apply)\n');

  // ── users ────────────────────────────────────────────────────────────────
  const users = await lerTudo('users');
  const porUid = {};   // uid → URL nova (serve pra reapontar presences)
  let n = 0, peso = 0, erros = 0;
  for (const d of users) {
    const uid = d.name.split('/').pop();
    const v = d.fields && d.fields.photoURL && d.fields.photoURL.stringValue;
    if (!v || !v.startsWith('data:')) continue;
    n++; peso += v.length;
    const nome = ((d.fields.displayName && d.fields.displayName.stringValue) || uid).slice(0, 28);
    console.log(`• ${nome.padEnd(28)} ${kb(v.length).padStart(10)}`);
    if (!APLICAR) continue;
    try {
      const r = await sobe(uid, v);
      if (!r) { console.error('   ✗ não decodificou'); erros++; continue; }
      await gravaCampo('users', uid, 'photoURL', r.url);
      porUid[uid] = r.url;
      console.log(`   ✓ ${kb(v.length)} → ${kb(r.bytes)} binário no Storage`);
    } catch (e) { erros++; console.error(`   ✗ ${uid}: ${e.message}`); }
  }
  console.log(`\nusers com foto base64: ${n}   peso: ${kb(peso)}   erros: ${erros}`);

  // ── presences (cópia denormalizada da MESMA foto) ─────────────────────────
  const pres = await lerTudo('presences');
  let np = 0, pesoP = 0, semDono = 0;
  for (const d of pres) {
    const id = d.name.split('/').pop();
    const f = d.fields || {};
    const v = f.photoURL && f.photoURL.stringValue;
    if (!v || !v.startsWith('data:')) continue;
    np++; pesoP += v.length;
    const uid = (f.uid && f.uid.stringValue) || '';
    if (!APLICAR) continue;
    try {
      // reaponta pra foto do DONO quando existir; senão sobe uma cópia própria
      let url = porUid[uid];
      if (!url) { const r = await sobe(uid || id, v); url = r && r.url; }
      if (!url) { semDono++; continue; }
      await gravaCampo('presences', id, 'photoURL', url);
    } catch (e) { erros++; console.error(`   ✗ presence ${id}: ${e.message}`); }
  }
  console.log(`presences com foto base64: ${np}   peso: ${kb(pesoP)}` + (semDono ? `   sem resolver: ${semDono}` : ''));

  console.log(`\ntotal tirado dos docs: ${kb(peso + pesoP)}`);
  if (!APLICAR) console.log('(dry-run — rode com --apply pra gravar)');
  process.exit(erros ? 1 : 0);
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });
