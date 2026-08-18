#!/usr/bin/env node
/* TIRA A IMAGEM DE DENTRO DO DOC DO TORNEIO E PÕE NO STORAGE.
 *
 * POR QUÊ (medido nos documentos de produção, 18/ago/2026): `logoData`+`coverPhotoData`
 * em base64 eram 62% do peso de TODOS os torneios; num doc, 305 KB de 311 KB (98%), com
 * as fases ocupando 1,3 KB. O doc servia ao mesmo tempo de ARQUIVO e de REGISTRO QUENTE.
 *
 * O QUE FAZ, por torneio com imagem:
 *   1. decodifica o dataURL base64 → bytes;
 *   2. sobe pro bucket em `tournaments/{id}/logo-{hash}.{ext}`;
 *   3. grava `logoUrl`/`coverUrl` (string curta) no doc do torneio;
 *   4. SÓ ENTÃO remove `logoData`/`coverPhotoData` do doc.
 * Essa ordem é o que torna o passo recuperável: se algo falhar no meio, a base64 ainda
 * está lá. O delete é sempre o último.
 *
 * ⚠️ O NOME CARREGA O HASH DO CONTEÚDO de propósito. Assim a URL é IMUTÁVEL e pode ir com
 * `Cache-Control: immutable` por um ano — trocar a capa gera outro nome, outra URL, e
 * ninguém fica preso a uma imagem velha em cache. Com nome fixo (`logo.png`), immutable
 * seria uma armadilha.
 *
 * Uso:
 *   node scripts/migrar-imagens-para-storage.js           # DRY-RUN
 *   node scripts/migrar-imagens-para-storage.js --apply   # grava
 *
 * Requer: gcloud auth print-access-token.
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
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TK, ...(opts && opts.headers) },
  });
  const txt = await r.text();
  let body = {};
  try { body = JSON.parse(txt); } catch (e) { body = { raw: txt.slice(0, 200) }; }
  if (!r.ok) throw new Error(r.status + ' ' + JSON.stringify(body).slice(0, 300));
  return body;
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';

// "data:image/png;base64,AAAA" → { bytes, mime, ext }
function decodifica(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1] || 'image/jpeg';
  const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'binary');
  const ext = (mime.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
  return { bytes, mime, ext };
}

async function sobe(tid, tipo, dataUrl) {
  const img = decodifica(dataUrl);
  if (!img || !img.bytes.length) return null;
  const hash = crypto.createHash('sha256').update(img.bytes).digest('hex').slice(0, 12);
  const caminho = `tournaments/${tid}/${tipo}-${hash}.${img.ext}`;
  const token = crypto.randomUUID();

  const u = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o`);
  u.searchParams.set('uploadType', 'multipart');
  u.searchParams.set('name', caminho);

  const meta = {
    name: caminho,
    contentType: img.mime,
    cacheControl: CACHE,
    // é este campo que faz a URL pública do Firebase funcionar (?alt=media&token=)
    metadata: { firebaseStorageDownloadTokens: token },
  };
  const limite = '===sp' + crypto.randomBytes(8).toString('hex') + '===';
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`),
    Buffer.from(`--${limite}\r\nContent-Type: ${img.mime}\r\n\r\n`),
    img.bytes,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  await api(u.toString(), {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
    body: corpo,
  });
  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(caminho)}?alt=media&token=${token}`,
    bytes: img.bytes.length,
  };
}

(async () => {
  let docs = [], pageToken = null;
  do {
    const u = new URL(FS + '/tournaments');
    u.searchParams.set('pageSize', '50');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const page = await api(u.toString());
    docs = docs.concat(page.documents || []);
    pageToken = page.nextPageToken || null;
  } while (pageToken);

  console.log(`torneios lidos: ${docs.length}`);
  console.log(APLICAR ? '\n▶ MODO GRAVAÇÃO\n' : '\n▶ DRY-RUN (nada é gravado — use --apply)\n');

  let tocados = 0, base64Removida = 0, erros = 0;

  for (const d of docs) {
    const id = d.name.split('/').pop();
    const f = d.fields || {};
    const logo = f.logoData && f.logoData.stringValue;
    const capa = f.coverPhotoData && f.coverPhotoData.stringValue;
    if (!logo && !capa) continue;
    tocados++;
    const nome = ((f.name && f.name.stringValue) || id).slice(0, 34);
    const peso = (logo ? logo.length : 0) + (capa ? capa.length : 0);
    console.log(`• ${nome.padEnd(34)} ${kb(peso).padStart(10)} → storage`);

    if (!APLICAR) continue;

    try {
      const campos = {};
      const mascara = [];
      if (logo) {
        const r = await sobe(id, 'logo', logo);
        if (r) { campos.logoUrl = { stringValue: r.url }; mascara.push('logoUrl'); }
      }
      if (capa) {
        const r = await sobe(id, 'cover', capa);
        if (r) { campos.coverUrl = { stringValue: r.url }; mascara.push('coverUrl'); }
      }
      if (!mascara.length) { console.error('   ✗ nada subiu; doc intocado'); erros++; continue; }

      // (3) grava as URLs ANTES de remover a base64
      const u1 = new URL(`${FS}/tournaments/${encodeURIComponent(id)}`);
      mascara.forEach((k) => u1.searchParams.append('updateMask.fieldPaths', k));
      await api(u1.toString(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: campos }),
      });

      // (4) só agora remove a base64: campo NA MÁSCARA e AUSENTE do corpo = apagado
      const u2 = new URL(`${FS}/tournaments/${encodeURIComponent(id)}`);
      if (logo) u2.searchParams.append('updateMask.fieldPaths', 'logoData');
      if (capa) u2.searchParams.append('updateMask.fieldPaths', 'coverPhotoData');
      await api(u2.toString(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {} }),
      });
      base64Removida++;
      console.log(`   ✓ ${mascara.join(' + ')} · base64 removida (−${kb(peso)} no doc)`);
    } catch (e) {
      erros++;
      console.error(`   ✗ ${id}: ${e.message}`);
      console.error('     (a base64 do doc NÃO foi tocada — o delete é sempre o último passo)');
    }
  }

  console.log(`\ncom imagem: ${tocados}   migrados: ${base64Removida}   erros: ${erros}`);
  if (!APLICAR) console.log('(dry-run — rode com --apply pra gravar)');
  process.exit(erros ? 1 : 0);
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });
